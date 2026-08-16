// Čisté mapování karta → textury nového vykreslování (sdílený art + skládané marky).
// BEZ závislosti na Phaseru/DOM. Izomorfní: v prohlížeči <script> vytvoří globály,
// v Node/testech se importuje přes require('./core/cardArt.js').
//
// Nové vykreslování: v assetech je jeden art-obrázek na DRUH karty (assets/card_art/<art>.webp,
// pole `art` v cards.json) a malé průhledné marky hodnoty/barvy (assets/card_marks/*.webp).
// Klient je při startu složí do textury `card_<id>` (viz buildCardTextures v game.js);
// když art/marky pro daný druh chybí, poskládá se karta z placeholderu + názvu + marek –
// čitelná karta vznikne vždy (staré hotové karty playing_cards/<id>.png jako fallback padly).

// Mapa suit → slug souboru marky barvy. Klíče jsou DVOJÍ, protože karta má za života
// dvě podoby barvy: v datech (cards.json, ze kterých se pečou textury) je to 'HEARTS',
// ve stavu hry (Card konstruktor přemapuje přes Suits) už symbol '♥️'. Bez symbolových
// aliasů vracel suitMarkKey pro kartu ZE STAVU null – a tichý důsledek byl, že pulzující
// zvýraznění hodnoty/barvy při snímání (pulseCheckMark) vůbec nenaskočilo, kromě
// Požehnání/Prokletí, kde se marka bere z přebíjené barvy.
const SUIT_SLUG = {
    HEARTS: 'hearts', DIAMONDS: 'diamonds', CLUBS: 'clubs', SPADES: 'spades',
    '♥️': 'hearts', '♦️': 'diamonds', '♣️': 'clubs', '♠️': 'spades',
};

// Texturový klíč art-obrázku druhu karty ('art_bang', …). null když karta nemá `art`.
function artKey(card) {
    return card && card.art ? 'art_' + card.art : null;
}

// Texturový klíč marky hodnoty ('value_Q', 'value_10', …).
function valueMarkKey(card) {
    return card && card.value != null ? 'value_' + card.value : null;
}

// Texturový klíč marky barvy ('suit_hearts', …). null pro neznámý suit.
function suitMarkKey(card) {
    const slug = card && SUIT_SLUG[card.suit];
    return slug ? 'suit_' + slug : null;
}

// Unikátní art slugy napříč daty karet (pro preload). Vrací pole slugů (bez prefixu).
function distinctArtKeys(cardData) {
    const set = new Set();
    (cardData || []).forEach(c => { if (c && c.art) set.add(c.art); });
    return [...set];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SUIT_SLUG, artKey, valueMarkKey, suitMarkKey, distinctArtKeys };
}
