const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rolesForPlayerCount, baseHealthForCharacter, healthForCharacter,
        TARGET_3P, isThreePlayerMode, firstPlayerIndex } = require('../core/roles.js');

test('rolesForPlayerCount: správné složení rolí podle počtu hráčů', () => {
    assert.deepEqual(rolesForPlayerCount(2), ["Sheriff", "Outlaw"]);
    // Město duchů: hra pro 3 je bez šerifa (role leží lícem nahoru, cíle v kruhu).
    assert.deepEqual(rolesForPlayerCount(3), ["Deputy", "Outlaw", "Renegade"]);
    assert.deepEqual(rolesForPlayerCount(4), ["Sheriff", "Outlaw", "Outlaw", "Renegade"]);
    assert.deepEqual(rolesForPlayerCount(5), ["Sheriff", "Outlaw", "Outlaw", "Renegade", "Deputy"]);
    assert.deepEqual(rolesForPlayerCount(6), ["Sheriff", "Outlaw", "Outlaw", "Outlaw", "Renegade", "Deputy"]);
    assert.deepEqual(rolesForPlayerCount(7), ["Sheriff", "Outlaw", "Outlaw", "Outlaw", "Renegade", "Deputy", "Deputy"]);
});

// Město duchů: 8 hráčů = 1 šerif, 2 pomocníci, 3 bandité, 2 odpadlíci.
test('rolesForPlayerCount: 8 hráčů (Město duchů) – 1/2/3/2', () => {
    const roles = rolesForPlayerCount(8);
    assert.equal(roles.length, 8);
    assert.equal(roles.filter(r => r === "Sheriff").length, 1);
    assert.equal(roles.filter(r => r === "Deputy").length, 2);
    assert.equal(roles.filter(r => r === "Outlaw").length, 3);
    assert.equal(roles.filter(r => r === "Renegade").length, 2);
});

test('rolesForPlayerCount: každá tabulka má právě jednoho šerifa (kromě hry pro 3)', () => {
    for (let n = 2; n <= 8; n++) {
        const roles = rolesForPlayerCount(n);
        assert.equal(roles.length, n);
        // Hra pro 3 (Město duchů) šerifa nemá vůbec – místo něj hraje pomocník.
        assert.equal(roles.filter(r => r === "Sheriff").length, n === 3 ? 0 : 1);
    }
});

// ── Hra pro 3 hráče: kruh cílů a rozpoznání režimu ───────────────────────────
test('TARGET_3P je kruh: pomocník → odpadlík → bandita → pomocník', () => {
    assert.equal(TARGET_3P.Deputy, 'Renegade');
    assert.equal(TARGET_3P.Renegade, 'Outlaw');
    assert.equal(TARGET_3P.Outlaw, 'Deputy');
    // každá role je právě jednou cílem a právě jednou lovcem
    assert.deepEqual(Object.values(TARGET_3P).sort(), Object.keys(TARGET_3P).sort());
});

test('isThreePlayerMode: tři hráči bez šerifa ano, se šerifem (debug) ne', () => {
    const P = (role) => ({ role });
    assert.equal(isThreePlayerMode([P('Deputy'), P('Outlaw'), P('Renegade')]), true);
    assert.equal(isThreePlayerMode([P('Sheriff'), P('Outlaw'), P('Renegade')]), false);
    assert.equal(isThreePlayerMode([P('Deputy'), P('Outlaw')]), false);
    assert.equal(isThreePlayerMode([P('Deputy'), P('Outlaw'), P('Renegade'), P('Outlaw')]), false);
    assert.equal(isThreePlayerMode(null), false);
});

test('firstPlayerIndex: šerif, jinak pomocník, jinak seat 0', () => {
    const P = (role) => ({ role });
    assert.equal(firstPlayerIndex([P('Outlaw'), P('Sheriff'), P('Deputy')]), 1);
    // hra pro 3 (Město duchů) – šerif není, začíná pomocník
    assert.equal(firstPlayerIndex([P('Outlaw'), P('Renegade'), P('Deputy')]), 2);
    assert.equal(firstPlayerIndex([P('Outlaw'), P('Renegade')]), 0);
    assert.equal(firstPlayerIndex([]), 0);
});

test('rolesForPlayerCount: neznámý počet → prázdné pole', () => {
    assert.deepEqual(rolesForPlayerCount(1), []);
    assert.deepEqual(rolesForPlayerCount(9), []);
});

test('baseHealthForCharacter: Paul Regret a El Gringo mají 3, ostatní 4', () => {
    assert.equal(baseHealthForCharacter("Paul Regret"), 3);
    assert.equal(baseHealthForCharacter("El Gringo"), 3);
    assert.equal(baseHealthForCharacter("Bart Cassidy"), 4);
    assert.equal(baseHealthForCharacter("Suzy Lafayette"), 4);
    // A Fistful of Cards: Claus je jediná ze tří postav rozšíření se třemi životy.
    assert.equal(baseHealthForCharacter("Claus the Saint"), 3);
    assert.equal(baseHealthForCharacter("Uncle Will"), 4);
    assert.equal(baseHealthForCharacter("Johnny Kisch"), 4);
});

test('healthForCharacter: šerif má +1, ostatní base', () => {
    assert.deepEqual(healthForCharacter("Bart Cassidy", "Sheriff"), { base: 4, max: 5 });
    assert.deepEqual(healthForCharacter("Bart Cassidy", "Outlaw"), { base: 4, max: 4 });
    assert.deepEqual(healthForCharacter("Paul Regret", "Sheriff"), { base: 3, max: 4 });
    assert.deepEqual(healthForCharacter("El Gringo", "Renegade"), { base: 3, max: 3 });
});
