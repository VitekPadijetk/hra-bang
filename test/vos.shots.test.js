// Rozšíření Údolí stínů – fáze F3: fronta výstřelů a klikané zásahy s útočníkem.
//
//   OPĚTOVNÁ PALBA    – „Počítá se jako karta VEDLE!. Hráč, který na tebe střílel, je nyní
//                       cílem efektu BANG!."
//   ROZTŘÍŠTĚNÁ KULKA – „Účinkuje jako BANG! na dostřel. Hráč dle tvého výběru ve
//                       vzdálenosti 1 od napadeného hráče (kromě tebe) se stává také terčem
//                       efektu BANG!."
//   DVOJITÁ RÁNA      – „Tuto kartu zahraješ společně s kartou BANG!. Je-li napadený hráč
//                       zasažen, ztrácí dva životy. Na vyhnutí stačí jedna karta VEDLE!."
//   EVELYN SHEBANG    – „Ve své fázi 1 si smí líznout o 1 kartu méně, čímž automaticky
//                       vystřelí BANG! na vzdálenost 1."
//
// Podklad: docs/udoli-stinu-plan.md §2.5, §2.6, §4, §5 a §8 (F3), docs/udoli-stinu.md §4–§5.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { Card, distinctCardKinds, VOS_READY } = require('../logic/entities.js');
const { cardPlayability, playsAsMissed, playsAsBang, aimOk, aimCardFor, fanningOk,
        lematBangOk } = require('../core/playability.js');
const { pendingActor } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { getActionForCard } = require('../core/cardRules.js');
const V = require('../core/valley.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const hnData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);

let _vid = 79000;
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

const BACKFIRE = 'Opětovná palba', FANNING = 'Roztříštěná kulka', AIM = 'Dvojitá rána';
const EVELYN = 'Evelyn Shebang';

// ── Hotové druhy ─────────────────────────────────────────────────────────────

test('F3: karty i Evelyn jdou do ostré hry', () => {
    for (const n of [BACKFIRE, FANNING, AIM]) assert.ok(V.VOS_CARDS_READY.includes(n), n);
    assert.ok(VOS_READY.includes(EVELYN));
});

// ── Opětovná palba ───────────────────────────────────────────────────────────

test('Opětovná palba: uhne a střelec je hned terčem efektu BANG!', () => {
    const g = mkV([{}, {}, {}]);
    const b = give(g, 0, CardType.BANG);
    const bf = giveV(g, 1, BACKFIRE);
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[bf]), true);
    g.handleResponse(1, bf);
    // Výstřel zpět: obrana obránce doběhla, takže se rovnou ptá původní střelec.
    assert.equal(g.phase, 'RESPOND');
    const pr = g.pendingResponse;
    assert.equal(pr.targetIdx, 0);
    assert.equal(pr.originatorIdx, 1);
    assert.equal(pr.sourceCardName, BACKFIRE);
    assert.equal(pr.bangEffect, true, 'je to bang-efekt, ne karta BANG!');
    assert.equal(pr.vos.shot, 'BACKFIRE');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'RESPOND' });
    assert.equal(g.players[1].health, 4);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.currentPlayerIndex, 0, 'tah pořád patří střelci');
});

test('Opětovná palba proti Slabovi: sama nestačí, s druhým Vedle! vystřelí zpět', () => {
    const g = mkV([{ character: 'Slab the Killer' }, {}, {}]);
    const b = give(g, 0, CardType.BANG);
    giveV(g, 1, BACKFIRE);
    g.playBang(0, 1, b);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'RESPOND', 'čeká se na druhé Vedle!');
    assert.equal(g.pendingResponse.targetIdx, 1);
    // Druhé Vedle! nemá → schytá zásah, výstřel zpět žádný.
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.ok(!(g._vosShots || []).length);

    const h = mkV([{ character: 'Slab the Killer' }, {}, {}]);
    const b2 = give(h, 0, CardType.BANG);
    giveV(h, 1, BACKFIRE);
    give(h, 1, CardType.MISSED);
    h.playBang(0, 1, b2);
    h.handleResponse(1, 0);
    h.handleResponse(1, 0);
    assert.equal(h.phase, 'RESPOND');
    assert.equal(h.pendingResponse.targetIdx, 0, 'až teď střílí zpět');
    assert.equal(h.missesRequired, 1, 'výstřel zpět je efekt – stačí jedno Vedle!');
});

test('Opětovná palba = karta Vedle!: Calamity ji smí jako BANG!, Big Spencer vůbec, Lemat ne', () => {
    const g = mkV([{ character: 'Calamity Janet' }, { character: 'Big Spencer' }, {}]);
    const bf = vcard(BACKFIRE);
    assert.equal(playsAsBang(g, g.players[0], bf), true);
    assert.equal(getActionForCard(bf, ['Calamity Janet']), 'SHOOT');
    assert.equal(playsAsMissed(g, g.players[1], bf), false, 'Big Spencer nesmí hrát karty Vedle!');
    assert.equal(playsAsMissed(g, g.players[2], bf), true);
    // Ve vlastním tahu se nehraje (není to Calamity).
    g.currentPlayerIndex = 2;
    g.players[2].hand.push(bf);
    assert.equal(cardPlayability(g, g.players[2], 2, bf), false);
    // Lemat z ní BANG! neudělá („kromě VEDLE!").
    g.players[2].weapon = vcard('Lemat');
    assert.equal(lematBangOk(g, g.players[2], 2, bf), false);
});

test('Opětovná palba: výstřel zpět zabije střelce na tahu → tah končí, zabil obránce', () => {
    const g = mkV([{ role: 'Outlaw', health: 1 }, { role: 'Sheriff' }, { role: 'Renegade' }, { role: 'Deputy' }]);
    const b = give(g, 0, CardType.BANG);
    giveV(g, 1, BACKFIRE);
    g.playBang(0, 1, b);
    g.handleResponse(1, 0);
    assert.equal(g.pendingResponse.targetIdx, 0);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 0);
    // Odměna 3 karty za banditu patří tomu, kdo vystřelil zpět – ne mrtvému na tahu.
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 1);
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
    assert.equal(g._nextTurnAfterQueue, true, 'po odměně se tah posune');
});

test('Opětovná palba: smrt střelce na tahu bez odměny → tah se ukončí (autoEndTurn)', () => {
    const g = mkV([{ role: 'Renegade', health: 1 }, { role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    const b = give(g, 0, CardType.BANG);
    giveV(g, 2, BACKFIRE);
    g.playBang(0, 2, b);
    g.handleResponse(2, 0);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 0);
    assert.equal(g._autoEndTurnPending, true);
    assert.equal(g._deadPlayerIdx, 0);
});

test('Opětovná palba proti Kulometu: výstřely zpět čekají, až Kulomet doběhne', () => {
    const g = mkV([{}, {}, {}]);
    const k = give(g, 0, CardType.GATLING);
    giveV(g, 1, BACKFIRE);
    giveV(g, 2, BACKFIRE);
    g.playCard(k);
    assert.equal(g.pendingResponse.targetIdx, 1);
    g.handleResponse(1, 0);
    assert.equal(g.pendingResponse.targetIdx, 2, 'Kulomet jde dál – výstřel zpět ho nepřerušil');
    assert.equal(g.pendingResponse.sourceCard, CardType.GATLING);
    g.handleResponse(2, 0);
    // Teď dva výstřely zpět po sobě.
    assert.equal(g.pendingResponse.originatorIdx, 1);
    assert.equal(g.pendingResponse.targetIdx, 0);
    g.handleResponse(0, null);
    assert.equal(g.pendingResponse.originatorIdx, 2);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 2);
    assert.equal(g.phase, 'PLAY');
});

test('Opětovná palba bez střelce (Fistful of Cards) je jen Vedle!', () => {
    const g = mkV([{}, {}]);
    giveV(g, 0, BACKFIRE);
    g._beginBangResolution(null, 0, false, 'Fistful of Cards');
    g.handleResponse(0, 0);
    assert.ok(!(g._vosShots || []).length);
    assert.equal(g.phase, 'PLAY');
});

// Bot s VEŘEJNĚ známými rolemi (šerif má hvězdu, ostatním ji odkryjeme), ať se ví, kdo
// je nepřítel – beliefs si spočítá decideBotAction sám z prázdného ledgeru.
function revealAll(g) { g.players.forEach(p => { p._roleRevealed = true; }); }

test('bot: Opětovnou palbou se brání přednostně proti nepříteli, proti spojenci ne', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    revealAll(g);
    const b = give(g, 0, CardType.BANG);
    give(g, 1, CardType.MISSED);
    giveV(g, 1, BACKFIRE);
    g.playBang(0, 1, b);
    const a = decideBotAction(g, 1);
    assert.deepEqual(a, { event: 'respond_to_card', payload: { playerIdx: 1, cardIndex: 1 } },
        'šerif je nepřítel → Opětovná palba');

    const h = mkV([{ role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Renegade' }]);
    revealAll(h);
    const b2 = give(h, 0, CardType.BANG);
    give(h, 1, CardType.MISSED);
    giveV(h, 1, BACKFIRE);
    h.playBang(0, 1, b2);
    assert.deepEqual(decideBotAction(h, 1), { event: 'respond_to_card', payload: { playerIdx: 1, cardIndex: 0 } },
        'spoluhráč (bandita) → obyčejné Vedle!');
});

// ── Roztříštěná kulka ────────────────────────────────────────────────────────

// Pět hráčů v kruhu: 0 střílí na souseda 1 (vzdálenost 1), druhým cílem může být 2
// (vzdálenost 1 od jedničky), ale ne 0 (střelec).
test('Roztříštěná kulka: dva cíle – druhý výstřel jde i po minutí prvního', () => {
    const g = mkV([{}, {}, {}, {}, {}]);
    const f = giveV(g, 0, FANNING);
    give(g, 1, CardType.MISSED);
    assert.equal(getActionForCard(g.players[0].hand[f], []), 'FANNING');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[f]), true);
    const t = V.fanningTargets(g, 0).find(x => x.first === 1);
    assert.deepEqual(t.seconds, [2]);
    assert.equal(g.playFanning(0, f, 1, 2), true);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1, 'čerpá limit karet BANG!');
    assert.equal(g.pendingResponse.targetIdx, 1);
    assert.ok(!g.pendingResponse.vos.bangCard, 'kartou BANG! není');
    g.handleResponse(1, 0);   // první uhnul
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 2, 'druhý výstřel je povinný');
    g.handleResponse(2, null);
    assert.equal(g.players[2].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Roztříštěná kulka: neplatný druhý cíl (střelec, daleko) server odmítne', () => {
    const g = mkV([{}, {}, {}, {}, {}]);
    const f = giveV(g, 0, FANNING);
    assert.equal(g.playFanning(0, f, 1, 0), false, 'sám sebe ne');
    assert.equal(g.playFanning(0, f, 1, 3), false, 'trojka je od jedničky na 2');
    assert.equal(g.playFanning(0, f, 1, null), false, 'druhý cíl je povinný, když existuje');
    assert.equal(g.players[0].hand.length, 1, 'karta zůstala v ruce');
});

test('Roztříštěná kulka: povinnost Dynamite Boxu – první cíl musí mít souseda, má-li ho někdo', () => {
    // Sousedé střelce jsou 1 a 4. Dvojka má Mustang, takže je od jedničky na 2 a jednička
    // druhý cíl nemá (střelec se nepočítá); čtyřka má vedle sebe trojku.
    const g = mkV([{}, {}, {}, {}, {}]);
    board(g, 2, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    const f = giveV(g, 0, FANNING);
    const ts = V.fanningTargets(g, 0);
    assert.deepEqual(ts, [{ first: 4, seconds: [3] }]);
    assert.equal(g.playFanning(0, f, 1, null), false, 'cíl bez souseda nejde, když jiný souseda má');
    assert.equal(g.playFanning(0, f, 4, 3), true);

    // Nikdo souseda nemá → obyčejný výstřel na jeden cíl (druhý výstřel se nezapíše).
    const h = mkV([{}, {}, {}]);
    board(h, 1, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    board(h, 2, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    h.players[0].weapon = new Card(_vid++, 'Schofield', CardType.WEAPON, Suits.CLUBS, 'K', { range: 2 });
    const f2 = giveV(h, 0, FANNING);
    assert.deepEqual(V.fanningTargets(h, 0), [{ first: 1, seconds: [] }, { first: 2, seconds: [] }]);
    assert.equal(h.playFanning(0, f2, 1, 2), true, 'nesmyslný druhý cíl se zahodí');
    assert.ok(!(h._vosShots || []).length);
});

test('Roztříštěná kulka čerpá limit: po BANG!u už ne, po ní už ne BANG!', () => {
    const g = mkV([{}, {}, {}, {}, {}]);
    const f = giveV(g, 0, FANNING);
    g.players[0].bangsPlayedThisTurn = 1;
    assert.equal(fanningOk(g, g.players[0], 0, g.players[0].hand[f]), false);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[f]), false);
    const h = mkV([{ character: 'Willy the Kid' }, {}, {}, {}, {}]);
    const f2 = giveV(h, 0, FANNING);
    h.players[0].bangsPlayedThisTurn = 3;
    assert.equal(fanningOk(h, h.players[0], 0, h.players[0].hand[f2]), true, 'Willy limit nemá');
});

test('Roztříštěná kulka není karta BANG!: Odměna se nespouští', () => {
    const g = mkV([{}, {}, {}, {}, {}]);
    g.players[1].board.push(vcard('Odměna'));
    const f = giveV(g, 0, FANNING);
    g.playFanning(0, f, 1, 2);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.ok(!g.specialActionQueue.some(a => a.type === 'KILL_REWARD'));
    assert.notEqual(g.phase, 'DRAW', 'nikdo si za Odměnu nelíže');
});

test('bot: Roztříštěnou kulku pošle na dva nepřátele, na spojence ne', () => {
    // Bandita (0) – sousedé 1 (šerif) a 3; vedle šerifa sedí pomocník (2).
    const g = mkV([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Outlaw' }]);
    revealAll(g);
    giveV(g, 0, FANNING);
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'play_fanning', payload: { cardIdx: 0, firstIdx: 1, secondIdx: 2 } });
    assert.equal(g.playFanning(0, 0, 1, 2), true);

    // Druhý výstřel by šel do spoluhráče (jediná dvojice) → bot kulku nehraje.
    const h = mkV([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Outlaw' }]);
    revealAll(h);
    giveV(h, 0, FANNING);
    assert.notEqual(decideBotAction(h, 0).event, 'play_fanning');
});

// ── Dvojitá rána ─────────────────────────────────────────────────────────────

test('Dvojitá rána: jde jen ke KARTĚ BANG!, ne k bang-efektu, sama se nehraje', () => {
    const g = mkV([{}, {}, {}]);
    const a = giveV(g, 0, AIM);
    const b = give(g, 0, CardType.BANG);
    const t = giveV(g, 0, 'Tomahawk');
    const me = g.players[0];
    assert.equal(cardPlayability(g, me, 0, me.hand[a]), false, 'samotná nejde');
    assert.equal(aimOk(g, me, 0, me.hand[b], me.hand[a]), true);
    assert.equal(aimOk(g, me, 0, me.hand[t], me.hand[a]), false, 'Tomahawk není karta BANG!');
    assert.equal(aimCardFor(g, me, 0, me.hand[b]).id, me.hand[a].id);
    // Server neplatnou kombinaci odmítne celou.
    g.playBang(0, 1, t, me.hand[a].id);
    assert.equal(me.hand.length, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Dvojitá rána: zásah = dva klikané zásahy s útočníkem, obě karty v odhozu', () => {
    const g = mkV([{}, { character: 'Bart Cassidy' }, {}]);
    const b = give(g, 0, CardType.BANG);
    giveV(g, 0, AIM);
    const aimId = g.players[0].hand[1].id;
    g.playBang(0, 1, b, aimId);
    assert.equal(g.players[0].hand.length, 0, 'odešly obě karty');
    assert.equal(g.players[0].bangsPlayedThisTurn, 1, 'do limitu jen BANG!');
    assert.equal(g.pendingResponse.vos.aim, true);
    g.handleResponse(1, null);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 2);
    assert.equal(g.pendingDynamiteDamage.attackerIdx, 0);
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'DYNAMITE_DAMAGE' });
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 3);
    // Bart Cassidy si líže za každý život – hned mezi kliky.
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(1);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 2);
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(1);
    assert.equal(g.phase, 'PLAY');
    assert.ok(!g.pendingDynamiteDamage);
});

test('Dvojitá rána: na vyhnutí stačí jedno Vedle!', () => {
    const g = mkV([{}, {}, {}]);
    const b = give(g, 0, CardType.BANG);
    giveV(g, 0, AIM);
    give(g, 1, CardType.MISSED);
    g.playBang(0, 1, b, g.players[0].hand[1].id);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
});

test('Dvojitá rána: Pivo v obraně zachrání jen jeden život, druhý se kliká', () => {
    const g = mkV([{}, { health: 2 }, {}, {}]);
    const b = give(g, 0, CardType.BANG);
    giveV(g, 0, AIM);
    g.playBang(0, 1, b, g.players[0].hand[1].id);
    g.handleResponse(1, null);
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    // Na posledním životě smí mezi kliky zahrát Pivo (jako u dynamitu).
    const beer = give(g, 1, CardType.BEER);
    assert.equal(g.beerLastLifeSave(1, beer), true);
    assert.equal(g.players[1].health, 1);
    assert.equal(g.phase, 'PLAY');

    const h = mkV([{}, { health: 1 }, {}, {}]);
    const b2 = give(h, 0, CardType.BANG);
    giveV(h, 0, AIM);
    const beer2 = give(h, 1, CardType.BEER);
    h.playBang(0, 1, b2, h.players[0].hand[1].id);
    assert.equal(h.beerLastLifeSave(1, beer2), true);
    assert.equal(h.phase, 'DYNAMITE_DAMAGE', 'Pivo v obraně zrušilo jeden život, druhý zbývá');
    assert.equal(h.pendingDynamiteDamage.hitsLeft, 1);
    h.takeDynamiteHit(1);
    assert.equal(h.players[1].health, 0);
});

test('Dvojitá rána: vyřazení klikem – zabil střelec (odměna za banditu), zbytek propadá', () => {
    const g = mkV([{ role: 'Sheriff' }, { role: 'Outlaw', health: 1 }, { role: 'Renegade' }, { role: 'Deputy' }]);
    const b = give(g, 0, CardType.BANG);
    giveV(g, 0, AIM);
    g.playBang(0, 1, b, g.players[0].hand[1].id);
    g.handleResponse(1, null);
    g.takeDynamiteHit(1);
    assert.equal(g.players[1].health, 0);
    assert.ok(!g.pendingDynamiteDamage, 'druhý zásah propadl');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.playerIdx, 0, 'odměna 3 karty střelci');
    assert.equal(g.drawPhaseState.cardsNeeded, 3);
});

test('bot: k výstřelu přidá Dvojitou ránu', () => {
    const g = mkV([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Renegade' }]);
    revealAll(g);
    give(g, 0, CardType.BANG);
    giveV(g, 0, AIM);
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.aimCardId, g.players[0].hand[1].id);
    g.playBang(0, a.payload.targetIdx, a.payload.cardIdx, a.payload.aimCardId);
    assert.equal(g.players[0].hand.length, 0);
});

// ── Evelyn Shebang ───────────────────────────────────────────────────────────

test('Evelyn: o kartu méně → výstřel na vzdálenost 1, odpálí se po fázi lízání', () => {
    const g = mkV([{ character: EVELYN }, {}, {}, {}]);
    g.startDrawPhase();
    assert.equal(g.phase, 'DRAW');
    assert.ok(g.drawPhaseState.options.includes('evelyn'));
    assert.equal(V.evelynOffer(g, 0), true);
    assert.deepEqual(V.evelynTargets(g, 0).sort(), [1, 3]);
    g.drawCard('evelyn', 2);
    assert.ok(!g.drawPhaseState.evelynUsed, 'dvojka je daleko – odmítnuto');
    g.drawCard('evelyn', 1);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    assert.equal(V.evelynOffer(g, 0), false, 'jen jednou');
    assert.equal(g.phase, 'DRAW');
    topDeck(g, Suits.HEARTS);
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);
    assert.equal(g.pendingResponse.originatorIdx, 0);
    assert.equal(g.pendingResponse.sourceCardName, EVELYN);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].bangsPlayedThisTurn, 0, 'BANG! smí hrát dál');
});

test('Evelyn: po první kartě už ne; bez cíle se nenabízí', () => {
    const g = mkV([{ character: EVELYN }, {}, {}, {}]);
    g.startDrawPhase();
    topDeck(g, Suits.HEARTS);
    g.drawCard('deck');
    assert.equal(V.evelynOffer(g, 0), false);
    g.drawCard('evelyn', 1);
    assert.equal(g.drawPhaseState.cardsNeeded, 2);

    // Sousedé mají Mustang → nikdo není ve vzdálenosti 1, možnost se vůbec nenabídne.
    const h = mkV([{ character: EVELYN }, {}, {}, {}]);
    board(h, 1, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    board(h, 3, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    h.startDrawPhase();
    assert.deepEqual(V.evelynTargets(h, 0), []);
    assert.ok(!h.drawPhaseState.options.includes('evelyn'));
    assert.equal(V.evelynOffer(h, 0), false);
});

test('Evelyn pod Žízní: nelízne si nic a fáze lízání rovnou končí', () => {
    const g = mkV([{ character: EVELYN }, {}, {}]);
    g.highNoonCardData = hnData;
    g.activeEvent = hnData.find(c => c.key === 'ZIZEN');
    g.startDrawPhase();
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('evelyn', 1);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.phase, 'RESPOND', 'výstřel jde hned, nic se nelíže');
    assert.equal(g.pendingResponse.targetIdx, 1);
});

test('Evelyn pod Želízky: barva se volí dřív, než výstřel vyletí', () => {
    const g = mkV([{ character: EVELYN }, {}, {}]);
    g.highNoonCardData = hnData;
    g.options = { expansions: { udoli_stinu: true, high_noon: true, high_noon_extra: true } };
    g.activeEvent = hnData.find(c => c.key === 'ZELIZKA') || null;
    if (!g.activeEvent) return;   // Želízka jsou přibalená karta – bez ní není co testovat
    g.startDrawPhase();
    g.drawCard('evelyn', 1);
    topDeck(g, Suits.HEARTS);
    g.drawCard('deck');
    topDeck(g, Suits.HEARTS);
    g.drawCard('deck');
    assert.equal(g.phase, 'HANDCUFFS_SUIT', 'výstřel nepřeskočil volbu barvy');
    g.chooseHandcuffsSuit(0, Suits.HEARTS);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);
});

test('bot: Evelyn střílí místo karty na nepřítele ve vzdálenosti 1, na spojence ne', () => {
    const g = mkV([{ character: EVELYN, role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    revealAll(g);
    g.startDrawPhase();
    assert.deepEqual(decideBotAction(g, 0), { event: 'draw_card', payload: { source: 'evelyn', sourceIdx: 1 } });

    const h = mkV([{ character: EVELYN, role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Outlaw' }]);
    revealAll(h);
    h.startDrawPhase();
    assert.deepEqual(decideBotAction(h, 0), { event: 'draw_card', payload: { source: 'deck', sourceIdx: null } });
});

// ── Fronta výstřelů obecně ───────────────────────────────────────────────────

test('výstřel, jehož cíl mezitím odešel ze hry, propadá', () => {
    const g = mkV([{}, {}, {}]);
    g._vosQueueShot(0, 2, 'FANNING', FANNING);
    g.players[2].health = 0;
    assert.equal(g._drainVosShots(), false);
    assert.equal(g._vosShots.length, 0);
    assert.equal(g.phase, 'PLAY');
});

test('výstřel čeká, dokud něco běží (fronta odložených akcí, obrana)', () => {
    const g = mkV([{}, {}, {}]);
    g._vosQueueShot(1, 0, 'BACKFIRE', BACKFIRE);
    g.phase = 'RESPOND';
    g.pendingResponse = { active: true, targetIdx: 2 };
    assert.equal(g._drainVosShots(), false);
    g.phase = 'PLAY';
    g.pendingResponse = null;
    g.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: 2, cardsNeeded: 1 });
    assert.equal(g._drainVosShots(), false);
    g.specialActionQueue.length = 0;
    assert.equal(g._drainVosShots(), true);
    assert.equal(g.phase, 'RESPOND');
});

test('konec tahu: tryEndTurn nejdřív odpálí čekající výstřel, nextTurn zbytek zahodí', () => {
    const g = mkV([{}, {}, {}]);
    g._vosQueueShot(1, 0, 'BACKFIRE', BACKFIRE);
    g.tryEndTurn();
    assert.equal(g.phase, 'RESPOND', 'tah neskončil – nejdřív výstřel');
    assert.equal(g.currentPlayerIndex, 0);
    g._vosQueueShot(1, 0, 'BACKFIRE', BACKFIRE);
    g.pendingResponse = null;
    g.phase = 'PLAY';
    g.nextTurn();
    assert.equal(g._vosShots.length, 0);
});

// ── Duel: kdo ho zahrál a prohrál, končí tah (oprava mimo rozšíření) ────────────

test('Duel: hráč na tahu prohraje vlastní duel a umře → tah se ukončí', () => {
    const g = mkGame([{ role: 'Outlaw', health: 1 }, { role: 'Sheriff' }, {}, { role: 'Renegade' }]);
    const d = give(g, 0, CardType.DUEL);
    g.playSpecialCard(0, 1, d);
    give(g, 1, CardType.BANG);
    g.handleResponse(1, 0);
    g.handleResponse(0, null);
    assert.equal(g.players[0].health, 0);
    assert.equal(g._autoEndTurnPending, true);
    assert.equal(g._deadPlayerIdx, 0);
});
