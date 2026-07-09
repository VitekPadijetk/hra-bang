// server/rooms.js — správa místností: registry (`rooms` Map), lobby/game list,
// broadcast stavu, leave/disband. Factory installRoomService(ctx): dostane
// { io, cardData, GameState }, vlastní `rooms` Map + roomCounter a nainstaluje
// room helpery zpět na ctx. Bez server.listen → testovatelné s fake io.
module.exports = function installRoomService(ctx) {
    const { io, cardData, dodgeCityCardData, GameState } = ctx;

    const rooms = new Map();
    let roomCounter = 1;

    function genId() { return `game${roomCounter++}`; }

    function makeRoom(name, maxPlayers, leaderSocketId, leaderName, options = {}, leaderToken = null) {
        const id = genId();
        const room = {
            id, name, maxPlayers,
            phase: 'lobby',
            leaderSocketId,
            players: [{ socketId: leaderSocketId, playerIdx: 0, name: leaderName, ready: false, wantsNext: null, token: leaderToken }],
            gameState: new GameState(),
            nextGameVotes: {},
            survivorKeepVotes: {},
            options: options,          // noAdvancedCards, singleChar, rotatingSheriff
            lastSheriffName: null,     // pro rotující šerif
            _pendingEmit: null,
        };
        rooms.set(id, room);
        return room;
    }

    function roomPayload(room) {
        const gs = room.gameState;
        // V debugu posíláme klientovi i seznam karet (pro galerii / dávání karet) –
        // včetně karet rozšíření, ať jdou testovat i bez zapnutého balíčku rozšíření.
        const base = gs.isDebug
            ? Object.assign(Object.create(Object.getPrototypeOf(gs)), gs,
                { _cardData: cardData.concat(dodgeCityCardData || []) })
            : gs;
        return {
            roomId: room.id, roomName: room.name, roomPhase: room.phase,
            leaderSocketId: room.leaderSocketId, maxPlayers: room.maxPlayers,
            players: room.players,
            gameState: base,
        };
    }

    function broadcastRoom(room) {
        room.players.forEach(p => {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) {
                const idx = p.playerIdx;
                s.emit('room_update', { ...roomPayload(room), myIndex: idx });
            }
        });
        io.to(room.id + '_spectators').emit('room_update', { ...roomPayload(room), myIndex: null });
        // Hook pro driver botů: po každém ustálení stavu se může probudit bot (server/bots.js).
        if (typeof ctx.afterBroadcast === 'function') ctx.afterBroadcast(room);
    }

    function broadcastRoomDelayed(room, ms = 400) {
        if (room._pendingEmit) clearTimeout(room._pendingEmit);
        room._pendingEmit = setTimeout(() => {
            room._pendingEmit = null;
            broadcastRoom(room);
        }, ms);
    }

    function broadcastLobbyList() {
        io.emit('lobby_list', getLobbyList());
    }

    function getLobbyList() {
        return Array.from(rooms.values())
            .filter(r => r.phase === 'lobby' || r.phase === 'next_lobby')
            .map(r => ({
                id: r.id, name: r.name, maxPlayers: r.maxPlayers,
                playerCount: r.players.length,
                players: r.players.map(p => p.name),
            }));
    }

    function getGameList() {
        return Array.from(rooms.values())
            .filter(r => (r.phase === 'playing' || r.phase === 'char_select') && !r.gameState.winner)
            .map(r => ({
                id: r.id, name: r.name, maxPlayers: r.maxPlayers,
                playerCount: r.players.length,
                players: r.players.map(p => p.name),
            }));
    }

    function findRoomBySocket(socketId) {
        for (const r of rooms.values()) {
            if (r.players.some(p => p.socketId === socketId)) return r;
        }
        return null;
    }

    function leaveRoom(socket, room) {
        const idx = room.players.findIndex(p => p.socketId === socket.id);
        if (idx === -1) return;
        const wasLeader = room.leaderSocketId === socket.id;
        room.players.splice(idx, 1);
        room.players.forEach((p, i) => { p.playerIdx = i; });
        socket.leave(room.id);
        socket.emit('go_to_menu');

        if (room.players.length === 0) {
            rooms.delete(room.id);
            broadcastLobbyList();
            return;
        }

        // Pokud leader odchází z probíhající hry, ostatní dostanou kicked obrazovku
        if (wasLeader && (room.phase === 'playing' || room.phase === 'char_select' || room.phase === 'finished')) {
            room.players.forEach(p => {
                const s = io.sockets.sockets.get(p.socketId);
                if (s) s.emit('kicked_from_game', 'Game leader opustil hru.');
            });
            rooms.delete(room.id);
            broadcastLobbyList();
            return;
        }

        if (wasLeader) {
            room.leaderSocketId = room.players[0].socketId;
            console.log(`👑 Nový lídr: ${room.players[0].name}`);
        }
        broadcastRoom(room);
        broadcastLobbyList();
    }

    function disbandRoom(room, reason) {
        room.players.forEach(p => {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) {
                if (reason) {
                    s.emit('kicked_from_game', reason);
                } else {
                    s.emit('go_to_menu');
                }
            }
        });
        rooms.delete(room.id);
        broadcastLobbyList();
    }

    Object.assign(ctx, {
        rooms, genId, makeRoom, roomPayload, broadcastRoom, broadcastRoomDelayed,
        broadcastLobbyList, getLobbyList, getGameList, findRoomBySocket,
        leaveRoom, disbandRoom,
    });
    return ctx;
};
