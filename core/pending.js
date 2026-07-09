// core/pending.js — ČISTÁ izomorfní logika „na koho hra čeká".
// Jediný zdroj pravdy sdílený botem (core/botPolicy.js) i klientem (view/board.js):
//   pendingActor(state)              -> { idx, kind } | null   — na koho a na jaké rozhodnutí hra čeká
//   waitingStatus(state)             -> { idx, kind, text } | null — lidsky čitelný status pro UI štítek
//   describePendingResponse(state,v) -> { forMe, attackerName, targetName, sourceLabel, need } | null
// Globál v prohlížeči (<script> v index.html), require v Node/testech. Viz CLAUDE.md.

// ── pendingActor — kdo a jaké rozhodnutí hra očekává ─────────────────────────
function pendingActor(state) {
    switch (state.phase) {
        case 'CHARACTER_SELECT': {
            const keep = state.players.findIndex(p => p._awaitingKeepChoice);
            if (keep !== -1) return { idx: keep, kind: 'KEEP_CHOICE' };
            const pick = state.players.findIndex(p => !p.character && p.charChoices && p.charChoices.length);
            return pick === -1 ? null : { idx: pick, kind: 'CHARACTER_SELECT' };
        }
        case 'PLAY':    return { idx: state.currentPlayerIndex, kind: 'PLAY' };
        case 'DISCARD': return { idx: state.currentPlayerIndex, kind: 'DISCARD' };
        case 'DRAW':    return state.drawPhaseState?.active ? { idx: state.drawPhaseState.playerIdx, kind: 'DRAW' } : null;
        case 'KIT_CARLSON':      return { idx: state.currentPlayerIndex, kind: 'KIT_CARLSON' };
        case 'BLACK_JACK_CHECK': return { idx: state.drawPhaseState?.playerIdx ?? state.currentPlayerIndex, kind: 'BLACK_JACK_CHECK' };
        case 'RESPOND':          return state.pendingResponse?.active ? { idx: state.pendingResponse.targetIdx, kind: 'RESPOND' } : null;
        case 'STORE':            return { idx: state.storePickerIndex, kind: 'STORE' };
        case 'BARREL_DRAW':      return state.pendingBarrelCheck?.active ? { idx: state.pendingBarrelCheck.targetIdx, kind: 'BARREL_DRAW' } : null;
        case 'CHECK_DRAW':       return state.pendingCheckDraw?.active ? { idx: state.pendingCheckDraw.playerIdx, kind: 'CHECK_DRAW' } : null;
        case 'CHECKING':         return state.currentCheck ? { idx: state.currentCheck.playerIdx, kind: 'CHECKING' } : null;
        case 'LUCKY_DUKE':       return state.luckyDukeState ? { idx: state.luckyDukeState.checkContext.playerIdx, kind: 'LUCKY_DUKE' } : null;
        case 'DYNAMITE_DAMAGE':  return state.pendingDynamiteDamage ? { idx: state.pendingDynamiteDamage.playerIdx, kind: 'DYNAMITE_DAMAGE' } : null;
        case 'SELECTING_TARGET_CARD': return state.pendingSelection ? { idx: state.pendingSelection.attackerIdx, kind: 'SELECTING_TARGET_CARD' } : null;
        case 'BART_DRAW':        return state.pendingBartDraw ? { idx: state.pendingBartDraw.playerIdx, kind: 'BART_DRAW' } : null;
        case 'EL_GRINGO_STEAL':  return state.pendingElGringoSteal ? { idx: state.pendingElGringoSteal.playerIdx, kind: 'EL_GRINGO_STEAL' } : null;
        case 'SUZY_DRAW':        return state.pendingSuzyDraw ? { idx: state.pendingSuzyDraw.playerIdx, kind: 'SUZY_DRAW' } : null;
        case 'UHYB_DRAW':        return state.pendingUhybDraw ? { idx: state.pendingUhybDraw.playerIdx, kind: 'UHYB_DRAW' } : null;
        // Dodge City – „odhoď další kartu": cíl se volí PŘED zaplacením, pak se čeká
        // jen na výběr ceny (DISCARD_ANOTHER). Následný steal/rvačka běží přes SELECTING_TARGET_CARD.
        case 'DISCARD_ANOTHER':  return state.pendingDiscardAnother ? { idx: state.pendingDiscardAnother.playerIdx, kind: 'DISCARD_ANOTHER' } : null;
        // Dodge City – Vera Custer si na začátku tahu volí, kterou postavu kopíruje.
        case 'VERA_COPY':        return state.pendingVeraCopy ? { idx: state.pendingVeraCopy.playerIdx, kind: 'VERA_COPY' } : null;
        default: return null;
    }
}

// ── waitingStatus — krátký český popis, co čekaný hráč právě řeší ─────────────
const _WAIT_LABELS = {
    KEEP_CHOICE:           'vybírá postavu',
    CHARACTER_SELECT:      'vybírá postavu',
    PLAY:                  'na tahu',
    DISCARD:               'odhazuje karty',
    DRAW:                  'líže si karty',
    KIT_CARLSON:           'Kit Carlson – vybírá karty',
    BLACK_JACK_CHECK:      'Black Jack – druhá karta',
    RESPOND:               'brání se',
    STORE:                 'vybírá v hokynářství',
    BARREL_DRAW:           'kontrola barelu',
    CHECK_DRAW:            'kontrola',
    CHECKING:              'kontrola',
    LUCKY_DUKE:            'Lucky Duke – vybírá kartu',
    DYNAMITE_DAMAGE:       'výbuch dynamitu',
    SELECTING_TARGET_CARD: 'vybírá kartu soupeře',
    BART_DRAW:             'Bart Cassidy – líže za zranění',
    EL_GRINGO_STEAL:       'El Gringo – bere kartu',
    SUZY_DRAW:             'Suzy Lafayette – líže si kartu',
    UHYB_DRAW:             'Úhyb – líže si kartu',
    DISCARD_ANOTHER:       'odhazuje další kartu',
    VERA_COPY:             'Vera Custer – kopíruje postavu',
};

function waitingStatus(state) {
    const pa = pendingActor(state);
    if (!pa) return null;
    let text = _WAIT_LABELS[pa.kind] || '';
    if (pa.kind === 'RESPOND' && state.pendingResponse?.sourceCard) {
        text = 'brání se proti ' + state.pendingResponse.sourceCard;
    }
    return { idx: pa.idx, kind: pa.kind, text };
}

// ── describePendingResponse — co ohrožuje hráče ve fázi RESPOND ───────────────
function describePendingResponse(state, viewerIdx) {
    const pr = state.pendingResponse;
    if (!pr || !pr.active) return null;
    const attacker = state.players[pr.originatorIdx];
    const target = state.players[pr.targetIdx];

    let need;
    if (pr.requiredCard === 'Vedle!') {
        const total = state.missesRequired || 1;
        const done = state.missesPlayed || 0;
        const remaining = Math.max(1, total - done);
        need = remaining > 1 ? remaining + '× Vedle!' : 'Vedle!';
    } else {
        need = pr.requiredCard || 'Vedle!';
    }

    return {
        forMe: pr.targetIdx === viewerIdx,
        attackerName: attacker ? attacker.name : '?',
        targetName: target ? target.name : '?',
        sourceLabel: pr.sourceCard,
        requiredCard: pr.requiredCard,
        need,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pendingActor, waitingStatus, describePendingResponse };
}
