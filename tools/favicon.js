#!/usr/bin/env node
/**
 * Generátor ikony webu (favicon) z loga hry.
 *
 * Ikona v záložce je 16×16 px, takže se do ní celý nápis „BANG!" nevejde – zbyla by
 * z něj červená šmouha. Bere se proto jen písmeno **B** z `assets/logo.webp` (je to
 * pořád ten samý brand art, nekreslí se nic nového) a sází se na tmavé pozadí hry
 * (#100d14, stejné jako `body` v index.html), aby černý obrys písmene splynul
 * s podkladem a zůstala jen červená silueta – ta je čitelná i v 16 px.
 *
 * Alternativa „hvězda šerifa" (assets/other_cards/sheriff_star.webp) vypadá ve větších
 * velikostech líp, ale v 16 px je z ní mazanec – proto písmeno.
 *
 * Formáty: `.ico` (16/32/48 v jednom souboru, sem sahá prohlížeč sám na /favicon.ico)
 * a `.png` pro `<link rel="icon">` a `apple-touch-icon`. WebP se tu použít NEDÁ –
 * Safari ho jako ikonu neumí, a jsou to jednotky kB, takže se bandwidth pravidla
 * z tools/webp.js netýkají.
 *
 * sharp není závislost hry – instaluje se jen na převod:
 *
 *     npm install sharp --no-save
 *     node tools/favicon.js
 */

const fs = require('fs');
const path = require('path');

let sharp;
try {
    sharp = require('sharp');
} catch (_) {
    console.error('Chybí sharp. Spusť: npm install sharp --no-save');
    process.exit(1);
}

const ROOT = path.join(__dirname, '..');

// Ohraničení písmene B v assets/logo.webp (2000×1090). Písmena se v logu dotýkají,
// takže mezi B a A není průhledný sloupec – řez vede nejužším místem (sloupec 474).
const B_CROP = { left: 15, top: 32, width: 460, height: 1038 };

// Pozadí hry z index.html (body { background-color: #100d14 }).
const BG = { r: 0x10, g: 0x0d, b: 0x14, alpha: 1 };

/** Jedna čtvercová ikona: písmeno B vycentrované na tmavém podkladu. PNG buffer. */
async function icon(size, fill = 0.86) {
    const glyph = await sharp(path.join(ROOT, 'assets/logo.webp'))
        .extract(B_CROP)
        .resize({ height: Math.round(size * fill), fit: 'inside' })
        .png()
        .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
        .composite([{ input: glyph, gravity: 'centre' }])
        .png({ compressionLevel: 9 })
        .toBuffer();
}

/**
 * Složí .ico z hotových PNG. ICO umí PNG uvnitř nést (Vista+) – nemusí se tedy
 * překódovávat do BMP. Hlavička: ICONDIR (6 B) + ICONDIRENTRY (16 B na obrázek).
 */
function buildIco(images) {
    const dir = Buffer.alloc(6);
    dir.writeUInt16LE(0, 0);              // reserved
    dir.writeUInt16LE(1, 2);              // typ 1 = ikona
    dir.writeUInt16LE(images.length, 4);  // počet obrázků

    let offset = 6 + images.length * 16;
    const entries = images.map(({ size, data }) => {
        const e = Buffer.alloc(16);
        e.writeUInt8(size >= 256 ? 0 : size, 0);   // šířka (0 = 256)
        e.writeUInt8(size >= 256 ? 0 : size, 1);   // výška
        e.writeUInt8(0, 2);                        // barev v paletě (0 = truecolor)
        e.writeUInt8(0, 3);                        // reserved
        e.writeUInt16LE(1, 4);                     // color planes
        e.writeUInt16LE(32, 6);                    // bitů na pixel
        e.writeUInt32LE(data.length, 8);
        e.writeUInt32LE(offset, 12);
        offset += data.length;
        return e;
    });

    return Buffer.concat([dir, ...entries, ...images.map(i => i.data)]);
}

(async () => {
    const ico = [];
    for (const size of [16, 32, 48]) ico.push({ size, data: await icon(size) });
    fs.writeFileSync(path.join(ROOT, 'favicon.ico'), buildIco(ico));

    fs.writeFileSync(path.join(ROOT, 'assets/favicon-32.png'), await icon(32));
    // iOS si ikonu na plochu sám ořízne do zaoblených rohů, takže potřebuje větší okraj.
    fs.writeFileSync(path.join(ROOT, 'assets/apple-touch-icon.png'), await icon(180, 0.72));

    for (const f of ['favicon.ico', 'assets/favicon-32.png', 'assets/apple-touch-icon.png']) {
        console.log(`${f}  ${fs.statSync(path.join(ROOT, f)).size} B`);
    }
})();
