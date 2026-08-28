// Rozšíření Divoký západ – postavy (fáze 4: Big Spencer, Gary Looter, John Pain,
// Flint Westwood, Youl Grinner). Texty karet jsou v docs/wild-west-show-plan.md §5.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { playsAsMissed, playsAsBang, rouletteDiscardable, bigSpencerBlocked } = require('../core/playability.js');
const { startCardsForCharacter, baseHealthForCharacter, healthForCharacter } = require('../core/roles.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const wws = key => wwsData.find(c => c.key === key);

const bang = (g, i, o = {}) => give(g, i, CardType.BANG, { name: 'Bang!', ...o });
const miss = (g, i, o = {}) => give(g, i, CardType.MISSED, { name: 'Vedle!', ...o });

// ── Big Spencer ─────────────────────────────────────────────────────────────

test('Big Spencer: 9 životů (10 jako šerif), ale jen 5 startovních karet', () => {
    assert.equal(baseHealthForCharacter('Big Spencer'), 9);
    assert.equal(healthForCharacter('Big Spencer', 'Sheriff').max, 10);
    assert.equal(startCardsForCharacter('Big Spencer', 9), 5);
    // Ostatní postavy startovní ruku nemění.
    assert.equal(startCardsForCharacter('Bart Cassidy', 4), 4);
    assert.equal(startCardsForCharacter('Paul Regret', 3), 3);
});

test('Big Spencer nesmí zahrát kartu Vedle!, ale Úhyb ano', () => {
    const g = mkGame([{ character: 'Big Spencer' }, {}]);
    const m = miss(g, 0);
    const u = give(g, 0, CardType.UHYB, { name: 'Úhyb' });
    assert.equal(playsAsMissed(g, g.players[0], g.players[0].hand[m]), false);
    assert.equal(playsAsMissed(g, g.players[0], g.players[0].hand[u]), true);
    assert.equal(bigSpencerBlocked(g.players[0], g.players[0].hand[m]), true);
});

test('Big Spencer se Vedle! neubrání ani ve fázi RESPOND', () => {
    const g = mkGame([{}, { character: 'Big Spencer' }]);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'RESPOND');
    const m = miss(g, 1);
    g.handleResponse(1, m);
    assert.equal(g.phase, 'RESPOND', 'karta Vedle! se neuplatnila');
    assert.equal(g.players[1].hand.length, 1, 'a zůstala v ruce');
});

test('Big Spencer × Zúčtování: kartu BANG! jako Vedle! zahrát smí (R9)', () => {
    const g = mkGame([{}, { character: 'Big Spencer' }]);
    g.activeWws = wws('ZUCTOVANI');
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    const mb = bang(g, 1);
    assert.equal(playsAsMissed(g, g.players[1], g.players[1].hand[mb]), true);
    g.handleResponse(1, mb);
    assert.equal(g.players[1].health, 4, 'ubránil se kartou Bang!');
});

test('Big Spencer: kartu Vedle! smí ODHODIT (Ruská ruleta), jen ne zahrát', () => {
    const g = mkGame([{ character: 'Big Spencer' }, {}]);
    const m = miss(g, 0);
    assert.equal(rouletteDiscardable(g, g.players[0], g.players[0].hand[m], false), true);
});

test('Big Spencer: limit karet v ruce = životy, tedy až 9', () => {
    const g = mkGame([{ character: 'Big Spencer', maxHealth: 9 }, {}]);
    assert.equal(g._handLimit(g.players[0]), 9);
});

test('Big Spencer: Barel funguje dál (není to karta Vedle!, FAQ Q07)', () => {
    const g = mkGame([{}, { character: 'Big Spencer' }]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.HEARTS);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'BARREL_DRAW', 'Barel se ptá na sejmutí');
});

// ── Gary Looter ─────────────────────────────────────────────────────────────

// Odhoz nad limit: hráč 0 má víc karet než životů a jednu odhodí.
function mkDiscard(specs, opts = {}) {
    const g = mkGame(specs, { phase: 'DISCARD', current: 0, ...opts });
    return g;
}

test('Gary Looter: 5 životů (6 jako šerif)', () => {
    assert.equal(baseHealthForCharacter('Gary Looter'), 5);
    assert.equal(healthForCharacter('Gary Looter', 'Sheriff').max, 6);
});

test('Gary Looter si bere kartu odhozenou nad limit na konci cizího tahu', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter' }]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    const taken = g.players[0].hand[1];
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.players[1].hand[0], taken);
    assert.equal(g.deck.discardPile.length, 0, 'do odhozu se nedostala');
});

test('Gary Looter si SVOJE odhozené karty nebere (FAQ Q14)', () => {
    const g = mkDiscard([{ character: 'Gary Looter', health: 1 }, {}]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[0].hand.length, 1, 'karta z ruky opravdu odešla');
    assert.equal(g.deck.discardPile.length, 1, 'a skončila v odhozu');
});

test('Gary Looter: víc Garyů → bere první po směru od odhazujícího (R6)', () => {
    const g = mkDiscard([{ health: 1 }, {}, { character: 'Gary Looter' },
                         { character: 'Gary Looter' }]);
    // Kopii dělá Vera Custer; tady stačí, že mají oba stejnou effectiveCharacter.
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[3].hand.length, 0);
});

test('Gary Looter: mrtvý nebere', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter', health: 0 }]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.deck.discardPile.length, 1);
});

test('Gary Looter: Kocovina (High Noon) schopnost vypíná', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter' }]);
    g.players[1]._noAbility = true;
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.deck.discardPile.length, 1);
});

test('Gary Looter vyhrává nad Opuštěným dolem – karta se na balíček nedostane (R7)', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter' }]);
    g._mineTurn = true;
    const before = g.deck._drawPile.length;
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.deck._drawPile.length, before, 'na dobírací balíček nešla');
});

test('Gary Looter: odhoz MIMO konec tahu (Sid Ketchum) se ho netýká', () => {
    const g = mkGame([{ character: 'Sid Ketchum', health: 2 }, { character: 'Gary Looter' }]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[1].hand.length, 0, 'Gary nic nedostal');
});

// ── John Pain ───────────────────────────────────────────────────────────────

test('John Pain si bere kartu ze sejmutí na Vězení (a až po jeho vyhodnocení)', () => {
    const g = mkGame([{ character: 'John Pain' }, {}]);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw();
    const checkCard = g.currentCheck.card;
    // Dokud se sejmutí nevyhodnotí, karta je pořád v odhozu.
    assert.equal(g.players[0].hand.length, 0);
    g.resolveCheck();
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[0].hand[0].id, checkCard.id);
});

test('John Pain: s 6 kartami v ruce už nebere', () => {
    const g = mkGame([{ character: 'John Pain' }, {}]);
    for (let i = 0; i < 6; i++) give(g, 0, CardType.BANG, { name: 'Bang!' });
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].hand.length, 6);
});

test('John Pain bere i cizí sejmutí (barel soupeře)', () => {
    const g = mkGame([{}, {}, { character: 'John Pain' }]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.HEARTS);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'BARREL_DRAW');
    g.triggerBarrelDraw();
    const checkCard = g.currentCheck.card;
    g.resolveCheck();
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[2].hand[0].id, checkCard.id);
});

test('John Pain: neuhnutý barel → kartu dostane až PO dohrané obraně', () => {
    const g = mkGame([{}, { character: 'John Pain' }]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.SPADES);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND', 'barel neuhnul, brání se dál');
    assert.equal(g.players[1].hand.length, 0, 'sejmutou kartou se bránit nesmí');
    g.handleResponse(1, null);   // nechá se zasáhnout
    assert.equal(g.players[1].hand.length, 1, 'teprve teď si ji vezme');
});

test('John Pain × Lucky Duke: bere OBĚ karty (Sciarra Q22)', () => {
    // Snímá Lucky Duke, John Pain sedí vedle něj.
    const g2 = mkGame([{ character: 'Lucky Duke' }, { character: 'John Pain' }]);
    board(g2, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g2, Suits.HEARTS, 'K');
    topDeck(g2, Suits.CLUBS, '7');
    g2.handleStartOfTurnChecks();
    g2.triggerCheckDraw();
    assert.equal(g2.phase, 'LUCKY_DUKE');
    g2.luckyDukePick(0);
    assert.equal(g2.players[1].hand.length, 2, 'obě sejmuté karty');
});

test('John Pain × Lucky Duke: s 5 kartami bere jen tu první (Q22)', () => {
    const g = mkGame([{ character: 'Lucky Duke' }, { character: 'John Pain' }]);
    for (let i = 0; i < 5; i++) give(g, 1, CardType.BANG, { name: 'Bang!' });
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    topDeck(g, Suits.CLUBS, '7');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    const first = g.luckyDukeState.cards[0];
    g.luckyDukePick(0);
    assert.equal(g.players[1].hand.length, 6);
    assert.equal(g.players[1].hand[5].id, first.id, 'ta první v pořadí snímání');
});

test('John Pain: víc Johnů → bere první po směru od snímajícího (FAQ Q11)', () => {
    const g = mkGame([{}, {}, { character: 'John Pain' }, { character: 'John Pain' }]);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[3].hand.length, 0);
});

test('John Pain: Kocovina (High Noon) schopnost vypíná', () => {
    const g = mkGame([{ character: 'John Pain' }, {}]);
    g.players[0]._noAbility = true;
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].hand.length, 0);
});

test('John Pain × dynamit: kartu dostane až po všech třech zásazích', () => {
    const g = mkGame([{ character: 'John Pain', maxHealth: 5, health: 5 }, {}]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    topDeck(g, Suits.SPADES, '5');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].hand.length, 0, 'uprostřed výbuchu kartu ještě nemá');
    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].hand.length, 1);
});
