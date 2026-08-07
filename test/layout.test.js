const { test, describe, before } = require('node:test');
const assert = require('node:assert');

const {
    STAGE_BASE_W, STAGE_BASE_H, STAGE_MAX_W, STAGE_MAX_H,
    computeStage, stageCoverSize,
} = require('../core/layout.js');

before(() => { console.log = () => {}; });

// Měřítko, které Phaser (Scale.FIT) použije pro dané jeviště.
const fitScale = (vw, vh, st) => Math.min(vw / st.w, vh / st.h);
// Měřítko, které hra měla PŘED zavedením jeviště (pevné plátno 1920×1080).
const legacyScale = (vw, vh) => Math.min(vw / STAGE_BASE_W, vh / STAGE_BASE_H);

describe('computeStage – poměr 16:9 (PC beze změny)', () => {
    test('přesně 1920×1080 vrací základní jeviště bez posunu', () => {
        const st = computeStage(1920, 1080);
        assert.deepStrictEqual(st, {
            w: 1920, h: 1080, dx: 0, dy: 0,
            left: 0, right: 1920, top: 0, bottom: 1080,
        });
    });

    test('jakýkoli 16:9 displej dá základní jeviště', () => {
        for (const [vw, vh] of [[1280, 720], [1600, 900], [3840, 2160]]) {
            const st = computeStage(vw, vh);
            assert.strictEqual(st.w, 1920, `${vw}×${vh}`);
            assert.strictEqual(st.h, 1080, `${vw}×${vh}`);
            assert.strictEqual(st.dx, 0);
            assert.strictEqual(st.dy, 0);
        }
    });
});

describe('computeStage – širší než 16:9 (telefon na šířku, okno prohlížeče)', () => {
    test('iPhone 14 na šířku (844×390) přidá přes 400 design px šířky', () => {
        const st = computeStage(844, 390);
        assert.strictEqual(st.h, 1080);          // výška je pořád soustava hry
        assert.ok(st.w > 2300 && st.w <= 2340, 'šířka jeviště: ' + st.w);
        assert.strictEqual(st.w - 1920, st.dx * 2);
        assert.strictEqual(st.left, -st.dx);
        assert.strictEqual(st.right, 1920 + st.dx);
    });

    test('okno prohlížeče na PC (1600×800) taky roste do šířky', () => {
        const st = computeStage(1600, 800);
        assert.strictEqual(st.h, 1080);
        assert.strictEqual(st.w, 2160);          // 1080 × 2,0
        assert.strictEqual(st.dx, 120);
    });

    test('ultraširoký monitor se zastaví na stropu', () => {
        const st = computeStage(3440, 1440);     // 21,5:9 → 2580 design px
        assert.strictEqual(st.w, STAGE_MAX_W);
        assert.strictEqual(st.h, STAGE_BASE_H);
    });
});

describe('computeStage – vyšší než 16:9', () => {
    test('roste výška, ne šířka', () => {
        const st = computeStage(1000, 1000);
        assert.strictEqual(st.w, 1920);
        assert.strictEqual(st.h, 1440);          // 1920 / 1,0, oříznuto stropem
        assert.strictEqual(st.dy, 180);
        assert.strictEqual(st.top, -180);
        assert.strictEqual(st.bottom, 1260);
    });

    test('výška se zastaví na stropu', () => {
        const st = computeStage(400, 900);       // velmi úzké okno
        assert.strictEqual(st.h, STAGE_MAX_H);
    });
});

describe('computeStage – invarianty', () => {
    const VIEWPORTS = [
        [1920, 1080], [1600, 800], [1366, 768], [1440, 900], [844, 390],
        [915, 412], [740, 360], [3440, 1440], [1000, 1000], [400, 900], [2560, 1080],
    ];

    test('rozměry jsou sudé (posun kamery je celé pixely)', () => {
        for (const [vw, vh] of VIEWPORTS) {
            const st = computeStage(vw, vh);
            assert.strictEqual(st.w % 2, 0, `${vw}×${vh} w=${st.w}`);
            assert.strictEqual(st.h % 2, 0, `${vw}×${vh} h=${st.h}`);
        }
    });

    test('jeviště se nikdy nezmenší pod základ a stará soustava zůstane uprostřed', () => {
        for (const [vw, vh] of VIEWPORTS) {
            const st = computeStage(vw, vh);
            assert.ok(st.w >= STAGE_BASE_W, `${vw}×${vh}`);
            assert.ok(st.h >= STAGE_BASE_H, `${vw}×${vh}`);
            assert.strictEqual(st.left + st.right, STAGE_BASE_W);
            assert.strictEqual(st.top + st.bottom, STAGE_BASE_H);
        }
    });

    test('obsah se nikdy nezmenší proti dnešku (jen přibude viditelná plocha)', () => {
        for (const [vw, vh] of VIEWPORTS) {
            const st = computeStage(vw, vh);
            const now = fitScale(vw, vh, st);
            const before = legacyScale(vw, vh);
            assert.ok(now >= before - 1e-9, `${vw}×${vh}: ${now} < ${before}`);
        }
    });

    test('nesmyslný vstup spadne na základní jeviště', () => {
        for (const bad of [[0, 0], [NaN, 500], [undefined, undefined], [-100, 200]]) {
            const st = computeStage(bad[0], bad[1]);
            assert.strictEqual(st.w, STAGE_BASE_W);
            assert.strictEqual(st.h, STAGE_BASE_H);
        }
    });
});

describe('stageCoverSize', () => {
    test('na základním jevišti je pozadí přesně 1920×1080', () => {
        const c = stageCoverSize(computeStage(1920, 1080));
        assert.deepStrictEqual(c, { w: 1920, h: 1080 });
    });

    test('pozadí vždy pokryje jeviště a drží poměr stran', () => {
        for (const [vw, vh] of [[844, 390], [1600, 800], [1000, 1000], [3440, 1440]]) {
            const st = computeStage(vw, vh);
            const c = stageCoverSize(st);
            assert.ok(c.w >= st.w - 1e-9, `${vw}×${vh} šířka`);
            assert.ok(c.h >= st.h - 1e-9, `${vw}×${vh} výška`);
            assert.ok(Math.abs(c.w / c.h - STAGE_BASE_W / STAGE_BASE_H) < 1e-9, 'poměr stran');
        }
    });
});
