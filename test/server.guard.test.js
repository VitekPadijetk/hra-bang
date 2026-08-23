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

// Rvačka / dělení karet mezi Vulture Samy: vybírá pořád TENTÝŽ hráč, jen postupně u
// různých cílů → pendingActor je celou dobu stejný a klik navíc (do ještě zvýrazněné
// ruky už vyřízeného hráče, než dojede animace) by vybral kartu za dalšího v pořadí.
// Klient proto posílá targetIdx a guard porovná s aktuálním pendingSelection.
test('opožděný klik do už posunutého výběru karty se zahodí (Rvačka)', () => {
    const { gs, sock } = mkEnv({ phase: 'SELECTING_TARGET_CARD' });
    gs.players[2].hand = [mkCard(CardType.BANG), mkCard(CardType.BANG)];
    gs.pendingSelection = { attackerIdx: 0, targetIdx: 2, sourceCardType: CardType.CAT_BALOU, isBrawl: true };
    const s0 = sock(0);
    s0.fire('select_target_card', { attackerIdx: 0, targetIdx: 1, area: 'hand', cardIdx: null });
    assert.equal(gs.players[2].hand.length, 2);   // za #1 (starý cíl) se nic nevybralo
    assert.equal(s0.rejected.length, 1);
    // Klik na aktuální cíl projde.
    s0.fire('select_target_card', { attackerIdx: 0, targetIdx: 2, area: 'hand', cardIdx: null });
    assert.equal(gs.players[2].hand.length, 1);
    assert.equal(s0.rejected.length, 1);
});

test('po konci hry se herní akce už nepřijímají', () => {
    const { gs, sock } = mkEnv();
    gs.winner = 'Zákon';
    sock(0).fire('end_turn');
    assert.equal(gs.currentPlayerIndex, 0);
    assert.equal(sock(0).rejected.length, 1);
});

// A Fistful of Cards – Ruská ruleta: kolečko běží MIMO tah, takže odhodit smí jen ten,
// na koho se právě čeká. Bez guardu by opožděný klik odhodil kartu za dalšího v pořadí.
test('roulette_discard od hráče mimo pořadí se zahodí', () => {
    const { gs, sock } = mkEnv({ phase: 'ROULETTE_DISCARD' });
    gs.activeFistful = { key: 'RUSKA_RULETA', name: 'Ruská ruleta' };
    gs.players.forEach(p => { p.hand = [mkCard(CardType.MISSED, { name: 'Vedle!' })]; });
    gs.pendingRoulette = { playerIdx: 0, order: [0, 1, 2, 3], pos: 0 };

    const s1 = sock(1);
    s1.fire('roulette_discard', { cardId: gs.players[1].hand[0].id, fromBoard: false });
    assert.equal(gs.players[1].hand.length, 1, 'za cizí místo se nic neodhodilo');
    assert.equal(gs.pendingRoulette.playerIdx, 0);
    assert.equal(s1.rejected.length, 1);

    // Ten, na koho se čeká, projde.
    const s0 = sock(0);
    s0.fire('roulette_discard', { cardId: gs.players[0].hand[0].id, fromBoard: false });
    assert.equal(gs.players[0].hand.length, 0);
    assert.equal(gs.pendingRoulette.playerIdx, 1);
    assert.equal(s0.rejected.length, 0);
});

// A Fistful of Cards – fáze 8: obě nové akce posouvají hru za hráče na tahu, takže je
// od kohokoli jiného potřeba zahodit (opožděný/duplicitní klik z pomalé linky).
test('sniper_choose a play_ricochet od hráče mimo tah se zahodí', () => {
    const { gs, sock } = mkEnv();
    gs.activeFistful = { key: 'ODSTRELOVAC', name: 'Odstřelovač' };
    give(gs, 0, CardType.BANG, { name: 'Bang!' });
    give(gs, 0, CardType.BANG, { name: 'Bang!' });

    const s1 = sock(1);
    s1.fire('sniper_choose', { cardIdx: 0, targetIdx: 1 });
    assert.equal(gs.phase, 'PLAY', 'za cizí místo se nic nerozehrálo');
    assert.equal(s1.rejected.length, 1);

    const s0 = sock(0);
    s0.fire('sniper_choose', { cardIdx: 0, targetIdx: 1 });
    assert.equal(gs.phase, 'DISCARD_ANOTHER');
    assert.equal(s0.rejected.length, 0);
});

test('play_ricochet od hráče mimo tah se zahodí', () => {
    const { gs, sock } = mkEnv();
    gs.activeFistful = { key: 'ODRAZENA_STRELA', name: 'Odražená střela' };
    give(gs, 0, CardType.BANG, { name: 'Bang!' });
    const scope = mkCard(CardType.EQUIPMENT, { name: 'Dalekohled' });
    scope.effect = 'scope';
    gs.players[1].board.push(scope);

    const s2 = sock(2);
    s2.fire('play_ricochet', { attackerIdx: 0, targetIdx: 1, area: 'board', cardId: scope.id, cardIdx: 0 });
    assert.equal(gs.players[1].board.length, 1);
    assert.equal(gs.phase, 'PLAY');
    assert.equal(s2.rejected.length, 1);

    const s0 = sock(0);
    s0.fire('play_ricochet', { attackerIdx: 0, targetIdx: 1, area: 'board', cardId: scope.id, cardIdx: 0 });
    assert.equal(gs.phase, 'RESPOND');
    assert.equal(s0.rejected.length, 0);
});
