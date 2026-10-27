// Rozšíření Údolí stínů – fáze F8: Obětavý skok (okno záchrany a odměna).
//
//   OBĚTAVÝ SKOK – „Lze zahrát pouze mimo tvůj tah. Odhozením této karty zabráníš jinému
//                  hráči ztratit 1 život. Přežije-li, vezmi si 2 karty z jeho ruky, nebo
//                  z balíčku." (Dynamite Box: kombinovat nejde, z ruky náhodně, s jednou
//                  kartou v ruce ta jedna.)
//
// Okno SAVE_OFFER se otevírá na TŘECH místech, kde ztráta života vychází z rozhodnutí
// oběti (R9): konec obrany v RESPOND, klikaný zásah, Pravé poledne – a jen tehdy, když
// zachránce existuje (R4). Kdo to je, vidí jen on sám (redakce). Odměna přijde až po
// doběhnutí celého efektu (dV 1588981) a jen když zachráněný přežil.
//
// Podklad: docs/udoli-stinu-plan.md §2.10, R4, R9, R13; docs/udoli-stinu.md §2, §4.2, §5.2.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits, GameState } = require('./_helpers.js');
const { Card, distinctCardKinds } = require('../logic/entities.js');
const { cardPlayability, nativePlayInTurn } = require('../core/playability.js');
const { pendingActor, waitingStatus } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { decideCardClick } = require('../core/selection.js');
const V = require('../core/valley.js');
const installRoomService = require('../server/rooms.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);
const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));

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
function boardV(g, idx, name, o) {
    const c = vcard(name, o);
    g.players[idx].board.push(c);
    return c;
}

const VOS_ON = { expansions: { udoli_stinu: true } };
function mkV(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.options = VOS_ON;
    g.turnId = 1;
    return g;
}
const SAVED = 'Obětavý skok';
const inDiscard = (g, id) => g.deck._discardPile.some(c => c && c.id === id);
const ids = (p) => p.hand.map(c => c.id);

// Hráč 0 (na tahu) střílí BANG! na hráče 1; ten se nebrání. Vrací se ve fázi SAVE_OFFER,
// pokud někdo drží Obětavý skok, jinak už po zásahu.
function bangTaken(g, from = 0, to = 1) {
    const bi = give(g, from, CardType.BANG);
    g.playBang(from, to, bi);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(to, null);
}

// ── Data a hratelnost ────────────────────────────────────────────────────────

test('F8: Obětavý skok jde do balíčku a ve vlastním tahu se nehraje', () => {
    assert.ok(V.VOS_CARDS_READY.includes(SAVED));
    const g = mkV([{}, {}]);
    const i = giveV(g, 0, SAVED);
    const card = g.players[0].hand[i];
    assert.equal(nativePlayInTurn(g, g.players[0], 0, card), false);
    assert.equal(cardPlayability(g, g.players[0], 0, card), false);
});

// ── Okno záchrany v RESPOND ──────────────────────────────────────────────────

test('oběť bere zásah a třetí hráč drží Obětavý skok → SAVE_OFFER, život zatím celý', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    bangTaken(g);
    assert.equal(g.phase, 'SAVE_OFFER');
    assert.deepEqual(pendingActor(g), { idx: 2, kind: 'SAVE_OFFER' });
    assert.equal(g.pendingSave.victimIdx, 1);
    assert.equal(g.pendingSave.resume, 'RESPOND');
    assert.equal(g.players[1].health, 4, 'o život se teprve rozhoduje');
    assert.match(waitingStatus(g).text, /zachrání hráče P1/);
    assert.equal(g.pendingResponse.active, true, 'obrana pořád visí');
});

test('záchrana: život zůstává, karta v odhozu – a po doběhnutí efektu odměna', () => {
    const g = mkV([{}, {}, {}]);
    const si = giveV(g, 2, SAVED);
    const sid = g.players[2].hand[si].id;
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.MISSED, { name: 'Vedle!' });
    bangTaken(g);
    const res = g.vosSave(2, true);
    assert.equal(res.card.id, sid);
    assert.equal(res.victimIdx, 1);
    assert.equal(g.players[1].health, 4);
    assert.ok(inDiscard(g, sid));
    assert.equal(g.pendingSave, null);
    assert.equal(g.pendingResponse.active, false, 'obrana skončila');
    // BANG! doběhl celý → je klid, takže přichází odměna.
    assert.equal(g.phase, 'SAVE_REWARD');
    assert.deepEqual(g.pendingSaveReward, { saverIdx: 2, victimIdx: 1 });
    assert.deepEqual(pendingActor(g), { idx: 2, kind: 'SAVE_REWARD' });
    assert.equal(V.saveRewardHandCount(g), 2);
});

test('nezachránit: zásah proběhne normálně a odměna žádná', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    bangTaken(g);
    assert.deepEqual(g.vosSave(2, false), { declined: true });
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[2].hand.length, 1, 'karta zůstala v ruce');
    assert.ok(!(g._vosSaveRewards || []).length);
});

test('neplatné rozhodnutí (cizí hráč, jiná fáze) hru neposune', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    bangTaken(g);
    assert.equal(g.vosSave(1, true), null, 'oběť za zachránce nerozhoduje');
    assert.equal(g.vosSave(0, false), null);
    assert.equal(g.phase, 'SAVE_OFFER');
    assert.equal(g.vosSaveReward(2, 'deck'), null, 'odměna se volí až po záchraně');
});

test('kdo je na tahu, zachraňovat nesmí – a oběť sama sebe taky ne', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 0, SAVED);      // útočník na tahu
    giveV(g, 1, SAVED);      // oběť
    assert.deepEqual(V.saveCandidates(g, 1), []);
    bangTaken(g);
    assert.equal(g.phase, 'PLAY', 'okno se neotevřelo');
    assert.equal(g.players[1].health, 3);
});

test('R4: bez držitele karty se hra nemění (žádná pauza)', () => {
    const g = mkV([{}, {}, {}]);
    bangTaken(g);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 3);
    assert.equal(g.pendingSave, null);
});

test('bez rozšíření se nic nenabízí, ani když karta v ruce je', () => {
    const g = mkV([{}, {}, {}]);
    g.options = {};
    giveV(g, 2, SAVED);
    bangTaken(g);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 3);
});

test('zachraňovat smí i Duch (je ve hře), vyřazený bez Ducha ne', () => {
    const g = mkV([{}, {}, { health: 0 }, { health: 0 }]);
    boardV(g, 2, 'Duch');
    giveV(g, 2, SAVED);
    giveV(g, 3, SAVED);
    assert.deepEqual(V.saveCandidates(g, 1), [2]);
});

test('na Ducha (nula životů) se okno neotevírá – nemá co ztratit', () => {
    const g = mkV([{}, { health: 0 }, {}]);
    boardV(g, 1, 'Duch');
    giveV(g, 2, SAVED);
    assert.deepEqual(V.saveCandidates(g, 1), []);
});

test('víc zachránců (namnožená data): nabídka jde po směru od oběti jednomu po druhém', () => {
    const g = mkV([{}, {}, {}, {}]);
    giveV(g, 2, SAVED);
    giveV(g, 3, SAVED);
    bangTaken(g);
    assert.equal(g.pendingSave.saverIdx, 2);
    g.vosSave(2, false);
    assert.equal(g.phase, 'SAVE_OFFER');
    assert.equal(g.pendingSave.saverIdx, 3);
    assert.deepEqual(g.pendingSave.declined, [2]);
    g.vosSave(3, false);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 3);
});

// ── Odměna ───────────────────────────────────────────────────────────────────

test('odměna z ruky: 2 náhodné karty zachráněného (animace s místy ve vějíři)', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.MISSED, { name: 'Vedle!' });
    give(g, 1, CardType.PANIC);
    const before = ids(g.players[1]);
    bangTaken(g);
    g.vosSave(2, true);
    const res = g.vosSaveReward(2, 'hand');
    assert.equal(res.from, 'hand');
    assert.equal(res.taken.length, 2);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.players[2].hand.length, 2);
    res.taken.forEach(c => assert.ok(before.includes(c.id)));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingSaveReward, null);
    const a = g._vosSaveAnim;
    assert.equal(a.saverIdx, 2);
    assert.equal(a.victimIdx, 1);
    assert.equal(a.taken.length, 2);
    a.taken.forEach(t => assert.ok(Number.isInteger(t.slot)));
});

test('odměna z balíčku: 2 karty klikáním (fáze lízání zachránce)', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    bangTaken(g);
    g.vosSave(2, true);
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);
    assert.deepEqual(g.vosSaveReward(2, 'deck'), { from: 'deck' });
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 2);
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.deepEqual(g.drawPhaseState.queuedDraw, [SAVED]);
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.players[2].hand.length, 2);
    assert.equal(g.players[1].hand.length, 1, 'zachráněnému se nic nevzalo');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0);
});

test('zachráněný s jedinou kartou: z ruky jde jen ta jedna', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    bangTaken(g);
    g.vosSave(2, true);
    assert.equal(V.saveRewardHandCount(g), 1);
    const res = g.vosSaveReward(2, 'hand');
    assert.equal(res.taken.length, 1);
    assert.equal(g.players[1].hand.length, 0);
});

test('zachráněný bez karet: volit není z čeho – líže se rovnou z balíčku', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);
    bangTaken(g);
    g.vosSave(2, true);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 2);
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.equal(g.vosSaveReward(2, 'hand'), null);
});

test('z ruky bez karet vybrat nejde, neznámý zdroj taky ne', () => {
    const g = mkV([{}, {}, {}]);
    g.phase = 'SAVE_REWARD';
    g.pendingSaveReward = { saverIdx: 2, victimIdx: 1 };
    assert.equal(g.vosSaveReward(2, 'hand'), null);
    assert.equal(g.vosSaveReward(2, 'both'), null);
    assert.equal(g.phase, 'SAVE_REWARD');
});

// ── Hromadné útoky, Duel, zásahy kartou BANG! ────────────────────────────────

test('Kulomet: záchrana jednoho cíle, útok jde dál – odměna až po celém Kulometu', () => {
    const g = mkV([{}, {}, {}, {}]);
    giveV(g, 3, SAVED);
    give(g, 1, CardType.BEER);
    const gat = give(g, 0, CardType.GATLING);
    g.playSpecialCard(0, null, gat);
    assert.equal(g.pendingResponse.targetIdx, 1);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'SAVE_OFFER');
    g.vosSave(3, true);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'RESPOND', 'Kulomet pokračuje dalším cílem');
    assert.equal(g.pendingResponse.targetIdx, 2);
    assert.equal(g._vosSaveRewards.length, 1, 'odměna čeká, efekt ještě běží');
    g.handleResponse(2, null);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.pendingResponse.targetIdx, 3);
    g.handleResponse(3, null);
    assert.equal(g.players[3].health, 3);
    assert.equal(g.phase, 'SAVE_REWARD');
    assert.deepEqual(g.pendingSaveReward, { saverIdx: 3, victimIdx: 1 });
});

test('Duel: prohraný duel jde zachránit – končí bez ztráty života', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    const di = give(g, 0, CardType.DUEL);
    g.playSpecialCard(0, 1, di);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);
    assert.equal(g.phase, 'SAVE_OFFER');
    g.vosSave(2, true);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.pendingResponse.active, false);
    assert.ok(['PLAY', 'DRAW'].includes(g.phase));
});

test('Odměna (karta) se po záchraně nespouští – zásahem to nebylo', () => {
    const g = mkV([{}, {}, {}]);
    boardV(g, 1, 'Odměna');
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    bangTaken(g);
    g.vosSave(2, true);
    assert.ok(!g.specialActionQueue.some(a => a.type === 'KILL_REWARD' && a.label === 'Odměna'));
    assert.equal(g.drawPhaseState?.queuedDraw?.[0] === 'Odměna', false);
    assert.equal(g.phase, 'SAVE_REWARD');
});

test('Odražená střela (Fistful) život neohrožuje – okno se neotevírá', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    g.phase = 'RESPOND';
    g.pendingResponse = { active: true, targetIdx: 1, originatorIdx: 0, sourceCard: CardType.BANG,
                          requiredCard: CardType.MISSED, responded: [], ricochet: { targetIdx: 1, cardId: -5 } };
    g._ricochetDestroy = () => false;
    g.handleResponse(1, null);
    assert.notEqual(g.phase, 'SAVE_OFFER');
});

// ── Klikané zásahy: Dvojitá rána a dynamit ───────────────────────────────────

test('Dvojitá rána: zachraňuje se každý život zvlášť – záchrana ubere jeden', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    const bi = give(g, 0, CardType.BANG);
    const ai = giveV(g, 0, 'Dvojitá rána');
    g.playBang(0, 1, bi, g.players[0].hand[ai].id);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE', 'v obraně se neptá – zásahy se klikají');
    g.takeDynamiteHit(1);
    assert.equal(g.phase, 'SAVE_OFFER');
    assert.equal(g.pendingSave.resume, 'CLICK');
    g.vosSave(2, true);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 1);
    assert.equal(g.players[1].health, 4);
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'SAVE_REWARD', 'po obou zásazích je klid – odměna');
});

test('„Přežije-li": zachráněný, kterého pak vyřadí druhý zásah, odměnu nedá', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Renegade', health: 1 }, { role: 'Outlaw' }]);
    giveV(g, 2, SAVED);
    const bi = give(g, 0, CardType.BANG);
    const ai = giveV(g, 0, 'Dvojitá rána');
    g.playBang(0, 1, bi, g.players[0].hand[ai].id);
    g.handleResponse(1, null);
    g.takeDynamiteHit(1);
    g.vosSave(2, true);
    assert.equal(g.players[1].health, 1);
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 0);
    assert.ok(!g.winner);
    assert.notEqual(g.phase, 'SAVE_REWARD');
    assert.equal(g._vosSaveRewards.length, 0, 'odměna propadla');
    assert.equal(g.players[2].hand.length, 0);
});

test('dynamit: záchrana jednoho ze tří zásahů, odměna až po startu tahu (klid)', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 1, SAVED);
    give(g, 0, CardType.BEER);
    for (let i = 0; i < 6; i++) topDeck(g, Suits.CLUBS);
    g.pendingDynamiteDamage = { playerIdx: 0, hitsLeft: 3 };
    g.phase = 'DYNAMITE_DAMAGE';
    g.takeDynamiteHit(0);
    assert.equal(g.phase, 'SAVE_OFFER');
    assert.equal(g.pendingSave.saverIdx, 1, 'zachraňuje hráč mimo tah – oběť je na tahu');
    g.vosSave(1, true);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 2);
    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 2);
    assert.equal(g._vosSaveRewards.length, 1, 'start tahu ještě běží');
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'SAVE_REWARD');
    assert.deepEqual(g.pendingSaveReward, { saverIdx: 1, victimIdx: 0 });
});

// ── Pravé poledne ────────────────────────────────────────────────────────────

test('Pravé poledne: ztrátu života na začátku tahu jde zachránit', () => {
    const g = mkV([{ role: 'Sheriff' }, { health: 3 }, {}]);
    g.highNoonCardData = hnData;
    g._setupEventDeck({ expansions: { high_noon: true } });
    g.options = VOS_ON;
    g.activeEvent = hnData.find(c => c.key === 'PRAVE_POLEDNE');
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    giveV(g, 2, SAVED);
    g.currentPlayerIndex = 1;
    assert.equal(g._beginTurn(), true);
    assert.equal(g.phase, 'NOON_DAMAGE');
    g.takeNoonHit(1);
    assert.equal(g.phase, 'SAVE_OFFER');
    assert.equal(g.pendingSave.resume, 'NOON');
    g.vosSave(2, true);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'DRAW', 'start tahu pokračuje lízáním');
    assert.equal(g._vosSaveRewards.length, 1);
});

// ── Henry Block, Molly Stark, Roubík ─────────────────────────────────────────

test('Henry Block zachráněný: odměna z jeho ruky = Henry střílí na zachránce', () => {
    const g = mkV([{}, { character: 'Henry Block' }, {}]);
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.PANIC);
    bangTaken(g);
    g.vosSave(2, true);
    assert.equal(g.phase, 'SAVE_REWARD');
    const res = g.vosSaveReward(2, 'hand');
    assert.deepEqual(res, { from: 'hand', suspended: true });
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.originatorIdx, 1, 'střílí Henry');
    assert.equal(g.pendingResponse.targetIdx, 2);
    assert.equal(g.players[1].hand.length, 2, 'karty zatím zůstávají Henrymu');
    g.handleResponse(2, null);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.players[1].hand.length, 0, 'zachránce výstřel přežil – bere si');
    assert.equal(g.players[2].hand.length, 2);
    assert.equal(g._vosSuspended, null);
});

test('Molly Stark si za Obětavý skok mimo tah lízne (R13)', () => {
    const g = mkV([{}, {}, { character: 'Molly Stark' }]);
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    for (let i = 0; i < 6; i++) topDeck(g, Suits.CLUBS);
    bangTaken(g);
    g.vosSave(2, true);
    assert.equal(g.phase, 'DRAW', 'nejdřív líznutí Molly');
    assert.equal(g.drawPhaseState.playerIdx, 2);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.phase, 'SAVE_REWARD', 'pak odměna');
});

test('Roubík okno záchrany ani volbu odměny nepřeruší', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    give(g, 1, CardType.BEER);
    bangTaken(g);
    assert.equal(g._gagCalm(0), false);
    g.vosSave(2, true);
    assert.equal(g.phase, 'SAVE_REWARD');
    assert.equal(g._gagCalm(0), false);
});

test('fronta odložených akcí během okna stojí', () => {
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    bangTaken(g);
    g.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: 0, cardsNeeded: 1 });
    assert.equal(g._processSpecialQueue(), true);
    assert.equal(g.phase, 'SAVE_OFFER');
    assert.equal(g.specialActionQueue.length, 1);
});

// ── Klient: hratelnost a klik ────────────────────────────────────────────────

test('klient: Obětavý skok svítí jen zachránci, klik = VOS_SAVE', () => {
    const g = mkV([{}, {}, {}]);
    const si = giveV(g, 2, SAVED);
    give(g, 2, CardType.BANG);
    bangTaken(g);
    const me = g.players[2];
    assert.equal(cardPlayability(g, me, 2, me.hand[si]), true);
    assert.equal(cardPlayability(g, me, 2, me.hand[1]), false);
    const click = (card, index) => decideCardClick({
        state: g, me, myIndex: 2, selectedState: { cardIndex: null, action: null }, card, index,
        blockInput: false, isMySidActive: false, playable: cardPlayability(g, me, 2, card) });
    assert.deepEqual(click(me.hand[si], si), { type: 'VOS_SAVE', index: si, cardId: me.hand[si].id });
    assert.deepEqual(click(me.hand[1], 1), { type: 'UNPLAYABLE_FLASH' });
    // Ostatním (redakce: saverIdx = null) nesvítí nic.
    const red = { ...g, pendingSave: { ...g.pendingSave, saverIdx: null, declined: [] } };
    assert.equal(pendingActor(red), null);
    assert.equal(cardPlayability(red, me, 2, me.hand[si]), null);
});

// ── Redakce ──────────────────────────────────────────────────────────────────

test('redakce: kdo zachraňuje, vidí jen on sám (R4)', () => {
    const io = { sockets: { sockets: new Map() }, emit() {}, to() { return { emit() {} }; } };
    const ctx = { io, cardData: [], GameState };
    installRoomService(ctx);
    const room = ctx.makeRoom('Stůl', 3, 's1', 'A', {});
    const g = mkV([{}, {}, {}]);
    giveV(g, 2, SAVED);
    giveV(g, 0, SAVED);       // i útočník ji drží – na tahu ale nezachraňuje
    bangTaken(g);
    g.pendingSave.declined = [];
    g._vosSaveAnim = { saverIdx: 2, victimIdx: 1, taken: [{ id: 1, slot: 0 }] };
    room.gameState = g;
    const forSaver = ctx.roomPayload(room, 2).gameState;
    const forVictim = ctx.roomPayload(room, 1).gameState;
    const forSpect = ctx.roomPayload(room, null).gameState;
    assert.equal(forSaver.pendingSave.saverIdx, 2);
    assert.equal(forVictim.pendingSave.saverIdx, null);
    assert.equal(forSpect.pendingSave.saverIdx, null);
    assert.equal(forVictim.pendingSave.victimIdx, 1, 'oběť je veřejná');
    assert.equal(forVictim._vosSaveAnim, null);
    assert.equal(g.pendingSave.saverIdx, 2, 'stav serveru se nemění');
});

// ── Bot ──────────────────────────────────────────────────────────────────────

test('bot: pomocník zachrání šerifa, bandita ne', () => {
    const g = mkV([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Outlaw' }]);
    giveV(g, 2, SAVED);
    bangTaken(g);
    assert.deepEqual(decideBotAction(g, 2, null), { event: 'vos_save', payload: { use: true, playerIdx: 2 } });

    const h = mkV([{ role: 'Deputy' }, { role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    giveV(h, 2, SAVED);
    bangTaken(h);
    assert.equal(h.pendingSave.saverIdx, 2);
    assert.deepEqual(decideBotAction(h, 2, null), { event: 'vos_save', payload: { use: false, playerIdx: 2 } });
});

test('bot: od spojence bere odměnu z balíčku, nepříteli z ruky (Henrymu ne)', () => {
    const g = mkV([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Outlaw' }]);
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.BANG);
    g.phase = 'SAVE_REWARD';
    g.pendingSaveReward = { saverIdx: 2, victimIdx: 1 };
    assert.equal(decideBotAction(g, 2, null).payload.from, 'deck');
    g.pendingSaveReward = { saverIdx: 3, victimIdx: 1 };
    assert.equal(decideBotAction(g, 3, null).payload.from, 'hand');
    g.players[1].character = 'Henry Block';
    assert.equal(decideBotAction(g, 3, null).payload.from, 'deck');
});

// ── Lady Růže: sedadla v okně záchrany ───────────────────────────────────────

test('výměna míst přemapuje i okno záchrany a čekající odměny', () => {
    const g = mkV([{}, {}, {}, {}]);
    g.pendingSave = { victimIdx: 1, saverIdx: 2, declined: [3], resume: 'RESPOND', backPhase: 'RESPOND' };
    g._vosSaveRewards = [{ saverIdx: 3, victimIdx: 0 }];
    g._swapSeats(2, 3);
    assert.equal(g.pendingSave.saverIdx, 3);
    assert.deepEqual(g.pendingSave.declined, [2]);
    assert.deepEqual(g._vosSaveRewards[0], { saverIdx: 2, victimIdx: 0 });
});

// ── Strukturální test: kudy se ztrácí život ──────────────────────────────────
// Obětavý skok zachraňuje na TŘECH místech (R9): oběť bere zásah v RESPOND
// (handleResponse), klikaný zásah (takeDynamiteHit) a Pravé poledne (takeNoonHit). Každý
// další vstup ke ztrátě života by okno záchrany obešel – musí proto být vyjmenovaný
// tady, s důvodem, proč brána nepotřebuje (dobrovolná ztráta) nebo kde ji má.
test('strukturální: každá ztráta života jde přes bránu Obětavého skoku (nebo je vyjmenovaná)', () => {
    const ALLOWED = {
        // `handleDamage(` – trychtýř zranění; volají ho:
        'handleDamage:handleResponse': 'brána RESPOND',
        'handleDamage:takeNoonHit': 'brána NOON',
        'handleDamage:_vosAimClick': 'Dvojitá rána – klik přes takeDynamiteHit, brána CLICK',
        'handleDamage:resolveBloodBrothers': 'Pokrevní bratři – dobrovolně darovaný život',
        // přímé ubrání života:
        'health--:handleDamage': 'trychtýř sám',
        'health--:takeDynamiteHit': 'brána CLICK',
        'health--:useChuckWengam': 'Chuck Wengam – dobrovolná ztráta',
        // znovuzavolání po rozhodnutí zachránce:
        'takeDynamiteHit:_vosSaveContinue': 'pokračování okna záchrany',
        'takeNoonHit:_vosSaveContinue': 'pokračování okna záchrany',
    };
    const root = path.join(__dirname, '..');
    const files = ['logic.js', ...fs.readdirSync(path.join(root, 'logic')).map(f => 'logic/' + f)]
        .filter(f => f.endsWith('.js'));
    const found = [];
    for (const f of files) {
        const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
        let fn = null;
        lines.forEach((l, i) => {
            const m = l.match(/^ {4}(\w+)\s*\([^)]*\)\s*\{\s*$/);
            if (m) fn = m[1];
            const code = l.split(/\s\/\/\s/)[0];
            if (code.trim().startsWith('//')) return;
            const hits = [];
            if (/\.handleDamage\(/.test(code)) hits.push('handleDamage');
            if (/\.takeDynamiteHit\(/.test(code)) hits.push('takeDynamiteHit');
            if (/\.takeNoonHit\(/.test(code)) hits.push('takeNoonHit');
            if (/health\s*--|health\s*-=/.test(code)) hits.push('health--');
            hits.forEach(h => found.push({ key: `${h}:${fn}`, at: `${f}:${i + 1}` }));
        });
    }
    const bad = found.filter(x => !ALLOWED[x.key]).map(x => `${x.at} (${x.key})`);
    assert.deepEqual(bad, [], 'nový vstup ke ztrátě života: přidej bránu _vosSaveGate, nebo ho vyjmenuj s důvodem');
    const used = new Set(found.map(x => x.key));
    assert.deepEqual(Object.keys(ALLOWED).filter(k => !used.has(k)), [], 'záznam už nic nepokrývá – smaž ho');
});
