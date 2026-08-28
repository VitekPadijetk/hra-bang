// Rozšíření Divoký západ – karty událostí (fáze 2+).
//
// Zúčtování: „Každá karta může být hrána jako by to byla karta BANG!. Každá karta BANG!
// může být hrána jako by to byla karta Vedle!." Obě věty jsou POVOLUJÍCÍ (R1) – karta si
// svoji vlastní akci ponechává a jen k ní přibývá druhá možnost.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, CardType, Suits } = require('./_helpers.js');
const { cardPlayability, nativePlayInTurn, showdownBangOk, playsAsBang, playsAsMissed,
        preacherBlocks, sniperOffer, rouletteDiscardable } = require('../core/playability.js');
const { getActionForCard } = require('../core/cardRules.js');
const { decideCardClick } = require('../core/selection.js');
const { decideBotAction } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const ffData = rd('cards.fistful.json');
const hnData = rd('cards.high_noon.json');
const wws = key => wwsData.find(c => c.key === key);
const ff = key => ffData.find(c => c.key === key);
const hn = key => hnData.find(c => c.key === key);

// Hra s právě platnou kartou Divokého západu (přípravu balíčku řeší wildWest.test.js).
function mkEv(specs, key, opts = {}) {
    const g = mkGame(specs, opts);
    if (key) g.activeWws = wws(key);
    return g;
}

const bang = (g, i, o = {}) => give(g, i, CardType.BANG, { name: 'Bang!', ...o });
const miss = (g, i, o = {}) => give(g, i, CardType.MISSED, { name: 'Vedle!', ...o });
const beer = (g, i, o = {}) => give(g, i, CardType.BEER, { name: 'Pivo', ...o });

// ── Zúčtování: každá karta jako Bang! ───────────────────────────────────────

test('Zúčtování: modrá karta z ruky vystřelí jako Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = give(g, 0, CardType.BARREL, { name: 'Barel' });
    assert.equal(playsAsBang(g, g.players[0], g.players[0].hand[i]), true);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[0].hand.length, 0, 'karta odešla do odhozu');
    assert.equal(g.players[0].bangsPlayedThisTurn, 1, 'limit se čerpá normálně');
    g.handleResponse(1, null);                       // nemá čím uhnout
    assert.equal(g.players[1].health, 3);
});

test('Zúčtování: Vedle! jde ve vlastním tahu zahrát jako Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = miss(g, 0);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[i]), true);
    // Vlastní akci Vedle! ve svém tahu nemá → míří se rovnou, bez přepínače.
    assert.equal(nativePlayInTurn(g, g.players[0], 0, g.players[0].hand[i]), false);
    const intent = decideCardClick({
        state: g, me: g.players[0], myIndex: 0, selectedState: { cardIndex: null },
        card: g.players[0].hand[i], index: i, blockInput: false, isMySidActive: false, playable: true,
    });
    assert.deepEqual(intent, { type: 'SELECT', index: i, action: 'SHOOT' });
    g.playBang(0, 1, i);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Zúčtování: karta si svoji vlastní akci ponechává (Pivo se pořád smí vypít)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}, {}], 'ZUCTOVANI');
    const i = beer(g, 0);
    const card = g.players[0].hand[i];
    assert.equal(nativePlayInTurn(g, g.players[0], 0, card), true, 'Pivo léčí dál');
    assert.equal(showdownBangOk(g, g.players[0], 0, card), true, 'a zároveň smí vystřelit');
    // Klik proto vybere VLASTNÍ akci karty – na Bang! se přepíná tlačítkem (view/board.js).
    const intent = decideCardClick({
        state: g, me: g.players[0], myIndex: 0, selectedState: { cardIndex: null },
        card, index: i, blockInput: false, isMySidActive: false, playable: true,
    });
    assert.equal(intent.action, getActionForCard(card, null));
    g.playCard(i);
    assert.equal(g.players[0].health, 3);
});

test('Zúčtování: limit 1× Bang!/tah platí dál (pumpa z toho není)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    bang(g, 0); beer(g, 0);
    g.playBang(0, 1, 0);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
    // Druhá karta už jako Bang! nesmí (a showdownBangOk to říká klientovi i botovi).
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[0]), false);
    g.playBang(0, 1, 0);
    assert.equal(g.players[1].health, 3, 'druhý výstřel je no-op');
    assert.equal(g.players[0].hand.length, 1, 'karta zůstala v ruce');
});

test('bez Zúčtování se cizí kartou vystřelit nedá', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    const i = beer(g, 0);
    assert.equal(playsAsBang(g, g.players[0], g.players[0].hand[i]), false);
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[i]), false);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[0].hand.length, 1);
});

// ── Zúčtování: každá karta Bang! jako Vedle! ────────────────────────────────

test('Zúčtování: Bang! ubrání útok jako Vedle!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = bang(g, 0);
    bang(g, 1);
    assert.equal(playsAsMissed(g, g.players[1], g.players[1].hand[0]), true);
    g.playBang(0, 1, i);
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[0]), true);
    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4, 'Bang! posloužil jako Vedle!');
    assert.equal(g.players[1].hand.length, 0);
});

test('Zúčtování jako Vedle! platí jen na kartu Bang!, ne na cokoli', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = bang(g, 0);
    beer(g, 1);
    assert.equal(playsAsMissed(g, g.players[1], g.players[1].hand[0]), false);
    g.playBang(0, 1, i);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'RESPOND', 'Pivo obranou není – klik se ignoruje');
    assert.equal(g.players[1].hand.length, 1, 'karta zůstala v ruce');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Zúčtování: Bang! se počítá za kartu Vedle! i v Ruské ruletě', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeFistful = ff('RUSKA_RULETA');
    const card = mkCard(CardType.BANG, { name: 'Bang!' });
    assert.equal(rouletteDiscardable(g, g.players[0], card, false), true);
    g.activeWws = null;
    assert.equal(rouletteDiscardable(g, g.players[0], card, false), false);
});

// ── Souhra s ostatními balíčky ──────────────────────────────────────────────

test('Zúčtování × Odstřelovač: zaplatit jde dvěma libovolnými kartami', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeFistful = ff('ODSTRELOVAC');
    beer(g, 0); give(g, 0, CardType.BARREL, { name: 'Barel' });
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), true);
    g.startSniper(0, 1);
    assert.equal(g.phase, 'DISCARD_ANOTHER');
    g.discardAnotherCard(0, 1);                     // zaplatí druhou kartou z ruky
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 2, 'ubránit se lze jen dvěma Vedle!');
    // bez Zúčtování by ani jedna z karet nebyla „karta Bang!"
    const h = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    h.activeFistful = ff('ODSTRELOVAC');
    beer(h, 0); give(h, 0, CardType.BARREL, { name: 'Barel' });
    assert.equal(sniperOffer(h, h.players[0], 0, h.players[0].hand[0]), false);
});

test('Zúčtování × Želízka: barva karty omezuje pořád', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('ZELIZKA');
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    const bad = give(g, 0, CardType.BEER, { name: 'Pivo', suit: Suits.SPADES });
    const ok = give(g, 0, CardType.BEER, { name: 'Pivo', suit: Suits.HEARTS });
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[bad]), false);
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[ok]), true);
    g.playBang(0, 1, bad);
    assert.equal(g.phase, 'PLAY', 'piková karta neprošla');
    g.playBang(0, 1, ok);
    assert.equal(g.phase, 'RESPOND');
});

test('Zúčtování × Kazatel: zákaz míří na KARTU Bang!, ne na roli', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('KAZATEL');
    const b = bang(g, 0);
    const p = beer(g, 0);
    assert.equal(preacherBlocks(g, g.players[0], 0, g.players[0].hand[b]), true);
    assert.equal(preacherBlocks(g, g.players[0], 0, g.players[0].hand[p]), false);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[b]), false);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'PLAY', 'karta Bang! neprošla');
    g.playBang(0, 1, p);
    assert.equal(g.phase, 'RESPOND', 'Pivo jako Bang! projde');
});

test('Kazatel bez Zúčtování drží Calamity Janet i její Vedle! (FAQ H5)', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Calamity Janet' }, {}, {}], null);
    g.activeEvent = hn('KAZATEL');
    const m = miss(g, 0);
    assert.equal(preacherBlocks(g, g.players[0], 0, g.players[0].hand[m]), true);
    g.playBang(0, 1, m);
    assert.equal(g.phase, 'PLAY');
});

// ── Calamity Janet po stažení do predikátů (regrese) ────────────────────────

test('Calamity Janet: Vedle! střílí a Bang! brání i bez Zúčtování', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Calamity Janet' },
                    { character: 'Calamity Janet' }, {}], null);
    const m = miss(g, 0);
    bang(g, 1);
    assert.equal(playsAsBang(g, g.players[0], g.players[0].hand[m]), true);
    g.playBang(0, 1, m);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4);
});

// ── Zrcadla pro bota ─────────────────────────────────────────────────────────

// Nikdo není zraněný → Salon ani Pivo nemají co dělat; pod Zúčtováním z nich ale zbývá
// výstřel. Bot sáhne po tom postradatelnějším (keepScore: Salon 3, Pivo 7).
test('bot: bez karty Bang! vystřelí pod Zúčtováním postradatelnou kartou', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    give(g, 0, CardType.SALOON, { name: 'Salon' });
    beer(g, 0);
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'play_bang');
    assert.equal(act.payload.cardIdx, 0, 'vystřelí Salonem, ne Pivem');
});

test('bot: vlastní akce karty má přednost před výstřelem', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}, {}], 'ZUCTOVANI');
    give(g, 0, CardType.SALOON, { name: 'Salon' });
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'play_card', 'zraněný Salon vypije');
});

test('bot: bez Zúčtování cizí kartou nestřílí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    give(g, 0, CardType.SALOON, { name: 'Salon' });
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.notEqual(act.event, 'play_bang');
});

test('bot: pod Zúčtováním se ubrání kartou Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = bang(g, 0);
    bang(g, 1);
    g.playBang(0, 1, i);
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 1,
        { 0: { Sheriff: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'respond_to_card');
    assert.equal(act.payload.cardIndex, 0);
});
