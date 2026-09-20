// core/goldRushAnim.js — časování cinematik rozšíření Zlatá horečka.
// Jediný zdroj pravdy: klient je podle těchhle čísel přehrává (net/handlers.js), server
// o stejnou dobu drží boty (room._revealBlockUntil v server/handlers.game.js) a fronta
// animací si podle nich spočítá, jak dlouho zdržet stav (_animDurationMs v net/handlers.js).
// Izomorfní: globál v prohlížeči, require v Node. Vzor: core/fistfulAnim.js.

// ── Rum: „Otoč! 4 karty: doplň si 1 život za každou různou barvu." ───────────
// Otočené karty vyletí z balíčku po jedné do ŘADY uprostřed stolu (cestou se překlopí
// rub→líc), všechny spolu chvíli leží s popiskem výsledku („3 barvy → +2 ❤") a pak po
// jedné odletí do odhozu – v pořadí, v jakém se otáčely, takže poslední leží navrchu
// stejně jako ve stavu. Karet je 4, s Lucky Dukem / Podkovou 5, s obojím 6.
const RUM_ANIM = {
    staggerMs:     180,   // rozestup startů letu z balíčku
    flyMs:         420,   // balíček → řada (uvnitř překlopení rub→líc, 2× 210)
    holdMs:       2200,   // celá řada leží s popiskem výsledku
    landStaggerMs:  90,   // rozestup startů letu do odhozu
    landMs:        380,   // řada → odhoz
    bufMs:         120,   // rezerva, ať stav nedorazí přesně na hranu dosednutí
    rowY:          470,   // výška řady (= střed odkrytí sejmutí, REVEAL_CY v game.js)
    stepX:         175,   // rozteč karet v řadě
    scale:        0.46,   // velikost karty v řadě
};

// Kdy řada začne odlétat do odhozu (od začátku cinematiky).
function rumLandStartMs(n) {
    const D = RUM_ANIM;
    return Math.max(0, (n | 0) - 1) * D.staggerMs + D.flyMs + D.holdMs;
}

// Celá cinematika pro `n` otočených karet.
function rumRevealMs(n) {
    const D = RUM_ANIM;
    return rumLandStartMs(n) + Math.max(0, (n | 0) - 1) * D.landStaggerMs + D.landMs + D.bufMs;
}

// Střed i-té karty řady (řada je vystředěná na střed stolu).
function rumSlotX(i, n) {
    return 960 + (i - (Math.max(1, n) - 1) / 2) * RUM_ANIM.stepX;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RUM_ANIM, rumLandStartMs, rumRevealMs, rumSlotX };
}
