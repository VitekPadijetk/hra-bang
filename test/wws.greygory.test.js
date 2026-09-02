// Divoký západ – Greygory Deck (fáze 10) a trychtýř `hasAbility`/`abilitiesOf`.
// Greygory má schopnosti DVOU náhodně líznutých postav naráz, takže se dotaz
// „umí X?" musel otočit z rovnosti jednoho jména na dotaz nad seznamem.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { abilitiesOf, hasAbility, effectiveCharacter } = require('../core/distance.js');

// ── abilitiesOf / hasAbility ────────────────────────────────────────────────
test('abilitiesOf: běžná postava má právě jednu schopnost', () => {
    const p = { character: 'Slab the Killer' };
    assert.deepEqual(abilitiesOf(p), ['Slab the Killer']);
    assert.equal(hasAbility(p, 'Slab the Killer'), true);
    assert.equal(hasAbility(p, 'Vulture Sam'), false);
});

test('abilitiesOf: hráč bez postavy i chybějící hráč vrací prázdno', () => {
    assert.deepEqual(abilitiesOf({ character: null }), []);
    assert.deepEqual(abilitiesOf(null), []);
    assert.deepEqual(abilitiesOf(undefined), []);
    assert.equal(hasAbility(null, 'Slab the Killer'), false);
});

test('Kocovina (High Noon) vypne schopnosti všem naráz, včetně Greygoryho dvojice', () => {
    const vera = { character: 'Vera Custer', _copiedCharacter: 'Slab the Killer', _noAbility: true };
    assert.deepEqual(abilitiesOf(vera), []);
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy', 'Suzy Lafayette'], _noAbility: true };
    assert.deepEqual(abilitiesOf(g), []);
    assert.equal(hasAbility(g, 'Bart Cassidy'), false);
});

test('Vera Custer se ptá skrz kopii', () => {
    const vera = { character: 'Vera Custer', _copiedCharacter: 'Jesse Jones' };
    assert.deepEqual(abilitiesOf(vera), ['Jesse Jones']);
    assert.equal(hasAbility(vera, 'Jesse Jones'), true);
    assert.equal(hasAbility(vera, 'Vera Custer'), false);
});

test('Greygory Deck má obě líznuté schopnosti, sám sebe ale ne', () => {
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy', 'Rose Doolan'] };
    assert.deepEqual(abilitiesOf(g), ['Bart Cassidy', 'Rose Doolan']);
    assert.equal(hasAbility(g, 'Bart Cassidy'), true);
    assert.equal(hasAbility(g, 'Rose Doolan'), true);
    assert.equal(hasAbility(g, 'Greygory Deck'), false);
    // Bez líznuté dvojice (smůla – nezbyla volná karta) nemá schopnost žádnou.
    assert.deepEqual(abilitiesOf({ character: 'Greygory Deck' }), []);
    assert.deepEqual(abilitiesOf({ character: 'Greygory Deck', _greygoryChars: [] }), []);
});

test('Vera kopírující Greygoryho jede podle SVÉ dvojice (R10)', () => {
    const vera = { character: 'Vera Custer', _copiedCharacter: 'Greygory Deck',
                   _greygoryChars: ['Willy the Kid', 'Paul Regret'] };
    assert.deepEqual(abilitiesOf(vera), ['Willy the Kid', 'Paul Regret']);
    assert.equal(hasAbility(vera, 'Paul Regret'), true);
});

test('abilitiesOf vrací KOPII pole – volající ho nesmí přepsat majiteli', () => {
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy'] };
    abilitiesOf(g).push('Slab the Killer');
    assert.deepEqual(g._greygoryChars, ['Bart Cassidy']);
});

test('effectiveCharacter zůstává vedle – jedna postava k ZOBRAZENÍ', () => {
    const g = { character: 'Greygory Deck', _greygoryChars: ['Bart Cassidy', 'Rose Doolan'] };
    assert.equal(effectiveCharacter(g), 'Greygory Deck');   // portrét se nemění
});

// ── Strukturální pojistka ───────────────────────────────────────────────────
// Bez ní se refaktor za půl roku rozjede zpátky: kdo napíše
// `effectiveCharacter(p) === "Bart Cassidy"`, ptá se na schopnost — a Greygorymu
// (ani Veře, která ho kopíruje) ta podmínka nikdy nesedne. Pravidla, bot i UI se
// na schopnost smí ptát VÝHRADNĚ přes hasAbility/abilitiesOf; effectiveCharacter
// zůstává pro to, kde jde o jednu postavu k zobrazení (portrét, overlay, štítek),
// a tam se se jménem postavy neporovnává.
test('nikde v pravidlech/botovi/UI nezbylo porovnání effectiveCharacter se jménem', () => {
    const files = ['core/playability.js', 'core/botPolicy.js', 'core/selection.js',
                   'view/board.js', 'logic.js', 'server/anim.js',
                   ...fs.readdirSync(__dirname + '/../logic').filter(f => f.endsWith('.js')).map(f => 'logic/' + f)];
    const bad = [];
    files.forEach(rel => {
        const src = fs.readFileSync(__dirname + '/../' + rel, 'utf8');
        src.split('\n').forEach((line, i) => {
            if (/effectiveCharacter\([^()]*\)\s*(===|!==)\s*["']/.test(line)) bad.push(`${rel}:${i + 1}`);
        });
    });
    assert.deepEqual(bad, [], 'schopnost se ptá přes hasAbility(p, "Jméno"), ne přes effectiveCharacter');
});

// ── Pravidla: pool, dvojice, nabídka na začátku tahu ────────────────────────
const { mkGame, mkCard, give, topDeck, Suits, CardType } = require('./_helpers.js');
const { ALL_CHARACTERS } = require('../logic.js');
const { pendingActor } = require('../core/pending.js');
const { decideBotAction } = require('../core/botPolicy.js');

function greyGame(specs, opts) {
    const g = mkGame(specs, opts);
    // Greygory líže postavy, ne karty – balíček je tu jen proto, aby start tahu mohl
    // po rozhodnutí dojet až do fáze lízání.
    for (let i = 0; i < 12; i++) topDeck(g, Suits.CLUBS);
    return g;
}

test('_greygoryPool: jen postavy základní hry a jen ty volné (R12)', () => {
    const g = greyGame([
        { character: 'Greygory Deck', role: 'Sheriff' },
        { character: 'Bart Cassidy' },
        { character: 'Big Spencer' },      // Divoký západ – v poolu nikdy nebyla
    ]);
    g.players[1]._secondChar = 'Willy the Kid';     // Nová identita: karta pod životy
    g.players[2]._greygoryChars = ['Rose Doolan'];  // druhý Greygory / Vera u stolu
    const pool = g._greygoryPool(0);
    assert.ok(!pool.includes('Bart Cassidy'), 'hraná postava je z balíčku pryč');
    assert.ok(!pool.includes('Willy the Kid'), 'odložená identita drží kartu obsazenou');
    assert.ok(!pool.includes('Rose Doolan'), 'cizí Greygoryho dvojice taky');
    assert.ok(pool.includes('Kit Carlson'));
    assert.equal(pool.length, ALL_CHARACTERS.length - 3);
    // Postavy rozšíření se do poolu nedostanou vůbec (FAQ Q30).
    assert.ok(!pool.includes('Big Spencer'));
});

test('_greygoryPool: VLASTNÍ dvojice se do poolu vrací (FAQ Q01)', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    const pool = g._greygoryPool(0);
    assert.ok(pool.includes('Kit Carlson') && pool.includes('Lucky Duke'));
});

test('_greygoryDraw: líže dvě, a když nezbývá, míň (i nula) – bez chyby', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    const drawn = g._greygoryDraw(0);
    assert.equal(drawn.length, 2);
    drawn.forEach(c => assert.ok(ALL_CHARACTERS.includes(c)));
    assert.ok(!drawn.includes('Bart Cassidy'));

    // Všechny volné karty rozebrané → „smůla" je legální stav, ne zaseknutí.
    g.players[1]._greygoryChars = ALL_CHARACTERS.filter(c => c !== 'Bart Cassidy');
    assert.deepEqual(g._greygoryDraw(0), []);
    assert.deepEqual(abilitiesOf(g.players[0]), []);
});

test('schopnosti obou líznutých postav platí naráz', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Paul Regret', 'Rose Doolan'];
    // Paul Regret: +1 ke vzdálenosti na něj, Rose Doolan: −1 z něj. Obojí najednou.
    assert.equal(g.getDistance(1, 0), 2);
    assert.equal(g.getDistance(0, 1), 1);
});

// ── Nabídka na začátku tahu ─────────────────────────────────────────────────
test('_greygoryOffer: na začátku tahu se ptá, co dál (a jen jeho)', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    assert.equal(g._greygoryOffer(), true);
    assert.equal(g.phase, 'GREYGORY_OFFER');
    assert.deepEqual(g.pendingGreygory.current, ['Kit Carlson', 'Lucky Duke']);
    assert.equal(g.pendingGreygory.free, ALL_CHARACTERS.length - 1);   // Bart je pryč
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'GREYGORY_OFFER' });

    // Někdo jiný na tahu → nic.
    g.phase = 'PLAY'; g.pendingGreygory = null; g.currentPlayerIndex = 1;
    assert.equal(g._greygoryOffer(), false);
});

test('_greygoryOffer: Kocovina schopnost vypne, takže se ani neptá', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._noAbility = true;
    assert.equal(g._greygoryOffer(), false);
});

test('_greygoryOffer: bez jediné volné karty se výměna nenabízí (past)', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    // Volné nezbyly – všechny ostatní drží spoluhráč jako odloženou identitu.
    g.players[1]._greygoryChars = ALL_CHARACTERS.filter(c => c !== 'Bart Cassidy');
    assert.equal(g._greygoryOffer(), false);
});

test('resolveGreygory: „nechat si" dvojici nemění a start tahu pokračuje', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    assert.equal(g._beginTurn(), true, 'start tahu se na nabídce pozastaví');
    assert.equal(g.resolveGreygory(0, false), true);
    assert.deepEqual(g.players[0]._greygoryChars, ['Kit Carlson', 'Lucky Duke']);
    assert.equal(g.pendingGreygory, null);
    // Kit Carlson je jedna z líznutých → fáze lízání jede rovnou po jeho způsobu.
    assert.equal(g.drawPhaseState.isKitCarlson, true, 'start tahu pokračuje fází lízání');
});

test('resolveGreygory: výměna lízne novou dvojici', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    g._beginTurn();
    assert.equal(g.resolveGreygory(0, true), true);
    assert.equal(g.players[0]._greygoryChars.length, 2);
    assert.equal(g.pendingGreygory, null);
});

// ── Cinematika líznutí nové dvojice (bug 40) ─────────────────────────
test('_greygoryDraw: výměna nechá payload cinematiky, start hry ne', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    g._beginTurn();
    g.resolveGreygory(0, true);
    const a = g._greygoryAnim;
    assert.ok(a, 'výměna cinematiku plánuje');
    assert.equal(a.playerIdx, 0);
    assert.deepEqual(a.old, ['Kit Carlson', 'Lucky Duke']);
    assert.deepEqual(a.next, g.players[0]._greygoryChars);
    // Balíček je velký tak, jak je: vlastní dvojice se do něj vrací (FAQ Q01),
    // takže je v `poolSize` započítaná a nová dvojice z něj musí jít vybrat.
    assert.ok(a.poolSize >= a.next.length);
    assert.ok(a.poolSize >= a.old.length);

    // Rozdání na začátku hry se nehraje – karty postav tam rozdává intro.
    const g2 = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g2.players[0]._greygoryChars = null;
    g2._greygoryDealAll();
    assert.ok(!g2._greygoryAnim);
});

test('resolveGreygory: „nechat si" žádnou cinematiku nespustí', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    g._beginTurn();
    g.resolveGreygory(0, false);
    assert.ok(!g._greygoryAnim);
});

test('resolveGreygory: cizí hráč rozhodnutí neposune', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    g._beginTurn();
    assert.equal(g.resolveGreygory(1, true), false);
    assert.equal(g.phase, 'GREYGORY_OFFER');
});

test('bot: prázdnou dvojici vždy vymění, dobrou si nechá', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = [];
    g._greygoryOffer();
    assert.deepEqual(decideBotAction(g, 0), { event: 'greygory_choice', payload: { swap: true } });

    g.phase = 'PLAY'; g.pendingGreygory = null;
    g.players[0]._greygoryChars = ['Willy the Kid', 'Slab the Killer'];   // 10 + 10
    g._greygoryOffer();
    assert.equal(decideBotAction(g, 0).payload.swap, false);

    g.phase = 'PLAY'; g.pendingGreygory = null;
    g.players[0]._greygoryChars = ['Vulture Sam', 'Black Jack'];          // 4 + 5
    g._greygoryOffer();
    assert.equal(decideBotAction(g, 0).payload.swap, true);
});

// ── Vera Custer kopírující Greygoryho (R10) ──────────────────────────
test('Vera si volbou kopie rovnou lízne vlastní dvojici', () => {
    const g = greyGame([{ character: 'Vera Custer', role: 'Sheriff' },
                        { character: 'Greygory Deck' }, { character: 'Bart Cassidy' }]);
    g.players[1]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    g.turnId = 1;
    g.startDrawPhase();
    assert.equal(g.phase, 'VERA_COPY');
    assert.ok(g.pendingVeraCopy.choices.includes('Greygory Deck'));
    g.veraCopyCharacter(0, 'Greygory Deck');
    assert.equal(g.players[0]._copiedCharacter, 'Greygory Deck');
    assert.equal(g.players[0]._greygoryChars.length, 2, 'Vera dostala vlastní dvojici');
    // Greygoryho vlastní dvojice se jí nedostane – jeho karty jsou obsazené.
    g.players[0]._greygoryChars.forEach(c => assert.ok(!['Kit Carlson', 'Lucky Duke'].includes(c)));
    assert.deepEqual(g.players[1]._greygoryChars, ['Kit Carlson', 'Lucky Duke'], 'Greygorymu dvojice zůstává');
    // Schopnosti platí jí, ne přes Greygoryho.
    assert.deepEqual(abilitiesOf(g.players[0]), g.players[0]._greygoryChars);
});

test('Veře dvojice vyprší spolu s kopií, Greygorymu mezi tahy zůstává', () => {
    const g = greyGame([{ character: 'Vera Custer', role: 'Sheriff' },
                        { character: 'Greygory Deck' }, { character: 'Bart Cassidy' }]);
    g.turnId = 1;
    g.startDrawPhase();
    g.veraCopyCharacter(0, 'Greygory Deck');
    assert.equal(g.players[0]._greygoryChars.length, 2);

    // Její další tah: kopie i dvojice vyprší ještě před novou volbou.
    g.turnId = 2;
    g.startDrawPhase();
    assert.equal(g.phase, 'VERA_COPY');
    assert.equal(g.players[0]._copiedCharacter, null);
    assert.equal(g.players[0]._greygoryChars, null);

    // Greygorymu na jeho tahu nic nevyprší – dvojici si nese dál.
    g.currentPlayerIndex = 1;
    g.phase = 'PLAY';
    g.players[1]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    g.turnId = 3;
    g.startDrawPhase();
    assert.deepEqual(g.players[1]._greygoryChars, ['Kit Carlson', 'Lucky Duke']);
});

test('_greygoryDealAll: dvojici dostane na začátku hry jen Greygory, a jen když ji nemá', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' },
                        { character: 'Greygory Deck' }, { character: 'Bart Cassidy' }]);
    g.players[1]._greygoryChars = ['Kit Carlson', 'Lucky Duke'];
    g._greygoryDealAll();
    assert.equal(g.players[0]._greygoryChars.length, 2);
    assert.deepEqual(g.players[1]._greygoryChars, ['Kit Carlson', 'Lucky Duke'], 'hotovou dvojici nepřepisuje');
    assert.equal(g.players[2]._greygoryChars, undefined);
    // Dva Greygoryové u stolu si nikdy nesáhnou na tutéž kartu.
    g.players[0]._greygoryChars.forEach(c => assert.ok(!g.players[1]._greygoryChars.includes(c)));
});

// ── Kombinace schopností ve fázi lízání (FAQ Q31) ──────────────────────
test('Kit Carlson + Jesse Jones: první karta z cizí ruky, druhá z odkryté řady', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Jesse Jones'];
    give(g, 1, CardType.BANG);
    g.startDrawPhase();
    assert.ok(g.drawPhaseState.options.includes('opponent_hand'), 'Jesseho zdroj je v nabídce');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);

    g.drawCard('opponent_hand', 1);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.phase, 'DRAW', 'fáze pokračuje, Kit teprve přijde');

    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    assert.equal(g.kitCarlsonState.revealed.length, 3, 'odkrývá vždy tři');
    assert.equal(g.kitCarlsonState.needed, 1, 'z řady si nechá už jen jednu');
    g.kitCarlsonPick(0);
    assert.equal(g.players[0].hand.length, 2);
    assert.equal(g.phase, 'PLAY', 'fáze lízání skončila');
});

test('obyčejný Kit Carlson zůstává beze změny (jeden klik, jen balíček)', () => {
    const g = greyGame([{ character: 'Kit Carlson', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.startDrawPhase();
    assert.deepEqual(g.drawPhaseState.options, ['deck']);
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.kitCarlsonState.needed, 2);
});

test('Kit Carlson + Black Jack: druhá ponechaná se ukáže, červená = karta navíc', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Black Jack'];
    g.deck.cards = [];
    for (let i = 0; i < 4; i++) topDeck(g, Suits.CLUBS);
    topDeck(g, Suits.HEARTS);
    topDeck(g, Suits.CLUBS);
    topDeck(g, Suits.CLUBS);
    g.startDrawPhase();
    g.drawCard('deck');
    assert.equal(g.phase, 'KIT_CARLSON');
    const redIdx = g.kitCarlsonState.revealed.findIndex(c => c.suit === Suits.HEARTS);
    // Červenou si nechá jako DRUHOU – to je ta, kterou Black Jack ukazuje.
    g.kitCarlsonPick(redIdx === 0 ? 1 : 0);
    g.kitCarlsonPick(redIdx);
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    assert.equal(g.drawPhaseState.blackJackCard.suit, Suits.HEARTS);
    assert.equal(g.players[0].hand.length, 2, 'karta už v ruce JE, jen se ukazuje');
    g.resolveBlackJack(true);
    assert.equal(g.phase, 'DRAW', 'za červenou si líže jednu navíc');
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 3);
    assert.equal(g.phase, 'PLAY');
});

test('Kit Carlson + Black Jack: černá druhá karta = žádný bonus', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Kit Carlson', 'Black Jack'];
    g.deck.cards = [];
    for (let i = 0; i < 6; i++) topDeck(g, Suits.SPADES);
    g.startDrawPhase();
    g.drawCard('deck');
    g.kitCarlsonPick(0);
    g.kitCarlsonPick(1);
    assert.equal(g.phase, 'BLACK_JACK_CHECK');
    g.resolveBlackJack(true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand.length, 2);
});

test('Jesse Jones + Pedro Ramirez: obě možnosti naráz (nabídka je seznam)', () => {
    const g = greyGame([{ character: 'Greygory Deck', role: 'Sheriff' }, { character: 'Bart Cassidy' }]);
    g.players[0]._greygoryChars = ['Jesse Jones', 'Pedro Ramirez'];
    g.deck.discard(mkCard(CardType.BANG));
    g.startDrawPhase();
    assert.ok(g.drawPhaseState.options.includes('opponent_hand'));
    assert.ok(g.drawPhaseState.options.includes('discard'));
});
