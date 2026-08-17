const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rolesForPlayerCount, baseHealthForCharacter, healthForCharacter } = require('../core/roles.js');

test('rolesForPlayerCount: správné složení rolí podle počtu hráčů', () => {
    assert.deepEqual(rolesForPlayerCount(2), ["Sheriff", "Outlaw"]);
    assert.deepEqual(rolesForPlayerCount(3), ["Sheriff", "Outlaw", "Renegade"]);
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

test('rolesForPlayerCount: každá tabulka má právě jednoho šerifa', () => {
    for (let n = 2; n <= 8; n++) {
        const roles = rolesForPlayerCount(n);
        assert.equal(roles.length, n);
        assert.equal(roles.filter(r => r === "Sheriff").length, 1);
    }
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
});

test('healthForCharacter: šerif má +1, ostatní base', () => {
    assert.deepEqual(healthForCharacter("Bart Cassidy", "Sheriff"), { base: 4, max: 5 });
    assert.deepEqual(healthForCharacter("Bart Cassidy", "Outlaw"), { base: 4, max: 4 });
    assert.deepEqual(healthForCharacter("Paul Regret", "Sheriff"), { base: 3, max: 4 });
    assert.deepEqual(healthForCharacter("El Gringo", "Renegade"), { base: 3, max: 3 });
});
