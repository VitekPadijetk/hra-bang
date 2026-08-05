// Rozšíření Dodge City – fáze 6: schopnosti nových postav.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');
const { cardPlayability } = require('../core/playability.js');

before(() => { console.log = () => {}; });

// ── Fáze lízání ──────────────────────────────────────────────────────────────
test('Pixie Pete líže 3 karty', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Pixie Pete' }, { role: 'Outlaw' }]);
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
});

test('Bill Noface líže 1 + 1 za každé zranění', () => {
    const gFull = mkGame([{ role: 'Sheriff', character: 'Bill Noface', maxHealth: 4, health: 4 }, { role: 'Outlaw' }]);
    gFull.startDrawPhase();
    assert.equal(gFull.drawPhaseState.cardsNeeded, 1);

    const gHurt = mkGame([{ role: 'Sheriff', character: 'Bill Noface', maxHealth: 4, health: 2 }, { role: 'Outlaw' }]);
    gHurt.startDrawPhase();
    assert.equal(gHurt.drawPhaseState.cardsNeeded, 3);   // 1 + 2 zranění
});

test('Pat Brennan: volba lízání „board" + vezme modrou kartu ze stolu soupeře', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Pat Brennan' }, { role: 'Outlaw' }]);
    const barrel = board(g, 1, CardType.BARREL, { id: 800 });
    g.startDrawPhase();
    assert.ok(g.drawPhaseState.options.includes('board'));

    g.drawCard('board', 1, 'board', 0);
    assert.equal(g.players[0].hand.some(c => c.id === 800), true);
    assert.equal(g.players[1].board.length, 0);
    assert.equal(g.phase, 'PLAY');            // vzal jen 1 kartu → konec lízání
});

test('Pat Brennan: může vzít zbraň ze stolu soupeře (→ jeho Colt .45)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Pat Brennan' }, { role: 'Outlaw' }]);
    g.players[1].weapon = mkCard(CardType.WEAPON, { id: 801, name: 'Remington', props: { range: 3 } });
    g.startDrawPhase();
    g.drawCard('board', 1, 'weapon', null);
    assert.equal(g.players[0].hand.some(c => c.id === 801), true);
    assert.equal(g.players[1].weapon.id, -1);   // zpět na Colt .45
    assert.equal(g.phase, 'PLAY');
});

test('Pat Brennan: normální lízání (2 z balíčku) stále funguje', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Pat Brennan' }, { role: 'Outlaw' }]);
    g.deck.cards = [mkCard(CardType.BANG, { id: 810 }), mkCard(CardType.BANG, { id: 811 })];
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY');
});

// ── Konec tahu / limit ruky ──────────────────────────────────────────────────
test('Sean Mallory drží až 10 karet (neodhazuje na počet životů)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Sean Mallory', health: 3 }, { role: 'Outlaw' }]);
    for (let i = 0; i < 8; i++) give(g, 0, CardType.BANG, { id: 820 + i });
    g.tryEndTurn();
    assert.equal(g.phase !== 'DISCARD', true);   // 8 ≤ 10 → nemusí odhazovat

    const g2 = mkGame([{ role: 'Sheriff', character: 'Sean Mallory', health: 3 }, { role: 'Outlaw' }]);
    for (let i = 0; i < 11; i++) give(g2, 0, CardType.BANG, { id: 840 + i });
    g2.tryEndTurn();
    assert.equal(g2.phase, 'DISCARD');           // 11 > 10 → odhazuje po 10
});

// ── Léčení ───────────────────────────────────────────────────────────────────
test('Tequila Joe: karta Pivo dá +2 (do maxima)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Tequila Joe', health: 2, maxHealth: 5 }, { role: 'Outlaw' }]);
    const beer = give(g, 0, CardType.BEER);
    g.playCard(beer);
    assert.equal(g.players[0].health, 4);        // 2 → 4

    const g2 = mkGame([{ role: 'Sheriff', character: 'Tequila Joe', health: 4, maxHealth: 5 }, { role: 'Outlaw' }]);
    give(g2, 0, CardType.BEER);
    g2.playCard(0);
    assert.equal(g2.players[0].health, 5);       // +2 se zastaví na maxu
});

test('Tequila Joe: jiné léčení (Salón) mu dá jen +1', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Tequila Joe', health: 2, maxHealth: 5 }, { role: 'Outlaw', health: 1, maxHealth: 4 }]);
    const saloon = give(g, 0, CardType.SALOON);
    g.playCard(saloon);
    assert.equal(g.players[0].health, 3);        // jen +1 (není Pivo)
});

// ── Tequila Joe: Pivo jako záchrana před vyřazením ───────────────────────────
// Pravidla: Pivo zahrané při ztrátě posledního života vrátí život, který měl hráč
// ztratit. Joeovi vrací 2 → z útoku za 1 zásah vyjde s 2 HP, u dynamitu (-3 najednou)
// mu jedno pivo pokryje dva body.

// Rozbuš dynamit u hráče 0 (3 hráči, aby šla záchrana Pivem – při 2 živých je zakázaná).
function mkDynamite(joeSpec) {
    const g = mkGame([
        joeSpec,
        { role: 'Sheriff' },
        { role: 'Renegade' },
    ], { current: 0 });
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    g.deck.cards = [];
    g.deck.cards.push(mkCard(CardType.BANG, { suit: Suits.SPADES, value: '5' })); // check → výbuch
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    return g;
}

test('Tequila Joe: Pivo při posledním životě (Bang!) ho nechá na 2 HP', () => {
    const g = mkGame([
        { role: 'Outlaw', character: 'Tequila Joe', health: 1, maxHealth: 4 },
        { role: 'Sheriff' }, { role: 'Renegade' },
    ], { phase: 'RESPOND', current: 1 });
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: CardType.MISSED, sourceCard: CardType.BANG, responded: [] };
    const beer = give(g, 0, CardType.BEER);

    assert.equal(g.beerLastLifeSave(0, beer), true);
    assert.equal(g.players[0].health, 2);        // 1 − 1 + 2
    assert.equal(g.phase, 'PLAY');
});

test('Tequila Joe: Pivo při posledním životě nepřeleze maximum', () => {
    const g = mkGame([
        { role: 'Outlaw', character: 'Tequila Joe', health: 1, maxHealth: 1 },
        { role: 'Sheriff' }, { role: 'Renegade' },
    ], { phase: 'RESPOND', current: 1 });
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: CardType.MISSED, sourceCard: CardType.BANG, responded: [] };
    const beer = give(g, 0, CardType.BEER);

    assert.equal(g.beerLastLifeSave(0, beer), true);
    assert.equal(g.players[0].health, 1);        // +1 by přeteklo max → zůstává
});

test('Tequila Joe na dynamitu: se 2 HP ho zachrání JEDNO pivo (kryje 2 body)', () => {
    const g = mkDynamite({ role: 'Outlaw', character: 'Tequila Joe', health: 2, maxHealth: 4 });
    const beer = give(g, 0, CardType.BEER);

    g.takeDynamiteHit(0);                        // 2 → 1 HP, zbývají 2 zásahy
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 2);

    assert.equal(g.beerLastLifeSave(0, beer), true);
    assert.equal(g.players[0].health, 1);        // 2 − 3 + 2 = 1
    assert.equal(g.pendingDynamiteDamage, null); // pivo pokrylo oba zbylé zásahy
    assert.equal(g.phase, 'DRAW');               // přežil, tah pokračuje
});

test('Tequila Joe na dynamitu: se 3 HP ho pivo nechá na 2 HP', () => {
    const g = mkDynamite({ role: 'Outlaw', character: 'Tequila Joe', health: 3, maxHealth: 4 });
    const beer = give(g, 0, CardType.BEER);

    g.takeDynamiteHit(0);
    g.takeDynamiteHit(0);                        // 3 → 1 HP, zbývá 1 zásah
    assert.equal(g.beerLastLifeSave(0, beer), true);
    assert.equal(g.players[0].health, 2);        // 3 − 3 + 2 = 2
    assert.equal(g.phase, 'DRAW');
});

test('Tequila Joe na dynamitu: s 1 HP a dvěma pivy skončí na 2 HP (2×2 životy)', () => {
    const g = mkDynamite({ role: 'Outlaw', character: 'Tequila Joe', health: 1, maxHealth: 4 });
    give(g, 0, CardType.BEER);
    give(g, 0, CardType.BEER);

    assert.equal(g.beerLastLifeSave(0, 0), true);
    assert.equal(g.players[0].health, 1);        // první pivo zaplatilo 2 zásahy
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 1);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');

    assert.equal(g.beerLastLifeSave(0, 0), true);
    assert.equal(g.players[0].health, 2);        // 1 − 3 + 4 = 2
    assert.equal(g.phase, 'DRAW');
});

test('Běžná postava na dynamitu: pivo dál kryje jen jeden zásah', () => {
    const g = mkDynamite({ role: 'Outlaw', health: 2, maxHealth: 4 });
    const beer = give(g, 0, CardType.BEER);

    g.takeDynamiteHit(0);                        // 2 → 1 HP
    assert.equal(g.beerLastLifeSave(0, beer), true);
    assert.equal(g.players[0].health, 1);
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 1);   // poslední zásah pořád čeká
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');

    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 0);        // bez druhého piva umírá
});

// ── Reakce na smrt ───────────────────────────────────────────────────────────
test('Greg Digger: +2 životy (do max) při vyřazení jiné postavy', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Greg Digger', health: 3, maxHealth: 5 }, { role: 'Outlaw', health: 1 }]);
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[0].health, 5);        // 3 → +2

    const g2 = mkGame([{ role: 'Sheriff', character: 'Greg Digger', health: 4, maxHealth: 5 }, { role: 'Outlaw', health: 1 }]);
    g2.handleDamage(1, 0);
    assert.equal(g2.players[0].health, 5);       // strop na maxu
});

// ── Aktivní schopnosti ───────────────────────────────────────────────────────
test('Chuck Wengam: ztrať 1 život → lízni 2 (opakovatelné)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Chuck Wengam', health: 4 }, { role: 'Outlaw' }]);
    g.deck.cards = [mkCard(CardType.BANG, { id: 880 }), mkCard(CardType.BANG, { id: 881 })];
    g.useChuckWengam(0);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY');               // vrátil se do PLAY → může znovu
});

test('Chuck Wengam: nelze na posledním životě', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Chuck Wengam', health: 1 }, { role: 'Outlaw' }]);
    assert.equal(g.useChuckWengam(0), false);
    assert.equal(g.players[0].health, 1);
    assert.equal(g.phase, 'PLAY');
});

test('José Delgado: odhoď modrou → lízni 2 (max 2×/tah)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'José Delgado' }, { role: 'Outlaw' }]);
    g.players[0]._joseUses = 0;
    g.deck.cards = [mkCard(CardType.BANG, { id: 890 }), mkCard(CardType.BANG, { id: 891 })];
    const barrel = give(g, 0, CardType.BARREL, { id: 892 });
    assert.equal(g.useJoseDelgado(0, barrel), true);
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 2);   // barrel pryč, 2 líznuté
    assert.equal(g.players[0]._joseUses, 1);
});

test('José Delgado: nemodrou kartu nelze použít', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'José Delgado' }, { role: 'Outlaw' }]);
    g.players[0]._joseUses = 0;
    const bang = give(g, 0, CardType.BANG);
    assert.equal(g.useJoseDelgado(0, bang), false);
    assert.equal(g.players[0].hand.length, 1);
});

test('José Delgado: 3. použití v tahu selže', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'José Delgado' }, { role: 'Outlaw' }]);
    g.players[0]._joseUses = 2;
    give(g, 0, CardType.BARREL);
    assert.equal(g.useJoseDelgado(0, 0), false);
});

test('Doc Holyday: odhoď 2 karty → bang-efekt na cíl v dostřelu (1×/tah)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Doc Holyday' }, { role: 'Outlaw' }]);
    g.players[0]._docUsed = false;
    give(g, 0, CardType.BANG, { id: 900 });
    give(g, 0, CardType.BANG, { id: 901 });
    assert.equal(g.useDocHolyday(0, [0, 1], 1), true);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[0]._docUsed, true);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    // podruhé v tahu už ne
    give(g, 0, CardType.BANG); give(g, 0, CardType.BANG);
    assert.equal(g.useDocHolyday(0, [0, 1], 1), false);
});

test('Herb Hunter: lízne 2 karty při vyřazení jiné postavy (kill-reward fronta)', () => {
    const g = mkGame([{ role: 'Sheriff', health: 4 }, { role: 'Renegade', health: 1 }, { role: 'Outlaw', character: 'Herb Hunter' }]);
    g.deck.cards = [mkCard(CardType.BANG, { id: 860 }), mkCard(CardType.BANG, { id: 861 })];
    g.handleDamage(1, 0);                         // zabije renegáta (žádná odměna pro zabijáka)
    assert.ok(g.specialActionQueue.some(a => a.type === 'KILL_REWARD' && a.playerIdx === 2 && a.cardsNeeded === 2));
    g._processSpecialQueue();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 2);
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[2].hand.filter(c => c.id === 860 || c.id === 861).length, 2);
});

// ── Elena Fuente ─────────────────────────────────────────────────────────────
test('Elena Fuente: libovolná karta z ruky ubrání Bang! (jako Vedle!)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Elena Fuente' }]);
    const bang = give(g, 0, CardType.BANG);
    const junk = give(g, 1, CardType.PANIC, { id: 950 });   // nemodrá, nevedlová karta
    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, junk);                 // brání se Panikou jako Vedle!
    assert.equal(g.players[1].health, 4);      // nezraněna
    assert.equal(g.deck.discardPile.some(c => c.id === 950), true);
});

test('Elena Fuente: playability – v obraně proti Bang! je hratelná jakákoli karta', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Elena Fuente' }]);
    give(g, 0, CardType.BANG);
    const junk = mkCard(CardType.STORE, { id: 951 });
    g.players[1].hand = [junk];
    g.pendingResponse = { active: true, targetIdx: 1, requiredCard: CardType.MISSED };
    g.phase = 'RESPOND';
    assert.equal(cardPlayability(g, g.players[1], 1, junk), true);
});

// ── Molly Stark ──────────────────────────────────────────────────────────────
test('Molly Stark: mimo svůj tah zahraje Vedle! → lízne 1 (fronta)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Molly Stark' }]);
    g.currentPlayerIndex = 0;                  // tah hráče 0, ne Molly
    g.deck.cards = [mkCard(CardType.BANG, { id: 960 })];
    const bang = give(g, 0, CardType.BANG);
    give(g, 1, CardType.MISSED);
    g.playBang(0, 1, bang);
    g.handleResponse(1, 0);                     // Molly hraje Vedle!
    // Náhrada: KILL_REWARD 1 pro Molly → líže klikem na balíček
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
    g.drawCard('deck');
    assert.equal(g.players[1].hand.some(c => c.id === 960), true);
});

test('Molly Stark: náhrada za Bang! v Duelu se odloží až do konce Duelu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Molly Stark' }]);
    g.currentPlayerIndex = 0;
    g.deck.cards = [mkCard(CardType.BANG, { id: 962 }), mkCard(CardType.BANG, { id: 961 })];
    const duel = give(g, 0, CardType.DUEL);
    give(g, 1, CardType.BANG, { id: 970 });    // Molly má Bang! do duelu
    g.playSpecialCard(0, 1, duel);
    assert.equal(g.phase, 'RESPOND');
    // Molly (cíl duelu) odpoví Bang! → náhrada se odloží (ne hned DRAW)
    g.handleResponse(1, g.players[1].hand.findIndex(c => c.id === 970));
    assert.equal(g._mollyDeferred, 1);
    assert.notEqual(g.phase, 'DRAW');
    // Šerif už nemá Bang! → duel končí, teď se uvolní Mollyina náhrada
    g.handleResponse(0, null);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
});
