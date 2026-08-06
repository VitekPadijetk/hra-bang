// Čistá logika vzdálenosti a dostřelu – BEZ závislosti na Phaseru, serveru či DOM.
// Izomorfní: v prohlížeči se načítá jako <script> a vytváří globály computeDistance/computeCanHit,
// v Node/testech se importuje přes require('./core/distance.js').
//
// `state` je jakýkoli objekt s polem `players`, kde každý hráč má:
//   { health, character, board: [{effect}], weapon: {range?|props:{range?}} }
// Funguje tedy nad instancí GameState (server) i nad prostým JSON stavem na klientu.

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
// Zůstává na 0 životech (aby ho pravidla o životech dál braly jako mrtvého – nejde léčit
// a nemůže umřít), ale po dobu svého tahu sedí zase v kole: má vzdálenost, může cílit
// i být cílen a počítá se do hokynářství. Tenhle helper je jediný test „je ve hře";
// prosté `health > 0` zůstává tam, kde jde o skutečný život (léčení, Greg Digger,
// záchrana posledního života). Příznak drží jen po dobu svého tahu (viz _teardownGhost).
function isInPlay(player) {
    return !!player && (player.health > 0 || !!player._ghost);
}

function computeDistance(state, fromIdx, toIdx) {
    const alivePlayers = state.players
        .map((p, index) => ({ p, index }))
        .filter(item => isInPlay(item.p));
    const i1 = alivePlayers.findIndex(item => item.index === fromIdx);
    const i2 = alivePlayers.findIndex(item => item.index === toIdx);
    if (i1 === -1 || i2 === -1) return 999;
    const diff = Math.abs(i1 - i2);
    let dist = Math.min(diff, alivePlayers.length - diff);
    const attacker = state.players[fromIdx];
    const target = state.players[toIdx];
    if (effectiveCharacter(target) === "Paul Regret") dist += 1;
    if (effectiveCharacter(attacker) === "Rose Doolan") dist -= 1;
    // Belle Star (Dodge City): v jejím tahu nemají cizí karty na stole žádný efekt →
    // ignoruj cizí Mustang/Skrýš (dosah) i vlastní Dalekohled/Hledí, pokud útočí někdo jiný.
    const belleActiveIdx = (typeof state.currentPlayerIndex === 'number' &&
        effectiveCharacter(state.players[state.currentPlayerIndex]) === "Belle Star")
        ? state.currentPlayerIndex : -1;
    const ignoreTargetBoard = belleActiveIdx === fromIdx;   // Belle útočí → cizí board cíle neplatí
    // Karty se SČÍTAJÍ, každá dá ±1: Mustang + Skrýš (Dodge City) na stole cíle = +2,
    // Hledí + Dalekohled u útočníka = −2. Různá jména, takže je legální mít obě naráz
    // (pravidlo D7 zakazuje jen dvě karty stejného jména). Dřív se přes .some() započítala
    // vždy jen jedna → Rose Doolan „dostřelila" na souseda se Skrýší i Mustangem.
    if (!ignoreTargetBoard) dist += (target.board || []).filter(c => c.effect === 'mustang').length;
    dist -= (attacker.board || []).filter(c => c.effect === 'scope').length;
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
    else reach = attacker.weapon?.range || attacker.weapon?.props?.range || 1;
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
    module.exports = { computeDistance, computeCanHit, bangEffectReach, effectiveCharacter, isInPlay };
}
