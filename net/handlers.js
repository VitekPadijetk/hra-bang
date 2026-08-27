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
    // Opuštěný důl (Fistful) prodlužuje odhoz nad limit karet o výdrž lícem nahoru
    // a překlopení na rub (letí na dobírací balíček). Odhazovaných karet může být
    // za sebou víc, takže by je pevný práh 1400 ms vyhodnotil jako zaostávání
    // a zahodil – tedy právě ty animace, kvůli kterým důl je. Práh proto s dolem
    // povyroste přesně o to, oč jsou lety delší.
    maxLagMs: () => 1400 + 2 * mineLandMs(mineOn()),
    onDrop: (n) => clog('warn', `animační fronta zaostala – přeskočeno ${n} animací`),
});

// ── INTRO SOCKET HANDLERY ─────────────────────────────────────────────────────

socket.on('intro_phase', (data) => {
    if (!gameScene) return;
    // Doběhlé intro ze hry, kterou už nesledujeme (event nenese roomId, ale bez místnosti
    // a s aktivním filtrem může jít jen odtud) – jinak by se zbytky cinematiky zdědily.
    if (App.ignoreRoomId && !roomState) return;
    const sub = data.sub;
    App.myIntroIndex = data.myIndex;

    if (sub === 'init') {
        App.introDoneToken++;          // zruš odložený úklid spritů z minulého intra
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
            // Rozšíření High Noon: balíček událostí (0 = rozšíření se nehraje). Leží na
            // stole od začátku intra, míchá se až ve své fázi (shuffle_highnoon).
            hnCount: data.hnCount || 0,   // kolik karet hromádka právě ukazuje
            hnTotal: data.hnCount || 0,   // plný počet karet balíčku událostí
            hnAsideTex: null,    // odložené Pravé poledne lícem nahoru
            hnMoving: false,     // závěrečný přesun hromádky na herní pozici
            // Totéž pro druhý balíček událostí (A Fistful of Cards) – stejné beaty,
            // jen na druhé straně stolu a s odloženou kartou Fistful of Cards.
            ffCount: data.ffCount || 0,
            ffTotal: data.ffCount || 0,
            ffAsideTex: null,
            ffMoving: false,
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
        // Hra pro 3 (Město duchů): server posílá roli i v broadcastu, protože leží lícem
        // nahoru – cizí karta se proto za letu překlopí a ZŮSTANE ležet na stole svého
        // hráče (placedCards), přesně na slotu, kde ji pak kreslí deska.
        if (!isMine && data.role) {
            _introPlacePublicRole(toIdx, data.role);
        } else if (!isMine) {
            // Karta se cestou natočí do orientace hráče a hned pokračuje ZA okraj
            // jeviště (bere si ji do ruky) – dřív se bez otočení rozplynula na sedačce.
            _introDealRoleAway(toIdx, myIdx, _introState.playerCount);
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
            }, INTRO_CHAR_DEAL_GAP);
        }
        _introState.charCount = Math.max(0, _introState.charCount - 2);
        renderUI();
        // Poslednímu hráči je rozdáno → nerozdaný zbytek balíčku postav odletí ze stolu
        // (ne až si všichni vyberou). Čeká se na dolet poslední dvojice: moje karty letí
        // nejdél (překlopení 560 ms + rozestup mezi levou a pravou).
        const _dealOrder = _introState.dealCharOrder || [];
        if (_dealOrder.length && data.step === _dealOrder.length - 1) {
            setTimeout(() => _introFlyAwayCharDeck(), INTRO_CHAR_DEAL_GAP + 560 + 140);
        }
    }

    else if (sub === 'chars_slide_in') {
        _introState.sub = 'chars_slide_in';
        _introState.allCharsChosen = true;
        _introState.myCharChoices = null;
        _introState.myCharSelected = null;
        _introState.myCharPreselect = null;
        // Pojistka: zbytek balíčku postav už normálně odletěl po rozdání poslední
        // dvojice (char_cards_fly). Když se ten beat ztratil, odletí aspoň teď –
        // s prázdným balíčkem (8 hráčů bez rozšíření) je to jen renderUI().
        _introFlyAwayCharDeck();
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
                            { tex: 'lives', x: livesEndX, y: livesEndY, scale: oppScale, angle, depth: 21,
                              key: 'lives:' + idx, rl: { kind: 'oppLives', idx, hp: health } }
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
                                { tex: charTex, x: charEndX, y: charEndY, scale: oppScale, angle, depth: 23,
                                  key: 'char:' + idx, rl: { kind: 'oppChar', idx, hp: health } }
                            );
                            _introState.placedCards.push(
                                { text: p.name, x: NAME_X, y: NAME_Y, style: OPP_NAME_STYLE, depth: 50,
                                  key: 'name:' + idx, rl: { kind: 'oppName', idx, hp: health } }
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
                                { tex: 'sheriff_star', x: starEndX, y: starEndY, scale: starScale, angle, depth: 24,
                                  key: 'star:' + idx, rl: { kind: 'oppStar', idx, hp: health } }
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
                    text: state.players[myIndex].name,
                    x: MY_ROLE_X(), y: MY_ROLE_Y() + currentLayout().myNameOffY, depth: 50,
                    key: 'name:' + myIndex, rl: { kind: 'myName' },
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

    // Rozšíření High Noon / A Fistful of Cards, 1. beat: balíček leží kompletní a šerif
    // z něj sejme vrchní kartu (Pravé poledne / Fistful of Cards). Ta jen kousek přelétne
    // vedle, otočí se lícem nahoru a zůstane ležet ve stejné velikosti jako balíčky, ať
    // je vidět, která karta se míchat nebude.
    // Oba balíčky mají STEJNÉ beaty a jedou za sebou (server/intro.js) – `which` říká,
    // o který jde, zbytek popisuje introEventCfg (view/intro.js).
    else if (sub === 'highnoon_top' || sub === 'fistful_top') {
        const which = sub === 'fistful_top' ? 'ff' : 'hn';
        const C = introEventCfg(which);
        const count = data.ffCount ?? data.hnCount ?? 0;
        const cards = gameScene?.cache.json.get(C.json) || [];
        const last = cards.find(c => c.key === C.lastKey);
        const tex = last ? C.pre + last.art : null;
        _introState[which + 'Total'] = count;
        if (!gameScene || !tex) {
            _introState[which + 'Count'] = Math.max(0, count - 1);
            _introState[which + 'AsideTex'] = tex;
            renderUI();
        } else {
            // Karta z balíčku odchází HNED se startem letu (jinak by rub zůstal ležet pod ní).
            _introState[which + 'Count'] = Math.max(0, count - 1);
            renderUI();
            _introAnimCardFlip(C.deck.x, C.deck.y, C.aside.x, C.aside.y,
                C.back, tex, 620,
                () => { if (_introState) { _introState[which + 'AsideTex'] = tex; renderUI(); } },
                0, 0.30);
        }
    }

    // 2. beat: šerif zamíchá zbytek balíčku událostí odděleně od hracích karet. Odložená
    // karta leží po celou dobu vedle (aby bylo vidět, že se nemíchá).
    else if (sub === 'shuffle_highnoon' || sub === 'shuffle_fistful') {
        const which = sub === 'shuffle_fistful' ? 'ff' : 'hn';
        const C = introEventCfg(which);
        const count = data.ffCount ?? data.hnCount ?? 0;
        _introState[which + 'Count'] = 0;        // hromádku zastupuje míchací animace
        _introState[which + 'Total'] = count;
        _introState.shuffleAnimDone = false;
        _clearIntroSprites();
        if (gameScene) {
            _animateIntroShuffle(
                C.deck.x, C.deck.y,
                C.back, 0.30,
                Math.max(1, count - 1), true,   // bez odložené karty
                null,
                () => {
                    if (!_introState) return;
                    _introState.shuffleAnimDone = true;
                    _introState[which + 'Count'] = Math.max(0, (_introState[which + 'Total'] || 1) - 1);
                    renderUI();
                }
            );
        }
        renderUI();
    }

    // 3. beat: odložená karta se překlopí na rub a sjede pod zamíchanou hromádku (bude se
    // líznout jako poslední). Od téhle chvíle má balíček plný počet karet.
    else if (sub === 'highnoon_bottom' || sub === 'fistful_bottom') {
        const which = sub === 'fistful_bottom' ? 'ff' : 'hn';
        const C = introEventCfg(which);
        const tex = _introState?.[which + 'AsideTex'];
        _introState[which + 'AsideTex'] = null;
        const _hnBottomDone = () => {
            if (!_introState) return;
            _introState[which + 'Count'] = _introState[which + 'Total'] || 0;
            renderUI();
        };
        if (gameScene && tex) {
            // Karta patří na SPODEK balíčku (líže se jako poslední), takže se ve dvou
            // krocích: 1) překlopí se na rub a doletí POD hromádku, 2) zespodu se do ní
            // zasune s hloubkou POD statickými vrstvami. Bez druhého kroku dosedala
            // rovnou na místo balíčku s depth 800 (tj. nad hromádkou) a vypadalo to,
            // že ji šerif dává navrch.
            // Doletí ÚPLNĚ pod balíček – karta je 150 px vysoká (0,30 × 500), takže se
            // s hromádkou nesmí krýt ani horním okrajem, jinak to vypadá, že ji šerif
            // dává doprostřed. Teprve odtud se do balíčku zespodu zasune.
            const underY = C.deck.y + 500 * 0.30 + 24;
            _introAnimCardFlip(C.aside.x, C.aside.y, C.deck.x, underY,
                tex, C.back, 560,
                () => {
                    if (!gameScene) { _hnBottomDone(); return; }
                    const hnTex = gameScene.textures.exists(C.back) ? C.back : 'card_back';
                    // depth 5 = pod statickou hromádkou (_drawIntroStack kreslí od depth 10).
                    const sp = gameScene.add.image(C.deck.x, underY, hnTex)
                        .setScale(0.30).setDepth(5);
                    if (gameScene.introSprites) gameScene.introSprites.add(sp);
                    gameScene.tweens.add({
                        targets: sp, y: C.deck.y + 1.5, duration: 540, ease: 'Cubic.easeInOut',
                        onComplete: () => { if (sp.active) sp.destroy(); _hnBottomDone(); }
                    });
                },
                0, 0.30);   // odložená karta už je ve velikosti balíčku – žádné zmenšování
        } else if (_introState) {
            _introState[which + 'Count'] = _introState[which + 'Total'] || 0;
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
            // Shodné s herním renderem (drawMyArea): první slot stolu = roleX − boardCardW.
            const _cp = _introColtPos();
            const coltScale = _cp.scale;
            const coltX = _cp.x;   // 723
            const coltY = _cp.y;   // 970
            const colt = gameScene.add.image(coltX, coltY, 'colt_.45')
                .setScale(coltScale).setAlpha(0).setDepth(24);
            if (gameScene.introSprites) gameScene.introSprites.add(colt);
            gameScene.tweens.add({
                targets: colt, alpha: 1, duration: 500, ease: 'Power2',
                onComplete: () => {
                    if (colt?.active) colt.destroy();
                    if (_introState) _introState.placedCards.push(
                        { tex: 'colt_.45', x: coltX, y: coltY, scale: coltScale, depth: 24,
                          key: 'colt', rl: { kind: 'colt' } }
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
                        { tex, x: rest.x, y: rest.y, scale: rest.scale, angle: rest.angle, depth: 24,
                          rl: { kind: 'hand', idx: toIdx, slot: i, count: data.count } }
                    );
                    renderUI();
                };
                // Karta vzlétá ve velikosti balíčku a za letu doroste/zmenší se na
                // velikost ruky příjemce (na mobilu je moje ruka větší a vějíř soupeře
                // menší než balíček – bez toho karta „poskočila" hned na startu).
                const dealFrom = currentLayout().scaleDeck;
                if (toIdx === myIdx) {
                    const cid = _introState.myHandCards?.[i];
                    const faceTex = (cid !== undefined && gameScene.textures.exists('card_' + cid))
                        ? 'card_' + cid : 'card_back';
                    _introAnimCardFlip(INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y, rest.x, rest.y,
                        'card_back', faceTex, 320, place(faceTex), rest.angle, rest.scale,
                        { startScale: dealFrom, endScale: rest.scale });
                } else {
                    _introAnimCard(INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y, rest.x, rest.y,
                        'card_back', 320, place('card_back'), rest.angle, rest.scale, dealFrom);
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
                        const _deckN = _introState.deckCount || 0;
                        const layers = shuffleLayers(_deckN);
                        const pxPerCard = INTRO_PILE_PX;   // tenčí hromádka jako herní/intro balíček
                        // Vrch se počítá ze SKUTEČNÉHO počtu (jako drawDrawPiles) – jinak
                        // by balíček s rozšířeními (>80 karet) po přechodu do hry poskočil.
                        const topY = _introStackTopY(INTRO_PLAY_DECK.y, _deckN);
                        const movers = [];
                        for (let k = layers - 1; k >= 0; k--) {
                            // Nejvyšší karta (k=0) navrchu – shodně se statickým balíčkem.
                            const img = gameScene.add.image(
                                INTRO_PLAY_DECK.x, topY + k * pxPerCard, 'card_back')
                                .setScale(0.30).setDepth(100 + (layers - 1 - k));
                            if (gameScene.introSprites) gameScene.introSprites.add(img);
                            movers.push(img);
                        }
                        // Balíčky událostí (High Noon, Fistful of Cards) jedou na své herní
                        // pozice zároveň s hracím balíčkem. Při obou zapnutých rozšířeních
                        // se srovnají nad sebe, takže se mění i y (eventSlot v game.js).
                        // `on` se bere z intro počtů: stav hry ještě žádné karty nemá.
                        const _evOn = { hn: (_introState.hnCount || 0) > 0,
                                        ff: (_introState.ffCount || 0) > 0 };
                        const evMovers = (which, from, count, texKey) => {
                            const n = count || 0;
                            const layers = n > 0 ? shuffleLayers(n) : 0;
                            const slot = layers > 0 ? eventSlot(which, _evOn) : null;
                            if (!slot) return;
                            _introState[which + 'Moving'] = true;
                            const topY = _introStackTopY(from.y, n);
                            const tex = gameScene.textures.exists(texKey) ? texKey : 'card_back';
                            const sprites = [];
                            for (let k = layers - 1; k >= 0; k--) {
                                const img = gameScene.add.image(from.x, topY + k * pxPerCard, tex)
                                    .setScale(0.30).setDepth(100 + (layers - 1 - k));
                                if (gameScene.introSprites) gameScene.introSprites.add(img);
                                sprites.push(img);
                            }
                            // y relativně: každá vrstva hromádky má vlastní výšku.
                            gameScene.tweens.add({
                                targets: sprites, x: slot.deckX, y: `+=${slot.y - from.y}`,
                                duration: 600, ease: 'Power2.easeInOut'
                            });
                        };
                        evMovers('hn', INTRO_HN_DECK, _introState.hnCount, 'hn_back');
                        evMovers('ff', INTRO_FF_DECK, _introState.ffCount, 'ff_back');
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
        // Deska se vykreslí až s room_update, který jde frontou animací – kdyby se
        // zaparkované intro sprity (balíčky na herní pozici) uklidily hned, byla by
        // mezi tím na jejich místě díra a přechod do hry viditelně blikl. Leží přesně
        // tam, kam je kreslí deska, takže se o pár set ms navíc nic nepozná.
        _introState = null;
        const _tok = ++App.introDoneToken;
        setTimeout(() => { if (App.introDoneToken === _tok) _clearIntroSprites(); }, 600);
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



// ── CINEMATIKA VYŘAZENÍ HRÁČE ─────────────────────────────────────────────────
// Celý sled a jeho časování je v core/deathAnim.js (sdílené se serverem, který o tu
// dobu pozdrží boty – nikdo nesmí hrát „přes" odhalení role).
// Pozice odletu zachytíme HNED na začátku: stav je v tu chvíli ještě „živý"
// (card_animation dorazí před room_update a fronta animací ho drží až do konce
// sekvence), takže karty odlétají přesně z míst, kde ležely. Pořadí odhozu: modré od
// nejnovější po nejstarší, zbraň jako poslední modrá (jen Colt → rozplyne se na
// místě), pak karty z ruky od nejvyššího slotu.
const _DEATH_STAGGER = DEATH_ANIM.staggerMs;

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
    const L = currentLayout();
    return (playerIdx === (myIndex === null ? 0 : myIndex))
        ? L.scaleMe : oppScale(L, (state?.players?.length || 2) - 1);
}
// Karta v RUCE daného hráče. Na desktopu vychází stejně jako _renderSideScale (vějíř
// má měřítko vyložených karet), u kompaktní řady soupeřů na mobilu je vějíř menší.
function _renderHandScale(playerIdx) {
    const L = currentLayout();
    return handCardScale(L, (state?.players?.length || 2) - 1,
        playerIdx === (myIndex === null ? 0 : myIndex));
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
        seq.push({ kind: 'hand', id: hand[h].id, slot: h, from: getHandSlotPos(pid, h, hand.length) });
    }
    return seq;
}

// Karta se ve chvíli, kdy ji zvedne animace, přestane u hráče kreslit – ale její
// místo zůstane obsazené, takže se ruka ani stůl pod ní nepřeskládají. Modré/zbraň
// se skrývají podle ID (stejná cesta jako u Paniky/Cat Balou), karty z ruky podle
// SLOTU (ruby soupeřů žádné ID nemají). Colt .45 nemá ID → vlastní klíč '_colt'.
function _deathHideSource(pid, it) {
    if (it.kind === 'hand') {
        (App.deathHandHide[pid] || (App.deathHandHide[pid] = new Set())).add(it.slot);
    } else if (it.kind === 'colt') {
        // Colt .45 kreslí jen drawMyArea, tedy VÝHRADNĚ na mém místě. `stealHideIds` je
        // společná pro celou desku, takže při smrti soupeře bez zbraně schovávala MŮJ
        // Colt (na pár vteřin zmizel, než cinematiku uklidil _deathSeqCleanup).
        if (myIndex !== null && pid === myIndex) App.stealHideIds.add('_colt');
    } else if (it.id != null) {
        App.stealHideIds.add(it.id);
    }
}

// Po dojezdu cinematiky ukliď všechno, čím jsme si drželi „mezistav" umírajícího
// hráče. Od téhle chvíle ho kreslí normální stav (mrtvý, s odhalenou rolí).
function _deathSeqCleanup(pid, seq) {
    delete App.deathSeq[pid];
    delete App.deathHandHide[pid];
    App.stealHideIds.delete('_colt');
    seq.forEach(it => { if (it.id != null) App.stealHideIds.delete(it.id); });
    if (gameScene) renderUI();
}

function _fadeOutColt(pos) {
    if (!gameScene) return;
    const spr = gameScene.add.image(pos.x, pos.y, 'colt_.45').setScale(0.4).setDepth(800).setAlpha(0.97);
    gameScene.tweens.add({ targets: spr, alpha: 0, duration: 400, ease: 'Quad.easeIn',
        onComplete: () => { if (spr.active) spr.destroy(); } });
}

// Jeden let do odhozu: já vidím vše lícem, modré vidí lícem všichni (bez otáčení),
// karty z ruky se ostatním za letu odhalí (rub→líc).
function _deathFlyToDiscard(it, o) {
    const { isMine, ang, discard } = o;
    const sc = it.kind === 'hand' ? o.scHand : o.sc;   // z vějíře ruky vs. ze stolu
    // Kartu na vrcholu odhozu odkryj AŽ když už opravdu je ve stavu odhozu, a letící
    // sprite do té chvíle drž na místě (holdUntil) – jinak po jeho zániku problikne
    // předchozí vrchní karta, než dorazí room_update (dřív se odkrývalo dávkově pozdě).
    const reveal = () => { if (it.id != null) { App.deathDiscardHideIds.delete(it.id); if (gameScene) renderUI(); } };
    const hold = () => (state?.deck?.discardPile || []).some(c => c.id === it.id);
    if (isMine || it.kind !== 'hand') {
        // Znám líc (moje karty / veřejné modré+zbraň) → jen letí do odhozu,
        // z orientace hráče do 0° a z velikosti na stole (0.36/0.27) na 0.3.
        // exactAngle: karta letí LÍCEM nahoru, takže 0° ≠ 180° – u protějšího hráče by ji
        // nearestCardAngle „srovnal" na 180° (rotace by se vůbec nespustila) a modré karty
        // (typicky Vězení) by dosedly do odhozu vzhůru nohama.
        animateCard(it.from.x, it.from.y, discard.x, discard.y, getCardTex(it.id), 380, reveal,
            { startAngle: ang, endAngle: 0, exactAngle: true, startScale: sc, endScale: 0.3, holdUntil: hold });
    } else {
        // Cizí karta z ruky se za letu odhalí (rub→líc) – stejně jako běžný odhoz z ruky.
        animateCardFlip(it.from.x, it.from.y, discard.x, discard.y, 'card_back', getCardTex(it.id),
            { flip: true, startAngle: ang, endAngle: 0, startScale: sc, endScale: 0.3, duration: 400, onComplete: reveal, holdUntil: hold });
    }
}

// Smrt s Vulture Samem → karty letí do JEHO ruky (ne do odhozu). Otáčení rub/líc
// podle toho, kdo kartu uvidí v jeho ruce lícem (jen Sam) vs rubem (ostatní):
//  modré – Sam lícem (bez otáčení), já i ostatní líc→rub; karty z ruky – Sam rub→líc,
//  já líc→rub, ostatní zůstávají rubem. Sam má nové karty v ruce zhratované
//  (pendingDrawIds), dokud nedoletí; sprite pak ještě leží na jeho ruce, dokud kartu
//  nepotvrdí stav (ten dorazí až po celé cinematice odhalení role – holdTries).
//
// Každá karta míří na SVŮJ finální slot v Samově vějíři (ne všechny na jeden bod jako
// dřív) – karty se tak u něj vrší jedna po druhé, jak odlétají, místo aby se celý balík
// „objevil naráz" až s příchodem stavu. Zároveň se cestou dotočí z orientace mrtvého do
// orientace Samova místa (u protějšího hráče o 180°) a přeškáluje z jeho velikosti karet
// na Samovu – bez toho karty dosedaly placaté a v cizí velikosti.
// `n` = pořadí PŘENÁŠENÉ karty (Colt .45 se nepřenáší, ten se rozplyne na místě).
function _deathFlyToVulture(it, o, n) {
    const { isMine, isVulture, vid, baseLen, incoming, ang, sc, scHand, holdTries } = o;
    const fc = getCardTex(it.id);
    const endAngle = _renderSideAngle(vid);
    // Pozor: divák kreslí i spodního hráče v soupeřově měřítku (drawSpectatorPlayer),
    // proto ne _renderHandScale – ta by mu pro seat 0 vrátila měřítko mojí ruky.
    const endScale = handCardScale(currentLayout(), (state?.players?.length || 2) - 1,
        myIndex !== null && vid === myIndex);
    const startScale = it.kind === 'hand' ? scHand : sc;   // z vějíře ruky vs. ze stolu
    const to = getHandSlotPos(vid, baseLen + n, baseLen + incoming);
    // Karta se u Sama odkryje PŘESNĚ při dosednutí spritu: v jeho ruce už leží (nastavil ji
    // _vultureStageIncoming), jen byla schovaná – Samovi přes pendingDrawIds, ostatním přes
    // oppHandHideCount. Vějíř je proto od začátku rozložený na finální počet.
    const done = () => {
        if (it.id == null) return;
        if (isVulture) App.pendingDrawIds.delete(it.id);
        else if (App.oppHandHideCount) App.oppHandHideCount[vid] = Math.max(0, (App.oppHandHideCount[vid] || 1) - 1);
        renderUI();
    };
    // Sam pozná svou kartu podle ID; ostatní vidí jen rub, takže jim stačí, že Samovi
    // v ruce přibyl odpovídající počet karet (délka ruky je veřejná).
    const hold = isVulture
        ? () => (state?.players?.[vid]?.hand || []).some(c => c.id === it.id)
        : () => (state?.players?.[vid]?.hand?.length || 0) >= baseLen + n + 1;
    const geo = { startAngle: ang, endAngle, startScale, endScale, duration: 420, holdUntil: hold, holdTries };
    if (it.kind === 'hand') {
        if (isVulture)      animateCardFlip(it.from.x, it.from.y, to.x, to.y, 'card_back', fc, { ...geo, flip: true, onComplete: done });
        else if (isMine)    animateCardFlip(it.from.x, it.from.y, to.x, to.y, 'card_back', fc, { ...geo, flip: true, reverse: true, onComplete: done });
        // Cizí rub → cizí rub: jen doletí a dotočí se do Samovy orientace (exactAngle,
        // ať se u protějšího hráče opravdu otočí a nesrovná se na 0°).
        else                animateCard(it.from.x, it.from.y, to.x, to.y, 'card_back', 420, done, { ...geo, exactAngle: true });
    } else {
        if (isVulture)      animateCard(it.from.x, it.from.y, to.x, to.y, fc, 420, done, { ...geo, exactAngle: true });
        else                animateCardFlip(it.from.x, it.from.y, to.x, to.y, 'card_back', fc, { ...geo, flip: true, reverse: true, onComplete: done });
    }
}

// Sam si karty vyřazeného BERE: vlož mu je do ruky hned na začátku cinematiky, ale drž je
// skryté, dokud k němu jedna po druhé nedoletí. Bez toho mířily letící karty na sloty
// FINÁLNÍHO vějíře, zatímco se ruka pořád kreslila po starém (o karty kratší) – dosedly
// tak namačkané na sebe (vypadaly „nějak divně malé") a do pořádného vějíře se srovnaly
// až s příchodem stavu na konci cinematiky.
function _vultureStageIncoming(pid, flyCtx, seq) {
    const vid = flyCtx.vid;
    const hand = state?.players?.[vid]?.hand;
    const dead = state?.players?.[pid];
    // Skutečné objekty karet (ne jen ID) – po odkrytí je ruka normálně vykreslí.
    const cardOf = (id) => dead?.hand?.find(c => c.id === id) || dead?.board?.find(c => c.id === id)
                        || (dead?.weapon?.id === id ? dead.weapon : null) || { id };
    let staged = 0;
    seq.forEach(it => {
        if (it.id == null) return;
        if (flyCtx.isVulture) App.pendingDrawIds.add(it.id);
        if (!hand || hand.some(c => c.id === it.id)) return;
        hand.push(cardOf(it.id));
        staged++;
    });
    if (!flyCtx.isVulture && staged) {
        App.oppHandHideCount = App.oppHandHideCount || {};
        App.oppHandHideCount[vid] = (App.oppHandHideCount[vid] || 0) + staged;
    }
}

// ── Odhalení role uprostřed obrazovky ────────────────────────────────────────
// Rubová karta role vyletí zpoza okraje stolu u mrtvého hráče doprostřed jako VELKÁ
// karta (stejná velikost jako reveal role v intru), chvíli je vidět rubem, překlopí
// se (= odhalení, co to bylo za hráče), zůstane všem na očích a nakonec se zmenší
// a odletí na své místo vedle mrtvého. Sprite žije MIMO cardsSprites (přežije
// překreslení desky) a nad všemi kartami. Textury rolí bere z RoleImages (game.js).

// Odkud karta vyletí: zpoza okraje jeviště u mrtvého hráče (tedy mimo viditelnou
// plochu i při širším poměru stran), ať je vidět, že přichází od NĚJ.
function _deathRoleStartPos(pid) {
    const view = myIndex === null ? 0 : myIndex;
    const total = state?.players?.length || 0;
    const anchor = pid === view ? null : getOpponentAnchors(total)[((pid - view + total) % total) - 1];
    if (!anchor) return { x: 960, y: stageBottom() + 320 };   // spodní hráč (já / divákova nula)
    if (anchor.side === 'left')  return { x: stageLeft() - 280, y: anchor.y };
    if (anchor.side === 'right') return { x: stageRight() + 280, y: anchor.y };
    return { x: anchor.x, y: stageTop() - 320 };               // 'top'
}

// Velikost, ve které karta role u hráče leží. Pozor: divák kreslí i spodního hráče
// v soupeřově měřítku (drawSpectatorPlayer), proto ne _renderSideScale.
function _deathRoleEndScale(pid) {
    const L = currentLayout();
    return (myIndex !== null && pid === myIndex)
        ? L.scaleMe : oppScale(L, (state?.players?.length || 2) - 1);
}

// `role` chodí v datech animace, ne ze stavu: stav se aplikuje až ZA celou cinematikou
// (fronta animací), takže tady je vyřazený hráč ještě „živý" a jeho roli server ve stavu
// schovává (redactState v server/rooms.js). Fallback na stav drží starší cesty a debug hru.
function _deathRoleReveal(pid, onDone, role) {
    const player = state?.players?.[pid];
    if (!gameScene || !player) { if (onDone) onDone(); return; }
    const D = DEATH_ANIM;
    const BIG = 0.80, CX = 960, CY = 480;
    const from = _deathRoleStartPos(pid);
    const startAngle = _renderSideAngle(pid);
    const faceTex = RoleImages[role || player.role] || 'role_001';
    const spr = gameScene.add.image(from.x, from.y, 'role_card_back')
        .setScale(oppScale(currentLayout(), (state?.players?.length || 2) - 1))
        .setAngle(startAngle).setDepth(900).setAlpha(0.97);
    const finish = () => { if (spr.active) spr.destroy(); if (onDone) onDone(); };

    // 1) nálet doprostřed: cestou se zvětší a dotočí do čitelné polohy. Otáčení bez
    //    180° symetrie (nearestAngle360) – od horního hráče se musí opravdu otočit.
    gameScene.tweens.add({ targets: spr, x: CX, y: CY, duration: D.flyMs, ease: 'Power2' });
    gameScene.tweens.add({ targets: spr, scaleX: BIG, scaleY: BIG, duration: D.flyMs, ease: 'Power2' });
    if (startAngle !== 0) {
        gameScene.tweens.add({ targets: spr, angle: nearestAngle360(startAngle, 0), duration: D.flyMs, ease: 'Power2' });
    }

    // 2) rub chvíli drží, pak překlopení rub→líc (scaleX na nulu, výměna textury, zpět).
    gameScene.time.delayedCall(D.flyMs + D.holdBackMs, () => {
        if (!spr.active) return;
        gameScene.tweens.add({
            targets: spr, scaleX: 0, duration: D.flipMs / 2, ease: 'Sine.easeIn',
            onComplete: () => {
                if (!spr.active) return;
                spr.setTexture(faceTex);
                gameScene.tweens.add({ targets: spr, scaleX: BIG, duration: D.flipMs / 2, ease: 'Sine.easeOut' });
            }
        });
    });

    // 3) odhalená role zůstane všem na očích, pak se zmenší a odletí na své místo.
    gameScene.time.delayedCall(D.flyMs + D.holdBackMs + D.flipMs + D.holdFaceMs, () => {
        if (!spr.active) { if (onDone) onDone(); return; }
        const to = getDeadRoleCardPos(pid);
        const end = _deathRoleEndScale(pid);
        gameScene.tweens.add({ targets: spr, x: to.x, y: to.y, duration: D.toSlotMs, ease: 'Power2', onComplete: finish });
        gameScene.tweens.add({ targets: spr, scaleX: end, scaleY: end, duration: D.toSlotMs, ease: 'Power2' });
        if (startAngle !== 0) {
            gameScene.tweens.add({ targets: spr, angle: nearestAngle360(0, startAngle), duration: D.toSlotMs, ease: 'Power2' });
        }
    });
}

// ── Celá cinematika vyřazení (sled a časování viz core/deathAnim.js) ─────────
function playDeathSequence(data) {
    const isVulture = data.type === 'vulture_sam_steal';
    const pid = isVulture ? data.fromPlayerIdx : data.playerIdx;
    const p = state?.players?.[pid];
    if (!gameScene || !p) return;
    const isMine = pid === myIndex;   // umírám já → odhalení role nevidím, jen čekám

    // Pozice/orientace zachyť TEĎ, dokud je stav ještě „živý" (viz komentář výše).
    const seq = _deathCardSeq(pid, data.blue || [], data.weapon || null, data.hand || []);
    // Šerifovu roli zná celý stůl od začátku → neodhaluje se. Sekvence končí odhozením
    // karet (pak už jen doběhne hra). Ve hře pro 3 (Město duchů) leží lícem nahoru role
    // všech, takže se neodhaluje nikdo. Server počítá stejně (server/anim.js).
    const skipReveal = !!state?.mode3p || (data.role || p.role) === 'Sheriff';
    const T = deathAnimTimeline(seq.length, skipReveal);
    // Vulture Sam: karty míří na FINÁLNÍ sloty jeho vějíře, takže potřebujeme, kolik jich
    // v ruce má teď (baseLen) a kolik jich přiletí (incoming – Colt .45 se nepřenáší).
    const flyCtx = isVulture
        ? { isMine, isVulture: data.toPlayerIdx === myIndex, vid: data.toPlayerIdx,
            ang: _renderSideAngle(pid), sc: _renderSideScale(pid), scHand: _renderHandScale(pid),
            baseLen: state?.players?.[data.toPlayerIdx]?.hand?.length ?? 0,
            incoming: seq.filter(s => s.kind !== 'colt').length,
            holdTries: Math.ceil(T.total / 16) }
        : { isMine, ang: _renderSideAngle(pid), sc: _renderSideScale(pid),
            scHand: _renderHandScale(pid), discard: discardTopPos() };

    // Po celou sekvenci nikdo nehraje: klik je zamčený, nový stav čeká ve frontě
    // animací a boti stojí na serveru (room._deathBlockUntil).
    App.blockInput = true;
    App.deathSeq[pid] = 'dying';
    App.deathHandHide[pid] = new Set();
    if (isVulture) _vultureStageIncoming(pid, flyCtx, seq);
    else seq.forEach(it => { if (it.id != null) App.deathDiscardHideIds.add(it.id); });

    // 1) Postava klesne po kartě životů na nulu – stejný posun jako u každého zásahu.
    App.healthAnims[pid] = { fromHealth: Math.max(1, p.health) };
    p.health = 0;
    renderUI();

    // 2) Po pauze odlétají karty jedna po druhé a KAŽDÁ u hráče zmizí ve chvíli, kdy
    //    ji zvedne animace (ne až všechny naráz s novým stavem).
    // `moved` = pořadí PŘENÁŠENÉ karty (Colt .45 se nepřenáší) → slot v Samově vějíři.
    let moved = 0;
    seq.forEach((it, k) => {
        const myMoved = it.kind === 'colt' ? -1 : moved++;
        setTimeout(() => {
            if (!gameScene) return;
            App.deathSeq[pid] = 'discarding';
            _deathHideSource(pid, it);
            renderUI();
            if (it.kind === 'colt') { if (isMine) _fadeOutColt(it.from); return; }
            if (isVulture) _deathFlyToVulture(it, flyCtx, myMoved);
            else _deathFlyToDiscard(it, flyCtx);
        }, T.cards + k * _DEATH_STAGGER);
    });

    // 3) Ruka i stůl jsou prázdné → postava doklouže vedle místa pro kartu role.
    //    Slot je rezervovaný, ale karta v něm ještě není (letí doprostřed obrazovky).
    setTimeout(() => {
        const dp = state?.players?.[pid];
        if (!gameScene || !dp) return;
        dp.hand = [];
        dp.board = [];
        dp.weapon = { id: -1, name: 'Colt .45', type: 'Zbraň', props: { range: 1 } };
        // Roli zapiš do stavu UŽ TEĎ (chodí v datech animace – ve stavu je do konce
        // cinematiky schovaná, viz redactState). Karta role se v téhle fázi ještě nekreslí
        // (letí doprostřed obrazovky), ale ve chvíli, kdy dosedne na svůj slot, ji deska
        // musí umět nakreslit správně. Bez toho tam do příchodu stavu (o pár set ms
        // později) svítil fallback – tedy bandita, ať měl mrtvý roli jakoukoli.
        if (data.role) dp.role = data.role;
        App.deathSeq[pid] = 'settled';
        delete App.deathHandHide[pid];
        renderUI();
    }, T.settle);

    // 4) Odhalení role všem ostatním (kdo umřel, ten jen čeká). U šerifa odpadá.
    if (!skipReveal) {
        setTimeout(() => {
            if (isMine) return;
            _deathRoleReveal(pid, () => _deathSeqCleanup(pid, seq), data.role);
        }, T.fly);
    }

    // Pojistka: ať se stane cokoli (scéna zmizí, tween se ztratí), po dojezdu sekvence
    // musí být deska zase v normálním stavu – nic skrytého, nic rozanimovaného.
    setTimeout(() => {
        seq.forEach(it => {
            if (it.id == null) return;
            App.deathDiscardHideIds.delete(it.id);
            App.pendingDrawIds.delete(it.id);
        });
        // Karty nastagované Samovi (viz _vultureStageIncoming) musí být odkryté i tehdy,
        // když se některá animace ztratila – jinak by mu ruka zůstala „o karty kratší".
        if (isVulture && !flyCtx.isVulture && App.oppHandHideCount) App.oppHandHideCount[flyCtx.vid] = 0;
        _deathSeqCleanup(pid, seq);
    }, T.total + 150);
}

// ── Dělení karet mezi víc Vulture Samů ───────────────────────────────────────
// Karty mrtvého si rozeberou Samové (Vulture Sam + Vera Custer, která ho kopíruje),
// takže cinematika vyřazení se rozpadne na dva kusy:
//   1) 'vulture_split_death' – postava klesne na nulu, ale KARTY ZŮSTANOU ležet
//      (rozebírají se pak po jedné, každá vlastní animací ragtime_steal),
//   2) 'player_death_reveal' – po rozdělení se místo uklidí a odhalí se role.
function playVultureSplitDeath(data) {
    const pid = data.playerIdx;
    const p = state?.players?.[pid];
    if (!gameScene || !p) return;
    App.blockInput = true;
    App.vultureSplitIdx = pid;      // jeho karty se kreslí dál, karta role ještě ne
    App.deathSeq[pid] = 'dying';
    App.healthAnims[pid] = { fromHealth: Math.max(1, p.health) };
    p.health = 0;
    renderUI();
    // Po poklesu na nulu fázi smrti zase pusť – dál už se jen vybírá (a vybírat může
    // i tenhle klient), takže deska nesmí zůstat zamčená cinematikou.
    setTimeout(() => {
        if (App.deathSeq[pid] === 'dying') delete App.deathSeq[pid];
        if (gameScene) renderUI();
    }, DEATH_ANIM.healthMs + DEATH_ANIM.pauseMs);
}

// Konec dělení: ruka i stůl mrtvého jsou prázdné, postava doklouže k místu pro kartu
// role a role se odhalí (u šerifa se přeskakuje – zná ji celý stůl).
function playDeathRoleReveal(data) {
    const pid = data.playerIdx;
    const p = state?.players?.[pid];
    App.vultureSplitIdx = null;
    if (!gameScene || !p) return;
    const skipReveal = !!state?.mode3p || (data.role || p.role) === 'Sheriff';
    const isMine = pid === myIndex;   // umírám já → odhalení role nevidím, jen čekám
    App.blockInput = true;
    p.hand = [];
    p.board = [];
    p.weapon = { id: -1, name: 'Colt .45', type: 'Zbraň', props: { range: 1 } };
    if (data.role) p.role = data.role;   // viz playDeathSequence: karta role musí dosednout se SPRÁVNOU rolí
    App.deathSeq[pid] = 'settled';
    delete App.deathHandHide[pid];
    renderUI();
    const done = () => { delete App.deathSeq[pid]; if (gameScene) renderUI(); };
    setTimeout(() => {
        if (skipReveal || isMine) { done(); return; }
        _deathRoleReveal(pid, done, data.role);
    }, DEATH_ANIM.settleMs);
}

// ── Šerif zabil pomocníka: přijde o všechny karty ────────────────────────────
// Vizuálně TOTÉŽ odhazování jako při vyřazení (karty odlétají po jedné do odhozu a
// u hráče mizí ve chvíli, kdy je zvedne animace), ale hráč žije dál: žádný pokles
// životů, žádné odhalení role – a Colt .45 mu zůstává (ze sekvence ho vyhodíme).
// Časování drží core/deathAnim.js (penaltyDiscardMs), server o tu dobu čeká s boty.
function playSheriffPenaltyDiscard(data) {
    const pid = data.playerIdx;
    const p = state?.players?.[pid];
    if (!gameScene || !p) return;
    const seq = _deathCardSeq(pid, data.blue || [], data.weapon || null, data.hand || [])
        .filter(it => it.kind !== 'colt');
    if (!seq.length) return;
    const flyCtx = { isMine: pid === myIndex, ang: _renderSideAngle(pid),
                     sc: _renderSideScale(pid), scHand: _renderHandScale(pid), discard: discardTopPos() };

    App.blockInput = true;
    App.deathHandHide[pid] = new Set();
    seq.forEach(it => { if (it.id != null) App.deathDiscardHideIds.add(it.id); });
    renderUI();

    seq.forEach((it, k) => {
        setTimeout(() => {
            if (!gameScene) return;
            _deathHideSource(pid, it);
            renderUI();
            _deathFlyToDiscard(it, flyCtx);
        }, DEATH_ANIM.pauseMs + k * _DEATH_STAGGER);
    });

    // Pojistka po dojezdu: nic skrytého, nic rozanimovaného. Uklidit se ale smí až
    // s PŘÍCHODEM STAVU – ten kartu teprve odebere ze stolu/ruky. U šerifovy pokuty
    // dorazí hned za animací, u ducha (Město duchů) za ní stojí ve frontě ještě odkrytí
    // karty High Noon (~7 s): kdyby se pojistka spustila natvrdo po animaci, odložené
    // karty by se na tu dobu vrátily na stůl a zmizely by až během odkrývání události.
    const cleanup = () => {
        delete App.deathHandHide[pid];
        seq.forEach(it => {
            if (it.id == null) return;
            App.deathDiscardHideIds.delete(it.id);
            App.stealHideIds.delete(it.id);
        });
        if (gameScene) renderUI();
    };
    let waits = 0;
    const armCleanup = (ms) => setTimeout(() => {
        if (animQueueBusy() && ++waits < 80) { armCleanup(200); return; }
        cleanup();
    }, ms);
    armCleanup(penaltyDiscardMs(seq.length) + 150);
}

// ── High Noon (přibalené) – Nová identita ────────────────────────────────────
// Odložená postava leží lícem dolů PŘÍMO jako karta životů (rub karty postavy =
// počítadlo životů) – žádná druhá karta se nekreslí. Na začátku tahu tahle karta
// vyletí doprostřed, překlopí se a hráč se rozhodne
// (tlačítka kreslí view/screens.js). Časování drží core/highNoonAnim.js, aby server
// věděl, jak dlouho držet boty.
// Místo mé karty životů čte profil rozložení (na mobilu je jinde než na desktopu);
// funkce, ne konstanty – profil se ustaví až v applyStage.
function NI_MY_X()     { return currentLayout().livesX; }    // 1050
function NI_MY_Y()     { return currentLayout().myBaseY; }   // 970
function NI_MY_SCALE() { return currentLayout().scaleMe; }   // 0.36
const NI_BIG = 0.80;
const NI_CX = 960, NI_CY = 420;

function _niCharTex(charName) {
    const charData = gameScene && gameScene.cache.json.get('characters_data');
    const info = charData && charData.find(c => c.name === charName);
    return (info && gameScene.textures.exists('char_' + info.id)) ? 'char_' + info.id : 'placeholder';
}

// Kde leží karta postavy u mě: posunutá po nábojnicích podle počtu životů (drawMyArea).
function _niMyCharY(health) {
    const bulletH = (500 * NI_MY_SCALE() * 0.93) / 5;
    return NI_MY_Y() - bulletH * Math.max(0, health);
}

function startNewIdentityReveal(charName) {
    if (!gameScene) return;
    App.niReveal = { ready: false, decided: false };
    App.niHideSecond = true;   // karta životů zrovna letí → na svém místě se nekreslí
    renderUI();
    const D = NI_ANIM;
    const spr = gameScene.add.image(NI_MY_X(), NI_MY_Y(), 'lives')
        .setScale(NI_MY_SCALE()).setDepth(900);
    gameScene.tweens.add({ targets: spr, x: NI_CX, y: NI_CY, duration: D.moveMs, ease: 'Power2' });
    gameScene.tweens.add({
        targets: spr, scaleX: NI_BIG, scaleY: NI_BIG, duration: D.moveMs, ease: 'Power2',
        onComplete: () => {
            if (!spr.active) return;
            // Překlopení rub → líc (scaleX na nulu, výměna textury, zpět).
            gameScene.tweens.add({
                targets: spr, scaleX: 0, duration: D.flipMs / 2, ease: 'Sine.easeIn',
                onComplete: () => {
                    if (!spr.active) return;
                    spr.setTexture(_niCharTex(charName));
                    gameScene.tweens.add({
                        targets: spr, scaleX: NI_BIG, duration: D.flipMs / 2, ease: 'Sine.easeOut',
                        onComplete: () => {
                            if (spr.active) spr.destroy();
                            if (App.niReveal) { App.niReveal.ready = true; renderUI(); }
                        }
                    });
                }
            });
        }
    });
}

// Dojezd rozhodnutí. Vidí ho jen ten, kdo se rozhodoval – ostatním se změna projeví
// novým stavem (portrét + posun karty životů řeší runHealthSlide ve view/board.js).
function playNewIdentityResult(data) {
    if (!gameScene || data.playerIdx !== myIndex || myIndex === null) return;
    const D = NI_ANIM;
    const done = () => {
        App.niHideSecond = false; App.niHideChar = false; App.niReveal = null;
        if (gameScene) renderUI();
    };

    if (!data.take) {
        // NE: karta se překlopí zpátky na rub a sjede pod kartu životů.
        const spr = gameScene.add.image(NI_CX, NI_CY, _niCharTex(data.to)).setScale(NI_BIG).setDepth(900);
        gameScene.tweens.add({
            targets: spr, scaleX: 0, duration: D.flipMs / 2, ease: 'Sine.easeIn',
            onComplete: () => {
                if (!spr.active) return;
                spr.setTexture('lives');
                gameScene.tweens.add({
                    targets: spr, scaleX: NI_BIG, duration: D.flipMs / 2, ease: 'Sine.easeOut',
                    onComplete: () => {
                        gameScene.tweens.add({
                            targets: spr, x: NI_MY_X(), y: NI_MY_Y(),
                            scaleX: NI_MY_SCALE(), scaleY: NI_MY_SCALE(),
                            duration: D.moveMs, ease: 'Power2',
                            onComplete: () => { if (spr.active) spr.destroy(); done(); }
                        });
                    }
                });
            }
        });
        return;
    }

    // ANO – dvě fáze za sebou, ať je vidět, že si karty vyměnily role:
    //   1) STARÁ postava se na svém místě překlopí na rub (rub karty postavy = karta
    //      životů) a sjede na slot odložené identity,
    //   2) teprve pak NOVÁ postava sjede ze středu na místo postavy, rovnou na výšku
    //      dvou životů (na kolik hráč výměnou klesl).
    // Nová postava čeká celou 1. fázi zvětšená uprostřed – overlay s tlačítky zmizel
    // hned po kliknutí, takže by tam jinak nebylo nic.
    const bigSpr = gameScene.add.image(NI_CX, NI_CY, _niCharTex(data.to)).setScale(NI_BIG).setDepth(900);
    const flyNewIn = () => {
        if (!gameScene || !bigSpr.active) { done(); return; }
        gameScene.tweens.add({
            targets: bigSpr, x: NI_MY_X(), y: _niMyCharY(2),
            scaleX: NI_MY_SCALE(), scaleY: NI_MY_SCALE(),
            duration: D.moveMs, ease: 'Power2',
            onComplete: () => { if (bigSpr.active) bigSpr.destroy(); done(); }
        });
    };

    const oldY = _niMyCharY(state?.players?.[myIndex]?.health ?? 0);
    App.niHideChar = true;   // starou postavu od teď kreslí jen tenhle sprite
    renderUI();
    const oldSpr = gameScene.add.image(NI_MY_X(), oldY, _niCharTex(data.from))
        .setScale(NI_MY_SCALE()).setDepth(880);
    gameScene.tweens.add({
        targets: oldSpr, scaleX: 0, duration: D.flipMs / 2, ease: 'Sine.easeIn',
        onComplete: () => {
            if (!oldSpr.active) { flyNewIn(); return; }
            oldSpr.setTexture('lives');
            gameScene.tweens.add({
                targets: oldSpr, scaleX: NI_MY_SCALE(), duration: D.flipMs / 2, ease: 'Sine.easeOut',
                onComplete: () => {
                    if (!oldSpr.active) { flyNewIn(); return; }
                    gameScene.tweens.add({
                        targets: oldSpr, y: NI_MY_Y(), duration: D.moveMs, ease: 'Power2',
                        onComplete: () => { if (oldSpr.active) oldSpr.destroy(); flyNewIn(); }
                    });
                }
            });
        }
    });
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
    // aby se stejná karta mohla později do ruky legálně vrátit (Sid Ketchum: discard_to_hand).
    if (cardId != null) {
        App.handFlyHideIds.add(cardId);
        setTimeout(() => App.handFlyHideIds.delete(cardId), 1500);
    }
    const h = state?.players?.[playerIdx]?.hand;
    if (!h) return;
    const k = h.findIndex(c => c.id === cardId);
    if (k !== -1) { h.splice(k, 1); if (gameScene) renderUI(); }
    // Cizí ruka chodí ve stavu zakrytá (redactState v server/rooms.js), takže se karta
    // podle ID najít nedá – vějíř soupeře je stejně jen rub, kde na slotu nezáleží.
    // Bez tohohle by zůstal do příchodu stavu o kartu širší a pak by cuknul.
    else if (playerIdx !== myIndex && h.length && h.every(c => c._placeholder)) {
        h.splice(h.length - 1, 1);
        if (gameScene) renderUI();
    }
}

// Karta braná z RUKY cíle (Panika/Cat Balou/Ragtime/Krytý vůz/dělení mezi Vulture Samy):
// server posílá `stolenIndex` = slot ve vějíři, ze kterého karta odešla (bere se náhodná).
// Vrací { pos, slot } – odkud karta vzlétne a který slot z ruky odebrat, aby se vějíř
// přeskládal hned a správně (u MOJÍ ruky je vidět, která karta zmizela). Bez indexu
// (starší server) padáme na poslední kartu a obecnou kotvu ruky jako dřív.
function _stolenHandSlot(playerIdx, stolenIndex) {
    const hand = state?.players?.[playerIdx]?.hand;
    const len = hand?.length ?? 0;
    if (!len) return { pos: getPlayerHandPos(playerIdx), slot: -1 };
    const known = stolenIndex != null && stolenIndex >= 0 && stolenIndex < len;
    const slot = known ? stolenIndex : len - 1;
    return { pos: getHandSlotPos(playerIdx, slot, len), slot };
}

// Odeber ukradenou/odhozenou kartu z ruky cíle se startem letu (ne až s room_update).
function _removeStolenFromHand(playerIdx, slot) {
    const hand = state?.players?.[playerIdx]?.hand;
    if (!hand?.length) return;
    hand.splice(slot >= 0 && slot < hand.length ? slot : hand.length - 1, 1);
    renderUI();
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
    // Velikost karet na boardu daného hráče: já scaleMe, soupeři scaleOpp (u kompaktní
    // řady na mobilu se dopočítává ze šířky sloupce, proto přes oppScale).
    // area 'hand' = karta leží ve vějíři ruky (u kompaktní řady menší než na stole).
    const sideScale = (playerIdx, area) => (area === 'hand')
        ? _renderHandScale(playerIdx) : _renderSideScale(playerIdx);
    // Velikost karty ležící na balíčku / v odhozu – odtud karty vzlétají a sem dosedají.
    const pileScale = () => currentLayout().scaleDeck;

    // holdUntil predikáty pro letové animace: karta je už ve stavu odhozu / na boardu daného
    // hráče. Letící sprite se drží na cíli, dokud to neplatí (jinak po doletu problikne stará
    // karta na cíli, než dorazí room_update s tou novou).
    const inDiscard = (id) => (state?.deck?.discardPile || []).some(c => c.id === id);
    const onBoardOf = (playerIdx, id) => {
        const p = state?.players?.[playerIdx];
        return !!p && ((p.board || []).some(c => c.id === id) || p.weapon?.id === id);
    };

    switch (data.type) {
        // Lucky Duke si vybral: vybraná karta letí do odhozu první, nevybraná za ní.
        // Teprve pak jde ve frontě výsledek checku (vězení/dynamit) – tak, jak karty
        // ve skutečnosti leží na hromádce odhozu.
        case 'lucky_duke_result':
            playLuckyDukeResult(data.chosenId);
            break;
        // Rozšíření High Noon: šerif odkrývá kartu události. Rub z balíčku vyletí
        // doprostřed obrazovky, zvětší se, překlopí na líc, chvíli tam vydrží (ať ji
        // všichni přečtou) a pak dosedne zmenšený na místo platné karty vedle balíčku.
        // Na cílovém místě pak parkuje, dokud ji stav nemá na hromádce odkrytých.
        case 'high_noon_reveal': {
            const A = HN_ANIM;
            const BIG = 0.8, CX = 960, CY = 540;
            // Stejná cinematika pro oba balíčky událostí – liší se jen místem na stole
            // a prefixem textur (data.deck: 'hn' | 'ff', viz server/anim.js).
            const which = data.deck === 'ff' ? 'ff' : 'hn';
            const prefix = eventTexPrefix(which);
            const slot = eventSlot(which);
            const faceTex = prefix + data.art;
            const backKey = prefix + 'back';
            const backTex = gameScene.textures.exists(backKey) ? backKey : 'card_back';
            // Kartu odkrývá šerif na začátku svého tahu; stav s ním na tahu dorazí až po
            // celé cinematice (fronta), takže hráče na tahu přepneme rovnou teď – jinak
            // po celou dobu odkrývání svítí ten předchozí.
            if (data.playerIdx !== undefined && state) {
                state.currentPlayerIndex = data.playerIdx;
                // Zbylá fáze DISCARD po předchozím hráči (dobíral odhoz nad limit) by
                // novému hráči na tahu obarvila ruku „odhoď kartu" – tah už ale skončil.
                // Žádný přechodový trigger v _applyRoomUpdate se o DISCARD neopírá.
                if (state.phase === 'DISCARD') state.phase = 'PLAY';
                App.blockInput = true;
            }
            if (!gameScene.textures.exists(faceTex) || !slot) { renderUI(); break; }   // art se ještě nedotáhl
            // Balíček událostí musí ubýt HNED se startem animace (karta z něj odchází),
            // ne až se stavem na konci – u poslední karty (Pravé poledne / Fistful of Cards)
            // by jinak zůstal ležet prázdný „poslední rub" po celou cinematiku. Uklidí se
            // po dojezdu.
            if (data.remaining !== undefined) {
                if (which === 'ff') App.ffDeckLeft = data.remaining;
                else App.hnDeckLeft = data.remaining;
            }
            renderUI();

            const spr = gameScene.add.image(slot.deckX, slot.y, backTex)
                .setScale(0.3).setDepth(880);

            // preMs: karta chvíli jen leží (je vidět, kdo je na tahu), teprve pak vyletí.
            gameScene.tweens.add({ targets: spr, x: CX, y: CY, delay: A.preMs, duration: A.flyMs, ease: 'Power2' });
            gameScene.tweens.add({ targets: spr, scaleX: BIG, scaleY: BIG, delay: A.preMs, duration: A.flyMs, ease: 'Power2' });

            gameScene.time.delayedCall(A.preMs + A.flyMs + A.holdBackMs, () => {
                if (!spr.active) return;
                gameScene.tweens.add({
                    targets: spr, scaleX: 0, duration: A.flipMs / 2, ease: 'Sine.easeIn',
                    onComplete: () => {
                        if (!spr.active) return;
                        spr.setTexture(faceTex);
                        gameScene.tweens.add({ targets: spr, scaleX: BIG, duration: A.flipMs / 2, ease: 'Sine.easeOut' });
                    }
                });
            });

            // Požehnání / Prokletí přebarvují všechny karty ve hře – marky na texturách
            // card_<id> se proto přepečou. Děje se to hned po překlopení, uvnitř výdrže
            // karty uprostřed obrazovky: nic jiného se v tu chvíli neanimuje (boti jsou
            // blokovaní, stav čeká ve frontě), takže případné škubnutí není vidět.
            // Jen pro balíček High Noon: odkrytí karty Fistfulu s přebarvením nic nedělá
            // a volání s null by právě platné Požehnání/Prokletí zrušilo.
            if (which === 'hn') {
                gameScene.time.delayedCall(A.preMs + A.flyMs + A.holdBackMs + A.flipMs + 120, () => {
                    applySuitOverride(gameScene, suitOverrideForEvent(data.key));
                });
            }

            gameScene.time.delayedCall(A.preMs + A.flyMs + A.holdBackMs + A.flipMs + A.holdFaceMs, () => {
                if (!spr.active) return;
                // Zvednutí při hokynářství se mohlo mezitím změnit → spočítat slot znovu.
                const to = eventSlot(which) || slot;
                gameScene.tweens.add({
                    targets: spr, x: to.activeX, y: to.y, scaleX: 0.3, scaleY: 0.3,
                    duration: A.toSlotMs, ease: 'Power2',
                    // Karta na cílovém místě PARKUJE, dokud ji stav nemá na hromádce –
                    // stav dorazí až po dojezdu animace (fronta), takže bez parkování by
                    // na okamžik zmizela úplně.
                    onComplete: () => holdThenFinish(spr,
                        () => (which === 'ff' ? state?.activeFistful?.id : state?.activeEvent?.id) === data.id,
                        () => {
                            if (spr.active) spr.destroy();
                            if (which === 'ff') App.ffDeckLeft = null; else App.hnDeckLeft = null;
                            renderUI();
                        })
                });
            });
            break;
        }
        case 'draw': {
            // Opuštěný důl (Fistful): ve FÁZI 1 se líže z ODHOZU, kde karta leží lícem
            // nahoru. Musí z něj proto zmizet hned se startem letu (jinak tam viditelně
            // leží celý let) a nikde se nepřeklápí rub→líc – server ji v tom případě
            // posílá VŠEM, protože ji celý stůl viděl dopředu. Že to byla fáze 1, říká
            // `fromDiscard` od serveru; sám klient by to z (opožděného) stavu nepoznal.
            const _fromDiscard = !!data.fromDiscard;
            const mineDone = mineTakeFromPile(_fromDiscard ? data.cardId : null);
            const _mineFace = _fromDiscard && data.cardId != null;
            // Majitel: reveal flip do finálního slotu + staging (objeví se po dosednutí).
            // Pod dolem bez překlápění (faceUp) – karta z odhozu už lícem nahoru je.
            const _src = _fromDiscard ? discard : deck;
            if (!animateDrawToMyHand(data.playerIdx, data.cardId, _src.x, _src.y,
                                     _mineFace ? { faceUp: true, onComplete: mineDone } : {})) {
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
                // startScale/endScale: karta vzlétne ve velikosti balíčku a za letu se
                // zmenší na velikost vějíře v soupeřově ruce (na mobilu je jeho vějíř
                // výrazně menší než balíček – bez toho karta dosedla a teprve pak skočila).
                const oppDone = () => {
                    App.oppDrawPending[pIdx] = Math.max(0, (App.oppDrawPending[pIdx] || 1) - 1);
                    mineDone();
                };
                if (_mineFace) {
                    // Důl: soupeř bere VEŘEJNOU vrchní kartu odhozu (líc) do SKRYTÉ ruky,
                    // takže se za letu musí přetočit lícem→rub (reverse) – stejně jako
                    // u Pedra Ramireze. Bez toho by z hromádky, na které karta viditelně
                    // ležela lícem nahoru, odletěl rub a přetočení by nebylo vidět vůbec.
                    animateCardFlip(_src.x, _src.y, target.x, target.y, 'card_back', getCardTex(data.cardId),
                        { flip: true, reverse: true, startAngle: 0, endAngle: sideAngle(pIdx),
                          startScale: pileScale(), endScale: sideScale(pIdx, 'hand'),
                          duration: 380, onComplete: oppDone,
                          // Drž, dokud karta z odhozu opravdu nezmizí ve stavu – jinak by ji
                          // opožděný broadcast po zhasnutí brány na okamžik vrátil na hromádku.
                          holdUntil: () => !inDiscard(data.cardId) });
                } else {
                    animateCard(_src.x, _src.y, target.x, target.y, 'card_back', 380, oppDone,
                        { startAngle: 0, endAngle: sideAngle(pIdx), exactAngle: true, depth: 800 + pending,
                          startScale: pileScale(), endScale: sideScale(pIdx, 'hand') });
                }
            }
            break;
        }
        case 'discard':
        case 'hand_to_discard': {
            const fromIdx = data.fromPlayerIdx ?? data.playerIdx;
            const from = getMyPlayedCardPos(fromIdx, data.cardId);
            const faceTex = getCardTex(data.cardId);
            // Fistful – Opuštěný důl: odhoz nad limit karet (FÁZE 3) jde lícem dolů na
            // DOBÍRACÍ balíček. Říká to server (`toDeck`), ne klientský dohad – jen on ví,
            // jestli se důl v tomhle tahu vůbec uplatnil. Všechny ostatní odhozy (zahrané
            // karty, obrana, Ruská ruleta, schopnosti) letí do odhozu jako vždycky.
            const toDeck = !!data.toDeck;
            const dest = toDeck ? deckTopPos() : discard;
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
            animateCardFlip(from.x, from.y, dest.x, dest.y, 'card_back', faceTex,
                { flip: !isMine, startScale: sideScale(fromIdx, 'hand'), endScale: 0.3, duration: 380, onComplete: done,
                  startAngle: sideAngle(fromIdx), endAngle: 0,
                  holdUntil: toDeck ? null : () => inDiscard(data.cardId),
                  ...(toDeck ? { mineLand: true } : {}) });
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
            const scFrom = sideScale(data.playerIdx, 'hand');   // vzlétá z vějíře ruky
            const hold = () => onBoardOf(data.playerIdx, data.cardId);
            if (data.playerIdx === myIndex) {
                // Svou modrou/zbraň znám → jen letí na board (bez odhalování), ve VELIKOSTI
                // karty na mém boardu (0.36, ne malý default). holdUntil brání probliknutí.
                animateCardFlip(from.x, from.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { flip: false, startAngle: ang, endAngle: ang, startScale: scFrom, endScale: sc, duration: 400, holdUntil: hold });
            } else {
                // Cizí modrá/zbraň se ostatním teprve odhalí (rub→líc) a usadí v orientaci
                // vykládajícího hráče (bok = ±90°, protější = 180°) → flip s rotací i po hraně.
                animateCardFlip(from.x, from.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { flip: true, startAngle: ang, endAngle: ang, startScale: scFrom, endScale: sc, duration: 400, holdUntil: hold });
            }
            break;
        }
        case 'panic_sequence': {
            const atk = getMyPlayedCardPos(data.attackerIdx, data.cardId);
            const isBoard = data.area !== 'hand';
            // Z ruky: přesný slot vějíře (stolenIndex), ne obecná kotva ruky.
            const handSrc = isBoard ? null : _stolenHandSlot(data.targetIdx, data.stolenIndex);
            const from = isBoard
                ? getBoardPos(data.targetIdx, data.boardIdx ?? 1)
                : handSrc.pos;
            const panicTex = getCardTex(data.cardId);
            const atkAngle = sideAngle(data.attackerIdx);
            const tgtAngle = sideAngle(data.targetIdx);
            const isMyPanic = data.attackerIdx === myIndex;
            const revealStolen = () => { if (data.stolenCardId) { App.stealHideIds.delete(data.stolenCardId); renderUI(); } };
            // Paniku odeber z ruky útočníka teprve TEĎ, když ji zvedá animace (atk se už
            // spočítal z její pozice) – ať z ruky nezmizí dřív, než začne letět.
            _liftCardFromHand(data.attackerIdx, data.cardId);
            const afterReach = () => {
                // Panika letí dál do odhozu a srovná se do 0°. exactAngle: leží LÍCEM nahoru,
                // takže 0° ≠ 180° – u cíle naproti by ji nearestCardAngle nechal ležet vzhůru
                // nohama (a v odhozu by pak po room_update „přeskočila" do správné orientace).
                animateCard(from.x, from.y, discard.x, discard.y, panicTex, 250, null,
                    { startAngle: tgtAngle, endAngle: 0, exactAngle: true, scale: 0.3,
                      holdUntil: () => inDiscard(data.cardId) });
                // Ukradenou kartu z výzbroje/stolu skryj AŽ TEĎ, když se odlepuje (jinak
                // by z boardu zmizela hned a teprve po doletu paniky vylétla z prázdna).
                if (isBoard && data.stolenCardId) _hideStolenBoardCard(data);
                // Panika z RUKY: kartu (rub) uber cíli TEĎ, když se odlepuje k útočníkovi
                // – ať ji nedrží déle, než letí (dřív mizela až s room_update = viditelně
                // pozdě) a ať zmizí SPRÁVNÁ karta (slot ze stolenIndex, ne poslední).
                else _removeStolenFromHand(data.targetIdx, handSrc.slot);
                // Ukradená karta zpět k útočníkovi: majitel ji vidí (z ruky skrytě →
                // flip, z výzbroje/stolu lícem → jen růst) + staging do slotu. Cíl letu =
                // KONCOVÝ slot ruky útočníka (ne střed vějíře). Dotočí se z orientace cíle
                // (bok ±90°, protější 180°) do mojí orientace ruky (0°).
                if (!animateDrawToMyHand(data.attackerIdx, data.stolenCardId, from.x, from.y,
                        { duration: 320, faceUp: isBoard, onComplete: revealStolen, startAngle: tgtAngle,
                          startScale: sideScale(data.targetIdx, isBoard ? 'board' : 'hand') })) {
                    const dLen = state?.players?.[data.attackerIdx]?.hand?.length ?? 0;
                    const toAtk = getHandSlotPos(data.attackerIdx, dLen, dLen + 1);
                    if (isBoard && data.stolenCardId) {
                        // Viditelná karta ze stolu mizí do SKRYTÉ ruky jiného hráče → pro
                        // ostatní se za letu překlopí lícem→rub (jako u Ragtime), zmenší se
                        // na velikost jeho ruky a dotočí do jeho orientace.
                        animateCardFlip(from.x, from.y, toAtk.x, toAtk.y, 'card_back', getCardTex(data.stolenCardId),
                            { reverse: true, startAngle: tgtAngle, endAngle: atkAngle,
                              startScale: sideScale(data.targetIdx), endScale: sideScale(data.attackerIdx, 'hand'),
                              duration: 320, onComplete: revealStolen });
                    } else {
                        // Skrytá karta z ruky do ruky: jen rub. exactAngle – mezi hráči
                        // naproti (180°) by se rotace jinak zrušila a karta letí „placatě".
                        animateCard(from.x, from.y, toAtk.x, toAtk.y, 'card_back', 320, revealStolen,
                            { startAngle: tgtAngle, endAngle: atkAngle, exactAngle: true, scale: sideScale(data.attackerIdx, 'hand') });
                    }
                }
            };
            // 1. leg: svoji paniku znám (líc rovnou); cizí (botí) se za letu odhalí (rub→líc).
            // Otočí se z orientace útočníka do orientace cíle (exactAngle – líc nahoru, viz
            // výše; flip varianta níž se točí přesně vždy, tady je to potřeba doplnit ručně,
            // ať na kartu v obou případech navazuje 2. leg ze stejného úhlu).
            if (isMyPanic) {
                animateCard(atk.x, atk.y, from.x, from.y, panicTex, 320, afterReach,
                    { startAngle: atkAngle, endAngle: tgtAngle, exactAngle: true, scale: 0.3 });
            } else {
                animateCardFlip(atk.x, atk.y, from.x, from.y, 'card_back', panicTex,
                    { flip: true, startAngle: atkAngle, endAngle: tgtAngle, startScale: 0.3, endScale: 0.3, duration: 320, onComplete: afterReach });
            }
            break;
        }
        case 'catbalou_sequence': {
            const atk = getMyPlayedCardPos(data.attackerIdx, data.cardId);
            const isBoard = data.area !== 'hand';
            // Z ruky: přesný slot vějíře (stolenIndex), ne obecná kotva ruky.
            const handSrc = isBoard ? null : _stolenHandSlot(data.targetIdx, data.stolenIndex);
            const from = isBoard
                ? getBoardPos(data.targetIdx, data.boardIdx ?? 1)
                : handSrc.pos;
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
                // Cat Balou letí dál do odhozu a srovná se do 0° (exactAngle – líc nahoru,
                // u cíle naproti by jinak dosedla vzhůru nohama; viz panic_sequence).
                animateCard(from.x, from.y, discard.x, discard.y, cbTex, 250, null,
                    { startAngle: tgtAngle, endAngle: 0, exactAngle: true, scale: 0.3,
                      holdUntil: () => inDiscard(data.cardId) });
                // Zničenou kartu z výzbroje/stolu skryj AŽ TEĎ, když se odlepuje.
                if (isBoard && data.stolenCardId) _hideStolenBoardCard(data);
                // Cat Balou z RUKY: kartu uber cíli TEĎ, když letí do odhozu – ať ji nedrží
                // déle, než letí, a ať zmizí SPRÁVNÁ karta (slot ze stolenIndex).
                else _removeStolenFromHand(data.targetIdx, handSrc.slot);
                // Odhozená (zničená) karta letí z cíle do odhozu a srovná se do 0°. Z RUKY
                // byla skrytá (rub) → za letu se přetočí na líc (reveal); z výzbroje/stolu
                // už byla lícem nahoru → jen srovnání bez překlopení.
                animateCardFlip(from.x, from.y, discard.x, discard.y, 'card_back', stolenTex,
                    { flip: !isBoard, startAngle: tgtAngle, endAngle: 0, startScale: 0.3, endScale: 0.3,
                      duration: 320, onComplete: revealStolen,
                      holdUntil: data.stolenCardId ? () => inDiscard(data.stolenCardId) : undefined,
                      });
            };
            // 1. leg: svou CB znám (líc); cizí (botí) se za letu odhalí (rub→líc). Otočí se
            // z orientace útočníka do orientace cíle.
            if (isMyCB) {
                animateCard(atk.x, atk.y, from.x, from.y, cbTex, 320, afterReach,
                    { startAngle: atkAngle, endAngle: tgtAngle, exactAngle: true, scale: 0.3 });
            } else {
                animateCardFlip(atk.x, atk.y, from.x, from.y, 'card_back', cbTex,
                    { flip: true, startAngle: atkAngle, endAngle: tgtAngle, startScale: 0.3, endScale: 0.3, duration: 320, onComplete: afterReach });
            }
            break;
        }
        // A Fistful of Cards – Odražená střela: karta Bang! letí z ruky útočníka na
        // zasaženou vyloženou kartu a odtud rovnou do odhozu. Se zasaženou kartou se
        // tady NEhýbe – jestli přežije, se rozhodne až ve fázi RESPOND (její případný
        // odlet přijde zvlášť jako board_to_discard).
        case 'ricochet_shot': {
            const atk = getMyPlayedCardPos(data.attackerIdx, data.cardId);
            const to = getBoardPos(data.targetIdx, data.boardIdx ?? 0);
            const rcTex = getCardTex(data.cardId);
            const atkAngle = sideAngle(data.attackerIdx);
            const tgtAngle = sideAngle(data.targetIdx);
            const isMyShot = data.attackerIdx === myIndex;
            // Kartu odeber z ruky útočníka teprve TEĎ, když ji zvedá animace (pozici
            // `atk` už máme) – ať z ruky nezmizí dřív, než začne letět.
            _liftCardFromHand(data.attackerIdx, data.cardId);
            const afterHit = () => {
                // Do odhozu se srovná do 0° (exactAngle – letí lícem nahoru, u cíle
                // naproti by jinak dosedla vzhůru nohama; viz catbalou_sequence).
                animateCard(to.x, to.y, discard.x, discard.y, rcTex, 250, null,
                    { startAngle: tgtAngle, endAngle: 0, exactAngle: true,
                      startScale: sideScale(data.targetIdx), endScale: pileScale(),
                      holdUntil: () => inDiscard(data.cardId) });
            };
            // 1. leg: svůj Bang! znám (líc); cizí se za letu odhalí (rub→líc).
            if (isMyShot) {
                animateCard(atk.x, atk.y, to.x, to.y, rcTex, 320, afterHit,
                    { startAngle: atkAngle, endAngle: tgtAngle, exactAngle: true,
                      startScale: sideScale(data.attackerIdx, 'hand'), endScale: sideScale(data.targetIdx) });
            } else {
                animateCardFlip(atk.x, atk.y, to.x, to.y, 'card_back', rcTex,
                    { flip: true, startAngle: atkAngle, endAngle: tgtAngle,
                      startScale: sideScale(data.attackerIdx, 'hand'), endScale: sideScale(data.targetIdx),
                      duration: 320, onComplete: afterHit });
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
            if (!animateDrawToMyHand(data.playerIdx, data.cardId, from.x, from.y,
                    { duration: 380, startAngle: fromAngle, startScale: sideScale(data.fromPlayerIdx, 'hand') })) {
                const dLen = state?.players?.[data.playerIdx]?.hand?.length ?? 0;
                const to = getHandSlotPos(data.playerIdx, dLen, dLen + 1);   // koncový slot ruky Jesseho
                if (data.fromPlayerIdx === myIndex && stolenCard) {
                    // Jsem cíl a kartu znám → schová se (líc→rub) a otočí do orientace Jesseho.
                    animateCardFlip(from.x, from.y, to.x, to.y, 'card_back', getCardTex(stolenCard.id),
                        { flip: true, reverse: true, startAngle: fromAngle, endAngle: drawerAngle,
                          startScale: sideScale(data.fromPlayerIdx, 'hand'), endScale: sideScale(data.playerIdx, 'hand'), duration: 380 });
                } else {
                    // Jiný divák: jen rub, otočí se z orientace cíle do orientace Jesseho.
                    // exactAngle: cíl a Jesse přímo naproti (180° od sebe) by se bez něj
                    // srovnali na 0° a karta by letěla placatě – takhle se dotočí naplno.
                    animateCard(from.x, from.y, to.x, to.y, 'card_back', 380, null,
                        { startAngle: fromAngle, endAngle: drawerAngle, exactAngle: true, scale: sideScale(data.playerIdx, 'hand') });
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
                // Soupeř bere veřejnou vrchní kartu odhozu (líc) do SKRYTÉ ruky → za letu
                // se musí přetočit lícem→rub (reverse), stejně jako krádež ze stolu u Ragtime.
                // Dřív doletěla pořád lícem nahoru a „přetočení" nebylo vidět vůbec. Zároveň
                // se dotočí do jeho orientace (bok ±90°, protější 180°) a zmenší na velikost
                // karet v jeho ruce; míří na KONCOVÝ slot vějíře, ne na obecnou kotvu.
                const dLen = state?.players?.[data.playerIdx]?.hand?.length ?? 0;
                const to = getHandSlotPos(data.playerIdx, dLen, dLen + 1);
                animateCardFlip(discard.x, discard.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { reverse: true, startAngle: 0, endAngle: sideAngle(data.playerIdx),
                      startScale: 0.3, endScale: sideScale(data.playerIdx, 'hand'), duration: 380, onComplete: pedroDone });
            }
            break;
        }
        case 'claus_pick': {
            // Claus (Fistful) vybral kartu z odkryté řady pro toho, kdo je na řadě.
            // Slot zhasne HNED se startem letu (stav dorazí až po něm), karta doletí
            // do ruky příjemce. Líc znají jen Claus a příjemce (cardId), ostatní rub.
            const src = clausSlotPos(data.slot);
            const sc = (App.clausPanel && App.clausPanel.scale) || 0.3;
            // Úhel, pod kterým karta v řadě LEŽÍ: Clausovi rovně uprostřed stolu, ostatním
            // pod úhlem jeho sedadla (řada jim parkuje u něj – viz clausPanelLayout).
            const srcAngle = (App.clausPanel && App.clausPanel.angle) || 0;
            App.clausTakenSlots = App.clausTakenSlots || new Set();
            App.clausTakenSlots.add(data.slot);
            renderUI();
            // Sobě: karta letí na SVŮJ slot ve vějíři (staging jako u líznutí).
            if (animateDrawToMyHand(data.toIdx, data.cardId, src.x, src.y,
                    { faceUp: true, duration: 420, startScale: sc, startAngle: srcAngle })) break;
            const dLen = state?.players?.[data.toIdx]?.hand?.length ?? 0;
            const to = getHandSlotPos(data.toIdx, dLen, dLen + 1);
            const endScale = sideScale(data.toIdx, 'hand');
            if (data.cardId != null) {
                // Claus svou kartu zná → vidí ji odletět lícem a cestou se schovat.
                animateCardFlip(src.x, src.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { reverse: true, startAngle: srcAngle, endAngle: sideAngle(data.toIdx),
                      startScale: sc, endScale, duration: 420 });
            } else {
                // exactAngle: příjemce naproti (180°) by se bez něj srovnal na 0°.
                animateCard(src.x, src.y, to.x, to.y, 'card_back', 420, null,
                    { startAngle: srcAngle, endAngle: sideAngle(data.toIdx), exactAngle: true,
                      startScale: sc, endScale });
            }
            break;
        }
        case 'discard_to_hand': {
            // Karta se vrací z odhozu do ruky (Sid Ketchum – zrušené léčení).
            // U mě letí na svůj SKUTEČNÝ slot (staging přes pendingDrawIds, jako líznutí),
            // ne na fixní kotvu ruky – proto animateDrawToMyHand (líc nahoru, bez otáčení).
            // Opuštěného dolu se to netýká: zahrané ani odhozené karty ve fázi 2 na
            // dobírací balíček nechodí, takže se karta vrací z odhozu lícem nahoru.
            if (data.toPlayerIdx === myIndex &&
                animateDrawToMyHand(data.toPlayerIdx, data.cardId, discard.x, discard.y, { faceUp: true, duration: 400 })) {
                break;
            }
            const handPos = getPlayerHandPos(data.toPlayerIdx);
            animateCard(discard.x, discard.y, handPos.x, handPos.y, 'card_back', 400, null,
                { startScale: pileScale(), endScale: sideScale(data.toPlayerIdx, 'hand') });
            break;
        }
        case 'ragtime_steal': {
            // Ragtime: ukradená karta letí od cíle (ruka/výzbroj/stůl) do ruky útočníka.
            // (Samotná Ragtime i „další" karta letí do odhozu přes hand_to_discard.)
            // Odpovídá druhé části paniky (afterReach) – bez první nohy (nic k cíli neletí).
            const isBoard = data.area !== 'hand';
            // Z ruky: přesný slot vějíře (stolenIndex), ne obecná kotva ruky.
            const handSrc = isBoard ? null : _stolenHandSlot(data.targetIdx, data.stolenIndex);
            const from = isBoard
                ? getBoardPos(data.targetIdx, data.boardIdx ?? 1)
                : handSrc.pos;
            const tgtAngle = sideAngle(data.targetIdx);
            const atkAngle = sideAngle(data.attackerIdx);
            const revealStolen = () => { if (data.stolenCardId) { App.stealHideIds.delete(data.stolenCardId); renderUI(); } };
            // Kartu z výzbroje/stolu skryj (letí), z ruky uber cíli tu SPRÁVNOU (stolenIndex).
            if (isBoard && data.stolenCardId) _hideStolenBoardCard(data);
            else _removeStolenFromHand(data.targetIdx, handSrc.slot);
            if (!animateDrawToMyHand(data.attackerIdx, data.stolenCardId, from.x, from.y,
                    { duration: 360, faceUp: isBoard, onComplete: revealStolen, startAngle: tgtAngle,
                      startScale: sideScale(data.targetIdx, isBoard ? 'board' : 'hand') })) {
                const dLen = state?.players?.[data.attackerIdx]?.hand?.length ?? 0;
                const toAtk = getHandSlotPos(data.attackerIdx, dLen, dLen + 1);
                if (isBoard && data.stolenCardId) {
                    // Viditelná karta ze stolu (Pat Brennan / Ragtime) mizí do SKRYTÉ ruky
                    // jiného hráče → pro ostatní se za letu překlopí lícem→rub (reverse),
                    // zamíří na správný slot a dotočí se z orientace cíle do orientace útočníka.
                    animateCardFlip(from.x, from.y, toAtk.x, toAtk.y, 'card_back', getCardTex(data.stolenCardId),
                        { reverse: true, startAngle: tgtAngle, endAngle: atkAngle,
                          startScale: sideScale(data.targetIdx), endScale: sideScale(data.attackerIdx, 'hand'),
                          duration: 360, onComplete: revealStolen });
                } else {
                    // Skrytá karta z ruky do ruky: jen rub. exactAngle – mezi hráči naproti
                    // (180°) by se rotace jinak zrušila a karta by letěla „placatě".
                    const stolenTex = data.stolenCardId ? getCardTex(data.stolenCardId) : 'card_back';
                    animateCard(from.x, from.y, toAtk.x, toAtk.y, stolenTex, 360, revealStolen,
                        { startAngle: tgtAngle, endAngle: atkAngle, exactAngle: true, scale: sideScale(data.attackerIdx, 'hand') });
                }
            }
            break;
        }
        case 'player_death_discard':
        case 'vulture_sam_steal':
            playDeathSequence(data);
            break;
        case 'sheriff_penalty_discard':
            playSheriffPenaltyDiscard(data);
            break;
        case 'new_identity_result':
            playNewIdentityResult(data);
            break;
        case 'vulture_split_death':
            playVultureSplitDeath(data);
            break;
        case 'player_death_reveal':
            playDeathRoleReveal(data);
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
            animateCard(fromX, fromY, discard.x, discard.y, getCardTex(data.cardId), 380, null,
                { startScale: sideScale(data.fromPlayerIdx, 'hand'), endScale: pileScale() });
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
                  startScale: sideScale(data.attackerIdx, 'hand'), endScale: sideScale(data.targetIdx),
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
            // holdUntil: sprite drž na cíli, dokud dynamit reálně neleží na stole nového
            // majitele (room_update). Bez toho se po dojezdu letu odkryje dřív, než stav
            // dorazí, a dynamit na okamžik problikne zpátky na PŮVODNÍM místě.
            animateCard(from.x, from.y, to.x, to.y, getCardTex(data.cardId), 500, () => {
                App.stealHideIds.delete(data.cardId); renderUI();
            }, { startAngle: sideAngle(data.fromIdx), endAngle: sideAngle(data.toIdx),
                 exactAngle: true,   // naproti (0°→180°) se musí opravdu otočit, ne srovnat na 0
                 startScale: 0.42, endScale: sideScale(data.toIdx),
                 holdUntil: () => onBoardOf(data.toIdx, data.cardId) });
            break;
        }
        case 'dynamite_explode': {
            const from = getBoardPos(data.playerIdx, data.boardIdx ?? 1);
            App.discardAnimHideId = data.cardId;   // v odhozu skryj, dokud nedoletí
            renderUI();
            // Z boardu hráče (klidně otočeného o 90°) do odhozu, kde leží rovně (0°), se
            // zmenšením. exactAngle jako u board_to_discard: karta leží LÍCEM nahoru, takže
            // u protějšího hráče (180°) se musí opravdu otočit – bez toho by nearestCardAngle
            // rotaci zrušil a dynamit by dosedl vzhůru nohama.
            animateCard(from.x, from.y, discard.x, discard.y, getCardTex(data.cardId), 350, () => {
                if (App.discardAnimHideId === data.cardId) { App.discardAnimHideId = null; renderUI(); }
            }, { startAngle: sideAngle(data.playerIdx), endAngle: 0, exactAngle: true, startScale: 0.42, endScale: 0.3,
                 });
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
            animateCard(from.x, from.y, discard.x, discard.y, getCardTex(data.cardId), 380, () => {
                App.stealHideIds.delete(data.cardId);
                if (App.discardAnimHideId === data.cardId) App.discardAnimHideId = null;
                renderUI();
            }, { startAngle: sideAngle(data.fromPlayerIdx), endAngle: 0, exactAngle: true,
                 startScale: sideScale(data.fromPlayerIdx), endScale: 0.3,
                 holdUntil: () => inDiscard(data.cardId) });
            break;
        }
        case 'duel_exchange':
            animateCard(getPlayerHandPos(data.fromPlayerIdx).x, getPlayerHandPos(data.fromPlayerIdx).y,
                        discard.x, discard.y, 'card_back', 280, null,
                        { startScale: sideScale(data.fromPlayerIdx, 'hand'), endScale: pileScale() });
            break;
        // A Fistful of Cards – Peyote: hráč tipnul barvu vrchní karty, teď se odkryje.
        case 'peyote_reveal':
            startPeyoteReveal(data);
            break;
        case 'law_reveal':
            startLawReveal(data);
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
                        { holdUntil: gone, startScale: pileScale(), endScale: sideScale(data.pickerIdx, 'hand') });
                }
            } else {
                // Cíl = KONCOVÝ slot ruky bereného hráče (ne střed vějíře). Karta se cestou
                // ze slotu (0°) dotočí do jeho orientace (bok ±90°, protější 180°) a schová (líc→rub).
                const dLen = state?.players?.[data.pickerIdx]?.hand?.length ?? 0;
                const to = getHandSlotPos(data.pickerIdx, dLen, dLen + 1);
                animateCardFlip(slot.x, slot.y, to.x, to.y, 'card_back', getCardTex(data.cardId),
                    { flip: true, reverse: true, startScale: 0.32, endScale: sideScale(data.pickerIdx, 'hand'),
                      duration: 420, onComplete: cleanup, holdUntil: gone,
                      startAngle: 0, endAngle: sideAngle(data.pickerIdx) });
            }
            break;
        }
    }
}

// ── Peyote (Fistful): odkrytí karty, na jejíž barvu hráč tipoval ────────────
// Zkrácené SEJMUTÍ (startCheckReveal v game.js): rub z balíčku doprostřed obrazovky, cestou
// překlopení a zvětšení, výdrž s pulzující markou – a pak podle výsledku do RUKY (uhodl,
// jako druhá karta Black Jacka) nebo do ODHOZU (netrefil, fáze lízání tím končí).
// Karta je veřejná – všichni vidí líc – a do ruky se schová (líc→rub) až za letu, stejně
// jako u Black Jacka. Časování je sdílené se serverem (core/fistfulAnim.js).
function startPeyoteReveal(data) {
    // `printedSuit`: Peyote se schválně vyhodnocuje proti VYTIŠTĚNÉ barvě (jinak by pod
    // Požehnáním/Prokletím sedl každý tip), takže vytištěnou barvu musí ukazovat CELÁ
    // cinematika – překlopení z balíčku, výdrž s pulzující markou i let do ruky/odhozu
    // (kartě se pro to upeče vlastní textura, viz printedSuitTex). Přebarvení na
    // srdce/piky se na ní projeví až tam, kde dosedne, tedy až ji převezme stav.
    startDeckCardReveal(data.card, data.playerIdx, PEYOTE_ANIM,
                        { pulse: true, printedSuit: true, toDiscard: !data.hit });
}

// A Fistful of Cards – Právo západu: vynucená karta se ukáže celému stolu (BEZ pulzující
// marky – nezkoumá se hodnota ani barva) a pak jde do ruky, kde je zase tajná. Časování
// je sdílené se serverem (core/fistfulAnim.js).
//
// `data.from` říká, ODKUD karta vzlétá: chybí = z balíčku (běžné lízání), 'claus' /'kit'
// = z odkryté řady, kterou si postava rozděluje. U Clause leží řada uprostřed stolu
// stejně pro všechny; u Kita ji vidí jen on (ostatním parkují ruby u jeho místa), takže
// se u nich spotřebuje jedna parkující karta – jinak by ji `finishKitCarlsonSpectator`
// poslal do ruky ještě jednou.
function startLawReveal(data) {
    const opts = { pulse: false };
    if (data.from === 'claus') {
        opts.from = clausSlotPos(data.slot);
        opts.fromScale = (App.clausPanel && App.clausPanel.scale) || 0.3;
        // Ostatním řada leží u Clausova místa, tedy na boku nastojato – karta se za letu
        // doprostřed narovná (Claus sám má řadu rovně, takže je to u něj no-op).
        opts.fromAngle = (App.clausPanel && App.clausPanel.angle) || 0;
        App.clausTakenSlots = App.clausTakenSlots || new Set();
        App.clausTakenSlots.add(data.slot);
        renderUI();   // slot v řadě zhasne se startem letu (stav dorazí až za ním)
    } else if (data.from === 'kit') {
        if (data.playerIdx === myIndex && myIndex !== null) {
            opts.from = { x: 960 - 260 + (data.slot || 0) * 260, y: 480 };
            opts.fromScale = 0.6;
        } else {
            const parked = (App.kitSpecParked || []).shift();
            if (parked) {
                opts.from = { x: parked.x, y: parked.y };
                opts.fromScale = 0.3;
                opts.fromAngle = parked.angle || 0;
                if (parked.sprite?.active) parked.sprite.destroy();
                App.kitSpecPicksDone = (App.kitSpecPicksDone || 0) + 1;
            }
        }
    }
    startDeckCardReveal(data.card, data.playerIdx, LAW_ANIM, opts);
}

// Společné tělo obou (a předloha je 2. karta Black Jacka): karta vyletí z balíčku
// doprostřed obrazovky, cestou se překlopí a zvětší, chvíli drží – a pak letí do RUKY
// (ostatním se za letu překlopí zpět na rub) nebo do ODHOZU (`toDiscard`).
function startDeckCardReveal(card, playerIdx, D, opts = {}) {
    if (!gameScene || !state || !card) return;
    // `opts.printedSuit` (Peyote): karta ukazuje VYTIŠTĚNOU barvu po CELOU dobu cinematiky –
    // od odkrytí z balíčku přes výdrž uprostřed až po dolet do ruky/odhozu. Přebarvení
    // (Požehnání/Prokletí) se na ní projeví až tam, kde dosedne, tedy až ji převezme stav.
    const faceTex = opts.printedSuit ? printedSuitTex(card) : getCardTex(card.id);
    const isOwner = playerIdx === myIndex && myIndex !== null;
    const from = opts.from || deckTopPos();
    const pScale = currentLayout().scaleDeck;   // velikost karty na hromádce (odhoz)
    const startScale = opts.fromScale ?? pScale;
    // Karta může vzlétat z místa, kde LEŽÍ otočená (odkrytá řada u soupeřova sedadla) –
    // pak se cestou doprostřed narovná. Z balíčku je to vždycky 0 → tween nevznikne.
    const startAngle = opts.fromAngle || 0;
    let pulse = null;
    const stopPulse = () => {
        if (!pulse) return;
        if (pulse.tween) pulse.tween.remove();
        pulse.marks.forEach(m => m.destroy());
        pulse = null;
    };
    const sprite = gameScene.add.image(from.x, from.y, 'card_back')
        .setScale(startScale).setAngle(startAngle).setDepth(820).setAlpha(0.98);
    // 1) balíček → střed: posun + růst + flip rub→líc
    const halfFlip = Math.round(D.flyMs / 2);
    gameScene.tweens.add({ targets: sprite, x: REVEAL_CX, y: REVEAL_CY, duration: D.flyMs, ease: 'Cubic.easeOut' });
    if (startAngle) gameScene.tweens.add({ targets: sprite, angle: 0, duration: D.flyMs, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleY: REVEAL_BIG, duration: D.flyMs, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleX: 0, duration: halfFlip, ease: 'Sine.easeIn',
        onComplete: () => { if (!sprite.active) return; sprite.setTexture(faceTex);
            gameScene.tweens.add({ targets: sprite, scaleX: REVEAL_BIG, duration: halfFlip, ease: 'Sine.easeOut',
                onComplete: () => { if (sprite.active && opts.pulse) {
                    pulse = pulseCheckMark(REVEAL_CX, REVEAL_CY, REVEAL_BIG, card,
                                           { printedSuit: !!opts.printedSuit });
                } } }); } });

    const flyDelay = D.flyMs + D.holdMs;
    // 2a) NETREFIL – karta sjede do odhozu (a fáze lízání končí).
    if (opts.toDiscard) {
        const to = discardTopPos();
        gameScene.tweens.add({ targets: sprite, x: to.x, y: to.y, scaleX: pScale, scaleY: pScale,
            delay: flyDelay, duration: D.landMs, ease: 'Cubic.easeIn',
            // Se začátkem sestupu jde karta z „reveal“ vrstvy do vrstvy hromádky – co přiletí
            // po ní (odhoz na konci tahu) musí dosednout NAD ni. Stejně jako u sejmutí.
            onStart: () => { stopPulse(); sprite.setDepth(REVEAL_PILE_DEPTH); },
            onComplete: () => holdThenFinish(sprite,
                () => (state?.deck?.discardPile || []).some(c => c.id === card.id),
                () => { stopPulse(); if (sprite.active) sprite.destroy(); }) });
        return;
    }
    // 2b) UHODL – karta letí do ruky hráče.
    const hand = state.players[playerIdx]?.hand ?? [];
    const target = getHandSlotPos(playerIdx, hand.length, hand.length + 1);
    const endScale = _renderHandScale(playerIdx);
    if (isOwner) App.pendingDrawIds.add(card.id);   // skryj v ruce do doletu (staging)
    gameScene.tweens.add({ targets: sprite, x: target.x, y: target.y, scaleY: endScale,
        delay: flyDelay, duration: D.landMs, ease: 'Cubic.easeIn',
        // Marka leží na PEVNÉ pozici uprostřed obrazovky (nedrží se karty), takže musí
        // zhasnout přesně se startem letu – jinak by zůstala viset ve vzduchu.
        onStart: () => stopPulse(),
        onComplete: () => { if (sprite.active) sprite.destroy();
            if (isOwner) App.pendingDrawIds.delete(card.id);
            // Karta se objeví PŘESNĚ při dosednutí: pokud stav ještě nedorazil, vlož ji do
            // ruky optimisticky (další room_update ji stejně přepíše, žádný duplikát).
            const h = state?.players?.[playerIdx]?.hand;
            if (h && !h.some(c => c.id === card.id)) h.push(card);
            renderUI(); } });
    if (isOwner) {
        gameScene.tweens.add({ targets: sprite, scaleX: endScale, delay: flyDelay, duration: D.landMs, ease: 'Cubic.easeIn' });
    } else {
        // Ostatní: karta míří do vějíře ruky soupeře → za letu se dotočí do jeho orientace
        // (bok = ±90°, protější = 180°) a překlopí zpět na rub (míří do skryté ruky).
        const seatAngle = _kitSpecAngleFor(playerIdx);
        if (seatAngle) gameScene.tweens.add({ targets: sprite, angle: seatAngle, delay: flyDelay, duration: D.landMs, ease: 'Cubic.easeIn' });
        const halfLand = Math.round(D.landMs / 2);
        gameScene.tweens.add({ targets: sprite, scaleX: 0, delay: flyDelay, duration: halfLand, ease: 'Sine.easeIn',
            onComplete: () => { if (!sprite.active) return; sprite.setTexture('card_back');
                gameScene.tweens.add({ targets: sprite, scaleX: endScale, duration: halfLand, ease: 'Sine.easeOut' }); } });
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
    claus_pick:        420,
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
    ricochet_shot:     570,   // 320 na zasaženou kartu + 250 do odhozu
    // Nevybraná odletí hned (400), vybraná mezitím jede klasické sejmutí uprostřed
    // obrazovky: 450 nálet + 3000 výdrž s pulzem + 400 sestup do odhozu (= CHECK_REVEAL_MS).
    lucky_duke_result: 3850,
};

function _animDurationMs(data) {
    // Smrt: celá cinematika vyřazení (pokles na nulu → odhoz karet → odhalení role).
    // Počet položek odhozu = modré + zbraň/Colt (vždy jedna) + ruka, viz _deathCardSeq;
    // stejný vzorec počítá server (server/anim.js), aby o tu dobu podržel boty.
    if (data.type === 'player_death_discard' || data.type === 'vulture_sam_steal') {
        const dIdx = data.type === 'vulture_sam_steal' ? data.fromPlayerIdx : data.playerIdx;
        const skipReveal = !!state?.mode3p || (data.role || state?.players?.[dIdx]?.role) === 'Sheriff';
        return deathSequenceMs((data.blue?.length || 0) + 1 + (data.hand?.length || 0), skipReveal);
    }
    // Šerifova ztráta karet za zabití pomocníka (bez Coltu → bez „+1" jako u smrti).
    if (data.type === 'sheriff_penalty_discard') {
        return penaltyDiscardMs((data.blue?.length || 0) + (data.weapon ? 1 : 0) + (data.hand?.length || 0));
    }
    // High Noon: odkrytí karty události (let doprostřed → překlopení → výdrž → na stůl).
    if (data.type === 'high_noon_reveal') return hnRevealMs();
    // High Noon (přibalené): dojezd Nové identity (výměna postavy / návrat karty).
    if (data.type === 'new_identity_result') return niResultMs(data.take);
    // Fistful – Peyote: odkrytí karty, na jejíž barvu hráč tipoval (střed → ruka/odhoz).
    if (data.type === 'peyote_reveal') return peyoteRevealMs();
    // Fistful – Právo západu: vynucená karta se ukáže celému stolu (střed → ruka).
    if (data.type === 'law_reveal') return lawRevealMs();
    // Smrt rozdělená na dva kusy kvůli dělení karet mezi víc Vulture Samů.
    if (data.type === 'vulture_split_death') return deathFallMs();
    if (data.type === 'player_death_reveal') {
        return deathRevealMs(!!state?.mode3p || state?.players?.[data.playerIdx]?.role === 'Sheriff');
    }
    // A Fistful of Cards – Opuštěný důl: odhoz nad limit karet (FÁZE 3) letí lícem
    // nahoru na dobírací balíček, chvíli tam leží a teprve pak se překlopí na rub.
    // Stav se o tu dobu musí zdržet, jinak by hromádka přeskočila dřív, než se karta
    // otočí. Pozná se to podle `toDeck`, které posílá server – jiné odhozy důl nemění.
    return (ANIM_MS[data.type] ?? 400) + mineLandMs(!!data.toDeck);
}

socket.on('card_animation', (data) => {
    // Mimo scénu/hru není co přehrát – nezařazuj, ať fronta nedrží následující stav.
    if (!gameScene || !state || !data) return;
    // Cinematika vyřazení je `essential`: nikdy se nesmí zahodit kvůli zaostávání
    // fronty. Nechává za sebou lokálně upravený stav (skryté karty, mezifáze) a bez
    // dojezdu by ho nikdo neuklidil – navíc na ni čeká i server (drží boty).
    // Odkrytí karty High Noon je taky `essential`: na její dojezd čeká i server (drží
    // boty) a bez ní by hromádka odkrytých karet přeskočila rovnou na novou kartu.
    const essential = data.type === 'player_death_discard' || data.type === 'vulture_sam_steal' ||
                      data.type === 'sheriff_penalty_discard' ||
                      data.type === 'vulture_split_death' || data.type === 'player_death_reveal' ||
                      data.type === 'high_noon_reveal' || data.type === 'new_identity_result';
    _animQ.pushAnim(() => _playCardAnim(data), _animDurationMs(data), { essential });
});

socket.on('room_update', (payload) => {
    if (!payload) return;
    _animQ.pushState(() => _applyRoomUpdate(payload));
});

// Čeká ve frontě ještě něco (další animace nebo neaplikovaný stav)? Používá
// holdThenFinish (game.js): letící sprite se nesmí vzdát držení na cíli, dokud stav,
// který ho má vystřídat, teprve stojí ve frontě. Typicky vězení odletí do odhozu a hned
// za ním jde dlouhá cinematika odkrytí karty High Noon – bez tohohle by sprite po ~720 ms
// zanikl a vězení by se na desce „vrátilo" zpátky, než konečně dorazí stav.
function animQueueBusy() {
    return _animQ.size() > 0;
}

// ── ANIMACE MÍCHÁNÍ BALÍČKU ─────────────────────────────────────────────────
// Míchání frontou NEjde: server u něj sám odkládá broadcast o 5,7 s (delší než
// cinematika), u proaktivního míchání naopak stav schválně nečeká a hra běží dál.
socket.on('reshuffle_anim', ({ cardCount, proactive, topCardId }) => {
    // `!state` = nejsme v žádné hře (doběhlá zpráva z právě opuštěného sledování) –
    // jinak by se karty rozjely přes menu.
    if (!gameScene || !state) return;

    App.reshuffleAnimating = true;
    App.blockInput = true;
    App.reshuffleIsProactive = proactive === true;

    // Karty, které se do balíčku vracejí – odspodu nahoru, jak leží v odhozu. Cinematika
    // je posbírá LÍCEM NAHORU (odhoz je lícem nahoru) a přetočí celou hromádku najednou;
    // bez nich by se sbíraly rubem a přetočení by nebylo poznat. Musí se sejmout DŘÍV,
    // než se odhoz ořízne na vrchní kartu.
    let faceIds = null;
    if (state?.deck) {
        let topCard = null;
        if (topCardId !== null && topCardId !== undefined) {
            topCard = state.deck.discardPile.find(c => c.id === topCardId) || { id: topCardId };
        } else if (state.deck.discardPile.length > 0) {
            topCard = state.deck.discardPile[state.deck.discardPile.length - 1];
        }
        faceIds = state.deck.discardPile
            .filter(c => !topCard || c.id !== topCard.id)
            .map(c => c.id);
        state.deck.discardPile = topCard ? [topCard] : [];
    }
    renderUI();

    // Samotná cinematika je sdílená s hokynářstvím (game.js playReshuffleCinematic),
    // aby to bylo v obou případech vizuálně i délkou totéž míchání. onDone odemkne UI
    // u proaktivního zamíchání, kde broadcast dorazil hned na začátku animace.
    playReshuffleCinematic(cardCount, {
        faceIds,
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
    App.ignoreRoomId = null;   // vlastní hra – filtr diváckých zbytků už nemá co blokovat
    App.spectating = false;
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

// ── Nasazení nové verze za běhu ──────────────────────────────────────────────
// Server posílá otisk svého kódu po každém připojení (server/version.js). Ten první
// je verze, se kterou se načetla tahle stránka; přijde-li po reconnectu jiný, nahrál
// se mezitím na server nový kód. Prohlížeč pak běží na starém JS a rozehraná hra je
// po restartu serveru stejně pryč – ukaž výzvu k načtení stránky, ať hráč nehádá,
// proč ho to „vyhodilo do menu". Restart beze změny kódu otisk nemění, takže z pádu
// serveru se hláška neobjeví.
let _serverBuild = null;
socket.on('server_version', (build) => {
    if (!build) return;
    if (_serverBuild === null) { _serverBuild = build; clog('info', 'server build ' + build); return; }
    if (_serverBuild === build) return;
    clog('warn', 'nová verze serveru: ' + _serverBuild + ' → ' + build);
    _serverBuild = build;
    showUpdateBanner();
});

// Server naše místo (zatím) nedrží. Po zavření a rychlém otevření nového okna může
// server zpracovat náš 'rejoin' DŘÍV než disconnect starého socketu (hráč ještě není
// 'disconnected'). Pár× to proto zopakuj; teprve pak to vzdej (session pryč + menu).
socket.on('rejoin_failed', () => {
    if (_rejoinDone) return;
    if (++_rejoinTries <= 6) { setTimeout(attemptRejoin, 500); return; }
    clearBangSession();
    if (!roomState) return;
    roomState = null; state = null; myIndex = null; _myNextGameVote = null; App.startPressed = false;
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
    // Výjimka: běží-li cinematika vyřazení, UI zůstane zamčené až do jejího konce
    // (jinak by ji odemkl právě ten zahozený dvojklik, který smrt spustil).
    if (Object.keys(App.deathSeq).length === 0) App.blockInput = false;
    clog('warn', 'akce zahozena serverem: ' + (info?.event || '?'), { reason: info?.reason });
    if (gameScene) renderUI();
});

function _applyRoomUpdate(payload) {
    // Doběhlý update ze hry, kterou už nesledujeme (viz stopSpectating). Bez tohohle
    // filtru by nás pár set milisekund po kliku na „Opustit sledování" hodil zpátky do hry.
    if (App.ignoreRoomId && payload.roomId === App.ignoreRoomId) return;
    // Art rozšíření se nestahuje v preloadu – dotáhne se, jakmile se o zapnutém rozšíření
    // dozvíme. `payload.options` chodí už z lobby (dřív než hra začne), `gameState.options`
    // je záloha pro stavy, kde options u místnosti nejsou. Debug ukazuje karty všech.
    ensureExpansionAssetsFor(payload.options || payload.gameState?.options);
    if (payload.gameState?.isDebug) ensureAllExpansionAssets();
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
    // Zámek tlačítka „Zahájit hru" (view/menu.js) platí jen do odchodu z lobby – jakmile
    // se místnost pohne dál (hra běží / nová sestava), tlačítko je zase klikatelné.
    if (payload.roomPhase !== 'lobby' && payload.roomPhase !== 'next_lobby') App.startPressed = false;
    roomState = payload;
    state = payload.gameState;
    registerCardTexAliases(state);   // creative karty: id -> id upečené textury
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
    if (state?.phase === 'CHARACTER_SELECT' || state?.phase === undefined) { App.pendingDrawIds.clear(); App.cardTexAlias = {}; App.drawAnims = []; App.discardAnimHideId = null; App.healthAnims = {}; App.deathDiscardHideIds.clear(); App.deathSeq = {}; App.deathHandHide = {}; App.vultureSplitIdx = null; App.stealHideIds.clear(); App.handFlyHideIds.clear(); App.storePileLiftY = 0; App.dealDeckCount = null; App.storeDealIds = new Set(); App.storeLocked = false; App.storeShuffleEndAt = 0; App.storeShuffling = false; App.storeShuffleBlock = false; App.revealShuffling = false; App.revealLocked = false; App.kitDealIds.clear(); App.kitRevealCards = null; App.kitPicked = []; App.luckyDealIds.clear(); App.luckyRevealCards = null; App.discardFlyHideIds.clear(); App.pedroDrawLock = false; App.playedCardFromPos = {}; App.hnDeckLeft = null; App.ffDeckLeft = null; _clearKitSpecSprites(); }

    // Zásah / vyléčení: posuň postavu po kartě životů o reálnou změnu životů. Smrt má
    // vlastní cinematiku (core/deathAnim.js), proto se vyžaduje NOVÝ stav > 0; opačný
    // směr (z nuly zpátky do hry) se ale animovat MÁ – Mrtvý muž (Fistful) se vrací se
    // dvěma životy a duch (Město duchů) se smí během svého tahu doléčit, takže postava
    // v obou případech vyjede od paty karty životů nahoru.
    if (_prevHealths && state?.players && !state.winner) {
        state.players.forEach((pp, i) => {
            const oldH = _prevHealths[i];
            if (typeof oldH === 'number' && pp.health > 0 && pp.health !== oldH) {
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

    // Fistful – Ranč: označené karty patří jedné fázi, s odchodem z ní se zahodí (jinak by
    // se starý výběr nabalil na příští Ranč, kde už ta ID nikdo nemá).
    if (state?.phase !== 'RANCH' && App.ranchSel.size) App.ranchSel.clear();

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

    // Claus "The Saint" (Fistful): vstup do fáze → odkrytá řada přiletí z balíčku
    // doprostřed stolu (Claus lícem, ostatní rubem); odchod → úklid geometrie.
    if (state?.phase === 'CLAUS_GIVE' && _prevPhase !== 'CLAUS_GIVE') {
        if (typeof startClausDeal === 'function') startClausDeal();
    } else if (_prevPhase === 'CLAUS_GIVE' && state?.phase !== 'CLAUS_GIVE') {
        if (typeof endClausDeal === 'function') endClausDeal();
    }

    // Lucky Duke: vstup → rozdej 2 karty z balíčku do panelu (vidí všichni);
    // odchod → obě karty letí do odhozu (výsledek checku animuje server zvlášť).
    if (state?.phase === 'LUCKY_DUKE' && _prevPhase !== 'LUCKY_DUKE') {
        if (typeof startLuckyDukeDeal === 'function') startLuckyDukeDeal();
    } else if (_prevPhase === 'LUCKY_DUKE' && state?.phase !== 'LUCKY_DUKE') {
        if (typeof playLuckyDukeResult === 'function') playLuckyDukeResult();
    }

    // High Noon (přibalené) – Nová identita: vstup do fáze spustí nálet odložené karty
    // doprostřed (jen u toho, kdo se rozhoduje); odchod uklidí stav cinematiky.
    if (state?.phase === 'NEW_IDENTITY' && _prevPhase !== 'NEW_IDENTITY') {
        if (state.pendingNewIdentity?.playerIdx === myIndex && myIndex !== null) {
            startNewIdentityReveal(state.pendingNewIdentity.character);
        }
    } else if (_prevPhase === 'NEW_IDENTITY' && state?.phase !== 'NEW_IDENTITY') {
        App.niReveal = null;
        App.niHideSecond = false;
        App.niHideChar = false;
    }

    if (state?._cardData && !App.allCardsData) App.allCardsData = state._cardData;
    // Naklikaná, ale ještě nepotvrzená líznutí (core/drawCounter.js – včetně resetu při
    // změně vlastníka fáze lízání, tj. u řetězu kill-rewardů: odměna za banditu → Herb Hunter).
    Object.assign(App, nextDrawCounters(App, state?.phase, state?.drawPhaseState));
    // Pedro Ramirez: server potvrdil stav → odemkni odhoz pro případné další tahy.
    App.pedroDrawLock = false;
    // Jesse Jones: totéž pro krádež z ruky soupeře (zámek drží jen do potvrzení stavu).
    App.jesseStealLock = false;

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

    // Požehnání/Prokletí – pojistka k přepečení karet v cinematice odkrytí (viz
    // high_noon_reveal). Sem se dostane divák, který přišel doprostřed hry, i konec hry
    // (activeEvent zmizí → karty zpátky do vytištěných barev). Idempotentní: když platná
    // barva sedí, neudělá nic, takže se běžný update nezdrží.
    if (gameScene) applySuitOverride(gameScene, suitOverrideForEvent(state?.activeEvent?.key));

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

// ── KONEC SLEDOVÁNÍ HRY ──────────────────────────────────────────────────────
// Divák sedí v serverovém kanálu '<roomId>_spectators' a chodí mu odtud room_update,
// animace i intro. Klik na „Opustit sledování" proto musí serveru poslat
// 'leave_spectate' (jinak nás první další broadcast vrátí z menu do hry) a než
// odhlášení doběhne, ignorujeme zprávy té místnosti i lokálně.
function stopSpectating(roomId) {
    App.ignoreRoomId = roomId || roomState?.roomId || null;
    _resetIntro();        // odchod během intra → zahoď zbytky cinematiky
    _animQ.reset();       // rozdělaná fronta patří opuštěné hře
    roomState = null; state = null; myIndex = null; _myNextGameVote = null; App.startPressed = false;
    App.spectating = false;
    App.blockInput = false;
    App.menuScreen = 'spectate_list';
    App.spectateListFetched = false;   // seznam her se načte znovu (mohl se změnit)
    if (gameScene) renderUI();
}

// Server potvrdil odhlášení z kanálu. Pořadí zpráv na jednom socketu je zaručené,
// takže starší updaty té místnosti už dorazily → filtr může jít pryč.
socket.on('spectate_left', () => { App.ignoreRoomId = null; });

// Odchod z místnosti do menu. `ignoreRoomId` se nastaví na opuštěnou hru (ne na null):
// server sice po rozpuštění místnosti nic dalšího neposílá (closeRoom v server/rooms.js),
// ale zprávy odeslané těsně předtím můžou ještě dorazit – bez filtru by nás vrátily z menu
// zpátky do hry (a člověk by v ní byl „napůl": deska se kreslí, ale hra už neexistuje).
// Filtr shodí `room_joined` (vstup do jakékoli místnosti) i klik na sledování ve view/menu.js.
function _leaveToMenu(screen) {
    App.ignoreRoomId = roomState?.roomId || null;
    clearBangSession();   // záměrný odchod → po F5 se nevracet do hry
    _resetIntro();        // odchod během intra → zahoď zbytky cinematiky (jinak se zdědí do další hry)
    _animQ.reset();       // rozdělaná fronta patří opuštěné hře – nic z ní už nedocommitovat
    roomState = null; state = null; myIndex = null; _myNextGameVote = null; App.startPressed = false;
    App.spectating = false;
    App.blockInput = false;   // zámek patřil akci v opuštěné hře
    App.menuScreen = screen;
    if (gameScene) renderUI();
}

socket.on('go_to_menu', () => {
    _leaveToMenu('main');
});

socket.on('kicked_from_game', (msg) => {
    App.kickedMsg = msg || 'Game leader ukončil hru.';
    _leaveToMenu('kicked');
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
