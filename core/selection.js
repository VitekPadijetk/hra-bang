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
//   { type: 'RANCH_TOGGLE', index, cardId }           – Ranč (Fistful): označit/odznačit k výměně
//   { type: 'ROULETTE_DISCARD', index, cardId }       – Ruská ruleta (Fistful): odhoď kartu Vedle!
//   { type: 'SELECT', index, action }                 – výběr karty k zahrání

if (typeof require === 'function') {
    // Každý svůj guard: isResponseTurn si z phaseInfo.js bere i playability.js (a přes
    // něj logic.js), takže společná podmínka by canActOnHand tiše přeskočila.
    if (typeof isResponseTurn === 'undefined') {
        globalThis.isResponseTurn = require('./phaseInfo.js').isResponseTurn;
    }
    if (typeof canActOnHand === 'undefined') {
        globalThis.canActOnHand = require('./phaseInfo.js').canActOnHand;
    }
    if (typeof getActionForCard === 'undefined') {
        globalThis.getActionForCard = require('./cardRules.js').getActionForCard;
    }
    if (typeof effectiveCharacter === 'undefined') {
        globalThis.effectiveCharacter = require('./distance.js').effectiveCharacter;
    }
    if (typeof beerBlockedFor === 'undefined') {
        globalThis.beerBlockedFor = require('./highNoon.js').beerBlockedFor;
    }
    // Divoký západ – Zúčtování: karta, jejíž vlastní akce teď nejde, míří rovnou.
    if (typeof turnActionForCard === 'undefined') {
        globalThis.turnActionForCard = require('./playability.js').turnActionForCard;
    }
    // Duch (Město duchů) se počítá za hráče ve hře – pravidlo „při dvou hráčích Pivo
    // nefunguje" se ho proto ptá přes inPlayCount, ne přes health > 0.
    if (typeof inPlayCount === 'undefined') {
        globalThis.inPlayCount = require('./distance.js').inPlayCount;
    }
}

function decideCardClick(ctx) {
    const { state, me, myIndex, selectedState, card, index, blockInput, isMySidActive, playable } = ctx;

    if (blockInput) return { type: 'NONE' };
    if (card._placeholder) return { type: 'NONE' };

    // Fistful – Ranč: po fázi lízání se z ruky VYBÍRÁ, co vyměnit. Je to vlastní fáze
    // (RANCH), takže sem musí přijít dřív, než se cokoli ptá na „můj tah ve fázi PLAY".
    if (state.phase === "RANCH" && state.pendingRanch?.playerIdx === myIndex) {
        return { type: 'RANCH_TOGGLE', index, cardId: card.id };
    }

    // Fistful – Ruská ruleta: odhod karty Vedle! probíhá MIMO tah i mimo obranu (kolečko
    // od šerifa), takže se ptá stejně brzy jako Ranč. Klikatelné jsou jen platné karty –
    // hratelnost hlídá cardPlayability (`playable`), odhod je povinný.
    if (state.phase === "ROULETTE_DISCARD" && state.pendingRoulette?.playerIdx === myIndex) {
        return playable === true ? { type: 'ROULETTE_DISCARD', index, cardId: card.id }
                                 : { type: 'UNPLAYABLE_FLASH' };
    }

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

    // Pivo ve fázi DYNAMITE_DAMAGE při posledním životě (před guardem na tah).
    // Reverend (High Noon) zakazuje Pivo i jako záchranu před vyřazením – server ho
    // odmítne (beerLastLifeSave), takže tady se ani nesmí nabízet.
    if (state.phase === "DYNAMITE_DAMAGE" &&
        state.pendingDynamiteDamage?.playerIdx === myIndex &&
        me.health === 1 && card.type === "Pivo" && !beerBlockedFor(state) &&
        inPlayCount(state.players) > 2) {
        return { type: 'BEER_DYNAMITE_SAVE', index };
    }

    // Totéž pro ztrátu života od Pravého poledne (High Noon).
    if (state.phase === "NOON_DAMAGE" &&
        state.pendingNoonDamage?.playerIdx === myIndex &&
        me.health === 1 && card.type === "Pivo" && !beerBlockedFor(state) &&
        inPlayCount(state.players) > 2) {
        return { type: 'BEER_NOON_SAVE', index };
    }

    const isMyResponseTurn = isResponseTurn(state, myIndex);
    const isMyPlayTurn = canActOnHand(state, myIndex);
    if (!isMyResponseTurn && !isMyPlayTurn) return { type: 'NONE' };

    if (playable === false) return { type: 'UNPLAYABLE_FLASH' };

    if (isMyResponseTurn) {
        // Pivo jako záchrana při posledním životě
        if (card.type === "Pivo" && me.health === 1 &&
            inPlayCount(state.players) > 2) {
            return { type: 'RESPOND_BEER', index };
        }
        return { type: 'RESPOND', index };
    }

    if (state.phase === "DISCARD") {
        return { type: 'DISCARD', index };
    }

    // Divoký západ – Zúčtování: hratelná může být i karta, jejíž VLASTNÍ akce zrovna
    // nedává smysl (Vedle!/Úhyb ve svém tahu, druhá zelená téhož jména). Tehdy zbývá
    // jediné využití – výstřel – a míří se rovnou, bez přepínače (turnActionForCard).
    // Karty, které svou akci mají, si ji ponechají a na Bang! se přepnou tlačítkem
    // (viz view/board.js).
    return { type: 'SELECT', index, action: turnActionForCard(state, me, myIndex, card) };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { decideCardClick };
}
