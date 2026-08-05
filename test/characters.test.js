const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── Bart Cassidy: za každý zásah líznutí ─────────────────────────────────────
test('Bart Cassidy si po zásahu lízne kartu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Bart Cassidy', health: 2 }]);
    const bang = give(g, 0, CardType.BANG);
    g.deck.cards = []; topDeck(g, Suits.CLUBS);

    g.playBang(0, 1, bang);
    g.handleResponse(1, null); // zásah → Bart do fronty
    assert.equal(g.phase, 'BART_DRAW');

    g.bartCassidyDraw(1);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

// ── El Gringo: ukradne útočníkovi kartu ──────────────────────────────────────
test('El Gringo po zásahu ukradne útočníkovi kartu z ruky', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'El Gringo', health: 2 }]);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BEER); // zbyde útočníkovi po výstřelu, tohle El Gringo ukradne

    g.playBang(0, 1, 0);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'EL_GRINGO_STEAL');

    g.elGringoSteal(1);
    assert.equal(g.players[1].hand.length, 1); // ukradl
    assert.equal(g.players[0].hand.length, 0); // útočník přišel o kartu
    assert.equal(g.phase, 'PLAY');
});

// ── Suzy Lafayette: prázdná ruka → líznutí ───────────────────────────────────
test('Suzy Lafayette si po vyprázdnění ruky lízne kartu', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Suzy Lafayette', health: 2 }, { role: 'Outlaw' }]);
    const beer = give(g, 0, CardType.BEER); // jediná karta
    g.deck.cards = []; topDeck(g, Suits.CLUBS);

    g.playCard(beer); // ruka se vyprázdní → Suzy do fronty
    assert.equal(g.phase, 'SUZY_DRAW'); // čeká na líznutí (samostatný krok)

    g.suzyLafayetteDraw(0);
    assert.equal(g.players[0].hand.length, 1); // líznula novou
    assert.equal(g.phase, 'PLAY');
});

// ── Sid Ketchum: odhodí 2 karty → +1 život ───────────────────────────────────
test('Sid Ketchum odhodí 2 karty a vyléčí si 1 život', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Sid Ketchum', health: 2 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.MISSED);

    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].hand.length, 0);
});

test('Sid Ketchum se nevyléčí nad maximum', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Sid Ketchum', health: 4 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.MISSED);
    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.players[0].hand.length, 2); // nic se neodhodilo
});

// ── Vulture Sam: bere karty po mrtvých ───────────────────────────────────────
test('Vulture Sam sebere ruku i stůl mrtvého hráče', () => {
    const g = mkGame([
        { role: 'Outlaw', character: 'Vulture Sam' },
        { role: 'Outlaw', health: 0 },
        { role: 'Sheriff' },
    ]);
    give(g, 1, CardType.BEER);
    board(g, 1, CardType.BARREL, { name: 'Barel' });

    g.handlePlayerDeath(1);
    assert.equal(g.players[0].hand.length, 2); // sebral 1 z ruky + 1 ze stolu
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.players[1].board.length, 0);
});

// ── Dva Vulture Samové (Vulture Sam + Vera Custer, která ho kopíruje) ─────────
// Karty mrtvého se DĚLÍ: bere se střídavě po jedné, začíná ten, kdo je za mrtvým
// první po směru hodinových ručiček. Odměna za banditu (3 karty) až po rozdělení.
test('Dva Vulture Samové si karty mrtvého dělí střídavě, začíná první po směru', () => {
    const g = mkGame([
        { role: 'Sheriff' },                                     // 0 = zabiják
        { role: 'Outlaw', health: 0 },                           // 1 = mrtvý
        { role: 'Deputy', character: 'Vulture Sam' },            // 2 = první za mrtvým
        { role: 'Renegade', character: 'Vera Custer' },          // 3 = druhý
    ]);
    g.players[3]._copiedCharacter = 'Vulture Sam';
    g.players[3]._veraCopiedTurn = g.turnId;
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.BANG);
    board(g, 1, CardType.BARREL, { name: 'Barel' });

    g.handlePlayerDeath(1, 0);
    // Karty zůstávají u mrtvého, dokud si je Samové nerozeberou.
    assert.equal(g.players[1].hand.length, 2);
    assert.equal(g.players[1].board.length, 1);

    g._processSpecialQueue();
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.attackerIdx, 2);   // první za mrtvým

    g.resolveCardSelection(2, 'board', 0);             // Sam bere Barel ze stolu
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.pendingSelection.attackerIdx, 3);   // teď Vera

    g.resolveCardSelection(3, 'hand', null);           // náhodná z ruky
    assert.equal(g.players[3].hand.length, 1);
    assert.equal(g.pendingSelection.attackerIdx, 2);   // zase Sam

    g.resolveCardSelection(2, 'hand', null);           // poslední karta
    assert.equal(g.players[2].hand.length, 2);
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.pendingVultureSplit, null);
    assert.equal(g._pendingDeathReveal, 1);            // server dohraje odhalení role

    // Teprve teď odměna za zabitého banditu (3 karty pro hráče na tahu).
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isKillReward, true);
    assert.equal(g.drawPhaseState.playerIdx, 0);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    // …a po dolíznutí se hra musí vrátit do hraní. Dřív si fronta zapamatovala
    // přechodné "SELECTING_TARGET_CARD" (s pendingSelection už null) a hra uvázla
    // ve fázi, kde se nečekalo na nikoho.
    assert.equal(g.interruptedPhase, 'PLAY');
    for (let i = 0; i < 5; i++) g.deck.cards.push(mkCard(CardType.BANG));
    g.drawCard('deck'); g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingSelection, null);
});

test('Dělení Vulture Samů bez odměny za banditu se taky vrátí do hraní', () => {
    const g = mkGame([
        { role: 'Sheriff' },
        { role: 'Deputy', health: 0 },                   // pomocník → žádná odměna
        { role: 'Outlaw', character: 'Vulture Sam' },
        { role: 'Renegade', character: 'Vera Custer' },
    ]);
    g.players[3]._copiedCharacter = 'Vulture Sam';
    give(g, 1, CardType.BEER);
    give(g, 1, CardType.BANG);

    g.handlePlayerDeath(1, 0);
    g._processSpecialQueue();
    g.resolveCardSelection(2, 'hand', null);
    g.resolveCardSelection(3, 'hand', null);

    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingVultureSplit, null);
    assert.equal(g.pendingSelection, null);
    assert.equal(g.interruptedPhase, null);
});

test('Dva Vulture Samové: mrtvý bez karet → žádné dělení, hra běží dál', () => {
    const g = mkGame([
        { role: 'Sheriff' },
        { role: 'Outlaw', health: 0 },
        { role: 'Deputy', character: 'Vulture Sam' },
        { role: 'Renegade', character: 'Vera Custer' },
    ]);
    g.players[3]._copiedCharacter = 'Vulture Sam';
    g.players[3]._veraCopiedTurn = g.turnId;

    g.handlePlayerDeath(1, 0);
    assert.equal(g.pendingVultureSplit, null);
    assert.ok(!g.specialActionQueue.some(a => a.type === 'VULTURE_SPLIT'));
});
