const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState } = require('../logic.js');
const installAnimService = require('../server/anim.js');
const installLifecycle = require('../server/lifecycle.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));

before(() => { console.log = () => {}; });

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

// ── anim ────────────────────────────────────────────────────────────────────
test('emitAnim pošle card_animation hráčům i divákům', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0');
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const room = { id: 'g1', players: [{ socketId: 's0' }] };
    ctx.emitAnim(room, { type: 'draw', playerIdx: 0 });
    assert.ok(emits.some(e => e.scope === 'socket:s0' && e.ev === 'card_animation'));
    assert.ok(emits.some(e => e.scope === 'to:g1_spectators' && e.ev === 'card_animation'));
});

test('emitDeathAnim: bez Vulture Sama pošle player_death_discard', () => {
    const { io, emits } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Willy the Kid', health: 4 }],
        _deathAnimData: { 0: { blue: [], weapon: null, hand: [] } } };
    ctx.emitDeathAnim({ id: 'g1', players: [] }, gs, 0);
    const a = emits.find(e => e.ev === 'card_animation');
    assert.equal(a.payload.type, 'player_death_discard');
});

test('emitDeathAnim: bez dat (už odeslané) neemituje nic – žádný falešný Colt fade-out', () => {
    const { io, emits } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Willy the Kid', health: 4 }] };
    ctx.emitDeathAnim({ id: 'g1', players: [] }, gs, 0);
    assert.equal(emits.find(e => e.ev === 'card_animation'), undefined);
});

test('emitDeathAnim: s živým Vulture Samem pošle vulture_sam_steal', () => {
    const { io, emits } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Vulture Sam', health: 3 }],
        _deathAnimData: { 0: { blue: [], weapon: null, hand: [] } } };
    ctx.emitDeathAnim({ id: 'g1', players: [] }, gs, 0);
    const a = emits.find(e => e.ev === 'card_animation');
    assert.equal(a.payload.type, 'vulture_sam_steal');
    assert.equal(a.payload.toPlayerIdx, 1);
});

test('emitDeathAnim nastaví _deathBlockUntil na délku celé cinematiky (boti čekají)', () => {
    const { io } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const { deathSequenceMs } = require('../core/deathAnim.js');
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Willy the Kid', health: 4 }],
        _deathAnimData: { 0: { blue: [{ id: 1 }], weapon: { id: 2 }, hand: [{ id: 3 }, { id: 4 }] } } };
    const room = { id: 'g1', players: [] };
    const t0 = Date.now();
    ctx.emitDeathAnim(room, gs, 0);
    // 1 modrá + zbraň/Colt (vždy jedna položka) + 2 z ruky = 4 karty
    const want = deathSequenceMs(4);
    assert.ok(room._deathBlockUntil >= t0 + want, 'bot nesmí hrát dřív, než cinematika doběhne');
    assert.ok(room._deathBlockUntil <= Date.now() + want);
});

test('handleAutoEndTurn zavolá nextTurn jen když je pending a není vítěz', () => {
    const { io } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    let turns = 0;
    const gs = { _autoEndTurnPending: true, winner: null, players: [], nextTurn() { turns++; } };
    ctx.handleAutoEndTurn({ id: 'g1', players: [] }, gs);
    assert.equal(turns, 1);
    assert.equal(gs._autoEndTurnPending, false);
    // podruhé už nic (pending zhasl)
    ctx.handleAutoEndTurn({ id: 'g1', players: [] }, gs);
    assert.equal(turns, 1);
});

test('handleReshuffleAndBroadcast bez reshuffle jen odloženě broadcastuje', () => {
    const { io } = mkIo();
    let delayed = 0;
    const ctx = { io, broadcastRoomDelayed() { delayed++; } };
    installAnimService(ctx);
    const gs = { deck: { _reshuffleOccurred: false, discardPile: [] } };
    ctx.handleReshuffleAndBroadcast({ id: 'g1', players: [] }, gs, 0);
    assert.equal(delayed, 1);
});

// ── lifecycle ─────────────────────────────────────────────────────────────────
function mkLifecycleCtx() {
    const calls = { broadcastRoom: 0, broadcastLobbyList: 0, intro: 0 };
    const ctx = {
        cardData, GameState,
        broadcastRoom() { calls.broadcastRoom++; },
        broadcastLobbyList() { calls.broadcastLobbyList++; },
        emitIntro() { calls.intro++; },
        runIntroSequence() { calls.intro++; },
        // No-op herní log (v produkci ho instaluje server/gamelog.js; tady jen ať nepadne).
        glog: { openGame() {}, closeGame() {}, action() {}, rule() {}, snapshot() {},
                system() {}, error() {}, clientLog() {}, actorLabel: () => '' },
    };
    installLifecycle(ctx);
    return { ctx, calls };
}

test('startGame v singleChar módu rozdá postavy a přeskočí intro', () => {
    const { ctx } = mkLifecycleCtx();
    const room = {
        maxPlayers: 3,
        options: { singleChar: true },
        gameState: new GameState(),
        players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    };
    ctx.startGame(room);
    assert.equal(room.gameState.players.length, 3);
    assert.ok(room.gameState.players.every(p => p.character));
    assert.equal(room.phase, 'playing'); // všichni vybráni → hra běží, ne char_select
});
