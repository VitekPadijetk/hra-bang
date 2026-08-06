// core/roles.js — čisté pravidlo přiřazení rolí a startovních životů.
// Bez stavu, izomorfní (globál v prohlížeči, require v Node). Testováno.

function rolesForPlayerCount(playerCount) {
    if (playerCount === 2) return ["Sheriff", "Outlaw"];
    if (playerCount === 3) return ["Sheriff", "Outlaw", "Renegade"];
    if (playerCount === 4) return ["Sheriff", "Outlaw", "Outlaw", "Renegade"];
    if (playerCount === 5) return ["Sheriff", "Outlaw", "Outlaw", "Renegade", "Deputy"];
    if (playerCount === 6) return ["Sheriff", "Outlaw", "Outlaw", "Outlaw", "Renegade", "Deputy"];
    if (playerCount === 7) return ["Sheriff", "Outlaw", "Outlaw", "Outlaw", "Renegade", "Deputy", "Deputy"];
    return [];
}

// Role se v kódu (i v síťovém stavu) jmenují anglicky – hráči je ale musí vidět česky.
// Jediný zdroj pravdy pro překlad; UI se na název role nikde neptá napřímo.
const ROLE_CZ = {
    Sheriff: "Šerif",
    Deputy: "Pomocník",
    Outlaw: "Bandita",
    Renegade: "Odpadlík",
};
function roleNameCz(role) {
    return ROLE_CZ[role] || role || '';
}

const LOW_HEALTH_CHARS = ["Paul Regret", "El Gringo",
    // Dodge City – postavy se 3 životy (Apache Kid a Vera Custer přibudou ve fázi 7).
    "Elena Fuente", "Pixie Pete", "Sean Mallory", "Apache Kid", "Vera Custer"];

// Základní počet životů postavy (bez šerifova bonusu).
function baseHealthForCharacter(charName) {
    return LOW_HEALTH_CHARS.includes(charName) ? 3 : 4;
}

// { base, max } — base = bez bonusu (startovní karty), max = +1 pro šerifa.
function healthForCharacter(charName, role) {
    const base = baseHealthForCharacter(charName);
    return { base, max: role === "Sheriff" ? base + 1 : base };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rolesForPlayerCount, baseHealthForCharacter, healthForCharacter,
                       LOW_HEALTH_CHARS, ROLE_CZ, roleNameCz };
}
