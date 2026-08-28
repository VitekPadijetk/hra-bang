// core/highNoon.js — ČISTÝ izomorfní dotaz na aktivní událost rozšíření High Noon,
// A Fistful of Cards (druhý balíček, logic/fistful.js) a Divoký západ (třetí balíček,
// logic/wildWest.js). Všechny tři se hrají souběžně.
// Server se ptá přes GameState.hasEvent(); klient (view/*) a bot (core/botPolicy.js)
// mají jen prostý JSON stav, proto tenhle helper. Obojí čte tatáž pole stavu.
// Globál v prohlížeči (<script> v index.html), require v Node/testech. Viz CLAUDE.md.

// Ptá se VŠECH TŘÍ balíčků událostí: High Noon (`activeEvent`), A Fistful of Cards
// (`activeFistful`) i Divoký západ (`activeWws`). Hrají se současně a klíče karet jsou
// napříč nimi unikátní, takže volající nemusí řešit, ze kterého balíčku karta je.
// Zrcadlí GameState.hasEvent.
function eventActive(state, key) {
    if (!state) return false;
    return (!!state.activeEvent && state.activeEvent.key === key) ||
           (!!state.activeFistful && state.activeFistful.key === key) ||
           (!!state.activeWws && state.activeWws.key === key);
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

// A Fistful of Cards – Laso: karty vyložené před hráči nemají žádný efekt (dostřel
// zbraně, Mustang/Skrýš, Dalekohled/Hledí, Barel, Dynamit, Vězení i zelené karty).
// Zrcadlí GameState._boardDead (logic/fistful.js).
function boardDeadFor(state) {
    return eventActive(state, 'LASO');
}

// A Fistful of Cards – Soudce: karta z ruky se nesmí vyložit před žádného hráče.
// Zrcadlí GameState._judgeBlocks (logic/fistful.js); typy jsou tytéž řetězce jako
// CardType v logic/entities.js (core je bez závislostí, viz effSuit výš).
const JUDGE_BLOCKED_TYPES = ['Zbraň', 'Vybavení', 'Barel', 'Dynamit', 'Vězení'];
function judgeBlocksFor(state, card) {
    if (!card || !eventActive(state, 'SOUDCE')) return false;
    return !!card.green || JUDGE_BLOCKED_TYPES.includes(card.type);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { eventActive, bangLimitFor, bangBlockedFor, beerBlockedFor, effSuit, suitBlockedFor,
                       boardDeadFor, judgeBlocksFor };
}
