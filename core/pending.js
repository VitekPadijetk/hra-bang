// core/pending.js — ČISTÁ izomorfní logika „na koho hra čeká".
// Jediný zdroj pravdy sdílený botem (core/botPolicy.js) i klientem (view/board.js):
//   pendingActor(state)              -> { idx, kind } | null   — na koho a na jaké rozhodnutí hra čeká
//   waitingStatus(state)             -> { idx, kind, text } | null — lidsky čitelný status pro UI štítek
//   describePendingResponse(state,v) -> { forMe, attackerName, targetName, sourceLabel, need } | null
//   describePendingCheck(state,v)    -> { forMe, kind, short, title, detail, waitingName } | null — co a proč se líže
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
        // Fistful – Claus "The Saint": rozdává po jedné kartě ostatním hráčům.
        case 'CLAUS_GIVE':       return state.clausState ? { idx: state.currentPlayerIndex, kind: 'CLAUS_GIVE' } : null;
        case 'BLACK_JACK_CHECK': return { idx: state.drawPhaseState?.playerIdx ?? state.currentPlayerIndex, kind: 'BLACK_JACK_CHECK' };
        case 'RESPOND':          return state.pendingResponse?.active ? { idx: state.pendingResponse.targetIdx, kind: 'RESPOND' } : null;
        case 'STORE':            return { idx: state.storePickerIndex, kind: 'STORE' };
        case 'BARREL_DRAW':      return state.pendingBarrelCheck?.active ? { idx: state.pendingBarrelCheck.targetIdx, kind: 'BARREL_DRAW' } : null;
        case 'CHECK_DRAW':       return state.pendingCheckDraw?.active ? { idx: state.pendingCheckDraw.playerIdx, kind: 'CHECK_DRAW' } : null;
        case 'CHECKING':         return state.currentCheck ? { idx: state.currentCheck.playerIdx, kind: 'CHECKING' } : null;
        case 'LUCKY_DUKE':       return state.luckyDukeState ? { idx: state.luckyDukeState.checkContext.playerIdx, kind: 'LUCKY_DUKE' } : null;
        case 'DYNAMITE_DAMAGE':  return state.pendingDynamiteDamage ? { idx: state.pendingDynamiteDamage.playerIdx, kind: 'DYNAMITE_DAMAGE' } : null;
        // High Noon – Pravé poledne: ztráta života na začátku tahu (klik na životy).
        case 'NOON_DAMAGE':      return state.pendingNoonDamage ? { idx: state.pendingNoonDamage.playerIdx, kind: 'NOON_DAMAGE' } : null;
        // High Noon (přibalené) – Želízka: volba barvy po lízání; Nová identita: výměna postavy.
        case 'HANDCUFFS_SUIT':   return state.pendingHandcuffs ? { idx: state.pendingHandcuffs.playerIdx, kind: 'HANDCUFFS_SUIT' } : null;
        // Fistful – Peyote: hádá barvu místo lízání; Ranč: po lízání mění karty z ruky.
        case 'PEYOTE':           return state.pendingPeyote ? { idx: state.pendingPeyote.playerIdx, kind: 'PEYOTE' } : null;
        case 'RANCH':            return state.pendingRanch ? { idx: state.pendingRanch.playerIdx, kind: 'RANCH' } : null;
        // Fistful – Pokrevní bratři: na začátku tahu smí hráč darovat 1 život zraněnému.
        case 'BLOOD_BROTHERS':   return state.pendingBlood ? { idx: state.pendingBlood.playerIdx, kind: 'BLOOD_BROTHERS' } : null;
        // Fistful – Ruská ruleta: kolečko „odhoď kartu Vedle!" (mimo tah i mimo obranu).
        case 'ROULETTE_DISCARD': return state.pendingRoulette ? { idx: state.pendingRoulette.playerIdx, kind: 'ROULETTE_DISCARD' } : null;
        // Divoký západ – Youl Grinner: kdo má víc karet než on, dá mu jednu (před lízáním).
        case 'GRINNER_GIVE':     return state.pendingGrinner?.queue?.length
            ? { idx: state.pendingGrinner.queue[0], kind: 'GRINNER_GIVE' } : null;
        case 'NEW_IDENTITY':     return state.pendingNewIdentity ? { idx: state.pendingNewIdentity.playerIdx, kind: 'NEW_IDENTITY' } : null;
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
    CLAUS_GIVE:            'Claus the Saint – rozděluje karty',
    BLACK_JACK_CHECK:      'Black Jack – druhá karta',
    RESPOND:               'brání se',
    STORE:                 'vybírá v hokynářství',
    BARREL_DRAW:           'kontrola barelu',
    CHECK_DRAW:            'kontrola',
    CHECKING:              'kontrola',
    LUCKY_DUKE:            'Lucky Duke – vybírá kartu',
    DYNAMITE_DAMAGE:       'výbuch dynamitu',
    NOON_DAMAGE:           'Pravé poledne – ztrácí život',
    HANDCUFFS_SUIT:        'Želízka – volí barvu',
    PEYOTE:                'Peyote – hádá barvu',
    RANCH:                 'Ranč – vyměňuje karty',
    BLOOD_BROTHERS:        'Pokrevní bratři – rozdává život',
    ROULETTE_DISCARD:      'Ruská ruleta – odhazuje Vedle!',
    GRINNER_GIVE:          'Youl Grinner – dává kartu',
    NEW_IDENTITY:          'Nová identita – rozmýšlí si postavu',
    SELECTING_TARGET_CARD: 'vybírá kartu soupeře',
    BART_DRAW:             'Bart Cassidy – líže za zranění',
    EL_GRINGO_STEAL:       'El Gringo – bere kartu',
    SUZY_DRAW:             'Suzy Lafayette – líže si kartu',
    UHYB_DRAW:             'Úhyb – líže si kartu',
    DISCARD_ANOTHER:       'odhazuje další kartu',
    VERA_COPY:             'Vera Custer – kopíruje postavu',
};

// Karta, která útok skutečně spustila. `sourceCard` je TYP efektu (Houfnice se řeší
// jako Kulomet, Nůž/Derringer/Úder jako Bang!) – pro hráče ale musí být vidět reálně
// zahraná karta, proto má přednost `sourceCardName` (doplní ji logic/*).
function _sourceLabel(pr) {
    return pr?.sourceCardName || pr?.sourceCard || null;
}

function waitingStatus(state) {
    const pa = pendingActor(state);
    if (!pa) return null;
    let text = _WAIT_LABELS[pa.kind] || '';
    if (pa.kind === 'RESPOND' && state.pendingResponse?.sourceCard) {
        text = 'brání se proti ' + _sourceLabel(state.pendingResponse);
    }
    // Víc Vulture Samů si dělí karty vyřazeného hráče (viz logic/characters.js).
    if (pa.kind === 'SELECTING_TARGET_CARD' && state.pendingSelection?.isVultureSplit) {
        text = 'Vulture Sam – dělí karty vyřazeného';
    }
    // High Noon – Daltonové: hráč vybírá kartu na VLASTNÍM stole, ne soupeřovu.
    if (pa.kind === 'SELECTING_TARGET_CARD' && state.pendingSelection?.isDaltons) {
        text = 'Daltonové – odhazuje modrou kartu';
    }
    return { idx: pa.idx, kind: pa.kind, text };
}

// ── describePendingResponse — co ohrožuje hráče ve fázi RESPOND ───────────────
function describePendingResponse(state, viewerIdx) {
    const pr = state.pendingResponse;
    if (!pr || !pr.active) return null;
    // Fistful of Cards útočí BEZ útočníka (jako dynamit) → attackerName zůstane null
    // a UI větu „od hráče X" vynechá.
    const attacker = pr.originatorIdx == null ? null : state.players[pr.originatorIdx];
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

    // Fistful – Odražená střela: neohrožuje život, ale konkrétní vyloženou kartu. UI
    // podle toho mění výzvu („nech kartu zničit" místo „schytej zásah") a zvýrazní ji.
    let ricochet = null;
    if (pr.ricochet) {
        const owner = state.players[pr.ricochet.targetIdx];
        const card = pr.ricochet.area === 'weapon'
            ? (owner?.weapon && owner.weapon.id !== -1 ? owner.weapon : null)
            : (owner?.board || []).find(c => c && c.id === pr.ricochet.cardId) || null;
        ricochet = { targetIdx: pr.ricochet.targetIdx, area: pr.ricochet.area,
                     cardId: pr.ricochet.cardId, cardName: card ? card.name : null };
    }

    return {
        forMe: pr.targetIdx === viewerIdx,
        attackerName: attacker ? attacker.name : (pr.originatorIdx == null ? null : '?'),
        targetName: target ? target.name : '?',
        sourceLabel: _sourceLabel(pr),
        requiredCard: pr.requiredCard,
        need,
        ricochet,
    };
}

// ── describePendingCheck — kontrolní líznutí (Barel/Jourdonnais, Dynamit, Vězení) ─
// Vrací, CO se líže a PROČ, ať hráč u balíčku neklikne naslepo:
//   { forMe, kind, playerIdx, title, detail, waitingName } | null
// kind: 'BARREL' | 'JOURDONNAIS' | 'DYNAMITE' | 'JAIL'
function describePendingCheck(state, viewerIdx) {
    const nameOf = (idx) => state.players[idx]?.name || '?';

    if (state.phase === 'BARREL_DRAW' && state.pendingBarrelCheck?.active) {
        const pbc = state.pendingBarrelCheck;
        const isJourdonnais = pbc.reason === 'JOURDONNAIS';
        const left = pbc.checksLeft > 1 ? ` (2 pokusy)` : '';
        const from = pbc.attackerIdx != null && pbc.attackerIdx !== pbc.targetIdx
            ? ` od hráče ${nameOf(pbc.attackerIdx)}` : '';
        // Fistful – Ruská ruleta: sejmutí nahrazuje odhozenou kartu Vedle! (FAQ Q13),
        // takže „musíš zahrát Vedle!" by lhalo – odhazuje se, nehraje.
        if (pbc.roulette) {
            return {
                forMe: pbc.targetIdx === viewerIdx,
                kind: isJourdonnais ? 'JOURDONNAIS' : 'BARREL',
                playerIdx: pbc.targetIdx,
                waitingName: nameOf(pbc.targetIdx),
                short: isJourdonnais ? 'Jourdonnais' : 'Barel',
                title: (isJourdonnais ? '🛢️ Jourdonnais' : '🛢️ Barel') + ' – lízni si kontrolní kartu' + left,
                detail: `♥ = prošel jsi zadarmo, jinak musíš odhodit Vedle! · Ruská ruleta`,
            };
        }
        return {
            forMe: pbc.targetIdx === viewerIdx,
            kind: isJourdonnais ? 'JOURDONNAIS' : 'BARREL',
            playerIdx: pbc.targetIdx,
            waitingName: nameOf(pbc.targetIdx),
            short: isJourdonnais ? 'Jourdonnais' : 'Barel',
            title: (isJourdonnais ? '🛢️ Jourdonnais' : '🛢️ Barel') + ' – lízni si kontrolní kartu' + left,
            detail: `♥ = uhnul jsi (platí jako Vedle!), jinak musíš zahrát Vedle! · ${_sourceLabel(pbc) || 'Bang!'}${from}`,
        };
    }

    if (state.phase === 'CHECK_DRAW' && state.pendingCheckDraw?.active) {
        const pcd = state.pendingCheckDraw;
        // Fistful – Vendeta: sejmutí na KONCI tahu (nemá kartu na stole, jen důvod).
        if (pcd.reason === 'VENDETTA') {
            return {
                forMe: pcd.playerIdx === viewerIdx,
                kind: 'VENDETTA',
                playerIdx: pcd.playerIdx,
                waitingName: nameOf(pcd.playerIdx),
                short: 'Vendeta',
                title: '🔫 Vendeta – lízni si kontrolní kartu',
                detail: '♥ = hraješ ještě jeden tah, jinak tah končí',
            };
        }
        const isDynamite = pcd.dynamiteIdx !== null && pcd.dynamiteIdx !== undefined;
        return {
            forMe: pcd.playerIdx === viewerIdx,
            kind: isDynamite ? 'DYNAMITE' : 'JAIL',
            playerIdx: pcd.playerIdx,
            waitingName: nameOf(pcd.playerIdx),
            short: isDynamite ? 'Dynamit' : 'Vězení',
            title: isDynamite
                ? '💥 Dynamit – lízni si kontrolní kartu'
                : '🔒 Vězení – lízni si kontrolní kartu',
            detail: isDynamite
                ? '♠ 2–9 = dynamit vybuchne (−3 životy), jinak putuje dál'
                : '♥ = vyskočíš z vězení a hraješ, jinak tah přeskakuješ',
        };
    }

    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pendingActor, waitingStatus, describePendingResponse, describePendingCheck };
}
