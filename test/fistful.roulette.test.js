// Rozšíření A Fistful of Cards – fáze 7: Ruská ruleta a Vendeta.
//   Ruská ruleta – při příchodu karty do hry každý od šerifa odhodí kartu Vedle!;
//                  první, kdo nemůže, ztrácí 2 životy a efekt končí,
//   Vendeta      – na konci svého tahu hráč sejme kartu: při ♥ hraje ještě jednou.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { pendingActor, waitingStatus, describePendingCheck } = require('../core/pending.js');
const { cardPlayability, rouletteHasCard } = require('../core/playability.js');
const { decideCardClick } = require('../core/selection.js');
const { decideBotAction } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));
const ff = key => ffData.find(c => c.key === key);
const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));
const hn = key => hnData.find(c => c.key === key);

// Hra s právě platnou kartou Fistfulu (přípravu balíčku řeší fistful.test.js).
function mkEv(specs, key, opts = {}) {
    const g = mkGame(specs, opts);
    if (key) g.activeFistful = ff(key);
    return g;
}

// Start tahu přesně jako nextTurn: nejdřív události, pak kontroly Dynamit/Vězení.
function startTurn(g) {
    if (g._beginTurn()) return;
    g.handleStartOfTurnChecks();
}

// Ruská ruleta se spouští PŘI PŘÍCHODU karty do hry, takže se kromě `activeFistful`
// musí nastavit i `_ffEntering` – to jinak dělá _flipFistfulEvent.
function enterFf(g, key) {
    g.activeFistful = ff(key);
    g._ffEntering = key;
    startTurn(g);
}

const missIdx = (g, i) => give(g, i, CardType.MISSED, { name: 'Vedle!' });

// ── Ruská ruleta: kolečko ────────────────────────────────────────────────────

test('Ruská ruleta: kolečko začíná u šerifa a jede po směru', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    g.players.forEach((p, i) => missIdx(g, i));
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(g.phase, 'ROULETTE_DISCARD');
    assert.equal(g.pendingRoulette.playerIdx, 0);
    assert.deepEqual(g.pendingRoulette.order, [0, 1, 2]);
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'ROULETTE_DISCARD' });

    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.pendingRoulette.playerIdx, 1);
    g.rouletteDiscard(1, { cardId: g.players[1].hand[0].id });
    assert.equal(g.pendingRoulette.playerIdx, 2);
});

test('Ruská ruleta: kolečko se opakuje, dokud někdo nemá čím', () => {
    // P0 má dvě Vedle!, P1 jedno → v druhém kole P1 selže.
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    missIdx(g, 0); missIdx(g, 0); missIdx(g, 1);
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    g.rouletteDiscard(1, { cardId: g.players[1].hand[0].id });
    assert.equal(g.pendingRoulette.playerIdx, 0);
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingRoulette, null);
    assert.deepEqual(g.pendingDynamiteDamage,
        { playerIdx: 1, hitsLeft: 2, source: 'ROULETTE', resume: 'BEGIN_TURN' });
});

test('Ruská ruleta: kdo nemá hned na začátku, schytá 2 zásahy a efekt končí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.playerIdx, 0);
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'DYNAMITE_DAMAGE' });
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 3);
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 2);
    // Zásahy dobrané → start tahu pokračuje (kontroly a fáze lízání), NE posun tahu.
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.phase, 'DRAW');
});

test('Ruská ruleta: zásahy mimo hráče na tahu jeho tah nezruší', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    missIdx(g, 0);
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.pendingDynamiteDamage.playerIdx, 1);
    g.takeDynamiteHit(1); g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.phase, 'DRAW');
});

test('Ruská ruleta: smrt jiného hráče tah hráče na tahu nepřeruší', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw', health: 2 }, { role: 'Outlaw' }], null);
    missIdx(g, 0); missIdx(g, 2);
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.pendingDynamiteDamage.playerIdx, 1);
    g.takeDynamiteHit(1); g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.currentPlayerIndex, 0, 'hráč na tahu o tah nepřišel');
    assert.equal(g.phase, 'DRAW');
});

test('Ruská ruleta: ducha (Město duchů) se netýká', () => {
    const g = mkEv([{ role: 'Sheriff' }, { health: 0 }], null);
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[1]._ghost = true;
    missIdx(g, 0);
    enterFf(g, 'RUSKA_RULETA');
    assert.deepEqual(g.pendingRoulette.order, [0]);
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    // Kolečko se vrátí zase k P0 – ten už nemá čím, duch se vůbec nepočítá.
    assert.equal(g.pendingDynamiteDamage.playerIdx, 0);
});

// ── Ruská ruleta: co se počítá za kartu Vedle! ───────────────────────────────

// Vlastní efekt karty (Úhyb, Bible) se neaktivuje – karta se odhazuje, nehraje.
// Schopnosti postav vázané na odhoz z ruky (Suzy, Molly) naopak platí, viz níž.
test('Ruská ruleta: Úhyb platí, ale líznutí za něj se nespustí (odhazuje se, nehraje)', () => {
    const g = mkEv([{ role: 'Sheriff' }], null);
    const c = mkCard(CardType.UHYB, { name: 'Úhyb' });
    c.draw = 1;
    g.players[0].hand.push(c);
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(g.phase, 'ROULETTE_DISCARD');
    g.rouletteDiscard(0, { cardId: c.id });
    assert.equal(g.specialActionQueue.filter(a => a.type === 'UHYB_DRAW').length, 0);
});

test('Ruská ruleta: Calamity Janet smí odhodit Bang!, ostatní ne', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Calamity Janet' }, {}], null);
    const bangJ = mkCard(CardType.BANG); g.players[0].hand.push(bangJ);
    const bang1 = mkCard(CardType.BANG); g.players[1].hand.push(bang1);
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(g.pendingRoulette.playerIdx, 0);
    g.rouletteDiscard(0, { cardId: bangJ.id });
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.playerIdx, 1);
});

test('Ruská ruleta: Elena Fuente odhodí libovolnou kartu', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Elena Fuente' }], null);
    const beer = mkCard(CardType.BEER); g.players[0].hand.push(beer);
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(g.phase, 'ROULETTE_DISCARD');
    assert.ok(g.rouletteDiscard(0, { cardId: beer.id }));
    assert.equal(g.players[0].hand.length, 0);
});

test('Ruská ruleta: zelená Vedle!-karta ze stolu platí, pod Lasem ne', () => {
    const mk = (laso) => {
        const g = mkEv([{ role: 'Sheriff' }], null);
        const gc = board(g, 0, CardType.EQUIPMENT, { name: 'Železný plát' });
        gc.green = true; gc.activate = 'miss';
        if (laso) g.activeEvent = { key: 'LASO', name: 'Laso' };
        enterFf(g, 'RUSKA_RULETA');
        return { g, gc };
    };
    const a = mk(false);
    assert.equal(a.g.phase, 'ROULETTE_DISCARD');
    const res = a.g.rouletteDiscard(0, { cardId: a.gc.id, fromBoard: true });
    assert.ok(res && res.fromBoard);
    assert.equal(a.g.players[0].board.length, 0);

    const b = mk(true);
    assert.equal(b.g.phase, 'DYNAMITE_DAMAGE', 'pod Lasem karta na stole nic neumí');
});

test('Ruská ruleta: neplatný klik výběr neposune', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    missIdx(g, 0); missIdx(g, 1);
    const beer = mkCard(CardType.BEER); g.players[0].hand.push(beer);
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(g.rouletteDiscard(0, { cardId: beer.id }), null);
    assert.equal(g.pendingRoulette.playerIdx, 0);
    assert.equal(g.rouletteDiscard(1, { cardId: g.players[1].hand[0].id }), null,
        'nehraje se za cizí místo');
    assert.equal(g.pendingRoulette.playerIdx, 0);
});

test('Ruská ruleta: Suzy Lafayette si lízne HNED, ještě než se kolečko posune', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Suzy Lafayette' }, {}], null);
    missIdx(g, 0); missIdx(g, 1); missIdx(g, 1);
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    // Prázdná ruka → líznutí se odbaví okamžitě, teprve pak jde na řadu další hráč.
    assert.equal(g.phase, 'SUZY_DRAW');
    assert.equal(g.pendingRoulette.playerIdx, 0, 'kolečko se zatím neposunulo');
    g.deck.cards.push(mkCard(CardType.MISSED, { name: 'Vedle!' }));
    g.suzyLafayetteDraw(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'ROULETTE_DISCARD');
    assert.equal(g.pendingRoulette.playerIdx, 1, 'až po líznutí jde na řadu další');
    // Druhé kolo: Suzy má díky schopnosti zase čím odhodit.
    g.rouletteDiscard(1, { cardId: g.players[1].hand[0].id });
    assert.equal(g.pendingRoulette.playerIdx, 0);
    assert.equal(g.phase, 'ROULETTE_DISCARD');
});

test('Ruská ruleta: Molly Stark si za odhozenou kartu lízne (mimo svůj tah)', () => {
    const g = mkEv([{ role: 'Sheriff' }, { character: 'Molly Stark' }], null);
    missIdx(g, 0); missIdx(g, 0); missIdx(g, 1);
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.pendingRoulette.playerIdx, 1);
    g.rouletteDiscard(1, { cardId: g.players[1].hand[0].id });
    // Náhrada za odhozenou kartu je klikací líznutí; kolečko čeká.
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isKillReward, true);
    assert.equal(g.drawPhaseState.playerIdx, 1);
    assert.equal(g.pendingRoulette.playerIdx, 1, 'kolečko se zatím neposunulo');
    g.drawCard('deck');
    assert.equal(g.players[1].hand.length, 1, 'ruka se Molly nezmenšila');
    assert.equal(g.phase, 'ROULETTE_DISCARD');
    assert.equal(g.pendingRoulette.playerIdx, 0);
});

test('Ruská ruleta: Molly ve VLASTNÍM tahu si nelíže a zelená karta ze stolu se jí nepočítá', () => {
    // Molly je šerif → kolečko běží v jejím tahu, schopnost tedy neplatí.
    const g = mkEv([{ role: 'Sheriff', character: 'Molly Stark' }, {}], null);
    missIdx(g, 0);
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.specialActionQueue.length, 0);
    assert.equal(g.players[0].hand.length, 0);

    // Zelená Vedle!-karta je ze STOLU, ne z ruky – Molly za ni nelíže.
    const h = mkEv([{ role: 'Sheriff' }, { character: 'Molly Stark' }], null);
    missIdx(h, 0);
    const gc = board(h, 1, CardType.EQUIPMENT, { name: 'Železný plát' });
    gc.green = true; gc.activate = 'miss';
    enterFf(h, 'RUSKA_RULETA');
    h.rouletteDiscard(0, { cardId: h.players[0].hand[0].id });
    h.rouletteDiscard(1, { cardId: gc.id, fromBoard: true });
    assert.equal(h.specialActionQueue.length, 0);
});

test('Ruská ruleta: Bart Cassidy si za zásahy lízne, start tahu počká', () => {
    const g = mkEv([{ role: 'Sheriff' }, { character: 'Bart Cassidy' }], null);
    missIdx(g, 0);
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    g.takeDynamiteHit(1);
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(1);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    g.takeDynamiteHit(1);
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(1);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.currentPlayerIndex, 0);
});

test('Ruská ruleta: Pivo na posledním životě zásah zruší', () => {
    const g = mkEv([{ role: 'Sheriff' }, { health: 1 }, {}], null);
    missIdx(g, 0); missIdx(g, 2);
    g.players[1].hand.push(mkCard(CardType.BEER));
    enterFf(g, 'RUSKA_RULETA');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.pendingDynamiteDamage.playerIdx, 1);
    assert.equal(g.beerLastLifeSave(1, 0), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 1, 'Pivo zrušilo jeden zásah, druhý zbývá');
});

// ── Ruská ruleta: zrcadla (klient / bot) ─────────────────────────────────────

test('Ruská ruleta: cardPlayability svítí jen kartám s efektem Vedle!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    missIdx(g, 0);
    const beer = mkCard(CardType.BEER); g.players[0].hand.push(beer);
    enterFf(g, 'RUSKA_RULETA');
    const me = g.players[0];
    assert.equal(cardPlayability(g, me, 0, me.hand[0]), true);
    assert.equal(cardPlayability(g, me, 0, beer), false);
    // Kdo není na řadě, nemá klikat nic.
    assert.equal(cardPlayability(g, g.players[1], 1, mkCard(CardType.MISSED)), null);
});

test('Ruská ruleta: decideCardClick vrací ROULETTE_DISCARD', () => {
    const g = mkEv([{ role: 'Sheriff' }], null);
    missIdx(g, 0);
    enterFf(g, 'RUSKA_RULETA');
    const me = g.players[0], card = me.hand[0];
    const intent = decideCardClick({ state: g, me, myIndex: 0, selectedState: { cardIndex: null },
        card, index: 0, blockInput: false, isMySidActive: false, playable: true });
    assert.deepEqual(intent, { type: 'ROULETTE_DISCARD', index: 0, cardId: card.id });
});

test('Ruská ruleta: waitingStatus má vlastní štítek', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    missIdx(g, 0);
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(waitingStatus(g).text, 'Ruská ruleta – odhazuje Vedle!');
});

test('Ruská ruleta: bot odhodí nejhorší kartu z ruky, zelenou ze stolu až nakonec', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    const gc = board(g, 0, CardType.EQUIPMENT, { name: 'Železný plát' });
    gc.green = true; gc.activate = 'miss';
    missIdx(g, 0);
    enterFf(g, 'RUSKA_RULETA');
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'roulette_discard');
    assert.equal(a.payload.fromBoard, false);
    // Bez karty v ruce sáhne na zelenou ze stolu.
    g.players[0].hand = [];
    const b = decideBotAction(g, 0);
    assert.deepEqual(b, { event: 'roulette_discard', payload: { cardId: gc.id, fromBoard: true } });
});

test('rouletteHasCard: prázdná ruka i jen nehodící se karty = nemá', () => {
    const g = mkEv([{ role: 'Sheriff' }], null);
    assert.equal(rouletteHasCard(g, g.players[0]), false);
    g.players[0].hand.push(mkCard(CardType.BEER));
    assert.equal(rouletteHasCard(g, g.players[0]), false);
    g.players[0].hand.push(mkCard(CardType.MISSED));
    assert.equal(rouletteHasCard(g, g.players[0]), true);
});

// ── Ruská ruleta: Barel a Jourdonnais (FAQ Q13) ──────────────────────────────
// „Můžu použít Barel, Bibli apod. nebo schopnosti postav (Jourdonnaisovu), abych se
// vyhnul efektu Ruské rulety?" – Ano. Sejmutí se zkouší PŘED odhozem: při ♥ hráč projde
// zadarmo, jinak kartu odhodit musí (nebo schytá 2 zásahy).

test('Ruská ruleta: Barel se snímá dřív než odhoz a při ♥ hráč projde zadarmo', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    const missCard = g.players[0].hand[missIdx(g, 0)];
    missIdx(g, 1); missIdx(g, 2);
    topDeck(g, Suits.HEARTS);
    enterFf(g, 'RUSKA_RULETA');

    assert.equal(g.phase, 'BARREL_DRAW');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'BARREL_DRAW' });
    assert.equal(g.pendingBarrelCheck.roulette, true);
    g.triggerBarrelDraw();
    g.resolveCheck();

    assert.equal(g.phase, 'ROULETTE_DISCARD', 'kolečko jde na dalšího hráče');
    assert.equal(g.pendingRoulette.playerIdx, 1);
    assert.ok(g.players[0].hand.includes(missCard), 'šerif nic neodhodil');
});

test('Ruská ruleta: neúspěšný Barel hráče pošle zpátky k odhozu', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    missIdx(g, 0); missIdx(g, 1); missIdx(g, 2);
    topDeck(g, Suits.SPADES);
    enterFf(g, 'RUSKA_RULETA');
    g.triggerBarrelDraw();
    g.resolveCheck();

    assert.equal(g.phase, 'ROULETTE_DISCARD');
    assert.equal(g.pendingRoulette.playerIdx, 0, 'pořád je na řadě šerif');
    g.rouletteDiscard(0, { cardId: g.players[0].hand[0].id });
    assert.equal(g.pendingRoulette.playerIdx, 1);
});

test('Ruská ruleta: neúspěšný Barel bez karty Vedle! = 2 zásahy', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    topDeck(g, Suits.CLUBS);
    enterFf(g, 'RUSKA_RULETA');
    g.triggerBarrelDraw();
    g.resolveCheck();

    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.deepEqual(g.pendingDynamiteDamage,
        { playerIdx: 0, hitsLeft: 2, source: 'ROULETTE', resume: 'BEGIN_TURN' });
});

// Bug 62: Požehnání (High Noon) dělá ze všech karet srdcová, takže KAŽDÉ sejmutí na
// Barel projde. Mají-li Barel všichni, neselže nikdy nikdo a kolečko by se točilo
// donekonečna – pod Požehnáním proto efekt skončí, jakmile zadarmo projde celé kolo.
test('Ruská ruleta + Požehnání: barel u všech kolečko ukončí bez zásahu', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    g.activeEvent = hn('POZEHNANI');
    g.players.forEach((p, i) => { board(g, i, CardType.BARREL, { name: 'Barel' }); missIdx(g, i); });
    topDeck(g, Suits.SPADES);   // Požehnání barvu stejně přebije na ♥
    enterFf(g, 'RUSKA_RULETA');

    for (let k = 0; k < 3; k++) {
        assert.equal(g.phase, 'BARREL_DRAW', 'sejmutí hráče ' + k);
        g.triggerBarrelDraw();
        g.resolveCheck();
    }
    assert.equal(g.pendingRoulette, null, 'kolečko se po celém kole zadarmo zavřelo');
    assert.notEqual(g.phase, 'BARREL_DRAW');
    assert.notEqual(g.phase, 'ROULETTE_DISCARD');
    const hp = g.players.map(p => p.health);
    assert.deepEqual(hp, [hp[0], hp[0], hp[0]], 'nikdo nepřišel o život');
    assert.ok(g.players.every(p => p.hand.length === 1), 'nikdo nic neodhodil');
});

test('Ruská ruleta + Požehnání: odhoz počítadlo shodí, kolečko doběhne normálně', () => {
    // P0 má Barel (projde zadarmo), P1 ne a odhazuje – jakmile mu Vedle! dojde, schytá 2.
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    g.activeEvent = hn('POZEHNANI');
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    missIdx(g, 1);
    topDeck(g, Suits.SPADES);
    enterFf(g, 'RUSKA_RULETA');

    g.triggerBarrelDraw(); g.resolveCheck();          // P0 zadarmo
    assert.equal(g.pendingRoulette.playerIdx, 1);
    g.rouletteDiscard(1, { cardId: g.players[1].hand[0].id });
    assert.equal(g.pendingRoulette.freePass, 0, 'odhoz počítadlo vynuloval');

    g.triggerBarrelDraw(); g.resolveCheck();          // P0 zase zadarmo
    assert.equal(g.phase, 'DYNAMITE_DAMAGE', 'P1 už nemá čím');
    assert.equal(g.pendingDynamiteDamage.playerIdx, 1);
});

test('Ruská ruleta bez Požehnání: barel u všech kolečko neukončí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    g.players.forEach((p, i) => { board(g, i, CardType.BARREL, { name: 'Barel' }); missIdx(g, i); });
    topDeck(g, Suits.HEARTS); topDeck(g, Suits.HEARTS); topDeck(g, Suits.HEARTS);
    enterFf(g, 'RUSKA_RULETA');
    for (let k = 0; k < 3; k++) { g.triggerBarrelDraw(); g.resolveCheck(); }
    assert.ok(g.pendingRoulette, 'kolečko běží dál – náhoda se dřív nebo později otočí');
    assert.equal(g.phase, 'BARREL_DRAW');
});

test('Ruská ruleta: Jourdonnais snímá i bez Barelu', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Jourdonnais' }, {}, {}], null);
    missIdx(g, 1); missIdx(g, 2);
    topDeck(g, Suits.HEARTS);
    enterFf(g, 'RUSKA_RULETA');

    assert.equal(g.phase, 'BARREL_DRAW');
    assert.equal(g.pendingBarrelCheck.reason, 'JOURDONNAIS');
    assert.equal(g.pendingBarrelCheck.checksLeft, 1);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.pendingRoulette.playerIdx, 1, 'prošel bez karty v ruce');
});

test('Ruská ruleta: Jourdonnais s Barelem má dvě sejmutí', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Jourdonnais' }, {}, {}], null);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    missIdx(g, 1); missIdx(g, 2);
    topDeck(g, Suits.HEARTS);
    topDeck(g, Suits.SPADES);   // první mine
    enterFf(g, 'RUSKA_RULETA');

    assert.equal(g.pendingBarrelCheck.checksLeft, 2);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'BARREL_DRAW', 'druhý pokus');
    assert.equal(g.pendingBarrelCheck.roulette, true);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.pendingRoulette.playerIdx, 1);
});

test('Ruská ruleta: Laso (Fistful) Barel vypne, Jourdonnaisova schopnost platí dál', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    missIdx(g, 0); missIdx(g, 1); missIdx(g, 2);
    g.activeEvent = ff('LASO');
    enterFf(g, 'RUSKA_RULETA');
    assert.equal(g.phase, 'ROULETTE_DISCARD', 'žádné sejmutí – barel na stole nic neumí');

    const h = mkEv([{ role: 'Sheriff', character: 'Jourdonnais' }, {}, {}], null);
    board(h, 0, CardType.BARREL, { name: 'Barel' });
    missIdx(h, 0); missIdx(h, 1); missIdx(h, 2);
    h.activeEvent = ff('LASO');
    enterFf(h, 'RUSKA_RULETA');
    assert.equal(h.phase, 'BARREL_DRAW');
    assert.equal(h.pendingBarrelCheck.checksLeft, 1, 'vrozená schopnost, karta ne');
});

test('Ruská ruleta: barelové sejmutí má vlastní popis (odhazuje se, nehraje)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    missIdx(g, 0); missIdx(g, 1); missIdx(g, 2);
    enterFf(g, 'RUSKA_RULETA');
    const d = describePendingCheck(g, 0);
    assert.equal(d.kind, 'BARREL');
    assert.match(d.detail, /Ruská ruleta/);
    assert.match(d.detail, /odhodit/);
});

test('Ruská ruleta: bot barelové sejmutí spustí (trigger_barrel_draw)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    missIdx(g, 0); missIdx(g, 1); missIdx(g, 2);
    enterFf(g, 'RUSKA_RULETA');
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0, {});
    assert.equal(act.event, 'trigger_barrel_draw');
});

// ── Vendeta ─────────────────────────────────────────────────────────────────

test('Vendeta: na konci tahu se sejme karta (CHECK_DRAW s reason)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    g.nextTurn();
    assert.equal(g.phase, 'CHECK_DRAW');
    assert.equal(g.pendingCheckDraw.reason, 'VENDETTA');
    assert.equal(g.pendingCheckDraw.playerIdx, 0);
    assert.equal(g.currentPlayerIndex, 0, 'tah se zatím neposunul');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'CHECK_DRAW' });
    const d = describePendingCheck(g, 0);
    assert.equal(d.kind, 'VENDETTA');
    assert.equal(d.short, 'Vendeta');
});

test('Vendeta: ♥ → týž hráč hraje ještě jeden tah (nové turnId)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    const t0 = g.turnId;
    g.nextTurn();
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    assert.equal(g.phase, 'CHECKING');
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 0);
    assert.ok(g.turnId > t0);
    assert.equal(g._extraTurn, true);
    assert.equal(g.phase, 'DRAW', 'tah navíc jede celý znovu, včetně fáze lízání');
});

test('Vendeta: zelená karta z první půlky tahu jde v tahu navíc aktivovat', () => {
    // Tah navíc má nové turnId, takže razítko `_playedTurn` z první půlky už neplatí
    // („nelze aktivovat ve stejném tahu, kdy byla položena").
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    g.turnId = 5;
    const i = give(g, 0, CardType.CANTEEN, { props: { green: true, activate: 'heal_self' } });
    g.playCard(i);
    const green = g.players[0].board[0];
    assert.equal(green._playedTurn, 5);

    g.nextTurn();
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 0, 'týž hráč hraje znovu');
    assert.notEqual(green._playedTurn, g.turnId, 'razítko je z minulého tahu');

    g.phase = 'PLAY';
    g.players[0].health = 1;
    g.activateGreenCard(0, green.id, null);
    assert.equal(g.players[0].health, 2, 'Čutora se aktivovala');
    assert.equal(g.players[0].board.length, 0);
});

test('Vendeta: jiná barva → tah se normálně posune', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    g.nextTurn();
    topDeck(g, Suits.SPADES);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g._vendettaDone, false, 'příznak se při přechodu na jiného hráče nuluje');
    assert.equal(g._extraTurn, false);
});

test('Vendeta: v jednom tahu jen jednou – tah navíc už nesnímá', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    g.nextTurn();
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 0);
    // Konec tahu navíc: žádné druhé sejmutí, tah jde dál.
    g.phase = 'PLAY';
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.notEqual(g.phase, 'CHECK_DRAW');
});

test('Vendeta: na tahu navíc se NEodkrývá nová událost (R6)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    g.eventDeck = [hn('PRAVE_POLEDNE'), hn('DOKTOR')];
    g.ffDeck = [ff('FISTFUL_OF_CARDS'), ff('LECKA')];
    g._sheriffTurns = 5;
    g.nextTurn();
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.eventDeck.length, 2, 'balíček High Noon zůstal netknutý');
    assert.equal(g.ffDeck.length, 2, 'balíček Fistfulu zůstal netknutý');
    assert.equal(g._sheriffTurns, 5, 'tah navíc se nepočítá jako kolo');
});

test('Vendeta: ukončení tahu smrtí sejmutí nespouští', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    g.players[0].health = 0;
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.notEqual(g.phase, 'CHECK_DRAW');
});

test('Vendeta: Požehnání dává tah navíc vždy, Prokletí nikdy', () => {
    const mk = (evKey, suit) => {
        const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
        g.activeEvent = hn(evKey);
        g.nextTurn();
        topDeck(g, suit);
        g.triggerCheckDraw();
        g.resolveCheck();
        return g;
    };
    assert.equal(mk('POZEHNANI', Suits.SPADES).currentPlayerIndex, 0, 'Požehnání → vždy ♥');
    assert.equal(mk('PROKLETI', Suits.HEARTS).currentPlayerIndex, 1, 'Prokletí → nikdy ♥');
});

test('Vendeta: Lucky Duke si vybírá ze dvou karet', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Lucky Duke' }, {}], 'VENDETA', { current: 0 });
    g.nextTurn();
    topDeck(g, Suits.SPADES);
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    assert.equal(g.phase, 'LUCKY_DUKE');
    assert.equal(g.luckyDukeState.checkContext.reason, 'VENDETTA');
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'lucky_duke_pick');
    g.luckyDukePick(a.payload);
    assert.equal(g.currentPlayerIndex, 0, 'bot si vybral srdce → tah navíc');
});

test('Vendeta: duch (Město duchů) dostane tah navíc a zůstane duchem (R10)', () => {
    const g = mkEv([{ role: 'Sheriff' }, { health: 0 }], 'VENDETA', { current: 1 });
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[1]._ghost = true;
    g.nextTurn();
    assert.equal(g.phase, 'CHECK_DRAW');
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1]._ghost, true, 'duch neodešel ze hry');
    assert.equal(g.drawPhaseState.cardsNeeded, 3, 'duch si zase líže 3 karty');
});

// Tah, který hráč kvůli Vězení přeskočil, přesto SKONČIL – sejmutí Vendety se tedy
// vyhodnotí a při ♥ si hráč tah navíc odehraje doopravdy (Vězení už je v odhozu).
test('Vendeta: i přeskočený tah (Vězení) se snímá', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'CHECK_DRAW');
    topDeck(g, Suits.SPADES);            // ♠ → z vězení se nedostane
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'CHECK_DRAW', 'na konci přeskočeného tahu se snímá na Vendetu');
    assert.equal(g.pendingCheckDraw.reason, 'VENDETTA');
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.phase, 'DRAW', 'tah navíc se odehraje – Vězení už leží v odhozu');
});

test('Vendeta: tah navíc zahodí vynucenou kartu Práva západu', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'VENDETA', { current: 0 });
    g.players[0]._lawCardId = 42;
    g.nextTurn();
    topDeck(g, Suits.HEARTS);
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0]._lawCardId, null, 'povinnost platí jen pro tah, ve kterém se lízla');
});

test('Vendeta: bez zapnuté události se nic neděje', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null, { current: 0 });
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.notEqual(g.phase, 'CHECK_DRAW');
});
