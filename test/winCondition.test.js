const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateWinner } = require('../core/winCondition.js');

function P(role, health = 4) { return { role, health }; }

test('evaluateWinner: hra pokračuje → null', () => {
    assert.equal(evaluateWinner([P("Sheriff"), P("Outlaw"), P("Renegade")]), null);
    assert.equal(evaluateWinner([P("Sheriff"), P("Renegade")]), null);
});

test('evaluateWinner: zákon vyhrál (šerif žije, žádní banditi/odpadlíci)', () => {
    assert.equal(evaluateWinner([P("Sheriff"), P("Deputy"), P("Outlaw", 0), P("Renegade", 0)]), "Zákon vyhrál!");
});

test('evaluateWinner: bandité vyhráli (šerif mrtvý, zůstává víc hráčů)', () => {
    assert.equal(evaluateWinner([P("Sheriff", 0), P("Outlaw"), P("Renegade")]), "Bandité vyhráli!");
    assert.equal(evaluateWinner([P("Sheriff", 0), P("Outlaw")]), "Bandité vyhráli!");
});

test('evaluateWinner: odpadlík vyhrál (poslední živý je Renegade)', () => {
    assert.equal(evaluateWinner([P("Sheriff", 0), P("Outlaw", 0), P("Renegade")]), "Odpadlík vyhrál!");
});

test('evaluateWinner: šerif mrtvý a poslední živý NENÍ odpadlík → bandité', () => {
    assert.equal(evaluateWinner([P("Sheriff", 0), P("Outlaw"), P("Renegade", 0)]), "Bandité vyhráli!");
});
