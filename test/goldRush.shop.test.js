// Rozšíření Zlatá horečka (Gold Rush) – fáze 1: obchod, nákup a Pivo za valoun.
//
// „Kupuje se z obchodu = 3 karty vybavení ležící lícem vzhůru vedle balíčku vybavení.
//  Cena je vytištěná na kartě. Hnědý rám → efekt se uplatní okamžitě a karta jde na
//  spodek balíčku lícem nahoru. Černý rám → karta zůstane ležet před hráčem. Koupená
//  karta se okamžitě nahradí novou. Počet nákupů není nijak omezený."
//
// Podklad: docs/zlata-horecka.md (Fáze 2: tři nové možnosti), plán §2.5 + rozhodnutí
// R6 (nákup není fáze), R7 (okamžité doplnění), R9 (Soudce) a R15 / FAQ Q10 (vlastní
// vybavení si zaplacením odhodit nejde).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, CardType, Suits } = require('./_helpers.js');
const GR = require('../core/goldRush.js');

before(() => { console.log = () => {}; });

const gearData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8')
);
const ZH_ON = { expansions: { zlata_horecka: true } };

function mkZH(n = 4, opts = {}) {
    const specs = [{ role: 'Sheriff' }];
    for (let i = 1; i < n; i++) specs.push({ role: i === n - 1 ? 'Renegade' : 'Outlaw' });
    const g = mkGame(specs, opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    return g;
}

// Kus vybavení daného druhu (stejný tvar, jaký staví `gearPieces` v logic/goldRush.js).
let _gid = 60000;
function gearCard(effect, over = {}) {
    const kind = gearData.find(k => k.effect === effect);
    return Object.assign({ id: _gid++, effect: kind.effect, name: kind.name, art: kind.art,
                           border: kind.border, cost: kind.cost, text: kind.text }, over);
}

// Obchod s přesně danými kartami (balíček zůstane, jaký byl, pokud se nepředá).
function shop(g, effects, deckEffects = []) {
    g.gearRow = effects.map(e => (e ? gearCard(e) : null));
    g.gearDeck = deckEffects.map(e => gearCard(e));
    g.gearPile = [];
    return g;
}

// ── Nákup ────────────────────────────────────────────────────────────────────

test('nákup černé karty ji položí před hráče a zaplatí se cena z karty', () => {
    const g = mkZH();
    shop(g, ['ZH_PODKOVA', 'ZH_BOTY', 'ZH_OPASEK'], ['ZH_KALUMET']);
    g.players[0].nuggets = 5;

    const bought = g.gearBuy(0, 0);
    assert.equal(bought.effect, 'ZH_PODKOVA');
    assert.equal(g.players[0].nuggets, 3);          // Podkova stojí 2
    assert.deepEqual(g.players[0].gear.map(c => c.effect), ['ZH_PODKOVA']);
    // Vybavení leží MIMO board/weapon (rozhodnutí R3) – Panika ani Cat Balou na něj nesmí.
    assert.deepEqual(g.players[0].board, []);
    assert.equal(g.phase, 'PLAY');
});

test('koupená karta se doplní OKAMŽITĚ (R7), ne až na konci tahu', () => {
    const g = mkZH();
    shop(g, ['ZH_PODKOVA', 'ZH_BOTY', 'ZH_OPASEK'], ['ZH_KALUMET']);
    g.players[0].nuggets = 5;
    g.gearBuy(0, 0);
    assert.equal(g.gearRow.filter(Boolean).length, 3, 'obchod je zase plný');
    assert.equal(g.gearRow[0].effect, 'ZH_KALUMET');
    assert.equal(g.gearDeck.length, 0);
});

test('bez valounů se nekupuje – stav se nezmění ani o kartu', () => {
    const g = mkZH();
    shop(g, ['ZH_KRUMPAC'], []);        // Krumpáč stojí 4
    g.players[0].nuggets = 3;
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.players[0].nuggets, 3);
    assert.deepEqual(g.players[0].gear, []);
    assert.equal(g.gearRow[0].effect, 'ZH_KRUMPAC');
});

test('dvě stejná černá vybavení mít nejde – a valouny se za pokus nestrhnou', () => {
    const g = mkZH();
    shop(g, ['ZH_PODKOVA'], []);
    g.players[0].nuggets = 9;
    g.players[0].gear = [gearCard('ZH_PODKOVA')];
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.players[0].nuggets, 9, 'neúspěšný nákup nesmí nic stát');
    assert.equal(g.players[0].gear.length, 1);
    // Pravidlo se ptá na `effect`, ne na jméno (R1) – jiný kus téhož druhu má jiné id.
    assert.equal(GR.gearBuyReason(g, 0, 0), 'tohle vybavení už máš');
});

test('kupovat smí jen hráč na tahu a jen ve fázi PLAY', () => {
    const g = mkZH();
    shop(g, ['ZH_PODKOVA'], []);
    g.players.forEach(p => { p.nuggets = 9; });
    assert.equal(g.gearBuy(1, 0), null, 'cizí hráč nekupuje');
    g.phase = 'DRAW';
    assert.equal(g.gearBuy(0, 0), null, 'mimo fázi PLAY se nekupuje');
});

// ── Balíček vybavení: odhozené jde POD balíček lícem vzhůru ──────────────────

test('použitá hnědá karta jde pod balíček a při vyčerpání se balíček zamíchá', () => {
    const g = mkZH(2);
    shop(g, ['ZH_PANAK', null, null], []);
    g.players[0].nuggets = 5;
    g.players[0].health = 1;            // ať má Panák koho léčit
    g.gearBuy(0, 0);
    // Panák je hnědý: efekt hned, karta na spodek balíčku (lícem vzhůru = veřejná).
    assert.equal(g.gearPile.length, 1);
    assert.equal(g.gearPile[0].effect, 'ZH_PANAK');
    assert.equal(g.gearDeck.length, 0);
    assert.deepEqual(g.gearRow, [null, null, null], 'není z čeho doplnit – slot zůstane prázdný');

    // Jakmile se má lízat a lícem dolů otočený balíček je prázdný, zamíchá se do něj
    // celá odhozená hromádka („na vrchu se objevila karta lícem vzhůru").
    g._gearRefill();
    assert.equal(g.gearRow.filter(Boolean).length, 1);
    assert.equal(g.gearPile.length, 0);
});

test('prázdný obchod je legální stav – nákup z prázdného slotu je no-op', () => {
    const g = mkZH();
    shop(g, [null, null, null], []);
    g.players[0].nuggets = 9;
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(g.players[0].nuggets, 9);
});

// ── Panák (hnědá karta s volbou cíle) ────────────────────────────────────────

test('Panák otevře volbu cíle a zvolenému hráči doplní 1 život', () => {
    const g = mkZH();
    shop(g, ['ZH_PANAK'], []);
    g.players[0].nuggets = 3;
    g.players[2].health = 1;
    g.gearBuy(0, 0);
    assert.equal(g.phase, 'GEAR_TARGET');
    assert.deepEqual(g.pendingGearTarget.targets, [2], 'nabízí se jen ten, komu je co léčit');

    assert.equal(g.resolveGearTarget(0, 2), true);
    assert.equal(g.players[2].health, 2);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingGearTarget, null);
});

test('Panák bez zraněného hráče efektem vyšumí, ale zaplatí se (fáze se nemění)', () => {
    const g = mkZH();
    shop(g, ['ZH_PANAK'], []);
    g.players[0].nuggets = 3;
    g.gearBuy(0, 0);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingGearTarget, null);
    assert.equal(g.players[0].nuggets, 2);
});

test('Panák léčí i toho, kdo ho koupil („i ty")', () => {
    const g = mkZH();
    shop(g, ['ZH_PANAK'], []);
    g.players[0].nuggets = 3;
    g.players[0].health = 2;
    g.gearBuy(0, 0);
    assert.ok(g.pendingGearTarget.targets.includes(0));
    g.resolveGearTarget(0, 0);
    assert.equal(g.players[0].health, 3);
});

test('cíl mimo nabídku se odmítne a fáze zůstane viset na volbě', () => {
    const g = mkZH();
    shop(g, ['ZH_PANAK'], []);
    g.players[0].nuggets = 3;
    g.players[2].health = 1;
    g.gearBuy(0, 0);
    assert.equal(g.resolveGearTarget(0, 1), false, 'hráč s plným životem v nabídce není');
    assert.equal(g.phase, 'GEAR_TARGET');
});

// ── Union Pacific ────────────────────────────────────────────────────────────

test('Union Pacific spustí lízání 4 karet (fáze DRAW, ne začátek tahu)', () => {
    const g = mkZH();
    shop(g, ['ZH_UNION_PACIFIC'], []);
    g.players[0].nuggets = 4;
    for (let i = 0; i < 6; i++) g.deck.cards.push(mkCard(CardType.BANG));
    g.gearBuy(0, 0);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 4);
    assert.equal(g.drawPhaseState.playerIdx, 0);
    assert.equal(g.drawPhaseState.isStartOfTurn, false);
    // Není to Dostavník ani Wells Fargo, takže NEOTÁČÍ kartu Divokého západu (FAQ Q16).
    assert.ok(!g.drawPhaseState.wwsFlip);

    for (let i = 0; i < 4; i++) g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 4);
    assert.equal(g.phase, 'PLAY');
});

// ── Vynucené odhození cizího vybavení ────────────────────────────────────────

test('vynucené odhození stojí cenu karty + 1 a vlastník se nebrání', () => {
    const g = mkZH();
    g.players[1].gear = [gearCard('ZH_PODKOVA')];   // cena 2 → odhození stojí 3
    g.players[0].nuggets = 4;
    const card = g.gearForceDiscard(0, 1, 0);
    assert.equal(card.effect, 'ZH_PODKOVA');
    assert.equal(g.players[0].nuggets, 1);
    assert.deepEqual(g.players[1].gear, []);
    assert.equal(g.gearPile.length, 1, 'karta jde pod balíček vybavení, ne do odhozu');
    assert.equal(g.deck.discardPile.length, 0);
});

test('vlastní vybavení si zaplacením odhodit nejde (FAQ Q10)', () => {
    const g = mkZH();
    g.players[0].gear = [gearCard('ZH_PODKOVA')];
    g.players[0].nuggets = 9;
    assert.equal(g.gearForceDiscard(0, 0, 0), null);
    assert.equal(g.players[0].gear.length, 1);
    assert.equal(g.players[0].nuggets, 9);
});

test('na vynucené odhození musí valouny stačit – jinak se nestane nic', () => {
    const g = mkZH();
    g.players[1].gear = [gearCard('ZH_KRUMPAC')];   // cena 4 → odhození stojí 5
    g.players[0].nuggets = 4;
    assert.equal(g.gearForceDiscard(0, 1, 0), null);
    assert.equal(g.players[1].gear.length, 1);
    assert.equal(g.players[0].nuggets, 4);
});

// ── Pivo za valoun ───────────────────────────────────────────────────────────

test('Pivo z ruky jde vyměnit za 1 valoun místo léčení', () => {
    const g = mkZH();
    g.players[0].nuggets = 0;
    g.players[0].health = 2;
    const i = give(g, 0, CardType.BEER);
    assert.ok(g.beerForNugget(0, i));
    assert.equal(g.players[0].nuggets, 1);
    assert.equal(g.players[0].health, 2, 'život se NEdoplňuje');
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(g.deck.discardPile.length, 1, 'Pivo je hrací karta → běžný odhoz');
});

test('Pivo za valoun jde i ve dvou hráčích (FAQ Q11)', () => {
    const g = mkZH(2);
    const i = give(g, 0, CardType.BEER);
    assert.ok(g.beerForNugget(0, i));
    assert.equal(g.players[0].nuggets, 1);
});

test('Tequila Joe dostane taky jen 1 valoun, ne 2 (FAQ Q15)', () => {
    const g = mkZH();
    g.players[0].character = 'Tequila Joe';
    const i = give(g, 0, CardType.BEER);
    g.beerForNugget(0, i);
    assert.equal(g.players[0].nuggets, 1);
});

test('Salón ani jiná karta se za valoun vyměnit nedá – jen Pivo', () => {
    const g = mkZH();
    const i = give(g, 0, CardType.SALOON);
    assert.equal(g.beerForNugget(0, i), null);
    assert.equal(g.players[0].nuggets, 0);
    assert.equal(g.players[0].hand.length, 1);
});

test('Reverend (High Noon) zakazuje i Pivo za valoun – je to zahrání Piva', () => {
    const g = mkZH();
    g.activeEvent = { key: 'REVEREND', name: 'Reverend' };
    const i = give(g, 0, CardType.BEER);
    assert.equal(g.beerForNugget(0, i), null);
    assert.equal(g.players[0].nuggets, 0);
});

// ── Soudce (A Fistful of Cards), rozhodnutí R9 ───────────────────────────────

test('Soudce blokuje nákup ČERNÉ karty (skončila by před hráčem), hnědou ne', () => {
    const g = mkZH();
    g.activeFistful = { key: 'SOUDCE', name: 'Soudce' };
    shop(g, ['ZH_PODKOVA', 'ZH_PANAK'], []);
    g.players[0].nuggets = 9;
    g.players[0].health = 1;
    assert.equal(g.gearBuy(0, 0), null, 'černý rám leží před hráčem → Soudce zakazuje');
    assert.equal(g.players[0].nuggets, 9);
    assert.ok(g.gearBuy(0, 1), 'hnědá se použije a jde pod balíček → projde');
});

// ── Vyřazení hráče ───────────────────────────────────────────────────────────

test('vybavení vyřazeného jde pod balíček vybavení a Vulture Sam ho nedostane', () => {
    const g = mkZH();
    g.players[1].character = 'Vulture Sam';
    g.players[2].gear = [gearCard('ZH_PODKOVA'), gearCard('ZH_BOTY')];
    give(g, 2, CardType.BANG);
    g.players[2].health = 0;
    g.handlePlayerDeath(2);
    assert.deepEqual(g.players[2].gear, []);
    assert.equal(g.gearPile.length, 2, 'obě karty leží pod balíčkem vybavení');
    // Sam si vzal jen ruku – vybavení se do jeho hrsti nemá jak dostat (R3).
    assert.equal(g.players[1].hand.length, 1);
    assert.ok(!g.players[1].hand.some(c => c.effect && c.effect.startsWith('ZH_')));
});

// ── Zrcadlo pro klienta a bota (core/goldRush.js) ────────────────────────────
// Server, klient i bot se MUSÍ ptát jedním predikátem: kdyby se rozešly, klient nabídne
// nákup, server ho mlčky odmítne a hra jen botů se zasekne na akci, co nic nemění.

test('gearBuyOk zrcadlí gearBuy ve všech důvodech odmítnutí', () => {
    const g = mkZH();
    shop(g, ['ZH_PODKOVA', 'ZH_KRUMPAC', 'ZH_PANAK'], []);
    g.players[0].nuggets = 2;
    assert.equal(GR.gearBuyOk(g, 0, 0), true, 'na Podkovu (2) valouny stačí');
    assert.equal(GR.gearBuyOk(g, 0, 1), false);
    assert.equal(GR.gearBuyReason(g, 0, 1), 'málo valounů');
    assert.equal(GR.gearBuyOk(g, 1, 0), false);
    assert.equal(GR.gearBuyReason(g, 1, 0), 'není tvůj tah');

    // A obráceně: co zrcadlo pustí, to server opravdu koupí, a co odmítne, to odmítne i on.
    assert.equal(g.gearBuy(0, 1), null, 'Krumpáč (4) se za 2 valouny koupit nedá');
    assert.ok(g.gearBuy(0, 0), 'Podkova (2) ano');
});

test('gearForceOk / gearForceCost zrcadlí vynucené odhození', () => {
    const g = mkZH();
    g.players[1].gear = [gearCard('ZH_PODKOVA')];
    g.players[0].nuggets = 2;
    assert.equal(GR.gearForceCost(g.players[1].gear[0]), 3);
    assert.equal(GR.gearForceOk(g, 0, 1, 0), false, 'na 3 valouny bot ani klient nenabídne');
    g.players[0].nuggets = 3;
    assert.equal(GR.gearForceOk(g, 0, 1, 0), true);
    assert.equal(GR.gearForceOk(g, 0, 0, 0), false, 'vlastní vybavení nikdy');
    assert.ok(GR.gearForceAvailable(g, 0));
});

test('beerNuggetOk zrcadlí beerForNugget (i Reverenda)', () => {
    const g = mkZH();
    const c = mkCard(CardType.BEER);
    g.players[0].hand.push(c);
    assert.equal(GR.beerNuggetOk(g, 0, c), true);
    g.activeEvent = { key: 'REVEREND', name: 'Reverend' };
    assert.equal(GR.beerNuggetOk(g, 0, c), false);
    assert.equal(g.beerForNugget(0, 0), null);
});

test('bez zapnutého rozšíření obchod neexistuje – všechny akce jsou no-op', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.players[0].nuggets = 9;
    g.gearRow = [gearCard('ZH_PODKOVA'), null, null];
    assert.equal(g.gearBuy(0, 0), null);
    assert.equal(GR.gearShopOpen(g, 0), false);
    const i = give(g, 0, CardType.BEER);
    assert.equal(g.beerForNugget(0, i), null);
});
