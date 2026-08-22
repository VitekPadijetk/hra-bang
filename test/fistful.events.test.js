// Rozšíření A Fistful of Cards – fáze 2: pasivní události Léčka, Laso a Soudce.
// Všechny tři jen po celé kolo mění pravidla, nic si nevyžádají od hráče.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');
const { computeDistance, computeCanHit } = require('../core/distance.js');
const { cardPlayability } = require('../core/playability.js');
const { boardDeadFor, judgeBlocksFor } = require('../core/highNoon.js');
const { decideBotAction } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));
const ff = key => ffData.find(c => c.key === key);

// Hra s právě platnou kartou Fistfulu (přípravu balíčku řeší fistful.test.js).
function mkEv(specs, key, opts = {}) {
    const g = mkGame(specs, opts);
    if (key) g.activeFistful = ff(key);
    return g;
}

// Zelená karta ležící na stole už z minulého tahu (lze ji aktivovat).
function putGreen(g, idx, type, props) {
    const c = board(g, idx, type, { props: { green: true, ...props } });
    c._playedTurn = 0;
    g.turnId = 5;
    return c;
}

const weapon = (g, idx, range, name = 'Remington') => {
    g.players[idx].weapon = mkCard(CardType.WEAPON, { name, props: { range } });
};

// ── Léčka ───────────────────────────────────────────────────────────────────

test('Léčka: vzdálenost mezi kterýmikoli dvěma hráči je 1', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}, {}], 'LECKA');
    assert.equal(computeDistance(g, 0, 3), 1, 'naproti přes stůl');
    assert.equal(computeDistance(g, 0, 1), 1);
    assert.equal(computeDistance(g, 4, 1), 1);
    g.activeFistful = null;
    assert.equal(computeDistance(g, 0, 3), 3, 'bez Léčky normální okruh');
});

test('Léčka: modifikátory platí dál a počítají se od jedničky', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, { character: 'Paul Regret' }, {}, {}], 'LECKA');
    assert.equal(computeDistance(g, 0, 3), 2, 'Paul Regret +1');
    board(g, 3, CardType.EQUIPMENT, { effect: 'mustang' });
    assert.equal(computeDistance(g, 0, 3), 3, 'Mustang +1');
    board(g, 0, CardType.EQUIPMENT, { effect: 'scope' });
    assert.equal(computeDistance(g, 0, 3), 2, 'Dalekohled −1');
    g.players[0].character = 'Rose Doolan';
    assert.equal(computeDistance(g, 0, 3), 1, 'Rose Doolan −1');
});

test('Léčka: Bang! s Coltem dostřelí přes celý stůl', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}, {}], 'LECKA');
    assert.equal(computeCanHit(g, 0, 3), true);
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, 3, i);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 3);
});

// ── Laso ────────────────────────────────────────────────────────────────────

test('Laso: dostřel zbraně padá na 1', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'LASO');
    weapon(g, 0, 3);
    assert.equal(computeCanHit(g, 0, 2), false, 'Remington na vzdálenost 2 nedostřelí');
    assert.equal(computeCanHit(g, 0, 1), true, 'soused ano');
    g.activeFistful = null;
    assert.equal(computeCanHit(g, 0, 2), true, 'bez Lasa zbraň zase platí');
});

test('Laso: Mustang ani Dalekohled se nepočítají', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'LASO');
    board(g, 1, CardType.EQUIPMENT, { effect: 'mustang' });
    board(g, 0, CardType.EQUIPMENT, { effect: 'scope' });
    assert.equal(computeDistance(g, 0, 1), 1, 'obě karty jsou mrtvé');
    g.activeFistful = null;
    assert.equal(computeDistance(g, 0, 1), 1, 'bez Lasa se +1 a −1 vyruší');
    g.players[0].board = [];
    assert.equal(computeDistance(g, 0, 1), 2, 'samotný Mustang zase platí');
});

test('Laso: Barel se nesnímá, Jourdonnaisova vrozená schopnost ano', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'LASO');
    board(g, 1, CardType.BARREL);
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'RESPOND', 'žádný barel-check');
    assert.ok(!g.pendingBarrelCheck);

    const h = mkEv([{ role: 'Sheriff' }, { character: 'Jourdonnais' }], 'LASO');
    board(h, 1, CardType.BARREL);
    const j = give(h, 0, CardType.BANG);
    h.playBang(0, 1, j);
    assert.equal(h.phase, 'BARREL_DRAW');
    assert.equal(h.pendingBarrelCheck.checksLeft, 1, 'jen vrozený check, ne dva');
});

test('Laso: Dynamit se nesnímá ani neposouvá a Vězení tah nebere', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'LASO');
    const dyn = board(g, 0, CardType.DYNAMITE);
    const jail = board(g, 0, CardType.JAIL);
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'DRAW', 'rovnou fáze lízání');
    assert.ok(!g.pendingCheckDraw);
    assert.deepEqual(g.players[0].board, [dyn, jail], 'obě karty zůstávají ležet');

    g.activeFistful = null;
    g.phase = 'PLAY';
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW', 'po skončení kola karty zase fungují');
});

test('Laso: zelenou kartu na stole nejde aktivovat', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'LASO');
    const c = putGreen(g, 0, CardType.CANTEEN, { activate: 'heal_self' });
    g.players[0].health = 1;
    g.activateGreenCard(0, c.id, null);
    assert.equal(g.players[0].health, 1, 'Čutora neléčila');
    assert.equal(g.players[0].board.length, 1, 'karta zůstala ležet');
});

test('Laso: zelené Vedle! ze stolu neubrání', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'LASO');
    const plate = putGreen(g, 1, CardType.IRON_PLATE, { activate: 'miss' });
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, 1, i);
    g.handleResponse(1, null, plate.id);
    assert.equal(g.phase, 'RESPOND', 'obrana se neuznala');
    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[1].board.length, 1, 'karta se ani nespotřebovala');
});

test('Laso: zelený bang-efekt na dostřel zbraně vypadne celý', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'LASO');
    weapon(g, 0, 3);
    const pep = putGreen(g, 0, CardType.PEPPERBOX, { bangEffect: true, range: 'weapon' });
    g.activateGreenCard(0, pep.id, { targetIdx: 1 });
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].board.length, 1);
});

test('Laso: Volcanic nedovolí druhý Bang! v tahu', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'LASO');
    weapon(g, 0, 1, 'Volcanic');
    g.players[0].bangsPlayedThisTurn = 1;
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'PLAY', 'druhý Bang! neprošel');
    assert.equal(g.players[0].hand.length, 1);
});

test('Laso: Doc Holyday střílí jen na vzdálenost 1', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Doc Holyday' }, {}, {}, {}, {}], 'LASO');
    weapon(g, 0, 3);
    give(g, 0, CardType.BEER); give(g, 0, CardType.BEER); give(g, 0, CardType.BEER);
    assert.equal(g.useDocHolyday(0, [0, 1], 2), false, 'na 2 nedosáhne');
    assert.equal(g.useDocHolyday(0, [0, 1], 1), true);
});

test('Laso: klient i bot vidí totéž co server (zrcadla)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'LASO');
    assert.equal(boardDeadFor(g), true);
    assert.equal(g._boardDead(), true);
    weapon(g, 0, 1, 'Volcanic');
    g.players[0].bangsPlayedThisTurn = 1;
    const bang = mkCard(CardType.BANG);
    g.players[0].hand = [bang];
    assert.equal(cardPlayability(g, g.players[0], 0, bang), false);
});

test('Laso: bot nezkusí aktivovat zelenou kartu ani se jí bránit', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'LASO');
    putGreen(g, 0, CardType.CANTEEN, { activate: 'heal_self' });
    g.players[0].health = 1;
    const a = decideBotAction(g, 0, null);
    assert.notEqual(a && a.event, 'activate_green_card');

    const h = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'LASO');
    putGreen(h, 1, CardType.IRON_PLATE, { activate: 'miss' });
    const i = give(h, 0, CardType.BANG);
    h.playBang(0, 1, i);
    const d = decideBotAction(h, 1, null);
    assert.equal(d.event, 'respond_to_card');
    assert.equal(d.payload.boardCardId, undefined, 'nesahá po zelené kartě ze stolu');
});

// ── Soudce ──────────────────────────────────────────────────────────────────

test('Soudce: modré karty, výzbroj ani zelené se nedají vyložit', () => {
    const types = [CardType.WEAPON, CardType.BARREL, CardType.EQUIPMENT, CardType.DYNAMITE];
    types.forEach(t => {
        const g = mkEv([{ role: 'Sheriff' }, {}], 'SOUDCE');
        const i = give(g, 0, t, { props: t === CardType.WEAPON ? { range: 2 } : {} });
        g.playCard(i);
        assert.equal(g.players[0].hand.length, 1, t + ' zůstala v ruce');
        assert.equal(g.players[0].board.length, 0);
        assert.equal(g.players[0].weapon.id, -1);
    });
    const h = mkEv([{ role: 'Sheriff' }, {}], 'SOUDCE');
    const j = give(h, 0, CardType.CANTEEN, { props: { green: true, activate: 'heal_self' } });
    h.playCard(j);
    assert.equal(h.players[0].hand.length, 1, 'zelená taky zůstala v ruce');
    assert.equal(h.players[0].board.length, 0);
});

test('Soudce: Vězení se nedá dát ani před jiného hráče', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'SOUDCE');
    const i = give(g, 0, CardType.JAIL);
    g.playSpecialCard(0, 1, i);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[1].board.length, 0);
});

test('Soudce: co už leží, funguje dál – aktivace zelené i Uncle Will', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'SOUDCE');
    const c = putGreen(g, 0, CardType.CANTEEN, { activate: 'heal_self' });
    g.players[0].health = 1;
    g.activateGreenCard(0, c.id, null);
    assert.equal(g.players[0].health, 2, 'Čutora vyléčila');

    const h = mkEv([{ role: 'Sheriff', character: 'Uncle Will' }, {}], 'SOUDCE');
    h.deck.cards = [mkCard(CardType.BANG), mkCard(CardType.BANG), mkCard(CardType.BANG)];
    const i = give(h, 0, CardType.DYNAMITE);
    assert.equal(h.useUncleWill(0, i), true, 'hokynářství nic nevykládá před hráče');
    assert.equal(h.phase, 'STORE');
});

test('Soudce: ostatní karty se hrají normálně', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'SOUDCE');
    g.players[0].health = 2;
    const i = give(g, 0, CardType.BEER);
    g.playCard(i);
    assert.equal(g.players[0].health, 3);
    const j = give(g, 0, CardType.BANG);
    g.playBang(0, 1, j);
    assert.equal(g.phase, 'RESPOND');
});

test('Soudce: klient i bot vidí totéž co server (zrcadla)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'SOUDCE');
    const cases = [
        mkCard(CardType.WEAPON, { props: { range: 2 } }),
        mkCard(CardType.BARREL),
        mkCard(CardType.EQUIPMENT, { props: { effect: 'mustang' } }),
        mkCard(CardType.DYNAMITE),
        mkCard(CardType.JAIL),
        mkCard(CardType.CANTEEN, { props: { green: true, activate: 'heal_self' } }),
    ];
    cases.forEach(c => {
        assert.equal(judgeBlocksFor(g, c), true, c.type + ': zrcadlo');
        assert.equal(g._judgeBlocks(c), true, c.type + ': server');
        g.players[0].hand = [c];
        assert.equal(cardPlayability(g, g.players[0], 0, c), false, c.type + ': playability');
    });
    const bang = mkCard(CardType.BANG);
    assert.equal(judgeBlocksFor(g, bang), false);
    assert.equal(g._judgeBlocks(bang), false);
});

test('Soudce: bot vyloženou kartu ani nezkusí zahrát', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'SOUDCE');
    give(g, 0, CardType.BARREL);
    give(g, 0, CardType.DYNAMITE);
    const a = decideBotAction(g, 0, null);
    assert.notEqual(a && a.event, 'play_card', 'jinak by server akci mlčky zahodil (stall)');
});

// ── Soužití ─────────────────────────────────────────────────────────────────

test('bez zapnutého Fistfulu se nic z toho neděje', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], null);
    assert.equal(computeDistance(g, 0, 2), 2);
    assert.equal(g._boardDead(), false);
    assert.equal(g._judgeBlocks(mkCard(CardType.BARREL)), false);
});

test('Léčka a Laso se sčítají – dostřel 1 a vzdálenost 1 = zasáhne každého', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}, {}], 'LECKA');
    g.activeEvent = { key: 'LASO' };   // druhá karta může přijít i z balíčku High Noonu
    weapon(g, 0, 3);
    board(g, 3, CardType.EQUIPMENT, { effect: 'mustang' });
    assert.equal(computeDistance(g, 0, 3), 1, 'Mustang je pod Lasem mrtvý');
    assert.equal(computeCanHit(g, 0, 3), true);
});
