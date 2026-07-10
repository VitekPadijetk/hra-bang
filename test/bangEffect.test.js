// Rozšíření Dodge City – fáze 2: karty s „bang-efektem" (Úder atd.).
// Bang-efekt = cíl musí dát Vedle!, ALE nepočítá se do limitu 1 Bang!/tah,
// funguje proti němu Barel a NEplatí Slabův bonus (2× Vedle!).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, give, board, CardType, Suits } = require('./_helpers.js');
const { bangEffectReach, computeCanHit } = require('../core/distance.js');
const { getActionForCard } = require('../core/cardRules.js');
const { cardPlayability } = require('../core/playability.js');

before(() => { console.log = () => {}; });

// Pomůcka: karta Úder (bang-efekt, dostřel 1).
const punch = (o = {}) => ({ props: { bangEffect: true, range: 1 }, ...o });

test('Úder vyvolá RESPOND vyžadující Vedle! a při pasu způsobí zranění', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const c = give(g, 0, CardType.PUNCH, punch());

    g.playBang(0, 1, c);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.requiredCard, CardType.MISSED);

    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Úder se NEpočítá do limitu Bang! – lze zahrát Bang! i Úder v jednom tahu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.PUNCH, punch());

    g.playBang(0, 1, 0);        // Bang!
    g.handleResponse(1, null);  // 4→3
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);

    // Úder je stále na indexu 0 (Bang! odešel). Zahrajeme ho i po vyčerpaném limitu.
    g.playBang(0, 1, 0);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1); // beze změny – Úder nepřičítá
});

test('Vedle! ubrání Úder – žádné zranění', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const c = give(g, 0, CardType.PUNCH, punch());
    give(g, 1, CardType.MISSED);

    g.playBang(0, 1, c);
    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
});

test('Slabův bonus NEplatí na Úder – stačí 1 Vedle!', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    const c = give(g, 0, CardType.PUNCH, punch());

    g.playBang(0, 1, c);
    assert.equal(g.missesRequired, 1);
});

test('Obyčejný Bang! od Slaba stále vyžaduje 2 Vedle!', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    const c = give(g, 0, CardType.BANG);
    g.playBang(0, 1, c);
    assert.equal(g.missesRequired, 2);
});

test('Barel funguje proti Úderu (srdce = uhnul)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const c = give(g, 0, CardType.PUNCH, punch());
    board(g, 1, CardType.BARREL);
    g.deck.cards.push({ id: 9001, type: CardType.BANG, suit: Suits.HEARTS, value: '5' });

    g.playBang(0, 1, c);
    assert.equal(g.phase, 'BARREL_DRAW');
    g.triggerBarrelDraw();
    g.resolveCheck();
    // Srdce z balíčku = uhnutí → cíl bez zranění, fáze zpět na PLAY.
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
});

test('Barel + Slab + Úder: srdce v barelu uhne bez druhého Vedle!', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    const c = give(g, 0, CardType.PUNCH, punch());
    board(g, 1, CardType.BARREL);
    g.deck.cards.push({ id: 9002, type: CardType.BANG, suit: Suits.HEARTS, value: '5' });

    g.playBang(0, 1, c);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.players[1].health, 4);   // uhnul – žádný Slab bonus
    assert.equal(g.phase, 'PLAY');
});

// ── Čistá pravidla klienta ───────────────────────────────────────────────────
test('bangEffectReach: dostřel podle range', () => {
    assert.equal(bangEffectReach({ bangEffect: true, range: 1 }), 1);
    assert.equal(bangEffectReach({ bangEffect: true, range: 'any' }), Infinity);
    assert.equal(bangEffectReach({ bangEffect: true, range: 'weapon' }), undefined);
    assert.equal(bangEffectReach({ type: 'Bang!' }), undefined); // ne-bangEffect
});

test('getActionForCard: bang-efekt (ne zelený) → SHOOT', () => {
    assert.equal(getActionForCard({ type: 'Úder', bangEffect: true, range: 1 }, null), 'SHOOT');
    // Zelená karta s bang-efektem se z ruky nemíří (aktivuje se ze stolu – fáze 5).
    assert.notEqual(getActionForCard({ type: 'Nůž', bangEffect: true, green: true, range: 1 }, null), 'SHOOT');
});

test('cardPlayability: Úder hratelný vždy (lze vystřelit i na sebe)', () => {
    // Soused v dostřelu → hratelný.
    const near = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const me = near.players[0];
    const cNear = { type: 'Úder', bangEffect: true, range: 1 };
    assert.equal(cardPlayability(near, me, 0, cNear), true);

    // I bez živého soupeře v dostřelu je hratelný – pravidla umožňují vystřelit na sebe.
    const solo = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 0 }]);
    assert.equal(cardPlayability(solo, solo.players[0], 0, cNear), true);
});
