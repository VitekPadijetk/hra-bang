const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    getPlayerPosition, getPlayerHandPos, getHandSlotPos, getBoardCardPos, getDeadRoleCardPos, getOpponentAnchors,
} = require('../positions.js');
const {
    computeStage, resolveLayout, LAYOUT_PROFILES, oppScale, eventPileSlots, eventPileLift,
    compactMetrics, compactAnchors, compactBoardPos, compactHandPos,
} = require('../core/layout.js');

// getPlayerHandPos/getBoardCardPos čtou globály state/myIndex (bare identifiers).
// V prohlížeči jsou deklarované (let state = null) – v Node je proto držíme na null
// jako výchozí a nastavujeme přes global.*; `delete` by způsobil ReferenceError.
before(() => { console.log = () => {}; global.state = null; global.myIndex = null; });
afterEach(() => { global.state = null; global.myIndex = null; });
function setWorld(players, myIndex) { global.state = { players }; global.myIndex = myIndex; }

// ── getPlayerPosition: rozdělení soupeřů do kvadrantů ────────────────────────
test('getPlayerPosition: vlastní hráč je vždy bottom', () => {
    assert.equal(getPlayerPosition(0, 0, 4), 'bottom');
    assert.equal(getPlayerPosition(2, 2, 6), 'bottom');
});

test('getPlayerPosition: 4 hráči → left/top/right podle pořadí', () => {
    // third = ceil(3/3) = 1
    assert.equal(getPlayerPosition(0, 1, 4), 'left');
    assert.equal(getPlayerPosition(0, 2, 4), 'top');
    assert.equal(getPlayerPosition(0, 3, 4), 'right');
});

test('getPlayerPosition: 6 hráčů → 2 vlevo, 2 nahoře, zbytek vpravo', () => {
    // third = ceil(5/3) = 2
    assert.equal(getPlayerPosition(0, 1, 6), 'left');
    assert.equal(getPlayerPosition(0, 2, 6), 'left');
    assert.equal(getPlayerPosition(0, 3, 6), 'top');
    assert.equal(getPlayerPosition(0, 4, 6), 'top');
    assert.equal(getPlayerPosition(0, 5, 6), 'right');
});

test('getPlayerPosition: počítá relativně k mému indexu (wrap)', () => {
    // me=3, target=0, total=4 → diff = (0-3+4)%4 = 1 → left
    assert.equal(getPlayerPosition(3, 0, 4), 'left');
});

// ── getOpponentAnchors: kotvy podle počtu hráčů ─────────────────────────────
test('getOpponentAnchors: 1 hráč nemá soupeře → []', () => {
    assert.deepEqual(getOpponentAnchors(1), []);
});

test('getOpponentAnchors: počet kotev = počet soupeřů', () => {
    assert.equal(getOpponentAnchors(2).length, 1);
    assert.equal(getOpponentAnchors(3).length, 2);
    assert.equal(getOpponentAnchors(7).length, 6);
});

test('getOpponentAnchors: mimo rozsah → []', () => {
    assert.deepEqual(getOpponentAnchors(9), []);
});

// Hra pro 3 (Město duchů): oba soupeři sedí NAPROTI vedle sebe, ne po bocích.
test('getOpponentAnchors: konkrétní kotvy pro 2 soupeře (3 hráči)', () => {
    assert.deepEqual(getOpponentAnchors(3), [
        { x: 600, y: 150, side: 'top' },
        { x: 1320, y: 150, side: 'top' },
    ]);
});

// Hra pro 8 (Město duchů): 2 vlevo, 3 nahoře, 2 vpravo.
test('getOpponentAnchors: 7 soupeřů (8 hráčů) – 2 vlevo, 3 nahoře, 2 vpravo', () => {
    const a = getOpponentAnchors(8);
    assert.equal(a.length, 7);
    assert.deepEqual(a.map(x => x.side),
        ['left', 'left', 'top', 'top', 'top', 'right', 'right']);
    // prostřední horní sedadlo je na středu stolu, krajní symetricky
    assert.equal(a[3].x, 960);
    assert.equal(a[2].x + a[4].x, 1920);
});

// ── getPlayerHandPos ─────────────────────────────────────────────────────────
test('getPlayerHandPos: bez stavu → střed obrazovky', () => {
    assert.deepEqual(getPlayerHandPos(0), { x: 960, y: 540 });
});

test('getPlayerHandPos: vlastní ruka má pevnou pozici', () => {
    setWorld([{}, {}, {}], 0);
    assert.deepEqual(getPlayerHandPos(0), { x: 1450, y: 970 });
});

test('getPlayerHandPos: soupeř vlevo je odsazen o cardH*1.1 doleva', () => {
    setWorld([{}, {}, {}, {}], 0); // 4 hráči; pid=1 → diff 1 → kotva left {180,540}
    // cardH = 500*0.27 = 135; left → x = 180 - 135*1.1 = 31.5
    assert.deepEqual(getPlayerHandPos(1), { x: 31.5, y: 540 });
});

test('getPlayerHandPos: soupeř vpravo je odsazen doprava', () => {
    setWorld([{}, {}, {}, {}], 0); // pid=3 → diff 3 → kotva right {1740,540}
    // right → x = 1740 + 135*1.1 = 1888.5
    assert.deepEqual(getPlayerHandPos(3), { x: 1888.5, y: 540 });
});

test('getPlayerHandPos: soupeř nahoře je odsazen nahoru', () => {
    setWorld([{}, {}], 0); // 2 hráči; pid=1 → kotva top {960,150}
    // top → y = 150 - 135*1.1 = 1.5
    assert.deepEqual(getPlayerHandPos(1), { x: 960, y: 1.5 });
});

// ── divácký pohled (myIndex === null → seat 0 dole) ─────────────────────────
test('getPlayerHandPos (divák): spodní hráč (seat 0) je vystředěný dole', () => {
    setWorld([{}, {}, {}], null);
    assert.deepEqual(getPlayerHandPos(0), { x: 960, y: 1065 });
});

test('getPlayerHandPos (divák): soupeři se počítají z pohledu seat 0', () => {
    setWorld([{}, {}, {}, {}], null); // pid=1 → diff 1 → kotva left {180,540} → {31.5,540}
    assert.deepEqual(getPlayerHandPos(1), { x: 31.5, y: 540 });
});

test('getBoardCardPos (divák): spodní hráč má desku vystředěnou dole', () => {
    setWorld([{ health: 4, board: [] }, {}, {}], null);
    assert.deepEqual(getBoardCardPos(0, 0), { x: 960, y: 900 });
});

// ── getBoardCardPos: moje stolní karty ───────────────────────────────────────
test('getBoardCardPos (já): karty jdou zprava doleva s rozestupem', () => {
    setWorld([{ health: 4, board: [] }], 0);
    // boardCardW = 325*0.36+10 = 127; roleX = 850
    assert.deepEqual(getBoardCardPos(0, 0), { x: 723, y: 970 });
    assert.deepEqual(getBoardCardPos(0, 1), { x: 596, y: 970 });
});

test('getBoardCardPos (já): šestá karta zůstává v prvním řádku (6/řádek)', () => {
    setWorld([{ health: 4, board: [] }], 0);
    // boardMaxPerRow = 6 → boardIdx 5 → bRow 0, bCol 5; boardCardW = 325*0.36+10 = 127
    // roleX = 850; bx = 850 - 127 - 5*127 = 88; by = 970 (první řádek)
    assert.deepEqual(getBoardCardPos(0, 5), { x: 88, y: 970 });
});

test('getBoardCardPos (já): sedmá karta přeteče do dalšího řádku výš', () => {
    setWorld([{ health: 4, board: [] }], 0);
    // boardIdx 6 → bRow 1, bCol 0; boardCardH = 500*0.36 = 180; by = 970 - (180+10) = 780
    assert.deepEqual(getBoardCardPos(0, 6), { x: 723, y: 780 });
});

// ── getBoardCardPos: soupeřovy stolní karty ──────────────────────────────────
test('getBoardCardPos (soupeř vlevo): pozice dle kotvy a počtu modrých', () => {
    setWorld([{}, { health: 4, weapon: { id: -1 }, board: [] }, {}, {}], 0); // 4 hráči
    // pid=1 → kotva left {180,540}; cardW=87.75, cardH=135, gap=10
    // numBlue=0; groupH=87.75; livesCY = 540 + 43.875 - 67.5 = 516.375
    // boardIdx 0: col 0, rowInCol 0 → x=180, y = 516.375 - 97.75 = 418.625
    assert.deepEqual(getBoardCardPos(1, 0), { x: 180, y: 418.625 });
});

// ── getDeadRoleCardPos: kam dosedne odhalená role vyřazeného hráče ───────────
test('getDeadRoleCardPos: slot 0 skupiny mrtvého (hned vedle jeho postavy)', () => {
    // Mrtvý soupeř vlevo s prázdným stolem: skupina = postava + 1 karta (role).
    setWorld([{}, { health: 0, weapon: { id: -1 }, board: [] }, {}, {}], 0);
    // numBlue=1; groupH = 2*87.75 + 10 = 185.5; livesCY = 540 + 92.75 - 67.5 = 565.25
    // displayIdx 0 → y = 565.25 - 97.75 = 467.5
    assert.deepEqual(getDeadRoleCardPos(1), { x: 180, y: 467.5 });
});

test('getDeadRoleCardPos: sedí na místo, kde roli kreslí deska (slot před modrými)', () => {
    // Kdyby mrtvý ještě něco na stole měl, role je pořád první – logický boardIdx 0
    // (první modrá) musí ležet až ZA ní.
    setWorld([{}, { health: 0, weapon: { id: -1 }, board: [{ id: 7 }] }, {}, {}], 0);
    const role = getDeadRoleCardPos(1);
    const firstBlue = getBoardCardPos(1, 0);
    assert.notDeepEqual(role, firstBlue);
    assert.ok(role.y > firstBlue.y, 'role je blíž postavě než první modrá');
});

test('getBoardCardPos: bez stavu → střed', () => {
    global.state = null;
    assert.deepEqual(getBoardCardPos(0, 0), { x: 960, y: 540 });
});

// ── Širší jeviště než 16:9 (telefon na šířku, okno prohlížeče mimo fullscreen) ──
// Rozložení se čte z App.layout/App.stage (v prohlížeči je nastaví applyStage).
function withStage(vw, vh, fn) {
    const stage = computeStage(vw, vh);
    global.App = { stage, layout: resolveLayout(LAYOUT_PROFILES.desktop, stage) };
    try { fn(stage, global.App.layout); } finally { delete global.App; }
}
function withMobile(vw, vh, fn) {
    const stage = computeStage(vw, vh);
    const L = resolveLayout(LAYOUT_PROFILES.mobile, stage);
    global.App = { stage, layout: L };
    try { fn(stage, L); } finally { delete global.App; }
}

test('široké jeviště: krajní soupeři se přilepí na okraj', () => {
    withStage(1600, 800, (st) => {
        const [left, , right] = getOpponentAnchors(4);
        assert.equal(left.x, st.left + 180);      // stejné odsazení od okraje jako dnes od kraje plátna
        assert.equal(right.x, st.right - 180);
        assert.equal(left.y, 540);                // svisle se nic nemění
        assert.equal(right.side, 'right');
    });
});

test('široké jeviště: ruka soupeře jde s kotvou, takže nezůstane v pruhu uprostřed', () => {
    withStage(1600, 800, (st) => {
        setWorld([{}, {}, {}, {}], 0);
        assert.deepEqual(getPlayerHandPos(1), { x: st.left + 180 - 148.5, y: 540 });
    });
});

test('široké jeviště: moje ruka se roztáhne až k pravému okraji (menší překryv)', () => {
    setWorld([{ health: 4, board: [] }], 0);
    const base0 = getHandSlotPos(0, 0, 8), base1 = getHandSlotPos(0, 1, 8);
    withStage(1600, 800, (st) => {
        const wide0 = getHandSlotPos(0, 0, 8), wide7 = getHandSlotPos(0, 7, 8);
        const wide1 = getHandSlotPos(0, 1, 8);
        assert.equal(wide0.x, base0.x, 'začátek ruky zůstává u portrétu');
        assert.ok(wide1.x - wide0.x > base1.x - base0.x, 'větší rozteč = menší překryv');
        assert.ok(wide7.x < st.right, 'poslední karta zůstane na jevišti');
        assert.ok(wide7.x > 1860, 'a využije i plochu za starým okrajem plátna');
    });
});

test('široké jeviště: do řady mého stolu se vejde víc karet (sedmá už nepřeteče)', () => {
    setWorld([{ health: 4, board: [] }], 0);
    assert.equal(getBoardCardPos(0, 6).y, 780);      // dnes: druhý řádek výš
    withStage(1600, 800, (st) => {
        const first = getBoardCardPos(0, 0), seventh = getBoardCardPos(0, 6);
        assert.equal(seventh.y, first.y, 'sedmá karta zůstane v prvním řádku');
        assert.ok(seventh.x - (325 * 0.36) / 2 >= st.left, 'a nevyčuhuje z jeviště');
    });
});

// ── Mobilní profil: kompaktní řada soupeřů ──────────────────────────────────
// positions.js MUSÍ dávat přesně to, co kreslí view/board.js (drawCompactOpponent) –
// obojí se ptá core/layout.js, takže se tady kontroluje shoda s ním. Kdyby se
// rozešly, animace by mířily mimo karty.
test('mobil: kotvy soupeřů jsou kompaktní řada nahoře', () => {
    withMobile(844, 390, (st, L) => {
        const a = getOpponentAnchors(5);
        assert.deepEqual(a, compactAnchors(4, L, st));
        a.forEach(x => assert.equal(x.side, 'compact'));
        assert.ok(a[0].y < 300, 'řada sedí nahoře');
    });
});

test('mobil: sloty ruky soupeře sedí s vějířem, který kreslí deska', () => {
    withMobile(844, 390, (st, L) => {
        setWorld([{}, {}, {}, {}], 0);       // 4 hráči → 3 soupeři
        const m = compactMetrics(3, L, st);
        const anchor = getOpponentAnchors(4)[0];
        for (const slot of [0, 2, 4]) {
            assert.deepEqual(getHandSlotPos(1, slot, 5), compactHandPos(anchor, slot, 5, m));
        }
        // kotva ruky = střed vějíře (cíl animací bez konkrétního slotu)
        setWorld([{}, { hand: [{}, {}, {}] }, {}, {}], 0);
        assert.deepEqual(getPlayerHandPos(1), compactHandPos(anchor, 1, 3, m));
    });
});

test('mobil: vyložené karty soupeře jsou v jedné řadě pod jmenovkou', () => {
    withMobile(844, 390, (st, L) => {
        setWorld([{}, { health: 4, weapon: { id: 7 }, board: [{ id: 1 }, { id: 2 }] }, {}], 0);
        const m = compactMetrics(2, L, st);
        const anchor = getOpponentAnchors(3)[0];
        const first = getBoardCardPos(1, 0), third = getBoardCardPos(1, 2);
        assert.deepEqual(first, compactBoardPos(anchor, 0, 3, m));
        assert.equal(third.y, first.y, 'žádné zalamování do dalšího řádku');
        assert.ok(third.x > first.x, 'řada roste doprava');
    });
});

test('mobil: odhalená role mrtvého dosedne na první slot jeho řady', () => {
    withMobile(844, 390, (st, L) => {
        setWorld([{}, { health: 0, weapon: { id: -1 }, board: [] }, {}], 0);
        const m = compactMetrics(2, L, st);
        const anchor = getOpponentAnchors(3)[0];
        assert.deepEqual(getDeadRoleCardPos(1), compactBoardPos(anchor, 0, 1, m));
    });
});

test('mobil: moje ruka má vlastní řadu POD stolem (soupeři to nemění)', () => {
    withMobile(844, 390, (st, L) => {
        setWorld([{ health: 4, board: [] }, {}, {}], 0);
        assert.equal(getPlayerHandPos(0).y, L.handY);
        assert.equal(getHandSlotPos(0, 0, 5).y, L.handY);
        assert.ok(L.handY > L.myBaseY, 'ruka je pod stolem');
        // 5 karet vedle sebe bez překryvu a VYSTŘEDĚNÝCH v pásu (handAlign 'center') –
        // pár karet by se jinak krčilo v levém rohu, pás jde přes celou šířku jeviště.
        assert.equal(getHandSlotPos(0, 1, 5).x - getHandSlotPos(0, 0, 5).x, L.handMaxSpacing);
        const mid = (getHandSlotPos(0, 0, 5).x + getHandSlotPos(0, 4, 5).x) / 2;
        assert.equal(mid, (L.handStartX + L.handEndX) / 2);
        assert.equal(mid, (st.left + st.right) / 2, 'střed ruky = střed jeviště');
        // ani plná ruka z pásu nevyleze (vystředění nesmí přetéct přes okraje)
        assert.ok(getHandSlotPos(0, 0, 20).x >= L.handStartX);
        assert.ok(getHandSlotPos(0, 19, 20).x <= L.handEndX);
        // můj stůl zůstává v horní řadě mé zóny
        assert.equal(getBoardCardPos(0, 0).y, L.myBaseY);
    });
});

// ── Pás vyložených karet nesmí dosáhnout na balíčky uprostřed stolu ──────────
// Řady rostou vždy směrem k balíčkům (u soupeře dovnitř stolu, u mě vzhůru), takže je
// jejich počet zastropovaný a přeplněná řada se místo další řady jen zhustí
// (core/layout.js boardBand). Tohle je pojistka, že to platí pro každé sedadlo i počet
// hráčů – dřív rostly řady bez stropu a horní soupeř od 7. karty ležel na balíčku.
const DSK = LAYOUT_PROFILES.desktop;

// Obdélník, který zabírají balíčky: od balíčku vlevo po místo aktivní karty High Noon.
// Plný balíček (80 karet po 0,125 px) roste vzhůru, proto `stack`.
function pileRect(L) {
    const w = 325 * L.scaleDeck, h = 500 * L.scaleDeck;
    const stack = 79 * 0.125;
    return {
        x0: L.centerX - L.deckOffX - w / 2, x1: L.hnActiveX + w / 2,
        y0: L.pileY - h / 2 - stack,        y1: L.pileY + h / 2,
    };
}
// Karta soupeře vlevo/vpravo leží otočená o 90° → na obrazovce je široká jako VÝŠKA artu.
function cardRect(pos, side, scale) {
    const w = 325 * scale, h = 500 * scale;
    const rot = side === 'left' || side === 'right';
    const bw = rot ? h : w, bh = rot ? w : h;
    return { x0: pos.x - bw / 2, x1: pos.x + bw / 2, y0: pos.y - bh / 2, y1: pos.y + bh / 2 };
}
const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

test('vyložené karty soupeřů nedosáhnou na balíčky (žádný počet hráčů, žádný počet karet)', () => {
    const piles = pileRect(DSK);
    for (let total = 2; total <= 8; total++) {
        const anchors = getOpponentAnchors(total);
        if (!anchors.length) continue;          // počet bez tabulky kotev (viz test výš)
        for (let k = 1; k <= 14; k++) {
            // hráč 0 = já, soupeři mají k vyložených karet (zbraň + modré/zelené)
            const players = Array.from({ length: total }, () => ({
                health: 4, hand: [], board: Array.from({ length: k - 1 }, (_, i) => ({ id: i })),
                weapon: { id: 1 },
            }));
            setWorld(players, 0);
            for (let opp = 1; opp < total; opp++) {
                const side = anchors[opp - 1].side;
                for (let b = 0; b < k; b++) {
                    const r = cardRect(getBoardCardPos(opp, b), side, DSK.scaleOpp);
                    assert.ok(!overlaps(r, piles),
                        `${total} hráčů, soupeř ${opp} (${side}), ${k} karet, karta ${b}: leze na balíčky`);
                }
            }
            global.state = null; global.myIndex = null;
        }
    }
});

// Se dvěma balíčky událostí (High Noon + Fistful) se sloupce srovnají nad sebe, takže
// horní řada leze výš než dnes – nesmí ale dosáhnout na karty vyložené před soupeři.
// Je to nejtěsnější místo celého rozložení (18 px), proto vlastní test.
function eventRects(L) {
    const w = 325 * L.scaleDeck, h = 500 * L.scaleDeck;
    const slots = eventPileSlots(L, true, true);
    const stack = 14 * 0.125;   // balíček událostí má nejvýš 15 karet
    return ['hn', 'ff'].map(k => slots[k]).filter(Boolean).map(s => ({
        x0: Math.min(s.deckX, s.activeX) - w / 2, x1: Math.max(s.deckX, s.activeX) + w / 2,
        y0: s.y - h / 2 - stack, y1: s.y + h / 2,
    }));
}

test('sloupce událostí (obě rozšíření) nedosáhnou na vyložené karty soupeřů', () => {
    const rects = eventRects(DSK);
    for (let total = 2; total <= 8; total++) {
        const anchors = getOpponentAnchors(total);
        if (!anchors.length) continue;
        for (let k = 1; k <= 14; k++) {
            const players = Array.from({ length: total }, () => ({
                health: 4, hand: [], board: Array.from({ length: k - 1 }, (_, i) => ({ id: i })),
                weapon: { id: 1 },
            }));
            setWorld(players, 0);
            for (let opp = 1; opp < total; opp++) {
                const side = anchors[opp - 1].side;
                for (let b = 0; b < k; b++) {
                    const r = cardRect(getBoardCardPos(opp, b), side, DSK.scaleOpp);
                    rects.forEach(pile => assert.ok(!overlaps(r, pile),
                        `${total} hráčů, soupeř ${opp} (${side}), ${k} karet, karta ${b}: leze na sloupce událostí`));
                }
            }
            global.state = null; global.myIndex = null;
        }
    }
});

test('sloupce událostí nedosáhnou ani na moje vyložené karty', () => {
    const rects = eventRects(DSK);
    for (let k = 1; k <= 20; k++) {
        const players = [{
            health: 4, hand: [], board: Array.from({ length: k - 1 }, (_, i) => ({ id: i })),
            weapon: { id: 1 },
        }, { health: 4, hand: [], board: [], weapon: { id: -1 } }];
        setWorld(players, 0);
        for (let b = 0; b < k; b++) {
            const r = cardRect(getBoardCardPos(0, b), 'bottom', DSK.scaleMe);
            rects.forEach(pile => assert.ok(!overlaps(r, pile),
                `${k} karet, karta ${b}: leze na sloupce událostí`));
        }
        global.state = null; global.myIndex = null;
    }
});

test('jeden balíček událostí sedí na klasickém místě, dva se srovnají nad sebe', () => {
    const one = eventPileSlots(DSK, true, false);
    assert.deepEqual(one.hn, { deckX: DSK.hnPileX, activeX: DSK.hnActiveX, y: DSK.pileY });
    assert.equal(one.ff, null);
    assert.equal(eventPileSlots(DSK, false, true).ff.y, DSK.pileY, 'samotný Fistful bere místo High Noonu');

    const both = eventPileSlots(DSK, true, true);
    assert.equal(both.stacked, true);
    assert.equal(both.ff.y + DSK.eventRowGap, both.hn.y, 'rozteč řad');
    assert.equal(both.ff.y + both.hn.y, 2 * DSK.pileY, 'skupina zůstává vystředěná na pileY');
    assert.ok(DSK.eventRowGap >= 500 * DSK.scaleDeck, 'řady se nepřekrývají');

    // Mobil na dvě řady místo nemá → Fistful se zrcadlí doleva od balíčku.
    const mob = eventPileSlots(LAYOUT_PROFILES.mobile, true, true);
    assert.equal(mob.stacked, false);
    assert.equal(mob.hn.y, mob.ff.y);
    assert.ok(mob.ff.activeX < mob.ff.deckX && mob.ff.deckX < LAYOUT_PROFILES.mobile.centerX);
});

// ── Třetí sloupec událostí: Divoký západ ────────────────────────────────────
// Rozšíření jdou zapnout v libovolné kombinaci, takže sloupců může na stole stát jeden
// až tři. Žádné dva se nesmí překrývat a žádný nesmí dosáhnout na dobírací balíček ani
// na odhoz. Platí to pro oba profily rozložení a pro všech osm kombinací.
function slotRect(L, s) {
    const w = 325 * L.scaleDeck, h = 500 * L.scaleDeck;
    const stack = 14 * 0.125;   // balíček událostí má nejvýš 15 karet
    return {
        x0: Math.min(s.deckX, s.activeX) - w / 2, x1: Math.max(s.deckX, s.activeX) + w / 2,
        y0: s.y - h / 2 - stack, y1: s.y + h / 2,
    };
}
// Dobírací balíček + odhoz uprostřed stolu (bez sloupců událostí).
function centerPilesRect(L) {
    const w = 325 * L.scaleDeck, h = 500 * L.scaleDeck;
    const stack = 79 * 0.125;   // plný hrací balíček roste vzhůru
    return {
        x0: L.centerX - L.deckOffX - w / 2, x1: L.centerX + L.deckOffX + w / 2,
        y0: L.pileY - h / 2 - stack,        y1: L.pileY + h / 2,
    };
}

test('sloupce událostí se nepřekrývají v žádné kombinaci rozšíření ani profilu', () => {
    ['desktop', 'mobile'].forEach(name => {
        const L = LAYOUT_PROFILES[name];
        const center = centerPilesRect(L);
        for (let mask = 0; mask < 8; mask++) {
            const hn = !!(mask & 1), ff = !!(mask & 2), wws = !!(mask & 4);
            const slots = eventPileSlots(L, hn, ff, wws);
            assert.equal(!!slots.hn, hn, `${name} ${mask}: High Noon`);
            assert.equal(!!slots.ff, ff, `${name} ${mask}: Fistful`);
            assert.equal(!!slots.wws, wws, `${name} ${mask}: Divoký západ`);
            const rects = ['hn', 'ff', 'wws'].filter(k => slots[k])
                .map(k => ({ k, r: slotRect(L, slots[k]) }));
            rects.forEach(({ k, r }) => assert.ok(!overlaps(r, center),
                `${name}, kombinace ${mask}: sloupec ${k} leze na balíčky`));
            for (let i = 0; i < rects.length; i++)
                for (let j = i + 1; j < rects.length; j++)
                    assert.ok(!overlaps(rects[i].r, rects[j].r),
                        `${name}, kombinace ${mask}: ${rects[i].k} se překrývá s ${rects[j].k}`);
        }
    });
});

test('Divoký západ leží vlevo a ustoupí, jen když levý pár drží Fistful', () => {
    // Desktop: High Noon s Fistfulem se srovnávají nad sebe vpravo, takže je levý pár
    // volný vždycky – dnešní rozložení obou se tím pádem nemění o pixel.
    [false, true].forEach(hn => [false, true].forEach(ff => {
        const s = eventPileSlots(DSK, hn, ff, true);
        assert.deepEqual(s.wws, { deckX: DSK.ffPileX, activeX: DSK.ffActiveX, y: DSK.pileY },
            `desktop hn=${hn} ff=${ff}`);
    }));
    const before = eventPileSlots(DSK, true, true);
    const after = eventPileSlots(DSK, true, true, true);
    assert.deepEqual(after.hn, before.hn, 'High Noon se nehnul');
    assert.deepEqual(after.ff, before.ff, 'Fistful se nehnul');
    assert.equal(after.stacked, before.stacked);

    // Mobil: levý pár drží Fistful jen tehdy, když se hraje i High Noon.
    const MOB = LAYOUT_PROFILES.mobile;
    assert.deepEqual(eventPileSlots(MOB, true, true, true).wws,
        { deckX: MOB.wwsPileX, activeX: MOB.wwsActiveX, y: MOB.pileY }, 'ustoupí o krok doleva');
    assert.deepEqual(eventPileSlots(MOB, false, true, true).wws,
        { deckX: MOB.ffPileX, activeX: MOB.ffActiveX, y: MOB.pileY }, 'sám Fistful sedí vpravo');
    assert.deepEqual(eventPileSlots(MOB, true, false, true).wws,
        { deckX: MOB.ffPileX, activeX: MOB.ffActiveX, y: MOB.pileY });
    assert.ok(MOB.wwsActiveX < MOB.wwsPileX && MOB.wwsPileX < MOB.ffActiveX,
        'třetí sloupec leží nalevo od druhého');
});

test('sloupec Divokého západu nedosáhne na vyložené karty soupeřů ani na moje', () => {
    const rect = slotRect(DSK, eventPileSlots(DSK, true, true, true).wws);
    for (let total = 2; total <= 8; total++) {
        const anchors = getOpponentAnchors(total);
        if (!anchors.length) continue;
        for (let k = 1; k <= 14; k++) {
            const players = Array.from({ length: total }, () => ({
                health: 4, hand: [], board: Array.from({ length: k - 1 }, (_, i) => ({ id: i })),
                weapon: { id: 1 },
            }));
            setWorld(players, 0);
            for (let opp = 1; opp < total; opp++) {
                const side = anchors[opp - 1].side;
                for (let b = 0; b < k; b++) {
                    const r = cardRect(getBoardCardPos(opp, b), side, DSK.scaleOpp);
                    assert.ok(!overlaps(r, rect),
                        `${total} hráčů, soupeř ${opp} (${side}), ${k} karet, karta ${b}: leze na Divoký západ`);
                }
            }
            for (let b = 0; b < k; b++) {
                const r = cardRect(getBoardCardPos(0, b), 'bottom', DSK.scaleMe);
                assert.ok(!overlaps(r, rect), `${total} hráčů, ${k} karet, moje karta ${b}: leze na Divoký západ`);
            }
            global.state = null; global.myIndex = null;
        }
    }
});

test('hokynářství zvedne srovnané sloupce mezi řadu karet a horního soupeře', () => {
    const both = eventPileSlots(DSK, true, true);
    const lift = eventPileLift(DSK, DSK.storeLift, both.stacked);
    const h = 500 * DSK.scaleDeck;
    // Zdola tlačí řada rozdaných karet hokynářství, shora karty vyložené před horním
    // soupeřem. Obojí najednou nevyjde (omezení se o 5 px kříží), takže se rozdíl dělí
    // na půl – na obou stranách smí zůstat pár pixelů překryvu, ne víc.
    const TOL = 3;
    const rowTop = DSK.pileY - DSK.storeLift + DSK.storeRowOffY - h / 2;
    const hnBottom = both.hn.y - lift + h / 2;
    assert.ok(hnBottom - rowTop <= TOL,
        `spodní sloupec zasahuje do řady hokynářství o ${hnBottom - rowTop} px`);
    const oppBottom = 150 + 500 * DSK.scaleOpp / 2;   // první řada karet horního soupeře
    const ffTop = both.ff.y - lift - h / 2;
    assert.ok(oppBottom - ffTop <= TOL,
        `horní sloupec zasahuje do karet horního soupeře o ${oppBottom - ffTop} px`);
    // Bez srovnání nad sebe se zvedá přesně jako balíčky (dnešní chování).
    assert.equal(eventPileLift(DSK, DSK.storeLift, false), DSK.storeLift);
    assert.equal(eventPileLift(DSK, 0, true), 0, 'bez hokynářství se nezvedá nic');
    // Zvednutí je PLYNULÉ – přídavek srovnaných sloupců se nesmí naskočit celý hned
    // s prvním tickem tweenu (jinak sloupce na začátku i konci cinematiky poskočí).
    const half = eventPileLift(DSK, DSK.storeLift / 2, true);
    assert.ok(Math.abs(half - lift / 2) < 0.01, `půl cesty zvedá o ${half}, čekáno ${lift / 2}`);
    assert.ok(eventPileLift(DSK, 1, true) < 3, 'první tick nesmí sloupce hodit o desítky px');
});

test('moje vyložené karty nedosáhnou na balíčky', () => {
    const piles = pileRect(DSK);
    for (let k = 1; k <= 20; k++) {
        const players = [{
            health: 4, hand: [], board: Array.from({ length: k - 1 }, (_, i) => ({ id: i })),
            weapon: { id: 1 },
        }, { health: 4, hand: [], board: [], weapon: { id: -1 } }];
        setWorld(players, 0);
        for (let b = 0; b < k; b++) {
            const r = cardRect(getBoardCardPos(0, b), 'bottom', DSK.scaleMe);
            assert.ok(!overlaps(r, piles), `${k} karet, karta ${b}: leze na balíčky`);
        }
        global.state = null; global.myIndex = null;
    }
});

test('pás vyložených karet soupeře se s počtem karet nerozšíří', () => {
    for (let total = 2; total <= 8; total++) {
        const anchors = getOpponentAnchors(total);
        if (!anchors.length) continue;
        const spanOf = (k) => {
            const players = Array.from({ length: total }, () => ({
                health: 4, hand: [], board: Array.from({ length: k - 1 }, (_, i) => ({ id: i })),
                weapon: { id: 1 },
            }));
            setWorld(players, 0);
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (let b = 0; b < k; b++) {
                const p = getBoardCardPos(1, b);
                x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
                y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
            }
            global.state = null; global.myIndex = null;
            return { w: x1 - x0, h: y1 - y0 };
        };
        const full = spanOf(DSK.oppBoardRows * DSK.oppBoardPerRow);
        for (let k = 7; k <= 16; k++) {
            const s = spanOf(k);
            assert.ok(s.w <= full.w + 1e-9 && s.h <= full.h + 1e-9,
                `${total} hráčů, ${k} karet: pás se rozšířil`);
        }
    }
});

test('vyložené karty sousedních soupeřů se nepřekrývají', () => {
    for (let total = 2; total <= 8; total++) {
        const anchors = getOpponentAnchors(total);
        if (!anchors.length) continue;
        const scl = oppScale(DSK, total - 1);
        // Plná výzbroj: 3 karty v řadě u každého (víc už se jen zhustí, pás se nerozšíří).
        const players = Array.from({ length: total }, () => ({
            health: 4, hand: [], board: [{ id: 1 }, { id: 2 }], weapon: { id: 3 },
        }));
        setWorld(players, 0);
        const rects = [];
        for (let opp = 1; opp < total; opp++) {
            const side = anchors[opp - 1].side;
            for (let b = 0; b < 3; b++) rects.push({ opp, r: cardRect(getBoardCardPos(opp, b), side, scl) });
        }
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                if (rects[i].opp === rects[j].opp) continue;   // vlastní pás se překrývat smí (zhuštění)
                assert.ok(!overlaps(rects[i].r, rects[j].r),
                    `${total} hráčů: karty soupeřů ${rects[i].opp} a ${rects[j].opp} se překrývají`);
            }
        }
        global.state = null; global.myIndex = null;
    }
});

// ── Hra pro 3 (Město duchů): karta role leží lícem nahoru u každého ──────────
// Je to týž slot, jaký dostane vyřazený hráč, takže logická karta 0 (zbraň) musí ležet
// až ZA ní. Bez toho by animace mířily o kartu vedle, než dorazí stav.
test('3P: role zabírá první slot skupiny a modré se posunou za ni', () => {
    const mk = (mode3p) => ({
        players: [
            { health: 4, hand: [], board: [], weapon: { id: -1 } },
            { health: 4, hand: [], board: [{ id: 7 }], weapon: { id: 3 } },
            { health: 4, hand: [], board: [], weapon: { id: -1 } },
        ],
        mode3p,
    });
    const step = 325 * DSK.scaleOpp + DSK.oppGap;

    global.state = mk(true); global.myIndex = 0;
    const role = getDeadRoleCardPos(1);           // display slot 0
    const weapon = getBoardCardPos(1, 0);         // display slot 1
    const blue = getBoardCardPos(1, 1);           // display slot 2
    // Oba soupeři sedí nahoře → řada roste doprava od karty životů, o jeden krok na kartu.
    assert.ok(Math.abs(weapon.x - role.x - step) < 1e-9, 'role je krok PŘED zbraní');
    assert.ok(Math.abs(blue.x - weapon.x - step) < 1e-9, 'modrá je krok za zbraní');
    assert.equal(role.y, weapon.y, 'jedna řada');

    // 3P recykluje slot, který dostane vyřazený hráč → rozložení musí být totožné
    // s tím, jaké má tentýž hráč po vyřazení (stejný počet zobrazených karet).
    const dead = mk(false);
    dead.players[1].health = 0;
    global.state = dead;
    assert.deepEqual(getDeadRoleCardPos(1), role);
    assert.deepEqual(getBoardCardPos(1, 0), weapon);
    assert.deepEqual(getBoardCardPos(1, 1), blue);
    global.state = null; global.myIndex = null;
});
