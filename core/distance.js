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

// Které schopnosti hráči právě PLATÍ (pole jmen postav). Jediný trychtýř pro všechny
// kontroly „umí X?" v pravidlech, v botovi i v UI – `effectiveCharacter` zůstává vedle
// pro to, kde jde o JEDNU postavu k zobrazení (portrét, overlay volby kopie, štítek).
// Rozdíl je Greygory Deck (Divoký západ): má schopnosti DVOU náhodně líznutých postav
// naráz, takže se dotaz musí ptát na seznam, ne na rovnost jednoho jména.
//   • Kocovina (High Noon, `_noAbility`) vypíná všechny naráz → prázdné pole,
//   • Vera Custer se ptá skrz kopii (`_copiedCharacter`),
//   • a kopíruje-li Vera Greygoryho, platí JEJÍ vlastní líznutá dvojice (R10) –
//     `_greygoryChars` proto nese ten, kdo schopnost právě má, ne sám Greygory.
function abilitiesOf(player) {
    if (!player || player._noAbility) return [];
    const base = player._copiedCharacter || player.character;
    if (base === "Greygory Deck") return [...(player._greygoryChars || [])];
    return base ? [base] : [];
}

// Zkratka nad abilitiesOf bez alokace pole – volá se v computeDistance, tedy v horké
// cestě bota. Chová se přesně jako `abilitiesOf(p).includes(name)`.
function hasAbility(player, name) {
    if (!player || player._noAbility) return false;
    const base = player._copiedCharacter || player.character;
    if (base === "Greygory Deck") return !!player._greygoryChars && player._greygoryChars.includes(name);
    return base === name;
}

// High Noon – Město duchů (`_ghost`): vyřazený hráč se na JEDEN svůj tah vrací do hry.
// Nastupuje s 0 životy, ale po dobu svého tahu sedí zase v kole: má vzdálenost, může cílit
// i být cílen, počítá se do hokynářství a **léčit se smí** (naléčené životy pak utratí
// třeba Chuck Wengam; umřít stejně nemůže – viz handleDamage). Tenhle helper je jediný
// test „je ve hře"; prosté `health > 0` zůstává tam, kde jde o skutečný život (Greg
// Digger, záchrana posledního života). Příznak drží jen po dobu svého tahu (_teardownGhost,
// který duchovi zároveň vrátí životy na nulu).
//
// Zlatá horečka – varianta Stínoví pistolníci (`_shadow`): vyřazený hráč se vrací na
// KAŽDÝ svůj tah, i tehdy je ve hře (vzdálenost, cíl, hokynářství), ale s 0 životy,
// které se „nedají získat ani ztratit". Mimo svůj tah je mimo hru jako každý vyřazený –
// příznak drží zase jen po dobu jeho tahu (_teardownShadow, logic/shadow.js).
//
// Údolí stínů – karta Duch: vyřazený hráč, před kterým leží Duch, je zpátky ve hře
// NATRVALO (i během cizích tahů) – s 0 životy, které „nemůže získat ani ztratit".
// Stav se ODVOZUJE z karty na stole (R10, `hasDuchCard`), žádný příznak: kartu umí
// sebrat deset různých cest (Panika, Cat Balou, Daltonové, Odražená střela…) a odvozený
// stav se rozejít nemůže. Úklid po odchodu dělá `_vosGhostSettle` (logic/valley.js).
function isInPlay(player) {
    return !!player && (player.health > 0 || !!player._ghost || !!player._shadow || isVosGhost(player));
}

// Leží před hráčem karta Duch (Údolí stínů)?
function hasDuchCard(player) {
    return !!player && (player.board || []).some(c => c && c.type === 'Duch');
}

// Je hráč Duch – vyřazený (0 životů) s kartou Duch před sebou? Kartu Duch jde vyložit
// jen před vyřazeného a život pak získat nemůže, takže nula je jistá – dotaz se na ni
// přesto ptá, ať karta před živým hráčem (nemělo by nastat) nic nerozbije.
function isVosGhost(player) {
    return !!player && player.health <= 0 && hasDuchCard(player);
}

// Sedí hráč ve hře NATRVALO, i mimo svůj tah? Živý, nebo Duch. Na rozdíl od isInPlay
// sem nepatří duch Města duchů ani stín Stínových pistolníků – ti jsou ve hře jen po
// dobu svého tahu. Ptá se tím pořadí tahů (nextTurn), kdo odkrývá události, Daltonové,
// výhra, dedukce rolí bota, Mrtvý muž a Hřbitov (Duch není vyřazený, nevrací se).
function staysInPlay(player) {
    return !!player && (player.health > 0 || isVosGhost(player));
}

// Může si hráč právě teď doplnit život? JEDINÝ dotaz všech léčivých cest (Pivo, Salón,
// Whisky, Tequila, Sid Ketchum, Panák, Batoh, Rum, …) na serveru, u klienta i u bota.
// Duch (Město duchů) se léčit smí; stín (Stínoví pistolníci) ani Duch (Údolí stínů) ne
// – „nemůžeš získat ani ztratit život". Kdyby se jedna strana ptala jinak, bot by poslal
// léčení, které server mlčky odmítne, a hra jen botů by se zasekla.
function canHeal(player) {
    return isInPlay(player) && !player._shadow && !isVosGhost(player) && player.health < player.maxHealth;
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
    if (hasAbility(target, "Paul Regret")) dist += 1;
    if (hasAbility(attacker, "Rose Doolan")) dist -= 1;
    // Belle Star (Dodge City): v jejím tahu nemají cizí karty na stole žádný efekt →
    // ignoruj cizí Mustang/Skrýš (dosah) i vlastní Dalekohled/Hledí, pokud útočí někdo jiný.
    const belleActiveIdx = (typeof state.currentPlayerIndex === 'number' &&
        hasAbility(state.players[state.currentPlayerIndex], "Belle Star"))
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
    // Údolí stínů – na Ducha se nestřílí: ve hře sice je (vzdálenost, Panika, Vězení…),
    // ale život ztratit nemůže, takže by výstřel nic neudělal. Tímhle dotazem se ptá
    // klient (zvýraznění cíle), bot i server, takže se nerozejdou.
    if (isVosGhost(state.players[targetIdx])) return false;
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
    module.exports = { computeDistance, computeCanHit, bangEffectReach, effectiveCharacter, abilitiesOf, hasAbility, isInPlay, canHeal, inPlayCount,
                       hasDuchCard, isVosGhost, staysInPlay };
}
