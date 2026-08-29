// Čisté pravidlo: smí hráč `me` právě teď zahrát danou kartu z ruky?
// Návratová hodnota:
//   true  = hratelná, false = nehratelná, null = neinteraktivní (placeholder / není můj tah).
// BEZ závislosti na Phaseru/DOM. `me` se předává explicitně (ve spectator módu to NENÍ
// state.players[myIndex], proto se neodvozuje uvnitř). Izomorfní: prohlížeč globál, Node require.

if (typeof require === 'function') {
    if (typeof computeDistance === 'undefined' || typeof computeCanHit === 'undefined' || typeof bangEffectReach === 'undefined' || typeof effectiveCharacter === 'undefined') {
        const __d = require('./distance.js');
        if (typeof computeDistance === 'undefined') globalThis.computeDistance = __d.computeDistance;
        if (typeof computeCanHit === 'undefined') globalThis.computeCanHit = __d.computeCanHit;
        if (typeof bangEffectReach === 'undefined') globalThis.bangEffectReach = __d.bangEffectReach;
        if (typeof effectiveCharacter === 'undefined') globalThis.effectiveCharacter = __d.effectiveCharacter;
    }
    // Samostatný guard: `hasAbility`/`abilitiesOf` (Greygory Deck – Divoký západ) je nový
    // trychtýř dotazů „umí X?"; blok výš hlídaný effectiveCharacter by ho mohl minout.
    if (typeof hasAbility === 'undefined') {
        const __ab = require('./distance.js');
        globalThis.hasAbility = __ab.hasAbility;
        globalThis.abilitiesOf = __ab.abilitiesOf;
    }
    // Samostatný guard: kdo načte distance.js dřív (botPolicy), doplní si jen část globálů.
    if (typeof isInPlay === 'undefined') {
        globalThis.isInPlay = require('./distance.js').isInPlay;
    }
    if (typeof inPlayCount === 'undefined') {
        globalThis.inPlayCount = require('./distance.js').inPlayCount;
    }
    if (typeof isResponseTurn === 'undefined') {
        const __ph = require('./phaseInfo.js');
        globalThis.isResponseTurn = __ph.isResponseTurn;
        globalThis.isPlayTurn = __ph.isPlayTurn;
    }
    if (typeof bangLimitFor === 'undefined') {
        const __hn = require('./highNoon.js');
        globalThis.bangLimitFor = __hn.bangLimitFor;
        globalThis.bangBlockedFor = __hn.bangBlockedFor;
        globalThis.beerBlockedFor = __hn.beerBlockedFor;
    }
    // Samostatný guard: kdo načte highNoon.js dřív (botPolicy), doplní si jen část
    // globálů – bez tohohle by tady suitBlockedFor chyběl.
    if (typeof suitBlockedFor === 'undefined') {
        globalThis.suitBlockedFor = require('./highNoon.js').suitBlockedFor;
    }
    // Barva, která u karty PLATÍ (Požehnání/Prokletí) – potřebuje ji lawHandcuffsSuit.
    if (typeof effSuit === 'undefined') {
        globalThis.effSuit = require('./highNoon.js').effSuit;
    }
    // A Fistful of Cards – Laso a Soudce (stejný důvod pro samostatné guardy).
    if (typeof boardDeadFor === 'undefined') {
        globalThis.boardDeadFor = require('./highNoon.js').boardDeadFor;
    }
    if (typeof judgeBlocksFor === 'undefined') {
        globalThis.judgeBlocksFor = require('./highNoon.js').judgeBlocksFor;
    }
    // Právo západu (viz lawForcedCard níž) se ptá na aktivní událost i na to,
    // jakou akci karta spouští – cardRules.js na nikoho nesahá, cyklus nevzniká.
    if (typeof eventActive === 'undefined') {
        globalThis.eventActive = require('./highNoon.js').eventActive;
    }
    if (typeof getActionForCard === 'undefined') {
        globalThis.getActionForCard = require('./cardRules.js').getActionForCard;
    }
}

// ── Co se počítá za kartu Bang! a co za kartu Vedle! ────────────────────────
// Jediný zdroj pravdy pro server (playBang, handleResponse, _rouletteValidCard,
// _sniperValidCard), klienta (cardPlayability, decideCardClick, zvýraznění cílů)
// i bota. Slévají se tu tři pravidla, která se dřív ručně držela v souladu na deseti
// místech – a přesně kvůli tomu existuje invariant „bot se nikdy nezasekne":
//   • Calamity Janet – Bang! a Vedle! jsou pro ni zaměnitelné,
//   • Elena Fuente   – jako Vedle! jí poslouží libovolná karta z ruky,
//   • Zúčtování (Divoký západ) – KAŽDÁ karta smí jít jako Bang!, každá karta Bang!
//     navíc i jako Vedle!. Obě věty na kartě jsou POVOLUJÍCÍ (R1): Bang! zůstává
//     kartou Bang! a Pivo se pořád smí vypít, jen k tomu přibude druhá možnost.
//
// Pozor: „jako karta Bang!" NENÍ totéž co bang-EFEKT (Úder, Springfield, zelené karty).
// Ty mají vlastní typ, do limitu 1× Bang!/tah se nepočítají a ptá se na ně card.bangEffect.
// Barvu si karta nese svou (Apache Kid, Barel, Jourdonnais fungují normálně) a Želízka
// (High Noon) se ptají na SKUTEČNOU kartu, ne na to, čím se tváří – proto tady nejsou.
function playsAsBang(state, me, card) {
    if (!card || card._placeholder) return false;
    if (card.type === "Bang!") return true;
    if (hasAbility(me, "Calamity Janet") && card.type === "Vedle!") return true;
    if (eventActive(state, 'ZUCTOVANI')) return true;      // Zúčtování: každá karta
    return false;
}

// Divoký západ – Big Spencer: „nemůže hrát karty Vedle!". Zákaz míří na KARTU Vedle!,
// ne na roli, ve které se hraje: Barel i Jourdonnais fungují (FAQ Q07, nejsou to karty),
// zelené Vedle! ze stolu (Železný plát / Sombrero / Bible) mají vlastní typ, Úhyb je jiná
// karta a pod Zúčtováním smí Big Spencer hrát jako Vedle! kartu BANG! (R9). Odhodit
// kartu Vedle! (Ruská ruleta) smí – odhoz není zahrání, viz rouletteDiscardable.
function bigSpencerBlocked(me, card) {
    return hasAbility(me, "Big Spencer") && !!card && card.type === "Vedle!";
}

function playsAsMissed(state, me, card) {
    if (!card || card._placeholder) return false;
    if (bigSpencerBlocked(me, card)) return false;
    if (card.type === "Vedle!" || card.type === "Úhyb") return true;
    if (hasAbility(me, "Elena Fuente")) return true;
    if (card.type === "Bang!") {
        return hasAbility(me, "Calamity Janet") || eventActive(state, 'ZUCTOVANI');
    }
    return false;
}

// High Noon – Kazatel: ve svém tahu nesmí hráč zahrát KARTU Bang! – ani jako reakci
// v duelu (FAQ H2). Zákaz míří na KARTU, ne na roli, ve které se hraje: Calamity Janet
// pod něj spadá i se svým Vedle! (FAQ H5, karta se jí na Bang! doslova mění), zatímco
// pod Zúčtováním (Divoký západ) je jiná karta zahraná „jako by to byl Bang!" pořád tou
// svou kartou, takže projde. Bez `card` odpovídá na obecné „platí teď Kazatel?".
function preacherBlocks(state, me, myIndex, card) {
    if (!bangBlockedFor(state, myIndex)) return false;
    if (!card) return true;
    return card.type === "Bang!" ||
        (hasAbility(me, "Calamity Janet") && card.type === "Vedle!");
}

// Divoký západ – Zúčtování: smí hráč TOUHLE kartou právě teď vystřelit, i když to karta
// Bang! sama o sobě není? Vlastní akci karty to nepřebíjí (proto se ptá jen na karty,
// které kartami Bang! nejsou) – v UI je to přepínač, ne náhrada. Podmínky výstřelu
// zůstávají všechny: Kazatel, limit 1× Bang!/tah (Zúčtování z něj pumpu nedělá),
// Odražená střela i Odstřelovač jako náhradní využití vyčerpaného limitu.
function showdownBangOk(state, me, myIndex, card) {
    if (!eventActive(state, 'ZUCTOVANI')) return false;
    if (!card || card._placeholder) return false;
    if (!isPlayTurn(state, myIndex)) return false;
    if (card.type === "Bang!") return false;                                  // řeší větev pro pravý Bang!
    if (hasAbility(me, "Calamity Janet") && card.type === "Vedle!") return false;
    if (card.bangEffect && !card.green) return false;                         // Úder a spol. míří samy
    return bangLimitFree(state, me) || ricochetAvailable(state, me, myIndex) ||
           sniperOffer(state, me, myIndex, card);
}

// Smí se karta zahrát ve své VLASTNÍ roli (Bang! střílí, Pivo léčí, modrá jde na stůl)?
// Vytažené z cardPlayability kvůli Zúčtování (Divoký západ): pod ním je hratelná i karta,
// jejíž vlastní akce zrovna nedává smysl (Vedle! ve svém tahu, druhá zelená téhož jména) –
// zahrát ji ale jde JEN jako Bang!. Kdo chce nabídnout vlastní akci karty (klient přes
// getActionForCard, bot přes decidePlay), musí se proto ptát tímhle predikátem, jinak by
// poslal akci, kterou server mlčky odmítne.
// POZOR: je to DOPLNĚK cardPlayability, ne náhrada – zákazy platné pro celý tah
// (Právo západu, Soudce, Želízka) zůstávají v ní.
function nativePlayInTurn(state, me, myIndex, card) {
    // Karta s bang-efektem (Úder, …) mimo zelené: nepočítá se do limitu Bang!.
    // Vystřelit lze i sám na sebe (pravidla to umožňují), takže je hratelná vždy –
    // i když není v dostřelu žádný soupeř (na sebe se klikne přes vlastní postavu).
    if (card.bangEffect && !card.green) {
        return true;
    }
    if (card.type === "Bang!" || (hasAbility(me, "Calamity Janet") && card.type === "Vedle!")) {
        // (Zúčtování sem NEpatří – karta, která je Bang! jen „jako by", si svou vlastní
        //  akci ponechává; tu možnost přidává navrch showdownBangOk v cardPlayability.)
        if (preacherBlocks(state, me, myIndex, card)) return false;   // Kazatel (High Noon)
        if (bangLimitFree(state, me)) return true;
        // Fistful – Odražená střela ani Odstřelovač se do limitu 1× Bang!/tah NEpočítají
        // (FAQ Q07/Q09): i s vyčerpaným limitem je karta hratelná, jen s ní pak nejde
        // klasicky vystřelit na postavu (klient podle bangAtPlayerOk zhasne postavy) –
        // zbývá střela na vyloženou kartu nebo zaplacení Odstřelovače.
        return ricochetAvailable(state, me, myIndex) || sniperOffer(state, me, myIndex, card);
    }
    if (card.type === "Úhyb") return false; // Úhyb jen jako reakce (mimo tah), ne ve svém tahu
    // Zelené karty se vykládají na stůl; nelze mít 2 stejného jména (D7).
    if (card.green) return !(me.board || []).some(c => c.name === card.name);
    // Dodge City „odhoď další kartu": potřebuje aspoň 1 další kartu k odhození +
    // pro cílené efekty musí existovat smysluplný cíl (jinak by se nic nestalo).
    if (card.discardExtra) {
        // Musí zbýt ČÍM zaplatit. Vynucená karta (Právo západu) se počítat nesmí –
        // zaplatit se jí nedá (lawProtectedCard), takže by hráč skončil ve fázi
        // DISCARD_ANOTHER, ze které vede jen „zrušit" (a bot by se v ní zacyklil).
        if (!(me.hand || []).some(c => c && !c._placeholder && c.id !== card.id &&
            !lawProtectedCard(state, me, myIndex, c))) return false;
        // Léčit lze každého VE HŘE – duch (Město duchů, High Noon) v ní na svůj tah je,
        // takže i jeho (isInPlay, ne health > 0).
        if (card.discardExtra === 'heal_self_2') return isInPlay(me) && me.health < me.maxHealth;
        if (card.discardExtra === 'heal_any') return state.players.some(p => isInPlay(p) && p.health < p.maxHealth);
        if (card.discardExtra === 'bang_any') return state.players.some((p, idx) => idx !== myIndex && p.health > 0);
        if (card.discardExtra === 'steal_any') return state.players.some((p, idx) =>
            idx !== myIndex && p.health > 0 && (p.hand.length > 0 || (p.weapon && p.weapon.id !== -1) || (p.board || []).length > 0))
            || (me.weapon && me.weapon.id !== -1) || (me.board || []).length > 0;
        if (card.discardExtra === 'brawl') return state.players.some((p, idx) =>
            idx !== myIndex && p.health > 0 && (p.hand.length > 0 || (p.weapon && p.weapon.id !== -1) || (p.board || []).length > 0));
        return true;
    }
    if (card.type === "Vedle!") return false;   // Calamity Janet řeší větev výš, Zúčtování showdownBangOk
    if (card.type === "Vězení") {
        return state.players.some((p, idx) => idx !== myIndex && p.health > 0 && p.role !== "Sheriff" && !(p.board||[]).some(c => c.type === "Vězení"));
    }
    if (card.type === "Panika!") {
        // Panika! potřebuje cíl do vzdálenosti 1 s alespoň jednou kartou
        // Cílem může být i sám hráč (vlastní zbraň nebo modrá karta na stole)
        const canTargetSelf = (me.weapon && me.weapon.id !== -1) ||
                             (me.board && me.board.length > 0);
        const canTargetOther = state.players.some((p, idx) =>
            idx !== myIndex && p.health > 0 &&
            computeDistance(state, myIndex, idx) <= 1 &&
            (p.hand.length > 0 || (p.weapon && p.weapon.id !== -1) || (p.board && p.board.length > 0))
        );
        return canTargetSelf || canTargetOther;
    }
    if (card.type === "Duel") return state.players.some((p, idx) => idx !== myIndex && p.health > 0);
    if (card.type === "Pivo") {
        if (beerBlockedFor(state)) return false;   // Reverend (High Noon)
        const aliveCount = inPlayCount(state.players);   // duch se počítá (Město duchů)
        if (aliveCount <= 2) return false;
        if (!isInPlay(me) || me.health >= me.maxHealth) return false;   // duch se léčit smí
        return true;
    }
    if (card.type === "Salon") return state.players.some(p => isInPlay(p) && p.health < p.maxHealth);
    if (["Zbraň","Barel","Vybavení","Dynamit"].includes(card.type)) {
        if (card.type === "Zbraň") { if (me.weapon?.id !== -1 && me.weapon?.name === card.name) return false; }
        else { if ((me.board||[]).some(c => c.name === card.name)) return false; }
        return true;
    }
    return true;
}

// Jakou akci karta spustí ve VLASTNÍM tahu. Nad getActionForCard přidává jedinou věc:
// pod Zúčtováním (Divoký západ) je karta, jejíž vlastní akce zrovna nejde (Vedle!/Úhyb
// ve svém tahu, druhá zelená téhož jména, Salon bez zraněných), hratelná už JEN jako
// Bang! – takže se míří. Ptá se tím klient (decideCardClick), bot (forcedLawIntent)
// i Právo západu (co vlastně vynucená karta dělá a jestli má cíl).
function turnActionForCard(state, me, myIndex, card) {
    const action = getActionForCard(card, abilitiesOf(me));
    if (action === 'SHOOT') return action;
    if (eventActive(state, 'ZUCTOVANI') && !nativePlayInTurn(state, me, myIndex, card)) return 'SHOOT';
    return action;
}

function cardPlayability(state, me, myIndex, card) {
    if (card?._placeholder) return null;
    // Fistful – Ruská ruleta: vlastní fáze mimo tah i mimo obranu, klikatelné jsou jen
    // karty s efektem Vedle! (odhod je povinný, „přeskočit" neexistuje). Musí to být
    // dřív než cokoli jiného – hráč na řadě nemusí být na tahu ani cílem útoku.
    if (state.phase === "ROULETTE_DISCARD") {
        return state.pendingRoulette?.playerIdx === myIndex
            ? rouletteDiscardable(state, me, card, false) : null;
    }
    // Divoký západ – Youl Grinner: kdo má víc karet než on, mu jednu dává, a to
    // PODLE SVÉ VOLBY – klikatelná je tedy každá karta v ruce. Taky mimo tah, takže
    // stejně brzy jako Ruská ruleta.
    if (state.phase === "GRINNER_GIVE") {
        return state.pendingGrinner?.queue?.[0] === myIndex ? true : null;
    }
    const isMyResponseTurn = isResponseTurn(state, myIndex);
    const isMyPlayTurn = isPlayTurn(state, myIndex);
    // High Noon – Želízka: ve svém tahu jen karty zvolené barvy (i jako reakce).
    if ((isMyResponseTurn || isMyPlayTurn) && suitBlockedFor(state, myIndex, card)) return false;
    if (isMyResponseTurn) {
        const req = state.pendingResponse.requiredCard;
        const _aliveForBeer = inPlayCount(state.players);   // duch se počítá (Město duchů)
        // Pivo jako záchrana při posledním životě (Reverend ho zakazuje – High Noon).
        // Fistful – Odražená střela neohrožuje život, ale kartu na stole: zachraňovat
        // se před ní Pivem (ani Sidem) nejde, jinak by šlo za jedno Pivo ubránit kartu.
        if (card.type === "Pivo" && me.health === 1 && _aliveForBeer > 2 && !state.pendingResponse.ricochet)
            return !beerBlockedFor(state);
        // Co se počítá za Vedle! (Elena Fuente, Zúčtování) řeší playsAsMissed.
        if (req === "Vedle!") return playsAsMissed(state, me, card);
        // Kazatel (High Noon): Bang! nesmí hráč zahrát ani jako reakci ve svém tahu (FAQ H2).
        if (req === "Bang!")  return playsAsBang(state, me, card) && !preacherBlocks(state, me, myIndex, card);
        return false;
    }
    if (isMyPlayTurn) {
        // Fistful – Právo západu: zamčené jsou jen karty, po jejichž zahrání by vynucená
        // (odkrytá) karta přestala jít zahrát – doléčené Pivo/Salon nebo vyčerpaný limit
        // Bang! (viz lawLocksOther). Zbytek ruky zůstává volný: vynucenou kartu stejně
        // nejde zaplatit ani odhodit (lawProtectedCard), takže se povinnost obejít nedá.
        // Sama vynucená karta se sem nezacyklí: pro ni se gate přeskočí ještě před
        // dotazem na lawForcedCard.
        if (me._lawCardId != null && card.id !== me._lawCardId &&
            lawLocksOther(state, me, myIndex, card)) return false;
        // Fistful – Soudce: nic se nesmí vyložit před hráče (výzbroj, modré, zelené, Vězení).
        if (judgeBlocksFor(state, card)) return false;
        if (nativePlayInTurn(state, me, myIndex, card)) return true;
        // Divoký západ – Zúčtování: každá karta SMÍ jít jako Bang!, ale nemusí – proto
        // se možnost jen přidává navrch vlastní akci karty (viz showdownBangOk).
        return showdownBangOk(state, me, myIndex, card);
    }
    return null;
}

// ── A Fistful of Cards – Právo západu ──────────────────────────────
// Druhá karta, kterou hráč ve fázi lízání vezme do ruky, se odkryje a MUSÍ ji v tomhle
// tahu zahrát, pokud to jde. Vrací { card, idx }, dokud ho drží v tahu, jinak null.
//
// „Pokud to jde“ je záměrně opatrné: kromě cardPlayability se u cílených karet ověřuje,
// že existuje KONKRÉTNÍ cíl. Bez toho by šlo tah zamknout kartou Bang!, na kterou nikdo
// nedosáhne, nebo Cat Balouem ve chvíli, kdy nikdo nic nemá.
//
// JEDINÝ zdroj pravdy pro server (tryEndTurn), bota (decidePlay) i klienta (zlatý rámeček
// a zašedlé „Ukončit tah“). Rozejít se nesmí: server by tah odmítl ukončit, bot by posílal
// end_turn donekonečna a hra by se zasekla.
function lawForcedCard(state, me, myIndex) {
    if (!me || me._lawCardId == null || !eventActive(state, 'PRAVO_ZAPADU')) return null;
    const idx = (me.hand || []).findIndex(c => c && !c._placeholder && c.id === me._lawCardId);
    if (idx === -1) return null;
    const card = me.hand[idx];
    if (cardPlayability(state, me, myIndex, card) !== true) return null;
    if (!_lawHasTarget(state, me, myIndex, card)) return null;
    return { card, idx };
}

// Existuje cíl, na který se vynucená karta dá zahrát? Doplňuje cardPlayability tam, kde
// se na cíl neptá (Bang!/bang-efekt, Cat Balou) nebo kde by jako cíl stačil sám hráč
// (Ragtime) – klient i bot musí mít na co kliknout. Zbytek pokrývá cardPlayability
// (Vězení, Duel, Pivo, Salon, ostatní „odhoď další kartu“).
function _lawHasTarget(state, me, myIndex, card) {
    const other = (i) => i !== myIndex && state.players[i].health > 0;
    const hasCards = (p) => p.hand.length > 0 || (p.weapon && p.weapon.id !== -1) || (p.board || []).length > 0;
    switch (turnActionForCard(state, me, myIndex, card)) {
        case 'SHOOT':
            // Cíl je vždycky: když hráč nedosáhne na nikoho jiného, musí střelit SÁM NA SEBE
            // (viz lawSelfShootOnly – klient mu k tomu výjimečně zvýrazní vlastní postavu).
            return true;
        case 'Panika!':
            return state.players.some((p, i) => other(i) && hasCards(p) && computeDistance(state, myIndex, i) <= 1);
        case 'Cat Balou':
        case 'DE_STEAL':
            return state.players.some((p, i) => other(i) && hasCards(p));
        default:
            return true;
    }
}

// Musí hráč vynucený Bang! (nebo bang-efekt) poslat sám na sebe? Platí, když na NIKOHO
// jiného nedosáhne – pravidlo ho pak nutí střelit sebe. Jediný zdroj pravdy pro server
// (playBang povolí cíl = útočník), klienta (zvýrazní vlastní postavu) i bota.
function lawSelfShootOnly(state, me, myIndex, card) {
    if (!card || turnActionForCard(state, me, myIndex, card) !== 'SHOOT') return false;
    const reach = bangEffectReach(card);
    return !state.players.some((p, i) =>
        i !== myIndex && p.health > 0 && computeCanHit(state, myIndex, i, reach));
}

// Kolik karet hráči za zahrání karty PŘIBUDE do ruky. Modeluje se jen to, co si vezme
// sám (hokynářství = jedna karta pro každého, tedy i pro něj) – rozdané karty soupeřů
// vynucenou kartu ovlivnit nemůžou.
function _lawDrawGain(card) {
    if (!card) return 0;
    if (card.type === "Wells Fargo") return 3;
    if (card.type === "Dostavník") return 2;
    if (card.type === "Hokynářství") return 1;
    return 0;
}

// Počítá se zahrání téhle karty do limitu „1× Bang! za tah"? (Karty s bang-EFEKTEM
// – Úder, Springfield, zelené – se do něj nepočítají, viz playBang isEffect.)
function _lawCountsBang(me, card) {
    return !!card && !card.bangEffect &&
        (card.type === "Bang!" || (hasAbility(me, "Calamity Janet") && card.type === "Vedle!"));
}

// Hypotetický stav PO akci, z pohledu vynucené karty. Kopíruje se MĚLCE (skutečným
// stavem se nehne) a modeluje se jen to, co si hráč způsobí SÁM a co může vynucenou
// kartu „vypnout": ruka (karty odejdou / přibudou), limit karet Bang! a vlastní životy.
// Zásahy do stavu soupeřů (zabití, sebraná poslední karta) se nemodelují – to by
// znamenalo dohrát celé pravidlo; jsou to okrajové případy, kde povinnost prostě
// odpadne, ne kde by se hra zasekla.
function _lawAfterAction(state, me, myIndex, forcedCard, card, opts) {
    const players = state.players.slice();
    const sim = Object.assign({}, state, { players });
    const simMe = Object.assign({}, me);
    players[myIndex] = simMe;
    simMe.hand = (me.hand || []).slice();

    // 1) Karty, které z ruky odejdou. Vynucená karta mezi nimi nikdy není – tu chrání
    //    lawProtectedCard, takže se jí zaplatit ani odhodit nedá.
    const drop = (pred) => {
        const i = simMe.hand.findIndex(c => c && c.id !== forcedCard.id && pred(c));
        if (i !== -1) simMe.hand.splice(i, 1);
    };
    if (card) drop(c => c.id === card.id);
    // „Odhoď další kartu" (Springfield/Tequila/Whisky/Ragtime/Rvačka, Odstřelovač) stojí
    // ještě jednu kartu z ruky.
    let discards = (opts.discards || 0) + (card && card.discardExtra ? 1 : 0);
    for (let k = 0; k < discards; k++) drop(() => true);
    // 2) Karty, které přibudou (Dostavník, Wells Fargo, hokynářství, schopnosti).
    const draws = (opts.draws || 0) + _lawDrawGain(card);
    for (let k = 0; k < draws; k++) simMe.hand.push({ id: null, name: "", type: "" });
    // 3) Limit karet Bang! (Odstřelovač ani Odražená střela ho nečerpají → noBangLimit).
    if (!opts.noBangLimit && _lawCountsBang(me, card))
        simMe.bangsPlayedThisTurn = (simMe.bangsPlayedThisTurn || 0) + 1;
    // 4) Doléčené životy – kvůli nim „nejde zahrát" vynucené Pivo/Salon/Whisky/Tequila.
    const heal = (p, n) => { if (isInPlay(p)) p.health = Math.max(0, Math.min(p.maxHealth, (p.health || 0) + n)); };
    if (opts.heal) heal(simMe, opts.heal);
    if (card) {
        if (card.type === "Pivo") heal(simMe, hasAbility(me, "Tequila Joe") ? 2 : 1);
        else if (card.type === "Salon") players.forEach((p, i) => {
            if (i === myIndex) { heal(simMe, 1); return; }
            const q = Object.assign({}, p); players[i] = q; heal(q, 1);
        });
        else if (card.discardExtra === 'heal_self_2') heal(simMe, 2);
        // Tequila léčí zvoleného hráče – koho, se v tuhle chvíli ještě neví (klient se ptá
        // před výběrem cíle), takže se počítá nejhorší případ „vyléčí sebe".
        else if (card.discardExtra === 'heal_any') heal(simMe, 1);
    }
    return { state: sim, me: simMe };
}

// Zamyká vynucená karta tuhle akci? Právo západu NEZAMYKÁ celý zbytek tahu: hráč smí
// dělat cokoli, po čem vynucená karta pořád půjde zahrát. Blokují se jen akce, které by
// ji „vypnuly" – vyčerpaly by limit karet Bang!, doléčily život, na který čeká
// (Pivo/Salon/Whisky/Tequila), nebo ubraly z ruky karty, které potřebuje jako cenu.
// Vynucenou kartu samotnou zaplatit ani odhodit nejde vůbec (lawProtectedCard), takže
// „zahrát Springfield a zaplatit jím povinnost" nehrozí a zbytek tahu zůstává volný.
// `card` = karta hraná Z RUKY; null = schopnost postavy / aktivace zelené karty ze stolu.
// `opts` = co akce udělá navíc: { discards, draws, heal, noBangLimit }.
// Zrcadlo serverového _lawLocked.
function lawLocksOther(state, me, myIndex, card, opts = {}) {
    if (!me || me._lawCardId == null) return false;
    if (card && card.id === me._lawCardId) return false;
    const forced = lawForcedCard(state, me, myIndex);
    if (!forced) return false;
    const after = _lawAfterAction(state, me, myIndex, forced.card, card, opts);
    return !lawForcedCard(after.state, after.me, myIndex);
}

// Smí se tahle karta z ruky ODHODIT nebo jí ZAPLATIT? Vynucenou kartu ne – jinak by se
// jí hráč zbavil, aniž by ji zahrál (cena za „odhoď další kartu" a za Odstřelovače,
// Sid Ketchum, Doc Holyday, José Delgado, Uncle Will, Ranč). Tohle je protiváha
// uvolněného lawLocksOther: zbytek tahu je volný právě proto, že povinnost nejde
// zaplatit. Ptá se i mimo fázi PLAY (cena se vybírá ve fázi DISCARD_ANOTHER, Ranč má
// svou vlastní), proto se hratelnost vynucené karty posuzuje proti fázi PLAY.
function lawProtectedCard(state, me, myIndex, card) {
    if (!card || !me || me._lawCardId == null || card.id !== me._lawCardId) return false;
    if (state.currentPlayerIndex !== myIndex) return false;
    const s = state.phase === "PLAY" ? state : Object.assign({}, state, { phase: "PLAY" });
    return !!lawForcedCard(s, me, myIndex);
}

// Želízka (High Noon) × Právo západu (Fistful): jakou barvu si hráč MUSÍ vybrat.
// Drží-li vynucenou kartu, která by ve své barvě šla zahrát, je volba jediná – jinou
// barvou by si povinnost jen zrušil (a `lawForcedCard` by ji přestal hlásit, protože
// _suitBlocked kartu vypne). Vrací null, když se vybírat dá svobodně: vynucená karta
// není, nebo by nešla zahrát ani ve své barvě (typicky Vedle!, ve svém tahu nehratelné).
// Jediný zdroj pravdy pro server (chooseHandcuffsSuit), klienta (overlay) i bota.
function lawHandcuffsSuit(state, me, myIndex) {
    if (!me || me._lawCardId == null) return null;
    if (!eventActive(state, 'PRAVO_ZAPADU') || !eventActive(state, 'ZELIZKA')) return null;
    const card = (me.hand || []).find(c => c && !c._placeholder && c.id === me._lawCardId);
    if (!card) return null;
    const suit = effSuit(state, card);
    if (!suit) return null;
    // Barva se volí ve fázi HANDCUFFS_SUIT (hned po lízání), takže se hratelnost posuzuje
    // proti hypotetické fázi PLAY se ZVOLENOU barvou.
    const simMe = Object.assign({}, me, { _handcuffsSuit: suit });
    const players = state.players.slice();
    players[myIndex] = simMe;
    const sim = Object.assign({}, state, { players, phase: "PLAY" });
    return lawForcedCard(sim, simMe, myIndex) ? suit : null;
}

// ── A Fistful of Cards – Ruská ruleta: co se počítá za „kartu Vedle!" ────────
// „Počínaje šerifem každý hráč odhodí kartu Vedle!. První, kdo nemůže, ztrácí 2 životy."
// Jediný zdroj pravdy pro server (_rouletteValidCard v logic/fistful.js), klientské
// zvýraznění (cardPlayability níž + zelené karty ve view/board.js) i bota. Rozejít se
// nesmí: server by klik odmítl, bot by ho posílal donekonečna a hra by se zasekla.
//   • z ruky  – Vedle!, Úhyb, u Calamity Janet i Bang!, u Eleny Fuente libovolná karta
//               (stejný výčet jako obrana proti Bang! v logic/response.js),
//   • ze stolu – zelená karta s efektem Vedle! (Železný plát/Sombrero/Bible); s Lasem
//               karty na stole nic neumí, takže tehdy se nepočítají.
// Karta se ODHAZUJE, nehraje: její vlastní efekt (líznutí za Úhyb/Bibli) se nespustí.
function rouletteDiscardable(state, me, card, fromBoard) {
    if (!card || card._placeholder) return false;
    if (fromBoard) return !!card.green && card.activate === 'miss' && !boardDeadFor(state);
    // Big Spencer nesmí kartu Vedle! ZAHRÁT, ale ODHODIT ji smí – jeho zákaz z
    // playsAsMissed se proto tady obchází (plán §5.1).
    return playsAsMissed(state, me, card) || bigSpencerBlocked(me, card);
}

// Má hráč vůbec co odhodit? Kdo nemá (a neuhne ani barelem), ztrácí 2 životy a efekt končí.
function rouletteHasCard(state, p) {
    if (!p) return false;
    return (p.hand || []).some(c => rouletteDiscardable(state, p, c, false)) ||
           (p.board || []).some(c => rouletteDiscardable(state, p, c, true));
}

// Kolik kontrolních sejmutí smí hráč v Ruské ruletě zkusit místo odhozu karty (FAQ Q13:
// „Barel, Bible atd. i schopnosti postav jako Jourdonnaisova fungují"). Stejný výčet jako
// u obyčejného Bang! (_beginBangResolution): Barel 1, Jourdonnais 1, obojí 2. Laso
// (Fistful) vypíná Barel jako kartu na stole, Jourdonnaisova VROZENÁ schopnost platí dál.
// Sejmutí se zkouší PŘED odhozem – při ♥ hráč projde zadarmo, jinak kartu odhodit musí.
function rouletteBarrelChecks(state, p) {
    if (!p) return 0;
    const hasBarrel = !boardDeadFor(state) && (p.board || []).some(c => c.type === "Barel");
    const jourdonnais = hasAbility(p, "Jourdonnais");
    return (hasBarrel ? 1 : 0) + (jourdonnais ? 1 : 0);
}

// ── A Fistful of Cards – Odstřelovač a Odražená střela ──────────────────────
// Obě karty pracují s „kartou Bang!" v ruce, takže výčet co se za ni počítá je jeden
// jediný: Bang!, u Calamity Janet i Vedle!. Karta se HRAJE z ruky, proto přes ni musí
// projít i Želízka (High Noon). Karty s bang-EFEKTEM (Úder, Nůž…) kartami Bang! nejsou,
// a protože mají vlastní typ, vypadnou samy.
function bangCardFromHand(state, me, myIndex, card) {
    if (!card || card._placeholder) return false;
    if (suitBlockedFor(state, myIndex, card)) return false;
    return playsAsBang(state, me, card);
}

// Zbývá hráči volný limit karet Bang! na tenhle tah? (Willy the Kid a Volcanic ho nemají;
// Laso zbraň na stole vypíná, takže s ním Volcanic neplatí. Přestřelka zvedá limit na 2.)
function bangLimitFree(state, me) {
    if (hasAbility(me, "Willy the Kid")) return true;
    if (!boardDeadFor(state) && me.weapon?.name?.includes("Volcanic")) return true;
    return me.bangsPlayedThisTurn < bangLimitFor(state);
}

// Smí vybraná karta letět na POSTAVU (klasický výstřel)? Odražená střela se do limitu
// nepočítá (R2), takže karta Bang! může být hratelná i s vyčerpaným limitem – tehdy jde
// zamířit jen na vyloženou kartu. Klient se tím řídí při zvýrazňování postav, server
// stejné pravidlo vynucuje v playBang.
function bangAtPlayerOk(state, me, myIndex, card) {
    if (!card || card.bangEffect) return true;   // Úder a spol. limit neřeší
    if (!bangCardFromHand(state, me, myIndex, card)) return true;   // není to karta Bang!
    return bangLimitFree(state, me);
}

// Odražená střela: „Hráči smí hrát karty Bang! proti kartám vyloženým před ostatními
// hráči." Smí hráč TOUHLE kartou střílet na vyložené karty? (Do limitu se to nepočítá –
// R2; Kazatel ale zakazuje kartu Bang! zahrát vůbec.)
function ricochetOffer(state, me, myIndex, card) {
    if (!eventActive(state, 'ODRAZENA_STRELA')) return false;
    if (!isPlayTurn(state, myIndex)) return false;
    if (!bangCardFromHand(state, me, myIndex, card)) return false;
    if (preacherBlocks(state, me, myIndex, card)) return false;   // Kazatel (High Noon)
    // Právo západu: zamčené jsou jen střely, po kterých by vynucená karta přestala jít
    // zahrát. Odražená střela limit Bang! nečerpá (R2) → noBangLimit.
    return !lawLocksOther(state, me, myIndex, card, { noBangLimit: true });
}

// Je vyložená karta hráče `targetIdx` platným cílem Odražené střely? Na vlastní karty se
// střílet nedá, ale VZDÁLENOST NEHRAJE ROLI (FAQ Q15): střílí se na kteroukoli vyloženou
// kartu u stolu bez ohledu na dostřel zbraně. Jediný zdroj pravdy pro server (playRicochet),
// klienta (zvýraznění vyložených karet) i bota.
function ricochetTargetOk(state, myIndex, targetIdx) {
    if (targetIdx === myIndex) return false;
    const t = state.players[targetIdx];
    return !!t && isInPlay(t);
}

// Je vůbec na co střílet? (Jediné, kvůli čemu je karta Bang! hratelná i s vyčerpaným
// limitem – bez cíle by šla vybrat a nedala se s ní udělat vůbec nic.)
function ricochetAvailable(state, me, myIndex) {
    if (!eventActive(state, 'ODRAZENA_STRELA')) return false;
    return state.players.some((p, i) => ricochetTargetOk(state, myIndex, i) &&
        ((p.weapon && p.weapon.id !== -1) || (p.board || []).length > 0));
}

// Odstřelovač: „Hráč smí ve svém tahu odhodit 2 karty Bang! najednou proti jinému hráči."
// Smí hráč TEĎ nabídnout Odstřelovače s touhle kartou jako první ze dvou? Obě karty se
// ODHAZUJÍ, nehrají (FAQ Q07), takže se to do limitu 1× Bang!/tah NEpočítá a jde to
// opakovat, dokud jsou v ruce karty Bang! – hráč navíc smí ve stejném tahu vystřelit
// i svůj normální Bang!. Kazatel (High Noon) kartu Bang! zakazuje zahrát vůbec, takže
// platí i tady. V ruce musí být druhá karta Bang! a v dostřelu někdo, na koho zamířit.
function sniperOffer(state, me, myIndex, card) {
    if (!eventActive(state, 'ODSTRELOVAC')) return false;
    if (!isPlayTurn(state, myIndex)) return false;
    if (!bangCardFromHand(state, me, myIndex, card)) return false;
    if (preacherBlocks(state, me, myIndex, card)) return false;   // Kazatel (High Noon)
    // Právo západu: Odstřelovač stojí druhou kartu Bang! z ruky a do limitu se nepočítá
    // (FAQ Q07). Vynucená karta jako ta druhá posloužit nesmí – odhazuje se, nehraje.
    if (lawLocksOther(state, me, myIndex, card, { noBangLimit: true, discards: 1 })) return false;
    const other = (me.hand || []).some(c => c && c.id !== card.id &&
        !lawProtectedCard(state, me, myIndex, c) && bangCardFromHand(state, me, myIndex, c));
    if (!other) return false;
    return state.players.some((p, i) => i !== myIndex && isInPlay(p) && computeCanHit(state, myIndex, i));
}

// ── Divoký západ – Lee Van Kliff ─────────────────────────────────
// „Během svého tahu smí odhodit kartu BANG! a zopakovat efekt hnědé karty, kterou
// právě zahrál."
//
// Paměť poslední hnědé karty (`state._lastBrown`) staví server (`_markBrownPlayed`
// v logic/wildWest.js) a nese v sobě i to, JAKÝ cíl opakování potřebuje (`aim`) –
// klient, bot i server se tak ptají jedním a týmž predikátem a nemají jak se rozejít.
// Aktivuje ji jen skutečná karta BANG! (Sciarra Q23), ne karta s bang-EFEKTEM – ptá se
// proto přes `bangCardFromHand`, takže pod Zúčtováním postačí libovolná karta (poznámka
// v pravidlech). Odhozený BANG! se do limitu 1× Bang!/tah nepočítá (není zahraný, Q24).

// Co je teď k opakování? (deskriptor `_lastBrown`, nebo null)
function lvkRepeat(state, me, myIndex) {
    if (!hasAbility(me, "Lee Van Kliff")) return null;
    if (!isPlayTurn(state, myIndex)) return null;
    const lb = state._lastBrown;
    if (!lb || lb.repeated) return null;                       // každý efekt jen jednou
    if (lb.playerIdx !== myIndex || lb.turnId !== state.turnId) return null;
    return lb;
}

// Smí táhle karta z ruky zaplatit opakování?
function lvkPayOk(state, me, myIndex, card) {
    if (!lvkRepeat(state, me, myIndex)) return false;
    if (!bangCardFromHand(state, me, myIndex, card)) return false;
    // Právo západu (Fistful): vynucenou kartou se platit nedá a zamknout může i samotný
    // úbytek karty z ruky. Opakování limit Bang! nečerpá → noBangLimit.
    if (lawProtectedCard(state, me, myIndex, card)) return false;
    return !lawLocksOther(state, me, myIndex, null, { noBangLimit: true, discards: 1 });
}

// Dostřel opakovaného výstřelu: undefined = dostřel zbraně (Bang!), číslo (Úder = 1),
// Infinity (Springfield). Uložený `range` je syrová hodnota z karty, protože Infinity
// by se přes JSON nepřeneslo.
function lvkReach(lb) {
    if (!lb || lb.aim !== 'shoot') return undefined;
    if (lb.range === 'any') return Infinity;
    return typeof lb.range === 'number' ? lb.range : undefined;
}

// Má hráč vůbec kartu, o kterou by šlo přijít? (Z vlastní ruky se nekrade – stejně
// jako u Ragtime na sebe, viz startDiscardExtra.)
function lvkHasCard(state, myIndex, i) {
    const p = state.players[i];
    if (!p) return false;
    const hand = i === myIndex ? 0 : (p.hand || []).length;
    return hand > 0 || (p.board || []).length > 0 || !!(p.weapon && p.weapon.id !== -1);
}

// Je hráč `targetIdx` platným cílem opakovaného efektu? (FAQ Q13: cíl smí být jiný než
// původní.) Jediný zdroj pravdy pro server (useLeeVanKliff), klienta i bota.
function lvkTargetOk(state, me, myIndex, targetIdx) {
    const lb = lvkRepeat(state, me, myIndex);
    if (!lb || !lb.aim) return false;
    const t = state.players[targetIdx];
    if (!t || !isInPlay(t)) return false;
    switch (lb.aim) {
        case 'shoot':
            return targetIdx !== myIndex &&
                   computeCanHit(state, myIndex, targetIdx, lvkReach(lb));
        case 'duel':
            return targetIdx !== myIndex;
        case 'panic':    // Panika!: dosah 1 (Ragtime má vlastní aim)
            return targetIdx !== myIndex && lvkHasCard(state, myIndex, targetIdx) &&
                   computeDistance(state, myIndex, targetIdx) <= 1;
        case 'catbalou':
            return targetIdx !== myIndex && lvkHasCard(state, myIndex, targetIdx);
        case 'steal':    // Ragtime: bez ohledu na vzdálenost, i na vlastní stůl
            return lvkHasCard(state, myIndex, targetIdx);
        case 'heal':     // Tequila: kdokoli ve hře (i sám sebe)
            return true;
        default:
            return false;
    }
}

// ── Divoký západ – Lady Růže z Texasu ────────────────────────────
// „Během svého tahu si může každý hráč vyměnit místo s hráčem po své pravici a ten tak
// přeskočí svůj nejbližší tah."
//
// Počet použití karta neomezuje. Strop je podle FAQ Q08 „x použití ZA SEBOU", kde
// x = počet ŽIJÍCÍCH hráčů (`state._roseStreak`, nuluje ho začátek tahu, ve kterém
// místo nikdo neměnil). Je to jediná pojistka proti smyčce, ve které jeden hráč nikdy
// nepřijde na tah, takže ji musí znát server, klient i bot – tedy tenhle helper.

// Kdo sedí „po pravici"? = předchozí hráč PO SMĚRU hodinových ručiček, tedy
// (i − 1 + n) % n, a to BEZ ohledu na Zlatou horečku (High Noon). Je to efekt karty,
// a ty jdou v tomhle projektu vždycky po směru (FAQ H3 – stejné pravidlo jako posun
// dynamitu, hokynářství nebo Daltonové). Vyřazení se přeskakují: s prázdným sedadlem
// se místo neměří. Duch (Město duchů) ve hře je, ten se počítá.
function roseRightNeighbor(state, myIndex) {
    const list = (state && state.players) || [];
    const n = list.length;
    for (let k = 1; k < n; k++) {
        const j = ((myIndex - k) % n + n) % n;
        if (j === myIndex) break;
        if (isInPlay(list[j])) return j;
    }
    return null;
}

// Smí hráč TEĎ vyměnit místo? Vrací sedadlo souseda po pravici, nebo null.
// Podle toho se kreslí tlačítko, rozhoduje bot i pouští server.
function roseSwapOffer(state, myIndex) {
    if (!eventActive(state, 'LADY_RUZE_Z_TEXASU')) return null;
    if (!isPlayTurn(state, myIndex)) return null;
    const j = roseRightNeighbor(state, myIndex);
    if (j == null) return null;
    const alive = ((state && state.players) || []).filter(p => p && p.health > 0).length;
    if ((state._roseStreak || 0) >= alive) return null;
    // A Fistful of Cards – Právo západu: vynucená karta zamyká jen akce, po kterých už
    // by nešla zahrát (viz lawLocksOther). Výměna míst sice kartami nehýbe, ale MĚNÍ
    // VZDÁLENOSTI – přesednutím by se hráč mohl vyvléknout z dostřelu vynuceného Bang!
    // (nebo z dosahu Paniky) a povinnost tím zrušit. Ověří se to na kopii stavu
    // s prohozenými sedadly, ne odhadem.
    const me = state.players[myIndex];
    if (me && me._lawCardId != null && lawForcedCard(state, me, myIndex)) {
        const seats = state.players.slice();
        seats[myIndex] = state.players[j];
        seats[j] = me;
        const sim = Object.assign({}, state, { players: seats, currentPlayerIndex: j });
        if (!lawForcedCard(sim, me, j)) return null;
    }
    return j;
}

// Je opakování právě teď k dispozici? (Je co opakovat, je čím zaplatit a – potřebuje-li
// efekt cíl – je i na koho.) Podle toho se kreslí tlačítko a rozhoduje bot.
function lvkOffer(state, me, myIndex) {
    const lb = lvkRepeat(state, me, myIndex);
    if (!lb) return null;
    if (!(me.hand || []).some(c => lvkPayOk(state, me, myIndex, c))) return null;
    if (lb.aim && !state.players.some((p, i) => lvkTargetOk(state, me, myIndex, i))) return null;
    return lb;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cardPlayability, nativePlayInTurn, lawForcedCard, lawSelfShootOnly, lawLocksOther,
                       lawProtectedCard, lawHandcuffsSuit,
                       rouletteDiscardable, rouletteHasCard, rouletteBarrelChecks,
                       playsAsBang, playsAsMissed, showdownBangOk, preacherBlocks, bigSpencerBlocked,
                       turnActionForCard,
                       bangCardFromHand, bangLimitFree, bangAtPlayerOk,
                       ricochetOffer, ricochetTargetOk, ricochetAvailable, sniperOffer,
                       lvkRepeat, lvkPayOk, lvkReach, lvkTargetOk, lvkOffer,
                       roseRightNeighbor, roseSwapOffer };
}
