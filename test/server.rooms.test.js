const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameState } = require('../logic.js');
const installRoomService = require('../server/rooms.js');

// ── Minimalistický mock socket.io ──────────────────────────────────────────────
function mkIo() {
    const sockets = new Map();        // socketId -> fakeSocket
    const emits = [];                 // záznam všech emitů pro asserty
    const io = {
        sockets: { sockets },
        emit(ev, payload) { emits.push({ scope: 'io', ev, payload }); },
        to(roomKey) {
            return { emit(ev, payload) { emits.push({ scope: 'to:' + roomKey, ev, payload }); } };
        },
        _emits: emits,
    };
    function addSocket(id) {
        const s = {
            id,
            joined: [], left: [], rooms: new Set([id]),   // rooms = jako reálný socket.io
            emit(ev, payload) { emits.push({ scope: 'socket:' + id, ev, payload }); },
            join(r) { s.joined.push(r); s.rooms.add(r); },
            leave(r) { s.left.push(r); s.rooms.delete(r); },
        };
        sockets.set(id, s);
        return s;
    }
    return { io, addSocket, emits };
}

function setup() {
    const { io, addSocket, emits } = mkIo();
    const ctx = { io, cardData: [], GameState };
    installRoomService(ctx);
    return { ctx, io, addSocket, emits };
}

test('makeRoom vytvoří místnost s lídrem a uloží ji do rooms', () => {
    const { ctx, addSocket } = setup();
    addSocket('s1');
    const room = ctx.makeRoom('Stůl', 4, 's1', 'Alice', { singleChar: true });
    assert.equal(room.maxPlayers, 4);
    assert.equal(room.phase, 'lobby');
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0].name, 'Alice');
    assert.equal(room.options.singleChar, true);
    assert.ok(room.gameState instanceof GameState);
    assert.equal(ctx.rooms.size, 1);
    assert.equal(ctx.rooms.get(room.id), room);
});

test('getLobbyList vrací jen lobby/next_lobby místnosti', () => {
    const { ctx, addSocket } = setup();
    addSocket('s1'); addSocket('s2');
    const a = ctx.makeRoom('A', 4, 's1', 'Alice', {});
    const b = ctx.makeRoom('B', 4, 's2', 'Bob', {});
    b.phase = 'playing';
    const list = ctx.getLobbyList();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'A');
    assert.equal(list[0].playerCount, 1);
});

test('getGameList vrací běžící hry bez vítěze', () => {
    const { ctx, addSocket } = setup();
    addSocket('s1'); addSocket('s2');
    const a = ctx.makeRoom('A', 4, 's1', 'Alice', {}); a.phase = 'playing';
    const b = ctx.makeRoom('B', 4, 's2', 'Bob', {}); b.phase = 'playing'; b.gameState.winner = 'Zákon vyhrál!';
    const list = ctx.getGameList();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'A');
});

test('findRoomBySocket najde místnost podle socketId hráče', () => {
    const { ctx, addSocket } = setup();
    addSocket('s1');
    const room = ctx.makeRoom('A', 4, 's1', 'Alice', {});
    assert.equal(ctx.findRoomBySocket('s1'), room);
    assert.equal(ctx.findRoomBySocket('neznámý'), null);
});

test('broadcastRoom pošle room_update všem hráčům i divákům', () => {
    const { ctx, addSocket, emits } = setup();
    addSocket('s1');
    const room = ctx.makeRoom('A', 4, 's1', 'Alice', {});
    ctx.broadcastRoom(room);
    const toPlayer = emits.filter(e => e.scope === 'socket:s1' && e.ev === 'room_update');
    const toSpec = emits.filter(e => e.scope === 'to:' + room.id + '_spectators' && e.ev === 'room_update');
    assert.equal(toPlayer.length, 1);
    assert.equal(toPlayer[0].payload.myIndex, 0);
    assert.equal(toSpec.length, 1);
    assert.equal(toSpec[0].payload.myIndex, null);
});

test('leaveRoom odebere posledního hráče a smaže místnost', () => {
    const { ctx, addSocket } = setup();
    const s1 = addSocket('s1');
    const room = ctx.makeRoom('A', 4, 's1', 'Alice', {});
    ctx.leaveRoom(s1, room);
    assert.equal(ctx.rooms.size, 0);
    assert.ok(s1.left.includes(room.id));
});

test('leaveSpectate opustí kanály diváka, ale ne vlastní místnost', () => {
    const { ctx, addSocket } = setup();
    const s = addSocket('s1');
    const room = ctx.makeRoom('A', 4, 's1', 'Alice', {});
    s.join(room.id);                       // hráč
    s.join('game9_spectators');            // a zároveň divák jinde
    assert.equal(ctx.leaveSpectate(s), true);
    assert.deepEqual(s.left, ['game9_spectators']);
    assert.ok(s.rooms.has(room.id), 'vlastní místnost zůstává');
});

test('leaveSpectate bez sledované hry nic nedělá', () => {
    const { ctx, addSocket } = setup();
    const s = addSocket('s1');
    s.join(ctx.makeRoom('A', 4, 's1', 'Alice', {}).id);
    assert.equal(ctx.leaveSpectate(s), false);
    assert.deepEqual(s.left, []);
});

test('leaveRoom přepíše lídra při odchodu lídra (zůstávají hráči)', () => {
    const { ctx, addSocket } = setup();
    const s1 = addSocket('s1'); addSocket('s2');
    const room = ctx.makeRoom('A', 4, 's1', 'Alice', {});
    room.players.push({ socketId: 's2', playerIdx: 1, name: 'Bob', ready: false, wantsNext: null });
    ctx.leaveRoom(s1, room);
    assert.equal(ctx.rooms.size, 1);
    assert.equal(room.players.length, 1);
    assert.equal(room.leaderSocketId, 's2');
    assert.equal(room.players[0].playerIdx, 0);
});
