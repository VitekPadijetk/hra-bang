// Velikost herního „jeviště" (design px) podle SKUTEČNÉHO poměru stran displeje.
//
// Hra je nakreslená na pevné plátno 1920×1080 a Phaser ji jen proporcionálně zmenší
// (Scale.FIT). Jenže skoro nic nemá poměr přesně 16:9 – telefon na šířku bývá 19,5:9
// až 21:9 a okno prohlížeče na PC je kvůli liště taky širší než vyšší. Zbytek plochy
// zůstával jako mrtvé pruhy po stranách (na iPhonu 14 skoro 18 % šířky).
//
// Řešení: základní rozměr 1920×1080 zůstává SOUŘADNICOVOU SOUSTAVOU, ale plátno se
// natáhne do skutečného poměru – roste jen ten směr, kde je místo navíc. Kamera se
// posune o půlku přírůstku (game.js applyStage), takže souřadnice 0…1920 / 0…1080
// leží přesně uprostřed a nic se nehne. Přírůstek vyleze jako záporné souřadnice
// vlevo/nahoře a souřadnice nad 1920/1080 vpravo/dole – tam se roztáhne pozadí a
// (ve fázi C) i mobilní rozložení desky.
//
// Měřítko obsahu se tím NEMĚNÍ: při poměru širším než 16:9 je FIT stejně omezený
// výškou, takže min(vw/w, vh/h) vyjde identicky jako dnes. Přibude jen viditelná plocha.
const STAGE_BASE_W = 1920, STAGE_BASE_H = 1080;
// Strop, aby na ultraširokém monitoru (nebo v podivně tvarovaném okně) jeviště
// nenarostlo do absurdna – za ním se zase letterboxuje jako dřív.
const STAGE_MAX_W = 2560, STAGE_MAX_H = 1440;

// vw/vh = skutečná plocha pro plátno v CSS px (window.innerWidth/Height).
// Vrací { w, h, dx, dy, left, right, top, bottom } – vše v design px.
// dx/dy = přírůstek na JEDNU stranu (posun kamery), left/right/top/bottom = okraje
// jeviště ve staré souřadnicové soustavě (0…1920 / 0…1080 je pořád uprostřed).
function computeStage(vw, vh) {
    let w = Number(vw), h = Number(vh);
    if (!(w > 0) || !(h > 0)) { w = STAGE_BASE_W; h = STAGE_BASE_H; }
    const aspect = w / h;
    const base = STAGE_BASE_W / STAGE_BASE_H;
    let W = STAGE_BASE_W, H = STAGE_BASE_H;
    // Zaokrouhluje se DOLŮ: jeviště tak nikdy nepřeroste skutečný poměr stran a měřítko
    // obsahu zůstane přesně takové, jaké je dnes (min(vw/w, vh/h) = vh/1080).
    if (aspect > base)      W = Math.min(STAGE_MAX_W, Math.floor(STAGE_BASE_H * aspect));
    else if (aspect < base) H = Math.min(STAGE_MAX_H, Math.floor(STAGE_BASE_W / aspect));
    // Sudé rozměry: půlka přírůstku jde do posunu kamery a půlpixelový posun
    // rozmazává text i marky karet.
    W -= W % 2; H -= H % 2;
    const dx = (W - STAGE_BASE_W) / 2, dy = (H - STAGE_BASE_H) / 2;
    return {
        w: W, h: H, dx, dy,
        // dx ? -dx : 0 – bez toho by z -0 vylezlo „-0" v logu i v porovnáních.
        left: dx ? -dx : 0, right: STAGE_BASE_W + dx,
        top: dy ? -dy : 0, bottom: STAGE_BASE_H + dy,
    };
}

// Jeviště přesně 16:9 – fallback, dokud klient nespočítá to skutečné (App.stage).
const STAGE_BASE = computeStage(STAGE_BASE_W, STAGE_BASE_H);

function currentStage() {
    return (typeof App !== 'undefined' && App && App.stage) || STAGE_BASE;
}
function stageW()      { return currentStage().w; }
function stageH()      { return currentStage().h; }
function stageLeft()   { return currentStage().left; }
function stageRight()  { return currentStage().right; }
function stageTop()    { return currentStage().top; }
function stageBottom() { return currentStage().bottom; }

// Velikost obrázku pozadí, aby jeviště VYPLNIL a přitom si držel poměr stran
// (jako CSS background-size: cover) – přetéká ven, nikdy nenechá prázdný pruh.
function stageCoverSize(stage) {
    const s = stage || currentStage();
    const k = Math.max(s.w / STAGE_BASE_W, s.h / STAGE_BASE_H);
    return { w: STAGE_BASE_W * k, h: STAGE_BASE_H * k };
}

// ── Profil rozložení ─────────────────────────────────────────────────────────
// Všechna „magická čísla" rozložení desky na jednom místě. Dosud byla rozsypaná
// jako literály po view/board.js, positions.js a game.js, přičemž se musela shodovat
// (positions.js zrcadlí board.js kvůli zacílení animací). Profil je udělá společnými.
//
// Desktopové hodnoty jsou PŘESNĚ ty dnešní – PC se tím pádem nemění (pojistkou je
// test/layout.test.js). Mobilní profil je zatím jejich kopie: liší se teprve
// kompaktním rozložením (soupeři v jedné řadě nahoře), které přijde v další fázi.
const LAYOUT_DESKTOP = {
    name: 'desktop',
    // 'ring' = dnešní okruh soupeřů kolem stolu (left/top/right)
    oppMode: 'ring',
    centerX: 960,

    // měřítka karet
    scaleMe: 0.36, scaleOpp: 0.27, scaleDeck: 0.3,

    // moje zóna (drawMyArea + getHandSlotPos/getBoardCardPos)
    livesX: 1050, myBaseY: 970, roleOffX: -200,
    handOffX: 160, handEndX: 1860, handMaxSpacing: 117,
    boardGap: 10, boardMaxPerRow: 6,
    myHandAnchorX: 1450,
    btnRowOffY: -170, btnH: 62,

    // divák: spodní hráč se kreslí vystředěně a v měřítku soupeře
    specScale: 0.27, specLivesY: 900, specHandY: 1065,

    // soupeři – kotvy (null = základní tabulka OPPONENT_ANCHORS v positions.js),
    // odsazení ruky od portrétu a rozteč vějíře rubů
    anchors: null,
    oppGap: 10, oppHandOff: 1.1, oppFanFrac: 0.35, oppFanMax: 36, oppFanSpan: 3.5,

    // balíčky uprostřed stolu + řada hokynářství
    deckOffX: 90, pileY: 540, hnPileX: 1170, hnActiveX: 1280,
    storeRowOffY: 188, storeSpacing: 120,
};
const LAYOUT_MOBILE = { ...LAYOUT_DESKTOP, name: 'mobile' };

const LAYOUT_PROFILES = { desktop: LAYOUT_DESKTOP, mobile: LAYOUT_MOBILE };

function getLayout(name) {
    return LAYOUT_PROFILES[name] || LAYOUT_DESKTOP;
}
// Profil, který právě platí. Mimo prohlížeč (testy, server) vždy desktopový.
function currentLayout() {
    return (typeof App !== 'undefined' && App && App.layout) || LAYOUT_DESKTOP;
}

// Který profil zapnout. Čistá funkce, ať jde otestovat bez prohlížeče.
//   query  – ?ui=mobile / ?ui=desktop (testování mobilního režimu na PC)
//   stored – localStorage.bangUiMode: 'big' | 'normal' (ruční přepínač hráče)
//   width  – šířka plátna v CSS px, coarse – dotykové ovládání
function pickLayoutProfile(opts) {
    const o = opts || {};
    if (o.query === 'mobile' || o.query === 'desktop') return o.query;
    if (o.stored === 'big') return 'mobile';
    if (o.stored === 'normal') return 'desktop';
    const w = Number(o.width);
    if (!(w > 0)) return 'desktop';
    if (w < 820) return 'mobile';
    if (o.coarse && w < 1100) return 'mobile';
    return 'desktop';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STAGE_BASE_W, STAGE_BASE_H, STAGE_MAX_W, STAGE_MAX_H,
        computeStage, stageCoverSize,
        LAYOUT_PROFILES, getLayout, currentLayout, pickLayoutProfile,
    };
}
