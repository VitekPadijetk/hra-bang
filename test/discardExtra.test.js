// Rozšíření Dodge City – fáze 4: mechanika „odhoď další kartu" + 5 karet
// (Springfield/Tequila/Whisky/Ragtime/Rvačka).
// POŘADÍ: hráč zvolí hlavní kartu + CÍL (startDiscardExtra) → zaplatí další kartou
// (discardAnotherCard) → teprve pak efekt. Do odhozu jde nejdřív „další", pak hlavní.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');
const { cardPlayability } = require('../core/playability.js');
const { decideBotAction } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const de = (effect) => ({ props: { discardExtra: effect } });

test('startDiscardExtra: nelze hrát bez další karty k odhození', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.WHISKY, de('heal_self_2')); // jediná karta
    g.startDiscardExtra(0, { targetIdx: null });
    assert.equal(g.phase, 'PLAY');              // zůstalo v PLAY, karta nezmizela
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.pendingDiscardAnother, null);
});

test('Whisky: zvol balíček → zaplať kartou → +2 životy sobě; pořadí odhozu', () => {
    const g = mkGame([{ role: 'Sheriff', health: 1, maxHealth: 5 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.WHISKY, de('heal_self_2')); // idx 0 (main)
    give(g, 0, CardType.BANG);                       // idx 1 (extra = cena)

    g.startDiscardExtra(0, { targetIdx: null });     // klik na balíček
    assert.equal(g.phase, 'DISCARD_ANOTHER');
    assert.equal(g.pendingDiscardAnother.effect, 'heal_self_2');

    g.discardAnotherCard(0, 1);
    assert.equal(g.players[0].health, 3);   // 1 → 3
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.phase, 'PLAY');
    // Do odhozu jde nejdřív odhozená („další") karta, pak hraná karta navrch.
    const pile = g.deck.discardPile;
    assert.equal(pile[pile.length - 1].type, CardType.WHISKY);
    assert.equal(pile[pile.length - 2].type, CardType.BANG);
});

test('Whisky: +2 se zastaví na maxHealth', () => {
    const g = mkGame([{ role: 'Sheriff', health: 4, maxHealth: 5 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.WHISKY, de('heal_self_2'));
    give(g, 0, CardType.BANG);
    g.startDiscardExtra(0, { targetIdx: null });
    g.discardAnotherCard(0, 1);
    assert.equal(g.players[0].health, 5);
});

test('discardAnotherCard: nesmí odhodit hlavní kartu jako „další"', () => {
    const g = mkGame([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.WHISKY, de('heal_self_2'));
    give(g, 0, CardType.BANG);
    g.startDiscardExtra(0, { targetIdx: null });
    g.discardAnotherCard(0, 0);              // 0 = hlavní karta → neplatné
    assert.equal(g.phase, 'DISCARD_ANOTHER'); // pořád čeká
    assert.equal(g.players[0].health, 2);
});

test('Tequila: zvol hráče → zaplať → vyléčit +1', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 2, maxHealth: 4 }]);
    give(g, 0, CardType.TEQUILA, de('heal_any'));
    give(g, 0, CardType.BANG);

    g.startDiscardExtra(0, { targetIdx: 1 });   // klik na postavu p1
    assert.equal(g.phase, 'DISCARD_ANOTHER');

    g.discardAnotherCard(0, 1);
    assert.equal(g.players[1].health, 3);   // 2 → 3
    assert.equal(g.phase, 'PLAY');
});

test('Tequila: neplatný cíl (mrtvý) → nic se nestane', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 0 }]);
    give(g, 0, CardType.TEQUILA, de('heal_any'));
    give(g, 0, CardType.BANG);
    g.startDiscardExtra(0, { targetIdx: 1 });   // p1 je mrtvý → neplatné
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingDiscardAnother, null);
    assert.equal(g.players[0].hand.length, 2);
});

test('Tequila Joe dostane z Tequily jen +1 (efekt, ne Pivo)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Tequila Joe', health: 2, maxHealth: 5 }, { role: 'Outlaw' }]);
    give(g, 0, CardType.TEQUILA, de('heal_any'));
    give(g, 0, CardType.BANG);
    g.startDiscardExtra(0, { targetIdx: 0 });   // vyléčí sám sebe
    g.discardAnotherCard(0, 1);
    assert.equal(g.players[0].health, 3);   // jen +1
});

test('Springfield: zvol soupeře → zaplať → bang-efekt (bez limitu Bang!)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.players[0].bangsPlayedThisTurn = 1;   // limit Bang! už vyčerpán
    give(g, 0, CardType.SPRINGFIELD, de('bang_any'));
    give(g, 0, CardType.BANG);

    g.startDiscardExtra(0, { targetIdx: 1 });
    assert.equal(g.phase, 'DISCARD_ANOTHER');

    g.discardAnotherCard(0, 1);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 1);      // bang-efekt nezvyšuje na 2 ani u Slaba
    assert.equal(g.players[0].bangsPlayedThisTurn, 1); // Springfield limit nezvýšil

    g.handleResponse(1, null);              // cíl pasuje
    assert.equal(g.players[1].health, 3);
});

test('Ragtime: zvol kartu soupeře → zaplať → ukradni ji (bez vzdálenosti)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.RAGTIME, de('steal_any'));
    give(g, 0, CardType.BANG);
    give(g, 2, CardType.MISSED);            // oběť (vzdálenost 2) má 1 kartu

    g.startDiscardExtra(0, { targetIdx: 2, area: 'hand', boardIdx: null });
    assert.equal(g.phase, 'DISCARD_ANOTHER');

    g.discardAnotherCard(0, 1);
    assert.equal(g.players[2].hand.length, 0);   // oběť přišla o kartu
    assert.equal(g.players[0].hand.length, 1);   // útočník ji má (obě své odhodil, získal 1)
    assert.equal(g.phase, 'PLAY');
});

test('Ragtime na SEBE: vezmi si vlastní kartu ze stolu do ruky', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.RAGTIME, de('steal_any'));
    give(g, 0, CardType.BANG);              // cena (další karta)
    board(g, 0, CardType.BARREL, { id: 777 });   // moje modrá karta na stole

    g.startDiscardExtra(0, { targetIdx: 0, area: 'board', boardIdx: 0 });
    assert.equal(g.phase, 'DISCARD_ANOTHER');

    g.discardAnotherCard(0, 1);             // zaplať Bangem (index 1)
    assert.equal(g.players[0].board.length, 0);                 // Barel opustil stůl
    assert.ok(g.players[0].hand.some(c => c.id === 777));       // a je zpět v ruce
    assert.equal(g.phase, 'PLAY');
});

test('Ragtime na SEBE nesmí cílit vlastní ruku (area hand → nic)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    give(g, 0, CardType.RAGTIME, de('steal_any'));
    give(g, 0, CardType.BANG);

    g.startDiscardExtra(0, { targetIdx: 0, area: 'hand', boardIdx: null });
    assert.equal(g.phase, 'PLAY');          // neplatný cíl → stav se nezmění
});

test('Rvačka: zvol balíček → zaplať → každý ostatní odhodí 1 (útočník vybírá po směru)', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    give(g, 0, CardType.BRAWL, de('brawl'));
    give(g, 0, CardType.BANG);
    give(g, 1, CardType.BANG);
    give(g, 2, CardType.BANG);

    g.startDiscardExtra(0, { targetIdx: null });   // klik na balíček
    assert.equal(g.phase, 'DISCARD_ANOTHER');
    g.discardAnotherCard(0, 1);

    // 1. cíl (hráč 1)
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.targetIdx, 1);
    g.resolveCardSelection(0, 'hand', null);
    // 2. cíl (hráč 2)
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.targetIdx, 2);
    g.resolveCardSelection(0, 'hand', null);

    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.players[2].hand.length, 0);
    assert.equal(g.phase, 'PLAY');
});

test('Rvačka: pořadí cílů po směru hodinových ručiček od levice útočníka', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.currentPlayerIndex = 1;               // útočník = index 1 → pořadí má být 2, 0
    give(g, 1, CardType.BRAWL, de('brawl'));
    give(g, 1, CardType.BANG);
    give(g, 2, CardType.BANG);
    give(g, 0, CardType.BANG);

    g.startDiscardExtra(0, { targetIdx: null });
    g.discardAnotherCard(1, 1);
    const order = [g.pendingSelection.targetIdx];
    g.resolveCardSelection(1, 'hand', null);
    order.push(g.pendingSelection.targetIdx);
    g.resolveCardSelection(1, 'hand', null);

    assert.deepEqual(order, [2, 0]);
    assert.equal(g.phase, 'PLAY');
});

test('playability: „odhoď další kartu" vyžaduje 2. kartu a smysluplný cíl', () => {
    // Whisky: nehratelná bez další karty ani při plném životě.
    const g1 = mkGame([{ role: 'Sheriff', health: 4, maxHealth: 4 }, { role: 'Outlaw' }]);
    const w = mkCard(CardType.WHISKY, de('heal_self_2'));
    g1.players[0].hand = [w];
    assert.equal(cardPlayability(g1, g1.players[0], 0, w), false); // jen 1 karta
    g1.players[0].hand = [w, mkCard(CardType.BANG)];
    assert.equal(cardPlayability(g1, g1.players[0], 0, w), false); // plný život → zbytečné

    // Tequila: hratelná jen když je někdo zraněný.
    const g2 = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw', health: 2, maxHealth: 4 }]);
    const t = mkCard(CardType.TEQUILA, de('heal_any'));
    g2.players[0].hand = [t, mkCard(CardType.BANG)];
    assert.equal(cardPlayability(g2, g2.players[0], 0, t), true);
});

test('bot proaktivně nehraje „odhoď další kartu" (jen end_turn)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff', health: 2, maxHealth: 4 }]);
    // Ať zbyde jen Tequila + necílená karta (žádný Bang! na souseda) – bot má end-turnout.
    g.players[0].hand = [mkCard(CardType.TEQUILA, de('heal_any')), mkCard(CardType.PANIC, { id: 778 })];
    const action = decideBotAction(g, 0);
    assert.equal(action.event, 'end_turn');
});
