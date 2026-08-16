#!/usr/bin/env node
/**
 * Převod assetů z PNG do WebP.
 *
 * Art karet je sken malované karty včetně vysázeného pravidlového textu, uložený
 * jako PNG 650×1000 (~1,3 MB, tedy skoro 2 bajty na pixel – prakticky bez komprese).
 * Celá sada má ~96 MB a jedno načtení hry z ní stáhne 42–97 MB podle zapnutých
 * rozšíření, což je hlavní žrout bandwidth. WebP to sráží zhruba 11×.
 *
 * Alfa kanál je všude reálně využitý (zaoblené rohy karet) – WebP ho nese a u lossy
 * ho ukládá bezeztrátově, takže rohy zůstávají ostré.
 *
 * Marky hodnoty a barvy (assets/card_marks/) jedou BEZEZTRÁTOVĚ: jsou to malé ostré
 * glyfy, které se při snímání (pulseCheckMark) zvětšují, takže by na nich byly
 * artefakty vidět. Celá složka má i tak jen ~216 kB.
 *
 * sharp není závislost hry – server ho nepotřebuje. Instaluje se jen na převod:
 *
 *     npm install sharp --no-save
 *     node tools/webp.js --measure          # jen spočítá, nic nezapíše
 *     node tools/webp.js --quality=80       # zapíše .webp vedle .png
 *     node tools/webp.js --quality=80 --replace   # …a smaže zdrojové .png
 *
 * Zdrojové PNG jsou v gitu, takže --replace je vratný přes `git checkout`.
 */

const fs = require('fs');
const path = require('path');

let sharp;
try {
    sharp = require('sharp');
} catch (_) {
    console.error('Chybí sharp. Nainstaluj ho jen pro převod:\n\n    npm install sharp --no-save\n');
    process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

const args = process.argv.slice(2);
const MEASURE = args.includes('--measure');
const REPLACE = args.includes('--replace');
const QUALITY = Number((args.find(a => a.startsWith('--quality=')) || '--quality=80').split('=')[1]);

if (!Number.isFinite(QUALITY) || QUALITY < 1 || QUALITY > 100) {
    console.error('--quality musí být 1–100');
    process.exit(1);
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.png$/i.test(e.name)) out.push(p);
    }
    return out;
}

// Ostré glyfy, které se ve hře zvětšují → bezeztrátově.
function isLossless(file) {
    return file.replace(/\\/g, '/').includes('/card_marks/');
}

const mb = x => (x / 1048576).toFixed(1) + ' MB';
const kb = x => (x / 1024).toFixed(0) + ' kB';

(async () => {
    const files = walk(ASSETS);
    if (!files.length) {
        console.error('V assets/ nejsou žádné PNG.');
        process.exit(1);
    }

    if (MEASURE) {
        const tot = { orig: 0, q70: 0, q80: 0, q90: 0 };
        for (const f of files) {
            const buf = fs.readFileSync(f);
            tot.orig += buf.length;
            const ll = isLossless(f) ? (await sharp(buf).webp({ lossless: true }).toBuffer()).length : null;
            for (const q of [70, 80, 90]) {
                tot['q' + q] += ll != null ? ll : (await sharp(buf).webp({ quality: q }).toBuffer()).length;
            }
        }
        console.log(`souborů: ${files.length}`);
        console.log(`dnes PNG : ${mb(tot.orig)}`);
        for (const q of [70, 80, 90]) {
            console.log(`WebP q${q} : ${mb(tot['q' + q])}  (${(tot.orig / tot['q' + q]).toFixed(1)}× méně)`);
        }
        return;
    }

    let before = 0, after = 0, written = 0;
    for (const f of files) {
        const buf = fs.readFileSync(f);
        const out = f.replace(/\.png$/i, '.webp');
        const enc = isLossless(f)
            ? await sharp(buf).webp({ lossless: true }).toBuffer()
            : await sharp(buf).webp({ quality: QUALITY }).toBuffer();
        fs.writeFileSync(out, enc);
        before += buf.length;
        after += enc.length;
        written++;
        if (REPLACE) fs.unlinkSync(f);
        console.log(`${path.relative(ROOT, out)}  ${kb(buf.length)} → ${kb(enc.length)}`);
    }

    console.log(`\n${written} souborů: ${mb(before)} → ${mb(after)}  (${(before / after).toFixed(1)}× méně)`);
    if (!REPLACE) console.log('Zdrojové .png zůstaly na místě (--replace je smaže).');
})();
