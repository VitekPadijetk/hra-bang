// Rozšíření Divoký západ – Zuřivá Doroty (fáze 12).
//
// „Hráč na tahu může jmenovat kartu a vybrat hráče, který ji musí zahrát (pokud ji má)."
// Poznámka v pravidlech: nemá-li ji, ukáže ruku; má-li ji, hraje ji, JAKO BY BYL NA TAHU
// (i pro počítání vzdáleností), ale cíl(e) vybírá poroučející.
//
// Podklad: docs/wild-west-show-plan.md §4.8 (R4 = strop x poručení za tah, R5 = cíl
// vybírá poroučející ze seznamu od serveru) + oficiální FAQ Q04–Q06.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { dorothyOffer, dorothyReady, dorothyTargets, dorothyPlayerOk } = require('../core/playability.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const hnData = rd('cards.high_noon.json');
const wws = key => wwsData.find(c => c.key === key);
const hn = key => hnData.find(c => c.key === key);

// Hra s aktivní Zuřivou Doroty. `current` = kdo je na tahu (a tedy poroučí).
function mkDorothy(n = 4, current = 0, specs = null) {
    const list = specs || (() => {
        const out = [{ role: 'Sheriff' }];
        for (let i = 1; i < n; i++) out.push({ role: i === n - 1 ? 'Renegade' : 'Outlaw' });
        return out;
    })();
    const g = mkGame(list, { current });
    g.activeWws = wws('ZURIVA_DOROTY');
    return g;
}

const kind = (g, name) => g._dorothyKinds().find(c => c.name === name);

// ── Nabídka: co jde poručit a komu ───────────────────────────────────────────

test('bez aktivní karty se poroučet nedá', () => {
    const g = mkDorothy(4, 0);
    g.activeWws = null;
    assert.equal(dorothyReady(g, 0), false);
    assert.equal(g.dorothyCommand(0, 'Bang!', 1), null);
});

test('poroučet smí jen hráč na tahu, a jen jinému hráči', () => {
    const g = mkDorothy(4, 0);
    assert.equal(dorothyReady(g, 1), false, 'kdo není na tahu, neporoučí');
    assert.equal(dorothyPlayerOk(g, 0, kind(g, 'Bang!'), 0), false, 'sám sobě ne');
});

// FAQ Q05: všechno se počítá tak, jako by kartu hrál PORUČENÝ.
test('dostřel se měří od PORUČENÉHO, ne od poroučejícího', () => {
    const g = mkDorothy(4, 0);
    const bang = kind(g, 'Bang!');
    // Colt .45 = dostřel 1. Hráč 0 na hráče 2 nedosáhne (vzdálenost 2), hráč 1 ano.
    assert.deepEqual(dorothyTargets(g, 1, bang).sort(), [0, 2]);
    assert.equal(dorothyTargets(g, 0, bang).includes(2), false);
    assert.equal(dorothyPlayerOk(g, 0, bang, 1), true);
});

// FAQ Q04: akce musí být pro poručeného proveditelná.
test('poručení bez legálního cíle se vůbec nenabídne', () => {
    // Dva hráči: poručený má jediného souseda – poroučejícího. To je legální cíl,
    // takže se nabídka dá; jakmile ale nikdo v dostřelu není (vyřazený soused), zmizí.
    const g = mkDorothy(3, 0);
    g.players[2].health = 0;
    const bang = kind(g, 'Bang!');
    assert.deepEqual(dorothyTargets(g, 1, bang), [0]);
    g.players[0].board.push(mkCard(CardType.EQUIPMENT, { name: 'Mustang', props: { effect: 'mustang' } }));
    // Mustang zvětšuje vzdálenost K hráči 0 – teď na něj hráč 1 Coltem nedosáhne.
    assert.deepEqual(dorothyTargets(g, 1, bang), []);
    assert.equal(dorothyPlayerOk(g, 0, bang, 1), false);
});

test('nabídka nezná ruce – karta jde poručit i tomu, kdo ji nemá', () => {
    const g = mkDorothy(4, 0);
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(dorothyPlayerOk(g, 0, kind(g, 'Bang!'), 1), true);
    const offer = dorothyOffer(g, 0, g._dorothyKinds());
    assert.ok(offer.some(o => o.card.name === 'Bang!' && o.players.includes(1)));
});

test('karty „odhoď další kartu" (Dodge City) se poroučet nedají', () => {
    const g = mkDorothy(4, 0);
    const ragtime = mkCard(CardType.RAGTIME, { name: 'Ragtime', props: { discardExtra: 'steal_any' } });
    assert.equal(dorothyPlayerOk(g, 0, ragtime, 1), false);
});

// ── Vypůjčené sedadlo ────────────────────────────────────────────────────────

test('poručený Bang! vystřelí PORUČENÝ – a sedadlo se vrátí majiteli', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BANG);
    const res = g.dorothyCommand(0, 'Bang!', 1);
    assert.deepEqual(res, { needTarget: true, commandedIdx: 1 });
    assert.equal(g.phase, 'DOROTHY_TARGET');
    assert.deepEqual(g.pendingDorothy.targets.sort(), [0, 2]);

    g.dorothyChooseTarget(0, 2);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.originatorIdx, 1, 'útočníkem je poručený');
    assert.equal(g.pendingResponse.targetIdx, 2);
    assert.equal(g.currentPlayerIndex, 0, 'na tahu je pořád poroučející');
    assert.equal(g._dorothyOwnerIdx, null);

    g.handleResponse(2, null);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0);
});

// FAQ Q05: „Slab jako poroučející dvě Vedle! nevynutí; Slab jako poručený ano."
test('Slab the Killer: rozhoduje PORUČENÝ, ne poroučející', () => {
    const g1 = mkDorothy(4, 0, [{ role: 'Sheriff', character: 'Slab the Killer' },
                                { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    give(g1, 1, CardType.BANG);
    g1.dorothyCommand(0, 'Bang!', 1);
    g1.dorothyChooseTarget(0, 2);
    assert.equal(g1.missesRequired, 1, 'poroučející Slab si 2× Vedle! nevynutí');

    const g2 = mkDorothy(4, 0, [{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Slab the Killer' },
                                { role: 'Outlaw' }, { role: 'Renegade' }]);
    give(g2, 1, CardType.BANG);
    g2.dorothyCommand(0, 'Bang!', 1);
    g2.dorothyChooseTarget(0, 2);
    assert.equal(g2.missesRequired, 2, 'poručený Slab si 2× Vedle! vynutí');
});

// FAQ Q06: duel prohrává PORUČENÝ hráč.
test('poručený Duel prohrává poručený, ne poroučející', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.DUEL, { name: 'Duel' });
    g.dorothyCommand(0, 'Duel', 1);
    assert.equal(g.phase, 'DOROTHY_TARGET');
    g.dorothyChooseTarget(0, 2);
    assert.equal(g.phase, 'RESPOND');
    // Hráč 2 nemá Bang! → duel končí, život ztrácí ten, kdo neodpověděl.
    g.handleResponse(2, null);
    assert.equal(g.players[2].health, 3, 'duel prohrál vyzvaný');
    // A obráceně: kdyby odpověděl on a nemohl poručený, ztrácí život PORUČENÝ.
    const h = mkDorothy(4, 0);
    give(h, 1, CardType.DUEL, { name: 'Duel' });
    give(h, 2, CardType.BANG);
    h.dorothyCommand(0, 'Duel', 1);
    h.dorothyChooseTarget(0, 2);
    h.handleResponse(2, 0);           // hráč 2 vrací Bang!
    h.handleResponse(1, null);        // poručený už nemá čím
    assert.equal(h.players[1].health, 3, 'duel prohrál poručený');
    assert.equal(h.players[0].health, 4, 'poroučející je bez škrábnutí');
});

// FAQ Q06: karty za Dostavník si líže PORUČENÝ.
test('poručený Dostavník líže PORUČENÝ hráč', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.STAGECOACH, { name: 'Dostavník' });
    g.deck.initializeStandardDeck(require('./_helpers.js').cardData);
    const res = g.dorothyCommand(0, 'Dostavník', 1);
    assert.deepEqual(res.played, true);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1, 'líže poručený');
    assert.equal(g.currentPlayerIndex, 0, 'na tahu je pořád poroučející');
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[1].hand.length, 2);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0);
});

test('poručená karta se počítá do limitu 1× Bang!/tah PORUČENÉHO', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BANG);
    give(g, 1, CardType.BANG);
    g.dorothyCommand(0, 'Bang!', 1);
    g.dorothyChooseTarget(0, 2);
    g.handleResponse(2, null);
    assert.equal(g.players[1].bangsPlayedThisTurn, 1);
    // Druhý Bang! už poručit nejde – limit poručeného je vyčerpaný.
    assert.equal(dorothyPlayerOk(g, 0, kind(g, 'Bang!'), 1), false);
});

test('poručená karta se počítá do tří karet Madam Zuzany PORUČENÉMU', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BANG);
    g.dorothyCommand(0, 'Bang!', 1);
    g.dorothyChooseTarget(0, 2);
    assert.equal(g.players[1]._playedThisTurn, 1);
    assert.equal(g.players[0]._playedThisTurn || 0, 0);
});

// ── Poručený kartu nemá ──────────────────────────────────────────────────────

test('bez jmenované karty se ruka veřejně ukáže a tah pokračuje', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    const res = g.dorothyCommand(0, 'Bang!', 1);
    assert.deepEqual(res, { revealed: true, playerIdx: 1 });
    assert.deepEqual(g._dorothyReveal, { playerIdx: 1 });
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.players[1].hand.length, 1, 'karta v ruce zůstává');
});

test('odkrytá ruka se posílá klientovi jen tomu jednomu hráči (redakce)', () => {
    const io = { sockets: { sockets: new Map() }, emit() {}, to() { return { emit() {} }; } };
    const ctx = { io, cardData: require('./_helpers.js').cardData, GameState: require('../logic.js').GameState };
    require('../server/rooms.js')(ctx);
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    give(g, 2, CardType.BEER, { name: 'Pivo' });
    g.dorothyCommand(0, 'Bang!', 1);
    const room = { id: 'r', players: [], gameState: g, options: {} };
    const seen = ctx.roomPayload(room, 0).gameState;
    assert.equal(seen.players[1].hand[0].name, 'Pivo', 'odkrytá ruka je vidět');
    assert.equal(seen.players[2].hand[0]._placeholder, true, 'ostatní ruce zůstávají skryté');
    assert.equal(seen.players[1].role, null, 'role se neodkrývá ani tady');
});

// ── Strop poručení: jedno za tah (bug 58) ────────────────────────────────────

test('poručit jde jednou za tah', () => {
    const g = mkDorothy(4, 0);
    assert.ok(dorothyReady(g, 0));
    g.dorothyCommand(0, 'Bang!', 1);
    assert.equal(dorothyReady(g, 0), false, 'druhé poručení už ne');
    assert.equal(g.dorothyCommand(0, 'Bang!', 2), null);
});

test('neúspěšné poručení strop taky spotřebuje (jinak by ho bot posílal donekonečna)', () => {
    const g = mkDorothy(4, 0);
    g.dorothyCommand(0, 'Bang!', 1);
    assert.equal(g._dorothyUsed, 1);
});

test('tutéž dvojici (karta, hráč) nelze v jednom tahu poručit dvakrát', () => {
    const g = mkDorothy(4, 0);
    g.dorothyCommand(0, 'Bang!', 1);
    assert.equal(dorothyPlayerOk(g, 0, kind(g, 'Bang!'), 1), false);
    // Strop „jedno poručení za tah" (bug 58) je stejně přísnější, takže se druhé
    // poručení nedostane ani k jinému hráči – zákaz dvojice zůstává jako pojistka.
    g._dorothyUsed = 0;
    assert.equal(dorothyPlayerOk(g, 0, kind(g, 'Bang!'), 2), true, 'jinému hráči ano');
    assert.equal(g.dorothyCommand(0, 'Bang!', 1), null);
});

test('strop i zakázané dvojice se nulují s novým tahem', () => {
    const g = mkDorothy(4, 0);
    g.dorothyCommand(0, 'Bang!', 1);
    g.nextTurn();
    assert.equal(g._dorothyUsed, 0);
    assert.deepEqual(g._dorothyDone, []);
});

// ── Rozmyšlené poručení ──────────────────────────────────────────────────────

test('zrušení výběru cíle vrátí fázi PLAY, ale strop se nevrací', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BANG);
    g.dorothyCommand(0, 'Bang!', 1);
    assert.equal(g.dorothyCancel(0), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g._dorothyUsed, 1);
    assert.equal(g.pendingDorothy, null);
});

test('cíl mimo seznam od serveru server odmítne', () => {
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BANG);
    g.dorothyCommand(0, 'Bang!', 1);
    assert.equal(g.dorothyChooseTarget(0, 3), null, 'hráč 3 není v dostřelu poručeného');
    assert.equal(g.phase, 'DOROTHY_TARGET', 'fáze zůstává – čeká se dál');
});

// ── Právo západu (Fistful) ───────────────────────────────────────────────────

test('vynucená karta (Právo západu) poroučení zakazuje', () => {
    const ffData = rd('cards.fistful.json');
    const g = mkDorothy(4, 0);
    g.activeFistful = ffData.find(c => c.key === 'PRAVO_ZAPADU');
    const bIdx = give(g, 0, CardType.BANG);
    g.players[0]._lawCardId = g.players[0].hand[bIdx].id;
    assert.equal(dorothyReady(g, 0), false);
    assert.equal(g.dorothyCommand(0, 'Bang!', 1), null);
});

// ── Želízka (High Noon) ──────────────────────────────────────────────────────
// Volba barvy platí „během svého tahu"; poručená karta je v cizím tahu, takže
// poručeného stará volba nesvazuje (a server by ji jinak tiše odmítl).
test('Želízka poručeného nesvazují (jeho barva patřila jeho tahu)', () => {
    const g = mkDorothy(4, 0);
    g.activeEvent = hn('ZELIZKA');
    g.players[1]._handcuffsSuit = '♥️';
    const bIdx = give(g, 1, CardType.BANG, { suit: Suits.SPADES });
    assert.equal(dorothyPlayerOk(g, 0, kind(g, 'Bang!'), 1), true);
    g.dorothyCommand(0, 'Bang!', 1);
    g.dorothyChooseTarget(0, 2);
    assert.equal(g.phase, 'RESPOND', 'piková karta prošla');
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(bIdx, 0);
});

// ── Limit 1× Bang!/tah (bug 64) ──────────────────────────────────────────────
// Limit patří VLASTNÍMU tahu a nuluje se hráči až na jeho začátku, takže by po něm
// zbývala jednička u každého, kdo v tomhle kole už střílel – a poručit Bang! by
// šlo jen tomu, kdo ještě na tahu nebyl.
test('poručit Bang! jde i tomu, kdo svůj vlastní v kole už vystřílel', () => {
    const g = mkDorothy(4, 0);
    g.players[1].bangsPlayedThisTurn = 1;          // zbytek z jeho tahu
    give(g, 1, CardType.BANG);
    assert.equal(dorothyPlayerOk(g, 0, kind(g, 'Bang!'), 1), true, 'nabídne se');
    g.dorothyCommand(0, 'Bang!', 1);
    g.dorothyChooseTarget(0, 2);
    assert.equal(g.phase, 'RESPOND', 'a doopravdy vystřelí');
    assert.equal(g.players[1].hand.length, 0);
});

test('nabídka ukazuje všechny hráče bez ohledu na jejich vystřílený limit', () => {
    const g = mkDorothy(4, 0);
    g.players.forEach(p => { p.bangsPlayedThisTurn = 1; });
    const offer = dorothyOffer(g, 0, g._dorothyKinds());
    const bangOffer = offer.find(o => o.card.name === 'Bang!');
    assert.deepEqual(bangOffer.players, [1, 2, 3]);
});

// ── Vyřazení uprostřed poručené karty ────────────────────────────────────────

test('smrt PORUČENÉHO neukončí cizí tah', () => {
    const g = mkDorothy(4, 0);
    g.players[1].health = 1;
    give(g, 1, CardType.DUEL, { name: 'Duel' });
    give(g, 2, CardType.BANG);
    g.dorothyCommand(0, 'Duel', 1);
    g.dorothyChooseTarget(0, 2);
    g.handleResponse(2, 0);        // hráč 2 vrací Bang!
    g.handleResponse(1, null);     // poručený nemá čím → umírá
    assert.equal(g.players[1].health, 0);
    assert.equal(g._autoEndTurnPending, undefined, 'tah poroučejícího běží dál');
    assert.equal(g.currentPlayerIndex, 0);
});

// ── Strukturální pojistka ────────────────────────────────────────────────────

test('pendingActor ve fázi DOROTHY_TARGET čeká na POROUČEJÍCÍHO', () => {
    const { pendingActor } = require('../core/pending.js');
    const g = mkDorothy(4, 0);
    give(g, 1, CardType.BANG);
    g.dorothyCommand(0, 'Bang!', 1);
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'DOROTHY_TARGET' });
});
