const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDistance, computeCanHit } = require('../core/distance.js');

// Pomocníci pro tvorbu deterministických stavů
function P(opts = {}) {
    return {
        health: opts.health ?? 4,
        character: opts.character ?? null,
        board: opts.board ?? [],
        weapon: opts.weapon ?? {},
    };
}
function st(players) { return { players }; }

const MUSTANG = { effect: 'mustang' };
const SCOPE = { effect: 'scope' };

test('vzdálenost v kruhu 4 hráčů (bez modifikátorů)', () => {
    const s = st([P(), P(), P(), P()]);
    assert.equal(computeDistance(s, 0, 1), 1);
    assert.equal(computeDistance(s, 0, 2), 2);
    assert.equal(computeDistance(s, 0, 3), 1); // přes okraj kruhu
    assert.equal(computeDistance(s, 1, 3), 2);
});

test('mrtví hráči se z kruhu vynechávají', () => {
    const s = st([P(), P({ health: 0 }), P(), P()]); // hráč 1 mrtvý
    // živí: indexy 0,2,3 -> 0 a 2 jsou nově sousední
    assert.equal(computeDistance(s, 0, 2), 1);
    assert.equal(computeDistance(s, 0, 3), 1);
});

test('mrtvý nebo neexistující cíl vrací 999', () => {
    const s = st([P(), P(), P({ health: 0 }), P()]);
    assert.equal(computeDistance(s, 0, 2), 999); // cíl mrtvý
    assert.equal(computeDistance(s, 0, 99), 999); // mimo rozsah
});

test('Paul Regret jako cíl přidává +1', () => {
    const s = st([P(), P(), P({ character: 'Paul Regret' }), P()]);
    assert.equal(computeDistance(s, 0, 2), 3); // základ 2 + 1
});

test('Rose Doolan jako útočník odečítá -1 (min 1)', () => {
    const s = st([P({ character: 'Rose Doolan' }), P(), P(), P()]);
    assert.equal(computeDistance(s, 0, 2), 1); // základ 2 - 1
    assert.equal(computeDistance(s, 0, 1), 1); // základ 1 - 1 -> min 1
});

test('Mustang na cíli +1, Hledí (scope) na útočníkovi -1', () => {
    const mustangCible = st([P(), P(), P({ board: [MUSTANG] }), P()]);
    assert.equal(computeDistance(mustangCible, 0, 2), 3);
    const scopeUtocnik = st([P({ board: [SCOPE] }), P(), P(), P()]);
    assert.equal(computeDistance(scopeUtocnik, 0, 2), 1);
});

test('canHit zohledňuje dostřel zbraně (range i props.range)', () => {
    const base = [P(), P(), P(), P()]; // vzdálenost 0->2 je 2
    assert.equal(computeCanHit(st(base), 0, 2), false); // Colt .45 (dostřel 1)
    const withRange = [P({ weapon: { range: 2 } }), P(), P(), P()];
    assert.equal(computeCanHit(st(withRange), 0, 2), true);
    const withProps = [P({ weapon: { props: { range: 3 } } }), P(), P(), P()];
    assert.equal(computeCanHit(st(withProps), 0, 2), true);
});
