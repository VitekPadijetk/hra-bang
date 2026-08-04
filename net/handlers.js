// net/handlers.js — příchozí socket.io eventy ze serveru (intro sekvence,
// room_update se stavem hry, lobby/menu zprávy). Vytaženo z game.js byte-přesně.
// Registruje se přes socket.on(...) při načtení; callbacky běží až v čase eventu,
// kdy jsou načtené všechny moduly. Mutuje sdílený klientský stav (state, myIndex,
// roomState, selectedState – deklarované v game.js) a volá renderUI / intro / menu
// funkce cross-file. Načítá se PO game.js (kvůli `socket`) i view/*.

// ── PREZENTAČNÍ FRONTA ────────────────────────────────────────────────────────
// `card_animation` a `room_update` se NEpřehrávají hned při doručení, ale projdou
// frontou (core/animQueue.js): animace jedou jedna po druhé a stav se aplikuje až
// doběhne to, co mu předcházelo. Bez ní se na pomalé lince oba eventy slijí do
// jednoho okamžiku a karta „už je v odhozu", zatímco ještě letí. Podrobně viz
// hlavička core/animQueue.js.
const _animQ = createAnimQueue({
    onDrop: (n) => clog('warn', `animační fronta zaostala – přeskočeno ${n} animací`),
});

// ── INTRO SOCKET HANDLERY ─────────────────────────────────────────────────────

socket.on('intro_phase', (data) => {
    if (!gameScene) return;
    const sub = data.sub;
    App.myIntroIndex = data.myIndex;

    if (sub === 'init') {
        App.introRoleOkSent = false;
        App.introExpected = false;
        App.discardBorderShown = false;   // ohraničení odhozu se příště plynule objeví
        _introState = {
            sub: 'init',
            playerCount: data.playerCount,
            // Navazující hra posílá skutečné počty (balíček postav je bez postav
            // přeživších); klasická hra je neposílá → výchozí hodnoty jako dosud.
            roleCount: data.roleCount ?? data.playerCount,
            charCount: data.charCount ?? data.playerCount * 2,
            deckCount: data.deckCount ?? 80,
            nextGame: !!data.nextGame,
            survivors: data.survivors || [],
            placedForIdx: [],        // seaty, které už mají postavu na stole (přeživší)
            myNamePlaced: false,     // moje jmenovka už je v placedCards
            keepShown: false,        // „nechám si postavu?" už se spustilo
            myKeepReady: false,      // moje postava doletěla doprostřed → ukaž tlačítka
            myKeepDecided: null,     // 'keep' | 'reject'
            rolesStarted: false,     // začalo míchání rolí (konec fáze rozhodování)
            charPhaseStarted: false, // začala fáze postav (gate pro fallback z room_update)
            myRole: null,
            myCharChoices: null,
            myCharSelected: null,
            myCharPreselect: null,   // postava jen předvybraná (čeká na Potvrdit)
            allCharsChosen: false,
            placedCards: [],     // karty uz umistene na stole (role, lives, char)
            myCharShowUI: false, // zobrazit vyber postav az po animaci letu
            charFlipStarted: false,   // překlápěcí reveal postav už spuštěn
            charChoicesRevealed: false, // postavy se dotočily lícem → klikatelné
            charAnimDone: false, // post-vyberu animace dokoncena
            showRoleReveal: false, // zobrazit velkou kartu role (hned po doletu moji karty)
            roleFlipStarted: false,   // překlápěcí reveal role už spuštěn
            roleRevealReady: false,   // role se dotočila lícem → ukaž statickou kartu + OK
            myHandCards: null,   // ID mojich karet pro zobrazeni licem pri rozdavani
            shuffleAnimDone: false, // michaci animace dobehla -> ukaz staticky balicek
            deckMoving: false,   // zaverecny presun balicku na herni pozici (skryj staticky)
            coltShown: false,    // Colt .45 fade-in u me uz probehl
        };
        // Navazující hra: přeživší mají svou postavu na stole hned (s tolika životy,
        // kolik jim zbylo z minulé hry) – ještě bez šerifovy hvězdy, role se teprve rozdají.
        if (_introState.nextGame) _introPlaceSurvivors();
        renderUI();
        return;
    }

    if (!_introState) return;
    // Pokud jsem už roli potvrdil (klikl OK dřív, než dorazil await_role_ok),
    // neshazuj stav zpět na await_role_ok – nech 'waiting_for_others_role'.
    if (sub === 'await_role_ok' && App.introRoleOkSent) return;
    _introState.sub = sub;

    // ── Navazující hra: rozhodnutí přeživších o postavě ──────────────────────
    if (sub === 'nextgame_keep') {
        _startKeepReveal();
        return;
    }

    if (sub === 'keep_result') {
        const myIdx = (typeof myIndex === 'number') ? myIndex : App.myIntroIndex;
        // Vlastní rozhodnutí je odanimované už z kliknutí (žádná prodleva na server).
        if (data.playerIdx !== myIdx) _introKeepAnimateOther(data.playerIdx, data.keep);
        return;
    }

    if (sub === 'sheriff_reveal') {
        _introSheriffReveal(data.playerIdx);
        return;
    }

    if (sub === 'shuffle_roles') {
        _introState.roleCount = data.roleCount;
        _introState.rolesStarted = true;
        _introState.shuffleAnimDone = false;
        _clearIntroSprites();
        if (gameScene) {
            _animateIntroShuffle(
                INTRO_ROLE_DECK.x, INTRO_ROLE_DECK.y,
                'role_card_back', 0.30,
                data.roleCount, false, // tiltDeck=false pro role
                null,
                () => { if (_introState) { _introState.shuffleAnimDone = true; renderUI(); } }
            );
        }
        renderUI();
    }

    else if (sub === 'deal_roles') {
        _introState.dealRoleOrder = data.order;
        renderUI();
    }

    else if (sub === 'role_card_fly') {
        const toIdx = data.toPlayerIdx;
        const myIdx = data.myIndex ?? myIndex;
        const isMine = toIdx === myIdx;
        // Moje karta role se nerozdává malá na sedačku – přiletí rovnou jako reveal
        // (letí z balíčku, překlopí se a zvětší doprostřed), spouští se v intro_role.
        if (!isMine) {
            const toPos = _getIntroPlayerPos(toIdx, myIdx, _introState.playerCount);
            _introAnimCard(INTRO_ROLE_DECK.x, INTRO_ROLE_DECK.y, toPos.x, toPos.y, 'role_card_back', 380);
        }
        _introState.roleCount = Math.max(0, _introState.roleCount - 1);
        renderUI();
    }

    else if (sub === 'await_role_ok') {
        _introState.sub = 'await_role_ok';
        // Pojistka: kdyby reveal nespustil dolet karty (např. pozdní intro_role),
        // spusť překlápěcí reveal teď (guard uvnitř zabrání dvojímu spuštění).
        _startRoleRevealFlip();
        renderUI();
    }

    else if (sub === 'shuffle_chars') {
        _introState.charCount = data.charCount;
        _introState.roleCount = 0;
        _introState.charPhaseStarted = true;
        _introState.shuffleAnimDone = false;
        _clearIntroSprites();
        if (gameScene) {
            _animateIntroShuffle(
                INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y,
                'lives', 0.30,
                data.charCount, true, // tiltDeck=true pro postavy
                null,
                () => { if (_introState) { _introState.shuffleAnimDone = true; renderUI(); } }
            );
        }
        renderUI();
    }

    else if (sub === 'deal_chars') {
        _introState.dealCharOrder = data.order;
        renderUI();
    }

    else if (sub === 'char_cards_fly') {
        const toIdx = data.toPlayerIdx;
        const myIdx = data.myIndex ?? myIndex;
        const isMine = toIdx === myIdx;
        // Moje karty postav se nerozdávají malé na sedačku – přiletí rovnou jako výběr
        // (letí z balíčku, překlopí se a zvětší na výběrové pozice), spouští se v intro_chars.
        if (!isMine) {
            const toPos = _getIntroPlayerPos(toIdx, myIdx, _introState.playerCount);
            _introAnimCard(INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y, toPos.x, toPos.y, 'lives', 380);
            setTimeout(() => {
                _introAnimCard(INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y, toPos.x, toPos.y, 'lives', 380);
            }, 200);
        }
        _introState.charCount = Math.max(0, _introState.charCount - 2);
        renderUI();
    }

    else if (sub === 'chars_slide_in') {
        _introState.sub = 'chars_slide_in';
        _introState.allCharsChosen = true;
        _introState.myCharChoices = null;
        _introState.myCharSelected = null;
        _introState.myCharPreselect = null;
        renderUI();
        // Slide-in bloku lives+char pro ostatni hrace
        if (gameScene && state && state.players) {
            state.players.forEach((p, idx) => {
                if (idx === myIndex || !p.character) return;
                // Navazující hra: přeživší, který si postavu nechal, ji na stole už má
                // (položila ji intro init / animace rozhodnutí) → nesmí přiletět znovu.
                if (_introState.placedForIdx && _introState.placedForIdx.includes(idx)) return;
                const health   = p.health || 4;
                const charData = gameScene.cache.json.get('characters_data');
                const charInfo = charData && charData.find(c => c.name === p.character);
                const charTex  = charInfo && gameScene.textures.exists('char_' + charInfo.id)
                    ? 'char_' + charInfo.id : 'placeholder';

                // Pozice bloku (životy/postava/jmenovka/hvězda) + vektor „ze zákulisí".
                const slot = _introOppSlots(idx, health);
                const { angle, scale: oppScale,
                        livesX: livesEndX, livesY: livesEndY,
                        charX: charEndX, charY: charEndY,
                        nameX: NAME_X, nameY: NAME_Y, nameStyle: OPP_NAME_STYLE,
                        dx, dy } = slot;

                const delay = idx * 80;
                const dur   = 520;

                // Lives karta
                const livesSp = gameScene.add.image(livesEndX + dx, livesEndY + dy, 'lives')
                    .setScale(oppScale).setAngle(angle).setDepth(62);
                if (gameScene.introSprites) gameScene.introSprites.add(livesSp);
                gameScene.tweens.add({
                    targets: livesSp, x: livesEndX, y: livesEndY,
                    delay, duration: dur, ease: 'Power2.easeOut',
                    onComplete: () => {
                        if (livesSp?.active) livesSp.destroy();
                        // Ulož jako trvalou kartu, ať po doletu nezmizí
                        if (_introState) _introState.placedCards.push(
                            { tex: 'lives', x: livesEndX, y: livesEndY, scale: oppScale, angle, depth: 21, key: 'lives:' + idx }
                        );
                        renderUI();
                    }
                });

                // Char karta
                const charSp = gameScene.add.image(charEndX + dx, charEndY + dy, charTex)
                    .setScale(oppScale).setAngle(angle).setDepth(63);
                if (gameScene.introSprites) gameScene.introSprites.add(charSp);
                gameScene.tweens.add({
                    targets: charSp, x: charEndX, y: charEndY,
                    delay, duration: dur, ease: 'Power2.easeOut',
                    onComplete: () => {
                        if (charSp?.active) charSp.destroy();
                        // Ulož jako trvalou kartu + jmenovku, ať po doletu nezmizí.
                        if (_introState) {
                            _introState.placedCards.push(
                                { tex: charTex, x: charEndX, y: charEndY, scale: oppScale, angle, depth: 23, key: 'char:' + idx }
                            );
                            _introState.placedCards.push(
                                { text: p.name, x: NAME_X, y: NAME_Y, style: OPP_NAME_STYLE, depth: 50, key: 'name:' + idx }
                            );
                        }
                        renderUI();
                    }
                });

                // Šerifova hvězda přiletí SPOLU s postavou (stejný vektor ze zákulisí) a
                // usadí se nad kartou postavy – přesně jako v herním renderu (drawOpponents).
                // Bez toho odznak naskočil až po startu hry. Offsety dle strany zrcadlí board.js.
                if (p.role === 'Sheriff') {
                    const starScale = slot.starScale;
                    const starEndX = slot.starX, starEndY = slot.starY;
                    const starSp = gameScene.add.image(starEndX + dx, starEndY + dy, 'sheriff_star')
                        .setScale(starScale).setAngle(angle).setDepth(64);
                    if (gameScene.introSprites) gameScene.introSprites.add(starSp);
                    gameScene.tweens.add({
                        targets: starSp, x: starEndX, y: starEndY,
                        delay, duration: dur, ease: 'Power2.easeOut',
                        onComplete: () => {
                            if (starSp?.active) starSp.destroy();
                            if (_introState) _introState.placedCards.push(
                                { tex: 'sheriff_star', x: starEndX, y: starEndY, scale: starScale, angle, depth: 24, key: 'star:' + idx }
                            );
                            renderUI();
                        }
                    });
                }
            });

            // Vlastní jmenovka – PŘESNĚ jako drawMyArea: (roleX=850, myBaseY+145=1115),
            // styl 20px / bg 0.6 / padding {7,4}, origin(0.5, 0).
            // (V navazující hře ji přeživší dostal už při rozložení desky – myNamePlaced.)
            if (_introState && myIndex !== null && state.players[myIndex]?.character
                && !_introState.myNamePlaced) {
                _introState.myNamePlaced = true;
                _introState.placedCards.push({
                    text: state.players[myIndex].name, x: 850, y: 1115, depth: 50,
                    key: 'name:' + myIndex,
                    style: { fontSize: '20px', color: '#cccccc',
                        backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 7, y: 4 } },
                });
                renderUI();
            }
        }
    }

    else if (sub === 'shuffle_deck') {
        _introState.deckCount = data.deckCount;
        _introState.charCount = 0;
        _introState.shuffleAnimDone = false;
        _clearIntroSprites();
        if (gameScene) {
            _animateIntroShuffle(
                INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y,
                'card_back', 0.30,
                data.deckCount, true, // tiltDeck=true pro balíček
                null,
                () => { if (_introState) { _introState.shuffleAnimDone = true; renderUI(); } }
            );
        }
        renderUI();
    }

    else if (sub === 'deal_cards') {
        _introState.dealCardOrder = data.order;
        renderUI();
    }

    else if (sub === 'deal_cards_to') {
        const toIdx = data.toPlayerIdx;
        const myIdx = data.myIndex ?? myIndex;
        const isLast = data.isLast === true;

        // Když dostávám karty já, nech vizuálně fade-in objevit Colt .45 (výchozí
        // zbraň) na své herní pozici – aby tam plynule navázal reálný render.
        if (toIdx === myIdx && _introState && !_introState.coltShown
            && gameScene && gameScene.textures.exists('colt_.45')) {
            _introState.coltShown = true;
            const coltX = 723, coltY = 970, coltScale = 0.36; // shodné s herním renderem (roleX - boardCardW)
            const colt = gameScene.add.image(coltX, coltY, 'colt_.45')
                .setScale(coltScale).setAlpha(0).setDepth(24);
            if (gameScene.introSprites) gameScene.introSprites.add(colt);
            gameScene.tweens.add({
                targets: colt, alpha: 1, duration: 500, ease: 'Power2',
                onComplete: () => {
                    if (colt?.active) colt.destroy();
                    if (_introState) _introState.placedCards.push(
                        { tex: 'colt_.45', x: coltX, y: coltY, scale: coltScale, depth: 24 }
                    );
                    renderUI();
                }
            });
        }

        for (let i = 0; i < data.count; i++) {
            setTimeout(() => {
                if (!_introState) return;
                // Karta letí přesně tam, kde bude v reálné hře, a tam zůstane.
                const rest = _introDealRestPos(toIdx, myIdx, _introState.playerCount, i, data.count);
                // Moje karty letí rubem a na dolet se PŘEKLOPÍ na líc (vidím co mám,
                // ve správném pořadí); ostatním zůstávají rubem (tajná ruka).
                const place = (tex) => () => {
                    if (_introState) _introState.placedCards.push(
                        { tex, x: rest.x, y: rest.y, scale: rest.scale, angle: rest.angle, depth: 24 }
                    );
                    renderUI();
                };
                if (toIdx === myIdx) {
                    const cid = _introState.myHandCards?.[i];
                    const faceTex = (cid !== undefined && gameScene.textures.exists('card_' + cid))
                        ? 'card_' + cid : 'card_back';
                    _introAnimCardFlip(INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y, rest.x, rest.y,
                        'card_back', faceTex, 320, place(faceTex), rest.angle, rest.scale);
                } else {
                    _introAnimCard(INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y, rest.x, rest.y,
                        'card_back', 320, place('card_back'), rest.angle, rest.scale);
                }
                _introState.deckCount = Math.max(0, (_introState?.deckCount ?? 0) - 1);
                renderUI();
                if (isLast && i === data.count - 1) {
                    setTimeout(() => {
                        if (!gameScene || !_introState) return;
                        // Přesuň CELÝ balíček (stejná velikost 0.30) na herní pozici.
                        // Statický intro balíček schováme (deckMoving) a nahradíme
                        // pohyblivým stackem, který na herní pozici PARKUJE až do 'done'
                        // (nedestruujeme ho → žádné prázdné místo). INTRO_PLAY_DECK i
                        // herní balíček mají y=540, takže jde jen o vodorovný posun.
                        _introState.deckMoving = true;
                        const layers = Math.max(1, Math.min(_introState.deckCount || 0, 80));
                        const pxPerCard = 0.25;   // tenčí hromádka jako herní/intro balíček
                        const topY = INTRO_PLAY_DECK.y - (layers - 1) * pxPerCard / 2;
                        const movers = [];
                        for (let k = layers - 1; k >= 0; k--) {
                            // Nejvyšší karta (k=0) navrchu – shodně se statickým balíčkem.
                            const img = gameScene.add.image(
                                INTRO_PLAY_DECK.x, topY + k * pxPerCard, 'card_back')
                                .setScale(0.30).setDepth(100 + (layers - 1 - k));
                            if (gameScene.introSprites) gameScene.introSprites.add(img);
                            movers.push(img);
                        }
                        renderUI(); // skryje statický intro balíček
                        gameScene.tweens.add({
                            targets: movers, x: DECK_X,
                            duration: 600, ease: 'Power2.easeInOut'
                        });
                    }, 350);
                }
            }, i * 200);
        }
    }

    else if (sub === 'done') {
        _clearIntroSprites();
        _introState = null;
    }
});

socket.on('intro_role', (data) => {
    if (!_introState) return;
    _introState.myRole = data.role;
    // Karta role letí z balíčku, překlopí se a zvětší doprostřed (reveal).
    _startRoleRevealFlip();
    renderUI();
});

// Soukromá ID mojich karet – přijde s rozdáváním, ať je vidím lícem ve správném pořadí
socket.on('intro_my_cards', (data) => {
    if (!_introState) return;
    _introState.myHandCards = data.cards || [];
});

socket.on('intro_chars', (data) => {
    if (!_introState) return;
    // Ulozit karty hned, ale UI zobrazit az kdyz dolet i druha karta.
    // Rozdavaji se 2 karty: prvni let 380ms, druha s odstupem 200ms (+380ms let)
    // => konec animace v case 580ms. 620ms dava maly buffer.
    _introState.myCharChoices = data.charChoices;
    // Karty postav letí z balíčku, překlopí se a zvětší na výběrové pozice (reveal);
    // klikací jsou až po doletu (charChoicesRevealed). Během letu běží normální scéna.
    _startCharChoicesFlip();
    renderUI();
});



// ── ODHOZ KARET PŘI SMRTI (Návrh 2) ───────────────────────────────────────────
// Pozice odletu zachytíme HNED (stav je v tu chvíli ještě „živý" – card_animation
// dorazí před room_update), animace pak odpalujeme postupně. Pořadí: modré od
// nejnovější po nejstarší, zbraň jako poslední modrá (jen colt → fade-out), pak
// karty z ruky od nejvyššího indexu. Délka roste s počtem karet.
const _DEATH_STAGGER = 95;

// Úhel a velikost, pod kterými jsou karty daného hráče vykreslené (viz drawOpponents):
// já/spodní 0°/0.36, vlevo 90°, nahoře 180°, vpravo −90°; soupeři 0.27. Aby odhoz při
// smrti letěl a dosedal stejně jako běžný odhoz (z orientace hráče do 0°, na velikost 0.3).
function _renderSideAngle(playerIdx) {
    const view = myIndex === null ? 0 : myIndex;
    if (playerIdx === view) return 0;
    const total = state.players.length;
    const diff = (playerIdx - view + total) % total;
    const side = getOpponentAnchors(total)[diff - 1]?.side;
    return side === 'left' ? 90 : side === 'right' ? -90 : side === 'top' ? 180 : 0;
}
function _renderSideScale(playerIdx) {
    return (playerIdx === (myIndex === null ? 0 : myIndex)) ? 0.36 : 0.27;
}

function _deathCardSeq(pid, blue, weapon, hand) {
    const hasW = !!weapon;
    const seq = [];
    // Slot 0 na MÉM stole drží zbraň, a když žádnou nemám, výchozí Colt .45 (drawMyArea);
    // soupeři Colt nekreslí, takže bez zbraně jim modré začínají hned na slotu 0.
    const _selfView = pid === (myIndex === null ? 0 : myIndex);
    const _blueBase = (_selfView || hasW) ? 1 : 0;
    for (let k = blue.length - 1; k >= 0; k--) {
        seq.push({ kind: 'blue', id: blue[k].id, from: getBoardCardPos(pid, _blueBase + k) });
    }
    if (hasW) seq.push({ kind: 'weapon', id: weapon.id, from: getBoardCardPos(pid, 0) });
    else      seq.push({ kind: 'colt',   id: null,      from: getBoardCardPos(pid, 0) });
    for (let h = hand.length - 1; h >= 0; h--) {
        seq.push({ kind: 'hand', id: hand[h].id, from: getHandSlotPos(pid, h, hand.length) });
    }
    return seq;
}

function _fadeOutColt(pos) {
    if (!gameScene) return;
    const spr = gameScene.add.image(pos.x, pos.y, 'colt_.45').setScale(0.4).setDepth(800).setAlpha(0.97);
    gameScene.tweens.add({ targets: spr, alpha: 0, duration: 400, ease: 'Quad.easeIn',
        onComplete: () => { if (spr.active) spr.destroy(); } });
}

// Smrt → odhoz: já vidím vše lícem, modré vidí lícem všichni (bez otáčení), karty
// z ruky se ostatním za letu odhalí (rub→líc).
function playDeathDiscard(data) {
    const pid = data.playerIdx;
    const isMine = pid === myIndex;
    const discard = discardTopPos();   // vrch odhozu (ne základna) – ať karty dosednou na hromádku
    const ang = _renderSideAngle(pid);  // orientace, ve které jsou karty umírajícího vykreslené
    const sc  = _renderSideScale(pid);  // a jejich velikost (odkud se karty odlepují)
    const seq = _deathCardSeq(pid, data.blue || [], data.weapon || null, data.hand || []);
    seq.forEach(it => { if (it.id != null) App.deathDiscardHideIds.add(it.id); });
    seq.forEach((it, k) => {
        setTimeout(() => {
            if (!gameScene) return;
            if (it.kind === 'colt') { if (isMine) _fadeOutColt(it.from); return; }
            // Kartu na vrcholu odhozu odkryj AŽ když už opravdu je ve stavu odhozu, a letící
            // sprite do té chvíle drž na místě (holdUntil) – jinak po jeho zániku problikne
            // předchozí vrchní karta, než dorazí room_update (dřív se odkrývalo dávkově pozdě).
            const reveal = () => { if (it.id != null) { App.deathDiscardHideIds.delete(it.id); if (gameScene) renderUI(); } };
            const hold = () => (state?.deck?.discardPile || []).some(c => c.id === it.id);
            if (isMine || it.kind !== 'hand') {
                // Znám líc (moje karty / veřejné modré+zbraň) → jen letí do odhozu,
                // z orientace hráče do 0° a z velikosti na stole (0.36/0.27) na 0.3.
                animateCard(it.from.x, it.from.y, discard.x, discard.y, getCardTex(it.id), 380, reveal,
                    { startAngle: ang, endAngle: 0, startScale: sc, endScale: 0.3, holdUntil: hold });
            } else {
                // Cizí karta z ruky se za letu odhalí (rub→líc) – stejně jako běžný odhoz z ruky.
                animateCardFlip(it.from.x, it.from.y, discard.x, discard.y, 'card_back', getCardTex(it.id),
                    { flip: true, startAngle: ang, endAngle: 0, startScale: sc, endScale: 0.3, duration: 400, onComplete: reveal, holdUntil: hold });
            }
        }, k * _DEATH_STAGGER);
    });
    // Pojistka: cokoli zbylo skrytého (colt bez animace, neúspěšný holdUntil) po dojezdu odkryj.
    const totalMs = seq.length * _DEATH_STAGGER + 450;
    setTimeout(() => {
        seq.forEach(it => { if (it.id != null) App.deathDiscardHideIds.delete(it.id); });
        if (gameScene) renderUI();
    }, totalMs);
}

// Smrt s Vulture Samem → karty letí do JEHO ruky (ne do odhozu). Otáčení rub/líc
// podle toho, kdo kartu uvidí v jeho ruce lícem (jen Sam) vs rubem (ostatní):
//  modré – Sam lícem (bez otáčení), já i ostatní líc→rub; karty z ruky – Sam rub→líc,
//  já líc→rub, ostatní zůstávají rubem. Sam má nové karty v ruce zhratované (pendingDrawIds),
//  dokud nedoletí.
function playVultureSteal(data) {
    const pid = data.fromPlayerIdx;
    const vid = data.toPlayerIdx;
    const isMine = pid === myIndex;     // umírám
    const isVulture = vid === myIndex;  // beru si karty
    const to = getPlayerHandPos(vid);
    const seq = _deathCardSeq(pid, data.blue || [], data.weapon || null, data.hand || []);
    if (isVulture) seq.forEach(it => { if (it.id != null) App.pendingDrawIds.add(it.id); });
    seq.forEach((it, k) => {
        setTimeout(() => {
            if (!gameScene) return;
            if (it.kind === 'colt') { if (isMine) _fadeOutColt(it.from); return; }
            const fc = getCardTex(it.id);
            const done = () => { if (isVulture && it.id != null) { App.pendingDrawIds.delete(it.id); renderUI(); } };
            if (it.kind === 'hand') {
                if (isVulture)      animateCardFlip(it.from.x, it.from.y, to.x, to.y, 'card_back', fc, { flip: true, startScale: 0.3, endScale: 0.3, duration: 420, onComplete: done });
                else if (isMine)    animateCardFlip(it.from.x, it.from.y, to.x, to.y, 'card_back', fc, { flip: true, reverse: true, startScale: 0.3, endScale: 0.3, duration: 420 });
                else                animateCard(it.from.x, it.from.y, to.x, to.y, 'card_back', 400);
            } else {
                if (isVulture)      animateCard(it.from.x, it.from.y, to.x, to.y, fc, 400, done);
                else                animateCardFlip(it.from.x, it.from.y, to.x, to.y, 'card_back', fc, { flip: true, reverse: true, startScale: 0.3, endScale: 0.3, duration: 420 });
            }
        }, k * _DEATH_STAGGER);
    });
    if (isVulture) {
        const totalMs = seq.length * _DEATH_STAGGER + 600;
        setTimeout(() => {
            let changed = false;
            seq.forEach(it => { if (it.id != null && App.pendingDrawIds.delete(it.id)) changed = true; });
            if (changed && gameScene) renderUI();
        }, totalMs);
    }
}

// Odkud má vyletět karta, kterou hraju/odhazuju JÁ: z konkrétního slotu v mé ruce
// (ID karty je v ruce ještě před doletem room_update, který ji odebere), ne z obecné
// kotvy ruky. U soupeřů je ruka skrytý vějíř → necháváme obecnou kotvu (getPlayerHandPos).
// Karta hraná z ruky (Panika/Cat Balou) se odebere z ruky útočníka AŽ ve chvíli,
// kdy ji zvedá animace (ne dřív) – aby z ruky nezmizela před začátkem animace. Platí
// pro všechny diváky: do room_update mají kartu ve stavu, tady ji odeberou „za letu".
function _liftCardFromHand(playerIdx, cardId) {
    // Zaregistruj kartu jako „letící z ruky" – room_update ji do doletu animace nevrátí
    // zpět (server ji může dočasně vrátit do ruky a znovu rozeslat, viz handFlyHideIds).
    // Po ustálení stavu (delší než nejdelší play animace + broadcast) registraci zruš –
    // aby se stejná karta mohla později do ruky legálně vrátit (Slab: discard_to_hand).
    if (cardId != null) {
        App.handFlyHideIds.add(cardId);
        setTimeout(() => App.handFlyHideIds.delete(cardId), 1500);
    }
    const h = state?.players?.[playerIdx]?.hand;
    if (!h) return;
    const k = h.findIndex(c => c.id === cardId);
    if (k !== -1) { h.splice(k, 1); if (gameScene) renderUI(); }
}

function getMyPlayedCardPos(playerIdx, cardId) {
    if (playerIdx === myIndex && myIndex !== null && cardId != null) {
        // Pozici slotu zachycenou při kliknutí (před optimistickým odebráním z ruky)
        // upřednostni a spotřebuj (jednorázově), jinak zkus dohledat v aktuální ruce.
        const stashed = App.playedCardFromPos[cardId];
        if (stashed) { delete App.playedCardFromPos[cardId]; return stashed; }
        const hand = state?.players?.[playerIdx]?.hand || [];
        const idx = hand.findIndex(c => c.id === cardId);
        if (idx !== -1) return getHandSlotPos(playerIdx, idx, hand.length);
    }
    return getPlayerHandPos(playerIdx);
}

// Karta ze stolu cíle právě odlétá (Panika/Cat Balou/Ragtime): skryj ji po dobu letu.
// Když jde o MOU zbraň (area 'weapon'), sundej ji rovnou z mého stavu, ať se na jejím
// místě HNED objeví výchozí Colt .45 – jinak slot zůstane prázdný, než dorazí room_update
// (= krátké probliknutí). Colt slot je jen v mém renderu (drawMyArea), proto stačí pro mě.
function _hideStolenBoardCard(data) {
    if (data.stolenCardId == null) return;
    App.stealHideIds.add(data.stolenCardId);
    if (data.area === 'weapon' && data.targetIdx === myIndex && myIndex !== null) {
        const me = state?.players?.[myIndex];
        if (me?.weapon && me.weapon.id === data.stolenCardId) me.weapon = { id: -1 };
    }
    renderUI();
}

function _playCardAnim(data) {
    if (!gameScene || !state) return;   // divák (myIndex === null) animace také vidí
    const deck    = deckTopPos();      // vrch balíčku (odkud karta vzlétá / kam dosedá)
    const discard = discardTopPos();   // vrch odhozu (ne základna) – ať karty dosednou na hromádku

    // Server posílá vizuální slot v jednotné konvenci „slot 0 = zbraň": 0 = výzbroj,
    // 1+k = k-tá karta na stole. Přesně tak kreslím SVŮJ stůl (na slotu 0 je zbraň, a
    // když žádnou nemám, výchozí Colt .45 – viz drawMyArea). Soupeři Colt nezobrazují,
    // takže bez zbraně jim jeden slot ubývá → index posuň o 1 dolů. Bez toho letěla
    // krádež/odhoz z cizího stolu (a Krytý vůz/Kankán na vlastní stůl) o kartu vedle.
    const getBoardPos = (playerIdx, boardIdx = 0) => {
        const view = myIndex === null ? 0 : myIndex;
        const p = state?.players?.[playerIdx];
        const hasWeapon = !!(p?.weapon && p.weapon.id !== -1);
        const idx = (playerIdx !== view && !hasWeapon && boardIdx > 0) ? boardIdx - 1 : boardIdx;
        return getBoardCardPos(playerIdx, idx);
    };

    // Úhel, pod kterým jsou renderované karty daného hráče (viz drawOpponents):
    // já/spodní 0°, vlevo 90°, nahoře 180°, vpravo −90°. Stranu bereme ze stejného
    // zdroje jako renderer (kotvy soupeřů), ne z kvadrantové heuristiky.
    const sideAngle = (playerIdx) => {
        const view = myIndex === null ? 0 : myIndex;
        if (playerIdx === view) return 0;
        const total = state.players.length;
        const diff = (playerIdx - view + total) % total;
        const side = getOpponentAnchors(total)[diff - 1]?.side;
        return side === 'left' ? 90 : side === 'right' ? -90 : side === 'top' ? 180 : 0;
    };
    // Velikost karet na boardu daného hráče: já 0.36 (scaleMe), soupeři 0.27 (scaleOpp).
    const sideScale = (playerIdx) => (playerIdx === (myIndex === null ? 0 : myIndex)) ? 0.36 : 0.27;

    // holdUntil predikáty pro letové animace: karta je už ve stavu odhozu / na boardu daného
    // hráče. Letící sprite se drží na cíli, dokud to neplatí (jinak po doletu problikne stará
    // karta na cíli, než dorazí room_update s tou novou).
    const inDiscard = (id) => (state?.deck?.discardPile || []).some(c => c.id === id);
    const onBoardOf = (playerIdx, id) => {
        const p = state?.players?.[playerIdx];
        return !!p && ((p.board || []).some(c => c.id === id) || p.weapon?.id === id);
    };

    // Lucky Duke: výsledek checku (dynamit/vězení) přijde dřív než room_update, takže
    // jsme ještě ve fázi LUCKY_DUKE. Tu kartu zdržíme, ať dosedne do odhozu AŽ po obou
    // odhalených kartách (jako poslední). Skrytí v odhozu (discardAnimHideId) platí hned.
    const _luckyResultDelay = state?.phase === 'LUCKY_DUKE' ? 850 : 0;
    const _runResult = (fn) => { if (_luckyResultDelay) setTimeout(fn, _luckyResultDelay); else fn(); };

    switch (data.type) {
        case 'draw': {
            // Majitel: reveal flip do finálního slotu + staging (objeví se po dosednutí).
            if (!animateDrawToMyHand(data.playerIdx, data.cardId, deck.x, deck.y)) {
                // Soupeřova karta zůstává skrytá (rub), míří do jeho vějíře ruky – a dotočí
                // se z orientace balíčku (0°) do orientace jeho ruky (bok = ±90°, protější = 180°).
                // Rychlá líznutí za sebou: než dorazí room_update, posílají se na STEJNÝ slot
                // a překrývají se ve stejné hloubce (blikání/špatné vrstvy). Držíme proto počet
                // právě letících líznutí u daného soupeře – každé další míří o slot dál a má
                // vyšší depth (pozdější karta navrch).
                const pIdx = data.playerIdx;
                App.oppDrawPending = App.oppDrawPending || {};
                const pending = App.oppDrawPending[pIdx] || 0;
                App.oppDrawPending[pIdx] = pending + 1;
                const oldLen = state.players?.[pIdx]?.hand?.length ?? 0;
                const slot = oldLen + pending;
                const target = getHandSlotPos(pIdx, slot, slot + 1);
                // exactAngle: u hráče PŘÍMO NAPROTI (nahoře, 180°) by se rotace bez něj
                // srovnala na 0° (symetrie rubu) → karta letí „placatě" a dosedne v MOJÍ
                // orientaci místo jeho vějíře (pak by po room_update přeskočila na 180°).
                // Se 180° se viditelně dotočí do jeho orientace, jako rozdání přes stůl.
                animateCard(deck.x, deck.y, target.x, target.y, 'card_back', 380,
                    () => { App.oppDrawPending[pIdx] = Math.max(0, (App.oppDrawPending[pIdx] || 1) - 1); },
                    { startAngle: 0, endAngle: sideAngle(pIdx), exactAngle: true, depth: 800 + pending });
            }
            break;
        }
        case 'discard':
        case 'hand_to_discard': {
            const fromIdx = data.fromPlayerIdx ?? data.playerIdx;
            const from = getMyPlayedCardPos(fromIdx, data.cardId);
            const faceTex = getCardTex(data.cardId);
            // Kartu odeber z ruky odesílatele TEĎ, se startem animace (pozici `from` už máme) –
            // ať zmizí z ruky přesně když karta vzlétne (dřív mizela pozdě, až po doletu, když
            // dorazil room_update). Platí pro soupeře i pro mě.
            _liftCardFromHand(fromIdx, data.cardId);
            // V odhozu kartu skryj, dokud nedoletí – jinak naskočí navrch dřív, než dorazí.
            App.discardAnimHideId = data.cardId;
            renderUI();
            const done = () => { if (App.discardAnimHideId === data.cardId) { App.discardAnimHideId = null; renderUI(); } };
            // Vlastník kartu zná (líc); ostatní ji měli v ruce skrytou → překlopení rub→líc.
            // Karta se přitom dotočí z orientace ruky odesílatele (bok = ±90°, protější = 180°)
            // do orientace odhozu (0°); flip se „prostorově" složí po hraně dané tou orientací.
            // startScale = velikost karty v ruce odesílatele (soupeř 0.27, já 0.36), ať karta
            // nevzlétne o kus větší než ostatní karty v ruce.
            const isMine = fromIdx === myIndex;
            animateCardFlip(from.x, from.y, discard.x, discard.y, 'card_back', faceTex,
                { flip: !isMine, startScale: sideScale(fromIdx), endScale: 0.3, duration: 380, onComplete: done,
                  startAngle: sideAngle(fromIdx), endAngle: 0, holdUntil: () => inDiscard(data.cardId) });
            break;
        }
        case 'hand_to_board': {
            const boardIdx = data.boardIdx ?? 0;
            const from = getMyPlayedCardPos(data.playerIdx, data.cardId);
            // Cíl počítej, jako by karta na boardu UŽ byla – jinak je skupina o kartu užší
            // a karta dosedne vedle (obzvlášť u protějšího hráče), než ji tam room_update
            // přidá a skupina se rozšíří. Phantom jen pro výpočet pozice (hned sundáme).
            const destBoard = state?.players?.[data.playerIdx]?.board;
            let to;
            if (destBoard && boardIdx > 0) {
                destBoard.push({ _phantom: true });
                to = getBoardPos(data.playerIdx, boardIdx);
                destBoard.pop();
            } else {
                to = getBoardPos(data.playerIdx, boardIdx);
            }
            // Kartu odeber z ruky hráče se startem animace (pozici `from` už máme) – ať zmizí
            // z ruky, když vzlétne, ne pozdě po doletu room_update.
            _liftCardFromHand(data.playerIdx, data.cardId);
            const ang = sideAngle(data.playerIdx);
            const sc = sideScale(data.playerIdx);
            const hold = () => onBoardOf(data.playerIdx, data.cardId);
            if (data.playerIdx === myIndex) {
                // Svou modrou/zbraň znám → jen letí na board (bez odhalování), ve VELIKOSTI
                // karty na mém boardu (0.36, ne malý default). holdUntil brání probliknutí.
                animateCardFlip(from.x, from.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { flip: false, startAngle: ang, endAngle: ang, startScale: sc, endScale: sc, duration: 400, holdUntil: hold });
            } else {
                // Cizí modrá/zbraň se ostatním teprve odhalí (rub→líc) a usadí v orientaci
                // vykládajícího hráče (bok = ±90°, protější = 180°) → flip s rotací i po hraně.
                animateCardFlip(from.x, from.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { flip: true, startAngle: ang, endAngle: ang, startScale: sc, endScale: sc, duration: 400, holdUntil: hold });
            }
            break;
        }
        case 'panic_sequence': {
            const atk = getMyPlayedCardPos(data.attackerIdx, data.cardId);
            const isBoard = data.area !== 'hand';
            const from = isBoard
                ? getBoardPos(data.targetIdx, data.boardIdx ?? 1)
                : getPlayerHandPos(data.targetIdx);
            const panicTex = getCardTex(data.cardId);
            const atkAngle = sideAngle(data.attackerIdx);
            const tgtAngle = sideAngle(data.targetIdx);
            const isMyPanic = data.attackerIdx === myIndex;
            const revealStolen = () => { if (data.stolenCardId) { App.stealHideIds.delete(data.stolenCardId); renderUI(); } };
            // Paniku odeber z ruky útočníka teprve TEĎ, když ji zvedá animace (atk se už
            // spočítal z její pozice) – ať z ruky nezmizí dřív, než začne letět.
            _liftCardFromHand(data.attackerIdx, data.cardId);
            const afterReach = () => {
                animateCard(from.x, from.y, discard.x, discard.y, panicTex, 250, null,
                    { startAngle: tgtAngle, endAngle: 0, scale: 0.3, holdUntil: () => inDiscard(data.cardId) });
                // Ukradenou kartu z výzbroje/stolu skryj AŽ TEĎ, když se odlepuje (jinak
                // by z boardu zmizela hned a teprve po doletu paniky vylétla z prázdna).
                if (isBoard && data.stolenCardId) _hideStolenBoardCard(data);
                // Panika z RUKY: kartu (rub) uber z ruky cíle TEĎ, když se odlepuje k útočníkovi
                // – ať ji cíl nedrží déle, než letí (dřív mizela až s room_update = viditelně pozdě).
                else if (state?.players?.[data.targetIdx]?.hand?.length) {
                    state.players[data.targetIdx].hand.splice(-1, 1); renderUI();
                }
                // Ukradená karta zpět k útočníkovi: majitel ji vidí (z ruky skrytě →
                // flip, z výzbroje/stolu lícem → jen růst) + staging do slotu. Cíl letu =
                // KONCOVÝ slot ruky útočníka (ne střed vějíře). Dotočí se z orientace cíle
                // (bok ±90°, protější 180°) do mojí orientace ruky (0°).
                if (!animateDrawToMyHand(data.attackerIdx, data.stolenCardId, from.x, from.y,
                        { duration: 320, faceUp: isBoard, onComplete: revealStolen, startAngle: tgtAngle })) {
                    const dLen = state?.players?.[data.attackerIdx]?.hand?.length ?? 0;
                    const toAtk = getHandSlotPos(data.attackerIdx, dLen, dLen + 1);
                    const stolenTex = data.stolenCardId ? getCardTex(data.stolenCardId) : 'card_back';
                    animateCard(from.x, from.y, toAtk.x, toAtk.y, stolenTex, 320, revealStolen,
                        { startAngle: tgtAngle, endAngle: atkAngle, scale: sideScale(data.attackerIdx) });
                }
            };
            // 1. leg: svoji paniku znám (líc rovnou); cizí (botí) se za letu odhalí (rub→líc).
            // Otočí se z orientace útočníka do orientace cíle.
            if (isMyPanic) {
                animateCard(atk.x, atk.y, from.x, from.y, panicTex, 320, afterReach,
                    { startAngle: atkAngle, endAngle: tgtAngle, scale: 0.3 });
            } else {
                animateCardFlip(atk.x, atk.y, from.x, from.y, 'card_back', panicTex,
                    { flip: true, startAngle: atkAngle, endAngle: tgtAngle, startScale: 0.3, endScale: 0.3, duration: 320, onComplete: afterReach });
            }
            break;
        }
        case 'catbalou_sequence': {
            const atk = getMyPlayedCardPos(data.attackerIdx, data.cardId);
            const isBoard = data.area !== 'hand';
            const from = isBoard
                ? getBoardPos(data.targetIdx, data.boardIdx ?? 1)
                : getPlayerHandPos(data.targetIdx);
            const cbTex = getCardTex(data.cardId);
            const stolenTex = data.stolenCardId ? getCardTex(data.stolenCardId) : 'card_back';
            const atkAngle = sideAngle(data.attackerIdx);
            const tgtAngle = sideAngle(data.targetIdx);
            const isMyCB = data.attackerIdx === myIndex;
            const revealStolen = () => { if (data.stolenCardId) { App.stealHideIds.delete(data.stolenCardId); renderUI(); } };
            // Cat Balou odeber z ruky útočníka teprve TEĎ, když ji zvedá animace (atk se
            // už spočítal z její pozice) – ať z ruky nezmizí dřív, než začne letět.
            _liftCardFromHand(data.attackerIdx, data.cardId);
            const afterReach = () => {
                animateCard(from.x, from.y, discard.x, discard.y, cbTex, 250, null,
                    { startAngle: tgtAngle, endAngle: 0, scale: 0.3, holdUntil: () => inDiscard(data.cardId) });
                // Zničenou kartu z výzbroje/stolu skryj AŽ TEĎ, když se odlepuje.
                if (isBoard && data.stolenCardId) _hideStolenBoardCard(data);
                // Cat Balou z RUKY: kartu (rub) uber z ruky cíle TEĎ, když letí do odhozu –
                // ať ji cíl nedrží déle, než letí (dřív mizela až s room_update = pozdě).
                else if (state?.players?.[data.targetIdx]?.hand?.length) {
                    state.players[data.targetIdx].hand.splice(-1, 1); renderUI();
                }
                // Odhozená (zničená) karta letí z cíle do odhozu a srovná se do 0°. Z RUKY
                // byla skrytá (rub) → za letu se přetočí na líc (reveal); z výzbroje/stolu
                // už byla lícem nahoru → jen srovnání bez překlopení.
                animateCardFlip(from.x, from.y, discard.x, discard.y, 'card_back', stolenTex,
                    { flip: !isBoard, startAngle: tgtAngle, endAngle: 0, startScale: 0.3, endScale: 0.3,
                      duration: 320, onComplete: revealStolen,
                      holdUntil: data.stolenCardId ? () => inDiscard(data.stolenCardId) : undefined });
            };
            // 1. leg: svou CB znám (líc); cizí (botí) se za letu odhalí (rub→líc). Otočí se
            // z orientace útočníka do orientace cíle.
            if (isMyCB) {
                animateCard(atk.x, atk.y, from.x, from.y, cbTex, 320, afterReach,
                    { startAngle: atkAngle, endAngle: tgtAngle, scale: 0.3 });
            } else {
                animateCardFlip(atk.x, atk.y, from.x, from.y, 'card_back', cbTex,
                    { flip: true, startAngle: atkAngle, endAngle: tgtAngle, startScale: 0.3, endScale: 0.3, duration: 320, onComplete: afterReach });
            }
            break;
        }
        case 'jesse_jones_draw': {
            const victim = state?.players?.[data.fromPlayerIdx];
            const vLen = victim?.hand?.length ?? 0;
            // Slot, ze kterého karta odchází: server posílá skutečný index (Jesse bere
            // náhodnou), jinak (starší el gringo) padáme na poslední kartu.
            const hasIdx = data.stolenIndex != null && data.stolenIndex >= 0 && data.stolenIndex < vLen;
            const slotIdx = hasIdx ? data.stolenIndex : Math.max(0, vLen - 1);
            const stolenCard = victim?.hand?.[slotIdx] || null;
            const from = victim ? getHandSlotPos(data.fromPlayerIdx, slotIdx, Math.max(1, vLen))
                                : getPlayerHandPos(data.fromPlayerIdx);
            const fromAngle = sideAngle(data.fromPlayerIdx);
            const drawerAngle = sideAngle(data.playerIdx);
            // Kartu uber z ruky cíle TEĎ (se startem animace) na SPRÁVNÉM indexu – ruka se
            // přeskládá hned, ne až po doletu room_update (dřív mizela poslední → přeskoky).
            if (!data.isElGringo && victim && vLen > 0) {
                victim.hand.splice(slotIdx, 1); renderUI();
            }
            // Majitel (Jesse) vidí ukradenou kartu (reveal flip) + staging do svého slotu.
            // Karta se navíc dotočí z orientace okradeného (bok ±90°, protější 180°) do mojí
            // orientace ruky (0°) – dřív jen překlápěla, ale netočila (ležela „na boku").
            if (!animateDrawToMyHand(data.playerIdx, data.cardId, from.x, from.y, { duration: 380, startAngle: fromAngle })) {
                const dLen = state?.players?.[data.playerIdx]?.hand?.length ?? 0;
                const to = getHandSlotPos(data.playerIdx, dLen, dLen + 1);   // koncový slot ruky Jesseho
                if (data.fromPlayerIdx === myIndex && stolenCard) {
                    // Jsem cíl a kartu znám → schová se (líc→rub) a otočí do orientace Jesseho.
                    animateCardFlip(from.x, from.y, to.x, to.y, 'card_back', getCardTex(stolenCard.id),
                        { flip: true, reverse: true, startAngle: fromAngle, endAngle: drawerAngle,
                          startScale: sideScale(data.fromPlayerIdx), endScale: sideScale(data.playerIdx), duration: 380 });
                } else {
                    // Jiný divák: jen rub, otočí se z orientace cíle do orientace Jesseho.
                    // exactAngle: cíl a Jesse přímo naproti (180° od sebe) by se bez něj
                    // srovnali na 0° a karta by letěla placatě – takhle se dotočí naplno.
                    animateCard(from.x, from.y, to.x, to.y, 'card_back', 380, null,
                        { startAngle: fromAngle, endAngle: drawerAngle, exactAngle: true, scale: sideScale(data.playerIdx) });
                }
            }
            break;
        }
        case 'pedro_draw': {
            // Vrchní kartu odhozu skryj HNED se startem animace (jinak v odhozu zůstane
            // viditelná po celou dobu letu a zmizí až po něm), po doletu brána zhasne.
            App.discardFlyHideIds.add(data.cardId);
            renderUI();
            const pedroDone = () => { App.discardFlyHideIds.delete(data.cardId); renderUI(); };
            // Karta z odhozu (lícem nahoru) → bez otáčení, jen dolet + růst + staging.
            if (!animateDrawToMyHand(data.playerIdx, data.cardId, discard.x, discard.y, { faceUp: true, duration: 380, onComplete: pedroDone })) {
                // Soupeř bere veřejnou vrchní kartu odhozu (líc) → letí do jeho ruky a
                // dotočí se do jeho orientace (bok = ±90°, protější = 180°), jako běžné líznutí.
                const handPos = getPlayerHandPos(data.playerIdx);
                animateCard(discard.x, discard.y, handPos.x, handPos.y, getCardTex(data.cardId), 380, pedroDone,
                    { startAngle: 0, endAngle: sideAngle(data.playerIdx) });
            }
            break;
        }
        case 'discard_to_hand': {
            // Vedle se vrací z odhozu do ruky (Slab the Killer – zrušený částečný odpor).
            // U mě letí na svůj SKUTEČNÝ slot (staging přes pendingDrawIds, jako líznutí),
            // ne na fixní kotvu ruky – proto animateDrawToMyHand (líc nahoru, bez otáčení).
            if (data.toPlayerIdx === myIndex &&
                animateDrawToMyHand(data.toPlayerIdx, data.cardId, discard.x, discard.y, { faceUp: true, duration: 400 })) {
                break;
            }
            const handPos = getPlayerHandPos(data.toPlayerIdx);
            animateCard(discard.x, discard.y, handPos.x, handPos.y, 'card_back', 400);
            break;
        }
        case 'ragtime_steal': {
            // Ragtime: ukradená karta letí od cíle (ruka/výzbroj/stůl) do ruky útočníka.
            // (Samotná Ragtime i „další" karta letí do odhozu přes hand_to_discard.)
            // Odpovídá druhé části paniky (afterReach) – bez první nohy (nic k cíli neletí).
            const isBoard = data.area !== 'hand';
            const from = isBoard
                ? getBoardPos(data.targetIdx, data.boardIdx ?? 1)
                : getPlayerHandPos(data.targetIdx);
            const tgtAngle = sideAngle(data.targetIdx);
            const atkAngle = sideAngle(data.attackerIdx);
            const revealStolen = () => { if (data.stolenCardId) { App.stealHideIds.delete(data.stolenCardId); renderUI(); } };
            // Kartu z výzbroje/stolu skryj (letí), z ruky uber cíli poslední rub.
            if (isBoard && data.stolenCardId) _hideStolenBoardCard(data);
            else if (state?.players?.[data.targetIdx]?.hand?.length) {
                state.players[data.targetIdx].hand.splice(-1, 1); renderUI();
            }
            if (!animateDrawToMyHand(data.attackerIdx, data.stolenCardId, from.x, from.y,
                    { duration: 360, faceUp: isBoard, onComplete: revealStolen, startAngle: tgtAngle })) {
                const dLen = state?.players?.[data.attackerIdx]?.hand?.length ?? 0;
                const toAtk = getHandSlotPos(data.attackerIdx, dLen, dLen + 1);
                if (isBoard && data.stolenCardId) {
                    // Viditelná karta ze stolu (Pat Brennan / Ragtime) mizí do SKRYTÉ ruky
                    // jiného hráče → pro ostatní se za letu překlopí lícem→rub (reverse),
                    // zamíří na správný slot a dotočí se z orientace cíle do orientace útočníka.
                    animateCardFlip(from.x, from.y, toAtk.x, toAtk.y, 'card_back', getCardTex(data.stolenCardId),
                        { reverse: true, startAngle: tgtAngle, endAngle: atkAngle,
                          startScale: sideScale(data.targetIdx), endScale: sideScale(data.attackerIdx),
                          duration: 360, onComplete: revealStolen });
                } else {
                    const stolenTex = data.stolenCardId ? getCardTex(data.stolenCardId) : 'card_back';
                    animateCard(from.x, from.y, toAtk.x, toAtk.y, stolenTex, 360, revealStolen,
                        { startAngle: tgtAngle, endAngle: atkAngle, scale: sideScale(data.attackerIdx) });
                }
            }
            break;
        }
        case 'player_death_discard':
            playDeathDiscard(data);
            break;
        case 'vulture_sam_steal':
            playVultureSteal(data);
            break;
        case 'beer_auto_save': {
            const from = getMyPlayedCardPos(data.fromPlayerIdx, data.cardId);
            const beerCard = state?.players?.[data.fromPlayerIdx]?.hand?.find?.(c => c.id === data.cardId);
            const fromX = from.x, fromY = from.y;
            if (data.fromPlayerIdx === myIndex && beerCard && state?.players?.[myIndex]) {
                const bi = state.players[myIndex].hand.findIndex(c => c.id === data.cardId);
                if (bi !== -1) state.players[myIndex].hand.splice(bi, 1);
                renderUI();
            }
            animateCard(fromX, fromY, discard.x, discard.y, getCardTex(data.cardId), 380);
            break;
        }
        case 'beer_blocked': {
            const from = getPlayerHandPos(data.fromPlayerIdx);
            const tex = getCardTex(data.cardId);
            animateCard(from.x, from.y, from.x, from.y - 100, tex, 200);
            setTimeout(() => {
                if (gameScene) animateCard(from.x, from.y - 100, from.x, from.y, tex, 200);
            }, 210);
            break;
        }
        case 'jail_sequence': {
            const jailIdx = data.boardIdx ?? 1;
            const atk = getMyPlayedCardPos(data.attackerIdx, data.cardId);
            // Cíl = slot na boardu CÍLE. Karta tam ve stavu ještě není → phantom pro šířku
            // skupiny, ať dosedne přesně tam, kam ji board.js po broadcastu vykreslí.
            const destBoard = state?.players?.[data.targetIdx]?.board;
            let to;
            if (destBoard && jailIdx > 0) {
                destBoard.push({ _phantom: true });
                to = getBoardPos(data.targetIdx, jailIdx);
                destBoard.pop();
            } else {
                to = getBoardPos(data.targetIdx, jailIdx);
            }
            // Vězení odeber z ruky útočníka se startem animace (pozici `atk` už máme).
            _liftCardFromHand(data.attackerIdx, data.cardId);
            const atkAngle = sideAngle(data.attackerIdx);
            const tgtAngle = sideAngle(data.targetIdx);
            const isMine = data.attackerIdx === myIndex;
            const hold = () => onBoardOf(data.targetIdx, data.cardId);
            // Letí z ruky útočníka na board CÍLE: útočník kartu zná (líc, bez flipu), ostatní
            // ji měli u útočníka skrytou → flip rub→líc. Otočí se z orientace útočníka do
            // orientace cíle a přeškáluje z velikosti ruky útočníka na velikost boardu cíle.
            animateCardFlip(atk.x, atk.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                { flip: !isMine, startAngle: atkAngle, endAngle: tgtAngle,
                  startScale: sideScale(data.attackerIdx), endScale: sideScale(data.targetIdx),
                  duration: 400, holdUntil: hold });
            break;
        }
        case 'dynamite_pass': {
            const from = getBoardPos(data.fromIdx, data.fromBoardIdx ?? 1);
            // Cíl ještě nemá dynamit ve stavu (přijde až s broadcastem) → spočítej cílovou
            // pozici, jako by tam dynamit už byl, jinak je skupina vycentrovaná o kartu míň
            // a karta dosedne o kousek vedle. Phantom přidáme jen pro výpočet a hned sundáme.
            const destP = state.players?.[data.toIdx];
            let to;
            if (destP?.board) {
                destP.board.push({ _phantom: true });
                to = getBoardPos(data.toIdx, data.toBoardIdx ?? 1);
                destP.board.pop();
            } else {
                to = getBoardPos(data.toIdx, data.toBoardIdx ?? 1);
            }
            // Po dobu letu dynamit na boardu skryj (broadcast ho tam přidá hned, jinak by
            // byl vidět dvakrát) a po doletu odkryj.
            App.stealHideIds.add(data.cardId);
            renderUI();
            // Dynamit se během letu dotočí do orientace cílového hráče (bok = 90°) a zmenší
            // se z „zvednuté" velikosti na velikost karty na cílovém boardu.
            _runResult(() => animateCard(from.x, from.y, to.x, to.y, getCardTex(data.cardId), 500, () => {
                App.stealHideIds.delete(data.cardId); renderUI();
            }, { startAngle: sideAngle(data.fromIdx), endAngle: sideAngle(data.toIdx),
                 exactAngle: true,   // naproti (0°→180°) se musí opravdu otočit, ne srovnat na 0
                 startScale: 0.42, endScale: sideScale(data.toIdx) }));
            break;
        }
        case 'dynamite_explode': {
            const from = getBoardPos(data.playerIdx, data.boardIdx ?? 1);
            App.discardAnimHideId = data.cardId;   // v odhozu skryj, dokud nedoletí
            renderUI();
            // Z boardu hráče (klidně otočeného o 90°) do odhozu, kde leží rovně (0°), se zmenšením.
            _runResult(() => animateCard(from.x, from.y, discard.x, discard.y, getCardTex(data.cardId), 350, () => {
                if (App.discardAnimHideId === data.cardId) { App.discardAnimHideId = null; renderUI(); }
            }, { startAngle: sideAngle(data.playerIdx), endAngle: 0, startScale: 0.42, endScale: 0.3 }));
            break;
        }
        case 'board_to_discard': {
            const from = getBoardPos(data.fromPlayerIdx, data.boardIdx ?? 0);
            App.discardAnimHideId = data.cardId;   // v odhozu skryj, dokud nedoletí
            App.stealHideIds.add(data.cardId);     // skryj i ZDROJ na stole HNED se startem letu,
            renderUI();                            // ne až s (opožděným) room_update na konci (Rvačka ap.)
            // Z boardu hráče (klidně otočeného o ±90°/180°) do odhozu, kde leží rovně (0°),
            // se zmenšením z velikosti jeho boardu na velikost odhozu (vězení/výměna zbraně).
            // exactAngle: karta na stole leží LÍCEM nahoru, takže 0° ≠ 180° (u protějšího hráče
            // se musí viditelně otočit o 180°, ne se „srovnat" na 180° díky symetrii → jinak
            // dosedne do odhozu vzhůru nohama). Bez exactAngle by nearestCardAngle rotaci zrušil.
            // holdUntil: sprite drž na cíli, dokud karta reálně nedosedne do odhozu (room_update),
            // aby zdroj nezablikal zpět mezi koncem letu (380 ms) a opožděným broadcastem (~420 ms).
            _runResult(() => animateCard(from.x, from.y, discard.x, discard.y, getCardTex(data.cardId), 380, () => {
                App.stealHideIds.delete(data.cardId);
                if (App.discardAnimHideId === data.cardId) App.discardAnimHideId = null;
                renderUI();
            }, { startAngle: sideAngle(data.fromPlayerIdx), endAngle: 0, exactAngle: true,
                 startScale: sideScale(data.fromPlayerIdx), endScale: 0.3,
                 holdUntil: () => inDiscard(data.cardId) }));
            break;
        }
        case 'duel_exchange':
            animateCard(getPlayerHandPos(data.fromPlayerIdx).x, getPlayerHandPos(data.fromPlayerIdx).y,
                        discard.x, discard.y, 'card_back', 280);
            break;
        case 'store_pick': {
            // Karta letí ze slotu hokynářství do ruky hráče. Já: lícem do mého slotu
            // (staging). Jiný: líc→rub do jeho ruky (mizí mu do skryté ruky).
            const count = (state?.storeCards || []).length;
            const slot = getStoreSlotPos(data.cardIdx, count, App.storePileLiftY || 0);
            App.storeDealIds.add(data.cardId);   // skryj kartu ve slotu po dobu letu
            renderUI();
            const cleanup = () => { App.storeDealIds.delete(data.cardId); };
            // Odkrytí slotu drž, dokud karta ze stavu hokynářství SKUTEČNĚ nezmizí
            // (broadcast chodí opožděně, ~400 ms). Bez toho se po doletu do ruky pustí
            // gate dřív, než dorazí nový stav, a karta na okamžik problikne zpět ve slotu.
            const gone = () => !(state?.storeCards || []).some(c => c && c.id === data.cardId);
            if (data.pickerIdx === myIndex) {
                if (!animateDrawToMyHand(data.pickerIdx, data.cardId, slot.x, slot.y,
                        { faceUp: true, duration: 420, onComplete: cleanup, holdUntil: gone })) {
                    const to = getPlayerHandPos(data.pickerIdx);
                    animateCard(slot.x, slot.y, to.x, to.y, getCardTex(data.cardId), 420, cleanup,
                        { holdUntil: gone });
                }
            } else {
                // Cíl = KONCOVÝ slot ruky bereného hráče (ne střed vějíře). Karta se cestou
                // ze slotu (0°) dotočí do jeho orientace (bok ±90°, protější 180°) a schová (líc→rub).
                const dLen = state?.players?.[data.pickerIdx]?.hand?.length ?? 0;
                const to = getHandSlotPos(data.pickerIdx, dLen, dLen + 1);
                animateCardFlip(slot.x, slot.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { flip: true, reverse: true, startScale: 0.32, endScale: sideScale(data.pickerIdx),
                      duration: 420, onComplete: cleanup, holdUntil: gone,
                      startAngle: 0, endAngle: sideAngle(data.pickerIdx) });
            }
            break;
        }
    }
}

// Jak dlouho která animace vizuálně trvá (ms) – o tuhle dobu fronta počká, než pustí
// další položku (další animaci nebo aplikaci stavu). MUSÍ sedět s `duration` použitým
// v _playCardAnim; když se změní délka letu, srovnej i tady, jinak vznikne mezera nebo
// překryv. Nesedící číslo frontu nikdy nezasekne – jen posune pacing.
const ANIM_MS = {
    // Líznutí frontu ZÁMĚRNĚ nedrží (0). Kartu, která ještě letí, drží v ruce skrytou
    // vlastní staging (App.pendingDrawIds + holdUntil v animateDrawToMyHand), takže stav
    // smí dorazit kdykoli – neobjeví se dřív, než dosedne. Kdyby líznutí frontu drželo,
    // při rychlém druhém kliknutí by se stav první karty zařadil až za animaci té druhé:
    // ruka by se přeskládala naráz až po dolíznutí všeho místo postupně a první karta by
    // do té doby visela na svém slotu. Zároveň tím smí dvě líznutí letět souběžně, což je
    // u opakovaných kliknutí přirozené (rozteč letících karet řeší retargetDrawAnims).
    draw:              0,
    discard:           380,
    hand_to_discard:   380,
    hand_to_board:     400,
    jesse_jones_draw:  380,
    pedro_draw:        380,
    discard_to_hand:   400,
    ragtime_steal:     360,
    beer_auto_save:    380,
    beer_blocked:      410,   // nahoru 200 + pauza 210 + zpět 200
    jail_sequence:     400,
    dynamite_pass:     500,
    dynamite_explode:  350,
    board_to_discard:  380,
    duel_exchange:     280,
    store_pick:        420,
    panic_sequence:    640,   // 320 k cíli + 320 s ukradenou kartou zpět
    catbalou_sequence: 640,   // 320 k cíli + 320 se zničenou kartou do odhozu
};

function _animDurationMs(data) {
    // Smrt: karty odlétají po jedné se staggerem, doba = poslední start + její dolet.
    // Colt .45 (fade-out bez letu) se do počtu nepočítá, proto malá rezerva navíc.
    if (data.type === 'player_death_discard' || data.type === 'vulture_sam_steal') {
        const n = (data.blue?.length || 0) + (data.weapon ? 1 : 0) + (data.hand?.length || 0);
        return Math.max(1, n) * _DEATH_STAGGER + 450;
    }
    // Výsledek Lucky Duke checku klient záměrně zdrží (_runResult), ať dosedne až po
    // obou odhalených kartách – ta prodleva se musí započítat. Fázi čteme stejně jako
    // _runResult; server posílá výsledkovou animaci PŘED stavem, který LUCKY_DUKE
    // opouští, takže je tu i v okamžiku přehrání pořád LUCKY_DUKE.
    const lucky = (state?.phase === 'LUCKY_DUKE' &&
        (data.type === 'dynamite_pass' || data.type === 'dynamite_explode' ||
         data.type === 'board_to_discard')) ? 850 : 0;
    return (ANIM_MS[data.type] ?? 400) + lucky;
}

socket.on('card_animation', (data) => {
    // Mimo scénu/hru není co přehrát – nezařazuj, ať fronta nedrží následující stav.
    if (!gameScene || !state || !data) return;
    _animQ.pushAnim(() => _playCardAnim(data), _animDurationMs(data));
});

socket.on('room_update', (payload) => {
    if (!payload) return;
    _animQ.pushState(() => _applyRoomUpdate(payload));
});

// ── ANIMACE MÍCHÁNÍ BALÍČKU ─────────────────────────────────────────────────
// Míchání frontou NEjde: server u něj sám odkládá broadcast o 5,7 s (delší než
// cinematika), u proaktivního míchání naopak stav schválně nečeká a hra běží dál.
socket.on('reshuffle_anim', ({ cardCount, proactive, topCardId }) => {
    if (!gameScene) return;

    App.reshuffleAnimating = true;
    App.blockInput = true;
    App.reshuffleIsProactive = proactive === true;

    if (state?.deck) {
        let topCard = null;
        if (topCardId !== null && topCardId !== undefined) {
            topCard = state.deck.discardPile.find(c => c.id === topCardId) || { id: topCardId };
        } else if (state.deck.discardPile.length > 0) {
            topCard = state.deck.discardPile[state.deck.discardPile.length - 1];
        }
        state.deck.discardPile = topCard ? [topCard] : [];
    }
    renderUI();

    // Samotná cinematika je sdílená s hokynářstvím (game.js playReshuffleCinematic),
    // aby to bylo v obou případech vizuálně i délkou totéž míchání. onDone odemkne UI
    // u proaktivního zamíchání, kde broadcast dorazil hned na začátku animace.
    playReshuffleCinematic(cardCount, {
        onDone: () => {
            if (App.reshuffleIsProactive) {
                App.blockInput = false;
                App.reshuffleIsProactive = false;
                if (gameScene) renderUI();
            }
        }
    });
});

// getPlayerHandPos a getBoardCardPos jsou v positions.js

// ── NOVÉ MULTI-GAME SOCKET HANDLERY ──────────────────────────────────────────

socket.on('room_joined', ({ roomId, myIndex: idx }) => {
    myIndex = idx;
    App.debugViewAs = null;
    _rejoinDone = true;        // jsme v místnosti → auto-rejoin už neřeš
    saveBangSession(roomId);   // umožní automatický návrat po F5/výpadku
    clog('info', 'Jsem hráč ' + idx + ' v room ' + roomId);
});

// ── Auto-rejoin do rozehrané hry ─────────────────────────────────────────────
// Server drží naše místo podle tokenu (ne socket.id, ten je po reconnectu/F5 nový).
// Pošleme 'rejoin', kdykoli máme uloženou session. Emit funguje i před navázáním
// spojení – socket.io ho zabufferuje a odešle po connectu (proto kryje i úplně
// první „studené" načtení okna, kde by se 'connect' listener jinak nemusel chytit).
let _rejoinTries = 0;
let _rejoinDone = false;
function attemptRejoin() {
    if (_rejoinDone) return;
    const sess = loadBangSession();
    if (!sess || !sess.roomId) return;
    if (sess.name && !playerName) playerName = sess.name;   // obnov jméno po F5
    socket.emit('rejoin', { roomId: sess.roomId, token: bangToken });
}
socket.on('connect', () => { _rejoinDone = false; _rejoinTries = 0; _animQ.reset(); attemptRejoin(); });

// Server naše místo (zatím) nedrží. Po zavření a rychlém otevření nového okna může
// server zpracovat náš 'rejoin' DŘÍV než disconnect starého socketu (hráč ještě není
// 'disconnected'). Pár× to proto zopakuj; teprve pak to vzdej (session pryč + menu).
socket.on('rejoin_failed', () => {
    if (_rejoinDone) return;
    if (++_rejoinTries <= 6) { setTimeout(attemptRejoin, 500); return; }
    clearBangSession();
    if (!roomState) return;
    roomState = null; state = null; myIndex = null; _myNextGameVote = null;
    App.menuScreen = 'main';
    if (gameScene) renderUI();
});

attemptRejoin();   // pokus hned při načtení (buffered – odejde po connectu)

// ── Akci zahodil server (server/guard.js) ────────────────────────────────────
// Hra na nás v tu chvíli nečekala – typicky opožděný/dvojitý klik na pomalé lince
// (např. „Ukončit tah" poslaný dvakrát, než dorazil nový stav). Nový stav kvůli
// zahozené akci NEPŘIJDE, takže si UI musíme odemknout sami, ať tlačítka nezůstanou
// mrtvá; správný stav dorazí běžným broadcastem.
socket.on('action_rejected', (info) => {
    App.blockInput = false;
    clog('warn', 'akce zahozena serverem: ' + (info?.event || '?'), { reason: info?.reason });
    if (gameScene) renderUI();
});

function _applyRoomUpdate(payload) {
    const _prevPhase = roomState?.gameState?.phase;   // fáze před tímto updatem (pro reveal trigger)
    const _prevCurrentPlayer = roomState?.gameState?.currentPlayerIndex;  // kdo byl na tahu (Kit Carlson exit)
    // Životy před tímto updatem (pro posun postavy při zásahu/vyléčení – Návrh 1).
    const _prevHealths = (roomState?.gameState?.players && _prevPhase && _prevPhase !== 'CHARACTER_SELECT')
        ? roomState.gameState.players.map(pp => pp.health) : null;
    if (payload.gameState?.phase === 'CHARACTER_SELECT' &&
        roomState?.gameState?.phase !== 'CHARACTER_SELECT') {
        App.debugSelectFor = null;
    }
    // Pokud roomPhase prechazi z lobby -> char_select, intro brzy dorazi.
    // Navazující hra startuje z 'finished' / 'next_lobby' – i tam se čeká na intro,
    // jinak by na 50 ms probliklo staré okno výběru postavy.
    // Režimy, kde server intro přeskakuje (lifecycle.js), musí zůstat bez flagu –
    // jinak by klient čekal na cinematiku, která nikdy nepřijde.
    const _introSkipped = !!(payload.gameState?.isDebug
        || payload.gameState?.options?.singleChar || payload.gameState?.options?.botGame);
    if (payload.roomPhase === 'char_select' && !_introActive() && !_introSkipped &&
        ['lobby', 'next_lobby', 'finished'].includes(roomState?.roomPhase)) {
        App.introExpected = true;
    }
    // Jakmile intro dorazilo, zrus flag
    if (_introActive()) App.introExpected = false;
    if (!payload.gameState?.winner && roomState?.gameState?.winner) _myNextGameVote = null;
    roomState = payload;
    state = payload.gameState;
    // Karty právě odlétající z ruky (hraná/odhazovaná, panika/CB) drž mimo ruce, dokud
    // animace běží – server je mohl dočasně vrátit do ruky a znovu rozeslat, jinak by
    // naskočily zpět doprostřed letu a přepočítaly rozteč (ukradená karta by mířila vedle).
    if (App.handFlyHideIds.size && state?.players) {
        state.players.forEach(pp => {
            if (pp?.hand?.length) pp.hand = pp.hand.filter(c => !App.handFlyHideIds.has(c.id));
        });
    }
    // Pojistka: na začátku (nové) hry zahoď případné uvíznuté staging-ID, aby se
    // omylem neskryla karta se stejným ID v dalším balíčku.
    if (state?.phase === 'CHARACTER_SELECT' || state?.phase === undefined) { App.pendingDrawIds.clear(); App.drawAnims = []; App.discardAnimHideId = null; App.healthAnims = {}; App.deathDiscardHideIds.clear(); App.stealHideIds.clear(); App.handFlyHideIds.clear(); App.storePileLiftY = 0; App.storeDealIds = new Set(); App.storeLocked = false; App.storeShuffleEndAt = 0; App.storeShuffling = false; App.storeShuffleBlock = false; App.kitDealIds.clear(); App.kitRevealCards = null; App.kitPicked = []; App.luckyDealIds.clear(); App.luckyRevealCards = null; App.discardFlyHideIds.clear(); App.pedroDrawLock = false; App.playedCardFromPos = {}; _clearKitSpecSprites(); }

    // Zásah / vyléčení: posuň postavu po kartě životů o reálnou změnu životů. Jen u
    // živého hráče v běžící hře (smrt řeší vlastní odhozová animace → vyžadujeme health>0).
    if (_prevHealths && state?.players && !state.winner) {
        state.players.forEach((pp, i) => {
            const oldH = _prevHealths[i];
            if (typeof oldH === 'number' && oldH > 0 && pp.health > 0 && pp.health !== oldH) {
                App.healthAnims[i] = { fromHealth: oldH };
            }
        });
    }
    if (state?.isDebug && App.debugViewAs !== undefined && App.debugViewAs !== null) {
        myIndex = App.debugViewAs;
    } else {
        myIndex = payload.myIndex ?? null;
        if (!state?.isDebug) App.debugViewAs = null;
    }
    App.spectating = (myIndex === null);

    // Sejmutí / Black Jack reveal: spustí se JEDNOU při přechodu do fáze. Animaci
    // vidí všichni; vyhodnocení (resolve) automaticky odpálí ten, na koho se čeká,
    // po skončení revealu (náhrada za tlačítka [VYHODNOTIT]/[POKRAČOVAT]). U botů
    // řeší časování scheduleBotTick (server/bots.js).
    if (state?.phase === 'CHECKING' && _prevPhase !== 'CHECKING' && state.currentCheck?.active) {
        startCheckReveal(state.currentCheck);
        if (state.currentCheck.playerIdx === myIndex && myIndex !== null) {
            setTimeout(() => {
                if (state?.phase === 'CHECKING' && state.currentCheck?.active) socket.emit('resolve_check');
            }, CHECK_REVEAL_MS);
        }
    }
    if (state?.phase === 'BLACK_JACK_CHECK' && _prevPhase !== 'BLACK_JACK_CHECK' && state.drawPhaseState?.blackJackCard) {
        startBlackJackReveal(state.drawPhaseState);
        if (state.drawPhaseState.playerIdx === myIndex && myIndex !== null) {
            setTimeout(() => {
                if (state?.phase === 'BLACK_JACK_CHECK') socket.emit('resolve_black_jack', true);
            }, CHECK_REVEAL_MS);
        }
    }

    // Hokynářství: vstup do STORE → cinematika (zvednutí balíčků, rozdání, míchání);
    // odchod z STORE → balíčky zpět. Spustí se JEDNOU při přechodu fáze.
    if (state?.phase === 'STORE' && _prevPhase !== 'STORE') {
        if (typeof startStoreCinematic === 'function') startStoreCinematic();
    } else if (_prevPhase === 'STORE' && state?.phase !== 'STORE') {
        if (typeof endStoreCinematic === 'function') endStoreCinematic();
    }

    // Kit Carlson: vstup → rozdej 3 karty z balíčku do panelu (jen Kit hráč vidí);
    // odchod → vybrané letí do ruky, nevybraná zpět do balíčku (ostatním 2 ruby do ruky).
    if (state?.phase === 'KIT_CARLSON' && _prevPhase !== 'KIT_CARLSON') {
        if (state.currentPlayerIndex === myIndex) {
            if (typeof startKitCarlsonDeal === 'function') startKitCarlsonDeal();
        } else if (typeof startKitCarlsonDealSpectator === 'function') {
            // Ostatní (i divák): 3 rubové karty přiletí k Němu a zaparkují u středu.
            startKitCarlsonDealSpectator();
        }
    } else if (state?.phase === 'KIT_CARLSON' && _prevPhase === 'KIT_CARLSON') {
        // Mezivýběr (1. karta) – jen pro ostatní: jedna parkující karta letí do ruky Kita.
        if (state.currentPlayerIndex !== myIndex && typeof advanceKitCarlsonSpectator === 'function') advanceKitCarlsonSpectator();
    } else if (_prevPhase === 'KIT_CARLSON' && state?.phase !== 'KIT_CARLSON') {
        // Vybrané karty už odletěly do ruky při kliknutí; tady doletí jen NEvybraná do
        // balíčku (jen pro Kit hráče – ostatním rostla ruka průběžně, bez animace).
        if (_prevCurrentPlayer === myIndex) {
            if (typeof playKitCarlsonResult === 'function') playKitCarlsonResult();
        } else if (typeof finishKitCarlsonSpectator === 'function') {
            finishKitCarlsonSpectator();
        }
    }

    // Lucky Duke: vstup → rozdej 2 karty z balíčku do panelu (vidí všichni);
    // odchod → obě karty letí do odhozu (výsledek checku animuje server zvlášť).
    if (state?.phase === 'LUCKY_DUKE' && _prevPhase !== 'LUCKY_DUKE') {
        if (typeof startLuckyDukeDeal === 'function') startLuckyDukeDeal();
    } else if (_prevPhase === 'LUCKY_DUKE' && state?.phase !== 'LUCKY_DUKE') {
        if (typeof playLuckyDukeResult === 'function') playLuckyDukeResult();
    }

    if (state?._cardData && !App.allCardsData) App.allCardsData = state._cardData;
    // _pendingDrawCount: pocet kliku ktery jeste nebyl potvrzen room_update
    // Snizime o pocet novych karet ktere server potvrdil
    if (state?.phase === 'DRAW') {
        const _confirmed = state?.drawPhaseState?.cardsDrawn ?? 0;
        const _prev = App.lastConfirmedDrawn ?? 0;
        App.pendingDrawCount = Math.max(0, (App.pendingDrawCount ?? 0) - (_confirmed - _prev));
        App.lastConfirmedDrawn = _confirmed;
    } else {
        App.pendingDrawCount = 0;
        App.lastConfirmedDrawn = 0;
    }
    // Pedro Ramirez: server potvrdil stav → odemkni odhoz pro případné další tahy.
    App.pedroDrawLock = false;

    // Intro + CHARACTER_SELECT: pokud intro_chars jeste nedorazil, pouzij state jako fallback
    // Navazující hra broadcastuje stav i BĚHEM rozhodování přeživších (charChoices už
    // v něm jsou) – tam se výběr postav spustit nesmí, teprve až začne char fáze.
    if (_introActive() && state?.phase === 'CHARACTER_SELECT' &&
        (!_introState.nextGame || _introState.charPhaseStarted) &&
        !_introState.myCharChoices && state.players?.[myIndex]?.charChoices?.length) {
        _introState.myCharChoices = state.players[myIndex].charChoices;
        // Pojistka: kdyby intro_chars (a tím i reveal-let) nedorazil, spusť ho teď.
        if (!_introState.charFlipStarted && typeof _startCharChoicesFlip === 'function') _startCharChoicesFlip();
    }
    // Intro + CHARACTER_SELECT: aktualizuj allCharsChosen pokud vsichni uz maji postavu
    if (_introActive() && state?.phase === 'CHARACTER_SELECT' && state.players) {
        const pending = state.players.filter(p => p.health > 0 && !p.character).length;
        if (pending === 0 && !_introState.allCharsChosen) {
            // server jeste neposlal chars_slide_in - neresime, jen zobrazujeme cekani
        }
    }

    if (selectedState.sidKetchum !== undefined &&
        state?.pendingResponse?.active &&
        state.pendingResponse.targetIdx === myIndex) {
        selectedState.sidKetchum = undefined;
    }

    // Resetuj Sid staged mode pokud fáze již není RESPOND nebo DYNAMITE_DAMAGE
    if (selectedState.sidKetchum !== undefined &&
        state?.phase !== "RESPOND" && state?.phase !== "DYNAMITE_DAMAGE") {
        selectedState.sidKetchum = undefined;
    }

    // Míchání drží UI zamčené i po doručení stavu (klasické proaktivní domíchání i
    // dojezd míchání v hokynářství) – to odemkne až konec cinematiky, ne broadcast.
    if (App.reshuffleAnimating) {
        App.reshuffleAnimating = false;
        if (!App.reshuffleIsProactive && !App.storeShuffleBlock) {
            App.blockInput = false;
        }
    } else {
        if (!App.reshuffleIsProactive && !App.storeShuffleBlock) {
            App.blockInput = false;
        }
    }

    if (gameScene) renderUI();
}

socket.on('lobby_list', (list) => {
    App.lobbyList = list || [];
    const focused = document.activeElement;
    if (gameScene && focused?.tagName !== 'INPUT') renderUI();
});

socket.on('taken_names', (list) => {
    App.allTakenNames = list || [];
    const focused = document.activeElement;
    const onJoinRoom = App.menuScreen === 'join_room';
    if (gameScene && !onJoinRoom && focused?.tagName !== 'INPUT') renderUI();
});

socket.on('game_list', (list) => {
    App.gameList = list || [];
    const focused = document.activeElement;
    if (gameScene && focused?.tagName !== 'INPUT') renderUI();
});

socket.on('go_to_menu', () => {
    clearBangSession();   // záměrný odchod → po F5 se nevracet do hry
    _resetIntro();        // odchod během intra → zahoď zbytky cinematiky (jinak se zdědí do další hry)
    _animQ.reset();       // rozdělaná fronta patří opuštěné hře – nic z ní už nedocommitovat
    roomState = null; state = null; myIndex = null; _myNextGameVote = null;
    App.menuScreen = 'main';
    if (gameScene) renderUI();
});

socket.on('kicked_from_game', (msg) => {
    clearBangSession();
    _resetIntro();
    _animQ.reset();
    roomState = null; state = null; myIndex = null; _myNextGameVote = null;
    App.menuScreen = 'kicked';
    App.kickedMsg = msg || 'Game leader ukončil hru.';
    if (gameScene) renderUI();
});

socket.on('notify', (msg) => {
    clog('warn', 'Notify: ' + msg);
    App.notifyMsg = msg;
    if (gameScene) renderUI();
});

socket.on('join_error', (msg) => {
    App.joinError = msg;
    if (gameScene) renderUI();
});
