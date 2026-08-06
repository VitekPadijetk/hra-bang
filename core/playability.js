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
}

function cardPlayability(state, me, myIndex, card) {
    if (card?._placeholder) return null;
    const isMyResponseTurn = isResponseTurn(state, myIndex);
    const isMyPlayTurn = isPlayTurn(state, myIndex);
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
        // Karta s bang-efektem (Úder, …) mimo zelené: nepočítá se do limitu Bang!.
        // Vystřelit lze i sám na sebe (pravidla to umožňují), takže je hratelná vždy –
        // i když není v dostřelu žádný soupeř (na sebe se klikne přes vlastní postavu).
        if (card.bangEffect && !card.green) {
            return true;
        }
        if (card.type === "Bang!" || (effectiveCharacter(me) === "Calamity Janet" && card.type === "Vedle!")) {
            if (bangBlockedFor(state, myIndex)) return false;   // Kazatel (High Noon)
            const isWilly = effectiveCharacter(me) === "Willy the Kid";
            const hasVolcanic = me.weapon?.name?.includes("Volcanic");
            return isWilly || hasVolcanic || me.bangsPlayedThisTurn < bangLimitFor(state);
        }
        if (card.type === "Úhyb") return false; // Úhyb jen jako reakce (mimo tah), ne ve svém tahu
        // Zelené karty se vykládají na stůl; nelze mít 2 stejného jména (D7).
        if (card.green) return !(me.board || []).some(c => c.name === card.name);
        // Dodge City „odhoď další kartu": potřebuje aspoň 1 další kartu k odhození +
        // pro cílené efekty musí existovat smysluplný cíl (jinak by se nic nestalo).
        if (card.discardExtra) {
            if (me.hand.length < 2) return false;
            if (card.discardExtra === 'heal_self_2') return me.health < me.maxHealth;
            if (card.discardExtra === 'heal_any') return state.players.some(p => p.health > 0 && p.health < p.maxHealth);
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
            if (me.health >= me.maxHealth) return false;
            return true;
        }
        if (card.type === "Salon") return state.players.some(p => p.health > 0 && p.health < p.maxHealth);
        if (["Zbraň","Barel","Vybavení","Dynamit"].includes(card.type)) {
            if (card.type === "Zbraň") { if (me.weapon?.id !== -1 && me.weapon?.name === card.name) return false; }
            else { if ((me.board||[]).some(c => c.name === card.name)) return false; }
            return true;
        }
        return true;
    }
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cardPlayability };
}
