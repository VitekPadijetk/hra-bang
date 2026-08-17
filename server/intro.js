// server/intro.js — serverová intro sekvence (míchání + rozdávání rolí, postav,
// balíčku) přes timeouty emitující 'intro_phase'/'intro_role'/'intro_chars'.
// Factory installIntroService(ctx): bere { io, broadcastRoom } z ctx a vystaví
// emit*/runIntroSequence/introStart*Phase zpět na ctx. Bez listenu.
const { firstPlayerIndex } = require('../core/roles.js');

module.exports = function installIntroService(ctx) {
    const { io, broadcastRoom } = ctx;

    // Do rozpuštěné místnosti se už nic neposílá (closeRoom v server/rooms.js). `roomAlive`
    // chybí jen testům, které si intro službu instalují samostatně (bez rooms).
    const roomAlive = (room) => typeof ctx.roomAlive !== 'function' || ctx.roomAlive(room);

    // Emituje intro_phase všem hráčům v místnosti.
    // Celá sekvence je řetěz timeoutů, které se nedají odvolat – když se místnost mezitím
    // rozpustí (lídr ukončil hru), musí se zbytek cinematiky zahodit tady. Bez toho by
    // hráčům chodily intro fáze zrušené hry a klient by je z menu vrátil zpátky do ní.
    function emitIntro(room, data) {
        if (!roomAlive(room)) return;
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
        if (!roomAlive(room)) return;
        const rp = room.players[playerIdx];
        if (!rp) return;
        const s = io.sockets.sockets.get(rp.socketId);
        if (s) s.emit('intro_role', { playerIdx, role: roleStr });
    }

    // Emituje intro_chars (2 karty postav) pouze konkrétnímu hráči
    function emitIntroChars(room, playerIdx, charChoices) {
        if (!roomAlive(room)) return;
        const rp = room.players[playerIdx];
        if (!rp) return;
        const s = io.sockets.sockets.get(rp.socketId);
        if (s) s.emit('intro_chars', { playerIdx, charChoices });
    }

    // ── Navazující hra ──────────────────────────────────────────────────────
    // Úvod navazující hry: na stole leží tři balíčky jako na startu klasické hry,
    // přeživší mají svou postavu (s tolika životy, kolik jim zbylo) a rozhodují se,
    // jestli si ji nechají. Teprve pak jede klasické rozdání rolí a postav.
    //
    // room._introKeepers = seaty, které si postavu nechaly. Snapshot se dělá TEĎ,
    // ne až v char fázi: boti si postavu (charChoices) vybírají hned po broadcastu,
    // takže „kdo nemá postavu" by v char fázi už nesedělo.
    function runNextGameIntro(room) {
        const gs = room.gameState;
        const n = room.players.length;
        room._introKeepers = new Set();

        const survivors = gs.players
            .map((p, idx) => ({ p, idx }))
            .filter(({ p }) => p._awaitingKeepChoice)
            .map(({ p, idx }) => ({ idx, char: p._survivorChar, health: p._survivorHealth ?? p.health ?? 4 }));

        emitIntro(room, {
            sub: 'init', playerCount: n, nextGame: true,
            roleCount: n,
            // Balíček postav bez postav přeživších (ti si je drží na stole).
            charCount: Math.max(0, (n - survivors.length) * 2),
            deckCount: gs.deck.cards.length,
            hnCount: gs.eventDeck?.length || 0,
            survivors,
        });

        ctx.glog.system(`[INTRO] Navazující hra, přeživších: ${survivors.length}/${n}`);

        if (!survivors.length) { runIntroSequence(room); return; }

        room._keepPhase = true;
        // Chvíli ať hráč vidí rozloženou desku, teprve pak vyletí jeho postava.
        setTimeout(() => emitIntro(room, { sub: 'nextgame_keep' }), 1000);
    }

    // Volá handlers.nextgame.js po každém rozhodnutí přeživšího: rozešle animaci
    // a jakmile jsou rozhodnutí všichni, spustí klasické rozdávání rolí.
    function introKeepResult(room, playerIdx, keep) {
        if (!room._keepPhase) return;
        if (keep) (room._introKeepers = room._introKeepers || new Set()).add(playerIdx);
        emitIntro(room, { sub: 'keep_result', playerIdx, keep });
        if (room.gameState.players.some(p => p._awaitingKeepChoice)) return;
        room._keepPhase = false;
        // Nech doletět animaci posledního rozhodnutí (otočení/posun karty), pak role.
        setTimeout(() => runIntroSequence(room), 1600);
    }

    // Po potvrzení rolí všemi hráči. V navazující hře může být šerifem hráč, který už
    // postavu na stole má – tomu se teď přidá 1 život a fade-inem hvězda; v klasické
    // hře nemá postavu nikdo, takže se rovnou pokračuje char fází (chování beze změny).
    function introAfterRoles(room) {
        const gs = room.gameState;
        const sheriffIdx = gs.players.findIndex(p => p.role === 'Sheriff');
        // Pozor na „má postavu" jako podmínku: boti si ji vybírají hned po startu, takže
        // ji šerif má i v klasické hře. Rozhoduje jen to, jestli si ji NECHAL z minulé hry.
        const sheriffKeeps = sheriffIdx !== -1 && !!room._introKeepers?.has(sheriffIdx);
        if (!sheriffKeeps) {
            setTimeout(() => introStartCharPhase(room), 700);
            return;
        }
        setTimeout(() => {
            emitIntro(room, { sub: 'sheriff_reveal', playerIdx: sheriffIdx });
            setTimeout(() => introStartCharPhase(room), 1200);
        }, 700);
    }

    // Spustí intro sekvenci míchání + rozdávání rolí
    function runIntroSequence(room) {
        const gs = room.gameState;
        const n = room.players.length;
        const sheriffIdx = gs.players.findIndex(p => p.role === 'Sheriff');
        const roleStartIdx = Math.floor(Math.random() * n);
        const roleOrder = Array.from({ length: n }, (_, k) => (roleStartIdx + k) % n);
        const roleCount = n;

        ctx.glog.system(`[INTRO] Start, players: ${n}, sheriffIdx: ${sheriffIdx}`);
        room._introRolesDone = false;

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
                    // Hra pro 3 (Město duchů): role leží lícem nahoru, takže smí jít
                    // i do BROADCASTU – karta se pak každému překlopí přímo na stole.
                    // U ostatních počtů je role tajná a chodí jen soukromě (emitIntroRole).
                    emitIntro(room, gs.mode3p
                        ? { sub: 'role_card_fly', toPlayerIdx: pidx, step, role }
                        : { sub: 'role_card_fly', toPlayerIdx: pidx, step });
                    emitIntroRole(room, pidx, role);
                }, step * 500);
            });

            const waitAfterDeal = roleOrder.length * 500 + 600;
            setTimeout(() => {
                // Roli už potvrdili všichni (stihnou to boti dřív, než sem sekvence
                // dojde) – Set se NESMÍ obnovit ani poslat await_role_ok, jinak by se
                // potvrzování rozjelo podruhé a s ním celá fáze postav.
                if (room._introRolesDone) return;
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
        // Od šerifa doprava; ve hře pro 3 (Město duchů) šerif není, tak od pomocníka.
        const sheriffIdx = firstPlayerIndex(gs.players);
        // Přeživší, kteří si postavu nechali, se přeskočí
        // (v klasické hře je _introKeepers prázdné → pořadí i počet beze změny).
        const keepers = room._introKeepers || new Set();
        const charOrder = Array.from({ length: n }, (_, k) => (sheriffIdx + k) % n)
            .filter(idx => !keepers.has(idx));
        const charCount = charOrder.length * 2;

        ctx.glog.system(`[INTRO] Char phase (${charOrder.length}/${n} hráčů vybírá)`);

        // Nikdo nevybírá (všichni si postavu nechali) → rovnou balíček.
        if (!charOrder.length) {
            room._introActive = false;
            if (gs.phase !== 'CHARACTER_SELECT') room.phase = 'playing';
            broadcastRoom(room);
            setTimeout(() => introStartDeckPhase(room), 200);
            return;
        }

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
                // Nikdo už nevybírá (typicky boti, kteří postavu zvolili dřív, než intro
                // došlo k char fázi) → žádné select_character už nepřijde, na balíček
                // musí navázat sekvence sama, jinak by intro uvázlo.
                if (room._introActive && gs.phase !== 'CHARACTER_SELECT') {
                    room._introActive = false;
                    room.phase = 'playing';
                    setTimeout(() => introStartDeckPhase(room), 200);
                }
            }, waitAfterDeal + 100);

        }, charShuffleDelay);
    }

    // Intro beaty rozšíření High Noon (viz view/intro.js): z kompletního balíčku vyletí
    // vrchní karta a ukáže se (Pravé poledne), pak se zbytek zamíchá vedle ní (~4,0 s pro
    // N=12) a nakonec se odložená karta zasune zespodu pod hromádku.
    const HN_TOP_MS = 2100;      // let 620 ms + výdrž, ať si ji stůl přečte
    const HN_SHUFFLE_MS = 4300;
    const HN_BOTTOM_MS = 1300;

    function introStartDeckPhase(room) {
        const gs = room.gameState;
        const n = room.players.length;
        const sheriffIdx = firstPlayerIndex(gs.players);
        const cardOrder = Array.from({ length: n }, (_, k) => (sheriffIdx + k) % n);
        // Plný balíček PŘED rozdáním počátečních rukou. selectCharacter() už ruce
        // rozdal (gs.deck.cards.length je tedy zmenšený) → přičteme rozdané karty zpět,
        // aby balíček rozdávání vizuálně začínal plný (80 karet ve standardní hře).
        const dealtTotal = gs.players.reduce((s, p) => s + (p.hand?.length || 0), 0);
        const deckCount = gs.deck.cards.length + dealtTotal;

        ctx.glog.system(`[INTRO] Deck phase, full deck: ${deckCount} (dealt back: ${dealtTotal})`);

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
                // Rozšíření High Noon: šerif sejme z kompletního balíčku vrchní kartu
                // (Pravé poledne, ukáže se vedle), zbytek zamíchá a odloženou kartu dá
                // vespod. Bez rozšíření je hnCount 0 a beaty se úplně přeskočí.
                const hnCount = gs.eventDeck?.length || 0;
                const hnDelay = hnCount ? (HN_TOP_MS + HN_SHUFFLE_MS + HN_BOTTOM_MS) : 0;
                if (hnCount) {
                    emitIntro(room, { sub: 'highnoon_top', hnCount });
                    setTimeout(() => emitIntro(room, { sub: 'shuffle_highnoon', hnCount }), HN_TOP_MS);
                    setTimeout(() => emitIntro(room, { sub: 'highnoon_bottom' }), HN_TOP_MS + HN_SHUFFLE_MS);
                }
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
                }, hnDelay);

            }, deckShuffleDelay);
        }, slideInStart + slideInDur);
    }

    Object.assign(ctx, {
        emitIntro, emitIntroRole, emitIntroChars,
        runIntroSequence, introStartCharPhase, introStartDeckPhase,
        runNextGameIntro, introKeepResult, introAfterRoles,
    });
    return ctx;
};
