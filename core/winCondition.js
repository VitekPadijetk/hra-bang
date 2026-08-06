// core/winCondition.js — čisté vyhodnocení vítěze z pole hráčů.
// Bez stavu, izomorfní. Vrací řetězec vítěze, nebo null pokud hra pokračuje.

function evaluateWinner(players) {
    // High Noon – Město duchů: duch (`_ghost`) je na svůj tah zpátky ve hře, takže se
    // do vyhodnocení počítá jako živý (FAQ H7: zabije-li duch šerifa, vyhrává jeho
    // strana). Příznak drží jen po dobu jeho tahu; jeho odchodem se výhra přepočítá.
    const alive = players.filter(p => p.health > 0 || p._ghost);
    const sheriff = alive.find(p => p.role === "Sheriff");
    const outlaws = alive.filter(p => p.role === "Outlaw");
    const renegades = alive.filter(p => p.role === "Renegade");

    if (!sheriff) {
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
    module.exports = { evaluateWinner };
}
