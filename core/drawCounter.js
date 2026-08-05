// core/drawCounter.js — počítadlo „naklikaných, ale serverem ještě nepotvrzených" líznutí.
// Čistá logika BEZ Phaseru/DOM (izomorfní), používá ji `_applyRoomUpdate` v net/handlers.js.
//
// Proč to je: klik na balíček odešle draw_card, ale stav se vrátí až za ~350 ms (a ve frontě
// animací může počkat ještě dýl). Aby šlo líznout dvě karty rychle po sobě a zároveň se
// nekliklo víckrát, než kolik zbývá, drží si klient `pendingDrawCount` (= odeslané kliky
// bez potvrzení) a `lastConfirmedDrawn` (= poslední potvrzené cardsDrawn).
//
// Pozor na vlastníka: počítadlo patří JEDNÉ konkrétní fázi lízání. Řetěz kill-rewardů
// (odměna za banditu → Herb Hunter) přejde z fáze DRAW rovnou do jiné fáze DRAW jiného
// hráče a `cardsDrawn` spadne zpátky na 0 – bez kontroly vlastníka se rozdíl (0 − 3)
// PŘIČETL k pendingDrawCount, balíček tomu druhému nešel rozkliknout a hra uvázla.
//
// nextDrawCounters(prev, phase, drawPhaseState) -> { pendingDrawCount, lastConfirmedDrawn, lastDrawOwner }
function nextDrawCounters(prev, phase, drawPhaseState) {
    const p = prev || {};
    if (phase !== 'DRAW') {
        return { pendingDrawCount: 0, lastConfirmedDrawn: 0, lastDrawOwner: null };
    }
    const confirmed = drawPhaseState?.cardsDrawn ?? 0;
    const owner = drawPhaseState?.playerIdx ?? null;
    const prevConfirmed = p.lastConfirmedDrawn ?? 0;
    // Jiný vlastník fáze nebo pokles cardsDrawn = nový cyklus lízání → počítadlo od nuly.
    const fresh = owner !== (p.lastDrawOwner ?? null) || confirmed < prevConfirmed;
    const pending = fresh
        ? 0
        : Math.max(0, (p.pendingDrawCount ?? 0) - (confirmed - prevConfirmed));
    return { pendingDrawCount: pending, lastConfirmedDrawn: confirmed, lastDrawOwner: owner };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { nextDrawCounters };
}
