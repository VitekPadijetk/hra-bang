const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState } = require('../logic.js');
const installAnimService = require('../server/anim.js');
const installLifecycle = require('../server/lifecycle.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));

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

// ── anim ────────────────────────────────────────────────────────────────────
test('emitAnim pošle card_animation hráčům i divákům', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0');
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const room = { id: 'g1', players: [{ socketId: 's0' }] };
    ctx.emitAnim(room, { type: 'draw', playerIdx: 0 });
    assert.ok(emits.some(e => e.scope === 'socket:s0' && e.ev === 'card_animation'));
    assert.ok(emits.some(e => e.scope === 'to:g1_spectators' && e.ev === 'card_animation'));
});

test('emitDeathAnim: bez Vulture Sama pošle player_death_discard', () => {
    const { io, emits } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Willy the Kid', health: 4 }],
        _deathAnimData: { 0: { blue: [], weapon: null, hand: [] } } };
    ctx.emitDeathAnim({ id: 'g1', players: [] }, gs, 0);
    const a = emits.find(e => e.ev === 'card_animation');
    assert.equal(a.payload.type, 'player_death_discard');
});

test('emitDeathAnim: bez dat (už odeslané) neemituje nic – žádný falešný Colt fade-out', () => {
    const { io, emits } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Willy the Kid', health: 4 }] };
    ctx.emitDeathAnim({ id: 'g1', players: [] }, gs, 0);
    assert.equal(emits.find(e => e.ev === 'card_animation'), undefined);
});

test('emitDeathAnim: s živým Vulture Samem pošle vulture_sam_steal', () => {
    const { io, emits } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Vulture Sam', health: 3 }],
        _deathAnimData: { 0: { blue: [], weapon: null, hand: [] } } };
    ctx.emitDeathAnim({ id: 'g1', players: [] }, gs, 0);
    const a = emits.find(e => e.ev === 'card_animation');
    assert.equal(a.payload.type, 'vulture_sam_steal');
    assert.equal(a.payload.toPlayerIdx, 1);
});

test('emitDeathAnim nastaví _deathBlockUntil na délku celé cinematiky (boti čekají)', () => {
    const { io } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    const { deathSequenceMs } = require('../core/deathAnim.js');
    const gs = { players: [{ character: 'Bart Cassidy', health: 0 }, { character: 'Willy the Kid', health: 4 }],
        _deathAnimData: { 0: { blue: [{ id: 1 }], weapon: { id: 2 }, hand: [{ id: 3 }, { id: 4 }] } } };
    const room = { id: 'g1', players: [] };
    const t0 = Date.now();
    ctx.emitDeathAnim(room, gs, 0);
    // 1 modrá + zbraň/Colt (vždy jedna položka) + 2 z ruky = 4 karty
    const want = deathSequenceMs(4);
    assert.ok(room._deathBlockUntil >= t0 + want, 'bot nesmí hrát dřív, než cinematika doběhne');
    assert.ok(room._deathBlockUntil <= Date.now() + want);
});

test('handleAutoEndTurn zavolá nextTurn jen když je pending a není vítěz', () => {
    const { io } = mkIo();
    const ctx = { io, broadcastRoomDelayed() {} };
    installAnimService(ctx);
    let turns = 0;
    const gs = { _autoEndTurnPending: true, winner: null, players: [], nextTurn() { turns++; } };
    ctx.handleAutoEndTurn({ id: 'g1', players: [] }, gs);
    assert.equal(turns, 1);
    assert.equal(gs._autoEndTurnPending, false);
    // podruhé už nic (pending zhasl)
    ctx.handleAutoEndTurn({ id: 'g1', players: [] }, gs);
    assert.equal(turns, 1);
});

test('handleReshuffleAndBroadcast bez reshuffle jen odloženě broadcastuje', () => {
    const { io } = mkIo();
    let delayed = 0;
    const ctx = { io, broadcastRoomDelayed() { delayed++; } };
    installAnimService(ctx);
    const gs = { deck: { _reshuffleOccurred: false, discardPile: [] } };
    ctx.handleReshuffleAndBroadcast({ id: 'g1', players: [] }, gs, 0);
    assert.equal(delayed, 1);
});

// ── lifecycle ─────────────────────────────────────────────────────────────────
function mkLifecycleCtx() {
    const calls = { broadcastRoom: 0, broadcastLobbyList: 0, intro: 0 };
    const ctx = {
        cardData, GameState,
        broadcastRoom() { calls.broadcastRoom++; },
        broadcastLobbyList() { calls.broadcastLobbyList++; },
        emitIntro() { calls.intro++; },
        runIntroSequence() { calls.intro++; },
        // No-op herní log (v produkci ho instaluje server/gamelog.js; tady jen ať nepadne).
        glog: { openGame() {}, closeGame() {}, action() {}, rule() {}, snapshot() {},
                system() {}, error() {}, clientLog() {}, actorLabel: () => '' },
    };
    installLifecycle(ctx);
    return { ctx, calls };
}

test('startGame v singleChar módu rozdá postavy a přeskočí intro', () => {
    const { ctx } = mkLifecycleCtx();
    const room = {
        maxPlayers: 3,
        options: { singleChar: true },
        gameState: new GameState(),
        players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    };
    ctx.startGame(room);
    assert.equal(room.gameState.players.length, 3);
    assert.ok(room.gameState.players.every(p => p.character));
    assert.equal(room.phase, 'playing'); // všichni vybráni → hra běží, ne char_select
});

// Bug 33: High Noon – Město duchů. Duch je „ve hře" jen po dobu svého tahu, pořád je
// to ale vyřazený hráč. Skončí-li hra zrovna v jeho tahu (a on si přitom stihl naléčit
// životy), přeživší to z něj nedělá – postavu do navazující hry si nenechává.
test('startNextGame: duch (Město duchů) není přeživší, postavu si nenechá', () => {
    const { ctx } = mkLifecycleCtx();
    const room = {
        id: 'g1', maxPlayers: 4,
        options: { botGame: true },   // intro se přeskakuje (jen broadcast a konec)
        players: [{ name: 'A', wasOriginalSurvivor: true }, { name: 'B', wasOriginalSurvivor: true },
                  { name: 'C', wasOriginalSurvivor: true }, { name: 'D', wasOriginalSurvivor: true }],
        gameState: { players: [
            { name: 'A', character: 'Bart Cassidy', health: 2, _ghost: true },   // duch, naléčený
            { name: 'B', character: 'Willy the Kid', health: 3 },
            { name: 'C', character: 'Suzy Lafayette', health: 0 },
            { name: 'D', character: 'Slab the Killer', health: 0, _ghost: true },  // duch bez léčení
        ] },
    };
    ctx.startNextGame(room);
    const np = room.gameState.players;
    assert.equal(np[0]._survivorChar, undefined, 'duch s naléčenými životy přeživší není');
    assert.equal(np[1]._survivorChar, 'Willy the Kid', 'živý hráč postavu drží');
    assert.equal(np[2]._survivorChar, undefined);
    assert.equal(np[3]._survivorChar, undefined);
    assert.equal(np.filter(p => p._awaitingKeepChoice).length, 1, 'na volbu čeká jen skutečně živý');
});

// ── Rozšíření High Noon: odkrytí karty události ──────────────────────────────
test('beforeBroadcast pošle high_noon_reveal a podrží boty na dobu cinematiky', () => {
    const { io, addSocket, emits } = mkIo();
    addSocket('s0');
    const ctx = { io, broadcastRoomDelayed() {} };
    require('../server/anim.js')(ctx);
    const room = {
        id: 'g1',
        players: [{ socketId: 's0', playerIdx: 0 }],
        gameState: {
            currentPlayerIndex: 2,
            _pendingHighNoonReveal: { id: 300, key: 'KAZATEL', name: 'Kazatel', art: 'kazatel', remaining: 12 },
        },
    };
    ctx.beforeBroadcast(room);
    const anim = emits.find(e => e.ev === 'card_animation');
    assert.equal(anim.payload.type, 'high_noon_reveal');
    assert.equal(anim.payload.key, 'KAZATEL');
    assert.equal(anim.payload.art, 'kazatel');
    assert.equal(anim.payload.remaining, 12, 'kolik karet zbývá v balíčku (klient jím kreslí hromádku hned)');
    // Šerif je na tahu už během odkrývání – stav s ním dorazí až po celé cinematice.
    assert.equal(anim.payload.playerIdx, 2);
    assert.equal(room.gameState._pendingHighNoonReveal, null, 'podklad se spotřebuje (neemituje se dvakrát)');
    assert.ok(room._hnBlockUntil > Date.now(), 'boti čekají na dojezd cinematiky');

    // Druhé volání už nic neposílá.
    const before = emits.length;
    ctx.beforeBroadcast(room);
    assert.equal(emits.length, before);
});

// ── Čekání na assety rozšíření před startem hry ──────────────────────────────
// Minimální ctx pro lifecycle: stačí broadcasty a log (setup hry se tu nespouští).
function mkCtx(io) {
    return {
        io, cardData: [], dodgeCityCardData: [], highNoonCardData: [],
        GameState: function () {},
        broadcastRoom() {}, broadcastLobbyList() {}, emitIntro() {}, runIntroSequence() {},
        glog: { openGame() {}, system() {}, error() {}, rule() {} },
    };
}

test('whenAssetsReady pustí start hned, když žádné rozšíření není zapnuté', () => {
    const { io } = mkIo();
    const ctx = mkCtx(io);
    require('../server/lifecycle.js')(ctx);
    const room = { id: 'g1', name: 'T', players: [{ socketId: 's0' }], leaderSocketId: 's0', options: {} };
    let started = 0;
    ctx.whenAssetsReady(room, () => started++);
    assert.equal(started, 1);
    assert.equal(!!room.assetsWaiting, false);
});

test('se zapnutým rozšířením se čeká, dokud se neozvou všichni lidští hráči', () => {
    const { io } = mkIo();
    const ctx = mkCtx(io);
    require('../server/lifecycle.js')(ctx);
    const room = {
        id: 'g1', name: 'T', leaderSocketId: 's0',
        players: [{ socketId: 's0' }, { socketId: 's1' }, { socketId: 'bot1', isBot: true }],
        options: { expansions: { high_noon: true } },
    };
    let started = 0;
    ctx.whenAssetsReady(room, () => started++);
    assert.equal(started, 0, 'čeká se');
    assert.equal(room.assetsWaiting, true);

    ctx.noteAssetsReady(room, 's0', 'high_noon');
    assert.equal(started, 0, 'jeden hráč nestačí');
    ctx.noteAssetsReady(room, 's1', 'high_noon');
    assert.equal(started, 1, 'bot se nečeká – hra startuje');
    assert.equal(room.assetsWaiting, false);
    clearTimeout(room._assetWaitTimer);
});
