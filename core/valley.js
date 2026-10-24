// core/valley.js — zrcadlo rozšíření Údolí stínů (The Valley of Shadows) nad prostým stavem.
// BEZ Phaseru/DOM. Izomorfní: v prohlížeči globály (načteno PŘED core/playability.js),
// v Node přes require. Ptá se jím server (logic/valley.js), klient (view/*) i bot
// (core/botPolicy.js) – kdyby se rozešli, server akci mlčky odmítne a hra botů se zasekne.
//
// Plán: docs/udoli-stinu-plan.md. Fáze F0 je jen KOSTRA – žádné pravidlo se tu zatím
// nemění. Predikáty karet (isBangCardPlay, vosEvadable, saveEligible, fanningTargets, …)
// přibývají s fázemi F1–F8.
//
// POZOR na jména (R2): v kódu prefix `vos`, nikdy `shadow` (= Stínoví pistolníci) ani
// `ghost` (= duch Města duchů). Karta Duch je `DUCH` / `hasDuchCard`.

// Zapnuté rozšíření? (Klíč drží menu i server: options.expansions.udoli_stinu.)
function vosOn(state) {
    return !!(state && state.options && state.options.expansions &&
              state.options.expansions.udoli_stinu);
}

// Které DRUHY karet (jméno karty) už mají hotový efekt, a tedy smí do balíčku (R14,
// vzor GEAR_READY ze Zlaté horečky). Karta bez efektu by ležela v ruce, bot by ji
// zkoušel hrát a server mlčky odmítal. Roste s fázemi F1–F8.
const VOS_CARDS_READY = [];

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
                       VOS_KINDS, vosDorothyOk, vosRepeatOk };
}
