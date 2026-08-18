# Plán: rozšíření **A Fistful of Cards**

Druhý balíček událostí vedle High Noon. Pracovní plán – až bude hotovo, podstatné části
se přesunou do `CLAUDE.md` a tenhle soubor se smaže.

**Stav:** výklady pravidel odsouhlaseny (verze 2), čeká se na start implementace.

---

## 1. Co rozšíření obsahuje

**15 karet událostí** (mechanismus jako High Noon: šerif na začátku svého tahu odkryje
vrchní kartu, efekt platí celé kolo) + **3 postavy**.

Karta **Fistful of Cards** se při přípravě dává **vespod balíčku** (přesně jako Pravé
poledne v High Noonu) – přijde poslední a platí do konce hry.

### 1.1 Seznam karet

Znění, které půjde do `cards.fistful.json` (pole `text`). **Zkontroluj prosím, jestli sedí
s tvojí sadou** – u pár karet jsou v oběhu různé překlady.

| # | Název | Klíč | Efekt |
|---|---|---|---|
| 400 | **Fistful of Cards** | `FISTFUL_OF_CARDS` | Na začátku svého tahu je hráč zasažen tolika kartami Bang!, kolik má karet v ruce. *(karta jde vespod balíčku)* |
| 401 | **Soudce** | `SOUDCE` | Hráči nesmí vykládat karty před sebe ani před ostatní hráče. |
| 402 | **Vendeta** | `VENDETA` | Na konci svého tahu hráč sejme kartu: při ♥ hraje ještě jeden tah. V jednom tahu jen jednou. |
| 403 | **Odražená střela** | `ODRAZENA_STRELA` | Hráči smí hrát karty Bang! proti kartám vyloženým před ostatními hráči. Zasažený hráč smí kartu zachránit kartou Vedle!, jinak je karta odhozena. |
| 404 | **Odstřelovač** | `ODSTRELOVAC` | Hráč smí ve svém tahu odhodit 2 karty Bang! najednou proti jinému hráči: ten se ubrání jen dvěma kartami Vedle!. |
| 405 | **Ruská ruleta** | `RUSKA_RULETA` | Když přijde karta do hry, počínaje šerifem každý hráč odhodí kartu Vedle!. První, kdo nemůže, ztrácí 2 životy a efekt končí. |
| 406 | **Laso** | `LASO` | Karty vyložené před hráči nemají žádný efekt. |
| 407 | **Opuštěný důl** | `OPUSTENY_DUL` | Ve fázi lízání si hráč líže z odhazovacího balíčku; odhazované karty se pokládají lícem dolů na dobírací balíček. |
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

## 2. Odsouhlasené výklady pravidel

| # | Pravidlo | Rozhodnutí |
|---|---|---|
| R1 | Odražená střela – dostřel | **Platí** (jako u normálního Bang!). |
| R2 | Odražená střela – limit 1× Bang!/tah | **Nepočítá se do něj.** |
| R3 | Odražená střela – Barel / Jourdonnais / Slab / Apache Kid | **Chová se jako normální Bang!** → Barel i Jourdonnais mohou kartu zachránit, Slab vyžaduje 2× Vedle!, kárová střela na Apache Kida nemá efekt. |
| R4 | Odstřelovač – limit a Kazatel | **Počítá se jako zahrání Bang!** (limit i zákaz Kazatele platí). Ubránit se lze **jen 2× Vedle!** – Barel ani Jourdonnais nepomůžou. |
| R5 | Ruská ruleta – výběr karty | **Hráč si vybírá sám.** Platí **jakákoli karta s efektem Vedle!** – z ruky (Vedle!, Úhyb, u Calamity Janet i Bang!, **u Eleny Fuente libovolná karta**) **i zelená karta ze stolu** (Železný plát, Sombrero, Bible…). Odhod je **povinný**, dobrovolně životy ztratit nejde: klikatelné jsou jen karty Vedle!. Kdo žádnou nemá, má zvýrazněné jen životy (klikne a schytá 2 zásahy). |
| R6 | Vendeta – nová událost na tahu navíc | **Neodkrývá se.** Všechno ostatní na začátku tahu proběhne znovu – **včetně sejmutí na dynamit, který si hráč vyložil v první půlce svého tahu**. |
| R7 | Opuštěný důl – co jde na balíček | **Úplně všechno, co během kola odejde od hráče**, jde **lícem dolů na dobírací balíček**: zahrané karty, odhozy na konci tahu, zaplacené ceny, zničené karty, šerifova pokuta **i celá pozůstalost vyřazeného hráče a ducha**. Jedinou výjimkou jsou karty **odkryté z balíčku** – viz 2.1. Aby hráči věděli, co bylo zahráno, karta při letu **dosedne lícem nahoru, chvíli vydrží a teprve pak se překlopí na rub** – přesně jako u stolu. |
| R8 | Peyote vs. postavy měnící lízání | **Peyote přebíjí všechny** (Kit Carlson, Jesse Jones, Pedro Ramirez, Pat Brennan, Black Jack, Claus). |
| R9 | Pokrevní bratři – dát život hráči na plných životech | **Nelze.** Cílem je jen hráč ve hře se zraněním. |
| R10 | Duch (Město duchů) vs. FF karty | **Vendeta ano** – duch odhodí celou ruku a začne nový tah zase jako duch (znovu si líže 3). **Fistful of Cards ne** a **Ruská ruleta ne** – duch se jich neúčastní. |

### 2.1 Doplňky (odsouhlaseno)

- **Elena Fuente v Ruské ruletě: ano** – smí odhodit libovolnou kartu z ruky. Znamená to, že neselže, dokud drží aspoň jednu kartu.
- **Právo západu vs. Kit Carlson: ano** – vynucená je druhá karta, kterou si **nechá**.
- **Opuštěný důl bere úplně všechno od hráčů** – včetně pozůstalosti vyřazeného hráče a odcházejícího ducha. Cinematika vyřazení tím míří na balíček (klient to má na jednom místě, `discardTopPos()`).

**Jediná výjimka, kterou navrhuju ponechat: karty odkryté z balíčku.** Kontrolní sejmutí
(Dynamit, Vězení, Barel, Vendeta), obě karty Lucky Duka a špatně hádaná karta Peyote by se
vracely na vrch balíčku, odkud byly právě líznuté – a další kontrola by táhla **tutéž
kartu**. Během kola s Opuštěným dolem by tak dynamit buď nikdy nevybuchl, nebo vybuchl
každému (ve fázi lízání se líže z odhozu, takže by se vrch balíčku neprostřídal). Je to
i praktická pojistka: odhoz se během kola jen vyprazdňuje a tohle je jediné, co ho doplňuje.
**Tohle je to „dokud je to možné" – když to chceš jinak, řekni a pošlu je na balíček taky.**

---

## 3. Architektura: dva balíčky událostí vedle sebe

### 3.1 Klíčové rozhodnutí – **nesahat na existující High Noon**

`GameState` dostane **druhou sadu polí** místo přepisu na obecnou strukturu:

| High Noon | Fistful |
|---|---|
| `eventDeck`, `eventPile`, `activeEvent` | `ffDeck`, `ffPile`, `activeFistful` |
| `_pendingHighNoonReveal`, `_eventEntering` | `_pendingFistfulReveal`, `_ffEntering` |
| `logic/highNoon.js` | `logic/fistful.js` (nový mixin) |

**Jediné dva body, kde se to slévá:**

- `GameState.hasEvent(key)` → `activeEvent?.key === key || activeFistful?.key === key`
- `core/highNoon.js` `eventActive(state, key)` → totéž nad prostým JSON stavem

Klíče karet jsou napříč oběma balíčky unikátní, takže **všech ~40 existujících volání
`hasEvent`/`eventActive` zůstává beze změny** a nová pravidla se ptají stejným způsobem.
`_sheriffTurns` (počítadlo kol) je společné – oba balíčky se otáčejí ve stejný okamžik.

### 3.2 Pořadí vyhodnocení: **nejdřív High Noon, pak Fistful**

Krokovač startu tahu (`_beginTurn` / `_runBeginTurn`) umí každý krok pauznout a vrátit se
přesně tam, kde skončil – dá se do něj tedy bezpečně vkládat:

```
0. _deadManReturn        ← Mrtvý muž: návrat prvního vyřazeného       [NOVÉ]
1. _flipEvent            ← odkryje HN kartu a hned za ní FF kartu (2 animace za sebou)
2. _applyEventOnEnter    ← okamžitý efekt HN karty (Kocovina, Daltonové, Doktor)
3. _applyFfEventOnEnter  ← okamžitý efekt FF karty (Ruská ruleta)     [NOVÉ]
4. _noonDamage           ← Pravé poledne (HN)
5. _fistfulHits          ← Fistful of Cards: N× Bang! (FF)            [NOVÉ]
6. _newIdentityOffer     ← Nová identita (HN přibalené)
```

Mrtvý muž je krokem 0 schválně: hráč se musí vrátit do hry dřív, než na něj dopadne Pravé
poledne / Fistful, a dřív, než se odkrývá karta (ve hře pro 3 může být oživovaný hráč
zároveň tím, kdo kartu odkrývá).

Pokrevní bratři v seznamu nejsou – patří **až za kontroly na Dynamit/Vězení** (kdo je ve
vězení, tah přeskakuje a nedaruje nic), takže se zaháknou na začátek `startDrawPhase()`
stejným vzorem, jaký tam už používá Vera Custer.

### 3.3 Umístění na stole

**Fistful leží nad High Noonem, obojí napravo od odhozu.** Když se hraje jen jedno
z rozšíření, sedí na dnešní pozici High Noonu.

```
        [FF rub] [FF líc]      y = 455        ← jen když běží OBĚ rozšíření
[BALÍČEK] [ODHOZ]
        [HN rub] [HN líc]      y = 625
   870     1050    1170  1280

jen jedno rozšíření:  [ten balíček] na 1170/1280, y = 540   (dnešní stav, beze změny)
```

Rozteč řad 170 px = výška karty (150 při `scaleDeck` 0,3) + 20 px mezera.

**Pozice tím přestává být konstanta.** Dnes je `const HN_PILE_X = _L0.hnPileX` spočítaná
při načtení skriptu; nově musí záviset na tom, která rozšíření ve hře běží. Půjdou tedy
cestou, kterou projekt už jednou prošel u mé zóny (`MY_ROLE_X()` ve view/intro.js):
**funkce místo konstant**, jediný zdroj v `core/layout.js`:

```js
eventPileSlots(L, stage, hnOn, ffOn)
  → { hn: { deckX, activeX, y } | null, ff: { … } | null }
```

Konzumenti: `view/board.js` (kreslení), `net/handlers.js` (start a cíl letu odkrývané
karty), `view/intro.js` (závěrečný přesun balíčků na herní pozici).

**Co jsem proti rozložení ověřil** (design px, 16:9):

| Soused | Hrana | Odstup od FF/HN |
|---|---|---|
| Karty na stole horního soupeře, 2. řada (6–8 hráčů) | spodek y ≈ 362, x 1121–1385 | **18 px** nad FF (455 → vršek 380) |
| Moje zóna (stůl x ≤ 781, ruka y 880–1060) | – | mimo, bez kolize |
| Tlačítka „Ukončit tah" / schopnost (y 769–831) | vršek 769 | 69 px pod HN (625 → spodek 700) |
| Boční soupeři (x ≥ 1528) | – | mimo, bez kolize |

**Kolize s řadou hokynářství** – jediné skutečně těsné místo. Řada leží 188 px pod
balíčky, takže při dvou řadách událostí by zasahovala do spodku karty High Noonu
(od ~6 hráčů, kdy řada dosáhne na x 1170+). Řeším to tak, že **cinematika hokynářství
zvedne sloupce událostí o `storeLift + 170` místo o `storeLift`** – High Noon tím skončí
přesně tam, kde je při zvednutí dnes, a Fistful nad ním. Zůstane jen přechodný překryv
horní karty s prvním řádkem karet horního soupeře při 7–8 hráčích; to je stejný typ
ústupku, jaký už je v projektu zdokumentovaný (kompaktní sloupce na mobilu).

**Mobil zůstane vodorovný.** Mezi kompaktní řadou soupeřů (končí na y 440) a mojí zónou
(začíná na y 660) je pásmo 220 px – dvě řady karet potřebují 320 px. V mobilním profilu
proto Fistful leží **zrcadlově vlevo od dobíracího balíčku** (rub 750, líc 640, y 540),
kde je ověřeně místo. Je to hodnota v profilu (`eventStack: 'vertical' | 'horizontal'`),
takže obě varianty počítá tentýž helper.

V intru dostane FF balíček pátý slot: `INTRO_FF_DECK = { x: 640, y: 540 }` (rozteč 160
jako u ostatních), odložená karta `INTRO_FF_ASIDE = { x: 640, y: 350 }`. Na herní pozici
sjede až na konci intra – tam už rozhoduje `eventPileSlots`.

### 3.4 Intro: beaty balíčku Fistful

Server (`server/intro.js`) pošle po HN beatech **stejnou trojici pro FF**:
`fistful_top` → `shuffle_fistful` → `fistful_bottom`.

**Sekvenčně, ne paralelně.** `_animateIntroShuffle` (view/intro.js) volá na začátku
`_clearIntroSprites()` a `shuffling(which)` porovnává právě jeden `sub` – dvě míchání
najednou by si smazala sprity. Paralelní varianta = refaktor míchačky na skupiny spritů
per balíček. Cena sekvenční varianty: intro se při obou rozšířeních prodlouží o ~7,6 s.

### 3.5 Cinematika odkrytí karty

`high_noon_reveal` se **rozšíří o pole `deck: 'hn' | 'ff'`** (default `'hn'`). Podle něj
klient vybere zdrojovou hromádku, cílový slot, texturu (`hn_<art>` / `ff_<art>`), rub
a počítadlo (`App.hnDeckLeft` / `App.ffDeckLeft`).

Server ve `flushHighNoonReveal` (server/anim.js) vyzvedne **obě** čekající odkrytí a pošle
je za sebou (HN první); blok botů se prodlouží na `2× hnRevealMs()`.

### 3.6 Redakce stavu

`redactState` (server/rooms.js) dnes **neschovává `eventDeck`** – hráč si v konzoli může
přečíst pořadí příštích událostí. Přidám ořez obou balíčků na pouhou délku (jako
`deck.cards`).

---

## 4. Fáze implementace

Každá fáze je samostatně nasaditelná: po každé je hra hratelná, `npm test` zelený,
commit zvlášť.

---

### FÁZE 0 — Infrastruktura druhého balíčku (bez pravidel) · L

**Cíl:** zapnutelné rozšíření, které v intru zamíchá vlastní balíček, každé kolo odkryje
kartu vedle balíčku a **nic nedělá**. Ověřitelné v prohlížeči na první pohled.

**Data**
- `cards.fistful.json` – 15 karet (id 400–414: `key`, `name`, `art`, `text`).
- `characters.json` + `logic/entities.js` – `FISTFUL_CHARACTERS`, ids 31–33 (zatím jen seznam).
- Placeholder textury: 15× `assets/fistful_cards/<art>.webp`, `assets/other_cards/fistful/fistful_back.webp`, `assets/characters/031–033.webp`. Vygeneruje `tools/placeholder.js` přes `sharp` (SVG s názvem → webp 650×1000 kvůli `normalizeTexture`). **Bez reálných souborů se hra nespustí** – `critical` assety blokují sestavení scény.

**Server / pravidla**
- `logic/fistful.js` (nový mixin): `_setupFistfulDeck`, `_flipFistfulEvent`, `_applyFfEventOnEnter` (zatím prázdné).
- `logic.js`: nová pole v konstruktoru + `require('./logic/fistful.js')`.
- `logic/highNoon.js`: `hasEvent` kouká na obě karty; `_flipEvent` otočí i FF; `_runBeginTurn` dostane nové (zatím no-op) kroky.
- `logic/setup.js`: `_setupFistfulDeck(options)` z obou setupů, `_characterPool` přidá FF postavy.
- `server.js`, `server/lifecycle.js`, `server/handlers.debug.js`: `cards.fistful.json` → `ctx.fistfulCardData` → `gs.fistfulCardData`.
- `server/rooms.js`: redakce `eventDeck`/`ffDeck`.
- `server/anim.js`: emit obou odkrytí, delší blok botů.
- `server/intro.js`: beaty `fistful_*` + `ffCount` v `init`.
- `core/gameLog.js`: do snapshotu `eventFf` + `ffLeft`.

**Klient**
- `index.html`: `<script src="logic/fistful.js">` za `logic/highNoon.js`.
- `core/layout.js`: `eventPileSlots()` + `eventStack` v obou profilech + zvednutí při hokynářství.
- `game.js`: `HN_PILE_X`/`HN_ACTIVE_X`/`HN_PILE_Y` **z konstant na funkce**, přidat FF varianty; `EXPANSION_LOADERS.fistful` (kritické: `ff_back` + karta `fistful_of_cards`).
- `view/board.js`: `drawHighNoonPile` → obecné `drawEventPile(ctx, slot, cfg)`, volané 2×. Tělo **byte-přesně**, mění se jen zdroj souřadnic/textur/počtu.
- `net/handlers.js`: větev `high_noon_reveal` respektuje `data.deck`.
- `view/intro.js`: `INTRO_FF_DECK`, `INTRO_FF_ASIDE`, tři nové `sub` větve (kopie HN větví), pátá hromádka, závěrečný přesun.
- `view/menu.js`: zaškrtávátko **Fistful of Cards** v create-room, hře botů i debugu.
- `state.js`: `App.ffDeckLeft`, `expansions.fistful`, `App.debugFistful`, `App.botGameExpansions.fistful`.

**Testy:** `test/fistful.test.js` – balíček má 15 karet, Fistful of Cards leží vespod,
`hasEvent` vidí obě karty zároveň, oba balíčky se otáčejí na tah šerifa a až od 2. kola,
vypnuté rozšíření = prázdný balíček. `test/layout.test.js` – `eventPileSlots` pro
1/2 balíčky, oba profily, poměry stran; sloupce nedosáhnou na sousedy.

**Ověření:** `node --check`, `npm test`, boot serveru, hra 4 hráčů s oběma rozšířeními –
**požádám tě o vizuální kontrolu intra a stolu.**

---

### FÁZE 1 — Tři postavy · M

#### Claus "The Saint" (4 životy)
- **Pravidlo:** ve fázi 1 si lízne `(počet hráčů ve hře) + 1` karet, pak dá po jedné každému ostatnímu hráči ve hře a zbylé 2 si nechá.
- **Kde:** `logic/draw.js` – větev v `startDrawPhase` (vzor Kit Carlson), `clausState`, `clausGive(cardIdx)`, socket `claus_give`.
- **Průběh:** odkryté karty vidí jen Claus (panel jako u Kita), obdarovaní po směru od Clause, za každou rozdanou kartou letí animace.
- **Hrany:** kolik si **nechá**, řídí `_drawCountFor` (Žízeň 1, Příjezd vlaku 3) – stejná dohoda jako u Kita; líže vždy `n+1`. Peyote jeho schopnost přebíjí (R8). Suzy a spol. se doberou z fronty až po celém rozdání.
- **Zrcadla:** `core/pending.js` (`CLAUS_GIVE`), `core/botPolicy.js`, panel ve `view/board.js`.

#### Uncle Will (4 životy)
- **Pravidlo:** 1× za svůj tah smí zahrát libovolnou kartu z ruky jako Hokynářství.
- **Kde:** `logic/characters.js` `useUncleWill(playerIdx, cardIdx)` – fáze `PLAY`, `_willUsedTurn !== turnId`, `_suitBlocked` (Želízka), odhoz karty → `openStore()`.
- **UI:** tlačítko schopnosti (vzor Doc Holyday) → klik na kartu v ruce.
- **Hrany:** Soudce nevadí (nic se nevykládá před hráče). Bot použije, když má ≥ 4 karty a nejhorší má nízké `keepScore`.

#### Johnny Kisch (4 životy)
- **Pravidlo:** kdykoli vyloží kartu do hry, všechny ostatní vyložené karty téhož jména se odhodí.
- **Kde:** `logic/characters.js` `_johnnyKischPurge(ownerIdx, cardName)`, volané ze všech tří míst, kudy jde karta na stůl: `playBoardCard`, větev `WEAPON` v `playCard`, větev `JAIL` v `playSpecialCard`.
- **Hrany:** prochází `board` i `weapon` všech hráčů; odhozený Dynamit **nevybuchne**, odhozené Vězení hráče **osvobodí**. Kocovina schopnost vypíná (`effectiveCharacter`). Animace odhozu `board_to_discard` s `exactAngle: true`.

**Testy:** `test/fistful.characters.test.js`.

---

### FÁZE 2 — Pasivní události: Léčka, Laso, Soudce · M

#### Léčka (`LECKA`)
- **Kde:** `core/distance.js` `computeDistance` – základ 1 místo výpočtu ze sedadel, **modifikátory platí dál** (Paul Regret, Rose Doolan, Mustang, Dalekohled) → `max(1, 1 + modifikátory)`.
- **Zrcadla:** žádná – funkce je sdílená serverem, klientem i botem. Do `core/distance.js` přibude standardní shim na `core/highNoon.js`; cyklus nevzniká.

#### Laso (`LASO`)
- **Kde:** `_boardDead()` v `logic/fistful.js`, zapojené přesně tam, kde už existuje analogický vypínač karet na stole u **Belle Star** (`_belleIgnoresBoard`):
  - dostřel zbraně → 1 (Colt);
  - Mustang/Skrýš/Dalekohled/Hledí → `computeDistance` je ignoruje;
  - Barel → `_beginBangResolution` i `_advanceMassAttack` ho nepočítají (**Jourdonnaisova vrozená schopnost platí dál** – není to karta);
  - Dynamit a Vězení → `handleStartOfTurnChecks` je přeskočí (žádné sejmutí, dynamit se neposouvá, vězení tah nebere);
  - zelené karty → `activateGreenCard` odmítne, zelené Vedle! ze stolu v `handleResponse` neprojde.
- **Zrcadla:** `core/playability.js` + `core/botPolicy.js` – **bez nich se hra zasekne**.
- **Hrany:** karty zůstávají ležet, po kole zase fungují.

#### Soudce (`SOUDCE`)
- **Kde:** `logic/play.js` – gate v `playCard` pro `WEAPON`/`EQUIPMENT`/`BARREL`/`DYNAMITE` a zelené karty; v `playSpecialCard` pro `JAIL`.
- **Zrcadlo:** jeden gate v `core/playability.js` (pokryje klienta i bota).
- **Hrany:** už vyložené karty fungují; aktivace zelené ze stolu i Hokynářství Uncle Willa jsou povolené.

---

### FÁZE 3 — Fáze lízání I: Pálenka, Právo západu · M

#### Pálenka (`PALENKA`)
- **Kde:** nový zdroj lízání `'liquor'` v `_getDrawOptions` (jen `isStartOfTurn`); `drawCard('liquor')` → `_heal(player, 1)` a rovnou `_finishDraw()` (tedy včetně Ranče/Želízek).
- **UI:** tlačítko u balíčku „🥃 Pálenka: +1 život místo lízání" (tam, kde se dnes nabízí volba Pedra/Jesseho).
- **Hrany:** platí i pro Kita (rozhoduje se dřív, než odkryje) a ducha (léčit se smí). Bot použije při zranění a ruce ≥ 3 karty.

#### Právo západu (`PRAVO_ZAPADU`)
- **Kde:** `logic/draw.js` – druhá karta, která ve fázi 1 doputuje do ruky, se zapíše do `player._lawCardId`. `tryEndTurn` (logic.js) odmítne ukončit tah, dokud `_lawForcedPlayable()` vrací true. Nuluje se na začátku tahu a v okamžiku, kdy karta odejde z ruky.
- **`_lawForcedPlayable`:** karta je v ruce **a** `cardPlayability === true` **a** (u Bang!/bang-efektu) existuje dosažitelný cíl. Bez druhé podmínky by šlo tah zamknout kartou Bang!, na kterou nikdo není v dostřelu.
- **Odkrytí ostatním:** `redactState` propustí v ruce tuhle jednu kartu, klient ji ve vějíři soupeře nakreslí lícem (analogie: druhá karta Black Jacka).
- **UI:** zlatý rámeček + hint; „Ukončit tah" zašedlé s vysvětlením.
- **Bot:** `decidePlay` zkusí vynucenou kartu jako první.
- **Hrany:** Žízeň (líže se 1) → žádná vynucená karta. Kit Carlson → druhá **ponechaná**. Peyote je z téhož balíčku, takže se nikdy nepotkají.

---

### FÁZE 4 — Fáze lízání II: Peyote a Ranč · L

#### Peyote (`PEYOTE`)
- **Kde:** `logic/fistful.js` `startPeyote()` volané hned na začátku `startDrawPhase` (přebíjí Kita/Jesseho/Pedra/Pata/Black Jacka/Clause), fáze `PEYOTE`, `pendingPeyote`, akce `peyote_guess { red }`.
- **⚠️ Výjimka z pravidel (tvoje zadání):** hádání se vyhodnocuje proti **vytištěné `card.suit`**, ne `_effSuit`. S Požehnáním/Prokletím (obojí z HN, může běžet zároveň) by jinak byla každá karta uhodnutá a hráč by si líznul celý balíček. Jakmile karta **dosedne do ruky**, platí pro ni přebarvení normálně – to je zadarmo, `_effSuit` se počítá až při použití. Bude to **jediné místo v kódu, kde se `card.suit` čte napřímo**, s velkým komentářem.
- **UI:** tlačítka „♥♦ Červená" / „♠♣ Černá"; odkrytá karta jede existující cinematikou sejmutí (`startCheckReveal`) a pak letí do ruky nebo do odhozu.
- **Hrany:** končí přes `_finishDraw()` s `isStartOfTurn: true`, aby navázala Želízka i Ranč. Došlý balíček se zamíchá standardní cestou.
- **Bot:** větev `PEYOTE` – hádá barvu, které je v odhozu vidět míň; pokračuje, dokud uhodne.

#### Ranč (`RANC`)
- **Kde:** `_startRanch()` z `_finishDraw` **za** Želízkami (HN má přednost), fáze `RANCH`, akce `ranch_exchange { cardIds }` (prázdné pole = přeskočit).
- **UI:** označování karet v ruce (druhý klik odznačí) + tlačítka „Vyměnit (N)" a „Přeskočit".
- **Hrany:** líznutí proběhne naráz (hráč už rozhodl). Suzy s prázdnou rukou nezůstane.
- **Bot:** vymění karty pod prahem `keepScore` (max 3), jinak přeskočí.

**Testy:** Peyote uhodl/neuhodl, přebíjí Kita, **Požehnání ho neovlivní**; Ranč vymění přesný počet, přeskočení funguje.

---

### FÁZE 5 — Opuštěný důl · L

Kvůli R7 je to nejinvazivnější karta rozšíření – má proto vlastní fázi.

**Pravidlo:** ve fázi 1 se líže z odhozu; **všechno, co během kola odejde od hráče, jde
lícem dolů na dobírací balíček** – včetně pozůstalosti vyřazeného hráče a ducha.

**Server – jeden trychtýř místo 35 volání**
- Nový `GameState._discard(...cards)` v `logic.js`: při aktivním dole `deck.cards.push(...)` (vrch balíčku, protože `draw()` popuje z konce), jinak `deck.discardPile.push(...)`.
- Mechanicky nahradit **~35 z 45** dnešních `deck.discardPile.push(...)`: `logic/play.js` (8 z 9), `logic/characters.js` (7 z 9), `logic/response.js` (6), `logic/dodgeCity.js` (3), `logic/combat.js` (3 – Sidova záchrana, pozůstalost, šerifova pokuta), `logic/highNoon.js` (1 – odchod ducha), `logic.js` (odhoz na konci tahu), `server/handlers.game.js` (3).
- **Beze změny zůstává** (dál do odhozu, viz 2.1): kontrolní karty v `logic/checks.js` (4) a `logic/play.js:326`, obě karty Lucky Duka (`logic/characters.js`), špatně hádaná karta Peyote a vnitřek `logic/entities.js` (míchání).
- Lízání: `_getDrawOptions` vrátí `['discard']` a větev `'discard'` v `drawCard` se uvolní i mimo Pedra Ramireze a i pro druhou/třetí kartu (dnes je vázaná na `cardsDrawn === 0`). Prázdný odhoz → **fallback na balíček** (jinak stall).

**Klient – „aby hráči věděli, co bylo zahráno"**
- `discardTopPos()` v `game.js` je už dnes **jediný cíl všech animací do odhozu** (včetně cinematiky vyřazení) – při aktivním dole vrátí vrch dobíracího balíčku. Tím se přesměrují všechny cesty naráz.
- Nový doběh letu: karta **dosedne lícem nahoru, vydrží ~900 ms a pak se překlopí na rub** a splyne s hromádkou (`animateCardFlip` už umí obojí). Odpovídá to i fyzické hře: kartu zahraješ lícem nahoru a teprve pak ji dáš lícem dolů na balíček.
- Fronta animací (`core/animQueue.js`) tím pádem drží stav o ~900 ms déle – doplnit do `ANIM_MS`.

**Hrany**
- Balíček během kola roste, takže k domíchání nedojde; odhoz se naopak vyprazdňuje.
- Karty na vrchu balíčku jsou „veřejně známé" – kdo si je pamatuje, ví, co si líznou ostatní z kontrolních sejmutí, Dostavníku nebo odměny za banditu. Je to záměr karty.
- **Bot:** větev `DRAW` musí umět „ber z odhozu, ať je nahoře cokoli" (dnes bere jen Bang!/Pivo/Vedle!) – jinak stall.

**Testy:** zahraná karta skončí na balíčku a lízne si ji další hráč; odhoz na konci tahu
taky; kontrolní karta zůstane v odhozu; prázdný odhoz → líže se z balíčku.

---

### FÁZE 6 — Start tahu: Pokrevní bratři, Fistful of Cards, Mrtvý muž · L

#### Pokrevní bratři (`POKREVNI_BRATRI`)
- **Kde:** začátek `startDrawPhase` (tedy až po kontrolách na Dynamit/Vězení – ve vězení hráč tah přeskakuje a nedaruje nic), vzor pauzy Very Custer. Fáze `BLOOD_BROTHERS`, akce `blood_brothers { targetIdx | null }`.
- **Hrany:** nabídne se jen při `health ≥ 2` a existujícím cíli **se zraněním** (R9). Ztráta jde přes `handleDamage(idx, null)` → **Bart Cassidy si lízne, El Gringo nekrade** (není útočník). Když se tím naplní fronta, lízání se dokončí až po ní. 1× za tah (`_bbOfferedTurn === turnId`).
- **UI:** overlay „Dát 1 život?" + zvýraznění cílů + „Ne, děkuji".

#### Fistful of Cards (`FISTFUL_OF_CARDS`)
- **Kde:** krok 5 `_runBeginTurn` → `pendingFistful = { playerIdx, hitsLeft: hand.length }`, každý zásah přes `_beginBangResolution(null, idx, false, 'Fistful of Cards')`.
- **Bez útočníka:** `handleDamage(idx, null)` už používá dynamit; `effectiveCharacter(undefined)` vrací null, takže Slab ani Belle Star se nechytnou, **El Gringo nekrade** a **za zabití nedostane nikdo odměnu** – stejně jako u dynamitu.
- **Průběh:** po každé reakci další zásah – hák v `handleResponse` i `_advanceAfterLastLifeSave` (větev „ostatní"). Barel, Vedle!, zelené Vedle! i Pivo na posledním životě fungují na každý zásah zvlášť.
- **Hrany:** počet zásahů se **zmrazí na začátku** (hraní Vedle! ruku zmenšuje). Smrt uprostřed → zbytek se zahodí. Prázdná ruka → krok se přeskočí. **Ducha míjí** (R10).

#### Mrtvý muž (`MRTVY_MUZ`)
- **Kde:**
  - `logic/combat.js` `handlePlayerDeath`: `this._firstDeadIdx ??= deadIdx` a `p._roleRevealed = true` (nezávisle na rozšíření – laciné a řeší to i redakci);
  - `logic.js` `nextTurn`: hráče `_firstDeadIdx` **nepřeskakovat**, když je událost aktivní a návrat ještě nebyl použit (mechanismus Města duchů);
  - `logic/fistful.js` `_deadManReturn()` (krok 0): `health = 2`, `_deadManUsed = true`, do fronty `{ type: 'KILL_REWARD', playerIdx, cardsNeeded: 2 }` (hráč si klikne 2 karty – existující animace).
- **Hrany:**
  - **S Městem duchů:** první vyřazený se vrací **doopravdy**, ostatní jako duchové (test na návrat je dřív než `_ghost`).
  - **Role zůstává odkrytá** → redakce se ptá přes `_roleRevealed`, ne přes `health <= 0`.
  - Vrací se **natrvalo**; `checkWinCondition` se po návratu zavolá.
  - Karta role zmizí ze slotu → `_roleSlot` (view/board.js) a `hasRoleCard` (positions.js) se musí měnit **spolu**.

---

### FÁZE 7 — Ruská ruleta a Vendeta · L

#### Ruská ruleta (`RUSKA_RULETA`)
- **Pravidlo:** při příchodu karty do hry každý od šerifa po směru odhodí kartu s efektem Vedle!; první, kdo nemůže, ztrácí 2 životy a efekt končí. **Kolečko se opakuje**, dokud někdo neselže.
- **Interaktivní (R5):** nová fáze `ROULETTE_DISCARD`, `pendingRoulette = { queueIdx }`, akce `roulette_discard { fromBoard, cardId | cardIdx }`.
  - Klikatelné: karty z ruky (`MISSED`, `UHYB`, u Calamity Janet i `BANG`, **u Eleny Fuente cokoli**) **a zelené karty na stole s `activate === 'miss'`**.
  - Odhod je **povinný** – nic jiného se nezvýrazní, „přeskočit" neexistuje.
  - Kdo nemá žádnou, dostane zvýrazněné **jen životy** → klik = 2 zásahy.
- **Zásahy:** recykluje se klikací fáze dynamitu – `pendingDynamiteDamage = { playerIdx, hitsLeft: 2, source: 'ROULETTE', resume: 'BEGIN_TURN' }`. Tím zdarma funguje záchrana Pivem i Sidem, guard, klient i bot; mění se jen popisek a to, kam se po dobrání pokračuje.
- **Hrany:** ducha se netýká (R10). Kdo odhozením přijde o poslední kartu (Suzy), doberou se odložené akce až po celém kolečku. Když zásahy někoho zabijí, start tahu pokračuje po smrti (`_resumeBeginTurnAfterQueue`).
- **Zrcadla:** `core/pending.js` (`ROULETTE_DISCARD`), `core/botPolicy.js` (odhodí nejhorší kartu s efektem Vedle!, zelenou ze stolu až jako poslední možnost), zvýraznění ve `view/board.js`.

#### Vendeta (`VENDETA`)
- **Kde:** `logic.js` `nextTurn` – gate úplně nahoře (**před `_teardownGhost`**, protože duch Vendetu dostává): hráč je ve hře, událost aktivní, `!_vendettaDone` → sejmutí přes existující `CHECK_DRAW` s `reason: 'VENDETTA'` (a tedy i s Lucky Dukem zdarma).
- **Vyhodnocení:** `_applyCheckResult` větev `VENDETTA`: ♥ podle `_effSuit` (Požehnání pomáhá, Prokletí zabíjí) → `_vendettaExtraTurn()`, jinak normální `nextTurn`.
- **Tah navíc:** `turnId++`, `_extraTurn = true` (přeskočí `_flipEvent`, R6), `_vendettaDone = true`, pak `_beginTurn()` + `handleStartOfTurnChecks()` pro **stejného hráče**. Dynamit (i ten vyložený v první půlce tahu), vězení, Pravé poledne i Fistful proběhnou znovu.
- **Duch (R10):** ruku odhodil už v `tryEndTurn` (limit = 0 životů), `_ghost` zůstává, `_teardownGhost` se nespustí → nový tah zase jako duch, znovu si líže 3.
- **Hrany:** `_vendettaDone` se nuluje při přechodu na jiného hráče. Ukončení tahu smrtí Vendetu nespouští.
- **Zrcadla:** `core/pending.js` + `describePendingCheck` (co se líže a proč). Bot je pokrytý existující větví `CHECK_DRAW`/`CHECKING`.

---

### FÁZE 8 — Nové útoky: Odstřelovač a Odražená střela · L

#### Odstřelovač (`ODSTRELOVAC`)
- **Kde:** recykluje se **„odhoď další kartu"** z Dodge City (`startDiscardExtra` / `discardAnotherCard`): hráč zvolí cíl, pak zaplatí druhou kartou. Nový efekt `'sniper'` s validací, že zaplacená karta je Bang! (u Calamity Janet i Vedle!).
- **Vyhodnocení:** `waitForMissed(...)` s `missesRequired = 2`, **bez barelového checku** (R4) – jde se rovnou do `RESPOND`.
- **Limit:** `bangsPlayedThisTurn++`, blokuje ho Kazatel (R4).
- **UI:** klik na Bang! → tlačítko „🎯 Odstřelovač (2× Bang!)" (jen když je v ruce druhý Bang! a událost běží) → klik na cíl → výběr platící karty.
- **Bot:** obrana zdarma (větev `RESPOND` už umí `missesRequired = 2` kvůli Slabovi). Útok: 2+ Bang! a cíl je jistý nepřítel s ≤ 2 kartami.

#### Odražená střela (`ODRAZENA_STRELA`)
- **Kde:** `logic/fistful.js` `playRicochet(attackerIdx, targetIdx, area, cardIdx)`. Díky R3 se dá **beze zbytku recyklovat `_beginBangResolution`** – barelový check, Jourdonnais i Slabovy dvě Vedle! fungují samy. Přidá se jen `ricochet: { area, cardId }`, které se protáhne přes `pendingBarrelCheck` do `pendingResponse`.
- **Vyhodnocení:** ve větvi „hráč neuhnul" se místo `handleDamage` **odhodí cílová karta** (dohledaná podle `cardId`, ne indexu – mezitím se mohla posunout).
- **Validace:** fáze `PLAY`, karta v ruce je Bang! (Calamity Janet i Vedle!), cíl ≠ já, cílová karta existuje, **dostřel platí** (R1), Želízka, Apache Kid (R3). **Do limitu 1× Bang!/tah se nepočítá** (R2).
- **UI:** s vybraným Bang! se rozsvítí **karty na stolech soupeřů**. Klient už umí klikat na cizí karty ve stole (`handlePanicCBClick`), rozšíří se jen podmínka interaktivity.
- **Animace:** Bang! letí z ruky na cílovou kartu; při neubránění letí cílová karta do odhozu (`board_to_discard`, `exactAngle: true`).
- **Hrany:** střelba na Dynamit/Vězení je legální (a je to hlavní taktika) – zasažené Vězení hráče osvobodí, odhozená zbraň se vrací na Colt .45.
- **Bot:** obrana přes `RESPOND` (brání jen kartu s `boardCardValue` nad prahem). Útok: sestřelí nepříteli Barel/Mustang/zbraň, když má Bang! navíc.

---

### FÁZE 9 — Bot, zátěž, dokumentace · M

- Doplnit `core/botPolicy.js` o všechny nové větve `pendingActor` (`PEYOTE`, `RANCH`, `BLOOD_BROTHERS`, `CLAUS_GIVE`, `ROULETTE_DISCARD`) – **každá chybějící větev = zaseknutá hra**.
- `test/server.bots.test.js`: zátěžová hra jen botů pro **3–8 hráčů** ve všech kombinacích rozšíření (`dodge_city × high_noon × fistful`) + varianty „balíček samých X" pro nejrizikovější karty (Peyote, Opuštěný důl, Fistful of Cards, Ruská ruleta, Vendeta, Mrtvý muž).
- Guard (`server/guard.js`): ověřit autorizaci nových akcí.
- `CLAUDE.md`: nová sekce „Fistful of Cards" (dva balíčky, pořadí HN → FF, výjimka Peyote, trychtýř odhozu) + řádky v tabulkách souborů.
- Smazat `PLAN-FISTFUL.md`.

---

## 5. Rizika

1. **Zaseknutá hra kvůli chybějícímu zrcadlu.** Historicky nejčastější chyba v projektu:
   server akci odmítne, bot ji pošle znovu, stav se nezmění → nekonečno. Každé nové
   pravidlo, které něco *zakazuje* (Soudce, Laso, Právo západu, Želízka × cokoli), musí
   mít zrcadlo v `core/playability.js` **i** v `core/botPolicy.js`.
2. **Trychtýř odhozu (fáze 5)** sahá na ~30 míst v pravidlech. Riziko je nízké (mechanická
   záměna), ale musí projít celý `npm test` a zátěž botů; dělám ho proto samostatným commitem.
3. **Render neumím ověřit** – po fázích 0, 4, 5, 6, 7 a 8 tě požádám o kontrolu v prohlížeči.
4. **Delší intro** při obou rozšířeních (~+7,6 s).
5. **Rozpočet postav:** 8 hráčů × 2 nabídky = 16; základ má přesně 16, s Fistfulem 19,
   s Dodge City 31/34. Smoke test na `setupGame(8)` ve všech kombinacích platí dál.
6. **Dvě aktivní události najednou** je stav, který dosud nemohl nastat. Vlastní test dostanou
   dvojice: Peyote × Požehnání, Mrtvý muž × Město duchů, Vendeta × Město duchů,
   Fistful × Pravé poledne, Laso × Vězení/Dynamit, Ranč × Želízka.
7. **Placeholder textury** musí ležet v `assets/` jako reálné soubory, jinak se hra kvůli
   `critical` assetům nesestaví.
