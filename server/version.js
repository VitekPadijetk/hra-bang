// server/version.js — identita nasazeného kódu („build id").
//
// Proč: po nahrání nové verze na server se všechny otevřené prohlížeče odpojí a
// jejich rozehraná místnost zmizí – hráč skončí v menu a neví proč. Server proto
// při startu spočítá otisk zdrojáků a pošle ho každému socketu hned po připojení
// (`server_version`). Klient si otisk z prvního spojení pamatuje a po reconnectu
// porovná: liší-li se, běží na serveru nový kód a stránka v prohlížeči je stará →
// ukáže výzvu „načti stránku znovu" (view/menu.js `showUpdateBanner`).
//
// Otisk se počítá z OBSAHU souborů, ne z času startu, takže pouhý restart nebo pád
// serveru se za aktualizaci nevydává. Assety se nehashují – stará stránka si nová
// obrázky nepotřebuje dotáhnout, mění-li se jen ony, není důvod hráče vyrušovat.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_DIRS = ['.', 'core', 'logic', 'view', 'net', 'server'];
const SRC_EXT = /\.(js|json|html|css)$/;
// Soubory, které na chod klienta nemají vliv (nebo se mění bez nasazení).
const SKIP = new Set(['package-lock.json']);

// Seřazený seznam zdrojáků relativně ke kořeni – pořadí musí být deterministické,
// jinak by se otisk lišil mezi restarty na jiném filesystému.
function listSourceFiles(root) {
    const out = [];
    for (const dir of SRC_DIRS) {
        const abs = path.join(root, dir);
        let names;
        try { names = fs.readdirSync(abs); } catch (_) { continue; }
        for (const name of names.sort()) {
            if (SKIP.has(name) || !SRC_EXT.test(name)) continue;
            const rel = dir === '.' ? name : `${dir}/${name}`;
            try { if (!fs.statSync(path.join(root, rel)).isFile()) continue; } catch (_) { continue; }
            out.push(rel);
        }
    }
    return out;
}

function computeBuildId(root = path.join(__dirname, '..')) {
    const hash = crypto.createHash('sha1');
    for (const rel of listSourceFiles(root)) {
        hash.update(rel);
        try { hash.update(fs.readFileSync(path.join(root, rel))); } catch (_) { /* zmizel při čtení – ignoruj */ }
    }
    return hash.digest('hex').slice(0, 12);
}

module.exports = function installVersion(ctx) {
    ctx.buildId = computeBuildId();
    return ctx;
};

module.exports.computeBuildId = computeBuildId;
module.exports.listSourceFiles = listSourceFiles;
