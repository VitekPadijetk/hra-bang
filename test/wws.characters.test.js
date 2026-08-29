// Rozšíření Divoký západ – postavy (fáze 4: Big Spencer, Gary Looter, John Pain,
// Flint Westwood, Youl Grinner; fáze 5: Teren Kill).
// Texty karet jsou v docs/wild-west-show-plan.md §5.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { playsAsMissed, playsAsBang, rouletteDiscardable, bigSpencerBlocked,
        lvkOffer, lvkPayOk, lvkTargetOk } = require('../core/playability.js');
const { startCardsForCharacter, baseHealthForCharacter, healthForCharacter } = require('../core/roles.js');
const { pendingActor, describePendingCheck } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { computeBeliefs } = require('../core/beliefs.js');
const { WILD_WEST_CHARACTERS } = require('../logic/entities.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const wws = key => wwsData.find(c => c.key === key);
const ffData = rd('cards.fistful.json');   // Odstřelovač (Lee Van Kliff opakuje i jeho)

const bang = (g, i, o = {}) => give(g, i, CardType.BANG, { name: 'Bang!', ...o });
const miss = (g, i, o = {}) => give(g, i, CardType.MISSED, { name: 'Vedle!', ...o });

// ── Big Spencer ─────────────────────────────────────────────────────────────

test('Big Spencer: 9 životů (10 jako šerif), ale jen 5 startovních karet', () => {
    assert.equal(baseHealthForCharacter('Big Spencer'), 9);
    assert.equal(healthForCharacter('Big Spencer', 'Sheriff').max, 10);
    assert.equal(startCardsForCharacter('Big Spencer', 9), 5);
    // Ostatní postavy startovní ruku nemění.
    assert.equal(startCardsForCharacter('Bart Cassidy', 4), 4);
    assert.equal(startCardsForCharacter('Paul Regret', 3), 3);
});

test('Big Spencer nesmí zahrát kartu Vedle!, ale Úhyb ano', () => {
    const g = mkGame([{ character: 'Big Spencer' }, {}]);
    const m = miss(g, 0);
    const u = give(g, 0, CardType.UHYB, { name: 'Úhyb' });
    assert.equal(playsAsMissed(g, g.players[0], g.players[0].hand[m]), false);
    assert.equal(playsAsMissed(g, g.players[0], g.players[0].hand[u]), true);
    assert.equal(bigSpencerBlocked(g.players[0], g.players[0].hand[m]), true);
});

test('Big Spencer se Vedle! neubrání ani ve fázi RESPOND', () => {
    const g = mkGame([{}, { character: 'Big Spencer' }]);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'RESPOND');
    const m = miss(g, 1);
    g.handleResponse(1, m);
    assert.equal(g.phase, 'RESPOND', 'karta Vedle! se neuplatnila');
    assert.equal(g.players[1].hand.length, 1, 'a zůstala v ruce');
});

test('Big Spencer × Zúčtování: kartu BANG! jako Vedle! zahrát smí (R9)', () => {
    const g = mkGame([{}, { character: 'Big Spencer' }]);
    g.activeWws = wws('ZUCTOVANI');
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    const mb = bang(g, 1);
    assert.equal(playsAsMissed(g, g.players[1], g.players[1].hand[mb]), true);
    g.handleResponse(1, mb);
    assert.equal(g.players[1].health, 4, 'ubránil se kartou Bang!');
});

test('Big Spencer: kartu Vedle! smí ODHODIT (Ruská ruleta), jen ne zahrát', () => {
    const g = mkGame([{ character: 'Big Spencer' }, {}]);
    const m = miss(g, 0);
    assert.equal(rouletteDiscardable(g, g.players[0], g.players[0].hand[m], false), true);
});

test('Big Spencer: limit karet v ruce = životy, tedy až 9', () => {
    const g = mkGame([{ character: 'Big Spencer', maxHealth: 9 }, {}]);
    assert.equal(g._handLimit(g.players[0]), 9);
});

test('Big Spencer: Barel funguje dál (není to karta Vedle!, FAQ Q07)', () => {
    const g = mkGame([{}, { character: 'Big Spencer' }]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.HEARTS);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'BARREL_DRAW', 'Barel se ptá na sejmutí');
});

// ── Gary Looter ─────────────────────────────────────────────────────────────

// Odhoz nad limit: hráč 0 má víc karet než životů a jednu odhodí.
function mkDiscard(specs, opts = {}) {
    const g = mkGame(specs, { phase: 'DISCARD', current: 0, ...opts });
    return g;
}

test('Gary Looter: 5 životů (6 jako šerif)', () => {
    assert.equal(baseHealthForCharacter('Gary Looter'), 5);
    assert.equal(healthForCharacter('Gary Looter', 'Sheriff').max, 6);
});

test('Gary Looter si bere kartu odhozenou nad limit na konci cizího tahu', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter' }]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    const taken = g.players[0].hand[1];
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.players[1].hand[0], taken);
    assert.equal(g.deck.discardPile.length, 0, 'do odhozu se nedostala');
});

test('Gary Looter si SVOJE odhozené karty nebere (FAQ Q14)', () => {
    const g = mkDiscard([{ character: 'Gary Looter', health: 1 }, {}]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[0].hand.length, 1, 'karta z ruky opravdu odešla');
    assert.equal(g.deck.discardPile.length, 1, 'a skončila v odhozu');
});

test('Gary Looter: víc Garyů → bere první po směru od odhazujícího (R6)', () => {
    const g = mkDiscard([{ health: 1 }, {}, { character: 'Gary Looter' },
                         { character: 'Gary Looter' }]);
    // Kopii dělá Vera Custer; tady stačí, že mají oba stejnou effectiveCharacter.
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[3].hand.length, 0);
});

test('Gary Looter: mrtvý nebere', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter', health: 0 }]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.deck.discardPile.length, 1);
});

test('Gary Looter: Kocovina (High Noon) schopnost vypíná', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter' }]);
    g.players[1]._noAbility = true;
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.deck.discardPile.length, 1);
});

test('Gary Looter vyhrává nad Opuštěným dolem – karta se na balíček nedostane (R7)', () => {
    const g = mkDiscard([{ health: 1 }, { character: 'Gary Looter' }]);
    g._mineTurn = true;
    const before = g.deck._drawPile.length;
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.discardCard(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.deck._drawPile.length, before, 'na dobírací balíček nešla');
});

test('Gary Looter: odhoz MIMO konec tahu (Sid Ketchum) se ho netýká', () => {
    const g = mkGame([{ character: 'Sid Ketchum', health: 2 }, { character: 'Gary Looter' }]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[1].hand.length, 0, 'Gary nic nedostal');
});

// ── John Pain ───────────────────────────────────────────────────────────────

test('John Pain si bere kartu ze sejmutí na Vězení (a až po jeho vyhodnocení)', () => {
    const g = mkGame([{ character: 'John Pain' }, {}]);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw();
    const checkCard = g.currentCheck.card;
    // Dokud se sejmutí nevyhodnotí, karta je pořád v odhozu.
    assert.equal(g.players[0].hand.length, 0);
    g.resolveCheck();
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[0].hand[0].id, checkCard.id);
});

test('John Pain: s 6 kartami v ruce už nebere', () => {
    const g = mkGame([{ character: 'John Pain' }, {}]);
    for (let i = 0; i < 6; i++) give(g, 0, CardType.BANG, { name: 'Bang!' });
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].hand.length, 6);
});

test('John Pain bere i cizí sejmutí (barel soupeře)', () => {
    const g = mkGame([{}, {}, { character: 'John Pain' }]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.HEARTS);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'BARREL_DRAW');
    g.triggerBarrelDraw();
    const checkCard = g.currentCheck.card;
    g.resolveCheck();
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[2].hand[0].id, checkCard.id);
});

test('John Pain: neuhnutý barel → kartu dostane až PO dohrané obraně', () => {
    const g = mkGame([{}, { character: 'John Pain' }]);
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    topDeck(g, Suits.SPADES);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND', 'barel neuhnul, brání se dál');
    assert.equal(g.players[1].hand.length, 0, 'sejmutou kartou se bránit nesmí');
    g.handleResponse(1, null);   // nechá se zasáhnout
    assert.equal(g.players[1].hand.length, 1, 'teprve teď si ji vezme');
});

test('John Pain × Lucky Duke: bere OBĚ karty (Sciarra Q22)', () => {
    // Snímá Lucky Duke, John Pain sedí vedle něj.
    const g2 = mkGame([{ character: 'Lucky Duke' }, { character: 'John Pain' }]);
    board(g2, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g2, Suits.HEARTS, 'K');
    topDeck(g2, Suits.CLUBS, '7');
    g2.handleStartOfTurnChecks();
    g2.triggerCheckDraw();
    assert.equal(g2.phase, 'LUCKY_DUKE');
    g2.luckyDukePick(0);
    assert.equal(g2.players[1].hand.length, 2, 'obě sejmuté karty');
});

test('John Pain × Lucky Duke: s 5 kartami bere jen tu první (Q22)', () => {
    const g = mkGame([{ character: 'Lucky Duke' }, { character: 'John Pain' }]);
    for (let i = 0; i < 5; i++) give(g, 1, CardType.BANG, { name: 'Bang!' });
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    topDeck(g, Suits.CLUBS, '7');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    const first = g.luckyDukeState.cards[0];
    g.luckyDukePick(0);
    assert.equal(g.players[1].hand.length, 6);
    assert.equal(g.players[1].hand[5].id, first.id, 'ta první v pořadí snímání');
});

test('John Pain: víc Johnů → bere první po směru od snímajícího (FAQ Q11)', () => {
    const g = mkGame([{}, {}, { character: 'John Pain' }, { character: 'John Pain' }]);
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[2].hand.length, 1);
    assert.equal(g.players[3].hand.length, 0);
});

test('John Pain: Kocovina (High Noon) schopnost vypíná', () => {
    const g = mkGame([{ character: 'John Pain' }, {}]);
    g.players[0]._noAbility = true;
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    topDeck(g, Suits.HEARTS, 'K');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].hand.length, 0);
});

test('John Pain × dynamit: kartu dostane až po všech třech zásazích', () => {
    const g = mkGame([{ character: 'John Pain', maxHealth: 5, health: 5 }, {}]);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    topDeck(g, Suits.SPADES, '5');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].hand.length, 0, 'uprostřed výbuchu kartu ještě nemá');
    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].hand.length, 1);
});

// ── Youl Grinner ────────────────────────────────────────────────────────────

test('Youl Grinner: kdo má víc karet, dá mu jednu ještě před jeho lízáním', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, {}, {}]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 1, CardType.BEER, { name: 'Pivo' });   // 2 > 1 → dává
    give(g, 2, CardType.BANG, { name: 'Bang!' });  // 1 = 1 → nedává
    g.startDrawPhase();
    assert.equal(g.phase, 'GRINNER_GIVE');
    assert.deepEqual(g.pendingGrinner.queue, [1]);
    const cardId = g.players[1].hand[0].id;
    g.grinnerGive(1, cardId);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'DRAW', 'kolečko doběhlo → fáze lízání');
});

test('Youl Grinner: nikdo nemá víc karet → fáze se vůbec nezaloží', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, {}]);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.pendingGrinner ?? null, null);
});

test('Youl Grinner: dávají všichni s víc kartami, po směru od něj', () => {
    const g = mkGame([{}, { character: 'Youl Grinner' }, {}, {}], { current: 1 });
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    give(g, 2, CardType.BANG, { name: 'Bang!' });
    give(g, 3, CardType.BANG, { name: 'Bang!' });
    g.startDrawPhase();
    assert.deepEqual(g.pendingGrinner.queue, [2, 3, 0]);
    assert.deepEqual(pendingActor(g), { idx: 2, kind: 'GRINNER_GIVE' });
    g.grinnerGive(2, g.players[2].hand[0].id);
    assert.deepEqual(pendingActor(g), { idx: 3, kind: 'GRINNER_GIVE' });
    g.grinnerGive(3, g.players[3].hand[0].id);
    g.grinnerGive(0, g.players[0].hand[0].id);
    assert.equal(g.players[1].hand.length, 3);
    assert.equal(g.phase, 'DRAW');
});

test('Youl Grinner: klik z jiného hráče než z čela fronty se ignoruje', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, {}, {}]);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 2, CardType.BANG, { name: 'Bang!' });
    g.startDrawPhase();
    assert.equal(g.grinnerGive(2, g.players[2].hand[0].id), null);
    assert.equal(g.players[0].hand.length, 0);
});

test('Youl Grinner: množina dávajících se určí JEDNOU, snímkem (R8)', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, {}, {}]);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 2, CardType.BANG, { name: 'Bang!' });
    give(g, 2, CardType.BEER, { name: 'Pivo' });
    g.startDrawPhase();
    assert.deepEqual(g.pendingGrinner.queue, [1, 2]);
    g.grinnerGive(1, g.players[1].hand[0].id);
    // Youl má po prvním daru 1 kartu, hráč 2 pořád 2 – dává tak jako tak, protože
    // se množina určila na začátku.
    assert.deepEqual(g.pendingGrinner.queue, [2]);
    g.grinnerGive(2, g.players[2].hand[0].id);
    assert.equal(g.phase, 'DRAW');
});

test('Youl Grinner: mrtví nedávají', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, { health: 0 }, {}]);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 2, CardType.BANG, { name: 'Bang!' });
    g.startDrawPhase();
    assert.deepEqual(g.pendingGrinner.queue, [2]);
});

test('Youl Grinner × Suzy Lafayette: poslední karta → nejdřív líznutí, pak další v pořadí', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, { character: 'Suzy Lafayette' }, {}]);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 2, CardType.BANG, { name: 'Bang!' });
    g.startDrawPhase();
    g.grinnerGive(1, g.players[1].hand[0].id);
    assert.equal(g.phase, 'SUZY_DRAW', 'Suzy si líže dřív, než se kolečko posune');
    g.suzyLafayetteDraw(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.deepEqual(pendingActor(g), { idx: 2, kind: 'GRINNER_GIVE' });
});

test('Youl Grinner: Kocovina (High Noon) schopnost vypíná', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, {}]);
    g.players[0]._noAbility = true;
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
});

test('Youl Grinner: bot dá kartu (větev GRINNER_GIVE)', () => {
    const g = mkGame([{ character: 'Youl Grinner' }, {}]);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    g.startDrawPhase();
    const act = decideBotAction(g, 1);
    assert.equal(act.event, 'grinner_give');
    assert.ok(g.players[1].hand.some(c => c.id === act.payload.cardId));
});

// ── Flint Westwood ──────────────────────────────────────────────────────────

test('Flint Westwood: vymění 1 svoji kartu za 2 náhodné cizí', () => {
    const g = mkGame([{ character: 'Flint Westwood' }, {}]);
    const mine = mkCard(CardType.BEER, { name: 'Pivo' });
    g.players[0].hand.push(mine);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 1, CardType.MISSED, { name: 'Vedle!' });
    const res = g.useFlintWestwood(0, 1, mine.id);
    assert.ok(res);
    assert.equal(res.taken.length, 2);
    assert.equal(g.players[0].hand.length, 2, 'dal 1, vzal 2');
    assert.equal(g.players[1].hand.length, 2, 'přišel o 2, dostal 1');
    assert.ok(g.players[1].hand.some(c => c.id === mine.id));
});

test('Flint Westwood: cíl s jednou kartou → dostane jen jednu (Sciarra Q33)', () => {
    const g = mkGame([{ character: 'Flint Westwood' }, {}]);
    const mine = mkCard(CardType.BEER, { name: 'Pivo' });
    g.players[0].hand.push(mine);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    const res = g.useFlintWestwood(0, 1, mine.id);
    assert.equal(res.taken.length, 1);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[1].hand.length, 1);
});

test('Flint Westwood: jen jednou za tah (FAQ Q16)', () => {
    const g = mkGame([{ character: 'Flint Westwood' }, {}]);
    const a = mkCard(CardType.BEER, { name: 'Pivo' });
    const b = mkCard(CardType.BEER, { name: 'Pivo' });
    g.players[0].hand.push(a, b);
    for (let i = 0; i < 4; i++) give(g, 1, CardType.BANG, { name: 'Bang!' });
    assert.ok(g.useFlintWestwood(0, 1, a.id));
    assert.equal(g.useFlintWestwood(0, 1, b.id), null);
});

test('Flint Westwood: cíl bez karet a on sám nejsou platné cíle', () => {
    const g = mkGame([{ character: 'Flint Westwood' }, {}, { health: 0 }]);
    const mine = mkCard(CardType.BEER, { name: 'Pivo' });
    g.players[0].hand.push(mine);
    give(g, 2, CardType.BANG, { name: 'Bang!' });
    assert.equal(g.useFlintWestwood(0, 1, mine.id), null, 'cíl bez karet');
    assert.equal(g.useFlintWestwood(0, 0, mine.id), null, 'sám na sebe');
    assert.equal(g.useFlintWestwood(0, 2, mine.id), null, 'mrtvý cíl');
});

test('Flint Westwood: dostřel neplatí – vymění si s kýmkoli u stolu', () => {
    const g = mkGame([{ character: 'Flint Westwood' }, {}, {}, {}, {}]);
    const mine = mkCard(CardType.BEER, { name: 'Pivo' });
    g.players[0].hand.push(mine);
    give(g, 2, CardType.BANG, { name: 'Bang!' });
    assert.ok(g.useFlintWestwood(0, 2, mine.id));
});

test('Flint Westwood × Suzy Lafayette: nejdřív se bere, pak dává (Sciarra Q32)', () => {
    const g = mkGame([{ character: 'Flint Westwood' }, { character: 'Suzy Lafayette' }]);
    const mine = mkCard(CardType.BEER, { name: 'Pivo' });
    g.players[0].hand.push(mine);
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    give(g, 1, CardType.BANG, { name: 'Bang!' });
    g.useFlintWestwood(0, 1, mine.id);
    assert.equal(g.phase, 'PLAY', 'Suzy si nelíže – Flintovu kartu dostala dřív');
    assert.equal(g.players[1].hand.length, 1);
});

test('Flint Westwood: bot schopnost použije', () => {
    const g = mkGame([{ character: 'Flint Westwood', role: 'Sheriff' },
                      { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    const mine = mkCard(CardType.BEER, { name: 'Pivo' });
    g.players[0].hand.push(mine);
    for (let i = 1; i < 4; i++) { give(g, i, CardType.BANG, { name: 'Bang!' }); }
    const act = decideBotAction(g, 0, computeBeliefs(g, [], 0));
    assert.equal(act.event, 'flint_westwood');
    assert.equal(act.payload.cardId, mine.id, 'dá nejlevnější kartu');
    assert.ok(act.payload.targetIdx !== 0);
});

// ── Pool postav: do ostré hry jen ty, které už mají schopnost ───────────────

test('_characterPool: ostrá hra bere jen hotové postavy Divokého západu', () => {
    const g = mkGame([{}, {}]);
    const pool = g._characterPool({ expansions: { divoky_zapad: true } });
    ['Big Spencer', 'Flint Westwood', 'Gary Looter', 'John Pain', 'Lee Van Kliff', 'Teren Kill', 'Youl Grinner']
        .forEach(c => assert.ok(pool.includes(c), `${c} chybí v ostrém poolu`));
    ['Greygory Deck']
        .forEach(c => assert.ok(!pool.includes(c), `${c} ještě nemá schopnost, do ostré hry nepatří`));
    // Bez rozšíření se nepřidá nic.
    assert.equal(g._characterPool({}).some(c => WILD_WEST_CHARACTERS.includes(c)), false);
    // Debug hra nabízí všech osm (ať se dá vyzkoušet i dráha životů bez pravidel).
    const dbg = g._characterPool({ expansions: { divoky_zapad: true }, debugPool: true });
    WILD_WEST_CHARACTERS.forEach(c => assert.ok(dbg.includes(c), `${c} chybí v debug poolu`));
});

// ── Teren Kill ──────────────────────────────────────────────────────────────
// „Pokaždé, když by měl být vyřazen, sejme kartu: není-li to pik, zůstává na
// 1 životě a lízne si kartu." Vyřazení se pozastaví ve frontě odložených akcí
// (TEREN_CHECK) a dojede přes CHECK_DRAW → CHECKING → _applyCheckResult.

// Hra, ve které smrtelný zásah dostane Teren Kill (seat 1). `check` = barva sejmuté karty.
function terenGame(check, opts = {}) {
    const g = mkGame([
        { role: 'Sheriff' },
        { role: 'Outlaw', character: 'Teren Kill', maxHealth: 3, health: opts.health ?? 1 },
        { role: 'Renegade' }, { role: 'Deputy' },
    ], { current: opts.current ?? 0 });
    for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS, '4');   // zásoba na líznutí
    if (check) topDeck(g, check, '9');                          // kontrolní karta navrch
    return g;
}

// Doběhne sejmutí, které čeká ve frontě (klik na balíček + odkrytí karty).
function runTerenCheck(g) {
    g._processSpecialQueue();
    g.triggerCheckDraw();
    g.resolveCheck();
}

test('Teren Kill: smrtelný zásah se pozastaví na sejmutí, ne-pik ho drží na 1 životě', () => {
    const g = terenGame(Suits.HEARTS);
    g.handleDamage(1, 0);

    // Vyřazení ještě NEproběhlo: hráč se drží na 1 životě, aby ho isInPlay ani
    // checkWinCondition uprostřed nedokončeného vyřazení nevyškrtly ze hry.
    assert.equal(g.players[1].health, 1);
    assert.equal(g.winner, null);
    assert.deepEqual(g.specialActionQueue, [{ type: 'TEREN_CHECK', playerIdx: 1 }]);

    runTerenCheck(g);
    assert.equal(g.players[1].health, 1);
    // …a líže si kartu (klikací líznutí ve frontě, stejný vzor jako odměna za zabití).
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Teren Kill: pik = vyřazení proběhne doopravdy (i s odměnou za banditu)', () => {
    const g = terenGame(Suits.SPADES);
    give(g, 1, CardType.BANG);
    g.handleDamage(1, 0);
    runTerenCheck(g);

    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1].hand.length, 0);       // karty šly do odhozu
    assert.equal(g._deathAnimPlayerIdx, 1);          // cinematiku vyřazení dohraje server
    // Šerif vyřadil banditu → 3 karty (kill-reward ve frontě).
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
});

test('Teren Kill: sejmutí jede přes CHECK_DRAW, takže na něj čeká klient i bot', () => {
    const g = terenGame(Suits.HEARTS);
    g.handleDamage(1, 0);
    g._processSpecialQueue();

    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(g.pendingCheckDraw.reason, 'TEREN_KILL');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'CHECK_DRAW' });
    const d = describePendingCheck(g, 1);
    assert.equal(d.kind, 'TEREN_KILL');
    assert.equal(d.forMe, true);
    assert.match(d.detail, /♠/);
});

test('Teren Kill: jakmile se snímá, Pivo už zachránit nemůže', () => {
    const g = terenGame(Suits.HEARTS);
    const beer = give(g, 1, CardType.BEER);
    g.handleDamage(1, 0);
    g._processSpecialQueue();
    // FAQ Q18: volba „Pivo, nebo sejmutí" padla ve chvíli zásahu. Teď je pozdě –
    // hráč je na 1 životě jen technicky a žádná ze záchranných fází neběží.
    assert.equal(g.beerLastLifeSave(1, beer), false);
    assert.equal(g.players[1].hand.length, 1);
});

test('Teren Kill × Pivo (FAQ Q18): záchrana Pivem sejmutí vůbec nespustí', () => {
    const g = terenGame(Suits.SPADES);
    g.phase = 'RESPOND';
    g.pendingResponse = { active: true, originatorIdx: 0, targetIdx: 1,
                          requiredCard: CardType.MISSED, sourceCard: CardType.BANG, responded: [] };
    const beer = give(g, 1, CardType.BEER);

    assert.equal(g.beerLastLifeSave(1, beer), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.specialActionQueue.length, 0, 'sejmutí se nespustilo');
    assert.equal(g.phase, 'PLAY');
});

test('Teren Kill: obrana bez Vedle! projde celou cestou playBang → sejmutí', () => {
    const g = terenGame(Suits.HEARTS);
    const c = give(g, 0, CardType.BANG);
    g.playBang(0, 1, c);
    g.handleResponse(1, null);           // nemá Vedle! → schytá zásah
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(g.players[1].health, 1);
    runTerenCheck(g);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.drawPhaseState.playerIdx, 1);
});

test('Teren Kill × dynamit (FAQ Q12): snímá se jednou a zbytek zásahů propadá', () => {
    const g = terenGame(Suits.HEARTS, { current: 1, health: 3 });
    g.pendingDynamiteDamage = { playerIdx: 1, hitsLeft: 3 };
    g.phase = 'DYNAMITE_DAMAGE';
    g.takeDynamiteHit(1);   // 3 → 2
    g.takeDynamiteHit(1);   // 2 → 1
    g.takeDynamiteHit(1);   // 1 → 0 → pozastavené vyřazení
    assert.equal(g.players[1].health, 1);
    assert.equal(g.pendingDynamiteDamage, null, 'zbylé zásahy propadly');
    assert.equal(g.phase, 'CHECK_DRAW');

    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[1].health, 1);
    // Nejdřív karta za přežití, teprve pak pokračuje vlastní tah (fáze lízání).
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.drawPhaseState.isStartOfTurn, true);
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
});

test('Teren Kill × dynamit: pik na vlastním tahu tah posune', () => {
    const g = terenGame(Suits.SPADES, { current: 1, health: 1 });
    g.pendingDynamiteDamage = { playerIdx: 1, hitsLeft: 3 };
    g.phase = 'DYNAMITE_DAMAGE';
    g.takeDynamiteHit(1);
    g.triggerCheckDraw();
    g.resolveCheck();

    assert.equal(g.players[1].health, 0);
    assert.equal(g.winner, null);
    assert.notEqual(g.currentPlayerIndex, 1, 'tah se posunul na dalšího hráče');
});

test('Teren Kill × Pravé poledne: pik nechá tah posunout serveru (_autoEndTurnPending)', () => {
    const g = terenGame(Suits.SPADES, { current: 1, health: 1 });
    g._beginTurnStep = 7;   // krokovač je za Pravým polednem (viz _runBeginTurn)
    g.pendingNoonDamage = { playerIdx: 1 };
    g.phase = 'NOON_DAMAGE';
    g.takeNoonHit(1);
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw();
    g.resolveCheck();

    assert.equal(g.players[1].health, 0);
    assert.equal(g._autoEndTurnPending, true);
    // Start tahu se mrtvému nedotáčí – pokračování naplánované na frontu se zahodilo.
    assert.equal(g._resumeBeginTurnAfterQueue, false);
    assert.equal(g.currentPlayerIndex, 1, 'tah posune až server');
});

test('Teren Kill jako duch (Město duchů) sejmutí nespouští', () => {
    const g = terenGame(Suits.HEARTS, { current: 1, health: 1 });
    g.players[1]._ghost = true;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.specialActionQueue.length, 0);
    assert.equal(g.pendingTerenKill, null);
});

test('Teren Kill: sejmutou kartu bere John Pain (jde to normální check cestou)', () => {
    const g = mkGame([
        { role: 'Sheriff', character: 'John Pain' },
        { role: 'Outlaw', character: 'Teren Kill', maxHealth: 3, health: 1 },
        { role: 'Renegade' }, { role: 'Deputy' },
    ], { current: 0 });
    for (let i = 0; i < 8; i++) topDeck(g, Suits.CLUBS, '4');
    topDeck(g, Suits.HEARTS, '9');
    g.handleDamage(1, 0);
    runTerenCheck(g);
    assert.equal(g.players[0].hand.length, 1, 'John Pain si vzal sejmutou kartu');
    assert.equal(g.players[0].hand[0].suit, Suits.HEARTS);
});

// ── Lee Van Kliff ───────────────────────────────────────────────────────────
// „Během svého tahu smí odhodit kartu BANG! a zopakovat efekt hnědé karty, kterou
// právě zahrál." Podrobnosti (a všechny FAQ, které se sem vešly) jsou v komentáři
// u useLeeVanKliff v logic/wildWest.js.

// Lee na tahu + `n` hráčů, turnId nastavené (paměť se váže na tah).
function lvkGame(n = 3, opts = {}) {
    const specs = [{ role: 'Sheriff', character: 'Lee Van Kliff', maxHealth: 4 }];
    for (let i = 1; i < n; i++) specs.push({ role: i === 1 ? 'Outlaw' : 'Renegade' });
    const g = mkGame(specs, { current: 0 });
    g.turnId = 7;
    if (opts.zuctovani) g.activeWws = wws('ZUCTOVANI');
    return g;
}

test('Lee Van Kliff: hnědá karta se zapamatuje, modrá ani zelená paměť nesmažou', () => {
    const g = lvkGame(3);
    const b = bang(g, 0);
    g.playBang(0, 1, b);
    g.handleResponse(1, null);
    assert.equal(g._lastBrown.effect, 'BANG');
    assert.equal(g._lastBrown.cardId, g.deck.discardTop().id);
    // Modrá (Mustang) i zelená (Čutora) jdou na stůl a paměti se netýkají.
    g.playCard(give(g, 0, CardType.EQUIPMENT, { name: 'Mustang', props: { effect: 'mustang' } }));
    g.playCard(give(g, 0, CardType.CANTEEN, { name: 'Čutora', props: { green: true, activate: 'heal_self' } }));
    assert.equal(g._lastBrown.effect, 'BANG', 'paměť drží poslední HNĚDOU kartu');
    // Vězení je modré, i když se vykládá před soupeře.
    g.playSpecialCard(0, 1, give(g, 0, CardType.JAIL, { name: 'Vězení' }));
    assert.equal(g._lastBrown.effect, 'BANG');
});

test('Lee Van Kliff: paměť patří jednomu tahu a na začátku dalšího mizí', () => {
    const g = lvkGame(3);
    g.players[0].health = 2;   // Salon bez zraněného hráče není zahraný
    g.playCard(give(g, 0, CardType.SALOON, { name: 'Salon' }));
    assert.equal(g._lastBrown.effect, 'SALOON');
    g.phase = 'DISCARD';
    g.nextTurn();
    assert.equal(g._lastBrown, null);
});

test('Lee Van Kliff: opakovaný Bang! smí na JINÝ cíl a nečerpá limit 1×/tah (Q13)', () => {
    const g = lvkGame(3);
    const b = bang(g, 0);
    bang(g, 0);                       // cena za opakování
    g.playBang(0, 1, b);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);

    const lb = lvkOffer(g, g.players[0], 0);
    assert.equal(lb.effect, 'BANG');
    const res = g.useLeeVanKliff(0, g.players[0].hand[0].id, 2);
    assert.ok(res, 'opakování prošlo');
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(2, null);
    assert.equal(g.players[2].health, 3, 'zasáhlo to jiného hráče');
    assert.equal(g.players[0].bangsPlayedThisTurn, 1, 'limit se nezvýšil');
    assert.equal(g.players[0].hand.length, 0, 'zaplacený Bang! je pryč');
});

test('Lee Van Kliff: každý efekt jen jednou', () => {
    const g = lvkGame(3);
    const b = bang(g, 0);
    bang(g, 0); bang(g, 0);
    g.playBang(0, 1, b);
    g.handleResponse(1, null);
    g.useLeeVanKliff(0, g.players[0].hand[0].id, 2);
    g.handleResponse(2, null);
    assert.equal(g._lastBrown.repeated, true);
    assert.equal(lvkOffer(g, g.players[0], 0), null);
    assert.equal(g.useLeeVanKliff(0, g.players[0].hand[0].id, 2), null);
    assert.equal(g.players[0].hand.length, 1, 'druhá karta se nespotřebovala');
});

test('Lee Van Kliff: zaplatit jde jen kartou BANG! – pod Zúčtováním libovolnou', () => {
    const g = lvkGame(3);
    const b = bang(g, 0);
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.playBang(0, 1, b);
    g.handleResponse(1, null);
    const beerCard = g.players[0].hand.find(c => c.type === CardType.BEER);
    assert.equal(lvkPayOk(g, g.players[0], 0, beerCard), false);
    assert.equal(g.useLeeVanKliff(0, beerCard.id, 2), null);
    // Zúčtování dělá kartu Bang! z čehokoli (poznámka v pravidlech k Lee Van Kliffovi).
    g.activeWws = wws('ZUCTOVANI');
    assert.equal(lvkPayOk(g, g.players[0], 0, beerCard), true);
    assert.ok(g.useLeeVanKliff(0, beerCard.id, 2));
});

test('Lee Van Kliff × Apache Kid: rozhoduje barva PŮVODNÍ karty (Sciarra Q12)', () => {
    const g = mkGame([
        { role: 'Sheriff', character: 'Lee Van Kliff' },
        { role: 'Outlaw', character: 'Apache Kid' },
        { role: 'Renegade' },
    ], { current: 0 });
    g.turnId = 3;
    // Původní karta ♦ (Apache ji ignoruje), zaplacená ♣ – opakování ho stejně mine.
    const b = bang(g, 0, { suit: Suits.DIAMONDS });
    bang(g, 0, { suit: Suits.CLUBS });
    g.playBang(0, 2, b);
    g.handleResponse(2, null);
    assert.ok(g.useLeeVanKliff(0, g.players[0].hand[0].id, 1));
    assert.equal(g.phase, 'PLAY', 'kárový Bang! na Apache Kida nemá efekt');
    assert.equal(g.players[1].health, 4);
});

test('Lee Van Kliff: opakovaný Dostavník NEOTOČÍ kartu Divokého západu (Sciarra Q19)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Lee Van Kliff' }, {}, {}], { current: 0 });
    g.turnId = 3;
    g.wwsCardData = wwsData;
    g._setupWwsDeck({ expansions: { divoky_zapad: true } });
    for (let i = 0; i < 10; i++) g.deck.cards.push(mkCard(CardType.BANG, { name: 'Bang!' }));
    g.playCard(give(g, 0, CardType.STAGECOACH, { name: 'Dostavník' }));
    const afterFirst = g.activeWws;
    assert.ok(afterFirst, 'první zahrání kartu odkrylo');
    assert.equal(g.wwsDeck.length, 9);
    // Dolízni obě karty, ať je zase fáze PLAY.
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');

    const payId = g.players[0].hand.find(c => c.type === CardType.BANG).id;
    assert.ok(g.useLeeVanKliff(0, payId, null));
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.equal(g.activeWws, afterFirst, 'událost se nevyměnila');
    assert.equal(g.wwsDeck.length, 9);
});

test('Lee Van Kliff: cena „odhoď další kartu" se podruhé neplatí (Sciarra Q29)', () => {
    const g = lvkGame(3);
    g.players[0].health = 1;
    const w = give(g, 0, CardType.WHISKY, { name: 'Whisky', props: { discardExtra: 'heal_self_2' } });
    give(g, 0, CardType.BANG, { name: 'Bang!' });   // cena za Whisky
    give(g, 0, CardType.BANG, { name: 'Bang!' });   // cena za opakování
    g.startDiscardExtra(w, { targetIdx: null });
    g.discardAnotherCard(0, g.players[0].hand.findIndex(c => c.type === CardType.BANG));
    assert.equal(g.players[0].health, 3);
    assert.equal(g._lastBrown.effect, 'heal_self_2');
    assert.equal(g.players[0].hand.length, 1);

    assert.ok(g.useLeeVanKliff(0, g.players[0].hand[0].id, null));
    assert.equal(g.players[0].health, 4, 'druhé +2 (do maxima), bez další ceny');
    assert.equal(g.players[0].hand.length, 0);
});

test('Lee Van Kliff × Madam Zuzana: opakování je zahraná karta, cena ne (Sciarra Q24)', () => {
    const g = lvkGame(3);
    const b = bang(g, 0);
    bang(g, 0);
    g.players[0]._playedThisTurn = 0;
    g.playBang(0, 1, b);
    g.handleResponse(1, null);
    assert.equal(g.players[0]._playedThisTurn, 1);
    g.useLeeVanKliff(0, g.players[0].hand[0].id, 2);
    assert.equal(g.players[0]._playedThisTurn, 2, 'zopakování se počítá, odhozený Bang! ne');
});

test('Lee Van Kliff: Panika! se opakuje přes normální výběr karty (i na jiný cíl)', () => {
    const g = lvkGame(3);
    const pan = give(g, 0, CardType.PANIC, { name: 'Panika!' });
    bang(g, 0);
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    give(g, 2, CardType.BEER, { name: 'Pivo' });
    g.playSpecialCard(0, 1, pan);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'hand', null);
    assert.equal(g.players[0].hand.length, 2, 'Bang! + ukradené Pivo');

    assert.equal(lvkTargetOk(g, g.players[0], 0, 2), true);
    const payId = g.players[0].hand.find(c => c.type === CardType.BANG).id;
    assert.ok(g.useLeeVanKliff(0, payId, 2));
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.targetIdx, 2);
    g.resolveCardSelection(0, 'hand', null);
    assert.equal(g.players[2].hand.length, 0);
    assert.equal(g.phase, 'PLAY');
});

test('Lee Van Kliff: Panika! na dosah 1, Cat Balou bez omezení vzdálenosti', () => {
    const g = lvkGame(4);
    give(g, 2, CardType.BEER, { name: 'Pivo' });
    const pan = give(g, 0, CardType.PANIC, { name: 'Panika!' });
    bang(g, 0);
    g.playSpecialCard(0, 1, pan);
    g.resolveCardSelection(0, 'hand', null);   // p1 má prázdnou ruku, jen doběhne fáze
    assert.equal(lvkTargetOk(g, g.players[0], 0, 2), false, 'p2 je na vzdálenost 2');
    assert.equal(lvkTargetOk(g, g.players[0], 0, 1), false, 'p1 nemá co vzít');
    assert.equal(lvkOffer(g, g.players[0], 0), null, 'bez cíle se opakování nenabízí');
});

test('Lee Van Kliff: opakovaný Ragtime smí i na VLASTNÍ stůl, z vlastní ruky ne', () => {
    const g = lvkGame(3);
    const rag = give(g, 0, CardType.RAGTIME, { name: 'Ragtime', props: { discardExtra: 'steal_any' } });
    bang(g, 0);   // cena za Ragtime
    bang(g, 0);   // cena za opakování
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    g.startDiscardExtra(rag, { targetIdx: 1, area: 'hand', boardIdx: null });
    g.discardAnotherCard(0, g.players[0].hand.findIndex(c => c.type === CardType.BANG));
    assert.equal(g._lastBrown.effect, 'steal_any');

    // Vlastní stůl je platný cíl (Dynamit si vezmu zpátky do ruky), vlastní ruka ne.
    assert.equal(lvkTargetOk(g, g.players[0], 0, 0), true);
    const payId = g.players[0].hand.find(c => c.type === CardType.BANG).id;
    assert.ok(g.useLeeVanKliff(0, payId, 0));
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    const handBefore = g.players[0].hand.length;
    g.resolveCardSelection(0, 'hand', null);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD', 'z vlastní ruky se nebere');
    assert.equal(g.players[0].hand.length, handBefore);
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.players[0].board.length, 0);
    assert.equal(g.players[0].hand.some(c => c.type === CardType.DYNAMITE), true);
    assert.equal(g.phase, 'PLAY');
});

test('Lee Van Kliff: bot opakování nabídne a server ho přijme', () => {
    const g = lvkGame(3);
    const b = bang(g, 0);
    bang(g, 0);
    g.playBang(0, 1, b);
    g.handleResponse(1, null);
    const plain = JSON.parse(JSON.stringify(g));
    const beliefs = computeBeliefs(plain, 0, {});
    const act = decideBotAction(plain, 0, beliefs);
    assert.equal(act.event, 'lee_van_kliff');
    assert.ok(g.useLeeVanKliff(0, act.payload.cardId, act.payload.targetIdx),
              'akce bota je pro server platná');
});

test('Lee Van Kliff: opakovaný Kulomet si nese barvu PŮVODNÍ karty (Apache Kid)', () => {
    const g = mkGame([
        { role: 'Sheriff', character: 'Lee Van Kliff' },
        { role: 'Outlaw', character: 'Apache Kid' },
        { role: 'Renegade' },
    ], { current: 0 });
    g.turnId = 6;
    bang(g, 0, { suit: Suits.CLUBS });
    g.playCard(give(g, 0, CardType.GATLING, { name: 'Kulomet', suit: Suits.DIAMONDS }));
    while (g.phase === 'RESPOND') g.handleResponse(g.pendingResponse.targetIdx, null);
    assert.equal(g.players[1].health, 4, 'kárový Kulomet Apache Kida minul');
    assert.equal(g.players[2].health, 3);

    assert.ok(g.useLeeVanKliff(0, g.players[0].hand[0].id, null));
    while (g.phase === 'RESPOND') g.handleResponse(g.pendingResponse.targetIdx, null);
    assert.equal(g.players[1].health, 4, 'opakování se řídí barvou Kulometu, ne odhozeného Bang!');
    assert.equal(g.players[2].health, 2);
});

test('Lee Van Kliff: opakovaný Odstřelovač si pořád žádá dvě karty Vedle!', () => {
    const g = mkGame([
        { role: 'Sheriff', character: 'Lee Van Kliff' },
        { role: 'Outlaw' }, { role: 'Renegade' },
    ], { current: 0 });
    g.turnId = 6;
    g.activeFistful = ffData.find(c => c.key === 'ODSTRELOVAC');
    const b = bang(g, 0);
    bang(g, 0); bang(g, 0);
    g.startSniper(b, 1);
    g.discardAnotherCard(0, g.players[0].hand.findIndex(c => c.id !== g.pendingDiscardAnother.mainCardId));
    assert.equal(g.missesRequired, 2);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g._lastBrown.effect, 'sniper');

    assert.ok(g.useLeeVanKliff(0, g.players[0].hand[0].id, 1));
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 2, 'opakuje se Odstřelovač, ne obyčejný Bang!');
});

test('Lee Van Kliff: opakované Hokynářství rozdá druhou nabídku', () => {
    const g = lvkGame(3);
    for (let i = 0; i < 20; i++) g.deck.cards.push(mkCard(CardType.BANG, { name: 'Bang!' }));
    bang(g, 0);
    g.playCard(give(g, 0, CardType.STORE, { name: 'Hokynářství' }));
    assert.equal(g.storeCards.length, 3);
    while (g.phase === 'STORE') g.pickFromStore(g.storePickerIndex, 0);
    assert.equal(g.phase, 'PLAY');

    const payId = g.players[0].hand.find(c => c.type === CardType.BANG).id;
    assert.ok(g.useLeeVanKliff(0, payId, null));
    assert.equal(g.phase, 'STORE');
    assert.equal(g.storeCards.length, 3, 'druhá nabídka leží na stole');
});
