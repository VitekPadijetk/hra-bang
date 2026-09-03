const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// Naplň balíček tak, aby draw() (pop z konce) vracel karty v daném pořadí.
function deckInOrder(g, cards) {
    g.deck.cards = [...cards].reverse(); // první v `cards` se lízne první
}

// ── Dostavník / Wells Fargo ──────────────────────────────────────────────────
test('Dostavník nechá líznout 2 karty', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const sc = give(g, 0, CardType.STAGECOACH, { name: 'Dostavník' });
    deckInOrder(g, [mkCard(CardType.BANG), mkCard(CardType.BEER)]);

    g.playCard(sc);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY');
});

test('Wells Fargo nechá líznout 3 karty', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const wf = give(g, 0, CardType.WELLS_FARGO, { name: 'Wells Fargo' });
    deckInOrder(g, [mkCard(CardType.BANG), mkCard(CardType.BEER), mkCard(CardType.MISSED)]);

    g.playCard(wf);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    g.drawCard('deck'); g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 3);
    assert.equal(g.phase, 'PLAY');
});

// ── Kit Carlson: ukáže 3, nechá si 2 ─────────────────────────────────────────
test('Kit Carlson odhalí 3 karty a 2 si nechá, 1 vrátí do balíčku', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Kit Carlson' }, { role: 'Outlaw' }]);
    deckInOrder(g, [mkCard(CardType.BANG), mkCard(CardType.BEER), mkCard(CardType.MISSED)]);

    g.startDrawPhase();
    assert.equal(g.drawPhaseState.isKitCarlson, true);
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    assert.equal(g.kitCarlsonState.revealed.length, 3);

    g.kitCarlsonPick(0);
    g.kitCarlsonPick(1);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.deck.cards.length, 1); // nevybraná zpět do balíčku
    assert.equal(g.phase, 'PLAY');
});

// ── Black Jack: druhá karta červená → třetí navíc ────────────────────────────
test('Black Jack: červená druhá karta → lízne 3 karty', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Black Jack' }, { role: 'Outlaw' }]);
    deckInOrder(g, [
        mkCard(CardType.BANG, { suit: Suits.CLUBS }),     // 1.
        mkCard(CardType.BEER, { suit: Suits.DIAMONDS }),  // 2. červená → bonus
        mkCard(CardType.MISSED, { suit: Suits.CLUBS }),   // 3.
    ]);

    g.startDrawPhase();
    g.drawCard('deck');                 // 1. karta
    g.drawCard('deck');                 // 2. karta → kontrola
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    g.resolveBlackJack(true);           // červená → třetí
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck');                 // 3. karta
    assert.equal(g.players[0].hand.length, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Black Jack: černá druhá karta → jen 2 karty', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Black Jack' }, { role: 'Outlaw' }]);
    deckInOrder(g, [
        mkCard(CardType.BANG, { suit: Suits.CLUBS }),
        mkCard(CardType.BEER, { suit: Suits.SPADES }), // černá
    ]);

    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    g.resolveBlackJack(true);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY');
});

// ── Jesse Jones: první kartu z ruky soupeře ──────────────────────────────────
test('Jesse Jones lízne první kartu z ruky soupeře', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Jesse Jones' }, { role: 'Outlaw' }]);
    give(g, 1, CardType.BEER, { name: 'soupeřova' });
    g.deck.cards = [mkCard(CardType.BANG)]; // druhá z balíčku

    g.startDrawPhase();
    assert.ok(g.drawPhaseState.options.includes('opponent_hand'));
    g.drawCard('opponent_hand', 1);
    g.drawCard('deck');

    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[1].hand.length, 0); // soupeř o kartu přišel
    assert.ok(g.players[0].hand.some(c => c.name === 'soupeřova'));
});

// Regrese: Jesse Jones sebral Suzy poslední kartu z ruky → Suzy si musí líznout.
// Dřív se checkSuzyLafayette v této větvi nevolal a Suzy zůstala s prázdnou rukou
// (v logu: měla na začátku svého tahu 0 karet). Pořadí: Jesse 1. karta (Suzyina
// poslední) → Suzy si líže → teprve pak Jesse 2. karta z balíčku.
test('Jesse Jones vezme Suzy poslední kartu → Suzy si líže HNED, pak Jesse dobírá', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Jesse Jones' }, { role: 'Outlaw', character: 'Suzy Lafayette' }]);
    give(g, 1, CardType.BEER, { name: 'poslední' });
    g.deck.cards = [mkCard(CardType.BANG, { name: 'jesseho2' }), mkCard(CardType.BANG, { name: 'suzyina' })];

    g.startDrawPhase();
    g.drawCard('opponent_hand', 1);
    assert.equal(g.players[1].hand.length, 0);
    // Přerušení nastane HNED – Jesse má teprve 1 kartu, Suzy je na řadě.
    assert.equal(g.phase, 'SUZY_DRAW');
    assert.equal(g.pendingSuzyDraw.playerIdx, 1);
    assert.equal(g.drawPhaseState.cardsDrawn, 1);
    assert.equal(g.drawPhaseState.active, true);

    g.suzyLafayetteDraw(1);
    assert.equal(g.players[1].hand[0].name, 'suzyina');
    assert.equal(g.phase, 'DRAW');            // zpátky k Jesseho lízání
    assert.equal(g.drawPhaseState.playerIdx, 0);

    g.drawCard('deck');                       // Jesse dobral druhou kartu
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[0].hand[1].name, 'jesseho2');
});

// ── Pedro Ramirez: první kartu z odhazovacího balíčku ────────────────────────
test('Pedro Ramirez lízne první kartu z odhozu', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Pedro Ramirez' }, { role: 'Outlaw' }]);
    g.deck.discardPile = [mkCard(CardType.BEER, { name: 'z_odhozu' })];
    g.deck.cards = [mkCard(CardType.BANG)];

    g.startDrawPhase();
    assert.ok(g.drawPhaseState.options.includes('discard'));
    g.drawCard('discard');
    g.drawCard('deck');

    assert.equal(g.players[0].hand.length, 2);
    assert.ok(g.players[0].hand.some(c => c.name === 'z_odhozu'));
    assert.equal(g.deck.discardPile.length, 0);
});

// ── Došlé OBĚ hromádky ───────────────────────────────────────────────────────
// Když všechny karty skončí v rukou hráčů (Město duchů + Herb Hunter to umí – duchové
// odcházejí každé kolo a on si za každý odchod líže dvě karty), nemá draw() z čeho brát
// ani po zamíchání. Dřív se drawCard tiše vrátil, takže fáze DRAW neskončila NIKDY:
// klik na balíček nic neudělal a tah nešlo ukončit (bot klikal donekonečna – padalo to
// jako „hra nedoběhla, phase=DRAW" ~1× z 10 běhů zátěžových testů).

test('prázdné obě hromádky ukončí fázi lízání místo zaseknutí', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { current: 0 });
    g.deck.cards = [];
    g.deck.discardPile = [];
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY', 'fáze skončila, hráč může hrát dál');
    assert.equal(g.players[0].hand.length, 0);
});

test('došlé hromádky uprostřed lízání nechají to, co se stihlo', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { current: 0 });
    g.deck.cards = [mkCard(CardType.BANG)];
    g.deck.discardPile = [];
    g.startDrawPhase();
    g.drawCard('deck');            // první karta ještě byla
    assert.equal(g.phase, 'DRAW', 'druhá karta se pořád čeká');
    g.drawCard('deck');            // druhá už není z čeho
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 1);
});

test('Suzy Lafayette ani Bart Cassidy si z prázdna nelíznou null', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Suzy Lafayette' },
                      { role: 'Outlaw', character: 'Bart Cassidy' }], { current: 0 });
    g.deck.cards = [];
    g.deck.discardPile = [];
    g.phase = 'SUZY_DRAW';
    g.pendingSuzyDraw = { playerIdx: 0 };
    g.suzyLafayetteDraw(0);
    assert.deepEqual(g.players[0].hand, []);
    g.phase = 'BART_DRAW';
    g.pendingBartDraw = { playerIdx: 1 };
    g.bartCassidyDraw(1);
    assert.deepEqual(g.players[1].hand, []);
});
