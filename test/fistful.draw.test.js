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
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}], 'PALENKA');
    assert.deepEqual(g._drawOptionsBase(g.players[0]), ['deck', 'liquor']);
    g.activeFistful = null;
    assert.deepEqual(g._drawOptionsBase(g.players[0]), ['deck']);

    const h = mkEv([{ role: 'Sheriff', health: 2 }, {}], 'PALENKA');
    h.startDrawPhase();
    assert.ok(h.drawPhaseState.options.includes('liquor'));
});

// S plnými životy nemá co získat – nabídnout mu vzdát se celé fáze lízání za nic
// je jen past. Nenabízí se proto ani na serveru (options), ani v UI.
test('Pálenka: s plnými životy se volba vůbec nenabídne', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}], 'PALENKA');
    assert.equal(g.players[0].health, g.players[0].maxHealth);
    assert.deepEqual(g._drawOptionsBase(g.players[0]), ['deck']);
    stackDeck(g, 4);
    g.startDrawPhase();
    assert.ok(!g.drawPhaseState.options.includes('liquor'));
    g.drawCard('liquor');
    assert.equal(g.phase, 'DRAW', 'a ani odeslaná akce neprojde');
    assert.equal(g.players[0].hand.length, 0);
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

// Zraněný hráč s Kocovinou/duchem apod. si o poslední chybějící život říct smí; jakmile
// se ale mezi nabídnutím a klikem doléčí, akce už neprojde (options se počítají znovu).
test('Pálenka: doléčenému hráči už akce neprojde', () => {
    const g = mkEv([{ role: 'Sheriff', maxHealth: 4, health: 3 }, {}], 'PALENKA');
    stackDeck(g, 4);
    g.startDrawPhase();
    assert.ok(g.drawPhaseState.options.includes('liquor'));
    g.players[0].health = 4;               // mezitím se doléčil (Pivo v reakci, Salón…)
    g.drawCard('liquor');
    assert.equal(g.phase, 'DRAW', 'fáze lízání běží dál');
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

test('Právo západu: Bang! bez dosažitelného cíle musí hráč poslat sám na sebe', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}, {}, {}], 'PRAVO_ZAPADU');
    [1, 2, 3, 4].forEach(i => board(g, i, CardType.EQUIPMENT, { effect: 'mustang' }));
    stackDeck(g, 2, CardType.BANG);
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const forced = g._lawForced(0);
    assert.ok(forced, 'karta drží dál – cílem je v nouzi sám hráč');
    assert.equal(g._lawSelfShootOnly(0, forced.card), true);
    g.tryEndTurn();
    assert.equal(g.phase, 'PLAY', 'tah nejde ukončit');
    g.playBang(0, 0, forced.idx);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.pendingResponse.targetIdx, 0, 'střílí sám na sebe');

    // Se sousedem v dostřelu už na sebe střílet nemusí.
    const h = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    stackDeck(h, 2, CardType.BANG);
    h.startDrawPhase();
    h.drawCard('deck'); h.drawCard('deck');
    const hf = h._lawForced(0);
    assert.ok(hf);
    assert.equal(h._lawSelfShootOnly(0, hf.card), false);
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

// Želízka (High Noon) × Právo západu (Fistful): jinou barvou by si hráč povinnost jen
// zrušil, takže mu volba zbude jediná – barva vynucené karty. Neplatí to u karty, která
// by nešla zahrát ani ve své barvě (Vedle! ve svém tahu), tam se vybírá svobodně.
test('Právo západu + Želízka: vynucená karta si vynutí svou barvu', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    g.activeEvent = hn('ZELIZKA');
    stackDeck(g, 2, CardType.BEER, { suit: Suits.HEARTS });
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'HANDCUFFS_SUIT');
    assert.equal(g.chooseHandcuffsSuit(0, Suits.SPADES), false, 'piky by Pivo vypnuly');
    assert.equal(g.phase, 'HANDCUFFS_SUIT', 'čeká se dál');
    assert.equal(g.chooseHandcuffsSuit(0, Suits.HEARTS), true);
    assert.ok(g._lawForced(0), 'a povinnost platí');
});

test('Právo západu + Želízka: bot si vybere vynucenou barvu', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    g.activeEvent = hn('ZELIZKA');
    give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    give(g, 0, CardType.BANG, { suit: Suits.SPADES });
    stackDeck(g, 2, CardType.BEER, { suit: Suits.HEARTS });
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0, null);
    assert.equal(act.event, 'handcuffs_suit');
    assert.equal(act.payload.suit, Suits.HEARTS, 'i když má v ruce jen piky');
});

test('Právo západu + Želízka: nehratelná karta barvu nevynutí', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    g.activeEvent = hn('ZELIZKA');
    stackDeck(g, 2, CardType.MISSED, { suit: Suits.HEARTS });
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'HANDCUFFS_SUIT');
    assert.equal(g.chooseHandcuffsSuit(0, Suits.SPADES), true, 'Vedle! se ve svém tahu nezahraje tak jako tak');
    assert.equal(g._lawForced(0), null);
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1);
});

// FAQ Q12: „Kit Carlson se podívá na 3 karty, vybere si dvě a ukáže tu druhou (pozor,
// pořadí karet měnit nesmí!)" – vynucená je tedy druhá v pořadí BALÍČKU, ne v pořadí
// klikání. Jinak by si Kit vždycky vybral, která karta ho bude v tahu držet.
test('Právo západu: Kit Carlson – vynucená je druhá karta v pořadí BALÍČKU', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Kit Carlson', health: 2 }, {}], 'PRAVO_ZAPADU');
    const cards = stackDeck(g, 3, CardType.BEER);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    g.kitCarlsonPick(2);
    assert.ok(!g.players[0]._lawCardId, 'po první ponechané ještě nic – neví se, která to bude');
    g.kitCarlsonPick(0);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.players[0]._lawCardId, cards[2].id, 'z ponechaných {0,2} je druhá v balíčku revealed[2]');
    assert.equal(g.players[0].hand[0].id, cards[2].id, 'první KLIKNUTÁ byla revealed[2]');
});

test('Právo západu: Kit Carlson – pořadí klikání výsledek nemění', () => {
    const mk = () => {
        const g = mkEv([{ role: 'Sheriff', character: 'Kit Carlson', health: 2 }, {}], 'PRAVO_ZAPADU');
        const cards = stackDeck(g, 3, CardType.BEER);
        g.startDrawPhase();
        g.drawCard('deck');
        return { g, cards };
    };
    const a = mk(); a.g.kitCarlsonPick(0); a.g.kitCarlsonPick(1);
    const b = mk(); b.g.kitCarlsonPick(1); b.g.kitCarlsonPick(0);
    assert.equal(a.g.players[0]._lawCardId, a.cards[1].id);
    assert.equal(b.g.players[0]._lawCardId, b.cards[1].id, 'opačné pořadí kliků, stejná vynucená karta');
});

test('Právo západu: Kit Carlson se Žízní (nechá si 1) žádnou vynucenou nemá', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Kit Carlson', health: 2 }, {}], 'PRAVO_ZAPADU');
    g.activeEvent = hn('ZIZEN');
    stackDeck(g, 3, CardType.BEER);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.kitCarlsonState.needed, 1);
    g.kitCarlsonPick(1);
    assert.ok(!g.players[0]._lawCardId);
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

test('Právo západu: Claus – vynucená je druhá vlastní v pořadí BALÍČKU', () => {
    const mk = () => {
        const g = mkEv([{ role: 'Sheriff', character: 'Claus the Saint', health: 2 }, {}, {}], 'PRAVO_ZAPADU');
        const cards = stackDeck(g, 6, CardType.BEER);
        g.startDrawPhase();
        g.drawCard('deck');
        return { g, cards };
    };
    const a = mk(); a.g.clausPick(0); a.g.clausPick(3);
    const b = mk(); b.g.clausPick(3); b.g.clausPick(0);
    assert.equal(a.g.players[0]._lawCardId, a.cards[3].id, 'z ponechaných {0,3} je druhá revealed[3]');
    assert.equal(b.g.players[0]._lawCardId, b.cards[3].id, 'opačné pořadí kliků, stejná vynucená karta');
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

// ── Právo západu: vynucená karta zamyká jen to, co by ji vypnulo ────────────
// Povinnost jde obejít jen třemi cestami a právě ty jsou zamčené: doléčit se Pivem, aby
// vynucený Salón přestal jít zahrát; vyčerpat limit jiným Bangem; nebo si vynucenou
// kartu odhodit (schopností, jako cenu za „odhoď další kartu", Rančem). Zbytek tahu
// zamčený NENÍ – nesouvisející karty i schopnosti jdou zahrát (bug 12).

// Vynucená karta se pozná podle toho, že ji `_lawMark` označí jako DRUHOU líznutou.
function mkForced(g, forcedType, forcedOpts = {}) {
    stackDeck(g, 1, CardType.BEER);
    g.deck.cards.unshift(mkCard(forcedType, forcedOpts));   // druhá líznutá (pop z konce)
    g.startDrawPhase();
    g.drawCard('deck'); g.drawCard('deck');
    return g._lawForced(0);
}

test('Právo západu: vynucený Salón nejde obejít Pivem (zbytek ruky je zamčený)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 3 }, {}, {}], 'PRAVO_ZAPADU');
    const beer = give(g, 0, CardType.BEER);
    give(g, 0, CardType.BANG);
    const forced = mkForced(g, CardType.SALOON);
    assert.ok(forced, 'Salón drží – jsem zraněný');
    const bangCard = g.players[0].hand.find(c => c.type === CardType.BANG);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[beer]), false,
        'Pivo je do zahrání Salónu zamčené');
    assert.equal(cardPlayability(g, g.players[0], 0, bangCard), true,
        'zbytek ruky ale zamčený není – Bang! Salónu nijak nevadí');
    g.playCard(beer);
    assert.equal(g.players[0].health, 3, 'Pivo se nezahrálo');
    // Až po vynuceném Salónu je ruka zase volná.
    g.playCard(forced.idx);
    assert.equal(g.players[0].health, 4, 'Salón vyléčil');
    assert.equal(g._lawForced(0), null);
    assert.equal(cardPlayability(g, g.players[0], 0, bangCard), true, 'ruka je zase odemčená');
});

test('Právo západu: nesouvisející karta se zahrát smí (Salón v ruce, hraju Vybavení)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 3 }, {}, {}], 'PRAVO_ZAPADU');
    const barrel = give(g, 0, CardType.BARREL);
    assert.ok(mkForced(g, CardType.SALOON));
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[barrel]), true);
    g.playCard(barrel);
    assert.equal(g.players[0].board.length, 1, 'Barel leží na stole');
    assert.ok(g._lawForced(0), 'a Salón drží dál');
});

test('Právo západu: jiný Bang! nesmí vyčerpat limit před vynuceným', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    const other = give(g, 0, CardType.BANG);
    const forced = mkForced(g, CardType.BANG);
    assert.ok(forced);
    g.playBang(0, 1, other);
    assert.equal(g.phase, 'PLAY', 'cizí Bang! server odmítl');
    assert.equal(g.players[0].bangsPlayedThisTurn, 0);
    // Vynucený projde a teprve pak je limit spotřebovaný.
    g.playBang(0, 1, forced.idx);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
});

test('Právo západu: schopnost postavy si vynucenou kartu odhodit nesmí', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Sid Ketchum', health: 2 }, {}, {}], 'PRAVO_ZAPADU');
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BANG);
    const forced = mkForced(g, CardType.SALOON);
    assert.ok(forced);
    // Vynucená karta je mezi zaplacenými → schopnost neprojde.
    g.useSidKetchum(0, [0, forced.idx]);
    assert.equal(g.players[0].health, 2, 'Sid se s vynucenou kartou nespustil');
    assert.ok(g._lawForced(0), 'a karta pořád leží v ruce');
    // Dvě jiné karty projdou – Salón se pak pořád dá zahrát (jsem zraněný dál).
    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[0].health, 3, 'jinými kartami zaplatit smí');
    assert.ok(g._lawForced(0), 'povinnost trvá');
});

test('Právo západu: schopnost, po které by vynucená karta nešla zahrát, je zamčená', () => {
    // Sid se doléčí do plných životů → vynucený Salón by přestal jít zahrát.
    const g = mkEv([{ role: 'Sheriff', character: 'Sid Ketchum', health: 3 }, {}, {}], 'PRAVO_ZAPADU');
    give(g, 0, CardType.BANG);
    give(g, 0, CardType.BANG);
    assert.ok(mkForced(g, CardType.SALOON));
    g.useSidKetchum(0, [0, 1]);
    assert.equal(g.players[0].health, 3, 'Sid se nespustil – doléčením by Salón vypnul');
});

test('Právo západu: vynucenou kartou nejde zaplatit „odhoď další kartu"', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    const whisky = give(g, 0, CardType.WHISKY, { props: { discardExtra: 'heal_self_2' } });
    give(g, 0, CardType.BANG);
    const forced = mkForced(g, CardType.BANG);
    assert.ok(forced);
    g.players[0].health = 2;
    // Whisky se zahrát smí (v ruce je čím zaplatit), ale ne vynucenou kartou.
    g.startDiscardExtra(whisky, null);
    assert.equal(g.phase, 'DISCARD_ANOTHER', 'Whisky se rozehrála');
    const forcedIdx = g.players[0].hand.findIndex(c => c.id === forced.card.id);
    g.discardAnotherCard(0, forcedIdx);
    assert.equal(g.phase, 'DISCARD_ANOTHER', 'vynucenou kartou zaplatit nelze');
    const otherIdx = g.players[0].hand.findIndex(c => c.type === CardType.BANG && c.id !== forced.card.id);
    g.discardAnotherCard(0, otherIdx);
    assert.equal(g.players[0].health, 4, 'jinou kartou ano');
    assert.ok(g._lawForced(0), 'a vynucená karta zůstala v ruce');
});

test('Právo západu: „odhoď další kartu" je zamčená, když by nezbylo čím zaplatit', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    const whisky = give(g, 0, CardType.WHISKY, { props: { discardExtra: 'heal_self_2' } });
    const forced = mkForced(g, CardType.BANG);
    assert.ok(forced);
    g.players[0].hand.splice(1, 1);              // pryč s první líznutou → jen Whisky + vynucený Bang!
    g.players[0].health = 2;
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[whisky]), false,
        'zaplatit by šlo jedině vynucenou kartou');
    g.startDiscardExtra(whisky, null);
    assert.equal(g.phase, 'PLAY', 'server ji taky nepustil');
});

test('Právo západu: Ranč vynucenou kartu nevymění', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    const forced = mkForced(g, CardType.BANG);
    assert.ok(forced);
    g.phase = 'RANCH';
    g.pendingRanch = { playerIdx: 0 };
    const res = g.ranchExchange(0, [forced.card.id]);
    assert.equal(res.discarded.length, 0, 'vynucená karta se nevyměnila');
    assert.ok(g.players[0].hand.some(c => c.id === forced.card.id));
});

test('Právo západu: zelený bang-efekt ze stolu jde aktivovat (limit Bang! nečerpá)', () => {
    const g = mkEv([{ role: 'Sheriff' }, { role: 'Outlaw' }, {}], 'PRAVO_ZAPADU');
    const pepper = board(g, 0, CardType.PEPPERBOX, {
        props: { green: true, bangEffect: true }, suit: Suits.HEARTS,
    });
    pepper._playedTurn = 0;
    g.turnId = 9;
    const forced = mkForced(g, CardType.BANG);
    assert.ok(forced);
    g.activateGreenCard(0, pepper.id, { targetIdx: 1 });
    assert.equal(g.players[0].board.length, 0, 'zelená karta se odhodila – aktivace prošla');
    assert.equal(g.players[0].bangsPlayedThisTurn, 0, 'limit zůstal volný pro vynucený Bang!');
});

test('Právo západu: zelená karta, která by vynucenou vypnula, se aktivovat nedá', () => {
    // Čutora doléčí život → vynucený Salón by přestal jít zahrát.
    const g = mkEv([{ role: 'Sheriff', health: 3 }, {}, {}], 'PRAVO_ZAPADU');
    const canteen = board(g, 0, CardType.CANTEEN, { props: { green: true, activate: 'heal_self' } });
    canteen._playedTurn = 0;
    g.turnId = 9;
    assert.ok(mkForced(g, CardType.SALOON));
    g.activateGreenCard(0, canteen.id, null);
    assert.equal(g.players[0].health, 3, 'aktivace neprošla');
    assert.equal(g.players[0].board.length, 1, 'zelená karta leží dál');
});
