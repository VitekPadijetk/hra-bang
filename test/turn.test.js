const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── Dynamit ──────────────────────────────────────────────────────────────────
test('Dynamit: piky 2–9 → výbuch, fáze DYNAMITE_DAMAGE, 3 zásahy', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = []; topDeck(g, Suits.SPADES, '5'); // piková 5 → výbuch

    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw();
    assert.equal(g.phase, 'CHECKING');
    g.resolveCheck();

    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 3);

    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 1); // 4 → 1
    assert.equal(g.phase, 'DRAW');         // pokračuje normální tah
});

test('Dynamit: smrt hráče → Herb Hunter lízne HNED (fronta), teprve pak další tah', () => {
    const g = mkGame([
        { role: 'Outlaw', health: 3 },                    // umře na dynamit (3 zásahy)
        { role: 'Sheriff', character: 'Herb Hunter' },    // lízne 2 za vyřazení
        { role: 'Renegade' },                             // aby hra po smrti bandity neskončila
    ], { current: 0 });
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    g.deck.cards.push(mkCard(CardType.BANG));   // rezerva
    g.deck.cards.push(mkCard(CardType.BANG));   // Herbova 2. karta
    g.deck.cards.push(mkCard(CardType.BANG));   // Herbova 1. karta
    g.deck.cards.push(mkCard(CardType.BANG, { suit: Suits.SPADES, value: '5' })); // check (vrch) → výbuch

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');

    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);                        // hráč 0 umře

    assert.equal(g.players[0].health, 0);
    // Herbova odměna běží HNED (fronta), tah se ještě NEposunul k dalšímu hráči
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
    assert.equal(g.drawPhaseState.isKillReward, true);
    assert.equal(g.currentPlayerIndex, 0);
    const herbHandBefore = g.players[1].hand.length;

    g.drawCard('deck');
    g.drawCard('deck');                          // Herb dobral 2 → teprve teď se posune tah

    assert.equal(g.players[1].hand.length, herbHandBefore + 2);
    assert.equal(g.currentPlayerIndex, 1);       // tah se posunul na dalšího živého (Herb)
});

test('Dynamit: jiná barva → přejde na dalšího hráče, tah pokračuje', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = []; topDeck(g, Suits.HEARTS, '5'); // srdce → nevybuchne

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();

    assert.equal(g.players[0].board.some(c => c.type === CardType.DYNAMITE), false);
    assert.equal(g.players[1].board.some(c => c.type === CardType.DYNAMITE), true);
    assert.equal(g.phase, 'DRAW'); // hráč 0 pokračuje v tahu
    assert.equal(g.players[0].health, 4);
});

test('Dynamit: nelze posunout (všichni ho mají) → zůstává u hráče, check jen 1×', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    board(g, 1, CardType.DYNAMITE, { name: 'Dynamit' }); // soupeř má taky → nelze posunout
    g.deck.cards = []; topDeck(g, Suits.HEARTS, '5'); topDeck(g, Suits.HEARTS, '6'); // rezerva + check (nevybuchne)

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();

    // Dynamit zůstal u hráče 0 (jen jeden), nepřesunul se, hráč pokračuje v tahu.
    assert.equal(g.players[0].board.filter(c => c.type === CardType.DYNAMITE).length, 1);
    assert.equal(g.players[1].board.filter(c => c.type === CardType.DYNAMITE).length, 1);
    assert.equal(g.phase, 'DRAW');       // žádné zacyklení – check proběhl jen jednou
    assert.equal(g.players[0].health, 4);
});

// ── Vězení ───────────────────────────────────────────────────────────────────
test('Vězení: srdce → hráč se vyplatí a hraje (DRAW)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    g.deck.cards = []; topDeck(g, Suits.HEARTS, '5');

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();

    assert.equal(g.players[0].board.some(c => c.type === CardType.JAIL), false);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.currentPlayerIndex, 0); // hraje dál
});

test('Vězení: jiná barva → hráč přeskočí tah', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    g.deck.cards = []; topDeck(g, Suits.SPADES, '5');
    g.players[1].board = []; // jistota, ať druhý nemá check

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();

    assert.equal(g.players[0].board.some(c => c.type === CardType.JAIL), false);
    assert.equal(g.currentPlayerIndex, 1); // tah přeskočen na hráče 1
});

test('Vězení nelze dát na šerifa (karta se vrátí do ruky)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
    const jail = give(g, 0, CardType.JAIL, { name: 'Vězení' });

    g.playSpecialCard(0, 1, jail);
    assert.equal(g.players[1].board.some(c => c.type === CardType.JAIL), false);
    assert.equal(g.players[0].hand.length, 1); // vrátilo se
});

// ── Lucky Duke: u kontroly lízne 2 a vybere si ──────────────────────────────
test('Lucky Duke lízne u dynamitu 2 karty a vybere si příznivou (nevybuchne)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Lucky Duke' }, { role: 'Outlaw' }]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    topDeck(g, Suits.SPADES, '5');  // nepříznivá (výbuch) – lízne jako druhá
    topDeck(g, Suits.HEARTS, '5');  // příznivá – lízne jako první

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    assert.equal(g.luckyDukeState.cards.length, 2);

    g.luckyDukePick(0); // vybere srdce → dynamit nevybuchne, předá se dál
    assert.equal(g.players[0].board.some(c => c.type === CardType.DYNAMITE), false);
    assert.equal(g.players[1].board.some(c => c.type === CardType.DYNAMITE), true);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.phase, 'DRAW');
});

test('Lucky Duke: vybraná karta leží v odhozu NAD nevybranou (pořadí animace)', () => {
    // Klient obě karty odhazuje ve stejném pořadí: nevybraná odletí hned, vybraná se
    // ještě „sejme" uprostřed obrazovky a dosedne až po ní (viz playLuckyDukeResult).
    const g = mkGame([{ role: 'Sheriff', character: 'Lucky Duke' }, { role: 'Outlaw' }]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    topDeck(g, Suits.SPADES, '5');
    topDeck(g, Suits.HEARTS, '5');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    const chosen = g.luckyDukeState.cards[0], other = g.luckyDukeState.cards[1];

    g.luckyDukePick(0);
    const dp = g.deck.discardPile;
    assert.equal(dp[dp.length - 1].id, chosen.id, 'vybraná je navrchu');
    assert.equal(dp[dp.length - 2].id, other.id, 'nevybraná leží pod ní');
});

// ── Konec tahu / odhazování ──────────────────────────────────────────────────
test('tryEndTurn: přebytek karet → fáze DISCARD, jinak další tah', () => {
    const g = mkGame([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.BEER); // 3 karty > 2 HP

    g.tryEndTurn();
    assert.equal(g.phase, 'DISCARD');
});

test('tryEndTurn mimo hraní/odhazování nic neudělá (opožděný klik na pomalé lince)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'DRAW' });
    g.tryEndTurn();
    assert.equal(g.phase, 'DRAW');            // lízání se nesmí přeskočit
    assert.equal(g.currentPlayerIndex, 0);
});

test('discardCard sníží ruku na limit a předá tah', () => {
    const g = mkGame([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }], { phase: 'DISCARD' });
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.BEER);

    g.discardCard(0); // 3 → 2, pořád > limit? 2 <= 2 → další tah
    assert.equal(g.currentPlayerIndex, 1);
});

test('nextTurn přeskočí mrtvého hráče', () => {
    const g = mkGame([
        { role: 'Sheriff' },
        { role: 'Outlaw', health: 0 },
        { role: 'Renegade' },
    ]);
    g.deck.cards = []; topDeck(g, Suits.CLUBS); topDeck(g, Suits.CLUBS);

    g.nextTurn(); // z 0 → 1 (mrtvý) → 2
    assert.equal(g.currentPlayerIndex, 2);
});
