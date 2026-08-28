// Divoký západ – Sacagaway: „Všichni hráči hrají s odhalenými kartami v ruce (vyjma
// svých rolí)." Jediná událost, která sahá do redakce stavu; PRAVIDLA se jí nemění
// vůbec (FAQ Q17 – z ruky se pořád bere náhodně). Testy proto hlídají tři věci:
//   1) že se pravidla opravdu nezměnila (náhodný odběr, resolveCardSelection),
//   2) že se příchod i odchod karty ohlásí jako předěl pro přetáčení vějířů,
//   3) časování cinematik (core/wwsAnim.js) – server i klient z něj počítají totéž.
// Redakci samotnou hlídá test/server.rooms.test.js („Sacagaway: …").
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, give } = require('./_helpers.js');
const { CardType } = require('../logic.js');
const { SACA_FLIP, sacaFlipMs, SACA_STEAL,
        sacaStealPreMs, sacaStealPostMs, sacaStealExtraMs } = require('../core/wwsAnim.js');
const { eventActive } = require('../core/highNoon.js');
const installAnimService = require('../server/anim.js');

before(() => { console.log = () => {}; });

function mkIo() {
    const sockets = new Map();
    const emits = [];
    const io = {
        sockets: { sockets },
        emit(ev, p) { emits.push({ scope: 'io', ev, payload: p }); },
        to(k) { return { emit(ev, p) { emits.push({ scope: 'to:' + k, ev, payload: p }); } }; },
    };
    function addSocket(id) {
        const s = { id, emit(ev, p) { emits.push({ scope: 'socket:' + id, ev, payload: p }); } };
        sockets.set(id, s);
        return s;
    }
    return { io, addSocket, emits };
}

// Hra se zapnutým balíčkem Divokého západu, kde je Sacagaway hned navrchu.
function mkWithSaca(n = 3) {
    const g = mkGame(Array.from({ length: n }, () => ({ role: 'Outlaw' })));
    g.wwsDeck = [{ id: 500, key: 'DIVOKY_ZAPAD', name: 'Divoký západ' },
                 { id: 507, key: 'SACAGAWAY', name: 'Sacagaway' }];
    g.wwsPile = [];
    g.activeWws = null;
    return g;
}

// ── Pravidla se nemění ──────────────────────────────────────────────────────

test('Sacagaway: hasEvent i eventActive ji vidí ve třetím balíčku', () => {
    const g = mkWithSaca();
    assert.equal(g.hasEvent('SACAGAWAY'), false);
    g._flipWwsEvent(0);
    assert.equal(g.hasEvent('SACAGAWAY'), true);
    assert.equal(eventActive(JSON.parse(JSON.stringify(g)), 'SACAGAWAY'), true);
});

test('Sacagaway: z ruky se pořád bere NÁHODNĚ (FAQ Q17)', () => {
    // Panika pod Sacagaway nesmí jít mířit – resolveCardSelection bere z ruky náhodnou
    // kartu úplně stejně jako bez ní. Kdyby se vybíralo, byla by z Paniky přesná zbraň.
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
        const g = mkWithSaca(2);
        g._flipWwsEvent(0);
        give(g, 1, CardType.BANG, { id: 101 });
        give(g, 1, CardType.BEER, { id: 102 });
        give(g, 1, CardType.MISSED, { id: 103 });
        g.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: CardType.PANIC,
                               ignoreDistance: true };
        g.phase = 'SELECTING_TARGET_CARD';
        g.resolveCardSelection(0, 'hand', null);
        seen.add(g.players[0].hand[g.players[0].hand.length - 1].id);
    }
    assert.ok(seen.size > 1, 'ukradená karta se napříč pokusy liší (bere se náhodně)');
});

// ── Předěl pro přetáčení vějířů ─────────────────────────────────────────────

test('Sacagaway: příchod i odchod se ohlásí jako _pendingSacaFlip', () => {
    const g = mkWithSaca();
    g._flipWwsEvent(0);
    assert.deepEqual(g._pendingSacaFlip, { open: true }, 'příchod = ruce se odkryjí');
    g._pendingSacaFlip = null;
    // vystřídá ji karta „Divoký západ" (spodní) → ruce se zase skryjí
    g._flipWwsEvent(1);
    assert.deepEqual(g._pendingSacaFlip, { open: false }, 'odchod = ruce se zase skryjí');
});

test('Sacagaway: výměna karty, která se jí netýká, přetáčení nespustí', () => {
    const g = mkGame(Array.from({ length: 3 }, () => ({ role: 'Outlaw' })));
    g.wwsDeck = [{ id: 503, key: 'MADAM_ZUZANA', name: 'Madam Zuzana' },
                 { id: 501, key: 'HRBITOV', name: 'Hřbitov' }];
    g.wwsPile = [];
    g.activeWws = null;
    g._flipWwsEvent(0);
    assert.equal(g._pendingSacaFlip, undefined);
    g._flipWwsEvent(0);
    assert.equal(g._pendingSacaFlip, undefined);
});

// ── Emit animace + držení botů ──────────────────────────────────────────────

test('flushSacaFlip: na PŘÍCHODU pošle ID karet v rukou (klient je ještě nemá)', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0');
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = mkWithSaca(2);
    give(gs, 0, CardType.BANG, { id: 101 });
    give(gs, 1, CardType.BEER, { id: 102 });
    give(gs, 1, CardType.MISSED, { id: 103 });
    gs._flipWwsEvent(0);
    const room = { id: 'g1', players: [{ socketId: 's0', playerIdx: 0 }], gameState: gs };
    ctx.beforeBroadcast(room);
    const a = emits.filter(e => e.ev === 'card_animation' && e.payload.type === 'saca_flip').pop();
    assert.ok(a, 'animace odešla');
    assert.equal(a.payload.open, true);
    assert.deepEqual(a.payload.hands[1].cardIds, [102, 103]);
    assert.equal(gs._pendingSacaFlip, null, 'příznak se spotřeboval');
    assert.ok(room._wwsBlockUntil > Date.now(), 'boti se o vlnu podrží');
});

test('flushSacaFlip: na ODCHODU stačí počty (líce klient pořád vidí)', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0');
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = mkWithSaca(2);
    give(gs, 1, CardType.BEER, { id: 102 });
    give(gs, 1, CardType.MISSED, { id: 103 });
    gs._flipWwsEvent(0);
    gs._pendingSacaFlip = null;
    gs._flipWwsEvent(0);          // vystřídá ji „Divoký západ"
    const room = { id: 'g1', players: [{ socketId: 's0', playerIdx: 0 }], gameState: gs };
    ctx.beforeBroadcast(room);
    const a = emits.filter(e => e.ev === 'card_animation' && e.payload.type === 'saca_flip').pop();
    assert.equal(a.payload.open, false);
    assert.equal(a.payload.hands[1].count, 2);
    assert.equal(a.payload.hands[1].cardIds, undefined);
});

test('emitAnimPrivate jde pod Sacagaway veřejně – kromě krádeže ze zamíchané ruky', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = mkWithSaca(2);
    give(gs, 1, CardType.BEER, { id: 102 });
    gs._flipWwsEvent(0);
    const room = { id: 'g1', gameState: gs,
                   players: [{ socketId: 's0', playerIdx: 0 }, { socketId: 's1', playerIdx: 1 }] };
    // Líznutí do odkryté ruky: karta je vzápětí veřejná → ID dostanou všichni.
    ctx.emitAnimPrivate(room, 0, { type: 'draw', playerIdx: 0, cardId: 7 }, { type: 'draw', playerIdx: 0 });
    const drawOther = emits.filter(e => e.scope === 'socket:s1' && e.ev === 'card_animation').pop();
    assert.equal(drawOther.payload.cardId, 7, 'soupeř vidí, co si hráč lízl');
    // Krádež z ruky: ruka je v tu chvíli zamíchaná lícem dolů (FAQ Q17) → zůstává soukromá.
    ctx.emitAnimPrivate(room, 0,
        { type: 'panic_sequence', attackerIdx: 0, targetIdx: 1, area: 'hand', stolenCardId: 9 },
        { type: 'panic_sequence', attackerIdx: 0, targetIdx: 1, area: 'hand', stolenCardId: null });
    const stealOther = emits.filter(e => e.scope === 'socket:s1' && e.ev === 'card_animation').pop();
    assert.equal(stealOther.payload.stolenCardId, null, 'ostatní ukradenou kartu neznají');
    assert.ok(room._wwsBlockUntil > Date.now(), 'boti se o gesto podrží');
});

// ── Časování (core/wwsAnim.js) ──────────────────────────────────────────────

test('sacaFlipMs: vlna obchází stůl, prázdné ruce ji nezdrží ani nezrychlí', () => {
    const D = SACA_FLIP;
    assert.equal(sacaFlipMs([]), 0, 'nikdo nemá karty → není co přetáčet');
    assert.equal(sacaFlipMs([0, 0]), 0);
    assert.equal(sacaFlipMs([1]), D.preMs + D.flipMs + D.tailMs);
    // druhá ruka startuje o handStaggerMs později; třetí karta v ní o 2× cardStaggerMs
    assert.equal(sacaFlipMs([1, 3]),
        D.preMs + D.handStaggerMs + 2 * D.cardStaggerMs + D.flipMs + D.tailMs);
    // prázdná ruka drží své místo v pořadí (vlna se nezrychlí)
    assert.equal(sacaFlipMs([0, 1]), D.preMs + D.handStaggerMs + D.flipMs + D.tailMs);
});

test('sacaStealMs: prodloužení krádeže = gesto před ní + přetočení po ní', () => {
    const D = SACA_STEAL;
    assert.equal(sacaStealPreMs(0), 0);
    assert.equal(sacaStealPreMs(1), D.downMs + D.gatherMs + D.holdMs + D.spreadMs);
    assert.equal(sacaStealPreMs(3), D.downMs + 2 * D.cardStaggerMs + D.gatherMs + D.holdMs + D.spreadMs);
    assert.equal(sacaStealPostMs(0), 0, 'poslední karta z ruky → není co přetáčet zpátky');
    assert.equal(sacaStealPostMs(2), D.upMs + D.cardStaggerMs);
    // celkové prodloužení počítá s rukou PŘED krádeží (po ní má o kartu míň)
    assert.equal(sacaStealExtraMs(3), sacaStealPreMs(3) + sacaStealPostMs(2));
    assert.equal(sacaStealExtraMs(0), 0);
});
