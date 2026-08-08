const { test, describe, before } = require('node:test');
const assert = require('node:assert');

const {
    STAGE_BASE_W, STAGE_BASE_H, STAGE_MAX_W, STAGE_MAX_H, CARD_ART_W,
    computeStage, stageCoverSize,
    LAYOUT_PROFILES, getLayout, currentLayout, pickLayoutProfile,
    resolveLayout, stretchAnchors, boardRowLimit,
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

describe('profil rozložení – desktop je pixelově dnešní stav', () => {
    // Pojistka „PC beze změny": tahle čísla byla do fáze B rozsypaná jako literály
    // ve view/board.js, positions.js a game.js. Když je někdo změní, musí to být vidět.
    test('desktopové hodnoty odpovídají dosavadním literálům', () => {
        const L = LAYOUT_PROFILES.desktop;
        assert.strictEqual(L.scaleMe, 0.36);
        assert.strictEqual(L.scaleOpp, 0.27);
        assert.strictEqual(L.scaleDeck, 0.3);
        assert.strictEqual(L.livesX, 1050);
        assert.strictEqual(L.myBaseY, 970);
        assert.strictEqual(L.livesX + L.roleOffX, 850);          // roleX
        assert.strictEqual(L.livesX + L.handOffX, 1210);         // handAreaStart
        assert.strictEqual(L.handEndX, 1860);
        assert.strictEqual(L.handMaxSpacing, 117);
        assert.strictEqual(L.boardGap, 10);
        assert.strictEqual(L.boardMaxPerRow, 6);
        assert.strictEqual(L.myHandAnchorX, 1450);
        assert.strictEqual(L.myBaseY + L.btnRowOffY, 800);       // řada tlačítek
        assert.strictEqual(L.btnH, 62);
        assert.strictEqual(L.specScale, 0.27);
        assert.strictEqual(L.specLivesY, 900);
        assert.strictEqual(L.specHandY, 1065);
        assert.strictEqual(L.oppGap, 10);
        assert.strictEqual(L.oppHandOff, 1.1);
        assert.strictEqual(L.oppFanFrac, 0.35);
        assert.strictEqual(L.oppFanMax, 36);
        assert.strictEqual(L.oppFanSpan, 3.5);
        assert.strictEqual(L.centerX - L.deckOffX, 870);         // DECK_X
        assert.strictEqual(L.centerX + L.deckOffX, 1050);        // DISCARD_X
        assert.strictEqual(L.pileY, 540);
        assert.strictEqual(L.hnPileX, 1170);
        assert.strictEqual(L.hnActiveX, 1280);
        assert.strictEqual(L.storeRowOffY, 188);
        assert.strictEqual(L.storeSpacing, 120);
        assert.strictEqual(L.anchors, null);                     // = základní OPPONENT_ANCHORS
    });

    test('mimo prohlížeč (testy, server) platí desktopový profil', () => {
        assert.strictEqual(currentLayout(), LAYOUT_PROFILES.desktop);
        assert.strictEqual(getLayout('desktop'), LAYOUT_PROFILES.desktop);
        assert.strictEqual(getLayout('mobile'), LAYOUT_PROFILES.mobile);
        assert.strictEqual(getLayout('nesmysl'), LAYOUT_PROFILES.desktop);
        assert.strictEqual(getLayout(undefined), LAYOUT_PROFILES.desktop);
    });

    test('PILE_SCALE v game.js musí sedět se scaleDeck, kterým kreslí board.js', () => {
        assert.strictEqual(LAYOUT_PROFILES.desktop.scaleDeck, LAYOUT_PROFILES.mobile.scaleDeck);
    });
});

describe('resolveLayout – co se lepí na okraj jeviště', () => {
    const D = LAYOUT_PROFILES.desktop;
    const BASE = computeStage(1920, 1080);

    test('na 16:9 vrací TÝŽ profil (PC ve fullscreenu je pixelově dnešní stav)', () => {
        assert.strictEqual(resolveLayout(D, BASE), D);
        assert.strictEqual(resolveLayout(D, computeStage(1366, 768)), D);
        // vyšší než 16:9 roste jen do výšky → vodorovné hodnoty se taky nemění
        assert.strictEqual(resolveLayout(D, computeStage(1000, 1000)), D);
    });

    test('konec ruky drží stejné odsazení od PRAVÉHO okraje jako dnes od kraje plátna', () => {
        assert.strictEqual(D.handEndX, STAGE_BASE_W - D.handEndMargin);   // 1860
        for (const [vw, vh] of [[1600, 800], [844, 390], [3440, 1440]]) {
            const st = computeStage(vw, vh);
            const L = resolveLayout(D, st);
            assert.strictEqual(L.handEndX, st.right - D.handEndMargin, `${vw}×${vh}`);
            assert.ok(L.handEndX > D.handEndX, 'ruka se má natáhnout doprava');
        }
    });

    test('širší jeviště = víc vyložených karet v jedné řadě, ale pořád na jevišti', () => {
        for (const [vw, vh, expect] of [[1920, 1080, 6], [1600, 800, 7], [844, 390, 7]]) {
            const st = computeStage(vw, vh);
            const L = resolveLayout(D, st);
            assert.strictEqual(L.boardMaxPerRow, expect, `${vw}×${vh}`);
            // nejlevější karta řady nesmí přetéct přes levý okraj
            const cardW = CARD_ART_W * L.scaleMe;
            const step = cardW + L.boardGap;
            const leftEdge = (L.livesX + L.roleOffX) - L.boardMaxPerRow * step - cardW / 2;
            assert.ok(leftEdge >= st.left, `${vw}×${vh}: ${leftEdge} < ${st.left}`);
        }
    });

    test('boardRowLimit na základním jevišti dá dnešních 6', () => {
        assert.strictEqual(boardRowLimit(D, BASE), D.boardMaxPerRow);
    });

    test('zbytek profilu se dopočtem nemění', () => {
        const L = resolveLayout(D, computeStage(1600, 800));
        for (const k of Object.keys(D)) {
            if (k === 'handEndX' || k === 'boardMaxPerRow') continue;
            assert.deepStrictEqual(L[k], D[k], 'pole ' + k);
        }
    });
});

describe('stretchAnchors – krajní soupeři se lepí na okraj', () => {
    const D = LAYOUT_PROFILES.desktop;
    const ROW = [
        { x: 180, y: 540, side: 'left' },
        { x: 600, y: 150, side: 'top' },
        { x: 1320, y: 150, side: 'top' },
        { x: 1740, y: 540, side: 'right' },
    ];

    test('na 16:9 vrací původní pole beze změny (žádná alokace)', () => {
        assert.strictEqual(stretchAnchors(ROW, D, computeStage(1920, 1080)), ROW);
        assert.strictEqual(stretchAnchors(ROW, D, computeStage(1000, 1000)), ROW);
        assert.deepStrictEqual(stretchAnchors([], D, computeStage(1600, 800)), []);
    });

    test('krajní kotvy sedí u okraje jeviště, střed zůstává středem', () => {
        for (const [vw, vh] of [[1600, 800], [844, 390], [3440, 1440]]) {
            const st = computeStage(vw, vh);
            const out = stretchAnchors(ROW, D, st);
            assert.strictEqual(out[0].x, st.left + D.oppEdgeMargin, `${vw}×${vh} vlevo`);
            assert.strictEqual(out[3].x, st.right - D.oppEdgeMargin, `${vw}×${vh} vpravo`);
            // souměrnost kolem 960 (kamera drží starou soustavu uprostřed)
            assert.strictEqual(out[1].x + out[2].x, STAGE_BASE_W, `${vw}×${vh} souměrnost`);
            assert.ok(out[1].x < 600 && out[2].x > 1320, 'prostřední se rozestoupí');
            // y a strana se nemění
            out.forEach((a, i) => {
                assert.strictEqual(a.y, ROW[i].y);
                assert.strictEqual(a.side, ROW[i].side);
            });
        }
    });

    test('jediná horní kotva zůstane přesně uprostřed', () => {
        const st = computeStage(844, 390);
        const [a] = stretchAnchors([{ x: 960, y: 150, side: 'top' }], D, st);
        assert.strictEqual(a.x, 960);
    });
});

describe('pickLayoutProfile', () => {
    test('?ui= přebije všechno ostatní', () => {
        assert.strictEqual(pickLayoutProfile({ query: 'mobile', stored: 'normal', width: 1920 }), 'mobile');
        assert.strictEqual(pickLayoutProfile({ query: 'desktop', stored: 'big', width: 400 }), 'desktop');
        assert.strictEqual(pickLayoutProfile({ query: 'blbost', width: 1920 }), 'desktop');
    });

    test('ruční přepínač přebije automatiku', () => {
        assert.strictEqual(pickLayoutProfile({ stored: 'big', width: 1920 }), 'mobile');
        assert.strictEqual(pickLayoutProfile({ stored: 'normal', width: 400, coarse: true }), 'desktop');
    });

    test('automatika podle šířky a dotyku', () => {
        assert.strictEqual(pickLayoutProfile({ width: 1920 }), 'desktop');
        assert.strictEqual(pickLayoutProfile({ width: 844 }), 'desktop');        // úzké okno myší
        assert.strictEqual(pickLayoutProfile({ width: 844, coarse: true }), 'mobile');
        assert.strictEqual(pickLayoutProfile({ width: 700 }), 'mobile');         // hodně malé okno
        assert.strictEqual(pickLayoutProfile({ width: 1280, coarse: true }), 'desktop');  // tablet naležato
    });

    test('bez rozměru raději desktop', () => {
        assert.strictEqual(pickLayoutProfile({}), 'desktop');
        assert.strictEqual(pickLayoutProfile(), 'desktop');
        assert.strictEqual(pickLayoutProfile({ width: 0 }), 'desktop');
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
