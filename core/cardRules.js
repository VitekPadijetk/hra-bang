// Čisté pravidlo: jakou akci klient zahájí po výběru karty z ruky.
// BEZ závislosti na Phaseru/DOM – jen mapování (karta, postava) -> akce.
// Izomorfní: v prohlížeči globál getActionForCard, v Node/testech require.
//
// Vrací jeden z: "SHOOT" | "FANNING" | "PLAY_BLUE" | "PLAY_CARD" | název cílené karty
// ("Panika!" | "Cat Balou" | "Duel" | "Vězení" | "Chřestýš" | "Odměna").

// `character` je BUĎ jméno postavy, NEBO pole jmen (abilitiesOf) – Greygory Deck
// (Divoký západ) má schopnosti dvou postav naráz, takže se sem Calamity Janet může
// dostat jako jedna položka seznamu. Volající z jádra posílají `abilitiesOf(me)`.
function getActionForCard(card, character) {
    const isJanet = Array.isArray(character)
        ? character.includes("Calamity Janet")
        : character === "Calamity Janet";
    // Dodge City „odhoď další kartu": hráč nejdřív zvolí CÍL (balíček / postava /
    // karta soupeře) a teprve pak platí druhou kartou. Klient podle akce ví, co je
    // klikatelné: DE_DECK = balíček (Whisky/Rvačka), DE_HEAL = postava (Tequila),
    // DE_BANG = soupeř (Springfield), DE_STEAL = karta soupeře (Ragtime).
    if (card.discardExtra) {
        switch (card.discardExtra) {
            case 'heal_self_2': return "DE_DECK";
            case 'brawl':       return "DE_DECK";
            case 'heal_any':    return "DE_HEAL";
            case 'bang_any':    return "DE_BANG";
            case 'steal_any':   return "DE_STEAL";
        }
    }
    // Zelené karty se z ruky jen vyloží na stůl (jako modré); aktivují se pak ze stolu.
    if (card.green) return "PLAY_BLUE";
    // Ozbrojení a nebezpeční: Nebezpečná karta se vykládá před sebe jako modrá (zbraň
    // i objekt). Výjimkou je Bomba – ta jde na libovolného hráče (fáze A4, zatím nic).
    if (card.dangerous) return card.type === "Bomba" ? "PLAY_CARD" : "PLAY_BLUE";
    // Karty s bang-efektem (Úder, …) se míří jako Bang!. (Zelené sem nedojdou – výše.)
    if (card.bangEffect && !card.green) return "SHOOT";
    // Údolí stínů – Opětovná palba se počítá jako karta Vedle!, takže ji Calamity Janet
    // smí zahrát jako BANG! (dV 2427678).
    if (card.type === "Bang!" || (isJanet && (card.type === "Vedle!" || card.type === "Opětovná palba"))) {
        return "SHOOT";
    }
    // Údolí stínů – Roztříštěná kulka: míří se na DVA cíle (první v dostřelu, druhý
    // ve vzdálenosti 1 od prvního), takže má vlastní akci.
    if (card.type === "Roztříštěná kulka") return "FANNING";
    // Údolí stínů: Chřestýš a Odměna se vykládají před cíl (libovolného hráče, i sebe),
    // Duch před vyřazeného hráče (vosPlaceTargetOk, core/valley.js).
    if (["Panika!", "Cat Balou", "Duel", "Vězení", "Chřestýš", "Odměna", "Duch"].includes(card.type)) {
        return card.type;
    }
    if (["Zbraň", "Barel", "Vybavení", "Dynamit"].includes(card.type)) {
        return "PLAY_BLUE";
    }
    return "PLAY_CARD";
}

// Modré karty (karty s modrým okrajem, které se vykládají na stůl). Zelené karty
// rozšíření Dodge City mají vlastní typy a `green: true`, takže sem nespadají.
// POZOR: **Vězení je modrá karta** – jen se vykládá před SOUPEŘE, ne před sebe.
// Jediný zdroj pravdy pro schopnost Josého Delgada (odhoď modrou → lízni 2): ptá se
// jím server (logic/characters.js), klient (view/board.js) i bot (core/botPolicy.js).
// Údolí stínů: Odměna, Chřestýš a Duch (zbraně Lemat a Brokovnice jsou „Zbraň").
const BLUE_CARD_TYPES = ["Zbraň", "Barel", "Vybavení", "Dynamit", "Vězení",
                         "Odměna", "Chřestýš", "Duch"];

// Ozbrojení a nebezpeční: Nebezpečné ZBRANĚ mají typ „Zbraň", ale modré NEJSOU – mají
// oranžový okraj. Věta, která jmenuje modrou kartu (dobití žetonem za zahrání, José
// Delgado), oranžovou nezahrnuje (rozhodnutí R-U2 a R2 plánu).
function isBlueCard(card) {
    return !!card && !card.green && !card.dangerous && BLUE_CARD_TYPES.includes(card.type);
}

// Ozbrojení a nebezpeční: Nebezpečná karta (oranžový okraj) – vykládá se jako modrá,
// nese žetony nabití a za ně dělá svůj efekt. Jediný dotaz „je to oranžová?".
function isDangerousCard(card) {
    return !!card && !!card.dangerous;
}

// Hnědá karta = zahraj a odhoď: ne modrá, ne zelená, ne oranžová. Ptá se jím paměť Lee
// Van Kliffa (`_markBrownPlayed`), aby oranžovou kartu nebral za hnědou.
function isBrownCard(card) {
    return !!card && !card.green && !isDangerousCard(card) && !isBlueCard(card);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getActionForCard, isBlueCard, isDangerousCard, isBrownCard, BLUE_CARD_TYPES };
}
