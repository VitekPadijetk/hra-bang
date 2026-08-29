// Rozšíření Divoký západ – Roubík (fáze 9).
//
// „Hráči nesmí mluvit (mohou gestikulovat, sténat atd.). Každý kdo promluví, ztrácí
// 1 život." U stolu se to vynutit nedá, ve hře s chatem ano: odeslání zprávy stojí
// 1 život. Zpráva projde normálně a nic se nepotvrzuje.
//
// Pokuta je ODLOŽENÁ (chat chodí asynchronně a může trefit libovolnou fázi) – zapíše se
// do `_gagPending` a vybere se na nejbližším klidném místě. Testy sem míří především:
// nesmí dopadnout uprostřed rozdělaného efektu a nesmí se ztratit.
//
// Ke kartě patří i hlášky botů (core/botChat.js) – bez nich by Roubík boty nikdy netrefil.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, CardType, Suits } = require('./_helpers.js');
const { GameState } = require('../logic.js');
const { botQuip, quipEvents, quipSnapshot, QUIPS } = require('../core/botChat.js');

before(() => { console.log = () => {}; });

const cardData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.json'), 'utf8'));
const wwsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.divoky_zapad.json'), 'utf8'));
const wws = key => wwsData.find(c => c.key === key);

// Hra s právě platným Roubíkem (nebo bez něj, když se `key` vynechá).
function mkGag(specs, opts = {}, key = 'ROUBIK') {
    const g = mkGame(specs, opts);
    if (key) g.activeWws = wws(key);
    return g;
}

// ── Pravidla: kdy pokuta dopadne ────────────────────────────────────────────

test('Roubík: promluvení ve fázi PLAY stojí 1 život hned', () => {
    const g = mkGag([{ role: 'Sheriff' }, {}, {}]);
    assert.equal(g.gagSpeak(1), true);
    assert.equal(g._drainGag(), true);
    assert.equal(g.players[1].health, 3);
    assert.deepEqual(g._gagPending, [], 'fronta je vybraná');
});

test('bez Roubíku promluvení nestojí nic', () => {
    const g = mkGag([{ role: 'Sheriff' }, {}, {}], {}, null);
    assert.equal(g.gagSpeak(1), false);
    assert.equal(g.players[1].health, 4);
    assert.ok(!g._gagPending || !g._gagPending.length);
});

test('Roubík: mrtvý (i duch mimo svůj tah) o nic nepřijde', () => {
    const g = mkGag([{ role: 'Sheriff' }, { health: 0 }, {}]);
    assert.equal(g.gagSpeak(1), false);
    assert.equal(g.players[1].health, 0);
});

test('Roubík: uprostřed fáze RESPOND pokuta počká, dopadne až po ní', () => {
    const g = mkGag([{ role: 'Sheriff' }, {}, {}]);
    const i = give(g, 0, CardType.BANG, { name: 'Bang!' });
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.gagSpeak(2), true);
    assert.equal(g._drainGag(), false, 'uprostřed obrany se nesahá');
    assert.equal(g.players[2].health, 4);
    assert.deepEqual(g._gagPending, [2], 'pokuta čeká ve frontě');
    g.handleResponse(1, null);                       // cíl nemá čím uhnout
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[2].health, 3, 'pokuta dopadla, až obrana doběhla');
    assert.equal(g.players[1].health, 3, 'zásah Bangem proběhl normálně');
});

test('Roubík: rozdělaný výběr karty (Panika) pokutu taky odloží', () => {
    const g = mkGag([{ role: 'Sheriff' }, {}, {}]);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    const i = give(g, 0, CardType.PANIC, { name: 'Panika!' });
    g.playSpecialCard(0, 1, i);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.gagSpeak(2);
    assert.equal(g._drainGag(), false);
    assert.equal(g.players[2].health, 4);
});

test('Roubík: konec tahu je poslední klidné místo (vybere i mimo fázi PLAY)', () => {
    const g = mkGag([{ role: 'Sheriff' }, {}, {}], { phase: 'DISCARD' });
    g.gagSpeak(2);
    assert.equal(g._drainGag(), false, 'fáze DISCARD není klid');
    g.nextTurn();
    assert.equal(g.players[2].health, 3, 'pokutu vybral konec tahu');
    assert.equal(g.currentPlayerIndex, 1, 'tah se posunul normálně');
});

test('Roubík: Bart Cassidy si za ztracený život lízne (jde přes handleDamage)', () => {
    const g = mkGag([{ role: 'Sheriff' }, { character: 'Bart Cassidy' }, {}]);
    g.deck.cards.push({ id: 901, name: 'Bang!', type: CardType.BANG, suit: Suits.HEARTS, value: '5' });
    g.gagSpeak(1);
    assert.equal(g.gagFlush(), true);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'BART_DRAW', 'schopnost se rozeběhla z fronty odložených akcí');
    g.bartCassidyDraw(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Roubík: smrt z pokuty nechá server posunout tah (_autoEndTurnPending)', () => {
    // Šerif by hru smrtí ukončil, takže se upovídá bandita: hra běží dál a tah se má posunout.
    const g = mkGag([{ role: 'Outlaw', health: 1 }, { role: 'Sheriff' }, { role: 'Renegade' }]);
    g.gagSpeak(0);
    assert.equal(g._drainGag(), true);
    assert.equal(g.players[0].health, 0, 'hráč na tahu se upovídal k smrti');
    assert.equal(g._autoEndTurnPending, true);
    assert.equal(g._deadPlayerIdx, 0);
});

test('Roubík: smrt na konci tahu tah neposune dvakrát', () => {
    const g = mkGag([{ role: 'Outlaw' }, { role: 'Sheriff', health: 1 }, { role: 'Outlaw' }],
                    { phase: 'DISCARD', current: 1 });
    g.gagSpeak(1);
    assert.equal(g._drainGag(), false);
    g.nextTurn();
    assert.equal(g.players[1].health, 0);
    assert.ok(!g._autoEndTurnPending, 'tah posunul právě probíhající nextTurn, ne server');
    assert.ok(g.winner, 'smrt šerifa hru ukončila');
});

test('Roubík: pokuta hráče, který mezitím vypadl ze hry, propadá', () => {
    const g = mkGag([{ role: 'Sheriff' }, {}, {}], { phase: 'RESPOND' });
    g.gagSpeak(2);
    g.players[2].health = 0;
    g.phase = 'PLAY';
    assert.equal(g._drainGag(), false, 'nikoho už netrefila');
    assert.equal(g.players[2].health, 0);
});

test('Roubík: dvě zprávy = dva životy', () => {
    const g = mkGag([{ role: 'Sheriff' }, {}, {}]);
    g.gagSpeak(1); g.gagSpeak(1);
    g._drainGag();
    assert.equal(g.players[1].health, 2);
});

// ── Hlášky botů (core/botChat.js) ───────────────────────────────────────────

const snapOf = (hp) => quipSnapshot({ turnId: 1, players: hp.map(h => ({ health: h, board: [] })) });

test('quipEvents: zásah, těžký zásah, poslední život i vyléčení', () => {
    const prev = snapOf([4, 4, 4]);
    const state = { turnId: 2, currentPlayerIndex: 0,
                    players: [{ health: 3, board: [] }, { health: 1, board: [] }, { health: 2, board: [] }] };
    const evs = quipEvents(prev, state);
    assert.deepEqual(evs.map(e => e.kind), ['hit', 'low', 'bigHit']);
    const healed = quipEvents(snapOf([2, 4, 4]),
        { turnId: 2, currentPlayerIndex: 0, players: [{ health: 3, board: [] }, { health: 4, board: [] }, { health: 4, board: [] }] });
    assert.deepEqual(healed.map(e => e.kind), ['healed']);
});

test('quipEvents: výbuch dynamitu a Vězení se poznají podle karet na stole', () => {
    const dyn = { type: 'Dynamit' }, jail = { type: 'Vězení' };
    const prev = quipSnapshot({ turnId: 1, players: [{ health: 4, board: [dyn] }, { health: 4, board: [] }] });
    const state = { turnId: 1, currentPlayerIndex: 0,
                    players: [{ health: 1, board: [] }, { health: 4, board: [jail] }] };
    assert.deepEqual(quipEvents(prev, state).map(e => e.kind), ['dynamite', 'jailed']);
});

test('quipEvents: vyřazení nekomentuje mrtvý, ale hráč na tahu', () => {
    const prev = snapOf([4, 2, 4]);
    const state = { turnId: 3, currentPlayerIndex: 0,
                    players: [{ health: 4, board: [] }, { health: 0, board: [] }, { health: 4, board: [] }] };
    assert.deepEqual(quipEvents(prev, state), [{ kind: 'kill', playerIdx: 0 }]);
});

test('botQuip: cooldown pustí hlášku až po N tazích', () => {
    const state = { turnId: 5, players: [{ health: 3 }] };
    const ev = { kind: 'hit', playerIdx: 0 };
    const always = () => 0;   // šance projde, vybere první větu
    assert.equal(botQuip(ev, state, 0, always, { lastQuipTurn: 4 }), null, 'hned po sobě mlčí');
    assert.equal(botQuip(ev, state, 0, always, { lastQuipTurn: 1 }), QUIPS.hit[0]);
    assert.equal(botQuip(ev, state, 0, always, {}), QUIPS.hit[0], 'ještě nikdy nemluvil');
});

test('botQuip: malá šance drží hlášky jako koření, ne jako spam', () => {
    const state = { turnId: 5, players: [{ health: 3 }] };
    assert.equal(botQuip({ kind: 'hit', playerIdx: 0 }, state, 0, () => 0.99, {}), null);
});

test('botQuip: bot na 1 životě pod Roubíkem mlčí (politika bota)', () => {
    const roubik = { turnId: 5, activeWws: wws('ROUBIK'), players: [{ health: 1 }] };
    const klid = { turnId: 5, players: [{ health: 1 }] };
    const ev = { kind: 'low', playerIdx: 0 };
    assert.equal(botQuip(ev, roubik, 0, () => 0, {}), null, 'sebevražda hláškou není vtip');
    assert.equal(botQuip(ev, klid, 0, () => 0, {}), QUIPS.low[0], 'bez Roubíku mluví dál');
    const roubik2 = { turnId: 5, activeWws: wws('ROUBIK'), players: [{ health: 2 }] };
    assert.equal(botQuip(ev, roubik2, 0, () => 0, {}), QUIPS.low[0], 'se dvěma životy si to dovolí');
});

test('botQuip: mrtvý nemluví a cizí událost si nepřivlastní', () => {
    const state = { turnId: 5, players: [{ health: 0 }, { health: 3 }] };
    assert.equal(botQuip({ kind: 'hit', playerIdx: 0 }, state, 0, () => 0, {}), null);
    assert.equal(botQuip({ kind: 'hit', playerIdx: 1 }, state, 0, () => 0, {}), null);
});

// ── Server: chat handler + hlášky botů ──────────────────────────────────────

function chatCtx() {
    const out = [];
    const sockets = new Map();
    const io = { sockets: { sockets }, emit() {},
                 to() { return { emit(ev, msg) { out.push({ to: 'spectators', ev, msg }); } }; } };
    const ctx = { io, cardData, GameState };
    require('../server/rooms.js')(ctx);
    ctx.broadcastRoom = () => {};
    ctx.broadcastRoomDelayed = () => {};
    ctx.broadcastLobbyList = () => {};
    require('../server/anim.js')(ctx);
    require('../server/bots.js')(ctx);
    return { ctx, sockets, out };
}

function mkSock(id, out) {
    const h = {};
    return { id, _h: h, on(ev, cb) { h[ev] = cb; }, emit(ev, msg) { out.push({ to: id, ev, msg }); },
             join() {}, leave() {}, to() { return { emit() {} }; } };
}

function chatRoom(ctx, sockets, out, gs) {
    const sock = mkSock('s1', out);
    sockets.set('s1', sock);
    require('../server/handlers.lobby.js')(sock, ctx, () => {});
    const room = { id: 'r1', name: 'test', players: [{ socketId: 's1', playerIdx: 0, name: 'Adam' }],
                   gameState: gs, maxPlayers: 3, options: {} };
    ctx.rooms.set(room.id, room);
    return { sock, room };
}

test('chat handler: zpráva projde a pod Roubíkem stojí 1 život', () => {
    const { ctx, sockets, out } = chatCtx();
    const gs = mkGag([{ role: 'Sheriff' }, {}, {}]);
    const { sock } = chatRoom(ctx, sockets, out, gs);
    sock._h['chat_message']({ text: 'ahoj' });
    assert.ok(out.some(o => o.ev === 'chat_message' && o.msg.text === 'ahoj'), 'zpráva se nezahazuje');
    assert.equal(gs.players[0].health, 3, 'promluvení stálo život');
});

test('chat handler: bez Roubíku zpráva nestojí nic', () => {
    const { ctx, sockets, out } = chatCtx();
    const gs = mkGag([{ role: 'Sheriff' }, {}, {}], {}, null);
    const { sock } = chatRoom(ctx, sockets, out, gs);
    sock._h['chat_message']({ text: 'ahoj' });
    assert.ok(out.some(o => o.ev === 'chat_message'));
    assert.equal(gs.players[0].health, 4);
});

test('chat handler: kdo u stolu nesedí (divák), nic neplatí', () => {
    const { ctx, sockets, out } = chatCtx();
    const gs = mkGag([{ role: 'Sheriff' }, {}, {}]);
    chatRoom(ctx, sockets, out, gs);
    const spec = mkSock('s2', out);
    require('../server/handlers.lobby.js')(spec, ctx, () => {});
    spec._h['chat_message']({ text: 'jen koukám' });
    assert.deepEqual(gs.players.map(p => p.health), [4, 4, 4]);
});

test('chat handler: pokuta uprostřed obrany počká na klidné místo', () => {
    const { ctx, sockets, out } = chatCtx();
    const gs = mkGag([{ role: 'Sheriff' }, {}, {}]);
    const { sock } = chatRoom(ctx, sockets, out, gs);
    const i = give(gs, 0, CardType.BANG, { name: 'Bang!' });
    gs.playBang(0, 1, i);
    sock._h['chat_message']({ text: 'nestřílej!' });
    assert.equal(gs.players[0].health, 4, 'uprostřed RESPOND se nesahá');
    gs.handleResponse(1, null);
    assert.equal(gs.players[0].health, 3);
});

test('flushBotQuips: hláška jde do chatu a pod Roubíkem si sama vezme život', () => {
    const { ctx, out } = chatCtx();
    const gs = mkGag([{ role: 'Sheriff' }, {}, {}]);
    gs.turnId = 9;
    const room = { id: 'r2', name: 'boti', players: [], gameState: gs, maxPlayers: 3, options: {} };
    ctx.rooms.set(room.id, room);
    gs.players.forEach(p => ctx.createBot(room, p.name));
    ctx.flushBotQuips(room);                 // první snímek – ještě není proti čemu diffovat
    gs.players[1].health = 3;                // bot schytal zásah
    const rnd = Math.random;
    Math.random = () => 0;                   // hláška projde a vybere se první věta
    try { ctx.flushBotQuips(room); } finally { Math.random = rnd; }
    assert.ok(out.some(o => o.ev === 'chat_message' && QUIPS.hit.includes(o.msg.text)), 'bot se ozval');
    assert.deepEqual(gs._gagPending, [1], 'Roubík platí i na boty – pokuta čeká na klid');
    assert.equal(gs.players[1].health, 3, 'uprostřed broadcastu se zásah nevybírá');
});

test('flushBotQuips: bez botů na místě nikdo nemluví', () => {
    const { ctx, out } = chatCtx();
    const gs = mkGag([{ role: 'Sheriff' }, {}, {}]);
    const room = { id: 'r3', name: 'lidi', players: [{ socketId: 'h1', playerIdx: 1, name: 'Bob' }],
                   gameState: gs, maxPlayers: 3, options: {} };
    ctx.rooms.set(room.id, room);
    ctx.flushBotQuips(room);
    gs.players[1].health = 3;
    ctx.flushBotQuips(room);
    assert.equal(out.filter(o => o.ev === 'chat_message').length, 0);
});
