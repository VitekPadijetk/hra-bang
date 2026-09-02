// Rozšíření Divoký západ – karty, které sahají na ROLE (fáze 7).
//
// Hřbitov: „Na začátku svého tahu se všichni vyřazení hráči vrátí do hry s 1 životem.
//           Role vyřazených hráčů zamíchejte a rozdejte náhodně."
// Helena Zontero: „Když přijde Helena do hry, otočte vrchní kartu z dobíracího balíčku:
//           jsou-li to srdce ♥ nebo káry ♦, zamíchejte všechny aktivní role s výjimkou
//           Šerifa a znovu je náhodně a tajně rozdejte. Každý hráč se podívá na svou
//           novou roli."
//
// Podklad: docs/wild-west-show-plan.md §4.5 a §4.6 (rozhodnutí R2 a R3).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { computeBeliefs } = require('../core/beliefs.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const ffData = rd('cards.fistful.json');
const hnData = rd('cards.high_noon.json');
const wws = key => wwsData.find(c => c.key === key);
const ff = key => ffData.find(c => c.key === key);
const hn = key => hnData.find(c => c.key === key);

// Počítadlo zamíchání ROLÍ (deck.shuffleArray se volá i na karty – rozeznají se podle
// toho, že role jsou řetězce).
function countRoleShuffles(g) {
    const orig = g.deck.shuffleArray.bind(g.deck);
    const box = { n: 0 };
    g.deck.shuffleArray = (arr) => {
        if (Array.isArray(arr) && arr.length && typeof arr[0] === 'string') box.n++;
        return orig(arr);
    };
    return box;
}

// ── Hřbitov: návrat do hry ───────────────────────────────────────────────────

test('Hřbitov: vyřazený hráč se na SVŮJ tah vrací s 1 životem', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeWws = wws('HRBITOV');
    g.players[1].health = 0;
    g.players[1]._roleRevealed = true;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1, 'vyřazený hráč se v pořadí NEpřeskakuje');
    assert.equal(g.players[1].health, 1);
    assert.equal(g.players[1]._ghost, false, 'návrat je trvalý, ne duch');
    assert.equal(g.players[1].hand.length, 0, 'karta o kartách nemluví');
});

test('Hřbitov: bez karty se vyřazený hráč přeskakuje jako dřív', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.players[1].health = 0;
    g.players[1]._roleRevealed = true;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 2);
    assert.equal(g.players[1].health, 0);
});

test('Hřbitov: dva vyřazení se vracejí každý na svém tahu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                      { role: 'Renegade' }, { role: 'Deputy' }]);
    g.activeWws = wws('HRBITOV');
    [1, 2].forEach(i => { g.players[i].health = 0; g.players[i]._roleRevealed = true; });
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.players[2].health, 0, 'druhý čeká na svůj tah');
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 2);
    assert.equal(g.players[2].health, 1);
});

test('Hřbitov: kdo padne znovu, vrátí se zas (Sciarra Q21)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeWws = wws('HRBITOV');
    g.players[1].health = 0;
    g.players[1]._roleRevealed = true;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.players[1].health, 1);
    g.players[1].health = 0;                   // padl znovu
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1].health, 1, 'návrat je opakovatelný');
});

// ── Hřbitov: přerozdání rolí ────────────────────────────────────────────────

test('Hřbitov: s JEDNÍM vyřazeným se nemíchá nic (role zůstává odkrytá)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeWws = wws('HRBITOV');
    g.players[1].health = 0;
    g.players[1]._roleRevealed = true;
    const spy = countRoleShuffles(g);
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(spy.n, 0, 's jednou rolí není co míchat');
    assert.equal(g.players[1].role, 'Outlaw');
    assert.equal(g.players[1]._roleRevealed, true, 'role zůstává veřejná');
    assert.equal(g._roleShuffleAnim, null, 'nic se nepřehrává');
});

test('Hřbitov: míchají se role VYŘAZENÝCH (včetně vracejícího se), ne živých', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                      { role: 'Renegade' }, { role: 'Deputy' }]);
    g.activeWws = wws('HRBITOV');
    // Vyřazení: 1 (Outlaw) a 3 (Renegade). Živí: 0 (Sheriff), 2 (Outlaw), 4 (Deputy).
    [1, 3].forEach(i => { g.players[i].health = 0; g.players[i]._roleRevealed = true; });
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[0].role, 'Sheriff', 'živí si role drží');
    assert.equal(g.players[2].role, 'Outlaw');
    assert.equal(g.players[4].role, 'Deputy');
    // Vyřazené role se jen přeházely mezi sebou – množina zůstává.
    const swapped = [g.players[1].role, g.players[3].role].sort();
    assert.deepEqual(swapped, ['Outlaw', 'Renegade']);
    assert.equal(g.players[1]._roleRevealed, false, 'přerozdaná role je zase tajná');
    assert.equal(g.players[3]._roleRevealed, false);
});

test('Hřbitov: pět vyřazených = ČTYŘI zamíchání (u poslední role už ne)', () => {
    // 8 hráčů: Sheriff, 2× Deputy, 3× Outlaw, 2× Renegade. Vyřadíme pomocníky a bandity –
    // šerif i oba odpadlíci zůstávají, takže hra nekončí a Hřbitov je vrací po jednom.
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Deputy' },
                      { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                      { role: 'Renegade' }, { role: 'Renegade' }]);
    g.activeWws = wws('HRBITOV');
    [1, 2, 3, 4, 5].forEach(i => { g.players[i].health = 0; g.players[i]._roleRevealed = true; });
    const spy = countRoleShuffles(g);
    g.currentPlayerIndex = 0;
    for (let k = 0; k < 5; k++) g.nextTurn();
    assert.equal(g.currentPlayerIndex, 5);
    assert.equal(spy.n, 4, 'míchá se při 5, 4, 3 a 2 zbylých rolích – u jedné už ne');
    assert.ok([1, 2, 3, 4, 5].every(i => g.players[i].health === 1), 'všichni jsou zpátky');
    assert.equal(g.winner, null);
});

test('Hřbitov: šerif se do výměny nedostane ani v debug hře', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeWws = wws('HRBITOV');
    g.isDebug = true;
    [0, 1].forEach(i => { g.players[i].health = 0; g.players[i]._roleRevealed = true; });
    g.currentPlayerIndex = 2;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.players[0].role, 'Sheriff', 'šerifovi zůstává role (a s ní maximum životů)');
});

test('Hřbitov: ledger chování se po přerozdání zahazuje', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                      { role: 'Renegade' }, { role: 'Deputy' }]);
    g.activeWws = wws('HRBITOV');
    [1, 3].forEach(i => { g.players[i].health = 0; g.players[i]._roleRevealed = true; });
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g._ledgerResetPending, true);
    assert.ok(g._roleShuffleAnim, 'cinematika přerozdání se ohlásí');
    assert.deepEqual(g._roleShuffleAnim.visible, [1, 3], 'na stole leží karty rolí vyřazených');
    assert.deepEqual(g._roleShuffleAnim.all, [1, 3], 'u Hřbitova jsou obě množiny totožné');
    assert.deepEqual(g._roleShuffleAnim.peek, [1, 3], 'novou roli si prohlédne každý, kdo ji dostal');
});

// ── Hřbitov × ostatní balíčky ───────────────────────────────────────────────

test('Hřbitov × Město duchů: návrat je TRVALÝ, hráč nenastupuje jako duch', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeWws = wws('HRBITOV');
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[1].health = 0;
    g.players[1]._roleRevealed = true;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.players[1].health, 1);
    assert.equal(g.players[1]._ghost, false, 'duch by měl 0 životů a na konci tahu by odešel');
});

test('Hřbitov × Mrtvý muž: vyhrává Mrtvý muž (2 životy a 2 karty)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeWws = wws('HRBITOV');
    g.activeFistful = ff('MRTVY_MUZ');
    g.players[1].health = 0;
    g.players[1]._roleRevealed = true;
    g._firstDeadIdx = 1;
    g.deck.cards.push(mkCard(CardType.BANG), mkCard(CardType.BANG));
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1].health, 2, 'Mrtvý muž je krok 0, Hřbitov až 0b');
    assert.equal(g._deadManUsed, true);
});

test('Hřbitov: výhra se po návratu přepočítá (živý bandita hru drží dál)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Deputy' }]);
    g.activeWws = wws('HRBITOV');
    g.players[1].health = 0;
    g.players[1]._roleRevealed = true;
    g.currentPlayerIndex = 0;
    g.nextTurn();
    assert.equal(g.winner, null, 'bandita je zpátky ve hře, zákon zatím nevyhrál');
});

// ── Helena Zontero ──────────────────────────────────────────────────────────

// Hra, do které Helena právě přichází (jako by ji odkryl Dostavník / Wells Fargo).
function mkHelena(specs, suit) {
    const g = mkGame(specs);
    g.wwsDeck = [wws('HELENA_ZONTERO')];
    g.deck.cards.push(mkCard(CardType.BANG, { suit, value: '7' }));
    return g;
}

test('Helena Zontero: ♥ přerozdá role (šerif si tu svou drží)', () => {
    const g = mkHelena([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                        { role: 'Renegade' }, { role: 'Deputy' }], Suits.HEARTS);
    const spy = countRoleShuffles(g);
    assert.equal(g._flipWwsEvent(0), false, 'hra se nepozastavuje – nikdo se na nic neptá');
    assert.equal(g.activeWws.key, 'HELENA_ZONTERO');
    assert.equal(spy.n, 1);
    assert.equal(g.players[0].role, 'Sheriff');
    const rest = [1, 2, 3, 4].map(i => g.players[i].role).sort();
    assert.deepEqual(rest, ['Deputy', 'Outlaw', 'Outlaw', 'Renegade']);
    assert.ok(g._helenaAnim && g._helenaAnim.red === true, 'sejmutí se ukáže');
    assert.deepEqual(g._roleShuffleAnim.peek, [1, 2, 3, 4]);
    assert.deepEqual(g._roleShuffleAnim.visible, [], 'role živých hráčů na stole neleží');
    // Veřejná půlka cinematiky se přesto hraje za všechny čtyři – karty jim přiletí
    // zpoza okraje jeviště, zamíchají se doprostřed a rozdají zase k nim (bug 61).
    assert.deepEqual(g._roleShuffleAnim.all, [1, 2, 3, 4], 'míchá se všem, i když na stole nic neleží');
    assert.equal(g._ledgerResetPending, true);
});

test('Helena Zontero: ♠ neudělá nic (karta jde jen do odhozu)', () => {
    const g = mkHelena([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }],
                       Suits.SPADES);
    const spy = countRoleShuffles(g);
    g._flipWwsEvent(0);
    assert.equal(spy.n, 0);
    assert.deepEqual(g.players.map(p => p.role), ['Sheriff', 'Outlaw', 'Renegade']);
    assert.ok(g._helenaAnim && g._helenaAnim.red === false);
    assert.equal(g._roleShuffleAnim, null);
    assert.equal(g._ledgerResetPending, false);
    assert.equal(g.deck.discardPile.length, 1, 'sejmutá karta jde do odhozu');
});

test('Helena Zontero: role VYŘAZENÝCH hráčů se nemíchají', () => {
    const g = mkHelena([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                        { role: 'Renegade' }, { role: 'Deputy' }], Suits.DIAMONDS);
    g.players[4].health = 0;
    g.players[4]._roleRevealed = true;
    g._flipWwsEvent(0);
    assert.equal(g.players[4].role, 'Deputy', 'vyřazený není „aktivní role"');
    assert.equal(g.players[4]._roleRevealed, true, 'a zůstává odkrytý');
    assert.deepEqual(g._roleShuffleAnim.peek, [1, 2, 3]);
});

test('Helena Zontero: duch (Město duchů) je ve hře, takže se míchá i s ním', () => {
    const g = mkHelena([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                        { role: 'Renegade' }], Suits.HEARTS);
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[3].health = 0;
    g.players[3]._ghost = true;
    g._flipWwsEvent(0);
    assert.deepEqual(g._roleShuffleAnim.peek, [1, 2, 3]);
});

test('Helena Zontero: Prokletí = nikdy, Požehnání = vždy (barva přes _effSuit)', () => {
    const cursed = mkHelena([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }],
                            Suits.HEARTS);
    cursed.activeEvent = hn('PROKLETI');                 // všechno jsou piky
    const spyC = countRoleShuffles(cursed);
    cursed._flipWwsEvent(0);
    assert.equal(spyC.n, 0);
    assert.equal(cursed._helenaAnim.red, false);

    const blessed = mkHelena([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }],
                             Suits.SPADES);
    blessed.activeEvent = hn('POZEHNANI');               // všechno jsou srdce
    const spyB = countRoleShuffles(blessed);
    blessed._flipWwsEvent(0);
    assert.equal(spyB.n, 1);
    assert.equal(blessed._helenaAnim.red, true);
});

test('Helena Zontero: karta se otáčí automaticky – Lucky Duke ani John Pain nezasahují', () => {
    const g = mkHelena([{ role: 'Sheriff', character: 'Lucky Duke' },
                        { role: 'Outlaw', character: 'John Pain' },
                        { role: 'Renegade' }], Suits.HEARTS);
    g._flipWwsEvent(0);
    assert.ok(!g.pendingCheckDraw, 'nejde to cestou sejmutí (FAQ Q09)');
    assert.equal(g.phase, 'PLAY', 'hra se na nic nepozastaví');
    assert.equal(g.players[1].hand.length, 0, 'John Pain si kartu nebere');
    assert.equal(g.deck.discardPile.length, 1);
});

test('Helena Zontero ve hře pro 3: míchají se všechny tři role, a to VEŘEJNĚ', () => {
    const g = mkHelena([{ role: 'Deputy' }, { role: 'Outlaw' }, { role: 'Renegade' }],
                       Suits.HEARTS);
    g.mode3p = true;
    g._winClaim3p = 1;
    g._flipWwsEvent(0);
    const roles = g.players.map(p => p.role).sort();
    assert.deepEqual(roles, ['Deputy', 'Outlaw', 'Renegade']);
    assert.deepEqual(g._roleShuffleAnim.visible, [0, 1, 2], 'role leží lícem nahoru');
    assert.deepEqual(g._roleShuffleAnim.peek, [], 'nahlédnutí nemá smysl, role jsou veřejné');
    assert.equal(g._winClaim3p, null, 'nárok na výhru je po výměně cílů bezpředmětný');
});

// ── Dedukce rolí botem ──────────────────────────────────────────────────────

test('po přerozdání zná bot jen svou roli a šerifa (ostatní jsou zase neznámé)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' },
                      { role: 'Renegade' }, { role: 'Deputy' }]);
    g.activeWws = wws('HRBITOV');
    [1, 3].forEach(i => { g.players[i].health = 0; g.players[i]._roleRevealed = true; });
    g.currentPlayerIndex = 0;
    g.nextTurn();
    const b = computeBeliefs(g, { pairs: {} }, 2);
    // Vrácený hráč (idx 1) má zase neznámou roli – nesmí být jistotou.
    const cert = Math.max(b[1].Sheriff, b[1].Deputy, b[1].Outlaw, b[1].Renegade);
    assert.ok(cert < 1, `role vráceného hráče už není jistá (${cert})`);
    assert.deepEqual(b[0], { Sheriff: 1, Deputy: 0, Outlaw: 0, Renegade: 0 });
});
