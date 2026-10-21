// Sloučení odložených líznutí (logic/characters.js _processSpecialQueue): víc líznutí
// po 1 kartě za sebou pro téhož hráče jde jako JEDNA fáze lízání na N karet, aby šla
// naklikat rychle za sebou (hlášení: „líznu 2 a pak je to vždy líznutí + čekání").
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, topDeck, Suits } = require('./_helpers.js');
const { waitingStatus } = require('../core/pending.js');

before(() => { console.log = () => {}; });

function deck(g, n) { for (let i = 0; i < n; i++) topDeck(g, Suits.CLUBS, String(2 + i)); }

test('dvě líznutí Madam Yto za sebou = jedna fáze lízání na 2 karty', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Madam Yto' }]);
    deck(g, 4);
    g.specialActionQueue.push({ type: 'YTO_DRAW', playerIdx: 1 }, { type: 'YTO_DRAW', playerIdx: 1 });
    assert.equal(g._processSpecialQueue(), true);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.equal(g.drawPhaseState.isStartOfTurn, false);
    assert.match(waitingStatus(g).text || waitingStatus(g), /Madam Yto – líže 2 karty/);
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.players[1].hand.length, 2);
    assert.equal(g.phase, 'PLAY', 'vrací se do přerušené fáze');
    assert.equal(g.specialActionQueue.length, 0);
});

test('samotné líznutí zůstává ve své fázi (beze změny)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Bart Cassidy' }, { role: 'Outlaw' }]);
    deck(g, 2);
    g.specialActionQueue.push({ type: 'BART_DRAW', playerIdx: 0 });
    g._processSpecialQueue();
    assert.equal(g.phase, 'BART_DRAW');
});

test('slévá se jen souvislý úsek téhož hráče – pořadí vůči ostatním akcím drží', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Bart Cassidy' }, { role: 'Outlaw', character: 'Bart Cassidy' }]);
    deck(g, 6);
    g.specialActionQueue.push(
        { type: 'BART_DRAW', playerIdx: 0 }, { type: 'UHYB_DRAW', playerIdx: 0 },
        { type: 'BART_DRAW', playerIdx: 1 }, { type: 'BART_DRAW', playerIdx: 0 });
    g._processSpecialQueue();
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.deepEqual(g.drawPhaseState.queuedDraw, ['Bart Cassidy', 'Úhyb']);
    g.drawCard('deck'); g.drawCard('deck');
    // Další v řadě je hráč 1 se samostatným líznutím, teprve pak zase hráč 0.
    assert.equal(g.phase, 'BART_DRAW');
    assert.equal(g.pendingBartDraw.playerIdx, 1);
    g.bartCassidyDraw(1);
    assert.equal(g.phase, 'BART_DRAW');
    assert.equal(g.pendingBartDraw.playerIdx, 0);
});

test('Suzy Lafayette se neslévá – prázdnou ruku posoudí až po ostatních líznutích', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Suzy Lafayette' }, { role: 'Outlaw' }]);
    deck(g, 4);
    g.specialActionQueue.push(
        { type: 'UHYB_DRAW', playerIdx: 0 }, { type: 'UHYB_DRAW', playerIdx: 0 },
        { type: 'SUZY_DRAW', playerIdx: 0 });
    g._processSpecialQueue();
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    g.drawCard('deck'); g.drawCard('deck');
    // Suzy už karty má, takže její líznutí propadlo.
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
});

test('sloučené líznutí uprostřed cizího tahu vrátí fázi, kterou přerušilo', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Bart Cassidy' }], { phase: 'PLAY', current: 0 });
    deck(g, 3);
    g.phase = 'DISCARD';
    g.specialActionQueue.push({ type: 'BART_DRAW', playerIdx: 1 }, { type: 'BART_DRAW', playerIdx: 1 }, { type: 'BART_DRAW', playerIdx: 1 });
    g._processSpecialQueue();
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    g.drawCard('deck'); g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[1].hand.length, 3);
    assert.equal(g.phase, 'DISCARD');
});
