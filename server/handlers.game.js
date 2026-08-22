// server/handlers.game.js — socket handlery herních akcí (lízání, hraní karet,
// reakce, odhoz, Kit Carlson/Lucky Duke/Barel výběry, Sid/dynamit/pivo záchrany,
// hokynářství). registerGameHandlers(socket, ctx, withRoom) – těla byte-identická.
const { niResultMs } = require('../core/highNoonAnim.js');

module.exports = function registerGameHandlers(socket, ctx, withRoom) {
    const { emitAnim, emitAnimPrivate, emitDeathAnim, emitPendingDeathReveal, handleAutoEndTurn,
            handleReshuffleAndBroadcast, broadcastRoom, broadcastRoomDelayed } = ctx;
    // Registrace přes guard „čí je tah" (server/guard.js) – zahodí opožděný/duplicitní
    // klik od hráče, na kterého hra nečeká. Bez guardu v ctx (testy s holým ctx) padne
    // zpět na obyčejné socket.on.
    const on = ctx.guardedOn?.(socket) || socket.on.bind(socket);

    on('draw_card', (data) => {
        withRoom((room, p, gs) => {
            const ds = gs.drawPhaseState;
            const playerIdx = ds?.playerIdx;
            const isKitCarlson = ds?.isKitCarlson;
            // Claus (Fistful) odkrývá celou řadu naráz a rozdává ji z ní – žádná
            // deck→ruka animace, řadu si klient nakreslí z přechodu fáze (jako u Kita).
            const isClaus = ds?.isClaus;
            const animateDraw = playerIdx !== undefined && playerIdx !== null && !isKitCarlson && !isClaus;
            const isDeckDraw = data.source !== 'opponent_hand' && data.source !== 'discard' && data.source !== 'board';
            if (animateDraw && data.source === 'discard') {
                const topCard = gs.deck.discardPile[gs.deck.discardPile.length - 1];
                emitAnim(room, { type: 'pedro_draw', playerIdx, cardId: topCard?.id });
            }
            // Dodge City: Pat Brennan bere kartu ze stolu – přichystej animaci (cíl → ruka)
            // z ID/pozice PŘED odebráním; karta je veřejná (leží na stole).
            let patAnim = null;
            if (data.source === 'board' && gs.players[data.sourceIdx]) {
                const tgt = gs.players[data.sourceIdx];
                let stolenId = null, visIdx = null;
                if (data.area === 'weapon') { stolenId = tgt.weapon?.id ?? null; visIdx = 0; }
                else if (data.area === 'board') {
                    visIdx = 1 + (data.cardIdx ?? 0);
                    stolenId = tgt.board?.[data.cardIdx]?.id ?? null;
                }
                if (stolenId != null) patAnim = { type: 'ragtime_steal', attackerIdx: playerIdx, targetIdx: data.sourceIdx, area: data.area, boardIdx: visIdx, stolenCardId: stolenId };
            }
            // Před líznutím z ruky si pamatuj pořadí karet cíle – po odebrání dopočítáme
            // INDEX, ze kterého karta zmizela (Jesse bere náhodnou), ať klient odanimuje
            // správný slot (dřív odebíral poslední → viditelné přeskládání a špatná pozice).
            const victimBefore = (data.source === 'opponent_hand' && gs.players[data.sourceIdx])
                ? gs.players[data.sourceIdx].hand.map(c => c.id) : null;
            const phaseBefore = gs.phase, drawnBefore = ds?.cardsDrawn ?? -1;
            const handBefore = gs.players[playerIdx]?.hand.length ?? -1;
            gs.drawCard(data.source, data.sourceIdx, data.area, data.cardIdx);
            // Klik navíc na balíček (pomalá linka: klient ještě nemá stav, kde už dolízal)
            // – logika ho zahodila, takže se nic nelízlo ani nezměnila fáze. NEANIMUJ nic:
            // jinak by poslední karta z ruky „znovu přiletěla" z balíčku. Jen sesynchronizuj.
            if (gs.phase === phaseBefore && (gs.drawPhaseState?.cardsDrawn ?? -1) === drawnBefore
                && (gs.players[playerIdx]?.hand.length ?? -1) === handBefore) {
                broadcastRoom(room);
                return;
            }
            // Pat Brennan – emituj animaci jen když karta opravdu přešla do jeho ruky.
            if (patAnim && gs.players[playerIdx]?.hand.some(c => c.id === patAnim.stolenCardId)) {
                emitAnim(room, patAnim);
                // Animace letu je 360ms; broadcast musí dorazit TĚSNĚ před dosednutím (ne až
                // po něm), jinak karta po zániku sprite na chvíli zmizí, než ji přidá nový stav
                // (animace „nenavazovala"). Karta se v ruce do dosednutí drží skrytá (staging).
                broadcastRoomDelayed(room, 330);
                return;
            }
            if (animateDraw && data.source === 'opponent_hand') {
                // Ukradená karta je teď poslední v ruce Jesseho – majitel ji vidí (reveal
                // flip rub→líc za letu), ostatní jen rub. stolenIndex posíláme VŠEM (u diváků
                // jen rub, identitu karty to neprozradí; cíl svou ruku vidí, takže mu to sedí).
                const hand = gs.players[playerIdx].hand;
                const stolenId = hand[hand.length - 1]?.id;
                const stolenIndex = victimBefore ? victimBefore.indexOf(stolenId) : -1;
                emitAnimPrivate(room, playerIdx,
                    { type: 'jesse_jones_draw', playerIdx, fromPlayerIdx: data.sourceIdx, cardId: stolenId, stolenIndex },
                    { type: 'jesse_jones_draw', playerIdx, fromPlayerIdx: data.sourceIdx, stolenIndex });
            }
            if (gs.phase === 'BLACK_JACK_CHECK') {
                // Black Jack 2. karta: ŽÁDNÁ deck→ruka animace – klient spustí reveal
                // z přechodu fáze (BLACK_JACK_CHECK) a po revealu se sám vyhodnotí.
                handleReshuffleAndBroadcast(room, gs, 0);
                return;
            }
            if (animateDraw && isDeckDraw) {
                // Líznutí z balíčku: majitel uvidí reveal (flip rub→líc skutečné karty,
                // kterou si bere), ostatní jen rub. Líznutá karta je teď poslední v ruce.
                const hand = gs.players[playerIdx].hand;
                const drawnId = hand[hand.length - 1]?.id;
                emitAnimPrivate(room, playerIdx,
                    { type: 'draw', playerIdx, cardId: drawnId },
                    { type: 'draw', playerIdx });
            }
            if (isKitCarlson || isClaus) {
                handleReshuffleAndBroadcast(room, gs, 0);
            } else if (gs.deck._reshuffleOccurred) {
                handleReshuffleAndBroadcast(room, gs, 400);
            } else {
                // Flat 350ms pro kazdou kartu zvlast - nezavisle na poradi
                // (350ms < 380ms animace, takze karta bude v state kdyz timer vybehne)
                setTimeout(() => broadcastRoom(room), 350);
            }
        });
    });

    on('play_card', (i) => {
        withRoom((room, p, gs) => {
            const player = gs.getCurrentPlayer();
            const card = player?.hand[i];
            const blueTypes = ['Zbraň','Barel','Vybavení','Dynamit'];
            // Zelené karty (Dodge City) se vykládají na stůl stejně jako modré.
            if (blueTypes.includes(card?.type) || card?.green) {
                const boardIdx = card.type === 'Zbraň' ? 0 : 1 + player.board.length;
                emitAnim(room, { type: 'hand_to_board', playerIdx: gs.currentPlayerIndex, cardId: card?.id, boardIdx });
                const isWeaponSwap = card.type === 'Zbraň' && player.weapon && player.weapon.id !== -1;
                if (isWeaponSwap) {
                    const oldWeaponId = player.weapon.id;
                    gs.playCard(i);
                    // Po gs.playCard() je stará zbraň už v discardPile (logic ji tam přidal).
                    // Dočasně ji vyjmeme aby se nezobrazila v odhozu dřív než animace doletí.
                    const oldWeaponDiscardIdx = gs.deck.discardPile.findIndex(c => c.id === oldWeaponId);
                    const removedWeapon = oldWeaponDiscardIdx !== -1
                        ? gs.deck.discardPile.splice(oldWeaponDiscardIdx, 1)[0]
                        : null;
                    // Animace: nová zbraň letí ruka→stůl (380ms), stará stůl→odhoz (420ms start, 380ms trvání → konec ~800ms)
                    setTimeout(() => {
                        emitAnim(room, { type: 'board_to_discard', fromPlayerIdx: gs.currentPlayerIndex, cardId: oldWeaponId, boardIdx: 0 });
                    }, 420);
                    // Broadcast za 390ms: nová zbraň je v ruce, stará JEŠTĚ není v odhozu
                    broadcastRoomDelayed(room, 390);
                    // Za 820ms: vrátíme starou zbraň do odhozu a broadcastujeme finální stav
                    setTimeout(() => {
                        if (removedWeapon) gs.deck.discardPile.push(removedWeapon);
                        broadcastRoom(room);
                    }, 820);
                    return;
                }
            } else if (!card?.discardExtra) {
                // Karta „odhoď další kartu" zůstává v ruce, dokud hráč nevybere druhou
                // kartu (fáze DISCARD_ANOTHER) – teď ji tedy do odhozu neodanimujeme.
                emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: gs.currentPlayerIndex, cardId: card?.id });
            }
            gs.playCard(i);
            // Hokynářství: míchání si přebírá klientská cinematika (openStore potlačil
            // legacy reshuffle_anim), takže tady jen zapamatuj, KDY dojede. U proaktivního
            // režimu se během něj smí brát, ale po posledním výběru na něj hra počká.
            if (gs.phase === 'STORE') {
                const t = ctx.storeCinematicMs?.(gs);
                room._storeShuffleUntil = t?.shuffleEnd > 0 ? Date.now() + t.shuffleEnd : 0;
            }
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    on('play_bang', (d) => {
        withRoom((room, p, gs) => {
            const attacker = gs.players[d.attackerIdx];
            const card = attacker?.hand[d.cardIdx];
            emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.attackerIdx, cardId: card?.id });
            gs.playBang(d.attackerIdx, d.targetIdx, d.cardIdx);
            if (d.targetIdx !== d.attackerIdx) ctx.recordBehavior?.(room, { actorIdx: d.attackerIdx, targetIdx: d.targetIdx, kind: 'hostile' });
            broadcastRoomDelayed(room);
        });
    });

    on('play_special', (d) => {
        withRoom((room, p, gs) => {
            const atk = gs.players[d.attackerIdx];
            const tar = d.targetIdx !== null ? gs.players[d.targetIdx] : null;
            const card = atk?.hand[d.cardIdx];
            const isPanicCB = card?.type === 'Panika!' || card?.type === 'Cat Balou';
            if (isPanicCB) {
                room._pendingPanicCard = { type: card.type === 'Panika!' ? 'panic_sequence' : 'catbalou_sequence',
                    attackerIdx: d.attackerIdx, targetIdx: d.targetIdx, cardId: card?.id };
            } else if (card?.type === 'Vězení') {
                const jailBoardIdx = 1 + (tar?.board?.length || 0);
                emitAnim(room, { type: 'jail_sequence', attackerIdx: d.attackerIdx, targetIdx: d.targetIdx, cardId: card?.id, boardIdx: jailBoardIdx });
            } else {
                emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.attackerIdx, cardId: card?.id });
            }
            gs.playSpecialCard(d.attackerIdx, d.targetIdx, d.cardIdx);
            // Cílené hostilní karty (Vězení/Panika/Cat Balou/Duel) → ledger chování (dedukce rolí).
            if (d.targetIdx != null && ['Vězení', 'Panika!', 'Cat Balou', 'Duel'].includes(card?.type)) {
                ctx.recordBehavior?.(room, { actorIdx: d.attackerIdx, targetIdx: d.targetIdx, kind: 'hostile' });
            }
            // Panika/Cat Balou nemusí vždy nastartovat výběr karty (Apache Kid je imunní
            // vůči ♦ → karta se odhodí naprázdno). Držení karty v ruce dělej JEN když
            // opravdu běží výběr (SELECTING_TARGET_CARD), jinak zůstane _pendingPanicCard
            // viset a bot by kartu zahrál znovu a znovu (stall).
            if (isPanicCB && gs.phase !== 'SELECTING_TARGET_CARD') {
                delete room._pendingPanicCard;
                emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.attackerIdx, cardId: card?.id });
            }
            if (isPanicCB && room._pendingPanicCard) {
                // playSpecialCard kartu odhodil hned, ale animaci (panic/catbalou) emitujeme
                // až ve select_target_card. Kartu podržíme mimo odhoz, ať se u diváků neobjeví
                // dřív, než ji tam animace doveze (re-add po doletu). NAVÍC ji dočasně vrať do
                // RUKY útočníka na původní index – ať v jeho vějíři zůstane vidět, dokud ji
                // nezvedne animace. Jinak (typicky u BOTA) zmizí hned na tomto broadcastu a
                // panika přiletí až po dalším ticku bota → viditelná mezera „karta zmizela,
                // pak nic, pak přiletí". Klient ji z ruky odebere přesně se startem animace
                // (_liftCardFromHand), server ji vyndá v select_target_card níže.
                const di = gs.deck.discardPile.findIndex(c => c.id === card.id);
                const heldCard = di !== -1 ? gs.deck.discardPile.splice(di, 1)[0] : null;
                if (heldCard) atk.hand.splice(Math.min(d.cardIdx, atk.hand.length), 0, heldCard);
                room._pendingPanicCard.held = heldCard ? [heldCard] : [];
                room._pendingPanicCard.heldInHand = !!heldCard;
            }
            broadcastRoomDelayed(room);
        });
    });

    on('select_target_card', (d) => {
        withRoom((room, p, gs) => {
            const pending = room._pendingPanicCard;
            if (pending) {
                const target = gs.players[pending.targetIdx ?? p.playerIdx];
                let boardIdx = null;
                if (d.area === 'weapon') {
                    boardIdx = 0;
                } else if (d.area === 'board') {
                    // Vizuální slot v jednotné konvenci „slot 0 = zbraň" (klient si ji u
                    // soupeřů bez zbraně sám posune – viz getBoardPos v net/handlers.js).
                    boardIdx = 1 + (d.cardIdx ?? 0);
                }
                // Veřejné ID ukradené karty (z ruky je skryté). Výzbroj/stůl čteme
                // PŘED resolvem, dokud je karta ještě u cíle.
                let stolenCardId = pending.cardId;
                if (d.area === 'hand') stolenCardId = null;
                else if (d.area === 'weapon') stolenCardId = target?.weapon?.id ?? null;
                else if (d.area === 'board') stolenCardId = target?.board?.[d.cardIdx]?.id ?? null;
                const isPanic = pending.type === 'panic_sequence';
                const attackerIdx = pending.attackerIdx;
                const held = pending.held || [];
                // Z ruky se bere NÁHODNÁ karta – zapamatuj si pořadí ruky cíle PŘED resolvem,
                // ať pak dopočítáš, ze kterého slotu vějíře karta odešla (stolenIndex). Klient
                // podle něj odebere správnou kartu (u vlastní ruky je to vidět!) a rozehraje
                // let z jejího místa – stejně jako Jesse Jones.
                const victimHandBefore = (d.area === 'hand' && target) ? target.hand.map(c => c.id) : null;
                delete room._pendingPanicCard;
                // Paniku/CB jsme na play_special dočasně vrátili do ruky útočníka (ať v ní
                // zůstane vidět, než ji zvedne animace). Teď, když animaci pouštíme, ji z ruky
                // zase vyndej – do odhozu se vrátí až po doletu (viz held/animEnd níže).
                if (pending.heldInHand && held[0]) {
                    const atkH = gs.players[attackerIdx].hand;
                    const hi = atkH.findIndex(c => c.id === held[0].id);
                    if (hi !== -1) atkH.splice(hi, 1);
                }
                gs.resolveCardSelection(d.attackerIdx, d.area, d.cardIdx);
                // Cat Balou z ruky: odhozená karta je teď navrchu odhozu = VEŘEJNÁ, takže
                // pošli její skutečné ID – ať se za letu odhalí (rub→líc) a natočí do odhozu
                // (u soupeře naproti se dřív posílal jen rub → karta se ani neotočila, ani
                // nepřetočila). Panika z ruky zůstává skrytá (míří do ruky útočníka).
                if (!isPanic && d.area === 'hand') {
                    stolenCardId = gs.deck.discardPile[gs.deck.discardPile.length - 1]?.id ?? null;
                }
                // Slot ve vějíři cíle (jen z ruky). Posílá se VŠEM – identitu karty to
                // neprozradí (ostatní vidí pořád jen rub), ale ruka se přeskládá správně.
                const handSlotOf = (id) => {
                    const i = victimHandBefore ? victimHandBefore.indexOf(id) : -1;
                    return i === -1 ? null : i;
                };
                if (isPanic && d.area === 'hand') {
                    // Panika z ruky: útočník si vzal kartu do ruky a zná ji (poslední
                    // v ruce), ostatní vidí jen rub.
                    const atkHand = gs.players[attackerIdx].hand;
                    const ownerStolenId = atkHand[atkHand.length - 1]?.id;
                    const stolenIndex = handSlotOf(ownerStolenId);
                    emitAnimPrivate(room, attackerIdx,
                        { ...pending, area: d.area, boardIdx, stolenIndex, stolenCardId: ownerStolenId },
                        { ...pending, area: d.area, boardIdx, stolenIndex, stolenCardId: null });
                } else {
                    emitAnim(room, { ...pending, area: d.area, boardIdx, stolenCardId,
                                     stolenIndex: d.area === 'hand' ? handSlotOf(stolenCardId) : null });
                }
                // Cat Balou: ukradená karta právě skončila navrchu odhozu – taky ji
                // podržíme, ať se u diváků neobjeví dřív, než ji tam doveze animace.
                if (!isPanic) {
                    const top = gs.deck.discardPile[gs.deck.discardPile.length - 1];
                    if (top) { gs.deck.discardPile.pop(); held.push(top); }
                }
                // Stav rozešli AŽ po doletu vícedílné animace (panic ~600, catbalou ~670 ms):
                // ukradená karta se pak objeví v ruce útočníka přesně když tam dosedne (ne hned
                // na broadcastu = „moc brzo"), cíl už kartu vizuálně ztratil (klient) a podržené
                // karty (panika/CB + u CB zničená) naskočí v odhozu včas. Do té doby žádný
                // broadcast – dřív šel hned na 400 ms a karta se objevila předčasně.
                const animEndMs = pending.type === 'catbalou_sequence' ? 670 : 600;
                setTimeout(() => {
                    held.forEach(c => gs.deck.discardPile.push(c));
                    broadcastRoom(room);
                }, animEndMs);
                return;
            }
            // Rvačka (isBrawl): karta cíle letí do odhozu. U výzbroje/stolu čteme ID + vizuální
            // slot PŘED resolvem; z ruky (náhodná) až po resolvu (skončí navrchu odhozu).
            const sel = gs.pendingSelection;
            // Daltonové (High Noon) letí do odhozu úplně stejně jako Rvačka – jen si kartu
            // vybírá její vlastník sám (attacker === target) a nikdy to není karta z ruky.
            const isBrawl = sel?.isBrawl || sel?.isDaltons;
            const victimIdx = sel?.targetIdx;
            const victim = gs.players[victimIdx];
            // Dělení karet mrtvého mezi víc Vulture Samů: vzatá karta letí od mrtvého do
            // ruky Sama (stejná animace jako Ragtime). ID ze stolu/výzbroje čteme PŘED
            // resolvem, z ruky až po něm (je to skrytá karta – majitel ji uvidí, ostatní rub).
            const isVultureSplit = sel?.isVultureSplit;
            let vsCardId = null, vsVisBoardIdx = null;
            if (isVultureSplit && victim) {
                if (d.area === 'weapon') { vsCardId = victim.weapon?.id ?? null; vsVisBoardIdx = 0; }
                else if (d.area === 'board') {
                    vsVisBoardIdx = 1 + (d.cardIdx ?? 0);
                    vsCardId = victim.board?.[d.cardIdx]?.id ?? null;
                }
            }
            // Pořadí ruky oběti PŘED resolvem → slot náhodně vzaté karty (viz stolenIndex výše).
            const victimHandIds = (d.area === 'hand' && victim) ? victim.hand.map(c => c.id) : null;
            const handSlotOf = (id) => {
                const i = victimHandIds ? victimHandIds.indexOf(id) : -1;
                return i === -1 ? null : i;
            };
            let brawlBoardId = null, brawlVisBoardIdx = null;
            if (isBrawl && victim) {
                if (d.area === 'weapon') { brawlBoardId = victim.weapon?.id ?? null; brawlVisBoardIdx = 0; }
                else if (d.area === 'board') {
                    brawlVisBoardIdx = 1 + (d.cardIdx ?? 0);
                    brawlBoardId = victim.board?.[d.cardIdx]?.id ?? null;
                }
            }
            gs.resolveCardSelection(d.attackerIdx, d.area, d.cardIdx);
            if (isVultureSplit && victimIdx != null) {
                const atkIdx = d.attackerIdx;
                const base = { type: 'ragtime_steal', attackerIdx: atkIdx, targetIdx: victimIdx,
                               area: d.area, boardIdx: vsVisBoardIdx };
                if (d.area === 'hand') {
                    // Z ruky mrtvého jde náhodná karta – Sam ji zná (poslední v jeho ruce),
                    // ostatní vidí jen rub. stolenIndex = slot, ze kterého karta odešla.
                    const atkHand = gs.players[atkIdx].hand;
                    const ownerId = atkHand[atkHand.length - 1]?.id ?? null;
                    const stolenIndex = handSlotOf(ownerId);
                    emitAnimPrivate(room, atkIdx, { ...base, stolenIndex, stolenCardId: ownerId },
                                                  { ...base, stolenIndex, stolenCardId: null });
                } else {
                    emitAnim(room, { ...base, stolenCardId: vsCardId });
                }
                // Poslední karta rozdělena → dohraj cinematiku vyřazení (odhalení role).
                emitPendingDeathReveal?.(room, gs);
                broadcastRoomDelayed(room, 420);
                return;
            }
            if (isBrawl && victimIdx != null) {
                if (d.area === 'hand') {
                    // Odhozená karta je navrchu odhozu (veřejná) → klient si její slot v ruce
                    // najde podle ID sám (hand_to_discard, getMyPlayedCardPos).
                    const top = gs.deck.discardPile[gs.deck.discardPile.length - 1];
                    if (top) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: victimIdx, cardId: top.id });
                } else if (brawlBoardId != null) {
                    emitAnim(room, { type: 'board_to_discard', fromPlayerIdx: victimIdx, cardId: brawlBoardId, boardIdx: brawlVisBoardIdx });
                }
                broadcastRoomDelayed(room, 420);
                return;
            }
            broadcastRoomDelayed(room);
        });
    });

    on('respond_to_card', (d) => {
        withRoom((room, p, gs) => {
            if (d.cardIndex !== null || d.boardCardId != null) {
                const respPlayer = gs.players[d.playerIdx];
                if (d.boardCardId != null) {
                    // Zelená Vedle!-karta ze stolu (Železný plát/Stetson/Sombrero/Bible).
                    const bi = respPlayer?.board.findIndex(c => c.id === d.boardCardId) ?? -1;
                    const visBoardIdx = 1 + (bi >= 0 ? bi : 0);
                    emitAnim(room, { type: 'board_to_discard', fromPlayerIdx: d.playerIdx, cardId: d.boardCardId, boardIdx: visBoardIdx });
                } else {
                    const card = respPlayer?.hand[d.cardIndex];
                    emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.playerIdx, cardId: card?.id });
                }
                gs.handleResponse(d.playerIdx, d.cardIndex, d.boardCardId ?? null);
                // Úhyb / Bible líznutí NEřešíme tady – handleResponse zařadí UHYB_DRAW do fronty,
                // hráč si pak klikne na balíček (viz handler 'uhyb_draw').
                if (gs.players[d.playerIdx]?.health <= 0) {
                    emitDeathAnim(room, gs, d.playerIdx);
                }
                handleAutoEndTurn(room, gs);
                handleReshuffleAndBroadcast(room, gs);
            } else {
                const partialMisses = gs.pendingResponse?.partialMisses?.map(pm => ({ ...pm })) || [];
                const targetPlayer = gs.players[d.playerIdx];
                const beerBefore = targetPlayer?.hand?.filter(c => c.type === 'Pivo').map(c => c.id) || [];

                gs.handleResponse(d.playerIdx, d.cardIndex);

                if (gs.players[d.playerIdx]?.health <= 0) {
                    emitDeathAnim(room, gs, d.playerIdx);
                }
                handleAutoEndTurn(room, gs);

                let hasAnimations = false;

                if (partialMisses.length > 0) {
                    hasAnimations = true;
                    partialMisses.forEach(pm => {
                        setTimeout(() => {
                            emitAnim(room, { type: 'discard_to_hand', toPlayerIdx: pm.playerIdx, cardId: pm.card?.id });
                        }, 50);
                    });
                }

                const beerAfter = targetPlayer?.hand?.filter(c => c.type === 'Pivo').map(c => c.id) || [];
                const usedBeerIds = beerBefore.filter(id => !beerAfter.includes(id));
                if (usedBeerIds.length > 0) {
                    hasAnimations = true;
                    usedBeerIds.forEach(cardId => {
                        emitAnim(room, { type: 'beer_auto_save', fromPlayerIdx: d.playerIdx, cardId });
                    });
                }

                if (hasAnimations) {
                    broadcastRoomDelayed(room, 420);
                } else {
                    broadcastRoom(room);
                }
            }
        });
    });

    // ── Dodge City: aktivace zelené karty ze stolu ──────────────────────────────
    on('activate_green_card', (d) => {
        withRoom((room, p, gs) => {
            const playerIdx = d.playerIdx ?? gs.currentPlayerIndex;
            const player = gs.players[playerIdx];
            const bi = player?.board.findIndex(c => c.id === d.cardId) ?? -1;
            if (bi === -1) { broadcastRoom(room); return; }
            const card = player.board[bi];
            const greenVisIdx = 1 + bi;
            const eff = card.activate;
            const isSteal = eff === 'steal_any', isDiscard = eff === 'discard_any';
            const target = d.target || null;

            // Krádež/odhoz: veřejné ID cílové karty (výzbroj/stůl) čteme PŘED aktivací.
            let victimPublicId = null, victimVisIdx = null;
            if ((isSteal || isDiscard) && target) {
                const victim = gs.players[target.targetIdx];
                if (target.area === 'weapon') { victimPublicId = victim?.weapon?.id ?? null; victimVisIdx = 0; }
                else if (target.area === 'board') {
                    victimVisIdx = 1 + (target.boardIdx ?? 0);
                    victimPublicId = victim?.board?.[target.boardIdx]?.id ?? null;
                }
            }

            // Zelená karta letí ze stolu do odhozu.
            emitAnim(room, { type: 'board_to_discard', fromPlayerIdx: playerIdx, cardId: card.id, boardIdx: greenVisIdx });
            // Stav před aktivací: podle toho poznáme, jestli se efekt vůbec provedl (Apache Kid
            // je imunní vůči károvému Krytému vozu/Kankánu → karta se odhodí naprázdno, nic se
            // nevezme/neodhodí → nesmí se pak přehrát animace brané/odhozené karty).
            const stealHandBefore = gs.players[playerIdx].hand.length;
            const discardBefore = gs.deck.discardPile.length;
            // Krádež z ruky (Krytý vůz): pořadí ruky oběti PŘED aktivací → slot vzaté karty.
            const victimHandIds = (isSteal && target?.area === 'hand')
                ? (gs.players[target.targetIdx]?.hand || []).map(c => c.id) : null;
            gs.activateGreenCard(playerIdx, d.cardId, target);
            // Cílená zelená karta (bang-efekt / krádež / odhoz) → ledger chování (dedukce rolí).
            // Střelba/odhoz na sebe se do ledgeru nepočítá (není to nepřátelský akt).
            if (target && target.targetIdx != null && target.targetIdx !== playerIdx) {
                ctx.recordBehavior?.(room, { actorIdx: playerIdx, targetIdx: target.targetIdx, kind: 'hostile' });
            }

            if (isSteal) {
                const atkHand = gs.players[playerIdx].hand;
                if (atkHand.length <= stealHandBefore) { broadcastRoomDelayed(room, 500); return; }  // nic neukradeno (Apache) → bez animace
                const ownerStolenId = atkHand[atkHand.length - 1]?.id;
                const vsi = victimHandIds ? victimHandIds.indexOf(ownerStolenId) : -1;
                const anim = { type: 'ragtime_steal', attackerIdx: playerIdx, targetIdx: target.targetIdx, area: target.area,
                               boardIdx: victimVisIdx, stolenIndex: vsi === -1 ? null : vsi };
                emitAnimPrivate(room, playerIdx,
                    { ...anim, stolenCardId: target.area === 'hand' ? ownerStolenId : victimPublicId },
                    { ...anim, stolenCardId: target.area === 'hand' ? null : victimPublicId });
                broadcastRoomDelayed(room, 500);
                return;
            }
            if (isDiscard) {
                // > discardBefore + 1 = kromě zelené karty se odhodila i cílová (efekt proběhl).
                if (gs.deck.discardPile.length > discardBefore + 1) {
                    if (target.area === 'hand') {
                        const top = gs.deck.discardPile[gs.deck.discardPile.length - 1];
                        if (top) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: target.targetIdx, cardId: top.id });
                    } else if (victimPublicId != null) {
                        emitAnim(room, { type: 'board_to_discard', fromPlayerIdx: target.targetIdx, cardId: victimPublicId, boardIdx: victimVisIdx });
                    }
                }
                broadcastRoomDelayed(room, 500);
                return;
            }
            // Bang-efekt / Houfnice / Čutora / Pony express: zbytek řeší nový stav (RESPOND/DRAW/PLAY).
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    // ── Dodge City: „odhoď další kartu" (cíl → cena → efekt) ────────────────────
    // 1) Hráč zvolil hlavní kartu + cíl → přejdeme na výběr ceny (DISCARD_ANOTHER).
    on('discard_extra_choose', (d) => {
        withRoom((room, p, gs) => {
            // Ledger chování: Springfield/Ragtime na cíl = hostilní, Tequila na jiného = podpora.
            const eff = gs.players[gs.currentPlayerIndex]?.hand[d.cardIdx]?.discardExtra;
            if (d.targetIdx != null && d.targetIdx !== gs.currentPlayerIndex) {
                if (eff === 'bang_any' || eff === 'steal_any') {
                    ctx.recordBehavior?.(room, { actorIdx: gs.currentPlayerIndex, targetIdx: d.targetIdx, kind: 'hostile' });
                } else if (eff === 'heal_any') {
                    ctx.recordBehavior?.(room, { actorIdx: gs.currentPlayerIndex, targetIdx: d.targetIdx, kind: 'support' });
                }
            }
            gs.startDiscardExtra(d.cardIdx, { targetIdx: d.targetIdx, area: d.area, boardIdx: d.boardIdx });
            broadcastRoom(room);
        });
    });

    // 2) Hráč vybral „další kartu" (cenu) → obě karty do odhozu (další, pak hlavní) + efekt.
    on('discard_another_card', (d) => {
        withRoom((room, p, gs) => {
            const pending = gs.pendingDiscardAnother;
            if (!pending) { broadcastRoom(room); return; }
            const attackerIdx = pending.playerIdx;
            const player = gs.players[attackerIdx];
            const mainCard = player?.hand.find(c => c.id === pending.mainCardId);
            const extraCard = player?.hand[d.extraCardIdx];
            const extraId = (extraCard && extraCard.id !== mainCard?.id) ? extraCard.id : null;
            // Do odhozu jde nejdřív odhozená („další") karta, pak hlavní karta.
            if (extraId) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: attackerIdx, cardId: extraId });
            if (mainCard) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: attackerIdx, cardId: mainCard.id });

            // Ragtime: navíc animace ukradené karty (cíl → ruka útočníka). Veřejné ID karty
            // z výzbroje/stolu čteme PŘED resolvem; z ruky je skryté (jen útočník ho uvidí).
            if (pending.effect === 'steal_any' && pending.target) {
                const { targetIdx, area, boardIdx } = pending.target;
                const victim = gs.players[targetIdx];
                let publicStolenId = null, visBoardIdx = null;
                if (area === 'weapon') { publicStolenId = victim?.weapon?.id ?? null; visBoardIdx = 0; }
                else if (area === 'board') {
                    visBoardIdx = 1 + (boardIdx ?? 0);
                    publicStolenId = victim?.board?.[boardIdx]?.id ?? null;
                }
                // Pořadí ruky oběti PŘED resolvem → slot náhodně vzaté karty (stolenIndex).
                const victimHandIds = (area === 'hand' && victim) ? victim.hand.map(c => c.id) : null;
                gs.discardAnotherCard(attackerIdx, d.extraCardIdx);
                // Ukradená karta je teď poslední v ruce útočníka (z ruky ji zná jen on).
                const atkHand = gs.players[attackerIdx].hand;
                const ownerStolenId = atkHand[atkHand.length - 1]?.id;
                const vsi = victimHandIds ? victimHandIds.indexOf(ownerStolenId) : -1;
                const anim = { type: 'ragtime_steal', attackerIdx, targetIdx, area, boardIdx: visBoardIdx,
                               stolenIndex: vsi === -1 ? null : vsi };
                emitAnimPrivate(room, attackerIdx,
                    { ...anim, stolenCardId: area === 'hand' ? ownerStolenId : publicStolenId },
                    { ...anim, stolenCardId: area === 'hand' ? null : publicStolenId });
                broadcastRoomDelayed(room, 500);
                return;
            }

            gs.discardAnotherCard(attackerIdx, d.extraCardIdx);
            handleReshuffleAndBroadcast(room, gs);
        });
    });

    // Zrušení „odhoď další kartu" – hráč si to rozmyslel (klik na hlavní kartu / Zrušit).
    on('cancel_discard_another', () => {
        withRoom((room, p, gs) => {
            const idx = gs.pendingDiscardAnother?.playerIdx;
            if (idx == null) { broadcastRoom(room); return; }
            gs.cancelDiscardAnother(idx);
            broadcastRoom(room);
        });
    });

    on('end_turn', () => {
        withRoom((room, p, gs) => {
            gs.tryEndTurn();
            broadcastRoom(room);
        });
    });

    on('discard_card', (i) => {
        withRoom((room, p, gs) => {
            const discardingIdx = gs.currentPlayerIndex;
            const player = gs.players[discardingIdx];
            const card = player?.hand[i];
            emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: discardingIdx, cardId: card?.id });
            gs.discardCard(i);
            if (gs.phase !== 'DISCARD') {
                broadcastRoomDelayed(room, 420);
            } else {
                broadcastRoom(room);
            }
        });
    });

    const handleKitCarlson = (index) => {
        withRoom((room, p, gs) => { gs.kitCarlsonPick(index); broadcastRoom(room); });
    };
    on('kit_carlson_pick', handleKitCarlson);
    on('kit_carlson_select', (data) => handleKitCarlson(data?.index ?? data));

    const handleLuckyDuke = (index) => {
        withRoom((room, p, gs) => {
            // Obě odkryté karty odletí do odhozu VYBRANOU napřed (logika ji tam vloží
            // první). Posíláme to jako vlastní animaci, aby si ji fronta na klientu
            // zařadila PŘED výsledek checku (vězení/dynamit) – jinak by výsledná karta
            // dosedla na hromádku dřív než ty dvě, přes které se pak přehrály.
            const ld = gs.luckyDukeState;
            const chosenId = ld?.cards?.[index]?.id ?? null;
            const otherId = ld?.cards?.[1 - index]?.id ?? null;
            gs.luckyDukePick(index);
            if (chosenId !== null) {
                emitAnim(room, { type: 'lucky_duke_result', chosenId, otherId });
                // Vybraná karta se ještě „sejme" uprostřed obrazovky – stejná cinematika
                // (a stejně dlouhá) jako u běžného checku. Boti po tu dobu nehrají, jinak
                // by hráli přes ni: klient do jejího konce drží stav ve frontě.
                room._revealBlockUntil = Math.max(room._revealBlockUntil || 0,
                    Date.now() + (typeof ctx.checkRevealMs === 'number' ? ctx.checkRevealMs : 3850));
            }
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
    };
    on('lucky_duke_pick', handleLuckyDuke);
    on('lucky_duke_choose', (data) => handleLuckyDuke(data?.cardIndex ?? data));

    const handleBarrelDraw = () => {
        withRoom((room, p, gs) => {
            gs.triggerBarrelDraw();
            handleReshuffleAndBroadcast(room, gs, 0);
        });
    };
    on('trigger_barrel_draw', handleBarrelDraw);
    on('draw_from_barrel', handleBarrelDraw);

    on('sid_ketchum_discard_both', (d) => {
        withRoom((room, p, gs) => {
            const player = gs.players[d.playerIdx];
            if (!player || player.health <= 0) return;

            // Záchrana při posledním životě (RESPOND, DYNAMITE_DAMAGE nebo Pravé poledne)
            if (player.health === 1 &&
                (gs.phase === "RESPOND" || gs.phase === "DYNAMITE_DAMAGE" || gs.phase === "NOON_DAMAGE")) {
                const indices = [d.cardIdx1, d.cardIdx2].sort((a, b) => b - a);
                indices.forEach(idx => {
                    const card = player.hand[idx];
                    if (card) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.playerIdx, cardId: card.id });
                });
                const ok = gs.sidLastLifeSave(d.playerIdx, d.cardIdx1, d.cardIdx2);
                if (ok) {
                    handleAutoEndTurn(room, gs);
                    handleReshuffleAndBroadcast(room, gs, 420);
                }
                return;
            }

            // Standardní Sid léčení (+1 HP)
            const indices = [d.cardIdx1, d.cardIdx2].sort((a, b) => b - a);
            indices.forEach(idx => {
                const card = player.hand[idx];
                if (card) {
                    emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.playerIdx, cardId: card.id });
                    gs.deck.discardPile.push(player.hand.splice(idx, 1)[0]);
                }
            });
            if (player.health < player.maxHealth) {
                player.health++;
                player.stats.sidSaves = (player.stats.sidSaves || 0) + 1;
            }
            gs.sidKetchumPending = null;
            handleReshuffleAndBroadcast(room, gs, 420);
        });
    });

    on('take_dynamite_hit', () => {
        withRoom((room, p, gs) => {
            // Používáme playerIdx ze stavu – bezpečné v debug i normálním módu
            const dynPlayerIdx = gs.pendingDynamiteDamage?.playerIdx;
            if (dynPlayerIdx === undefined || dynPlayerIdx === null) return;
            gs.takeDynamiteHit(dynPlayerIdx);
            if (gs.lastAnimEvent) {
                emitAnim(room, gs.lastAnimEvent);
                gs.lastAnimEvent = null;
            }
            if (gs._deathAnimPlayerIdx !== undefined && gs._deathAnimPlayerIdx !== null) {
                emitDeathAnim(room, gs, gs._deathAnimPlayerIdx);
                gs._deathAnimPlayerIdx = null;
            }
            handleAutoEndTurn(room, gs);
            broadcastRoom(room);
        });
    });

    // High Noon – Pravé poledne: hráč klikl na životy (ztráta 1 života na začátku tahu).
    on('take_noon_hit', () => {
        withRoom((room, p, gs) => {
            const idx = gs.pendingNoonDamage?.playerIdx;
            if (idx === undefined || idx === null) return;
            gs.takeNoonHit(idx);
            if (gs._deathAnimPlayerIdx !== undefined && gs._deathAnimPlayerIdx !== null) {
                emitDeathAnim(room, gs, gs._deathAnimPlayerIdx);
                gs._deathAnimPlayerIdx = null;
            }
            handleAutoEndTurn(room, gs);
            broadcastRoom(room);
        });
    });

    // High Noon (přibalené) – Želízka: hráč po lízání zvolil barvu pro tenhle tah.
    on('handcuffs_suit', (d) => {
        withRoom((room, p, gs) => {
            const idx = gs.pendingHandcuffs?.playerIdx;
            if (idx === undefined || idx === null) return;
            gs.chooseHandcuffsSuit(idx, d && d.suit);
            broadcastRoom(room);
        });
    });

    // High Noon (přibalené) – Nová identita: hráč se na začátku tahu rozhodl, jestli si
    // vezme druhou (odloženou) postavu. Výsledek jde všem jako animace (výměna karet
    // postavy, u odmítnutí návrat rubem dolů) a boti o tu dobu nehrají.
    on('new_identity_choose', (d) => {
        withRoom((room, p, gs) => {
            const idx = gs.pendingNewIdentity?.playerIdx;
            if (idx === undefined || idx === null) return;
            const take = !!(d && d.take);
            const from = gs.players[idx]?.character;
            const to = gs.pendingNewIdentity?.character;
            if (!gs.resolveNewIdentity(idx, take)) return;
            emitAnim(room, { type: 'new_identity_result', playerIdx: idx, take, from, to });
            // Stav jde ven hned – zdržení si vezme fronta animací na klientu
            // (core/animQueue.js); server o stejnou dobu drží jen boty.
            room._niBlockUntil = Math.max(room._niBlockUntil || 0, Date.now() + niResultMs(take));
            broadcastRoom(room);
        });
    });

    // Pivo zruší ztrátu života od Pravého poledne (obdoba beer_dynamite_save).
    on('beer_noon_save', (d) => {
        withRoom((room, p, gs) => {
            const player = gs.players[d.playerIdx];
            const card = player?.hand[d.cardIdx];
            if (card) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.playerIdx, cardId: card.id });
            const ok = gs.beerLastLifeSave(d.playerIdx, d.cardIdx);
            if (ok) {
                broadcastRoomDelayed(room, 380);
            } else {
                broadcastRoom(room); // fallback
            }
        });
    });

    on('respond_with_beer', (d) => {
        withRoom((room, p, gs) => {
            const player = gs.players[d.playerIdx];
            const card = player?.hand[d.cardIdx];
            if (card) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.playerIdx, cardId: card.id });
            const ok = gs.beerLastLifeSave(d.playerIdx, d.cardIdx);
            if (ok) {
                handleAutoEndTurn(room, gs);
                broadcastRoomDelayed(room, 380);
            } else {
                broadcastRoom(room); // fallback – zajistí obnovení stavu i při selhání
            }
        });
    });

    on('beer_dynamite_save', (d) => {
        withRoom((room, p, gs) => {
            const player = gs.players[d.playerIdx];
            const card = player?.hand[d.cardIdx];
            if (card) emitAnim(room, { type: 'hand_to_discard', fromPlayerIdx: d.playerIdx, cardId: card.id });
            const ok = gs.beerLastLifeSave(d.playerIdx, d.cardIdx);
            if (ok) {
                broadcastRoomDelayed(room, 380);
            } else {
                broadcastRoom(room); // fallback
            }
        });
    });

    on('sid_ketchum_cancel', (d) => {
        withRoom((room, p, gs) => {
            if (!gs.sidKetchumPending || gs.sidKetchumPending.playerIdx !== d.playerIdx) return;
            const lastDiscard = gs.deck.discardPile[gs.deck.discardPile.length - 1];
            if (lastDiscard) {
                gs.deck.discardPile.pop();
                gs.players[d.playerIdx].hand.push(lastDiscard);
                emitAnim(room, { type: 'discard_to_hand', toPlayerIdx: d.playerIdx, cardId: lastDiscard.id });
            }
            gs.sidKetchumPending = null;
            broadcastRoomDelayed(room, 420);
        });
    });

    on('sid_save_discard', (d) => {
        withRoom((room, p, gs) => { gs.sidSaveDiscard(d.playerIdx, d.cardIdx); broadcastRoom(room); });
    });

    on('store_pick', (d) => {
        withRoom((room, p, gs) => {
            // Identita + pozice PŘED odebráním (karta letí ze slotu do ruky hráče).
            const pickerIdx = gs.storePickerIndex;
            const card = gs.storeCards?.[d.cardIdx];
            const cardId = card?.id;
            gs.pickFromStore(d.cardIdx);
            if (cardId !== undefined && cardId !== null) {
                emitAnim(room, { type: 'store_pick', pickerIdx, cardIdx: d.cardIdx, cardId });
            }
            // Poslední karta = konec hokynářství. Když ještě běží míchání ve zvednuté
            // poloze (proaktivní režim – hráči si brali rychleji, než stihlo doběhnout),
            // hra na jeho dokončení počká: klient si zamkne UI (endStoreCinematic),
            // boti čekají přes _reshuffleBlockUntil (stejně jako u klasického domíchání).
            if (gs.phase !== 'STORE' && room._storeShuffleUntil) {
                room._reshuffleBlockUntil = Math.max(room._reshuffleBlockUntil || 0, room._storeShuffleUntil);
                room._storeShuffleUntil = 0;
            }
            // Zpoždění, ať se karta v ruce / zmizení ze slotu neobjeví dřív, než dolétne.
            broadcastRoomDelayed(room, 400);
        });
    });
};
