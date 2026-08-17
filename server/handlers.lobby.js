// server/handlers.lobby.js — socket handlery pro lobby/místnosti, spectate, chat,
// odpojení. registerLobbyHandlers(socket, ctx, withRoom) – těla byte-identická
// s původním io.on('connection'); helpery se berou z ctx.
module.exports = function registerLobbyHandlers(socket, ctx, withRoom) {
    const { rooms, makeRoom, roomPayload, broadcastRoom, broadcastLobbyList,
            findRoomBySocket, leaveRoom, leaveSpectate, disbandRoom, getGameList, startGame, io,
            createBot, removeBot, botSockets, botControl, botRelease } = ctx;

    // Hra jen botů: tvůrce je pouze divák (není mezi players). Po jeho odchodu
    // nemá smysl pokračovat → rozpustíme místnost a uklidíme fake sockety botů.
    function disbandBotGameWatchedBy(socketId) {
        for (const [, r] of rooms) {
            if (r._watcherSocketId !== socketId) continue;
            if (r._botTick) { clearTimeout(r._botTick); r._botTick = null; }
            r.players.forEach(p => { if (p.isBot) botSockets.delete(p.socketId); });
            disbandRoom(r);
            return true;
        }
        return false;
    }

    // ── LOBBY / ROOM MANAGEMENT ─────────────────────────────────────────────
    socket.on('create_room', ({ name, maxPlayers, playerName, options, token }) => {
        const existing = findRoomBySocket(socket.id);
        if (existing) return;
        leaveSpectate(socket);   // hráč nesmí zůstat divákem jinde (stavy dvou her by se praly)
        const room = makeRoom(name, maxPlayers, socket.id, playerName, options || {}, token || null);
        socket.join(room.id);
        socket.emit('room_joined', { roomId: room.id, myIndex: 0 });
        broadcastRoom(room);
        broadcastLobbyList();
        ctx.glog.system(`${playerName} vytvořil místnost "${name}" (${maxPlayers}P)`, { options });
    });

    socket.on('join_room', ({ roomId, playerName, token }) => {
        const room = rooms.get(roomId);
        if (!room || (room.phase !== 'lobby' && room.phase !== 'next_lobby')) return socket.emit('join_error', 'Hra není dostupná');
        if (room.players.length >= room.maxPlayers) return socket.emit('join_error', 'Hra je plná');
        if (room.players.some(p => p.name === playerName)) return socket.emit('join_error', `Hráč se jménem "${playerName}" již v místnosti hraje`);
        for (const [, r] of rooms) {
            if (r.players.some(p => p.name === playerName && p.socketId !== socket.id && !p.disconnected)) {
                return socket.emit('join_error', `Jméno "${playerName}" je již používáno jiným hráčem na serveru`);
            }
        }
        leaveSpectate(socket);   // hráč nesmí zůstat divákem jinde (stavy dvou her by se praly)
        const idx = room.players.length;
        room.players.push({ socketId: socket.id, playerIdx: idx, name: playerName, ready: false, wantsNext: null, wasOriginalSurvivor: false, token: token || null });
        socket.join(room.id);
        socket.emit('room_joined', { roomId, myIndex: idx });
        broadcastRoom(room);
        broadcastLobbyList();
        ctx.glog.system(`${playerName} se připojil do "${room.name}"`);
    });

    socket.on('leave_room', () => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        leaveRoom(socket, room);
    });

    // ── RECONNECT ─────────────────────────────────────────────────────────────
    // Návrat hráče, který se během hry odpojil (drží se v room.players jako
    // disconnected, dočasně za něj hraje bot). Identita je token (přežije F5/výpadek),
    // ne socket.id (ten je po reconnectu nový).
    socket.on('rejoin', ({ roomId, token }) => {
        const room = rooms.get(roomId);
        if (!room || !token) return socket.emit('rejoin_failed');
        const p = room.players.find(pl => pl.token === token && pl.disconnected);
        if (!p) return socket.emit('rejoin_failed');
        leaveSpectate(socket);               // návrat na svoje místo → přestaň být divákem jinde
        botRelease(room, p);                 // zruš dočasného bota (před přepojením socketu)
        const oldId = p.socketId;
        p.socketId = socket.id;              // přepoj místo na nový reálný socket
        p.disconnected = false;
        if (room.leaderSocketId === oldId) room.leaderSocketId = socket.id;
        socket.join(room.id);
        socket.emit('room_joined', { roomId, myIndex: p.playerIdx });
        broadcastRoom(room);
        broadcastLobbyList();
        ctx.glog.system(`${p.name} se vrátil do "${room.name}"`);
    });

    // ── BOTI (počítačoví hráči) ───────────────────────────────────────────────
    socket.on('add_bot', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id) return;
        if (room.phase !== 'lobby' && room.phase !== 'next_lobby') return;
        if (room.players.length >= room.maxPlayers) return;
        createBot(room);
        broadcastRoom(room);
        broadcastLobbyList();
    });

    socket.on('remove_bot', ({ socketId } = {}) => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id) return;
        if (room.phase !== 'lobby' && room.phase !== 'next_lobby') return;
        // Bez socketId odeber posledního bota.
        const target = socketId || [...room.players].reverse().find(p => p.isBot)?.socketId;
        if (target && removeBot(room, target)) {
            broadcastRoom(room);
            broadcastLobbyList();
        }
    });

    socket.on('start_game', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id) return;
        // Druhý klik během čekání na assety: fáze je pořád 'lobby', takže by se bez
        // téhle podmínky přepsal `_assetWaitCb` a zůstal viset druhý timer – hra by
        // se po vypršení limitu nastartovala DVAKRÁT.
        if (room.phase !== 'lobby' || room.assetsWaiting) return;
        // Se zapnutým rozšířením se počká, až budou mít všichni jeho klíčové textury
        // (art se stahuje líně) – jinak by prvním hráčům problikly placeholdery.
        ctx.whenAssetsReady(room, () => {
            // Pořadí u stolu se losuje AŽ TEĎ, těsně před startem. Kdyby se přeházelo
            // hned po kliknutí, hráči by během čekání na assety viděli, jak se jim
            // seznam v lobby přeskládal pod rukama – pořadí patří až do hry.
            const leader = room.players.find(p => p.socketId === room.leaderSocketId);
            const rest = room.players.filter(p => p.socketId !== room.leaderSocketId);
            for (let i = rest.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [rest[i], rest[j]] = [rest[j], rest[i]];
            }
            room.players = [leader, ...rest].filter(Boolean);
            room.players.forEach((p, i) => { p.playerIdx = i; });
            startGame(room);
            // Zapamatuji šerifa první hry pro rotaci
            if (room.options?.rotatingSheriff) {
                const sheriffPlayer = room.gameState.players.find(p => p.role === 'Sheriff');
                if (sheriffPlayer) room.lastSheriffName = sheriffPlayer.name;
            }
            ctx.glog.system(`"${room.name}" startuje – pořadí: ${room.players.map(p => p.name).join(', ')}`);
        });
    });

    // Klient hlásí, že má v cache klíčové textury daného rozšíření (art se stahuje líně).
    // Podle toho se pouští start hry – viz whenAssetsReady v server/lifecycle.js.
    socket.on('expansion_ready', (d) => {
        const room = findRoomBySocket(socket.id) ||
            [...rooms.values()].find(r => r.leaderSocketId === socket.id);
        if (room) ctx.noteAssetsReady(room, socket.id, d && d.exp);
    });

    socket.on('cancel_game', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id) return;
        // Leader dostane go_to_menu, ostatní kicked_from_game
        const leaderSocket = socket;
        room.players.forEach(p => {
            if (p.socketId === leaderSocket.id) return; // leader zpracujeme zvlášť
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.emit('kicked_from_game', 'Game leader ukončil hru.');
        });
        rooms.delete(room.id);
        broadcastLobbyList();
        leaderSocket.emit('go_to_menu');
    });

    // ── SPECTATE ────────────────────────────────────────────────────────────
    socket.on('get_game_list', () => {
        socket.emit('game_list', getGameList());
    });

    socket.on('spectate', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || (room.phase !== 'playing' && room.phase !== 'char_select')) return;
        leaveSpectate(socket);   // přepnutí mezi hrami: ať nekouká do dvou najednou
        socket.join(roomId + '_spectators');
        // Divák vidí jen veřejné informace (viz redactState v server/rooms.js).
        socket.emit('room_update',
            { ...roomPayload(room, null, !!room.options?.botGame), myIndex: null });
    });

    // Konec sledování. Bez odhlášení z kanálu by divákovi chodily další room_update
    // a klient by ho z menu vracel zpátky do sledované hry.
    socket.on('leave_spectate', () => {
        if (disbandBotGameWatchedBy(socket.id)) { leaveSpectate(socket); socket.emit('go_to_menu'); return; }
        leaveSpectate(socket);
        socket.emit('spectate_left');
    });

    // Spustí hru složenou jen z botů a tvůrce do ní rovnou nechá koukat (spectate).
    socket.on('create_bot_game', ({ count, options } = {}) => {
        if (findRoomBySocket(socket.id)) return;                 // už hraje jako hráč
        for (const [, r] of rooms) if (r._watcherSocketId === socket.id) return; // už kouká
        const n = Math.max(4, Math.min(7, Number(count) || 4));
        const room = makeRoom('🤖 Hra botů', n, socket.id, '🤖 Pozorovatel', { ...(options || {}), botGame: true });
        room.players = [];                  // hra je jen botů – žádný člověk mezi hráči
        room._watcherSocketId = socket.id;  // tvůrce = divák
        for (let i = 0; i < n; i++) createBot(room);
        leaveSpectate(socket);              // ať nekouká zároveň do jiné hry
        socket.join(room.id + '_spectators');
        startGame(room);                    // botGame → přeskočí intro (lifecycle)
        // Hra jen botů: divák vidí všechno, není komu podvádět.
        socket.emit('room_update', { ...roomPayload(room, null, true), myIndex: null });
        broadcastLobbyList();
        ctx.glog.system(`Spuštěna hra ${n} botů (divák ${socket.id})`);
    });

    socket.on('go_to_menu', () => {
        if (disbandBotGameWatchedBy(socket.id)) { leaveSpectate(socket); socket.emit('go_to_menu'); return; }
        leaveSpectate(socket);   // i hráč mohl předtím někde koukat – ať mu to menu nepřebíjí
        const room = findRoomBySocket(socket.id);
        if (room) leaveRoom(socket, room);
        socket.emit('go_to_menu');
    });

    socket.on('chat_message', ({ text }) => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        const name = p?.name || 'Divák';
        const msg = { name, text: String(text).slice(0, 300), ts: Date.now() };
        ctx.glog.system(`[chat ${room.name}] ${name}: ${msg.text}`);
        room.players.forEach(rp => {
            const s = io.sockets.sockets.get(rp.socketId);
            if (s) s.emit('chat_message', msg);
        });
        io.to(room.id + '_spectators').emit('chat_message', msg);
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        ctx.glog.system(`socket odpojen: ${socket.id}`);
        if (disbandBotGameWatchedBy(socket.id)) return;
        const room = findRoomBySocket(socket.id);
        if (room) {
            // Debug hra žije jen dokud je otevřené debug okno – po jeho zavření ji smaž
            // (jinak by zůstala viset jako sledovatelná hra, kde se už nic neděje).
            if (room.gameState?.isDebug) {
                disbandRoom(room);
                return;
            }
            if (room.phase === 'lobby' || room.phase === 'next_lobby') {
                leaveRoom(socket, room);
            } else {
                const p = room.players.find(pl => pl.socketId === socket.id);
                if (p) {
                    p.disconnected = true;
                    botControl(room, p);   // dokud je pryč, hraje za něj bot (hra nezamrzne)
                    broadcastRoom(room);
                }
            }
        }
    });
};
