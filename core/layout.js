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
// Rozměr artu karty v design px (nezmenšený); měřítka profilu se počítají z něj.
const CARD_ART_W = 325, CARD_ART_H = 500;

const LAYOUT_DESKTOP = {
    name: 'desktop',
    // 'ring' = dnešní okruh soupeřů kolem stolu (left/top/right)
    oppMode: 'ring',
    centerX: 960,

    // měřítka karet
    scaleMe: 0.36, scaleOpp: 0.27, scaleDeck: 0.3,

    // moje zóna (drawMyArea + getHandSlotPos/getBoardCardPos)
    // handStartX/handEndX/boardMaxPerRow/btnEndX jsou hodnoty pro jeviště 16:9; na širším
    // je přepočítá resolveLayout podle *Margin (odsazení od okraje jeviště).
    livesX: 1050, myBaseY: 970, roleOffX: -200,
    myNameOffY: 145, myStatusOffY: 178, myHintOffY: 185,
    handStartX: 1210, handStartMargin: null,
    handEndX: 1860, handEndMargin: 60, handMaxSpacing: 117,
    // 'left' = ruka roste zleva od handStartX (dnešní stav; pás je úzký, takže se
    // stejně skoro vždy vyplní). Mobilní pás je přes celou šířku → 'center'.
    handAlign: 'left',
    // Ruka má na mobilu vlastní řadu pod stolem a větší karty; na desktopu leží
    // v jedné řadě se stolem (handY = myBaseY, scaleHand = scaleMe) jako dosud.
    handY: 970, scaleHand: 0.36,
    boardGap: 10, boardMaxPerRow: 6,
    // Pás vyložených karet (boardBand): kolik ŘAD smí pás mít. Řady rostou vždy směrem
    // k balíčkům uprostřed stolu (u soupeře dolů/dovnitř, u mě vzhůru), takže je to
    // jediná pojistka, aby na ně karty nikdy nedosáhly. Karty nad kapacitu pásu se
    // nepřelijí do další řady – zmenší se rozestup uvnitř řady.
    oppBoardRows: 2, oppBoardPerRow: 3, myBoardRows: 2,
    myHandAnchorX: 1450,
    btnEndX: 820, btnEndY: 800, btnAbilX: 1320, btnAbilY: 800, btnMargin: null, btnH: 62,

    // divák: spodní hráč se kreslí vystředěně a v měřítku soupeře
    specScale: 0.27, specLivesY: 900, specHandY: 1065,

    // soupeři – kotvy (null = základní tabulka OPPONENT_ANCHORS v positions.js),
    // odsazení krajních kotev od okraje jeviště (stretchAnchors),
    // odsazení ruky od portrétu a rozteč vějíře rubů
    anchors: null, oppEdgeMargin: 180,
    // Měřítko karet soupeře podle POČTU soupeřů (jinak platí scaleOpp). Při 7 soupeřích
    // (8 hráčů) stojí nahoře tři skupiny s roztečí 430 px, takže se karty musí o kousek
    // zmenšit, aby na sebe nedosáhly. Ptát se přes oppScale(), ne na scaleOpp napřímo.
    oppScaleByCount: { 7: 0.25 },
    oppGap: 10, oppHandOff: 1.1, oppFanFrac: 0.35, oppFanMax: 36, oppFanSpan: 3.5,

    // balíčky uprostřed stolu + řada hokynářství
    deckOffX: 90, pileY: 540, hnPileX: 1170, hnActiveX: 1280,
    storeRowOffY: 188, storeSpacing: 120, storeLift: 120,
    // Kam s DRUHÝM balíčkem událostí (Fistful of Cards), když se hrají obě rozšíření:
    // 'vertical' = nad High Noon (ten se o půl rozteče posune dolů), 'horizontal' =
    // zrcadlově vlevo od dobíracího balíčku. Viz eventPileSlots níže.
    eventStack: 'vertical', eventRowGap: 170,
    ffPileX: 750, ffActiveX: 640,
};
const LAYOUT_MOBILE = {
    ...LAYOUT_DESKTOP, name: 'mobile',
    // 'compact' = soupeři v jedné řadě nahoře (viz compactMetrics níže). Spodek sloupce
    // vychází na oppTop + oppBandH, a pod ním leží balíčky: prázdný odhoz má vrch na
    // 465, plný balíček (80 karet se odsazuje o 0,125 px) až na 455. Sloupec proto končí
    // na 440 – 15 px pod ním je vidět mezera i tehdy, když je balíček nejvyšší.
    oppMode: 'compact', oppTop: 12, oppBandH: 428,

    // Moje zóna je rozdělená na DVĚ řady: stůl (myBaseY) a pod ním ruka (handY) přes
    // celou šířku. Stůl si nechává desktopové měřítko – zvětšuje se hlavně ruka, do
    // které se klika. Karta životů je vpravo (x 1500), aby portrét při 5 životech
    // (sahá 195 px vzhůru) minul jak balíčky uprostřed, tak pásmo soupeřů nahoře.
    livesX: 1500, myBaseY: 750, roleOffX: -160,
    myNameOffY: -135, myStatusOffY: -102, myHintOffY: -170,
    // Odsazení = půlka karty (325×0.46/2 = 74,75) s rezervou, ať krajní karta v ruce
    // nevyčuhuje z jeviště – handStartX/handEndX jsou STŘEDY krajních slotů.
    handStartX: 85, handStartMargin: 85,
    handEndX: 1835, handEndMargin: 85,
    handY: 962, scaleHand: 0.46, handMaxSpacing: 149.5,
    // Pás ruky jde přes celou šířku jeviště, takže pár karet by se krčilo v levém
    // rohu – ruka se v něm proto vystředí (a s ní i myHandAnchorX).
    handAlign: 'center',
    // Moje zóna je na mobilu vejš (myBaseY 750) a druhá řada karet by spadla přímo na
    // balíčky (y 470–650 vs. 465–615), takže má pás JEDNU řadu. Prakticky se to nepozná:
    // do řady se vejde 10 karet a víc jich nikdo na stole nemá.
    boardMaxPerRow: 10, myBoardRows: 1, myHandAnchorX: 960,
    // Akční tlačítka ve dvou řadách u pravého okraje, vedle karty životů.
    btnEndX: 1740, btnEndY: 690, btnAbilX: 1740, btnAbilY: 786, btnMargin: 180, btnH: 76,
    // Řada hokynářství o kus výš, ať nesahá na můj stůl (ten je na mobilu vejš).
    storeRowOffY: 150,
    // Dva balíčky událostí nad sebou se na mobil nevejdou: mezi spodkem kompaktní řady
    // soupeřů (440) a vrchem mojí zóny (660) je pásmo 220 px a dvě řady karet potřebují
    // 320. Fistful proto leží zrcadlově vlevo od dobíracího balíčku.
    eventStack: 'horizontal',
};

const LAYOUT_PROFILES = { desktop: LAYOUT_DESKTOP, mobile: LAYOUT_MOBILE };

function getLayout(name) {
    return LAYOUT_PROFILES[name] || LAYOUT_DESKTOP;
}

// ── Dopočet profilu na konkrétní jeviště ─────────────────────────────────────
// Profil nese rozložení pro jeviště 16:9. Na širším displeji (telefon na šířku, okno
// prohlížeče mimo fullscreen) je navíc plocha po stranách – co se má „lepit" na okraj,
// se proto musí odvodit ze SKUTEČNÉ šířky, ne z pevných 1920.

// Kolik vyložených karet se vejde do jedné řady mého stolu. Rostou doleva od karty role,
// takže je omezuje levý okraj jeviště; na 16:9 z toho vyjde dnešních 6.
function boardRowLimit(L, stage) {
    const st = stage || currentStage();
    const cardW = CARD_ART_W * L.scaleMe;
    const step = cardW + L.boardGap;
    const roleX = L.livesX + L.roleOffX;
    return Math.max(1, Math.floor((roleX - cardW / 2 - st.left) / step));
}

// Rozložení MOJÍ ruky ve vodorovném pásu handStartX…handEndX (to jsou STŘEDY krajních
// slotů). Jediný zdroj pravdy pro renderer (drawMyArea), zacílení animací (positions.js)
// i intro – ty se dřív musely shodovat ručně. Vrací začátek a rozteč, ne pole pozic,
// protože board.js si jede vlastní forEach přes ruku.
function myHandRow(L, count) {
    const P = L || LAYOUT_DESKTOP;
    const k = Math.max(1, count);
    const width = P.handEndX - P.handStartX;
    const spacing = Math.min(P.handMaxSpacing, width / k);
    if (P.handAlign !== 'center') return { startX: P.handStartX, spacing, width };
    // Rozpětí je vždy < width (spacing ≤ width/k), takže vystředěná ruka z pásu nevyleze
    // ani při plném počtu karet – jen se v něm symetricky posadí.
    return { startX: P.handStartX + (width - (k - 1) * spacing) / 2, spacing, width };
}
function myHandSlotX(L, slotIndex, count) {
    const r = myHandRow(L, count);
    return r.startX + slotIndex * r.spacing;
}

// ── Pás vyložených karet ─────────────────────────────────────────────────────
// Vyložené karty (výzbroj + modré + zelené, u vyřazeného i karta role) se sázely po
// `perRow` do řady a řady rostly BEZ STROPU. U horního soupeře rostou dolů, u mě vzhůru –
// tedy vždy směrem k balíčkům uprostřed stolu. Horní soupeř tak od 7. karty ležel na
// balíčku (řada 2 sahá na y 507, vrch plného balíčku je 455) a v Dodge City je 7–10 karet
// na stole běžné.
//
// Pás má proto pevný počet slotů (`rows × perRow`) a jeho PŮDORYS SE NIKDY NEMĚNÍ. Karty
// nad kapacitu se nepřelijí do další řady – zmenší se rozestup uvnitř řady (stejný princip
// jako compactBoardStep na mobilu). Dvě řady tak zůstanou vidět vždy.
//
// Jediný zdroj pravdy pro renderer (view/board.js) i zacílení animací (positions.js).
// cardExtent = rozměr karty PODÉL řady (u soupeře vlevo/vpravo je řada svislá, takže je to
// šířka artu; u horního soupeře a u mě vodorovná, taky šířka artu – jen jinak otočená).
function boardBand(count, rows, perRow, cardExtent, gap) {
    const r = Math.max(1, Math.floor(rows) || 1);
    const p = Math.max(1, Math.floor(perRow) || 1);
    const k = Math.max(1, Math.floor(count) || 1);
    const full = cardExtent + gap;
    if (k <= r * p) return { rows: r, perRow: p, step: full };
    // Do řady se vejde ceil(k/r) karet; rozpětí řady zůstává jako u `p` karet, takže
    // step = (p−1)·full / (inRow−1) < full (inRow > p, jinak bychom tu nebyli).
    const inRow = Math.ceil(k / r);
    return { rows: r, perRow: inRow, step: (p - 1) * full / (inRow - 1) };
}

// Slot karty v pásu. `row` roste směrem od hráče (k balíčkům), `col` podél řady.
function boardSlot(idx, band) {
    const p = Math.max(1, band.perRow);
    return { row: Math.min(band.rows - 1, Math.floor(idx / p)), col: idx % p };
}

// Krajní soupeři se „přilepí" na okraj jeviště: kotvy se vodorovně roztáhnou tak, aby
// levá/pravá zůstaly stejně daleko od OKRAJE (oppEdgeMargin) jako dnes od kraje plátna
// a prostřední se mezi ně rovnoměrně rozestoupily. Střed (960) zůstává středem.
// Na 16:9 vrací původní pole beze změny (žádná alokace, žádný posun).
function stretchAnchors(row, L, stage) {
    const st = stage || currentStage();
    if (!row || !row.length || st.w === STAGE_BASE_W) return row || [];
    const m = (L || LAYOUT_DESKTOP).oppEdgeMargin;
    const inner = STAGE_BASE_W - 2 * m;
    if (!(inner > 0)) return row;
    const k = (st.w - 2 * m) / inner;
    return row.map(a => ({ ...a, x: Math.round(st.left + m + (a.x - m) * k) }));
}

// ── Kompaktní řada soupeřů (mobilní profil) ──────────────────────────────────
// Soupeři nesedí kolem stolu, ale stojí v jedné řadě nahoře – jeden sloupec na
// soupeře. Uvolní to oba boky i spodek pro moji zónu a hlavně dá vyloženým kartám
// soupeřů vlastní řadu (dnes jsou namačkané u okraje plátna).
//
//   ┌──────── colW ─────────┐
//   │ [životy+portrét ▶]    │  řada A: karta životů OTOČENÁ (jako soupeř vlevo),
//   │ 🂠🂠🂠                  │  řada H: vějíř rubů ruky (menší, ale pořád karty)
//   │        Franta         │  jméno + ⏳ stav (řádky rezervované vždy)
//   │ [c1][c2][c3]          │  vyložené karty – jedna řada, od 4. s překryvem
//   └───────────────────────┘
//
// Měřítko se odvozuje ze ŠÍŘKY sloupce (aby řada vyložených karet sloupec přesně
// vyplnila) a stropí se VÝŠKOU pásma. Řada karet je vždy jedna: druhá by přetekla
// na balíčky, a překryv od 4. karty je čitelnější než o čtvrtinu menší karty.
const COMPACT = {
    pad: 40,          // odsazení celé řady od okraje jeviště
    colPad: 8,        // vnitřní okraj sloupce
    gap: 8,           // mezera mezi vyloženými kartami
    rowGap: 8,        // mezera mezi řadami uvnitř sloupce
    nameH: 30, statusH: 26,
    // minScale je PODLAHA (Math.max), takže při 7 soupeřích (8 hráčů) na jevišti 1920 px
    // vyšroubovala měřítko nahoru na 0,24, jenže do sloupce 262,9 px se řada tří karet
    // v téhle velikosti nevejde (potřebuje 266) a přetékala k sousedovi. Na 0,22 se
    // podlaha uplatní až hluboko za reálnými počty; pro 1–6 soupeřů je to no-op (tam
    // vychází šířkové měřítko 0,28 a víc).
    maxColW: 560, minScale: 0.22, maxScale: 0.38,
    perRow: 3,        // kolik vyložených karet se vejde vedle sebe bez překryvu
    fanScale: 0.46,   // měřítko rubu v ruce vůči kartě soupeře
    fanFrac: 0.35, fanMax: 26,   // rozteč vějíře (jako oppFanFrac/oppFanMax u okruhu)
};

// Rozměry kompaktní řady pro daný počet soupeřů. Čistý výpočet – volá ho renderer
// (view/board.js) i zacílení animací (positions.js), takže se nemůžou rozejít.
function compactMetrics(oppCount, L, stage) {
    const st = stage || currentStage();
    const P = L || LAYOUT_DESKTOP;
    const C = COMPACT;
    const n = Math.max(1, Math.floor(oppCount) || 1);
    const colW = Math.min(C.maxColW, (st.w - 2 * C.pad) / n);
    const sW = (colW - 2 * C.colPad - (C.perRow - 1) * C.gap) / (C.perRow * CARD_ART_W);
    // Na jevišti vyšším než 16:9 (úzké okno) je nahoře plocha navíc – st.top je záporné.
    const bandH = (P.oppBandH || 435) - st.top;
    const sH = (bandH - (3 * C.rowGap + C.nameH + C.statusH)) /
               (CARD_ART_W + CARD_ART_H * C.fanScale + CARD_ART_H);
    const scale = Math.max(C.minScale, Math.min(C.maxScale, sW, sH));
    return {
        n, colW, scale,
        // Sloupce se vejdou-li s rezervou (málo soupeřů), řada se vystředí.
        startX: st.left + (st.w - n * colW) / 2,
        top: st.top + (P.oppTop || 16),
        cardW: CARD_ART_W * scale,
        cardH: CARD_ART_H * scale,
        fanScale: C.fanScale * scale,
    };
}

// Kotva soupeře = STŘED jeho karty životů (stejný význam jako u okruhu), aby se
// zbytek kódu (portrét po nábojích, hvězda, animace) choval jako u strany 'left'.
function compactAnchors(oppCount, L, stage) {
    const m = compactMetrics(oppCount, L, stage);
    const out = [];
    for (let i = 0; i < m.n; i++) {
        out.push({
            x: m.startX + i * m.colW + COMPACT.colPad + m.cardH / 2,
            y: m.top + m.cardW / 2,
            side: 'compact',
        });
    }
    return out;
}

// Levý okraj sloupce, ve kterém kotva leží (z ní se odvozuje všechno ostatní).
function compactColLeft(anchor, m) { return anchor.x - COMPACT.colPad - m.cardH / 2; }
function compactColCenter(anchor, m) { return compactColLeft(anchor, m) + m.colW / 2; }

// Rozestup vyložených karet: do `perRow` se vejdou vedle sebe, od další se zmenšuje,
// aby řada nevylezla ze sloupce (nesmí zasáhnout souseda ani balíčky pod sebou).
function compactBoardStep(count, m) {
    const k = Math.max(1, count);
    if (k < 2) return 0;
    const avail = m.colW - 2 * COMPACT.colPad - m.cardW;
    return Math.min(m.cardW + COMPACT.gap, avail / (k - 1));
}
function compactBoardPos(anchor, idx, count, m) {
    const C = COMPACT;
    return {
        x: compactColLeft(anchor, m) + C.colPad + m.cardW / 2 + idx * compactBoardStep(count, m),
        y: anchor.y + m.cardW / 2 + 3 * C.rowGap + CARD_ART_H * m.fanScale
           + C.nameH + C.statusH + m.cardH / 2,
    };
}

// Vějíř rubů ruky – pořád skutečné karty, jen menší (žádné číslo místo nich).
function compactHandPos(anchor, slot, count, m) {
    const C = COMPACT;
    const k = Math.max(1, count);
    const cw = CARD_ART_W * m.fanScale;
    const avail = m.colW - 2 * C.colPad - cw;
    const step = k > 1 ? Math.min(cw * C.fanFrac, C.fanMax, avail / (k - 1)) : 0;
    return {
        x: compactColLeft(anchor, m) + C.colPad + cw / 2 + slot * step,
        y: anchor.y + m.cardW / 2 + C.rowGap + CARD_ART_H * m.fanScale / 2,
    };
}

// Horní okraj jmenovky (text má origin 0.5, 0); ⏳ stav sedí o nameH níž.
function compactNameY(anchor, m) {
    return anchor.y + m.cardW / 2 + 2 * COMPACT.rowGap + CARD_ART_H * m.fanScale;
}

// Měřítko, ve kterém leží karty soupeře. U okruhu pevné z profilu, u kompaktní řady
// dopočítané ze šířky sloupce – ptát se přes tohle, ne na L.scaleOpp napřímo.
function oppScale(L, oppCount, stage) {
    const P = L || LAYOUT_DESKTOP;
    if (P.oppMode !== 'compact') {
        const byCount = P.oppScaleByCount && P.oppScaleByCount[oppCount];
        return byCount || P.scaleOpp;
    }
    return compactMetrics(oppCount, P, stage).scale;
}

// Měřítko karty v RUCE hráče. U okruhu je shodné s vyloženými kartami (proto se dosud
// nerozlišovalo), u kompaktní řady je vějíř rubů menší – jinak by se sloupec nevešel.
// Letící karta musí na hand slot dosednout v TOMHLE měřítku, ne v oppScale.
function handCardScale(L, oppCount, isSelf, stage) {
    const P = L || LAYOUT_DESKTOP;
    if (isSelf) return P.scaleHand || P.scaleMe;
    if (P.oppMode !== 'compact') return oppScale(P, oppCount, stage);
    return compactMetrics(oppCount, P, stage).fanScale;
}

// Profil dopočítaný na dané jeviště. Na 16:9 vrací TÝŽ objekt (identita), takže PC ve
// fullscreenu je pixelově dnešní stav. Volá se z applyStage (game.js), výsledek jde do
// App.layout → currentLayout(), ze kterého kreslí view/board.js i positions.js.
function resolveLayout(profile, stage) {
    const L = profile || LAYOUT_DESKTOP;
    const st = stage || currentStage();
    if (st.w === STAGE_BASE_W) return L;
    const out = {
        ...L,
        handEndX: st.right - L.handEndMargin,
        boardMaxPerRow: boardRowLimit(L, st),
    };
    // Co se na mobilu lepí na okraj: začátek ruky (jde přes celou šířku) a sloupec
    // akčních tlačítek. Na desktopu jsou *Margin null → zůstávají pevné hodnoty.
    if (L.handStartMargin != null) out.handStartX = st.left + L.handStartMargin;
    if (L.btnMargin != null) { out.btnEndX = st.right - L.btnMargin; out.btnAbilX = st.right - L.btnMargin; }
    return out;
}
// ── Balíčky událostí (High Noon, A Fistful of Cards) ─────────────────────────
// Kde na stole leží rub balíčku a hromádka odkrytých karet. Pozice ZÁVISÍ na tom, která
// rozšíření se zrovna hrají, takže to nejsou konstanty: hraje-li se jen jedno, sedí na
// klasickém místě vpravo od odhozu (dnešní stav High Noonu). Hrají-li se obě, srovnají
// se na desktopu nad sebe (Fistful nahoře, High Noon o půl rozteče níž), na mobilu se
// místo toho Fistful zrcadlí doleva od dobíracího balíčku – svislé pásmo mezi kompaktní
// řadou soupeřů a mojí zónou má jen 220 px a dvě řady karet potřebují 320.
// Vrací i `stacked`, podle kterého se při hokynářství sloupce zvednou o řadu víc
// (jinak by na spodku platné karty ležela řada rozdaných karet).
function eventPileSlots(L, hnOn, ffOn) {
    const classic = { deckX: L.hnPileX, activeX: L.hnActiveX, y: L.pileY };
    if (!hnOn || !ffOn) {
        return { hn: hnOn ? classic : null, ff: ffOn ? classic : null, stacked: false };
    }
    if (L.eventStack === 'horizontal') {
        return { hn: classic, ff: { deckX: L.ffPileX, activeX: L.ffActiveX, y: L.pileY }, stacked: false };
    }
    const half = L.eventRowGap / 2;
    return {
        hn: { ...classic, y: L.pileY + half },
        ff: { ...classic, y: L.pileY - half },
        stacked: true,
    };
}

// O kolik se sloupce událostí zvednou při cinematice hokynářství. Řada rozdaných karet
// leží `storeRowOffY` pod balíčky, takže při svislém srovnání nad sebe by na spodní
// sloupec dosáhla – zvedají se proto o kus víc než balíčky.
//
// Přirozená hodnota je „o půl rozteče víc" – spodní sloupec pak skončí přesně tam, kde
// je zvednutý balíček dnes. Jenže tím vyjede horní sloupec na karty vyložené před horním
// soupeřem, takže se z posunu kus ubere (EVENT_STORE_SLACK). Obě omezení se totiž o 5 px
// kříží a nejde jim vyhovět naráz; takhle zůstane na každé straně necelý 3px překryv,
// tedy pod hranicí viditelnosti. Platí to jen po dobu cinematiky hokynářství – v klidu
// mají sloupce místa dost (hlídá test/positions.test.js).
const EVENT_STORE_SLACK = 40;
//
// Přídavek se musí přičítat POSTUPNĚ, ne skokem: animatePileLift (game.js) tweenuje
// storeLift z 0 na L.storeLift, a kdyby přídavek naskočil celý hned s prvním tickem,
// sloupce událostí by na začátku i na konci cinematiky poskočily o 45 px (bug 13).
// Poměr k plnému zvednutí nechává obě krajní polohy přesně tam, kde byly.
function eventPileLift(L, storeLift, stacked) {
    if (!storeLift) return 0;
    if (!stacked) return storeLift;
    const full = L.storeLift || 0;
    const t = full > 0 ? Math.min(1, Math.max(0, storeLift / full)) : 1;
    return storeLift + t * (L.eventRowGap / 2 - EVENT_STORE_SLACK);
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

// Má se hráče na začátku zeptat, jestli chce PC, nebo mobilní rozložení? Ptáme se jen
// tam, kde je odpověď nejistá (dotykový displej nebo úzké okno) a jen dokud si hráč
// nevybral – volba se pamatuje v localStorage.bangUiMode (viz pickLayoutProfile).
// Testovací ?ui= v adrese má přednost před vším, takže se v něm neptáme vůbec.
function shouldAskLayout(opts) {
    const o = opts || {};
    if (o.query === 'mobile' || o.query === 'desktop') return false;
    if (o.stored === 'big' || o.stored === 'normal') return false;
    const w = Number(o.width);
    if (o.coarse) return true;
    return w > 0 && w < 820;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STAGE_BASE_W, STAGE_BASE_H, STAGE_MAX_W, STAGE_MAX_H,
        CARD_ART_W, CARD_ART_H,
        computeStage, stageCoverSize,
        LAYOUT_PROFILES, getLayout, currentLayout, pickLayoutProfile, shouldAskLayout,
        resolveLayout, stretchAnchors, boardRowLimit, myHandRow, myHandSlotX,
        boardBand, boardSlot,
        COMPACT, compactMetrics, compactAnchors, compactColLeft, compactColCenter,
        compactBoardStep, compactBoardPos, compactHandPos, compactNameY,
        oppScale, handCardScale,
        eventPileSlots, eventPileLift,
    };
}
