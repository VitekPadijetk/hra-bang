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

// ── Právo západu: druhá lízaná karta se ukáže CELÉMU STOLU ───────────────────
// Stejná cinematika jako u Peyote (balíček → střed, překlopení, výdrž, do ruky), jen
// BEZ pulzující marky: nezkoumá se hodnota ani barva, jen se ukazuje, co bude hráč
// muset zahrát. Rozdávání se na tu chvíli pozastaví, karta se ukáže a jde do ruky –
// v ní už je zase tajná (rubem nahoru), takže výdrž je krátká.
// Výjimka: Black Jack má druhou kartu odkrytou tak jako tak a jeho vlastní reveal
// (BLACK_JACK_CHECK) marky bliká – tam se tahle cinematika nespouští.
const LAW_ANIM = {
    flyMs: 420,     // balíček → střed (uvnitř běží překlopení rub→líc, 2× 210)
    holdMs: 1300,   // odkrytá karta drží uprostřed
    landMs: 400,    // do ruky (ostatním se cestou překlopí zpět na rub)
    bufMs: 100,     // rezerva, ať stav nedorazí přesně na hranu dosednutí
};

function lawRevealMs() {
    const D = LAW_ANIM;
    return D.flyMs + D.holdMs + D.landMs + D.bufMs;
}

// ── Opuštěný důl: dosednutí karty na dobírací balíček ────────────────────────
// Pod dolem se odhazuje LÍCEM DOLŮ na dobírací balíček, takže by karta zmizela dřív,
// než by kdokoli stihl přečíst, co se vlastně zahrálo. Dosedne proto lícem nahoru,
// chvíli vydrží a teprve pak se překlopí na rub – přesně jako u stolu. Přidává se na
// KONEC každého letu, který končí v „odhozu" (discardTopPos), takže se čeká jen jednou.
const MINE_ANIM = {
    holdMs: 900,    // karta leží lícem nahoru navrchu balíčku
    flipMs: 260,    // překlopení na rub (2× 130 – zúžení na nulu a zpět)
    bufMs: 80,      // rezerva, ať stav nedorazí přesně na hranu dosednutí
};

// O kolik se prodlouží let končící v odhozu, když je důl aktivní. `on` = běží důl?
// `holdMs` přebíjí výdrž: cinematiky, které kartu předtím ukázaly zvětšenou uprostřed
// (sejmutí, Lucky Duke, Peyote), ji držet znovu nemusí – překlopí se rovnou (hold 0),
// jen aby lícem nahoru dosednutá karta nepřeskočila na rub bez přechodu.
function mineLandMs(on, holdMs) {
    if (!on) return 0;
    const D = MINE_ANIM;
    return (holdMs === undefined ? D.holdMs : holdMs) + D.flipMs + D.bufMs;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PEYOTE_ANIM, peyoteRevealMs, LAW_ANIM, lawRevealMs,
                       MINE_ANIM, mineLandMs };
}
