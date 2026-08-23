# CLAUDE.md — mapa kódu pro AI editaci

Webová hra **Bang!** (česká karetní hra). Autoritativní server + tenký Phaser klient přes Socket.IO.

## Architektura v jedné větě

Veškerá **pravidla** běží na serveru (`logic.js` třída `GameState`). Klient (`game.js` + `view/*`) jen **renderuje stav** a posílá akce; server odpoví novým stavem, klient překreslí.

```
prohlížeč (Phaser)  ──socket akce──►  server.js  ──►  logic.js (GameState = pravidla)
      ▲                                                      │
      └───────────  room_update (nový stav)  ◄──────────────┘
```

## Mapa souborů

### Server (Node)
| Soubor | Co dělá |
|---|---|
| `logic.js` | **Rules engine – assembler (~200 ř.).** Kostra třídy `GameState`: konstruktor, tok tahu (`getCurrentPlayer`, `nextTurn`, `discardCard`, `openStore`, `pickFromStore`, `tryEndTurn`), `getDistance`/`canHit` (delegují do `core/distance`), `checkWinCondition`, `_trackCard`. Nahoře shimy globálů (Node), dole `Object.assign(GameState.prototype, …mixiny)`. Zbytek metod je v `logic/*` (viz níže). **Izomorfní**, re-exportuje entity, pokrytý 149 testy. |
| `logic/entities.js` | Datové/hodnotové třídy: `Card`/`Player`/`Deck` + konstanty `CardType`/`Suits`/`ALL_CHARACTERS`. Bez vazby na `GameState`. Izomorfní (globály v prohlížeči, `require` z logic.js v Node). Re-exportováno z logic.js, takže testy/server importují dál z `logic.js`. **`Deck` je jediná cesta na obě hromádky** – `draw`/`discard`/`returnToTop`/`discardTop`/`takeFromDiscard` nad getery `_drawPile`/`_discardPile`, které při `mineMode` (Opuštěný důl, viz níže) role hromádek prohodí. |
| `logic/setup.js` | **Mixin GameState.** Setup hry a další hry, výběr postav, debug rozdávání: `setupGame`, `setupDebugGame`, `selectCharacter`, `autoSelectAllCharacters`, `startFirstTurn`, `setupNextGame`, `selectCharacterForNextGame`, `rejectCharacterForNextGame`, `_checkNextGameAllChosen`, `debugGiveCard`, `debugRemoveCard`. Připojeno na `GameState.prototype` (viz „Mixin pattern"). |
| `logic/draw.js` | **Mixin GameState.** Fáze lízání: `startDrawPhase`, `_getDrawOptions`, `drawCard`, `_finishDraw` + postavy Kit Carlson (`startKitCarlsonDraw`, `kitCarlsonPick`) a Black Jack (`resolveBlackJack`). `startDrawPhase` je i bodem, kde si **Vera Custer** volí kopírovanou postavu (těsně před lízáním, tedy až PO checku na Dynamit/Vězení) a kde předchozí kopie vyprší – platí přesně jedno kolo. **Kit Carlson odkrývá VŽDY `KIT_REVEAL` = 3 karty**; události High Noon mění jen to, kolik si jich nechá (Žízeň 1, jinak 2) a Příjezd vlaku vůbec ne – kartu navíc si po výběru lízne klasicky z balíčku (`kitExtra` → nová `drawPhaseState`). U **Black Jacka** platí totéž pořadí: karta za Příjezd vlaku se líže úplně nakonec, takže `resolveBlackJack` po ČERNÉ druhé kartě nekončí fázi, dokud `cardsDrawn < cardsNeeded`. |
| `logic/play.js` | **Mixin GameState.** Hraní karet: `playCard` (router efektů), `playBang`, `playSpecialCard` (Vězení/Cat Balou/Panika/Duel/Kulomet/Indiáni), `playBoardCard` (modré i zelené na stůl), `triggerBarrelDraw`, `startBarrelCheck`, `resolveCardSelection`, `_advanceMassAttack`, `waitForMissed`. |
| `logic/combat.js` | **Mixin GameState.** Zranění a smrt: `handleDamage`, `handlePlayerDeath` (Vulture Sam, kill reward, šerif×pomocník), `sidSaveDiscard`, `takeDynamiteHit`. **Výbuch dynamitu nejde přes `handleDamage`** (klikají se 3 zásahy po jednom a není útočník, takže by se spustil El Gringo), proto si líznutí **Barta Cassidyho za každý ztracený život** zařazuje do fronty sám. Po posledním zásahu se fronta musí dobrat PŘED kontrolou Vězení a fází lízání – zařídí to `_startChecksAfterQueue` (větev v `_resumeAfterSpecial`). |
| `logic/response.js` | **Mixin GameState.** Fáze RESPOND: `handleResponse` (Vedle!/Bang!, duel, hromadné útoky), záchrana posledního života `beerLastLifeSave`/`sidLastLifeSave`, `_advanceAfterLastLifeSave`. |
| `logic/characters.js` | **Mixin GameState.** Schopnosti postav + fronta odložených akcí: `_processSpecialQueue`/`_resumeAfterSpecial`, `checkSuzyLafayette`/`suzyLafayetteDraw`, `bartCassidyDraw`, `elGringoSteal`, `sidKetchumDiscardOne`/`useSidKetchum`, `startLuckyDukeCheck`/`luckyDukePick` + **dělení karet mezi víc Vulture Samů** (`_nextVultureSplitPick`/`_advanceVultureSplit`/`_finishVultureSplit`, viz níže) a **pravidlo „nejdřív doběhne efekt zahrané karty"** (`_pruneSuzyQueue`, viz níže). |
| `logic/checks.js` | **Mixin GameState.** Kontrolní líznutí na začátku tahu (Dynamit/Vězení) a vyhodnocení checků: `handleStartOfTurnChecks`, `triggerCheckDraw`, `_applyCheckResult` (Dynamit/Vězení/Barel/Jourdonnais), `resolveCheck`. |
| `logic/highNoon.js` | **Mixin GameState.** Rozšíření **High Noon** (balíček událostí): `_setupEventDeck` (Pravé poledne vespod), `hasEvent`, krokovaný start tahu `_beginTurn`/`_resumeBeginTurn`/`_runBeginTurn` (odkrytí události → její okamžitý efekt → Pravé poledne), `_flipEvent` (jen šerif, až od 2. tahu; nastaví `_pendingHighNoonReveal` pro animaci), `takeNoonHit`, **Daltonové** (`_startDaltons`/`_advanceDaltons`/`_resumeDaltons`/`_daltonsBlueCount`, viz níže) a sdílené dotazy pravidel `_bangLimit`/`_bangBlocked`/`_beerBlocked`/`_turnStep`/**`_effSuit`**. `_turnStep()` = krok pro `nextTurn` (Zlatá horečka jede proti směru, tj. `players.length - 1`); **jediné místo, kde se směr obrací** – posun dynamitu, hokynářství, hromadné útoky, Rvačka i samotní Daltonové zůstávají po směru (FAQ H3). **Kocovina** nemá vlastní metodu: `_applyEventOnEnter` při KAŽDÉ výměně události přepíše všem hráčům `p._noAbility`, což čte `effectiveCharacter` (core/distance.js). `_effSuit(card)` je **jediný zdroj pravdy pro barvu karty** – Požehnání dělá ze všeho srdce, Prokletí piky (hodnota se nemění). Ptají se přes něj checks (Dynamit/Vězení/Barel), Black Jack, Apache Kid a Doc Holyday; nikde jinde se `card.suit` číst nesmí – **jedinou výjimkou je Peyote** (A Fistful of Cards): tip na barvu se schválně vyhodnocuje proti VYTIŠTĚNÉ barvě, jinak by pod Požehnáním/Prokletím každý tip sedl a hráč by si lízl celý balíček (`peyoteGuess` v logic/fistful.js a jeho zrcadlo ve větvi `PEYOTE` v core/botPolicy.js). **Město duchů**: `_teardownGhost()` (konec tahu ducha – volá ho `nextTurn` jako první krok, viz níže). **Přibalené karty** (`options.highNoonExtra`): `_dealSecondIdentities`/`_newIdentityOffer`/`resolveNewIdentity` (Nová identita) a `_startHandcuffs`/`chooseHandcuffsSuit`/`_suitBlocked` (Želízka). |
| `server.js` | **Socket.IO bootstrap (~76 ř.).** Express/io setup → poskládá sdílený `ctx` (`require('./server/*')(ctx)` v pořadí rooms→gamelog→ledger→guard→intro→anim→lifecycle→bots) → `io.on('connection')` jen definuje per-connection `withRoom` a zavolá `register*Handlers(socket, ctx, withRoom)` → `server.listen`. Veškerá logika je v `server/*`. |
| `server/rooms.js` | Factory `installRoomService(ctx)` – vlastní `rooms` Map + roomCounter, vystaví na `ctx`: `makeRoom`, `roomPayload`, `broadcastRoom(+Delayed)`, `broadcastLobbyList`, `getLobbyList`, `getGameList`, `findRoomBySocket`, `leaveRoom`, `leaveSpectate`, `disbandRoom`, **`closeRoom`/`roomAlive`**. Bez listenu → testovatelné s fake io (`test/server.rooms.test.js`). **Rozpuštění místnosti = `closeRoom(room)`, nikdy holé `rooms.delete`**: intro sekvence (`server/intro.js`), odložený broadcast, tick botů, čekání na assety i odpočet navazující hry jsou naplánované timeouty držící referenci na `room` – po pouhém smazání z registru emitovaly dál a hráč, který je zpátky v menu, se z něj překlopil zpátky do zrušené hry („jsem v ní a zároveň nejsem", tlačítko ✕ Ukončit hru). `closeRoom` je všechny zruší a označí místnost za mrtvou; `broadcastRoom(+Delayed)`, `emitIntro*` (intro.js) i `emitAnim*` (anim.js) se pak ptají přes `roomAlive(room)`. **Divák je jen v socket.io kanálu `<roomId>_spectators`, ne v `room.players`** – `findRoomBySocket`/`leaveRoom` ho tedy nevidí a odhlásit ho umí jen `leaveSpectate(socket)` (volá se z `leave_spectate`, `go_to_menu`, `spectate`, `create_room`/`join_room`/`rejoin`/`create_bot_game`). Bez odhlášení mu chodí dál `room_update`/`card_animation`/`intro_phase` a klient ho z menu překlopí zpátky do hry. |
| `server/intro.js` | Factory `installIntroService(ctx)` (bere `io`, `broadcastRoom`) – serverová intro sekvence přes timeouty: `emitIntro`/`emitIntroRole`/`emitIntroChars`, `runIntroSequence`, `introAfterRoles`, `introStartCharPhase`, `introStartDeckPhase`. **Navazující hra** má vlastní vstup `runNextGameIntro` + `introKeepResult` (viz „Intro navazující hry“ níže). **High Noon** má v deck fázi tři beaty v řadě: `highnoon_top` (z kompletního balíčku vyletí vrchní karta a ukáže se – Pravé poledne, ve velikosti balíčků) → `shuffle_highnoon` (zamíchá se zbytek) → `highnoon_bottom` (odložená karta sjede pod hromádku). Test: `test/server.intro.test.js`. |
| `server/anim.js` | Factory `installAnimService(ctx)` (bere `io`, `broadcastRoomDelayed`) – `emitAnim`, `emitDeathAnim` (Vulture Sam vs odhoz), `handleAutoEndTurn`, `handleReshuffleAndBroadcast`, `storeCinematicMs` (časování cinematiky hokynářství = zvednutí + rozdání + míchání; zrcadlí `game.js`, používá ho bot settle i čekání na dojezd míchání). Test: `test/server.lifecycle.test.js`. |
| `server/lifecycle.js` | Factory `installLifecycle(ctx)` (bere `cardData`, `GameState`, `broadcastRoom`, `broadcastLobbyList`, `emitIntro`, `runIntroSequence`) – `startGame`, `startNextGame` (rotující šerif, přenos postav+životů přeživších, spuštění `runNextGameIntro`). Intro přeskakuje jen debug/singleChar/botGame. Test: `test/server.lifecycle.test.js`. |
| `server/gamelog.js` | Factory `installGameLog(ctx)` – **strukturovaný herní log** (JSONL soubor na hru v `logs/<roomId>_<ts>.jsonl` + stručný konzolový mirror). Vystaví `ctx.glog`: `openGame`/`closeGame`, `action` (ingress hráče/bota), `rule` (událost pravidel z `gs._onEvent`), `snapshot` (egress stavu v `broadcastRoom`, dedup), `system`/`error`/`clientLog`. Instaluje se v `server.js` **první** (rooms nastaví no-op fallback `ctx.glog`, gamelog ho přepíše reálným). Nahradil VŠECH ~86 ad-hoc `console.*`. Rules-level události chodí přes injektovaný sink `gs._onEvent` (funkce → JSON.stringify ji zahodí, neuniká do klienta); nastaví lifecycle/debug PŘED setupem. Formát/snapshot řeší izomorfní `core/gameLog.js`. Test: `test/gamelog.test.js`. **Když uživatel hlásí chybu, přečti nejnovější `logs/*.jsonl`.** |
| `server/guard.js` | Factory `installActionGuard(ctx)` – **autorizace herních akcí na hráče**. Vystaví `ctx.guardedOn(socket)` = náhrada za `socket.on` pro `handlers.game.js`/`handlers.characters.js`. Handlery čtou aktéra ze STAVU, ne z odesílatele, takže bez guardu posunul hru každý příchozí event (na pomalé lince dvojklik na „Ukončit tah" přeskočil několik hráčů, opožděný klik vybral kartu za jiného hráče). Guard porovná seat odesílatele s `pendingActor(gs)` (core/pending.js); nesedící akci zahodí, zaloguje (`glog.reject`) a pošle `action_rejected` (klient si odemkne UI). Výjimky: akce mimo pořadí (Sid Ketchum) se kontrolují jen na „hraje za sebe"; debug hra (jeden socket = všechna místa) se přeskakuje; `pendingActor === null` propouští. Navíc `select_target_card` nese `targetIdx` (pro KOHO se vybírá) – u Rvačky/dělení mezi Vulture Samy zůstává aktér stejný a mění se jen cíl, takže opožděný klik by jinak vybral kartu dalšímu hráči. Test: `test/server.guard.test.js`. |
| `server/ledger.js` | Factory `installLedger(ctx)` – **veřejný ledger chování** (`room.behaviorLedger`): kdo na koho útočil / koho léčil. `recordBehavior`/`initLedger`. Handlery (`play_bang`/`play_special`/`doc_holyday`/`activate_green_card`/`discard_extra_choose`) ho plní; bot z něj přes `core/beliefs.js` dedukuje skryté role. Mimo broadcastovaný `gameState`. Reset při startu hry (lifecycle). Test: `test/server.ledger.test.js`. |
| `server/bots.js` | **Počítačoví hráči.** Factory `installBotService(ctx)` – bot = bezhlavý klient přes „fake socket" se stejnými handlery jako člověk (`register*Handlers`). Driver `runBotTickOnce`/`scheduleBotTick` po každém broadcastu (hook `ctx.afterBroadcast` v rooms.js) i intro emitu (`ctx.afterIntroEmit` v intro.js) zjistí přes `pendingActor`, zda se čeká na bota, spočítá `beliefs` (z `room.behaviorLedger`) + akci `decideBotAction` a vystřelí ji handlerem (1:1 reuse animací). `createBot`/`removeBot`, stall guard. **Intro gate:** během intra (`room._introPlaying`, nastaví lifecycle, sundá intro.js na `'done'`) bot herní akce (líznutí/karty) NEDĚLÁ – jen výběr postav; po startu hry navíc `room._botStartupSettle` dá první herní akci delší pauzu (`startupSettleMs`), ať hráč vidí, co bot zahraje. Test: `test/server.bots.test.js` (vč. zátěže „hra jen botů doběhne"). |
| `server/version.js` | Factory `installVersion(ctx)` – **otisk nasazeného kódu** (`ctx.buildId` = sha1 obsahu `*.js/json/html/css` v kořeni + `core/logic/view/net/server`, bez assetů a lockfile). Server ho pošle každému socketu hned po připojení (`server_version`); klient si první hodnotu zapamatuje a po reconnectu porovná – změna = na server se nahrála nová verze → banner „načti stránku znovu" (`showUpdateBanner` ve `view/menu.js`). Otisk je z obsahu, ne z času startu, takže restart/pád beze změny kódu hlášku nevyvolá. Test: `test/server.version.test.js`. |
| `server/handlers.*.js` | Socket handlery podle subsystému: `register*Handlers(socket, ctx, withRoom)`, těla berou helpery z `ctx`. **lobby** (místnosti/spectate/chat/disconnect + `add_bot`/`remove_bot`/`create_bot_game` = hra jen botů ke sledování), **nextgame** (výběr postav/intro OK/další hra), **game** (herní akce + Kit/Lucky/Barel/Sid/dynamit/pivo/store), **characters** (Bart/El Gringo/Suzy/checky/Black Jack), **debug** (debug_*; výběr postav v debug hře MUSÍ končit `_beginTurn()` jako `logic/setup.js` – jinak se nezapočítá první tah a události High Noon/Fistfulu se odkryjí až o kolo později). Eventy: `test/server.handlers.test.js`; integrace: `test/server.integration.test.js`. |
| `cards.json` | Data všech karet (jména, typy, hodnoty). Načítá server i testy. |

### Klient — jádro
| Soubor | Co dělá |
|---|---|
| `game.js` | Klientský bootstrap: Phaser scéna (`preload`/`create`/`update`), `socket.on` handlery, `renderUI()` router, intro animace, menu/lobby. **Velký — postupně se rozkládá do `view/`** (viz Konvence). |
| `state.js` | Globální `App` objekt — sdílený UI stav klienta (menuScreen, lobbyList, chat, intro flagy…). Žádná logika. |
| `positions.js` | **Čistý layout math:** pozice hráčů, karet v ruce, karet na stole. `OPPONENT_ANCHORS` = jediný zdroj kotevních bodů soupeřů (**1–7 soupeřů, tedy 2–8 hráčů**; klíč = počet soupeřů, pořadí = po směru od mého levého ramene). |
| `index.html` | Pořadí `<script>` tagů = pořadí načítání (žádný bundler!). |
| `chat.js` | Chat overlay. |

### Klient — render vrstva (`view/`)
| Soubor | Co dělá |
|---|---|
| `view/board.js` | **Herní deska.** `renderGameBoard()` orchestrátor → `drawOpponents` / `drawMyArea` / `drawSpectatorPlayer` / `drawPhaseOverlays` / `drawDrawPiles`. |
| `view/intro.js` | **Intro cinematika.** Míchání/rozdávání (`_animateIntroShuffle`, `renderIntroScene`, `_renderRoleReveal`, `_renderIntroCharSelect`), pozice bloku soupeře `_introOppSlots` (sdílí i slide-in v `net/handlers.js`) a **navazující hra**: `_introPlaceSurvivors`, `_startKeepReveal`/`_renderKeepChoice`/`_confirmKeepChoice`, `_introKeepAnimateOther`, `_introSheriffReveal`. |
| `view/screens.js` | `renderWinnerScreen()` + `renderCharacterSelectScreen()` + překryvná okna přes desku: `renderVeraCopyOverlay()` (Vera Custer), `renderHandcuffsOverlay()` (Želízka – volba barvy) a `renderNewIdentityOverlay()` (Nová identita – ANO/NE). Volá je `renderUI()` v game.js podle fáze. |

### Čisté helpery (`core/`) — BEZ Phaseru/DOM, izomorfní, testované
| Soubor | Export | Co rozhoduje |
|---|---|---|
| `core/distance.js` | `computeDistance`, `computeCanHit`, **`effectiveCharacter`**, **`isInPlay`** | vzdálenost a dostřel + **která schopnost hráči právě platí** a **kdo je vůbec ve hře**. `effectiveCharacter(p)` je jediný trychtýř všech ~45 kontrol „character === X" (v `logic/*` i v klientských zrcadlech): vrací `null` při Kocovině (`p._noAbility`), jinak `p._copiedCharacter || p.character`. Max. životy (`healthForCharacter`) a portrét čtou `p.character` napřímo, takže se Kocovinou nemění. `isInPlay(p)` = `health > 0 || p._ghost` – duch (Město duchů) má 0 životů, ale na svůj tah sedí zase v kole (vzdálenost, hokynářství, hromadné útoky, Vulture Sam). Prosté `health > 0` zůstává tam, kde jde o skutečný život (léčení, Greg Digger, poslední život). Ptá se jím i klient, komu ještě probliká portrét (`registerVeraPortrait` – vyřazená Vera Custer už nekopíruje, zůstane Vera; duch probliká dál). Problikávající portrét si přitom drží obarvení, které měl (`baseTint` v `_tickVeraPortraits`) – hráč na tahu je zelený i ve chvíli, kdy je na jeho místě vidět kopírovaná postava. |
| `core/layout.js` | `computeStage`, `stageCoverSize`, `LAYOUT_PROFILES`, `getLayout`, **`currentLayout`**, `pickLayoutProfile`, **`resolveLayout`**, `stretchAnchors`, `boardRowLimit`, **`myHandRow`/`myHandSlotX`**, **`compactMetrics`/`compactAnchors`/`compactBoardPos`/`compactHandPos`**, **`oppScale`/`handCardScale`**, **`boardBand`/`boardSlot`** | **jeviště + profil rozložení**. `computeStage(vw,vh)` = velikost plátna v design px podle SKUTEČNÉHO poměru stran: základ 1920×1080 zůstává souřadnicovou soustavou, ale plátno se natáhne do poměru displeje (strop 2560×1440) a kamera se posune o půlku přírůstku (`applyStage` v game.js), takže se souřadnicemi 0…1920/0…1080 se nehne – jen po stranách přibude plocha (`stageLeft/Right/Top/Bottom`). Zaokrouhluje se dolů, takže **měřítko obsahu zůstává identické**; mizí jen mrtvé pruhy (telefon na šířku ~18 % šířky, okno prohlížeče na PC taky). Pozadí a všechny celoobrazovkové překryvy se proto kreslí na `stageW()/stageH()` (resp. `stageCoverSize()`) a nálety „zpoza okraje" startují za okrajem JEVIŠTĚ. `currentLayout()` = profil rozložení desky (`App.layout`, mimo prohlížeč vždy desktopový) – jediný zdroj geometrie pro `view/board.js` i `positions.js`, které se dřív musely shodovat ručně. **`resolveLayout(profil, jeviště)`** (volá `applyStage`, výsledek jde do `App.layout`) dopočítá to, co se má **lepit na okraj**: konec mé ruky (`handEndX = stage.right − handEndMargin`) a počet vyložených karet v jedné řadě mého stolu (`boardRowLimit` – rostou doleva od karty role, takže je omezuje levý okraj). `stretchAnchors` totéž dělá s kotvami soupeřů (volá ji `getOpponentAnchors`): krajní zůstanou `oppEdgeMargin` od okraje JEVIŠTĚ, prostřední se mezi ně rovnoměrně rozestoupí, střed zůstává středem. **Na 16:9 jsou obě identita** (`resolveLayout` vrací týž objekt), takže PC ve fullscreenu je pixelově dnešní stav. Rohové ovládání (Zpět, ⚙ DEBUG, Ukončit hru, debug sloupec) a prahy „která je to strana" v `view/intro.js` se proto kotví přes `stageLeft/Right/Top/Bottom`, ne přes 0/1920. **`myHandRow(L, počet)`** = začátek a rozteč MOJÍ ruky ve vodorovném pásu `handStartX…handEndX` (to jsou STŘEDY krajních slotů) – jediný zdroj pro `drawMyArea`, `positions.js` i intro. `handAlign` řídí zarovnání: desktop `'left'` (dnešní stav), mobil `'center'`, protože pás jde přes celou šířku jeviště a pár karet by se krčilo v rohu. **Mobilní profil (`oppMode: 'compact'`) navíc nese kompaktní řadu soupeřů** – viz „Kompaktní soupeři" níže. **`boardBand`/`boardSlot`** = pás vyložených karet s pevným počtem slotů (viz „Pás vyložených karet" níže). **`oppScale(L, n)` závisí na POČTU soupeřů i v okruhu** (`oppScaleByCount`): při 7 soupeřích (8 hráčů) stojí nahoře tři skupiny vedle sebe, takže se karty zmenší z 0,27 na 0,25. Ptát se proto vždy přes `oppScale`, nikdy na `L.scaleOpp` napřímo – platí to i pro `positions.js`. |
| `core/cardRules.js` | `getActionForCard`, **`isBlueCard`** | jakou akci spustit po výběru karty + **co je modrá karta**. `isBlueCard` je jediný zdroj pravdy pro schopnost Josého Delgada (server `logic/characters.js`, klient `view/board.js`, bot `core/botPolicy.js`) – **Vězení a Dynamit jsou modré** (Vězení se jen vykládá před soupeře), zelené karty Dodge City mají vlastní typy + `green: true`, takže sem nespadají. |
| `core/phaseInfo.js` | `isResponseTurn`, `isPlayTurn`, `canActOnHand` | čí je tah / co smí hráč |
| `core/pending.js` | `pendingActor`, `waitingStatus`, `describePendingResponse` | **na koho a na jaké rozhodnutí hra čeká** (jedna větev na fázi). Jediný zdroj pravdy pro UI štítek, bota (`botPolicy`), log i serverový guard (`server/guard.js`). Vrátí `null` u přechodných fází – kdo to používá jako autoritu, musí `null` ošetřit. |
| `core/playability.js` | `cardPlayability` | smí se karta teď zahrát? |
| `core/selection.js` | `decideCardClick` | reducer kliknutí na kartu → „intent" (bez vedlejších efektů) |
| `core/roles.js` | `rolesForPlayerCount`, `healthForCharacter`, `baseHealthForCharacter`, **`roleNameCz`/`ROLE_CZ`**, **`TARGET_3P`/`isThreePlayerMode`**, **`firstPlayerIndex`** | rozdělení rolí (**3–8 hráčů**), startovní životy a **český název role** – role se v kódu i ve stavu jmenují anglicky, hráč je ale nikde nesmí vidět anglicky (debug, statistiky, výběr postavy). **`firstPlayerIndex(players)`** = kdo je na „šerifově pozici" (začíná hru, od něj jdou po směru efekty karet, na jeho tah se odkrývá karta High Noon) – šerif, a ve hře pro 3 pomocník. `TARGET_3P`/`isThreePlayerMode` viz „Hra pro 3 hráče" níže. |
| `core/winCondition.js` | `evaluateWinner(players, opts)`, `evaluateWinner3p` | kdo vyhrál z pole hráčů (nebo null). Za živého se počítá i duch (`_ghost`, Město duchů) – FAQ H7. `opts = { mode3p, winClaimIdx }` přepne na pravidla pro 3 hráče (viz níže). Odpadlík vyhrává jen jako JEDINÝ žijící, takže **při 8 hráčích (dva odpadlíci) dá mrtvý šerif proti dvěma živým odpadlíkům výhru banditům** – přesně jak pravidlo pro 8 říká. |
| `core/botPolicy.js` | `pendingActor`, `decideBotAction(state, i, beliefs)` | „mozek" bota: na koho hra čeká + jednu akci bota. **Nezná cizí role** – cílí přes `beliefs` (dedukce z chování), takže nestřílí na pravděpodobné spojence. Umí zahrát **všechny karty** (dynamit, zelené DC + jejich aktivace, „odhoď další kartu", aktivní schopnosti Chuck/José/Doc). Znovupoužívá `cardPlayability`/`computeCanHit`/`getActionForCard`. **Karty na stole má obodované (`boardCardValue`) podle toho, jestli MAJITELI pomáhají, nebo škodí**: Vězení/Dynamit nepříteli nesundá (pomohl by mu – proto si ani nezahodí vlastní Vězení Cat Balouem hned po zahrání), spojenci je Rvačkou naopak sundá přednostně; `_hasWorthTaking` takové „hodnoty" nepočítá, takže se na ně ani necílí. Zbraně: max **jedna za tah** (`weapon._playedTurn === turnId`), z ruky ta nejlepší podle `weaponValue` (Volcanic = 2.5, ne dostřel 1). Ponechání postavy do navazující hry je náhodné (`decideKeepCharacter`, šance dle `CHAR_RANK`). **Nouzové cílení (`rankEnemies`):** když práh `ENEMY_EPS` nepřekročí NIKDO, propustí se i záporná nepřátelskost (pořadí zůstává „od nejpravděpodobnějšího nepřítele"), jen s podmínkou `enemyProbability >= DESPERATE_ENEMY_P`. Bez toho se koncovka „šerif + pomocníci vs. odpadlík" zasekne: nepřítelem je každý jen z 1/3, takže by strana šerifa nikdy nezaútočila a boti by jen lízali a odhazovali. Jistý spojenec (šance 0) zůstává nedotknutelný vždy. |
| `core/beliefs.js` | `computeBeliefs`, `expectedHostility`, **`enemyProbability`**, `roleHostility`, `estimateOutlawsAlive` | dedukce skrytých rolí z VEŘEJNÝCH informací (počty rolí, veřejný šerif, mrtví) + ledgeru chování; „očekávaná nepřátelskost" pro cílení (jistý spojenec ≤0, ořez -100 proti paralýze z nejistoty). `enemyProbability` = neváženě „jaká je šance, že je to nepřítel" – pojistka nouzového cílení (viz `rankEnemies`), aby se ani v koncovce nesáhlo na JISTÉHO spojence. |
| `core/assetLoad.js` | `shouldRetryAsset`, `isPermanentlyMissing`, `retryAssetUrl`, `missingAssets` | **opakované načtení assetů**: co má smysl zkusit znovu (výpadek spojení / 5xx ano, 4xx ne) a co ještě chybí, než se hra smí sestavit. Používá `preload`/`create` v game.js (registr `AssetLoads`, `ensureAssetsLoaded`) – bez toho Phaser chybný soubor jen přeskočí a hra jede se zelenými placeholdery až do F5. |
| `core/animQueue.js` | `createAnimQueue` | **prezentační fronta klienta**: `card_animation` a `room_update` se nepřehrávají hned při doručení, ale jdou frontou – animace za sebou, stav se aplikuje až doběhne to, co mu předcházelo. Bez ní se na pomalé lince oba eventy slijí a karta „už je v odhozu", zatímco ještě letí. Pořadí = pořadí příjmu (Socket.IO doručuje eventy jednoho socketu v pořadí odeslání), nic se nečísluje. Zaostávání se nekumuluje: víc než jedna čekající animace přes `maxLagMs` → čekající animace se zahodí a dojede poslední stav (plný snímek). Instance + tabulka trvání `ANIM_MS` je v `net/handlers.js`; **při změně `duration` animace srovnej i `ANIM_MS`**. Dokud fronta něco drží (`animQueueBusy()`), letící sprite se nevzdá držení na cíli (`holdThenFinish` v game.js) – jinak by dlouhá cinematika zařazená mezi let a jeho stav (vězení do odhozu → odkrytí karty High Noon) nechala sprite zaniknout dřív, než stav dorazí, a karta by problikla zpátky na původní místo. |
| `core/deathAnim.js` | `DEATH_ANIM`, `deathAnimTimeline`, `deathSequenceMs`, `deathFallMs`, `deathRevealMs`, `penaltyDiscardMs` | **časování cinematiky vyřazení hráče** (pokles na 0 životů → pauza → karty odlétají po jedné → postava se posune vedle místa role → rubová karta role letí doprostřed, překlopí se, vydrží a odletí na místo). Jediný zdroj pravdy: klient ji přehrává (`net/handlers.js` `playDeathSequence`, fáze drží `App.deathSeq`/`App.deathHandHide`, board.js podle nich kreslí), server o stejnou dobu drží boty (`room._deathBlockUntil` v `server/anim.js`, respektuje `scheduleBotTick`). Stav se do konce sekvence nepustí – animace jde frontou jako `essential` (nezahoditelná). **Varianty:** `skipReveal` (šerif roli neodhaluje – zná ji celý stůl, sekvence končí odhozením karet); `deathFallMs`+`deathRevealMs` = sekvence rozpůlená dělením karet mezi víc Vulture Samů; `penaltyDiscardMs` = šerifova ztráta karet za zabití pomocníka (stejné odhazování, ale bez poklesu životů, bez role a Colt .45 zůstává). |
| `core/drawCounter.js` | `nextDrawCounters` | **počítadlo naklikaných, ještě nepotvrzených líznutí** (`App.pendingDrawCount`/`lastConfirmedDrawn`/`lastDrawOwner`). Drží dva rychlé kliky na balíček a zároveň brání kliku navíc. Klíčové je, že počítadlo patří JEDNÉ fázi lízání: při změně vlastníka (řetěz kill-rewardů, DRAW → DRAW jiného hráče) se nuluje – jinak vyjde „zbývá ≤ 0", balíček nejde rozkliknout a hra uvázne. |
| `core/gameLog.js` | `snapshotState`, `formatEvent`, `LogEvent` | čistý formát strukturovaného herního logu: `snapshotState(gs)` = kompaktní stav (role/ruce/board/HP/phase/pendingActor), `formatEvent(evt)` = jednořádkový český popis pro konzoli. Persistenci do souboru řeší `server/gamelog.js`; není v index.html (server-only). |
| `core/highNoon.js` | `eventActive`, `bangLimitFor`, `bangBlockedFor`, `beerBlockedFor`, `effSuit`, `suitBlockedFor` | **zrcadlo dotazů na aktivní událost High Noon nad prostým JSON stavem** – server se ptá přes `GameState.hasEvent`/`_effSuit`, klient (`core/playability.js`, `view/*`) a bot (`core/botPolicy.js`) přes tenhle helper. `effSuit(state, card)` = barva, která PLATÍ (Požehnání srdce / Prokletí piky). `suitBlockedFor(state, i, card)` zrcadlí Želízka (`GameState._suitBlocked`). |
| `core/highNoonAnim.js` | `HN_ANIM`, `hnRevealMs`, `NI_ANIM`, `niResultMs` | **časování odkrytí karty události High Noon** + dojezdu Nové identity (`niResultMs(take)`; drží ho `room._niBlockUntil` a fronta animací) (pauza `preMs` → let z balíčku doprostřed → výdrž na rubu → překlopení → výdrž lícem → zmenšení na místo platné karty). Jediný zdroj pravdy: klient ji přehrává (`net/handlers.js` `high_noon_reveal`), server o stejnou dobu drží boty (`room._hnBlockUntil`) a fronta si podle `hnRevealMs()` spočítá zdržení stavu. Animace nese i `playerIdx` (šerif je na tahu už během odkrývání – stav dorazí až po ní) a `remaining` (balíček ubývá se startem letu → `App.hnDeckLeft`, ne až se stavem; jinak by u poslední karty zůstal ležet prázdný rub). |
| `core/shuffleAnim.js` | `SHUFFLE_ANIM`, `shuffleLayers`, **`shuffleCutHalf`/`shuffleRiffleOrder`**, `shufflePerCard`, `shuffleSettleMs`, `shuffleDurationMs` | **časování riffle míchání balíčku** (klid → horní polovina se jako celek oddělí stranou → riffle, kdy karty střídavě zleva/zprava padají doprostřed a hromádka se skládá ODSPODU NAHORU → doznění). Jediný zdroj pravdy: klient ji přehrává (`view/intro.js` `_animateIntroShuffle` pro všechny čtyři balíčky intra, `game.js` `playReshuffleCinematic` pro domíchání ve hře), server podle STEJNÉHO vzorce odkládá další beat intra (`server/intro.js`, `shuffleDurationMs(n) + SHUFFLE_PAD_MS`). Bez sdíleného vzorce se rozdávání rozjelo dřív, než míchání doběhlo (8 hráčů = 16 karet postav). `shuffleLayers(n)` = kolik vrstev se vůbec kreslí – **stejný strop (80) jako statická hromádka**, takže se hotový balíček s tím statickým pixelově kryje a nic „nenaroste o xy karet". **`shuffleRiffleOrder(n)`** = pořadí, ve kterém karty padají doprostřed (indexy do hromádky, 0 = vrchní karta, výstup odspodu nahoru) – **u lichého počtu začíná ta VĚTŠÍ půlka**, jinak na konci spadnou dvě karty z jedné strany za sebou (A B A B … A A). Používá ho intro i domíchání ve hře, aby se choreografie nerozešly. |

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
  hromádky čti přes `deck._drawPile.length`, ne `deck.cards.length`. Důvod je Opuštěný důl
  (Fistful): při `deck.mineMode` si obě hromádky vymění role a každé přímé sáhnutí ten
  přepínač obejde. Jedinou výjimkou je Pedro Ramirez, jehož zdrojem JE odhoz (a pod dolem
  se mu volba nenabídne). Na klientu je totéž `deckTopPos()` / `discardTopPos()` (game.js) –
  znamenají ROLI, ne místo.
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

## Kompaktní soupeři (mobilní profil rozložení)

Na mobilu se soupeři nekreslí v okruhu kolem stolu (`oppMode: 'ring'`), ale v jedné řadě
nahoře – jeden sloupec na soupeře (`oppMode: 'compact'`). Uvolní to boky i spodek pro moji
zónu a hlavně dá vyloženým kartám soupeřů vlastní řadu.

**Profil si hráč smí vybrat sám.** Automatika (`pickLayoutProfile`) je jen výchozí odhad;
na dotykovém displeji nebo v úzkém okně se hra hned po startu zeptá obrazovkou
`ui_choice` (`renderMenuScreen` ve [view/menu.js](view/menu.js)) – zapíná ji
`shouldAskLayoutNow()` v [game.js](game.js) nad čistým pravidlem `shouldAskLayout`
([core/layout.js](core/layout.js)). Volba se pamatuje v `localStorage.bangUiMode`
(`'big'` = mobil, `'normal'` = PC), takže se ptáme jen jednou; přepnout jde kdykoli
chipem v levém dolním rohu hlavního menu. Obojí vede na **`setUiMode(mode)`**
([game.js](game.js)), které po zápisu volá `applyStage()` + `_introRelayoutPlaced()` +
přepočet Clausova panelu – tedy přesně to, co dělá změna velikosti okna, protože profil
se mění pod rukama celému klientovi. `?ui=mobile`/`?ui=desktop` má dál přednost před
uloženou volbou (testování mobilního rozložení na PC) a otázku vypíná.

Sloupec shora dolů: **otočená karta životů s portrétem** (chová se přesně jako soupeř
vlevo – portrét jede po nábojích doprava, hvězda šerifa se stejnými offsety) → **vějíř
rubů ruky** (menší měřítko, ale pořád skutečné karty) → **jméno + ⏳ stav** (oba řádky se
rezervují vždy, ať se sloupec nemění) → **řada vyložených karet** (stojí, angle 0).

- **Veškerá geometrie je v `core/layout.js`** (`COMPACT` + `compact*`), protože ji musí
  stejně počítat renderer (`drawCompactOpponent` ve view/board.js) i zacílení animací
  (`positions.js`). Nic z toho se nikde nepočítá „ručně podle sebe".
- **Měřítko není v profilu**, závisí na počtu soupeřů: `compactMetrics(n, L, stage)` ho
  odvodí ze ŠÍŘKY sloupce (`colW = min(560, (stage.w − 80)/n)`, aby řada 3 karet sloupec
  přesně vyplnila) a zastropí VÝŠKOU pásma (`oppBandH` – pod ním leží balíčky). Ptát se
  proto přes **`oppScale(L, n)`**, ne na `L.scaleOpp`. Řada vyložených karet je vždy JEN
  JEDNA – od 4. karty se rozestup zmenší (`compactBoardStep`); druhá řada by přetekla na
  balíčky a odpovídající zmenšení všech karet by bylo horší než překryv. **Sloupec proto
  má konstantní výšku, ať má hráč vyloženo cokoli** – řada se ani neposune, ani nezasáhne
  souseda (rozestup se počítá z `colW`).
- **Spodek sloupce je `oppTop + oppBandH` (440) a přímo pod ním leží balíčky**: prostřední
  sloupce stojí nad balíčkem/odhozem/High Noon. Vrch balíčku není `pileY − 75`, ale o půl
  tloušťky hromádky výš (80 vrstev po 0,25 px → 455), takže na 440 zbývá 15 px mezera.
  Hlídá to test „řada vyložených karet nedosáhne ani na plný balíček". Výjimka:
  **hokynářství balíčky zvedne o `storeLift` (120) a po dobu cinematiky spodek sloupců
  překryje** – na mobilu na tu řadu navíc jinde místo není (pásma jsou naskládaná těsně).
- **Vějíř ruky je menší než vyložené karty** (`m.fanScale`), jinak by se sloupec nevešel.
  Tím se poprvé rozchází „velikost karty na stole" a „velikost karty v ruce", což u okruhu
  nikdy neplatilo: letící karta musí na hand slot dosednout v `handCardScale(L, n, isSelf)`,
  jinak při dosednutí viditelně skočí. V `net/handlers.js` to řeší **`sideScale(idx, 'hand')`**
  (bez druhého parametru = karta na stole) – na desktopu vrací obojí totéž, takže rozlišení
  nemůže PC rozbít. Pro balíček/odhoz je vedle něj **`pileScale()`** (= `L.scaleDeck`).
- Kotva soupeře zůstává **středem karty životů** jako u okruhu, takže helpery „pod jakým
  úhlem leží karty hráče" (`_renderSideAngle`, `_kitSpecAngleFor`) propadnou na 0° správně
  a `_deathRoleStartPos` pošle kartu role zpoza HORNÍHO okraje.
- Intro: `_introOppSlots` bere stranu **z kotvy** (dřív ji dopočítávalo zpětně z pozice
  ruky prahy na okraje – u kompaktní řady je strana jen jedna a netrefilo by ji);
  `_introDealRestPos` míří u kompaktní řady rovnou na `getHandSlotPos`.

Testy: `test/layout.test.js` hlídá, že sloupec nevyleze ze své šířky (portrét při 5
životech, řada karet, vějíř) ani z pásma nad balíčky, a to pro 1–6 soupeřů na všech
reálných poměrech stran; `test/positions.test.js` hlídá, že positions.js dává přesně to,
co kreslí deska.

**Moje zóna na mobilu** má dvě řady: **stůl** (`myBaseY`, měřítko beze změny) a pod ním
**ruka** (`handY`, `scaleHand` 0.46) přes celou šířku jeviště – na telefonu je karta v ruce
54 CSS px místo 42 a vedle sebe se jich bez překryvu vejde 15 (dnes se překrývají od 7.).
Ruka se v pásu **vystředí** (`handAlign: 'center'`, viz `myHandRow`), jinak by se pár
karet krčilo v levém rohu; jedna karta pak leží přesně na `myHandAnchorX` (= střed jeviště).
Na desktopu je `handY === myBaseY` a `scaleHand === scaleMe`, takže je to pixelově dnešní
stav. Karta životů je vpravo (`livesX` 1500): portrét při 5 životech sahá 195 px vzhůru,
takže musí minout jak balíčky uprostřed, tak pásmo soupeřů nahoře – **to je nejtěsnější
místo celého rozložení a hlídá ho test**. Akční tlačítka (`btnEndX/btnEndY`,
`btnAbilX/btnAbilY`) jsou ve dvou řadách u pravého okraje vedle karty životů. Řada
hokynářství (`storeRowOffY`, `storeLift`) se musí vejít mezi zvednuté balíčky a můj stůl.

Zbytky pevných souřadnic mé zóny se proto přesunuly do profilu: `MY_ROLE_X()`/`MY_LIVES_X()`…
(view/intro.js) a `NI_MY_X()`… (net/handlers.js) jsou **funkce, ne konstanty** – profil se
ustaví až v `applyStage`, tedy po načtení těch souborů.

## Hra pro 3 hráče (Město duchů): odkryté role a cíle v kruhu

U stolu **nesedí šerif**, ale pomocník, bandita a odpadlík; všechny tři role leží **lícem
nahoru**. Cíle jsou v kruhu (`TARGET_3P` v core/roles.js): pomocník loví odpadlíka,
odpadlík banditu, bandita pomocníka. Kdo svého určeného nepřítele vyřadí **osobně**,
vyhrává hned; zabije-li ho někdo jiný (nebo dynamit, tedy nikdo), novým cílem obou zbylých
je zůstat naživu jako poslední. Odměnu **3 karet dostane každý, kdo někoho vyřadil**, bez
ohledu na role.

Trik implementace je, že **většina „co s tím, že není šerif" vypadne sama**: Vězení na
kohokoli ([logic/play.js](logic/play.js) `playSpecialCard`), žádný +1 život
(`healthForCharacter`), žádná pokuta za zabití pomocníka ([logic/combat.js](logic/combat.js))
i zvýraznění cílů v UI viselo na roli `Sheriff`, která ve hře pro 3 neexistuje. **Tyhle
podmínky se proto neupravovaly – jen se testem ověřilo, že platí.**

- **Zapnutí režimu** – `gs.mode3p`, nastaví `_applyThreePlayerMode()` (logic/setup.js) z obou
  setupů přes `isThreePlayerMode(players)` = *tři hráči a nikdo není šerif*. Debug hra pro 3
  si role losuje ze všech čtyř, takže tam šerif být může a jede klasika. `mode3p` je prosté
  pole stavu → doteče přes `room_update` i ke klientovi (redakce ho propouští).
- **Kdo začíná** – `firstPlayerIndex(players)` (core/roles.js), na `GameState` jako
  `_firstPlayerIndex()`. Řídí první tah, pořadí rozdávání v intru (`server/intro.js`),
  odkrytí karty High Noon (`_flipEvent`) a start Daltonů (`_startDaltons`). **Dřív bylo
  všude `findIndex(role === 'Sheriff')`, které by vrátilo −1 a hra by se nerozjela.**
- **Výhra** – `evaluateWinner(players, { mode3p, winClaimIdx })` → `evaluateWinner3p`.
  `_winClaim3p` nastaví `handlePlayerDeath`, když `TARGET_3P[killer.role] === dead.role`.
  Bez claimu se vítěz hlásí **až při jednom živém**, čímž se „nový cíl = zůstat poslední"
  implementuje sám. **Vypisuje se jednotné číslo podle role** („Bandita vyhrál!") – každá
  role je u stolu jen jedna, množné „Bandité vyhráli!" by nedávalo smysl.
- **Odkryté role** – `redactState` je propouští (`server/rooms.js`) a karta role leží na
  stole u každého. Recykluje se **týž slot, jaký dostane vyřazený hráč**: `_roleSlot`
  ([view/board.js](view/board.js)) a zrcadlící `hasRoleCard`/`displayIdx`
  ([positions.js](positions.js)) – **ty se musí měnit spolu**, jinak animace míří o kartu
  vedle. Cinematika vyřazení proto **odhalování role přeskakuje** (`skipReveal`), stejně
  jako u šerifa; server i klient to počítají shodně, aby se boti podrželi na správnou dobu.
  Slot je obsazený **od začátku hry**, takže se skupina „životy + postava" středí jinak
  (`numBluePrimary` v `drawOpponents`) – **`_introOppSlots` ([view/intro.js](view/intro.js))
  to musí počítat taky** (`numBlue = state.mode3p ? 1 : 0`), jinak karty postav soupeřů
  v intru dosednou na kartu role.
- **Intro** – `runIntroSequence` posílá roli **i v broadcastu** `role_card_fly`, ale JEN
  v 3P (u ostatních počtů je tajná a chodí výhradně soukromým `intro_role`; hlídá to test).
  Klient cizí kartu za letu překlopí a nechá ji ležet přes `placedCards` (`role:<idx>`) na
  slotu, kam ji pak kreslí deska – přechod do hry je beze skoku.
- **Rotující šerif** – v 3P rotuje **pomocník**. `roles.filter(r => r !== 'Sheriff')` by
  v 3P neodebral nic a `splice` by do 3členné hry přidal ČTVRTOU roli.
- **Bot** – `computeBeliefs` v 3P nic nededukuje (všechny role zná jistě) a `roleHostility`
  má vlastní cyklickou větev (`opts.mode3p`): můj určený nepřítel 3, třetí hráč 1. **Nikdo
  není spojenec** – vyhrát může jen jeden.
- **Rozložení** – oba soupeři sedí **naproti vedle sebe** (`OPPONENT_ANCHORS[2]` = dvě horní
  kotvy), ne po bocích.

## Hra pro 8 hráčů (Město duchů)

Jen jiná sada rolí: **1 šerif, 2 pomocníci, 3 bandité, 2 odpadlíci**
(`rolesForPlayerCount(8)`). Je to **jediný počet se dvěma odpadlíky** a `evaluateWinner`
to zvládá bez úpravy: odpadlík vyhrává jen jako jediný žijící, takže mrtvý šerif proti dvěma
živým odpadlíkům dá výhru banditům. Co bylo potřeba dodělat:

- **Kotvy soupeřů** – `OPPONENT_ANCHORS[7]` = 2 vlevo, 3 nahoře, 2 vpravo. Nahoře je rozteč
  430 px, proto se při 7 soupeřích zmenší i karty (`oppScaleByCount`, 0,27 → 0,25).
- **Bot** – druhý odpadlík je **rival, ne spojenec** (`roleHostility` Renegade vs Renegade)
  a taky drží šerifa při životě (`opts.renegadesAlive`): dokud žije, je zabití šerifa prohra.
- **Rozpočet postav** – 8 hráčů × 2 nabídky = **přesně 16 základních postav**, nulová
  rezerva. Hlídá to smoke test na `setupGame(8)` ve všech kombinacích
  `singleChar`/`highNoonExtra`.
- **Mobil** – kompaktní řada zvládá libovolný počet, jen `COMPACT.minScale` muselo klesnout
  z 0,24 na 0,22: je to PODLAHA (`Math.max`), takže při 7 sloupcích na jevišti 1920 px
  šroubovala měřítko nahoru a řada tří karet se do sloupce 262,9 px nevešla.

**Povolený rozsah je 3–8 a ořezává ho server** (`clampPlayerCount` v
`server/handlers.lobby.js`) – `create_room` ho dřív nevalidoval vůbec, takže
socketem šlo vyrobit místnost pro 99 lidí, kde `rolesForPlayerCount` vrátí prázdné pole.

## Pás vyložených karet: dvě řady, které nikdy nedosáhnou na balíčky

Vyložené karty (výzbroj + modré + zelené, u vyřazeného i karta role) mají **pevný počet
slotů `rows × perRow`** a jejich **půdorys se nikdy nemění**. Karty nad kapacitu nepřidají
třetí řadu – **zmenší se rozestup uvnitř řady** (stejný princip jako `compactBoardStep` na
mobilu). Řeší to `boardBand(count, rows, perRow, cardExtent, gap)` + `boardSlot(idx, band)`
v [core/layout.js](core/layout.js).

Proč: řady rostou vždy **směrem k balíčkům uprostřed stolu** (u horního soupeře dolů, u mě
vzhůru) a dřív rostly bez stropu. Horní soupeř tak **od 7. vyložené karty ležel na
balíčku** (řada 2 sahá na y 507, vrch plného balíčku je 455) a od 10. na něm ležel celý –
v Dodge City je 7–10 karet na stole běžné, takže to šlo vidět už při 6 hráčích.

- Profil nese `oppBoardRows: 2, oppBoardPerRow: 3` a `myBoardRows` (desktop 2, **mobil 1** –
  druhá řada mojí zóny by tam spadla přímo na balíčky, y 470–650 vs 465–615; prakticky se to
  nepozná, do řady se vejde 10 karet).
- Do kapacity pásu je to **pixelově dnešní stav** (`step = karta + mezera`,
  `slot = i % perRow` / `floor(i / perRow)`).
- Konzumenti: tři větve okruhu + `drawMyArea` ([view/board.js](view/board.js)) a
  `getBoardCardPos` ([positions.js](positions.js)) – **musí se měnit spolu**.
- `numBluePrimary`/`numBlue` zůstávají `min(count, oppBoardPerRow)`: šířka pásu se nemění,
  takže vystředění skupiny karty životů je beze změny.
- **Výjimka:** cinematika hokynářství zvedá balíčky o `storeLift` (120), takže druhou řadu
  horního soupeře po tu chvíli překryje – stejná dohoda, jaká už platí pro kompaktní
  sloupce na mobilu. Test proto měří proti **klidové** výšce balíčků.

Testy: `boardBand` v `test/layout.test.js` (pixelová identita do kapacity, konstantní
půdorys nad ní) a v `test/positions.test.js` invariant „pás nedosáhne na balíčky ani na
souseda" pro **2–8 hráčů, každé sedadlo a 1–14 karet**.

## Slab the Killer: zahrané Vedle! se nevrací a útočník je vidět

Dvě věci, které spolu drží: proti Slabovi je potřeba **2× Vedle!** a hráč to musí vědět
DŘÍV, než to první zahraje.

- **Rozehraná Vedle! zůstávají v odhozu.** Dřív se hráči vracela do ruky, když druhé
  Vedle! nepřišlo (`partialMisses` v [logic/response.js](logic/response.js)) – zahraná
  karta se tím ale brala zpět, což pravidla neznají. Teď je karta prostě pryč a hráč
  schytá zásah. Odpadl s tím i serverový návrat karty (`discard_to_hand` ve větvi
  „schytat zásah" v [server/handlers.game.js](server/handlers.game.js)); ta animace
  zůstává jen pro zrušené léčení Sidem Ketchumem.
- **Úhyb si tím pádem líznutí drží** – karta byla zahraná, takže `UHYB_DRAW` ve frontě
  platí. Vyhodí se jen tomu, koho ten zásah vyřadil (stejná podmínka jako u Suzy
  v `_pruneSuzyQueue`; duch z Města duchů má 0 životů, ale ve hře je → lízne si).
- **Postava útočníka se u jediného cíle rozsvítí červeně** (`attackHighlight` +
  `applyAttackTint` ve [view/board.js](view/board.js), `ATTACK_TINT`). Zvýraznění má
  přednost před tahem/čekáním/Clausem a kreslí se ve všech čtyřech větvích okruhu,
  v kompaktním sloupci, v mojí zóně i v diváckém pohledu – **musí se měnit spolu**.
  Hromadné útoky (Kulomet/Indiáni) se nezvýrazňují: cílem je celý stůl. U Duelu je
  útočníkem vždy ta druhá strana (`targetIdx` se v odpovídání střídá).
- **Blikání = „jedno Vedle! nestačí"**: rozhoduje `missesRequired > 1` u požadavku
  `Vedle!`, ne jen jméno postavy – Slabův bonus totiž neplatí na bang-efekt (Úder), kde
  by blikání lhalo. Samotný pulz je `_tickAttackPulse` v [game.js](game.js) nad seznamem
  `App.attackPulse`, který se – stejně jako `App.veraPortraits` – staví od nuly při
  každém renderu desky. **Volá se AŽ za `_tickVeraPortraits`**: útočící Vera Custer, která
  kopíruje Slaba, je v obou seznamech a blikání musí přebít barvu nastavenou Verou.

## Pivo nemá efekt, když jsou ve hře dva hráči

Klient to nenabízel už dřív (`cardPlayability`), ale server pravidlo hlídal jen u záchrany
posledního života (`beerLastLifeSave`), takže v koncovce 1v1 se z ruky pořád léčilo. Gate je
teď i v efektu `CardType.BEER` ([logic/play.js](logic/play.js)). **Zákaz platí jen na kartu
Pivo** – Salón, Whisky, Čutora, Tequila i Sid Ketchum léčí dál.

## Dělení karet mezi víc Vulture Samů

Schopnost Vulture Sama může mít zároveň víc hráčů (Vulture Sam + Vera Custer, která ho
kopíruje). Pravidlo: karty vyřazeného si **rozdělí** – bere se střídavě po jedné, začíná
ten, kdo je za mrtvým první po směru hodinových ručiček. Hra se do rozdělení pozastaví.

Technicky se recykluje existující „panika" cesta, takže klik klienta, bot i guard fungují
beze změny:

1. `handlePlayerDeath` (logic/combat.js) najde všechny živé Samy. Je-li jich víc a mrtvý
   má karty, **karty se nepřesouvají** – zůstanou u mrtvého a do fronty jde
   `{ type: 'VULTURE_SPLIT' }` (tj. PŘED odměnou za banditu).
2. `_nextVultureSplitPick` (logic/characters.js) postaví `pendingSelection`
   (`sourceCardType: PANIC`, `ignoreDistance`, `isVultureSplit`) a fázi `SELECTING_TARGET_CARD`.
3. Klik/bot pošle `select_target_card` → `resolveCardSelection` přesune kartu a přes
   `_advanceVultureSplit` pustí na řadu druhého Sama. Server k tomu emituje `ragtime_steal`
   (z ruky privátně – majitel vidí líc, ostatní rub).
4. Po poslední kartě `_finishVultureSplit` uklidí místo mrtvého, nastaví `_pendingDeathReveal`
   a vrátí se k frontě (teprve teď se líznou 3 karty za banditu).

Cinematika vyřazení je proto rozpůlená: `vulture_split_death` (pokles na nulu, karty
zůstávají ležet) → jednotlivé `ragtime_steal` → `player_death_reveal` (úklid + odhalení role).
Klient po tu dobu drží `App.vultureSplitIdx` – podle něj `deathCardsStillShown` kreslí
karty mrtvého dál a slot pro kartu role zatím nerezervuje.

## Opuštěný důl (Fistful): hromádky si na celé kolo vymění role

„Ve fázi lízání si hráč líže z odhazovacího balíčku; odhazované karty se pokládají lícem
dolů na dobírací balíček." Výklad (R7): platí to **bez výjimek a na celé kolo** – fáze
lízání, kontrolní sejmutí na Dynamit/Vězení, Lucky Duke, Dostavník, hokynářství, odměny,
zaplacené ceny, odhoz na konci tahu i celá pozůstalost vyřazeného hráče.

**Celé prohození je jeden příznak na `Deck`.** `deck.mineMode` přepíná getery
`_drawPile`/`_discardPile` ([logic/entities.js](logic/entities.js)); protože `draw()`
a `discard()` jsou jediné cesty, kudy karta z hromádek odchází a přichází, pravidla se
nemusí ptát vůbec nikde. Getery jsou na prototypu, takže je `JSON.stringify` do
`room_update` nepošle – `mineMode` (vlastní property) ano, a to je jediné, podle čeho
klient pozná, že se má prohodit i on.

- **Zapíná `_syncMine()`** ([logic/fistful.js](logic/fistful.js)) volaný z `_flipEvent`
  ([logic/highNoon.js](logic/highNoon.js)) **hned za odkrytím karet obou balíčků** – tedy
  dřív, než si start tahu sáhne na hromádky (kontrolní sejmutí už líže z prohozených).
- **„Dokud je to možné" se nikde nehlídá.** Když odhoz během kola dojde, shodí si
  `mineMode` sám `Deck.draw()` a pro zbytek kola se hraje normálně; zpátky ho zapne až
  `_syncMine` na začátku dalšího kola. Žádný `_mineOff` proto neexistuje.
- **Nemíchá se.** Dobírací balíček během kola jen roste, odhoz se vyprazdňuje – `draw()`
  se v `mineMode` k `_reshuffle()` vůbec nedostane.
- **Pedro Ramirez volbu `discard` nedostane** (`_getDrawOptions`): odhoz JE dobírací
  balíček, takže by bral tutéž kartu a jen by obešel trychtýř `draw()`. Je to zároveň
  jediné místo, které smí sahat na `deck.discardPile` napřímo – klient i bot proto
  zůstávají beze změny a nemůžou se s ním rozejít.
- **Redakce sedí sama od sebe:** `cards` (kam se odhazuje lícem dolů) jsou skryté,
  `discardPile` (odkud se líže) veřejný. Že všichni vidí dopředu, co si kdo lízne –
  včetně kontrolní karty – **je pointa karty, ne chyba.**

**Klient.** `deckTopPos()` / `discardTopPos()` ([game.js](game.js)) znamenají ROLI, ne
místo, takže se při aktivním dole prostě prohodí a všechny animace („leť z balíčku",
„leť do odhozu") míří samy správně. Totéž dělá `drawPileSprite` / `discPileSprite`
([view/board.js](view/board.js)) se zvýrazněním a klikáním; prázdný odhoz je obdélník
bez `setTint`, proto `tintPile`. `discardNeedsCursor` se musí ptát obou důvodů naráz –
`setInteractive({useHandCursor})` jde na sprite nastavit jen jednou.

**Lízání z veřejné hromádky.** Pod dolem se líže z odhozu, kde karta leží **lícem
nahoru**. Z rubového balíčku není co vidět, takže tohle se dřív nikde řešit nemuselo –
teď platí na KAŽDÉ cestě, kudy karta z hromádky odchází:

- **Zmizet z hromádky musí HNED se startem letu** (`mineTakeFromPile` v game.js, brána
  `App.discardFlyHideIds`), jinak tam viditelně leží celý let. Týká se to jen běžného
  líznutí (`draw`): u Kita, Clause, Lucky Duka, hokynářství i kontrolního sejmutí je
  karta z hromádky odebraná už ve stavu, který s fází dorazil.
- **Nepřeklápí se rub→líc.** Sejmutí i Black Jack letí doprostřed rovnou lícem, řady
  Kita/Clause/Lucky Duka a hokynářství se rozdávají bez `flip`, a `deckTopPos()` je
  jediný zdroj toho, ODKUD vzlétají – `startCheckReveal` a `dealStoreCards` proto nesmí
  sahat na `DECK_X/DECK_Y` napřímo.
- **K soupeři se karta přetáčí LÍCEM→RUB** (`reverse: true`) – mizí mu do skryté ruky,
  přesně jako u Pedra Ramireze. Aby to šlo, posílá server líznutí pod dolem **veřejně**
  (`emitAnim` s `cardId` místo `emitAnimPrivate`): celý stůl kartu viděl dopředu, takže
  se tím nic neprozrazuje. Rozhoduje `mineBefore` sebraný PŘED `gs.drawCard` – líznutí
  si důl mohlo samo vypnout.
- **Opačný směr platí taky:** karta vracející se z „odhozu" do ruky (Sid Ketchum, zrušené
  léčení) přichází z dobíracího balíčku, kde leží lícem DOLŮ → `faceUp: !mineOn()`.

**Vyčerpání odhozu uprostřed dávky.** Vypnutí dolu spadne doprostřed operace, která bere
víc karet naráz (Kit 3, hokynářství 1 na hráče): zbytek se dobere z dobíracího balíčku.
Karet je dost, takže se **nic nemíchá** – `mode` v `_revealAnim` i `storeAnim` proto musí
zůstat `'none'`, kdykoli `shuffleCount === 0`. Bez toho by klient přehrál míchací
cinematiku, která se nikdy nestala (a boti by se o ni podrželi).

**Doběh letu do odhozu.** Karta by pod dolem zmizela lícem dolů dřív, než by kdokoli
přečetl, co se zahrálo. Dosedne proto lícem nahoru, vydrží `MINE_ANIM.holdMs` a teprve
pak se překlopí na rub (`mineLandThen` v game.js, nasazuje se přes `mineLandOpts()`).
Tři návazné věci, bez kterých to nefunguje:

- **Fronta animací** ([core/animQueue.js](core/animQueue.js)) drží stav o tu dobu déle –
  `MINE_LAND_TYPES` v [net/handlers.js](net/handlers.js) **musí sedět se seznamem míst,
  kde se `mineLandOpts()` rozdává**.
- **`maxLagMs` smí být funkce.** Pevný práh 1400 ms by dvě odhozené karty za sebou (běžná
  věc: zahraná karta + odhoz na konci tahu) vyhodnotil jako zaostávání a **zahodil** –
  tedy právě tu animaci, kvůli které důl je. Práh proto s dolem povyroste.
- **Boti se drží** o stejnou dobu (`room._mineBlockUntil`, nastaví `emitAnim`
  v [server/anim.js](server/anim.js), respektuje `scheduleBotTick`). Jeho `MINE_LAND_TYPES`
  je kopie toho klientského – musí se měnit spolu.

Cinematiky, které kartu předtím ukázaly zvětšenou uprostřed (sejmutí, Lucky Duke) i odhoz
při vyřazení hráče (vlastní choreografie + `deathSequenceMs`) mají doběh **bez výdrže**
(`mineLandOptsRevealed`) – jde jen o to, aby lícem nahoru dosednutá karta nepřeskočila na
rub bez přechodu.

Testy: `test/fistful.mine.test.js` (17) + „20 her jen botů s balíčkem samých Opuštěných
dolů" (`test/server.bots.test.js`).

## Daltonové (High Noon): každý odhodí svou modrou kartu

Odkrytím karty se hra pozastaví a **každý hráč s aspoň jednou modrou kartou před sebou
jednu z nich odhodí** – vybírá si ji sám, po směru hodinových ručiček počínaje šerifem
(i při Zlaté horečce – efekty karet jdou vždy po směru, FAQ H3).

Recykluje se sekvenční výběr Rvačky, jen `attackerIdx === targetIdx`: hráč sahá na
**vlastní** stůl. Klik klienta, bot i guard tím fungují beze změny.

1. `_applyEventOnEnter` (krok 1 `_beginTurn`) zavolá `_startDaltons` → fronta `daltonsQueue`
   od šerifa po směru; `_advanceDaltons` postaví `pendingSelection`
   (`sourceCardType: CAT_BALOU`, `ignoreDistance`, `isDaltons`) a fázi `SELECTING_TARGET_CARD`.
   Vrací `true` → start tahu se pozastaví.
2. `resolveCardSelection` (logic/play.js) má pro `isDaltons` **vlastní validaci**: z ruky
   se nebere a zelené karty (Dodge City) modré nejsou – neplatný klik se ignoruje, aby se
   výběr neposunul na dalšího hráče, aniž by tenhle něco odhodil. **Modrá = výzbroj +
   karty na stole kromě zelených**; Vězení i Dynamit se počítají (FAQ H4).
3. Po odhozu `_resumeDaltons` pustí na řadu dalšího ve frontě; po posledním dokončí start
   tahu (`_resumeBeginTurn` → Pravé poledne → kontroly Dynamit/Vězení). Kdyby odhoz naplnil
   frontu odložených akcí (Suzy Lafayette), doběhne přes `_resumeBeginTurnAfterQueue`.
4. Server emituje `board_to_discard` úplně stejně jako u Rvačky (`server/handlers.game.js`
   větev `isBrawl`); klient zvýrazní modré karty přes `isDaltonsMine` ve `view/board.js`
   a klik posílá už existující server-driven cestou v `handlePanicCBClick`.

## Město duchů (High Noon): duch se na jeden tah vrací do hry

Vyřazení hráči se na svůj tah vracejí jako duchové: líznou si **3 karty**, během svého
tahu **nemohou umřít** a na konci tahu jsou zase vyřazeni.

Model: hráč nastoupí s `health = 0` a `player._ghost = true`, **ale životy se mu během tahu
hýbat můžou**: duch je ve hře, takže se **léčí jako kdokoli jiný** (Pivo, Salón, Whisky,
Čutora, Tequila, Sid Ketchum). Je to kvůli postavám, které za dobrovolnou ztrátu života
profitují – naléčené životy pak smí utratit **Chuck Wengam**. Na kartě události žádný zákaz
léčení není; „nemohou umřít" je proto jediné, co se musí hlídat zvlášť:

- **`_heal` (logic.js) se ptá přes `isInPlay`**, ne `health > 0` – to je jediný trychtýř
  léčení (Salón, Tequila i Sid jím prošly, aby se pravidlo nedublovalo).
- **`handleDamage` (logic/combat.js)**: zásah ducha srazí nejvýš na nulu a `handlePlayerDeath`
  se pro `_ghost` NEvolá; na nule ho další zásahy míjejí (early return `health <= 0`).
  Schopnosti za ztrátu života (Bart Cassidy, El Gringo) běží normálně.
- **Konec tahu**: `tryEndTurn` (logic.js) shodí duchovi životy na 0 **ještě před limitem
  karet**, takže dál platí „klasika" – limit = 0 → odhodí celou ruku (FAQ H8). Pojistkou
  pro každou jinou cestu ke konci tahu je stejné vynulování v `_teardownGhost`
  (vyřazený hráč MUSÍ mít nulu, jinak by ho `health > 0` počítalo za živého).

Kdo je „ve hře" se ptá přes **`isInPlay(p)`** (core/distance.js) = `health > 0 || _ghost`:
vzdálenost (`computeDistance` – bez toho by duch neměl na koho střílet), hokynářství
(`openStore`/`pickFromStore`), hromadné útoky, **cíl Bang!** (`playBang`), Rvačka, Vězení,
Vulture Sam a **všechno léčení**. Prosté `health > 0` zůstává tam, kde jde o skutečný
život (Doktor, Greg Digger, poslední život).

1. **Nástup** – `nextTurn` (logic.js): při `hasEvent('MESTO_DUCHU')` se mrtví v pořadí
   **nepřeskakují** a nastupující mrtvý dostane `_ghost = true`. Událost se mění jen na
   šerifově tahu (uvnitř `_beginTurn`), takže v tomhle bodě už platí ta správná.
2. **Tah** – běžný: `_drawCountFor` dá duchovi základ 3 (Pixie Pete 4, Bill Noface 5 –
   FAQ X3), limit karet na konci tahu je 0 životů, takže odhodí celou ruku (FAQ H8).
   Léčit se smí (viz model výš); Pravé poledne ho míjí, protože do tahu nastupuje s nulou.
3. **Odchod** – `_teardownGhost()` (logic/highNoon.js) volaný jako **první krok
   `nextTurn`**: co zbylo na stole sebere Vulture Sam (víc Samů → existující dělení
   `pendingVultureSplit` s `isGhost: true`, tedy bez odhalení role), jinak to jde do
   odhozu; Greg Digger a Herb Hunter se spustí jako při běžném vyřazení (FAQ X4).
   Vrací `true`, když se tah teď posunout NESMÍ (běží fronta → dojede přes
   `_nextTurnAfterQueue`, nebo je po hře).
4. **Výhra** – `evaluateWinner` počítá ducha za živého (FAQ H7: zabije-li duch šerifa,
   vyhrává jeho strana). Proto `_teardownGhost` na konci **znovu volá `checkWinCondition`** –
   jinak by hra pokračovala do prázdna, když poslední bandita/odpadlík byl právě duch.
5. **Animace** – odhoz karet při odchodu emituje `server/anim.js` v háku `beforeBroadcast`
   jako `sheriff_penalty_discard` (karty po jedné do odhozu, bez poklesu životů a bez role –
   tu má duch odkrytou od svého vyřazení). Sebral-li karty Vulture Sam, přesun se ukáže
   až v novém stavu. **Pojistný úklid v `playSheriffPenaltyDiscard` (net/handlers.js) čeká
   na `!animQueueBusy()`, ne jen na konec vlastní animace**: karty ze stolu/ruky odebere
   teprve STAV, a ten stojí ve frontě až za odkrytím karty High Noon (~7 s), protože duch
   bývá poslední před šerifem. Bez čekání se odložené karty na tu dobu vrátily na stůl
   a zmizely až během odkrývání události.
6. **Klient** – duch se kreslí jako hráč na tahu (`drawMyArea` mu vykreslí vlastní stůl
   přes `me._ghost`, `addCharInteraction` ho nepřeskočí jako mrtvého). Zrcadla „ve hře je,
   takže se léčí" jsou v `core/playability.js` (Pivo, Salón, Whisky/Tequila), `view/board.js`
   (Čutora, Sid, cíl Tequily) a `core/botPolicy.js` – **bez nich by bot vybíral akci, kterou
   server odmítne, a hra by se zasekla** (stav se nezmění → stejná akce znovu; přesně to
   odhalí zátěžový test „hra jen botů s balíčkem samých Měst duchů").
   **Roli má duch odkrytou od svého vyřazení, i když si naléčí životy**: `isDead` ve
   `view/board.js` (slot karty role) a `roleVisible` v redakci (`server/rooms.js`) proto
   berou `health <= 0 || _ghost`, ne jen nulové životy.

## Nová identita a Želízka (přibalené karty z A Fistful of Cards)

Dvě karty, které se do balíčku High Noon přibalují. Zapínají se zvlášť
(`options.highNoonExtra`, zaškrtávátko v „Pokročilé možnosti“ viditelné jen se zapnutým
High Noon; `_setupEventDeck` pak vezme i karty s `extra: true` a balíček má 15 karet).

**Želízka** — po fázi lízání si hráč na tahu zvolí barvu a v tomhle tahu smí hrát jen
karty té barvy **z ruky**. Co už leží na stole, je ve hře (bylo zahráno dřív), takže
Želízka neomezují ani aktivaci zelené karty (Pepperbox/Nůž/…), ani zelené Vedle!
(Železný plát/Sombrero/Bible) použité jako obrana.

- Ptá se `_finishDraw` (logic/draw.js) přes `_startHandcuffs()` → fáze `HANDCUFFS_SUIT`
  + `pendingHandcuffs`. Ptá se **až po frontě odložených akcí** a jen když je fáze pořád
  `PLAY` – kdyby si ji fronta vzala, zůstane hráč pro tenhle tah bez omezení (nikdy ne
  zaseknutý).
- **Každé lízání na začátku tahu proto MUSÍ končit v `_finishDraw` a nést
  `isStartOfTurn: true`** – to je jediné, podle čeho se volba barvy spouští. Postavy
  s vlastním lízáním (Jesse Jones, Pedro Ramirez, Pat Brennan, Black Jack) tudy chodí;
  Kit Carlson kdysi nechodil (`kitCarlsonPick` si nastavoval `phase = "PLAY"` sám) a jako
  jediný hrál bez omezení. Platí i pro ocásek s kartou navíc za Příjezd vlaku (`kitExtra`):
  barva se řeší až za ním.
- Jediný dotaz pravidel je **`_suitBlocked(playerIdx, card)`**; barvu bere přes `_effSuit`,
  a omezuje **jen hráče na tahu** – včetně karet zahraných jako reakce v jeho VLASTNÍM
  tahu (duel, záchrana Pivem), stejný výklad jako u Kazatele (FAQ H2). Gate je jen na
  cestách karty **z ruky**: `playCard`, `playBang`, `playSpecialCard`, `startDiscardExtra`,
  `beerLastLifeSave` a `handleResponse` (tam pod podmínkou `!fromBoard`).
  **`activateGreenCard` gate NEMÁ** – karta na stole už je ve hře. Bez toho se hra tiše
  zasekla: klient cíl korektně svítil zeleně (dostřel sedí), server aktivaci mlčky
  zahodil a karta „se vrátila".
- `_handcuffsSuit` se nuluje **na začátku tahu v `_beginTurn`**, ne až ve fázi lízání:
  kontroly na Dynamit/Vězení (a s nimi záchrana Pivem) běží dřív a jely by ještě podle
  barvy z minulého tahu téhož hráče.
- Zrcadla: `core/highNoon.js` `suitBlockedFor` → `core/playability.js` (jeden gate hned
  na začátku `cardPlayability`, tedy jen karty z ruky) a `core/botPolicy.js` (větev
  RESPOND s kartou z ruky, kterou playability neřeší). **Bez zrcadel by bot vybíral akci,
  kterou server odmítne, a hra by se zasekla.** Naopak zrcadlo navíc (bot si zakázal
  zelené karty ze stolu) by mu bralo tahy, které pravidla dovolují.

**Nová identita** — každý hráč má druhou postavu lícem dolů; na začátku svého tahu si ji
smí vzít místo současné a klesnout na 2 životy (odložená se vymění, příště se smí vrátit).

- Karty rozdá `_dealSecondIdentities()` **až po výběru postav** (volá se z obou míst, kde
  se dohraje výběr: `selectCharacter` a `_checkNextGameAllChosen`). Dřív to nejde –
  nevybrané postavy se vracejí do balíčku, takže při 7 hráčích bez Dodge City by jich
  nezbylo dost. Odložená identita je **ta z dvojice `charChoices`, kterou si hráč
  NEvybral**; do zbytku balíčku se sáhne jen tam, kde žádná volba nebyla (`singleChar`,
  debug hra s celým poolem, přeživší z minulé hry).
- Nabídka je **4. krok `_beginTurn`** (`_newIdentityOffer` → fáze `NEW_IDENTITY`),
  rozhodnutí `resolveNewIdentity(idx, take)` dotočí start tahu přes `_resumeBeginTurn`.
  Výměna ruší i kopii Very Custer.
- Klient: odloženou postavou **JE karta životů** (rub karty postavy = počítadlo životů),
  žádná druhá karta se u životů nekreslí – během cinematiky se ta jediná jen schová
  (`App.niHideSecond` v `drawMyArea`). Nálet doprostřed + překlopení spouští `startNewIdentityReveal`
  (net/handlers.js) při vstupu do fáze, statickou část s ANO/NE kreslí
  `renderNewIdentityOverlay` (view/screens.js) až je `App.niReveal.ready`.
  Dojezd rozhodnutí jde všem jako `new_identity_result` (časování `niResultMs`,
  boti čekají přes `room._niBlockUntil`).
- Dojezd **ANO** je dvoufázový, ať je vidět výměna rolí karet: stará postava se na svém
  místě překlopí na rub (rub = karta životů) a sjede na slot odložené identity
  (`App.niHideChar` ji po tu dobu v `drawMyArea` nekreslí), **teprve pak** nová postava
  sjede ze středu na místo postavy, rovnou na výšku dvou životů. Nová postava proto čeká
  celou 1. fázi zvětšená uprostřed – overlay s tlačítky zmizí hned po kliknutí.

## Právo západu (A Fistful of Cards): vynucená karta zamyká zbytek tahu

Druhá karta, kterou hráč ve fázi lízání vezme do ruky, se **veřejně ukáže** a musí ji
v tomhle tahu zahrát, pokud to jde. Jediný zdroj pravdy je `lawForcedCard`
([core/playability.js](core/playability.js)) – ptá se jím server (`_lawForced`), klient
(zlaté zvýraznění, zašedlé „Ukončit tah") i bot. Rozejít se nesmí, jinak by server tah
tiše odmítal ukončit a bot by posílal `end_turn` donekonečna.

- **Zámek zbytku tahu** — `_lawLocked(playerIdx, card)` ([logic/fistful.js](logic/fistful.js)).
  Dokud hráč vynucenou kartu drží a JDE zahrát, nesmí udělat nic jiného: `playCard`,
  `playBang`, `playSpecialCard`, `startDiscardExtra`, `activateGreenCard` a všechny aktivní
  schopnosti (Sid Ketchum, Uncle Will, Chuck Wengam, José Delgado, Doc Holyday) se na něj
  ptají. Bez toho jde povinnost snadno obejít: zahrát Pivo, aby se hráč doléčil a vynucený
  **Salón** přestal jít zahrát; zahrát **jiný Bang!** a vyčerpat jím limit (s Volcanicem
  se druhý Bang! prostě zahraje až PO tom vynuceném); nebo si kartu odhodit schopností.
  Klientské zrcadlo je jeden gate na začátku větve `isMyPlayTurn` v `cardPlayability`
  (zbytek ruky se rovnou zašedne) – zacyklení nehrozí, pro samotnou vynucenou kartu se
  gate přeskočí ještě před dotazem na `lawForcedCard`.
- **Bang! bez cíle míří na sebe** — `_lawHasTarget` u `SHOOT` vrací **vždy true**: když
  hráč na nikoho jiného nedosáhne, musí střelit sám sebe (`lawSelfShootOnly`). Klient mu
  k tomu výjimečně zvýrazní **vlastní postavu** (`drawMyArea`), bot má stejný fallback
  v `forcedLawIntent`. Bez toho se hra zasekne: `end_turn` server odmítne a jinou kartu
  hráč hrát nesmí.
- **Karta se ukáže veřejně, v ruce je pak zase tajná** — cinematika `law_reveal`
  (`startLawReveal` v [net/handlers.js](net/handlers.js), časování `LAW_ANIM`/`lawRevealMs`
  v [core/fistfulAnim.js](core/fistfulAnim.js)): karta vyletí doprostřed obrazovky,
  překlopí se, chvíli drží a pak jde do ruky – ostatním se cestou překlopí zpět na rub.
  Je to totéž tělo jako u Peyote (`startDeckCardReveal`), jen **bez pulzující marky**
  (nezkoumá se hodnota ani barva). `redactState` proto vynucenou kartu **nepouští** –
  v cizí ruce leží rubem nahoru jako každá jiná.
  Zdroje vynucené karty a jejich cinematika:
  | odkud | co se přehraje |
  |---|---|
  | běžná 2. karta z balíčku | `law_reveal` (`from` chybí → start na balíčku) |
  | Black Jack | jeho vlastní `BLACK_JACK_CHECK` reveal – ten markami **bliká** (barvu opravdu zkoumá), takže se `law_reveal` neposílá |
  | Claus "The Saint" | `law_reveal` s `from: 'claus'` – rozdávání se zastaví, karta vyletí ze své pozice v řadě a pak jde do ruky |
  | Kit Carlson | `law_reveal` s `from: 'kit'` – vlastník má odkrytou řadu uprostřed, ostatní parkující ruby u jeho místa (spotřebuje se jedna, jinak by ji `finishKitCarlsonSpectator` poslal do ruky ještě jednou). Klient u téhle volby vynechá vlastní let do ruky (`_kitLawPick` ve [view/board.js](view/board.js)) |
- **Zlaté zvýraznění přebíjí všechna ostatní** — nastavuje se ve `drawMyArea` až úplně
  nakonec (i za zeleným zvýrazněním právě vybrané karty, ta se pozná vysunutím) a drží
  i po hover-outu. Hráč musí pořád vidět, která karta ho v tahu drží.

## Odkrytá řada (Kit Carlson / Claus): došlý balíček ji rozdělí na dvě části

Odkrytá řada se rozdává **stejnou cestou jako hokynářství**. Když balíček během odkrývání
dojde, odkryje se nejdřív to, co v něm bylo, pak se zamíchá (hra čeká) a teprve pak dorazí
zbytek – dřív se jen o 5,7 s odložil celý broadcast a řada naskočila naráz až po míchání.

- Rozhoduje o tom `_revealAnim(deckBefore, dealt)` ([logic/draw.js](logic/draw.js)), jehož
  výsledek jde ve stavu jako `kitCarlsonState.anim` / `clausState.anim`:
  `'none'` (karet byl dostatek), `'proactive'` (balíček se vyprázdnil poslední odkrytou
  kartou → míchá se až po rozdání, paralelně s výběrem), `'blocking'` (došel dřív → rozdá
  se `dealtBefore`, zamíchá se, dorozdá se zbytek). Zároveň **potlačí legacy
  `reshuffle_anim`** (vynuluje `_reshuffleOccurred`), aby se míchání nepřehrálo dvakrát –
  přesně jako `openStore`.
- Klient to hraje přes `dealRevealRow(n, anim, tempo, flyOne, onDone)` ([game.js](game.js)) –
  jeden rozdávač pro Kitův panel, Clausovu řadu i pohled ostatních na Kita. Po dobu
  rozdávání kreslí balíček podle vlastního počtu (`App.dealDeckCount`, sdílené
  s hokynářstvím) a drží `App.revealLocked` (z řady zatím nejde vybírat – stav s fází
  dorazí hned, protože míchání si řídí klient) a `App.revealShuffling` (balíček se po tu
  dobu nekreslí).
- Boti čekají přes `room._revealBlockUntil` / `room._reshuffleBlockUntil`, které se počítají
  **stejným vzorcem** (`revealCinematicMs` v [server/anim.js](server/anim.js), tempo v
  `REVEAL_TEMPO` musí zrcadlit `KIT_TEMPO`/`CLAUS_TEMPO` v game.js).
- Když karet není dost ani po zamíchání (došel i odhoz), odkryje se prostě míň:
  Kit si nechá `min(kitNeeded, revealed.length)`, Claus má přednost před rozdáváním
  (`keep` napřed, `queue` až ze zbytku) – jinak by výběr nešel dokončit.

## Ranč (A Fistful of Cards): odhoz po jedné, náhradní karty ručně

„Po fázi lízání smíš odhodit libovolný počet karet a líznout si stejně." Odhoz i lízání
se dřív odbyly naráz jedním kliknutím; teď:

- `ranchExchange` ([logic/fistful.js](logic/fistful.js)) jen **odhodí** označené karty
  a nastaví klasickou fázi lízání (`drawPhaseState` s `cardsNeeded` = počet odhozených,
  `isRanch: true`, **`isStartOfTurn: false`** – Želízka ani Ranč sám se znovu neptají).
  Náhradní karty si hráč lízne **ručně**, klikem na balíček za každou odhozenou; domíchání
  balíčku se tím odbaví úplně stejnou cestou jako u kteréhokoli jiného lízání.
- Odhoz se řadí **podle pozice ve vějíři**, ne podle pořadí klikání – karty pak odlétají
  do odhozu po jedné zleva doprava (`hand_to_discard` jde frontou animací, takže se
  přehrají za sebou a stav dorazí až za nimi, ať je jich kolik chce).
- Suzy Lafayette se neprobudí: prázdnou ruku vidí až po dokončení efektu, a to už má
  karty zpátky (viz „nejdřív doběhne efekt zahrané karty").

## Pálenka se nenabízí s plnými životy

„Vynech fázi lízání a vezmi si 1 život" nemá s plnými životy co dát, takže by tlačítko
šlo zmáčknout jen omylem – a hráč by přišel o celou fázi lízání za nulu. Rozhoduje o tom
`_drawOptionsBase(player)` ([logic/draw.js](logic/draw.js)), tedy **jediný zdroj pravdy**
pro server, klientské tlačítko i bota; `drawCard('liquor')` se navíc ptá znovu v okamžiku
akce (`options` je jen snímek z okamžiku, kdy fáze začala).

## Lucky Duke: výběr a pak KLASICKÉ sejmutí

Lucky Duke si u každého snímání líže 2 karty a jednu si vybere. Během výběru se marky
(hodnota/barva) **nezvýrazňují** – blikání na obou kartách mate. Po kliknutí
(`playLuckyDukeResult` v game.js):

1. NEvybraná odletí ze svého slotu rovnou do odhozu (`LD_DROP_MS`) – v depth **pod**
   hromádkovou vrstvou vybrané karty (`REVEAL_PILE_DEPTH - 1`). Na odhozu totiž leží
   (`holdUntil`) po celou cinematiku, dokud nedorazí stav; s výchozím depth `animateCard`
   (800) překrývala jak zvětšenou kartu uprostřed, tak její sestup do odhozu.
2. Vybraná se přesune doprostřed obrazovky a odtud jede přesně to, co vidí každý jiný
   hráč u sejmutí (`startCheckReveal`): zvětšení → `pulseCheckMark` → výdrž → sestup do
   odhozu. Součet `LD_TO_CENTER_MS + LD_HOLD_MS + LD_TO_DISCARD_MS` = `CHECK_REVEAL_MS`
   (3850) a **musí se rovnat `ANIM_MS.lucky_duke_result`** v `net/handlers.js`.
3. Teprve pak jde frontou výsledek checku (vězení/dynamit). Protože vybraná karta dosedne
   jako poslední, `luckyDukePick` (logic/characters.js) ji do odhozu vkládá **až po**
   nevybrané – hromádka tak sedí s tím, co hráč viděl.

Po dobu cinematiky drží server boty přes `room._revealBlockUntil` (nastaví `handleLuckyDuke`,
respektuje `scheduleBotTick`) – stejně jako u smrti nebo odkrytí karty High Noon.
Panel karet se po kliknutí schová přes `App.luckyDealIds` (stav s koncem fáze `LUCKY_DUKE`
dorazí až za celou animací, jinak by karty zůstaly viset na slotech).

## Intro: co drží pozice a co je jen animace

Intro **si umístěné karty pamatuje jako hotové souřadnice** (`_introState.placedCards`),
zatímco hra pozice počítá při každém překreslení z profilu rozložení. Dvě věci z toho
plynou a obě se musí držet:

- **Každá položka `placedCards` nese `rl` = jak se její pozice počítá** (`oppLives`,
  `oppChar`, `oppName`, `oppStar`, `oppRole`, `myRole`, `myLives`, `myChar`, `myName`,
  `colt`, `hand`). Změna velikosti okna / fullscreen zavolá `_introRelayoutPlaced()`
  ([view/intro.js](view/intro.js), volá ji resize handler v [game.js](game.js)), který
  je podle toho přepočítá. **Nová `placedCards.push` bez `rl` = karta, která po změně
  velikosti zůstane ležet na starém místě.**
- **Pozice musí sedět s herním renderem na pixel**, jinak přechod do hry blikne. Sdílí
  se proto výpočty, ne konstanty: jmenovka soupeře se počítá z rozměru karty (při 8
  hráčích je měřítko 0,25, ne 0,27 – konstanty 38,25/85,5 platily jen pro 0,27), moje
  jmenovka z `MY_ROLE_X()`/`myNameOffY`, Colt z `_introColtPos()`, hromádky přes
  `_introStackTopY` (vrch se počítá ze SKUTEČNÉHO počtu jako `drawDrawPiles`, jen
  vrstev se kreslí nejvýš 80).

Další dvě místa, kde přechod do hry dřív „naskočil":

- **Colt .45** se fade-inem objevuje jen při skutečné výměně zbraň → Colt. `App.coltVisible`
  má proto tři stavy a `null` (nastaví `resetBoardSlides`) znamená „deska se kreslí poprvé" –
  z intra tam Colt už leží, takže se nefaduje.
- **Rozsvícení hráče na tahu** (`applyTurnTint` ve [view/board.js](view/board.js)) se
  plynule nafaduje z neobarvené karty. Fade je vázaný na ČAS změny tahu
  (`App.turnTintStart`), ne na sprite – renderUI karty vytváří znovu při každém
  překreslení, takže by tween jinak pokaždé začínal od nuly.

Sprity zaparkované na konci intra (balíčky, které dojely na svou herní pozici) se po
`'done'` **neuklízí hned**: deska se vykreslí až s `room_update`, které jde frontou
animací. Úklid je odložený (`App.introDoneToken` ho zruší, kdyby mezitím začalo nové intro).

## Intro: rozdávání rolí a postav

- **Balíček postav je CELÝ pool** (základ 16, s Dodge City 31) – zamíchá se celý,
  rozdají se z něj dvě karty na hráče a **nerozdaný zbytek odletí jako celek ze stolu**
  (`_introFlyAwayCharDeck`). Odlétá **hned po rozdání poslední dvojice** (větev
  `char_cards_fly` s `step === order.length − 1`), ne až si všichni vyberou – na
  `chars_slide_in` zůstává jen pojistka pro případ, že se ten beat ztratil. Speciální
  případ: **8 hráčů bez rozšíření** – 16 postav, 8×2 rozdáno, balíček dojde a neodlétá
  nic. Počet posílá server (`charPoolCount` v [server/intro.js](server/intro.js),
  `startGame` v [server/lifecycle.js](server/lifecycle.js)).
- **Obě moje karty postav přiletí ve stejném rytmu jako soupeřům** – nejdřív levá,
  po `INTRO_CHAR_DEAL_GAP` pravá (dřív se mi objevily naráz). Každá se **ukáže hned, jak
  doletí ta její** (`_introState.charRevealed[idx]`, kreslí `_renderIntroCharSelect`);
  dřív gate `charChoicesRevealed` čekal na obě, takže levá po dokončení překlopení
  zmizela a naskočila znovu až s pravou. **Klikací** jsou obě až po obou – výběr se
  nesmí potvrdit dřív, než je vidět celá nabídka.
- **Cizí karta role letí k sedačce a pokračuje ZA okraj jeviště** (`_introDealRoleAway`),
  cestou se natočí do orientace toho hráče – roli si bere do ruky, nikdo ji nesmí vidět
  ležet. Ve hře pro 3 (role lícem nahoru) platí dál `_introPlacePublicRole`.
- **Balíček High Noon leží v intru se stejnou roztečí jako ostatní tři**
  (`INTRO_PLAY_DECK.x + 160`). Že je jeho herní pozice (`HN_PILE_X`) blíž se dorovná
  tím, že jeho závěrečný přesun je kratší, ne jinou roztečí na stole.

## Intro navazující hry

Navazující hra **má stejné intro jako první hra**, jen s předehrou pro přeživší.
Server (`server/intro.js`) → klient (`net/handlers.js` `intro_phase` → `view/intro.js`):

1. `init` (`nextGame: true`, `survivors: [{idx,char,health}]`, reálné `roleCount/charCount/deckCount`) –
   deska se rozloží: tři balíčky + postavy přeživších s tolika životy, kolik jim zbylo
   (balíček postav je o jejich karty menší). **Hvězda šerifa ještě ne** – role se rozdají později.
2. `nextgame_keep` (po 1 s) – MOJE postava vyletí zvětšená doprostřed + tlačítka ANO/NE.
3. `keep_result {playerIdx, keep}` po každém rozhodnutí – ANO: karta se usadí na svůj
   **základní** max (šerifův +1 je pořád tajný); NE: překlopí se, odletí zmenšená na balíček
   postav (`charCount++`) a karta životů zmizí fade-outem. Vlastní rozhodnutí se animuje
   hned z kliknutí, cizí z tohoto eventu.
4. Až se rozhodnou všichni → klasické `runIntroSequence` (role) beze změny.
5. `sheriff_reveal {playerIdx}` – jen když je šerifem **keeper**: +1 život (posun karty,
   280 ms jako herní posun životů) a fade-in hvězdy. `room._introKeepers` (snapshot z bodu 3)
   je jediné kritérium – „má postavu" nestačí, boti si ji vybírají hned po startu.
6. `introStartCharPhase` rozdá postavy jen hráčům mimo `_introKeepers`, dál už klasicky
   (výběr ze 2, `chars_slide_in` keepery přeskočí, míchání balíčku, rozdání karet, `done`).

Stav klienta drží `_introState.placedCards`; položky mají `key` (`char:3`, `lives:3`,
`name:3`, `star:3`), aby je šlo za běhu posunout/schovat/odstranit.

## Požehnání / Prokletí (High Noon): přebarvení karet

Obě události mění barvu **všech** karet ve hře (Požehnání = srdce, Prokletí = piky;
hodnota zůstává). Musí se to projevit ve dvou vrstvách:

- **Pravidla** — `GameState._effSuit(card)` (logic/highNoon.js). Kód se na `card.suit`
  nikde neptá napřímo; trychtýře jsou `_applyCheckResult` (Dynamit/Vězení/Barel/
  Jourdonnais i přes Lucky Duka), `resolveBlackJack`, všechna volání `_apacheImmune`,
  přiřazení `_massAttackSuit` a Doc Holyday. Bot má zrcadlo `effSuit(state, card)`
  v `core/highNoon.js` (používá ho volba Lucky Duka).
- **Vizuál** — přepeče se **OBSAH** textur `card_<id>`: `buildCardTextures` kreslí do TÉŽE
  `RenderTexture` (jen ji vyčistí) a respektuje `scene._suitOverride`; `applySuitOverride(scene, suit)`
  (game.js) projde `scene._bakedCardLists` (základ + rozšíření, jejichž art už doteče).
  **Texturu `card_<id>` nikdy nerušit** (`textures.remove` + nová RT pod stejným klíčem):
  sprity, které renderUI nepřekresluje (letící karty držené na cíli, klouzající karty
  při přeskládání ruky, zvětšení), si drží tu zahozenou a renderer na příštím snímku
  spadne – hra ztuhne nebo zůstane hnědá obrazovka (= pozadí plátna).
  Přepečení běží uvnitř výdrže odkryté karty uprostřed obrazovky
  (`net/handlers.js`, `high_noon_reveal`) – tam se nic jiného neanimuje. Pojistkou je
  stejné (idempotentní) volání na konci `_applyRoomUpdate` (divák uprostřed hry, konec hry).
  Stejnou markou se řídí i pulzující zvýraznění při snímání (`effSuitMarkKey` →
  `pulseCheckMark`); to si pod zvětšenou marku podkládá **záplatu z původního artu**
  (`_markCoverPatch`), aby pod ní neprosvítala ta malá zapečená.
- **Výjimka Peyote (Fistful)** — tip se vyhodnocuje proti VYTIŠTĚNÉ barvě, takže i odkrytá
  karta uprostřed obrazovky musí ukázat tu vytištěnou (jinak by hráč viděl jinou barvu, než
  na kterou právě sázel). Zařídí to `pulseCheckMark(..., { printedSuit: true })` – pulzující
  marka si pod sebe podkládá záplatu z původního artu (`_markCoverPatch`), takže zapečenou
  (přebarvenou) marku zakryje. Přebarvení se na kartě projeví až ve chvíli, kdy dosedne
  do ruky. Jinde se `printedSuit` nepoužívá.
- **Pozor na dvě podoby barvy** — v datech (`cards.json`, z nich se pečou textury) je
  `"HEARTS"`, ve stavu hry už symbol `♥️` (přemapuje `Card` přes `Suits`). `SUIT_SLUG`
  v `core/cardArt.js` proto zná **obojí**; jinak `suitMarkKey` pro kartu ZE STAVU vrátí
  null a tiše vypadne celý pulz při snímání.

## Redakce stavu: klient dostane jen to, co má vidět

`GameState` nemá `toJSON`, takže se do `room_update` serializuje **celý**. Dřív to
znamenalo, že si každý hráč mohl v konzoli přečíst role všech, jejich ruce i pořadí
balíčku — klient to jen nekreslil. Ořezává to **`redactState(gs, viewerIdx, revealAll)`**
v `server/rooms.js`, kterým prochází každý `roomPayload`.

- **Skryje se**: role ostatních, jejich ruce (nahradí je `{ id: null, _placeholder: true }`,
  takže **délka ruky zůstává** — jen podle ní se kreslí vějíř rubů), pořadí balíčku
  (`deck.cards` → stejný počet zástupných karet) a odložené identity (`_secondChar`).
- **Veřejné zůstává**: šerifova role (zná ji celý stůl), role vyřazených (odhalí se při
  smrti — duch má `health 0`, takže spadne pod stejnou podmínku), **všechny role ve hře pro
  3** (`gs.mode3p` — leží lícem nahoru), odhoz, vyložené karty, zbraně, životy, postavy
  a `charChoices` (podle jejich počtu pozná `pendingActor` fázi výběru postav i na klientovi).
- **Neredaguje se vůbec**: debug hra (jeden socket ovládá všechna místa), stav po konci
  hry (`gs.winner` — výherní obrazovka i statistiky role ukazují) a divák u hry jen botů.
- **Divák běžné hry vidí jen veřejné informace.** Bez toho by stačilo otevřít si hru ve
  druhé záložce jako divák a číst spoluhráčům karty.
- **Boti redakcí neprocházejí** — `server/bots.js` čte `room.gameState` napřímo.

Dvě místa, kde na to musí kód myslet:

- **Role při vyřazení chodí v datech animace** (`role` v `player_death_discard` /
  `vulture_sam_steal` / `player_death_reveal`), ne ze stavu. Stav se na klientu aplikuje
  až ZA celou cinematikou (fronta animací), takže v okamžiku odhalení je pro klienta
  vyřazený hráč pořád živý a jeho roli by redakce ještě schovávala. Klient si ji proto
  ve fázi `'settled'` **zapíše do svého stavu** (`playDeathSequence`/`playDeathRoleReveal`
  v net/handlers.js) – jinak by karta role po dosednutí na slot chvíli (než dorazí stav)
  kreslila fallback `deadRoleMap[...] || …`, tedy banditu, ať měl mrtvý roli jakoukoli.
  Fallback je z téhož důvodu **rub** (`role_card_back`), ne konkrétní role.
- **Karta odlétající z ruky soupeře se nedá najít podle `id`.** `_liftCardFromHand`
  (net/handlers.js) proto u zakryté ruky odebere poslední slot — ve vějíři rubů na tom
  nezáleží a bez toho by ruka zůstala do příchodu stavu o kartu širší a pak cuknula.

Pokryto testy v `test/server.rooms.test.js` (sekce „Redakce stavu").

## Bandwidth: assety jsou WebP, ne PNG

Hosting jednou spadl na vyčerpanou bandwidth — jedna partie pěti lidí stála ~0,5 GB.
Art karet je sken malované karty **včetně vysázeného pravidlového textu**; jako PNG
650×1000 vážil ~1,3 MB (skoro 2 bajty na pixel, prakticky bez komprese) a celá sada
95,8 MB. Jedno načtení hry z toho stáhlo 42 MB (základ) až 97 MB (obě rozšíření) — a
protože se to nevešlo do cache mobilního prohlížeče, tahal si telefon všechno znovu
každou session.

- **V `assets/` jsou `.webp`, žádné `.png`.** Cesty staví výhradně `preload()` a
  `EXPANSION_LOADERS` v `game.js` (jinde se URL assetu nesestavuje). Sada má 6,3 MB,
  jedno načtení 3,0 MB / 7,1 MB s oběma rozšířeními.
- **Převod dělá `tools/webp.js`** (`--measure`, `--quality=N`, `--replace`). `sharp`
  není závislost hry, instaluje se jen na převod přes `npm install sharp --no-save`.
  Zdrojové PNG zůstávají v historii gitu, takže jde kdykoli převést na jinou kvalitu.
- **Nasazeno je q70.** Naměřeno na 122 souborech: q70 6,3 MB / q80 8,3 MB / q90 13,3 MB.
- **Marky hodnoty/barvy jdou bezeztrátově** — jsou to ostré glyfy, které se při snímání
  zvětšují (`pulseCheckMark`), takže by na nich byly artefakty vidět. Celá složka má
  i tak jen 216 kB. Řeší to `isLossless()` v `tools/webp.js`.
- **Alfa je všude reálně využitá** (zaoblené rohy karet). WebP ji nese a u lossy ukládá
  bezeztrátově, takže rohy zůstávají ostré — nový art proto smí mít průhlednost.
- **Nový art přidávej rovnou jako `.webp`.** Přibude-li PNG, stačí znovu spustit skript.

Server k tomu v `server.js`:

- `perMessageDeflate` na Socket.IO. `room_update` (~25 kB, z toho 10 kB zbytek balíčku)
  chodí všem hráčům při každém broadcastu, za partii ~270× — zabalený má ~2,6 kB.
  Socket.IO ho má od v3 vypnutý, takže se to musí zapnout ručně.
- `compression()` na HTTP (klientský JS je 38 souborů / 807 kB → 242 kB).
- `Cache-Control` v `express.static`: assety `max-age=86400`, kód zůstává na
  `max-age=0` + ETag (nasazená verze musí být vidět hned). Delší platnost assetů by
  chtěla verzi v URL, kterou tu bez build stepu nemáme.
- **Na localhostu (a na LAN IP) se assety NEcachují** (`no-cache` + ETag, `isLocalHost`
  v `server.js`): jinak se nově převedený art neprojeví ani po F5 a člověk ladí grafiku,
  kterou prohlížeč vůbec nestáhl. Pozná se to podle hostname požadavku, ne podle env
  proměnné – nasazený server chodí na doméně, takže se nekonfiguruje nic.

## Testy

- Runner: **vestavěný `node --test`** (zero deps). Spuštění: `npm test`. Soubory: `test/**/*.test.js`.
- Testuje se **`GameState`, `core/*`** (čistá logika) a **`server/*`** (factory s fake `io` – `test/server.*.test.js`), ne render.
- `test/_helpers.js`: `mkGame`/`mkCard`/`give`/`board`/`topDeck`. **Hru stav build ručně** (ne `setupGame` — míchá; ne `setupDebugGame` — `isDebug=true` vypne vyhodnocení výhry).
- Pravidla pro 3 hráče jsou v `test/threePlayer.test.js`; zátěžové hry jen botů
  (`test/server.bots.test.js`) jedou **3–8 hráčů** ve všech kombinacích rozšíření.
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
