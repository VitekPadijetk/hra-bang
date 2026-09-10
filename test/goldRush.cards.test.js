// Rozšíření Zlatá horečka (Gold Rush) – fáze 2: pasivní vybavení s černým rámem.
//
// Šest karet, které jen leží před hráčem a mění pravidla:
//   BOTY      – „Pokaždé, když ztratíš 1 život, lízni si 1 kartu z balíčku."
//   TALISMAN  – „Pokaždé, když ztratíš 1 život, vezmi si 1 valoun."
//   OPASEK    – „Na konci tahu smíš mít v ruce až 8 karet."
//   KRUMPÁČ   – „Ve fázi 1 svého tahu si lízni o kartu navíc."
//   KALUMET   – „Karty káry zahrané ostatními na tebe nemají efekt."
//   PODKOVA   – „Pokaždé, když otáčíš!, odkryj o kartu navíc a vyber výsledek."
//
// Podklad: docs/zlata-horecka.md (Karty vybavení + Dodatky ke kartám), plán §2.3/§4
// a rozhodnutí R5 (trychtýř ztráty života), R8 (Podkova × Lucky Duke se SČÍTAJÍ)
// a R10 (Laso a Belle Star vypínají i vybavení).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { gearOnFor } = require('../core/goldRush.js');
const { waitingStatus } = require('../core/pending.js');

before(() => { console.log = () => {}; });

const gearData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8')
);
const ffData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8')
);
const hnData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8')
);
const ZH_ON = { expansions: { zlata_horecka: true } };

function mkZH(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    return g;
}

// Polož hráči vybavení rovnou před něj (nákup řeší goldRush.shop.test.js).
let _gid = 61000;
function gear(g, idx, effect) {
    const kind = gearData.find(k => k.effect === effect);
    const card = { id: _gid++, effect, name: kind.name, art: kind.art,
                   border: kind.border, cost: kind.cost, text: kind.text };
    g.players[idx].gear.push(card);
    return card;
}

// ── BOTY ─────────────────────────────────────────────────────────────────────

test('Boty: za ztracený život se líznutí odloží do fronty a klikne ve vlastní fázi', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_BOTY');
    topDeck(g, Suits.HEARTS, '9');

    g.handleDamage(0, 1);
    assert.deepEqual(g.specialActionQueue.map(a => a.type), ['GEAR_BOOTS_DRAW']);

    g._processSpecialQueue();
    assert.equal(g.phase, 'BOOTS_DRAW');
    assert.equal(g.pendingBootsDraw.playerIdx, 0);
    assert.deepEqual(waitingStatus(g), { idx: 0, kind: 'BOOTS_DRAW', text: 'Boty – líže za zranění' });

    g.bootsDraw(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingBootsDraw, null);
});

test('Boty: při ztrátě POSLEDNÍHO života se neuplatní (dodatek k pravidlům)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }], { current: 1 });
    gear(g, 0, 'ZH_BOTY');
    g.players[0].health = 1;

    g.handleDamage(0, 1);
    assert.equal(g.players[0].health, 0);
    assert.equal(g.specialActionQueue.some(a => a.type === 'GEAR_BOOTS_DRAW'), false);
});

test('Boty: platí i na klikaný zásah dynamitu (jde mimo handleDamage)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'DYNAMITE_DAMAGE' });
    gear(g, 0, 'ZH_BOTY');
    g.pendingDynamiteDamage = { playerIdx: 0, hitsLeft: 3, resume: 'CHECKS' };
    topDeck(g, Suits.HEARTS, '9');

    g.takeDynamiteHit(0);
    assert.equal(g.phase, 'BOOTS_DRAW');
    g.bootsDraw(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE', 'po líznutí se vrací zpátky ke klikání zásahů');
});

test('Boty + Bart Cassidy: dvě líznutí za jeden zásah (schopnost i vybavení)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Bart Cassidy' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_BOTY');
    topDeck(g, Suits.HEARTS, '9');
    topDeck(g, Suits.CLUBS, '8');

    g.handleDamage(0, 1);
    assert.deepEqual(g.specialActionQueue.map(a => a.type), ['GEAR_BOOTS_DRAW', 'BART_DRAW']);
    g._processSpecialQueue();
    g.bootsDraw(0);
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(0);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY');
});

test('Boty: líznutí čekající za mrtvého se z fronty vyhodí (jinak by na fázi nikdo neklikl)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }], { current: 1 });
    gear(g, 0, 'ZH_BOTY');
    g.handleDamage(0, 1);
    assert.equal(g.specialActionQueue.length, 1);

    g.players[0].health = 0;               // mezitím ze hry odešel (Teren Kill, dobraný zásah…)
    g._pruneSuzyQueue();
    assert.deepEqual(g.specialActionQueue, []);
});

// ── TALISMAN ─────────────────────────────────────────────────────────────────

test('Talisman: valoun za každý ztracený život, a vždy ze společné zásoby', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_TALISMAN');

    g.handleDamage(0, 1);
    assert.equal(g.players[0].nuggets, 1, 'oběť si vzala valoun');
    assert.equal(g.players[1].nuggets, 1, 'útočník o svůj valoun nepřišel (bere se ze zásoby)');

    g.handleDamage(0, 1);
    assert.equal(g.players[0].nuggets, 2);
});

test('Talisman: při ztrátě POSLEDNÍHO života se neuplatní', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }], { current: 1 });
    gear(g, 0, 'ZH_TALISMAN');
    g.players[0].health = 1;

    g.handleDamage(0, 1);
    assert.equal(g.players[0].nuggets, 0);
    assert.equal(g.players[1].nuggets, 1, 'útočníkovi valoun za zranění patří i tak');
});

test('Talisman: platí i na ztrátu bez útočníka (dynamit) a na dobrovolnou (Chuck Wengam)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'DYNAMITE_DAMAGE' });
    gear(g, 0, 'ZH_TALISMAN');
    g.pendingDynamiteDamage = { playerIdx: 0, hitsLeft: 3, resume: 'CHECKS' };
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].nuggets, 1);

    const h = mkZH([{ role: 'Sheriff', character: 'Chuck Wengam' }, { role: 'Outlaw' }]);
    gear(h, 0, 'ZH_TALISMAN');
    h.useChuckWengam(0);
    assert.equal(h.players[0].nuggets, 1);
});

// ── OPASEK ───────────────────────────────────────────────────────────────────

test('Opasek: limit karet v ruce na konci tahu je 8', () => {
    const g = mkZH([{ role: 'Sheriff', maxHealth: 4 }, { role: 'Outlaw' }]);
    assert.equal(g._handLimit(g.players[0]), 4);
    gear(g, 0, 'ZH_OPASEK');
    assert.equal(g._handLimit(g.players[0]), 8);
});

test('Opasek: bere se to VYŠŠÍ z obojího (Big Spencer 9 životů, Sean Mallory 10)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Big Spencer', maxHealth: 9 }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_OPASEK');
    assert.equal(g._handLimit(g.players[0]), 9, 'Opaskem si nesmí pohoršit');

    const h = mkZH([{ role: 'Sheriff', character: 'Sean Mallory' }, { role: 'Outlaw' }]);
    gear(h, 0, 'ZH_OPASEK');
    assert.equal(h._handLimit(h.players[0]), 10);
});

test('Opasek: s osmi kartami se tah rovnou ukončí, s devíti se odhazuje', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_OPASEK');
    for (let i = 0; i < 8; i++) give(g, 0, CardType.BEER);
    g.tryEndTurn();
    assert.notEqual(g.phase, 'DISCARD');

    const h = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(h, 0, 'ZH_OPASEK');
    for (let i = 0; i < 9; i++) give(h, 0, CardType.BEER);
    h.tryEndTurn();
    assert.equal(h.phase, 'DISCARD');
});

// ── KRUMPÁČ ──────────────────────────────────────────────────────────────────

test('Krumpáč: ve fázi 1 se líže o kartu navíc', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    assert.equal(g._drawCountFor(g.players[0]), 2);
    gear(g, 0, 'ZH_KRUMPAC');
    assert.equal(g._drawCountFor(g.players[0]), 3);

    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
});

test('Krumpáč se sčítá s událostmi i s postavami, které fázi 1 mění', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_KRUMPAC');
    g.activeEvent = hnData.find(c => c.key === 'ZIZEN');
    assert.equal(g._drawCountFor(g.players[0]), 2, 'Žízeň −1, Krumpáč +1');

    const h = mkZH([{ role: 'Sheriff', character: 'Pixie Pete' }, { role: 'Outlaw' }]);
    gear(h, 0, 'ZH_KRUMPAC');
    assert.equal(h._drawCountFor(h.players[0]), 4, 'Pixie Pete 3 + Krumpáč 1');
});

test('Krumpáč × Kit Carlson: odkryje se pořád 5 karet? Ne – 3, a navíc si dolízne', () => {
    // Kit odkrývá VŽDY 3 karty a nechává si nejvýš 2; kartu navíc si po výběru lízne
    // klasicky z balíčku (`kitExtra`). Krumpáč se proto chová jako Příjezd vlaku,
    // ne jako Žízeň – nepřepisuje počet odkrytých.
    const g = mkZH([{ role: 'Sheriff', character: 'Kit Carlson' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_KRUMPAC');
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.kitNeeded, 2);
    assert.equal(g.drawPhaseState.kitExtra, 1);
});

test('Krumpáč × Black Jack: bonus za červenou se počítá k už zvýšenému základu', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Black Jack' }, { role: 'Outlaw' }]);
    assert.equal(g._drawCountFor(g.players[0]), 2);
    gear(g, 0, 'ZH_KRUMPAC');
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 3, 'Black Jack 2+1, Krumpáč +1 → základ 3');
});

test('Krumpáč: fáze lízání MIMO začátek tahu se ho netýká (Dostavník)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_KRUMPAC');
    const idx = give(g, 0, CardType.STAGECOACH, { name: 'Dostavník' });
    g.playCard(0, idx);
    assert.equal(g.drawPhaseState.cardsNeeded, 2, 'Dostavník dává 2 karty, Krumpáč do něj nemluví');
});

// ── KALUMET ──────────────────────────────────────────────────────────────────

test('Kalumet: kárový Bang! od jiného hráče na majitele nemá efekt', () => {
    const g = mkZH([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    gear(g, 1, 'ZH_KALUMET');
    const idx = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    g.playBang(0, 1, idx);
    assert.equal(g.phase, 'PLAY', 'Bang! se odhodil naprázdno');
    assert.equal(g.players[1].health, 4);
});

test('Kalumet: nekárový Bang! ho zasáhne normálně', () => {
    const g = mkZH([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    gear(g, 1, 'ZH_KALUMET');
    const idx = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    g.playBang(0, 1, idx);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Kalumet: vlastní kárová karta na sebe efekt MÁ (chrání jen před ostatními)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }], { current: 0 });
    gear(g, 0, 'ZH_KALUMET');
    assert.equal(g._apacheImmune(0, Suits.DIAMONDS, 1), true);
    assert.equal(g._apacheImmune(0, Suits.DIAMONDS, 0), false);
});

test('Kalumet: v DUELU neúčinkuje – kárový Duel na majitele platí (dodatek)', () => {
    const g = mkZH([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    gear(g, 1, 'ZH_KALUMET');
    const idx = give(g, 0, CardType.DUEL, { suit: Suits.DIAMONDS });
    g.playSpecialCard(0, 1, idx);
    assert.equal(g.phase, 'RESPOND', 'duel se rozjel, Kalumet ho nezastavil');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Apache Kid se dodatkem o duelu neřídí – kárový Duel ho mine dál', () => {
    const g = mkZH([{ role: 'Outlaw' }, { role: 'Sheriff', character: 'Apache Kid' }], { current: 0 });
    const idx = give(g, 0, CardType.DUEL, { suit: Suits.DIAMONDS });
    g.playSpecialCard(0, 1, idx);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
});

test('Kalumet: kárová Panika! na majitele nepůsobí (žádný výběr karty)', () => {
    const g = mkZH([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    gear(g, 1, 'ZH_KALUMET');
    give(g, 1, CardType.BEER);
    const pidx = give(g, 0, CardType.PANIC, { suit: Suits.DIAMONDS });
    g.playSpecialCard(0, 1, pidx);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand.length, 1);
});

// ── PODKOVA ──────────────────────────────────────────────────────────────────

test('Podkova: u sejmutí se odkryjí 2 karty a hráč si vybere výsledek', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_PODKOVA');
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    topDeck(g, Suits.SPADES, '5');    // výbuch – lízne se jako druhá
    topDeck(g, Suits.HEARTS, '5');    // příznivá – lízne se jako první

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    assert.equal(g.luckyDukeState.cards.length, 2);
    assert.equal(g.luckyDukeState.via, 'Podkova');
    assert.deepEqual(waitingStatus(g), { idx: 0, kind: 'LUCKY_DUKE', text: 'Podkova – vybírá kartu' });

    g.luckyDukePick(0);               // srdce → dynamit nevybuchne
    assert.equal(g.players[0].health, 4);
    assert.equal(g.players[1].board.some(c => c.type === CardType.DYNAMITE), true);
});

test('Podkova × Lucky Duke: karty se SČÍTAJÍ, odkryjí se tři (R8)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Lucky Duke' }, { role: 'Outlaw' }]);
    assert.equal(g._checkRevealCount(g.players[0]), 2);
    gear(g, 0, 'ZH_PODKOVA');
    assert.equal(g._checkRevealCount(g.players[0]), 3);

    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    g.deck.cards = [];
    topDeck(g, Suits.SPADES, '2');
    topDeck(g, Suits.CLUBS, '3');
    topDeck(g, Suits.HEARTS, '4');

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    assert.equal(g.luckyDukeState.cards.length, 3);
    assert.equal(g.luckyDukeState.via, 'Lucky Duke');
});

test('Podkova: všechny otočené karty se pak odhodí, vybraná leží navrchu', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Lucky Duke' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_PODKOVA');
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    topDeck(g, Suits.SPADES, '2');
    topDeck(g, Suits.CLUBS, '3');
    topDeck(g, Suits.HEARTS, '4');

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    const revealed = g.luckyDukeState.cards.map(c => c.id);
    g.luckyDukePick(1);

    const dp = g.deck.discardPile.map(c => c.id);
    revealed.forEach(id => assert.ok(dp.includes(id), `otočená karta ${id} skončila v odhozu`));
    assert.equal(dp[dp.length - 1], revealed[1], 'vybraná dosedá jako poslední');
});

test('Podkova: bez ní se u sejmutí nevybírá vůbec (klasická jedna karta)', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    assert.equal(g._checkRevealCount(g.players[0]), 1);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    topDeck(g, Suits.HEARTS, '5');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.phase, 'CHECKING');
});

test('Podkova platí i u barelu (sejmutí v cizím tahu)', () => {
    const g = mkZH([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    gear(g, 1, 'ZH_PODKOVA');
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.deck.cards = [];
    topDeck(g, Suits.SPADES, '5');
    topDeck(g, Suits.CLUBS, '5');

    const idx = give(g, 0, CardType.BANG, { suit: Suits.CLUBS });
    g.playBang(0, 1, idx);
    g.triggerBarrelDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    assert.equal(g.luckyDukeState.cards.length, 2);
});

// ── R10: Laso (Fistful) a Belle Star (Dodge City) vybavení VYPÍNAJÍ ──────────

test('Laso: „karty na stole nemají efekt" platí i pro vybavení', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(g, 0, 'ZH_OPASEK');
    gear(g, 0, 'ZH_KRUMPAC');
    gear(g, 0, 'ZH_TALISMAN');
    assert.equal(g._handLimit(g.players[0]), 8);

    g.activeFistful = ffData.find(c => c.key === 'LASO');
    assert.equal(g._handLimit(g.players[0]), 4);
    assert.equal(g._drawCountFor(g.players[0]), 2);
    g.handleDamage(0, 1);
    assert.equal(g.players[0].nuggets, 0, 'Talisman pod Lasem nedává valoun');
    // Vlastnictví to ale nemění – karta pořád leží před hráčem (a nedá se koupit dvakrát).
    assert.equal(g._hasGear(0, 'ZH_OPASEK'), true);
});

test('Belle Star: v jejím tahu nemá efekt CIZÍ vybavení, vlastní ano', () => {
    const g = mkZH([{ role: 'Outlaw', character: 'Belle Star' }, { role: 'Sheriff' }], { current: 0 });
    gear(g, 0, 'ZH_KRUMPAC');
    gear(g, 1, 'ZH_KALUMET');
    assert.equal(g._gearOn(g.players[0], 'ZH_KRUMPAC'), true, 'své vybavení si nevypíná');
    assert.equal(g._gearOn(g.players[1], 'ZH_KALUMET'), false);

    const idx = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    g.playBang(0, 1, idx);
    assert.equal(g.phase, 'RESPOND', 'kárový Bang! Belle Star projde i přes Kalumet');
});

test('zrcadlo core/goldRush.js odpovídá serverovému _gearOn (klient i bot)', () => {
    const g = mkZH([{ role: 'Outlaw', character: 'Belle Star' }, { role: 'Sheriff' }], { current: 0 });
    gear(g, 1, 'ZH_OPASEK');
    assert.equal(gearOnFor(g, 1, 'ZH_OPASEK'), g._gearOn(g.players[1], 'ZH_OPASEK'));
    assert.equal(gearOnFor(g, 1, 'ZH_OPASEK'), false);

    const h = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    gear(h, 0, 'ZH_OPASEK');
    assert.equal(gearOnFor(h, 0, 'ZH_OPASEK'), true);
    h.activeFistful = ffData.find(c => c.key === 'LASO');
    assert.equal(gearOnFor(h, 0, 'ZH_OPASEK'), h._gearOn(h.players[0], 'ZH_OPASEK'));
    assert.equal(gearOnFor(h, 0, 'ZH_OPASEK'), false);
});
