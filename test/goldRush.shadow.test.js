// Zlatá horečka – varianta Stínoví pistolníci (fáze 7). Vyřazený hráč se na KAŽDÝ svůj
// tah vrací jako stín: 0 životů, které nejde získat ani ztratit, 2 karty, na konci tahu
// odhodí vše. Mimo svůj tah je mimo hru a do výhry se nepočítá. Viz logic/shadow.js.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { evaluateWinner } = require('../core/winCondition.js');
const { cardPlayability } = require('../core/playability.js');
const { isInPlay, canHeal } = require('../core/distance.js');
const { teamRole } = require('../core/roles.js');

before(() => { console.log = () => {}; });

const SHADOW_OPTS = { shadowGunslingers: true };

function mkShadowGame(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g._setupShadows(SHADOW_OPTS);
    // Karty do zásoby, ať fáze lízání nenaráží na prázdný balíček.
    for (let i = 0; i < 10; i++) topDeck(g, Suits.CLUBS);
    return g;
}

// Hráč 1 je vyřazený (role odhalená) a je na tahu jako stín.
function shadowTurn(specs, opts = {}) {
    const g = mkShadowGame(specs, opts);
    g.players.forEach(p => { if (p.health <= 0) p._roleRevealed = true; });
    g.currentPlayerIndex = 0;
    g.nextTurn();
    return g;
}

// ── Návrat do hry ───────────────────────────────────────────────────────────

test('stín: vyřazený se v pořadí nepřeskočí, vrací se s 0 životy a líže 2 karty', () => {
    const g = shadowTurn([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1]._shadow, true);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
});

test('bez varianty se vyřazený přeskočí a stínem se nestane', () => {
    const g = mkGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    g._setupShadows({});
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 2);
    assert.ok(!g.players[1]._shadow);
});

test('stín se vrací na KAŽDÝ svůj tah (ne jednou jako duch)', () => {
    const g = shadowTurn([{ role: 'Sheriff' }, { health: 0 }, {}]);
    g.phase = 'PLAY';
    g.tryEndTurn();                         // konec stínového tahu → hráč 2
    assert.equal(g.currentPlayerIndex, 2);
    assert.ok(!g.players[1]._shadow, 'mimo svůj tah je mimo hru');
    g.phase = 'PLAY'; g.tryEndTurn();       // → šerif
    g.phase = 'PLAY'; g.tryEndTurn();       // → zase stín
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1]._shadow, true);
});

test('Město duchů přebíjí variantu: vyřazený se vrátí jako duch se 3 kartami', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    g.hasEvent = (k) => k === 'MESTO_DUCHU';
    g.nextTurn();
    assert.equal(g.players[1]._ghost, true);
    assert.ok(!g.players[1]._shadow);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
});

// ── Ve hře jen po dobu svého tahu ──────────────────────────────────────────

test('stín je po dobu tahu ve hře (vzdálenost, dostřel), mimo tah ne', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    assert.equal(g.getDistance(1, 2), 999);
    g.players[1]._shadow = true;
    assert.equal(isInPlay(g.players[1]), true);
    assert.equal(g.getDistance(1, 2), 1);
    assert.equal(g.canHit(1, 2), true);
});

test('stín se do výhry nepočítá: zabije-li bandita-stín šerifa, vyhrávají bandité', () => {
    const g = mkShadowGame([{ role: 'Sheriff', health: 1 }, { role: 'Outlaw', health: 0 },
                            { role: 'Deputy' }, { role: 'Renegade' }]);
    g.players[1]._shadow = true;
    g.currentPlayerIndex = 1;
    g.handleDamage(0, 1);
    assert.equal(g.winner, 'Bandité vyhráli!');
});

test('stín se do výhry nepočítá: poslední živý bandita padne → vyhrává zákon, i když je na tahu stín banditů', () => {
    const players = [{ role: 'Sheriff', health: 3 }, { role: 'Outlaw', health: 0, _shadow: true },
                     { role: 'Deputy', health: 2 }];
    assert.equal(evaluateWinner(players), 'Zákon vyhrál!');
});

// ── Životy se nedají získat ani ztratit ────────────────────────────────────

test('stín nemůže ztratit život – zásah ho mine a útočník za něj valoun nedostane', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 0 }, {}, {}]);
    g._goldRush = true;
    g.players[1]._shadow = true;
    g.currentPlayerIndex = 1;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1]._shadow, true);
    assert.equal(g.players[0].nuggets || 0, 0);
    assert.equal(g.winner, null);
});

test('stín nemůže získat život – Pivo nejde zahrát, _heal i canHeal ho míjí', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    g.players[1]._shadow = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    assert.equal(canHeal(g.players[1]), false);
    assert.equal(g._heal(g.players[1], 2), 0);
    const beer = give(g, 1, CardType.BEER);
    assert.notEqual(cardPlayability(g, g.players[1], 1, g.players[1].hand[beer]), true, 'klient i bot se ptají stejně');
    g.playCard(beer);
    assert.equal(g.players[1].health, 0);
});

test('Salón vyléčí ostatní, stín ne', () => {
    const g = mkShadowGame([{ role: 'Sheriff', health: 2 }, { health: 0 }, {}, {}]);
    g.players[1]._shadow = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    g.playCard(give(g, 1, CardType.SALOON));
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[1].health, 0);
});

test('stín smí dál vydělávat valouny – za zranění, které způsobí', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 0 }, {}, {}]);
    g._goldRush = true;
    g.players[1]._shadow = true;
    g.players[1].nuggets = 2;
    g.currentPlayerIndex = 1;
    g.handleDamage(0, 1);
    assert.equal(g.players[1].nuggets, 3);
});

// ── Konec stínového tahu ───────────────────────────────────────────────────

test('konec tahu: stín odhodí ruku, stůl, zbraň i vybavení – bez fáze odhazování', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    g._goldRush = true;
    g.players[1]._shadow = true;
    g.players[1].nuggets = 4;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    give(g, 1, CardType.BANG);
    give(g, 1, CardType.MISSED);
    board(g, 1, CardType.BARREL);
    g.players[1].weapon = mkCard(CardType.WEAPON, { name: 'Remington' });
    g.players[1].gear = [{ id: 6100, effect: 'ZH_BOTY', border: 'black' }];
    const discardBefore = g.deck.discardPile.length;
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 2, 'tah jde dál bez DISCARD');
    const p = g.players[1];
    assert.deepEqual([p.hand.length, p.board.length, p.gear.length], [0, 0, 0]);
    assert.equal(p.weapon.id, -1, 'zpátky Colt .45');
    assert.equal(g.deck.discardPile.length, discardBefore + 4);
    assert.equal(g.gearPile.length, 1, 'vybavení jde pod balíček vybavení');
    assert.equal(p.nuggets, 4, 'valouny si nechává');
    assert.ok(!p._shadow);
    assert.equal(p.health, 0);
});

test('odchod stínu NENÍ vyřazení: Vulture Sam, Greg Digger ani Herb Hunter nic (FAQ Q09)', () => {
    const g = mkShadowGame([{ role: 'Sheriff', character: 'Vulture Sam' }, { health: 0 },
                            { character: 'Greg Digger', health: 1 }, { character: 'Herb Hunter' }]);
    g.players[1]._shadow = true;
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    give(g, 1, CardType.BANG);
    board(g, 1, CardType.BARREL);
    g.tryEndTurn();
    assert.equal(g.players[0].hand.length, 0, 'Vulture Sam nic nedostane');
    assert.equal(g.players[2].health, 1, 'Greg Digger se neléčí');
    assert.equal(g.specialActionQueue.length, 0, 'Herb Hunter nelíže');
    assert.equal(g.currentPlayerIndex, 2);
});

test('PRVNÍ vyřazení platí se vším všudy – Vulture Sam dostane karty', () => {
    const g = mkShadowGame([{ role: 'Sheriff', character: 'Vulture Sam' }, { role: 'Outlaw', health: 1 },
                            { role: 'Deputy' }, { role: 'Renegade' }]);
    give(g, 1, CardType.BANG);
    board(g, 1, CardType.BARREL);
    g.currentPlayerIndex = 0;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1]._roleRevealed, true);
    assert.equal(g.players[0].hand.length, 2);
});

test('valouny se při vyřazení nezahazují', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Deputy' }, {}]);
    g._goldRush = true;
    g.players[1].nuggets = 3;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[1].nuggets, 3);
});

test('dynamit se posouvá k dalšímu hráči, který je ve hře – stíny přeskočí', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { health: 0 }, {}, {}]);
    board(g, 0, CardType.DYNAMITE);
    g.currentPlayerIndex = 0;
    topDeck(g, Suits.HEARTS, '5');   // nevybuchne
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw(0);
    g.resolveCheck();
    const holder = g.players.findIndex(p => p.board.some(c => c.type === CardType.DYNAMITE));
    assert.equal(holder, 2, 'vyřazený (stín mimo svůj tah) se přeskočí');
});

// ── Stínový odpadlík ───────────────────────────────────────────────────────

test('stínový odpadlík: jen šerif odhalený → přidá se k zákonu (víc odhalených karet)', () => {
    const g = shadowTurn([{ role: 'Sheriff' }, { role: 'Renegade', health: 0 }, { role: 'Outlaw' }, { role: 'Deputy' }]);
    assert.equal(g.players[1]._shadow, true);
    assert.equal(g.players[1]._shadowSide, 'Deputy');
    assert.equal(teamRole(g.players[1]), 'Deputy');
});

test('stínový odpadlík: víc odhalených banditů → přidá se k banditům', () => {
    const g = shadowTurn([{ role: 'Sheriff' }, { role: 'Renegade', health: 0 },
                          { role: 'Outlaw', health: 0 }, { role: 'Outlaw', health: 0 }, { role: 'Deputy' }]);
    assert.equal(g.players[1]._shadowSide, 'Outlaw');
});

test('stínový odpadlík: remíza → k banditům', () => {
    const g = shadowTurn([{ role: 'Sheriff' }, { role: 'Renegade', health: 0 },
                          { role: 'Outlaw', health: 0 }, { role: 'Deputy' }]);
    assert.equal(g.players[1]._shadowSide, 'Outlaw');
});

test('stínový odpadlík: druhý odpadlík se počítá podle strany, ke které právě patří (FAQ Q02)', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { role: 'Renegade', health: 0 },
                            { role: 'Renegade', health: 0 }, { role: 'Outlaw', health: 0 }, { role: 'Deputy' }]);
    g.players.forEach(p => { if (p.health <= 0) p._roleRevealed = true; });
    // Druhý odpadlík bez strany se ignoruje: zákon 1 (šerif) : bandité 1 → remíza.
    assert.equal(g._shadowSideFor(1), 'Outlaw');
    // Přidal-li se k zákonu, počítá se tam: zákon 2 : bandité 1.
    g.players[2]._shadowSide = 'Deputy';
    assert.equal(g._shadowSideFor(1), 'Deputy');
});

test('stínový odpadlík vyhrává se stranou (evaluateWinner beze změny, rozhoduje playerWon)', () => {
    const g = mkShadowGame([{ role: 'Sheriff', health: 1 }, { role: 'Renegade', health: 0 },
                            { role: 'Outlaw', health: 0 }, { role: 'Deputy' }]);
    g.players[1]._shadow = true;
    g.players[1]._shadowSide = 'Outlaw';
    g.currentPlayerIndex = 1;
    g.handleDamage(0, 1);
    assert.equal(g.winner, 'Bandité vyhráli!');
});

test('navazující hra shodí stín i stranu', () => {
    const g = mkShadowGame([{ role: 'Sheriff' }, { role: 'Renegade', health: 0 }, {}]);
    g.players[1]._shadow = true;
    g.players[1]._shadowSide = 'Deputy';
    g._setupShadows({});
    assert.ok(!g.players[1]._shadow);
    assert.equal(g.players[1]._shadowSide, null);
    assert.equal(g._shadowsOn(), false);
});
