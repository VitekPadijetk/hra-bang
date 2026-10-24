// Rozšíření Údolí stínů – fáze F1: karty, které stojí na existující mašinerii.
//
//   TOMAHAWK      – bang-efekt do vzdálenosti 2 (vzor Úder), není to karta BANG!
//   POSLEDNÍ PIVO – +1 život ve svém tahu, i ve dvou hráčích; není to karta Pivo
//   CHŘESTÝŠ      – před libovolného hráče; na začátku tahu sejmutí, ♠ = −1 život
//   ODMĚNA        – před libovolného hráče; kdo ho zasáhne kartou BANG!, lízne si
//   LEMAT         – ve svém tahu libovolná karta (kromě Vedle!) jako BANG!
//   BROKOVNICE    – zasažený kartou BANG! z ní odhodí kartu dle své volby
//
// Podklad: docs/udoli-stinu-plan.md §2.4 (R5 „karta BANG!"), §4 a §8 (F1),
// docs/udoli-stinu.md §2 a §4 (upřesnění Albi / Dynamite Box, odpovědi dV).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { Card, distinctCardKinds } = require('../logic/entities.js');
const { cardPlayability, altBangOk, isBangCardPlay, lematBangOk, dorothyTargets, nativePlayInTurn } =
    require('../core/playability.js');
const { getActionForCard } = require('../core/cardRules.js');
const { pendingActor, waitingStatus, describePendingCheck } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { decideCardClick } = require('../core/selection.js');
const V = require('../core/valley.js');
const { computeCanHit, bangEffectReach } = require('../core/distance.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);

// Karta Údolí stínů podle jména – čerstvý kus se stejným typem, barvou a efektem jako v datech.
let _vid = 77000;
function vcard(name, o = {}) {
    const k = kinds.find(c => c.name === name);
    assert.ok(k, name);
    const c = new Card(_vid++, k.name, k.type, o.suit ?? k.suit, o.value ?? k.value,
        { range: k.range, effect: k.effect, bangEffect: k.bangEffect });
    c.effect = k.effect;
    c.exp = 'udoli_stinu';
    return c;
}
function giveV(g, idx, name, o) {
    g.players[idx].hand.push(vcard(name, o));
    return g.players[idx].hand.length - 1;
}
function boardV(g, idx, name, o) {
    const c = vcard(name, o);
    g.players[idx].board.push(c);
    return c;
}
function weaponV(g, idx, name) {
    const c = vcard(name);
    g.players[idx].weapon = c;
    return c;
}

const VOS_ON = { expansions: { udoli_stinu: true } };
function mkV(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.options = VOS_ON;
    g.turnId = 1;
    return g;
}

// Zásah: obránce nemá čím uhnout.
function takeHit(g, idx) {
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, idx);
    g.handleResponse(idx, null);
}

// ── Hotové druhy a menu ──────────────────────────────────────────────────────

test('F1: do balíčku jde šest hotových druhů', () => {
    assert.deepEqual([...V.VOS_CARDS_READY].sort(),
        ['Brokovnice', 'Chřestýš', 'Lemat', 'Odměna', 'Poslední pivo', 'Tomahawk']);
});

test('menu: Údolí stínů jde zapnout (už není „již brzy")', () => {
    const M = require('../core/menuModel.js');
    assert.ok(M.MENU_EXPANSIONS.some(e => e.key === 'udoli_stinu'));
    assert.ok(!M.MENU_EXPANSIONS_SOON.some(e => e.key === 'udoli_stinu'));
    assert.equal(M.emptyExpansions().udoli_stinu, false);
});

// ── Tomahawk ─────────────────────────────────────────────────────────────────

test('Tomahawk: zasáhne na vzdálenost 2, na 3 ne, a do limitu BANG! se nepočítá', () => {
    const g = mkV([{}, {}, {}, {}, {}, {}]);   // 6 hráčů: P2 je na 2, P3 na 3
    const i = giveV(g, 0, 'Tomahawk');
    const tom = g.players[0].hand[i];
    assert.equal(getActionForCard(tom, []), 'SHOOT');
    // Dostřel hlídá sdílený predikát (klient zvýrazní cíle, bot podle něj míří).
    assert.equal(bangEffectReach(tom), 2);
    assert.equal(computeCanHit(g, 0, 2, bangEffectReach(tom)), true);
    assert.equal(computeCanHit(g, 0, 3, bangEffectReach(tom)), false);
    assert.equal(computeCanHit(g, 0, 2), false, 'Colt by na 2 nedostřelil');
    g.playBang(0, 2, i);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[0].bangsPlayedThisTurn, 0, 'bang-efekt, ne karta BANG!');
    assert.ok(!g.pendingResponse.vos, 'není to karta BANG! – Odměna ani Brokovnice');
});

test('Tomahawk: A♦ Apache Kida míjí', () => {
    const g = mkV([{}, { character: 'Apache Kid' }]);
    const i = giveV(g, 0, 'Tomahawk');
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
});

// ── Poslední pivo ────────────────────────────────────────────────────────────

test('Poslední pivo: +1 život, i když zbývají jen dva hráči (Pivo tam nefunguje)', () => {
    const g = mkV([{ health: 2 }, {}]);
    const i = giveV(g, 0, 'Poslední pivo');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[i]), true);
    g.playCard(i);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].hand.length, 0);
    // Pivo by ve dvou nešlo.
    give(g, 0, CardType.BEER);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), false);
});

test('Poslední pivo: není to karta Pivo – Reverend ho nezakazuje a Tequila Joe dostane jen +1', () => {
    const g = mkV([{ health: 1, character: 'Tequila Joe' }, {}, {}]);
    g.activeEvent = { key: 'REVEREND' };
    const i = giveV(g, 0, 'Poslední pivo');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[i]), true);
    g.playCard(i);
    assert.equal(g.players[0].health, 2);
});

test('Poslední pivo: na plný život nejde a jako záchrana mimo tah se nenabízí', () => {
    const g = mkV([{}, { health: 1 }, {}]);
    const i = giveV(g, 0, 'Poslední pivo');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[i]), false);
    g.playCard(i);
    assert.equal(g.players[0].hand.length, 1, 'na plný život zůstává v ruce');

    // Hráč 1 na posledním životě se brání: Poslední pivo mu nepomůže.
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 1);
    const j = giveV(g, 1, 'Poslední pivo');
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[j]), false);
    assert.equal(g.beerLastLifeSave(1, j), false);
});

test('Poslední pivo: Lee Van Kliff ho smí zopakovat (efekt +1 život)', () => {
    const g = mkV([{}]);
    assert.deepEqual(g._brownRepeatSpec(vcard('Poslední pivo')), { effect: 'LAST_CALL', aim: null });
    g.players[0].health = 2;
    g._repeatBrownEffect(0, { effect: 'LAST_CALL', suit: Suits.DIAMONDS }, null);
    assert.equal(g.players[0].health, 3);
});

// ── Chřestýš ─────────────────────────────────────────────────────────────────

test('Chřestýš: smí před kohokoli – i před sebe a šerifa, ale ne dvakrát', () => {
    const g = mkV([{ role: 'Outlaw' }, { role: 'Sheriff' }, {}]);
    const card = vcard('Chřestýš');
    assert.equal(getActionForCard(card, []), 'Chřestýš');
    assert.equal(V.vosPlaceTargetOk(g, 0, card), true, 'sebe');
    assert.equal(V.vosPlaceTargetOk(g, 1, card), true, 'šerifa');
    const i = giveV(g, 0, 'Chřestýš');
    g.playSpecialCard(0, 1, i);
    assert.equal(g.players[1].board[0].type, CardType.RATTLESNAKE);
    assert.equal(g.players[0].hand.length, 0);
    // Druhý Chřestýš před téhož hráče nejde (dvě karty stejného jména).
    const j = giveV(g, 0, 'Chřestýš');
    assert.equal(V.vosPlaceTargetOk(g, 1, g.players[0].hand[j]), false);
    g.playSpecialCard(0, 1, j);
    assert.equal(g.players[0].hand.length, 1, 'zůstal v ruce');
    assert.equal(g.players[1].board.length, 1);
});

test('Chřestýš: ♠ na začátku tahu = klikaný zásah bez útočníka, karta zůstává', () => {
    const g = mkV([{}, { character: 'El Gringo' }], { current: 1 });
    g.options = { expansions: { udoli_stinu: true, zlata_horecka: true } };
    g._goldRush = true;
    boardV(g, 1, 'Chřestýš');
    give(g, 0, CardType.BANG);   // El Gringo by měl co brát, kdyby měl útočníka
    topDeck(g, Suits.SPADES, 'K');
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(describePendingCheck(g, 1).kind, 'RATTLESNAKE');
    g.triggerCheckDraw();
    assert.equal(g.phase, 'CHECKING');
    assert.equal(g.currentCheck.reason, 'RATTLESNAKE');
    g.resolveCheck();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.deepEqual(g.pendingDynamiteDamage, { playerIdx: 1, hitsLeft: 1, source: 'RATTLESNAKE' });
    assert.equal(waitingStatus(g).text, 'Chřestýš – ztrácí život');
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[0].nuggets, 0, 'nikdo zranění nezpůsobil – žádný valoun');
    assert.ok(!g.specialActionQueue.some(a => a.type === 'EL_GRINGO_STEAL'));
    // Po zásahu rovnou lízání – Chřestýš se v tomhle tahu znovu nesnímá.
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.players[1].board[0].type, CardType.RATTLESNAKE, 'karta zůstává');
});

test('Chřestýš: jiná barva než ♠ = nic, rovnou lízání', () => {
    const g = mkV([{}, {}]);
    boardV(g, 0, 'Chřestýš');
    topDeck(g, Suits.HEARTS, '5');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.players[0].health, 4);
});

test('Chřestýš: pořadí Dynamit → Vězení → Chřestýš; neúspěšné Vězení = žádné snímání', () => {
    const g = mkV([{}, {}, {}]);
    board(g, 0, CardType.JAIL);
    boardV(g, 0, 'Chřestýš');
    topDeck(g, Suits.SPADES, 'K');   // Vězení: pik → tah přeskočen
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.currentCheck.reason, 'JAIL');
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1, 'tah přeskočen');
    assert.equal(g.players[0].health, 4, 'na Chřestýše se nesnímalo');

    const h = mkV([{}, {}, {}]);
    board(h, 0, CardType.JAIL);
    boardV(h, 0, 'Chřestýš');
    topDeck(h, Suits.SPADES, '2');   // Chřestýš (druhé sejmutí)
    topDeck(h, Suits.HEARTS, '5');   // Vězení: srdce → hraje
    h.handleStartOfTurnChecks();
    h.triggerCheckDraw();
    assert.equal(h.currentCheck.reason, 'JAIL');
    h.resolveCheck();
    assert.equal(h.phase, 'CHECK_DRAW', 'po Vězení se snímá na Chřestýše');
    h.triggerCheckDraw();
    assert.equal(h.currentCheck.reason, 'RATTLESNAKE');
    h.resolveCheck();
    assert.equal(h.phase, 'DYNAMITE_DAMAGE');
});

test('Chřestýš: dynamit, který zůstal ležet, se po zásahu Chřestýše nesnímá znovu', () => {
    const g = mkV([{}]);   // jediný hráč u stolu – dynamit není komu poslat
    board(g, 0, CardType.DYNAMITE);
    boardV(g, 0, 'Chřestýš');
    topDeck(g, Suits.SPADES, 'J');   // Chřestýš: ♠ → zásah
    topDeck(g, Suits.HEARTS, '5');   // Dynamit: nevybuchne, zůstává
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.currentCheck.reason, 'DYNAMITE');
    g.resolveCheck();
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw();
    assert.equal(g.currentCheck.reason, 'RATTLESNAKE');
    g.resolveCheck();
    g.takeDynamiteHit(0);
    assert.equal(g.phase, 'DRAW', 'dynamit se podruhé nesnímá');
});

test('Chřestýš: Laso ho vypíná, Požehnání chrání, Prokletí kousne vždy', () => {
    const g = mkV([{}, {}]);
    boardV(g, 0, 'Chřestýš');
    g.activeFistful = { key: 'LASO' };
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'DRAW', 'Laso: karty na stole nemají efekt');

    const h = mkV([{}, {}]);
    boardV(h, 0, 'Chřestýš');
    h.activeEvent = { key: 'POZEHNANI' };
    topDeck(h, Suits.SPADES, '9');
    h.handleStartOfTurnChecks(); h.triggerCheckDraw(); h.resolveCheck();
    assert.equal(h.phase, 'DRAW', 'Požehnání: všechno je srdce');

    const k = mkV([{}, {}]);
    boardV(k, 0, 'Chřestýš');
    k.activeEvent = { key: 'PROKLETI' };
    topDeck(k, Suits.HEARTS, '9');
    k.handleStartOfTurnChecks(); k.triggerCheckDraw(); k.resolveCheck();
    assert.equal(k.phase, 'DYNAMITE_DAMAGE', 'Prokletí: všechno je pik');
});

test('Chřestýš: Lucky Duke vybírá ze dvou karet', () => {
    const g = mkV([{ character: 'Lucky Duke' }, {}]);
    boardV(g, 0, 'Chřestýš');
    topDeck(g, Suits.SPADES, '3');
    topDeck(g, Suits.HEARTS, '3');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    const hi = g.luckyDukeState.cards.findIndex(c => c.suit === Suits.HEARTS);
    g.luckyDukePick(hi);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.players[0].health, 4);
});

// ── Odměna ───────────────────────────────────────────────────────────────────

test('Odměna: zásah kartou BANG! = střelec si lízne 1 kartu', () => {
    const g = mkV([{}, {}]);
    boardV(g, 1, 'Odměna');
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    assert.deepEqual(g.pendingResponse.vos, { bangCard: true, shotgun: false });
    takeHit(g, 1);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    assert.equal(waitingStatus(g).text, 'Odměna – líže 1 kartu');
    topDeck(g, Suits.CLUBS, '7');
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Odměna: po Vedle! nic, Tomahawk ani Kulomet ji nespustí', () => {
    const g = mkV([{}, {}, {}]);
    boardV(g, 1, 'Odměna');
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    give(g, 1, CardType.MISSED);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.specialActionQueue.length, 0);

    const i = giveV(g, 0, 'Tomahawk');
    g.playBang(0, 1, i);
    takeHit(g, 1);
    assert.equal(g.phase, 'PLAY', 'bang-efekt není karta BANG!');

    give(g, 0, CardType.GATLING);
    g.playSpecialCard(0, null, g.players[0].hand.length - 1);
    takeHit(g, 1);
    takeHit(g, 2);
    assert.ok(!g.specialActionQueue.some(a => a.type === 'KILL_REWARD'));
    assert.notEqual(g.phase, 'DRAW');
});

test('Odměna: střelec líže, i když zásah cíl vyřadil (čte se před úklidem stolu)', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Deputy', health: 1 }, { role: 'Outlaw' }]);
    boardV(g, 1, 'Odměna');
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    takeHit(g, 1);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1].board.length, 0, 'smrt stůl uklidila');
    // Šerif zabil pomocníka → odhodí ruku (prázdná), Odměna mu přesto dá 1 kartu.
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0);
});

test('Odměna: Pivo na posledním životě zásah nepřebíjí – střelec stejně líže', () => {
    const g = mkV([{}, { health: 1 }, {}]);
    boardV(g, 1, 'Odměna');
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    give(g, 1, CardType.BEER);
    assert.equal(g.beerLastLifeSave(1, 0), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0);
});

test('Odměna: Laso i Belle Star ji vypínají', () => {
    const g = mkV([{}, {}]);
    boardV(g, 1, 'Odměna');
    g.activeFistful = { key: 'LASO' };
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    takeHit(g, 1);
    assert.equal(g.phase, 'PLAY');

    const h = mkV([{ character: 'Belle Star' }, {}]);
    boardV(h, 1, 'Odměna');
    give(h, 0, CardType.BANG);
    h.playBang(0, 1, 0);
    takeHit(h, 1);
    assert.equal(h.phase, 'PLAY');
});

test('Odměna: přes barel (♠) se vos kontext nese až do zásahu', () => {
    const g = mkV([{}, {}]);
    boardV(g, 1, 'Odměna');
    board(g, 1, CardType.BARREL);
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    assert.equal(g.phase, 'BARREL_DRAW');
    topDeck(g, Suits.SPADES, '4');
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND');
    assert.deepEqual(g.pendingResponse.vos, { bangCard: true, shotgun: false });
    takeHit(g, 1);
    assert.equal(g.phase, 'DRAW');
});

// ── Lemat ────────────────────────────────────────────────────────────────────

test('Lemat: libovolná karta jako BANG! – počítá se do limitu a je to KARTA BANG!', () => {
    const g = mkV([{}, {}, {}]);
    weaponV(g, 0, 'Lemat');
    boardV(g, 1, 'Odměna');
    const i = give(g, 0, CardType.STORE);
    const me = g.players[0];
    assert.equal(lematBangOk(g, me, 0, me.hand[i]), true);
    assert.equal(altBangOk(g, me, 0, me.hand[i]), true);
    assert.equal(isBangCardPlay(g, me, 0, me.hand[i]), true);
    // Vlastní akce zůstává (Hokynářství jde pořád zahrát) – výstřel je jen přepínač.
    assert.equal(nativePlayInTurn(g, me, 0, me.hand[i]), true);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(me.bangsPlayedThisTurn, 1);
    takeHit(g, 1);
    assert.equal(g.phase, 'DRAW', 'Odměna: Lemat dělá kartu BANG!');
    g.drawCard('deck');
    // Limit je vyčerpaný – druhá karta už jako BANG! nejde.
    const j = give(g, 0, CardType.STORE);
    assert.equal(lematBangOk(g, me, 0, me.hand[j]), false);
    g.playBang(0, 1, j);
    assert.equal(g.phase, 'PLAY');
});

test('Lemat: kromě Vedle! (a jen ve svém tahu)', () => {
    const g = mkV([{}, {}]);
    weaponV(g, 0, 'Lemat');
    const i = give(g, 0, CardType.MISSED);
    assert.equal(lematBangOk(g, g.players[0], 0, g.players[0].hand[i]), false);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[i]), false);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'PLAY');
    // Mimo svůj tah ne.
    weaponV(g, 1, 'Lemat');
    const j = give(g, 1, CardType.STORE);
    assert.equal(lematBangOk(g, g.players[1], 1, g.players[1].hand[j]), false);
});

test('Lemat: v duelu jako BANG! nepomůže (jen při střelbě)', () => {
    const g = mkV([{}, {}]);
    weaponV(g, 1, 'Lemat');
    give(g, 0, CardType.DUEL);
    g.playSpecialCard(0, 1, 0);
    assert.equal(g.pendingResponse.requiredCard, CardType.BANG);
    const j = give(g, 1, CardType.STORE);
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[j]), false);
    g.handleResponse(1, j);
    assert.equal(g.players[1].hand.length, 1, 'neodpověděl');
});

test('Lemat: Kazatel ho zakazuje, Willy the Kid smí víckrát, Laso ho vypíná', () => {
    const g = mkV([{}, {}]);
    weaponV(g, 0, 'Lemat');
    g.activeEvent = { key: 'KAZATEL' };
    const i = give(g, 0, CardType.STORE);
    assert.equal(lematBangOk(g, g.players[0], 0, g.players[0].hand[i]), false);

    const w = mkV([{ character: 'Willy the Kid' }, {}]);
    weaponV(w, 0, 'Lemat');
    w.players[0].bangsPlayedThisTurn = 3;
    const k = give(w, 0, CardType.STORE);
    assert.equal(lematBangOk(w, w.players[0], 0, w.players[0].hand[k]), true);

    const l = mkV([{}, {}]);
    weaponV(l, 0, 'Lemat');
    l.activeFistful = { key: 'LASO' };
    const m = give(l, 0, CardType.STORE);
    assert.equal(lematBangOk(l, l.players[0], 0, l.players[0].hand[m]), false);
});

test('Lemat: karta bez vlastní akce se vybere bez akce a čeká na přepínač', () => {
    const g = mkV([{}, {}]);
    weaponV(g, 0, 'Lemat');
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    const i = give(g, 0, CardType.BARREL, { name: 'Barel' });   // druhý Barel vyložit nejde
    const me = g.players[0];
    assert.equal(nativePlayInTurn(g, me, 0, me.hand[i]), false);
    assert.equal(cardPlayability(g, me, 0, me.hand[i]), true);
    const intent = decideCardClick({ state: g, me, myIndex: 0, selectedState: {}, card: me.hand[i],
                                     index: i, blockInput: false, isMySidActive: false, playable: true });
    assert.deepEqual(intent, { type: 'SELECT', index: i, action: null });
});

// ── Brokovnice ───────────────────────────────────────────────────────────────

test('Brokovnice: zasažený odhodí kartu dle své volby, pak se hraje dál', () => {
    const g = mkV([{}, {}]);
    weaponV(g, 0, 'Brokovnice');
    give(g, 0, CardType.BANG);
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.STORE);
    const keepId = g.players[1].hand[0].id;
    const dropId = g.players[1].hand[1].id;
    g.playBang(0, 1, 0);
    assert.deepEqual(g.pendingResponse.vos, { bangCard: true, shotgun: true });
    takeHit(g, 1);
    assert.equal(g.phase, 'SHOTGUN_DISCARD');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'SHOTGUN_DISCARD' });
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[0]), true);
    assert.equal(cardPlayability(g, g.players[0], 0, { id: 1, type: 'Bang!' }), null);
    // Cizí hráč ani neplatná karta nic neudělají.
    assert.equal(g.vosPick(0, [dropId]), null);
    assert.equal(g.vosPick(1, [999999]), null);
    const res = g.vosPick(1, [dropId]);
    assert.equal(res.card.id, dropId);
    assert.deepEqual(g.players[1].hand.map(c => c.id), [keepId]);
    assert.equal(g.deck.discardTop().id, dropId);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingShotgun, null);
});

test('Brokovnice: bez karet v ruce, po Vedle! a s Tomahawkem nic', () => {
    const g = mkV([{}, {}]);
    weaponV(g, 0, 'Brokovnice');
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    takeHit(g, 1);
    assert.equal(g.phase, 'PLAY', 'prázdná ruka – není co odhodit');

    const h = mkV([{}, {}]);
    weaponV(h, 0, 'Brokovnice');
    give(h, 0, CardType.BANG);
    h.playBang(0, 1, 0);
    give(h, 1, CardType.MISSED);
    give(h, 1, CardType.BEER);
    h.handleResponse(1, 0);
    assert.equal(h.phase, 'PLAY');
    assert.equal(h.players[1].hand.length, 1);

    const k = mkV([{}, {}]);
    weaponV(k, 0, 'Brokovnice');
    const t = giveV(k, 0, 'Tomahawk');
    give(k, 1, CardType.BEER);
    k.playBang(0, 1, t);
    takeHit(k, 1);
    assert.equal(k.phase, 'PLAY', 'Tomahawk není karta BANG!');
    assert.equal(k.players[1].hand.length, 1);
});

test('Brokovnice: zasažený, kterého zásah vyřadil, už nic neodhazuje', () => {
    const g = mkV([{ role: 'Outlaw' }, { role: 'Outlaw', health: 1 }, { role: 'Sheriff' }]);
    weaponV(g, 0, 'Brokovnice');
    give(g, 0, CardType.BANG);
    give(g, 1, CardType.STORE);
    g.playBang(0, 1, 0);
    takeHit(g, 1);
    assert.notEqual(g.phase, 'SHOTGUN_DISCARD');
    assert.ok(!g.specialActionQueue.some(a => a.type === 'SHOTGUN_DISCARD'));
});

test('Brokovnice → Odměna → El Gringo (pořadí dV)', () => {
    const g = mkV([{}, { character: 'El Gringo' }]);
    weaponV(g, 0, 'Brokovnice');
    boardV(g, 1, 'Odměna');
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.STORE);          // El Gringovi bude co vzít
    give(g, 1, CardType.BEER);
    g.playBang(0, 1, 0);
    takeHit(g, 1);
    assert.equal(g.phase, 'SHOTGUN_DISCARD');
    assert.deepEqual(g.specialActionQueue.map(a => a.type), ['KILL_REWARD', 'EL_GRINGO_STEAL']);
});

test('Brokovnice: odhoz poslední karty probudí Suzy Lafayette až po něm', () => {
    const g = mkV([{}, { character: 'Suzy Lafayette' }]);
    weaponV(g, 0, 'Brokovnice');
    give(g, 0, CardType.BANG);
    give(g, 1, CardType.STORE);
    g.playBang(0, 1, 0);
    takeHit(g, 1);
    assert.equal(g.phase, 'SHOTGUN_DISCARD');
    g.vosPick(1, [g.players[1].hand[0].id]);
    assert.equal(g.phase, 'SUZY_DRAW');
});

test('Brokovnice pod Lasem nefunguje', () => {
    const g = mkV([{}, {}]);
    weaponV(g, 0, 'Brokovnice');
    g.activeFistful = { key: 'LASO' };
    give(g, 0, CardType.BANG);
    give(g, 1, CardType.BEER);
    g.playBang(0, 1, 0);
    takeHit(g, 1);
    assert.equal(g.phase, 'PLAY');
});

test('bez zapnutého rozšíření se do útoku nic nového nepíše', () => {
    const g = mkGame([{}, {}]);
    give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    assert.ok(!('vos' in g.pendingResponse));
});

// ── Bot, Doroty, selection ───────────────────────────────────────────────────

test('bot: v SHOTGUN_DISCARD odhodí nejméně cennou kartu', () => {
    const g = mkV([{}, {}]);
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.JAIL);
    g.phase = 'SHOTGUN_DISCARD';
    g.pendingShotgun = { playerIdx: 1, attackerIdx: 0 };
    const a = decideBotAction(g, 1, null);
    assert.equal(a.event, 'vos_pick');
    assert.deepEqual(a.payload, { cardIds: [g.players[1].hand[1].id], playerIdx: 1 });
});

test('bot: vypije Poslední pivo, když je zraněný, a vyloží Chřestýše', () => {
    const g = mkV([{ health: 2 }, {}]);
    giveV(g, 0, 'Poslední pivo');
    const a = decideBotAction(g, 0, null);
    assert.deepEqual(a, { event: 'play_card', payload: 0 });

    const h = mkV([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    h.players[1]._roleRevealed = true;   // veřejně známý nepřítel
    giveV(h, 0, 'Chřestýš');
    const b = decideBotAction(h, 0, null);
    assert.equal(b.event, 'play_special');
    assert.equal(b.payload.targetIdx, 1);
});

test('selection: v SHOTGUN_DISCARD klik rovnou odhazuje', () => {
    const g = mkV([{}, {}]);
    give(g, 1, CardType.BEER);
    g.phase = 'SHOTGUN_DISCARD';
    g.pendingShotgun = { playerIdx: 1, attackerIdx: 0 };
    const me = g.players[1];
    const intent = decideCardClick({ state: g, me, myIndex: 1, selectedState: {}, card: me.hand[0],
                                     index: 0, blockInput: false, isMySidActive: false, playable: true });
    assert.deepEqual(intent, { type: 'VOS_PICK', index: 0, cardId: me.hand[0].id });
});

test('Doroty: Chřestýš a Odměna jdou poručit na cíl, který ho ještě nemá', () => {
    const g = mkV([{}, {}, {}]);
    boardV(g, 2, 'Chřestýš');
    const t = dorothyTargets(g, 1, vcard('Chřestýš'));
    assert.deepEqual(t, [0]);
    assert.deepEqual(dorothyTargets(g, 1, vcard('Odměna')), [0, 2]);
});
