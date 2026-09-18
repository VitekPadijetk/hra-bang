# Nové menu v HTML — implementační plán

Podklad: [handoff/](../handoff/) (návrh z Claude Design). **Čti jen to, co fáze potřebuje:**

| Soubor | Kdy |
|---|---|
| `handoff/screens.md` | sekce obrazovky, kterou děláš |
| `handoff/components.md` | když stavíš nový typ prvku (řádek místnosti, sedačky, odznak…) |
| `handoff/tokens.md` | už přepsané do `view/menu.css`, znovu číst netřeba |
| `handoff/Bang Menu.dc.html` | **jen rozsah řádků obrazovky** (tabulka níž), nikdy celý (87 kB) |
| `docs/predani-ui-menu-lobby.md` | §3.4 (co odchází na server) a §6 (kontrakt Socket.IO); **přílohu ne** |

Starý Phaserový kód menu (`view/menu.js`) se **nepřepisuje ani nečte celý** – nové obrazovky
vznikají vedle a starý kód se ve fázi 8 smaže. Když potřebuješ zjistit chování staré obrazovky,
hledej `socket.emit` / `App.` v jejím bloku (`screen === '…'`).

## Rozhodnutí

- **D1 – hybrid po obrazovkách.** Obrazovky mimo stůl jsou DOM vrstva `#bang-ui` nad plátnem.
  Které už jsou převedené, říká `MENU_DOM_SCREENS` ve `view/menuDom.js`; ostatní kreslí dál
  Phaser (`renderMenuScreen`). `renderUI` (game.js) se na začátku zeptá `menuDomHandles(…)`
  a vrstvu skryje, když ji aktuální pohled nepoužívá – schovává se jen tam, žádné blikání
  a zachovaný scroll.
- **D2 – render = HTML řetězec + delegace klikání.** Obrazovka vrátí HTML, `_mountMenuHtml` ho
  vymění jen při změně (renderUI běží při každém `lobby_list`, jinak by se ztrácel scroll
  i focus). Kliky nesou `data-act="…"`, obsluha je jedna tabulka akcí. **Každý text od
  hráče (jméno, název hry) jde přes `esc()`** – jinak je z názvu místnosti XSS.
- **D3 – logika bez DOM do `core/menuModel.js`** (izomorfní, testy `test/menuModel.test.js`):
  české skloňování počtů, iniciály, limit jména, souhrn v liště, důvod zamčení, poznámka
  k počtu hráčů, viditelnost „přibalených karet", pohled na řádek místnosti.
- **D4 – tokeny jen v `view/menu.css`** na `.bang-ui[data-theme=…]`. Motiv v `localStorage.bangTheme`
  (`dark` výchozí). Motiv platí jen pro HTML vrstvu, herní stůl se nemění.
- **D5 – klíče `localStorage`:** jméno `bangName` (nové), rozložení zůstává **`bangUiMode`**
  (`big` | `normal`, už existuje – handoff ho nazývá `bangLayout`), motiv `bangTheme`.
- **D6 – eventy snake_case** jako zbytek serveru: `next_join` / `next_leave` (handoff píše
  `next:join`), `remove_bot` už existuje.
- **D7 – S16 Debug** = návrh (stav, simulace, log) **+ zachovaný spouštěč debug hry**
  (role, rozšíření, počet → `debug_start`), postavený z prvků S5.
- **D8 – S13 účast:** klik „Chci další hru" na S12 = přihlášení (`in`), nikdo nepotvrzuje
  dvakrát, 20s odpočet mizí. Lídr spustí ručně při **≥ 3 přihlášených**; prázdná místa se
  doplní v S9 (boti), **kdo neodpoví, do hry nejde** (odchází do menu). Potvrzeno uživatelem.
- **D9 – fullscreen:** vrstva má vlastní rohové „⛶ Fullscreen" (hlavička nechává vpravo 150 px);
  Phaserové FS tlačítko je pod vrstvou schované.

## Mapa návrhu (`handoff/Bang Menu.dc.html`, řádky)

| Obrazovka | Markup | Poznámka |
|---|---|---|
| stůl + jeviště + FS | 45–52 | preview lišta 31–43 do hry nepatří |
| S3 hlavní menu | 54–107 | |
| hlavička obrazovky | 109–118 | |
| S5 vytvořit hru | 120–189 | pokročilé 167–179 |
| S6 / S10 seznamy | 191–224 | |
| S7 / S8 / S9 sedačky | 226–269 | |
| S12 konec hry | 271–296 | |
| S13 účast | 298–348 | |
| S11 hra botů | 350–396 | |
| S15 vyhozen | 398–415 | |
| S2 rozložení | 417–441 | |
| S0 načítání | 443–456 | |
| S1 otoč telefon | 458–468 | |
| G1 banner | 470–477 | |
| S16 debug | 479–516 | |
| G2 odpojení | 518–533 | |
| G3 chyba | 535–545 | |
| S4 jméno | 547–561 | |
| S14 statistiky | 563–600 | |
| skript (data, výpočty stylů) | 607–1029 | `renderVals()` od ř. 680; mock data nahoře |

## Fáze

Každá fáze = commit + push. **HTML vrstvu jde vyfotit** – `node tools/menushot.js <url> 1280x720 out.png [js…]`
(headless Chrome přes DevTools; kroky jsou JS, např. `"localStorage.setItem('bangTheme','light')"`,
`"MENU_ACTIONS.name()"`). Server pusť na jiném portu (`PORT=3123 node server.js`). Plátno se tím
ověřit nedá – herní stůl dál kontroluje uživatel.

| # | Obsah | Server | Stav |
|---|---|---|---|
| 1 | Kostra (`view/menu.css`, `view/menuDom.js`, `core/menuModel.js`, fonty Rye + EB Garamond, přepínání vrstvy v `renderUI`), motiv, `bangName`; **S3, S2, S4** | `game_list` se rozesílá spolu s `lobby_list` (živý počet běžících her v S3) | ✅ |
| 2 | **S5 + S11** (sdílené: řada počtu hráčů, karty rozšíření, pokročilé), souhrn a zamčení v `menuModel` | – | ☐ |
| 3 | **S6, S7, S10** + prázdné stavy | položky seznamu: lídr, `next` (navazující), rozšíření; `game_list` i při výhře | ☐ |
| 4 | **S8, S9** lobby (sedačky, ➕ Bot, ✕ bot, varovné „Opustit hru") | – | ☐ |
| 5 | **S12, S14, S15** (statistiky už jsou HTML v `showStats` → nový vzhled + seskupení podle rolí) | – | ☐ |
| 6 | **S13** účast in / wait / out (D8) | `next_join` / `next_leave`, stav na hráče v `roomPayload`, ruční start lídrem, pryč `nextGameTimer`; testy `test/server.*` | ☐ |
| 7 | **G1, G2, G3, S0, S1, S16** (D7) | `join_error` → `{ title, hint }` | ☐ |
| 8 | Úklid: smazat Phaserové obrazovky z `view/menu.js`, `ui_choice` v game.js, starý `#rotate-overlay`; řádek do CLAUDE.md + `docs/pravidla/menu-ui.md` | – | ☐ |

## Stav po fázích

### Fáze 1 (hotovo)

- `view/menuDom.js`: kořen `#bang-ui` (vrstva) a `.bu-modal-root` (okno se jménem – samostatný
  kořen, protože ho volají i staré Phaserové obrazovky přes `showNameInput`, pod kterými je
  vrstva skrytá). `MENU_DOM_SCREENS = main, ui_choice`.
- `showNameInput` (view/menu.js) deleguje na `openNameModal` – staré obrazovky create/join tak
  už používají nové okno.
- `playerName` se při startu načte z `localStorage.bangName`; uloží se po „OK" v okně.
  Návrat do hry po F5 (`attemptRejoin`, net/handlers.js) ho přepíše jménem ze `bangSession`.
- `broadcastLobbyList` (server/rooms.js) posílá i `game_list`; klient kvůli němu překresluje
  jen v menu (`!roomState`).
- Ověřeno snímky: S3 1280×720 a 740×360, S4 ve světlém motivu s chybou, S2 740×360.
