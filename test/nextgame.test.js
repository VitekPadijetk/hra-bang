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
    g.setupNextGame(['A', 'B', 'C'], {}, {}, 'B');
    assert.equal(g.players[1].role, 'Sheriff');
    assert.deepEqual(g.players.map(p => p.role).sort(), ['Outlaw', 'Renegade', 'Sheriff']);
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
