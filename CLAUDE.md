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
| `logic/entities.js` | Datové/hodnotové třídy: `Card`/`Player`/`Deck` + konstanty `CardType`/`Suits`/`ALL_CHARACTERS`. Bez vazby na `GameState`. Izomorfní (globály v prohlížeči, `require` z logic.js v Node). Re-exportováno z logic.js, takže testy/server importují dál z `logic.js`. |
| `logic/setup.js` | **Mixin GameState.** Setup hry a další hry, výběr postav, debug rozdávání: `setupGame`, `setupDebugGame`, `selectCharacter`, `autoSelectAllCharacters`, `startFirstTurn`, `setupNextGame`, `selectCharacterForNextGame`, `rejectCharacterForNextGame`, `_checkNextGameAllChosen`, `debugGiveCard`, `debugRemoveCard`. Připojeno na `GameState.prototype` (viz „Mixin pattern"). |
| `logic/draw.js` | **Mixin GameState.** Fáze lízání: `startDrawPhase`, `_getDrawOptions`, `drawCard`, `_finishDraw` + postavy Kit Carlson (`startKitCarlsonDraw`, `kitCarlsonPick`) a Black Jack (`resolveBlackJack`). |
| `logic/play.js` | **Mixin GameState.** Hraní karet: `playCard` (router efektů), `playBang`, `playSpecialCard` (Vězení/Cat Balou/Panika/Duel/Kulomet/Indiáni), `playBoardCard` (modré i zelené na stůl), `triggerBarrelDraw`, `startBarrelCheck`, `resolveCardSelection`, `_advanceMassAttack`, `waitForMissed`. |
| `logic/combat.js` | **Mixin GameState.** Zranění a smrt: `handleDamage`, `handlePlayerDeath` (Vulture Sam, kill reward, šerif×pomocník), `sidSaveDiscard`, `takeDynamiteHit`. |
| `logic/response.js` | **Mixin GameState.** Fáze RESPOND: `handleResponse` (Vedle!/Bang!, duel, hromadné útoky), záchrana posledního života `beerLastLifeSave`/`sidLastLifeSave`, `_advanceAfterLastLifeSave`. |
| `logic/characters.js` | **Mixin GameState.** Schopnosti postav + fronta odložených akcí: `_processSpecialQueue`/`_resumeAfterSpecial`, `checkSuzyLafayette`/`suzyLafayetteDraw`, `bartCassidyDraw`, `elGringoSteal`, `sidKetchumDiscardOne`/`useSidKetchum`, `startLuckyDukeCheck`/`luckyDukePick`. |
| `logic/checks.js` | **Mixin GameState.** Kontrolní líznutí na začátku tahu (Dynamit/Vězení) a vyhodnocení checků: `handleStartOfTurnChecks`, `triggerCheckDraw`, `_applyCheckResult` (Dynamit/Vězení/Barel/Jourdonnais), `resolveCheck`. |
| `server.js` | **Socket.IO bootstrap (~76 ř.).** Express/io setup → poskládá sdílený `ctx` (`require('./server/*')(ctx)` v pořadí rooms→gamelog→ledger→guard→intro→anim→lifecycle→bots) → `io.on('connection')` jen definuje per-connection `withRoom` a zavolá `register*Handlers(socket, ctx, withRoom)` → `server.listen`. Veškerá logika je v `server/*`. |
| `server/rooms.js` | Factory `installRoomService(ctx)` – vlastní `rooms` Map + roomCounter, vystaví na `ctx`: `makeRoom`, `roomPayload`, `broadcastRoom(+Delayed)`, `broadcastLobbyList`, `getLobbyList`, `getGameList`, `findRoomBySocket`, `leaveRoom`, `disbandRoom`. Bez listenu → testovatelné s fake io (`test/server.rooms.test.js`). |
| `server/intro.js` | Factory `installIntroService(ctx)` (bere `io`, `broadcastRoom`) – serverová intro sekvence přes timeouty: `emitIntro`/`emitIntroRole`/`emitIntroChars`, `runIntroSequence`, `introAfterRoles`, `introStartCharPhase`, `introStartDeckPhase`. **Navazující hra** má vlastní vstup `runNextGameIntro` + `introKeepResult` (viz „Intro navazující hry“ níže). Test: `test/server.intro.test.js`. |
| `server/anim.js` | Factory `installAnimService(ctx)` (bere `io`, `broadcastRoomDelayed`) – `emitAnim`, `emitDeathAnim` (Vulture Sam vs odhoz), `handleAutoEndTurn`, `handleReshuffleAndBroadcast`, `storeCinematicMs` (časování cinematiky hokynářství = zvednutí + rozdání + míchání; zrcadlí `game.js`, používá ho bot settle i čekání na dojezd míchání). Test: `test/server.lifecycle.test.js`. |
| `server/lifecycle.js` | Factory `installLifecycle(ctx)` (bere `cardData`, `GameState`, `broadcastRoom`, `broadcastLobbyList`, `emitIntro`, `runIntroSequence`) – `startGame`, `startNextGame` (rotující šerif, přenos postav+životů přeživších, spuštění `runNextGameIntro`). Intro přeskakuje jen debug/singleChar/botGame. Test: `test/server.lifecycle.test.js`. |
| `server/gamelog.js` | Factory `installGameLog(ctx)` – **strukturovaný herní log** (JSONL soubor na hru v `logs/<roomId>_<ts>.jsonl` + stručný konzolový mirror). Vystaví `ctx.glog`: `openGame`/`closeGame`, `action` (ingress hráče/bota), `rule` (událost pravidel z `gs._onEvent`), `snapshot` (egress stavu v `broadcastRoom`, dedup), `system`/`error`/`clientLog`. Instaluje se v `server.js` **první** (rooms nastaví no-op fallback `ctx.glog`, gamelog ho přepíše reálným). Nahradil VŠECH ~86 ad-hoc `console.*`. Rules-level události chodí přes injektovaný sink `gs._onEvent` (funkce → JSON.stringify ji zahodí, neuniká do klienta); nastaví lifecycle/debug PŘED setupem. Formát/snapshot řeší izomorfní `core/gameLog.js`. Test: `test/gamelog.test.js`. **Když uživatel hlásí chybu, přečti nejnovější `logs/*.jsonl`.** |
| `server/guard.js` | Factory `installActionGuard(ctx)` – **autorizace herních akcí na hráče**. Vystaví `ctx.guardedOn(socket)` = náhrada za `socket.on` pro `handlers.game.js`/`handlers.characters.js`. Handlery čtou aktéra ze STAVU, ne z odesílatele, takže bez guardu posunul hru každý příchozí event (na pomalé lince dvojklik na „Ukončit tah" přeskočil několik hráčů, opožděný klik vybral kartu za jiného hráče). Guard porovná seat odesílatele s `pendingActor(gs)` (core/pending.js); nesedící akci zahodí, zaloguje (`glog.reject`) a pošle `action_rejected` (klient si odemkne UI). Výjimky: akce mimo pořadí (Sid Ketchum) se kontrolují jen na „hraje za sebe"; debug hra (jeden socket = všechna místa) se přeskakuje; `pendingActor === null` propouští. Test: `test/server.guard.test.js`. |
| `server/ledger.js` | Factory `installLedger(ctx)` – **veřejný ledger chování** (`room.behaviorLedger`): kdo na koho útočil / koho léčil. `recordBehavior`/`initLedger`. Handlery (`play_bang`/`play_special`/`doc_holyday`/`activate_green_card`/`discard_extra_choose`) ho plní; bot z něj přes `core/beliefs.js` dedukuje skryté role. Mimo broadcastovaný `gameState`. Reset při startu hry (lifecycle). Test: `test/server.ledger.test.js`. |
| `server/bots.js` | **Počítačoví hráči.** Factory `installBotService(ctx)` – bot = bezhlavý klient přes „fake socket" se stejnými handlery jako člověk (`register*Handlers`). Driver `runBotTickOnce`/`scheduleBotTick` po každém broadcastu (hook `ctx.afterBroadcast` v rooms.js) i intro emitu (`ctx.afterIntroEmit` v intro.js) zjistí přes `pendingActor`, zda se čeká na bota, spočítá `beliefs` (z `room.behaviorLedger`) + akci `decideBotAction` a vystřelí ji handlerem (1:1 reuse animací). `createBot`/`removeBot`, stall guard. **Intro gate:** během intra (`room._introPlaying`, nastaví lifecycle, sundá intro.js na `'done'`) bot herní akce (líznutí/karty) NEDĚLÁ – jen výběr postav; po startu hry navíc `room._botStartupSettle` dá první herní akci delší pauzu (`startupSettleMs`), ať hráč vidí, co bot zahraje. Test: `test/server.bots.test.js` (vč. zátěže „hra jen botů doběhne"). |
| `server/handlers.*.js` | Socket handlery podle subsystému: `register*Handlers(socket, ctx, withRoom)`, těla berou helpery z `ctx`. **lobby** (místnosti/spectate/chat/disconnect + `add_bot`/`remove_bot`/`create_bot_game` = hra jen botů ke sledování), **nextgame** (výběr postav/intro OK/další hra), **game** (herní akce + Kit/Lucky/Barel/Sid/dynamit/pivo/store), **characters** (Bart/El Gringo/Suzy/checky/Black Jack), **debug** (debug_*). Eventy: `test/server.handlers.test.js`; integrace: `test/server.integration.test.js`. |
| `cards.json` | Data všech karet (jména, typy, hodnoty). Načítá server i testy. |

### Klient — jádro
| Soubor | Co dělá |
|---|---|
| `game.js` | Klientský bootstrap: Phaser scéna (`preload`/`create`/`update`), `socket.on` handlery, `renderUI()` router, intro animace, menu/lobby. **Velký — postupně se rozkládá do `view/`** (viz Konvence). |
| `state.js` | Globální `App` objekt — sdílený UI stav klienta (menuScreen, lobbyList, chat, intro flagy…). Žádná logika. |
| `positions.js` | **Čistý layout math:** pozice hráčů, karet v ruce, karet na stole. `OPPONENT_ANCHORS` = jediný zdroj kotevních bodů soupeřů. |
| `index.html` | Pořadí `<script>` tagů = pořadí načítání (žádný bundler!). |
| `chat.js` | Chat overlay. |

### Klient — render vrstva (`view/`)
| Soubor | Co dělá |
|---|---|
| `view/board.js` | **Herní deska.** `renderGameBoard()` orchestrátor → `drawOpponents` / `drawMyArea` / `drawSpectatorPlayer` / `drawPhaseOverlays` / `drawDrawPiles`. |
| `view/intro.js` | **Intro cinematika.** Míchání/rozdávání (`_animateIntroShuffle`, `renderIntroScene`, `_renderRoleReveal`, `_renderIntroCharSelect`), pozice bloku soupeře `_introOppSlots` (sdílí i slide-in v `net/handlers.js`) a **navazující hra**: `_introPlaceSurvivors`, `_startKeepReveal`/`_renderKeepChoice`/`_confirmKeepChoice`, `_introKeepAnimateOther`, `_introSheriffReveal`. |
| `view/screens.js` | `renderWinnerScreen()` + `renderCharacterSelectScreen()`. |

### Čisté helpery (`core/`) — BEZ Phaseru/DOM, izomorfní, testované
| Soubor | Export | Co rozhoduje |
|---|---|---|
| `core/distance.js` | `computeDistance`, `computeCanHit` | vzdálenost a dostřel |
| `core/cardRules.js` | `getActionForCard` | jakou akci spustit po výběru karty |
| `core/phaseInfo.js` | `isResponseTurn`, `isPlayTurn`, `canActOnHand` | čí je tah / co smí hráč |
| `core/pending.js` | `pendingActor`, `waitingStatus`, `describePendingResponse` | **na koho a na jaké rozhodnutí hra čeká** (jedna větev na fázi). Jediný zdroj pravdy pro UI štítek, bota (`botPolicy`), log i serverový guard (`server/guard.js`). Vrátí `null` u přechodných fází – kdo to používá jako autoritu, musí `null` ošetřit. |
| `core/playability.js` | `cardPlayability` | smí se karta teď zahrát? |
| `core/selection.js` | `decideCardClick` | reducer kliknutí na kartu → „intent" (bez vedlejších efektů) |
| `core/roles.js` | `rolesForPlayerCount`, `healthForCharacter`, `baseHealthForCharacter` | rozdělení rolí a startovní životy |
| `core/winCondition.js` | `evaluateWinner` | kdo vyhrál z pole hráčů (nebo null) |
| `core/botPolicy.js` | `pendingActor`, `decideBotAction(state, i, beliefs)` | „mozek" bota: na koho hra čeká + jednu akci bota. **Nezná cizí role** – cílí přes `beliefs` (dedukce z chování), takže nestřílí na pravděpodobné spojence. Umí zahrát **všechny karty** (dynamit, zelené DC + jejich aktivace, „odhoď další kartu", aktivní schopnosti Chuck/José/Doc). Znovupoužívá `cardPlayability`/`computeCanHit`/`getActionForCard`. |
| `core/beliefs.js` | `computeBeliefs`, `expectedHostility`, `roleHostility`, `estimateOutlawsAlive` | dedukce skrytých rolí z VEŘEJNÝCH informací (počty rolí, veřejný šerif, mrtví) + ledgeru chování; „očekávaná nepřátelskost" pro cílení (jistý spojenec ≤0, ořez -100 proti paralýze z nejistoty). |
| `core/assetLoad.js` | `shouldRetryAsset`, `isPermanentlyMissing`, `retryAssetUrl`, `missingAssets` | **opakované načtení assetů**: co má smysl zkusit znovu (výpadek spojení / 5xx ano, 4xx ne) a co ještě chybí, než se hra smí sestavit. Používá `preload`/`create` v game.js (registr `AssetLoads`, `ensureAssetsLoaded`) – bez toho Phaser chybný soubor jen přeskočí a hra jede se zelenými placeholdery až do F5. |
| `core/animQueue.js` | `createAnimQueue` | **prezentační fronta klienta**: `card_animation` a `room_update` se nepřehrávají hned při doručení, ale jdou frontou – animace za sebou, stav se aplikuje až doběhne to, co mu předcházelo. Bez ní se na pomalé lince oba eventy slijí a karta „už je v odhozu", zatímco ještě letí. Pořadí = pořadí příjmu (Socket.IO doručuje eventy jednoho socketu v pořadí odeslání), nic se nečísluje. Zaostávání se nekumuluje: víc než jedna čekající animace přes `maxLagMs` → čekající animace se zahodí a dojede poslední stav (plný snímek). Instance + tabulka trvání `ANIM_MS` je v `net/handlers.js`; **při změně `duration` animace srovnej i `ANIM_MS`**. |
| `core/gameLog.js` | `snapshotState`, `formatEvent`, `LogEvent` | čistý formát strukturovaného herního logu: `snapshotState(gs)` = kompaktní stav (role/ruce/board/HP/phase/pendingActor), `formatEvent(evt)` = jednořádkový český popis pro konzoli. Persistenci do souboru řeší `server/gamelog.js`; není v index.html (server-only). |

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
- **Render neumím vizuálně ověřit.** Změny v `view/*`, `positions.js`, intro/menu kódu nejde otestovat automaticky — canvas nevidím. Proto:
  - **Byte-přesné přesuny:** při vytahování kódu do nového souboru se těla funkcí kopírují *znak po znaku*; nový je jen hlavička + místo volání. Před přesunem audit volných proměnných (co tělo používá z okolí).
  - **`ctx`-destructuring pattern** pro sub-renderery: `function drawX(ctx) { const { a, b } = ctx; <byte-přesné tělo> }`, voláno `drawX({ a, b })`. Drží tělo identické a vyhýbá se kolizím v globálním scope.
  - Po úpravě render kódu **požádej uživatele o ověření v prohlížeči** (pravidelně to kontroluje).
- **Verifikace každého kroku:** `node --check <soubor>`, `npm test`, boot serveru (`node server.js`, port 3000), HTTP 200 na změněné soubory.

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

## Testy

- Runner: **vestavěný `node --test`** (zero deps). Spuštění: `npm test`. Soubory: `test/**/*.test.js`.
- Testuje se **`GameState`, `core/*`** (čistá logika) a **`server/*`** (factory s fake `io` – `test/server.*.test.js`), ne render.
- `test/_helpers.js`: `mkGame`/`mkCard`/`give`/`board`/`topDeck`. **Hru stav build ručně** (ne `setupGame` — míchá; ne `setupDebugGame` — `isDebug=true` vypne vyhodnocení výhry).
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
