// Rozšíření A Fistful of Cards – fáze 4: události fáze lízání II (Peyote, Ranč).
// Peyote nahrazuje celé lízání hádáním barvy, Ranč za lízání připojuje výměnu karet.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, CardType, Suits } = require('./_helpers.js');
const { pendingActor } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { decideCardClick } = require('../core/selection.js');

before(() => { console.log = () => {}; });

const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));
const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));
const ff = key => ffData.find(c => c.key === key);
const hn = key => hnData.find(c => c.key === key);

// Hra s právě platnou kartou Fistfulu (přípravu balíčku řeší fistful.test.js).
function mkEv(specs, key, opts = {}) {
    const g = mkGame(specs, opts);
    if (key) g.activeFistful = ff(key);
    return g;
}

// Deterministický balíček: `cards[0]` se lízne první (draw() popuje z konce).
function stack(g, cards) {
    g.deck.cards = cards.slice().reverse();
    return cards;
}
const RED = (v = '5') => mkCard(CardType.BANG, { suit: Suits.HEARTS, value: v });
const BLACK = (v = '5') => mkCard(CardType.BANG, { suit: Suits.SPADES, value: v });

// ── Peyote ──────────────────────────────────────────────────────────────────

test('Peyote: místo fáze lízání se čeká na tip', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    stack(g, [RED(), BLACK()]);
    g.startDrawPhase();
    assert.equal(g.phase, 'PEYOTE');
    assert.equal(g.pendingPeyote.playerIdx, 0);
    assert.equal(g.drawPhaseState.active, false, 'balíček se neklikatí – hádá se tlačítky');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'PEYOTE' });
});

test('Peyote: uhodnutá barva → karta do ruky a hádá se dál', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    const [c1, c2] = stack(g, [RED(), BLACK()]);
    g.startDrawPhase();
    const r = g.peyoteGuess(0, true);
    assert.equal(r.hit, true);
    assert.equal(r.card.id, c1.id);
    assert.deepEqual(g.players[0].hand.map(c => c.id), [c1.id]);
    assert.equal(g.phase, 'PEYOTE', 'hádá se dál');
    assert.equal(g.deck.discardPile.length, 0);

    const r2 = g.peyoteGuess(0, false);
    assert.equal(r2.hit, true);
    assert.deepEqual(g.players[0].hand.map(c => c.id), [c1.id, c2.id]);
    assert.equal(g.phase, 'PEYOTE');
});

test('Peyote: netrefená barva → karta do odhozu a konec fáze lízání', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    const [c1] = stack(g, [BLACK(), RED()]);
    g.startDrawPhase();
    const r = g.peyoteGuess(0, true);
    assert.equal(r.hit, false);
    assert.equal(g.players[0].hand.length, 0);
    assert.deepEqual(g.deck.discardPile.map(c => c.id), [c1.id]);
    assert.equal(g.phase, 'PLAY');
    assert.ok(!g.pendingPeyote);
});

test('Peyote: hádá jen hráč, na kterého se čeká', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    stack(g, [RED(), RED()]);
    g.startDrawPhase();
    assert.equal(g.peyoteGuess(1, true), null);
    assert.equal(g.phase, 'PEYOTE');
    assert.equal(g.players[1].hand.length, 0);
});

test('Peyote: prázdný balíček i odhoz fázi jen ukončí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    g.deck.cards = [];
    g.deck.discardPile = [];
    g.startDrawPhase();
    assert.equal(g.peyoteGuess(0, true), null);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 0);
});

test('Peyote přebíjí Kita Carlsona, Clause, Jesseho i Pedra', () => {
    for (const ch of ['Kit Carlson', 'Claus the Saint', 'Jesse Jones', 'Pedro Ramirez', 'Pat Brennan']) {
        const g = mkEv([{ role: 'Sheriff', character: ch }, {}], 'PEYOTE');
        stack(g, [RED(), RED(), RED(), RED(), RED(), RED()]);
        g.deck.discardPile.push(mkCard(CardType.BEER));
        g.startDrawPhase();
        assert.equal(g.phase, 'PEYOTE', ch);
        assert.deepEqual(g.drawPhaseState.options, [], ch + ': žádný jiný zdroj lízání');
        assert.ok(!g.kitCarlsonState && !g.clausState, ch);
    }
});

test('Peyote přebíjí i Black Jacka (druhá karta se nezkoumá)', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Black Jack' }, {}], 'PEYOTE');
    stack(g, [RED(), RED(), RED()]);
    g.startDrawPhase();
    g.peyoteGuess(0, true);
    g.peyoteGuess(0, true);
    assert.equal(g.phase, 'PEYOTE', 'žádná fáze BLACK_JACK_CHECK');
    assert.equal(g.players[0].hand.length, 2);
});

test('Peyote: Požehnání ani Prokletí (High Noon) hádání neovlivní', () => {
    // Požehnání dělá ze VŠECH karet srdce. Peyote se ale ptá na VYTIŠTĚNOU barvu –
    // jinak by hráč hádal na jistotu a lízl si celý balíček.
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    g.activeEvent = hn('POZEHNANI');
    const [c1] = stack(g, [BLACK(), RED()]);
    assert.equal(g._effSuit(c1), Suits.HEARTS, 'pravidla jinak vidí srdce');
    g.startDrawPhase();
    assert.equal(g.peyoteGuess(0, true).hit, false, 'pika zůstává pikou');
    assert.equal(g.phase, 'PLAY');

    const h = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    h.activeEvent = hn('PROKLETI');
    stack(h, [RED(), RED()]);
    h.startDrawPhase();
    assert.equal(h.peyoteGuess(0, true).hit, true, 'srdce zůstává srdcem');
});

test('Peyote: Žízeň ani Příjezd vlaku počet tipů neomezují', () => {
    for (const key of ['ZIZEN', 'PRIJEZD_VLAKU']) {
        const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
        g.activeEvent = hn(key);
        stack(g, [RED(), RED(), RED(), RED()]);
        g.startDrawPhase();
        g.peyoteGuess(0, true);
        g.peyoteGuess(0, true);
        g.peyoteGuess(0, true);
        assert.equal(g.phase, 'PEYOTE', key);
        assert.equal(g.players[0].hand.length, 3, key);
    }
});

test('Peyote: duch (Město duchů) hádá taky', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[0].health = 0;
    g.players[0]._ghost = true;
    stack(g, [RED(), BLACK()]);
    g.startDrawPhase();
    assert.equal(g.phase, 'PEYOTE');
    assert.equal(g.peyoteGuess(0, true).hit, true);
    assert.equal(g.players[0].hand.length, 1);
});

test('Peyote: po netrefě navazují Želízka (High Noon)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    g.activeEvent = hn('ZELIZKA');
    stack(g, [BLACK(), RED()]);
    g.startDrawPhase();
    g.peyoteGuess(0, true);
    assert.equal(g.phase, 'HANDCUFFS_SUIT');
    assert.equal(g.pendingHandcuffs.playerIdx, 0);
});

test('bot: v Peyote vždy tipuje a volí barvu, které je vidět míň', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    stack(g, [RED(), RED()]);
    g.startDrawPhase();
    // V odhozu samá srdce → v balíčku zbývá víc černé.
    g.deck.discardPile = [RED(), RED(), RED()];
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'peyote_guess');
    assert.equal(a.payload.red, false);

    g.deck.discardPile = [BLACK(), BLACK(), BLACK()];
    assert.equal(decideBotAction(g, 0, null).payload.red, true);
});

test('bot: Peyote počítá vytištěnou barvu i pod Požehnáním', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PEYOTE');
    g.activeEvent = hn('POZEHNANI');
    stack(g, [RED(), RED()]);
    g.startDrawPhase();
    g.deck.discardPile = [RED(), RED(), RED()];
    // Kdyby bot četl _effSuit, viděl by samá srdce i v černých kartách a tipoval jinak.
    assert.equal(decideBotAction(g, 0, null).payload.red, false);
});

// ── Ranč ────────────────────────────────────────────────────────────────────

test('Ranč: po fázi lízání se čeká na výměnu', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    stack(g, [RED(), RED()]);
    give(g, 0, CardType.JAIL);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'DRAW');
    g.drawCard('deck');
    assert.equal(g.phase, 'RANCH');
    assert.equal(g.pendingRanch.playerIdx, 0);
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'RANCH' });
});

test('Ranč: vymění přesně označené karty a dolízne stejný počet', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    // Balíček dál než na výměnu, ať se při dolízní nespustí proaktivní zamíchání
    // (to by odhoz vysálo zpátky do balíčku a těžko by se testoval).
    const deck = stack(g, [RED(), RED(), mkCard(CardType.BEER), mkCard(CardType.BEER),
                           mkCard(CardType.BEER), mkCard(CardType.BEER)]);
    give(g, 0, CardType.JAIL);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const hand0 = g.players[0].hand.map(c => c.id);
    const res = g.ranchExchange(0, [hand0[0], hand0[2]]);
    assert.equal(res.discarded.length, 2);
    assert.equal(res.drawn.length, 2);
    assert.deepEqual(g.deck.discardPile.map(c => c.id), [hand0[0], hand0[2]]);
    assert.deepEqual(g.players[0].hand.map(c => c.id), [hand0[1], deck[2].id, deck[3].id]);
    assert.equal(g.phase, 'PLAY');
    assert.ok(!g.pendingRanch);
});

test('Ranč: přeskočení nechá ruku i balíček beze změny', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    stack(g, [RED(), RED(), mkCard(CardType.BEER)]);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const before = g.players[0].hand.map(c => c.id);
    const res = g.ranchExchange(0, []);
    assert.deepEqual(res, { discarded: [], drawn: [] });
    assert.deepEqual(g.players[0].hand.map(c => c.id), before);
    assert.equal(g.deck.cards.length, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Ranč: cizí, neznámá i zdvojená ID se ignorují', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    stack(g, [RED(), RED(), mkCard(CardType.BEER)]);
    give(g, 1, CardType.BANG, { id: 9001 });
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const mine = g.players[0].hand[0].id;
    const res = g.ranchExchange(0, [mine, mine, 9001, 12345]);
    assert.equal(res.discarded.length, 1, 'jen jednou a jen z vlastní ruky');
    assert.equal(g.players[1].hand.length, 1, 'soupeřova karta zůstala');
});

test('Ranč: hráč bez karet se neptá', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    g.deck.cards = [];
    g.deck.discardPile = [];
    g.startDrawPhase();
    g.drawCard('deck');   // balíček prázdný → nic se nelízne
    assert.equal(g.players[0].hand.length, 0);
    g._finishDraw();
    assert.equal(g.phase, 'PLAY', 'prázdná ruka = není co měnit');
    assert.ok(!g.pendingRanch);
});

test('Ranč: bez události se po lízání jde rovnou hrát', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], null);
    stack(g, [RED(), RED()]);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
    assert.ok(!g.pendingRanch);
});

test('Ranč jde AŽ ZA Želízky (High Noon má přednost)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    g.activeEvent = hn('ZELIZKA');
    stack(g, [RED(), RED(), mkCard(CardType.BEER)]);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'HANDCUFFS_SUIT', 'nejdřív barva');
    g.chooseHandcuffsSuit(0, Suits.HEARTS);
    assert.equal(g.phase, 'RANCH', 'a teprve pak výměna');
    g.ranchExchange(0, []);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0]._handcuffsSuit, Suits.HEARTS, 'volba barvy platí dál');
});

test('Ranč: výměna celé ruky Suzy Lafayette neprobudí (karty se vrátí naráz)', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Suzy Lafayette' }, {}], 'RANC');
    stack(g, [RED(), RED(), mkCard(CardType.BEER), mkCard(CardType.BEER)]);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'RANCH');
    g.ranchExchange(0, g.players[0].hand.map(c => c.id));
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.specialActionQueue.length, 0, 'ruka nikdy nebyla prázdná');
});

test('Ranč: tah nejde ukončit, dokud se hráč nerozhodne', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    stack(g, [RED(), RED(), mkCard(CardType.BEER)]);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    g.tryEndTurn();
    assert.equal(g.phase, 'RANCH');
    assert.equal(g.currentPlayerIndex, 0);
});

test('Ranč: klik na kartu v ruce ji označí k výměně (core/selection.js)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    stack(g, [RED(), RED(), mkCard(CardType.BEER)]);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const card = g.players[0].hand[0];
    const intent = decideCardClick({
        state: g, me: g.players[0], myIndex: 0, selectedState: { cardIndex: null },
        card, index: 0, blockInput: false, isMySidActive: false, playable: false,
    });
    assert.deepEqual(intent, { type: 'RANCH_TOGGLE', index: 0, cardId: card.id });
});

test('bot: v Ranči vymění jen nízko hodnocené karty a nikdy se nezasekne', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'RANC');
    stack(g, [RED(), RED(), mkCard(CardType.BEER), mkCard(CardType.BEER)]);
    give(g, 0, CardType.JAIL);          // keepScore 2 → vyměnit
    give(g, 0, CardType.BEER);          // keepScore 7 → nechat
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'ranch_exchange');
    assert.ok(Array.isArray(a.payload.cardIds));
    assert.ok(a.payload.cardIds.length <= 3);
    const kept = g.players[0].hand.filter(c => !a.payload.cardIds.includes(c.id));
    assert.ok(kept.some(c => c.type === CardType.BEER), 'Pivo si nechá');
    // Akce musí projít – jinak by se hra jen botů zasekla.
    assert.ok(g.ranchExchange(0, a.payload.cardIds));
    assert.equal(g.phase, 'PLAY');
});
