// Testy čisté botí policy (core/botPolicy.js): pendingActor + decideBotAction.
// Stav stavíme přes sdílené _helpers (ruční GameState) – policy běží nad stejným tvarem.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mkGame, give, board, CardType, Suits } = require('./_helpers.js');
const { pendingActor, decideBotAction, roleHostility } = require('../core/botPolicy.js');

before(() => { console.log = () => {}; });

// ── pendingActor ─────────────────────────────────────────────────────────────
test('pendingActor: PLAY → aktuální hráč', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'PLAY', current: 1 });
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'PLAY' });
});

test('pendingActor: RESPOND → cíl pendingResponse', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    g.pendingResponse = { active: true, targetIdx: 0, requiredCard: 'Vedle!', responded: [] };
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'RESPOND' });
});

test('pendingActor: neaktivní pendingResponse → null', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    g.pendingResponse = { active: false, targetIdx: 0 };
    assert.equal(pendingActor(g), null);
});

test('pendingActor: CHARACTER_SELECT → první hráč bez postavy', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'CHARACTER_SELECT' });
    g.players[0].charChoices = ['Willy the Kid', 'Sid Ketchum'];
    g.players[1].charChoices = ['Bart Cassidy', 'Black Jack'];
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'CHARACTER_SELECT' });
});

// ── role: nepřátelskost (čistá tabulka rolí, bez čtení stavu) ──────────────────
test('role: bandita nejvíc cílí šerifa, šerif nikdy pomocníka', () => {
    assert.ok(roleHostility('Outlaw', 'Sheriff') > roleHostility('Outlaw', 'Deputy'));
    assert.ok(roleHostility('Sheriff', 'Deputy') < 0);
    assert.ok(roleHostility('Sheriff', 'Outlaw') > 0);
});

// ── PLAY ───────────────────────────────────────────────────────────────────────
test('PLAY: bandita vystřelí Bang na šerifa v dostřelu', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Deputy' }], { current: 0 });
    const bangIdx = give(g, 0, CardType.BANG);
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.targetIdx, 1);   // šerif, ne pomocníci
    assert.equal(a.payload.cardIdx, bangIdx);
});

test('PLAY: šerif míří na prokázaného nepřítele, ne na prokázaného spojence (skryté role)', () => {
    // Bot NEZNÁ role – dedukuje z chování. 5 hráčů: sousedé šerifa jsou idx1 a idx4.
    // Ledger: idx1 útočil na šerifa (nepřítel); idx4 bránil šerifa (útočil na idx1) → spojenec.
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }, { role: 'Deputy' }], { current: 0 });
    give(g, 0, CardType.BANG);
    g.behaviorLedger = { pairs: { 1: { 0: { hostile: 3 } }, 4: { 1: { hostile: 3 } } } };
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_bang');
    assert.equal(a.payload.targetIdx, 1);   // prokázaný nepřítel, ne obránce (idx4)
});

test('PLAY: nízké HP → přednost Pivu před útokem', () => {
    // Pivo je hratelné jen při >2 živých (viz cardPlayability), proto 3 hráči.
    const g = mkGame([{ role: 'Outlaw', maxHealth: 4, health: 1 }, { role: 'Sheriff' }, { role: 'Deputy' }], { current: 0 });
    const beerIdx = give(g, 0, CardType.BEER);
    give(g, 0, CardType.BANG);
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_card');
    assert.equal(a.payload, beerIdx);
});

test('PLAY: prázdná/nehratelná ruka → end_turn', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'end_turn');
});

// ── RESPOND ─────────────────────────────────────────────────────────────────────
test('RESPOND: uhne kartou Vedle!', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'RESPOND' });
    const dodge = give(g, 0, CardType.MISSED);
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_to_card', payload: { playerIdx: 0, cardIndex: dodge } });
});

test('RESPOND: bez obrany → schytá zásah (cardIndex null)', () => {
    const g = mkGame([{ role: 'Outlaw', health: 3 }, { role: 'Sheriff' }], { phase: 'RESPOND' });
    give(g, 0, CardType.BEER);
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_to_card', payload: { playerIdx: 0, cardIndex: null } });
});

test('RESPOND: poslední život bez Vedle! → záchrana Pivem', () => {
    const g = mkGame([{ role: 'Outlaw', health: 1 }, { role: 'Sheriff' }, { role: 'Deputy' }], { phase: 'RESPOND' });
    const beer = give(g, 0, CardType.BEER);
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_with_beer', payload: { playerIdx: 0, cardIdx: beer } });
});

// ── DISCARD ─────────────────────────────────────────────────────────────────────
test('DISCARD: odhodí nejméně cennou kartu (dynamit dřív než Bang)', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'DISCARD', current: 0 });
    const dyn = give(g, 0, CardType.DYNAMITE);
    give(g, 0, CardType.BANG);
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'discard_card', payload: dyn });
});

// ── DRAW ─────────────────────────────────────────────────────────────────────────
test('DRAW: líznutí z balíčku', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'DRAW', current: 0 });
    g.drawPhaseState = { active: true, playerIdx: 0, cardsNeeded: 2, cardsDrawn: 0, options: ['deck'] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'draw_card', payload: { source: 'deck', sourceIdx: null } });
});

// ── CHARACTER_SELECT ───────────────────────────────────────────────────────────
test('CHARACTER_SELECT: vybere výše hodnocenou postavu', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'CHARACTER_SELECT' });
    g.players[0].charChoices = ['Sid Ketchum', 'Willy the Kid'];
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'select_character', payload: 'Willy the Kid' });
});

// ── Skryté role: cílení podle chování ─────────────────────────────────────────
test('PLAY: bandita NEstřílí prokázaného spoluodpadlíka; radši ukončí tah', () => {
    // 5 hráčů. Sousedé bota (Outlaw idx0) jsou idx1 a idx4. Ledger: oba útočili na
    // šerifa → vypadají jako spoluodpadlíci (spojenci). Ostatní nepřátelé mimo dosah.
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Renegade' }, { role: 'Deputy' }], { current: 0 });
    give(g, 0, CardType.BANG);
    g.behaviorLedger = { pairs: { 1: { 2: { hostile: 4 } }, 4: { 2: { hostile: 4 } } } };
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'end_turn');   // nestřílí na spojence, šerif je mimo dosah
});

// ── Hraní všech karet: dynamit ────────────────────────────────────────────────
test('PLAY: dynamit se zahraje, když po proudu jsou nepřátelé', () => {
    // Outlaw(0), hned za ním šerif(1) → dynamit letí k nepříteli.
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }], { current: 0 });
    const dyn = give(g, 0, CardType.DYNAMITE);
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'play_card', payload: dyn });
});

// ── Hraní všech karet: zelené karty (Dodge City) ──────────────────────────────
test('PLAY: zelenou kartu z ruky vyloží na stůl', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    const gi = give(g, 0, CardType.IRON_PLATE, { props: { green: true, activate: 'miss' } });
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'play_card', payload: gi });
});

test('PLAY: aktivuje zelenou bang-efekt kartu ze stolu na nepřítele', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    g.turnId = 5;
    const knife = board(g, 0, CardType.KNIFE, { props: { green: true, bangEffect: true, range: 1 } });
    knife._playedTurn = 1;   // z minulého tahu → aktivovatelná
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'activate_green_card');
    assert.equal(a.payload.cardId, knife.id);
    assert.equal(a.payload.target.targetIdx, 1);   // šerif (veřejný nepřítel)
});

// ── Hraní všech karet: „odhoď další kartu" ────────────────────────────────────
test('PLAY: Springfield zahájí discard_extra_choose na nepřítele', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    const spr = give(g, 0, CardType.SPRINGFIELD, { props: { discardExtra: 'bang_any' } });
    give(g, 0, CardType.MISSED);   // druhá karta jako cena (v tahu nehratelná)
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'discard_extra_choose');
    assert.equal(a.payload.cardIdx, spr);
    assert.equal(a.payload.targetIdx, 1);
});

// ── Hraní všech karet: aktivní schopnost postavy ──────────────────────────────
test('PLAY: Chuck Wengam využije schopnost, když je chudý na karty', () => {
    const g = mkGame([{ role: 'Outlaw', character: 'Chuck Wengam', health: 4 }, { role: 'Sheriff' }], { current: 0 });
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'chuck_wengam' });
});

// ── RESPOND: zelená obrana ze stolu ───────────────────────────────────────────
test('RESPOND: bez Vedle! v ruce použije zelenou obranu ze stolu', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { phase: 'RESPOND', current: 1 });
    g.turnId = 7;
    const plate = board(g, 0, CardType.IRON_PLATE, { props: { green: true, activate: 'miss' } });
    plate._playedTurn = 2;
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0, requiredCard: 'Vedle!', sourceCard: 'Bang!', responded: [] };
    const a = decideBotAction(g, 0);
    assert.deepEqual(a, { event: 'respond_to_card', payload: { playerIdx: 0, cardIndex: null, boardCardId: plate.id } });
});

// ── LUCKY DUKE ─────────────────────────────────────────────────────────────────
test('LUCKY_DUKE: pro dynamit vybere kartu, která NENÍ piky 2–9', () => {
    const g = mkGame([{ role: 'Outlaw', character: 'Lucky Duke' }], { phase: 'LUCKY_DUKE' });
    g.luckyDukeState = {
        cards: [
            { suit: Suits.SPADES, value: '5' },   // piky 5 = výbuch (špatné)
            { suit: Suits.HEARTS, value: '8' },   // bezpečné
        ],
        checkContext: { reason: 'DYNAMITE', playerIdx: 0 },
    };
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'lucky_duke_pick');
    assert.equal(a.payload, 1);
});

// ── Pozitivní vs. negativní karty na stole ────────────────────────────────────
test('SELECTING_TARGET_CARD: Cat Balou nepříteli nesundá Vězení (pomohl by mu)', () => {
    // Nepřítel má na stole jen Vězení + karty v ruce → bot musí sáhnout do ruky.
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }], { phase: 'SELECTING_TARGET_CARD', current: 0 });
    board(g, 1, CardType.JAIL);
    give(g, 1, CardType.BANG);
    g.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: CardType.CAT_BALOU };
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'select_target_card');
    assert.equal(a.payload.area, 'hand');
});

test('SELECTING_TARGET_CARD: Cat Balou nepříteli zničí barel, ne dynamit', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }], { phase: 'SELECTING_TARGET_CARD', current: 0 });
    board(g, 1, CardType.DYNAMITE);
    const barrel = board(g, 1, CardType.BARREL);
    g.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: CardType.CAT_BALOU };
    const a = decideBotAction(g, 0);
    assert.equal(a.payload.area, 'board');
    assert.equal(g.players[1].board[a.payload.cardIdx].id, barrel.id);
});

test('SELECTING_TARGET_CARD: Rvačka spojenci sundá Vězení (ne jeho barel)', () => {
    // Ledger: idx2 a idx3 útočili na šerifa (nepřátelé), idx1 na oba → šerifův spojenec.
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }],
        { phase: 'SELECTING_TARGET_CARD', current: 0 });
    g.behaviorLedger = { pairs: { 1: { 2: { hostile: 4 }, 3: { hostile: 4 } },
                                  2: { 0: { hostile: 4 } }, 3: { 0: { hostile: 4 } } } };
    board(g, 1, CardType.BARREL);
    const jail = board(g, 1, CardType.JAIL);
    give(g, 1, CardType.BANG);
    g.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: CardType.CAT_BALOU, isBrawl: true };
    const a = decideBotAction(g, 0);
    assert.equal(a.payload.area, 'board');
    assert.equal(g.players[1].board[a.payload.cardIdx].id, jail.id);
});

test('PLAY: Cat Balou nemíří na hráče, kterému leží na stole jen Vězení', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }, { role: 'Deputy' }], { current: 0 });
    give(g, 0, CardType.CAT_BALOU);
    board(g, 1, CardType.JAIL);     // jediná „hodnota" šerifa = vězení, které mu škodí
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'end_turn');
});

// ── Zbraně: jedna za tah, nejlepší z ruky, Volcanic není „jen dostřel 1" ───────
test('PLAY: bot vyloží jen JEDNU zbraň za tah', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    g.turnId = 4;
    g.players[0].weapon = { id: 70, name: 'Winchester', type: CardType.WEAPON, props: { range: 5 }, range: 5, _playedTurn: 4 };
    give(g, 0, CardType.WEAPON, { name: 'Rev. Carabine', props: { range: 4 } });
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'end_turn');   // lepší zbraň si nechá „v zásobě" na příště
});

test('PLAY: z ruky vyloží NEJLEPŠÍ zbraň', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    g.turnId = 4;
    give(g, 0, CardType.WEAPON, { name: 'Schofield', props: { range: 2 } });
    const remington = give(g, 0, CardType.WEAPON, { name: 'Remington', props: { range: 3 } });
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_card');
    assert.equal(a.payload, remington);
});

test('PLAY: Volcanic je lepší než Colt .45, i když má taky dostřel 1', () => {
    const g = mkGame([{ role: 'Outlaw' }, { role: 'Sheriff' }], { current: 0 });
    g.turnId = 4;
    const volcanic = give(g, 0, CardType.WEAPON, { name: 'Volcanic', props: { range: 1 } });
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'play_card');
    assert.equal(a.payload, volcanic);
});

// ── Navazující hra: ponechání postavy je náhodné ──────────────────────────────
test('keep_character: bot si postavu nenechává vždy (šance dle kvality postavy)', () => {
    const { keepCharacterChance, decideKeepCharacter } = require('../core/botPolicy.js');
    assert.ok(keepCharacterChance('Willy the Kid') > keepCharacterChance('Vulture Sam'));
    assert.ok(keepCharacterChance('Vulture Sam') > 0 && keepCharacterChance('Willy the Kid') < 1);
    assert.equal(decideKeepCharacter('Willy the Kid', () => 0), true);    // vždy „ano" při rnd=0
    assert.equal(decideKeepCharacter('Willy the Kid', () => 0.99), false); // a „ne" při rnd≈1

    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'CHARACTER_SELECT' });
    g.players[0]._awaitingKeepChoice = true;
    g.players[0]._survivorChar = 'Vulture Sam';
    const a = decideBotAction(g, 0);
    assert.equal(a.event, 'keep_character');
    assert.equal(typeof a.payload, 'boolean');
});

// ── Koncovka: zákon vs. odpadlík, nikdo není prokázaný nepřítel ────────────────
// Zbývá šerif + pomocníci + odpadlík (banditi mrtví = role veřejné). Pro stranu šerifa
// je každý živý jen z 1/3 nepřítel, takže očekávaná nepřátelskost vyjde u všech záporně –
// bez nouzového cílení by šerif ani pomocníci nikdy nezaútočili a hra by uvázla.
const endgame = (current) => {
    const g = mkGame([
        { role: 'Sheriff' }, { role: 'Deputy' }, { role: 'Renegade' }, { role: 'Deputy' },
        { role: 'Outlaw', health: 0 }, { role: 'Outlaw', health: 0 }, { role: 'Outlaw', health: 0 },
    ], { current });
    give(g, current, CardType.BANG);
    return g;
};

test('PLAY: šerif v koncovce (jen pomocníci a odpadlík) přesto útočí, neuvázne', () => {
    const a = decideBotAction(endgame(0), 0);
    assert.equal(a.event, 'play_bang');
    assert.ok([1, 2, 3].includes(a.payload.targetIdx));
});

test('PLAY: pomocník v koncovce přesto útočí, neuvázne', () => {
    const a = decideBotAction(endgame(1), 1);
    assert.equal(a.event, 'play_bang');
    assert.ok([0, 2, 3].includes(a.payload.targetIdx), 'nesmí to být on sám');
    assert.notEqual(a.payload.targetIdx, 0, 'na veřejného šerifa pomocník nikdy nestřílí');
});

test('PLAY: nouzové cílení nikdy nesáhne na JISTÉHO spojence (šerif ↔ pomocník)', () => {
    // 5 hráčů (Sheriff, 2× Outlaw, Renegade, Deputy). Všichni krom šerifa a pomocníka jsou
    // mrtví → v poolu zbývá jediná role (Deputy), takže jediný živý soupeř je pro šerifa
    // jistý spojenec. Nouzové cílení se na něj nesmí svézt.
    const g = mkGame([
        { role: 'Sheriff' }, { role: 'Outlaw', health: 0 }, { role: 'Outlaw', health: 0 },
        { role: 'Renegade', health: 0 }, { role: 'Deputy' },
    ], { current: 0 });
    give(g, 0, CardType.BANG);
    const a = decideBotAction(g, 0);
    assert.notEqual(a.event, 'play_bang', 'na jistého pomocníka šerif nestřílí ani v nouzi');
});

// ── Invariant „bot se nikdy nezasekne" ───────────────────────────────────────
// Historicky nejčastější chyba v projektu: nové pravidlo dostane vlastní fázi, ale bot
// pro ni nemá větev → decideBotAction vrátí null, stav se nezmění, driver posílá totéž
// donekonečna a hra jen botů zamrzne. Test to hlídá strukturálně nad zdrojem, takže na
// nové pravidlo upozorní hned, ne až zátěžová hra náhodou trefí tu správnou kartu.
test('každý kind z pendingActor má v decideBotAction svou větev', () => {
    const pendingSrc = fs.readFileSync(__dirname + '/../core/pending.js', 'utf8');
    const botSrc = fs.readFileSync(__dirname + '/../core/botPolicy.js', 'utf8');

    // Jen tělo pendingActor – describePendingCheck níž má vlastní `kind` (DYNAMITE,
    // JAIL, BARREL, VENDETTA), což jsou popisky pro UI, ne rozhodnutí, na které se čeká.
    const from = pendingSrc.indexOf('function pendingActor');
    const to = pendingSrc.indexOf('function waitingStatus');
    assert.ok(from !== -1 && to > from, 'pendingActor/waitingStatus se v pending.js našly');
    const kinds = [...new Set([...pendingSrc.slice(from, to).matchAll(/kind: '([A-Z_]+)'/g)].map(m => m[1]))];
    assert.ok(kinds.length > 25, `kindů je rozumný počet (${kinds.length})`);

    const branches = new Set([...botSrc.matchAll(/case '([A-Z_]+)'/g)].map(m => m[1]));
    // Výběr postavy řeší decideBotAction ještě PŘED switchem (rozhoduje se podle
    // konkrétního hráče, ne podle toho, na koho se čeká) – viz začátek funkce.
    const PRE_SWITCH = new Set(['CHARACTER_SELECT', 'KEEP_CHOICE']);
    const missing = kinds.filter(k => !branches.has(k) && !PRE_SWITCH.has(k));
    assert.deepEqual(missing, [], 'každá fáze musí mít větev bota, jinak se hra jen botů zasekne');

    // A obráceně: PRE_SWITCH větve opravdu existují (ať se allowlist nestane výmluvou).
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'CHARACTER_SELECT' });
    g.players[0].charChoices = ['Slab the Killer', 'Vulture Sam'];
    assert.equal(decideBotAction(g, 0).event, 'select_character');
    g.players[0].charChoices = [];
    g.players[0]._awaitingKeepChoice = true;
    g.players[0]._survivorChar = 'Slab the Killer';
    assert.equal(decideBotAction(g, 0).event, 'keep_character');
});
