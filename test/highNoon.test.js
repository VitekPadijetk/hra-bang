// Rozšíření High Noon – balíček událostí a karty implementované v 1. etapě
// (Kazatel, Reverend, Přestřelka, Doktor, Žízeň, Příjezd vlaku, Pravé poledne).
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

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

test('Kit Carlson se Žízní: odkryje 2, nechá si 1, druhou vrátí na balíček', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Kit Carlson' }, {}], { event: 'ZIZEN' });
    g.deck.cards = [];
    for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS, String(i + 2));
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    assert.equal(g.kitCarlsonState.revealed.length, 2, 'odkryje o jednu víc, než si nechá');
    assert.equal(g.kitCarlsonState.needed, 1);
    const deckBefore = g.deck.cards.length;
    g.kitCarlsonPick(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.deck.cards.length, deckBefore + 1, 'nevybraná karta se vrátila');
});

test('Kit Carlson s Příjezdem vlaku: odkryje 4 a nechá si 3', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Kit Carlson' }, {}], { event: 'PRIJEZD_VLAKU' });
    g.deck.cards = [];
    for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS, String(i + 2));
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.kitCarlsonState.revealed.length, 4);
    g.kitCarlsonPick(0); g.kitCarlsonPick(1); g.kitCarlsonPick(2);
    assert.equal(g.players[0].hand.length, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Kit Carlson vrací nevybrané karty ve STEJNÉM pořadí (FAQ H6)', () => {
    const g = mkHnGame([{ role: 'Sheriff', character: 'Kit Carlson' }, {}], { event: 'ZIZEN' });
    g.deck.cards = [];
    // draw() bere z konce → odkryjí se hodnoty '9' a '8'; zbytek balíčku zůstane pod nimi.
    for (const v of ['2', '3', '8', '9']) topDeck(g, Suits.CLUBS, v);
    g.startDrawPhase();
    g.drawCard('deck');
    const revealedValues = g.kitCarlsonState.revealed.map(c => c.value);
    assert.deepEqual(revealedValues, ['9', '8']);
    g.kitCarlsonPick(0);   // nechá si '9', vrací '8'
    assert.deepEqual(g.deck.cards.map(c => c.value), ['2', '3', '8'], 'vrácená karta leží zase navrchu');
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
