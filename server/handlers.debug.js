// server/handlers.debug.js — debug socket handlery (start debug hry, dávání/mazání
// karet, přiřazení postav). registerDebugHandlers(socket, ctx, withRoom) – těla
// byte-identická. Pozn.: HP postav sdílí core/roles (LOW_HEALTH_CHARS – i Dodge City).
const { baseHealthForCharacter, startCardsForCharacter } = require('../core/roles.js');
module.exports = function registerDebugHandlers(socket, ctx, withRoom) {
    const { rooms, makeRoom, broadcastRoom, broadcastLobbyList,
            findRoomBySocket, leaveRoom, cardData, dodgeCityCardData, highNoonCardData,
            fistfulCardData, wwsCardData } = ctx;

    // ── DEBUG ────────────────────────────────────────────────────────────────
    socket.on('debug_start', (data) => {
        const existing = findRoomBySocket(socket.id);
        if (existing) leaveRoom(socket, existing);
        const playerCount = typeof data === 'number' ? data : data.playerCount;
        const debugRoles = typeof data === 'object' ? (data.roles || []) : [];
        const dodgeCity = typeof data === 'object' ? !!data.dodgeCity : false;
        const highNoon = typeof data === 'object' ? !!data.highNoon : false;
        const hnExtra = typeof data === 'object' ? !!data.highNoonExtra : false;
        const fistful = typeof data === 'object' ? !!data.fistful : false;
        const divokyZapad = typeof data === 'object' ? !!data.divokyZapad : false;
        const options = { expansions: { dodge_city: dodgeCity, high_noon: highNoon, fistful,
                                        divoky_zapad: divokyZapad },
                          highNoonExtra: highNoon && hnExtra };
        const names = Array.from({ length: playerCount }, (_, i) => `Debug${i + 1}`);
        const room = makeRoom('DEBUG', playerCount, socket.id, 'Debug1', options);
        room.players = names.map((name, idx) => ({ socketId: socket.id, playerIdx: idx, name, ready: false, wantsNext: null }));
        socket.join(room.id);
        socket.emit('room_joined', { roomId: room.id, myIndex: 0 });
        room.gameState.cardData = cardData;
        room.gameState.dodgeCityCardData = dodgeCityCardData;
        room.gameState.highNoonCardData = highNoonCardData;
        room.gameState.fistfulCardData = fistfulCardData;
        room.gameState.wwsCardData = wwsCardData;
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
        socket.leave(room.id);
        ctx.closeRoom(room);   // zruší i naplánované timeouty (viz server/rooms.js)
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
        // Big Spencer (Divoký západ): 9 životů, ale jen 5 startovních karet.
        p._startCards = startCardsForCharacter(d.charName, base);
        if (gs.players.every(pl => pl.character)) {
            gs.players.forEach(pl => {
                const n = pl._startCards ?? pl._baseHealth ?? (pl.role === "Sheriff" ? pl.health - 1 : pl.health);
                for (let i = 0; i < n; i++) pl.hand.push(gs.deck.draw());
            });
            gs._dealSecondIdentities();   // High Noon (přibalené): druhá postava lícem dolů
            gs.currentPlayerIndex = gs._firstPlayerIndex();
            room.phase = 'playing';
            // První tah hry nejde přes nextTurn – start tahu (odkrytí událostí High Noon
            // i Fistful) se proto musí spustit ručně, stejně jako v logic/setup.js. Bez
            // toho se `_sheriffTurns` v debug hře vůbec nezapočítalo a první událost se
            // odkryla až na TŘETÍM tahu šerifa.
            if (gs._beginTurn()) { broadcastRoom(room); return; }
            gs.handleStartOfTurnChecks();
        }
        broadcastRoom(room);
    });
};
