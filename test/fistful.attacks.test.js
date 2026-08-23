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
const { computeCanHit } = require('../core/distance.js');

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
    assert.equal(g.players[0].bangsPlayedThisTurn, 0, 'nepočítá se jako zahrání Bang! (FAQ Q07)');
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

test('Odstřelovač: Barel se počítá za jedno Vedle!, druhé musí hráč dohrát', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0); bang(g, 0);
    miss(g, 1);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    assert.equal(g.phase, 'BARREL_DRAW', 'sejmutí na barel proběhne');
    topDeck(g, Suits.HEARTS);   // barel uhne
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND', 'barel = jedno Vedle!, druhé se pořád čeká');
    assert.equal(g.missesRequired, 1);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4, 'barel + jedno Vedle! zásah odvrátily');
});

test('Odstřelovač: neúspěšný barel nechá obranu na dvou Vedle!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0); bang(g, 0);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    topDeck(g, Suits.SPADES);   // barel neuhne
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 2, 'útočník není Slab – dvojka musí přijít z karty');
});

test('Odstřelovač: Jourdonnais snímá dvakrát a úspěch mu ubere jedno Vedle!', () => {
    const g = mkEv([{ role: 'Sheriff' }, { character: 'Jourdonnais' }, {}], 'ODSTRELOVAC');
    board(g, 1, CardType.BARREL, { name: 'Barel' });
    bang(g, 0); bang(g, 0);
    topDeck(g, Suits.HEARTS);
    topDeck(g, Suits.SPADES);   // první sejmutí mine
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'BARREL_DRAW', 'Jourdonnais + Barel = dvě sejmutí');
    g.triggerBarrelDraw();
    g.resolveCheck();
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 1);
});

test('Odstřelovač: nepočítá se do limitu 1× Bang!/tah a jde opakovat (FAQ Q07)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0); bang(g, 0); bang(g, 0);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    g.handleResponse(1, null);
    assert.equal(g.players[0].bangsPlayedThisTurn, 0);
    // Druhý Odstřelovač ze zbylých dvou karet Bang!
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), true);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), true);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 2);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 2, 'dva odstřelovači = dva zásahy');
});

test('Odstřelovač: po něm jde v tomtéž tahu ještě normální Bang! (FAQ Q07)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0); bang(g, 0);
    g.startSniper(0, 1);
    g.discardAnotherCard(0, 1);
    g.handleResponse(1, null);
    assert.equal(g.players[0].bangsPlayedThisTurn, 0);
    g.playBang(0, 1, 0);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 1, 'obyčejný Bang! chce jen jedno Vedle!');
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
});

test('Odstřelovač: vyčerpaný limit Bang! ho nezakáže', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    bang(g, 0); bang(g, 0);
    g.players[0].bangsPlayedThisTurn = 1;
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), true);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), true);
    assert.equal(bangAtPlayerOk(g, g.players[0], 0, g.players[0].hand[0]), false,
        'klasicky na postavu už střílet nejde');
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

test('Odražená střela: bez vyložené karty u stolu není na co střílet', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    bang(g, 0);
    g.players[0].bangsPlayedThisTurn = 1;
    assert.equal(ricochetAvailable(g, g.players[0], 0), false);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), false);
});

test('Odražená střela: vzdálenost nehraje roli (FAQ Q15), na vlastní karty se nestřílí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'ODRAZENA_STRELA');
    board(g, 2, CardType.BARREL, { name: 'Barel' });
    // Colt .45 (dostřel 1) na vzdálenost 2 nedosáhne, Odražená střela přesto smí.
    assert.equal(computeCanHit(g, 0, 2), false, 'předpoklad: obyčejný Bang! by nedosáhl');
    assert.equal(ricochetTargetOk(g, 0, 2), true);
    assert.equal(ricochetTargetOk(g, 0, 0), false, 'na sebe ne');
});

test('Odražená střela: Skrýš ani Paul Regret cíl neochrání – dostřel se neřeší', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'ODRAZENA_STRELA');
    board(g, 2, CardType.EQUIPMENT, { name: 'Skrýš', effect: 'mustang' });
    g.players[2].character = 'Paul Regret';
    assert.equal(ricochetTargetOk(g, 0, 2), true);
    assert.equal(ricochetAvailable(g, g.players[0], 0), true);
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

test('Odražená střela: Laso (Fistful) hraje současně – cílení se nemění', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'ODRAZENA_STRELA');
    board(g, 2, CardType.BARREL, { name: 'Barel' });
    assert.equal(ricochetTargetOk(g, 0, 2), true);
    // Laso vypíná EFEKT vyložených karet, ale ve hře pořád leží → střílet na ně jde dál
    // (a dostřel stejně nikoho nezajímá).
    g.activeEvent = hn('LASO') || { key: 'LASO' };
    assert.equal(ricochetTargetOk(g, 0, 2), true, 'karta ve hře pořád leží');
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

// Právo západu je ze STEJNÉHO balíčku jako Odstřelovač i Odražená střela, takže naráz
// aktivní být nemůžou – obě následující dvojice se proto nastavují uměle (vynucená karta
// se dá do slotu High Noonu, `hasEvent` se ptá obou). Jde o pojistku invariantu „bot se
// nikdy nezasekne": s vyčerpaným limitem 1× Bang!/tah by `play_bang` server tiše zahodil,
// a kdyby to Právo západu vynucovalo, bot by ho posílal donekonečna.
test('bot: vynucená karta Bang! + vyčerpaný limit → Odstřelovač, ne odmítaný play_bang', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODSTRELOVAC');
    g.activeEvent = ff('PRAVO_ZAPADU');
    bang(g, 0); bang(g, 0);
    g.players[0].bangsPlayedThisTurn = 1;
    g.players[0]._lawCardId = g.players[0].hand[0].id;
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'sniper_choose', 'play_bang by server s vyčerpaným limitem zahodil');
    assert.equal(act.payload.cardIdx, 0);
});

test('bot: vynucená karta Bang! + vyčerpaný limit → Odražená střela i na kartu bez ceny', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ODRAZENA_STRELA');
    g.activeEvent = ff('PRAVO_ZAPADU');
    // Vězení si bot dobrovolně nesestřelí (pomohl by nepříteli), ale pravidlo ho nutí.
    const jail = board(g, 1, CardType.JAIL, { name: 'Vězení' });
    bang(g, 0);
    g.players[0].bangsPlayedThisTurn = 1;
    g.players[0]._lawCardId = g.players[0].hand[0].id;
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'play_ricochet');
    assert.equal(act.payload.cardId, jail.id);
});
