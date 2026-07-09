// core/winCondition.js — čisté vyhodnocení vítěze z pole hráčů.
// Bez stavu, izomorfní. Vrací řetězec vítěze, nebo null pokud hra pokračuje.

function evaluateWinner(players) {
    const alive = players.filter(p => p.health > 0);
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
