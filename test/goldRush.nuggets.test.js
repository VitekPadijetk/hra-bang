// Rozšíření Zlatá horečka (Gold Rush) – fáze 0: měna a trychtýř ztráty života.
//
// „Vždy, když způsobíte JINÉMU hráči ztrátu života JAKÝMKOLIV způsobem, vezměte si
//  1 valoun zlata ze společné zásoby. Pokud způsobíte jednou kartou ztrátu života více
//  hráčům, vezměte si zlato ZA KAŽDÉ ZRANĚNÍ."
//
// Podklad: docs/zlata-horecka.md (Zlaté valouny), plán docs/zlata-horecka-plan.md
// §2.3 + rozhodnutí R4 (zásoba se nemodeluje) a R5 (jeden trychtýř `_afterLifeLost`).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');

before(() => { console.log = () => {}; });

const gearData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.zlata_horecka.json'), 'utf8')
);
const ZH_ON = { expansions: { zlata_horecka: true } };

// Hra se zapnutou Zlatou horečkou. Balíček vybavení se staví ze skutečných dat.
function mkZH(n = 4, opts = {}) {
    const specs = [{ role: 'Sheriff' }];
    for (let i = 1; i < n; i++) specs.push({ role: i === n - 1 ? 'Renegade' : 'Outlaw' });
    const g = mkGame(specs, opts);
    g.gearCardData = gearData;
    g._setupGearDeck(ZH_ON);
    return g;
}

// ── Data balíčku vybavení ────────────────────────────────────────────────────

test('data: 15 druhů, 24 kusů, 13 hnědých a 11 černých', () => {
    assert.equal(gearData.length, 15);
    const ks = (b) => gearData.filter(c => c.border === b).reduce((s, c) => s + c.copies, 0);
    assert.equal(ks('brown') + ks('black'), 24);
    assert.equal(ks('brown'), 13);
    assert.equal(ks('black'), 11);
});

test('data: identita karty je `effect`, ne jméno – a je unikátní', () => {
    const eff = gearData.map(c => c.effect);
    assert.equal(new Set(eff).size, eff.length);
    // R1: „Zlatá horečka" je zároveň karta vybavení a klíč karty událostí High Noonu.
    // Kolize se řeší tím, že se pravidla ptají na `effect`, který má prefix ZH_.
    assert.ok(eff.every(e => e.startsWith('ZH_')));
    assert.ok(gearData.every(c => typeof c.cost === 'number' && c.cost >= 1 && c.cost <= 5));
    // Nejsou to karty hracího balíčku – barvu ani hodnotu nemají (nikdy se neotáčí).
    assert.ok(gearData.every(c => c.suit === undefined && c.value === undefined));
});

test('setup: do balíčku jdou jen HOTOVÉ druhy (GEAR_READY) a obchod se hned naplní', () => {
    const g = mkZH();
    // Kusů je celkem 24, ale do hry se rozdávají jen druhy, jejichž efekt už umí
    // pravidla (fáze 1: Panák 3× + Union Pacific 1×; fáze 2: šest pasivních černých
    // po jednom kusu). Karta bez efektu by se prodala za valouny a neudělala nic –
    // viz GEAR_READY v logic/goldRush.js.
    const READY = ['ZH_PANAK', 'ZH_UNION_PACIFIC',
                   'ZH_BOTY', 'ZH_TALISMAN', 'ZH_OPASEK', 'ZH_KRUMPAC', 'ZH_KALUMET', 'ZH_PODKOVA'];
    const all = g.gearDeck.concat(g.gearRow.filter(Boolean));
    assert.equal(all.length, 10);
    assert.equal(new Set(all.map(c => c.id)).size, 10);
    assert.ok(all.every(c => READY.includes(c.effect)));
    // Černé druhy fáze 2 jsou v balíčku po JEDNOM kuse (`copies: 1` v datech), takže
    // se „ne dvě stejného vybavení" nedá porušit ani dvěma nákupy různých hráčů.
    READY.slice(2).forEach(e => assert.equal(all.filter(c => c.effect === e).length, 1, e));
    // Obchod má 3 karty lícem vzhůru hned od začátku hry.
    assert.equal(g.gearRow.filter(Boolean).length, 3);
    assert.deepEqual(g.gearPile, []);
});

test('setup: bez zapnutého rozšíření zůstane balíček prázdný a háky jsou no-op', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.gearCardData = gearData;
    g._setupGearDeck({});
    assert.deepEqual(g.gearDeck, []);
    assert.equal(g._goldRushOn(), false);
});

test('setup: navazující hra začíná bez valounů i bez vybavení', () => {
    const g = mkZH();
    g.players[0].nuggets = 7;
    g.players[0].gear = [{ effect: 'ZH_PODKOVA' }];
    g._setupGearDeck(ZH_ON);
    assert.equal(g.players[0].nuggets, 0);
    assert.deepEqual(g.players[0].gear, []);
});

// ── Valoun za způsobené zranění ──────────────────────────────────────────────

test('útočník dostane valoun za každé způsobené zranění', () => {
    const g = mkZH();
    g.handleDamage(1, 0);
    assert.equal(g.players[0].nuggets, 1);
    g.handleDamage(2, 0);
    assert.equal(g.players[0].nuggets, 2);
    assert.equal(g.players[1].nuggets, 0, 'oběť nedostává nic');
});

test('Kulomet ve 4 hráčích a třech zásazích = 3 valouny (příklad z pravidel)', () => {
    const g = mkZH(4);
    [1, 2, 3].forEach(i => g.handleDamage(i, 0));
    assert.equal(g.players[0].nuggets, 3);
});

test('zranění bez útočníka (událost) valoun nikomu nedá', () => {
    const g = mkZH();
    g.handleDamage(1, null);
    assert.deepEqual(g.players.map(p => p.nuggets), [0, 0, 0, 0]);
});

test('sebezranění valoun nedá', () => {
    const g = mkZH();
    g.handleDamage(0, 0);
    assert.equal(g.players[0].nuggets, 0);
});

test('valoun se bere i za zranění, které oběť vyřadí', () => {
    const g = mkZH();
    g.players[1].health = 1;
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 0);
    assert.equal(g.players[0].nuggets, 1);
});

test('bez zapnutého rozšíření valouny nepřibývají vůbec', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    g.handleDamage(1, 0);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[0].nuggets, 0, 'hra bez rozšíření nesmí sbírat mrtvý stav');
});

test('rozkoupený balíček rozšíření nevypíná – valouny přibývají dál', () => {
    const g = mkZH();
    g.gearDeck = [];
    g.gearRow = [null, null, null];
    assert.equal(g._goldRushOn(), true);
    g.handleDamage(1, 0);
    assert.equal(g.players[0].nuggets, 1);
});

// ── Trychtýř `_afterLifeLost` (R5): tři vstupy ───────────────────────────────
// Fáze 0 má tělo prázdné (jen log) – Boty, Talisman a Simeon Picos ho plní ve
// fázích 2 a 6. Testuje se proto, že se VOLÁ ze všech tří míst a se správným
// `attackerIdx`/`last`; jinak by pozdější schopnost tiše nefungovala zrovna
// na dynamitu (přesně to R5 řeší).

function spyLifeLost(g) {
    const calls = [];
    g._afterLifeLost = (playerIdx, opts = {}) => calls.push({ playerIdx, ...opts });
    return calls;
}

test('_afterLifeLost: handleDamage hlásí útočníka i to, že život nebyl poslední', () => {
    const g = mkZH();
    const calls = spyLifeLost(g);
    g.handleDamage(1, 0);
    assert.deepEqual(calls, [{ playerIdx: 1, attackerIdx: 0, last: false }]);
});

test('_afterLifeLost: poslední život se hlásí jako `last` (Boty ani Talisman neúčinkují)', () => {
    const g = mkZH();
    g.players[1].health = 1;
    const calls = spyLifeLost(g);
    g.handleDamage(1, 0);
    assert.deepEqual(calls, [{ playerIdx: 1, attackerIdx: 0, last: true }]);
});

test('_afterLifeLost: klikaný zásah (dynamit) jde mimo handleDamage, ale trychtýřem projde', () => {
    const g = mkZH(4, { phase: 'DYNAMITE_DAMAGE' });
    g.pendingDynamiteDamage = { playerIdx: 0, hitsLeft: 3, resume: 'CHECKS' };
    const calls = spyLifeLost(g);
    g.takeDynamiteHit(0);
    assert.deepEqual(calls, [{ playerIdx: 0, attackerIdx: null, last: false }]);
});

test('_afterLifeLost: Chuck Wengam (dobrovolná ztráta) taky, a nikdy jako poslední život', () => {
    const g = mkZH(4);
    g.players[0].character = 'Chuck Wengam';
    const calls = spyLifeLost(g);
    assert.equal(g.useChuckWengam(0), true);
    assert.deepEqual(calls, [{ playerIdx: 0, attackerIdx: null, last: false }]);
});

// ── Placení ──────────────────────────────────────────────────────────────────

test('_payNuggets zaplatí jen z toho, co hráč má', () => {
    const g = mkZH();
    g._gainNugget(0, 3);
    assert.equal(g.players[0].nuggets, 3);
    assert.equal(g._payNuggets(0, 4), false, 'na drahou kartu nemá');
    assert.equal(g.players[0].nuggets, 3, 'neúspěšné placení stav nemění');
    assert.equal(g._payNuggets(0, 3), true);
    assert.equal(g.players[0].nuggets, 0);
});

test('_hasGear se ptá na effect, ne na jméno', () => {
    const g = mkZH();
    g.players[0].gear = [{ id: 6090, effect: 'ZH_PODKOVA', name: 'Podkova' }];
    assert.equal(g._hasGear(0, 'ZH_PODKOVA'), true);
    assert.equal(g._hasGear(0, 'ZH_TALISMAN'), false);
    assert.equal(g._hasGear(1, 'ZH_PODKOVA'), false);
});

// ── Vybavení leží mimo `board` (R3) ──────────────────────────────────────────
// Strukturální pojistka: karty vybavení nesmí být cílem Paniky, Cat Balou ani
// schopností (Pat Brennan) a Vulture Sam je nedostane. Zaručuje to vlastní pole,
// ne výjimka ve výběru karet – proto stačí ověřit, že se `gear` do `board` nedostal.

test('gear je vlastní pole vedle board/weapon, ne jeho součást', () => {
    const g = mkZH();
    const p = g.players[0];
    board(g, 0, CardType.BARREL);
    p.gear = [{ id: 6090, effect: 'ZH_PODKOVA', name: 'Podkova' }];
    assert.equal(p.board.length, 1);
    assert.ok(!p.board.some(c => c.effect === 'ZH_PODKOVA'));
    assert.equal(p.gear.length, 1);
});
