// Rozšíření High Noon – balíček událostí a karty implementované v 1. etapě
// (Kazatel, Reverend, Přestřelka, Doktor, Žízeň, Příjezd vlaku, Pravé poledne).
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));
const HN_OPTS = { expansions: { high_noon: true } };

// Hra se zapnutým rozšířením: data událostí + postavený balíček.
// `event` = klíč karty, kterou rovnou nastavíme jako platnou (bez odkrývání).
function mkHnGame(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.highNoonCardData = hnData;
    g._setupEventDeck(HN_OPTS);
    if (opts.event) g.activeEvent = hnData.find(c => c.key === opts.event);
    return g;
}

const evCard = (key) => hnData.find(c => c.key === key);

// Start tahu přesně jako nextTurn: nejdřív události (High Noon), pak kontroly Dynamit/Vězení.
function startTurn(g) {
    if (g._beginTurn()) return;
    g.handleStartOfTurnChecks();
}

// ── Balíček událostí ────────────────────────────────────────────────────────

test('balíček událostí má 13 karet a Pravé poledne se líže jako poslední', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}]);
    assert.equal(g.eventDeck.length, 13);
    assert.equal(g.eventDeck[0].key, 'PRAVE_POLEDNE', 'Pravé poledne leží vespod (pop bere z konce)');
    const drawn = [];
    while (g.eventDeck.length) drawn.push(g.eventDeck.pop().key);
    assert.equal(drawn[drawn.length - 1], 'PRAVE_POLEDNE');
    assert.equal(new Set(drawn).size, 13, 'žádná karta se neopakuje');
});

test('přibalené karty (Nová identita, Želízka) jsou v balíčku jen s pokročilou volbou', () => {
    const g = mkGame([{ role: 'Sheriff' }, {}]);
    g.highNoonCardData = hnData;
    g._setupEventDeck({ expansions: { high_noon: true }, highNoonExtra: true });
    assert.equal(g.eventDeck.length, 15);
    assert.ok(g.eventDeck.some(c => c.key === 'NOVA_IDENTITA'));
    assert.ok(g.eventDeck.some(c => c.key === 'ZELIZKA'));
});

test('bez zapnutého rozšíření je balíček prázdný a hasEvent vždy false', () => {
    const g = mkGame([{ role: 'Sheriff' }, {}]);
    g.highNoonCardData = hnData;
    g._setupEventDeck({});
    assert.equal(g.eventDeck.length, 0);
    assert.equal(g.hasEvent('KAZATEL'), false);
});

// ── Odkrývání ───────────────────────────────────────────────────────────────

test('karta se odkrývá až od DRUHÉHO šerifova tahu a jen jemu', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}]);
    for (let i = 0; i < 20; i++) topDeck(g, Suits.CLUBS);

    g._beginTurn();                       // 1. tah šerifa
    assert.equal(g.activeEvent, null, 'první kolo je bez události');

    g.currentPlayerIndex = 1;
    g._beginTurn();                       // tah nešerifa
    assert.equal(g.activeEvent, null);

    g.currentPlayerIndex = 0;
    const before = g.eventDeck.length;
    g._beginTurn();                       // 2. tah šerifa
    assert.ok(g.activeEvent, 'druhé kolo už událost odkryje');
    assert.equal(g.eventDeck.length, before - 1);
    assert.equal(g._pendingHighNoonReveal.key, g.activeEvent.key, 'server dostane podklad pro animaci');
});

test('odkryté karty se hromadí na sobě – eventPile roste, activeEvent je vrchní', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}]);
    for (let i = 0; i < 30; i++) topDeck(g, Suits.CLUBS);
    g._sheriffTurns = 1;

    g._beginTurn();
    const first = g.activeEvent;
    assert.deepEqual(g.eventPile.map(c => c.key), [first.key]);

    g.eventDeck.push(evCard('DOKTOR'));   // ať je co odkrýt (a nic to nepozastaví)
    g._beginTurn();
    assert.equal(g.activeEvent.key, 'DOKTOR');
    assert.deepEqual(g.eventPile.map(c => c.key), [first.key, 'DOKTOR'],
        'předchozí karta zůstává ležet pod novou');
});

test('prázdný balíček událostí nechá platit poslední kartu (Pravé poledne do konce hry)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}], { event: 'PRAVE_POLEDNE' });
    g.eventDeck = [];
    g._sheriffTurns = 5;
    g._beginTurn();
    assert.equal(g.activeEvent.key, 'PRAVE_POLEDNE');
});

// ── Doktor ──────────────────────────────────────────────────────────────────

test('Doktor: hráči s nejmenším počtem životů si obnoví 1 život', () => {
    const g = mkHnGame([{ role: 'Sheriff', health: 4 }, { health: 1 }, { health: 1 }, { health: 3 }]);
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g.eventDeck = [evCard('DOKTOR')];
    g._sheriffTurns = 1;
    g._beginTurn();
    assert.deepEqual(g.players.map(p => p.health), [4, 2, 2, 3], 'oba nejslabší +1, ostatní beze změny');
});

test('Doktor neléčí přes maximum ani mrtvé', () => {
    const g = mkHnGame([{ role: 'Sheriff', health: 4, maxHealth: 4 }, { health: 0 }, { health: 4, maxHealth: 4 }]);
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g.eventDeck = [evCard('DOKTOR')];
    g._sheriffTurns = 1;
    g._beginTurn();
    assert.deepEqual(g.players.map(p => p.health), [4, 0, 4]);
});

// ── Počet líznutí: Žízeň, Příjezd vlaku ─────────────────────────────────────

test('Žízeň: hráč si líže jen 1 kartu, Příjezd vlaku: 3', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}]);
    assert.equal(g._drawCountFor(g.players[0]), 2, 'bez události normálně 2');
    g.activeEvent = evCard('ZIZEN');
    assert.equal(g._drawCountFor(g.players[0]), 1);
    g.activeEvent = evCard('PRIJEZD_VLAKU');
    assert.equal(g._drawCountFor(g.players[0]), 3);
});

test('Žízeň/Vlak se skládá s Dodge City postavami (Pixie Pete, Bill Noface)', () => {
    const g = mkHnGame([
        { role: 'Sheriff', character: 'Pixie Pete' },
        { character: 'Bill Noface', maxHealth: 4, health: 2 },
    ]);
    assert.equal(g._drawCountFor(g.players[0]), 3);
    assert.equal(g._drawCountFor(g.players[1]), 3);   // 1 + 2 zranění
    g.activeEvent = evCard('ZIZEN');
    assert.equal(g._drawCountFor(g.players[0]), 2);
    assert.equal(g._drawCountFor(g.players[1]), 2);
    g.activeEvent = evCard('PRIJEZD_VLAKU');
    assert.equal(g._drawCountFor(g.players[0]), 4);
    assert.equal(g._drawCountFor(g.players[1]), 4);
});

test('Žízeň nikdy nesníží líznutí pod 1', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Bill Noface', maxHealth: 4, health: 4 }], { event: 'ZIZEN' });
    assert.equal(g._drawCountFor(g.players[0]), 1);
});

test('Žízeň: běžný hráč si ve fázi lízání vezme jednu kartu a fáze končí', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}], { event: 'ZIZEN' });
    for (let i = 0; i < 5; i++) topDeck(g, Suits.CLUBS);
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

// ── Kit Carlson (FAQ H6) ────────────────────────────────────────────────────

// Kit odkrývá VŽDY 3 karty (to je jeho schopnost); události mění jen to, kolik si jich
// nechá – a Příjezd vlaku ne ani to (kartu navíc si dolízne klasicky z balíčku).

test('Kit Carlson se Žízní: odkryje 3, nechá si 1, zbylé dvě vrátí na balíček', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Kit Carlson' }, {}], { event: 'ZIZEN' });
    g.deck.cards = [];
    for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS, String(i + 2));
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    assert.equal(g.kitCarlsonState.revealed.length, 3, 'odkrytých je vždy 5-2 = 3');
    assert.equal(g.kitCarlsonState.needed, 1);
    const deckBefore = g.deck.cards.length;
    g.kitCarlsonPick(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.deck.cards.length, deckBefore + 2, 'obě nevybrané karty se vrátily');
});

test('Kit Carlson s Příjezdem vlaku: odkryje 3, nechá si 2 a čtvrtou dolízne z balíčku', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Kit Carlson' }, {}], { event: 'PRIJEZD_VLAKU' });
    g.deck.cards = [];
    for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS, String(i + 2));
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.kitCarlsonState.revealed.length, 3);
    assert.equal(g.kitCarlsonState.needed, 2);
    assert.equal(g.kitCarlsonState.extra, 1, 'karta za událost se líže až po výběru');
    g.kitCarlsonPick(0); g.kitCarlsonPick(1);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'DRAW', 'zbývá klasické líznutí z balíčku');
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Kit Carlson vrací nevybrané karty ve STEJNÉM pořadí (FAQ H6)', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Kit Carlson' }, {}], { event: 'ZIZEN' });
    g.deck.cards = [];
    // draw() bere z konce → odkryjí se hodnoty '9', '8' a '3'; '2' zůstane pod nimi.
    for (const v of ['2', '3', '8', '9']) topDeck(g, Suits.CLUBS, v);
    g.startDrawPhase();
    g.drawCard('deck');
    const revealedValues = g.kitCarlsonState.revealed.map(c => c.value);
    assert.deepEqual(revealedValues, ['9', '8', '3']);
    g.kitCarlsonPick(0);   // nechá si '9', vrací '8' a '3'
    assert.deepEqual(g.deck.cards.map(c => c.value), ['2', '3', '8'], 'vrácené karty leží zase navrchu ve stejném pořadí');
});

// ── Black Jack ──────────────────────────────────────────────────────────────

test('Black Jack: základ 2, za červenou druhou kartu jedna navíc (celkem 3)', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Black Jack' }, {}]);
    g.deck.cards = [];
    for (let i = 0; i < 6; i++) topDeck(g, Suits.HEARTS);
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    g.resolveBlackJack(true);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 3);
});

test('Black Jack s Příjezdem vlaku: základ 3, za červenou 4', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Black Jack' }, {}], { event: 'PRIJEZD_VLAKU' });
    g.deck.cards = [];
    for (let i = 0; i < 8; i++) topDeck(g, Suits.HEARTS);
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    g.drawCard('deck');
    g.drawCard('deck');
    g.resolveBlackJack(true);
    assert.equal(g.drawPhaseState.cardsNeeded, 4);
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 4);
});

test('Black Jack s Příjezdem vlaku: za ČERNOU se dolízne 3. karta (za událost, na konci)', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Black Jack' }, {}], { event: 'PRIJEZD_VLAKU' });
    g.deck.cards = [];
    for (let i = 0; i < 8; i++) topDeck(g, Suits.SPADES);
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    g.resolveBlackJack(true);
    assert.equal(g.drawPhaseState.cardsNeeded, 3, 'žádný bonus, ale karta za vlak zbývá');
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Black Jack se Žízní: lízne 1 kartu, ukázka druhé se nespustí', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Black Jack' }, {}], { event: 'ZIZEN' });
    g.deck.cards = [];
    for (let i = 0; i < 6; i++) topDeck(g, Suits.HEARTS);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

// ── Kazatel ─────────────────────────────────────────────────────────────────

test('Kazatel: hráč na tahu nesmí zahrát Bang!, ostatní útoky ano', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}], { event: 'KAZATEL' });
    const bang = give(g, 0, CardType.BANG);
    g.playBang(0, 1, bang);
    assert.equal(g.players[0].hand.length, 1, 'karta zůstala v ruce');
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
});

test('Kazatel neomezuje karty s bang-EFEKTEM (Úder)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}], { event: 'KAZATEL' });
    const punch = give(g, 0, CardType.PUNCH, { props: { bangEffect: true, range: 1 } });
    g.players[0].hand[punch].bangEffect = true;
    g.players[0].hand[punch].range = 1;
    g.playBang(0, 1, punch);
    assert.equal(g.players[0].hand.length, 0, 'Úder se zahrál');
});

test('Kazatel: Calamity Janet nesmí použít Vedle! jako Bang! (FAQ H5)', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Calamity Janet' }, {}], { event: 'KAZATEL' });
    const missed = give(g, 0, CardType.MISSED);
    g.playBang(0, 1, missed);
    assert.equal(g.players[0].hand.length, 1);
});

test('Kazatel: v duelu ve svém tahu nejde odpovědět kartou Bang! (FAQ H2)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}], { event: 'KAZATEL' });
    // Duel: hráč 0 vyzve hráče 1, ten odpoví Bang! → řada je zpět na hráči 0, který
    // ale Bang! zahrát nesmí (je na tahu) → schytá zásah.
    give(g, 0, CardType.BANG);
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: CardType.BANG, sourceCard: CardType.DUEL, responded: [] };
    g.phase = 'RESPOND';
    g.handleResponse(0, 0);
    assert.equal(g.players[0].hand.length, 1, 'Bang! zůstal v ruce');
    assert.equal(g.phase, 'RESPOND', 'reakce se nevyhodnotila');
});

test('Kazatel neblokuje Bang! jako reakci hráči, který NENÍ na tahu', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}], { event: 'KAZATEL' });
    give(g, 1, CardType.BANG);
    g.pendingResponse = { active: true, originatorIdx: 0, targetIdx: 1, requiredCard: CardType.BANG, sourceCard: CardType.DUEL, responded: [] };
    g.phase = 'RESPOND';
    g.handleResponse(1, 0);
    assert.equal(g.players[1].hand.length, 0, 'Bang! se zahrál jako odpověď v duelu');
});

// ── Přestřelka ──────────────────────────────────────────────────────────────

test('Přestřelka: hráč smí zahrát dva Bangy, třetí ne', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}], { event: 'PRESTRELKA' });
    give(g, 0, CardType.BANG); give(g, 0, CardType.BANG); give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    g.phase = 'PLAY'; g.pendingResponse = { active: false };
    g.playBang(0, 1, 0);
    g.phase = 'PLAY'; g.pendingResponse = { active: false };
    assert.equal(g.players[0].bangsPlayedThisTurn, 2);
    g.playBang(0, 1, 0);
    assert.equal(g.players[0].bangsPlayedThisTurn, 2, 'třetí Bang! už neprojde');
    assert.equal(g.players[0].hand.length, 1);
});

test('bez Přestřelky platí limit 1 Bang! za tah', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}]);
    give(g, 0, CardType.BANG); give(g, 0, CardType.BANG);
    g.playBang(0, 1, 0);
    g.phase = 'PLAY'; g.pendingResponse = { active: false };
    g.playBang(0, 1, 0);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
    assert.equal(g.players[0].hand.length, 1);
});

// ── Reverend ────────────────────────────────────────────────────────────────

test('Reverend: Pivo se nedá zahrát, Salón ano (FAQ H1)', () => {
    const g = mkHnGame([{ role: 'Sheriff', health: 2 }, { health: 2 }], { event: 'REVEREND' });
    const beer = give(g, 0, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.players[0].health, 2, 'Pivo neúčinkovalo');
    assert.equal(g.players[0].hand.length, 1, 'a zůstalo v ruce');

    const saloon = give(g, 0, CardType.SALOON);
    g.playCard(saloon);
    assert.deepEqual(g.players.map(p => p.health), [3, 3], 'Salón funguje dál');
});

test('Reverend: Pivo nezachrání ani při posledním životě', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 1 }, {}], { event: 'REVEREND' });
    const beer = give(g, 1, CardType.BEER);
    g.phase = 'RESPOND';
    g.pendingResponse = { active: true, originatorIdx: 0, targetIdx: 1, requiredCard: CardType.MISSED, sourceCard: CardType.BANG, responded: [] };
    assert.equal(g.beerLastLifeSave(1, beer), false);
    assert.equal(g.players[1].hand.length, 1);
});

// ── Pravé poledne ───────────────────────────────────────────────────────────

test('Pravé poledne: start tahu čeká na kliknutí na životy a vezme 1 život', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 3 }], { event: 'PRAVE_POLEDNE' });
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g.currentPlayerIndex = 1;
    const paused = g._beginTurn();
    assert.equal(paused, true);
    assert.equal(g.phase, 'NOON_DAMAGE');
    assert.equal(g.pendingNoonDamage.playerIdx, 1);

    g.takeNoonHit(1);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.phase, 'DRAW', 'po zásahu pokračuje start tahu (lízání)');
});

test('Pravé poledne: cizí klik na životy hru neposune', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 3 }], { event: 'PRAVE_POLEDNE' });
    g.currentPlayerIndex = 1;
    g._beginTurn();
    g.takeNoonHit(0);
    assert.equal(g.phase, 'NOON_DAMAGE');
    assert.equal(g.players[1].health, 3);
});

test('Pravé poledne: Pivo při posledním životě zásah zruší', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 1 }, {}, {}], { event: 'PRAVE_POLEDNE' });
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g.currentPlayerIndex = 1;
    g._beginTurn();
    const beer = give(g, 1, CardType.BEER);
    assert.equal(g.beerLastLifeSave(1, beer), true);
    assert.equal(g.players[1].health, 1, 'zůstává naživu na jednom životě');
    assert.equal(g.phase, 'DRAW');
});

test('Pravé poledne: bez záchrany hráč umře a tah se posune automaticky', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Outlaw' }], { event: 'PRAVE_POLEDNE' });
    g.currentPlayerIndex = 1;
    g._beginTurn();
    g.takeNoonHit(1);
    assert.equal(g.players[1].health, 0);
    assert.equal(g._autoEndTurnPending, true, 'server posune tah cinematikou vyřazení');
});

test('Pravé poledne: Bart Cassidy si za ztrátu života lízne, teprve pak jde lízací fáze', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Bart Cassidy', health: 3 }], { event: 'PRAVE_POLEDNE' });
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g.currentPlayerIndex = 1;
    g._beginTurn();
    g.takeNoonHit(1);
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'DRAW', 'po Bartovi pokračuje start tahu');
});

test('Pravé poledne se vyhodnotí PŘED kontrolou dynamitu', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 3 }], { event: 'PRAVE_POLEDNE' });
    board(g, 1, CardType.DYNAMITE);
    g.currentPlayerIndex = 1;
    g._beginTurn();
    assert.equal(g.phase, 'NOON_DAMAGE');
    g.takeNoonHit(1);
    assert.equal(g.phase, 'CHECK_DRAW', 'teprve teď se řeší dynamit');
});

test('Pravé poledne bere život i šerifovi na začátku jeho tahu', () => {
    const g = mkHnGame([{ role: 'Sheriff', health: 5, maxHealth: 5 }, {}], { event: 'PRAVE_POLEDNE' });
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g._sheriffTurns = 5;
    g.eventDeck = [];
    g._beginTurn();
    assert.equal(g.phase, 'NOON_DAMAGE');
    g.takeNoonHit(0);
    assert.equal(g.players[0].health, 4);
});

// ── Požehnání / Prokletí ────────────────────────────────────────────────────
// Obě karty přebíjí BARVU všech karet ve hře (hodnota zůstává). Pravidla se na barvu
// ptají výhradně přes _effSuit, takže se testuje každý trychtýř zvlášť.

test('_effSuit: Požehnání dělá ze všeho srdce, Prokletí piky, jinak platí vytištěná barva', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}]);
    const card = mkCard(CardType.BANG, { suit: Suits.DIAMONDS, value: '7' });
    assert.equal(g._effSuit(card), Suits.DIAMONDS);
    g.activeEvent = evCard('POZEHNANI');
    assert.equal(g._effSuit(card), Suits.HEARTS);
    g.activeEvent = evCard('PROKLETI');
    assert.equal(g._effSuit(card), Suits.SPADES);
    assert.equal(card.suit, Suits.DIAMONDS, 'vytištěná barva karty se nemění');
});

test('Prokletí: dynamit vybuchne i na srdcové kartě (hodnota 2–9 platí dál)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 4 }], { event: 'PROKLETI' });
    board(g, 1, CardType.DYNAMITE);
    topDeck(g, Suits.HEARTS, '5');
    g.currentPlayerIndex = 1;
    startTurn(g);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE', 'srdcová 5 se počítá jako piková → výbuch');
});

test('Prokletí: dynamit na pikové 10 přesto nevybuchne (hodnota mimo 2–9)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 4 }], { event: 'PROKLETI' });
    board(g, 1, CardType.DYNAMITE);
    for (let i = 0; i < 5; i++) topDeck(g, Suits.CLUBS);
    topDeck(g, Suits.HEARTS, '10');   // snímaná karta leží navrchu (draw bere z konce)
    g.currentPlayerIndex = 1;
    startTurn(g);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.notEqual(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.players[1].health, 4);
});

test('Požehnání: dynamit nevybuchne ani na pikové 5 (všechno je srdcové)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 4 }, {}], { event: 'POZEHNANI' });
    board(g, 1, CardType.DYNAMITE);
    for (let i = 0; i < 5; i++) topDeck(g, Suits.CLUBS);
    topDeck(g, Suits.SPADES, '5');
    g.currentPlayerIndex = 1;
    startTurn(g);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[1].health, 4, 'žádný výbuch');
    assert.equal(g.players[2].board.some(c => c.type === CardType.DYNAMITE), true, 'dynamit putuje dál');
});

test('Požehnání: z vězení se dostane každý (snímá se srdce)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 4 }], { event: 'POZEHNANI' });
    board(g, 1, CardType.JAIL);
    for (let i = 0; i < 5; i++) topDeck(g, Suits.CLUBS);
    topDeck(g, Suits.SPADES, 'K');
    g.currentPlayerIndex = 1;
    startTurn(g);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DRAW', 'hráč hraje svůj tah');
    assert.equal(g.currentPlayerIndex, 1);
});

test('Prokletí: z vězení se nedostane nikdo (srdce ve hře nejsou)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 4 }], { event: 'PROKLETI' });
    board(g, 1, CardType.JAIL);
    for (let i = 0; i < 5; i++) topDeck(g, Suits.CLUBS);
    topDeck(g, Suits.HEARTS, '4');
    g.currentPlayerIndex = 1;
    startTurn(g);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.notEqual(g.currentPlayerIndex, 1, 'tah přeskočen');
});

test('Požehnání: barel uhne vždycky, Prokletí: nikdy', () => {
    const mk = (event, suit) => {
        const g = mkHnGame([{ role: 'Sheriff' }, { health: 4 }], { event });
        board(g, 1, CardType.BARREL);
        topDeck(g, suit, '5');
        const bang = give(g, 0, CardType.BANG);
        g.playBang(0, 1, bang);
        g.triggerBarrelDraw();
        g.resolveCheck();
        return g;
    };
    // Piková karta pod Požehnáním = srdce → uhnul (žádná fáze obrany, plné životy).
    const blessed = mk('POZEHNANI', Suits.SPADES);
    assert.equal(blessed.players[1].health, 4);
    assert.equal(blessed.phase, 'PLAY');
    // Srdcová karta pod Prokletím = piky → neuhnul, čeká se na Vedle!.
    const cursed = mk('PROKLETI', Suits.HEARTS);
    assert.equal(cursed.phase, 'RESPOND');
});

test('Prokletí zruší imunitu Apache Kida vůči károvým kartám', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Apache Kid', health: 4 }], { event: 'PROKLETI' });
    const bang = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'RESPOND', 'kárový Bang! je pod Prokletím pikový → normální útok');
});

test('bez události zůstává Apache Kid vůči károvému Bang! imunní', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Apache Kid', health: 4 }]);
    const bang = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
});

test('Požehnání: Black Jack má druhou kartu vždy červenou → líže 3', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Black Jack' }, {}], { event: 'POZEHNANI' });
    g.deck.cards = [];
    for (let i = 0; i < 6; i++) topDeck(g, Suits.SPADES);   // vytištěné piky, platná srdce
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    g.resolveBlackJack(true);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 3);
});

test('Prokletí: Black Jack má druhou kartu vždy černou → líže jen 2', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Black Jack' }, {}], { event: 'PROKLETI' });
    g.deck.cards = [];
    for (let i = 0; i < 6; i++) topDeck(g, Suits.HEARTS);   // vytištěná srdce, platné piky
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    g.resolveBlackJack(true);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY');
});

// ── Daltonové ───────────────────────────────────────────────────────────────
// Každý hráč s aspoň jednou MODROU kartou před sebou jednu z nich odhodí. Vybírá si ji
// sám, po směru hodinových ručiček počínaje šerifem. Technicky se recykluje sekvenční
// výběr Rvačky, jen attacker === target (hráč sahá na svůj stůl).

// Odkrytí konkrétní události normální cestou (druhý šerifův tah). Vrací true,
// když si start tahu vyžádal rozhodnutí hráče.
function flipEvent(g, key) {
    g.eventDeck = [evCard(key)];
    g._sheriffTurns = 1;
    g.currentPlayerIndex = g.players.findIndex(p => p.role === 'Sheriff');
    return g._beginTurn();
}

test('Daltonové: každý s modrou kartou jednu odhodí, pořadí od šerifa po směru', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}]);
    [0, 1, 2, 3].forEach(i => board(g, i, CardType.BARREL));

    assert.equal(flipEvent(g, 'DALTONOVE'), true, 'start tahu se pozastaví');
    const seen = [];
    for (let k = 0; k < 4; k++) {
        assert.equal(g.phase, 'SELECTING_TARGET_CARD');
        const idx = g.pendingSelection.attackerIdx;
        assert.equal(g.pendingSelection.targetIdx, idx, 'vybírá si na vlastním stole');
        seen.push(idx);
        g.resolveCardSelection(idx, 'board', 0);
    }
    assert.deepEqual(seen, [0, 1, 2, 3]);
    assert.equal(g.players.every(p => p.board.length === 0), true);
    assert.equal(g.deck.discardPile.length, 4);
    assert.equal(g.phase, 'DRAW', 'po posledním odhozu doběhne start tahu');
});

test('Daltonové: pořadí začíná u šerifa, i když je uprostřed stolu', () => {
    const g = mkHnGame([{}, {}, { role: 'Sheriff' }, {}]);
    [0, 1, 2, 3].forEach(i => board(g, i, CardType.BARREL));
    flipEvent(g, 'DALTONOVE');
    const seen = [];
    for (let k = 0; k < 4; k++) {
        seen.push(g.pendingSelection.attackerIdx);
        g.resolveCardSelection(g.pendingSelection.attackerIdx, 'board', 0);
    }
    assert.deepEqual(seen, [2, 3, 0, 1]);
});

test('Daltonové: hráč bez modré karty se přeskočí, mrtvý taky', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, { health: 0 }, {}]);
    board(g, 0, CardType.BARREL);
    board(g, 2, CardType.BARREL);   // mrtvý – nehraje
    board(g, 3, CardType.BARREL);
    // hráč 1 nemá nic

    flipEvent(g, 'DALTONOVE');
    assert.equal(g.pendingSelection.attackerIdx, 0);
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.pendingSelection.attackerIdx, 3, 'hráč 1 (bez karty) i mrtvý 2 se přeskočí');
    g.resolveCardSelection(3, 'board', 0);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.players[2].board.length, 1, 'mrtvému karta zůstala');
});

test('Daltonové: nikdo nemá modrou kartu → start tahu pokračuje bez pauzy', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}]);
    give(g, 1, CardType.BARREL);   // v RUCE se nepočítá
    assert.equal(flipEvent(g, 'DALTONOVE'), false, 'nic se nepozastaví');
    assert.notEqual(g.phase, 'SELECTING_TARGET_CARD');
    g.handleStartOfTurnChecks();   // pokračování, které jinak dělá nextTurn
    assert.equal(g.phase, 'DRAW');
});

test('Daltonové: výzbroj je modrá karta (vrátí se Colt .45)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}]);
    g.players[0].weapon = mkCard(CardType.WEAPON, { name: 'Schofield', props: { range: 2 } });
    flipEvent(g, 'DALTONOVE');
    assert.equal(g.pendingSelection.attackerIdx, 0);
    g.resolveCardSelection(0, 'weapon', null);
    assert.equal(g.players[0].weapon.id, -1, 'zpátky na Colt .45');
    assert.equal(g.deck.discardPile[0].name, 'Schofield');
});

test('Daltonové: Vězení i Dynamit se počítají jako modré karty (FAQ H4)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}]);
    board(g, 1, CardType.JAIL);
    board(g, 0, CardType.DYNAMITE);
    flipEvent(g, 'DALTONOVE');
    assert.equal(g.pendingSelection.attackerIdx, 0);
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.pendingSelection.attackerIdx, 1);
    g.resolveCardSelection(1, 'board', 0);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.deck.discardPile.length, 2);
});

test('Daltonové: zelená karta (Dodge City) modrá není – hráč se přeskočí', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}]);
    const greenCard = board(g, 1, CardType.EQUIPMENT);
    greenCard.green = true;
    board(g, 0, CardType.BARREL);
    flipEvent(g, 'DALTONOVE');
    assert.equal(g.pendingSelection.attackerIdx, 0);
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.phase, 'DRAW', 'hráč 1 má jen zelenou → nic neodhazuje');
    assert.equal(g.players[1].board.length, 1);
});

test('Daltonové: klik do ruky ani na zelenou kartu výběr neposune', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}]);
    give(g, 0, CardType.BANG);
    const greenCard = board(g, 0, CardType.EQUIPMENT);
    greenCard.green = true;
    board(g, 0, CardType.BARREL);
    flipEvent(g, 'DALTONOVE');

    g.resolveCardSelection(0, 'hand', null);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD', 'z ruky se nebere');
    assert.equal(g.players[0].hand.length, 1);
    g.resolveCardSelection(0, 'board', 0);   // zelená karta
    assert.equal(g.phase, 'SELECTING_TARGET_CARD', 'zelená karta není modrá');
    g.resolveCardSelection(0, 'board', 1);   // Barel
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.players[0].board.length, 1, 'zelená zůstala ležet');
});

test('Daltonové: Pravé poledne se vyhodnotí až po odhození (start tahu jde dál)', () => {
    const g = mkHnGame([{ role: 'Sheriff', health: 4 }, {}]);
    g.activeEvent = evCard('PRAVE_POLEDNE');   // právě platí, Daltonové ho překryjí
    board(g, 0, CardType.BARREL);
    flipEvent(g, 'DALTONOVE');
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.phase, 'DRAW', 'Pravé poledne už neplatí, život se nebere');
    assert.equal(g.players[0].health, 4);
});

// ── Kocovina ────────────────────────────────────────────────────────────────
// Všechny postavy přijdou po celé kolo o schopnosti. Řeší to jediný příznak `_noAbility`,
// který čte effectiveCharacter – tím projdou úplně všechny kontroly schopností.

test('Kocovina: Willy the Kid ztratí neomezené Bangy (platí limit 1)', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Willy the Kid' }, {}]);
    flipEvent(g, 'KOCOVINA');
    g.phase = 'PLAY';
    const b1 = give(g, 0, CardType.BANG);
    g.playBang(0, 1, b1);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
    g.phase = 'PLAY';
    const b2 = give(g, 0, CardType.BANG);
    g.playBang(0, 1, b2);
    assert.equal(g.players[0].hand.length, 1, 'druhý Bang! neprošel');
});

test('Kocovina: Jourdonnais nemá vrozený barel, Sean Mallory limit 10 karet', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Sean Mallory', health: 3 },
                        { character: 'Jourdonnais' }]);
    flipEvent(g, 'KOCOVINA');
    assert.equal(g._handLimit(g.players[0]), 3, 'limit = životy, ne 10');
    g.phase = 'PLAY';
    const b = give(g, 0, CardType.BANG);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'RESPOND', 'žádný kontrolní barel se nespustil');
});

test('Kocovina: maximum životů zůstává (schopnost mizí, postava ne)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Paul Regret', maxHealth: 3, health: 3 }]);
    flipEvent(g, 'KOCOVINA');
    assert.equal(g.players[1].maxHealth, 3);
    assert.equal(g.players[1].character, 'Paul Regret', 'portrét se nemění');
    assert.equal(g.getDistance(0, 1), 1, 'ale +1 ke vzdálenosti neplatí');
});

test('Kocovina: Vera Custer nekopíruje a stará kopie neplatí (FAQ X6)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Vera Custer' }, { character: 'Willy the Kid' }]);
    g.players[1]._copiedCharacter = 'Willy the Kid';
    flipEvent(g, 'KOCOVINA');
    g.currentPlayerIndex = 1;
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW', 'nenabídne se výběr kopírované postavy');
    assert.equal(g.players[1]._copiedCharacter, null);
});

test('Kocovina přestane platit, jakmile ji překryje další událost', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Willy the Kid' }]);
    flipEvent(g, 'KOCOVINA');
    assert.equal(g.players.every(p => p._noAbility), true);
    flipEvent(g, 'DOKTOR');
    assert.equal(g.players.some(p => p._noAbility), false);
});

// ── Zlatá horečka ───────────────────────────────────────────────────────────
// Hraje se proti směru hodinových ručiček. Efekty karet zůstávají po směru (FAQ H3).

test('Zlatá horečka: tah jde proti směru hodinových ručiček', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZLATA_HORECKA' });
    g.eventDeck = [];
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 3);
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 2);
});

test('Zlatá horečka: mrtví se přeskakují taky pozpátku', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, { health: 0 }, { health: 0 }], { event: 'ZLATA_HORECKA' });
    g.eventDeck = [];
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
});

test('bez Zlaté horečky se hraje dál po směru', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}]);
    g.eventDeck = [];
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
});

test('Zlatá horečka: dynamit putuje dál PO SMĚRU (FAQ H3)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZLATA_HORECKA' });
    g.eventDeck = [];
    board(g, 1, CardType.DYNAMITE);
    g.currentPlayerIndex = 1;
    topDeck(g, Suits.HEARTS);
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.players[2].board.some(c => c.type === CardType.DYNAMITE), true);
});

test('Zlatá horečka: v hokynářství se vybírá dál po směru (FAQ H3)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZLATA_HORECKA' });
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g.currentPlayerIndex = 1;
    g.openStore();
    assert.equal(g.storePickerIndex, 1);
    g.pickFromStore(0);
    assert.equal(g.storePickerIndex, 2, 'na řadě je soused po směru');
});

// ── Město duchů ─────────────────────────────────────────────────────────────
// Vyřazení hráči se na JEDEN svůj tah vracejí do hry (líznou 3, nemohou umřít,
// na konci tahu jsou opět vyřazeni). Model: health zůstane 0 + příznak `_ghost`.

test('Město duchů: mrtvý hráč se v pořadí nepřeskočí a stane se duchem', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1, 'na tahu je vyřazený hráč');
    assert.equal(g.players[1]._ghost, true);
    assert.equal(g.players[1].health, 0, 'životy zůstávají na nule');
});

test('bez Města duchů se mrtvý přeskočí a duchem se nestane', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    g.eventDeck = [];
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 2);
    assert.ok(!g.players[1]._ghost);
});

test('Město duchů: duchem se stane každý vyřazený v pořadí', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, { health: 0 }, {}], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    g.phase = 'PLAY';
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 2, 'po prvním duchovi jde na řadu druhý');
    assert.equal(g.players[2]._ghost, true);
    assert.ok(!g.players[1]._ghost, 'předchozí duch už ve hře není');
});

test('Město duchů: duch si líže 3 karty', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
});

test('Město duchů: duch Pixie Pete líže 4, duch Bill Noface 5 (FAQ X3)', () => {
    const g = mkHnGame([{ role: 'Sheriff' },
                        { character: 'Pixie Pete', health: 0 },
                        { character: 'Bill Noface', health: 0 }], { event: 'MESTO_DUCHU' });
    g.players[1]._ghost = true;
    g.players[2]._ghost = true;
    assert.equal(g._drawCountFor(g.players[1]), 4);
    assert.equal(g._drawCountFor(g.players[2]), 5);
});

test('Město duchů: duch sedí zase v kole (vzdálenost i dostřel)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    assert.equal(g.getDistance(1, 2), 999, 'mrtvý je mimo kolo');
    g.players[1]._ghost = true;
    assert.equal(g.getDistance(1, 2), 1);
    assert.equal(g.canHit(1, 2), true);
    assert.equal(g.getDistance(0, 2), 2, 'duch zase zabírá místo v kruhu');
});

test('Město duchů: duch nemůže během svého tahu umřít', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1]._ghost, true, 'duch zůstává ve hře až do konce svého tahu');
    assert.equal(g.winner, null);
});

test('Město duchů: duch se nedá vyléčit Pivem ani Sidem Ketchumem', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Sid Ketchum', health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    const beer = give(g, 1, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.players[1].health, 0, 'duch neožije');
    assert.equal(g.players[1].hand.length, 1, 'nezahrané Pivo zůstává v ruce');
    give(g, 1, CardType.BANG);
    g.useSidKetchum(1, [0, 1]);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1].hand.length, 2, 'Sid nic neodhodil');
});

test('Město duchů: konec tahu ducha – karty ze stolu do odhozu', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    board(g, 1, CardType.BARREL);
    g.players[1].weapon = mkCard(CardType.WEAPON, { name: 'Remington' });
    g.tryEndTurn();
    assert.ok(!g.players[1]._ghost, 'duch je zase vyřazený');
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.players[1].weapon.id, -1, 'zpátky Colt .45');
    assert.equal(g.deck.discardPile.length, 2);
    assert.equal(g.currentPlayerIndex, 2, 'tah jde dál');
});

test('Město duchů: konec tahu ducha – karty sebere Vulture Sam', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, { character: 'Vulture Sam' }, {}], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    board(g, 1, CardType.BARREL);
    g.tryEndTurn();
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.deck.discardPile.length, 0);
});

test('Město duchů: odchod ducha spustí Grega Diggera i Herba Huntera (FAQ X4)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 },
                        { character: 'Greg Digger', health: 1 },
                        { character: 'Herb Hunter' }], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    g.tryEndTurn();
    assert.equal(g.players[2].health, 3, 'Greg Digger +2');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 3, 'Herb Hunter si líže 2');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.currentPlayerIndex, 2, 'teprve po dobrání fronty se posune tah');
});

test('Město duchů: limit karet ducha je 0 – odhodí celou ruku (FAQ H8)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    give(g, 1, CardType.BANG);
    g.tryEndTurn();
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0);
    assert.equal(g.currentPlayerIndex, 2);
    assert.ok(!g.players[1]._ghost);
});

test('Město duchů: duch se počítá do hokynářství', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}], { event: 'MESTO_DUCHU' });
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.openStore();
    assert.equal(g.storeCards.length, 4, 'karta i pro ducha');
    assert.equal(g.storePickerIndex, 1, 'začíná duch');
    g.pickFromStore(0);
    assert.equal(g.storePickerIndex, 2);
});

test('Město duchů: duch Chuck Wengam schopnost použít nemůže (FAQ X5)', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { character: 'Chuck Wengam', health: 0 }, {}], { event: 'MESTO_DUCHU' });
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    assert.equal(g.useChuckWengam(1), false);
    assert.equal(g.players[1].health, 0);
});

test('Město duchů: zabije-li duch šerifa, počítá se za živého (FAQ H7)', () => {
    const g = mkHnGame([{ role: 'Sheriff', health: 1 }, { role: 'Renegade', health: 0 },
                        { role: 'Outlaw', health: 0 }], { event: 'MESTO_DUCHU' });
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.handleDamage(0, 1);
    assert.equal(g.winner, 'Odpadlík vyhrál!');
});

test('Město duchů: odchodem ducha se výhra přepočítá', () => {
    const g = mkHnGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 0 },
                        { role: 'Renegade', health: 0 }, { role: 'Deputy' }], { event: 'MESTO_DUCHU' });
    g.eventDeck = [];
    g.players[1]._ghost = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    g.checkWinCondition();
    assert.equal(g.winner, null, 'duch drží banditskou stranu ve hře');
    g.tryEndTurn();
    assert.equal(g.winner, 'Zákon vyhrál!');
    assert.equal(g.currentPlayerIndex, 1, 'po vyhlášení výhry se tah neposouvá');
});

// ── Přibalené karty z A Fistful of Cards (options.highNoonExtra) ─────────────
const { pendingActor } = require('../core/pending.js');
const { cardPlayability } = require('../core/playability.js');

const EXTRA_OPTS = { expansions: { high_noon: true }, highNoonExtra: true };

// Hra se zapnutými přibalenými kartami. `event` = platná událost (bez odkrývání).
function mkExtraGame(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.highNoonCardData = hnData;
    g.options = EXTRA_OPTS;
    g._setupEventDeck(EXTRA_OPTS);
    g.eventDeck = [];
    if (opts.event) g.activeEvent = evCard(opts.event);
    return g;
}

// ── Želízka ─────────────────────────────────────────────────────────────────

test('Želízka: po fázi lízání se čeká na volbu barvy', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZELIZKA' });
    for (let i = 0; i < 6; i++) topDeck(g, Suits.CLUBS);
    g.currentPlayerIndex = 0;
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'HANDCUFFS_SUIT');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'HANDCUFFS_SUIT' });
    assert.equal(g.chooseHandcuffsSuit(0, Suits.HEARTS), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0]._handcuffsSuit, Suits.HEARTS);
});

test('bez Želízek se na barvu nikdo neptá', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}]);
    for (let i = 0; i < 6; i++) topDeck(g, Suits.CLUBS);
    g.currentPlayerIndex = 0;
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
});

test('Želízka: karta jiné barvy se nezahraje, karta zvolené ano', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZELIZKA' });
    g.currentPlayerIndex = 0;
    g.phase = 'PLAY';
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    const bad = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    g.playBang(0, 1, bad);
    assert.equal(g.players[0].hand.length, 1, 'pikový Bang! zůstal v ruce');
    assert.equal(g.phase, 'PLAY');
    const ok = give(g, 0, CardType.BANG, { suit: Suits.HEARTS });
    g.playBang(0, 1, ok);
    assert.equal(g.phase, 'RESPOND', 'srdcový Bang! projde');
});

test('Želízka: Vězení jiné barvy nejde zahrát (playSpecialCard)', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZELIZKA' });
    g.currentPlayerIndex = 0;
    g.phase = 'PLAY';
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    const i = give(g, 0, CardType.JAIL, { suit: Suits.CLUBS });
    g.playSpecialCard(0, 1, i);
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.players[0].hand.length, 1);
});

test('Želízka: modrá karta jiné barvy se nevyloží (playCard)', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZELIZKA' });
    g.currentPlayerIndex = 0;
    g.phase = 'PLAY';
    g.players[0]._handcuffsSuit = Suits.DIAMONDS;
    const i = give(g, 0, CardType.BARREL, { suit: Suits.CLUBS });
    g.playCard(i);
    assert.equal(g.players[0].board.length, 0);
    assert.equal(g.players[0].hand.length, 1);
});

test('Želízka: platí i na reakci ve VLASTNÍM tahu (duel)', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZELIZKA' });
    g.currentPlayerIndex = 0;
    g.phase = 'PLAY';
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    const duel = give(g, 0, CardType.DUEL, { suit: Suits.HEARTS });
    g.playSpecialCard(0, 1, duel);
    assert.equal(g.phase, 'RESPOND');
    // Cíl (mimo svůj tah) odpoví klidně pikovým Bangem – jeho se Želízka netýkají.
    const b1 = give(g, 1, CardType.BANG, { suit: Suits.SPADES });
    g.handleResponse(1, b1);
    assert.equal(g.players[1].hand.length, 0, 'soupeře barva neomezuje');
    assert.equal(g.pendingResponse.targetIdx, 0);
    // Útočník na tahu ale pikový Bang! zahrát nesmí.
    const b2 = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    g.handleResponse(0, b2);
    assert.equal(g.players[0].hand.length, 1, 'pikový Bang! v duelu neprošel');
    assert.equal(g.players[0].health, 4, 'a zásah zatím nepadl');
});

test('Želízka: barva platí jen jeden tah', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZELIZKA' });
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    g.currentPlayerIndex = 3;
    g.nextTurn();   // → hráč 0, start tahu barvu zahodí ještě před kontrolami
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.players[0]._handcuffsSuit, null);
});

test('Želízka: cardPlayability zrcadlí pravidlo (klient i bot)', () => {
    const g = mkExtraGame([{ role: 'Sheriff' }, {}, {}, {}], { event: 'ZELIZKA' });
    g.currentPlayerIndex = 0;
    g.phase = 'PLAY';
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    const bad = mkCard(CardType.BANG, { suit: Suits.SPADES });
    const ok = mkCard(CardType.BANG, { suit: Suits.HEARTS });
    assert.equal(cardPlayability(g, g.players[0], 0, bad), false);
    assert.equal(cardPlayability(g, g.players[0], 0, ok), true);
    // Mimo svůj tah (hráč 1) se pravidlo neuplatní.
    assert.equal(cardPlayability(g, g.players[1], 1, bad), null);
});

// ── Nová identita ───────────────────────────────────────────────────────────

test('Nová identita: druhá postava se rozdá jen se zapnutými přibalenými kartami', () => {
    const g = mkExtraGame([{ role: 'Sheriff', character: 'Willy the Kid' },
                           { character: 'Slab the Killer' }, { character: 'Paul Regret' }]);
    g._dealSecondIdentities();
    g.players.forEach(p => {
        assert.ok(p._secondChar, 'každý má druhou postavu');
        assert.notEqual(p._secondChar, p.character);
    });
    assert.equal(new Set(g.players.map(p => p._secondChar)).size, 3, 'každá je jiná');

    const g2 = mkGame([{ role: 'Sheriff', character: 'Willy the Kid' }, { character: 'Paul Regret' }]);
    g2.highNoonCardData = hnData;
    g2.options = { expansions: { high_noon: true } };
    g2._dealSecondIdentities();
    assert.ok(!g2.players[0]._secondChar, 'bez highNoonExtra se nerozdává');
});

test('Nová identita: na začátku tahu se nabídne výměna', () => {
    const g = mkExtraGame([{ role: 'Sheriff', character: 'Willy the Kid' }, {}, {}],
                          { event: 'NOVA_IDENTITA' });
    g.players[0]._secondChar = 'Slab the Killer';
    g.currentPlayerIndex = 0;
    assert.equal(g._beginTurn(), true, 'start tahu se pozastaví');
    assert.equal(g.phase, 'NEW_IDENTITY');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'NEW_IDENTITY' });
    assert.equal(g.pendingNewIdentity.character, 'Slab the Killer');
});

test('Nová identita: ANO vymění postavu a hráč klesne na 2 životy', () => {
    const g = mkExtraGame([{ role: 'Sheriff', character: 'Willy the Kid' }, {}, {}],
                          { event: 'NOVA_IDENTITA' });
    g.players[0]._secondChar = 'Slab the Killer';
    g.currentPlayerIndex = 0;
    g._beginTurn();
    assert.equal(g.resolveNewIdentity(0, true), true);
    assert.equal(g.players[0].character, 'Slab the Killer');
    assert.equal(g.players[0]._secondChar, 'Willy the Kid', 'stará postava se odloží');
    assert.equal(g.players[0].health, 2);
    assert.equal(g.phase, 'DRAW', 'start tahu pokračuje fází lízání');
});

test('Nová identita: NE nechá všechno být', () => {
    const g = mkExtraGame([{ role: 'Sheriff', character: 'Willy the Kid' }, {}, {}],
                          { event: 'NOVA_IDENTITA' });
    g.players[0]._secondChar = 'Slab the Killer';
    g.currentPlayerIndex = 0;
    g._beginTurn();
    assert.equal(g.resolveNewIdentity(0, false), true);
    assert.equal(g.players[0].character, 'Willy the Kid');
    assert.equal(g.players[0]._secondChar, 'Slab the Killer');
    assert.equal(g.players[0].health, 4, 'životy zůstávají beze změny');
    assert.equal(g.phase, 'DRAW');
});

test('Nová identita: bez odložené postavy se nenabízí', () => {
    const g = mkExtraGame([{ role: 'Sheriff', character: 'Willy the Kid' }, {}, {}],
                          { event: 'NOVA_IDENTITA' });
    g.currentPlayerIndex = 0;
    assert.equal(g._beginTurn(), false);
    assert.notEqual(g.phase, 'NEW_IDENTITY');
});

test('Nová identita: výměna ruší kopii Very Custer a jde vrátit zpátky', () => {
    const g = mkExtraGame([{ role: 'Sheriff', character: 'Vera Custer' }, {}, {}],
                          { event: 'NOVA_IDENTITA' });
    g.players[0]._secondChar = 'Slab the Killer';
    g.players[0]._copiedCharacter = 'Willy the Kid';
    g.currentPlayerIndex = 0;
    g._beginTurn();
    g.resolveNewIdentity(0, true);
    assert.equal(g.players[0]._copiedCharacter, null);
    // Příští tah si smí vzít zpátky tu původní.
    g._beginTurn();
    assert.equal(g.pendingNewIdentity.character, 'Vera Custer');
    g.resolveNewIdentity(0, true);
    assert.equal(g.players[0].character, 'Vera Custer');
});
