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
    // Odhalenou roli drží `_roleRevealed` (nastaví ho vyřazení), ne `health <= 0` –
    // přerozdání rolí (Hřbitov, Divoký západ) ho zase shodí. Viz redakce v server/rooms.js.
    const dead = mk('Renegade', 0); dead._roleRevealed = true;
    const state = { players: [mk('Outlaw'), mk('Sheriff'), dead] }; // idx2 mrtvý
    const b = computeBeliefs(state, empty, 0);
    assert.deepEqual(b[1], { Sheriff: 1, Deputy: 0, Outlaw: 0, Renegade: 0 });
    assert.deepEqual(b[2], { Sheriff: 0, Deputy: 0, Outlaw: 0, Renegade: 1 }); // mrtvý = veřejný
});

// Divoký západ – Hřbitov: přerozdáním rolí mezi vyřazenými přestává být role veřejná.
// Bot na ni nesmí „vědět" víc než ostatní a nesmí jí ani pokazit rozdělení pravděpodobností:
// vyřazený bez odhalené role zůstává v poolu, takže rozdělení živých pořád dává součet 1.
test('přerozdaná role vyřazeného hráče je pro bota zase neznámá', () => {
    const dead = mk('Renegade', 0);   // bez _roleRevealed = po přerozdání
    const state = { players: [mk('Sheriff'), mk('Outlaw'), mk('Outlaw'), dead] };
    const b = computeBeliefs(state, empty, 0);
    assert.notDeepEqual(b[3], { Sheriff: 0, Deputy: 0, Outlaw: 0, Renegade: 1 });
    for (const i of [1, 2, 3]) {
        const tot = b[i].Sheriff + b[i].Deputy + b[i].Outlaw + b[i].Renegade;
        assert.ok(Math.abs(tot - 1) < 1e-9, `rozdělení hráče ${i} má dát 1 (je ${tot})`);
    }
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

// Odpadlík vyhraje jen jako poslední žijící → šerifa smí zabít až v souboji 1v1.
// Dokud žije kdokoli další (bandita NEBO pomocník), je zabití šerifa jeho prohra.
test('roleHostility: odpadlík nestřílí na šerifa, dokud žijí bandité NEBO pomocníci', () => {
    assert.ok(roleHostility('Renegade', 'Sheriff', { outlawsAlive: true }) < 0);
    assert.ok(roleHostility('Renegade', 'Sheriff', { deputiesAlive: true }) < 0);
    assert.ok(roleHostility('Renegade', 'Sheriff', { outlawsAlive: false, deputiesAlive: true }) < 0);
    // Až když nezbyl nikdo další, jde po šerifovi (a to nejsilněji ze všech cílů).
    const solo = { outlawsAlive: false, deputiesAlive: false };
    assert.ok(roleHostility('Renegade', 'Sheriff', solo) > 0);
    assert.ok(roleHostility('Renegade', 'Sheriff', solo) > roleHostility('Renegade', 'Outlaw', solo));
    // Pomocníky sráží průběžně (jsou před šerifem na řadě).
    assert.ok(roleHostility('Renegade', 'Deputy', { deputiesAlive: true }) > 0);
});

test('expectedHostility: odpadlík s živým pomocníkem šerifa nechá být', () => {
    // 5 hráčů: šerif (veřejný, idx 0), já odpadlík (idx 1), zbytek neznámý.
    const s = st('Sheriff', 'Renegade', 'Outlaw', 'Outlaw', 'Deputy');
    const b = computeBeliefs(s, empty, 1);
    const opts = { outlawsAlive: false, deputiesAlive: true };
    assert.ok(expectedHostility('Renegade', b[0], opts) < 0, 'šerif nesmí být cíl');
});

test('estimateOutlawsAlive: součet P(Outlaw) žijících', () => {
    const s = st('Sheriff', 'Outlaw', 'Outlaw', 'Renegade');
    const b = computeBeliefs(s, empty, 0);
    // 3 neznámí, každý P(Outlaw)=2/3 → součet 2.0.
    assert.ok(Math.abs(estimateOutlawsAlive(s, b) - 2) < 1e-9);
});

// ── Hra pro 3 (Město duchů): nepřátelskost je cyklická, role veřejné ─────────
test('roleHostility 3P: můj určený nepřítel má prioritu, třetí hráč je taky nepřítel', () => {
    const o = { mode3p: true };
    // pomocník loví odpadlíka, odpadlík banditu, bandita pomocníka
    assert.equal(roleHostility('Deputy', 'Renegade', o), 3);
    assert.equal(roleHostility('Deputy', 'Outlaw', o), 1);
    assert.equal(roleHostility('Renegade', 'Outlaw', o), 3);
    assert.equal(roleHostility('Renegade', 'Deputy', o), 1);
    assert.equal(roleHostility('Outlaw', 'Deputy', o), 3);
    assert.equal(roleHostility('Outlaw', 'Renegade', o), 1);
    // nikdo není spojenec – vyhrát může jen jeden
    for (const me of ['Deputy', 'Outlaw', 'Renegade']) {
        for (const t of ['Deputy', 'Outlaw', 'Renegade']) {
            if (me === t) continue;
            assert.ok(roleHostility(me, t, o) > 0, `${me} vs ${t}`);
        }
    }
});

test('computeBeliefs 3P: všechny role jsou jisté (leží lícem nahoru)', () => {
    const state = {
        mode3p: true,
        players: [
            { role: 'Deputy', health: 4, hand: [] },
            { role: 'Outlaw', health: 4, hand: [] },
            { role: 'Renegade', health: 4, hand: [] },
        ],
    };
    const b = computeBeliefs(state, null, 0);
    assert.equal(b[0].Deputy, 1);
    assert.equal(b[1].Outlaw, 1);
    assert.equal(b[2].Renegade, 1);
});

// ── Hra pro 8: dva odpadlíci jsou rivalové, ne spojenci ─────────────────────
test('roleHostility 8P: druhý odpadlík je rival a drží šerifa při životě', () => {
    // dva odpadlíci: druhý je nepřítel (vyhrát můžou jen jednotlivě)
    assert.ok(roleHostility('Renegade', 'Renegade', {}) > 0);
    // dokud žije druhý odpadlík, na šerifa se nesahá – stejně jako u banditů/pomocníků
    assert.ok(roleHostility('Renegade', 'Sheriff', { renegadesAlive: true }) < 0);
    assert.ok(roleHostility('Renegade', 'Sheriff', {}) > 0);
});

test('computeBeliefs 8P: složení rolí je 1/2/3/2', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
        role: i === 0 ? 'Sheriff' : 'Outlaw', health: 4, hand: [],
    }));
    const b = computeBeliefs({ players }, null, 1);
    assert.equal(b[0].Sheriff, 1, 'šerif je veřejný');
    // pro neznámé se rozdělí zbytek poolu (2 pomocníci, 2 bandité, 2 odpadlíci na 6 hráčů)
    const unknown = b[2];
    assert.ok(Math.abs(unknown.Deputy + unknown.Outlaw + unknown.Renegade - 1) < 1e-9);
    assert.ok(unknown.Renegade > 0, 'odpadlík je v poolu');
    assert.equal(unknown.Sheriff, 0);
});

// ── Odhalená role se nezapomíná ──────────────────────────────────────────────
// Mrtvý muž (A Fistful of Cards) vrací prvního vyřazeného zpátky do hry. Roli u toho
// viděl celý stůl a klient ji dál ukazuje – bot na ni tedy nesmí jako jediný zapomenout.
test('vrácený Mrtvý muž si roli nese s sebou (nehádá se znovu)', () => {
    const mk = (revealed) => ({
        players: [
            { role: 'Sheriff', health: 4 },
            { role: 'Outlaw', health: 2, _roleRevealed: revealed },
            { role: 'Deputy', health: 4 },
            { role: 'Outlaw', health: 4 },
            { role: 'Renegade', health: 4 },
        ],
    });
    const after = computeBeliefs(mk(true), { pairs: {} }, 0);
    assert.deepEqual(after[1], { Sheriff: 0, Deputy: 0, Outlaw: 1, Renegade: 0 });
    // A ubraná role zmizí i z poolu ostatních – zbývají 3 neznámí na 1 banditu, 1 pomocníka
    // a 1 odpadlíka, takže je každý z nich přesně z třetiny každým z nich.
    assert.ok(Math.abs(after[2].Deputy - 1 / 3) < 1e-9);

    const before = computeBeliefs(mk(false), { pairs: {} }, 0);
    assert.ok(before[1].Outlaw < 1, 'bez odhalení se role pořád jen odhaduje');
});
