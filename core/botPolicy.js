// core/botPolicy.js — „mozek" počítačového hráče. ČISTÁ logika bez Phaseru/DOM/socketu
// a bez závislosti na instanci GameState: pracuje nad prostým stavem (stejný tvar jako
// `room.gameState` / payload klienta). Izomorfní (globál v prohlížeči, require v Node/testech).
//
// Dvě veřejné funkce:
//   pendingActor(state)                 -> { idx, kind } | null   — na koho a na jaké rozhodnutí hra čeká
//   decideBotAction(state, i, beliefs)  -> { event, payload } | null — JEDNA akce bota (jako socket událost)
//
// Driver (server/bots.js) volá pendingActor, aby zjistil, zda je „na tahu" bot; pokud ano,
// spočítá `beliefs` (core/beliefs.js) a zavolá decideBotAction; výsledek vystřelí přes stejný
// handler jako člověk. Každý tick = jedna atomická akce; po broadcastu se vyhodnotí znovu.
//
// SKRYTÉ ROLE: bot NEČTE `p.role` ostatních. Cílení jede přes `beliefs` (odhad rolí z
// veřejných informací + chování), takže bot nestřílí na pravděpodobné spojence a míří na
// pravděpodobné nepřátele – aniž by „viděl", kdo je kdo. Jediné legální čtení cizí `role`
// je veřejný šerif (hvězda), a to jen tam, kde ho zná i člověk (Vězení nesmí na šerifa).
//
// INVARIANT „bot se nikdy nezasekne": pro každý `kind` musí decideBotAction vrátit legální
// terminální akci (PLAY -> end_turn, RESPOND -> schytat zásah, atd.), jinak by hra jen botů zamrzla.

// Znovupoužití čistých helperů, které už vynucuje klient (stejná pravidla pro bota i člověka).
if (typeof require === 'function') {
    if (typeof computeDistance === 'undefined') {
        const __d = require('./distance.js');
        globalThis.computeDistance = __d.computeDistance;
        globalThis.computeCanHit = __d.computeCanHit;
        globalThis.bangEffectReach = __d.bangEffectReach;
        globalThis.effectiveCharacter = __d.effectiveCharacter;
    }
    // Samostatný guard – viz stejná poznámka u suitBlockedFor níž.
    if (typeof isInPlay === 'undefined') {
        globalThis.isInPlay = require('./distance.js').isInPlay;
    }
    if (typeof cardPlayability === 'undefined') {
        globalThis.cardPlayability = require('./playability.js').cardPlayability;
    }
    // Právo západu (Fistful) – samostatný guard: kdo načte playability.js dřív, doplnil
    // by si jen cardPlayability.
    if (typeof lawForcedCard === 'undefined') {
        globalThis.lawForcedCard = require('./playability.js').lawForcedCard;
    }
    // Ruská ruleta (Fistful) – samostatný guard ze stejného důvodu.
    if (typeof rouletteDiscardable === 'undefined') {
        globalThis.rouletteDiscardable = require('./playability.js').rouletteDiscardable;
    }
    // Odstřelovač a Odražená střela (Fistful) – tytéž helpery jako server i klient.
    if (typeof sniperOffer === 'undefined') {
        const __pl2 = require('./playability.js');
        globalThis.sniperOffer = __pl2.sniperOffer;
        globalThis.ricochetOffer = __pl2.ricochetOffer;
        globalThis.ricochetTargetOk = __pl2.ricochetTargetOk;
        globalThis.ricochetAvailable = __pl2.ricochetAvailable;
        globalThis.bangCardFromHand = __pl2.bangCardFromHand;
        globalThis.bangLimitFree = __pl2.bangLimitFree;
        globalThis.bangAtPlayerOk = __pl2.bangAtPlayerOk;
    }
    if (typeof getActionForCard === 'undefined') {
        globalThis.getActionForCard = require('./cardRules.js').getActionForCard;
    }
    if (typeof isBlueCard === 'undefined') {
        globalThis.isBlueCard = require('./cardRules.js').isBlueCard;
    }
    if (typeof pendingActor === 'undefined') {
        globalThis.pendingActor = require('./pending.js').pendingActor;
    }
    if (typeof effSuit === 'undefined') {
        const __hn = require('./highNoon.js');
        globalThis.eventActive = __hn.eventActive;
        globalThis.bangLimitFor = __hn.bangLimitFor;
        globalThis.bangBlockedFor = __hn.bangBlockedFor;
        globalThis.beerBlockedFor = __hn.beerBlockedFor;
        globalThis.effSuit = __hn.effSuit;
    }
    // Samostatný guard – viz stejná poznámka v playability.js.
    if (typeof suitBlockedFor === 'undefined') {
        globalThis.suitBlockedFor = require('./highNoon.js').suitBlockedFor;
    }
    if (typeof boardDeadFor === 'undefined') {
        globalThis.boardDeadFor = require('./highNoon.js').boardDeadFor;
    }
    if (typeof computeBeliefs === 'undefined') {
        const __b = require('./beliefs.js');
        globalThis.computeBeliefs = __b.computeBeliefs;
        globalThis.expectedHostility = __b.expectedHostility;
        globalThis.enemyProbability = __b.enemyProbability;
        globalThis.roleHostility = __b.roleHostility;
        globalThis.estimateOutlawsAlive = __b.estimateOutlawsAlive;
        globalThis.estimateDeputiesAlive = __b.estimateDeputiesAlive;
        globalThis.estimateOtherRenegadesAlive = __b.estimateOtherRenegadesAlive;
    }
}

// ── Konstanty typů karet (řetězce shodné s logic/entities.js) ────────────────
const T = {
    BANG: 'Bang!', MISSED: 'Vedle!', BEER: 'Pivo', SALOON: 'Salon',
    STAGECOACH: 'Dostavník', WELLS_FARGO: 'Wells Fargo', STORE: 'Hokynářství',
    WEAPON: 'Zbraň', EQUIPMENT: 'Vybavení', BARREL: 'Barel', DYNAMITE: 'Dynamit',
    JAIL: 'Vězení', PANIC: 'Panika!', CAT_BALOU: 'Cat Balou', DUEL: 'Duel',
    GATLING: 'Kulomet', INDIANS: 'Indiáni!', UHYB: 'Úhyb',
};
const HEARTS = '♥️';
const DIAMONDS = '♦️';
const SPADES = '♠️';

// Cíl je „nepřítel", až když očekávaná nepřátelskost překročí tenhle práh. Malé kladné ε →
// bot se vyhne střelbě na pravděpodobné spojence i na nejednoznačné hráče (host ≈ 0), ale
// klidně útočí na prokázané/pravděpodobné nepřátele. rankEnemies řadí od nejjistějšího.
const ENEMY_EPS = 0.1;

// Nouzové cílení: když práh nepřekročí NIKDO, hra by se zasekla – nikdo by nikoho
// nenapadl, boti by jen lízali a odhazovali. Typicky konec hry, kde straně šerifa zbývají
// jen nerozlišitelní pomocníci a odpadlík (šerif+2 pomocníci+odpadlík → nepřítelem je
// každý jen z 1/3, takže očekávaná nepřátelskost vyjde záporně u všech). Tehdy se útočí na
// NEJPRAVDĚPODOBNĚJŠÍHO nepřítele – ale jen na toho, u kterého má „nepřítel" aspoň takovou
// šanci. Jistý spojenec (šance 0) tak zůstává nedotknutelný vždycky.
const DESPERATE_ENEMY_P = 0.25;

// pendingActor je vytažen do core/pending.js (sdílí ho klient přes <script>). V prohlížeči
// je globál z pending.js, v Node ho výše require-ujeme na globalThis. Re-export níže drží
// kompatibilitu pro server/bots.js a testy (require('./botPolicy').pendingActor).

// Kontext pro roleHostility (renegade timing) odvozený z beliefů. Odpadlík smí na šerifa
// teprve, když nežije NIKDO další – ani bandita, ani pomocník (jinak by zabitím šerifa
// vyhráli bandité, ne on). Viz roleHostility v core/beliefs.js.
function hostOpts(state, beliefs, myIndex) {
    return {
        outlawsAlive: estimateOutlawsAlive(state, beliefs) > 0.5,
        deputiesAlive: estimateDeputiesAlive(state, beliefs) > 0.5,
        // Při 8 hráčích jsou odpadlíci dva – druhý je rival, kvůli kterému se na šerifa
        // ještě nesahá (stejný důvod jako u banditů a pomocníků).
        renegadesAlive: estimateOtherRenegadesAlive(state, beliefs, myIndex) > 0.5,
        // Hra pro 3 (Město duchů): nepřátelskost je cyklická, ne po stranách.
        mode3p: !!state.mode3p,
    };
}

// Očekávaná nepřátelskost bota (myIndex) vůči cíli podle beliefů.
function hostilityOf(state, myIndex, targetIdx, beliefs) {
    const me = state.players[myIndex];
    return expectedHostility(me.role, beliefs[targetIdx], hostOpts(state, beliefs, myIndex));
}

// Seřazení nepřátel podle beliefů: nejvíc nepřátelský → nejnižší HP → nejmíň karet v ruce.
// Když práh nepřekročí nikdo, nastupuje nouzové cílení (viz DESPERATE_ENEMY_P): pořadí
// zůstává stejné (od nejpravděpodobnějšího nepřítele), jen se propustí i záporná
// nepřátelskost – kromě hráčů, kteří nepřítelem prakticky být nemůžou.
function rankEnemies(state, myIndex, beliefs, requireReach) {
    const me = state.players[myIndex];
    const opts = hostOpts(state, beliefs, myIndex);
    const all = [];
    state.players.forEach((p, idx) => {
        if (idx === myIndex || p.health <= 0) return;
        if (requireReach && !computeCanHit(state, myIndex, idx)) return;
        all.push({ idx, h: expectedHostility(me.role, beliefs[idx], opts),
                   ep: enemyProbability(me.role, beliefs[idx], opts),
                   health: p.health, hand: p.hand.length });
    });
    let list = all.filter(e => e.h > ENEMY_EPS);
    if (list.length === 0) list = all.filter(e => e.ep >= DESPERATE_ENEMY_P);
    list.sort((a, b) => b.h - a.h || a.health - b.health || a.hand - b.hand);
    return list;
}

function weaponRange(w) { return (w && (w.range || w.props?.range)) || 1; }

// Dostřel, který zbraň PRÁVĚ dává. Laso (Fistful) ruší karty na stole, takže se střílí
// na 1 jako s Coltem – bez tohohle by bot mířil dál, server by výstřel odmítl a bot by
// stejnou akci posílal donekonečna (= zaseknutá hra).
function weaponReach(state, w) { return boardDeadFor(state) ? 1 : weaponRange(w); }

// Hodnota zbraně pro bota. Volcanic má dostřel 1, zato dovolí neomezené Bang! za tah –
// v praxi je silnější než Schofield (2), takže se nesmí porovnávat jen podle dostřelu
// (jinak by ho bot nikdy nevyložil na Colt .45 a hned by ho vyměnil za cokoli delšího).
function weaponValue(w) {
    if (!w) return 0;
    if ((w.name || '').includes('Volcanic')) return 2.5;
    return weaponRange(w);
}

// Jak moc karta na STOLE prospívá svému majiteli (kladné = pomáhá, záporné = škodí).
// Podle toho se pozná, co má smysl nepříteli zničit/ukrást (Vězení a Dynamit mu naopak
// sundat NEchceme – tím bychom mu pomohli) a co spojenci, když ho Rvačka nutí odhodit.
function boardCardValue(card) {
    if (!card) return 0;
    if (card.type === T.DYNAMITE) return -3;
    if (card.type === T.JAIL) return -2;
    if (card.type === T.BARREL) return 3;
    if (card.type === T.WEAPON) return weaponValue(card);
    if (card.green) return 2;
    if (card.type === T.EQUIPMENT) return 2;
    return 1;
}

// Má cíl vůbec něco, co stojí za zničení/ukradení? Pouhé „něco má" nestačí: hráč,
// kterému na stole leží jen Vězení, sice kartu má, ale odhodit mu ji znamená pustit ho
// z vězení. Takový cíl pro Cat Balou/Paniku/Kankán/Ragtime nechceme vybírat vůbec.
function _hasWorthTaking(p) {
    return p.hand.length > 0 || (p.weapon && p.weapon.id !== -1)
        || (p.board || []).some(c => boardCardValue(c) > 0);
}

// ── Hodnota karty pro DISCARD (nižší = odhodit dřív) ─────────────────────────
function keepScore(card) {
    if (card.type === T.DYNAMITE) return 0;   // dynamit pryč jako první (ale radši ho zahrajeme)
    if (card.type === T.JAIL) return 2;
    if (card.discardExtra) return 4;          // Springfield/Tequila/Whisky/Ragtime/Rvačka
    if (card.green) return card.activate === 'miss' ? 6 : 5;  // zelené DC karty na stůl
    if (card.bangEffect) return 6;            // Úder a spol.
    switch (card.type) {
        case T.STAGECOACH: case T.WELLS_FARGO: case T.STORE: case T.SALOON: return 3;
        case T.PANIC: case T.CAT_BALOU: case T.DUEL: case T.GATLING: case T.INDIANS: return 4;
        case T.WEAPON: case T.BARREL: case T.EQUIPMENT: return 5;
        case T.BANG: case T.MISSED: case T.UHYB: return 6;
        case T.BEER: return 7;
        default: return 1;
    }
}

// ── Priorita postav při výběru (vyšší = lepší) ───────────────────────────────
const CHAR_RANK = {
    'Willy the Kid': 10, 'Slab the Killer': 10, 'Calamity Janet': 9,
    'Bart Cassidy': 8, 'Jesse Jones': 8, 'Rose Doolan': 8, 'Paul Regret': 7,
    'Suzy Lafayette': 7, 'Kit Carlson': 7, 'Lucky Duke': 7, 'Jourdonnais': 6,
    'El Gringo': 6, 'Pedro Ramirez': 6, 'Black Jack': 5, 'Sid Ketchum': 5,
    'Vulture Sam': 4,
    // Dodge City (aktivní schopnosti Chuck/José/Doc už bot proaktivně používá)
    'Elena Fuente': 9, 'Molly Stark': 8, 'Pixie Pete': 8, 'Bill Noface': 7,
    'Doc Holyday': 8, 'Chuck Wengam': 7, 'José Delgado': 7, 'Pat Brennan': 6,
    'Tequila Joe': 6, 'Greg Digger': 5, 'Herb Hunter': 5, 'Sean Mallory': 5,
    'Apache Kid': 8, 'Belle Star': 7, 'Vera Custer': 6,
};
function pickCharacter(choices) {
    return [...choices].sort((a, b) => (CHAR_RANK[b] || 0) - (CHAR_RANK[a] || 0))[0];
}

// Navazující hra: nechá si přeživší bot svou postavu? Dřív bral vždycky, takže u stolu
// seděly pořád tytéž postavy. Teď se rozhoduje náhodně a šance roste s kvalitou postavy:
// silná ~80 %, průměrná ~50 %, slabá ~20 %.
function keepCharacterChance(charName) {
    const rank = CHAR_RANK[charName] || 5;
    return Math.min(0.8, Math.max(0.2, (rank - 2) / 10));
}
function decideKeepCharacter(charName, rnd = Math.random) {
    return rnd() < keepCharacterChance(charName);
}

// ── Výběr cílové karty pro Panika!/Cat Balou (kind SELECTING_TARGET_CARD) ─────
// `friendly` = cíl je (pravděpodobný) spojenec. Nastane u Rvačky, která nutí odhodit
// kartu i kamarádovi: tomu sundáme něco, co mu spíš škodí (Vězení/Dynamit), a jinak
// sáhneme do ruky – zničit mu zbraň nebo barel by byla vlastní branka.
function chooseTargetCardArea(target, sourceType, friendly = false) {
    const hasWeapon = target.weapon && target.weapon.id !== -1;
    const board = target.board || [];
    // Nejcennější / nejméně cenná karta na stole (podle boardCardValue).
    const pickBoard = (cmp) => {
        let bi = -1;
        board.forEach((c, i) => { if (bi === -1 || cmp(boardCardValue(c), boardCardValue(board[bi]))) bi = i; });
        return bi;
    };
    const bestIdx = pickBoard((a, b) => a > b);
    const worstIdx = pickBoard((a, b) => a < b);

    if (friendly) {
        const bad = board.findIndex(c => boardCardValue(c) < 0);
        if (bad !== -1) return { area: 'board', cardIdx: bad };   // Vězení/Dynamit pryč = pomoc
        if (target.hand.length > 0) return { area: 'hand', cardIdx: null };
        if (worstIdx !== -1) return { area: 'board', cardIdx: worstIdx };
        return hasWeapon ? { area: 'weapon', cardIdx: null } : { area: 'hand', cardIdx: null };
    }

    if (sourceType === T.PANIC) {
        // Panika/krádež → líznout z ruky je nejlepší (získám neznámou kartu).
        if (target.hand.length > 0) return { area: 'hand', cardIdx: null };
        if (hasWeapon) return { area: 'weapon', cardIdx: null };
        if (bestIdx !== -1 && boardCardValue(board[bestIdx]) > 0) return { area: 'board', cardIdx: bestIdx };
        if (board.length) return { area: 'board', cardIdx: 0 };   // zbylo jen Vězení/Dynamit
        return { area: 'hand', cardIdx: null };
    }

    // Cat Balou/odhoz → znič nejcennější trvalou hodnotu; Vězení a Dynamit nech ležet
    // (odhodit je nepříteli by mu jen pomohlo) a sáhni radši do ruky.
    const bestBoard = bestIdx !== -1 ? boardCardValue(board[bestIdx]) : -Infinity;
    if (hasWeapon && weaponValue(target.weapon) >= bestBoard) return { area: 'weapon', cardIdx: null };
    if (bestBoard > 0) return { area: 'board', cardIdx: bestIdx };
    if (target.hand.length > 0) return { area: 'hand', cardIdx: null };
    if (board.length) return { area: 'board', cardIdx: bestIdx !== -1 ? bestIdx : 0 };
    return { area: 'hand', cardIdx: null };
}

// Nouzový cíl Odražené střely: KTERÁKOLI vyložená karta u stolu. Používá se jen tam,
// kde pravidlo bota do výstřelu nutí (Právo západu) a bestRicochetShot nic nevrátil,
// protože žádná karta nestojí za sestřelení – ale odmítnout se nedá.
function anyRicochetShot(state, myIndex) {
    const from = (i) => {
        const p = state.players[i];
        if (!ricochetTargetOk(state, myIndex, i)) return null;
        if (p.weapon && p.weapon.id !== -1) return { idx: i, area: 'weapon', cardId: p.weapon.id };
        const c = (p.board || [])[0];
        return c ? { idx: i, area: 'board', cardId: c.id } : null;
    };
    for (let i = 0; i < state.players.length; i++) { const r = from(i); if (r) return r; }
    return null;
}

// ── A Fistful of Cards – Odražená střela ────────────────────────────────────
// Kterou vyloženou kartu sestřelit? Bere se ta nejcennější PRO MAJITELE (boardCardValue),
// a jen když mu opravdu pomáhá: Vězení ani Dynamit se nestřílí, tím bychom nepříteli
// jen posloužili (stejná úvaha jako u Cat Balou v chooseTargetCardArea).
function bestRicochetShot(state, myIndex, beliefs) {
    let best = null;
    rankEnemies(state, myIndex, beliefs, false).forEach(e => {
        if (!ricochetTargetOk(state, myIndex, e.idx)) return;
        const p = state.players[e.idx];
        const take = (area, card) => {
            if (!card) return;
            const v = boardCardValue(card);
            if (v <= 1) return;   // Colt/Vězení/Dynamit a jiné drobnosti nestojí za kartu
            if (!best || v > best.value) best = { idx: e.idx, area, cardId: card.id, value: v };
        };
        if (p.weapon && p.weapon.id !== -1) take('weapon', p.weapon);
        (p.board || []).forEach(c => take('board', c));
    });
    return best;
}

// Stojí ohrožená karta za to, aby se za ni obětovalo Vedle!? Vězení a Dynamit záměrně
// ne – ty ať klidně odletí (majiteli tím prospějí). Zrcadlí bestRicochetShot.
function ricochetWorthDefending(state, ric) {
    const p = state.players[ric.targetIdx];
    if (!p) return false;
    const card = ric.area === 'weapon'
        ? (p.weapon && p.weapon.id !== -1 ? p.weapon : null)
        : (p.board || []).find(c => c && c.id === ric.cardId);
    return !!card && boardCardValue(card) >= 2;
}

// Daltonové (High Noon): kterou ze SVÝCH modrých karet bot odhodí. Modrá = výzbroj +
// karty na stole kromě zelených; jde ta s nejnižší hodnotou pro majitele, takže Dynamit
// (−3) a Vězení (−2) odletí jako první – což je i takticky správně.
function daltonsDiscard(p) {
    let best = null, bestVal = Infinity;
    (p.board || []).forEach((c, i) => {
        if (c.green) return;
        const v = boardCardValue(c);
        if (v < bestVal) { bestVal = v; best = { area: 'board', cardIdx: i }; }
    });
    if (p.weapon && p.weapon.id !== -1 && weaponValue(p.weapon) < bestVal) {
        best = { area: 'weapon', cardIdx: null };
    }
    return best || { area: 'board', cardIdx: 0 };
}

// ── Hlavní rozhodování pro fázi PLAY: vrať akci pro jednu nejlepší kartu, nebo end_turn ──
// Jedna KONKRÉTNÍ karta z ruky → akce, kterou server přijme. Používá se jen na kartu
// vynucenou Právem západu, takže smí sáhnout i po cíli, který by si bot dobrovolně nevybral:
// pravidlo ho k tomu nutí. Cíl proto hledá „nejdřív nejpravděpodobnější nepřítel, jinak
// kdokoli platný", ne přes práh nepřátelskosti – jinak by se hra zasekla ve chvíli, kdy
// bot u stolu žádného nepřítele nevidí. Vrací null, když cíl neexistuje (lawForcedCard
// takovou kartu zároveň nevynucuje, takže se to nemá stát).
function forcedLawIntent(state, myIndex, beliefs, card, cardIdx) {
    const me = state.players[myIndex];
    const alive = (i) => i !== myIndex && state.players[i].health > 0;
    const hasCards = (p) => p.hand.length > 0 || (p.weapon && p.weapon.id !== -1) || (p.board || []).length > 0;
    const pick = (ok) => {
        const ranked = rankEnemies(state, myIndex, beliefs, false).find(e => ok(e.idx));
        if (ranked) return ranked.idx;
        for (let i = 0; i < state.players.length; i++) if (ok(i)) return i;
        return -1;
    };
    const special = (targetIdx) => ({ event: 'play_special', payload: { attackerIdx: myIndex, targetIdx, cardIdx } });

    switch (getActionForCard(card, effectiveCharacter(me))) {
        case 'SHOOT': {
            // Vyčerpaný limit 1× Bang!/tah: na POSTAVU se střílet nedá (playBang by akci
            // mlčky zahodil), karta je ale pořád vynucená. Zbývají Odstřelovač a Odražená
            // střela – ani jedno se do limitu nepočítá (FAQ Q07/Q09), a právě kvůli nim
            // ji cardPlayability vůbec pustila. Bez téhle větve by bot posílal odmítaný
            // play_bang donekonečna a hra by se zasekla.
            // Pojistka do budoucna: Právo západu je ze stejného balíčku jako obě karty,
            // takže dnes naráz aktivní být nemůžou a tahle větev je nedosažitelná.
            if (!bangAtPlayerOk(state, me, myIndex, card)) {
                if (sniperOffer(state, me, myIndex, card)) {
                    const st = pick(i => alive(i) && computeCanHit(state, myIndex, i));
                    if (st !== -1) return { event: 'sniper_choose', payload: { cardIdx, targetIdx: st } };
                }
                if (ricochetOffer(state, me, myIndex, card)) {
                    const shot = bestRicochetShot(state, myIndex, beliefs) || anyRicochetShot(state, myIndex);
                    if (shot) return { event: 'play_ricochet', payload: { attackerIdx: myIndex,
                        targetIdx: shot.idx, area: shot.area, cardId: shot.cardId, cardIdx } };
                }
                return null;
            }
            const reach = bangEffectReach(card);
            const t = pick(i => alive(i) && computeCanHit(state, myIndex, i, reach));
            // Právo západu: když nedosáhne na NIKOHO jiného, musí střelit sám na sebe
            // (zrcadlo lawSelfShootOnly v core/playability.js). Bez toho by se hra
            // zasekla: end_turn server odmítne a jinou kartu zahrát nesmí.
            const tgt = t === -1 ? myIndex : t;
            return { event: 'play_bang', payload: { attackerIdx: myIndex, targetIdx: tgt, cardIdx } };
        }
        case T.JAIL: {
            const sheriffIdx = state.players.findIndex(p => p.role === 'Sheriff');
            const t = pick(i => alive(i) && i !== sheriffIdx && !(state.players[i].board || []).some(c => c.type === T.JAIL));
            return t === -1 ? null : special(t);
        }
        case T.DUEL: {
            const t = pick(alive);
            return t === -1 ? null : special(t);
        }
        case T.PANIC:
        case T.CAT_BALOU: {
            const maxDist = card.type === T.PANIC ? 1 : Infinity;
            const t = pick(i => alive(i) && hasCards(state.players[i]) && computeDistance(state, myIndex, i) <= maxDist);
            return t === -1 ? null : special(t);
        }
        case 'DE_BANG': {
            const t = pick(alive);
            return t === -1 ? null : { event: 'discard_extra_choose', payload: { cardIdx, targetIdx: t } };
        }
        case 'DE_STEAL': {
            const t = pick(i => alive(i) && hasCards(state.players[i]));
            if (t === -1) return null;
            const a = chooseTargetCardArea(state.players[t], T.PANIC);
            return { event: 'discard_extra_choose', payload: { cardIdx, targetIdx: t, area: a.area, boardIdx: a.cardIdx ?? 0 } };
        }
        case 'DE_HEAL': {
            const t = (isInPlay(me) && me.health < me.maxHealth) ? myIndex
                : state.players.findIndex((p, i) => alive(i) && p.health < p.maxHealth);
            return t === -1 ? null : { event: 'discard_extra_choose', payload: { cardIdx, targetIdx: t } };
        }
        case 'DE_DECK':
            return { event: 'discard_extra_choose', payload: { cardIdx } };
        default:
            // Netargetované karty i modré/zelené na stůl – play_card(index) stačí.
            return { event: 'play_card', payload: cardIdx };
    }
}

function decidePlay(state, myIndex, beliefs) {
    const me = state.players[myIndex];
    const n = state.players.length;
    const sheriffIdx = state.players.findIndex(p => p.role === 'Sheriff'); // veřejná info (hvězda)

    // A Fistful of Cards – Právo západu: odkrytou druhou lízanou kartu MUSÍ hráč zahrát,
    // dokud to jde – server jinak tah neukončí (tryEndTurn). Ptáme se stejným helperem,
    // takže se bot nemůže zaseknout na tiše odmítnutém end_turn.
    const forced = lawForcedCard(state, me, myIndex);
    if (forced) {
        const intent = forcedLawIntent(state, myIndex, beliefs, forced.card, forced.idx);
        if (intent) return intent;
    }
    let best = { score: 0, intent: { event: 'end_turn' } };
    const consider = (score, intent) => { if (score > best.score) best = { score, intent }; };

    // Počet ostatních živých hráčů, které bot považuje za nepřátele vs. spojence (pro AoE).
    const aoeBalance = () => {
        let pos = 0, neg = 0;
        state.players.forEach((p, idx) => {
            if (idx === myIndex || p.health <= 0) return;
            const h = hostilityOf(state, myIndex, idx, beliefs);
            if (h > ENEMY_EPS) pos++; else if (h < -ENEMY_EPS) neg++;
        });
        return { pos, neg };
    };

    // ── Karty v ruce ──────────────────────────────────────────────────────────
    me.hand.forEach((card, i) => {
        if (cardPlayability(state, me, myIndex, card) !== true) return;
        const action = getActionForCard(card, effectiveCharacter(me));

        if (action === 'SHOOT') {
            // Fistful – Odstřelovač: dvě karty Bang! naráz, ubránit se lze JEN dvěma
            // Vedle!. Vyplatí se na nepřítele s chudou rukou – tam je šance, že dvě
            // Vedle! nemá. Přebíjí obyčejný výstřel (vyšší skóre).
            if (sniperOffer(state, me, myIndex, card)) {
                const st = rankEnemies(state, myIndex, beliefs, false)
                    .find(e => e.hand <= 2 && computeCanHit(state, myIndex, e.idx));
                if (st) consider(56 + (5 - Math.min(st.health, 5)),
                    { event: 'sniper_choose', payload: { cardIdx: i, targetIdx: st.idx } });
            }
            // Fistful – Odražená střela: sestřel nepříteli barel/zbraň/vybavení. Do limitu
            // 1× Bang!/tah se to nepočítá (R2), takže je to samostatná možnost – a jediná,
            // která zbývá, když už limit padl (proto je karta hratelná, viz cardPlayability).
            if (ricochetOffer(state, me, myIndex, card)) {
                const shot = bestRicochetShot(state, myIndex, beliefs);
                if (shot) consider(28 + shot.value, { event: 'play_ricochet',
                    payload: { attackerIdx: myIndex, targetIdx: shot.idx, area: shot.area,
                               cardId: shot.cardId, cardIdx: i } });
            }
            // Výstřel na POSTAVU jen s volným limitem – cardPlayability kartu pouští i bez
            // něj (kvůli Odražené střele), server by ale play_bang mlčky zahodil.
            if (!bangAtPlayerOk(state, me, myIndex, card)) return;
            const reach = bangEffectReach(card);
            const tgt = rankEnemies(state, myIndex, beliefs, false)
                .find(e => computeCanHit(state, myIndex, e.idx, reach));
            if (tgt) consider(50 + (5 - Math.min(tgt.health, 5)),
                { event: 'play_bang', payload: { attackerIdx: myIndex, targetIdx: tgt.idx, cardIdx: i } });
            return;
        }

        if (action === T.JAIL) {
            const tgt = rankEnemies(state, myIndex, beliefs, false)
                .find(e => e.idx !== sheriffIdx      // Vězení nesmí na (veřejného) šerifa
                    && !(state.players[e.idx].board || []).some(c => c.type === T.JAIL));
            if (tgt) consider(30,
                { event: 'play_special', payload: { attackerIdx: myIndex, targetIdx: tgt.idx, cardIdx: i } });
            return;
        }

        if (action === T.DUEL) {
            const tgt = rankEnemies(state, myIndex, beliefs, false)[0];
            if (tgt) consider(26,
                { event: 'play_special', payload: { attackerIdx: myIndex, targetIdx: tgt.idx, cardIdx: i } });
            return;
        }

        if (action === T.PANIC || action === T.CAT_BALOU) {
            const maxDist = action === T.PANIC ? 1 : Infinity;
            const tgt = rankEnemies(state, myIndex, beliefs, false).find(e =>
                _hasWorthTaking(state.players[e.idx]) && computeDistance(state, myIndex, e.idx) <= maxDist);
            if (tgt) consider(action === T.CAT_BALOU ? 22 : 18,
                { event: 'play_special', payload: { attackerIdx: myIndex, targetIdx: tgt.idx, cardIdx: i } });
            return;
        }

        // ── Dodge City „odhoď další kartu" (cena = jedna postradatelná karta navíc) ──
        if (action === 'DE_BANG') { // Springfield: bang-efekt na libovolného nepřítele
            const tgt = rankEnemies(state, myIndex, beliefs, false)[0];
            if (tgt) consider(30, { event: 'discard_extra_choose', payload: { cardIdx: i, targetIdx: tgt.idx } });
            return;
        }
        if (action === 'DE_STEAL') { // Ragtime: ukradni kartu libovolnému nepříteli
            const tgt = rankEnemies(state, myIndex, beliefs, false).find(e => _hasWorthTaking(state.players[e.idx]));
            if (tgt) {
                const a = chooseTargetCardArea(state.players[tgt.idx], T.PANIC);
                consider(24, { event: 'discard_extra_choose', payload: { cardIdx: i, targetIdx: tgt.idx, area: a.area, boardIdx: a.cardIdx ?? 0 } });
            }
            return;
        }
        if (action === 'DE_HEAL') { // Tequila: +1 sobě nebo zraněnému spojenci
            let tIdx = null;
            if (isInPlay(me) && me.health < me.maxHealth) tIdx = myIndex;   // duch se léčit smí
            else {
                const ally = state.players.findIndex((p, idx) => idx !== myIndex && p.health > 0
                    && p.health < p.maxHealth && hostilityOf(state, myIndex, idx, beliefs) < -ENEMY_EPS);
                if (ally !== -1) tIdx = ally;
            }
            if (tIdx !== null) consider(me.health <= 2 ? 26 : 10, { event: 'discard_extra_choose', payload: { cardIdx: i, targetIdx: tIdx } });
            return;
        }
        if (action === 'DE_DECK') { // Whisky (heal_self_2) / Rvačka (brawl) – cíl implicitní
            if (card.discardExtra === 'heal_self_2') {
                if (me.health < me.maxHealth) consider(me.health <= 2 ? 28 : 10, { event: 'discard_extra_choose', payload: { cardIdx: i } });
            } else if (card.discardExtra === 'brawl') {
                const { pos, neg } = aoeBalance();
                if (pos >= 1 && pos > neg) consider(20, { event: 'discard_extra_choose', payload: { cardIdx: i } });
            }
            return;
        }

        // ── Zelené karty (DC): z ruky se jen VYLOŽÍ na stůl (aktivují se pak ze stolu) ──
        if (card.green) {
            consider(card.activate === 'miss' ? 16 : 12, { event: 'play_card', payload: i });
            return;
        }

        // ── Dynamit: pošli ho „po proudu", jen když jsou tam spíš nepřátelé (neohrožuj spojence) ──
        if (card.type === T.DYNAMITE) {
            let lean = 0, w = 1;
            for (let k = 1; k < n; k++) {
                const idx = (myIndex + k) % n;
                if (state.players[idx].health <= 0) continue;
                lean += w * Math.sign(hostilityOf(state, myIndex, idx, beliefs));
                w *= 0.6;
            }
            if (lean > 0) consider(15, { event: 'play_card', payload: i });
            return;
        }

        // PLAY_CARD (netargetované) i zbylé PLAY_BLUE (Zbraň/Barel/Vybavení) řeší play_card(index).
        const intent = { event: 'play_card', payload: i };

        if (card.type === T.BEER) {
            if (me.health < me.maxHealth) consider(me.health <= 1 ? 100 : (me.health <= 2 ? 30 : 6), intent);
            return;
        }
        if (card.type === T.SALOON) { if (me.health < me.maxHealth) consider(8, intent); return; }
        if (card.type === T.WEAPON) {
            // Jednu zbraň za tah stačí – další si nech „v zásobě" na příští tah. Bez
            // tohohle bot v jednom tahu vyložil Schofield a hned na něj Remington
            // (zahodí tím kartu, kterou mohl vyložit později).
            if (me.weapon?._playedTurn === state.turnId) return;
            const newV = weaponValue(card), curV = weaponValue(me.weapon);
            // Skóre roste s hodnotou zbraně, aby si bot z ruky vybral tu NEJLEPŠÍ
            // (dřív měly všechny stejné skóre a vyhrála první v ruce).
            if (newV > curV) consider(35 + newV, intent);
            return;
        }
        if (card.type === T.BARREL) { consider(25, intent); return; }
        if (card.type === T.EQUIPMENT) { consider(20, intent); return; }
        if (card.type === T.STAGECOACH || card.type === T.WELLS_FARGO || card.type === T.STORE) { consider(22, intent); return; }
        if (card.type === T.GATLING || card.type === T.INDIANS) {
            const { pos, neg } = aoeBalance();
            if (pos >= 1 && pos > neg) consider(35, intent);
            return;
        }
    });

    // ── Aktivace zelených karet už ležících na stole (z minulých tahů) ──────────
    // Laso (Fistful): karty na stole nemají efekt → server aktivaci odmítne (stall).
    if (!boardDeadFor(state)) (me.board || []).forEach(card => {
        if (!card.green || card._playedTurn === state.turnId || card.activate === 'miss') return;
        // Želízka (High Noon) aktivaci neomezují – karta už leží ve hře (viz _suitBlocked).
        const cardId = card.id;
        if (card.bangEffect) {
            if (card.range === 'mass') {           // Houfnice = útok na všechny (jako Kulomet)
                const { pos, neg } = aoeBalance();
                if (pos >= 1 && pos > neg) consider(34, { event: 'activate_green_card', payload: { playerIdx: myIndex, cardId } });
                return;
            }
            let reach;
            if (card.range === 'any') reach = Infinity;
            else if (typeof card.range === 'number') reach = card.range;
            else reach = weaponReach(state, me.weapon);   // 'weapon' = dostřel zbraně
            const tgt = rankEnemies(state, myIndex, beliefs, false)
                .find(e => computeDistance(state, myIndex, e.idx) <= reach);
            if (tgt) consider(46, { event: 'activate_green_card', payload: { playerIdx: myIndex, cardId, target: { targetIdx: tgt.idx } } });
            return;
        }
        if (card.activate === 'steal_any' || card.activate === 'discard_any') {
            const tgt = rankEnemies(state, myIndex, beliefs, false).find(e => _hasWorthTaking(state.players[e.idx]));
            if (tgt) {
                const a = chooseTargetCardArea(state.players[tgt.idx], card.activate === 'steal_any' ? T.PANIC : T.CAT_BALOU);
                consider(24, { event: 'activate_green_card', payload: { playerIdx: myIndex, cardId, target: { targetIdx: tgt.idx, area: a.area, boardIdx: a.cardIdx ?? 0 } } });
            }
            return;
        }
        if (card.activate === 'heal_self') {
            // Mimo hru (mrtvý) by server kartu neaktivoval a bot by ji vybíral pořád dokola
            // (stav by se nezměnil = zaseknutá hra). Duch (Město duchů) ve hře je.
            if (isInPlay(me) && me.health < me.maxHealth) consider(me.health <= 2 ? 28 : 8, { event: 'activate_green_card', payload: { playerIdx: myIndex, cardId } });
            return;
        }
        if (card.activate === 'draw_3') {
            consider(22, { event: 'activate_green_card', payload: { playerIdx: myIndex, cardId } });
            return;
        }
    });

    // ── Aktivní schopnosti postav (Dodge City) ─────────────────────────────────
    const ch = effectiveCharacter(me);
    if (ch === 'Chuck Wengam' && me.health >= 3 && me.hand.length <= 2) {
        consider(28, { event: 'chuck_wengam' });        // ztrať 1 HP → lízni 2 (když jsi na kartách chudý)
    }
    if (ch === 'José Delgado' && (me._joseUses || 0) < 2) {
        let blueIdx = -1, blueScore = Infinity;
        me.hand.forEach((c, i) => { if (isBlueCard(c) && keepScore(c) < blueScore) { blueScore = keepScore(c); blueIdx = i; } });
        if (blueIdx !== -1) consider(18, { event: 'jose_delgado', payload: { cardIdx: blueIdx } });
    }
    // Uncle Will (Fistful): 1× za tah zahraje libovolnou kartu jako Hokynářství. Vyplatí
    // se to hlavně z přebytku – karta, kterou by stejně odhodil na konci tahu, se změní
    // v novou z balíčku (a vybírá si první). Podmínky musí sedět se serverem
    // (useUncleWill), jinak by server akci odmítl a bot ji zkoušel donekonečna.
    if (ch === 'Uncle Will' && me._willUsedTurn !== state.turnId && me.hand.length > me.health) {
        let idx = -1, low = Infinity;
        me.hand.forEach((c, i) => {
            if (suitBlockedFor(state, myIndex, c)) return;   // Želízka
            if (keepScore(c) < low) { low = keepScore(c); idx = i; }
        });
        if (idx !== -1) consider(16, { event: 'uncle_will', payload: { cardIdx: idx } });
    }
    if (ch === 'Doc Holyday' && !me._docUsed && me.hand.length >= 3) {
        const reach = weaponReach(state, me.weapon);
        const tgt = rankEnemies(state, myIndex, beliefs, false).find(e => computeDistance(state, myIndex, e.idx) <= reach);
        if (tgt) {
            // Zaplať dvěma nejméně cennými kartami.
            const order = me.hand.map((c, i) => i).sort((a, b) => keepScore(me.hand[a]) - keepScore(me.hand[b]));
            consider(28, { event: 'doc_holyday', payload: { cardIndices: [order[0], order[1]], targetIdx: tgt.idx } });
        }
    }

    return best.intent;
}

// ── Hlavní vstup ─────────────────────────────────────────────────────────────
function decideBotAction(state, myIndex, beliefs) {
    const me = state.players[myIndex];
    if (!me) return null;

    // Výběr postavy / ponechání přeživší postavy řešíme podle konkrétního hráče.
    if (state.phase === 'CHARACTER_SELECT') {
        if (me._awaitingKeepChoice) {
            return { event: 'keep_character', payload: decideKeepCharacter(me._survivorChar) };
        }
        if (!me.character && me.charChoices?.length) {
            return { event: 'select_character', payload: pickCharacter(me.charChoices) };
        }
        return null;
    }

    const pa = pendingActor(state);
    if (!pa || pa.idx !== myIndex) return null;

    // Beliefy si v testech/serveru předá volající; kdyby chyběly, spočítej z prázdného ledgeru.
    if (!beliefs) beliefs = computeBeliefs(state, state.behaviorLedger || { pairs: {} }, myIndex);

    switch (pa.kind) {
        case 'PLAY':
            return decidePlay(state, myIndex, beliefs);

        case 'DISCARD': {
            let worst = 0;
            me.hand.forEach((c, i) => { if (keepScore(c) < keepScore(me.hand[worst])) worst = i; });
            return { event: 'discard_card', payload: worst };
        }

        case 'RESPOND': {
            const req = state.pendingResponse.requiredCard;
            // Fistful – Odražená střela: v sázce není život, ale konkrétní vyložená karta.
            // Vedle! je cennější než většina z nich, takže se brání jen to, co za to stojí
            // (Vězení/Dynamit ať klidně odletí). Pivo ani Sid tady zachránit nemůžou –
            // server je odmítne (viz beerLastLifeSave), takže se o ně ani nepokoušej.
            const _rico = state.pendingResponse.ricochet;
            if (_rico && !ricochetWorthDefending(state, _rico)) {
                return { event: 'respond_to_card', payload: { playerIdx: myIndex, cardIndex: null } };
            }
            // Kazatel (High Noon): ve svém tahu nesmí hráč zahrát Bang! ani jako odpověď
            // v duelu (FAQ H2) – server by kartu odmítl a bot by to zkoušel donekonečna.
            const bangBanned = req === T.BANG && bangBlockedFor(state, myIndex);
            // Želízka (High Noon): ve vlastním tahu (duel) projde jen zvolená barva.
            const isDodge = (c) => !suitBlockedFor(state, myIndex, c) && (req === T.MISSED
                ? (c.type === T.MISSED || c.type === T.UHYB || (effectiveCharacter(me) === 'Calamity Janet' && c.type === T.BANG) || effectiveCharacter(me) === 'Elena Fuente')
                : (!bangBanned && (c.type === T.BANG || (effectiveCharacter(me) === 'Calamity Janet' && c.type === T.MISSED))));
            const dodgeIdx = me.hand.findIndex(isDodge);
            if (dodgeIdx !== -1) return { event: 'respond_to_card', payload: { playerIdx: myIndex, cardIndex: dodgeIdx } };

            // Nelze uhnout z ruky – zkus zelenou Vedle!-kartu ze stolu (Železný plát/Bible/…).
            // Belle Star na svém tahu ruší cizí karty na stole → tehdy zelenou obranu nelze použít
            // (jinak by handleResponse kartu nespotřeboval a bot by ji zkoušel donekonečna = stall).
            const attacker = state.players[state.pendingResponse.originatorIdx];
            const belleIgnores = state.pendingResponse.originatorIdx === state.currentPlayerIndex
                && effectiveCharacter(attacker) === 'Belle Star';
            // Laso (Fistful) ruší karty na stole úplně stejně – a ze stejného důvodu.
            if (req === T.MISSED && !belleIgnores && !boardDeadFor(state)) {
                const greenMiss = (me.board || []).find(c => c.green && c.activate === 'miss'
                    && c._playedTurn !== state.turnId);
                if (greenMiss) return { event: 'respond_to_card', payload: { playerIdx: myIndex, cardIndex: null, boardCardId: greenMiss.id } };
            }

            // Pořád nelze uhnout — záchrana při posledním životě (Pivo / Sid Ketchum).
            const aliveCount = state.players.filter(p => p.health > 0).length;
            if (me.health === 1 && aliveCount > 2 && !_rico) {
                const beerIdx = beerBlockedFor(state) ? -1
                    : me.hand.findIndex(c => c.type === T.BEER && !suitBlockedFor(state, myIndex, c));
                if (beerIdx !== -1) return { event: 'respond_with_beer', payload: { playerIdx: myIndex, cardIdx: beerIdx } };
                if (effectiveCharacter(me) === 'Sid Ketchum' && me.hand.length >= 2) {
                    const order = me.hand.map((c, i) => i).sort((a, b) => keepScore(me.hand[a]) - keepScore(me.hand[b]));
                    return { event: 'sid_ketchum_discard_both', payload: { playerIdx: myIndex, cardIdx1: order[0], cardIdx2: order[1] } };
                }
            }
            return { event: 'respond_to_card', payload: { playerIdx: myIndex, cardIndex: null } };
        }

        case 'DRAW': {
            const ds = state.drawPhaseState;
            const opts = ds.options || ['deck'];
            // Pálenka (Fistful): vynechat celou fázi lízání za 1 život. Vyplatí se to jen
            // zraněnému, který už má co hrát – jinak jsou karty cennější. Duch (Město duchů)
            // o naléčený život na konci tahu zase přijde, takže si radši líže.
            if (ds.cardsDrawn === 0 && opts.includes('liquor') && !me._ghost &&
                me.health < me.maxHealth && me.hand.length >= 3) {
                return { event: 'draw_card', payload: { source: 'liquor', sourceIdx: null } };
            }
            if (ds.cardsDrawn === 0 && opts.includes('opponent_hand')) {
                const tgt = rankEnemies(state, myIndex, beliefs, false).find(e => state.players[e.idx].hand.length > 0);
                if (tgt) return { event: 'draw_card', payload: { source: 'opponent_hand', sourceIdx: tgt.idx } };
            }
            // Pat Brennan: místo lízání vezmi hodnotnou kartu ze STOLU nepřítele (zbraň/modrou).
            if (ds.cardsDrawn === 0 && opts.includes('board')) {
                const tgt = rankEnemies(state, myIndex, beliefs, false).find(e => {
                    const p = state.players[e.idx];
                    return (p.weapon && p.weapon.id !== -1) || (p.board || []).length > 0;
                });
                if (tgt) {
                    const p = state.players[tgt.idx];
                    if (p.weapon && p.weapon.id !== -1 && weaponRange(p.weapon) > 1) {
                        return { event: 'draw_card', payload: { source: 'board', sourceIdx: tgt.idx, area: 'weapon', cardIdx: null } };
                    }
                    if ((p.board || []).length > 0) {
                        return { event: 'draw_card', payload: { source: 'board', sourceIdx: tgt.idx, area: 'board', cardIdx: 0 } };
                    }
                    if (p.weapon && p.weapon.id !== -1) {
                        return { event: 'draw_card', payload: { source: 'board', sourceIdx: tgt.idx, area: 'weapon', cardIdx: null } };
                    }
                }
            }
            if (ds.cardsDrawn === 0 && opts.includes('discard')) {
                const top = state.deck?.discardPile?.[state.deck.discardPile.length - 1];
                if (top && [T.BANG, T.BEER, T.MISSED].includes(top.type)) {
                    return { event: 'draw_card', payload: { source: 'discard', sourceIdx: null } };
                }
            }
            return { event: 'draw_card', payload: { source: 'deck', sourceIdx: null } };
        }

        case 'KIT_CARLSON': {
            const kc = state.kitCarlsonState;
            const picked = kc.pickedIds || [];
            let bestIdx = -1, bestVal = -1;
            kc.revealed.forEach((c, i) => {
                if (picked.includes(c.id)) return;
                const v = keepScore(c);
                if (v > bestVal) { bestVal = v; bestIdx = i; }
            });
            return { event: 'kit_carlson_pick', payload: bestIdx };
        }

        case 'BLACK_JACK_CHECK':
            return { event: 'resolve_black_jack', payload: true };

        // Fistful – Claus "The Saint": z odkryté řady si nejdřív bere karty pro sebe,
        // pak dává po jedné ostatním. Komu, to je dané pořadím (cs.toIdx) – vybírá se
        // jen KTEROU kartu: sobě tu nejcennější, ostatním tu nejméně cennou.
        case 'CLAUS_GIVE': {
            const cs = state.clausState;
            const mine = cs.toIdx === state.currentPlayerIndex;
            let bestIdx = -1, bestVal = 0;
            (cs.revealed || []).forEach((c, i) => {
                if (!c || cs.picked.includes(i)) return;
                const v = keepScore(c);
                if (bestIdx === -1 || (mine ? v > bestVal : v < bestVal)) { bestIdx = i; bestVal = v; }
            });
            return { event: 'claus_give', payload: { cardIdx: bestIdx } };
        }

        case 'STORE': {
            let bestIdx = -1, bestVal = -1;
            (state.storeCards || []).forEach((c, i) => {
                if (!c) return;
                const v = keepScore(c);
                if (v > bestVal) { bestVal = v; bestIdx = i; }
            });
            return { event: 'store_pick', payload: { cardIdx: bestIdx } };
        }

        case 'BARREL_DRAW':  return { event: 'trigger_barrel_draw' };
        case 'CHECK_DRAW':   return { event: 'trigger_check_draw' };
        case 'CHECKING':     return { event: 'resolve_check' };

        case 'LUCKY_DUKE': {
            const cards = state.luckyDukeState.cards;
            const reason = state.luckyDukeState.checkContext.reason;
            const num = (v) => ({ J: 11, Q: 12, K: 13, A: 14 }[v] ?? parseInt(v));
            // Barva podle toho, co PLATÍ (Požehnání/Prokletí přebíjí vytištěnou).
            const favorable = (c) => reason === 'DYNAMITE'
                ? !(effSuit(state, c) === SPADES && num(c.value) >= 2 && num(c.value) <= 9) // chci NE „spades 2–9"
                : effSuit(state, c) === HEARTS;                                             // barel/vězení: chci srdce
            const idx = cards.findIndex(favorable);
            return { event: 'lucky_duke_pick', payload: idx !== -1 ? idx : 0 };
        }

        case 'DYNAMITE_DAMAGE': {
            const aliveCount = state.players.filter(p => p.health > 0).length;
            if (me.health === 1 && aliveCount > 2 && !beerBlockedFor(state)) {
                const beerIdx = me.hand.findIndex(c => c.type === T.BEER);
                if (beerIdx !== -1) return { event: 'beer_dynamite_save', payload: { playerIdx: myIndex, cardIdx: beerIdx } };
            }
            return { event: 'take_dynamite_hit' };
        }

        // High Noon – Pravé poledne: ztráta života na začátku tahu. Na posledním životě
        // se zachraň Pivem (pokud ho Reverend zrovna nezakazuje), jinak schytej zásah.
        case 'NOON_DAMAGE': {
            const aliveCount = state.players.filter(p => p.health > 0).length;
            if (me.health === 1 && aliveCount > 2 && !beerBlockedFor(state)) {
                const beerIdx = me.hand.findIndex(c => c.type === T.BEER);
                if (beerIdx !== -1) return { event: 'beer_noon_save', payload: { playerIdx: myIndex, cardIdx: beerIdx } };
            }
            return { event: 'take_noon_hit' };
        }

        // High Noon (přibalené) – Želízka: vyber barvu, se kterou toho v tomhle tahu
        // zahraju nejvíc (sčítá se hodnota karet, ne jejich počet – jedna zbraň je víc
        // než dvě karty na vyhození).
        case 'HANDCUFFS_SUIT': {
            const score = {};
            me.hand.forEach(c => {
                const s = effSuit(state, c);
                if (!s) return;
                score[s] = (score[s] || 0) + 1 + keepScore(c) / 10;
            });
            let best = null, bestVal = -1;
            Object.keys(score).forEach(s => { if (score[s] > bestVal) { bestVal = score[s]; best = s; } });
            return { event: 'handcuffs_suit', payload: { suit: best || HEARTS } };
        }

        // Fistful – Peyote: tipni barvu, které je vidět MÍŇ (v balíčku jí tedy zbývá víc).
        // Přestat nejde, hádá se, dokud se hráč netrefí. Počítá se z VYTIŠTĚNÉ barvy, ne
        // z effSuit – je to zrcadlo výjimky, kterou má samo pravidlo (viz peyoteGuess
        // v logic/fistful.js): s Požehnáním/Prokletím by jinak bot tipoval na jistotu.
        case 'PEYOTE': {
            let red = 0, black = 0;
            const count = (c) => {
                if (!c || c._placeholder || !c.suit) return;
                if (c.suit === HEARTS || c.suit === DIAMONDS) red++; else black++;
            };
            (state.deck?.discardPile || []).forEach(count);
            me.hand.forEach(count);
            // Čím víc karet dané barvy už leží mimo balíček, tím míně jí v něm zbývá →
            // tipuje se ta, které je vidět MÍŇ. Při shodě je to jedno, bere se červená.
            return { event: 'peyote_guess', payload: { red: red <= black } };
        }

        // Fistful – Ranč: vyměň jen karty, které bys stejně odhodil (nízké keepScore),
        // nejvýš tři – větší výměna už je hazard s rukou, se kterou se dá hrát teď.
        case 'RANCH': {
            const ids = me.hand.filter(c => c && !c._placeholder && keepScore(c) <= 2)
                .sort((a, b) => keepScore(a) - keepScore(b))
                .slice(0, 3)
                .map(c => c.id);
            return { event: 'ranch_exchange', payload: { cardIds: ids } };
        }

        // Fistful – Pokrevní bratři: 1 život zraněnému SPOJENCI. Dává se jen z přebytku
        // (zůstanou mi aspoň 3 životy) a jen tomu, kdo je jistý spojenec – nepřítele bych
        // tím posílil. Pořadí spojenců: kdo je zraněný nejvíc. Jinak „Ne, děkuji".
        case 'BLOOD_BROTHERS': {
            const targets = state.pendingBlood?.targets || [];
            let best = null, bestH = Infinity;
            if (me.health >= 3) {
                targets.forEach(i => {
                    const p = state.players[i];
                    if (!p || hostilityOf(state, myIndex, i, beliefs) > -ENEMY_EPS) return;
                    if (p.health < bestH) { bestH = p.health; best = i; }
                });
            }
            return { event: 'blood_brothers', payload: { targetIdx: best } };
        }

        // Fistful – Ruská ruleta: odhod je povinný, jde jen o to, co bolí nejmíň.
        // Nejdřív nejhorší karta z ruky (keepScore), zelenou Vedle!-kartu ze stolu až
        // jako poslední možnost – ta je dlouhodobě cennější než jedno Vedle! z ruky.
        // Kdo nemá nic, se sem vůbec nedostane (server ho rovnou posílá na 2 zásahy).
        case 'ROULETTE_DISCARD': {
            const opts = me.hand.filter(c => rouletteDiscardable(state, me, c, false));
            if (opts.length) {
                const worst = opts.reduce((a, b) => keepScore(b) < keepScore(a) ? b : a);
                return { event: 'roulette_discard', payload: { cardId: worst.id, fromBoard: false } };
            }
            const green = (me.board || []).find(c => rouletteDiscardable(state, me, c, true));
            if (green) return { event: 'roulette_discard', payload: { cardId: green.id, fromBoard: true } };
            return null;
        }

        // High Noon (přibalené) – Nová identita: vyměň postavu jen tehdy, když jsem na tom
        // se životy hůř, než kolik jich výměnou dostanu (jinak by to byl čistý propad).
        case 'NEW_IDENTITY': {
            const take = me.health < 2 || (me.health === 2 && CHAR_RANK[state.pendingNewIdentity?.character] > CHAR_RANK[me.character]);
            return { event: 'new_identity_choose', payload: { take: !!take } };
        }

        case 'SELECTING_TARGET_CARD': {
            const sel = state.pendingSelection;
            const target = state.players[sel.targetIdx];
            // High Noon – Daltonové: nevybírám soupeřovu kartu, ale odhazuju svou modrou.
            if (sel.isDaltons) {
                const pick = daltonsDiscard(target);
                return { event: 'select_target_card', payload: { attackerIdx: myIndex, targetIdx: sel.targetIdx, ...pick } };
            }
            // Rvačka nutí odhodit kartu KAŽDÉMU, tedy i pravděpodobnému spojenci – tomu
            // vybíráme jinak (viz chooseTargetCardArea). Dělení karet po mrtvém (Vulture
            // Sam) je vždy „ber to nejlepší", tam se na nepřátelskost neohlížíme.
            const friendly = !sel.isVultureSplit && target.health > 0
                && hostilityOf(state, myIndex, sel.targetIdx, beliefs) < -ENEMY_EPS;
            const { area, cardIdx } = chooseTargetCardArea(target, sel.sourceCardType, friendly);
            // targetIdx = pro koho se vybírá (guard tím pozná klik do starého stavu).
            return { event: 'select_target_card', payload: { attackerIdx: myIndex, targetIdx: sel.targetIdx, area, cardIdx } };
        }

        case 'BART_DRAW':       return { event: 'bart_cassidy_draw' };
        case 'EL_GRINGO_STEAL': return { event: 'el_gringo_steal' };
        case 'SUZY_DRAW':       return { event: 'suzy_draw' };
        case 'UHYB_DRAW':       return { event: 'uhyb_draw' };

        // Dodge City „odhoď další kartu" – dokončení výběru ceny (bota tam přivede DE_* akce).
        case 'DISCARD_ANOTHER': {
            const mainId = state.pendingDiscardAnother?.mainCardId;
            // Fistful – Odstřelovač: cenou smí být JEN druhá karta Bang! (server jinou
            // ignoruje). Kdyby v ruce mezitím žádná nezbyla, akci radši zruš – jinak by
            // bot posílal odmítaný klik donekonečna a hra by se zasekla.
            const _snPay = state.pendingDiscardAnother?.effect === 'sniper';
            let worst = -1, worstScore = Infinity;
            me.hand.forEach((c, i) => {
                if (c.id === mainId) return;
                if (_snPay && !bangCardFromHand(state, me, myIndex, c)) return;
                const s = keepScore(c);
                if (s < worstScore) { worstScore = s; worst = i; }
            });
            if (worst === -1 && !_snPay) worst = me.hand.findIndex(c => c.id !== mainId);
            if (worst === -1) return { event: 'cancel_discard_another' };
            return { event: 'discard_another_card', payload: { playerIdx: myIndex, extraCardIdx: worst } };
        }

        // Dodge City – Vera Custer: zkopíruj nejlepší dostupnou postavu (dle CHAR_RANK).
        case 'VERA_COPY': {
            const choices = state.pendingVeraCopy?.choices || [];
            if (!choices.length) return null;
            return { event: 'vera_copy', payload: { charName: pickCharacter(choices) } };
        }

        default: return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pendingActor, decideBotAction, roleHostility, rankEnemies, pickCharacter,
                       keepScore, computeBeliefs, chooseTargetCardArea, boardCardValue,
                       weaponValue, keepCharacterChance, decideKeepCharacter };
}
