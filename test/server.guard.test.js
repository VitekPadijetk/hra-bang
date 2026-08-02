// Guard „čí je tah" (server/guard.js) – akce se autorizují NA HRÁČE, ne globálně.
// Regrese k chybě z pomalé linky: dvojklik na „Ukončit tah" přeskočil několik hráčů.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState } = require('../logic.js');
const { mkGame, mkCard, give, CardType } = require('./_helpers.js');

const installRoomService = require('../server/rooms.js');
const installAnimService = require('../server/anim.js');
const installGuard = require('../server/guard.js');
const registerGame = require('../server/handlers.game.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));

before(() => { console.log = () => {}; });

// Místnost se 4 místy, každé na vlastním socketu, a ručně sestavený GameState
// (viz test/_helpers.js – setupGame by míchal). Vrací { ctx, room, gs, sock(i) }.
function mkEnv(opts = {}) {
    const sockets = new Map();
    const io = { sockets: { sockets }, emit() {}, to() { return { emit() {} }; } };
    const ctx = { io, cardData, GameState };
    installRoomService(ctx);
    installAnimService(ctx);
    installGuard(ctx);

    const room = ctx.makeRoom('T', 4, 's0', 'P0');
    for (let i = 1; i < 4; i++) room.players.push({ socketId: 's' + i, playerIdx: i, name: 'P' + i });

    const gs = mkGame(
        [{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }],
        opts
    );
    room.gameState = gs;

    const made = new Map();
    function sock(i) {
        if (made.has(i)) return made.get(i);
        const id = 's' + i;
        const handlers = {}, rejected = [], emits = [];
        const socket = {
            id,
            on(ev, fn) { handlers[ev] = fn; },
            emit(ev, payload) { emits.push({ ev, payload }); if (ev === 'action_rejected') rejected.push(payload); },
            join() {}, leave() {},
            fire(ev, ...a) { if (handlers[ev]) handlers[ev](...a); },
            rejected, emits,
        };
        sockets.set(id, socket);
        registerGame(socket, ctx, (cb) => {
            const r = ctx.findRoomBySocket(id);
            if (!r) return;
            const p = r.players.find(pl => pl.socketId === id);
            if (!p) return;
            cb(r, p, r.gameState);
        });
        made.set(i, socket);
        return socket;
    }
    return { ctx, room, gs, sock };
}

test('end_turn od hráče, na kterého se nečeká, se zahodí (+ action_rejected)', () => {
    const { gs, sock } = mkEnv();          // fáze PLAY, na tahu #0
    const s1 = sock(1);
    s1.fire('end_turn');
    assert.equal(gs.currentPlayerIndex, 0);      // tah zůstal #0
    assert.equal(gs.phase, 'PLAY');
    assert.equal(s1.rejected.length, 1);
    assert.equal(s1.rejected[0].event, 'end_turn');
});

test('dvojklik na end_turn posune tah jen o jednoho hráče', () => {
    const { gs, sock } = mkEnv();
    const s0 = sock(0);
    s0.fire('end_turn');                          // #0 → #1 (a rovnou fáze lízání)
    assert.equal(gs.currentPlayerIndex, 1);
    s0.fire('end_turn');                          // opožděný duplikát – už není náš tah
    s0.fire('end_turn');
    assert.equal(gs.currentPlayerIndex, 1);
    assert.equal(s0.rejected.length, 2);
});

test('vlastní end_turn během vlastního lízání tah nezahodí', () => {
    const { gs, sock } = mkEnv({ phase: 'DRAW' });
    gs.drawPhaseState = { active: true, playerIdx: 0, cardsNeeded: 2, cardsDrawn: 0, options: ['deck'] };
    sock(0).fire('end_turn');                     // guard pustí (jsme aktér), logika odmítne fázi
    assert.equal(gs.currentPlayerIndex, 0);
    assert.equal(gs.phase, 'DRAW');
});

test('hokynářství: cizí hráč nemůže vybrat kartu za toho, kdo je na řadě', () => {
    const { gs, sock } = mkEnv({ phase: 'STORE' });
    gs.storePickerIndex = 2;
    gs.storeCards = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    const s0 = sock(0);
    s0.fire('store_pick', { cardIdx: 0 });
    assert.equal(gs.storeCards[0].id, 1);         // nic se nevzalo
    assert.equal(s0.rejected.length, 1);
});

test('Sid Ketchum (akce mimo pořadí) jde zahrát jen za vlastní místo', () => {
    const { gs, sock } = mkEnv();
    gs.players[0].health = 2;
    give(gs, 0, CardType.BANG);
    give(gs, 0, CardType.BANG);
    const s1 = sock(1);
    s1.fire('sid_ketchum_discard_both', { playerIdx: 0, cardIdx1: 0, cardIdx2: 1 });
    assert.equal(gs.players[0].hand.length, 2);   // za #0 hrát nesmí
    assert.equal(s1.rejected.length, 1);
    // Za sebe ano: vlastní ruka se odhodí (Sid léčí), guard nezasahuje.
    gs.players[1].health = 2;
    give(gs, 1, CardType.BANG);
    give(gs, 1, CardType.BANG);
    s1.fire('sid_ketchum_discard_both', { playerIdx: 1, cardIdx1: 0, cardIdx2: 1 });
    assert.equal(gs.players[1].hand.length, 0);
    assert.equal(s1.rejected.length, 1);          // žádné další odmítnutí
});

test('debug hra (jeden socket ovládá všechna místa) guardem neprochází', () => {
    const { gs, sock } = mkEnv();
    gs.isDebug = true;
    sock(1).fire('end_turn');                     // v debugu smí kdokoli za kohokoli
    assert.equal(gs.currentPlayerIndex, 1);
    assert.equal(sock(1).rejected.length, 0);
});

test('klik navíc na balíček po dolízání nespustí falešnou animaci líznutí', () => {
    const { gs, sock } = mkEnv({ phase: 'DRAW' });
    gs.deck.cards = [mkCard(CardType.BANG), mkCard(CardType.BANG)];
    gs.drawPhaseState = { active: true, playerIdx: 0, cardsNeeded: 2, cardsDrawn: 0, options: ['deck'] };
    const s0 = sock(0);
    s0.fire('draw_card', { source: 'deck', sourceIdx: null });
    s0.fire('draw_card', { source: 'deck', sourceIdx: null });
    assert.equal(gs.phase, 'PLAY');
    const animsAfterDraw = s0.emits.filter(e => e.ev === 'card_animation').length;
    s0.fire('draw_card', { source: 'deck', sourceIdx: null });   // opožděný klik navíc
    assert.equal(gs.players[0].hand.length, 2);
    assert.equal(s0.emits.filter(e => e.ev === 'card_animation').length, animsAfterDraw);
});

test('po konci hry se herní akce už nepřijímají', () => {
    const { gs, sock } = mkEnv();
    gs.winner = 'Zákon';
    sock(0).fire('end_turn');
    assert.equal(gs.currentPlayerIndex, 0);
    assert.equal(sock(0).rejected.length, 1);
});
