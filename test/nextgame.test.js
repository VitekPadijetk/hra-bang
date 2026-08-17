const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { GameState, cardData } = require('./_helpers.js');

before(() => { console.log = () => {}; });

function newGame() {
    const g = new GameState();
    g.cardData = cardData;
    return g;
}

// ── Rozdání rolí pro další hru ────────────────────────────────────────────────
test('setupNextGame rozdá správnou sadu rolí (4 hráči)', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C', 'D'], {}, {});
    assert.deepEqual(g.players.map(p => p.role).sort(), ['Outlaw', 'Outlaw', 'Renegade', 'Sheriff']);
    assert.equal(g.phase, 'CHARACTER_SELECT');
});

test('setupNextGame: rotující šerif připadne určenému hráči', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C', 'D'], {}, {}, 'B');
    assert.equal(g.players[1].role, 'Sheriff');
    assert.deepEqual(g.players.map(p => p.role).sort(), ['Outlaw', 'Outlaw', 'Renegade', 'Sheriff']);
});

// Ve hře pro 3 (Město duchů) šerif není – rotuje se pomocník, tedy hráč, který začíná.
// Dřív filter('Sheriff') neodebral nic a splice by do 3členné hry přidal ČTVRTOU roli.
test('setupNextGame pro 3 hráče rotuje pomocníka a nepřidá čtvrtou roli', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C'], {}, {}, 'C');
    assert.equal(g.players.length, 3);
    assert.equal(g.players[2].role, 'Deputy');
    assert.deepEqual(g.players.map(p => p.role).sort(), ['Deputy', 'Outlaw', 'Renegade']);
    assert.equal(g.mode3p, true);
});

test('setupNextGame bez přeživších rovnou nabídne postavy', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C'], {}, {});
    for (const p of g.players) {
        assert.equal(p.charChoices.length, 2);
        assert.equal(p.character, null);
    }
});

// ── Přeživší si drží / odmítá postavu ────────────────────────────────────────
test('Přeživší dostane nabídku ponechat postavu; ta je vyhrazená ostatním', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C'], { 0: 'Willy the Kid' }, {});

    assert.equal(g.players[0]._survivorChar, 'Willy the Kid');
    assert.equal(g.players[0]._awaitingKeepChoice, true);
    assert.equal(g.players[1].charChoices, undefined); // čeká se na přeživšího

    g.selectCharacterForNextGame(0); // ponechá si Willyho
    assert.equal(g.players[0].character, 'Willy the Kid');
    assert.equal(g.players[0]._awaitingKeepChoice, false);

    // teprve teď dostanou ostatní nabídku – a Willy mezi ní není
    assert.equal(g.players[1].charChoices.length, 2);
    const offered = [...g.players[1].charChoices, ...g.players[2].charChoices];
    assert.ok(!offered.includes('Willy the Kid'));
});

test('Přeživší odmítne postavu → dostane normální výběr', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C'], { 0: 'Willy the Kid' }, {});

    g.rejectCharacterForNextGame(0);
    assert.equal(g.players[0].character, null);
    assert.equal(g.players[0]._awaitingKeepChoice, false);
    assert.equal(g.players[0].charChoices.length, 2);
});

// ── Životy přeživšího pro intro navazující hry ───────────────────────────────
test('setupNextGame si pamatuje životy přeživšího (pro rozložení desky v intru)', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C'], { 0: 'Willy the Kid' }, {}, null, { 0: 2 });
    assert.equal(g.players[0]._survivorHealth, 2);
    // Bez údaje o životech (starší volání) se nic nerozbije
    const g2 = newGame();
    g2.setupNextGame(['A', 'B', 'C'], { 0: 'Willy the Kid' }, {});
    assert.equal(g2.players[0]._survivorHealth, null);
});

test('Ponechaná postava se dolije na maximum a nastaví _baseHealth (počet startovních karet)', () => {
    const g = newGame();
    // Šerif si nechá 4životou postavu → max 5, ale startovních karet 4.
    g.setupNextGame(['A', 'B', 'C', 'D'], { 0: 'Willy the Kid' }, {}, 'A', { 0: 1 });
    assert.equal(g.players[0].role, 'Sheriff');
    g.selectCharacterForNextGame(0);
    assert.equal(g.players[0].health, 5);
    assert.equal(g.players[0].maxHealth, 5);
    assert.equal(g.players[0]._baseHealth, 4);
    assert.equal(g.players[0]._survivorHealth, null);
});

test('Odmítnutá postava zahodí i zapamatované životy', () => {
    const g = newGame();
    g.setupNextGame(['A', 'B', 'C'], { 0: 'Paul Regret' }, {}, null, { 0: 3 });
    g.rejectCharacterForNextGame(0);
    assert.equal(g.players[0]._survivorHealth, null);
});
