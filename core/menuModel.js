// core/menuModel.js — čistá logika nového menu v HTML (view/menuDom.js), bez DOM.
// Texty a rozhodnutí, která se dají otestovat v Node: skloňování počtů, iniciály,
// jméno hráče, escapování. Plán: docs/menu-ui-plan.md.

// Každý text od hráče (jméno, název hry) jde do innerHTML jen přes esc() –
// název místnosti vidí všichni v seznamu her, takže by jinak byl XSS pro celý server.
function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// České skloňování: 1 hra / 2–4 hry / 0 a 5+ her.
function czPlural(n, one, few, many) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

// Popisek pod „Připojit se ke hře" v hlavním menu (S3).
function waitingGamesLabel(n) {
    if (!n) return 'Žádné hry nečekají na hráče';
    return `${n} ${czPlural(n, 'hra čeká', 'hry čekají', 'her čeká')} na hráče`;
}

// Popisek pod „Sledovat probíhající hru" (S3).
function runningGamesLabel(n) {
    if (!n) return 'Žádná hra právě neběží';
    return `${n} ${czPlural(n, 'hra', 'hry', 'her')} právě běží`;
}

// Hra s volným místem – jen ty se počítají do „čeká na hráče".
function waitingGamesCount(lobbyList) {
    return (lobbyList || []).filter(r => r && r.playerCount < r.maxPlayers).length;
}

// Iniciály do avataru: první dva znaky jména velkými, bez prefixu bota.
// Array.from, ne slice – emoji / znaky mimo BMP se nesmí rozpůlit.
function initialsOf(name) {
    const clean = String(name || '').replace(/^🤖\s*/, '').trim();
    if (!clean) return '?';
    return Array.from(clean).slice(0, 2).join('').toUpperCase();
}

const NAME_MAX = 18;

// Tvrdý limit jména při psaní (ne validace při odeslání).
function clampName(value) {
    return Array.from(String(value || '')).slice(0, NAME_MAX).join('');
}

// Chyba jména pro okno S4, nebo null. `taken` = jména obsazená na serveru.
function nameError(value, taken) {
    const v = String(value || '').trim();
    if (!v) return 'Jméno nesmí být prázdné.';
    if ((taken || []).includes(v)) return `Jméno »${v}« je již obsazeno.`;
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        esc, czPlural, waitingGamesLabel, runningGamesLabel, waitingGamesCount,
        initialsOf, NAME_MAX, clampName, nameError,
    };
}
