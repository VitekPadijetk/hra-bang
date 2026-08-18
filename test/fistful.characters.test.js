// Postavy rozšíření A Fistful of Cards: Claus "The Saint", Uncle Will, Johnny Kisch.
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));
const ev = (key) => hnData.find(c => c.key === key);

// Naplní balíček tolika kartami, aby bylo z čeho líznout.
function fillDeck(g, n = 20) {
    for (let i = 0; i < n; i++) g.deck.cards.push(mkCard(CardType.BANG, { value: String(i % 9 + 2) }));
}

// ── Claus "The Saint" ───────────────────────────────────────────────────────

test('Claus si lízne o kartu víc, než je hráčů, a rozdá po jedné ostatním', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    fillDeck(g);
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 5, '4 hráči → líže 5 karet (3 rozdá, 2 si nechá)');

    g.drawCard('deck');
    assert.equal(g.phase, 'CLAUS_GIVE');
    assert.equal(g.players[0].hand.length, 5, 'všech 5 karet je rovnou v ruce');
    assert.deepEqual(g.clausState.queue, [1, 2, 3], 'rozdává po směru od sebe');

    g.clausGive(0);
    assert.equal(g.players[1].hand.length, 1);
    g.clausGive(0);
    g.clausGive(0);
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[3].hand.length, 1);
    assert.equal(g.players[0].hand.length, 2, 'zbylé dvě karty si nechává');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.clausState, null);
});

test('Claus rozdává jen hráčům ve hře (vyřazené přeskočí)', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, { health: 0 }, {}, { health: 0 }]);
    fillDeck(g);
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 3, '1 živý soupeř + 2 ponechané');
    g.drawCard('deck');
    assert.deepEqual(g.clausState.queue, [2]);
    g.clausGive(0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
});

test('Žízeň (High Noon) mění jen kolik si Claus nechá', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}]);
    g.activeEvent = ev('ZIZEN');
    fillDeck(g);
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 3, '2 rozdané + 1 ponechaná');
    g.drawCard('deck');
    g.clausGive(0);
    g.clausGive(0);
    assert.equal(g.players[0].hand.length, 1);
});

test('bez jediného spoluhráče ve hře fáze lízání rovnou skončí', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, { health: 0 }]);
    fillDeck(g);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
});

test('Kocovina Clausovi schopnost vypne (líže klasicky 2)', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    g.players.forEach(p => { p._noAbility = true; });
    fillDeck(g);
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.equal(g.drawPhaseState.isClaus, undefined);
});

// ── Uncle Will ──────────────────────────────────────────────────────────────

test('Uncle Will zahraje libovolnou kartu jako Hokynářství, ale jen 1× za tah', () => {
    const g = mkGame([{ character: 'Uncle Will' }, {}, {}]);
    fillDeck(g);
    const idx = give(g, 0, CardType.MISSED);
    give(g, 0, CardType.BEER);
    assert.equal(g.useUncleWill(0, idx), true);
    assert.equal(g.phase, 'STORE');
    assert.equal(g.storeCards.filter(Boolean).length, 3, 'rozdá kartu každému ve hře');
    assert.equal(g.deck.discardPile.at(-1).type, CardType.MISSED, 'zaplacená karta jde do odhozu');

    // Druhý pokus ve stejném tahu neprojde (a to ani po dobrání hokynářství).
    g.phase = 'PLAY';
    assert.equal(g.useUncleWill(0, 0), false);
    // Nový tah → zase smí.
    g.turnId++;
    assert.equal(g.useUncleWill(0, 0), true);
});

test('Uncle Will: schopnost platí jen ve vlastním tahu a se zapnutou schopností', () => {
    const g = mkGame([{ character: 'Uncle Will' }, { character: 'Uncle Will' }]);
    fillDeck(g);
    give(g, 0, CardType.BANG);
    give(g, 1, CardType.BANG);
    assert.equal(g.useUncleWill(1, 0), false, 'hráč mimo tah nemůže');
    g.players[0]._noAbility = true;               // Kocovina
    assert.equal(g.useUncleWill(0, 0), false);
});

test('Uncle Will: Želízka pustí jen kartu zvolené barvy', () => {
    const g = mkGame([{ character: 'Uncle Will' }, {}]);
    g.activeEvent = ev('ZELIZKA');
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    fillDeck(g);
    const spade = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    assert.equal(g.useUncleWill(0, spade), false);
    const heart = give(g, 0, CardType.BANG, { suit: Suits.HEARTS });
    assert.equal(g.useUncleWill(0, heart), true);
});

// ── Johnny Kisch ────────────────────────────────────────────────────────────

test('Johnny Kisch vyložením zbraně odhodí stejnojmenné zbraně ostatních', () => {
    const g = mkGame([{ character: 'Johnny Kisch' }, {}, {}]);
    const mk = () => mkCard(CardType.WEAPON, { name: 'Winchester', props: { range: 5 } });
    g.players[1].weapon = mk();
    g.players[2].weapon = mkCard(CardType.WEAPON, { name: 'Schofield', props: { range: 2 } });
    const idx = give(g, 0, CardType.WEAPON, { name: 'Winchester', props: { range: 5 } });

    g.playCard(idx);
    assert.equal(g.players[0].weapon.name, 'Winchester', 'jeho vlastní zbraň zůstává');
    assert.equal(g.players[1].weapon.id, -1, 'stejnojmenná zbraň odešla do odhozu');
    assert.equal(g.players[2].weapon.name, 'Schofield', 'jiné jméno se nemaže');
    assert.ok(g.deck.discardPile.some(c => c.name === 'Winchester'));
});

test('Johnny Kisch smete i modré karty na stole u kohokoli', () => {
    const g = mkGame([{ character: 'Johnny Kisch' }, {}, {}]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    board(g, 2, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    const idx = give(g, 0, CardType.BARREL, { name: 'Barel' });

    g.playCard(idx);
    assert.equal(g.players[0].board.length, 1, 'jeho Barel leží na stole');
    assert.equal(g.players[1].board.length, 0, 'cizí Barel je pryč');
    assert.equal(g.players[2].board.length, 1, 'Mustang zůstává');
});

test('Johnny Kisch: vyložené Vězení odhodí ostatní Vězení (a osvobodí je)', () => {
    const g = mkGame([{ character: 'Johnny Kisch', role: 'Outlaw' }, { role: 'Deputy' }, { role: 'Renegade' }]);
    board(g, 2, CardType.JAIL, { name: 'Vězení' });
    const idx = give(g, 0, CardType.JAIL, { name: 'Vězení' });

    g.playSpecialCard(0, 1, idx);
    assert.equal(g.players[1].board.length, 1, 'nové Vězení leží před cílem');
    assert.equal(g.players[2].board.length, 0, 'staré Vězení odešlo do odhozu');
});

test('Johnny Kisch: schopnost platí jen jemu a jen se zapnutou schopností', () => {
    const g = mkGame([{}, { character: 'Johnny Kisch' }]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    const idx = give(g, 0, CardType.BARREL, { name: 'Barel' });
    g.playCard(idx);
    assert.equal(g.players[1].board.length, 1, 'kartu vyložil někdo jiný → nic se nemaže');

    const g2 = mkGame([{ character: 'Johnny Kisch' }, {}]);
    g2.players.forEach(p => { p._noAbility = true; });   // Kocovina
    board(g2, 1, CardType.BARREL, { name: 'Barel' });
    g2.playCard(give(g2, 0, CardType.BARREL, { name: 'Barel' }));
    assert.equal(g2.players[1].board.length, 1);
});

test('Johnny Kisch nachystá animaci odhozu pro server', () => {
    const g = mkGame([{ character: 'Johnny Kisch' }, {}]);
    const barrel = board(g, 1, CardType.BARREL, { name: 'Barel' });
    g.playCard(give(g, 0, CardType.BARREL, { name: 'Barel' }));
    assert.deepEqual(g._johnnyPurgeAnim, [{ playerIdx: 1, boardIdx: 1, cardId: barrel.id }]);
});
