// Zvláštní pravidla pro 3 hráče z rozšíření Město duchů.
//
// U stolu nesedí šerif, ale pomocník, bandita a odpadlík; všechny tři role leží lícem
// nahoru. Cíle jsou v kruhu (TARGET_3P): pomocník loví odpadlíka, odpadlík banditu,
// bandita pomocníka. Kdo svého určeného nepřítele vyřadí OSOBNĚ, vyhrává hned; zabije-li
// ho někdo jiný, novým cílem obou zbylých je zůstat naživu jako poslední. Odměnu 3 karet
// dostane každý, kdo někoho vyřadil, bez ohledu na role.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, CardType, Suits, GameState } = require('./_helpers.js');
const { TARGET_3P } = require('../core/roles.js');

before(() => { console.log = () => {}; });

const cardData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.json'), 'utf8'));

// Hra pro 3 postavená ručně (mkGame nemíchá) + zapnutý režim, jak ho nastaví setupGame.
function mk3p(opts = {}) {
    const g = mkGame([
        { role: 'Deputy', name: 'Pom' },
        { role: 'Outlaw', name: 'Ban' },
        { role: 'Renegade', name: 'Odp' },
    ], opts);
    g.mode3p = true;
    g._winClaim3p = null;
    return g;
}

// ── Odměna za zabití: 3 karty komukoli ───────────────────────────────────────
test('3P: zabití kohokoli dá útočníkovi 3 karty (ne jen za banditu)', () => {
    // pomocník (0) zabije banditu (1) – to NENÍ jeho cíl, odměnu ale dostane
    const g = mk3p();
    g.players[1].health = 1;
    g.handlePlayerDeath(1, 0);
    assert.deepEqual(g.specialActionQueue.filter(a => a.type === 'KILL_REWARD'),
        [{ type: 'KILL_REWARD', playerIdx: 0, cardsNeeded: 3 }]);
});

test('3P: dynamit (bez útočníka) odměnu nedává a výhru nezakládá', () => {
    const g = mk3p();
    g.players[2].health = 0;
    g.handlePlayerDeath(2, null);
    assert.equal(g.specialActionQueue.filter(a => a.type === 'KILL_REWARD').length, 0);
    assert.equal(g._winClaim3p, null);
    assert.equal(g.winner, null);   // zbývají dva, hraje se dál
});

test('3P: sebevražda (útočník == mrtvý) odměnu nedává', () => {
    const g = mk3p();
    g.players[0].health = 0;
    g.handlePlayerDeath(0, 0);
    assert.equal(g.specialActionQueue.filter(a => a.type === 'KILL_REWARD').length, 0);
    assert.equal(g._winClaim3p, null);
});

// ── Výhra osobním zásahem do vlastního cíle ──────────────────────────────────
test('3P: pomocník osobně vyřadí odpadlíka → vyhrává hned', () => {
    const g = mk3p();
    assert.equal(TARGET_3P.Deputy, 'Renegade');
    g.players[2].health = 0;
    g.handlePlayerDeath(2, 0);
    assert.equal(g._winClaim3p, 0);
    assert.equal(g.winner, 'Pomocník vyhrál!');
});

test('3P: odpadlík osobně vyřadí banditu → vyhrává hned', () => {
    const g = mk3p();
    g.players[1].health = 0;
    g.handlePlayerDeath(1, 2);
    assert.equal(g.winner, 'Odpadlík vyhrál!');
});

test('3P: bandita osobně vyřadí pomocníka → vyhrává hned', () => {
    const g = mk3p();
    g.players[0].health = 0;
    g.handlePlayerDeath(0, 1);
    assert.equal(g.winner, 'Bandita vyhrál!');
});

test('3P: vítěz se nikdy nehlásí v množném čísle', () => {
    for (const [dead, killer] of [[2, 0], [1, 2], [0, 1]]) {
        const g = mk3p();
        g.players[dead].health = 0;
        g.handlePlayerDeath(dead, killer);
        assert.ok(g.winner && !/vyhráli/.test(g.winner), `množné číslo: ${g.winner}`);
        assert.ok(!/Zákon|Bandité/.test(g.winner), `strana místo role: ${g.winner}`);
    }
});

// ── Zabije-li cíl někdo jiný, nikdo nevyhrává a zbylí dva se pobijí ──────────
test('3P: bandita zabije odpadlíka → pomocník NEvyhrává, hraje se dál', () => {
    // bandita (1) má cílem pomocníka; odpadlík (2) je cílem pomocníka (0)
    const g = mk3p();
    g.players[2].health = 0;
    g.handlePlayerDeath(2, 1);
    assert.equal(g._winClaim3p, null);
    assert.equal(g.winner, null);
    // odměnu za zabití bandita přesto dostane
    assert.deepEqual(g.specialActionQueue.filter(a => a.type === 'KILL_REWARD'),
        [{ type: 'KILL_REWARD', playerIdx: 1, cardsNeeded: 3 }]);
});

test('3P: novým cílem je zůstat naživu jako poslední (vyhraje jediný živý)', () => {
    const g = mk3p();
    g.players[2].health = 0;
    g.handlePlayerDeath(2, 1);          // bandita zabil odpadlíka → nikdo nevyhrál
    assert.equal(g.winner, null);
    g.players[0].health = 0;
    g.handlePlayerDeath(0, 1);          // bandita dorazil pomocníka = svůj cíl
    assert.equal(g.winner, 'Bandita vyhrál!');
});

test('3P: poslední živý vyhraje i bez osobního zásahu (druhá smrt dynamitem)', () => {
    const g = mk3p();
    g.players[2].health = 0;
    g.handlePlayerDeath(2, 1);          // bandita zabil odpadlíka
    g.players[1].health = 0;
    g.handlePlayerDeath(1, null);       // bandita vyletěl na dynamitu
    assert.equal(g.winner, 'Pomocník vyhrál!');
});

// ── Co ve hře pro 3 zmizí samo, protože není šerif ───────────────────────────
test('3P: Vězení jde zahrát na kohokoli (žádný šerif)', () => {
    const g = mk3p();
    const jail = give(g, 0, CardType.JAIL, { suit: Suits.HEARTS });
    g.playSpecialCard(0, 1, jail);
    assert.equal(g.players[1].board.filter(c => c.type === CardType.JAIL).length, 1);

    const g2 = mk3p();
    const jail2 = give(g2, 0, CardType.JAIL, { suit: Suits.HEARTS });
    g2.playSpecialCard(0, 2, jail2);
    assert.equal(g2.players[2].board.filter(c => c.type === CardType.JAIL).length, 1);
});

test('3P: nikdo nemá bonusový život (šerifův +1 se neuplatní)', () => {
    const g = new GameState();
    g.cardData = cardData;
    g.setupGame(3, ['A', 'B', 'C'], {});
    assert.equal(g.mode3p, true);
    g.autoSelectAllCharacters();
    for (const p of g.players) {
        assert.equal(p.maxHealth, p._baseHealth, `${p.name} má bonus životů`);
    }
});

// ── Kdo začíná a na čí tah se odkrývá karta High Noon ────────────────────────
test('3P: hru začíná pomocník', () => {
    const g = new GameState();
    g.cardData = cardData;
    g.setupGame(3, ['A', 'B', 'C'], {});
    g.autoSelectAllCharacters();
    assert.equal(g.players[g.currentPlayerIndex].role, 'Deputy');
});

test('3P: kolo počítá tah pomocníka (odkrytí události až od jeho 2. tahu)', () => {
    const g = mk3p();
    g.eventDeck = [{ key: 'A', name: 'Udalost A' }, { key: 'B', name: 'Udalost B' }];
    const depIdx = g.players.findIndex(p => p.role === 'Deputy');

    g.currentPlayerIndex = (depIdx + 1) % 3;   // někdo jiný na tahu → nic
    g._flipEvent();
    assert.equal(g.activeEvent, null);

    g.currentPlayerIndex = depIdx;             // 1. tah pomocníka → jen se počítá
    g._flipEvent();
    assert.equal(g.activeEvent, null);
    assert.equal(g._sheriffTurns, 1);

    g._flipEvent();                            // 2. tah pomocníka → odkryje
    assert.equal(g.activeEvent?.key, 'B');
});

test('3P: Daltonové začínají u pomocníka', () => {
    const g = mk3p();
    const depIdx = g.players.findIndex(p => p.role === 'Deputy');
    g.currentPlayerIndex = (depIdx + 2) % 3;
    board(g, 0, CardType.BARREL);
    board(g, 1, CardType.BARREL);
    board(g, 2, CardType.BARREL);
    g._startDaltons();
    // _startDaltons hned pustí na řadu prvního z fronty (_advanceDaltons ho odebere).
    assert.equal(g.pendingSelection?.targetIdx, depIdx);
    assert.deepEqual(g.daltonsQueue, [(depIdx + 1) % 3, (depIdx + 2) % 3]);
});

// ── Režim se nezapne tam, kde nemá ───────────────────────────────────────────
test('3P režim se nezapne u 4 hráčů ani v debug hře pro 3 se šerifem', () => {
    const g4 = new GameState();
    g4.cardData = cardData;
    g4.setupGame(4, ['A', 'B', 'C', 'D'], {});
    assert.equal(g4.mode3p, false);

    const gd = new GameState();
    gd.cardData = cardData;
    gd.setupDebugGame(3, ['A', 'B', 'C'], ['Sheriff', 'Outlaw', 'Renegade'], {});
    assert.equal(gd.mode3p, false);
});

test('klasická hra se vyhodnocuje po stranách i dál (mode3p vypnutý)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.players[1].health = 0;
    g.players[2].health = 0;
    g.checkWinCondition();
    assert.equal(g.winner, 'Zákon vyhrál!');
});

// ── Pivo nemá efekt, když jsou ve hře jen dva hráči ──────────────────────────
// Pravidlo platí pro všechny počty hráčů; ve hře pro 3 se do koncovky 1v1 dojde vždycky.
test('Pivo se nezahraje, když zbývají dva živí hráči', () => {
    const g = mkGame([{ role: 'Deputy' }, { role: 'Outlaw' }, { role: 'Renegade', health: 0 }]);
    g.mode3p = true;
    g.players[0].health = 2;
    const beer = give(g, 0, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.players[0].health, 2, 'Pivo nesmí léčit');
    assert.equal(g.players[0].hand.length, 1, 'karta zůstává v ruce');
});

test('Pivo léčí, dokud jsou ve hře tři a víc (i v klasické hře)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.players[0].health = 2;
    const beer = give(g, 0, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].hand.length, 0);
});

test('Salon léčí i ve dvou (zákaz platí jen na kartu Pivo)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade', health: 0 }]);
    g.players[0].health = 2;
    g.players[1].health = 1;
    const salon = give(g, 0, CardType.SALOON);
    g.playCard(salon);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[1].health, 2);
});
