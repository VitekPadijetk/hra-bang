// core/goldRush.js — ČISTÉ zrcadlo pravidel rozšíření Zlatá horečka nad PROSTÝM stavem
// (stejný tvar jako `room.gameState` / payload klienta), bez instance GameState.
//
// Proč vůbec existuje: server (logic/goldRush.js), klient (view/*) i bot (core/botPolicy.js)
// se musí ptát JEDNÍM predikátem. Kdyby se rozešly, klient nabídne nákup, server ho mlčky
// odmítne a hra jen botů se zasekne na akci, která nic nemění. Je to stejný důvod jako
// u core/highNoon.js a core/playability.js.
//
// Identita karty vybavení je `effect` (ZH_PANAK, …), NIKDY jméno – viz rozhodnutí R1.
// Izomorfní: globál v prohlížeči (<script> v index.html), require v Node/testech.

if (typeof require === 'function') {
    if (typeof eventActive === 'undefined') {
        const __hn = require('./highNoon.js');
        globalThis.eventActive = __hn.eventActive;
    }
    // Samostatné guardy (viz stejný vzor v core/botPolicy.js): bloky hlídané jedním
    // globálem by ostatní přeskočily, kdyby si highNoon.js natáhl někdo dřív.
    if (typeof beerBlockedFor === 'undefined') {
        globalThis.beerBlockedFor = require('./highNoon.js').beerBlockedFor;
    }
    if (typeof suitBlockedFor === 'undefined') {
        globalThis.suitBlockedFor = require('./highNoon.js').suitBlockedFor;
    }
    if (typeof isInPlay === 'undefined') {
        globalThis.isInPlay = require('./distance.js').isInPlay;
    }
    // Fistful – Právo západu: nákup nesmí „vypnout" vynucenou kartu. Zrcadlo serverového
    // _lawLocked leží v playability.js, tady se jen volá.
    if (typeof lawLocksOther === 'undefined') {
        globalThis.lawLocksOther = require('./playability.js').lawLocksOther;
    }
}

// Hraje se rozšíření? Vlastní příznak `_goldRush`, ne „balíček není prázdný" – karet je
// 24 a všechny mohou být rozkoupené (zrcadlí GameState._goldRushOn).
function goldRushOn(state) {
    return !!(state && state._goldRush);
}

// Vybavení hráče (černý rám leží před ním). VLASTNÍ pole vedle `board` – proto se na něj
// nikdy neptat přes board (rozhodnutí R3).
function gearOf(state, playerIdx) {
    return (state?.players?.[playerIdx]?.gear) || [];
}

function hasGearFor(state, playerIdx, effect) {
    return gearOf(state, playerIdx).some(c => c && c.effect === effect);
}

// Cena karty pro konkrétního hráče. Zrcadlí GameState._gearCost – jediné místo, kde se
// cena liší podle toho, kdo kupuje (Pretty Luzena, fáze 6).
function gearCostFor(state, playerIdx, card) {
    return card ? Math.max(0, card.cost || 0) : 0;
}

// Fistful – Soudce: „hráči nesmí vykládat karty před sebe ani před ostatní hráče."
// Blokuje jen ČERNÝ rám (ten před hráčem zůstane ležet), hnědý ne (R9).
function gearJudgeBlocks(state, card) {
    return !!card && card.border === 'black' && eventActive(state, 'SOUDCE');
}

// Co nákup udělá navíc, z pohledu Práva západu. Zrcadlí GameState._gearLawOpts.
function gearLawOpts(card) {
    if (!card) return {};
    if (card.effect === 'ZH_PANAK') return { heal: 1 };
    if (card.effect === 'ZH_UNION_PACIFIC') return { draws: 4 };
    return {};
}

// Je hráč vůbec ve stavu, kdy se smí nakupovat? Nákup NENÍ fáze (R6) – je to akce
// ve fázi PLAY hráče na tahu.
function gearShopOpen(state, playerIdx) {
    return goldRushOn(state) && state.phase === 'PLAY' &&
           state.currentPlayerIndex === playerIdx &&
           isInPlay(state.players?.[playerIdx]);
}

// Smí tenhle hráč koupit kartu ze slotu `rowIdx`? Vrací důvod odmítnutí (nebo null),
// aby klient uměl říct, PROČ je karta zašedlá. Zrcadlí GameState.gearBuy.
function gearBuyReason(state, playerIdx, rowIdx) {
    if (!gearShopOpen(state, playerIdx)) return 'není tvůj tah';
    const card = (state.gearRow || [])[rowIdx];
    if (!card) return 'prázdný slot';
    const me = state.players[playerIdx];
    if (gearJudgeBlocks(state, card)) return 'Soudce zakazuje vykládat karty';
    if (lawLocksOther(state, me, playerIdx, null, gearLawOpts(card)))
        return 'Právo západu – nejdřív zahraj vynucenou kartu';
    if (card.border === 'black' && hasGearFor(state, playerIdx, card.effect))
        return 'tohle vybavení už máš';
    if ((me.nuggets || 0) < gearCostFor(state, playerIdx, card)) return 'málo valounů';
    return null;
}

function gearBuyOk(state, playerIdx, rowIdx) {
    return gearBuyReason(state, playerIdx, rowIdx) === null;
}

// Vynucené odhození cizího vybavení: cena karty + 1 (sleva Pretty Luzeny na tohle
// neplatí) a jen CIZÍ karta (FAQ Q10). Zrcadlí GameState.gearForceDiscard.
function gearForceCost(card) {
    return Math.max(0, card?.cost || 0) + 1;
}

function gearForceOk(state, playerIdx, targetIdx, gearIdx) {
    if (!gearShopOpen(state, playerIdx) || targetIdx === playerIdx) return false;
    const t = state.players?.[targetIdx];
    const card = t && (t.gear || [])[gearIdx];
    if (!card || !isInPlay(t)) return false;
    return (state.players[playerIdx].nuggets || 0) >= gearForceCost(card);
}

// Má hráč na koho použít vynucené odhození (klient podle toho nabízí režim)?
function gearForceAvailable(state, playerIdx) {
    if (!gearShopOpen(state, playerIdx)) return false;
    return (state.players || []).some((p, i) =>
        i !== playerIdx && isInPlay(p) && (p.gear || []).some((c, k) => gearForceOk(state, playerIdx, i, k)));
}

// Pivo za valoun: „zahráním karty Pivo z ruky si vezmeš 1 valoun místo doplnění života."
// Limit „ve dvou hráčích nemá Pivo efekt" tady NEPLATÍ (FAQ Q11), Kazatel (Reverend)
// a Želízka ano – ptáme se na ně stejně jako server (core/highNoon.js).
function beerNuggetOk(state, playerIdx, card) {
    if (!gearShopOpen(state, playerIdx) || !card || card.type !== 'Pivo') return false;
    if (beerBlockedFor(state, playerIdx)) return false;      // High Noon – Kazatel
    if (suitBlockedFor(state, playerIdx, card)) return false;  // High Noon – Želízka
    const me = state.players[playerIdx];
    if (lawLocksOther(state, me, playerIdx, card, {})) return false;
    return true;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { goldRushOn, gearOf, hasGearFor, gearCostFor, gearJudgeBlocks, gearLawOpts,
                       gearShopOpen, gearBuyReason, gearBuyOk,
                       gearForceCost, gearForceOk, gearForceAvailable, beerNuggetOk };
}
