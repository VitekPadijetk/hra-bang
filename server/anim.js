// server/anim.js — animační a auto-tah helpery: emit card_animation/reshuffle_anim,
// smrt (Vulture Sam vs odhoz), automatické ukončení tahu po smrti, reshuffle broadcast.
// Factory installAnimService(ctx): bere { io, broadcastRoomDelayed } z ctx. Bez listenu.
const { deathSequenceMs, penaltyDiscardMs, deathFallMs, deathRevealMs } = require('../core/deathAnim.js');
const { hnRevealMs } = require('../core/highNoonAnim.js');
const { mineLandMs, ranchDiscardMs } = require('../core/fistfulAnim.js');
const { sacaFlipMs, sacaStealExtraMs, helenaRevealMs, roleShuffleMs, rolePeekMs } = require('../core/wwsAnim.js');
const { eventActive } = require('../core/highNoon.js');
const { effectiveCharacter, isInPlay } = require('../core/distance.js');

// Délka jedné animace ragtime_steal – MUSÍ sedět s ANIM_MS v net/handlers.js (o tuhle
// dobu drží klientská fronta stav a o stejnou se musí podržet boti).
const RAGTIME_MS = 360;

module.exports = function installAnimService(ctx) {
    const { io, broadcastRoomDelayed } = ctx;

    // Do rozpuštěné místnosti se už nic neposílá (closeRoom v server/rooms.js). `roomAlive`
    // chybí jen testům, které si anim službu instalují samostatně (bez rooms) – tam se
    // nefiltruje nic.
    const roomAlive = (room) => typeof ctx.roomAlive !== 'function' || ctx.roomAlive(room);

    // Divoký západ – Sacagaway: hrají všichni s odkrytými kartami v ruce (viz redactState
    // v server/rooms.js). Zrcadlí se tím i animace – co je ve stavu veřejné, nesmí letět
    // jako rub.
    const handsOpen = (room) => eventActive(room && room.gameState, 'SACAGAWAY');

    // A Fistful of Cards – Opuštěný důl: odhoz nad limit karet (FÁZE 3) letí lícem
    // nahoru na dobírací balíček, chvíli tam leží a teprve pak se překlopí na rub.
    // Pozná se to podle `toDeck` v datech animace – přesně jako na klientu
    // (_animDurationMs v net/handlers.js), takže se držení nemůže rozejít s tím,
    // jak dlouho animace opravdu trvá. Ostatní odhozy důl nemění.
    // Podrž boty po dobu doběhu, jinak by hráli „přes" něj a klientská fronta animací
    // by zaostala natolik, že by je zahodila – tedy právě to, kvůli čemu důl je.
    function holdForMineLand(room, data) {
        if (!room || !data || !data.toDeck) return;
        room._mineBlockUntil = Math.max(room._mineBlockUntil || 0, Date.now() + mineLandMs(true));
    }

    // Divoký západ – Sacagaway: krádež z odkryté ruky se pod ní hraje jako u stolu
    // (FAQ Q17) – ruka se přetočí lícem dolů, zamíchá, teprve pak z ní karta odletí
    // a zbytek se zase odhalí. Klient si tu cinematiku přehraje sám (core/wwsAnim.js);
    // tady se o stejnou dobu podrží boti, jinak by hráli „přes" ni.
    const HAND_STEAL_ANIMS = new Set(['panic_sequence', 'catbalou_sequence', 'ragtime_steal']);
    function holdForSacaSteal(room, data) {
        if (!data || !handsOpen(room)) return;
        // `chosen` = kartu vybral její majitel (Gary Looter bere odhoz nad limit), takže
        // se ruka nemíchá a gesto z FAQ Q17 se nehraje – to je jen o NÁHODNÉ krádeži.
        const isSteal = !data.chosen &&
                        (data.type === 'jesse_jones_draw' ||
                        (HAND_STEAL_ANIMS.has(data.type) && data.area === 'hand'));
        if (!isSteal) return;
        // Karta už je z ruky vyndaná (emituje se po resolvu) → před krádeží jich tam byla
        // o jednu víc. Vějíř oběti je u Jesseho/El Gringa `fromPlayerIdx`, jinak `targetIdx`.
        const victimIdx = data.type === 'jesse_jones_draw' ? data.fromPlayerIdx : data.targetIdx;
        const left = room.gameState?.players?.[victimIdx]?.hand?.length ?? 0;
        room._wwsBlockUntil = Math.max(room._wwsBlockUntil || 0,
                                       Date.now() + sacaStealExtraMs(left + 1));
    }

    function emitAnim(room, data) {
        if (!roomAlive(room)) return;
        holdForMineLand(room, data);
        holdForSacaSteal(room, data);
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
    // Divoký západ – Sacagaway: ruce leží lícem nahoru, takže karta, která do některé
    // z nich přiletí, je vzápětí veřejná – soukromý payload by ostatním nechal doletět
    // rub a ten by pak s příchozím stavem přeskočil na líc. Pod Sacagaway se proto
    // `ownerData` pošle rovnou všem.
    // VÝJIMKA – krádež z ruky: FAQ Q17 nařizuje ruku otočit lícem dolů a ZAMÍCHAT, teprve
    // pak se z ní vezme náhodná karta. V tu chvíli identitu opravdu nikdo nezná (klient
    // to i přehrává, viz core/wwsAnim.js), takže tyhle animace zůstávají soukromé.
    const SHUFFLED_HAND_ANIMS = new Set(['panic_sequence', 'ragtime_steal']);
    function fromShuffledHand(d) {
        if (!d) return false;
        if (d.chosen) return false;                          // Gary Looter: kartu vybral majitel
        if (d.type === 'jesse_jones_draw') return true;      // Jesse Jones i El Gringo
        return SHUFFLED_HAND_ANIMS.has(d.type) && d.area === 'hand';
    }

    function emitAnimPrivate(room, ownerPlayerIdx, ownerData, othersData) {
        if (!roomAlive(room)) return;
        if (handsOpen(room) && !fromShuffledHand(ownerData)) { emitAnim(room, ownerData); return; }
        holdForSacaSteal(room, ownerData);
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
        // Stejné dotazy jako pravidla (handlePlayerDeath v logic/combat.js): schopnost může
        // mít i Vera Custer (effectiveCharacter) a sbírat smí i duch Města duchů, který má
        // nula životů, ale ve hře je (isInPlay). Bez toho se karty ve stavu přesunuly Samovi,
        // ale animace je poslala do odhozu.
        const vultureIdx = gs.players.findIndex(
            (p, idx) => idx !== deadIdx && p && isInPlay(p) && effectiveCharacter(p) === "Vulture Sam"
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
            const topCardId = gs.deck.discardTop()
                ? gs.deck.discardTop().id
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
    // Divoký západ (`_pendingWwsReveal`) jde touž cestou, jen ho neodkrývá začátek tahu,
    // ale zahraný Dostavník / Wells Fargo – proto si s sebou nese vlastní `playerIdx`
    // (kartu otáčí ten, kdo ji zahrál, ne nutně hráč, kterého by měl klient rozsvítit).
    function flushHighNoonReveal(room) {
        const gs = room.gameState;
        if (!gs) return;
        const pending = [gs._pendingHighNoonReveal, gs._pendingFistfulReveal,
                         gs._pendingWwsReveal].filter(Boolean);
        if (!pending.length) return;
        gs._pendingHighNoonReveal = null;
        gs._pendingFistfulReveal = null;
        gs._pendingWwsReveal = null;
        pending.forEach(ev => {
            emitAnim(room, {
                type: 'high_noon_reveal',
                // deck: ze kterého balíčku karta vzlétá a kam dosedne ('hn' | 'ff').
                deck: ev.deck || 'hn',
                id: ev.id, key: ev.key, name: ev.name, art: ev.art, remaining: ev.remaining,
                // Kartu odkrývá šerif na začátku SVÉHO tahu, jenže stav (s novým hráčem na
                // tahu) dorazí až po celé cinematice – klient by po celou dobu ukazoval jako
                // hráče na tahu toho předchozího. Posíláme ho tedy s animací.
                playerIdx: ev.playerIdx ?? gs.currentPlayerIndex,
            });
        });
        // Boti po tu dobu nehrají – klient drží stav ve frontě a divák by jinak koukal
        // na odkrytou kartu, zatímco se hra pod ní posouvá dál.
        room._hnBlockUntil = Math.max(room._hnBlockUntil || 0,
                                      Date.now() + pending.length * hnRevealMs());
    }

    // ── Divoký západ – Sacagaway: přetočení všech vějířů ─────────────────────
    // Karta odkrývá (a její nástupce zase zakrývá) ruce všech hráčů. Pravidla se tím
    // nemění o řádek – mění se REDAKCE stavu (server/rooms.js), takže by ruce jinak
    // skočily z rubů na líce v jednom snímku. Emituje se HNED ZA odkrytím karty události
    // (flushHighNoonReveal), takže fronta animací na klientu přehraje nejdřív kartu
    // a teprve pak vlnu přetáčení; stav (s odkrytými / zakrytými
    // rukama) dorazí až za ní.
    //
    // Na PŘÍCHODU nese payload i ID karet v rukou: klient je v tu chvíli ještě nemá
    // (stav je pořád ten starý, redigovaný) a bez nich by neměl co překlopit lícem nahoru.
    // Na ODCHODU stačí počty – líce klient pořád vidí ve svém stavu.
    function flushSacaFlip(room) {
        const gs = room.gameState;
        const pend = gs && gs._pendingSacaFlip;
        if (!pend) return;
        gs._pendingSacaFlip = null;
        const hands = (gs.players || []).map((p, playerIdx) => (
            pend.open ? { playerIdx, cardIds: (p.hand || []).map(c => c.id) }
                      : { playerIdx, count: (p.hand || []).length }
        ));
        emitAnim(room, { type: 'saca_flip', open: !!pend.open, hands });
        // Boti po dobu přetáčení nehrají – klient drží stav ve frontě a hra by se pod
        // vlnou posunula dál (stejný důvod jako u odkrytí karty události).
        room._wwsBlockUntil = Math.max(room._wwsBlockUntil || 0,
            Date.now() + sacaFlipMs(hands.map(h => h.cardIds ? h.cardIds.length : h.count)));
    }

    // ── Divoký západ – Hřbitov / Helena Zontero: přerozdání rolí ─────────────
    // Pravidla jen označí, co se stalo (gs._helenaAnim / gs._roleShuffleAnim); emit řeší
    // tenhle hák, protože obě karty se spouštějí z úplně jiných míst (Helena uprostřed
    // cizí fáze 2 při zahrání Dostavníku, Hřbitov v krokovači startu tahu) a jediné, co
    // mají společné, je následující broadcast.
    //
    // Pořadí je pořadí v čase:
    //   1. helena_reveal   – sejmutí, které o přerozdání teprve rozhoduje,
    //   2. roles_reshuffle – VEŘEJNÁ půlka: karty rolí, které leží na stole (vyřazení
    //                        hráči pod Hřbitovem, ve hře pro 3 všichni), se sesbírají
    //                        doprostřed, zamíchají a rozdají zpátky rubem nahoru,
    //   3. role_peek       – SOUKROMÁ půlka: „každý hráč se podívá na svou novou roli".
    //                        Jde jedním veřejným eventem se seznamem seatů; každý klient
    //                        si přehraje jen tu svou (stejně jako new_identity_result),
    //                        takže z animace nejde odečíst ani to, kdo se dívá.
    //
    // Tady se taky RESETUJE ledger chování: dedukce „střílel na šerifa, tedy bandita"
    // se přerozdáním stala nepravdou a bot by cílil podle staré mapy. Ledger žije na
    // `room` (mimo broadcastovaný stav), takže si pravidla umí říct jen příznakem.
    // „Každý hráč se podívá na svou novou roli." Payload musí být PRO KAŽDÝ SOCKET JINÝ
    // (roli v něm má jen její majitel), takže na to nestačí ani emitAnim, ani
    // emitAnimPrivate. `playerIdxs` je naopak u všech stejné – fronta animací na klientu
    // podle něj drží stav stejně dlouho, i u toho, kdo si nepřehraje nic (role: null),
    // takže se klienti nerozejdou. Divák nevidí žádnou roli.
    // Roli nese animace, ne stav: nový stav dorazí až ZA cinematikou, takže by si klient
    // ve `state` přečetl pořád tu starou.
    function emitRolePeek(room, peek) {
        if (!roomAlive(room)) return;
        const gs = room.gameState;
        const base = { type: 'role_peek', playerIdxs: peek };
        const seen = new Set();
        room.players.forEach(rp => {
            if (seen.has(rp.socketId)) return;
            seen.add(rp.socketId);
            const s = io.sockets.sockets.get(rp.socketId);
            if (!s) return;
            const mine = peek.includes(rp.playerIdx) ? (gs.players[rp.playerIdx] || {}).role : null;
            s.emit('card_animation', { ...base, role: mine || null });
        });
        io.to(room.id + '_spectators').emit('card_animation', { ...base, role: null });
    }

    function flushWwsRoles(room) {
        const gs = room.gameState;
        if (!gs) return;
        let holdMs = 0;
        if (gs._helenaAnim) {
            const ha = gs._helenaAnim;
            gs._helenaAnim = null;
            emitAnim(room, { type: 'helena_reveal', card: ha.card, red: !!ha.red });
            holdMs += helenaRevealMs();
        }
        if (gs._ledgerResetPending) {
            gs._ledgerResetPending = false;
            if (typeof ctx.initLedger === 'function') ctx.initLedger(room);
        }
        const rs = gs._roleShuffleAnim;
        if (rs) {
            gs._roleShuffleAnim = null;
            const visible = rs.visible || [];
            if (visible.length) {
                emitAnim(room, { type: 'roles_reshuffle', playerIdxs: visible });
                holdMs += roleShuffleMs(visible.length);
            }
            const peek = rs.peek || [];
            if (peek.length) {
                emitRolePeek(room, peek);
                holdMs += rolePeekMs();
            }
        }
        // Boti po tu dobu nehrají – klient drží stav ve frontě a hra by se pod
        // cinematikou posunula dál (stejný důvod jako u odkrytí karty události).
        if (holdMs) room._wwsBlockUntil = Math.max(room._wwsBlockUntil || 0, Date.now() + holdMs);
    }

    // ── Město duchů: duch odchází ze hry a odkládá, co mu zbylo na stole ─────
    // Vizuálně TOTÉŽ jako šerifova ztráta karet za pomocníka (karty po jedné do odhozu,
    // bez poklesu životů a bez odhalení role) – duch svou roli odhalil už při vyřazení.
    // Sebral-li je Vulture Sam (`toIdx`), letí místo do odhozu po jedné do jeho ruky –
    // stejnou animací jako Ragtime. Dřív se v tomhle případě neemitovalo nic a karty
    // ze stolu ducha prostě zmizely a naskočily Samovi v ruce s novým stavem.
    function flushGhostLeave(room) {
        const gs = room.gameState;
        const gl = gs && gs._ghostLeaveAnim;
        if (!gl) return;
        gs._ghostLeaveAnim = null;
        if (gl.toIdx == null) {
            emitAnim(room, { type: 'sheriff_penalty_discard', ...gl });
            room._deathBlockUntil = Math.max(room._deathBlockUntil || 0, Date.now() + penaltyDiscardMs(
                (gl.blue?.length || 0) + (gl.weapon ? 1 : 0) + (gl.hand?.length || 0)));
            return;
        }
        // Pořadí jako v cinematice vyřazení (_deathCardSeq na klientu): modré odzadu,
        // pak zbraň, pak ruka. Vizuální slot je v jednotné konvenci „slot 0 = zbraň".
        // Ruka odzadu: klient kartu z vějíře odebere hned (stolenIndex), takže by se
        // při postupu odpředu posunuly indexy zbylých karet.
        const steps = [];
        const blue = gl.blue || [], hand = gl.hand || [];
        for (let k = blue.length - 1; k >= 0; k--) steps.push({ area: 'board', boardIdx: 1 + k, id: blue[k].id });
        if (gl.weapon) steps.push({ area: 'weapon', boardIdx: 0, id: gl.weapon.id });
        for (let h = hand.length - 1; h >= 0; h--) steps.push({ area: 'hand', boardIdx: null, id: hand[h].id, handIdx: h });
        steps.forEach(st => {
            const base = { type: 'ragtime_steal', attackerIdx: gl.toIdx, targetIdx: gl.playerIdx,
                           area: st.area, boardIdx: st.boardIdx,
                           stolenIndex: st.area === 'hand' ? st.handIdx : null };
            // Karta z ruky je skrytá – líc uvidí jen Sam, ostatním letí rub.
            if (st.area === 'hand') {
                emitAnimPrivate(room, gl.toIdx, { ...base, stolenCardId: st.id }, { ...base, stolenCardId: null });
            } else {
                emitAnim(room, { ...base, stolenCardId: st.id });
            }
        });
        room._deathBlockUntil = Math.max(room._deathBlockUntil || 0, Date.now() + steps.length * RAGTIME_MS);
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

    // ── Divoký západ – John Pain: sejmutá karta odchází z odhozu do jeho ruky ─
    // Pravidla jen označí, co si vzal (gs._johnPainAnim) – přesun se děje až ve chvíli,
    // kdy doběhl efekt, kvůli kterému se snímalo, a ta chvíle je uvnitř pravidel
    // (_drainJohnPain), ne u jedné konkrétní socket akce. Karta je v odhozu veřejná,
    // takže letí stejnou animací jako vracení karty Sidu Ketchumovi.
    function flushJohnPain(room) {
        const gs = room.gameState;
        const list = gs && gs._johnPainAnim;
        if (!list || !list.length) return;
        gs._johnPainAnim = null;
        list.forEach(it => {
            emitAnim(room, { type: 'discard_to_hand', toPlayerIdx: it.toPlayerIdx, cardId: it.cardId });
        });
    }

    // ── Divoký západ – Miláček Valentýn: odhoz celé ruky na začátku tahu ─────
    // Pravidla jen označí, co odletělo (gs._valentineAnim); emit řeší tenhle hák, protože
    // start tahu se spouští z pěti různých cest, ale všechny končí broadcastem.
    // Vizuálně je to TOTÉŽ co výměna karet Rančem (karty po jedné zleva doprava do
    // odhozu), takže se recykluje jeho animace i její časování – celá dávka je JEDNA
    // položka fronty, takže se nemůže rozpadnout ani zahodit kvůli zaostávání a stav
    // (fáze lízání náhrad) dorazí až za poslední dosedlou kartou.
    function flushValentine(room) {
        const gs = room.gameState;
        const va = gs && gs._valentineAnim;
        if (!va) return;
        gs._valentineAnim = null;
        if (!va.cardIds || !va.cardIds.length) return;
        emitAnim(room, { type: 'ranch_discard', playerIdx: va.playerIdx, cardIds: va.cardIds });
        // Boti o tu dobu nehrají – jinak by hráli „přes" odhazování.
        room._revealBlockUntil = Math.max(room._revealBlockUntil || 0,
                                          Date.now() + ranchDiscardMs(va.cardIds.length));
    }

    // Hák před odesláním stavu (viz broadcastRoom v server/rooms.js). Pořadí = pořadí
    // v čase: duch odejde na konci svého tahu, teprve pak může šerif odkrýt novou událost
    // a teprve za ní (poslední krok startu tahu) vyměnit ruku Miláček Valentýn.
    function beforeBroadcast(room) {
        flushGhostLeave(room);
        flushJohnnyPurge(room);
        flushHighNoonReveal(room);
        flushSacaFlip(room);
        flushWwsRoles(room);
        flushJohnPain(room);
        flushValentine(room);
    }

    Object.assign(ctx, { emitAnim, emitAnimPrivate, emitDeathAnim, emitPendingDeathReveal,
                         handleAutoEndTurn, handleReshuffleAndBroadcast, storeCinematicMs,
                         revealCinematicMs,
                         beforeBroadcast });
    return ctx;
};
