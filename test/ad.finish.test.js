// Rozšíření Ozbrojení a nebezpeční – fáze A7 (dokončení): Zuřivá Doroty poroučí Šíp,
// Squaw a Bombu, Lee Van Kliff opakuje Šíp a Squaw (jeden cíl, bez vylepšení).
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §8 (A7) a R13 (tabulka AD_KINDS).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CardType, Suits, Card } = require('../logic.js');
const { dorothyTargets, dorothyPlayerOk, lvkOffer, lvkTargetOk } = require('../core/playability.js');
const { decideBotAction } = require('../core/botPolicy.js');
const A = require('../core/armed.js');
const { mkGame, mkCard, give } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const wwsData = rd('cards.divoky_zapad.json');

let _seq = 97000;
function adCard(name) {
    const row = adData.find(c => c.name === name);
    const c = new Card(_seq++, row.name, CardType[row.type], Suits[row.suit], row.value, row.props || {});
    c.effect = row.props?.effect || null;
    c.exp = row.exp; c.border = row.border; c.art = row.art;
    return c;
}
function giveAd(g, idx, name) {
    g.players[idx].hand.push(adCard(name));
    return g.players[idx].hand.length - 1;
}
function mkAd(specs, opts) {
    const g = mkGame(specs, opts);
    g.options = { expansions: { ozbrojeni: true, divoky_zapad: true } };
    g.adCardData = adData;
    g.turnId = 7;
    for (let i = 0; i < 20; i++) g.deck.cards.unshift(mkCard(CardType.MISSED, { suit: Suits.SPADES }));
    return g;
}
function mkDorothy(specs) {
    const g = mkAd(specs || [{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeWws = wwsData.find(c => c.key === 'ZURIVA_DOROTY');
    return g;
}
const kind = (g, name) => g._dorothyKinds().find(c => c.name === name);

// ── Zuřivá Doroty ────────────────────────────────────────────────────────────

test('AD_KINDS: Šíp, Squaw a Bomba jde poručit, LVK opakuje Šíp a Squaw (Bombu ne)', () => {
    for (const n of ['Šíp', 'Squaw', 'Bomba']) assert.equal(A.AD_KINDS[n].dorothy, true, n);
    assert.equal(A.AD_KINDS['Šíp'].lvk, true);
    assert.equal(A.AD_KINDS['Squaw'].lvk, true);
    assert.equal(A.AD_KINDS['Bomba'].lvk, false);
});

test('Doroty: Šíp jde na kohokoli kromě poručeného, bez ohledu na vzdálenost', () => {
    const g = mkDorothy();
    const k = kind(g, 'Šíp');
    assert.ok(k, 'Šíp je v katalogu druhů');
    assert.deepEqual(dorothyTargets(g, 1, k).sort(), [0, 2, 3]);
    assert.equal(dorothyPlayerOk(g, 0, k, 1), true);
    giveAd(g, 1, 'Šíp');
    give(g, 3, CardType.BANG, { name: 'Bang!' });
    const res = g.dorothyCommand(0, 'Šíp', 1);
    assert.deepEqual(res, { needTarget: true, commandedIdx: 1 });
    assert.equal(g.phase, 'DOROTHY_TARGET');
    const r2 = g.dorothyChooseTarget(0, 3);
    assert.ok(r2 && r2.played);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 3);
    assert.equal(g.pendingResponse.originatorIdx, 1, 'střílí poručený');
    assert.equal(g.currentPlayerIndex, 0, 'sedadlo se vrátilo');
    g.handleResponse(3, null);
    assert.equal(g.players[3].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0);
});

test('Doroty: Squaw smí mířit i na stůl samotného poručeného', () => {
    const g = mkDorothy();
    g.players[1].board.push(mkCard(CardType.BARREL, { name: 'Barel' }));
    g.players[2].board.push(mkCard(CardType.MUSTANG, { name: 'Mustang' }));
    const k = kind(g, 'Squaw');
    assert.deepEqual(dorothyTargets(g, 1, k).sort(), [1, 2]);
    giveAd(g, 1, 'Squaw');
    g.dorothyCommand(0, 'Squaw', 1);
    assert.equal(g.phase, 'DOROTHY_TARGET');
    g.dorothyChooseTarget(0, 2);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection?.targetIdx, 2);
});

test('Doroty: Bomba jde před kohokoli bez Bomby (i poručeného) a dostane 3 žetony', () => {
    const g = mkDorothy();
    const k = kind(g, 'Bomba');
    assert.deepEqual(dorothyTargets(g, 1, k).sort(), [0, 1, 2, 3]);
    giveAd(g, 1, 'Bomba');
    g.dorothyCommand(0, 'Bomba', 1);
    g.dorothyChooseTarget(0, 3);
    const bomb = A.adBombCard(g.players[3]);
    assert.ok(bomb, 'Bomba leží před cílem');
    assert.equal(A.adLoadsOf(bomb), 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0);
    // Druhou Bombu před téhož hráče ne.
    assert.equal(dorothyTargets(g, 1, k).includes(3), false);
});

// ── Lee Van Kliff ────────────────────────────────────────────────────────────

test('Lee Van Kliff zopakuje Šíp na jiný cíl (bez vylepšení)', () => {
    const g = mkAd([{ character: 'Lee Van Kliff' }, {}, {}, {}]);
    g.playSpecialCard(0, 2, giveAd(g, 0, 'Šíp'));
    g.handleResponse(2, null);
    assert.equal(g.players[2].health, 3);
    assert.equal(g._lastBrown?.effect, 'AD_ARROW');
    assert.equal(g._lastBrown?.aim, 'arrow');
    const b = give(g, 0, CardType.BANG, { name: 'Bang!' });
    assert.ok(lvkOffer(g, g.players[0], 0));
    assert.equal(lvkTargetOk(g, g.players[0], 0, 0), false, 'na sebe ne');
    assert.equal(lvkTargetOk(g, g.players[0], 0, 3), true, 'bez ohledu na vzdálenost');
    const res = g.useLeeVanKliff(0, g.players[0].hand[b].id, 3);
    assert.ok(res);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 3);
    g.handleResponse(3, null);
    assert.equal(g.players[3].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Lee Van Kliff zopakuje Squaw (karta ve hře do odhozu, i z vlastního stolu)', () => {
    const g = mkAd([{ character: 'Lee Van Kliff' }, {}, {}]);
    g.players[1].board.push(mkCard(CardType.MUSTANG, { name: 'Mustang' }));
    g.players[0].board.push(mkCard(CardType.JAIL, { name: 'Vězení' }));
    g.playSpecialCard(0, 1, giveAd(g, 0, 'Squaw'));
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g._lastBrown?.aim, 'squaw');
    const b = give(g, 0, CardType.BANG, { name: 'Bang!' });
    assert.equal(lvkTargetOk(g, g.players[0], 0, 0), true, 'vlastní Vězení');
    assert.equal(lvkTargetOk(g, g.players[0], 0, 1), false, 'stůl prázdný');
    // Bot si vlastní Vězení odhodí opakovanou Squaw (BANG! už vystřílel, jinak by střílel).
    g.players[0].bangsPlayedThisTurn = 1;
    const act = decideBotAction(g, 0);
    assert.equal(act.event, 'lee_van_kliff');
    assert.equal(act.payload.targetIdx, 0);
    g.useLeeVanKliff(0, g.players[0].hand[b].id, 0);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.players[0].board.length, 0);
    assert.equal(g.phase, 'PLAY');
});

// ── Celé rozšíření ve hře ────────────────────────────────────────────────────

test('A7: do balíčku jde všech 28 druhů, do výběru všech 8 postav, menu nic neslibuje navíc', () => {
    const { ARMED_CHARACTERS, AD_READY } = require('../logic/entities.js');
    const { MENU_EXPANSIONS, MENU_EXPANSIONS_SOON } = require('../core/menuModel.js');
    const kinds = [...new Set(adData.map(c => c.name))];
    assert.deepEqual(kinds.filter(n => !A.AD_CARDS_READY.includes(n)), [], 'každý druh je hotový');
    assert.deepEqual([...AD_READY].sort(), [...ARMED_CHARACTERS].sort());
    const row = MENU_EXPANSIONS.find(e => e.key === 'ozbrojeni');
    assert.ok(row, 'rozšíření jde zapnout');
    assert.match(row.hint, /28 karet a 8 postav/);
    assert.doesNotMatch(row.hint, /rozpracovan/i);
    assert.equal(MENU_EXPANSIONS_SOON.some(e => e.key === 'ozbrojeni'), false);
});
