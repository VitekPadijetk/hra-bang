// core/gameLog.js — ČISTÁ izomorfní logika strukturovaného herního logu.
// Definuje schéma událostí + dvě čisté funkce (bez fs/DOM/Phaseru):
//   snapshotState(gs)  -> kompaktní objekt stavu (role/ruce/board/HP/phase/pendingActor)
//   formatEvent(evt)   -> jednořádkový český řetězec pro konzoli (emoji dle konvence)
// Persistenci do souboru řeší server/gamelog.js; tenhle modul jen popisuje a formátuje.
// Globál v prohlížeči (<script> v index.html PŘED game.js), require v Node/testech.
// Viz „Izomorfní moduly" v CLAUDE.md.

// pendingActor je izomorfní: v prohlížeči globál z core/pending.js, v Node require.
if (typeof pendingActor === 'undefined' && typeof require === 'function') {
    globalThis.pendingActor = require('./pending.js').pendingActor;
}

// Typy událostí (ev). Rules-level je emituje GameState.logEvent; ingress/egress server.
const LogEvent = {
    GAMESTART: 'gamestart',
    ACTION:    'action',   // ingress: akce hráče/bota (server)
    REJECT:    'reject',   // ingress: akce zahozená guardem (čeká se na jiného hráče)
    TURN:      'turn',     // začátek tahu
    PLAY:      'play',     // zahrání karty (modrá/zelená/netargetovaná)
    BANG:      'bang',     // Bang! / bang-efekt
    SPECIAL:   'special',  // Vězení/Panika/Cat Balou/Duel/Kulomet/Indiáni…
    RESPOND:   'respond',  // reakce ve fázi RESPOND (obrana / žádná)
    DAMAGE:    'damage',   // ztráta života
    DEATH:     'death',    // smrt hráče
    DYNAMITE:  'dynamite', // zásah dynamitem
    CHECK:     'check',    // kontrolní líznutí (Dynamit/Vězení/Barel/Jourdonnais…)
    EVENT:     'event',    // High Noon: odkrytá karta události / její okamžitý efekt
    DRAW:      'draw',     // líznutí karty/karet
    RESHUFFLE: 'reshuffle',// promíchání balíčku
    WIN:       'win',      // konec hry
    SNAPSHOT:  'snapshot', // egress: kompaktní stav po broadcastu (server)
    SYSTEM:    'system',   // provozní (start serveru, lobby, chat, intro…)
    ERROR:     'error',    // chyba
    CLIENT:    'client',   // diagnostika z prohlížeče (chybějící textura, notify…)
};

// ── snapshotState — kompaktní, ale ÚPLNÝ (server-only, smí obsahovat skryté info) ──
function snapshotState(gs) {
    if (!gs || !Array.isArray(gs.players)) return { players: [] };
    const pa = (typeof pendingActor === 'function') ? pendingActor(gs) : null;
    return {
        cur: gs.currentPlayerIndex,
        winner: gs.winner || null,
        players: gs.players.map((p, i) => ({
            i,
            n: p.name,
            role: p.role,
            ch: p.character,
            hp: p.health,
            max: p.maxHealth,
            hand: (p.hand || []).map(c => c.name),
            board: (p.board || []).map(c => c.name),
            weapon: (p.weapon && p.weapon.id !== -1) ? p.weapon.name : null,
        })),
        pending: pa ? { idx: pa.idx, kind: pa.kind } : null,
        // High Noon: platná událost a zbytek balíčku (jen když se rozšíření hraje).
        event: gs.activeEvent ? gs.activeEvent.name : null,
        eventsLeft: gs.eventDeck?.length || 0,
        // Fistful of Cards: druhý balíček událostí, platí souběžně s High Noonem.
        eventFf: gs.activeFistful ? gs.activeFistful.name : null,
        ffLeft: gs.ffDeck?.length || 0,
    };
}

// ── formatEvent — jednořádkový český popis pro konzoli ───────────────────────
function formatEvent(evt) {
    if (!evt || typeof evt !== 'object') return String(evt);
    const t = (evt.turn != null) ? `T${evt.turn} ` : '';
    switch (evt.ev) {
        case LogEvent.GAMESTART: {
            const roster = (evt.players || []).map(p => `${p.n}(${p.role})`).join(', ');
            return `🎬 START ${evt.players ? evt.players.length : '?'}P: ${roster}`;
        }
        case LogEvent.ACTION:
            return `${t}▶ ${evt.actor}: ${evt.a}${evt.arg ? ' ' + evt.arg : ''}`;
        case LogEvent.REJECT:
            return `${t}⛔ ${evt.actor}: ${evt.a} zahozeno – ${evt.reason}`;
        case LogEvent.TURN:
            return `${t}── TAH ${evt.who}(${evt.role}) HP ${evt.hp}/${evt.max}, ruka ${evt.hand}`;
        case LogEvent.PLAY:
            return `${t}🃏 ${evt.who} → ${evt.card}${evt.target ? ' → ' + evt.target : ''}${evt.area ? ' [' + evt.area + ']' : ''}`;
        case LogEvent.BANG:
            return `${t}🎯 ${evt.who} → Bang! → ${evt.target}`;
        case LogEvent.SPECIAL:
            return `${t}✨ ${evt.who} → ${evt.card}${evt.target ? ' → ' + evt.target : ''}`;
        case LogEvent.RESPOND:
            return `${t}🛡 ${evt.who}: ${evt.card ? evt.card : (evt.defended ? 'obrana' : 'žádná obrana → zásah')}`;
        case LogEvent.DAMAGE:
            return `${t}💔 ${evt.who} ${evt.hp}${evt.by ? ' (od ' + evt.by + ')' : ''}${evt.src ? ' [' + evt.src + ']' : ''}`;
        case LogEvent.DEATH:
            return `${t}☠ ${evt.who}(${evt.role}) † zabil: ${evt.killer}${evt.reward ? ' → ' + evt.reward : ''}`;
        case LogEvent.DYNAMITE:
            return `${t}💥 ${evt.who} dynamit HP → ${evt.hp}${evt.hitsLeft != null ? ' (zbývá ' + evt.hitsLeft + ')' : ''}`;
        case LogEvent.CHECK:
            return `${t}🔍 ${evt.who} ${evt.kind}: ${evt.card} → ${evt.result}`;
        case LogEvent.EVENT:
            return `${t}🌵 UDÁLOST ${evt.card}${evt.left != null ? ' (zbývá ' + evt.left + ')' : ''}${evt.heal ? ' – léčí: ' + evt.heal.join(', ') : ''}`;
        case LogEvent.DRAW:
            return `${t}🂠 ${evt.who} líže ${evt.source || 'deck'}: ${Array.isArray(evt.cards) ? evt.cards.join(', ') : evt.cards}`;
        case LogEvent.RESHUFFLE:
            return `${t}🔀 balíček promíchán (${evt.count} karet)`;
        case 'deck_empty':
            return `${t}⚠ balíček i odhoz prázdné – nelze lízat`;
        case LogEvent.WIN:
            return `🏆 KONEC: ${evt.winner} | přeživší: ${(evt.survivors || []).join(', ')}`;
        case LogEvent.SNAPSHOT: {
            const hp = (evt.players || []).map(p => `${p.n}:${p.hp}`).join(' ');
            const pend = evt.pending ? ` čeká ${evt.pending.idx}/${evt.pending.kind}` : '';
            return `${t}· [${evt.phase}] cur=${evt.cur} ${hp}${pend}`;
        }
        case LogEvent.SYSTEM:
            return `ℹ ${evt.msg}`;
        case LogEvent.ERROR:
            return `❌ ${evt.scope}: ${evt.msg}`;
        case LogEvent.CLIENT:
            return `🖥 ${evt.level || 'log'}: ${evt.msg}`;
        default:
            return `${t}${evt.ev}: ${JSON.stringify(evt)}`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LogEvent, snapshotState, formatEvent };
}
