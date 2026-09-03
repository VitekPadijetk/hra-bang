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

// Míchá se CELÝ balíček postav (základ 16, s Dodge City 31), ne jen tolik karet,
// kolik se rozdá – zbytek pak na klientu odletí ze stolu jako celek.
test('introStartCharPhase zamíchá celý balíček postav, ne jen rozdávané karty', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1'); addSocket('s2');
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkNextGameRoom();
    room.gameState.players[0]._awaitingKeepChoice = false;
    room.gameState.options = {};
    room.gameState._characterPool = () => new Array(16).fill('X');

    ctx.introStartCharPhase(room);
    const sh = emits.find(e => e.scope === 'socket:s0' && e.payload?.sub === 'shuffle_chars');
    assert.equal(sh.payload.charCount, 16);
});

test('introStartCharPhase: balíček postav je bez těch, které si přeživší nechali', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1'); addSocket('s2');
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkNextGameRoom();
    room.gameState.players[0].character = 'Willy the Kid';
    room.gameState.options = { expansions: { dodge_city: true } };
    room.gameState._characterPool = () => new Array(31).fill('X');
    room._introKeepers = new Set([0]);

    ctx.introStartCharPhase(room);
    const sh = emits.find(e => e.scope === 'socket:s0' && e.payload?.sub === 'shuffle_chars');
    assert.equal(sh.payload.charCount, 30);
});

// 8 hráčů bez rozšíření: 16 postav, 8×2 rozdáno – balíček dojde a nezbude nic, co by
// mělo odletět. Klient na to spoléhá (_introFlyAwayCharDeck).
test('introStartCharPhase: 8 hráčů bez rozšíření vyčerpá balíček postav beze zbytku', () => {
    const { io, addSocket, emits } = mkIo();
    const players = [];
    const gsPlayers = [];
    for (let i = 0; i < 8; i++) {
        addSocket('s' + i);
        players.push({ socketId: 's' + i, playerIdx: i, name: 'P' + i });
        gsPlayers.push({ role: i === 0 ? 'Sheriff' : 'Outlaw', charChoices: ['A', 'B'] });
    }
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = {
        id: 'game1', players,
        gameState: { players: gsPlayers, options: {}, _characterPool: () => new Array(16).fill('X') },
    };
    ctx.introStartCharPhase(room);
    const sh = emits.find(e => e.scope === 'socket:s0' && e.payload?.sub === 'shuffle_chars');
    assert.equal(sh.payload.charCount, 16);   // 8 × 2 = přesně celý balíček
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
    assert.ok(subs.includes('highnoon_top'), 'chybí sejmutí vrchní karty (Pravé poledne)');
    assert.ok(subs.includes('shuffle_highnoon'), 'chybí míchání balíčku událostí');
    assert.ok(subs.includes('highnoon_bottom'), 'chybí zasunutí Pravého poledne');
    assert.ok(subs.indexOf('shuffle_deck') < subs.indexOf('highnoon_top'), 'nejdřív hrací balíček');
    // Pořadí beatů: kompletní balíček → sejmutí vrchní → míchání zbytku → vespod.
    assert.ok(subs.indexOf('highnoon_top') < subs.indexOf('shuffle_highnoon'), 'nejdřív se ukáže vrchní karta');
    assert.ok(subs.indexOf('shuffle_highnoon') < subs.indexOf('highnoon_bottom'), 'míchá se před zasunutím');
    assert.ok(subs.indexOf('highnoon_bottom') < subs.indexOf('deal_cards'), 'rozdává se až potom');
    // Oba beaty nesou PLNÝ počet karet – klient si sám odečte odloženou kartu.
    const top = emits.find(e => e.ev === 'intro_phase' && e.payload.sub === 'highnoon_top');
    assert.equal(top.payload.hnCount, 13);
    const hn = emits.find(e => e.ev === 'intro_phase' && e.payload.sub === 'shuffle_highnoon');
    assert.equal(hn.payload.hnCount, 13);
});

test('introStartDeckPhase pošle beaty všech tří balíčků za sebou', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0'); addSocket('s1');
    const room = mkRoom();
    room.gameState = {
        players: [{ role: 'Sheriff', hand: [], _baseHealth: 4 }, { role: 'Outlaw', hand: [], _baseHealth: 4 }],
        deck: { cards: [] },
        eventDeck: new Array(15).fill(0).map((_, i) => ({ id: 300 + i })),
        ffDeck: new Array(15).fill(0).map((_, i) => ({ id: 400 + i })),
        wwsDeck: new Array(10).fill(0).map((_, i) => ({ id: 500 + i })),
    };
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    runWithInstantTimers(() => ctx.introStartDeckPhase(room));

    const subs = emits.filter(e => e.scope === 'socket:s0' && e.ev === 'intro_phase').map(e => e.payload.sub);
    ['wws_top', 'shuffle_wws', 'wws_bottom'].forEach(sub =>
        assert.ok(subs.includes(sub), `chybí beat ${sub}`));
    // Trojice beatů jde za sebou a Divoký západ až úplně nakonec (míchání se nesmí krýt).
    assert.ok(subs.indexOf('highnoon_bottom') < subs.indexOf('fistful_top'), 'Fistful až po High Noonu');
    assert.ok(subs.indexOf('fistful_bottom') < subs.indexOf('wws_top'), 'Divoký západ až po Fistfulu');
    assert.ok(subs.indexOf('wws_top') < subs.indexOf('shuffle_wws'));
    assert.ok(subs.indexOf('shuffle_wws') < subs.indexOf('wws_bottom'));
    assert.ok(subs.indexOf('wws_bottom') < subs.indexOf('deal_cards'), 'rozdává se až potom');
    // Beaty nesou PLNÝ počet karet – klient si sám odečte odloženou kartu.
    const top = emits.find(e => e.ev === 'intro_phase' && e.payload.sub === 'wws_top');
    assert.equal(top.payload.wwsCount, 10);
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
    assert.ok(!subs.includes('highnoon_top'));
    assert.ok(!subs.includes('shuffle_highnoon'));
    assert.ok(!subs.includes('wws_top'));
    assert.ok(subs.includes('deal_cards'));
});

// ── Hra pro 3 (Město duchů): role jsou veřejné už během intra ────────────────
// Role smí jít do BROADCASTU jen ve hře pro 3; u ostatních počtů je tajná a chodí
// výhradně soukromým intro_role svému hráči.
function mkRoom3p(mode3p) {
    return {
        id: 'game3',
        players: [
            { socketId: 's0', playerIdx: 0, name: 'A' },
            { socketId: 's1', playerIdx: 1, name: 'B' },
            { socketId: 's2', playerIdx: 2, name: 'C' },
        ],
        gameState: {
            mode3p,
            players: [{ role: 'Deputy' }, { role: 'Outlaw' }, { role: 'Renegade' }],
            deck: { cards: [] },
        },
    };
}

function rolesInBroadcast(mode3p) {
    const { io, addSocket, emits } = mkIo();
    ['s0', 's1', 's2'].forEach(addSocket);
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    installIntroService(ctx);
    const room = mkRoom3p(mode3p);
    const origTimeout = global.setTimeout;
    global.setTimeout = (fn) => { fn(); return 0; };   // sekvence proběhne synchronně
    try { ctx.runIntroSequence(room); } finally { global.setTimeout = origTimeout; }
    return emits.filter(e => e.scope === 'socket:s0' && e.ev === 'intro_phase' &&
                             e.payload.sub === 'role_card_fly');
}

test('runIntroSequence pro 3 hráče posílá roli i v broadcastu (role jsou odkryté)', () => {
    const flies = rolesInBroadcast(true);
    assert.equal(flies.length, 3);
    assert.deepEqual(flies.map(e => e.payload.role).sort(),
        ['Deputy', 'Outlaw', 'Renegade']);
});

test('runIntroSequence mimo hru pro 3 roli v broadcastu NEposílá (je tajná)', () => {
    const flies = rolesInBroadcast(false);
    assert.equal(flies.length, 3);
    assert.ok(flies.every(e => e.payload.role === undefined),
        'role unikla do broadcastu: ' + JSON.stringify(flies.map(e => e.payload)));
});

// ── Uzavření fáze rolí čeká na dorozdání ───────────────────────────────
// Boti potvrzují roli hned, jak vznikne _introRoleConfirmed (tick po intro emitu) –
// u stolu jen botů je tedy „potvrzeno všemi“ dřív, než první karta role vzlétne.
// Míchání postav se pak rozjelo přes rozdávání rolí.
function mkClock() {
    const orig = global.setTimeout;
    let now = 0, seq = 0;
    const q = [];
    global.setTimeout = (fn, ms = 0) => { q.push({ at: now + ms, seq: seq++, fn }); return 0; };
    return {
        runAll() {
            while (q.length) {
                q.sort((a, b) => a.at - b.at || a.seq - b.seq);
                const t = q.shift();
                now = t.at;
                t.fn();
            }
        },
        restore() { global.setTimeout = orig; },
    };
}

test('fáze rolí se neuzavře, dokud se rozdává (stůl jen botů)', () => {
    const { io, addSocket, emits } = mkIo();
    ['s0', 's1', 's2'].forEach(addSocket);
    const room = mkRoom3p(false);
    const ctx = { io, broadcastRoom() {}, glog: noopGlog };
    // Driver botů: jakmile Set vznikne, všechna sedadla roli hned potvrdí.
    ctx.afterIntroEmit = () => {
        if (!room._introRoleConfirmed) return;
        room.players.forEach(rp => room._introRoleConfirmed.add(rp.playerIdx));
        ctx.closeRolePhase(room);
    };
    installIntroService(ctx);
    const clock = mkClock();
    try { ctx.runIntroSequence(room); clock.runAll(); } finally { clock.restore(); }
    const subs = emits.filter(e => e.scope === 'socket:s0' && e.ev === 'intro_phase')
                      .map(e => e.payload.sub);
    const lastFly = subs.lastIndexOf('role_card_fly');
    const chars = subs.indexOf('shuffle_chars');
    assert.equal(subs.filter(x => x === 'role_card_fly').length, 3, 'rozdat se musí všechny tři role');
    assert.ok(chars > lastFly, 'míchání postav začalo během rozdávání rolí: ' + subs.join(', '));
});
