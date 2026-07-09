const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState } = require('../logic.js');

const installRoomService = require('../server/rooms.js');
const installIntroService = require('../server/intro.js');
const installAnimService = require('../server/anim.js');
const installLifecycle = require('../server/lifecycle.js');
const registerLobby = require('../server/handlers.lobby.js');
const registerNextGame = require('../server/handlers.nextgame.js');
const registerGame = require('../server/handlers.game.js');
const registerCharacters = require('../server/handlers.characters.js');
const registerDebug = require('../server/handlers.debug.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));

before(() => { console.log = () => {}; });

// Plnohodnotnější mock io + socket, který umí vyvolat zaregistrované handlery.
function mkEnv() {
    const sockets = new Map();
    const io = {
        sockets: { sockets },
        emit() {},
        to() { return { emit() {} }; },
    };
    const ctx = { io, cardData, GameState };
    installRoomService(ctx);
    installIntroService(ctx);
    installAnimService(ctx);
    installLifecycle(ctx);

    function mkSocket(id) {
        const handlers = {};
        const socket = {
            id,
            on(ev, fn) { handlers[ev] = fn; },
            emit() {}, join() {}, leave() {},
            fire(ev, ...args) { if (handlers[ev]) handlers[ev](...args); },
            handlers,
        };
        sockets.set(id, socket);
        function withRoom(cb) {
            const room = ctx.findRoomBySocket(socket.id);
            if (!room) return;
            const p = room.players.find(pl => pl.socketId === socket.id);
            if (!p) return;
            cb(room, p, room.gameState);
        }
        registerLobby(socket, ctx, withRoom);
        registerNextGame(socket, ctx, withRoom);
        registerGame(socket, ctx, withRoom);
        registerCharacters(socket, ctx, withRoom);
        registerDebug(socket, ctx, withRoom);
        return socket;
    }
    return { ctx, io, mkSocket };
}

test('create_room handler skutečně vytvoří místnost (resolved všechny ctx reference)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    s.fire('create_room', { name: 'Stůl', maxPlayers: 4, playerName: 'Alice', options: {} });
    assert.equal(ctx.rooms.size, 1);
    const room = [...ctx.rooms.values()][0];
    assert.equal(room.players[0].name, 'Alice');
});

test('join_room handler přidá druhého hráče', () => {
    const { ctx, mkSocket } = mkEnv();
    const s1 = mkSocket('s1');
    s1.fire('create_room', { name: 'Stůl', maxPlayers: 4, playerName: 'Alice', options: {} });
    const room = [...ctx.rooms.values()][0];
    const s2 = mkSocket('s2');
    s2.fire('join_room', { roomId: room.id, playerName: 'Bob' });
    assert.equal(room.players.length, 2);
    assert.equal(room.players[1].name, 'Bob');
});

test('debug_start handler rozjede debug hru (resolved makeRoom/cardData/setupDebugGame)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    s.fire('debug_start', { playerCount: 3, roles: [] });
    assert.equal(ctx.rooms.size, 1);
    const room = [...ctx.rooms.values()][0];
    assert.equal(room.gameState.isDebug, true);
    assert.equal(room.gameState.players.length, 3);
});

test('end_turn / chat handlery běží bez chyby (game + lobby modul)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    // singleChar hra: create + start → rovnou playing
    s.fire('create_room', { name: 'X', maxPlayers: 3, playerName: 'A', options: { singleChar: true } });
    const room = [...ctx.rooms.values()][0];
    const s2 = mkSocket('s2'); s2.fire('join_room', { roomId: room.id, playerName: 'B' });
    const s3 = mkSocket('s3'); s3.fire('join_room', { roomId: room.id, playerName: 'C' });
    s.fire('start_game');
    assert.equal(room.gameState.players.length, 3);
    // tyto handlery musí projít bez ReferenceError
    s.fire('chat_message', { text: 'ahoj' });
    s.fire('end_turn');
    assert.ok(true);
});
