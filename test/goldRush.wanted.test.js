// Rozšíření Zlatá horečka (Gold Rush) – fáze 5: WANTED.
//
//   „Zahraj na libovolného hráče. Kdo toho hráče vyřadí, lízne si 2 karty
//    a vezme si 1 valoun."
//
// Jediné černé vybavení, které po zaplacení NESKONČÍ před kupujícím – cíl se vybírá
// stejnou fází jako u Panáku (GEAR_TARGET), a to i na sebe (FAQ Q07).
//
// Podklad: docs/zlata-horecka.md (Karty vybavení, dodatek k WANTED, FAQ Q07 „kdy se hraje
// koupené Wanted", Q10 „jen cizí vybavení") a plán §4 (pořadí uvnitř handlePlayerDeath)
// s rozhodnutími R9 (Soudce), R10 (Laso / Belle Star) a R15 (i na sebe).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, CardType, Suits } = require('./_helpers.js');
const GR = require('../core/goldRush.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { waitingStatus } = require('../core/pending.js');

before(() => { console.log = () => {}; });

const gearData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8')
);
const ffData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.fistful.json'), 'utf8')
);
const ZH_ON = { expansions: { zlata_horecka: true } };

// 4 hráči, 0 je šerif na tahu.
function mkZH(specs, opts = {}) {
    const g = mkGame(specs || [{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }], opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    g.turnId = 1;
    return g;
}

let _gid = 67000;
function gearCard(effect) {
    const kind = gearData.find(k => k.effect === effect);
    return { id: _gid++, effect, name: kind.name, art: kind.art,
             border: kind.border, cost: kind.cost, text: kind.text };
}
function shop(g, effects) {
    g.gearRow = effects.map(e => (e ? gearCard(e) : null));
    g.gearDeck = [];
    g.gearPile = [];
}
function gear(g, idx, effect) {
    const c = gearCard(effect);
    g.players[idx].gear.push(c);
    return c;
}
// Balíček s danými kartami; draw() popuje z KONCE pole.
function stackDeck(g, n) {
    g.deck.cards = [];
    for (let k = 0; k < n; k++) g.deck.cards.push(mkCard(CardType.BANG, { id: 90000 + k }));
    g.deck.discardPile = [];
}

// ── Nákup a vyložení ─────────────────────────────────────────────────────────

test('Wanted: nákup otevře volbu cíle a karta skončí před VYBRANÝM hráčem, ne před kupujícím', () => {
    const g = mkZH();
    shop(g, ['ZH_WANTED']);
    g.players[0].nuggets = 5;

    const bought = g.gearBuy(0, 0);
    assert.equal(bought.effect, 'ZH_WANTED');
    assert.equal(g.players[0].nuggets, 3, 'Wanted stojí 2');
    assert.equal(g.phase, 'GEAR_TARGET');
    assert.deepEqual(g.pendingGearTarget.targets, [0, 1, 2, 3], 'na libovolného hráče, i na sebe');
    assert.ok(g.pendingGearTarget.card, 'kartu do vyložení drží pending');
    assert.equal(g.players[0].gear.length, 0, 'před kupujícího zatím nic nešlo');

    assert.equal(g.resolveGearTarget(0, 2), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[2].gear.length, 1);
    assert.equal(g.players[2].gear[0].effect, 'ZH_WANTED');
    assert.equal(g.players[0].gear.length, 0);
});

test('Wanted: FAQ Q07 – smí se vyložit i před sebe', () => {
    const g = mkZH();
    shop(g, ['ZH_WANTED']);
    g.players[0].nuggets = 5;
    g.gearBuy(0, 0);
    assert.equal(g.resolveGearTarget(0, 0), true);
    assert.equal(g.players[0].gear[0].effect, 'ZH_WANTED');
});

test('Wanted: „ne dvě stejného" se měří na CÍLI – hráč s Wanted před sebou si další koupit smí', () => {
    const g = mkZH();
    shop(g, ['ZH_WANTED']);
    gear(g, 0, 'ZH_WANTED');          // kupující už jedno před sebou má
    g.players[0].nuggets = 5;

    assert.equal(GR.gearBuyReason(g, 0, 0), null, 'vlastní stůl nákup neblokuje');
    assert.ok(g.gearBuy(0, 0), 'a server to vidí stejně');
    assert.deepEqual(g.pendingGearTarget.targets, [1, 2, 3], 'jen ti, kdo ho ještě nemají');
    assert.equal(g.resolveGearTarget(0, 0), false, 'sám sebe už vybrat nesmí');
});

test('Wanted: bez volného cíle se nedá koupit (a nic se nezaplatí)', () => {
    const g = mkZH();
    shop(g, ['ZH_WANTED']);
    [0, 1, 2, 3].forEach(i => gear(g, i, 'ZH_WANTED'));
    g.players[0].nuggets = 5;

    assert.equal(GR.gearBuyReason(g, 0, 0), 'tohle vybavení už mají všichni');
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.players[0].nuggets, 5);
    assert.ok(g.gearRow[0], 'karta zůstala v obchodě');
});

test('Wanted: mrtvý hráč není platný cíl', () => {
    const g = mkZH();
    shop(g, ['ZH_WANTED']);
    g.players[2].health = 0;
    g.players[0].nuggets = 5;
    g.gearBuy(0, 0);
    assert.deepEqual(g.pendingGearTarget.targets, [0, 1, 3]);
});

test('Wanted: cíl mezitím odešel ze hry → zaplacená karta jde pod balíček vybavení, hra běží dál', () => {
    const g = mkZH();
    shop(g, ['ZH_WANTED']);
    g.players[0].nuggets = 5;
    g.gearBuy(0, 0);
    g.players[2].health = 0;                       // pokuta Roubíku volbu přerušila

    assert.equal(g.resolveGearTarget(0, 2), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[2].gear.length, 0);
    assert.ok(g.gearPile.some(c => c.effect === 'ZH_WANTED'), 'karta se neztratila');
});

test('Wanted: Soudce (Fistful) zakazuje nákup jako u každé černé karty (R9)', () => {
    const g = mkZH();
    g.ffCardData = ffData;
    g._setupFistfulDeck({ expansions: { fistful: true } });
    g.activeFistful = { key: 'SOUDCE', name: 'Soudce' };
    shop(g, ['ZH_WANTED']);
    g.players[0].nuggets = 5;

    assert.equal(GR.gearBuyReason(g, 0, 0), 'Soudce zakazuje vykládat karty');
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.players[0].nuggets, 5);
});

// ── Odměna za vyřazení ───────────────────────────────────────────────────────

// Na místě 1 sedí odpadlík, ne bandita – ať je v odměně vidět jen Wanted.
const NO_BOUNTY = [{ role: 'Sheriff' }, { role: 'Renegade' }, { role: 'Outlaw' }, { role: 'Outlaw' }];

test('Wanted: kdo majitele vyřadí, dostane 1 valoun a frontu na 2 karty', () => {
    const g = mkZH(NO_BOUNTY);
    gear(g, 1, 'ZH_WANTED');
    stackDeck(g, 10);
    g.players[1].health = 1;

    g.handlePlayerDeath(1, 0);
    assert.equal(g.players[0].nuggets, 1, 'valoun hned');
    const rewards = g.specialActionQueue.filter(a => a.type === 'KILL_REWARD');
    assert.equal(rewards.length, 1);
    assert.deepEqual(rewards[0], { type: 'KILL_REWARD', playerIdx: 0, cardsNeeded: 2 });
});

test('Wanted: na banditovi se odměny SČÍTAJÍ – 2 + 3 karty a 1 + 1 valoun', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    gear(g, 1, 'ZH_WANTED');
    stackDeck(g, 10);
    g.players[1].health = 1;
    g.players[0].nuggets = 1;         // valoun za způsobené zranění už má

    g.handlePlayerDeath(1, 0);
    assert.equal(g.players[0].nuggets, 2, '1 (za zranění) + 1 (Wanted)');
    const drawn = g.specialActionQueue
        .filter(a => a.type === 'KILL_REWARD' && a.playerIdx === 0)
        .map(a => a.cardsNeeded);
    assert.deepEqual(drawn, [3, 2], 'odměna za banditu a k ní Wanted – dvě fáze, 5 karet');
});

test('Wanted: bez vyřazovatele (dynamit) se nevyplácí nic', () => {
    const g = mkZH();
    gear(g, 1, 'ZH_WANTED');
    stackDeck(g, 10);
    g.players[1].health = 0;

    g.handlePlayerDeath(1, null);
    assert.equal(g.specialActionQueue.filter(a => a.type === 'KILL_REWARD').length, 0);
    assert.deepEqual(g.players.map(p => p.nuggets || 0), [0, 0, 0, 0]);
});

test('Wanted: šerif za pomocníka – valoun si ponechá, ale 2 karty odejdou s celou rukou', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    gear(g, 1, 'ZH_WANTED');
    stackDeck(g, 10);
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BEER);
    g.players[1].health = 0;

    const deckBefore = g.deck._drawPile.length;
    g.handlePlayerDeath(1, 0);

    assert.equal(g.players[0].nuggets, 1, '„zlato si ponechá"');
    assert.equal(g.players[0].hand.length, 0, 'celá ruka pryč');
    assert.equal(g.specialActionQueue.filter(a => a.type === 'KILL_REWARD' && a.playerIdx === 0).length, 0,
                 'karty se nesmí líznout až PO pokutě – hráč by si je nechal');
    assert.equal(g.deck._drawPile.length, deckBefore - 2,
                 '„nejprve si vezme 2 karty a teprve pak odhodí celou ruku" = 2 karty z balíčku do odhozu');
});

test('Wanted: Laso (Fistful) vybavení vypíná, takže odměna nepadne (R10)', () => {
    const g = mkZH(NO_BOUNTY);
    g.ffCardData = ffData;
    g._setupFistfulDeck({ expansions: { fistful: true } });
    g.activeFistful = { key: 'LASO', name: 'Laso' };
    gear(g, 1, 'ZH_WANTED');
    stackDeck(g, 10);
    g.players[1].health = 0;

    g.handlePlayerDeath(1, 0);
    assert.equal(g.players[0].nuggets || 0, 0);
    assert.equal(g.specialActionQueue.filter(a => a.type === 'KILL_REWARD').length, 0);
});

test('Wanted: vyřazením jde karta pod balíček vybavení jako každé jiné', () => {
    const g = mkZH();
    gear(g, 1, 'ZH_WANTED');
    stackDeck(g, 10);
    g.players[1].health = 0;

    g.handlePlayerDeath(1, 0);
    assert.equal(g.players[1].gear.length, 0);
    assert.ok(g.gearPile.some(c => c.effect === 'ZH_WANTED'));
});

// ── Popisek čekání a bot ─────────────────────────────────────────────────────

test('Wanted: popisek čekání neříká „komu vybavení pomůže"', () => {
    const g = mkZH();
    shop(g, ['ZH_WANTED']);
    g.players[0].nuggets = 5;
    g.gearBuy(0, 0);

    const st = waitingStatus(JSON.parse(JSON.stringify(g)));
    assert.equal(st.idx, 0);
    assert.equal(st.text, 'Wanted – vybírá, na koho ho zahraje');
});

test('Wanted: bot si ho koupí jen když je na koho, a pověsí ho na nepřítele – nikdy na sebe', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Outlaw' }]);
    shop(g, ['ZH_WANTED']);
    g.players[0].nuggets = 5;
    give(g, 0, CardType.BEER);
    // Banditi jsou pro šerifa jistí nepřátelé, jen je ještě nezná – ledger zatím mlčí,
    // takže se rozhoduje z rozdělení rolí (šerif + 3 bandité).
    const beliefs = [null, null, null, null].map((_, i) => ({
        Sheriff: i === 0 ? 1 : 0, Outlaw: i === 0 ? 0 : 1, Deputy: 0, Renegade: 0,
    }));

    const buy = decideBotAction(g, 0, beliefs);
    assert.equal(buy.event, 'gear_buy');
    assert.equal(buy.payload.rowIdx, 0);

    g.gearBuy(0, 0);
    assert.equal(g.phase, 'GEAR_TARGET');
    const pick = decideBotAction(g, 0, beliefs);
    assert.equal(pick.event, 'gear_target');
    assert.notEqual(pick.payload.targetIdx, 0, 'na vlastní hlavu odměnu nevypisuje');
    assert.ok(g.pendingGearTarget.targets.includes(pick.payload.targetIdx));
});

test('Wanted: bez nepřítele v nabídce ho bot nekupuje', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Deputy' }, { role: 'Deputy' }]);
    shop(g, ['ZH_WANTED']);
    g.players[0].nuggets = 5;
    const beliefs = [0, 1, 2, 3].map(i => ({
        Sheriff: i === 0 ? 1 : 0, Deputy: i === 0 ? 0 : 1, Outlaw: 0, Renegade: 0,
    }));

    const act = decideBotAction(g, 0, beliefs);
    assert.notEqual(act?.event, 'gear_buy', 'odměna na spojenci by pomohla protistraně');
});

test('Wanted: všech 15 druhů vybavení se rozdává do balíčku (GEAR_READY je úplný)', () => {
    const g = mkZH();
    const kinds = new Set([...g.gearDeck, ...g.gearRow.filter(Boolean)].map(c => c.effect));
    assert.equal(kinds.size, gearData.length, 'žádný druh nezůstal mimo hru');
    assert.ok(kinds.has('ZH_WANTED'));
});
