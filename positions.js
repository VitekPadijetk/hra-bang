// Jediný zdroj pravdy pro kotevní body soupeřů. Klíč = počet protihráčů
// (= počet hráčů − 1). Konzumuje positions.js i view/board.js.
const OPPONENT_ANCHORS = {
    1: [{x:960,y:150,side:'top'}],
    2: [{x:180,y:540,side:'left'},{x:1740,y:540,side:'right'}],
    3: [{x:180,y:540,side:'left'},{x:960,y:150,side:'top'},{x:1740,y:540,side:'right'}],
    4: [{x:180,y:640,side:'left'},{x:600,y:150,side:'top'},{x:1320,y:150,side:'top'},{x:1740,y:587,side:'right'}],
    5: [{x:180,y:665,side:'left'},{x:180,y:240,side:'left'},{x:960,y:150,side:'top'},{x:1740,y:187,side:'right'},{x:1740,y:612,side:'right'}],
    6: [{x:180,y:665,side:'left'},{x:180,y:240,side:'left'},{x:715,y:150,side:'top'},{x:1205,y:150,side:'top'},{x:1740,y:187,side:'right'},{x:1740,y:612,side:'right'}],
};
function getOpponentAnchors(totalPlayers) {
    return OPPONENT_ANCHORS[totalPlayers - 1] || [];
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
    const cardH = 500 * 0.27;
    if (playerIdx === view) {
        // Spodní hráč: u diváka vykreslen vystředěně dole (drawSpectatorPlayer), u hráče vpravo dole.
        return myIndex === null ? { x: 960, y: 1065 } : { x: 1450, y: 970 };
    }
    const diff = (playerIdx - view + total) % total;
    const anchor = getOpponentAnchors(total)[diff - 1];
    if (!anchor) return { x: 960, y: 540 };
    if (anchor.side === 'left') return { x: anchor.x - cardH * 1.1, y: anchor.y };
    if (anchor.side === 'top') return { x: anchor.x, y: anchor.y - cardH * 1.1 };
    if (anchor.side === 'right') return { x: anchor.x + cardH * 1.1, y: anchor.y };
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

    if (playerIdx === view) {
        // Divák (myIndex === null) má spodního hráče vystředěného jinak → přibližně.
        if (myIndex === null) return getPlayerHandPos(playerIdx);
        // Zrcadlí drawMyArea: vodorovný pás dole od livesX+160 do 1860, Y = myBaseY.
        const livesX = 1050, myBaseY = 970;
        const handAreaStart = livesX + 160;
        const handAreaWidth = 1860 - handAreaStart;
        const spacing = Math.min(117, handAreaWidth / len);
        return { x: handAreaStart + slotIndex * spacing, y: myBaseY };
    }

    const diff = (playerIdx - view + total) % total;
    const anchor = getOpponentAnchors(total)[diff - 1];
    if (!anchor) return getPlayerHandPos(playerIdx);
    // Zrcadlí fan ruky soupeřů v drawOpponents (left/right svisle, top vodorovně).
    const scaleOpp = 0.27;
    const cardW = 325 * scaleOpp, cardH = 500 * scaleOpp;
    const maxHand = cardH * 3.5;
    const rawSpacing = len > 1 ? Math.min(cardW * 0.35, 36) : 0;
    const handSpacing = len > 1 ? Math.min(rawSpacing, maxHand / (len - 1)) : 0;
    const span = (len - 1) * handSpacing;
    if (anchor.side === 'left')  return { x: anchor.x - cardH * 1.1, y: anchor.y - span / 2 + slotIndex * handSpacing };
    if (anchor.side === 'right') return { x: anchor.x + cardH * 1.1, y: anchor.y - span / 2 + slotIndex * handSpacing };
    if (anchor.side === 'top')   return { x: anchor.x - span / 2 + slotIndex * handSpacing, y: anchor.y - cardH * 1.1 };
    return getPlayerHandPos(playerIdx);
}

function getBoardCardPos(playerIdx, boardIdx) {
    if (!state) return { x: 960, y: 540 };
    const player = state.players[playerIdx];
    const view = myIndex === null ? 0 : myIndex;
    const scaleOpp = 0.27;
    const scaleMe = 0.36;

    if (playerIdx === view) {
        // Divák: spodní hráč (seat 0) má desku vystředěnou dole (drawSpectatorPlayer) – přibližně.
        if (myIndex === null) return { x: 960, y: 900 };
        const livesX = 1050, myBaseY = 970, roleX = livesX - 200;
        const boardCardW = 325 * scaleMe + 10;
        const boardCardH = 500 * scaleMe;
        const boardMaxPerRow = 6;   // MUSÍ zrcadlit drawMyArea v view/board.js
        const bRow = Math.floor(boardIdx / boardMaxPerRow);
        const bCol = boardIdx % boardMaxPerRow;
        const bx = roleX - boardCardW - (bCol * boardCardW);
        const by = myBaseY - bRow * (boardCardH + 10);
        return { x: bx, y: by };
    }

    const total = state.players.length;
    const cardW = 325 * scaleOpp;
    const cardH = 500 * scaleOpp;
    const gap = 10;
    const diff = (playerIdx - view + total) % total;
    const anchor = getOpponentAnchors(total)[diff - 1];
    if (!anchor) return { x: 960, y: 540 };

    const isDead = player.health <= 0;
    const numBoardCards = Math.max(boardIdx, (isDead ? 1 : 0) + (player.weapon?.id !== -1 ? 1 : 0) + (player.board?.length || 0));
    const numBlue = Math.min(numBoardCards, 3);
    const displayIdx = isDead ? boardIdx + 1 : boardIdx;

    if (anchor.side === 'left') {
        const groupH = (1 + numBlue) * cardW + numBlue * gap;
        const livesCY = anchor.y + groupH / 2 - cardH / 2;
        const rowInCol = displayIdx % 3;
        const col = Math.floor(displayIdx / 3);
        return { x: anchor.x + col * (cardH + gap), y: livesCY - (1 + rowInCol) * (cardW + gap) };
    }
    if (anchor.side === 'top') {
        const groupW = (1 + numBlue) * cardW + numBlue * gap;
        const groupStartX = anchor.x - groupW / 2;
        const colInRow = displayIdx % 3;
        const row = Math.floor(displayIdx / 3);
        return { x: groupStartX + (1 + colInRow) * (cardW + gap) + cardW / 2, y: anchor.y + row * (cardH + gap) };
    }
    if (anchor.side === 'right') {
        const groupH = (1 + numBlue) * cardW + numBlue * gap;
        const livesCY = anchor.y - groupH / 2 + cardH / 2;
        const rowInCol = displayIdx % 3;
        const col = Math.floor(displayIdx / 3);
        return { x: anchor.x - col * (cardH + gap), y: livesCY + (1 + rowInCol) * (cardW + gap) };
    }
    return getPlayerHandPos(playerIdx);
}

// Pozice i-tého slotu řady hokynářství na stole (vodorovná řada pod zvednutými
// balíčky). lift = aktuální vyzvednutí balíčků (App.storePileLiftY). MUSÍ zrcadlit
// rozložení v board.js (drawPhaseOverlays STORE + drawDrawPiles).
function getStoreSlotPos(i, count, lift) {
    const pileY = 540 - (lift || 0);
    const rowY = pileY + 188;   // řada kousek pod zvednutými balíčky (o trochu větší mezera)
    const spacing = 120;
    const startX = 960 - (count - 1) * spacing / 2;
    return { x: startX + i * spacing, y: rowY };
}

// Izomorfní: v prohlížeči globály, v Node/testech require('./positions.js').
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getPlayerPosition, getPlayerHandPos, getHandSlotPos, getBoardCardPos, getStoreSlotPos, getOpponentAnchors, OPPONENT_ANCHORS };
}
