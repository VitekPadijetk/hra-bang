// Rozšíření Zlatá horečka (Gold Rush) – fáze 6: osm postav.
//
//   DON BELL      – „Na konci svého tahu otočí!: padne-li srdce nebo káro, hraje tah navíc."
//   DUTCH WILL    – „Lízne si 2 karty, 1 odhodí a vezme si 1 valoun."
//   JACKY MURIETA – „Ve svém tahu smí zaplatit 2 valouny a vystřelit 1 BANG! navíc."
//   JOSH McCLOUD  – „Smí si za 2 valouny líznout vrchní vybavení z balíčku."
//   MADAM YTO     – „Pokaždé, když je zahráno Pivo, lízne si 1 kartu z balíčku."
//   PRETTY LUZENA – „Jednou za tah smí koupit vybavení za cenu sníženou o 1."
//   RADDIE SNAKE  – „Ve svém tahu smí odhodit 1 valoun a líznout si 1 kartu (až 2×)."
//   SIMEON PICOS  – „Pokaždé, když ztratí 1 život, vezme si 1 valoun."
//
// Podklad: docs/zlata-horecka.md (Postavy + FAQ Q06, Q13), plán §5 a rozhodnutí
// R5 (trychtýř ztráty života) a R16 (sleva Pretty Luzeny se uplatní automaticky).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { waitingStatus, pendingActor } = require('../core/pending.js');
const { gearCostFor, jackyExtraBangs, raddieUsesLeft, joshMcCloudOk } = require('../core/goldRush.js');
const { bangLimitFree } = require('../core/playability.js');
const { GOLD_RUSH_CHARACTERS, GOLD_RUSH_READY } = require('../logic/entities.js');

before(() => { console.log = () => {}; });

const gearData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8')
);
const hnData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8')
);
const ZH_ON = { expansions: { zlata_horecka: true } };

function mkZH(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    return g;
}

let _gid = 63000;
function gearCard(effect) {
    const kind = gearData.find(k => k.effect === effect);
    return { id: _gid++, effect: kind.effect, name: kind.name, art: kind.art,
             border: kind.border, cost: kind.cost, text: kind.text || null };
}

// Polož konkrétní kartu navrch balíčku VYBAVENÍ (vrch = konec pole, jako u Deck).
function topGear(g, effect) {
    const c = gearCard(effect);
    g.gearDeck.push(c);
    return c;
}

// Zapni událost High Noonu (pro Žízeň a Město duchů u Dona Bella).
function hnEvent(g, key) {
    g.activeEvent = hnData.find(c => c.key === key);
}

// ── Data a zařazení do výběru ───────────────────────────────────────────────

test('postavy: osm jmen, všechny se 4 životy a všechny v characters.json', () => {
    const chars = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'characters.json'), 'utf8'));
    assert.equal(GOLD_RUSH_CHARACTERS.length, 8);
    assert.deepEqual(GOLD_RUSH_READY, GOLD_RUSH_CHARACTERS);
    const { baseHealthForCharacter } = require('../core/roles.js');
    GOLD_RUSH_CHARACTERS.forEach(name => {
        const row = chars.find(c => c.name === name);
        assert.ok(row, `${name} chybí v characters.json`);
        assert.ok(row.id >= 42 && row.id <= 49, `${name} má id mimo 42–49`);
        assert.equal(baseHealthForCharacter(name), 4, `${name} nemá 4 životy`);
    });
    // …a abecedně, protože portréty 042–049 se dodávají podle pořadí v characters.json.
    const ids = GOLD_RUSH_CHARACTERS.map(n => chars.find(c => c.name === n).id);
    assert.deepEqual(ids, [42, 43, 44, 45, 46, 47, 48, 49]);
});

test('postavy jsou ve výběru jen se zapnutým rozšířením', () => {
    const g = mkGame([{ role: 'Sheriff' }]);
    assert.equal(g._characterPool({}).includes('Don Bell'), false);
    assert.equal(g._characterPool(ZH_ON).includes('Don Bell'), true);
});

// ── Simeon Picos ────────────────────────────────────────────────────────────

test('Simeon Picos: valoun za KAŽDÝ ztracený život, včetně posledního', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Simeon Picos' },
                    { role: 'Outlaw' }], { current: 1 });
    g.handleDamage(0, 1);
    assert.equal(g.players[0].nuggets, 1);
    assert.equal(g.players[1].nuggets, 1, 'útočník má svůj valoun za způsobené zranění');
    // Poslední život: Boty a Talisman by se neuplatnily, Simeon ano (jeho text výjimku nemá).
    g.players[0].health = 1;
    g.handleDamage(0, 1);
    assert.equal(g.players[0].nuggets, 2);
});

test('Simeon Picos: valoun i mimo handleDamage (dynamit)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Simeon Picos' }, { role: 'Outlaw' }]);
    g.pendingDynamiteDamage = { playerIdx: 0, hitsLeft: 3 };
    g.phase = 'DYNAMITE_DAMAGE';
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].nuggets, 1);
});

// ── Pretty Luzena ───────────────────────────────────────────────────────────

test('Pretty Luzena: sleva 1 na PRVNÍ nákup v tahu, pak plná cena', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Pretty Luzena' }, { role: 'Outlaw' }]);
    const podkova = gearCard('ZH_PODKOVA');            // cena 2
    const pas = gearCard('ZH_NABOJOVY_PAS');           // cena 2
    g.gearRow = [podkova, pas, null];
    g.players[0].nuggets = 3;
    assert.equal(gearCostFor(g, 0, podkova), 1, 'zrcadlo hlásí sníženou cenu');
    assert.equal(g._gearCost(0, podkova), 1);

    assert.ok(g.gearBuy(0, 0));
    assert.equal(g.players[0].nuggets, 2, 'zaplatil 1 místo 2');
    assert.equal(gearCostFor(g, 0, pas), 2, 'druhý nákup už za plnou cenu');
    assert.ok(g.gearBuy(0, 1));
    assert.equal(g.players[0].nuggets, 0);
});

test('Pretty Luzena: karta za 1 valoun je s ní zadarmo a sleva se obnoví dalším tahem', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Pretty Luzena' }, { role: 'Outlaw' }]);
    g.gearRow = [gearCard('ZH_PANAK'), null, null];   // cena 1
    g.players[0].nuggets = 0;
    g.players[0].health = 2;
    assert.ok(g.gearBuy(0, 0), 'na kartu za 1 valoun jí stačí nula');
    g.turnId = 7;
    assert.equal(gearCostFor(g, 0, gearCard('ZH_PODKOVA')), 1, 'nový tah = nová sleva');
});

test('Pretty Luzena: sleva se nevztahuje na vynucené odhození cizího vybavení', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Pretty Luzena' }, { role: 'Outlaw' }]);
    g.players[1].gear = [gearCard('ZH_PODKOVA')];    // cena 2 → odhození za 3
    g.players[0].nuggets = 2;
    assert.equal(g.gearForceDiscard(0, 1, 0), null, 'na 3 valouny nemá');
    g.players[0].nuggets = 3;
    assert.ok(g.gearForceDiscard(0, 1, 0));
    assert.equal(g.players[0].nuggets, 0);
});

// ── Jacky Murieta ───────────────────────────────────────────────────────────

test('Jacky Murieta: 2 valouny = jeden BANG! navíc, a jde to opakovat', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Jacky Murieta' }, { role: 'Outlaw' }]);
    const me = g.players[0];
    me.nuggets = 5;
    me.bangsPlayedThisTurn = 1;
    assert.equal(bangLimitFree(g, me), false, 'limit je vyčerpaný');

    assert.equal(g.useJackyMurieta(0), true);
    assert.equal(me.nuggets, 3);
    assert.equal(jackyExtraBangs(g, me), 1);
    assert.equal(bangLimitFree(g, me), true);

    me.bangsPlayedThisTurn = 2;
    assert.equal(bangLimitFree(g, me), false);
    assert.equal(g.useJackyMurieta(0), true, 'smí to vícekrát za tah');
    assert.equal(bangLimitFree(g, me), true);
    assert.equal(me.nuggets, 1);
    assert.equal(g.useJackyMurieta(0), false, 'na třetí už nemá');
});

test('Jacky Murieta: zaplacený BANG! server opravdu pustí', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Jacky Murieta' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 2;
    const i1 = give(g, 0, CardType.BANG);
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, i1);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);                  // nemá Vedle!
    assert.equal(g.players[1].health, 3);
    g.phase = 'PLAY';
    // Druhý BANG! bez zaplacení projít nesmí.
    g.playBang(0, 1, 0);
    assert.equal(g.phase, 'PLAY', 'limit drží');
    assert.ok(g.useJackyMurieta(0));
    g.playBang(0, 1, 0);
    assert.equal(g.phase, 'RESPOND', 'po zaplacení projde');
});

test('Jacky Murieta: zaplacené výstřely patří jednomu tahu', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Jacky Murieta' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 2;
    g.useJackyMurieta(0);
    assert.equal(jackyExtraBangs(g, g.players[0]), 1);
    g.turnId = 9;
    assert.equal(jackyExtraBangs(g, g.players[0]), 0);
});

// ── Raddie Snake ────────────────────────────────────────────────────────────

test('Raddie Snake: valoun za kartu, nejvýš 2× za tah', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Raddie Snake' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 5;
    for (let k = 0; k < 6; k++) g.deck.cards.push(mkCard(CardType.MISSED));

    assert.equal(raddieUsesLeft(g, 0), 2);
    assert.equal(g.useRaddieSnake(0), true);
    assert.equal(g.players[0].nuggets, 4);
    assert.equal(g.phase, 'DRAW');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'DRAW' });
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 1);

    assert.equal(g.useRaddieSnake(0), true);
    g.drawCard('deck');
    assert.equal(raddieUsesLeft(g, 0), 0);
    assert.equal(g.useRaddieSnake(0), false, 'třetí už ne');
    assert.equal(g.players[0].nuggets, 3, 'a nic nezaplatil');
});

test('Raddie Snake: bez valounu se nedá použít', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Raddie Snake' }, { role: 'Outlaw' }]);
    g.deck.cards.push(mkCard(CardType.MISSED));
    assert.equal(g.useRaddieSnake(0), false);
});

// ── Josh McCloud ────────────────────────────────────────────────────────────

test('Josh McCloud: 2 valouny = vrchní karta balíčku vybavení před něj', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Josh McCloud' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 3;
    const card = topGear(g, 'ZH_PODKOVA');
    const got = g.useJoshMcCloud(0);
    assert.equal(got?.id, card.id);
    assert.equal(g.players[0].nuggets, 1);
    assert.deepEqual(g.players[0].gear.map(c => c.effect), ['ZH_PODKOVA']);
});

test('Josh McCloud: černý rám, který už má, musí odhodit', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Josh McCloud' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 2;
    g.players[0].gear = [gearCard('ZH_PODKOVA')];
    const card = topGear(g, 'ZH_PODKOVA');
    g.useJoshMcCloud(0);
    assert.equal(g.players[0].gear.length, 1, 'druhou stejnou si nenechá');
    assert.ok(g.gearPile.some(c => c.id === card.id), 'a leží pod balíčkem');
    assert.equal(g.players[0].nuggets, 0, 'valouny se nevracejí');
});

test('Josh McCloud: hnědá karta se použije hned (Union Pacific → fáze lízání)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Josh McCloud' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 2;
    for (let k = 0; k < 6; k++) g.deck.cards.push(mkCard(CardType.MISSED));
    topGear(g, 'ZH_UNION_PACIFIC');
    g.useJoshMcCloud(0);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 4);
});

test('Josh McCloud: Láhev se ptá na způsob ve vlastní fázi GEAR_MODE', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Josh McCloud' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 2;
    g.players[0].health = 2;
    topGear(g, 'ZH_LAHEV');
    g.useJoshMcCloud(0);
    assert.equal(g.phase, 'GEAR_MODE');
    assert.deepEqual(waitingStatus(g), { idx: 0, kind: 'GEAR_MODE', text: 'vybírá, jak vybavení zahraje' });
    assert.ok(g.pendingGearMode.modes.includes('BEER'));

    assert.equal(g.chooseGearMode(0, 'BEER'), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].health, 3);
    assert.equal(g.pendingGearMode, null);
});

test('Josh McCloud: cílený způsob Láhve pokračuje fází GEAR_TARGET', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Josh McCloud' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 2;
    topGear(g, 'ZH_LAHEV');
    g.useJoshMcCloud(0);
    assert.equal(g.phase, 'GEAR_MODE');
    assert.equal(g.chooseGearMode(0, 'BANG'), true);
    assert.equal(g.phase, 'GEAR_TARGET');
    assert.deepEqual(g.pendingGearTarget.targets, [1]);
    g.resolveGearTarget(0, 1);
    assert.equal(g.phase, 'RESPOND');
});

test('Josh McCloud: neplatný způsob se odmítne, karta zůstane na výběr', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Josh McCloud' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 2;
    topGear(g, 'ZH_LAHEV');
    g.useJoshMcCloud(0);
    assert.equal(g.chooseGearMode(0, 'STORE'), false, 'Hokynářství Láhev neumí');
    assert.equal(g.phase, 'GEAR_MODE');
    assert.equal(g.chooseGearMode(1, 'BANG'), false, 'a nevolí za něj nikdo jiný');
});

test('Josh McCloud: bez valounů, mimo tah a s prázdným balíčkem to nejde', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Josh McCloud' }, { role: 'Outlaw' }]);
    topGear(g, 'ZH_PODKOVA');
    g.players[0].nuggets = 1;
    assert.equal(joshMcCloudOk(g, 0), false, 'na 2 valouny nemá');
    g.players[0].nuggets = 2;
    assert.equal(joshMcCloudOk(g, 0), true);
    g.currentPlayerIndex = 1;
    assert.equal(joshMcCloudOk(g, 0), false, 'jen ve svém tahu');
    g.currentPlayerIndex = 0;
    g.gearDeck = []; g.gearPile = [];
    assert.equal(joshMcCloudOk(g, 0), false, 'a jen když je z čeho líznout');
    assert.equal(g.useJoshMcCloud(0), null);
    assert.equal(g.players[0].nuggets, 2, 'neúspěch nestojí valouny');
});

// ── Madam Yto ───────────────────────────────────────────────────────────────

test('Madam Yto: líznutí za Pivo zahrané KÝMKOLI (i jí samotnou)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Madam Yto', health: 3 },
                    { role: 'Outlaw', health: 3 }, { role: 'Deputy' }], { current: 1 });
    g.deck.cards.push(mkCard(CardType.MISSED));
    const bi = give(g, 1, CardType.BEER);
    g.playCard(bi);
    assert.equal(g.players[1].health, 4, 'Pivo vyléčilo toho, kdo ho zahrál');
    assert.equal(g.phase, 'YTO_DRAW');
    assert.deepEqual(waitingStatus(g), { idx: 0, kind: 'YTO_DRAW', text: 'Madam Yto – líže za Pivo' });
    g.madamYtoDraw(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Madam Yto: Pivo za valoun (Zlatá horečka) ji spustí taky', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Madam Yto' }, { role: 'Outlaw' }], { current: 1 });
    g.deck.cards.push(mkCard(CardType.MISSED));
    give(g, 1, CardType.BEER);
    assert.ok(g.beerForNugget(1, 0));
    assert.equal(g.players[1].nuggets, 1);
    assert.equal(g.phase, 'YTO_DRAW');
});

test('Madam Yto: Pivo jako záchrana posledního života ji spustí taky', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Madam Yto' },
                    { role: 'Outlaw', health: 1 }, { role: 'Deputy' }], { current: 2 });
    g.deck.cards.push(mkCard(CardType.MISSED));
    give(g, 1, CardType.BEER);
    g.pendingResponse = { active: true, targetIdx: 1, attackerIdx: 2, originatorIdx: 2,
                          sourceCard: CardType.BANG, responded: [] };
    g.phase = 'RESPOND';
    assert.ok(g.beerLastLifeSave(1, 0));
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'YTO_DRAW');
    g.madamYtoDraw(0);
    assert.equal(g.players[0].hand.length, 1);
});

test('Madam Yto: Salón, Whisky ani Láhev ji nespustí', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Madam Yto', health: 3 },
                    { role: 'Outlaw', health: 3 }, { role: 'Deputy' }], { current: 1 });
    const si = give(g, 1, CardType.SALOON);
    g.playCard(si);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.specialActionQueue.length, 0);

    // Láhev zahraná jako Pivo kartou Pivo NENÍ (dodatek), takže taky nic.
    g.players[1].health = 3;
    g.gearRow = [gearCard('ZH_LAHEV'), null, null];
    g.players[1].nuggets = 5;
    g.gearBuy(1, 0, { mode: 'BEER' });
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.specialActionQueue.length, 0);
});

test('Madam Yto: mrtvá si nelíže (fronta se pročistí)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Madam Yto', health: 0 },
                    { role: 'Outlaw', health: 3 }, { role: 'Deputy' }], { current: 1 });
    const bi = give(g, 1, CardType.BEER);
    g.playCard(bi);
    assert.equal(g.phase, 'PLAY');
});

// ── Dutch Will ──────────────────────────────────────────────────────────────

test('Dutch Will: po fázi 1 odhodí jednu z líznutých a vezme si valoun', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Dutch Will' }, { role: 'Outlaw' }]);
    const keep = mkCard(CardType.BANG, { id: 7001 });
    const drop = mkCard(CardType.MISSED, { id: 7002 });
    g.deck.cards.push(drop, keep);            // pop z konce → nejdřív keep, pak drop
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'DUTCH_DISCARD');
    assert.deepEqual(waitingStatus(g),
        { idx: 0, kind: 'DUTCH_DISCARD', text: 'Dutch Will – odhazuje líznutou kartu' });
    assert.deepEqual(g.pendingDutchDiscard.cardIds.sort(), [7001, 7002]);

    const res = g.dutchWillDiscard(0, 7002);
    assert.equal(res.card.id, 7002);
    assert.equal(g.players[0].nuggets, 1);
    assert.deepEqual(g.players[0].hand.map(c => c.id), [7001]);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingDutchDiscard, null);
    assert.equal(g.deck.discardTop().id, 7002);
});

test('Dutch Will: odhodit jde JEN právě líznutou kartu, ne zbytek ruky', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Dutch Will' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BANG, { id: 7100 });     // stará karta v ruce
    g.deck.cards.push(mkCard(CardType.MISSED, { id: 7101 }), mkCard(CardType.MISSED, { id: 7102 }));
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'DUTCH_DISCARD');
    assert.equal(g.dutchWillDiscard(0, 7100), null, 'stará karta se nenabízí');
    assert.equal(g.phase, 'DUTCH_DISCARD');
    assert.ok(g.dutchWillDiscard(0, 7101));
});

test('Dutch Will: s Krumpáčem líže 3 a odhazuje jednu ze tří', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Dutch Will' }, { role: 'Outlaw' }]);
    g.players[0].gear = [gearCard('ZH_KRUMPAC')];
    for (let k = 0; k < 4; k++) g.deck.cards.push(mkCard(CardType.MISSED));
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    g.drawCard('deck'); g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'DUTCH_DISCARD');
    assert.equal(g.pendingDutchDiscard.cardIds.length, 3);
    g.dutchWillDiscard(0, g.pendingDutchDiscard.cardIds[0]);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[0].nuggets, 1);
});

test('Dutch Will: pod Žízní (1 karta) se schopnost neuplatní vůbec', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Dutch Will' }, { role: 'Outlaw' }]);
    hnEvent(g, 'ZIZEN');
    g.deck.cards.push(mkCard(CardType.MISSED));
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY', 'není z čeho vybírat');
    assert.equal(g.players[0].nuggets, 0, 'a tedy ani valoun');
});

test('Dutch Will: lízání MIMO fázi 1 (Dostavník) schopnost nespouští', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Dutch Will' }, { role: 'Outlaw' }]);
    for (let k = 0; k < 4; k++) g.deck.cards.push(mkCard(CardType.MISSED));
    const si = give(g, 0, CardType.STAGECOACH);
    g.playCard(si);
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].nuggets, 0);
});

test('Dutch Will: bez zapnutého rozšíření nedělá nic', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Dutch Will' }, { role: 'Outlaw' }]);
    for (let k = 0; k < 4; k++) g.deck.cards.push(mkCard(CardType.MISSED));
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
});

// ── Don Bell ────────────────────────────────────────────────────────────────

function mkDonBell() {
    const g = mkZH([{ role: 'Sheriff', character: 'Don Bell' }, { role: 'Outlaw' }]);
    for (let k = 0; k < 8; k++) g.deck.cards.push(mkCard(CardType.MISSED));
    return g;
}

test('Don Bell: na konci tahu snímá, červená = tah navíc', () => {
    const g = mkDonBell();
    topDeck(g, Suits.DIAMONDS);
    g.nextTurn();
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(g.pendingCheckDraw.reason, 'DON_BELL');
    g.triggerCheckDraw(0);
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 0, 'hraje znovu');
    assert.equal(g._extraTurn, true);
});

test('Don Bell: černá = tah prostě skončí', () => {
    const g = mkDonBell();
    topDeck(g, Suits.SPADES);
    g.nextTurn();
    g.triggerCheckDraw(0);
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1);
});

test('Don Bell: na konci tahu navíc už nesnímá', () => {
    const g = mkDonBell();
    topDeck(g, Suits.HEARTS);
    g.nextTurn();
    g.triggerCheckDraw(0);
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 0);
    g.phase = 'PLAY';
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1, 'podruhé se nesnímá');
});

test('Don Bell: FAQ Q06 – ve Vězení schopnost nefunguje', () => {
    const g = mkDonBell();
    const jail = board(g, 0, CardType.JAIL);
    topDeck(g, Suits.SPADES);            // kontrolní karta Vězení: NEuteče
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw(0);
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1, 'tah přeskočen, Don Bell nesnímá');
    assert.ok(jail);
});

test('Don Bell: FAQ Q13 – duch (Město duchů) schopnost neuplatní', () => {
    const g = mkDonBell();
    hnEvent(g, 'MESTO_DUCHU');
    g.players[0].health = 0;
    g.players[0]._ghost = true;
    g.nextTurn();
    assert.notEqual(g.phase, 'CHECK_DRAW');
});

test('Don Bell: bez zapnutého rozšíření nesnímá', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Don Bell' }, { role: 'Outlaw' }]);
    for (let k = 0; k < 8; k++) g.deck.cards.push(mkCard(CardType.MISSED));
    topDeck(g, Suits.HEARTS);
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
});
