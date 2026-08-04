// Čistá pravidla pro (opakované) načítání assetů klienta. BEZ Phaseru/DOM.
// Izomorfní: v prohlížeči <script> vytvoří globály, v Node/testech require().
//
// Kontext: Phaser sice čeká na dokončení loaderu, ale soubor, který skončí chybou
// (přerušené spojení na horší lince), jen přeskočí – hra se pak rozjede se zelenými
// placeholdery, dokud hráč nedá F5. Tyhle helpery řeknou, CO má smysl zkusit znovu
// a CO ještě chybí, než se hra smí sestavit. Používá game.js (preload/create).
//
// Registr assetů (drží game.js): { <texturaKlíč>: { url, kind, attempts, status } }
//   kind     – 'image' | 'json' (metoda loaderu)
//   attempts – kolikátý pokus právě běží (1 = první)
//   status   – HTTP status posledního neúspěchu (0 = spojení selhalo/přerušilo se)

const ASSET_MAX_ATTEMPTS = 3;      // 1. pokus + 2 opakování ještě ve fázi preload
const ASSET_REPAIR_ROUNDS = 5;     // opravná kola po preloadu (create), než to vzdáme

// Má smysl zkusit soubor znovu? 4xx = na serveru prostě není (typicky 404 u artu, který
// ještě nemáme) → neopakuj. Status 0 (přerušené spojení) nebo 5xx = výpadek → opakuj.
function shouldRetryAsset(info) {
    const attempts = (info && info.attempts) || 1;
    const max = (info && info.maxAttempts) || ASSET_MAX_ATTEMPTS;
    const status = (info && info.status) || 0;
    if (attempts >= max) return false;
    if (status >= 400 && status < 500) return false;
    return true;
}

// Soubor na serveru není (a nikdy nebude) – 4xx odpověď.
function isPermanentlyMissing(info) {
    const status = (info && info.status) || 0;
    return status >= 400 && status < 500;
}

// URL pro další pokus – cache-buster obejde nakešovanou chybnou odpověď.
function retryAssetUrl(url, attempt) {
    const base = String(url || '').split('?')[0];
    return base + '?retry=' + attempt;
}

// Které assety z registru ještě nejsou v cache? `has(key, kind)` → bool.
// Natvrdo chybějící (4xx – např. art karty, který ještě nemáme nakreslený) přeskoč;
// ty mají v klientu vlastní fallback (karta složená z placeholderu) a čekat na ně nemá smysl.
function missingAssets(registry, has) {
    const out = [];
    for (const key of Object.keys(registry || {})) {
        const info = registry[key];
        if (!info || isPermanentlyMissing(info)) continue;
        if (!has(key, info.kind)) out.push(key);
    }
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ASSET_MAX_ATTEMPTS, ASSET_REPAIR_ROUNDS,
        shouldRetryAsset, isPermanentlyMissing, retryAssetUrl, missingAssets
    };
}
