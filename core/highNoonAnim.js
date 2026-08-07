// core/highNoonAnim.js — časování cinematiky odkrytí karty rozšíření High Noon.
// Jediný zdroj pravdy: klient ji podle těchhle čísel přehrává (net/handlers.js), server
// o stejnou dobu drží boty (room._hnBlockUntil v server/anim.js) a fronta animací si
// podle nich spočítá, jak dlouho stav zdržet (ANIM_MS v net/handlers.js).
// Izomorfní: globál v prohlížeči, require v Node. Viz CLAUDE.md (vzor core/deathAnim.js).

const HN_ANIM = {
    preMs: 750,        // pauza, než se karta vůbec zvedne (je vidět, že je na tahu šerif)
    flyMs: 520,        // rub z balíčku doprostřed obrazovky (cestou se zvětší)
    holdBackMs: 200,   // krátká výdrž na rubu, než se karta překlopí
    flipMs: 400,       // překlopení rub → líc
    holdFaceMs: 2200,  // odkrytá karta zůstane všem na očích
    toSlotMs: 520,     // zmenšení a let na místo platné karty vedle balíčku
};

function hnRevealMs() {
    return HN_ANIM.preMs + HN_ANIM.flyMs + HN_ANIM.holdBackMs + HN_ANIM.flipMs
         + HN_ANIM.holdFaceMs + HN_ANIM.toSlotMs;
}

// ── Nová identita (přibalená karta): výměna postavy na začátku tahu ──────────
// Nabídka sama na časování nečeká – hra stojí ve fázi NEW_IDENTITY, dokud se hráč
// nerozhodne. Tohle je jen DOJEZD rozhodnutí, který vidí celý stůl:
//   NE  → odložená karta se přetočí zpátky na rub a sjede pod kartu postavy,
//   ANO → stará postava se překlopí na rub (= karta životů) a sjede na slot odložené
//         identity, TEPRVE PAK nová postava sjede ze středu na místo postavy (rovnou
//         na výšku dvou životů) – dva přesuny za sebou, ne jeden.
const NI_ANIM = {
    flipMs: 400,     // překlopení karty (líc↔rub)
    moveMs: 520,     // přesun mezi místem postavy a odloženým slotem
    bufMs: 150,      // rezerva, ať stav nedorazí přesně na hranu
};

function niResultMs(take) {
    const D = NI_ANIM;
    return take ? (D.flipMs + D.moveMs + D.moveMs + D.bufMs)
                : (D.flipMs + D.moveMs + D.bufMs);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HN_ANIM, hnRevealMs, NI_ANIM, niResultMs };
}
