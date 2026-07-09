// Testy dedukce rolí z chování (core/beliefs.js). Bot NEZNÁ skryté role – tady ověřujeme,
// že prior odpovídá počtům rolí a že se beliefy správně posouvají podle ledgeru chování.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeBeliefs, expectedHostility, roleHostility, estimateOutlawsAlive } = require('../core/beliefs.js');

const mk = (role, health = 4) => ({ role, health });
const st = (...roles) => ({ players: roles.map(r => mk(r)) });
const empty = { pairs: {} };

// ── roleHostility: čistá tabulka ─────────────────────────────────────────────
test('roleHostility: bandita nejvíc cílí šerifa, spojenci záporně', () => {
    assert.ok(roleHostility('Outlaw', 'Sheriff') > roleHostility('Outlaw', 'Deputy'));
    assert.ok(roleHostility('Outlaw', 'Outlaw') < 0);      // spoluodpadlík = spojenec
    assert.ok(roleHostility('Sheriff', 'Deputy') < 0);     // šerif nikdy pomocníka
    assert.equal(roleHostility('Deputy', 'Sheriff'), -100);
});

// ── Prior odpovídá složení rolí ──────────────────────────────────────────────
test('prior: neznámý nikdy není šerif; rozdělení dle poolu (4 hráči = bez pomocníků)', () => {
    // 4 hráči: Sheriff, Outlaw, Outlaw, Renegade. Bot = šerif(0).
    const b = computeBeliefs(st('Sheriff', 'Outlaw', 'Outlaw', 'Renegade'), empty, 0);
    for (const i of [1, 2, 3]) {
        assert.equal(b[i].Sheriff, 0, 'neznámý není šerif');
        assert.equal(b[i].Deputy, 0, 've 4 hráčích nejsou pomocníci');
        assert.ok(Math.abs(b[i].Outlaw - 2 / 3) < 1e-9);   // pool 2 Outlaw / 3 neznámí
        assert.ok(Math.abs(b[i].Renegade - 1 / 3) < 1e-9);
    }
    assert.deepEqual(b[0], { Sheriff: 1, Deputy: 0, Outlaw: 0, Renegade: 0 }); // sebe zná
});

test('veřejný šerif má jistotu {Sheriff:1}; mrtvý má odhalenou roli', () => {
    const state = { players: [mk('Outlaw'), mk('Sheriff'), mk('Renegade', 0)] }; // idx2 mrtvý
    const b = computeBeliefs(state, empty, 0);
    assert.deepEqual(b[1], { Sheriff: 1, Deputy: 0, Outlaw: 0, Renegade: 0 });
    assert.deepEqual(b[2], { Sheriff: 0, Deputy: 0, Outlaw: 0, Renegade: 1 }); // mrtvý = veřejný
});

// ── Update z ledgeru ─────────────────────────────────────────────────────────
test('útok na šerifa → roste P(Outlaw) útočníka', () => {
    const s = st('Sheriff', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy'); // 5 hráčů
    const before = computeBeliefs(s, empty, 0)[1].Outlaw;
    const after = computeBeliefs(s, { pairs: { 1: { 0: { hostile: 3 } } } }, 0)[1].Outlaw;
    assert.ok(after > before, `P(Outlaw) má stoupnout (${before} → ${after})`);
});

test('obrana šerifa (útok na jeho útočníka) → roste P(Deputy)', () => {
    const s = st('Sheriff', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy');
    // idx1 útočí na šerifa; idx4 útočí na idx1 → idx4 vypadá jako obránce (pomocník).
    const led = { pairs: { 1: { 0: { hostile: 3 } }, 4: { 1: { hostile: 3 } } } };
    const b = computeBeliefs(s, led, 0);
    const base = computeBeliefs(s, empty, 0)[4].Deputy;
    assert.ok(b[4].Deputy > base, `P(Deputy) obránce má stoupnout (${base} → ${b[4].Deputy})`);
});

// ── expectedHostility: jistota vs. nejistota ─────────────────────────────────
test('expectedHostility: jistý spojenec ≤ 0, jistý nepřítel > 0', () => {
    const ally = { Sheriff: 0, Deputy: 1, Outlaw: 0, Renegade: 0 };
    const foe = { Sheriff: 0, Deputy: 0, Outlaw: 1, Renegade: 0 };
    assert.ok(expectedHostility('Sheriff', ally) <= 0);
    assert.ok(expectedHostility('Sheriff', foe) > 0);
    assert.ok(expectedHostility('Outlaw', foe) < 0);   // spoluodpadlík = spojenec pro banditu
});

test('expectedHostility: nejistota nezmrazí (ořez -100 → bot není paralyzovaný)', () => {
    // Šerif v 7 hráčích na začátku: každý neznámý MŮŽE být pomocník (-100), ale ořez
    // zajistí, že očekávaná hostilita zůstane rozumná, ne extrémně záporná.
    const s = st('Sheriff', 'Outlaw', 'Outlaw', 'Outlaw', 'Renegade', 'Deputy', 'Deputy');
    const b = computeBeliefs(s, empty, 0);
    const h = expectedHostility('Sheriff', b[1]);
    assert.ok(h > -3 && h < 3, `hostilita ${h} nesmí být extrémní kvůli nejistotě`);
});

test('estimateOutlawsAlive: součet P(Outlaw) žijících', () => {
    const s = st('Sheriff', 'Outlaw', 'Outlaw', 'Renegade');
    const b = computeBeliefs(s, empty, 0);
    // 3 neznámí, každý P(Outlaw)=2/3 → součet 2.0.
    assert.ok(Math.abs(estimateOutlawsAlive(s, b) - 2) < 1e-9);
});
