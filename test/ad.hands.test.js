// Rozšíření Ozbrojení a nebezpeční – fáze A3 (ruce a stoly): Šíp, Paklíč, Bič, Squaw,
// Rez a postavy Bass Greeves, Frankie Canton, Red Ringo + bot.
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §4 (A3), §5 a §6.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GameState, CardType, Suits, Card } = require('../logic.js');
const { cardPlayability } = require('../core/playability.js');
const { decideBotAction } = require('../core/botPolicy.js');
const A = require('../core/armed.js');
const { mkGame, mkCard, give, board } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const AD_ON = { expansions: { ozbrojeni: true } };
const VOS_AD = { expansions: { ozbrojeni: true, udoli_stinu: true } };

let _seq = 94000;
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
const bang = (g, idx) => give(g, idx, CardType.BANG, { name: 'Bang!' });
const payChar = (seat, n) => Array.from({ length: n }, () => ({ seat, cardId: null }));

// ── Šíp (§4) ─────────────────────────────────────────────────────────────────

test('Šíp: cíl bez ohledu na vzdálenost odhodí kartu BANG!, nebo ztratí život', () => {
    const g = mkAd([{}, {}, {}, {}, {}]);
    const ai = giveAd(g, 0, 'Šíp');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[ai]), true);
    bang(g, 2);
    g.playSpecialCard(0, 2, ai);   // vzdálenost 2 – Šíp na ni nehledí
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 2);
    assert.equal(g.pendingResponse.sourceCardName, 'Šíp');
    g.handleResponse(2, 0);        // odhodí BANG!
    assert.equal(g.players[2].health, 4);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g._adArrow, null);

    const h = mkAd([{}, {}, {}]);
    h.playSpecialCard(0, 1, giveAd(h, 0, 'Šíp'));
    h.handleResponse(1, null);     // nemá BANG! → život
    assert.equal(h.players[1].health, 3);
    assert.equal(h.phase, 'PLAY');
});

test('Šíp: Vedle! ani Barel nepomáhají (není to BANG!)', () => {
    const g = mkAd([{}, {}]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    const mi = give(g, 1, CardType.MISSED, { name: 'Vedle!' });
    g.playSpecialCard(0, 1, giveAd(g, 0, 'Šíp'));
    assert.equal(g.phase, 'RESPOND', 'žádné snímání na Barel');
    const n = g.players[1].hand.length;
    g.handleResponse(1, mi);
    assert.equal(g.players[1].hand.length, n, 'Vedle! se odmítne');
    assert.equal(g.phase, 'RESPOND');
});

test('Šíp s vylepšením: další cíle za 1 ⛁, všechny různé; každý se brání sám', () => {
    const g = mkAd([{}, {}, {}, {}]);
    g._adAdd(g.players[0], 2);
    const ai = giveAd(g, 0, 'Šíp');
    const card = g.players[0].hand[ai];
    assert.equal(A.adUpgradeMax(g, 0, card), 2);
    // Dva stejné cíle ani cíl navíc bez zaplacení neprojdou – karta zůstane v ruce.
    g.playSpecialCard(0, 1, ai, { up: 1, pay: payChar(0, 1), extra: [1] });
    g.playSpecialCard(0, 1, ai, { up: 0, pay: [], extra: [2] });
    assert.equal(g.players[0].hand.length, 1);
    g.playSpecialCard(0, 1, ai, { up: 2, pay: payChar(0, 2), extra: [2, 3] });
    assert.equal(g.players[0].adLoads || 0, 0, 'zaplaceno');
    assert.equal(g.pendingResponse.targetIdx, 1);
    g.handleResponse(1, null);
    assert.equal(g.pendingResponse.targetIdx, 2);
    g.handleResponse(2, null);
    assert.equal(g.pendingResponse.targetIdx, 3);
    g.handleResponse(3, null);
    assert.deepEqual(g.players.slice(1).map(p => p.health), [3, 3, 3]);
    assert.equal(g.phase, 'PLAY');
});

test('Šíp: Apache Kid je imunní (♦), na sebe ani na Ducha nejde', () => {
    const g = mkAd([{}, { character: 'Apache Kid' }, {}]);
    g._adAdd(g.players[0], 1);
    const ai = giveAd(g, 0, 'Šíp');
    g.playSpecialCard(0, 1, ai, { up: 1, pay: payChar(0, 1), extra: [2] });
    assert.equal(g.pendingResponse.targetIdx, 2, 'Apache se přeskočí');
    assert.deepEqual(A.adArrowTargets(g, 0), [1, 2]);
});

test('Šíp na jediný cíl: Útěk se mu vyhne; se dvěma cíli okno úniku není', () => {
    const g = mkAd([{}, {}, {}]);
    g.options = VOS_AD;
    give(g, 1, CardType.ESCAPE, { name: 'Útěk' });
    g.playSpecialCard(0, 1, giveAd(g, 0, 'Šíp'));
    assert.equal(g.phase, 'EVADE_OFFER');
    const esc = g.players[1].hand[0];
    g.vosEvade(1, esc.id);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
    assert.equal(g._adArrow, null);
    // Odmítnutý únik → obrana jede.
    const h = mkAd([{}, {}, {}]);
    h.options = VOS_AD;
    give(h, 1, CardType.ESCAPE, { name: 'Útěk' });
    h.playSpecialCard(0, 1, giveAd(h, 0, 'Šíp'));
    h.vosEvade(1, null);
    assert.equal(h.phase, 'RESPOND');
    assert.equal(h.pendingResponse.targetIdx, 1);
    // Dva cíle: rovnou obrana.
    const k = mkAd([{}, {}, {}]);
    k.options = VOS_AD;
    k._adAdd(k.players[0], 1);
    give(k, 1, CardType.ESCAPE, { name: 'Útěk' });
    k.playSpecialCard(0, 1, giveAd(k, 0, 'Šíp'), { up: 1, pay: payChar(0, 1), extra: [2] });
    assert.equal(k.phase, 'RESPOND');
});

// ── Paklíč (§4) ──────────────────────────────────────────────────────────────

test('Paklíč: za 3 ⛁ náhodná karta z ruky kohokoli, bez vzdálenosti; vyčerpaný odejde', () => {
    const g = mkAd([{}, {}, {}, {}, {}]);
    const lp = armed(g, 0, 'Paklíč');
    bang(g, 2);
    assert.equal(A.adUseOk(g, 0, lp), true);
    assert.deepEqual(A.adUseTargets(g, 0, lp), [2], 'jen kdo má ruku, ne sám hráč');
    assert.equal(g.adUse(0, lp.id, 1), false, 'cíl bez karet ne');
    assert.equal(g.adUse(0, lp.id, 2), true);
    assert.equal(g.players[2].hand.length, 0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[0].board.length, 0, 'Paklíč se 3 žetony se vyčerpal');
    assert.equal(g.phase, 'PLAY');
});

test('Paklíč: na 2 žetonech nejde; Henry Block na zloděje střílí', () => {
    const g = mkAd([{}, {}]);
    const lp = armed(g, 0, 'Paklíč', 2);
    bang(g, 1);
    assert.equal(A.adUseOk(g, 0, lp), false);
    const h = mkAd([{}, { character: 'Henry Block' }]);
    h.options = VOS_AD;
    const lp2 = armed(h, 0, 'Paklíč', 4);
    bang(h, 1);
    assert.equal(h.adUse(0, lp2.id, 1), true);
    assert.equal(h.phase, 'RESPOND', 'Henry vystřelil');
    assert.equal(h.players[1].hand.length, 1, 'karta zatím zůstává');
});

// ── Bič a Squaw (§4) ─────────────────────────────────────────────────────────

test('Bič: odhodí kartu ve hře kohokoli, i svou, bez vzdálenosti; ruka ne', () => {
    const g = mkAd([{}, {}, {}, {}, {}]);
    const whip = armed(g, 0, 'Bič', 4);
    const barrel = board(g, 2, CardType.BARREL, { name: 'Barel' });
    bang(g, 2);
    assert.deepEqual(A.adUseTargets(g, 0, whip), [0, 2], 'sám hráč (Bič leží před ním) a hráč 2');
    assert.equal(g.adUse(0, whip.id, 2), true);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.adNoHand, true);
    g.resolveCardSelection(0, 'hand', null);
    assert.equal(g.players[2].hand.length, 1, 'z ruky Bič nebere');
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'board', 0);
    assert.ok(!g.players[2].board.includes(barrel));
    assert.ok(g.deck.discardPile.includes(barrel));
    assert.equal(g.phase, 'PLAY');
    assert.equal(whip.adLoads, 1);
});

test('Bič na sebe: vlastní Vězení pryč (bez okna úniku)', () => {
    const g = mkAd([{}, {}]);
    g.options = VOS_AD;
    const whip = armed(g, 0, 'Bič');
    const jail = board(g, 0, CardType.JAIL, { name: 'Vězení' });
    give(g, 0, CardType.ESCAPE, { name: 'Útěk' });
    assert.equal(g.adUse(0, whip.id, 0), true);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    // Bič se vyčerpal a odešel – Vězení je teď první kartou na stole.
    const ji = g.players[0].board.indexOf(jail);
    g.resolveCardSelection(0, 'board', ji);
    assert.ok(!g.players[0].board.includes(jail));
});

test('Squaw: odhodí kartu ve hře; s vylepšením 2 ⛁ si ji vezme do ruky (Nebezpečná bez žetonů)', () => {
    const g = mkAd([{}, {}, {}, {}]);
    const crate = armed(g, 2, 'Bedna', 3);
    const si = giveAd(g, 0, 'Squaw');
    g.playSpecialCard(0, 2, si);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'board', 0);
    assert.ok(g.deck.discardPile.includes(crate));
    assert.equal(A.adSupply(g), 32, 'žetony odhozené Bedny jsou zpátky v zásobě');

    const h = mkAd([{}, {}, {}, {}]);
    const crate2 = armed(h, 2, 'Bedna', 3);
    h._adAdd(h.players[0], 2);
    const si2 = giveAd(h, 0, 'Squaw');
    h.playSpecialCard(0, 2, si2, { up: 1, pay: payChar(0, 2) });
    assert.equal(h.players[0].adLoads || 0, 0);
    h.resolveCardSelection(0, 'board', 0);
    assert.ok(h.players[0].hand.includes(crate2), 'Bedna je v ruce');
    assert.equal(A.adSupply(h), 32);
    // Vyložená znovu začíná na 3 žetonech.
    h.playCard(h.players[0].hand.indexOf(crate2));
    assert.equal(crate2.adLoads, 3);
});

test('Squaw: bez karty ve hře nehratelná; Apache Kid je imunní (3♦)', () => {
    const g = mkAd([{}, {}]);
    const si = giveAd(g, 0, 'Squaw');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[si]), false);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.players[1].character = 'Apache Kid';
    g.playSpecialCard(0, 1, si);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].board.length, 1);
});

// ── Rez (§4) ─────────────────────────────────────────────────────────────────

test('Rez: po 1 ⛁ z každé Nebezpečné karty a postavy ostatních na mou postavu, strop 4', () => {
    const g = mkAd([{}, {}, {}]);
    const ri = giveAd(g, 0, 'Rez');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[ri]), false, 'nikdo nic nemá');
    const ace = armed(g, 1, 'Eso v rukávu', 1);
    armed(g, 1, 'Bedna', 3);
    g._adAdd(g.players[1], 2);
    armed(g, 2, 'Zvonice', 2);
    g._adAdd(g.players[2], 1);
    armed(g, 0, 'Bandalír', 3);   // vlastní karty Rez nebere
    g._adAdd(g.players[0], 1);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[ri]), true);
    const supply = A.adSupply(g);
    g.playCard(ri);
    // 5 žetonů (Eso, Bedna, postava 1, Zvonice, postava 2) → 1 + 5 = 6 → strop 4, 2 do zásoby.
    assert.equal(g.players[0].adLoads, 4);
    assert.ok(!g.players[1].board.includes(ace), 'vyčerpané Eso odešlo');
    assert.equal(g.players[1].adLoads, 1);
    assert.equal(g.players[2].adLoads || 0, 0);
    assert.equal(A.adSupply(g), supply + 2);
    assert.equal(g.players[0].board[0].adLoads, 3, 'vlastní Bandalír netknutý');
});

test('Lee Van Kliff smí zopakovat Rez; Doroty ho smí poručit, Šíp a Squaw ne', () => {
    assert.equal(A.adRepeatOk(adCard('Rez')), true);
    assert.equal(A.adDorothyOk(adCard('Rez')), true);
    assert.equal(A.adDorothyOk(adCard('Šíp')), false);
    assert.equal(A.adDorothyOk(adCard('Squaw')), false);
    assert.equal(A.adDorothyOk(adCard('Paklíč')), true);
});

// ── Postavy (§5) ─────────────────────────────────────────────────────────────

test('Red Ringo: 4 žetony při rozdání, jednou za tah až 2 z postavy na své karty', () => {
    const g = mkAd([{ character: 'Red Ringo' }, {}]);
    g._adDealRingo();
    assert.equal(g.players[0].adLoads, 4);
    assert.equal(A.adRingoOk(g, 0), false, 'bez vlastní Nebezpečné karty ne');
    const ace = armed(g, 0, 'Eso v rukávu', 2);
    const bell = armed(g, 0, 'Zvonice', 3);
    assert.equal(A.adRingoOk(g, 0), true);
    assert.equal(g.adRingo(0), true);
    assert.equal(g.phase, 'AD_PLACE');
    assert.deepEqual(A.adPlaceTargets(g, 0).map(t => t.cardId).sort(), [ace.id, bell.id].sort(), 'postava cílem není');
    assert.equal(g.adPlace(0, 0, null), false);
    assert.equal(g.adPlace(0, 0, bell.id), true);
    assert.equal(bell.adLoads, 4);
    assert.equal(g.adPlace(0, 0, ace.id), true);
    assert.equal(ace.adLoads, 3);
    assert.equal(g.players[0].adLoads, 2);
    assert.equal(g.phase, 'PLAY');
    assert.equal(A.adRingoOk(g, 0), false, 'podruhé v tahu ne');
});

test('Red Ringo: zbytek smí nechat na postavě; bez rozšíření žetony nedostane', () => {
    const g = mkAd([{ character: 'Red Ringo' }, {}]);
    g._adDealRingo();
    armed(g, 0, 'Bedna', 2);
    g.adRingo(0);
    assert.equal(g.adPlaceDone(0), true);
    assert.equal(g.players[0].adLoads, 4);
    assert.equal(g.phase, 'PLAY');
    const h = mkGame([{ character: 'Red Ringo' }, {}]);
    h._adDealRingo();
    assert.equal(h.players[0].adLoads || 0, 0);
});

test('Bass Greeves: odhoď kartu → 2 ⛁ na JEDNO místo; nechat v zásobě nejde', () => {
    const g = mkAd([{ character: 'Bass Greeves' }, {}]);
    assert.equal(A.adBassOk(g, 0), false, 'prázdná ruka');
    const bi = bang(g, 0);
    const card = g.players[0].hand[bi];
    const bell = armed(g, 0, 'Zvonice', 1);
    assert.equal(A.adBassOk(g, 0), true);
    assert.equal(g.adBass(0, card.id), card);
    assert.ok(g.deck.discardPile.includes(card));
    assert.equal(g.phase, 'AD_PLACE');
    assert.equal(g.pendingAdPlace.oneTarget, true);
    assert.equal(g.adPlaceDone(0), false);
    assert.equal(g.adPlace(0, 0, bell.id), true);
    assert.equal(bell.adLoads, 3, 'obě na Zvonici');
    assert.equal(g.phase, 'PLAY');
    bang(g, 0);
    assert.equal(A.adBassOk(g, 0), false, 'jednou za tah');
});

test('Bass Greeves: na kartu se 3 žetony se vejde jen 1, zbytek propadá', () => {
    const g = mkAd([{ character: 'Bass Greeves' }, {}]);
    const card = g.players[0].hand[bang(g, 0)];
    const crate = armed(g, 0, 'Bedna', 3);
    g._adAdd(g.players[0], 4);
    g.adBass(0, card.id);
    g.adPlace(0, 0, crate.id);
    assert.equal(crate.adLoads, 4);
    assert.equal(A.adSupply(g), 32 - 8);
});

test('Frankie Canton: 1 ⛁ z cizí karty / cizí postavy / vlastní karty; ne z vlastní postavy', () => {
    const g = mkAd([{ character: 'Frankie Canton' }, {}, {}]);
    assert.equal(A.adFrankieOk(g, 0), false, 'nikde nic');
    const ace = armed(g, 1, 'Eso v rukávu', 1);
    g._adAdd(g.players[2], 2);
    g._adAdd(g.players[0], 1);
    const srcs = A.adFrankieSources(g, 0);
    assert.ok(srcs.some(s => s.seat === 1 && s.cardId === ace.id));
    assert.ok(srcs.some(s => s.seat === 2 && s.cardId === null));
    assert.ok(!srcs.some(s => s.seat === 0 && s.cardId === null), 'vlastní postava zdrojem není');
    assert.equal(g.adFrankie(0, 1, ace.id), true);
    assert.equal(g.players[0].adLoads, 2);
    assert.ok(!g.players[1].board.includes(ace), 'vyčerpané Eso odešlo');
    assert.equal(A.adFrankieOk(g, 0), false, 'jednou za tah');
    g.turnId++;
    g._adAdd(g.players[0], 2);
    assert.equal(A.adFrankieOk(g, 0), false, 'se 4 žetony ne');
});

// ── Bot (§6) ─────────────────────────────────────────────────────────────────

test('bot: Šíp na nepřítele, Paklíč na nepřítele s kartami, Bič na vlastní Vězení', () => {
    const g = mkAd([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Outlaw' }]);
    giveAd(g, 0, 'Šíp');
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_special');
    assert.equal(a.payload.targetIdx, 1);

    const h = mkAd([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
    const lp = armed(h, 0, 'Paklíč');
    bang(h, 1);
    const b = decideBotAction(h, 0);
    assert.deepEqual(b, { event: 'ad_use', payload: { cardId: lp.id, targetIdx: 1 } });

    const k = mkAd([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
    const whip = armed(k, 0, 'Bič');
    board(k, 0, CardType.JAIL, { name: 'Vězení' });
    const c = decideBotAction(k, 0);
    assert.deepEqual(c, { event: 'ad_use', payload: { cardId: whip.id, targetIdx: 0 } });
    k.adUse(0, whip.id, 0);
    const d = decideBotAction(k, 0);
    assert.equal(d.event, 'select_target_card');
    assert.equal(d.payload.area, 'board');
    assert.equal(k.players[0].board[d.payload.cardIdx].type, CardType.JAIL);
});

test('bot: Frankie bere nepříteli, Red Ringo dobíjí, Bass odhodí slabou kartu', () => {
    const g = mkAd([{ role: 'Outlaw', character: 'Frankie Canton' }, { role: 'Sheriff' }]);
    const ace = armed(g, 1, 'Eso v rukávu', 1);
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'ad_frankie', payload: { seat: 1, cardId: ace.id } });

    const r = mkAd([{ role: 'Outlaw', character: 'Red Ringo' }, { role: 'Sheriff' }]);
    r._adDealRingo();
    armed(r, 0, 'Zvonice', 1);
    assert.equal(decideBotAction(r, 0).event, 'ad_ringo');
    r.adRingo(0);
    assert.equal(decideBotAction(r, 0).event, 'ad_place');

    const b = mkAd([{ role: 'Outlaw', character: 'Bass Greeves' }, { role: 'Sheriff' }]);
    give(b, 0, CardType.JAIL, { name: 'Vězení' });   // keepScore 2 – a hrát ho bot nemůže (jen 2 hráči, šerif)
    const x = decideBotAction(b, 0);
    assert.equal(x.event, 'ad_bass');
});
