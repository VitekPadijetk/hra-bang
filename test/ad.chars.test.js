// Rozšíření Ozbrojení a nebezpeční – fáze A6: okna mimo tah. Al Preacher (líznutí za
// cizí modrou/oranžovou kartu) a Ms. Abigail (ignoruje hnědé karty J–A na jediný cíl) + bot.
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §2.12, §2.13, §5, R10, R16, R17, R-U3.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CardType, Suits, Card } = require('../logic.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { pendingActor, waitingStatus } = require('../core/pending.js');
const A = require('../core/armed.js');
const { mkGame, mkCard, give, board } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const AD_ON = { expansions: { ozbrojeni: true } };

let _seq = 98000;
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
const charLoads = (g, idx, n) => g._adAdd(g.players[idx], n);
const bang = (g, idx, value = '5', suit = Suits.CLUBS) => give(g, idx, CardType.BANG, { name: 'Bang!', suit, value });
const AL = { character: 'Al Preacher' };
const ABBY = { character: 'Ms. Abigail' };

// ── Al Preacher ──────────────────────────────────────────────────────────────

test('Al Preacher: jiný hráč vyloží modrou kartu → po dobití okno, 2 ⛁ = líznutí 1 karty', () => {
    const g = mkAd([{}, AL, {}]);
    charLoads(g, 1, 3);
    const bi = give(g, 0, CardType.BARREL, { name: 'Barel' });
    g.playCard(bi);
    assert.equal(g.phase, 'AD_PLACE', 'nejdřív dobití žetonem za modrou kartu');
    g.adPlaceDone(0);
    assert.equal(g.phase, 'AD_AL_OFFER');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'AD_AL_OFFER' });
    assert.match(waitingStatus(g).text, /Al Preacher/);
    assert.equal(g.pendingAdAl.fromIdx, 0);

    const hand = g.players[1].hand.length;
    assert.equal(g.adAl(1, [{ seat: 1, cardId: null }, { seat: 1, cardId: null }]), true);
    assert.equal(g.players[1].adLoads, 1, 'zaplatil 2 ⛁ z postavy');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    assert.deepEqual(g.drawPhaseState.queuedDraw, ['Al Preacher']);
    g.drawCard('deck');
    assert.equal(g.players[1].hand.length, hand + 1);
    assert.equal(g.phase, 'PLAY', 'zpátky do tahu hráče, který kartu vyložil');
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(A.adSupply(g) + 1 + (g.players[0].adLoads || 0), 32);
});

test('Al Preacher: oranžová karta okno otevře (bez dobití), platba ji smí vyčerpat', () => {
    const g = mkAd([{}, AL]);
    const ace = armed(g, 1, 'Eso v rukávu', 2);
    const c = adCard('Bandalír');
    g.players[0].hand.push(c);
    g.playCard(g.players[0].hand.length - 1);
    assert.equal(g.phase, 'AD_AL_OFFER', 'oranžová žeton za zahrání nedostává (R-U2), Al ano');
    assert.equal(g.adAl(1, [{ seat: 1, cardId: ace.id }, { seat: 1, cardId: ace.id }]), true);
    assert.ok(!g.players[1].board.includes(ace), 'poslední žetony → Eso v rukávu do odhozu');
    assert.equal(g.phase, 'DRAW');
});

test('Al Preacher: Vězení na Ala se počítá; nelíznout = nic se neplatí', () => {
    const g = mkAd([{ role: 'Sheriff' }, { ...AL, role: 'Outlaw' }]);
    charLoads(g, 1, 2);
    const ji = give(g, 0, CardType.JAIL, { name: 'Vězení' });
    g.playSpecialCard(0, 1, ji);
    if (g.phase === 'AD_PLACE') g.adPlaceDone(0);
    assert.equal(g.phase, 'AD_AL_OFFER');
    assert.equal(g.adAl(1, null), true);
    assert.equal(g.players[1].adLoads, 2);
    assert.equal(g.phase, 'PLAY');
    assert.ok(g.players[1].board.some(c => c.type === CardType.JAIL));
});

test('Al Preacher: bez 2 ⛁, vlastní karta, zelená/hnědá karta ani bez rozšíření okno není', () => {
    const g = mkAd([{}, AL]);
    charLoads(g, 1, 1);
    g.playCard(give(g, 0, CardType.BARREL, { name: 'Barel' }));
    if (g.phase === 'AD_PLACE') g.adPlaceDone(0);
    assert.equal(g.phase, 'PLAY', '1 ⛁ nestačí (R-U3)');

    const h = mkAd([AL, {}]);
    charLoads(h, 0, 4);
    h.playCard(give(h, 0, CardType.BARREL, { name: 'Barel' }));
    assert.equal(h.specialActionQueue.filter(a => a.type === 'AD_AL_OFFER').length, 0, 'vlastní karta ne');

    const k = mkAd([{}, AL]);
    charLoads(k, 1, 4);
    k._adQueueAl(0, mkCard(CardType.BANG));
    assert.equal(k.specialActionQueue.length, 0, 'hnědá karta ne');
    k.options = { expansions: {} };
    k._adQueueAl(0, mkCard(CardType.BARREL));
    assert.equal(k.specialActionQueue.length, 0, 'bez rozšíření ne');
});

test('Al Preacher: špatná platba se odmítne a nic nezaplatí; okno pročistí, když žetony utratil', () => {
    const g = mkAd([{}, AL]);
    charLoads(g, 0, 2);
    charLoads(g, 1, 2);
    g.playCard(give(g, 0, CardType.BARREL, { name: 'Barel' }));
    if (g.phase === 'AD_PLACE') g.adPlaceDone(0);
    assert.equal(g.phase, 'AD_AL_OFFER');
    assert.equal(g.adAl(1, [{ seat: 1, cardId: null }]), false, 'jen 1 žeton');
    assert.equal(g.adAl(1, [{ seat: 0, cardId: null }, { seat: 0, cardId: null }]), false, 'cizí zdroj');
    assert.equal(g.adAl(0, null), false, 'na Ala se čeká, ne na hráče 0');
    assert.equal(g.players[1].adLoads, 2);
    assert.equal(g.phase, 'AD_AL_OFFER');

    const h = mkAd([{}, AL]);
    charLoads(h, 1, 2);
    h.specialActionQueue.push({ type: 'AD_AL_OFFER', playerIdx: 1, fromIdx: 0, cardName: 'Barel' });
    h._adTake(h.players[1], 1);
    assert.equal(h._processSpecialQueue(), false, 'už nemá z čeho platit → okno se neotevře');
    assert.equal(h.specialActionQueue.length, 0);
});

test('bot: Al Preacher lízne, dokud má ruku pod limitem; jinak ne', () => {
    const g = mkAd([{}, { ...AL, health: 4 }]);
    charLoads(g, 1, 3);
    g.playCard(give(g, 0, CardType.BARREL, { name: 'Barel' }));
    if (g.phase === 'AD_PLACE') g.adPlaceDone(0);
    assert.deepEqual(decideBotAction(g, 1, {}),
        { event: 'ad_al', payload: { pay: [{ seat: 1, cardId: null }, { seat: 1, cardId: null }] } });
    for (let i = 0; i < 4; i++) give(g, 1, CardType.MISSED);
    assert.deepEqual(decideBotAction(g, 1, {}), { event: 'ad_al', payload: { pay: null } });
});

// ── Ms. Abigail – karty bez výstřelu (okno úniku) ────────────────────────────

test('Ms. Abigail: Panika J na jediný cíl → okno i bez Údolí stínů, IGNOROVAT = nic se nestane', () => {
    const g = mkAd([{}, ABBY]);
    give(g, 1, CardType.MISSED);
    const pi = give(g, 0, CardType.PANIC, { name: 'Panika!', value: 'J', suit: Suits.HEARTS });
    g.playSpecialCard(0, 1, pi);
    assert.equal(g.phase, 'EVADE_OFFER');
    assert.equal(g.pendingEvade.abigail, true);
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'EVADE_OFFER' });
    assert.match(waitingStatus(g).text, /Ms\. Abigail/);
    assert.deepEqual(g.adAbigail(1), { placed: null });
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand.length, 1, 'karta zůstala v ruce');
    assert.ok(!g.pendingSelection);
    assert.equal(g.pendingEvade, null);
});

test('Ms. Abigail: Panika 8 okno neotevře; odmítnutí J pokračuje výběrem karty', () => {
    const g = mkAd([{}, ABBY]);
    give(g, 1, CardType.MISSED);
    g.playSpecialCard(0, 1, give(g, 0, CardType.PANIC, { name: 'Panika!', value: '8', suit: Suits.DIAMONDS }));
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');

    const h = mkAd([{}, ABBY]);
    give(h, 1, CardType.MISSED);
    h.playSpecialCard(0, 1, give(h, 0, CardType.CAT_BALOU, { name: 'Cat Balou', value: 'K', suit: Suits.HEARTS }));
    assert.equal(h.phase, 'EVADE_OFFER');
    h.vosEvade(1, null);
    assert.equal(h.phase, 'SELECTING_TARGET_CARD', 'nechala proběhnout');
    assert.equal(h.adAbigail(1), null, 'okno už není');
});

test('Ms. Abigail: Duel Q ignoruje – duel se nezačne', () => {
    const g = mkAd([{}, ABBY]);
    g.playSpecialCard(0, 1, give(g, 0, CardType.DUEL, { name: 'Duel', value: 'Q', suit: Suits.DIAMONDS }));
    assert.equal(g.phase, 'EVADE_OFFER');
    assert.equal(g.pendingEvade.resume.kind, 'DUEL');
    g.adAbigail(1);
    assert.equal(g.phase, 'PLAY');
    assert.ok(!g.pendingResponse || !g.pendingResponse.active);
});

test('Ms. Abigail: Big Fifty / Kocovina ji vypnou, jiný hráč nic neignoruje, bez rozšíření nic', () => {
    const J = { value: 'J', suit: Suits.HEARTS, type: CardType.PANIC, name: 'Panika!' };
    const g = mkAd([{}, ABBY, {}]);
    assert.equal(A.adAbigailOk(g, 1, 0, J), true);
    assert.equal(A.adAbigailOk(g, 1, 1, J), false, 'vlastní karta ne (R10)');
    assert.equal(A.adAbigailOk(g, 2, 0, J), false, 'jiná postava ne');
    assert.equal(A.adAbigailOk(g, 1, 0, { ...J, value: '10' }), false);
    assert.equal(A.adAbigailOk(g, 1, 0, mkCard(CardType.JAIL, { value: 'J' })), false, 'modrá karta ne');
    assert.equal(A.adAbigailOk(g, 1, 0, { value: 'A' }), true, 'opakování LVK nese jen hodnotu');
    g.players[1]._adMuted = true;
    assert.equal(A.adAbigailOk(g, 1, 0, J), false, 'Big Fifty');
    g.players[1]._adMuted = false;
    g.options = { expansions: {} };
    assert.equal(A.adAbigailOk(g, 1, 0, J), false);
});

// ── Ms. Abigail – výstřel (obrana) ───────────────────────────────────────────

test('Ms. Abigail: BANG! K v obraně ignoruje – bez zásahu i bez zrušení (Bloody Mary nelíže)', () => {
    const g = mkAd([{ character: 'Bloody Mary' }, ABBY]);
    g.playBang(0, 1, bang(g, 0, 'K', Suits.SPADES));
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.vos.adAbby, true);
    assert.equal(A.adAbigailRespondOk(g, 1), true);
    const q = g.specialActionQueue.length;
    assert.deepEqual(g.adAbigail(1), { placed: null });
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.specialActionQueue.length, q, 'zrušení to není – Bloody Mary si nelíže (R17)');
    assert.equal(g.players[0].hand.length, 0);
});

test('Ms. Abigail: BANG! 5, Kulomet, výstřel bez karty a Rychlopalba na víc cílů ignorovat nejde', () => {
    const g = mkAd([{}, ABBY]);
    g.playBang(0, 1, bang(g, 0, '5'));
    assert.equal(g.phase, 'RESPOND');
    assert.equal(A.adAbigailRespondOk(g, 1), false);
    assert.equal(g.adAbigail(1), null);

    const h = mkAd([{}, ABBY]);
    h.playSpecialCard(0, null, give(h, 0, CardType.GATLING, { name: 'Kulomet', value: 'A', suit: Suits.HEARTS }));
    assert.equal(h.phase, 'RESPOND');
    assert.equal(A.adAbigailRespondOk(h, 1), false, 'hromadná karta ne');

    const k = mkAd([{}, ABBY]);
    k._beginBangResolution(0, 1, true, 'Mexicali Kid', null, null, { shot: 'MEXICALI' });
    assert.equal(A.adAbigailRespondOk(k, 1), false, 'výstřel bez karty hodnotu nemá');
    k.pendingResponse.vos = { adAbby: true, noEscape: true };
    assert.equal(A.adAbigailRespondOk(k, 1), false, 'víc cílů = není jediný cíl');
});

test('Ms. Abigail: proti Slabovi stačí jedno ignorování; Dvouhlavňovku ignorovat smí (ne zrušit)', () => {
    const g = mkAd([{ character: 'Slab the Killer' }, ABBY]);
    g.playBang(0, 1, bang(g, 0, 'A', Suits.HEARTS));
    assert.equal(g.missesRequired, 2);
    g.adAbigail(1);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');

    const h = mkAd([{}, ABBY]);
    h.playBang(0, 1, bang(h, 0, 'Q'));
    h.pendingResponse.vos = { ...h.pendingResponse.vos, unavoidable: true };
    assert.equal(A.adAbigailRespondOk(h, 1), true);
});

test('Ms. Abigail: Lee Van Kliff opakuje BANG! J – nese hodnotu původní karty', () => {
    const g = mkAd([{}, ABBY]);
    g.playBang(0, 1, bang(g, 0, 'J'));
    assert.equal(g._lastBrown.value, 'J');
    g._lastBrown = null;
    const g2 = mkAd([{}, ABBY]);
    g2._lastBrown = { playerIdx: 0, turnId: g2.turnId, name: 'Bang!', type: CardType.BANG,
                      suit: Suits.CLUBS, value: 'J', effect: 'BANG', aim: true, repeated: false };
    g2._repeatBrownEffect(0, g2._lastBrown, 1);
    assert.equal(g2.phase, 'RESPOND');
    assert.equal(A.adAbigailRespondOk(g2, 1), true);
});

// ── Bot ──────────────────────────────────────────────────────────────────────

test('bot: Ms. Abigail ignoruje výstřel J–A i Paniku od nepřítele', () => {
    const g = mkAd([{ role: 'Outlaw' }, { ...ABBY, role: 'Sheriff' }]);
    g.playBang(0, 1, bang(g, 0, 'K'));
    give(g, 1, CardType.MISSED);
    assert.deepEqual(decideBotAction(g, 1, {}), { event: 'ad_abigail', payload: {} });

    const h = mkAd([{ role: 'Outlaw' }, { ...ABBY, role: 'Sheriff' }]);
    give(h, 1, CardType.MISSED);
    h.playSpecialCard(0, 1, give(h, 0, CardType.PANIC, { name: 'Panika!', value: 'Q', suit: Suits.HEARTS }));
    assert.deepEqual(decideBotAction(h, 1, { 0: { Outlaw: 1 }, 1: { Sheriff: 1 } }), { event: 'ad_abigail', payload: {} });
});

test('bot: Panika od jistého spojence na Abigail s Vězením projde', () => {
    const g = mkAd([{ role: 'Deputy' }, { ...ABBY, role: 'Sheriff' }]);
    board(g, 1, CardType.JAIL, { name: 'Vězení' });
    g.playSpecialCard(0, 1, give(g, 0, CardType.PANIC, { name: 'Panika!', value: 'Q', suit: Suits.HEARTS }));
    assert.equal(g.phase, 'EVADE_OFFER');
    const d = decideBotAction(g, 1, { 0: { Deputy: 1 }, 1: { Sheriff: 1 } });
    assert.deepEqual(d, { event: 'vos_evade', payload: { cardId: null, playerIdx: 1 } });
});
