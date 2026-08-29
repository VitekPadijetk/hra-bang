// Rozšíření Divoký západ – Lady Růže z Texasu (fáze 11).
//
// „Během svého tahu si může každý hráč vyměnit místo s hráčem po své pravici a ten tak
//  přeskočí svůj nejbližší tah."
//
// Podklad: docs/wild-west-show-plan.md §4.7 (rozhodnutí R4 – strop x použití ZA SEBOU,
// kde x = počet žijících hráčů, podle FAQ Q08).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { roseRightNeighbor, roseSwapOffer } = require('../core/playability.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const hnData = rd('cards.high_noon.json');
const ffData = rd('cards.fistful.json');
const wws = key => wwsData.find(c => c.key === key);
const hn = key => hnData.find(c => c.key === key);
const ff = key => ffData.find(c => c.key === key);

// Hra s aktivní Lady Růží. `current` = kdo je na tahu.
function mkRose(n = 4, current = 0) {
    const specs = [{ role: 'Sheriff' }];
    for (let i = 1; i < n; i++) specs.push({ role: i === n - 1 ? 'Renegade' : 'Outlaw' });
    const g = mkGame(specs, { current });
    g.activeWws = wws('LADY_RUZE_Z_TEXASU');
    return g;
}

// ── Kdo je „po pravici" ──────────────────────────────────────────────────────

test('po pravici = předchozí hráč po směru, tedy (i-1+n)%n', () => {
    const g = mkRose(4, 0);
    assert.equal(roseRightNeighbor(g, 0), 3);
    assert.equal(roseRightNeighbor(g, 2), 1);
});

test('vyřazený soused se přeskakuje (na prázdné sedadlo se nepřesedá)', () => {
    const g = mkRose(4, 0);
    g.players[3].health = 0;
    assert.equal(roseRightNeighbor(g, 0), 2);
});

test('duch (Město duchů) ve hře je, takže se s ním měnit smí', () => {
    const g = mkRose(4, 0);
    g.players[3].health = 0;
    g.players[3]._ghost = true;
    assert.equal(roseRightNeighbor(g, 0), 3);
});

test('Zlatá horečka směr „po pravici" nemění (efekt karty jde po směru, FAQ H3)', () => {
    const g = mkRose(4, 0);
    g.activeEvent = hn('ZLATA_HORECKA');
    assert.equal(g._turnStep(), g.players.length - 1);   // tahy jdou proti směru…
    assert.equal(roseRightNeighbor(g, 0), 3);            // …soused po pravici ne
});

// ── Nabídka ──────────────────────────────────────────────────────────────────

test('bez karty se nenabízí', () => {
    const g = mkRose(4, 0);
    g.activeWws = null;
    assert.equal(roseSwapOffer(g, 0), null);
});

test('nabízí se jen ve fázi PLAY a jen hráči na tahu', () => {
    const g = mkRose(4, 0);
    assert.equal(roseSwapOffer(g, 0), 3);
    assert.equal(roseSwapOffer(g, 1), null);
    g.phase = 'RESPOND';
    assert.equal(roseSwapOffer(g, 0), null);
});

// ── Fistful – Právo západu ───────────────────────────────────────────────────

test('Právo západu: přesednout jde, dokud po tom vynucená karta pořád platí', () => {
    const g = mkRose(4, 0);
    g.activeFistful = ff('PRAVO_ZAPADU');
    const bang = mkCard(CardType.BANG, { id: 501 });
    g.players[0].hand.push(bang);
    g.players[0]._lawCardId = 501;
    // Na sousedy dosáhne z obou sedadel, takže povinnost přesednutím nezanikne.
    assert.notEqual(roseSwapOffer(g, 0), null);
});

test('Právo západu: vyvléknout se z povinnosti přesednutím nejde', () => {
    // Vynucená Panika! dosáhne jen na vzdálenost 1. Na sedadle 0 na ni soused po
    // pravici (sedadlo 3) dosáhne – a je JEDINÝ, kdo má karty. Po přesednutí by na
    // sedadle 3 seděl hráč 0 a jediná oběť by mu utekla na vzdálenost 2, takže by
    // povinnost zmizela: to je přesně to, co Právo západu zakazuje.
    const g = mkRose(5, 0);
    g.activeFistful = ff('PRAVO_ZAPADU');
    const panic = mkCard(CardType.PANIC, { id: 502 });
    g.players[0].hand.push(panic);
    g.players[0]._lawCardId = 502;
    give(g, 1, CardType.BANG, { id: 600 });   // jediná oběť s kartami: sedadlo 1
    assert.equal(g.getDistance(0, 1), 1);
    assert.equal(roseSwapOffer(g, 0), null);
    assert.equal(g.useLadyRose(0), null);
});

// ── Výměna ───────────────────────────────────────────────────────────────────

test('výměna prohodí ruce, stoly i zbraně a tah si nese hráč s sebou', () => {
    const g = mkRose(4, 2);
    give(g, 2, CardType.BANG, { id: 101 });
    give(g, 1, CardType.BEER, { id: 202 });
    board(g, 2, CardType.BARREL, { id: 303 });
    g.players[2].weapon = { id: 404, name: 'Volcanic', type: CardType.WEAPON, props: { range: 1 } };
    const me = g.players[2], right = g.players[1];

    const res = g.useLadyRose(2);
    assert.deepEqual(res, { fromIdx: 2, toIdx: 1 });
    assert.equal(g.players[1], me);
    assert.equal(g.players[2], right);
    assert.equal(g.players[1].hand[0].id, 101);
    assert.equal(g.players[1].board[0].id, 303);
    assert.equal(g.players[1].weapon.id, 404);
    assert.equal(g.players[2].hand[0].id, 202);
    // Hráč si nese tah do nového sedadla.
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.getCurrentPlayer(), me);
});

test('vzdálenosti se počítají ze sedadel, takže se změní samy', () => {
    const g = mkRose(5, 0);
    const me = g.players[0], far = g.players[2];
    assert.equal(g.getDistance(0, 2), 2);
    g.useLadyRose(0);                       // hráč 0 si sedne na sedadlo 4
    assert.equal(g.players[4], me);
    assert.equal(g.getDistance(g.players.indexOf(me), g.players.indexOf(far)), 2);
    // Ze sedadla 4 je na sedadlo 2 vzdálenost 2 – ale soused, který se posunul, je teď blíž.
    assert.equal(g.getDistance(4, 3), 1);
});

test('prohozený hráč přeskočí právě jeden tah', () => {
    const g = mkRose(4, 0);
    const skipped = g.players[3];
    g.useLadyRose(0);
    assert.equal(skipped._skipNextTurn, true);
    // Po výměně sedí prohozený na sedadle 0, hráč na tahu na sedadle 3.
    assert.equal(g.currentPlayerIndex, 3);
    g.nextTurn();
    assert.notEqual(g.getCurrentPlayer(), skipped);
    assert.equal(g.currentPlayerIndex, 1);            // 3 → 0 (přeskočen) → 1
    assert.ok(!skipped._skipNextTurn);
    // Podruhé už se nepřeskakuje: prohozený sedí natrvalo na sedadle 0 a dojde na něj
    // hned v dalším kole.
    g.nextTurn(); g.nextTurn(); g.nextTurn();
    assert.equal(g.currentPlayerIndex, 0);
    assert.equal(g.getCurrentPlayer(), skipped);
});

test('přeskočený hráč nedostane penalizaci Madam Zuzany (nehrál, ale ani nesměl)', () => {
    const g = mkRose(4, 0);
    g.activeWws = wws('LADY_RUZE_Z_TEXASU');
    const skipped = g.players[3];
    g.useLadyRose(0);
    // Zuzana platí od téhle chvíle; kdyby přeskočený dostal tah, ztratil by život.
    g.activeWws = wws('MADAM_ZUZANA');
    skipped._skipNextTurn = true;
    const hp = skipped.health;
    g.nextTurn();
    assert.equal(skipped.health, hp);
    assert.equal(skipped._playedThisTurn ?? 0, 0);
});

test('přeskočený hráč nesnímá na Dynamit ani Vězení', () => {
    const g = mkRose(4, 0);
    const skipped = g.players[3];
    board(g, 3, CardType.JAIL, { id: 707 });
    g.useLadyRose(0);
    g.nextTurn();
    assert.notEqual(g.getCurrentPlayer(), skipped);
    assert.ok(!g.pendingCheckDraw);
    assert.equal(skipped.board.length, 1);            // Vězení leží dál
});

// ── Strop „x použití za sebou" (FAQ Q08) ─────────────────────────────────────

test('strop = počet žijících hráčů a platí NA SEBOU JDOUCÍ použití', () => {
    const g = mkRose(4, 0);
    for (let k = 0; k < 4; k++) {
        assert.notEqual(roseSwapOffer(g, g.currentPlayerIndex), null, `použití ${k + 1}`);
        assert.notEqual(g.useLadyRose(g.currentPlayerIndex), null);
    }
    assert.equal(g._roseStreak, 4);
    assert.equal(roseSwapOffer(g, g.currentPlayerIndex), null);
    assert.equal(g.useLadyRose(g.currentPlayerIndex), null);
});

test('strop klesá s ubývajícími hráči (počítají se ŽIJÍCÍ)', () => {
    const g = mkRose(5, 0);
    g.players[4].health = 0;
    g.players[3].health = 0;
    g._roseStreak = 3;
    assert.equal(roseSwapOffer(g, 0), null);           // žijí 3, strop je vyčerpaný
    g._roseStreak = 2;
    assert.notEqual(roseSwapOffer(g, 0), null);
});

test('tah, ve kterém místo nikdo neměnil, sérii vynuluje', () => {
    const g = mkRose(4, 0);
    g.useLadyRose(0);
    assert.equal(g._roseStreak, 1);
    g.nextTurn();                                       // sedadlo 0 se přeskakuje
    assert.equal(g._roseStreak, 1);                     // v končícím tahu se měnilo
    assert.equal(g._roseUsedThisTurn, false);
    g.nextTurn();                                       // tah bez výměny doběhl
    assert.equal(g._roseStreak, 0);
});

// ── Přemapování indexů ───────────────────────────────────────────────────────

test('výměna přemapuje paměť Lee Van Kliffa i čekající pokuty Roubíku', () => {
    const g = mkRose(4, 2);
    g._lastBrown = { playerIdx: 2, turnId: g.turnId, effect: 'BANG', aim: 'shoot' };
    g._gagPending = [2, 1, 3];
    g.useLadyRose(2);
    assert.equal(g._lastBrown.playerIdx, 1);
    assert.deepEqual(g._gagPending, [1, 2, 3]);
});

test('výměna přemapuje _firstDeadIdx (Mrtvý muž) i payloady cinematik vyřazení', () => {
    const g = mkRose(4, 0);
    g._firstDeadIdx = 3;
    g._deadPlayerIdx = 3;
    g._deathAnimPlayerIdx = 3;
    g._deathAnimData = { 3: { hand: [] } };
    g.useLadyRose(0);
    assert.equal(g._firstDeadIdx, 0);
    assert.equal(g._deadPlayerIdx, 0);
    assert.equal(g._deathAnimPlayerIdx, 0);
    assert.deepEqual(Object.keys(g._deathAnimData), ['0']);
});

test('výměna nesahá na indexy, které sedadlo neznamenají (stůl, ruka)', () => {
    const g = mkRose(4, 0);
    g.lastAnimEvent = { type: 'board_to_discard', fromPlayerIdx: 3, boardIdx: 0, cardId: 9 };
    g.charSelectIndex = 3;
    g.useLadyRose(0);
    assert.equal(g.lastAnimEvent.fromPlayerIdx, 0);     // sedadlo → přemapovat
    assert.equal(g.lastAnimEvent.boardIdx, 0);          // index do stolu → nechat
    assert.equal(g.charSelectIndex, 3);                 // nabídka postav → nechat
});

// Strukturální pojistka: sedadlo je index a stavu, který je jím klíčovaný, přibývá
// s každým pravidlem. Kdyby `_swapSeats` na nějaké pole zapomnělo, hra by po výměně
// míst ukazovala akci u špatného hráče. Test proto projde zdrojáky pravidel a vyžaduje,
// aby byl KAŽDÝ identifikátor vypadající jako index zařazený do jedné z tabulek
// v logic/wildWest.js – rozhodnout se o novém poli musí autor, ne náhoda.
test('strukturální: každý indexový klíč v logic/* je v tabulkách _swapSeats', () => {
    const T = require('../logic/wildWest.js')._SEAT_TABLES;
    const known = new Set([
        ...T.SEAT_KEYS, ...T.SEAT_LIST_KEYS, ...T.NOT_SEAT_KEYS, ...T.SEAT_SKIP_KEYS,
        // Lokální pomocníci a metody, které do stavu nikdy neuloží nic:
        'findIndex', '_firstPlayerIndex', '_eventFlipperIdx', '_deadManReturnIdx',
        'firstPlayerIndex', 'currentPlayerIdx', 'attIdx', 'tarIdx', 'pIdx', 'mainIdx',
        'firstIdx', 'selfIdx', 'deadManIdx', 'explicitKillerIdx',
    ]);
    const files = ['logic.js', ...fs.readdirSync(path.join(__dirname, '..', 'logic'))
        .filter(f => f.endsWith('.js')).map(f => 'logic/' + f)];
    const unknown = new Set();
    for (const f of files) {
        const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
        for (const m of src.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*(?:Idx|Idxs|Index|Indexes|Indices)\b/g)) {
            if (!known.has(m[0])) unknown.add(m[0]);
        }
    }
    assert.deepEqual([...unknown], [],
        'nové indexové pole: zařaď ho do SEAT_KEYS / SEAT_LIST_KEYS / NOT_SEAT_KEYS ' +
        'v logic/wildWest.js (jinak ho výměna míst Lady Růže přemapovat neumí)');
});
