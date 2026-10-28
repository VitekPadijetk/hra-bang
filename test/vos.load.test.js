// Zátěž rozšíření Údolí stínů: hry jen botů s namnoženými kartami jednotlivých fází
// (F1–F8) a „balíček samých X" pro každý druh karty (F9). Ve vlastním souboru, aby
// běžela souběžně s test/server.bots.test.js (harness: test/_botHarness.js).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState } = require('../logic.js');
const { buildCtx, pumpToWinner, cardData } = require('./_botHarness.js');

const dodgeCityCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.dodge_city.json', 'utf8'));
const highNoonCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.high_noon.json', 'utf8'));
const fistfulCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.fistful.json', 'utf8'));
const wwsCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.divoky_zapad.json', 'utf8'));
const gearCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.zlata_horecka.json', 'utf8'));
const vosCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));

before(() => { console.log = () => {}; console.warn = () => {}; });

// Údolí stínů (fáze F1): karty jdou do HLAVNÍHO balíčku, takže tu není co „samého"
// podstrčit jako u balíčků událostí – místo toho se data rozšíření namnoží (6 hotových
// druhů × 6 kopií), ať se Chřestýš, Odměna, Lemat i Brokovnice v každé hře opravdu
// dostanou ke slovu. Hlídá to, že se hra jen botů na nové fázi (SHOTGUN_DISCARD) ani
// na novém sejmutí nezasekne, a že se karty doopravdy hrály (ne že by tiše chyběly).
test('Údolí stínů (F1): hra jen botů doběhne 3–8 hráčů, samo i se vším, s nasyceným balíčkem', () => {
    const vosData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
    // Jen druhy fáze F1 – další fáze mají vlastní zátěž, jinak by se karty „naředily"
    // a vzácné jevy (odhoz za Brokovnici) by se v téhle sadě přestaly objevovat.
    const VOS_CARDS_READY = ['Tomahawk', 'Poslední pivo', 'Chřestýš', 'Odměna', 'Lemat', 'Brokovnice'];
    let nid = 70000;
    const rich = [];
    for (let copy = 0; copy < 6; copy++) {
        vosData.filter(c => VOS_CARDS_READY.includes(c.name)).forEach(c => rich.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const COMBOS = [];
    for (let n = 3; n <= 8; n++) COMBOS.push({ n, all: false });
    COMBOS.push({ n: 4, all: true }, { n: 7, all: true }, { n: 5, all: true }, { n: 8, all: true });

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
            gs.vosCardData = rich;
            const opts = { expansions: { dodge_city: all, high_noon: all, fistful: all,
                                         divoky_zapad: all, zlata_horecka: all, udoli_stinu: true } };
            const tag = `${all ? 'vše' : 'jen ÚS'} (${n}p)`;
            const room = { id: `vos${ci}`, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e) return;
                if (['play', 'special', 'bang'].includes(e.ev) && VOS_CARDS_READY.includes(e.card)) seen.add(e.card);
                if (e.ev === 'check' && e.kind === 'RATTLESNAKE') seen.add('sejmutí Chřestýše');
                if (e.ev === 'special' && e.card === 'Brokovnice' && e.taken) seen.add('odhoz Brokovnice');
                if (e.ev === 'special' && e.card === 'Odměna' && e.msg) seen.add('líznutí za Odměnu');
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            assert.ok(gs.deck.cards.concat(...gs.players.map(p => p.hand)).some(c => c.exp === 'udoli_stinu'),
                `${tag}: karty rozšíření jsou v balíčku`);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room);
            assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci s Údolím stínů');
    for (const what of ['Tomahawk', 'Poslední pivo', 'Chřestýš', 'Odměna', 'Lemat', 'Brokovnice',
                        'sejmutí Chřestýše', 'odhoz Brokovnice', 'líznutí za Odměnu']) {
        assert.ok(seen.has(what), `v zátěži se ani jednou neobjevilo: ${what}`);
    }
});

// Údolí stínů (fáze F2): celý stůl jedné postavy, ať se schopnost v každé hře ozve
// mnohokrát. Colorado Bill přidává sejmutí do každé karty BANG! (a nezrušitelný útok,
// na který bot nesmí posílat Vedle!), Limonádový Jim novou fázi LEMONADE_OFFER, na
// kterou se čeká u cizího hráče uprostřed cizího tahu.
test('Údolí stínů (F2): stůl plný Coloradů Billů / Limonádových Jimů doběhne 3–8 hráčů', () => {
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const seen = { colorado: 0, spade: 0, unavoidable: 0, jimTook: 0, jimNo: 0 };
    try {
        for (const name of ['Colorado Bill', 'Limonádový Jim']) {
            for (let k = 0; k < 8; k++) {
                const n = 3 + (k % 6);
                const gs = new GameState();
                gs.cardData = cardData;
                gs.dodgeCityCardData = dodgeCityCardData;
                gs.highNoonCardData = highNoonCardData;
                gs.fistfulCardData = fistfulCardData;
                gs.wwsCardData = wwsCardData;
                gs.gearCardData = gearCardData;
                gs.vosCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
                const opts = { expansions: { udoli_stinu: true, dodge_city: k % 2 === 0,
                                             high_noon: k % 3 === 0, fistful: k % 4 === 0,
                                             zlata_horecka: k % 5 === 0 } };
                const room = { id: 'vosf2' + name.length + '_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
                ctx.rooms.set(room.id, room);
                gs._onEvent = (e) => {
                    if (!e) return;
                    if (e.ev === 'check' && e.kind === 'COLORADO') {
                        seen.colorado++;
                        if (String(e.result).startsWith('pik')) seen.spade++;
                    }
                    if (e.ev === 'special' && e.card === 'Limonádový Jim') {
                        if (e.taken) seen.jimTook++; else seen.jimNo++;
                    }
                };
                gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
                gs.players.forEach(p => { p.charChoices = [name, name]; });
                gs.players.forEach(p => ctx.createBot(room, p.name));
                for (let g = 0; g < 50 && gs.phase === 'CHARACTER_SELECT'; g++) ctx.runBotTickOnce(room);
                assert.ok(gs.players.every(pl => pl.character === name),
                    `${name}: všichni opravdu dostali tuhle postavu`);
                const guard = pumpToWinner(ctx, room, () => {
                    if (gs.phase === 'RESPOND' && gs.pendingResponse?.vos?.unavoidable) seen.unavoidable++;
                });
                assert.ok(gs.winner, `${name}: hra (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
                assert.ok(guard < 8000, `${name}: hra nebyla patologicky dlouhá (guard=${guard})`);
            }
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci s postavami Údolí stínů');
    assert.ok(seen.colorado > 0, 'Colorado Bill aspoň jednou snímal');
    assert.ok(seen.spade > 0 && seen.unavoidable > 0, 'aspoň jednou padl pik a obrana byla nezrušitelná');
    assert.ok(seen.jimTook > 0, 'Limonádový Jim si aspoň jednou doplnil život');
    assert.ok(seen.jimNo > 0, 'Limonádový Jim aspoň jednou nabídku odmítl');
});

// Údolí stínů (fáze F3): první nový mechanismus – fronta výstřelů (Opětovná palba,
// druhý cíl Roztříštěné kulky, Evelyn Shebang) a klikané zásahy s útočníkem (Dvojitá
// rána). Karty F3 se namnoží (6 kopií) a polovina her má stůl plný Evelyn Shebang, ať
// se výstřel místo karty ozve mnohokrát. Hlídá, že se výstřel mimo pořadí nepřepíše
// s rozehranou obranou, že smrt hráče na tahu výstřelem zpět posune tah a že se nic
// nezasekne.
test('Údolí stínů (F3): fronta výstřelů a Dvojitá rána – hra jen botů doběhne 3–8 hráčů', () => {
    const vosData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
    const F3 = ['Opětovná palba', 'Roztříštěná kulka', 'Dvojitá rána', 'Lemat'];
    let nid = 71000;
    const rich = [];
    for (let copy = 0; copy < 6; copy++) {
        vosData.filter(c => F3.includes(c.name)).forEach(c => rich.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const seen = { backfire: 0, fanning2: 0, aim: 0, evelyn: 0, shotFired: 0, ownerKilled: 0 };
    try {
        for (let k = 0; k < 16; k++) {
            const n = 3 + (k % 6);
            const all = k % 4 === 3;
            const evelyn = k % 2 === 1;
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = rich;
            const opts = { expansions: { udoli_stinu: true, dodge_city: all, high_noon: all,
                                         fistful: all, divoky_zapad: all, zlata_horecka: all } };
            const room = { id: 'vosf3_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e) return;
                if (e.ev === 'special' && e.card === 'Opětovná palba') seen.backfire++;
                if (e.ev === 'bang' && e.card === 'Roztříštěná kulka' && e.second) seen.fanning2++;
                if (e.ev === 'special' && e.card === 'Dvojitá rána') seen.aim++;
                if (e.ev === 'special' && e.card === 'Evelyn Shebang') seen.evelyn++;
                if (e.ev === 'bang' && ['Opětovná palba', 'Evelyn Shebang'].includes(e.card)) seen.shotFired++;
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            if (evelyn) gs.players.forEach(p => { p.charChoices = ['Evelyn Shebang', 'Evelyn Shebang']; });
            gs.players.forEach(p => ctx.createBot(room, p.name));
            if (evelyn) {
                for (let g = 0; g < 50 && gs.phase === 'CHARACTER_SELECT'; g++) ctx.runBotTickOnce(room);
                assert.ok(gs.players.every(pl => pl.character === 'Evelyn Shebang'), 'stůl plný Evelyn');
            }
            const guard = pumpToWinner(ctx, room, () => {
                // Hráč na tahu je mrtvý a nic to nepozná → hra by stála ve fázi PLAY.
                const cur = gs.players[gs.currentPlayerIndex];
                if (gs.phase === 'PLAY' && cur && cur.health <= 0 && !cur._ghost && !cur._shadow) seen.ownerKilled++;
            });
            assert.ok(gs.winner, `F3 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `F3 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci s frontou výstřelů');
    assert.ok(seen.backfire > 0 && seen.shotFired > 0, 'Opětovná palba aspoň jednou vystřelila zpět');
    assert.ok(seen.fanning2 > 0, 'Roztříštěná kulka aspoň jednou mířila na dva cíle');
    assert.ok(seen.aim > 0, 'Dvojitá rána aspoň jednou zasáhla');
    assert.ok(seen.evelyn > 0, 'Evelyn Shebang aspoň jednou střílela místo karty');
    assert.equal(seen.ownerKilled, 0, 'mrtvý hráč na tahu nikdy nezůstal viset ve fázi PLAY');
});

// Údolí stínů (fáze F4): kolečko voleb všech hráčů – Divoká banda, Tornádo a Poker.
// Karty se namnoží (6 kopií), čtvrtina her má zapnutá i všechna ostatní rozšíření (Lee Van
// Kliff a Zuřivá Doroty kolečko spouští jinou cestou než playCard). Hlídá, že kolečko
// vždycky doběhne, nikdy nezůstane viset do fáze PLAY a že se hra nezasekne na volbě,
// která stav nemění (Tornádo a Poker si volbu jen zapíšou).
test('Údolí stínů (F4): Divoká banda, Tornádo a Poker – hra jen botů doběhne 3–8 hráčů', () => {
    const vosData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
    const F4 = ['Divoká banda', 'Tornádo', 'Poker'];
    let nid = 72000;
    const rich = [];
    for (let copy = 0; copy < 6; copy++) {
        vosData.filter(c => F4.includes(c.name)).forEach(c => rich.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const seen = { bandidos: 0, tornado: 0, pokerTake: 0, pokerAce: 0, leftover: 0 };
    try {
        for (let k = 0; k < 16; k++) {
            const n = 3 + (k % 6);
            const all = k % 4 === 3;
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = rich;
            const opts = { expansions: { udoli_stinu: true, dodge_city: all, high_noon: all,
                                         fistful: all, divoky_zapad: all, zlata_horecka: all } };
            const room = { id: 'vosf4_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e || e.ev !== 'special') return;
                if (e.card === 'Divoká banda' && e.taken) seen.bandidos++;
                if (e.card === 'Tornádo' && e.msg === 'karty předány doleva') seen.tornado++;
                if (e.card === 'Poker' && /^bere si/.test(e.msg || '')) seen.pokerTake++;
                if (e.card === 'Poker' && /Eso/.test(e.msg || '')) seen.pokerAce++;
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            const guard = pumpToWinner(ctx, room, () => {
                if (gs.phase === 'PLAY' && gs.pendingVosRound) seen.leftover++;
            });
            assert.ok(gs.winner, `F4 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `F4 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci v kolečku voleb');
    assert.equal(seen.leftover, 0, 'kolečko nikdy nezůstalo viset do fáze PLAY');
    assert.ok(seen.bandidos > 0, 'Divoká banda aspoň jednou někoho připravila o karty');
    assert.ok(seen.tornado > 0, 'Tornádo aspoň jednou předalo karty');
    assert.ok(seen.pokerTake > 0, 'Poker aspoň jednou skončil výběrem z vyložených karet');
    assert.ok(seen.pokerAce > 0, 'Poker aspoň jednou zablokovalo Eso');
});

test('Údolí stínů (F5): balíček plný Duchů – hra jen botů doběhne 3–8 hráčů', () => {
    const { isInPlay, isVosGhost } = require('../core/distance.js');
    const vosData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
    let nid = 73000;
    const rich = [];
    for (let copy = 0; copy < 8; copy++) {
        vosData.filter(c => c.name === 'Duch').forEach(c => rich.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const seen = { back: 0, left: 0, deadOnTurn: 0, ghostTurns: 0, healed: 0 };
    try {
        for (let k = 0; k < 18; k++) {
            const n = 3 + (k % 6);
            const all = k % 3 === 2;
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = rich;
            const opts = { expansions: { udoli_stinu: true, dodge_city: all, high_noon: all,
                                         fistful: all, divoky_zapad: all, zlata_horecka: all } };
            const room = { id: 'vosf5_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e || e.card !== 'Duch') return;
                if (/vrací se do hry/.test(e.msg || '')) seen.back++;
                if (/odchází ze hry/.test(e.msg || '')) seen.left++;
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            gs.players.forEach(p => ctx.createBot(room, p.name));
            let lastTurn = null;
            const guard = pumpToWinner(ctx, room, () => {
                const cp = gs.players[gs.currentPlayerIndex];
                if (gs.phase === 'PLAY' && !gs.winner && !isInPlay(cp) && gs._dorothyOwnerIdx == null) seen.deadOnTurn++;
                if (isVosGhost(cp) && gs.turnId !== lastTurn) { seen.ghostTurns++; lastTurn = gs.turnId; }
                if (gs.players.some(p => isVosGhost(p) === false && p._vosWasGhost && p.health > 0)) seen.healed++;
            });
            assert.ok(gs.winner, `F5 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `F5 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci');
    assert.equal(seen.deadOnTurn, 0, 'vyřazený hráč nikdy nezůstal na tahu ve fázi PLAY');
    assert.equal(seen.healed, 0, 'Duch nikdy nezískal život');
    assert.ok(seen.back > 0, 'Duch aspoň jednou vrátil hráče do hry');
    assert.ok(seen.ghostTurns > 0, 'Duch aspoň jednou odehrál tah');
    assert.ok(seen.left > 0, 'Duch aspoň jednou přišel o kartu a odešel ze hry');
});

// Údolí stínů (fáze F6): okno úniku. Balíček plný Útěků (a Tomahawků, proti kterým se
// Útěk hraje v obraně), každá druhá hra se stolem samých Micků Defenderů, čtvrtina se
// všemi rozšířeními (Lee Van Kliff, Zuřivá Doroty, Krytý vůz a Komplic jdou do výběru
// karty jinými cestami). Hlídá, že okno úniku vždycky skončí a nezůstane viset mimo
// svou fázi a že bot nikdy nepošle únik, který server odmítne.
test('Údolí stínů (F6): balíček plný Útěků a stůl Micků Defenderů – hra jen botů doběhne 3–8 hráčů', () => {
    const vosData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
    let nid = 74000;
    const rich = [];
    for (let copy = 0; copy < 10; copy++) {
        vosData.filter(c => c.name === 'Útěk' || (copy < 4 && c.name === 'Tomahawk'))
               .forEach(c => rich.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const seen = { offer: 0, escape: 0, mick: 0, respondEscape: 0, dangling: 0 };
    try {
        for (let k = 0; k < 16; k++) {
            const n = 3 + (k % 6);
            const all = k % 4 === 3;
            const mick = k % 2 === 1;
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = rich;
            const opts = { expansions: { udoli_stinu: true, dodge_city: all, high_noon: all,
                                         fistful: all, divoky_zapad: all, zlata_horecka: all } };
            const room = { id: 'vosf6_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e || e.ev !== 'special') return;
                if (/může se vyhnout/.test(e.msg || '')) seen.offer++;
                if (/^vyhýbá se: (Tomahawk|Úder|Springfield)/.test(e.msg || '')) seen.respondEscape++;
                else if (/^vyhýbá se/.test(e.msg || '')) {
                    if (e.card === 'Útěk') seen.escape++; else seen.mick++;
                }
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            if (mick) gs.players.forEach(p => { p.charChoices = ['Mick Defender', 'Mick Defender']; });
            gs.players.forEach(p => ctx.createBot(room, p.name));
            if (mick) {
                for (let g = 0; g < 50 && gs.phase === 'CHARACTER_SELECT'; g++) ctx.runBotTickOnce(room);
                assert.ok(gs.players.every(pl => pl.character === 'Mick Defender'), 'stůl plný Micků');
            }
            const guard = pumpToWinner(ctx, room, () => {
                if (gs.pendingEvade && gs.phase !== 'EVADE_OFFER') seen.dangling++;
            });
            assert.ok(gs.winner, `F6 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `F6 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci v okně úniku');
    assert.equal(seen.dangling, 0, 'okno úniku nikdy nezůstalo viset mimo fázi EVADE_OFFER');
    assert.ok(seen.offer > 0, 'okno úniku se aspoň jednou otevřelo');
    assert.ok(seen.escape > 0, 'Útěk aspoň jednou zrušil kartu v okně úniku');
    assert.ok(seen.respondEscape > 0, 'Útěk aspoň jednou zrušil bang-efekt v obraně');
    assert.ok(seen.mick > 0, 'Mick Defender se aspoň jednou vyhnul kartou Vedle!');
});

// Údolí stínů (fáze F7): Henry Block – pozastavená akce. Balíček navíc plný Panik a Cat
// Balou (a s Dodge City i Rvaček, Ragtimů, Krytých vozů a Kankánů), polovina her se stolem
// samých Henryů, druhá polovina střídá Henryho s Jesse Jonesem a Patem Brennanem (ti
// berou Henrymu karty ve fázi lízání). Hlídá, že pozastavená akce nikdy nezůstane viset
// (fáze PLAY s nedokončenou krádeží), že se žádná karta nezdvojí (krádež proběhne jednou)
// a že výstřel padl, krádež doběhla i propadla smrtí zloděje.
//
// Od F9 bot Henrymu kartu bere jen jako poslední možnost, s výstřelem, který by ho
// vyřadil, vůbec, a jako Jesse Jones / Pat Brennan od něj nelíže nikdy (balíček je
// zadarmo). Cesty „zloděj padl" a „pozastavené líznutí" by se tak v zátěži nespustily,
// proto je v polovině her test vynutí sám: zloděje, na kterého Henry právě střílí, srazí
// na poslední život (ubránit se smí dál) a Jesseho / Pata pošle lízat k Henrymu.
test('Údolí stínů (F7): stůl Henryů Blocků a balíček plný krádeží – hra jen botů doběhne 3–8 hráčů', () => {
    const { henryFires } = require('../core/valley.js');
    const { hasAbility } = require('../core/distance.js');
    let nid = 76000;
    const richBase = [...cardData];
    for (let copy = 0; copy < 4; copy++) {
        cardData.filter(c => c.type === 'PANIC' || c.type === 'CAT_BALOU')
                .forEach(c => richBase.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const seen = { shot: 0, kept: 0, dangling: 0, dup: 0, moved: 0, drawSuspended: 0 };
    const dupCheck = (gs) => {
        const ids = new Set();
        const add = (c) => {
            if (!c || c.id == null || c.id === -1) return;
            if (ids.has(c.id)) seen.dup++;
            ids.add(c.id);
        };
        gs.players.forEach(p => { p.hand.forEach(add); p.board.forEach(add); add(p.weapon); });
        gs.deck._drawPile.forEach(add);
        gs.deck._discardPile.forEach(add);
    };
    try {
        for (let k = 0; k < 18; k++) {
            const n = 3 + (k % 6);
            const all = k % 3 === 2;
            const henryTable = k % 2 === 1;
            const force = k % 4 < 2;
            const gs = new GameState();
            gs.cardData = richBase;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
            const opts = { expansions: { udoli_stinu: true, dodge_city: all || k % 3 === 1, high_noon: all,
                                         fistful: all, divoky_zapad: all, zlata_horecka: all } };
            const room = { id: 'vosf7_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e || e.card !== 'Henry Block') return;
                if (/^střílí/.test(e.msg || '')) seen.shot++;
                if (/karta zůstává Henrymu/.test(e.msg || '')) seen.kept++;
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            const mix = ['Henry Block', 'Jesse Jones', 'Pat Brennan'];
            gs.players.forEach((p, i) => {
                const ch = henryTable ? 'Henry Block' : mix[i % mix.length];
                p.charChoices = [ch, ch];
            });
            gs.players.forEach(p => ctx.createBot(room, p.name));
            for (let g = 0; g < 50 && gs.phase === 'CHARACTER_SELECT'; g++) ctx.runBotTickOnce(room);
            const guard = pumpToWinner(ctx, room, () => {
                if (gs._vosSuspended && gs.phase === 'PLAY') seen.dangling++;
                if (gs._henryAnim) { seen.moved++; gs._henryAnim = null; }
                if (gs._vosSuspended?.kind === 'DRAW') seen.drawSuspended++;
                if (force && gs._vosSuspended) {
                    const t = gs.players[gs._vosSuspended.thiefIdx];
                    if (t && t.health > 1) t.health = 1;
                }
                const ds = gs.drawPhaseState;
                if (force && gs.phase === 'DRAW' && ds?.active && ds.cardsDrawn === 0) {
                    const me = ds.playerIdx;
                    const h = gs.players.findIndex((p, i) => henryFires(gs, i, me) && p.hand.length > 0);
                    const opts = ds.options || [];
                    if (h !== -1 && hasAbility(gs.players[me], 'Jesse Jones') && opts.includes('opponent_hand')) {
                        gs.drawCard('opponent_hand', h);
                    } else if (h !== -1 && hasAbility(gs.players[me], 'Pat Brennan') && opts.includes('board') &&
                               gs.players[h].board.length > 0) {
                        gs.drawCard('board', h, 'board', 0);
                    }
                    // Výstřel se vyřídí hned další akcí bota, takže se počítá tady.
                    if (gs._vosSuspended?.kind === 'DRAW') seen.drawSuspended++;
                }
                dupCheck(gs);
            });
            assert.ok(gs.winner, `F7 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `F7 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci');
    assert.equal(seen.dangling, 0, 'pozastavená akce nikdy nezůstala viset ve fázi PLAY');
    assert.equal(seen.dup, 0, 'žádná karta se krádeží nezdvojila');
    assert.ok(seen.shot > 0, 'Henry aspoň jednou vystřelil');
    assert.ok(seen.moved > 0, 'krádež / odhoz aspoň jednou doběhly po výstřelu');
    assert.ok(seen.kept > 0, 'aspoň jednou zloděj padl a karta zůstala Henrymu');
    assert.ok(seen.drawSuspended > 0, 'aspoň jednou Henry vystřelil na Jesseho / Pata ve fázi lízání');
});

// Údolí stínů (fáze F8): Obětavý skok – okno záchrany a odměna. Balíček plný Obětavých
// skoků (a Dvojitých ran, jejichž zásahy se zachraňují po jednom klikem), třetina her se
// stolem samých Henryů Blocků (odměna z ruky Henryho = jeho výstřel), čtvrtina se všemi
// rozšířeními (dynamit, Ruská ruleta, Pravé poledne, Roubík – všechny vstupy ztráty
// života). Hlídá, že okno ani volba odměny nikdy nezůstanou viset mimo svou fázi, že
// mrtvý hráč nezůstane na tahu (zásah se dohrává v handleru vos_save) a že se zachraňovalo,
// odměňovalo z ruky i z balíčku.
test('Údolí stínů (F8): balíček plný Obětavých skoků – hra jen botů doběhne 3–8 hráčů', () => {
    const vosData = JSON.parse(fs.readFileSync(__dirname + '/../cards.udoli_stinu.json', 'utf8'));
    let nid = 77000;
    const rich = [...vosData];
    for (let copy = 0; copy < 10; copy++) {
        vosData.filter(c => c.name === 'Obětavý skok' || (copy < 3 && c.name === 'Dvojitá rána'))
               .forEach(c => rich.push({ ...c, id: nid++ }));
    }
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const { saveRewardHandCount } = require('../core/valley.js');
    const seen = { offer: 0, saved: 0, hand: 0, deck: 0, lost: 0, henrySave: 0, dangling: 0, ownerKilled: 0 };
    try {
        for (let k = 0; k < 18; k++) {
            const n = 3 + (k % 6);
            const all = k % 4 === 3;
            const henry = k % 3 === 1;
            const gs = new GameState();
            gs.cardData = cardData;
            gs.dodgeCityCardData = dodgeCityCardData;
            gs.highNoonCardData = highNoonCardData;
            gs.fistfulCardData = fistfulCardData;
            gs.wwsCardData = wwsCardData;
            gs.gearCardData = gearCardData;
            gs.vosCardData = rich;
            const opts = { expansions: { udoli_stinu: true, dodge_city: all, high_noon: all,
                                         fistful: all, divoky_zapad: all, zlata_horecka: all } };
            const room = { id: 'vosf8_' + k, players: [], gameState: gs, maxPlayers: n, options: opts };
            ctx.rooms.set(room.id, room);
            gs._onEvent = (e) => {
                if (!e || e.card !== 'Obětavý skok') return;
                const m = e.msg || '';
                if (/může ho zachránit/.test(m)) seen.offer++;
                if (/zabraňuje ztrátě života/.test(m)) seen.saved++;
                if (/odměna: karty z ruky/.test(m)) seen.hand++;
                if (/odměna: 2 karty z balíčku/.test(m)) seen.deck++;
                if (/bez odměny/.test(m)) seen.lost++;
            };
            gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
            if (henry) gs.players.forEach(p => { p.charChoices = ['Henry Block', 'Henry Block']; });
            // Bot zachraňuje jen spojence a od spojence bere z balíčku – cesta „z ruky"
            // (animace krádeže, výstřel Henryho na zachránce) by se v zátěži nespustila.
            // V polovině her se proto volba přehodí na ruku, kdykoli v ní něco je.
            if (k % 2 === 0) {
                gs.vosSaveReward = function (i, from) {
                    return GameState.prototype.vosSaveReward.call(this, i, saveRewardHandCount(this) ? 'hand' : from);
                };
            }
            gs.players.forEach(p => ctx.createBot(room, p.name));
            if (henry) {
                for (let g = 0; g < 50 && gs.phase === 'CHARACTER_SELECT'; g++) ctx.runBotTickOnce(room);
            }
            const guard = pumpToWinner(ctx, room, () => {
                if (gs._vosSuspended && gs._vosSuspended.kind === 'SAVE') seen.henrySave++;
                if (gs.pendingSave && gs.phase !== 'SAVE_OFFER') seen.dangling++;
                if (gs.pendingSaveReward && gs.phase !== 'SAVE_REWARD') seen.dangling++;
                const cur = gs.players[gs.currentPlayerIndex];
                if (gs.phase === 'PLAY' && cur && cur.health <= 0 && !cur._ghost && !cur._shadow &&
                    !(cur.board || []).some(c => c && c.type === 'Duch')) seen.ownerKilled++;
            });
            assert.ok(gs.winner, `F8 hra #${k} (${n}p) doběhla (guard=${guard}, phase=${gs.phase})`);
            assert.ok(guard < 8000, `F8 hra #${k} (${n}p) nebyla patologicky dlouhá (guard=${guard})`);
        }
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci v okně záchrany');
    assert.equal(seen.dangling, 0, 'okno záchrany ani volba odměny nikdy nezůstaly viset mimo svou fázi');
    assert.equal(seen.ownerKilled, 0, 'mrtvý hráč na tahu nikdy nezůstal viset ve fázi PLAY');
    assert.ok(seen.offer > 0, 'okno záchrany se aspoň jednou otevřelo');
    assert.ok(seen.saved > 0, 'aspoň jednou někdo zachránil');
    assert.ok(seen.hand > 0, 'odměna aspoň jednou z ruky zachráněného');
    assert.ok(seen.deck > 0, 'odměna aspoň jednou z balíčku');
});

// Údolí stínů (fáze F9): „balíček samých X" pro KAŽDÝ druh karty rozšíření. Sady F1–F8
// namnožily vždy jen karty své fáze; tahle projede všech 15 druhů po jednom (k plným
// datům rozšíření přidá ~12 kopií jednoho druhu), s normálním výběrem postav – takže se
// potká i s postavami ostatních fází – a v polovině her se všemi rozšířeními. Hlídá
// obecné invarianty, které platí pro všechny mechanismy naráz: žádné okno ani rozdělaná
// akce nezůstane viset mimo svou fázi, vyřazený nezůstane na tahu, žádná karta se
// nezdvojí a Duch nezíská život.
test('Údolí stínů (F9): balíček samých X pro každý druh karty – hra jen botů doběhne 3–8 hráčů', () => {
    const { isInPlay } = require('../core/distance.js');
    const names = [...new Set(vosCardData.map(c => c.name))];
    assert.equal(names.length, 15, 'Údolí stínů má 15 druhů karet');
    const ctx = buildCtx();
    let stalls = 0;
    const origSystem = ctx.glog.system;
    ctx.glog.system = (...a) => { if (String(a[0]).includes('stall')) stalls++; };
    const bad = { dangling: [], deadOnTurn: 0, healed: 0, dup: 0 };
    const seen = {};
    let nid = 79000;
    const dupCheck = (gs) => {
        const ids = new Set();
        const add = (c) => {
            if (!c || c.id == null || c.id === -1) return;
            if (ids.has(c.id)) bad.dup++;
            ids.add(c.id);
        };
        gs.players.forEach(p => { p.hand.forEach(add); p.board.forEach(add); add(p.weapon); });
        gs.deck._drawPile.forEach(add);
        gs.deck._discardPile.forEach(add);
    };
    try {
        names.forEach((name, ni) => {
            const kind = vosCardData.filter(c => c.name === name);
            const copies = Math.ceil(12 / kind.length);
            const rich = [...vosCardData];
            for (let k = 0; k < copies; k++) kind.forEach(c => rich.push({ ...c, id: nid++ }));
            seen[name] = 0;
            for (let n = 3; n <= 8; n++) {
                const all = (n + ni) % 2 === 0;
                const gs = new GameState();
                gs.cardData = cardData;
                gs.dodgeCityCardData = dodgeCityCardData;
                gs.highNoonCardData = highNoonCardData;
                gs.fistfulCardData = fistfulCardData;
                gs.wwsCardData = wwsCardData;
                gs.gearCardData = gearCardData;
                gs.vosCardData = rich;
                const opts = { expansions: { udoli_stinu: true, dodge_city: all, high_noon: all,
                                             fistful: all, divoky_zapad: all, zlata_horecka: all } };
                const tag = `${name} (${n}p${all ? ', vše' : ''})`;
                const room = { id: `vosx${ni}_${n}`, players: [], gameState: gs, maxPlayers: n, options: opts };
                ctx.rooms.set(room.id, room);
                gs._onEvent = (e) => { if (e && e.card === name) seen[name]++; };
                gs.setupGame(n, Array.from({ length: n }, (_, i) => 'B' + i), opts);
                gs.players.forEach(p => ctx.createBot(room, p.name));
                const guard = pumpToWinner(ctx, room, () => {
                    const ph = gs.phase;
                    const hang = (gs.pendingEvade && ph !== 'EVADE_OFFER' && 'okno úniku') ||
                        (gs.pendingSave && ph !== 'SAVE_OFFER' && 'okno záchrany') ||
                        (gs.pendingSaveReward && ph !== 'SAVE_REWARD' && 'odměna záchrany') ||
                        (gs.pendingLemonade && ph !== 'LEMONADE_OFFER' && 'nabídka Limonádového Jima') ||
                        (gs.pendingVosRound && ph === 'PLAY' && 'kolečko voleb') ||
                        (gs._vosSuspended && ph === 'PLAY' && 'pozastavená akce Henryho');
                    if (hang) bad.dangling.push(`${tag}: ${hang} ve fázi ${ph}`);
                    const cur = gs.players[gs.currentPlayerIndex];
                    if (ph === 'PLAY' && !gs.winner && !isInPlay(cur) && gs._dorothyOwnerIdx == null) bad.deadOnTurn++;
                    if (gs.players.some(p => p._vosWasGhost && p.health > 0)) bad.healed++;
                    dupCheck(gs);
                });
                assert.ok(gs.winner, `${tag} doběhla (guard=${guard}, phase=${gs.phase})`);
                assert.ok(guard < 8000, `${tag} nebyla patologicky dlouhá (guard=${guard})`);
            }
        });
    } finally { ctx.glog.system = origSystem; }
    assert.equal(stalls, 0, 'policy nikdy nepotřebovala nouzovou akci');
    assert.deepEqual(bad.dangling.slice(0, 5), [], 'nic nezůstalo viset mimo svou fázi');
    assert.equal(bad.deadOnTurn, 0, 'vyřazený hráč nikdy nezůstal na tahu ve fázi PLAY');
    assert.equal(bad.healed, 0, 'Duch nikdy nezískal život');
    assert.equal(bad.dup, 0, 'žádná karta se nezdvojila');
    if (process.env.VOS_SWEEP_REPORT) process.stderr.write(JSON.stringify(seen) + '\n');
    for (const name of names) assert.ok(seen[name] > 0, `karta ${name} se ani jednou neozvala`);
});
