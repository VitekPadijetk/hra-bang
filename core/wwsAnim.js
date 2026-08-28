// core/wwsAnim.js — časování cinematik rozšíření Divoký západ (Wild West Show).
// Jediný zdroj pravdy: klient je podle těchhle čísel přehrává (net/handlers.js), server
// o stejnou dobu drží boty (room._wwsBlockUntil v server/anim.js) a fronta animací si
// podle nich spočítá, jak dlouho zdržet stav (ANIM_MS / _animDurationMs v net/handlers.js).
// Izomorfní: globál v prohlížeči, require v Node. Viz CLAUDE.md (vzor core/fistfulAnim.js).

// ── Sacagaway: přetočení všech cizích vějířů ─────────────────────────────────
// „Všichni hráči hrají s odhalenými kartami v ruce." Karta přichází (a odchází) uprostřed
// hry, takže se ruce nesmí přepnout skokem – vějíře se PLYNULE přetočí, karta po kartě
// s malým odstupem, ať to čte oko. Vějíře jednotlivých hráčů se rozjíždějí po sobě
// (handStaggerMs), takže vlna obejde stůl.
const SACA_FLIP = {
    preMs:          140,   // pauza, než se ruce hnou (dojíždí odkrytí karty události)
    flipMs:         320,   // překlopení jedné karty (2× 160 – zúžení na nulu a zpět)
    cardStaggerMs:   55,   // odstup karet uvnitř jednoho vějíře
    handStaggerMs:  110,   // odstup mezi vějíři jednotlivých hráčů
    tailMs:         140,   // doznění, ať stav nedorazí přesně na hranu dotočení
};

// Jak dlouho trvá přetočení sady vějířů. `fanSizes` = počty karet v jednotlivých rukou
// (v pořadí, ve kterém se rozjíždějí). Prázdné ruce se nepřetáčejí, ale pořadí drží,
// takže se vlna kolem stolu nezrychlí.
function sacaFlipMs(fanSizes) {
    const D = SACA_FLIP;
    const sizes = Array.isArray(fanSizes) ? fanSizes : [];
    let last = 0;
    sizes.forEach((n, i) => {
        if (!n) return;
        last = Math.max(last, i * D.handStaggerMs + (n - 1) * D.cardStaggerMs + D.flipMs);
    });
    if (!last) return 0;
    return D.preMs + last + D.tailMs;
}

// ── Sacagaway × krádež z ruky: fyzický postup z FAQ Q17 ──────────────────────
// Odkrytá ruka NEMĚNÍ nic na tom, jak se z ní bere – Panika, Cat Balou, Ragtime, Jesse
// Jones i Flint Westwood losují dál. FAQ Q17 to popisuje doslova: postižený hráč ruku
// otočí lícem dolů, ZAMÍCHÁ ji, teprve pak se z ní vezme náhodná karta a ruka se zase
// odhalí. Kdyby se vybíralo, byla by Panika pod Sacagaway přesně mířená zbraň.
//
// Cinematika ten postup ukazuje, jinak by hráč, který soupeři vidí do ruky a nemůže si
// vybrat, měl pocit, že je to chyba UI:
//   1. vějíř oběti se přetočí na ruby  (downMs, karty s odstupem)
//   2. sesbírá se na hromádku, krátce zamíchá a zase rozprostře  (gatherMs/holdMs/spreadMs)
//   3. odletí náhodná karta  (to už je běžná animace krádeže – ruka je rubem nahoru,
//      takže se chová přesně jako bez Sacagaway)
//   4. zbytek ruky se přetočí zpátky lícem nahoru  (upMs)
const SACA_STEAL = {
    downMs:         240,   // přetočení vějíře lícem dolů
    cardStaggerMs:   40,   // odstup karet uvnitř vějíře (platí pro dolů i nahoru)
    gatherMs:       200,   // sesbírání do hromádky
    holdMs:         180,   // zamíchání (hromádka drží pohromadě)
    spreadMs:       200,   // rozprostření zpátky do vějíře
    upMs:           240,   // přetočení zpátky lícem nahoru
};

// O kolik se krádež z ruky ODLOŽÍ (kroky 1–2), než se karta smí odlepit.
function sacaStealPreMs(n) {
    const D = SACA_STEAL;
    if (!n) return 0;
    return D.downMs + Math.max(0, n - 1) * D.cardStaggerMs + D.gatherMs + D.holdMs + D.spreadMs;
}

// Jak dlouho trvá krok 4 (přetočení zbytku ruky zpátky lícem nahoru). `n` = počet karet,
// které v ruce ZŮSTALY.
function sacaStealPostMs(n) {
    const D = SACA_STEAL;
    if (!n) return 0;
    return D.upMs + Math.max(0, n - 1) * D.cardStaggerMs;
}

// Celkové prodloužení animace krádeže z ruky pod Sacagaway (pre + post). `n` = počet
// karet v ruce oběti PŘED krádeží. O tuhle dobu se musí podržet fronta i boti.
function sacaStealExtraMs(n) {
    if (!n) return 0;
    return sacaStealPreMs(n) + sacaStealPostMs(n - 1);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SACA_FLIP, sacaFlipMs, SACA_STEAL,
                       sacaStealPreMs, sacaStealPostMs, sacaStealExtraMs };
}
