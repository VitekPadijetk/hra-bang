// Profil rozložení (core/layout.js). V prohlížeči je globál (načítá se dřív),
// v Node/testech se dotáhne přes require. Vlastní název modulové proměnné, ať se
// nekříží s lexikálními globály z core/layout.js.
var _layoutMod = (typeof module !== 'undefined' && module.exports) ? require('./core/layout.js') : null;
function _L() { return _layoutMod ? _layoutMod.currentLayout() : currentLayout(); }
function _stretchAnchors(row, L) { return (_layoutMod ? _layoutMod.stretchAnchors : stretchAnchors)(row, L); }
// Kompaktní řada soupeřů (mobil) – geometrii vlastní core/layout.js, tady se jen volá,
// aby zacílení animací sedělo s tím, co kreslí view/board.js.
function _compactMetrics(n, L)  { return (_layoutMod ? _layoutMod.compactMetrics : compactMetrics)(n, L); }
function _compactAnchors(n, L)  { return (_layoutMod ? _layoutMod.compactAnchors : compactAnchors)(n, L); }
function _compactBoardPos(a, i, k, m) { return (_layoutMod ? _layoutMod.compactBoardPos : compactBoardPos)(a, i, k, m); }
function _compactHandPos(a, i, k, m)  { return (_layoutMod ? _layoutMod.compactHandPos : compactHandPos)(a, i, k, m); }
function _myHandSlotX(L, i, k)  { return (_layoutMod ? _layoutMod.myHandSlotX : myHandSlotX)(L, i, k); }
// Pás vyložených karet (pevný počet slotů, od přeplnění se zmenšuje rozestup v řadě).
function _boardBand(k, rows, perRow, ext, gap) { return (_layoutMod ? _layoutMod.boardBand : boardBand)(k, rows, perRow, ext, gap); }
function _boardSlot(i, band)    { return (_layoutMod ? _layoutMod.boardSlot : boardSlot)(i, band); }
// Měřítko karet soupeře. U okruhu závisí na POČTU soupeřů (oppScaleByCount), u kompaktní
// řady se dopočítává ze šířky sloupce – ptát se proto přes tohle, ne na L.scaleOpp.
function _oppScale(L, n)        { return (_layoutMod ? _layoutMod.oppScale : oppScale)(L, n); }

// Jediný zdroj pravdy pro kotevní body soupeřů. Klíč = počet protihráčů
// (= počet hráčů − 1). Konzumuje positions.js i view/board.js. Mobilní profil
// si přináší vlastní tabulku (L.anchors), tahle je základní/desktopová.
const OPPONENT_ANCHORS = {
    1: [{x:960,y:150,side:'top'}],
    // Hra pro 3 (Město duchů): oba soupeři sedí NAPROTI vedle sebe, ne po bocích –
    // rozteč je z řádku pro 4 soupeře, takže je odzkoušená.
    2: [{x:600,y:150,side:'top'},{x:1320,y:150,side:'top'}],
    3: [{x:180,y:540,side:'left'},{x:960,y:150,side:'top'},{x:1740,y:540,side:'right'}],
    4: [{x:180,y:640,side:'left'},{x:600,y:150,side:'top'},{x:1320,y:150,side:'top'},{x:1740,y:587,side:'right'}],
    5: [{x:180,y:665,side:'left'},{x:180,y:240,side:'left'},{x:960,y:150,side:'top'},{x:1740,y:187,side:'right'},{x:1740,y:612,side:'right'}],
    6: [{x:180,y:665,side:'left'},{x:180,y:240,side:'left'},{x:715,y:150,side:'top'},{x:1205,y:150,side:'top'},{x:1740,y:187,side:'right'},{x:1740,y:612,side:'right'}],
    // Hra pro 8 (Město duchů): 2 vlevo, 3 nahoře, 2 vpravo. Boky mají y jako u 6 soupeřů,
    // nahoře se rozteč zmenší na 430 – proto se při 7 soupeřích zmenší i karty
    // (oppScaleByCount v core/layout.js), aby na sebe skupiny nedosáhly.
    7: [{x:180,y:665,side:'left'},{x:180,y:240,side:'left'},
        {x:530,y:150,side:'top'},{x:960,y:150,side:'top'},{x:1390,y:150,side:'top'},
        {x:1740,y:187,side:'right'},{x:1740,y:612,side:'right'}],
};
// Kotvy roztažené na skutečnou šířku jeviště: krajní soupeři zůstávají stejně daleko
// od OKRAJE jako dnes od kraje plátna, takže na širším displeji sedí u kraje a ne
// v pruhu uprostřed. Na 16:9 vrací přesně tabulku (stretchAnchors je tam identita).
function getOpponentAnchors(totalPlayers) {
    const L = _L();
    const n = totalPlayers - 1;
    // Mobil: soupeři stojí v jedné řadě nahoře, kotvy se počítají ze šířky jeviště.
    if (L.oppMode === 'compact') return n > 0 ? _compactAnchors(n, L) : [];
    const table = L.anchors || OPPONENT_ANCHORS;
    return _stretchAnchors(table[n] || [], L);
}

function getPlayerPosition(myIdx, targetIdx, totalPlayers) {
    const diff = (targetIdx - myIdx + totalPlayers) % totalPlayers;
    if (diff === 0) return 'bottom';
    const third = Math.ceil((totalPlayers - 1) / 3);
    if (diff <= third) return 'left';
    if (diff <= third * 2) return 'top';
    return 'right';
}

function getPlayerHandPos(playerIdx) {
    if (!state) return { x: 960, y: 540 };
    // Divák (myIndex === null) sleduje z pohledu hráče 0 dole (viz renderMyIndex v board.js).
    const view = myIndex === null ? 0 : myIndex;
    const total = state.players.length;
    const L = _L();
    const cardH = 500 * _oppScale(L, total - 1);
    if (playerIdx === view) {
        // Spodní hráč: u diváka vykreslen vystředěně dole (drawSpectatorPlayer), u hráče vpravo dole.
        return myIndex === null ? { x: L.centerX, y: L.specHandY } : { x: L.myHandAnchorX, y: L.handY };
    }
    const diff = (playerIdx - view + total) % total;
    const anchor = getOpponentAnchors(total)[diff - 1];
    if (!anchor) return { x: 960, y: 540 };
    if (anchor.side === 'compact') {
        // Střed vějíře rubů (pozice je ve slotu lineární, takže prostřední slot = střed).
        const k = Math.max(1, state.players[playerIdx].hand?.length || 1);
        return _compactHandPos(anchor, (k - 1) / 2, k, _compactMetrics(total - 1, L));
    }
    if (anchor.side === 'left') return { x: anchor.x - cardH * L.oppHandOff, y: anchor.y };
    if (anchor.side === 'top') return { x: anchor.x, y: anchor.y - cardH * L.oppHandOff };
    if (anchor.side === 'right') return { x: anchor.x + cardH * L.oppHandOff, y: anchor.y };
    return { x: anchor.x, y: anchor.y };
}

// Pozice konkrétního slotu v ruce: kam dosedne karta s indexem `slotIndex`, když
// bude v ruce celkem `totalCards` karet. MUSÍ zrcadlit rozložení ruky ve
// view/board.js (drawMyArea pro spodního hráče, drawOpponents fan pro soupeře).
// Slouží k zacílení animace líznutí na finální místo karty v ruce.
function getHandSlotPos(playerIdx, slotIndex, totalCards) {
    if (!state) return { x: 960, y: 540 };
    const view = myIndex === null ? 0 : myIndex;
    const total = state.players.length;
    const len = Math.max(1, totalCards);
    const L = _L();

    if (playerIdx === view) {
        // Divák (myIndex === null) má spodního hráče vystředěného jinak → přibližně.
        if (myIndex === null) return getPlayerHandPos(playerIdx);
        // Zrcadlí drawMyArea: vodorovný pás dole od handStartX do handEndX, Y = handY
        // (na desktopu je handY = myBaseY, na mobilu má ruka vlastní řadu pod stolem).
        return { x: _myHandSlotX(L, slotIndex, len), y: L.handY };
    }

    const diff = (playerIdx - view + total) % total;
    const anchor = getOpponentAnchors(total)[diff - 1];
    if (!anchor) return getPlayerHandPos(playerIdx);
    if (anchor.side === 'compact') return _compactHandPos(anchor, slotIndex, len, _compactMetrics(total - 1, L));
    // Zrcadlí fan ruky soupeřů v drawOpponents (left/right svisle, top vodorovně).
    const scaleOpp = _oppScale(L, total - 1);
    const cardW = 325 * scaleOpp, cardH = 500 * scaleOpp;
    const maxHand = cardH * L.oppFanSpan;
    const rawSpacing = len > 1 ? Math.min(cardW * L.oppFanFrac, L.oppFanMax) : 0;
    const handSpacing = len > 1 ? Math.min(rawSpacing, maxHand / (len - 1)) : 0;
    const span = (len - 1) * handSpacing;
    if (anchor.side === 'left')  return { x: anchor.x - cardH * L.oppHandOff, y: anchor.y - span / 2 + slotIndex * handSpacing };
    if (anchor.side === 'right') return { x: anchor.x + cardH * L.oppHandOff, y: anchor.y - span / 2 + slotIndex * handSpacing };
    if (anchor.side === 'top')   return { x: anchor.x - span / 2 + slotIndex * handSpacing, y: anchor.y - cardH * L.oppHandOff };
    return getPlayerHandPos(playerIdx);
}

function getBoardCardPos(playerIdx, boardIdx) {
    if (!state) return { x: 960, y: 540 };
    const player = state.players[playerIdx];
    const view = myIndex === null ? 0 : myIndex;
    const total = state.players.length;
    const L = _L();
    const scaleOpp = _oppScale(L, total - 1);
    const scaleMe = L.scaleMe;

    if (playerIdx === view) {
        // Divák: spodní hráč (seat 0) má desku vystředěnou dole (drawSpectatorPlayer) – přibližně.
        if (myIndex === null) return { x: L.centerX, y: L.specLivesY };
        const myBaseY = L.myBaseY, roleX = L.livesX + L.roleOffX;
        const myCardW = 325 * scaleMe;
        const boardCardH = 500 * scaleMe;
        // Pás vyložených karet – MUSÍ zrcadlit drawMyArea v view/board.js. Ve stole je
        // vždycky i zbraň (bez skutečné leží na jejím místě Colt .45), proto 1 + board.
        const myCount = Math.max(boardIdx + 1, 1 + (player.board?.length || 0));
        const band = _boardBand(myCount, L.myBoardRows, L.boardMaxPerRow, myCardW, L.boardGap);
        const s = _boardSlot(boardIdx, band);
        const bx = roleX - (myCardW + L.boardGap) - s.col * band.step;
        const by = myBaseY - s.row * (boardCardH + L.boardGap);
        return { x: bx, y: by };
    }

    const cardW = 325 * scaleOpp;
    const cardH = 500 * scaleOpp;
    const gap = L.oppGap;
    const diff = (playerIdx - view + total) % total;
    const anchor = getOpponentAnchors(total)[diff - 1];
    if (!anchor) return { x: 960, y: 540 };

    // Karta role zabírá první slot skupiny: u vyřazeného hráče (odhalí se při smrti) a ve
    // hře pro 3 (Město duchů) u každého od začátku hry. MUSÍ zrcadlit `_roleSlot`
    // v drawOpponents (view/board.js), jinak by animace mířily o kartu vedle.
    const hasRoleCard = !!state.mode3p || player.health <= 0;
    const numBoardCards = Math.max(boardIdx, (hasRoleCard ? 1 : 0) + (player.weapon?.id !== -1 ? 1 : 0) + (player.board?.length || 0));
    const numBlue = Math.min(numBoardCards, L.oppBoardPerRow);
    const displayIdx = hasRoleCard ? boardIdx + 1 : boardIdx;
    const count = Math.max(displayIdx + 1, numBoardCards);

    if (anchor.side === 'compact') {
        // Jedna řada pod jmenovkou; rozestup zná compactBoardStep (od 4. karty překryv).
        return _compactBoardPos(anchor, displayIdx, count, _compactMetrics(total - 1, L));
    }
    // Pás vyložených karet – MUSÍ zrcadlit drawOpponents v view/board.js. `band.row` roste
    // dovnitř stolu (k balíčkům) a je zastropovaný, `band.col` jde podél řady se
    // zmenšujícím se rozestupem.
    const band = _boardBand(count, L.oppBoardRows, L.oppBoardPerRow, cardW, gap);
    const s = _boardSlot(displayIdx, band);
    if (anchor.side === 'left') {
        const groupH = (1 + numBlue) * cardW + numBlue * gap;
        const livesCY = anchor.y + groupH / 2 - cardH / 2;
        return { x: anchor.x + s.row * (cardH + gap), y: livesCY - (cardW + gap) - s.col * band.step };
    }
    if (anchor.side === 'top') {
        const groupW = (1 + numBlue) * cardW + numBlue * gap;
        const groupStartX = anchor.x - groupW / 2;
        return { x: groupStartX + (cardW + gap) + cardW / 2 + s.col * band.step, y: anchor.y + s.row * (cardH + gap) };
    }
    if (anchor.side === 'right') {
        const groupH = (1 + numBlue) * cardW + numBlue * gap;
        const livesCY = anchor.y - groupH / 2 + cardH / 2;
        return { x: anchor.x - s.row * (cardH + gap), y: livesCY + (cardW + gap) + s.col * band.step };
    }
    return getPlayerHandPos(playerIdx);
}

// Kam u vyřazeného hráče dosedne jeho odhalená karta role: je to display-slot 0
// jeho skupiny (viz displayCards v drawOpponents), tj. o jednu pozici PŘED prvním
// „logickým" boardIdx – proto boardIdx = −1 (getBoardCardPos mrtvému připočítává +1).
// Volat až ve chvíli, kdy je hráč ve stavu opravdu mrtvý a stůl prázdný.
function getDeadRoleCardPos(playerIdx) {
    return getBoardCardPos(playerIdx, -1);
}

// Pozice i-tého slotu řady hokynářství na stole (vodorovná řada pod zvednutými
// balíčky). lift = aktuální vyzvednutí balíčků (App.storePileLiftY). MUSÍ zrcadlit
// rozložení v board.js (drawPhaseOverlays STORE + drawDrawPiles).
function getStoreSlotPos(i, count, lift) {
    const L = _L();
    const pileY = L.pileY - (lift || 0);
    const rowY = pileY + L.storeRowOffY;   // řada kousek pod zvednutými balíčky (o trochu větší mezera)
    const spacing = L.storeSpacing;
    const startX = L.centerX - (count - 1) * spacing / 2;
    return { x: startX + i * spacing, y: rowY };
}

// Izomorfní: v prohlížeči globály, v Node/testech require('./positions.js').
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getPlayerPosition, getPlayerHandPos, getHandSlotPos, getBoardCardPos, getDeadRoleCardPos, getStoreSlotPos, getOpponentAnchors, OPPONENT_ANCHORS };
}
