// core/goldRush.js — ČISTÉ zrcadlo pravidel rozšíření Zlatá horečka nad PROSTÝM stavem
// (stejný tvar jako `room.gameState` / payload klienta), bez instance GameState.
//
// Proč vůbec existuje: server (logic/goldRush.js), klient (view/*) i bot (core/botPolicy.js)
// se musí ptát JEDNÍM predikátem. Kdyby se rozešly, klient nabídne nákup, server ho mlčky
// odmítne a hra jen botů se zasekne na akci, která nic nemění. Je to stejný důvod jako
// u core/highNoon.js a core/playability.js.
//
// Identita karty vybavení je `effect` (ZH_PANAK, …), NIKDY jméno – viz rozhodnutí R1.
// Izomorfní: globál v prohlížeči (<script> v index.html), require v Node/testech.

if (typeof require === 'function') {
    if (typeof eventActive === 'undefined') {
        const __hn = require('./highNoon.js');
        globalThis.eventActive = __hn.eventActive;
    }
    // Samostatné guardy (viz stejný vzor v core/botPolicy.js): bloky hlídané jedním
    // globálem by ostatní přeskočily, kdyby si highNoon.js natáhl někdo dřív.
    if (typeof beerBlockedFor === 'undefined') {
        globalThis.beerBlockedFor = require('./highNoon.js').beerBlockedFor;
    }
    if (typeof suitBlockedFor === 'undefined') {
        globalThis.suitBlockedFor = require('./highNoon.js').suitBlockedFor;
    }
    if (typeof isInPlay === 'undefined') {
        globalThis.isInPlay = require('./distance.js').isInPlay;
    }
    if (typeof hasAbility === 'undefined') {
        globalThis.hasAbility = require('./distance.js').hasAbility;
    }
    // Fistful – Laso vypíná i vybavení (R10); zrcadlo serverového _boardDead.
    if (typeof boardDeadFor === 'undefined') {
        globalThis.boardDeadFor = require('./highNoon.js').boardDeadFor;
    }
    // Fistful – Právo západu: nákup nesmí „vypnout" vynucenou kartu. Zrcadlo serverového
    // _lawLocked leží v playability.js, tady se jen volá.
    if (typeof lawLocksOther === 'undefined') {
        globalThis.lawLocksOther = require('./playability.js').lawLocksOther;
    }
    // …a karta Zlatá horečka ukončuje tah, což vynucená karta nedovolí vůbec.
    if (typeof lawForcedCard === 'undefined') {
        globalThis.lawForcedCard = require('./playability.js').lawForcedCard;
    }
    // Láhev a Komplic míří jako Bang! / Panika! – dostřel a vzdálenost jsou sdílené.
    if (typeof computeCanHit === 'undefined') {
        globalThis.computeCanHit = require('./distance.js').computeCanHit;
    }
    if (typeof computeDistance === 'undefined') {
        globalThis.computeDistance = require('./distance.js').computeDistance;
    }
}

// Hraje se rozšíření? Vlastní příznak `_goldRush`, ne „balíček není prázdný" – karet je
// 24 a všechny mohou být rozkoupené (zrcadlí GameState._goldRushOn).
function goldRushOn(state) {
    return !!(state && state._goldRush);
}

// Vybavení hráče (černý rám leží před ním). VLASTNÍ pole vedle `board` – proto se na něj
// nikdy neptat přes board (rozhodnutí R3).
function gearOf(state, playerIdx) {
    return (state?.players?.[playerIdx]?.gear) || [];
}

function hasGearFor(state, playerIdx, effect) {
    return gearOf(state, playerIdx).some(c => c && c.effect === effect);
}

// „Platí té kartě zrovna teď efekt?" – zrcadlo GameState._gearOn. Kromě vlastnictví
// v něm sedí obě karty, které vybavení VYPÍNAJÍ (R10): Laso (Fistful, celý stůl)
// a Belle Star (Dodge City, v jejím tahu cizí karty na stole). Vlastnictví samo
// (nákup, „ne dvě stejného", vynucené odhození) se ptá `hasGearFor`.
function gearOnFor(state, playerIdx, effect) {
    if (!hasGearFor(state, playerIdx, effect)) return false;
    if (boardDeadFor(state)) return false;
    const cur = state.currentPlayerIndex;
    return !(playerIdx !== cur && hasAbility(state.players?.[cur], "Belle Star"));
}

// Cena karty pro konkrétního hráče. Zrcadlí GameState._gearCost – jediné místo, kde se
// cena liší podle toho, kdo kupuje (Pretty Luzena, fáze 6).
function gearCostFor(state, playerIdx, card) {
    return card ? Math.max(0, card.cost || 0) : 0;
}

// Fistful – Soudce: „hráči nesmí vykládat karty před sebe ani před ostatní hráče."
// Blokuje jen ČERNÝ rám (ten před hráčem zůstane ležet), hnědý ne (R9).
function gearJudgeBlocks(state, card) {
    return !!card && card.border === 'black' && eventActive(state, 'SOUDCE');
}

// Co nákup udělá navíc, z pohledu Práva západu. Zrcadlí GameState._gearLawOpts.
// Rum léčí podle toho, kolik barev padne – počítá se nejhorší případ (4), stejně jako
// u Tequily, kde se v tu chvíli ještě neví, koho vyléčí. Láhev a Komplic se posuzují
// až podle zvoleného režimu (GEAR_MODE_LAW níž).
function gearLawOpts(card) {
    if (!card) return {};
    if (card.effect === 'ZH_PANAK') return { heal: 1 };
    if (card.effect === 'ZH_UNION_PACIFIC') return { draws: 4 };
    if (card.effect === 'ZH_RUM') return { heal: 4 };
    return {};
}

// ── Černé vybavení, které se vykládá PŘED JINÉHO HRÁČE (fáze 5): Wanted ─────
// „Zahraj na libovolného hráče." Jediná karta vybavení, která po zaplacení NESKONČÍ
// před kupujícím – cíl se vybírá klikem na hráče ve stejné fázi jako u Panáku
// (GEAR_TARGET). FAQ Q07: „okamžitě — před sebe, nebo před jiného hráče", takže je
// kupující mezi platnými cíli jako každý jiný.
//
// Seznam, ne rovnost, ze stejného důvodu jako GEAR_MODES: až přibude druhá taková karta,
// přidá se sem – a všechny tři strany (server, okno obchodu, bot) se o ní dozvědí naráz.
const GEAR_AIMED_BLACK = ['ZH_WANTED'];

function gearAimedBlack(card) {
    return !!card && GEAR_AIMED_BLACK.includes(card.effect);
}

// Komu se dá karta vyložit. Pravidlo „ne dvě stejného" (R1) se měří na CÍLI, ne na
// kupujícím: Wanted jsou tři kusy, takže může viset na třech různých hráčích – a hráč,
// který už jedno má, z nabídky vypadne.
function gearBlackTargets(state, playerIdx, card) {
    const out = [];
    (state?.players || []).forEach((q, i) => {
        if (!q || !isInPlay(q)) return;
        if (hasGearFor(state, i, card?.effect)) return;
        out.push(i);
    });
    return out;
}

// ── Hnědé vybavení s volbou (fáze 4): Láhev a Komplic ───────────────────────
// „Může být zahrána jako Panika!, Pivo nebo BANG!" / „…jako Hokynářství, Duel nebo
// Cat Balou." Dodatek: i když má stejný efekt, NEPOVAŽUJE SE za tu kartu – takže se na
// něj nevztahuje nic, co se ptá na kartu samotnou: limit 1× BANG!/tah, Slabův bonus,
// Kazatel, „Pivo ve dvou hráčích", bonus Tequily Joea (FAQ Q14) ani paměť Lee Van Kliffa.
//
// JAK se karta zahraje, se volí rovnou s nákupem (`gear_buy { rowIdx, mode }`), ne až
// po zaplacení: kdo zaplatí a pak zjistí, že zvolený způsob nemá na koho, přišel by
// o valouny zadarmo. Cíl se pak vybírá stejnou fází jako u Panáku (GEAR_TARGET).
// Tenhle blok je jediný zdroj pravdy pro server (gearBuy v logic/goldRush.js), okno
// obchodu i bota – rozejít se nesmí, jinak by server nákup mlčky odmítl.
const GEAR_MODES = {
    ZH_LAHEV:   ['PANIC', 'BEER', 'BANG'],
    ZH_KOMPLIC: ['STORE', 'DUEL', 'CAT_BALOU'],
};
// Jak se režim jmenuje v UI a logu (karta, jejíž efekt se půjčuje).
const GEAR_MODE_LABEL = {
    PANIC: 'Panika!', BEER: 'Pivo', BANG: 'BANG!',
    STORE: 'Hokynářství', DUEL: 'Duel', CAT_BALOU: 'Cat Balou',
};
// Režimy, které míří na hráče (vybírá se ve fázi GEAR_TARGET).
const GEAR_MODE_AIMED = ['PANIC', 'BANG', 'DUEL', 'CAT_BALOU'];
// Co režim udělá navíc, z pohledu Práva západu (viz lawLocksOther). BANG! z Láhve limit
// karet Bang! nečerpá (dodatek), takže mu nevadí; Panika! přidá do ruky ukradenou kartu,
// Hokynářství líznutou, Pivo doléčí život.
const GEAR_MODE_LAW = { PANIC: { draws: 1 }, BEER: { heal: 1 }, STORE: { draws: 1 } };

function gearModesOf(card) {
    return (card && GEAR_MODES[card.effect]) || null;
}

// Má hráč kartu, o kterou by šlo přijít (Panika!, Cat Balou)? Vybavení se nepočítá –
// na to Panika ani Cat Balou nesmí (R3), proto se na `gear` vůbec neptáme.
function _gearLosableCard(p) {
    return (p.hand || []).length > 0 || (p.board || []).length > 0 ||
           !!(p.weapon && p.weapon.id !== -1);
}

// Legální cíle cíleného režimu, měřené od kupujícího. Stejné podmínky, jako by hrál
// skutečnou kartu z ruky: BANG! na dostřel zbraně (Laso ho srazí na 1 – computeCanHit),
// Panika! na vzdálenost 1, Cat Balou a Duel na kohokoli. Sám na sebe nikdy.
function gearModeTargets(state, playerIdx, mode) {
    const out = [];
    (state.players || []).forEach((q, i) => {
        if (i === playerIdx || !q || !isInPlay(q)) return;
        switch (mode) {
            case 'BANG':
                if (computeCanHit(state, playerIdx, i)) out.push(i);
                break;
            case 'PANIC':
                if (_gearLosableCard(q) && computeDistance(state, playerIdx, i) <= 1) out.push(i);
                break;
            case 'CAT_BALOU':
                if (_gearLosableCard(q)) out.push(i);
                break;
            case 'DUEL':
                out.push(i);
                break;
            default:
                break;
        }
    });
    return out;
}

// Proč se tenhle režim teď zahrát nedá (null = dá). Neřeší cenu ani obchod – to dělá
// gearBuyReason, který se na tohle ptá až nakonec.
function gearModeReason(state, playerIdx, mode) {
    const me = state.players[playerIdx];
    if (!me || !GEAR_MODE_LABEL[mode]) return 'neznámý způsob';
    // Pivo na plný život nic neudělá – stejně jako karta Pivo, která se pak nedá zahrát.
    if (mode === 'BEER' && me.health >= me.maxHealth) return 'máš plné životy';
    if (GEAR_MODE_AIMED.includes(mode) && !gearModeTargets(state, playerIdx, mode).length) {
        switch (mode) {
            case 'BANG':      return 'nikdo v dostřelu';
            case 'PANIC':     return 'nikdo na vzdálenost 1 nemá kartu';
            case 'CAT_BALOU': return 'nikdo nemá kartu';
            default:          return 'není na koho';
        }
    }
    if (lawLocksOther(state, me, playerIdx, null, GEAR_MODE_LAW[mode] || {}))
        return 'Právo západu – nejdřív zahraj vynucenou kartu';
    return null;
}

// Podmínky vázané na EFEKT karty (ne na obchod): režim Láhve/Komplice, Rum a karta
// Zlatá horečka. `mode` = zvolený režim; u karty s režimy znamená null/undefined
// „jde to aspoň nějak?" (okno obchodu podle toho zašedí celou kartu). Server se ptá
// vždy s konkrétním režimem a karta s režimy bez něj neprojde (gearBuy).
function gearCardReason(state, playerIdx, card, mode) {
    const me = state?.players?.[playerIdx];
    if (!me || !card) return 'prázdný slot';
    const modes = gearModesOf(card);
    if (modes) {
        if (mode == null) {
            return modes.some(m => gearModeReason(state, playerIdx, m) === null)
                ? null : 'teď ji nejde zahrát ani jedním způsobem';
        }
        if (!modes.includes(mode)) return 'neznámý způsob';
        return gearModeReason(state, playerIdx, mode);
    }
    // Wanted: „zahraj na libovolného hráče" – musí být komu. Bez volného cíle (každý
    // ve hře už jedno má) by se zaplatilo za kartu, která nemá kam.
    if (gearAimedBlack(card) && !gearBlackTargets(state, playerIdx, card).length)
        return 'tohle vybavení už mají všichni';
    // Rum léčí – na plný život by se za něj zaplatilo a nestalo by se nic.
    if (card.effect === 'ZH_RUM' && me.health >= me.maxHealth) return 'máš plné životy';
    if (card.effect === 'ZH_ZLATA_HORECKA') {
        // „Tvůj tah končí" – a ukončit tah vynucená karta nedovolí (Fistful, Právo západu).
        if (lawForcedCard(state, me, playerIdx)) return 'Právo západu – nejdřív zahraj vynucenou kartu';
        // High Noon – Město duchů: duch je na konci svého tahu vyřazen, takže tah navíc
        // už nezahraje – stejný výklad jako FAQ Q13 u Dona Bella.
        if (me._ghost) return 'duch na konci tahu odchází';
    }
    return null;
}

// Je hráč vůbec ve stavu, kdy se smí nakupovat? Nákup NENÍ fáze (R6) – je to akce
// ve fázi PLAY hráče na tahu.
function gearShopOpen(state, playerIdx) {
    return goldRushOn(state) && state.phase === 'PLAY' &&
           state.currentPlayerIndex === playerIdx &&
           isInPlay(state.players?.[playerIdx]);
}

// Smí tenhle hráč koupit kartu ze slotu `rowIdx`? Vrací důvod odmítnutí (nebo null),
// aby klient uměl říct, PROČ je karta zašedlá. Zrcadlí GameState.gearBuy.
// `mode` = jak se zahraje Láhev / Komplic (bez něj: „jde to aspoň nějak?").
function gearBuyReason(state, playerIdx, rowIdx, mode) {
    if (!gearShopOpen(state, playerIdx)) return 'není tvůj tah';
    const card = (state.gearRow || [])[rowIdx];
    if (!card) return 'prázdný slot';
    const me = state.players[playerIdx];
    if (gearJudgeBlocks(state, card)) return 'Soudce zakazuje vykládat karty';
    if (lawLocksOther(state, me, playerIdx, null, gearLawOpts(card)))
        return 'Právo západu – nejdřív zahraj vynucenou kartu';
    // „Ne dvě stejného" se u Wanted měří až na vybraném CÍLI (gearBlackTargets), ne na
    // kupujícím – jinak by si hráč s Wanted před sebou další už nikdy nekoupil.
    if (card.border === 'black' && !gearAimedBlack(card) && hasGearFor(state, playerIdx, card.effect))
        return 'tohle vybavení už máš';
    if ((me.nuggets || 0) < gearCostFor(state, playerIdx, card)) return 'málo valounů';
    return gearCardReason(state, playerIdx, card, mode);
}

function gearBuyOk(state, playerIdx, rowIdx, mode) {
    return gearBuyReason(state, playerIdx, rowIdx, mode) === null;
}

// Vynucené odhození cizího vybavení: cena karty + 1 (sleva Pretty Luzeny na tohle
// neplatí) a jen CIZÍ karta (FAQ Q10). Zrcadlí GameState.gearForceDiscard.
function gearForceCost(card) {
    return Math.max(0, card?.cost || 0) + 1;
}

function gearForceOk(state, playerIdx, targetIdx, gearIdx) {
    if (!gearShopOpen(state, playerIdx) || targetIdx === playerIdx) return false;
    const t = state.players?.[targetIdx];
    const card = t && (t.gear || [])[gearIdx];
    if (!card || !isInPlay(t)) return false;
    return (state.players[playerIdx].nuggets || 0) >= gearForceCost(card);
}

// Má hráč na koho použít vynucené odhození (klient podle toho nabízí režim)?
function gearForceAvailable(state, playerIdx) {
    if (!gearShopOpen(state, playerIdx)) return false;
    return (state.players || []).some((p, i) =>
        i !== playerIdx && isInPlay(p) && (p.gear || []).some((c, k) => gearForceOk(state, playerIdx, i, k)));
}

// Pivo za valoun: „zahráním karty Pivo z ruky si vezmeš 1 valoun místo doplnění života."
// Limit „ve dvou hráčích nemá Pivo efekt" tady NEPLATÍ (FAQ Q11), Kazatel (Reverend)
// a Želízka ano – ptáme se na ně stejně jako server (core/highNoon.js).
function beerNuggetOk(state, playerIdx, card) {
    if (!gearShopOpen(state, playerIdx) || !card || card.type !== 'Pivo') return false;
    if (beerBlockedFor(state, playerIdx)) return false;      // High Noon – Kazatel
    if (suitBlockedFor(state, playerIdx, card)) return false;  // High Noon – Želízka
    const me = state.players[playerIdx];
    if (lawLocksOther(state, me, playerIdx, card, {})) return false;
    return true;
}

// ── Placené černé vybavení (fáze 3) ─────────────────────────────────────────
// Rýžovací mísa: „Zaplať 1 valoun a lízni si 1 kartu z balíčku. Použitelné až 2× za
// tah." Počítadlo je klíčované `turnId` (zrcadlí GameState._panUsesThisTurn).
const GEAR_PAN_USES = 2;

function gearPanUsesLeft(state, playerIdx) {
    const p = state?.players?.[playerIdx];
    const used = p && p._panTurn === state.turnId ? (p._panUses || 0) : 0;
    return Math.max(0, GEAR_PAN_USES - used);
}

// Smí hráč teď rýžovat? Zrcadlí GameState.gearPanUse.
function gearPanOk(state, playerIdx) {
    if (!gearShopOpen(state, playerIdx)) return false;
    if (!gearOnFor(state, playerIdx, 'ZH_RYZOVACI_MISA')) return false;
    if (gearPanUsesLeft(state, playerIdx) <= 0) return false;
    const me = state.players[playerIdx];
    if ((me.nuggets || 0) < 1) return false;
    return !lawLocksOther(state, me, playerIdx, null, { draws: 1 });
}

// Batoh: „Zaplať 2 valouny a doplň si 1 život." Ve svém tahu (fáze PLAY), má-li hráč
// co doplnit. Zrcadlí větev PLAY v GameState.gearRucksackUse.
function gearRucksackOk(state, playerIdx) {
    if (!gearShopOpen(state, playerIdx)) return false;
    if (!gearOnFor(state, playerIdx, 'ZH_BATOH')) return false;
    const me = state.players[playerIdx];
    if ((me.nuggets || 0) < 2 || me.health >= me.maxHealth) return false;
    return !lawLocksOther(state, me, playerIdx, null, { heal: 1 });
}

// …a mimo tah (i ve svém tahu mimo fázi PLAY) jako záchrana POSLEDNÍHO života. Stejné
// tři fáze jako záchrana Pivem, jen bez omezení Piva (dva hráči, Kazatel, Želízka).
// Zrcadlí GameState.rucksackLastLifeSave (logic/response.js).
function gearRucksackSaveOk(state, playerIdx) {
    if (!goldRushOn(state)) return false;
    const me = state?.players?.[playerIdx];
    if (!me || me.health !== 1 || (me.nuggets || 0) < 2) return false;
    if (!gearOnFor(state, playerIdx, 'ZH_BATOH')) return false;
    switch (state.phase) {
        case 'DYNAMITE_DAMAGE': return state.pendingDynamiteDamage?.playerIdx === playerIdx;
        case 'NOON_DAMAGE':     return state.pendingNoonDamage?.playerIdx === playerIdx;
        case 'RESPOND': {
            const pr = state.pendingResponse;
            return !!(pr && pr.active && pr.targetIdx === playerIdx && !pr.ricochet);
        }
        default: return false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { goldRushOn, gearOf, hasGearFor, gearOnFor, gearCostFor, gearJudgeBlocks, gearLawOpts,
                       GEAR_AIMED_BLACK, gearAimedBlack, gearBlackTargets,
                       GEAR_MODES, GEAR_MODE_LABEL, GEAR_MODE_AIMED, gearModesOf, gearModeTargets,
                       gearModeReason, gearCardReason,
                       gearShopOpen, gearBuyReason, gearBuyOk,
                       gearForceCost, gearForceOk, gearForceAvailable, beerNuggetOk,
                       gearPanUsesLeft, gearPanOk, gearRucksackOk, gearRucksackSaveOk };
}
