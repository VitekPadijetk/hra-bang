// core/goldRushAnim.js — časování cinematik rozšíření Zlatá horečka.
// Jediný zdroj pravdy: klient je podle těchhle čísel přehrává (net/handlers.js), server
// o stejnou dobu drží boty (room._revealBlockUntil v server/handlers.game.js a anim.js) a fronta
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
    shuffleMs:    5700,   // míchání balíčku uprostřed (= RESHUFFLE_ANIM_MS v game.js)
};

// Míchání uprostřed otáčení (bug 71 u Rumu): `sh` = `shuffle` z payloadu, tedy
// výsledek `_revealAnim` (logic/draw.js) – { mode, dealtBefore }. Stejně jako odkrytá
// řada Kita Carlsona / Lucky Duka:
//   'blocking'  – balíček došel dřív: otočí se `dealtBefore` karet, zamíchá se (hra
//                 čeká) a teprve pak se otočí zbytek,
//   'proactive' – vyprázdnila ho poslední otočená karta: míchá se, zatímco řada leží,
//                 a do odhozu se odlétá až po míchání (jinak by karty dosedaly do
//                 odhozu, který se zrovna sbírá),
//   jinak se nemíchá.
// `shuffleMs` MUSÍ sedět s RESHUFFLE_ANIM_MS v game.js.
function _rumK(n, sh) {
    return sh && sh.mode === 'blocking' ? Math.min(Math.max(0, sh.dealtBefore | 0), n) : n;
}

// Kdy začne míchání (od začátku cinematiky), nebo -1, když se nemíchá.
function rumShuffleAtMs(n, sh) {
    const D = RUM_ANIM;
    n = n | 0;
    if (sh && sh.mode === 'blocking') {
        const k = _rumK(n, sh);
        return k > 0 ? (k - 1) * D.staggerMs + D.flyMs : 0;
    }
    if (sh && sh.mode === 'proactive') return rumFlipAtMs(n - 1, n, sh) + D.flyMs;
    return -1;
}

// Kdy vyletí i-tá karta z balíčku.
function rumFlipAtMs(i, n, sh) {
    const D = RUM_ANIM;
    const k = _rumK(n | 0, sh);
    if (i < k) return i * D.staggerMs;
    return rumShuffleAtMs(n, sh) + D.shuffleMs + (i - k) * D.staggerMs;
}

// Kdy řada začne odlétat do odhozu (od začátku cinematiky).
function rumLandStartMs(n, sh) {
    const D = RUM_ANIM;
    const lastLand = rumFlipAtMs(Math.max(0, (n | 0) - 1), n, sh) + D.flyMs;
    const proactive = sh && sh.mode === 'proactive';
    return lastLand + (proactive ? Math.max(D.holdMs, D.shuffleMs) : D.holdMs);
}

// Celá cinematika pro `n` otočených karet.
function rumRevealMs(n, sh) {
    const D = RUM_ANIM;
    return rumLandStartMs(n, sh) + Math.max(0, (n | 0) - 1) * D.landStaggerMs + D.landMs + D.bufMs;
}

// Střed i-té karty řady (řada je vystředěná na střed stolu).
function rumSlotX(i, n) {
    return 960 + (i - (Math.max(1, n) - 1) / 2) * RUM_ANIM.stepX;
}

// ── Karta vybavení: z balíčku vybavení a zpátky pod něj ──────────────────────
// Na stole je z obchodu vidět jen rub balíčku vybavení (nabídka je v překryvném okně),
// takže koupená karta (i líznutá Joshem McCloudem) vyletí z něj, cestou se překlopí
// rub→líc a dosedne na místo před hráčem (`gear_acquire`, net/handlers.js). Hnědá se
// hned použije: chvíli leží u kupujícího a pak se zasune pod balíček – stejným pohybem,
// jakým tam odchází vybavení vyřazeného hráče (`_flyGearUnderDeck`).
// Server o stejnou dobu drží boty (room._revealBlockUntil, server/anim.js).
const GEAR_ANIM = {
    buyMs:        450,   // balíček → místo před hráčem (uvnitř překlopení rub→líc)
    showMs:       350,   // použitá (hnědá) karta chvíli leží u kupujícího
    underFlyMs:   300,   // let k balíčku vybavení
    underSlideMs: 200,   // zasunutí pod balíček
    bufMs:         60,   // rezerva, ať stav nedorazí přesně na hranu dosednutí
};

// Let pod balíček vybavení (vyřazení, odchod ducha / stínu, použitá hnědá karta).
function gearUnderMs() {
    return GEAR_ANIM.underFlyMs + GEAR_ANIM.underSlideMs;
}

// Celý let koupené karty. `to` = 'gear' (zůstane ležet před hráčem) | 'under' (jde pod
// balíček – hnědý rám, nebo černý, který už Josh McCloud má).
function gearAcquireMs(to) {
    const D = GEAR_ANIM;
    return D.buyMs + (to === 'under' ? D.showMs + gearUnderMs() : 0) + D.bufMs;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RUM_ANIM, rumLandStartMs, rumRevealMs, rumSlotX, rumFlipAtMs, rumShuffleAtMs,
                       GEAR_ANIM, gearUnderMs, gearAcquireMs };
}
