// view/intro.js — úvodní „cinematika" (rozdávání rolí, postav a karet).
// Vytaženo z game.js byte-přesně. Načítá se PO game.js (sdílené globály:
// gameScene, state, myIndex, App, socket, mAdd, positions.js). Mutuje _introState,
// který řídí socket handler intro_phase v game.js.

// ══════════════════════════════════════════════════════════════════════════════
// INTRO ANIMACE - globální stav
// ══════════════════════════════════════════════════════════════════════════════
let _introState = null; // null = žádné intro

function _introActive() { return _introState !== null && _introState.sub !== 'done'; }

// Tvrdý reset intro cinematiky – volá se při odchodu z hry (go_to_menu/kicked)
// během intra. Bez toho zůstane _introState non-null → _introActive() je dál true
// a renderUI kreslí zbytky staré intro animace přes nově spuštěnou hru.
function _resetIntro() {
    _introState = null;
    _clearIntroSprites();
    App.introExpected = false;
    App.introRoleOkSent = false;
}

// Pomocná: přidá sprite do cardsSprites (intro sprite skupina)
function _iAdd(obj) {
    if (gameScene && gameScene.cardsSprites) gameScene.cardsSprites.add(obj);
    return obj;
}

// Leader může ukončit hru i během intra (cinematika role/postav/rozdávání).
function _introLeaderEndButton() {
    if (!gameScene || typeof roomState === 'undefined' || !roomState) return;
    if (roomState.leaderSocketId !== socket.id) return;
    // Stejný vzhled jako lídrovské „Ukončit hru" ve hře (game.js) – themeButton.
    const { bg } = themeButton(gameScene, 30, 30, 210, 48, '✕  Ukončit hru', {
        origin: [0, 0], fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030,
        stroke: THEME.color.dangerNum, fontSize: '18px',
        onClick: () => {
            if (confirm('Opravdu chceš ukončit hru? Všichni hráči se vrátí do menu.')) {
                socket.emit('cancel_game');
            }
        },
    });
    bg.setDepth(1200);
}

// Vykreslí jednu „umístěnou" položku intra – kartu (obrázek) nebo jmenovku (text).
// U jmenovky nese pc.style přesný herní styl a origin(0.5, 0) jako v drawOpponents/drawMyArea.
function _drawPlacedCard(pc) {
    if (pc.hidden) return;
    if (pc.text) {
        _iAdd(gameScene.add.text(pc.x, pc.y, pc.text, pc.style)
            .setOrigin(0.5, 0).setDepth(pc.depth || 50));
    } else {
        _iAdd(gameScene.add.image(pc.x, pc.y, pc.tex)
            .setScale(pc.scale).setAngle(pc.angle || 0).setDepth(pc.depth || 20));
    }
}

// Souřadnice tří úvodních balíčků (střed obrazovky)
const INTRO_ROLE_DECK  = { x: 960 - 160, y: 540 };
const INTRO_CHAR_DECK  = { x: 960,       y: 540 };
const INTRO_PLAY_DECK  = { x: 960 + 160, y: 540 };

// Vykreslí balíček n karet naskládaných (každá o 0.7px níž/vpravo)
function _drawIntroStack(x, y, tex, n, scale, label) {
    // Stejny styl jako herny balicek: pouze svisly offset (tenci hromadka), zadny x offset
    const safeTex = gameScene.textures.exists(tex) ? tex : 'card_back';
    const pxPerCard = 0.25;
    const layers = Math.min(n, 80); // stejne jako herny balicek
    const topY = y - (layers - 1) * pxPerCard / 2;
    for (let k = layers - 1; k >= 0; k--) {
        const ly = topY + k * pxPerCard;
        // Karta nejvýš na obrazovce (k=0, nejmenší y) musí být NAVRCHU (nejvyšší
        // depth) – jinak balíček vypadá "z druhé strany". Stejně jako herní balíček.
        const img = gameScene.add.image(x, ly, safeTex)
            .setScale(scale).setDepth(10 + (layers - 1 - k));
        _iAdd(img);
    }
    if (label) {
        const lbl = gameScene.add.text(x, y + 160, label,
            { fontSize: '22px', color: '#ffcc88', backgroundColor: 'rgba(0,0,0,0.65)', padding: { x: 8, y: 4 } })
            .setOrigin(0.5).setDepth(30);
        _iAdd(lbl);
    }
}

// ── INTRO RIFFLE SHUFFLE ──────────────────────────────────────────────────────
// Jednotná animace pro všechny tři balíčky.
// N        = počet viditělných karet (reálný počet nebo min(počet,24))
// tiltDeck = true → půlky se nakloní (~12°), false → bez náklonu (pro role)
// Vrací celkovou dobu animace v ms (pro server timing).
//
// Fáze:
//   0ms              karty vyskočí ze středu balíčku
//   flyEnd           rozdělení na dvě půlky
//   splitEnd         riffle – karty střídavě padají do středu
//   riffleEnd        srovnání balíčku
//   sortEnd          flash + destroy
//   onComplete

function _clearIntroSprites() {
    if (gameScene && gameScene.introSprites) {
        gameScene.introSprites.clear(true, true);
    }
}

function _iIntro(obj, depth) {
    obj.setDepth(depth ?? 50);
    if (gameScene && gameScene.introSprites) gameScene.introSprites.add(obj);
    return obj;
}

// Riffle shuffle animace pro intro balicky.
// Sprity jsou v introSprites (nečistí se při renderUI).
// tiltDeck=false → bez náklonu (role), tiltDeck=true → náklon ~12° (postavy, balíček)
function _animateIntroShuffle(cx, cy, tex, scale, N, tiltDeck, onComplete, onSettled) {
    if (!gameScene || !gameScene.introSprites) {
        if (onSettled) onSettled();
        if (onComplete) onComplete();
        return;
    }

    // Vyčisti předchozí intro animaci
    _clearIntroSprites();

    const safeTex = gameScene.textures.exists(tex) ? tex : 'card_back';

    // Počet vizuálních karet (logaritmicky)
    const visN = Math.max(4, Math.min(24, N <= 7 ? N : N <= 14 ? Math.min(N, 14) : 24));
    const half = Math.ceil(visN / 2);

    // Timing podle velikosti balíčku
    const flyDur        = N <= 7  ? 300  : N <= 14 ? 360  : 480;
    const flyDelay      = N <= 7  ? 55   : N <= 14 ? 45   : 18;
    const flyEnd        = flyDur + flyDelay * visN + 80;
    const splitDur      = N <= 7  ? 260  : N <= 14 ? 300  : 400;
    const splitEnd      = flyEnd + splitDur + 60;
    const rifflePerCard = N <= 7  ? 175  : N <= 14 ? 120  : Math.max(80, Math.floor(2600 / visN));
    const riffleEnd     = splitEnd + rifflePerCard * visN + 200;
    const sortDur       = N <= 7  ? 180  : N <= 14 ? 220  : 380;
    const sortDelay     = N <= 7  ? 12   : N <= 14 ? 10   : 8;
    const sortEnd       = riffleEnd + sortDur + sortDelay * visN + 100;
    const flashAt       = sortEnd + 100;
    const totalMs       = flashAt + 350;
    const splitOffX     = N <= 7  ? 80   : N <= 14 ? 100  : 140;
    const tilt          = tiltDeck ? 0.20 : 0;

    // Faze 1: karty se materializují ze středu balíčku.
    // Hromádku centrujeme na cy (stejně jako statický balíček _drawIntroStack),
    // aby se při výměně animace → statický balíček balíček neposunul.
    const sprites = [];
    for (let i = 0; i < visN; i++) {
        const sp = gameScene.add.image(cx, cy - (i - (visN - 1) / 2) * 0.5, safeTex)
            .setScale(scale * 0.01)
            .setAlpha(0)
            .setDepth(50 + i);
        if (gameScene.introSprites) gameScene.introSprites.add(sp);
        sprites.push(sp);

        gameScene.tweens.add({
            targets: sp,
            scaleX: scale, scaleY: scale,
            alpha: 1,
            duration: flyDur,
            delay: i * flyDelay,
            ease: 'Power2.easeOut'
        });
    }

    // Faze 2: split na dve pulky
    gameScene.time.delayedCall(flyEnd, () => {
        sprites.forEach((sp, i) => {
            if (!sp.active) return;
            const isLeft = i < half;
            const stackI = isLeft ? i : i - half;
            gameScene.tweens.add({
                targets:  sp,
                x:        cx + (isLeft ? -splitOffX : splitOffX),
                y:        cy + stackI * 1.0 - half * 0.5,
                rotation: isLeft ? -tilt : tilt,
                duration: splitDur,
                delay:    i * 6,
                ease:     'Power2.easeInOut'
            });
        });
    });

    // Faze 3: riffle
    sprites.forEach((sp, i) => {
        const isLeft     = i < half;
        const stackI     = isLeft ? i : i - half;
        const riffleSlot = isLeft ? stackI * 2 : stackI * 2 + 1;
        const delay      = splitEnd + riffleSlot * rifflePerCard;

        gameScene.time.delayedCall(delay, () => {
            if (!sp.active) return;
            const peakX = cx + (isLeft ? -splitOffX * 0.3 : splitOffX * 0.3);
            gameScene.tweens.add({
                targets:  sp,
                x: peakX, y: cy - 24,
                rotation: 0,
                scaleX: scale * 1.05, scaleY: scale * 1.05,
                duration: 90, ease: 'Power1.easeOut',
                onComplete: () => {
                    if (!sp.active) return;
                    const finalY = cy + (riffleSlot - visN / 2) * 0.45;
                    gameScene.tweens.add({
                        targets:  sp,
                        x: cx, y: finalY,
                        scaleX: scale, scaleY: scale,
                        duration: 110, ease: 'Power2.easeIn',
                        // Vyšší karta na obrazovce (menší riffleSlot → menší finalY)
                        // musí být navrchu (vyšší depth) – jinak se pile skládá obráceně.
                        onComplete: () => { if (sp.active) sp.setDepth(50 + (visN - 1 - riffleSlot)); }
                    });
                }
            });
        });
    });

    // Faze 4: srovnání
    gameScene.time.delayedCall(riffleEnd, () => {
        sprites.forEach((sp, i) => {
            if (!sp.active) return;
            // Resetuj depth podle finální pozice (vyšší karta = vyšší i = navrchu),
            // ať resting balíček odpovídá statickému balíčku, který ho vystřídá.
            sp.setDepth(50 + i);
            gameScene.tweens.add({
                targets:  sp,
                x: cx, y: cy - (i - (visN - 1) / 2) * 0.5,
                rotation: 0,
                duration: sortDur,
                delay:    i * sortDelay,
                ease:     'Power3.easeOut'
            });
        });
    });

    // Flash + destroy
    const cw = 325 * scale, ch = 500 * scale;
    gameScene.time.delayedCall(flashAt, () => {
        sprites.forEach(sp => { if (sp?.active) sp.destroy(); });
        // Animované karty zničeny – balíček "doskládán". Dej vědět, ať se hned
        // ukáže statický balíček (jinak by místo na chvíli zůstalo prázdné).
        if (onSettled) onSettled();
        const flash = gameScene.add.rectangle(cx, cy, cw * 1.5, ch * 1.5, 0xffdd44, 0.55)
            .setDepth(90);
        if (gameScene.introSprites) gameScene.introSprites.add(flash);
        gameScene.tweens.add({
            targets: flash, alpha: 0, scaleX: 1.8, scaleY: 1.8,
            duration: 400, ease: 'Power2',
            onComplete: () => { if (flash.active) flash.destroy(); }
        });
    });

    gameScene.time.delayedCall(totalMs, () => {
        if (onComplete) onComplete();
    });
}


function _getIntroPlayerPos(targetPlayerIdx, myIdx, total) {
    if (myIdx === null || myIdx === undefined) return { x: 960, y: 540 };
    if (targetPlayerIdx === myIdx) return { x: 960, y: 900 };
    if (state && state.players) return getPlayerHandPos(targetPlayerIdx);
    const others = total - 1;
    const diff = (targetPlayerIdx - myIdx + total) % total - 1;
    const positions = [
        { x: 200,  y: 540 },
        { x: 960,  y: 140 },
        { x: 1720, y: 540 },
        { x: 400,  y: 200 },
        { x: 1520, y: 200 },
        { x: 960,  y: 870 },
    ];
    return positions[diff % positions.length] || { x: 960, y: 300 };
}

// ══════════════════════════════════════════════════════════════════════════════
// INTRO RENDER FUNKCE
// ══════════════════════════════════════════════════════════════════════════════

// Animuje kartu z introSprites skupiny (nečistí se při renderUI)
function _introAnimCard(fromX, fromY, toX, toY, tex, dur, onComplete, angle, scale) {
    const safeTex = gameScene.textures.exists(tex) ? tex : 'card_back';
    const targetAngle = angle || 0;
    // Karta vzlétá z balíčku (0°) a za letu se PLYNULE dotočí do orientace cíle (hráč
    // na boku = ±90°, protější = 180°) – ať „dosedne" ve správném natočení, ne skokem.
    const sp = gameScene.add.image(fromX, fromY, safeTex)
        .setScale(scale || 0.28).setAngle(0).setDepth(800).setAlpha(0.95);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);
    else if (gameScene.cardsSprites) gameScene.cardsSprites.add(sp);
    const d = dur || 380;
    gameScene.tweens.add({
        targets: sp, x: toX, y: toY, duration: d, ease: 'Power2',
        onComplete: () => {
            if (sp?.active) sp.destroy();
            if (onComplete) onComplete();
        }
    });
    if (targetAngle !== 0) {
        gameScene.tweens.add({ targets: sp, angle: targetAngle, duration: d, ease: 'Power2' });
    }
}

// Jako _introAnimCard, ale v půlce letu se karta překlopí rub→líc (backTex→faceTex):
// scaleX se stáhne na 0 (karta na hraně), vymění se textura, pak zpět na cílový scale.
// opts.startScale/endScale → karta se během letu plynule zvětší (reveal role/postav
// letící z balíčku). opts.delay → zpoždění startu. Použito pro „otoč si, co máš vidět".
function _introAnimCardFlip(fromX, fromY, toX, toY, backTex, faceTex, dur, onComplete, angle, scale, opts) {
    opts = opts || {};
    const startScale = opts.startScale ?? scale ?? 0.28;
    const endScale   = opts.endScale ?? scale ?? startScale;
    const delay = opts.delay || 0;
    const ang = angle || 0;
    const d   = dur || 380;
    const half = d / 2;
    const bTex = gameScene.textures.exists(backTex) ? backTex : 'card_back';
    const fTex = gameScene.textures.exists(faceTex) ? faceTex : bTex;
    const sp = gameScene.add.image(fromX, fromY, bTex)
        .setScale(startScale).setAngle(ang).setDepth(800).setAlpha(0.97);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);
    else if (gameScene.cardsSprites) gameScene.cardsSprites.add(sp);
    gameScene.tweens.add({
        targets: sp, x: toX, y: toY, duration: d, delay, ease: 'Power2',
        onComplete: () => { if (sp?.active) sp.destroy(); if (onComplete) onComplete(); }
    });
    // Růst (scaleY) plynule po celou dobu letu; scaleX řeší překlopení níž.
    if (endScale !== startScale) {
        gameScene.tweens.add({ targets: sp, scaleY: endScale, duration: d, delay, ease: 'Power2' });
    }
    gameScene.tweens.add({
        targets: sp, scaleX: 0, duration: half, delay, ease: 'Sine.easeIn',
        onComplete: () => {
            if (!sp?.active) return;
            sp.setTexture(fTex);
            gameScene.tweens.add({ targets: sp, scaleX: endScale, duration: half, ease: 'Sine.easeOut' });
        }
    });
    return sp;
}

// Reveal mojí role: velká karta uprostřed se překlopí rub→líc, teprve pak se ukáže
// statická karta s tlačítkem OK (renderIntroScene gate `roleRevealReady`). Pojistka
// proti dvojímu spuštění (roleFlipStarted) – volá se z doletu role i z await_role_ok.
function _startRoleRevealFlip() {
    const s = _introState;
    if (!s || s.roleFlipStarted || App.introRoleOkSent) return;
    s.roleFlipStarted = true;
    s.showRoleReveal = true;
    if (!s.myRole) { s.roleRevealReady = true; renderUI(); return; }
    s.roleRevealReady = false;
    renderUI(); // popisek „Podívej se na svou roli" + balíček rolí; ještě ne statická karta
    const roleTexMap = { 'Sheriff': 'role_000', 'Outlaw': 'role_001',
                         'Renegade': 'role_002', 'Deputy': 'role_003' };
    const tex = roleTexMap[s.myRole] || 'role_001';
    // Moje karta role letí PŘÍMO z balíčku doprostřed, během letu se překlopí rub→líc
    // a zvětší (žádná zvlášť malá karta na sedačku).
    _introAnimCardFlip(INTRO_ROLE_DECK.x, INTRO_ROLE_DECK.y, 960, 420, 'role_card_back', tex, 560, () => {
        if (_introState) { _introState.roleRevealReady = true; renderUI(); }
    }, 0, null, { startScale: 0.30, endScale: 0.80 });
}

// Reveal mých 2 nabídkových postav: obě karty se překlopí rub(lives)→líc, teprve pak
// jsou klikací (_renderIntroCharSelect gate `charChoicesRevealed`).
function _startCharChoicesFlip() {
    const s = _introState;
    if (!s || s.charFlipStarted) return;
    s.charFlipStarted = true;
    const choices = s.myCharChoices || [];
    if (choices.length < 2) { s.charChoicesRevealed = true; s.myCharShowUI = true; renderUI(); return; }
    const charData = gameScene.cache.json.get('characters_data');
    s.charChoicesRevealed = false;
    let done = 0;
    choices.forEach((charName, idx) => {
        const info = charData && charData.find(c => c.name === charName);
        const tex  = info && gameScene.textures.exists('char_' + info.id) ? 'char_' + info.id : 'placeholder';
        const cardX = idx === 0 ? 540 : 1380;
        // Moje karty postav letí PŘÍMO z balíčku na výběrové pozice, během letu se
        // překlopí lives→líc a zvětší. Obě naráz (bez odstupu) – jinak ta dřív
        // dosednutá zmizí dřív, než se odhalí výběr (klikací jsou až po obou).
        _introAnimCardFlip(INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y, cardX, 510, 'lives', tex, 560, () => {
            done++;
            if (done >= 2 && _introState) {
                _introState.charChoicesRevealed = true;
                _introState.myCharShowUI = true;
                renderUI();
            }
        }, 0, null, { startScale: 0.30, endScale: 0.72 });
    });
    renderUI(); // během letu běží normální scéna (balíček postav vidět), výběr až po doletu
}

// Odpočinková pozice rozdané karty – PŘESNĚ tam, kde karta bude v reálné hře
// (renderUI: moje ruka resp. ruce protihráčů), aby přechod do hry byl beze skoku.
// Vrací { x, y, angle, scale }. count = počet karet v ruce hráče.
function _introDealRestPos(idx, myIdx, total, i, count) {
    // Moje ruka – stejné rozložení jako herní render (livesX=1050, myBaseY=970)
    if (idx === myIdx) {
        const scaleMe = 0.36;
        const handAreaStart = 1050 + 160;     // 1210
        const handAreaWidth = 1860 - handAreaStart;
        const spacing = Math.min(117, handAreaWidth / count);
        return { x: handAreaStart + i * spacing, y: 970, angle: 0, scale: scaleMe };
    }
    // Protihráči – stejné rozložení jako herní render (drawHandCard)
    const scaleOpp = 0.27;
    const cardW = 325 * scaleOpp;   // 87.75
    const cardH = 500 * scaleOpp;   // 135
    const hand = getPlayerHandPos(idx);
    let side;
    if (hand.x < 50)        side = 'left';
    else if (hand.y < 50)   side = 'top';
    else if (hand.x > 1870) side = 'right';
    else                    side = 'bottom';
    const rawSpacing = count > 1 ? Math.min(cardW * 0.35, 36) : 0;
    if (side === 'left' || side === 'right') {
        const maxHandH = cardH * 3.5;
        const sp = count > 1 ? Math.min(rawSpacing, maxHandH / (count - 1)) : 0;
        const total = (count - 1) * sp;
        return { x: hand.x, y: hand.y - total / 2 + i * sp,
                 angle: side === 'left' ? 90 : -90, scale: scaleOpp };
    }
    if (side === 'top') {
        const maxHandW = cardH * 3.5;
        const sp = count > 1 ? Math.min(rawSpacing, maxHandW / (count - 1)) : 0;
        const total = (count - 1) * sp;
        return { x: hand.x - total / 2 + i * sp, y: hand.y, angle: 180, scale: scaleOpp };
    }
    return { x: hand.x, y: hand.y, angle: 0, scale: scaleOpp };
}

// Pozice karet mého hráče ve hře (pro plynulý přechod do hry)
const MY_ROLE_X = 850,  MY_ROLE_Y  = 970, MY_ROLE_SCALE = 0.36;
const MY_LIVES_X = 1050, MY_LIVES_Y = 970, MY_LIVES_SCALE = 0.36;
// charY = MY_LIVES_Y - bulletH * health, bulletH = 500*0.36*0.93/5 = 33.48

function _myCharY(health) {
    const bulletH = (500 * 0.36 * 0.93) / 5;
    return MY_LIVES_Y - bulletH * (health || 4);
}

function renderIntroScene() {
    if (!_introState || !gameScene) return;
    const s = _introState;
    const sub = s.sub;

    // Výběr postavy: zobraz když máme choices, hráč nevybral, a UI je ready
    if (s.myCharChoices && s.myCharChoices.length > 0 && !s.myCharSelected && s.myCharShowUI) {
        _renderIntroCharSelect();
        return;
    }

    // Pozadí – stejná velikost jako herní pozadí (create: setDisplaySize 1920×1080),
    // aby při přechodu z intra do hry pozadí neměnilo velikost.
    _iAdd(gameScene.add.image(960, 540, 'background').setDisplaySize(1920, 1080).setDepth(0));

    // Tři balíčky (bez popisků pod kartami). Balíček, který se PRÁVĚ míchá,
    // nekreslíme staticky – reprezentuje ho míchací animace. Jakmile animace
    // doběhne (shuffleAnimDone), statický balíček se hned ukáže (žádné prázdné
    // místo mezi koncem míchání a začátkem rozdávání).
    const shuffling = (which) => sub === which && !s.shuffleAnimDone;
    if (s.roleCount > 0 && !shuffling('shuffle_roles'))
        _drawIntroStack(INTRO_ROLE_DECK.x, INTRO_ROLE_DECK.y, 'role_card_back', s.roleCount, 0.30);
    if (s.charCount > 0 && !shuffling('shuffle_chars'))
        _drawIntroStack(INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y, 'lives', s.charCount, 0.30);
    if (s.deckCount > 0 && !shuffling('shuffle_deck') && !s.deckMoving)
        _drawIntroStack(INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y, 'card_back', s.deckCount, 0.30);

    // Umístěné karty (role, lives, char) + jmenovky - persistují přes všechny fáze
    if (s.placedCards) s.placedCards.forEach(_drawPlacedCard);

    // Popisek fáze
    const phaseLabels = {
        'init': 'Pripravujeme hru...',
        'shuffle_roles': 'Michani roli...',
        'deal_roles': 'Rozdavani roli...',
        'await_role_ok': 'Podivej se na svou roli!',
        'waiting_for_others_role': 'Cekame az si ostatni rozkliknou roli...',
        'shuffle_chars': 'Michani karet postav...',
        'deal_chars': 'Rozdavani postav...',
        'chars_slide_in': '',
        'shuffle_deck': 'Michani hraciho balicku...',
        'deal_cards': 'Rozdavani karet...',
    };
    // Pokud už mám roli odkrytou (čeká se na OK), ukaž odpovídající popisek
    // bez ohledu na to, v jaké přesné fázi rozdávání zrovna server je.
    const showReveal = (s.showRoleReveal || sub === 'await_role_ok') && s.myRole && !App.introRoleOkSent;
    const lbl = showReveal ? 'Podivej se na svou roli!' : phaseLabels[sub];
    if (lbl) {
        _iAdd(gameScene.add.text(960, 80, lbl,
            { fontSize: '38px', color: '#ffcc00',
              backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 20, y: 10 } })
            .setOrigin(0.5).setDepth(50));
    }

    // Karta role + OK (jen dokud hráč neklikl). Statickou kartu ukážeme AŽ po dokončení
    // překlápěcího revealu (roleRevealReady) – během flipu běží sprite v introSprites.
    if (showReveal && s.roleRevealReady) {
        _renderRoleReveal(s.myRole);
    }

    _introLeaderEndButton();
}

// ── Role reveal ───────────────────────────────────────────────────────────────
// Volá se jen ve fázi await_role_ok (než hráč klikne OK). Po kliknutí velkou
// kartu už nevykreslujeme - na herní pozici zůstane jen malá karta z placedCards.
function _renderRoleReveal(roleStr) {
    const roleTexMap  = { 'Sheriff': 'role_000', 'Outlaw': 'role_001',
                          'Renegade': 'role_002', 'Deputy': 'role_003' };
    const tex = roleTexMap[roleStr] || 'role_001';

    // Velká karta role uprostřed (bez názvu). Depth nad VŠÍM - balíčky jdou
    // až ~depth 90, letící rozdávané karty depth 800. Reveal musí být úplně nahoře.
    _iAdd(gameScene.add.image(960, 420, tex).setScale(0.80).setDepth(1000));

    const okBtn = gameScene.add.text(960, 790, 'OK',
        { fontFamily: THEME.fontUI, fontSize: '32px', fontStyle: 'bold', color: '#ffffff',
          backgroundColor: '#2f5f2f', padding: { x: 34, y: 14 } })
        .setOrigin(0.5).setDepth(1001).setInteractive({ useHandCursor: true });
    okBtn.on('pointerover', () => okBtn.setBackgroundColor('#3f7f3f'));
    okBtn.on('pointerout',  () => okBtn.setBackgroundColor('#2f5f2f'));
    okBtn.on('pointerup', () => {
        if (App.introRoleOkSent) return;
        App.introRoleOkSent = true;
        socket.emit('intro_role_ok');
        if (_introState) _introState.sub = 'waiting_for_others_role';

        // Snap karta role letí na svou in-game pozici (zůstává nad vším během letu)
        const snap = gameScene.add.image(960, 420, tex).setScale(0.80).setDepth(1000);
        if (gameScene.introSprites) gameScene.introSprites.add(snap);
        gameScene.tweens.add({
            targets: snap,
            x: MY_ROLE_X, y: MY_ROLE_Y,
            scaleX: MY_ROLE_SCALE, scaleY: MY_ROLE_SCALE,
            duration: 550, ease: 'Power2.easeIn',
            onComplete: () => {
                if (snap?.active) snap.destroy();
                // Přidej do placedCards - bude vidět po celý zbytek intra
                if (_introState) {
                    _introState.placedCards.push(
                        { tex, x: MY_ROLE_X, y: MY_ROLE_Y, scale: MY_ROLE_SCALE, depth: 22 }
                    );
                }
                renderUI();
            }
        });
        renderUI();
    });
    _iAdd(okBtn);
}

// ── Výběr postavy ─────────────────────────────────────────────────────────────
function _renderIntroCharSelect() {
    const s = _introState;
    const charData = gameScene.cache.json.get('characters_data');

    // Pozadí – stejná velikost jako herní pozadí (1920×1080)
    _iAdd(gameScene.add.image(960, 540, 'background').setDisplaySize(1920, 1080).setDepth(0));

    // Balíček hracích karet za UI (role deck je pryč, char deck taky)
    if (s.deckCount > 0)
        _drawIntroStack(INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y, 'card_back', s.deckCount, 0.30, '');

    // Umístěné karty (role atd.) + jmenovky
    if (s.placedCards) s.placedCards.forEach(_drawPlacedCard);

    // Titulek
    _iAdd(gameScene.add.text(960, 75, 'Vyber si postavu',
        { fontSize: '48px', color: '#ffcc00',
          backgroundColor: 'rgba(0,0,0,0.75)', padding: { x: 18, y: 10 } })
        .setOrigin(0.5).setDepth(60));

    // Klikací karty postav ukážeme AŽ po dokončení překlápěcího revealu
    // (charChoicesRevealed) – během flipu běží sprite v introSprites. Výběr je
    // dvoukrokový: 1. klik na postavu ji jen PŘEDVYBERE (zvětší jako při najetí) a
    // odemkne tlačítko Potvrdit; teprve potvrzení spustí animaci usazení postavy.
    const choices = s.charChoicesRevealed ? (s.myCharChoices || []) : [];
    choices.forEach((charName, idx) => {
        const charInfo = charData && charData.find(c => c.name === charName);
        const texKey   = charInfo && gameScene.textures.exists('char_' + charInfo.id)
            ? 'char_' + charInfo.id : 'placeholder';
        const cardX    = idx === 0 ? 540 : 1380;
        const isPre    = s.myCharPreselect === charName;

        const cs = gameScene.add.image(cardX, 510, texKey)
            .setScale(isPre ? 0.80 : 0.72).setDepth(61).setInteractive({ useHandCursor: true });
        if (isPre) cs.setTint(0xddffdd);
        cs.on('pointerover', () => { cs.setScale(0.80); cs.setTint(0xddffdd); });
        cs.on('pointerout',  () => { if (s.myCharPreselect !== charName) { cs.setScale(0.72); cs.clearTint(); } });
        cs.on('pointerdown', () => {
            if (s.myCharSelected) return;
            s.myCharPreselect = charName;   // jen předvýběr – potvrzuje se tlačítkem
            renderUI();
        });
        _iAdd(cs);
    });

    // Tlačítko Potvrdit – neaktivní (zašedlé), dokud hráč na nějakou postavu neklikne.
    if (choices.length) {
        const active = !!s.myCharPreselect && !s.myCharSelected;
        const btn = gameScene.add.text(960, 900, 'Potvrdit',
            { fontFamily: THEME.fontUI, fontSize: '32px', fontStyle: 'bold', color: active ? '#ffffff' : '#888',
              backgroundColor: active ? '#2f5f2f' : '#2a2431', padding: { x: 34, y: 14 } })
            .setOrigin(0.5).setDepth(70);
        if (active) {
            btn.setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => btn.setBackgroundColor('#3f7f3f'));
            btn.on('pointerout',  () => btn.setBackgroundColor('#2f5f2f'));
            btn.on('pointerup', () => _confirmCharSelect(s.myCharPreselect));
        }
        _iAdd(btn);
    }

    _introLeaderEndButton();
}

// Potvrzení výběru postavy: spustí usazovací animaci (vybraná postava se zmenší z
// předvybrané velké karty na herní pozici, odmítnutá se překlopí na lives). Volá se
// z tlačítka Potvrdit (viz _renderIntroCharSelect).
function _confirmCharSelect(charName) {
    const s = _introState;
    if (!s || s.myCharSelected) return;
    const charData = gameScene.cache.json.get('characters_data');
    const choices = s.myCharChoices || [];
    const idx = choices.indexOf(charName);
    if (idx === -1) return;

    s.myCharSelected = charName;
    socket.emit('select_character', charName);

    const cardX = idx === 0 ? 540 : 1380;

    // Údaje o odmítnuté kartě
    const otherIdx  = idx === 0 ? 1 : 0;
    const otherName = choices[otherIdx];
    const otherInfo = charData && charData.find(c => c.name === otherName);
    const otherTex  = otherInfo && gameScene.textures.exists('char_' + otherInfo.id)
        ? 'char_' + otherInfo.id : 'placeholder';
    const otherX = otherIdx === 0 ? 540 : 1380;

    // Údaje o vybrané kartě
    const chosenInfo = charData && charData.find(c => c.name === charName);
    const chosenTex  = chosenInfo && gameScene.textures.exists('char_' + chosenInfo.id)
        ? 'char_' + chosenInfo.id : 'placeholder';
    // Životy NEbereme ze state (tam je v době výběru pořád default 4) – server
    // je dopočítá až po výběru. Spočítáme cíl sami z vybrané postavy + role přes
    // sdílené pravidlo (baseHealthForCharacter zná i 3životé DC postavy); Sheriff +1.
    const baseHealth = baseHealthForCharacter(charName);
    const health = (_introState?.myRole === 'Sheriff') ? baseHealth + 1 : baseHealth;
    const charY  = _myCharY(health);

    // DŮLEŽITÉ: obě náhradní karty vytvoříme HNED a do introSprites (renderUI
    // je nečistí). Jinak by vybraná karta po renderUI zmizela a "naskočila"
    // až po doletu lives → nesmyslné blikání. Vybraná startuje z PŘEDVYBRANÉ
    // velké velikosti (0.80) a viditelně se zmenší na herní pozici.
    const rejected = gameScene.add.image(otherX, 510, otherTex)
        .setScale(0.72).setDepth(65);
    const chosen   = gameScene.add.image(cardX, 510, chosenTex)
        .setScale(0.80).setDepth(66);
    if (gameScene.introSprites) {
        gameScene.introSprites.add(rejected);
        gameScene.introSprites.add(chosen);
    }

    renderUI(); // schovej char select overlay; introSprites zůstanou

    // Odmítnutá karta: flip → stane se lives → letí na lives pozici (~770ms)
    gameScene.tweens.add({
        targets: rejected, scaleX: 0, duration: 160, ease: 'Power2',
        onComplete: () => {
            rejected.setTexture('lives');
            gameScene.tweens.add({
                targets: rejected, scaleX: 0.72, duration: 160, ease: 'Power2',
                onComplete: () => {
                    gameScene.tweens.add({
                        targets: rejected,
                        x: MY_LIVES_X, y: MY_LIVES_Y,
                        scaleX: MY_LIVES_SCALE, scaleY: MY_LIVES_SCALE,
                        duration: 450, ease: 'Power2.easeIn',
                        onComplete: () => {
                            if (rejected?.active) rejected.destroy();
                            if (_introState) {
                                _introState.placedCards.push(
                                    { tex: 'lives', x: MY_LIVES_X, y: MY_LIVES_Y,
                                      scale: MY_LIVES_SCALE, depth: 21 }
                                );
                            }
                            // Hned překresli, aby lives placedCard naskočila
                            // bez mezery (chosen letí dál - je v introSprites)
                            renderUI();
                        }
                    });
                }
            });
        }
    });

    // Vybraná karta: chvíli počká na místě (odmítnutá se mezitím mění v lives),
    // pak se zmenší z velké karty a letí nad lives kartu. Dolet (~930ms) je až po
    // doletu lives (~770ms), takže se postava viditelně usadí NAD lives kartou.
    gameScene.tweens.add({
        targets: chosen,
        x: MY_LIVES_X, y: charY,
        scaleX: MY_LIVES_SCALE, scaleY: MY_LIVES_SCALE,
        delay: 450, duration: 480, ease: 'Power2.easeIn',
        onComplete: () => {
            if (chosen?.active) chosen.destroy();
            if (_introState) {
                _introState.placedCards.push(
                    { tex: chosenTex, x: MY_LIVES_X, y: charY,
                      scale: MY_LIVES_SCALE, depth: 23 }
                );
                _introState.charAnimDone = true;
            }
            renderUI();
        }
    });
}
