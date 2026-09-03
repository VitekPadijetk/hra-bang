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
const highNoonCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.high_noon.json', 'utf8'));
const fistfulCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.fistful.json', 'utf8'));
const wwsCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.divoky_zapad.json', 'utf8'));

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
    require('../server/guard.js')(ctx);    // guard „čí je tah" – ať ho boti proberou celou hrou
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

// Počet botů se ořezává na povolený rozsah 3–8 (3 a 8 přidává Město duchů). Bez ořezu
// by pro počet mimo tabulku vrátilo rolesForPlayerCount prázdné pole a role by byly
// undefined.
test('create_bot_game ořeže počet botů na 3–8', () => {
    for (const [asked, want] of [[99, 8], [1, 3], [8, 8], [3, 3], [undefined, 4]]) {
        const ctx = buildCtx();
        const sock = mkRealSocket('W' + asked);
        registerLobbyHandlers(sock, ctx, () => {});
        sock._fire('create_bot_game', { count: asked });
        const room = [...ctx.rooms.values()].find(r => r.options?.botGame);
        assert.equal(room.maxPlayers, want, `count ${asked} → ${want}`);
        assert.equal(room.players.length, want);
    }
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
// Počty 3–8: hra pro 3 má vlastní pravidla (odkryté role, cíle v kruhu) a 8 hráčů má dva
// odpadlíky, takže obojí prochází jinými větvemi bota než klasické 4–7.
test('60 her jen botů (3–8) vždy doběhne bez stallu', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 60; k++) {
            const n = 3 + (k % 6);
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
            const n = 3 + (k % 6);
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

test('20 her jen botů se zapnutým High Noon vždy doběhne (události v každém kole)', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.highNoonCardData = highNoonCardData;
            const opts = { expansions: { high_noon: true } };
            const room = { id: 'hn' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `HN hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 6000, `HN hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani s High Noon');
});

test('20 her jen botů se všemi rozšířeními (vč. Fistfulu) vždy doběhne', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true, fistful: true },
                           highNoonExtra: true };
            const room = { id: 'ff' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 6000, `FF hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            // Obě řady událostí se opravdu odkrývaly (ne že by rozšíření bylo tiše vypnuté).
            assert.ok(gs.ffPile.length > 0 || gs.ffDeck.length === 15,
                'balíček Fistfulu se buď odkrýval, nebo hra skončila v prvním kole');
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani s Fistfulem');
});

// Úplná matice rozšíření × počty hráčů. Testy výš míří na KONKRÉTNÍ karty; tenhle hlídá,
// že se hra vůbec rozjede a doběhne v každé z osmi kombinací zapnutých rozšíření pro
// 3–8 hráčů – včetně těch, které dosud vlastní test neměly (Fistful sám, Fistful+DC,
// Fistful+HN). Nejtěsnější je 8 hráčů bez rozšíření: 8×2 nabídky = přesně 16 postav,
// tedy nulová rezerva. Zároveň se ověřuje, že zapnuté rozšíření opravdu doteklo do stavu
// (velikost obou balíčků událostí), ne že by bylo tiše vypnuté a hra „prošla" naprázdno.
test('matice rozšíření × 3–8 hráčů: každá kombinace doběhne bez stallu', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (const dodge_city of [false, true])
        for (const high_noon of [false, true])
            for (const fistful of [false, true]) COMBOS.push({ dodge_city, high_noon, fistful });

    try {
        COMBOS.forEach((exp, ci) => {
            for (let n = 3; n <= 8; n++) {
                const gs = new GameState();
                gs.cardData = cardData;
                gs.dodgeCityCardData = dodgeCityCardData;
                gs.highNoonCardData = highNoonCardData;
                gs.fistfulCardData = fistfulCardData;
                // highNoonExtra schválně vypnuté: se zapnutým Fistfulem se přibalené
                // karty přidávají samy (_hnExtraOn), což je tímhle taky pokryté.
                const opts = { expansions: { ...exp }, highNoonExtra: false };
                const tag = Object.keys(exp).filter(k => exp[k]).join('+') || 'základ';
                const room = { id: `mx${ci}_${n}`, players: [], gameState: gs, maxPlayers: n, options: opts };
                ctx.rooms.set(room.id, room);
                gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);

                // Rozšíření opravdu doteklo do stavu (jinak by test „procházel" naprázdno).
                assert.equal(gs.ffDeck.length, exp.fistful ? 15 : 0, `${tag} (${n}p): balíček Fistfulu`);
                assert.equal(gs.eventDeck.length, exp.high_noon ? (exp.fistful ? 15 : 13) : 0,
                    `${tag} (${n}p): balíček High Noon (s Fistfulem i přibalené karty)`);

                gs.players.forEach(p => ctx.createBot(room, p.name));
                const guard = pumpToWinner(ctx, room);
                assert.ok(gs.winner, `${tag} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
                assert.ok(guard < 8000, `${tag} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            }
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci v žádné kombinaci');
});

// Divoký západ (třetí balíček událostí) je nezávislý na ostatních dvou a otáčí se jinak
// (Dostavníkem / Wells Fargem, tedy kdykoli uprostřed cizí fáze 2). Matici výš se kvůli
// době běhu nezdvojnásobuje – tenhle test místo toho projede rozšíření samotné pro 3–8
// hráčů a k tomu obě mezní kombinace se všemi třemi balíčky naráz.
test('Divoký západ: hra jen botů doběhne sama i vedle obou ostatních balíčků', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, all: false });
    COMBOS.push({ n: 4, all: true }, { n: 7, all: true });

    let flipped = 0;
    try {
        COMBOS.forEach(({ n, all }, ci) => {
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: all, high_noon: all, fistful: all,
                                         divoky_zapad: true } };
            const tag = `${all ? 'vše' : 'jen DZ'} (${n}p)`;
            const room = { id: `wws${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            assert.equal(gs.wwsDeck.length, 10, `${tag}: balíček Divokého západu`);
            assert.equal(gs.activeWws, null, `${tag}: na začátku hry žádná událost neplatí`);

            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.wwsPile.length) flipped++;
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci');
    assert.ok(flipped > 0, 'aspoň v jedné hře někdo zahrál Dostavník / Wells Fargo a otočil kartu');
});

// Cílená zátěž na fázi 2 Fistfulu: v balíčku jsou JEN Léčka, Laso a Soudce, takže platí
// po celou partii. Právě tady hrozí, že bot bude posílat akci, kterou server odmítne
// (aktivace zelené karty nebo obrana zelenou Vedle! pod Lasem, vyložení modré pod
// Soudcem) – stav se nezmění, bot pošle totéž znovu a hra se zastaví.
test('20 her jen botů jede i s balíčkem samých Léček/Las/Soudců', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ffEv = (key) => {
        const c = fistfulCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: false, fistful: true } };
            const room = { id: 'ff2_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" zůstává na indexu 0.
            const deck = [ffEv('FISTFUL_OF_CARDS')];
            for (let i = 0; i < 12; i++) deck.push(ffEv(['LECKA', 'LASO', 'SOUDCE'][i % 3]));
            gs.ffDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF2 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `FF2 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.ffPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 15, `události se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u Léčky/Lasa/Soudce');
});

// Cílená zátěž na fázi 3 Fistfulu: v balíčku jsou JEN Pálenka a Právo západu. Právo
// západu je nejrizikovější karta rozšíření – server odmítá ukončit tah, dokud hráč
// nezahraje odkrytou kartu, takže každý rozchod mezi lawForcedCard (tryEndTurn) a botem
// znamená nekonečné posílání end_turn. Běží spolu se Želízky z High Noonu, které do
// hratelnosti karet mluví taky.
test('20 her jen botů jede i s balíčkem samých Pálenek a Práv západu', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ffEv = (key) => {
        const c = fistfulCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true, fistful: true },
                           highNoonExtra: true };
            const room = { id: 'ff3_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" zůstává na indexu 0.
            const deck = [ffEv('FISTFUL_OF_CARDS')];
            for (let i = 0; i < 12; i++) deck.push(ffEv(i % 2 ? 'PALENKA' : 'PRAVO_ZAPADU'));
            gs.ffDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF3 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `FF3 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.ffPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 15, `události se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u Pálenky/Práva západu');
});

// Cílená zátěž na fázi 4 Fistfulu: v balíčku jsou JEN Peyote a Ranč. Obě přidávají novou
// fázi mezi lízání a hraní (PEYOTE, RANCH) – kdyby pro ně policy neměla větev, bot by
// nevrátil žádnou akci a hra jen botů by se zastavila. Peyote navíc umí natáhnout fázi
// lízání na libovolně mnoho karet, takže test hlídá i to, že hra nezdegeneruje do délky.
test('20 her jen botů jede i s balíčkem samých Peyote a Rančů', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ffEv = (key) => {
        const c = fistfulCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true, fistful: true },
                           highNoonExtra: true };
            const room = { id: 'ff4_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod“ zůstává na indexu 0.
            const deck = [ffEv('FISTFUL_OF_CARDS')];
            for (let i = 0; i < 12; i++) deck.push(ffEv(i % 2 ? 'PEYOTE' : 'RANC'));
            gs.ffDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF4 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `FF4 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.ffPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 15, `události se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u Peyote/Ranče');
});

// Cílená zátěž na fázi 5 Fistfulu: v balíčku je JEN Opuštěný důl. Prohodí dobírací
// balíček s odhozem pro úplně všechno (lízání, kontrolní sejmutí, hokynářství, odměny,
// pozůstalost vyřazeného), takže se tady projeví každá cesta, která si na hromádku sáhla
// mimo trychtýř draw()/discard(). Hlídá se i to, že se hra na došlém odhozu nezasekne:
// důl se má sám vypnout a dohrát klasicky.
test('20 her jen botů jede i s balíčkem samých Opuštěných dolů', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ffEv = (key) => {
        const c = fistfulCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0, mined = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true, fistful: true },
                           highNoonExtra: true };
            const room = { id: 'ff5_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" zůstává na indexu 0.
            const deck = [ffEv('FISTFUL_OF_CARDS')];
            for (let i = 0; i < 12; i++) deck.push(ffEv('OPUSTENY_DUL'));
            gs.ffDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF5 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `FF5 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.ffPile.length) flipped++;
            if (gs.ffPile.some(c => c.key === 'OPUSTENY_DUL')) mined++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 15, `události se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.ok(mined >= 15, `Opuštěný důl se opravdu hrál (jen ${mined} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u Opuštěného dolu');
});

// Cílená zátěž na fázi 6 Fistfulu: v balíčku jsou JEN Pokrevní bratři, Mrtvý muž
// a Fistful of Cards. Všechny tři sahají do startu tahu: Pokrevní bratři přidávají
// novou fázi (BLOOD_BROTHERS – bez větve v policy by se hra zastavila), Fistful of
// Cards posílá sérii zásahů bez útočníka (každý přes RESPOND, mezi nimi fronta
// odložených akcí) a Mrtvý muž vrací vyřazeného hráče zpátky do pořadí tahů.
test('20 her jen botů jede i s balíčkem samých Pokrevních bratrů/Mrtvých mužů', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ffEv = (key) => {
        const c = fistfulCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0, returned = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true, fistful: true },
                           highNoonExtra: true };
            const room = { id: 'ff6_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" zůstává na indexu 0.
            const deck = [ffEv('FISTFUL_OF_CARDS')];
            for (let i = 0; i < 12; i++) deck.push(ffEv(['POKREVNI_BRATRI', 'MRTVY_MUZ', 'FISTFUL_OF_CARDS'][i % 3]));
            gs.ffDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF6 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `FF6 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.ffPile.length) flipped++;
            if (gs._deadManUsed) returned++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 15, `události se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.ok(returned >= 5, `Mrtvý muž se opravdu vracel (jen ${returned} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u fáze 6');
});

test('20 her jen botů s High Noon + Dodge City zároveň vždy doběhne', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true }, highNoonExtra: false };
            const room = { id: 'both' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `HN+DC hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 6000, `HN+DC hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani s oběma rozšířeními');
});

// Cílená zátěž na fázi 7 Fistfulu: v balíčku jsou JEN Ruská ruleta a Vendeta. Obě sahají
// mimo běžný tah – ruleta má vlastní fázi mimo pořadí (chybějící větev bota = zaseknutá
// hra) a Vendeta vrací TÉHOŽ hráče do dalšího tahu, takže se snadno rozejde krokovač
// startu tahu. Běží spolu s High Noonem, jehož Město duchů i Zlatá horečka do pořadí
// tahů mluví taky.
test('20 her jen botů jede i s balíčkem samých Ruských ruletí a Vendet', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ffEv = (key) => {
        const c = fistfulCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true, fistful: true },
                           highNoonExtra: true };
            const room = { id: 'ff7_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" zůstává na indexu 0.
            const deck = [ffEv('FISTFUL_OF_CARDS')];
            for (let i = 0; i < 12; i++) deck.push(ffEv(i % 2 ? 'RUSKA_RULETA' : 'VENDETA'));
            gs.ffDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF7 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `FF7 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.ffPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 15, `události se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u fáze 7');
});

// Cílená zátěž na fázi 8 Fistfulu: v balíčku jsou JEN Odstřelovač a Odražená střela.
// Obě mění, co smí bot s kartou Bang! udělat – Odstřelovač jde přes fázi DISCARD_ANOTHER
// (cenou MUSÍ být druhá karta Bang!, jinak server klik ignoruje) a Odražená střela dělá
// z karty Bang! hratelnou kartu i s vyčerpaným limitem, což je přesně to, na čem se
// klient/bot a server můžou rozejít = zaseknutá hra.
test('20 her jen botů jede i s balíčkem samých Odstřelovačů a Odražených střel', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ffEv = (key) => {
        const c = fistfulCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true, fistful: true },
                           highNoonExtra: true };
            const room = { id: 'ff8_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" zůstává na indexu 0.
            const deck = [ffEv('FISTFUL_OF_CARDS')];
            for (let i = 0; i < 12; i++) deck.push(ffEv(i % 2 ? 'ODSTRELOVAC' : 'ODRAZENA_STRELA'));
            gs.ffDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `FF8 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `FF8 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.ffPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 15, `události se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u fáze 8');
});

// Cílená zátěž na Zúčtování (Divoký západ, fáze 2): pod ním je jako Bang! hratelná
// KAŽDÁ karta v ruce a jako Vedle! každá karta Bang!. Tím se rozšiřuje výčet, který se
// musí shodovat na serveru, u klienta i u bota (playsAsBang/playsAsMissed) – rozejít se
// nesmí, jinak server akci mlčky odmítne a bot ji posílá donekonečna.
test('20 her jen botů jede i s balíčkem samých Zúčtování', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'wws2_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" (Divoký západ) zůstává na indexu 0.
            const deck = [wwsEv('DIVOKY_ZAPAD')];
            for (let i = 0; i < 12; i++) deck.push(wwsEv('ZUCTOVANI'));
            gs.wwsDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `WWS2 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS2 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.wwsPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `Zúčtování se opravdu odkrývalo (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani pod Zúčtováním');
});

test('20 her jen botů jede i s balíčkem samých Miláčků Valentýnů a Madam Zuzan', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'wws3_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" (Divoký západ) zůstává na indexu 0.
            const deck = [wwsEv('DIVOKY_ZAPAD')];
            for (let i = 0; i < 12; i++) deck.push(wwsEv(i % 2 ? 'MADAM_ZUZANA' : 'MILACEK_VALENTYN'));
            gs.wwsDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `WWS3 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS3 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.wwsPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `karty se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci');
});

// Sacagaway mění REDAKCI stavu, ne pravidla – bot čte gameState napřímo, takže mu
// nesmí nic přidat ani vzít. Zároveň se pod ní na každé krádeži z ruky drží boti o
// gesto z FAQ Q17 (holdForSacaSteal), takže se hra nesmí zpomalit do patologie.
test('20 her jen botů jede i s balíčkem samých Sacagaway', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'wws4_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" (Divoký západ) zůstává na indexu 0.
            const deck = [wwsEv('DIVOKY_ZAPAD')];
            for (let i = 0; i < 12; i++) deck.push(wwsEv('SACAGAWAY'));
            gs.wwsDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `WWS4 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS4 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.wwsPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `Sacagaway se opravdu odkrývala (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani pod Sacagaway');
});

// Lady Růže z Texasu je riziková jinak než ostatní: neposouvá stav dopředu, ale MĚNÍ
// SEDADLA. Kdyby se na některém indexovém poli zapomnělo, hra by se rozjela za špatného
// hráče; a bez pojistky „nikdo nepřijde o dva tahy za sebou" (`_roseSkippedLast`) se
// stůl střídá v tom, koho přeskočí, a hra neskončí NIKDY.
test('20 her jen botů jede i s balíčkem samých Lady Růží (a nepřesedávají donekonečna)', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'wws7_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            const deck = [wwsEv('DIVOKY_ZAPAD')];
            for (let i = 0; i < 12; i++) deck.push(wwsEv('LADY_RUZE_Z_TEXASU'));
            gs.wwsDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `WWS7 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS7 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            // Sedadlo je index a `room.players` ho drzí ve stejném pořadí jako `gs.players`
            // (tudy chodí myIndex do klienta). Kdyby výměna prohodila jen jedno z nich,
            // viděli by oba hráči desku očima toho druhého – a guard by jim akce zahazoval.
            assert.equal(new Set(gs.players.map(p => p.name)).size, n,
                         `WWS7 hra #${k}: výměna sedadel nikoho neztratila ani nezdvojila`);
            room.players.forEach((rp, i) => assert.equal(gs.players[i].name, rp.name,
                         `WWS7 hra #${k}: sedadlo #${i} sedí v room.players i v gs.players`));
            if (gs.wwsPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `Lady Růže se opravdu odkrývala (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani pod Lady Růží');
});

// Zuřivá Doroty je pravidlově nejdivčejší karta rozšíření: na dobu jedné karty se
// PROHODÍ, kdo je na tahu (poručený zahraje kartu „jako by byl na tahu"). Kdyby se
// sedadlo nevrátilo, čekala by fáze PLAY na špatného hráče – ten by tah ukončit
// nesměl a hra jen botů by zamrzla. K tomu strop poručení za tah: neúspěšné poručení
// (poručený kartu nemá) stav nezmení, takže bez stropu by ho bot posílal donekonečna.
test('20 her jen botů jede i s balíčkem samých Zuřivých Doroty', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0, commanded = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: k % 2 === 0, high_noon: k % 3 === 0,
                                         fistful: k % 4 === 0, divoky_zapad: true } };
            const room = { id: 'wws12_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            const deck = [wwsEv('DIVOKY_ZAPAD')];
            for (let i = 0; i < 12; i++) deck.push(wwsEv('ZURIVA_DOROTY'));
            gs.wwsDeck = deck;
            // Kolik poručení za hru padlo (ať test opravdu testuje kartu, ne prázdno).
            const origEvent = gs._onEvent;
            gs._onEvent = (e) => { if (e && e.card === 'Zuřivá Doroty') commanded++; if (origEvent) origEvent(e); };
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `WWS12 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS12 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            // Vypůjčené sedadlo se vždycky vrátí – na konci hry po něm nesmí zbýt stopa.
            assert.equal(gs._dorothyOwnerIdx, null, `WWS12 hra #${k}: sedadlo se vrátilo`);
            if (gs.wwsPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `Zuřivá Doroty se opravdu odkrývala (jen ${flipped} z 20 her)`);
    assert.ok(commanded > 0, 'bot kartu opravdu použil (jinak test nic netestuje)');
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani pod Zuřivou Doroty');
});

// Hřbitov je nejrizikovější karta rozšíření pro zaseknutí: vyřazení hráči se v pořadí
// NEPŘESKAKUJÍ a vracejí se do hry, takže by se stůl teoreticky nemusel nikdy vyprázdnit.
// Výhra se ale vyhodnocuje v okamžiku vyřazení (dřív, než Hřbitov kohokoli vrátí), takže
// hra doběhne. Helena Zontero k tomu přerozdává role živých – bot musí přežít i to, že
// se mu uprostřed hry změní role pod rukama (ledger se resetuje, dedukce začíná od nuly).
test('20 her jen botů jede i s balíčkem samých Hřbitovů a Helen Zontero', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'wws5_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → karta „vespod" (Divoký západ) zůstává na indexu 0.
            const deck = [wwsEv('DIVOKY_ZAPAD')];
            for (let i = 0; i < 12; i++) deck.push(wwsEv(i % 2 ? 'HELENA_ZONTERO' : 'HRBITOV'));
            gs.wwsDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `WWS5 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS5 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.wwsPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `karty se opravdu odkrývaly (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani pod Hřbitovem');
});

// Karta „Divoký západ“ (ta vespod balíčku) je pro bota nejrizikovější: přepisuje podmínku
// výhry na „zůstaň poslední ve hře“, takže přestává platit dělení na strany. Bez větve
// `lastManStanding` v roleHostility (core/beliefs.js) by strana šerifa v koncovce jen lízala
// a odhazovala – spojenec podle role není nepřítel – a hra by nikdy nedoběhla.
// Divoký západ – Roubík: promluvení stojí 1 život, a boti od fáze 9 do chatu opravdu
// mluví (core/botChat.js). Hra jen botů tedy musí doběhnout i tehdy, když si k zásahům
// od spoluhráčů přidávají pokuty za vlastní hlášky – a nikdo se přitom nesmí upovídat
// k smrti (bot na 1 životě pod Roubíkem mlčí). Hlášky se pouštějí ručně: broadcasty jsou
// v buildCtx no-op, takže by se hák `beforeBroadcast` (a s ním flushBotQuips) nespustil.
test('20 her jen botů jede i s balíčkem samých Roubíků (a nikdo se neupovídá k smrti)', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0, quips = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'wws7_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            const deck = [wwsEv('DIVOKY_ZAPAD')];
            for (let i = 0; i < 12; i++) deck.push(wwsEv('ROUBIK'));
            gs.wwsDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            let guard = 0;
            while (!gs.winner && guard++ < 8000) {
                const pa = pendingActor(gs);
                if (!pa || !room.players[pa.idx]?.isBot) break;
                ctx.runBotTickOnce(room);
                ctx.flushBotQuips(room);          // zastupuje hák beforeBroadcast
            }
            quips += Object.keys(room._quipTurn || {}).length;
            assert.ok(gs.winner, `WWS7 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS7 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            // Nikdo nesmí ležet s nevybranou pokutou – ta by se ztratila i s tím, že mluvil.
            assert.ok(!(gs._gagPending || []).length || gs.winner, `WWS7 hra #${k}: pokuta nezůstala viset`);
            if (gs.wwsPile.length) flipped++;
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `Roubík se opravdu odkrýval (jen ${flipped} z 20 her)`);
    assert.ok(quips > 0, 'boti se opravdu ozvali (jinak by test Roubík vůbec neprověřil)');
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani pod Roubíkem');
});

test('20 her jen botů jede i s balíčkem samých Divokých západů', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const wwsEv = (key) => {
        const c = wwsCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    let flipped = 0;
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'wws6_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Samé Divoké západy: první Dostavník kartu odkryje a už se nevymění.
            gs.wwsDeck = new Array(13).fill(0).map(() => wwsEv('DIVOKY_ZAPAD'));
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `WWS6 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `WWS6 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            if (gs.wwsPile.length) {
                flipped++;
                // Pod kartou vyhrává JEDEN hráč, a to jménem – ne strana.
                const alive = gs.players.filter(p => p.health > 0 || p._ghost);
                assert.equal(alive.length, 1, `WWS6 hra #${k}: zůstal jediný živý`);
                assert.equal(gs.winner, `${alive[0].name} vyhrál!`, `WWS6 hra #${k}: výhra je jmenná`);
            }
        }
    } finally { ctx.glog.system = origSystem; }
    assert.ok(flipped >= 10, `Divoký západ se opravdu odkrýval (jen ${flipped} z 20 her)`);
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani pod Divokým západem');
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

// ── Divoký západ – přerozdané role: hra čeká, až každý svou novou roli potvrdí ─
// Vzor je intro gate výš. Bot potvrzuje sám (jinak by hra čekala sama na sebe),
// člověk klikem na OK (role_peek_ok, server/handlers.characters.js).
test('scheduleBotTick: potvrzení přerozdané role drží hru, bot ho vyřídí sám', () => {
    const ctx = buildCtx();
    ctx.botThinkTime = 5;
    const gs = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'PLAY', current: 0 });
    const room = { id: 'rp1', players: [], gameState: gs, maxPlayers: 4 };
    ctx.rooms.set('rp1', room);
    ctx.createBot(room, gs.players[0].name);
    ctx.createBot(room, gs.players[1].name);

    // (1) Bez čekajícího potvrzení se hraje normálně.
    ctx.scheduleBotTick(room);
    assert.ok(room._botTick, 'bez potvrzování hra běží');
    clearTimeout(room._botTick); room._botTick = null;

    // (2) Čeká se na potvrzení SEATU BEZ BOTA → herní akce se neplánuje vůbec.
    room._rolePeekConfirm = new Set([5]);
    ctx.scheduleBotTick(room);
    assert.ok(!room._botTick, 'dokud nepotvrdí lidé, bot nehraje');

    // (3) Čeká-li se na bota, tick projde – runBotTickOnce ho vyřídí dřív než tah.
    room._rolePeekConfirm = new Set([0, 1]);
    ctx.scheduleBotTick(room);
    assert.ok(room._botTick, 'potvrzení bota projde i přes gate');
    clearTimeout(room._botTick); room._botTick = null;

    // (4) A doopravdy ho odešle – po ticku je čekání prázdné a hra se rozjede.
    ctx.runBotTickOnce(room);
    assert.equal(room._rolePeekConfirm, null, 'boti potvrdili, gate padl');
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

// ── Intro gate: potvrzení role musí projít, i když je fáze už herní ────────────
// Boti si postavu vybírají hned po startu, takže než se rozdají role, je fáze často
// už DRAW. Bez výjimky by se tick zahodil, boti by roli nikdy nepotvrdili a intro
// by uvázlo napořád na await_role_ok.
test('scheduleBotTick: potvrzení role během intra projde i při herní fázi', () => {
    const ctx = buildCtx();
    ctx.botThinkTime = 5;
    const gs = mkGame([{ role: 'Sheriff' }], { phase: 'DRAW', current: 0 });
    gs.drawPhaseState = { active: true, playerIdx: 0, cardsDrawn: 0 };
    const room = { id: 'gi1', players: [], gameState: gs, maxPlayers: 4 };
    ctx.rooms.set('gi1', room);
    ctx.createBot(room, gs.players[0].name);
    room._introPlaying = true;

    // (1) Bez čekajícího potvrzení se herní akce během intra neplánuje
    ctx.scheduleBotTick(room);
    assert.ok(!room._botTick, 'herní akce během intra se neplánuje');

    // (2) S čekajícím potvrzením role tick projde (runBotTickOnce ho vyřídí první)
    room._introRoleConfirmed = new Set();
    ctx.scheduleBotTick(room);
    assert.ok(room._botTick, 'potvrzení role projde i přes intro gate');
    clearTimeout(room._botTick); room._botTick = null;

    // (3) Jakmile bot potvrdil, gate zase platí
    room._introRoleConfirmed = new Set([0]);
    ctx.scheduleBotTick(room);
    assert.ok(!room._botTick, 'po potvrzení se herní akce zase odloží');
});

// Cílená zátěž na etapu 3: balíček událostí obsahuje JEN Daltonové / Kocovinu /
// Zlatou horečku (vespod Pravé poledne), takže se všechny tři odehrají v každé hře.
// Náhodný balíček je pustí jen občas – tady se hlídá, že ani jedna nezasekne bota
// (Daltonové vybírají kartu za KAŽDÉHO hráče, Kocovina ruší schopnosti, Zlatá horečka
// obrací směr hry, tedy i podmínku „tah se posouvá").
test('20 her jen botů jede i s balíčkem samých Daltonů/Kocovin/Zlatých horeček', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const KEYS = ['DALTONOVE', 'KOCOVINA', 'ZLATA_HORECKA'];
    const ev = (key) => {
        const c = highNoonCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            const opts = { expansions: { dodge_city: true, high_noon: true } };
            const room = { id: 'hn3_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → Pravé poledne musí zůstat na indexu 0.
            const deck = [ev('PRAVE_POLEDNE')];
            for (let i = 0; i < 12; i++) deck.push(ev(KEYS[(i + k) % 3]));
            gs.eventDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `HN3 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `HN3 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u Daltonů/Kocoviny/Zlaté horečky');
});

// Cílená zátěž na etapu 4: v balíčku je JEN Město duchů (vespod Pravé poledne), takže
// se vyřazení hráči vracejí do hry po celý zbytek partie. Hlídá se, že hra pořád dojde
// k vítězi – duch má 0 životů, nemůže umřít a na konci tahu ze hry zase odchází, takže
// právě tady hrozí, že se tah přestane posouvat nebo že se výhra nikdy nevyhodnotí.
test('20 her jen botů jede i s balíčkem samých Měst duchů', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const ev = (key) => {
        const c = highNoonCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            const opts = { expansions: { dodge_city: k % 2 === 0, high_noon: true } };
            const room = { id: 'hn4_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → Pravé poledne musí zůstat na indexu 0.
            const deck = [ev('PRAVE_POLEDNE')];
            for (let i = 0; i < 12; i++) deck.push(ev('MESTO_DUCHU'));
            gs.eventDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `HN4 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `HN4 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
            // Duch smí zůstat označený jen tehdy, když hra skončila přímo v jeho tahu.
            const ghosts = gs.players.filter(p => p._ghost);
            assert.ok(ghosts.length === 0 || (ghosts.length === 1 && gs.players[gs.currentPlayerIndex]._ghost),
                `HN4 hra #${k}: po hře nezůstal viset duch mimo svůj tah`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u Města duchů');
});

// Cílená zátěž na etapu 5: balíček obsahuje JEN přibalené karty (Želízka / Nová
// identita), takže se obě odehrají v každé hře. Želízka omezují, co smí bot zahrát
// (musí mu vždy zbýt legální akce = ukončit tah), Nová identita přidává rozhodovací
// fázi na začátku tahu – obojí je typický kandidát na zaseknutí hry jen botů.
test('20 her jen botů jede i s balíčkem samých Želízek/Nových identit', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const KEYS = ['ZELIZKA', 'NOVA_IDENTITA'];
    const ev = (key) => {
        const c = highNoonCardData.find(x => x.key === key);
        return { id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null };
    };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            const opts = { expansions: { dodge_city: k % 2 === 0, high_noon: true }, highNoonExtra: true };
            const room = { id: 'hn5_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Líže se pop() z konce → Pravé poledne musí zůstat na indexu 0.
            const deck = [ev('PRAVE_POLEDNE')];
            for (let i = 0; i < 12; i++) deck.push(ev(KEYS[(i + k) % 2]));
            gs.eventDeck = deck;
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `HN5 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `HN5 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani u Želízek/Nové identity');
});

test('přibalené karty: každý hráč dostane druhou postavu, a jinou než hraje', () => {
    const ctx = buildCtx();
    const gs = new GameState();
    gs.cardData = cardData;
    gs.highNoonCardData = highNoonCardData;
    const opts = { expansions: { high_noon: true }, highNoonExtra: true };
    const room = { id: 'ni1', players: [], gameState: gs, maxPlayers: 4, options: opts };
    ctx.rooms.set(room.id, room);
    gs.setupGame(4, ['B0', 'B1', 'B2', 'B3'], opts);
    gs.players.forEach(p => ctx.createBot(room, p.name));
    // Postavy si boti vyberou v prvních ticích; pak už musí být druhé identity rozdané.
    for (let i = 0; i < 40 && gs.players.some(p => !p.character); i++) ctx.runBotTickOnce(room);
    assert.ok(gs.players.every(p => p.character), 'všichni mají postavu');
    const second = gs.players.map(p => p._secondChar);
    assert.ok(second.every(Boolean), 'všichni mají odloženou druhou postavu');
    assert.equal(new Set(second).size, 4, 'druhé postavy se neopakují');
    gs.players.forEach(p => assert.notEqual(p._secondChar, p.character));
});

// Teren Kill pozastavuje VYŘAZENÍ – jediný trychtýř, kterým prochází každá smrt ve hře.
// Náhodně vylosovaný by se do zátěže dostal jen občas, takže ho tady dostane každý:
// každá jednotlivá smrt v partii pak jde přes sejmutí (fronta → CHECK_DRAW → CHECKING),
// a hra to musí ustát ze všech stran (Bang!, hromadné útoky, dynamit, Pravé poledne,
// Ruská ruleta, Fistful of Cards) i s tím, že se vyřazený hráč nakonec vrátí do hry.
test('20 her jen botů, ve kterých jsou VŠICHNI Teren Kill', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'terenk' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Výběr postav ještě neproběhl (dělají ho boti) → stačí přepsat nabídku.
            gs.players.forEach(p => { p.charChoices = ['Teren Kill', 'Teren Kill']; });
            gs.players.forEach(p => ctx.createBot(room, p.name));
            // Nejdřív jen výběr postav – dál by Nová identita (High Noon) postavu vyměnila.
            for (let g = 0; g < 50 && gs.phase === 'CHARACTER_SELECT'; g++) ctx.runBotTickOnce(room);
            assert.ok(gs.players.every(pl => pl.character === 'Teren Kill'),
                `TK hra #${k}: všichni opravdu dostali Terena`);
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `TK hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `TK hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani se samými Tereny');
});

// ── Divoký západ: stůl samých Greygoryů Decků ──────────────────────────────
// Nejtvrdší případ poolu postav (R12): osm hráčů × 2 líznuté karty = přesně 16 postav
// základní hry, takže se pool vyprázdní a někdo skončí tah BEZ schopnosti. „Smůla" je
// legální stav a nesmí zaseknout ani nabídku, ani fázi lízání – a s Novou identitou
// (přibalené karty High Noonu) ubývají karty z téhož balíčku ještě rychleji.
test('20 her jen botů, ve kterých jsou VŠICHNI Greygory Deck', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    try {
        for (let k = 0; k < 20; k++) {
            const n = 3 + (k % 6);
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            const opts = { expansions: { dodge_city: true, high_noon: k % 2 === 0,
                                         fistful: k % 3 === 0, divoky_zapad: true } };
            const room = { id: 'greyg' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => { p.charChoices = ['Greygory Deck', 'Greygory Deck']; });
            gs.players.forEach(p => ctx.createBot(room, p.name));
            for (let g = 0; g < 50 && gs.phase === 'CHARACTER_SELECT'; g++) ctx.runBotTickOnce(room);
            assert.ok(gs.players.every(pl => pl.character === 'Greygory Deck'),
                `GD hra #${k}: všichni opravdu dostali Greygoryho`);
            // Dvojice se rozdaly hned na začátku hry a nikdo nedrží tutéž kartu dvakrát.
            const held = gs.players.flatMap(pl => pl._greygoryChars || []);
            assert.equal(new Set(held).size, held.length, `GD hra #${k}: karty postav se nesmí zdvojit`);
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `GD hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `GD hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci ani se samými Greygory');
});
