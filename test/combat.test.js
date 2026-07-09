const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, give, board, topDeck, mkCard, CardType, Suits } = require('./_helpers.js');

// GameState hojně loguje – ztišíme.
before(() => { console.log = () => {}; });

// ── Bang! a obrana ──────────────────────────────────────────────────────────
test('Bang! → cíl zahraje Vedle! → žádné zranění, fáze zpět na PLAY', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    give(g, 1, CardType.MISSED); // Vedle! v ruce cíle na indexu 0

    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);

    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
});

test('Bang! → cíl nemá obranu a pasuje → 1 zranění', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);

    g.playBang(0, 1, bang);
    g.handleResponse(1, null); // pasování

    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].stats.bangsHit, 1);
});

test('Limit: druhý Bang! ve stejném tahu je zablokovaný', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BANG);

    g.playBang(0, 1, 0);        // první projde
    g.handleResponse(1, null);  // cíl 4→3
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);

    const handBefore = g.players[0].hand.length;
    g.playBang(0, 1, 0);        // druhý musí být no-op
    assert.equal(g.players[0].hand.length, handBefore); // karta nezmizela
    assert.equal(g.players[1].health, 3);               // beze změny
});

test('Willy the Kid může zahrát víc Bang! za tah', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Willy the Kid' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BANG);

    g.playBang(0, 1, 0);
    g.handleResponse(1, null);  // 4→3
    g.playBang(0, 1, 0);        // druhý projde díky Willymu
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);  // 3→2
    assert.equal(g.players[1].health, 2);
});

test('Calamity Janet může na Bang! odpovědět kartou Bang!', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Calamity Janet' }]);
    const bang = give(g, 0, CardType.BANG);
    give(g, 1, CardType.BANG); // místo Vedle! použije Bang!

    g.playBang(0, 1, bang);
    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4); // obrana platná
    assert.equal(g.phase, 'PLAY');
});

test('Slab the Killer vyžaduje 2× Vedle!', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    give(g, 1, CardType.MISSED);
    give(g, 1, CardType.MISSED);

    g.playBang(0, 1, bang);
    assert.equal(g.missesRequired, 2);

    g.handleResponse(1, 0); // první Vedle! nestačí
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[1].health, 4);

    g.handleResponse(1, 0); // druhé Vedle! vykryje
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
});

// ── Barel ───────────────────────────────────────────────────────────────────
test('Barel: srdce → výstřel vykryt, žádné zranění', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.HEARTS); // check karta = srdce → záchrana

    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'BARREL_DRAW');
    g.triggerBarrelDraw();
    assert.equal(g.phase, 'CHECKING');
    g.resolveCheck();

    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'PLAY');
});

test('Barel: jiná barva → hráč musí stejně zahrát Vedle!', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.SPADES); // ne-srdce → barel selhal

    g.playBang(0, 1, bang);
    g.triggerBarrelDraw();
    g.resolveCheck();

    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.requiredCard, CardType.MISSED);
});

test('Jourdonnais má vlastní barel (1 check) a s Barelem 2 checky', () => {
    const g1 = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Jourdonnais' }]);
    g1.deck.cards = []; topDeck(g1, Suits.SPADES);
    g1.playBang(0, 1, give(g1, 0, CardType.BANG));
    assert.equal(g1.pendingBarrelCheck.checksLeft, 1);

    const g2 = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Jourdonnais' }]);
    board(g2, 1, CardType.BARREL, { name: 'Barel' });
    g2.playBang(0, 1, give(g2, 0, CardType.BANG));
    assert.equal(g2.pendingBarrelCheck.checksLeft, 2);
});

// ── Zranění, smrt, odměny ────────────────────────────────────────────────────
test('Smrt: hráč na 1 HP dostane zásah → 0 HP, ruka i stůl jdou do odhozu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }]);
    give(g, 1, CardType.BEER);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    const discardBefore = g.deck.discardPile.length;

    g.handleDamage(1, 0);

    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.players[1].board.length, 0);
    assert.ok(g.deck.discardPile.length >= discardBefore + 2);
});

test('Smrt: skutečná zbraň padne do odhozu (nezmizí), Colt zpět na výchozí', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }]);
    g.players[1].weapon = mkCard(CardType.WEAPON, { id: 777, name: 'Volcanic', props: { range: 1 } });
    const discardBefore = g.deck.discardPile.length;

    g.handleDamage(1, 0);

    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1].weapon.id, -1);   // reset na Colt .45
    assert.ok(g.deck.discardPile.some(c => c.id === 777)); // zbraň se opravdu odhodila
    assert.ok(g.deck.discardPile.length >= discardBefore + 1);
});

test('Smrt s Vulture Samem: zbraň mrtvého si vezme Sam do ruky', () => {
    const g = mkGame([
        { role: 'Sheriff' },
        { role: 'Outlaw', health: 1 },
        { role: 'Renegade', character: 'Vulture Sam' },
    ]);
    g.players[1].weapon = mkCard(CardType.WEAPON, { id: 888, name: 'Schofield', props: { range: 2 } });

    g.handleDamage(1, 0);

    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1].weapon.id, -1);
    assert.ok(g.players[2].hand.some(c => c.id === 888)); // Sam má zbraň v ruce
});

test('Zabití banditi → vrah dostává odměnu 3 karty (DRAW, isKillReward)', () => {
    // 3. hráč (Odpadlík) musí žít, jinak smrt jediného bandity rovnou ukončí hru.
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Renegade' }]);
    const bang = give(g, 0, CardType.BANG);
    g.deck.cards = [];
    for (let i = 0; i < 3; i++) topDeck(g, Suits.CLUBS);

    g.playBang(0, 1, bang);
    g.handleResponse(1, null); // bandita umírá

    assert.equal(g.players[1].health, 0);
    assert.equal(g.winner, null);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isKillReward, true);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
});

test('Šerif zabije vlastního pomocníka → přijde o všechny karty', () => {
    const g = mkGame([
        { role: 'Sheriff' },
        { role: 'Deputy', health: 1 },
        { role: 'Outlaw' },
    ]);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BEER);
    board(g, 0, CardType.BARREL, { name: 'Barel' });

    g.handleDamage(1, 0); // šerif (0) zabíjí pomocníka (1)

    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.players[0].board.length, 0);
    assert.equal(g.players[0].weapon.id, -1);
    assert.equal(g.winner, null); // bandita ještě žije
});
