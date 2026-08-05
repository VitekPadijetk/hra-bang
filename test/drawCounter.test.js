// Počítadlo naklikaných líznutí (core/drawCounter.js). Regrese k záseku: řetěz
// kill-rewardů (odměna za banditu → Herb Hunter) přejde z fáze DRAW rovnou do DRAW
// jiného hráče; bez resetu se rozdíl (0 − 3) přičetl k pendingDrawCount a balíček
// druhého hráče zůstal nekliknutelný.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextDrawCounters } = require('../core/drawCounter.js');

const ds = (playerIdx, cardsDrawn) => ({ playerIdx, cardsDrawn, active: true });

test('potvrzené karty ubírají z počítadla kliků', () => {
    let s = nextDrawCounters(null, 'DRAW', ds(0, 0));
    assert.deepEqual(s, { pendingDrawCount: 0, lastConfirmedDrawn: 0, lastDrawOwner: 0 });
    s.pendingDrawCount = 2;                       // hráč rychle dvakrát klikl
    s = nextDrawCounters(s, 'DRAW', ds(0, 1));    // server potvrdil první
    assert.equal(s.pendingDrawCount, 1);
    s = nextDrawCounters(s, 'DRAW', ds(0, 2));    // a druhou
    assert.equal(s.pendingDrawCount, 0);
});

test('mimo fázi lízání se počítadlo nuluje', () => {
    const s = nextDrawCounters({ pendingDrawCount: 2, lastConfirmedDrawn: 2, lastDrawOwner: 0 }, 'PLAY', null);
    assert.deepEqual(s, { pendingDrawCount: 0, lastConfirmedDrawn: 0, lastDrawOwner: null });
});

test('DRAW → DRAW jiného hráče (kill-reward řetěz) počítadlo vynuluje', () => {
    // Zabiják dolízal 3 karty za banditu…
    let s = nextDrawCounters({ pendingDrawCount: 0, lastConfirmedDrawn: 3, lastDrawOwner: 1 }, 'DRAW', ds(3, 0));
    // …a rovnou navazuje lízání Herb Huntera (jiný hráč, cardsDrawn zpět na 0).
    assert.equal(s.pendingDrawCount, 0);          // dřív vyšlo 3 → balíček nešel rozkliknout
    assert.equal(s.lastConfirmedDrawn, 0);
    assert.equal(s.lastDrawOwner, 3);
});

test('nový cyklus lízání téhož hráče (cardsDrawn klesne) taky nuluje', () => {
    const s = nextDrawCounters({ pendingDrawCount: 0, lastConfirmedDrawn: 2, lastDrawOwner: 2 }, 'DRAW', ds(2, 0));
    assert.equal(s.pendingDrawCount, 0);
    assert.equal(s.lastConfirmedDrawn, 0);
});
