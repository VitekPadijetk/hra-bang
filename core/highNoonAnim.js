// core/highNoonAnim.js — časování cinematiky odkrytí karty rozšíření High Noon.
// Jediný zdroj pravdy: klient ji podle těchhle čísel přehrává (net/handlers.js), server
// o stejnou dobu drží boty (room._hnBlockUntil v server/anim.js) a fronta animací si
// podle nich spočítá, jak dlouho stav zdržet (ANIM_MS v net/handlers.js).
// Izomorfní: globál v prohlížeči, require v Node. Viz CLAUDE.md (vzor core/deathAnim.js).

const HN_ANIM = {
    flyMs: 520,        // rub z balíčku doprostřed obrazovky (cestou se zvětší)
    holdBackMs: 200,   // krátká výdrž na rubu, než se karta překlopí
    flipMs: 400,       // překlopení rub → líc
    holdFaceMs: 2200,  // odkrytá karta zůstane všem na očích
    toSlotMs: 520,     // zmenšení a let na místo platné karty vedle balíčku
};

function hnRevealMs() {
    return HN_ANIM.flyMs + HN_ANIM.holdBackMs + HN_ANIM.flipMs + HN_ANIM.holdFaceMs + HN_ANIM.toSlotMs;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HN_ANIM, hnRevealMs };
}
