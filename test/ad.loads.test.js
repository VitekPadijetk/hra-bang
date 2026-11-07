// Rozšíření Ozbrojení a nebezpeční – fáze A1 (dobíjení a placení): rozmístění žetonů
// (fáze AD_PLACE za modrou kartu, za odhoz nad limit, Nabíjení), platba za vylepšení,
// použití Nebezpečných karet (Eso v rukávu, Bečka piva, Zvonice), Bandalír, Kolona,
// Malý doušek a bot.
//
// Podklad: docs/ozbrojeni-a-nebezpecni-plan.md §2.7–2.9, §4 (A1) a §6.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GameState, CardType, Suits, Card } = require('../logic.js');
const { distinctCardKinds } = require('../logic/entities.js');
const { cardPlayability } = require('../core/playability.js');
const { pendingActor, waitingStatus } = require('../core/pending.js');
const { computeDistance } = require('../core/distance.js');
const { decideBotAction } = require('../core/botPolicy.js');
const A = require('../core/armed.js');
const { mkGame, mkCard, give, board } = require('./_helpers');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const adData = rd('cards.ozbrojeni.json');
const AD_ON = { expansions: { ozbrojeni: true } };

let _seq = 91000;
function adCard(name) {
    const row = adData.find(c => c.name === name);
    const c = new Card(_seq++, row.name, CardType[row.type], Suits[row.suit], row.value, row.props || {});
    c.effect = row.props?.effect || null;
    c.exp = row.exp; c.border = row.border; c.art = row.art;
    return c;
}
function giveAd(g, idx, name) {
    g.players[idx].hand.push(adCard(name));
    return g.players[idx].hand.length - 1;
}
// Nebezpečná karta rovnou na stole se `n` žetony.
function armed(g, idx, name, n = 3) {
    const c = adCard(name);
    if (c.type === CardType.WEAPON) g.players[idx].weapon = c; else g.players[idx].board.push(c);
    g._adAdd(c, n, { fresh: true });
    return c;
}
function mkAd(specs, opts) {
    const g = mkGame(specs, opts);
    g.options = AD_ON;
    g.turnId = 7;
    return g;
}
// Plný balíček obyčejných karet, ať se má z čeho lízat.
function fillDeck(g, n = 20) {
    for (let i = 0; i < n; i++) g.deck.cards.push(mkCard(CardType.MISSED, { suit: Suits.SPADES }));
}

// ── Rozmístění žetonů (§2.7) ─────────────────────────────────────────────────

test('modrá karta: po zahrání fáze AD_PLACE na 1 žeton, klik na postavu ho položí', () => {
    const g = mkAd([{}, {}]);
    const i = give(g, 0, CardType.BARREL, { name: 'Barel' });
    g.playCard(i);
    assert.equal(g.phase, 'AD_PLACE');
    assert.deepEqual({ ...g.pendingAdPlace }, { playerIdx: 0, left: 1, reason: 'BLUE' });
    assert.deepEqual(pendingActor(g), { idx: 0, kind: 'AD_PLACE' });
    assert.match(waitingStatus(g).text, /žetony nabití \(1\) – za modrou kartu/);
    assert.equal(g.adPlace(1, 1, null), false, 'cizí hráč klikat nesmí');
    assert.equal(g.adPlace(0, 1, null), false, 'na cizí postavu ne');
    assert.equal(g.adPlace(0, 0, null), true);
    assert.equal(g.players[0].adLoads, 1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.pendingAdPlace, null);
    assert.equal(g._adSupply(), 31);
});

test('modrá karta: žeton jde i na vlastní Nebezpečnou kartu; nechat v zásobě jde vždycky', () => {
    const g = mkAd([{}, {}]);
    const bell = armed(g, 0, 'Zvonice', 3);
    g.playCard(give(g, 0, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' }));
    assert.deepEqual(A.adPlaceTargets(g, 0).map(t => t.cardId), [bell.id, null]);
    g.adPlace(0, 0, bell.id);
    assert.equal(bell.adLoads, 4);
    assert.equal(g.phase, 'PLAY');
    g.playCard(give(g, 0, CardType.BARREL, { name: 'Barel' }));
    assert.equal(g.phase, 'AD_PLACE');
    assert.equal(g.adPlace(0, 0, bell.id), false, 'karta na stropu 4 už cílem není');
    assert.equal(g.adPlaceDone(0), true);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g._adSupply(), 28);
});

test('modrá karta: bez místa (prázdná zásoba) se do fáze vůbec nevstupuje', () => {
    const g = mkAd([{}, {}]);
    for (let k = 0; k < 8; k++) { const c = adCard('Bič'); c.name = 'Bič ' + k; g.players[1].board.push(c); g._adAdd(c, 4); }
    assert.equal(g._adSupply(), 0);
    g.playCard(give(g, 0, CardType.BARREL, { name: 'Barel' }));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.specialActionQueue.length, 0);
});

test('oranžová karta žeton za zahrání nedostává (R-U2), zelená taky ne', () => {
    const g = mkAd([{}, {}]);
    g.playCard(giveAd(g, 0, 'Zvonice'));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].adLoads || 0, 0);
    assert.equal(g._adSupply(), 29);
    const green = mkCard('Železný plát', { name: 'Železný plát' }); green.green = true; green.activate = 'miss';
    g.players[0].hand.push(green);
    g.playCard(g.players[0].hand.length - 1);
    assert.equal(g.phase, 'PLAY');
});

test('Vězení na jiného hráče: žeton dostane ten, kdo ho zahrál', () => {
    const g = mkAd([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    const i = give(g, 0, CardType.JAIL, { name: 'Vězení' });
    g.playSpecialCard(0, 1, i);
    assert.equal(g.phase, 'AD_PLACE');
    assert.equal(g.pendingAdPlace.playerIdx, 0);
    g.adPlace(0, 0, null);
    assert.equal(g.players[0].adLoads, 1);
    assert.equal(g.phase, 'PLAY');
});

test('bez rozšíření se nic nemění', () => {
    const g = mkGame([{}, {}]);
    g.playCard(give(g, 0, CardType.BARREL, { name: 'Barel' }));
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].adLoads || 0, 0);
});

test('odhoz nad limit: za každou odhozenou kartu 1 žeton, tah se posune až po rozmístění', () => {
    const g = mkAd([{ health: 2, maxHealth: 4 }, {}]);
    fillDeck(g);
    for (let k = 0; k < 4; k++) give(g, 0, CardType.MISSED, { name: 'Vedle!' });
    g.tryEndTurn();
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0);
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0);
    assert.equal(g.phase, 'AD_PLACE');
    assert.deepEqual({ ...g.pendingAdPlace }, { playerIdx: 0, left: 2, reason: 'DISCARD' });
    assert.equal(g.currentPlayerIndex, 0, 'tah se ještě neposunul');
    g.adPlace(0, 0, null);
    assert.equal(g.phase, 'AD_PLACE');
    g.adPlace(0, 0, null);
    assert.equal(g.players[0].adLoads, 2);
    assert.equal(g.currentPlayerIndex, 1, 'po rozmístění je na tahu další');
});

test('odhoz nad limit: „nechat v zásobě" taky posune tah; bez rozšíření rovnou', () => {
    const g = mkAd([{ health: 1, maxHealth: 4 }, {}]);
    fillDeck(g);
    for (let k = 0; k < 2; k++) give(g, 0, CardType.MISSED, { name: 'Vedle!' });
    g.tryEndTurn();
    g.discardCard(0);
    assert.equal(g.phase, 'AD_PLACE');
    g.adPlaceDone(0);
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[0].adLoads || 0, 0);
    assert.equal(g.players[0]._adDiscarded, 0, 'počítadlo se nuluje');
});

test('Nabíjení: 3 žetony v libovolné kombinaci, strop 4; bez místa nehratelné', () => {
    const g = mkAd([{}, {}]);
    const ace = armed(g, 0, 'Eso v rukávu', 2);
    const i = giveAd(g, 0, 'Nabíjení');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[i]), true);
    g.playCard(i);
    assert.equal(g.phase, 'AD_PLACE');
    assert.equal(g.pendingAdPlace.left, 3);
    assert.equal(g.pendingAdPlace.reason, 'RELOAD');
    g.adPlace(0, 0, ace.id);
    g.adPlace(0, 0, ace.id);
    assert.equal(ace.adLoads, 4);
    assert.equal(g.phase, 'AD_PLACE');
    g.adPlace(0, 0, null);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].adLoads, 1);
    assert.equal(g.deck.discardTop().name, 'Nabíjení');
    // Všechno na stropu → Nabíjení zahrát nejde.
    g._adAdd(g.players[0], 3);
    const j = giveAd(g, 0, 'Nabíjení');
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[j]), false);
    g.playCard(j);
    assert.equal(g.players[0].hand[j].name, 'Nabíjení', 'karta zůstala v ruce');
});

// ── Platba (§2.8) ────────────────────────────────────────────────────────────

test('adPayOk: jen vlastní zdroje, ne Bomba, ne víc než leží, přesně cena', () => {
    const g = mkAd([{}, {}]);
    const ace = armed(g, 0, 'Eso v rukávu', 2);
    g._adAdd(g.players[0], 1);
    const bomb = adCard('Bomba'); g.players[0].board.push(bomb); g._adAdd(bomb, 3, { fresh: true });
    const foreign = armed(g, 1, 'Zvonice', 3);
    const me = (cardId) => ({ seat: 0, cardId });
    assert.equal(A.adPayOk(g, 0, [me(null), me(ace.id)], 2), true);
    assert.equal(A.adPayOk(g, 0, [me(ace.id), me(ace.id)], 2), true);
    assert.equal(A.adPayOk(g, 0, [me(null), me(null)], 2), false, 'na postavě je jen 1');
    assert.equal(A.adPayOk(g, 0, [me(bomb.id), me(null)], 2), false, 'z Bomby se neplatí');
    assert.equal(A.adPayOk(g, 0, [{ seat: 1, cardId: foreign.id }, me(null)], 2), false, 'cizí zdroj');
    assert.equal(A.adPayOk(g, 0, [me(null)], 2), false, 'málo');
    assert.equal(A.adPayOk(g, 0, [me(null), me(ace.id), me(ace.id)], 2), false, 'moc');
    assert.equal(A.adPayable(g, 0), 3, 'Bomba se do zdrojů nepočítá');
});

test('Kolona: lízni 2, s vylepšením 3 – platba ze dvou zdrojů, vyčerpaná karta odejde', () => {
    const g = mkAd([{}, {}]);
    fillDeck(g);
    g.playCard(giveAd(g, 0, 'Kolona'));
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.ok(!g.drawPhaseState.wwsFlip, 'Kolona není Dostavník – událost neotáčí');

    const h = mkAd([{}, {}]);
    fillDeck(h);
    const ace = armed(h, 0, 'Eso v rukávu', 1);
    h._adAdd(h.players[0], 1);
    const i = giveAd(h, 0, 'Kolona');
    assert.equal(A.adUpgradeMax(h, 0, h.players[0].hand[i]), 1);
    h.playCard(i, { up: 1, pay: [{ seat: 0, cardId: null }, { seat: 0, cardId: ace.id }] });
    assert.equal(h.phase, 'DRAW');
    assert.equal(h.drawPhaseState.cardsNeeded, 3);
    assert.equal(h.players[0].adLoads, 0);
    assert.ok(!h.players[0].board.includes(ace), 'Eso zaplacené posledním žetonem odešlo');
});

test('Kolona: neplatná platba = karta se nezahraje a nic se nezaplatí', () => {
    const g = mkAd([{}, {}]);
    fillDeck(g);
    g._adAdd(g.players[0], 3);
    const i = giveAd(g, 0, 'Kolona');
    g.playCard(i, { up: 1, pay: [{ seat: 0, cardId: null }] });                       // málo
    g.playCard(i, { up: 2, pay: Array(4).fill({ seat: 0, cardId: null }) });          // nad možnosti
    g.playCard(i, { up: 0, pay: [{ seat: 0, cardId: null }] });                       // platba bez vylepšení
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[0].hand[i].name, 'Kolona');
    assert.equal(g.players[0].adLoads, 3);
});

test('Malý doušek: +1 život, vylepšení +1; nad strop životů vylepšit nejde', () => {
    const g = mkAd([{ health: 1, maxHealth: 4 }, {}]);
    g._adAdd(g.players[0], 4);
    const i = giveAd(g, 0, 'Malý doušek');
    assert.equal(A.adUpgradeMax(g, 0, g.players[0].hand[i]), 1, '4 žetony / 3 = 1');
    g.playCard(i, { up: 1, pay: Array(3).fill({ seat: 0, cardId: null }) });
    assert.equal(g.players[0].health, 3);
    assert.equal(g.players[0].adLoads, 1);

    const h = mkAd([{ health: 3, maxHealth: 4 }, {}]);
    h._adAdd(h.players[0], 4);
    const j = giveAd(h, 0, 'Malý doušek');
    assert.equal(A.adUpgradeMax(h, 0, h.players[0].hand[j]), 0, 'chybí jen 1 život');
    // Na plném životě se nehraje vůbec.
    const k = mkAd([{}, {}]);
    const m = giveAd(k, 0, 'Malý doušek');
    assert.equal(cardPlayability(k, k.players[0], 0, k.players[0].hand[m]), false);
});

// ── Použití Nebezpečné karty (§2.9) ─────────────────────────────────────────

test('Eso v rukávu: 2 žetony za kartu; na 1 žetonu už nejde, s dobitím na 4 dvakrát', () => {
    const g = mkAd([{}, {}]);
    fillDeck(g);
    const ace = armed(g, 0, 'Eso v rukávu', 3);
    assert.equal(A.adUseOk(g, 0, ace), true);
    assert.equal(g.adUse(0, ace.id), true);
    assert.equal(ace.adLoads, 1);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 1);
    g.drawCard('deck');
    assert.equal(g.phase, 'PLAY');
    assert.equal(A.adUseOk(g, 0, ace), false, '1 žeton na cenu 2 nestačí');
    assert.equal(g.adUse(0, ace.id), false);
    g._adAdd(ace, 3);
    g.adUse(0, ace.id); g.drawCard('deck');
    g.adUse(0, ace.id); g.drawCard('deck');
    assert.ok(!g.players[0].board.includes(ace), '4 → 2 → 0 = odhoz');
    assert.equal(g.adUse(1, ace.id), false);
});

test('Eso v rukávu: jen ve svém tahu a fázi PLAY; Laso ho vypne', () => {
    const g = mkAd([{}, {}]);
    const ace = armed(g, 1, 'Eso v rukávu', 3);
    assert.equal(A.adUseOk(g, 1, ace), false, 'cizí tah');
    g.currentPlayerIndex = 1;
    g.activeFistful = { key: 'LASO' };
    assert.equal(A.adUseOk(g, 1, ace), false, 'Laso');
    g.activeFistful = null;
    g.phase = 'RESPOND';
    assert.equal(A.adUseOk(g, 1, ace), false);
});

test('Bečka piva: na plném životě ne; jinak +1 život za 3 žetony a karta odejde', () => {
    const g = mkAd([{}, {}]);
    const keg = armed(g, 0, 'Bečka piva', 3);
    assert.equal(A.adUseOk(g, 0, keg), false, 'plný život');
    g.players[0].health = 2;
    assert.equal(g.adUse(0, keg.id), true);
    assert.equal(g.players[0].health, 3);
    assert.ok(!g.players[0].board.includes(keg));
    assert.equal(g.phase, 'PLAY');
});

test('Zvonice: všichni ve vzdálenosti 1 pro příští kartu; pak ani v dalším tahu už ne', () => {
    const g = mkAd([{}, {}, {}, {}, {}]);
    board(g, 2, CardType.EQUIPMENT, { name: 'Mustang', effect: 'mustang' });
    assert.equal(computeDistance(g, 0, 2), 3);
    const bell = armed(g, 0, 'Zvonice', 3);
    g.players[0]._playedThisTurn = 1;
    assert.equal(g.adUse(0, bell.id), true);
    assert.equal(bell.adLoads, 2);
    assert.equal(computeDistance(g, 0, 2), 1, 'i přes Mustang');
    assert.equal(computeDistance(g, 2, 0), 2, 'ostatním se nic nemění');
    assert.equal(A.adUseOk(g, 0, bell), false, 'dokud platí, znovu nemá smysl');
    // Zahraná karta: během jejího vyhodnocení ještě platí, po návratu do PLAY ne.
    g._trackCard(0, 'Panika!');
    g.phase = 'SELECTING_TARGET_CARD';
    assert.equal(computeDistance(g, 0, 2), 1);
    g.phase = 'PLAY';
    assert.equal(computeDistance(g, 0, 2), 3);
    // Nepoužitá Zvonice nepřežije tah.
    g.adUse(0, bell.id);
    g.turnId++;
    assert.equal(computeDistance(g, 0, 2), 3);
});

test('Bandalír: druhý BANG! projde za žeton, třetí ne; s Volcanicem se žeton nebere', () => {
    const g = mkAd([{}, {}]);
    fillDeck(g);
    const band = armed(g, 0, 'Bandalír', 3);
    for (let k = 0; k < 3; k++) give(g, 0, CardType.BANG, { name: 'Bang!' });
    const shoot = () => {
        const before = g.players[0].hand.length;
        g.playBang(0, 1, 0);
        // Obránce nic nemá → zásah; vrať hru do PLAY.
        if (g.phase === 'RESPOND') g.handleResponse(1, null);
        g.phase = 'PLAY';
        return g.players[0].hand.length < before;
    };
    assert.equal(shoot(), true);
    assert.equal(band.adLoads, 3, 'první BANG! je v limitu');
    assert.equal(shoot(), true);
    assert.equal(band.adLoads, 2, 'druhý stál žeton');
    assert.equal(shoot(), false, 'Bandalír jen jednou za tah');
    assert.equal(band.adLoads, 2);

    const h = mkAd([{}, {}]);
    fillDeck(h);
    const b2 = armed(h, 0, 'Bandalír', 3);
    h.players[0].weapon = mkCard(CardType.WEAPON, { name: 'Volcanic', props: { range: 1 } });
    for (let k = 0; k < 2; k++) give(h, 0, CardType.BANG, { name: 'Bang!' });
    h.playBang(0, 1, 0); if (h.phase === 'RESPOND') h.handleResponse(1, null); h.phase = 'PLAY';
    h.playBang(0, 1, 0);
    assert.equal(b2.adLoads, 3, 'Volcanic Bandalír nepotřebuje');
});

test('Bandalír zaplacený posledním žetonem odejde, limit +1 ale do konce tahu drží', () => {
    const g = mkAd([{}, {}]);
    fillDeck(g);
    const band = armed(g, 0, 'Bandalír', 1);
    g.players[0].bangsPlayedThisTurn = 1;
    assert.equal(A.adBandolierExtra(g, g.players[0]), 1);
    give(g, 0, CardType.BANG, { name: 'Bang!' });
    g.playBang(0, 1, 0);
    assert.ok(!g.players[0].board.includes(band));
    assert.equal(A.adBandolierExtra(g, g.players[0]), 1, 'použitý v tomhle tahu');
    g.turnId++;
    assert.equal(A.adBandolierExtra(g, g.players[0]), 0);
});

test('vyřazení vrátí žetony z postavy do zásoby – návrat do hry (Hřbitov, duch) začíná s nulou', () => {
    const g = mkAd([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    g._adAdd(g.players[1], 3);
    assert.equal(g._adSupply(), 29);
    g.players[1].health = 0;
    g.handlePlayerDeath(1, 0);
    assert.equal(g.players[1].adLoads || 0, 0);
    // Kdyby číslo zůstalo, návrat do hry by ho započítal znovu a zásoba by šla do minusu.
    g.players[1].health = 1;
    assert.equal(g._adSupply(), 32);
});

// ── Doroty a Lee Van Kliff (R13) ─────────────────────────────────────────────

test('strukturální: AD_KINDS zná každý druh rozšíření kromě karet základní hry', () => {
    const kinds = distinctCardKinds(adData).filter(k => !['Bang!', 'Cat Balou', 'Vedle!'].includes(k.name));
    for (const k of kinds) {
        const row = A.AD_KINDS[k.name];
        assert.ok(row, `${k.name}: chybí v AD_KINDS`);
        assert.equal(typeof row.dorothy, 'boolean');
        assert.equal(typeof row.lvk, 'boolean');
        assert.ok(row.why, `${k.name}: chybí zdůvodnění`);
        if (k.dangerous) assert.equal(row.lvk, false, `${k.name} je oranžová – paměť LVK drží jen hnědé`);
        // Druh, který ještě nemá efekt, poručit ani zopakovat nejde.
        if (!A.AD_CARDS_READY.includes(k.name)) assert.equal(row.dorothy || row.lvk, false, k.name);
    }
    assert.deepEqual(Object.keys(A.AD_KINDS).sort(), kinds.map(k => k.name).sort());
    assert.equal(A.adDorothyOk(adCard('Bang!')), true, 'BANG! rozšíření je obyčejný BANG!');
});

test('Lee Van Kliff zopakuje Kolonu bez vylepšení (lízne 2)', () => {
    const g = mkAd([{ character: 'Lee Van Kliff' }, {}]);
    fillDeck(g);
    g._adAdd(g.players[0], 4);
    g.playCard(giveAd(g, 0, 'Kolona'), { up: 1, pay: [{ seat: 0, cardId: null }, { seat: 0, cardId: null }] });
    while (g.phase === 'DRAW') g.drawCard('deck');
    assert.equal(g._lastBrown?.effect, 'AD_CARAVAN');
    const bang = give(g, 0, CardType.BANG, { name: 'Bang!' });
    const res = g.useLeeVanKliff(0, g.players[0].hand[bang].id, null);
    assert.ok(res);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    assert.equal(g.players[0].adLoads, 2, 'opakování nic neplatí');
});

// ── Bot (§6) ─────────────────────────────────────────────────────────────────

test('bot: v AD_PLACE rozmístí žeton, když není kam, nechá ho v zásobě', () => {
    const g = mkAd([{}, {}]);
    const ace = armed(g, 0, 'Eso v rukávu', 1);
    g.pendingAdPlace = { playerIdx: 0, left: 1, reason: 'BLUE' };
    g.phase = 'AD_PLACE';
    assert.deepEqual(decideBotAction(g, 0), { event: 'ad_place', payload: { seat: 0, cardId: ace.id } },
        'Esu chybí žeton do ceny – jde první');
    g._adAdd(ace, 3); g._adAdd(g.players[0], 4);
    assert.deepEqual(decideBotAction(g, 0), { event: 'ad_place_done' });
});

test('bot: použije Eso v rukávu, vyloží Nebezpečný objekt a zaplatí vylepšení Kolony z postavy', () => {
    const g = mkAd([{}, {}]);
    fillDeck(g);
    const ace = armed(g, 0, 'Eso v rukávu', 3);
    assert.deepEqual(decideBotAction(g, 0), { event: 'ad_use', payload: { cardId: ace.id } });

    const h = mkAd([{}, {}]);
    fillDeck(h);
    giveAd(h, 0, 'Bandalír');
    assert.deepEqual(decideBotAction(h, 0), { event: 'play_card', payload: 0 });

    const k = mkAd([{}, {}]);
    fillDeck(k);
    k._adAdd(k.players[0], 4);
    giveAd(k, 0, 'Kolona');
    const a = decideBotAction(k, 0);
    assert.equal(a.event, 'play_card');
    assert.equal(a.payload.up, 2);
    assert.equal(a.payload.pay.length, 4);
    k.playCard(a.payload.index, a.payload);
    assert.equal(k.drawPhaseState.cardsNeeded, 4);
});
