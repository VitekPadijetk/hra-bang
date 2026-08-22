// Render herního stolu (čistě Phaser) – vytaženo z renderUI() v game.js.
// Běží ve sdíleném globálním scope (klasický <script>): čte i přepisuje globály
// game.js (gameScene, state, myIndex, selectedState, App, socket, renderUI, …)
// a sdílené čisté funkce (computeDistance/computeCanHit). Načítá se ZA game.js.
//
// isSpectator se zde přepočítává (v renderUI byl lokál); zbytek je beze změny.

// Vera Custer: portrét kopírované postavy se v update() cyklicky přepíná (viz state.js).
// Zaregistruj portrét hráče, pokud je to Vera s aktuálně zkopírovanou postavou.
// getCharTex převede jméno postavy na texturu. Bez efektu pro ne-Veru / bez kopie.
function registerVeraPortrait(sprite, player, getCharTex) {
    if (!sprite || !player) return;
    if (player.character !== 'Vera Custer' || !player._copiedCharacter) return;
    if (player._noAbility) return;   // Kocovina (High Noon): kopie neplatí → jen Vera
    if (player._copiedCharacter === 'Vera Custer') return;
    // Vyřazená Vera už žádnou schopnost nekopíruje – na jejím místě zůstane Vera.
    // (Duch z Města duchů má 0 životů, ale ve hře je → tomu problikávání zůstává.)
    if (!isInPlay(player)) return;
    App.veraPortraits.push({
        sprite,
        selfTex: getCharTex('Vera Custer'),
        copyTex: getCharTex(player._copiedCharacter),
        // Původní obarvení (zvýraznění tahu/čekání/mrtvý) – během „vlastní Very" fáze
        // ho vrátíme; během kopie ho přebije jemný zelený nádech.
        baseTint: sprite.isTinted ? sprite.tintTopLeft : null,
        // Základní scaleX (pro plynulý překlopení-přechod mezi Verou a kopií).
        baseScaleX: sprite.scaleX,
    });
}

// ── Rozsvícení hráče na tahu ─────────────────────────────────────────────────
// Postava hráče, který je na tahu, je zeleně obarvená. Naskočit naráz vypadalo tvrdě
// (nejvíc na startu hry, kdy se šerif rozsvítil ve stejný okamžik, jako se objevila
// deska), takže se obarvení plynule nafaduje z neobarvené karty. Fade je vázaný na
// ČAS změny tahu (App.turnTintStart), ne na sprite – renderUI karty vytváří znovu při
// každém překreslení, takže by tween jinak pokaždé začínal od nuly.
const TURN_TINT = 0x88ff88;
const TURN_TINT_MS = 420;

function _turnTintAt(t) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(0xffffff),
        Phaser.Display.Color.IntegerToColor(TURN_TINT),
        100, Math.max(0, Math.min(100, Math.round(t * 100))));
    return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

// Claus "The Saint" (Fistful): komu se právě vybírá karta z odkryté řady – jeho postava
// se rozsvítí, ať je u stolu vidět, PRO KOHO ta karta je (nejdřív Claus sobě, pak po
// směru ostatním). Jediný zdroj pravdy je clausState.toIdx ze serveru.
const CLAUS_TINT = 0xffff44;
function clausTargetIdx() {
    return (state?.phase === 'CLAUS_GIVE' && state.clausState) ? state.clausState.toIdx : null;
}

function applyTurnTint(sprite) {
    if (!sprite) return;
    const t0 = App.turnTintStart || 0;
    const el = t0 ? Date.now() - t0 : TURN_TINT_MS;
    if (el >= TURN_TINT_MS) { sprite.setTint(TURN_TINT); return; }
    sprite.setTint(_turnTintAt(el / TURN_TINT_MS));
    gameScene.tweens.addCounter({
        from: el, to: TURN_TINT_MS, duration: TURN_TINT_MS - el, ease: 'Sine.easeOut',
        onUpdate: (tw) => { if (sprite.active) sprite.setTint(_turnTintAt(tw.getValue() / TURN_TINT_MS)); },
    });
}

function renderGameBoard() {
    const isSpectator = myIndex === null && !!state;

    // Změna hráče na tahu → jeho postava se rozsvítí plynule (applyTurnTint).
    if (state && App.lastCurrentIdx !== state.currentPlayerIndex) {
        App.lastCurrentIdx = state.currentPlayerIndex;
        App.turnTintStart = Date.now();
    }

    // Reflow slide: v tomto renderu si značíme, které karty jsme viděli (App._cardSeen),
    // po dokreslení desky (pruneCardSlides) se nepoužité klíče uklidí.
    App._cardSeen = new Set();
    // Vera Custer: seznam portrétů k cyklickému přepínání se staví od nuly každý render
    // (sprity jsou nové). scene.update() pak jen animuje aktuální seznam.
    App.veraPortraits = [];

    const centerX = 1920 / 2;
    const centerY = 1080 / 2;
    const getTex = (id) => {
        if (id === null || id === undefined) return 'card_back';
        const t = texIdOf(id);   // creative karta má vlastní id, grafiku pod texId
        return gameScene.textures.exists('card_' + t) ? 'card_' + t : 'placeholder';
    };

    const getCharTex = (name) => {
        if (!name) return 'placeholder';
        let charData = gameScene.cache.json.get('characters_data');
        if (!charData) return 'placeholder';
        let charInfo = charData.find(c => c.name === name);
        if (!charInfo) return 'placeholder';
        return gameScene.textures.exists('char_' + charInfo.id) ? 'char_' + charInfo.id : 'placeholder';
    };

    // Profil rozložení (core/layout.js) – jediný zdroj geometrie desky. positions.js
    // čte tentýž profil, takže zacílení animací a vykreslení nemůžou utéct od sebe.
    const L = currentLayout();
    const scaleMe = L.scaleMe;
    // Měřítko karet soupeře závisí na jejich POČTU: kompaktní řada (mobil) si ho dopočítá
    // ze šířky sloupce, okruh ho při 7 soupeřích (8 hráčů) zmenší podle oppScaleByCount.
    // Proto vždy přes oppScale, nikdy z L.scaleOpp napřímo.
    const scaleOpp = oppScale(L, state.players.length - 1);
    const scaleDeck = L.scaleDeck;

    const anchors = getOpponentAnchors(state.players.length);

    const me = state.players[isSpectator ? 0 : myIndex];

    // --- 1. BALÍČKY ---
    const isMyDraw = drawDrawPiles({ getTex, scaleDeck, me, L });
    drawEventPile({ scaleDeck }, 'hn');
    drawEventPile({ scaleDeck }, 'ff');

    const handlePanicCBClick = (targetIdx, area, boardIdx = null) => {
        // Zelená karta se steal/discard efektem ze stolu (Krytý vůz / Kankán): klik na
        // kartu soupeře = cíl aktivace. Pošleme activate_green_card.
        if (selectedState.greenCardId != null &&
            (selectedState.action === 'DE_STEAL' || selectedState.action === 'GREEN_DISCARD')) {
            socket.emit('activate_green_card', { playerIdx: myIndex, cardId: selectedState.greenCardId, target: { targetIdx, area, boardIdx } });
            selectedState = { cardIndex: null, action: null };
            App.blockInput = true;
            renderUI();
            return true;
        }
        // Ragtime (DE_STEAL): klik na kartu soupeře = zvolení CÍLE efektu „odhoď další
        // kartu". Pošleme cíl (hráč + konkrétní karta); server přejde na výběr ceny.
        if (selectedState.action === 'DE_STEAL' && selectedState.cardIndex !== null) {
            socket.emit('discard_extra_choose', { cardIdx: selectedState.cardIndex, targetIdx, area, boardIdx });
            selectedState = { cardIndex: null, action: null };
            App.blockInput = true;
            renderUI();
            return true;
        }
        // Server-driven výběr karty (Dodge City: Rvačka odhazuje po směru).
        // pendingSelection už na serveru existuje – jen pošli, kterou kartu vzít.
        if (state.phase === 'SELECTING_TARGET_CARD' && state.pendingSelection?.attackerIdx === myIndex &&
            state.pendingSelection?.targetIdx === targetIdx) {
            // targetIdx = pro KOHO kartu vybírám. Server podle něj pozná opožděný klik do
            // už vyřízeného výběru (Rvačka/Vulture split posune výběr na dalšího hráče,
            // aktér zůstává stejný) a zahodí ho – viz server/guard.js.
            socket.emit('select_target_card', { attackerIdx: myIndex, targetIdx, area, cardIdx: boardIdx });
            App.blockInput = true;
            renderUI();
            return true;
        }
        if (!['Panika!', 'Cat Balou'].includes(selectedState.action) || selectedState.cardIndex === null) return false;

        if (selectedState.action === 'Panika!' && targetIdx !== myIndex) {
            const dist = computeDistance(state, myIndex, targetIdx);
            if (dist > 1) return false;
        }

        const capturedIdx = selectedState.cardIndex;
        socket.emit('play_special', {
            attackerIdx: myIndex,
            targetIdx: targetIdx,
            cardIdx: capturedIdx
        });
        setTimeout(() => {
            socket.emit('select_target_card', { attackerIdx: myIndex, targetIdx, area: area, cardIdx: boardIdx });
        }, 50);
        // Klik je odeslán → zhasni zvýraznění a zamkni vstup do dojezdu animace (odemkne
        // ho až nový stav). Jinak jde v mezičase kliknout na další kartu a rozjet druhou
        // paniku/CB, kterou už ruka nemá čím zaplatit.
        App.blockInput = true;

        // Kartu (Panika/Cat Balou) NEodebíráme z ruky hned – nechť v ní zůstane, dokud
        // ji nezvedne letová animace (viz _liftCardFromHand v card_animation). Jinak
        // by z ruky zmizela dřív, než animace začne (vizuální „předčasné" zmizení).
        // Pozici slotu si ale zapamatuj (jako u běžného zahození) – kdyby kartu z ruky
        // odebral dřív room_update, ať panika/CB stále vyletí přesně z jejího slotu, ne
        // z obecné kotvy ruky (jinak by „naskočila" jinde a už otočená).
        const playedCard = state?.players?.[myIndex]?.hand?.[capturedIdx];
        if (playedCard?.id != null) {
            App.playedCardFromPos[playedCard.id] =
                getHandSlotPos(myIndex, capturedIdx, state.players[myIndex].hand.length);
        }
        selectedState = { cardIndex: null, action: null };
        renderUI();
        return true;
    };

    // --- 2. SOUPEŘI ---
    drawOpponents({ anchors, scaleOpp, getTex, getCharTex, isMyDraw, handlePanicCBClick, L });

    if (me && !isSpectator) drawMyArea({ me, scaleMe, getTex, getCharTex, handlePanicCBClick, L });

    // --- SPECTATOR: hráč 0 dole ---
    if (isSpectator && me) drawSpectatorPlayer({ me, getTex, getCharTex, L });

    drawPhaseOverlays({ getTex, me, L });

    // Reflow slide: karty jsou dokresleny → ukliď klíče karet, které v tomto renderu nebyly.
    pruneCardSlides();

    if (isSpectator) {
        let specBg = gameScene.add.rectangle(960, 40, 400, 55, 0x000000, 0.7);
        gameScene.cardsSprites.add(specBg);
        let specTxt = gameScene.add.text(960, 40, '👁 DIVÁK – hra právě probíhá',
            { fontSize: '22px', color: '#aaa' }).setOrigin(0.5);
        gameScene.cardsSprites.add(specTxt);
        return;
    }
}


// Cinematika vyřazení hráče (core/deathAnim.js): dokud postava klesá na nulu a
// odhazuje karty, patří karty pořád jemu a kreslí se – jen postupně mizí, jak
// odlétají (App.stealHideIds / App.deathHandHide). Teprve fáze 'settled' má stůl
// i ruku prázdné a drží jen slot pro kartu role, která zrovna letí doprostřed.
// Totéž platí po celou dobu dělení karet mezi víc Vulture Samů: karty mrtvého leží
// dál na svém místě (je z čeho vybírat) a role se odhalí až po rozdělení.
function deathCardsStillShown(playerIdx) {
    if (App.vultureSplitIdx === playerIdx) return true;
    const s = App.deathSeq[playerIdx];
    return s === 'dying' || s === 'discarding';
}

// Šerifova hvězda leží prostorově NAD kartou postavy, takže musí být nad kartami
// vyloženými vedle ní (modré/zelené/zbraň se kreslí až po ní → bez depth by je měla
// pod sebou a schovaly by ji). Pod jmenovkami (50) a overlaye (200+) zůstává.
const STAR_DEPTH = 46;

// Zásah / vyléčení (Návrh 1): postava se posune po kartě životů o bulletH × Δživotů
// správným směrem. Plovoucí sprite (mimo cardsSprites → přežije re-render) jede ze
// staré pozice na aktuální (tx,ty = pozice pro nové životy); statická postava je po
// tu dobu skrytá. dirX/dirY = směr posunu o +1 život. Vrací true → statickou skrýt.
function runHealthSlide(playerIdx, curHealth, tx, ty, bulletH, dirX, dirY, angle, scale, charTex, starOpts) {
    const anim = App.healthAnims[playerIdx];
    if (!anim) return false;
    const delta = curHealth - anim.fromHealth;
    if (delta === 0) { delete App.healthAnims[playerIdx]; return false; }
    if (!anim.sprite || !anim.sprite.active) {
        const sx = tx - dirX * bulletH * delta;
        const sy = ty - dirY * bulletH * delta;
        const spr = gameScene.add.image(sx, sy, charTex).setScale(scale).setAngle(angle).setDepth(45);
        anim.sprite = spr;
        const ref = anim;
        // Šerifova hvězda jede spolu s postavou (prostorově NAD kartou postavy) – jinak by
        // zůstala na nové pozici, zatímco postava klouže. Statickou hvězdu volající vynechá.
        let starSpr = null;
        if (starOpts) {
            starSpr = gameScene.add.image(sx + starOpts.dx, sy + starOpts.dy, 'sheriff_star')
                .setScale(starOpts.scale).setAngle(angle).setDepth(STAR_DEPTH);
            gameScene.tweens.add({ targets: starSpr, x: tx + starOpts.dx, y: ty + starOpts.dy, duration: 280, ease: 'Cubic.easeOut' });
        }
        gameScene.tweens.add({
            targets: spr, x: tx, y: ty, duration: 280, ease: 'Cubic.easeOut',
            onComplete: () => {
                if (spr.active) spr.destroy();
                if (starSpr?.active) starSpr.destroy();
                if (App.healthAnims[playerIdx] === ref) delete App.healthAnims[playerIdx];
                if (typeof renderUI === 'function') renderUI();
            }
        });
    }
    return true;
}

// ── Reflow slide: plynulé přeskládání karet v ruce / na stole ─────────────────
// Když se změní počet karet, ostatní nemají skočit na nové místo, ale doklouzat.
// Idiom je stejný jako runHealthSlide: plovoucí sprite žije MIMO cardsSprites (přežije
// re-render), statická (interaktivní) verze se po dobu klouzání skryje. `key` = stabilní
// identita karty napříč rendery (u ruky card.id, u rubů soupeřů per-slot). Voláme těsně
// po vytvoření statického spritu na jeho cílové (x,y).
const REFLOW_MS = 240;
// Jak dlouho se Colt .45 nafaduje, když nahradí sebranou/zničenou zbraň (drawMyArea).
const COLT_FADE_MS = 320;
function reflowCard(key, staticSprite, x, y, tex, scale, angle, depth = 0) {
    App._cardSeen.add(key);
    // Statická karta je po dobu klouzání skrytá, takže obarvení musí převzít ta plovoucí –
    // jinak karta během přeskládání ztratí zvýraznění (červené „musíš odhodit" na konci
    // tahu mizelo přesně těm kartám, které se zrovna posouvaly). Přenáší se při každém
    // renderu, aby změna zvýraznění za letu (konec fáze, výběr) dosedla i na klouzající.
    const syncTint = (spr) => {
        if (!spr?.active) return;
        if (staticSprite?.isTinted) spr.setTint(staticSprite.tintTopLeft);
        else spr.clearTint();
    };
    // Klouzající (plovoucí) sprite musí v display-listu ležet přesně tam, kde leží jeho
    // statická karta – jinak se pořadí vrstev rozpadne. Statické karty renderUI vytváří
    // znovu každý snímek (tedy AŽ ZA přeživšími plovoucími), takže karta, která se zrovna
    // neposouvá (typicky ta úplně vlevo, která je ukotvená), se ocitla NAD všemi
    // klouzajícími, ačkoli patří dolů. Přerovnáme proto plovoucí sprite pod jeho statický
    // protějšek při KAŽDÉM renderu (statická je po dobu klouzání skrytá, takže se tím
    // jen zdědí její místo ve vrstvách).
    const stackUnderStatic = (spr) => {
        if (!spr?.active || !staticSprite?.active) return;
        if (gameScene.children?.moveBelow) gameScene.children.moveBelow(spr, staticSprite);
    };
    const slide = App.cardSlides[key];
    if (slide) {
        syncTint(slide.sprite);
        stackUnderStatic(slide.sprite);
        // Klouzání už běží → drž statickou skrytou, plovoucí doletí sama. Když se cíl
        // za letu změnil (další přeskládání), přesměruj tween (jako retargetDrawAnims).
        if (slide.tween && (slide.tx !== x || slide.ty !== y)) {
            slide.tx = x; slide.ty = y;
            slide.tween.updateTo('x', x, true);
            slide.tween.updateTo('y', y, true);
        }
        staticSprite.setVisible(false);
        App.cardHome[key] = { x, y };
        return;
    }
    const home = App.cardHome[key];
    if (home && (Math.abs(home.x - x) > 0.5 || Math.abs(home.y - y) > 0.5)) {
        // Depth 0 (jako statické karty): renderUI přeplňuje cardsSprites každý frame, takže
        // statické karty se do display-listu vloží PO tomto (přežívajícím) slide spritu →
        // klouzající karta zůstane POD čerstvě dosednutou/statickou kartou (dřív depth 30 ji
        // chybně kreslil NAD novou kartu). Pozadí je vloženo dřív, takže slide je nad ním.
        // Výjimka: co má vlastní depth i staticky (šerifova hvězda), si ho drží i za letu.
        const spr = gameScene.add.image(home.x, home.y, tex).setScale(scale).setAngle(angle).setDepth(depth);
        syncTint(spr);
        stackUnderStatic(spr);
        const rec = { sprite: spr, tx: x, ty: y };
        rec.tween = gameScene.tweens.add({
            targets: spr, x, y, duration: REFLOW_MS, ease: 'Cubic.easeOut',
            onComplete: () => {
                if (spr.active) spr.destroy();
                if (App.cardSlides[key] === rec) delete App.cardSlides[key];
                if (typeof renderUI === 'function') renderUI();
            }
        });
        App.cardSlides[key] = rec;
        staticSprite.setVisible(false);
    }
    App.cardHome[key] = { x, y };
}

// Po dokreslení desky proberou nepoužité klíče: karta, která zmizela (odešla z ruky,
// hráč umřel, změnil se pohled…), nesmí příště klouzat z dávné pozice. Běžící slide
// takové karty ukonči a plovoucí sprite ukliď.
function pruneCardSlides() {
    for (const key in App.cardHome) {
        if (!App._cardSeen.has(key)) delete App.cardHome[key];
    }
    for (const key in App.cardSlides) {
        if (App._cardSeen.has(key)) continue;
        const rec = App.cardSlides[key];
        if (rec?.tween) rec.tween.stop();
        if (rec?.sprite?.active) rec.sprite.destroy();
        delete App.cardSlides[key];
    }
}

// Tvrdý reset klouzání: zapomeň všechny domovské pozice a ukliď rozjeté slidy. Volá se,
// když deska začíná „od nuly" (start hry po intru, debug start, návrat z výběru postav /
// vítězné obrazovky) – v cardHome jsou tehdy pozice z PŘEDCHOZÍ hry a každá karta i
// postava by doklouzala z dávného místa. Vypadalo to jako posun všech postav o kousek,
// i když se reálně nic neposunulo (statická karta už ležela na správném místě).
// Stejně tak zahoď nedojeté posuny životů – patřily k minulé hře.
function resetBoardSlides() {
    for (const key in App.cardSlides) {
        const rec = App.cardSlides[key];
        if (rec?.tween) rec.tween.stop();
        if (rec?.sprite?.active) rec.sprite.destroy();
    }
    App.cardSlides = {};
    App.cardHome = {};
    // Deska začíná „od nuly": Colt .45 ani zvýraznění hráče na tahu nesmí naskočit
    // fade-inem/rozsvícením – z intra už oboje na svém místě je.
    App.coltVisible = null;
    App.coltFadeStart = 0;
    App.lastCurrentIdx = null;
    App.turnTintStart = 0;
    for (const idx in App.healthAnims) {
        const spr = App.healthAnims[idx]?.sprite;
        if (spr?.active) spr.destroy();
    }
    App.healthAnims = {};
}

// Plynulý posun „statické" postavy / životů / šerifovy hvězdy, když se skupina soupeře
// přeskládá (přibude/ubyde karta na boardu → skupina se přecentruje a postava se posune).
// Reuse reflowCard (klouže z minulé pozice na novou). Když ale zrovna běží health-slide
// (postava jede po liště životů), nech pohyb na runHealthSlide a jen udrž home + skryj
// statický sprite, ať se nepokusí klouzat podruhé. Board-změna a health-změna u téhož
// hráče nenastávají zároveň (modrá karta vs zásah), takže si nekonkurují.
function reflowStatic(key, sprite, tex, scale, angle, sliding, depth = 0) {
    if (sliding) {
        App._cardSeen.add(key);
        App.cardHome[key] = { x: sprite.x, y: sprite.y };
        sprite.setVisible(false);
        return;
    }
    reflowCard(key, sprite, sprite.x, sprite.y, tex, scale, angle, depth);
}

// ── Soupeři kolem stolu (vykresleno relativně k mému indexu) ──────────────────
function drawOpponents(ctx) {
    const { anchors, scaleOpp, getTex, getCharTex, isMyDraw, handlePanicCBClick, L } = ctx;

    // Hráč, na kterého hra čeká mimo normální tah (Suzy líže, kontrola, reakce…) → jantarové zvýraznění.
    const _waiting = (typeof waitingStatus === 'function') ? waitingStatus(state) : null;
    const WAIT_TINT = 0xffb84d;

    const renderMyIndex = myIndex ?? 0;
    let oppIdx = 0;
    for (let i = 1; i < state.players.length; i++) {
        let actualIdx = (renderMyIndex + i) % state.players.length;
        let player = state.players[actualIdx];
        let anchor = anchors[oppIdx];
        oppIdx++;
        // Kotva pro tenhle počet soupeřů v tabulce chybí (getOpponentAnchors vrátí []).
        // Ostatní konzumenti kotev mají fallback, tady by `anchor.side` níž hru shodil –
        // radši soupeře nevykreslit než ztuhnout na hnědé obrazovce.
        if (!anchor) continue;

        const panicInRange = selectedState.action !== 'Panika!' ||
            computeDistance(state, myIndex, actualIdx) <= 1;
        const isPanicCBActive = ['Panika!', 'Cat Balou'].includes(selectedState.action);
        // Ragtime (DE_STEAL) i zelené Krytý vůz (steal) / Kankán (discard): klik na kartu
        // libovolného živého soupeře bez ohledu na vzdálenost.
        const isDeSteal = selectedState.action === 'DE_STEAL' || selectedState.action === 'GREEN_DISCARD';
        // Server-driven výběr karty (Rvačka): klikatelné jsou karty právě vybíraného cíle.
        const isServerCardSelect = state.phase === 'SELECTING_TARGET_CARD' &&
            state.pendingSelection?.attackerIdx === myIndex &&
            state.pendingSelection?.targetIdx === actualIdx;
        // !App.blockInput: klik na kartu odemyká zvýraznění AŽ nový stav (dorazí po dojezdu
        // animace, viz core/animQueue.js). Do té doby drží stav pořád starý pendingSelection,
        // takže bez tohohle šlo klikat dál – u Rvačky/dělení mezi Vulture Samy se druhý klik
        // (do stále zvýrazněné ruky už vyřízeného hráče) vyhodnotil jako výběr karty DALŠÍHO
        // hráče v pořadí. Stejně to platí pro Paniku/Cat Balou/Ragtime/zelené krádeže.
        const canTargetThisPlayer = !App.blockInput && (
            (isPanicCBActive && panicInRange && player.health > 0) ||
            (isDeSteal && player.health > 0) || isServerCardSelect);
        // Pat Brennan (Dodge City): ve své fázi lízání smí místo balíčku vzít 1 kartu ze
        // stolu libovolného hráče do ruky (klik na kartu na stole soupeře).
        // !App.blockInput: jakmile Pat kliknutím vezme kartu (nastaví blockInput), zvýraznění
        // i klikatelnost karet na stole HNED zmizí (nečekej na room_update na konci animace) –
        // jinak jde na ně klikat znovu a spustit „falešnou" animaci karty, co nedoletí do ruky.
        const isPatDraw = isMyDraw && !App.blockInput && (state.drawPhaseState?.options || []).includes('board') &&
            state.drawPhaseState?.cardsDrawn === 0 && player.health > 0;

        let isCurrent = state.currentPlayerIndex === actualIdx;
        const isWaiting = !!_waiting && _waiting.idx === actualIdx && actualIdx !== state.currentPlayerIndex;
        const isClausTarget = clausTargetIdx() === actualIdx;
        const cardW = 325 * scaleOpp;
        const cardH = 500 * scaleOpp;
        const gap = L.oppGap;

        const bulletsH = cardH * 0.93;
        const bulletH = bulletsH / 5;

        let allBoardCards = [];
        if (player.weapon && player.weapon.id !== -1) allBoardCards.push(player.weapon);
        if (player.board) allBoardCards.push(...player.board);

        // Fallback je RUB, ne 'role_001' (bandita): roli chvíli neznáme (stav ji do konce
        // cinematiky vyřazení schovává – viz redactState), a nakreslit místo ní banditu
        // znamená ukázat lež, kterou pak příchozí stav „opraví" na jinou kartu.
        const deadRoleMap = { 'Sheriff': 'role_000', 'Outlaw': 'role_001', 'Renegade': 'role_002', 'Deputy': 'role_003' };
        // Duch (Město duchů) má roli odkrytou od svého vyřazení – i když si během svého
        // tahu naléčí životy, karta role mu ze stolu zmizet nesmí (`_ghost` proto zůstává
        // „mrtvý" pro slot role; cílení a interakci řeší `isDead && !player._ghost` níž).
        const isDead = player.health <= 0 || !!player._ghost;
        // Cinematika vyřazení (core/deathAnim.js): dokud hráč klesá na nulu a odhazuje
        // karty, kreslí se jeho místo pořád ještě BEZ karty role – ta se odhaluje až
        // nakonec. Ve fázi 'settled' je slot role rezervovaný (postava se k němu posune),
        // ale karta se nekreslí: zrovna letí doprostřed obrazovky a teprve doletí sem.
        const _deathStage = App.deathSeq[actualIdx] || null;
        // Hra pro 3 (Město duchů): karta role leží lícem nahoru u každého od začátku hry –
        // je to týž slot, jaký dostane vyřazený hráč (MUSÍ zrcadlit getBoardCardPos
        // v positions.js, jinak by animace mířily o kartu vedle).
        const _roleSlot = !!state.mode3p || (isDead && !deathCardsStillShown(actualIdx));
        const displayCards = _roleSlot
            ? [{ _isRole: true, _roleTex: deadRoleMap[player.role] || 'role_card_back' }, ...allBoardCards]
            : allBoardCards;

        const numBluePrimary = Math.min(displayCards.length, L.oppBoardPerRow);
        // Pás vyložených karet – MUSÍ zrcadlit getBoardCardPos v positions.js. Řady jsou
        // zastropované (rostou k balíčkům uprostřed stolu), přeplněná řada se místo další
        // řady jen zhustí. `row` = napříč řadami (dovnitř stolu), `col` = podél řady.
        const oppBand = boardBand(displayCards.length, L.oppBoardRows, L.oppBoardPerRow, cardW, gap);

        // oppHandHideCount: dočasně skryté karty v ruce soupeře, které k němu právě LETÍ
        // (Kit Carlson – vybraná karta). Objeví se v ruce teprve po dosednutí animace,
        // ne hned s room_update. Klíč = reálný index hráče.
        //   handFan = kolik karet ruka NAKONEC bude (vějíř se rozestupem počítá z tohoto),
        //   handLen = kolik se jich právě kreslí (skryté jsou vždy ty poslední).
        // Bez odděleného handFan mířily letící karty na sloty finálního vějíře, zatímco se
        // ruka kreslila po starém – dosedaly namačkané na sebe a srovnaly se až s příchodem
        // stavu (nejvíc vidět u Vulture Sama, kterému přiletí celá ruka mrtvého naráz).
        const handFan = player.hand.length;
        const handLen = Math.max(0, handFan - (App.oppHandHideCount?.[actualIdx] || 0));

        const addCharInteraction = (sprite) => {
            // Duch (Město duchů, High Noon) je na svůj tah zpátky ve hře – kreslí se
            // jako hráč na tahu a dá se na něj cílit, i když má 0 životů.
            if (isDead && !player._ghost) {
                sprite.setInteractive({ useHandCursor: false });
                return;
            }

            const isShoot = selectedState.action === 'SHOOT';
            const isDuel = selectedState.action === 'Duel';
            const isJail = selectedState.action === 'Vězení';
            // Dodge City „odhoď další kartu" – volba cíle PŘED zaplacením: Tequila (DE_HEAL)
            // léčí zvoleného hráče, Springfield (DE_BANG) na něj vystřelí bang-efekt.
            const deMode =
                selectedState.action === 'DE_BANG' ? 'bang' :
                selectedState.action === 'DE_HEAL' ? 'heal' : null;
            const deValid = !deMode ? false : (deMode === 'bang'
                ? player.health > 0
                : (isInPlay(player) && player.health < player.maxHealth));   // duch (Město duchů) se léčit smí
            const canActuallyTarget = (
                (isShoot && computeCanHit(state, myIndex, actualIdx, selectedState.reach)) ||
                isDuel ||
                (isJail && player.role !== "Sheriff" && !(player.board||[]).some(c => c.type === "Vězení")) ||
                (deMode && deValid)
            );
            // Jediné setInteractive s korektním kurzorem (opakované volání by kurzor nepřepsalo).
            sprite.setInteractive({ useHandCursor: canActuallyTarget });
            sprite._zoomKey = 'char:' + actualIdx;   // stabilní klíč zoomu (přežije překreslení)

            if (isShoot) {
                    const canShoot = computeCanHit(state, myIndex, actualIdx, selectedState.reach);
                    sprite.setTint(canShoot ? 0x88ff88 : 0xff6666);
                } else if (isDuel) {
                    sprite.setTint(0x88ff88);
                } else if (isJail) {
                    const alreadyJailed = (player.board || []).some(c => c.type === "Vězení");
                    const isSheriff = player.role === "Sheriff";
                    sprite.setTint((!alreadyJailed && !isSheriff) ? 0x88ff88 : 0xff6666);
                } else if (isCurrent) {
                    sprite.setTint(0x88ff88);
                } else if (isWaiting) {
                    sprite.setTint(WAIT_TINT);
                }

            sprite.on('pointerdown', () => {
                if (selectedState.action === 'SHOOT' && (selectedState.cardIndex !== null || selectedState.greenCardId != null || selectedState.doc)) {
                    if (computeCanHit(state, myIndex, actualIdx, selectedState.reach)) {
                        if (selectedState.doc) {
                            // Doc Holyday: 2 odhozené karty + cíl → bang-efekt.
                            socket.emit('doc_holyday', { cardIndices: selectedState.doc.staged, targetIdx: actualIdx });
                        } else if (selectedState.greenCardId != null) {
                            // Aktivace zelené bang-efekt karty ze stolu (Pepperbox/Nůž/…).
                            socket.emit('activate_green_card', { playerIdx: myIndex, cardId: selectedState.greenCardId, target: { targetIdx: actualIdx } });
                        } else {
                            const capturedIdx = selectedState.cardIndex;
                            socket.emit('play_bang', { attackerIdx: myIndex, targetIdx: actualIdx, cardIdx: capturedIdx });
                            optimisticRemoveCard(capturedIdx);
                        }
                        state.phase = "RESPOND";
                        selectedState = { cardIndex: null, action: null };
                        App.blockInput = true;
                        renderUI();
                    } else {
                        sprite.setTint(0xff2222);
                        gameScene.time.delayedCall(300, () => renderUI());
                    }
                    return;
                }
                if (['Duel', 'Vězení'].includes(selectedState.action) && selectedState.cardIndex !== null) {
                    if (selectedState.action === 'Vězení') {
                        const alreadyJailed = (player.board || []).some(c => c.type === "Vězení");
                        if (player.role === "Sheriff" || alreadyJailed) {
                            sprite.setTint(0xff2222);
                            gameScene.time.delayedCall(300, () => renderUI());
                            return;
                        }
                    }
                    const capturedIdx = selectedState.cardIndex;
                    socket.emit('play_special', { attackerIdx: myIndex, targetIdx: actualIdx, cardIdx: capturedIdx });
                    optimisticRemoveCard(capturedIdx);
                    if (selectedState.action === 'Duel') state.phase = "RESPOND";
                    selectedState = { cardIndex: null, action: null };
                    App.blockInput = true;
                    renderUI();
                }
            });

            sprite.on('pointerover', () => {
                startCardZoom(getCharTex(player.character), 'char:' + actualIdx);
                if (selectedState.action === 'SHOOT') {
                    sprite.setTint(computeCanHit(state, myIndex, actualIdx, selectedState.reach) ? 0x00ff00 : 0xff0000);
                    sprite.setScale(scaleOpp * 1.1);
                } else if (selectedState.action === 'Duel') {
                    sprite.setTint(0x00ff00);
                    sprite.setScale(scaleOpp * 1.1);
                } else if (selectedState.action === 'Vězení') {
                    const alreadyJailed = (player.board || []).some(c => c.type === "Vězení");
                    const isSheriff = player.role === "Sheriff";
                    sprite.setTint((!alreadyJailed && !isSheriff) ? 0x00ff00 : 0xff0000);
                    sprite.setScale(scaleOpp * 1.1);
                } else if (!['SHOOT','Duel','Vězení'].includes(selectedState.action)) {
                    if (isCurrent) sprite.setTint(0xaaffaa);
                }
            });

            sprite.on('pointerout', () => {
                scheduleZoomFade();
                sprite.setScale(scaleOpp);
                if (selectedState.action === 'SHOOT') sprite.setTint(computeCanHit(state, myIndex, actualIdx, selectedState.reach) ? 0x88ff88 : 0xff6666);
                else if (selectedState.action === 'Duel') sprite.setTint(0x88ff88);
                else if (selectedState.action === 'Vězení') {
                    const aj = (player.board || []).some(c => c.type === "Vězení");
                    sprite.setTint((!aj && player.role !== "Sheriff") ? 0x88ff88 : 0xff6666);
                } else if (isCurrent) sprite.setTint(0x88ff88);
                else if (isWaiting) sprite.setTint(WAIT_TINT);
                else sprite.clearTint();
            });

            // Klik na cíl efektu „odhoď další kartu" (Tequila léčí / Springfield bang).
            // (Ragtime = klik na kartu soupeře, viz handlePanicCBClick.) Kurzor už řeší
            // canActuallyTarget výše – tady jen tint + interakce.
            if (deMode) {
                sprite.setTint(deValid ? 0x88ff88 : 0xff6666);
                sprite.on('pointerover', () => { if (deValid) { sprite.setTint(0x00ff00); sprite.setScale(scaleOpp * 1.1); } });
                sprite.on('pointerout', () => { sprite.setScale(scaleOpp); sprite.setTint(deValid ? 0x88ff88 : 0xff6666); });
                sprite.on('pointerdown', () => {
                    if (!deValid) return;
                    socket.emit('discard_extra_choose', { cardIdx: selectedState.cardIndex, targetIdx: actualIdx });
                    selectedState = { cardIndex: null, action: null };
                    App.blockInput = true;
                    renderUI();
                });
            }
        };

        const drawBoardCard = (x, y, card, angle, bIdx) => {
            // Karta právě ukradená Panikou/Cat Balou: po dobu letu ji nekresli (slot
            // ale zůstává obsazený – jiné karty se neposunou), objeví se zpět po doletu.
            // Stejnou cestou mizí i karty odlétající při smrti – jedna po druhé.
            if (!card._isRole && App.stealHideIds.has(card.id)) return;
            // Karta role letí zrovna doprostřed obrazovky (odhalení) – slot drž prázdný.
            if (card._isRole && _deathStage === 'settled') return;
            const tex = card._isRole ? card._roleTex : getTex(card.id);
            let bCard = gameScene.add.image(x, y, tex).setScale(scaleOpp).setAngle(angle);

            bCard.setInteractive({ useHandCursor: (canTargetThisPlayer || isPatDraw) && !card._isRole });
            // Zvětšit jde i karta role (vyřazený hráč / hra pro 3) – text na ní je vysázený
            // drobně a v herní velikosti se nedá přečíst. Klik na ni nikdy nejde (kurzor
            // zůstává šipkou), klíč zoomu je stejný jako u mojí role v drawMyArea.
            const zoomKey = card._isRole ? ('role:' + actualIdx) : card.id;
            bCard._zoomKey = zoomKey;
            bCard.on('pointerover', () => startCardZoom(tex, zoomKey));
            bCard.on('pointerout', scheduleZoomFade);

            if (canTargetThisPlayer && !card._isRole) {
                bCard.setTint(0xffff44);
                bCard.on('pointerdown', () => {
                    const realBIdx = bIdx - (_roleSlot ? 1 : 0);
                    const hasWeapon = player.weapon && player.weapon.id !== -1;
                    const isWeapon = hasWeapon && realBIdx === 0;
                    const boardIdx = isWeapon ? null : (hasWeapon ? realBIdx - 1 : realBIdx);
                    handlePanicCBClick(actualIdx, isWeapon ? 'weapon' : 'board', boardIdx);
                });
            } else if (isPatDraw && !card._isRole) {
                // Pat Brennan: klik na kartu ze stolu soupeře = vezmi si ji (konec lízání).
                bCard.setTint(0xffff44);
                bCard.on('pointerdown', () => {
                    const realBIdx = bIdx - (_roleSlot ? 1 : 0);
                    const hasWeapon = player.weapon && player.weapon.id !== -1;
                    const isWeapon = hasWeapon && realBIdx === 0;
                    const boardIdx = isWeapon ? null : (hasWeapon ? realBIdx - 1 : realBIdx);
                    socket.emit('draw_card', { source: 'board', sourceIdx: actualIdx, area: isWeapon ? 'weapon' : 'board', cardIdx: boardIdx });
                    App.blockInput = true;
                    renderUI();
                });
            }
            gameScene.cardsSprites.add(bCard);
            // Reflow slide: modré/výzbroj soupeře se přeskládají plynule (klíč = id karty).
            reflowCard('ob' + actualIdx + '_' + (card._isRole ? 'role' : card.id), bCard, x, y, tex, scaleOpp, angle);
        };

        // scl = měřítko rubu; kompaktní řada (mobil) kreslí vějíř ruky menší než
        // vyložené karty, jinak se použije měřítko soupeře.
        const drawHandCard = (x, y, angle, slot, scl) => {
            const hScale = scl || scaleOpp;
            // Smrt: karta z tohoto slotu už odletěla do odhozu / k Vulture Samovi.
            // Slot zůstává prázdný, zbytek vějíře se pod ní nepřeskládá.
            if (slot !== undefined && App.deathHandHide[actualIdx]?.has(slot)) return;
            // Jesse Jones: !App.jesseStealLock – po kliknutí zvýraznění cizích rukou HNED
            // zhasne a nejde na ně klikat znovu (server druhý pokus stejně zahodí, protože
            // už nelíže z ruky). Nepoužívá se blockInput jako u Pata Brennana: Jesse musí
            // hned nato kliknout na BALÍČEK pro druhou kartu, a ten by mu zámek zhasl taky.
            // Zámek odemkne až potvrzení stavu (viz _applyRoomUpdate), stejně jako u Pedra.
            const isJesseJonesDraw = isMyDraw && !App.jesseStealLock &&
                state.drawPhaseState.options.includes('opponent_hand') && state.drawPhaseState.cardsDrawn === 0;
            const isElGringoSteal = state.phase === "EL_GRINGO_STEAL" &&
                state.pendingElGringoSteal?.playerIdx === myIndex &&
                state.pendingElGringoSteal?.attackerIdx === actualIdx;
            // Fistful – Právo západu: vynucená karta leží v ruce ODKRYTÁ (redakce ji pouští,
            // viz server/rooms.js) – celý stůl vidí, co musí hráč na tahu zahrát.
            const _lawSlotCard = slot !== undefined ? player.hand?.[slot] : null;
            // Podmínka `hráč je na tahu` zrcadlí redakci – v debug hře (kde se neredaguje)
            // by jinak zastaralé `_lawCardId` nechalo kartu odkrytou i po jeho tahu.
            const _lawTex = (state.currentPlayerIndex === actualIdx && _lawSlotCard &&
                             !_lawSlotCard._placeholder && _lawSlotCard.id != null &&
                             _lawSlotCard.id === player._lawCardId) ? getTex(_lawSlotCard.id) : 'card_back';
            let hCard = gameScene.add.sprite(x, y, _lawTex).setAngle(angle).setScale(hScale);
            if (isJesseJonesDraw) {
                hCard.setTint(0xffff44);
                hCard.setInteractive({ useHandCursor: true });
                hCard.on('pointerdown', () => {
                    if (App.jesseStealLock) return;
                    App.jesseStealLock = true;
                    socket.emit('draw_card', { source: 'opponent_hand', sourceIdx: actualIdx });
                    renderUI();          // zhasni ruce soupeřů hned, balíček zůstává aktivní
                });
            } else if (isElGringoSteal) {
                hCard.setTint(0xffff44);
                hCard.setInteractive({ useHandCursor: true });
                hCard.on('pointerdown', () => {
                    const attackerState = state?.players?.[actualIdx];
                    if (attackerState?.hand?.length > 0) {
                        attackerState.hand.splice(attackerState.hand.length - 1, 1);
                    }
                    socket.emit('el_gringo_steal');
                    state.pendingElGringoSteal = null;
                    App.blockInput = true;
                    renderUI();
                });
            } else if (canTargetThisPlayer) {
                hCard.setTint(0xffff44);
                hCard.setInteractive({ useHandCursor: true });
                hCard.on('pointerdown', () => handlePanicCBClick(actualIdx, 'hand', null));
            }
            gameScene.cardsSprites.add(hCard);
            // Reflow slide: rub nemá identitu → klíč per-slot; vějíř ruky se při ubrání/
            // přibytí karty plynule přeskládá (slot = pozice ve vějíři).
            if (slot !== undefined) reflowCard('oh' + actualIdx + '_' + slot, hCard, x, y, _lawTex, hScale, angle);
        };

        const showElGringoHint = () => {};  // hint odstraněn

        const starScale = 0.3;

        if (anchor.side === 'compact') {
            drawCompactOpponent({
                player, actualIdx, anchor, scaleOpp, getCharTex, L,
                cardW, cardH, bulletH, displayCards, handFan, handLen,
                isCurrent, isWaiting, isClausTarget, waiting: _waiting, waitTint: WAIT_TINT, starScale,
                drawBoardCard, drawHandCard, addCharInteraction,
            });
        }
        else if (anchor.side === 'left') {
            const charX = anchor.x;
            const charY = anchor.y;
            const angle = 90;

            const groupH = (1 + numBluePrimary) * cardW + numBluePrimary * gap;
            const livesCX = charX;
            const livesCY = charY + groupH / 2 - cardH / 2;

            let livesOpp = gameScene.add.image(livesCX, livesCY, 'lives').setScale(scaleOpp).setAngle(angle);
            gameScene.cardsSprites.add(livesOpp);

            let charOpp = gameScene.add.image(livesCX + bulletH * player.health, livesCY, getCharTex(player.character))
                .setScale(scaleOpp).setAngle(angle);
            if (isClausTarget) charOpp.setTint(CLAUS_TINT);
            else if (isCurrent) applyTurnTint(charOpp);
            else if (isWaiting) charOpp.setTint(WAIT_TINT);
            addCharInteraction(charOpp);
            gameScene.cardsSprites.add(charOpp);
            const _slidingL = runHealthSlide(actualIdx, player.health, charOpp.x, charOpp.y, bulletH, 1, 0, angle, scaleOpp, getCharTex(player.character),
                player.role === "Sheriff" ? { dx: cardH * 0.45, dy: -cardW * 0.42, scale: starScale } : null);
            reflowStatic('olives' + actualIdx, livesOpp, 'lives', scaleOpp, angle, false);
            reflowStatic('ochar' + actualIdx, charOpp, getCharTex(player.character), scaleOpp, angle, _slidingL);
            registerVeraPortrait(charOpp, player, getCharTex);

            if (player.role === "Sheriff") {
                let star = gameScene.add.image(
                    charOpp.x + cardH * 0.45,
                    charOpp.y - cardW * 0.42,
                    'sheriff_star').setScale(starScale).setAngle(90).setDepth(STAR_DEPTH);
                gameScene.cardsSprites.add(star);
                reflowStatic('ostar' + actualIdx, star, 'sheriff_star', starScale, angle, _slidingL, STAR_DEPTH);
            }

            displayCards.forEach((card, bIdx) => {
                const s = boardSlot(bIdx, oppBand);
                const bY = livesCY - (cardW + gap) - s.col * oppBand.step;
                const bX = livesCX + s.row * (cardH + gap);
                drawBoardCard(bX, bY, card, angle, bIdx);
            });

            const handStartX = charX - cardH * L.oppHandOff;
            const maxHandH = cardH * L.oppFanSpan;
            const rawSpacingL = (handFan > 1) ? Math.min(cardW * L.oppFanFrac, L.oppFanMax) : 0;
            const handSpacing = handFan > 1
                ? Math.min(rawSpacingL, maxHandH / (handFan - 1))
                : 0;
            const totalHandH = (handFan - 1) * handSpacing;
            for (let c = 0; c < handLen; c++) {
                drawHandCard(handStartX, charY - totalHandH / 2 + c * handSpacing, angle, c);
            }

            showElGringoHint();

            {
                const nameY = livesCY + cardW * 0.5 + 18;
                let nameTxt = gameScene.add.text(charX, nameY,
                    player.name,
                    { fontSize: '18px', color: isCurrent ? '#ffff88' : (isWaiting ? '#ffcc44' : '#cccccc'),
                      backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 6, y: 3 } })
                    .setOrigin(0.5, 0).setDepth(50);
                gameScene.cardsSprites.add(nameTxt);
                if (isWaiting && _waiting.text) {
                    let stTxt = gameScene.add.text(charX, nameY + 30, '⏳ ' + _waiting.text,
                        { fontSize: '15px', color: '#ffcc44',
                          backgroundColor: 'rgba(60,30,0,0.88)', padding: { x: 6, y: 2 } })
                        .setOrigin(0.5, 0).setDepth(51);
                    gameScene.cardsSprites.add(stTxt);
                }
            }
        }
        else if (anchor.side === 'top') {
            const charX = anchor.x;
            const charY = anchor.y;
            const angle = 180;

            const groupW = (1 + numBluePrimary) * cardW + numBluePrimary * gap;
            const groupStartX = charX - groupW / 2;
            const livesCX = groupStartX + cardW / 2;
            const livesCY = charY;

            let livesOpp = gameScene.add.image(livesCX, livesCY, 'lives').setScale(scaleOpp).setAngle(angle);
            gameScene.cardsSprites.add(livesOpp);

            let charOpp = gameScene.add.image(livesCX, livesCY + bulletH * player.health, getCharTex(player.character))
                .setScale(scaleOpp).setAngle(angle);
            if (isClausTarget) charOpp.setTint(CLAUS_TINT);
            else if (isCurrent) applyTurnTint(charOpp);
            else if (isWaiting) charOpp.setTint(WAIT_TINT);
            addCharInteraction(charOpp);
            gameScene.cardsSprites.add(charOpp);
            const _slidingT = runHealthSlide(actualIdx, player.health, charOpp.x, charOpp.y, bulletH, 0, 1, angle, scaleOpp, getCharTex(player.character),
                player.role === "Sheriff" ? { dx: cardW * 0.42, dy: cardH * 0.45, scale: starScale } : null);
            reflowStatic('olives' + actualIdx, livesOpp, 'lives', scaleOpp, angle, false);
            reflowStatic('ochar' + actualIdx, charOpp, getCharTex(player.character), scaleOpp, angle, _slidingT);
            registerVeraPortrait(charOpp, player, getCharTex);

            if (player.role === "Sheriff") {
                let star = gameScene.add.image(
                    charOpp.x + cardW * 0.42,
                    charOpp.y + cardH * 0.45,
                    'sheriff_star').setScale(starScale).setAngle(180).setDepth(STAR_DEPTH);
                gameScene.cardsSprites.add(star);
                reflowStatic('ostar' + actualIdx, star, 'sheriff_star', starScale, angle, _slidingT, STAR_DEPTH);
            }

            displayCards.forEach((card, bIdx) => {
                const s = boardSlot(bIdx, oppBand);
                const bX = groupStartX + (cardW + gap) + cardW / 2 + s.col * oppBand.step;
                const bY = livesCY + s.row * (cardH + gap);
                drawBoardCard(bX, bY, card, angle, bIdx);
            });

            const handStartY = charY - cardH * L.oppHandOff;
            const maxHandW = cardH * L.oppFanSpan;
            const rawSpacingT = handFan > 1 ? Math.min(cardW * L.oppFanFrac, L.oppFanMax) : 0;
            const handSpacing = handFan > 1
                ? Math.min(rawSpacingT, maxHandW / (handFan - 1))
                : 0;
            const totalHandW = (handFan - 1) * handSpacing;
            for (let c = 0; c < handLen; c++) {
                drawHandCard(charX - totalHandW / 2 + c * handSpacing, handStartY, angle, c);
            }

            showElGringoHint();

            {
                const nameY = charY + cardH * 0.5 + 18;
                let nameTxt = gameScene.add.text(charX, nameY,
                    player.name,
                    { fontSize: '18px', color: isCurrent ? '#ffff88' : (isWaiting ? '#ffcc44' : '#cccccc'),
                      backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 6, y: 3 } })
                    .setOrigin(0.5, 0).setDepth(50);
                gameScene.cardsSprites.add(nameTxt);
                if (isWaiting && _waiting.text) {
                    let stTxt = gameScene.add.text(charX, nameY + 30, '⏳ ' + _waiting.text,
                        { fontSize: '15px', color: '#ffcc44',
                          backgroundColor: 'rgba(60,30,0,0.88)', padding: { x: 6, y: 2 } })
                        .setOrigin(0.5, 0).setDepth(51);
                    gameScene.cardsSprites.add(stTxt);
                }
            }
        }
        else if (anchor.side === 'right') {
            const charX = anchor.x;
            const charY = anchor.y;
            const angle = -90;

            const groupH = (1 + numBluePrimary) * cardW + numBluePrimary * gap;
            const livesCX = charX;
            const livesCY = charY - groupH / 2 + cardH / 2;

            let livesOpp = gameScene.add.image(livesCX, livesCY, 'lives').setScale(scaleOpp).setAngle(angle);
            gameScene.cardsSprites.add(livesOpp);

            let charOpp = gameScene.add.image(livesCX - bulletH * player.health, livesCY, getCharTex(player.character))
                .setScale(scaleOpp).setAngle(angle);
            if (isClausTarget) charOpp.setTint(CLAUS_TINT);
            else if (isCurrent) applyTurnTint(charOpp);
            else if (isWaiting) charOpp.setTint(WAIT_TINT);
            addCharInteraction(charOpp);
            gameScene.cardsSprites.add(charOpp);
            const _slidingR = runHealthSlide(actualIdx, player.health, charOpp.x, charOpp.y, bulletH, -1, 0, angle, scaleOpp, getCharTex(player.character),
                player.role === "Sheriff" ? { dx: -cardH * 0.45, dy: cardW * 0.42, scale: starScale } : null);
            reflowStatic('olives' + actualIdx, livesOpp, 'lives', scaleOpp, angle, false);
            reflowStatic('ochar' + actualIdx, charOpp, getCharTex(player.character), scaleOpp, angle, _slidingR);
            registerVeraPortrait(charOpp, player, getCharTex);

            if (player.role === "Sheriff") {
                let star = gameScene.add.image(
                    charOpp.x - cardH * 0.45,
                    charOpp.y + cardW * 0.42,
                    'sheriff_star').setScale(starScale).setAngle(-90).setDepth(STAR_DEPTH);
                gameScene.cardsSprites.add(star);
                reflowStatic('ostar' + actualIdx, star, 'sheriff_star', starScale, angle, _slidingR, STAR_DEPTH);
            }

            displayCards.forEach((card, bIdx) => {
                const s = boardSlot(bIdx, oppBand);
                const bY = livesCY + (cardW + gap) + s.col * oppBand.step;
                const bX = livesCX - s.row * (cardH + gap);
                drawBoardCard(bX, bY, card, angle, bIdx);
            });

            const handStartX = charX + cardH * L.oppHandOff;
            const maxHandHR = cardH * L.oppFanSpan;
            const rawSpacingR = handFan > 1 ? Math.min(cardW * L.oppFanFrac, L.oppFanMax) : 0;
            const handSpacing = handFan > 1
                ? Math.min(rawSpacingR, maxHandHR / (handFan - 1))
                : 0;
            const totalHandH = (handFan - 1) * handSpacing;
            for (let c = 0; c < handLen; c++) {
                drawHandCard(handStartX, charY - totalHandH / 2 + c * handSpacing, angle, c);
            }

            showElGringoHint();

            {
                const groupBottom = livesCY + numBluePrimary * (cardW + gap) + cardW * 0.5;
                const nameY = groupBottom + 18;
                let nameTxt = gameScene.add.text(charX, nameY,
                    player.name,
                    { fontSize: '18px', color: isCurrent ? '#ffff88' : (isWaiting ? '#ffcc44' : '#cccccc'),
                      backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 6, y: 3 } })
                    .setOrigin(0.5, 0).setDepth(50);
                gameScene.cardsSprites.add(nameTxt);
                if (isWaiting && _waiting.text) {
                    let stTxt = gameScene.add.text(charX, nameY + 30, '⏳ ' + _waiting.text,
                        { fontSize: '15px', color: '#ffcc44',
                          backgroundColor: 'rgba(60,30,0,0.88)', padding: { x: 6, y: 2 } })
                        .setOrigin(0.5, 0).setDepth(51);
                    gameScene.cardsSprites.add(stTxt);
                }
            }
        }
    }
}

// ── Kompaktní sloupec soupeře (mobilní profil) ───────────────────────────────
// Mobil nemá místo na okruh kolem stolu, takže soupeři stojí v jedné řadě nahoře.
// Sloupec: otočená karta životů s portrétem (chová se přesně jako soupeř vlevo –
// portrét jede po nábojích doprava), pod ní menší vějíř rubů ruky, jmenovka se
// stavem a řada vyložených karet. Veškerá geometrie je v core/layout.js (compact*),
// aby ji stejně počítalo i zacílení animací v positions.js.
// Chování karet (klikatelnost, zvýraznění, reflow) přebírá z uzávěrů drawOpponents,
// proto se sem předávají v ctx – tělo zůstává jen kreslení.
function drawCompactOpponent(ctx) {
    const { player, actualIdx, anchor, scaleOpp, getCharTex, L,
            cardW, cardH, bulletH, displayCards, handFan, handLen,
            isCurrent, isWaiting, isClausTarget, waiting, waitTint, starScale,
            drawBoardCard, drawHandCard, addCharInteraction } = ctx;

    const m = compactMetrics(state.players.length - 1, L);
    const angle = 90;
    const livesCX = anchor.x;
    const livesCY = anchor.y;

    let livesOpp = gameScene.add.image(livesCX, livesCY, 'lives').setScale(scaleOpp).setAngle(angle);
    gameScene.cardsSprites.add(livesOpp);

    let charOpp = gameScene.add.image(livesCX + bulletH * player.health, livesCY, getCharTex(player.character))
        .setScale(scaleOpp).setAngle(angle);
    if (isClausTarget) charOpp.setTint(CLAUS_TINT);
    else if (isCurrent) applyTurnTint(charOpp);
    else if (isWaiting) charOpp.setTint(waitTint);
    addCharInteraction(charOpp);
    gameScene.cardsSprites.add(charOpp);
    const _slidingC = runHealthSlide(actualIdx, player.health, charOpp.x, charOpp.y, bulletH, 1, 0, angle, scaleOpp, getCharTex(player.character),
        player.role === "Sheriff" ? { dx: cardH * 0.45, dy: -cardW * 0.42, scale: starScale } : null);
    reflowStatic('olives' + actualIdx, livesOpp, 'lives', scaleOpp, angle, false);
    reflowStatic('ochar' + actualIdx, charOpp, getCharTex(player.character), scaleOpp, angle, _slidingC);
    registerVeraPortrait(charOpp, player, getCharTex);

    if (player.role === "Sheriff") {
        let star = gameScene.add.image(
            charOpp.x + cardH * 0.45,
            charOpp.y - cardW * 0.42,
            'sheriff_star').setScale(starScale).setAngle(90).setDepth(STAR_DEPTH);
        gameScene.cardsSprites.add(star);
        reflowStatic('ostar' + actualIdx, star, 'sheriff_star', starScale, angle, _slidingC, STAR_DEPTH);
    }

    // Vyložené karty stojí (angle 0) v jedné řadě – čitelné stejně jako moje.
    displayCards.forEach((card, bIdx) => {
        const p = compactBoardPos(anchor, bIdx, displayCards.length, m);
        drawBoardCard(p.x, p.y, card, 0, bIdx);
    });

    // Ruka zůstává vějířem rubů (žádné číslo místo karet), jen v menším měřítku.
    for (let c = 0; c < handLen; c++) {
        const p = compactHandPos(anchor, c, handFan, m);
        drawHandCard(p.x, p.y, 0, c, m.fanScale);
    }

    {
        const nameX = compactColCenter(anchor, m);
        const nameY = compactNameY(anchor, m);
        let nameTxt = gameScene.add.text(nameX, nameY,
            player.name,
            { fontSize: '18px', color: isCurrent ? '#ffff88' : (isWaiting ? '#ffcc44' : '#cccccc'),
              backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 6, y: 3 } })
            .setOrigin(0.5, 0).setDepth(50);
        gameScene.cardsSprites.add(nameTxt);
        if (isWaiting && waiting.text) {
            let stTxt = gameScene.add.text(nameX, nameY + 30, '⏳ ' + waiting.text,
                { fontSize: '15px', color: '#ffcc44',
                  backgroundColor: 'rgba(60,30,0,0.88)', padding: { x: 6, y: 2 } })
                .setOrigin(0.5, 0).setDepth(51);
            gameScene.cardsSprites.add(stTxt);
        }
    }
}

// ── Vlastní oblast dole (role, životy, postava, stůl, ruka, akční tlačítka) ──
function drawMyArea(ctx) {
    const { me, scaleMe, getTex, getCharTex, handlePanicCBClick, L } = ctx;

        const livesX = L.livesX;
        const myBaseY = L.myBaseY;
        const roleX = livesX + L.roleOffX;

        const roleMap = { 'Sheriff': '000', 'Outlaw': '001', 'Renegade': '002', 'Deputy': '003' };
        const roleTex = 'role_' + (roleMap[me.role] || '001');
        let roleImg = gameScene.add.image(roleX, myBaseY, roleTex).setScale(scaleMe);
        gameScene.cardsSprites.add(roleImg);
        // Zvětšení karty (hover / long press) jako u postavy a karet na stole – text role
        // je na kartě vysázený drobně a v herní velikosti se nedá přečíst. Kurzor zůstává
        // šipkou (na vlastní kartu role se nikdy neklika), klíč zoomu přežije překreslení.
        roleImg.setInteractive({ useHandCursor: false });
        roleImg._zoomKey = 'role:' + myIndex;
        roleImg.on('pointerover', () => startCardZoom(roleTex, 'role:' + myIndex));
        roleImg.on('pointerout', scheduleZoomFade);

        {
            const isCurrentMe = state.currentPlayerIndex === myIndex;
            const _myWaiting = (typeof waitingStatus === 'function') ? waitingStatus(state) : null;
            const isWaitingMe = !!_myWaiting && _myWaiting.idx === myIndex && myIndex !== state.currentPlayerIndex;
            let myNameTxt = gameScene.add.text(roleX, myBaseY + L.myNameOffY,
                me.name,
                { fontSize: '20px', color: isCurrentMe ? '#ffff88' : (isWaitingMe ? '#ffcc44' : '#cccccc'),
                  backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 7, y: 4 } })
                .setOrigin(0.5, 0);
            gameScene.cardsSprites.add(myNameTxt);
            if (isWaitingMe && _myWaiting.text) {
                let myStTxt = gameScene.add.text(roleX, myBaseY + L.myStatusOffY, '⏳ ' + _myWaiting.text,
                    { fontSize: '16px', color: '#ffcc44',
                      backgroundColor: 'rgba(60,30,0,0.88)', padding: { x: 6, y: 2 } })
                    .setOrigin(0.5, 0).setDepth(51);
                gameScene.cardsSprites.add(myStTxt);
            }
        }

        let livesImg = gameScene.add.image(livesX, myBaseY, 'lives').setScale(scaleMe);
        // High Noon (přibalené) – Nová identita: odložená druhá postava JE tahle karta
        // (rub karty postavy = počítadlo životů), žádná další se nepřidává. Během
        // cinematiky výměny (App.niHideSecond) letí doprostřed → na svém místě není.
        if (App.niHideSecond) livesImg.setVisible(false);

        const isMyDynamiteDamage = state.phase === "DYNAMITE_DAMAGE" &&
            state.pendingDynamiteDamage?.playerIdx === myIndex;
        // High Noon – Pravé poledne: ztráta života na začátku tahu (klik na životy).
        const isMyNoonDamage = state.phase === "NOON_DAMAGE" &&
            state.pendingNoonDamage?.playerIdx === myIndex;

        if (state.phase === "RESPOND" && state.pendingResponse?.active && state.pendingResponse.targetIdx === myIndex) {
            livesImg.setTint(0xff4444);
            livesImg.setInteractive({ useHandCursor: true });
            livesImg.on('pointerdown', () => {
                // Zamčené UI (běží animace / cinematika vyřazení) → klik ignoruj; jinak
                // by šlo „schytat zásah" ještě jednou, než dorazí nový stav.
                if (App.blockInput) return;
                socket.emit('respond_to_card', { playerIdx: myIndex, cardIndex: null });
                if (state.pendingResponse) state.pendingResponse.active = false;
                App.blockInput = true;
                renderUI();
            });
        } else if (isMyDynamiteDamage) {
            livesImg.setTint(0xff4444);
            livesImg.setInteractive({ useHandCursor: true });
            livesImg.on('pointerdown', () => {
                if (App.blockInput) return;
                socket.emit('take_dynamite_hit');
                App.blockInput = true;
                renderUI();
            });
        } else if (isMyNoonDamage) {
            livesImg.setTint(0xff4444);
            livesImg.setInteractive({ useHandCursor: true });
            livesImg.on('pointerdown', () => {
                if (App.blockInput) return;
                socket.emit('take_noon_hit');
                App.blockInput = true;
                renderUI();
            });
        } else if (selectedState.chuck && state.phase === "PLAY" && state.currentPlayerIndex === myIndex) {
            // Chuck Wengam nabitý: klik na životy = ztrať 1 život → lízni 2 (ručně na balíček).
            livesImg.setTint(0xff8844);
            livesImg.setInteractive({ useHandCursor: true });
            livesImg.on('pointerdown', () => {
                if (App.blockInput) return;
                socket.emit('chuck_wengam');
                selectedState = { cardIndex: null, action: null };
                App.blockInput = true;
                renderUI();
            });
        }
        gameScene.cardsSprites.add(livesImg);

        // Pravé poledne – výzva ke ztrátě života
        if (isMyNoonDamage) {
            const noonTxt = gameScene.add.text(livesX, myBaseY + L.myHintOffY,
                '🌞 Pravé poledne – klikni na Životy',
                { fontSize: '19px', color: '#ff8800', backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 8, y: 4 } })
                .setOrigin(0.5);
            gameScene.cardsSprites.add(noonTxt);
        }

        // Dynamit – info o zbývajících hitech
        if (isMyDynamiteDamage) {
            const pdd = state.pendingDynamiteDamage;
            const ddTxt = gameScene.add.text(livesX, myBaseY + L.myHintOffY,
                `💥 ${pdd.hitsLeft}× klikni na Životy`,
                { fontSize: '19px', color: '#ff8800', backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 8, y: 4 } })
                .setOrigin(0.5);
            gameScene.cardsSprites.add(ddTxt);
        }

        const livesCardH = 500 * scaleMe;
        const bulletsAreaH = livesCardH * 0.93;
        const bulletH = bulletsAreaH / 5;

        let charImg = gameScene.add.image(livesX, myBaseY - (bulletH * me.health), getCharTex(me.character)).setScale(scaleMe);
        // Nová identita (High Noon, přibalené): stará postava se během cinematiky výměny
        // překlápí na rub a sjíždí na slot odložené karty → na svém místě zatím není.
        if (App.niHideChar) charImg.setVisible(false);
        gameScene.cardsSprites.add(charImg);
        if (runHealthSlide(myIndex, me.health, charImg.x, charImg.y, bulletH, 0, -1, 0, scaleMe, getCharTex(me.character))) charImg.setVisible(false);
        registerVeraPortrait(charImg, me, getCharTex);
        // Claus (Fistful) si právě bere kartu pro sebe → moje postava svítí stejně jako
        // postava kohokoli jiného, komu zrovna vybírá.
        if (clausTargetIdx() === myIndex) charImg.setTint(CLAUS_TINT);

        // Dodge City: Tequila (DE_HEAL) může vyléčit +1 i sám sebe → moje postava klikatelná
        // (jen když jsem zraněný – léčení na plný život nedává smysl).
        const healSelfMode = selectedState.action === 'DE_HEAL' && selectedState.cardIndex !== null && me.health < me.maxHealth;
        const charNeedsCursor = (selectedState.action === "PLAY_BLUE" && selectedState.cardIndex !== null)
            || selectedState.action === 'SHOOT'
            || healSelfMode
            || (['Panika!', 'Cat Balou'].includes(selectedState.action) && me.board.length > 0);
        charImg.setInteractive({ useHandCursor: charNeedsCursor });
        charImg._zoomKey = 'char:' + myIndex;
        charImg.on('pointerover', () => startCardZoom(getCharTex(me.character), 'char:' + myIndex));
        charImg.on('pointerout', scheduleZoomFade);

        if (healSelfMode) {
            charImg.setTint(0x88ff88);
            charImg.on('pointerdown', () => {
                socket.emit('discard_extra_choose', { cardIdx: selectedState.cardIndex, targetIdx: myIndex });
                selectedState = { cardIndex: null, action: null };
                App.blockInput = true;
                renderUI();
            });
        }

        if (['Panika!', 'Cat Balou'].includes(selectedState.action) && me.board.length > 0) {
            charImg.on('pointerdown', () => {
                selectedState.selfTarget = true;
                renderUI();
            });
        }

        // Střelba na sebe (pravidla to umožňují): Bang!/Úder z ruky i zelené bang-efekty
        // (Pepperbox/Puška na bizony/Nůž/Derringer). Postava se NEzvýrazňuje – jen kurzor
        // ručička (charNeedsCursor) + klik zacílí útok na mě.
        if (selectedState.action === 'SHOOT') {
            if (selectedState.greenCardId != null) {
                charImg.on('pointerdown', () => {
                    socket.emit('activate_green_card', { playerIdx: myIndex, cardId: selectedState.greenCardId, target: { targetIdx: myIndex } });
                    state.phase = "RESPOND";
                    selectedState = { cardIndex: null, action: null };
                    App.blockInput = true;
                    renderUI();
                });
            } else if (selectedState.cardIndex !== null) {
                charImg.on('pointerdown', () => {
                    const capturedIdx = selectedState.cardIndex;
                    socket.emit('play_bang', { attackerIdx: myIndex, targetIdx: myIndex, cardIdx: capturedIdx });
                    optimisticRemoveCard(capturedIdx);
                    state.phase = "RESPOND";
                    selectedState = { cardIndex: null, action: null };
                    App.blockInput = true;
                    renderUI();
                });
            }
        }

        if (selectedState.action === "PLAY_BLUE" && selectedState.cardIndex !== null) {
            charImg.setTint(0xaaddff);
            charImg.on('pointerdown', () => {
                const capturedIdx = selectedState.cardIndex;
                socket.emit('play_card', capturedIdx);
                optimisticRemoveCard(capturedIdx);
                selectedState = { cardIndex: null, action: null };
                renderUI();
            });
        }

        let myBoardCards = [];

        // Umírám-li, moje karty zůstávají na stole, dokud jedna po druhé neodletí
        // (viz deathCardsStillShown) – ne že by všechny zmizely v okamžiku zásahu.
        // Duch (Město duchů, High Noon) hraje s 0 životy, takže potřebuje svůj stůl vidět.
        if (me.health > 0 || me._ghost || deathCardsStillShown(myIndex)) {
            if (me.weapon && me.weapon.id !== -1) {
                myBoardCards.push({ ...me.weapon, _isWeapon: true });
            } else {
                myBoardCards.push({ id: '_colt', _isColt: true });
            }
            if (me.board) myBoardCards.push(...me.board);
        }

        // Colt .45 se objeví přesně tam, kde do teď ležela zbraň (někdo mi ji zničil/ukradl,
        // nebo jsem ji vyměnil) – bez fade-inu na tom místě jen problikne. Fázi fade-inu
        // počítáme z času, protože renderUI kreslí sprite znovu při každém snímku (tween od
        // nuly by se tak pořád restartoval a Colt by blikal dál).
        // `null` = deska se kreslí poprvé (start hry po intru) – Colt na ní už leží
        // z intra, takže se NEfaduje. Fade patří jen skutečné výměně zbraň → Colt.
        const _coltNow = myBoardCards.some(c => c._isColt);
        if (_coltNow && App.coltVisible === false) App.coltFadeStart = Date.now();
        App.coltVisible = _coltNow;

        const myCardW = 325 * scaleMe;
        const boardCardH = 500 * scaleMe;
        // Pás vyložených karet – MUSÍ zrcadlit getBoardCardPos v positions.js. Řady rostou
        // vzhůru, tedy k balíčkům uprostřed stolu, proto je jejich počet zastropovaný a
        // přeplněná řada se místo další řady jen zhustí.
        const myBand = boardBand(myBoardCards.length, L.myBoardRows, L.boardMaxPerRow, myCardW, L.boardGap);
        const isPanicCBMyTurn = ['Panika!', 'Cat Balou'].includes(selectedState.action);
        // Na SEBE: klik na vlastní kartu na stole (výzbroj/modrá/zelená) zacílí efekt na mě.
        // Tři případy: Krytý vůz (DE_STEAL + greenCardId) / Kankán (GREEN_DISCARD) – zelené;
        // Ragtime (DE_STEAL + cardIndex, bez greenCardId) – hnědá „odhoď další kartu".
        const isGreenStealSelf = (selectedState.action === 'DE_STEAL' || selectedState.action === 'GREEN_DISCARD')
            && selectedState.greenCardId != null;
        const isRagtimeSelf = selectedState.action === 'DE_STEAL'
            && selectedState.greenCardId == null && selectedState.cardIndex !== null;
        // High Noon – Daltonové: výběr řídí server (pendingSelection s attacker === target),
        // hráč odhazuje MODROU kartu ze svého stolu. Klik jde přes handlePanicCBClick, kde
        // ho vyzvedne server-driven větev. !App.blockInput ze stejného důvodu jako u Rvačky:
        // stav se vymění až po dojezdu animace, do té doby by šlo kliknout znovu.
        const isDaltonsMine = !App.blockInput && state.phase === 'SELECTING_TARGET_CARD' &&
            state.pendingSelection?.isDaltons && state.pendingSelection?.targetIdx === myIndex;
        // Probíhá výběr karty na mém stole (Panika/Cat Balou/Krytý vůz/Kankán/Ragtime)?
        // Pak se zelená karta položená tento tah nešediví – je legitimní cíl a musí
        // vypadat normálně (a u Paniky/CB být vidět žluté zvýraznění).
        const isPickingMyBoard = isPanicCBMyTurn || isGreenStealSelf || isRagtimeSelf || isDaltonsMine;
        // Reakce zelenou Vedle!-kartou ze stolu (Železný plát/Stetson/Sombrero/Bible).
        // Počítá se i pro kartu položenou TENTO tah (server ji jako reakci uznává, viz
        // handleResponse s boardCardId) → taková karta se nešediví, jde o ni.
        // Belle Star útočí (na svém tahu) → cizí karty na stole (i zelené Vedle!) neplatí,
        // server je odmítne. Nenabízej je pak jako reakci (zrcadlí server _belleIgnoresBoard).
        // Fistful – Laso ruší karty na stole úplně stejně, jen všem naráz (_boardDead).
        const _origIdx = state.pendingResponse?.originatorIdx;
        const _belleIgnoresBoard = _origIdx != null &&
            state.currentPlayerIndex === _origIdx &&
            effectiveCharacter(state.players[_origIdx]) === "Belle Star";
        const isRespondMiss = state.phase === 'RESPOND' && state.pendingResponse?.active &&
            state.pendingResponse.targetIdx === myIndex && state.pendingResponse.requiredCard === 'Vedle!' &&
            !_belleIgnoresBoard && !boardDeadFor(state);
        const myBoardSprites = [];
        myBoardCards.forEach((card, i) => {
            // Karta právě ukradená Panikou/Cat Balou: po dobu letu ji nekresli (slot
            // zůstává prázdný), objeví se zpět po doletu animace.
            // (i Colt .45 – při smrti se místo letu rozplyne, viz _fadeOutColt; jeho
            //  klíč '_colt' se s ID skutečných karet nikdy nepotká)
            if (App.stealHideIds.has(card.id)) return;
            const s = boardSlot(i, myBand);
            const bx = roleX - (myCardW + L.boardGap) - s.col * myBand.step;
            const by = myBaseY - s.row * (boardCardH + L.boardGap);
            let tex = card._isColt ? 'colt_.45' : getTex(card.id);
            // Ručička kurzoru: jediné setInteractive na sprite (opakované volání by ji už
            // nepřepsalo) → musí pokrýt VŠECHNY režimy míření na vlastní stůl, i Ragtime /
            // Krytý vůz / Kankán na sebe. Aktivovaná zelená karta sama cílem být nemůže.
            const canTarget = isPickingMyBoard && !card._isColt &&
                !(selectedState.greenCardId != null && card.id === selectedState.greenCardId) &&
                !(isDaltonsMine && card.green);   // Daltonové: zelené karty modré nejsou
            let bSprite = gameScene.add.image(bx, by, tex).setScale(scaleMe);
            gameScene.cardsSprites.add(bSprite);
            myBoardSprites.push({ sprite: bSprite, card, i });

            // Dodge City: zelená karta položená TENTO tah se zatím nedá aktivovat →
            // vykresli ji černobíle (grayscale), ať je to jasné. Šedá drží po CELÝ můj
            // tah, ne jen ve fázi PLAY: když mezitím dělá něco jiný hráč (RESPOND na můj
            // Bang!, sejmutí, barel…), karta pořád není aktivovatelná a nemá zezelenat a
            // zase zešednout – zezelená až dalším tahem (turnId se změní).
            // Výjimka: odhazování (DISCARD/DISCARD_ANOTHER) – tam hint „nejde aktivovat"
            // nedává smysl a černobílá zbytečně mate (má vypadat normálně, ne zašedle).
            // Totéž při výběru cíle na vlastním stole (Panika/CB/Krytý vůz/Kankán/Ragtime).
            const _greyPhase = state.phase !== 'DISCARD' && state.phase !== 'DISCARD_ANOTHER' &&
                !(isRespondMiss && card.activate === 'miss');   // zrovna použitelná jako Vedle!
            if (card.green && card._playedTurn === state.turnId && _greyPhase && !isPickingMyBoard) {
                if (bSprite.preFX) bSprite.preFX.addColorMatrix().grayscale(1);
                else bSprite.setTint(0x777777);   // fallback (Canvas renderer bez preFX)
            }

            // Colt .45 právě naskočil na místo sebrané zbraně → dofadeuj ho do plna.
            if (card._isColt && App.coltFadeStart) {
                const el = Date.now() - App.coltFadeStart;
                if (el < COLT_FADE_MS) {
                    bSprite.setAlpha(Math.max(0, el / COLT_FADE_MS));
                    gameScene.tweens.add({ targets: bSprite, alpha: 1, duration: COLT_FADE_MS - el, ease: 'Power2' });
                } else {
                    App.coltFadeStart = 0;
                }
            }

            // Reflow slide: modré/výzbroj se při přibytí/ubrání přeskládají plynule.
            reflowCard('mb' + (card._isColt ? 'colt' : card.id), bSprite, bx, by, tex, scaleMe, 0);

            bSprite.setInteractive({ useHandCursor: canTarget });
            bSprite._zoomKey = card.id;
            bSprite.on('pointerover', () => startCardZoom(tex, card.id));
            bSprite.on('pointerout', scheduleZoomFade);
        });

        if (isPanicCBMyTurn) {
            myBoardSprites.forEach(({ sprite, card, i }) => {
                if (card._isColt) return;
                sprite.setTint(0xffff44);
                sprite.on('pointerdown', () => {
                    const hasRealWeapon = me.weapon && me.weapon.id !== -1;
                    const isWeapon = hasRealWeapon && i === 0;
                    const area = isWeapon ? 'weapon' : 'board';
                    const boardIdx = isWeapon ? null : (i - 1);
                    handlePanicCBClick(myIndex, area, boardIdx);
                });
            });
        }

        // High Noon – Daltonové: zvýrazni MODRÉ karty (výzbroj + nezelené na stole) a
        // pošli výběr serveru. Colt .45 není karta, zelené karty modré nejsou.
        if (isDaltonsMine) {
            myBoardSprites.forEach(({ sprite, card, i }) => {
                if (card._isColt || card.green) return;
                sprite.setTint(0xffff44);
                sprite.on('pointerdown', () => {
                    const hasRealWeapon = me.weapon && me.weapon.id !== -1;
                    const isWeapon = hasRealWeapon && i === 0;
                    const area = isWeapon ? 'weapon' : 'board';
                    const boardIdx = isWeapon ? null : (i - 1);
                    handlePanicCBClick(myIndex, area, boardIdx);
                });
            });
        }

        // Cílení na vlastní stůl (viz isGreenStealSelf/isRagtimeSelf výše).
        // Na samotnou aktivovanou zelenou kartu cílit nelze. Bez zvýraznění (jen kurzor).
        if (isGreenStealSelf || isRagtimeSelf) {
            myBoardSprites.forEach(({ sprite, card, i }) => {
                if (card._isColt || (selectedState.greenCardId != null && card.id === selectedState.greenCardId)) return;
                sprite.setInteractive({ useHandCursor: true });
                sprite.on('pointerdown', () => {
                    const hasRealWeapon = me.weapon && me.weapon.id !== -1;
                    const isWeapon = hasRealWeapon && i === 0;
                    const area = isWeapon ? 'weapon' : 'board';
                    const boardIdx = isWeapon ? null : (i - 1);
                    if (isGreenStealSelf) {
                        socket.emit('activate_green_card', { playerIdx: myIndex, cardId: selectedState.greenCardId,
                            target: { targetIdx: myIndex, area, boardIdx } });
                    } else {
                        socket.emit('discard_extra_choose', { cardIdx: selectedState.cardIndex, targetIdx: myIndex, area, boardIdx });
                    }
                    selectedState = { cardIndex: null, action: null };
                    App.blockInput = true;
                    renderUI();
                });
            });
        }

        // ── Dodge City: zelené karty na mém stole ──────────────────────────────
        // (a) aktivace ve svém tahu (klik → efekt / míření), (b) Vedle!-zelené jako
        // reakce v RESPOND. Vzhled zeleného okraje je součástí artu karty.
        {
            // Fistful – Laso: zelenou kartu na stole nejde aktivovat (server ji odmítne).
            const greenTurn = state.phase === 'PLAY' && state.currentPlayerIndex === myIndex &&
                selectedState.cardIndex === null && !App.blockInput && !isPanicCBMyTurn &&
                !boardDeadFor(state);
            // isRespondMiss / _belleIgnoresBoard viz výše (počítá se před kreslením desky,
            // rozhoduje i o tom, jestli se zelená Vedle!-karta smí šedivit).

            myBoardSprites.forEach(({ sprite, card }) => {
                if (card._isColt || card._isWeapon || !card || !card.green) return;

                // (b) Reakce zelenou Vedle!-kartou (Železný plát/Stetson/Sombrero/Bible).
                if (isRespondMiss && card.activate === 'miss' && !App.blockInput) {
                    sprite.setTint(0xffff44);
                    sprite.setInteractive({ useHandCursor: true });
                    if (sprite.input) sprite.input.cursor = 'pointer';   // setInteractive kurzor nepřepíše (viz ř. ~947)
                    sprite.on('pointerover', () => { sprite.setTint(0xffff88); sprite.setScale(scaleMe * 1.06); });
                    sprite.on('pointerout', () => { sprite.setTint(0xffff44); sprite.setScale(scaleMe); });
                    sprite.on('pointerdown', () => {
                        if (state.pendingResponse) state.pendingResponse.active = false;
                        socket.emit('respond_to_card', { playerIdx: myIndex, cardIndex: null, boardCardId: card.id });
                        App.blockInput = true;
                        renderUI();
                    });
                    return;
                }

                // Zrušení rozjeté aktivace: klik na právě zvolenou zelenou kartu.
                if (selectedState.greenCardId === card.id) {
                    sprite.setTint(0xddffdd);
                    sprite.setInteractive({ useHandCursor: true });
                    if (sprite.input) sprite.input.cursor = 'pointer';   // setInteractive kurzor nepřepíše (viz ř. ~947)
                    sprite.on('pointerdown', () => { selectedState = { cardIndex: null, action: null }; renderUI(); });
                    return;
                }

                if (!greenTurn || selectedState.greenCardId != null) return;
                if (card.activate === 'miss') return;             // Vedle!-zelené jen jako reakce
                if (card._playedTurn === state.turnId) return;    // položená tento tah

                // Je aktivace teď smysluplná? (server stejně validuje)
                const reach = bangEffectReach(card);
                let ok = true;
                if (card.bangEffect && card.range !== 'mass') {
                    ok = true;   // lze vystřelit i na sebe (klik na vlastní postavu) → vždy aktivovatelná
                } else if (card.bangEffect && card.range === 'mass') {
                    ok = state.players.some((pl, idx) => idx !== myIndex && pl.health > 0);
                } else if (card.activate === 'heal_self') {
                    ok = isInPlay(me) && me.health < me.maxHealth;   // duch se léčit smí
                } else if (card.activate === 'steal_any' || card.activate === 'discard_any') {
                    // Cíl může být soupeř (má kartu) NEBO já sám (moje karta na stole – mimo
                    // tuhle aktivovanou zelenou), pravidla umožňují cílit i na sebe.
                    ok = state.players.some((pl, idx) => idx !== myIndex && pl.health > 0 &&
                            (pl.hand.length > 0 || (pl.weapon && pl.weapon.id !== -1) || (pl.board || []).length > 0))
                        || (me.weapon && me.weapon.id !== -1)
                        || (me.board || []).some(c => c.id !== card.id);
                }
                if (!ok) return;

                // Žádné permanentní zelené zvýraznění – karta vypadá normálně a teprve
                // po najetí myší se lehce zvětší a podbarví (jako karty v ruce) + ručička.
                // setInteractive kurzor po dřívějším volání (ř. ~947) nepřepíše, proto ho
                // nastavíme napřímo přes input.cursor.
                sprite.setInteractive({ useHandCursor: true });
                if (sprite.input) sprite.input.cursor = 'pointer';
                sprite.on('pointerover', (pointer) => {
                    if (pointer?.wasTouch) return;
                    sprite.setTint(0xddffdd); sprite.setScale(scaleMe * 1.05);
                });
                sprite.on('pointerout', () => { sprite.clearTint(); sprite.setScale(scaleMe); });
                sprite.on('pointerdown', () => {
                    if (card.bangEffect && card.range !== 'mass') {
                        // Míření jako Bang! – cíl vybereš klikem na soupeře (viz addCharInteraction).
                        selectedState = { cardIndex: null, action: 'SHOOT', greenCardId: card.id, reach };
                        renderUI();
                    } else if (card.activate === 'steal_any') {
                        selectedState = { cardIndex: null, action: 'DE_STEAL', greenCardId: card.id };
                        renderUI();
                    } else if (card.activate === 'discard_any') {
                        selectedState = { cardIndex: null, action: 'GREEN_DISCARD', greenCardId: card.id };
                        renderUI();
                    } else if (card.bangEffect && card.range === 'mass') {
                        // Houfnice (masový útok): dvoukrok jako Kulomet/Indiáni – tenhle klik
                        // kartu jen oznaří, spustí ji teprve klik na ODHAZOVACÍ hromádku.
                        selectedState = { cardIndex: null, action: 'GREEN_MASS', greenCardId: card.id };
                        renderUI();
                    } else if (card.activate === 'draw_3' || card.activate === 'heal_self') {
                        // Pony express (lízni 3) i Čutora (uzdrav se): dvoukrok jako Houfnice –
                        // klik kartu jen oznaří, spustí ji teprve potvrzovací klik na
                        // ODHAZOVACÍ hromádku (karta se přitom odhodí).
                        selectedState = { cardIndex: null, action: 'GREEN_SELF', greenCardId: card.id };
                        renderUI();
                    } else {
                        // Bezpečnostní záloha pro případnou jinou „vlastní" zelenou: aktivuj hned.
                        socket.emit('activate_green_card', { playerIdx: myIndex, cardId: card.id, target: null });
                        App.blockInput = true;
                        renderUI();
                    }
                });
            });
        }

        // Čistá logika hratelnosti je v core/playability.js. `me` předáváme explicitně,
        // protože ve spectator módu to NENÍ state.players[myIndex] (viz výpočet `me` výše).
        const getCardPlayability = (card) => cardPlayability(state, me, myIndex, card);
        // Fistful – Právo západu: odkrytou druhou lízanou kartu musí hráč zahrát, dokud to
        // jde. Stejný helper používá server (tryEndTurn) i bot – rozejít se nesmí, jinak by
        // tlačítko svítilo a server tah tiše odmítal ukončit.
        const _lawForced = lawForcedCard(state, me, myIndex);

        if (me.hand.length > 0) {
            // Ruka má vlastní řadu i měřítko (na mobilu je pod stolem a větší, na
            // desktopu je handY = myBaseY a scaleHand = scaleMe, tedy dnešní stav).
            const handY = L.handY;
            const scaleHand = L.scaleHand;
            // Rozteč i začátek řady počítá core/layout.js (myHandRow) – stejnou funkci
            // volá positions.js, takže se zacílení animací nemůže rozejít s renderem.
            // Na mobilu je pás přes celou šířku a ruka se v něm vystředí (handAlign).
            const handRow = myHandRow(L, me.hand.length);
            const handAreaStart = handRow.startX;
            const spacing = handRow.spacing;

            App.gatedSlotPos = {};   // přepočítáme rezervované sloty letících líznutí
            me.hand.forEach((card, index) => {
                let posX = handAreaStart + (index * spacing);
                // Karta ještě letí do ruky (staging) – slot necháme prázdný, objeví se
                // až po dosednutí své animace. Přesnou pozici slotu si zapamatuje
                // retargetDrawAnims, aby karta dosedla přesně sem.
                if (App.pendingDrawIds.has(card.id)) {
                    App.gatedSlotPos[card.id] = { x: posX, y: handY };
                    return;
                }
                // Smrt: karta z tohoto slotu už odletěla do odhozu. Slot zůstává
                // prázdný – ruka se během odhazování nepřeskládá (viz deathHandHide).
                if (App.deathHandHide[myIndex]?.has(index)) return;
                const isMySidMode = selectedState.sidKetchum !== undefined;
                const isStagedCard = isMySidMode && selectedState.sidKetchum?.stagedIdx === index;
                // „Odhoď další kartu" (Dodge City): hlavní (hraná) karta se zmenší jako u
                // Sida Ketchuma, hráč pak klikne na jinou kartu (cenu). Ostatní se zvýrazní.
                const isDiscardAnother = state.phase === "DISCARD_ANOTHER" && state.pendingDiscardAnother?.playerIdx === myIndex;
                const isDAmain = isDiscardAnother && card.id === state.pendingDiscardAnother.mainCardId;
                // Uncle Will: nabitá schopnost čeká na kartu, kterou zahraje jako
                // Hokynářství (stejný režim jako José/Doc).
                // (Claus "The Saint" tudy NECHODÍ – rozděluje odkrytou řadu uprostřed
                // stolu, ruky se to netýká a její indexy s ní nemají nic společného.)
                const isWillActive = !!selectedState.will;
                // Doc Holyday: jako Sid – v aktivním režimu jsou všechny karty červené,
                // vybrané (2) se zmenší a zašednou. José: modré karty se zvýrazní.
                const isDocActive = !!selectedState.doc;
                const isDocStaged = isDocActive && selectedState.doc.staged.includes(index);
                const isJoseBlue = !!selectedState.jose && isBlueCard(card);
                const cScale = (isStagedCard || isDAmain || isDocStaged) ? scaleHand * 0.88 : scaleHand;
                let cSprite = gameScene.add.image(posX, handY, getTex(card.id))
                    .setScale(cScale)
                    .setAngle(0);
                if (isDAmain) {
                    // Hlavní (hraná) karta jde kliknout pro ZRUŠENÍ „odhoď další kartu".
                    cSprite.setInteractive({ useHandCursor: true });
                } else if (!isStagedCard) {
                    cSprite.setInteractive({ useHandCursor: true });
                }

                const isMySidActive = selectedState.sidKetchum !== undefined ||
                                    state.sidKetchumPending?.playerIdx === myIndex;

                // playable musí být definováno PŘED prvním použitím (viz _isResponsePlayable)
                const playable = isStagedCard ? null : getCardPlayability(card, index);
                const baseScale = scaleHand;

                if (state.phase === "DISCARD" && state.currentPlayerIndex === myIndex) cSprite.setTint(0xff6666);
                if (isMySidActive) cSprite.setTint(0xff6666);
                if (isDocActive) cSprite.setTint(0xff6666);   // Doc: všechny karty červené (jako Sid)
                if (isWillActive) cSprite.setTint(0xff6666);  // Uncle Will: vyber kartu za hokynářství
                if (isStagedCard) cSprite.setTint(0xbbbbbb);

                // „Odhoď další kartu": hlavní (zmenšená) karta zašedne, ostatní červeně
                // (vyber cenu) – stejné zvýraznění jako u odhazování Sida Ketchuma.
                if (isDiscardAnother) cSprite.setTint(isDAmain ? 0xbbbbbb : 0xff6666);
                // Doc: vybrané (2) karty zašednou; José Delgado: modré karty žlutě.
                if (isDocStaged) cSprite.setTint(0xbbbbbb);
                if (isJoseBlue) cSprite.setTint(0xffff44);

                // Pivo jako záchrana při posledním životě (RESPOND nebo DYNAMITE_DAMAGE).
                // Reverend (High Noon) Pivo zakazuje i tady → nezvýrazňovat (klik ho také
                // nepustí, viz decideCardClick v core/selection.js).
                const _aliveNow = state.players.filter(p => p.health > 0).length;
                const _isLastLifeBeer = card.type === "Pivo" && me.health === 1 && _aliveNow > 2 && !isMySidActive &&
                    !beerBlockedFor(state) &&
                    ((state.phase === "RESPOND" && state.pendingResponse?.active && state.pendingResponse.targetIdx === myIndex) ||
                     (state.phase === "DYNAMITE_DAMAGE" && state.pendingDynamiteDamage?.playerIdx === myIndex) ||
                     (state.phase === "NOON_DAMAGE" && state.pendingNoonDamage?.playerIdx === myIndex));
                if (_isLastLifeBeer) cSprite.setTint(0xffff44);

                // Fistful – Právo západu: vynucená karta svítí zlatě, dokud ji hráč nezahraje
                // (do té doby nejde ukončit tah – viz tlačítko níž).
                const _isLawForced = !isMySidActive && !isStagedCard && _lawForced?.card?.id === card.id;
                if (_isLawForced) cSprite.setTint(0xffcc33);

                // Zvýraznění VŠECH hratelných karet v RESPOND (Vedle!, Bang!, pivo, ...)
                const _isResponsePlayable = !isMySidActive && playable === true && !isStagedCard &&
                    state.phase === "RESPOND" && state.pendingResponse?.active &&
                    state.pendingResponse.targetIdx === myIndex;
                if (_isResponsePlayable) cSprite.setTint(0xffff44);
                // Kombinovaný flag: karta musí zůstat žlutá i po hover-out
                const _keepHighlight = _isLastLifeBeer || _isResponsePlayable || _isLawForced;

                if (selectedState.cardIndex === index) {
                    cSprite.y -= 20;
                    cSprite.setTint(0xddffdd);
                }

                // Reflow slide: když se změnil počet karet, ostatní dokloužou na nové místo
                // místo skoku. Staged (Sid) / zmenšenou hlavní kartu nekloužeme – mají vlastní transformaci.
                // AŽ ZA obarvením – reflowCard si tint ze statické karty přebírá, aby ho
                // klouzající karta neztratila.
                if (!isStagedCard && !isDAmain && !isDocStaged) {
                    reflowCard('h' + card.id, cSprite, posX, handY, getTex(card.id), scaleHand, 0);
                }

                let isHovered = false;
                cSprite._zoomKey = card.id;

                cSprite.on('pointerover', (pointer) => {
                    // Dotyk: „pointerover" naskočí už při ťuknutí a Phaser k němu nepošle
                    // „pointerout" → karta by zůstala zvětšená/podbarvená, i když nic nedržíš.
                    // Na dotykovém zařízení proto hover efekt (zoom i zvětšení) přeskoč.
                    if (pointer?.wasTouch) return;
                    startCardZoom(getTex(card.id), card.id);
                    isHovered = true;
                    if (isMySidActive || isDocActive || isWillActive || state.phase === "DISCARD") return;
                    // „Odhoď další kartu": drž červené zvýraznění ceny i při hoveru (jako Sid).
                    if (isDiscardAnother) { if (!isDAmain) cSprite.setScale(baseScale * 1.05); return; }
                    if (selectedState.cardIndex === index) return;

                    if (_keepHighlight) {
                        cSprite.setTint(0xffff88); // světlejší žlutá při hoveru
                        cSprite.setScale(baseScale * 1.05);
                    } else if (playable === false) {
                        cSprite.setTint(0xff6666);
                        cSprite.setScale(baseScale * 1.05);
                    } else if (playable === true || playable === null) {
                        cSprite.setTint(0xddffdd);
                        cSprite.setScale(baseScale * 1.05);
                    }
                });

                cSprite.on('pointerout', () => {
                    scheduleZoomFade();
                    isHovered = false;
                    if (selectedState.cardIndex === index) return;
                    cSprite.setScale((isDAmain || isDocStaged) ? baseScale * 0.88 : baseScale);
                    if (isDiscardAnother) { cSprite.setTint(isDAmain ? 0xbbbbbb : 0xff6666); return; }
                    if (isDocActive) { cSprite.setTint(isDocStaged ? 0xbbbbbb : 0xff6666); return; }
                    if (isWillActive) { cSprite.setTint(0xff6666); return; }
                    if (state.phase === "DISCARD" && state.currentPlayerIndex === myIndex) { cSprite.setTint(0xff6666); return; }
                    if (isMySidActive) { cSprite.setTint(0xff6666); return; }
                    if (_keepHighlight) { cSprite.setTint(0xffff44); return; }
                    cSprite.clearTint();
                });

                cSprite.on('pointerdown', () => {
                    // Zamčený vstup (běží animace po předchozím kliku / míchání) = ignoruj.
                    // Hlavní cesta to řeší přes decideCardClick(blockInput) níž, ale větve
                    // „odhoď další kartu"/José/Doc jdou mimo ni – bez tohohle šel v mezidobí
                    // odeslat druhý klik (a zvýraznění zůstalo svítit až do příchodu stavu).
                    if (App.blockInput) return;
                    // „Odhoď další kartu": klik na hlavní kartu = zrušit; na jinou = zaplatit.
                    if (isDiscardAnother) {
                        if (isDAmain) {
                            socket.emit('cancel_discard_another');
                            App.blockInput = true;
                            renderUI();
                            return;
                        }
                        socket.emit('discard_another_card', { playerIdx: myIndex, extraCardIdx: index });
                        App.blockInput = true;
                        renderUI();
                        return;
                    }
                    // Uncle Will: klik = zahraj tuhle kartu jako Hokynářství (1×/tah).
                    if (isWillActive) {
                        socket.emit('uncle_will', { cardIdx: index });
                        selectedState = { cardIndex: null, action: null };
                        App.blockInput = true;
                        renderUI();
                        return;
                    }
                    // José Delgado: klik na modrou kartu = odhoď ji → lízni 2.
                    if (selectedState.jose) {
                        if (isBlueCard(card)) {
                            socket.emit('jose_delgado', { cardIdx: index });
                            selectedState = { cardIndex: null, action: null };
                            App.blockInput = true;
                            renderUI();
                        }
                        return;
                    }
                    // Doc Holyday: klik postupně označí 2 karty; po druhé se zapne míření (SHOOT).
                    if (selectedState.doc) {
                        const st = selectedState.doc.staged;
                        const at = st.indexOf(index);
                        if (at !== -1) st.splice(at, 1);           // odznač
                        else if (st.length < 2) st.push(index);    // označ (max 2)
                        if (st.length === 2) { selectedState.action = 'SHOOT'; selectedState.reach = undefined; }
                        else { selectedState.action = null; }
                        renderUI();
                        return;
                    }
                    // Rozhodnutí je čistá funkce (core/selection.js); zde jen vykonáme efekty.
                    const intent = decideCardClick({
                        state, me, myIndex, selectedState, card, index,
                        blockInput: App.blockInput, isMySidActive, playable,
                    });
                    switch (intent.type) {
                        case 'NONE':
                            return;
                        case 'RENDER':
                            renderUI();
                            return;
                        case 'DESELECT':
                            selectedState = { cardIndex: null, action: null };
                            renderUI();
                            return;
                        case 'SID_STAGE':
                            selectedState.sidKetchum = { stagedIdx: intent.index, stagedId: intent.cardId };
                            renderUI();
                            return;
                        case 'SID_DISCARD_BOTH':
                            socket.emit('sid_ketchum_discard_both', { playerIdx: myIndex, cardIdx1: intent.cardIdx1, cardIdx2: intent.cardIdx2 });
                            optimisticRemoveCard(Math.max(intent.cardIdx1, intent.cardIdx2));
                            optimisticRemoveCard(Math.min(intent.cardIdx1, intent.cardIdx2));
                            selectedState.sidKetchum = undefined;
                            App.blockInput = true;
                            renderUI();
                            return;
                        case 'BEER_DYNAMITE_SAVE':
                            socket.emit('beer_dynamite_save', { playerIdx: myIndex, cardIdx: intent.index });
                            optimisticRemoveCard(intent.index);
                            selectedState = { cardIndex: null, action: null }; // resetuje i sidKetchum
                            App.blockInput = true;
                            renderUI();
                            return;
                        case 'BEER_NOON_SAVE':
                            socket.emit('beer_noon_save', { playerIdx: myIndex, cardIdx: intent.index });
                            optimisticRemoveCard(intent.index);
                            selectedState = { cardIndex: null, action: null };
                            App.blockInput = true;
                            renderUI();
                            return;
                        case 'UNPLAYABLE_FLASH':
                            cSprite.setTint(0xff2222);
                            gameScene.time.delayedCall(500, () => {
                                if (cSprite.scene && selectedState.cardIndex !== index) {
                                    if (isHovered) {
                                        cSprite.setTint(0xff6666);
                                    } else {
                                        cSprite.clearTint();
                                    }
                                }
                            });
                            return;
                        case 'RESPOND_BEER':
                            socket.emit('respond_with_beer', { playerIdx: myIndex, cardIdx: intent.index });
                            optimisticRemoveCard(intent.index);
                            if (state.pendingResponse) state.pendingResponse.active = false;
                            selectedState = { cardIndex: null, action: null }; // resetuje i sidKetchum
                            App.blockInput = true;
                            renderUI();
                            return;
                        case 'RESPOND':
                            if (state.pendingResponse) state.pendingResponse.active = false;
                            socket.emit('respond_to_card', { playerIdx: myIndex, cardIndex: intent.index });
                            optimisticRemoveCard(intent.index);
                            selectedState = { cardIndex: null, action: null };
                            App.blockInput = true;
                            renderUI();
                            return;
                        case 'DISCARD': {
                            socket.emit('discard_card', intent.index);
                            optimisticRemoveCard(intent.index);
                            // Sean Mallory (Dodge City) drží až 10 karet místo počtu životů.
                            const _limit = effectiveCharacter(me) === "Sean Mallory" ? 10 : me.health;
                            if (me.hand.length <= _limit) {
                                state.phase = "TRANSITIONING";
                                App.blockInput = true;
                            }
                            renderUI();
                        }
                            return;
                        case 'SELECT':
                            selectedState.cardIndex = intent.index;
                            selectedState.action = intent.action;
                            // Dostřel pro míření: u karet s bang-efektem (Úder) se liší od
                            // zbraně (undefined = dostřel zbraně, číslo, nebo Infinity).
                            selectedState.reach = bangEffectReach(card);
                            renderUI();
                            return;
                    }
                });

                gameScene.cardsSprites.add(cSprite);
            });
        }

        if (state.phase === "PLAY" && (!state.pendingResponse?.active) &&
        state.currentPlayerIndex === myIndex &&
        selectedState.sidKetchum === undefined &&
        state.sidKetchumPending?.playerIdx !== myIndex) {
            const sidCanHeal = effectiveCharacter(me) === "Sid Ketchum" &&
                me.hand.filter(c => !c._placeholder).length >= 2 &&
                isInPlay(me) && me.health < me.maxHealth;
            // Zelená karta na mém stole, kterou lze teď aktivovat, se počítá jako
            // hratelná akce (blikání „Ukončit tah" pak nemá smysl). Zrcadlí `ok`-logiku
            // aktivace zelených karet výše v drawMyArea.
            const hasPlayableGreen = (me.board || []).some(card => {
                if (!card || !card.green) return false;
                if (card.activate === 'miss') return false;        // Vedle!-zelené jen jako reakce
                if (card._playedTurn === state.turnId) return false; // položená tento tah
                const reach = bangEffectReach(card);
                if (card.bangEffect && card.range !== 'mass') {
                    return state.players.some((pl, idx) => idx !== myIndex && pl.health > 0 && computeCanHit(state, myIndex, idx, reach));
                } else if (card.bangEffect && card.range === 'mass') {
                    return state.players.some((pl, idx) => idx !== myIndex && pl.health > 0);
                } else if (card.activate === 'heal_self') {
                    return isInPlay(me) && me.health < me.maxHealth;   // duch se léčit smí
                } else if (card.activate === 'steal_any' || card.activate === 'discard_any') {
                    return state.players.some((pl, idx) => idx !== myIndex && pl.health > 0 &&
                        (pl.hand.length > 0 || (pl.weapon && pl.weapon.id !== -1) || (pl.board || []).length > 0));
                }
                return true;
            });
            // Aktivní schopnosti postav se počítají jako hratelná akce → blikání „Ukončit
            // tah" pak nemá smysl (zrcadlí podmínky tlačítek Chuck/Doc/José níže).
            const _ec = effectiveCharacter(me);
            const hasActiveAbility =
                (_ec === "Chuck Wengam" && me.health > 1) ||
                (_ec === "Doc Holyday" && !me._docUsed && me.hand.length >= 2) ||
                (_ec === "José Delgado" && (me._joseUses || 0) < 2 && me.hand.some(isBlueCard));
            const hasPlayable = sidCanHeal || hasPlayableGreen || hasActiveAbility || me.hand.some((card, idx) => {
                const p = getCardPlayability(card, idx);
                return p !== false;
            });

            const { bg: endBtn } = themeButton(gameScene, L.btnEndX, L.btnEndY, 260, L.btnH,
                _lawForced ? 'MUSÍŠ ZAHRÁT ⚡' : 'UKONČIT TAH', {
                fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
                fontSize: _lawForced ? '20px' : '24px',
                onClick: () => {
                    if (App.blockInput || _lawForced) return;
                    selectedState = { cardIndex: null, action: null };
                    // Zamkni do příchodu nového stavu. Na pomalé lince se dřív stihlo
                    // kliknout víckrát (tlačítko svítilo dál, stav ještě nedorazil) a KAŽDÝ
                    // klik ukončil další tah → přeskočilo se několik hráčů. Server duplikát
                    // odmítne sám (server/guard.js), tohle je okamžitá zpětná vazba.
                    App.blockInput = true;
                    socket.emit('end_turn');
                    renderUI();
                },
            });

            if (App.blockInput || _lawForced) {
                // Čeká se na server (běžící animace nebo právě odeslaný konec tahu), nebo hráče
                // drží v tahu vynucená karta Práva západu (Fistful): tlačítko zůstane na místě,
                // ale zhasnuté a neklikatelné.
                endBtn.setAlpha(0.45);
                endBtn.disableInteractive();
            } else if (!hasPlayable) {
                gameScene.tweens.add({
                    targets: endBtn,
                    alpha: { from: 1, to: 0.2 },
                    duration: 420,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        }

        if (effectiveCharacter(me) === "Sid Ketchum" && me.hand.length >= 2 && isInPlay(me) && me.health < me.maxHealth
            && !['SID_SAVE', 'DISCARD', 'CHARACTER_SELECT', 'MENU', 'RESPOND', 'DYNAMITE_DAMAGE', 'NOON_DAMAGE'].includes(state.phase)
            && state.sidKetchumPending?.playerIdx !== myIndex) {
            const sidPending = !!selectedState.sidKetchum;
            const btnLabel = sidPending ? 'SID: zrušit ↩' : 'SID: 2 KARTY → ❤️';
            themeButton(gameScene, L.btnAbilX, L.btnAbilY, 320, L.btnH, btnLabel, {
                ...themeToggleStyle(sidPending), fontSize: '23px',
                onClick: () => {
                    if (sidPending) {
                        selectedState.sidKetchum = undefined;
                        renderUI();
                    } else {
                        selectedState.cardIndex = null;
                        selectedState.action = null;
                        selectedState.sidKetchum = [];
                        renderUI();
                    }
                },
            });
        }

        // Sid Ketchum záchrana při posledním životě (RESPOND nebo DYNAMITE_DAMAGE)
        {
            const _aliveForSid = state.players.filter(p => p.health > 0).length;
            const _sidLastLifeCtx = effectiveCharacter(me) === "Sid Ketchum" && me.health === 1 &&
                me.hand.filter(c => !c._placeholder).length >= 2 && _aliveForSid > 2 &&
                ((state.phase === "RESPOND" && state.pendingResponse?.active && state.pendingResponse.targetIdx === myIndex) ||
                 (state.phase === "DYNAMITE_DAMAGE" && state.pendingDynamiteDamage?.playerIdx === myIndex) ||
                 (state.phase === "NOON_DAMAGE" && state.pendingNoonDamage?.playerIdx === myIndex));
            if (_sidLastLifeCtx) {
                const _sidSavePending = !!selectedState.sidKetchum;
                const _sidSaveLabel = _sidSavePending ? 'SID: zrušit ↩' : 'SID: 2 KARTY → PŘEŽÍT';
                themeButton(gameScene, L.btnAbilX, L.btnAbilY, 340, L.btnH, _sidSaveLabel, {
                    ...themeToggleStyle(_sidSavePending), fontSize: '23px',
                    onClick: () => {
                        if (_sidSavePending) {
                            selectedState.sidKetchum = undefined;
                        } else {
                            selectedState.cardIndex = null;
                            selectedState.action = null;
                            selectedState.sidKetchum = [];
                        }
                        renderUI();
                    },
                });
            }
        }

        // ── A Fistful of Cards – Pálenka: vynechat fázi lízání za 1 život ──────────
        // Sedí v místě „Ukončit tah" – to se ve fázi lízání nekreslí, takže je slot volný
        // (na místě schopností může stát tlačítko Sida Ketchuma). Nabízí se jen místo PRVNÍ
        // karty; `options` je stejný zdroj pravdy jako na serveru (viz _drawOptionsBase).
        {
            const _ds = state.drawPhaseState;
            const _canLiquor = state.phase === "DRAW" && _ds?.active && _ds.playerIdx === myIndex &&
                (_ds.options || []).includes('liquor') && _ds.cardsDrawn === 0 &&
                App.pendingDrawCount === 0 && !App.blockInput;
            if (_canLiquor) {
                themeButton(gameScene, L.btnEndX, L.btnEndY, 260, L.btnH, '🥃 PÁLENKA: +1 ❤️', {
                    ...themeToggleStyle(false), fontSize: '20px',
                    onClick: () => {
                        if (App.blockInput) return;
                        App.blockInput = true;
                        socket.emit('draw_card', { source: 'liquor', sourceIdx: null });
                        renderUI();
                    },
                });
            }
        }

        // ── Dodge City: tlačítka aktivních schopností (na úrovni tlačítka Sida) ─────
        {
            const myPlayTurn = state.phase === "PLAY" && state.currentPlayerIndex === myIndex && !App.blockInput;
            const BTN_Y = L.btnAbilY;   // stejné místo jako [ SID: … ]
            // Chuck Wengam: klik → nabít (zvýrazní se životy); klik na životy = −1 ❤ → 2 karty.
            if (myPlayTurn && effectiveCharacter(me) === "Chuck Wengam" && me.health > 1) {
                const armed = !!selectedState.chuck;
                themeButton(gameScene, L.btnAbilX, BTN_Y, 320, 58, armed ? 'CHUCK: zrušit ↩' : 'CHUCK: −1 ❤ → 2 🂠', {
                    ...themeToggleStyle(armed), fontSize: '21px',
                    onClick: () => { selectedState = armed ? { cardIndex: null, action: null } : { cardIndex: null, action: null, chuck: true }; renderUI(); },
                });
            }
            // José Delgado: odhoď modrou → 2 karty (max 2×). Aktivní režim vybere modrou v ruce.
            if (effectiveCharacter(me) === "José Delgado" && (state.phase === "PLAY") && state.currentPlayerIndex === myIndex &&
                (me._joseUses || 0) < 2 && (selectedState.jose || me.hand.some(isBlueCard)) && !App.blockInput) {
                const active = !!selectedState.jose;
                themeButton(gameScene, L.btnAbilX, BTN_Y, 320, 58, active ? 'JOSÉ: zrušit ↩' : 'JOSÉ: modrá → 2 🂠', {
                    ...themeToggleStyle(active), fontSize: '21px',
                    onClick: () => { selectedState = active ? { cardIndex: null, action: null } : { cardIndex: null, action: null, jose: true }; renderUI(); },
                });
            }
            // Doc Holyday: odhoď 2 karty → bang-efekt na cíl v dostřelu (1×/tah).
            if (effectiveCharacter(me) === "Doc Holyday" && (state.phase === "PLAY") && state.currentPlayerIndex === myIndex &&
                !me._docUsed && (selectedState.doc || me.hand.length >= 2) && !App.blockInput) {
                const active = !!selectedState.doc;
                themeButton(gameScene, L.btnAbilX, BTN_Y, 320, 58, active ? 'DOC: zrušit ↩' : 'DOC: 2 karty → BANG', {
                    ...themeToggleStyle(active), fontSize: '21px',
                    onClick: () => { selectedState = active ? { cardIndex: null, action: null } : { cardIndex: null, action: null, doc: { staged: [] } }; renderUI(); },
                });
            }
            // Uncle Will (Fistful): 1× za tah zahraj libovolnou kartu jako Hokynářství.
            // Aktivní režim pak čeká na klik na kartu v ruce (stejně jako José/Doc).
            if (myPlayTurn && effectiveCharacter(me) === "Uncle Will" &&
                me._willUsedTurn !== state.turnId && (selectedState.will || me.hand.length > 0)) {
                const active = !!selectedState.will;
                themeButton(gameScene, L.btnAbilX, BTN_Y, 320, 58, active ? 'WILL: zrušit ↩' : 'WILL: karta → 🏪', {
                    ...themeToggleStyle(active), fontSize: '21px',
                    onClick: () => { selectedState = active ? { cardIndex: null, action: null } : { cardIndex: null, action: null, will: true }; renderUI(); },
                });
            }
        }

        if (state.isDebug) {
            // Debug nástroje – sjednocený vzhled s herními tlačítky (themeButton). Levý
            // sloupec POD rohovým „Ukončit hru" (30..78), ať se nepřekrývají.
            const _dbgStyle = { origin: [0, 0], fontSize: '16px', textColor: THEME.color.gold };
            themeButton(gameScene, stageLeft() + 30, stageTop() + 90, 156, 42, '🃏 CREATIVE',
                { ..._dbgStyle, onClick: () => showCreativeMode(myIndex) }).bg.setDepth(1000);
            themeButton(gameScene, stageLeft() + 30, stageTop() + 138, 156, 42, '🔎 KARTY',
                { ..._dbgStyle, onClick: () => showCardGallery() }).bg.setDepth(1000);
        }
}


// ── Divácký pohled na hráče 0 (dolní pozice) ─────────────────────────────────
function drawSpectatorPlayer(ctx) {
    const { me, getTex, getCharTex, L } = ctx;

        const player = me;
        const isCurrent = state.currentPlayerIndex === 0;
        const isDead = player.health <= 0 || !!player._ghost;   // duch: role zůstává odkrytá (viz drawOpponents)
        const sOpp = L.specScale;
        const cW = 325 * sOpp;
        const cH = 500 * sOpp;
        const bH = cH * 0.93 / 5;   // pozice na životech: 5 nábojnic jako drawMyArea/drawOpponents
        const g  = 8;
        const livesCX = L.centerX, livesCY = L.specLivesY;

        // Mrtvý hráč dole (divák): zobraz postavu + ODHALENOU roli + zbylé karty jako
        // u soupeřů (drawOpponents), ne lebku.
        const deadRoleMap = { 'Sheriff': 'role_000', 'Outlaw': 'role_001', 'Renegade': 'role_002', 'Deputy': 'role_003' };
        // Cinematika vyřazení – viz shodné gate v drawOpponents: karta role se objeví
        // teprve po odhalení uprostřed obrazovky, ve fázi 'settled' jen drží slot.
        const _deathStage = App.deathSeq[0] || null;
        // Hra pro 3 (Město duchů): role jsou odkryté u všech, viz drawOpponents.
        const _roleSlot = !!state.mode3p || (isDead && !deathCardsStillShown(0));
        const allBoard = [];
        if (_roleSlot) allBoard.push({ _isRole: true, _roleTex: deadRoleMap[player.role] || 'role_card_back' });
        if (player.weapon && player.weapon.id !== -1) allBoard.push(player.weapon);
        if (player.board) allBoard.push(...player.board);

        const firstRowN = Math.min(allBoard.length, 3);
        const groupW = (firstRowN + 1) * cW + firstRowN * g;
        const groupLeft = livesCX - groupW / 2;
        const livesX_adj = groupLeft + firstRowN * (cW + g) + cW / 2;

        const livesImg2 = gameScene.add.image(livesX_adj, livesCY, 'lives').setScale(sOpp);
        if (isCurrent) livesImg2.setTint(0x44ff44);
        gameScene.cardsSprites.add(livesImg2);
        const charY2 = livesCY - bH * Math.max(0, player.health);
        const charImg2 = gameScene.add.image(livesX_adj, charY2, getCharTex(player.character)).setScale(sOpp);
        if (isCurrent) charImg2.setTint(0x88ff88);
        gameScene.cardsSprites.add(charImg2);
        registerVeraPortrait(charImg2, player, getCharTex);
        if (player.role === 'Sheriff') {
            gameScene.cardsSprites.add(
                gameScene.add.image(livesX_adj + cW * 0.42, charY2 - cH * 0.45, 'sheriff_star').setScale(sOpp).setDepth(STAR_DEPTH)
            );
        }
        gameScene.cardsSprites.add(
            gameScene.add.text(livesX_adj, charY2 - cH * 0.52 - 4, player.name,
                { fontSize: '17px', color: isCurrent ? '#ffff88' : '#ccc',
                  backgroundColor: 'rgba(0,0,0,0.65)', padding: { x: 5, y: 3 } }).setOrigin(0.5, 1)
        );

        const texOf = (c) => c._isRole ? c._roleTex : getTex(c.id);
        // Skrytá při letu Paniky/Cat Balou i při odhazování karet po smrti; karta role
        // se nekreslí, dokud letí doprostřed obrazovky (fáze 'settled').
        const stealHidden = (c) => c._isRole ? (_deathStage === 'settled') : App.stealHideIds.has(c.id);
        const specBoardKey = (c) => 'ob0_' + (c._isRole ? 'role' : c.id);
        // Divák si karty jen prohlíží (nikam neklika), ale zvětšit si je musí umět stejně
        // jako hráč – včetně odhalené karty role (klíč jako v drawOpponents).
        const specZoom = (img, c) => {
            const key = c._isRole ? 'role:0' : c.id;
            img.setInteractive({ useHandCursor: false });
            img._zoomKey = key;
            img.on('pointerover', () => startCardZoom(texOf(c), key));
            img.on('pointerout', scheduleZoomFade);
        };
        for (let i = 0; i < firstRowN; i++) {
            if (stealHidden(allBoard[i])) continue;
            const bX = groupLeft + (firstRowN - 1 - i) * (cW + g) + cW / 2;
            const bImg = gameScene.add.image(bX, livesCY, texOf(allBoard[i])).setScale(sOpp);
            specZoom(bImg, allBoard[i]);
            gameScene.cardsSprites.add(bImg);
            reflowCard(specBoardKey(allBoard[i]), bImg, bX, livesCY, texOf(allBoard[i]), sOpp, 0);
        }
        for (let i = firstRowN; i < allBoard.length; i++) {
            if (stealHidden(allBoard[i])) continue;
            const col = i - firstRowN;
            const bX = groupLeft + (firstRowN - 1 - col) * (cW + g) + cW / 2;
            const bY = livesCY - (cH + g);
            const bImg = gameScene.add.image(bX, bY, texOf(allBoard[i])).setScale(sOpp);
            specZoom(bImg, allBoard[i]);
            gameScene.cardsSprites.add(bImg);
            reflowCard(specBoardKey(allBoard[i]), bImg, bX, bY, texOf(allBoard[i]), sOpp, 0);
        }

        const handCount = player.hand?.length || 0;
        if (handCount > 0) {
            const handY = 1065;
            const hSpacing = Math.min(cW * 0.35, 32);
            const totalSpread = (handCount - 1) * hSpacing;
            for (let h = 0; h < handCount; h++) {
                if (App.deathHandHide[0]?.has(h)) continue;   // slot už odletěl (smrt)
                const hx = livesCX - totalSpread / 2 + h * hSpacing;
                const hImg = gameScene.add.image(hx, handY, 'card_back').setScale(sOpp);
                gameScene.cardsSprites.add(hImg);
                reflowCard('oh0_' + h, hImg, hx, handY, 'card_back', sOpp, 0);
            }
        }
}

// ── Fázové overlaye (kontrola, Black Jack, Kit Carlson, Lucky Duke, store, Sid) ─
function drawPhaseOverlays(ctx) {
    const { getTex, me } = ctx;

    // ── High Noon (přibalené) – Želízka: zvolená barva platí celý tah, ať ji vidí
    // celý stůl (jinak by hráči nechápali, proč soupeř polovinu karet nehraje).
    if (state.activeEvent?.key === 'ZELIZKA') {
        const cp = state.players[state.currentPlayerIndex];
        if (cp && cp._handcuffsSuit) {
            const red = cp._handcuffsSuit === '♥️' || cp._handcuffsSuit === '♦️';
            const txt = gameScene.add.text(1280, 650, `🔗 ${cp._handcuffsSuit}`,
                { fontSize: '26px', color: red ? '#ff8888' : '#ddddee', fontStyle: 'bold',
                  backgroundColor: 'rgba(0,0,0,0.72)', padding: { x: 10, y: 4 } })
                .setOrigin(0.5).setDepth(60);
            gameScene.cardsSprites.add(txt);
        }
    }

    // ── RESPOND: nemodální banner nahoře – co tě ohrožuje / na koho se čeká ──
    if (state.phase === "RESPOND" && state.pendingResponse?.active && typeof describePendingResponse === 'function') {
        const d = describePendingResponse(state, myIndex);
        if (d) {
            let bg = gameScene.add.rectangle(960, 92, 1120, 96, 0x000000, 0.8).setDepth(205);
            bg.setStrokeStyle(3, d.forMe ? 0xff5555 : 0xffaa33);
            mAdd(bg, 205);
            if (d.forMe) {
                let l1 = gameScene.add.text(960, 66, `⚔️ ${d.sourceLabel} od hráče ${d.attackerName}!`,
                    { fontSize: '34px', color: '#ff6666', fontStyle: 'bold' }).setOrigin(0.5);
                mAdd(l1, 206);
                let l2 = gameScene.add.text(960, 112, `Zahraj ${d.need}, nebo klikni na své životy a schytej zásah`,
                    { fontSize: '23px', color: '#ffdddd' }).setOrigin(0.5);
                mAdd(l2, 206);
            } else {
                let l1 = gameScene.add.text(960, 92,
                    `⏳ Čeká se na hráče ${d.targetName} – brání se proti ${d.sourceLabel} (od ${d.attackerName})`,
                    { fontSize: '24px', color: '#ffcc88' }).setOrigin(0.5);
                mAdd(l1, 206);
            }
        }
    }

    // ── Kontrolní líznutí (Barel/Jourdonnais, Dynamit, Vězení): banner „co a proč" ──
    // Bez něj se jen rozsvítí balíček a hráč netuší, na co kliká ani co karta rozhodne.
    if ((state.phase === "BARREL_DRAW" || state.phase === "CHECK_DRAW") && typeof describePendingCheck === 'function') {
        const c = describePendingCheck(state, myIndex);
        if (c) {
            let bg = gameScene.add.rectangle(960, 92, 1120, 96, 0x000000, 0.8).setDepth(205);
            bg.setStrokeStyle(3, c.forMe ? 0xff8800 : 0xffaa33);
            mAdd(bg, 205);
            if (c.forMe) {
                let l1 = gameScene.add.text(960, 66, c.title,
                    { fontSize: '32px', color: '#ffbb55', fontStyle: 'bold' }).setOrigin(0.5);
                mAdd(l1, 206);
                let l2 = gameScene.add.text(960, 112, c.detail,
                    { fontSize: '22px', color: '#ffeedd' }).setOrigin(0.5);
                mAdd(l2, 206);
            } else {
                let l1 = gameScene.add.text(960, 92,
                    `⏳ Čeká se na hráče ${c.waitingName} – kontrolní líznutí (${c.short})`,
                    { fontSize: '24px', color: '#ffcc88' }).setOrigin(0.5);
                mAdd(l1, 206);
            }
        }
    }

    // CHECKING (Dynamit/Vězení/Barel/Jourdonnais) a BLACK_JACK_CHECK už NEMAJÍ modal
    // s tlačítkem – běží automatická reveal animace (startCheckReveal / startBlackJackReveal
    // v game.js, spuštěná z přechodu fáze v net/handlers.js). Čekajícího hráče zvýrazní
    // standardní „čekací" highlight (pendingActor). Kontrolní karta se v odhozu nezobrazí,
    // dokud tam reveal nedoletí (viz drawDrawPiles).

    if (state.phase === "KIT_CARLSON" && state.currentPlayerIndex === myIndex) {
        const kc = state.kitCarlsonState;

        const spacing = 260;
        const startX = 960 - spacing;

        kc.revealed.forEach((card, i) => {
            // Karta ještě letí z balíčku do panelu (rozdávání) – slot zatím prázdný.
            if (App.kitDealIds.has(card.id)) return;
            // Už vybraná (letí/je v ruce) – v panelu ji nekresli (server: pickedIds,
            // lokálně optimisticky: App.kitPicked hned po kliknutí).
            if (kc.pickedIds?.includes(card.id) || App.kitPicked.includes(card.id)) return;
            let cx = startX + i * spacing;
            let cSprite = gameScene.add.image(cx, 480, getTex(card.id)).setScale(0.6);
            cSprite.setInteractive({ useHandCursor: true });
            cSprite.on('pointerover', () => { cSprite.setScale(0.65); cSprite.setTint(0xddffdd); });
            cSprite.on('pointerout', () => { cSprite.setScale(0.6); cSprite.clearTint(); });
            let _kitPickSent = false;
            cSprite.on('pointerdown', () => {
                if (_kitPickSent) return;
                _kitPickSent = true;
                if (!App.kitPicked.includes(card.id)) App.kitPicked.push(card.id);
                // Vybraná velká karta letí rovnou do ruky se zmenšením (0.6 → ruka),
                // nečeká na druhý výběr. Staging skryje kartu v ruce do doletu.
                animateDrawToMyHand(myIndex, card.id, cx, 480, { faceUp: true, startScale: 0.6, duration: 460 });
                renderUI();   // panel ji hned přestane kreslit (App.kitPicked)
                socket.emit('kit_carlson_pick', i);
            });
            mAdd(cSprite);
        });
    }

    if (state.phase === "LUCKY_DUKE") {
        const ld = state.luckyDukeState;
        const isMyCheck = ld.checkContext.playerIdx === myIndex;

        ld.cards.forEach((card, i) => {
            // Karta ještě letí z balíčku do panelu (rozdávání) – slot zatím prázdný.
            if (App.luckyDealIds.has(card.id)) return;
            let cx = i === 0 ? 660 : 1260;
            let cSprite = gameScene.add.image(cx, 480, getTex(card.id)).setScale(0.65);
            mAdd(cSprite);

            // Marky se při výběru ZÁMĚRNĚ nezvýrazňují (blikání na obou kartách mate) –
            // pulz proběhne až na vybrané kartě uprostřed obrazovky, viz playLuckyDukeResult.
            if (isMyCheck) {
                cSprite.setInteractive({ useHandCursor: true });
                cSprite.setTint(0xddffdd);
                cSprite.on('pointerover', () => { cSprite.setScale(0.72); cSprite.setTint(0xffff44); });
                cSprite.on('pointerout', () => { cSprite.setScale(0.65); cSprite.setTint(0xddffdd); });
                cSprite.on('pointerdown', () => socket.emit('lucky_duke_pick', i));
            }
        });
    }

    if (state.phase === "STORE") {
        // Žádný overlay ani text – řada karet (stejně velkých jako balíčky) leží na
        // stole těsně pod zvednutými balíčky.
        const lift = App.storePileLiftY || 0;
        const cards = state.storeCards || [];
        const count = cards.length;
        const isMyPickTurn = state.storePickerIndex === myIndex && !App.storeLocked;
        // Jeden výběr na jedno vykreslení: dokud nedorazí nový stav (na pomalé lince
        // to je i půl vteřiny), zůstávají všechny karty nakreslené a klikatelné –
        // druhý klik by vybíral už za dalšího hráče. Server to odmítne (server/guard.js),
        // tady jen zhasneme UI, ať to nesvádí.
        let _storePickSent = false;

        cards.forEach((card, i) => {
            if (!card) return;
            // Karta ještě letí z balíčku (rozdávání) – slot zatím prázdný, objeví se po doletu.
            if (App.storeDealIds.has(card.id)) return;
            const slot = getStoreSlotPos(i, count, lift);
            let cSprite = gameScene.add.image(slot.x, slot.y, getTex(card.id)).setScale(0.3).setDepth(58);

            if (isMyPickTurn) {
                cSprite.setInteractive({ useHandCursor: true });
                cSprite.setTint(0xddffdd);
                // Po najetí jen lehce zvětšit (do všech stran), ne posouvat nahoru.
                // Dotyk: hover efekt přeskoč (jinak karta zůstane zvětšená bez „pointerout").
                cSprite.on('pointerover', (pointer) => { if (pointer?.wasTouch) return; cSprite.setTint(0xffff44); cSprite.setScale(0.34); });
                cSprite.on('pointerout', () => { cSprite.setTint(0xddffdd); cSprite.setScale(0.3); });
                cSprite.on('pointerdown', () => {
                    if (_storePickSent) return;
                    _storePickSent = true;
                    socket.emit('store_pick', { playerIdx: myIndex, cardIdx: i });
                });
            }
            mAdd(cSprite, 58);
        });
    }

    // Claus "The Saint" (Fistful): odkrytá řada uprostřed stolu + banner s tím, PRO KOHO
    // se právě vybírá. Claus vidí líce a kliká, ostatní i divák vidí ruby (redactState).
    // Geometrie řady je v clausPanelLayout (game.js) – jediný zdroj pro kreslení i lety.
    if (state.phase === "CLAUS_GIVE" && state.clausState) {
        const cs = state.clausState;
        const revealed = cs.revealed || [];
        const P = App.clausPanel || clausPanelLayout(revealed.length);
        const mine = state.currentPlayerIndex === myIndex && myIndex !== null;
        // Jeden výběr na jedno vykreslení: dokud nedorazí nový stav, zůstávají karty
        // nakreslené a klik navíc by vybíral už za dalšího příjemce (server ho odmítne,
        // tady jen zhasneme UI). Stejná dohoda jako u hokynářství.
        let _clausPickSent = false;
        revealed.forEach((card, i) => {
            if (App.clausDealSlots?.has(i)) return;      // ještě letí z balíčku
            if (cs.picked?.includes(i)) return;          // už rozdaná (stav)
            if (App.clausTakenSlots?.has(i)) return;     // právě odlétá k příjemci
            const slot = clausSlotPos(i);
            const cSprite = gameScene.add.image(slot.x, slot.y, getTex(card?.id)).setScale(P.scale);
            if (mine && !App.blockInput) {
                cSprite.setInteractive({ useHandCursor: true });
                cSprite.setTint(0xddffdd);
                cSprite.on('pointerover', (pointer) => {
                    if (pointer?.wasTouch) return;
                    cSprite.setScale(P.scale * 1.08); cSprite.setTint(0xffff44);
                });
                cSprite.on('pointerout', () => { cSprite.setScale(P.scale); cSprite.setTint(0xddffdd); });
                cSprite.on('pointerdown', () => {
                    if (_clausPickSent) return;
                    _clausPickSent = true;
                    App.blockInput = true;
                    socket.emit('claus_give', { cardIdx: i });
                });
            }
            mAdd(cSprite);
        });

        const toIdx = cs.toIdx;
        const self = toIdx === state.currentPlayerIndex;
        const left = self ? Math.max(0, (cs.keep || 0) - (cs.taken || 0)) : (cs.queue || []).length;
        const plural = (n) => n === 1 ? 'kartu' : n < 5 ? 'karty' : 'karet';
        const txt = !mine ? 'Claus the Saint rozděluje karty…'
            : self ? `Claus the Saint – vezmi si ${left} ${plural(left)} pro sebe`
                   : `Claus the Saint – dej kartu hráči ${state.players[toIdx]?.name || '?'} (zbývá ${left})`;
        const l1 = gameScene.add.text(960, 70, txt,
            { fontSize: '26px', color: '#ffdd88', fontStyle: 'bold' }).setOrigin(0.5);
        mAdd(l1, 206);
    }

    // „Odhoď další kartu" (Dodge City): banner. Zrušení = klik zpět na hlavní (hranou) kartu.
    if (state.phase === "DISCARD_ANOTHER" && state.pendingDiscardAnother?.playerIdx === myIndex) {
        let l1 = gameScene.add.text(960, 70, 'Klikni na kartu, kterou odhodíš jako cenu',
            { fontSize: '26px', color: '#ffdd88', fontStyle: 'bold' }).setOrigin(0.5);
        mAdd(l1, 206);
    }

    if (state.phase === "SID_SAVE" && state.pendingSidSave?.playerIdx === myIndex) {
        let overlay = gameScene.add.rectangle(960, 540, stageW(), stageH(), 0x000000, 0.6).setDepth(200);
        gameScene.cardsSprites.add(overlay);
        const needed = state.pendingSidSave.firstDiscarded ? 1 : 2;
        let label = gameScene.add.text(960, 300,
            `⚠️ Sid Ketchum – zahoď ${needed} kartu${needed > 1 ? 'y' : 'u'} abys přežil!`,
            { fontSize: '36px', color: '#ff8800', backgroundColor: 'rgba(0,0,0,0.8)', padding: 15 })
            .setOrigin(0.5);
        mAdd(label);
        me.hand.forEach((card, index) => {
            let posX = 600 + index * 120;
            let cSprite = gameScene.add.image(posX, 540, getTex(card.id))
                .setScale(0.35).setTint(0xff6666).setInteractive({ useHandCursor: true });
            cSprite.on('pointerdown', () => {
                socket.emit('sid_save_discard', { playerIdx: myIndex, cardIdx: index });
            });
            mAdd(cSprite);
        });
    }
}


// ── Balíčky: dobírací + odhazovací hromádka, zvýraznění lízání/check (vrací isMyDraw) ─
// Rozšíření High Noon / A Fistful of Cards: balíček událostí rubem nahoru a vedle něj
// hromádka už odkrytých karet lícem nahoru (nová vždy překryje předchozí, hromádka roste
// do výšky – stejně jako odhoz). Kreslí se pro OBA balíčky; kde který leží, rozhoduje
// eventSlot (game.js) podle toho, která rozšíření se hrají. Balíčky se zvedají při
// hokynářství (řada rozdaných karet sahá při 7 hráčích až na x=1320, takže bez zvednutí
// by přes ně ležela).
// Vrchní (platná) karta jde zvětšit najetím kurzoru – stejná cesta jako u vrchní karty odhozu.
function drawEventPile(ctx, which) {
    const { scaleDeck } = ctx;
    if (!state) return;
    const isFf = which === 'ff';
    // App.hnDeckLeft / ffDeckLeft: po dobu cinematiky odkrytí kreslíme balíček podle
    // animace, ne podle stavu (ten dorazí až po ní). Karta z balíčku odchází HNED, takže
    // při odkrytí poslední musí balíček zmizet se startem letu, ne až na jeho konci.
    const left = (isFf ? App.ffDeckLeft : App.hnDeckLeft)
        ?? ((isFf ? state.ffDeck : state.eventDeck)?.length || 0);
    const pile = (isFf ? state.ffPile : state.eventPile) || [];
    if (!left && !pile.length) return;   // tohle rozšíření se nehraje

    const slot = eventSlot(which);
    if (!slot) return;
    const pxPerCard = 0.25;
    const baseY = slot.y;
    const prefix = eventTexPrefix(which);

    if (left > 0) {
        const backKey = prefix + 'back';
        const backTex = gameScene.textures.exists(backKey) ? backKey : 'card_back';
        const topY = baseY - (left - 1) * pxPerCard / 2;
        for (let k = left - 1; k >= 0; k--) {
            const layer = gameScene.add.image(slot.deckX, topY + k * pxPerCard, backTex).setScale(scaleDeck);
            gameScene.cardsSprites.add(layer);
        }
    }

    // Hromádka odkrytých: spodní karty vykukují nepatrně natočené, vrchní leží rovně
    // a je čitelná. Natočení je deterministické z ID karty (stejné u všech hráčů).
    // Nová karta se sem NEPŘIDÁVÁ dřív, než dorazí stav – během její cinematiky letí
    // jako samostatný sprite a stav (s ní na vrcholu) čeká ve frontě (net/handlers.js),
    // takže tady je pořád vidět předchozí platná karta.
    const topY = baseY - (pile.length - 1) * pxPerCard / 2;
    for (let i = 0; i < pile.length; i++) {
        const card = pile[i];
        const tex = prefix + card.art;
        if (!gameScene.textures.exists(tex)) continue;
        const isTop = i === pile.length - 1;
        const angle = isTop ? 0 : (((card.id * 2654435761) >>> 0) % 700) / 100 - 3.5;
        const spr = gameScene.add.image(slot.activeX, topY + (pile.length - 1 - i) * pxPerCard, tex)
            .setScale(scaleDeck).setAngle(angle).setDepth(i);
        gameScene.cardsSprites.add(spr);
        if (!isTop) continue;
        const zoomKey = prefix + card.id;
        spr.setInteractive();
        spr._zoomKey = zoomKey;
        spr.on('pointerover', () => startCardZoom(tex, zoomKey));
        spr.on('pointerout', scheduleZoomFade);
    }
}

function drawDrawPiles(ctx) {
    const { getTex, scaleDeck, me } = ctx;

    // Hokynářství zvedne oba balíčky nahoru, aby se pod ně vešla řada karet.
    const _lift = App.storePileLiftY || 0;
    const deckX = DECK_X, deckY = DECK_Y - _lift;
    const discardX = DISCARD_X, discardY = DISCARD_Y - _lift;

    const pxPerCard = 0.25;   // tenčí hromádky (dříve 0.5)
    const stackTop = (count) => deckY - (count - 1) * pxPerCard / 2;

    // Během míchání se balíček nekreslí (místo počtu 🔀) – platí i pro míchání
    // v hokynářství, které běží ve zvednuté poloze (App.storeShuffling).
    const _hideDeck = App.reshuffleAnimating || App.reshuffleIsProactive || App.storeShuffling;
    // Po dobu rozdávání v hokynářství kreslíme balíček podle vlastního počtu
    // (App.storeDeckCount), ne podle stavu – ten už obsahuje zamíchaný balíček. Viz
    // startStoreCinematic/dealStoreCards v game.js.
    const _deckCount = App.storeDeckCount !== null && App.storeDeckCount !== undefined
        ? App.storeDeckCount : (state.deck.cards?.length ?? 0);

    {
        const total = _hideDeck ? 0 : _deckCount;
        if (total > 0) {
            const topY = stackTop(total);
            // Vykreslíme jen horních max 80 vrstev (výkon), ale VŽDY včetně k===0 –
            // to je interaktivní vrch balíčku (tint/klik). Dřív se ořezávalo odspodu
            // (renderFrom = total-80), takže při balíčku >80 karet (rozšíření!) se k===0
            // nevykreslil a zvýraznění/klikatelnost se odpojily o kus níž.
            const renderCount = Math.min(total, 80);
            for (let k = renderCount - 1; k >= 0; k--) {
                const ly = topY + k * pxPerCard;
                const layer = gameScene.add.image(deckX, ly, 'card_back').setScale(scaleDeck);
                gameScene.cardsSprites.add(layer);
                if (k === 0) {
                    var _deckTopY = ly;
                    var _deckSprite = layer;
                }
            }
        }
    }
    if (typeof _deckTopY === 'undefined') { var _deckTopY = deckY; var _deckSprite = null; }
    let deckSprite = _deckSprite || (() => {
        const s = gameScene.add.image(deckX, deckY, 'card_back').setScale(scaleDeck).setAlpha(0);
        gameScene.cardsSprites.add(s); return s;
    })();

    if (_hideDeck) {
        deckSprite.setAlpha(0);
    }

    let discardSprite = null;
    const isPedroDraw = state.phase === "DRAW" &&
                        state.drawPhaseState?.playerIdx === myIndex &&
                        (state.drawPhaseState?.options || []).includes('discard') &&
                        state.deck.discardPile.length > 0;
    // POZOR: setInteractive lze na sprite nastavit jen JEDNOU – opakované volání už
    // `useHandCursor` nepřepíše. Všechny důvody, proč má odhoz ručičku, proto musí být
    // tady (níž se sprite jen tintuje a věší se na něj klik). DE_DECK = „odhoď další
    // kartu" bez cíle (Whisky/Rvačka) – potvrzuje se klikem na odhazovací balíček.
    const discardNeedsCursor = (selectedState.action === "PLAY_CARD" && selectedState.cardIndex !== null) ||
        (selectedState.action === "DE_DECK" && selectedState.cardIndex !== null) ||
        ((selectedState.action === "GREEN_MASS" || selectedState.action === "GREEN_SELF") && selectedState.greenCardId != null) || isPedroDraw;

    // Během sejmutí je kontrolní karta navrchu odhozu, ale vizuálně je teď uprostřed
    // (reveal animace). V odhozu ji proto zatím nezobrazuj – naskočí, až tam dolétne.
    let _dpile = state.deck.discardPile;
    if (state.phase === "CHECKING" && state.currentCheck?.active && _dpile.length > 0 &&
        _dpile[_dpile.length - 1]?.id === state.currentCheck.card?.id) {
        _dpile = _dpile.slice(0, -1);
    }
    // Karta právě letí do odhozu (dynamit bum / vězení) – navrchu ji zatím neukazuj,
    // objeví se až po dosednutí své animace (viz dynamite_explode / board_to_discard).
    if (App.discardAnimHideId != null && _dpile.length > 0 &&
        _dpile[_dpile.length - 1]?.id === App.discardAnimHideId) {
        _dpile = _dpile.slice(0, -1);
    }
    // Karty odhazované při smrti hráče (Návrh 2) – navrchu odhozu je nezobrazuj,
    // dokud nedoletí jejich animace; mizí postupně, jak dosedají (jsou na vrcholu).
    while (App.deathDiscardHideIds.size > 0 && _dpile.length > 0 &&
           App.deathDiscardHideIds.has(_dpile[_dpile.length - 1]?.id)) {
        _dpile = _dpile.slice(0, -1);
    }
    // Karty letící do odhozu (Lucky Duke) – skryj je kdekoli v hromádce do doletu
    // (výsledek checku nad ně mohl přidat další), jinak naskočí dřív než dolétnou.
    if (App.discardFlyHideIds.size > 0 && _dpile.length > 0) {
        _dpile = _dpile.filter(c => !App.discardFlyHideIds.has(c.id));
    }

    if (_dpile.length > 0) {
        const pile = _dpile;
        const n = pile.length;
        const topY    = discardY - (n - 1) * pxPerCard / 2;
        const renderFrom = Math.max(0, n - 80);

        for (let k = renderFrom; k < n - 1; k++) {
            const card = pile[k];
            const ly = topY + (n - 1 - k) * pxPerCard;
            const seed = (card.id * 2654435761) >>> 0;
            const angle = ((seed % 1000) / 1000 - 0.5) * 10;
            gameScene.cardsSprites.add(
                gameScene.add.image(discardX, ly, getTex(card.id))
                    .setScale(scaleDeck).setAngle(angle)
            );
        }

        const topCard = pile[n - 1];
        const topSeed = (topCard.id * 2654435761) >>> 0;
        const topAngle = ((topSeed % 1000) / 1000 - 0.5) * 4;
        discardSprite = gameScene.add.image(discardX, topY, getTex(topCard.id))
            .setScale(scaleDeck).setAngle(topAngle);
        gameScene.cardsSprites.add(discardSprite);
        discardSprite.setInteractive({ useHandCursor: discardNeedsCursor });
        discardSprite._zoomKey = 'discard:' + topCard.id;
        discardSprite.on('pointerover', () => startCardZoom(getTex(topCard.id), 'discard:' + topCard.id));
        discardSprite.on('pointerout', scheduleZoomFade);

        var _discardTopY = topY;
    } else {
        const cW = 325 * scaleDeck, cH = 500 * scaleDeck;
        discardSprite = gameScene.add.rectangle(discardX, discardY, cW, cH, 0x000000, 0);
        discardSprite.setStrokeStyle(2, 0x444444, 0.6);
        gameScene.cardsSprites.add(discardSprite);
        // Poprvé (typicky přechod intro → hra) ohraničení plynule nafadeujeme,
        // ne aby naskočilo naráz. Tweenem alpha 0→1 zesílí jen okraj (výplň je 0).
        if (!App.discardBorderShown) {
            App.discardBorderShown = true;
            discardSprite.setAlpha(0);
            gameScene.tweens.add({ targets: discardSprite, alpha: 1, duration: 500, ease: 'Power2' });
        }
        if (discardNeedsCursor) discardSprite.setInteractive({ useHandCursor: true });
        var _discardTopY = discardY;
    }

    const deck    = { x: deckX,    y: _deckTopY    };
    const discard = { x: discardX, y: _discardTopY };

    const isMyDraw = !_hideDeck && state.phase === "DRAW" &&
                    state.drawPhaseState?.playerIdx === myIndex;

    const _serverDrawn     = state.drawPhaseState?.cardsDrawn ?? 0;
    const _neededTotal     = state.drawPhaseState?.cardsNeeded ?? 2;
    const _effectiveDrawn  = _serverDrawn + App.pendingDrawCount;
    const _drawStillNeeded = _neededTotal - _effectiveDrawn;
    // !App.blockInput: po Patině vzetí karty ze stolu (nastaví blockInput) zhasni i balíček
    // HNED se startem animace, ne až po ní. Normální lízání z balíčku blockInput nenastavuje
    // (řídí se pendingDrawCount), takže víceklik zůstává funkční.
    const _isMyDrawActive  = isMyDraw && _drawStillNeeded > 0 && !App.blockInput;

    if (_isMyDrawActive) {
        deckSprite.setTint(0xffff44);
        deckSprite.setAlpha(1);
        deckSprite.setInteractive({ useHandCursor: true });
        deckSprite.on('pointerdown', () => {
            if (App.reshuffleAnimating) return;
            // Guard přes STABILNÍ hodnoty (server potvrzené + naklikané) – ne přes
            // _drawStillNeeded, který už pendingDrawCount odečítá. Jinak by re-render
            // během stagingu (renderUI z animateDrawToMyHand) zablokoval druhý klik,
            // dokud nedorazí broadcast (= dokud první karta není v ruce).
            if (_serverDrawn + App.pendingDrawCount >= _neededTotal) return;
            App.pendingDrawCount++;
            socket.emit('draw_card', { source: 'deck', sourceIdx: null });
            // Presne 380ms od tohoto kliku: karta se objevi v ruce
            // Server posle room_update za 350ms (< 380ms) takze stav bude ready
            setTimeout(() => renderUI(), 380);
            // Okamzite odzvyrazni balicek pokud to byl posledni povoleny klik
            if (_drawStillNeeded - App.pendingDrawCount <= 0) renderUI();
        });
        // Pedro Ramirez: PRVNÍ kartu může vzít z odhozu. Tahle volba musí být dostupná
        // i během aktivního lízání (drawStillNeeded>0), jinak se odhoz jen označil
        // kurzorem, ale nešel kliknout (žádný tint, žádný pointerdown).
        if (state.drawPhaseState.options.includes('discard') && state.deck.discardPile.length > 0 && !App.pedroDrawLock) {
            discardSprite?.setTint(0xffff44);
            discardSprite?.setInteractive({ useHandCursor: true });
            discardSprite?.on('pointerdown', () => {
                if (App.pedroDrawLock) return;
                App.pedroDrawLock = true;            // zamkni odhoz do potvrzení serverem
                discardSprite?.clearTint();
                discardSprite?.disableInteractive();
                socket.emit('draw_card', { source: 'discard', sourceIdx: null });
            });
        }
    } else if (isMyDraw) {
        deckSprite.setAlpha(1);

        if (state.drawPhaseState.options.includes('discard') && state.deck.discardPile.length > 0 && !App.pedroDrawLock) {
            discardSprite?.setTint(0xffff44);
            discardSprite?.setInteractive({ useHandCursor: true });
            discardSprite?.on('pointerdown', () => {
                if (App.pedroDrawLock) return;
                App.pedroDrawLock = true;
                discardSprite?.clearTint();
                discardSprite?.disableInteractive();
                socket.emit('draw_card', { source: 'discard', sourceIdx: null });
            });
        }
    }

    const isMyCheckDraw = state.phase === "CHECK_DRAW" &&
                        state.pendingCheckDraw?.playerIdx === myIndex;

    if (isMyCheckDraw) {
        deckSprite.setTint(0xff8800);
        deckSprite.setInteractive({ useHandCursor: true });
        deckSprite.on('pointerdown', () => {
            socket.emit('trigger_check_draw');
        });
    }

    const isMyBarrelDraw = state.phase === "BARREL_DRAW" &&
                            state.pendingBarrelCheck?.targetIdx === myIndex;

    if (isMyBarrelDraw) {
        deckSprite.setTint(0xff8800);
        deckSprite.setInteractive({ useHandCursor: true });
        deckSprite.on('pointerdown', () => socket.emit('trigger_barrel_draw'));
    }

    if (selectedState.action === "PLAY_CARD" && selectedState.cardIndex !== null) {
        discardSprite.setInteractive({ useHandCursor: true });
        if (discardSprite.setTint) discardSprite.setTint(0xffff44);
        else discardSprite.setStrokeStyle(3, 0xffff44, 1);
        discardSprite.on('pointerover', () => {
            if (discardSprite.setTint) discardSprite.setTint(0xffff88);
        });
        discardSprite.on('pointerout', () => {
            if (discardSprite.setTint) discardSprite.setTint(0xffff44);
        });
        discardSprite.on('pointerdown', () => {
            const capturedIdx = selectedState.cardIndex;
            const card = me.hand[capturedIdx];
            if (card?.type === "Kulomet" || card?.type === "Indiáni!") {
                socket.emit('play_special', { attackerIdx: myIndex, targetIdx: null, cardIdx: capturedIdx });
                state.phase = "RESPOND";
            } else {
                socket.emit('play_card', capturedIdx);
            }
            optimisticRemoveCard(capturedIdx);
            selectedState = { cardIndex: null, action: null };
            App.blockInput = true;
            renderUI();
        });
    }

    // Houfnice (masový útok) i „vlastní" zelené (Pony express, Čutora): potvrzení klikem
    // na ODHAZOVACÍ hromádku (jako Kulomet) – karta se přitom odhodí.
    if ((selectedState.action === "GREEN_MASS" || selectedState.action === "GREEN_SELF") && selectedState.greenCardId != null) {
        discardSprite.setInteractive({ useHandCursor: true });
        if (discardSprite.setTint) discardSprite.setTint(0xffff44);
        discardSprite.on('pointerover', () => { if (discardSprite.setTint) discardSprite.setTint(0xffff88); });
        discardSprite.on('pointerout', () => { if (discardSprite.setTint) discardSprite.setTint(0xffff44); });
        discardSprite.on('pointerdown', () => {
            socket.emit('activate_green_card', { playerIdx: myIndex, cardId: selectedState.greenCardId, target: null });
            selectedState = { cardIndex: null, action: null };
            App.blockInput = true;
            renderUI();
        });
    }

    if (state.phase === "BART_DRAW" && state.pendingBartDraw?.playerIdx === myIndex) {
        deckSprite.setTint(0xffff44);
        deckSprite.setInteractive({ useHandCursor: true });
        deckSprite.on('pointerdown', () => {
            socket.emit('bart_cassidy_draw');
            state.pendingBartDraw = null;
            state.phase = state.interruptedPhase || 'PLAY';
            renderUI();
        });
    }

    if (state.phase === "SUZY_DRAW" && state.pendingSuzyDraw?.playerIdx === myIndex) {
        deckSprite.setTint(0xffff44);
        deckSprite.setInteractive({ useHandCursor: true });
        deckSprite.on('pointerdown', () => {
            state.pendingSuzyDraw = null;
            App.blockInput = true;
            renderUI();
            socket.emit('suzy_draw');
        });
    }

    if (state.phase === "UHYB_DRAW" && state.pendingUhybDraw?.playerIdx === myIndex) {
        deckSprite.setTint(0xffff44);
        deckSprite.setInteractive({ useHandCursor: true });
        deckSprite.on('pointerdown', () => {
            socket.emit('uhyb_draw');
            state.pendingUhybDraw = null;
            state.phase = state.interruptedPhase || 'PLAY';
            renderUI();
        });
    }

    // Dodge City „odhoď další kartu" – Whisky/Rvačka nemají jeden cíl, potvrzují se
    // kliknutím na ODHAZOVACÍ balíček (DE_DECK). Pak se přejde na výběr ceny (DISCARD_ANOTHER).
    if (selectedState.action === "DE_DECK" && selectedState.cardIndex !== null && discardSprite) {
        discardSprite.setInteractive({ useHandCursor: true });
        if (discardSprite.setTint) discardSprite.setTint(0xffff44);
        else discardSprite.setStrokeStyle(3, 0xffff44, 1);
        discardSprite.on('pointerover', () => { if (discardSprite.setTint) discardSprite.setTint(0xffff88); });
        discardSprite.on('pointerout', () => { if (discardSprite.setTint) discardSprite.setTint(0xffff44); });
        discardSprite.on('pointerdown', () => {
            socket.emit('discard_extra_choose', { cardIdx: selectedState.cardIndex, targetIdx: null });
            selectedState = { cardIndex: null, action: null };
            App.blockInput = true;
            renderUI();
        });
    }

    return isMyDraw;
}
