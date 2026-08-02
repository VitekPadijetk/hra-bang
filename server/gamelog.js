// server/gamelog.js — perzistence strukturovaného herního logu (JSONL na hru) + stručný
// konzolový mirror. Factory installGameLog(ctx) dle vzoru server/*: vystaví `ctx.glog`.
//
// Dva sinky:
//   • soubor  logs/<roomId>_<ts>.jsonl  — PLNÝ detail (server-only, i skryté role/ruce)
//   • konzole                            — jeden stručný řádek na událost (formatEvent)
// Snapshoty jdou jen do souboru (aby konzole zůstala čitelná). system/error bez roomu
// jdou do logs/server.log. Logování nikdy neshodí hru (vše v try/catch).
//
// Rules-level události chodí přes injektovaný sink `gs._onEvent` (nastaví lifecycle.js) →
// glog.rule(). Ingress akce loguje server.js (onAny) a bots.js. Egress snapshot rooms.js.
const fs = require('fs');
const path = require('path');
const { snapshotState, formatEvent } = require('../core/gameLog.js');

module.exports = function installGameLog(ctx) {
    const logsDir = path.join(__dirname, '..', 'logs');
    try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) { /* ignore */ }

    let serverStream = null;
    try {
        serverStream = fs.createWriteStream(path.join(logsDir, 'server.log'), { flags: 'a' });
    } catch (_) { serverStream = null; }

    function tsStamp() { return new Date().toISOString(); }
    function fileStamp() { return tsStamp().replace(/[:.]/g, '-'); }

    // Zapiš JSON řádek do daného streamu (bezpečně).
    function writeLine(stream, obj) {
        if (!stream || stream.destroyed) return;
        try { stream.write(JSON.stringify(obj) + '\n'); } catch (_) { /* ignore */ }
    }

    // Jádro: doplní seq+ts, zapíše do souboru hry (nebo server.log) a zrcadlí do konzole.
    function emit(room, evt, { toConsole = true } = {}) {
        try {
            evt.ts = tsStamp();
            const stream = room && room._logStream;
            if (stream) {
                evt.seq = (room._logSeq = (room._logSeq || 0) + 1);
                writeLine(stream, evt);
            } else {
                writeLine(serverStream, evt);
            }
            if (toConsole) {
                const line = formatEvent(evt);
                if (evt.ev === 'error') console.error(line);
                else console.log(line);
            }
        } catch (_) { /* logování nesmí shodit hru */ }
    }

    // Krátký popis payloadu pro konzoli (targetIdx/cardIdx/… ), ať je řádek stručný.
    function summarizePayload(p) {
        if (p == null) return '';
        if (typeof p !== 'object') return String(p);
        const keys = ['targetIdx', 'attackerIdx', 'cardIdx', 'playerIdx', 'boardCardId', 'area', 'sourceIdx'];
        const parts = [];
        for (const k of keys) if (p[k] != null) parts.push(`${k}=${p[k]}`);
        return parts.join(' ');
    }

    // Popisek aktéra „Jméno#idx(role)". Atribuce přes idx, ne socket.id (debug mód).
    function actorLabel(gs, idx) {
        const p = gs && gs.players && gs.players[idx];
        if (!p) return `#${idx}`;
        return `${p.name}#${idx}(${p.role || '?'})`;
    }

    const glog = {
        // ── per-hra soubor ────────────────────────────────────────────────────
        openGame(room) {
            this.closeGame(room);
            try {
                const file = path.join(logsDir, `${room.id}_${fileStamp()}.jsonl`);
                room._logStream = fs.createWriteStream(file, { flags: 'a' });
                room._logSeq = 0;
                room._lastSnapSig = null;
                room._logPath = file;
                console.log(`📄 log hry: ${path.relative(process.cwd(), file)}`);
            } catch (_) { room._logStream = null; }
        },
        closeGame(room) {
            if (room && room._logStream) {
                try { room._logStream.end(); } catch (_) { /* ignore */ }
                room._logStream = null;
            }
        },

        // ── ingress: akce hráče/bota ──────────────────────────────────────────
        action(room, actor, event, payload) {
            const gs = room && room.gameState;
            emit(room, {
                ev: 'action',
                turn: gs ? gs.turnId : undefined,
                phase: gs ? gs.phase : undefined,
                actor,
                a: event,
                arg: summarizePayload(payload),
                payload,
            });
        },

        // ── ingress: akce zahozená guardem (čeká se na jiného hráče) ──────────
        // Typicky opožděný/dvojitý klik na pomalé lince. Loguje se, aby bylo z logu
        // hry poznat, že hráč klikal, ale hra ho (správně) neposlechla.
        reject(room, actor, event, reason) {
            const gs = room && room.gameState;
            emit(room, {
                ev: 'reject',
                turn: gs ? gs.turnId : undefined,
                phase: gs ? gs.phase : undefined,
                actor, a: event, reason,
            });
        },

        // ── rules-level událost z GameState (_onEvent sink) ───────────────────
        rule(room, evt) {
            // evt už má { ev, turn, phase, ... } z GameState.logEvent.
            emit(room, evt);
        },

        // ── egress: kompaktní snapshot stavu (jen do souboru, s dedup) ─────────
        snapshot(room) {
            const gs = room && room.gameState;
            if (!gs || !room._logStream) return;
            const snap = snapshotState(gs);
            const sig = JSON.stringify(snap);
            if (sig === room._lastSnapSig) return;   // debounced/delayed broadcast → nezdvojuj
            room._lastSnapSig = sig;
            emit(room, Object.assign({ ev: 'snapshot', turn: gs.turnId, phase: gs.phase }, snap),
                 { toConsole: false });
        },

        // ── provozní / chyby / klient ─────────────────────────────────────────
        system(msg, data) {
            emit(null, Object.assign({ ev: 'system', msg }, data || {}));
        },
        error(scope, err, room = null) {
            emit(room, {
                ev: 'error', scope,
                msg: err && err.message ? err.message : String(err),
                stack: err && err.stack ? err.stack : undefined,
            });
        },
        clientLog(room, entry) {
            emit(room, Object.assign({ ev: 'client' }, entry || {}));
        },

        actorLabel,
    };

    Object.assign(ctx, { glog });
    return ctx;
};
