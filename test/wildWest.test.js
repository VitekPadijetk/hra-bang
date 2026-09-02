// Rozšíření Divoký západ (Wild West Show) – TŘETÍ balíček událostí.
// Fáze 0: příprava balíčku, odkrývání Dostavníkem / Wells Fargem a soužití se dvěma
// už hotovými balíčky (karty samotné zatím žádný efekt nemají – ty přibývají dál).
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give } = require('./_helpers.js');
const { CardType } = require('../logic.js');
const { eventActive } = require('../core/highNoon.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const ffData = rd('cards.fistful.json');
const hnData = rd('cards.high_noon.json');

// Hra se zapnutým Divokým západem (a volitelně i High Noonem / Fistfulem).
function mkWwsGame(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.wwsCardData = wwsData;
    g.fistfulCardData = ffData;
    g.highNoonCardData = hnData;
    const exps = { divoky_zapad: opts.wws !== false, high_noon: !!opts.hn, fistful: !!opts.ff };
    g._setupEventDeck({ expansions: exps });
    g._setupFistfulDeck({ expansions: exps });
    g._setupWwsDeck({ expansions: exps });
    return g;
}

// ── Balíček ─────────────────────────────────────────────────────────────────

test('balíček Divokého západu má 10 karet a Divoký západ se líže jako poslední', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}, {}, {}]);
    assert.equal(g.wwsDeck.length, 10);
    assert.equal(g.wwsDeck[0].key, 'DIVOKY_ZAPAD', 'leží vespod (pop bere z konce)');
    const drawn = [];
    while (g.wwsDeck.length) drawn.push(g.wwsDeck.pop().key);
    assert.equal(drawn[drawn.length - 1], 'DIVOKY_ZAPAD');
    assert.equal(new Set(drawn).size, 10, 'žádná karta se neopakuje');
});

test('každá karta má klíč, jméno i art a klíče se nekříží s ostatními balíčky', () => {
    const otherKeys = new Set([...hnData, ...ffData].map(c => c.key));
    const otherIds = new Set([...hnData, ...ffData].map(c => c.id));
    wwsData.forEach(c => {
        assert.ok(c.key && c.name && c.art && c.text, `karta ${c.id} má neúplná data`);
        assert.equal(otherKeys.has(c.key), false, `klíč ${c.key} koliduje s jiným balíčkem`);
        assert.equal(otherIds.has(c.id), false, `ID ${c.id} koliduje s jiným balíčkem`);
    });
    assert.equal(new Set(wwsData.map(c => c.id)).size, wwsData.length, 'ID se neopakují');
});

test('art každé karty i rub balíčku leží v assets', () => {
    wwsData.forEach(c => {
        const p = path.join(__dirname, '..', 'assets', 'divoky_zapad_cards', `${c.art}.webp`);
        assert.ok(fs.existsSync(p), `chybí art ${c.art}.webp`);
    });
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'other_cards',
                                      'divoky_zapad', 'divoky_zapad.webp')), 'chybí rub balíčku');
});

test('bez zapnutého rozšíření je balíček prázdný a hasEvent vždy false', () => {
    const g = mkGame([{ role: 'Sheriff' }, {}]);
    g.wwsCardData = wwsData;
    g._setupWwsDeck({});
    assert.equal(g.wwsDeck.length, 0);
    assert.equal(g.hasEvent('SACAGAWAY'), false);
    // A Dostavník na prázdném balíčku nesmí nic odkrýt ani spadnout.
    assert.equal(g._flipWwsEvent(0), false);
    assert.equal(g.activeWws, null);
});

// Dostavník / Wells Fargo odkrývají kartu událostí až ZA lízáním (bug 51), takže
// se ve zkouškách musí fáze lízání doopravdy dobrat.
const finishDraw = (g) => {
    for (let k = 0; k < 12 && g.phase === 'DRAW' && g.drawPhaseState.active; k++) {
        if (!g.deck.cards.length) g.deck.cards.push(mkCard(CardType.BANG));
        g.drawCard('deck');
    }
};

// ── Odkrývání ───────────────────────────────────────────────────────────────

test('na začátku hry neplatí žádná událost Divokého západu', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}, {}]);
    assert.equal(g.activeWws, null);
    assert.equal(g.wwsPile.length, 0);
});

test('start tahu kartu NEotáčí (na rozdíl od High Noonu a Fistfulu)', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}, {}], { hn: true, ff: true });
    g._sheriffTurns = 1;                // příští start tahu je už druhý
    if (!g._beginTurn()) g.handleStartOfTurnChecks();
    assert.ok(g.activeEvent && g.activeFistful, 'oba staré balíčky se otočily');
    assert.equal(g.activeWws, null, 'Divoký západ se šerifovým tahem neotáčí');
    assert.equal(g.wwsDeck.length, 10);
});

test('Dostavník odkryje kartu, nachystá animaci a teprve pak se líže', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}, {}]);
    const idx = give(g, 0, CardType.STAGECOACH);
    g.playCard(idx);
    assert.equal(g.activeWws, null, 'nejdřív se líže, karta se otočí až potom');
    assert.equal(g.phase, 'DRAW', 'fáze lízání Dostavníku běží');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    finishDraw(g);
    assert.ok(g.activeWws, 'karta je platná');
    assert.equal(g.wwsDeck.length, 9);
    assert.equal(g.wwsPile.length, 1);
    assert.equal(g.wwsPile[0], g.activeWws, 'vrchní karta hromádky je ta platná');
    assert.equal(g._pendingWwsReveal.deck, 'wws');
    assert.equal(g._pendingWwsReveal.remaining, 9);
    assert.equal(g._pendingWwsReveal.playerIdx, 0);
    assert.equal(g._pendingWwsReveal.key, g.activeWws.key);
    assert.equal(g.phase, 'PLAY', 'a hráč pokračuje ve svém tahu');
});

test('Wells Fargo odkrývá taky a nahradí předchozí kartu', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}, {}]);
    g.playCard(give(g, 0, CardType.STAGECOACH));
    finishDraw(g);
    const first = g.activeWws;
    const wf = give(g, 0, CardType.WELLS_FARGO);
    g.playCard(wf);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    assert.equal(g.activeWws.key, first.key, 'stará karta platí, dokud se líže');
    finishDraw(g);
    assert.notEqual(g.activeWws.key, first.key, 'platí nová karta');
    assert.equal(g.wwsPile.length, 2);
    assert.equal(g.wwsPile[1], g.activeWws);
    assert.equal(g.hasEvent(first.key), false, 'předchozí karta odchází ze hry');
});

test('Divoký západ zůstává v platnosti a dalším Dostavníkem se nevymění', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}, {}]);
    g.wwsDeck = [wwsData.find(c => c.key === 'ROUBIK'),
                 wwsData.find(c => c.key === 'DIVOKY_ZAPAD')];
    g.playCard(give(g, 0, CardType.STAGECOACH));
    finishDraw(g);
    assert.equal(g.activeWws.key, 'DIVOKY_ZAPAD');
    g._pendingWwsReveal = null;
    g.playCard(give(g, 0, CardType.STAGECOACH));
    finishDraw(g);
    assert.equal(g.activeWws.key, 'DIVOKY_ZAPAD', 'zůstává do konce hry');
    assert.equal(g.wwsDeck.length, 1, 'z balíčku se nic nevzalo');
    assert.equal(g._pendingWwsReveal, null, 'a neodkrývá se ani animace');
});

test('zopakování efektu (Lee Van Kliff) kartu neotáčí', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}]);
    assert.equal(g._flipWwsEvent(0, { repeat: true }), false);
    assert.equal(g.activeWws, null);
    assert.equal(g.wwsDeck.length, 10);
});

test('Krytý vůz (Dodge City) událost neotáčí', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}]);
    const idx = give(g, 0, CardType.COVERED_WAGON, { props: { green: true, activate: 'steal_any' } });
    g.playCard(idx);
    assert.equal(g.activeWws, null);
    assert.equal(g.wwsDeck.length, 10);
});

test('došlý balíček nechá platnou poslední kartu a nespadne', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}]);
    g.wwsDeck = [];
    g.activeWws = wwsData.find(c => c.key === 'SACAGAWAY');
    g.playCard(give(g, 0, CardType.STAGECOACH));
    finishDraw(g);
    assert.equal(g.hasEvent('SACAGAWAY'), true);
});

// ── Soužití všech tří balíčků ───────────────────────────────────────────────

test('hasEvent i klientské zrcadlo vidí všechny tři platné karty najednou', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}], { hn: true, ff: true });
    g.activeEvent = hnData.find(c => c.key === 'KAZATEL');
    g.activeFistful = ffData.find(c => c.key === 'LECKA');
    g.activeWws = wwsData.find(c => c.key === 'ROUBIK');
    ['KAZATEL', 'LECKA', 'ROUBIK'].forEach(k => assert.equal(g.hasEvent(k), true, k));
    assert.equal(g.hasEvent('SACAGAWAY'), false);
    const plain = JSON.parse(JSON.stringify(g));
    ['KAZATEL', 'LECKA', 'ROUBIK'].forEach(k => assert.equal(eventActive(plain, k), true, k));
    assert.equal(eventActive(plain, 'SACAGAWAY'), false);
});

test('všechna tři rozšíření jdou zapnout naráz a balíčky se nepletou', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}, {}], { hn: true, ff: true });
    assert.equal(g.eventDeck.length, 15);   // 13 HN + obě přibalené (zapíná Fistful)
    assert.equal(g.ffDeck.length, 15);
    assert.equal(g.wwsDeck.length, 10);
    g._sheriffTurns = 1;
    if (!g._beginTurn()) g.handleStartOfTurnChecks();
    g.phase = 'PLAY';
    g.playCard(give(g, 0, CardType.STAGECOACH));
    finishDraw(g);
    assert.equal(g.eventDeck.length, 14);
    assert.equal(g.ffDeck.length, 14);
    assert.equal(g.wwsDeck.length, 9);
});

test('setup nové hry balíček uklidí (žádná platná karta z minulé hry)', () => {
    const g = mkWwsGame([{ role: 'Sheriff' }, {}]);
    g.playCard(give(g, 0, CardType.STAGECOACH));
    finishDraw(g);
    assert.ok(g.activeWws);
    g._setupWwsDeck({ expansions: { divoky_zapad: true } });
    assert.equal(g.activeWws, null);
    assert.equal(g.wwsPile.length, 0);
    assert.equal(g.wwsDeck.length, 10);
});
