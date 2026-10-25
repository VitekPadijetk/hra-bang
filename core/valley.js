// core/valley.js — zrcadlo rozšíření Údolí stínů (The Valley of Shadows) nad prostým stavem.
// BEZ Phaseru/DOM. Izomorfní: v prohlížeči globály (načteno PŘED core/playability.js),
// v Node přes require. Ptá se jím server (logic/valley.js), klient (view/*) i bot
// (core/botPolicy.js) – kdyby se rozešli, server akci mlčky odmítne a hra botů se zasekne.
//
// Plán: docs/udoli-stinu-plan.md. Predikáty karet přibývají s fázemi F1–F8; ty, které
// potřebují i core/playability.js (Lemat jako BANG!, „je to karta BANG!?"), sedí tam –
// playability.js se na tenhle soubor ptá sám, takže by vznikl kruh.
//
// POZOR na jména (R2): v kódu prefix `vos`, nikdy `shadow` (= Stínoví pistolníci) ani
// `ghost` (= duch Města duchů). Karta Duch je `DUCH` / `hasDuchCard`.

// Laso (Fistful) vypíná karty na stole – i zbraně Lemat a Brokovnice a modré karty
// Chřestýš a Odměna. highNoon.js na valley.js nesahá, takže kruh nevzniká.
if (typeof require === 'function' && typeof boardDeadFor === 'undefined') {
    globalThis.boardDeadFor = require('./highNoon.js').boardDeadFor;
}

// Zapnuté rozšíření? (Klíč drží menu i server: options.expansions.udoli_stinu.)
function vosOn(state) {
    return !!(state && state.options && state.options.expansions &&
              state.options.expansions.udoli_stinu);
}

// Které DRUHY karet (jméno karty) už mají hotový efekt, a tedy smí do balíčku (R14,
// vzor GEAR_READY ze Zlaté horečky). Karta bez efektu by ležela v ruce, bot by ji
// zkoušel hrát a server mlčky odmítal. Roste s fázemi F1–F8.
const VOS_CARDS_READY = [
    // F1 – jen existující mašinerie
    'Tomahawk', 'Poslední pivo', 'Chřestýš', 'Odměna', 'Lemat', 'Brokovnice',
    // F3 – fronta výstřelů a klikané zásahy s útočníkem
    'Opětovná palba', 'Roztříštěná kulka', 'Dvojitá rána',
    // F4 – kolečko voleb všech hráčů (pendingVosRound)
    'Divoká banda', 'Tornádo', 'Poker',
];

// ── Zbraně (F1) ──────────────────────────────────────────────────────────────
// Zbraň se poznává podle `effect` (R3), ne podle jména. Laso ji vypíná jako každou
// kartu na stole (stejně jako Volcanic).
function _weaponOn(state, p, effect) {
    return !!p && !!p.weapon && p.weapon.effect === effect && !boardDeadFor(state);
}

// Lemat: „Ve svém tahu můžeš použít libovolnou kartu (kromě VEDLE!) z ruky jako BANG!."
function lematActive(state, p) { return _weaponOn(state, p, 'VOS_LEMAT'); }

// Brokovnice: „Hráč zasažený kartou BANG! z této zbraně musí odhodit kartu z ruky."
function shotgunActive(state, p) { return _weaponOn(state, p, 'VOS_SHOTGUN'); }

// ── Karty vykládané před hráče (F1) ──────────────────────────────────────────
// Chřestýš a Odměna: „Polož před libovolného hráče" – tedy i před sebe a před šerifa
// (na rozdíl od Vězení). Jediná překážka je pravidlo „žádné dvě karty stejného jména
// před jedním hráčem". Klient, bot i server se ptají tímhle predikátem.
const VOS_PLACE_TYPES = ['Chřestýš', 'Odměna'];

function vosPlaceTargetOk(state, targetIdx, card) {
    if (!card || !VOS_PLACE_TYPES.includes(card.type)) return false;
    const t = state && state.players && state.players[targetIdx];
    if (!t || !isInPlay(t)) return false;
    return !(t.board || []).some(c => c && c.name === card.name);
}

// Ve hře? (Shim pro Node – v prohlížeči je isInPlay globál z core/distance.js.)
if (typeof require === 'function' && typeof isInPlay === 'undefined') {
    globalThis.isInPlay = require('./distance.js').isInPlay;
}
if (typeof require === 'function' && typeof canHeal === 'undefined') {
    globalThis.canHeal = require('./distance.js').canHeal;
}
if (typeof require === 'function' && typeof computeCanHit === 'undefined') {
    globalThis.computeCanHit = require('./distance.js').computeCanHit;
}
if (typeof require === 'function' && typeof computeDistance === 'undefined') {
    globalThis.computeDistance = require('./distance.js').computeDistance;
}

// ── Postavy (F2) ─────────────────────────────────────────────────────────────
// Colorado Bill: „Když zahraješ kartu BANG!, sejmi. Pokud je sejmutá karta piková ♠,
// nelze tento BANG! zrušit." Po pikovém sejmutí nese útok `vos.unavoidable` (protahuje
// se stejně jako zbytek kontextu `vos`, viz _beginBangResolution v logic/play.js).
// Nezrušitelný = žádná karta Vedle! (ani zelená ze stolu, ani Úhyb, Elena, Calamity),
// žádný Barel ani Jourdonnais. Záchrana posledního života (Pivo, Sid, Batoh) BANG!
// neruší, jen vrací život – ta zůstává. Ptá se server (handleResponse), klient
// (cardPlayability, zelené karty ve view/board.js) i bot – kdyby se rozešli, bot by
// posílal Vedle!, které server mlčky odmítne, a hra by se zasekla.
function vosUnavoidable(state) {
    const pr = state && state.pendingResponse;
    return !!(pr && pr.vos && pr.vos.unavoidable);
}

// Limonádový Jim: „Vždy, když některý z hráčů zahraje kartu PIVO, může si Jim za
// odhození libovolné karty doplnit 1 život." Nabídka má smysl jen tomu, kdo je ve hře,
// má co odhodit a má kam léčit (canHeal: ne plné životy, ne stín). Ptá se server při
// nabídce i při pročištění fronty (logic/valley.js).
function lemonadeEligible(p) {
    return !!p && isInPlay(p) && canHeal(p) && (p.hand || []).length > 0;
}

// ── Fronta výstřelů (F3) ─────────────────────────────────────────────────────
// Roztříštěná kulka: „Účinkuje jako BANG! na dostřel. Hráč dle tvého výběru ve
// vzdálenosti 1 od napadeného hráče (kromě tebe) se stává také terčem efektu BANG!."
// + Dynamite Box: „Je-li to možné, jako první cíl si musíte zvolit takového hráče
// v dostřelu vaší zbraně, jenž má jiného hráče ve vzdálenosti 1 (i kdyby to bylo pro vás
// nevýhodné)." Vzdálenost druhého cíle se měří OD PRVNÍHO cíle (computeDistance – Mustang,
// Hledí, Rose Doolan i Paul Regret platí, zbraně ne) a druhým cílem nesmí být střelec.
//
// Vrací seznam dvojic { first, seconds } – už ZÚŽENÝ podle povinnosti: existuje-li první
// cíl s druhým, jsou v seznamu jen takové. Prázdné `seconds` = obyčejný výstřel na jeden
// cíl (nikdo nemá souseda). Ptá se server (playFanning), klient (zvýraznění) i bot.
function fanningSeconds(state, myIndex, firstIdx) {
    const out = [];
    (state.players || []).forEach((p, i) => {
        if (i === myIndex || i === firstIdx || !isInPlay(p)) return;
        if (computeDistance(state, firstIdx, i) <= 1) out.push(i);
    });
    return out;
}

function fanningTargets(state, myIndex) {
    const all = [];
    (state.players || []).forEach((p, i) => {
        if (i === myIndex || !isInPlay(p)) return;
        if (!computeCanHit(state, myIndex, i)) return;
        all.push({ first: i, seconds: fanningSeconds(state, myIndex, i) });
    });
    return all.some(t => t.seconds.length) ? all.filter(t => t.seconds.length) : all;
}

// Evelyn Shebang (česká verze): „Ve své fázi 1 si smí líznout o 1 kartu méně, čímž
// automaticky vystřelí BANG! na vzdálenost 1." Vzdálenost bez zbraně (computeDistance),
// cílem je kdokoli jiný ve hře.
function evelynTargets(state, myIndex) {
    const out = [];
    (state.players || []).forEach((p, i) => {
        if (i === myIndex || !isInPlay(p)) return;
        if (computeDistance(state, myIndex, i) <= 1) out.push(i);
    });
    return out;
}

// Nabízí se právě teď Evelyn její výstřel? Jen ve FÁZI 1 (lízání na začátku tahu), před
// první kartou (dV: „rozhodnout předem") a jen jednou. Fáze lízání nese 'evelyn'
// v `options`, když ho server při jejím založení nabídl (_getDrawOptions) – Kit Carlson
// ani Claus ho nedostanou, mají vlastní odkrytou řadu. Ptá se server, klient i bot.
function evelynOffer(state, myIndex) {
    const ds = state && state.drawPhaseState;
    if (!ds || !ds.active || ds.playerIdx !== myIndex || state.phase !== 'DRAW') return false;
    if (!ds.isStartOfTurn || ds.cardsDrawn > 0 || ds.evelynUsed || ds.isKitCarlson || ds.isClaus) return false;
    if (!(ds.options || []).includes('evelyn')) return false;
    if ((ds.cardsNeeded || 0) < 1) return false;
    return evelynTargets(state, myIndex).length > 0;
}

// ── Kolečko voleb (F4): Divoká banda, Tornádo, Poker ────────────────────────
// Všechny tři karty nechají vybírat KAŽDÉHO (ostatního) hráče jeho vlastní karty z ruky.
// Vybírají VŠICHNI NARÁZ (`pendingVosRound.waiting` = kdo ještě nevybral) a hra počká na
// posledního – zrychlí to hru proti kolečku po jednom. U Tornáda a Pokeru se volba
// nikam nepřesouvá, dokud nevybrali všichni („všichni najednou", karta lícem dolů);
// volby (`picks`) vidí jen jejich vlastník (redactState v server/rooms.js). Divoká banda
// odhazuje hned, jak kdo vybere: odhoz je veřejný.
//
//   BANDIDOS_DISCARD – „Všichni ostatní hráči odhodí kartu BANG!, nebo odhodí 2 libovolné
//                      karty z ruky." S jedinou kartou odhodí ji, bez karet nic.
//   TORNADO_PICK     – „Každý hráč musí dát 2 karty z ruky hráči po levici." S jednou
//                      kartou dá jednu, bez karet nic (a soused dostane míň).
//   POKER_PICK       – „Všichni ostatní hráči vyloží po 1 kartě z ruky (pokud můžou)."
//   POKER_TAKE       – „Když nikdo nevyložil Eso, vezmi si až 2 karty z vyložených karet."
const VOS_ROUND_PHASES = {
    BANDIDOS: 'BANDIDOS_DISCARD',
    TORNADO:  'TORNADO_PICK',
    POKER:    'POKER_PICK',
};

// Ve které fázi kolečko právě je (POKER_TAKE = Poker po odkrytí vyložených karet).
function vosRoundPhase(r) {
    if (!r) return null;
    return r.kind === 'POKER' && r.pool ? 'POKER_TAKE' : VOS_ROUND_PHASES[r.kind];
}

// Kdo ještě vybírá? Při výběru z ruky (BANDIDOS_DISCARD, TORNADO_PICK, POKER_PICK) všichni,
// kdo ještě nevybrali (`waiting`), ve výběru z vyložených karet Pokeru (POKER_TAKE) jen
// hráč, který Poker zahrál (`playerIdx`). Mimo kolečko prázdné pole. Ptá se pendingActors
// (core/pending.js), server, klient i bot.
function vosRoundWaiting(state) {
    const r = state && state.pendingVosRound;
    if (!r || state.phase !== vosRoundPhase(r)) return [];
    if (r.pool) return r.playerIdx != null ? [r.playerIdx] : [];
    return Array.isArray(r.waiting) ? r.waiting.slice() : [];
}

// Čeká kolečko na volbu hráče `idx`?
function vosRoundWaitsFor(state, idx) {
    return idx != null && vosRoundWaiting(state).includes(idx);
}

// „Karta BANG!" pro Divokou bandu: pravý BANG!, Calamity Janet se svým Vedle!, pod
// Zúčtováním každá karta (playsAsBang). Lemat ne – platí jen „ve svém tahu".
// playability.js se na valley.js ptá sám, proto se tu bere až při volání (kruh).
function _playsAsBangLazy(state, p, card) {
    const f = typeof playsAsBang === 'function' ? playsAsBang : require('./playability.js').playsAsBang;
    return f(state, p, card);
}

// Kolik karet hráč s `n` kartami v ruce vybírá. U Divoké bandy je to „2, nebo jedna
// karta BANG!" – vrací se 2 a jedničku pouští vosRoundPickOk.
function vosRoundPickCount(kind, n) {
    if (kind === 'TORNADO' || kind === 'BANDIDOS') return Math.min(2, n);
    if (kind === 'POKER') return Math.min(1, n);
    return 0;
}

// Je `cardIds` platná volba hráče `idx` v právě běžícím kolečku? Jediný zdroj pravdy pro
// server (vosPick), klienta (kdy se rozsvítí potvrzovací tlačítko) i bota.
function vosRoundPickOk(state, idx, cardIds) {
    const r = state && state.pendingVosRound;
    if (!r || r.pool || !vosRoundWaitsFor(state, idx)) return false;
    const p = state.players && state.players[idx];
    if (!p || !Array.isArray(cardIds)) return false;
    if (new Set(cardIds).size !== cardIds.length) return false;
    const hand = p.hand || [];
    const cards = cardIds.map(id => hand.find(c => c && !c._placeholder && c.id === id));
    if (cards.some(c => !c)) return false;
    if (r.kind === 'BANDIDOS' && cards.length === 1 && hand.length > 1) {
        return _playsAsBangLazy(state, p, cards[0]);
    }
    return cards.length === vosRoundPickCount(r.kind, hand.length);
}

// Poker – výběr z vyložených karet: až 2 RŮZNÉ karty z `pool` (i žádná).
function pokerTakeOk(state, idx, cardIds) {
    const r = state && state.pendingVosRound;
    if (!r || r.kind !== 'POKER' || !r.pool || !vosRoundWaitsFor(state, idx)) return false;
    if (!Array.isArray(cardIds) || cardIds.length > 2) return false;
    if (new Set(cardIds).size !== cardIds.length) return false;
    return cardIds.every(id => r.pool.some(e => e && e.card && e.card.id === id));
}

// Poker: „Když nikdo nevyložil Eso" – rozhoduje VYTIŠTĚNÁ hodnota (Požehnání/Prokletí
// mění jen barvu).
function pokerHasAce(cards) {
    return (cards || []).some(c => c && c.value === 'A');
}

// Data karet rozšíření zúžená na hotové druhy – tohle jde do balíčku (`_deckDataFor`,
// logic/setup.js) a do katalogu karet debug hry.
function vosReadyCards(data) {
    return (data || []).filter(c => c && VOS_CARDS_READY.includes(c.name));
}

// Je dodaná značka rozšíření (symbol supa, assets/card_marks/udoli_stinu.webp)? Art
// chodí průběžně (§2.14) – dokud soubor není, loader ho nestahuje (žádné 404) a karty
// se pečou bez značky. Dodání = soubor do složky + tady `true`.
const VOS_MARK_READY = true;

// Leží před hráčem karta Duch? Stav Ducha se ODVOZUJE z karty na stole (R10), žádný
// příznak – kartu umí sebrat deset různých cest a odvozený stav se nemůže rozejít.
// (Do isInPlay/canHeal se zapojí až ve fázi F5.)
function hasDuchCard(p) {
    return !!p && (p.board || []).some(c => c && c.type === 'Duch');
}

// ── Zuřivá Doroty a Lee Van Kliff (Divoký západ), plán §2.17 ─────────────────
// Obě karty pracují s KATALOGEM druhů karet, takže by se nové druhy objevily samy.
// Každý druh proto musí mít rozhodnuté, co s ním (hlídá to strukturální test):
//   dorothy – smí ho Zuřivá Doroty poručit?
//   lvk     – smí Lee Van Kliff zopakovat jeho efekt? (Paměť drží jen HNĚDÉ karty,
//             takže u modrých je `false` jen pro úplnost.)
// `true` znamená „smí, AŽ bude karta hotová" – dokud druh není ve VOS_CARDS_READY,
// v balíčku ani v katalogu není a nikdo ho poručit ani zopakovat nemůže.
const VOS_KINDS = {
    'Tomahawk':          { dorothy: true,  lvk: true,  why: 'bang-efekt na cíl do vzdálenosti 2 (od poručeného)' },
    'Poslední pivo':     { dorothy: true,  lvk: true,  why: 'efekt = +1 život' },
    'Poker':             { dorothy: true,  lvk: true,  why: 'bez cíle' },
    'Tornádo':           { dorothy: true,  lvk: true,  why: 'bez cíle' },
    'Divoká banda':      { dorothy: true,  lvk: true,  why: 'bez cíle' },
    'Odměna':            { dorothy: true,  lvk: false, why: 'modrá s cílem – paměť Lee Van Kliffa drží jen hnědé' },
    'Chřestýš':          { dorothy: true,  lvk: false, why: 'modrá s cílem' },
    'Duch':              { dorothy: true,  lvk: false, why: 'modrá, cíl = vyřazený hráč' },
    'Lemat':             { dorothy: true,  lvk: false, why: 'zbraň jako každá jiná' },
    'Brokovnice':        { dorothy: true,  lvk: false, why: 'zbraň jako každá jiná' },
    'Roztříštěná kulka': { dorothy: false, lvk: false, why: 'dva cíle se do výběru cíle nevejdou' },
    'Dvojitá rána':      { dorothy: false, lvk: false, why: 'hraje se jen spolu s kartou BANG!' },
    'Útěk':              { dorothy: false, lvk: false, why: 'hraje se jen jako reakce' },
    'Obětavý skok':      { dorothy: false, lvk: false, why: 'hraje se jen jako reakce mimo vlastní tah' },
    'Opětovná palba':    { dorothy: false, lvk: false, why: 'hraje se jen jako reakce' },
};

function _vosKind(card) {
    if (!card || card.exp !== 'udoli_stinu') return null;
    return VOS_KINDS[card.name] || { dorothy: false, lvk: false };   // neznámý druh: radši ne
}

// Smí Zuřivá Doroty tenhle druh poručit? Karty mimo Údolí stínů se to netýká (true).
function vosDorothyOk(card) {
    const k = _vosKind(card);
    return k ? k.dorothy : true;
}

// Smí Lee Van Kliff zopakovat VLASTNÍ efekt téhle karty? (Karta zahraná jako BANG!
// pod Zúčtováním opakuje BANG!, ne svůj efekt – na to se tahle tabulka neptá.)
function vosRepeatOk(card) {
    const k = _vosKind(card);
    return k ? k.lvk : true;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { vosOn, VOS_CARDS_READY, vosReadyCards, VOS_MARK_READY, hasDuchCard,
                       VOS_KINDS, vosDorothyOk, vosRepeatOk,
                       lematActive, shotgunActive, VOS_PLACE_TYPES, vosPlaceTargetOk,
                       vosUnavoidable, lemonadeEligible,
                       fanningSeconds, fanningTargets, evelynTargets, evelynOffer,
                       VOS_ROUND_PHASES, vosRoundPhase, vosRoundWaiting, vosRoundWaitsFor, vosRoundPickCount,
                       vosRoundPickOk, pokerTakeOk, pokerHasAce };
}
