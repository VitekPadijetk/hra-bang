// Rozšíření Ozbrojení a nebezpeční – fáze A5: Stepní běžec (okno opakování sejmutí)
// a Julie Cutter (sejmutí za zranění) + bot.
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §2.11, §4 (Stepní běžec), §5 (Julie
// Cutter), R7, R15, R-U3.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CardType, Suits, Card } = require('../logic.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { pendingActor, waitingStatus, describePendingCheck } = require('../core/pending.js');
const A = require('../core/armed.js');
const { mkGame, mkCard, give, board, topDeck } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const AD_ON = { expansions: { ozbrojeni: true } };

let _seq = 97000;
function adCard(name) {
    const row = adData.find(c => c.name === name);
    const c = new Card(_seq++, row.name, CardType[row.type], Suits[row.suit], row.value, row.props || {});
    c.effect = row.props?.effect || null;
    c.exp = row.exp; c.border = row.border; c.art = row.art;
    return c;
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
function startTurn(g, idx) {
    g.currentPlayerIndex = idx;
    g.turnId++;
    g.phase = 'PLAY';
    g.handleStartOfTurnChecks();
}
const bang = (g, idx, suit = Suits.CLUBS) => give(g, idx, CardType.BANG, { name: 'Bang!', suit });
const tumble = (g, idx, n = 3) => armed(g, idx, 'Stepní běžec', n);

// ── Stepní běžec ─────────────────────────────────────────────────────────────

test('Stepní běžec: vlastní neúspěšné Vězení se zopakuje, poslední žeton kartu vyčerpá', () => {
    const g = mkAd([{}, {}, {}]);
    const sb = tumble(g, 0, 1);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });   // stůl: [Stepní běžec, Vězení]
    startTurn(g, 0);
    assert.equal(g.phase, 'CHECK_DRAW');
    topDeck(g, Suits.SPADES);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'AD_REDRAW_OFFER', 'výsledek čeká na majitele karty');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'AD_REDRAW_OFFER' });
    assert.match(waitingStatus(g).text, /Stepní běžec/);
    assert.equal(g.players[0].board.length, 2, 'Vězení se zatím neodhodilo');
    assert.deepEqual(A.adCheckVerdict(g, g.currentCheck), { good: false, text: 'zůstává ve Vězení' });

    topDeck(g, Suits.HEARTS);
    assert.equal(g.adRedraw(0, true), true);
    assert.equal(g.phase, 'CHECKING', 'nové sejmutí');
    assert.equal(g.currentCheck.card.suit, Suits.HEARTS);
    assert.ok(!g.players[0].board.includes(sb), 'poslední žeton → Stepní běžec do odhozu');
    assert.equal(g.currentCheck.boardIdx, 0, 'index Vězení se po odchodu karty posunul');
    assert.equal(A.adSupply(g), 32);
    g.resolveCheck();   // bez žetonů už okno není
    assert.equal(g.players[0].board.length, 0, 'Vězení odešlo');
    assert.equal(g.phase, 'DRAW', 'srdce → hraje');
});

test('Stepní běžec: soupeřův úspěšný Barel se zopakuje; dvakrát za sebou za dva žetony', () => {
    const g = mkAd([{}, {}]);
    const sb = tumble(g, 0, 3);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.playBang(0, 1, bang(g, 0));
    assert.equal(g.phase, 'BARREL_DRAW');
    topDeck(g, Suits.HEARTS);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'AD_REDRAW_OFFER');
    assert.equal(g.pendingAdRedraw.ownerIdx, 0, 'mimo vlastní sejmutí – opakuje útočník');
    assert.equal(g.pendingAdRedraw.checkerIdx, 1);
    topDeck(g, Suits.HEARTS);
    g.adRedraw(0, true);
    g.resolveCheck();
    assert.equal(g.phase, 'AD_REDRAW_OFFER', 'po novém sejmutí se ptá znovu');
    topDeck(g, Suits.CLUBS);
    g.adRedraw(0, true);
    g.resolveCheck();
    assert.equal(g.phase, 'AD_REDRAW_OFFER');
    assert.equal(sb.adLoads, 1);
    g.adRedraw(0, false);
    assert.equal(g.phase, 'RESPOND', 'neuhnul → musí hrát Vedle!');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Stepní běžec: nechat = výsledek platí beze změny (úspěšný Barel)', () => {
    const g = mkAd([{}, {}]);
    const sb = tumble(g, 0, 2);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.playBang(0, 1, bang(g, 0));
    topDeck(g, Suits.HEARTS);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.adRedraw(1, false), false, 'rozhoduje jen majitel karty');
    g.adRedraw(0, false);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
    assert.equal(sb.adLoads, 2, 'nic se neplatilo');
});

test('Stepní běžec: Lucky Duke opakuje celé sejmutí – otočí dvě nové karty a vybírá znovu', () => {
    const g = mkAd([{}, { character: 'Lucky Duke' }]);
    tumble(g, 0, 3);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.playBang(0, 1, bang(g, 0));
    topDeck(g, Suits.HEARTS); topDeck(g, Suits.CLUBS);
    g.triggerBarrelDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    const first = g.luckyDukeState.cards.map(c => c.id);
    g.luckyDukePick(g.luckyDukeState.cards.findIndex(c => c.suit === Suits.HEARTS));
    assert.equal(g.phase, 'AD_REDRAW_OFFER');
    topDeck(g, Suits.SPADES); topDeck(g, Suits.CLUBS);
    g.adRedraw(0, true);
    assert.equal(g.phase, 'LUCKY_DUKE');
    const second = g.luckyDukeState.cards.map(c => c.id);
    assert.equal(second.length, 2);
    assert.ok(second.every(id => !first.includes(id)), 'dvě NOVÉ karty');
    g.luckyDukePick(0);
    assert.equal(g.phase, 'AD_REDRAW_OFFER', 'a po výběru se ptá znovu');
    g.adRedraw(0, false);
    assert.equal(g.phase, 'RESPOND');
});

test('Stepní běžec: okno se neotevře pod Lasem, v tahu Belle Star u cizí karty, mimo hru', () => {
    // Laso: karty na stole nemají efekt – Jourdonnais (schopnost) snímá, okno ne.
    const g = mkAd([{}, { character: 'Jourdonnais' }]);
    tumble(g, 0, 3);
    g.activeFistful = { key: 'LASO' };
    g.playBang(0, 1, bang(g, 0));
    topDeck(g, Suits.HEARTS);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'PLAY', 'uhnul, bez okna');
    assert.equal(A.adRedrawOwner(g, 1), null);

    // Belle Star na tahu: cizí Stepní běžec nefunguje, její vlastní by ano.
    const h = mkAd([{ character: 'Belle Star' }, {}]);
    tumble(h, 1, 3);
    board(h, 0, CardType.JAIL, { name: 'Vězení' });
    startTurn(h, 0);
    topDeck(h, Suits.SPADES);
    h.triggerCheckDraw();
    assert.equal(A.adRedrawOwner(h, 0), null);
    h.resolveCheck();
    assert.notEqual(h.phase, 'AD_REDRAW_OFFER');

    // Majitel mimo hru.
    const k = mkAd([{}, {}, {}]);
    tumble(k, 2, 3);
    k.players[2].health = 0;
    assert.equal(A.adRedrawOwner(k, 0), null);
    k.players[2].health = 2;
    assert.equal(A.adRedrawOwner(k, 0), 2);
    k.options = { expansions: {} };
    assert.equal(A.adRedrawOwner(k, 0), null, 'bez rozšíření nic');
});

test('Stepní běžec: Bomba na ♣ (vybuchla by) se zopakuje a ♥ ji pošle dál', () => {
    const g = mkAd([{}, {}, {}]);
    tumble(g, 0, 2);
    const bomb = adCard('Bomba');
    g.players[0].board.push(bomb);
    g._adAdd(bomb, 2, { fresh: true });
    startTurn(g, 0);
    topDeck(g, Suits.CLUBS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'AD_REDRAW_OFFER');
    assert.equal(A.adCheckVerdict(g, g.currentCheck).good, false);
    topDeck(g, Suits.HEARTS);
    g.adRedraw(0, true);
    g.resolveCheck();
    g.adRedraw(0, false);
    assert.equal(g.phase, 'AD_BOMB_PASS', 'červená → předání');
    assert.equal(bomb.adLoads, 2);
});

test('Stepní běžec: Doroty ho smí poručit, Lee Van Kliff ne (oranžová)', () => {
    const c = adCard('Stepní běžec');
    assert.equal(A.adDorothyOk(c), true);
    assert.equal(A.adRepeatOk(c), false);
    assert.ok(A.AD_CARDS_READY.includes('Stepní běžec'));
});

// ── Julie Cutter ─────────────────────────────────────────────────────────────

test('Julie Cutter: zásah od hráče → sejmutí, ♥♦ = útočník je cílem BANG!', () => {
    const g = mkAd([{}, { character: 'Julie Cutter' }]);
    g.playBang(0, 1, bang(g, 0));
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(g.pendingCheckDraw.reason, 'AD_JULIE');
    assert.equal(g.pendingCheckDraw.playerIdx, 1);
    assert.equal(describePendingCheck(g, 1).kind, 'AD_JULIE');
    topDeck(g, Suits.DIAMONDS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND', 'výstřel zpět');
    assert.equal(g.pendingResponse.targetIdx, 0);
    assert.equal(g.pendingResponse.sourceCardName, 'Julie Cutter');
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Julie Cutter: ♣♠ = nic; bez útočníka (Dynamit) se nesnímá', () => {
    const g = mkAd([{}, { character: 'Julie Cutter' }]);
    g.playBang(0, 1, bang(g, 0));
    g.handleResponse(1, null);
    topDeck(g, Suits.SPADES);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].health, 4);

    const h = mkAd([{}, { character: 'Julie Cutter' }]);
    h.handleDamage(1, null);
    h.handleDamage(1, 1);
    assert.equal(h.specialActionQueue.filter(a => a.type === 'AD_JULIE_CHECK').length, 0);
});

test('Julie Cutter: dva životy od téhož útočníka (Dvojitá rána) = jedno sejmutí', () => {
    const g = mkAd([{}, { character: 'Julie Cutter' }, {}]);
    g.handleDamage(1, 0);
    g.handleDamage(1, 0);
    g.handleDamage(1, 2);
    const q = g.specialActionQueue.filter(a => a.type === 'AD_JULIE_CHECK');
    assert.deepEqual(q.map(a => a.attackerIdx), [0, 2]);
});

test('Julie Cutter: Big Fifty ji vypne, vyřazená nesnímá, bez rozšíření nic', () => {
    const g = mkAd([{}, { character: 'Julie Cutter' }]);
    g.players[1]._adMuted = true;
    g.handleDamage(1, 0);
    assert.equal(g.specialActionQueue.length, 0);

    const h = mkAd([{}, { character: 'Julie Cutter', health: 1 }, {}]);
    h.handleDamage(1, 0);
    assert.equal(h.specialActionQueue.filter(a => a.type === 'AD_JULIE_CHECK').length, 0);

    const k = mkAd([{}, { character: 'Julie Cutter' }]);
    k.options = { expansions: {} };
    k.handleDamage(1, 0);
    assert.equal(k.specialActionQueue.length, 0);
});

test('Julie Cutter + Stepní běžec: útočník si jejím sejmutím může nechat zopakovat', () => {
    const g = mkAd([{}, { character: 'Julie Cutter' }]);
    tumble(g, 0, 3);
    g.playBang(0, 1, bang(g, 0));
    g.handleResponse(1, null);
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'AD_REDRAW_OFFER');
    assert.equal(g.pendingAdRedraw.ownerIdx, 0);
    topDeck(g, Suits.CLUBS);
    g.adRedraw(0, true);
    assert.equal(g.currentCheck.reason, 'AD_JULIE', 'kontext sejmutí přežil');
    assert.equal(g.currentCheck.adJulie.attackerIdx, 0);
    g.resolveCheck();
    g.adRedraw(0, false);
    assert.equal(g.phase, 'PLAY', '♣ → žádný výstřel');
    assert.equal(g.players[0].health, 4);
});

// ── Bot ──────────────────────────────────────────────────────────────────────

test('bot: opakuje své neúspěšné sejmutí, úspěšné nechá', () => {
    const g = mkAd([{ role: 'Outlaw' }, { role: 'Sheriff' }, {}]);
    tumble(g, 0, 3);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    startTurn(g, 0);
    topDeck(g, Suits.SPADES);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.deepEqual(decideBotAction(g, 0, {}), { event: 'ad_redraw', payload: { redo: true } });
    topDeck(g, Suits.HEARTS);
    g.adRedraw(0, true);
    g.resolveCheck();
    assert.deepEqual(decideBotAction(g, 0, {}), { event: 'ad_redraw', payload: { redo: false } });
});

test('bot: soupeřův úspěšný Barel opakuje, u neznámého hráče žeton nepálí', () => {
    const g = mkAd([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
    tumble(g, 0, 3);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.playBang(0, 1, bang(g, 0));
    topDeck(g, Suits.HEARTS);
    g.triggerBarrelDraw();
    g.resolveCheck();
    const beliefs = { 0: { Outlaw: 1 }, 1: { Sheriff: 1 } };
    assert.deepEqual(decideBotAction(g, 0, beliefs), { event: 'ad_redraw', payload: { redo: true } });
    const unknown = { 0: { Outlaw: 1 }, 1: { Deputy: 0.5, Renegade: 0.5 } };
    const d = decideBotAction(g, 0, unknown);
    assert.equal(d.event, 'ad_redraw');
});
