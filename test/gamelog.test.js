// Testy strukturovaného herního logu: čisté funkce core/gameLog.js (snapshotState,
// formatEvent) a emise událostí z GameState přes injektovaný sink `_onEvent`.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { snapshotState, formatEvent, LogEvent } = require('../core/gameLog.js');
const { mkGame, give, mkCard, CardType } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── snapshotState ─────────────────────────────────────────────────────────────
test('snapshotState: kompaktní stav s rolemi, rukou, boardem a pendingActorem', () => {
    const g = mkGame([
        { role: 'Sheriff', character: 'Bart Cassidy', health: 5, maxHealth: 5, name: 'Sh' },
        { role: 'Outlaw', character: 'Willy the Kid', health: 4, name: 'Ou' },
    ]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    const snap = snapshotState(g);

    assert.equal(snap.cur, 0);
    assert.equal(snap.winner, null);
    assert.equal(snap.players.length, 2);
    assert.equal(snap.players[0].role, 'Sheriff');   // server-only log → role vidět
    assert.equal(snap.players[0].ch, 'Bart Cassidy');
    assert.equal(snap.players[0].hp, 5);
    assert.deepEqual(snap.players[0].hand, ['Bang!']);
    assert.deepEqual(snap.pending, { idx: 0, kind: 'PLAY' });   // phase PLAY → čeká se na hráče 0
});

// ── formatEvent ───────────────────────────────────────────────────────────────
test('formatEvent: čitelné jednořádkové popisy podle typu', () => {
    assert.match(formatEvent({ ev: LogEvent.DAMAGE, turn: 3, who: 'Ann', hp: '4→3', by: 'Bob' }), /Ann.*4→3.*Bob/);
    assert.match(formatEvent({ ev: LogEvent.TURN, turn: 2, who: 'Bob', role: 'Outlaw', hp: 4, max: 4, hand: 5 }), /TAH.*Bob/);
    assert.match(formatEvent({ ev: LogEvent.DEATH, who: 'Sam', role: 'Outlaw', killer: 'Bob', reward: 'Bob +3 karty' }), /Sam.*Bob/);
    assert.match(formatEvent({ ev: LogEvent.WIN, winner: 'Zákon vyhrál', survivors: ['Sh(Sheriff)'] }), /KONEC.*Zákon/);
    // neznámý typ → nespadne, vrátí něco rozumného
    assert.equal(typeof formatEvent({ ev: 'cosi', turn: 1 }), 'string');
});

// ── emise: damage ─────────────────────────────────────────────────────────────
test('logEvent: handleDamage emituje damage s who/hp/by a připojeným turn/phase', () => {
    const g = mkGame([
        { role: 'Sheriff', health: 5, name: 'Sh' },
        { role: 'Outlaw', health: 4, name: 'Ou' },
        { role: 'Renegade', health: 4, name: 'Re' },
    ], { current: 0 });
    g.turnId = 7;
    const evs = [];
    g._onEvent = e => evs.push(e);

    g.handleDamage(1, 0);

    const dmg = evs.find(e => e.ev === 'damage');
    assert.ok(dmg, 'padla damage událost');
    assert.equal(dmg.who, 'Ou');
    assert.equal(dmg.hp, '4→3');
    assert.equal(dmg.by, 'Sh');
    assert.equal(dmg.turn, 7);        // logEvent připojí turnId
    assert.equal(dmg.phase, 'PLAY');  // a phase
});

// ── emise: death (+ reward), bez výhry ──────────────────────────────────────────
test('logEvent: smrt bandity emituje death s rolí, vrahem a odměnou (hra pokračuje)', () => {
    const g = mkGame([
        { role: 'Sheriff', health: 5, name: 'Sh' },
        { role: 'Outlaw', health: 1, name: 'Ou' },
        { role: 'Renegade', health: 4, name: 'Re' },
        { role: 'Outlaw', health: 4, name: 'Ou2' },
    ], { current: 0 });
    const evs = [];
    g._onEvent = e => evs.push(e);

    g.handleDamage(1, 0);   // Ou 1→0 → smrt

    const death = evs.find(e => e.ev === 'death');
    assert.ok(death, 'padla death událost');
    assert.equal(death.who, 'Ou');
    assert.equal(death.role, 'Outlaw');
    assert.equal(death.killer, 'Sh');
    assert.match(death.reward, /\+3/);
    assert.ok(!evs.some(e => e.ev === 'win'), 'hra ještě neskončila');
});

// ── emise: win ──────────────────────────────────────────────────────────────────
test('logEvent: vyřazení posledního bandity emituje win se survivory', () => {
    const g = mkGame([
        { role: 'Sheriff', health: 5, name: 'Sh' },
        { role: 'Outlaw', health: 1, name: 'Ou' },
    ], { current: 0 });
    const evs = [];
    g._onEvent = e => evs.push(e);

    g.handleDamage(1, 0);

    const win = evs.find(e => e.ev === 'win');
    assert.ok(win, 'padla win událost');
    assert.ok(typeof win.winner === 'string' && win.winner.length > 0);
    assert.ok(Array.isArray(win.survivors));
});

// ── emise: reshuffle přes deck._log ─────────────────────────────────────────────
test('logEvent: promíchání balíčku (deck._log) emituje reshuffle', () => {
    const g = mkGame([{ role: 'Sheriff', health: 5, name: 'Sh' }]);
    const evs = [];
    g._onEvent = e => evs.push(e);

    g.deck.cards = [];
    g.deck.discardPile = [mkCard(CardType.BANG), mkCard(CardType.BANG), mkCard(CardType.BANG)];
    g.deck.draw();   // prázdný balíček + odhoz → reshuffle

    assert.ok(evs.some(e => e.ev === 'reshuffle'), 'padla reshuffle událost');
});

// ── neaktivní sink je no-op (browser/testy bez _onEvent) ────────────────────────
test('logEvent bez _onEvent nic nedělá (žádná výjimka)', () => {
    const g = mkGame([{ role: 'Sheriff', health: 5, name: 'Sh' }, { role: 'Outlaw', health: 4, name: 'Ou' }]);
    assert.doesNotThrow(() => g.handleDamage(1, 0));   // _onEvent undefined → tiché no-op
});
