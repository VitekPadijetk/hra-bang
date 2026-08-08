const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    getPlayerPosition, getPlayerHandPos, getHandSlotPos, getBoardCardPos, getDeadRoleCardPos, getOpponentAnchors,
} = require('../positions.js');
const { computeStage, resolveLayout, LAYOUT_PROFILES } = require('../core/layout.js');

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
    assert.deepEqual(getOpponentAnchors(8), []);
});

test('getOpponentAnchors: konkrétní kotvy pro 2 soupeře (3 hráči)', () => {
    assert.deepEqual(getOpponentAnchors(3), [
        { x: 180, y: 540, side: 'left' },
        { x: 1740, y: 540, side: 'right' },
    ]);
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
    setWorld([{}, {}, {}], 0); // 3 hráči; pid=1 → diff 1 → kotva left {180,540}
    // cardH = 500*0.27 = 135; left → x = 180 - 135*1.1 = 31.5
    assert.deepEqual(getPlayerHandPos(1), { x: 31.5, y: 540 });
});

test('getPlayerHandPos: soupeř vpravo je odsazen doprava', () => {
    setWorld([{}, {}, {}], 0); // pid=2 → diff 2 → kotva right {1740,540}
    // right → x = 1740 + 135*1.1 = 1888.5
    assert.deepEqual(getPlayerHandPos(2), { x: 1888.5, y: 540 });
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
    setWorld([{}, {}, {}], null); // pid=1 → diff 1 → kotva left {180,540} → {31.5,540}
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
    setWorld([{}, { health: 4, weapon: { id: -1 }, board: [] }, {}], 0); // 3 hráči
    // pid=1 → kotva left {180,540}; cardW=87.75, cardH=135, gap=10
    // numBlue=0; groupH=87.75; livesCY = 540 + 43.875 - 67.5 = 516.375
    // boardIdx 0: col 0, rowInCol 0 → x=180, y = 516.375 - 97.75 = 418.625
    assert.deepEqual(getBoardCardPos(1, 0), { x: 180, y: 418.625 });
});

// ── getDeadRoleCardPos: kam dosedne odhalená role vyřazeného hráče ───────────
test('getDeadRoleCardPos: slot 0 skupiny mrtvého (hned vedle jeho postavy)', () => {
    // Mrtvý soupeř vlevo s prázdným stolem: skupina = postava + 1 karta (role).
    setWorld([{}, { health: 0, weapon: { id: -1 }, board: [] }, {}], 0);
    // numBlue=1; groupH = 2*87.75 + 10 = 185.5; livesCY = 540 + 92.75 - 67.5 = 565.25
    // displayIdx 0 → y = 565.25 - 97.75 = 467.5
    assert.deepEqual(getDeadRoleCardPos(1), { x: 180, y: 467.5 });
});

test('getDeadRoleCardPos: sedí na místo, kde roli kreslí deska (slot před modrými)', () => {
    // Kdyby mrtvý ještě něco na stole měl, role je pořád první – logický boardIdx 0
    // (první modrá) musí ležet až ZA ní.
    setWorld([{}, { health: 0, weapon: { id: -1 }, board: [{ id: 7 }] }, {}], 0);
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

test('široké jeviště: krajní soupeři se přilepí na okraj', () => {
    withStage(1600, 800, (st) => {
        const [left, right] = getOpponentAnchors(3);
        assert.equal(left.x, st.left + 180);      // stejné odsazení od okraje jako dnes od kraje plátna
        assert.equal(right.x, st.right - 180);
        assert.equal(left.y, 540);                // svisle se nic nemění
        assert.equal(right.side, 'right');
    });
});

test('široké jeviště: ruka soupeře jde s kotvou, takže nezůstane v pruhu uprostřed', () => {
    withStage(1600, 800, (st) => {
        setWorld([{}, {}, {}], 0);
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
