// server/reports.js — hlášení chyb ze hry (bug 73).
//
// Hráč napíše v herním menu, co se stalo; klient to pošle socketem ('bug_report')
// a tady se to uloží jako jeden JSON soubor do reports/<čas>_<místnost>.json. K textu
// se přibalí to, co je při ladění potřeba a co hráč sám nenapíše: jméno souboru
// herního logu (logs/*.jsonl), plný snímek stavu (core/gameLog.js – server-only, smí
// obsahovat skryté role i ruce, proto zůstává jen na serveru), otisk nasazeného kódu
// a kontext klienta (fáze, rozložení, prohlížeč).
//
// Jak se hlášení dostane na vývojový PC:
//   • LAN server běží přímo na něm → soubory už leží v reports/.
//   • Nasazený server → HTTP endpoint /admin/reports, chráněný tokenem z proměnné
//     prostředí BANG_ADMIN_TOKEN (bez ní, nebo s kratší než 16 znaků, endpoint
//     neexistuje – odpoví 404). Stahuje se nástrojem tools/pull-reports.js.
//     Token chodí jen v hlavičce Authorization (ne v URL – ta končí v logech proxy).
//
// Factory installReports(ctx) vystaví `ctx.saveBugReport(socket, payload)` a
// `ctx.mountAdminRoutes(app)`.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { snapshotState } = require('../core/gameLog.js');
const { cleanReportText, cleanReportContext, reportFileName, allowReport,
        REPORT_FILE_RE, REPORT_FILES_MAX } = require('../core/bugReport.js');

const LOG_FILE_RE = /^[A-Za-z0-9_-]{1,160}\.jsonl$/;

module.exports = function installReports(ctx, opts = {}) {
    const reportsDir = opts.reportsDir || path.join(__dirname, '..', 'reports');
    const logsDir = opts.logsDir || path.join(__dirname, '..', 'logs');
    const env = opts.env || process.env;
    // Razítka hlášení podle spojení (rate limit). Odpojený socket se tu jen přestane
    // objevovat; záznamů je nejvýš pár na spojení, takže se úklid nevyplatí řešit.
    const history = new Map();

    // Místnost, ke které hlášení patří: hráč, nebo divák (ten je jen v socket.io
    // kanálu <roomId>_spectators, findRoomBySocket ho nevidí – viz server/rooms.js).
    function roomOf(socket) {
        const asPlayer = ctx.findRoomBySocket?.(socket.id);
        if (asPlayer) return { room: asPlayer, spectator: false };
        for (const ch of socket.rooms || []) {
            if (typeof ch === 'string' && ch.endsWith('_spectators')) {
                const r = ctx.rooms?.get(ch.slice(0, -'_spectators'.length));
                if (r) return { room: r, spectator: true };
            }
        }
        return { room: null, spectator: false };
    }

    function countReports() {
        try { return fs.readdirSync(reportsDir).filter(f => REPORT_FILE_RE.test(f)).length; }
        catch (_) { return 0; }
    }

    function saveBugReport(socket, payload) {
        const t = cleanReportText(payload && payload.text);
        if (!t.ok) return { ok: false, error: t.error };
        const now = Date.now();
        const next = allowReport(history.get(socket.id), now);
        if (!next) return { ok: false, error: 'Hlášení posíláš moc často – zkus to za pár minut.' };
        try { fs.mkdirSync(reportsDir, { recursive: true }); } catch (_) { /* ignore */ }
        if (countReports() >= REPORT_FILES_MAX) {
            ctx.glog?.error?.('bug_report', 'reports/ je plný, hlášení odmítnuto');
            return { ok: false, error: 'Schránka hlášení je plná – dej vědět autorovi hry jinak.' };
        }
        history.set(socket.id, next);

        const { room, spectator } = roomOf(socket);
        const gs = room && room.gameState;
        const rp = room && !spectator ? room.players.find(p => p.socketId === socket.id) : null;
        let state = null;
        try { state = gs ? snapshotState(gs) : null; } catch (_) { state = null; }
        const report = {
            at: new Date(now).toISOString(),
            build: ctx.buildId || null,
            text: t.text,
            reporter: {
                name: rp ? rp.name : (spectator ? 'Divák' : null),
                seat: rp ? rp.playerIdx : null,
                spectator,
            },
            room: room ? {
                id: room.id, name: room.name, phase: room.phase,
                options: room.options || {},
                players: room.players.map(p => ({ name: p.name, seat: p.playerIdx, bot: !!p.isBot })),
                paused: !!room.paused,
            } : null,
            logFile: room && room._logPath ? path.basename(room._logPath) : null,
            state,
            client: cleanReportContext(payload && payload.context),
        };
        const file = reportFileName(new Date(now), room && room.id);
        try {
            fs.writeFileSync(path.join(reportsDir, file), JSON.stringify(report, null, 2));
        } catch (e) {
            ctx.glog?.error?.('bug_report', e, room);
            return { ok: false, error: 'Hlášení se nepodařilo uložit.' };
        }
        ctx.glog?.system?.(`🐞 hlášení chyby: reports/${file}`, { roomId: room ? room.id : null });
        return { ok: true, file };
    }

    // ── /admin – stažení hlášení na vývojový PC ─────────────────────────────────
    const token = typeof env.BANG_ADMIN_TOKEN === 'string' ? env.BANG_ADMIN_TOKEN : '';
    const adminOn = token.length >= 16;
    const tokenHash = crypto.createHash('sha256').update(token).digest();

    function authorized(req) {
        const h = String(req.headers && req.headers.authorization || '');
        const m = /^Bearer\s+(.+)$/.exec(h);
        if (!m) return false;
        const got = crypto.createHash('sha256').update(m[1].trim()).digest();
        return crypto.timingSafeEqual(got, tokenHash);
    }

    // 404 i na špatný token: zvenku se nepozná, jestli endpoint vůbec existuje.
    function gate(req, res, next) {
        if (!adminOn || !authorized(req)) { res.status(404).end(); return; }
        res.setHeader('Cache-Control', 'no-store');
        next();
    }

    function sendFile(dir, name, re, res) {
        if (!re.test(name)) { res.status(404).end(); return; }
        const full = path.join(dir, name);
        fs.readFile(full, (err, buf) => {
            if (err) { res.status(404).end(); return; }
            res.type(name.endsWith('.jsonl') ? 'application/x-ndjson' : 'application/json').send(buf);
        });
    }

    function mountAdminRoutes(app) {
        app.get('/admin/reports', gate, (req, res) => {
            let files = [];
            try { files = fs.readdirSync(reportsDir).filter(f => REPORT_FILE_RE.test(f)).sort(); }
            catch (_) { files = []; }
            res.json({ reports: files });
        });
        app.get('/admin/reports/:file', gate, (req, res) => sendFile(reportsDir, req.params.file, REPORT_FILE_RE, res));
        app.get('/admin/logs/:file', gate, (req, res) => sendFile(logsDir, req.params.file, LOG_FILE_RE, res));
        if (adminOn) ctx.glog?.system?.('🐞 /admin/reports zapnuto (BANG_ADMIN_TOKEN)');
    }

    Object.assign(ctx, { saveBugReport, mountAdminRoutes });
    return ctx;
};
