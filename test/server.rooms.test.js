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

// ── Redakce stavu (skryté informace) ───────────────────────────────────────────
// GameState se serializuje celý, takže bez redakce vidí každý hráč v konzoli role
// všech, jejich ruce i pořadí balíčku. Tyhle testy hlídají, co komu smí odejít.

function mkPlaying(ctx, opts = {}) {
    const room = ctx.makeRoom('A', 4, 's1', 'Alice', opts);
    room.players.push({ socketId: 's2', playerIdx: 1, name: 'Bob', ready: false, wantsNext: null });
    room.players.push({ socketId: 's3', playerIdx: 2, name: 'Cyril', ready: false, wantsNext: null });
    const gs = room.gameState;
    gs.players = [
        { name: 'Alice', role: 'Outlaw',   health: 3, hand: [{ id: 1, name: 'Bang!' }, { id: 2, name: 'Pivo' }] },
        { name: 'Bob',   role: 'Sheriff',  health: 5, hand: [{ id: 3, name: 'Vedle!' }] },
        { name: 'Cyril', role: 'Renegade', health: 4, hand: [{ id: 4, name: 'Barel' }, { id: 5, name: 'Duel' }] },
    ];
    gs.deck = { cards: [{ id: 6, name: 'Dynamit' }, { id: 7, name: 'Mustang' }], discardPile: [{ id: 8, name: 'Salón' }] };
    return room;
}

function payloadFor(emits, socketId) {
    const e = emits.filter(x => x.scope === 'socket:' + socketId && x.ev === 'room_update').pop();
    return e && e.payload.gameState;
}

test('redakce: hráč vidí svoji roli a šerifovu, ostatní ne', () => {
    const { ctx, addSocket, emits } = setup();
    ['s1', 's2', 's3'].forEach(addSocket);
    const room = mkPlaying(ctx);
    ctx.broadcastRoom(room);
    const gsA = payloadFor(emits, 's1');   // Alice = index 0
    assert.equal(gsA.players[0].role, 'Outlaw', 'svoji roli vidí');
    assert.equal(gsA.players[1].role, 'Sheriff', 'šerif je veřejný');
    assert.equal(gsA.players[2].role, null, 'roli soupeře nevidí');
});

test('redakce: ruce soupeřů jsou zástupné karty se správným počtem', () => {
    const { ctx, addSocket, emits } = setup();
    ['s1', 's2', 's3'].forEach(addSocket);
    const room = mkPlaying(ctx);
    ctx.broadcastRoom(room);
    const gsA = payloadFor(emits, 's1');
    assert.deepEqual(gsA.players[0].hand.map(c => c.name), ['Bang!', 'Pivo'], 'svoji ruku vidí celou');
    assert.equal(gsA.players[2].hand.length, 2, 'počet karet soupeře zůstává');
    assert.ok(gsA.players[2].hand.every(c => c._placeholder && c.id === null), 'ale bez identity');
});

test('redakce: z balíčku zbude jen počet, odhoz zůstává veřejný', () => {
    const { ctx, addSocket, emits } = setup();
    ['s1', 's2', 's3'].forEach(addSocket);
    const room = mkPlaying(ctx);
    ctx.broadcastRoom(room);
    const gsA = payloadFor(emits, 's1');
    assert.equal(gsA.deck.cards.length, 2, 'výška hromádky sedí');
    assert.ok(gsA.deck.cards.every(c => c._placeholder), 'příští líznutí nejsou vidět');
    assert.deepEqual(gsA.deck.discardPile.map(c => c.name), ['Salón'], 'odhoz je veřejný');
    assert.equal(room.gameState.deck.cards[0].name, 'Dynamit', 'skutečný stav se nezměnil');
});

test('redakce: role vyřazeného hráče je veřejná', () => {
    const { ctx, addSocket, emits } = setup();
    ['s1', 's2', 's3'].forEach(addSocket);
    const room = mkPlaying(ctx);
    room.gameState.players[2].health = 0;
    ctx.broadcastRoom(room);
    assert.equal(payloadFor(emits, 's1').players[2].role, 'Renegade');
});

test('redakce: po konci hry jsou role všech veřejné', () => {
    const { ctx, addSocket, emits } = setup();
    ['s1', 's2', 's3'].forEach(addSocket);
    const room = mkPlaying(ctx);
    room.gameState.winner = 'Bandité vyhráli!';
    ctx.broadcastRoom(room);
    const gsA = payloadFor(emits, 's1');
    assert.equal(gsA.players[2].role, 'Renegade', 'výherní obrazovka a statistiky role ukazují');
});

test('redakce: debug hra se neredaguje (jeden socket ovládá všechna místa)', () => {
    const { ctx, addSocket, emits } = setup();
    ['s1', 's2', 's3'].forEach(addSocket);
    const room = mkPlaying(ctx);
    room.gameState.isDebug = true;
    ctx.broadcastRoom(room);
    assert.equal(payloadFor(emits, 's1').players[2].role, 'Renegade');
});

test('redakce: divák vidí jen veřejné, u hry jen botů vidí všechno', () => {
    const { ctx, addSocket, emits } = setup();
    ['s1', 's2', 's3'].forEach(addSocket);
    const room = mkPlaying(ctx);
    ctx.broadcastRoom(room);
    const spec = emits.filter(e => e.scope === 'to:' + room.id + '_spectators' && e.ev === 'room_update').pop();
    assert.equal(spec.payload.gameState.players[2].role, null, 'druhá záložka jako divák neprozradí karty');
    assert.ok(spec.payload.gameState.players[0].hand.every(c => c._placeholder));

    const botRoom = mkPlaying(ctx, { botGame: true });
    ctx.broadcastRoom(botRoom);
    const specBot = emits.filter(e => e.scope === 'to:' + botRoom.id + '_spectators' && e.ev === 'room_update').pop();
    assert.equal(specBot.payload.gameState.players[2].role, 'Renegade', 'není komu podvádět');
});
