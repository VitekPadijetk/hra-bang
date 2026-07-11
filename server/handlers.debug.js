// server/handlers.debug.js — debug socket handlery (start debug hry, dávání/mazání
// karet, přiřazení postav). registerDebugHandlers(socket, ctx, withRoom) – těla
// byte-identická. Pozn.: HP postav sdílí core/roles (LOW_HEALTH_CHARS – i Dodge City).
const { baseHealthForCharacter } = require('../core/roles.js');
module.exports = function registerDebugHandlers(socket, ctx, withRoom) {
    const { rooms, makeRoom, broadcastRoom, broadcastLobbyList,
            findRoomBySocket, leaveRoom, cardData, dodgeCityCardData } = ctx;

    // ── DEBUG ────────────────────────────────────────────────────────────────
    socket.on('debug_start', (data) => {
        const existing = findRoomBySocket(socket.id);
        if (existing) leaveRoom(socket, existing);
        const playerCount = typeof data === 'number' ? data : data.playerCount;
        const debugRoles = typeof data === 'object' ? (data.roles || []) : [];
        const dodgeCity = typeof data === 'object' ? !!data.dodgeCity : false;
        const options = { expansions: { dodge_city: dodgeCity } };
        const names = Array.from({ length: playerCount }, (_, i) => `Debug${i + 1}`);
        const room = makeRoom('DEBUG', playerCount, socket.id, 'Debug1', options);
        room.players = names.map((name, idx) => ({ socketId: socket.id, playerIdx: idx, name, ready: false, wantsNext: null }));
        socket.join(room.id);
        socket.emit('room_joined', { roomId: room.id, myIndex: 0 });
        room.gameState.cardData = cardData;
        room.gameState.dodgeCityCardData = dodgeCityCardData;
        ctx.glog.openGame(room);
        room.gameState._onEvent = (evt) => ctx.glog.rule(room, evt);
        room.gameState.setupDebugGame(playerCount, names, debugRoles, options);
        room.gameState.logEvent('gamestart', {
            players: room.gameState.players.map(p => ({ n: p.name, role: p.role, ch: p.character || null, hp: p.health })),
            opts: options, deck: room.gameState.deck.cards.map(c => c.name),
        });
        room.phase = 'char_select';
        broadcastRoom(room);
        ctx.glog.system(`Debug start ${playerCount}P`);
    });

    socket.on('debug_end_game', () => {
        const room = findRoomBySocket(socket.id);
        if (!room?.gameState.isDebug) return;
        ctx.glog.closeGame(room);
        rooms.delete(room.id);
        broadcastLobbyList();
        socket.emit('go_to_menu');
    });

    socket.on('debug_give_card', (d) => {
        const room = findRoomBySocket(socket.id);
        if (!room?.gameState.isDebug) return;
        room.gameState.debugGiveCard(d.playerIdx, d.card);
        broadcastRoom(room);
    });

    socket.on('debug_remove_card', (d) => {
        const room = findRoomBySocket(socket.id);
        if (!room?.gameState.isDebug) return;
        room.gameState.debugRemoveCard(d.playerIdx, d.area, d.cardIdx);
        broadcastRoom(room);
    });

    socket.on('debug_select_char', (d) => {
        const room = findRoomBySocket(socket.id);
        if (!room?.gameState.isDebug) return;
        const gs = room.gameState;
        const p = gs.players[d.playerIdx];
        if (!p || p.character) return;
        p.character = d.charName;
        const base = baseHealthForCharacter(d.charName);   // 3-životové vč. Dodge City
        p.maxHealth = p.role === "Sheriff" ? base + 1 : base;
        p.health = p.maxHealth; p._baseHealth = base; p.charChoices = null;
        if (gs.players.every(pl => pl.character)) {
            gs.players.forEach(pl => {
                const n = pl._baseHealth ?? (pl.role === "Sheriff" ? pl.health - 1 : pl.health);
                for (let i = 0; i < n; i++) pl.hand.push(gs.deck.draw());
            });
            let start = gs.players.findIndex(pl => pl.role === "Sheriff");
            if (start === -1) {
                const dep = gs.players.findIndex(pl => pl.role === "Deputy");
                start = dep !== -1 ? dep : Math.floor(Math.random() * gs.players.length);
            }
            gs.currentPlayerIndex = start;
            gs.handleStartOfTurnChecks();
            room.phase = 'playing';
        }
        broadcastRoom(room);
    });
};
