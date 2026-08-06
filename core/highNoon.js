// core/highNoon.js — ČISTÝ izomorfní dotaz na aktivní událost rozšíření High Noon.
// Server se ptá přes GameState.hasEvent(); klient (view/*) a bot (core/botPolicy.js)
// mají jen prostý JSON stav, proto tenhle helper. Obojí čte totéž pole `activeEvent`.
// Globál v prohlížeči (<script> v index.html), require v Node/testech. Viz CLAUDE.md.

function eventActive(state, key) {
    return !!(state && state.activeEvent && state.activeEvent.key === key);
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { eventActive, bangLimitFor, bangBlockedFor, beerBlockedFor };
}
