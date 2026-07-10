// Rozšíření Dodge City – fáze 5: karty se zeleným okrajem (vyloží se na stůl,
// aktivují se až příští tah; Vedle!-zelené jen jako reakce).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');
const { cardPlayability } = require('../core/playability.js');
const { getActionForCard } = require('../core/cardRules.js');

before(() => { console.log = () => {}; });

// Zelenou kartu polož rovnou na stůl s razítkem „minulý tah" (lze aktivovat teď).
function putGreen(g, idx, type, props, id) {
    const c = board(g, idx, type, { id, props: { green: true, ...props } });
    c._playedTurn = 0;      // položena dřív než aktuální tah
    return c;
}

test('zelená karta se z ruky vyloží na stůl s razítkem tahu (nelze hned aktivovat)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.turnId = 5;
    const i = give(g, 0, CardType.CANTEEN, { props: { green: true, activate: 'heal_self' } });
    g.playCard(i);
    assert.equal(g.players[0].board.length, 1);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.players[0].board[0]._playedTurn, 5);
    // aktivace ve stejném tahu neprojde
    g.players[0].health = 1;
    g.activateGreenCard(0, g.players[0].board[0].id, null);
    assert.equal(g.players[0].health, 1);
    assert.equal(g.players[0].board.length, 1);
});

test('getActionForCard: zelená karta se hraje na stůl (PLAY_BLUE)', () => {
    assert.equal(getActionForCard(mkCard(CardType.PEPPERBOX, { props: { green: true, bangEffect: true, range: 'weapon' } })), 'PLAY_BLUE');
    assert.equal(getActionForCard(mkCard(CardType.CANTEEN, { props: { green: true, activate: 'heal_self' } })), 'PLAY_BLUE');
});

test('playability: nelze mít 2 zelené stejného jména na stole', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    putGreen(g, 0, CardType.CANTEEN, { activate: 'heal_self' }, 900);
    const dup = mkCard(CardType.CANTEEN, { props: { green: true, activate: 'heal_self' } });
    g.players[0].hand = [dup];
    assert.equal(cardPlayability(g, g.players[0], 0, dup), false);
});

test('Čutora: aktivace +1 sobě (odhodí kartu ze stolu)', () => {
    const g = mkGame([{ role: 'Sheriff', health: 2, maxHealth: 4 }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const c = putGreen(g, 0, CardType.CANTEEN, { activate: 'heal_self' }, 901);
    g.activateGreenCard(0, c.id, null);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].board.length, 0);
    assert.equal(g.deck.discardPile.at(-1).id, 901);
    assert.equal(g.phase, 'PLAY');
});

test('Nůž (bang-efekt dostřel 1): zásah souseda → RESPOND, bez limitu Bang!', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.turnId = 1;
    g.players[0].bangsPlayedThisTurn = 1;   // limit vyčerpán, bang-efekt ho ignoruje
    const c = putGreen(g, 0, CardType.KNIFE, { bangEffect: true, range: 1 }, 902);
    g.activateGreenCard(0, c.id, { targetIdx: 1 });
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 1);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Nůž: vzdálený hráč mimo dostřel 1 → nic', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const c = putGreen(g, 0, CardType.KNIFE, { bangEffect: true, range: 1 }, 903);
    g.activateGreenCard(0, c.id, { targetIdx: 2 }); // vzdálenost 2
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].board.length, 1);      // karta zůstala (aktivace neplatná)
});

test('Nůž na sebe: pravidla umožňují vystřelit na sebe → RESPOND s cílem = já', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.turnId = 1;
    const c = putGreen(g, 0, CardType.KNIFE, { bangEffect: true, range: 1 }, 906);
    g.activateGreenCard(0, c.id, { targetIdx: 0 });   // na sebe
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 0);
    assert.equal(g.pendingResponse.originatorIdx, 0);
    assert.equal(g.players[0].board.length, 0);        // zelená karta se odhodila
    g.handleResponse(0, null);                          // schytám vlastní zásah
    assert.equal(g.players[0].health, g.players[0].maxHealth - 1);
});

test('Puška na bizony (dostřel any): zasáhne i vzdáleného', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const c = putGreen(g, 0, CardType.BUFFALO_RIFLE, { bangEffect: true, range: 'any' }, 904);
    g.activateGreenCard(0, c.id, { targetIdx: 2 });
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 2);
});

test('Derringer (dostřel 1 + lízni 1): lízni PŘED zásahem (dle textu karty), pak bang', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    g.deck.cards = [mkCard(CardType.BANG, { id: 970 })];
    const c = putGreen(g, 0, CardType.DERRINGER, { bangEffect: true, range: 1, draw: 1 }, 905);
    g.activateGreenCard(0, c.id, { targetIdx: 1 });
    // „Lízni si kartu, pak je to Bang!" → nejdřív líznutí útočníka (klik na balíček).
    assert.equal(g.phase, 'UHYB_DRAW');
    g.uhybDraw(0);
    assert.equal(g.players[0].hand.some(c => c.id === 970), true);
    // Teprve pak se řeší bang.
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Houfnice (mass): útok na všechny ostatní (Kulomet)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.turnId = 1;
    const c = putGreen(g, 0, CardType.HOWITZER, { bangEffect: true, range: 'mass' }, 906);
    g.activateGreenCard(0, c.id, null);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.requiredCard, CardType.MISSED);
    g.handleResponse(1, null);
    g.handleResponse(2, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[2].health, 3);
});

test('Pony express (lízni 3): DRAW fáze, cardsNeeded 3', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const c = putGreen(g, 0, CardType.PONY_EXPRESS, { activate: 'draw_3' }, 907);
    g.activateGreenCard(0, c.id, null);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    assert.equal(g.players[0].board.length, 0);
});

test('Krytý vůz (steal any): ukradni kartu i vzdálenému', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.turnId = 1;
    give(g, 2, CardType.MISSED);
    const c = putGreen(g, 0, CardType.COVERED_WAGON, { activate: 'steal_any' }, 908);
    g.activateGreenCard(0, c.id, { targetIdx: 2, area: 'hand', boardIdx: null });
    assert.equal(g.players[2].hand.length, 0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Kankán (discard any): odhoď kartu i vzdálenému', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.turnId = 1;
    give(g, 2, CardType.BANG);
    const c = putGreen(g, 0, CardType.CAN_CAN, { activate: 'discard_any' }, 909);
    g.activateGreenCard(0, c.id, { targetIdx: 2, area: 'hand', boardIdx: null });
    assert.equal(g.players[2].hand.length, 0);
    assert.equal(g.players[0].hand.length, 0);   // Kankán nekrade, jen zahazuje
    assert.equal(g.phase, 'PLAY');
});

test('Kankán na sebe: odhodí vlastní kartu na stole (i po posunu indexů)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const kancan = putGreen(g, 0, CardType.CAN_CAN, { activate: 'discard_any' }, 909); // board[0]
    board(g, 0, CardType.BARREL, { id: 950 });                                          // board[1] (cíl)
    assert.equal(g.players[0].board.length, 2);
    // Klient posílá index z pohledu PŘED odhozem Kankánu (boardIdx: 1). Po odhození se
    // index posune, server musí odhodit SPRÁVNOU kartu (950), ne vedlejší.
    g.activateGreenCard(0, kancan.id, { targetIdx: 0, area: 'board', boardIdx: 1 });
    assert.equal(g.players[0].board.length, 0);                       // Kankán i cíl pryč
    assert.equal(g.deck.discardPile.some(c => c.id === 950), true);   // odhozena správná karta
    assert.equal(g.phase, 'PLAY');
});

test('Krytý vůz na sebe: vezme vlastní kartu ze stolu do ruky', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const wagon = putGreen(g, 0, CardType.COVERED_WAGON, { activate: 'steal_any' }, 908); // board[0]
    board(g, 0, CardType.BARREL, { id: 951 });                                             // board[1] (cíl)
    g.activateGreenCard(0, wagon.id, { targetIdx: 0, area: 'board', boardIdx: 1 });
    assert.equal(g.players[0].board.length, 0);
    assert.equal(g.players[0].hand.some(c => c.id === 951), true);    // karta se vrátila do ruky
    assert.equal(g.phase, 'PLAY');
});

test('Zelená steal/discard na sebe nesmí cílit sama na sebe (aktivovaná karta)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const kancan = putGreen(g, 0, CardType.CAN_CAN, { activate: 'discard_any' }, 912); // board[0]
    // boardIdx 0 = sama aktivovaná karta → neplatné, nic se nestane.
    g.activateGreenCard(0, kancan.id, { targetIdx: 0, area: 'board', boardIdx: 0 });
    assert.equal(g.players[0].board.length, 1);   // Kankán zůstal (aktivace neproběhla)
});

test('Vedle!-zelená (Železný plát) se ve svém tahu NEaktivuje', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.turnId = 1;
    const c = putGreen(g, 0, CardType.IRON_PLATE, { activate: 'miss' }, 910);
    g.activateGreenCard(0, c.id, null);
    assert.equal(g.players[0].board.length, 1);   // zůstala na stole
    assert.equal(g.phase, 'PLAY');
});

test('Vedle!-zelená jako reakce ubrání Bang! (odhodí se ze stolu)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const plate = board(g, 1, CardType.IRON_PLATE, { id: 911, props: { green: true, activate: 'miss' } });
    // Šerif střílí na hráče 1
    const bang = give(g, 0, CardType.BANG);
    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null, 911);              // obrana zelenou kartou ze stolu
    assert.equal(g.players[1].health, 4);        // nezraněn
    assert.equal(g.players[1].board.length, 0);  // Železný plát odhozen
});

test('Bible jako reakce ubrání Bang! a zařadí líznutí (UHYB_DRAW)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.deck.cards = [mkCard(CardType.BANG, { id: 971 })];
    board(g, 1, CardType.BIBLE, { id: 912, props: { green: true, draw: 1, activate: 'miss' } });
    const bang = give(g, 0, CardType.BANG);
    g.playBang(0, 1, bang);
    g.handleResponse(1, null, 912);
    assert.equal(g.players[1].health, 4);
    // líznutí Bible čeká na klik balíčku (UHYB_DRAW), řeší ho hráč 1
    assert.equal(g.phase, 'UHYB_DRAW');
    g.uhybDraw(1);
    assert.equal(g.players[1].hand.some(c => c.id === 971), true);
});
