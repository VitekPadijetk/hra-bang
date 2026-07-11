// server/bots.js — počítačoví hráči (boti). Bot = bezhlavý klient na serveru:
// nemá reálný socket, ale dostane "fake socket" se stejnými herními handlery jako člověk
// (register*Handlers). Driver po každém ustálení stavu zjistí, zda se čeká na bota, a pokud
// ano, spočítá akci čistou policy (core/botPolicy.js) a "vystřelí" ji přes handler bota.
// Tím se 1:1 znovupoužije animace i broadcasty z handlers.*.js (žádná duplikace).
//
// Factory installBotService(ctx): bere helpery z ctx, vystaví createBot/removeBot/
// scheduleBotTick/runBotTickOnce/botSockets zpět na ctx a napojí se na hooky
// ctx.afterBroadcast / ctx.afterIntroEmit (viz rooms.js / intro.js).

const { pendingActor, decideBotAction } = require('../core/botPolicy.js');
const { computeBeliefs } = require('../core/beliefs.js');
const registerGameHandlers = require('./handlers.game.js');
const registerCharacterHandlers = require('./handlers.characters.js');
const registerNextGameHandlers = require('./handlers.nextgame.js');

module.exports = function installBotService(ctx) {
    const botSockets = new Map();   // socketId -> fake socket
    let botSeq = 1;

    // ── Fake socket: minimální podmnožina socket.io API, kterou handlery používají ──
    function makeBotSocket(id) {
        const handlers = {};
        return {
            id,
            isBot: true,
            on(event, cb) { (handlers[event] = handlers[event] || []).push(cb); },
            emit() { /* bot nic nerenderuje – příchozí eventy ignoruje */ },
            join() {}, leave() {},
            to() { return { emit() {} }; },
            // Vyvolá registrované handlery daného eventu (jako by přišel od klienta).
            _fire(event, payload) { (handlers[event] || []).forEach(cb => cb(payload)); },
        };
    }

    function hasBots(room) { return room && room.players.some(p => p.isBot || p.botControlled); }

    // Naváže fake bot socket na daný socketId a zaregistruje na něj herní handlery
    // (game/characters/nextgame) přes withRoom vázaný na ten socketId – stejná logika
    // jako v server.js. Sdílí createBot (nový bot) i botControl (převzetí odpojeného člověka).
    function attachBotSocket(socketId) {
        const sock = makeBotSocket(socketId);
        botSockets.set(socketId, sock);
        const withRoom = (cb) => {
            const r = ctx.findRoomBySocket(socketId);
            if (!r) return;
            const p = r.players.find(pl => pl.socketId === socketId);
            if (!p) return;
            cb(r, p, r.gameState);
        };
        registerGameHandlers(sock, ctx, withRoom);
        registerCharacterHandlers(sock, ctx, withRoom);
        registerNextGameHandlers(sock, ctx, withRoom);
        return sock;
    }

    // ── Vytvoření bota (lobby add_bot i hra jen botů) ───────────────────────────
    function createBot(room, name) {
        const id = `bot:${room.id}:${botSeq++}`;
        attachBotSocket(id);

        const idx = room.players.length;
        // Číslujeme podle pořadí botů (Bot 1, Bot 2…), ne podle místa; bez duplicit
        // (po odebrání se uvolněné číslo zase použije).
        let botName = name;
        if (!botName) {
            const taken = new Set(room.players.filter(p => p.isBot).map(p => p.name));
            let num = 1;
            while (taken.has(`🤖 Bot ${num}`)) num++;
            botName = `🤖 Bot ${num}`;
        }
        room.players.push({
            socketId: id, playerIdx: idx, name: botName,
            ready: true, wantsNext: null, wasOriginalSurvivor: false, isBot: true,
        });

        return room.players[idx];
    }

    // ── Dočasné převzetí odpojeného člověka botem ───────────────────────────────
    // Při odpojení během hry zůstane člověk v room.players (disconnected), ale aby hra
    // nezamrzla, hraje za něj bot. Reuse: navážeme fake socket na jeho stávající socketId
    // a označíme botControlled – driver ho pak obsluhuje stejně jako reálného bota.
    function botControl(room, player) {
        if (!player || player.isBot || player.botControlled) return;
        attachBotSocket(player.socketId);
        player.botControlled = true;
    }

    // Uvolnění převzetí (při návratu hráče přes rejoin). Zruší fake socket pod jeho
    // socketId; volá se PŘED přepojením na nový reálný socket.
    function botRelease(room, player) {
        if (!player || !player.botControlled) return;
        botSockets.delete(player.socketId);
        player.botControlled = false;
    }

    function removeBot(room, socketId) {
        const i = room.players.findIndex(p => p.socketId === socketId && p.isBot);
        if (i === -1) return false;
        room.players.splice(i, 1);
        room.players.forEach((p, k) => { p.playerIdx = k; });
        botSockets.delete(socketId);
        return true;
    }

    // ── Driver ──────────────────────────────────────────────────────────────────
    function botThinkTime() {
        if (typeof ctx.botThinkTime === 'number') return ctx.botThinkTime;
        return 350 + Math.floor(Math.random() * 500);
    }

    // Pauza před PRVNÍ herní akcí bota po startu hry (po intru). Dá klientu čas přepnout
    // z intra na herní desku, aby hráč vidět, co bot zahraje (jinak „zahraje něco neviditelně").
    function startupSettleMs() {
        return typeof ctx.botStartupSettle === 'number' ? ctx.botStartupSettle : 1800;
    }

    // Pauza před PRVNÍM výběrem bota v hokynářství: počká, než doběhne klientská
    // cinematika (zvednutí balíčků + rozdání + případné míchání). Tempo zrcadlí
    // game.js (STORE_LIFT/STAGGER/DEAL/SHUFFLE). Jen na první výběr po otevření.
    function storeOpenDelayMs(gs) {
        const N = (gs.storeCards || []).filter(c => c).length;
        const sa = gs.storeAnim || {};
        const LIFT = 340, STAG = 190, CARD = 460, SHUF = 1100, BUF = 250;
        const dealMs = n => n > 0 ? (n - 1) * STAG + CARD : 0;
        if (sa.mode === 'blocking') {
            const k = Math.min(sa.dealtBefore || 0, N);
            return LIFT + dealMs(k) + SHUF + dealMs(N - k) + BUF;
        }
        // 'proactive' / 'none': výběr možný hned po rozdání (míchání u A běží paralelně).
        return LIFT + dealMs(N) + BUF;
    }

    // Hrubý "otisk pokroku": když se mezi dvěma akcemi bota nezmění, hrozí zaseknutí.
    function progressSig(gs) {
        // Pozor: musí zachytit KAŽDÝ druh pokroku, jinak hrozí falešný stall:
        //  - pokles životů (schytání zásahu) → součet HP,
        //  - posun cíle u hromadného útoku (Kulomet/Indiáni) → pendingResponse.targetIdx,
        //  - rozdání/přesun karet → součet ruky+stolu, odhoz, výběr postav.
        let handSum = 0, boardSum = 0, hpSum = 0;
        for (const p of gs.players) {
            handSum += p.hand?.length || 0;
            boardSum += p.board?.length || 0;
            hpSum += Math.max(0, p.health || 0);
        }
        return [
            gs.phase, gs.currentPlayerIndex, handSum, boardSum, hpSum,
            gs.players.filter(p => p.character).length, // pokrok char-selectu
            gs.deck?.discardPile?.length || 0,
            gs.kitCarlsonState?.pendingAdd?.length || 0,
            gs.drawPhaseState?.cardsDrawn || 0,
            gs.pendingResponse?.targetIdx ?? -1,
            gs.pendingResponse?.responded?.length || 0,
            (gs.storeCards || []).filter(c => c).length,
            gs.pendingDynamiteDamage?.hitsLeft ?? -1,
        ].join('|');
    }

    // Nouzová, vždy postupující akce (záchrana proti zaseknutí hry jen botů).
    function forceSafeAction(kind, idx, gs) {
        switch (kind) {
            case 'PLAY': case 'DISCARD': return { event: 'end_turn' };
            case 'RESPOND': return { event: 'respond_to_card', payload: { playerIdx: idx, cardIndex: null } };
            case 'DYNAMITE_DAMAGE': return { event: 'take_dynamite_hit' };
            case 'DRAW': return { event: 'draw_card', payload: { source: 'deck', sourceIdx: null } };
            default: return null;
        }
    }

    function scheduleBotTick(room) {
        if (!room || room._botTick) return;     // debounce: max jeden naplánovaný tick
        if (!ctx.rooms.has(room.id)) return;    // místnost rozpuštěna → smyčka končí
        if (!hasBots(room)) return;

        // „Herní" akce = cokoli kromě výběru postavy/keep-choice během intra.
        const pa = room.gameState ? pendingActor(room.gameState) : null;
        const realTurn = !!pa && pa.kind !== 'CHARACTER_SELECT' && pa.kind !== 'KEEP_CHOICE';

        // Během intra (animace rolí/postav/rozdávání balíčku) bot herní akce NEDĚLÁ –
        // počkají na 'done' (jinak by sheriff-bot lízal/hrál během deck animace, neviditelně).
        // Výběr postav během intra ale běží normálně (řídí ho také policy).
        if (room._introPlaying && realTurn) return;

        let delay = botThinkTime();
        // Domíchání balíčku: dokud běží klientská míchací cinematika (_reshuffleBlockUntil
        // nastaví handleReshuffleAndBroadcast), bot čeká – i u proaktivního zamíchání, kde
        // broadcast odejde hned. Jinak by bot zahrál „přes" 5,5s animaci míchání.
        const reshuffleWait = Math.max(0, (room._reshuffleBlockUntil || 0) - Date.now());
        // První herní akce po startu hry / po intru: chvíli počkej (viz startupSettleMs).
        if (room._botStartupSettle && realTurn && room.players[pa.idx]?.isBot) {
            room._botStartupSettle = false;
            delay = startupSettleMs();
        }
        // Sejmutí / Black Jack: bot drží odhalenou kartu jako reveal animace u lidí
        // (CHECK_REVEAL_MS), teprve pak ji vyhodnotí (resolve_check/resolve_black_jack).
        if (pa && (pa.kind === 'CHECKING' || pa.kind === 'BLACK_JACK_CHECK')) {
            delay = typeof ctx.checkRevealMs === 'number' ? ctx.checkRevealMs : 3850;
        }
        // Hokynářství: PRVNÍ výběr po otevření počká na klientskou cinematiku
        // (zvednutí/rozdání/míchání); další výběry už normální tempo.
        if (pa && pa.kind === 'STORE') {
            if (!room._storeOpenSettled) {
                room._storeOpenSettled = true;
                delay = typeof ctx.storeOpenMs === 'number' ? ctx.storeOpenMs : storeOpenDelayMs(room.gameState);
            }
        } else if (room._storeOpenSettled) {
            room._storeOpenSettled = false;
        }
        // Kit Carlson / Lucky Duke: PRVNÍ výběr počká na klientskou cinematiku rozdání
        // karet z balíčku (reveal), teprve pak bot vybere; další výběry normální tempo.
        if (pa && (pa.kind === 'KIT_CARLSON' || pa.kind === 'LUCKY_DUKE')) {
            if (!room._charPickSettled) {
                room._charPickSettled = true;
                delay = pa.kind === 'LUCKY_DUKE' ? 1700 : 1300;
            }
        } else if (room._charPickSettled) {
            room._charPickSettled = false;
        }

        // Míchací cinematika má přednost před vším ostatním časováním – bot čeká, než doběhne.
        delay = Math.max(delay, reshuffleWait);

        room._botTick = setTimeout(() => {
            room._botTick = null;
            try { runBotTickOnce(room); }
            catch (e) { ctx.glog.error('bot-tick', e, room); }
        }, delay);
    }

    function runBotTickOnce(room) {
        if (!ctx.rooms.has(room.id)) return;     // místnost rozpuštěna → nic nedělej
        const gs = room.gameState;
        if (!gs) return;

        // Po konci hry: boti automaticky chtějí navazující hru (lidský leader ji
        // pak může spustit; u hry jen botů je to neškodné – divák stejně jen odejde).
        if (gs.winner) {
            for (const rp of room.players) {
                if (rp.isBot && rp.wantsNext !== true) {
                    botSockets.get(rp.socketId)?._fire('vote_next_game', true);
                }
            }
            return;
        }

        // Intro: boti automaticky potvrdí svoji roli (await_role_ok).
        if (room._introRoleConfirmed) {
            let acted = false;
            room.players.forEach(rp => {
                if (rp.isBot && room._introRoleConfirmed && !room._introRoleConfirmed.has(rp.playerIdx)) {
                    botSockets.get(rp.socketId)?._fire('intro_role_ok');
                    acted = true;
                }
            });
            if (acted) return;
        }

        const pa = pendingActor(gs);
        if (!pa) return;
        const rp = room.players[pa.idx];
        if (!rp || (!rp.isBot && !rp.botControlled)) return;  // čeká se na (připojeného) člověka → nech být
        const sock = botSockets.get(rp.socketId);
        if (!sock) return;

        // Stall guard
        const sig = progressSig(gs);
        if (sig === room._botSig) room._botStall = (room._botStall || 0) + 1;
        else { room._botSig = sig; room._botStall = 0; }

        // Skryté role: bot NEČTE cizí role – cílí podle beliefů odvozených z veřejného
        // ledgeru chování (kdo na koho útočil / koho léčil). Viz core/beliefs.js.
        const beliefs = computeBeliefs(gs, room.behaviorLedger || { pairs: {} }, pa.idx);
        let intent = decideBotAction(gs, pa.idx, beliefs);
        if (room._botStall > 4) {
            ctx.glog.system(`bot stall na ${pa.kind} (idx ${pa.idx}) – nouzová akce`);
            intent = forceSafeAction(pa.kind, pa.idx, gs) || intent;
        }
        if (!intent) return;
        ctx.glog.action(room, ctx.glog.actorLabel(gs, pa.idx), intent.event, intent.payload);
        sock._fire(intent.event, intent.payload);
        // _fire spustí handler → ten broadcastne → afterBroadcast → scheduleBotTick znovu.
    }

    // Napojení na hooky (rooms.js po broadcastu, intro.js po intro emitu).
    ctx.afterBroadcast = scheduleBotTick;
    ctx.afterIntroEmit = scheduleBotTick;

    Object.assign(ctx, {
        botSockets, createBot, removeBot, hasBots, botControl, botRelease,
        scheduleBotTick, runBotTickOnce,
    });
    return ctx;
};
