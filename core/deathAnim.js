// core/deathAnim.js — časování cinematiky vyřazení hráče. Jediný zdroj pravdy pro
// klienta (net/handlers.js sekvenci přehrává) i server (server/anim.js o tuhle dobu
// pozdrží boty, aby nikdo nehrál „přes" odhalení role). Izomorfní, bez Phaseru.
//
// Sled (v tomto pořadí, nic se nepřekrývá):
//   1. postava klesne po kartě životů na nulu               (healthMs)
//   2. pauza, ať je smrt vidět                              (pauseMs)
//   3. karty odlétají jedna po druhé; u hráče mizí ve chvíli,
//      kdy se zvednou, a zbytek ruky/stolu se NEpřeskládá   (n × staggerMs + cardMs)
//   4. postava doklouže vedle místa, kde bude karta role
//      (to je zatím prázdné)                                (settleMs)
//   5. rubová karta role vyletí zpoza mrtvého hráče
//      doprostřed obrazovky jako velká karta                (flyMs)
//   6. chvíli je vidět rubem                                (holdBackMs)
//   7. překlopí se → odhalení role                          (flipMs)
//   8. odhalená role zůstane všem na očích                  (holdFaceMs)
//   9. zmenší se a odletí na své místo u mrtvého hráče      (toSlotMs)
// Teprve pak pokračuje hra (klient pustí stav z fronty, server odblokuje boty).
const DEATH_ANIM = {
    healthMs:    320,   // runHealthSlide (280) + rezerva
    pauseMs:     500,
    staggerMs:    95,   // rozestup startů odlétajících karet
    cardMs:      420,   // dolet poslední karty
    settleMs:    380,   // reflow postavy/životů (REFLOW_MS 240) + rezerva
    flyMs:       620,
    holdBackMs:  500,
    flipMs:      450,
    holdFaceMs: 2000,
    toSlotMs:    620,
};

// Offsety fází od začátku sekvence (ms). `cardCount` = počet položek odhozu včetně
// zbraně/Coltu (viz _deathCardSeq v net/handlers.js): blue + 1 + hand.
// `skipReveal` = kroky 5–9 (odhalení role) se vynechají. Používá se u ŠERIFA: jeho roli
// zná od začátku celý stůl, takže není co odhalovat – jen se počká na odhození karet
// a hra skončí. Klient i server musí počítat stejně (server o tu dobu drží boty).
function deathAnimTimeline(cardCount, skipReveal = false) {
    const D = DEATH_ANIM;
    const n = Math.max(1, cardCount | 0);
    const cards  = D.healthMs + D.pauseMs;
    const settle = cards + (n - 1) * D.staggerMs + D.cardMs;
    const fly    = settle + D.settleMs;
    const flip   = fly + D.flyMs + D.holdBackMs;
    const toSlot = flip + D.flipMs + D.holdFaceMs;
    return { cards, settle, fly, flip, toSlot,
             total: skipReveal ? fly : toSlot + D.toSlotMs };
}

function deathSequenceMs(cardCount, skipReveal = false) {
    return deathAnimTimeline(cardCount, skipReveal).total;
}

// Když si karty mrtvého dělí VÍC Vulture Samů, rozpadá se cinematika na dva kusy:
//   deathFallMs()   – pokles na nulu + pauza (karty zůstávají ležet, rozeberou se pak),
//   deathRevealMs() – po rozdělení: úklid místa + odhalení role (u šerifa jen úklid).
// Viz logic/characters.js (_nextVultureSplitPick) a net/handlers.js.
function deathFallMs() {
    return DEATH_ANIM.healthMs + DEATH_ANIM.pauseMs;
}

function deathRevealMs(skipReveal = false) {
    const D = DEATH_ANIM;
    if (skipReveal) return D.settleMs;
    return D.settleMs + D.flyMs + D.holdBackMs + D.flipMs + D.holdFaceMs + D.toSlotMs;
}

// Šerif zabil pomocníka → přijde o všechny karty. Odhazování vypadá stejně jako
// při vyřazení (karty odlétají po jedné do odhozu), ale hráč žije dál: žádný pokles
// životů, žádné odhalení role a Colt .45 mu zůstává. `cardCount` = modré + zbraň
// (jen skutečná) + ruka. Klient i server počítají stejně.
function penaltyDiscardMs(cardCount) {
    const D = DEATH_ANIM;
    const n = Math.max(1, cardCount | 0);
    return D.pauseMs + (n - 1) * D.staggerMs + D.cardMs + 200;
}

// Izomorfní: v prohlížeči globály, v Node/testech require('./core/deathAnim.js').
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DEATH_ANIM, deathAnimTimeline, deathSequenceMs, penaltyDiscardMs,
                       deathFallMs, deathRevealMs };
}
