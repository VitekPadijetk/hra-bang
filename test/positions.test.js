const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    getPlayerPosition, getPlayerHandPos, getBoardCardPos, getOpponentAnchors,
} = require('../positions.js');

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

test('getBoardCardPos: bez stavu → střed', () => {
    global.state = null;
    assert.deepEqual(getBoardCardPos(0, 0), { x: 960, y: 540 });
});
