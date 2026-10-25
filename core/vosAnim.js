// core/vosAnim.js — časování cinematik rozšíření Údolí stínů. BEZ Phaseru/DOM, izomorfní.
//
// Jediný zdroj pravdy (vzor core/goldRushAnim.js, core/wwsAnim.js) pro klienta
// (net/handlers.js), frontu animací (`_animDurationMs` v net/handlers.js) i serverové
// držení botů (`room._vosBlockUntil` v server/anim.js). Bez toho bot zahraje další akci
// uprostřed cinematiky a stav ji předběhne.
//
//   tornado_pass – karty z ruky k sousedovi po levici, všichni naráz (F4),
//   poker_reveal – vyložené karty z rukou doprostřed, cestou se otočí; s Esem pak
//                  odletí do odhozu, bez Esa leží, dokud si hráč nevybere (F4),
//   poker_take   – vybrané karty do ruky hráče, zbytek do odhozu (F4).
// Přibude: odchod ducha – vyřazení hráče, kterému sebrali kartu Duch (F5).
const VOS_ANIM = {
    tornado: {
        staggerMs: 110,   // rozestup startů karet z jedné ruky
        flyMs:     560,   // ruka → ruka souseda (rubem)
        bufMs:     120,
    },
    poker: {
        staggerMs:  170,  // rozestup startů letu z rukou do řady
        flyMs:      460,  // ruka → řada (uvnitř překlopení rub→líc)
        holdMs:    1500,  // řada leží s popiskem (Eso / bez Esa)
        landStaggerMs: 90,
        landMs:     400,  // řada → odhoz / ruka
        bufMs:      120,
        rowY:       470,  // výška řady (= Rum, REVEAL_CY v game.js)
        stepX:      175,  // rozteč karet v řadě
        scale:     0.46,  // velikost karty v řadě
    },
};

// Tornádo: všechny ruce letí naráz, takže rozhoduje nejdelší dávka (nejvýš 2 karty).
function tornadoPassMs(moves) {
    const T = VOS_ANIM.tornado;
    const most = Math.max(0, ...(moves || []).map(m => m.count | 0));
    if (!most) return 0;
    return (most - 1) * T.staggerMs + T.flyMs + T.bufMs;
}

// Poker – odhalení `n` vyložených karet. Bez Esa cinematika končí výdrží (karty pak
// kreslí stav ve fázi POKER_TAKE na stejných místech), s Esem ještě odletí do odhozu.
function pokerRevealMs(n, ace) {
    const P = VOS_ANIM.poker;
    n = n | 0;
    if (!n) return 0;
    const shown = (n - 1) * P.staggerMs + P.flyMs + P.holdMs;
    return shown + (ace ? (n - 1) * P.landStaggerMs + P.landMs : 0) + P.bufMs;
}

// Poker – výběr z řady: všech `n` karet odletí (do ruky / do odhozu).
function pokerTakeMs(n) {
    const P = VOS_ANIM.poker;
    n = n | 0;
    if (!n) return 0;
    return (n - 1) * P.landStaggerMs + P.landMs + P.bufMs;
}

// Střed i-té karty řady vyložených karet (vystředěná na střed stolu, jako Rum).
function pokerSlotX(i, n) {
    return 960 + (i - (Math.max(1, n) - 1) / 2) * VOS_ANIM.poker.stepX;
}

// Jak dlouho drží boty animace zapsaná pravidly (`_vosAnim`, server/anim.js).
function vosAnimMs(a) {
    if (!a) return 0;
    if (a.type === 'tornado_pass') return tornadoPassMs(a.moves);
    if (a.type === 'poker_reveal') return pokerRevealMs((a.cards || []).length, !!a.ace);
    if (a.type === 'poker_take') return pokerTakeMs((a.taken || []).length + (a.discarded || []).length);
    return 0;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VOS_ANIM, tornadoPassMs, pokerRevealMs, pokerTakeMs, pokerSlotX, vosAnimMs };
}
