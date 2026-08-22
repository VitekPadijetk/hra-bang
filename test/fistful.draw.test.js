// Rozšíření A Fistful of Cards – fáze 3: události fáze lízání (Pálenka, Právo západu).
// Obě sahají na začátek tahu: Pálenka nabízí lízání vyměnit za život, Právo západu
// odkryje druhou lízanou kartu a drží hráče v tahu, dokud ji nezahraje.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, CardType, Suits } = require('./_helpers.js');
const { cardPlayability, lawForcedCard } = require('../core/playability.js');
const { decideBotAction } = require('../core/botPolicy.js');

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

// Deterministický balíček: `n` karet daného typu na vršku (draw() popuje z konce).
function stackDeck(g, n, type = CardType.BEER, o = {}) {
    const made = [];
    for (let i = 0; i < n; i++) made.push(mkCard(type, o));
    g.deck.cards = made.slice().reverse();   // první líznutá = made[0]
    return made;
}

// ── Pálenka ─────────────────────────────────────────────────────────────────

test('Pálenka: volba se nabízí jen se zapnutou událostí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PALENKA');
    assert.deepEqual(g._drawOptionsBase(), ['deck', 'liquor']);
    g.activeFistful = null;
    assert.deepEqual(g._drawOptionsBase(), ['deck']);

    const h = mkEv([{ role: 'Sheriff' }, {}], 'PALENKA');
    h.startDrawPhase();
    assert.ok(h.drawPhaseState.options.includes('liquor'));
});

test('Pálenka: místo lízání +1 život a konec fáze', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}], 'PALENKA');
    stackDeck(g, 4);
    g.startDrawPhase();
    g.drawCard('liquor');
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].hand.length, 0, 'žádná karta se nelízla');
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.drawPhaseState.active, false);
    assert.equal(g.deck.cards.length, 4, 'balíček zůstal nedotčený');
});

test('Pálenka: nad maximum neléčí, ale fázi lízání stejně ukončí', () => {
    const g = mkEv([{ role: 'Sheriff', maxHealth: 4, health: 4 }, {}], 'PALENKA');
    stackDeck(g, 4);
    g.startDrawPhase();
    g.drawCard('liquor');
    assert.equal(g.players[0].health, 4);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 0);
});

test('Pálenka: po první líznuté kartě už je pozdě', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}], 'PALENKA');
    stackDeck(g, 4);
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('liquor');
    assert.equal(g.players[0].health, 2, 'život se nepřidal');
    assert.equal(g.phase, 'DRAW', 'fáze lízání běží dál');
    assert.equal(g.players[0].hand.length, 1);
});

test('Pálenka: bez události se zdroj liquor ignoruje', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}], null);
    stackDeck(g, 4);
    g.startDrawPhase();
    g.drawCard('liquor');
    assert.equal(g.players[0].health, 2);
    assert.equal(g.phase, 'DRAW');
});

test('Pálenka: nabídne se i Kitovi Carlsonovi a Clausovi (rozhodují se dřív než odkryjí)', () => {
    const kit = mkEv([{ role: 'Sheriff', character: 'Kit Carlson', health: 2 }, {}], 'PALENKA');
    stackDeck(kit, 5);
    kit.startDrawPhase();
    assert.ok(kit.drawPhaseState.options.includes('liquor'));
    kit.drawCard('liquor');
    assert.equal(kit.players[0].health, 3);
    assert.equal(kit.phase, 'PLAY');
    assert.ok(!kit.kitCarlsonState, 'žádná řada se neodkryla');

    const claus = mkEv([{ role: 'Sheriff', character: 'Claus the Saint', health: 2 }, {}, {}], 'PALENKA');
    stackDeck(claus, 6);
    claus.startDrawPhase();
    assert.ok(claus.drawPhaseState.options.includes('liquor'));
    claus.drawCard('liquor');
    assert.equal(claus.players[0].health, 3);
    assert.ok(!claus.clausState);
});

test('Pálenka: Kitův ocásek za Příjezd vlaku už volbu nemá', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Kit Carlson', health: 2 }, {}], 'PALENKA');
    g.activeEvent = hn('PRIJEZD_VLAKU');
    stackDeck(g, 6);
    g.startDrawPhase();
    g.drawCard('deck');                // odkryje 3 karty
    g.kitCarlsonPick(0);
    g.kitCarlsonPick(1);
    assert.equal(g.phase, 'DRAW', 'zbývá karta navíc za Příjezd vlaku');
    assert.ok(!g.drawPhaseState.options.includes('liquor'));
    g.drawCard('liquor');
    assert.equal(g.players[0].health, 2, 'ocásek se za život vyměnit nedá');
});

test('Pálenka: duch (Město duchů) se napít smí', () => {
    const g = mkEv([{ role: 'Sheriff', health: 0 }, {}], 'PALENKA');
    g.activeEvent = hn('MESTO_DUCHU');
    g.players[0]._ghost = true;
    stackDeck(g, 4);
    g.startDrawPhase();
    g.drawCard('liquor');
    assert.equal(g.players[0].health, 1);
    assert.equal(g.phase, 'PLAY');
});

test('Pálenka: odměna za banditu se za život vyměnit nedá', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}], 'PALENKA');
    stackDeck(g, 5);
    g.drawPhaseState = { active: true, playerIdx: 0, cardsNeeded: 3, cardsDrawn: 0,
                         options: ['deck'], isKillReward: true };
    g.phase = 'DRAW';
    g.drawCard('liquor');
    assert.equal(g.players[0].health, 2);
    assert.equal(g.drawPhaseState.cardsDrawn, 0);
});

test('Pálenka: na ni navazují Želízka jako po každém jiném lízání', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}], 'PALENKA');
    g.activeEvent = hn('ZELIZKA');
    stackDeck(g, 4);
    g.startDrawPhase();
    g.drawCard('liquor');
    assert.equal(g.phase, 'HANDCUFFS_SUIT');
    assert.equal(g.pendingHandcuffs.playerIdx, 0);
});

test('Pálenka: bot ji vezme jen zraněný s kartami v ruce', () => {
    const hurt = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }], 'PALENKA');
    stackDeck(hurt, 4);
    give(hurt, 0, CardType.BANG); give(hurt, 0, CardType.BEER); give(hurt, 0, CardType.MISSED);
    hurt.startDrawPhase();
    assert.deepEqual(decideBotAction(hurt, 0, null),
        { event: 'draw_card', payload: { source: 'liquor', sourceIdx: null } });

    const healthy = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'PALENKA');
    stackDeck(healthy, 4);
    give(healthy, 0, CardType.BANG); give(healthy, 0, CardType.BEER); give(healthy, 0, CardType.MISSED);
    healthy.startDrawPhase();
    assert.equal(decideBotAction(healthy, 0, null).payload.source, 'deck');

    const poor = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }], 'PALENKA');
    stackDeck(poor, 4);
    poor.startDrawPhase();
    assert.equal(decideBotAction(poor, 0, null).payload.source, 'deck', 'prázdná ruka → radši karty');
});

// ── Právo západu ────────────────────────────────────────────────────────────

test('Právo západu: označí se DRUHÁ lízaná karta, ne první', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PRAVO_ZAPADU');
    const cards = stackDeck(g, 3);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.ok(!g.players[0]._lawCardId, 'po první kartě ještě nic');
    g.drawCard('deck');
    assert.equal(g.players[0]._lawCardId, cards[1].id);
});

test('Právo západu: tah nejde ukončit, dokud vynucená karta leží v ruce', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
    stackDeck(g, 2, CardType.BEER);
    g.players[0].health = 2;
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.ok(g._lawForced(0), 'Pivo je hratelné → drží');

    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 0, 'tah se neposunul');
    assert.equal(g.phase, 'PLAY');

    const idx = g.players[0].hand.findIndex(c => c.id === g.players[0]._lawCardId);
    g.playCard(idx);
    assert.equal(g._lawForced(0), null);
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1, 'teď už tah přešel dál');
});

test('Právo západu: nehratelná karta tah nezamkne', () => {
    // Vedle! ve vlastním tahu zahrát nejde → cardPlayability false → nic nevynucuje.
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
    stackDeck(g, 2, CardType.MISSED);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.ok(g.players[0]._lawCardId != null, 'karta je označená');
    assert.equal(g._lawForced(0), null);
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1);
});

test('Právo západu: Bang! bez dosažitelného cíle tah nezamkne', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'PRAVO_ZAPADU');
    [1, 2, 3, 4].forEach(i => board(g, i, CardType.EQUIPMENT, { effect: 'mustang' }));
    stackDeck(g, 2, CardType.BANG);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g._lawForced(0), null, 'na dostřel 1 nikdo není');

    // Se sousedem v dostřelu už karta drží.
    const h = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    stackDeck(h, 2, CardType.BANG);
    h.startDrawPhase();
    h.drawCard('deck'); h.drawCard('deck');
    assert.ok(h._lawForced(0));
});

test('Právo západu: Cat Balou bez cíle s kartami tah nezamkne', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
    stackDeck(g, 2, CardType.CAT_BALOU);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g._lawForced(0), null, 'soupeř nemá nic k odhození');
    give(g, 1, CardType.BANG);
    assert.ok(g._lawForced(0));
});

test('Právo západu: Žízeň (1 karta) žádnou kartu nevynutí', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
    g.activeEvent = hn('ZIZEN');
    stackDeck(g, 2, CardType.BANG);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY', 'lízala se jediná karta');
    assert.ok(!g.players[0]._lawCardId);
});

test('Právo západu: Želízka mají přednost – zakázaná barva nic nevynutí', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
    g.activeEvent = hn('ZELIZKA');
    stackDeck(g, 2, CardType.BEER, { suit: Suits.HEARTS });
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'HANDCUFFS_SUIT');
    g.chooseHandcuffsSuit(0, Suits.SPADES);
    assert.equal(g._lawForced(0), null, 'srdcové Pivo se v pikovém tahu zahrát nedá');
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1);
});

test('Právo západu: Kit Carlson – vynucená je druhá PONECHANÁ karta', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Kit Carlson', health: 2 }, {}], 'PRAVO_ZAPADU');
    const cards = stackDeck(g, 3, CardType.BEER);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    g.kitCarlsonPick(2);
    assert.ok(!g.players[0]._lawCardId, 'po první ponechané ještě nic');
    g.kitCarlsonPick(0);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[0]._lawCardId, cards[0].id, 'druhá ponechaná = revealed[0]');
    assert.equal(g.players[0].hand[0].id, cards[2].id, 'první ponechaná = revealed[2]');
});

test('Právo západu: Black Jack – vynucená je jeho odkrytá druhá karta', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Black Jack', health: 2 }, {}], 'PRAVO_ZAPADU');
    const cards = stackDeck(g, 3, CardType.BEER, { suit: Suits.SPADES });
    g.startDrawPhase();
    g.drawCard('deck');
    g.drawCard('deck');
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    g.resolveBlackJack(true);
    assert.equal(g.players[0]._lawCardId, cards[1].id);
});

test('Právo západu: Claus rozdané karty neoznačuje, jen druhou vlastní', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Claus the Saint', health: 2 }, {}, {}], 'PRAVO_ZAPADU');
    stackDeck(g, 6, CardType.BEER);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'CLAUS_GIVE');
    g.clausPick(0);                       // 1. vlastní
    assert.ok(!g.players[0]._lawCardId);
    g.clausPick(1);                       // 2. vlastní → vynucená
    const forcedId = g.players[0]._lawCardId;
    assert.ok(forcedId != null);
    g.clausPick(2); g.clausPick(3);       // rozdané ostatním – nic nemění
    assert.equal(g.players[0]._lawCardId, forcedId);
    assert.ok(g.players[0].hand.some(c => c.id === forcedId));
});

test('Právo západu: označení platí jen pro ten jeden tah', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
    stackDeck(g, 8, CardType.BEER);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.ok(g.players[0]._lawCardId != null);
    // Ostatní hrají a tah se vrátí zpátky – označení zahodí _beginTurn hráče 0.
    g.tryEndTurn();                       // Pivo je hratelné → tah zatím nejde ukončit
    const idx = g.players[0].hand.findIndex(c => c.id === g.players[0]._lawCardId);
    g.playCard(idx);
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1);
    // Oba soupeři jsou na plných životech, takže je jejich Pivo nehratelné a nedrží je.
    g.drawCard('deck'); g.drawCard('deck'); g.tryEndTurn();
    g.drawCard('deck'); g.drawCard('deck'); g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 0, 'zpátky u prvního hráče');
    assert.equal(g.players[0]._lawCardId, null, 'zahodil ho začátek jeho dalšího tahu');
});

test('Právo západu: bez zapnutého Fistfulu se nic neoznačuje', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }], null);
    stackDeck(g, 2, CardType.BEER);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[0]._lawCardId, undefined);
    assert.equal(g._lawForced(0), null);
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1);
});

// ── Zrcadla (klient + bot) ──────────────────────────────────────────────────

test('Právo západu: lawForcedCard je stejný dotaz pro server i klienta', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
    stackDeck(g, 2, CardType.BEER);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const fromCore = lawForcedCard(g, g.players[0], 0);
    assert.ok(fromCore);
    assert.equal(fromCore.card.id, g._lawForced(0).card.id);
    // Karta samotná zůstává normálně hratelná (žádné extra omezení).
    assert.equal(cardPlayability(g, g.players[0], 0, fromCore.card), true);
});

test('Právo západu: bot zahraje vynucenou kartu jako první', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    stackDeck(g, 2, CardType.BANG);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    give(g, 0, CardType.BEER);            // jinak by si bot na 2 životech nalil pivo
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.cardIdx, g.players[0].hand.findIndex(c => c.id === g.players[0]._lawCardId));
});

test('Právo západu: bot vynucenou kartu zahraje i na hráče, kterého nepovažuje za nepřítele', () => {
    // Šerif + pomocník: bot žádného nepřítele nevidí, přesto MUSÍ Bang! zahrát,
    // jinak by server odmítl konec tahu a hra se zasekla.
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Deputy' }], 'PRAVO_ZAPADU');
    stackDeck(g, 2, CardType.BANG);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const a = decideBotAction(g, 0, null);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.targetIdx, 1);
});

test('Právo západu: bot nikdy neposílá end_turn, dokud karta drží', () => {
    // Projdi všechny akční typy karet – u každé musí vyjít akce, kterou server přijme.
    const types = [CardType.BANG, CardType.PANIC, CardType.CAT_BALOU, CardType.DUEL,
                   CardType.JAIL, CardType.BEER, CardType.SALOON, CardType.STAGECOACH,
                   CardType.GATLING, CardType.INDIANS, CardType.BARREL, CardType.WEAPON];
    types.forEach(t => {
        const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, { role: 'Outlaw' }], 'PRAVO_ZAPADU');
        stackDeck(g, 2, t, t === CardType.WEAPON ? { props: { range: 2 } } : {});
        give(g, 1, CardType.BANG);        // ať mají Panika!/Cat Balou co brát
        give(g, 2, CardType.BANG);
        g.startDrawPhase();
        g.drawCard('deck'); g.drawCard('deck');
        if (!g._lawForced(0)) return;     // karta nic nevynucuje → end_turn je legální
        const a = decideBotAction(g, 0, null);
        assert.notEqual(a.event, 'end_turn', `${t} by hru zasekla`);
    });
});
