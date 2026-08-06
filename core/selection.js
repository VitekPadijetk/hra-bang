// Čistý reducer kliknutí na kartu v ruce: (kontext kliknutí) -> "intent".
// NEPROVÁDÍ žádné vedlejší efekty (žádný socket.emit, mutace stavu ani render) – jen
// rozhodne, CO se má stát. Vedlejší efekty vykonává dispatcher v game.js.
// Díky tomu je celá vstupní logika ruky testovatelná bez Phaseru.
//
// Vrací jeden z intentů:
//   { type: 'NONE' }                                  – nic (blokováno / placeholder / není můj tah)
//   { type: 'RENDER' }                                – jen překreslit
//   { type: 'DESELECT' }                              – zrušit výběr karty
//   { type: 'SID_STAGE', index, cardId }              – Sid Ketchum: připravit 1. kartu
//   { type: 'SID_DISCARD_BOTH', cardIdx1, cardIdx2 }  – Sid Ketchum: odhodit obě → léčení
//   { type: 'BEER_DYNAMITE_SAVE', index }             – Pivo při výbuchu dynamitu (poslední život)
//   { type: 'BEER_NOON_SAVE', index }                 – Pivo při Pravém poledni (poslední život)
//   { type: 'UNPLAYABLE_FLASH' }                      – karta nehratelná (červené bliknutí)
//   { type: 'RESPOND_BEER', index }                   – Pivo jako záchrana při posledním životě
//   { type: 'RESPOND', index }                        – obranná karta (Vedle!/Bang!)
//   { type: 'DISCARD', index }                        – odhození ve fázi DISCARD
//   { type: 'SELECT', index, action }                 – výběr karty k zahrání

if (typeof require === 'function') {
    if (typeof isResponseTurn === 'undefined') {
        const __ph = require('./phaseInfo.js');
        globalThis.isResponseTurn = __ph.isResponseTurn;
        globalThis.canActOnHand = __ph.canActOnHand;
    }
    if (typeof getActionForCard === 'undefined') {
        globalThis.getActionForCard = require('./cardRules.js').getActionForCard;
    }
    if (typeof effectiveCharacter === 'undefined') {
        globalThis.effectiveCharacter = require('./distance.js').effectiveCharacter;
    }
}

function decideCardClick(ctx) {
    const { state, me, myIndex, selectedState, card, index, blockInput, isMySidActive, playable } = ctx;

    if (blockInput) return { type: 'NONE' };
    if (card._placeholder) return { type: 'NONE' };

    // Odznačení už vybrané karty (mimo Sid režim)
    if (selectedState.cardIndex === index && !isMySidActive) {
        return { type: 'DESELECT' };
    }

    // Sid Ketchum: postupné označení dvou karet k odhození
    if (selectedState.sidKetchum !== undefined) {
        if (selectedState.sidKetchum.stagedIdx === undefined) {
            return { type: 'SID_STAGE', index, cardId: card.id };
        }
        const firstIdx = selectedState.sidKetchum.stagedIdx;
        if (firstIdx === index) return { type: 'RENDER' };
        return { type: 'SID_DISCARD_BOTH', cardIdx1: firstIdx, cardIdx2: index };
    }

    // Pivo ve fázi DYNAMITE_DAMAGE při posledním životě (před guardem na tah)
    if (state.phase === "DYNAMITE_DAMAGE" &&
        state.pendingDynamiteDamage?.playerIdx === myIndex &&
        me.health === 1 && card.type === "Pivo" &&
        state.players.filter(p => p.health > 0).length > 2) {
        return { type: 'BEER_DYNAMITE_SAVE', index };
    }

    // Totéž pro ztrátu života od Pravého poledne (High Noon).
    if (state.phase === "NOON_DAMAGE" &&
        state.pendingNoonDamage?.playerIdx === myIndex &&
        me.health === 1 && card.type === "Pivo" &&
        state.players.filter(p => p.health > 0).length > 2) {
        return { type: 'BEER_NOON_SAVE', index };
    }

    const isMyResponseTurn = isResponseTurn(state, myIndex);
    const isMyPlayTurn = canActOnHand(state, myIndex);
    if (!isMyResponseTurn && !isMyPlayTurn) return { type: 'NONE' };

    if (playable === false) return { type: 'UNPLAYABLE_FLASH' };

    if (isMyResponseTurn) {
        // Pivo jako záchrana při posledním životě
        if (card.type === "Pivo" && me.health === 1 &&
            state.players.filter(p => p.health > 0).length > 2) {
            return { type: 'RESPOND_BEER', index };
        }
        return { type: 'RESPOND', index };
    }

    if (state.phase === "DISCARD") {
        return { type: 'DISCARD', index };
    }

    return { type: 'SELECT', index, action: getActionForCard(card, effectiveCharacter(me)) };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { decideCardClick };
}
