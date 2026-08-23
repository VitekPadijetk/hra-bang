// Rozšíření A Fistful of Cards – nové způsoby, jak zahrát Bang!.
//   Odstřelovač     – 2 karty Bang! naráz, ubránit se lze JEN dvěma kartami Vedle!,
//   Odražená střela – Bang! proti kartě vyložené před soupeřem (ta se odhodí).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { pendingActor, describePendingResponse } = require('../core/pending.js');
const { cardPlayability, sniperOffer, ricochetOffer, ricochetTargetOk,
        ricochetAvailable, bangCardFromHand, bangAtPlayerOk } = require('../core/playability.js');
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

const bang = (g, i, o = {}) => give(g, i, CardType.BANG, { name: 'Bang!', ...o });
const miss = (g, i, o = {}) => give(g, i, CardType.MISSED, { name: 'Vedle!', ...o });
const weapon = (g, i, name, range) => {
    g.players[i].weapon = mkCard(CardType.WEAPON, { name, props: { range } });
    g.players[i].weapon.range = range;
    return g.players[i].weapon;
};

// ── Odstřelovač: nabídka ─────────────────────────────────────────────────────

test('Odstřelovač: nabídne se jen s aktivní událostí a druhou kartou Bang! v ruce', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), true);

    // jen jedna karta Bang! → není čím zaplatit
    g.players[0].hand.pop();
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), false);

    // bez události nic
    g.players[0].hand.push(mkCard(CardType.BANG, { name: 'Bang!' }));
    g.activeFistful = null;
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), false);
});

test('Odstřelovač: nabízí se jen ve svém tahu a jen na kartu Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    const beerIdx = give(g, 0, CardType.BEER, { name: 'Pivo' });
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[beerIdx]), false);
    // cizí hráč (není na tahu)
    bang(g, 1); bang(g, 1);
    assert.equal(sniperOffer(g, g.players[1], 1, g.players[1].hand[0]), false);
});

test('Odstřelovač: Calamity Janet smí použít i kartu Vedle!', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Calamity Janet' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); miss(g, 0);
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), true);
    assert.equal(bangCardFromHand(g, g.players[0], 0, g.players[0].hand[1]), true);
});

test('Odstřelovač: Kazatel (High Noon) ho zakazuje – je to zahrání karty Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    g.activeEvent = hn('KAZATEL');
    bang(g, 0); bang(g, 0);
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), false);
});

// ── Odstřelovač: průběh ──────────────────────────────────────────────────────

test('Odstřelovač: cíl → cena → útok, který jde odrazit jen dvěma Vedle!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    g.startSniper(0, 1);
    assert.equal(g.phase, 'DISCARD_ANOTHER');
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'DISCARD_ANOTHER' });
    assert.equal(g.pendingDiscardAnother.effect, 'sniper');

    g.discardAnotherCard(0, 1);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 1);
    assert.equal(g.missesRequired, 2);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.deck.discardPile.length, 2);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1, 'počítá se jako jedno zahrání Bang!');
    assert.equal(describePendingResponse(g, 1).need, '2× Vedle!');
});

test('Odstřelovač: jedno Vedle! nestačí, dvě uhnou', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    miss(g, 1); miss(g, 1);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);

    g.handleResponse(1, 0);
    assert.equal(g.phase, 'RESPOND', 'po prvním Vedle! se pořád čeká');
    assert.equal(g.players[1].health, 4);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4, 'dvě Vedle! zásah odvrátila');
});

test('Odstřelovač: bez druhého Vedle! hráč schytá zásah', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    miss(g, 1);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    g.handleResponse(1, 0);          // jediné Vedle!
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, null);       // schytat
    assert.equal(g.players[1].health, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Odstřelovač: Barel ani Jourdonnais nepomůžou (R4)', () => {
    const g = mkEv([{ role: 'Sheriff' }, { character: 'Jourdonnais' }, {}], 'ODSTRELOVAC');
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0); bang(g, 0);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    assert.equal(g.phase, 'RESPOND', 'žádné sejmutí na barel – rovnou obrana');
    assert.equal(g.missesRequired, 2);
});

test('Odstřelovač: limit 1× Bang!/tah platí (podruhé už se nenabídne)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0); bang(g, 0); bang(g, 0);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    g.handleResponse(1, null);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), false);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), false);
});

test('Odstřelovač: cenou musí být druhá karta Bang! – jiná karta se ignoruje', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    give(g, 0, CardType.BEER, { name: 'Pivo' });
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 2);          // Pivo
    assert.equal(g.phase, 'DISCARD_ANOTHER', 'neplatná cena nic nespotřebuje');
    assert.equal(g.players[0].hand.length, 3);
    g.discardAnotherCard(0, 1);          // druhý Bang!
    assert.equal(g.phase, 'RESPOND');
});

test('Odstřelovač: mimo dostřel se cíl zvolit nedá', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    assert.equal(g.getDistance(0, 2), 2);
    g.startSniper(0, 2);
    assert.equal(g.phase, 'PLAY', 'Colt .45 na vzdálenost 2 nedosáhne');
});

test('Odstřelovač: Apache Kida mine jen tehdy, když jsou kárové OBĚ karty', () => {
    const g1 = mkEv([{ role: 'Sheriff' }, { character: 'Apache Kid' }, {}], 'ODSTRELOVAC');
    bang(g1, 0, { suit: Suits.DIAMONDS }); bang(g1, 0, { suit: Suits.DIAMONDS });
    g1.startSniper(0, 1);
    g1.discardAnotherCard(0, 1);
    assert.equal(g1.phase, 'PLAY', 'obě káry → útok naprázdno');

    const g2 = mkEv([{ role: 'Sheriff' }, { character: 'Apache Kid' }, {}], 'ODSTRELOVAC');
    bang(g2, 0, { suit: Suits.DIAMONDS }); bang(g2, 0, { suit: Suits.SPADES });
    g2.startSniper(0, 1);
    g2.discardAnotherCard(0, 1);
    assert.equal(g2.phase, 'RESPOND', 'jen jedna kára → útok dopadne');
});

test('Odstřelovač: Želízka (High Noon) pustí jen karty zvolené barvy', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    g.activeEvent = hn('ZELIZKA');
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    bang(g, 0, { suit: Suits.HEARTS });
    bang(g, 0, { suit: Suits.SPADES });
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), false,
        'druhá karta Bang! je jiné barvy → není čím zaplatit');
    bang(g, 0, { suit: Suits.HEARTS });
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), true);
});

// ── Odražená střela: nabídka a cíle ──────────────────────────────────────────

test('Odražená střela: karta Bang! zůstává hratelná i s vyčerpaným limitem (R2)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0);
    g.players[0].bangsPlayedThisTurn = 1;
    assert.equal(ricochetAvailable(g, g.players[0], 0), true);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), true);
    assert.equal(bangAtPlayerOk(g, g.players[0], 0, g.players[0].hand[0]), false,
        'na POSTAVU se s vyčerpaným limitem střílet nedá');
});

test('Odražená střela: bez vyložené karty v dostřelu není na co střílet', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    bang(g, 0);
    g.players[0].bangsPlayedThisTurn = 1;
    assert.equal(ricochetAvailable(g, g.players[0], 0), false);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), false);
});

test('Odražená střela: dostřel platí (R1) a na vlastní karty se nestřílí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'ODRAZENA_STRELA');
    board(g, 2, CardType.BARREL, { name: 'Barel' });
    assert.equal(ricochetTargetOk(g, 0, 2), false, 'vzdálenost 2, Colt .45 nedosáhne');
    assert.equal(ricochetTargetOk(g, 0, 0), false, 'na sebe ne');
    weapon(g, 0, 'Remington', 3);
    assert.equal(ricochetTargetOk(g, 0, 2), true);
});

// ── Odražená střela: průběh ──────────────────────────────────────────────────

test('Odražená střela: neubráněná karta jde do odhozu', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    bang(g, 0);
    g.playRicochet(0, 1, 'board', scope.id, 0);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.ricochet.cardId, scope.id);
    assert.equal(g.players[0].bangsPlayedThisTurn, 0, 'do limitu se nepočítá (R2)');

    g.handleResponse(1, null);
    assert.equal(g.players[1].board.length, 0, 'karta je pryč');
    assert.equal(g.players[1].health, 4, 'život se nehýbe');
    assert.ok(g.deck.discardPile.some(c => c.id === scope.id));
    assert.equal(g.phase, 'PLAY');
});

test('Odražená střela: Vedle! kartu zachrání', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    bang(g, 0); miss(g, 1);
    g.playRicochet(0, 1, 'board', scope.id, 0);
    g.handleResponse(1, 0);
    assert.equal(g.players[1].board.length, 1, 'karta zůstala');
    assert.equal(g.phase, 'PLAY');
});

test('Odražená střela: Barel cíle může kartu zachránit (R3)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0);
    g.playRicochet(0, 1, 'board', scope.id, 0);
    assert.equal(g.phase, 'BARREL_DRAW');
    assert.equal(g.pendingBarrelCheck.ricochet.cardId, scope.id);
    topDeck(g, Suits.HEARTS);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'PLAY');
    assert.ok(g.players[1].board.some(c => c.id === scope.id), 'barel střelu odrazil');
});

test('Odražená střela: neúspěšný barel pošle výběr dál do obrany a karta padne', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0);
    g.playRicochet(0, 1, 'board', scope.id, 0);
    topDeck(g, Suits.SPADES);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.ricochet.cardId, scope.id);
    g.handleResponse(1, null);
    assert.equal(g.players[1].board.filter(c => c.id === scope.id).length, 0);
});

test('Odražená střela: proti Slabovi the Killer je potřeba 2× Vedle! (R3)', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Slab the Killer' }, {}, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    bang(g, 0); miss(g, 1);
    g.playRicochet(0, 1, 'board', scope.id, 0);
    assert.equal(g.missesRequired, 2);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'RESPOND', 'jedno Vedle! nestačí');
    g.handleResponse(1, null);
    assert.equal(g.players[1].board.length, 0);
});

test('Odražená střela: sestřelená zbraň se vrací na Colt .45', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const w = weapon(g, 1, 'Winchester', 5);
    bang(g, 0);
    g.playRicochet(0, 1, 'weapon', w.id, 0);
    g.handleResponse(1, null);
    assert.equal(g.players[1].weapon.id, -1);
    assert.equal(g.players[1].weapon.name, 'Colt .45');
    assert.ok(g.deck.discardPile.some(c => c.id === w.id));
});

test('Odražená střela: sestřelené Vězení hráče osvobodí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const jail = board(g, 1, CardType.JAIL, { name: 'Vězení' });
    bang(g, 0);
    g.playRicochet(0, 1, 'board', jail.id, 0);
    g.handleResponse(1, null);
    assert.equal(g.players[1].board.length, 0, 'vězení je pryč, tah se přeskakovat nebude');
});

test('Odražená střela: hlásí animaci board_to_discard se slotem karty', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    board(g, 1, CardType.EQUIPMENT, { name: 'Hledí', effect: 'scope' });
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    bang(g, 0);
    g.playRicochet(0, 1, 'board', scope.id, 0);
    g.handleResponse(1, null);
    assert.deepEqual(g.lastAnimEvent,
        { type: 'board_to_discard', fromPlayerIdx: 1, cardId: scope.id, boardIdx: 2 });
});

test('Odražená střela: Pivo ani Sid Ketchum kartu nezachrání', () => {
    const g = mkEv([{ role: 'Sheriff' }, { health: 1, character: 'Sid Ketchum' }, {}, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    bang(g, 0);
    const beerIdx = give(g, 1, CardType.BEER, { name: 'Pivo' });
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    g.playRicochet(0, 1, 'board', scope.id, 0);
    assert.equal(g.beerLastLifeSave(1, beerIdx), false);
    assert.equal(g.sidLastLifeSave(1, 0, 1), false);
    assert.equal(g.players[1].hand.length, 2, 'nic se neodhodilo');
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[beerIdx]), false);
});

test('Odražená střela: kárová na Apache Kida nemá efekt (R3)', () => {
    const g = mkEv([{ role: 'Sheriff' }, { character: 'Apache Kid' }, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    bang(g, 0, { suit: Suits.DIAMONDS });
    g.playRicochet(0, 1, 'board', scope.id, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].board.length, 1);
    assert.equal(g.players[0].hand.length, 0, 'karta se přesto odhodila');
});

test('Odražená střela: po ní jde v tomtéž tahu ještě normální Bang! (R2)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const scope = board(g, 1, CardType.EQUIPMENT, { name: 'Dalekohled', effect: 'scope' });
    bang(g, 0); bang(g, 0);
    g.playRicochet(0, 1, 'board', scope.id, 0);
    g.handleResponse(1, null);
    assert.equal(g.players[0].bangsPlayedThisTurn, 0);
    g.playBang(0, 1, 0);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
});

test('Odražená střela: bez události se nic nestane', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    const barrel = board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0);
    g.playRicochet(0, 1, 'board', barrel.id, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.players[1].board.length, 1);
});

test('Odražená střela: Laso (Fistful) hraje současně – dostřel klesne na 1', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'ODRAZENA_STRELA');
    weapon(g, 0, 'Remington', 3);
    assert.equal(ricochetTargetOk(g, 0, 2), true);
    g.activeEvent = hn('LASO') || { key: 'LASO' };
    assert.equal(ricochetTargetOk(g, 0, 2), false, 'zbraň na stole nemá efekt');
});

// ── Zrcadla pro bota ─────────────────────────────────────────────────────────

test('bot: Odstřelovače zaplatí druhou kartou Bang!, ne Pivem', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); give(g, 0, CardType.BEER, { name: 'Pivo' }); bang(g, 0);
    g.startSniper(0, 1);
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'discard_another_card');
    assert.equal(g.players[0].hand[act.payload.extraCardIdx].type, CardType.BANG);
});

test('bot: brání zbraň před Odraženou střelou, vězení nechá odletět', () => {
    const mk = (setup) => {
        const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
        const { area, id } = setup(g);
        bang(g, 0); miss(g, 1);
        g.playRicochet(0, 1, area, id, 0);
        assert.equal(g.phase, 'RESPOND');
        return JSON.parse(JSON.stringify(g));
    };
    const beliefs = { 0: { Sheriff: 1 }, 2: { Outlaw: 1 } };
    const defend = decideBotAction(mk(g => ({ area: 'weapon', id: weapon(g, 1, 'Winchester', 5).id })), 1, beliefs);
    assert.equal(defend.payload.cardIndex, 0, 'zbraň stojí za Vedle!');
    const giveUp = decideBotAction(mk(g => ({ area: 'board', id: board(g, 1, CardType.JAIL, { name: 'Vězení' }).id })), 1, beliefs);
    assert.equal(giveUp.payload.cardIndex, null, 'vězení ať klidně odletí');
});

test('bot: s vyčerpaným limitem sáhne po Odražené střele, ne po play_bang', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    const barrel = board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0);
    g.players[0].bangsPlayedThisTurn = 1;
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'play_ricochet');
    assert.equal(act.payload.cardId, barrel.id);
    assert.equal(act.payload.area, 'board');
});

test('bot: Odstřelovač na nepřítele s chudou rukou přebije obyčejný výstřel', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'sniper_choose');
    assert.equal(act.payload.targetIdx, 1);
});
