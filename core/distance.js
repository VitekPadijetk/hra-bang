// Čistá logika vzdálenosti a dostřelu – BEZ závislosti na Phaseru, serveru či DOM.
// Izomorfní: v prohlížeči se načítá jako <script> a vytváří globály computeDistance/computeCanHit,
// v Node/testech se importuje přes require('./core/distance.js').
//
// `state` je jakýkoli objekt s polem `players`, kde každý hráč má:
//   { health, character, board: [{effect}], weapon: {range?|props:{range?}} }
// Funguje tedy nad instancí GameState (server) i nad prostým JSON stavem na klientu.

// Události A Fistful of Cards, které do vzdálenosti/dostřelu mluví (Léčka, Laso).
// core/highNoon.js na distance.js nesahá, takže cyklus nevzniká.
if (typeof require === 'function' && typeof eventActive === 'undefined') {
    const __hn = require('./highNoon.js');
    globalThis.eventActive = __hn.eventActive;
    if (typeof boardDeadFor === 'undefined') globalThis.boardDeadFor = __hn.boardDeadFor;
}
// Samostatný guard: kdo načte highNoon.js dřív, doplní si jen část globálů.
if (typeof require === 'function' && typeof boardDeadFor === 'undefined') {
    globalThis.boardDeadFor = require('./highNoon.js').boardDeadFor;
}

// Efektivní postava hráče: Vera Custer (Dodge City) si na začátku tahu zkopíruje
// schopnost jiné žijící postavy (`_copiedCharacter`) až do svého příštího tahu; jinak
// je to prostě `player.character`. Všechny kontroly „character === X" (schopnosti) čtou
// přes tento helper, aby Vera kopii opravdu měla. Render (portrét) používá dál `character`.
// High Noon – Kocovina (`_noAbility`): po celé kolo neplatí ŽÁDNÉ schopnosti postav,
// včetně kopie, kterou má zrovna Vera Custer (FAQ X6). Příznak nastavuje/ruší při každé
// výměně události _applyEventOnEnter (logic/highNoon.js). Max. životy (healthForCharacter)
// i portrét čtou `player.character` napřímo, takže se nemění.
function effectiveCharacter(player) {
    if (!player) return null;
    if (player._noAbility) return null;
    return player._copiedCharacter || player.character;
}

// High Noon – Město duchů (`_ghost`): vyřazený hráč se na JEDEN svůj tah vrací do hry.
// Nastupuje s 0 životy, ale po dobu svého tahu sedí zase v kole: má vzdálenost, může cílit
// i být cílen, počítá se do hokynářství a **léčit se smí** (naléčené životy pak utratí
// třeba Chuck Wengam; umřít stejně nemůže – viz handleDamage). Tenhle helper je jediný
// test „je ve hře"; prosté `health > 0` zůstává tam, kde jde o skutečný život (Greg
// Digger, záchrana posledního života). Příznak drží jen po dobu svého tahu (_teardownGhost,
// který duchovi zároveň vrátí životy na nulu).
function isInPlay(player) {
    return !!player && (player.health > 0 || !!player._ghost);
}

// Kolik hráčů právě SEDÍ VE HŘE (duch Města duchů se počítá – na svůj tah hraje).
// Jediný zdroj pravdy pro pravidlo „při dvou hráčích Pivo nemá efekt": je-li na tahu
// duch a žijí ještě dva hráči, hrají v tu chvíli tři a Pivo (i Sidova záchrana) platí.
function inPlayCount(players) {
    return (players || []).filter(isInPlay).length;
}

function computeDistance(state, fromIdx, toIdx) {
    const alivePlayers = state.players
        .map((p, index) => ({ p, index }))
        .filter(item => isInPlay(item.p));
    const i1 = alivePlayers.findIndex(item => item.index === fromIdx);
    const i2 = alivePlayers.findIndex(item => item.index === toIdx);
    if (i1 === -1 || i2 === -1) return 999;
    const diff = Math.abs(i1 - i2);
    // A Fistful of Cards – Léčka: vzdálenost mezi kterýmikoli dvěma hráči je 1. Základ ze
    // sedadel se zahodí, modifikátory (Paul Regret, Rose Doolan, Mustang/Skrýš, Dalekohled/
    // Hledí) se počítají od jedničky dál. Na sebe sama vyjde 1 tak jako tak (Math.max níž).
    let dist = eventActive(state, 'LECKA') ? 1 : Math.min(diff, alivePlayers.length - diff);
    const attacker = state.players[fromIdx];
    const target = state.players[toIdx];
    if (effectiveCharacter(target) === "Paul Regret") dist += 1;
    if (effectiveCharacter(attacker) === "Rose Doolan") dist -= 1;
    // Belle Star (Dodge City): v jejím tahu nemají cizí karty na stole žádný efekt →
    // ignoruj cizí Mustang/Skrýš (dosah) i vlastní Dalekohled/Hledí, pokud útočí někdo jiný.
    const belleActiveIdx = (typeof state.currentPlayerIndex === 'number' &&
        effectiveCharacter(state.players[state.currentPlayerIndex]) === "Belle Star")
        ? state.currentPlayerIndex : -1;
    // A Fistful of Cards – Laso: karty na stole nemají efekt vůbec nikomu, tedy ani
    // vlastní Dalekohled/Hledí útočníka (na rozdíl od Belle Star, která ruší jen cizí).
    const lasso = boardDeadFor(state);
    const ignoreTargetBoard = lasso || belleActiveIdx === fromIdx;   // Belle útočí → cizí board cíle neplatí
    // Karty se SČÍTAJÍ, každá dá ±1: Mustang + Skrýš (Dodge City) na stole cíle = +2,
    // Hledí + Dalekohled u útočníka = −2. Různá jména, takže je legální mít obě naráz
    // (pravidlo D7 zakazuje jen dvě karty stejného jména). Dřív se přes .some() započítala
    // vždy jen jedna → Rose Doolan „dostřelila" na souseda se Skrýší i Mustangem.
    if (!ignoreTargetBoard) dist += (target.board || []).filter(c => c.effect === 'mustang').length;
    if (!lasso) dist -= (attacker.board || []).filter(c => c.effect === 'scope').length;
    return Math.max(1, dist);
}

// canHit s volitelným přepisem dostřelu (reachOverride):
//   undefined → dostřel zbraně (klasický Bang!),
//   číslo     → pevný dostřel (Úder=1, …),
//   Infinity  → bez omezení (bang-efekt „any": Springfield/Puška na bizony).
function computeCanHit(state, attackerIdx, targetIdx, reachOverride) {
    const attacker = state.players[attackerIdx];
    let reach;
    if (reachOverride === Infinity) reach = Infinity;
    else if (typeof reachOverride === 'number') reach = reachOverride;
    // Laso (Fistful): zbraň je karta na stole → žádný efekt, střílí se na dostřel 1
    // jako s Coltem. Pevný dostřel karty z ruky (Úder, Springfield) tím dotčený není.
    else reach = boardDeadFor(state) ? 1 : (attacker.weapon?.range || attacker.weapon?.props?.range || 1);
    return computeDistance(state, attackerIdx, targetIdx) <= reach;
}

// Dostřel karty s bang-efektem pro computeCanHit:
//   'any'    → Infinity (bez omezení), 'weapon' → undefined (dostřel zbraně),
//   číslo    → to číslo (Úder=1). Pro kartu bez bangEffect vrací undefined.
// 'mass' (Houfnice) není cílené střílení → řeší se jako hromadný útok (fáze 5).
function bangEffectReach(card) {
    if (!card || !card.bangEffect) return undefined;
    if (card.range === 'any') return Infinity;
    if (typeof card.range === 'number') return card.range;
    return undefined;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { computeDistance, computeCanHit, bangEffectReach, effectiveCharacter, isInPlay, inPlayCount };
}
