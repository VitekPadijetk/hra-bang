// Rozšíření Ozbrojení a nebezpeční – lety kostiček žetonů nabití (bug X, plán §2.16).
// Pravidla si každou změnu žetonů zapíšou do `_adAnim` jako dávku `ad_tokens`, hák před
// broadcastem (flushAdAnim, server/anim.js) ji pošle těsně před stavem a podrží boty.
// Časování: core/armedAnim.js.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CardType, Suits, Card } = require('../logic.js');
const { AD_ANIM, adTokensMs, adAnimMs } = require('../core/armedAnim.js');
const { mkGame, mkCard } = require('./_helpers');

before(() => { console.log = () => {}; });

const adData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.ozbrojeni.json'), 'utf8'));
let _seq = 97000;
function adCard(name) {
    const row = adData.find(c => c.name === name);
    const c = new Card(_seq++, row.name, CardType[row.type], Suits[row.suit], row.value, row.props || {});
    c.effect = row.props?.effect || null;
    return c;
}
function mkAd(specs) {
    const g = mkGame(specs);
    g.options = { expansions: { ozbrojeni: true } };
    g.turnId = 7;
    for (let i = 0; i < 20; i++) g.deck.cards.unshift(mkCard(CardType.MISSED, { suit: Suits.SPADES }));
    return g;
}
function lay(g, idx, name, n) {
    const c = adCard(name);
    if (c.type === CardType.WEAPON) g.players[idx].weapon = c; else g.players[idx].board.push(c);
    g._adAdd(c, n, { fresh: true });
    return c;
}
const tokens = (g) => (g._adAnim || []).filter(a => a.type === 'ad_tokens');

test('ze zásoby na kartu / z karty do zásoby: dávka s adresou a odstupem', () => {
    const g = mkAd([{}, {}]);
    const c = lay(g, 1, 'Bedna', 3);
    const [grp] = tokens(g);
    assert.equal(grp.flights.length, 3);
    assert.deepEqual(grp.flights.map(f => f.kind), ['load', 'load', 'load']);
    assert.deepEqual(grp.flights[0].to, { seat: 1, cardId: c.id, slot: 1 });
    assert.equal(grp.flights[0].from, null, 'ze zásoby');
    assert.deepEqual(grp.flights.map(f => f.delay), [0, AD_ANIM.staggerMs, 2 * AD_ANIM.staggerMs]);
    g._adAnim = null;
    g._adTake(g.players[1], 0);
    assert.equal(g._adAnim, null, 'nic se nepohnulo = nic neletí');
    g._adTake(c, 1);
    assert.deepEqual(tokens(g)[0].flights, [{ from: { seat: 1, cardId: c.id, slot: 1 }, to: null, kind: 'pay', delay: 0 }]);
});

test('zbraň má slot 0, postava cardId null', () => {
    const g = mkAd([{}, {}]);
    const w = lay(g, 0, 'Thunderer', 3);
    assert.deepEqual(tokens(g)[0].flights[0].to, { seat: 0, cardId: w.id, slot: 0 });
    g._adAnim = null;
    g._adAdd(g.players[1], 1);
    assert.deepEqual(tokens(g)[0].flights[0].to, { seat: 1, cardId: null, slot: null });
});

test('vyčerpaná karta: nejdřív odletí poslední žetony, pak karta (depleted v téže dávce)', () => {
    const g = mkAd([{}, {}]);
    const c = lay(g, 0, 'Bedna', 2);
    g._adAnim = null;
    g._adTake(c, 2);
    assert.ok(!g.players[0].board.includes(c), 'karta odešla do odhozu');
    const [grp] = tokens(g);
    assert.equal(grp.flights.length, 2);
    assert.deepEqual(grp.depleted, [{ playerIdx: 0, cardId: c.id }]);
    // Klient i boti čekají na kostičky I na odchod karty.
    assert.equal(adTokensMs(grp), AD_ANIM.staggerMs + AD_ANIM.flyMs.pay + AD_ANIM.departMs + AD_ANIM.bufMs);
});

test('přesun: co se nad strop nevejde, letí rovnou do zásoby', () => {
    const g = mkAd([{}, {}]);
    const c = lay(g, 1, 'Bedna', 3);
    g._adAdd(g.players[0], 3);
    g._adAnim = null;
    g._adMove(c, g.players[0], 2);
    const f = tokens(g)[0].flights;
    assert.deepEqual(f.map(x => x.kind), ['move', 'pay']);
    assert.deepEqual(f[0].to, { seat: 0, cardId: null, slot: null });
    assert.equal(f[1].to, null);
});

test('Rez: všechny kostičky letí naráz', () => {
    const g = mkAd([{}, {}, {}]);
    lay(g, 1, 'Bedna', 3);
    g._adAdd(g.players[1], 2);
    lay(g, 2, 'Zvonice', 2);
    g._adAnim = null;
    g._adRust(0);
    const f = tokens(g)[0].flights;
    assert.equal(f.length, 3);
    assert.ok(f.every(x => x.delay === 0), 'žádný odstup');
    assert.equal(adTokensMs(tokens(g)[0]), AD_ANIM.flyMs.move + AD_ANIM.bufMs);
});

test('jiná animace mezi lety založí novou dávku (pořadí sedí)', () => {
    const g = mkAd([{}, {}]);
    g._adAdd(g.players[0], 1);
    g._adAnim.push({ type: 'discard_to_hand', toPlayerIdx: 0, cardId: 1 });
    g._adAdd(g.players[0], 1);
    assert.deepEqual(g._adAnim.map(a => a.type), ['ad_tokens', 'discard_to_hand', 'ad_tokens']);
});

test('Red Ringo při rozdání postav: žetony leží od začátku, nic neletí', () => {
    const g = mkAd([{ character: 'Red Ringo' }, {}]);
    g._adDealRingo();
    assert.equal(g.players[0].adLoads, 4);
    assert.equal(tokens(g).length, 0);
});

test('adAnimMs: prázdná dávka nic nedrží, karta do ruky 400 ms', () => {
    assert.equal(adAnimMs({ type: 'ad_tokens', flights: [], depleted: [] }), 0);
    assert.equal(adAnimMs({ type: 'discard_to_hand' }), 400);
});

test('flushAdAnim pošle dávku před stavem a podrží boty na její dobu', () => {
    const emits = [];
    const s0 = { emit(ev, p) { emits.push({ ev, p }); } };
    const io = { sockets: { sockets: new Map([['s0', s0]]) }, to() { return { emit() {} }; } };
    const ctx = { io, broadcastRoomDelayed() {} };
    require('../server/anim.js')(ctx);
    const g = mkAd([{}, {}]);
    lay(g, 1, 'Bedna', 3);
    const room = { id: 'g1', players: [{ socketId: 's0', playerIdx: 0 }], gameState: g };
    const t0 = Date.now();
    ctx.beforeBroadcast(room);
    const a = emits.find(e => e.ev === 'card_animation' && e.p.type === 'ad_tokens');
    assert.ok(a, 'dávka odešla');
    assert.equal(g._adAnim, null, 'spotřebuje se');
    assert.ok(room._vosBlockUntil >= t0 + adTokensMs(a.p), 'boti čekají na dolet');
});
