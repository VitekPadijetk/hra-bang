// Zlatá horečka – fáze 8: nákupní politika bota.
//
// Bot nakupuje už od fáze 1 (jinak by se obchod v zátěži nikdy neprotočil), tady se
// hlídají dvě věci, které přidala fáze 8:
//   • ocenění vybavení PO MAJITELI (gearValueFor) – karta, ze které majitel nic nemá,
//     nestojí za valouny (Kalumet Apache Kida, černé vybavení ducha/stínu, …),
//   • šetření (gearSaveFor) – bez něj bot utratí každý valoun za první levnou kartu
//     a na drahé vybavení nenašetří nikdy.
// K tomu oprava, na kterou se při tom přišlo: duch (Město duchů) odchodem ze hry
// ztrácí i vybavení, které si za svůj tah koupil.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, topDeck, Suits } = require('./_helpers.js');
const { decideBotAction, gearValueFor, gearSaveFor } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

const gearData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8')
);
const hnData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.high_noon.json'), 'utf8')
);
const ZH_ON = { expansions: { zlata_horecka: true } };

function mkZH(specs, opts = {}) {
    const g = mkGame(specs || [{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }], opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    g.turnId = 1;
    return g;
}

let _gid = 63000;
function gearCard(effect) {
    const kind = gearData.find(k => k.effect === effect);
    return { id: _gid++, effect, name: kind.name, art: kind.art,
             border: kind.border, cost: kind.cost, text: kind.text };
}
function shop(g, effects) {
    g.gearRow = [0, 1, 2].map(i => (effects[i] ? gearCard(effects[i]) : null));
}
function gear(g, idx, effect) {
    const c = gearCard(effect);
    g.players[idx].gear.push(c);
    return c;
}

// ── Ocenění po majiteli ─────────────────────────────────────────────────────

test('Kalumet: Apache Kid ho nekoupí – imunní vůči kárům je sám', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Apache Kid' }, { role: 'Outlaw' }]);
    shop(g, ['ZH_KALUMET']);
    g.players[0].nuggets = 3;
    assert.equal(gearValueFor(g, 0, g.gearRow[0]), 0);
    assert.notEqual(decideBotAction(g, 0).event, 'gear_buy');
    // Kdokoli jiný ano.
    g.players[0].character = 'Bart Cassidy';
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_buy', payload: { rowIdx: 0 } });
});

test('stín ani duch si černé vybavení nekoupí – na konci tahu o něj přijdou', () => {
    for (const flag of ['_shadow', '_ghost']) {
        const g = mkZH([{ role: 'Outlaw' }, { role: 'Sheriff' }]);
        shop(g, ['ZH_BOTY']);
        const me = g.players[0];
        me.nuggets = 3;
        me.health = 0;
        me[flag] = true;
        assert.equal(gearValueFor(g, 0, g.gearRow[0]), 0, flag);
        assert.notEqual(decideBotAction(g, 0).event, 'gear_buy', flag);
    }
});

test('Nábojový pás má pro Big Spencera (9 životů) jen zbytkovou cenu', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Big Spencer', maxHealth: 9 }]);
    const pas = gearCard('ZH_NABOJOVY_PAS');
    assert.ok(gearValueFor(g, 1, pas) < gearValueFor(g, 0, pas));
});

test('Podkova má pro Lucky Duka menší cenu než pro ostatní (třetí karta < druhá)', () => {
    const g = mkZH([{ role: 'Sheriff', character: 'Lucky Duke' }, { role: 'Outlaw' }]);
    const podkova = gearCard('ZH_PODKOVA');
    assert.ok(gearValueFor(g, 0, podkova) > 0);
    assert.ok(gearValueFor(g, 0, podkova) < gearValueFor(g, 1, podkova));
});

test('vynucené odhození se oceňuje po majiteli: Kalumet Apache Kida nestojí za valouny', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', character: 'Apache Kid' }]);
    const k = gear(g, 1, 'ZH_KALUMET');
    assert.equal(gearValueFor(g, 1, k), 0);
});

// ── Šetření ─────────────────────────────────────────────────────────────────

test('šetření: s Botami o valoun dál Nábojový pás nekoupí – počká', () => {
    const g = mkZH();
    shop(g, ['ZH_NABOJOVY_PAS', 'ZH_BOTY']);
    g.players[0].nuggets = 2;
    assert.ok(gearSaveFor(g, 0) > 0, 'šetří se na Boty');
    assert.notEqual(decideBotAction(g, 0).event, 'gear_buy');
    // S dost valouny sáhne rovnou po lepší kartě.
    g.players[0].nuggets = 3;
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_buy', payload: { rowIdx: 1 } });
});

test('šetření: karta skoro stejně dobrá se koupí hned (rozdíl pod SAVE_MARGIN)', () => {
    const g = mkZH();
    shop(g, ['ZH_PODKOVA', 'ZH_KRUMPAC']);        // 22 za 2 vs. 26 za 4
    g.players[0].nuggets = 2;
    assert.ok(gearSaveFor(g, 0) > 0, 'na Krumpáč by se šetřit dalo…');
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_buy', payload: { rowIdx: 0 } });
});

test('šetření: na kartu daleko mimo dosah se nešetří', () => {
    const g = mkZH();
    shop(g, ['ZH_KRUMPAC']);                      // Krumpáč stojí 4
    g.players[0].nuggets = 2;
    assert.equal(gearSaveFor(g, 0), 26, 'chybí 2 – ještě se šetří');
    g.players[0].nuggets = 1;
    assert.equal(gearSaveFor(g, 0), 0, 'chybí 3 – to už ne');
});

test('šetření: na kartu, kterou pravidla nepustí z jiného důvodu, se nešetří', () => {
    const g = mkZH();
    gear(g, 0, 'ZH_BOTY');                        // Boty už má – druhé koupit nesmí
    shop(g, ['ZH_NABOJOVY_PAS', 'ZH_BOTY']);
    g.players[0].nuggets = 2;
    assert.equal(gearSaveFor(g, 0), 0);
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_buy', payload: { rowIdx: 0 } });
});

test('šetření brzdí i drobné výdaje: Rýžovací mísa počká na Boty', () => {
    const g = mkZH();
    gear(g, 0, 'ZH_RYZOVACI_MISA');
    shop(g, ['ZH_BOTY']);
    g.players[0].nuggets = 2;
    topDeck(g, Suits.CLUBS);
    assert.notEqual(decideBotAction(g, 0).event, 'gear_pan');
    // Bez karty, na kterou se šetří, rýžuje jako dřív.
    shop(g, []);
    assert.deepEqual(decideBotAction(g, 0), { event: 'gear_pan', payload: {} });
});

// ── Město duchů: odchod ducha uklidí i jeho vybavení ─────────────────────────

test('Město duchů: duch odchodem ze hry odhodí vybavení pod balíček vybavení', () => {
    const g = mkZH([{ role: 'Sheriff' }, { role: 'Outlaw', health: 0 }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.activeEvent = hnData.find(c => c.key === 'MESTO_DUCHU');
    g.eventDeck = [];
    g.nextTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1]._ghost, true);
    const boty = gear(g, 1, 'ZH_BOTY');
    const before = g.gearPile.length;
    g.nextTurn();
    assert.ok(!g.players[1]._ghost, 'duch odešel');
    assert.deepEqual(g.players[1].gear, [], 'před mrtvým nic nezůstalo');
    assert.equal(g.gearPile.length, before + 1);
    assert.ok(g.gearPile.some(c => c.id === boty.id), 'Boty jsou pod balíčkem vybavení');
});
