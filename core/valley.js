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

// Data karet rozšíření zúžená na hotové druhy – tohle jde do balíčku (`_deckDataFor`,
// logic/setup.js) a do katalogu karet debug hry.
function vosReadyCards(data) {
    return (data || []).filter(c => c && VOS_CARDS_READY.includes(c.name));
}

// Je dodaná značka rozšíření (symbol supa, assets/card_marks/udoli_stinu.webp)? Art
// chodí průběžně (§2.14) – dokud soubor není, loader ho nestahuje (žádné 404) a karty
// se pečou bez značky. Dodání = soubor do složky + tady `true`.
const VOS_MARK_READY = false;

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
                       lematActive, shotgunActive, VOS_PLACE_TYPES, vosPlaceTargetOk };
}
