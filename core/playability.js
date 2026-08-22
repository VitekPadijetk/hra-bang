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
    const isMyResponseTurn = isResponseTurn(state, myIndex);
    const isMyPlayTurn = isPlayTurn(state, myIndex);
    // High Noon – Želízka: ve svém tahu jen karty zvolené barvy (i jako reakce).
    if ((isMyResponseTurn || isMyPlayTurn) && suitBlockedFor(state, myIndex, card)) return false;
    if (isMyResponseTurn) {
        const req = state.pendingResponse.requiredCard;
        const _aliveForBeer = state.players.filter(p => p.health > 0).length;
        // Pivo jako záchrana při posledním životě (Reverend ho zakazuje – High Noon)
        if (card.type === "Pivo" && me.health === 1 && _aliveForBeer > 2) return !beerBlockedFor(state);
        // Elena Fuente (Dodge City): libovolná karta z ruky funguje jako Vedle!.
        if (req === "Vedle!") return card.type === "Vedle!" || card.type === "Úhyb" ||
            (effectiveCharacter(me) === "Calamity Janet" && card.type === "Bang!") || effectiveCharacter(me) === "Elena Fuente";
        // Kazatel (High Noon): Bang! nesmí hráč zahrát ani jako reakci ve svém tahu (FAQ H2).
        if (req === "Bang!")  return (card.type === "Bang!" || (effectiveCharacter(me) === "Calamity Janet" && card.type === "Vedle!"))
            && !bangBlockedFor(state, myIndex);
        return false;
    }
    if (isMyPlayTurn) {
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
            const isWilly = effectiveCharacter(me) === "Willy the Kid";
            // Laso (Fistful): zbraň na stole nemá efekt → ani Volcanic nedovolí Bang! bez limitu.
            const hasVolcanic = !boardDeadFor(state) && me.weapon?.name?.includes("Volcanic");
            return isWilly || hasVolcanic || me.bangsPlayedThisTurn < bangLimitFor(state);
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
            return state.players.some((p, i) => other(i) && computeCanHit(state, myIndex, i, bangEffectReach(card)));
        case 'Panika!':
            return state.players.some((p, i) => other(i) && hasCards(p) && computeDistance(state, myIndex, i) <= 1);
        case 'Cat Balou':
        case 'DE_STEAL':
            return state.players.some((p, i) => other(i) && hasCards(p));
        default:
            return true;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cardPlayability, lawForcedCard };
}
