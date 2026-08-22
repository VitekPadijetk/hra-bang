// server/anim.js — animační a auto-tah helpery: emit card_animation/reshuffle_anim,
// smrt (Vulture Sam vs odhoz), automatické ukončení tahu po smrti, reshuffle broadcast.
// Factory installAnimService(ctx): bere { io, broadcastRoomDelayed } z ctx. Bez listenu.
const { deathSequenceMs, penaltyDiscardMs, deathFallMs, deathRevealMs } = require('../core/deathAnim.js');
const { hnRevealMs } = require('../core/highNoonAnim.js');

module.exports = function installAnimService(ctx) {
    const { io, broadcastRoomDelayed } = ctx;

    // Do rozpuštěné místnosti se už nic neposílá (closeRoom v server/rooms.js). `roomAlive`
    // chybí jen testům, které si anim službu instalují samostatně (bez rooms) – tam se
    // nefiltruje nic.
    const roomAlive = (room) => typeof ctx.roomAlive !== 'function' || ctx.roomAlive(room);

    function emitAnim(room, data) {
        if (!roomAlive(room)) return;
        // V DEBUG hře sdílí jeden socket VÍC hráčů (room.players mají stejný socketId) –
        // dedup přes seen, jinak by tentýž socket dostal animaci N× (= N překrývajících se letů).
        const seen = new Set();
        room.players.forEach(rp => {
            if (seen.has(rp.socketId)) return;
            seen.add(rp.socketId);
            const s = io.sockets.sockets.get(rp.socketId);
            if (s) s.emit('card_animation', data);
        });
        io.to(room.id + '_spectators').emit('card_animation', data);
    }

    // Animace, kde majitel karty vidí jiný payload než ostatní (reveal vlastní
    // líznuté karty): majiteli `ownerData` (s cardId pro flip rub→líc), ostatním
    // hráčům i divákům `othersData` (jen rub, identita karty zůstává skrytá).
    // ownerPlayerIdx smí být i POLE seatů (Claus rozdává kartu: líc vidí obdarovaný
    // i dárce, ostatní rub).
    function emitAnimPrivate(room, ownerPlayerIdx, ownerData, othersData) {
        if (!roomAlive(room)) return;
        if (Array.isArray(ownerPlayerIdx)) {
            const owners = new Set(ownerPlayerIdx);
            const seenIds = new Set();
            room.players.forEach(rp => {
                if (!owners.has(rp.playerIdx) || seenIds.has(rp.socketId)) return;
                seenIds.add(rp.socketId);
                const s = io.sockets.sockets.get(rp.socketId);
                if (s) s.emit('card_animation', ownerData);
            });
            room.players.forEach(rp => {
                if (seenIds.has(rp.socketId)) return;
                seenIds.add(rp.socketId);
                const s = io.sockets.sockets.get(rp.socketId);
                if (s) s.emit('card_animation', othersData);
            });
            io.to(room.id + '_spectators').emit('card_animation', othersData);
            return;
        }
        const ownerSocketId = room.players.find(rp => rp.playerIdx === ownerPlayerIdx)?.socketId;
        // Majitelovu socketu pošli reveal payload jako PRVNÍ a označ ho za vyřízený –
        // v DEBUG hře sdílí jeden socket víc hráčů, takže by ho jinak „ostatní" varianta
        // přepsala (a hráč by viděl líznutí letět k soupeři místo do vlastní ruky).
        const seen = new Set();
        if (ownerSocketId) {
            const os = io.sockets.sockets.get(ownerSocketId);
            if (os) os.emit('card_animation', ownerData);
            seen.add(ownerSocketId);
        }
        room.players.forEach(rp => {
            if (seen.has(rp.socketId)) return;
            seen.add(rp.socketId);
            const s = io.sockets.sockets.get(rp.socketId);
            if (s) s.emit('card_animation', othersData);
        });
        io.to(room.id + '_spectators').emit('card_animation', othersData);
    }

    function emitDeathAnim(room, gs, deadIdx) {
        // Idempotentní: data se nastaví jednou v handlePlayerDeath a po emitu smažou.
        // Druhé volání pro stejnou smrt (např. explicitní emit + handleAutoEndTurn při
        // úmrtí hráče na vlastním tahu – duel) by jinak poslalo prázdný odhoz, který na
        // klientovi spustí falešný fade-out Coltu .45. Bez dat tedy nic neemitujeme.
        const info = gs._deathAnimData?.[deadIdx];
        if (!info) return;
        const blue = info.blue || [], weapon = info.weapon || null, hand = info.hand || [];
        // Šerif zabil pomocníka → přijde o všechny karty. Odhozová animace jde ve frontě
        // hned za cinematikou vyřazení (klient ji přehraje až po ní).
        const emitSheriffPenalty = () => {
            const pen = gs._sheriffPenaltyAnim;
            if (!pen) return;
            gs._sheriffPenaltyAnim = null;
            emitAnim(room, { type: 'sheriff_penalty_discard', ...pen });
            room._deathBlockUntil += penaltyDiscardMs(
                (pen.blue?.length || 0) + (pen.weapon ? 1 : 0) + (pen.hand?.length || 0));
        };
        // Karty si dělí VÍC Vulture Samů → zůstávají ležet na stole a rozeberou se po
        // jedné (každá vlastní animací). Teď se přehraje jen pokles na nulu; úklid místa
        // a odhalení role dojedou po rozdělení (emitPendingDeathReveal).
        if (gs.pendingVultureSplit?.deadIdx === deadIdx) {
            emitAnim(room, { type: 'vulture_split_death', playerIdx: deadIdx });
            room._deathBlockUntil = Math.max(room._deathBlockUntil || 0, Date.now() + deathFallMs());
            emitSheriffPenalty();
            if (gs._deathAnimData) delete gs._deathAnimData[deadIdx];
            return;
        }
        const vultureIdx = gs.players.findIndex(
            (p, idx) => idx !== deadIdx && p.character === "Vulture Sam" && p.health > 0
        );
        // Role jde s animací, ne ze stavu: stav se na klientu aplikuje až ZA cinematikou
        // (fronta animací), takže v tu chvíli je vyřazený hráč pro klienta ještě živý
        // a jeho roli redactState schovává. Odhalením role se stává veřejnou, takže ji
        // sem posíláme právem.
        const deadRole = gs.players[deadIdx]?.role || null;
        if (vultureIdx !== -1) {
            emitAnim(room, { type: 'vulture_sam_steal', fromPlayerIdx: deadIdx, toPlayerIdx: vultureIdx, blue, weapon, hand, role: deadRole });
        } else {
            emitAnim(room, { type: 'player_death_discard', playerIdx: deadIdx, blue, weapon, hand, role: deadRole });
        }
        // Klient hraje celou cinematiku vyřazení (pokles na nulu → odhoz karet po jedné →
        // odhalení role uprostřed obrazovky) a stav si do jejího konce drží ve frontě.
        // Boti o tu dobu nesmí hrát, jinak by hráli „přes" ni – viz scheduleBotTick.
        // Počet položek odhozu musí sedět s _deathCardSeq: modré + zbraň/Colt (vždy
        // jedna) + ruka.
        // Šerif svou roli neodhaluje (zná ji celý stůl) → jeho sekvence končí odhozením
        // karet a je o odhalovací část kratší (core/deathAnim.js, klient počítá stejně).
        // Ve hře pro 3 (Město duchů) jsou lícem nahoru role všech, takže se neodhaluje nikdo.
        const skipReveal = !!gs.mode3p || gs.players[deadIdx]?.role === 'Sheriff';
        room._deathBlockUntil = Math.max(room._deathBlockUntil || 0,
            Date.now() + deathSequenceMs(blue.length + 1 + hand.length, skipReveal));
        emitSheriffPenalty();
        if (gs._deathAnimData) delete gs._deathAnimData[deadIdx];
    }

    // Dělení karet mezi víc Vulture Samů skončilo (logic: _finishVultureSplit nastavilo
    // _pendingDeathReveal) → dohraj zbytek cinematiky vyřazení: úklid místa + odhalení role.
    function emitPendingDeathReveal(room, gs) {
        const di = gs._pendingDeathReveal;
        if (di === null || di === undefined) return;
        gs._pendingDeathReveal = null;
        // Role s animací – ve stavu je do konce cinematiky schovaná (viz emitDeathAnim).
        emitAnim(room, { type: 'player_death_reveal', playerIdx: di, role: gs.players[di]?.role || null });
        room._deathBlockUntil = Math.max(room._deathBlockUntil || 0,
            Date.now() + deathRevealMs(!!gs.mode3p || gs.players[di]?.role === 'Sheriff'));
    }

    function handleAutoEndTurn(room, gs) {
        if (gs._autoEndTurnPending && !gs.winner) {
            const deadIdx = gs._deadPlayerIdx;
            gs._autoEndTurnPending = false;
            gs._deadPlayerIdx = undefined;
            gs._deathAnimPlayerIdx = null;
            if (deadIdx !== undefined) {
                emitDeathAnim(room, gs, deadIdx);
            }
            // Běží dělení karet mezi víc Vulture Samů (nebo cokoli dalšího ve frontě, co
            // smrt spustila)? Tah se posune až po jeho dobrání – jinak by nový hráč začal
            // hrát „přes" rozdělané rozhodnutí a hra by ve fázi výběru uvázla.
            if (gs.pendingVultureSplit) { gs._nextTurnAfterQueue = true; return; }
            gs.nextTurn?.();
        }
    }

    // ── Hokynářství: časování klientské cinematiky ───────────────────────────────
    // Zvednutí balíčků → rozdání karet do řady → (případné) míchání ve zvednuté poloze.
    // Míchání je TOTÉŽ jako klasické domíchání balíčku (game.js playReshuffleCinematic),
    // takže trvá stejně dlouho (RESHUFFLE_ANIM_MS). Tempo MUSÍ zrcadlit game.js
    // (STORE_LIFT/STORE_DEAL_STAGGER/STORE_DEAL_MS).
    // Vrací offsety od otevření hokynářství (ms):
    //   pickReady  – kdy smí padnout PRVNÍ výběr (u 'blocking' až po dorozdání),
    //   shuffleEnd – kdy je míchání hotové (0 = nemíchá se).
    // 'proactive' = v balíčku bylo přesně tolik karet, kolik se rozdává: míchá se
    // paralelně s výběrem (brát se smí hned), ale hra na jeho konec počká.
    const STORE_LIFT_MS = 340, STORE_STAGGER_MS = 190, STORE_DEAL_MS = 460,
          STORE_SHUFFLE_MS = 5700, STORE_BUF_MS = 250;
    function storeCinematicMs(gs) {
        const N = (gs?.storeCards || []).filter(c => c).length;
        const sa = gs?.storeAnim || {};
        const dealMs = n => n > 0 ? (n - 1) * STORE_STAGGER_MS + STORE_DEAL_MS : 0;
        if (sa.mode === 'blocking') {
            const k = Math.min(sa.dealtBefore || 0, N);
            const shuffleEnd = STORE_LIFT_MS + dealMs(k) + STORE_SHUFFLE_MS;
            return { pickReady: shuffleEnd + dealMs(N - k) + STORE_BUF_MS, shuffleEnd };
        }
        const pickReady = STORE_LIFT_MS + dealMs(N) + STORE_BUF_MS;
        const shuffleEnd = sa.mode === 'proactive'
            ? STORE_LIFT_MS + dealMs(N) + STORE_SHUFFLE_MS : 0;
        return { pickReady, shuffleEnd };
    }

    // ── Odkrytá řada (Kit Carlson / Claus): časování klientské cinematiky ────────
    // Karty letí z balíčku do řady po jedné (stagger) a když balíček během odkrývání
    // dojde, přeruší je míchání – přesně jako v hokynářství (viz storeCinematicMs).
    // Tempo MUSÍ zrcadlit game.js (startKitCarlsonDeal / startClausDeal).
    //   pickReady  – kdy smí padnout PRVNÍ výběr (u 'blocking' až po dorozdání),
    //   shuffleEnd – kdy je míchání hotové (0 = nemíchá se).
    const REVEAL_TEMPO = {
        kit:   { start: 0,   stagger: 160, fly: 420 },
        claus: { start: 100, stagger: 110, fly: 420 },
    };
    function revealCinematicMs(anim, n, kind) {
        const t = REVEAL_TEMPO[kind] || REVEAL_TEMPO.kit;
        const a = anim || {};
        const total = Math.max(0, n || 0);
        const dealMs = c => c > 0 ? (c - 1) * t.stagger + t.fly : 0;
        if (a.mode === 'blocking') {
            const k = Math.min(a.dealtBefore || 0, total);
            const shuffleEnd = t.start + dealMs(k) + STORE_SHUFFLE_MS;
            return { pickReady: shuffleEnd + dealMs(total - k) + STORE_BUF_MS, shuffleEnd };
        }
        const pickReady = t.start + dealMs(total) + STORE_BUF_MS;
        const shuffleEnd = a.mode === 'proactive'
            ? t.start + dealMs(total) + STORE_SHUFFLE_MS : 0;
        return { pickReady, shuffleEnd };
    }

    function handleReshuffleAndBroadcast(room, gs, baseDelay = 400) {
        if (gs.deck._reshuffleOccurred) {
            const count = gs.deck._reshuffleCount || 20;
            const isProactive = gs.deck._reshuffleWasProactive === true;
            const topCardId = gs.deck.discardPile.length > 0
                ? gs.deck.discardPile[gs.deck.discardPile.length - 1].id
                : null;
            gs.deck._reshuffleOccurred = false;
            gs.deck._reshuffleCount = 0;
            gs.deck._reshuffleWasProactive = false;
            // Klientská míchací cinematika běží ~5,5 s (viz reshuffle_anim). Boti na ni musí
            // počkat, i když je zamíchání proaktivní (broadcast odejde hned) – jinak by hráli
            // „přes" animaci. scheduleBotTick tento čas respektuje (viz server/bots.js).
            room._reshuffleBlockUntil = Date.now() + 5700;
            const seen = new Set();
            room.players.forEach(rp => {
                if (seen.has(rp.socketId)) return;   // debug: jeden socket = víc hráčů
                seen.add(rp.socketId);
                const s = io.sockets.sockets.get(rp.socketId);
                if (s) s.emit('reshuffle_anim', { cardCount: count, proactive: isProactive, topCardId });
            });
            io.to(room.id + '_spectators').emit('reshuffle_anim', { cardCount: count, proactive: isProactive, topCardId });
            if (isProactive) {
                broadcastRoomDelayed(room, baseDelay);
            } else {
                broadcastRoomDelayed(room, 5700);
            }
        } else {
            broadcastRoomDelayed(room, baseDelay);
        }
    }

    // ── High Noon: odkrytí karty události ────────────────────────────────────
    // Pravidla jen označí, že se odkryla nová karta (gs._pendingHighNoonReveal); emit
    // řeší tenhle hook volaný z broadcastRoom PŘED odesláním stavu. Důvod: nextTurn()
    // se volá z pěti různých cest (end_turn, odhoz, vězení, smrt na dynamit, auto-tah),
    // ale všechny končí broadcastem – jeden hook je pokryje všechny.
    // Hrají-li se obě rozšíření, odkryjí se v jednom okamžiku DVĚ karty (nejdřív High Noon,
    // pak Fistful of Cards). Emitují se za sebou – fronta animací na klientu je přehraje
    // v pořadí a boti se podrží o obě cinematiky.
    function flushHighNoonReveal(room) {
        const gs = room.gameState;
        if (!gs) return;
        const pending = [gs._pendingHighNoonReveal, gs._pendingFistfulReveal].filter(Boolean);
        if (!pending.length) return;
        gs._pendingHighNoonReveal = null;
        gs._pendingFistfulReveal = null;
        pending.forEach(ev => {
            emitAnim(room, {
                type: 'high_noon_reveal',
                // deck: ze kterého balíčku karta vzlétá a kam dosedne ('hn' | 'ff').
                deck: ev.deck || 'hn',
                id: ev.id, key: ev.key, name: ev.name, art: ev.art, remaining: ev.remaining,
                // Kartu odkrývá šerif na začátku SVÉHO tahu, jenže stav (s novým hráčem na
                // tahu) dorazí až po celé cinematice – klient by po celou dobu ukazoval jako
                // hráče na tahu toho předchozího. Posíláme ho tedy s animací.
                playerIdx: gs.currentPlayerIndex,
            });
        });
        // Boti po tu dobu nehrají – klient drží stav ve frontě a divák by jinak koukal
        // na odkrytou kartu, zatímco se hra pod ní posouvá dál.
        room._hnBlockUntil = Math.max(room._hnBlockUntil || 0,
                                      Date.now() + pending.length * hnRevealMs());
    }

    // ── Město duchů: duch odchází ze hry a odkládá, co mu zbylo na stole ─────
    // Vizuálně TOTÉŽ jako šerifova ztráta karet za pomocníka (karty po jedné do odhozu,
    // bez poklesu životů a bez odhalení role) – duch svou roli odhalil už při vyřazení.
    // Emituje se jen když karty padají do odhozu; sebral-li je Vulture Sam, přesun se
    // ukáže až v novém stavu.
    function flushGhostLeave(room) {
        const gs = room.gameState;
        const gl = gs && gs._ghostLeaveAnim;
        if (!gl) return;
        gs._ghostLeaveAnim = null;
        emitAnim(room, { type: 'sheriff_penalty_discard', ...gl });
        room._deathBlockUntil = Math.max(room._deathBlockUntil || 0, Date.now() + penaltyDiscardMs(
            (gl.blue?.length || 0) + (gl.weapon ? 1 : 0) + (gl.hand?.length || 0)));
    }

    // ── Johnny Kisch: stejnojmenné karty odcházejí ze stolu do odhozu ────────
    // Pravidla jen označí, co se odhodilo (gs._johnnyPurgeAnim); emit řeší tenhle hák,
    // protože karta může na stůl přijít třemi cestami (zbraň, modrá/zelená, Vězení).
    // Emituje se PŘED odesláním stavu, takže klient ještě má karty na starých místech.
    function flushJohnnyPurge(room) {
        const gs = room.gameState;
        const list = gs && gs._johnnyPurgeAnim;
        if (!list || !list.length) return;
        gs._johnnyPurgeAnim = null;
        list.forEach(it => {
            emitAnim(room, { type: 'board_to_discard', fromPlayerIdx: it.playerIdx,
                             cardId: it.cardId, boardIdx: it.boardIdx });
        });
    }

    // Hák před odesláním stavu (viz broadcastRoom v server/rooms.js). Pořadí = pořadí
    // v čase: duch odejde na konci svého tahu, teprve pak může šerif odkrýt novou událost.
    function beforeBroadcast(room) {
        flushGhostLeave(room);
        flushJohnnyPurge(room);
        flushHighNoonReveal(room);
    }

    Object.assign(ctx, { emitAnim, emitAnimPrivate, emitDeathAnim, emitPendingDeathReveal,
                         handleAutoEndTurn, handleReshuffleAndBroadcast, storeCinematicMs,
                         revealCinematicMs,
                         beforeBroadcast });
    return ctx;
};
