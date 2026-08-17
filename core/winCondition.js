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
    const alive = players.filter(p => p.health > 0 || p._ghost);
    if (alive.length === 1) return `${roleNameCz(alive[0].role)} vyhrál!`;
    return null;
}

// opts.mode3p / opts.winClaimIdx – viz evaluateWinner3p. Bez nich platí klasická pravidla.
function evaluateWinner(players, opts = {}) {
    if (opts.mode3p) return evaluateWinner3p(players, opts.winClaimIdx);

    // High Noon – Město duchů: duch (`_ghost`) je na svůj tah zpátky ve hře, takže se
    // do vyhodnocení počítá jako živý (FAQ H7: zabije-li duch šerifa, vyhrává jeho
    // strana). Příznak drží jen po dobu jeho tahu; jeho odchodem se výhra přepočítá.
    const alive = players.filter(p => p.health > 0 || p._ghost);
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
