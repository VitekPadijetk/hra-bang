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
    App.introDoneToken++;   // zruš odložený úklid spritů po 'done' (net/handlers.js)
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
    const { bg } = themeButton(gameScene, stageLeft() + 30, stageTop() + 30, 210, 48, '✕  Ukončit hru', {
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
// Balíček událostí High Noon se v intru míchá napravo od hracího balíčku (volné místo,
// nekříží se s ním) a na konci intra sjede na svou herní pozici (HN_PILE_X). Rozteč je
// stejná jako mezi ostatními třemi balíčky – že je jeho herní pozice blíž se dorovná
// tím, že jeho závěrečný přesun je kratší (net/handlers.js deal_cards_to).
const INTRO_HN_DECK    = { x: INTRO_PLAY_DECK.x + 160, y: 540 };
// Odložené Pravé poledne (lícem nahoru). Leží kousek nad balíčkem – šerif ho z něj jen
// „přendá vedle", takže nikam neodlétá přes půl stolu a je v jedné velikosti s balíčky.
const INTRO_HN_ASIDE   = { x: INTRO_HN_DECK.x, y: 350 };
// Balíček událostí A Fistful of Cards má v intru pátý slot, na druhé straně od rolí
// (rozteč stejná jako mezi ostatními). Na herní pozici sjede až na konci intra.
const INTRO_FF_DECK    = { x: INTRO_ROLE_DECK.x - 160, y: 540 };
const INTRO_FF_ASIDE   = { x: INTRO_FF_DECK.x, y: 350 };
// Balíček událostí Divokého západu má šestý slot, o krok dál doleva (rozteč stejná).
const INTRO_WWS_DECK   = { x: INTRO_FF_DECK.x - 160, y: 540 };
const INTRO_WWS_ASIDE  = { x: INTRO_WWS_DECK.x, y: 350 };

// Popis balíčku událostí pro intro. Beaty všech tří rozšíření jsou identické – liší se
// jen místem na stole, texturami a kartou, kterou šerif odkládá vespod.
const INTRO_EVENT_CFG = {
    ff:  { deck: INTRO_FF_DECK, aside: INTRO_FF_ASIDE, back: 'ff_back', pre: 'ff_',
           json: 'cards_fistful_data', lastKey: 'FISTFUL_OF_CARDS', shuffleSub: 'shuffle_fistful' },
    wws: { deck: INTRO_WWS_DECK, aside: INTRO_WWS_ASIDE, back: 'wws_back', pre: 'wws_',
           json: 'cards_divoky_zapad_data', lastKey: 'DIVOKY_ZAPAD', shuffleSub: 'shuffle_wws' },
    hn:  { deck: INTRO_HN_DECK, aside: INTRO_HN_ASIDE, back: 'hn_back', pre: 'hn_',
           json: 'cards_high_noon_data', lastKey: 'PRAVE_POLEDNE', shuffleSub: 'shuffle_highnoon' },
};
function introEventCfg(which) {
    return INTRO_EVENT_CFG[which] || INTRO_EVENT_CFG.hn;
}
// Odstup mezi první a druhou kartou postavy jednoho hráče (net/handlers.js
// char_cards_fly u soupeřů, _startCharChoicesFlip u mě) – jeden rytmus pro všechny.
const INTRO_CHAR_DEAL_GAP = 200;

// Vykreslí balíček n karet naskládaných (každá o 0.25px níž)
function _drawIntroStack(x, y, tex, n, scale, label) {
    // Stejny styl jako herny balicek: pouze svisly offset (tenci hromadka), zadny x offset.
    // Vrch se počítá ze SKUTEČNÉHO počtu (jako drawDrawPiles), jen vrstev se kreslí
    // nejvýš 80 – jinak by balíček s rozšířeními po přechodu do hry poskočil.
    const safeTex = gameScene.textures.exists(tex) ? tex : 'card_back';
    const pxPerCard = INTRO_PILE_PX;
    const layers = shuffleLayers(n); // stejne jako herny balicek
    const topY = _introStackTopY(y, n);
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
// Jednotná animace pro VŠECHNY balíčky intra (role, postavy, hrací karty, High Noon).
// Balíček, který na stole leží, se rozdělí, prostřídá a znovu složí – nic se nikam
// nezvětšuje, nezjevuje ani nepřevrací. Časování je sdílené se serverem
// (core/shuffleAnim.js), aby se rozdávání nerozjelo dřív, než míchání doběhne.
//
// Fáze (viz core/shuffleAnim.js):
//   preMs    hromádka leží přesně tak, jak ji kreslí statický balíček
//   cutMs    HORNÍ polovina se jako celek oddělí doprava, spodní doleva
//   gapMs    pauza s rozděleným balíčkem
//   riffle   karty střídavě zleva/zprava padají doprostřed; hromádka se skládá
//            ODSPODU NAHORU, takže poslední karta dosedne úplně navrch
//   tailMs   doznění; hotová hromádka je pixelově tam, kde ji kreslí statický balíček
//
// N        = skutečný počet karet balíčku (kreslí se jich nejvýš SHUFFLE_ANIM.maxLayers,
//            stejně jako u statické hromádky – takže se po výměně nic neposune)
// tiltDeck = true → obě poloviny se při oddělení lehce nakloní

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

// Tloušťka jedné vrstvy hromádky – MUSÍ sedět s _drawIntroStack i s herními balíčky
// (view/board.js PILE_PX_PER_CARD), jinak by se hotová hromádka po výměně posunula.
const INTRO_PILE_PX = 0.25;

// Vrch hromádky n karet se středem v y (shodné s _drawIntroStack i drawDrawPiles).
function _introStackTopY(y, n) {
    return y - (Math.max(1, n) - 1) * INTRO_PILE_PX / 2;
}

function _animateIntroShuffle(cx, cy, tex, scale, N, tiltDeck, onComplete, onSettled) {
    if (!gameScene || !gameScene.introSprites) {
        if (onSettled) onSettled();
        if (onComplete) onComplete();
        return;
    }

    // Vyčisti předchozí intro animaci
    _clearIntroSprites();

    const safeTex = gameScene.textures.exists(tex) ? tex : 'card_back';
    const layers  = shuffleLayers(N);
    const perCard = shufflePerCard(N);
    const settle  = shuffleSettleMs(N);
    const totalMs = shuffleDurationMs(N);
    const topY    = _introStackTopY(cy, N);
    const cardW   = 325 * scale;
    const cutX    = cardW * 0.6;          // půlky se rozestoupí, ale zůstanou u sebe
    const tilt    = tiltDeck ? 0.10 : 0;
    const D0      = 200;                  // nad statickými balíčky (10..89), pod revealem

    // Balíček tak, jak právě leží: index 0 = vrchní karta, layers−1 = spodní.
    // Kreslí se odspodu nahoru, takže pořadí v display-listu odpovídá depth.
    const sprites = new Array(layers);
    for (let i = layers - 1; i >= 0; i--) {
        const sp = gameScene.add.image(cx, topY + i * INTRO_PILE_PX, safeTex)
            .setScale(scale).setDepth(D0 + (layers - 1 - i));
        gameScene.introSprites.add(sp);
        sprites[i] = sp;
    }

    if (layers < 2) {
        // Jedna karta se míchat nedá – jen ji nech ležet a předej ji statickému balíčku.
        gameScene.time.delayedCall(settle, () => {
            if (onSettled) onSettled();
            sprites.forEach(sp => { if (sp?.active) sp.destroy(); });
        });
        gameScene.time.delayedCall(totalMs, () => { if (onComplete) onComplete(); });
        return;
    }

    // Fáze 1: horní polovina (indexy 0..half−1) se JAKO CELEK oddělí doprava,
    // spodní zůstane vlevo. Každá půlka se přitom vystředí na cy, aby ležela rovně.
    const half      = shuffleCutHalf(layers);
    const topCenter = topY + (half - 1) * INTRO_PILE_PX / 2;
    const botCenter = topY + (half + layers - 1) * INTRO_PILE_PX / 2;
    gameScene.time.delayedCall(SHUFFLE_ANIM.preMs, () => {
        sprites.forEach((sp, i) => {
            if (!sp.active) return;
            const isTop = i < half;
            gameScene.tweens.add({
                targets:  sp,
                x:        cx + (isTop ? cutX : -cutX),
                y:        sp.y + (isTop ? cy - topCenter : cy - botCenter),
                rotation: isTop ? tilt : -tilt,
                duration: SHUFFLE_ANIM.cutMs,
                ease:     'Cubic.easeInOut',
            });
        });
    });

    // Fáze 2: riffle. Z obou půlek se bere ODSPODU a střídavě – první spadlá karta
    // je spodkem nové hromádky, poslední jejím vrchem.
    const order = shuffleRiffleOrder(layers);

    const riffleStart = SHUFFLE_ANIM.preMs + SHUFFLE_ANIM.cutMs + SHUFFLE_ANIM.gapMs;
    order.forEach((i, j) => {
        const sp   = sprites[i];
        const slot = layers - 1 - j;      // 0 = vrch hotové hromádky
        gameScene.time.delayedCall(riffleStart + j * perCard, () => {
            if (!sp.active) return;
            // Za letu nad vším, po dosednutí na své místo ve vrstvách hromádky –
            // jinak by karta dosedla POD tu, která ještě letí, a hromádka by problikla.
            sp.setDepth(D0 + layers + j);
            gameScene.tweens.add({
                targets: sp, x: cx, y: topY + slot * INTRO_PILE_PX, rotation: 0,
                duration: SHUFFLE_ANIM.cardMs, ease: 'Cubic.easeIn',
                onComplete: () => { if (sp.active) sp.setDepth(D0 + j); },
            });
        });
    });

    // Hotová hromádka leží přesně tam, kde ji kreslí statický balíček – nejdřív ho
    // nech vykreslit (onSettled → renderUI) a teprve pak ukliď animační sprity,
    // ať mezi tím není ani snímek prázdno.
    gameScene.time.delayedCall(settle, () => {
        if (onSettled) onSettled();
        sprites.forEach(sp => { if (sp?.active) sp.destroy(); });
    });

    gameScene.time.delayedCall(totalMs, () => {
        if (onComplete) onComplete();
    });
}


// Přesné pozice bloku „životy + postava + jmenovka (+ hvězda)" soupeře na herní
// desce. Math je 1:1 s herním renderem (view/board.js drawOpponents); sdílí ho
// slide-in postav (net/handlers.js) i úvod navazující hry, kde přeživší mají svou
// postavu na stole už od začátku. `health` posouvá kartu postavy po ose nábojů,
// numBlue=0 (na začátku hry nemá nikdo karty na stole). `dx/dy` = vektor „ze zákulisí"
// pro slide-in.
function _introOppSlots(idx, health) {
    const L = currentLayout();
    const total = (state && state.players) ? state.players.length : 0;
    const view = myIndex === null ? 0 : myIndex;
    // Kotva rovnou od rendereru (dřív se dopočítávala zpětně z pozice ruky). Kompaktní
    // řada soupeřů (mobil) se z pozice ruky odvodit nedá – tam je „strana" jen jedna.
    const anchor = total ? getOpponentAnchors(total)[((idx - view + total) % total) - 1] : null;
    const oppScl     = oppScale(L, Math.max(1, total - 1));
    const oppCardH   = 500 * oppScl;            // 135
    const oppBulletH = oppCardH * 0.93 / 5;     // 25.11
    const oppOffset  = oppCardH * L.oppHandOff; // 148.5 (ruka od anchor)

    let ax, ay, side;
    if (anchor) { ax = anchor.x; ay = anchor.y; side = anchor.side; }
    else {
        // Bez kotvy (spodní hráč / ještě není stav) – zpětně z pozice ruky jako dřív.
        const hand = getPlayerHandPos(idx);
        if (hand.x < stageLeft() + 50)       { ax = hand.x + oppOffset; ay = hand.y; side = 'left'; }
        else if (hand.y < stageTop() + 50)   { ax = hand.x; ay = hand.y + oppOffset; side = 'top'; }
        else if (hand.x > stageRight() - 50) { ax = hand.x - oppOffset; ay = hand.y; side = 'right'; }
        else                                 { ax = hand.x; ay = hand.y - oppOffset; side = 'bottom'; }
    }

    // Natočení karet podle strany (stejně jako herní render); kompaktní sloupec má
    // kartu životů otočenou jako soupeř vlevo.
    const angle = (side === 'left' || side === 'compact') ? 90 : side === 'top' ? 180 : side === 'right' ? -90 : 0;
    const cm = side === 'compact' ? compactMetrics(Math.max(1, total - 1), L) : null;

    // Dráha životů (core/layout.js): nad 5 životů leží v ose pohybu portrétu DRUHÁ
    // karta a dvojice tvoří jednu dráhu o 10 slotech. Kompaktní sloupec (mobil) je
    // široký jednu kartu → zůstává jednokartový a portrét se zastaví na 5. slotu.
    // Řídí se ZOBRAZENÝMI životy, ne maxHealth: druhá karta se vykládá až od 6 (bug 56)
    // a v intru navazující hry maxHealth ve stavu stejně ještě není – přeživší ho
    // dostane až s potvrzením postavy, takže by karta chyběla i tam, kde patří (bug 65).
    const track = livesTrack(Math.max(1, Number(health) || 0), oppScl, side === 'compact' ? 1 : 2);
    const hpSlot = livesSlot(track, health);

    // Jmenovka soupeře – PŘESNĚ na herní pozici (drawOpponents): x = anchor.x,
    // y = anchor.y + offset dle strany. Offset se MUSÍ počítat z rozměru karty, ne
    // z konstant pro měřítko 0,27: při 8 hráčích je měřítko 0,25 (oppScaleByCount) a
    // jmenovka se s přechodem do hry posunula o 5 px.
    const cardW  = 325 * oppScl;                // 97.5
    const gap    = L.oppGap;
    // numBlue = kolik karet leží ve vyloženém pásu (drawOpponents numBluePrimary):
    // na začátku hry nemá nikdo nic, JEN ve hře pro 3 leží u každého karta role lícem
    // nahoru – ta slot zabírá, takže se skupina „životy + postava" středí jinak.
    // Bez toho karty postav v intru pro 3 dosedly na kartu role.
    const numBlue = (state && state.mode3p) ? 1 : 0;
    const groupH  = (1 + numBlue) * cardW + numBlue * gap;
    const nameOffY = side === 'left'
        // livesCY + cardW/2 + 18 (viz drawOpponents)
        ? groupH / 2 - oppCardH / 2 + cardW / 2 + 18
        : side === 'right'
        // groupBottom + 18 = livesCY + numBlue*(cardW+gap) + cardW/2 + 18
        ? -groupH / 2 + oppCardH / 2 + numBlue * (cardW + gap) + cardW / 2 + 18
        : oppCardH / 2 + 18;
    const NAME_X = cm ? compactColCenter(anchor, cm) : ax;
    const NAME_Y = cm ? compactNameY(anchor, cm) : ay + nameOffY;
    const OPP_NAME_STYLE = { fontSize: '18px', color: '#cccccc',
        backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 6, y: 3 } };

    // Cílové pozice lives + postavy – PŘESNĚ podle herního renderu
    // (renderUI: anchor.side větve). (ax,ay) == herní anchor.
    let livesEndX, livesEndY, charEndX, charEndY;
    if (side === 'compact') {
        // Kotva JE střed karty životů, portrét jede po nábojích doprava (jako 'left').
        livesEndX = ax; livesEndY = ay;
        charEndX  = ax + oppBulletH * hpSlot; charEndY = ay;
    } else if (side === 'left') {
        livesEndX = ax;
        livesEndY = ay + groupH / 2 - oppCardH / 2;
        charEndX  = livesEndX + oppBulletH * hpSlot;
        charEndY  = livesEndY;
    } else if (side === 'top') {
        livesEndX = ax - groupH / 2 + cardW / 2; // groupStartX + cardW/2 (groupW === groupH)
        livesEndY = ay;
        charEndX  = livesEndX;
        charEndY  = livesEndY + oppBulletH * hpSlot;
    } else if (side === 'right') {
        livesEndX = ax;
        livesEndY = ay - groupH / 2 + oppCardH / 2;
        charEndX  = livesEndX - oppBulletH * hpSlot;
        charEndY  = livesEndY;
    } else {
        livesEndX = ax; livesEndY = ay;
        charEndX  = ax; charEndY  = ay;
    }

    // Druhá karta dráhy životů leží o 5 nábojů dál v ose pohybu portrétu (null = dráha
    // je jednokartová, tedy i celý dnešní stav pro postavy do 5 životů).
    const off = track.cards > 1 ? track.cardOff : 0;
    let lives2X = null, lives2Y = null;
    if (off) {
        if (side === 'left')       { lives2X = livesEndX + off; lives2Y = livesEndY; }
        else if (side === 'top')   { lives2X = livesEndX;       lives2Y = livesEndY + off; }
        else if (side === 'right') { lives2X = livesEndX - off; lives2Y = livesEndY; }
        else                       { lives2X = livesEndX;       lives2Y = livesEndY - off; }
    }

    // Start mimo obrazovku - obe karty se posunou o stejny vektor. Okraj se bere
    // z jeviště, ne z 1920×1080: při širším poměru stran jsou pruhy po stranách taky
    // vidět a karta by v nich čekala na svůj let.
    let dx = 0, dy = 0;
    if (side === 'left')   dx = stageLeft() - (oppCardH + 50) - ax;
    else if (side === 'top' || side === 'compact') dy = stageTop() - (oppCardH + 50) - ay;
    else if (side === 'right')  dx = stageRight() - ax + oppCardH + 50;
    else                       dy = stageBottom() - ay + oppCardH + 50;

    // Šerifova hvězda se usadí nad kartou postavy – offsety dle strany zrcadlí board.js.
    const starScale = 0.3;
    let starDx = 0, starDy = 0;
    if (side === 'left' || side === 'compact') { starDx =  oppCardH * 0.45; starDy = -cardW * 0.42; }
    else if (side === 'top')   { starDx =  cardW * 0.42;    starDy =  oppCardH * 0.45; }
    else if (side === 'right') { starDx = -oppCardH * 0.45; starDy =  cardW * 0.42; }

    return {
        side, angle, scale: oppScl, cardW, cardH: oppCardH, bulletH: oppBulletH,
        livesX: livesEndX, livesY: livesEndY, charX: charEndX, charY: charEndY,
        track, lives2X, lives2Y,
        nameX: NAME_X, nameY: NAME_Y, nameStyle: OPP_NAME_STYLE,
        starX: charEndX + starDx, starY: charEndY + starDy, starScale,
        dx, dy,
    };
}

// Hra pro 3 (Město duchů): role leží lícem nahoru, takže cizí karta role neletí na
// sedačku rubem – za letu se překlopí a ZŮSTANE ležet na stole svého hráče, přesně na
// slotu, kam ji pak kreslí deska (getDeadRoleCardPos = display slot 0, viz `_roleSlot`
// v drawOpponents). Drží ji `placedCards`, takže ji přežije i přechod do fáze postav
// (_clearIntroSprites maže sprity, ne umístěné karty). Textury rolí = RoleImages (game.js).
function _introPlacePublicRole(idx, role) {
    if (!gameScene || !_introState || !role) return;
    if (_introFindPlaced('role:' + idx)) return;   // pojistka proti dvojímu rozdání
    const tex = RoleImages[role] || 'role_001';
    const sl = _introOppSlots(idx, 4);             // jen kvůli straně/úhlu a měřítku
    const pos = getDeadRoleCardPos(idx);
    _introAnimCardFlip(INTRO_ROLE_DECK.x, INTRO_ROLE_DECK.y, pos.x, pos.y,
        'role_card_back', tex, 520, () => {
            if (!_introState) return;
            _introState.placedCards.push({
                tex, x: pos.x, y: pos.y, scale: sl.scale, angle: sl.angle,
                depth: 20, key: 'role:' + idx, rl: { kind: 'oppRole', idx },
            });
            renderUI();
        }, sl.angle, null, { startScale: 0.30, endScale: sl.scale });
}

// Bod ZA okrajem jeviště ve směru od středu k dané sedačce – kam má karta odletět,
// aby její dolet nebyl vidět. Počítá se z jeviště, ne z pevných 1920×1080: na širším
// poměru stran jsou pruhy po stranách taky vidět a karta by v nich zůstala ležet.
function _introOffscreenTarget(x, y, margin) {
    const cxs = (stageLeft() + stageRight()) / 2;
    const cys = (stageTop() + stageBottom()) / 2;
    const m = margin ?? 260;
    let vx = x - cxs, vy = y - cys;
    if (!vx && !vy) vy = 1;
    const tX = vx !== 0 ? ((vx > 0 ? stageRight() + m : stageLeft() - m) - cxs) / vx : Infinity;
    const tY = vy !== 0 ? ((vy > 0 ? stageBottom() + m : stageTop() - m) - cys) / vy : Infinity;
    const t = Math.min(tX, tY);
    return { x: cxs + vx * t, y: cys + vy * t };
}

// Pod jakým úhlem leží karty daného soupeře (vlevo 90°, nahoře 180°, vpravo −90°).
// Zrcadlí _renderSideAngle v net/handlers.js; bez stavu (na začátku rozdávání rolí
// ještě nemusí být) vrací 0.
function _introSeatAngle(idx, myIdx) {
    if (!state || !state.players || !state.players.length) return 0;
    const total = state.players.length;
    const view = (myIdx === null || myIdx === undefined) ? 0 : myIdx;
    const side = getOpponentAnchors(total)[((idx - view + total) % total) - 1]?.side;
    return side === 'left' ? 90 : side === 'right' ? -90
         : (side === 'top' || side === 'compact') ? 180 : 0;
}

// Cizí karta role: z balíčku k sedačce hráče (cestou se natočí do jeho orientace)
// a rovnou dál ZA okraj jeviště – roli si bere do ruky, nikdo ji nesmí vidět ležet.
// Dřív karta bez otočení dosedla na sedačku a tam se rozplynula.
function _introDealRoleAway(idx, myIdx, total) {
    if (!gameScene) return;
    const seat = _getIntroPlayerPos(idx, myIdx, total);
    const away = _introOffscreenTarget(seat.x, seat.y);
    const angle = _introSeatAngle(idx, myIdx);
    const tex = gameScene.textures.exists('role_card_back') ? 'role_card_back' : 'card_back';
    const sp = gameScene.add.image(INTRO_ROLE_DECK.x, INTRO_ROLE_DECK.y, tex)
        .setScale(0.30).setAngle(0).setDepth(800).setAlpha(0.97);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);
    else if (gameScene.cardsSprites) gameScene.cardsSprites.add(sp);
    if (angle !== 0) gameScene.tweens.add({ targets: sp, angle, duration: 380, ease: 'Power2' });
    gameScene.tweens.add({
        targets: sp, x: seat.x, y: seat.y, duration: 380, ease: 'Power2.easeOut',
        onComplete: () => {
            if (!sp.active) return;
            gameScene.tweens.add({
                targets: sp, x: away.x, y: away.y, delay: 110, duration: 460, ease: 'Power2.easeIn',
                onComplete: () => { if (sp.active) sp.destroy(); }
            });
        }
    });
}

// Nerozdaný zbytek balíčku postav odletí ze stolu JAKO CELEK (ne fade na místě).
// Speciální případ: 8 hráčů bez rozšíření – 16 postav, 8×2 rozdáno, balíček došel
// a neodlétá nic.
function _introFlyAwayCharDeck() {
    const s = _introState;
    if (!s) return;
    const n = s.charCount || 0;
    s.charCount = 0;
    if (n <= 0 || !gameScene) { renderUI(); return; }
    const layers = shuffleLayers(n);
    const topY = _introStackTopY(INTRO_CHAR_DECK.y, n);
    const movers = [];
    for (let k = layers - 1; k >= 0; k--) {
        const sp = gameScene.add.image(INTRO_CHAR_DECK.x, topY + k * INTRO_PILE_PX, 'lives')
            .setScale(0.30).setDepth(120 + (layers - 1 - k));
        if (gameScene.introSprites) gameScene.introSprites.add(sp);
        movers.push(sp);
    }
    renderUI();   // statický balíček zmizel, zastupuje ho pohyblivý
    // Celá hromádka se posune o stejný vektor (drží si tloušťku), takže cíl počítáme
    // každé vrstvě zvlášť z jejího vlastního místa.
    const away = _introOffscreenTarget(INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y - 400, 300);
    const dx = away.x - INTRO_CHAR_DECK.x, dy = away.y - INTRO_CHAR_DECK.y;
    movers.forEach(sp => {
        gameScene.tweens.add({
            targets: sp, x: sp.x + dx, y: sp.y + dy,
            duration: 720, ease: 'Back.easeIn',
            onComplete: () => { if (sp?.active) sp.destroy(); }
        });
    });
}

function _getIntroPlayerPos(targetPlayerIdx, myIdx, total) {
    if (myIdx === null || myIdx === undefined) return { x: 960, y: 540 };
    if (targetPlayerIdx === myIdx) return { x: 960, y: 900 };
    if (state && state.players) return getPlayerHandPos(targetPlayerIdx);
    const others = total - 1;
    const diff = (targetPlayerIdx - myIdx + total) % total - 1;
    // Záložní sedačky, dokud nedorazí stav (pak se bere getPlayerHandPos). Musí jich být
    // aspoň tolik jako soupeřů – při 8 hráčích je jich 7, jinak by se modulo vrátilo na
    // sedačku 0 a dvě karty by letěly na jedno místo.
    const positions = [
        { x: 200,  y: 540 },
        { x: 960,  y: 140 },
        { x: 1720, y: 540 },
        { x: 400,  y: 200 },
        { x: 1520, y: 200 },
        { x: 960,  y: 870 },
        { x: 200,  y: 260 },
    ];
    return positions[diff % positions.length] || { x: 960, y: 300 };
}

// ══════════════════════════════════════════════════════════════════════════════
// INTRO RENDER FUNKCE
// ══════════════════════════════════════════════════════════════════════════════

// Animuje kartu z introSprites skupiny (nečistí se při renderUI)
// startScale (nepovinné) = velikost, ve které karta vzlétá; bez něj letí celou dobu
// v cílové velikosti. Rozdávání z balíčku ho posílá, aby se karta za letu zmenšila
// z velikosti balíčku na velikost ruky příjemce (na mobilu je vějíř soupeře o dost menší).
function _introAnimCard(fromX, fromY, toX, toY, tex, dur, onComplete, angle, scale, startScale) {
    const safeTex = gameScene.textures.exists(tex) ? tex : 'card_back';
    const targetAngle = angle || 0;
    const endScale = scale || 0.28;
    const fromScale = startScale ?? endScale;
    // Karta vzlétá z balíčku (0°) a za letu se PLYNULE dotočí do orientace cíle (hráč
    // na boku = ±90°, protější = 180°) – ať „dosedne" ve správném natočení, ne skokem.
    const sp = gameScene.add.image(fromX, fromY, safeTex)
        .setScale(fromScale).setAngle(0).setDepth(800).setAlpha(0.95);
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
    if (fromScale !== endScale) {
        gameScene.tweens.add({ targets: sp, scaleX: endScale, scaleY: endScale, duration: d, ease: 'Power2' });
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
    // Která karta už doletěla – statický render ji pak kreslí i před doletem té druhé.
    // Bez toho levá karta po dokončení překlopení zmizela (sprite se ničí) a objevila
    // se až s pravou, tedy viditelně bliknula.
    s.charRevealed = [false, false];
    let done = 0;
    choices.forEach((charName, idx) => {
        const info = charData && charData.find(c => c.name === charName);
        const tex  = info && gameScene.textures.exists('char_' + info.id) ? 'char_' + info.id : 'placeholder';
        const cardX = idx === 0 ? 540 : 1380;
        // Moje karty postav letí PŘÍMO z balíčku na výběrové pozice, během letu se
        // překlopí lives→líc a zvětší. Ve STEJNÉM rytmu jako ostatním (nejdřív levá,
        // chvilku po ní pravá) – dřív se mi obě objevily naráz. Klikací jsou až po obou.
        _introAnimCardFlip(INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y, cardX, 510, 'lives', tex, 560, () => {
            done++;
            if (!_introState) return;
            if (_introState.charRevealed) _introState.charRevealed[idx] = true;
            if (done >= 2) {
                _introState.charChoicesRevealed = true;
                _introState.myCharShowUI = true;
            }
            renderUI();
        }, 0, null, { startScale: 0.30, endScale: 0.72, delay: idx * INTRO_CHAR_DEAL_GAP });
    });
    renderUI(); // během letu běží normální scéna (balíček postav vidět), výběr až po doletu
}

// Odpočinková pozice rozdané karty – PŘESNĚ tam, kde karta bude v reálné hře
// (renderUI: moje ruka resp. ruce protihráčů), aby přechod do hry byl beze skoku.
// Vrací { x, y, angle, scale }. count = počet karet v ruce hráče.
function _introDealRestPos(idx, myIdx, total, i, count) {
    // Moje ruka – stejné rozložení jako herní render. Čte se z profilu (handEndX se
    // mimo 16:9 lepí na pravý okraj jeviště), jinak by karty po intru poskočily.
    if (idx === myIdx) {
        const L = currentLayout();
        return { x: myHandSlotX(L, i, count), y: L.handY, angle: 0, scale: L.scaleHand };
    }
    // Protihráči – stejné rozložení jako herní render (drawHandCard)
    const L = currentLayout();
    const oppN = Math.max(1, ((state && state.players) ? state.players.length : total) - 1);
    const scaleOpp = oppScale(L, oppN);
    // Kompaktní řada (mobil): sloty i menší měřítko vějíře zná positions.js/core/layout.js,
    // prahové odvozování strany z pozice ruky by tu stranu netrefilo.
    if (L.oppMode === 'compact') {
        const p = getHandSlotPos(idx, i, count);
        return { x: p.x, y: p.y, angle: 0, scale: handCardScale(L, oppN, false) };
    }
    const cardW = 325 * scaleOpp;   // 87.75
    const cardH = 500 * scaleOpp;   // 135
    const hand = getPlayerHandPos(idx);
    let side;
    // Prahy proti okraji JEVIŠTĚ – kotvy krajních soupeřů se lepí na okraj, takže
    // pevných 50 / 1870 by mimo 16:9 stranu netrefilo (na 16:9 vychází stejně).
    if (hand.x < stageLeft() + 50)        side = 'left';
    else if (hand.y < stageTop() + 50)    side = 'top';
    else if (hand.x > stageRight() - 50)  side = 'right';
    else                                  side = 'bottom';
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

// Pozice karet mého hráče ve hře (pro plynulý přechod do hry). Čtou se z profilu
// rozložení – na mobilu mám stůl jinde než na desktopu (core/layout.js). Funkce,
// ne konstanty: profil se ustaví až v applyStage, tedy po načtení tohohle souboru.
function MY_ROLE_X()      { const L = currentLayout(); return L.livesX + L.roleOffX; }   // 850
function MY_ROLE_Y()      { return currentLayout().myBaseY; }                            // 970
function MY_ROLE_SCALE()  { return currentLayout().scaleMe; }                            // 0.36
function MY_LIVES_X()     { return currentLayout().livesX; }                             // 1050
function MY_LIVES_Y()     { return currentLayout().myBaseY; }                            // 970
function MY_LIVES_SCALE() { return currentLayout().scaleMe; }                            // 0.36
// charY = MY_LIVES_Y() - bulletH * health, bulletH = 500*0.36*0.93/5 = 33.48

// Druhá karta MOJÍ dráhy životů (postavy nad 5 životů – Divoký západ) leží o 5 nábojů
// výš; null = dráha je jednokartová, tedy dnešní stav. Řídí se ZOBRAZENÝMI životy, ne
// maxHealth (livesCardsShown, bug 56) – v intru navazující hry navíc maxHealth ve stavu
// ještě nemusí být dopočítané, přeživší ho dostane až s potvrzením postavy (bug 65).
function MY_LIVES2_Y(health) {
    const t = livesTrack(health, MY_LIVES_SCALE());
    return t.cards > 1 ? MY_LIVES_Y() - t.cardOff : null;
}

function _myCharY(health) {
    const bulletH = (500 * MY_LIVES_SCALE() * 0.93) / 5;
    return MY_LIVES_Y() - bulletH * (health || 4);
}

// ══════════════════════════════════════════════════════════════════════════════
// NAVAZUJÍCÍ HRA – přeživší si nechává (nebo odkládá) svou postavu
// ══════════════════════════════════════════════════════════════════════════════
// Tok: init rozloží desku (balíčky + postavy přeživších) → po 1 s vyletí MOJE postava
// doprostřed a zeptá se → rozhodnutí odletí na server, karta se usadí (ANO) nebo se
// překlopí a odletí na balíček postav (NE) → ostatní vidí totéž bez zvětšení.

function _introCharTex(charName) {
    const charData = gameScene && gameScene.cache.json.get('characters_data');
    const info = charData && charData.find(c => c.name === charName);
    return (info && gameScene.textures.exists('char_' + info.id)) ? 'char_' + info.id : 'placeholder';
}

function _introMyIdx() {
    return (typeof myIndex === 'number') ? myIndex : App.myIntroIndex;
}

// placedCards se hledají/mění přes `key` ('char:3', 'lives:3', 'name:3', 'star:3').
function _introFindPlaced(key) {
    const s = _introState;
    if (!s || !s.placedCards) return null;
    return s.placedCards.find(pc => pc.key === key) || null;
}

function _introRemovePlaced(key) {
    const s = _introState;
    if (!s || !s.placedCards) return;
    s.placedCards = s.placedCards.filter(pc => pc.key !== key);
}

// Karta odejde fade-outem (lives po odložení postavy). Vykreslí ji jako sprite,
// aby přechod nebyl skokový, a teprve pak ji z placedCards odstraní.
function _introFadeAwayPlaced(key) {
    const pc = _introFindPlaced(key);
    if (!pc || !gameScene) { _introRemovePlaced(key); return; }
    pc.hidden = true;
    const sp = gameScene.add.image(pc.x, pc.y, pc.tex)
        .setScale(pc.scale).setAngle(pc.angle || 0).setDepth(pc.depth || 20);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);
    gameScene.tweens.add({
        targets: sp, alpha: 0, duration: 520, ease: 'Power2',
        onComplete: () => { if (sp?.active) sp.destroy(); _introRemovePlaced(key); renderUI(); }
    });
}

// Rozloží na desku postavy přeživších (a jejich životy + jmenovky). Bez hvězdy –
// role se teprve rozdají, takže ani přeživší šerif zatím odznak nemá.
function _introPlaceSurvivors() {
    const s = _introState;
    if (!s || !gameScene || !state || !state.players) return;
    const myIdx = _introMyIdx();
    (s.survivors || []).forEach(sv => {
        const p = state.players[sv.idx];
        if (!p || !sv.char) return;
        const charTex = _introCharTex(sv.char);
        if (sv.idx === myIdx) {
            s.placedCards.push({ tex: 'lives', x: MY_LIVES_X(), y: MY_LIVES_Y(),
                scale: MY_LIVES_SCALE(), depth: 21, key: 'lives:' + sv.idx,
                rl: { kind: 'myLives' } });
            const my2Y = MY_LIVES2_Y(sv.health);
            if (my2Y != null) s.placedCards.push({ tex: 'lives', x: MY_LIVES_X(), y: my2Y,
                scale: MY_LIVES_SCALE(), depth: 21, key: 'lives2:' + sv.idx,
                rl: { kind: 'myLives2', hp: sv.health } });
            s.placedCards.push({ tex: charTex, x: MY_LIVES_X(), y: _myCharY(sv.health),
                scale: MY_LIVES_SCALE(), depth: 23, key: 'char:' + sv.idx,
                rl: { kind: 'myChar', hp: sv.health } });
            s.placedCards.push({ text: p.name, x: MY_ROLE_X(), y: MY_ROLE_Y() + currentLayout().myNameOffY,
                depth: 50, key: 'name:' + sv.idx, rl: { kind: 'myName' },
                style: { fontSize: '20px', color: '#cccccc',
                    backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 7, y: 4 } } });
            s.myNamePlaced = true;
        } else {
            const sl = _introOppSlots(sv.idx, sv.health);
            s.placedCards.push({ tex: 'lives', x: sl.livesX, y: sl.livesY,
                scale: sl.scale, angle: sl.angle, depth: 21, key: 'lives:' + sv.idx,
                rl: { kind: 'oppLives', idx: sv.idx, hp: sv.health } });
            if (sl.lives2X != null) s.placedCards.push({ tex: 'lives', x: sl.lives2X, y: sl.lives2Y,
                scale: sl.scale, angle: sl.angle, depth: 21, key: 'lives2:' + sv.idx,
                rl: { kind: 'oppLives2', idx: sv.idx, hp: sv.health } });
            s.placedCards.push({ tex: charTex, x: sl.charX, y: sl.charY,
                scale: sl.scale, angle: sl.angle, depth: 23, key: 'char:' + sv.idx,
                rl: { kind: 'oppChar', idx: sv.idx, hp: sv.health } });
            s.placedCards.push({ text: p.name, x: sl.nameX, y: sl.nameY,
                style: sl.nameStyle, depth: 50, key: 'name:' + sv.idx,
                rl: { kind: 'oppName', idx: sv.idx, hp: sv.health } });
        }
        s.placedForIdx.push(sv.idx);
    });
}

// Druhá karta dráhy životů se vykládá až od 6 životů (livesCardsShown, core/layout.js),
// takže v intru musí přibýt / zmizet přesně ve chvíli, kdy se změní ZOBRAZENÉ životy:
// přeživší si nechá postavu (Big Spencer nastupuje na 9) nebo se odhalí role a šerifovi
// přibude život (Gary Looter 5 → 6). Bez toho se karta objevila až se startem hry (bug 65).
function _introSyncLives2(idx, health) {
    const s = _introState;
    if (!s || !gameScene) return;
    const isMe = idx === _introMyIdx();
    const sl = isMe ? null : _introOppSlots(idx, health);
    const y2 = isMe ? MY_LIVES2_Y(health) : (sl.lives2X != null ? sl.lives2Y : null);
    const existing = _introFindPlaced('lives2:' + idx);
    if (y2 == null) { if (existing) _introFadeAwayPlaced('lives2:' + idx); return; }
    if (existing) {
        existing.x = isMe ? MY_LIVES_X() : sl.lives2X;
        existing.y = y2;
        if (existing.rl) existing.rl.hp = health;
        return;
    }
    s.placedCards.push(isMe
        ? { tex: 'lives', x: MY_LIVES_X(), y: y2, scale: MY_LIVES_SCALE(), depth: 21,
            key: 'lives2:' + idx, rl: { kind: 'myLives2', hp: health } }
        : { tex: 'lives', x: sl.lives2X, y: sl.lives2Y, scale: sl.scale, angle: sl.angle,
            depth: 21, key: 'lives2:' + idx, rl: { kind: 'oppLives2', idx, hp: health } });
}

// Moje postava vyletí ze stolu doprostřed a zvětší se – pak přijdou tlačítka ANO/NE.
function _startKeepReveal() {
    const s = _introState;
    if (!s || s.keepShown) return;
    s.keepShown = true;
    const myIdx = _introMyIdx();
    const sv = (s.survivors || []).find(v => v.idx === myIdx);
    if (!sv || !gameScene) { renderUI(); return; }   // divák / mrtvý hráč jen přihlíží
    const entry = _introFindPlaced('char:' + myIdx);
    const fromY = entry ? entry.y : _myCharY(sv.health);
    if (entry) entry.hidden = true;
    renderUI();
    const sp = gameScene.add.image(MY_LIVES_X(), fromY, _introCharTex(sv.char))
        .setScale(MY_LIVES_SCALE()).setDepth(1000);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);
    gameScene.tweens.add({
        targets: sp, x: 960, y: 420, scaleX: 0.80, scaleY: 0.80,
        duration: 620, ease: 'Power2.easeOut',
        onComplete: () => {
            if (sp?.active) sp.destroy();
            if (_introState) { _introState.myKeepReady = true; renderUI(); }
        }
    });
}

// Statická zvětšená karta + otázka + ANO/NE. Kreslí se přes rozloženou desku
// (renderIntroScene ji volá až po balíčcích a placedCards).
function _renderKeepChoice() {
    const s = _introState;
    const sv = (s.survivors || []).find(v => v.idx === _introMyIdx());
    if (!sv) return;

    _iAdd(gameScene.add.image(960, 420, _introCharTex(sv.char)).setScale(0.80).setDepth(1000));

    _iAdd(gameScene.add.text(960, 760, `Chceš hrát dál s postavou ${sv.char}?`,
        { fontFamily: THEME.fontUI, fontSize: '30px', color: THEME.color.text,
          backgroundColor: 'rgba(0,0,0,0.72)', padding: { x: 18, y: 8 } })
        .setOrigin(0.5).setDepth(1001));

    const { bg: yesBg } = themeButton(gameScene, 700, 880, 380, 64, '✓ ANO, NECHÁM SI JI', {
        fill: THEME.color.successDarkNum, fillHover: 0x3f7a3f, stroke: THEME.color.successNum,
        fontSize: '26px', onClick: () => _confirmKeepChoice(true),
    });
    yesBg.setDepth(1001);

    const { bg: noBg } = themeButton(gameScene, 1220, 880, 300, 64, '✗ CHCI JINOU', {
        fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
        fontSize: '26px', onClick: () => _confirmKeepChoice(false),
    });
    noBg.setDepth(1001);
}

function _confirmKeepChoice(keep) {
    const s = _introState;
    if (!s || s.myKeepDecided) return;
    const myIdx = _introMyIdx();
    const sv = (s.survivors || []).find(v => v.idx === myIdx);
    if (!sv) return;
    s.myKeepDecided = keep ? 'keep' : 'reject';
    socket.emit('keep_character', keep);
    renderUI();   // schová tlačítka i statickou kartu, sprite níž letí v introSprites

    const sp = gameScene.add.image(960, 420, _introCharTex(sv.char)).setScale(0.80).setDepth(1000);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);

    if (keep) {
        // Postava se vrátí na stůl, ale rovnou na svůj MAXIMÁLNÍ počet životů.
        // Šerifův +1 se přidá až s odhalením rolí (sheriff_reveal) – teď je role tajná.
        const toY = _myCharY(baseHealthForCharacter(sv.char));
        gameScene.tweens.add({
            targets: sp, x: MY_LIVES_X(), y: toY,
            scaleX: MY_LIVES_SCALE(), scaleY: MY_LIVES_SCALE(),
            duration: 620, ease: 'Power2.easeIn',
            onComplete: () => {
                if (sp?.active) sp.destroy();
                const entry = _introFindPlaced('char:' + myIdx);
                if (entry) { entry.y = toY; entry.hidden = false;
                             if (entry.rl) entry.rl.hp = baseHealthForCharacter(sv.char); }
                _introSyncLives2(myIdx, baseHealthForCharacter(sv.char));
                renderUI();
            }
        });
        return;
    }

    // Odmítnutí: karta se překlopí na rub (lives) a odletí zmenšená na balíček postav.
    _introFlyBackToCharDeck(sp, myIdx);
}

// Společný závěr odmítnutí (moje i cizí karta): flip na rub → let na balíček postav,
// karta životů zmizí fade-outem a hráč se vrátí mezi ty, kdo si postavu teprve vyberou.
function _introFlyBackToCharDeck(sp, idx) {
    const s = _introState;
    gameScene.tweens.add({
        targets: sp, scaleX: 0, duration: 170, ease: 'Sine.easeIn',
        onComplete: () => {
            if (!sp?.active) return;
            sp.setTexture('lives');
            gameScene.tweens.add({
                targets: sp, scaleX: sp.scaleY, duration: 170, ease: 'Sine.easeOut',
                onComplete: () => {
                    gameScene.tweens.add({
                        targets: sp, x: INTRO_CHAR_DECK.x, y: INTRO_CHAR_DECK.y,
                        angle: 0, scaleX: 0.30, scaleY: 0.30,
                        duration: 520, ease: 'Power2.easeIn',
                        onComplete: () => {
                            if (sp?.active) sp.destroy();
                            if (!_introState) return;
                            // Odložená karta se vrací do balíčku postav.
                            _introState.charCount = (_introState.charCount || 0) + 1;
                            renderUI();
                        }
                    });
                }
            });
        }
    });
    // Životy i jmenovka odchází – hráč je zase „bez postavy" a všechno mu přiletí
    // znovu se slide-inem po výběru nové postavy (proto ho pustíme z placedForIdx).
    _introFadeAwayPlaced('lives:' + idx);
    _introFadeAwayPlaced('lives2:' + idx);   // druhá karta dráhy (postavy nad 5 životů)
    _introRemovePlaced('char:' + idx);
    _introRemovePlaced('name:' + idx);
    if (s) {
        s.placedForIdx = (s.placedForIdx || []).filter(i => i !== idx);
        if (idx === _introMyIdx()) s.myNamePlaced = false;
    }
}

// Rozhodnutí jiného hráče: stejné pohyby, jen bez zvětšení doprostřed.
function _introKeepAnimateOther(idx, keep) {
    const s = _introState;
    if (!s || !gameScene) return;
    const sv = (s.survivors || []).find(v => v.idx === idx);
    if (!sv) return;
    const entry = _introFindPlaced('char:' + idx);
    const sl = _introOppSlots(idx, sv.health);
    const fromX = entry ? entry.x : sl.charX;
    const fromY = entry ? entry.y : sl.charY;
    if (entry) entry.hidden = true;
    renderUI();

    const sp = gameScene.add.image(fromX, fromY, _introCharTex(sv.char))
        .setScale(sl.scale).setAngle(sl.angle).setDepth(1000);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);

    if (keep) {
        const to = _introOppSlots(idx, baseHealthForCharacter(sv.char));
        gameScene.tweens.add({
            targets: sp, x: to.charX, y: to.charY,
            duration: 520, ease: 'Power2.easeOut',
            onComplete: () => {
                if (sp?.active) sp.destroy();
                const e = _introFindPlaced('char:' + idx);
                if (e) { e.x = to.charX; e.y = to.charY; e.hidden = false;
                         if (e.rl) e.rl.hp = baseHealthForCharacter(sv.char); }
                _introSyncLives2(idx, baseHealthForCharacter(sv.char));
                renderUI();
            }
        });
        return;
    }
    _introFlyBackToCharDeck(sp, idx);
}

// Role jsou odhalené: šerif, který si nechal postavu, dostane +1 život (karta se
// posune o jeden náboj) a fade-inem se mu objeví hvězda. U sebe hvězdu nekreslíme –
// vlastní role je vidět na kartě role (drawMyArea odznak nemá).
function _introSheriffReveal(idx) {
    const s = _introState;
    if (!s || !gameScene || !state || !state.players) return;
    const entry = _introFindPlaced('char:' + idx);
    const p = state.players[idx];
    if (!entry || !p || !p.character) return;
    const isMe = idx === _introMyIdx();
    const tex = _introCharTex(p.character);
    const health = p.health || 4;
    const sl = isMe ? null : _introOppSlots(idx, health);
    const toX = isMe ? MY_LIVES_X() : sl.charX;
    const toY = isMe ? _myCharY(health) : sl.charY;
    const scale = isMe ? MY_LIVES_SCALE() : sl.scale;
    const angle = isMe ? 0 : sl.angle;

    entry.hidden = true;
    renderUI();
    const sp = gameScene.add.image(entry.x, entry.y, tex)
        .setScale(scale).setAngle(angle).setDepth(1000);
    if (gameScene.introSprites) gameScene.introSprites.add(sp);
    // 280 ms / Cubic.easeOut = stejné tempo jako herní posun životů (view/board.js).
    gameScene.tweens.add({
        targets: sp, x: toX, y: toY, duration: 280, ease: 'Cubic.easeOut',
        onComplete: () => {
            if (sp?.active) sp.destroy();
            const e = _introFindPlaced('char:' + idx);
            if (e) { e.x = toX; e.y = toY; e.hidden = false; if (e.rl) e.rl.hp = health; }
            // Šerifův +1 může být právě ten život, od kterého se dráha dělí na dvě karty
            // (Gary Looter 5 → 6) – druhá musí přibýt teď, ne až se startem hry (bug 65).
            _introSyncLives2(idx, health);
            renderUI();
        }
    });

    if (isMe) return;
    const star = gameScene.add.image(sl.starX, sl.starY, 'sheriff_star')
        .setScale(sl.starScale).setAngle(sl.angle).setAlpha(0).setDepth(1001);
    if (gameScene.introSprites) gameScene.introSprites.add(star);
    gameScene.tweens.add({
        targets: star, alpha: 1, duration: 600, delay: 280, ease: 'Power2',
        onComplete: () => {
            if (star?.active) star.destroy();
            if (_introState) _introState.placedCards.push(
                { tex: 'sheriff_star', x: sl.starX, y: sl.starY,
                  scale: sl.starScale, angle: sl.angle, depth: 24, key: 'star:' + idx,
                  rl: { kind: 'oppStar', idx, hp: health } }
            );
            renderUI();
        }
    });
}

// ── Přepočet rozložení za běhu intra ─────────────────────────────────────────
// Změna velikosti okna / vstup do fullscreenu mění jeviště i profil rozložení. Ve hře
// se deska prostě překreslí (renderGameBoard počítá pozice z profilu pokaždé znovu),
// ale intro si už umístěné karty drží v placedCards jako HOTOVÉ souřadnice – bez
// přepočtu zůstaly ležet tam, kde byly, zatímco balíčky a jeviště se posunuly.
// Každá položka proto nese `rl` (jak se její pozice počítá) a tohle ji přepočítá.
function _introRelayoutPlaced() {
    const s = _introState;
    if (!s || !s.placedCards || !gameScene) return;
    const myIdx = _introMyIdx();
    s.placedCards.forEach(pc => {
        const r = pc.rl;
        if (!r) return;
        switch (r.kind) {
            case 'oppRole': {
                const sl = _introOppSlots(r.idx, 4);
                const pos = getDeadRoleCardPos(r.idx);
                pc.x = pos.x; pc.y = pos.y; pc.scale = sl.scale; pc.angle = sl.angle;
                break;
            }
            case 'oppLives': {
                const sl = _introOppSlots(r.idx, r.hp ?? 4);
                pc.x = sl.livesX; pc.y = sl.livesY; pc.scale = sl.scale; pc.angle = sl.angle;
                break;
            }
            case 'oppLives2': {
                const sl = _introOppSlots(r.idx, r.hp ?? 4);
                if (sl.lives2X != null) { pc.x = sl.lives2X; pc.y = sl.lives2Y; }
                pc.scale = sl.scale; pc.angle = sl.angle;
                break;
            }
            case 'oppChar': {
                const sl = _introOppSlots(r.idx, r.hp ?? 4);
                pc.x = sl.charX; pc.y = sl.charY; pc.scale = sl.scale; pc.angle = sl.angle;
                break;
            }
            case 'oppStar': {
                const sl = _introOppSlots(r.idx, r.hp ?? 4);
                pc.x = sl.starX; pc.y = sl.starY; pc.scale = sl.starScale; pc.angle = sl.angle;
                break;
            }
            case 'oppName': {
                const sl = _introOppSlots(r.idx, r.hp ?? 4);
                pc.x = sl.nameX; pc.y = sl.nameY; pc.style = sl.nameStyle;
                break;
            }
            case 'myRole':
                pc.x = MY_ROLE_X(); pc.y = MY_ROLE_Y(); pc.scale = MY_ROLE_SCALE();
                break;
            case 'myLives':
                pc.x = MY_LIVES_X(); pc.y = MY_LIVES_Y(); pc.scale = MY_LIVES_SCALE();
                break;
            case 'myLives2': {
                const y2 = MY_LIVES2_Y(r.hp ?? 4);
                pc.x = MY_LIVES_X(); pc.scale = MY_LIVES_SCALE();
                if (y2 != null) pc.y = y2;
                break;
            }
            case 'myChar':
                pc.x = MY_LIVES_X(); pc.y = _myCharY(r.hp ?? 4); pc.scale = MY_LIVES_SCALE();
                break;
            case 'myName':
                pc.x = MY_ROLE_X(); pc.y = MY_ROLE_Y() + currentLayout().myNameOffY;
                break;
            case 'colt': {
                const c = _introColtPos();
                pc.x = c.x; pc.y = c.y; pc.scale = c.scale;
                break;
            }
            case 'hand': {
                const rest = _introDealRestPos(r.idx, myIdx, s.playerCount, r.slot, r.count);
                pc.x = rest.x; pc.y = rest.y; pc.scale = rest.scale; pc.angle = rest.angle;
                break;
            }
        }
    });
    renderUI();
}

// Výchozí Colt .45 na mém stole – shodné s herním renderem (drawMyArea): první slot
// stolu = roleX − (šířka karty + mezera).
function _introColtPos() {
    const L = currentLayout();
    const scale = L.scaleMe;
    return { x: L.livesX + L.roleOffX - (325 * scale + L.boardGap), y: L.myBaseY, scale };
}

function renderIntroScene() {
    if (!_introState || !gameScene) return;
    const s = _introState;
    const sub = s.sub;

    // Výběr postavy: zobraz když máme choices, hráč nevybral, a UI je ready.
    // Stačí, že doletěla PRVNÍ z dvojice (charRevealed) – jinak by levá karta po
    // dokončení svého překlopení zmizela (sprite se ničí) a scéna by ji nakreslila
    // až s doletem pravé, tedy viditelně bliknula. Klikací jsou obě až po obou
    // (charChoicesRevealed, gate uvnitř _renderIntroCharSelect).
    const anyCharRevealed = !!(s.charRevealed && s.charRevealed.some(Boolean));
    if (s.myCharChoices && s.myCharChoices.length > 0 && !s.myCharSelected
        && (s.myCharShowUI || anyCharRevealed)) {
        _renderIntroCharSelect();
        return;
    }

    // Pozadí – stejná velikost jako herní pozadí (create: setDisplaySize přes jeviště),
    // aby při přechodu z intra do hry pozadí neměnilo velikost.
    const introCover = stageCoverSize();
    _iAdd(gameScene.add.image(960, 540, 'background')
        .setDisplaySize(introCover.w, introCover.h).setDepth(0));

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
    // Balíčky událostí (High Noon, Fistful of Cards, Divoký západ): rub. Během vlastního
    // míchání je zastupuje animace, během přesunu na herní pozici pohyblivý stack (*Moving).
    ['hn', 'ff', 'wws'].forEach(w => {
        const C = introEventCfg(w);
        const shuffleSub = C.shuffleSub;
        if (s[w + 'Count'] > 0 && !shuffling(shuffleSub) && !s[w + 'Moving'])
            _drawIntroStack(C.deck.x, C.deck.y, C.back, s[w + 'Count'], 0.30);
        // Odložená karta (Pravé poledne / Fistful of Cards / Divoký západ) lícem nahoru,
        // než sjede pod hromádku.
        const aside = s[w + 'AsideTex'];
        if (aside && gameScene.textures.exists(aside))
            _iAdd(gameScene.add.image(C.aside.x, C.aside.y, aside).setScale(0.30).setDepth(40));
    });

    // Umístěné karty (role, lives, char) + jmenovky - persistují přes všechny fáze
    if (s.placedCards) s.placedCards.forEach(_drawPlacedCard);

    // Popisek fáze
    const phaseLabels = {
        'init': '',
        'shuffle_roles': '',
        'deal_roles': '',
        'await_role_ok': '',
        'waiting_for_others_role': '',
        'shuffle_chars': '',
        'deal_chars': '',
        'chars_slide_in': '',
        'shuffle_deck': '',
        'deal_cards': '',
    };
    // Navazující hra: kdo se nerozhoduje (mrtvý hráč, divák, už rozhodnutý přeživší)
    // musí vědět, na co se čeká – jinak jen kouká na nehybnou desku.
    const iAmDeciding = (s.survivors || []).some(v => v.idx === _introMyIdx()) && !s.myKeepDecided;
    if (s.nextGame && s.keepShown && !s.rolesStarted && !iAmDeciding) {
        _iAdd(gameScene.add.text(960, 80, '⏳ Přeživší se rozhodují, jestli si nechají svou postavu…',
            { fontFamily: THEME.fontUI, fontSize: '30px', color: THEME.color.textMuted,
              backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 20, y: 10 } })
            .setOrigin(0.5).setDepth(50));
    }
    // Pokud už mám roli odkrytou (čeká se na OK), ukaž odpovídající popisek
    // bez ohledu na to, v jaké přesné fázi rozdávání zrovna server je.
    const showReveal = (s.showRoleReveal || sub === 'await_role_ok') && s.myRole && !App.introRoleOkSent;
    const lbl = showReveal ? '' : phaseLabels[sub];
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

    // Navazující hra: moje postava doletěla doprostřed → „nechám si ji?" (ANO/NE).
    if (s.myKeepReady && !s.myKeepDecided) {
        _renderKeepChoice();
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
            x: MY_ROLE_X(), y: MY_ROLE_Y(),
            scaleX: MY_ROLE_SCALE(), scaleY: MY_ROLE_SCALE(),
            duration: 550, ease: 'Power2.easeIn',
            onComplete: () => {
                if (snap?.active) snap.destroy();
                // Přidej do placedCards - bude vidět po celý zbytek intra
                if (_introState) {
                    _introState.placedCards.push(
                        { tex, x: MY_ROLE_X(), y: MY_ROLE_Y(), scale: MY_ROLE_SCALE(), depth: 22,
                          key: 'role:me', rl: { kind: 'myRole' } }
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

    // Pozadí – stejná velikost jako herní pozadí (přes celé jeviště)
    const charCover = stageCoverSize();
    _iAdd(gameScene.add.image(960, 540, 'background')
        .setDisplaySize(charCover.w, charCover.h).setDepth(0));

    // Balíčky za UI: hrací karty a (nerozdaný zbytek) postav – ten na stole zůstává,
    // dokud po výběru neodletí (_introFlyAwayCharDeck), takže nesmí zmizet jen proto,
    // že se přes desku kreslí výběr.
    if (s.deckCount > 0)
        _drawIntroStack(INTRO_PLAY_DECK.x, INTRO_PLAY_DECK.y, 'card_back', s.deckCount, 0.30, '');
    if (s.charCount > 0)
        _drawIntroStack(INTRO_CHAR_DECK.x, INTRO_CHAR_DECK.y, 'lives', s.charCount, 0.30);
    // Balíčky událostí (High Noon, Fistful) leží na stole po celé intro – i během výběru postav.
    ['hn', 'ff'].forEach(w => {
        const C = introEventCfg(w);
        if (s[w + 'Count'] > 0) _drawIntroStack(C.deck.x, C.deck.y, C.back, s[w + 'Count'], 0.30);
    });

    // Umístěné karty (role atd.) + jmenovky
    if (s.placedCards) s.placedCards.forEach(_drawPlacedCard);

    // Klikací karty postav ukážeme AŽ po dokončení překlápěcího revealu
    // (charChoicesRevealed) – během flipu běží sprite v introSprites. Výběr je
    // dvoukrokový: 1. klik na postavu ji jen PŘEDVYBERE (zvětší jako při najetí) a
    // odemkne tlačítko Potvrdit; teprve potvrzení spustí animaci usazení postavy.
    // Karta, která už doletěla, se kreslí hned (charRevealed) – jinak by po dokončení
    // svého překlopení zmizela a čekala na tu druhou. KLIKACÍ jsou obě až po obou
    // (charChoicesRevealed), aby se nedalo vybrat dřív, než je vidět nabídka celá.
    const revealed = s.charRevealed || [];
    const choices = (s.charChoicesRevealed || revealed.some(Boolean)) ? (s.myCharChoices || []) : [];
    choices.forEach((charName, idx) => {
        if (!s.charChoicesRevealed && !revealed[idx]) return;
        const charInfo = charData && charData.find(c => c.name === charName);
        const texKey   = charInfo && gameScene.textures.exists('char_' + charInfo.id)
            ? 'char_' + charInfo.id : 'placeholder';
        const cardX    = idx === 0 ? 540 : 1380;
        const isPre    = s.myCharPreselect === charName;

        const cs = gameScene.add.image(cardX, 510, texKey)
            .setScale(isPre ? 0.80 : 0.72).setDepth(61);
        if (isPre) cs.setTint(0xddffdd);
        if (s.charChoicesRevealed) {
            cs.setInteractive({ useHandCursor: true });
            cs.on('pointerover', () => { cs.setScale(0.80); cs.setTint(0xddffdd); });
            cs.on('pointerout',  () => { if (s.myCharPreselect !== charName) { cs.setScale(0.72); cs.clearTint(); } });
            cs.on('pointerdown', () => {
                if (s.myCharSelected) return;
                s.myCharPreselect = charName;   // jen předvýběr – potvrzuje se tlačítkem
                renderUI();
            });
        }
        _iAdd(cs);
    });

    // Tlačítko Potvrdit – neaktivní (zašedlé), dokud hráč na nějakou postavu neklikne.
    // Ukáže se až s celou nabídkou (obě karty doletěly), ne už po první.
    if (choices.length && s.charChoicesRevealed) {
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
                        x: MY_LIVES_X(), y: MY_LIVES_Y(),
                        scaleX: MY_LIVES_SCALE(), scaleY: MY_LIVES_SCALE(),
                        duration: 450, ease: 'Power2.easeIn',
                        onComplete: () => {
                            if (rejected?.active) rejected.destroy();
                            if (_introState) {
                                _introState.placedCards.push(
                                    { tex: 'lives', x: MY_LIVES_X(), y: MY_LIVES_Y(),
                                      scale: MY_LIVES_SCALE(), depth: 21,
                                      key: 'lives:me', rl: { kind: 'myLives' } }
                                );
                                // Postava nad 5 životů (Big Spencer, Gary Looter): druhá
                                // karta dráhy nemá v intru vlastní zdroj (obě rozdané
                                // karty jsou postavy), takže se usadí rovnou s první.
                                const y2 = MY_LIVES2_Y(health);
                                if (y2 != null) _introState.placedCards.push(
                                    { tex: 'lives', x: MY_LIVES_X(), y: y2,
                                      scale: MY_LIVES_SCALE(), depth: 21,
                                      key: 'lives2:me', rl: { kind: 'myLives2', hp: health } }
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
        x: MY_LIVES_X(), y: charY,
        scaleX: MY_LIVES_SCALE(), scaleY: MY_LIVES_SCALE(),
        delay: 450, duration: 480, ease: 'Power2.easeIn',
        onComplete: () => {
            if (chosen?.active) chosen.destroy();
            if (_introState) {
                _introState.placedCards.push(
                    { tex: chosenTex, x: MY_LIVES_X(), y: charY,
                      scale: MY_LIVES_SCALE(), depth: 23,
                      key: 'char:me', rl: { kind: 'myChar', hp: health } }
                );
                _introState.charAnimDone = true;
            }
            renderUI();
        }
    });
}
