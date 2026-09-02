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
const { botQuip, quipEvents, quipSnapshot } = require('../core/botChat.js');
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
    // cinematika (zvednutí balíčků + rozdání + případné míchání). Časování je sdílené
    // se serverem i klientem (server/anim.js storeCinematicMs). Jen na první výběr.
    // U 'proactive' se míchá paralelně s výběrem – bot bere hned, na konec míchání
    // pak hra počká přes room._reshuffleBlockUntil (nastaví handlers.game.js).
    function storeOpenDelayMs(gs) {
        return ctx.storeCinematicMs(gs).pickReady;
    }

    // Hrubý "otisk pokroku": když se mezi dvěma akcemi bota nezmění, hrozí zaseknutí.
    function progressSig(gs) {
        // Pozor: musí zachytit KAŽDÝ druh pokroku, jinak hrozí falešný stall:
        //  - pokles životů (schytání zásahu) → součet HP,
        //  - posun cíle u hromadného útoku (Kulomet/Indiáni) → pendingResponse.targetIdx,
        //  - rozdání/přesun karet → ruce PO HRÁČÍCH + součet stolu, odhoz, výběr postav.
        // Ruce se musí počítat po hráčích, ne součtem: Divoký západ přinesl tři cesty,
        // kterými karta jen PŘESKAKUJE z ruky do ruky (Gary Looter bere odhoz nad limit,
        // Youl Grinner si nechá dát kartu, Flint Westwood mění 1 za 2) – součet se u nich
        // nezmění a stall guard hlásil zaseknutí tam, kde hra normálně běžela.
        // A Zuřivá Doroty přidala pokrok, který se ve stavu neprojeví VŮBEC: poručení
        // hráči, který jmenovanou kartu nemá, jen na chvíli odkryje jeho ruku. Karty,
        // životy ani fáze se nehnou – posune se jen strop poručení za tah, takže musí
        // být v otisku (jinak je z legálního tahu falešný stall).
        const hands = [];
        let boardSum = 0, hpSum = 0;
        for (const p of gs.players) {
            hands.push(p.hand?.length || 0);
            boardSum += p.board?.length || 0;
            hpSum += Math.max(0, p.health || 0);
        }
        return [
            gs.phase, gs.currentPlayerIndex, hands.join(','), boardSum, hpSum,
            gs.players.filter(p => p.character).length, // pokrok char-selectu
            gs.deck?.discardPile?.length || 0,
            gs.kitCarlsonState?.pendingAdd?.length || 0,
            gs.clausState?.picked?.length || 0,
            gs.drawPhaseState?.cardsDrawn || 0,
            gs.pendingResponse?.targetIdx ?? -1,
            gs.pendingResponse?.responded?.length || 0,
            (gs.storeCards || []).filter(c => c).length,
            gs.pendingDynamiteDamage?.hitsLeft ?? -1,
            gs._dorothyUsed || 0,
        ].join('|');
    }

    // Claus "The Saint" (Fistful): jak dlouho trvá, než se odkrytá řada rozdá z balíčku
    // na stůl (klient ji staví po jedné kartě, viz startClausDeal v game.js).
    function clausDealMs(gs) {
        const n = gs?.clausState?.revealed?.length || 3;
        return 600 + (n - 1) * 110 + 420;
    }

    // Nouzová, vždy postupující akce (záchrana proti zaseknutí hry jen botů).
    function forceSafeAction(kind, idx, gs) {
        switch (kind) {
            case 'PLAY': case 'DISCARD': return { event: 'end_turn' };
            case 'RESPOND': return { event: 'respond_to_card', payload: { playerIdx: idx, cardIndex: null } };
            case 'DYNAMITE_DAMAGE': return { event: 'take_dynamite_hit' };
            case 'DRAW': return { event: 'draw_card', payload: { source: 'deck', sourceIdx: null } };
            // Fistful: Peyote se hádá, dokud se netrefí (tip navíc nic nezablokuje);
            // Ranč se dá vždycky přeskočit prázdným seznamem.
            case 'PEYOTE': return { event: 'peyote_guess', payload: { red: true } };
            case 'RANCH': return { event: 'ranch_exchange', payload: { cardIds: [] } };
            // Divoký západ – Miláček Valentýn: odhoz celé ruky, začne se první kartou.
            case 'VALENTINE_DISCARD': {
                const c = gs.players[idx]?.hand?.[0];
                return c ? { event: 'valentine_discard', payload: { cardId: c.id } } : null;
            }
            // Divoký západ – Youl Grinner: dát kartu je povinné, dá se ta první v ruce.
            case 'GRINNER_GIVE': {
                const c = gs.players[idx]?.hand?.[0];
                return c ? { event: 'grinner_give', payload: { cardId: c.id } } : null;
            }
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

        // Potvrzení role během intra NENÍ herní akce a musí projít i přes gate níž:
        // boti si postavu vybírají hned po startu, takže než se rozdají role, je fáze
        // často už DRAW (= „realTurn"). Bez této výjimky by se tick zahodil, boti by
        // roli nikdy nepotvrdili a intro by uvázlo napořád na await_role_ok.
        const introConfirmPending = !!room._introRoleConfirmed &&
            room.players.some(p => (p.isBot || p.botControlled) && !room._introRoleConfirmed.has(p.playerIdx));

        // Během intra (animace rolí/postav/rozdávání balíčku) bot herní akce NEDĚLÁ –
        // počkají na 'done' (jinak by sheriff-bot lízal/hrál během deck animace, neviditelně).
        // Výběr postav během intra ale běží normálně (řídí ho také policy).
        if (room._introPlaying && realTurn && !introConfirmPending) return;

        // Divoký západ – Hřbitov / Helena Zontero: role se přerozdaly a každý hráč si tu
        // svou potvrzuje (`room._rolePeekConfirm`, viz startRolePeekConfirm v server/anim.js).
        // Dokud potvrzení nedojdou všechna, hra se nehne – přesně jako rozdávání rolí
        // v intru. Výjimka je stejná: potvrzení BOTA přes tenhle gate projít musí,
        // jinak by ho nikdo nikdy neodeslal a hra by čekala sama na sebe.
        const peekConfirmPending = !!room._rolePeekConfirm &&
            room.players.some(p => (p.isBot || p.botControlled) && room._rolePeekConfirm.has(p.playerIdx));
        if (room._rolePeekConfirm && realTurn && !peekConfirmPending) return;

        let delay = botThinkTime();
        // Domíchání balíčku: dokud běží klientská míchací cinematika (_reshuffleBlockUntil
        // nastaví handleReshuffleAndBroadcast), bot čeká – i u proaktivního zamíchání, kde
        // broadcast odejde hned. Jinak by bot zahrál „přes" 5,5s animaci míchání.
        const reshuffleWait = Math.max(0, (room._reshuffleBlockUntil || 0) - Date.now());
        // Vyřazení hráče: dokud běží cinematika smrti (pokles na nulu, odhoz karet,
        // odhalení role uprostřed obrazovky – core/deathAnim.js, nastaví emitDeathAnim),
        // bot nehraje. Klient do té doby drží stav ve frontě animací, takže by bot hrál
        // divákům „poslepu".
        const deathWait = Math.max(0, (room._deathBlockUntil || 0) - Date.now());
        // Odkrytí karty High Noon: karta se všem ukazuje zvětšená uprostřed obrazovky
        // (core/highNoonAnim.js, nastaví flushHighNoonReveal) – po tu dobu bot nehraje.
        const hnWait = Math.max(0, (room._hnBlockUntil || 0) - Date.now());
        // Lucky Duke: vybraná karta se po výběru ještě „sejme" uprostřed obrazovky
        // (handleLuckyDuke nastaví _revealBlockUntil) – po tu dobu bot nehraje.
        const revealWait = Math.max(0, (room._revealBlockUntil || 0) - Date.now());
        // Nová identita (High Noon): dojezd výměny postavy (nastaví handlers.game.js).
        const niWait = Math.max(0, (room._niBlockUntil || 0) - Date.now());
        // Opuštěný důl (Fistful): odhozená karta leží chvíli lícem nahoru na dobíracím
        // balíčku a teprve pak se překlopí na rub (nastaví emitAnim v server/anim.js) –
        // po tu dobu bot nehraje, aby bylo vidět, co se zahrálo.
        const mineWait = Math.max(0, (room._mineBlockUntil || 0) - Date.now());
        // Divoký západ – Sacagaway: vlna přetáčení vějířů (core/wwsAnim.js, nastaví
        // flushSacaFlip / krádež z odkryté ruky v server/anim.js) – po tu dobu bot nehraje.
        const wwsWait = Math.max(0, (room._wwsBlockUntil || 0) - Date.now());
        // První herní akce po startu hry / po intru: chvíli počkej (viz startupSettleMs).
        if (room._botStartupSettle && realTurn && !introConfirmPending && room.players[pa.idx]?.isBot) {
            room._botStartupSettle = false;
            delay = startupSettleMs();
        }
        // Intro navazující hry: „nechám si postavu?" má u lidí animaci (karta vyletí
        // doprostřed, po rozhodnutí se usadí/odletí na balíček). Bot počká, ať ji hráč
        // stihne vidět – první rozhodnutí déle (běží ještě nálet karty), další svižněji.
        if (pa && pa.kind === 'KEEP_CHOICE') {
            if (!room._keepSettled) { room._keepSettled = true; delay = 2600; }
            else delay = Math.max(delay, 1500);
        } else if (room._keepSettled) {
            room._keepSettled = false;
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
        // Kit Carlson / Lucky Duke / Claus: PRVNÍ výběr počká na klientskou cinematiku
        // rozdání karet z balíčku (reveal), teprve pak bot vybere; další výběry normální
        // tempo. Clausova řada je až devět karet, takže se čeká podle jejího počtu.
        if (pa && (pa.kind === 'KIT_CARLSON' || pa.kind === 'LUCKY_DUKE' || pa.kind === 'CLAUS_GIVE')) {
            if (!room._charPickSettled) {
                room._charPickSettled = true;
                delay = pa.kind === 'LUCKY_DUKE' ? 1700
                      : pa.kind === 'CLAUS_GIVE' ? clausDealMs(room.gameState)
                      : 1300;
            }
        } else if (room._charPickSettled) {
            room._charPickSettled = false;
        }

        // Míchací cinematika a cinematika vyřazení mají přednost před vším ostatním
        // časováním – bot čeká, než doběhnou.
        delay = Math.max(delay, reshuffleWait, deathWait, hnWait, revealWait, niWait, mineWait, wwsWait);
        // Potvrzení role se řeší hned (runBotTickOnce ho vyřídí dřív než cokoli jiného),
        // ať ho nebrzdí čekačky odvozené z herní fáze (kontrola, hokynářství, míchání).
        if (introConfirmPending) delay = botThinkTime();
        // Totéž pro potvrzení PŘEROZDANÉ role (Hřbitov / Helena Zontero) – jen se počká
        // na dojezd veřejné půlky cinematiky, kterou drží `_wwsBlockUntil`.
        if (peekConfirmPending) delay = Math.max(botThinkTime(), wwsWait);

        room._botTick = setTimeout(() => {
            room._botTick = null;
            // Cinematika vyřazení mohla začít až PO naplánování tohoto ticku (debounce
            // room._botTick ho znovu nepřeplánoval) – pak by bot zahrál doprostřed
            // odhalení role. Přeplánuj se; nové zpoždění už ji zahrne (deathWait výše).
            if ((room._deathBlockUntil || 0) > Date.now()) { scheduleBotTick(room); return; }
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

        // Divoký západ – přerozdané role: bot si tu svou potvrdí sám (viz gate výše).
        if (room._rolePeekConfirm) {
            let acted = false;
            room.players.forEach(rp => {
                if ((rp.isBot || rp.botControlled) && room._rolePeekConfirm &&
                    room._rolePeekConfirm.has(rp.playerIdx)) {
                    botSockets.get(rp.socketId)?._fire('role_peek_ok');
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

    // ── Hlášky botů do chatu ────────────────────────────────────────────────────
    // Stůl plný botů byl doteď němý, takže by ho Divoký západ – Roubík („kdo promluví,
    // ztrácí 1 život") nikdy netrefil. Spouštěčem je HERNÍ UDÁLOST, ne časovač: události
    // se odvozují diffem dvou snímků stavu (core/botChat.js), takže se pravidel nedotkl
    // ani řádek. Volá se z háku `beforeBroadcast` (server/anim.js), tedy po každém
    // ustálení stavu – `scheduleBotTick` se na to použít nedá, ten se debouncuje.
    //
    // Pokuta za promluvení jde stejnou cestou jako u člověka (gs.gagSpeak), tedy se
    // ODLOŽÍ: jsme uprostřed cizího toku (těsně před odesláním stavu), takže se tady
    // zásah vybírat nesmí. Vybere ho nejbližší klidné místo a odejde s jeho broadcastem.
    function flushBotQuips(room) {
        const gs = room && room.gameState;
        if (!gs || !(gs.players || []).length || gs.winner) { if (room) room._quipSnap = null; return; }
        if (!hasBots(room)) return;
        const prev = room._quipSnap;
        room._quipSnap = quipSnapshot(gs);
        if (!prev) return;                       // první snímek – není proti čemu diffovat
        const events = quipEvents(prev, gs);
        if (!events.length) return;
        room._quipTurn = room._quipTurn || {};
        for (const ev of events) {
            const seat = room.players.find(pl => pl.playerIdx === ev.playerIdx && (pl.isBot || pl.botControlled));
            if (!seat) continue;                 // hláška patří člověku – ten si ji napíše sám
            const line = botQuip(ev, gs, ev.playerIdx, Math.random, { lastQuipTurn: room._quipTurn[ev.playerIdx] });
            if (!line) continue;
            room._quipTurn[ev.playerIdx] = gs.turnId || 0;
            ctx.emitChat(room, seat.name, line);
            gs.gagSpeak(ev.playerIdx);           // Roubík: žádná výjimka pro boty
        }
    }

    // Napojení na hooky (rooms.js po broadcastu, intro.js po intro emitu).
    ctx.afterBroadcast = scheduleBotTick;
    ctx.afterIntroEmit = scheduleBotTick;

    Object.assign(ctx, {
        botSockets, createBot, removeBot, hasBots, botControl, botRelease,
        scheduleBotTick, runBotTickOnce, flushBotQuips,
    });
    return ctx;
};
