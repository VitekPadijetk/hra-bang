// core/fistfulAnim.js — časování cinematik rozšíření A Fistful of Cards.
// Jediný zdroj pravdy: klient je podle těchhle čísel přehrává (net/handlers.js), server
// o stejnou dobu drží boty (room._revealBlockUntil v server/handlers.game.js) a fronta
// animací si podle nich spočítá, jak dlouho zdržet stav (ANIM_MS v net/handlers.js).
// Izomorfní: globál v prohlížeči, require v Node. Viz CLAUDE.md (vzor core/highNoonAnim.js).

// ── Peyote: odkrytí karty, na jejíž barvu hráč tipoval ───────────────────────
// Je to zkrácené SEJMUTÍ (startCheckReveal): karta vyletí z balíčku doprostřed, cestou
// se překlopí a zvětší, chvíli drží s pulzující markou barvy a pak letí do ruky (uhodl)
// nebo do odhozu (netrefil). Výdrž je oproti sejmutí (3000) poloviční SCHVÁLNĚ – při
// šňůře správných tipů se tohle přehraje třeba pětkrát za sebou.
const PEYOTE_ANIM = {
    flyMs: 450,     // balíček → střed (uvnitř běží překlopení rub→líc, 2× 225)
    holdMs: 1500,   // odkrytá karta drží s pulzující markou barvy
    landMs: 400,    // do ruky (uhodl) nebo do odhozu (netrefil)
    bufMs: 100,     // rezerva, ať stav nedorazí přesně na hranu dosednutí
};

function peyoteRevealMs() {
    const D = PEYOTE_ANIM;
    return D.flyMs + D.holdMs + D.landMs + D.bufMs;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PEYOTE_ANIM, peyoteRevealMs };
}
