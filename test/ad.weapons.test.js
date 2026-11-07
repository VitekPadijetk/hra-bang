// Rozšíření Ozbrojení a nebezpeční – fáze A2 (zbraně a výstřely): zvláštní efekty
// Nebezpečných zbraní (Big Fifty, Buntline Special, Dvouhlavňovka, Thunderer), Bedna,
// Skrč se!, Křesadlovka, Rychlopalba, Bloody Mary, Mexicali Kid a bot.
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §2.10, §4 (A2), §5 a §6.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GameState, CardType, Suits, Card } = require('../logic.js');
const { hasAbility } = require('../core/distance.js');
const { playsAsMissed } = require('../core/playability.js');
const { decideBotAction } = require('../core/botPolicy.js');
const A = require('../core/armed.js');
const { mkGame, mkCard, give, board, topDeck } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const AD_ON = { expansions: { ozbrojeni: true } };

let _seq = 93000;
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
function armed(g, idx, name, n = 3) {
    const c = adCard(name);
    if (c.type === CardType.WEAPON) g.players[idx].weapon = c; else g.players[idx].board.push(c);
    g._adAdd(c, n, { fresh: true });
    return c;
}
function mkAd(specs, opts) {
    const g = mkGame(specs, opts);
    g.options = AD_ON;
    g.turnId = 7;
    for (let i = 0; i < 20; i++) g.deck.cards.unshift(mkCard(CardType.MISSED, { suit: Suits.SPADES }));
    return g;
}
const bang = (g, idx, suit = Suits.CLUBS) => give(g, idx, CardType.BANG, { name: 'Bang!', suit });
const missed = (g, idx) => give(g, idx, CardType.MISSED, { name: 'Vedle!' });
const char = (n) => ({ seat: 0, cardId: null, n });
const payChar = (seat, n) => Array.from({ length: n }, () => ({ seat, cardId: null }));

// ── Zbraně (§4) ──────────────────────────────────────────────────────────────

test('Thunderer: zaplacený BANG! se hned vrátí do ruky, do limitu se počítá', () => {
    const g = mkAd([{}, {}]);
    const w = armed(g, 0, 'Thunderer');
    const bi = bang(g, 0);
    const card = g.players[0].hand[bi];
    assert.equal(A.adWeaponSpecialOk(g, 0, card), true);
    g.playBang(0, 1, bi, null, { adWeapon: true });
    assert.ok(g.players[0].hand.some(c => c.id === card.id), 'karta je zpátky v ruce');
    assert.equal(w.adLoads, 2);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
    assert.equal(g.phase, 'RESPOND');
    assert.deepEqual(g._adThunderDone, { playerIdx: 0, cardId: card.id });
});

test('efekt zbraně jen ke kartě BANG!, ve svém tahu a bez Lasa; bez rozšíření nikdy', () => {
    const g = mkAd([{}, {}]);
    armed(g, 0, 'Thunderer');
    const fl = g.players[0].hand[giveAd(g, 0, 'Křesadlovka')];
    const b = g.players[0].hand[bang(g, 0)];
    assert.equal(A.adWeaponSpecialOk(g, 0, fl), false, 'bang-efekt kartou BANG! není');
    assert.equal(A.adWeaponSpecialOk(g, 1, b), false, 'mimo tah ne');
    g.options = {};
    assert.equal(A.adWeaponSpecialOk(g, 0, b), false);
    // Neplatná volba odmítne celé zahrání a nic nezaplatí.
    g.options = AD_ON;
    g.players[0].weapon = { id: -1, name: 'Colt .45', type: CardType.WEAPON, props: { range: 1 } };
    const n = g.players[0].hand.length;
    g.playBang(0, 1, g.players[0].hand.indexOf(b), null, { adWeapon: true });
    assert.equal(g.players[0].hand.length, n);
    assert.equal(g.phase, 'PLAY');
});

test('Dvouhlavňovka: jen kárový BANG!; zaplacený se nedá zrušit Barelem ani Vedle! ani Bednou', () => {
    const g = mkAd([{}, {}]);
    const w = armed(g, 0, 'Dvouhlavňovka');
    const clubs = g.players[0].hand[bang(g, 0, Suits.CLUBS)];
    assert.equal(A.adWeaponSpecialOk(g, 0, clubs), false);
    const di = bang(g, 0, Suits.DIAMONDS);
    assert.equal(A.adWeaponSpecialOk(g, 0, g.players[0].hand[di]), true);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    armed(g, 1, 'Bedna');
    const mi = missed(g, 1);
    g.playBang(0, 1, di, null, { adWeapon: true });
    assert.equal(w.adLoads, 2);
    assert.equal(g.phase, 'RESPOND', 'na Barel se nesnímá');
    assert.equal(A.adCrateOk(g, 1), false);
    g.handleResponse(1, mi);
    assert.equal(g.phase, 'RESPOND', 'Vedle! neprojde');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Buntline Special: zrušený BANG! → cíl odhodí kartu dle svého výběru (fáze Brokovnice)', () => {
    const g = mkAd([{}, {}]);
    armed(g, 0, 'Buntline Special');
    const bi = bang(g, 0);
    const mi = missed(g, 1);
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    g.playBang(0, 1, bi, null, { adWeapon: true });
    g.handleResponse(1, mi);
    assert.equal(g.phase, 'SHOTGUN_DISCARD');
    assert.equal(g.pendingShotgun.label, 'Buntline Special');
    const beer = g.players[1].hand[0];
    assert.ok(g.vosPick(1, [beer.id]));
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.phase, 'PLAY');
});

test('Buntline Special: i úspěšný Barel je zrušení; zásah ne', () => {
    const g = mkAd([{}, {}]);
    armed(g, 0, 'Buntline Special', 4);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    g.playBang(0, 1, bang(g, 0), null, { adWeapon: true });
    assert.equal(g.phase, 'BARREL_DRAW');
    topDeck(g, Suits.HEARTS);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'SHOTGUN_DISCARD');
    // Zásah: nic se neodhazuje.
    const h = mkAd([{}, {}]);
    armed(h, 0, 'Buntline Special');
    give(h, 1, CardType.BEER, { name: 'Pivo' });
    h.playBang(0, 1, bang(h, 0), null, { adWeapon: true });
    h.handleResponse(1, null);
    assert.equal(h.phase, 'PLAY');
    assert.equal(h.players[1].hand.length, 1);
});

test('Big Fifty: cíl bez schopnosti a karet – Jourdonnais ani Barel nesnímají, Apache Kid schytá kára', () => {
    const g = mkAd([{}, { character: 'Jourdonnais' }]);
    armed(g, 0, 'Big Fifty');
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.playBang(0, 1, bang(g, 0), null, { adWeapon: true });
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[1]._adMuted, true);
    assert.equal(hasAbility(g.players[1], 'Jourdonnais'), false);
    assert.match(require('../core/pending.js').waitingStatus(g).text, /Big Fifty/);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[1]._adMuted, undefined, 'po výstřelu je schopnost zpátky');
    assert.equal(hasAbility(g.players[1], 'Jourdonnais'), true);

    const h = mkAd([{}, { character: 'Apache Kid' }]);
    armed(h, 0, 'Big Fifty');
    h.playBang(0, 1, bang(h, 0, Suits.DIAMONDS), null, { adWeapon: true });
    assert.equal(h.phase, 'RESPOND', 'kárový BANG! Apache Kida zasáhne');
    h.handleResponse(1, null);
    assert.equal(h.players[1].health, 3);
});

test('Big Fifty: bez zaplacení se nic nemění; příznak nepřežije konec tahu', () => {
    const g = mkAd([{}, { character: 'Jourdonnais' }]);
    armed(g, 0, 'Big Fifty');
    g.playBang(0, 1, bang(g, 0));
    assert.equal(g.phase, 'BARREL_DRAW');
    assert.equal(g.players[1]._adMuted, undefined);
    g.players[1]._adMuted = true;
    g._adShotEnd();
    assert.equal(g.players[1]._adMuted, undefined);
});

// ── Bedna (§4) ───────────────────────────────────────────────────────────────

test('Bedna: v obraně za 2 žetony jako Vedle!; na 1 žetonu už ne', () => {
    const g = mkAd([{}, {}]);
    const crate = armed(g, 1, 'Bedna', 3);
    g.playBang(0, 1, bang(g, 0));
    assert.equal(A.adCrateOk(g, 1), true);
    assert.equal(A.adCrateOk(g, 0), false, 'jen obránce');
    assert.equal(g.adCrate(1), true);
    assert.equal(crate.adLoads, 1);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
    g.players[0].bangsPlayedThisTurn = 0;
    g.playBang(0, 1, bang(g, 0));
    assert.equal(A.adCrateOk(g, 1), false);
});

test('Bedna: už ve fázi BARREL_DRAW (místo snímání); proti Slabovi tam ne', () => {
    const g = mkAd([{}, {}]);
    armed(g, 1, 'Bedna', 2);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.playBang(0, 1, bang(g, 0));
    assert.equal(g.phase, 'BARREL_DRAW');
    assert.equal(g.adCrate(1), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingBarrelCheck, null);
    assert.equal(g.players[1].board.some(c => c.name === 'Bedna'), false, 'vyčerpaná Bedna odešla');

    const h = mkAd([{ character: 'Slab the Killer' }, {}]);
    armed(h, 1, 'Bedna', 3);
    board(h, 1, CardType.BARREL, { name: 'Barel' });
    h.playBang(0, 1, bang(h, 0));
    assert.equal(A.adCrateOk(h, 1), false, 'proti Slabovi nejdřív Barel');
    topDeck(h, Suits.SPADES);
    h.triggerBarrelDraw(); h.resolveCheck();
    assert.equal(h.phase, 'RESPOND');
    assert.equal(h.adCrate(1), true);
    assert.equal(h.phase, 'RESPOND', 'proti Slabovi zbývá druhé Vedle!');
    h.handleResponse(1, missed(h, 1));
    assert.equal(h.phase, 'PLAY');
    assert.equal(h.players[1].health, 4);
});

test('Bedna: Big Fifty a Belle Star ji vypínají', () => {
    const g = mkAd([{ character: 'Belle Star' }, {}]);
    armed(g, 1, 'Bedna', 3);
    g.playBang(0, 1, bang(g, 0));
    assert.equal(A.adCrateOk(g, 1), false);
    const h = mkAd([{}, {}]);
    armed(h, 1, 'Bedna', 3);
    armed(h, 0, 'Big Fifty');
    h.playBang(0, 1, bang(h, 0), null, { adWeapon: true });
    assert.equal(A.adCrateOk(h, 1), false);
});

// ── Skrč se! (§4) ────────────────────────────────────────────────────────────

test('Skrč se!: účinkuje jako Vedle! (i Big Spencer), s vylepšením se vrátí do ruky', () => {
    const g = mkAd([{}, {}]);
    const duck = g.players[1].hand[giveAd(g, 1, 'Skrč se!')];
    assert.equal(playsAsMissed(g, g.players[1], duck), true);
    assert.equal(playsAsMissed(g, { character: 'Big Spencer' }, duck), true);
    g._adAdd(g.players[1], 2);
    g.playBang(0, 1, bang(g, 0));
    g.handleResponse(1, 0, null, { up: 1, pay: payChar(1, 2) });
    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[1].adLoads || 0, 0);
    assert.ok(g.players[1].hand.some(c => c.id === duck.id), 'karta je zpátky v ruce');
    assert.deepEqual(g._adAnim, [{ type: 'discard_to_hand', toPlayerIdx: 1, cardId: duck.id }]);
});

test('Skrč se!: neplatná platba = karta se nezahraje; bez vylepšení zůstane v odhozu', () => {
    const g = mkAd([{}, {}]);
    giveAd(g, 1, 'Skrč se!');
    g._adAdd(g.players[1], 1);
    g.playBang(0, 1, bang(g, 0));
    g.handleResponse(1, 0, null, { up: 1, pay: payChar(1, 1) });
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[1].hand.length, 1);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand.length, 0);
});

// ── Křesadlovka a Rychlopalba (§4) ───────────────────────────────────────────

test('Křesadlovka: bang-efekt na dostřel zbraně mimo limit; vylepšená se po zrušení vrátí', () => {
    const g = mkAd([{}, {}]);
    g.players[0].bangsPlayedThisTurn = 1;
    const fi = giveAd(g, 0, 'Křesadlovka');
    const fl = g.players[0].hand[fi];
    g._adAdd(g.players[0], 2);
    const mi = missed(g, 1);
    g.playBang(0, 1, fi, null, { up: 1, pay: payChar(0, 2) });
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.bangEffect, true);
    g.handleResponse(1, mi);
    assert.ok(g.players[0].hand.some(c => c.id === fl.id), 'zrušená → zpátky do ruky');
    // Zásah: žetony propadly, karta zůstává v odhozu.
    const h = mkAd([{}, {}]);
    const hi = giveAd(h, 0, 'Křesadlovka');
    h._adAdd(h.players[0], 2);
    h.playBang(0, 1, hi, null, { up: 1, pay: payChar(0, 2) });
    h.handleResponse(1, null);
    assert.equal(h.players[0].hand.length, 0);
    assert.equal(h.players[1].health, 3);
});

test('Rychlopalba: další cíl za každé vylepšení, každý se brání sám; stejný cíl dvakrát ne', () => {
    const g = mkAd([{}, {}, {}]);
    g.players[0].weapon = { id: -1, name: 'Colt .45', type: CardType.WEAPON, props: { range: 1 } };
    g._adAdd(g.players[0], 2);
    const qi = giveAd(g, 0, 'Rychlopalba');
    assert.equal(A.adUpgradeMax(g, 0, g.players[0].hand[qi]), 1);
    g.playBang(0, 1, qi, null, { up: 1, pay: payChar(0, 1), extra: [1] });
    assert.equal(g.phase, 'PLAY', 'stejný cíl dvakrát = odmítnuto');
    assert.equal(g.players[0].adLoads, 2);
    g.playBang(0, 1, qi, null, { up: 1, pay: payChar(0, 1), extra: [2] });
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);
    assert.equal(g.pendingResponse.vos.noEscape, true);
    assert.equal(g.players[0].adLoads, 1);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'RESPOND', 'druhý výstřel z fronty');
    assert.equal(g.pendingResponse.targetIdx, 2);
    g.handleResponse(2, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.phase, 'PLAY');
});

// ── Postavy (§5) ─────────────────────────────────────────────────────────────

test('Bloody Mary: zrušená karta BANG! → líznutí; zrušená Křesadlovka ne', () => {
    const g = mkAd([{ character: 'Bloody Mary' }, {}]);
    g.playBang(0, 1, bang(g, 0));
    g.handleResponse(1, missed(g, 1));
    assert.equal(g.drawPhaseState?.playerIdx, 0, 'lízání pro Bloody Mary');
    const h = mkAd([{ character: 'Bloody Mary' }, {}]);
    h.playBang(0, 1, giveAd(h, 0, 'Křesadlovka'));
    h.handleResponse(1, missed(h, 1));
    assert.equal(h.phase, 'PLAY');
    assert.ok(!h.drawPhaseState?.active);
});

test('Mexicali Kid: za 2 žetony výstřel na dostřel, mimo limit, jednou za tah', () => {
    const g = mkAd([{ character: 'Mexicali Kid' }, {}]);
    assert.equal(A.adMexicaliOk(g, 0), false, 'bez žetonů ne');
    const bell = armed(g, 0, 'Zvonice', 1);
    g._adAdd(g.players[0], 1);
    assert.equal(A.adMexicaliOk(g, 0), true);
    assert.equal(g.adMexicali(0, 1, payChar(0, 2)), false, 'na postavě je jen 1');
    assert.equal(g.adMexicali(0, 1, [{ seat: 0, cardId: null }, { seat: 0, cardId: bell.id }]), true);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.bangEffect, true);
    assert.equal(g.players[0].bangsPlayedThisTurn || 0, 0);
    assert.equal(g.players[0].board.length, 0, 'vyčerpaná Zvonice odešla');
    g.handleResponse(1, null);
    g._adAdd(g.players[0], 2);
    assert.equal(A.adMexicaliOk(g, 0), false, 'podruhé v tahu ne');
});

test('AD_READY: Bloody Mary a Mexicali Kid jdou do výběru postav', () => {
    const { AD_READY } = require('../logic/entities.js');
    assert.deepEqual([...AD_READY].sort(), ['Bloody Mary', 'Mexicali Kid']);
});

// ── Bot (§6) ─────────────────────────────────────────────────────────────────

test('bot: v obraně použije Bednu, k BANG! zaplatí Thunderer, Mexicali vystřelí', () => {
    const g = mkAd([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    armed(g, 1, 'Bedna', 3);
    g.playBang(0, 1, bang(g, 0));
    assert.deepEqual(decideBotAction(g, 1), { event: 'ad_crate', payload: {} });

    const h = mkAd([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
    armed(h, 0, 'Thunderer');
    bang(h, 0);
    const a = decideBotAction(h, 0);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.adWeapon, true);

    const m = mkAd([{ role: 'Outlaw', character: 'Mexicali Kid' }, { role: 'Sheriff' }]);
    m._adAdd(m.players[0], 2);
    const b = decideBotAction(m, 0);
    assert.equal(b.event, 'ad_mexicali');
    assert.equal(m.adMexicali(0, b.payload.targetIdx, b.payload.pay), true);
});
