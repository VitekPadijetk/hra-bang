// Rozšíření Údolí stínů – fáze F5: karta Duch.
//
//   DUCH – „Polož před vyřazeného hráče. Ten se vrací do hry se svou postavou, ale
//          nemůže získat ani ztratit žádný život."
//
// Stav Ducha se ODVOZUJE z karty na stole (R10): isVosGhost / isInPlay / staysInPlay
// v core/distance.js. Odchod (karta zmizela ze stolu, Laso) uklízí _vosGhostSettle
// (logic/valley.js). Podklad: docs/udoli-stinu-plan.md §2.11, §4 a §8 (F5),
// docs/udoli-stinu.md §2 a §4 (Dynamite Box, odpovědi dV).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { Card, distinctCardKinds } = require('../logic/entities.js');
const { cardPlayability, dorothyTargets } = require('../core/playability.js');
const { getActionForCard } = require('../core/cardRules.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { evaluateWinner } = require('../core/winCondition.js');
const V = require('../core/valley.js');
const D = require('../core/distance.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);

let _vid = 79000;
function vcard(name, o = {}) {
    const k = kinds.find(c => c.name === name);
    assert.ok(k, name);
    const c = new Card(_vid++, k.name, k.type, o.suit ?? k.suit, o.value ?? k.value,
        { range: k.range, effect: k.effect, bangEffect: k.bangEffect });
    c.exp = 'udoli_stinu';
    return c;
}
function giveV(g, idx, name, o) {
    g.players[idx].hand.push(vcard(name, o));
    return g.players[idx].hand.length - 1;
}

const VOS_ON = { expansions: { udoli_stinu: true } };
// Stůl: specs = pole { role, character, health }. Vyřazení se značí `dead: true`.
function mkV(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.options = VOS_ON;
    g.turnId = 1;
    specs.forEach((s, i) => { if (s.dead) kill(g, i); });
    return g;
}
function kill(g, i) {
    g.players[i].health = 0;
    g.players[i]._roleRevealed = true;
}
// Zahraj Ducha z ruky hráče `by` na vyřazeného `to` (na chvíli je `by` na tahu).
function playDuch(g, by, to) {
    const idx = giveV(g, by, 'Duch');
    const cur = g.currentPlayerIndex, phase = g.phase;
    g.currentPlayerIndex = by;
    g.phase = 'PLAY';
    g.playSpecialCard(by, to, idx);
    g.currentPlayerIndex = cur;
    g.phase = phase;
    assert.ok(D.isVosGhost(g.players[to]), 'Duch položen');
}

// ── Data, hratelnost, vyložení ───────────────────────────────────────────────

test('Duch je hotový: jde do balíčku a míří se jako karta vykládaná před hráče', () => {
    assert.ok(V.VOS_CARDS_READY.includes('Duch'));
    assert.equal(getActionForCard(vcard('Duch')), 'Duch');
    assert.ok(V.VOS_PLACE_TYPES.includes('Duch'));
});

test('cílem je jen vyřazený hráč – ne živý, ne Duch, ne duch Města duchů na svůj tah', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }, { dead: true }]);
    const c = vcard('Duch');
    assert.equal(V.vosPlaceTargetOk(g, 0, c), false, 'sám sebe (hraje, takže žije)');
    assert.equal(V.vosPlaceTargetOk(g, 1, c), false, 'živý');
    assert.equal(V.vosPlaceTargetOk(g, 2, c), true, 'vyřazený');
    g.players[3]._ghost = true;   // Město duchů – na svůj tah ve hře
    assert.equal(V.vosPlaceTargetOk(g, 3, c), false);
    playDuch(g, 0, 2);
    assert.equal(V.vosPlaceTargetOk(g, 2, c), false, 'už je Duch');
});

test('bez vyřazeného hráče, pod Lasem ani pod Soudcem se Duch zahrát nedá', () => {
    const g = mkV([{ role: 'Sheriff' }, {}]);
    const c = vcard('Duch');
    g.players[0].hand.push(c);
    assert.equal(cardPlayability(g, g.players[0], 0, c), false, 'nikdo není vyřazený');
    kill(g, 1);
    assert.equal(cardPlayability(g, g.players[0], 0, c), true);
    g.activeFistful = { key: 'LASO' };
    assert.equal(cardPlayability(g, g.players[0], 0, c), false, 'Laso');
    g.activeFistful = { key: 'SOUDCE' };
    assert.equal(cardPlayability(g, g.players[0], 0, c), false, 'Soudce');
    g.playSpecialCard(0, 1, 0);
    assert.equal(g.players[0].hand.length, 1, 'server pod Soudcem odmítá');
});

test('zahrání: vyřazený je zpátky ve hře s nulou životů a svou postavou', () => {
    const g = mkV([{ role: 'Sheriff' }, { character: 'Bart Cassidy' }, { dead: true, character: 'Bill Noface' }]);
    playDuch(g, 0, 2);
    const p = g.players[2];
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(p.board[0].type, CardType.DUCH);
    assert.equal(p.health, 0);
    assert.ok(D.isVosGhost(p) && D.isInPlay(p) && D.staysInPlay(p));
    assert.equal(p.character, 'Bill Noface', 'postava i schopnost zůstávají (Dynamite Box)');
    assert.ok(p._roleRevealed, 'role zůstává odkrytá');
});

test('na živého hráče server Ducha nepoloží (karta zůstane v ruce)', () => {
    const g = mkV([{ role: 'Sheriff' }, {}]);
    const idx = giveV(g, 0, 'Duch');
    g.playSpecialCard(0, 1, idx);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[1].board.length, 0);
});

// ── „Nemůže získat ani ztratit žádný život" ──────────────────────────────────

test('Duch se nemůže léčit (Pivo, Salón, _heal, Nová identita)', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, {}, { dead: true }], { current: 3 });
    playDuch(g, 0, 3);
    const p = g.players[3];
    assert.equal(D.canHeal(p), false);
    assert.equal(g._heal(p, 2), 0);
    assert.equal(p.health, 0);
    const i = give(g, 3, CardType.BEER);
    assert.equal(cardPlayability(g, p, 3, p.hand[i]), false, 'Pivo nemá smysl');
    p._secondChar = 'Paul Regret';
    g.activeEvent = { key: 'NOVA_IDENTITA' };
    assert.equal(g._newIdentityOffer(), false, 'Nová identita by mu dala 2 životy');
});

test('na Ducha se nestřílí: dostřel, BANG!, Duel i hromadný útok ho míjejí', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }, {}]);
    playDuch(g, 1, 2);
    assert.equal(D.computeCanHit(g, 0, 2, Infinity), false);
    const b = give(g, 0, CardType.BANG);
    g.playBang(0, 2, b);
    assert.equal(g.phase, 'PLAY', 'BANG! na Ducha server odmítá');
    assert.equal(g.players[0].hand.length, 1);
    const d = give(g, 0, CardType.DUEL);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[d]), true, 'Duel na živé jde');
    g.playSpecialCard(0, 2, d);
    assert.equal(g.players[0].hand.length, 2, 'Duel s Duchem server odmítá');
    // Indiáni: odpovídá hráč 1, pak 3 – Duch (2) se přeskakuje.
    const ind = give(g, 0, CardType.INDIANS);
    g.playSpecialCard(0, null, ind);
    assert.equal(g.pendingResponse.targetIdx, 1);
    g.handleResponse(1, null);
    assert.equal(g.pendingResponse.targetIdx, 3, 'Duch přeskočen');
});

test('Duch se počítá do vzdálenosti (sedí u stolu)', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }, {}]);
    assert.equal(D.computeDistance(g, 1, 3), 1, 'bez Ducha je 1 a 3 vedle sebe');
    playDuch(g, 0, 2);
    assert.equal(D.computeDistance(g, 1, 3), 2);
});

test('dynamit u Ducha vybuchne bez zásahu a tah pokračuje', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }], { current: 2 });
    playDuch(g, 0, 2);
    board(g, 2, CardType.DYNAMITE);
    topDeck(g, Suits.SPADES, '5');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.pendingDynamiteDamage, null);
    assert.equal(g.phase, 'DRAW');
    assert.ok(D.isVosGhost(g.players[2]), 'pořád Duch');
    assert.ok(!g.players[2].board.some(c => c.type === CardType.DYNAMITE), 'dynamit je pryč');
});

test('dynamit se posouvá i k Duchovi (ve hře je)', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }], { current: 1 });
    playDuch(g, 0, 2);
    board(g, 1, CardType.DYNAMITE);
    topDeck(g, Suits.HEARTS, '5');
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.ok(g.players[2].board.some(c => c.type === CardType.DYNAMITE));
});

test('na Chřestýše se Duchovi nesnímá', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }], { current: 2 });
    playDuch(g, 0, 2);
    g.players[2].board.push(vcard('Chřestýš'));
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'DRAW');
});

// ── Tahy, limit karet, výhra ─────────────────────────────────────────────────

test('Duch má svůj tah (nepřeskakuje se) a Město duchů z něj ducha nedělá', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }, {}], { current: 1 });
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 3, 'vyřazený se přeskakuje');
    const h = mkV([{ role: 'Sheriff' }, {}, { dead: true }, {}], { current: 1 });
    playDuch(h, 0, 2);
    h.activeEvent = { key: 'MESTO_DUCHU' };
    h.nextTurn();
    assert.equal(h.currentPlayerIndex, 2);
    assert.ok(!h.players[2]._ghost);
});

test('na konci tahu má limit karet 0 – odhodí celou ruku, stůl zůstává', () => {
    const g = mkV([{ role: 'Sheriff' }, { dead: true }], { current: 1 });
    playDuch(g, 0, 1);
    give(g, 1, CardType.BANG);
    give(g, 1, CardType.MISSED);
    g.tryEndTurn();
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0);
    g.discardCard(0);
    assert.equal(g.players[1].board.length, 1, 'Duch leží dál');
    assert.equal(g.currentPlayerIndex, 0);
});

test('Duch-bandita brání výhře zákona (dV 1507774)', () => {
    const players = [{ role: 'Sheriff', health: 3, board: [] }, { role: 'Outlaw', health: 0, board: [{ type: 'Duch' }] }];
    assert.equal(evaluateWinner(players), null);
    players[1].board = [];
    assert.equal(evaluateWinner(players), 'Zákon vyhrál!');
});

// ── Odchod ze hry ────────────────────────────────────────────────────────────

test('Cat Balou na kartu Duch: hráč odchází bez odměny, ruka do odhozu, výhra se přepočítá', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Outlaw', dead: true }, { role: 'Deputy' },
                   { role: 'Renegade', dead: true, character: 'Vulture Sam' }]);
    kill(g, 3);
    g.players[3].health = 2;   // Vulture Sam naživu
    g.players[3]._roleRevealed = false;
    playDuch(g, 2, 1);
    give(g, 1, CardType.BANG);
    const cb = give(g, 0, CardType.CAT_BALOU);
    const handBefore = g.players[0].hand.length;
    g.playSpecialCard(0, 1, cb);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    g.resolveCardSelection(0, 'board', 0);
    const p = g.players[1];
    assert.ok(!D.isInPlay(p), 'bez karty Duch je zase vyřazený');
    assert.equal(p.hand.length, 0, 'ruka šla do odhozu');
    assert.ok(g._ghostLeaveAnim && g._ghostLeaveAnim.playerIdx === 1, 'animace odchodu');
    assert.equal(g.players[3].hand.length, 0, 'Vulture Sam nic nedostane');
    assert.equal(g.players[0].hand.length, handBefore - 1, 'žádná odměna za banditu');
    assert.equal(g.winner, null, 'odpadlík pořád žije');
    assert.ok(!p._vosWasGhost);
});

test('odchod posledního nepřítele zákona = výhra zákona', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Outlaw', dead: true }, { role: 'Deputy' }]);
    playDuch(g, 2, 1);
    g.checkWinCondition();
    assert.equal(g.winner, null);
    const p = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, p);
    g.resolveCardSelection(0, 'board', 0);
    assert.equal(g.winner, 'Zákon vyhrál!');
});

test('odchod během vlastního tahu ukončí tah', () => {
    const g = mkV([{ role: 'Sheriff' }, { dead: true }, {}], { current: 1 });
    playDuch(g, 0, 1);
    g.players[1].board.length = 0;   // kartu Duch mu sebrala jiná cesta (Daltonové, Doroty…)
    assert.equal(g._vosGhostSettle(), true);
    assert.equal(g.currentPlayerIndex, 2);
});

test('úklid čeká na klid (rozehraná obrana), pak proběhne', () => {
    const g = mkV([{ role: 'Sheriff' }, { dead: true }, {}]);
    playDuch(g, 0, 1);
    g.players[1].board.length = 0;
    g.phase = 'RESPOND';
    g.pendingResponse = { active: true, targetIdx: 2 };
    assert.equal(g._vosGhostSettle(), false);
    assert.ok(g.players[1]._vosWasGhost, 'ještě neuklizeno');
    g.phase = 'PLAY';
    g.pendingResponse = null;
    g._vosGhostSettle();
    assert.ok(!g.players[1]._vosWasGhost);
});

test('Laso: karty na stole nemají efekt → duchové jsou vyřazeni i s kartou (dV 1603935)', () => {
    const g = mkV([{ role: 'Sheriff' }, { dead: true }, {}]);
    playDuch(g, 0, 1);
    g.activeFistful = { key: 'LASO' };
    g._vosGhostTurnStep();
    assert.equal(g.players[1].board.length, 0);
    assert.ok(g.deck.discardPile.some(c => c.type === CardType.DUCH));
    assert.ok(!D.isInPlay(g.players[1]) || !g.players[1]._vosWasGhost);
    assert.ok(!g.players[1]._vosWasGhost);
});

test('Johnny Kisch: druhý Duch odhodí prvního a jeho duch odchází', () => {
    const g = mkV([{ role: 'Sheriff', character: 'Johnny Kisch' }, { dead: true }, { dead: true }, {}]);
    playDuch(g, 0, 1);
    playDuch(g, 0, 2);
    assert.ok(!D.isInPlay(g.players[1]), 'první Duch odhozen');
    assert.ok(D.isVosGhost(g.players[2]));
    assert.ok(!g.players[1]._vosWasGhost, 'uklizeno');
});

// ── Ostatní pravidla, která se Ducha týkají ──────────────────────────────────

test('Mrtvý muž ani Hřbitov Ducha nevracejí (není vyřazený, dV 1528720)', () => {
    const g = mkV([{ role: 'Sheriff' }, { dead: true }, {}, { dead: true }], { current: 1 });
    playDuch(g, 0, 1);
    g._firstDeadIdx = 1;
    g.activeFistful = { key: 'MRTVY_MUZ' };
    assert.equal(g._deadManReturnIdx(), -1);
    g.activeFistful = null;
    g.activeWws = { key: 'HRBITOV' };
    assert.equal(g._boneOrchardReturn(), false);
    assert.equal(g.players[1].health, 0);
});

test('Duch si schopnost nechává: Herb Hunter líže, Greg Digger se neléčí, Vulture Sam sbírá', () => {
    const g = mkV([{ role: 'Sheriff' }, { dead: true, character: 'Herb Hunter' },
                   { dead: true, character: 'Greg Digger' }, { role: 'Outlaw', health: 1 },
                   { dead: true, character: 'Vulture Sam' }]);
    playDuch(g, 0, 1);
    playDuch(g, 0, 2);
    playDuch(g, 0, 4);
    give(g, 3, CardType.BANG);
    g.handleDamage(3, 0);
    assert.ok(g.specialActionQueue.some(a => a.type === 'KILL_REWARD' && a.playerIdx === 1), 'Herb Hunter');
    assert.equal(g.players[2].health, 0, 'Greg Digger');
    assert.equal(g.players[4].hand.length, 1, 'Vulture Sam vzal kartu mrtvého');
});

test('Panika, Vězení i Daltonové na Ducha jdou (ve hře je)', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }], { current: 1 });
    playDuch(g, 0, 2);
    const j = give(g, 1, CardType.JAIL);
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[j]), true);
    g.playSpecialCard(1, 2, j);
    assert.ok(g.players[2].board.some(c => c.type === CardType.JAIL));
    g._startDaltons();
    assert.ok(g.daltonsQueue.includes(2) || g.pendingSelection?.attackerIdx === 2);
});

test('Evelyn ani Roztříštěná kulka na Ducha nemíří', () => {
    const g = mkV([{ role: 'Sheriff' }, { dead: true }, {}]);
    playDuch(g, 2, 1);
    assert.deepEqual(V.evelynTargets(g, 0), [2]);
    assert.ok(!V.fanningSeconds(g, 0, 2).includes(1));
});

test('Zuřivá Doroty: poručený Duch míří na vyřazené', () => {
    const g = mkV([{ role: 'Sheriff' }, {}, { dead: true }, {}]);
    assert.deepEqual(dorothyTargets(g, 1, vcard('Duch')), [2]);
});

// ── Bot ──────────────────────────────────────────────────────────────────────

test('bot: Ducha zahraje na vyřazeného spojence, na nepřítele ne', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Deputy', dead: true }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    giveV(g, 0, 'Duch');
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'play_special');
    assert.equal(a.payload.targetIdx, 1);

    const h = mkV([{ role: 'Sheriff' }, { role: 'Outlaw', dead: true }, { role: 'Outlaw' }, { role: 'Deputy' }]);
    giveV(h, 0, 'Duch');
    const b = decideBotAction(h, 0, null);
    assert.ok(!(b && b.event === 'play_special'), 'banditu zpátky nevrací');
});

test('bot: nepříteli Duchovi sebere kartu Duch (Cat Balou → přímo Duch)', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Outlaw', dead: true }, { role: 'Outlaw' }]);
    playDuch(g, 2, 1);
    give(g, 1, CardType.BANG);
    give(g, 0, CardType.CAT_BALOU);
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'play_special');
    assert.equal(a.payload.targetIdx, 1);
    g.playSpecialCard(0, 1, a.payload.cardIdx);
    const pick = decideBotAction(g, 0, null);
    assert.equal(pick.event, 'select_target_card');
    assert.equal(pick.payload.targetCardArea ?? pick.payload.area, 'board');
});

// ── Strukturální: audit `health > 0` / `health <= 0` (plán §2.11, §7.1) ─────────
// S Duchem přestává platit, že „má 0 životů" = „je mimo hru". Každé místo v logic.js,
// logic/* a core/*, které se na nulu životů ptá napřímo, proto musí být tady s důvodem.
// „Ve hře" se ptá isInPlay (i duch Města duchů / stín na svůj tah) nebo staysInPlay
// (natrvalo – živý nebo Duch); napřímo smí zůstat jen SKUTEČNÝ ŽIVOT: cíl zranění, léčení,
// vyhodnocení smrti, ztráta života událostí. Nový výskyt test shodí – rozhodni, kam patří.
const LIFE_OK = {
    'logic/characters.js': [
        ['target.health <= 0 || targetIdx === playerIdx', 'Doc Holyday střílí – Duch život ztratit nemůže'],
    ],
    'logic/combat.js': [
        ['if (!target || target.health <= 0) return;', 'handleDamage: nula se dál nezraňuje (duch, stín, Duch)'],
        ['last: target.health <= 0', 'handleDamage: byl to poslední život'],
        ['if (target.health <= 0) {', 'handleDamage: smrt'],
        ['"Greg Digger") && p.health > 0', 'Greg Digger se léčí – Duch ne'],
        ['last: p.health <= 0', 'klikaný zásah: poslední život'],
        ['if (p.health <= 0) {', 'klikaný zásah: smrt'],
    ],
    'logic/dodgeCity.js': [
        ["if (!t || t.health <= 0 || target.targetIdx === pIdx) return;", 'Springfield (bang_any) – cíl zranění'],
        ['if (!t || t.health <= 0 || targetIdx === playerIdx) {', 'Springfield (bang_any) – cíl zranění'],
        ['if (!t || t.health <= 0) return;', 'zelená bang-karta – cíl zranění'],
    ],
    'logic/fistful.js': [
        ['p.health <= 0 || p._ghost || !p.hand.length', 'Fistful of Cards bere životy'],
        ['p.health > 0 && !p._ghost) order.push', 'Ruská ruleta bere životy'],
        ['if (!p || p.health <= 0) continue;', 'Ruská ruleta – kdo ještě může přijít o život'],
        ['this.players[i].health > 0).length', 'Ruská ruleta – patová pojistka počítá ty, kdo střílí o život'],
    ],
    'logic/highNoon.js': [
        ['this.players.filter(p => p.health > 0)', 'Doktor léčí – Duchovi nepomůže (dV 2341453)'],
        ['if (i === idx || p.health <= 0) return;', 'odchod ducha Města duchů – Greg Digger / Herb Hunter (jako u smrti)'],
        ['if (!p || p.health <= 0) return false;', 'Pravé poledne bere život'],
        ['this.players[playerIdx].health <= 0) return;', 'Pravé poledne: smrt'],
    ],
    'logic/setup.js': [
        ['pl.health > 0 ? pl.health', 'startovní karty = životy při rozdání'],
    ],
    'logic/valley.js': [
        ['if (p.health > 0) { p._vosWasGhost = false', 'úklid Ducha: živý Duch není (pojistka)'],
        ['isVosGhost(t) || t.health <= 0', 'Henry Block střílí – na toho, kdo nemůže ztratit život, ne'],
        ['!(victim.health > 0)', 'Obětavý skok – „přežije-li": zachráněný musí mít život (Duch nepřežil)'],
    ],
    'logic/wildWest.js': [
        ['if (!p || p.health <= 0) return false;', 'Madam Zuzana / Roubík berou život'],
        ['if (p && p.health > 0) {', 'Roubík – pokutu platí jen ten, kdo může ztratit život'],
    ],
    'core/botChat.js': [
        ['b.health <= 0', 'hláška: právě umřel'],
        ['b.health > a.health && a.health > 0', 'hláška: vyléčil se'],
        ['cur.players[k].health > 0', 'hláška: zabiják přežil'],
        ['if (!p || p.health <= 0) return null;', 'mrtvý (i Duch) nemluví – pod Roubíkem by mluvil zadarmo'],
    ],
    'core/botPolicy.js': [
        ['if (idx === myIndex || p.health <= 0) return;', 'rankEnemies / AoE – útočí se jen na toho, kdo může ztratit život (Ducha bot krade zvlášť)'],
        ['const alive = (i) => i !== myIndex && state.players[i].health > 0;', 'Právo západu: Duel / výstřel – cíl zranění'],
        ['idx !== myIndex && p.health > 0', 'Tequila na spojence – léčení'],
        ['if (state.players[idx].health <= 0) continue;', 'kam poslat dynamit – Duchovi neublíží'],
    ],
    'core/distance.js': [
        ['player.health > 0 || !!player._ghost', 'isInPlay – definice'],
        ['player.health <= 0 && hasDuchCard', 'isVosGhost – definice'],
        ['player.health > 0 || isVosGhost', 'staysInPlay – definice'],
    ],
    'core/playability.js': [
        ["discardExtra === 'bang_any'", 'Springfield – cíl zranění'],
        ['card.type === "Duel"', 'Duel – cíl zranění'],
        ['p.health > 0 && computeCanHit', 'Právo západu: výstřel na sebe – cíl zranění'],
    ],
    'core/valley.js': [
        ["t.health <= 0 && !isInPlay(t)", 'Duch se vykládá před vyřazeného'],
        ['!(v.health > 0)', 'Obětavý skok – zachraňuje se jen ten, kdo může ztratit život'],
    ],
};

test('strukturální: každé napřímo položené `health > 0` / `health <= 0` má důvod', () => {
    const root = path.join(__dirname, '..');
    const files = ['logic.js',
        ...fs.readdirSync(path.join(root, 'logic')).map(f => 'logic/' + f),
        ...fs.readdirSync(path.join(root, 'core')).map(f => 'core/' + f)].filter(f => f.endsWith('.js'));
    const re = /health\s*(>|<=|<|>=|===|==)\s*0\b|health\s*<\s*1\b|health\s*>=\s*1\b/;
    const missing = [];
    const used = new Set();
    for (const f of files) {
        const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
        lines.forEach((l, i) => {
            const t = l.trim();
            if (t.startsWith('//') || t.startsWith('*')) return;
            const code = l.split(/\s\/\/\s/)[0];
            if (!re.test(code)) return;
            const hit = (LIFE_OK[f] || []).find(([snip]) => code.includes(snip));
            if (!hit) missing.push(`${f}:${i + 1}: ${t}`);
            else used.add(f + '|' + hit[0]);
        });
    }
    assert.deepEqual(missing, [],
        'nový dotaz na nulu životů: „ve hře" → isInPlay / staysInPlay, skutečný život → zapiš do LIFE_OK s důvodem');
    const stale = [];
    for (const [f, list] of Object.entries(LIFE_OK)) {
        for (const [snip] of list) if (!used.has(f + '|' + snip)) stale.push(`${f}: ${snip}`);
    }
    assert.deepEqual(stale, [], 'záznam v LIFE_OK už nic nepokrývá – smaž ho');
});
