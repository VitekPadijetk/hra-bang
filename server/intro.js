// server/intro.js — serverová intro sekvence (míchání + rozdávání rolí, postav,
// balíčku) přes timeouty emitující 'intro_phase'/'intro_role'/'intro_chars'.
// Factory installIntroService(ctx): bere { io, broadcastRoom } z ctx a vystaví
// emit*/runIntroSequence/introStart*Phase zpět na ctx. Bez listenu.
module.exports = function installIntroService(ctx) {
    const { io, broadcastRoom } = ctx;

    // Emituje intro_phase všem hráčům v místnosti
    function emitIntro(room, data) {
        room.players.forEach(rp => {
            const s = io.sockets.sockets.get(rp.socketId);
            if (s) s.emit('intro_phase', { ...data, myIndex: rp.playerIdx });
        });
        io.to(room.id + '_spectators').emit('intro_phase', { ...data, myIndex: null });
        // Hook pro driver botů: intro nejede přes broadcastRoom, takže boti potřebují
        // probudit i po intro fázích (potvrzení role během 'await_role_ok').
        if (typeof ctx.afterIntroEmit === 'function') ctx.afterIntroEmit(room, data);
    }

    // Emituje intro_role pouze konkrétnímu hráči (soukromé)
    function emitIntroRole(room, playerIdx, roleStr) {
        const rp = room.players[playerIdx];
        if (!rp) return;
        const s = io.sockets.sockets.get(rp.socketId);
        if (s) s.emit('intro_role', { playerIdx, role: roleStr });
    }

    // Emituje intro_chars (2 karty postav) pouze konkrétnímu hráči
    function emitIntroChars(room, playerIdx, charChoices) {
        const rp = room.players[playerIdx];
        if (!rp) return;
        const s = io.sockets.sockets.get(rp.socketId);
        if (s) s.emit('intro_chars', { playerIdx, charChoices });
    }

    // Spustí intro sekvenci míchání + rozdávání rolí
    function runIntroSequence(room) {
        const gs = room.gameState;
        const n = room.players.length;
        const sheriffIdx = gs.players.findIndex(p => p.role === 'Sheriff');
        const roleStartIdx = Math.floor(Math.random() * n);
        const roleOrder = Array.from({ length: n }, (_, k) => (roleStartIdx + k) % n);
        const roleCount = n;

        console.log('[INTRO] Start, players:', n, 'sheriffIdx:', sheriffIdx);

        // Fáze 1: míchání rolí
        emitIntro(room, { sub: 'shuffle_roles', roleCount });

        const roleShuffleDelay = Math.max(2400, 1200 + roleCount * 180);
        setTimeout(() => {
            // Fáze 2: rozdávání rolí
            emitIntro(room, { sub: 'deal_roles', order: roleOrder });

            // Set vytvoříme HNED na začátku rozdávání, aby hráč mohl roli potvrdit
            // už v momentě, kdy mu karta přiletí (nečeká se na rozdání všem).
            room._introRoleConfirmed = new Set();

            roleOrder.forEach((pidx, step) => {
                setTimeout(() => {
                    const role = gs.players[pidx]?.role;
                    if (!role) return;
                    emitIntro(room, { sub: 'role_card_fly', toPlayerIdx: pidx, step });
                    emitIntroRole(room, pidx, role);
                }, step * 500);
            });

            const waitAfterDeal = roleOrder.length * 500 + 600;
            setTimeout(() => {
                // Set už existuje (vytvořen výše) – jen fallback label pro klienty,
                // kterým by se reveal náhodou nezobrazil dřív. NEPŘEPISOVAT Set!
                if (!room._introRoleConfirmed) room._introRoleConfirmed = new Set();
                emitIntro(room, { sub: 'await_role_ok' });
            }, waitAfterDeal);

        }, roleShuffleDelay);
    }

    function introStartCharPhase(room) {
        const gs = room.gameState;
        const n = room.players.length;
        const sheriffIdx = gs.players.findIndex(p => p.role === 'Sheriff');
        const charOrder = Array.from({ length: n }, (_, k) => (sheriffIdx + k) % n);
        const charCount = n * 2;

        console.log('[INTRO] Char phase');

        emitIntro(room, { sub: 'shuffle_chars', charCount });

        const charShuffleDelay = Math.max(3100, 1500 + charCount * 115);
        setTimeout(() => {
            emitIntro(room, { sub: 'deal_chars', order: charOrder });

            charOrder.forEach((pidx, step) => {
                setTimeout(() => {
                    emitIntro(room, { sub: 'char_cards_fly', toPlayerIdx: pidx, step });
                    emitIntroChars(room, pidx, gs.players[pidx]?.charChoices || []);
                }, step * 500);
            });

            const waitAfterDeal = charOrder.length * 500 + 600;
            setTimeout(() => {
                // Nejdriv posli broadcast (CHARACTER_SELECT) az po intro_chars eventech
                broadcastRoom(room); // phase=CHARACTER_SELECT
            }, waitAfterDeal + 100);

        }, charShuffleDelay);
    }

    function introStartDeckPhase(room) {
        const gs = room.gameState;
        const n = room.players.length;
        const sheriffIdx = gs.players.findIndex(p => p.role === 'Sheriff');
        const cardOrder = Array.from({ length: n }, (_, k) => (sheriffIdx + k) % n);
        // Plný balíček PŘED rozdáním počátečních rukou. selectCharacter() už ruce
        // rozdal (gs.deck.cards.length je tedy zmenšený) → přičteme rozdané karty zpět,
        // aby balíček rozdávání vizuálně začínal plný (80 karet ve standardní hře).
        const dealtTotal = gs.players.reduce((s, p) => s + (p.hand?.length || 0), 0);
        const deckCount = gs.deck.cards.length + dealtTotal;

        console.log('[INTRO] Deck phase, full deck:', deckCount, '(dealt back:', dealtTotal, ')');

        // Kratky delay pred chars_slide_in aby clients dostali CHARACTER_SELECT room_update
        const slideInStart = 200;
        setTimeout(() => emitIntro(room, { sub: 'chars_slide_in' }), slideInStart);

        // Slide-in postav/životů z okrajů běží na klientu ~ (n-1)*80 + 520 ms.
        // shuffle_deck volá _clearIntroSprites() → musí přijít AŽ PO dokončení slide-inu,
        // jinak by se ještě letící karty zničily a probliklo by to (postavy zmizí).
        const slideInDur = (n - 1) * 80 + 520 + 350; // + buffer na síť/handoff do placedCards
        setTimeout(() => {
            emitIntro(room, { sub: 'shuffle_deck', deckCount });

            // Délka míchací animace balíčku na klientu (_animateIntroShuffle, N=80 ~5.4s).
            // Rozdávat se začne AŽ PO zamíchání, ne během něj.
            const deckShuffleDelay = 5400;
            setTimeout(() => {
                emitIntro(room, { sub: 'deal_cards', order: cardOrder });

                let t = 0;
                cardOrder.forEach((pidx, orderIdx) => {
                    // Počet karet = počáteční ruka dle životů (_baseHealth = 3 nebo 4).
                    const cnt = gs.players[pidx]?._baseHealth ?? gs.players[pidx]?.maxHealth ?? 4;
                    const isLast = orderIdx === cardOrder.length - 1;
                    setTimeout(() => {
                        // POŘADÍ: nejdřív soukromě pošli danému hráči ID jeho karet, AŽ POTÉ
                        // broadcast deal_cards_to. Socket.io drží pořadí zpráv na spojení,
                        // takže klient zpracuje myHandCards dřív, než naplánuje let první
                        // karty (jinak by se 1. karta krátce ukázala rubem).
                        const handIds = (gs.players[pidx]?.hand || []).slice(0, cnt).map(c => c.id);
                        const rp = room.players[pidx];
                        const ps = rp && io.sockets.sockets.get(rp.socketId);
                        if (ps) ps.emit('intro_my_cards', { cards: handIds });
                        emitIntro(room, { sub: 'deal_cards_to', toPlayerIdx: pidx, count: cnt, isLast });
                    }, t);
                    t += cnt * 200 + 300;
                });

                // done až po doletu všech karet + animaci přesunu balíčku na herní pozici
                const doneDelay = t + 1100;
                setTimeout(() => {
                    // Konec intra: od teď smí boti hrát herní akce (sundej gate).
                    room._introPlaying = false;
                    emitIntro(room, { sub: 'done' });
                    broadcastRoom(room); // phase=DRAW
                }, doneDelay);

            }, deckShuffleDelay);
        }, slideInStart + slideInDur);
    }

    Object.assign(ctx, {
        emitIntro, emitIntroRole, emitIntroChars,
        runIntroSequence, introStartCharPhase, introStartDeckPhase,
    });
    return ctx;
};
