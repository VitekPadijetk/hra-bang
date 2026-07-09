const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { GameState } = require('../logic.js');
const { computeDistance } = require('../core/distance.js');

const cardData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.json'), 'utf8')
);

// GameState i checkWinCondition hojně logují přes console.log – v testech to ztišíme.
before(() => { console.log = () => {}; });

function newGame() {
    const g = new GameState();
    g.cardData = cardData;
    return g;
}

function mkPlayer(role, health) {
    return { role, health, character: null, board: [], weapon: {} };
}

// ── setupGame: rozdělení rolí ──────────────────────────────────────────────
const ROLE_TABLE = {
    2: ['Sheriff', 'Outlaw'],
    3: ['Sheriff', 'Outlaw', 'Renegade'],
    4: ['Sheriff', 'Outlaw', 'Outlaw', 'Renegade'],
    5: ['Sheriff', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy'],
    6: ['Sheriff', 'Outlaw', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy'],
    7: ['Sheriff', 'Outlaw', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy', 'Deputy'],
};

for (const [count, expected] of Object.entries(ROLE_TABLE)) {
    test(`setupGame(${count}) rozdá správnou sadu rolí a přejde do CHARACTER_SELECT`, () => {
        const n = Number(count);
        const g = newGame();
        const names = Array.from({ length: n }, (_, i) => `H${i}`);
        g.setupGame(n, names, {});
        assert.equal(g.players.length, n);
        assert.equal(g.phase, 'CHARACTER_SELECT');
        const roles = g.players.map(p => p.role).sort();
        assert.deepEqual(roles, [...expected].sort());
        // každý hráč má výchozí 2 nabídky postav a Colt .45
        for (const p of g.players) {
            assert.equal(p.charChoices.length, 2);
            assert.equal(p.weapon.name, 'Colt .45');
            assert.equal(p.health, 4);
        }
    });
}

test('setupGame se singleChar dá rovnou jednu postavu', () => {
    const g = newGame();
    g.setupGame(4, ['A', 'B', 'C', 'D'], { singleChar: true });
    for (const p of g.players) {
        assert.equal(p.charChoices.length, 1);
    }
});

// ── getDistance / canHit: delegace na core/distance.js ──────────────────────
test('GameState.getDistance dává stejné výsledky jako sdílená čistá funkce', () => {
    const g = newGame();
    g.players = [
        mkPlayer('Sheriff', 4),
        mkPlayer('Outlaw', 4),
        mkPlayer('Outlaw', 4),
        mkPlayer('Renegade', 4),
    ];
    for (let from = 0; from < 4; from++) {
        for (let to = 0; to < 4; to++) {
            assert.equal(
                g.getDistance(from, to),
                computeDistance({ players: g.players }, from, to)
            );
        }
    }
});

test('GameState.canHit respektuje dostřel zbraně', () => {
    const g = newGame();
    g.players = [
        mkPlayer('Sheriff', 4),
        mkPlayer('Outlaw', 4),
        mkPlayer('Outlaw', 4),
        mkPlayer('Renegade', 4),
    ];
    assert.equal(g.canHit(0, 2), false); // vzdálenost 2, Colt .45 (dostřel 1)
    g.players[0].weapon = { range: 2 };
    assert.equal(g.canHit(0, 2), true);
});

// ── checkWinCondition ───────────────────────────────────────────────────────
test('Zákon vyhraje, když nezbyl žádný Outlaw ani Renegade', () => {
    const g = newGame();
    g.players = [
        mkPlayer('Sheriff', 4),
        mkPlayer('Deputy', 3),
        mkPlayer('Outlaw', 0),
        mkPlayer('Renegade', 0),
    ];
    g.checkWinCondition();
    assert.equal(g.winner, 'Zákon vyhrál!');
});

test('Bandité vyhrají, když padne šerif a zůstává víc hráčů', () => {
    const g = newGame();
    g.players = [
        mkPlayer('Sheriff', 0),
        mkPlayer('Outlaw', 4),
        mkPlayer('Deputy', 2),
    ];
    g.checkWinCondition();
    assert.equal(g.winner, 'Bandité vyhráli!');
});

test('Odpadlík vyhraje, když zůstane sám po smrti šerifa', () => {
    const g = newGame();
    g.players = [
        mkPlayer('Sheriff', 0),
        mkPlayer('Renegade', 4),
        mkPlayer('Outlaw', 0),
    ];
    g.checkWinCondition();
    assert.equal(g.winner, 'Odpadlík vyhrál!');
});

test('Bez splněné podmínky zůstává winner null', () => {
    const g = newGame();
    g.players = [
        mkPlayer('Sheriff', 4),
        mkPlayer('Outlaw', 4),
    ];
    g.checkWinCondition();
    assert.equal(g.winner, null);
});
