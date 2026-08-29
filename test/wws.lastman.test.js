// Rozšíření Divoký západ – karta „Divoký západ" (fáze 8), ta vespod balíčku.
//
//   „Cílem každého hráče se stává: Zůstaň poslední ve hře!"
//
// Výhra je INDIVIDUÁLNÍ (vypisuje se jméno hráče, ne role) a smrt šerifa hru nekončí.
// Role přitom zůstávají v platnosti: šerif nesmí do vězení, odměna 3 karet za banditu
// i šerifova pokuta za vlastního pomocníka platí dál (FAQ Q15).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, CardType } = require('./_helpers.js');
const { evaluateWinner } = require('../core/winCondition.js');
const { roleHostility } = require('../core/beliefs.js');
const { rankEnemies } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const wwsData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.divoky_zapad.json'), 'utf8'));
const wws = key => wwsData.find(c => c.key === key);

// Hra s právě platnou kartou „Divoký západ".
function mkLast(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.activeWws = wws('DIVOKY_ZAPAD');
    return g;
}

// ── evaluateWinner: čistá podmínka výhry ────────────────────────────────────

test('Divoký západ: vyhrává poslední živý, a to JMÉNEM, ne rolí', () => {
    const players = [
        { name: 'Anna', role: 'Sheriff', health: 0 },
        { name: 'Bob', role: 'Outlaw', health: 0 },
        { name: 'Cyril', role: 'Deputy', health: 2 },
    ];
    assert.equal(evaluateWinner(players, { lastManStanding: true }), 'Cyril vyhrál!');
    // Bez karty by pomocník se šerifem v hrobě znamenal výhru banditů.
    assert.equal(evaluateWinner(players), 'Bandité vyhráli!');
});

test('Divoký západ: dokud žijí dva, hra pokračuje (i když je šerif mrtvý)', () => {
    const players = [
        { name: 'Anna', role: 'Sheriff', health: 0 },
        { name: 'Bob', role: 'Outlaw', health: 3 },
        { name: 'Cyril', role: 'Deputy', health: 2 },
    ];
    assert.equal(evaluateWinner(players, { lastManStanding: true }), null);
});

test('Divoký západ: samotný zákon u stolu ještě nevyhrál', () => {
    const players = [
        { name: 'Anna', role: 'Sheriff', health: 4 },
        { name: 'Bob', role: 'Deputy', health: 3 },
        { name: 'Cyril', role: 'Outlaw', health: 0 },
    ];
    // Klasicky by v tuhle chvíli „Zákon vyhrál!" – pod kartou se musí dobojovat.
    assert.equal(evaluateWinner(players), 'Zákon vyhrál!');
    assert.equal(evaluateWinner(players, { lastManStanding: true }), null);
});

test('Divoký západ: duch (Město duchů) se počítá za živého', () => {
    const players = [
        { name: 'Anna', role: 'Sheriff', health: 0, _ghost: true },
        { name: 'Bob', role: 'Outlaw', health: 2 },
    ];
    assert.equal(evaluateWinner(players, { lastManStanding: true }), null);
});

// ── Hra pro 3 hráče: karta ruší cíle v kruhu i získaný nárok ────────────────

test('Divoký západ přebíjí pravidla pro 3 hráče (nárok z vlastního cíle neplatí)', () => {
    const players = [
        { name: 'Anna', role: 'Deputy', health: 3 },
        { name: 'Bob', role: 'Outlaw', health: 2 },
        { name: 'Cyril', role: 'Renegade', health: 0 },
    ];
    // Bez karty: pomocník vyřadil svého určeného nepřítele (Renegade) → vyhrál hned.
    assert.equal(evaluateWinner(players, { mode3p: true, winClaimIdx: 0 }), 'Pomocník vyhrál!');
    // S kartou: cíle v kruhu neplatí, hraje se na posledního živého.
    assert.equal(evaluateWinner(players, { mode3p: true, winClaimIdx: 0, lastManStanding: true }), null);
});

test('Divoký západ ve hře pro 3: nárok se ani nezískává', () => {
    const g = mkLast([{ role: 'Deputy' }, { role: 'Outlaw' }, { role: 'Renegade', health: 1 }]);
    g.mode3p = true;
    g.players[2].health = 0;
    g.handlePlayerDeath(2, 0);              // pomocník vyřadil svůj cíl (odpadlíka)
    assert.equal(g._winClaim3p, null, 'nárok se pod kartou nezískává');
    assert.equal(g.winner, null, 'a hra pokračuje – žijí ještě dva');
    // 3 karty za vyřazení ve hře pro tři zůstávají.
    assert.ok(g.specialActionQueue.some(q => q.type === 'KILL_REWARD' && q.playerIdx === 0
                                             && q.cardsNeeded === 3));
});

// ── GameState: smrt šerifa hru nekončí ──────────────────────────────────────

test('Divoký západ: smrt šerifa hru neukončí a poslední živý vyhraje', () => {
    const g = mkLast([{ role: 'Sheriff', name: 'Anna', health: 1 },
                      { role: 'Outlaw', name: 'Bob' },
                      { role: 'Outlaw', name: 'Cyril' }]);
    g.players[0].health = 0;
    g.handlePlayerDeath(0, 1);
    assert.equal(g.winner, null, 'bandité ještě nevyhráli – žijí dva');
    g.players[2].health = 0;
    g.handlePlayerDeath(2, 1);
    assert.equal(g.winner, 'Bob vyhrál!');
});

test('Divoký západ: vyhrát může i pomocník, kterému umřel šerif', () => {
    const g = mkLast([{ role: 'Sheriff', name: 'Anna' },
                      { role: 'Deputy', name: 'Bob' },
                      { role: 'Outlaw', name: 'Cyril' }]);
    g.players[2].health = 0;
    g.handlePlayerDeath(2, 1);
    assert.equal(g.winner, null, 'klasicky by tady vyhrál zákon');
    g.players[0].health = 0;
    g.handlePlayerDeath(0, 1);
    assert.equal(g.winner, 'Bob vyhrál!');
});

// ── Role zůstávají v platnosti (FAQ Q15) ────────────────────────────────────

test('Divoký západ: odměna 3 karet za vyřazení bandity platí dál', () => {
    const g = mkLast([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                      { role: 'Renegade' }]);
    g.players[1].health = 0;
    g.handlePlayerDeath(1, 0);
    assert.ok(g.specialActionQueue.some(q => q.type === 'KILL_REWARD' && q.playerIdx === 0
                                             && q.cardsNeeded === 3),
              'zabijákovi bandity pořád náleží 3 karty');
});

test('Divoký západ: šerifova pokuta za vlastního pomocníka platí dál', () => {
    const g = mkLast([{ role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Outlaw' },
                      { role: 'Renegade' }]);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BEER);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    g.players[0].weapon = mkCard(CardType.WEAPON, { name: 'Winchester', props: { range: 5 } });
    g.players[1].health = 0;
    g.handlePlayerDeath(1, 0);
    assert.equal(g.players[0].hand.length, 0, 'šerif přišel o ruku');
    assert.equal(g.players[0].board.length, 0, 'i o vyložené karty');
    assert.equal(g.players[0].weapon.name, 'Colt .45', 'zbraň se vrátila na Colt .45');
});

test('Divoký západ: šerifa pořád nejde poslat do vězení', () => {
    const g = mkLast([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    const idx = give(g, 1, CardType.JAIL, { name: 'Vězení' });
    g.currentPlayerIndex = 1;
    g.playSpecialCard(1, 0, idx);
    assert.equal(g.players[0].board.length, 0, 'na šerifově stole nic nepřistálo');
    assert.equal(g.players[1].hand.length, 1, 'karta zůstala v ruce');
});

// ── Karta se dalším Dostavníkem nevyměňuje ──────────────────────────────────

test('Divoký západ: dalším Dostavníkem se karta neodkrývá pryč', () => {
    const g = mkLast([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    g.wwsDeck = [wws('HRBITOV'), wws('SACAGAWAY')];
    g.wwsPile = [g.activeWws];
    assert.equal(g._flipWwsEvent(0), false);
    assert.equal(g.activeWws.key, 'DIVOKY_ZAPAD', 'zůstává v platnosti do konce hry');
    assert.equal(g.wwsDeck.length, 2, 'z balíčku se nic nelízlo');
    assert.equal(g.hasEvent('DIVOKY_ZAPAD'), true);
});

// ── Bot ─────────────────────────────────────────────────────────────────────

test('Divoký západ: pro bota je nepřítelem každý', () => {
    const opts = { lastManStanding: true };
    assert.ok(roleHostility('Sheriff', 'Deputy', opts) > 0, 'i vlastní pomocník');
    assert.ok(roleHostility('Deputy', 'Sheriff', opts) > 0, 'i vlastní šerif');
    assert.ok(roleHostility('Outlaw', 'Outlaw', opts) > 0, 'i spolubandita');
    // Hra pro 3: karta přebíjí i cíle v kruhu, takže se nepřátelskost nestupňuje.
    assert.equal(roleHostility('Deputy', 'Renegade', { mode3p: true, lastManStanding: true }), 1);
});

test('Divoký západ: šerif–bot má koho střílet i mezi samými spojenci', () => {
    const g = mkLast([{ role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Deputy' }]);
    const state = JSON.parse(JSON.stringify(g));
    const beliefs = state.players.map(p => {
        const d = { Sheriff: 0, Deputy: 0, Outlaw: 0, Renegade: 0 };
        d[p.role] = 1;
        return d;
    });
    const list = rankEnemies(state, 0, beliefs);
    assert.equal(list.length, 2, 'oba pomocníci jsou nepřátelé');
    assert.equal(list.desperate, false, 'a to bez nouzového cílení');
    // Bez karty by šerif na jisté pomocníky nesáhl vůbec.
    state.activeWws = null;
    assert.equal(rankEnemies(state, 0, beliefs).length, 0);
});
