// tools/placeholder.js — vygeneruje dočasné (placeholder) textury karet a portrétů,
// dokud nedorazí skutečný art. Kreslí prostý rám s názvem karty ve stejném rozměru,
// jaký mají ostatní assety (650×1000), takže se chová identicky jako finální soubor.
//
//   node tools/placeholder.js            … vytvoří jen chybějící soubory
//   node tools/placeholder.js --force    … přepíše i existující
//
// `sharp` NENÍ závislost hry – instaluje se jen na tohle:
//   npm install sharp --no-save
//
// Až dorazí skutečný art, stačí soubor přepsat; skript pak už nic negeneruje.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 650, H = 1000;
const FORCE = process.argv.includes('--force');
const ROOT = path.join(__dirname, '..');

// Barevné schéma placeholderu podle druhu (aby šlo na první pohled poznat, co chybí).
const STYLES = {
    event: { bg: '#3a2a18', frame: '#c9a227', text: '#f0e2c0', tag: '#8a7340' },
    back:  { bg: '#5a1e14', frame: '#e0b23c', text: '#f5dfae', tag: '#a8763a' },
    char:  { bg: '#1f2a33', frame: '#7fa8c9', text: '#dfe9f2', tag: '#5d7f99' },
};

// Rozlámání názvu na řádky, aby se vešel do šířky karty (hrubý odhad podle počtu znaků).
function wrap(text, maxChars) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach(w => {
        const next = line ? line + ' ' + w : w;
        if (next.length > maxChars && line) { lines.push(line); line = w; }
        else line = next;
    });
    if (line) lines.push(line);
    return lines;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(title, tag, kind) {
    const S = STYLES[kind] || STYLES.event;
    const lines = wrap(title, 13);
    const size = lines.length > 2 ? 66 : 82;
    const startY = H / 2 - (lines.length - 1) * size * 0.62;
    const tspans = lines.map((l, i) =>
        `<tspan x="${W / 2}" y="${Math.round(startY + i * size * 1.24)}">${esc(l)}</tspan>`).join('');
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="46" fill="${S.bg}"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="46" fill="none" stroke="${S.frame}" stroke-width="10"/>
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" rx="28" fill="none" stroke="${S.frame}" stroke-width="3" opacity="0.55"/>
  <text x="${W / 2}" y="130" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="${S.tag}" letter-spacing="4">${esc(tag)}</text>
  <text text-anchor="middle" font-family="Georgia, serif" font-size="${size}" font-weight="bold" fill="${S.text}">${tspans}</text>
  <text x="${W / 2}" y="${H - 96}" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="${S.tag}" letter-spacing="3">PLACEHOLDER</text>
</svg>`);
}

async function make(relPath, title, tag, kind) {
    const out = path.join(ROOT, relPath);
    if (fs.existsSync(out) && !FORCE) { console.log('  přeskočeno (existuje):', relPath); return false; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(svg(title, tag, kind)).webp({ quality: 90 }).toFile(out);
    console.log('  vytvořeno:', relPath);
    return true;
}

(async () => {
    const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards.fistful.json'), 'utf8'));
    const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters.json'), 'utf8'));

    console.log('Fistful – karty událostí:');
    for (const c of cards) await make(`assets/fistful_cards/${c.art}.webp`, c.name, 'FISTFUL', 'event');

    console.log('Fistful – rub balíčku:');
    await make('assets/other_cards/fistful/fistful_back.webp', 'Fistful of Cards', 'UDÁLOST', 'back');

    console.log('Fistful – portréty postav:');
    for (const id of [31, 32, 33]) {
        const name = chars.find(c => c.id === id)?.name || `Postava ${id}`;
        await make(`assets/characters/${String(id).padStart(3, '0')}.webp`, name, 'POSTAVA', 'char');
    }
})();
