const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, CardType, Suits } = require('./_helpers.js');

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
