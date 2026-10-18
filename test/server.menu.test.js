// Herní menu: pauza (bug 76, server/handlers.menu.js + guard) a hlášení chyb
// (bug 73, server/reports.js + core/bugReport.js).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GameState } = require('../logic.js');
const { mkGame } = require('./_helpers.js');

const installRoomService = require('../server/rooms.js');
const installAnimService = require('../server/anim.js');
const installGuard = require('../server/guard.js');
const installReports = require('../server/reports.js');
const registerGame = require('../server/handlers.game.js');
const registerMenu = require('../server/handlers.menu.js');
const registerLobby = require('../server/handlers.lobby.js');
const br = require('../core/bugReport.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));

before(() => { console.log = () => {}; });

function mkEnv({ env = {} } = {}) {
    const sockets = new Map();
    const io = { sockets: { sockets }, emit() {}, to() { return { emit() {} }; } };
    const ctx = { io, cardData, GameState };
    installRoomService(ctx);
    installAnimService(ctx);
    installGuard(ctx);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bang-reports-'));
    installReports(ctx, { reportsDir: path.join(dir, 'reports'), logsDir: path.join(dir, 'logs'), env });
    const ticks = [];
    ctx.scheduleBotTick = (r) => ticks.push(r.id);

    const room = ctx.makeRoom('T', 4, 's0', 'P0');
    for (let i = 1; i < 4; i++) room.players.push({ socketId: 's' + i, playerIdx: i, name: 'P' + i });
    room.phase = 'playing';
    const gs = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }, { role: 'Outlaw' }, { role: 'Renegade' }]);
    room.gameState = gs;

    const made = new Map();
    function sock(i) {
        if (made.has(i)) return made.get(i);
        const id = 's' + i;
        const handlers = {}, emits = [];
        const socket = {
            id, rooms: new Set([id]),
            on(ev, fn) { handlers[ev] = fn; },
            emit(ev, payload) { emits.push({ ev, payload }); },
            join() {}, leave() {},
            fire(ev, ...a) { if (handlers[ev]) handlers[ev](...a); },
            emits,
            last(ev) { return [...emits].reverse().find(e => e.ev === ev)?.payload; },
        };
        sockets.set(id, socket);
        const withRoom = (cb) => {
            const r = ctx.findRoomBySocket(id);
            const p = r && r.players.find(pl => pl.socketId === id);
            if (p) cb(r, p, r.gameState);
        };
        registerGame(socket, ctx, withRoom);
        registerMenu(socket, ctx);
        made.set(i, socket);
        return socket;
    }
    return { ctx, room, gs, sock, dir, ticks };
}

// ── Pauza ────────────────────────────────────────────────────────────────────

test('pauza: pozastavit smí jen game leader', () => {
    const { room, sock } = mkEnv();
    sock(1).fire('pause_game', { paused: true });
    assert.equal(room.paused, undefined);
    sock(0).fire('pause_game', { paused: true });
    assert.equal(room.paused.by, 'P0');
    // Odblokovat taky jen lídr.
    sock(2).fire('pause_game', { paused: false });
    assert.ok(room.paused);
});

test('pauza: herní akce hráče na tahu se zahodí, po odblokování projde', () => {
    const { room, gs, sock, ticks } = mkEnv();     // PLAY, na tahu #0
    const s0 = sock(0);
    s0.fire('pause_game', { paused: true });
    s0.fire('end_turn');
    assert.equal(gs.currentPlayerIndex, 0);
    const rej = s0.last('action_rejected');
    assert.equal(rej.event, 'end_turn');
    assert.equal(rej.paused, true);

    s0.fire('pause_game', { paused: false });
    assert.equal(room.paused, null);
    assert.deepEqual(ticks, [room.id]);             // boti se rozjedou znovu
    s0.fire('end_turn');
    assert.equal(gs.currentPlayerIndex, 1);
});

test('pauza: platí i pro akce mimo pořadí (Sid Ketchum) a pro debug hru', () => {
    const { gs, sock } = mkEnv();
    gs.isDebug = true;
    const s0 = sock(0);
    s0.fire('pause_game', { paused: true });
    s0.fire('sid_ketchum_discard_both', { playerIdx: 0 });
    assert.equal(s0.last('action_rejected').event, 'sid_ketchum_discard_both');
    s0.fire('end_turn');
    assert.equal(gs.currentPlayerIndex, 0);
});

test('pauza: nejde během intra, po konci hry ani mimo běžící hru', () => {
    const { room, gs, sock } = mkEnv();
    room._introPlaying = true;
    sock(0).fire('pause_game', { paused: true });
    assert.ok(!room.paused);
    assert.ok(sock(0).last('join_error'));
    room._introPlaying = false;
    gs.winner = 'Sheriff';
    sock(0).fire('pause_game', { paused: true });
    assert.ok(!room.paused);
    gs.winner = null;
    room.phase = 'lobby';
    sock(0).fire('pause_game', { paused: true });
    assert.ok(!room.paused);
});

test('pauza: lídr hry jen botů je divák (není mezi hráči), přesto ji ovládá', () => {
    const { ctx, room, sock } = mkEnv();
    room.leaderSocketId = 'watcher';
    const handlers = {};
    const w = { id: 'watcher', rooms: new Set(), on(ev, fn) { handlers[ev] = fn; }, emit() {} };
    registerMenu(w, ctx);
    handlers.pause_game({ paused: true });
    assert.ok(room.paused);
    sock(0);   // hráč #0 už lídr není
    sock(0).fire('pause_game', { paused: false });
    assert.ok(room.paused);
});

test('pauza jde ven v room payloadu', () => {
    const { ctx, room, sock } = mkEnv();
    assert.equal(ctx.roomPayload(room, 0).paused, null);
    sock(0).fire('pause_game', { paused: true });
    assert.equal(ctx.roomPayload(room, 0).paused.by, 'P0');
});

test('pauza: chat pod Roubíkem během ní nestojí život', () => {
    const { ctx, room, sock } = mkEnv();
    const fined = [];
    ctx.applyGagPenalty = (r, idx) => fined.push(idx);
    ctx.emitChat = () => {};
    const handlers = {};
    const s1 = { id: 's1', rooms: new Set(), on(ev, fn) { handlers[ev] = fn; }, emit() {}, join() {}, leave() {} };
    registerLobby(s1, ctx, () => {});
    handlers.chat_message({ text: 'ahoj' });
    assert.deepEqual(fined, [1]);
    sock(0).fire('pause_game', { paused: true });
    handlers.chat_message({ text: 'počkejte' });
    assert.deepEqual(fined, [1]);
    assert.ok(room.paused);
});

// ── Hlášení chyb ─────────────────────────────────────────────────────────────

test('hlášení: uloží se do reports/ i se jménem logu a snímkem stavu', () => {
    const { room, sock, dir } = mkEnv();
    room._logPath = path.join(dir, 'logs', 'game1_2026.jsonl');
    const s2 = sock(2);
    s2.fire('bug_report', { text: '  Karta mi zůstala v ruce  ', context: { phase: 'PLAY' } });
    assert.deepEqual(s2.last('bug_report_result'), { ok: true });
    const files = fs.readdirSync(path.join(dir, 'reports'));
    assert.equal(files.length, 1);
    assert.match(files[0], br.REPORT_FILE_RE);
    const rep = JSON.parse(fs.readFileSync(path.join(dir, 'reports', files[0]), 'utf8'));
    assert.equal(rep.text, 'Karta mi zůstala v ruce');
    assert.equal(rep.reporter.name, 'P2');
    assert.equal(rep.reporter.seat, 2);
    assert.equal(rep.logFile, 'game1_2026.jsonl');
    assert.equal(rep.room.id, room.id);
    assert.ok(rep.state && Array.isArray(rep.state.players));
    assert.deepEqual(rep.client, { phase: 'PLAY' });
});

test('hlášení: krátký text odmítne, limit na spojení drží', () => {
    const { sock, dir } = mkEnv();
    const s1 = sock(1);
    s1.fire('bug_report', { text: 'x' });
    assert.equal(s1.last('bug_report_result').ok, false);
    for (let i = 0; i < br.REPORT_RATE_MAX; i++) s1.fire('bug_report', { text: 'chyba číslo ' + i });
    s1.fire('bug_report', { text: 'ještě jedna chyba' });
    assert.equal(s1.last('bug_report_result').ok, false);
    assert.equal(fs.readdirSync(path.join(dir, 'reports')).length, br.REPORT_RATE_MAX);
});

test('core/bugReport: ořez textu, kontextu a jméno souboru', () => {
    assert.equal(br.cleanReportText(42).ok, false);
    assert.equal(br.cleanReportText('a\u0000b\u0007cdef').text, 'abcdef');
    assert.equal(br.cleanReportText('x'.repeat(5000)).text.length, br.REPORT_TEXT_MAX);
    assert.equal(br.cleanReportContext([1, 2]), null);
    assert.equal(br.cleanReportContext({ big: 'x'.repeat(br.REPORT_CONTEXT_MAX) }), null);
    const name = br.reportFileName(new Date('2026-10-17T10:00:00Z'), '../../etc');
    assert.match(name, br.REPORT_FILE_RE);
    assert.ok(!name.includes('/') && !name.includes('..'));
    let h = [];
    for (let i = 0; i < br.REPORT_RATE_MAX; i++) h = br.allowReport(h, 1000 + i);
    assert.equal(br.allowReport(h, 2000), null);
    assert.ok(br.allowReport(h, 1000 + br.REPORT_RATE_WINDOW_MS + 10));
});

// ── /admin ───────────────────────────────────────────────────────────────────

function mkApp() {
    const routes = {};
    return { routes, get(p, ...fns) { routes[p] = fns; } };
}
function call(fns, req) {
    const res = { code: 200, headers: {}, body: undefined,
        status(c) { this.code = c; return this; }, end() { return this; },
        setHeader(k, v) { this.headers[k] = v; }, json(b) { this.body = b; return this; },
        type() { return this; }, send(b) { this.body = b; return this; } };
    let i = 0;
    const next = () => { const f = fns[i++]; if (f) f(req, res, next); };
    next();
    return res;
}

test('/admin: bez tokenu v prostředí neexistuje, se špatným tokenem taky ne', () => {
    const off = mkEnv();
    const app1 = mkApp();
    off.ctx.mountAdminRoutes(app1);
    assert.equal(call(app1.routes['/admin/reports'], { headers: { authorization: 'Bearer cokoli' } }).code, 404);

    const on = mkEnv({ env: { BANG_ADMIN_TOKEN: 'tajny-token-1234567' } });
    const app2 = mkApp();
    on.ctx.mountAdminRoutes(app2);
    assert.equal(call(app2.routes['/admin/reports'], { headers: {} }).code, 404);
    assert.equal(call(app2.routes['/admin/reports'], { headers: { authorization: 'Bearer spatny' } }).code, 404);
    on.sock(1).fire('bug_report', { text: 'něco se rozbilo' });
    const ok = call(app2.routes['/admin/reports'], { headers: { authorization: 'Bearer tajny-token-1234567' } });
    assert.equal(ok.code, 200);
    assert.equal(ok.body.reports.length, 1);
    // Krátký token (< 16 znaků) admin nezapne.
    const weak = mkEnv({ env: { BANG_ADMIN_TOKEN: 'kratky' } });
    const app3 = mkApp();
    weak.ctx.mountAdminRoutes(app3);
    assert.equal(call(app3.routes['/admin/reports'], { headers: { authorization: 'Bearer kratky' } }).code, 404);
});

test('/admin: jméno souboru se nedá použít k úniku z adresáře', () => {
    const on = mkEnv({ env: { BANG_ADMIN_TOKEN: 'tajny-token-1234567' } });
    const app = mkApp();
    on.ctx.mountAdminRoutes(app);
    const auth = { authorization: 'Bearer tajny-token-1234567' };
    for (const file of ['../server.js', '..%2Fserver.js', 'a.json/../../x.json']) {
        assert.equal(call(app.routes['/admin/reports/:file'], { headers: auth, params: { file } }).code, 404);
    }
    assert.equal(call(app.routes['/admin/logs/:file'], { headers: auth, params: { file: '../package.json' } }).code, 404);
});

// ── Zrcadlo do soukromého GitHub repa (Render free má dočasný disk) ──────────

function fakeFetch(status = 201) {
    const calls = [];
    const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: status < 300, status }; };
    fn.calls = calls;
    return fn;
}

test('zrcadlo: bez BANG_REPORTS_REPO/TOKEN se na GitHub nic neposílá', async () => {
    const env = mkEnv();
    const f = fakeFetch();
    // mkEnv instaluje bez fetch – druhá instalace se stejnými adresáři, jen s fetch
    installReports(env.ctx, { reportsDir: path.join(env.dir, 'reports'), logsDir: path.join(env.dir, 'logs'), env: {}, fetch: f });
    const res = env.ctx.saveBugReport(env.sock(1), { text: 'něco se rozbilo' });
    assert.equal(res.ok, true);
    assert.equal(await res.mirrored, false);
    assert.equal(f.calls.length, 0);
});

test('zrcadlo: hlášení i zabalený log jdou do soukromého repa', async () => {
    const env = mkEnv();
    const f = fakeFetch();
    const zlib = require('node:zlib');
    installReports(env.ctx, {
        reportsDir: path.join(env.dir, 'reports'), logsDir: path.join(env.dir, 'logs'), fetch: f,
        env: { BANG_REPORTS_REPO: 'Vitek/hra-bang-reports', BANG_REPORTS_TOKEN: 'github_pat_x' },
    });
    fs.mkdirSync(path.join(env.dir, 'logs'), { recursive: true });
    env.room._logPath = path.join(env.dir, 'logs', 'g1.jsonl');
    fs.writeFileSync(env.room._logPath, '{"ev":"a"}\n{"ev":"b"}\n');
    const res = env.ctx.saveBugReport(env.sock(2), { text: 'karta zmizela z ruky' });
    assert.equal(await res.mirrored, true);
    assert.equal(f.calls.length, 2);
    const [rep, log] = f.calls;
    assert.equal(rep.url, `https://api.github.com/repos/Vitek/hra-bang-reports/contents/reports/${res.file}`);
    assert.equal(rep.init.method, 'PUT');
    assert.equal(rep.init.headers.Authorization, 'Bearer github_pat_x');
    assert.equal(JSON.parse(Buffer.from(rep.body.content, 'base64')).text, 'karta zmizela z ruky');
    assert.equal(log.url.endsWith(`/contents/logs/${res.file.replace(/\.json$/, '')}.jsonl.gz`), true);
    assert.equal(zlib.gunzipSync(Buffer.from(log.body.content, 'base64')).toString(), '{"ev":"a"}\n{"ev":"b"}\n');
});

test('zrcadlo: chyba GitHubu hráči hlášení nezkazí (lokální kopie zůstává)', async () => {
    const env = mkEnv();
    const f = fakeFetch(403);
    installReports(env.ctx, {
        reportsDir: path.join(env.dir, 'reports'), logsDir: path.join(env.dir, 'logs'), fetch: f,
        env: { BANG_REPORTS_REPO: 'Vitek/r', BANG_REPORTS_TOKEN: 't' },
    });
    const res = env.ctx.saveBugReport(env.sock(1), { text: 'něco se rozbilo' });
    assert.equal(res.ok, true);
    assert.equal(await res.mirrored, false);
    assert.equal(fs.readdirSync(path.join(env.dir, 'reports')).length, 1);
});

test('zrcadlo: nesmyslné jméno repa zrcadlo nezapne', async () => {
    const env = mkEnv();
    const f = fakeFetch();
    installReports(env.ctx, {
        reportsDir: path.join(env.dir, 'reports'), logsDir: path.join(env.dir, 'logs'), fetch: f,
        env: { BANG_REPORTS_REPO: '../evil?x=1', BANG_REPORTS_TOKEN: 't' },
    });
    const res = env.ctx.saveBugReport(env.sock(1), { text: 'něco se rozbilo' });
    assert.equal(await res.mirrored, false);
    assert.equal(f.calls.length, 0);
});
