// core/bugReport.js — čistá logika hlášení chyb ze hry (bug 73).
//
// Hlášení posílá klient socketem ('bug_report'), server ho uloží jako JSON do reports/
// (server/reports.js). Tady je jen to, co jde otestovat bez souborového systému:
// ořez a kontrola textu, strop velikosti přiloženého kontextu, jméno souboru a
// omezení počtu hlášení na jedno spojení. Socketem přijde cokoli, takže se nic
// z payloadu nebere „jak je" – text se ořízne, kontext se zahodí, když je moc velký.

const REPORT_TEXT_MIN = 5;          // „nejde" není hlášení, „karta mi zmizela z ruky" už ano
const REPORT_TEXT_MAX = 2000;
const REPORT_CONTEXT_MAX = 20000;   // klientský kontext (JSON), ať nikdo nenafoukne disk
const REPORT_RATE_MAX = 3;          // nejvýš 3 hlášení…
const REPORT_RATE_WINDOW_MS = 10 * 60 * 1000;   // …za 10 minut z jednoho spojení
const REPORT_FILES_MAX = 500;       // strop souborů v reports/ – pak server další odmítá

// Text hlášení → { ok, text } nebo { ok: false, error }. Řídicí znaky (kromě nového
// řádku a tabulátoru) pryč – soubor čte člověk v editoru a terminálu.
function cleanReportText(raw) {
    if (typeof raw !== 'string') return { ok: false, error: 'Napiš, co se stalo.' };
    const text = raw.replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, REPORT_TEXT_MAX);
    if (text.length < REPORT_TEXT_MIN) return { ok: false, error: 'Popiš chybu aspoň pár slovy.' };
    return { ok: true, text };
}

// Klientský kontext (fáze, rozložení, prohlížeč…) – jen prostý objekt do daného stropu.
// Cokoli jiného se tiše zahodí: hlášení je cennější než kontext k němu.
function cleanReportContext(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    let json;
    try { json = JSON.stringify(raw); } catch (_) { return null; }
    if (!json || json.length > REPORT_CONTEXT_MAX) return null;
    return JSON.parse(json);
}

// Jméno souboru: čas (seřadí se samo) + místnost. Jen [A-Za-z0-9_-], takže se z něj
// nedá vylézt z adresáře – a stejným vzorem ho kontroluje i HTTP endpoint.
const REPORT_FILE_RE = /^[A-Za-z0-9_-]{1,120}\.json$/;
function reportFileName(date, roomId) {
    const stamp = date.toISOString().replace(/[:.]/g, '-');
    const room = String(roomId || 'menu').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'menu';
    return `${stamp}_${room}.json`;
}

// Omezení na jedno spojení: `history` = razítka předchozích hlášení (ms). Vrací nové
// pole razítek, nebo null, když je limit vyčerpaný.
function allowReport(history, now) {
    const recent = (history || []).filter(t => now - t < REPORT_RATE_WINDOW_MS);
    if (recent.length >= REPORT_RATE_MAX) return null;
    return [...recent, now];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        cleanReportText, cleanReportContext, reportFileName, allowReport, REPORT_FILE_RE,
        REPORT_TEXT_MIN, REPORT_TEXT_MAX, REPORT_CONTEXT_MAX, REPORT_RATE_MAX,
        REPORT_RATE_WINDOW_MS, REPORT_FILES_MAX,
    };
}
