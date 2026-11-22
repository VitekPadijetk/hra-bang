// Rozšíření Ozbrojení a nebezpeční – fáze A4: Bomba (zahrání, sejmutí na začátku tahu,
// předání, výbuch na začátku tahu i cizí rukou) + bot.
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §4 (Bomba), R5.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GameState, CardType, Suits, Card } = require('../logic.js');
const { cardPlayability } = require('../core/playability.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { pendingActor, waitingStatus, describePendingCheck } = require('../core/pending.js');
const { getActionForCard } = require('../core/cardRules.js');
const A = require('../core/armed.js');
const { mkGame, mkCard, give, board, topDeck } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const AD_ON = { expansions: { ozbrojeni: true } };

let _seq = 96000;
function adCard(name) {
    const row = adData.find(c => c.name === name);
    const c = new Card(_seq++, row.name, CardType[row.type], Suits[row.suit], row.value, row.props || {});
    c.effect = row.props?.effect || null;
    c.exp = row.exp; c.border = row.border; c.art = row.art;
    return c;
}
function giveAd(g, idx, name) {
    g.players[idx].hand.push(adCard(name));
    return g.players[idx].hand.length - 1;
}
function armed(g, idx, name, n = 3) {
    const c = adCard(name);
    if (c.type === CardType.WEAPON) g.players[idx].weapon = c; else g.players[idx].board.push(c);
    g._adAdd(c, n, { fresh: true });
    return c;
}
function mkAd(specs, opts) {
    const g = mkGame(specs, opts);
    g.options = AD_ON;
    g.turnId = 7;
    for (let i = 0; i < 20; i++) g.deck.cards.unshift(mkCard(CardType.MISSED, { suit: Suits.SPADES }));
    return g;
}
// Začátek tahu hráče `idx` (nový turnId – sejmutí je jedno za tah).
function startTurn(g, idx) {
    g.currentPlayerIndex = idx;
    g.turnId++;
    g.phase = 'PLAY';
    g.handleStartOfTurnChecks();
}

// ── Zahrání ──────────────────────────────────────────────────────────────────

test('Bomba: míří se na libovolného hráče (i sebe), vyloží se se 3 žetony, žeton za modrou ne', () => {
    const g = mkAd([{}, {}, {}, {}, {}]);
    const bi = giveAd(g, 0, 'Bomba');
    const card = g.players[0].hand[bi];
    assert.equal(getActionForCard(card, []), 'Bomba');
    assert.equal(cardPlayability(g, g.players[0], 0, card), true);
    assert.deepEqual(A.adBombTargets(g, 0), [0, 1, 2, 3, 4], 'kdokoli ve hře bez ohledu na vzdálenost');
    g.playSpecialCard(0, 2, bi);
    const bomb = g.players[2].board[0];
    assert.equal(bomb.type, CardType.AD_BOMB);
    assert.equal(bomb.adLoads, 3);
    assert.equal(A.adSupply(g), 29);
    assert.equal(g.phase, 'PLAY', 'oranžová karta žeton za zahrání nedává (R-U2)');
    assert.deepEqual(A.adBombTargets(g, 0), [0, 1, 3, 4], 'kdo ji má, druhou nedostane');
});

test('Bomba: bez 3 žetonů v zásobě nejde zahrát', () => {
    const g = mkAd([{}, {}, {}, {}, {}, {}, {}, {}]);
    // 30 žetonů na postavách → v zásobě zbývají 2.
    for (let i = 0; i < 8 && A.adSupply(g) > 2; i++) g._adAdd(g.players[i], Math.min(4, A.adSupply(g) - 2));
    assert.equal(A.adSupply(g), 2);
    const bi = giveAd(g, 0, 'Bomba');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[bi]), false);
    g.playSpecialCard(0, 1, bi);
    assert.equal(g.players[0].hand.length, 1, 'karta zůstala v ruce');
});

test('Bomba: Apache Kid je vůči kárové Bombě imunní (odhodí se naprázdno)', () => {
    const g = mkAd([{}, { character: 'Apache Kid' }, {}]);
    g.playSpecialCard(0, 1, giveAd(g, 0, 'Bomba'));
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.deck.discardTop().type, CardType.AD_BOMB);
    assert.equal(A.adSupply(g), 32);
});

// ── Sejmutí na začátku tahu ─────────────────────────────────────────────────

test('Bomba ♥♦: majitel vybere, komu ji pošle – jde i se žetony, pak lízání', () => {
    const g = mkAd([{}, {}, {}]);
    const bomb = armed(g, 1, 'Bomba', 3);
    topDeck(g, Suits.DIAMONDS, '5');
    startTurn(g, 1);
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(describePendingCheck(g, 1).kind, 'AD_BOMB');
    g.triggerCheckDraw();
    assert.equal(g.currentCheck.reason, 'AD_BOMB');
    g.resolveCheck();
    assert.equal(g.phase, 'AD_BOMB_PASS');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'AD_BOMB_PASS' });
    assert.equal(waitingStatus(g).text, 'Bomba – vybírá, komu ji pošle');
    assert.deepEqual(A.adBombPassTargets(g, 1), [0, 2]);
    assert.equal(g.adBombPass(1, 1), false, 'sobě ne');
    assert.equal(g.adBombPass(1, 2), true);
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.players[2].board[0], bomb);
    assert.equal(bomb.adLoads, 3, 'žetony jdou s kartou');
    assert.equal(g.lastAnimEvent.type, 'dynamite_pass');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
});

test('Bomba ♣♠: odhodí 2 ⛁; když dojdou, vybuchne za 2 klikané životy bez útočníka', () => {
    const g = mkAd([{}, {}, {}]);
    const bomb = armed(g, 1, 'Bomba', 3);
    topDeck(g, Suits.CLUBS, '5');
    startTurn(g, 1);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(bomb.adLoads, 1);
    assert.equal(g.players[1].board[0], bomb, 'zůstává ležet');
    assert.equal(g.phase, 'DRAW');

    // Příští tah: 1 žeton → výbuch.
    g.drawPhaseState = null;
    topDeck(g, Suits.SPADES, 'K');
    startTurn(g, 1);
    assert.match(describePendingCheck(g, 1).detail, /vybuchne/);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.deck.discardTop(), bomb);
    assert.equal(g.lastAnimEvent.type, 'dynamite_explode');
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.deepEqual(g.pendingDynamiteDamage, { playerIdx: 1, hitsLeft: 2, source: 'AD_BOMB' });
    assert.equal(waitingStatus(g).text, 'výbuch Bomby – ztrácí 2 životy');
    g.takeDynamiteHit(1);
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.phase, 'DRAW', 'po zásazích lízání – Bomba se znovu nesnímá');
    assert.equal(A.adSupply(g), 32);
});

test('Bomba: pořadí Dynamit → Vězení → Chřestýš → Bomba; po neúspěšném Vězení se nesnímá', () => {
    const g = mkAd([{}, {}, {}]);
    board(g, 0, CardType.JAIL);
    armed(g, 0, 'Bomba', 1);
    topDeck(g, Suits.SPADES, 'K');   // Vězení: pik → tah přeskočen
    startTurn(g, 0);
    g.triggerCheckDraw();
    assert.equal(g.currentCheck.reason, 'JAIL');
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1, 'tah přeskočen');
    assert.equal(g.players[0].board[0].adLoads, 1, 'na Bombu se nesnímalo');

    const h = mkAd([{}, {}, {}]);
    h.options = { expansions: { ozbrojeni: true, udoli_stinu: true } };
    board(h, 0, CardType.JAIL);
    const snake = mkCard(CardType.RATTLESNAKE, { name: 'Chřestýš' });
    h.players[0].board.push(snake);
    armed(h, 0, 'Bomba', 3);
    topDeck(h, Suits.CLUBS, '3');    // Bomba
    topDeck(h, Suits.HEARTS, '2');   // Chřestýš: nic
    topDeck(h, Suits.HEARTS, '5');   // Vězení: srdce → hraje
    startTurn(h, 0);
    h.triggerCheckDraw();
    assert.equal(h.currentCheck.reason, 'JAIL');
    h.resolveCheck();
    h.triggerCheckDraw();
    assert.equal(h.currentCheck.reason, 'RATTLESNAKE');
    h.resolveCheck();
    assert.equal(h.phase, 'CHECK_DRAW', 'po Chřestýši se snímá na Bombu');
    assert.equal(describePendingCheck(h, 0).kind, 'AD_BOMB');
    h.triggerCheckDraw();
    assert.equal(h.currentCheck.reason, 'AD_BOMB');
    h.resolveCheck();
    assert.equal(h.players[0].board.find(c => c.type === CardType.AD_BOMB).adLoads, 1);
    assert.equal(h.phase, 'DRAW');
});

test('Bomba ♥♦: když není komu ji poslat, zůstává', () => {
    const g = mkAd([{}, { health: 0 }]);
    const bomb = armed(g, 0, 'Bomba', 3);
    topDeck(g, Suits.HEARTS, '5');
    startTurn(g, 0);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].board[0], bomb);
    assert.equal(g.phase, 'DRAW');
});

test('Bomba: pod Lasem (karty na stole nemají efekt) se nesnímá', () => {
    const g = mkAd([{}, {}]);
    armed(g, 0, 'Bomba', 1);
    g._boardDead = () => true;
    startTurn(g, 0);
    assert.equal(g.phase, 'DRAW');
});

test('Bomba: Lucky Duke otočí dvě karty a vybere si', () => {
    const g = mkAd([{ character: 'Lucky Duke' }, {}, {}]);
    armed(g, 0, 'Bomba', 3);
    topDeck(g, Suits.CLUBS, '5');
    topDeck(g, Suits.HEARTS, '5');
    startTurn(g, 0);
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    const red = g.luckyDukeState.cards.findIndex(c => c.suit === Suits.HEARTS);
    g.luckyDukePick(red);
    if (g.phase === 'CHECKING') g.resolveCheck();
    assert.equal(g.phase, 'AD_BOMB_PASS');
});

// ── Výbuch cizí rukou (Rez, Frankie Canton) ─────────────────────────────────

test('Rez vyčerpá Bombu soupeře → výbuch až po efektu, zásahy klikem, pak zpátky do PLAY', () => {
    const g = mkAd([{}, {}, {}]);
    const bomb = armed(g, 1, 'Bomba', 1);
    const ri = giveAd(g, 0, 'Rez');
    g.playCard(ri);
    assert.equal(g.players[1].board.length, 0, 'Bomba odešla');
    assert.ok(g.deck.discardPile.includes(bomb), 'Bomba je v odhozu');
    assert.equal(g.players[0].adLoads, 1, 'žeton z Bomby je na Rezově postavě');
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.playerIdx, 1);
    assert.equal(g.pendingDynamiteDamage.resume, 'QUEUE');
    g.takeDynamiteHit(1);
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0, 'tah se neposunul');
});

test('Rez: výbuch vyřadí soupeře uprostřed cizího tahu – tah pokračuje', () => {
    const g = mkAd([{ role: 'Sheriff' }, { health: 2, role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    armed(g, 1, 'Bomba', 1);
    g.playCard(giveAd(g, 0, 'Rez'));
    g.takeDynamiteHit(1);
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 0);
    // Bomba nemá útočníka → odměna za banditu nikomu; šerif hraje dál.
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.specialActionQueue.length, 0);
    assert.ok(!g._autoEndTurnPending);
});

test('Frankie Canton vezme poslední žeton z Bomby – vybuchne tomu, před kým leží', () => {
    const g = mkAd([{ character: 'Frankie Canton' }, {}, {}]);
    const bomb = armed(g, 2, 'Bomba', 1);
    assert.equal(g.adFrankie(0, 2, bomb.id), true);
    assert.equal(g.players[0].adLoads, 1);
    assert.equal(g.players[2].board.length, 0);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.playerIdx, 2);
    g.takeDynamiteHit(2);
    g.takeDynamiteHit(2);
    assert.equal(g.players[2].health, 2);
    assert.equal(g.phase, 'PLAY');
});

test('Frankie si vybije vlastní Bombu a umře – tah se posune', () => {
    const g = mkAd([{ character: 'Frankie Canton', health: 2, role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Outlaw' }]);
    const bomb = armed(g, 0, 'Bomba', 1);
    g.adFrankie(0, 0, bomb.id);
    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 0);
    assert.equal(g._autoEndTurnPending, true, 'tah ukončí server (handleAutoEndTurn)');
    assert.equal(g.phase, 'PLAY');
});

test('Bič odhodí Bombu – nevybuchne', () => {
    const g = mkAd([{}, {}, {}]);
    const whip = armed(g, 0, 'Bič', 3);
    const bomb = armed(g, 2, 'Bomba', 1);
    assert.equal(g.adUse(0, whip.id, 2), true);
    g.resolveCardSelection(0, 'board', g.players[2].board.indexOf(bomb));
    assert.equal(g.players[2].board.length, 0);
    assert.equal(g.players[2].health, 4);
    assert.notEqual(g.phase, 'DYNAMITE_DAMAGE');
});

test('Bomba přede mnou smí dostávat žetony (oddálí výbuch), platit se z ní nesmí (R5)', () => {
    const g = mkAd([{}, {}]);
    const bomb = armed(g, 0, 'Bomba', 2);
    assert.ok(A.adPlaceTargets(g, 0).some(t => t.cardId === bomb.id));
    assert.ok(!A.adSources(g, 0).some(s => s.cardId === bomb.id));
});

// ── Bot ──────────────────────────────────────────────────────────────────────

test('bot: Bombu zahraje na nepřítele, nikdy na sebe; po ♥♦ ji pošle nepříteli', () => {
    const g = mkAd([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Deputy' }]);
    g.players[1]._roleRevealed = true;
    const bi = giveAd(g, 0, 'Bomba');
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_special');
    assert.equal(a.payload.cardIdx, bi);
    assert.notEqual(a.payload.targetIdx, 0);

    const h = mkAd([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Deputy' }]);
    h.players[1]._roleRevealed = true;
    armed(h, 0, 'Bomba', 3);
    h.phase = 'AD_BOMB_PASS';
    h.pendingAdBombPass = { playerIdx: 0, cardId: h.players[0].board[0].id };
    const p = decideBotAction(h, 0);
    assert.equal(p.event, 'ad_bomb_pass');
    assert.ok([1, 2].includes(p.payload.targetIdx));
});

test('bot: žeton ze zásoby dá přednostně na Bombu přede mnou se 2 žetony', () => {
    const g = mkAd([{}, {}]);
    const ace = armed(g, 0, 'Eso v rukávu', 1);
    const bomb = armed(g, 0, 'Bomba', 2);
    g._adStartPlace(0, 1, 'BLUE');
    assert.deepEqual(decideBotAction(g, 0), { event: 'ad_place', payload: { seat: 0, cardId: bomb.id } });
    void ace;
});
