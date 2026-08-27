# High Noon — události a přibalené karty

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

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
- **S Právem západu (Fistful) volba není svobodná**: drží-li hráč vynucenou (odkrytou)
  kartu, která by ve své barvě šla zahrát, musí si vybrat **právě její barvu** – jinou by
  si povinnost jen zrušil. Rozhoduje o tom `lawHandcuffsSuit` ([core/playability.js](core/playability.js)):
  postaví si stav s tou barvou a fází `PLAY` a zeptá se `lawForcedCard`. Vrátí `null`
  u karty, která by nešla zahrát ani ve své barvě (Vedle! ve svém tahu) – tam se vybírá
  dál svobodně. Ptají se jím server (`chooseHandcuffsSuit` jinou barvu odmítne), klient
  (ostatní barvy v překryvu zašednou) i bot; bez zrcadel by bot posílal odmítanou volbu
  donekonečna.

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

