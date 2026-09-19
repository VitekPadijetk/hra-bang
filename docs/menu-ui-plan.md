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
  Které už jsou převedené, říká `MENU_DOM_SCREENS` (menu mimo místnost, podle `App.menuScreen`)
  a `MENU_DOM_ROOM_PHASES` (místnost, podle `roomPhase`) ve `view/menuDom.js`; ostatní kreslí dál
  Phaser (`renderMenuScreen`). `renderUI` (game.js) se na začátku zeptá `menuDomScreen()`
  a vrstvu skryje, když vrátí null – schovává se jen tam, žádné blikání a zachovaný scroll.
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
| 2 | **S5 + S11** (sdílené: řada počtu hráčů, karty rozšíření, pokročilé), souhrn a zamčení v `menuModel` | – | ✅ |
| 3 | **S6, S7, S10** + prázdné stavy | položky seznamu: lídr, `next` (navazující), rozšíření; `game_list` i při výhře | ✅ |
| 4 | **S8, S9** lobby (sedačky, ➕ Bot, ✕ bot, varovné „Opustit hru") | `start_game` jen s plným stolem | ✅ |
| 5 | **S12, S14, S15** (statistiky už jsou HTML v `showStats` → nový vzhled + seskupení podle rolí) | – | ✅ |
| 6 | **S13** účast in / wait / out (D8) | `next_join` / `next_leave`, stav na hráče v `roomPayload`, ruční start lídrem, pryč `nextGameTimer`; testy `test/server.*` | ✅ |
| 7 | **G1, G2, G3, S0, S1, S16** (D7) | `join_error` → `{ title, hint }` | ☐ |
| 8 | Úklid: smazat Phaserové obrazovky z `view/menu.js`, `renderWinnerScreen` (view/screens.js), `ui_choice` v game.js, starý `#rotate-overlay`; řádek do CLAUDE.md + `docs/pravidla/menu-ui.md` | – | ☐ |

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

### Fáze 2 (hotovo)

- `MENU_DOM_SCREENS = main, ui_choice, create, bot_game`. Sdílené prvky ve `view/menuDom.js`:
  `_menuHead` (hlavička, umí i varovné „Opustit hru" pro fázi 4), `_menuBar` (lišta akcí),
  `_menuCountRow` (3–8), `_menuCheck` (karta rozšíření / řádek volby), `_menuExpansionGrid`.
- **Textová pole se při psaní nepřekreslují.** Pole nese `data-field` (zápis přes `MENU_FIELDS`),
  psaní vymění jen oblasti `data-live` (`_patchMenuLive`) – nový `<input>` by vzal fokus
  a na mobilu zaklapl klávesnici. `data-submit` = akce na Enter. Klávesy z polí neprobublají
  do Phaseru. Při ostatních změnách `_mountMenuHtml` vrací fokus prvku se stejným
  `data-act`/`data-arg` (ovládání klávesnicí).
- `core/menuModel.js`: `MENU_EXPANSIONS` (jediný výčet – `emptyExpansions()` se přestěhovala
  z `view/menu.js` a bere ji i `state.js`), `ADVANCED_OPTIONS`, `hnExtraVisible`,
  `advancedSummary` (počítá jen viditelné volby), `playerCountNote`, `createGameBlocker`
  („Vyber počet hráčů." / „Zadej název hry." …), `createGameSummary`, `botGameSummary`,
  `botGameOptions` (payload `create_bot_game`).
- Bez jména vede „Vytvořit novou hru" nejdřív do okna se jménem (S4), na S5 až po „OK".
- Název hry má limit `ROOM_NAME_MAX` = 40 znaků (dřív žádný).
- HN_EXTRA_AUTO (zapnutí High Noonu zaškrtne přibalené karty) zůstává v obou obrazovkách.
- Ověřeno snímky: S5 1280×720 (prázdné, vyplněné, pokročilé rozbalené), 740×360 tmavý i světlý;
  S11 1280×720 a 740×360; psaní do názvu (týž `<input>`, fokus drží, zámek se přepíná, HTML
  v názvu escapované); založení místnosti i hry botů proti běžícímu serveru.
- Mimo menu nalezeno: divák hry botů padá v `renderCharacterSelectScreen` (`state.players[null]`,
  view/screens.js), dokud si boti nevyberou postavy – chyba existovala už se starou obrazovkou.

### Fáze 3 (hotovo)

- `MENU_DOM_SCREENS` += `join_list` (S6), `join_room` (S7), `spectate_list` (S10). Nové sdílené prvky
  ve `view/menuDom.js`: `_menuRoomRow` (řádek místnosti – celý řádek je jedno tlačítko, „akce" vpravo
  je jen jeho popisek), `_menuEmpty` (prázdný stav vždy s tlačítkem, kam dál: S6 → Vytvořit hru,
  S10 → Hra botů), `_menuSeats` (řádky sedaček – připravené i pro S8/S9 ve fázi 4), `_menuNotice`
  a `_menuBar(…, { bad })` (souhrn jako chyba).
- **`MENU_ENTER`** = hák jednou při vstupu na obrazovku, odkudkoli (z menu, zpět z detailu, po konci
  sledování – `hideMenuDom` proto nuluje `_menuScreenName`). S7 si při vstupu vyžádá `taken_names`
  a zahodí starou `joinError`, S10 pošle `get_game_list`. Příznaky `joinListFetched` /
  `spectateListFetched` nové obrazovky nepoužívají (odejdou ve fázi 8 se starým kódem).
- **S7 je živý**: položku si při každém renderu bere čerstvou z `lobby_list` podle id
  (`_menuOpenLobby`), takže se počty i jména mění samy. Zmizí-li hra ze seznamu (začala / zrušená),
  ukáže „⚠ Hra mezitím začala…" a tlačítko zpět na seznam. `taken_names` už překresluje i na S7
  (net/handlers.js).
- Co brání připojení, říká `joinRoomBlocker` (core/menuModel.js) v pořadí zmizelá → plná → bez jména
  → obsazené jméno; tlačítko říká, co chybí („▶ STŮL JE PLNÝ", „ZADAT JMÉNO", „ZMĚNIT JMÉNO").
  Chyba ze serveru (`join_error`) zůstává v liště do dalšího pokusu, ne jen na jeden render jako dřív.
- `core/menuModel.js`: `roomRowView`, `roomWhoLine`, `seatRows`, `joinRoomBlocker`, podtitulky seznamů,
  `isBotName`/`plainName` (bot = prefix „🤖"), `expansionsFromKeys`.
- Server (`server/rooms.js`): položky obou seznamů staví jedna `listItem` – navíc `leader` (jméno),
  `next` (`next_lobby`, nebo `room.gameNo > 1` – počítadlo her místnosti v `server/lifecycle.js`),
  `expansions` (klíče zapnutých) a `botGame`. `broadcastRoom` rozešle `game_list` při výhře, jednou
  za hru (klíčované objektem `gameState`, navazující hra má nový).
- **Oprava mimo plán:** po odchodu lídra z lobby se lídrem mohl stát bot (`players[0]`) a místnost
  bez lidí pak navždy visela v S6 („zakládá Bot 1"), protože ji nikdo nespustí. `leaveRoom` teď
  předá vedení prvnímu člověku a bez lidí místnost rozpustí.
- Ověřeno snímky: S6 1280×720 (čeká / plná / dlouhý název / HTML v názvu), S6 prázdný 740×360,
  S7 1280×720 (běžný, bez jména, zmizelá hra), plný ve světlém motivu, obsazené jméno 740×360,
  S10 1280×720, 740×360 světlý a prázdný. Kliky proti běžícímu serveru: S6 → S7 → připojení do
  lobby, S10 → sledování (vrstva menu zmizí).

### Fáze 4 (hotovo)

- Lobby nejsou obrazovky menu, ale **fáze místnosti** – vrstva je kreslí podle `roomState.roomPhase`
  (`MENU_DOM_ROOM_PHASES = lobby, next_lobby`, jméno obrazovky = fáze). Kterou obrazovku vrstva
  právě kreslí, říká `menuDomScreen()` (nahradila `menuDomHandles`); `renderUI` podle ní schovává
  vrstvu i volá `renderMenuDom` pro lobby místo `renderLobbyScreen` (ten zůstává ve `view/menu.js`
  mrtvý do fáze 8).
- S8 i S9 staví jedna `_menuLobby()`. Kdo je „já" a kdo lídr, se pozná podle `socketId` (jméno se
  po návratu může lišit). Podtitulek: počet a rozšíření (`lobbySubtitle`); nad sedačkami řádek
  „Pravidla: …" se zapnutými pokročilými volbami (`roomRulesLabel`, nové pole `short`
  v `ADVANCED_OPTIONS`) – dosud je znal jen zakladatel.
- **Poznámka nad sedačkami je vždy jedna** (`lobbyNotice`): čekání na art rozšíření → chybějící
  hráči (boty nabízí jen lídrovi, česky skloňované) → v S9 „Přeživší si … mohou nechat postavu".
  Dvě poznámky pod sebou na telefonu na šířku zabraly skoro celou výšku.
- Sedačky (`lobbySeatRows`, sdílený řádek `_seatRow` se `seatRows` z S7): lídrovi je prázdné místo
  celé jedním tlačítkem „➕ Bot" (bez `data-arg`, takže fokus po přidání skočí na další volné
  místo), u bota „✕" (`remove_bot` se `socketId`). V S9 „chce dál ✅" u každého, kdo přešel
  z minulé hry – server mu nechává `wasOriginalSurvivor` (hlasy `wantsNext` se při otevření nulují,
  takže podle nich to nejde).
- Lišta: lídr „▶ ZAHÁJIT HRU" (zamčené říká proč: „(stůl není plný)", „ZAHAJUJI…") + „✕ ZRUŠIT HRU";
  ostatní přerušovaný rámeček (`lobbyWaitText`). Start S9 jde přes `check_start_next`
  (`lobbyStartEvent`). `_menuBar(null, …)` = lišta bez souhrnu.
- `App.startPressed` pouští i `room_update` s neplným stolem (net/handlers.js) – když někdo odešel
  těsně před klikem, tlačítko by zůstalo navždy na „ZAHAJUJI…".
- **Server:** `start_game` nově startuje jen s plným stolem (dosud to hlídal jen klient;
  `check_start_next` to uměl). Test v `test/server.integration.test.js`.
- Ověřeno snímky: S8 lídr 1280×720 (skutečná místnost, dva boti), S8 host 1280×720 (8 míst, HTML
  v názvu, pravidla), S9 lídr 740×360 a 1280×720 světlý (chce dál ✅, ✕ u bota), host 740×360 světlý
  při čekání na art. Kliky proti běžícímu serveru: ➕ Bot ×2 → ✕ → ➕ Bot (plný stůl, START
  odemčený), START → vrstva zmizí a běží intro, „Opustit hru" → hlavní menu.

### Fáze 5 (hotovo)

- Konec hry není obrazovka menu ani fáze místnosti: `menuDomScreen()` vrací **`winner`** (S12), když
  má stav `winner` a místnost je pořád ve fázi `playing`, a **`stats`** (S14), když jsou navíc otevřené
  statistiky (`App.statsOpen`). Ve fázi `finished` (hlasování s odpočtem = S13) vrací null a kreslí
  dál Phaser (`renderWinnerScreen`) – do fáze 6. `renderUI` se na výsledek ptá ve větvi `state.winner`.
- `App.statsOpen` shazuje sám `menuDomScreen()`, jakmile stav výsledek nemá (odchod, další hra) –
  jinak by se statistiky samy otevřely na konci příští hry.
- **S12 jede na starém serveru** (`endGameView` v core/menuModel.js): lídr „▶ Chci další hru" →
  `leader_start_next` (otevře hlasování, tlačítko se hned zamkne – druhý klik by vynuloval hlasy),
  ostatní → `vote_next_game` a místo tlačítka potvrzení „✅ Chceš hrát dál". **Lídr má místo
  „Do menu" „✕ Zrušit hru"** (`cancel_game`) – jeho odchod stejně ruší hru všem, tlačítko to má říct.
  Divák má jen „◀ Zpět do menu". Pod čipy věta, co klik způsobí („ostatní dostanou 20 s…") – odejde
  s fází 6.
- Čipy (`nextGameChips`) staví soupisku ze STAVU hry a páruje ji s `room.players` podle jména: kdo
  z místnosti odešel, v `room.players` už není, a zůstává čipem s ✕ (playerIdx se po odchodu
  přečísluje, proto jméno). Souhrn `nextGameSummary` říká „chce hrát dál", ne „je v další hře" –
  hlas z S12 zatím účast nezaručuje (přijde s D8).
- **S14** je obrazovka vrstvy přes celé jeviště (rohové ⛶ se schová, vpravo je „✕ Zavřít").
  `showStats` (view/menu.js) už jen otevře vrstvu – tudy ji otevírá Phaserová S13. Skupiny
  `statsGroups`: Zákon (Šerif + Pomocníci) / Bandité / Odpadlík(ci), ve hře pro 3 po rolích; souhrn
  skupiny nese výsledek (`playerWon` čte větu vítěze: strana vyhrává i s mrtvými, odpadlík jen živý,
  pod Divokým západem jednotlivec). Šerif má ⭐, můj řádek je zvýrazněný. Sloupce podle návrhu
  (bez Role a Zbraní); v souhrnu je „Zranění" místo anglického „Damage".
- **S15** (`kicked` v `MENU_DOM_SCREENS`): `kickedView` k větě ze serveru přidá druhý řádek, co dál.
  Hlavní akce „Najít jinou hru" (S6); kdo jen sledoval (`App.kickedSpectator`, nastaví
  `kicked_from_game`), dostane „Sledovat jinou hru" (S10).
- Ověřeno snímky s podstrčeným stavem: S12 lídr 1280×720, hráč 740×360, po hlasování 1280×720
  světlý, divák s dlouhou větou vítěze 740×360 světlý; S14 1280×720 a 740×360 světlý (roluje do
  strany); S15 1280×720 a divák 740×360 světlý. Přechody: S12 → S14 → S12, S14 nad Phaserovou S13 →
  zavřít (vrátí se plátno), S13 → `showStats()` → S14. Skutečná hra 3 botů ze S11 doběhla do S12
  (divák, boti ✅).

### Fáze 6 (hotovo)

- **Hlasování s odpočtem je pryč** (D8). Server: `next_join` (přihlásit), `next_leave` (odhlásit –
  zpátky mezi rozhodující se; lídr nesmí), `next_start` (jen lídr, aspoň `NEXT_MIN_PLAYERS` = 3
  přihlášených, lídr se startem přihlásí sám). Kdo se nepřihlásil, dostane `go_to_menu` a opustí kanál
  místnosti (odpojený, za kterého hrál bot, se uvolní přes `botRelease`). **Plný stůl startuje rovnou
  navazující hru**, jinak se otevře S9 (`next_lobby`) a volná místa se doplní tam. `check_start_next`
  zůstal jen pro S9. Zmizely `vote_next_game`, `leader_start_next`, `confirm_next_game`,
  `open_next_lobby`, fáze místnosti `'finished'`, `nextGameTimer` i `nextGameVotes`.
- Přihlašovat se jde jen na obrazovce konce hry (`atEndScreen`): v `next_lobby` leží v `room.gameState`
  pořád stará vyhraná hra. Proto se tam nepřihlašují ani boti (`runBotTickOnce`).
- Stav na hráče = `wantsNext` (`true` / `null`) v `room.players` v `room_update`; kdo odešel, v místnosti
  není a klient ho páruje se soupiskou skončené hry podle jména (`nextRoster` v core/menuModel.js –
  nahradil `nextGameChips`). **`roomPayload` už neposílá tokeny hráčů** – podle tokenu se po výpadku
  vrací na místo, takže kdo ho znal, mohl převzít cizí místo, jakmile se odpojil.
- `startNextGame` nově volá `broadcastLobbyList` – místnost startovaná ze S9 jinak visela v S6.
- Klient: `menuDomScreen()` vrací **`next_game`** (S13), když je hráč přihlášený – přejde tam sám, jakmile
  server přihlášení potvrdí (`App.nextWasIn` hlídá přechod, takže to funguje i po F5). Po „Odhlásit se“
  na S13 zůstává („✅ CHCI HRÁT DÁL“), „◀ Zpět“ vede na S12 (`App.nextOpen = false`), kde je hlavní akcí
  „✅ Jsi v další hře ›“. Divák S13 nevidí.
- S13 (`nextGameView`, `nextRowTag` v core/menuModel.js): souhrn a velké „3 / 4“, segmentový pruh,
  řádky HRAJE / ČEKÁ SE / ODEŠEL (přívlastek „(ty) · Game Leader · bot · odpojen“). **Odchylka od návrhu:**
  hlavní akce jsou v pevné liště dole jako v S8/S9 (na telefonu na šířku by v rolující ploše skončily
  pod okrajem) – lídr „▶ ZAHÁJIT DALŠÍ HRU (3 hráči)“ / „(chybí 1)“ + „✕ ZRUŠIT HRU“, přihlášený zelený pruh
  „✅ Jsi v další hře. Čeká se na 1 hráče.“ + „Odhlásit se“, nepřihlášený „✅ CHCI HRÁT DÁL“. Když stůl po
  startu nebude plný, poznámka říká, že volná místa se doplní v lobby další hry.
- Bublina chatu leží po konci hry i v S9 přes pravý dolní roh: `showOrHideChat` (chat.js) dává `<body>`
  třídu `chat-on` a lišta akcí si vpravo nechá místo.
- `renderWinnerScreen` (view/screens.js) je teď mrtvý kód – smaže se ve fázi 8.
- Otevřené: při stole pro 3 a jednom odchodu se na 3 přihlášené už nedá dojít (nikdo nový do S13
  nepřijde), lídr pak může jen zrušit hru.
