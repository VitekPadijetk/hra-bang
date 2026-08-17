// server/lifecycle.js — start hry a další hry: setup GameState, rotující šerif,
// přeskočení intra pro debug/singleChar/přeživší, spuštění intro sekvence.
// Factory installLifecycle(ctx): bere { cardData, GameState, broadcastRoom,
// broadcastLobbyList, emitIntro, runIntroSequence } z ctx. Bez listenu.
module.exports = function installLifecycle(ctx) {
    const { cardData, dodgeCityCardData, highNoonCardData, GameState, broadcastRoom, broadcastLobbyList, emitIntro, runIntroSequence } = ctx;

    // ── Čekání na assety rozšíření ──────────────────────────────────────────
    // Art rozšíření se stahuje líně (game.js loadExpansionAssets), takže hráč, který
    // se připojil na poslední chvíli, ho ještě nemusí mít v cache. Klient hlásí
    // `expansion_ready`, jakmile má klíčové textury (rub balíčku a Pravé poledne);
    // start hry na ně počká, ať nikomu neproblikne balíček z placeholderu. Po vypršení
    // limitu se hra spustí i tak – radši placeholder než zaseknuté lobby.
    const ASSET_WAIT_MS = 12000;

    function enabledExpansions(room) {
        const exps = (room.options && room.options.expansions) || {};
        return Object.keys(exps).filter(k => exps[k]);
    }

    // Kdo musí mít assety: lidští hráči (boti nekreslí) + leader (u hry botů je to divák).
    function assetWaiters(room) {
        const ids = room.players.filter(p => !p.isBot).map(p => p.socketId);
        if (room.leaderSocketId && !ids.includes(room.leaderSocketId)) ids.push(room.leaderSocketId);
        return ids;
    }

    function assetsReady(room) {
        const need = enabledExpansions(room);
        if (!need.length) return true;
        const ready = room._assetsReady || {};
        return assetWaiters(room).every(sid => need.every(exp => ready[sid] && ready[sid].has(exp)));
    }

    function finishAssetWait(room) {
        if (room._assetWaitTimer) { clearTimeout(room._assetWaitTimer); room._assetWaitTimer = null; }
        const cb = room._assetWaitCb;
        room._assetWaitCb = null;
        room.assetsWaiting = false;
        if (cb) cb();
    }

    function whenAssetsReady(room, cb) {
        if (assetsReady(room)) { cb(); return; }
        room._assetWaitCb = cb;
        room.assetsWaiting = true;
        ctx.glog.system(`"${room.name}" čeká na assety rozšíření (${enabledExpansions(room).join(', ')})`);
        broadcastRoom(room);
        room._assetWaitTimer = setTimeout(() => {
            ctx.glog.system(`"${room.name}" – čekání na assety vypršelo, startuje se`);
            finishAssetWait(room);
        }, ASSET_WAIT_MS);
    }

    // Volá handler `expansion_ready` (server/handlers.lobby.js).
    function noteAssetsReady(room, socketId, exp) {
        if (!room || !socketId || !exp) return;
        const m = room._assetsReady = room._assetsReady || {};
        (m[socketId] = m[socketId] || new Set()).add(exp);
        if (room._assetWaitCb && assetsReady(room)) finishAssetWait(room);
    }

    function startGame(room) {
        const gs = room.gameState;
        gs.cardData = cardData;
        gs.dodgeCityCardData = dodgeCityCardData;
        gs.highNoonCardData = highNoonCardData;
        // Log hry otevři a napoj sink JEŠTĚ PŘED setupem, ať se zachytí i výběr rolí/postav.
        ctx.glog.openGame(room);
        gs._onEvent = (evt) => ctx.glog.rule(room, evt);
        const names = room.players.map(p => p.name);
        gs.setupGame(room.maxPlayers, names, room.options || {});
        gs.logEvent('gamestart', {
            players: gs.players.map(p => ({ n: p.name, role: p.role, ch: p.character || null, hp: p.health })),
            opts: room.options || {},
            deck: gs.deck.cards.map(c => c.name),
        });
        ctx.initLedger?.(room);   // nová hra → čistý ledger chování (dedukce rolí boty)
        room.phase = 'char_select';
        // Boti po startu hry chvíli počkají; intro flag řídí, kdy smí začít hrát (viz server/bots.js).
        room._botStartupSettle = true;
        room._introPlaying = false;
        room._introKeepers = null;   // klasická hra: postavu si nikdo „nenechává"
        room._keepPhase = false;
        room._keepSettled = false;   // tempo botů u „nechám si postavu?" (server/bots.js)
        broadcastLobbyList();
        // debug, singleChar nebo hra jen botů: preskocime intro
        if (gs.isDebug || room.options?.singleChar || room.options?.botGame) {
            if (room.options?.singleChar) {
                gs.autoSelectAllCharacters();
                if (gs.phase !== 'CHARACTER_SELECT') room.phase = 'playing';
            }
            broadcastRoom(room);
            return;
        }
        // broadcastRoom posle room_update s roomPhase='char_select' -> klient prerenderuje z lobby na intro
        broadcastRoom(room);
        // Intro běží: boti nehrají herní akce (líznutí/karty) dokud nepřijde 'done' (intro.js).
        room._introPlaying = true;
        // intro_phase 'init' musi prijet AZ PO room_update (jinak roomPhase stale 'lobby')
        setTimeout(() => {
            // hnCount: balíček událostí (High Noon) leží na stole od začátku intra.
            emitIntro(room, { sub: 'init', playerCount: room.players.length,
                              hnCount: gs.eventDeck?.length || 0 });
            runIntroSequence(room);
        }, 50);
    }

    function startNextGame(room) {
        // Zruš případný běžící „další hra" odpočet z leader_start_next. Když leader
        // spustí hru přes check_start_next, startNextGame vynuluje wantsNext – kdyby
        // interval běžel dál, po vypršení by viděl, že nikdo nemá wantsNext===true,
        // a poslal by go_to_menu VŠEM (vyhodil by celou rozjetou hru).
        if (room._nextGameTimerInterval) {
            clearInterval(room._nextGameTimerInterval);
            room._nextGameTimerInterval = null;
        }
        room.nextGameTimer = null;

        const gs = room.gameState;
        const playerNames = room.players.map(p => p.name);
        const prevSurvivorChars = {};
        const prevSurvivorHealth = {};
        room.players.forEach((rp, i) => {
            if (!rp.wasOriginalSurvivor) return;
            const gsPlayer = gs.players.find(p => p.name === rp.name);
            if (gsPlayer && gsPlayer.health > 0) {
                prevSurvivorChars[i] = gsPlayer.character;
                prevSurvivorHealth[i] = gsPlayer.health;
            }
        });

        // Rotující šerif: najdeme jméno hráče napravo od současného šerifa
        let nextSheriffName = null;
        if (room.options?.rotatingSheriff) {
            const currentSheriffName = room.lastSheriffName;
            if (currentSheriffName) {
                const names = room.players.map(p => p.name);
                const sheriffIdx = names.indexOf(currentSheriffName);
                if (sheriffIdx !== -1) {
                    // Posouvá se DOPRAVA (tedy na hráče s vyšším indexem, konec → začátek)
                    const nextIdx = (sheriffIdx + 1) % names.length;
                    nextSheriffName = names[nextIdx];
                    ctx.glog.system(`Rotující šerif: ${currentSheriffName} → ${nextSheriffName}`);
                }
            }
            // Zapamatujeme si budoucího šerifa pro příští rotaci
            room.lastSheriffName = nextSheriffName || null;
        }

        room.gameState = new GameState();
        room.gameState.cardData = cardData;
        room.gameState.dodgeCityCardData = dodgeCityCardData;
        room.gameState.highNoonCardData = highNoonCardData;
        // Nová hra ve stejné místnosti → nový log (openGame zavře předchozí) + sink před setupem.
        ctx.glog.openGame(room);
        room.gameState._onEvent = (evt) => ctx.glog.rule(room, evt);
        room.gameState.setupNextGame(playerNames, prevSurvivorChars, room.options || {}, nextSheriffName, prevSurvivorHealth);
        room.gameState.logEvent('gamestart', {
            players: room.gameState.players.map(p => ({ n: p.name, role: p.role, ch: p.character || null, hp: p.health })),
            opts: room.options || {},
            deck: room.gameState.deck.cards.map(c => c.name),
        });
        ctx.initLedger?.(room);   // další hra → čistý ledger chování
        room.nextGameVotes = {};
        room.survivorKeepVotes = {};
        room.players.forEach(p => { p.wantsNext = null; p.wasOriginalSurvivor = false; });
        room.phase = 'char_select';
        // Boti po startu hry chvíli počkají; intro flag řídí, kdy smí začít hrát (viz server/bots.js).
        room._botStartupSettle = true;
        room._introPlaying = false;
        room._keepSettled = false;   // tempo botů u „nechám si postavu?" (server/bots.js)

        // singleChar: přeskočíme výběr pro hráče bez survivora
        if (room.options?.singleChar) {
            room.gameState.autoSelectAllCharacters();
            if (room.gameState.phase !== 'CHARACTER_SELECT') room.phase = 'playing';
        }

        // Zapamatuji prvního hráče pro příští rotaci (pokud rotující šerif zapnut). Ve hře
        // pro 3 (Město duchů) šerif není, rotuje se pomocník – proto _firstPlayerIndex.
        if (room.options?.rotatingSheriff) {
            const firstPlayer = room.gameState.players[room.gameState._firstPlayerIndex()];
            if (firstPlayer) room.lastSheriffName = firstPlayer.name;
        }

        // debug/singleChar/botGame: intro se přeskakuje (klasická obrazovka výběru).
        if (room.gameState.isDebug || room.options?.singleChar || room.options?.botGame) {
            broadcastRoom(room);
            return;
        }
        broadcastRoom(room);
        // Intro běží: boti nehrají herní akce (líznutí/karty) dokud nepřijde 'done' (intro.js).
        room._introPlaying = true;
        // Navazující hra má vlastní úvod: balíčky na stole, přeživší s postavami,
        // rozhodnutí „nechám si ji?" a teprve pak klasické rozdání rolí (viz intro.js).
        setTimeout(() => ctx.runNextGameIntro(room), 50);
    }

    Object.assign(ctx, { startGame, startNextGame, whenAssetsReady, noteAssetsReady });
    return ctx;
};
