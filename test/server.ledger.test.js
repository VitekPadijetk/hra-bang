// Testy ledgeru chování (server/ledger.js): recordBehavior + initLedger.
const { test } = require('node:test');
const assert = require('node:assert/strict');

function buildCtx() {
    const ctx = {};
    require('../server/ledger.js')(ctx);
    return ctx;
}

test('recordBehavior inkrementuje hostilní/supportivní počítadla dvojice', () => {
    const ctx = buildCtx();
    const room = {};
    ctx.recordBehavior(room, { actorIdx: 1, targetIdx: 0, kind: 'hostile' });
    ctx.recordBehavior(room, { actorIdx: 1, targetIdx: 0, kind: 'hostile' });
    ctx.recordBehavior(room, { actorIdx: 2, targetIdx: 0, kind: 'support' });
    assert.equal(room.behaviorLedger.pairs[1][0].hostile, 2);
    assert.equal(room.behaviorLedger.pairs[1][0].support, 0);
    assert.equal(room.behaviorLedger.pairs[2][0].support, 1);
});

test('recordBehavior ignoruje útok na sebe a chybějící indexy', () => {
    const ctx = buildCtx();
    const room = {};
    ctx.recordBehavior(room, { actorIdx: 1, targetIdx: 1, kind: 'hostile' }); // self
    ctx.recordBehavior(room, { actorIdx: null, targetIdx: 0, kind: 'hostile' });
    ctx.recordBehavior(room, { actorIdx: 1, targetIdx: null, kind: 'hostile' });
    assert.deepEqual(room.behaviorLedger?.pairs?.[1] ?? {}, {});
});

test('initLedger vynuluje ledger (nová hra nezdědí stará podezření)', () => {
    const ctx = buildCtx();
    const room = {};
    ctx.recordBehavior(room, { actorIdx: 1, targetIdx: 0, kind: 'hostile' });
    ctx.initLedger(room);
    assert.deepEqual(room.behaviorLedger, { pairs: {} });
});

test('recordBehavior bez ledgeru si ho lazy-vytvoří', () => {
    const ctx = buildCtx();
    const room = {};
    ctx.recordBehavior(room, { actorIdx: 0, targetIdx: 2, kind: 'hostile' });
    assert.equal(room.behaviorLedger.pairs[0][2].hostile, 1);
});
