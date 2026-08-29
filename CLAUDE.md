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
| [fistful-udalosti.md](docs/pravidla/fistful-udalosti.md) | A Fistful of Cards: dva balíčky událostí vedle sebe, krokovaný start tahu (Mrtvý muž, Fistful of Cards, Pokrevní bratři), Laso, Soudce, Léčka, Opuštěný důl, Peyote, Ruská ruleta, Vendeta, Ranč |
| [fistful-pravo-a-strelba.md](docs/pravidla/fistful-pravo-a-strelba.md) | Právo západu (vynucená karta zamyká tah), Odstřelovač, Odražená střela |
| [high-noon.md](docs/pravidla/high-noon.md) | High Noon: Město duchů (duch se vrací na tah), Daltonové, Požehnání/Prokletí, Nová identita, Želízka |
| [pocty-hracu.md](docs/pravidla/pocty-hracu.md) | Hra pro 3 hráče (odkryté role, cíle v kruhu) a pro 8 hráčů (dva odpadlíci) |
| [postavy.md](docs/pravidla/postavy.md) | Slab the Killer, dělení karet mezi víc Vulture Samů, Lucky Duke, odkrytá řada Kita a Clause, Claus / Uncle Will / Johnny Kisch, Pivo při dvou hráčích, Pálenka |
| [intro.md](docs/pravidla/intro.md) | Intro cinematika: co drží pozice, rozdávání rolí a postav, intro navazující hry |
| [rozlozeni.md](docs/pravidla/rozlozeni.md) | Mobilní profil (kompaktní soupeři) a pás vyložených karet |
| [sit-a-assety.md](docs/pravidla/sit-a-assety.md) | Redakce stavu (co klient smí vidět) a bandwidth (WebP, komprese, cache) |

**Nová sekce patří do `docs/pravidla/`, ne sem** — sem jen řádek do téhle tabulky.
Výjimka: pravidlo, na které musí člověk narazit, i když ho nehledá (jako redakce stavu
nebo „nejdřív doběhne efekt") — to sem patří aspoň jako jednořádková pojistka.

## Mapa souborů

### Server (Node)
| Soubor | Co dělá |
|---|---|
| `logic.js` | **Rules engine – assembler (~200 ř.).** Kostra třídy `GameState`: konstruktor, tok tahu (`getCurrentPlayer`, `nextTurn`, `discardCard`, `openStore`, `pickFromStore`, `tryEndTurn`), `getDistance`/`canHit` (delegují do `core/distance`), `checkWinCondition`, `_trackCard`. Nahoře shimy globálů (Node), dole `Object.assign(GameState.prototype, …mixiny)`. Zbytek metod je v `logic/*` (viz níže). **Izomorfní**, re-exportuje entity, pokrytý 149 testy. |
| `logic/entities.js` | Datové/hodnotové třídy: `Card`/`Player`/`Deck` + konstanty `CardType`/`Suits`/`ALL_CHARACTERS`. Bez vazby na `GameState`. Izomorfní (globály v prohlížeči, `require` z logic.js v Node). Re-exportováno z logic.js, takže testy/server importují dál z `logic.js`. **`Deck` je jediná cesta na obě hromádky** – `draw`/`discard`/`returnToTop`/`discardTop`/`takeFromDiscard` nad getery `_drawPile`/`_discardPile`; k tomu tři metody Opuštěného dolu (`drawFromDiscard`/`discardToDrawPile`/`returnToDiscardTop`, viz níže). |
| `logic/setup.js` | **Mixin GameState.** Setup hry a další hry, výběr postav, debug rozdávání: `setupGame`, `setupDebugGame`, `selectCharacter`, `autoSelectAllCharacters`, `startFirstTurn`, `setupNextGame`, `selectCharacterForNextGame`, `rejectCharacterForNextGame`, `_checkNextGameAllChosen`, `debugGiveCard`, `debugRemoveCard`. Připojeno na `GameState.prototype` (viz „Mixin pattern"). |
| `logic/draw.js` | **Mixin GameState.** Fáze lízání: `startDrawPhase`, `_getDrawOptions`, `drawCard`, `_finishDraw` + postavy Kit Carlson (`startKitCarlsonDraw`, `kitCarlsonPick`) a Black Jack (`resolveBlackJack`). `startDrawPhase` je i bodem, kde si **Vera Custer** volí kopírovanou postavu (těsně před lízáním, tedy až PO checku na Dynamit/Vězení) a kde předchozí kopie vyprší – platí přesně jedno kolo. **Kit Carlson odkrývá VŽDY `KIT_REVEAL` = 3 karty**; události High Noon mění jen to, kolik si jich nechá (Žízeň 1, jinak 2) a Příjezd vlaku vůbec ne – kartu navíc si po výběru lízne klasicky z balíčku (`kitExtra` → nová `drawPhaseState`). U **Black Jacka** platí totéž pořadí: karta za Příjezd vlaku se líže úplně nakonec, takže `resolveBlackJack` po ČERNÉ druhé kartě nekončí fázi, dokud `cardsDrawn < cardsNeeded`. |
| `logic/play.js` | **Mixin GameState.** Hraní karet: `playCard` (router efektů), `playBang`, `playSpecialCard` (Vězení/Cat Balou/Panika/Duel/Kulomet/Indiáni), `playBoardCard` (modré i zelené na stůl), `triggerBarrelDraw`, `startBarrelCheck`, `resolveCardSelection`, `_advanceMassAttack`, `waitForMissed`. |
| `logic/combat.js` | **Mixin GameState.** Zranění a smrt: `handleDamage`, `handlePlayerDeath` (Vulture Sam, kill reward, šerif×pomocník), `sidSaveDiscard`, `takeDynamiteHit`. **Výbuch dynamitu nejde přes `handleDamage`** (klikají se 3 zásahy po jednom a není útočník, takže by se spustil El Gringo), proto si líznutí **Barta Cassidyho za každý ztracený život** zařazuje do fronty sám. Po posledním zásahu se fronta musí dobrat PŘED kontrolou Vězení a fází lízání – zařídí to `_startChecksAfterQueue` (větev v `_resumeAfterSpecial`). **`handlePlayerDeath` je jediný trychtýř vyřazení**, takže na jeho prvním řádku sedí hák Terena Killa (`_terenKillCheck`, logic/wildWest.js) – vyřazení se umí pozastavit na sejmutí. |
| `logic/response.js` | **Mixin GameState.** Fáze RESPOND: `handleResponse` (Vedle!/Bang!, duel, hromadné útoky), záchrana posledního života `beerLastLifeSave`/`sidLastLifeSave`, `_advanceAfterLastLifeSave`. |
| `logic/characters.js` | **Mixin GameState.** Schopnosti postav + fronta odložených akcí: `_processSpecialQueue`/`_resumeAfterSpecial`, `checkSuzyLafayette`/`suzyLafayetteDraw`, `bartCassidyDraw`, `elGringoSteal`, `sidKetchumDiscardOne`/`useSidKetchum`, `startLuckyDukeCheck`/`luckyDukePick` + **dělení karet mezi víc Vulture Samů** (`_nextVultureSplitPick`/`_advanceVultureSplit`/`_finishVultureSplit`, viz níže) a **pravidlo „nejdřív doběhne efekt zahrané karty"** (`_pruneSuzyQueue`, viz níže). |
| `logic/checks.js` | **Mixin GameState.** Kontrolní líznutí na začátku tahu (Dynamit/Vězení) a vyhodnocení checků: `handleStartOfTurnChecks`, `triggerCheckDraw`, `_applyCheckResult` (Dynamit/Vězení/Barel/Jourdonnais), `resolveCheck`. |
| `logic/highNoon.js` | **Mixin GameState.** Rozšíření **High Noon** (balíček událostí): `_setupEventDeck` (Pravé poledne vespod), `hasEvent`, krokovaný start tahu `_beginTurn`/`_resumeBeginTurn`/`_runBeginTurn` (9 kroků, viz „Start tahu (Fistful)" níže), `_flipEvent` (jen šerif, až od 2. tahu; nastaví `_pendingHighNoonReveal` pro animaci), `takeNoonHit`, **Daltonové** (`_startDaltons`/`_advanceDaltons`/`_resumeDaltons`/`_daltonsBlueCount`, viz níže) a sdílené dotazy pravidel `_bangLimit`/`_bangBlocked`/`_beerBlocked`/`_turnStep`/**`_effSuit`**. `_turnStep()` = krok pro `nextTurn` (Zlatá horečka jede proti směru, tj. `players.length - 1`); **jediné místo, kde se směr obrací** – posun dynamitu, hokynářství, hromadné útoky, Rvačka i samotní Daltonové zůstávají po směru (FAQ H3). **Kocovina** nemá vlastní metodu: `_applyAbilitiesOnEnter` (vlastní krok startu tahu, hned za odkrytím obou karet a PŘED jejich efekty) při KAŽDÉ výměně události přepíše všem hráčům `p._noAbility`, což čte `effectiveCharacter` (core/distance.js) – a rovnou tam proběhne `checkSuzyLafayette`, takže Suzy s prázdnou rukou líže dřív než Daltonové/Ruská ruleta. `_effSuit(card)` je **jediný zdroj pravdy pro barvu karty** – Požehnání dělá ze všeho srdce, Prokletí piky (hodnota se nemění). Ptají se přes něj checks (Dynamit/Vězení/Barel), Black Jack, Apache Kid a Doc Holyday; nikde jinde se `card.suit` číst nesmí – **jedinou výjimkou je Peyote** (A Fistful of Cards): tip na barvu se schválně vyhodnocuje proti VYTIŠTĚNÉ barvě, jinak by pod Požehnáním/Prokletím každý tip sedl a hráč by si lízl celý balíček (`peyoteGuess` v logic/fistful.js a jeho zrcadlo ve větvi `PEYOTE` v core/botPolicy.js). **Město duchů**: `_teardownGhost()` (konec tahu ducha – volá ho `nextTurn` jako první krok, viz níže). **Přibalené karty** (`options.highNoonExtra`): `_dealSecondIdentities`/`_newIdentityOffer`/`resolveNewIdentity` (Nová identita) a `_startHandcuffs`/`chooseHandcuffsSuit`/`_suitBlocked` (Želízka). |
| `logic/fistful.js` | **Mixin GameState.** Rozšíření **A Fistful of Cards** – DRUHÝ balíček událostí, hraje se SOUČASNĚ s High Noonem (viz „Dva balíčky událostí" níže). `_setupFistfulDeck` (Fistful of Cards vespod), `_flipFistfulEvent`, `_applyFfEventOnEnter`. Dál karty, které nemají domov jinde: **Laso** `_boardDead` (jediný dotaz „karty na stole nemají efekt"), **Soudce** `_judgeBlocks`, **Opuštěný důl** `_startMineTurn`/`_mineDrawCard`/`_mineDiscardEndTurn`, **Peyote** `startPeyote`/`peyoteGuess`, **Ranč** `_startRanch`/`ranchExchange`, **Právo západu** `_lawMark`/`_lawForced`/`_lawLocked`/`_lawSelfShootOnly`, **Pokrevní bratři** `_startBloodBrothers`/`resolveBloodBrothers`, **Fistful of Cards** `_fistfulHits`/`_afterFistfulHit`, **Ruská ruleta** `_startRoulette`/`_advanceRoulette`/`rouletteDiscard`, **Vendeta** `_vendettaCheck`/`_vendettaExtraTurn`, **Mrtvý muž** `_deadManReturnIdx`/`_deadManReturn`, **Odstřelovač** `startSniper`/`_sniperAttack` a **Odražená střela** `playRicochet`/`_ricochetDestroy`. Léčka vlastní metodu nemá – ptá se na ni přímo `computeDistance` (core/distance.js). |
| `logic/wildWest.js` | **Mixin GameState.** Rozšíření **Divoký západ** (Wild West Show) – TŘETÍ balíček událostí. Neodkrývá ho šerif na začátku kola, ale kdokoli zahráním **Dostavníku / Wells Farga** (hák v `playCard`, logic/play.js), takže na začátku hry žádná jeho událost neplatí a karta se mění uprostřed cizí fáze 2. `_setupWwsDeck` (Divoký západ vespod, odkryje se poslední a **už se nevyměňuje**), `_flipWwsEvent(playerIdx, { repeat })` (Krytý vůz sem nechodí – má vlastní `CardType`, FAQ Q16; zopakování efektu Lee Van Kliffem posílá `repeat`, Sciarra Q19), `_applyWwsEventOnEnter`. Slévá se do `hasEvent` (logic/highNoon.js) a `eventActive` (core/highNoon.js). Dál karty, které mají vlastní metodu: **Miláček Valentýn** `_startValentine` (POSLEDNÍ krok krokovače startu tahu – odhodí celou ruku a nastaví fázi lízání `isValentine` s `isStartOfTurn: false`, takže se ho Želízka, Ranč ani Opuštěný důl netýkají; pokračuje se přes `_finishDraw` → `_resumeBeginTurn`) a **Madam Zuzana** `_zuzanaPenalty` (gate úplně nahoře v `nextTurn`, PŘED Vendetou; zásah se kliká přes `pendingDynamiteDamage` s `resume: 'NEXT_TURN'`, počítadlo `p._playedThisTurn` plní `_trackCard`). **Teren Kill** `_terenKillCheck`/`_terenKillResult` – hák úplně nahoře v `handlePlayerDeath` (logic/combat.js), který **pozastaví vyřazení** (hráč se drží na 1 životě) a pošle sejmutí do fronty jako `TEREN_CHECK`. **Sacagaway** vlastní metodu nemá – je to JEDINÁ karta, která místo pravidel mění **redakci stavu** (`redactState` v server/rooms.js pod ní ruce nezakrývá); `_flipWwsEvent` jen označí předěl (`_pendingSacaFlip`), na kterém se cizí vějíře přetočí. **Hřbitov** `_boneOrchardReturn` (krok 0b krokovače startu tahu; k tomu třetí výjimka v `nextTurn`, která vyřazené nepřeskakuje) a **Helena Zontero** `_helenaZontero` (jediný okamžitý efekt v `_applyWwsEventOnEnter`) – obě sdílejí **`_reshuffleRoles`**, jediné místo, kde se mění role za běhu (viz „Přerozdání rolí" níže). **Divoký západ** (karta vespod) vlastní metodu taky nemá – mění jen **podmínku výhry**, takže se na ni ptá `checkWinCondition` (logic.js → `evaluateWinner`, core/winCondition.js) a zrcadlí ji bot v `roleHostility` (core/beliefs.js). **Roubík** `gagSpeak`/`_gagCalm`/`_drainGag`/`gagFlush`/`_gagAtTurnEnd` – jediná karta, která se váže na **chat**: odeslání zprávy stojí 1 život. Pokuta je ODLOŽENÁ (chat chodí asynchronně a trefí libovolnou fázi), takže se jen zapíše do `_gagPending` a vybere se na nejbližším klidném místě – `_processSpecialQueue`, `_resumeAfterSpecial` a nejpozději `nextTurn` (`_gagAtTurnEnd`, jediné místo, kde se vybírá i mimo fázi PLAY). **Lady Růže z Texasu** `useLadyRose`/`_roseSkip`/**`_swapSeats`**/`_remapSeats` – jediná karta, která mění SEDADLA, a sedadlo je v tomhle kódu index do `players`; `_swapSeats` proto kromě prohození dvou prvků pole přemapuje každé číslo ve stavu, které sedadlo znamená (obecným průchodem podle tabulek `SEAT_KEYS`/`SEAT_LIST_KEYS`/`NOT_SEAT_KEYS`, ne ručním výčtem – hlídá to strukturální test). Protějšek na `room` (pořadí `room.players` = `myIndex` klientů, ledger chování, snímek pro hlášky botů) dělá `swapRoomSeats` v server/rooms.js. (Zuřivá Doroty efekt zatím nemá.) Dál sem patří **postavy** rozšíření: `_garyLooterFor` (Gary Looter, hák v `discardCard`), `_johnPainQueueCard`/`_johnPainTakerFor`/`_drainJohnPain` (John Pain – sejmutá karta se jen zapíše a do ruky jde, až doběhne efekt; drain visí na `_pruneSuzyQueue`, pojistka v `nextTurn`/`startDrawPhase`), `_startGrinner`/`grinnerGive`/`_advanceGrinner` (Youl Grinner, fáze `GRINNER_GIVE` úplně na začátku `startDrawPhase`), `useFlintWestwood` (Flint Westwood) a **Lee Van Kliff** `_markBrownPlayed`/`_brownRepeatSpec`/`useLeeVanKliff`/`_repeatBrownEffect` – paměť poslední HNĚDÉ karty (`_lastBrown`, plní ji čtyři háky: `playCard`, `playBang`, `playSpecialCard` a `discardAnotherCard`; nuluje `_beginTurn`, takže platí i pro Vendetin tah navíc) a znovuspuštění jejího efektu. Deskriptor nese i to, jaký cíl opakování potřebuje (`aim`), takže se klient, bot i server ptají jedním predikátem (`lvkOffer`/`lvkTargetOk`, core/playability.js). **Greygory Deck** `_greygoryPool`/`_greygoryDraw`/`_greygoryDealAll`/`_greygoryOffer`/`resolveGreygory` – jediná postava se **dvěma schopnostmi naráz** (proto `hasAbility`, viz core/distance.js); dvojici si líže ze **skutečného balíčku postav** (jen 16 základních a jen ty, jejichž karta je volná), první dostane už při rozdání (`logic/setup.js`) a na začátku každého dalšího tahu se ptá, jestli ji vymění (krok krokovače startu tahu, fáze `GREYGORY_OFFER`). Big Spencer vlastní metodu nemá – jeho zákaz karet Vedle! drží `bigSpencerBlocked` (core/playability.js) a startovní ruku `_startCards` (core/roles.js `startCardsForCharacter`). |
| `server.js` | **Socket.IO bootstrap (~76 ř.).** Express/io setup → poskládá sdílený `ctx` (`require('./server/*')(ctx)` v pořadí rooms→gamelog→ledger→guard→intro→anim→lifecycle→bots) → `io.on('connection')` jen definuje per-connection `withRoom` a zavolá `register*Handlers(socket, ctx, withRoom)` → `server.listen`. Veškerá logika je v `server/*`. |
| `server/rooms.js` | Factory `installRoomService(ctx)` – vlastní `rooms` Map + roomCounter, vystaví na `ctx`: `makeRoom`, `roomPayload`, `broadcastRoom(+Delayed)`, `broadcastLobbyList`, `getLobbyList`, `getGameList`, `findRoomBySocket`, `leaveRoom`, `leaveSpectate`, `disbandRoom`, **`closeRoom`/`roomAlive`** a **`swapRoomSeats`** (Divoký západ – Lady Růže z Texasu: sedadlo je index a `room.players` ho drží ve stejném pořadí jako `gs.players`, proto se výměna míst musí promítnout i sem – spolu s ledgerem chování a snímkem pro hlášky botů). K tomu **`emitChat(room, name, text)`** – jedna zpráva hráčům i divákům; kromě lidského `chat_message` jí mluví i boti (ti reálný socket nemají). Bez listenu → testovatelné s fake io (`test/server.rooms.test.js`). **Rozpuštění místnosti = `closeRoom(room)`, nikdy holé `rooms.delete`**: intro sekvence (`server/intro.js`), odložený broadcast, tick botů, čekání na assety i odpočet navazující hry jsou naplánované timeouty držící referenci na `room` – po pouhém smazání z registru emitovaly dál a hráč, který je zpátky v menu, se z něj překlopil zpátky do zrušené hry („jsem v ní a zároveň nejsem", tlačítko ✕ Ukončit hru). `closeRoom` je všechny zruší a označí místnost za mrtvou; `broadcastRoom(+Delayed)`, `emitIntro*` (intro.js) i `emitAnim*` (anim.js) se pak ptají přes `roomAlive(room)`. **Divák je jen v socket.io kanálu `<roomId>_spectators`, ne v `room.players`** – `findRoomBySocket`/`leaveRoom` ho tedy nevidí a odhlásit ho umí jen `leaveSpectate(socket)` (volá se z `leave_spectate`, `go_to_menu`, `spectate`, `create_room`/`join_room`/`rejoin`/`create_bot_game`). Bez odhlášení mu chodí dál `room_update`/`card_animation`/`intro_phase` a klient ho z menu překlopí zpátky do hry. |
| `server/intro.js` | Factory `installIntroService(ctx)` (bere `io`, `broadcastRoom`) – serverová intro sekvence přes timeouty: `emitIntro`/`emitIntroRole`/`emitIntroChars`, `runIntroSequence`, `introAfterRoles`, `introStartCharPhase`, `introStartDeckPhase`. **Navazující hra** má vlastní vstup `runNextGameIntro` + `introKeepResult` (viz „Intro navazující hry“ níže). **High Noon** má v deck fázi tři beaty v řadě: `highnoon_top` (z kompletního balíčku vyletí vrchní karta a ukáže se – Pravé poledne, ve velikosti balíčků) → `shuffle_highnoon` (zamíchá se zbytek) → `highnoon_bottom` (odložená karta sjede pod hromádku). Test: `test/server.intro.test.js`. |
| `server/anim.js` | Factory `installAnimService(ctx)` (bere `io`, `broadcastRoomDelayed`) – `emitAnim`, `emitDeathAnim` (Vulture Sam vs odhoz), `handleAutoEndTurn`, `handleReshuffleAndBroadcast`, `storeCinematicMs` (časování cinematiky hokynářství = zvednutí + rozdání + míchání; zrcadlí `game.js`, používá ho bot settle i čekání na dojezd míchání). Test: `test/server.lifecycle.test.js`. |
| `server/lifecycle.js` | Factory `installLifecycle(ctx)` (bere `cardData`, `GameState`, `broadcastRoom`, `broadcastLobbyList`, `emitIntro`, `runIntroSequence`) – `startGame`, `startNextGame` (rotující šerif, přenos postav+životů přeživších, spuštění `runNextGameIntro`). Intro přeskakuje jen debug/singleChar/botGame. Test: `test/server.lifecycle.test.js`. |
| `server/gamelog.js` | Factory `installGameLog(ctx)` – **strukturovaný herní log** (JSONL soubor na hru v `logs/<roomId>_<ts>.jsonl` + stručný konzolový mirror). Vystaví `ctx.glog`: `openGame`/`closeGame`, `action` (ingress hráče/bota), `rule` (událost pravidel z `gs._onEvent`), `snapshot` (egress stavu v `broadcastRoom`, dedup), `system`/`error`/`clientLog`. Instaluje se v `server.js` **první** (rooms nastaví no-op fallback `ctx.glog`, gamelog ho přepíše reálným). Nahradil VŠECH ~86 ad-hoc `console.*`. Rules-level události chodí přes injektovaný sink `gs._onEvent` (funkce → JSON.stringify ji zahodí, neuniká do klienta); nastaví lifecycle/debug PŘED setupem. Formát/snapshot řeší izomorfní `core/gameLog.js`. Test: `test/gamelog.test.js`. **Když uživatel hlásí chybu, přečti nejnovější `logs/*.jsonl`.** |
| `server/guard.js` | Factory `installActionGuard(ctx)` – **autorizace herních akcí na hráče**. Vystaví `ctx.guardedOn(socket)` = náhrada za `socket.on` pro `handlers.game.js`/`handlers.characters.js`. Handlery čtou aktéra ze STAVU, ne z odesílatele, takže bez guardu posunul hru každý příchozí event (na pomalé lince dvojklik na „Ukončit tah" přeskočil několik hráčů, opožděný klik vybral kartu za jiného hráče). Guard porovná seat odesílatele s `pendingActor(gs)` (core/pending.js); nesedící akci zahodí, zaloguje (`glog.reject`) a pošle `action_rejected` (klient si odemkne UI). Výjimky: akce mimo pořadí (Sid Ketchum) se kontrolují jen na „hraje za sebe"; debug hra (jeden socket = všechna místa) se přeskakuje; `pendingActor === null` propouští. Navíc `select_target_card` nese `targetIdx` (pro KOHO se vybírá) – u Rvačky/dělení mezi Vulture Samy zůstává aktér stejný a mění se jen cíl, takže opožděný klik by jinak vybral kartu dalšímu hráči. Test: `test/server.guard.test.js`. |
| `server/ledger.js` | Factory `installLedger(ctx)` – **veřejný ledger chování** (`room.behaviorLedger`): kdo na koho útočil / koho léčil. `recordBehavior`/`initLedger`. Handlery (`play_bang`/`play_special`/`doc_holyday`/`activate_green_card`/`discard_extra_choose`) ho plní; bot z něj přes `core/beliefs.js` dedukuje skryté role. Mimo broadcastovaný `gameState`. Reset při startu hry (lifecycle). Test: `test/server.ledger.test.js`. |
| `server/bots.js` | **Počítačoví hráči.** Factory `installBotService(ctx)` – bot = bezhlavý klient přes „fake socket" se stejnými handlery jako člověk (`register*Handlers`). Driver `runBotTickOnce`/`scheduleBotTick` po každém broadcastu (hook `ctx.afterBroadcast` v rooms.js) i intro emitu (`ctx.afterIntroEmit` v intro.js) zjistí přes `pendingActor`, zda se čeká na bota, spočítá `beliefs` (z `room.behaviorLedger`) + akci `decideBotAction` a vystřelí ji handlerem (1:1 reuse animací). `createBot`/`removeBot`, stall guard. **Intro gate:** během intra (`room._introPlaying`, nastaví lifecycle, sundá intro.js na `'done'`) bot herní akce (líznutí/karty) NEDĚLÁ – jen výběr postav; po startu hry navíc `room._botStartupSettle` dá první herní akci delší pauzu (`startupSettleMs`), ať hráč vidí, co bot zahraje. **Hlášky do chatu:** `flushBotQuips` (hák `beforeBroadcast`) diffne stav proti `room._quipSnap`, nechá si od `core/botChat.js` vrátit větu a pošle ji přes `ctx.emitChat`; pod Roubíkem si za ni bot rovnou zapíše pokutu (`gs.gagSpeak`, žádná výjimka pro boty). Test: `test/server.bots.test.js` (vč. zátěže „hra jen botů doběhne" a balíčku samých Roubíků). |
| `server/version.js` | Factory `installVersion(ctx)` – **otisk nasazeného kódu** (`ctx.buildId` = sha1 obsahu `*.js/json/html/css` v kořeni + `core/logic/view/net/server`, bez assetů a lockfile). Server ho pošle každému socketu hned po připojení (`server_version`); klient si první hodnotu zapamatuje a po reconnectu porovná – změna = na server se nahrála nová verze → banner „načti stránku znovu" (`showUpdateBanner` ve `view/menu.js`). Otisk je z obsahu, ne z času startu, takže restart/pád beze změny kódu hlášku nevyvolá. Test: `test/server.version.test.js`. |
| `server/handlers.*.js` | Socket handlery podle subsystému: `register*Handlers(socket, ctx, withRoom)`, těla berou helpery z `ctx`. **lobby** (místnosti/spectate/chat/disconnect + `add_bot`/`remove_bot`/`create_bot_game` = hra jen botů ke sledování), **nextgame** (výběr postav/intro OK/další hra), **game** (herní akce + Kit/Lucky/Barel/Sid/dynamit/pivo/store), **characters** (Bart/El Gringo/Suzy/checky/Black Jack), **debug** (debug_*; výběr postav v debug hře MUSÍ končit `_beginTurn()` jako `logic/setup.js` – jinak se nezapočítá první tah a události High Noon/Fistfulu se odkryjí až o kolo později). Eventy: `test/server.handlers.test.js`; integrace: `test/server.integration.test.js`. |
| `cards.json` | Data všech karet (jména, typy, hodnoty). Načítá server i testy. Balíčky událostí mají vlastní soubory: `cards.high_noon.json`, `cards.fistful.json`, `cards.divoky_zapad.json` (id 500–509). |

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
| `core/distance.js` | `computeDistance`, `computeCanHit`, **`hasAbility`/`abilitiesOf`**, `effectiveCharacter`, **`isInPlay`** | vzdálenost a dostřel + **které schopnosti hráči právě platí** a **kdo je vůbec ve hře**. **`hasAbility(p, "Jméno")` je jediný trychtýř všech ~85 kontrol „umí X?"** (v `logic/*`, `core/playability.js`, `core/botPolicy.js` i `view/board.js`; `abilitiesOf(p)` vrací celý seznam): prázdno při Kocovině (`p._noAbility`), jinak `p._copiedCharacter || p.character` – a u **Greygoryho Decka** (Divoký západ) jeho líznutá **dvojice** `p._greygoryChars`. Dotaz nesmí jít přes rovnost jednoho jména, jinak Greygorymu nesedne nikdy (hlídá strukturální test v `test/wws.greygory.test.js`). `effectiveCharacter(p)` zůstává vedle pro to, kde jde o JEDNU postavu k **zobrazení** (portrét, overlay volby kopie, štítek, `CHAR_RANK` bota) – tam se se jménem neporovnává. Max. životy (`healthForCharacter`) a portrét čtou `p.character` napřímo, takže se Kocovinou nemění. `isInPlay(p)` = `health > 0 || p._ghost` – duch (Město duchů) má 0 životů, ale na svůj tah sedí zase v kole (vzdálenost, hokynářství, hromadné útoky, Vulture Sam). Prosté `health > 0` zůstává tam, kde jde o skutečný život (léčení, Greg Digger, poslední život). Ptá se jím i klient, komu ještě probliká portrét (`registerVeraPortrait` – vyřazená Vera Custer už nekopíruje, zůstane Vera; duch probliká dál). Problikávající portrét si přitom drží obarvení, které měl (`baseTint` v `_tickVeraPortraits`) – hráč na tahu je zelený i ve chvíli, kdy je na jeho místě vidět kopírovaná postava. |
| `core/layout.js` | `computeStage`, `stageCoverSize`, `LAYOUT_PROFILES`, `getLayout`, **`currentLayout`**, `pickLayoutProfile`, **`resolveLayout`**, `stretchAnchors`, `boardRowLimit`, **`myHandRow`/`myHandSlotX`**, **`compactMetrics`/`compactAnchors`/`compactBoardPos`/`compactHandPos`**, **`oppScale`/`handCardScale`**, **`boardBand`/`boardSlot`**, **`livesTrack`/`livesSlot`** | **jeviště + profil rozložení**. `computeStage(vw,vh)` = velikost plátna v design px podle SKUTEČNÉHO poměru stran: základ 1920×1080 zůstává souřadnicovou soustavou, ale plátno se natáhne do poměru displeje (strop 2560×1440) a kamera se posune o půlku přírůstku (`applyStage` v game.js), takže se souřadnicemi 0…1920/0…1080 se nehne – jen po stranách přibude plocha (`stageLeft/Right/Top/Bottom`). Zaokrouhluje se dolů, takže **měřítko obsahu zůstává identické**; mizí jen mrtvé pruhy (telefon na šířku ~18 % šířky, okno prohlížeče na PC taky). Pozadí a všechny celoobrazovkové překryvy se proto kreslí na `stageW()/stageH()` (resp. `stageCoverSize()`) a nálety „zpoza okraje" startují za okrajem JEVIŠTĚ. `currentLayout()` = profil rozložení desky (`App.layout`, mimo prohlížeč vždy desktopový) – jediný zdroj geometrie pro `view/board.js` i `positions.js`, které se dřív musely shodovat ručně. **`resolveLayout(profil, jeviště)`** (volá `applyStage`, výsledek jde do `App.layout`) dopočítá to, co se má **lepit na okraj**: konec mé ruky (`handEndX = stage.right − handEndMargin`) a počet vyložených karet v jedné řadě mého stolu (`boardRowLimit` – rostou doleva od karty role, takže je omezuje levý okraj). `stretchAnchors` totéž dělá s kotvami soupeřů (volá ji `getOpponentAnchors`): krajní zůstanou `oppEdgeMargin` od okraje JEVIŠTĚ, prostřední se mezi ně rovnoměrně rozestoupí, střed zůstává středem. **Na 16:9 jsou obě identita** (`resolveLayout` vrací týž objekt), takže PC ve fullscreenu je pixelově dnešní stav. Rohové ovládání (Zpět, ⚙ DEBUG, Ukončit hru, debug sloupec) a prahy „která je to strana" v `view/intro.js` se proto kotví přes `stageLeft/Right/Top/Bottom`, ne přes 0/1920. **`myHandRow(L, počet)`** = začátek a rozteč MOJÍ ruky ve vodorovném pásu `handStartX…handEndX` (to jsou STŘEDY krajních slotů) – jediný zdroj pro `drawMyArea`, `positions.js` i intro. `handAlign` řídí zarovnání: desktop `'left'` (dnešní stav), mobil `'center'`, protože pás jde přes celou šířku jeviště a pár karet by se krčilo v rohu. **Mobilní profil (`oppMode: 'compact'`) navíc nese kompaktní řadu soupeřů** – viz „Kompaktní soupeři" níže. **`boardBand`/`boardSlot`** = pás vyložených karet s pevným počtem slotů (viz „Pás vyložených karet" níže). **`oppScale(L, n)` závisí na POČTU soupeřů i v okruhu** (`oppScaleByCount`): při 7 soupeřích (8 hráčů) stojí nahoře tři skupiny vedle sebe, takže se karty zmenší z 0,27 na 0,25. Ptát se proto vždy přes `oppScale`, nikdy na `L.scaleOpp` napřímo – platí to i pro `positions.js`. **`livesTrack(maxHealth, scale, maxCards)`** = dráha, po které jezdí portrét po kartě životů. Karta má 5 nábojů, takže postavy Divokého západu nad 5 životů (Big Spencer 9, jako šerif 10; Gary Looter 5/6) dostanou v ose pohybu portrétu DRUHOU kartu a dvojice se chová jako jedna dráha o 10 slotech (`cardOff` = 5 × `step`, karty se o 0,07 výšky překrývají, aby rozestup nábojů zůstal stejný). Do 5 životů vrací pixelově dnešní stav. `maxCards: 1` je pro kompaktní sloupec soupeře (mobil) – ten je široký přesně jednu kartu, takže se dráha nedělí, portrét se zastaví na 5. slotu (`livesSlot`) a přebytek se dopíše číslem (`counter`). Ptají se jím `view/board.js` (všechny čtyři větve okruhu, moje zóna, divák, kompaktní sloupec) a `view/intro.js` (`_introOppSlots`, `MY_LIVES2_Y`); `positions.js` se nemění – druhá karta roste směrem, kterým sloty vyložených karet nerostou. Daň zvolené varianty: portrét při 9–10 životech zajede přes spodek odhazovacího balíčku (jen Big Spencer u plného zdraví), samotné karty dráhy na balíčky nedosáhnou nikdy (hlídají testy). |
| `core/cardRules.js` | `getActionForCard`, **`isBlueCard`** | jakou akci spustit po výběru karty + **co je modrá karta**. `isBlueCard` je jediný zdroj pravdy pro schopnost Josého Delgada (server `logic/characters.js`, klient `view/board.js`, bot `core/botPolicy.js`) – **Vězení a Dynamit jsou modré** (Vězení se jen vykládá před soupeře), zelené karty Dodge City mají vlastní typy + `green: true`, takže sem nespadají. |
| `core/phaseInfo.js` | `isResponseTurn`, `isPlayTurn`, `canActOnHand` | čí je tah / co smí hráč |
| `core/pending.js` | `pendingActor`, `waitingStatus`, `describePendingResponse` | **na koho a na jaké rozhodnutí hra čeká** (jedna větev na fázi). Jediný zdroj pravdy pro UI štítek, bota (`botPolicy`), log i serverový guard (`server/guard.js`). Vrátí `null` u přechodných fází – kdo to používá jako autoritu, musí `null` ošetřit. |
| `core/playability.js` | `cardPlayability`/**`nativePlayInTurn`**/**`turnActionForCard`**, **`playsAsBang`/`playsAsMissed`/`showdownBangOk`/`preacherBlocks`**, `lawForcedCard`/`lawSelfShootOnly`/`lawLocksOther`, `rouletteDiscardable`/`rouletteHasCard`, `bangCardFromHand`/`bangLimitFree`/`bangAtPlayerOk`, `ricochetOffer`/`ricochetTargetOk`/`ricochetAvailable`, `sniperOffer`, **`lvkRepeat`/`lvkPayOk`/`lvkTargetOk`/`lvkOffer`**, **`roseRightNeighbor`/`roseSwapOffer`** | smí se karta teď zahrát? Sem patří **každé pravidlo, které se musí ptát server, klient i bot naráz** – rozejít se nesmí, jinak server akci mlčky odmítne, bot ji pošle znovu a hra se zasekne. Fistful si sem přidal Právo západu (co hráče drží v tahu), Ruskou ruletu (co se počítá za „kartu Vedle!") a Odstřelovače/Odraženou střelu (co se počítá za „kartu Bang!" a kam s ní smí letět). **Divoký západ – Zúčtování** přidal čtveřici, která je JEDINÝM zdrojem pravdy pro „co se počítá za kartu Bang! / Vedle!": `playsAsBang`/`playsAsMissed` (Calamity Janet, Elena Fuente i Zúčtování na jednom místě – dřív deset ručně srovnávaných podmínek), `showdownBangOk` („smí se TOUHLE kartou vystřelit, i když kartou Bang! není") a `preacherBlocks` (Kazatel zakazuje KARTU Bang!, ne roli, ve které se hraje). K tomu **`nativePlayInTurn`** = „smí se karta zahrát ve své VLASTNÍ roli?" (vytažené z `cardPlayability`, protože pod Zúčtováním je hratelná i karta, jejíž vlastní akce nedává smysl) a nad ním **`turnActionForCard`** = jakou akci karta ve vlastním tahu spustí. **Kdo nabízí vlastní akci karty (klient `decideCardClick`, bot `decidePlay`/`forcedLawIntent`, Právo západu), MUSÍ se ptát těmi dvěma** – jinak pošle akci, kterou server mlčky odmítne, a hra jen botů se zasekne. |
| `core/selection.js` | `decideCardClick` | reducer kliknutí na kartu → „intent" (bez vedlejších efektů) |
| `core/roles.js` | `rolesForPlayerCount`, `healthForCharacter`, `baseHealthForCharacter`, **`startCardsForCharacter`**, **`roleNameCz`/`ROLE_CZ`**, **`TARGET_3P`/`isThreePlayerMode`**, **`firstPlayerIndex`** | rozdělení rolí (**3–8 hráčů**), startovní životy a **český název role** – role se v kódu i ve stavu jmenují anglicky, hráč je ale nikde nesmí vidět anglicky (debug, statistiky, výběr postavy). **`startCardsForCharacter(jméno, base)`** = kolik karet postava dostane na začátku (skoro vždy = životy; JEDINÁ výjimka je Big Spencer – 9 životů, 5 karet). Ptá se jím skutečné rozdání (`logic/setup.js` → `_startCards`) i animace rozdávání v intru (`server/intro.js`); rozejít se nesmí. **`firstPlayerIndex(players)`** = kdo je na „šerifově pozici" (začíná hru, od něj jdou po směru efekty karet, na jeho tah se odkrývá karta High Noon) – šerif, a ve hře pro 3 pomocník. `TARGET_3P`/`isThreePlayerMode` viz „Hra pro 3 hráče" níže. |
| `core/winCondition.js` | `evaluateWinner(players, opts)`, `evaluateWinner3p` | kdo vyhrál z pole hráčů (nebo null). Za živého se počítá i duch (`_ghost`, Město duchů) – FAQ H7. `opts = { mode3p, winClaimIdx }` přepne na pravidla pro 3 hráče (viz níže); **`opts.lastManStanding`** (Divoký západ – karta vespod balíčku) přebíjí OBOJÍ: vyhrává poslední živý a vrací se JMÉNO hráče, ne role – výhra je individuální, smrt šerifa hru nekončí a cíle v kruhu přestávají platit. Odpadlík vyhrává jen jako JEDINÝ žijící, takže **při 8 hráčích (dva odpadlíci) dá mrtvý šerif proti dvěma živým odpadlíkům výhru banditům** – přesně jak pravidlo pro 8 říká. |
| `core/botPolicy.js` | `pendingActor`, `decideBotAction(state, i, beliefs)` | „mozek" bota: na koho hra čeká + jednu akci bota. **Nezná cizí role** – cílí přes `beliefs` (dedukce z chování), takže nestřílí na pravděpodobné spojence. Umí zahrát **všechny karty** (dynamit, zelené DC + jejich aktivace, „odhoď další kartu", aktivní schopnosti Chuck/José/Doc). Znovupoužívá `cardPlayability`/`computeCanHit`/`getActionForCard`. **Karty na stole má obodované (`boardCardValue`) podle toho, jestli MAJITELI pomáhají, nebo škodí**: Vězení/Dynamit nepříteli nesundá (pomohl by mu – proto si ani nezahodí vlastní Vězení Cat Balouem hned po zahrání), spojenci je Rvačkou naopak sundá přednostně; `_hasWorthTaking` takové „hodnoty" nepočítá, takže se na ně ani necílí. Zbraně: max **jedna za tah** (`weapon._playedTurn === turnId`), z ruky ta nejlepší podle `weaponValue` (Volcanic = 2.5, ne dostřel 1); zbraň, která teprve odemyká lepší cíl (`weaponUnlocksTarget`), se vykládá **před** střelbou. Úplně první v tahu jdou karty za víc karet (`cardDrawGain`: Dostavník 2, Wells Fargo 3, Pony express 3) – co si bot lízne, může ještě ten tah zahrát; stejná hodnota drží i `keepScore`, aby jimi neplatil za Rvačku a bral si je v hokynářství. Ponechání postavy do navazující hry je náhodné (`decideKeepCharacter`, šance dle `CHAR_RANK`); i výběr na začátku hry je náhodný (`chooseCharacter`, lepší postava ze `BETTER_CHAR_P` = 60 %), jen Vera Custer kopíruje deterministicky (`pickCharacter`). **`CHAR_RANK` musí znát každou postavu ze všech rozšíření** – neznámá spadne na 0 a bot si ji nikdy nevybere (hlídá to test). **Cílení (`rankEnemies` → `shootTargets`):** pořadí je „nejnepřátelštější → nejvíc ZRANĚNÝ → rotace". Uvnitř jednoho pásma nepřátelskosti (`HOSTILITY_TIE`) se nerozhoduje podle životů – postavy se 3 životy od přírody by jinak schytaly všechno hned na začátku – a rotace (tah + počet výstřelů) rozkládá palbu, takže tři Bang! Willyho the Kid neskončí v jednom hráči. **Na zásah** (Bang!, Odstřelovač, Duel, Springfield, zelené bang-karty, Doc Holyday) se navíc ptá `shootTargets`, které vyhodí cíle s `allyRisk > FRIENDLY_FIRE_MAX` – bez informace se prostě nestřílí (šerif v 5 hráčích čeká, až mu ledger někoho usvědčí). Krádeže brzdu nemají, ty se přežít dají. **Nouzové cílení:** když práh `ENEMY_EPS` nepřekročí NIKDO, propustí se i záporná nepřátelskost (pořadí zůstává „od nejpravděpodobnějšího nepřítele"), jen s podmínkou `enemyProbability >= DESPERATE_ENEMY_P` – a s `list.desperate` se vypne i brzda proti přátelské palbě, jinak by koncovka nikdy neskončila. Bez toho se koncovka „šerif + pomocníci vs. odpadlík" zasekne: nepřítelem je každý jen z 1/3, takže by strana šerifa nikdy nezaútočila a boti by jen lízali a odhazovali. Jistý spojenec (šance 0) zůstává nedotknutelný vždy. **A Fistful of Cards** přidal větve `PEYOTE`/`RANCH`/`BLOOD_BROTHERS`/`CLAUS_GIVE`/`ROULETTE_DISCARD` a v `PLAY` volbu mezi obyčejným výstřelem, Odstřelovačem (nepřítel s ≤ 2 kartami) a Odraženou střelou (`bestRicochetShot` = nejcennější vyložená karta nepřítele; Vězení ani Dynamit se nestřílí). **Že žádná větev nechybí, hlídá strukturální test** „každý kind z pendingActor má v decideBotAction svou větev" (test/botPolicy.test.js). |
| `core/beliefs.js` | `computeBeliefs`, `expectedHostility`, **`enemyProbability`**, `roleHostility`, `estimateOutlawsAlive` | dedukce skrytých rolí z VEŘEJNÝCH informací (počty rolí, veřejný šerif, mrtví a jednou odhalení – `_roleRevealed` drží roli i po návratu Mrtvého muže do hry, stejné pole čte redakce stavu) + ledgeru chování; „očekávaná nepřátelskost" pro cílení (jistý spojenec ≤0, ořez -100 proti paralýze z nejistoty). `enemyProbability` = neváženě „jaká je šance, že je to nepřítel" – pojistka nouzového cílení (viz `rankEnemies`), aby se ani v koncovce nesáhlo na JISTÉHO spojence. |
| `core/assetLoad.js` | `shouldRetryAsset`, `isPermanentlyMissing`, `retryAssetUrl`, `missingAssets` | **opakované načtení assetů**: co má smysl zkusit znovu (výpadek spojení / 5xx ano, 4xx ne) a co ještě chybí, než se hra smí sestavit. Používá `preload`/`create` v game.js (registr `AssetLoads`, `ensureAssetsLoaded`) – bez toho Phaser chybný soubor jen přeskočí a hra jede se zelenými placeholdery až do F5. |
| `core/animQueue.js` | `createAnimQueue` | **prezentační fronta klienta**: `card_animation` a `room_update` se nepřehrávají hned při doručení, ale jdou frontou – animace za sebou, stav se aplikuje až doběhne to, co mu předcházelo. Bez ní se na pomalé lince oba eventy slijí a karta „už je v odhozu", zatímco ještě letí. Pořadí = pořadí příjmu (Socket.IO doručuje eventy jednoho socketu v pořadí odeslání), nic se nečísluje. Zaostávání se nekumuluje: víc než jedna čekající animace přes `maxLagMs` → čekající animace se zahodí a dojede poslední stav (plný snímek). Instance + tabulka trvání `ANIM_MS` je v `net/handlers.js`; **při změně `duration` animace srovnej i `ANIM_MS`**. Dokud fronta něco drží (`animQueueBusy()`), letící sprite se nevzdá držení na cíli (`holdThenFinish` v game.js) – jinak by dlouhá cinematika zařazená mezi let a jeho stav (vězení do odhozu → odkrytí karty High Noon) nechala sprite zaniknout dřív, než stav dorazí, a karta by problikla zpátky na původní místo. |
| `core/deathAnim.js` | `DEATH_ANIM`, `deathAnimTimeline`, `deathSequenceMs`, `deathFallMs`, `deathRevealMs`, `penaltyDiscardMs` | **časování cinematiky vyřazení hráče** (pokles na 0 životů → pauza → karty odlétají po jedné → postava se posune vedle místa role → rubová karta role letí doprostřed, překlopí se, vydrží a odletí na místo). Jediný zdroj pravdy: klient ji přehrává (`net/handlers.js` `playDeathSequence`, fáze drží `App.deathSeq`/`App.deathHandHide`, board.js podle nich kreslí), server o stejnou dobu drží boty (`room._deathBlockUntil` v `server/anim.js`, respektuje `scheduleBotTick`). Stav se do konce sekvence nepustí – animace jde frontou jako `essential` (nezahoditelná). **Varianty:** `skipReveal` (šerif roli neodhaluje – zná ji celý stůl, sekvence končí odhozením karet); `deathFallMs`+`deathRevealMs` = sekvence rozpůlená dělením karet mezi víc Vulture Samů; `penaltyDiscardMs` = šerifova ztráta karet za zabití pomocníka (stejné odhazování, ale bez poklesu životů, bez role a Colt .45 zůstává). |
| `core/drawCounter.js` | `nextDrawCounters` | **počítadlo naklikaných, ještě nepotvrzených líznutí** (`App.pendingDrawCount`/`lastConfirmedDrawn`/`lastDrawOwner`/`lastDrawId`). Drží dva rychlé kliky na balíček a zároveň brání kliku navíc. Klíčové je, že počítadlo patří JEDNÉ fázi lízání a při předělu (DRAW → jiné DRAW) se nuluje – jinak vyjde „zbývá ≤ 0", balíček nejde rozkliknout a hra uvázne. Předěl pozná **`drawPhaseState.drawId`** (přiděluje ho `GameState._setDrawPhase`, jediná cesta, jak se fáze lízání zakládá – **nová se nesmí přiřadit napřímo**): navazující lízání téhož hráče (Herb Hunter 2 + odměna za banditu 3, návrat Mrtvého muže 2 + vlastní fáze lízání) má `playerIdx` stejný a `cardsDrawn` v obou 0, takže se jinak nepozná – oba broadcasty jsou odložené o dobu animace a doručí až ten druhý stav. |
| `core/botChat.js` | `botQuip`, `quipEvents`, `quipSnapshot` | **hlášky botů do chatu**. Spouštěčem je herní událost, ne časovač: `quipEvents(prev, state)` je odvodí DIFFEM dvou snímků stavu (zásah / těžký zásah / poslední život / vyléčení / Vězení / výbuch dynamitu / vyřazení soupeře), takže se pravidel nedotkne ani řádek. `botQuip` pak vrátí jednu větu, nebo `null` – drží ji malá šance na událost a strop „nejvýš jedna hláška za 4 tahy na bota“ (aby to bylo koření, ne ukecaný stůl a spam v zátěžových testech). Sada vět je DATA (pole na spouštěč). **Bot na 1 životě pod Roubíkem mlčí** – politika bota, ne pravidlo. Emit řeší `flushBotQuips` (server/bots.js, hák `beforeBroadcast`); server-only, není v index.html. |
| `core/gameLog.js` | `snapshotState`, `formatEvent`, `LogEvent` | čistý formát strukturovaného herního logu: `snapshotState(gs)` = kompaktní stav (role/ruce/board/HP/phase/pendingActor), `formatEvent(evt)` = jednořádkový český popis pro konzoli. Persistenci do souboru řeší `server/gamelog.js`; není v index.html (server-only). |
| `core/highNoon.js` | `eventActive`, `bangLimitFor`, `bangBlockedFor`, `beerBlockedFor`, `effSuit`, `suitBlockedFor`, **`boardDeadFor`/`judgeBlocksFor`** | **zrcadlo dotazů na aktivní událost nad prostým JSON stavem** – ptá se VŠECH TŘÍ balíčků (High Noon, A Fistful of Cards i Divoký západ), klíče karet jsou napříč nimi unikátní – server se ptá přes `GameState.hasEvent`/`_effSuit`, klient (`core/playability.js`, `view/*`) a bot (`core/botPolicy.js`) přes tenhle helper. `effSuit(state, card)` = barva, která PLATÍ (Požehnání srdce / Prokletí piky). `suitBlockedFor(state, i, card)` zrcadlí Želízka (`GameState._suitBlocked`), `boardDeadFor` Laso (`_boardDead`) a `judgeBlocksFor` Soudce (`_judgeBlocks`). |
| `core/highNoonAnim.js` | `HN_ANIM`, `hnRevealMs`, `NI_ANIM`, `niResultMs` | **časování odkrytí karty události High Noon** + dojezdu Nové identity (`niResultMs(take)`; drží ho `room._niBlockUntil` a fronta animací) (pauza `preMs` → let z balíčku doprostřed → výdrž na rubu → překlopení → výdrž lícem → zmenšení na místo platné karty). Jediný zdroj pravdy: klient ji přehrává (`net/handlers.js` `high_noon_reveal`), server o stejnou dobu drží boty (`room._hnBlockUntil`) a fronta si podle `hnRevealMs()` spočítá zdržení stavu. Animace nese i `playerIdx` (šerif je na tahu už během odkrývání – stav dorazí až po ní) a `remaining` (balíček ubývá se startem letu → `App.hnDeckLeft`, ne až se stavem; jinak by u poslední karty zůstal ležet prázdný rub). |
| `core/fistfulAnim.js` | `MINE_ANIM`/`mineLandMs`, `PEYOTE_ANIM`/`peyoteRevealMs`, `LAW_ANIM`/`lawRevealMs` | **časování cinematik A Fistful of Cards**: doběh letu do „odhozu" pod Opuštěným dolem (dosednutí lícem nahoru → výdrž → překlopení na rub), odkrytí karty u Peyote a veřejné ukázání vynucené karty Práva západu. Jediný zdroj pravdy pro klienta (`net/handlers.js`, `game.js`), frontu animací (`_animDurationMs`) i serverové držení botů (`room._mineBlockUntil` v `server/anim.js`). |
| `core/wwsAnim.js` | `SACA_FLIP`/`sacaFlipMs`, `SACA_STEAL`/`sacaStealPreMs`/`sacaStealPostMs`/`sacaStealExtraMs`, **`HELENA_ANIM`/`helenaRevealMs`**, **`ROLE_SHUFFLE`/`roleShuffleOpts`/`roleShuffleMs`**, **`ROLE_PEEK`/`rolePeekMs`**, **`SEAT_SWAP`/`seatSwapMs`** | **časování cinematik Divokého západu**: přerozdání rolí (Helenino sejmutí, veřejné sesbírání + riffle + rozdání karet rolí, soukromé nahlédnutí na vlastní novou roli – `roleShuffleMs` si riffle bere z `core/shuffleAnim.js`, jen kratší) a obě půlky Sacagaway: vlna přetáčení všech cizích vějířů při příchodu/odchodu karty (`sacaFlipMs(počty karet v rukou)`) a gesto z FAQ Q17 před krádeží z odkryté ruky (ruka lícem dolů → sesbírání → zamíchání → rozprostření → náhodná karta → ruka zase lícem nahoru). Jediný zdroj pravdy pro klienta (`playSacaFlip`/`_sacaHandGesture` v net/handlers.js), frontu animací (`_animDurationMs`) i serverové držení botů (`room._wwsBlockUntil`, `flushSacaFlip`/`holdForSacaSteal` v server/anim.js). |
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
  Jediná karta, která redakci mění, je **Sacagaway** (Divoký západ) – pod ní jdou ruce ven
  odkryté, všechno ostatní se skrývá dál.
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
  každou rizikovou kartu událostí.
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

## Rozšíření Divoký západ (Wild West Show) — rozpracované

Hotové jsou **fáze 0–11**: balíček je ve hře, **devět z deseti karet událostí** už něco
dělá (včetně té vespod) a **všech osm postav má schopnost**. Zbývá poslední fáze 12:
Zuřivá Doroty.
Pořadí dalších fází a co která
karta potřebuje najdeš v [docs/wild-west-show-plan.md](docs/wild-west-show-plan.md) —
je tam karta po kartě, kde je hák, co se musí měnit spolu a jaké testy to má mít.
Pravidlový podklad (texty karet, oficiální FAQ Q01–Q18, Sciarrovo FAQ) leží v
[docs/wild-west-show.md](docs/wild-west-show.md), staženými PDF vedle.
**Zdroj pravdy pro chování karty je český text vysázený na artu**, ne anglické FAQ.

Co už platí (fáze 0):

- **Událost neotáčí šerif, ale kdokoli zahráním Dostavníku nebo Wells Farga**
  (`_flipWwsEvent` volaný z `playCard`, [logic/play.js](logic/play.js)). Krytý vůz má
  vlastní `CardType`, takže jí neprojde (FAQ Q16), a zopakování efektu ji posílá
  s `{ repeat: true }` (Sciarra Q19). Na začátku hry proto **žádná událost tohoto
  balíčku neplatí**.
- Je to **třetí balíček vedle High Noonu a Fistfulu** (`wwsDeck`/`wwsPile`/`activeWws`,
  mixin [logic/wildWest.js](logic/wildWest.js), data `cards.divoky_zapad.json`, id 500–509).
  Slévá se jen v `hasEvent` a `eventActive` — všechna tři rozšíření jdou zapnout naráz.
- Karta **Divoký západ** leží vespod balíčku a po odkrytí se **už nevyměňuje**.
- **Zúčtování** (fáze 2) je hotové: každá karta smí jít jako Bang! a každá karta Bang!
  i jako Vedle!. Obě věty jsou POVOLUJÍCÍ – karta si svou vlastní akci ponechává, takže
  se v UI na výstřel přepíná tlačítkem `💥 ZAHRÁT JAKO BANG!` (`selectedState.showdown`,
  slot tlačítek schopností ve `view/board.js`). Rozhoduje o tom pětice predikátů
  v `core/playability.js` (viz řádek výš).
- **Sacagaway** (fáze 2b) je hotová. „Všichni hráči hrají s odhalenými kartami v ruce
  (vyjma svých rolí)" – **jediná karta hry, která mění redakci stavu, ne pravidla**.
  Z ruky se pořád bere NÁHODNĚ (FAQ Q17), takže se `resolveCardSelection` nezměnilo o řádek;
  krádež z odkryté ruky si ten fyzický postup jen přehraje (ruka lícem dolů → zamíchání →
  náhodná karta → ruka zase lícem nahoru, `core/wwsAnim.js`). Příchod i odchod karty je
  předěl, na kterém se cizí vějíře **plynule přetočí** (`saca_flip`), a lety karet se
  odkryté ruce přizpůsobí (`revealFromHand`/`hideIntoHand` v net/handlers.js).
- **Pět postav** (fáze 4) je hotových: **Big Spencer** (9 životů, 5 startovních karet,
  nesmí hrát KARTY Vedle! – `bigSpencerBlocked` v `playsAsMissed`, takže Barel,
  Jourdonnais, zelené Vedle! i Úhyb fungují a pod Zúčtováním smí jako Vedle! kartu
  BANG!), **Gary Looter** (hák ve fázi 3 `discardCard`, vyhrává nad Opuštěným dolem),
  **John Pain** (sejmutá karta se zapíše a přesune až po doběhnutí efektu),
  **Youl Grinner** (vlastní fáze `GRINNER_GIVE` před lízáním) a **Flint Westwood**
  (1×/tah výměna 1 karty za 2 náhodné; pořadí ber → dej → Suzy, Sciarra Q32).
- **Hřbitov a Helena Zontero** (fáze 7) jsou hotové. Obě karty přerozdávají role a obě
  jdou jedním tělem (`_reshuffleRoles`, logic/wildWest.js): vezmi role uvedených hráčů,
  zamíchej je (od DVOU výš, s jednou není co míchat), rozdej zpátky a **shoď jim
  `_roleRevealed`** – tím se role stane zase tajnou (viz redakce výš). Ledger chování
  (server/ledger.js) se resetuje, protože dedukce „střílel na šerifa, tedy bandita" se
  přerozdáním stala nepravdou; pravidla to jen označí (`_ledgerResetPending`), reset udělá
  server v háku před broadcastem, protože ledger žije na `room`, ne ve stavu.
  **Hřbitov** vrací každého vyřazeného na začátku JEHO tahu (natrvalo a opakovaně), takže
  je v `nextTurn` třetí výjimka z přeskakování mrtvých – a duchem se pod ním nikdo nestává
  (pořadí testů: Mrtvý muž → Hřbitov → duch). Míchá se **při každém návratu**, dokud zbývají
  aspoň dvě vyřazené role: při pěti vyřazených tedy čtyřikrát. **Helena Zontero** je jediná
  karta balíčku s okamžitým efektem při příchodu (`_applyWwsEventOnEnter`); sejmutí NEJDE
  cestou `pendingCheckDraw`, protože se karta otáčí automaticky – Lucky Duke ani John Pain
  se u ní neuplatní (FAQ Q09). Barva se čte přes `_effSuit`, takže Požehnání/Prokletí platí.
  Cinematika má dvě půlky (`core/wwsAnim.js`): **veřejnou** (karty rolí ze stolu doprostřed,
  riffle, zpátky rubem nahoru – jen tam, kde karta role leží: vyřazení pod Hřbitovem, ve hře
  pro 3 všichni) a **soukromou** `role_peek` („každý hráč se podívá na svou novou roli").
  `role_peek` je jediná animace, jejíž payload je **pro každý socket jiný** (roli v něm má
  jen její majitel) – `playerIdxs` je naopak u všech stejné, aby fronta držela stav stejně
  dlouho a klienti se nerozešli.
- **Divoký západ** (fáze 8), karta vespod balíčku, je hotový: „Cílem každého hráče se
  stává: Zůstaň poslední ve hře!" Mění **podmínku výhry**, ne průběh hry:
  `checkWinCondition` (logic.js) předá `lastManStanding: this.hasEvent('DIVOKY_ZAPAD')`
  a `evaluateWinner` (core/winCondition.js) tím přebíjí jak klasické strany, tak pravidla
  pro 3 hráče – vrací **jméno** posledního živého. Smrt šerifa hru **nekončí** (odkrývání
  událostí to ustojí samo, `_eventFlipperIdx` posune šerifovu pozici na dalšího živého)
  a **role zůstávají v platnosti** (FAQ Q15): šerif nesmí do vězení, odměna 3 karet za
  banditu i šerifova pokuta za vlastního pomocníka platí dál – nekóduje se k tomu nic,
  jen to drží testy. Jediná výjimka: **nárok `_winClaim3p`** (logic/combat.js) se pod
  kartou nezískává, protože cíle v kruhu přestaly platit. **Bot** se to dozví jedinou
  větví v `roleHostility` (core/beliefs.js): pod `opts.lastManStanding` je nepřítelem
  **každý** – bez toho by strana šerifa v koncovce jen lízala a odhazovala.
- **Teren Kill** (fáze 5) je hotový: hák `_terenKillCheck` úplně nahoře
  v `handlePlayerDeath` **pozastaví vyřazení** – hráč se drží na 1 životě (jinak by ho
  `isInPlay` i `checkWinCondition` uprostřed nedokončeného vyřazení vyškrtly ze hry)
  a do fronty odložených akcí jde `TEREN_CHECK`. Sejmutí pak jede existující cestou
  CHECK_DRAW → CHECKING → `_applyCheckResult` jako Vendeta, takže se zdarma veze Lucky
  Duke, John Pain, klientská cinematika i větev bota. ♠ = vyřazení proběhne doopravdy
  (`_terenKillResult` na tu chvíli vrátí fázi, ve které zásah padl, ať se pozná
  `_autoEndTurnPending`); jinak zůstává na 1 životě a líže si kartu (KILL_REWARD).
- **Lee Van Kliff** (fáze 6) je hotový: schopnost stojí na PAMĚTI poslední hnědé karty
  (`_lastBrown`, logic/wildWest.js). Hnědá = všechno kromě modrých (`isBlueCard`) a
  zelených, takže vyložení Mustangu paměť nesmaže. Opakuje se **efekt, ne aktivace**:
  cena „odhoď další kartu" se podruhé neplatí (Sciarra Q29), zopakovaný Dostavník/Wells
  Fargo **neotáčí** kartu Divokého západu (Q19), Apache Kida rozhoduje barva PŮVODNÍ
  karty (Q12) a cíl smí být jiný (FAQ Q13). Do limitu 1× Bang!/tah se nepočítá ani
  odhozený BANG!, ani opakovaný efekt; Madam Zuzaně se ale opakování počítá jako zahraná
  karta (Q24). Cílené efekty jdou existující cestou (RESPOND, SELECTING_TARGET_CARD),
  takže se veze Barel, Slab, Vulture Sam i klientské animace.
- **Miláček Valentýn a Madam Zuzana** (fáze 3) jsou hotové. Valentýn je **poslední krok
  krokovače startu tahu** (`_runBeginTurn`, logic/highNoon.js) – tedy ještě před kontrolami
  na Dynamit/Vězení, ale až za vším ostatním; náhrady si hráč líže ručně klasickou fází
  lízání. Zuzana je naopak gate na **začátku `nextTurn`** (logic.js), tedy až za fází 3
  (odhoz nad limit) a ještě před sejmutím Vendety.
- **Roubík** (fáze 9) je hotový a je to **jediná karta hry, která se váže na chat**:
  odeslání zprávy stojí 1 život. Zpráva se nezahazuje (karta mluvení zakazuje pod pokutou,
  ne úplně) a nic se nepotvrzuje. Pokuta je ale **odložená** – chat chodí asynchronně
  a trefí libovolnou fázi (RESPOND, míchání, cinematiku vyřazení), takže se seat jen
  zapíše (`_gagPending`) a vybere na nejbližším klidném místě: `_processSpecialQueue`,
  `_resumeAfterSpecial`, nejpozději `nextTurn`. Zásah jde přes `handleDamage(idx, null)`,
  takže se veze Bart Cassidy (líznutí) a El Gringo nekrade. Divák není hráč a neplatí nic.
  Ke kartě patří i **hlášky botů** (`core/botChat.js` + `flushBotQuips` v server/bots.js) –
  bez nich by Roubík boty nikdy netrefil, protože stůl plný botů byl doteď němý.
- Na stole leží **nalevo** od balíčků (`eventPileSlots(L, hnOn, ffOn, wwsOn)`): bere levý
  pár `ffPileX/ffActiveX`, a jen když ho drží Fistful (mobil se zapnutým High Noonem),
  ustoupí o krok dál na `wwsPileX/wwsActiveX`. **Dnešní rozložení High Noonu a Fistfulu
  se tím nemění o pixel.**

- **Greygory Deck** (fáze 10) je hotový, a s ním i refaktor, bez kterého se udělat
  nedal: dotaz „umí X?" prošel z `effectiveCharacter(p) === "Jméno"` na
  **`hasAbility(p, "Jméno")`** (core/distance.js) na všech ~85 místech. Sám Greygory
  žádnou schopnost nemá – má ty **dvě, které si líznul** (`p._greygoryChars`, pole nese
  ten, kdo schopnost právě má, ne Greygory). Líže se ze **skutečného balíčku postav**:
  jen 16 postav základní hry (FAQ Q30) a z nich jen ty, jejichž karta je fyzicky volná
  (R12) – nikdo je nehraje, nemá je jako počítadlo životů (Nová identita, `_secondChar`)
  ani je nedrží jako Greygory. Vlastní dvojice se do poolu vrací (FAQ Q01), takže si
  po výměně může líznout tytéž. **Pool smí vyjít prázdný** – „smůla" je legální stav,
  hráč pak tenhle tah nemá schopnost žádnou a nabídka výměny se nedává vůbec.
  Nabídku dostává **jen ten, kdo Greygoryho doopravdy hraje**; Vera Custer si dvojici
  líže rovnou při volbě kopie (R10) a vyprší jí spolu s kopií, kdežto Greygorymu mezi
  tahy zůstává. Kombinace schopností ve fázi lízání jde beze změny pravidel (FAQ Q31):
  Jesse + Pedro přidají obě své možnosti do `options`, Kit Carlson + Jesse si vezme
  první kartu z ruky a z řady si nechá o jednu míň, Kit + Black Jack ukáže **druhou
  ponechanou** kartu a při červené lízne navíc. **Absolutní konflikt v tom poolu
  nastat nemůže** – Kit vs. Claus by ho udělal, jenže Claus the Saint je z Fistfulu,
  ne ze základní hry, takže se Greygorymu do dvojice nikdy nedostane.
- Dvojice je **veřejná**: leží jako dvě malé karty na KONCI pásu vyložených karet
  (`view/board.js`, zrcadlo v `positions.js`) – přidávají se na konec schválně, aby
  se indexy skutečných karet nehnuly a animace mířily pořád na totéž místo.
- **Lady Růže z Texasu** (fáze 11) je hotová: „Během svého tahu si může každý hráč
  vyměnit místo s hráčem po své pravici a ten tak přeskočí svůj nejbližší tah."
  Je to **jediná karta, která mění sedadla** – a sedadlo je v tomhle projektu INDEX do
  `players`, takže se výměnou přeskládá kus stavu naráz. Jádrem je `_swapSeats`
  (logic/wildWest.js): prohodí dva prvky pole (tím se přenese ruka, stůl, zbraň, role,
  postava, životy i příznaky hráče) a pak **obecným průchodem** přemapuje každé číslo ve
  stavu, které sedadlo znamená. Obecným schválně: ruční výčet polí by při dalším pravidle
  zastaral, takže musí být každý klíč vypadající jako index v jedné ze tří tabulek
  (`SEAT_KEYS` / `SEAT_LIST_KEYS` / `NOT_SEAT_KEYS`) – že žádný nechybí, hlídá
  **strukturální test** procházející zdrojáky `logic/*` (test/wws.seats.test.js).
  Druhá pojistka je pravidlová: měnit místo jde jen ve fázi `PLAY`, takže je většina
  `pending*` polí prokazatelně prázdná. **Sedadlo ale žije i mimo stav hry**: pořadí
  `room.players` (odtud jde `myIndex` do klienta), ledger chování a snímek pro hlášky
  botů – to dorovná `swapRoomSeats` (server/rooms.js). „Po pravici" = `(i−1+n)%n`
  **bez ohledu na Zlatou horečku** (efekt karty jde vždycky po směru, FAQ H3); vyřazení
  se přeskakují. Prohozený dostane `_skipNextTurn` a `nextTurn` ho přeskočí ve stejné
  smyčce jako mrtvé – přeskočení je „jako by tam neseděl", tedy bez startu tahu, bez
  sejmutí na Dynamit/Vězení i bez penalizace Madam Zuzany. Počet použití karta neomezuje,
  strop je podle FAQ Q08 **x použití ZA SEBOU** (x = počet žijících, `_roseStreak`;
  nuluje ho začátek tahu, ve kterém se nepřesedalo) – jediná pojistka proti smyčce, ve
  které jeden hráč nikdy nepřijde na tah. Právo západu (Fistful) výměnu **nezakazuje
  plošně**, jen když by se jí hráč vyvlékl z povinnosti (vzdálenosti se přesednutím
  mění) – ověřuje se to na kopii stavu s prohozenými sedadly, viz `roseSwapOffer`.
  **Bot** se vymění jen s pravděpodobným nepřítelem a **nejvýš jednou za svůj tah**
  (politika, ne pravidlo – jinak by se hra jen botů zvrhla v přesedávání).

Co ještě čeká: **Zuřivá Doroty** (fáze 12, vypůjčený tah) – poslední karta událostí
bez efektu. Všech osm postav
(`WILD_WEST_CHARACTERS` v [logic/entities.js](logic/entities.js), id 34–41) už schopnost
má, takže `WILD_WEST_READY` je dnes celý seznam a zůstává jen jako pojistka pro další
rozšíření.
