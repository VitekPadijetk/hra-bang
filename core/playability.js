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
    // Samostatný guard: kdo načte distance.js dřív (botPolicy), doplní si jen část globálů.
    if (typeof isInPlay === 'undefined') {
        globalThis.isInPlay = require('./distance.js').isInPlay;
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

function cardPlayability(state, me, myIndex, card) {
    if (card?._placeholder) return null;
    // Fistful – Ruská ruleta: vlastní fáze mimo tah i mimo obranu, klikatelné jsou jen
    // karty s efektem Vedle! (odhod je povinný, „přeskočit" neexistuje). Musí to být
    // dřív než cokoli jiného – hráč na řadě nemusí být na tahu ani cílem útoku.
    if (state.phase === "ROULETTE_DISCARD") {
        return state.pendingRoulette?.playerIdx === myIndex
            ? rouletteDiscardable(state, me, card, false) : null;
    }
    const isMyResponseTurn = isResponseTurn(state, myIndex);
    const isMyPlayTurn = isPlayTurn(state, myIndex);
    // High Noon – Želízka: ve svém tahu jen karty zvolené barvy (i jako reakce).
    if ((isMyResponseTurn || isMyPlayTurn) && suitBlockedFor(state, myIndex, card)) return false;
    if (isMyResponseTurn) {
        const req = state.pendingResponse.requiredCard;
        const _aliveForBeer = state.players.filter(p => p.health > 0).length;
        // Pivo jako záchrana při posledním životě (Reverend ho zakazuje – High Noon).
        // Fistful – Odražená střela neohrožuje život, ale kartu na stole: zachraňovat
        // se před ní Pivem (ani Sidem) nejde, jinak by šlo za jedno Pivo ubránit kartu.
        if (card.type === "Pivo" && me.health === 1 && _aliveForBeer > 2 && !state.pendingResponse.ricochet)
            return !beerBlockedFor(state);
        // Elena Fuente (Dodge City): libovolná karta z ruky funguje jako Vedle!.
        if (req === "Vedle!") return card.type === "Vedle!" || card.type === "Úhyb" ||
            (effectiveCharacter(me) === "Calamity Janet" && card.type === "Bang!") || effectiveCharacter(me) === "Elena Fuente";
        // Kazatel (High Noon): Bang! nesmí hráč zahrát ani jako reakci ve svém tahu (FAQ H2).
        if (req === "Bang!")  return (card.type === "Bang!" || (effectiveCharacter(me) === "Calamity Janet" && card.type === "Vedle!"))
            && !bangBlockedFor(state, myIndex);
        return false;
    }
    if (isMyPlayTurn) {
        // Fistful – Právo západu: dokud hráč drží vynucenou (odkrytou) kartu a JDE zahrát,
        // je zbytek ruky zamčený – vynucená karta musí ven jako první. Bez toho jde
        // povinnost snadno obejít: zahrát Pivo, aby vynucený Salón přestal jít zahrát,
        // nebo jiný Bang! a vyčerpat jím limit. Sama vynucená karta se sem nezacyklí:
        // pro ni se gate přeskočí ještě před dotazem na lawForcedCard.
        if (me._lawCardId != null && card.id !== me._lawCardId &&
            lawForcedCard(state, me, myIndex)) return false;
        // Fistful – Soudce: nic se nesmí vyložit před hráče (výzbroj, modré, zelené, Vězení).
        if (judgeBlocksFor(state, card)) return false;
        // Karta s bang-efektem (Úder, …) mimo zelené: nepočítá se do limitu Bang!.
        // Vystřelit lze i sám na sebe (pravidla to umožňují), takže je hratelná vždy –
        // i když není v dostřelu žádný soupeř (na sebe se klikne přes vlastní postavu).
        if (card.bangEffect && !card.green) {
            return true;
        }
        if (card.type === "Bang!" || (effectiveCharacter(me) === "Calamity Janet" && card.type === "Vedle!")) {
            if (bangBlockedFor(state, myIndex)) return false;   // Kazatel (High Noon)
            if (bangLimitFree(state, me)) return true;
            // Fistful – Odražená střela se do limitu 1× Bang!/tah NEpočítá (R2): i s
            // vyčerpaným limitem je karta hratelná, jen s ní jde střílet výhradně na
            // vyloženou kartu soupeře (klient podle bangAtPlayerOk zhasne postavy).
            return ricochetAvailable(state, me, myIndex);
        }
        if (card.type === "Úhyb") return false; // Úhyb jen jako reakce (mimo tah), ne ve svém tahu
        // Zelené karty se vykládají na stůl; nelze mít 2 stejného jména (D7).
        if (card.green) return !(me.board || []).some(c => c.name === card.name);
        // Dodge City „odhoď další kartu": potřebuje aspoň 1 další kartu k odhození +
        // pro cílené efekty musí existovat smysluplný cíl (jinak by se nic nestalo).
        if (card.discardExtra) {
            if (me.hand.length < 2) return false;
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
        if (card.type === "Vedle!" && effectiveCharacter(me) !== "Calamity Janet") return false;
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
            const aliveCount = state.players.filter(p => p.health > 0).length;
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
    switch (getActionForCard(card, effectiveCharacter(me))) {
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
    if (!card || getActionForCard(card, effectiveCharacter(me)) !== 'SHOOT') return false;
    const reach = bangEffectReach(card);
    return !state.players.some((p, i) =>
        i !== myIndex && p.health > 0 && computeCanHit(state, myIndex, i, reach));
}

// Zamyká vynucená karta zbytek tahu? `card` = karta hraná Z RUKY; null (schopnost postavy,
// aktivace zelené karty ze stolu) je zamčené vždycky. Zrcadlo serverového _lawLocked.
function lawLocksOther(state, me, myIndex, card) {
    if (!me || me._lawCardId == null) return false;
    if (card && card.id === me._lawCardId) return false;
    return !!lawForcedCard(state, me, myIndex);
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
    return card.type === "Vedle!" || card.type === "Úhyb" ||
        (effectiveCharacter(me) === "Calamity Janet" && card.type === "Bang!") ||
        effectiveCharacter(me) === "Elena Fuente";
}

// Má hráč vůbec co odhodit? Kdo nemá, ztrácí 2 životy a efekt končí.
function rouletteHasCard(state, p) {
    if (!p) return false;
    return (p.hand || []).some(c => rouletteDiscardable(state, p, c, false)) ||
           (p.board || []).some(c => rouletteDiscardable(state, p, c, true));
}

// ── A Fistful of Cards – Odstřelovač a Odražená střela ──────────────────────
// Obě karty pracují s „kartou Bang!" v ruce, takže výčet co se za ni počítá je jeden
// jediný: Bang!, u Calamity Janet i Vedle!. Karta se HRAJE z ruky, proto přes ni musí
// projít i Želízka (High Noon). Karty s bang-EFEKTEM (Úder, Nůž…) kartami Bang! nejsou,
// a protože mají vlastní typ, vypadnou samy.
function bangCardFromHand(state, me, myIndex, card) {
    if (!card || card._placeholder) return false;
    if (suitBlockedFor(state, myIndex, card)) return false;
    return card.type === "Bang!" ||
        (effectiveCharacter(me) === "Calamity Janet" && card.type === "Vedle!");
}

// Zbývá hráči volný limit karet Bang! na tenhle tah? (Willy the Kid a Volcanic ho nemají;
// Laso zbraň na stole vypíná, takže s ním Volcanic neplatí. Přestřelka zvedá limit na 2.)
function bangLimitFree(state, me) {
    if (effectiveCharacter(me) === "Willy the Kid") return true;
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
    if (bangBlockedFor(state, myIndex)) return false;   // Kazatel (High Noon)
    // Právo západu: dokud drží vynucenou kartu, smí ven jen ona (zrcadlo _lawLocked).
    return !lawLocksOther(state, me, myIndex, card);
}

// Je vyložená karta hráče `targetIdx` platným cílem Odražené střely? Dostřel platí jako
// u normálního Bang! (R1) a na vlastní karty se střílet nedá.
function ricochetTargetOk(state, myIndex, targetIdx) {
    if (targetIdx === myIndex) return false;
    const t = state.players[targetIdx];
    return !!t && isInPlay(t) && computeCanHit(state, myIndex, targetIdx);
}

// Je vůbec na co střílet? (Jediné, kvůli čemu je karta Bang! hratelná i s vyčerpaným
// limitem – bez cíle by šla vybrat a nedala se s ní udělat vůbec nic.)
function ricochetAvailable(state, me, myIndex) {
    if (!eventActive(state, 'ODRAZENA_STRELA')) return false;
    return state.players.some((p, i) => ricochetTargetOk(state, myIndex, i) &&
        ((p.weapon && p.weapon.id !== -1) || (p.board || []).length > 0));
}

// Odstřelovač: „Hráč smí ve svém tahu odhodit 2 karty Bang! najednou proti jinému hráči."
// Smí hráč TEĎ nabídnout Odstřelovače s touhle kartou jako první ze dvou? Počítá se jako
// zahrání Bang! (R4), takže platí limit i Kazatel – a v ruce musí být druhá karta Bang!
// a v dostřelu někdo, na koho zamířit.
function sniperOffer(state, me, myIndex, card) {
    if (!eventActive(state, 'ODSTRELOVAC')) return false;
    if (!isPlayTurn(state, myIndex)) return false;
    if (!bangCardFromHand(state, me, myIndex, card)) return false;
    if (bangBlockedFor(state, myIndex)) return false;   // Kazatel (High Noon)
    if (!bangLimitFree(state, me)) return false;
    if (lawLocksOther(state, me, myIndex, card)) return false;   // Právo západu
    const other = (me.hand || []).some(c => c && c.id !== card.id && bangCardFromHand(state, me, myIndex, c));
    if (!other) return false;
    return state.players.some((p, i) => i !== myIndex && isInPlay(p) && computeCanHit(state, myIndex, i));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cardPlayability, lawForcedCard, lawSelfShootOnly, lawLocksOther,
                       rouletteDiscardable, rouletteHasCard,
                       bangCardFromHand, bangLimitFree, bangAtPlayerOk,
                       ricochetOffer, ricochetTargetOk, ricochetAvailable, sniperOffer };
}
