// server/anim.js — animační a auto-tah helpery: emit card_animation/reshuffle_anim,
// smrt (Vulture Sam vs odhoz), automatické ukončení tahu po smrti, reshuffle broadcast.
// Factory installAnimService(ctx): bere { io, broadcastRoomDelayed } z ctx. Bez listenu.
const { deathSequenceMs, penaltyDiscardMs, deathFallMs, deathRevealMs } = require('../core/deathAnim.js');
const { hnRevealMs } = require('../core/highNoonAnim.js');

module.exports = function installAnimService(ctx) {
    const { io, broadcastRoomDelayed } = ctx;

    function emitAnim(room, data) {
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
    function emitAnimPrivate(room, ownerPlayerIdx, ownerData, othersData) {
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
        if (vultureIdx !== -1) {
            emitAnim(room, { type: 'vulture_sam_steal', fromPlayerIdx: deadIdx, toPlayerIdx: vultureIdx, blue, weapon, hand });
        } else {
            emitAnim(room, { type: 'player_death_discard', playerIdx: deadIdx, blue, weapon, hand });
        }
        // Klient hraje celou cinematiku vyřazení (pokles na nulu → odhoz karet po jedné →
        // odhalení role uprostřed obrazovky) a stav si do jejího konce drží ve frontě.
        // Boti o tu dobu nesmí hrát, jinak by hráli „přes" ni – viz scheduleBotTick.
        // Počet položek odhozu musí sedět s _deathCardSeq: modré + zbraň/Colt (vždy
        // jedna) + ruka.
        // Šerif svou roli neodhaluje (zná ji celý stůl) → jeho sekvence končí odhozením
        // karet a je o odhalovací část kratší (core/deathAnim.js, klient počítá stejně).
        const skipReveal = gs.players[deadIdx]?.role === 'Sheriff';
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
        emitAnim(room, { type: 'player_death_reveal', playerIdx: di });
        room._deathBlockUntil = Math.max(room._deathBlockUntil || 0,
            Date.now() + deathRevealMs(gs.players[di]?.role === 'Sheriff'));
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
    function flushHighNoonReveal(room) {
        const gs = room.gameState;
        const ev = gs && gs._pendingHighNoonReveal;
        if (!ev) return;
        gs._pendingHighNoonReveal = null;
        emitAnim(room, {
            type: 'high_noon_reveal',
            id: ev.id, key: ev.key, name: ev.name, art: ev.art, remaining: ev.remaining,
        });
        // Boti po tu dobu nehrají – klient drží stav ve frontě a divák by jinak koukal
        // na odkrytou kartu, zatímco se hra pod ní posouvá dál.
        room._hnBlockUntil = Math.max(room._hnBlockUntil || 0, Date.now() + hnRevealMs());
    }

    Object.assign(ctx, { emitAnim, emitAnimPrivate, emitDeathAnim, emitPendingDeathReveal,
                         handleAutoEndTurn, handleReshuffleAndBroadcast, storeCinematicMs,
                         beforeBroadcast: flushHighNoonReveal });
    return ctx;
};
