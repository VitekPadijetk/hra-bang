// Rozšíření A Fistful of Cards – druhý balíček událostí vedle High Noonu.
// Fáze 0: příprava balíčku, odkrývání a soužití s High Noonem (karty samotné zatím
// žádný efekt nemají – ty přibývají v dalších fázích).
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkGame } = require('./_helpers.js');
const { eventActive } = require('../core/highNoon.js');

before(() => { console.log = () => {}; });

const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));
const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));

// Hra se zapnutým Fistfulem (a volitelně i High Noonem).
function mkFfGame(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.fistfulCardData = ffData;
    g.highNoonCardData = hnData;
    const exps = { fistful: opts.ff !== false, high_noon: !!opts.hn };
    g._setupEventDeck({ expansions: exps });
    g._setupFistfulDeck({ expansions: exps });
    return g;
}

// Start tahu přesně jako nextTurn: nejdřív události, pak kontroly Dynamit/Vězení.
function startTurn(g) {
    if (g._beginTurn()) return;
    g.handleStartOfTurnChecks();
}

// ── Balíček ─────────────────────────────────────────────────────────────────

test('balíček Fistfulu má 15 karet a Fistful of Cards se líže jako poslední', () => {
    const g = mkFfGame([{ role: 'Sheriff' }, {}, {}, {}]);
    assert.equal(g.ffDeck.length, 15);
    assert.equal(g.ffDeck[0].key, 'FISTFUL_OF_CARDS', 'leží vespod (pop bere z konce)');
    const drawn = [];
    while (g.ffDeck.length) drawn.push(g.ffDeck.pop().key);
    assert.equal(drawn[drawn.length - 1], 'FISTFUL_OF_CARDS');
    assert.equal(new Set(drawn).size, 15, 'žádná karta se neopakuje');
});

test('každá karta má klíč, jméno i art a klíče se nekříží s High Noonem', () => {
    const hnKeys = new Set(hnData.map(c => c.key));
    ffData.forEach(c => {
        assert.ok(c.key && c.name && c.art, `karta ${c.id} má neúplná data`);
        assert.equal(hnKeys.has(c.key), false, `klíč ${c.key} koliduje s High Noonem`);
    });
    assert.equal(new Set(ffData.map(c => c.id)).size, ffData.length, 'ID se neopakují');
});

test('bez zapnutého rozšíření je balíček prázdný a hasEvent vždy false', () => {
    const g = mkGame([{ role: 'Sheriff' }, {}]);
    g.fistfulCardData = ffData;
    g._setupFistfulDeck({});
    assert.equal(g.ffDeck.length, 0);
    assert.equal(g.hasEvent('LECKA'), false);
});

// ── Odkrývání ───────────────────────────────────────────────────────────────

test('karta se odkryje až na DRUHÝ tah šerifa a jen na jeho tahu', () => {
    const g = mkFfGame([{ role: 'Sheriff' }, {}, {}]);
    startTurn(g);                       // 1. tah šerifa – ještě nic
    assert.equal(g.activeFistful, null);
    assert.equal(g.ffDeck.length, 15);

    g.currentPlayerIndex = 1;
    startTurn(g);                       // tah jiného hráče – nic
    assert.equal(g.activeFistful, null);

    g.currentPlayerIndex = 0;
    startTurn(g);                       // 2. tah šerifa – odkrytí
    assert.ok(g.activeFistful, 'karta je platná');
    assert.equal(g.ffDeck.length, 14);
    assert.equal(g.ffPile.length, 1);
    assert.equal(g.ffPile[0], g.activeFistful, 'vrchní karta hromádky je ta platná');
});

test('odkrytí nachystá animaci s údajem, ze kterého balíčku karta je', () => {
    const g = mkFfGame([{ role: 'Sheriff' }, {}], { hn: true });
    g._sheriffTurns = 1;                // příští start tahu je už druhý
    startTurn(g);
    assert.equal(g._pendingHighNoonReveal.deck, 'hn');
    assert.equal(g._pendingFistfulReveal.deck, 'ff');
    assert.equal(g._pendingFistfulReveal.remaining, g.ffDeck.length);
    assert.equal(g._pendingFistfulReveal.key, g.activeFistful.key);
});

test('došlý balíček Fistfulu nechá platnou poslední kartu a nespadne', () => {
    const g = mkFfGame([{ role: 'Sheriff' }, {}]);
    g.ffDeck = [];
    g.activeFistful = ffData.find(c => c.key === 'LECKA');
    g._sheriffTurns = 1;
    startTurn(g);
    assert.equal(g.hasEvent('LECKA'), true);
});

// ── Soužití obou balíčků ────────────────────────────────────────────────────

test('hasEvent vidí obě platné karty najednou', () => {
    const g = mkFfGame([{ role: 'Sheriff' }, {}], { hn: true });
    g.activeEvent = hnData.find(c => c.key === 'KAZATEL');
    g.activeFistful = ffData.find(c => c.key === 'LECKA');
    assert.equal(g.hasEvent('KAZATEL'), true);
    assert.equal(g.hasEvent('LECKA'), true);
    assert.equal(g.hasEvent('REVEREND'), false);
    // Klientské zrcadlo nad prostým JSON stavem musí odpovídat.
    const plain = JSON.parse(JSON.stringify(g));
    assert.equal(eventActive(plain, 'KAZATEL'), true);
    assert.equal(eventActive(plain, 'LECKA'), true);
    assert.equal(eventActive(plain, 'REVEREND'), false);
});

test('oba balíčky se otáčejí ve stejný okamžik', () => {
    const g = mkFfGame([{ role: 'Sheriff' }, {}], { hn: true });
    g._sheriffTurns = 1;
    startTurn(g);
    assert.ok(g.activeEvent && g.activeFistful, 'odkryly se obě karty');
    assert.equal(g.eventDeck.length, 12);
    assert.equal(g.ffDeck.length, 14);
});

test('došlý balíček High Noonu nezastaví otáčení Fistfulu', () => {
    const g = mkFfGame([{ role: 'Sheriff' }, {}], { hn: true });
    g.eventDeck = [];
    g._sheriffTurns = 1;
    startTurn(g);
    assert.ok(g.activeFistful, 'Fistful se otočil i bez High Noonu');
});

test('Kocovina z High Noonu se s otáčením Fistfulu nerozbije', () => {
    const g = mkFfGame([{ role: 'Sheriff', character: 'Bart Cassidy' }, {}], { hn: true });
    g.eventDeck = [hnData.find(c => c.key === 'KOCOVINA')];
    g._sheriffTurns = 1;
    startTurn(g);
    assert.equal(g.hasEvent('KOCOVINA'), true);
    assert.equal(g.players[0]._noAbility, true);
    assert.ok(g.activeFistful);
});

// ── Postavy ─────────────────────────────────────────────────────────────────

test('postavy Fistfulu jsou v poolu jen se zapnutým rozšířením', () => {
    const g = mkGame([{ role: 'Sheriff' }, {}]);
    const base = g._characterPool({});
    const withFf = g._characterPool({ expansions: { fistful: true } });
    assert.equal(base.length, 16);
    assert.equal(withFf.length, 19);
    ['Claus the Saint', 'Uncle Will', 'Johnny Kisch'].forEach(n => {
        assert.equal(base.includes(n), false);
        assert.ok(withFf.includes(n), `${n} chybí v poolu`);
    });
    // S oběma rozšířeními je pool součtem obou sad (nic se nepřepisuje).
    assert.equal(g._characterPool({ expansions: { dodge_city: true, fistful: true } }).length, 34);
});
