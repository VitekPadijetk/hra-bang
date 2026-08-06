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
    // io.to(kanál) doručuje jen socketům, které v kanálu SKUTEČNĚ jsou (join/leave) –
    // jinak by odhlášení diváka nešlo otestovat.
    const io = {
        sockets: { sockets },
        emit() {},
        to(channel) {
            return {
                emit(ev, payload) {
                    for (const s of sockets.values()) {
                        if (s.rooms.has(channel)) s.emit(ev, payload);
                    }
                },
            };
        },
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
            rooms: new Set([id]),          // jako reálný socket.io: vlastní kanál + join/leave
            on(ev, fn) { handlers[ev] = fn; },
            emit() {},
            join(r) { socket.rooms.add(r); },
            leave(r) { socket.rooms.delete(r); },
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

// Divák nesedí v room.players, takže ho z kanálu '<roomId>_spectators' nic nevyhodilo –
// po návratu do menu mu chodily další room_update a klient ho překlopil zpátky do hry.
test('leave_spectate odhlásí diváka – další broadcast už mu nechodí', () => {
    const { ctx, mkSocket } = mkEnv();
    const s1 = mkSocket('s1');
    s1.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    room.phase = 'playing';

    const spec = mkSocket('spec');
    const seen = [];
    spec.emit = (ev) => seen.push(ev);

    spec.fire('spectate', { roomId: room.id });
    assert.ok(spec.rooms.has(room.id + '_spectators'), 'divák je v kanálu');
    ctx.broadcastRoom(room);
    assert.equal(seen.filter(e => e === 'room_update').length, 2);   // vstupní + broadcast

    spec.fire('leave_spectate');
    assert.equal(spec.rooms.has(room.id + '_spectators'), false, 'divák je z kanálu venku');
    assert.ok(seen.includes('spectate_left'));

    ctx.broadcastRoom(room);
    assert.equal(seen.filter(e => e === 'room_update').length, 2, 'po odhlášení už nic nechodí');
});

test('spectate jiné hry odhlásí z předchozí (nekouká do dvou najednou)', () => {
    const { ctx, mkSocket } = mkEnv();
    mkSocket('s1').fire('debug_start', { playerCount: 3, roles: [] });
    mkSocket('s2').fire('debug_start', { playerCount: 3, roles: [] });
    const [a, b] = [...ctx.rooms.values()];
    a.phase = 'playing'; b.phase = 'playing';

    const spec = mkSocket('spec');
    spec.fire('spectate', { roomId: a.id });
    spec.fire('spectate', { roomId: b.id });
    assert.equal(spec.rooms.has(a.id + '_spectators'), false);
    assert.ok(spec.rooms.has(b.id + '_spectators'));
});

test('join_room odhlásí diváka ze sledované hry (vlastní hra vítězí)', () => {
    const { ctx, mkSocket } = mkEnv();
    mkSocket('s1').fire('debug_start', { playerCount: 3, roles: [] });
    const watched = [...ctx.rooms.values()][0];
    watched.phase = 'playing';

    const spec = mkSocket('spec');
    spec.fire('spectate', { roomId: watched.id });
    spec.fire('create_room', { name: 'Můj stůl', maxPlayers: 4, playerName: 'Alice', options: {} });
    assert.equal(spec.rooms.has(watched.id + '_spectators'), false);
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

// Vizuální slot karty na stole se posílá v JEDNOTNÉ konvenci „slot 0 = zbraň" –
// i když hráč zbraň nemá (na svém stole tam má výchozí Colt .45). Přepočet pro
// soupeře bez zbraně dělá klient (getBoardPos v net/handlers.js). Dřív posílal server
// index bez zbraňového slotu a krádež/odhoz z vlastního stolu letěla o kartu vedle.
test('animace karty ze stolu posílá slot v konvenci „0 = zbraň" i bez zbraně', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    gs.players[1].weapon = { id: -1 };                       // žádná zbraň
    gs.players[1].board = [{ id: 991, name: 'Barel', type: 'Barel' }];
    gs.phase = 'SELECTING_TARGET_CARD';
    gs.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: 'Cat Balou' };
    room._pendingPanicCard = { type: 'catbalou_sequence', attackerIdx: 0, targetIdx: 1, cardId: 990 };

    s.fire('select_target_card', { attackerIdx: 0, area: 'board', cardIdx: 0 });
    const a = anims.find(x => x.type === 'catbalou_sequence');
    assert.ok(a, 'animace catbalou_sequence se musí odeslat');
    assert.equal(a.boardIdx, 1);   // board[0] = slot 1 (slot 0 patří zbrani/Coltu)
});

// Krádež/odhoz z RUKY bere NÁHODNOU kartu – animace proto musí nést i slot, ze kterého
// karta odešla (stolenIndex). Klient podle něj kartu odebere z ruky a rozehraje let z
// jejího místa; dřív mizela vždy poslední (u vlastní ruky viditelně špatná karta).
test('panika z ruky posílá stolenIndex = slot vzaté karty', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    const hand = [{ id: 801 }, { id: 802 }, { id: 803 }, { id: 804 }];
    gs.players[1].hand = hand.map(c => ({ ...c, name: 'X', type: 'Bang!' }));
    gs.players[0].hand = [];
    gs.phase = 'SELECTING_TARGET_CARD';
    gs.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: 'Panika!' };
    room._pendingPanicCard = { type: 'panic_sequence', attackerIdx: 0, targetIdx: 1, cardId: 990 };

    s.fire('select_target_card', { attackerIdx: 0, area: 'hand', cardIdx: null });
    const a = anims.find(x => x.type === 'panic_sequence');
    assert.ok(a, 'animace panic_sequence se musí odeslat');
    // Ukradená karta je teď poslední v ruce útočníka – stolenIndex ukazuje na její
    // původní slot v ruce oběti (ne slepě na poslední).
    const stolenId = gs.players[0].hand[gs.players[0].hand.length - 1].id;
    assert.equal(a.stolenIndex, hand.findIndex(c => c.id === stolenId));
    assert.ok(a.stolenIndex >= 0 && a.stolenIndex < 4);
});

test('dělení karet mezi Vulture Samy: ragtime_steal z ruky nese stolenIndex', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    const dead = gs.players[2];
    dead.health = 0;
    dead.hand = [{ id: 811, name: 'A', type: 'Bang!' }, { id: 812, name: 'B', type: 'Bang!' }, { id: 813, name: 'C', type: 'Bang!' }];
    gs.players[0].hand = [];
    gs.phase = 'SELECTING_TARGET_CARD';
    gs.pendingSelection = { attackerIdx: 0, targetIdx: 2, sourceCardType: 'Panika!', ignoreDistance: true, isVultureSplit: true };
    gs.pendingVultureSplit = { deadIdx: 2, pickers: [0, 1], next: 0 };

    s.fire('select_target_card', { attackerIdx: 0, area: 'hand', cardIdx: null });
    const a = anims.find(x => x.type === 'ragtime_steal');
    assert.ok(a, 'animace ragtime_steal se musí odeslat');
    const stolenId = gs.players[0].hand[gs.players[0].hand.length - 1].id;
    assert.equal(a.stolenIndex, [811, 812, 813].indexOf(stolenId));
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

// Lucky Duke: obě odkryté karty musí do odhozu doletět PŘED výsledkem checku (vězení/
// dynamit), jinak výsledná karta dosedne na hromádku první a ty dvě se přes ni přehrají.
// Server proto posílá vlastní animaci `lucky_duke_result` (nese, která karta byla vybraná)
// a teprve za ní výsledek – fronta na klientu to pak přehraje v tomhle pořadí.
test('lucky_duke_pick: nejdřív lucky_duke_result (s chosenId), pak výsledek checku', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    const jail = { id: 950, name: 'Vězení', type: 'Vězení' };
    gs.players[0].board = [jail];
    gs.phase = 'LUCKY_DUKE';
    gs.luckyDukeState = {
        cards: [{ id: 941, suit: '♠️', value: '3' }, { id: 942, suit: '♥️', value: '7' }],
        checkContext: { reason: 'JAIL', playerIdx: 0, boardIdx: 0, checksLeft: 1, active: false },
    };

    s.fire('lucky_duke_pick', 1);          // srdce → z vězení ven
    const iRes = anims.findIndex(a => a.type === 'lucky_duke_result');
    const iJail = anims.findIndex(a => a.type === 'board_to_discard');
    assert.ok(iRes !== -1, 'lucky_duke_result se musí odeslat');
    assert.ok(iJail !== -1, 'odlet vězení do odhozu se musí odeslat');
    assert.ok(iRes < iJail, 'odkryté karty odlétají dřív než výsledek checku');
    assert.equal(anims[iRes].chosenId, 942);
    assert.equal(anims[iRes].otherId, 941);
    assert.equal(anims[iJail].cardId, jail.id);
});
