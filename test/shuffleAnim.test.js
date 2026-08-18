const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    SHUFFLE_ANIM, shuffleLayers, shufflePerCard, shuffleSettleMs, shuffleDurationMs,
} = require('../core/shuffleAnim.js');

// Reálné počty karet, se kterými se intro potká: role (3–8), balíček událostí High Noon
// (13 / 15 s přibalenými), postavy (16 / 31) a hrací balíček (80, s rozšířeními víc).
const REAL = [3, 4, 5, 6, 7, 8, 12, 14, 16, 31, 80, 104];

test('shuffleLayers nikdy nepřekročí strop kreslených vrstev', () => {
    for (const n of REAL) {
        assert.ok(shuffleLayers(n) <= SHUFFLE_ANIM.maxLayers, `n=${n}`);
        assert.equal(shuffleLayers(n), Math.min(n, SHUFFLE_ANIM.maxLayers), `n=${n}`);
    }
    // Prázdný / nesmyslný vstup nesmí dát nulu (animace by neměla co zobrazit).
    assert.equal(shuffleLayers(0), 1);
    assert.equal(shuffleLayers(undefined), 1);
});

test('rozestup karet riffle zůstává v mezích profilu', () => {
    for (const n of REAL) {
        const p = shufflePerCard(n);
        assert.ok(p >= SHUFFLE_ANIM.perCardMin, `n=${n}: ${p}`);
        assert.ok(p <= SHUFFLE_ANIM.perCardMax, `n=${n}: ${p}`);
    }
    // Větší balíček = hustší sled karet (nikdy naopak).
    for (let i = 1; i < REAL.length; i++) {
        assert.ok(shufflePerCard(REAL[i]) <= shufflePerCard(REAL[i - 1]),
            `${REAL[i]} vs ${REAL[i - 1]}`);
    }
});

test('míchání většího balíčku netrvá kratší dobu než menšího', () => {
    for (let i = 1; i < REAL.length; i++) {
        assert.ok(shuffleDurationMs(REAL[i]) >= shuffleDurationMs(REAL[i - 1]),
            `${REAL[i]} vs ${REAL[i - 1]}`);
    }
});

test('doskládání předchází konci animace a celek zůstává v rozumné délce', () => {
    for (const n of REAL) {
        const settle = shuffleSettleMs(n);
        const total = shuffleDurationMs(n);
        assert.equal(total - settle, SHUFFLE_ANIM.tailMs, `n=${n}`);
        assert.ok(settle > SHUFFLE_ANIM.preMs + SHUFFLE_ANIM.cutMs, `n=${n}`);
        // Intro nesmí kvůli jednomu balíčku stát půl minuty.
        assert.ok(total <= 6000, `n=${n}: ${total}`);
    }
});
