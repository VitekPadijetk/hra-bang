// Testy čisté botí policy (core/botPolicy.js): pendingActor + decideBotAction.
// Stav stavíme přes sdílené _helpers (ruční GameState) – policy běží nad stejným tvarem.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, give, board, CardType, Suits } = require('./_helpers.js');
const { pendingActor, decideBotAction, roleHostility } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

// ── pendingActor ─────────────────────────────────────────────────────────────
test('pendingActor: PLAY → aktuální hráč', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'PLAY', current: 1 });
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'PLAY' });
});

test('pendingActor: RESPOND → cíl pendingResponse', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    g.pendingResponse = { active: true, targetIdx: 0, requiredCard: 'Vedle!', responded: [] };
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'RESPOND' });
});

test('pendingActor: neaktivní pendingResponse → null', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    g.pendingResponse = { active: false, targetIdx: 0 };
    assert.equal(pendingActor(g), null);
});

test('pendingActor: CHARACTER_SELECT → první hráč bez postavy', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'CHARACTER_SELECT' });
    g.players[0].charChoices = ['Willy the Kid', 'Sid Ketchum'];
    g.players[1].charChoices = ['Bart Cassidy', 'Black Jack'];
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'CHARACTER_SELECT' });
});

// ── role: nepřátelskost (čistá tabulka rolí, bez čtení stavu) ──────────────────
test('role: bandita nejvíc cílí šerifa, šerif nikdy pomocníka', () => {
    assert.ok(roleHostility('Outlaw', 'Sheriff') > roleHostility('Outlaw', 'Deputy'));
    assert.ok(roleHostility('Sheriff', 'Deputy') < 0);
    assert.ok(roleHostility('Sheriff', 'Outlaw') > 0);
});

// ── PLAY ───────────────────────────────────────────────────────────────────────
test('PLAY: bandita vystřelí Bang na šerifa v dostřelu', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Deputy' }], { current: 0 });
    const bangIdx = give(g, 0, CardType.BANG);
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.targetIdx, 1);   // šerif, ne pomocníci
    assert.equal(a.payload.cardIdx, bangIdx);
});

test('PLAY: šerif míří na prokázaného nepřítele, ne na prokázaného spojence (skryté role)', () => {
    // Bot NEZNÁ role – dedukuje z chování. 5 hráčů: sousedé šerifa jsou idx1 a idx4.
    // Ledger: idx1 útočil na šerifa (nepřítel); idx4 bránil šerifa (útočil na idx1) → spojenec.
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }, { role: 'Deputy' }], { current: 0 });
    give(g, 0, CardType.BANG);
    g.behaviorLedger = { pairs: { 1: { 0: { hostile: 3 } }, 4: { 1: { hostile: 3 } } } };
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.targetIdx, 1);   // prokázaný nepřítel, ne obránce (idx4)
});

test('PLAY: nízké HP → přednost Pivu před útokem', () => {
    // Pivo je hratelné jen při >2 živých (viz cardPlayability), proto 3 hráči.
    const g = mkGame([{ role: 'Outlaw', maxHealth: 4, health: 1 }, { role: 'Sheriff' }, { role: 'Deputy' }], { current: 0 });
    const beerIdx = give(g, 0, CardType.BEER);
    give(g, 0, CardType.BANG);
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_card');
    assert.equal(a.payload, beerIdx);
});

test('PLAY: prázdná/nehratelná ruka → end_turn', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'end_turn');
});

// ── RESPOND ─────────────────────────────────────────────────────────────────────
test('RESPOND: uhne kartou Vedle!', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'RESPOND' });
    const dodge = give(g, 0, CardType.MISSED);
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_to_card', payload: { playerIdx: 0, cardIndex: dodge } });
});

test('RESPOND: bez obrany → schytá zásah (cardIndex null)', () => {
    const g = mkGame([{ role: 'Outlaw', health: 3 }, { role: 'Sheriff' }], { phase: 'RESPOND' });
    give(g, 0, CardType.BEER);
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_to_card', payload: { playerIdx: 0, cardIndex: null } });
});

test('RESPOND: poslední život bez Vedle! → záchrana Pivem', () => {
    const g = mkGame([{ role: 'Outlaw', health: 1 }, { role: 'Sheriff' }, { role: 'Deputy' }], { phase: 'RESPOND' });
    const beer = give(g, 0, CardType.BEER);
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_with_beer', payload: { playerIdx: 0, cardIdx: beer } });
});

// ── DISCARD ─────────────────────────────────────────────────────────────────────
test('DISCARD: odhodí nejméně cennou kartu (dynamit dřív než Bang)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'DISCARD', current: 0 });
    const dyn = give(g, 0, CardType.DYNAMITE);
    give(g, 0, CardType.BANG);
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'discard_card', payload: dyn });
});

// ── DRAW ─────────────────────────────────────────────────────────────────────────
test('DRAW: líznutí z balíčku', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'DRAW', current: 0 });
    g.drawPhaseState = { active: true, playerIdx: 0, cardsNeeded: 2, cardsDrawn: 0, options: ['deck'] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'draw_card', payload: { source: 'deck', sourceIdx: null } });
});

// ── CHARACTER_SELECT ───────────────────────────────────────────────────────────
test('CHARACTER_SELECT: vybere výše hodnocenou postavu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'CHARACTER_SELECT' });
    g.players[0].charChoices = ['Sid Ketchum', 'Willy the Kid'];
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'select_character', payload: 'Willy the Kid' });
});

// ── Skryté role: cílení podle chování ─────────────────────────────────────────
test('PLAY: bandita NEstřílí prokázaného spoluodpadlíka; radši ukončí tah', () => {
    // 5 hráčů. Sousedé bota (Outlaw idx0) jsou idx1 a idx4. Ledger: oba útočili na
    // šerifa → vypadají jako spoluodpadlíci (spojenci). Ostatní nepřátelé mimo dosah.
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Renegade' }, { role: 'Deputy' }], { current: 0 });
    give(g, 0, CardType.BANG);
    g.behaviorLedger = { pairs: { 1: { 2: { hostile: 4 } }, 4: { 2: { hostile: 4 } } } };
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'end_turn');   // nestřílí na spojence, šerif je mimo dosah
});

// ── Hraní všech karet: dynamit ────────────────────────────────────────────────
test('PLAY: dynamit se zahraje, když po proudu jsou nepřátelé', () => {
    // Outlaw(0), hned za ním šerif(1) → dynamit letí k nepříteli.
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }], { current: 0 });
    const dyn = give(g, 0, CardType.DYNAMITE);
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'play_card', payload: dyn });
});

// ── Hraní všech karet: zelené karty (Dodge City) ──────────────────────────────
test('PLAY: zelenou kartu z ruky vyloží na stůl', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    const gi = give(g, 0, CardType.IRON_PLATE, { props: { green: true, activate: 'miss' } });
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'play_card', payload: gi });
});

test('PLAY: aktivuje zelenou bang-efekt kartu ze stolu na nepřítele', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    g.turnId = 5;
    const knife = board(g, 0, CardType.KNIFE, { props: { green: true, bangEffect: true, range: 1 } });
    knife._playedTurn = 1;   // z minulého tahu → aktivovatelná
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'activate_green_card');
    assert.equal(a.payload.cardId, knife.id);
    assert.equal(a.payload.target.targetIdx, 1);   // šerif (veřejný nepřítel)
});

// ── Hraní všech karet: „odhoď další kartu" ────────────────────────────────────
test('PLAY: Springfield zahájí discard_extra_choose na nepřítele', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    const spr = give(g, 0, CardType.SPRINGFIELD, { props: { discardExtra: 'bang_any' } });
    give(g, 0, CardType.MISSED);   // druhá karta jako cena (v tahu nehratelná)
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'discard_extra_choose');
    assert.equal(a.payload.cardIdx, spr);
    assert.equal(a.payload.targetIdx, 1);
});

// ── Hraní všech karet: aktivní schopnost postavy ──────────────────────────────
test('PLAY: Chuck Wengam využije schopnost, když je chudý na karty', () => {
    const g = mkGame([{ role: 'Outlaw', character: 'Chuck Wengam', health: 4 }, { role: 'Sheriff' }], { current: 0 });
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'chuck_wengam' });
});

// ── RESPOND: zelená obrana ze stolu ───────────────────────────────────────────
test('RESPOND: bez Vedle! v ruce použije zelenou obranu ze stolu', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'RESPOND', current: 1 });
    g.turnId = 7;
    const plate = board(g, 0, CardType.IRON_PLATE, { props: { green: true, activate: 'miss' } });
    plate._playedTurn = 2;
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_to_card', payload: { playerIdx: 0, cardIndex: null, boardCardId: plate.id } });
});

// ── LUCKY DUKE ─────────────────────────────────────────────────────────────────
test('LUCKY_DUKE: pro dynamit vybere kartu, která NENÍ piky 2–9', () => {
    const g = mkGame([{ role: 'Outlaw', character: 'Lucky Duke' }], { phase: 'LUCKY_DUKE' });
    g.luckyDukeState = {
        cards: [
            { suit: Suits.SPADES, value: '5' },   // piky 5 = výbuch (špatné)
            { suit: Suits.HEARTS, value: '8' },   // bezpečné
        ],
        checkContext: { reason: 'DYNAMITE', playerIdx: 0 },
    };
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'lucky_duke_pick');
    assert.equal(a.payload, 1);
});
