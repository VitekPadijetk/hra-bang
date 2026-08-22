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

test('Claus odkryje řadu naráz a rozdělí ji – nejdřív sobě, pak po směru', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    fillDeck(g);
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 1, 'celá řada se odkryje jedním klikem');
    assert.equal(g.drawPhaseState.clausKeep, 2);

    g.drawCard('deck');
    assert.equal(g.phase, 'CLAUS_GIVE');
    assert.equal(g.clausState.revealed.length, 5, '4 hráči → 3 rozdané + 2 ponechané');
    assert.equal(g.players[0].hand.length, 0, 'karty leží na stole, ne v ruce');
    assert.equal(g.clausState.toIdx, 0, 'nejdřív si bere pro sebe');
    assert.deepEqual(g.clausState.queue, [1, 2, 3], 'pak rozdává po směru od sebe');

    g.clausPick(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.clausState.toIdx, 0, 'druhá karta je pořád pro něj');
    g.clausPick(1);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.clausState.toIdx, 1, 'teď je na řadě soused po směru');

    g.clausPick(2);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.clausState.toIdx, 2);
    g.clausPick(3);
    g.clausPick(4);
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[3].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.clausState, null);
});

test('Claus nemůže vzít tutéž kartu dvakrát', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}]);
    fillDeck(g);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.clausPick(0), true);
    assert.equal(g.clausPick(0), false, 'slot je už rozdaný');
    assert.equal(g.clausPick(99), false, 'mimo řadu');
    assert.equal(g.players[0].hand.length, 1);
});

test('Claus rozdává jen hráčům ve hře (vyřazené přeskočí)', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, { health: 0 }, {}, { health: 0 }]);
    fillDeck(g);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.clausState.revealed.length, 3, '1 živý soupeř + 2 ponechané');
    assert.deepEqual(g.clausState.queue, [2]);
    g.clausPick(0); g.clausPick(1);
    assert.equal(g.clausState.toIdx, 2);
    g.clausPick(2);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[2].hand.length, 1);
});

test('Žízeň (High Noon) mění jen kolik si Claus nechá', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}]);
    g.activeEvent = ev('ZIZEN');
    fillDeck(g);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.clausState.revealed.length, 3, '2 rozdané + 1 ponechaná');
    assert.equal(g.clausState.keep, 1);
    g.clausPick(0);
    assert.equal(g.clausState.toIdx, 1, 'po jedné kartě pro sebe už rozdává');
    g.clausPick(1); g.clausPick(2);
    assert.equal(g.players[0].hand.length, 1);
});

test('bez jediného spoluhráče ve hře si Claus vezme jen svoje karty', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, { health: 0 }]);
    fillDeck(g);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.clausState.revealed.length, 2);
    assert.deepEqual(g.clausState.queue, []);
    g.clausPick(0); g.clausPick(1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
});

test('došlý balíček: přednost mají karty, které si Claus nechává', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    // Jen 3 karty celkem (a nic v odhozu k domíchání) – z 5 se odkryjí tři.
    for (let i = 0; i < 3; i++) g.deck.cards.push(mkCard(CardType.BANG));
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.clausState.revealed.length, 3);
    assert.equal(g.clausState.keep, 2, 'dvě si nechá');
    assert.deepEqual(g.clausState.queue, [1], 'na jednoho souseda zbyla jedna karta');
    g.clausPick(0); g.clausPick(1); g.clausPick(2);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[1].hand.length, 1);
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

// ── Došlý balíček uprostřed odkrývání řady (Kit Carlson / Claus) ────────────
// Odkrytá řada se rozdává stejně jako hokynářství: co v balíčku bylo, se odkryje hned,
// pak se zamíchá (klientská cinematika, hra na ni čeká) a teprve pak dorazí zbytek.
// `_revealAnim` je jediný zdroj pravdy o tom, jak se to má rozdělit – a zároveň potlačí
// legacy reshuffle_anim, aby se míchání nepřehrálo dvakrát.

function mkDeck(g, deckN, discardN) {
    g.deck.cards = Array.from({ length: deckN }, () => mkCard(CardType.BANG));
    g.deck.discardPile = Array.from({ length: discardN }, () => mkCard(CardType.BEER));
}

test('Claus: dost karet v balíčku → odkryje se všechno naráz, nemíchá se', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    mkDeck(g, 12, 4);
    g.startDrawPhase();
    g.drawCard('deck');
    const a = g.clausState.anim;
    assert.strictEqual(g.clausState.revealed.length, 5);
    assert.strictEqual(a.mode, 'none');
    assert.strictEqual(a.dealtBefore, 5);
    assert.strictEqual(a.origCount, 12);
    assert.strictEqual(g.deck._reshuffleOccurred, false, 'legacy reshuffle_anim je potlačený');
});

test('Claus: balíček se vyprázdní poslední kartou → míchá se až po rozdání', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    mkDeck(g, 5, 6);
    g.startDrawPhase();
    g.drawCard('deck');
    const a = g.clausState.anim;
    assert.strictEqual(g.clausState.revealed.length, 5);
    assert.strictEqual(a.mode, 'proactive');
    assert.strictEqual(a.dealtBefore, 5);
    assert.ok(a.shuffleCount > 0, 'míchání se zaznamenalo pro cinematiku');
});

test('Claus: v balíčku je míň karet → odkryje se jen ono, pak míchání, pak zbytek', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    mkDeck(g, 2, 9);
    g.startDrawPhase();
    g.drawCard('deck');
    const a = g.clausState.anim;
    assert.strictEqual(g.clausState.revealed.length, 5, 'nakonec je odkrytých všech pět');
    assert.strictEqual(a.mode, 'blocking');
    assert.strictEqual(a.dealtBefore, 2, 'první dvě z původního balíčku');
    assert.strictEqual(a.origCount, 2);
    assert.ok(a.shuffleCount > 0);
});

test('Claus: prázdný balíček → nejdřív míchání, teprve pak celá řada', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    mkDeck(g, 0, 9);
    g.startDrawPhase();
    g.drawCard('deck');
    const a = g.clausState.anim;
    assert.strictEqual(a.mode, 'blocking');
    assert.strictEqual(a.dealtBefore, 0);
    assert.strictEqual(g.clausState.revealed.length, 5);
});

test('Claus: nedostatek karet i po zamíchání → odkryje se, co je, a výběr dojde', () => {
    const g = mkGame([{ character: 'Claus the Saint' }, {}, {}, {}]);
    mkDeck(g, 1, 2);   // celkem 3 karty na 5 potřebných
    g.startDrawPhase();
    g.drawCard('deck');
    assert.strictEqual(g.clausState.revealed.length, 3);
    assert.strictEqual(g.clausState.keep, 2, 'co si nechává má přednost');
    assert.strictEqual(g.clausState.queue.length, 1, 'zbyde na jednoho obdarovaného');
    assert.strictEqual(g.clausState.anim.mode, 'blocking');
});

test('Kit Carlson: došlý balíček rozdělí odkrývání stejně jako u Clause', () => {
    const g = mkGame([{ character: 'Kit Carlson' }, {}, {}]);
    mkDeck(g, 1, 9);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.strictEqual(g.phase, 'KIT_CARLSON');
    assert.strictEqual(g.kitCarlsonState.revealed.length, 3);
    assert.strictEqual(g.kitCarlsonState.anim.mode, 'blocking');
    assert.strictEqual(g.kitCarlsonState.anim.dealtBefore, 1);
    assert.strictEqual(g.deck._reshuffleOccurred, false);
});

test('Kit Carlson: došlý balíček i odhoz → nechá si jen to, co se odkrylo', () => {
    const g = mkGame([{ character: 'Kit Carlson' }, {}, {}]);
    mkDeck(g, 0, 1);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.strictEqual(g.kitCarlsonState.revealed.length, 1);
    assert.strictEqual(g.kitCarlsonState.needed, 1, 'výběr musí jít dokončit');
    g.kitCarlsonPick(0);
    assert.strictEqual(g.phase, 'PLAY');
    assert.strictEqual(g.players[0].hand.length, 1);
});
