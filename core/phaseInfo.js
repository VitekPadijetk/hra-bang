// Čisté predikáty „čí je tah / co smí hráč dělat" podle herního stavu.
// BEZ závislosti na Phaseru/DOM. Izomorfní: v prohlížeči globály, v Node/testech require.
//
// POZOR na rozdíl mezi isPlayTurn a canActOnHand:
//   - isPlayTurn   = můj tah ve fázi PLAY (aktivní hraní karet, zvýraznění hratelnosti).
//   - canActOnHand = můj tah ve fázi PLAY *nebo* DISCARD (smím vůbec kliknout na kartu v ruce).
// Tyto dvě se v původním game.js lišily; sloučit by změnilo chování.

function isResponseTurn(state, myIndex) {
    return state.phase === "RESPOND"
        && !!state.pendingResponse?.active
        && state.pendingResponse.targetIdx === myIndex;
}

function isPlayTurn(state, myIndex) {
    return state.currentPlayerIndex === myIndex && state.phase === "PLAY";
}

function canActOnHand(state, myIndex) {
    return state.currentPlayerIndex === myIndex
        && (state.phase === "PLAY" || state.phase === "DISCARD");
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isResponseTurn, isPlayTurn, canActOnHand };
}
