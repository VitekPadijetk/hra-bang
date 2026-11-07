// core/armed.js — zrcadlo rozšíření Ozbrojení a nebezpeční (Armed & Dangerous) nad prostým
// stavem. BEZ Phaseru/DOM. Izomorfní: v prohlížeči globály (načteno PŘED
// core/playability.js), v Node přes require. Ptá se jím server (logic/armed.js), klient
// (view/*) i bot – kdyby se rozešli, server akci mlčky odmítne a hra botů se zasekne.
//
// Plán: docs/ozbrojeni-a-nebezpecni-plan.md. Predikáty karet přibývají s fázemi A1–A7.
//
// POZOR na jména (§2.3): prefix `ad`/`AD_`. Žetony nabití jsou v kódu `adLoads` – na
// postavě `p.adLoads`, na kartě ve hře `card.adLoads`. Nepoužívat `token*` (identita pro
// rejoin), `load*` (klientské načítání assetů) ani `preacher*` (Kazatel z High Noonu).

if (typeof require === 'function') {
    if (typeof isInPlay === 'undefined') globalThis.isInPlay = require('./distance.js').isInPlay;
    if (typeof isDangerousCard === 'undefined') globalThis.isDangerousCard = require('./cardRules.js').isDangerousCard;
}

// Zapnuté rozšíření? (Klíč drží menu i server: options.expansions.ozbrojeni.)
function adOn(state) {
    return !!(state && state.options && state.options.expansions &&
              state.options.expansions.ozbrojeni);
}

// Které DRUHY karet (jméno karty) už mají hotový efekt, a tedy smí do balíčku (vzor
// VOS_CARDS_READY). Karta bez efektu by ležela v ruce, bot by ji zkoušel hrát a server
// mlčky odmítal. Roste s fázemi A1–A6; na konci (A7) je celý.
const AD_CARDS_READY = [
    // A0 – šest karet ze základní hry (4× BANG!, Cat Balou, Vedle!): jen do balíčku
    'Bang!', 'Cat Balou', 'Vedle!',
];

// Data karet rozšíření zúžená na hotové druhy – tohle jde do balíčku (`_deckDataFor`,
// logic/setup.js).
function adReadyCards(data) {
    return (data || []).filter(c => c && AD_CARDS_READY.includes(c.name));
}

// Katalog karet debug hry: hotové druhy + Nebezpečné karty, které už jde VYLOŽIT (fáze A0
// – vyložení se 3 žetony a kostičky na stole), i když jejich efekt ještě nefunguje. Bomba
// ne: ta se hraje na libovolného hráče a přijde až s fází A4.
function adDebugCards(data) {
    return (data || []).filter(c => c && (AD_CARDS_READY.includes(c.name) ||
        (c.props && c.props.dangerous && c.props.dangerous.cost != null)));
}

// Je dodaná značka rozšíření (pistole s dynamitem, assets/card_marks/ozbrojeni.webp)?
// Dokud soubor není, loader ho nestahuje (žádné 404) a karty se pečou bez značky.
const AD_MARK_READY = false;

// ── Žetony nabití (§2.5) ─────────────────────────────────────────────────────
// 32 dřevěných kostiček ve společné zásobě. Na kartě i na postavě nejvýš 4. Nová
// Nebezpečná karta začíná na 3 („bez ohledu na to, je-li to zbraň nebo objekt").
const AD_LOAD_TOTAL = 32;
const AD_LOAD_CAP = 4;
const AD_ARM_LOADS = 3;

// Kolik žetonů leží na kartě nebo postavě.
function adLoadsOf(holder) {
    return (holder && holder.adLoads) || 0;
}

// Nebezpečné karty, které hráč má VE HŘE (zbraň + stůl). Colt .45 kartou není.
function adCardsInPlay(p) {
    if (!p) return [];
    const out = [];
    if (p.weapon && p.weapon.id !== -1 && isDangerousCard(p.weapon)) out.push(p.weapon);
    (p.board || []).forEach(c => { if (isDangerousCard(c)) out.push(c); });
    return out;
}

// Zásoba se NEUKLÁDÁ, počítá se (R3): 32 minus žetony na postavách hráčů ve hře a na
// jejich Nebezpečných kartách ve hře. Karta, která hru opustí (Panika, Cat Balou, Vulture
// Sam, nová zbraň, vyřazení…), tím vrátí své žetony do zásoby sama – nikdo je nemusí
// uklízet a nemůžou se ztratit ani zdvojit. Staré číslo, které na takové kartě zůstane,
// se nepočítá a každé vyložení ho přepíše (`_adAdd` s `fresh`).
function adSupply(state) {
    let used = 0;
    ((state && state.players) || []).forEach(p => {
        if (!p || !isInPlay(p)) return;
        used += adLoadsOf(p);
        adCardsInPlay(p).forEach(c => { used += adLoadsOf(c); });
    });
    return AD_LOAD_TOTAL - used;
}

// Smí hráč Nebezpečnou kartu z ruky vyložit? Jako modrá (ne dvě stejného jména, zbraň
// ne tutéž znovu) a navíc „pokud v zásobě není požadovaný počet žetonů, kartu nemůžete
// zahrát". Bomba (cena null, hraje se na libovolného hráče) zatím ne – fáze A4.
function adArmOk(state, me, card) {
    if (!me || !isDangerousCard(card)) return false;
    if (card.dangerous.cost == null) return false;
    if (adSupply(state) < AD_ARM_LOADS) return false;
    if (card.type === 'Zbraň') return !(me.weapon && me.weapon.id !== -1 && me.weapon.name === card.name);
    return !(me.board || []).some(c => c.name === card.name);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { adOn, AD_CARDS_READY, adReadyCards, adDebugCards, AD_MARK_READY,
                       AD_LOAD_TOTAL, AD_LOAD_CAP, AD_ARM_LOADS,
                       adLoadsOf, adCardsInPlay, adSupply, adArmOk };
}
