// Časování cinematiky vyřazení hráče (core/deathAnim.js). Sdílí ho klient
// (net/handlers.js přehrává) i server (server/anim.js drží boty) – proto se hlídá,
// že fáze jdou po sobě a že celková délka roste s počtem odlétajících karet.
const test = require('node:test');
const assert = require('node:assert');
const { DEATH_ANIM, deathAnimTimeline, deathSequenceMs, penaltyDiscardMs,
        deathFallMs, deathRevealMs } = require('../core/deathAnim.js');

test('fáze jdou po sobě ve správném pořadí', () => {
    const t = deathAnimTimeline(4);
    assert.ok(t.cards < t.settle, 'karty odlétají dřív, než se postava usadí');
    assert.ok(t.settle < t.fly, 'karta role letí až po usazení postavy');
    assert.ok(t.fly < t.flip, 'nejdřív je vidět rub, teprve pak překlopení');
    assert.ok(t.flip < t.toSlot, 'odhalená role chvíli zůstane, než odletí na místo');
    assert.ok(t.toSlot < t.total);
});

test('karty začnou odlétat až po poklesu na nulu a pauze', () => {
    const t = deathAnimTimeline(1);
    assert.strictEqual(t.cards, DEATH_ANIM.healthMs + DEATH_ANIM.pauseMs);
});

test('víc karet = delší sekvence, přesně o stagger za kartu', () => {
    const a = deathSequenceMs(1);
    const b = deathSequenceMs(5);
    assert.strictEqual(b - a, 4 * DEATH_ANIM.staggerMs);
});

test('odhalená role je vidět dost dlouho (2 s) a rub před ní taky', () => {
    const t = deathAnimTimeline(3);
    assert.strictEqual(t.toSlot - t.flip, DEATH_ANIM.flipMs + DEATH_ANIM.holdFaceMs);
    assert.strictEqual(t.flip - t.fly, DEATH_ANIM.flyMs + DEATH_ANIM.holdBackMs);
});

test('nesmyslný počet karet sekvenci nerozbije (nikdy kratší než pro jednu)', () => {
    assert.strictEqual(deathSequenceMs(0), deathSequenceMs(1));
    assert.ok(deathSequenceMs(undefined) > 0);
});

test('šerif roli neodhaluje → sekvence končí odhozením karet', () => {
    const t = deathAnimTimeline(3, true);
    assert.strictEqual(t.total, t.fly, 'konec = okamžik, kdy by jinak vyletěla karta role');
    assert.ok(deathSequenceMs(3, true) < deathSequenceMs(3), 'kratší než s odhalením');
});

test('rozdělená smrt (víc Vulture Samů): pád + odhalení dá dohromady celou sekvenci', () => {
    // Mezi oběma kusy se karty rozebírají po jedné, takže je vynecháme; zbytek musí
    // odpovídat běžné sekvenci bez fáze odlétajících karet.
    const full = deathAnimTimeline(1);
    assert.strictEqual(deathFallMs(), full.cards);
    assert.strictEqual(deathFallMs() + deathRevealMs(), full.total - DEATH_ANIM.cardMs);
    assert.strictEqual(deathRevealMs(true), DEATH_ANIM.settleMs, 'u šerifa jen úklid místa');
});

test('šerifova ztráta karet za pomocníka: bez poklesu životů, roste se stagger', () => {
    assert.strictEqual(penaltyDiscardMs(4) - penaltyDiscardMs(1), 3 * DEATH_ANIM.staggerMs);
    assert.ok(penaltyDiscardMs(1) < deathSequenceMs(1), 'kratší než celá cinematika vyřazení');
    assert.strictEqual(penaltyDiscardMs(0), penaltyDiscardMs(1));
});
