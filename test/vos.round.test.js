// Rozšíření Údolí stínů – fáze F4: kolečko voleb všech hráčů.
//
//   DIVOKÁ BANDA – „Všichni ostatní hráči odhodí kartu BANG!, nebo odhodí 2 libovolné
//                  karty z ruky." (s 1 kartou odhodí ji, bez karet nic; Q♦ → Apache Kid)
//   TORNÁDO      – „Každý hráč musí dát 2 karty z ruky hráči po levici. Karty předejte
//                  všichni najednou." (s 1 kartou dá jednu, bez karet nic)
//   POKER        – „Všichni ostatní hráči vyloží po 1 kartě z ruky (pokud můžou). Když
//                  nikdo nevyložil Eso, vezmi si až 2 karty z vyložených karet. Ostatní
//                  karty jsou odhozeny."
//
// Podklad: docs/udoli-stinu-plan.md §2.7, §4 a §8 (F4), docs/udoli-stinu.md §2 a §4.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, CardType, Suits } = require('./_helpers.js');
const { Card, distinctCardKinds } = require('../logic/entities.js');
const { cardPlayability } = require('../core/playability.js');
const { getActionForCard } = require('../core/cardRules.js');
const { pendingActor, waitingStatus } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { decideCardClick } = require('../core/selection.js');
const V = require('../core/valley.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);

let _vid = 78000;
function vcard(name, o = {}) {
    const k = kinds.find(c => c.name === name);
    assert.ok(k, name);
    const c = new Card(_vid++, k.name, k.type, o.suit ?? k.suit, o.value ?? k.value,
        { range: k.range, effect: k.effect, bangEffect: k.bangEffect });
    c.exp = 'udoli_stinu';
    return c;
}
function giveV(g, idx, name, o) {
    g.players[idx].hand.push(vcard(name, o));
    return g.players[idx].hand.length - 1;
}
const ids = (g, idx) => g.players[idx].hand.map(c => c.id);

const VOS_ON = { expansions: { udoli_stinu: true } };
function mkV(n = 4, opts = {}) {
    const specs = [{ role: 'Sheriff' }];
    for (let i = 1; i < n; i++) specs.push({ role: 'Outlaw' });
    const g = mkGame(specs, opts);
    g.options = VOS_ON;
    g.turnId = 1;
    return g;
}

// ── Data a hratelnost ───────────────────────────────────────────────────────

test('všechny tři karty jsou hotové a jdou do balíčku', () => {
    for (const n of ['Divoká banda', 'Tornádo', 'Poker']) assert.ok(V.VOS_CARDS_READY.includes(n), n);
});

test('karty se hrají bez cíle (PLAY_CARD) a ve svém tahu jsou hratelné', () => {
    const g = mkV();
    for (const n of ['Divoká banda', 'Tornádo', 'Poker']) {
        const c = vcard(n);
        assert.equal(getActionForCard(c, []), 'PLAY_CARD', n);
        assert.equal(cardPlayability(g, g.players[0], 0, c), true, n);
    }
});

// ── Divoká banda ────────────────────────────────────────────────────────────

test('Divoká banda: ostatní po řadě od levého souseda, hráč sám ne', () => {
    const g = mkV(4);
    const i = giveV(g, 0, 'Divoká banda');
    for (const k of [1, 2, 3]) { give(g, k, CardType.BEER); give(g, k, CardType.BEER); }
    g.playCard(i);
    assert.equal(g.phase, 'BANDIDOS_DISCARD');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'BANDIDOS_DISCARD' });
    assert.match(waitingStatus(g).text, /Divoká banda/);
    // karta sama je v odhozu, ne v ruce
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.deck.discardTop().name, 'Divoká banda');
});

test('Divoká banda: jedna karta BANG! stačí, jedna jiná karta ne (2 karty)', () => {
    const g = mkV(3);
    give(g, 1, CardType.BANG); give(g, 1, CardType.BEER); give(g, 1, CardType.MISSED);
    give(g, 2, CardType.BEER);
    g.playCard(giveV(g, 0, 'Divoká banda'));
    const [bang, beer, missed] = ids(g, 1);
    assert.equal(V.vosRoundPickOk(g, 1, [beer]), false);
    assert.equal(V.vosRoundPickOk(g, 1, [bang]), true);
    assert.equal(V.vosRoundPickOk(g, 1, [beer, missed]), true);
    assert.equal(V.vosRoundPickOk(g, 1, [beer, missed, bang]), false);
    assert.equal(V.vosRoundPickOk(g, 1, [beer, beer]), false);
    assert.equal(V.vosRoundPickOk(g, 2, [g.players[2].hand[0].id]), false, 'není na řadě');
    const res = g.vosPick(1, [bang]);
    assert.equal(res.discarded.length, 1);
    assert.equal(g.players[1].hand.length, 2);
    assert.equal(pendingActor(g).idx, 2);
});

test('Divoká banda: s jedinou kartou ji odhodí, bez karet se přeskakuje', () => {
    const g = mkV(4);
    give(g, 2, CardType.BEER);            // hráč 1 nemá nic, hráč 3 taky ne
    g.playCard(giveV(g, 0, 'Divoká banda'));
    assert.equal(pendingActor(g).idx, 2);
    const only = g.players[2].hand[0].id;
    assert.equal(V.vosRoundPickOk(g, 2, [only]), true);
    g.vosPick(2, [only]);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingVosRound, null);
});

test('Divoká banda: Calamity Janet smí jako kartu BANG! odhodit Vedle!', () => {
    const g = mkV(3);
    g.players[1].character = 'Calamity Janet';
    give(g, 1, CardType.MISSED); give(g, 1, CardType.BEER);
    g.playCard(giveV(g, 0, 'Divoká banda'));
    assert.equal(V.vosRoundPickOk(g, 1, [g.players[1].hand[0].id]), true);
});

test('Divoká banda (Q♦) Apache Kida vynechá', () => {
    const g = mkV(3);
    g.players[1].character = 'Apache Kid';
    give(g, 1, CardType.BEER); give(g, 1, CardType.BEER);
    give(g, 2, CardType.BEER);
    g.playCard(giveV(g, 0, 'Divoká banda'));
    assert.equal(pendingActor(g).idx, 2);
});

test('Divoká banda: Suzy Lafayette si lízne až po celém kolečku', () => {
    const g = mkV(3);
    g.players[1].character = 'Suzy Lafayette';
    give(g, 1, CardType.BEER);
    give(g, 2, CardType.BEER); give(g, 2, CardType.BEER);
    g.playCard(giveV(g, 0, 'Divoká banda'));
    g.vosPick(1, ids(g, 1));
    assert.equal(g.phase, 'BANDIDOS_DISCARD', 'Suzy nesmí kolečko přerušit');
    assert.equal(pendingActor(g).idx, 2);
    g.vosPick(2, ids(g, 2));
    assert.equal(g.phase, 'SUZY_DRAW');
});

// ── Tornádo ─────────────────────────────────────────────────────────────────

test('Tornádo: každý dá 2 karty sousedovi po levici, až když volil poslední', () => {
    const g = mkV(3);
    const a = [give(g, 0, CardType.BEER), give(g, 0, CardType.BANG)].map(i => g.players[0].hand[i].id);
    const b = [give(g, 1, CardType.MISSED), give(g, 1, CardType.BANG), give(g, 1, CardType.BEER)].map(i => g.players[1].hand[i].id);
    const c = [give(g, 2, CardType.PANIC)].map(i => g.players[2].hand[i].id);
    g.playCard(giveV(g, 0, 'Tornádo'));
    assert.equal(g.phase, 'TORNADO_PICK');
    // pořadí: 1, 2, 0 (hráč sám až nakonec)
    assert.equal(pendingActor(g).idx, 1);
    assert.equal(V.vosRoundPickOk(g, 1, [b[0]]), false, 'má 3 karty → musí dát 2');
    g.vosPick(1, [b[0], b[1]]);
    assert.deepEqual(ids(g, 1), b, 'karty se zatím nehýbou');
    assert.equal(pendingActor(g).idx, 2);
    assert.equal(V.vosRoundPickOk(g, 2, c), true, 's jednou kartou dá jednu');
    g.vosPick(2, c);
    assert.equal(pendingActor(g).idx, 0);
    g.vosPick(0, a);
    assert.equal(g.phase, 'PLAY');
    assert.deepEqual(ids(g, 0).sort(), c.slice().sort());           // od hráče 2 (po pravici)
    assert.deepEqual(ids(g, 1).sort(), [b[2], ...a].sort());
    assert.deepEqual(ids(g, 2).sort(), [b[0], b[1]].sort());
    assert.equal(g._vosAnim.at(-1).type, 'tornado_pass');
});

test('Tornádo: karta sama se nepředává (z ruky jde ven hned)', () => {
    const g = mkV(3);
    const i = giveV(g, 0, 'Tornádo');
    give(g, 1, CardType.BEER);
    g.playCard(i);
    assert.ok(!g.players[0].hand.some(c => c.name === 'Tornádo'));
    assert.equal(pendingActor(g).idx, 1, 'hráč 0 bez karet se přeskočí');
});

test('Tornádo: vyřazeného souseda přeskočí, předává se dalšímu ve hře', () => {
    const g = mkV(4);
    g.players[1].health = 0;
    give(g, 0, CardType.BEER);
    g.playCard(giveV(g, 0, 'Tornádo'));
    assert.equal(pendingActor(g).idx, 0);
    const id = g.players[0].hand[0].id;
    g.vosPick(0, [id]);
    assert.ok(g.players[2].hand.some(c => c.id === id));
});

test('Tornádo: volby ostatních jsou ve stavu, ale klikací jsou jen moje karty', () => {
    const g = mkV(3);
    give(g, 1, CardType.BEER); give(g, 2, CardType.BEER);
    g.playCard(giveV(g, 0, 'Tornádo'));
    const me = g.players[1], other = g.players[2];
    assert.equal(cardPlayability(g, me, 1, me.hand[0]), true);
    assert.equal(cardPlayability(g, other, 2, other.hand[0]), null);
    const intent = decideCardClick({ state: g, me, myIndex: 1, selectedState: {}, card: me.hand[0], index: 0,
                                     blockInput: false, isMySidActive: false, playable: true });
    assert.equal(intent.type, 'VOS_ROUND_TOGGLE');
});

test('Tornádo: Suzy, která dala poslední kartu a dostala dvě, si nelízne', () => {
    const g = mkV(3);
    g.players[1].character = 'Suzy Lafayette';
    give(g, 0, CardType.BEER); give(g, 0, CardType.BEER);
    give(g, 1, CardType.BEER);
    g.playCard(giveV(g, 0, 'Tornádo'));
    g.vosPick(1, ids(g, 1));
    g.vosPick(0, ids(g, 0));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand.length, 2);
});

// ── Poker ───────────────────────────────────────────────────────────────────

test('Poker bez Esa: hráč si vezme až 2 z vyložených, zbytek do odhozu', () => {
    const g = mkV(4);
    for (const k of [1, 2, 3]) give(g, k, CardType.BEER, { value: String(4 + k) });
    g.playCard(giveV(g, 0, 'Poker'));
    assert.equal(g.phase, 'POKER_PICK');
    const picked = [];
    for (const k of [1, 2, 3]) {
        assert.equal(pendingActor(g).idx, k);
        const id = g.players[k].hand[0].id;
        picked.push(id);
        g.vosPick(k, [id]);
    }
    assert.equal(g.phase, 'POKER_TAKE');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'POKER_TAKE' });
    assert.equal(g.pendingVosRound.pool.length, 3);
    assert.equal(V.pokerTakeOk(g, 0, picked), false, 'nejvýš 2');
    assert.equal(V.pokerTakeOk(g, 0, []), true, 'i žádnou');
    const res = g.vosPokerTake(0, [picked[0], picked[2]]);
    assert.deepEqual(res.taken, [picked[0], picked[2]]);
    assert.deepEqual(res.discarded, [picked[1]]);
    assert.deepEqual(ids(g, 0).sort(), [picked[0], picked[2]].sort());
    assert.equal(g.deck.discardTop().id, picked[1]);
    assert.equal(g.phase, 'PLAY');
});

test('Poker s Esem: všechno jde rovnou do odhozu', () => {
    const g = mkV(3);
    give(g, 1, CardType.BEER, { value: 'A' });
    give(g, 2, CardType.BEER, { value: '7' });
    g.playCard(giveV(g, 0, 'Poker'));
    g.vosPick(1, ids(g, 1));
    g.vosPick(2, ids(g, 2));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingVosRound, null);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g._vosAnim.at(-1).ace, true);
});

test('Poker: Eso se pozná podle VYTIŠTĚNÉ hodnoty', () => {
    assert.equal(V.pokerHasAce([{ value: 'A' }]), true);
    assert.equal(V.pokerHasAce([{ value: 'K' }, { value: '10' }]), false);
});

test('Poker: když nikdo nemá kartu, kolečko hned skončí', () => {
    const g = mkV(3);
    g.playCard(giveV(g, 0, 'Poker'));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingVosRound, null);
});

// ── Kombinace ───────────────────────────────────────────────────────────────

test('během kolečka se fronta odložených akcí nespouští', () => {
    const g = mkV(3);
    give(g, 1, CardType.BEER);
    g.playCard(giveV(g, 0, 'Poker'));
    g.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: 0, cardsNeeded: 1 });
    assert.equal(g._processSpecialQueue(), true);
    assert.equal(g.phase, 'POKER_PICK');
});

test('Roubík kolečko nepřeruší', () => {
    const g = mkV(3);
    give(g, 1, CardType.BEER);
    g.playCard(giveV(g, 0, 'Tornádo'));
    assert.equal(g._gagCalm(2), false);
});

test('Lee Van Kliff zopakuje Tornádo (efekt bez cíle)', () => {
    const g = mkV(3);
    g.players[0].character = 'Lee Van Kliff';
    give(g, 1, CardType.BEER);
    g.playCard(giveV(g, 0, 'Tornádo'));
    g.vosPick(1, ids(g, 1));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g._lastBrown.effect, 'TORNADO');
    const pay = g.players[0].hand.find(c => c.type === CardType.BANG) ||
                g.players[0].hand[give(g, 0, CardType.BANG)];
    give(g, 2, CardType.MISSED);
    const r = g.useLeeVanKliff(0, pay.id, null);
    assert.ok(r);
    assert.equal(g.phase, 'TORNADO_PICK');
});

test('bot: v kolečku vždy pošle platnou volbu', () => {
    const g = mkV(3);
    give(g, 1, CardType.BANG); give(g, 1, CardType.BEER); give(g, 1, CardType.MISSED);
    give(g, 2, CardType.BEER); give(g, 2, CardType.PANIC);
    g.playCard(giveV(g, 0, 'Divoká banda'));
    let a = decideBotAction(g, 1, null);
    assert.equal(a.event, 'vos_pick');
    assert.ok(V.vosRoundPickOk(g, 1, a.payload.cardIds));
    assert.equal(a.payload.cardIds.length, 1, 'radši jedna karta BANG! než dvě karty');
    g.vosPick(1, a.payload.cardIds);
    a = decideBotAction(g, 2, null);
    assert.ok(V.vosRoundPickOk(g, 2, a.payload.cardIds));
});

test('bot: Poker – vybere platné karty a pak si vezme nejvýš 2', () => {
    const g = mkV(4);
    for (const k of [1, 2, 3]) { give(g, k, CardType.BEER, { value: '5' }); give(g, k, CardType.BANG, { value: '6' }); }
    g.playCard(giveV(g, 0, 'Poker'));
    for (const k of [1, 2, 3]) {
        const a = decideBotAction(g, k, null);
        assert.ok(V.vosRoundPickOk(g, k, a.payload.cardIds), `hráč ${k}`);
        g.vosPick(k, a.payload.cardIds);
    }
    assert.equal(g.phase, 'POKER_TAKE');
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'vos_poker_take');
    assert.ok(V.pokerTakeOk(g, 0, a.payload.cardIds));
    assert.equal(a.payload.cardIds.length, 2);
});
