// Rozšíření Ozbrojení a nebezpeční – fáze A0 (kostra): data, CardType, postavy, zapnutí,
// mixin, zásoba žetonů nabití se třemi jedinými cestami změny, vyložení Nebezpečné karty
// se 3 žetony a vyčerpání. Efekty karet ani schopnosti postav v A0 ještě nejsou.
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §2.1–2.6, §2.9 a §8 (A0).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GameState, CardType, Suits, Card } = require('../logic.js');
const { ARMED_CHARACTERS, AD_READY, distinctCardKinds } = require('../logic/entities.js');
const { isBlueCard, isDangerousCard, isBrownCard, getActionForCard } = require('../core/cardRules.js');
const { cardPlayability } = require('../core/playability.js');
const { healthForCharacter } = require('../core/roles.js');
const A = require('../core/armed.js');
const { mkGame, give, board } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const baseData = rd('cards.json');
const kinds = distinctCardKinds(adData);
const kind = (name) => kinds.find(c => c.name === name);
const AD_ON = { expansions: { ozbrojeni: true } };

// Karta z dat rozšíření s vlastním (unikátním) id – stejná konverze jako Deck.
let _seq = 90000;
function adCard(name) {
    const row = adData.find(c => c.name === name);
    const c = new Card(_seq++, row.name, CardType[row.type], Suits[row.suit], row.value, row.props || {});
    c.effect = row.props?.effect || null;
    c.exp = row.exp; c.border = row.border; c.art = row.art;
    return c;
}
function giveAd(g, idx, name) {
    g.players[idx].hand.push(adCard(name));
    return g.players[idx].hand.length - 1;
}
function mkAd(specs, opts) {
    const g = mkGame(specs, opts);
    g.options = AD_ON;
    return g;
}

// ── Data (§2.1) ──────────────────────────────────────────────────────────────

test('data: 28 karet s id 200–227, 25 druhů, všechny se značkou rozšíření', () => {
    assert.equal(adData.length, 28);
    assert.deepEqual(adData.map(c => c.id), Array.from({ length: 28 }, (_, i) => 200 + i));
    assert.equal(kinds.length, 25, '4× BANG! je jeden druh');
    for (const c of adData) {
        assert.equal(c.exp, 'ozbrojeni', c.name);
        assert.ok(CardType[c.type], `${c.name}: typ ${c.type} chybí v CardType`);
        assert.ok(Suits[c.suit], `${c.name}: barva ${c.suit}`);
        assert.ok(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].includes(c.value), c.name);
        assert.ok(['brown', 'orange'].includes(c.border), c.name);
        // Karta bez artu se kreslí jako štítek z `text` – text tedy mít musí.
        if (!c.art) assert.ok(typeof c.text === 'string' && c.text.length > 5, `${c.name}: chybí text štítku`);
    }
    // 13 Nebezpečných (9 objektů + 4 zbraně), 9 nových hnědých, 6 ze základní hry.
    assert.equal(adData.filter(c => c.border === 'orange').length, 13);
    assert.equal(adData.filter(c => c.props?.dangerous).length, 13);
    assert.equal(adData.filter(c => c.type === 'WEAPON').length, 4);
    assert.equal(adData.filter(c => c.props?.upgrade).length, 7, 'sedm vylepšitelných');
});

test('data: barvy, hodnoty a ceny podle podkladu (Dynamit vybuchuje na 2♠, 3♠ a 9♠)', () => {
    const sv = (name) => adData.filter(c => c.name === name).map(c => c.value + c.suit[0]).sort();
    assert.deepEqual(sv('Bang!'), ['2C', '2D', '3D', '6H']);
    assert.deepEqual(sv('Cat Balou'), ['3H']);
    assert.deepEqual(sv('Vedle!'), ['KS']);
    assert.deepEqual(sv('Kolona'), ['2S']);
    assert.deepEqual(sv('Rychlopalba'), ['3S']);
    assert.deepEqual(sv('Rez'), ['9S']);
    assert.deepEqual(sv('Big Fifty'), ['QS']);
    const cost = (name) => adData.find(c => c.name === name).props.dangerous.cost;
    assert.equal(cost('Eso v rukávu'), 2);
    assert.equal(cost('Bečka piva'), 3);
    assert.equal(cost('Bomba'), null);
    assert.equal(cost('Thunderer'), 1);
    assert.equal(adData.find(c => c.name === 'Malý doušek').props.upgrade.cost, 3);
});

test('data: karty ze základní hry mají art základní hry, ne štítek', () => {
    for (const c of adData.filter(c => ['Bang!', 'Cat Balou', 'Vedle!'].includes(c.name))) {
        assert.ok(baseData.some(b => b.art === c.art), `${c.name}: art ${c.art} základní hra nezná`);
    }
});

test('id karet nekolidují s ostatními daty (textury card_<id> jsou sdílené)', () => {
    const others = ['cards.json', 'cards.dodge_city.json', 'cards.zlata_horecka.json',
                    'cards.udoli_stinu.json', 'cards.high_noon.json', 'cards.fistful.json',
                    'cards.divoky_zapad.json'].flatMap(f => rd(f).map(c => c.id));
    for (const c of adData) assert.ok(!others.includes(c.id), `id ${c.id} už existuje`);
});

test('CardType: nová jména nekolidují se žádným existujícím typem', () => {
    const vals = Object.values(CardType);
    assert.equal(new Set(vals).size, vals.length, 'dvě hodnoty CardType se stejným jménem');
});

test('Card přenáší dangerous/upgrade ve všech cestách vzniku (kopie, ne sdílený objekt)', () => {
    const a = adCard('Bedna'), b = adCard('Bedna');
    assert.deepEqual(a.dangerous, { cost: 2 });
    assert.notEqual(a.dangerous, b.dangerous);
    assert.deepEqual(kind('Big Fifty').dangerous, { cost: 1 });
    assert.equal(kind('Big Fifty').range, 6);
    assert.equal(kind('Big Fifty').effect, 'AD_BIG_FIFTY');
    assert.deepEqual(kind('Kolona').upgrade, { cost: 2 });
    assert.equal(kind('Kolona').dangerous, undefined);
    // debug rozdávání jde přes stejný konstruktor
    const g = mkAd([{}, {}]);
    g.debugGiveCard(0, adData.find(c => c.name === 'Bič'));
    assert.deepEqual(g.players[0].hand[0].dangerous, { cost: 3 });
});

// ── Co je oranžová karta (§2.4) ─────────────────────────────────────────────

test('isDangerousCard / isBlueCard / isBrownCard: oranžová není modrá ani hnědá', () => {
    for (const name of ['Big Fifty', 'Bedna', 'Bomba', 'Stepní běžec']) {
        assert.equal(isDangerousCard(kind(name)), true, name);
        assert.equal(isBlueCard(kind(name)), false, `${name}: dobití za modrou ani José Delgado ji neberou`);
        assert.equal(isBrownCard(kind(name)), false, name);
    }
    for (const name of ['Kolona', 'Šíp', 'Rez', 'Bang!', 'Cat Balou']) {
        assert.equal(isBrownCard(kind(name)), true, name);
        assert.equal(isDangerousCard(kind(name)), false, name);
    }
    const base = distinctCardKinds(baseData);
    const by = (n) => base.find(c => c.name === n);
    assert.equal(isBlueCard(by('Volcanic')), true, 'obyčejná zbraň zůstává modrá');
    assert.equal(isBrownCard(by('Volcanic')), false);
    assert.equal(isBrownCard(by('Pivo')), true);
});

test('getActionForCard: Nebezpečná karta se vykládá (PLAY_BLUE), Bomba zatím ne', () => {
    assert.equal(getActionForCard(kind('Bedna'), []), 'PLAY_BLUE');
    assert.equal(getActionForCard(kind('Thunderer'), []), 'PLAY_BLUE');
    assert.notEqual(getActionForCard(kind('Bomba'), []), 'PLAY_BLUE');
});

// ── Postavy ──────────────────────────────────────────────────────────────────

test('postavy: osm jmen, id 55–62 abecedně, portréty zatím nedodané, Red Ringo 5 životů', () => {
    assert.deepEqual(ARMED_CHARACTERS, ['Al Preacher', 'Bass Greeves', 'Bloody Mary', 'Frankie Canton',
                                        'Julie Cutter', 'Mexicali Kid', 'Ms. Abigail', 'Red Ringo']);
    const chars = rd('characters.json');
    ARMED_CHARACTERS.forEach((name, i) => {
        const row = chars.find(c => c.name === name);
        assert.ok(row, `${name} chybí v characters.json`);
        assert.equal(row.id, 55 + i, name);
    });
    // `portrait: false` musí sedět s tím, že soubor opravdu chybí (a naopak) – jinak by
    // loader buď stahoval 404, nebo dodaný portrét ignoroval.
    for (const row of chars.filter(c => c.id >= 55 && c.id <= 62)) {
        const file = path.join(__dirname, '..', 'assets', 'characters', String(row.id).padStart(3, '0') + '.webp');
        assert.equal(row.portrait !== false, fs.existsSync(file), `${row.name}: portrait vs. soubor`);
    }
    assert.deepEqual(healthForCharacter('Red Ringo', 'Outlaw'), { base: 5, max: 5 });
    assert.deepEqual(healthForCharacter('Julie Cutter', 'Sheriff'), { base: 4, max: 5 });
});

test('art: vyplněný `art` u vlastní karty = soubor existuje; značka jen s AD_MARK_READY', () => {
    for (const c of adData) {
        if (!c.art || baseData.some(b => b.art === c.art)) continue;
        const file = path.join(__dirname, '..', 'assets', 'card_art', 'ozbrojeni', c.art + '.webp');
        assert.ok(fs.existsSync(file), `${c.name}: chybí ${file}`);
    }
    const mark = path.join(__dirname, '..', 'assets', 'card_marks', 'ozbrojeni.webp');
    assert.equal(A.AD_MARK_READY, fs.existsSync(mark), 'AD_MARK_READY vs. soubor značky');
});

// ── Zapnutí (§2.2) ───────────────────────────────────────────────────────────

function mkSetup() {
    const g = new GameState();
    g.cardData = baseData;
    g.adCardData = adData;
    return g;
}

test('balíček: jdou do něj jen hotové druhy (AD_CARDS_READY) – po A2 jednadvacet karet', () => {
    const g = mkSetup();
    const data = g._deckDataFor(AD_ON);
    const ad = data.filter(c => c.exp === 'ozbrojeni');
    assert.deepEqual(ad.map(c => c.name).sort(),
        adData.filter(c => A.AD_CARDS_READY.includes(c.name)).map(c => c.name).sort());
    assert.equal(ad.length, 21);
    assert.equal(data.length, baseData.length + 21);
    assert.equal(g._deckDataFor({ expansions: {} }), baseData, 'vypnuté rozšíření = beze změny');
});

test('katalog debug hry: hotové druhy + vykládatelné Nebezpečné karty, Bomba ne', () => {
    const names = A.adDebugCards(adData).map(c => c.name);
    assert.ok(names.includes('Bang!') && names.includes('Big Fifty') && names.includes('Bič'));
    assert.ok(!names.includes('Bomba'));
    assert.ok(names.includes('Kolona'), 'hotová hnědá do katalogu jde');
    assert.ok(!names.includes('Šíp'), 'hnědá bez efektu do katalogu nejde');
});

test('výběr postav: ostrá hra jen AD_READY, debug hra všech osm', () => {
    const g = mkSetup();
    const live = g._characterPool(AD_ON);
    const dbg = g._characterPool({ ...AD_ON, debugPool: true });
    for (const name of ARMED_CHARACTERS) {
        assert.equal(live.includes(name), AD_READY.includes(name), name);
        assert.ok(dbg.includes(name), name);
    }
    assert.ok(!g._characterPool({ expansions: {} }).some(n => ARMED_CHARACTERS.includes(n)));
});

test('setupGame s rozšířením projde a nic bez efektu nerozdá; zásoba je plná', () => {
    const g = mkSetup();
    g.setupGame(5, ['A', 'B', 'C', 'D', 'E'], AD_ON);
    const all = g.deck.cards.concat(...g.players.map(p => p.hand));
    assert.deepEqual(all.filter(c => c.exp === 'ozbrojeni' && !A.AD_CARDS_READY.includes(c.name)), []);
    assert.equal(all.filter(c => c.exp === 'ozbrojeni').length, 21);
    assert.equal(g._adOn(), true);
    assert.equal(A.adOn(g), true);
    assert.equal(g._adSupply(), 32);
});

test('mixin je na prototypu a bez rozšíření je vypnutý', () => {
    const g = new GameState();
    assert.equal(typeof g._adAdd, 'function');
    assert.equal(g._adOn(), false);
    g.options = { expansions: { udoli_stinu: true } };
    assert.equal(g._adOn(), false);
});

// ── Žetony: zásoba a tři cesty (§2.5) ────────────────────────────────────────

test('zásoba se počítá: 32 minus žetony na postavách a Nebezpečných kartách ve hře', () => {
    const g = mkAd([{}, {}, {}]);
    assert.equal(g._adSupply(), 32);
    const crate = adCard('Bedna'); g.players[0].board.push(crate);
    g._adAdd(crate, 3);
    g._adAdd(g.players[1], 2);
    assert.equal(g._adSupply(), 27);
    // Vyřazený hráč se nepočítá – jeho žetony jsou zpátky v zásobě.
    g.players[1].health = 0;
    assert.equal(g._adSupply(), 29);
    // Karta mimo hru (v ruce, v odhozu) se nepočítá, i když jí zůstalo staré číslo.
    g.players[0].board.splice(0, 1);
    g.players[0].hand.push(crate);
    assert.equal(crate.adLoads, 3);
    assert.equal(g._adSupply(), 32);
});

test('_adAdd: strop 4 na kartě i postavě a jen kolik je v zásobě', () => {
    const g = mkAd([{}, {}]);
    const me = g.players[0];
    assert.equal(g._adAdd(me, 3), 3);
    assert.equal(g._adAdd(me, 3), 1, 'nad 4 se pokyn ignoruje');
    assert.equal(me.adLoads, 4);
    // Vyprázdni zásobu: 7 karet × 4 = 28, + 4 na postavě = 32.
    for (let i = 0; i < 7; i++) {
        const c = adCard('Bič'); c.name = 'Bič ' + i;   // jména kvůli „ne dvě stejného"
        g.players[1].board.push(c);
        g._adAdd(c, 4);
    }
    assert.equal(g._adSupply(), 0);
    const last = adCard('Bedna'); g.players[1].board.push(last);
    assert.equal(g._adAdd(last, 3), 0, 'prázdná zásoba nic nedá');
});

test('_adTake: poslední žeton odhodí kartu, zbraň se vrátí na Colt .45', () => {
    const g = mkAd([{}, {}]);
    const me = g.players[0];
    const bell = adCard('Zvonice'); me.board.push(bell); g._adAdd(bell, 3);
    assert.equal(g._adTake(bell, 2), 2);
    assert.ok(me.board.includes(bell));
    assert.equal(g._adTake(bell, 5), 1, 'vezme jen kolik leží');
    assert.ok(!me.board.includes(bell), 'vyčerpaná karta odchází');
    assert.equal(g.deck.discardTop(), bell);
    const gun = adCard('Thunderer'); me.weapon = gun; g._adAdd(gun, 1);
    g._adTake(gun, 1);
    assert.equal(me.weapon.id, -1);
    assert.equal(me.weapon.name, 'Colt .45');
    assert.equal(g.deck.discardTop(), gun);
    assert.equal(g._adSupply(), 32);
});

test('_adMove: přesun, přebytek nad strop je v zásobě, vyčerpaný zdroj odchází', () => {
    const g = mkAd([{}, {}]);
    const crate = adCard('Bedna'); g.players[1].board.push(crate); g._adAdd(crate, 2);
    const me = g.players[0]; g._adAdd(me, 3);
    assert.equal(g._adMove(crate, me, 2), 1, 'na postavu se vejde jen 1');
    assert.equal(me.adLoads, 4);
    assert.ok(!g.players[1].board.includes(crate), 'Bedna bez žetonů odešla');
    assert.equal(g._adSupply(), 28);
});

test('strukturální: .adLoads se píše jen v logic/armed.js (_adAdd, _adTake, _adMove)', () => {
    const root = path.join(__dirname, '..');
    const files = ['logic.js', 'server.js',
        ...['logic', 'core', 'server', 'view', 'net'].flatMap(d =>
            fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.js')).map(f => `${d}/${f}`))];
    const write = /\.adLoads\s*(=(?!=)|\+=|-=|\+\+|--)/;
    const bad = [];
    for (const f of files) {
        const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
        lines.forEach((l, i) => { if (write.test(l) && f !== 'logic/armed.js') bad.push(`${f}:${i + 1}`); });
    }
    assert.deepEqual(bad, [], 'žetony se mění jen třemi cestami v logic/armed.js');
    // …a v logic/armed.js jen uvnitř těch tří metod.
    const src = fs.readFileSync(path.join(root, 'logic/armed.js'), 'utf8');
    let fn = null;
    src.split('\n').forEach((l, i) => {
        const m = l.match(/^    (_ad\w+)\(/);
        if (m) fn = m[1];
        if (write.test(l)) assert.ok(['_adAdd', '_adTake', '_adMove'].includes(fn), `logic/armed.js:${i + 1} v ${fn}`);
    });
});

// ── Vyložení Nebezpečné karty (§2.9) ────────────────────────────────────────

test('Nebezpečný objekt se vyloží před hráče se 3 žetony, zásoba ×29', () => {
    const g = mkAd([{}, {}]);
    const idx = giveAd(g, 0, 'Bedna');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[idx]), true);
    g.playCard(idx);
    const placed = g.players[0].board.find(c => c.name === 'Bedna');
    assert.ok(placed, 'karta leží na stole');
    assert.equal(placed.adLoads, 3);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g._adSupply(), 29);
    assert.equal(g.phase, 'PLAY');
});

test('Nebezpečná zbraň nahradí zbraň a dostane 3 žetony; žetony staré zbraně se vrátí', () => {
    const g = mkAd([{}, {}]);
    g.playCard(giveAd(g, 0, 'Big Fifty'));
    const me = g.players[0];
    assert.equal(me.weapon.name, 'Big Fifty');
    assert.equal(me.weapon.adLoads, 3);
    assert.equal(g._adSupply(), 29);
    g.playCard(giveAd(g, 0, 'Thunderer'));
    assert.equal(me.weapon.name, 'Thunderer');
    assert.equal(me.weapon.adLoads, 3);
    assert.equal(g._adSupply(), 29, 'žetony Big Fifty jsou zpátky v zásobě');
    assert.equal(g.deck.discardTop().name, 'Big Fifty');
});

test('bez 3 žetonů v zásobě kartu zahrát nejde (klient, bot i server stejně)', () => {
    const g = mkAd([{}, {}]);
    g._adAdd(g.players[1], 4);
    for (let i = 0; i < 6; i++) {
        const c = adCard('Bič'); c.name = 'Bič ' + i;
        g.players[1].board.push(c); g._adAdd(c, 4);
    }
    const crate = adCard('Bedna'); g.players[1].board.push(crate); g._adAdd(crate, 2);
    assert.equal(g._adSupply(), 2);
    const idx = giveAd(g, 0, 'Eso v rukávu');
    const card = g.players[0].hand[idx];
    assert.equal(A.adArmOk(g, g.players[0], card), false);
    assert.equal(cardPlayability(g, g.players[0], 0, card), false);
    g.playCard(idx);
    assert.equal(g.players[0].hand.length, 1, 'server zahrání odmítl');
    assert.equal(g.players[0].board.length, 0);
});

test('dvě Nebezpečné karty stejného jména před sebou mít nejde (jako modré)', () => {
    const g = mkAd([{}, {}]);
    g.playCard(giveAd(g, 0, 'Bedna'));
    const idx = giveAd(g, 0, 'Bedna');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[idx]), false);
    g.playCard(idx);
    assert.equal(g.players[0].board.filter(c => c.name === 'Bedna').length, 1);
    assert.equal(g._adSupply(), 29);
});

test('Panika vezme kartu bez žetonů; nové vyložení dá zase 3 (ne staré číslo)', () => {
    const g = mkAd([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.currentPlayerIndex = 1;
    g.playCard(giveAd(g, 1, 'Paklíč'));
    const pick = g.players[1].board[0];
    g._adTake(pick, 1);
    assert.equal(pick.adLoads, 2);
    assert.equal(g._adSupply(), 30);
    g.currentPlayerIndex = 0;
    g.playSpecialCard(0, 1, give(g, 0, CardType.PANIC, { name: 'Panika!' }));
    g.resolveCardSelection(0, 'board', 0);
    assert.ok(g.players[0].hand.includes(pick), 'Paklíč je v ruce útočníka');
    assert.equal(g._adSupply(), 32, 'žetony se vrátily do zásoby');
    g.playCard(g.players[0].hand.indexOf(pick));
    assert.equal(pick.adLoads, 3, 'vyložení přepíše staré číslo na 3');
    assert.equal(g._adSupply(), 29);
});

test('Soudce (Fistful): Nebezpečnou kartu vyložit nejde – server, klient i bot', () => {
    const g = mkAd([{}, {}]);
    g.activeFistful = { key: 'SOUDCE' };
    assert.equal(g.hasEvent('SOUDCE'), true);
    for (const name of ['Bedna', 'Big Fifty']) {
        const idx = giveAd(g, 0, name);
        assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[idx]), false, name);
        g.playCard(idx);
    }
    assert.equal(g.players[0].board.length, 0);
    assert.equal(g.players[0].weapon.id, -1);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g._judgeBlocks(adCard('Kolona')), false, 'hnědá karta se nevykládá');
});

test('Bomba se v A0 zahrát nedá (fáze A4)', () => {
    const g = mkAd([{}, {}]);
    const idx = giveAd(g, 0, 'Bomba');
    assert.equal(A.adArmOk(g, g.players[0], g.players[0].hand[idx]), false);
    g.playCard(idx);
    assert.equal(g.players[0].hand.length, 1);
});

test('Lee Van Kliff: vyložení Nebezpečné karty paměť hnědé karty nemaže', () => {
    const g = mkAd([{}, {}]);
    g._lastBrown = { playerIdx: 0, turnId: g.turnId, name: 'Pivo' };
    g._markBrownPlayed(0, adCard('Bedna'));
    assert.equal(g._lastBrown.name, 'Pivo');
});
