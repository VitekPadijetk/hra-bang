const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── Hromadné útoky: obrana posune útok na dalšího ────────────────────────────
test('Kulomet: cíl vykryje Vedle!, útok jde na dalšího hráče', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    const gat = give(g, 0, CardType.GATLING);
    const vedle = give(g, 1, CardType.MISSED);

    g.playSpecialCard(0, null, gat);
    g.handleResponse(1, vedle);          // hráč 1 se ubrání → posun na 2
    assert.equal(g.pendingResponse.targetIdx, 2);
    g.handleResponse(2, null);           // hráč 2 schytá zásah

    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Indiáni!: cíl odpoví Bang!, útok jde na dalšího hráče', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    const ind = give(g, 0, CardType.INDIANS);
    const bang = give(g, 1, CardType.BANG);

    g.playSpecialCard(0, null, ind);
    g.handleResponse(1, bang);
    assert.equal(g.pendingResponse.targetIdx, 2);
    g.handleResponse(2, null);

    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.phase, 'PLAY');
});

// ── Cat Balou / Panika! na různé oblasti ─────────────────────────────────────
test('Cat Balou sebere cíli zbraň (oblast weapon)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.players[1].weapon = mkCard(CardType.WEAPON, { id: 60, name: 'Volcanic', props: { range: 1 } });
    const cb = give(g, 0, CardType.CAT_BALOU);

    g.playSpecialCard(0, 1, cb);
    g.resolveCardSelection(0, 'weapon', null);

    assert.equal(g.players[1].weapon.id, -1); // zpět na Colt .45
    assert.ok(g.deck.discardPile.some(c => c.id === 60));
});

test('Panika! na vzdálenost >1 se neprovede', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }, { role: 'Deputy' }]);
    const panic = give(g, 0, CardType.PANIC);
    give(g, 2, CardType.BEER); // cíl je vzdálen 2

    g.playSpecialCard(0, 2, panic);
    g.resolveCardSelection(0, 'hand', null); // distance 2 → odmítnuto

    assert.equal(g.players[2].hand.length, 1); // nic se neukradlo
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
});

// ── Vězení na nešerifa ───────────────────────────────────────────────────────
test('Vězení lze dát na nešerifa (přistane na stole cíle)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Outlaw' }]);
    const jail = give(g, 0, CardType.JAIL, { name: 'Vězení' });

    g.playSpecialCard(0, 1, jail);
    assert.equal(g.players[1].board.some(c => c.type === CardType.JAIL), true);
    assert.equal(g.players[0].hand.length, 0);
});

// ── El Gringo nekrade z prázdné ruky ─────────────────────────────────────────
test('El Gringo nezařadí krádež, když má útočník prázdnou ruku', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'El Gringo', health: 2 }]);
    give(g, 0, CardType.BANG); // jediná karta útočníka

    g.playBang(0, 1, 0);          // po výstřelu má útočník prázdnou ruku
    g.handleResponse(1, null);

    assert.equal(g.players[1].health, 1);
    assert.equal(g.pendingElGringoSteal, null);
    assert.equal(g.specialActionQueue.length, 0);
    assert.equal(g.phase, 'PLAY');
});

// ── Dynamit může zabít ───────────────────────────────────────────────────────
test('Dynamit může hráče zabít a tah pak přejde dál', () => {
    const g = mkGame([
        { role: 'Outlaw', health: 2 },
        { role: 'Sheriff' },
        { role: 'Renegade' },
    ]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = []; topDeck(g, Suits.SPADES, '5');

    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();                 // výbuch
    g.takeDynamiteHit(0);             // 2 → 1
    g.takeDynamiteHit(0);             // 1 → 0 → smrt

    assert.equal(g.players[0].health, 0);
    assert.equal(g.winner, null);
    assert.notEqual(g.currentPlayerIndex, 0); // tah se posunul z mrtvého
});

// ── Sid Ketchum: postupné odhození dvou karet léčí ───────────────────────────
test('sidKetchumDiscardOne: po dvou kartách +1 život', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Sid Ketchum', health: 2 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.MISSED);

    g.sidKetchumDiscardOne(0, 0);
    assert.equal(g.players[0].health, 2); // po první ještě nic
    g.sidKetchumDiscardOne(0, 0);
    assert.equal(g.players[0].health, 3); // po druhé +1
    assert.equal(g.players[0].hand.length, 0);
});

// ── Výměna zbraně ────────────────────────────────────────────────────────────
test('Zahrání zbraně odhodí předchozí zbraň do odhozu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.players[0].weapon = mkCard(CardType.WEAPON, { id: 60, name: 'Volcanic', props: { range: 1 } });
    const w = give(g, 0, CardType.WEAPON, { id: 61, name: 'Schofield', props: { range: 2 } });

    g.playCard(w);
    assert.equal(g.players[0].weapon.name, 'Schofield');
    assert.ok(g.deck.discardPile.some(c => c.id === 60)); // stará zbraň v odhozu
    assert.equal(g.players[0].hand.length, 0);
});

// ── Kulomet zahraný přes playCard ────────────────────────────────────────────
test('Kulomet zahraný přes playCard spustí obranu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const gat = give(g, 0, CardType.GATLING);

    g.playCard(gat);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.requiredCard, CardType.MISSED);
    assert.equal(g.pendingResponse.targetIdx, 1);
});
