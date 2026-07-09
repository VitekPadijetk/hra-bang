// Testy čistých UI-helperů z core/pending.js: waitingStatus (status štítek čekaného hráče)
// a describePendingResponse (co ohrožuje hráče ve fázi RESPOND). pendingActor je pokrytý
// v botPolicy.test.js. Stav stavíme ručně přes _helpers (stejný tvar jako klientský payload).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame } = require('./_helpers.js');
const { waitingStatus, describePendingResponse } = require('../core/pending.js');

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
