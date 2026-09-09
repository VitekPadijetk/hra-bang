# Zlatá horečka (Gold Rush) — implementační plán

Podklady: [`docs/zlata-horecka.md`](zlata-horecka.md) (texty karet, ceny, oficiální FAQ
Q01–Q15) + PDF `zh_rules_cz.pdf` / `zh_rules_eng.pdf` / `zh_faq_eng.pdf` a sken karet
`zh_karty_dvgiochi.webp`.

**Zdroj pravdy pro text karty bude český art** v `assets/zlata_horecka_cards/`, až dorazí —
hráč ho vidí ve hře. Do té doby platí tisk z galerie dV Giochi (viz podklad). FAQ slouží
k výkladu sporných míst.

Výchozí stav (ověřeno 2026-09-07): `npm test` = **1368 testů, 0 chyb**, 19 sad.

> **Stav: hotové fáze 0 a 1** (2026-09-09).
> **Fáze 0** — data, mixin `logic/goldRush.js`, `player.nuggets` a `player.gear`, trychtýř
> `_afterLifeLost` ze všech tří vstupů, zisk valounu v `handleDamage`, přepínač ve všech
> třech lobby obrazovkách, redakce `gearDeck` a zobrazení valounů u hráče.
> **Fáze 1** — hromádky vybavení a jejich pravidlo o zamíchání, obchod s okamžitým
> doplněním, nákup (hnědé i černé), vynucené odhození, Pivo za valoun, **Panák**
> a **Union Pacific**, zrcadlo `core/goldRush.js`, fáze `GEAR_TARGET`, větve bota,
> okno obchodu na klientovi a odhození vybavení při vyřazení hráče.
> `npm test` = **1414 testů, 0 chyb** (nová sada `test/goldRush.shop.test.js`
> + invarianty rozložení v `test/positions.test.js`).
> Odchylky od plánu jsou popsané u fází 0 a 1 v §9.

> **Assety zatím nejsou.** Plán je proto napsaný tak, aby se dal odpracovat celý bez nich
> (§2.8 říká, co se s chybějícím artem děje) a aby se **jména karet daly doplnit na jednom
> místě**, až art dorazí — pravidla se na jméno nikde neptají, ptají se na `effect`.

---

## 0. V čem je tohle rozšíření jiné než všechna dosavadní

Divoký západ, High Noon i Fistful přidávaly **balíček událostí**: jedna karta platí pro
celý stůl, odkryje se a mění pravidla. Zlatá horečka nepřidává **žádnou událost**. Přidává:

1. **měnu** (zlaté valouny) — nový trvalý stav u hráče, který roste za způsobená zranění;
2. **obchod** — čtvrtou hromádku na stole, ze které se **kupuje** ve fázi 2;
3. **druhou vrstvu karet před hráčem** — vybavení, které je záměrně **imunní** vůči všemu,
   co dnes umí sahat na karty na stole;
4. **variantu** (Stínoví pistolníci), která mění, co znamená „vyřazený hráč".

Tři z těch čtyř věcí jsou nová **kolmá** osa, ne další karta do existující mašinerie —
proto plán začíná infrastrukturou a teprve pak jde karta po kartě.

### Rozhodnutí, která plán fixuje (ke schválení)

| # | Věc | Rozhodnutí plánu | Proč |
|---|---|---|---|
| **R1** | Jméno `ZLATA_HORECKA` už je obsazené | Rozšíření = `options.expansions.zlata_horecka`, data `cards.zlata_horecka.json`. Karty vybavení **nedostanou `key`** do jmenného prostoru událostí, ale `effect` kód (`ZH_BOTY`, `ZH_PODKOVA`, …). Pravidla se na jméno karty **nikde neptají**. | `ZLATA_HORECKA` je dnes klíč karty **událostí High Noonu** (id 305, hra proti směru) a `hasEvent` se nikdy neptá, z kterého balíčku klíč je. Kdyby vybavení do toho prostoru vstoupilo, kolidovalo by. Navíc **jedna z karet vybavení se česky jmenuje taky „Zlatá horečka"** (Gold Rush, cena 5) — kolize je trojitá a jediná obrana je nepoužívat jméno jako identitu. |
| **R2** | Slovo „Vybavení" je v kódu obsazené | Karty Zlaté horečky se v kódu jmenují **`gear`** (`player.gear`, `gearDeck`, `gearRow`). V UI zůstanou „vybavení" podle pravidel. | `CardType.EQUIPMENT = 'Vybavení'` už nesou **Hledí a Mustang**. Sdílet jméno typu by znamenalo, že každá dnešní podmínka `type === 'Vybavení'` začne chytat i karty Zlaté horečky. |
| **R3** | Kde vybavení leží | **`player.gear` — vlastní pole, NE `player.board`.** | Pravidla říkají, že vybavení **nemůže být cílem Paniky, Cat Balou ani schopností (jmenují Pata Brennana)** a že ho **Vulture Sam nedostane**. Vlastní pole to zaručí **strukturálně**; kdyby leželo v `board`, musela by se výjimka dopsat do `resolveCardSelection`, Daltonů, Belle Star, `_johnnyKischPurge`, snímku pro animaci smrti, `boardCardValue` bota, výběru cílů v `playability` i do kreslení slotů — a stačilo by jedno zapomenuté místo. Cenou je, že se musí **vyjmenovat, kdo gear naopak vidět MÁ** (§2.4); ten seznam je krátký a explicitní. |
| **R4** | Zásoba valounů | **Nemodeluje se.** `player.nuggets` je jen číslo. | Pravidla sama říkají: „pokud v zásobě valouny dojdou, použijte vhodnou náhradu". 30 žetonů je omezení krabice, ne pravidlo. |
| **R5** | Ztráta života má v kódu **tři** vstupy | Přibude jeden trychtýř **`_afterLifeLost(playerIdx, { attackerIdx, last })`**, volaný ze všech tří. | Valoun útočníkovi stačí věšet na `handleDamage`, ale **Boty, Talisman a Simeon Picos reagují na ztrátu života z JAKÉHOKOLI zdroje** — a `takeDynamiteHit` (dynamit, Madam Zuzana, Roubík) i `useChuckWengam` jdou mimo `handleDamage`. Bez trychtýře by Talisman tiše nefungoval zrovna na dynamitu. Je to stejný vzor jako `hasAbility` — jeden dotaz místo tří kopií. |
| **R6** | Obchod není fáze | Nákup je **akce ve fázi `PLAY`**, ne přechod stavu. | Hokynářství je fáze, protože se čeká na **všechny hráče**. Z obchodu kupuje jen hráč na tahu a kolikrát chce — fáze by zbytečně zamkla `pendingActor` a bot by v ní musel mít větev. |
| **R7** | Doplňování obchodu | **Okamžitě po nákupu.** | Anglický originál to má jednoznačně a **česká pravidla obsahují obě věty** (viz podklad §Rozpory) — ta o konci tahu je překladatelský artefakt. |
| **R8** | Podkova × Lucky Duke | **Sčítají se**: každý dává „o kartu navíc". Lucky Duke sám 2, Podkova sama 2, obojí 3. U Rumu 4 / 5 / 6. | Text obou zní „o kartu navíc" a FAQ Q05 tu aritmetiku potvrzuje pro Rum (4 → 5 u Lucky Duka). Nic v podkladu neříká, že se nesčítají. |
| **R9** | Soudce (Fistful) × nákup | **Blokuje nákup karet, které někomu skončí před ním** (černý rám a Wanted!), hnědé ne. | Soudce říká „hráči nesmí vykládat karty před sebe ani před ostatní hráče". Dnešní `_judgeBlocks` se ptá na kartu Z RUKY jen proto, že jiná cesta na stůl neexistovala. **Snadno se otočí**, kdyby se ukázalo jinak — je to jedna podmínka v `_gearBuy`. |
| **R10** | Laso (Fistful) a Belle Star × vybavení | **Vypínají i vybavení** (včetně Wanted!). | Obojí je „karta na stole". `_boardDead()` je jediný dotaz na Laso, takže se to ptá na jednom místě; Belle Star potřebuje totéž. |
| **R11** | Vulture Sam / Greg Digger / Herb Hunter × vybavení | Vybavení **nedostanou**, ani při běžném vyřazení. | Pravidla to říkají výslovně u Vulture Sama; u varianty Stínoví pistolníci to FAQ Q09 rozšiřuje. Z R3 to plyne samo. |
| **R12** | Jacky Murieta a limit BANG! | Přibude **`player._extraBangs`** (zaplacené výstřely navíc), ne nový parametr `_bangLimit()`. | `_bangLimit()` i zrcadlo `bangLimitFor(state)` jsou dnes bez hráče. Přidat parametr by znamenalo měnit obě strany švu a všechny volající; přičíst zaplacený kredit jsou **dva řádky** ([logic/play.js:161](../logic/play.js#L161), [core/playability.js:561](../core/playability.js#L561)) a je to i sémanticky přesnější. |
| **R13** | Postavy do ostré hry | Jako u Divokého západu: `GOLD_RUSH_READY` roste s fázemi, v debug hře jdou vybrat všechny. | Osvědčený vzor `WILD_WEST_READY` — dá se hrát dřív, než je hotových všech osm. |
| **R14** | Stínoví pistolníci | **Vlastní přepínač `options.shadowGunslingers`**, nezávislý na rozšíření, implementovaný **až nakonec** (fáze 7). | Pravidla to výslovně dovolují („můžete použít i bez rozšíření"). Je to zdaleka nejinvazivnější část a nemá cenu jí blokovat zbytek. |
| **R15** | Wanted! na sobě samém | Smí se zahrát i **na sebe** (FAQ Q07 „před sebe, nebo před jiného hráče"), ale **odhodit si vlastní vybavení zaplacením nejde** (FAQ Q10). | Doslova z FAQ. |

---

## 1. Co rozšíření obsahuje

**24 karet vybavení v 15 druzích** (13 hnědých / 11 černých kusů), **8 postav se 4 životy**,
**1 karta role** (Stínový odpadlík) a **valouny**. Kompletní tabulka s cenami a texty je
v [podkladu](zlata-horecka.md#karty-vybavení-24-karet-v-15-druzích).

Art **chybí celý** — potřeba 24 karet vybavení, 8 portrétů (042–049), rub balíčku vybavení,
oboustranná karta stínového odpadlíka a ikona valounu (§2.8).

---

## 2. Infrastruktura

### 2.1 Data

Nový **`cards.zlata_horecka.json`**. Schéma **není** podle `cards.divoky_zapad.json`
(to jsou karty událostí), ale blíž `cards.json` — jsou to hrací karty s cenou:

```json
{ "id": 601, "effect": "ZH_PODKOVA", "name": "Podkova", "art": "podkova",
  "border": "black", "cost": 2, "copies": 1,
  "text": "Pokaždé, když „otáčíš!“, odkryj o kartu navíc a vyber výsledek." }
```

- **`id` 600–614** (15 druhů; 600 = `ZH_PANAK`, ať je řada souvislá jako 300/400/500).
- **`effect`** je identita karty v pravidlech — **jediné, na co se kód ptá**. Jméno je
  jen k zobrazení (R1).
- **`copies`** rozbaluje balíček na 24 kusů; každý kus dostane vlastní `id`
  (`600`, `600.1`, `600.2` → radši `6000/6001/6002`, ať je `id` číslo a `_trackCard`
  i animace fungují beze změny).
- **`border`**: `"brown"` = efekt hned, `"black"` = leží před hráčem.
- Karty vybavení **nemají `suit` ani `value`** — nejsou to karty hracího balíčku, nikdy se
  neotáčí při „otoč!" a nedají se odhodit do běžného odhozu.

Postavy do `characters.json` jako **id 42–49** a do `logic/entities.js` jako
`GOLD_RUSH_CHARACTERS` + `GOLD_RUSH_READY` (přidá je `_characterPool` při
`exps.zlata_horecka`, viz [logic/setup.js](../logic/setup.js)):

```
"Don Bell", "Dutch Will", "Jacky Murieta", "Josh McCloud",
"Madam Yto", "Pretty Luzena", "Raddie Snake", "Simeon Picos"
```

Všech osm má **4 životy**, takže `healthForCharacter` ([core/roles.js](../core/roles.js))
**nepotřebuje ani řádek** — 4 je default. (Kontrast s Divokým západem, kde Big Spencer 9
vynutil celou dráhu životů.)

`CHAR_RANK` v [core/botPolicy.js](../core/botPolicy.js) **musí dostat všech 8** — neznámá
postava spadne na 0 a bot si ji nikdy nevybere; hlídá to test.

### 2.2 Nový mixin `logic/goldRush.js`

Zrcadlí `logic/wildWest.js`. Drží **všechno, co nemá domov jinde**:

| Skupina | Metody |
|---|---|
| setup | `_setupGearDeck(options)` |
| ekonomika | `_gainNugget(playerIdx, n)`, `_payNuggets(playerIdx, n)`, `_afterLifeLost(...)` |
| obchod | `_gearRefill()`, `gearBuy(playerIdx, rowIdx)`, `gearForceDiscard(playerIdx, targetIdx, gearIdx)`, `beerForNugget(playerIdx, cardIdx)` |
| dotazy | `_hasGear(playerIdx, effect)`, `_gearDead(playerIdx)` (Laso/Belle Star, R10), `_gearCost(playerIdx, card)` (Pretty Luzena) |
| hnědé karty s volbou | `_startGearMode(...)`, `gearModePick(...)`, `gearTargetPick(...)` |
| placené karty | `gearPanUse`, `gearRucksackUse` (i mimo tah, §4) |
| postavy | `joshMcCloudDraw`, `raddieSnakeDraw`, `jackyMurietaPay`, `dutchWillDiscard`, `_donBellCheck`, `_madamYtoDraw` |

Připojení na `GameState.prototype` stejným vzorem jako ostatní mixiny
(viz „Mixin pattern" v [CLAUDE.md](../CLAUDE.md)) + `<script>` v `index.html` **po `logic.js`**
+ `require` na konci `logic.js`.

**Zrcadlo pro klienta a bota** je nový `core/goldRush.js`: `gearOf(state, i)`,
`hasGearFor(state, i, effect)`, `gearCostFor(state, i, card)`, `canAffordFor(...)`,
`gearBuyOffer(...)`. Stejný důvod jako u `core/highNoon.js` — **server, klient i bot se
musí ptát jedním predikátem**, jinak klient nabídne nákup, server ho mlčky odmítne a hra
jen botů se zasekne.

### 2.3 Valouny: kde přibývají

**Zisk útočníka** má jediné místo — `handleDamage` ([logic/combat.js:5](../logic/combat.js#L5)):

```js
handleDamage(targetIdx, attackerIdx = null) {
    …
    target.health--;
    …
    // Zlatá horečka: valoun za KAŽDÉ způsobené zranění (Kulomet ve 4 hráčích = 3 valouny).
    if (attackerIdx !== null && attackerIdx !== targetIdx) this._gainNugget(attackerIdx);
```

Tím se **zdarma veze i příklad z pravidel**: Kulomet i Indiáni jdou přes `_advanceMassAttack`
→ `handleDamage` jednou za oběť, Duel taky. Ověřit testem, ne úvahou.

**Co jde mimo `handleDamage`** (a proč to nevadí pro zisk útočníka): výbuch dynamitu
(`takeDynamiteHit`, není útočník), Fistful of Cards / Pravé poledne (událost, ne hráč),
Madam Zuzana a Roubík (pokuta sobě), Chuck Wengam (dobrovolná ztráta). Ani v jednom případě
nikdo nikomu zranění *nezpůsobil*, takže valoun nikomu nepatří.

**Reakce oběti** (Boty, Talisman, Simeon Picos) ale platí **na všechny** ty zdroje — proto
R5. `_afterLifeLost(playerIdx, { attackerIdx, last })` se volá ze tří míst:

| místo | `last` |
|---|---|
| [logic/combat.js](../logic/combat.js) `handleDamage` | `target.health <= 0` |
| [logic/combat.js](../logic/combat.js) `takeDynamiteHit` | `p.health <= 0` |
| [logic/characters.js](../logic/characters.js) `useChuckWengam` | vždy `false` (nemůže na poslední) |

`last: true` **vypíná Boty i Talisman** („neúčinkují při ztrátě posledního života"), Simeona
Picose ne — jeho text tu výjimku nemá.

**Boty líznou kartu → do fronty odložených akcí**, ne rovnou. Je to přesně tvar Barta
Cassidyho (`specialActionQueue.push({ type: 'GEAR_BOOTS_DRAW', … })`) a platí pro ně celé
pravidlo „nejdřív doběhne efekt zahrané karty" i `_pruneSuzyQueue`. Vlastní typ, ne
recyklace `BART_DRAW` — log i animace mají říkat správnou příčinu.

### 2.4 Vybavení: `player.gear`

Nové pole na `Player` ([logic/entities.js](../logic/entities.js)): `this.gear = []`,
`this.nuggets = 0`.

**Kdo gear vidět MUSÍ** (úplný seznam — všude jinde se `board` nesahá):

| místo | co dělá |
|---|---|
| `handlePlayerDeath` ([logic/combat.js](../logic/combat.js)) | odhodí gear **na spodek balíčku vybavení**, ne do odhozu; Vulture Samovi ho **nedá** |
| `_handLimit` ([logic.js:296](../logic.js#L296)) | Opasek → 8 |
| `startDrawPhase` ([logic/draw.js](../logic/draw.js)) | Krumpáč → +1 karta ve fázi 1 |
| `startBarrelCheck` / `triggerCheckDraw` / `resolveCheck` (5 míst Lucky Duka) | Podkova (§4) |
| `_afterLifeLost` | Boty, Talisman |
| `computeCanHit` / obrana proti kárám | Kalumet |
| `redactState` ([server/rooms.js](../server/rooms.js)) | gear je **veřejný**, jen se nesmí prozradit pořadí `gearDeck` |
| `view/board.js`, `positions.js` | druhá řada karet před hráčem + počet valounů |
| `core/botPolicy.js` | ocenění nákupu, `gearValue` |

**Kdo se ho naopak ptát NEMÁ** (a díky R3 nemusí): `resolveCardSelection`, Daltonové,
Belle Star (jen přes `_gearDead`, ne přes výběr karty), `_johnnyKischPurge`, `_deathAnimData`,
Pat Brennan, Rvačka, Ragtime, Krytý vůz.

**„Ne dvě stejného jména"** je stejné pravidlo jako u modrých karet — ale ptá se na
`effect`, ne na `name` (R1).

### 2.5 Balíček vybavení a obchod

Tři pole ve stavu: **`gearDeck`** (lícem dolů), **`gearRow`** (3 karty lícem vzhůru),
**`gearPile`** (odhozené, lícem vzhůru **na spodku** `gearDeck`).

Pravidlo o zamíchání je nezvyklé a **nedá se odbýt polem**:

> Jakmile se na vrchu balíčku vybavení objeví karta lícem vzhůru, balíček se zamíchá
> a vytvoří se nový lícem dolů.

Odhozené karty se tedy vracejí **pod** balíček a v okamžiku, kdy se k nim líznutí dohrabe,
se **celý balíček zamíchá**. Implementovat jako malou třídu **`GearDeck`** v
`logic/entities.js` s metodami `draw()`, `discard(card)`, `size()` a příznakem `faceUpFrom`
(index, od kterého jsou karty lícem vzhůru) — ze stejného důvodu, proč se na hlavní
hromádky sahá **jen přes `Deck`** (viz Konvence v CLAUDE.md): jinak si `gearDeck.push()`
napíše každý po svém a pravidlo o zamíchání se rozejde.

**Nákup** (`gearBuy`) v jednom místě řeší: cenu (`_gearCost` kvůli Pretty Luzeně), zaplacení,
Soudce (R9), sundání karty z `gearRow`, **okamžité doplnění** (R7) a rozvětvení podle
`border`:

- `black` → do `player.gear` (kontrola „ne dvě stejného `effect`"),
- `brown` → efekt hned a karta **na spodek** `gearDeck`.

**Vynucené odhození** (`gearForceDiscard`): cena karty **+ 1**, jen cizí gear (R15), vlastník
se nebrání, karta na spodek balíčku.

**Pivo za valoun** (`beerForNugget`): vlastní akce, ne větev `playCard` — hráč musí umět
říct „tohle Pivo chci na zlato". Kontroluje se `_beerBlocked()` (Reverend) stejně jako
u léčení? **Ne** — Reverend zakazuje *zahrát Pivo*, takže i tuhle cestu; ale limit „dva
hráči → Pivo nemá efekt" tady **neplatí** (FAQ Q11). Madam Yto se spouští i tady (FAQ).

### 2.6 Stav a redakce

Do konstruktoru `GameState`: `gearDeck`, `gearRow: [null, null, null]`, `gearPile`,
plus per-kartu/postavu `pendingGearMode`, `pendingGearTarget`, `_panUsedThisTurn`,
`_luzenaUsedThisTurn`, `_raddieUsedThisTurn`, `_donBellDone`.

Na `Player`: `gear`, `nuggets`, `_extraBangs`.

`redactState` ([server/rooms.js](../server/rooms.js)):

- **skrýt** `gearDeck` (pořadí = příští karta v obchodě) — stejně jako `eventDeck`/`ffDeck`/`wwsDeck`,
- **veřejné** `gearRow`, `gearPile`, `player.gear`, `player.nuggets` — pravidla říkají
  „pokládejte viditelně před sebe".

**Nové pole ve stavu = zkontroluj redakci** (konvence v CLAUDE.md) — `gearDeck` je jediné,
co se skrývá, ale zapomenout na něj by znamenalo, že klient zná příští nabídku obchodu.

### 2.7 Rozložení stolu

**Tohle je jediná část plánu, kterou nejde ověřit bez prohlížeče** (viz „Render neumím
vizuálně ověřit" v CLAUDE.md), takže je záměrně napsaná jako **návrh k odsouhlasení**,
ne jako hotové souřadnice.

Přibývají tři věci:

1. **Obchod** = rub balíčku + 3 karty lícem vzhůru. Vodorovný pás `y ≈ 540` je už dnes
   obsazený: dobírací 870, odhoz 1050, High Noon 1170/1280, Fistful 750/640, Divoký západ
   530/420 (mobil). **Návrh: obchod dostane vlastní řádek** (`y ≈ 300`, nad pásem balíčků),
   protože je 4 sloty široký a do zbytku pásu se nevejde ani na desktopu.
2. **Valouny u hráče** — číslo s ikonou vedle karty životů. Nemá vlastní geometrii, jen
   další prvek do `drawMyArea` / `drawOpponents`.
3. **Vybavení před hráčem** — druhá řada vedle `board`. `boardBand`/`boardSlot`
   ([core/layout.js](../core/layout.js)) dnes počítá s **jedním** pásem; gear potřebuje
   buď druhý pás, nebo sdílet sloty s jiným zvýrazněním. **Návrh: sdílet pás, gear odlišit
   rámečkem** — hráč jich reálně mívá 1–3 a druhý pás by na mobilu nebyl kam dát.

`test/layout.test.js` + `test/positions.test.js` dostanou invariant „obchod se nepřekrývá
s žádným balíčkem událostí ani s kartami hráčů" pro **všechny kombinace** zapnutých
rozšíření × oba profily × 3–8 hráčů — přesně jako ho dostal Divoký západ.

### 2.8 Assety (dodá uživatel)

| Co | Kam | Formát |
|---|---|---|
| 15 artů karet vybavení | `assets/zlata_horecka_cards/<art>.webp` | jako Divoký západ (650×1000, `normalizeTexture` srovná) |
| rub balíčku vybavení | `assets/other_cards/zlata_horecka/zlata_horecka_back.webp` | |
| 8 portrétů | `assets/characters/042.webp` … `049.webp` | |
| karta stínového odpadlíka (2 strany) | `assets/roles/odpadlik_stin_pomocnik.webp`, `…_bandita.webp` | až fáze 7 |
| ikona valounu | `assets/other_cards/valoun.webp` | malá, kreslí se u každého hráče |

**Nový art přidávej rovnou jako `.webp`, nikdy PNG** (`tools/webp.js --quality=70`) —
v `assets/` žádné PNG nejsou.

Do doby, než art dorazí: `tools/placeholder.js`, `core/assetLoad.js` chybějící soubor
ošetří, ale karta by byla zelený obdélník. **Fáze 0–6 jdou odpracovat a otestovat bez artu**
(testy běží v Node bez prohlížeče); bez něj se jen nedá hrát očima.

Nový loader v `EXPANSION_LOADERS` ([game.js](../game.js)) podle vzoru `high_noon`:
rub + 3 karty obchodu jako `critical` (jsou vidět od začátku hry, na rozdíl od událostí),
zbytek na pozadí, portréty 42–49, `normalizeCharTextures(scene, 42, 49)`.

**Intro** ([server/intro.js](../server/intro.js)) dostane čtvrtý/pátý balíček: zamíchání
vybavení + vyložení tří karet obchodu. Na rozdíl od High Noonu tu **není** karta „vespod",
takže stačí dva beaty: `shuffle_gear` → `gear_row`.

### 2.9 Zapnutí v lobby

`options.expansions.zlata_horecka` + **samostatné** `options.shadowGunslingers` (R14).
Zaškrtávátka ve [view/menu.js](../view/menu.js) (běžná hra, hra botů, debug),
[server/handlers.debug.js](../server/handlers.debug.js),
[server/lifecycle.js](../server/lifecycle.js) (čekání na assety).
Rozšíření je **nezávislé na ostatních** — jde zapnout samo i se všemi čtyřmi.

---

## 3. Přehled: kde která karta zasahuje

| Karta / postava | Hlavní hák | Nová fáze? |
|---|---|---|
| Panák | `gearBuy` → volba hráče | `GEAR_TARGET` |
| Láhev | `gearBuy` → volba režimu → `playBang` / `playSpecialCard` / `_heal` | `GEAR_MODE` |
| Komplic | `gearBuy` → volba režimu → `openStore` / duel / Cat Balou | `GEAR_MODE` |
| Rum | `gearBuy` → 4× „otoč!" → `_heal(n)` | ne |
| Union Pacific | `gearBuy` → `_setDrawPhase(4)` | `DRAW` (existující) |
| Zlatá horečka (karta) | `gearBuy` → `_heal(max)` + `_vendettaExtraTurn`-styl | ne |
| Boty | `_afterLifeLost` → fronta `GEAR_BOOTS_DRAW` | ne |
| Wanted! | `gearBuy` → volba hráče; `handlePlayerDeath` odměna | `GEAR_TARGET` |
| Rýžovací pánev | akce `gear_pan` ve fázi PLAY, 2×/tah | ne |
| Podkova | 5 míst Lucky Duka | ne |
| Talisman | `_afterLifeLost` | ne |
| Batoh | akce `gear_rucksack`, **i mimo tah** u posledního života | větev v `logic/response.js` |
| Kalumet | `computeCanHit` / vyhodnocení efektu kár | ne |
| Opasek | `_handLimit` | ne |
| Krumpáč | `startDrawPhase` | ne |
| Don Bell | konec tahu → „otoč!" → tah navíc | ne |
| Dutch Will | fáze lízání → odhoď 1 ze 2 | `DUTCH_DISCARD` |
| Jacky Murieta | `_extraBangs` (R12) | ne |
| Josh McCloud | akce `josh_draw` | ne |
| Madam Yto | hák na zahrané Pivo (obě cesty) | ne |
| Pretty Luzena | `_gearCost` | ne |
| Raddie Snake | akce `raddie_draw`, 2×/tah | ne |
| Simeon Picos | `_afterLifeLost` | ne |

**Čtyři nové fáze** (`GEAR_MODE`, `GEAR_TARGET`, `DUTCH_DISCARD` + gear varianta obrany)
znamenají **čtyři nové větve v `core/pending.js` a čtyři v `core/botPolicy.js`** — hlídají
to strukturální testy „každý kind z pendingActor má v decideBotAction svou větev"
([test/botPolicy.test.js:354](../test/botPolicy.test.js#L354)), takže se nezapomenou.

---

## 4. Karty vybavení — poznámky k implementaci po jedné

Jen to, co není zřejmé z §3.

**Láhev a Komplic — „nepovažuje se za".** Obě karty mají efekt jiné karty, ale **nejsou** tou
kartou. Praktické důsledky, které se musí vyhodnotit v kódu, ne v hlavě:

- Láhev jako BANG! se **nepočítá do limitu** (dnešní `bangLimitFree` v
  [core/playability.js](../core/playability.js) je přesně ten dotaz),
- Láhev jako Pivo **nespustí Madam Yto** a **Tequila Joe si doplní jen 1 život** (FAQ Q14),
- Láhev jako Pivo **může zachránit poslední život**? Pravidla to neříkají. Plán volí
  **ano** — je to Pivo se vším všudy až na tři jmenované výjimky —, ale je to kandidát
  na dotaz.
- Komplic jako Hokynářství **nespustí Uncle Willa** ani nic, co se ptá na kartu Hokynářství.

Technicky: **nevyrábět falešnou kartu** typu `Bang!`. Efekt se má spustit stejnou cestou
(`playBang` / `playSpecialCard`), ale volání dostane příznak `{ asGear: true }`, který
vypne započtení limitu a `_trackCard`/`_markBrownPlayed`. Kdyby se vyrobila skutečná karta,
skončila by v odhozu hracího balíčku — a ona patří pod balíček vybavení.

**Rum.** „Otoč! 4 karty" — používá stejnou cestu jako ostatní `draw!`, takže **Podkova
i Lucky Duke ji zvětšují** (R8) a **John Pain si je bere do ruky** (FAQ Q12). Všechny
otočené karty se pak odhodí.

**Zlatá horečka (karta).** „Tvůj tah končí. Doplň si všechny životy a zahraj další tah."
Tělo už existuje — `_vendettaExtraTurn` ([logic/fistful.js](../logic/fistful.js)) dělá
přesně to, včetně vynulování počítadel pro Madam Zuzanu. Rozdíl je jen v `logEvent`
a v tom, že **předtím** proběhne `_heal(p, p.maxHealth)`.

**Batoh mimo tah.** „Může se použít i mimo tah vlastníka, pokud ztrácí poslední život" —
to je přesně místo, kde dnes žije `beerLastLifeSave` / `sidLastLifeSave`
([logic/response.js](../logic/response.js)). Batoh je **třetí záchrana posledního života**
a musí do `_advanceAfterLastLifeSave` ke stejnému rozcestí, jinak by se pořadí nabídek
rozešlo (Pivo × Sid × Batoh).

**Kalumet.** „Karty káry zahrané ostatními na tebe nemají efekt." Je to Apache Kid
(Dodge City) jako vybavení — takže **stejný hák**, jen se ptá i na gear. Pozor: dodatek
říká „**nemá efekt v průběhu duelu**", takže duel je výjimka. A barva se čte přes
**`_effSuit`** ([logic/highNoon.js](../logic/highNoon.js)), ne přes `card.suit` — Požehnání
a Prokletí barvu mění a Kalumet se musí ptát na tu platnou.

**Wanted!.** Odměna se přičítá **k** odměně za banditu (2 + 3 karty, 1 + 1 valoun) a u šerifa
zabíjejícího pomocníka **si nejdřív vezme 2 karty a teprve pak odhodí ruku**. To je pořadí
uvnitř `handlePlayerDeath`, kde už dnes sedí `kill reward` i `šerif × pomocník` — přidat se
musí **mezi ně**, ne za ně.

---

## 5. Postavy — poznámky

**Don Bell** je jediná postava s efektem **na konci tahu**. Musí sedět tam, kde dnes končí
tah (`tryEndTurn` → `nextTurn`), a **před** posunem tahu. Tři pasti, všechny z FAQ:
tah navíc **neotáčí znovu** (Q06/vlastní dodatek), ve **Vězení schopnost nefunguje** (Q06),
a pod **Městem duchů** je na konci tahu vyřazen, takže se **neuplatní vůbec** (Q13).
Sejmutí jde přes obvyklou cestu, takže se ho týká Lucky Duke i Podkova.

**Dutch Will** mění fázi 1 → potřebuje vlastní fázi `DUTCH_DISCARD` mezi líznutím a koncem
fáze lízání. Vzor je **Youl Grinner** (`GRINNER_GIVE`, [logic/wildWest.js](../logic/wildWest.js)).
Interakce, které se musí ověřit testem: **Krumpáč** (líže 3, odhazuje 1?  — text říká
„jednu ze **dvou** právě líznutých", plán volí **odhoď 1 z toho, co jsi ve fázi 1 líznul**),
**Kit Carlson**, **Black Jack**, **Žízeň** (High Noon, líže se 1 karta → není z čeho
odhazovat) a **Opuštěný důl** (Fistful).

**Jacky Murieta** — R12. „Nehraje k tomu žádnou kartu", takže je to **tlačítko schopnosti**
vedle Chucka Wengama a José Delgada, ne karta. Zaplatí 2 valouny → `_extraBangs++`.

**Josh McCloud** líže z **balíčku vybavení**, ne z obchodu. Lízne-li černou kartu, kterou
už má, **musí ji odhodit** (dodatek) — a `gearBuy` tuhle větev nemá, protože v obchodě si
hráč vybírá. Vlastní metoda.

**Madam Yto** má hák na **obě** cesty Piva (léčení i valoun) a **na kohokoli** u stolu,
včetně sebe. Nesmí se spustit na Whisky, Salón ani Láhev. Líznutí patří do fronty
odložených akcí ze stejného důvodu jako Boty.

**Pretty Luzena** je jediné místo, kde se cena liší podle hráče → `_gearCost(playerIdx, card)`
a **zrcadlo v `core/goldRush.js`**, protože klient musí zašedit to, co si hráč nemůže
dovolit, a bot musí počítat se stejnou cenou.

---

## 6. Bot

Nové větve v `decideBotAction` ([core/botPolicy.js](../core/botPolicy.js)) pro
`GEAR_MODE`, `GEAR_TARGET`, `DUTCH_DISCARD` a záchranu Batohem — **jinak se hra jen botů
zasekne** a strukturální test to chytí dřív než zátěž.

Nákupní politika ať zůstane hloupá a čitelná: tabulka `GEAR_VALUE` (jako `CHAR_RANK`),
nakup nejcennější dostupnou kartu, když na ni máš; Pivo měň na zlato jen při **plném
životě**; vynucené odhození jen proti hráči, kterého `beliefs` drží za nepřítele.
Ocenění musí být **po majiteli**, ne absolutní — stejná past jako u `boardCardValue`
(Vězení nepříteli bot nesundá, protože by mu pomohl).

---

## 7. Varianta Stínoví pistolníci (fáze 7, volitelná)

Nejinvazivnější část a proto **až nakonec**. Klíčové zjištění: **codebase pro to už má
dva blízké precedenty** a ani jeden nesedí úplně.

| | Město duchů (High Noon) | Mrtvý muž (Fistful) | **Stínový pistolník** |
|---|---|---|---|
| kdy se vrací | jednou, na svůj tah | jednou, natrvalo | **na každý svůj tah** |
| počítá se do vzdálenosti | **ano** (`isInPlay`) | ano | **ne** |
| počítá se do výhry | **ano** (FAQ H7) | ano | **ne** |
| Hokynářství / Dynamit | dostává | dostává | **přeskakuje** |
| životy | naléčené, na konci na 0 | 2 | **0, nedají se měnit** |

Takže `isInPlay(p) = health > 0 || p._ghost` ([core/distance.js](../core/distance.js))
**nesmí** dostat `|| p._shadow` — stín je pravý opak: „mimo svůj tah jsi mimo hru pro
všechny účely". Potřebuje **vlastní příznak** a **vlastní dotaz** (`isShadowTurn(p)`),
a projít se musí všechna dnešní volání `isInPlay` a rozhodnout u každého zvlášť. To je
práce na samostatnou fázi, ne přílepek.

Dál: `checkWinCondition` ([core/winCondition.js](../core/winCondition.js)) musí stín počítat
za **mrtvého**; `nextTurn` ho naopak **nesmí přeskočit**; `handlePlayerDeath` musí umět
vyřadit stína **bez** Vulture Sama, Grega Diggera i Herba Huntera (FAQ Q09) — a při **prvním**
vyřazení naopak všechno normálně; posun Dynamitu stíny přeskakuje.

**Stínový odpadlík** je nová role s vlastní kartou a **mění stranu na začátku každého svého
tahu** podle počtu odhalených rolí. Odhalené role drží `_roleRevealed`
([server/rooms.js](../server/rooms.js), [core/beliefs.js](../core/beliefs.js)) — tedy pole,
které už existuje a už se čte na dvou místech; třetím čtenářem bude výpočet strany.
`computeBeliefs` bude potřebovat vědět, že stínový odpadlík **není neznámá role**.

---

## 8. Testy

Nový `test/goldRush.*.test.js` rozdělený po tématech (vzor `fistful.*` / `wws.*`):

| soubor | co hlídá |
|---|---|
| `goldRush.nuggets.test.js` | valoun za každé zranění (Kulomet ve 4 hráčích = 3), ne za sebezranění, ne za dynamit; `_afterLifeLost` na všech třech vstupech |
| `goldRush.shop.test.js` | nákup, cena, okamžité doplnění, zamíchání při odkryté kartě navrchu, vynucené odhození (+1), Pivo za valoun, Soudce (R9) |
| `goldRush.gear.test.js` | vybavení **není** cílem Paniky/Cat Balou/Pata Brennana; nejdou dvě stejná; při vyřazení jde pod balíček a Vulture Sam ho nedostane |
| `goldRush.cards.test.js` | karta po kartě, včetně Podkova × Lucky Duke (R8) a Rum × John Pain |
| `goldRush.characters.test.js` | 8 postav + FAQ interakce (Q05, Q06, Q12, Q13, Q14, Q15) |
| `goldRush.shadow.test.js` | fáze 7 |

Do **zátěže** (`test/server.bots.test.js`) přibude Zlatá horečka do „matice rozšíření × 3–8
hráčů" a varianta **„všichni mají hodně valounů"**, ať se protočí nákupní větve.

Pozor na `test/_helpers.js`: **stav se staví ručně**, takže helpery budou potřebovat
`gear()` a `nuggets()` vedle dnešních `give()` / `board()`.

---

## 9. Pořadí prací

| fáze | co | hratelné po ní |
|---|---|---|
| **0** ✅ | data, mixin, `player.nuggets`, `_afterLifeLost`, zisk valounu, přepínač v lobby, redakce | valouny přibývají a jsou vidět |
| **1** ✅ | hromádky vybavení, obchod, nákup, doplnění, vynucené odhození, Pivo za valoun + **Panák, Union Pacific** | ekonomika kompletní |
| **2** | pasivní černé: **Boty, Talisman, Opasek, Krumpáč, Kalumet, Podkova** | 6 karet |
| **3** | placené černé: **Rýžovací pánev, Batoh** (vč. záchrany posledního života) | 8 karet |
| **4** | hnědé s volbou: **Láhev, Komplic**, dál **Rum, Zlatá horečka** | 12 karet |
| **5** | **Wanted!** (odměna v `handlePlayerDeath`) | **všech 15 druhů** |
| **6** | **8 postav** (`GOLD_RUSH_READY` roste) | rozšíření hotové |
| **7** | **Stínoví pistolníci** (volitelná varianta) | vše |
| **8** | bot: nákupní politika + zátěž, layout invarianty | — |

Po každé fázi: `node --check`, `npm test`, boot serveru, a u fází, které sahají na render,
**ověření v prohlížeči uživatelem** (CLAUDE.md: render nejde ověřit automaticky).

### Co se ve fázi 0 odchýlilo od plánu (a proč)

- **`core/goldRush.js` ještě není.** Zrcadlo pro klienta a bota (§2.2) potřebuje první
  predikát až s obchodem (`gearBuyOffer`, `gearCostFor`); ve fázi 0 čte klient
  `player.nuggets` napřímo jako `health`. Vzniká ve fázi 1.
- **`GearDeck` jako třída ještě není** (§2.5). Fáze 0 staví `gearDeck` jako obyčejné
  pole zamíchaných kusů, protože pravidlo o zamíchání při odkryté kartě navrchu se
  uplatní teprve tím, že se z balíčku líže — tedy ve fázi 1, kde třída vzniká.
  `gearRow` proto zůstává `[null, null, null]` a obchod se nekreslí.
- **Postavy (§2.1) jsou celé ve fázi 6.** Fáze 0 nezavádí ani `GOLD_RUSH_CHARACTERS`:
  bez schopnosti, bez portrétu (042–049) a bez `CHAR_RANK` by je debug hra nabízela jako
  prázdné karty a strukturální test bota by si vynutil rank pro postavu, která nic neumí.
- **Zapnuté rozšíření drží vlastní příznak `_goldRush`**, ne dotaz „balíček není prázdný".
  Kusů je 24 a všechny mohou být rozkoupené, takže by se prázdný balíček nedal odlišit
  od vypnutého rozšíření — a valouny by uprostřed hry přestaly přibývat.
- **Loader assetů musel vzniknout hned**, i když art chybí (§2.8): start hry čeká na
  `expansion_ready` každého zapnutého rozšíření (server/lifecycle.js), takže by hra bez
  registrovaného loaderu 12 s visela na timeoutu. Zatím nic nestahuje a prázdné `critical`
  hlásí připravenost okamžitě.
- **Valouny se zobrazují jako zlatý štítek vedle jména hráče**, ne u karty životů —
  jméno kreslí všechny čtyři větve okruhu, moje zóna i divák, takže je to jediné místo,
  které se nemusí počítat pro každou stranu stolu zvlášť. V kompaktním profilu (mobil)
  na to vedle jména místo není, tam štítek sedí v rohu portrétu naproti hvězdě šerifa
  i počítadlu životů. Až dorazí ikona valounu, nahradí emoji obrázek. **Otázka §2.7
  (rozložení obchodu) tím zůstává otevřená** — obchod se ve fázi 0 nekreslí.
- **Zaškrtávátka rozšíření se musela zhustit** ze 40 na 34 px rozteče (pět řádků se
  jinak nad „Počet hráčů" nevejde) a debug obrazovka posunula spodní tlačítka o 52 px.
  Výchozí sada příznaků má nově jedno místo (`emptyExpansions()` ve view/menu.js) —
  ručních výčtů byly čtyři a další rozšíření by se do jednoho z nich zapomnělo dopsat.

### Co se ve fázi 1 odchýlilo od plánu (a proč)

- **`GearDeck` jako třída nevznikla** (§2.5). Návrh držel odhozené karty UVNITŘ balíčku
  (`faceUpFrom`), jenže ty leží **lícem vzhůru**, tedy veřejně — redakce (server/rooms.js)
  by je musela skrývat spolu s tajným pořadím balíčku. Zůstaly proto DVĚ pole, jaká už stav
  měl: `gearDeck` (lícem dolů, v redakci skryté) a `gearPile` (lícem vzhůru, veřejné).
  Pravidlo „jakmile se na vrchu objeví karta lícem vzhůru, balíček se zamíchá" je tím
  doslovné: došel-li `gearDeck`, zamíchá se do něj celý `gearPile`. Důvod pro třídu (jeden
  trychtýř) drží **`_gearDraw` / `_gearDiscard`** — jiná cesta na hromádky vybavení není,
  stejně jako u `Deck`.
- **Do balíčku se rozdávají jen HOTOVÉ druhy** (`GEAR_READY` v logic/goldRush.js, vzor
  `WILD_WEST_READY`): ve fázi 1 Panák (3 kusy) a Union Pacific (1 kus). Karta, jejíž efekt
  ještě není napsaný, by se prodala za valouny a neudělala nic. Seznam roste s fázemi
  a ve fázi 5 bude úplný. `gearForceDiscard`, pravidlo „ne dvě stejného `effect`"
  i odhození vybavení při vyřazení jsou hotové a otestované — uplatní se s prvním
  černým druhem ve fázi 2.
- **Obchod se na desku nevešel** (§2.7, otázka §11.2 — rozhodl uživatel). Vodorovné pásmo
  balíčků drží při všech zapnutých rozšířeních x 420–1330 a nad ním leží druhá řada karet
  horních soupeřů, takže 3 karty lícem vzhůru + rub nemají kam. Na stole leží jen **rub
  balíčku vybavení** (`gearSlot`, x 1385) a klik na něj otevře **překryvné okno**
  (`renderGearShopOverlay`), ve kterém jsou všechny tři možnosti fáze 2. Že je slot volný
  ve všech kombinacích rozšíření, obou profilech a při 2–8 hráčích, hlídají dva invarianty
  v `test/positions.test.js`.
- **Vybavení sdílí pás vyložených karet** (otázka §11.3): kreslí se AŽ ZA skutečnými
  kartami, takže indexy karet na stole neposouvá — jen roztahuje pás (`_gearBandCount`
  v positions.js, hlídá test).
- **Art chybí, takže se karty vysází jako štítek** (`buildGearTextures` v game.js →
  textura `zh_<effect>`: rám podle `border`, jméno, text, cena v rohu). Ze stejného důvodu
  **nemá nákup animaci letu** — z obchodu by letěl neidentifikovatelný rub. Až art dorazí,
  načte se pod tentýž klíč a doplní se let karty (§10).
- **Intro nedostalo beat s mícháním vybavení** (§2.8). Obchod se naplní při setupu; bez
  artu by beat ukazoval rub hrací karty. Patří k dodání artu.
- **Bot umí nakupovat už teď**, i když plán to řadil do fáze 8 — bez toho by se obchod
  v zátěži (`test/server.bots.test.js`) nikdy neprotočil. Politika je zatím hloupá:
  tabulka `GEAR_VALUE`, kupuje se nejcennější dostupné, Panák jen se zraněním, Pivo na
  valoun jen s plným životem, vynucené odhození jen proti pravděpodobnému nepříteli.
- **`progressSig` (server/bots.js) dostal součet valounů a vybavení** — nákup hnědé karty
  se jinak v otisku pokroku neprojeví vůbec a stall guard by z legálního tahu udělal
  falešné zaseknutí.

Commity česky, prefixy `refaktor:` / `testy:` / `úklid:` / `oprava:`, větev `master`.

---

## 10. Co plán vědomě nedělá

- **Nepředělává `player.board` na obecnou strukturu.** Gear je čtvrté pole vedle
  `hand`/`board`/`weapon` — stejné rozhodnutí a ze stejného důvodu, jako když Fistful
  dostal vlastní `ffDeck` místo zobecnění `eventDeck`: nesahat na hotové.
- **Neřeší, jestli se Zlatá horečka smí kombinovat sama se sebou** (karta vybavení × událost
  High Noonu téhož jména) — nemají spolu žádnou pravidlovou interakci, jen jméno.
- **Nedělá animace nákupu nad rámec letu karty** obchod → před hráče. Cinematiky
  (jako hokynářství nebo Sacagaway) se dodělají, až bude vidět, co ruší.
- **Nemodeluje 30 valounů jako vyčerpatelnou zásobu** (R4).
- **Neřeší Zuřivou Doroty × koupené vybavení** — Doroty poroučí **kartu z ruky**, gear
  v ruce nikdy není. Kdyby se ukázalo, že to hráči čekají jinak, je to samostatné rozhodnutí.

---

## 11. Otevřené otázky pro uživatele

1. **Šest českých názvů karet** (Panák, Rýžovací pánev, Opasek, Krumpáč, Union Pacific,
   Zlatá horečka) — česká pravidla je neuvádějí. Doplnit z artu, až dorazí; do té doby
   platí návrhy z podkladu. Pravidla se na jméno neptají (R1), takže to nic neblokuje.
2. **Rozložení obchodu na stole** (§2.7) — vlastní řádek nad pásem balíčků, nebo jinam?
3. **Sdílet pás vyložených karet mezi `board` a `gear`**, nebo druhý pás?
4. **R9 (Soudce blokuje nákup černých karet)** — plán volí „ano", ale je to výklad.
5. **Láhev jako Pivo na záchranu posledního života** — plán volí „ano" (§4).
