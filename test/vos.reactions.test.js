// Rozšíření Údolí stínů – fáze F6: okno úniku (Útěk, Mick Defender).
//
//   ÚTĚK          – „Pokud jsi jediným cílem karty jiné než BANG!, vyhneš se efektu
//                   odhozením této karty." Hraje se jen jako reakce.
//   MICK DEFENDER – „Pokud je Mick jediným cílem karty, může použít kartu VEDLE, aby se
//                   jejímu efektu vyhnul." Kartám BANG! se brání obvyklým způsobem.
//
// Karty bez vlastní obrany (Panika, Cat Balou, Duel, Vězení, Chřestýš, Odměna, Ragtime,
// Krytý vůz, Kankán, opakování Lee Van Kliffem) se zastaví ve fázi EVADE_OFFER – ale jen
// tehdy, když cíl reagovat může (R4). Bang-efekty na jediný cíl mají RESPOND už dnes,
// tam je Útěk jen další platná odpověď (escapeRespondOk).
//
// Podklad: docs/udoli-stinu-plan.md §2.8, R4, R11, R13; docs/udoli-stinu.md §2, §4.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, board, CardType, Suits } = require('./_helpers.js');
const { Card, distinctCardKinds, VOS_READY } = require('../logic/entities.js');
const { cardPlayability, nativePlayInTurn, lawForcedCard } = require('../core/playability.js');
const { pendingActor, waitingStatus } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { decideCardClick } = require('../core/selection.js');
const V = require('../core/valley.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);
const ffData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8'));

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
function boardV(g, idx, name, o) {
    const c = vcard(name, o);
    g.players[idx].board.push(c);
    return c;
}

const VOS_ON = { expansions: { udoli_stinu: true } };
function mkV(specs, opts = {}) {
    const g = mkGame(specs, opts);
    g.options = VOS_ON;
    g.turnId = 1;
    return g;
}
const MICK = 'Mick Defender';
const idOf = (g, idx, i) => g.players[idx].hand[i].id;
const inDiscard = (g, id) => g.deck._discardPile.some(c => c && c.id === id);

// ── Data a hratelnost ────────────────────────────────────────────────────────

test('F6: Útěk jde do balíčku a Mick Defender do ostré hry', () => {
    assert.ok(V.VOS_CARDS_READY.includes('Útěk'));
    assert.ok(VOS_READY.includes(MICK));
});

test('Útěk se ve vlastním tahu nehraje (jen jako reakce)', () => {
    const g = mkV([{}, {}]);
    const i = giveV(g, 0, 'Útěk');
    const card = g.players[0].hand[i];
    assert.equal(nativePlayInTurn(g, g.players[0], 0, card), false);
    assert.equal(cardPlayability(g, g.players[0], 0, card), false);
});

// ── Okno úniku: Panika / Cat Balou ───────────────────────────────────────────

test('Panika na hráče s Útěkem → EVADE_OFFER, čeká se na cíl', () => {
    const g = mkV([{}, {}]);
    giveV(g, 1, 'Útěk');
    give(g, 1, CardType.BANG);
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(g.phase, 'EVADE_OFFER');
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'EVADE_OFFER' });
    assert.equal(g.pendingEvade.attackerIdx, 0);
    assert.equal(g.pendingEvade.resume.kind, 'SELECTION');
    assert.match(waitingStatus(g).text, /vyhne kartě Panika/);
    // Dokud cíl nerozhodl, nic se neukradlo.
    assert.equal(g.players[1].hand.length, 2);
});

test('Útěk proti Panice: nic se nevezme, Útěk i Panika v odhozu, hraje se dál', () => {
    const g = mkV([{}, {}]);
    const ui = giveV(g, 1, 'Útěk');
    give(g, 1, CardType.BANG);
    const pi = give(g, 0, CardType.PANIC);
    const panicId = idOf(g, 0, pi);
    g.playSpecialCard(0, 1, pi);
    const utekId = idOf(g, 1, ui);
    const res = g.vosEvade(1, utekId);
    assert.ok(res && res.card.id === utekId);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingEvade, null);
    assert.ok(!g.pendingSelection);
    assert.equal(g.players[1].hand.length, 1, 'zbyl mu BANG!');
    assert.equal(g.players[0].hand.length, 0, 'útočník nic nedostal');
    assert.ok(inDiscard(g, utekId) && inDiscard(g, panicId));
    assert.equal(g.currentPlayerIndex, 0);
});

test('nevyhnout se → výběr karty pokračuje a Panika krade normálně', () => {
    const g = mkV([{}, {}]);
    giveV(g, 1, 'Útěk');
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.deepEqual(g.vosEvade(1, null), { declined: true });
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingSelection.targetIdx, 1);
    g.resolveCardSelection(0, 'hand', 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 1, 'ukradl Útěk z ruky');
});

test('R4: bez Útěku (a bez Micka) se okno vůbec neotevře', () => {
    const g = mkV([{}, {}]);
    give(g, 1, CardType.MISSED);
    const ci = give(g, 0, CardType.CAT_BALOU);
    g.playSpecialCard(0, 1, ci);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
    assert.equal(g.pendingEvade, null);
});

test('bez rozšíření se nic nemění (Útěk v ruce nic neotevře)', () => {
    const g = mkGame([{}, {}]);
    g.players[1].hand.push(vcard('Útěk'));
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');
});

test('neplatný únik (karta, kterou se vyhnout nejde) okno nechá viset', () => {
    const g = mkV([{}, {}]);
    giveV(g, 1, 'Útěk');
    const bi = give(g, 1, CardType.BANG);
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(g.vosEvade(1, idOf(g, 1, bi)), null);
    assert.equal(g.vosEvade(0, null), null, 'rozhoduje jen cíl');
    assert.equal(g.phase, 'EVADE_OFFER');
});

// ── Vyložené karty: Vězení, Chřestýš, Odměna ─────────────────────────────────

test('Vězení: během rozmýšlení leží před cílem, únik ho odhodí', () => {
    const g = mkV([{ role: 'Sheriff' }, {}]);
    const ui = giveV(g, 1, 'Útěk');
    const ji = give(g, 0, CardType.JAIL);
    const jailId = idOf(g, 0, ji);
    g.playSpecialCard(0, 1, ji);
    assert.equal(g.phase, 'EVADE_OFFER');
    assert.equal(g.pendingEvade.resume.kind, 'PLACE');
    assert.ok(g.players[1].board.some(c => c.id === jailId), 'karta leží před cílem');
    const res = g.vosEvade(1, idOf(g, 1, ui));
    assert.equal(res.placed.card.id, jailId);
    assert.ok(!g.players[1].board.some(c => c.id === jailId));
    assert.ok(inDiscard(g, jailId));
    assert.equal(g.phase, 'PLAY');
});

test('Vězení: nevyhnout se → zůstává ležet', () => {
    const g = mkV([{ role: 'Sheriff' }, {}]);
    giveV(g, 1, 'Útěk');
    const ji = give(g, 0, CardType.JAIL);
    const jailId = idOf(g, 0, ji);
    g.playSpecialCard(0, 1, ji);
    g.vosEvade(1, null);
    assert.equal(g.phase, 'PLAY');
    assert.ok(g.players[1].board.some(c => c.id === jailId));
});

test('Chřestýš před sebe: sám sobě se nikdo nevyhýbá', () => {
    const g = mkV([{}, {}]);
    giveV(g, 0, 'Útěk');
    const ri = giveV(g, 0, 'Chřestýš');
    g.playSpecialCard(0, 0, ri);
    assert.equal(g.phase, 'PLAY');
    assert.ok(g.players[0].board.some(c => c.type === CardType.RATTLESNAKE));
});

test('Odměna před soupeře s Útěkem → okno; únik ji odhodí', () => {
    const g = mkV([{}, {}]);
    const ui = giveV(g, 1, 'Útěk');
    const oi = giveV(g, 0, 'Odměna');
    g.playSpecialCard(0, 1, oi);
    assert.equal(g.phase, 'EVADE_OFFER');
    g.vosEvade(1, idOf(g, 1, ui));
    assert.ok(!g.players[1].board.some(c => c.type === CardType.BOUNTY));
});

// ── Duel ─────────────────────────────────────────────────────────────────────

test('Duel: únik jen PŘED začátkem – po úniku žádný RESPOND', () => {
    const g = mkV([{}, {}]);
    const ui = giveV(g, 1, 'Útěk');
    const di = give(g, 0, CardType.DUEL);
    g.playSpecialCard(0, 1, di);
    assert.equal(g.phase, 'EVADE_OFFER');
    assert.equal(g.pendingEvade.resume.kind, 'DUEL');
    assert.ok(!g.pendingResponse?.active);
    g.vosEvade(1, idOf(g, 1, ui));
    assert.equal(g.phase, 'PLAY');
    assert.ok(!g.pendingResponse?.active);
    assert.equal(g.players[1].health, 4);
});

test('Duel: nevyhnout se → duel začíná, cíl odpovídá BANG!em', () => {
    const g = mkV([{}, {}]);
    giveV(g, 1, 'Útěk');
    const di = give(g, 0, CardType.DUEL);
    g.playSpecialCard(0, 1, di);
    g.vosEvade(1, null);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.sourceCard, CardType.DUEL);
    assert.equal(g.pendingResponse.targetIdx, 1);
});

// ── Dodge City: oblast zvolená předem ────────────────────────────────────────

test('Krytý vůz: okno, a po odmítnutí se krádež rovnou vyřeší', () => {
    const g = mkV([{}, {}]);
    g.turnId = 5;
    const wagon = board(g, 0, CardType.COVERED_WAGON, { props: { green: true, activate: 'steal_any' } });
    wagon._playedTurn = 1;
    giveV(g, 1, 'Útěk');
    const mustang = board(g, 1, CardType.EQUIPMENT, { name: 'Mustang' });
    g.activateGreenCard(0, wagon.id, { targetIdx: 1, area: 'board', boardIdx: 0 });
    assert.equal(g.phase, 'EVADE_OFFER');
    assert.ok(g.pendingEvade.resume.pick);
    g.vosEvade(1, null);
    assert.equal(g.phase, 'PLAY');
    assert.ok(g.players[0].hand.some(c => c.id === mustang.id), 'Mustang ukraden');
});

// ── Lee Van Kliff a Zlatá horečka ────────────────────────────────────────────

test('opakování Paniky (Lee Van Kliff) se smí vyhnout, Komplic ze Zlaté horečky ne (R11)', () => {
    const g = mkV([{}, {}]);
    giveV(g, 1, 'Útěk');
    g.players[1].board.push(new Card(79990, 'Mustang', CardType.EQUIPMENT, Suits.HEARTS, '8'));
    g._repeatBrownEffect(0, { effect: 'PANIC', name: 'Panika!', suit: Suits.HEARTS }, 1);
    assert.equal(g.phase, 'EVADE_OFFER');

    const h = mkV([{}, {}]);
    giveV(h, 1, 'Útěk');
    h._repeatBrownEffect(0, { effect: 'CAT_BALOU', name: 'Komplic (Cat Balou)', suit: null, gear: true }, 1);
    assert.equal(h.phase, 'SELECTING_TARGET_CARD');

    const d = mkV([{}, {}]);
    giveV(d, 1, 'Útěk');
    d._repeatBrownEffect(0, { effect: 'DUEL', name: 'Komplic (Duel)', suit: null, gear: true }, 1);
    assert.equal(d.phase, 'RESPOND', 'duel z Komplice začíná hned');
});

// ── Mick Defender ────────────────────────────────────────────────────────────

test('Mick Defender: proti Panice smí uhnout kartou Vedle!', () => {
    const g = mkV([{}, { character: MICK }]);
    const mi = give(g, 1, CardType.MISSED);
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(g.phase, 'EVADE_OFFER');
    const missId = idOf(g, 1, mi);
    // Klient: Vedle! svítí a klik ji pošle jako únik.
    const me = g.players[1];
    assert.equal(cardPlayability(g, me, 1, me.hand[0]), true);
    assert.equal(decideCardClick({ state: g, me, myIndex: 1, selectedState: { cardIndex: null }, card: me.hand[0],
                                   index: 0, blockInput: false, isMySidActive: false, playable: true }).type, 'VOS_EVADE');
    g.vosEvade(1, missId);
    assert.equal(g.phase, 'PLAY');
    assert.ok(inDiscard(g, missId));
});

test('Mick Defender bez karty Vedle! okno nedostane; Big Spencer jako Mick taky ne', () => {
    const g = mkV([{}, { character: MICK }]);
    give(g, 1, CardType.BANG);
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(g.phase, 'SELECTING_TARGET_CARD');

    const h = mkV([{}, { character: MICK }]);
    h.players[1]._greygoryChars = [MICK, 'Big Spencer'];
    h.players[1].character = 'Greygory Deck';
    give(h, 1, CardType.MISSED);
    assert.deepEqual(V.evadeOptions(h, 1), [], 'Big Spencer nesmí hrát karty Vedle!');
});

test('Mick Defender proti kartě BANG! žádné okno – brání se normálně', () => {
    const g = mkV([{}, { character: MICK }]);
    give(g, 1, CardType.MISSED);
    const bi = give(g, 0, CardType.BANG);
    g.playBang(0, 1, bi);
    assert.equal(g.phase, 'RESPOND');
});

test('Mick zahraje Úhyb jako Vedle! → líznutí k němu patří', () => {
    const g = mkV([{}, { character: MICK }]);
    const ui = give(g, 1, CardType.UHYB, { props: { draw: 1 } });
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    g.vosEvade(1, idOf(g, 1, ui));
    assert.equal(g.phase, 'UHYB_DRAW');
    assert.equal(pendingActor(g).idx, 1);
});

// ── Útěk jako odpověď na bang-efekt ──────────────────────────────────────────

test('Útěk proti Tomahawku: vyhne se celému efektu, Opětovná palba nic', () => {
    const g = mkV([{}, {}]);
    const ti = giveV(g, 0, 'Tomahawk');
    const ui = giveV(g, 1, 'Útěk');
    g.playBang(0, 1, ti);
    assert.equal(g.phase, 'RESPOND');
    const me = g.players[1];
    assert.equal(cardPlayability(g, me, 1, me.hand[ui]), true);
    g.handleResponse(1, ui);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[1].hand.length, 0);
    assert.ok(!(g._vosShots || []).length);
});

test('Útěk proti kartě BANG! neplatí (ani v obraně)', () => {
    const g = mkV([{}, {}]);
    const bi = give(g, 0, CardType.BANG);
    const ui = giveV(g, 1, 'Útěk');
    g.playBang(0, 1, bi);
    const me = g.players[1];
    assert.equal(cardPlayability(g, me, 1, me.hand[ui]), false);
    g.handleResponse(1, ui);
    assert.equal(g.phase, 'RESPOND', 'server Útěk odmítl');
    assert.equal(g.players[1].hand.length, 1);
});

test('Útěk proti Roztříštěné kulce: s jedním cílem ano, se dvěma ne', () => {
    // Jeden cíl (nikdo nemá souseda ve vzdálenosti 1 – ve dvou hráčích kromě střelce).
    const g = mkV([{}, {}]);
    const fi = giveV(g, 0, 'Roztříštěná kulka');
    giveV(g, 1, 'Útěk');
    assert.ok(g.playFanning(0, fi, 1, null));
    assert.ok(V.escapeRespondOk(g, 1, g.players[1].hand[0]));

    const h = mkV([{}, {}, {}]);
    const hi = giveV(h, 0, 'Roztříštěná kulka');
    giveV(h, 1, 'Útěk');
    assert.ok(h.playFanning(0, hi, 1, 2));
    assert.equal(V.escapeRespondOk(h, 1, h.players[1].hand[0]), false);
});

test('Útěk proti schopnostem (Evelyn Shebang, Doc Holyday) neplatí – nejsou to karty', () => {
    const g = mkV([{}, {}]);
    giveV(g, 1, 'Útěk');
    g._vosQueueShot(0, 1, 'EVELYN', 'Evelyn Shebang');
    assert.ok(g._drainVosShots());
    assert.equal(g.phase, 'RESPOND');
    assert.equal(V.escapeRespondOk(g, 1, g.players[1].hand[0]), false);

    const h = mkV([{ character: 'Doc Holyday' }, {}]);
    give(h, 0, CardType.BEER); give(h, 0, CardType.BEER);
    giveV(h, 1, 'Útěk');
    h.useDocHolyday(0, [0, 1], 1);
    assert.equal(h.phase, 'RESPOND');
    assert.equal(V.escapeRespondOk(h, 1, h.players[1].hand[0]), false);
});

// ── Molly Stark, Suzy Lafayette, Roubík ──────────────────────────────────────

test('R13: Molly Stark si za Útěk mimo tah lízne', () => {
    const g = mkV([{}, { character: 'Molly Stark' }]);
    const ui = giveV(g, 1, 'Útěk');
    give(g, 1, CardType.BANG);
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    g.vosEvade(1, idOf(g, 1, ui));
    assert.equal(g.phase, 'DRAW', 'líže za kartu zahranou mimo tah');
    assert.equal(g.drawPhaseState.playerIdx, 1);
});

test('Suzy Lafayette zahrála poslední kartu (Paniku) → lízne si až po rozhodnutí cíle', () => {
    const g = mkV([{ character: 'Suzy Lafayette' }, {}]);
    const ui = giveV(g, 1, 'Útěk');
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(g.phase, 'EVADE_OFFER', 'fronta stojí, Suzy čeká');
    g.vosEvade(1, idOf(g, 1, ui));
    assert.equal(g.phase, 'SUZY_DRAW');
});

test('Roubík okno úniku nepřeruší', () => {
    const g = mkV([{}, {}]);
    giveV(g, 1, 'Útěk');
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(g._gagCalm(0), false);
});

// ── Bot ──────────────────────────────────────────────────────────────────────

test('bot: Vězení se vyhne Útěkem, odmítnout jde vždycky', () => {
    const g = mkV([{ role: 'Sheriff' }, {}]);
    const ui = giveV(g, 1, 'Útěk');
    const ji = give(g, 0, CardType.JAIL);
    g.playSpecialCard(0, 1, ji);
    const a = decideBotAction(g, 1, null);
    assert.equal(a.event, 'vos_evade');
    assert.equal(a.payload.cardId, idOf(g, 1, ui));
});

test('bot: Mick šetří jedinou kartu Vedle! – Panice se jí nevyhne, Vězení ano', () => {
    const g = mkV([{}, { character: MICK }]);
    give(g, 1, CardType.MISSED);
    board(g, 1, CardType.EQUIPMENT, { name: 'Mustang' });
    const pi = give(g, 0, CardType.PANIC);
    g.playSpecialCard(0, 1, pi);
    assert.equal(decideBotAction(g, 1, null).payload.cardId, null);

    const h = mkV([{ role: 'Sheriff' }, { character: MICK }]);
    give(h, 1, CardType.MISSED);
    const ji = give(h, 0, CardType.JAIL);
    h.playSpecialCard(0, 1, ji);
    assert.equal(decideBotAction(h, 1, null).payload.cardId, idOf(h, 1, 0));
});

test('bot: Útěk proti bang-efektu použije, když nemá Vedle!', () => {
    const g = mkV([{}, {}]);
    const ti = giveV(g, 0, 'Tomahawk');
    giveV(g, 1, 'Útěk');
    g.playBang(0, 1, ti);
    const a = decideBotAction(g, 1, null);
    assert.equal(a.event, 'respond_to_card');
    assert.equal(a.payload.cardIndex, 0);
});

// ── Duch pod Právem západu (oprava F5) ───────────────────────────────────────

test('Duch pod Právem západu: vynucený BANG! bez jiného cíle ho v tahu nedrží', () => {
    // Duch (0), vyřazený (1) a soupeř s Mustangem (2) – na toho Colt nedosáhne.
    const g = mkV([{ health: 0 }, { health: 0 }, {}]);
    g.activeFistful = ffData.find(c => c.key === 'PRAVO_ZAPADU');
    const p = g.players[0];
    boardV(g, 0, 'Duch');
    g.players[2].board.push(new Card(79991, 'Mustang', CardType.EQUIPMENT, Suits.HEARTS, '8', { effect: 'mustang' }));
    const bi = give(g, 0, CardType.BANG);
    p._lawCardId = p.hand[bi].id;
    assert.equal(lawForcedCard(g, p, 0), null, 'na sebe Duch střílet nemůže');
    assert.notEqual(decideBotAction(g, 0, null).event, 'play_bang');
});

// ── Strukturální test: kdo zakládá výběr karty soupeře ───────────────────────
// Každá karta na JEDINÝ cíl musí do SELECTING_TARGET_CARD přes _enterTargetSelection,
// jinak by se jí cíl nemohl vyhnout (Útěk, Mick Defender). Napřímo smí fázi založit jen
// hromadné výběry a pokračování po odmítnutém úniku.
test('SELECTING_TARGET_CARD zakládá jen _enterTargetSelection (+ hromadné výběry)', () => {
    const ALLOWED = new Set(['_enterTargetSelection', '_evadeContinue',
                             '_advanceBrawl', '_nextVultureSplitPick', '_advanceDaltons']);
    const dir = path.join(__dirname, '..', 'logic');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));
    files.push(path.join(__dirname, '..', 'logic.js'));
    const bad = [];
    for (const f of files) {
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        let fn = null;
        lines.forEach((l, i) => {
            const m = l.match(/^ {4}(\w+)\s*\([^)]*\)\s*\{\s*$/);
            if (m) fn = m[1];
            if (/phase\s*=\s*["']SELECTING_TARGET_CARD["']/.test(l) && !ALLOWED.has(fn)) {
                bad.push(`${path.basename(f)}:${i + 1} (${fn})`);
            }
        });
    }
    assert.deepEqual(bad, []);
});
