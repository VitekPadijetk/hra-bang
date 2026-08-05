// Časování cinematiky vyřazení hráče (core/deathAnim.js). Sdílí ho klient
// (net/handlers.js přehrává) i server (server/anim.js drží boty) – proto se hlídá,
// že fáze jdou po sobě a že celková délka roste s počtem odlétajících karet.
const test = require('node:test');
const assert = require('node:assert');
const { DEATH_ANIM, deathAnimTimeline, deathSequenceMs } = require('../core/deathAnim.js');

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
