const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── Bart Cassidy: za každý zásah líznutí ─────────────────────────────────────
test('Bart Cassidy si po zásahu lízne kartu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Bart Cassidy', health: 2 }]);
    const bang = give(g, 0, CardType.BANG);
    g.deck.cards = []; topDeck(g, Suits.CLUBS);

    g.playBang(0, 1, bang);
    g.handleResponse(1, null); // zásah → Bart do fronty
    assert.equal(g.phase, 'BART_DRAW');

    g.bartCassidyDraw(1);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

// ── El Gringo: ukradne útočníkovi kartu ──────────────────────────────────────
test('El Gringo po zásahu ukradne útočníkovi kartu z ruky', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'El Gringo', health: 2 }]);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BEER); // zbyde útočníkovi po výstřelu, tohle El Gringo ukradne

    g.playBang(0, 1, 0);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'EL_GRINGO_STEAL');

    g.elGringoSteal(1);
    assert.equal(g.players[1].hand.length, 1); // ukradl
    assert.equal(g.players[0].hand.length, 0); // útočník přišel o kartu
    assert.equal(g.phase, 'PLAY');
});

// ── Suzy Lafayette: prázdná ruka → líznutí ───────────────────────────────────
test('Suzy Lafayette si po vyprázdnění ruky lízne kartu', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Suzy Lafayette', health: 2 }, { role: 'Outlaw' }]);
    const beer = give(g, 0, CardType.BEER); // jediná karta
    g.deck.cards = []; topDeck(g, Suits.CLUBS);

    g.playCard(beer); // ruka se vyprázdní → Suzy do fronty
    assert.equal(g.phase, 'SUZY_DRAW'); // čeká na líznutí (samostatný krok)

    g.suzyLafayetteDraw(0);
    assert.equal(g.players[0].hand.length, 1); // líznula novou
    assert.equal(g.phase, 'PLAY');
});

// ── Sid Ketchum: odhodí 2 karty → +1 život ───────────────────────────────────
test('Sid Ketchum odhodí 2 karty a vyléčí si 1 život', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Sid Ketchum', health: 2 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.MISSED);

    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].hand.length, 0);
});

test('Sid Ketchum se nevyléčí nad maximum', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Sid Ketchum', health: 4 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.MISSED);
    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.players[0].hand.length, 2); // nic se neodhodilo
});

// ── Vulture Sam: bere karty po mrtvých ───────────────────────────────────────
test('Vulture Sam sebere ruku i stůl mrtvého hráče', () => {
    const g = mkGame([
        { role: 'Outlaw', character: 'Vulture Sam' },
        { role: 'Outlaw', health: 0 },
        { role: 'Sheriff' },
    ]);
    give(g, 1, CardType.BEER);
    board(g, 1, CardType.BARREL, { name: 'Barel' });

    g.handlePlayerDeath(1);
    assert.equal(g.players[0].hand.length, 2); // sebral 1 z ruky + 1 ze stolu
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.players[1].board.length, 0);
});
