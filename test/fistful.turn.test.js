// Rozšíření A Fistful of Cards – fáze 6: start tahu.
//   Pokrevní bratři  – před lízáním smí hráč darovat 1 život zraněnému,
//   Fistful of Cards – na začátku tahu tolik zásahů Bang!, kolik má karet v ruce,
//   Mrtvý muž        – první vyřazený se ve svém tahu vrací se 2 životy a 2 kartami.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { pendingActor } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));
const ff = key => ffData.find(c => c.key === key);
const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));
const hn = key => hnData.find(c => c.key === key);

// Hra s právě platnou kartou Fistfulu (přípravu balíčku řeší fistful.test.js).
function mkEv(specs, key, opts = {}) {
    const g = mkGame(specs, opts);
    if (key) g.activeFistful = ff(key);
    return g;
}

// Start tahu přesně jako nextTurn: nejdřív události, pak kontroly Dynamit/Vězení.
function startTurn(g) {
    if (g._beginTurn()) return;
    g.handleStartOfTurnChecks();
}

// ── Pokrevní bratři ─────────────────────────────────────────────────────────

test('Pokrevní bratři: nabídnou se před lízáním, když je co dát a komu', () => {
    const g = mkEv([{ role: 'Sheriff' }, { health: 2 }, {}], 'POKREVNI_BRATRI');
    startTurn(g);
    assert.equal(g.phase, 'BLOOD_BROTHERS');
    assert.deepEqual(g.pendingBlood, { playerIdx: 0, targets: [1] });
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'BLOOD_BROTHERS' });
});

test('Pokrevní bratři: bez zraněného cíle se fáze lízání rozjede rovnou', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'POKREVNI_BRATRI');
    startTurn(g);
    assert.equal(g.phase, 'DRAW');
});

test('Pokrevní bratři: s jedním životem se nenabídnou (nesmí se tím zabít)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 1 }, { health: 2 }], 'POKREVNI_BRATRI');
    startTurn(g);
    assert.equal(g.phase, 'DRAW');
});

test('Pokrevní bratři: mrtvý ani plně zdravý není cíl (R9)', () => {
    const g = mkEv([{ role: 'Sheriff' }, { health: 0 }, {}, { health: 3 }], 'POKREVNI_BRATRI');
    startTurn(g);
    assert.deepEqual(g.pendingBlood.targets, [3]);
});

test('Pokrevní bratři: darování ubere dárci a přidá cíli, pak se líže', () => {
    const g = mkEv([{ role: 'Sheriff', health: 4 }, { health: 2 }], 'POKREVNI_BRATRI');
    startTurn(g);
    assert.equal(g.resolveBloodBrothers(0, 1), true);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.active, true);
});

test('Pokrevní bratři: „Ne, děkuji" rozjede lízání beze změny životů', () => {
    const g = mkEv([{ role: 'Sheriff', health: 4 }, { health: 2 }], 'POKREVNI_BRATRI');
    startTurn(g);
    assert.equal(g.resolveBloodBrothers(0, null), true);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.phase, 'DRAW');
});

test('Pokrevní bratři: neplatný cíl se bere jako odmítnutí', () => {
    const g = mkEv([{ role: 'Sheriff', health: 4 }, { health: 2 }, {}], 'POKREVNI_BRATRI');
    startTurn(g);
    g.resolveBloodBrothers(0, 2);   // hráč 2 je na plných životech
    assert.equal(g.players[0].health, 4);
    assert.equal(g.players[2].health, 4);
    assert.equal(g.phase, 'DRAW');
});

test('Pokrevní bratři: v jednom tahu jen jednou', () => {
    const g = mkEv([{ role: 'Sheriff', health: 4 }, { health: 2 }], 'POKREVNI_BRATRI');
    startTurn(g);
    g.resolveBloodBrothers(0, null);
    g.startDrawPhase();             // druhý průchod (jako po Vendetě uvnitř téhož tahu)
    assert.equal(g.phase, 'DRAW', 'nabídka se nevrací');
});

test('Pokrevní bratři: ve vězení se nenabídnou (tah se přeskočí)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 4 }, { health: 2 }], 'POKREVNI_BRATRI');
    board(g, 0, CardType.JAIL);
    topDeck(g, Suits.SPADES, '5');   // ne srdce → vězení tah bere
    startTurn(g);
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1, 'tah přeskočen');
    assert.notEqual(g.phase, 'BLOOD_BROTHERS');
});

test('Pokrevní bratři: Bart Cassidy si za darovaný život lízne PŘED fází lízání', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Bart Cassidy', health: 4 }, { health: 2 }], 'POKREVNI_BRATRI');
    startTurn(g);
    g.resolveBloodBrothers(0, 1);
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(0);
    assert.equal(g.phase, 'DRAW', 'po dobrání fronty se rozjede lízání');
    assert.equal(g.drawPhaseState.active, true);
});

test('Pokrevní bratři: bot dá život jistému spojenci, jinak odmítne', () => {
    const g = mkEv([{ role: 'Sheriff', health: 4 }, { role: 'Deputy', health: 1 }], 'POKREVNI_BRATRI');
    g.players[1]._roleRevealed = true;
    startTurn(g);
    const a = decideBotAction(g, 0, { 0: { Sheriff: 1 }, 1: { Deputy: 1 } });
    assert.equal(a.event, 'blood_brothers');
    assert.equal(a.payload.targetIdx, 1);

    const g2 = mkEv([{ role: 'Sheriff', health: 4 }, { role: 'Outlaw', health: 1 }], 'POKREVNI_BRATRI');
    startTurn(g2);
    const b = decideBotAction(g2, 0, { 0: { Sheriff: 1 }, 1: { Outlaw: 1 } });
    assert.equal(b.payload.targetIdx, null, 'nepříteli se život nedává');
});

// ── Fistful of Cards ────────────────────────────────────────────────────────

test('Fistful of Cards: tolik zásahů, kolik má hráč karet v ruce', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'FISTFUL_OF_CARDS');
    give(g, 0, CardType.BANG); give(g, 0, CardType.BANG);
    startTurn(g);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 0);
    assert.equal(g.pendingResponse.originatorIdx, null, 'útočník žádný není');
    assert.equal(g.pendingFistful.hitsLeft, 1, 'první zásah běží, druhý čeká');
});

test('Fistful of Cards: prázdná ruka fázi přeskočí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'FISTFUL_OF_CARDS');
    startTurn(g);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.pendingFistful, null);
});

test('Fistful of Cards: každý zásah se schytává zvlášť a pak se líže', () => {
    const g = mkEv([{ role: 'Sheriff', health: 5 }, {}], 'FISTFUL_OF_CARDS');
    give(g, 0, CardType.BEER); give(g, 0, CardType.BEER);
    startTurn(g);
    g.handleResponse(0, null);          // 1. zásah schytán
    assert.equal(g.phase, 'RESPOND', '2. zásah rovnou navazuje');
    g.handleResponse(0, null);          // 2. zásah schytán
    assert.equal(g.players[0].health, 3);
    assert.equal(g.pendingFistful, null);
    assert.equal(g.phase, 'DRAW');
});

test('Fistful of Cards: počet zásahů se zmrazí – zahrané Vedle! ho nesnižuje', () => {
    const g = mkEv([{ role: 'Sheriff', health: 5 }, {}], 'FISTFUL_OF_CARDS');
    give(g, 0, CardType.MISSED); give(g, 0, CardType.MISSED); give(g, 0, CardType.MISSED);
    startTurn(g);
    g.handleResponse(0, 0);             // uhnul
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(0, 0);             // uhnul
    assert.equal(g.phase, 'RESPOND', 'třetí zásah přijde, i když v ruce zbývá jedna karta');
    g.handleResponse(0, 0);             // uhnul
    assert.equal(g.players[0].health, 5, 'ani jeden zásah nedopadl');
    assert.equal(g.phase, 'DRAW');
});

test('Fistful of Cards: Barel uhne jednomu zásahu ze série', () => {
    const g = mkEv([{ role: 'Sheriff', health: 5 }, {}], 'FISTFUL_OF_CARDS');
    give(g, 0, CardType.BEER);
    board(g, 0, CardType.BARREL);
    topDeck(g, Suits.HEARTS, '5');
    startTurn(g);
    assert.equal(g.phase, 'BARREL_DRAW');
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.players[0].health, 5, 'barel uhnul');
    assert.equal(g.phase, 'DRAW', 'byl to jediný zásah, fáze lízání navazuje');
});

test('Fistful of Cards: ducha (Město duchů) míjí (R10)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'FISTFUL_OF_CARDS');
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[0].health = 0;
    g.players[0]._ghost = true;
    give(g, 0, CardType.BANG);
    startTurn(g);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.pendingFistful, null);
});

test('Fistful of Cards: smrt uprostřed série zahodí zbytek a posune tah', () => {
    const g = mkEv([{ role: 'Outlaw', health: 1 }, { role: 'Sheriff' }, { role: 'Renegade' }],
                   'FISTFUL_OF_CARDS');
    give(g, 0, CardType.BANG); give(g, 0, CardType.BANG); give(g, 0, CardType.BANG);
    startTurn(g);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 0);
    assert.equal(g.pendingFistful, null, 'zbylé zásahy propadly');
    assert.equal(g.currentPlayerIndex, 1, 'tah se posunul');
    // Za smrt bez útočníka nikdo nedostane odměnu (stejně jako u dynamitu).
    assert.equal(g.specialActionQueue.some(a => a.type === 'KILL_REWARD'), false);
});

test('Fistful of Cards: Pivo na posledním životě zachrání jeden zásah', () => {
    const g = mkEv([{ role: 'Sheriff', health: 1 }, {}, {}], 'FISTFUL_OF_CARDS');
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.MISSED);
    startTurn(g);
    assert.equal(g.pendingFistful.hitsLeft, 1);
    assert.equal(g.beerLastLifeSave(0, 0), true);
    assert.equal(g.players[0].health, 1);
    assert.equal(g.phase, 'RESPOND', 'druhý zásah navazuje');
    g.handleResponse(0, 0);            // uhnul zbylým Vedle!
    assert.equal(g.phase, 'DRAW');
});

// ── Mrtvý muž ───────────────────────────────────────────────────────────────

// Hra, ve které je hráč 1 vyřazený jako první.
function mkDeadMan(eventKey = 'MRTVY_MUZ') {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }], eventKey);
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS, '5');
    give(g, 1, CardType.BANG);
    g.players[1].health = 1;
    g.handleDamage(1, 0);
    return g;
}

test('Mrtvý muž: první vyřazený se ve svém tahu vrací se 2 životy a 2 kartami', () => {
    const g = mkDeadMan();
    assert.equal(g._firstDeadIdx, 1);
    g.specialActionQueue.length = 0;   // odměna za banditu tenhle test nezajímá
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1, 'v pořadí se nepřeskakuje');
    assert.equal(g.players[1].health, 2);
    assert.equal(g.players[1]._ghost, false, 'vrací se doopravdy, ne jako duch');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 2, 'dvě karty si líže ručně');
    assert.equal(g.drawPhaseState.isKillReward, true);
    // Po dobrání karet se dotočí start tahu a rozjede se vlastní fáze lízání.
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[1].hand.length, 2);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isStartOfTurn, true, 'navazuje normální fáze lízání');
});

test('Mrtvý muž: vrací se jen jednou', () => {
    const g = mkDeadMan();
    g.specialActionQueue.length = 0;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g._deadManUsed, true);
    g.players[1].health = 0;           // zase ho vyřadili
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 2, 'podruhé se přeskakuje');
});

test('Mrtvý muž: bez aktivní karty se nevrací', () => {
    const g = mkDeadMan(null);
    g.specialActionQueue.length = 0;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 2);
});

test('Mrtvý muž: role zůstává odkrytá i po návratu do hry', () => {
    const g = mkDeadMan();
    assert.equal(g.players[1]._roleRevealed, true);
    g.specialActionQueue.length = 0;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.players[1].health, 2);
    assert.equal(g.players[1]._roleRevealed, true, 'zpátky ve hře, ale roli už všichni znají');
});

test('Mrtvý muž s Městem duchů: první vyřazený se vrací natrvalo, ostatní jako duchové', () => {
    const g = mkDeadMan();
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[2].health = 0;           // druhý vyřazený
    g.specialActionQueue.length = 0;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1]._ghost, false, 'Mrtvý muž má přednost před duchem');
    assert.equal(g.players[1].health, 2);
    // Další v pořadí je duch (Město duchů).
    while (g.phase === 'DRAW' && g.drawPhaseState.active) g.drawCard('deck');
    g.players[1].hand = [];
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 2);
    assert.equal(g.players[2]._ghost, true);
});

test('Mrtvý muž: příprava hry vyčistí značky z minulé partie', () => {
    const g = mkDeadMan();
    g.fistfulCardData = ffData;
    g._setupFistfulDeck({ expansions: { fistful: true } });
    assert.equal(g._firstDeadIdx, null);
    assert.equal(g._deadManUsed, false);
    assert.equal(g.players[1]._roleRevealed, false);
});
