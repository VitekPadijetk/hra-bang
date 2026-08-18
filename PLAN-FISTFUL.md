# Plán: rozšíření **A Fistful of Cards**

Druhý balíček událostí vedle High Noon. Dokument je pracovní plán – až bude hotovo,
podstatné části se přesunou do `CLAUDE.md` a tenhle soubor se smaže.

---

## 1. Co rozšíření obsahuje

**15 karet událostí** (stejný mechanismus jako High Noon: šerif na začátku svého tahu
odkryje vrchní kartu, její efekt platí celé kolo) + **3 postavy**.

Karta **Fistful of Cards** se při přípravě dává **vespod balíčku** (přesně jako Pravé
poledne v High Noonu) – přijde poslední a platí do konce hry.

### 1.1 Seznam karet a jejich efekty

Níže je znění, jak ho zapíšu do `cards.fistful.json` (pole `text`). **Zkontroluj prosím,
jestli sedí s tvojí sadou** – hlavně u karet, kde jsou v oběhu různé překlady.

| # | Název | Klíč | Efekt |
|---|---|---|---|
| 400 | **Fistful of Cards** | `FISTFUL_OF_CARDS` | Na začátku svého tahu je hráč zasažen tolika kartami Bang!, kolik má karet v ruce. *(karta jde vespod balíčku)* |
| 401 | **Soudce** | `SOUDCE` | Hráči nesmí vykládat karty před sebe ani před ostatní hráče. |
| 402 | **Vendeta** | `VENDETA` | Na konci svého tahu hráč sejme kartu: při ♥ hraje ještě jeden tah. V jednom tahu jen jednou. |
| 403 | **Odražená střela** | `ODRAZENA_STRELA` | Hráči smí hrát karty Bang! proti kartám vyloženým před ostatními hráči. Zasažený hráč smí kartu zachránit odhozením Vedle!, jinak je karta odhozena. |
| 404 | **Odstřelovač** | `ODSTRELOVAC` | Hráč smí ve svém tahu odhodit 2 karty Bang! najednou proti jinému hráči: ten se ubrání jen dvěma kartami Vedle!. |
| 405 | **Ruská ruleta** | `RUSKA_RULETA` | Když přijde karta do hry, počínaje šerifem každý hráč odhodí kartu Vedle!. První, kdo nemůže, ztrácí 2 životy a efekt končí. |
| 406 | **Laso** | `LASO` | Karty vyložené před hráči nemají žádný efekt. |
| 407 | **Opuštěný důl** | `OPUSTENY_DUL` | Ve fázi lízání si hráč líže z odhazovacího balíčku; při odhazování pokládá karty lícem dolů na dobírací balíček. |
| 408 | **Ranč** | `RANC` | Po fázi lízání smí hráč odhodit libovolný počet karet z ruky a líznout si stejný počet nových. |
| 409 | **Peyote** | `PEYOTE` | Místo klasického lízání hráč hádá barvu (červená/černá) vrchní karty balíčku a odkryje ji. Uhodl → bere si ji a hádá znovu. Neuhodl → karta jde do odhozu a fáze lízání končí. |
| 410 | **Mrtvý muž** | `MRTVY_MUZ` | Hráč, který byl vyřazen jako první, se ve svém tahu vrací do hry se 2 životy a 2 kartami. |
| 411 | **Léčka** | `LECKA` | Vzdálenost mezi kterýmikoli dvěma hráči je 1. |
| 412 | **Pokrevní bratři** | `POKREVNI_BRATRI` | Na začátku svého tahu, před lízáním, smí hráč ztratit 1 život a dát ho jinému hráči. Nesmí se tím zabít. |
| 413 | **Právo západu** | `PRAVO_ZAPADU` | Ve fázi lízání se druhá lízaná karta odkryje a hráč ji musí v tomto tahu zahrát, pokud to jde. |
| 414 | **Pálenka** | `PALENKA` | Hráč smí vynechat fázi lízání a získat za to 1 život. |

### 1.2 Postavy

| # | Postava | Životy | Schopnost |
|---|---|---|---|
| 31 | **Claus "The Saint"** | 4 | Ve fázi lízání si lízne o jednu kartu víc, než je hráčů ve hře; pak dá po jedné kartě každému ostatnímu hráči a zbylé 2 si nechá. |
| 32 | **Uncle Will** | 4 | Jednou za svůj tah smí zahrát libovolnou kartu z ruky jako Hokynářství. |
| 33 | **Johnny Kisch** | 4 | Kdykoli vyloží kartu do hry, všechny ostatní vyložené karty se stejným jménem se odhodí. |

---

## 2. Otevřená rozhodnutí (potřebuju od tebe potvrdit)

Nic z toho nebrání startu – u každého mám **default**, který zapíšu do kódu jako
pojmenovanou konstantu / jeden `if`, aby šlo přepnout jednou řádkou.

| # | Otázka | Můj default |
|---|---|---|
| R1 | **Odražená střela – platí dostřel?** Karta o vzdálenosti nic neříká. | **Ano, platí dostřel zbraně** (jako normální Bang!). Na vlastní karty střílet nejde. |
| R2 | **Odražená střela – počítá se do limitu 1× Bang! za tah?** | **Ne.** Limit se týká Bang! na *hráče*. |
| R3 | **Odražená střela – pomůže Barel / Jourdonnais / Slab?** | **Ne.** Cílem je karta, ne hráč – brání se výhradně kartou Vedle! (1×). Apache Kid: kárová střela na jeho kartu **nemá efekt** (imunita platí). |
| R4 | **Odstřelovač – počítá se do limitu 1× Bang!/tah a blokuje ho Kazatel?** | **Ano na obojí** – je to útok kartami Bang!. Barel ani Jourdonnais nepomůžou (text: „ubrání se JEN dvěma Vedle!"). Calamity Janet smí jednu/obě nahradit kartou Vedle!. |
| R5 | **Ruská ruleta – vybírá si hráč, kterou kartu Vedle! odhodí?** | **Ne, řeší se automaticky** (odhod je povinný, volba je jen kosmetická). Priorita: obyčejné Vedle! → Úhyb → (Calamity Janet) Bang!. Interaktivní varianta znamená novou fázi × N hráčů × M koleček. |
| R6 | **Vendeta – odkryje se na tahu navíc nová karta události?** | **Ne.** Jinak by šerif s Vendetou pálil balíčky dvojnásobnou rychlostí. Všechno ostatní (dynamit, vězení, Pravé poledne, Fistful) na tahu navíc proběhne znovu. |
| R7 | **Opuštěný důl – které odhozy jdou na balíček?** | Jen **odhoz na konci tahu** (limit karet). Zahrané karty padají do odhozu normálně. |
| R8 | **Peyote / Právo západu / Opuštěný důl vs. postavy měnící lízání** (Kit Carlson, Jesse Jones, Pedro Ramirez, Pat Brennan, Black Jack, Claus) | **Peyote přebíjí všechny** (nahrazuje fázi lízání). Opuštěný důl mění jen *zdroj* (schopnosti platí dál). Právo západu se váže na **2. kartu, která hráči doputuje do ruky**. |
| R9 | **Pokrevní bratři – smím dát život hráči na plných životech?** | **Ne** (byla by to čistá ztráta). Cílem je jen hráč ve hře, který má zranění. |
| R10 | **Vendeta / Fistful / Ruská ruleta vs. duch (Město duchů)** | Duch **Vendetu nedostává** (na konci tahu odchází). Fistful ho zasáhne (umřít nemůže). Ruská ruleta se ho týká normálně. |

---

## 3. Architektura: dva balíčky událostí vedle sebe

### 3.1 Klíčové rozhodnutí – **nesahat na existující High Noon**

`GameState` dostane **druhou sadu polí** místo přepisu na obecnou strukturu:

| High Noon | Fistful |
|---|---|
| `eventDeck`, `eventPile`, `activeEvent` | `ffDeck`, `ffPile`, `activeFistful` |
| `_pendingHighNoonReveal`, `_eventEntering` | `_pendingFistfulReveal`, `_ffEntering` |
| `logic/highNoon.js` | `logic/fistful.js` (nový mixin) |
| `core/highNoon.js` | rozšíří se `eventActive` (viz níže) |

**Jediné dva body, kde se to slévá:**

- `GameState.hasEvent(key)` → `activeEvent?.key === key || activeFistful?.key === key`
- `core/highNoon.js` `eventActive(state, key)` → totéž nad prostým JSON stavem

Klíče karet jsou napříč oběma balíčky unikátní, takže **všech ~40 existujících volání
`hasEvent`/`eventActive` zůstává beze změny** a nová pravidla se ptají stejným způsobem.
`_sheriffTurns` (počítadlo kol) je společné – oba balíčky se otáčejí ve stejný okamžik.

### 3.2 Pořadí vyhodnocení: **nejdřív High Noon, pak Fistful**

Krokovač startu tahu (`_beginTurn` / `_runBeginTurn` v `logic/highNoon.js`) se rozšíří.
Každý krok umí vrátit `true` = „čeká se na hráče" a `_resumeBeginTurn()` pokračuje přesně
tam, kde se přestalo – dá se do něj tedy bezpečně vkládat:

```
0. _deadManReturn        ← Mrtvý muž: návrat prvního vyřazeného      [NOVÉ]
1. _flipEvent            ← odkryje HN kartu a hned za ní FF kartu (2 animace za sebou)
2. _applyEventOnEnter    ← okamžitý efekt HN karty (Kocovina, Daltonové, Doktor)
3. _applyFfEventOnEnter  ← okamžitý efekt FF karty (Ruská ruleta)    [NOVÉ]
4. _noonDamage           ← Pravé poledne (HN)
5. _fistfulHits          ← Fistful of Cards: N× Bang! (FF)           [NOVÉ]
6. _newIdentityOffer     ← Nová identita (HN přibalené)
```

Mrtvý muž je krokem 0 schválně: hráč se musí vrátit do hry dřív, než na něj dopadne
Pravé poledne / Fistful, a dřív, než se odkrývá karta (ve hře pro 3 může být oživovaný
hráč zároveň ten, kdo kartu odkrývá).

Pokrevní bratři v tomhle seznamu nejsou schválně – patří **až za kontroly na Dynamit/Vězení**
(kdo je ve vězení, tah přeskakuje a nedaruje nic), takže se zaháknou na začátek
`startDrawPhase()` stejným vzorem, jaký tam už používá Vera Custer.

### 3.3 Umístění na stole

Fistful je **zrcadlově vlevo** od dobíracího balíčku, přesně jak High Noon leží vpravo
od odhozu. Do `core/layout.js` (profil) přibude `ffPileX: 750, ffActiveX: 640`:

```
   [FF líc] [FF rub]   [BALÍČEK] [ODHOZ]   [HN rub] [HN líc]
      640      750         870     1050      1170     1280      (y = 540)
```

Ověřeno proti rozložení: nejbližší soused je stůl levého hráče, který při 2 řadách
karet končí na x ≈ 392. Řada hokynářství (y 608 při zvednutí) leží pod balíčky, které se
zvedají všechny společně (`App.storePileLiftY`) – **FF hromádky se musí zvedat taky**,
jinak by na ně řada hokynářství dosedla.

V intru dostane FF balíček pátý slot: `INTRO_FF_DECK = { x: INTRO_ROLE_DECK.x - 160 } = 640`,
odložená karta `INTRO_FF_ASIDE = { x: 640, y: 350 }`. Rozteč 160 stejná jako u ostatních.

### 3.4 Intro: beaty balíčku Fistful

Server (`server/intro.js`) pošle po HN beatech **stejnou trojici pro FF**:
`fistful_top` → `shuffle_fistful` → `fistful_bottom`.

**Sekvenčně, ne paralelně.** Důvod: `_animateIntroShuffle` (view/intro.js) volá na začátku
`_clearIntroSprites()` a `shuffling(which)` porovnává právě jeden `sub` – dvě míchání
najednou by si vzájemně smazala sprity. Paralelní varianta by znamenala refaktor míchací
animace na skupiny spritů per balíček. Cena sekvenční varianty: intro se při obou
zapnutých rozšířeních prodlouží o ~7,6 s. Když se to ukáže jako moc, zkrátíme až potom.

### 3.5 Cinematika odkrytí karty

`high_noon_reveal` se **rozšíří o pole `deck: 'hn' | 'ff'`** (default `'hn'`, ať staré
testy nic nerozbije). Podle něj klient vybere:
- z jaké hromádky karta startuje (`HN_PILE_X` vs `FF_PILE_X`),
- kam po překlopení dosedne (`HN_ACTIVE_X` vs `FF_ACTIVE_X`),
- kterou texturu použije (`hn_<art>` vs `ff_<art>`) a který rub (`hn_back`/`ff_back`),
- které počítadlo balíčku snížit (`App.hnDeckLeft` / `App.ffDeckLeft`).

Server ve `flushHighNoonReveal` (server/anim.js) vyzvedne **obě** čekající odkrytí a pošle
je za sebou (HN první). Fronta animací na klientu je přehraje v pořadí, blok botů
(`room._hnBlockUntil`) se prodlouží o `2× hnRevealMs()`.

### 3.6 Redakce stavu

`redactState` (server/rooms.js) dnes **neschovává `eventDeck`** – hráč si v konzoli může
přečíst pořadí příštích událostí. Přidám ořez obou balíčků (`eventDeck`, `ffDeck` → jen
délka, stejně jako `deck.cards`). Pořadí hracího balíčku už redakce schovává, takže
hádání barvy u Peyote je poctivé.

---

## 4. Fáze implementace

Každá fáze je samostatně nasaditelná a otestovatelná: po každé je hra hratelná,
`npm test` zelený a commitne se zvlášť.

---

### FÁZE 0 — Infrastruktura druhého balíčku (bez pravidel) · velikost L

**Cíl:** zapnutelné rozšíření, které v intru zamíchá vlastní balíček, každé kolo odkryje
kartu vedle balíčku a **nic nedělá**. Ověřitelné v prohlížeči na první pohled.

**Data**
- `cards.fistful.json` – 15 karet (id 400–414, `key`, `name`, `art`, `text`).
- `characters.json` + `logic/entities.js` – `FISTFUL_CHARACTERS = ["Claus the Saint", "Uncle Will", "Johnny Kisch"]`, ids 31–33 (jen seznam, schopnosti až ve fázi 1).
- Placeholder textury: 15× `assets/fistful_cards/<art>.webp` + `assets/other_cards/fistful/fistful_back.webp` + `assets/characters/031–033.webp`. Vygeneruju skriptem `tools/placeholder.js` přes `sharp` (SVG s názvem karty → webp, 650×1000 kvůli `normalizeTexture`). **Bez reálného souboru se hra nespustí** – `critical` assety blokují sestavení scény.

**Server / pravidla**
- `logic/fistful.js` (nový mixin): `_setupFistfulDeck`, `_flipFistfulEvent`, `_applyFfEventOnEnter` (zatím prázdné), pomocné dotazy.
- `logic.js`: nová pole v konstruktoru + `require('./logic/fistful.js')` v seznamu mixinů.
- `logic/highNoon.js`: `hasEvent` kouká na obě karty; `_flipEvent` po HN kartě otočí i FF; `_runBeginTurn` dostane nové kroky (zatím no-op).
- `logic/setup.js`: `_setupFistfulDeck(options)` z obou setupů, `_characterPool` přidá FF postavy.
- `server.js`, `server/lifecycle.js`, `server/handlers.debug.js`: načtení `cards.fistful.json` → `ctx.fistfulCardData` → `gs.fistfulCardData`.
- `server/rooms.js`: redakce `eventDeck`/`ffDeck`.
- `server/anim.js`: emit obou odkrytí, prodloužení `_hnBlockUntil`.
- `server/intro.js`: beaty `fistful_top` / `shuffle_fistful` / `fistful_bottom` + `ffCount` v `init`.
- `core/gameLog.js`: do snapshotu `eventFf` + `ffLeft`.

**Klient**
- `index.html`: `<script src="logic/fistful.js">` (za `logic/highNoon.js`).
- `core/layout.js`: `ffPileX`/`ffActiveX`; `game.js`: `FF_PILE_X`/`FF_ACTIVE_X`/`FF_PILE_Y`.
- `view/board.js`: `drawHighNoonPile` se zobecní na `drawEventPile(ctx, cfg)` a zavolá 2× (HN, FF). Tělo se přenáší **byte-přesně**, mění se jen zdroj souřadnic/textur/počtu.
- `net/handlers.js`: větev `high_noon_reveal` respektuje `data.deck`.
- `view/intro.js`: `INTRO_FF_DECK`, `INTRO_FF_ASIDE`, tři nové `sub` větve (kopie HN větví), kreslení páté hromádky, závěrečný přesun na `FF_PILE_X`.
- `view/menu.js`: zaškrtávátko **Fistful of Cards** v create-room, hře botů i debugu (řádek `expansionRow`, `loadExpansionAssets(scene, 'fistful')`).
- `game.js`: `EXPANSION_LOADERS.fistful` (kritické: `ff_back` + karta `fistful_of_cards`).
- `state.js`: `App.ffDeckLeft`, `App.createOptions.expansions.fistful`, `App.debugFistful`, `App.botGameExpansions.fistful`.

**Testy:** `test/fistful.test.js` – balíček má 15 karet, Fistful of Cards leží vespod
(odkryje se poslední), `hasEvent` vidí obě karty zároveň, oba balíčky se otáčejí na tah
šerifa a až od 2. kola. Rozšíření vypnuté → `ffDeck` prázdný, `hasEvent` false.

**Ověření:** `node --check`, `npm test`, boot serveru, hra 4 hráčů s oběma rozšířeními –
**tebe požádám o vizuální kontrolu intra a stolu.**

---

### FÁZE 1 — Tři postavy · velikost M

Nezávislé na kartách událostí, testovatelné hned.

#### Claus "The Saint" (4 životy)
- **Pravidlo:** ve fázi 1 si lízne `(počet hráčů ve hře) + 1` karet, pak dá po jedné kartě každému ostatnímu hráči ve hře a zbylé 2 si nechá.
- **Kde:** `logic/draw.js` – nová větev v `startDrawPhase` (jako Kit Carlson) + `clausState` a `clausGive(cardIdx)`; nový socket `claus_give`.
- **Průběh:** odkryté karty vidí **jen Claus** (panel jako u Kita), pořadí obdarovaných je po směru hodinových ručiček od Clause. Za každou rozdanou kartou letí animace k danému hráči (existující `ragtime_steal` obráceně / `hand_to_hand`).
- **Hrany:** počet, který si NECHÁ, se řídí `_drawCountFor` (Žízeň → 1, Příjezd vlaku → 3) – přesně jak to dělá Kit Carlson; lízne si vždy `n+1`. Duch (Město duchů) rozdává taky. Peyote jeho schopnost přebíjí (R8). Suzy/prázdné ruce se řeší frontou až po skončení celého rozdání.
- **Zrcadla:** `core/pending.js` (`CLAUS_GIVE`), `core/botPolicy.js` (dej nejhorší kartu nejpravděpodobnějším spojencům, nejlepší si nech), `view/board.js` panel.

#### Uncle Will (4 životy)
- **Pravidlo:** 1× za svůj tah smí zahrát libovolnou kartu z ruky jako Hokynářství.
- **Kde:** `logic/characters.js` – `useUncleWill(playerIdx, cardIdx)`: kontrola fáze `PLAY`, `_willUsedTurn !== turnId`, `_suitBlocked` (Želízka), odhoz karty a `openStore()`.
- **UI:** tlačítko schopnosti (stejný vzor jako Doc Holyday) → klik na kartu v ruce.
- **Hrany:** Soudce nevadí (nic se nevykládá před hráče). Nefunguje na kartu, kterou už drží jiný efekt (žádný). Bot: použije, když má ≥ 4 karty a nejhorší karta má nízké `keepScore`.

#### Johnny Kisch (4 životy)
- **Pravidlo:** kdykoli vyloží kartu do hry, všechny ostatní vyložené karty téhož jména se odhodí.
- **Kde:** `logic/characters.js` – `_johnnyKischPurge(ownerIdx, cardName)`; volá se ze všech tří míst, kudy karta jde na stůl: `playBoardCard`, větev `CardType.WEAPON` v `playCard`, a `CardType.JAIL` v `playSpecialCard`.
- **Hrany:** projde `board` i `weapon` **všech** hráčů (kromě právě položené karty); odhozený Dynamit **nevybuchne**, odhozené Vězení hráče **osvobodí**. Kocovina schopnost vypíná (jde přes `effectiveCharacter`). Vera Custer, která ho kopíruje, se chová stejně.
- **Zrcadla:** žádná (klient jen vykreslí nový stav), ale server musí poslat animaci odhozu (`board_to_discard` s `exactAngle: true`).

**Testy:** `test/fistful.characters.test.js` – Claus rozdá správný počet a nechá si 2 (a 1 se Žízní); Uncle Will jen 1× za tah; Johnny Kisch smete stejnojmennou zbraň i modrou kartu u všech hráčů, odhozené Vězení nikoho neuvězní.

---

### FÁZE 2 — Pasivní události: Léčka, Laso, Soudce · velikost M

Tyhle tři nemají vlastní fázi ani novou akci – jsou to čisté dotazy.

#### Léčka (`LECKA`)
- **Pravidlo:** vzdálenost mezi kterýmikoli dvěma hráči je 1.
- **Kde:** `core/distance.js` `computeDistance` – místo výpočtu ze sedadel se základ nastaví na 1. **Modifikátory platí dál** (Paul Regret, Rose Doolan, Mustang, Dalekohled), takže se to počítá jako `max(1, 1 + modifikátory)`.
- **Zrcadla:** žádná navíc – `computeDistance` je sdílená funkce serveru, klienta i bota. Do `core/distance.js` přibude standardní shim na `core/highNoon.js` (`eventActive`); cyklus nevzniká, `highNoon.js` nic nepotřebuje.
- **Testy:** vzdálenost 1 přes celý stůl; se Skrýší u cíle 2; Rose Doolan zpátky na 1.

#### Laso (`LASO`)
- **Pravidlo:** karty vyložené před hráči nemají žádný efekt.
- **Kde:** nový dotaz `_boardDead()` v `logic/fistful.js`. Zapojí se přesně tam, kde už dnes existuje analogický vypínač karet na stole u **Belle Star** (`_belleIgnoresBoard`):
  - dostřel zbraně → `computeCanHit` bere 1 (Colt);
  - Mustang/Skrýš/Dalekohled/Hledí → `computeDistance` je ignoruje;
  - Barel → `_beginBangResolution` i `_advanceMassAttack` ho nepočítají (**Jourdonnaisova vrozená schopnost platí dál** – není to karta);
  - Dynamit a Vězení → `handleStartOfTurnChecks` je přeskočí (žádné sejmutí, dynamit se neposouvá, vězení tah nebere);
  - zelené karty → `activateGreenCard` odmítne, zelené Vedle! ze stolu v `handleResponse` neprojde.
- **Zrcadla:** `core/playability.js` (zelené karty ze stolu), `core/botPolicy.js` (aktivace zelených, zelené Vedle! v obraně) – **bez nich se hra zasekne**, protože by bot posílal akci, kterou server mlčky zahodí.
- **Hrany:** karty **zůstávají ležet** (nic se neodhazuje), po skončení kola zase fungují. Zapadá i do Daltonů (odhazuje se podle toho, co leží, ne podle efektu).

#### Soudce (`SOUDCE`)
- **Pravidlo:** hráči nesmí vykládat karty před sebe ani před ostatní.
- **Kde:** `logic/play.js` – gate v `playCard` pro `WEAPON`/`EQUIPMENT`/`BARREL`/`DYNAMITE` a pro zelené karty; v `playSpecialCard` pro `JAIL`.
- **Zrcadla:** jeden gate v `core/playability.js` (pokryje klient i bota, protože `decidePlay` se ptá přes `cardPlayability`).
- **Hrany:** už vyložené karty fungují normálně. Aktivace zelené karty ze stolu **není** vykládání → povoleno. Hokynářství Uncle Willa taky ne.

**Testy:** `test/fistful.test.js` – tři bloky, každý s pozitivním i negativním případem.

---

### FÁZE 3 — Fáze lízání I: Pálenka, Opuštěný důl, Právo západu · velikost M

#### Pálenka (`PALENKA`)
- **Pravidlo:** hráč smí vynechat fázi lízání a získat 1 život.
- **Kde:** `logic/draw.js` – nový zdroj lízání `'liquor'` v `_getDrawOptions` (jen když `isStartOfTurn`). `drawCard('liquor')` → `_heal(player, 1)` a rovnou `_finishDraw()` (tedy včetně Ranče/Želízek, které přijdou po lízání).
- **UI:** tlačítko u balíčku „🥃 Pálenka: +1 život místo lízání" (stejné místo, kde se dnes nabízí Pedrova/Jesseho volba).
- **Hrany:** platí i pro Kita Carlsona (rozhoduje se, než odkryje karty) a ducha (léčit se smí). Léčení má strop na `maxHealth` – nabízí se i na plných životech (pravidlo to nezakazuje), ale bot ho použije jen když má zranění.
- **Bot:** větev `DRAW` – `liquor`, když `health < maxHealth` a v ruce už má aspoň 3 karty.

#### Opuštěný důl (`OPUSTENY_DUL`)
- **Pravidlo:** ve fázi 1 se líže z odhozu; odhoz na konci tahu jde lícem dolů na dobírací balíček.
- **Kde:**
  - lízání: `_getDrawOptions` vrátí `['discard']`, a v `drawCard` se větev `'discard'` uvolní i mimo Pedra Ramireze a i pro druhou/třetí kartu (dnes je vázaná na `cardsDrawn === 0`);
  - odhazování: `discardCard` (logic.js) místo `discardPile.push` udělá `deck.cards.push` (= vrch balíčku, protože `draw()` popuje z konce).
- **Hrany:** prázdný odhoz → fallback na balíček (jinak by se hra zasekla). Schopnosti postav platí dál (Jesse Jones bere první kartu z ruky soupeře, Black Jack odkrývá druhou, Claus si líže `n+1` z odhozu). Bez fallbacku hrozí stall bota → větev `DRAW` musí umět „ber z odhozu, ať už je nahoře cokoli".
- **Zrcadlo:** `core/botPolicy.js` větev `DRAW` (dnes bere z odhozu jen když je nahoře Bang!/Pivo/Vedle!).

#### Právo západu (`PRAVO_ZAPADU`)
- **Pravidlo:** druhá lízaná karta se odkryje a hráč ji musí v tom tahu zahrát, pokud to jde.
- **Kde:** `logic/draw.js` – když do ruky doputuje **druhá** karta fáze 1, uloží se `player._lawCardId`. `logic.js` `tryEndTurn` odmítne ukončit tah, dokud `_lawForcedPlayable()` vrací true. `_lawCardId` se nuluje na začátku tahu a v okamžiku, kdy karta z ruky odejde.
- **`_lawForcedPlayable`:** karta je v ruce **a** `cardPlayability` říká `true` **a** (u Bang!/bang-efektu) existuje dosažitelný cíl. Bez té druhé podmínky by šlo tah zamknout kartou Bang!, na kterou nikdo není v dostřelu.
- **Odkrytí ostatním:** `redactState` propustí v ruce tuhle jednu kartu (`_lawCardId`), klient ji ve vějíři soupeře nakreslí lícem. Analogie: druhá karta Black Jacka.
- **UI:** karta v mojí ruce má zlatý rámeček + hint „Právo západu: tuhle kartu musíš zahrát"; „Ukončit tah" je zašedlé s vysvětlením.
- **Bot:** `decidePlay` zkusí vynucenou kartu jako první; když nejde zahrát, ukončí tah (server pustí).
- **Hrany:** Žízeň (líže se 1) → žádná vynucená karta. Kit Carlson → druhá karta, kterou si **nechá**. Peyote je z téhož balíčku, takže se s Právem západu nikdy nepotká.

**Testy:** `test/fistful.draw.test.js`.

---

### FÁZE 4 — Fáze lízání II: Peyote a Ranč · velikost L

Obě potřebují vlastní fázi, UI a bota.

#### Peyote (`PEYOTE`)
- **Pravidlo:** místo lízání hráč hádá barvu (červená/černá) vrchní karty; uhodne → bere si ji a hádá znovu; neuhodne → karta do odhozu, fáze lízání končí.
- **Kde:** `logic/fistful.js` – `startPeyote()` (volá `startDrawPhase` hned na začátku, přebíjí Kita/Jesseho/Pedra/Pata/Black Jacka/Clause), fáze `PEYOTE`, `pendingPeyote = { playerIdx, revealedCount }`, akce `peyote_guess { red: bool }`.
- **⚠️ Výjimka z pravidel (tvoje zadání):** vyhodnocení hádání čte **vytištěnou barvu `card.suit`**, ne `_effSuit`. S Požehnáním/Prokletím (obojí z HN, může běžet zároveň) by jinak byla každá karta červená/černá a hráč by si líznul celý balíček. Jakmile karta **dosedne do ruky**, platí pro ni zase přebarvení – to je zadarmo, protože `_effSuit` se počítá až při použití. Bude to jediné místo v kódu, kde se `card.suit` čte napřímo, s velkým komentářem.
- **UI:** dvě tlačítka „♥♦ Červená" / „♠♣ Černá" u balíčku; odkrytá karta se přehraje existující cinematikou sejmutí (`startCheckReveal`) a pak letí do ruky nebo do odhozu.
- **Hrany:** `_finishDraw()` se zavolá s `isStartOfTurn: true`, aby navázala Želízka i Ranč. Došlý balíček se zamíchá standardní cestou (`deck.draw()`).
- **Bot:** větev `PEYOTE` – hádá barvu, které je v odhozu vidět míň (nebo prostě červenou); po ~3 uhodnutých kartách hádá dál (není důvod přestat, ztráta je jen ta jedna odkrytá karta).

#### Ranč (`RANC`)
- **Pravidlo:** po fázi lízání smí hráč odhodit libovolný počet karet a líznout si stejný počet.
- **Kde:** `logic/fistful.js` – `_startRanch()` volaný z `_finishDraw` **za** Želízkami (HN má přednost, viz zadání), fáze `RANCH`, `pendingRanch = { playerIdx }`, akce `ranch_exchange { cardIds: [] }` (prázdné pole = přeskočit).
- **UI:** karty v ruce se dají označovat (druhý klik odznačí), tlačítka „Vyměnit (N)" a „Přeskočit".
- **Hrany:** odhozené karty jdou do odhozu **(a s Opuštěným dolem? nejde – oba jsou z FF balíčku, nepotkají se)**. Líznutí probíhá naráz (jedna animace za kartou), ne po kliknutí – hráč už rozhodl. Suzy Lafayette: odhodit všechno a líznout stejně tolik znamená, že s prázdnou rukou nezůstane.
- **Bot:** vymění karty s `keepScore` pod prahem (max 3 karty), jinak přeskočí.

**Testy:** `test/fistful.draw.test.js` – Peyote uhodl/neuhodl, přebíjí Kita, **Požehnání Peyote neovlivní**; Ranč vymění přesný počet a přeskočení funguje.

---

### FÁZE 5 — Start tahu: Pokrevní bratři, Fistful of Cards, Mrtvý muž · velikost L

#### Pokrevní bratři (`POKREVNI_BRATRI`)
- **Pravidlo:** na začátku svého tahu, před lízáním, smí hráč ztratit 1 život a dát ho jinému hráči; nesmí se tím zabít.
- **Kde:** začátek `startDrawPhase` (tedy až po kontrolách na Dynamit/Vězení – ve vězení hráč tah přeskakuje a nedaruje nic). Vzor: pauza Very Custer. Fáze `BLOOD_BROTHERS`, `pendingBloodBrothers = { playerIdx }`, akce `blood_brothers { targetIdx | null }`.
- **Hrany:** nabídne se jen když `health ≥ 2` a existuje cíl ve hře se zraněním (R9). Ztráta života jde přes `handleDamage(idx, null)` → **Bart Cassidy si za ni lízne, El Gringo nekrade** (není útočník). Když hráč tímhle spustí frontu odložených akcí, dokončí se lízání až po ní (`_resumeBeginTurnAfterQueue` vzor). Jednou za tah (`_bbOfferedTurn === turnId`).
- **UI:** overlay „Dát 1 život?" + zvýraznění klikatelných spoluhráčů + „Ne, děkuji".

#### Fistful of Cards (`FISTFUL_OF_CARDS`)
- **Pravidlo:** na začátku tahu je hráč zasažen tolika Bang!, kolik má karet v ruce.
- **Kde:** krok 5 v `_runBeginTurn` → `pendingFistful = { playerIdx, hitsLeft: hand.length }`, každý zásah jede přes `_beginBangResolution(null, idx, false, 'Fistful of Cards')`.
- **Proč to jde bez útočníka:** `handleDamage(idx, null)` se používá už u dynamitu; `effectiveCharacter(undefined)` vrací null, takže se Slab ani Belle Star nechytnou. **El Gringo nekrade** (není komu), **za zabití nedostane nikdo odměnu** – stejně jako u dynamitu.
- **Průběh:** po každé reakci se pokračuje dalším zásahem – hák v `handleResponse` a `_advanceAfterLastLifeSave` (větev „ostatní", vedle Duelu a hromadných útoků). Barel/Vedle!/zelené Vedle! fungují na každý zásah zvlášť, Pivo na posledním životě taky.
- **Hrany:** počet zásahů se **zmrazí na začátku** (hraní Vedle! ruku zmenšuje). Smrt uprostřed → zbytek se zahodí. Prázdná ruka → 0 zásahů, krok se přeskočí. Duch zásahy schytá, ale neumře.

#### Mrtvý muž (`MRTVY_MUZ`)
- **Pravidlo:** hráč vyřazený jako první se ve svém tahu vrací se 2 životy a 2 kartami.
- **Kde:**
  - `logic/combat.js` `handlePlayerDeath`: zapsat `this._firstDeadIdx ??= deadIdx` a `p._roleRevealed = true` (nezávisle na rozšíření – je to laciné a řeší to i redakci);
  - `logic.js` `nextTurn`: hráče `_firstDeadIdx` **nepřeskakovat**, když je událost aktivní a návrat ještě nebyl použit (stejný mechanismus jako Město duchů);
  - `logic/fistful.js` `_deadManReturn()` (krok 0 startu tahu): `health = 2`, `_deadManUsed = true`, do fronty `{ type: 'KILL_REWARD', playerIdx, cardsNeeded: 2 }` (hráč si klikne 2 karty z balíčku, existující animace).
- **Hrany:**
  - **Kombinace s Městem duchů:** je-li aktivní obojí, první vyřazený se vrací **doopravdy**, ostatní jako duchové. Návrat se testuje dřív než `_ghost`.
  - **Role zůstává odkrytá** (odhalila se při vyřazení) → redakce se ptá přes `_roleRevealed`, ne přes `health <= 0`. Bez toho by se role po návratu zase schovala.
  - Vrací se **natrvalo** (i po výměně události). Vyhodnocení výhry se návratem nemění (hra by už skončila, kdyby o něco šlo), `checkWinCondition` se po návratu přesto zavolá.
  - Vrátivší se hráč má prázdný stůl a Colt .45; jeho karta role zmizí ze slotu → `_roleSlot` (view/board.js) a `hasRoleCard` (positions.js) se musí měnit **spolu**.

**Testy:** `test/fistful.turn.test.js` – Pokrevní bratři (přesun života, zákaz sebevraždy, Bart lízne); Fistful (3 karty = 3 zásahy, Barel na každý, smrt uprostřed); Mrtvý muž (návrat jednou, role zůstává odkrytá, s Městem duchů se nechová jako duch).

---

### FÁZE 6 — Ruská ruleta a Vendeta · velikost M

#### Ruská ruleta (`RUSKA_RULETA`)
- **Pravidlo:** při příchodu karty do hry každý od šerifa po směru odhodí Vedle!; první, kdo nemůže, ztrácí 2 životy a efekt končí. **Kolečko se opakuje**, dokud někdo neselže.
- **Kde:** `_applyFfEventOnEnter` → `_startRussianRoulette()`. Řeší se **automaticky** (R5): smyčka od `_firstPlayerIndex()` po směru, pro každého hráče ve hře vybere kartu (priorita obyčejné Vedle! → Úhyb → Calamity Janet Bang!) a odhodí ji; první bez karty dostane 2 zásahy.
- **Zásahy:** recykluje se **klikací fáze dynamitu** – `pendingDynamiteDamage = { playerIdx, hitsLeft: 2, source: 'ROULETTE', resume: 'BEGIN_TURN' }`. Tím zadarmo funguje záchrana Pivem i Sidem Ketchumem, guard, klient i bot; mění se jen popisek a to, kam se po dobrání pokračuje (`_resumeBeginTurn` místo `handleStartOfTurnChecks`).
- **Animace:** série `hand_to_discard` (jedna za každý odhoz, ~250 ms rozestup), pak klikací zásahy. Boti se o tu dobu podrží (`room._deathBlockUntil` vzor).
- **Hrany:** nikdo nemá Vedle! → první hráč v pořadí schytá 2. Hráč, který odhozením přijde o poslední kartu (Suzy) – fronta se dobere až po celém kolečku. Když zásahy někoho zabijí, start tahu pokračuje až po smrti (existující `_resumeBeginTurnAfterQueue`).

#### Vendeta (`VENDETA`)
- **Pravidlo:** na konci svého tahu hráč sejme kartu; ♥ → hraje ještě jeden tah (jednou za tah).
- **Kde:** `logic.js` `nextTurn` – nový gate úplně nahoře: hráč, jehož tah končí, je ve hře, událost aktivní, `!_vendettaDone`, **není duch** (R10) → sejmutí přes existující `CHECK_DRAW` s `reason: 'VENDETTA'` (a tedy i s Lucky Dukem zdarma).
- **Vyhodnocení:** `_applyCheckResult` větev `VENDETTA`: ♥ (podle `_effSuit`, takže Požehnání pomáhá a Prokletí zabíjí) → `_vendettaExtraTurn()`; jinak normální `nextTurn`.
- **Tah navíc:** `turnId++`, `_extraTurn = true` (přeskočí `_flipEvent`, R6), `_vendettaDone = true`, pak `_beginTurn()` + `handleStartOfTurnChecks()` pro **stejného hráče**. Dynamit, vězení, Pravé poledne i Fistful proběhnou znovu.
- **Zrcadla:** `core/pending.js` (popis „Vendeta – sejmutí"), `describePendingCheck` (co se líže a proč). Bot je pokrytý existující větví `CHECK_DRAW`/`CHECKING`.
- **Hrany:** `_vendettaDone` se nuluje při přechodu na jiného hráče. Ukončení tahu smrtí (auto-end-turn) Vendetu nespouští. Vendeta + Zlatá horečka: směr se řeší až v `nextTurn`, tah navíc směr neřeší.

**Testy:** `test/fistful.turn.test.js` – ♥ dá tah navíc a jen jeden; ♠ ne; tah navíc neotočí novou událost; duch Vendetu nedostane.

---

### FÁZE 7 — Nové útoky: Odstřelovač a Odražená střela · velikost L

Nejvíc práce na klientovi (nové cíle kliknutí).

#### Odstřelovač (`ODSTRELOVAC`)
- **Pravidlo:** ve svém tahu smí hráč odhodit 2 karty Bang! proti jinému hráči; ten se ubrání jen dvěma Vedle!.
- **Kde:** recykluje se **„odhoď další kartu"** z Dodge City (`startDiscardExtra` / `discardAnotherCard` v `logic/dodgeCity.js`): hráč nejdřív zvolí cíl, pak zaplatí druhou kartou. Nový efekt `'sniper'` s validací, že zaplacená karta je Bang! (u Calamity Janet i Vedle!).
- **Vyhodnocení:** `waitForMissed(target, attacker, CardType.BANG, false, 'Odstřelovač')` s `missesRequired = 2`. Barel ani Jourdonnais se nevolají (R4) – jde se rovnou do `RESPOND`.
- **Limit:** počítá se jako zahrání Bang! (`bangsPlayedThisTurn++`) a blokuje ho Kazatel (R4).
- **UI:** klik na Bang! → vedle cílů se objeví tlačítko „🎯 Odstřelovač (2× Bang!)" (jen když je v ruce druhý Bang! a událost běží) → klik na cíl → výběr platící karty.
- **Bot:** obrana je zdarma (větev `RESPOND` už umí `missesRequired = 2` kvůli Slabovi). Útok: použije, když má 2+ Bang! a cíl je jistý nepřítel s ≤ 2 kartami v ruce.

#### Odražená střela (`ODRAZENA_STRELA`)
- **Pravidlo:** hráč smí zahrát Bang! proti kartě vyložené před jiným hráčem; majitel ji zachrání kartou Vedle!, jinak se karta odhodí.
- **Kde:** `logic/fistful.js` `playRicochet(attackerIdx, targetIdx, area, cardIdx)`:
  - validace: fáze `PLAY`, karta v ruce je Bang! (Calamity Janet i Vedle!), cíl ≠ já, cílová karta existuje (`weapon` nebo `board`), dostřel podle R1, Želízka, Apache Kid (R3);
  - `pendingResponse = { active, originatorIdx, targetIdx, requiredCard: MISSED, sourceCard: 'RICOCHET', ricochet: { area, cardId } }`, `missesRequired = 1`, fáze `RESPOND`;
  - v `handleResponse` nová větev: odpověď kartou → nic se neděje; bez odpovědi → **cílová karta se odhodí** (dohledá se podle `cardId`, ne indexu – mezitím se mohla posunout).
- **Limit:** do 1× Bang!/tah se nepočítá (R2), do statistik ano.
- **UI:** s vybraným Bang! se rozsvítí **karty na stolech soupeřů** (dnes se v tomhle režimu svítí jen hráči). Klik → `play_ricochet`. Klient už umí klikat na cizí karty ve stole (`handlePanicCBClick`), takže se rozšíří jen podmínka, kdy jsou interaktivní.
- **Animace:** Bang! letí z ruky na cílovou kartu; při neubránění letí cílová karta do odhozu (`board_to_discard` s `exactAngle: true`).
- **Hrany:** střelba na Dynamit/Vězení je legální (a je to hlavní taktické využití). Zasažené Vězení hráče **osvobodí**. Odhozená zbraň → Colt .45. Guard: `select_target_card` se nepoužívá, akce má vlastní autorizaci přes `pendingActor` (fáze `PLAY` = hráč na tahu).
- **Bot:** obrana přes existující `RESPOND` (ubrání jen kartu s `boardCardValue` nad prahem – nemá smysl pálit Vedle! za cizí… tedy za vlastní bezcennou kartu). Útok: sestřelí Barel/Mustang/zbraň nepříteli, když má Bang! navíc.

**Testy:** `test/fistful.attacks.test.js`.

---

### FÁZE 8 — Bot, zátěž, dokumentace · velikost M

- Doplnit `core/botPolicy.js` o všechny nové větve `pendingActor` (`PEYOTE`, `RANCH`, `BLOOD_BROTHERS`, `CLAUS_GIVE`) – **každá chybějící větev = zaseknutá hra** (bot nemá co poslat, stav se nemění, driver se točí).
- `test/server.bots.test.js`: zátěžová hra jen botů pro **3–8 hráčů** ve všech kombinacích rozšíření (`dodge_city × high_noon × fistful`) + varianta „balíček samých X" pro nejrizikovější karty (Peyote, Fistful of Cards, Ruská ruleta, Vendeta, Mrtvý muž) – přesně jak to dnes dělá test s balíčkem samých Měst duchů.
- Guard (`server/guard.js`): ověřit, že nové akce projdou přes `pendingActor` (u `blood_brothers`, `peyote_guess`, `ranch_exchange`, `claus_give`, `uncle_will`, `play_ricochet`, sniper).
- `CLAUDE.md`: nová sekce „Fistful of Cards" (mapa souborů + zvláštnosti: dva balíčky, výjimka Peyote, pořadí HN → FF), řádky v tabulkách souborů.
- Smazat `PLAN-FISTFUL.md`.

---

## 5. Rizika a na co si dát pozor

1. **Zaseknutá hra kvůli chybějícímu zrcadlu.** Historicky nejčastější chyba v tomhle
   projektu: server akci odmítne, bot ji pošle znovu, stav se nezmění → nekonečno. Každé
   nové pravidlo, které něco *zakazuje* (Soudce, Laso, Právo západu), musí mít zrcadlo
   v `core/playability.js` **i** v `core/botPolicy.js`.
2. **Render neumím ověřit.** Po fázích 0, 4, 5 a 7 (nové UI) tě požádám o kontrolu
   v prohlížeči.
3. **Delší intro** při obou rozšířeních (~+7,6 s). Až to uvidíš, rozhodneme, jestli
   zkracovat.
4. **Rozpočet postav.** 8 hráčů × 2 nabídky = 16; základ má přesně 16, s Fistfulem 19,
   s Dodge City 31/34. Smoke test na `setupGame(8)` ve všech kombinacích zůstává v platnosti.
5. **Kombinace dvou aktivních událostí** je nový stav, který dosud nemohl nastat. Nejrizikovější
   dvojice mají vlastní test: Peyote × Požehnání, Mrtvý muž × Město duchů, Fistful × Pravé
   poledne, Laso × Vězení/Dynamit, Ranč × Želízka.
6. **Placeholder textury.** Než dodáš finální art, musí v `assets/` ležet reálné soubory –
   jinak se hra kvůli `critical` assetům vůbec nesestaví.
