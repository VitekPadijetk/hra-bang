// core/highNoon.js — ČISTÝ izomorfní dotaz na aktivní událost rozšíření High Noon
// a A Fistful of Cards (druhý balíček, hraje se souběžně – viz logic/fistful.js).
// Server se ptá přes GameState.hasEvent(); klient (view/*) a bot (core/botPolicy.js)
// mají jen prostý JSON stav, proto tenhle helper. Obojí čte tatáž pole stavu.
// Globál v prohlížeči (<script> v index.html), require v Node/testech. Viz CLAUDE.md.

// Ptá se OBOU balíčků událostí: High Noon (`activeEvent`) i A Fistful of Cards
// (`activeFistful`). Hrají se současně a klíče karet jsou napříč nimi unikátní, takže
// volající nemusí řešit, ze kterého balíčku karta je. Zrcadlí GameState.hasEvent.
function eventActive(state, key) {
    if (!state) return false;
    return (!!state.activeEvent && state.activeEvent.key === key) ||
           (!!state.activeFistful && state.activeFistful.key === key);
}

// Kolik karet Bang! smí hráč zahrát za tah (Přestřelka = 2). Zrcadlí GameState._bangLimit.
function bangLimitFor(state) {
    return eventActive(state, 'PRESTRELKA') ? 2 : 1;
}

// Kazatel: ve SVÉM tahu nesmí hráč zahrát kartu Bang!. Zrcadlí GameState._bangBlocked.
function bangBlockedFor(state, playerIdx) {
    return eventActive(state, 'KAZATEL') && playerIdx === state.currentPlayerIndex;
}

// Reverend: po celé kolo nejde zahrát Pivo. Zrcadlí GameState._beerBlocked.
function beerBlockedFor(state) {
    return eventActive(state, 'REVEREND');
}

// Barva, která u karty PLATÍ. Požehnání = všechno srdcové, Prokletí = všechno pikové;
// hodnota se nemění. Zrcadlí GameState._effSuit (logic/highNoon.js). Hodnoty jsou stejné
// řetězce jako Suits v logic/entities.js – ty tady nejsou k dispozici (core je bez závislostí).
const SUIT_HEARTS = '♥️';
const SUIT_SPADES = '♠️';
function effSuit(state, card) {
    if (!card) return null;
    if (eventActive(state, 'POZEHNANI')) return SUIT_HEARTS;
    if (eventActive(state, 'PROKLETI')) return SUIT_SPADES;
    return card.suit;
}

// Želízka (přibalená karta): hráč na tahu si po lízání zvolil barvu a v tomhle tahu
// smí hrát jen karty té barvy Z RUKY – včetně karet zahraných jako reakce ve vlastním
// tahu. Karty už ležící na stole (aktivace zelených, zelené Vedle!) omezené nejsou.
// Zrcadlí GameState._suitBlocked (logic/highNoon.js).
function suitBlockedFor(state, playerIdx, card) {
    if (!eventActive(state, 'ZELIZKA') || !card) return false;
    if (playerIdx !== state.currentPlayerIndex) return false;
    const p = state.players && state.players[playerIdx];
    if (!p || !p._handcuffsSuit) return false;
    return effSuit(state, card) !== p._handcuffsSuit;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { eventActive, bangLimitFor, bangBlockedFor, beerBlockedFor, effSuit, suitBlockedFor };
}
