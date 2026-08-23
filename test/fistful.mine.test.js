// Rozšíření A Fistful of Cards – fáze 5: Opuštěný důl.
// „Ve fázi lízání si hráč líže z odhazovacího balíčku; odhazované karty se pokládají
// lícem dolů na dobírací balíček." Výklad R7: hromádky si po CELÉ kolo vymění role
// a platí to bez výjimek (fáze lízání, kontrolní sejmutí, Lucky Duke, hokynářství,
// odměny, pozůstalost vyřazeného) – dokud odhoz nedojde.
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

// Hra s aktivním dolem. `_syncMine()` zrcadlí to, co ve hře udělá `_flipEvent` hned
// za odkrytím karty – bez něj by prohození hromádek neplatilo.
function mkMine(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.activeFistful = ff('OPUSTENY_DUL');
    g._syncMine();
    return g;
}

// Odhoz zespoda nahoru: `cards[0]` leží úplně dole, poslední je navrchu → líže se první.
function discardStack(g, cards) {
    g.deck.discardPile = cards.slice();
    return cards;
}
const C = (v = '5', suit = Suits.CLUBS) => mkCard(CardType.BANG, { suit, value: v });

// ── Přepínač ────────────────────────────────────────────────────────────────

test('Opuštěný důl: _syncMine zapne prohození jen když karta platí', () => {
    const g = mkGame([{ role: 'Sheriff' }, {}]);
    assert.equal(g.deck.mineMode, false, 'bez události se nic neprohazuje');

    g.activeFistful = ff('OPUSTENY_DUL');
    g._syncMine();
    assert.equal(g.deck.mineMode, true);

    // Novou událostí se ta stará přebije → hromádky zpátky.
    g.activeFistful = ff('LASO');
    g._syncMine();
    assert.equal(g.deck.mineMode, false);
});

test('Opuštěný důl: prohození se přepočítá při odkrytí, ne až v dalším tahu', () => {
    // _flipEvent musí volat _syncMine JEŠTĚ PŘED kontrolním sejmutím na Dynamit/Vězení,
    // jinak by první tah kola líznul kontrolní kartu ze špatné hromádky.
    const g = mkGame([{ role: 'Sheriff' }, {}], { current: 0 });
    g.ffDeck = [ff('OPUSTENY_DUL')];
    g._sheriffTurns = 1;              // příští _flipEvent je ten „druhý", tedy odkrývací
    g.deck.cards = [C(), C()];
    g.deck.discardPile = [C()];
    g._flipEvent();
    assert.equal(g.activeFistful.key, 'OPUSTENY_DUL');
    assert.equal(g.deck.mineMode, true, 'zapnuto hned s odkrytím');
});

test('Opuštěný důl: nová hra prohození zruší', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    assert.equal(g.deck.mineMode, true);
    g._setupFistfulDeck({});          // bez zapnutého rozšíření = jen úklid
    assert.equal(g.deck.mineMode, false);
});

// ── Lízání a odhazování ─────────────────────────────────────────────────────

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

test('Opuštěný důl: zahraná karta skončí na balíčku a nejde si ji líznout', () => {
    const g = mkMine([{ role: 'Sheriff', health: 3 }, {}, {}]);   // Pivo léčí až od tří hráčů
    g.deck.cards = [C('K')];
    g.deck.discardPile = [C('2')];
    const beer = give(g, 0, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.deck.discardPile.length, 1, 'do odhozu nic nepřibylo');
    assert.equal(g.deck.cards.length, 2, 'Pivo leží lícem dolů na dobíracím balíčku');
    assert.equal(g.deck.cards[g.deck.cards.length - 1].type, CardType.BEER);

    // …a při lízání se bere pořád jen z odhozu, takže si ji nikdo nevezme zpátky.
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.players[0].hand[0].value, '2');
});

test('Opuštěný důl: odhoz na konci tahu jde taky na balíček', () => {
    const g = mkMine([{ role: 'Sheriff', health: 1 }, {}], { phase: 'PLAY' });
    g.deck.discardPile = [C('2')];
    give(g, 0, CardType.BANG); give(g, 0, CardType.BANG); give(g, 0, CardType.BANG);
    const deckBefore = g.deck.cards.length;
    g.tryEndTurn();                      // limit = 1 život → fáze DISCARD na 2 karty
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0); g.discardCard(0);
    assert.equal(g.deck.cards.length, deckBefore + 2, 'obě odhozené leží na balíčku');
    assert.equal(g.deck.discardPile.length, 1, 'v odhozu zbyla jen původní karta');
});

// ── Kontrolní sejmutí (R7: bez výjimek) ─────────────────────────────────────

test('Opuštěný důl: sejmutí na Vězení bere z odhozu a karta odchází na balíček', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}], { current: 0 });
    board(g, 0, CardType.JAIL);
    // Srdcová karta navrchu odhozu = hráč se z vězení dostane.
    g.deck.discardPile = [C('2'), mkCard(CardType.BANG, { suit: Suits.HEARTS, value: 'A' })];
    const deckBefore = g.deck.cards.length;
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.deck.discardPile.length, 1, 'kontrolní karta se vzala z odhozu');
    g.resolveCheck();
    assert.equal(g.deck.cards.length, deckBefore + 2, 'sejmutá karta i Vězení šly na balíček');
    assert.equal(g.players[0].board.length, 0, 'Vězení se odhodilo');
});

test('Opuštěný důl: Lucky Duke bere obě karty z odhozu a vrací je na balíček', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'Lucky Duke' }, {}], { current: 0 });
    board(g, 0, CardType.JAIL);
    g.deck.discardPile = [C('2'), C('3'), C('4')];
    const deckBefore = g.deck.cards.length;
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    assert.deepEqual(g.luckyDukeState.cards.map(c => c.value), ['4', '3']);
    assert.equal(g.deck.discardPile.length, 1);
    g.luckyDukePick(0);
    assert.equal(g.deck.discardPile.length, 1, 'obě sejmuté karty odešly na balíček');
    assert.ok(g.deck.cards.length >= deckBefore + 2);
});

// ── Vypnutí, když odhoz dojde ───────────────────────────────────────────────

test('Opuštěný důl: prázdný odhoz ho vypne a líže se dál z balíčku', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g.deck.discardPile = [C('2')];
    g.deck.cards = [C('K'), C('Q')];
    g.startDrawPhase();
    g.drawCard('deck');                  // poslední karta odhozu
    assert.equal(g.deck.mineMode, true, 'dokud v odhozu něco bylo, důl platil');
    g.drawCard('deck');                  // odhoz je prázdný → důl končí
    assert.equal(g.deck.mineMode, false);
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['2', 'Q']);
    assert.equal(g.deck.cards.length, 1);
});

test('Opuštěný důl: po vypnutí se zase odhazuje do odhozu (zbytek kola normálně)', () => {
    const g = mkMine([{ role: 'Sheriff', health: 3 }, {}, {}]);   // Pivo léčí až od tří hráčů
    g.deck.discardPile = [];
    g.deck.cards = [C('K'), C('Q'), C('J')];
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.deck.mineMode, false, 'prázdný odhoz důl vypnul hned při prvním líznutí');
    g.drawCard('deck');
    g.phase = 'PLAY';
    const beer = give(g, 0, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.deck.discardPile.length, 1, 'Pivo šlo do odhozu, ne na balíček');
});

test('Opuštěný důl: vypnutí platí jen do konce kola, další odkrytí ho zapne zpátky', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g.deck.discardPile = [];
    g.deck.cards = [C('K'), C('Q')];
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.deck.mineMode, false);
    // Nové kolo: šerif odkrývá znovu a důl (pořád platná karta) je zpátky ve hře.
    g._syncMine();
    assert.equal(g.deck.mineMode, true);
});

// ── Ostatní cesty karet ─────────────────────────────────────────────────────

test('Opuštěný důl: hokynářství rozdá správný počet z odhozu', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}, {}]);
    g.deck.discardPile = [C('2'), C('3'), C('4'), C('5')];
    g.deck.cards = [C('K')];
    g.openStore();
    assert.equal(g.storeCards.filter(Boolean).length, 3, 'jedna karta na hráče ve hře');
    assert.deepEqual(g.storeCards.map(c => c.value), ['5', '4', '3']);
    assert.equal(g.storeAnim.origCount, 4, 'cinematika počítá s výškou ODHOZU');
    assert.equal(g.storeAnim.mode, 'none');
    assert.equal(g.deck.cards.length, 1, 'dobírací balíček zůstal nedotčený');
});

test('Opuštěný důl: pozůstalost vyřazeného hráče jde na balíček', () => {
    const g = mkMine([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }], { current: 0 });
    give(g, 1, CardType.BANG); give(g, 1, CardType.MISSED);
    board(g, 1, CardType.BARREL);
    g.deck.discardPile = [C('2')];
    const deckBefore = g.deck.cards.length;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.deck.cards.length, deckBefore + 3, 'ruka i stůl mrtvého leží na balíčku');
    assert.equal(g.deck.discardPile.length, 1);
});

test('Opuštěný důl: Kit Carlson odkrývá z odhozu a nevybrané tam i vrací', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'Kit Carlson' }, {}]);
    g.deck.discardPile = [C('2'), C('3'), C('4'), C('5')];
    g.deck.cards = [C('K')];
    g.startDrawPhase();
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

test('Opuštěný důl: Ranč odhodí na balíček a dolízne z odhozu', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g.activeFistful = ff('OPUSTENY_DUL');
    g._ranchEvent = true;
    g.deck.discardPile = [C('2'), C('3'), C('4'), C('5')];
    g.deck.cards = [C('K')];
    // Ranč se ptá až po lízání; postavíme ho rovnou (fázi řeší fistful.peyote.test.js).
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const hand = g.players[0].hand.map(c => c.id);
    g.pendingRanch = { playerIdx: 0 };
    g.phase = 'RANCH';
    g.ranchExchange(0, [hand[0]]);
    assert.equal(g.deck.cards.length, 2, 'odhozená karta leží na dobíracím balíčku');
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck');
    assert.deepEqual(g.players[0].hand.map(c => c.value), ['4', '3']);
});

// ── Vyčerpání odhozu uprostřed dávky ────────────────────────────────────────
// Vypnutí dolu spadne doprostřed operace, která bere víc karet naráz. Karet je pořád
// dost (dobírací balíček je plný), takže se NESMÍ nic míchat – a kdyby `mode` zůstalo
// 'blocking'/'proactive', klient by přehrál míchací cinematiku, která se nestala.

test('Opuštěný důl: Kit dobere zbytek řady z balíčku a nemíchá se', () => {
    const g = mkMine([{ role: 'Sheriff', character: 'Kit Carlson' }, {}]);
    g.deck.discardPile = [C('2')];                       // na řadu 3 karet chybí dvě
    g.deck.cards = [C('K'), C('Q'), C('J'), C('T')];
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    assert.deepEqual(g.kitCarlsonState.revealed.map(c => c.value), ['2', 'T', 'J'],
                     'první z odhozu, zbytek už z balíčku');
    assert.equal(g.deck.mineMode, false, 'důl se prázdným odhozem vypnul');
    assert.equal(g.kitCarlsonState.anim.mode, 'none', 'nic se nemíchalo → žádná cinematika');
    assert.equal(g.kitCarlsonState.anim.shuffleCount, 0);
});

test('Opuštěný důl: hokynářství dorozdá z balíčku a nemíchá se', () => {
    const g = mkMine([{ role: 'Sheriff' }, {}, {}]);
    g.deck.discardPile = [C('2')];                       // na 3 hráče chybí dvě karty
    g.deck.cards = [C('K'), C('Q'), C('J')];
    g.openStore();
    assert.deepEqual(g.storeCards.map(c => c.value), ['2', 'J', 'Q']);
    assert.equal(g.deck.mineMode, false);
    assert.equal(g.storeAnim.mode, 'none', 'nic se nemíchalo → žádná cinematika');
    assert.equal(g.storeAnim.shuffleCount, 0);
});

test('Opuštěný důl: vypnutí padne přesně na líznutí, které odhoz našlo prázdný', () => {
    // Poslední karta odhozu se ještě bere z něj; teprve DALŠÍ líznutí důl vypne.
    const g = mkMine([{ role: 'Sheriff' }, {}]);
    g.deck.discardPile = [C('2')];
    g.deck.cards = [C('K')];
    assert.equal(g.deck.draw().value, '2');
    assert.equal(g.deck.mineMode, true, 'kartu ještě vydal odhoz');
    assert.equal(g.deck.draw().value, 'K');
    assert.equal(g.deck.mineMode, false, 'až tady se přepnulo');
    assert.equal(g.deck.discardPile.length, 0);
});

// ── Bot ─────────────────────────────────────────────────────────────────────

test('Opuštěný důl: bot líže i z hromádky, na které neleží Bang!/Pivo/Vedle!', () => {
    const g = mkMine([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    // Navrchu odhozu leží Vězení – bot ho jako Pedro nechtěl, ale teď je to prostě
    // dobírací balíček a musí si z něj líznout, jinak se hra zasekne.
    g.deck.discardPile = [C('2'), mkCard(CardType.JAIL)];
    g.deck.cards = [C('K')];
    g.startDrawPhase();
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'DRAW' });
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'draw_card');
    assert.equal(a.payload.source, 'deck');
});
