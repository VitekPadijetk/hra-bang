// tools/pull-reports.js — stáhne hlášení chyb z nasazeného serveru na tenhle PC (bug 73).
//
//   BANG_ADMIN_TOKEN=… node tools/pull-reports.js https://muj-server.example
//
// Stáhne každé hlášení, které ještě v reports/ není, a k němu herní log, na který
// odkazuje (reports/logs/). Token musí být stejný jako BANG_ADMIN_TOKEN na serveru
// (aspoň 16 znaků) – bez něj server /admin vůbec nevystavuje. Na LAN serveru
// (běží přímo na tomhle PC) nic stahovat netřeba, hlášení už leží v reports/.

const fs = require('fs');
const path = require('path');

const base = (process.argv[2] || process.env.BANG_SERVER || '').replace(/\/+$/, '');
const token = process.env.BANG_ADMIN_TOKEN || '';
if (!base || !token) {
    console.error('použití: BANG_ADMIN_TOKEN=… node tools/pull-reports.js <url serveru>');
    process.exit(2);
}

const root = path.join(__dirname, '..', 'reports');
const logsDir = path.join(root, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

async function get(urlPath) {
    const res = await fetch(base + urlPath, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`${urlPath}: HTTP ${res.status}`);
    return res;
}

(async () => {
    let list;
    try { list = await (await get('/admin/reports')).json(); }
    catch (e) {
        console.error(`Seznam hlášení nejde stáhnout (${e.message}). Sedí token a je na serveru nastavený BANG_ADMIN_TOKEN?`);
        process.exit(1);
    }
    let fresh = 0;
    for (const file of list.reports || []) {
        if (!/^[A-Za-z0-9_-]+\.json$/.test(file)) continue;
        const dest = path.join(root, file);
        if (fs.existsSync(dest)) continue;
        const text = await (await get('/admin/reports/' + file)).text();
        fs.writeFileSync(dest, text);
        fresh++;
        let report = null;
        try { report = JSON.parse(text); } catch (_) { /* uloženo i tak */ }
        console.log(`🐞 ${file}${report ? ` — ${String(report.text).split('\n')[0].slice(0, 80)}` : ''}`);
        const log = report && report.logFile;
        if (log && /^[A-Za-z0-9_-]+\.jsonl$/.test(log) && !fs.existsSync(path.join(logsDir, log))) {
            try { fs.writeFileSync(path.join(logsDir, log), await (await get('/admin/logs/' + log)).text()); }
            catch (e) { console.warn(`   log ${log} se nepodařilo stáhnout (${e.message})`); }
        }
    }
    console.log(fresh ? `Staženo nových hlášení: ${fresh} → reports/` : 'Žádné nové hlášení.');
})();
