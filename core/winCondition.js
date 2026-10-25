// core/winCondition.js — čisté vyhodnocení vítěze z pole hráčů.
// Bez stavu, izomorfní. Vrací řetězec vítěze, nebo null pokud hra pokračuje.

if (typeof require === 'function') {
    if (typeof roleNameCz === 'undefined') {
        globalThis.roleNameCz = require('./roles.js').roleNameCz;
    }
    if (typeof TARGET_3P === 'undefined') {
        globalThis.TARGET_3P = require('./roles.js').TARGET_3P;
    }
}

// Údolí stínů – karta Duch: „je Duch?" a „sedí ve hře natrvalo?" (živý nebo Duch).
if (typeof require === 'function' && typeof isVosGhost === 'undefined') {
    const __vg = require('./distance.js');
    globalThis.isVosGhost = __vg.isVosGhost;
    globalThis.staysInPlay = __vg.staysInPlay;
    globalThis.hasDuchCard = __vg.hasDuchCard;
}

// Hra pro 3 hráče (Město duchů). Role jsou odkryté a cíle v kruhu (TARGET_3P):
//   • kdo OSOBNĚ vyřadí svého určeného nepřítele, vyhrává hned → `winClaimIdx`,
//   • zabije-li ho někdo jiný (nebo dynamit), novým cílem obou zbylých je zůstat naživu
//     jako poslední → vyhraje jediný živý.
// U stolu je každá role jen jedna, takže se vypisuje jednotné číslo („Bandita vyhrál!"),
// nikdy množné „Bandité vyhráli!".
function evaluateWinner3p(players, winClaimIdx) {
    if (winClaimIdx != null && players[winClaimIdx]) {
        return `${roleNameCz(players[winClaimIdx].role)} vyhrál!`;
    }
    const alive = players.filter(p => staysInPlay(p) || p._ghost);
    if (alive.length === 1) return `${roleNameCz(alive[0].role)} vyhrál!`;
    return null;
}

// opts.mode3p / opts.winClaimIdx – viz evaluateWinner3p. Bez nich platí klasická pravidla.
// opts.lastManStanding – Divoký západ (karta „Divoký západ"), viz níže.
function evaluateWinner(players, opts = {}) {
    // Divoký západ (Wild West Show), karta vespod balíčku: „Cílem každého hráče se stává:
    // Zůstaň poslední ve hře!" Výhra je INDIVIDUÁLNÍ, takže se vypisuje JMÉNO hráče, ne
    // role – a smrt šerifa hru nekončí. Role samy zůstávají v platnosti (šerif nesmí do
    // vězení, odměna za banditu i pokuta za pomocníka platí dál, FAQ Q15) – to ale řeší
    // pravidla jinde, sem patří jen podmínka konce.
    //
    // Musí to padnout PŘED větví pro 3 hráče: pod touhle kartou přestávají platit cíle
    // v kruhu (TARGET_3P) i nárok získaný vyřazením vlastního cíle (`winClaimIdx`).
    //
    // Nula živých nastat nemůže – vyřazení jde vždy po jednom (`handlePlayerDeath`
    // vyhodnotí výhru po každém), takže se předposlední smrtí vítěz najde.
    if (opts.lastManStanding) {
        const alive = players.filter(p => staysInPlay(p) || p._ghost);
        return alive.length === 1 ? `${alive[0].name} vyhrál!` : null;
    }
    if (opts.mode3p) return evaluateWinner3p(players, opts.winClaimIdx);

    // High Noon – Město duchů: duch (`_ghost`) je na svůj tah zpátky ve hře, takže se
    // do vyhodnocení počítá jako živý (FAQ H7: zabije-li duch šerifa, vyhrává jeho
    // strana). Příznak drží jen po dobu jeho tahu; jeho odchodem se výhra přepočítá.
    // Údolí stínů – Duch (staysInPlay) se počítá taky, a to natrvalo: „ghost-bandita
    // brání výhře zákona i odpadlíka" (dV 1507774).
    const alive = players.filter(p => staysInPlay(p) || p._ghost);
    const sheriff = alive.find(p => p.role === "Sheriff");
    const outlaws = alive.filter(p => p.role === "Outlaw");
    const renegades = alive.filter(p => p.role === "Renegade");

    if (!sheriff) {
        // Odpadlík vyhrává jen jako JEDINÝ žijící. Při 8 hráčích jsou odpadlíci dva, takže
        // dva živí odpadlíci znamenají výhru banditů – přesně jak pravidlo pro 8 říká.
        if (alive.length === 1 && alive[0].role === "Renegade") {
            return "Odpadlík vyhrál!";
        }
        return "Bandité vyhráli!";
    }
    if (outlaws.length === 0 && renegades.length === 0) {
        return "Zákon vyhrál!";
    }
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { evaluateWinner, evaluateWinner3p };
}
