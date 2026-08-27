const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, give, board, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── Pivo ────────────────────────────────────────────────────────────────────
test('Pivo léčí 1 život, pokud je hráč pod maximem', () => {
    // Tři hráči: ve dvou už Pivo žádný efekt nemá (pravidlo, viz test níž).
    const g = mkGame([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    const beer = give(g, 0, CardType.BEER);

    g.playCard(beer);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].hand.length, 0); // spotřebováno
});

test('Pivo na plném životě se nezahraje (zůstane v ruce)', () => {
    const g = mkGame([{ role: 'Sheriff', health: 4 }, { role: 'Outlaw' }]);
    const beer = give(g, 0, CardType.BEER);

    g.playCard(beer);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.players[0].hand.length, 1); // nezahráno
});

test('beerLastLifeSave: na 1 HP a >2 hráči zachrání, jinak ne', () => {
    // 3 hráči → záchrana možná
    const g = mkGame([
        { role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Renegade' },
    ], { phase: 'RESPOND' });
    g.pendingResponse = { active: true, originatorIdx: 0, targetIdx: 1, requiredCard: CardType.MISSED, sourceCard: CardType.BANG, responded: [] };
    const beer = give(g, 1, CardType.BEER);

    assert.equal(g.beerLastLifeSave(1, beer), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'PLAY');

    // 2 hráči → záchrana zakázaná
    const g2 = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }], { phase: 'RESPOND' });
    g2.pendingResponse = { active: true, originatorIdx: 0, targetIdx: 1, requiredCard: CardType.MISSED, sourceCard: CardType.BANG, responded: [] };
    const beer2 = give(g2, 1, CardType.BEER);
    assert.equal(g2.beerLastLifeSave(1, beer2), false);
});

test('Pivo: duch (Město duchů) se počítá za třetího hráče', () => {
    // Dva živí + duch na tahu = u stolu sedí tři, takže Pivo zase funguje.
    const g = mkGame([
        { role: 'Sheriff', health: 0 }, { role: 'Outlaw', health: 2 }, { role: 'Renegade' },
    ]);
    g.players[0]._ghost = true;
    g.eventDeck = [];
    const beer = give(g, 0, CardType.BEER);

    g.playCard(beer);
    assert.equal(g.players[0].health, 1);   // duch se léčit smí (isInPlay)

    // Bez ducha jsou to jen dva hráči a Pivo nemá efekt.
    const g2 = mkGame([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw', health: 2 }]);
    const beer2 = give(g2, 0, CardType.BEER);
    g2.playCard(beer2);
    assert.equal(g2.players[0].health, 2);
    assert.equal(g2.players[0].hand.length, 1);   // nezahráno
});

// ── Salon ───────────────────────────────────────────────────────────────────
test('Salon vyléčí všechny zraněné o 1', () => {
    const g = mkGame([
        { role: 'Sheriff', health: 2 },
        { role: 'Outlaw', health: 1 },
        { role: 'Renegade', health: 4 },
    ]);
    const saloon = give(g, 0, CardType.SALOON);

    g.playCard(saloon);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.players[2].health, 4); // plný zůstává
    assert.equal(g.players[0].hand.length, 0);
});

test('Salon se nezahraje, když nikdo není zraněný', () => {
    const g = mkGame([{ role: 'Sheriff', health: 4 }, { role: 'Outlaw', health: 4 }]);
    const saloon = give(g, 0, CardType.SALOON);
    g.playCard(saloon);
    assert.equal(g.players[0].hand.length, 1); // nezahráno
});

// ── Zbraň ───────────────────────────────────────────────────────────────────
test('Zahrání zbraně nahradí Colt .45 a nastaví dostřel', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const w = give(g, 0, CardType.WEAPON, { name: 'Volcanic', props: { range: 1 } });

    g.playCard(w);
    assert.equal(g.players[0].weapon.name, 'Volcanic');
    assert.equal(g.players[0].hand.length, 0);
});

// ── Panika! / Cat Balou ──────────────────────────────────────────────────────
test('Panika! ukradne kartu cíli na vzdálenost 1', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const panic = give(g, 0, CardType.PANIC);
    give(g, 1, CardType.BEER); // co se ukradne

    g.playSpecialCard(0, 1, panic);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'hand', null);

    assert.equal(g.players[1].hand.length, 0);
    assert.ok(g.players[0].hand.some(c => c.type === CardType.BEER));
    assert.equal(g.phase, 'PLAY');
});

test('Cat Balou odhodí kartu cíli', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const cb = give(g, 0, CardType.CAT_BALOU);
    give(g, 1, CardType.BEER);
    const discardBefore = g.deck.discardPile.length;

    g.playSpecialCard(0, 1, cb);
    g.resolveCardSelection(0, 'hand', null);

    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.deck.discardPile.length, discardBefore + 2); // Cat Balou + ukradená
    assert.equal(g.phase, 'PLAY');
});

// ── Duel ─────────────────────────────────────────────────────────────────────
test('Duel: cíl odpoví Bang!, vyzyvatel pasuje → vyzyvatel utrží zásah', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const duel = give(g, 0, CardType.DUEL);
    const targetBang = give(g, 1, CardType.BANG);

    g.playSpecialCard(0, 1, duel);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.requiredCard, CardType.BANG);
    assert.equal(g.pendingResponse.targetIdx, 1); // cíl odpovídá první

    g.handleResponse(1, targetBang); // cíl vrátí Bang! → míček zpět vyzyvateli
    assert.equal(g.pendingResponse.targetIdx, 0);

    g.handleResponse(0, null); // vyzyvatel nemá čím → schytá to
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
});

// ── Kulomet / Indiáni (hromadný útok) ────────────────────────────────────────
test('Kulomet: cíl bez Vedle! schytá 1 zranění, pak fáze PLAY', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const gat = give(g, 0, CardType.GATLING);

    g.playSpecialCard(0, null, gat);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.requiredCard, CardType.MISSED);

    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Indiáni!: cíl bez Bang! schytá 1 zranění', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const ind = give(g, 0, CardType.INDIANS);

    g.playSpecialCard(0, null, ind);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.requiredCard, CardType.BANG);

    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
});
