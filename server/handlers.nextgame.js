// server/handlers.nextgame.js — socket handlery pro výběr postav, potvrzení intro
// rolí, a tok „další hry" (hlasování, časovač, next_lobby).
// registerNextGameHandlers(socket, ctx, withRoom) – těla byte-identická.
module.exports = function registerNextGameHandlers(socket, ctx, withRoom) {
    const { rooms, broadcastRoom, broadcastLobbyList, findRoomBySocket,
            startNextGame, introStartCharPhase, introStartDeckPhase, io } = ctx;

    // ── CHAR SELECT ─────────────────────────────────────────────────────────
    socket.on('select_character', (charName) => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p) return;
        room.gameState.selectCharacter(p.playerIdx, charName);
        const allChosen = room.gameState.phase !== 'CHARACTER_SELECT';
        if (allChosen) room.phase = 'playing';
        // Pokud probiha intro a vsichni vybrali -> spustit deck fazi
        if (allChosen && room._introActive) {
            room._introActive = false;
            // Vsichni vybrali - broadcast aby kazdy klient mel health a char vsech hracu
            broadcastRoom(room);
            setTimeout(() => introStartDeckPhase(room), 80);
        } else {
            broadcastRoom(room);
        }
    });

    // Hrac potvrdil svoji roli - po vsech OK spustime char fazi
    socket.on('intro_role_ok', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room._introRoleConfirmed) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p) return;
        room._introRoleConfirmed.add(p.playerIdx);
        ctx.glog.system(`[INTRO] role_ok from ${p.playerIdx} confirmed: ${room._introRoleConfirmed.size}/${room.players.length}`);
        if (room._introRoleConfirmed.size >= room.players.length) {
            room._introRoleConfirmed = null;
            room._introActive = true;
            // Poslední hráč právě klikl OK – jeho snap animace role (~550 ms) ještě
            // letí. Char fáze začíná 'shuffle_chars', která na klientu volá
            // _clearIntroSprites() a snap by zničila. Počkáme, ať doletí u všech.
            setTimeout(() => introStartCharPhase(room), 700);
        }
    });

    socket.on('keep_character', (keep) => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p) return;
        room.survivorKeepVotes[p.playerIdx] = keep;
        if (!keep) room.gameState.rejectCharacterForNextGame(p.playerIdx);
        else room.gameState.selectCharacterForNextGame(p.playerIdx);
        broadcastRoom(room);
    });

    // ── END GAME / NEXT GAME ─────────────────────────────────────────────────
    socket.on('vote_next_game', (vote) => {
        const room = findRoomBySocket(socket.id);
        if (!room || !room.gameState.winner) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p) return;
        p.wantsNext = vote;
        broadcastRoom(room);
    });

    socket.on('leader_start_next', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id || !room.gameState.winner) return;
        room.phase = 'finished';
        room.players.forEach(p => {
            p.wantsNext = (p.socketId === socket.id) ? true : null;
        });
        if (room._nextGameTimerInterval) clearInterval(room._nextGameTimerInterval);
        room.nextGameTimer = 20;
        room._nextGameTimerInterval = setInterval(() => {
            if (!rooms.has(room.id)) { clearInterval(room._nextGameTimerInterval); return; }
            room.nextGameTimer = Math.max(0, (room.nextGameTimer || 0) - 1);
            if (room.players.every(p => p.wantsNext === true)) {
                clearInterval(room._nextGameTimerInterval);
                room._nextGameTimerInterval = null;
                room.nextGameTimer = null;
                broadcastRoom(room);
                return;
            }
            broadcastRoom(room);
            if (room.nextGameTimer <= 0) {
                clearInterval(room._nextGameTimerInterval);
                room._nextGameTimerInterval = null;
                room.nextGameTimer = null;
                room.players.forEach(p => {
                    if (p.wantsNext !== true) {
                        const s = io.sockets.sockets.get(p.socketId);
                        if (s) s.emit('go_to_menu');
                    }
                });
                room.players = room.players
                    .filter(p => p.wantsNext === true)
                    .map((p, i) => ({ ...p, playerIdx: i, wantsNext: null, wasOriginalSurvivor: true }));
                room.phase = 'next_lobby';
                broadcastRoom(room);
                broadcastLobbyList();
            }
        }, 1000);
        broadcastRoom(room);
    });

    socket.on('confirm_next_game', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.phase !== 'finished') return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (p) { p.wantsNext = true; broadcastRoom(room); }
    });

    socket.on('check_start_next', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id) return;
        if (room.phase === 'next_lobby') {
            if (room.players.length >= room.maxPlayers) {
                startNextGame(room);
            }
            return;
        }
        if (room.phase !== 'finished') return;
        const allIn = room.players.every(p => p.wantsNext === true);
        if (allIn) {
            room.players.forEach(p => { p.wasOriginalSurvivor = true; });
            startNextGame(room);
        }
    });

    socket.on('open_next_lobby', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id) return;
        room.players = room.players
            .filter(p => p.wantsNext === true)
            .map((p, i) => ({
                ...p,
                playerIdx: i,
                wantsNext: null,
                wasOriginalSurvivor: true,
            }));
        room.phase = 'next_lobby';
        broadcastRoom(room);
        broadcastLobbyList();
    });
};
