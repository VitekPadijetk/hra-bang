const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── Promíchání odhozu při prázdném balíčku ───────────────────────────────────
test('Prázdný balíček se při lízání promíchá z odhozu (vrchní zůstává)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const a = mkCard(CardType.BANG, { name: 'a' });
    const b = mkCard(CardType.BEER, { name: 'b' });
    const c = mkCard(CardType.MISSED, { name: 'c' });
    const d = mkCard(CardType.PANIC, { name: 'd' });
    g.deck.cards = [];
    g.deck.discardPile = [a, b, c, d]; // d je vrchní odhoz

    const drawn = g.deck.draw();

    // vrchní karta odhozu (d) zůstává v odhozu, zbytek se zamíchal do balíčku
    assert.ok([a, b, c].includes(drawn));
    assert.equal(g.deck.discardPile.length, 1);
    assert.equal(g.deck.discardPile[0].name, 'd');
    assert.equal(g.deck.cards.length, 2); // ze 3 zamíchaných jedna líznuta
});

// Bug 39: sejmutí (Dynamit/Vězení/Barel/Vendeta/Lucky Duke/Helena Zontero) vrací kartu
// hned do odhozu, takže si míchání nemusí schovávat vrchní kartu „aby odhoz nezůstal
// prázdný". Bez toho zbyly po sejmutí poslední karty z balíčku v odhozu DVĚ karty:
// stará nezamíchaná vrchní a na ní sejmutá.
test('Sejmutí poslední karty: zamíchá se CELÝ odhoz, v odhozu zůstane jen sejmutá', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const last = mkCard(CardType.BANG, { name: 'sejmutá' });
    g.deck.cards = [last];
    g.deck.discardPile = [mkCard(CardType.BEER, { name: 'a' }), mkCard(CardType.MISSED, { name: 'b' }),
                          mkCard(CardType.PANIC, { name: 'c' })];

    const drawn = g.deck.draw({ toDiscard: true });
    assert.equal(drawn.name, 'sejmutá');
    assert.equal(g.deck.discardPile.length, 0, 'celý odhoz se zamíchal do balíčku');
    assert.equal(g.deck.cards.length, 3);

    g.deck.discard(drawn);
    assert.equal(g.deck.discardPile.length, 1);
    assert.equal(g.deck.discardPile[0].name, 'sejmutá');
});

test('Dynamit: sejmutí poslední karty nenechá v odhozu starou kartu', () => {
    const g = mkGame([{ role: 'Sheriff', health: 4 }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.discardPile = [mkCard(CardType.BEER, { name: 'a' }), mkCard(CardType.MISSED, { name: 'b' })];
    g.deck.cards = [mkCard(CardType.BANG, { name: 'sejmutá', suit: Suits.HEARTS, value: '5' })];

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();

    assert.equal(g.deck.discardPile.length, 1, 'v odhozu je jen sejmutá karta');
    assert.equal(g.deck.discardPile[0].name, 'sejmutá');
    assert.equal(g.deck.cards.length, 2, 'stará vrchní karta se zamíchala do balíčku');
});

// Běžné líznutí do ruky se nemění: vrchní karta odhozu zůstává ležet (odhoz nezůstane
// prázdný, karta v ruce ho nenahradí).
test('Běžné líznutí poslední karty: vrchní karta odhozu zůstává', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.deck.cards = [mkCard(CardType.BANG, { name: 'do ruky' })];
    g.deck.discardPile = [mkCard(CardType.BEER, { name: 'a' }), mkCard(CardType.MISSED, { name: 'vrchní' })];
    g.deck.draw();
    assert.equal(g.deck.discardPile.length, 1);
    assert.equal(g.deck.discardPile[0].name, 'vrchní');
});

test('Prázdný balíček i odhoz → draw() vrátí null', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.deck.cards = [];
    g.deck.discardPile = [];
    assert.equal(g.deck.draw(), null);
});

// ── Hokynářství ──────────────────────────────────────────────────────────────
test('Hokynářství vyloží karty (1 na živého hráče) a hráči si berou po jedné', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const store = give(g, 0, CardType.STORE, { name: 'Hokynářství' });
    g.deck.cards = [
        mkCard(CardType.MISSED, { name: 'rezerva' }),
        mkCard(CardType.BEER, { name: 'Y' }),
        mkCard(CardType.BANG, { name: 'X' }),
    ];

    g.playCard(store);
    assert.equal(g.phase, 'STORE');
    assert.equal(g.storeCards.length, 2); // 2 živí hráči
    assert.equal(g.storePickerIndex, 0);

    g.pickFromStore(0); // bere hráč 0
    assert.equal(g.storePickerIndex, 1);
    g.pickFromStore(1); // bere hráč 1

    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});
