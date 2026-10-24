// Rozšíření Údolí stínů – fáze F2: postavy bez nových mechanismů.
//
//   COLORADO BILL  – „Když zahraješ kartu BANG!, sejmi. Pokud je sejmutá karta piková ♠,
//                    nelze tento BANG! zrušit." (znění Dynamite Boxu)
//   LIMONÁDOVÝ JIM – „Vždy, když některý z hráčů zahraje kartu PIVO, může si Jim za
//                    odhození libovolné karty doplnit 1 život." (ne za vlastní Pivo)
//
// Podklad: docs/udoli-stinu-plan.md §5 a §8 (F2), docs/udoli-stinu.md §3–§5.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { Card, distinctCardKinds, VOS_READY } = require('../logic/entities.js');
const { cardPlayability } = require('../core/playability.js');
const { pendingActor, waitingStatus, describePendingCheck, describePendingResponse } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { decideCardClick } = require('../core/selection.js');
const V = require('../core/valley.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);

let _vid = 78000;
function vcard(name, o = {}) {
    const k = kinds.find(c => c.name === name);
    assert.ok(k, name);
    const c = new Card(_vid++, k.name, k.type, o.suit ?? k.suit, o.value ?? k.value,
        { range: k.range, effect: k.effect, bangEffect: k.bangEffect });
    c.effect = k.effect;
    c.exp = 'udoli_stinu';
    return c;
}
function giveV(g, idx, name, o) {
    g.players[idx].hand.push(vcard(name, o));
    return g.players[idx].hand.length - 1;
}

const VOS_ON = { expansions: { udoli_stinu: true } };
function mkV(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.options = VOS_ON;
    g.turnId = 1;
    return g;
}

const COLORADO = 'Colorado Bill';
const JIM = 'Limonádový Jim';

// Colorado (0) vystřelí kartou BANG! na hráče 1 a sejme kartu dané barvy.
function coloradoShot(g, suit, value = '7', target = 1) {
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, target, i);
    assert.equal(g.phase, 'CHECK_DRAW');
    topDeck(g, suit, value);
    g.triggerCheckDraw();
    assert.equal(g.phase, 'CHECKING');
    g.resolveCheck();
}

test('F2: obě postavy jdou do ostré hry', () => {
    assert.ok(VOS_READY.includes(COLORADO));
    assert.ok(VOS_READY.includes(JIM));
});

// ── Colorado Bill ────────────────────────────────────────────────────────────

test('Colorado: karta BANG! = sejmutí ještě před obranou, čeká se na Colorada', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(g.pendingCheckDraw.reason, 'COLORADO');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'CHECK_DRAW' });
    const d = describePendingCheck(g, 0);
    assert.equal(d.kind, 'COLORADO');
    assert.equal(d.forMe, true);
    assert.match(d.detail, /P1/);
    assert.deepEqual(decideBotAction(g, 0, {}), { event: 'trigger_check_draw' });
    assert.equal(g.players[0].bangsPlayedThisTurn, 1, 'karta BANG! se do limitu počítá hned');
});

test('Colorado: ♠ = BANG! nejde zrušit – Vedle! server odmítne, klient ho nenabídne', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    const m = give(g, 1, CardType.MISSED);
    coloradoShot(g, Suits.SPADES);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.vos.unavoidable, true);
    assert.equal(V.vosUnavoidable(g), true);

    const t = g.players[1];
    assert.equal(cardPlayability(g, t, 1, t.hand[m]), false);
    assert.equal(describePendingResponse(g, 1).unavoidable, true);
    assert.match(waitingStatus(g).text, /nejde zrušit/);

    g.handleResponse(1, m);
    assert.equal(g.phase, 'RESPOND', 'Vedle! neprošlo');
    assert.equal(t.hand.length, 1, 'karta zůstala v ruce');

    // Bot to ví taky – rovnou schytá zásah, nezkouší Vedle! dokola.
    assert.deepEqual(decideBotAction(g, 1, {}),
        { event: 'respond_to_card', payload: { playerIdx: 1, cardIndex: null } });
    g.handleResponse(1, null);
    assert.equal(t.health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Colorado: jiná barva než ♠ = obyčejný BANG!, Vedle! funguje', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    const m = give(g, 1, CardType.MISSED);
    coloradoShot(g, Suits.HEARTS);
    assert.equal(g.phase, 'RESPOND');
    assert.ok(!g.pendingResponse.vos.unavoidable);
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[m]), true);
    g.handleResponse(1, m);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
});

test('Colorado: ♠ vypíná Barel i Jourdonnaise – rovnou RESPOND', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    board(g, 1, CardType.BARREL);
    coloradoShot(g, Suits.SPADES);
    assert.equal(g.phase, 'RESPOND', 'na Barel se nesnímá');

    const h = mkV([{ character: COLORADO }, { character: 'Jourdonnais' }]);
    coloradoShot(h, Suits.SPADES);
    assert.equal(h.phase, 'RESPOND');

    // Bez piků se na Barel snímá jako vždycky.
    const k = mkV([{ character: COLORADO }, {}]);
    board(k, 1, CardType.BARREL);
    coloradoShot(k, Suits.DIAMONDS);
    assert.equal(k.phase, 'BARREL_DRAW');
});

test('Colorado: ♠ nepustí ani zelenou Vedle!-kartu ze stolu', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    const plate = board(g, 1, CardType.MISSED, { name: 'Železný plát' });
    plate.green = true; plate.activate = 'miss'; plate._playedTurn = 0;
    coloradoShot(g, Suits.SPADES);
    g.handleResponse(1, null, plate.id);
    assert.equal(g.phase, 'RESPOND');
    assert.ok(g.players[1].board.includes(plate));
});

test('Colorado: ♠ – Pivo na posledním životě BANG! neruší, jen vrací život, takže jde', () => {
    const g = mkV([{ character: COLORADO }, { health: 1 }, {}]);
    const b = give(g, 1, CardType.BEER);
    coloradoShot(g, Suits.SPADES);
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[b]), true);
    assert.equal(g.beerLastLifeSave(1, b), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Colorado: Požehnání = nikdy, Prokletí = vždy (barva přes _effSuit)', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    g.activeEvent = { key: 'POZEHNANI' };
    coloradoShot(g, Suits.SPADES);
    assert.ok(!g.pendingResponse.vos.unavoidable);

    const h = mkV([{ character: COLORADO }, {}]);
    h.activeEvent = { key: 'PROKLETI' };
    coloradoShot(h, Suits.HEARTS);
    assert.equal(h.pendingResponse.vos.unavoidable, true);
});

test('Colorado: bang-efekty a Kulomet nejsou karta BANG! – nesnímá se', () => {
    const g = mkV([{ character: COLORADO }, {}, {}]);
    const t = giveV(g, 0, 'Tomahawk');
    g.playBang(0, 1, t);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);

    give(g, 0, CardType.GATLING);
    g.playSpecialCard(0, null, g.players[0].hand.length - 1);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.sourceCard, CardType.GATLING);
});

test('Colorado: Lemat dělá z libovolné karty kartu BANG! → sejmutí', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    const lemat = vcard('Lemat');
    g.players[0].weapon = lemat;
    const i = give(g, 0, CardType.STORE);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(g.pendingCheckDraw.reason, 'COLORADO');
});

test('Colorado: kárový BANG! na Apache Kida se nesnímá (nemá co rušit)', () => {
    const g = mkV([{ character: COLORADO }, { character: 'Apache Kid' }]);
    const i = give(g, 0, CardType.BANG, { suit: Suits.DIAMONDS });
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'PLAY');
});

test('Colorado: bez zapnutého rozšíření nic', () => {
    const g = mkGame([{ character: COLORADO }, {}]);
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'RESPOND');
});

test('Colorado: Odměna i Brokovnice se po pikovém sejmutí vezou dál', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    g.players[0].weapon = vcard('Brokovnice');
    g.players[1].board.push(vcard('Odměna'));
    give(g, 1, CardType.MISSED);
    coloradoShot(g, Suits.SPADES);
    assert.deepEqual(g.pendingResponse.vos, { bangCard: true, shotgun: true, unavoidable: true });
    g.handleResponse(1, null);
    assert.equal(g.phase, 'SHOTGUN_DISCARD');
});

test('Colorado: Podkova = výběr ze dvou karet, vybraný pik platí', () => {
    const g = mkV([{ character: COLORADO }, {}]);
    g._goldRush = true;
    g.players[0].gear = [{ id: 6000, effect: 'ZH_PODKOVA', name: 'Podkova' }];
    const i = give(g, 0, CardType.BANG);
    g.playBang(0, 1, i);
    topDeck(g, Suits.SPADES, '3');
    topDeck(g, Suits.HEARTS, '3');
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    const sp = g.luckyDukeState.cards.findIndex(c => c.suit === Suits.SPADES);
    g.luckyDukePick(sp);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.vos.unavoidable, true);
});

test('Colorado: poručený Zuřivou Doroty sejme sám a sedadlo se vrátí', () => {
    const g = mkV([{}, { character: COLORADO }, {}]);
    const i = give(g, 1, CardType.BANG);
    g._dorothyPlay(0, 1, g.players[1].hand[i].id, 2);
    assert.equal(g.currentPlayerIndex, 0, 'sedadlo zpátky u poroučejícího');
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'CHECK_DRAW' });
    topDeck(g, Suits.SPADES, '5');
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.originatorIdx, 1);
    assert.equal(g.pendingResponse.targetIdx, 2);
    assert.equal(g.pendingResponse.vos.unavoidable, true);
});

// ── Limonádový Jim ───────────────────────────────────────────────────────────

test('Jim: cizí Pivo → nabídka; odhozená karta = +1 život', () => {
    const g = mkV([{}, { character: JIM, health: 2 }, {}, {}]);
    g.players[0].health = 3;
    const keep = give(g, 1, CardType.BANG);
    const toss = give(g, 1, CardType.JAIL);
    const b = give(g, 0, CardType.BEER);
    g.playCard(b);
    assert.equal(g.players[0].health, 4);
    assert.equal(g.phase, 'LEMONADE_OFFER');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'LEMONADE_OFFER' });
    assert.match(waitingStatus(g).text, /Limonádový Jim/);
    assert.equal(g.pendingLemonade.beerByIdx, 0);

    const jim = g.players[1];
    const res = g.lemonadeChoice(1, jim.hand[toss].id);
    assert.ok(res && res.card);
    assert.equal(jim.health, 3);
    assert.equal(jim.hand.length, 1);
    assert.equal(jim.hand[0].type, CardType.BANG);
    assert.equal(g.deck.discardTop().type, CardType.JAIL);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingLemonade, null);
    void keep;
});

test('Jim: nabídku jde odmítnout – nic se nemění', () => {
    const g = mkV([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    give(g, 1, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    assert.equal(g.phase, 'LEMONADE_OFFER');
    assert.deepEqual(g.lemonadeChoice(1, null), { declined: true });
    assert.equal(g.players[1].health, 2);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Jim: za vlastní Pivo ne (upřesnění Albi)', () => {
    const g = mkV([{ character: JIM, health: 2 }, {}, {}]);
    give(g, 0, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    assert.equal(g.players[0].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Jim: s plnými životy nebo bez karet se nic nenabízí', () => {
    const g = mkV([{ health: 3 }, { character: JIM }, {}]);
    give(g, 1, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    assert.equal(g.phase, 'PLAY', 'plné životy');

    const h = mkV([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    h.playCard(give(h, 0, CardType.BEER));
    assert.equal(h.phase, 'PLAY', 'prázdná ruka');
});

test('Jim: Salón ani Poslední pivo kartou Pivo nejsou', () => {
    const g = mkV([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    give(g, 1, CardType.BANG);
    g.playCard(give(g, 0, CardType.SALOON));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 3, 'Salón léčil i Jima');

    const h = mkV([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    give(h, 1, CardType.BANG);
    h.playCard(giveV(h, 0, 'Poslední pivo'));
    assert.equal(h.players[0].health, 4);
    assert.equal(h.phase, 'PLAY');
});

test('Jim: Pivo jako záchrana posledního života v RESPOND – nabídka až po obraně', () => {
    const g = mkV([{}, { health: 1 }, { character: JIM, health: 2 }]);
    give(g, 2, CardType.MISSED);
    g.playBang(0, 1, give(g, 0, CardType.BANG));
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.beerLastLifeSave(1, give(g, 1, CardType.BEER)), true);
    assert.equal(g.phase, 'LEMONADE_OFFER');
    assert.equal(g.pendingLemonade.playerIdx, 2);
    g.lemonadeChoice(2, g.players[2].hand[0].id);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0);
});

test('Jim: Pivo při klikaném zásahu dynamitu – nabídka přeruší a vrátí se zpátky', () => {
    const g = mkV([{ health: 1 }, { character: JIM, health: 2 }, {}]);
    give(g, 1, CardType.BANG);
    g.pendingDynamiteDamage = { playerIdx: 0, hitsLeft: 2 };
    g.phase = 'DYNAMITE_DAMAGE';
    assert.equal(g.beerLastLifeSave(0, give(g, 0, CardType.BEER)), true);
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 1);
    g._processSpecialQueue();
    assert.equal(g.phase, 'LEMONADE_OFFER');
    g.lemonadeChoice(1, null);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE', 'zásah dynamitu pokračuje');
});

test('Jim: Madam Yto líže dřív, nabídka Jima přijde po ní', () => {
    const g = mkV([{ health: 3 }, { character: 'Madam Yto' }, { character: JIM, health: 2 }]);
    g._goldRush = true;
    give(g, 2, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    assert.equal(g.phase, 'YTO_DRAW');
    g.madamYtoDraw(1);
    assert.equal(g.phase, 'LEMONADE_OFFER');
});

test('Jim: odejde-li mezitím ze hry, nabídka propadne', () => {
    const g = mkV([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    give(g, 1, CardType.BANG);
    g._lemonadeOnBeer(0);
    assert.equal(g.specialActionQueue.length, 1);
    g.players[1].health = 0;
    g._processSpecialQueue();
    assert.equal(g.specialActionQueue.length, 0);
    assert.equal(g.phase, 'PLAY');
});

test('Jim: neplatný klik (cizí karta, cizí hráč) nic nedělá', () => {
    const g = mkV([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    give(g, 1, CardType.BANG);
    const other = give(g, 2, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    assert.equal(g.lemonadeChoice(1, g.players[2].hand[other].id), null);
    assert.equal(g.lemonadeChoice(2, null), null);
    assert.equal(g.phase, 'LEMONADE_OFFER');
});

test('Jim: odhoz poslední karty probudí Suzy Lafayette (Greygory s oběma schopnostmi)', () => {
    const g = mkV([{ health: 3 }, { character: 'Greygory Deck', health: 2 }, {}]);
    g.players[1]._greygoryChars = [JIM, 'Suzy Lafayette'];
    give(g, 1, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    assert.equal(g.phase, 'LEMONADE_OFFER');
    g.lemonadeChoice(1, g.players[1].hand[0].id);
    assert.equal(g.phase, 'SUZY_DRAW');
});

test('Jim: bez zapnutého rozšíření nic', () => {
    const g = mkGame([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    give(g, 1, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    assert.equal(g.phase, 'PLAY');
});

test('Jim – klient: v LEMONADE_OFFER je klikatelná jeho ruka a klik odhazuje', () => {
    const g = mkV([{ health: 3 }, { character: JIM, health: 2 }, {}]);
    give(g, 1, CardType.BANG);
    give(g, 2, CardType.BANG);
    g.playCard(give(g, 0, CardType.BEER));
    const jim = g.players[1];
    assert.equal(cardPlayability(g, jim, 1, jim.hand[0]), true);
    assert.equal(cardPlayability(g, g.players[2], 2, g.players[2].hand[0]), null);
    const click = (playable) => decideCardClick({ state: g, me: jim, myIndex: 1,
        selectedState: { cardIndex: null }, card: jim.hand[0], index: 0, blockInput: false,
        isMySidActive: false, playable });
    assert.deepEqual(click(true), { type: 'VOS_LEMONADE', index: 0, cardId: jim.hand[0].id });
    assert.deepEqual(click(false), { type: 'UNPLAYABLE_FLASH' });
});

test('Jim – bot: levnou kartu vymění za život, cennou si nechá, v nouzi dá cokoli kromě Piva', () => {
    const mk = (health, type) => {
        const g = mkV([{ health: 3 }, { character: JIM, health }, {}]);
        give(g, 1, type);
        g.playCard(give(g, 0, CardType.BEER));
        assert.equal(g.phase, 'LEMONADE_OFFER');
        return g;
    };
    let g = mk(3, CardType.JAIL);
    assert.deepEqual(decideBotAction(g, 1, {}),
        { event: 'vos_lemonade', payload: { cardId: g.players[1].hand[0].id, playerIdx: 1 } });
    g = mk(3, CardType.BANG);
    assert.deepEqual(decideBotAction(g, 1, {}),
        { event: 'vos_lemonade', payload: { cardId: null, playerIdx: 1 } });
    g = mk(2, CardType.BANG);
    assert.equal(decideBotAction(g, 1, {}).payload.cardId, g.players[1].hand[0].id);
    g = mk(1, CardType.BEER);
    assert.equal(decideBotAction(g, 1, {}).payload.cardId, null, 'Pivo se nevyhazuje');
});
