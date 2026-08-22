// core/roles.js — čisté pravidlo přiřazení rolí a startovních životů.
// Bez stavu, izomorfní (globál v prohlížeči, require v Node). Testováno.

function rolesForPlayerCount(playerCount) {
    if (playerCount === 2) return ["Sheriff", "Outlaw"];
    // Rozšíření Město duchů – zvláštní pravidla pro 3 hráče: ŽÁDNÝ šerif, jen pomocník,
    // bandita a odpadlík, a všechny tři role leží lícem nahoru. Každý má jednoho určeného
    // nepřítele (TARGET_3P) a vyhrává, když ho osobně vyřadí.
    if (playerCount === 3) return ["Deputy", "Outlaw", "Renegade"];
    if (playerCount === 4) return ["Sheriff", "Outlaw", "Outlaw", "Renegade"];
    if (playerCount === 5) return ["Sheriff", "Outlaw", "Outlaw", "Renegade", "Deputy"];
    if (playerCount === 6) return ["Sheriff", "Outlaw", "Outlaw", "Outlaw", "Renegade", "Deputy"];
    if (playerCount === 7) return ["Sheriff", "Outlaw", "Outlaw", "Outlaw", "Renegade", "Deputy", "Deputy"];
    // Rozšíření Město duchů: 8 karet rolí nahrazuje původní sadu – 1 šerif, 2 pomocníci,
    // 3 bandité, 2 odpadlíci. Je to JEDINÝ počet se dvěma odpadlíky: každý hraje sám za
    // sebe a vyhrává, jen když zůstane ve hře poslední (viz core/winCondition.js).
    if (playerCount === 8) return ["Sheriff", "Deputy", "Deputy",
                                   "Outlaw", "Outlaw", "Outlaw", "Renegade", "Renegade"];
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

// ── Hra pro 3 hráče (Město duchů) ────────────────────────────────────────────
// Cíle jsou v kruhu: pomocník loví odpadlíka, odpadlík banditu, bandita pomocníka.
// Vyhrává ten, kdo svého určeného nepřítele vyřadí OSOBNĚ; když ho zabije někdo jiný,
// novým cílem obou zbylých je zůstat naživu jako poslední (core/winCondition.js).
const TARGET_3P = { Deputy: 'Renegade', Renegade: 'Outlaw', Outlaw: 'Deputy' };

// Platí u tohohle stolu pravidla pro 3 hráče? Poznávacím znakem je, že ve hře NENÍ šerif –
// debug hra pro 3 si role losuje ze všech čtyř, takže tam šerif být může a jede klasika.
function isThreePlayerMode(players) {
    return !!players && players.length === 3 && !players.some(p => p && p.role === 'Sheriff');
}

// „Šerifova pozice": kdo začíná hru, od koho jdou po směru efekty karet (Daltonové),
// v jakém pořadí se rozdává v intru a na čí tah se odkrývá karta High Noon. Ve hře pro 3
// (Město duchů) šerif není a začíná pomocník. Čistá funkce, ať se na ni může zeptat
// i server nad prostým stavem – GameState._firstPlayerIndex() ji jen deleguje.
function firstPlayerIndex(players) {
    const list = players || [];
    const s = list.findIndex(p => p && p.role === 'Sheriff');
    if (s !== -1) return s;
    const d = list.findIndex(p => p && p.role === 'Deputy');
    return d !== -1 ? d : 0;
}

const LOW_HEALTH_CHARS = ["Paul Regret", "El Gringo",
    // Dodge City – postavy se 3 životy (Apache Kid a Vera Custer přibudou ve fázi 7).
    "Elena Fuente", "Pixie Pete", "Sean Mallory", "Apache Kid", "Vera Custer",
    // A Fistful of Cards
    "Claus the Saint"];

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
                       LOW_HEALTH_CHARS, ROLE_CZ, roleNameCz,
                       TARGET_3P, isThreePlayerMode, firstPlayerIndex };
}
