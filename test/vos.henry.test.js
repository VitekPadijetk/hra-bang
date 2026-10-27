// Rozšíření Údolí stínů – fáze F7: Henry Block (pozastavená akce).
//
//   HENRY BLOCK – „Hráč, který si vezme nebo odhodí kartu z Henryho ruky nebo ležící
//                 před ním, je cílem efektu BANG!."
//   dV: „Karta se vezme (odhodí) až POTOM, co se automatický BANG! vyhodnotí" a „když
//       zloděj umře, karta zůstává Henrymu". Albi: Vzít = Panika, Ragtime, Krytý vůz,
//       Jesse Jones, Pat Brennan; odhodit = Cat Balou, Rvačka, Kankán. Nevztahuje se na
//       schopnosti spouštěné herními efekty (El Gringo).
//
// Podklad: docs/udoli-stinu-plan.md §2.9, R7; docs/udoli-stinu.md §3, §4, §5.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { Card, distinctCardKinds, VOS_READY } = require('../logic/entities.js');
const { pendingActor, waitingStatus, describePendingResponse } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const V = require('../core/valley.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);
const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));
const gearData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8'));

let _vid = 81000;
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

const VOS_ON = { expansions: { udoli_stinu: true } };
function mkV(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.options = VOS_ON;
    g.turnId = 1;
    return g;
}
const HENRY = 'Henry Block';
const idOf = (g, idx, i) => g.players[idx].hand[i].id;
const has = (p, id) => p.hand.some(c => c && c.id === id);
const inDiscard = (g, id) => g.deck._discardPile.some(c => c && c.id === id);
const miss = (g, i) => give(g, i, CardType.MISSED, { name: 'Vedle!' });

// Panika hráče 0 na Henryho (hráč 1) – výběr karty z ruky. Vrací ID Henryho karty.
function panicOnHenry(g, thief = 0, henry = 1) {
    const hc = give(g, henry, CardType.BEER, { name: 'Pivo' });
    const cardId = idOf(g, henry, hc);
    const pi = give(g, thief, CardType.PANIC, { name: 'Panika!' });
    g.playSpecialCard(thief, henry, pi);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(thief, 'hand', null);
    return cardId;
}

// ── Data ─────────────────────────────────────────────────────────────────────

test('F7: Henry Block jde do ostré hry (všech pět postav je hotových)', () => {
    assert.ok(VOS_READY.includes(HENRY));
});

// ── Panika: nejdřív výstřel, pak krádež ─────────────────────────────────────

test('Panika na Henryho: nejdřív BANG! od Henryho, karta zatím zůstává', () => {
    const g = mkV([{}, { character: HENRY }]);
    const cardId = panicOnHenry(g);
    assert.equal(g.phase, 'RESPOND');
    const pr = g.pendingResponse;
    assert.equal(pr.originatorIdx, 1, 'střílí Henry');
    assert.equal(pr.targetIdx, 0, 'na zloděje');
    assert.equal(pr.bangEffect, true, 'je to bang-efekt (žádný Slab, Odměna, Colorado)');
    assert.equal(pr.vos.shot, 'HENRY');
    assert.equal(pr.vos.noEscape, true, 'Útěk ho nezruší – není to karta');
    assert.ok(!g.pendingSelection, 'výběr karty je pozastavený');
    assert.ok(has(g.players[1], cardId), 'karta je pořád u Henryho');
    assert.equal(g._vosSuspended.kind, 'SELECTION');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'RESPOND' });
    assert.match(waitingStatus(g).text, /Henryho Blocka/);
    assert.equal(describePendingResponse(g, 0).henry, true);
});

test('zloděj uhne Vedle! → teprve pak si kartu vezme', () => {
    const g = mkV([{}, { character: HENRY }]);
    miss(g, 0);
    const cardId = panicOnHenry(g);
    g.handleResponse(0, g.players[0].hand.findIndex(c => c.type === CardType.MISSED));
    assert.equal(g.phase, 'PLAY');
    assert.ok(has(g.players[0], cardId), 'karta je u zloděje');
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g._vosSuspended, null);
    assert.equal(g.players[0].health, 4);
    // Animace přesunu (pošle ji hák před broadcastem – flushHenryMove).
    assert.deepEqual(g._henryAnim, { mode: 'steal', thiefIdx: 0, henryIdx: 1, area: 'hand',
                                     cardId, boardIdx: null, stolenIndex: 0 });
});

test('zloděj schytá zásah a přežije → karta se přesto vezme', () => {
    const g = mkV([{}, { character: HENRY }]);
    const cardId = panicOnHenry(g);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 3);
    assert.ok(has(g.players[0], cardId));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0, 'tah pokračuje');
});

test('zloděj zásah nepřežije → karta zůstává Henrymu a zabil ho Henry', () => {
    const g = mkV([{ role: 'Outlaw', health: 1 }, { role: 'Sheriff', character: HENRY }, { role: 'Renegade' }]);
    const cardId = panicOnHenry(g);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 0);
    assert.ok(has(g.players[1], cardId), 'karta zůstala Henrymu');
    assert.equal(g._vosSuspended, null);
    // Odměna za banditu patří Henrymu (vystřelil on), ne hráči na tahu.
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    for (let k = 0; k < 3; k++) g.drawCard('deck');
    assert.equal(g.currentPlayerIndex, 1, 'tah mrtvého zloděje skončil');
});

test('Útěk proti Henryho výstřelu nejde (není to karta)', () => {
    const g = mkV([{}, { character: HENRY }]);
    giveV(g, 0, 'Útěk');
    panicOnHenry(g);
    const ui = g.players[0].hand.findIndex(c => c.type === CardType.ESCAPE);
    assert.equal(V.escapeRespondOk(g, 0, g.players[0].hand[ui]), false);
    g.handleResponse(0, ui);
    assert.equal(g.phase, 'RESPOND', 'neplatná odpověď – čeká se dál');
});

test('úspěšný Barel zloděje → krádež proběhne', () => {
    const g = mkV([{}, { character: HENRY }]);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    const cardId = panicOnHenry(g);
    assert.equal(g.phase, 'BARREL_DRAW');
    topDeck(g, Suits.HEARTS, 'K');
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'PLAY');
    assert.ok(has(g.players[0], cardId));
});

test('Opětovná palba: nejdřív doběhne krádež, pak výstřel zpět na Henryho', () => {
    const g = mkV([{}, { character: HENRY }]);
    giveV(g, 0, 'Opětovná palba');
    const cardId = panicOnHenry(g);
    g.handleResponse(0, g.players[0].hand.findIndex(c => c.type === CardType.BACKFIRE));
    assert.ok(has(g.players[0], cardId), 'karta už je u zloděje');
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1, 'teď se brání Henry');
    assert.equal(g.pendingResponse.vos.shot, 'BACKFIRE');
});

test('Bart Cassidy jako zloděj: nejdřív krádež (efekt karty), pak líznutí za zásah', () => {
    const g = mkV([{ character: 'Bart Cassidy' }, { character: HENRY }]);
    const cardId = panicOnHenry(g);
    g.handleResponse(0, null);
    assert.ok(has(g.players[0], cardId), 'Panika doběhla dřív než schopnost');
    assert.equal(g.phase, 'BART_DRAW');
});

// Divoký západ – Teren Kill: výstřel ho „vyřadil", ale vyřazení se pozastavilo na
// sejmutí. Jestli karta zůstane Henrymu, se ví až po něm.
test('Teren Kill jako zloděj: ♠ → umírá a karta zůstává Henrymu', () => {
    const g = mkV([{ role: 'Outlaw', character: 'Teren Kill', health: 1 },
                   { role: 'Sheriff', character: HENRY }, { role: 'Renegade' }]);
    const cardId = panicOnHenry(g);
    g.handleResponse(0, null);
    assert.equal(g.phase, 'CHECK_DRAW', 'Teren snímá');
    assert.ok(g._vosSuspended, 'krádež čeká, až se rozhodne');
    assert.ok(has(g.players[1], cardId));
    topDeck(g, Suits.SPADES, '5');
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].health, 0);
    assert.ok(has(g.players[1], cardId), 'karta zůstala Henrymu');
    assert.equal(g._vosSuspended, null);
});

test('Teren Kill jako zloděj: jiná barva → přežije a kartu si vezme', () => {
    const g = mkV([{ role: 'Outlaw', character: 'Teren Kill', health: 1 },
                   { role: 'Sheriff', character: HENRY }, { role: 'Renegade' }]);
    const cardId = panicOnHenry(g);
    g.handleResponse(0, null);
    topDeck(g, Suits.HEARTS, '5');
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].health, 1);
    assert.ok(has(g.players[0], cardId), 'krádež doběhla');
    assert.equal(g._vosSuspended, null);
    assert.equal(g.phase, 'DRAW', 'pak si Teren líže za přežití');
    assert.equal(g.drawPhaseState.playerIdx, 0);
});

// ── Cat Balou: odhoz ze stolu ────────────────────────────────────────────────

test('Cat Balou na Henryho kartu na stole: odhodí se až po výstřelu', () => {
    const g = mkV([{}, { character: HENRY }]);
    const must = board(g, 1, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    miss(g, 0);
    const ci = give(g, 0, CardType.CAT_BALOU, { name: 'Cat Balou' });
    g.playSpecialCard(0, 1, ci);
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.phase, 'RESPOND');
    assert.ok(g.players[1].board.some(c => c.id === must.id), 'zatím leží');
    g.handleResponse(0, 0);
    assert.equal(g.players[1].board.length, 0);
    assert.ok(inDiscard(g, must.id));
    assert.deepEqual(g._henryAnim, { mode: 'discard', thiefIdx: 0, henryIdx: 1, area: 'board',
                                     cardId: must.id, boardIdx: 1, stolenIndex: null });
});

// ── Rvačka: jednou za Henryho kartu ──────────────────────────────────────────

test('Rvačka: střílí se jen při výběru Henryho karty, pak Rvačka pokračuje', () => {
    const g = mkV([{}, { character: HENRY }, {}]);
    give(g, 0, CardType.BRAWL, { name: 'Rvačka', props: { discardExtra: 'brawl' } });
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    const hc = give(g, 1, CardType.BEER, { name: 'Pivo' });
    const henryCard = idOf(g, 1, hc);
    give(g, 2, CardType.BEER, { name: 'Pivo' });
    g.startDiscardExtra(0, { targetIdx: null });
    g.discardAnotherCard(0, 1);
    assert.equal(g.pendingSelection.targetIdx, 1);
    g.resolveCardSelection(0, 'hand', null);
    assert.equal(g.phase, 'RESPOND', 'Henry střílí');
    g.handleResponse(0, null);
    assert.ok(inDiscard(g, henryCard), 'Henryho karta odhozená');
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.targetIdx, 2, 'Rvačka jde dál');
    g.resolveCardSelection(0, 'hand', null);
    assert.equal(g.phase, 'PLAY', 'na ostatní se nestřílí');
    assert.equal(g.players[2].hand.length, 0);
});

// ── Krytý vůz (zelená, oblast zvolená předem) ───────────────────────────────

test('Krytý vůz na Henryho ruku: výstřel, pak krádež', () => {
    const g = mkV([{}, { character: HENRY }]);
    const wagon = board(g, 0, CardType.COVERED_WAGON,
                        { name: 'Krytý vůz', props: { green: true, activate: 'steal_any' } });
    wagon._playedTurn = 0;   // položený dřív než v tomhle tahu
    const hc = give(g, 1, CardType.BEER, { name: 'Pivo' });
    const cardId = idOf(g, 1, hc);
    g.activateGreenCard(0, wagon.id, { targetIdx: 1, area: 'hand', boardIdx: null });
    assert.equal(g.phase, 'RESPOND');
    assert.ok(has(g.players[1], cardId));
    g.handleResponse(0, null);
    assert.ok(has(g.players[0], cardId));
    assert.equal(g.phase, 'PLAY');
});

// ── Jesse Jones a Pat Brennan ────────────────────────────────────────────────

test('Jesse Jones bere z Henryho ruky: výstřel uprostřed fáze lízání', () => {
    const g = mkV([{ role: 'Sheriff', character: 'Jesse Jones' }, { role: 'Outlaw', character: HENRY }]);
    const hc = give(g, 1, CardType.BEER, { name: 'Pivo' });
    const cardId = idOf(g, 1, hc);
    miss(g, 0);
    g.deck.cards = [mkCard(CardType.BANG, { name: 'z balíčku' })];
    g.startDrawPhase();
    g.drawCard('opponent_hand', 1);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.drawPhaseState.active, false, 'lízání čeká');
    assert.equal(g.drawPhaseState.cardsDrawn, 0);
    g.handleResponse(0, 0);
    assert.equal(g.phase, 'DRAW', 'fáze lízání pokračuje');
    assert.equal(g.drawPhaseState.active, true);
    assert.equal(g.drawPhaseState.cardsDrawn, 1);
    assert.ok(has(g.players[0], cardId));
    assert.equal(g._henryAnim.mode, 'jesse');
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
});

test('Jesse Jones výstřel nepřežije → karta zůstává, tah končí', () => {
    const g = mkV([{ role: 'Outlaw', character: 'Jesse Jones', health: 1 },
                   { role: 'Sheriff', character: HENRY }, { role: 'Renegade' }]);
    const hc = give(g, 1, CardType.BEER, { name: 'Pivo' });
    const cardId = idOf(g, 1, hc);
    g.startDrawPhase();
    g.drawCard('opponent_hand', 1);
    g.handleResponse(0, null);
    assert.ok(has(g.players[1], cardId));
    assert.equal(g._vosSuspended, null);
    assert.equal(g.drawPhaseState.playerIdx, 1, 'líže Henry – odměna za banditu');
});

test('Pat Brennan bere Henryho kartu ze stolu až po výstřelu', () => {
    const g = mkV([{ role: 'Sheriff', character: 'Pat Brennan' }, { role: 'Outlaw', character: HENRY }]);
    const must = board(g, 1, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    g.startDrawPhase();
    assert.ok(g.drawPhaseState.options.includes('board'));
    g.drawCard('board', 1, 'board', 0);
    assert.equal(g.phase, 'RESPOND');
    assert.ok(g.players[1].board.some(c => c.id === must.id));
    g.handleResponse(0, null);
    assert.ok(has(g.players[0], must.id));
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.phase, 'PLAY', 'Pat tím fázi lízání končí');
    assert.equal(g._henryAnim.mode, 'steal');
    assert.equal(g._henryAnim.area, 'board');
});

// ── Zlatá horečka: vynucené odhození vybavení ────────────────────────────────

test('Zlatá horečka: donutit Henryho odhodit vybavení = výstřel, zaplaceno hned', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Outlaw', character: HENRY }]);
    g.options = { expansions: { udoli_stinu: true, zlata_horecka: true } };
    g.gearCardData = gearData;
    g._setupGearDeck(g.options);
    const kind = gearData.find(k => k.effect === 'ZH_PODKOVA');
    const podkova = { id: 69001, effect: kind.effect, name: kind.name, border: kind.border, cost: kind.cost };
    g.players[1].gear = [podkova];
    g.players[0].nuggets = 4;
    assert.ok(g.gearForceDiscard(0, 1, 0));
    assert.equal(g.players[0].nuggets, 4 - (kind.cost + 1), 'zaplaceno');
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[1].gear.length, 1, 'vybavení zatím leží');
    g.handleResponse(0, null);
    assert.equal(g.players[1].gear.length, 0);
    assert.equal(g.phase, 'PLAY');
});

// ── Odražená střela (Fistful): výstřel frontou ───────────────────────────────

test('Odražená střela zničí Henryho kartu → Henry pak střílí na střelce', () => {
    const g = mkV([{}, { character: HENRY }, {}]);
    g.activeFistful = ffData.find(c => c.key === 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    g.playRicochet(0, 1, 'board', scope.id, 0);
    assert.equal(g.pendingResponse.targetIdx, 1);
    g.handleResponse(1, null);
    assert.ok(inDiscard(g, scope.id), 'karta zničená');
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.originatorIdx, 1, 'teď střílí Henry');
    assert.equal(g.pendingResponse.targetIdx, 0);
    assert.equal(g.pendingResponse.vos.shot, 'HENRY');
});

// ── Kde se Henry NEspouští ───────────────────────────────────────────────────

test('El Gringo bere Henrymu kartu za zásah – automatická schopnost, žádný výstřel', () => {
    const g = mkV([{ character: HENRY }, { character: 'El Gringo' }]);
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    const bi = give(g, 0, CardType.BANG, { name: 'Bang!' });
    g.playBang(0, 1, bi);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'EL_GRINGO_STEAL');
    g.elGringoSteal(1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand.length, 1);
    assert.ok(!g._vosSuspended);
});

test('vlastní kartu si Henry bere / odhazuje bez výstřelu', () => {
    const g = mkV([{ character: HENRY }, {}]);
    board(g, 0, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    const ci = give(g, 0, CardType.CAT_BALOU, { name: 'Cat Balou' });
    g.playSpecialCard(0, 0, ci);
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].board.length, 0);
});

test('Duch jako zloděj: na Ducha se nestřílí, krádež proběhne hned', () => {
    const g = mkV([{ health: 0 }, { character: HENRY }]);
    g.players[0].board.push(vcard('Duch'));
    const cardId = panicOnHenry(g);
    assert.equal(g.phase, 'PLAY');
    assert.ok(has(g.players[0], cardId));
});

test('bez zapnutého rozšíření Henry nestřílí', () => {
    const g = mkGame([{}, { character: HENRY }]);   // Údolí stínů vypnuté
    const cardId = panicOnHenry(g);
    assert.equal(g.phase, 'PLAY');
    assert.ok(has(g.players[0], cardId));
});

test('Brokovnice: odhazuje sám Henry – žádný výstřel', () => {
    const g = mkV([{}, { character: HENRY }]);
    g.players[0].weapon = vcard('Brokovnice');
    const hc = give(g, 1, CardType.BEER, { name: 'Pivo' });
    const bi = give(g, 0, CardType.BANG, { name: 'Bang!' });
    g.playBang(0, 1, bi);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'SHOTGUN_DISCARD');
    g.vosPick(1, [idOf(g, 1, hc)]);
    assert.equal(g.phase, 'PLAY');
    assert.ok(!g._vosSuspended);
});

// ── Konec tahu a bot ─────────────────────────────────────────────────────────

test('nextTurn pozastavenou akci zahodí (nesmí přežít do cizího tahu)', () => {
    const g = mkV([{}, { character: HENRY }]);
    panicOnHenry(g);
    assert.ok(g._vosSuspended);
    g.nextTurn();
    assert.equal(g._vosSuspended, null);
});

test('bot zloděj se Henryho výstřelu brání obvyklou cestou (RESPOND)', () => {
    const g = mkV([{}, { character: HENRY }]);
    miss(g, 0);
    panicOnHenry(g);
    const act = decideBotAction(g, 0, null);
    assert.equal(act.event, 'respond_to_card');
});

// ── Server: animace krádeže až po výstřelu ───────────────────────────────────
// Handler výběru karty (select_target_card) nesmí při pozastavení poslat let ukradené
// karty – krádež se ještě nestala. Pošle ho až hák před broadcastem (flushHenryMove),
// ve kterém se ze zapsaného pohybu stane obyčejný `ragtime_steal`: z ruky líc vidí
// jen zloděj, ostatní rub.
test('server: Panika z ruky na Henryho – nejdřív jen odhoz Paniky, krádež až po výstřelu', () => {
    const installAnimService = require('../server/anim.js');
    const registerGame = require('../server/handlers.game.js');
    const emits = [];
    const sockets = new Map();
    for (const id of ['s0', 's1']) {
        sockets.set(id, { id, emit(ev, p) { emits.push({ to: id, ev, p }); } });
    }
    const io = { sockets: { sockets }, to() { return { emit() {} }; } };
    const g = mkV([{}, { character: HENRY }]);
    const room = { id: 'g1', options: {}, gameState: g,
                   players: [{ socketId: 's0', playerIdx: 0 }, { socketId: 's1', playerIdx: 1 }] };
    const ctx = { io };
    ctx.broadcastRoom = () => ctx.beforeBroadcast(room);
    ctx.broadcastRoomDelayed = () => ctx.beforeBroadcast(room);
    installAnimService(ctx);
    const handlers = {};
    registerGame({ on(ev, fn) { handlers[ev] = fn; } }, ctx, (fn) => fn(room, room.players[0], g));

    const hc = give(g, 1, CardType.BEER, { name: 'Pivo' });
    const cardId = idOf(g, 1, hc);
    const pi = give(g, 0, CardType.PANIC, { name: 'Panika!' });
    const panicId = idOf(g, 0, pi);
    handlers.play_special({ attackerIdx: 0, targetIdx: 1, cardIdx: pi });
    emits.length = 0;
    handlers.select_target_card({ attackerIdx: 0, area: 'hand', cardIdx: null });
    const anims = () => emits.filter(e => e.ev === 'card_animation').map(e => e.p);
    assert.equal(g.phase, 'RESPOND');
    assert.ok(anims().some(a => a.type === 'hand_to_discard' && a.cardId === panicId), 'Panika letí do odhozu');
    assert.ok(!anims().some(a => a.type === 'panic_sequence' || a.type === 'ragtime_steal'), 'krádež zatím neletí');
    assert.ok(inDiscard(g, panicId));

    emits.length = 0;
    handlers.respond_to_card({ playerIdx: 0, cardIndex: null });
    assert.ok(has(g.players[0], cardId));
    const steal = emits.filter(e => e.ev === 'card_animation' && e.p.type === 'ragtime_steal');
    assert.equal(steal.find(e => e.to === 's0').p.stolenCardId, cardId, 'zloděj vidí líc');
    assert.equal(steal.find(e => e.to === 's1').p.stolenCardId, null, 'ostatní rub');
    assert.equal(steal[0].p.attackerIdx, 0);
    assert.equal(steal[0].p.targetIdx, 1);
    assert.equal(steal[0].p.stolenIndex, 0);
    assert.equal(g._henryAnim, null, 'animace odeslaná');
});
