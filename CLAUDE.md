# CLAUDE.md — mapa kódu pro AI editaci

Webová hra **Bang!** (česká karetní hra). Autoritativní server + tenký Phaser klient přes Socket.IO.

## Architektura v jedné větě

Veškerá **pravidla** běží na serveru (`logic.js` třída `GameState`). Klient (`game.js` + `view/*`) jen **renderuje stav** a posílá akce; server odpoví novým stavem, klient překreslí.

```
prohlížeč (Phaser)  ──socket akce──►  server.js  ──►  logic.js (GameState = pravidla)
      ▲                                                      │
      └───────────  room_update (nový stav)  ◄──────────────┘
```

## Podrobnosti jsou v `docs/pravidla/` — načti si jen to, co potřebuješ

Tenhle soubor drží jen to, co platí **napříč celou hrou**: architekturu, mapu souborů,
konvence a pravidlo „nejdřív doběhne efekt zahrané karty". Hluboké popisy jednotlivých
rozšíření a subsystémů leží vedle, aby se do každé session nenačítalo 130 kB.

**Když se úkol dotýká něčeho z pravého sloupce, přečti si ten soubor DŘÍV, než začneš
editovat.** Je v něm hotové řešení včetně pastí, na které se už jednou narazilo — bez
něj se chyba zopakuje.

| Soubor | Co je v něm |
|---|---|
| [mapa-souboru.md](docs/pravidla/mapa-souboru.md) | Plné popisy všech souborů (server, klient, `core/`): háky, pasti, odkud se co volá |
| [divoky-zapad.md](docs/pravidla/divoky-zapad.md) | Divoký západ: všech 10 událostí a 8 postav (Zúčtování, Sacagaway, Hřbitov/Helena, Roubík, Lady Růže, Zuřivá Doroty, Greygory Deck, …) |
| [zlata-horecka.md](docs/pravidla/zlata-horecka.md) | Zlatá horečka: valouny, obchod, vybavení, Wanted, 8 postav, Stínoví pistolníci |
| [fistful-udalosti.md](docs/pravidla/fistful-udalosti.md) | A Fistful of Cards: dva balíčky událostí vedle sebe, krokovaný start tahu (Mrtvý muž, Fistful of Cards, Pokrevní bratři), Laso, Soudce, Léčka, Opuštěný důl, Peyote, Ruská ruleta, Vendeta, Ranč |
| [fistful-pravo-a-strelba.md](docs/pravidla/fistful-pravo-a-strelba.md) | Právo západu (vynucená karta zamyká tah), Odstřelovač, Odražená střela |
| [high-noon.md](docs/pravidla/high-noon.md) | High Noon: Město duchů (duch se vrací na tah), Daltonové, Požehnání/Prokletí, Nová identita, Želízka |
| [pocty-hracu.md](docs/pravidla/pocty-hracu.md) | Hra pro 3 hráče (odkryté role, cíle v kruhu) a pro 8 hráčů (dva odpadlíci) |
| [postavy.md](docs/pravidla/postavy.md) | Slab the Killer, dělení karet mezi víc Vulture Samů, slévání odložených líznutí (Bart/Boty/Yto/Úhyb), Lucky Duke, odkrytá řada Kita a Clause, Claus / Uncle Will / Johnny Kisch, Pivo při dvou hráčích, Pálenka |
| [intro.md](docs/pravidla/intro.md) | Intro cinematika: co drží pozice, rozdávání rolí a postav, intro navazující hry |
| [rozlozeni.md](docs/pravidla/rozlozeni.md) | Mobilní profil (kompaktní soupeři) a pás vyložených karet |
| [sit-a-assety.md](docs/pravidla/sit-a-assety.md) | Redakce stavu (co klient smí vidět) a bandwidth (WebP, komprese, cache) |
| [udoli-stinu.md](docs/pravidla/udoli-stinu.md) | Údolí stínů: fronta výstřelů, kolečko voleb (Tornádo/Poker/Divoká banda), Duch (ve hře s nulou životů), okno úniku (Útěk, Mick), Henry Block (pozastavená akce), Obětavý skok, bot, zátěž a rozložení (řada Pokeru, přepínač Dvojité rány) |

**Nová sekce patří do `docs/pravidla/`, ne sem** — sem jen řádek do téhle tabulky.
Výjimka: pravidlo, na které musí člověk narazit, i když ho nehledá (jako redakce stavu
nebo „nejdřív doběhne efekt") — to sem patří aspoň jako jednořádková pojistka.

## Mapa souborů

Krátce, co kde je. **Plné popisy (háky, pasti, odkud se co volá) jsou v
[docs/pravidla/mapa-souboru.md](docs/pravidla/mapa-souboru.md)** – než sáhneš do souboru,
přečti si tam jeho řádek.

### Server (Node)
| Soubor | Co dělá |
|---|---|
| `logic.js` | Kostra třídy `GameState` (tok tahu, `nextTurn`, `tryEndTurn`, `checkWinCondition`) + shimy globálů; zbytek metod jsou mixiny `logic/*`. Izomorfní, re-exportuje entity. |
| `logic/entities.js` | `Card`/`Player`/`Deck`, `CardType`, `ALL_CHARACTERS`. **`Deck` je jediná cesta na hromádky.** |
| `logic/setup.js` | Setup hry, výběr postav, další hra, debug rozdávání. |
| `logic/draw.js` | Fáze lízání (`startDrawPhase`, `_setDrawPhase`, `_finishDraw`/`_finishDrawTail`), Kit Carlson, Black Jack, volba Very Custer, `_revealAnim`. |
| `logic/play.js` | Hraní karet: `playCard` (router), `playBang`, `playSpecialCard`, `playBoardCard`, barel, výběr karty, hromadné útoky. |
| `logic/combat.js` | `handleDamage`, `handlePlayerDeath` (**jediný trychtýř vyřazení**), dynamit, `_turnOwnerGone`. |
| `logic/response.js` | Fáze RESPOND, záchrana posledního života (Pivo/Sid/Batoh). |
| `logic/characters.js` | Schopnosti postav, fronta odložených akcí (`_processSpecialQueue`/`_resumeAfterSpecial`/`_pruneSuzyQueue`), Lucky Duke (`_checkRevealCount`), dělení mezi Vulture Samy, `_onBeerCardPlayed`. |
| `logic/checks.js` | Sejmutí na začátku tahu (Dynamit/Vězení) a `_applyCheckResult`. |
| `logic/highNoon.js` | High Noon: balíček událostí, `hasEvent`, krokovaný start tahu (`_beginTurn`/`_runBeginTurn`), Daltonové, Město duchů, Nová identita, Želízka; sdílené `_bangLimit`/`_turnStep`/**`_effSuit`** (jediný zdroj barvy karty). |
| `logic/fistful.js` | A Fistful of Cards (druhý balíček událostí) a jeho karty. |
| `logic/wildWest.js` | Divoký západ (třetí balíček, otáčí ho Dostavník/Wells Fargo) + jeho postavy. Viz [divoky-zapad.md](docs/pravidla/divoky-zapad.md). |
| `logic/goldRush.js` | Zlatá horečka: valouny, obchod, vybavení (`player.gear`, `_gearOn`), `_afterLifeLost`, postavy. Viz [zlata-horecka.md](docs/pravidla/zlata-horecka.md). |
| `logic/shadow.js` | Varianta Stínoví pistolníci. |
| `logic/valley.js` | Údolí stínů. Viz [udoli-stinu.md](docs/pravidla/udoli-stinu.md). |
| `logic/armed.js` | Ozbrojení a nebezpeční (rozpracované): žetony nabití. |
| `server.js` | Socket.IO bootstrap; logika v `server/*`. |
| `server/rooms.js` | Místnosti, `broadcastRoom`, **`redactState`**, `closeRoom`/`roomAlive` (nikdy holé `rooms.delete`), `leaveSpectate`, `swapRoomSeats`, `emitChat`. |
| `server/intro.js` | Serverová intro sekvence (timeouty). |
| `server/anim.js` | `emitAnim*`, cinematiky, držení botů. |
| `server/lifecycle.js` | `startGame`, `startNextGame`. |
| `server/gamelog.js` | Herní log `logs/*.jsonl`. **Při hlášení chyby čti nejnovější log a `reports/`.** |
| `server/guard.js` | Autorizace akcí podle `pendingActor`. |
| `server/ledger.js` | Veřejný ledger chování (pro dedukci rolí botem). |
| `server/bots.js` | Boti (fake socket, `decideBotAction`), hlášky do chatu. |
| `server/handlers.*.js` | Socket handlery podle subsystému (lobby, nextgame, game, characters, debug, menu). |
| `server/reports.js` | Hlášení chyb → `reports/` + soukromé repo. `logs/` a `reports/` se nesmí servírovat. |
| `server/version.js` | Otisk kódu → banner „načti znovu". |
| `cards*.json` | Data karet (základ + soubory rozšíření). |

### Klient
| Soubor | Co dělá |
|---|---|
| `game.js` | Phaser scéna, socket handlery, `renderUI()` router, loadery assetů. Postupně se rozkládá. |
| `state.js` | Globální `App` (UI stav). |
| `positions.js` | Layout math (pozice hráčů, karet), `OPPONENT_ANCHORS`. |
| `index.html` | Pořadí `<script>` = pořadí načítání. |
| `net/handlers.js` | Síťové handlery, přehrávání animací, `ANIM_MS`. |
| `view/board.js` | Herní deska (`renderGameBoard`). |
| `view/intro.js` | Intro cinematika. |
| `view/screens.js` | Konec hry, výběr postav, překryvná okna (vlastní hloubka!). |
| `view/menuDom.js` + `menu.css` | Nové HTML menu ([docs/menu-ui-plan.md](docs/menu-ui-plan.md)); `view/menu.js` = staré Phaser menu. |
| `view/gameMenu.js` | Herní menu ☰ a pauza. |

### Čisté helpery (`core/`) — izomorfní, testované, bez Phaseru/DOM
| Soubor | Co rozhoduje |
|---|---|
| `core/distance.js` | Vzdálenost, dostřel, **`hasAbility`** (jediný dotaz „umí X?"), `effectiveCharacter` (jen k zobrazení), `isInPlay`, `canHeal`. |
| `core/layout.js` | Jeviště, profily rozložení, geometrie ruky/stolu/životů. |
| `core/playability.js` | Smí se karta teď zahrát? **Každé pravidlo, na které se ptá server, klient i bot naráz.** |
| `core/pending.js` | `pendingActor` – na koho a na co hra čeká. |
| `core/botPolicy.js` + `core/beliefs.js` | Mozek bota + dedukce rolí. |
| `core/roles.js` | Role, životy, startovní karty, české názvy rolí. |
| `core/winCondition.js` | `evaluateWinner`. |
| `core/cardRules.js` | `getActionForCard`, `isBlueCard`, `isDangerousCard`. |
| `core/highNoon.js`, `core/goldRush.js`, `core/valley.js`, `core/armed.js` | Zrcadla dotazů rozšíření nad prostým stavem (pro klienta a bota). |
| `core/animQueue.js` | Prezentační fronta klienta. |
| `core/*Anim.js` | Časování cinematik – jediný zdroj pro klienta, frontu i držení botů. |
| ostatní (`phaseInfo`, `selection`, `drawCounter`, `botChat`, `gameLog`, `menuModel`, `assetLoad`, `bugReport`) | viz [mapa-souboru.md](docs/pravidla/mapa-souboru.md). |

**`core/` je vzor, kam patří nová čistá logika** — jde testovat v Node bez prohlížeče.

## Konvence (důležité pro bezpečné úpravy)

- **Žádný build step.** Klasické `<script>` tagy sdílí globální scope; pořadí v `index.html` je závazné (závislost musí být načtená dřív). Žádné `import`/`require` v klientském kódu.
- **Izomorfní moduly** (`logic.js`, `core/*`, `logic/*`): na konci `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }` — fungují jako globál v prohlížeči i `require` v Node.
- **Mixin pattern (`logic/*.js`)** — `GameState` je rozdělený do tematických souborů. Každý exportuje objekt metod a připojí ho na `GameState.prototype`:
  - Tělo souboru: `const XMixin = { metoda() {…}, … };` pak `if (module?.exports) module.exports = XMixin; else Object.assign(GameState.prototype, XMixin);`
  - **V prohlížeči** se `<script src="logic/x.js">` načítá **PO `logic.js`** (potřebuje existující `GameState`) a připojí se sám. **V Node** je `logic.js` na konci `require`-uje a `Object.assign`-uje (sekce „Mixiny GameState").
  - Těla metod se přesouvají **byte-přesně** (`}` → `},`, jinak identické). `this` i volání (`gs.metoda()`) zůstávají beze změny.
  - Konstanty/helpery v tělech (`CardType`, `ALL_CHARACTERS`, `rolesForPlayerCount`, `computeDistance`…) jsou **globály** — v Node je `logic.js` vystavuje na `globalThis` přes shimy nahoře, v prohlížeči pocházejí z dříve načtených `<script>`. Nový mixin nic nepotřebuje `require`-ovat.
  - **Pozor: setup/select metody nejsou pokryté testy** (`npm test` staví stav ručně). Po jejich přesunu ověř smoke skriptem (`new GameState(); g.cardData=…; g.setupGame(...)`).
- **Klik → `App.blockInput = true`.** Každý klik, který odesílá herní akci, musí hned zamknout vstup; odemkne ho až příchozí `room_update` (tedy až po dojezdu animace, viz `core/animQueue.js`). **Zvýraznění klikatelných cílů se proto odvozuje i od `!App.blockInput`** (`canTargetThisPlayer`, `isPatDraw`, …) – jinak zůstane svítit starý stav a druhý klik odešle akci znovu (u Rvačky/dělení mezi Vulture Samy dokonce za dalšího hráče v pořadí). Serverovou pojistkou je `server/guard.js`.
- **Na hromádky se sahá jen přes `Deck`.** `deck.discardPile.push(x)` ani `deck.cards.push(x)`
  se psát nesmí – správně je `deck.discard(x)` / `deck.returnToTop(x)`, poslední odhozenou
  kartu dá `deck.discardTop()` a zpátky ji vezme `deck.takeFromDiscard(id)`. Délku dobírané
  hromádky čti přes `deck._drawPile.length`, ne `deck.cards.length`. **Opuštěný důl
  (Fistful) má vlastní dvě cesty** – `drawFromDiscard()` pro fázi 1 a `discardToDrawPile()`
  pro fázi 3 – a volá je výhradně `_mineDrawCard`/`_mineDiscardEndTurn` (logic/fistful.js);
  nikde jinde se na hromádky sahat nesmí. Výjimkou zůstává Pedro Ramirez, jehož zdrojem JE
  odhoz (a pod dolem se mu volba nenabídne).
- **Animace, u které si kartu vybral její MAJITEL, nese `chosen: true`.** Gary Looter,
  Youl Grinner i Flintova vlastní karta letí jako `ragtime_steal`, ale pod Sacagaway se
  u nich NEHRAJE gesto se zamícháním ruky – to platí jen pro NÁHODNOU krádež (FAQ Q17).
  Ptají se na to `fromShuffledHand`/`holdForSacaSteal` (server/anim.js) i klient
  (net/handlers.js). Dvě karty, které si Flint bere, `chosen` nemají.
- **Krádež/odhoz z RUKY nese `stolenIndex`** (slot ve vějíři, odkud karta odešla) – karta se bere náhodně, takže bez něj klient odebírá poslední kartu a u vlastní ruky zmizí viditelně špatná. Platí pro `panic_sequence`, `catbalou_sequence`, `ragtime_steal` (Ragtime/Krytý vůz/dělení mezi Vulture Samy) i `jesse_jones_draw`; z odhozu je karta veřejná, tam si klient slot najde podle ID (`hand_to_discard`).
- **Karta LÍCEM nahoru potřebuje `exactAngle: true`.** `animateCard` bez něj bere `nearestCardAngle`, který 0° a 180° považuje za totéž (symetrie rubu) – u protějšího hráče (180°) tak rotace ani nevznikne a karta dosedne do odhozu **vzhůru nohama**. Platí pro každý let z něčího stolu/ruky do odhozu (`board_to_discard`, `dynamite_explode`, odhoz karet při vyřazení, obě „sequence" karty). `animateCardFlip` používá `nearestAngle360` vždy, tam se to řešit nemusí.
- **Letící karta vzlétá ve velikosti ZDROJE a dosedá ve velikosti CÍLE.** Na desktopu jsou
  všechna měřítka skoro stejná (0.27 / 0.3 / 0.36), takže chybějící `startScale`/`endScale`
  nebylo poznat; na mobilu se rozestoupila (vějíř soupeře 0.155, balíček 0.3, moje ruka
  0.46) a karta bez nich viditelně skočí na startu nebo po dosednutí. Zdroje jsou
  `sideScale(idx)` (stůl), `sideScale(idx, 'hand')` (vějíř) a `pileScale()`
  (balíček/odhoz/hokynářství); `animateDrawToMyHand` si `endScale` bere z profilu sama
  a `startScale` má default `pileScale()` – krádež z cizí ruky/stolu ho proto musí předat.
  Totéž platí pro rozdávání v intru (`_introAnimCard`/`_introAnimCardFlip` mají `startScale`).
- **Render neumím vizuálně ověřit.** Změny v `view/*`, `positions.js`, intro/menu kódu nejde otestovat automaticky — canvas nevidím. Proto:
  - **Byte-přesné přesuny:** při vytahování kódu do nového souboru se těla funkcí kopírují *znak po znaku*; nový je jen hlavička + místo volání. Před přesunem audit volných proměnných (co tělo používá z okolí).
  - **`ctx`-destructuring pattern** pro sub-renderery: `function drawX(ctx) { const { a, b } = ctx; <byte-přesné tělo> }`, voláno `drawX({ a, b })`. Drží tělo identické a vyhýbá se kolizím v globálním scope.
  - Po úpravě render kódu **požádej uživatele o ověření v prohlížeči** (pravidelně to kontroluje).
- **Nové pole ve stavu = zkontroluj redakci.** `GameState` se do `room_update` serializuje celý,
  takže cokoli tajného (role, ruce, pořadí balíčku) musí ořezat `redactState` v `server/rooms.js`.
  Redakci mění dvě karty, obě z Divokého západu: **Sacagaway** (dokud platí, jdou ruce ven
  odkryté) a **Zuřivá Doroty** (`_dorothyReveal` – ruka JEDNOHO hráče, který poručenou kartu
  neměl, a jen na `dorothyRevealMs`). Všechno ostatní se skrývá dál i pod nimi.
- **Odkrytou roli drží `_roleRevealed`, NIKDY `health <= 0`.** Nastaví ho `handlePlayerDeath`
  a jediné, co ho zase shodí, je **přerozdání rolí** (Hřbitov / Helena Zontero – Divoký západ).
  Ptají se jím shodně `redactState` (server/rooms.js) i `computeBeliefs` (core/beliefs.js);
  kdyby kterékoli z nich propustilo i nulu životů, role přerozdaná mezi VYŘAZENÝMI hráči by
  utekla klientovi hned prvním broadcastem po zamíchání – a bot by ji navíc „znal" jako jediný
  u stolu. `computeBeliefs` proto počítá vyřazeného hráče bez odhalené role mezi **neznámé**,
  jinak by se jeho role rozprostřela na živé a rozdělení by nedalo 1.
  Podrobnosti a seznam pastí: [docs/pravidla/sit-a-assety.md](docs/pravidla/sit-a-assety.md).
- **Nový art přidávej rovnou jako `.webp`, nikdy PNG** (`tools/webp.js --quality=70`, marky bezeztrátově).
  V `assets/` žádné PNG nejsou – jedno načtení hry z PNG stálo 42–97 MB bandwidth.
- **Verifikace každého kroku:** `node --check <soubor>`, `npm test`, boot serveru (`node server.js`, port 3000), HTTP 200 na změněné soubory.

## Pravidlo: nejdřív doběhne efekt zahrané karty, teprve pak schopnost

FAQ: **„Musíte počkat na dokončení efektu naposledy zahrané karty, než budete moci použít
speciální schopnost své postavy nebo zahrát další kartu."** Platí to na obě strany:

- **Další kartu** to hlídá samo: `playCard`/`playBang`/`playSpecialCard`/`startDiscardExtra`
  i aktivní schopnosti (Chuck Wengam, José Delgado, Doc Holyday) vyžadují fázi `PLAY`,
  a dokud efekt běží, je fáze `RESPOND`/`SELECTING_TARGET_CARD`/`CHECKING`/…
- **Schopnost postavy** hlídá fronta odložených akcí (`specialActionQueue`). Prakticky se
  to týká **Suzy Lafayette** (prázdná ruka → líznutí): prázdná ruka se posuzuje **až po**
  dokončení efektu, protože jí ten efekt může karty vrátit.

Řeší to **`_pruneSuzyQueue()`** (`logic/characters.js`): před každým odbavením fronty
(i na začátku `_resumeAfterSpecial`) zahodí čekající `SUZY_DRAW`, když už neplatí – hráč
mezitím karty dostal, nebo je mimo hru. Líznutí z Úhybu/Bible (`UHYB_DRAW`) i krádež
(Panika/Ragtime) totiž leží ve frontě PŘED ním, takže se odbaví dřív a Suzy pak prázdnou
ruku nemá. Pokryto testy v `test/characters.test.js` (Úhyb jako poslední karta = **1 karta,
ne 2**; Ragtime zaplacený poslední kartou = jen ukradená karta).

**Kde se naopak nečeká:** schopnost jde PŘED odměnu za banditu (ta se vyhodnocuje až po
postavě → Suzy lízne 1+3) a před krádež **El Gringa** – ten jí sebere právě líznutou kartu
(je to přímo v pravidlech) a ruka se tím vyprázdní znovu, takže si líže podruhé. Stejně tak
si líže hned uprostřed obrany proti Slabovi: efekt jejího Vedle! už doběhl.

`_processSpecialQueue` proto **vrací `true`/`false`** („rozeběhlo se něco?") a
`_resumeAfterSpecial` se řídí tím, ne délkou fronty. Po vyházení neplatného `SUZY_DRAW`
totiž fronta zbyde prázdná – s původní podmínkou „fronta není prázdná" by se hra vrátila
z `_processSpecialQueue` bez obnovení fáze a zůstala viset ve fázi právě dokončené
schopnosti (po Úhybu v `UHYB_DRAW`).

**Stejná past platí i pro volající, kteří se rozhodují „počkat na frontu?"** – pět míst
v `logic/combat.js` (dynamit) a `logic/highNoon.js` (Daltonové, Pravé poledne, odchod
ducha) testovalo `specialActionQueue.length > 0`. Když `_pruneSuzyQueue` frontu vyprázdní,
podmínka projde, ale `_processSpecialQueue` nic nerozeběhne – a záložní cesta se nespustí.
U dynamitu tím zůstala nastavená fáze `DYNAMITE_DAMAGE` s prázdným `pendingDynamiteDamage`,
takže `pendingActor` vrátil `null` a **na dynamit nešlo ani kliknout**. Řešení: **frontu
pročisti (`_pruneSuzyQueue()`) PŘED tím, než se podle její délky rozhoduješ** – po
pročištění je `length > 0` ekvivalentní tomu, co `_processSpecialQueue` vrátí. Padalo to
~1× z 2700 partií botů, tedy jako flaky test.

### Rodina „resume" příznaků: kam se pokračuje, až fronta doběhne

Fronta odložených akcí umí přerušit skoro cokoli, takže si volající musí zapamatovat, kam
se má hra vrátit. Dělá to **pět příznaků čtených v `_resumeAfterSpecial`**
([logic/characters.js](logic/characters.js)) – každý je jedna větev a **žádné dva nesmí
běžet naráz**:

| příznak | pokračuje se do | typický spouštěč |
|---|---|---|
| `_nextTurnAfterQueue` | `nextTurn()` | odchod ducha (Město duchů), smrt uprostřed série |
| `_resumeBeginTurnAfterQueue` | krokovač startu tahu (`_resumeBeginTurn`) | Mrtvý muž, Daltonové, zásah Fistfulu, Pravé poledne, Pokrevní bratři |
| `_startChecksAfterQueue` | kontroly Dynamit/Vězení | výbuch dynamitu (Bart Cassidy si líže za každý život) |
| `_advanceRouletteAfterQueue` | další hráč v kolečku Ruské rulety | odhoz probudil Suzy Lafayette / Molly Stark |
| `_gagResumeAfterQueue` | fáze, kterou pokuta Roubíku přerušila (`_gagResume`) | zásah za promluvení probudil Barta Cassidyho |

**Teren Kill** (Divoký západ) do téhle rodiny nepřidává šestý příznak, ale musí je umět
**zrušit**: když sejmutí padne na pik, vyřazení proběhne až teď – a pokračování, které si
volající naplánoval na dobranou frontu, počítalo s tím, že hráč žije. U hráče na tahu by
tedy dotáčelo start tahu mrtvému, takže `_terenKillResult` `_resumeBeginTurnAfterQueue`
i `_startChecksAfterQueue` shodí a nahradí je posunem tahu (nebo je nechá na
`_autoEndTurnPending`, když ho `handlePlayerDeath` nastavil).

Bez toho, aby líznutí doběhlo **dřív** než pokračování, se schopnost obrátí proti svému
majiteli: Suzy Lafayette by do dalšího kola Ruské rulety nastoupila s prázdnou rukou
a vypadla by jako první.

## Testy

- Runner: **vestavěný `node --test`** (zero deps). Spuštění: `npm test`. Soubory: `test/**/*.test.js`.
- Testuje se **`GameState`, `core/*`** (čistá logika) a **`server/*`** (factory s fake `io` – `test/server.*.test.js`), ne render.
- `test/_helpers.js`: `mkGame`/`mkCard`/`give`/`board`/`topDeck`. **Hru stav build ručně** (ne `setupGame` — míchá; ne `setupDebugGame` — `isDebug=true` vypne vyhodnocení výhry).
- Pravidla pro 3 hráče jsou v `test/threePlayer.test.js`; zátěžové hry jen botů
  (`test/server.bots.test.js`) jedou **3–8 hráčů** ve všech kombinacích rozšíření
  (test „matice rozšíření × 3–8 hráčů") a k tomu varianty „balíček samých X" pro
  každou rizikovou kartu událostí. Zátěž Údolí stínů je ve vlastním souboru
  `test/vos.load.test.js`, aby běžela souběžně (`node --test` pouští soubory paralelně
  a délku sady určuje nejdelší soubor); oba sdílí harness `test/_botHarness.js`
  (`buildCtx`, `pumpToWinner`).
- **Tři strukturální testy hlídají, že se hra jen botů nemůže zaseknout** na chybějícím
  zrcadle – viz „Invariant ‚bot se nikdy nezasekne'" výš. Když přidáváš pravidlo s vlastní
  fází nebo novou akci, spadnou dřív, než na to přijde zátěž.
- `draw()` popuje z **konce** `deck.cards`. Pro deterministický balíček nastav `g.deck.cards` přímo.
- Testy umlčí log: `before(() => { console.log = () => {}; })`.

## Git / commity

- Pracovní větev: **`master`** (hlavní je sice `main`, ale vyvíjí se na `master`).
- Commit messages **česky**, prefixy: `refaktor:`, `testy:`, `úklid:`, `oprava:`.
- Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Probíhající refaktor

game.js se rozkládá podle podsystémů do vlastních souborů (vzor: `view/board.js`):
intro cinematika → `view/intro.js`, menu/lobby/stats → `view/menu.js`, síťové handlery → `net/handlers.js`.
Cíl: game.js = jen bootstrap + scéna + router. Postup vždy byte-přesně, po malých commitech, hra zůstává funkční.

**Menu mimo stůl se přesouvá z Phaseru do HTML** – pokračuj podle [docs/menu-ui-plan.md](docs/menu-ui-plan.md)
(fáze, rozhodnutí, mapa řádků návrhu v `handoff/`). Starý `view/menu.js` nepřepisuj, smaže se na konci.

## Rozšíření Divoký západ (Wild West Show) — hotové

Podrobně (karta po kartě, háky, pasti): **[docs/pravidla/divoky-zapad.md](docs/pravidla/divoky-zapad.md)**.
Plán [docs/wild-west-show-plan.md](docs/wild-west-show-plan.md), pravidla [docs/wild-west-show.md](docs/wild-west-show.md).

Pojistky, na které se narazí i bez hledání:

- **Zdroj pravdy pro chování karty je český text na artu**, ne anglické FAQ.
- Událost neotáčí šerif, ale **kdokoli zahráním Dostavníku/Wells Farga**; na začátku hry žádná neplatí.
- **Dotaz „umí X?" jde vždy přes `hasAbility(p, "Jméno")`**, nikdy rovností jména (Greygory Deck má dvě schopnosti).
- **Lady Růže mění sedadla = indexy do `players`.** Nové pole se sedadlem musí do tabulek `SEAT_KEYS`/`SEAT_LIST_KEYS`/`NOT_SEAT_KEYS` (hlídá strukturální test).
- **Zuřivá Doroty půjčuje `currentPlayerIndex` jen na synchronní zahrání**; co běží dál, nese sedadlo v `pending*`.
- Sacagaway a Doroty jsou jediné výjimky z redakce stavu; přerozdání rolí shazuje `_roleRevealed`.

## Rozšíření Zlatá horečka (Gold Rush) — hotové

Podrobně (měna, obchod, vybavení, postavy, Stínoví pistolníci): **[docs/pravidla/zlata-horecka.md](docs/pravidla/zlata-horecka.md)**.
Plán [docs/zlata-horecka-plan.md](docs/zlata-horecka-plan.md), pravidla [docs/zlata-horecka.md](docs/zlata-horecka.md).

Pojistky:

- **Kolize jmen:** `ZLATA_HORECKA` je karta událostí High Noonu; karty rozšíření se identifikují přes `effect` (`ZH_PODKOVA`…), nikdy jménem. V kódu se jmenují **`gear`**, ne „vybavení" (`CardType.EQUIPMENT` = Hledí a Mustang).
- **Ztráta života má jediný trychtýř `_afterLifeLost`**, valoun za zranění jen `handleDamage`.
- **Platí vybavení? → `_gearOn`** (Laso, Belle Star); `_gearHas` jen pro vlastnictví.
- **Na hromádky vybavení jen přes `_gearDraw`/`_gearDiscard`.**
- **Léčení vždy přes `canHeal(p)`** (stín nesmí získat život).

## Rozšíření Údolí stínů (Valley of Shadows) — hotové

**Hotové je celé rozšíření (fáze F0–F9)**: všech 15 druhů karet i 5 postav má efekt, bot
je umí hrát a rozšíření jde zapnout v menu. Podrobný popis mechanismů (fronta výstřelů,
kolečko voleb, Duch, okno úniku, Henry Block, Obětavý skok), bota, zátěže a rozložení je
v [docs/pravidla/udoli-stinu.md](docs/pravidla/udoli-stinu.md) – **přečti si ho, než na
cokoli z rozšíření sáhneš**. Plán karta po kartě (háky, rozhodnutí R1–R15, co se v které
fázi odchýlilo) je v [docs/udoli-stinu-plan.md](docs/udoli-stinu-plan.md), pravidla obou
vydání v [docs/udoli-stinu.md](docs/udoli-stinu.md).

Pojistky, na které se narazí i bez hledání:

- **Pravidla platí podle plánu a art je NEMĚNÍ** – zásada „zdroj pravdy = text na artu"
  z Divokého západu se na Údolí stínů nevztahuje (rozhodl uživatel).
- **Jména:** v kódu prefix `vos`, nikdy `shadow` (= Stínoví pistolníci) ani `ghost`
  (= duch Města duchů) – karta Duch je `DUCH` / `hasDuchCard`.
- **„Ve hře" ≠ „živý"**: Duch je ve hře s nulou životů i mimo svůj tah. Každé napřímo
  položené `health > 0` / `health <= 0` v logic.js, logic/* a core/* musí být v tabulce
  `LIFE_OK` s důvodem (test/vos.ghost.test.js); „ve hře" se ptá `isInPlay`/`staysInPlay`.
- **Fázi `SELECTING_TARGET_CARD` zakládá jen `_enterTargetSelection`** (okno úniku) a **každý
  nový vstup ke ztrátě života jde přes bránu Obětavého skoku `_vosSaveGate`** – obojí hlídá
  strukturální test.
- **Smrt hráče na tahu mimo fázi PLAY/DRAW dorovnává `_turnOwnerGone`** (logic/combat.js) –
  `handlePlayerDeath` tah v RESPOND neposouvá.

## Rozšíření Ozbrojení a nebezpeční (Armed & Dangerous) — rozpracované (A0–A1 hotové)

Pravidlový podklad je [docs/ozbrojeni-a-nebezpecni.md](docs/ozbrojeni-a-nebezpecni.md)
(texty 28 karet a 8 postav, česká upřesnění Albi, nejasnosti), implementační plán
[docs/ozbrojeni-a-nebezpecni-plan.md](docs/ozbrojeni-a-nebezpecni-plan.md) (žetony nabití,
Nebezpečné karty, fáze A0–A7, rozhodnutí R-U1–R-U4 a R1–R23). **Přečti si plán, než na
rozšíření sáhneš** – žetony se podle rozhodnutí uživatele rozmisťují i platí vždy ručně
a zásoba se počítá, neukládá.

Hotová je fáze **A0 (kostra)**: data `cards.ozbrojeni.json` (id 200–227), postavy 55–62,
mixin `logic/armed.js` (zásoba a tři jediné cesty změny žetonů `_adAdd`/`_adTake`/`_adMove`,
vyložení Nebezpečné karty se 3 žetony, vyčerpání), zrcadlo `core/armed.js` (`adOn`,
`adSupply`, `adArmOk`, `AD_CARDS_READY`), predikáty `isDangerousCard`/`isBrownCard`
(core/cardRules.js – **Nebezpečná zbraň má typ „Zbraň", ale `isBlueCard` ji nebere**),
kostičky na kartách a pyramida zásoby (view/board.js).

Hotová je i fáze **A1 (dobíjení a placení)** a rozšíření jde zapnout v běžné hře (zatím
13 karet, bez postav): fáze `AD_PLACE` (žeton za modrou kartu frontou, za odhoz nad limit,
Nabíjení), platba za vylepšení posílaná s akcí (`adPayOk`/`adUpgradeOk`), použití
Nebezpečných karet `ad_use` (`adUseOk`), Bandalír (`adBandolierExtra` v `bangLimitFree`),
Kolona, Malý doušek. **Zvonice žije v core/distance.js** (`adBellActive`) – distance.js
nesmí require-ovat armed.js. Co se odchýlilo od plánu, je v jeho záhlaví.
