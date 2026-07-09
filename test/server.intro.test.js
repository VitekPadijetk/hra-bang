const { test } = require('node:test');
const assert = require('node:assert/strict');
const installIntroService = require('../server/intro.js');

function mkIo() {
    const sockets = new Map();
    const emits = [];
    const io = {
        sockets: { sockets },
        emit(ev, p) { emits.push({ scope: 'io', ev, payload: p }); },
        to(k) { return { emit(ev, p) { emits.push({ scope: 'to:' + k, ev, payload: p }); } }; },
    };
    function addSocket(id) {
        const s = { id, emit(ev, p) { emits.push({ scope: 'socket:' + id, ev, payload: p }); } };
        sockets.set(id, s);
        return s;
    }
    return { io, addSocket, emits };
}

function mkRoom() {
    return {
        id: 'game1',
        players: [
            { socketId: 's0', playerIdx: 0, name: 'A' },
            { socketId: 's1', playerIdx: 1, name: 'B' },
        ],
        gameState: { players: [{ role: 'Sheriff', charChoices: ['X', 'Y'] }, { role: 'Outlaw', charChoices: ['Z', 'W'] }] },
    };
}

test('installIntroService vystaví intro funkce na ctx', () => {
    const { io } = mkIo();
    const ctx = { io, broadcastRoom() {} };
    installIntroService(ctx);
    for (const fn of ['emitIntro', 'emitIntroRole', 'emitIntroChars', 'runIntroSequence', 'introStartCharPhase', 'introStartDeckPhase']) {
        assert.equal(typeof ctx[fn], 'function', 'chybí ' + fn);
    }
});

test('emitIntro pošle intro_phase všem hráčům i divákům s myIndex', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const ctx = { io, broadcastRoom() {} };
    installIntroService(ctx);
    ctx.emitIntro(mkRoom(), { sub: 'init' });
    const p0 = emits.find(e => e.scope === 'socket:s0' && e.ev === 'intro_phase');
    const p1 = emits.find(e => e.scope === 'socket:s1' && e.ev === 'intro_phase');
    const spec = emits.find(e => e.scope === 'to:game1_spectators' && e.ev === 'intro_phase');
    assert.equal(p0.payload.myIndex, 0);
    assert.equal(p1.payload.myIndex, 1);
    assert.equal(p0.payload.sub, 'init');
    assert.equal(spec.payload.myIndex, null);
});

test('emitIntroRole pošle roli soukromě jen danému hráči', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const ctx = { io, broadcastRoom() {} };
    installIntroService(ctx);
    ctx.emitIntroRole(mkRoom(), 1, 'Outlaw');
    const sent = emits.filter(e => e.ev === 'intro_role');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].scope, 'socket:s1');
    assert.equal(sent[0].payload.role, 'Outlaw');
    assert.equal(sent[0].payload.playerIdx, 1);
});
