// Rozšíření Zlatá horečka (Gold Rush) – fáze 4: hnědé vybavení s volbou a se sejmutím.
//
//   LÁHEV          – „Může být zahrána jako Panika!, Pivo nebo BANG!"
//   KOMPLIC        – „Může být zahrán jako Hokynářství, Duel nebo Cat Balou."
//                    Dodatek k oběma: i když má stejný efekt, NEPOVAŽUJE SE za tu kartu;
//                    BANG! zahraný Láhví se nepočítá do limitu 1 BANG! za tah.
//   RUM            – „Otoč! 4 karty: doplň si 1 život za každou různou barvu."
//   ZLATÁ HOREČKA  – „Tvůj tah končí. Doplň si všechny životy a zahraj další tah."
//
// Podklad: docs/zlata-horecka.md (Karty vybavení, Dodatky, FAQ Q05 Lucky Duke × Rum,
// Q12 John Pain × Rum, Q13 Don Bell × Město duchů, Q14 Tequila Joe × Láhev) a plán §4.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const GR = require('../core/goldRush.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { waitingStatus } = require('../core/pending.js');
const { rumRevealMs, rumSlotX } = require('../core/goldRushAnim.js');

before(() => { console.log = () => {}; });

const gearData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8')
);
const ffData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8')
);
const hnData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8')
);
const wwsData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.divoky_zapad.json'), 'utf8')
);
const ZH_ON = { expansions: { zlata_horecka: true } };

// 4 hráči (0 šerif na tahu). S Coltem .45 dosáhne hráč 0 na sousedy 1 a 3.
function mkZH(specs, opts = {}) {
    const g = mkGame(specs || [{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }], opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    g.turnId = 1;
    return g;
}

let _gid = 64000;
function gearCard(effect) {
    const kind = gearData.find(k => k.effect === effect);
    return { id: _gid++, effect, name: kind.name, art: kind.art,
             border: kind.border, cost: kind.cost, text: kind.text };
}
// Obchod s přesně danými kartami; balíček vybavení prázdný, ať se doplnění nemíchá do testu.
function shop(g, effects) {
    g.gearRow = effects.map(e => (e ? gearCard(e) : null));
    g.gearDeck = [];
    g.gearPile = [];
}
function gear(g, idx, effect) {
    const c = gearCard(effect);
    g.players[idx].gear.push(c);
    return c;
}

// ── LÁHEV ────────────────────────────────────────────────────────────────────

test('Láhev: bez zvoleného způsobu (nebo s cizím) se nekupuje a nic se neplatí', () => {
    const g = mkZH();
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 5;
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.gearBuy(0, 0, { mode: 'STORE' }), null, 'Hokynářství je Komplic, ne Láhev');
    assert.equal(g.gearBuy(0, 0, { mode: 'NESMYSL' }), null);
    assert.equal(g.players[0].nuggets, 5);
    assert.ok(g.gearRow[0], 'karta zůstala v obchodě');
});

test('Láhev jako BANG!: cíl na dostřel zbraně, fáze GEAR_TARGET, pak obrana jako proti bang-efektu', () => {
    const g = mkZH();
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 5;
    assert.deepEqual(GR.gearModeTargets(g, 0, 'BANG'), [1, 3], 'Colt .45 dosáhne jen na sousedy');

    const bought = g.gearBuy(0, 0, { mode: 'BANG' });
    assert.equal(bought.effect, 'ZH_LAHEV');
    assert.equal(g.players[0].nuggets, 3, 'Láhev stojí 2');
    assert.equal(g.phase, 'GEAR_TARGET');
    assert.deepEqual(g.pendingGearTarget.targets, [1, 3]);
    assert.equal(g.pendingGearTarget.mode, 'BANG');
    assert.ok(g.gearPile.some(c => c.effect === 'ZH_LAHEV'), 'hnědá jde hned pod balíček vybavení');
    assert.equal(waitingStatus(g).text, 'Láhev jako BANG! – vybírá cíl');

    assert.equal(g.resolveGearTarget(0, 2), false, 'mimo dostřel se nemíří');
    assert.equal(g.resolveGearTarget(0, 1), true);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);
    assert.equal(g.pendingResponse.bangEffect, true, 'Láhev není karta BANG! – jde jako bang-efekt');
    assert.match(g.pendingResponse.sourceCardName, /Láhev/);
    assert.equal(g.players[0].bangsPlayedThisTurn, 0, 'do limitu 1× BANG!/tah se nepočítá');

    g.handleResponse(1, null);   // bez Vedle! – zásah
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[0].nuggets, 4, 'způsobené zranění = valoun, i Láhví');
    assert.equal(g.phase, 'PLAY');
});

test('Láhev jako BANG! jde i s vyčerpaným limitem a Slabův bonus na ni neplatí', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 5;
    g.players[0].bangsPlayedThisTurn = 1;
    assert.equal(GR.gearBuyReason(g, 0, 0, 'BANG'), null);
    g.gearBuy(0, 0, { mode: 'BANG' });
    g.resolveGearTarget(0, 1);
    assert.equal(g.missesRequired, 1, 'Slab the Killer chce 2× Vedle! jen proti kartě BANG!');
});

test('Láhev jako BANG!: nikdo v dostřelu → tenhle způsob nejde, ostatní ano', () => {
    const g = mkZH();
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 5;
    g.players[0].health = 3;
    g.players[1].health = 0;
    g.players[3].health = 0;
    // Zbyl jen hráč 2, a ten je teď taky soused (vyřazení se nepočítají).
    assert.deepEqual(GR.gearModeTargets(g, 0, 'BANG'), [2]);
    board(g, 2, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    assert.deepEqual(GR.gearModeTargets(g, 0, 'BANG'), [], 'Mustang ho odsune z dostřelu Coltu');
    assert.equal(GR.gearBuyReason(g, 0, 0, 'BANG'), 'nikdo v dostřelu');
    assert.equal(g.gearBuy(0, 0, { mode: 'BANG' }), null);
    assert.equal(GR.gearBuyReason(g, 0, 0), null, 'kartu jako celek koupit jde (Pivo)');
});

test('Láhev jako Pivo: +1 život – Tequila Joe jen +1 (FAQ Q14), Reverend ani dva hráči nevadí', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Tequila Joe' }, { role: 'Outlaw' }]);
    shop(g, ['ZH_LAHEV', 'ZH_LAHEV']);
    g.players[0].nuggets = 5;
    g.players[0].health = 2;
    g.activeEvent = hnData.find(c => c.key === 'REVEREND');   // zakazuje kartu Pivo

    assert.ok(g.gearBuy(0, 0, { mode: 'BEER' }));
    assert.equal(g.players[0].health, 3, 'Láhev se za Pivo nepovažuje – žádné +2');
    assert.equal(g.phase, 'PLAY', 'Pivo nemá cíl, žádná fáze');
    assert.equal(g.players[0].nuggets, 3);
});

test('Láhev jako Pivo na plný život nejde (nic by neudělala)', () => {
    const g = mkZH();
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 5;
    assert.equal(GR.gearBuyReason(g, 0, 0, 'BEER'), 'máš plné životy');
    assert.equal(g.gearBuy(0, 0, { mode: 'BEER' }), null);
    assert.equal(g.players[0].nuggets, 5);
});

test('Láhev jako Panika!: jen na vzdálenost 1 a na hráče s kartou – vybavení se nepočítá', () => {
    const g = mkZH();
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 5;
    gear(g, 1, 'ZH_KALUMET');                    // hráč 1 má JEN vybavení
    const barrel = board(g, 3, CardType.BARREL, { name: 'Barel' });
    give(g, 2, CardType.BANG);                   // hráč 2 kartu má, ale je daleko
    assert.deepEqual(GR.gearModeTargets(g, 0, 'PANIC'), [3]);

    g.gearBuy(0, 0, { mode: 'PANIC' });
    assert.deepEqual(g.pendingGearTarget.targets, [3]);
    g.resolveGearTarget(0, 3);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.sourceCardType, CardType.PANIC);
    g.resolveCardSelection(0, 'board', 0);
    assert.ok(g.players[0].hand.some(c => c.id === barrel.id), 'ukradená karta jde do ruky');
    assert.equal(g.players[1].gear.length, 1, 'vybavení zůstalo nedotčené (R3)');
    assert.equal(g.phase, 'PLAY');
});

test('Láhev ani Komplic nejsou zahraná karta: Madam Zuzana ani Lee Van Kliff je nepočítají', () => {
    const g = mkZH();
    shop(g, ['ZH_LAHEV', 'ZH_KOMPLIC']);
    g.players[0].nuggets = 9;
    g.players[0]._playedThisTurn = 0;
    g.gearBuy(0, 0, { mode: 'BANG' });
    g.resolveGearTarget(0, 1);
    g.handleResponse(1, null);
    g.gearBuy(0, 1, { mode: 'DUEL' });
    assert.equal(g.players[0]._playedThisTurn, 0);
    assert.equal(g._lastBrown, null, 'paměť poslední hnědé karty zůstala prázdná');
});

// ── KOMPLIC ──────────────────────────────────────────────────────────────────

test('Komplic jako Hokynářství: rozdá se stejně jako kartou (fáze STORE)', () => {
    const g = mkZH();
    shop(g, ['ZH_KOMPLIC']);
    g.players[0].nuggets = 2;
    for (let i = 0; i < 6; i++) topDeck(g, Suits.CLUBS);
    assert.ok(g.gearBuy(0, 0, { mode: 'STORE' }));
    assert.equal(g.phase, 'STORE');
    assert.equal(g.storeCards.length, 4, 'karta pro každého hráče ve hře');
    assert.equal(g.storePickerIndex, 0, 'první si vybírá kupující');
    assert.equal(g.players[0].nuggets, 0);
});

test('Komplic jako Duel: cílem kdokoli jiný, obrana kartou Bang!', () => {
    const g = mkZH();
    shop(g, ['ZH_KOMPLIC']);
    g.players[0].nuggets = 2;
    assert.deepEqual(GR.gearModeTargets(g, 0, 'DUEL'), [1, 2, 3], 'vzdálenost u Duelu nehraje roli');
    g.gearBuy(0, 0, { mode: 'DUEL' });
    assert.equal(g.phase, 'GEAR_TARGET');
    g.resolveGearTarget(0, 2);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.sourceCard, CardType.DUEL);
    assert.equal(g.pendingResponse.requiredCard, CardType.BANG);
    assert.equal(g.pendingResponse.originatorIdx, 0);
    assert.equal(g.pendingResponse.targetIdx, 2);
});

test('Komplic jako Cat Balou: kdokoli s kartou, zničená karta jde do odhozu', () => {
    const g = mkZH();
    shop(g, ['ZH_KOMPLIC']);
    g.players[0].nuggets = 2;
    const barrel = board(g, 2, CardType.BARREL, { name: 'Barel' });
    assert.deepEqual(GR.gearModeTargets(g, 0, 'CAT_BALOU'), [2]);
    g.gearBuy(0, 0, { mode: 'CAT_BALOU' });
    g.resolveGearTarget(0, 2);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.deck.discardTop().id, barrel.id);
    assert.equal(g.players[2].board.length, 0);
});

test('Komplic: Kalumet ani Apache Kid ho nezastaví – karta vybavení nemá barvu', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Apache Kid' }]);
    shop(g, ['ZH_KOMPLIC']);
    g.players[0].nuggets = 2;
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.gearBuy(0, 0, { mode: 'CAT_BALOU' });
    g.resolveGearTarget(0, 1);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
});

test('cíl mezitím odešel ze hry → efekt vyšumí, hra nečeká na nový cíl', () => {
    const g = mkZH();
    shop(g, ['ZH_KOMPLIC']);
    g.players[0].nuggets = 2;
    g.gearBuy(0, 0, { mode: 'DUEL' });
    g.players[1].health = 0;                     // třeba pokuta Roubíku uprostřed volby
    assert.equal(g.resolveGearTarget(0, 1), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingGearTarget, null);
});

// ── RUM ──────────────────────────────────────────────────────────────────────

test('Rum: otočí 4 karty a doléčí 1 život za každou RŮZNOU barvu', () => {
    const g = mkZH();
    shop(g, ['ZH_RUM']);
    g.players[0].nuggets = 3;
    g.players[0].health = 1;
    [Suits.HEARTS, Suits.SPADES, Suits.HEARTS, Suits.CLUBS].forEach(s => topDeck(g, s));
    const discardBefore = g.deck.discardPile.length;

    assert.ok(g.gearBuy(0, 0));
    assert.equal(g.players[0].health, 4, '♥ ♠ ♣ = 3 barvy → +3');
    assert.equal(g.deck.discardPile.length, discardBefore + 4, 'všechny otočené karty jdou do odhozu');
    assert.equal(g.phase, 'PLAY');
    const r = g._gearRumReveal;
    assert.equal(r.type, 'gear_rum');
    assert.equal(r.cards.length, 4);
    assert.equal(r.suits, 3);
    assert.equal(r.healed, 3);
});

test('Rum: léčí se jen do maxima a na plný život se nekoupí', () => {
    const g = mkZH();
    shop(g, ['ZH_RUM', 'ZH_RUM']);
    g.players[0].nuggets = 6;
    assert.equal(GR.gearBuyReason(g, 0, 0), 'máš plné životy');
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.players[0].nuggets, 6);

    g.players[0].health = 3;
    [Suits.HEARTS, Suits.SPADES, Suits.DIAMONDS, Suits.CLUBS].forEach(s => topDeck(g, s));
    g.gearBuy(0, 0);
    assert.equal(g.players[0].health, 4);
    assert.equal(g._gearRumReveal.healed, 1);
    assert.equal(g._gearRumReveal.suits, 4);
});

test('Rum × Podkova / Lucky Duke: každý zdroj přidá kartu (FAQ Q05, R8)', () => {
    const cases = [
        { character: null, horseshoe: true, want: 5 },
        { character: 'Lucky Duke', horseshoe: false, want: 5 },
        { character: 'Lucky Duke', horseshoe: true, want: 6 },
    ];
    cases.forEach(({ character, horseshoe, want }) => {
        const g = mkZH([{ role: 'Sheriff', character }, { role: 'Outlaw' }]);
        shop(g, ['ZH_RUM']);
        if (horseshoe) gear(g, 0, 'ZH_PODKOVA');
        g.players[0].nuggets = 3;
        g.players[0].health = 1;
        for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS);
        g.gearBuy(0, 0);
        assert.equal(g._gearRumReveal.cards.length, want, `${character} + Podkova=${horseshoe}`);
        assert.equal(g.phase, 'PLAY', 'nic se nevybírá – počítají se všechny karty');
    });
});

test('Rum pod Požehnáním: všechno je srdce → 1 barva, +1 život', () => {
    const g = mkZH();
    shop(g, ['ZH_RUM']);
    g.players[0].nuggets = 3;
    g.players[0].health = 1;
    g.activeEvent = hnData.find(c => c.key === 'POZEHNANI');
    [Suits.HEARTS, Suits.SPADES, Suits.DIAMONDS, Suits.CLUBS].forEach(s => topDeck(g, s));
    g.gearBuy(0, 0);
    assert.equal(g.players[0].health, 2);
});

test('Rum × John Pain: otočené karty si bere po jedné, dokud má v ruce méně než 6 (FAQ Q12)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'John Pain' }]);
    shop(g, ['ZH_RUM']);
    g.players[0].nuggets = 3;
    g.players[0].health = 1;
    for (let i = 0; i < 4; i++) give(g, 1, CardType.BANG);
    [Suits.HEARTS, Suits.SPADES, Suits.DIAMONDS, Suits.CLUBS].forEach(s => topDeck(g, s));
    g.gearBuy(0, 0);
    assert.equal(g.players[0].health, 4, 'doléčí se podle všech 4 karet');
    assert.equal(g.players[1].hand.length, 6, 'John si vzal jen 2 (4 → 6)');
});

test('Rum: došel balíček uprostřed otáčení – otočené karty se zpátky nezamíchají', () => {
    const g = mkZH();
    shop(g, ['ZH_RUM']);
    g.players[0].nuggets = 3;
    g.players[0].health = 1;
    g.deck.cards = [];
    [Suits.HEARTS, Suits.SPADES].forEach(s => topDeck(g, s));
    // Odhoz má dvě karty, které se při domíchání vrátí do hry.
    g.deck.discardPile.push({ id: 801, name: 'X', type: CardType.BANG, suit: Suits.DIAMONDS, value: '5' });
    g.deck.discardPile.push({ id: 802, name: 'Y', type: CardType.BANG, suit: Suits.CLUBS, value: '5' });
    g.gearBuy(0, 0);
    const ids = g._gearRumReveal.cards.map(c => c.id);
    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4, 'žádná karta se neotočila dvakrát');
    assert.equal(g.players[0].health, 4);
});

// ── ZLATÁ HOREČKA ────────────────────────────────────────────────────────────

test('Zlatá horečka: tah skončí, hráč se doléčí a hraje další tah (nové turnId, lízání)', () => {
    const g = mkZH();
    shop(g, ['ZH_ZLATA_HORECKA']);
    g.players[0].nuggets = 5;
    g.players[0].health = 1;
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);
    const t0 = g.turnId;

    assert.ok(g.gearBuy(0, 0));
    assert.equal(g.currentPlayerIndex, 0, 'týž hráč');
    assert.equal(g.players[0].health, 4, 'doplní si všechny životy');
    assert.ok(g.turnId > t0, 'nový tah');
    assert.equal(g._extraTurn, true, 'tah navíc neodkrývá novou událost');
    assert.equal(g.phase, 'DRAW', 'tah navíc jede celý, včetně fáze lízání');
    assert.equal(g.players[0]._gearExtraTurn, false, 'příznak je spotřebovaný');
    assert.ok(g.gearPile.some(c => c.effect === 'ZH_ZLATA_HORECKA'));

    // Konec tahu navíc už další tah nedává.
    g.drawCard('deck'); g.drawCard('deck');
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1);
});

test('Zlatá horečka: nejdřív se dohraje konec tahu (odhoz nad limit), pak teprve léčení', () => {
    const g = mkZH();
    shop(g, ['ZH_ZLATA_HORECKA']);
    g.players[0].nuggets = 5;
    g.players[0].health = 1;
    for (let i = 0; i < 3; i++) give(g, 0, CardType.BANG);
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);

    g.gearBuy(0, 0);
    assert.equal(g.phase, 'DISCARD', 'limit je podle životů PŘED doléčením (text: „tah končí" je první)');
    assert.equal(g.players[0].health, 1);
    g.discardCard(0);
    g.discardCard(0);
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.phase, 'DRAW');
});

test('Zlatá horečka × Madam Zuzana: pokuta za konec tahu padne a hned se doléčí', () => {
    const g = mkZH();
    g.activeWws = wwsData.find(c => c.key === 'MADAM_ZUZANA');
    shop(g, ['ZH_ZLATA_HORECKA']);
    g.players[0].nuggets = 5;
    g.players[0].health = 3;
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);
    g.gearBuy(0, 0);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE', 'Zuzana: v tahu se nezahrály 3 karty');
    g.takeDynamiteHit(0);
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.players[0].health, 4);
    assert.equal(g._extraTurn, true);
});

test('Zlatá horečka: pod Právem západu s vynucenou kartou se koupit nedá (tah nejde ukončit)', () => {
    const g = mkZH();
    g.activeFistful = ffData.find(c => c.key === 'PRAVO_ZAPADU');
    shop(g, ['ZH_ZLATA_HORECKA']);
    g.players[0].nuggets = 5;
    g.players[0].health = 2;
    give(g, 0, CardType.BEER);
    g.players[0]._lawCardId = g.players[0].hand[0].id;
    assert.equal(GR.gearBuyReason(g, 0, 0), 'Právo západu – nejdřív zahraj vynucenou kartu');
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.players[0].nuggets, 5);
    assert.equal(g.currentPlayerIndex, 0);
});

test('Zlatá horečka: duch (Město duchů) ji nekoupí – na konci tahu odchází (FAQ Q13)', () => {
    const g = mkZH();
    g.activeEvent = hnData.find(c => c.key === 'MESTO_DUCHU');
    shop(g, ['ZH_ZLATA_HORECKA']);
    g.players[0].nuggets = 5;
    g.players[0].health = 0;
    g.players[0]._ghost = true;
    assert.equal(GR.gearBuyReason(g, 0, 0), 'duch na konci tahu odchází');
    assert.equal(g.gearBuy(0, 0), null);
});

test('Zlatá horečka: kdo na konci tahu umře, tah navíc nedostane a příznak nezůstane viset', () => {
    const g = mkZH();
    g.players[0].health = 0;
    g.players[0]._gearExtraTurn = true;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[0]._gearExtraTurn, false);
});

// ── Zrcadlo a okno obchodu ───────────────────────────────────────────────────

test('zrcadlo: karta s režimy je koupitelná, když aspoň jeden režim jde', () => {
    const g = mkZH();
    shop(g, ['ZH_LAHEV', 'ZH_KOMPLIC']);
    g.players[0].nuggets = 5;
    // Plné životy (Pivo ne), nikdo nemá kartu (Panika ne), ale v dostřelu někdo je (BANG! ano).
    assert.equal(GR.gearBuyReason(g, 0, 0), null);
    assert.equal(GR.gearBuyReason(g, 0, 0, 'BEER'), 'máš plné životy');
    assert.equal(GR.gearBuyReason(g, 0, 0, 'PANIC'), 'nikdo na vzdálenost 1 nemá kartu');
    assert.equal(GR.gearBuyReason(g, 0, 0, 'BANG'), null);
    // Komplic: Duel jde vždycky, Cat Balou bez karet u soupeřů ne.
    assert.equal(GR.gearBuyReason(g, 0, 1, 'CAT_BALOU'), 'nikdo nemá kartu');
    assert.equal(GR.gearBuyReason(g, 0, 1, 'DUEL'), null);
    // Málo valounů platí pro kartu i pro každý režim.
    g.players[0].nuggets = 1;
    assert.equal(GR.gearBuyReason(g, 0, 0), 'málo valounů');
    assert.equal(GR.gearBuyReason(g, 0, 0, 'BANG'), 'málo valounů');
});

test('zrcadlo: když nejde žádný režim, karta se hlásí jako nehratelná', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 5;
    g.players[1].health = 0;
    g.players[4].health = 0;
    // Zbylí dva jsou na vzdálenost 1 – s Mustangem na 2, tedy mimo Colt i Paniku.
    [2, 3].forEach(i => board(g, i, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' }));
    assert.equal(GR.gearBuyReason(g, 0, 0), 'teď ji nejde zahrát ani jedním způsobem');
});

test('server a zrcadlo se shodnou u každé kombinace karta × režim', () => {
    const effects = ['ZH_LAHEV', 'ZH_KOMPLIC', 'ZH_RUM', 'ZH_ZLATA_HORECKA'];
    const modes = [undefined, 'PANIC', 'BEER', 'BANG', 'STORE', 'DUEL', 'CAT_BALOU'];
    effects.forEach(effect => {
        modes.forEach(mode => {
            [4, 1].forEach(hp => {
                const g = mkZH();
                shop(g, [effect]);
                g.players[0].nuggets = 5;
                g.players[0].health = hp;
                board(g, 1, CardType.BARREL, { name: 'Barel' });
                for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS);
                // Bez režimu se server ptá „přesně tenhle způsob", zrcadlo „aspoň nějak" –
                // porovnává se proto jen s konkrétním režimem (a u karet bez režimů vždy).
                const modal = !!GR.gearModesOf(gearCard(effect));
                if (modal && mode === undefined) return;
                const mirror = GR.gearBuyOk(g, 0, 0, mode);
                const bought = !!g.gearBuy(0, 0, { mode });
                assert.equal(bought, mirror, `${effect} / ${mode} / hp ${hp}`);
            });
        });
    });
});

test('cinematika Rumu: délka roste s počtem karet a řada je vystředěná', () => {
    assert.ok(rumRevealMs(6) > rumRevealMs(4));
    assert.equal(rumSlotX(0, 1), 960);
    assert.equal((rumSlotX(0, 4) + rumSlotX(3, 4)) / 2, 960);
});

// ── Bot ──────────────────────────────────────────────────────────────────────

const snap = (g) => JSON.parse(JSON.stringify(g));
const OUTLAWS = { 1: { Outlaw: 1 }, 2: { Outlaw: 1 }, 3: { Outlaw: 1 } };

test('bot: Láhev koupí jako BANG! na nepřítele v dostřelu a ve fázi GEAR_TARGET na něj i míří', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    shop(g, ['ZH_LAHEV']);
    g.players[0].nuggets = 2;
    const act = decideBotAction(snap(g), 0, OUTLAWS);
    assert.deepEqual(act, { event: 'gear_buy', payload: { rowIdx: 0, mode: 'BANG' } });

    g.gearBuy(0, 0, { mode: 'BANG' });
    const aim = decideBotAction(snap(g), 0, OUTLAWS);
    assert.equal(aim.event, 'gear_target');
    assert.ok(g.pendingGearTarget.targets.includes(aim.payload.targetIdx));
});

test('bot: Rum jen se zraněním, Zlatou horečku až nakonec tahu', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    shop(g, ['ZH_RUM', 'ZH_ZLATA_HORECKA']);
    g.players[0].nuggets = 8;
    g.players[0].health = 2;
    let act = decideBotAction(snap(g), 0, { 1: { Outlaw: 1 } });
    assert.deepEqual(act, { event: 'gear_buy', payload: { rowIdx: 0 } }, 'zraněný bere Rum');

    g.players[0].health = 4;
    act = decideBotAction(snap(g), 0, { 1: { Outlaw: 1 } });
    assert.deepEqual(act, { event: 'gear_buy', payload: { rowIdx: 1 } },
                     'nic lepšího na práci → Zlatá horečka (tah navíc)');

    // S kartou Bang! v ruce a nepřítelem v dostřelu se nejdřív střílí.
    give(g, 0, CardType.BANG);
    act = decideBotAction(snap(g), 0, { 1: { Outlaw: 1 } });
    assert.equal(act.event, 'play_bang');
});
