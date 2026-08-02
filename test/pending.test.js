// Testy čistých UI-helperů z core/pending.js: waitingStatus (status štítek čekaného hráče)
// a describePendingResponse (co ohrožuje hráče ve fázi RESPOND). pendingActor je pokrytý
// v botPolicy.test.js. Stav stavíme ručně přes _helpers (stejný tvar jako klientský payload).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame } = require('./_helpers.js');
const { waitingStatus, describePendingResponse, describePendingCheck } = require('../core/pending.js');

before(() => { console.log = () => {}; });

// ── waitingStatus ────────────────────────────────────────────────────────────
test('waitingStatus: Suzy líže si → idx hráče + popisek', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'SUZY_DRAW', current: 1 });
    g.pendingSuzyDraw = { playerIdx: 0 };
    assert.deepEqual(waitingStatus(g), { idx: 0, kind: 'SUZY_DRAW', text: 'Suzy Lafayette – líže si kartu' });
});

test('waitingStatus: RESPOND → popisek obsahuje zdrojovou kartu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    g.pendingResponse = { active: true, targetIdx: 0, originatorIdx: 1, requiredCard: 'Bang!', sourceCard: 'Indiáni!', responded: [] };
    assert.deepEqual(waitingStatus(g), { idx: 0, kind: 'RESPOND', text: 'brání se proti Indiáni!' });
});

test('waitingStatus: nikdo se nečeká → null', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    g.pendingResponse = { active: false, targetIdx: 0 };
    assert.equal(waitingStatus(g), null);
});

// ── describePendingResponse ──────────────────────────────────────────────────
test('describePendingResponse: cíl vidí útočníka, zdroj i co zahrát', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND', current: 1 });
    g.players[0].name = 'Alice'; g.players[1].name = 'Bob';
    g.pendingResponse = { active: true, targetIdx: 0, originatorIdx: 1, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const d = describePendingResponse(g, 0);
    assert.equal(d.forMe, true);
    assert.equal(d.attackerName, 'Bob');
    assert.equal(d.sourceLabel, 'Bang!');
    assert.equal(d.need, 'Vedle!');
});

test('describePendingResponse: Slab vyžaduje 2× Vedle!', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND', current: 1 });
    g.missesRequired = 2; g.missesPlayed = 0;
    g.pendingResponse = { active: true, targetIdx: 0, originatorIdx: 1, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    assert.equal(describePendingResponse(g, 0).need, '2× Vedle!');
});

test('describePendingResponse: po jednom zahraném Vedle! zbývá 1', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND', current: 1 });
    g.missesRequired = 2; g.missesPlayed = 1;
    g.pendingResponse = { active: true, targetIdx: 0, originatorIdx: 1, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    assert.equal(describePendingResponse(g, 0).need, 'Vedle!');
});

test('describePendingResponse: pozorovatel (forMe=false)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND', current: 1 });
    g.pendingResponse = { active: true, targetIdx: 0, originatorIdx: 1, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    assert.equal(describePendingResponse(g, 1).forMe, false);
});

test('describePendingResponse: neaktivní reakce → null', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'PLAY' });
    g.pendingResponse = { active: false, targetIdx: 0 };
    assert.equal(describePendingResponse(g, 0), null);
});

// Karta, která efekt jen KOPÍRUJE (Houfnice = Kulomet, Nůž/Derringer/Úder = Bang!),
// musí být v UI vidět pod svým skutečným jménem.
test('describePendingResponse: sourceCardName přebíjí typ efektu (Houfnice ≠ Kulomet)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND', current: 1 });
    g.pendingResponse = { active: true, targetIdx: 0, originatorIdx: 1, requiredCard: 'Vedle!',
        sourceCard: 'Kulomet', sourceCardName: 'Houfnice', responded: [] };
    assert.equal(describePendingResponse(g, 0).sourceLabel, 'Houfnice');
    assert.equal(waitingStatus(g).text, 'brání se proti Houfnice');
});

// ── describePendingCheck ─────────────────────────────────────────────────────
test('describePendingCheck: barel – co se líže, proč a proti čemu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'BARREL_DRAW', current: 1 });
    g.players[1].name = 'Bob';
    g.pendingBarrelCheck = { active: true, targetIdx: 0, attackerIdx: 1, checksLeft: 1,
        reason: 'BARREL', sourceCard: 'Bang!', sourceCardName: 'Nůž' };
    const c = describePendingCheck(g, 0);
    assert.equal(c.forMe, true);
    assert.equal(c.kind, 'BARREL');
    assert.equal(c.short, 'Barel');
    assert.match(c.title, /Barel/);
    assert.match(c.detail, /Nůž/);
    assert.match(c.detail, /Bob/);
});

test('describePendingCheck: Jourdonnais se 2 pokusy + pohled ostatních', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'BARREL_DRAW', current: 1 });
    g.players[0].name = 'Alice';
    g.pendingBarrelCheck = { active: true, targetIdx: 0, attackerIdx: 1, checksLeft: 2,
        reason: 'JOURDONNAIS', sourceCard: 'Bang!' };
    const c = describePendingCheck(g, 1);
    assert.equal(c.forMe, false);
    assert.equal(c.short, 'Jourdonnais');
    assert.equal(c.waitingName, 'Alice');
    assert.match(c.title, /2 pokusy/);
});

test('describePendingCheck: dynamit vs. vězení', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'CHECK_DRAW' });
    g.pendingCheckDraw = { active: true, playerIdx: 0, dynamiteIdx: 0, jailIdx: null };
    assert.equal(describePendingCheck(g, 0).kind, 'DYNAMITE');
    assert.match(describePendingCheck(g, 0).detail, /♠/);
    g.pendingCheckDraw = { active: true, playerIdx: 0, dynamiteIdx: null, jailIdx: 1 };
    assert.equal(describePendingCheck(g, 0).kind, 'JAIL');
    assert.match(describePendingCheck(g, 0).detail, /♥/);
});

test('describePendingCheck: mimo kontrolní fázi → null', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'PLAY' });
    assert.equal(describePendingCheck(g, 0), null);
});
