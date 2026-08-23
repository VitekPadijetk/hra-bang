// Počítadlo naklikaných líznutí (core/drawCounter.js). Regrese k záseku: řetěz
// kill-rewardů (odměna za banditu → Herb Hunter) přejde z fáze DRAW rovnou do jiné
// fáze DRAW; bez resetu se rozdíl (0 − 3) přičetl k pendingDrawCount a balíček
// zůstal nekliknutelný.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextDrawCounters } = require('../core/drawCounter.js');

const ds = (playerIdx, cardsDrawn, drawId) => ({ playerIdx, cardsDrawn, drawId, active: true });

test('potvrzené karty ubírají z počítadla kliků', () => {
    let s = nextDrawCounters(null, 'DRAW', ds(0, 0, 1));
    assert.deepEqual(s, { pendingDrawCount: 0, lastConfirmedDrawn: 0, lastDrawOwner: 0, lastDrawId: 1 });
    s.pendingDrawCount = 2;                          // hráč rychle dvakrát klikl
    s = nextDrawCounters(s, 'DRAW', ds(0, 1, 1));    // server potvrdil první
    assert.equal(s.pendingDrawCount, 1);
    s = nextDrawCounters(s, 'DRAW', ds(0, 2, 1));    // a druhou
    assert.equal(s.pendingDrawCount, 0);
});

test('mimo fázi lízání se počítadlo nuluje', () => {
    const s = nextDrawCounters({ pendingDrawCount: 2, lastConfirmedDrawn: 2, lastDrawOwner: 0, lastDrawId: 1 }, 'PLAY', null);
    assert.deepEqual(s, { pendingDrawCount: 0, lastConfirmedDrawn: 0, lastDrawOwner: null, lastDrawId: null });
});

test('DRAW → DRAW jiného hráče (kill-reward řetěz) počítadlo vynuluje', () => {
    // Zabiják dolízal 3 karty za banditu…
    let s = nextDrawCounters({ pendingDrawCount: 0, lastConfirmedDrawn: 3, lastDrawOwner: 1, lastDrawId: 7 }, 'DRAW', ds(3, 0, 8));
    // …a rovnou navazuje lízání Herb Huntera (jiný hráč, cardsDrawn zpět na 0).
    assert.equal(s.pendingDrawCount, 0);          // dřív vyšlo 3 → balíček nešel rozkliknout
    assert.equal(s.lastConfirmedDrawn, 0);
    assert.equal(s.lastDrawOwner, 3);
});

test('nový cyklus lízání téhož hráče (cardsDrawn klesne) taky nuluje', () => {
    const s = nextDrawCounters({ pendingDrawCount: 0, lastConfirmedDrawn: 2, lastDrawOwner: 2, lastDrawId: 3 }, 'DRAW', ds(2, 0, 4));
    assert.equal(s.pendingDrawCount, 0);
    assert.equal(s.lastConfirmedDrawn, 0);
});

// Herb Hunter, který sám zabije banditu: líže 2 (schopnost) + 3 (odměna) ZA SEBE.
// Oba broadcasty jsou odložené o dobu animace, takže první z nich už nese stav DRUHÉ
// fáze (cardsDrawn 0) – vlastník se nezměnil a cardsDrawn neklesl. Bez drawId zůstalo
// v počítadle 2 nepotvrzené kliky navždy a po první kartě z odměny se balíček zhasnul.
test('DRAW → DRAW téhož hráče (Herb Hunter + odměna za banditu) pozná drawId', () => {
    let s = nextDrawCounters(null, 'DRAW', ds(1, 0, 10));   // začátek Herbových 2 karet
    s.pendingDrawCount = 2;                                  // dva rychlé kliky
    // Odložený broadcast doručí rovnou stav navazující odměny (nová fáze, drawId 11).
    s = nextDrawCounters(s, 'DRAW', ds(1, 0, 11));
    assert.equal(s.pendingDrawCount, 0);
    assert.equal(s.lastDrawId, 11);
    // Klik na první ze tří karet odměny se pak řádně odečte.
    s.pendingDrawCount = 1;
    s = nextDrawCounters(s, 'DRAW', ds(1, 1, 11));
    assert.equal(s.pendingDrawCount, 0);
});
