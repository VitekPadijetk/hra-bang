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
    // F5 – vyřazený hráč zpátky ve hře s nulou životů
    'Duch',
    // F6 – okno úniku (EVADE_OFFER) a Útěk jako odpověď na bang-efekt
    'Útěk',
    // F8 – okno záchrany (SAVE_OFFER) a odměna (SAVE_REWARD)
    'Obětavý skok',
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
//
// Duch (F5): „Polož před vyřazeného hráče." Cílem je jen hráč MIMO hru – tedy ani duch
// Města duchů / stín na svůj tah (ti ve hře jsou), ani hráč, který už Ducha má. Sám
// sebe zahrávající cílit nemůže: hraje, takže ve hře je. Pod Lasem (Fistful) nemá
// karta na stole žádný efekt – Duch by hráče vrátil a hned zase vyřadil, proto nejde.
const VOS_PLACE_TYPES = ['Chřestýš', 'Odměna', 'Duch'];

function vosPlaceTargetOk(state, targetIdx, card) {
    if (!card || !VOS_PLACE_TYPES.includes(card.type)) return false;
    const t = state && state.players && state.players[targetIdx];
    if (!t) return false;
    if (card.type === 'Duch') {
        return t.health <= 0 && !isInPlay(t) && !boardDeadFor(state);
    }
    if (!isInPlay(t)) return false;
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
if (typeof require === 'function' && typeof hasAbility === 'undefined') {
    globalThis.hasAbility = require('./distance.js').hasAbility;
}
if (typeof require === 'function' && typeof computeDistance === 'undefined') {
    globalThis.computeDistance = require('./distance.js').computeDistance;
}
// Karta Duch (F5): dotazy žijí v core/distance.js, protože se na ně ptá isInPlay.
if (typeof require === 'function' && typeof isVosGhost === 'undefined') {
    const __vg = require('./distance.js');
    globalThis.isVosGhost = __vg.isVosGhost;
    globalThis.staysInPlay = __vg.staysInPlay;
    globalThis.hasDuchCard = __vg.hasDuchCard;
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
        // Duch (F5) ve hře je, ale život ztratit nemůže – na něj se nestřílí (ani druhým
        // cílem, ani jako „soused", kvůli kterému by první cíl byl povinný).
        if (i === myIndex || i === firstIdx || !isInPlay(p) || isVosGhost(p)) return;
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
        if (i === myIndex || !isInPlay(p) || isVosGhost(p)) return;   // na Ducha se nestřílí
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

// ── Okno úniku (F6): Útěk a Mick Defender ────────────────────────────────────
// Útěk:          „Pokud jsi jediným cílem karty jiné než BANG!, vyhneš se efektu
//                 odhozením této karty."
// Mick Defender: „Pokud je Mick jediným cílem karty, může použít kartu VEDLE, aby se
//                 jejímu efektu vyhnul." (Albi: i modré a zelené karty mířící jen na něj,
//                 ne Dynamit. Kartám BANG! se brání obvyklým způsobem.)
// R11: jediný cíl, karta libovolné barvy ZAHRANÁ hráčem – Panika, Cat Balou, Duel (jen
// před začátkem), Ragtime, Kankán, Krytý vůz, Vězení, Chřestýš, Odměna, opakování Lee
// Van Kliffem a bang-efekty na jeden cíl. Ne Dynamit (přichází posunem), ne hromadné
// karty, ne karta BANG!, ne vybavení Zlaté horečky, ne schopnosti postav.
//
// Kudy se uniká, záleží na tom, jestli karta má vlastní obranu:
//   • bang-efekty (Úder, Tomahawk, Springfield…) už RESPOND mají – Útěk je v něm jen
//     další platná odpověď, která efekt zruší celý (escapeRespondOk). Mick se proti nim
//     brání svou kartou Vedle! normálně, takže tam nic dalšího nepotřebuje;
//   • ostatní karty se zastaví ve fázi EVADE_OFFER (logic/valley.js) – ale JEN tehdy,
//     když cíl reagovat může (R4): drží Útěk, nebo je Mick a má čím zahrát Vedle!.

// Které karty z ruky cíle smí únik zaplatit? Prázdné = okno se vůbec neotevře.
function evadeOptions(state, idx) {
    if (!vosOn(state)) return [];
    const p = state.players && state.players[idx];
    if (!p || !isInPlay(p)) return [];
    const mick = hasAbility(p, 'Mick Defender');
    return (p.hand || []).filter(c => c && !c._placeholder &&
        (c.type === 'Útěk' || (mick && _playsAsMissedLazy(state, p, c))));
}

// Otevře se pro tenhle zásah okno úniku? Sám na sebe se nikdo nevyhýbá (Ragtime na
// vlastní stůl, Chřestýš před sebe).
function vosEvadable(state, attackerIdx, targetIdx) {
    if (!vosOn(state) || attackerIdx == null || attackerIdx === targetIdx) return false;
    return evadeOptions(state, targetIdx).length > 0;
}

// Smí hráč `idx` právě teď v RESPOND zahrát `card` jako Útěk? Jen proti bang-EFEKTU
// zahranému kartou na něj samotného: ne karta BANG! (Lemat, Zúčtování, Calamity – `vos.
// bangCard`, Odstřelovač a Odražená střela nejsou efekty), ne hromadný útok ani Duel,
// ne útok bez střelce (Fistful of Cards), ne nezrušitelný BANG! Colorada a ne výstřel,
// který karta nemá – Evelyn Shebang a Doc Holyday jsou schopnosti, Láhev je vybavení
// a Roztříštěná kulka se dvěma cíli nemíří na jediného (`vos.noEscape`).
function escapeRespondOk(state, idx, card) {
    if (!card || card.type !== 'Útěk' || !vosOn(state)) return false;
    const pr = state.pendingResponse;
    if (state.phase !== 'RESPOND' || !pr || !pr.active || pr.targetIdx !== idx) return false;
    if (pr.sourceCard !== 'Bang!' || pr.requiredCard !== 'Vedle!') return false;
    if (!pr.bangEffect || pr.ricochet) return false;
    if (pr.originatorIdx == null || pr.originatorIdx === idx) return false;
    const v = pr.vos || {};
    if (v.bangCard || v.unavoidable || v.noEscape || v.shot === 'EVELYN') return false;
    return true;
}

// ── Okno záchrany (F8): Obětavý skok ────────────────────────────────────────
// „Lze zahrát pouze mimo tvůj tah. Odhozením této karty zabráníš jinému hráči ztratit
// 1 život. Přežije-li, vezmi si 2 karty z jeho ruky, nebo z balíčku." (Dynamite Box)
//
// R9: ptá se na TŘECH místech, kde ztráta života vychází z rozhodnutí oběti – oběť
// v RESPOND bere zásah, klikaný zásah (dynamit, Chřestýš, Ruská ruleta, Madam Zuzana,
// Roubík, Dvojitá rána) a Pravé poledne. Dobrovolná ztráta (Chuck Wengam, Pokrevní
// bratři) se nezachraňuje. Okno se otevře jen tehdy, když zachránce existuje (R4).
//
// Kdo smí zachránit hráče `victimIdx`? Kdo drží Obětavý skok, je ve hře, není oběť
// a NENÍ NA TAHU („pouze mimo tvůj tah"; pod Zuřivou Doroty je na tahu ten, komu
// sedadlo patří). Duch Města duchů a stín jsou ve hře jen na svůj tah, takže
// zachraňovat nemůžou nikdy; Duch (karta) ano – hraje jako normální hráč. Oběť musí
// mít co ztratit (Duch ani duch Města duchů na nule život neztrácí).
// Vrací sedadla po směru od oběti – kus je sice jen jeden, ale s namnoženými daty
// (zátěž, debug) jich může být víc a okno se pak nabízí jednomu po druhém.
function saveCandidates(state, victimIdx) {
    if (!vosOn(state)) return [];
    const players = (state && state.players) || [];
    const v = players[victimIdx];
    if (!v || !(v.health > 0)) return [];
    const owner = state._dorothyOwnerIdx != null ? state._dorothyOwnerIdx : state.currentPlayerIndex;
    const n = players.length;
    const out = [];
    for (let k = 1; k < n; k++) {
        const i = (victimIdx + k) % n;
        if (i === owner) continue;
        const p = players[i];
        if (!isInPlay(p)) continue;
        if ((p.hand || []).some(c => c && !c._placeholder && c.type === 'Obětavý skok')) out.push(i);
    }
    return out;
}

function saveEligible(state, victimIdx) {
    return saveCandidates(state, victimIdx).length > 0;
}

// Odměna: „vezmi si 2 karty z jeho ruky, nebo z balíčku" – kombinovat se nesmí (DB).
// Má-li zachráněný jedinou kartu, bere se ta jedna (nebo 2 z balíčku); bez karet v ruce
// se volba nenabízí a líže se z balíčku rovnou. Ptá se server, klient (tlačítka) i bot.
function saveRewardHandCount(state) {
    const r = state && state.pendingSaveReward;
    const v = r && state.players && state.players[r.victimIdx];
    return v ? Math.min(2, (v.hand || []).length) : 0;
}

// „Karta Vedle!" pro Micka Defendera – Big Spencer, Elena Fuente, Calamity i Zúčtování
// jdou stejným predikátem jako v obraně (playability.js se na valley.js ptá sám, kruh).
function _playsAsMissedLazy(state, p, card) {
    const f = typeof playsAsMissed === 'function' ? playsAsMissed : require('./playability.js').playsAsMissed;
    return f(state, p, card);
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

// Karta Duch (F5): `hasDuchCard`, `isVosGhost` a `staysInPlay` jsou v core/distance.js
// – ptá se na ně isInPlay i canHeal, takže tam musí být dřív. Exportují se i odsud.

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
    module.exports = { vosOn, VOS_CARDS_READY, vosReadyCards, VOS_MARK_READY, hasDuchCard, isVosGhost, staysInPlay,
                       VOS_KINDS, vosDorothyOk, vosRepeatOk,
                       lematActive, shotgunActive, VOS_PLACE_TYPES, vosPlaceTargetOk,
                       vosUnavoidable, lemonadeEligible,
                       fanningSeconds, fanningTargets, evelynTargets, evelynOffer,
                       VOS_ROUND_PHASES, vosRoundPhase, vosRoundWaiting, vosRoundWaitsFor, vosRoundPickCount,
                       vosRoundPickOk, pokerTakeOk, pokerHasAce,
                       evadeOptions, vosEvadable, escapeRespondOk,
                       saveCandidates, saveEligible, saveRewardHandCount };
}
