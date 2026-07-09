// view/theme.js — JEDINÝ zdroj pravdy pro vzhled UI (paleta, font, kreslicí helpery).
// Klientský global (žádný build step): načítá se v index.html PŘED game.js.
// Styl: „hybrid" – tmavý podklad + westernové zlaté akcenty, zaoblená tlačítka.
//
// Helpery kreslí do Phaser scény a přidávají výsledek do scene.cardsSprites
// (immediate-mode: renderUI vše smaže a překreslí, viz game.js).

const THEME = {
    // Font: veškerý český text. Oswald z Google Fonts, s bezpečnými fallbacky.
    fontUI: "'Oswald', 'Trebuchet MS', sans-serif",

    color: {
        bg:        '#141118', bgNum:        0x141118,   // celkové pozadí
        panel:     '#1e1a24', panelNum:     0x1e1a24,   // panely / tlačítka
        panelHi:   '#2a2431', panelHiNum:   0x2a2431,   // hover / světlejší
        border:    '#3a3242', borderNum:    0x3a3242,   // tlumený okraj
        gold:      '#e0b23c', goldNum:      0xe0b23c,   // zlatý akcent
        goldDark:  '#8a6d1f', goldDarkNum:  0x8a6d1f,   // tmavší zlatá (rámy)
        text:      '#f2ede4',                            // primární text
        textMuted: '#9a9088',                            // tlumený text
        danger:    '#d64545', dangerNum:    0xd64545,   // červená (BANG!/nebezpečí)
        dangerDark:'#7a2424', dangerDarkNum:0x7a2424,
        success:   '#5fae5f', successNum:   0x5fae5f,   // zelená (úspěch/přijmout)
        successDark:'#2f5f2f', successDarkNum:0x2f5f2f,
    },

    // Barvy rolí (sjednoceno z view/menu.js roleColors).
    role: { Sheriff: 0xe0b23c, Deputy: 0x2f7fb8, Outlaw: 0xc0392b, Renegade: 0x8e44ad },

    radius: 14,
};

// Vykreslí tělo tlačítka (stín + výplň + zlatý rám) do daného Graphics, se středem v (0,0).
function _themeDrawBody(gfx, w, h, fill, stroke, r) {
    gfx.clear();
    gfx.fillStyle(0x000000, 0.35);
    gfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, r);   // vržený stín
    gfx.fillStyle(fill, 1);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, r);            // tělo
    gfx.lineStyle(2, stroke, 0.95);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, r);          // rám
}

// Zaoblené tlačítko. Střed v (x,y); s opts.origin=[ox,oy] lze zarovnat jako u setOrigin
// (např. [0,0] = (x,y) je levý horní roh – pro rohové chipy). Vrací { bg, txt } – `bg` je
// interaktivní kontejner (podporuje .on('pointerup', …)) kvůli kompatibilitě se staršími call-site.
// Klik je vázán na `pointerup` (ne pointerdown): immediate-mode renderUI často překreslí celé
// UI (broadcast serveru, 1s odpočet další hry, tahy botů) a tlačítko mezitím zničí a znovu
// vytvoří; pointerup se chytí i na nově vytvořeném tlačítku, když se re-render trefí mezi
// stisk a puštění – jinak by kliky „propadávaly" a tlačítka šla těžko zmáčknout.
// opts: { onClick, fill, fillHover, stroke, textColor, fontSize, fontStyle, radius, origin }
function themeButton(scene, x, y, w, h, label, opts = {}) {
    const fill      = opts.fill      ?? THEME.color.panelNum;
    const fillHover = opts.fillHover ?? THEME.color.panelHiNum;
    const stroke    = opts.stroke    ?? THEME.color.goldDarkNum;
    const textColor = opts.textColor ?? THEME.color.text;
    const fontSize  = opts.fontSize  ?? '24px';
    const fontStyle = opts.fontStyle ?? 'bold';
    const r         = opts.radius    ?? THEME.radius;
    const [ox, oy]  = opts.origin    ?? [0.5, 0.5];

    const cont = scene.add.container(x + w * (0.5 - ox), y + h * (0.5 - oy));
    const gfx = scene.add.graphics();
    _themeDrawBody(gfx, w, h, fill, stroke, r);
    const txt = scene.add.text(0, 0, label, {
        fontFamily: THEME.fontUI, fontSize, color: textColor, fontStyle, align: 'center',
        shadow: { offsetX: 0, offsetY: 1, color: '#000', blur: 3, fill: true },
    }).setOrigin(0.5);
    cont.add([gfx, txt]);
    cont.setSize(w, h);
    // Hit-area jako TOP-LEFT obdélník (0,0,w,h), NE vycentrovaný (-w/2,-h/2,…):
    // Phaser 3.60 při hit-testu normalizuje bod o displayOrigin (w/2,h/2), takže
    // vycentrovaný obdélník posune klikací zónu o půl šířky doleva (a půl výšky nahoru).
    // Top-left obdélník tuto normalizaci vyruší → hitbox přesně sedí na tlačítku.
    cont.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    cont.input.cursor = 'pointer';

    cont.on('pointerover', () => { _themeDrawBody(gfx, w, h, fillHover, THEME.color.goldNum, r); cont.setScale(1.03); });
    cont.on('pointerout',  () => { _themeDrawBody(gfx, w, h, fill, stroke, r); cont.setScale(1); });
    if (opts.onClick) cont.on('pointerup', opts.onClick);

    scene.cardsSprites.add(cont);
    return { bg: cont, txt };
}

// Styl pro přepínací tlačítko (aktivní/„armed" = zlaté, jinak neutrální panel).
// Vrací část opts pro themeButton: { fill, fillHover, stroke, textColor }.
function themeToggleStyle(active) {
    return active
        ? { fill: 0x4a3a12, fillHover: 0x5c4915, stroke: THEME.color.goldNum, textColor: THEME.color.gold }
        : { fill: THEME.color.panelNum, fillHover: THEME.color.panelHiNum, stroke: THEME.color.goldDarkNum, textColor: THEME.color.text };
}

// Zaoblený panel (podklad pro seskupení tlačítek/formulářů), střed v (x,y).
function themePanel(scene, x, y, w, h, opts = {}) {
    const fill   = opts.fill   ?? THEME.color.panelNum;
    const stroke = opts.stroke ?? THEME.color.borderNum;
    const alpha  = opts.alpha  ?? 0.92;
    const r      = opts.radius ?? 18;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.30);
    g.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 5, w, h, r);
    g.fillStyle(fill, alpha);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
    g.lineStyle(2, stroke, 0.9);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
    scene.cardsSprites.add(g);
    return g;
}

// Jednotný nadpis / název hry (zlatý text na tmavém zaobleném pruhu), střed v (x,y).
// Nahrazuje roztroušené inline `48px #ffcc00 …` titulky.
function themeTitle(scene, x, y, text, opts = {}) {
    const fontSize  = opts.fontSize  ?? '46px';
    const textColor = opts.textColor ?? THEME.color.gold;
    const txt = scene.add.text(x, y, text, {
        fontFamily: THEME.fontUI, fontSize, color: textColor, fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 2, color: '#000', blur: 4, fill: true },
    }).setOrigin(0.5);
    const w = txt.width + 52, h = txt.height + 20;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    g.lineStyle(2, THEME.color.goldDarkNum, 0.85);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    scene.children.bringToTop(txt);   // text nad podkladem
    scene.cardsSprites.add(g);
    scene.cardsSprites.add(txt);
    return { txt, bg: g, height: h };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { THEME, themeButton, themePanel, themeTitle, themeToggleStyle };
}
