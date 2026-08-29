// server/rooms.js — správa místností: registry (`rooms` Map), lobby/game list,
// broadcast stavu, leave/disband. Factory installRoomService(ctx): dostane
// { io, cardData, GameState }, vlastní `rooms` Map + roomCounter a nainstaluje
// room helpery zpět na ctx. Bez server.listen → testovatelné s fake io.
const { eventActive } = require('../core/highNoon.js');

module.exports = function installRoomService(ctx) {
    const { io, cardData, dodgeCityCardData, GameState } = ctx;

    // Rooms se instaluje jako první v každém ctx. V produkci gamelog (server/gamelog.js)
    // hned potom přepíše ctx.glog reálným loggerem; v testech (fake io bez gamelogu) tu
    // zůstane no-op, takže lifecycle/bots/handlery mohou volat ctx.glog.* bez guardů.
    if (!ctx.glog) ctx.glog = {
        openGame() {}, closeGame() {}, action() {}, reject() {}, rule() {}, snapshot() {},
        system() {}, error() {}, clientLog() {}, actorLabel: () => '',
    };

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

    // ── Redakce stavu pro jednoho příjemce ──────────────────────────────────────
    // GameState se serializuje celý (nikde není toJSON), takže bez tohohle kroku vidí
    // KAŽDÝ hráč v konzoli role všech, jejich ruce i pořadí balíčku – klient to jen
    // nekreslí. Ořízneme to na to, co daný příjemce vidět má.
    //
    // Veřejné zůstává: šerifova role (zná ji celý stůl), role vyřazených (odhalí se při
    // smrti), odhoz, vyložené karty, zbraně, životy a postavy. `charChoices` se nechává –
    // pendingActor (core/pending.js) podle jejich počtu pozná fázi výběru postav i na
    // klientovi, a nabídka se stejně odhalí volbou.
    //
    // Skrytá karta drží tvar, který klient už zná z optimistického lízání (game.js) a
    // který core/playability.js i core/selection.js umí odmítnout.
    const HIDDEN_CARD = { id: null, _placeholder: true };

    function redactState(gs, viewerIdx, revealAll) {
        // Debug hra: jeden socket ovládá všechna místa, redakce by ji rozbila.
        // Po konci hry jsou role veřejné (výherní obrazovka i statistiky je ukazují).
        if (!gs || gs.isDebug || gs.winner || revealAll) return gs;

        // Divoký západ – Sacagaway: „Všichni hráči hrají s odhalenými kartami v ruce
        // (vyjma svých rolí)." Jediná událost, která sahá do redakce: ruce se nenahrazují
        // placeholdery, VŠECHNO ostatní se skrývá dál (role, pořadí obou balíčků, odložené
        // identity, Clausova odkrytá řada). Platí i pro diváka běžné hry – karta říká
        // „všichni hráči", je to veřejná informace u stolu.
        // Z ruky se přesto pořád bere NÁHODNĚ (FAQ Q17) – pravidla se nemění ani o řádek,
        // odkrytá ruka mění jen to, co je vidět.
        const handsOpen = eventActive(gs, 'SACAGAWAY');
        const players = (gs.players || []).map((p, i) => {
            if (i === viewerIdx) return p;
            // Jediným vodítkem je `_roleRevealed` – NE `health <= 0`. Nastaví se při
            // vyřazení (logic/combat.js) a drží roli veřejnou i po návratu do hry: duch
            // (Město duchů) má na svůj tah životy nad nulou, Mrtvý muž (Fistful) se vrací
            // natrvalo. Zpátky na tajnou ji přepne jedině přerozdání rolí – Hřbitov
            // a Helena Zontero (Divoký západ, logic/wildWest.js `_reshuffleRoles`).
            // Kdyby se redakce ptala i na `health <= 0`, role přerozdaná mezi VYŘAZENÝMI
            // hráči by utekla klientovi hned prvním broadcastem po zamíchání.
            // Hra pro 3 (Město duchů): všechny tři role leží od začátku lícem nahoru.
            const roleVisible = gs.mode3p || p.role === 'Sheriff' || !!p._roleRevealed;
            // A Fistful of Cards – Právo západu: vynucená karta se ukáže VEŘEJNĚ hned při
            // líznutí (cinematika law_reveal, viz server/handlers.game.js) a pak leží v ruce
            // jako každá jiná – rubem nahoru. Ve stavu proto zůstat nesmí ani její ID:
            // ruka je samý placeholder, takže by z něj sice nikdo nic nevyčetl, ale
            // ostatní ho k ničemu nepotřebují (klient ho čte jen u sebe).
            return {
                ...p,
                role: roleVisible ? p.role : null,
                hand: handsOpen ? p.hand : (p.hand || []).map(() => HIDDEN_CARD),
                _lawCardId: null,
                _secondChar: null,   // odložená identita je lícem dolů (klient ji nečte)
            };
        });
        // Z balíčku klient čte jen délku (výška hromádky). Pořadí = příští líznutí.
        const deck = gs.deck
            ? { ...gs.deck, cards: (gs.deck.cards || []).map(() => HIDDEN_CARD) }
            : gs.deck;
        // Totéž platí pro balíčky událostí (High Noon, Fistful of Cards, Divoký západ):
        // klient z nich kreslí jen výšku hromádky, pořadí je pořadí příštích kol. Odkryté
        // karty (eventPile / ffPile / wwsPile) jsou naopak veřejné a zůstávají.
        const hideAll = (arr) => (arr || []).map(() => HIDDEN_CARD);
        // Claus "The Saint" (Fistful): odkrytou řadu vidí jen on – ostatním z ní zbývá
        // počet karet (kreslí se rubem) a `picked` (které sloty jsou už rozdané).
        const clausState = (gs.clausState && viewerIdx !== gs.currentPlayerIndex)
            ? { ...gs.clausState, revealed: hideAll(gs.clausState.revealed) }
            : gs.clausState;
        return { ...gs, players, deck, clausState,
                 eventDeck: hideAll(gs.eventDeck), ffDeck: hideAll(gs.ffDeck),
                 wwsDeck: hideAll(gs.wwsDeck) };
    }

    function roomPayload(room, viewerIdx = null, revealAll = false) {
        const gs = room.gameState;
        // V debugu posíláme klientovi i seznam karet (pro galerii / dávání karet) –
        // včetně karet rozšíření, ať jdou testovat i bez zapnutého balíčku rozšíření.
        const base = gs.isDebug
            ? Object.assign(Object.create(Object.getPrototypeOf(gs)), gs,
                { _cardData: cardData.concat(dodgeCityCardData || []) })
            : redactState(gs, viewerIdx, revealAll);
        return {
            roomId: room.id, roomName: room.name, roomPhase: room.phase,
            leaderSocketId: room.leaderSocketId, maxPlayers: room.maxPlayers,
            players: room.players,
            // Nastavení místnosti (rozšíření…) chodí už z lobby: klient podle něj dotahuje
            // art rozšíření, který se v preloadu nestahuje. gs.options existuje až po setupu.
            options: room.options || {},
            // Čeká se, až budou mít všichni v cache art zapnutého rozšíření (lobby o tom
            // dá vědět, ať se leader nediví, že se po kliknutí na START nic neděje).
            assetsWaiting: !!room.assetsWaiting,
            gameState: base,
        };
    }

    // ── Konec místnosti ─────────────────────────────────────────────────────────
    // Rozpuštění NENÍ jen `rooms.delete`: intro sekvence (server/intro.js), odložený
    // broadcast, tick botů, čekání na assety i odpočet navazující hry jsou naplánované
    // timeouty, které si drží referenci na `room` a emitují do socketů dál. Po pouhém
    // smazání z registru tak hráči, kteří jsou už zpátky v menu, dostávali `intro_phase`
    // / `room_update` zrušené hry a klient je z menu překlopil zpátky do ní – „jsem ve
    // hře a zároveň nejsem" (viz cancel_game). closeRoom proto všechno naplánované zruší
    // a označí místnost za mrtvou; emit cesty se ptají přes roomAlive().
    function closeRoom(room) {
        if (!room) return;
        room._closed = true;
        if (room._pendingEmit) { clearTimeout(room._pendingEmit); room._pendingEmit = null; }
        if (room._botTick) { clearTimeout(room._botTick); room._botTick = null; }
        if (room._assetWaitTimer) { clearTimeout(room._assetWaitTimer); room._assetWaitTimer = null; }
        if (room._nextGameTimerInterval) { clearInterval(room._nextGameTimerInterval); room._nextGameTimerInterval = null; }
        room._assetWaitCb = null;
        room.assetsWaiting = false;
        room._introPlaying = false;
        room._keepPhase = false;
        // Fake sockety botů patřily téhle hře – bez úklidu by v registru zůstaly navždy.
        if (ctx.botSockets) room.players.forEach(p => { if (p.isBot) ctx.botSockets.delete(p.socketId); });
        ctx.glog.closeGame(room);
        rooms.delete(room.id);
    }

    // Smí se do místnosti ještě emitovat? (viz closeRoom)
    function roomAlive(room) { return !!room && !room._closed && rooms.has(room.id); }

    function broadcastRoom(room) {
        // Rozpuštěná místnost: doběhlý timeout (intro, odložený broadcast, odpočet) už
        // nesmí nikomu poslat stav – adresáti jsou dávno v menu.
        if (!roomAlive(room)) return;
        // Hook PŘED odesláním stavu: pravidla mohla nachystat animaci, která musí dojet
        // dřív, než se stav aplikuje (odkrytí karty High Noon – server/anim.js). Fronta
        // animací na klientu drží pořadí příjmu, takže stačí emitovat před stavem.
        if (typeof ctx.beforeBroadcast === 'function') ctx.beforeBroadcast(room);
        room.players.forEach(p => {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) {
                const idx = p.playerIdx;
                s.emit('room_update', { ...roomPayload(room, idx), myIndex: idx });
            }
        });
        // Divák nesedí u stolu, takže vidí jen veřejné informace – jinak by si stačilo
        // otevřít hru ve druhé záložce jako divák a číst spoluhráčům karty. Výjimka je
        // hra jen botů: není komu podvádět a smysl sledování je vidět, co boti drží.
        io.to(room.id + '_spectators').emit('room_update',
            { ...roomPayload(room, null, !!room.options?.botGame), myIndex: null });
        // Egress: kompaktní snapshot stavu do logu hry (dedup uvnitř – delayed broadcast nezdvojí).
        ctx.glog.snapshot(room);
        // Hook pro driver botů: po každém ustálení stavu se může probudit bot (server/bots.js).
        if (typeof ctx.afterBroadcast === 'function') ctx.afterBroadcast(room);
    }

    function broadcastRoomDelayed(room, ms = 400) {
        if (!roomAlive(room)) return;
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

    // Odhlášení diváka ze VŠECH sledovaných kanálů. Divák není v room.players, takže
    // ho leaveRoom ani disconnect-větev nevyhodí – dokud sedí v '<roomId>_spectators',
    // chodí mu dál room_update/card_animation/intro_phase a klient se z menu překlopí
    // zpátky do sledované hry (a při vlastní hře by se mu stavy dvou her praly).
    // Vrací true, pokud nějaký kanál opustil.
    function leaveSpectate(socket) {
        // Reálný socket.io zná svoje kanály (Set) – z toho odejdeme i z kanálů už
        // smazaných místností. Fake sockety (boti/testy) `rooms` nemají → projdeme registr.
        const joined = socket.rooms instanceof Set
            ? [...socket.rooms]
            : Array.from(rooms.keys()).map(id => id + '_spectators');
        let left = false;
        for (const ch of joined) {
            if (typeof ch !== 'string' || !ch.endsWith('_spectators')) continue;
            socket.leave(ch);
            left = true;
        }
        return left;
    }

    function leaveRoom(socket, room) {
        // Debug hra běží celá na jednom socketu (všechny „seaty" mají stejné socketId).
        // Když debug okno odejde, nemá smysl hru držet (nic se v ní už neděje, jen by
        // svítila jako sledovatelná) → zruš ji celou.
        if (room.gameState?.isDebug) {
            closeRoom(room);
            socket.leave(room.id);
            socket.emit('go_to_menu');
            broadcastLobbyList();
            return;
        }
        const idx = room.players.findIndex(p => p.socketId === socket.id);
        if (idx === -1) return;
        const wasLeader = room.leaderSocketId === socket.id;
        room.players.splice(idx, 1);
        room.players.forEach((p, i) => { p.playerIdx = i; });
        socket.leave(room.id);
        socket.emit('go_to_menu');

        if (room.players.length === 0) {
            closeRoom(room);
            broadcastLobbyList();
            return;
        }

        // Pokud leader odchází z probíhající hry, ostatní dostanou kicked obrazovku
        if (wasLeader && (room.phase === 'playing' || room.phase === 'char_select' || room.phase === 'finished')) {
            room.players.forEach(p => {
                const s = io.sockets.sockets.get(p.socketId);
                if (s) { s.leave(room.id); s.emit('kicked_from_game', 'Game leader opustil hru.'); }
            });
            io.to(room.id + '_spectators').emit('kicked_from_game', 'Game leader opustil hru.');
            closeRoom(room);
            broadcastLobbyList();
            return;
        }

        if (wasLeader) {
            room.leaderSocketId = room.players[0].socketId;
            ctx.glog.system(`Nový lídr: ${room.players[0].name}`);
        }
        broadcastRoom(room);
        broadcastLobbyList();
    }

    function disbandRoom(room, reason) {
        room.players.forEach(p => {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) {
                s.leave(room.id);
                if (reason) {
                    s.emit('kicked_from_game', reason);
                } else {
                    s.emit('go_to_menu');
                }
            }
        });
        // Divák sedí ve vlastním kanálu (není v room.players), takže se o konci jinak
        // nedozví. Bez `reason` je to řízený odchod toho, kdo hru sledoval (hra jen botů) –
        // ten dostane 'go_to_menu' od svého handleru a hlášku by mu jen přebilo.
        if (reason) io.to(room.id + '_spectators').emit('kicked_from_game', reason);
        closeRoom(room);
        broadcastLobbyList();
    }

    // Jedna zpráva do chatu místnosti (hráči + diváci). Kromě lidského `chat_message`
    // ji používají i hlášky botů (server/bots.js) – ti reálný socket nemají, takže by
    // jinak neměli kudy promluvit. Divoký západ – Roubík se ptá až volajícího: zpráva
    // odejde vždycky, pokutu za ni řeší handler.
    function emitChat(room, name, text) {
        if (!roomAlive(room)) return null;
        const msg = { name, text: String(text).slice(0, 300), ts: Date.now() };
        ctx.glog.system(`[chat ${room.name}] ${name}: ${msg.text}`);
        room.players.forEach(rp => {
            const s = io.sockets.sockets.get(rp.socketId);
            if (s) s.emit('chat_message', msg);
        });
        io.to(room.id + '_spectators').emit('chat_message', msg);
        return msg;
    }

    Object.assign(ctx, {
        rooms, genId, makeRoom, roomPayload, broadcastRoom, broadcastRoomDelayed,
        broadcastLobbyList, getLobbyList, getGameList, findRoomBySocket,
        leaveRoom, leaveSpectate, disbandRoom, closeRoom, roomAlive, emitChat,
    });
    return ctx;
};
