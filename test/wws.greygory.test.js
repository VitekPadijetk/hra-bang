// Divoký západ – Greygory Deck (fáze 10) a trychtýř `hasAbility`/`abilitiesOf`.
// Greygory má schopnosti DVOU náhodně líznutých postav naráz, takže se dotaz
// „umí X?" musel otočit z rovnosti jednoho jména na dotaz nad seznamem.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { abilitiesOf, hasAbility, effectiveCharacter } = require('../core/distance.js');

// ── abilitiesOf / hasAbility ────────────────────────────────────────────────
test('abilitiesOf: běžná postava má právě jednu schopnost', () => {
    const p = { character: 'Slab the Killer' };
    assert.deepEqual(abilitiesOf(p), ['Slab the Killer']);
    assert.equal(hasAbility(p, 'Slab the Killer'), true);
    assert.equal(hasAbility(p, 'Vulture Sam'), false);
});

test('abilitiesOf: hráč bez postavy i chybějící hráč vrací prázdno', () => {
    assert.deepEqual(abilitiesOf({ character: null }), []);
    assert.deepEqual(abilitiesOf(null), []);
    assert.deepEqual(abilitiesOf(undefined), []);
    assert.equal(hasAbility(null, 'Slab the Killer'), false);
});

test('Kocovina (High Noon) vypne schopnosti všem naráz, včetně Greygoryho dvojice', () => {
    const vera = { character: 'Vera Custer', _copiedCharacter: 'Slab the Killer', _noAbility: true };
    assert.deepEqual(abilitiesOf(vera), []);
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy', 'Suzy Lafayette'], _noAbility: true };
    assert.deepEqual(abilitiesOf(g), []);
    assert.equal(hasAbility(g, 'Bart Cassidy'), false);
});

test('Vera Custer se ptá skrz kopii', () => {
    const vera = { character: 'Vera Custer', _copiedCharacter: 'Jesse Jones' };
    assert.deepEqual(abilitiesOf(vera), ['Jesse Jones']);
    assert.equal(hasAbility(vera, 'Jesse Jones'), true);
    assert.equal(hasAbility(vera, 'Vera Custer'), false);
});

test('Greygory Deck má obě líznuté schopnosti, sám sebe ale ne', () => {
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy', 'Rose Doolan'] };
    assert.deepEqual(abilitiesOf(g), ['Bart Cassidy', 'Rose Doolan']);
    assert.equal(hasAbility(g, 'Bart Cassidy'), true);
    assert.equal(hasAbility(g, 'Rose Doolan'), true);
    assert.equal(hasAbility(g, 'Greygory Deck'), false);
    // Bez líznuté dvojice (smůla – nezbyla volná karta) nemá schopnost žádnou.
    assert.deepEqual(abilitiesOf({ character: 'Greygory Deck' }), []);
    assert.deepEqual(abilitiesOf({ character: 'Greygory Deck', _greygoryChars: [] }), []);
});

test('Vera kopírující Greygoryho jede podle SVÉ dvojice (R10)', () => {
    const vera = { character: 'Vera Custer', _copiedCharacter: 'Greygory Deck',
                   _greygoryChars: ['Willy the Kid', 'Paul Regret'] };
    assert.deepEqual(abilitiesOf(vera), ['Willy the Kid', 'Paul Regret']);
    assert.equal(hasAbility(vera, 'Paul Regret'), true);
});

test('abilitiesOf vrací KOPII pole – volající ho nesmí přepsat majiteli', () => {
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy'] };
    abilitiesOf(g).push('Slab the Killer');
    assert.deepEqual(g._greygoryChars, ['Bart Cassidy']);
});

test('effectiveCharacter zůstává vedle – jedna postava k ZOBRAZENÍ', () => {
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy', 'Rose Doolan'] };
    assert.equal(effectiveCharacter(g), 'Greygory Deck');   // portrét se nemění
});

// ── Strukturální pojistka ───────────────────────────────────────────────────
// Bez ní se refaktor za půl roku rozjede zpátky: kdo napíše
// `effectiveCharacter(p) === "Bart Cassidy"`, ptá se na schopnost — a Greygorymu
// (ani Veře, která ho kopíruje) ta podmínka nikdy nesedne. Pravidla, bot i UI se
// na schopnost smí ptát VÝHRADNĚ přes hasAbility/abilitiesOf; effectiveCharacter
// zůstává pro to, kde jde o jednu postavu k zobrazení (portrét, overlay, štítek),
// a tam se se jménem postavy neporovnává.
test('nikde v pravidlech/botovi/UI nezbylo porovnání effectiveCharacter se jménem', () => {
    const files = ['core/playability.js', 'core/botPolicy.js', 'core/selection.js',
                   'view/board.js', 'logic.js', 'server/anim.js',
                   ...fs.readdirSync(__dirname + '/../logic').filter(f => f.endsWith('.js')).map(f => 'logic/' + f)];
    const bad = [];
    files.forEach(rel => {
        const src = fs.readFileSync(__dirname + '/../' + rel, 'utf8');
        src.split('\n').forEach((line, i) => {
            if (/effectiveCharacter\([^()]*\)\s*(===|!==)\s*["']/.test(line)) bad.push(`${rel}:${i + 1}`);
        });
    });
    assert.deepEqual(bad, [], 'schopnost se ptá přes hasAbility(p, "Jméno"), ne přes effectiveCharacter');
});
