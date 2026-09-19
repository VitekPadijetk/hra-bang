// server/handlers.nextgame.js — socket handlery pro výběr postav, potvrzení intro
// rolí a tok „další hry" (přihlášení, start lídrem, next_lobby).
// registerNextGameHandlers(socket, ctx, withRoom).
const { NEXT_MIN_PLAYERS } = require('../core/menuModel.js');
module.exports = function registerNextGameHandlers(socket, ctx, withRoom) {
    const { broadcastRoom, broadcastLobbyList, findRoomBySocket,
            startNextGame, introStartDeckPhase, io, botSockets } = ctx;

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
            // Poslední hráč právě klikl OK – jeho snap animace role (~550 ms) ještě
            // letí. Char fáze začíná 'shuffle_chars', která na klientu volá
            // _clearIntroSprites() a snap by zničila. Počkáme, ať doletí u všech.
            // (V navazující hře se mezitím ještě odhalí šerifova hvězda – viz intro.js.)
            // Uzavření fáze je v intro.js: dokud se ještě rozdává, jen se zapamatuje
            // (boti potvrzují dřív, než jim karta role doletí).
            ctx.closeRolePhase(room);
        }
    });

    socket.on('keep_character', (keep) => {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p) return;
        // Opožděný/dvojitý klik: hráč už rozhodl → nic (jinak by se rozjela animace znovu).
        const gp = room.gameState.players[p.playerIdx];
        if (!gp || !gp._awaitingKeepChoice) return;
        room.survivorKeepVotes[p.playerIdx] = keep;
        if (!keep) room.gameState.rejectCharacterForNextGame(p.playerIdx);
        else room.gameState.selectCharacterForNextGame(p.playerIdx);
        // Intro navazující hry: rozešli animaci rozhodnutí a případně nastartuj role.
        ctx.introKeepResult(room, p.playerIdx, keep);
        broadcastRoom(room);
    });

    // ── DALŠÍ HRA: ÚČAST (S12 / S13, docs/menu-ui-plan.md D8) ─────────────────
    // Po konci hry se každý přihlásí jedním kliknutím („Chci další hru") a nikdo nic
    // nepotvrzuje podruhé. Odpočet není: hru zahájí lídr ručně, jakmile jsou přihlášení
    // aspoň NEXT_MIN_PLAYERS; kdo se do té doby nepřihlásí, do hry nejde. Stav nese
    // `wantsNext` hráče místnosti (true = hraje, null = rozhoduje se) a chodí v room_update.
    // Kdo z místnosti odešel, v ní už není – klient ho páruje se soupiskou skončené hry
    // (nextRoster v core/menuModel.js).

    // Konec hry, ale ještě ne lobby další hry: v 'next_lobby' leží v room.gameState
    // pořád stará vyhraná hra, přihlašovat se tam ale už nejde.
    function atEndScreen(room) {
        return !!room && !!room.gameState?.winner && room.phase !== 'lobby' && room.phase !== 'next_lobby';
    }

    socket.on('next_join', () => {
        const room = findRoomBySocket(socket.id);
        if (!atEndScreen(room)) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p || p.wantsNext === true) return;
        p.wantsNext = true;
        broadcastRoom(room);
    });

    // „Odhlásit se" = zpátky mezi rozhodující se (klidně se zase přihlásí). Lídr to
    // neumí: hru buď zahájí (a hraje), nebo ji zruší.
    socket.on('next_leave', () => {
        const room = findRoomBySocket(socket.id);
        if (!atEndScreen(room) || room.leaderSocketId === socket.id) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p || p.wantsNext !== true) return;
        p.wantsNext = null;
        broadcastRoom(room);
    });

    // Lídr zahajuje (a tím sám hraje): přihlášení jdou dál, ostatní do menu. Plný stůl
    // rovnou startuje navazující hru, jinak se otevře lobby další hry (S9) a volná místa
    // se doplní tam (boti, noví hráči).
    socket.on('next_start', () => {
        const room = findRoomBySocket(socket.id);
        if (!atEndScreen(room) || room.leaderSocketId !== socket.id) return;
        const joined = room.players.filter(p => p.wantsNext === true || p.socketId === socket.id);
        if (joined.length < NEXT_MIN_PLAYERS) return;
        room.players.filter(p => !joined.includes(p)).forEach(p => {
            // Odpojený člověk, za kterého hrál bot: fake socket pod jeho id patřil téhle hře.
            ctx.botRelease?.(room, p);
            if (p.isBot) botSockets?.delete(p.socketId);
            const s = io.sockets.sockets.get(p.socketId);
            if (s) { s.leave(room.id); s.emit('go_to_menu'); }
        });
        room.players = joined;
        room.players.forEach((p, i) => { p.playerIdx = i; p.wasOriginalSurvivor = true; });
        ctx.glog.system(`"${room.name}" – další hra: ${joined.map(p => p.name).join(', ')}`);
        if (room.players.length >= room.maxPlayers) {
            startNextGame(room);
            return;
        }
        room.players.forEach(p => { p.wantsNext = null; });
        room.phase = 'next_lobby';
        broadcastRoom(room);
        broadcastLobbyList();
    });

    // Start z lobby další hry (S9) – jen s plným stolem, stejně jako start_game.
    socket.on('check_start_next', () => {
        const room = findRoomBySocket(socket.id);
        if (!room || room.leaderSocketId !== socket.id) return;
        if (room.phase !== 'next_lobby' || room.players.length < room.maxPlayers) return;
        startNextGame(room);
    });
};
