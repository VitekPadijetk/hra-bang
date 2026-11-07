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
test('Ozbrojení a nebezpeční (A1–A2): hra jen botů doběhne 3–8 hráčů, samo i se vším', () => {
    const READY = ['Eso v rukávu', 'Bečka piva', 'Zvonice', 'Bandalír', 'Nabíjení', 'Kolona', 'Malý doušek',
                   'Big Fifty', 'Buntline Special', 'Dvouhlavňovka', 'Thunderer', 'Bedna', 'Skrč se!',
                   'Křesadlovka', 'Rychlopalba'];
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
                if ((e.ev === 'bang' || e.ev === 'special') && (e.card === 'Mexicali Kid' || e.card === 'Bloody Mary')) seen.add(e.card);
                if (e.ev === 'ad_place') seen.add('rozmístění ' + e.reason);
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            // Fáze A2: postavy Mexicali Kid a Bloody Mary dostanou dva boti natvrdo.
            if (gs.players[1]) gs.players[1].character = 'Mexicali Kid';
            if (gs.players[2]) gs.players[2].character = 'Bloody Mary';
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
                        'Mexicali Kid', 'Bloody Mary']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});
