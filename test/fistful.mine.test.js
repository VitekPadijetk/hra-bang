// Rozšíření A Fistful of Cards – fáze 5: Opuštěný důl.
// „Ve fázi lízání si hráč líže z odhazovacího balíčku; odhazované karty se pokládají
// lícem dolů na dobírací balíček."
//
// NENÍ to prosté prohození hromádek (FAQ Q03/Q04). Platí to jen na dvě přesná místa
// v tahu HRÁČE NA TAHU – fázi 1 (lízání) a fázi 3 (odhoz nad limit karet). Ve fázi 2
// jde všechno na odhoz jako vždycky (včetně Dostavníku, Krytého vozu a hokynářství,
// které naopak lížou z dobíracího balíčku), stejně tak kontrolní sejmutí na Dynamit,
// Vězení a Barel, schopnosti postav i pozůstalost vyřazeného hráče. Ostatní hráči
// lížou a odhazují úplně normálně.
//
// Jestli se důl v tomhle tahu vůbec uplatní, se rozhodne JEDNOU, na začátku fáze
// lízání: nejsou-li v odhozu karty na celé lízání, hráč si podle FAQ Q03 lízne
// všechno z dobíracího balíčku a odhazuje normálně.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');
const { pendingActor } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));
const ff = key => ffData.find(c => c.key === key);
const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));
const hn = key => hnData.find(c => c.key === key);

// Hra s aktivním dolem.
function mkMine(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.activeFistful = ff('OPUSTENY_DUL');
    return g;
}

// Odhoz zespoda nahoru: `cards[0]` leží úplně dole, poslední je navrchu → líže se první.
function discardStack(g, cards) {
    g.deck.discardPile = cards.slice();
    return cards;
}
const C = (v = '5', suit = Suits.CLUBS) => mkCard(CardType.BANG, { suit, value: v });

// ── Rozhodnutí „je tenhle tah důlní" ────────────────────────────────────────

test('Opuštěný důl: bez události se nerozhoduje nic', () => {
    const g = mkGame([{ role: 'Sheriff' }, {}]);
    g.deck.discardPile = [C('2'), C('3'), C('4')];
    g.deck.cards = [C('K'), C('Q')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, false);
    g.drawCard('deck');
    assert.equal(g.players[0].hand[0].value, 'Q', 'líže se z balíčku');
});

test('Opuštěný důl: s dostatkem karet v odhozu se tah stane důlním', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K'), C('Q')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, true);
});

test('Opuštěný důl: málo karet v odhozu → celý tah bez dolu (FAQ Q03)', () => {
    // „Když je v odhozu jen jedna karta, lízni obě z dobíracího balíčku a odhazuj jako
    // vždycky." Rozhoduje se JEDNOU, na začátku fáze lízání.
    const g = mkMine([{ role: 'Sheriff', health: 1 }, {}]);
    g.deck.discardPile = [C('2')];               // na dvě karty to nestačí
    g.deck.cards = [C('K'), C('Q'), C('J')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, false);
    g.drawCard('deck'); g.drawCard('deck');
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['J', 'Q'], 'obě z balíčku');
    assert.deepEqual(g.deck.discardPile.map(c => c.value), ['2'], 'odhozu se nikdo nedotkl');

    // …a na konci tahu se odhazuje taky normálně, do odhozu.
    g.tryEndTurn();
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0);
    assert.equal(g.deck.discardPile.length, 2, 'odhoz nad limit šel do odhozu');
});

test('Opuštěný důl: Žízeň (High Noon) sníží nárok na jednu kartu', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g.activeEvent = hn('ZIZEN');
    g.deck.discardPile = [C('2')];
    g.deck.cards = [C('K'), C('Q')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, true, 'líže se jen jedna a ta v odhozu je');
    g.drawCard('deck');
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['2']);
});

test('Opuštěný důl: platí přesně jeden tah, pak se rozhoduje znovu', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}], { current: 0 });
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K'), C('Q'), C('J'), C('T')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, true);
    g._beginTurn();
    assert.equal(g._mineTurn, false, '_beginTurn ho zahodí');
});

test('Opuštěný důl: nová hra ho zruší', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g._mineTurn = true;
    g._setupFistfulDeck({});          // bez zapnutého rozšíření = jen úklid
    assert.equal(g._mineTurn, false);
});

// ── Fáze 1: líže se z odhozu ────────────────────────────────────────────────

test('Opuštěný důl: líže se z odhozu, dobírací balíček zůstává ležet', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    const disc = discardStack(g, [C('2'), C('3'), C('4')]);
    g.deck.cards = [C('K')];
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['4', '3'], 'odhoz se bere odvrchu');
    assert.deepEqual(g.deck.discardPile.map(c => c.value), ['2'], 'v odhozu zbyla spodní karta');
    assert.deepEqual(g.deck.cards.map(c => c.value), ['K'], 'dobíracího balíčku se lízání nedotklo');
    assert.equal(disc.length, 3);
});

test('Opuštěný důl: Kit Carlson odkrývá z odhozu a nevybrané tam i vrací', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'Kit Carlson' }, {}]);
    g.deck.discardPile = [C('2'), C('3'), C('4'), C('5')];
    g.deck.cards = [C('K')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, true, 'odkrývá tři a ty v odhozu jsou');
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    assert.deepEqual(g.kitCarlsonState.revealed.map(c => c.value), ['5', '4', '3']);
    assert.equal(g.deck.discardPile.length, 1);
    g.kitCarlsonPick(0); g.kitCarlsonPick(1);
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['5', '4']);
    // Nevybraná se vrací navrch TÉ hromádky, ze které se brala – tedy do odhozu.
    assert.deepEqual(g.deck.discardPile.map(c => c.value), ['2', '3']);
    assert.equal(g.deck.cards.length, 1, 'na dobírací balíček se nic nevrátilo');
});

test('Opuštěný důl: Kit potřebuje v odhozu všechny tři odkrývané karty', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'Kit Carlson' }, {}]);
    g.deck.discardPile = [C('2'), C('3')];       // odkrývá 3, v odhozu jsou 2
    g.deck.cards = [C('K'), C('Q'), C('J')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, false);
    g.drawCard('deck');
    assert.deepEqual(g.kitCarlsonState.revealed.map(c => c.value), ['J', 'Q', 'K']);
});

test('Opuštěný důl: Pedro Ramirez volbu odhozu nedostane (byla by to táž karta)', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'Pedro Ramirez' }, {}]);
    g.deck.discardPile = [C('2'), C('3')];
    g.startDrawPhase();
    assert.deepEqual(g.drawPhaseState.options, ['deck']);

    // Bez dolu se nabízí normálně.
    const h = mkGame([{ role: 'Sheriff', character: 'Pedro Ramirez' }, {}]);
    h.deck.discardPile = [C('2')];
    h.deck.cards = [C('K'), C('Q')];
    h.startDrawPhase();
    assert.ok(h.drawPhaseState.options.includes('discard'));
});

// ── Fáze 3: odhazuje se lícem dolů na balíček ───────────────────────────────

test('Opuštěný důl: odhoz nad limit na konci tahu jde na dobírací balíček', () => {
    const g = mkMine([{ role: 'Sheriff', health: 1 }, {}], { phase: 'PLAY' });
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K')];
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    give(g, 0, CardType.BANG);
    const deckBefore = g.deck.cards.length;
    const discBefore = g.deck.discardPile.length;
    g.tryEndTurn();                      // limit = 1 život → odhodit dvě
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0); g.discardCard(0);
    assert.equal(g.deck.cards.length, deckBefore + 2, 'obě odhozené leží na balíčku');
    assert.equal(g.deck.discardPile.length, discBefore, 'do odhozu nepřibylo nic');
});

test('Opuštěný důl: odhozené karty leží NAVRCH balíčku (lízne je hned další)', () => {
    const g = mkMine([{ role: 'Sheriff', health: 1 }, {}], { phase: 'PLAY' });
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K')];
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const marked = mkCard(CardType.BEER, { value: 'X' });
    g.players[0].hand.push(marked);
    g.tryEndTurn();
    g.discardCard(g.players[0].hand.indexOf(marked));
    assert.equal(g.deck.cards[g.deck.cards.length - 1].value, 'X');
});

// ── Fáze 2: všechno normálně (FAQ Q04) ──────────────────────────────────────

test('Opuštěný důl: zahraná karta jde do ODHOZU, ne na balíček', () => {
    const g = mkMine([{ role: 'Sheriff', health: 3 }, {}, {}]);   // Pivo léčí až od tří hráčů
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K')];
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    g.phase = 'PLAY';
    const deckBefore = g.deck.cards.length;
    const beer = give(g, 0, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.deck.discardPile.length, 1, 'Pivo dosedlo do odhozu');
    assert.equal(g.deck.discardPile[0].type, CardType.BEER);
    assert.equal(g.deck.cards.length, deckBefore, 'na balíček nic nepřibylo');
});

test('Opuštěný důl: Dostavník líže z BALÍČKU (FAQ Q04)', () => {
    // Kdyby bral z odhozu, hráč by si líznul zpátky kartu, kterou právě zahrál –
    // Dostavník za Dostavníkem donekonečna a balíček přelitý do jedné ruky.
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K'), C('Q'), C('J'), C('T')];
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    g.phase = 'PLAY';
    g.players[0].hand.length = 0;
    const sc = give(g, 0, CardType.STAGECOACH);
    g.playCard(sc);
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck'); g.drawCard('deck');
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['T', 'J'], 'obě z balíčku');
    assert.equal(g.deck.discardPile.filter(c => c.type === CardType.STAGECOACH).length, 1,
                 'zahraný Dostavník leží v odhozu a zůstal tam');
});

test('Opuštěný důl: hokynářství rozdá z BALÍČKU', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}, {}]);
    g.deck.discardPile = [C('2'), C('3'), C('4'), C('5')];
    g.deck.cards = [C('9'), C('K'), C('Q'), C('J')];   // o kartu víc, ať se nemíchá
    g.startDrawPhase();
    assert.equal(g._mineTurn, true);
    g.openStore();
    assert.deepEqual(g.storeCards.map(c => c.value), ['J', 'Q', 'K']);
    assert.equal(g.deck.discardPile.length, 4, 'odhozu se hokynářství nedotklo');
});

test('Opuštěný důl: José Delgado odhazuje na odhoz a líže z balíčku (FAQ Q04)', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'José Delgado' }, {}]);
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K'), C('Q'), C('J')];
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    g.phase = 'PLAY';
    g.players[0].hand.length = 0;
    const barrel = give(g, 0, CardType.BARREL, { name: 'Barel' });
    assert.equal(g.useJoseDelgado(0, barrel), true);
    assert.equal(g.deck.discardPile.length, 1, 'modrá karta šla do odhozu');
    assert.equal(g.deck.discardPile[0].type, CardType.BARREL);
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck'); g.drawCard('deck');
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['J', 'Q'], 'obě z balíčku');
});

test('Opuštěný důl: pozůstalost vyřazeného hráče jde do odhozu', () => {
    const g = mkMine([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }], { current: 0 });
    give(g, 1, CardType.BANG); give(g, 1, CardType.MISSED);
    board(g, 1, CardType.BARREL);
    g.deck.discardPile = [C('2'), C('3')];
    g.startDrawPhase();
    g.phase = 'PLAY';
    const deckBefore = g.deck.cards.length;
    const discBefore = g.deck.discardPile.length;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.deck.discardPile.length, discBefore + 3, 'ruka i stůl mrtvého jsou v odhozu');
    assert.equal(g.deck.cards.length, deckBefore, 'na balíček nic nepřibylo');
});

// ── Kontrolní sejmutí: taky normálně ────────────────────────────────────────
// Sejmutí (draw!) není lízání ve fázi 1 a u Dynamitu s Vězením běží dokonce ještě
// PŘED ní, takže se ho důl netýká vůbec.

test('Opuštěný důl: sejmutí na Vězení bere z balíčku a karta jde do odhozu', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}], { current: 0 });
    board(g, 0, CardType.JAIL);
    g.deck.discardPile = [C('2'), C('3')];
    // Srdcová karta navrchu balíčku = hráč se z vězení dostane.
    g.deck.cards = [C('K'), mkCard(CardType.BANG, { suit: Suits.HEARTS, value: 'A' })];
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.deck.cards.length, 1, 'kontrolní karta se vzala z balíčku');
    g.resolveCheck();
    assert.equal(g.deck.discardPile.length, 4, 'sejmutá karta i Vězení šly do odhozu');
    assert.equal(g.players[0].board.length, 0, 'Vězení se odhodilo');
});

test('Opuštěný důl: Lucky Duke bere obě karty z balíčku a vrací je do odhozu', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'Lucky Duke' }, {}], { current: 0 });
    board(g, 0, CardType.JAIL);
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K'), C('Q'), C('J')];
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    assert.deepEqual(g.luckyDukeState.cards.map(c => c.value), ['J', 'Q']);
    assert.equal(g.deck.cards.length, 1);
    g.luckyDukePick(0);
    assert.equal(g.deck.discardPile.length, 5, 'obě sejmuté karty i Vězení jsou v odhozu');
});

// ── Ostatní hráči ───────────────────────────────────────────────────────────

test('Opuštěný důl: platí jen pro hráče na tahu', () => {
    const g = mkMine([{ role: 'Sheriff', health: 1 }, {}], { current: 0 });
    g.deck.discardPile = [C('2'), C('3')];
    g.deck.cards = [C('K'), C('Q')];
    g.startDrawPhase();
    assert.equal(g._mineTurn, true);
    // Soupeř se brání kartou Vedle! – jeho odhoz jde do ODHOZU, ne na balíček.
    g.phase = 'PLAY';
    const discBefore = g.deck.discardPile.length;
    const bang = give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 1, CardType.MISSED, { name: 'Vedle!' });
    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, 0);
    assert.equal(g.deck.discardPile.length, discBefore + 2, 'Bang! i Vedle! jsou v odhozu');
});

// ── Bot ─────────────────────────────────────────────────────────────────────

test('Opuštěný důl: bot líže i z hromádky, na které neleží Bang!/Pivo/Vedle!', () => {
    const g = mkMine([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    // Navrchu odhozu leží Vězení – bot ho jako Pedro nechtěl, ale teď je to zdroj
    // fáze 1 a musí si z něj líznout, jinak se hra zasekne.
    g.deck.discardPile = [C('2'), mkCard(CardType.JAIL)];
    g.deck.cards = [C('K')];
    g.startDrawPhase();
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'DRAW' });
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'draw_card');
    assert.equal(a.payload.source, 'deck');
});
