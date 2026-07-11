// Testy služby botů (server/bots.js): fake socket, createBot/removeBot a driver
// (runBotTickOnce). Sestavíme ctx s fake io a no-op broadcasty (boti čtou gs přímo,
// broadcasty jsou jen vizuál) → driver lze pumpovat synchronně bez timerů.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState } = require('../logic.js');
const { mkGame } = require('./_helpers.js');
const { pendingActor } = require('../core/botPolicy.js');

const registerLobbyHandlers = require('../server/handlers.lobby.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));
const dodgeCityCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.dodge_city.json', 'utf8'));

before(() => { console.log = () => {}; console.warn = () => {}; });

// Reálný (ne-bot) socket pro lobby handlery: zachytává emity, umí _fire.
function mkRealSocket(id) {
    const handlers = {}; const emits = [];
    return {
        id, emits,
        on(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); },
        emit(ev, p) { emits.push({ ev, payload: p }); },
        join() {}, leave() {}, to() { return { emit() {} }; },
        _fire(ev, p) { (handlers[ev] || []).forEach(cb => cb(p)); },
    };
}

// Synchronně dohraje hru jen botů (broadcasty jsou v buildCtx no-op).
function pumpToWinner(ctx, room) {
    let guard = 0;
    while (!room.gameState.winner && guard++ < 8000) {
        const pa = pendingActor(room.gameState);
        if (!pa || !room.players[pa.idx]?.isBot) break;
        ctx.runBotTickOnce(room);
    }
    return guard;
}

function buildCtx() {
    const sockets = new Map();
    const io = { sockets: { sockets }, emit() {}, to() { return { emit() {} }; } };
    const ctx = { io, cardData, GameState };
    require('../server/rooms.js')(ctx);
    require('../server/ledger.js')(ctx);   // ledger chování (dedukce rolí boty) – jako v server.js
    // No-op broadcasty: testujeme logiku, ne vizuál. Override PŘED instalací anim/intro/
    // lifecycle/bots, aby je zachytili (a tím i handlery botů). Tím odpadnou všechny timery
    // a driver jde pumpovat synchronně (broadcastRoom = no-op ⇒ afterBroadcast se nevolá).
    ctx.broadcastRoom = () => {};
    ctx.broadcastRoomDelayed = () => {};
    ctx.broadcastLobbyList = () => {};
    require('../server/anim.js')(ctx);
    require('../server/intro.js')(ctx);
    require('../server/lifecycle.js')(ctx);
    require('../server/bots.js')(ctx);
    return ctx;
}

// ── createBot / removeBot ─────────────────────────────────────────────────────
test('createBot přidá bot hráče a fake socket', () => {
    const ctx = buildCtx();
    const room = { id: 'g1', players: [], gameState: new GameState(), maxPlayers: 4 };
    ctx.rooms.set('g1', room);
    const p = ctx.createBot(room);
    assert.equal(room.players.length, 1);
    assert.equal(p.isBot, true);
    assert.equal(p.playerIdx, 0);
    const sock = ctx.botSockets.get(p.socketId);
    assert.ok(sock && typeof sock._fire === 'function');
});

test('removeBot odebere bota a přečísluje indexy', () => {
    const ctx = buildCtx();
    const room = { id: 'g1', players: [], gameState: new GameState(), maxPlayers: 4 };
    ctx.rooms.set('g1', room);
    const a = ctx.createBot(room);
    const b = ctx.createBot(room);
    assert.equal(ctx.removeBot(room, a.socketId), true);
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0].socketId, b.socketId);
    assert.equal(room.players[0].playerIdx, 0);
    assert.equal(ctx.botSockets.has(a.socketId), false);
});

// ── Reconnect: bot-takeover + rejoin ──────────────────────────────────────────
test('botControl převezme odpojeného člověka, botRelease ho uvolní', () => {
    const ctx = buildCtx();
    const room = { id: 'g1', players: [], gameState: new GameState(), maxPlayers: 4, leaderSocketId: 'human1' };
    ctx.rooms.set('g1', room);
    const p = { socketId: 'human1', playerIdx: 0, name: 'Alice', token: 'tok-a' };
    room.players.push(p);

    ctx.botControl(room, p);
    assert.equal(p.botControlled, true);
    assert.ok(ctx.botSockets.get('human1'));        // fake socket navázán na jeho socketId
    assert.equal(ctx.hasBots(room), true);          // driver teď místnost obsluhuje

    ctx.botRelease(room, p);
    assert.equal(p.botControlled, false);
    assert.equal(ctx.botSockets.get('human1'), undefined);
});

test('rejoin přepojí odpojené místo na nový socket podle tokenu', () => {
    const ctx = buildCtx();
    const room = { id: 'g1', phase: 'playing', players: [], gameState: new GameState(), maxPlayers: 4, leaderSocketId: 'old1' };
    ctx.rooms.set('g1', room);
    const p = { socketId: 'old1', playerIdx: 0, name: 'Alice', token: 'tok-a', disconnected: true };
    room.players.push(p);
    ctx.botControl(room, p);   // stav po odpojení během hry

    const newSock = mkRealSocket('new1');
    registerLobbyHandlers(newSock, ctx, () => {});
    newSock._fire('rejoin', { roomId: 'g1', token: 'tok-a' });

    assert.equal(p.socketId, 'new1');               // místo přepojeno na nový socket
    assert.equal(p.disconnected, false);
    assert.equal(p.botControlled, false);
    assert.equal(room.leaderSocketId, 'new1');      // lídr přepojen
    assert.equal(ctx.botSockets.get('old1'), undefined);  // dočasný bot zrušen
    const rj = newSock.emits.find(e => e.ev === 'room_joined');
    assert.ok(rj && rj.payload.myIndex === 0);
});

test('rejoin se špatným/cizím tokenem vrátí rejoin_failed', () => {
    const ctx = buildCtx();
    const room = { id: 'g1', phase: 'playing', leaderSocketId: 'old1', maxPlayers: 4,
        players: [{ socketId: 'old1', playerIdx: 0, name: 'A', token: 'tok-a', disconnected: true }],
        gameState: new GameState() };
    ctx.rooms.set('g1', room);
    const s = mkRealSocket('x');
    registerLobbyHandlers(s, ctx, () => {});
    s._fire('rejoin', { roomId: 'g1', token: 'nope' });
    assert.ok(s.emits.find(e => e.ev === 'rejoin_failed'));
    assert.equal(s.emits.find(e => e.ev === 'room_joined'), undefined);
});

test('createBot čísluje boty podle počtu, ne podle místa; číslo se po odebrání uvolní', () => {
    const ctx = buildCtx();
    const room = { id: 'g1', players: [{ socketId: 'H', playerIdx: 0, name: 'Človíček' }], gameState: new GameState(), maxPlayers: 5 };
    ctx.rooms.set('g1', room);
    const a = ctx.createBot(room);
    const b = ctx.createBot(room);
    assert.equal(a.name, '🤖 Bot 1');   // ne „Bot 2" podle místa
    assert.equal(b.name, '🤖 Bot 2');
    ctx.removeBot(room, a.socketId);
    const c = ctx.createBot(room);
    assert.equal(c.name, '🤖 Bot 1');   // uvolněné číslo se znovu použije
});

test('po konci hry bot automaticky chce další hru (vote_next_game)', () => {
    const ctx = buildCtx();
    const gs = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }], { phase: 'PLAY' });
    gs.winner = 'Zákon vyhrál!';
    const room = { id: 'g1', players: [], gameState: gs, maxPlayers: 3 };
    ctx.rooms.set('g1', room);
    gs.players.forEach(p => ctx.createBot(room, p.name));
    ctx.runBotTickOnce(room);
    assert.ok(room.players.every(p => p.wantsNext === true), 'všichni boti hlasovali ANO');
});

// ── Driver: runBotTickOnce ─────────────────────────────────────────────────────
test('runBotTickOnce: na tahu člověka nic neudělá', () => {
    const ctx = buildCtx();
    const gs = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }], { phase: 'PLAY', current: 0 });
    const room = { id: 'g1', players: [], gameState: gs, maxPlayers: 3 };
    ctx.rooms.set('g1', room);
    // hráč 0 = člověk, 1 a 2 boti
    room.players.push({ socketId: 'H', playerIdx: 0, name: 'Človíček' });
    ctx.createBot(room); ctx.createBot(room);
    ctx.runBotTickOnce(room);
    assert.equal(gs.currentPlayerIndex, 0); // beze změny – čeká se na člověka
});

test('runBotTickOnce: bot s prázdnou rukou ve fázi PLAY ukončí tah', () => {
    const ctx = buildCtx();
    const gs = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Renegade' }], { phase: 'PLAY', current: 0 });
    const room = { id: 'g1', players: [], gameState: gs, maxPlayers: 3 };
    ctx.rooms.set('g1', room);
    gs.players.forEach((p, i) => ctx.createBot(room, p.name));
    ctx.runBotTickOnce(room);
    assert.equal(gs.currentPlayerIndex, 1); // tah předán dál
});

// ── Integrace: hra jen botů doběhne k vítězi ───────────────────────────────────
test('hra 4 botů doběhne k vítězi bez zaseknutí', () => {
    const ctx = buildCtx();
    const gs = new GameState();
    gs.cardData = cardData;
    const room = { id: 'g4', players: [], gameState: gs, maxPlayers: 4, options: {} };
    ctx.rooms.set('g4', room);
    gs.setupGame(4, ['B0', 'B1', 'B2', 'B3'], {});
    gs.autoSelectAllCharacters();           // rozdá karty + spustí 1. tah
    gs.players.forEach((p, i) => ctx.createBot(room, p.name));

    let guard = 0;
    while (!gs.winner && guard++ < 8000) {
        const pa = pendingActor(gs);
        if (!pa) { assert.fail(`pendingActor=null, ale není vítěz (phase=${gs.phase}, guard=${guard})`); }
        if (!room.players[pa.idx]?.isBot) { assert.fail(`čeká se na ne-bota idx=${pa.idx}`); }
        ctx.runBotTickOnce(room);
    }
    assert.ok(gs.winner, `hra doběhla (guard=${guard}, phase=${gs.phase})`);
});

// ── B3: hra jen botů přes lobby (create_bot_game) ──────────────────────────────
test('create_bot_game vytvoří hru N botů a diváka', () => {
    const ctx = buildCtx();
    const sock = mkRealSocket('W');
    registerLobbyHandlers(sock, ctx, () => {});
    sock._fire('create_bot_game', { count: 5 });

    const room = [...ctx.rooms.values()].find(r => r.options?.botGame);
    assert.ok(room, 'botí místnost vznikla');
    assert.equal(room.players.length, 5);
    assert.ok(room.players.every(p => p.isBot));
    assert.equal(room._watcherSocketId, 'W');
    // divák dostal room_update s myIndex null
    assert.ok(sock.emits.some(e => e.ev === 'room_update' && e.payload.myIndex === null));
});

test('create_bot_game: bot select-char doběhne k vítězi a go_to_menu rozpustí místnost', () => {
    const ctx = buildCtx();
    const sock = mkRealSocket('W');
    registerLobbyHandlers(sock, ctx, () => {});
    sock._fire('create_bot_game', { count: 4 });
    const room = [...ctx.rooms.values()].find(r => r.options?.botGame);

    const guard = pumpToWinner(ctx, room);
    assert.ok(room.gameState.winner, `doběhlo (guard=${guard}, phase=${room.gameState.phase})`);

    const botIds = room.players.map(p => p.socketId);
    sock._fire('go_to_menu');
    assert.equal(ctx.rooms.has(room.id), false, 'místnost rozpuštěna');
    assert.ok(botIds.every(id => !ctx.botSockets.has(id)), 'fake sockety botů uklizeny');
});

// ── B4: zátěž – mnoho her jen botů vždy doběhne bez nouzové akce ───────────────
test('40 her jen botů (4–7) vždy doběhne bez stallu', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 40; k++) {
            const n = 4 + (k % 4);
            const gs = new GameState();
            gs.cardData = cardData;
            const room = { id: 'stress' + k, players: [], gameState: gs, maxPlayers: n, options: {} };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), {});
            // bez autoSelectAllCharacters – výběr postav řídí také policy (CHARACTER_SELECT)
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 6000, `hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci (žádný stall)');
});

test('20 her jen botů se zapnutým Dodge City vždy doběhne (zelené karty v balíčku)', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 4 + (k % 4);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            const opts = { expansions: { dodge_city: true } };
            const room = { id: 'dc' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `DC hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 6000, `DC hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani s Dodge City');
});

test('afterBroadcast naplánuje bot tick (auto-loop wiring)', () => {
    const ctx = buildCtx();
    ctx.botThinkTime = 1000;
    const room = { id: 'gx', players: [], gameState: new GameState(), maxPlayers: 4 };
    ctx.rooms.set('gx', room);
    ctx.createBot(room);
    ctx.afterBroadcast(room);
    assert.ok(room._botTick, 'tick byl naplánován');
    clearTimeout(room._botTick); room._botTick = null;
});

// ── Intro gate: bot nehraje herní akce během intra, výběr postav ano ───────────
test('scheduleBotTick: během intra herní akce počká, výběr postav běží', () => {
    const ctx = buildCtx();
    ctx.botThinkTime = 5;
    const gs = mkGame([{ role: 'Sheriff' }], { phase: 'PLAY', current: 0 });
    const room = { id: 'gi', players: [], gameState: gs, maxPlayers: 4 };
    ctx.rooms.set('gi', room);
    ctx.createBot(room, gs.players[0].name);  // bot na idx 0, na tahu

    // (1) Herní akce (PLAY) během intra → nic se nenaplánuje (počká na 'done')
    room._introPlaying = true;
    ctx.scheduleBotTick(room);
    assert.ok(!room._botTick, 'herní akce během intra se neplánuje');

    // (2) Výběr postavy během intra běží i tak
    gs.phase = 'CHARACTER_SELECT';
    gs.players[0].character = null;
    gs.players[0].charChoices = ['Bart Cassidy'];
    ctx.scheduleBotTick(room);
    assert.ok(room._botTick, 'výběr postavy běží i během intra');
    clearTimeout(room._botTick); room._botTick = null;
});

// ── Startup settle: delší pauza jen u PRVNÍ herní akce po startu ───────────────
test('scheduleBotTick: startup settle se spotřebuje až u první herní akce', () => {
    const ctx = buildCtx();
    ctx.botThinkTime = 5;
    ctx.botStartupSettle = 9999;
    const gs = mkGame([{ role: 'Sheriff' }], { phase: 'CHARACTER_SELECT', current: 0 });
    gs.players[0].character = null;
    gs.players[0].charChoices = ['Bart Cassidy'];
    const room = { id: 'gs1', players: [], gameState: gs, maxPlayers: 4 };
    ctx.rooms.set('gs1', room);
    ctx.createBot(room, gs.players[0].name);
    room._botStartupSettle = true;

    // Výběr postavy settle NESPOTŘEBUJE (není to herní akce)
    ctx.scheduleBotTick(room);
    assert.equal(room._botStartupSettle, true, 'výběr postavy settle nespotřebuje');
    clearTimeout(room._botTick); room._botTick = null;

    // První herní akce (PLAY) settle spotřebuje
    gs.phase = 'PLAY';
    gs.players[0].character = 'Bart Cassidy';
    ctx.scheduleBotTick(room);
    assert.equal(room._botStartupSettle, false, 'první herní akce settle spotřebuje');
    clearTimeout(room._botTick); room._botTick = null;
});
