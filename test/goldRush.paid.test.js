// Rozšíření Zlatá horečka (Gold Rush) – fáze 3: placené vybavení s černým rámem.
//
// Dvě karty, které leží před hráčem a používají se za valouny:
//   RÝŽOVACÍ MÍSA – „Zaplať 1 valoun a lízni si 1 kartu z balíčku. Použitelné až 2× za tah."
//   BATOH          – „Zaplať 2 valouny a doplň si 1 život."
//                    Dodatek: „Může se použít i mimo tah vlastníka, pokud ztrácí poslední život."
//
// Podklad: docs/zlata-horecka.md (Karty vybavení + Dodatky ke kartám), plán §4 („Batoh
// mimo tah" = třetí záchrana posledního života vedle Piva a Sida) a rozhodnutí R10
// (Laso a Belle Star vypínají i vybavení).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, mkCard, CardType, Suits } = require('./_helpers.js');
const { gearPanOk, gearPanUsesLeft, gearRucksackOk, gearRucksackSaveOk } = require('../core/goldRush.js');
const { decideBotAction } = require('../core/botPolicy.js');

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
const ZH_ON = { expansions: { zlata_horecka: true } };

function mkZH(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    g.turnId = 1;
    return g;
}

let _gid = 62000;
function gear(g, idx, effect) {
    const kind = gearData.find(k => k.effect === effect);
    const card = { id: _gid++, effect, name: kind.name, art: kind.art,
                   border: kind.border, cost: kind.cost, text: kind.text };
    g.players[idx].gear.push(card);
    return card;
}

// Bang! od hráče 0 na hráče 1 → fáze RESPOND, na kterou se čeká u hráče 1.
function shootAt1(g) {
    const idx = give(g, 0, CardType.BANG, { suit: Suits.CLUBS });
    g.playBang(0, 1, idx);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);
}

// ── RÝŽOVACÍ MÍSA ───────────────────────────────────────────────────────────

test('Mísa: zaplať 1 valoun → fáze lízání na 1 kartu, klik na balíček a zpět do tahu', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_RYZOVACI_MISA');
    g.players[0].nuggets = 3;
    topDeck(g, Suits.HEARTS, '9');

    assert.equal(g.gearPanUse(0), true);
    assert.equal(g.players[0].nuggets, 2);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    assert.equal(g.drawPhaseState.isStartOfTurn, false);

    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Mísa: nejvýš 2× za tah; nový tah (nové turnId) počítá znovu od nuly', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_RYZOVACI_MISA');
    g.players[0].nuggets = 5;
    for (let i = 0; i < 5; i++) topDeck(g, Suits.CLUBS);

    for (let k = 0; k < 2; k++) {
        assert.equal(gearPanUsesLeft(g, 0), 2 - k);
        assert.equal(g.gearPanUse(0), true);
        g.drawCard('deck');
    }
    assert.equal(gearPanUsesLeft(g, 0), 0);
    assert.equal(gearPanOk(g, 0), false);
    assert.equal(g.gearPanUse(0), false, 'třetí rýžování v tahu neprojde');
    assert.equal(g.players[0].nuggets, 3, 'odmítnuté rýžování nic nestojí');

    g.turnId++;
    assert.equal(gearPanOk(g, 0), true);
    assert.equal(g.gearPanUse(0), true);
});

test('Mísa: jen ve svém tahu ve fázi PLAY, s valounem a když platí', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 1, 'ZH_RYZOVACI_MISA');
    g.players[1].nuggets = 2;
    assert.equal(g.gearPanUse(1), false, 'cizí tah');

    g.currentPlayerIndex = 1;
    g.phase = 'DISCARD';
    assert.equal(g.gearPanUse(1), false, 'mimo fázi PLAY');

    g.phase = 'PLAY';
    g.players[1].nuggets = 0;
    assert.equal(g.gearPanUse(1), false, 'bez valounu');

    g.players[1].nuggets = 2;
    g.activeFistful = ffData.find(c => c.key === 'LASO');
    assert.equal(g.gearPanUse(1), false, 'Laso: vybavení nemá efekt (R10)');
    assert.equal(g.players[1].nuggets, 2);
});

test('Mísa: Krumpáč se jí netýká – líže se přesně 1 karta (není to fáze 1)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_RYZOVACI_MISA');
    gear(g, 0, 'ZH_KRUMPAC');
    g.players[0].nuggets = 1;
    topDeck(g, Suits.CLUBS); topDeck(g, Suits.CLUBS);
    g.gearPanUse(0);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
});

test('Mísa: zrcadlo gearPanOk odpovídá serveru', () => {
    const cases = [
        (g) => {},
        (g) => { g.players[0].nuggets = 0; },
        (g) => { g.currentPlayerIndex = 1; },
        (g) => { g.phase = 'RESPOND'; },
        (g) => { g.activeFistful = ffData.find(c => c.key === 'LASO'); },
        (g) => { g.players[0]._panTurn = g.turnId; g.players[0]._panUses = 2; },
        (g) => { g.players[0]._panTurn = g.turnId - 1; g.players[0]._panUses = 2; },
    ];
    cases.forEach((mut, k) => {
        const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
        gear(g, 0, 'ZH_RYZOVACI_MISA');
        g.players[0].nuggets = 2;
        topDeck(g, Suits.CLUBS);
        mut(g);
        const mirror = gearPanOk(g, 0);
        assert.equal(g.gearPanUse(0), mirror, `případ ${k}`);
    });
});

// ── BATOH ve svém tahu ───────────────────────────────────────────────────────

test('Batoh: ve svém tahu zaplať 2 valouny a doplň si 1 život', () => {
    const g = mkZH([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_BATOH');
    g.players[0].nuggets = 5;

    assert.equal(gearRucksackOk(g, 0), true);
    assert.equal(g.gearRucksackUse(0), true);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].nuggets, 3);
    assert.equal(g.phase, 'PLAY');
    // Počet použití za tah karta neomezuje.
    assert.equal(g.gearRucksackUse(0), true);
    assert.equal(g.players[0].health, 4);
});

test('Batoh: s plnými životy, bez 2 valounů ani v cizím tahu neprojde (a nic nestojí)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 2 }]);
    gear(g, 0, 'ZH_BATOH');
    gear(g, 1, 'ZH_BATOH');
    g.players[0].nuggets = 2;
    g.players[1].nuggets = 2;
    assert.equal(g.gearRucksackUse(0), false, 'plné životy');
    assert.equal(g.gearRucksackUse(1), false, 'cizí tah (a není to poslední život)');
    assert.equal(gearRucksackOk(g, 1), false);
    assert.equal(gearRucksackSaveOk(g, 1), false);

    g.players[0].health = 3;
    g.players[0].nuggets = 1;
    assert.equal(g.gearRucksackUse(0), false, 'jen 1 valoun');
    assert.equal(gearRucksackOk(g, 0), false);
    assert.equal(g.players[0].nuggets, 1);
    assert.equal(g.players[1].nuggets, 2);
});

// ── BATOH jako záchrana posledního života (mimo tah) ─────────────────────────

test('Batoh na posledním životě: Bang! zruší, útočník nedostane valoun', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }]);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    shootAt1(g);

    assert.equal(gearRucksackSaveOk(g, 1), true);
    assert.equal(g.gearRucksackUse(1), true);
    assert.equal(g.players[1].health, 1, 'zásah zaplatil doplněný život');
    assert.equal(g.players[1].nuggets, 0);
    assert.equal(g.players[0].nuggets, 0, 'zranění nevzniklo, útočník nic nezískal');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingResponse.active, false);
});

test('Batoh NENÍ Pivo: zachrání i ve dvou hráčích (Pivo tam nemá efekt)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }]);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    shootAt1(g);
    const beer = give(g, 1, CardType.BEER);
    assert.equal(g.beerLastLifeSave(1, beer), false, 'Pivo ve dvou nezachrání');

    assert.equal(g.gearRucksackUse(1), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Batoh NENÍ Pivo: Kazatel (High Noon) ho nezakazuje', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }]);
    g.activeEvent = hnData.find(c => c.key === 'REVEREND');
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    shootAt1(g);
    const beer = give(g, 1, CardType.BEER);
    assert.equal(g.beerLastLifeSave(1, beer), false, 'Pivo pod Kazatelem nezachrání');
    assert.equal(gearRucksackSaveOk(g, 1), true);
    assert.equal(g.gearRucksackUse(1), true);
});

test('Batoh mimo tah jen na POSLEDNÍM životě – se dvěma životy neprojde', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 2 }, { role: 'Outlaw' }]);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    shootAt1(g);
    assert.equal(gearRucksackSaveOk(g, 1), false);
    assert.equal(g.gearRucksackUse(1), false);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[1].nuggets, 2);
});

test('Batoh: v Duelu na posledním životě duel ukončí (hráč přežil)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }]);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    const duel = give(g, 0, CardType.DUEL, { suit: Suits.CLUBS });
    g.playSpecialCard(0, 1, duel);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);

    assert.equal(g.gearRucksackUse(1), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Batoh: u Kulometu zachrání jednoho a útok jde na dalšího', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }]);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    const gat = give(g, 0, CardType.GATLING, { suit: Suits.CLUBS });
    g.playCard(0, gat);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);

    assert.equal(g.gearRucksackUse(1), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 2, 'Kulomet pokračuje na dalšího hráče');
});

test('Batoh: Odražená střela neohrožuje život, takže ji Batoh nezachrání', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    g.pendingResponse = { active: true, originatorIdx: 0, targetIdx: 1, requiredCard: CardType.MISSED,
                          sourceCard: CardType.BANG, responded: [],
                          ricochet: { targetIdx: 1, area: 'board', cardId: 1 } };
    assert.equal(gearRucksackSaveOk(g, 1), false);
    assert.equal(g.gearRucksackUse(1), false);
    assert.equal(g.players[1].nuggets, 2);
});

test('Batoh: Belle Star útočí ve svém tahu → cizí vybavení nemá efekt (R10)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Belle Star' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }]);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    shootAt1(g);
    assert.equal(gearRucksackSaveOk(g, 1), false);
    assert.equal(g.gearRucksackUse(1), false);
    assert.equal(g.phase, 'RESPOND');
});

function mkDynamiteZH(spec) {
    const g = mkZH([spec, { role: 'Sheriff' }, { role: 'Renegade' }], { current: 0 });
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    for (let i = 0; i < 4; i++) g.deck.cards.push(mkCard(CardType.BANG, { suit: Suits.CLUBS, value: '5' }));
    g.deck.cards.push(mkCard(CardType.BANG, { suit: Suits.SPADES, value: '5' })); // check → výbuch
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    return g;
}

test('Batoh na dynamitu: každé použití zruší jeden klikaný zásah (1 život → 3× Batoh)', () => {
    const g = mkDynamiteZH({ role: 'Outlaw', health: 1 });
    gear(g, 0, 'ZH_BATOH');
    g.players[0].nuggets = 6;

    for (let k = 0; k < 2; k++) {
        assert.equal(gearRucksackSaveOk(g, 0), true);
        assert.equal(g.gearRucksackUse(0), true);
        assert.equal(g.phase, 'DYNAMITE_DAMAGE');
        assert.equal(g.pendingDynamiteDamage.hitsLeft, 2 - k);
    }
    assert.equal(g.gearRucksackUse(0), true);
    assert.equal(g.pendingDynamiteDamage, null);
    assert.equal(g.players[0].health, 1);
    assert.equal(g.players[0].nuggets, 0);
    assert.equal(g.phase, 'DRAW', 'přežil, tah pokračuje fází lízání');
});

test('Batoh na dynamitu: se dvěma životy až po prvním zásahu', () => {
    const g = mkDynamiteZH({ role: 'Outlaw', health: 2 });
    gear(g, 0, 'ZH_BATOH');
    g.players[0].nuggets = 4;
    assert.equal(g.gearRucksackUse(0), false, 'se 2 životy to není poslední život');
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 1);
    assert.equal(g.gearRucksackUse(0), true);
    assert.equal(g.gearRucksackUse(0), true);
    assert.equal(g.players[0].health, 1);
    assert.equal(g.phase, 'DRAW');
});

test('Batoh: Pravé poledne na posledním životě zruší a start tahu pokračuje', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }]);
    g.highNoonCardData = hnData;
    g._setupEventDeck({ expansions: { high_noon: true } });
    g.activeEvent = hnData.find(c => c.key === 'PRAVE_POLEDNE');
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    g.currentPlayerIndex = 1;
    g._beginTurn();
    assert.equal(g.phase, 'NOON_DAMAGE');

    assert.equal(gearRucksackSaveOk(g, 1), true);
    assert.equal(g.gearRucksackUse(1), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.pendingNoonDamage, null);
    assert.equal(g.phase, 'DRAW');
});

// ── Bot ──────────────────────────────────────────────────────────────────────

test('bot: bez obrany na posledním životě použije Batoh (i ve dvou hráčích)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }]);
    gear(g, 1, 'ZH_BATOH');
    g.players[1].nuggets = 2;
    shootAt1(g);
    assert.deepEqual(decideBotAction(g, 1), { event: 'gear_rucksack', payload: {} });
});

test('bot: na dynamitu i u Pravého poledne sáhne po Batohu dřív, než schytá zásah', () => {
    const g = mkDynamiteZH({ role: 'Outlaw', health: 1 });
    gear(g, 0, 'ZH_BATOH');
    g.players[0].nuggets = 2;
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_rucksack', payload: {} });
    g.players[0].nuggets = 1;
    assert.deepEqual(decideBotAction(g, 0), { event: 'take_dynamite_hit' });
});

test('bot: s volným valounem a Mísou si ve svém tahu lízne', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_RYZOVACI_MISA');
    g.players[0].nuggets = 1;
    g.gearRow = [null, null, null];   // v obchodě není nic, na co by valoun šel dřív
    topDeck(g, Suits.CLUBS);          // je co líznout (jinak by rýžování bylo za nic)
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_pan', payload: {} });
});

test('bot: s Batohem si na Mísu nesáhne, když by mu nezbyly 2 valouny na záchranu', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_RYZOVACI_MISA');
    gear(g, 0, 'ZH_BATOH');
    g.players[0].nuggets = 2;
    g.gearRow = [null, null, null];
    topDeck(g, Suits.CLUBS);
    assert.notEqual(decideBotAction(g, 0).event, 'gear_pan');
    g.players[0].nuggets = 3;
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_pan', payload: {} });
});
