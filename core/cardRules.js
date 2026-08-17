// Čisté pravidlo: jakou akci klient zahájí po výběru karty z ruky.
// BEZ závislosti na Phaseru/DOM – jen mapování (karta, postava) -> akce.
// Izomorfní: v prohlížeči globál getActionForCard, v Node/testech require.
//
// Vrací jeden z: "SHOOT" | "PLAY_BLUE" | "PLAY_CARD" | název cílené karty
// ("Panika!" | "Cat Balou" | "Duel" | "Vězení").

function getActionForCard(card, character) {
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
    // Karty s bang-efektem (Úder, …) se míří jako Bang!. (Zelené sem nedojdou – výše.)
    if (card.bangEffect && !card.green) return "SHOOT";
    if (card.type === "Bang!" || (character === "Calamity Janet" && card.type === "Vedle!")) {
        return "SHOOT";
    }
    if (["Panika!", "Cat Balou", "Duel", "Vězení"].includes(card.type)) {
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
const BLUE_CARD_TYPES = ["Zbraň", "Barel", "Vybavení", "Dynamit", "Vězení"];

function isBlueCard(card) {
    return !!card && !card.green && BLUE_CARD_TYPES.includes(card.type);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getActionForCard, isBlueCard, BLUE_CARD_TYPES };
}
