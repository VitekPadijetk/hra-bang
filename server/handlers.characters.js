// server/handlers.characters.js — socket handlery dotahových schopností postav
// (Bart Cassidy, El Gringo, Suzy) a vyhodnocení checků/Black Jacku + get_taken_names.
// registerCharacterHandlers(socket, ctx, withRoom) – těla byte-identická.
const { lawRevealMs } = require('../core/fistfulAnim.js');
const { dorothyRevealMs } = require('../core/wwsAnim.js');
module.exports = function registerCharacterHandlers(socket, ctx, withRoom) {
    const { rooms, emitAnim, emitAnimPrivate, emitDeathAnim, handleAutoEndTurn,
            handleReshuffleAndBroadcast, broadcastRoom, broadcastRoomDelayed } = ctx;
    // Guard „čí je tah" (viz handlers.game.js / server/guard.js).
    const on = ctx.guardedOn?.(socket) || socket.on.bind(socket);

    on('bart_cassidy_draw', () => {
        withRoom((room, p, gs) => {
            const playerIdx = gs.pendingBartDraw?.playerIdx ?? p.playerIdx;
            gs.bartCassidyDraw(playerIdx);
            // Majitel uvidí líznutou kartu (reveal flip), ostatní jen rub.
            const hand = gs.players[playerIdx].hand;
            const drawnId = hand[hand.length - 1]?.id;
            emitAnimPrivate(room, playerIdx,
                { type: 'draw', playerIdx, cardId: drawnId },
                { type: 'draw', playerIdx });
            // Broadcast musí dorazit TĚSNĚ před dosednutím líznutí (jako běžné líznutí, 350ms),
            // ne přesně na jeho konci (400ms) – jinak majiteli karta na okamžik problikne
            // (staging ji pustí dřív, než dorazí nový stav).
            handleReshuffleAndBroadcast(room, gs, 350);
        });
    });

    on('uhyb_draw', () => {
        withRoom((room, p, gs) => {
            const playerIdx = gs.pendingUhybDraw?.playerIdx ?? p.playerIdx;
            const before = gs.players[playerIdx]?.hand.length ?? 0;
            gs.uhybDraw(playerIdx);
            // Majitel uvidí líznutou kartu (reveal flip), ostatní jen rub.
            const hand = gs.players[playerIdx].hand;
            if (hand.length > before) {
                const drawnId = hand[hand.length - 1]?.id;
                emitAnimPrivate(room, playerIdx,
                    { type: 'draw', playerIdx, cardId: drawnId },
                    { type: 'draw', playerIdx });
            }
            // 350ms (těsně před dosednutím) místo 400ms – ať Úhyb/Bible líznutí majiteli neproblikne.
            handleReshuffleAndBroadcast(room, gs, 350);
        });
    });

    on('get_taken_names', () => {
        const taken = new Set();
        for (const [, r] of rooms) {
            r.players.filter(p => !p.disconnected).forEach(p => taken.add(p.name));
        }
        socket.emit('taken_names', [...taken]);
    });

    on('el_gringo_steal', () => {
        withRoom((room, p, gs) => {
            const playerIdx = gs.pendingElGringoSteal?.playerIdx ?? p.playerIdx;
            const attackerIdx = gs.pendingElGringoSteal?.attackerIdx;
            const handLenBefore = gs.players[playerIdx]?.hand.length ?? 0;
            gs.elGringoSteal(playerIdx);
            const hand = gs.players[playerIdx].hand;
            // Animuj jen pokud se opravdu něco ukradlo (útočník měl kartu).
            if (attackerIdx !== undefined && attackerIdx !== null && hand.length > handLenBefore) {
                const stolenId = hand[hand.length - 1]?.id;
                // Majitel (El Gringo) ukradenou kartu vidí, ostatní jen rub.
                emitAnimPrivate(room, playerIdx,
                    { type: 'jesse_jones_draw', playerIdx, fromPlayerIdx: attackerIdx, isElGringo: true, cardId: stolenId },
                    { type: 'jesse_jones_draw', playerIdx, fromPlayerIdx: attackerIdx, isElGringo: true });
            }
            broadcastRoomDelayed(room);
        });
    });

    on('suzy_draw', () => {
        withRoom((room, p, gs) => {
            const playerIdx = gs.pendingSuzyDraw?.playerIdx ?? p.playerIdx;
            gs.suzyLafayetteDraw(playerIdx);
            // Majitel uvidí líznutou kartu (reveal flip), ostatní jen rub.
            const hand = gs.players[playerIdx].hand;
            const drawnId = hand[hand.length - 1]?.id;
            emitAnimPrivate(room, playerIdx,
                { type: 'draw', playerIdx, cardId: drawnId },
                { type: 'draw', playerIdx });
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    on('trigger_check_draw', () => {
        withRoom((room, p, gs) => {
            gs.triggerCheckDraw();
            handleReshuffleAndBroadcast(room, gs, 0);
        });
    });

    on('resolve_check', () => {
        withRoom((room, p, gs) => {
            gs.resolveCheck();
            if (gs.lastAnimEvent) {
                emitAnim(room, gs.lastAnimEvent);
                gs.lastAnimEvent = null;
            }
            handleAutoEndTurn(room, gs);
            if (gs._deathAnimPlayerIdx !== undefined && gs._deathAnimPlayerIdx !== null) {
                emitDeathAnim(room, gs, gs._deathAnimPlayerIdx);
                gs._deathAnimPlayerIdx = null;
            }
            handleReshuffleAndBroadcast(room, gs, 0);
        });
    });

    on('resolve_black_jack', (wantThird) => {
        withRoom((room, p, gs) => {
            gs.resolveBlackJack(wantThird);
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    // ── Dodge City: aktivní schopnosti (Chuck Wengam / José Delgado / Doc Holyday) ──
    // Jde o schopnosti ve VLASTNÍM tahu → aktér je aktuální hráč (gs.currentPlayerIndex),
    // ne socket.playerIdx (v debugu ovládá jeden socket více hráčů = jiný index).
    on('chuck_wengam', () => {
        withRoom((room, p, gs) => {
            gs.useChuckWengam(gs.currentPlayerIndex);   // −1 život + lízání 2 (fronta → klik na balíček)
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    on('jose_delgado', (d) => {
        withRoom((room, p, gs) => {
            const idx = gs.currentPlayerIndex;
            const card = gs.players[idx]?.hand[d.cardIdx];
            const ok = gs.useJoseDelgado(idx, d.cardIdx);
            if (ok && card) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: idx, cardId: card.id });
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    on('doc_holyday', (d) => {
        withRoom((room, p, gs) => {
            const idx = gs.currentPlayerIndex;
            const ids = (d.cardIndices || []).map(i => gs.players[idx]?.hand[i]?.id).filter(x => x != null);
            const ok = gs.useDocHolyday(idx, d.cardIndices, d.targetIdx);
            if (ok) ids.forEach(id => emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: idx, cardId: id }));
            if (ok && d.targetIdx != null) ctx.recordBehavior?.(room, { actorIdx: idx, targetIdx: d.targetIdx, kind: 'hostile' });
            broadcastRoomDelayed(room);
        });
    });

    // Flint Westwood (Divoký západ): 1× za tah vymění 1 kartu z ruky za 2 náhodné
    // karty z ruky jiného hráče. Cizí karty jsou NÁHODNÉ (letí soukromě, pod Sacagaway
    // s gestem zamíchané ruky), jeho vlastní si vybral SÁM (`chosen` – gesto se nehraje).
    // Pořadí emitů = pořadí, ve kterém se karty z rukou braly: klient si kartu z vějíře
    // odebírá hned podle `stolenIndex`, takže musí sedět na stav v tu chvíli.
    on('flint_westwood', (d) => {
        withRoom((room, p, gs) => {
            const idx = gs.currentPlayerIndex;
            const targetIdx = d?.targetIdx;
            const res = gs.useFlintWestwood(idx, targetIdx, d?.cardId);
            if (!res) return;
            res.taken.forEach(({ card, slot }) => {
                const base = { type: 'ragtime_steal', attackerIdx: idx, targetIdx,
                               area: 'hand', boardIdx: null, stolenIndex: slot };
                emitAnimPrivate(room, idx, { ...base, stolenCardId: card.id },
                                           { ...base, stolenCardId: null });
            });
            const back = { type: 'ragtime_steal', attackerIdx: targetIdx, targetIdx: idx,
                           area: 'hand', boardIdx: null, stolenIndex: res.givenSlot, chosen: true };
            emitAnimPrivate(room, [idx, targetIdx],
                            { ...back, stolenCardId: res.given.id }, { ...back, stolenCardId: null });
            ctx.recordBehavior?.(room, { actorIdx: idx, targetIdx, kind: 'hostile' });
            broadcastRoomDelayed(room);
        });
    });

    // Lee Van Kliff (Divoký západ): odhodí kartu BANG! a zopakuje efekt hnědé karty,
    // kterou právě zahrál. Zaplacená karta letí do odhozu jako každá jiná; efekt se pak
    // rozjede úplně stejnou cestou jako po zahrání té původní karty (fáze RESPOND,
    // SELECTING_TARGET_CARD, STORE, DRAW…), takže se veze i všechno kolem – včetně
    // cinematiky míchání u zopakovaného Hokynářství.
    on('lee_van_kliff', (d) => {
        withRoom((room, p, gs) => {
            const idx = gs.currentPlayerIndex;
            const res = gs.useLeeVanKliff(idx, d?.cardId, d?.targetIdx ?? null);
            if (!res) return;
            emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: idx, cardId: res.paidCardId });
            if (res.targetIdx != null && res.targetIdx !== idx) {
                // Ledger: léčení je přátelské, všechno ostatní nepřátelské.
                const kind = res.effect === 'heal_any' ? 'support' : 'hostile';
                ctx.recordBehavior?.(room, { actorIdx: idx, targetIdx: res.targetIdx, kind });
            }
            if (gs.phase === 'STORE') {
                const t = ctx.storeCinematicMs?.(gs);
                room._storeShuffleUntil = t?.shuffleEnd > 0 ? Date.now() + t.shuffleEnd : 0;
            }
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    // Lady Růže z Texasu (Divoký západ): hráč na tahu si vymění místo se sousedem po
    // pravici a ten přeskočí svůj nejbližší tah. Sedadlo je index, takže se výměnou
    // přemapuje kus stavu naráz (`_swapSeats`, logic/wildWest.js) – a co na `room`
    // nevidí, dorovná se tady: ledger chování je klíčovaný sedadly stejně jako stav.
    on('lady_rose', () => {
        withRoom((room, p, gs) => {
            const idx = gs.currentPlayerIndex;
            const res = gs.useLadyRose(idx);
            if (!res) return;
            ctx.swapRoomSeats?.(room, res.fromIdx, res.toIdx);
            emitAnim(room, { type: 'wws_seat_swap', fromIdx: res.fromIdx, toIdx: res.toIdx });
            broadcastRoomDelayed(room);
        });
    });

    // ── Zuřivá Doroty (Divoký západ) ──────────────────────────────────
    // Hráč na tahu jmenuje kartu a hráče, který ji musí zahrát. Pravidla (včetně
    // vypůjčeného sedadla) jsou v logic/wildWest.js; tady se řeší jen to, co pravidla
    // nevidí – animace odcházející karty, dočasně odkrytá ruka a ledger chování.

    // Karta poručeného odchází z jeho ruky úplně stejně jako kdyby ji zahrál sám – modrá
    // a zelená na stůl, Vězení před cíl, Panika/Cat Balou vícedílnou sekvencí (kterou
    // dohraje select_target_card) a zbytek do odhozu.
    const dorothyAnim = (room, gs, commandedIdx, card, cardIdx, targetIdx, boardLenBefore) => {
        if (!card) return;
        const blueTypes = ['Zbraň', 'Barel', 'Vybavení', 'Dynamit'];
        if (blueTypes.includes(card.type) || card.green) {
            const boardIdx = card.type === 'Zbraň' ? 0 : 1 + boardLenBefore;
            emitAnim(room, { type: 'hand_to_board', playerIdx: commandedIdx, cardId: card.id, boardIdx });
            return;
        }
        if (card.type === 'Vězení') {
            const jailBoardIdx = 1 + (gs.players[targetIdx]?.board?.length || 0);
            emitAnim(room, { type: 'jail_sequence', attackerIdx: commandedIdx, targetIdx,
                             cardId: card.id, boardIdx: jailBoardIdx });
            return;
        }
        const isPanicCB = card.type === 'Panika!' || card.type === 'Cat Balou';
        if (isPanicCB && gs.phase === 'SELECTING_TARGET_CARD') {
            // Stejný trik jako v play_special: kartu podržíme mimo odhoz (a vizuálně
            // v ruce), dokud ji tam nedoveze animace spuštěná až při výběru karty.
            room._pendingPanicCard = {
                type: card.type === 'Panika!' ? 'panic_sequence' : 'catbalou_sequence',
                attackerIdx: commandedIdx, targetIdx, cardId: card.id,
            };
            const heldCard = gs.deck.takeFromDiscard(card.id);
            const hand = gs.players[commandedIdx].hand;
            if (heldCard) hand.splice(Math.min(cardIdx, hand.length), 0, heldCard);
            room._pendingPanicCard.held = heldCard ? [heldCard] : [];
            room._pendingPanicCard.heldInHand = !!heldCard;
            return;
        }
        emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: commandedIdx, cardId: card.id });
    };

    // Ledger chování: nepřátelský je PORUČUJÍCÍ, ne poručený – cíl si vybral on
    // (poručený kartu jen fyzicky zahrál). Bez toho by dedukce rolí (core/beliefs.js)
    // obvinila hráče z útoku, který mu někdo nakázal.
    const dorothyLedger = (room, ownerIdx, targetIdx) => {
        if (targetIdx == null || targetIdx === ownerIdx) return;
        ctx.recordBehavior?.(room, { actorIdx: ownerIdx, targetIdx, kind: 'hostile' });
    };

    on('dorothy_command', (d) => {
        withRoom((room, p, gs) => {
            const ownerIdx = gs.currentPlayerIndex;
            const commandedIdx = d?.targetIdx;
            const commanded = gs.players[commandedIdx];
            if (!commanded) return;
            // Snapshot PŘED zahráním – po něm už karta v ruce není.
            const cardIdx = (commanded.hand || []).findIndex(
                c => c && !c._placeholder && c.name === d?.cardName);
            const card = cardIdx === -1 ? null : commanded.hand[cardIdx];
            const boardLenBefore = (commanded.board || []).length;

            const res = gs.dorothyCommand(ownerIdx, d?.cardName, commandedIdx);
            if (!res) return;
            if (res.revealed) {
                // „Musí ukázat ruku." Redakce ji na tu chvíli pustí (server/rooms.js);
                // zhasnout ji musíme my, jinak by zůstala odkrytá napořád.
                const ms = dorothyRevealMs();
                room._wwsBlockUntil = Math.max(room._wwsBlockUntil || 0, Date.now() + ms);
                broadcastRoom(room);
                setTimeout(() => {
                    if (gs._dorothyReveal?.playerIdx !== commandedIdx) return;
                    gs._dorothyReveal = null;
                    broadcastRoom(room);
                }, ms);
                return;
            }
            if (res.needTarget) { broadcastRoom(room); return; }
            dorothyAnim(room, gs, commandedIdx, card, cardIdx, null, boardLenBefore);
            if (gs.phase === 'STORE') {
                const t = ctx.storeCinematicMs?.(gs);
                room._storeShuffleUntil = t?.shuffleEnd > 0 ? Date.now() + t.shuffleEnd : 0;
            }
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    on('dorothy_target', (d) => {
        withRoom((room, p, gs) => {
            const pd = gs.pendingDorothy;
            if (!pd) return;
            const ownerIdx = pd.playerIdx;
            const commandedIdx = pd.commandedIdx;
            const commanded = gs.players[commandedIdx];
            const cardIdx = (commanded?.hand || []).findIndex(c => c && c.id === pd.cardId);
            const card = cardIdx === -1 ? null : commanded.hand[cardIdx];
            const boardLenBefore = (commanded?.board || []).length;
            const targetIdx = d?.targetIdx;

            const res = gs.dorothyChooseTarget(ownerIdx, targetIdx);
            if (!res) { broadcastRoom(room); return; }
            dorothyAnim(room, gs, commandedIdx, card, cardIdx, targetIdx, boardLenBefore);
            dorothyLedger(room, ownerIdx, targetIdx);
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    on('dorothy_cancel', () => {
        withRoom((room, p, gs) => {
            if (!gs.dorothyCancel(gs.pendingDorothy?.playerIdx)) return;
            broadcastRoom(room);
        });
    });

    // Uncle Will (Fistful): 1× za tah zahraje libovolnou kartu z ruky jako Hokynářství.
    on('uncle_will', (d) => {
        withRoom((room, p, gs) => {
            const idx = gs.currentPlayerIndex;
            const card = gs.players[idx]?.hand[d?.cardIdx];
            const ok = gs.useUncleWill(idx, d?.cardIdx);
            if (!ok) return;
            emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: idx, cardId: card?.id });
            // Hokynářství: míchání si přebírá klientská cinematika (stejně jako po zahrání
            // opravdové karty Hokynářství, viz play_card).
            if (gs.phase === 'STORE') {
                const t = ctx.storeCinematicMs?.(gs);
                room._storeShuffleUntil = t?.shuffleEnd > 0 ? Date.now() + t.shuffleEnd : 0;
            }
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    // Claus "The Saint" (Fistful): odkryté karty leží v řadě uprostřed stolu a on je
    // rozděluje – nejdřív sobě, pak po jedné ostatním. Vybraná karta letí ze svého slotu
    // do ruky příjemce; líc vidí Claus (vybíral) i příjemce (má ji v ruce), ostatní rub.
    on('claus_give', (d) => {
        withRoom((room, p, gs) => {
            const cs = gs.clausState;
            const slot = d?.cardIdx;
            const giverIdx = gs.currentPlayerIndex;
            const toIdx = cs?.toIdx;
            const revealed = (cs?.revealed || []).slice();
            const card = revealed[slot];
            if (toIdx == null || !card) return;
            const lawBefore = gs.players[toIdx]?._lawCardId ?? null;
            if (!gs.clausPick(slot)) return;
            // Fistful – Právo západu: vynucená je druhá karta, kterou si Claus NECHÁ
            // (rozdané se nepočítají), a to v pořadí BALÍČKU (FAQ Q12) – nemusí to tedy
            // být ta, na kterou právě klikl. Slot se proto hledá v odkryté řadě podle ID.
            // Rozdávání se na chvíli zastaví, karta se ukáže celému stolu a teprve pak
            // jde do ruky (v ní je zase tajná). Stav drží fronta animací na klientu.
            const lawId = gs.players[toIdx]?._lawCardId ?? null;
            const lawSlot = (lawId != null && lawId !== lawBefore)
                ? revealed.findIndex(c => c && c.id === lawId) : -1;
            // Právě vybraná karta letí normálně – ledaže je to zrovna ta vynucená.
            if (lawSlot !== slot) {
                const base = { type: 'claus_pick', slot, toIdx };
                emitAnimPrivate(room, [toIdx, giverIdx], { ...base, cardId: card.id },
                                                         { ...base, cardId: null });
            }
            if (lawSlot !== -1) {
                emitAnim(room, { type: 'law_reveal', playerIdx: toIdx,
                                 card: revealed[lawSlot], from: 'claus', slot: lawSlot });
                room._revealBlockUntil = Math.max(room._revealBlockUntil || 0, Date.now() + lawRevealMs());
                broadcastRoom(room);
                return;
            }
            broadcastRoomDelayed(room, 380);
        });
    });

    // Vera Custer: na začátku svého tahu si zvolí kopírovanou postavu (VERA_COPY → DRAW).
    on('vera_copy', (d) => {
        withRoom((room, p, gs) => {
            gs.veraCopyCharacter(gs.currentPlayerIndex, d && d.charName);
            handleReshuffleAndBroadcast(room, gs);
        });
    });
};
