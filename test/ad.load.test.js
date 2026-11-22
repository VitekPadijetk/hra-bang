// Zátěž rozšíření Ozbrojení a nebezpeční: hry jen botů s namnoženými kartami hotových
// fází. Ve vlastním souboru, aby běžela souběžně s ostatní zátěží (harness:
// test/_botHarness.js). Plán: docs/ozbrojeni-a-nebezpecni-plan.md §7.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState } = require('../logic.js');
const { buildCtx, pumpToWinner, cardData } = require('./_botHarness.js');
const { adSupply, adCardsInPlay, AD_LOAD_CAP, AD_LOAD_TOTAL } = require('../core/armed.js');
const { isInPlay } = require('../core/distance.js');
const { ARMED_CHARACTERS } = require('../logic/entities.js');

const rd = (f) => JSON.parse(fs.readFileSync(__dirname + '/../' + f, 'utf8'));
const dodgeCityCardData = rd('cards.dodge_city.json');
const highNoonCardData = rd('cards.high_noon.json');
const fistfulCardData = rd('cards.fistful.json');
const wwsCardData = rd('cards.divoky_zapad.json');
const gearCardData = rd('cards.zlata_horecka.json');
const vosCardData = rd('cards.udoli_stinu.json');
const adCardData = rd('cards.ozbrojeni.json');

before(() => { console.log = () => {}; console.warn = () => {}; });

// Invariant žetonů po každé akci: nikde víc než 4 a zásoba mezi 0 a 32 (žetony ve hře
// + zásoba = 32 platí z definice, zásoba se počítá – hlídá se, že nikdy nejde do minusu).
function checkLoads(gs, tag) {
    const s = adSupply(gs);
    assert.ok(s >= 0 && s <= AD_LOAD_TOTAL, `${tag}: zásoba ${s}`);
    gs.players.forEach(p => {
        if (!isInPlay(p)) return;
        assert.ok((p.adLoads || 0) <= AD_LOAD_CAP, `${tag}: ${p.name} má ${p.adLoads} žetonů`);
        adCardsInPlay(p).forEach(c => {
            assert.ok((c.adLoads || 0) <= AD_LOAD_CAP && (c.adLoads || 0) > 0,
                `${tag}: ${c.name} u ${p.name} má ${c.adLoads} žetonů`);
        });
    });
}

// Fáze A1: karty jdou do HLAVNÍHO balíčku – data se namnoží (hotové druhy × 5), ať se
// rozmisťování, použití Nebezpečných karet, Bandalír i vylepšení v každé hře opravdu
// dostanou ke slovu. Hlídá, že se hra jen botů na fázi AD_PLACE nezasekne.
test('Ozbrojení a nebezpeční (A1–A3): hra jen botů doběhne 3–8 hráčů, samo i se vším', () => {
    const READY = ['Eso v rukávu', 'Bečka piva', 'Zvonice', 'Bandalír', 'Nabíjení', 'Kolona', 'Malý doušek',
                   'Big Fifty', 'Buntline Special', 'Dvouhlavňovka', 'Thunderer', 'Bedna', 'Skrč se!',
                   'Křesadlovka', 'Rychlopalba', 'Šíp', 'Paklíč', 'Bič', 'Squaw', 'Rez'];
    let nid = 60000;
    const rich = [];
    for (let copy = 0; copy < 5; copy++) {
        adCardData.filter(c => READY.includes(c.name)).forEach(c => rich.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, all: false });
    COMBOS.push({ n: 4, all: true }, { n: 6, all: true }, { n: 8, all: true });
    // Fáze A3 naředila balíček – dvě partie navíc, ať se každý efekt v sadě objeví.
    COMBOS.push({ n: 5, all: false }, { n: 7, all: true });

    const seen = new Set();
    try {
        COMBOS.forEach(({ n, all }, ci) => {
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = vosCardData;
            gs.adCardData = rich;
            const opts = { expansions: { dodge_city: all, high_noon: all, fistful: all, divoky_zapad: all,
                                         zlata_horecka: all, udoli_stinu: all, ozbrojeni: true } };
            const tag = `${all ? 'vše' : 'jen O&N'} (${n}p)`;
            const room = { id: `ad${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e) return;
                if ((e.ev === 'play' || e.ev === 'bang' || e.ev === 'special') && READY.includes(e.card)) seen.add(e.card);
                if (e.ev === 'play' && e.up) seen.add('vylepšení');
                if (e.ev === 'ad_use') seen.add('použití ' + e.card);
                if ((e.ev === 'bang' || e.ev === 'special') && ['Mexicali Kid', 'Bloody Mary', 'Bass Greeves',
                    'Frankie Canton'].includes(e.card)) seen.add(e.card);
                if (e.ev === 'ad_place') seen.add('rozmístění ' + e.reason);
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Fáze A2: postavy Mexicali Kid a Bloody Mary dostanou dva boti natvrdo.
            if (gs.players[1]) gs.players[1].character = 'Mexicali Kid';
            if (gs.players[2]) gs.players[2].character = 'Bloody Mary';
            // Fáze A3: Frankie Canton, Bass Greeves a Red Ringo jako jediná nabídka výběru –
            // vyberou si je sami, takže Red Ringo dostane 4 žetony při rozdání postav.
            [[0, 'Frankie Canton'], [3, 'Bass Greeves'], [4, 'Red Ringo']].forEach(([k, name]) => {
                if (gs.players[k] && !gs.players[k].character) gs.players[k].charChoices = [name];
            });
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room, (st) => checkLoads(st, tag));
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci s Ozbrojením a nebezpečnými');
    for (const what of [...READY, 'vylepšení', 'použití Eso v rukávu', 'použití Bečka piva',
                        'použití Bandalír', 'rozmístění BLUE', 'rozmístění DISCARD', 'rozmístění RELOAD',
                        'použití Bedna', 'použití Thunderer', 'použití Buntline Special', 'použití Big Fifty',
                        'Mexicali Kid', 'Bloody Mary', 'použití Paklíč', 'použití Bič',
                        'Bass Greeves', 'Frankie Canton', 'rozmístění BASS', 'rozmístění RINGO']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});

// Fáze A4: Bomba – „balíček samých Bomb" (plán §7) s Rezem a Frankiem Cantonem, aby se
// v každé partii sejmulo, předávalo i vybuchovalo, a to i uprostřed cizího tahu (Rez,
// Frankie – zásahy frontou, resume 'QUEUE'). V reálném balíčku je Bomba jedna, tady jich
// leží víc – před jedním hráčem ale nikdy dvě (adBombTargets, adBombPassTargets).
test('Ozbrojení a nebezpeční (A4): balíček samých Bomb – hra jen botů doběhne 3–8 hráčů', () => {
    const MIX = { 'Bomba': 8, 'Rez': 3, 'Nabíjení': 2 };
    let nid = 70000;
    const rich = [];
    Object.entries(MIX).forEach(([name, k]) => {
        const row = adCardData.find(c => c.name === name);
        for (let i = 0; i < k; i++) rich.push({ ...row, id: nid++ });
    });
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, all: false });
    COMBOS.push({ n: 5, all: true }, { n: 7, all: true });

    const seen = new Set();
    try {
        COMBOS.forEach(({ n, all }, ci) => {
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = vosCardData;
            gs.adCardData = rich;
            const opts = { expansions: { dodge_city: all, high_noon: all, fistful: all, divoky_zapad: all,
                                         zlata_horecka: all, udoli_stinu: all, ozbrojeni: true } };
            const tag = `Bomba ${all ? 'vše' : 'jen O&N'} (${n}p)`;
            const room = { id: `adb${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e) return;
                if (e.ev === 'special' && e.card === 'Bomba' && e.target && !e.msg) seen.add('zahrání');
                if (e.ev === 'check' && e.kind === 'AD_BOMB') seen.add('sejmutí');
                if (e.ev === 'special' && e.card === 'Bomba' && /posílá dál/.test(e.msg || '')) seen.add('předání');
                if (e.ev === 'special' && e.card === 'Bomba' && e.msg === 'vybuchla') seen.add('výbuch');
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            if (gs.players[0] && !gs.players[0].character) gs.players[0].charChoices = ['Frankie Canton'];
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room, (st) => {
                checkLoads(st, tag);
                if (st.pendingDynamiteDamage?.resume === 'QUEUE') seen.add('výbuch cizí rukou');
                assert.ok(st.players.every(p => (p.board || []).filter(c => c.type === 'Bomba').length <= 1),
                    `${tag}: dvě Bomby před jedním hráčem`);
            });
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci s Bombou');
    for (const what of ['zahrání', 'sejmutí', 'předání', 'výbuch', 'výbuch cizí rukou']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});

// Fáze A5: Stepní běžec a Julie Cutter – „balíček samých Stepních běžců" (plán §7) s Bombami
// (sejmutí v každém kole) a Julií Cutter + Lucky Dukem u stolu, aby se okno otevíralo nad
// Vězením, Barelem, Bombou, sejmutím Julie i nad výběrem Lucky Duka. Stepní běžec leží
// před hráčem nejvýš jeden (dvě karty stejného jména ne), takže je jich tu tolik, kolik
// je hráčů. Hlídá, že okno nikdy neuvázne (končí nejpozději s posledním žetonem).
test('Ozbrojení a nebezpeční (A5): Stepní běžec a Julie Cutter – hra jen botů doběhne 3–8 hráčů', () => {
    const MIX = { 'Stepní běžec': 8, 'Bomba': 3, 'Nabíjení': 3 };
    let nid = 71000;
    const rich = [];
    Object.entries(MIX).forEach(([name, k]) => {
        const row = adCardData.find(c => c.name === name);
        for (let i = 0; i < k; i++) rich.push({ ...row, id: nid++ });
    });
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, all: false });
    COMBOS.push({ n: 5, all: true }, { n: 7, all: true });

    const seen = new Set();
    try {
        COMBOS.forEach(({ n, all }, ci) => {
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = vosCardData;
            gs.adCardData = rich;
            const opts = { expansions: { dodge_city: all, high_noon: all, fistful: all, divoky_zapad: all,
                                         zlata_horecka: all, udoli_stinu: all, ozbrojeni: true } };
            const tag = `Stepní běžec ${all ? 'vše' : 'jen O&N'} (${n}p)`;
            const room = { id: `adr${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e) return;
                if (e.ev === 'special' && e.card === 'Stepní běžec') seen.add('zopakování');
                if (e.ev === 'check' && e.kind === 'AD_JULIE') seen.add('sejmutí Julie');
                if (e.ev === 'special' && e.card === 'Julie Cutter') seen.add('výstřel Julie');
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            if (gs.players[0] && !gs.players[0].character) gs.players[0].charChoices = ['Julie Cutter'];
            if (gs.players[1] && !gs.players[1].character) gs.players[1].charChoices = ['Lucky Duke'];
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room, (st) => {
                checkLoads(st, tag);
                if (st.phase === 'AD_REDRAW_OFFER') {
                    seen.add('okno');
                    const o = st.players[st.pendingAdRedraw?.ownerIdx];
                    assert.ok(o && adCardsInPlay(o).some(c => c.type === 'Stepní běžec'),
                        `${tag}: okno bez Stepního běžce`);
                    if (st.currentCheck?.reason === 'AD_JULIE') seen.add('okno nad Julií');
                }
            });
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci se Stepním běžcem');
    for (const what of ['okno', 'zopakování', 'sejmutí Julie', 'výstřel Julie']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});

// Fáze A6: okna mimo tah – Al Preacher a Ms. Abigail natvrdo u stolu. Al potřebuje žetony
// (Nabíjení, Eso v rukávu a Bečka piva jsou oranžové – jejich vyložení mu okno otevře),
// Abigail stačí základní balíček (BANG!, Panika, Cat Balou, Duel s hodnotou J–A). Hlídá,
// že okno Al Preachera ani okno úniku s IGNOROVAT nikdy neuváznou.
test('Ozbrojení a nebezpeční (A6): Al Preacher a Ms. Abigail – hra jen botů doběhne 3–8 hráčů', () => {
    const { adAbigailRespondOk } = require('../core/armed.js');
    const MIX = { 'Nabíjení': 6, 'Eso v rukávu': 3, 'Bečka piva': 3, 'Bandalír': 3 };
    let nid = 73000;
    const rich = [];
    Object.entries(MIX).forEach(([name, k]) => {
        const row = adCardData.find(c => c.name === name);
        for (let i = 0; i < k; i++) rich.push({ ...row, id: nid++ });
    });
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, all: false });
    COMBOS.push({ n: 4, all: true }, { n: 6, all: true }, { n: 8, all: true });

    const seen = new Set();
    try {
        COMBOS.forEach(({ n, all }, ci) => {
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = vosCardData;
            gs.adCardData = rich;
            const opts = { expansions: { dodge_city: all, high_noon: all, fistful: all, divoky_zapad: all,
                                         zlata_horecka: all, udoli_stinu: all, ozbrojeni: true } };
            const tag = `Al + Abigail ${all ? 'vše' : 'jen O&N'} (${n}p)`;
            const room = { id: `ada${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e || e.ev !== 'special') return;
                if (e.card === 'Al Preacher' && /líže \(/.test(e.msg || '')) seen.add('Al líže');
                if (e.card === 'Ms. Abigail') seen.add('Abigail ignoruje');
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            if (gs.players[0] && !gs.players[0].character) gs.players[0].charChoices = ['Al Preacher'];
            if (gs.players[1] && !gs.players[1].character) gs.players[1].charChoices = ['Ms. Abigail'];
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room, (st) => {
                checkLoads(st, tag);
                if (st.phase === 'AD_AL_OFFER') seen.add('okno Ala');
                if (st.phase === 'EVADE_OFFER' && st.pendingEvade?.abigail) seen.add('okno úniku Abigail');
                if (st.phase === 'RESPOND' && st.pendingResponse &&
                    adAbigailRespondOk(st, st.pendingResponse.targetIdx)) seen.add('výstřel J–A na Abigail');
            });
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci s Alem ani Abigail');
    for (const what of ['okno Ala', 'Al líže', 'okno úniku Abigail', 'výstřel J–A na Abigail', 'Abigail ignoruje']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});

// Fáze A7: celé rozšíření tak, jak jde do ostré hry – skutečný balíček (každá karta jednou,
// AD_CARDS_READY = všech 28) a skutečný výběr postav (AD_READY = všech 8), bez natvrdo
// přidělených postav. Matice „rozšíření × 3–8 hráčů" (test/server.bots.test.js) se kvůli
// délce běhu nezdvojnásobuje; místo toho tu jede O&N samo pro 3–8 hráčů, v páru s každým
// ostatním rozšířením a se všemi naráz.
test('Ozbrojení a nebezpeční (A7): skutečný balíček a výběr postav × ostatní rozšíření × 3–8 hráčů', () => {
    const OTHERS = ['dodge_city', 'high_noon', 'fistful', 'divoky_zapad', 'zlata_horecka', 'udoli_stinu'];
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, with: [] });
    OTHERS.forEach((k, i) => COMBOS.push({ n: 3 + i, with: [k] }));
    COMBOS.push({ n: 4, with: OTHERS }, { n: 6, with: OTHERS }, { n: 8, with: OTHERS });

    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const adNames = new Set(adCardData.map(c => c.name));
    const seen = new Set();
    let adChars = 0;
    try {
        COMBOS.forEach(({ n, with: w }, ci) => {
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = vosCardData;
            gs.adCardData = adCardData;
            const exp = { ozbrojeni: true };
            w.forEach(k => { exp[k] = true; });
            const opts = { expansions: exp };
            const tag = `O&N+${w.length === OTHERS.length ? 'vše' : (w[0] || 'nic')} (${n}p)`;
            const room = { id: `ad7_${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e) return;
                if ((e.ev === 'play' || e.ev === 'bang' || e.ev === 'special') && adNames.has(e.card)) seen.add(e.card);
                if (e.ev === 'ad_use') seen.add('použití');
                if (e.ev === 'ad_place') seen.add('rozmístění');
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Rozšíření doteklo do stavu: všech 28 karet je v balíčku nebo v rukou.
            const inGame = gs.deck.cards.concat(...gs.players.map(p => p.hand)).filter(c => c.exp === 'ozbrojeni');
            assert.equal(inGame.length, adCardData.length, `${tag}: karty O&N v balíčku`);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room, (st) => checkLoads(st, tag));
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
            adChars += gs.players.filter(p => ARMED_CHARACTERS.includes(p.character)).length;
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci se skutečným balíčkem O&N');
    assert.ok(adChars > 0, 'postavy rozšíření se dostaly do výběru');
    for (const what of ['použití', 'rozmístění', 'Bandalír', 'Šíp', 'Nabíjení']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});

// Fáze A7: „balíček samých X" pro Rez, Bič a Paklíč (plán §7) – karty, které sahají na cizí
// žetony a stoly mimo vzdálenost. S Bombami (výbuch cizí rukou přes Rez) a Nabíjením, aby
// bylo co brát.
test('Ozbrojení a nebezpeční (A7): balíček samých Rezů, Bičů a Paklíčů – hra jen botů doběhne 3–8 hráčů', () => {
    const MIX = { 'Rez': 5, 'Bič': 4, 'Paklíč': 4, 'Nabíjení': 3, 'Bomba': 2 };
    let nid = 80000;
    const rich = [];
    Object.entries(MIX).forEach(([name, k]) => {
        const row = adCardData.find(c => c.name === name);
        for (let i = 0; i < k; i++) rich.push({ ...row, id: nid++ });
    });
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, all: false });
    COMBOS.push({ n: 5, all: true }, { n: 8, all: true });

    const seen = new Set();
    try {
        COMBOS.forEach(({ n, all }, ci) => {
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = vosCardData;
            gs.adCardData = rich;
            const opts = { expansions: { dodge_city: all, high_noon: all, fistful: all, divoky_zapad: all,
                                         zlata_horecka: all, udoli_stinu: all, ozbrojeni: true } };
            const tag = `Rez/Bič/Paklíč ${all ? 'vše' : 'jen O&N'} (${n}p)`;
            const room = { id: `adr${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e) return;
                if ((e.ev === 'play' || e.ev === 'special') && e.card === 'Rez') seen.add('Rez');
                if (e.ev === 'ad_use' && (e.card === 'Bič' || e.card === 'Paklíč')) seen.add('použití ' + e.card);
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room, (st) => checkLoads(st, tag));
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci s Rezem, Bičem a Paklíčem');
    for (const what of ['Rez', 'použití Bič', 'použití Paklíč']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});
