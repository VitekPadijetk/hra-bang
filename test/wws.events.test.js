// Rozšíření Divoký západ – karty událostí (fáze 2+).
//
// Zúčtování: „Každá karta může být hrána jako by to byla karta BANG!. Každá karta BANG!
// může být hrána jako by to byla karta Vedle!." Obě věty jsou POVOLUJÍCÍ (R1) – karta si
// svoji vlastní akci ponechává a jen k ní přibývá druhá možnost.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { cardPlayability, nativePlayInTurn, showdownBangOk, playsAsBang, playsAsMissed,
        preacherBlocks, sniperOffer, rouletteDiscardable,
        lawForcedCard, lawLocksOther, bangLimitFree } = require('../core/playability.js');
const { getActionForCard } = require('../core/cardRules.js');
const { decideCardClick } = require('../core/selection.js');
const { decideBotAction } = require('../core/botPolicy.js');
const { pendingActor } = require('../core/pending.js');

before(() => { console.log = () => {}; });

const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const wwsData = rd('cards.divoky_zapad.json');
const ffData = rd('cards.fistful.json');
const hnData = rd('cards.high_noon.json');
const wws = key => wwsData.find(c => c.key === key);
const ff = key => ffData.find(c => c.key === key);
const hn = key => hnData.find(c => c.key === key);

// Hra s právě platnou kartou Divokého západu (přípravu balíčku řeší wildWest.test.js).
function mkEv(specs, key, opts = {}) {
    const g = mkGame(specs, opts);
    if (key) g.activeWws = wws(key);
    return g;
}

const bang = (g, i, o = {}) => give(g, i, CardType.BANG, { name: 'Bang!', ...o });
const miss = (g, i, o = {}) => give(g, i, CardType.MISSED, { name: 'Vedle!', ...o });
const beer = (g, i, o = {}) => give(g, i, CardType.BEER, { name: 'Pivo', ...o });

// ── Zúčtování: každá karta jako Bang! ───────────────────────────────────────

test('Zúčtování: modrá karta z ruky vystřelí jako Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = give(g, 0, CardType.BARREL, { name: 'Barel' });
    assert.equal(playsAsBang(g, g.players[0], g.players[0].hand[i]), true);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.players[0].hand.length, 0, 'karta odešla do odhozu');
    assert.equal(g.players[0].bangsPlayedThisTurn, 1, 'limit se čerpá normálně');
    g.handleResponse(1, null);                       // nemá čím uhnout
    assert.equal(g.players[1].health, 3);
});

test('Zúčtování: Vedle! jde ve vlastním tahu zahrát jako Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = miss(g, 0);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[i]), true);
    // Vlastní akci Vedle! ve svém tahu nemá – ani tak ale nemíří sama od sebe (bug 30):
    // vybere se BEZ akce a na výstřel se přepne tlačítkem, jako každá jiná karta.
    assert.equal(nativePlayInTurn(g, g.players[0], 0, g.players[0].hand[i]), false);
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[i]), true);
    const intent = decideCardClick({
        state: g, me: g.players[0], myIndex: 0, selectedState: { cardIndex: null },
        card: g.players[0].hand[i], index: i, blockInput: false, isMySidActive: false, playable: true,
    });
    assert.deepEqual(intent, { type: 'SELECT', index: i, action: null });
    g.playBang(0, 1, i);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

// Bug 34: druhý Barel v ruce (stejné jméno na stole → vlastní akci nemá) se pod
// Zúčtováním vybíral rovnou s akcí SHOOT, takže klik na vlastní postavu z něj udělal
// výstřel do sebe. Teď se vybere bez akce a čeká na tlačítko.
test('Zúčtování: druhý Barel se vybere bez akce, nestřílí sám od sebe', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    const i = give(g, 0, CardType.BARREL, { name: 'Barel' });
    const card = g.players[0].hand[i];
    assert.equal(nativePlayInTurn(g, g.players[0], 0, card), false, 'druhý Barel se vyložit nedá');
    assert.equal(cardPlayability(g, g.players[0], 0, card), true, 'ale jako Bang! hratelný je');
    const intent = decideCardClick({
        state: g, me: g.players[0], myIndex: 0, selectedState: { cardIndex: null },
        card, index: i, blockInput: false, isMySidActive: false, playable: true,
    });
    assert.deepEqual(intent, { type: 'SELECT', index: i, action: null });
});

// Mimo Zúčtování se výběr karty nemění o nic – akce je pořád ta vlastní.
test('Bez Zúčtování se karta vybírá se svou vlastní akcí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    const i = bang(g, 0);
    const intent = decideCardClick({
        state: g, me: g.players[0], myIndex: 0, selectedState: { cardIndex: null },
        card: g.players[0].hand[i], index: i, blockInput: false, isMySidActive: false, playable: true,
    });
    assert.deepEqual(intent, { type: 'SELECT', index: i, action: 'SHOOT' });
});

test('Zúčtování: karta si svoji vlastní akci ponechává (Pivo se pořád smí vypít)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}, {}], 'ZUCTOVANI');
    const i = beer(g, 0);
    const card = g.players[0].hand[i];
    assert.equal(nativePlayInTurn(g, g.players[0], 0, card), true, 'Pivo léčí dál');
    assert.equal(showdownBangOk(g, g.players[0], 0, card), true, 'a zároveň smí vystřelit');
    // Klik proto vybere VLASTNÍ akci karty – na Bang! se přepíná tlačítkem (view/board.js).
    const intent = decideCardClick({
        state: g, me: g.players[0], myIndex: 0, selectedState: { cardIndex: null },
        card, index: i, blockInput: false, isMySidActive: false, playable: true,
    });
    assert.equal(intent.action, getActionForCard(card, null));
    g.playCard(i);
    assert.equal(g.players[0].health, 3);
});

test('Zúčtování: limit 1× Bang!/tah platí dál (pumpa z toho není)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    bang(g, 0); beer(g, 0);
    g.playBang(0, 1, 0);
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[0].bangsPlayedThisTurn, 1);
    // Druhá karta už jako Bang! nesmí (a showdownBangOk to říká klientovi i botovi).
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[0]), false);
    g.playBang(0, 1, 0);
    assert.equal(g.players[1].health, 3, 'druhý výstřel je no-op');
    assert.equal(g.players[0].hand.length, 1, 'karta zůstala v ruce');
});

test('bez Zúčtování se cizí kartou vystřelit nedá', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    const i = beer(g, 0);
    assert.equal(playsAsBang(g, g.players[0], g.players[0].hand[i]), false);
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[i]), false);
    g.playBang(0, 1, i);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].health, 4);
    assert.equal(g.players[0].hand.length, 1);
});

// ── Zúčtování: každá karta Bang! jako Vedle! ────────────────────────────────

test('Zúčtování: Bang! ubrání útok jako Vedle!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = bang(g, 0);
    bang(g, 1);
    assert.equal(playsAsMissed(g, g.players[1], g.players[1].hand[0]), true);
    g.playBang(0, 1, i);
    assert.equal(cardPlayability(g, g.players[1], 1, g.players[1].hand[0]), true);
    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4, 'Bang! posloužil jako Vedle!');
    assert.equal(g.players[1].hand.length, 0);
});

test('Zúčtování jako Vedle! platí jen na kartu Bang!, ne na cokoli', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = bang(g, 0);
    beer(g, 1);
    assert.equal(playsAsMissed(g, g.players[1], g.players[1].hand[0]), false);
    g.playBang(0, 1, i);
    g.handleResponse(1, 0);
    assert.equal(g.phase, 'RESPOND', 'Pivo obranou není – klik se ignoruje');
    assert.equal(g.players[1].hand.length, 1, 'karta zůstala v ruce');
    g.handleResponse(1, null);
    assert.equal(g.players[1].health, 3);
});

test('Zúčtování: Bang! se počítá za kartu Vedle! i v Ruské ruletě', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeFistful = ff('RUSKA_RULETA');
    const card = mkCard(CardType.BANG, { name: 'Bang!' });
    assert.equal(rouletteDiscardable(g, g.players[0], card, false), true);
    g.activeWws = null;
    assert.equal(rouletteDiscardable(g, g.players[0], card, false), false);
});

// ── Souhra s ostatními balíčky ──────────────────────────────────────────────

test('Zúčtování × Odstřelovač: zaplatit jde dvěma libovolnými kartami', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeFistful = ff('ODSTRELOVAC');
    beer(g, 0); give(g, 0, CardType.BARREL, { name: 'Barel' });
    assert.equal(sniperOffer(g, g.players[0], 0, g.players[0].hand[0]), true);
    g.startSniper(0, 1);
    assert.equal(g.phase, 'DISCARD_ANOTHER');
    g.discardAnotherCard(0, 1);                     // zaplatí druhou kartou z ruky
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesRequired, 2, 'ubránit se lze jen dvěma Vedle!');
    // bez Zúčtování by ani jedna z karet nebyla „karta Bang!"
    const h = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    h.activeFistful = ff('ODSTRELOVAC');
    beer(h, 0); give(h, 0, CardType.BARREL, { name: 'Barel' });
    assert.equal(sniperOffer(h, h.players[0], 0, h.players[0].hand[0]), false);
});

test('Zúčtování × Želízka: barva karty omezuje pořád', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('ZELIZKA');
    g.players[0]._handcuffsSuit = Suits.HEARTS;
    const bad = give(g, 0, CardType.BEER, { name: 'Pivo', suit: Suits.SPADES });
    const ok = give(g, 0, CardType.BEER, { name: 'Pivo', suit: Suits.HEARTS });
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[bad]), false);
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[ok]), true);
    g.playBang(0, 1, bad);
    assert.equal(g.phase, 'PLAY', 'piková karta neprošla');
    g.playBang(0, 1, ok);
    assert.equal(g.phase, 'RESPOND');
});

// Bug 36: pod Zúčtováním je kartou Bang! KAŽDÁ karta, takže Kazatel zakazuje výstřel
// úplně – vlastní akce karet (vypít Pivo) tím ale dotčené nejsou.
test('Zúčtování × Kazatel: nejde vystřelit vůbec ničím', () => {
    const g = mkEv([{ role: 'Sheriff', health: 3 }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('KAZATEL');
    const b = bang(g, 0);
    const p = beer(g, 0);
    assert.equal(preacherBlocks(g, g.players[0], 0, g.players[0].hand[b]), true);
    assert.equal(preacherBlocks(g, g.players[0], 0, g.players[0].hand[p]), true);
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[b]), false);
    assert.equal(showdownBangOk(g, g.players[0], 0, g.players[0].hand[p]), false,
        'tlačítko „zahrát jako Bang!" se nenabídne');
    g.playBang(0, 1, b);
    assert.equal(g.phase, 'PLAY', 'karta Bang! neprošla');
    g.playBang(0, 1, p);
    assert.equal(g.phase, 'PLAY', 'ani Pivo jako Bang! neprojde');
    // Vlastní akce karty zůstává: zraněný hráč se Pivem napije.
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[1]), true);
    g.playCard(1);
    assert.equal(g.players[0].health, 4, 'Pivo se vypilo normálně');
});

test('Zúčtování × Kazatel: duel na svém tahu se prohrává (není čím odpovědět)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('KAZATEL');
    beer(g, 0);
    g.phase = 'RESPOND';
    g.pendingResponse = { active: true, originatorIdx: 1, targetIdx: 0,
        requiredCard: CardType.BANG, sourceCard: CardType.DUEL, responded: [] };
    assert.equal(cardPlayability(g, g.players[0], 0, g.players[0].hand[0]), false);
    g.handleResponse(0, 0);
    assert.equal(g.players[0].hand.length, 1, 'karta z ruky neodešla');
});

test('Kazatel bez Zúčtování drží Calamity Janet i její Vedle! (FAQ H5)', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Calamity Janet' }, {}, {}], null);
    g.activeEvent = hn('KAZATEL');
    const m = miss(g, 0);
    assert.equal(preacherBlocks(g, g.players[0], 0, g.players[0].hand[m]), true);
    g.playBang(0, 1, m);
    assert.equal(g.phase, 'PLAY');
});

// ── Calamity Janet po stažení do predikátů (regrese) ────────────────────────

test('Calamity Janet: Vedle! střílí a Bang! brání i bez Zúčtování', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Calamity Janet' },
                    { character: 'Calamity Janet' }, {}], null);
    const m = miss(g, 0);
    bang(g, 1);
    assert.equal(playsAsBang(g, g.players[0], g.players[0].hand[m]), true);
    g.playBang(0, 1, m);
    assert.equal(g.phase, 'RESPOND');
    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4);
});

// ── Zrcadla pro bota ─────────────────────────────────────────────────────────

// Nikdo není zraněný → Salon ani Pivo nemají co dělat; pod Zúčtováním z nich ale zbývá
// výstřel. Bot sáhne po tom postradatelnějším (keepScore: Salon 3, Pivo 7).
test('bot: bez karty Bang! vystřelí pod Zúčtováním postradatelnou kartou', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    give(g, 0, CardType.SALOON, { name: 'Salon' });
    beer(g, 0);
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'play_bang');
    assert.equal(act.payload.cardIdx, 0, 'vystřelí Salonem, ne Pivem');
});

test('bot: vlastní akce karty má přednost před výstřelem', () => {
    const g = mkEv([{ role: 'Sheriff', health: 2 }, {}, {}], 'ZUCTOVANI');
    give(g, 0, CardType.SALOON, { name: 'Salon' });
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'play_card', 'zraněný Salon vypije');
});

test('bot: bez Zúčtování cizí kartou nestřílí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], null);
    give(g, 0, CardType.SALOON, { name: 'Salon' });
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 0,
        { 1: { Outlaw: 1 }, 2: { Outlaw: 1 } });
    assert.notEqual(act.event, 'play_bang');
});

test('bot: pod Zúčtováním se ubrání kartou Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    const i = bang(g, 0);
    bang(g, 1);
    g.playBang(0, 1, i);
    const act = decideBotAction(JSON.parse(JSON.stringify(g)), 1,
        { 0: { Sheriff: 1 }, 2: { Outlaw: 1 } });
    assert.equal(act.event, 'respond_to_card');
    assert.equal(act.payload.cardIndex, 0);
});


// ── Madam Zuzana ──────────────────────────────────────────────────────────
// „Během svého tahu musí každý hráč zahrát alespoň 3 karty. Hráč, který to neudělá,
// ztrácí 1 život." Penalizace se KLIKÁ (recykluje pendingDynamiteDamage) a leží až
// za fází 3 (odhoz nad limit), ale ještě před sejmutím Vendety.

test('Madam Zuzana: 2 zahrané karty → −1 život (klik na životy)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MADAM_ZUZANA');
    g.players[0]._playedThisTurn = 2;
    g.tryEndTurn();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.playerIdx, 0);
    assert.equal(g.pendingDynamiteDamage.hitsLeft, 1);
    assert.equal(g.currentPlayerIndex, 0, 'tah se zatím neposunul');
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 3);
    assert.equal(g.currentPlayerIndex, 1, 'teprve teď je na tahu další hráč');
});

// Bug 25: penalizace patří hráči, jehož tah KONČÍ – vyhodnotí se tedy dřív, než se tah
// posune na šerifa a odkryjí se karty událostí. Kdyby to bylo obráceně, klient by po
// celou cinematiku odkrývání držel stav, ve kterém se čeká na předchozího hráče (svítil
// by oranžově), zatímco animace už hlásí na tahu šerifa.
test('Madam Zuzana: penalizace je PŘED odkrytím karty události (a tah se zatím nehne)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MADAM_ZUZANA');
    g.highNoonCardData = hnData;
    g._setupEventDeck({ expansions: { high_noon: true } });
    g._sheriffTurns = 1;                 // příští šerifův tah už kartu odkryje
    for (let k = 0; k < 20; k++) topDeck(g, Suits.CLUBS);
    g.currentPlayerIndex = 2;            // poslední hráč v kole, za ním je zase šerif
    g.players[2]._playedThisTurn = 0;

    g.tryEndTurn();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.pendingDynamiteDamage.playerIdx, 2);
    assert.equal(g.currentPlayerIndex, 2, 'tah se zatím neposunul');
    assert.equal(g.activeEvent, null, 'karta události se ještě neodkryla');
    assert.ok(!g._pendingHighNoonReveal, 'a nemá se ani co animovat');

    g.takeDynamiteHit(2);
    assert.equal(g.currentPlayerIndex, 0, 'teprve teď je na tahu šerif');
    assert.ok(g.activeEvent, 'a teprve teď se odkryla karta události');
    assert.equal(g._pendingHighNoonReveal.playerIdx ?? 0, 0);
    // Nikdo nezůstal viset jako „čeká se na něj" – klient tedy nemá koho svítit oranžově.
    const pa = pendingActor(g);
    assert.ok(!pa || pa.idx === 0, 'čeká se už jen na šerifa');
});

test('Madam Zuzana: 3 zahrané karty → bez penalizace', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MADAM_ZUZANA');
    g.players[0]._playedThisTurn = 3;
    g.tryEndTurn();
    assert.notEqual(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.players[0].health, 4);
    assert.equal(g.currentPlayerIndex, 1);
});

test('Madam Zuzana: počítadlo běží i před jejím příchodem (FAQ Q02)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 1 }, {}, {}], null);
    for (let k = 0; k < 3; k++) g.playCard(beer(g, 0));   // tri zivoty k doleceni
    assert.equal(g.players[0]._playedThisTurn, 3, 'tři Piva se započítala');
    g.activeWws = wws('MADAM_ZUZANA');           // Zuzana přišla až teď
    const hp = g.players[0].health;
    g.tryEndTurn();
    assert.notEqual(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.players[0].health, hp);
});

test('Madam Zuzana: vyložení modré karty i zbraně se počítá jako zahraná karta', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MADAM_ZUZANA');
    const barrel = give(g, 0, CardType.BARREL, { name: 'Barel' });
    g.playCard(barrel);
    assert.equal(g.players[0]._playedThisTurn, 1, 'modrá karta z ruky');
    const scope = give(g, 0, CardType.EQUIPMENT, { name: 'Dalekohled' });
    g.playCard(scope);
    assert.equal(g.players[0]._playedThisTurn, 2);
    const gun = give(g, 0, CardType.WEAPON, { name: 'Winchester', props: { range: 5 } });
    g.playCard(gun);
    assert.equal(g.players[0]._playedThisTurn, 3, 'zbraň taky opustila ruku');
    g.tryEndTurn();
    assert.notEqual(g.phase, 'DYNAMITE_DAMAGE');
});

test('Madam Zuzana: druhá stejná modrá karta se nezapočítá (na stůl nedosedne)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MADAM_ZUZANA');
    board(g, 0, CardType.BARREL, { name: 'Barel' });
    const dup = give(g, 0, CardType.BARREL, { name: 'Barel' });
    g.playCard(dup);
    assert.equal(g.players[0]._playedThisTurn || 0, 0);
    assert.equal(g.players[0].hand.length, 1, 'karta zůstala v ruce');
});

test('Madam Zuzana: zelená se počítá při vyložení, ne při aktivaci ze stolu', () => {
    const g = mkEv([{ role: 'Sheriff', health: 1 }, {}, {}], 'MADAM_ZUZANA');
    const canteen = give(g, 0, CardType.CANTEEN, { name: 'Čutora', props: { green: true, activate: 'heal_self' } });
    g.playCard(canteen);
    assert.equal(g.players[0]._playedThisTurn, 1, 'vyložení z ruky');
    const onBoard = g.players[0].board[0];
    onBoard._playedTurn = -1;                    // jako by ležela z minulého tahu
    g.activateGreenCard(0, onBoard.id);
    assert.equal(g.players[0].health, 2, 'efekt proběhl');
    assert.equal(g.players[0]._playedThisTurn, 1, 'aktivace ze stolu není zahrání karty');
});

test('Madam Zuzana: počítadlo patří jednomu tahu (další hráč začíná od nuly)', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MADAM_ZUZANA');
    g.players[0]._playedThisTurn = 3;
    g.players[1]._playedThisTurn = 7;            // zbytek z jeho minulého tahu
    g.tryEndTurn();
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[1]._playedThisTurn, 0);
});

test('Madam Zuzana: koho tah přeskočilo Vězení, ten se nepenalizuje', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MADAM_ZUZANA');
    board(g, 0, CardType.JAIL, { name: 'Vězení' });
    g.deck.cards = []; topDeck(g, Suits.SPADES, '5');   // ne srdce → tah se přeskočí
    g.handleStartOfTurnChecks();
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].health, 4, 'za přeskočený tah se neplatí');
    assert.equal(g.currentPlayerIndex, 1);
    assert.equal(g.players[0]._turnSkippedByJail, false, 'příznak platil na jeden konec tahu');
});

test('Madam Zuzana: poslední život jde zachránit Pivem', () => {
    const g = mkEv([{ role: 'Sheriff', health: 1 }, {}, {}], 'MADAM_ZUZANA');
    const b = beer(g, 0);
    g.tryEndTurn();
    assert.equal(g.phase, 'DYNAMITE_DAMAGE');
    assert.equal(g.beerLastLifeSave(0, b), true);
    assert.equal(g.players[0].health, 1, 'Pivo zásah zrušilo');
    assert.equal(g.currentPlayerIndex, 1);
});

test('Madam Zuzana: Bart Cassidy si za ztracený život lízne', () => {
    const g = mkEv([{ role: 'Sheriff', character: 'Bart Cassidy' }, {}, {}], 'MADAM_ZUZANA');
    g.deck.cards = []; for (let k = 0; k < 4; k++) topDeck(g, Suits.CLUBS, '5');
    g.tryEndTurn();
    g.takeDynamiteHit(0);
    assert.equal(g.phase, 'BART_DRAW');
    g.bartCassidyDraw(0);
    assert.equal(g.players[0].hand.length, 1);
    assert.equal(g.currentPlayerIndex, 1, 'tah se posunul až po líznutí');
});

test('Madam Zuzana: penalizace až PO odhozu a PŘED sejmutím Vendety', () => {
    const g = mkEv([{ role: 'Sheriff', health: 3 }, {}, {}], 'MADAM_ZUZANA');
    g.activeFistful = ff('VENDETA');
    for (let k = 0; k < 5; k++) bang(g, 0);       // limit ruky = 3 životy
    g.tryEndTurn();
    assert.equal(g.phase, 'DISCARD', 'nejdřív fáze 3');
    g.discardCard(0);
    assert.equal(g.phase, 'DISCARD');
    g.discardCard(0);
    assert.equal(g.phase, 'DYNAMITE_DAMAGE', 'teprve za odhozem Zuzana');
    g.takeDynamiteHit(0);
    assert.equal(g.players[0].health, 2);
    assert.equal(g.phase, 'CHECK_DRAW', 'a teprve za ní Vendeta');
    assert.equal(g.pendingCheckDraw.reason, 'VENDETTA');
});

test('Madam Zuzana: v jednom tahu penalizuje jen jednou', () => {
    const g = mkEv([{ role: 'Sheriff', health: 3 }, {}, {}], 'MADAM_ZUZANA');
    g.activeFistful = ff('VENDETA');
    g.deck.cards = []; topDeck(g, Suits.SPADES, '5');   // Vendeta: ne srdce → tah končí
    g.tryEndTurn();
    g.takeDynamiteHit(0);
    assert.equal(g.phase, 'CHECK_DRAW');
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.players[0].health, 2, 'zaplatilo se jen jednou');
    assert.equal(g.currentPlayerIndex, 1);
});

test('Madam Zuzana: Vendetin tah navíc je nový tah (tři karty znovu)', () => {
    const g = mkEv([{ role: 'Sheriff', health: 3 }, {}, {}], 'MADAM_ZUZANA');
    g.activeFistful = ff('VENDETA');
    g.players[0]._playedThisTurn = 3;
    g.deck.cards = []; topDeck(g, Suits.HEARTS, '5');   // Vendeta: ♥ → tah navíc
    g.tryEndTurn();
    assert.equal(g.phase, 'CHECK_DRAW', 'bez penalizace rovnou na Vendetu');
    g.triggerCheckDraw();
    g.resolveCheck();
    assert.equal(g.currentPlayerIndex, 0, 'hraje ještě jednou');
    assert.equal(g.players[0]._playedThisTurn, 0, 'počítadlo od nuly');
    assert.equal(g._zuzanaDone, false, 'a penalizace může přijít znovu');
});

// ── Miláček Valentýn ──────────────────────────────────────────────────
// „Na začátku svého tahu odhodí každý hráč všechny karty z ruky a stejný počet karet
// si dobere z balíčku." Je to POSLEDNÍ krok startu tahu (ještě před kontrolami na
// Dynamit/Vězení) a běžná fáze lízání proběhne normálně za ním.

// Balíček se zásobou karet na výměnu i na fázi lízání.
function stockDeck(g, n = 12) {
    g.deck.cards = [];
    for (let k = 0; k < n; k++) topDeck(g, Suits.CLUBS, '5');
}

// Odhoz ruky se KLIKÁ, kartu po kartě (bug 35) – pořadí je hráčova věc, takže se
// v testech bere pořád ta první.
function valentineDiscardAll(g, idx = 0) {
    let guard = 20;
    while (g.phase === 'VALENTINE_DISCARD' && guard-- > 0) {
        g.valentineDiscard(idx, g.players[idx].hand[0].id);
    }
}

test('Miláček Valentýn: odhodí celou ruku a lízne si stejný počet', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MILACEK_VALENTYN');
    for (let k = 0; k < 4; k++) bang(g, 0);
    stockDeck(g);
    g._beginTurn();
    assert.equal(g.phase, 'VALENTINE_DISCARD', 'odhoz se kliká, ne automaticky');
    assert.equal(g.pendingValentine.playerIdx, 0);
    assert.equal(g.pendingValentine.count, 4);
    g.valentineDiscard(0, g.players[0].hand[0].id);
    assert.equal(g.phase, 'VALENTINE_DISCARD', 'po první kartě se čeká na další');
    assert.equal(g.players[0].hand.length, 3);
    valentineDiscardAll(g);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isValentine, true);
    assert.equal(g.drawPhaseState.isStartOfTurn, false, 'není to fáze 1');
    assert.equal(g.drawPhaseState.cardsNeeded, 4);
    assert.equal(g.players[0].hand.length, 0, 'ruka odešla do odhozu');
    assert.equal(g.deck.discardPile.length, 4);
    assert.equal(g.pendingValentine, null);
    for (let k = 0; k < 4; k++) g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 4);
    // …a teprve teď běžná fáze lízání
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isStartOfTurn, true);
    assert.equal(g.drawPhaseState.cardsNeeded, 2);
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.players[0].hand.length, 6);
    assert.equal(g.phase, 'PLAY');
});

test('Miláček Valentýn: prázdná ruka = krok se přeskočí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MILACEK_VALENTYN');
    stockDeck(g);
    assert.equal(g._startValentine(), false);
    g._beginTurn();
    g.handleStartOfTurnChecks();
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isStartOfTurn, true, 'rovnou běžná fáze lízání');
});

test('Miláček Valentýn: výměna je PŘED kontrolou Dynamitu', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MILACEK_VALENTYN');
    bang(g, 0);
    board(g, 0, CardType.DYNAMITE, { name: 'Dynamit' });
    stockDeck(g);
    g._beginTurn();
    assert.equal(g.phase, 'VALENTINE_DISCARD', 'nejdřív výměna, sejmutí až za ní');
    valentineDiscardAll(g);
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.players[0].board.some(c => c.type === CardType.DYNAMITE), true);
    g.drawCard('deck');
    assert.equal(g.phase, 'CHECK_DRAW', 'teprve teď sejmutí na Dynamit');
    assert.equal(g.players[0].hand.length, 1);
});

test('Miláček Valentýn × Želízka: barva se volí až po SKUTEČNÉM lízání', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MILACEK_VALENTYN');
    g.activeEvent = hn('ZELIZKA');
    bang(g, 0);
    stockDeck(g);
    g._beginTurn();
    valentineDiscardAll(g);
    g.drawCard('deck');                       // dolízl náhradu za Valentýna
    assert.equal(g.phase, 'DRAW', 'Želízka se u Valentýnovy fáze neptají');
    assert.equal(g.drawPhaseState.isStartOfTurn, true);
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'HANDCUFFS_SUIT');
});

test('Miláček Valentýn × Ranč: Ranč se ptá jednou, až za běžným lízáním', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MILACEK_VALENTYN');
    g.activeFistful = ff('RANC');
    bang(g, 0);
    stockDeck(g);
    g._beginTurn();
    valentineDiscardAll(g);
    g.drawCard('deck');
    assert.equal(g.phase, 'DRAW');
    assert.equal(g.drawPhaseState.isStartOfTurn, true);
    g.drawCard('deck'); g.drawCard('deck');
    assert.equal(g.phase, 'RANCH');
    assert.equal(g.pendingRanch.playerIdx, 0);
});

test('Miláček Valentýn × Opuštěný důl: odhoz i lízání jdou mimo důl', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'MILACEK_VALENTYN');
    g.activeFistful = ff('OPUSTENY_DUL');
    for (let k = 0; k < 3; k++) bang(g, 0);
    stockDeck(g);
    const deckBefore = g.deck._drawPile.length;
    g._beginTurn();
    valentineDiscardAll(g);
    assert.equal(g.deck.discardPile.length, 3, 'ruka šla do normálního odhozu');
    assert.equal(g.deck._drawPile.length, deckBefore, 'a ne navrch dobíracího balíčku');
    assert.equal(g._mineTurn, false, 'důl se rozhoduje až ve fázi 1');
    for (let k = 0; k < 3; k++) g.drawCard('deck');
    assert.equal(g.deck._drawPile.length, deckBefore - 3, 'náhrady se braly z balíčku');
    assert.equal(g.players[0].hand.length, 3);
});

// ── Zúčtování × Právo západu (Fistful) ──────────────────────────────────────
// Bug 32: výstřel pod Zúčtováním čerpá limit karet Bang! stejně jako pravý Bang!, takže
// jím jde vynucenou kartu „vypnout". Karta sama kartou Bang! není, takže to z ní poznat
// nejde – volající to musí říct výslovně (asBang).
test('Zúčtování × Právo západu: cizí kartou jako Bang! nejde vyplýtvat limit', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeFistful = ff('PRAVO_ZAPADU');
    g.activeEvent = hn('PRESTRELKA');          // limit 2 → obejít by šlo dvěma kartami
    const b = bang(g, 0);
    beer(g, 0);
    beer(g, 0);
    const me = g.players[0];
    me._lawCardId = me.hand[b].id;
    assert.equal(lawForcedCard(g, me, 0).card.name, 'Bang!');

    // První Pivo jako Bang! projde – po něm zbývá limit i na vynucený Bang!.
    assert.equal(showdownBangOk(g, me, 0, me.hand[1]), true);
    g.playBang(0, 1, 1);
    g.pendingResponse = null; g.pendingBarrelCheck = null; g.phase = 'PLAY';
    assert.equal(me.bangsPlayedThisTurn, 1);

    // Druhé už ne: vyčerpalo by limit a vynucený Bang! by přestal jít zahrát.
    const p2 = me.hand.findIndex(c => c.name === 'Pivo');
    assert.equal(showdownBangOk(g, me, 0, me.hand[p2]), false, 'tlačítko se nenabídne');
    assert.equal(lawLocksOther(g, me, 0, me.hand[p2], { asBang: true }), true);
    g.playBang(0, 1, p2);
    assert.equal(me.bangsPlayedThisTurn, 1, 'server výstřel odmítl');
    assert.equal(me.hand.length, 2, 'karta zůstala v ruce');
    assert.equal(lawForcedCard(g, me, 0).card.name, 'Bang!', 'povinnost drží dál');
});

test('Zúčtování × Právo západu: vynucená karta jde jako Bang! zahrát vždycky', () => {
    // Vynucené Vedle! nemá ve vlastním tahu vlastní akci – jediné využití je výstřel,
    // a ten se sám sobě zamknout nesmí.
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeFistful = ff('PRAVO_ZAPADU');
    const m = miss(g, 0);
    const me = g.players[0];
    me._lawCardId = me.hand[m].id;
    assert.equal(lawForcedCard(g, me, 0).card.type, CardType.MISSED);
    assert.equal(cardPlayability(g, me, 0, me.hand[m]), true);
    g.playBang(0, 1, m);
    assert.equal(g.phase, 'RESPOND');
    assert.equal(me.hand.length, 0);
});

// ── Zúčtování × Volcanic (bug 55) ───────────────────────────────────────────
// Volcanic dovolí zahrát libovolný počet karet Bang!. Pod Zúčtováním je kartou Bang!
// každá karta, takže s Volcanicem nesmí limit platit ani na ně – a to ani při Přestřelce
// (High Noon), která limit jinak zvedá na 2.
test('Zúčtování × Volcanic: limit neplatí ani na karty zahrané jako Bang!', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('PRESTRELKA');                    // jinak by platil limit 2
    g.players[0].weapon = mkCard(CardType.WEAPON, { name: 'Volcanic', props: { range: 1, unlimited: true } });
    for (let k = 0; k < 4; k++) beer(g, 0);
    const me = g.players[0];
    for (let k = 0; k < 4; k++) {
        g.phase = 'PLAY';
        assert.equal(bangLimitFree(g, me), true, `limit volný před ${k + 1}. výstřelem`);
        assert.equal(showdownBangOk(g, me, 0, me.hand[0]), true, `${k + 1}. Pivo smí jít jako Bang!`);
        g.playBang(0, 1, 0);
        g.pendingResponse = null; g.pendingBarrelCheck = null;
    }
    assert.equal(me.hand.length, 0, 'všechny čtyři karty odešly');
    assert.equal(me.bangsPlayedThisTurn, 4);
});

test('Zúčtování bez Volcanicu: Přestřelka drží limit 2', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('PRESTRELKA');
    for (let k = 0; k < 3; k++) beer(g, 0);
    const me = g.players[0];
    for (let k = 0; k < 3; k++) {
        g.phase = 'PLAY';
        g.playBang(0, 1, 0);
        g.pendingResponse = null; g.pendingBarrelCheck = null;
    }
    assert.equal(me.bangsPlayedThisTurn, 2, 'třetí už neprošel');
    assert.equal(me.hand.length, 1);
});

// Laso (A Fistful of Cards) vypíná karty vyložené před hráči, tedy i zbraň – Volcanic
// s ním neplatí a limit se vrací. Všechna tři rozšíření běží současně, takže se ta
// trojice (Zúčtování + Přestřelka + Laso) potkat může.
test('Zúčtování × Volcanic × Laso: se zamčenou zbraní limit zase platí', () => {
    const g = mkEv([{ role: 'Sheriff' }, {}, {}], 'ZUCTOVANI');
    g.activeEvent = hn('PRESTRELKA');
    g.activeFistful = ff('LASO');
    g.players[0].weapon = mkCard(CardType.WEAPON, { name: 'Volcanic', props: { range: 1, unlimited: true } });
    for (let k = 0; k < 3; k++) beer(g, 0);
    const me = g.players[0];
    for (let k = 0; k < 3; k++) {
        g.phase = 'PLAY';
        g.playBang(0, 1, 0);
        g.pendingResponse = null; g.pendingBarrelCheck = null;
    }
    assert.equal(me.bangsPlayedThisTurn, 2, 'Laso zbraň vypnulo → platí Přestřelka');
});
