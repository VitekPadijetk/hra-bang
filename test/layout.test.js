const { test, describe, before } = require('node:test');
const assert = require('node:assert');

const {
    STAGE_BASE_W, STAGE_BASE_H, STAGE_MAX_W, STAGE_MAX_H, CARD_ART_W, CARD_ART_H,
    computeStage, stageCoverSize,
    LAYOUT_PROFILES, getLayout, currentLayout, pickLayoutProfile,
    resolveLayout, stretchAnchors, boardRowLimit,
    COMPACT, compactMetrics, compactAnchors, compactColLeft, compactColCenter,
    compactBoardStep, compactBoardPos, compactHandPos, compactNameY,
    oppScale, handCardScale, myHandRow, myHandSlotX,
    boardBand, boardSlot,
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
        assert.strictEqual(L.handStartX, 1210);                  // handAreaStart
        assert.strictEqual(L.handEndX, 1860);
        assert.strictEqual(L.handMaxSpacing, 117);
        assert.strictEqual(L.boardGap, 10);
        assert.strictEqual(L.boardMaxPerRow, 6);
        assert.strictEqual(L.myHandAnchorX, 1450);
        // ruka leží v jedné řadě se stolem a ve stejné velikosti jako dnes
        assert.strictEqual(L.handY, L.myBaseY);
        assert.strictEqual(L.scaleHand, L.scaleMe);
        assert.strictEqual(L.myBaseY + L.myNameOffY, 1115);      // moje jmenovka
        assert.strictEqual(L.myBaseY + L.myStatusOffY, 1148);
        assert.strictEqual(L.myBaseY + L.myHintOffY, 1155);
        assert.strictEqual(L.btnEndX, 820);                      // UKONČIT TAH
        assert.strictEqual(L.btnAbilX, 1320);                    // SID/CHUCK/JOSÉ/DOC
        assert.strictEqual(L.btnEndY, 800);
        assert.strictEqual(L.btnAbilY, 800);
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
        assert.strictEqual(L.storeLift, 120);
        assert.strictEqual(L.anchors, null);                     // = základní OPPONENT_ANCHORS
        assert.strictEqual(L.handAlign, 'left');                 // ruka roste od handStartX
    });

    test('myHandRow na desktopu dává přesně dnešní rozteč zleva', () => {
        const L = LAYOUT_PROFILES.desktop;
        for (const k of [1, 2, 5, 6, 10]) {
            const r = myHandRow(L, k);
            assert.strictEqual(r.startX, L.handStartX, `${k} karet: začátek ruky`);
            assert.strictEqual(r.spacing, Math.min(L.handMaxSpacing, (L.handEndX - L.handStartX) / k));
            assert.strictEqual(myHandSlotX(L, 0, k), L.handStartX);
        }
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

// ── Kompaktní řada soupeřů (mobilní profil) ─────────────────────────────────
// Sloupec musí zůstat UVNITŘ své šířky (jinak zasáhne souseda) a UVNITŘ pásma
// (jinak přeteče na balíčky). Obojí jde spočítat bez prohlížeče, takže se to tady
// kontroluje pro každý počet hráčů na všech reálných poměrech stran.
const MOB = LAYOUT_PROFILES.mobile;
const STAGES = [[1920, 1080], [1600, 800], [844, 390], [915, 412], [2340, 1080]];

describe('compactMetrics – měřítko sloupce', () => {
    test('na desktopovém profilu se kompaktní řada nepoužívá', () => {
        assert.strictEqual(LAYOUT_PROFILES.desktop.oppMode, 'ring');
        assert.strictEqual(MOB.oppMode, 'compact');
        // oppScale/handCardScale proto na desktopu vrací prostý profil (PC beze změny).
        for (let n = 1; n <= 6; n++) {
            assert.strictEqual(oppScale(LAYOUT_PROFILES.desktop, n), 0.27);
            assert.strictEqual(handCardScale(LAYOUT_PROFILES.desktop, n, false), 0.27);
            assert.strictEqual(handCardScale(LAYOUT_PROFILES.desktop, n, true), 0.36);
        }
    });

    test('měřítko drží v mezích a s přibývajícími soupeři neroste', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            let prev = Infinity;
            for (let n = 1; n <= 6; n++) {
                const m = compactMetrics(n, MOB, st);
                assert.ok(m.scale >= COMPACT.minScale - 1e-9, `${vw}×${vh} n=${n} min`);
                assert.ok(m.scale <= COMPACT.maxScale + 1e-9, `${vw}×${vh} n=${n} max`);
                assert.ok(m.scale <= prev + 1e-9, `${vw}×${vh} n=${n} neroste`);
                prev = m.scale;
            }
        }
    });

    test('karty soupeřů jsou větší než v okruhu (kvůli tomu to celé je)', () => {
        // 0.27 = dnešní scaleOpp; na telefonu na šířku musí vyjít víc i pro 7 hráčů.
        const st = computeStage(844, 390);
        for (let n = 1; n <= 6; n++) {
            assert.ok(compactMetrics(n, MOB, st).scale > 0.27, `n=${n}`);
        }
    });

    test('širší jeviště = širší sloupce (telefon má víc místa než 16:9)', () => {
        const base = compactMetrics(6, MOB, computeStage(1920, 1080));
        const wide = compactMetrics(6, MOB, computeStage(844, 390));
        assert.ok(wide.colW > base.colW, 'sloupec se roztáhne');
        assert.ok(wide.scale > base.scale, 'a karty jsou tím pádem větší');
    });

    test('řada je vystředěná a vejde se na jeviště', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            for (let n = 1; n <= 6; n++) {
                const m = compactMetrics(n, MOB, st);
                const rowW = n * m.colW;
                assert.ok(m.startX >= st.left - 1e-9, `${vw}×${vh} n=${n} levý okraj`);
                assert.ok(m.startX + rowW <= st.right + 1e-9, `${vw}×${vh} n=${n} pravý okraj`);
                assert.ok(Math.abs((m.startX + rowW / 2) - (st.left + st.w / 2)) < 1e-9, 'vystředěno');
            }
        }
    });
});

describe('compactAnchors – sloupce soupeřů', () => {
    test('počet, strana a rovnoměrné rozestupy', () => {
        const st = computeStage(844, 390);
        const a = compactAnchors(5, MOB, st);
        assert.strictEqual(a.length, 5);
        a.forEach(x => assert.strictEqual(x.side, 'compact'));
        a.forEach(x => assert.strictEqual(x.y, a[0].y));   // všichni v jedné řadě
        const m = compactMetrics(5, MOB, st);
        for (let i = 1; i < a.length; i++) {
            assert.ok(Math.abs((a[i].x - a[i - 1].x) - m.colW) < 1e-9, 'rozestup = colW');
        }
    });

    test('kotva je střed karty životů a leží ve svém sloupci', () => {
        const st = computeStage(1600, 800);
        const m = compactMetrics(4, MOB, st);
        const a = compactAnchors(4, MOB, st);
        assert.ok(Math.abs(compactColLeft(a[0], m) - m.startX) < 1e-9, 'levý okraj sloupce');
        assert.ok(Math.abs(a[0].y - (m.top + m.cardW / 2)) < 1e-9, 'svisle na vršku pásma');
    });
});

describe('kompaktní sloupec se vejde do své šířky', () => {
    // Portrét jede po nábojích doprava (jako soupeř vlevo), takže při 5 životech sahá
    // skupina nejdál – nesmí přesto vylézt ze sloupce k sousedovi.
    test('životy + portrét při plných 5 životech', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            for (let n = 1; n <= 6; n++) {
                const m = compactMetrics(n, MOB, st);
                const a = compactAnchors(n, MOB, st)[n - 1];
                const bulletH = m.cardH * 0.93 / 5;
                const right = a.x + bulletH * 5 + m.cardH / 2;
                assert.ok(right <= compactColLeft(a, m) + m.colW + 1e-9,
                    `${vw}×${vh} n=${n}: portrét vyčnívá`);
            }
        }
    });

    test('vyložené karty i vějíř ruky – od 4. karty se rozestup zmenší', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            for (const n of [1, 3, 6]) {
                const m = compactMetrics(n, MOB, st);
                const a = compactAnchors(n, MOB, st)[0];
                const rightEdge = compactColLeft(a, m) + m.colW;
                for (const k of [1, 3, 4, 7]) {
                    const last = compactBoardPos(a, k - 1, k, m);
                    assert.ok(last.x + m.cardW / 2 <= rightEdge + 1e-9,
                        `${vw}×${vh} n=${n} k=${k}: stůl vyčnívá`);
                    const hand = compactHandPos(a, k - 1, k, m);
                    assert.ok(hand.x + CARD_ART_W * m.fanScale / 2 <= rightEdge + 1e-9,
                        `${vw}×${vh} n=${n} k=${k}: vějíř vyčnívá`);
                }
                // do perRow karet žádný překryv, teprve od další
                assert.ok(Math.abs(compactBoardStep(COMPACT.perRow, m) - (m.cardW + COMPACT.gap)) < 1e-9);
                assert.ok(compactBoardStep(COMPACT.perRow + 2, m) < m.cardW + COMPACT.gap);
            }
        }
    });
});

describe('kompaktní sloupec se vejde do pásma nad balíčky', () => {
    test('spodek řady vyložených karet nedosáhne na balíčky', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            // spodek pásma v souřadnicích 0…1080 (pod ním je horní hrana balíčků)
            const bandBottom = MOB.oppTop + MOB.oppBandH;
            for (let n = 1; n <= 6; n++) {
                const m = compactMetrics(n, MOB, st);
                const a = compactAnchors(n, MOB, st)[0];
                const bottom = compactBoardPos(a, 0, 1, m).y + m.cardH / 2;
                assert.ok(bottom <= bandBottom + 1e-9, `${vw}×${vh} n=${n}: sloupec přetéká`);
            }
        }
    });

    test('pořadí řad ve sloupci: životy → ruka → jméno → stůl', () => {
        const st = computeStage(1920, 1080);
        const m = compactMetrics(4, MOB, st);
        const a = compactAnchors(4, MOB, st)[0];
        const livesBottom = a.y + m.cardW / 2;
        const hand = compactHandPos(a, 0, 3, m);
        const name = compactNameY(a, m);
        const board = compactBoardPos(a, 0, 1, m);
        assert.ok(hand.y - CARD_ART_H * m.fanScale / 2 >= livesBottom, 'ruka pod životy');
        assert.ok(name >= hand.y + CARD_ART_H * m.fanScale / 2, 'jméno pod rukou');
        assert.ok(board.y - m.cardH / 2 >= name, 'stůl pod jménem');
        assert.ok(Math.abs(compactColCenter(a, m) - (compactColLeft(a, m) + m.colW / 2)) < 1e-9);
    });

    // Sloupce uprostřed stojí přímo nad balíčkem/odhozem. Řada vyložených karet se
    // s jejich počtem nikam neposouvá (od 4. karty se jen zmenšuje rozestup), takže
    // stačí ověřit spodek řady proti NEJVYŠŠÍMU balíčku – 80 vrstev po 0,125 px.
    test('řada vyložených karet nedosáhne ani na plný balíček', () => {
        const fullPileTop = MOB.pileY - 79 * 0.125 - CARD_ART_H * MOB.scaleDeck / 2;
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            for (let n = 1; n <= 6; n++) {
                const m = compactMetrics(n, MOB, st);
                for (const a of compactAnchors(n, MOB, st)) {
                    for (const k of [1, 3, 4, 8, 12]) {
                        const bottom = compactBoardPos(a, k - 1, k, m).y + m.cardH / 2;
                        assert.ok(bottom + 10 <= fullPileTop,
                            `${vw}×${vh}, ${n} soupeřů, ${k} karet: řada sahá na balíček (${bottom.toFixed(1)})`);
                    }
                }
            }
        }
    });

    test('vějíř ruky je menší než vyložené karty (jinak by se sloupec nevešel)', () => {
        const st = computeStage(844, 390);
        const m = compactMetrics(3, MOB, st);
        assert.ok(m.fanScale < m.scale);
        assert.strictEqual(handCardScale(MOB, 3, false, st), m.fanScale);
        assert.strictEqual(oppScale(MOB, 3, st), m.scale);
    });
});

// ── Mobilní moje zóna: stůl a pod ním ruka přes celou šířku ─────────────────
// Pásma se nesmí překrývat. Portrét jede po kartě životů VZHŮRU (až 0,93 výšky
// karty při 5 životech), takže tohle je nejtěsnější místo celého rozložení.
describe('mobilní moje zóna – pásma se nekříží', () => {
    const halfH = (s) => CARD_ART_H * s / 2;

    test('ruka má vlastní řadu pod stolem a vejde se na jeviště', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            const L = resolveLayout(MOB, st);
            assert.ok(L.scaleHand > L.scaleMe, 'karty v ruce jsou větší než na stole');
            assert.ok(L.handY - halfH(L.scaleHand) >= L.myBaseY + halfH(L.scaleMe) - 1e-9,
                `${vw}×${vh}: ruka leze na stůl`);
            assert.ok(L.handY + halfH(L.scaleHand) <= st.bottom + 1e-9, `${vw}×${vh}: ruka pod jevištěm`);
        }
    });

    test('portrét při 5 životech nedosáhne na řadu soupeřů', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            const L = resolveLayout(MOB, st);
            const bulletH = CARD_ART_H * L.scaleMe * 0.93 / 5;
            const charTop = L.myBaseY - bulletH * 5 - halfH(L.scaleMe);
            assert.ok(charTop >= L.oppTop + L.oppBandH + 1e-9, `${vw}×${vh}: portrét v pásmu soupeřů`);
        }
    });

    test('můj stůl leží pod balíčky a tlačítka vedle karty životů', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            const L = resolveLayout(MOB, st);
            assert.ok(L.myBaseY - halfH(L.scaleMe) >= L.pileY + halfH(L.scaleDeck) - 1e-9,
                `${vw}×${vh}: stůl na balíčcích`);
            const livesRight = L.livesX + CARD_ART_W * L.scaleMe / 2;
            assert.ok(L.btnEndX - 320 / 2 >= livesRight, `${vw}×${vh}: tlačítka na kartě životů`);
            assert.ok(L.btnEndX + 320 / 2 <= st.right + 1e-9, `${vw}×${vh}: tlačítka mimo jeviště`);
            assert.ok(L.btnEndY + L.btnH / 2 <= L.btnAbilY - L.btnH / 2 + 1e-9, 'dvě řady tlačítek na sobě');
        }
    });

    test('do ruky se vejde 5 karet bez překryvu a nevyčuhují z jeviště', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            const L = resolveLayout(MOB, st);
            const cardW = CARD_ART_W * L.scaleHand;
            assert.ok(Math.abs(L.handMaxSpacing - cardW) < 0.6, 'rozestup = šířka karty');
            const spacing = Math.min(L.handMaxSpacing, (L.handEndX - L.handStartX) / 5);
            assert.ok(Math.abs(spacing - L.handMaxSpacing) < 1e-9, `${vw}×${vh}: 5 karet se překrývá`);
            assert.ok(L.handStartX - cardW / 2 >= st.left + 1e-9, `${vw}×${vh}: ruka vlevo přetéká`);
            assert.ok(L.handStartX + 4 * spacing + cardW / 2 <= st.right + 1e-9, `${vw}×${vh}: ruka vpravo přetéká`);
        }
    });

    test('ruka je v pásu vystředěná a nepřeteče přes jeho okraje', () => {
        for (const [vw, vh] of STAGES) {
            const st = computeStage(vw, vh);
            const L = resolveLayout(MOB, st);
            const mid = (L.handStartX + L.handEndX) / 2;
            assert.ok(Math.abs(mid - (st.left + st.right) / 2) < 1e-9, `${vw}×${vh}: pás není uprostřed`);
            for (const k of [1, 3, 5, 9, 15, 22]) {
                const r = myHandRow(L, k);
                const last = myHandSlotX(L, k - 1, k);
                assert.ok(Math.abs((r.startX + last) / 2 - mid) < 1e-9, `${vw}×${vh}, ${k} karet: není vystředěná`);
                assert.ok(r.startX >= L.handStartX - 1e-9, `${vw}×${vh}, ${k} karet: přetéká vlevo`);
                assert.ok(last <= L.handEndX + 1e-9, `${vw}×${vh}, ${k} karet: přetéká vpravo`);
            }
            // Jedna karta leží přesně uprostřed = tam, kam míří kotva ruky (myHandAnchorX).
            assert.ok(Math.abs(myHandSlotX(L, 0, 1) - L.myHandAnchorX) < 1e-9, `${vw}×${vh}: kotva ruky`);
        }
    });

    test('řada hokynářství se vejde mezi zvednuté balíčky a můj stůl', () => {
        const L = resolveLayout(MOB, computeStage(844, 390));
        const pilesTopY = L.pileY - L.storeLift;
        const rowY = pilesTopY + L.storeRowOffY;
        assert.ok(rowY - halfH(L.scaleDeck) >= pilesTopY + halfH(L.scaleDeck) - 1e-9, 'řada leze na balíčky');
        assert.ok(rowY + halfH(L.scaleDeck) <= L.myBaseY - halfH(L.scaleMe) + 1e-9, 'řada leze na můj stůl');
    });

    test('začátek ruky i tlačítka se lepí na okraj jeviště', () => {
        const st = computeStage(844, 390);
        const L = resolveLayout(MOB, st);
        assert.strictEqual(L.handStartX, st.left + MOB.handStartMargin);
        assert.strictEqual(L.handEndX, st.right - MOB.handEndMargin);
        assert.strictEqual(L.btnEndX, st.right - MOB.btnMargin);
        assert.strictEqual(L.btnAbilX, st.right - MOB.btnMargin);
        // na 16:9 zůstávají literály z profilu (resolveLayout je tam identita)
        assert.strictEqual(resolveLayout(MOB, computeStage(1920, 1080)), MOB);
    });
});

// ── Pás vyložených karet (boardBand/boardSlot) ───────────────────────────────
// Řady rostou vždy směrem k balíčkům uprostřed stolu, takže je jejich počet
// zastropovaný a přeplněná řada se místo další řady jen zhustí. Půdorys pásu
// proto zůstává stejný, ať má hráč na stole cokoli.
describe('boardBand – pás vyložených karet', () => {
    const DSK = LAYOUT_PROFILES.desktop;
    const cardW = CARD_ART_W * DSK.scaleOpp;   // 87.75
    const gap = DSK.oppGap;                    // 10
    const rows = DSK.oppBoardRows;             // 2
    const perRow = DSK.oppBoardPerRow;         // 3

    test('do kapacity pásu je rozestup přesně karta + mezera (dnešní stav)', () => {
        for (let k = 1; k <= rows * perRow; k++) {
            const b = boardBand(k, rows, perRow, cardW, gap);
            assert.strictEqual(b.step, cardW + gap, `k=${k}`);
            assert.strictEqual(b.perRow, perRow, `k=${k}`);
            assert.strictEqual(b.rows, rows, `k=${k}`);
        }
    });

    test('do kapacity pásu jsou slouty přesně dnešní % perRow / floor(/perRow)', () => {
        const b = boardBand(rows * perRow, rows, perRow, cardW, gap);
        for (let i = 0; i < rows * perRow; i++) {
            assert.deepStrictEqual(boardSlot(i, b),
                { row: Math.floor(i / perRow), col: i % perRow }, `i=${i}`);
        }
    });

    test('nad kapacitu nepřibude řada – zhustí se rozestup', () => {
        for (let k = rows * perRow + 1; k <= 20; k++) {
            const b = boardBand(k, rows, perRow, cardW, gap);
            assert.strictEqual(b.rows, rows, `k=${k}`);
            assert.ok(b.step < cardW + gap, `k=${k}: rozestup se nezhustil`);
            assert.ok(b.step > 0, `k=${k}: nulový rozestup`);
            // žádná karta nevypadne z povolených řad
            for (let i = 0; i < k; i++) {
                assert.ok(boardSlot(i, b).row < rows, `k=${k} i=${i}: přetekla řada`);
            }
        }
    });

    test('půdorys pásu se s počtem karet nemění', () => {
        const spanOf = (k) => {
            const b = boardBand(k, rows, perRow, cardW, gap);
            let max = 0;
            for (let i = 0; i < k; i++) max = Math.max(max, boardSlot(i, b).col * b.step);
            return max + cardW;
        };
        const full = spanOf(perRow);   // rozpětí plné, nezhuštěné řady
        for (let k = perRow; k <= 20; k++) {
            assert.ok(spanOf(k) <= full + 1e-9, `k=${k}: pás se rozšířil (${spanOf(k)} > ${full})`);
        }
    });

    test('degenerované vstupy nespadnou', () => {
        assert.strictEqual(boardBand(0, rows, perRow, cardW, gap).step, cardW + gap);
        assert.strictEqual(boardBand(1, 0, 0, cardW, gap).rows, 1);
        assert.ok(Number.isFinite(boardBand(9, 1, 1, cardW, gap).step));
    });

    test('moje zóna: mobil má jednu řadu, desktop dvě', () => {
        assert.strictEqual(DSK.myBoardRows, 2);
        assert.strictEqual(LAYOUT_PROFILES.mobile.myBoardRows, 1);
        const mob = LAYOUT_PROFILES.mobile;
        const b = boardBand(15, mob.myBoardRows, mob.boardMaxPerRow,
                            CARD_ART_W * mob.scaleMe, mob.boardGap);
        assert.strictEqual(b.rows, 1);
        for (let i = 0; i < 15; i++) assert.strictEqual(boardSlot(i, b).row, 0);
    });
});
