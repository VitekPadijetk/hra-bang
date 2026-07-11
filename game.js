const socket = io();

// Klientská diagnostika (chybějící textura, nenačtené pozadí, notify) → server, který ji
// složí do logu hry / server.log (server/gamelog.js). Nahrazuje dřívější console.* na klientu.
// socket.io bufferuje emity poslané před navázáním spojení, takže časné hlášky se neztratí.
function clog(level, msg, data) {
    try { socket.emit('client_log', { level, msg, data }); } catch (_) { /* logování nesmí shodit klienta */ }
}

const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1920,
        height: 1080
    },
    backgroundColor: '#4a3018',
    parent: 'game-container',
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);

let state = null;
let selectedState = { cardIndex: null, action: null };
let myIndex = null;
let gameScene = null;
let playerName = null;
let _myNextGameVote = null;
let roomState = null;

// ── Reconnect identita (token + session) ─────────────────────────────────────
// socket.id se po reconnectu/F5 mění, takže nemůže být identitou. bangToken je
// stabilní per-prohlížeč klíč (přežije F5/výpadek) a slouží jako identita pro rejoin.
// bangSession = právě hraná místnost (+ jméno) v localStorage → po načtení stránky
// se umíme sami vrátit do hry (server drží naše místo a dočasně za nás hraje bot).
let bangToken = null;
try {
    bangToken = localStorage.getItem('bangToken');
    if (!bangToken) {
        bangToken = (window.crypto?.randomUUID?.() || ('t' + Date.now() + Math.random().toString(36).slice(2)));
        localStorage.setItem('bangToken', bangToken);
    }
} catch (e) { bangToken = 't' + Date.now() + Math.random().toString(36).slice(2); }

function saveBangSession(roomId) {
    try { localStorage.setItem('bangSession', JSON.stringify({ roomId, name: playerName })); } catch (e) {}
}
function clearBangSession() {
    try { localStorage.removeItem('bangSession'); } catch (e) {}
}
function loadBangSession() {
    try { return JSON.parse(localStorage.getItem('bangSession') || 'null'); } catch (e) { return null; }
}

const GAME_W = 1920, GAME_H = 1080;
const GAME_CENTER_X = GAME_W / 2, GAME_CENTER_Y = GAME_H / 2;
const DECK_X = GAME_CENTER_X - 90, DECK_Y = GAME_CENTER_Y;
const DISCARD_X = GAME_CENTER_X + 90, DISCARD_Y = GAME_CENTER_Y;

// Balíček/odhoz se v board.js (drawDrawPiles) kreslí jako hromádka: každá vrstva je
// o PILE_PX_PER_CARD výš, takže VRCH hromádky leží nad základní pozicí (DECK_Y/DISCARD_Y).
// Karta letící do/z hromádky musí mířit na tento vrch, ne na základnu – jinak u vysoké
// hromádky dosedne viditelně „pod ni" a po překreslení poskočí. Hodnota i vzorec musí
// sedět s board.js (stackTop / topY). App.storePileLiftY zvedá obě hromádky (Hokynářství).
const PILE_PX_PER_CARD = 0.25;
function _pileTopY(baseY, count) {
    const lift = App.storePileLiftY || 0;
    return (baseY - lift) - Math.max(0, count - 1) * PILE_PX_PER_CARD / 2;
}
// Vrch balíčku dobírání (počítá se z aktuálního stavu – při líznutí je karta ještě ve
// stavu, při reshuffle už tam nová hromádka je).
function deckTopPos() {
    return { x: DECK_X, y: _pileTopY(DECK_Y, state?.deck?.cards?.length ?? 0) };
}
// Vrch odhozu. Karta letící DO odhozu je v okamžiku animace už ve stavu discardPile
// (broadcast dorazí okolo card_animation), takže count zahrnuje i ji → cíl = její budoucí
// klidová poloha navrchu.
function discardTopPos() {
    return { x: DISCARD_X, y: _pileTopY(DISCARD_Y, state?.deck?.discardPile?.length ?? 0) };
}

// ── NOVÉ VYKRESLOVÁNÍ KARET ───────────────────────────────────────────────────
// Karta se při startu složí z art-obrázku druhu (assets/card_art/<art>.png) + malých
// marek hodnoty/barvy (assets/card_marks/*.png) do textury card_<id> (buildCardTextures).
// Když art/marky pro druh chybí, spadne na starou kartu (assets/playing_cards/<id>.png,
// načtenou jako legacy_<id>) → plynulá migrace po druzích.
//
// CARD_TEX_W/H = velikost výsledné textury. Teď 325×500 (shodné se současným zobrazením),
// takže se NEMĚNÍ žádný display scale. Art i marky se kreslí ve 2× (návrh pro 4K) a při
// bakování zmenší. Až se udělá globální 4K průchod (všechny assety 2× + render-rezoluce
// plátna), stačí zvednout CARD_TEX_W/H na 650×1000 a půlit display scale u VŠECH sprintů.
const CARD_TEX_W = 325, CARD_TEX_H = 500;
// Umístění marek v prostoru karty (levý dolní roh); marky jsou kresleny pro 650px kartu.
// Sdíleno buildCardTextures (bake) i pulseCheckMark (zvýraznění při snímání).
// valX/valY = kotva (levý dolní roh) čísla hodnoty; barva (suit) sedí napravo od čísla
// na vlastní výšce suitY. Vše v prostoru baked karty (CARD_TEX_W×H).
const MARK_LAYOUT = {
    scale: CARD_TEX_W / 650,
    valX: CARD_TEX_W * 0.05 + 7.5,
    valY: CARD_TEX_H * 0.96 + 12.5,
    suitY: CARD_TEX_H * 0.96 + 8,
    gap: CARD_TEX_W * 0.01,
    // Symbol rozšíření (býk Dodge City) – pravý horní roh, kotva origin(1,0).
    bullX: CARD_TEX_W * 0.97,
    bullY: CARD_TEX_H * 0.02,
    bullScale: CARD_TEX_W / 650
};

const ALL_CHARACTERS_CLIENT = [
    "Bart Cassidy", "Black Jack", "Calamity Janet", "El Gringo",
    "Jesse Jones", "Jourdonnais", "Kit Carlson", "Lucky Duke",
    "Paul Regret", "Pedro Ramirez", "Rose Doolan", "Sid Ketchum",
    "Slab the Killer", "Suzy Lafayette", "Vulture Sam", "Willy the Kid"
];

// --- ZOOM KARET ---
let _hoverTimer = null;
let _zoomObjects = [];
let _zoomTween = null;
let _zoomVisible = false;
let _zoomFadeTimer = null;
// Identita karty, jejíž zoom je naplánovaný/zobrazený (id karty nebo 'char:N'…). Drží
// se NEZÁVISLE na spritu: renderUI stůl překresluje (staré sprity zničí, nové vytvoří),
// takže zoom nesmí viset na konkrétním spritu, ale na tom, CO je pod kurzorem. Díky
// tomu cizí akce (překreslení) neresetuje odpočet ani zvýraznění té samé karty.
let _zoomKey = null;

function cancelZoomTimer() {
    clearTimeout(_hoverTimer);
    _hoverTimer = null;
}

function _cancelFadeTimer() {
    clearTimeout(_zoomFadeTimer);
    _zoomFadeTimer = null;
}

function _zoomSuppressed() {
    if (!state) return false;
    // Běžné letící animace zoom NEblokují (zobrazí se nad nimi, depth 900 > 800). Přeruší
    // ho jen míchání/snímání balíčku – to zabírá střed obrazovky, kde zoom vzniká.
    if (App.reshuffleAnimating) return true;
    if (selectedState.cardIndex !== null) return true;
    if (selectedState.sidKetchum !== undefined) return true;
    // Fázové potlačení (líznutí, odhoz, reakce, kontroly…) platí jen když jsem to JÁ, kdo je
    // na tahu / má reagovat. state.phase je GLOBÁLNÍ, takže když soupeř zrovna líže/hraje,
    // nesmí mi to blokovat zoom – v cizím tahu klidně zvětšuj.
    const iAmActing = myIndex != null && (
        state.currentPlayerIndex === myIndex ||
        (state.phase === 'RESPOND' && state.pendingResponse?.targetIdx === myIndex) ||
        (state.phase === 'DYNAMITE_DAMAGE' && state.pendingDynamiteDamage?.playerIdx === myIndex)
    );
    if (iAmActing) {
        const suppressPhases = ['RESPOND','DISCARD','BARREL_DRAW','BART_DRAW',
                                'SUZY_DRAW','EL_GRINGO_STEAL','CHECK_DRAW','KIT_CARLSON','LUCKY_DUKE','DRAW','DYNAMITE_DAMAGE'];
        if (suppressPhases.includes(state.phase)) return true;
    }
    return false;
}

// Pozice kurzoru v herních souřadnicích (bez závislosti na Phaserově input listu, který se
// po vytvoření spritů plní až další snímek → hitTestPointer by hned po renderUI vracel prázdno).
function _pointerPos() {
    const p = gameScene?.input?.activePointer;
    if (!p) return null;
    const x = (p.worldX != null) ? p.worldX : p.x;
    const y = (p.worldY != null) ? p.worldY : p.y;
    return (x == null || y == null) ? null : { x, y };
}

// Je pod kurzorem stále karta (nebo její zoom-obraz) s daným klíčem? Počítá se GEOMETRICKY
// proti spritům ve skupině (ne přes Phaser input list), takže to platí i hned po překreslení.
// Řeší, když karta zmizela (cizí akce), změnila se obrazovka nebo kurzor kartu opustil.
function _pointerOverZoomKey(key) {
    if (key == null || !gameScene) return true;
    const pos = _pointerPos();
    if (!pos) return true;
    const list = gameScene.cardsSprites?.getChildren?.() || [];
    for (const o of list) {
        if (!o || o._zoomKey !== key || !o.visible || !o.getBounds) continue;
        try { if (o.getBounds().contains(pos.x, pos.y)) return true; } catch (e) {}
    }
    const img = _zoomObjects[0];
    if (img?.active && img._zoomKey === key && img.getBounds) {
        try { if (img.getBounds().contains(pos.x, pos.y)) return true; } catch (e) {}
    }
    return false;
}

function startCardZoom(texKey, key = null) {
    if (_zoomSuppressed()) return;
    _cancelFadeTimer();
    // Stejná karta je pořád pod kurzorem (typicky po překreslení stolu cizí akcí): neresetuj
    // odpočet ani nezhasínej – necháme běžet původní časovač/zoom.
    if (key != null && key === _zoomKey && (_zoomVisible || _hoverTimer)) return;
    if (_zoomVisible) return;
    cancelZoomTimer();
    if (!texKey || texKey === 'placeholder') return;
    _zoomKey = key;
    _hoverTimer = setTimeout(() => {
        _hoverTimer = null;   // časovač doběhl – od teď „nečeká"
        if (!gameScene || _zoomSuppressed()) return;
        if (!_pointerOverZoomKey(key)) { _zoomKey = null; return; }   // karta mezitím zmizela
        stopCardZoom();
        _zoomKey = key;   // stopCardZoom klíč vynuloval, obnov
        const targetScale = Math.min(1700 / 325, 880 / 500) * 0.92;
        const img = gameScene.add.image(960, 540, texKey)
            .setDepth(900).setAlpha(0).setScale(targetScale * 0.85)
            .setInteractive();
        img._zoomKey = key;   // ať guard uzná i kurzor nad samotným zoom-obrazem
        _zoomObjects = [img];
        _zoomVisible = true;
        if (_zoomTween) _zoomTween.stop();
        _zoomTween = gameScene.tweens.add({
            targets: img, alpha: 1, scale: targetScale,
            duration: 500, ease: 'Power2'
        });
        img.on('pointerout', () => fadeOutZoom(img));
        img.on('pointerdown', () => fadeOutZoom(img));
    }, 1600);
}

function scheduleZoomFade() {
    // ZÁMĚRNĚ neruší odpočet ani _zoomKey: 'pointerout' přichází i při běžném překreslení
    // stolu (starý sprite se zničí = out, hned vznikne nový = over) a tvrdý reset by u karty
    // pod nehybným kurzorem shodil zvětšení. Skutečný úklid (kurzor opustil kartu) řeší
    // _tickCardZoom() podle geometrie. Tady jen naplánuj doznění UŽ zobrazeného zoomu –
    // dává to grace okno při přejezdu mezi kartami; návrat na kartu ho v startCardZoom zruší.
    if (!_zoomVisible) return;
    _cancelFadeTimer();
    _zoomFadeTimer = setTimeout(() => {
        _zoomFadeTimer = null;
        if (_zoomVisible && _zoomObjects[0]?.active) {
            fadeOutZoom(_zoomObjects[0]);
        }
    }, 300);
}

function fadeOutZoom(img) {
    _cancelFadeTimer();
    if (!_zoomVisible) { cancelZoomTimer(); _zoomKey = null; return; }
    _zoomVisible = false;
    _zoomKey = null;
    if (!img?.active) { _zoomObjects = []; return; }
    if (_zoomTween) { _zoomTween.stop(); _zoomTween = null; }
    gameScene.tweens.add({
        targets: img, alpha: 0, scale: img.scale * 0.85,
        duration: 300, ease: 'Power2',
        onComplete: () => { if (img?.active) img.destroy(); _zoomObjects = []; }
    });
}

function stopCardZoom() {
    _cancelFadeTimer();
    cancelZoomTimer();
    _zoomVisible = false;
    _zoomKey = null;
    if (_zoomTween) { _zoomTween.stop(); _zoomTween = null; }
    _zoomObjects.forEach(o => { try { if (o?.active) o.destroy(); } catch(e){} });
    _zoomObjects = [];
}

// Backstop volaný z update() smyčky: zoom čeká/svítí, ale karta s jeho klíčem už není pod
// kurzorem (cizí akce ji odstranila / změna obrazovky / kurzor odešel při překreslení, kdy
// Phaser 'pointerout' nepošle) → zoom ukliď. Při běžném hoveru téže karty se nestane nic.
function _tickCardZoom() {
    if (!gameScene) return;
    if (!_zoomVisible && !_hoverTimer) return;
    // Míchání/snímání balíčku zabírá střed – běžící/naplánovaný zoom přeruš.
    if (App.reshuffleAnimating) { stopCardZoom(); return; }
    if (_zoomKey == null) return;
    if (_pointerOverZoomKey(_zoomKey)) return;
    if (_zoomVisible && _zoomObjects[0]?.active) fadeOutZoom(_zoomObjects[0]);
    else stopCardZoom();
}

// Zvýraznění (tint/scale) i zoom drží pointerover handlery jednotlivých karet. Po překreslení
// stolu vzniknou NOVÉ sprity v základním stavu; Phaserův 'pointerover' na nehybném kurzoru
// dorazí až příští snímek (nové sprity se do input listu zařadí se zpožděním) → karta by na
// okamžik probliknala bez zvýraznění a zoomu by se resetoval odpočet. Proto hned po renderu
// synchronně dohledáme GEOMETRICKY vrchní kartu pod kurzorem a vyvoláme na ní pointerover –
// zvýraznění i zoom se nasadí PŘED vykreslením. Idempotentní s pozdějším Phaserovým pointerover.
function _reapplyPointerHover() {
    if (!gameScene?.cardsSprites) return;
    const pos = _pointerPos();
    if (!pos) return;
    let top = null;
    gameScene.cardsSprites.getChildren().forEach(o => {
        if (!o || !o.input || !o.visible || !o.getBounds) return;
        if (top && o.depth < top.depth) return;
        let b; try { b = o.getBounds(); } catch (e) { return; }
        if (b.contains(pos.x, pos.y)) top = o;
    });
    if (top) top.emit('pointerover', gameScene.input.activePointer);
}

// --- OPTIMISTICKÉ AKTUALIZACE ---
function optimisticRemoveCard(cardIdx) {
    if (!state || myIndex === null || !state.players?.[myIndex]) return;
    const me = state.players[myIndex];
    if (cardIdx !== null && cardIdx !== undefined && me.hand[cardIdx]) {
        // Zachyť pozici slotu PŘED odebráním – letová animace karty z ní vyjde.
        const card = me.hand[cardIdx];
        if (card?.id != null) {
            App.playedCardFromPos[card.id] = getHandSlotPos(myIndex, cardIdx, me.hand.length);
        }
        me.hand.splice(cardIdx, 1);
    }
}

function optimisticAddCardToHand(playerIdx) {
    if (!state || !state.players?.[playerIdx]) return;
    state.players[playerIdx].hand.push({ id: null, _placeholder: true });
}

// Nejkratší dotočení z `start` na orientaci `end` PŘI symetrii karty o 180°: karta
// vlevo (90°) a vpravo (−90°) vypadá stejně (svisle), takže přechod left→right není
// žádná rotace, ne otočka o 180°. Vrátí cílový úhel ve stejné orientaci jako `end`,
// ale co nejblíž k `start`.
function nearestCardAngle(start, end) {
    let delta = (end - start) % 180;
    if (delta > 90) delta -= 180;
    else if (delta < -90) delta += 180;
    return start + delta;
}

// Jako nearestCardAngle, ale BEZ 180° symetrie: u překlopené (lícem nahoru) karty ZÁLEŽÍ
// na orientaci (0° je čitelné, 180° je vzhůru nohama – nejsou zaměnitelné). Vrátí end
// posunutý o násobek 360° nejblíž ke start (nejkratší otočka se zachováním „čitelnosti").
function nearestAngle360(start, end) {
    let e = end;
    while (e - start > 180)  e -= 360;
    while (e - start < -180) e += 360;
    return e;
}

// opts.startAngle/endAngle: karta se během letu plynule dotočí (např. dynamit
// letící k hráči na boku, jehož karty jsou renderované otočené o 90°). Rotace bere
// nejkratší cestu se symetrií 180° (viz nearestCardAngle). opts.scale nastaví pevnou
// velikost; opts.startScale/endScale ji nechá během letu plynule změnit (zvětšit/zmenšit).
// opts.delay: sprite se VYTVOŘÍ hned (sedí na startu), ale rozletí se až po prodlevě –
// aby karta nezmizela mezi koncem panelu a začátkem svého letu (Lucky NEvybraná).
// Po dosednutí letu podrž sprite na cíli, dokud `holdUntil()` není true (typicky „karta už
// je ve stavu odhozu / na boardu / v ruce"), pak teprve zavolej finish (odkrytí + zánik).
// Bez toho by po doletu – dřív, než dorazí room_update s kartou – problikla stará karta na
// cíli (např. předchozí vrchní karta odhozu). Strop ~720 ms, ať sprite nezůstane viset.
function holdThenFinish(sprite, holdUntil, finish) {
    if (!holdUntil || !gameScene) { finish(); return; }
    let tries = 0;
    const poll = () => {
        if (!sprite?.active) return;
        if (holdUntil() || ++tries > 45) finish();
        else gameScene.time.delayedCall(16, poll);
    };
    poll();
}

function animateCard(fromX, fromY, toX, toY, texKey, duration = 380, onComplete = null, opts = {}) {
    if (!gameScene) return;
    const startAngle = opts.startAngle ?? 0;
    const rawEnd     = opts.endAngle ?? startAngle;
    // opts.exactAngle: bez 180° symetrie – ZÁLEŽÍ na skutečné orientaci cíle (dynamit
    // letící naproti k hornímu hráči se musí viditelně otočit o 180°, ne se „srovnat" na 0).
    const endAngle   = opts.exactAngle ? nearestAngle360(startAngle, rawEnd) : nearestCardAngle(startAngle, rawEnd);
    const startScale = opts.startScale ?? opts.scale ?? 0.28;
    const endScale   = opts.endScale ?? opts.scale ?? startScale;
    const delay      = opts.delay || 0;
    const depth      = opts.depth ?? 800;
    const sprite = gameScene.add.image(fromX, fromY, texKey)
        .setScale(startScale).setAngle(startAngle).setDepth(depth).setAlpha(0.95);
    gameScene.tweens.add({
        targets: sprite, x: toX, y: toY,
        duration, delay, ease: 'Power2',
        onComplete: () => holdThenFinish(sprite, opts.holdUntil, () => {
            if (sprite?.active) sprite.destroy();
            if (onComplete) onComplete();
        })
    });
    if (endAngle !== startAngle) {
        gameScene.tweens.add({ targets: sprite, angle: endAngle, duration, delay, ease: 'Power2' });
    }
    if (endScale !== startScale) {
        gameScene.tweens.add({ targets: sprite, scaleX: endScale, scaleY: endScale, duration, delay, ease: 'Power2' });
    }
}

// Letící karta, která se během letu OTOČÍ z rubu na líc (reveal) a zároveň
// plynule naroste z velikosti balíčku (startScale) na velikost karty v ruce
// (endScale) – působí, že "dosedne" do ruky. Sdílený primitiv pro líznutí,
// sejmutí, hokynářství i speciální postavy.
function animateCardFlip(fromX, fromY, toX, toY, backTex, faceTex, opts = {}) {
    if (!gameScene) return null;
    const duration   = opts.duration   ?? 400;
    const startScale = opts.startScale ?? 0.28;
    const endScale   = opts.endScale   ?? 0.4;
    const flip       = opts.flip !== false;   // default: otáčet rub→líc
    const reverse    = opts.reverse === true; // true: otáčet líc→rub (karta se schovává)
    const onComplete = opts.onComplete ?? null;
    // Rotace za letu: karta se plynule dotočí z startAngle na endAngle (bok = ±90°,
    // protější = 180°). Nejkratší cestou při 180° symetrii karty (nearestCardAngle).
    const startAngle = opts.startAngle ?? 0;
    // Překlopená karta končí lícem nahoru → orientace musí sedět (0° ≠ 180°), proto
    // 360° varianta (ne nearestCardAngle, která 0° a 180° zaměňuje → karta vzhůru nohama).
    const endAngle   = nearestAngle360(startAngle, opts.endAngle ?? startAngle);
    // Hrana překlopení („prostorově"): podle orientace, ve které karta patří (seat = větší
    // z |start|,|end|). Svislé karty (bok, ±90°) se skládají po DOLNÍ lokální hraně
    // (originY=1), rovné/protější (0°/180°) po HORNÍ (originY=0). Origin dáme na tu hranu,
    // aby se plocha při flipu složila K NÍ (ne ke středu) → hrana zůstane přišpendlená a
    // druhá půlka karty se k ní „sklopí". Po rotaci to na obrazovce vyjde: já=horní hrana,
    // protější=dolní, vlevo=levá, vpravo=pravá.
    const seatAngle = Math.abs(endAngle) >= Math.abs(startAngle) ? endAngle : startAngle;
    const originY = (Math.abs(seatAngle) % 180 === 90) ? 1 : 0;
    // Při flipu startujeme rubem (otočí se na líc); reverse opačně lícem (otočí na rub);
    // bez flipu rovnou lícem (jen růst). midTex = textura po výměně na hraně.
    const startTex = flip ? (reverse ? faceTex : backTex) : faceTex;
    const midTex   = reverse ? backTex : faceTex;
    const sprite = gameScene.add.image(fromX, fromY, startTex)
        .setDepth(800).setAlpha(0.97).setOrigin(0.5, originY);
    const H = sprite.height || 500;
    // Vektor od STŘEDU karty k hraně-originu (v pixelech) pro danou scale a úhel: podél
    // lokální osy Y (+ = dolů), otočený o angle (rotace vektoru (0,v)).
    const hingeVec = (scale, angleDeg) => {
        const v = (originY - 0.5) * H * scale;
        const rad = angleDeg * Math.PI / 180;
        return { x: -Math.sin(rad) * v, y: Math.cos(rad) * v };
    };
    // Dráhu vede HRANA (origin), ať zůstane přišpendlená; střed karty z ní vychází. from/to
    // jsou STŘEDY (kotvy/sloty), převedeme je na polohu hrany. Cíl ukládáme na sprite kvůli
    // re-targetingu za letu (rychlá líznutí – retargetDrawAnims).
    const hf = hingeVec(startScale, startAngle);
    const ht = hingeVec(endScale, endAngle);
    sprite._flipHingeFrom = { x: fromX + hf.x, y: fromY + hf.y };
    sprite._flipHingeTo   = { x: toX + ht.x,   y: toY + ht.y };
    sprite._retargetTo = (cx, cy) => {
        const h = hingeVec(endScale, endAngle);
        sprite._flipHingeTo = { x: cx + h.x, y: cy + h.y };
    };
    // Rovnou nastav počáteční transformaci (stav pro t=0) – jinak by se sprite první frame,
    // než proběhne první onUpdate, vykreslil na (fromX,fromY) v plné velikosti (scale 1) a
    // problikla by „obří karta" u odesílajícího hráče.
    sprite.setPosition(sprite._flipHingeFrom.x, sprite._flipHingeFrom.y).setAngle(startAngle).setScale(startScale);
    let texSwapped = !flip;
    const holder = { t: 0 };
    sprite._drawPosTween = gameScene.tweens.add({
        targets: holder, t: 1, duration, ease: 'Cubic.easeInOut',
        onUpdate: () => {
            if (!sprite.active) return;
            const t = holder.t;
            const px = sprite._flipHingeFrom.x + (sprite._flipHingeTo.x - sprite._flipHingeFrom.x) * t;
            const py = sprite._flipHingeFrom.y + (sprite._flipHingeTo.y - sprite._flipHingeFrom.y) * t;
            const angle = startAngle + (endAngle - startAngle) * t;
            const scale = startScale + (endScale - startScale) * t;
            // Flip po lokální ose Y: scaleY scale→0 v první půlce (karta se postaví na
            // hranu), na hraně výměna textury, 0→scale ve druhé půlce. Bez flipu jen růst.
            let scaleY = scale;
            if (flip) {
                if (t < 0.5) scaleY = scale * (1 - t * 2);
                else { if (!texSwapped) { sprite.setTexture(midTex); texSwapped = true; } scaleY = scale * (t * 2 - 1); }
            }
            sprite.setPosition(px, py);
            sprite.setAngle(angle);
            sprite.setScale(scale, scaleY);
        },
        onComplete: () => holdThenFinish(sprite, opts.holdUntil, () => {
            // Nejdřív odkryj cílovou kartu (onComplete typicky zruší hide + renderUI), pak
            // teprve zahoď letící sprite – ať pod ním už leží finální karta a neprobliká
            // stará vrchní karta odhozu.
            if (onComplete) onComplete();
            if (sprite?.active) sprite.destroy();
        })
    });
    return sprite;
}

// Sdílená animace karty letící do MOJÍ ruky (líznutí z balíčku/odhozu, krádež z
// ruky soupeře přes Jesse/El Gringo/Paniku, Bart, Suzy, Pedro…). Zacílí na finální
// slot v ruce, kartu po dobu letu v ruce skryje (staging přes App.pendingDrawIds)
// a po dosednutí ji odkryje – proto se rychlá líznutí po sobě objeví postupně.
// opts.faceUp = zdroj je už lícem nahoru (bez otočení). Vrací true, pokud animaci
// převzala (jsem majitel a kartu znám); jinak false → volající animuje rub sám.
// Celkový počet karet, který bude mít ruka po doletu všech aktuálně letících líznutí
// (= karty ve stavu + dosud nedoletělé, které ve stavu ještě nejsou). Stejný počet
// použije board.js pro rozteč, takže cíl animace sedí na finální slot.
function _drawAnimTotal() {
    const myHand = state.players[myIndex].hand;
    const pendingNotInState = [...App.pendingDrawIds].filter(id => !myHand.some(c => c.id === id)).length;
    return myHand.length + pendingNotInState;
}

// Přepočítá cíle všech letících líznutí na aktuální rozteč ruky. Volá se při každém
// novém líznutí – jinak by se první z rychle po sobě líznutých karet animovala na
// rozteč pro menší počet karet a po přerozprostření ruky by „blikla" jinam.
function retargetDrawAnims() {
    if (!App.drawAnims.length || myIndex === null || !state?.players?.[myIndex]) return;
    const total = _drawAnimTotal();
    App.drawAnims.forEach(a => {
        if (!a.sprite?.active || !a.sprite._retargetTo) return;
        // Přednost má PŘESNÁ pozice slotu z board.js (gated karta už je ve stavu);
        // dokud karta ve stavu není (před broadcastem), spočítej odhadem.
        const t = App.gatedSlotPos[a.cardId] || getHandSlotPos(myIndex, a.slotIndex, total);
        if (a._lastX === t.x && a._lastY === t.y) return;   // beze změny → neresetuj tween
        a._lastX = t.x; a._lastY = t.y;
        a.sprite._retargetTo(t.x, t.y);   // přepočte cílovou hranu (onUpdate k ní plynule dotáhne)
    });
}

function animateDrawToMyHand(playerIdx, cardId, fromX, fromY, opts = {}) {
    if (myIndex === null || playerIdx !== myIndex) return false;
    if (cardId === undefined || cardId === null) return false;
    if (!state?.players?.[myIndex]) return false;
    const myHand = state.players[myIndex].hand;
    const ownIdx = myHand.findIndex(c => c.id === cardId);
    const pendingAhead = [...App.pendingDrawIds].filter(id => !myHand.some(c => c.id === id)).length;
    // Slot: pokud karta už ve stavu je (broadcast dorazil dřív než animace), cílíme na
    // její skutečný index; jinak přijde za stávající karty + dosud nedoletělé.
    const slotIndex = ownIdx !== -1 ? ownIdx : myHand.length + pendingAhead;
    App.pendingDrawIds.add(cardId);
    const onDone = () => {
        App.pendingDrawIds.delete(cardId);
        const ai = App.drawAnims.findIndex(a => a.cardId === cardId);
        if (ai !== -1) App.drawAnims.splice(ai, 1);
        if (opts.onComplete) opts.onComplete();
        renderUI();
    };
    const target = getHandSlotPos(myIndex, slotIndex, _drawAnimTotal());
    // Zdroj může být otočený (krádež z ruky/boardu soupeře – Jesse/Panika): startAngle
    // = orientace zdroje, endAngle vždy 0 (moje ruka je dole). Default 0 → líznutí z
    // balíčku/odhozu/hokynářství se nikam netočí (beze změny chování).
    const sprite = animateCardFlip(fromX, fromY, target.x, target.y, 'card_back', getCardTex(cardId),
        { flip: !opts.faceUp, duration: opts.duration, startScale: opts.startScale, onComplete: onDone,
          startAngle: opts.startAngle ?? 0, endAngle: 0 });
    if (sprite) App.drawAnims.push({ cardId, slotIndex, sprite });
    retargetDrawAnims();   // sjednotí rozteč všech letících karet (vč. už letících)
    renderUI();
    return true;
}

function getCardTex(cardId) {
    if (cardId === undefined || cardId === null) return 'card_back';
    return gameScene.textures.exists('card_' + cardId) ? 'card_' + cardId : 'card_back';
}

// ── HOKYNÁŘSTVÍ: cinematika na stole ──────────────────────────────────────────
// Balíčky vyjedou nahoru (STORE_LIFT), pod ně se rozdají karty (flip rub→líc),
// případně se v horní poloze zamíchá. Pozice slotů řeší getStoreSlotPos (positions.js),
// časování musí sedět s bot settle (server/bots.js storeOpenDelayMs).
const STORE_LIFT = 120;   // celý blok (balíčky + řada) výš, do volného místa nad středem
const STORE_DEAL_STAGGER = 190;
const STORE_DEAL_MS = 440;
const STORE_SHUFFLE_MS = 1000;

// Plynulé zvednutí/spuštění obou balíčků. Tween na pomocném objektu + renderUI
// (board.js kreslí balíčky podle App.storePileLiftY).
function animatePileLift(target, onDone) {
    if (!gameScene) { App.storePileLiftY = target; if (onDone) onDone(); return; }
    const holder = { v: App.storePileLiftY || 0 };
    gameScene.tweens.add({
        targets: holder, v: target, duration: 320, ease: 'Cubic.easeInOut',
        onUpdate: () => { App.storePileLiftY = holder.v; renderUI(); },
        onComplete: () => { App.storePileLiftY = target; renderUI(); if (onDone) onDone(); }
    });
}

// Rozdá storeCards[from..to) z balíčku do řady (flip rub→líc, stagger). Po doletu
// poslední zavolá onDone. Sloty jsou gated (App.storeDealIds), board.js je ukáže až po doletu.
function dealStoreCards(cards, from, to, onDone) {
    const indices = [];
    for (let i = from; i < to; i++) if (cards[i]) indices.push(i);
    if (!indices.length) { if (onDone) onDone(); return; }
    const count = cards.length;
    const lift = App.storePileLiftY || 0;
    const deckX = DECK_X, deckY = DECK_Y - lift;
    indices.forEach((i, n) => {
        setTimeout(() => {
            const card = cards[i];
            if (!card) return;
            if (!gameScene) { App.storeDealIds.delete(card.id); return; }
            const slot = getStoreSlotPos(i, count, App.storePileLiftY || 0);
            animateCardFlip(deckX, deckY, slot.x, slot.y, 'card_back', getCardTex(card.id),
                { flip: true, startScale: 0.26, endScale: 0.3, duration: STORE_DEAL_MS,
                  onComplete: () => { App.storeDealIds.delete(card.id); renderUI(); } });
        }, n * STORE_DEAL_STAGGER);
    });
    const total = (indices.length - 1) * STORE_DEAL_STAGGER + STORE_DEAL_MS + 40;
    setTimeout(() => { if (onDone) onDone(); }, total);
}

// Míchací swirl v horní (zvednuté) poloze: card_backy přeletí z odhozu do balíčku.
function playStoreShuffle(onDone) {
    const lift = App.storePileLiftY || 0;
    App.storeShuffleEndAt = Date.now() + STORE_SHUFFLE_MS;
    if (!gameScene) { if (onDone) onDone(); return; }
    const fromX = DISCARD_X, fromY = DISCARD_Y - lift;
    const toX = DECK_X, toY = DECK_Y - lift;
    const N = 12;
    for (let i = 0; i < N; i++) {
        setTimeout(() => {
            if (!gameScene) return;
            const s = gameScene.add.image(fromX, fromY, 'card_back').setScale(0.28).setDepth(820).setAlpha(0.95);
            const midX = (fromX + toX) / 2 + (Math.random() - 0.5) * 160;
            const midY = (fromY + toY) / 2 - 40 - Math.random() * 60;
            gameScene.tweens.add({ targets: s, x: midX, y: midY, duration: 220, ease: 'Sine.easeOut',
                onComplete: () => gameScene.tweens.add({ targets: s, x: toX, y: toY, duration: 220, ease: 'Sine.easeIn',
                    onComplete: () => { if (s.active) s.destroy(); } }) });
        }, Math.floor(i * (STORE_SHUFFLE_MS - 440) / N));
    }
    setTimeout(() => { if (onDone) onDone(); }, STORE_SHUFFLE_MS);
}

// Vstup do fáze STORE: zvednout balíčky, rozdat (případně s mícháním dle režimu).
function startStoreCinematic() {
    if (!state) return;
    const cards = state.storeCards || [];
    const sa = state.storeAnim || { mode: 'none', dealtBefore: cards.length, total: cards.length };
    App.storeShuffleEndAt = 0;
    App.storeDealIds = new Set(cards.filter(c => c).map(c => c.id));   // vše gated → objeví se po doletu
    App.storeLocked = (sa.mode === 'blocking');
    const N = cards.length;
    const k = Math.min(sa.dealtBefore ?? N, N);
    renderUI();
    animatePileLift(STORE_LIFT, () => {
        if (sa.mode === 'blocking') {
            // Nedostatek karet: rozdej zbylé (zamčené) → zamíchej → dorozdej → odemkni.
            dealStoreCards(cards, 0, k, () => {
                playStoreShuffle(() => {
                    dealStoreCards(cards, k, N, () => { App.storeLocked = false; renderUI(); });
                });
            });
        } else if (sa.mode === 'proactive') {
            // Přesně tolik: rozdej vše, pak míchej paralelně (výběr už běží).
            dealStoreCards(cards, 0, N, () => { playStoreShuffle(() => {}); });
        } else {
            dealStoreCards(cards, 0, N, () => {});
        }
    });
}

// Konec hokynářství (STORE → PLAY): balíčky sjedou zpět; u proaktivního míchání
// počká návrat na jeho dokončení.
function endStoreCinematic() {
    App.storeLocked = false;
    App.storeDealIds = new Set();
    const wait = Math.max(0, (App.storeShuffleEndAt || 0) - Date.now());
    setTimeout(() => { animatePileLift(0, () => { App.storeShuffleEndAt = 0; }); }, wait);
}

// ── SEJMUTÍ / REVEAL ─────────────────────────────────────────────────────────
// Délka revealu sejmutí: 450 (balíček→střed: otočení+zvětšení) + 3000 (drží
// odhalená) + 400 (zmenší se a odletí do odhozu). Klient i bot (scheduleBotTick)
// musí mít stejné tempo, ať odhoz/ruka naskočí přesně po doletu.
const CHECK_REVEAL_MS = 3850;
const REVEAL_CX = 960, REVEAL_CY = 470, REVEAL_BIG = 0.7;

// Zvýraznění zkoumané hodnoty/barvy při snímání: přes odkrytou kartu se překryjí marky
// hodnoty+barvy (stejné textury jako zapečené) a pulzují (zvětší se a zpět). Vrací
// { marks, tween } pro úklid, nebo null když karta nemá nové marky (fallback druh) –
// tehdy je hodnota zapečená ve staré kartě a pulz nejde udělat.
function pulseCheckMark(x, y, scale, card) {
    if (!gameScene) return null;
    const vKey = valueMarkKey(card), sKey = suitMarkKey(card);
    if (!vKey || !sKey || !gameScene.textures.exists(vKey) || !gameScene.textures.exists(sKey)) return null;
    const W = CARD_TEX_W, H = CARD_TEX_H, L = MARK_LAYOUT;
    const left = x - (W * scale) / 2, top = y - (H * scale) / 2;   // levý horní roh karty na obrazovce
    const mScale = L.scale * scale;
    // Kotva vlevo dole (origin 0,1) – stejně jako zapečené marky, ať pulz sedí přesně.
    // Barva má DŮLEŽITÝ LEVÝ KRAJ: sedí hned za číslem (šířka čísla + konstantní mezera).
    const val = gameScene.add.image(left + L.valX * scale, top + L.valY * scale, vKey)
        .setOrigin(0, 1).setScale(mScale).setDepth(830);
    const suitX = L.valX + val.width * L.scale + L.gap;           // v prostoru karty
    const suit = gameScene.add.image(left + suitX * scale, top + L.suitY * scale, sKey)
        .setOrigin(0, 1).setScale(mScale).setDepth(830);
    const marks = [val, suit];
    const tween = gameScene.tweens.add({
        targets: marks, scaleX: mScale * 1.45, scaleY: mScale * 1.45,
        duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    return { marks, tween };
}

// Pulzy obou karet Lucky Duke (drží po dobu výběru, uklidí se při odletu do odhozu).
let _luckyPulses = [];
function stopLuckyPulses() {
    _luckyPulses.forEach(p => { if (!p) return; if (p.tween) p.tween.remove(); p.marks.forEach(m => m.destroy()); });
    _luckyPulses = [];
}

// Sejmutí (Dynamit/Vězení/Barel/Jourdonnais): kontrolní karta vyletí z balíčku do
// středu, otočí se rub→líc a zvětší, 3 s drží, pak se zmenší a odletí do odhozu.
function startCheckReveal(check) {
    if (!gameScene || !check?.card) return;
    const faceTex = getCardTex(check.card.id);
    let pulse = null;
    const stopPulse = () => {
        if (!pulse) return;
        if (pulse.tween) pulse.tween.remove();
        pulse.marks.forEach(m => m.destroy());
        pulse = null;
    };
    const sprite = gameScene.add.image(DECK_X, DECK_Y, 'card_back')
        .setScale(0.28).setDepth(820).setAlpha(0.98);
    // 1) balíček → střed: posun + růst + flip rub→líc
    gameScene.tweens.add({ targets: sprite, x: REVEAL_CX, y: REVEAL_CY, duration: 450, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleY: REVEAL_BIG, duration: 450, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleX: 0, duration: 225, ease: 'Sine.easeIn',
        onComplete: () => { if (!sprite.active) return; sprite.setTexture(faceTex);
            gameScene.tweens.add({ targets: sprite, scaleX: REVEAL_BIG, duration: 225, ease: 'Sine.easeOut',
                onComplete: () => { pulse = pulseCheckMark(REVEAL_CX, REVEAL_CY, REVEAL_BIG, check.card); } }); } });
    // 2) po 3 s drhu se zmenší a odletí do odhozu. Sprite po dosednutí podrž na místě,
    // dokud kontrolní karta na vrcholu odhozu není VIDITELNÁ (fáze už není CHECKING, kde ji
    // board.js schovává) – jinak po zániku spritu problikne předchozí vrchní karta odhozu.
    const _checkDiscard = discardTopPos();   // vrch odhozu, ať kontrolní karta dosedne na hromádku
    gameScene.tweens.add({ targets: sprite, x: _checkDiscard.x, y: _checkDiscard.y, scaleX: 0.28, scaleY: 0.28,
        delay: 450 + 3000, duration: 400, ease: 'Cubic.easeIn', onStart: stopPulse,
        onComplete: () => holdThenFinish(sprite, () => {
            // Drž, dokud kontrolní karta není ve stavu odhozu A zároveň skončila fáze
            // CHECKING (board.js ji do té doby navrchu schovává). NEvyžaduj, aby byla
            // úplně navrchu – vyhodnocení (Vězení/Dynamit) hned přidá další kartu NAD
            // ni; kdyby byl predikát vázán na „top", sprite by tu ležel ještě 720 ms a
            // překrýval by čerstvě dosednutou kartu (vězení pak vypadalo „o 1 níž").
            const dp = state?.deck?.discardPile;
            return !!dp?.some(c => c.id === check.card.id) &&
                   !(state.phase === 'CHECKING' && state.currentCheck?.active);
        }, () => { stopPulse(); if (sprite.active) sprite.destroy(); }) });
}

// Black Jack: 2. líznutá karta se zkoumá (stejný reveal jako sejmutí), ale pak
// místo do odhozu letí do RUKY. Majitel ji zná (zůstává lícem, v ruce skrytá do
// doletu); ostatní vidí, jak se otočí zpět na rub a letí k Black Jackovi.
function startBlackJackReveal(ds) {
    if (!gameScene || !ds?.blackJackCard || !state) return;
    const card = ds.blackJackCard;
    const playerIdx = ds.playerIdx;
    const faceTex = getCardTex(card.id);
    const isOwner = playerIdx === myIndex && myIndex !== null;
    const hand = state.players[playerIdx]?.hand ?? [];
    const handTarget = getHandSlotPos(playerIdx, hand.length, hand.length + 1);
    const endScale = isOwner ? 0.4 : 0.3;
    const sprite = gameScene.add.image(DECK_X, DECK_Y, 'card_back')
        .setScale(0.28).setDepth(820).setAlpha(0.98);
    // 1) balíček → střed (karta je veřejná – všichni vidí líc)
    gameScene.tweens.add({ targets: sprite, x: REVEAL_CX, y: REVEAL_CY, duration: 450, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleY: REVEAL_BIG, duration: 450, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleX: 0, duration: 225, ease: 'Sine.easeIn',
        onComplete: () => { if (!sprite.active) return; sprite.setTexture(faceTex);
            gameScene.tweens.add({ targets: sprite, scaleX: REVEAL_BIG, duration: 225, ease: 'Sine.easeOut' }); } });
    if (isOwner) App.pendingDrawIds.add(card.id);   // skryj v ruce do doletu (staging)
    const flyDelay = 450 + 3000;
    // 2) po 3 s letí do ruky Black Jacka
    gameScene.tweens.add({ targets: sprite, x: handTarget.x, y: handTarget.y, scaleY: endScale,
        delay: flyDelay, duration: 420, ease: 'Cubic.easeIn',
        onComplete: () => { if (sprite.active) sprite.destroy();
            if (isOwner) {
                App.pendingDrawIds.delete(card.id);
                // Karta se objeví PŘESNĚ při dosednutí: pokud broadcast s vyhodnocením
                // ještě nedorazil, vlož ji do ruky optimisticky (další broadcast stav
                // stejně přepíše, takže žádný duplikát).
                const h = state?.players?.[myIndex]?.hand;
                if (h && !h.some(c => c.id === card.id)) h.push(card);
                renderUI();
            } else {
                // Ostatní: karta (rub) se v jeho ruce objeví TAKÉ přesně při dosednutí spritu,
                // ať mezi koncem letu a (opožděným) room_update není prázdné místo (probliknutí).
                const h = state?.players?.[playerIdx]?.hand;
                if (h && !h.some(c => c.id === card.id)) { h.push(card); renderUI(); }
            } } });
    if (isOwner) {
        gameScene.tweens.add({ targets: sprite, scaleX: endScale, delay: flyDelay, duration: 420, ease: 'Cubic.easeIn' });
    } else {
        // ostatní: karta míří do vějíře ruky soupeře → za letu se dotočí do jeho
        // orientace (bok = ±90°, protější = 180°), jako běžné líznutí do ruky.
        const seatAngle = _kitSpecAngleFor(playerIdx);
        if (seatAngle) gameScene.tweens.add({ targets: sprite, angle: seatAngle, delay: flyDelay, duration: 420, ease: 'Cubic.easeIn' });
        // ...a překlopí se zpět na rub (míří do skryté ruky).
        gameScene.tweens.add({ targets: sprite, scaleX: 0, delay: flyDelay, duration: 210, ease: 'Sine.easeIn',
            onComplete: () => { if (!sprite.active) return; sprite.setTexture('card_back');
                gameScene.tweens.add({ targets: sprite, scaleX: endScale, duration: 210, ease: 'Sine.easeOut' }); } });
    }
}

// ── KIT CARLSON / LUCKY DUKE: rozdání karet do panelu + následné lety ──────────
// Karty letí z balíčku do panelu a překlopí se rub→líc (jako reveal sejmutí).
// Sloty se v board.js skryjí (kitDealIds/luckyDealIds), dokud karta nedoletí.

// Kit Carlson (vidí jen Kit): 3 karty z balíčku do řady panelu.
function startKitCarlsonDeal() {
    if (!gameScene || !state?.kitCarlsonState) return;
    const revealed = state.kitCarlsonState.revealed || [];
    const spacing = 260, startX = 960 - spacing, slotY = 480, slotScale = 0.6;
    App.kitDealIds = new Set(revealed.map(c => c.id));
    App.kitRevealCards = revealed.map((c, i) => ({ id: c.id, x: startX + i * spacing, y: slotY }));
    App.kitPicked = [];
    renderUI();
    revealed.forEach((card, i) => {
        const sx = startX + i * spacing;
        setTimeout(() => {
            if (!gameScene) return;
            animateCardFlip(DECK_X, DECK_Y, sx, slotY, 'card_back', getCardTex(card.id),
                { flip: true, startScale: 0.28, endScale: slotScale, duration: 420,
                  onComplete: () => { App.kitDealIds.delete(card.id); renderUI(); } });
        }, i * 160);
    });
}

// Kit výsledek (Kit player): vybrané karty už odletěly do ruky při kliknutí (viz
// pick handler v board.js). Tady doletí jen NEvybraná zpět do balíčku.
function playKitCarlsonResult() {
    const reveal = App.kitRevealCards || [];
    const picked = App.kitPicked || [];
    reveal.forEach(rc => {
        if (picked.includes(rc.id)) return;
        // Nevybraná: překlopí se líc→rub a zmenší při návratu do balíčku (na jeho vrch).
        const _deckTop = deckTopPos();
        animateCardFlip(rc.x, rc.y, _deckTop.x, _deckTop.y, 'card_back', getCardTex(rc.id),
            { flip: true, reverse: true, startScale: 0.6, endScale: 0.28, duration: 440 });
    });
    App.kitRevealCards = null;
    App.kitPicked = [];
}

// ── KIT CARLSON – pohled OSTATNÍCH (ne Kit) ───────────────────────────────────
// Kit si potají líže 3 karty; ostatní místo toho uvidí 3 RUBOVÉ karty přiletět z
// balíčku k Němu a zaparkovat mezi ním a středem. Při výběru odlétají do jeho ruky,
// poslední nevybraná zpět do balíčku. Na boku se karty otáčí dle orientace Kita.
function _kitSpecAngleFor(kitIdx) {
    const view = myIndex === null ? 0 : myIndex;
    if (kitIdx === view) return 0;
    const total = state.players.length;
    const diff = (kitIdx - view + total) % total;
    const side = getOpponentAnchors(total)[diff - 1]?.side;
    return side === 'left' ? 90 : side === 'right' ? -90 : side === 'top' ? 180 : 0;
}

function _clearKitSpecSprites() {
    (App.kitSpecParked || []).forEach(p => { if (p?.sprite?.active) p.sprite.destroy(); });
    App.kitSpecParked = [];
    App.kitSpecPicksDone = 0;
    App.oppHandHideCount = {};   // žádné rozletěné Kitovy karty → nic neskrývej
}

function startKitCarlsonDealSpectator() {
    if (!gameScene || !state) return;
    _clearKitSpecSprites();
    const kitIdx = state.currentPlayerIndex;
    const n = state.kitCarlsonState?.revealed?.length || 3;
    const hand = getPlayerHandPos(kitIdx);
    const CX = 960, CY = 540;
    const dx = CX - hand.x, dy = CY - hand.y;
    const dlen = Math.hypot(dx, dy) || 1;
    const ux = dx / dlen, uy = dy / dlen;       // jednotkový směr ke středu
    const OFF = 175;                             // jak daleko od Kita do středu karty parkují
    const ax = hand.x + ux * OFF, ay = hand.y + uy * OFF;
    const perpx = -uy, perpy = ux;              // kolmice – podél ní se vějíř roztáhne
    // Menší karty (na úrovni ostatních karet soupeřů), aby nepůsobily jako obří reveal;
    // menší i rozteč, ať se vějíř mezi postavou a středem nerozjede přes celou obrazovku.
    const spread = 66, scale = 0.3;
    const angle = _kitSpecAngleFor(kitIdx);
    App.kitSpecKitIdx = kitIdx;
    App.kitSpecPicksDone = 0;
    App.kitSpecParked = [];
    for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * spread;
        const tx = ax + perpx * off, ty = ay + perpy * off;
        const sp = gameScene.add.image(DECK_X, DECK_Y, 'card_back')
            .setScale(0.28).setAngle(0).setDepth(805 + i);
        App.kitSpecParked.push({ sprite: sp, x: tx, y: ty, angle });
        setTimeout(() => {
            if (!sp.active) return;
            gameScene.tweens.add({ targets: sp, x: tx, y: ty, scaleX: scale, scaleY: scale,
                angle, duration: 420, ease: 'Cubic.easeOut' });
        }, i * 160);
    }
}

// Mezivýběr (1. výběr, fáze stále KIT_CARLSON): nově vybrané karty odešli do ruky Kita.
// Necháme aspoň 1 parkující kartu pro závěrečný let (poslední výběr + návrat do balíčku).
function advanceKitCarlsonSpectator() {
    if (!gameScene || !state) return;
    const picked = state.kitCarlsonState?.pickedIds?.length || 0;
    while (App.kitSpecPicksDone < picked && App.kitSpecParked.length > 1) {
        _kitSpecFlyToHand(App.kitSpecParked.shift());
        App.kitSpecPicksDone++;
    }
}

// Konec Kit Carlsona pro ostatní: zbylé parkující karty – všechny krom poslední do
// ruky Kita (vybrané), poslední zpět do balíčku (nevybraná).
function finishKitCarlsonSpectator() {
    const parked = App.kitSpecParked || [];
    // Kit si nechává 2 karty: kolik jich ještě nedoletělo do ruky (zbytek = nevybrané
    // do balíčku). Robustní i pro málo karet v balíčku (revealed < 3).
    const toHand = Math.max(0, 2 - (App.kitSpecPicksDone || 0));
    parked.forEach((slot, i) => {
        if (i < toHand) _kitSpecFlyToHand(slot, i * 120, i);
        else _kitSpecFlyToDeck(slot, i * 120);
    });
    App.kitSpecParked = [];
    App.kitSpecPicksDone = 0;
}

// Vybraná karta odletí do ruky Kita. Ctí „předchozí pravidla": míří na KONCOVÝ slot
// jeho vějíře (ne obecný střed ruky), zmenší se na velikost jeho karet a otočí se do
// jeho orientace. slotBump posune cíl u víc karet za sebou, ať nedosednou na sebe.
function _kitSpecFlyToHand(slot, delay = 0, slotBump = 0) {
    const sp = slot?.sprite;
    if (!gameScene || !sp?.active) { if (sp?.active) sp.destroy(); return; }
    const kitIdx = App.kitSpecKitIdx ?? state?.currentPlayerIndex ?? 0;
    // Vybraná karta už je v Kitově ruce ze serveru (room_update). Drž ji ale skrytou,
    // dokud sem animace nedosedne – ať se v ruce neobjeví HNED, ale až po doletu.
    App.oppHandHideCount = App.oppHandHideCount || {};
    App.oppHandHideCount[kitIdx] = (App.oppHandHideCount[kitIdx] || 0) + 1;
    const handLen = state?.players?.[kitIdx]?.hand?.length ?? 0;
    const visLen = Math.max(0, handLen - App.oppHandHideCount[kitIdx]);   // viditelné karty (bez letících)
    const total = handLen + slotBump + 1;
    const to = getHandSlotPos(kitIdx, visLen + slotBump, total);           // dosedne na koncový VIDITELNÝ slot
    const scale = kitIdx === (myIndex === null ? 0 : myIndex) ? 0.36 : 0.27;
    const angle = _kitSpecAngleFor(kitIdx);
    renderUI();   // skryj nově přibylou kartu v ruce hned (než dosedne sprite)
    gameScene.tweens.add({ targets: sp, x: to.x, y: to.y, scaleX: scale, scaleY: scale,
        angle, delay, duration: 380, ease: 'Cubic.easeIn',
        onComplete: () => {
            if (sp.active) sp.destroy();
            // Sprite dosedl → kartu v ruce odkryj (sniž skrytý počet).
            if (App.oppHandHideCount) App.oppHandHideCount[kitIdx] = Math.max(0, (App.oppHandHideCount[kitIdx] || 1) - 1);
            renderUI();
        } });
}

function _kitSpecFlyToDeck(slot, delay = 0) {
    const sp = slot?.sprite;
    if (!gameScene || !sp?.active) { if (sp?.active) sp.destroy(); return; }
    const _deckTop = deckTopPos();
    gameScene.tweens.add({ targets: sp, x: _deckTop.x, y: _deckTop.y, scaleX: 0.28, scaleY: 0.28,
        angle: 0, delay, duration: 380, ease: 'Cubic.easeIn',
        onComplete: () => { if (sp.active) sp.destroy(); } });
}

// Lucky Duke (vidí všichni): 2 karty z balíčku do panelu.
function startLuckyDukeDeal() {
    if (!gameScene || !state?.luckyDukeState) return;
    const cards = state.luckyDukeState.cards || [];
    const slotY = 480, slotScale = 0.65;
    const xOf = i => i === 0 ? 660 : 1260;
    App.luckyDealIds = new Set(cards.map(c => c.id));
    App.luckyRevealCards = cards.map((c, i) => ({ id: c.id, x: xOf(i), y: slotY }));
    stopLuckyPulses();
    renderUI();
    cards.forEach((card, i) => {
        setTimeout(() => {
            if (!gameScene) return;
            animateCardFlip(DECK_X, DECK_Y, xOf(i), slotY, 'card_back', getCardTex(card.id),
                { flip: true, startScale: 0.28, endScale: slotScale, duration: 420,
                  onComplete: () => { App.luckyDealIds.delete(card.id); renderUI();
                      // zvýrazni zkoumanou hodnotu/barvu po dobu výběru
                      _luckyPulses.push(pulseCheckMark(xOf(i), slotY, slotScale, card)); } });
        }, i * 160);
    });
}

// Lucky výsledek: obě karty letí do odhozu (v odhozu skryté do doletu). Vybraná
// (logika ji do odhozu vloží PRVNÍ → nižší index) letí hned, NEvybraná o chvilku
// později. Výsledek checku (dynamit/vězení) animuje server zvlášť a klient ho
// zdrží, aby dosedl jako poslední (viz card_animation, fáze LUCKY_DUKE).
function playLuckyDukeResult() {
    stopLuckyPulses();
    const reveal = App.luckyRevealCards || [];
    const dp = state?.deck?.discardPile || [];
    const posOf = id => { const k = dp.findIndex(c => c.id === id); return k === -1 ? 1e9 : k; };
    // Vybraná = vložená do odhozu dřív (nižší index); poletí jako první.
    const ordered = [...reveal].sort((a, b) => posOf(a.id) - posOf(b.id));
    reveal.forEach(rc => App.discardFlyHideIds.add(rc.id));
    if (reveal.length) renderUI();
    // Sprite se vytvoří hned (sedí na svém slotu), NEvybraná (i=1) se rozletí později
    // přes opts.delay – takže tam vydrží, dokud nezačne její vlastní animace.
    const _luckyDiscard = discardTopPos();   // vrch odhozu, ať karty dosednou na hromádku
    ordered.forEach((rc, i) => {
        animateCard(rc.x, rc.y, _luckyDiscard.x, _luckyDiscard.y, getCardTex(rc.id), 400, () => {
            App.discardFlyHideIds.delete(rc.id); renderUI();
        }, { startScale: 0.65, endScale: 0.3, delay: i * 300 });
    });
    App.luckyRevealCards = null;
}




// ── DEBUG: galerie karet ──────────────────────────────────────────────────────
// Mřížka všech karet (miniatury z reálných textur card_<id>) + náhled vybrané karty
// ve 100 % (scale 1.0 = nativní velikost baked textury, CARD_TEX_W×H). Slouží k
// vizuální kontrole nového vykreslování (art + marky). Otevírá debug tlačítko.
function showCardGallery() {
    if (!gameScene) return;
    if (gameScene._gallery) { closeCardGallery(); return; }   // toggle
    const g = gameScene.add.group();
    gameScene._gallery = g;
    // Galerie: základní karty + karty rozšíření (Dodge City), ať jdou zkontrolovat všechny.
    const _base = gameScene.cache.json.get('cards_data') || [];
    const _dodge = gameScene.cache.json.get('cards_dodge_city_data') || [];
    const data = (_base.length || _dodge.length) ? _base.concat(_dodge) : (App.allCardsData || []);

    const bg = gameScene.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.92)
        .setDepth(3000).setInteractive();
    bg.on('pointerdown', closeCardGallery);   // klik mimo kartu = zavřít
    g.add(bg);

    const close = gameScene.add.text(1890, 18, '✕ Zavřít',
        { fontSize: '22px', color: '#fff', backgroundColor: '#600', padding: { x: 12, y: 6 } })
        .setOrigin(1, 0).setDepth(3003).setInteractive({ useHandCursor: true });
    close.on('pointerdown', closeCardGallery);
    g.add(close);

    // Náhled 100 % vpravo
    const previewX = 1330, previewY = 500;
    let big = null, label = null;
    const showBig = (card) => {
        if (big) big.destroy();
        if (label) label.destroy();
        big = gameScene.add.image(previewX, previewY, getCardTex(card.id)).setScale(1).setDepth(3001);
        g.add(big);
        const suit = { HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣', SPADES: '♠' }[card.suit] || card.suit;
        const usesNew = artKey(card) && gameScene.textures.exists(artKey(card))
            && valueMarkKey(card) && gameScene.textures.exists(valueMarkKey(card))
            && suitMarkKey(card) && gameScene.textures.exists(suitMarkKey(card));
        label = gameScene.add.text(previewX, previewY + CARD_TEX_H / 2 + 14,
            `${card.name}  ${card.value}${suit}   (id ${card.id}, art: ${card.art})\n` +
            (usesNew ? 'nová grafika (art + marky)' : 'FALLBACK – stará karta (chybí art/marky)'),
            { fontSize: '20px', color: usesNew ? '#8f8' : '#fb6', align: 'center',
              backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 10, y: 6 } })
            .setOrigin(0.5, 0).setDepth(3003);
        g.add(label);
    };

    // Mřížka miniatur vlevo
    const cols = 8, thumbScale = 0.135;
    const tw = CARD_TEX_W * thumbScale, th = CARD_TEX_H * thumbScale;
    const gx = 40, gy = 70, padX = 8, padY = 8;
    g.add(gameScene.add.text(gx, 30, 'Klikni na kartu → náhled 100 %',
        { fontSize: '18px', color: '#ccc' }).setDepth(3003));
    data.forEach((card, i) => {
        const cx = gx + (i % cols) * (tw + padX);
        const cy = gy + Math.floor(i / cols) * (th + padY);
        const t = gameScene.add.image(cx, cy, getCardTex(card.id))
            .setOrigin(0, 0).setScale(thumbScale).setDepth(3001)
            .setInteractive({ useHandCursor: true });
        t.on('pointerover', () => t.setTint(0xffff88));
        t.on('pointerout', () => t.clearTint());
        t.on('pointerdown', () => showBig(card));
        g.add(t);
    });

    if (data.length) showBig(data[0]);
}
function closeCardGallery() {
    if (gameScene && gameScene._gallery) {
        gameScene._gallery.destroy(true);   // zničí i děti (sprity/texty/rect)
        gameScene._gallery = null;
    }
}

// Chat systém je v chat.js (načteno po game.js)

// ── ZÁKLADNÍ FUNKCE PHASERU ──────────────────────────────────────────────

function preload() {
    // Pozadí ve 4K: primárně malý WebP (~0,7 MB), PNG (~8 MB) zůstává jako fallback.
    // Při paralelním stahování všech textur občas soubor skončí loaderror → zůstala by
    // holá barva plátna. Proto ho při chybě párkrát znovu zařadíme do fronty: 1. pokus
    // spadne na PNG, další přidají cache-buster (obejde nakešovanou chybu). Retry běží,
    // dokud loader v preloadu ještě jede, takže se stihne než doběhne create().
    let bgRetries = 0;
    const bgSources = ['assets/background.webp', 'assets/background.png'];
    this.load.on('loaderror', function (file) {
        if (file.key === 'background' && bgRetries < 4) {
            bgRetries++;
            const src = bgSources[Math.min(bgRetries, bgSources.length - 1)] + '?retry=' + bgRetries;
            clog('warn', 'Pozadí se nenačetlo, pokus č. ' + bgRetries, { src });
            this.load.image('background', src);
            return;
        }
        clog('warn', 'Chybí textura, použije se placeholder', { src: file.src });
    }, this);

    this.load.image('background', bgSources[0]);
    this.load.image('logo', 'assets/logo.png');
    this.load.image('card_back', 'assets/other_cards/playing_card_back.png');
    this.load.image('placeholder', 'assets/card_placeholder.png');
    this.load.image('colt_.45', 'assets/other_cards/colt_.45.png');

    // Staré hotové karty jako FALLBACK (legacy_<id>). buildCardTextures je v create()
    // zapeče do card_<id>, pokud pro daný druh chybí nový art/marky.
    for (let i = 0; i <= 79; i++) {
        let paddedId = i.toString().padStart(3, '0');
        this.load.image('legacy_' + i, `assets/playing_cards/${paddedId}.png`);
    }

    // Nové vykreslování: data karet + art druhů (assets/card_art/<art>.png) + marky
    // hodnoty/barvy (assets/card_marks/*.png). Art/marky se doplní do fronty, jakmile
    // je JSON načtený (chybějící soubory jen zalogují loaderror a spadnou na legacy).
    this.load.json('cards_data', 'cards.json');
    this.load.once('filecomplete-json-cards_data', (key, type, data) => {
        // Soubory: card_art/<art>.png, card_marks/<hodnota>.png (Q.png, 10.png…) a
        // card_marks/<barva>.png (hearts.png…). Texturové klíče drží prefix (art_/value_/suit_).
        distinctArtKeys(data).forEach(a => this.load.image('art_' + a, `assets/card_art/${a}.png`));
        ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].forEach(v =>
            this.load.image('value_' + v, `assets/card_marks/${v}.png`));
        ['hearts', 'diamonds', 'clubs', 'spades'].forEach(s =>
            this.load.image('suit_' + s, `assets/card_marks/${s}.png`));
    });

    // Rozšíření Dodge City: vlastní data + art z podsložky card_art/dodge_city/ + marka
    // symbolu býka (card_marks/dodge_city.png). Art se sdíleným slugem se základem (bang…)
    // se nenačítá znovu – klíč art_<slug> už drží základní karta (duplicitní klíč Phaser
    // přeskočí), takže „reskin" karty rozšíření použijí základní art + domalovaný býk.
    this.load.json('cards_dodge_city_data', 'cards.dodge_city.json');
    this.load.image('mark_dodge_city', 'assets/card_marks/dodge_city.png');
    this.load.once('filecomplete-json-cards_dodge_city_data', (key, type, data) => {
        distinctArtKeys(data).forEach(a => this.load.image('art_' + a, `assets/card_art/dodge_city/${a}.png`));
    });

    this.load.json('characters_data', 'characters.json');
    for (let i = 0; i <= 30; i++) {   // 0–15 základ, 16–30 Dodge City (chybějící → placeholder)
        let paddedId = i.toString().padStart(3, '0');
        this.load.image('char_' + i, `assets/characters/${paddedId}.png`);
    }

    this.load.image('lives', 'assets/other_cards/lives.png');
    this.load.image('role_card_back', 'assets/other_cards/role_card_back.png');
    this.load.image('role_000', 'assets/roles/000.png');
    this.load.image('role_001', 'assets/roles/001.png');
    this.load.image('role_002', 'assets/roles/002.png');
    this.load.image('role_003', 'assets/roles/003.png');
    this.load.image('sheriff_star', 'assets/other_cards/sheriff_star.png');
}

// Složí textury card_<id> z art druhu + marek hodnoty/barvy; když nový art/marky pro
// druh chybí, zapeče starou kartu legacy_<id> (fallback). Volá se JEDNOU v create(),
// před prvním renderUI. Výsledná textura má rozměr CARD_TEX_W×H (teď = současné velikosti).
function buildCardTextures(scene) {
    const data = scene.cache.json.get('cards_data');
    if (!data) { clog('warn', 'cards_data nenačteno – karty zůstávají na legacy_<id>'); return; }
    // Karty rozšíření (Dodge City) – zapečou se stejně, navíc dostanou symbol býka a
    // (dokud chybí art) placeholder s domalovaným názvem/hodnotou/barvou.
    const dodge = scene.cache.json.get('cards_dodge_city_data') || [];
    const allData = data.concat(dodge);
    const W = CARD_TEX_W, H = CARD_TEX_H, L = MARK_LAYOUT;
    scene._cardRTs = scene._cardRTs || [];
    const drawMarks = (rt, vKey, sKey) => {
        // marky do levého dolního rohu (hodnota, vedle ní barva); origin(0,1) = kotva vlevo dole
        if (vKey && scene.textures.exists(vKey)) {
            const val = scene.make.image({ key: vKey, add: false }).setOrigin(0, 1).setScale(L.scale);
            rt.draw(val, L.valX, L.valY);
            if (sKey && scene.textures.exists(sKey)) {
                const suit = scene.make.image({ key: sKey, add: false }).setOrigin(0, 1).setScale(L.scale);
                rt.draw(suit, L.valX + val.displayWidth + L.gap, L.suitY);
                suit.destroy();
            }
            val.destroy();
        }
    };
    for (const card of allData) {
        const aKey = artKey(card), vKey = valueMarkKey(card), sKey = suitMarkKey(card);
        const hasNew = aKey && vKey && sKey &&
            scene.textures.exists(aKey) && scene.textures.exists(vKey) && scene.textures.exists(sKey);
        const legacyKey = 'legacy_' + card.id;
        const hasLegacy = scene.textures.exists(legacyKey);
        const isExp = !!card.exp;
        // Základní karty beze změny: bez artu i legacy přeskoč (getCardTex spadne na card_back).
        // Karty rozšíření vždy sestavíme (art nebo placeholder), ať jsou čitelné.
        if (!hasNew && !hasLegacy && !isExp) continue;
        if (scene.textures.exists('card_' + card.id)) scene.textures.remove('card_' + card.id);
        const rt = scene.make.renderTexture({ width: W, height: H }, false);
        if (hasNew) {
            const art = scene.make.image({ key: aKey, add: false }).setOrigin(0, 0);
            art.setDisplaySize(W, H);
            rt.draw(art, 0, 0); art.destroy();
            drawMarks(rt, vKey, sKey);
        } else if (hasLegacy) {
            const leg = scene.make.image({ key: legacyKey, add: false }).setOrigin(0, 0);
            leg.setDisplaySize(W, H);
            rt.draw(leg, 0, 0); leg.destroy();
        } else {
            // Karta rozšíření bez artu → placeholder + domalovaný název (nahoře) + marky.
            const ph = scene.make.image({ key: 'placeholder', add: false }).setOrigin(0, 0);
            ph.setDisplaySize(W, H);
            rt.draw(ph, 0, 0); ph.destroy();
            const nameTxt = scene.make.text({ x: 0, y: 0, add: false, text: card.name || '', style: {
                fontFamily: 'Arial', fontSize: '30px', color: '#1a1a1a', fontStyle: 'bold',
                align: 'center', wordWrap: { width: W * 0.86 }
            } }).setOrigin(0.5, 0);
            rt.draw(nameTxt, W / 2, H * 0.06); nameTxt.destroy();
            drawMarks(rt, vKey, sKey);
        }
        // Symbol rozšíření (býk) do pravého horního rohu.
        if (isExp && scene.textures.exists('mark_dodge_city')) {
            const bull = scene.make.image({ key: 'mark_dodge_city', add: false }).setOrigin(1, 0).setScale(L.bullScale);
            rt.draw(bull, L.bullX, L.bullY); bull.destroy();
        }
        rt.saveTexture('card_' + card.id);   // getCardTex/getTex beze změny
        scene._cardRTs.push(rt);             // RT drží texturu → nedestruovat
    }
    // legacy karty jsou teď zapečené v card_<id> → uvolni je z paměti
    for (const card of allData) {
        if (scene.textures.exists('legacy_' + card.id)) scene.textures.remove('legacy_' + card.id);
    }
}

// Portréty postav rozšíření (016–030) dodané ve 2× rozlišení (650×1000) srovnáme na
// standardních 325×500 – přerenderujeme je do menší canvas textury pod stejným klíčem,
// takže veškeré vykreslování (stejné scale jako u 000–015) funguje beze změny.
function normalizeCharTextures(scene) {
    for (let i = 0; i <= 30; i++) {
        const key = 'char_' + i;
        if (!scene.textures.exists(key)) continue;
        const src = scene.textures.get(key).getSourceImage();
        if (!src || src.width <= 400) continue;   // už v normální velikosti
        const w = Math.round(src.width / 2);
        const h = Math.round(src.height / 2);
        scene.textures.remove(key);
        const canvasTex = scene.textures.createCanvas(key, w, h);
        canvasTex.context.drawImage(src, 0, 0, w, h);
        canvasTex.refresh();
    }
}

function create() {
    gameScene = this;

    normalizeCharTextures(this);
    buildCardTextures(this);

    // Kdyby se pozadí ani po retry nenačetlo, nevkládej „rozbitou" texturu (zelený
    // placeholder) – radši nech tmavou výplň, přes kterou stejně leží bgScrim.
    if (this.textures.exists('background')) {
        let bg = this.add.image(960, 540, 'background');
        bg.setDisplaySize(1920, 1080);
    } else {
        this.add.rectangle(960, 540, 1920, 1080, 0x2a1c10);
    }

    // Ztmavovací závoj přes pozadí kvůli čitelnosti (obrázek pozadí je místy světlý/rušný
    // a text nad ním nešel přečíst). Persistentní – NENÍ v cardsSprites, takže ho renderUI
    // nemaže; jen mu tam měníme průhlednost (menu/výsledky tmavší, herní stůl jemnější).
    gameScene.bgScrim = this.add.rectangle(960, 540, 1920, 1080, 0x0e0b14).setAlpha(0.55);

    gameScene.cardsSprites = this.add.group();
    // Separatni skupina pro intro animace - necisti se pri renderUI
    gameScene.introSprites = this.add.group();

    // Hover vyhodnocuj KAŽDÝ snímek, ne jen při pohybu myši. renderUI stůl překresluje
    // (staré sprity zničí, nové vytvoří); s výchozím „poll on move" by po cizí akci
    // zvýraznění karty pod nehybným kurzorem zmizelo, dokud uživatel nepohne myší. Takto
    // Phaser znovu vyvolá pointerover na nově vytvořeném spritu i bez pohybu.
    this.input.setPollAlways();

    document.addEventListener('fullscreenchange', () => { if (gameScene) renderUI(); });

    renderUI();

    // Fonty (Oswald) se načítají z CDN asynchronně. Immediate-mode render mohl padnout
    // na systémový fallback; po dokončení načtení překreslíme správným fontem.
    if (document.fonts && document.fonts.load) {
        Promise.all([
            document.fonts.load("700 24px 'Oswald'"),
            document.fonts.load("600 24px 'Oswald'"),
            document.fonts.load("400 20px 'Oswald'"),
        ]).then(() => { if (gameScene) renderUI(); }).catch(() => {});
    }
}

function update() {
    _tickVeraPortraits();
    _tickCardZoom();
}

// Vera Custer: portrét u jejího místa cyklicky střídá kopírovanou postavu a vlastní
// Veru, ať všichni vidí (a poznají), koho zrovna kopíruje – bez zabírání dalšího místa.
//   ~8 s: kopírovaná postava, jemně bliká (velmi slabý zelený nádech) = „zvýrazněná,
//         ale není to ona" (žádná průhlednost ani zvětšování – jen barva)
//   ~2 s: čistá Vera Custer bez zvýraznění (obnoví se původní obarvení, pokud bylo)
// Mezi oběma stavy PLYNULÝ přechod – vodorovné překlopení (scaleX 1→0→1), textura se
// vymění v půlce (když je karta „na hraně"), takže žádný tvrdý skok.
// Řízeno hodinami (Date.now) → stejná fáze pro každého i po překreslení. Portréty
// registruje renderGameBoard (App.veraPortraits); mrtvé/překreslené sprity přeskoč.
function _tickVeraPortraits() {
    const list = App.veraPortraits;
    if (!list || !list.length) return;
    const CYCLE = 10000, COPY_MS = 8000, TR = 480, H = TR / 2;   // TR = délka překlopení
    const t = Date.now() % CYCLE;

    // Velmi jemný pulzující zelený nádech: bílá ↔ sotva znatelná zelená (červený a
    // modrý kanál klesnou jen málo, zelený drží 0xff).
    const s = Math.abs(Math.sin(t / 300));
    const rb = Math.round(0xff - s * (0xff - 0xdd));   // 255 → 221 (slabý nádech)
    const greenTint = (rb << 16) | (0xff << 8) | rb;

    // Urči zobrazený stav + faktor překlopení (flip). Přechody jsou na hranicích
    // t=8000 (kopie→Vera) a t=0≡10000 (Vera→kopie), okno ±H.
    let showCopy, flip = 1;
    const d8 = t - COPY_MS;                              // vzdálenost k hranici 8000
    const d0 = t < CYCLE / 2 ? t : t - CYCLE;            // znaménková vzdálenost k 0/10000
    if (Math.abs(d8) < H) {
        const p = (d8 + H) / TR;                         // 0..1
        flip = Math.abs(Math.cos(p * Math.PI));
        showCopy = p < 0.5;                             // z kopie do Very
    } else if (Math.abs(d0) < H) {
        const p = (d0 + H) / TR;
        flip = Math.abs(Math.cos(p * Math.PI));
        showCopy = p >= 0.5;                            // z Very do kopie
    } else {
        showCopy = t < COPY_MS;
    }

    for (const v of list) {
        const sp = v.sprite;
        if (!sp || !sp.active) continue;
        const tex = showCopy ? v.copyTex : v.selfTex;
        if (tex && sp.texture.key !== tex) sp.setTexture(tex);
        if (showCopy) sp.setTint(greenTint);
        else if (v.baseTint != null) sp.setTint(v.baseTint);
        else sp.clearTint();
        sp.scaleX = v.baseScaleX * flip;
    }
}

// getPlayerPosition je v positions.js

// POZOR: klientský `state` je prostý JSON objekt z payload.gameState (NE instance
// GameState), takže nemá metody. Proto používáme čisté funkce computeDistance/computeCanHit
// z core/distance.js (načteno před game.js), které počítají nad prostým objektem {players}.

const RoleImages = {
    "Sheriff": "role_000",
    "Outlaw": "role_001",
    "Renegade": "role_002",
    "Deputy": "role_003"
};



// Helper pro přidání prvků do modálních overlayů (depth nad reshufflem)
function mAdd(obj, depth = 201) {
    if (obj && obj.setDepth) obj.setDepth(depth);
    gameScene.cardsSprites.add(obj);
    return obj;
}

function renderUI() {
    if (!gameScene) return;

    const isSpectator = myIndex === null && !!state;

    gameScene.cardsSprites.clear(true, true);
    // POZN.: zoom karty tu ZÁMĚRNĚ nerušíme. renderUI běží i při cizí akci a tvrdý
    // stopCardZoom() by resetoval odpočet/zvýraznění karty pod nehybným kurzorem. Zoom je
    // klíčovaný identitou karty (_zoomKey) a uklízí ho _tickCardZoom() z update() smyčky,
    // jakmile pod kurzorem přestane být karta s daným klíčem (změna obrazovky, zmizení karty).

    // Závoj pozadí jen v menu/lobby/výběru/výsledcích (čitelnost textu). U herního
    // stolu je pozadí klasické bez ztmavení (závoj se úplně vypne).
    {
        const inLobbyOrMenu = !roomState || roomState.roomPhase === 'lobby' || roomState.roomPhase === 'next_lobby';
        const showingBoard = !inLobbyOrMenu && !!state && !state.winner
            && state.phase !== 'MENU' && state.phase !== 'CHARACTER_SELECT'
            && !_introActive() && !App.introExpected;
        if (gameScene.bgScrim) gameScene.bgScrim.setAlpha(showingBoard ? 0 : 0.55);
    }

    showOrHideChat(!!(roomState && state && state.phase !== 'MENU' && state.phase !== 'CHARACTER_SELECT') || _introActive() || !!App.introExpected);

    if (!roomState || (roomState.roomPhase !== 'lobby' && roomState.roomPhase !== 'next_lobby')) {
        cleanupTextInputs?.();
    }

    {
        const isFs = !!document.fullscreenElement;
        if (!isFs) {
            let fsBtn = gameScene.add.text(1900, 20, '⛶ FS',
                { fontFamily: THEME.fontUI, fontSize: '22px', color: '#9a9088', backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 10, y: 6 } })
                .setOrigin(1, 0).setDepth(1000).setInteractive({ useHandCursor: true });
            fsBtn.on('pointerover', () => fsBtn.setColor('#e0b23c'));
            fsBtn.on('pointerout', () => fsBtn.setColor('#9a9088'));
            fsBtn.on('pointerdown', () => document.documentElement.requestFullscreen().catch(() => {}));
            gameScene.cardsSprites.add(fsBtn);
        }
    }

    if (state?.isDebug && state.phase !== "MENU" && state.phase !== "CHARACTER_SELECT" && state.players) {
        // Přepínač hráčů – sjednocený vzhled s herními tlačítky (themeButton + toggle styl).
        // Řada začíná až za rohovým „Ukončit hru" (30..240), ať se nepřekrývají.
        const btnY = 30, btnH = 48, btnW = 104, gap = 8, startX = 260;
        state.players.forEach((p, i) => {
            const isActive = i === myIndex;
            const bx = startX + i * (btnW + gap);
            const { bg } = themeButton(gameScene, bx, btnY, btnW, btnH,
                `P${i + 1}: ${p.name.replace('Debug', '')}`,
                { origin: [0, 0], ...themeToggleStyle(isActive), fontSize: '15px',
                  onClick: isActive ? undefined : () => { App.debugViewAs = i; myIndex = i; renderUI(); } });
            bg.setDepth(1000);
        });
    }

    // ── MENU / LOBBY ──────────────────────────────────────────────────────────
    if (!roomState) {
        renderMenuScreen(App.menuScreen || 'main');
        return;
    }

    const rPhase = roomState.roomPhase;
    if (rPhase === 'lobby' || rPhase === 'next_lobby') {
        cleanupTextInputs?.();
        renderLobbyScreen();
        return;
    }

    if (!state) return;
    if (state.phase !== "MENU" && !state.players) return;

    // ── INTRO (mícání, rozdávání rolí/postav/karet) ────────
    if (_introActive() || App.introExpected) {
        if (_introActive()) {
            renderIntroScene();
        } else {
            // Intro brzy dorazi (50ms delay na serveru) - zobraz prazdnou obrazovku
            const bg2 = gameScene.textures.exists('background')
                ? gameScene.add.image(960, 540, 'background').setDepth(0)
                : gameScene.add.rectangle(960, 540, 1920, 1080, 0x2a1c10).setDepth(0);
            gameScene.cardsSprites.add(bg2);
        }
        return;
    }

    if (App.spectating) {
        // Hra jen botů (jsem její zakladatel = leader): řekni serveru, ať ji
        // rozpustí. Navigaci pak provede echo 'go_to_menu' (→ hlavní menu).
        const { bg: specBack } = themeButton(gameScene, 30, 30, 260, 52, '◀  Opustit sledování', {
            origin: [0, 0], fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030,
            stroke: THEME.color.dangerNum, fontSize: '20px',
            onClick: () => {
                if (roomState && roomState.leaderSocketId === socket.id) {
                    socket.emit('go_to_menu');
                    return;
                }
                roomState = null; state = null; myIndex = null;
                App.spectating = false;
                App.menuScreen = 'spectate_list';
                renderUI();
            },
        });
        specBack.setDepth(500);
    }

    // Lídrovské „Ukončit hru" jen pro hrajícího lídra – ne pro diváka (ten už má
    // „Opustit sledování"; navíc cancel_game divákovi botí hry stejně nefunguje).
    if (roomState && roomState.leaderSocketId === socket.id && !state?.winner && !App.spectating) {
        const { bg: cancelBtn } = themeButton(gameScene, 30, 30, 210, 48, '✕  Ukončit hru', {
            origin: [0, 0], fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030,
            stroke: THEME.color.dangerNum, fontSize: '18px',
            onClick: () => {
                if (confirm('Opravdu chceš ukončit hru? Všichni hráči se vrátí do menu.')) {
                    socket.emit('cancel_game');
                }
            },
        });
        cancelBtn.setDepth(500);
    }

    if (state?.winner) { renderWinnerScreen(); return; }

    if (state.phase === "CHARACTER_SELECT") { renderCharacterSelectScreen(); return; }

    renderGameBoard();
    // Dodge City – Vera Custer volí kopírovanou postavu (overlay přes desku).
    if (state.phase === "VERA_COPY") renderVeraCopyOverlay();
    // board.js právě zapsal přesné pozice rezervovaných slotů → zaměř na ně letící líznutí.
    retargetDrawAnims();
    // Nové sprity vznikly bez zvýraznění → hned nasaď hover na kartu pod kurzorem (bez čekání
    // na pohyb myší / další snímek), ať zvýraznění po cizí akci neprobliká.
    _reapplyPointerHover();
}
