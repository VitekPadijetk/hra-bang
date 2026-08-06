const { test } = require('node:test');
const assert = require('node:assert/strict');
const installIntroService = require('../server/intro.js');

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

function mkRoom() {
    return {
        id: 'game1',
        players: [
            { socketId: 's0', playerIdx: 0, name: 'A' },
            { socketId: 's1', playerIdx: 1, name: 'B' },
        ],
        gameState: { players: [{ role: 'Sheriff', charChoices: ['X', 'Y'] }, { role: 'Outlaw', charChoices: ['Z', 'W'] }] },
    };
}

test('installIntroService vystaví intro funkce na ctx', () => {
    const { io } = mkIo();
    const ctx = { io, broadcastRoom() {} };
    installIntroService(ctx);
    for (const fn of ['emitIntro', 'emitIntroRole', 'emitIntroChars', 'runIntroSequence',
                      'introStartCharPhase', 'introStartDeckPhase',
                      'runNextGameIntro', 'introKeepResult', 'introAfterRoles']) {
        assert.equal(typeof ctx[fn], 'function', 'chybí ' + fn);
    }
});

test('emitIntro pošle intro_phase všem hráčům i divákům s myIndex', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const ctx = { io, broadcastRoom() {} };
    installIntroService(ctx);
    ctx.emitIntro(mkRoom(), { sub: 'init' });
    const p0 = emits.find(e => e.scope === 'socket:s0' && e.ev === 'intro_phase');
    const p1 = emits.find(e => e.scope === 'socket:s1' && e.ev === 'intro_phase');
    const spec = emits.find(e => e.scope === 'to:game1_spectators' && e.ev === 'intro_phase');
    assert.equal(p0.payload.myIndex, 0);
    assert.equal(p1.payload.myIndex, 1);
    assert.equal(p0.payload.sub, 'init');
    assert.equal(spec.payload.myIndex, null);
});

// ── Navazující hra ───────────────────────────────────────────────────────────
const noopGlog = { system() {}, error() {} };

function mkNextGameRoom() {
    // 3 hráči: #0 přeživší (Willy the Kid, 2 životy), #1 a #2 mrtví z minulé hry.
    return {
        id: 'game1',
        players: [
            { socketId: 's0', playerIdx: 0, name: 'A' },
            { socketId: 's1', playerIdx: 1, name: 'B' },
            { socketId: 's2', playerIdx: 2, name: 'C' },
        ],
        gameState: {
            deck: { cards: new Array(80).fill(0) },
            players: [
                { role: 'Sheriff', character: null, _survivorChar: 'Willy the Kid', _survivorHealth: 2, _awaitingKeepChoice: true },
                { role: 'Outlaw', character: null, charChoices: ['Z', 'W'] },
                { role: 'Renegade', character: null, charChoices: ['Q', 'R'] },
            ],
        },
    };
}

test('runNextGameIntro pošle init s přeživšími a balíčkem postav bez jejich karet', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1'); addSocket('s2');
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkNextGameRoom();
    ctx.runNextGameIntro(room);

    const init = emits.find(e => e.scope === 'socket:s0' && e.ev === 'intro_phase');
    assert.equal(init.payload.sub, 'init');
    assert.equal(init.payload.nextGame, true);
    assert.equal(init.payload.roleCount, 3);
    assert.equal(init.payload.charCount, 4);          // 2 hráči bez postavy × 2
    assert.equal(init.payload.deckCount, 80);
    assert.deepEqual(init.payload.survivors, [{ idx: 0, char: 'Willy the Kid', health: 2 }]);
    // Rozdávání rolí se zatím NEspustí – čeká se na rozhodnutí přeživších.
    assert.equal(emits.some(e => e.payload?.sub === 'shuffle_roles'), false);
    assert.equal(room._keepPhase, true);
});

test('runNextGameIntro bez přeživších jede rovnou klasickou sekvenci rolí', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1'); addSocket('s2');
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkNextGameRoom();
    room.gameState.players[0]._awaitingKeepChoice = false;
    ctx.runNextGameIntro(room);
    assert.equal(emits.some(e => e.payload?.sub === 'shuffle_roles'), true);
    assert.ok(!room._keepPhase);
});

test('introKeepResult rozešle rozhodnutí a zapamatuje si, kdo si postavu nechal', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1'); addSocket('s2');
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkNextGameRoom();
    ctx.runNextGameIntro(room);

    // Přeživší si postavu nechal (logic by nastavil character + zrušil _awaitingKeepChoice).
    room.gameState.players[0].character = 'Willy the Kid';
    room.gameState.players[0]._awaitingKeepChoice = false;
    ctx.introKeepResult(room, 0, true);

    const res = emits.filter(e => e.scope === 'socket:s1' && e.payload?.sub === 'keep_result');
    assert.equal(res.length, 1);
    assert.equal(res[0].payload.playerIdx, 0);
    assert.equal(res[0].payload.keep, true);
    assert.ok(room._introKeepers.has(0));
    assert.equal(room._keepPhase, false);
});

test('introStartCharPhase přeskočí hráče, kteří si postavu nechali', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1'); addSocket('s2');
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkNextGameRoom();
    room.gameState.players[0].character = 'Willy the Kid';
    room._introKeepers = new Set([0]);

    ctx.introStartCharPhase(room);
    const sh = emits.find(e => e.scope === 'socket:s0' && e.payload?.sub === 'shuffle_chars');
    assert.equal(sh.payload.charCount, 4);   // jen #1 a #2 × 2 karty
});

test('introStartCharPhase v klasické hře rozdá postavy všem (keepers prázdné)', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1'); addSocket('s2');
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkNextGameRoom();
    room.gameState.players[0]._awaitingKeepChoice = false;

    ctx.introStartCharPhase(room);
    const sh = emits.find(e => e.scope === 'socket:s0' && e.payload?.sub === 'shuffle_chars');
    assert.equal(sh.payload.charCount, 6);
});

test('emitIntroRole pošle roli soukromě jen danému hráči', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const ctx = { io, broadcastRoom() {} };
    installIntroService(ctx);
    ctx.emitIntroRole(mkRoom(), 1, 'Outlaw');
    const sent = emits.filter(e => e.ev === 'intro_role');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].scope, 'socket:s1');
    assert.equal(sent[0].payload.role, 'Outlaw');
    assert.equal(sent[0].payload.playerIdx, 1);
});

// ── Rozšíření High Noon: intro beat s balíčkem událostí ──────────────────────
// Balíček se zamíchá po zamíchání hracích karet a Pravé poledne se pak zasune vespod.
// Časovače se přeskočí přes fake setTimeout (voláme callbacky hned).
function runWithInstantTimers(fn) {
    const realSetTimeout = global.setTimeout;
    let depth = 0;
    global.setTimeout = (cb, ms) => { if (depth++ < 200) cb(); depth--; return 0; };
    try { fn(); } finally { global.setTimeout = realSetTimeout; }
}

test('introStartDeckPhase se zapnutým High Noon zamíchá balíček událostí a zasune Pravé poledne', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const room = mkRoom();
    room.gameState = {
        players: [{ role: 'Sheriff', hand: [], _baseHealth: 4 }, { role: 'Outlaw', hand: [], _baseHealth: 4 }],
        deck: { cards: [] },
        eventDeck: new Array(13).fill(0).map((_, i) => ({ id: 300 + i })),
    };
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    runWithInstantTimers(() => ctx.introStartDeckPhase(room));

    const subs = emits.filter(e => e.scope === 'socket:s0' && e.ev === 'intro_phase').map(e => e.payload.sub);
    assert.ok(subs.includes('shuffle_highnoon'), 'chybí míchání balíčku událostí');
    assert.ok(subs.includes('highnoon_bottom'), 'chybí zasunutí Pravého poledne');
    assert.ok(subs.indexOf('shuffle_deck') < subs.indexOf('shuffle_highnoon'), 'nejdřív hrací balíček');
    assert.ok(subs.indexOf('highnoon_bottom') < subs.indexOf('deal_cards'), 'rozdává se až potom');
    const hn = emits.find(e => e.ev === 'intro_phase' && e.payload.sub === 'shuffle_highnoon');
    assert.equal(hn.payload.hnCount, 13);
});

test('introStartDeckPhase bez rozšíření beat s událostmi vůbec nepošle', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const room = mkRoom();
    room.gameState = {
        players: [{ role: 'Sheriff', hand: [], _baseHealth: 4 }, { role: 'Outlaw', hand: [], _baseHealth: 4 }],
        deck: { cards: [] },
        eventDeck: [],
    };
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    runWithInstantTimers(() => ctx.introStartDeckPhase(room));
    const subs = emits.filter(e => e.ev === 'intro_phase').map(e => e.payload.sub);
    assert.ok(!subs.includes('shuffle_highnoon'));
    assert.ok(subs.includes('deal_cards'));
});
