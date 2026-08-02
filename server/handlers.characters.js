// server/handlers.characters.js — socket handlery dotahových schopností postav
// (Bart Cassidy, El Gringo, Suzy) a vyhodnocení checků/Black Jacku + get_taken_names.
// registerCharacterHandlers(socket, ctx, withRoom) – těla byte-identická.
module.exports = function registerCharacterHandlers(socket, ctx, withRoom) {
    const { rooms, emitAnim, emitAnimPrivate, emitDeathAnim, handleAutoEndTurn,
            handleReshuffleAndBroadcast, broadcastRoomDelayed } = ctx;
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

    // Vera Custer: na začátku svého tahu si zvolí kopírovanou postavu (VERA_COPY → DRAW).
    on('vera_copy', (d) => {
        withRoom((room, p, gs) => {
            gs.veraCopyCharacter(gs.currentPlayerIndex, d && d.charName);
            handleReshuffleAndBroadcast(room, gs);
        });
    });
};
