// Rozšíření Dodge City – fáze 7: globální/kopírovací postavy.
// Apache Kid (imunita vůči ♦), Belle Star (ruší cizí karty na stole ve svém tahu),
// Vera Custer (kopíruje cizí schopnost).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

// ── Apache Kid ───────────────────────────────────────────────────────────────
test('Apache Kid: kárový Bang! na něj nemá efekt', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Apache Kid' }, { role: 'Outlaw' }], { current: 1 });
    const idx = give(g, 1, CardType.BANG, { suit: Suits.DIAMONDS });
    g.playBang(1, 0, idx);
    assert.equal(g.phase, 'PLAY');            // žádný RESPOND
    assert.equal(g.players[0].health, 4);
});

test('Apache Kid: nekárový Bang! ho zasáhne normálně (RESPOND)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Apache Kid' }, { role: 'Outlaw' }], { current: 1 });
    const idx = give(g, 1, CardType.BANG, { suit: Suits.SPADES });
    g.playBang(1, 0, idx);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 0);
});

test('Apache Kid: kárový Duel na něj nemá efekt (karta ♦ zahraná na něj)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff', character: 'Apache Kid' }], { current: 0 });
    const didx = give(g, 0, CardType.DUEL, { suit: Suits.DIAMONDS });
    g.playSpecialCard(0, 1, didx);
    assert.equal(g.phase, 'PLAY');            // Duel se odhodí naprázdno, žádný RESPOND
    assert.equal(g.players[1].health, 4);
});

test('Apache Kid: nekárový Duel ho zasáhne normálně (RESPOND)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff', character: 'Apache Kid' }], { current: 0 });
    const didx = give(g, 0, CardType.DUEL, { suit: Suits.SPADES });
    g.playSpecialCard(0, 1, didx);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);                 // Apache nemá Bang! → schytá zásah
    assert.equal(g.players[1].health, 3);
});

test('Apache Kid: kárová karta zahraná NA SEBE má efekt (imunita jen vůči cizím)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Apache Kid' }, { role: 'Outlaw' }], { current: 0 });
    assert.equal(g._apacheImmune(0, Suits.DIAMONDS, 1), true);   // cizí kárová → imunní
    assert.equal(g._apacheImmune(0, Suits.DIAMONDS, 0), false);  // vlastní kárová na sebe → NE
    // vlastní kárový Bang! na sebe → vstoupí do řešení zásahu (ne rovnou PLAY „naprázdno")
    const idx = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    g.playBang(0, 0, idx);
    assert.equal(g.phase, 'RESPOND');
});

test('Apache Kid: givenutá kárová Bang! (debug) na něj nemá efekt (suit mapping)', () => {
    // Regrese: debugGiveCard dostává suit jako klíč z cards.json ("DIAMONDS"); musí ho
    // mapovat přes Suits[...] na symbol, jinak by imunita vůči ♦ na givenutých kartách nefungovala.
    const g = mkGame([{ role: 'Sheriff', character: 'Apache Kid' }, { role: 'Outlaw' }], { current: 1 });
    g.debugGiveCard(1, { id: 3, name: 'Bang!', type: 'BANG', suit: 'DIAMONDS', value: '2' });
    const idx = g.players[1].hand.length - 1;
    assert.equal(g.players[1].hand[idx].suit, Suits.DIAMONDS);   // namapováno na '♦️'
    g.playBang(1, 0, idx);
    assert.equal(g.phase, 'PLAY');            // imunní → žádný RESPOND
    assert.equal(g.players[0].health, 4);
});

test('Apache Kid: kárový hromadný útok (Indiáni ♦) ho přeskočí', () => {
    const g = mkGame([{ role: 'Sheriff' }, { character: 'Apache Kid' }, { role: 'Outlaw' }], { current: 0 });
    const iidx = give(g, 0, CardType.INDIANS, { suit: Suits.DIAMONDS });
    g.playCard(iidx);
    assert.equal(g.pendingResponse.active, true);
    assert.equal(g.pendingResponse.targetIdx, 2);   // hráč 1 (Apache) přeskočen
});

test('Apache Kid: kárová Panika! na něj nemá efekt', () => {
    const g = mkGame([{ role: 'Sheriff' }, { character: 'Apache Kid' }], { current: 0 });
    give(g, 1, CardType.BANG);                 // Apache má co ukrást
    const pidx = give(g, 0, CardType.PANIC, { suit: Suits.DIAMONDS });
    g.playSpecialCard(0, 1, pidx);
    assert.equal(g.phase, 'PLAY');             // žádný výběr karty
    assert.equal(g.players[1].hand.length, 1); // nic neukradeno
});

test('Apache Kid: kárová Cat Balou na něj nemá efekt', () => {
    const g = mkGame([{ role: 'Sheriff' }, { character: 'Apache Kid' }], { current: 0 });
    give(g, 1, CardType.BANG);
    const cidx = give(g, 0, CardType.CAT_BALOU, { suit: Suits.DIAMONDS });
    g.playSpecialCard(0, 1, cidx);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand.length, 1);
});

test('Apache Kid: kárové Vězení na něj nemá efekt, ♠ Vězení ho zavře', () => {
    const gd = mkGame([{ role: 'Sheriff' }, { character: 'Apache Kid' }], { current: 0 });
    const jd = give(gd, 0, CardType.JAIL, { suit: Suits.DIAMONDS });
    gd.playSpecialCard(0, 1, jd);
    assert.equal(gd.players[1].board.length, 0);   // nezavřený

    const gs = mkGame([{ role: 'Sheriff' }, { character: 'Apache Kid' }], { current: 0 });
    const js = give(gs, 0, CardType.JAIL, { suit: Suits.SPADES });
    gs.playSpecialCard(0, 1, js);
    assert.equal(gs.players[1].board.length, 1);   // zavřený
});

test('Apache Kid: Doc Holyday se 2 károvými odhozy ho mine', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Doc Holyday' }, { character: 'Apache Kid' }], { current: 0 });
    const c1 = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    const c2 = give(g, 0, CardType.MISSED, { suit: Suits.DIAMONDS });
    g.useDocHolyday(0, [c1, c2], 1);
    assert.equal(g.phase, 'PLAY');             // imunní → bez efektu
    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[0].hand.length, 0); // obě karty odhozeny (schopnost použita)
});

test('Apache Kid: Doc Holyday s jednou nekárovou kartou ho zasáhne', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Doc Holyday' }, { character: 'Apache Kid' }], { current: 0 });
    const c1 = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    const c2 = give(g, 0, CardType.MISSED, { suit: Suits.SPADES });
    g.useDocHolyday(0, [c1, c2], 1);
    assert.equal(g.phase, 'RESPOND');
});

test('Apache Kid: kárový Krytý vůz (zelený steal) ho mine', () => {
    const g = mkGame([{ role: 'Sheriff' }, { character: 'Apache Kid' }], { current: 0 });
    g.turnId = 5;
    const kv = board(g, 0, CardType.COVERED_WAGON, { suit: Suits.DIAMONDS, props: { green: true, activate: 'steal_any' } });
    kv._playedTurn = 1;
    give(g, 1, CardType.BANG);
    g.activateGreenCard(0, kv.id, { targetIdx: 1, area: 'hand' });
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand.length, 1);  // neukradeno
    assert.equal(g.players[0].board.length, 0); // zelená spotřebována
});

// ── Belle Star ───────────────────────────────────────────────────────────────
test('Belle Star: v jejím tahu cizí Mustang neprodlužuje vzdálenost', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Belle Star' }, { role: 'Outlaw' }], { current: 0 });
    board(g, 1, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    assert.equal(g.getDistance(0, 1), 1);        // její tah → Mustang ignorován
    g.currentPlayerIndex = 1;                     // není její tah
    assert.equal(g.getDistance(0, 1), 2);        // Mustang platí
});

test('Belle Star: v jejím tahu cizí Barel neplatí (žádný BARREL_DRAW)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Belle Star' }, { role: 'Outlaw' }], { current: 0 });
    board(g, 1, CardType.BARREL);
    const idx = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    g.playBang(0, 1, idx);
    assert.equal(g.phase, 'RESPOND');            // barel ignorován

    const g2 = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { current: 0 });
    board(g2, 1, CardType.BARREL);
    const idx2 = give(g2, 0, CardType.BANG, { suit: Suits.SPADES });
    g2.playBang(0, 1, idx2);
    assert.equal(g2.phase, 'BARREL_DRAW');       // běžný útočník → barel funguje
});

test('Belle Star: cíl nemůže uhnout zelenou kartou ze stolu (její tah)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Belle Star' }, { role: 'Outlaw' }], { current: 0 });
    const ip = board(g, 1, CardType.IRON_PLATE, { props: { green: true, activate: 'miss' } });
    const idx = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    g.playBang(0, 1, idx);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null, ip.id);            // zkusí zelený Železný plát
    assert.equal(g.phase, 'RESPOND');            // odmítnuto – pořád RESPOND
    assert.equal(g.players[1].board.some(c => c.id === ip.id), true);

    const g2 = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { current: 0 });
    const ip2 = board(g2, 1, CardType.IRON_PLATE, { props: { green: true, activate: 'miss' } });
    const idx2 = give(g2, 0, CardType.BANG, { suit: Suits.SPADES });
    g2.playBang(0, 1, idx2);
    g2.handleResponse(1, null, ip2.id);          // běžný útočník → zelená Vedle! projde
    assert.equal(g2.phase, 'PLAY');
    assert.equal(g2.players[1].board.some(c => c.id === ip2.id), false);
});

test('Belle Star: Jourdonnaisovi zůstává jeho VROZENÉ sejmutí (ruší jen karty na stole)', () => {
    // Belle Star ruší cizí KARTY na stole; Jourdonnaisův barel je schopnost postavy,
    // takže sejmutí proběhne (a při ♥ zásah mine).
    const g = mkGame([
        { role: 'Sheriff', character: 'Belle Star' }, { role: 'Outlaw', character: 'Jourdonnais' },
    ], { current: 0 });
    topDeck(g, Suits.HEARTS);
    const idx = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    g.playBang(0, 1, idx);
    assert.equal(g.phase, 'BARREL_DRAW');
    assert.equal(g.pendingBarrelCheck.reason, 'JOURDONNAIS');
    assert.equal(g.pendingBarrelCheck.checksLeft, 1);   // barel na stole se nepočítá
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.players[1].health, 4);               // ♥ → zásah miň
    assert.equal(g.phase, 'PLAY');
});

test('Belle Star: Jourdonnais s Barelem má jen JEDNO sejmutí (karta na stole neplatí)', () => {
    const g = mkGame([
        { role: 'Sheriff', character: 'Belle Star' }, { role: 'Outlaw', character: 'Jourdonnais' },
    ], { current: 0 });
    board(g, 1, CardType.BARREL);
    const idx = give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    g.playBang(0, 1, idx);
    assert.equal(g.pendingBarrelCheck.checksLeft, 1);

    // Bez Belle Star jsou to dvě sejmutí (schopnost + karta).
    const g2 = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Jourdonnais' }], { current: 0 });
    board(g2, 1, CardType.BARREL);
    const idx2 = give(g2, 0, CardType.BANG, { suit: Suits.SPADES });
    g2.playBang(0, 1, idx2);
    assert.equal(g2.pendingBarrelCheck.checksLeft, 2);
});

// ── Vera Custer ──────────────────────────────────────────────────────────────
test('Vera Custer: začátek tahu → VERA_COPY s volbami žijících cizích postav', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Bart Cassidy' }, { role: 'Renegade', character: 'Slab the Killer' }], { current: 0 });
    g.turnId = 3;
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'VERA_COPY');
    assert.deepEqual(g.pendingVeraCopy.choices.sort(), ['Bart Cassidy', 'Slab the Killer']);
});

test('Vera Custer: zkopíruje Pixie Pete → líže 3 karty', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Pixie Pete' }], { current: 0 });
    g.turnId = 3;
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'VERA_COPY');
    g.veraCopyCharacter(0, 'Pixie Pete');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 3);   // převzatá schopnost Pixie Pete
    assert.equal(g.players[0]._copiedCharacter, 'Pixie Pete');
});

test('Vera Custer: zkopíruje Bart Cassidy → líže při zranění', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Bart Cassidy' }], { current: 0 });
    g.turnId = 3;
    g.handleStartOfTurnChecks();
    g.veraCopyCharacter(0, 'Bart Cassidy');
    g.handleDamage(0, 1);                             // Vera dostane zásah
    assert.ok(g.specialActionQueue.some(a => a.type === 'BART_DRAW' && a.playerIdx === 0));
});

test('Vera Custer: kopie drží i mimo její tah, nová volba až příští tah', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Bart Cassidy' }], { current: 0 });
    g.turnId = 3;
    g.handleStartOfTurnChecks();
    g.veraCopyCharacter(0, 'Bart Cassidy');
    g.currentPlayerIndex = 1;                         // teď hraje soupeř
    assert.equal(g._veraCopiedTurn === undefined || g.players[0]._veraCopiedTurn === 3, true);
    // Vera pořád „je" Bart Cassidy → zásah mimo její tah ji nechá líznout
    g.handleDamage(0, 1);
    assert.ok(g.specialActionQueue.some(a => a.type === 'BART_DRAW' && a.playerIdx === 0));
});

test('Vera Custer: volba postavy je AŽ PO checku na Dynamit (CHECK_DRAW, pak VERA_COPY)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Lucky Duke' }], { current: 0 });
    g.turnId = 3;
    board(g, 0, CardType.DYNAMITE);
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');           // nejdřív check, volba až před lízáním
    topDeck(g, Suits.CLUBS, 'Q');                  // ne ♠2-9 → nevybuchne
    for (let i = 0; i < 4; i++) g.deck.cards.unshift(mkCard(CardType.BANG));
    g.triggerCheckDraw();
    g.resolveCheck();                              // dynamit odejde na dalšího hráče
    assert.equal(g.phase, 'VERA_COPY');            // teprve teď volba (těsně před lízáním)
    g.veraCopyCharacter(0, 'Lucky Duke');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.players[0]._copiedCharacter, 'Lucky Duke');
});

test('Vera Custer: check na Dynamit běží s kopií z MINULÉHO tahu (Lucky Duke → 2 karty)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Lucky Duke' }], { current: 0 });
    g.turnId = 4;
    g.players[0]._copiedCharacter = 'Lucky Duke';  // zkopírováno minulý tah
    g.players[0]._veraCopiedTurn = 2;
    board(g, 0, CardType.DYNAMITE);
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    for (let i = 0; i < 4; i++) g.deck.cards.push(mkCard(CardType.BANG));
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');           // kopie ještě platí → 2 karty na výběr
});

test('Vera Custer: ve vězení (tah propadl) kopie vyprší – bez schopnosti do dalšího tahu', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Bart Cassidy' }], { current: 0 });
    g.turnId = 4;
    g.players[0]._copiedCharacter = 'Bart Cassidy';
    g.players[0]._veraCopiedTurn = 2;
    board(g, 0, CardType.JAIL);
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    topDeck(g, Suits.SPADES, '8');                 // ne srdce → tah propadá
    for (let i = 0; i < 4; i++) g.deck.cards.unshift(mkCard(CardType.BANG));
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1);         // tah přeskočen
    assert.equal(g.players[0]._copiedCharacter, null);
    // zásah mimo její tah už NEspustí Bartovo líznutí – kopie vypršela
    g.handleDamage(0, 1);
    assert.equal(g.specialActionQueue.some(a => a.type === 'BART_DRAW'), false);
});

test('Vera Custer: neplatná volba (ne v choices) se odmítne', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Vera Custer' }, { role: 'Outlaw', character: 'Bart Cassidy' }], { current: 0 });
    g.turnId = 3;
    g.handleStartOfTurnChecks();
    const ok = g.veraCopyCharacter(0, 'Willy the Kid');   // nikdo ji nemá
    assert.equal(ok, false);
    assert.equal(g.phase, 'VERA_COPY');                   // pořád čeká
});

// ── Regrese: 2 kill-rewardy z jedné smrti (Herb Hunter + odměna za banditu) ────
// Dřív dvojité volání _processSpecialQueue (během aktivního kill-reward lízání) přepsalo
// drawPhaseState a hra uvázla ve fázi DRAW s active=false. Guard to musí ustát.
test('Fronta: dva kill-rewardy za sebou se korektně dolížou (žádné uváznutí v DRAW)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { current: 0, phase: 'PLAY' });
    for (let i = 0; i < 8; i++) g.deck.cards.push(mkCard(CardType.BANG));
    g.interruptedPhase = null;
    g.specialActionQueue = [
        { type: 'KILL_REWARD', playerIdx: 0, cardsNeeded: 2 },
        { type: 'KILL_REWARD', playerIdx: 1, cardsNeeded: 2 },
    ];

    g._processSpecialQueue();                 // KR#1 → DRAW (hráč 0)
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0);

    g._processSpecialQueue();                 // dvojité volání – musí být no-op (draw běží)
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0);   // NEpřepsáno na hráče 1
    assert.equal(g.specialActionQueue.length, 1);  // KR#2 pořád ve frontě

    g.drawCard('deck'); g.drawCard('deck');   // dokonči KR#1 → naváže KR#2 (hráč 1)
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);

    g.drawCard('deck'); g.drawCard('deck');   // dokonči KR#2 → zpět do PLAY
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[1].hand.length, 2);
});
