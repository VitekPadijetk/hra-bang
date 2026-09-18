# Tokeny

## Barvy

Definuj na kořenu UI vrstvy; přepnutí motivu = přehodit celou sadu.

```css
.bang-ui[data-theme="dark"] {
  --wood: #4a2f1c;  --woodA: #5a3a22;  --woodB: #3a2416;  --frame: #6b4a2b;
  --inset: rgba(201,162,75,.25);
  --bg: #1e1610;  --bg2: #241a12;
  --panel: #241a12;  --panelHi: #2b1f14;
  --line: #3a2a1c;  --line2: #4a3620;
  --gold: #c9a24b;  --goldHi: #e0c579;  --onGold: #1c1410;
  --text: #ece3d0;  --muted: #a8926a;  --dim: #7a6a55;
  --logoShadow: #3a2a1c;
  --ok: #5aa04a;  --okBg: rgba(90,160,74,.12);
  --bad: #e06a5a;  --badLine: #7a2424;  --badBg: rgba(224,106,90,.12);
  --running: #c98a4b;
  --inputBg: #140e09;  --headerBg: rgba(0,0,0,.28);
  --noticeBg: rgba(201,162,75,.08);  --toastBg: #2a1614;
  --scrim: rgba(12,8,5,.8);
  --slotA: #23301f;  --slotB: #33261a;  --slotC: #1c2334;  --slotD: #2c1c34;
  --roleSheriff: #e0c579;  --roleOutlaw: #e0705c;  --roleRenegade: #b07ad0;
}

.bang-ui[data-theme="light"] {
  --wood: #c8a06a;  --woodA: #d8b880;  --woodB: #c39a62;  --frame: #9c6b1e;
  --inset: rgba(255,255,255,.35);
  --bg: #f3e7cf;  --bg2: #efe0c2;
  --panel: #fbf5e8;  --panelHi: #fffaf0;
  --line: #ddc494;  --line2: #cdae72;
  --gold: #8a5d15;  --goldHi: #b8862f;  --onGold: #fff8e9;
  --text: #3a2a18;  --muted: #6f5327;  --dim: #9a825a;
  --logoShadow: rgba(255,255,255,.6);
  --ok: #2e7a35;  --okBg: rgba(46,122,53,.12);
  --bad: #8a2318;  --badLine: #c09a90;  --badBg: rgba(138,35,24,.08);
  --running: #9c5b1e;
  --inputBg: #fffaf0;  --headerBg: rgba(255,255,255,.55);
  --noticeBg: rgba(156,107,30,.10);  --toastBg: #fdeee9;
  --scrim: rgba(60,40,20,.6);
  --slotA: #e4ecdd;  --slotB: #f0e3cd;  --slotC: #dde3ef;  --slotD: #e9dcef;
  --roleSheriff: #8a5d15;  --roleOutlaw: #9c2f22;  --roleRenegade: #6b3a8e;
}
```

Poznámka ke světlému motivu: `--gold` je v něm tmavě hnědá (#8a5d15), ne zlatá. Zlatá na světlém
podkladu nemá kontrast. Text na zlatém tlačítku je proto vždy `--onGold`, nikdy `--text`.

### Kde se co používá

- `--wood`, `--woodA`, `--woodB` — dřevěný stůl kolem jeviště (pozadí celé vrstvy)
- `--frame`, `--inset` — rám jeviště
- `--bg`, `--bg2` — vnitřek jeviště (svislý přechod)
- `--panel` — karty, řádky, tlačítka; `--panelHi` na hover
- `--line` — dělící linky a jemné rámy; `--line2` — rám interaktivních prvků
- `--gold` — akcent, vybraný stav, primární tlačítka (přechod `--goldHi` → `--gold`)
- `--text`, `--muted`, `--dim` — tři úrovně textu; `--dim` jen pro neaktivní
- `--ok`, `--bad`, `--running` — čeká / plná / probíhá, potvrzeno / chyba
- `--slotA`…`--slotD` — podklady čtyř ikon v hlavním menu, aby se odlišily

## Typografie

Tři řezy, každý s jasnou rolí. Načítej z Google Fonts.

```
Rye            — jen displej: logo BANG!, nadpisy oken, iniciály v avatarech
Oswald         — celé UI: tlačítka, nadpisy, jména, čísla (400/500/600)
EB Garamond    — jen vysvětlující text: nápovědy, popisky rozšíření, podtitulky (400, kurzíva pro motta)
```

Pravidlo: co hráč čte kvůli rozhodnutí, je Oswald. Co si čte na doplnění, je Garamond.

| Prvek | Font | Velikost |
|---|---|---|
| Logo BANG! | Rye | `clamp(34px, 6vw, 76px)` |
| Nadpis obrazovky | Oswald 600 | `clamp(18px, 2.2vw, 26px)` |
| Podtitulek v hlavičce | EB Garamond | 14px |
| Tlačítko v menu — název | Oswald 600 | 20px |
| Tlačítko v menu — popisek | EB Garamond | 15px |
| Jméno hráče v seznamu | Oswald | 18px |
| Název místnosti | Oswald 600 | 19px |
| Nápověda u rozšíření | EB Garamond | 14px, `line-height: 1.35` |
| Popisek sekce | Oswald | 12px, `letter-spacing: .16em`, `text-transform: uppercase` |
| Odznak stavu | Oswald | 13px, `letter-spacing: .06em` |
| Primární tlačítko | Oswald 600 | 18px, `letter-spacing: .05em` |
| Řádek debug logu | monospace | 13px |

Na dlouhé texty (nápovědy, poznámky) použij `text-wrap: pretty`.

## Rozměry

```
Rádius:     9px běžné prvky · 12px okna a velké karty · 20px pilulky/odznaky · 50% avatary
Rám:        1px --line běžně · 2px --gold u vybraného · 4px levý okraj jako barevný akcent
Mezery:     6–7px mezi řádky v seznamu · 10px mezi kartami · 14–16px mezi sekcemi
Vnitřní:    11–13px řádky · 16px rolující oblast · 18–22px okna
Hlavička:   13px svisle, vpravo 150px volno na rohové ovládání
```

### Minimální rozměry

- Interaktivní prvek nejméně 44px na výšku (dodrženo padding+font, ne fixní výškou)
- Text nikdy pod 13px; nápovědy 14px
- Jeviště testováno na 1280×720 a 740×360

## Mřížky

```css
/* karty, které se mají samy skládat */
grid-template-columns: repeat(auto-fit, minmax(min(100%, 265px), 1fr));

/* volba počtu hráčů — vždy 6 v řadě, i na mobilu */
grid-template-columns: repeat(6, minmax(0, 1fr));

/* tabulka statistik — vodorovné rolování pod 900px */
grid-template-columns: 1.4fr 1.2fr .7fr .9fr .7fr .7fr .7fr .7fr .7fr 1.6fr;
```

## Skeleton obrazovky

```html
<div class="bang-ui" data-theme="dark">          <!-- tokeny -->
  <div class="stage">                            <!-- rám, přetékání skryto -->
    <header>...</header>                         <!-- flex: none -->
    <div class="scroll">...</div>                <!-- flex: 1; min-height: 0; overflow-y: auto -->
    <footer>...</footer>                         <!-- flex: none, lišta akcí -->
  </div>
</div>
```

`min-height: 0` na rolující části je povinné — bez něj flex kolona nepovolí rolování a obsah
vytlačí lištu akcí ven.
