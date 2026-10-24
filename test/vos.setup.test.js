// Rozšíření Údolí stínů – fáze F0 (kostra): data, CardType, postavy, zapnutí, mixin
// a rozhodnutí pro Zuřivou Doroty a Lee Van Kliffa. Žádné pravidlo se v F0 nemění.
//
// Podklad: docs/udoli-stinu-plan.md §2.1–2.3, §2.14, §2.17 a §8 (F0).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GameState, CardType, Suits } = require('../logic.js');
const { VALLEY_CHARACTERS, VOS_READY, distinctCardKinds } = require('../logic/entities.js');
const { isBlueCard } = require('../core/cardRules.js');
const { dorothyCommandable } = require('../core/playability.js');
const V = require('../core/valley.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const vosData = rd('cards.udoli_stinu.json');
const baseData = rd('cards.json');
const kinds = distinctCardKinds(vosData);
const kind = (name) => kinds.find(c => c.name === name);

test('data: 16 karet s id 700–715, 15 druhů, všechny se značkou rozšíření', () => {
    assert.equal(vosData.length, 16);
    assert.deepEqual(vosData.map(c => c.id), Array.from({ length: 16 }, (_, i) => 700 + i));
    assert.equal(kinds.length, 15, 'Duch je dvakrát');
    for (const c of vosData) {
        assert.equal(c.exp, 'udoli_stinu', c.name);
        assert.ok(CardType[c.type], `${c.name}: typ ${c.type} chybí v CardType`);
        assert.ok(Suits[c.suit], `${c.name}: barva ${c.suit}`);
        assert.ok(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].includes(c.value), c.name);
        assert.ok(['brown', 'blue'].includes(c.border), c.name);
        // Art chodí průběžně: dokud nedorazí, `art` je null a karta se kreslí jako štítek
        // z `text` (plán §2.14) – text tedy mít musí každá.
        assert.ok(c.art === null || typeof c.art === 'string', c.name);
        assert.ok(typeof c.text === 'string' && c.text.length > 5, `${c.name}: chybí text štítku`);
    }
    // 10 hnědých a 6 modrých (2 zbraně, 2× Duch).
    assert.equal(vosData.filter(c => c.border === 'brown').length, 10);
    assert.equal(vosData.filter(c => c.border === 'blue').length, 6);
});

test('data: barvy a hodnoty podle podkladu (dynamit vybuchuje na 2♠ a Duch 9♠)', () => {
    const sv = (name) => vosData.filter(c => c.name === name).map(c => c.value + c.suit[0]).sort();
    assert.deepEqual(sv('Roztříštěná kulka'), ['2S']);
    assert.deepEqual(sv('Tomahawk'), ['AD']);
    assert.deepEqual(sv('Duch'), ['10S', '9S']);
    assert.deepEqual(sv('Brokovnice'), ['KS']);
    assert.deepEqual(sv('Lemat'), ['4D']);
});

test('id karet nekolidují s ostatními daty (textury card_<id> jsou sdílené)', () => {
    const others = ['cards.json', 'cards.dodge_city.json', 'cards.zlata_horecka.json']
        .flatMap(f => rd(f).map(c => c.id));
    for (const c of vosData) assert.ok(!others.includes(c.id), `id ${c.id} už existuje`);
});

test('CardType: nová jména nekolidují se žádným existujícím typem', () => {
    const vals = Object.values(CardType);
    assert.equal(new Set(vals).size, vals.length, 'dvě hodnoty CardType se stejným jménem');
});

test('modré karty: Odměna, Chřestýš, Duch a obě zbraně (José Delgado, Daltonové)', () => {
    for (const name of ['Odměna', 'Chřestýš', 'Duch', 'Lemat', 'Brokovnice']) {
        assert.equal(isBlueCard(kind(name)), true, name);
    }
    for (const name of ['Tomahawk', 'Poker', 'Útěk', 'Obětavý skok', 'Poslední pivo']) {
        assert.equal(isBlueCard(kind(name)), false, name);
    }
});

test('zbraně se poznávají podle effect (R3), dostřel 1', () => {
    assert.equal(kind('Lemat').type, CardType.WEAPON);
    assert.equal(kind('Lemat').effect, 'VOS_LEMAT');
    assert.equal(kind('Lemat').range, 1);
    assert.equal(kind('Brokovnice').effect, 'VOS_SHOTGUN');
    assert.equal(kind('Brokovnice').range, 1);
});

test('postavy: pět jmen, id 50–54 abecedně, portréty zatím nedodané', () => {
    assert.deepEqual(VALLEY_CHARACTERS,
        ['Colorado Bill', 'Evelyn Shebang', 'Henry Block', 'Limonádový Jim', 'Mick Defender']);
    const chars = rd('characters.json');
    VALLEY_CHARACTERS.forEach((name, i) => {
        const row = chars.find(c => c.name === name);
        assert.ok(row, `${name} chybí v characters.json`);
        assert.equal(row.id, 50 + i, name);
    });
    // Každý `portrait: false` musí sedět s tím, že soubor opravdu chybí (a naopak) –
    // jinak by loader buď stahoval 404, nebo dodaný portrét ignoroval.
    for (const row of chars.filter(c => c.id >= 50 && c.id <= 54)) {
        const file = path.join(__dirname, '..', 'assets', 'characters', String(row.id).padStart(3, '0') + '.webp');
        assert.equal(row.portrait !== false, fs.existsSync(file), `${row.name}: portrait vs. soubor`);
    }
});

test('art karet: vyplněný `art` = soubor existuje, `null` = štítek', () => {
    for (const c of vosData) {
        if (!c.art) continue;
        const file = path.join(__dirname, '..', 'assets', 'card_art', 'udoli_stinu', c.art + '.webp');
        assert.ok(fs.existsSync(file), `${c.name}: chybí ${file}`);
    }
    const mark = path.join(__dirname, '..', 'assets', 'card_marks', 'udoli_stinu.webp');
    assert.equal(V.VOS_MARK_READY, fs.existsSync(mark), 'VOS_MARK_READY vs. soubor značky');
});

// ── Zapnutí (plán §2.2) ──────────────────────────────────────────────────────

function mkSetup() {
    const g = new GameState();
    g.cardData = baseData;
    g.vosCardData = vosData;
    return g;
}

test('balíček: jdou do něj jen hotové druhy (VOS_CARDS_READY)', () => {
    const g = mkSetup();
    const data = g._deckDataFor({ expansions: { udoli_stinu: true } });
    const vos = data.filter(c => c.exp === 'udoli_stinu');
    assert.deepEqual(vos.map(c => c.name).sort(),
        vosData.filter(c => V.VOS_CARDS_READY.includes(c.name)).map(c => c.name).sort());
    assert.equal(data.length, baseData.length + vos.length);
    // Vypnuté rozšíření = beze změny (i stejná reference jako dřív).
    assert.equal(g._deckDataFor({ expansions: {} }), baseData);
});

test('výběr postav: ostrá hra jen VOS_READY, debug hra všech pět', () => {
    const g = mkSetup();
    const live = g._characterPool({ expansions: { udoli_stinu: true } });
    const dbg = g._characterPool({ expansions: { udoli_stinu: true }, debugPool: true });
    for (const name of VALLEY_CHARACTERS) {
        assert.equal(live.includes(name), VOS_READY.includes(name), name);
        assert.ok(dbg.includes(name), name);
    }
    assert.ok(!g._characterPool({ expansions: {} }).some(n => VALLEY_CHARACTERS.includes(n)));
});

test('setupGame s rozšířením projde a nic z Údolí stínů bez efektu nerozdá', () => {
    const g = mkSetup();
    g.setupGame(5, ['A', 'B', 'C', 'D', 'E'], { expansions: { udoli_stinu: true } });
    const all = g.deck.cards.concat(...g.players.map(p => p.hand));
    const bad = all.filter(c => c.exp === 'udoli_stinu' && !V.VOS_CARDS_READY.includes(c.name));
    assert.deepEqual(bad, []);
    assert.equal(g._vosOn(), true);
    assert.equal(V.vosOn(g), true);
});

test('mixin je na prototypu a bez rozšíření je vypnutý', () => {
    const g = new GameState();
    assert.equal(typeof g._vosOn, 'function');
    assert.equal(g._vosOn(), false);
    g.options = { expansions: { dodge_city: true } };
    assert.equal(g._vosOn(), false);
});

test('hasDuchCard: odvozuje se z karty na stole', () => {
    assert.equal(V.hasDuchCard(null), false);
    assert.equal(V.hasDuchCard({ board: [] }), false);
    assert.equal(V.hasDuchCard({ board: [kind('Duch')] }), true);
    assert.equal(V.hasDuchCard({ board: [kind('Odměna')] }), false);
});

// ── Zuřivá Doroty a Lee Van Kliff (plán §2.17) ───────────────────────────────

test('strukturální: každý druh karty má rozhodnutí pro Doroty i Lee Van Kliffa', () => {
    for (const k of kinds) {
        const row = V.VOS_KINDS[k.name];
        assert.ok(row, `${k.name}: chybí v VOS_KINDS (core/valley.js)`);
        assert.equal(typeof row.dorothy, 'boolean', k.name);
        assert.equal(typeof row.lvk, 'boolean', k.name);
        assert.ok(row.why, `${k.name}: chybí zdůvodnění`);
        // Paměť Lee Van Kliffa drží jen HNĚDÉ karty – modrá s lvk: true by byla omyl.
        if (isBlueCard(k)) assert.equal(row.lvk, false, `${k.name} je modrá`);
    }
    assert.deepEqual(Object.keys(V.VOS_KINDS).sort(), kinds.map(k => k.name).sort(),
        'VOS_KINDS má druh, který v datech není');
});

test('Doroty: tabulka platí v dorothyCommandable, ostatní karty beze změny', () => {
    for (const k of kinds) {
        assert.equal(dorothyCommandable(k), V.VOS_KINDS[k.name].dorothy, k.name);
    }
    for (const name of ['Roztříštěná kulka', 'Dvojitá rána', 'Útěk', 'Obětavý skok', 'Opětovná palba']) {
        assert.equal(dorothyCommandable(kind(name)), false, name);
    }
    const base = distinctCardKinds(baseData);
    assert.ok(base.every(c => dorothyCommandable(c)), 'karta základní hry přestala jít poručit');
});

test('Lee Van Kliff: zakázané druhy se do paměti nezapíšou, BANG! pod Zúčtováním ano', () => {
    const g = new GameState();
    for (const name of ['Roztříštěná kulka', 'Dvojitá rána', 'Útěk', 'Obětavý skok', 'Opětovná palba']) {
        assert.equal(g._brownRepeatSpec(kind(name)), null, name);
        // Karta zahraná jako BANG! (Zúčtování) opakuje BANG!, ne svůj vlastní efekt.
        assert.deepEqual(g._brownRepeatSpec(kind(name), { asBang: true }),
            { effect: 'BANG', aim: 'shoot', range: null }, name);
    }
    // Tomahawk je bang-efekt s dostřelem 2 – opakuje se stávající větví.
    assert.deepEqual(g._brownRepeatSpec(kind('Tomahawk'), { asBang: true }),
        { effect: 'BANG_EFFECT', aim: 'shoot', range: 2 });
});
