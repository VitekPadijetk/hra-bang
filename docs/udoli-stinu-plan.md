# Údolí stínů (The Valley of Shadows) — implementační plán

Podklad: [`docs/udoli-stinu.md`](udoli-stinu.md) (texty všech 16 karet a 8 postav v obou
vydáních, upřesnění z českých pravidel 3. vydání a Dynamite Boxu, oficiální upřesnění dV
a odpovědi dV na BGG, tabulka rozporů) + PDF `us_rules_cz.pdf`, `us_dynamite_box_cz.pdf`,
`us_rules_eng.pdf` a přehled karet `us_karty_dvgiochi.webp`.

**Stav: plán schválený (2026-10-21), hotové jsou fáze F0 (kostra) a F1 (šest karet,
2026-10-24).** Rozšíření jde zapnout v menu (`MENU_EXPANSIONS` v
[core/menuModel.js](../core/menuModel.js)); do balíčku jde zatím 6 z 15 druhů karet
a žádná postava.
Po F0: `npm test` = 1714 testů (výchozí stav byl 1697). Po F1: **1752 testů, 0 chyb**.

> **Rozhodnutí uživatele (2026-10-21), viz §10:**
> 1. **Česká mechanika ve znění Dynamite Boxu 2023**, ale **jen 5 postav původního českého
>    vydání** (Colorado Bill, Evelyn Shebang, Henry Block, Limonádový Jim, Mick Defender).
>    Tři bonusové postavy Dynamite Boxu (Black Flower, Spot-Burst Ringer, Tuco the
>    Franciscan) přijdou později v mini-rozšíření **Nejhledanější** spolu s Annie Versary
>    a Emilianem – podklady k nim jsou v příloze A, aby se neztratily.
> 2. **Pauza na reakci jen tehdy, když reagovat jde** (R4).
> 3. **Art dodává uživatel průběžně** – co ještě chybí, kreslí se jako štítek (§2.14).
> 4. **Pravidla platí podle tohohle plánu a art je NEMĚNÍ.** Obecná zásada projektu
>    „zdroj pravdy = český text na artu" (CLAUDE.md, Divoký západ) se na Údolí stínů
>    nevztahuje: kdyby dodaná karta nesla starší české znění (Colorado Bill, Duch,
>    Obětavý skok), platí přesto Dynamite Box.

---

## 0. V čem je tohle rozšíření jiné než všechna dosavadní

Údolí stínů je **nejblíž Dodge City**: 16 karet do hlavního balíčku a 5 postav do výběru,
žádný nový balíček, žádná měna, nic nového na stole. Žádná z karet ale nesedí celá do
existující mašinerie — přidávají **čtyři mechanismy, které hra zatím nemá**:

1. **Reakce třetí strany tam, kde dnes nikdo nereaguje.** Útěk a Mick Defender ruší Paniku,
   Cat Balou, Vězení… — tedy karty, které dnes jdou rovnou do výběru cílové karty. Obětavý
   skok hraje **někdo jiný než oběť** ve chvíli, kdy oběť ztrácí život. Obojí potřebuje okno
   „počkej, jestli někdo zasáhne" (§2.8, §2.10).
2. **Výstřely bez karty, mimo pořadí.** Opětovná palba vrací BANG! střelci, Henry Block
   střílí na zloděje, Roztříštěná kulka má druhý cíl, Evelyn Shebang střílí místo líznutí.
   Dnes BANG! vzniká jen zahráním karty hráčem na tahu (§2.5, §2.9).
3. **Hromadné volby každého hráče se skrytým výsledkem.** Tornádo, Poker a Divoká banda:
   každý si vybírá své karty a ostatní je nesmí vidět, dokud nevybrali všichni (§2.7).
4. **Hráč s nulou životů, který je ve hře i během cizích tahů** (Duch). Duch Města duchů
   i stín Stínových pistolníků sedí ve hře jen po dobu **svého** tahu — takže všech ~110
   míst, která se dnes ptají `health > 0`, mohlo „ve hře" a „živý" zaměňovat. S Duchem
   přestává (§2.11).

Plán proto začíná infrastrukturou a teprve pak jde karta po kartě. Pořadí prací (§8) staví
nejdřív to, co **žádný nový mechanismus nepotřebuje**, takže se dá hrát brzy a nejrizikovější
věci (Henry Block, Obětavý skok) přijdou na konec.

### Rozhodnutí, která plán fixuje (schválené 2026-10-21/24)

| # | Věc | Rozhodnutí plánu | Proč |
|---|---|---|---|
| **R1** | Které vydání | **Česká mechanika (Albi) ve znění Dynamite Boxu 2023, 5 postav původního českého vydání** – rozhodl uživatel (§10). | Projekt má „zdroj pravdy = český text na artu" a české vydání je originál. Dynamite Box je nejnovější český tisk a u tří karet (Colorado Bill, Duch, Obětavý skok) sjednocuje výklad s mezinárodním. Jeho tři bonusové postavy patří do budoucího mini-rozšíření Nejhledanější (příloha A). |
| **R2** | Jmenný prostor | Rozšíření = `options.expansions.udoli_stinu` (klíč už drží karta „již brzy"), data `cards.udoli_stinu.json`, mixin `logic/valley.js`, zrcadlo `core/valley.js`, prefix v kódu **`vos`** (`_vosOn`, `VOS_READY`, `pendingVos…`). | **Nikdy `shadow` ani `ghost`.** `_shadow` je varianta Stínoví pistolníci (Zlatá horečka) a `_ghost` je duch Města duchů (High Noon) — česky „Údolí stínů" a „Stínoví pistolníci", „Duch" a „duch" by se v kódu pletly. Karta Duch je v kódu **`DUCH`** / `hasDuchCard(p)`. |
| **R3** | Identita karty | Nové `CardType` s českým jménem (žádné z 15 jmen v datech nekoliduje – ověřeno). Zbraně Lemat a Brokovnice jsou `CardType.WEAPON` s **`effect`** (`VOS_LEMAT`, `VOS_SHOTGUN`). | Zbraně se dnes poznávají podle jména (`weapon.name.includes("Volcanic")`), což je křehké; `effect` už `initializeStandardDeck` přenáší. |
| **R4** | Okno reakce | **Pauza jen tehdy, když reagovat JDE** (cíl drží Útěk / Mick má kartu Vedle! / někdo drží Obětavý skok) – rozhodl uživatel (§10). Kdo drží Obětavý skok, se ostatním **neukazuje** (redakce, §2.12). | Pauza na každé Panice a každém zásahu by hru zbrzdila pro všechny. Cena: že se hra zastavila, prozrazuje, že kartu někdo má. U fyzické hry to prozradí zaváhání stejně. |
| **R5** | „Karta BANG!" | Jediný predikát **`isBangCardPlay`** (zahrání, které je kartou BANG! nebo se jako karta BANG! počítá: pravý BANG!, Calamity Janet, Lemat, Zúčtování – a později Black Flower). **Není** jí Kulomet, Roztříštěná kulka, Tomahawk ani žádný bang-efekt (Úder, Springfield…), výstřel Henryho, Evelyn ani Opětovné palby. Ptá se jím Odměna, Brokovnice, Colorado Bill a Dvojitá rána. | Oficiální obecné pravidlo dV („LeMat, Calamity Janet – ano; Gatling, Fanning – ne") a Dynamite Box („pouze na karty BANG! jako takové"). Jeden dotaz místo čtyř kopií, stejně jako `playsAsBang`. |
| **R6** | Výstřely navíc | Fronta **`_vosShots`** – výstřel se zapíše a odpálí, až efekt, který ho vyvolal, **celý doběhne** (fáze PLAY, prázdná fronta odložených akcí). Vzor: Roubík (`_drainGag`). | Pravidlo „nejdřív doběhne efekt zahrané karty". Kdyby Opětovná palba vystřelila uprostřed Kulometu, přepsala by `pendingResponse` dalšího cíle. |
| **R7** | Henry Block | **Výjimka z R6**: Henryho BANG! se vyhodnotí **dřív, než karta odejde** (oficiální upřesnění dV), a když zloděj umře, karta zůstává Henrymu. Spouští se **jednou za akci**, ne za kartu. | Doslova list pravidel dV a odpověď ilsilvano. Proto potřebuje „pozastavenou akci" (§2.9). |
| **R8** | Dvojitá rána | Dva životy = **dva klikané zásahy s útočníkem** (vzor dynamit, ale přes `handleDamage`). | Pivo na posledním životě, Obětavý skok, Bart Cassidy, El Gringo, valouny i Teren Kill pak fungují **na každý život zvlášť**, přesně jako u dynamitu. |
| **R9** | Obětavý skok – kde se ptá | Ve **třech** místech, kde rozhodnutí oběti vede ke ztrátě života: konec obrany v RESPOND (oběť „bere zásah"), klikaný zásah (`takeDynamiteHit`), Pravé poledne (`takeNoonHit`). **Ne** v `handleDamage`. | Ztráta života má v kódu jen tyhle tři vstupy s rozhodnutím oběti (ověřeno grepem: `handleDamage` volají jen RESPOND, Pravé poledne a Pokrevní bratři). Dobrovolná ztráta (Chuck Wengam, Pokrevní bratři) se zachraňovat nemá. |
| **R10** | Duch | Stav se **odvozuje z karty na stole** (`hasDuchCard(p)`), žádný příznak. `isInPlay` ho zahrne, `canHeal` vyloučí. Odstranění karty = okamžité vyřazení bez odměny (vzor odchod ducha Města duchů). | Kartu může ze stolu sebrat deset různých cest (Panika, Cat Balou, Rvačka, Daltonové, Odražená střela, Johnny Kisch, Kankán…). Kdyby se ghost držel příznakem, musela by ho každá cesta shodit; odvozený stav se nemůže rozejít. |
| **R11** | Útěk / Mick – rozsah | **Jediný cíl, karta libovolné barvy zahraná hráčem** (Panika, Cat Balou, Duel, Ragtime, Kankán, Krytý vůz, Vězení, Chřestýš, Odměna, bang-efekty na jeden cíl). Ne Dynamit (přichází posunem), ne Dvojitá rána, ne vybavení Zlaté horečky koupené z obchodu. | Česká karta + Dynamite Box. Mezinárodní verze (hnědé karty, i hromadné) by měnila jen predikát `vosEvadable` (§2.8). |
| **R12** | Strana „po levici" | Tornádo předává **dalšímu hráči ve hře po směru** (`i+1`, přeskakuje vyřazené, ducha Duchem bere), **bez ohledu na Zlatou horečku** z High Noonu. | Stejná dohoda jako u Lady Růže („po pravici" = `i−1`) a FAQ H3 (efekty karet jdou po směru). |
| **R13** | Molly Stark | Líže za karty, které mimo tah **dobrovolně zahraje** (Útěk, Obětavý skok, Opětovná palba, Vedle! Micka), **ne** za vynucený odhoz (Divoká banda, Poker, Brokovnice, Tornádo). | Dnešní `_mollyPlayedOutOfTurn` je postavený na „dobrovolně zahranou/odhozenou kartu" (FAQ Dodge City). |
| **R14** | Postavy do ostré hry | Jako u Divokého západu: `VOS_READY` roste s fázemi, v debug hře jdou vybrat všechny. Karty totéž: **`VOS_CARDS_READY`** (vzor `GEAR_READY`) – do balíčku jdou jen karty s hotovým efektem. | Osvědčené. Karta bez efektu v ruce = karta, kterou bot zkouší hrát a server mlčky odmítá. |
| **R15** | Jména postav | **Česká jména z Albi** jako identita v kódu: Colorado Bill, Evelyn Shebang, Henry Block, **Limonádový Jim**, Mick Defender. | Hráč je vidí v UI; identita postavy je v tomhle kódu jméno (`hasAbility(p, "…")`). Evelyn se jmenuje **Evelyn Shebang** (pravidla 3. vydání i Dynamite Box), ne „Evelyn the Bang" z karty 1. vydání. |

---

## 1. Co rozšíření obsahuje

**16 hracích karet** (10 hnědých, 6 modrých – z toho 2 zbraně a 2× Duch) a **5 postav**
(všechny 4 životy). Texty, barvy a hodnoty jsou v [podkladu §2–3](udoli-stinu.md#2-hrací-karty-16).

| Karta | Mechanismus | Nová fáze | Fáze prací |
|---|---|---|---|
| Tomahawk | bang-efekt s dostřelem 2 (vzor Úder) | – | F1 |
| Poslední pivo | léčení +1 i ve dvou hráčích | – | F1 |
| Chřestýš | sejmutí na začátku tahu (vzor Vězení) | – (CHECK_DRAW) | F1 |
| Odměna | líznutí za zásah kartou BANG! | – (fronta) | F1 |
| Lemat | libovolná karta jako BANG! (vzor Zúčtování) | – | F1 |
| Brokovnice | zasažený odhodí kartu dle volby | `SHOTGUN_DISCARD` | F1 |
| Opětovná palba | Vedle! + výstřel zpět | – (fronta výstřelů) | F3 |
| Roztříštěná kulka | BANG! na dva cíle | – (fronta výstřelů) | F3 |
| Dvojitá rána | zásah za 2 životy | – (klikané zásahy) | F3 |
| Divoká banda | každý ostatní: BANG!, nebo 2 karty | `BANDIDOS_DISCARD` | F4 |
| Tornádo | každý dá 2 karty doleva, naráz | `TORNADO_PICK` | F4 |
| Poker | každý ostatní vyloží kartu lícem dolů | `POKER_PICK`, `POKER_TAKE` | F4 |
| Duch | vyřazený se vrací s 0 životy natrvalo | – | F5 |
| Útěk | zrušení karty na jediný cíl | `EVADE_OFFER` | F6 |
| Obětavý skok | zabránění ztrátě života jiného hráče | `SAVE_OFFER`, `SAVE_REWARD` | F8 |

| Postava | Mechanismus | Nová fáze | Fáze prací |
|---|---|---|---|
| Colorado Bill | sejmutí při BANG!, ♠ = nelze se vyhnout | – (CHECK_DRAW) | F2 |
| Limonádový Jim | za cizí Pivo +1 život za kartu | `LEMONADE_OFFER` | F2 |
| Evelyn Shebang | o kartu míň → BANG! na vzdálenost 1 | – (volba v DRAW) | F3 |
| Mick Defender | Vedle! proti kartě na jediný cíl | `EVADE_OFFER` | F6 |
| Henry Block | kdo mu vezme/odhodí kartu, je cílem BANG! | – (pozastavená akce) | F7 |

---

## 2. Infrastruktura

### 2.1 Data

Nový **`cards.udoli_stinu.json`**, schéma jako `cards.dodge_city.json` (hrací karty do
hlavního balíčku), id **700–715**:

```json
{ "id": 700, "name": "Roztříštěná kulka", "type": "FANNING", "suit": "SPADES", "value": "2",
  "art": null, "exp": "udoli_stinu", "border": "brown",
  "text": "Účinkuje jako BANG! na dostřel. Hráč dle tvého výběru ve vzdálenosti 1 …",
  "props": { "fanning": true } },
{ "id": 701, "name": "Tomahawk", "type": "TOMAHAWK", "suit": "DIAMONDS", "value": "A",
  "art": null, "exp": "udoli_stinu", "border": "brown", "text": "BANG! do vzdálenosti 2",
  "props": { "bangEffect": true, "range": 2 } },
{ "id": 712, "name": "Lemat", "type": "WEAPON", "suit": "DIAMONDS", "value": "4",
  "art": null, "exp": "udoli_stinu", "border": "blue", "text": "…",
  "props": { "range": 1, "effect": "VOS_LEMAT" } },
{ "id": 714, "name": "Duch", "type": "DUCH", "suit": "SPADES", "value": "10", … },
{ "id": 715, "name": "Duch", "type": "DUCH", "suit": "SPADES", "value": "9",  … }
```

`art` je `null`, dokud soubor nedorazí (§2.14) – pak se do něj zapíše slug z tabulky
souborů. `text` je český text karty podle Dynamite Boxu (podklad §2), čte ho jen štítek.

Nové hodnoty v `CardType` ([logic/entities.js](../logic/entities.js)): `FANNING`
'Roztříštěná kulka', `TOMAHAWK` 'Tomahawk', `AIM` 'Dvojitá rána', `BACKFIRE` 'Opětovná
palba', `ESCAPE` 'Útěk', `SAVED` 'Obětavý skok', `LAST_CALL` 'Poslední pivo', `POKER`
'Poker', `TORNADO` 'Tornádo', `BANDIDOS` 'Divoká banda', `BOUNTY` 'Odměna', `RATTLESNAKE`
'Chřestýš', `DUCH` 'Duch'. Do `BLUE_CARD_TYPES` ([core/cardRules.js](../core/cardRules.js))
patří Odměna, Chřestýš a Duch (zbraně tam už jsou) – na tom stojí José Delgado a Daltonové
(a později Tuco z Nejhledanějších).

Postavy: `characters.json` id **50–54** abecedně (Colorado Bill 50, Evelyn Shebang 51,
Henry Block 52, Limonádový Jim 53, Mick Defender 54) → portréty
`assets/characters/050–054.webp`. `VALLEY_CHARACTERS` a `VOS_READY` v `logic/entities.js`,
všech pět do `CHAR_RANK` ([core/botPolicy.js](../core/botPolicy.js#L594) – test hlídá, že
žádná postava nechybí). Všechny mají 4 životy, takže [core/roles.js](../core/roles.js#L78)
se nemění.

### 2.2 Zapnutí

- Server: `vosCardData` v `ctx` ([server.js](../server.js)), předání do `gs` v
  `server/lifecycle.js` i `server/handlers.debug.js` (vzor `dodgeCityCardData`),
  `_deckDataFor` ([logic/setup.js](../logic/setup.js)) přidá karty filtrované přes
  `VOS_CARDS_READY`, `_characterPool` postavy z `VOS_READY` (debug: všechny).
- Menu: až bude první hratelná sada (konec F1), karta se přestěhuje z
  `MENU_EXPANSIONS_SOON` do `MENU_EXPANSIONS` (hint např. „16 karet a 5 postav; karty
  hrané mimo tah a Duch") a s ní test „každé rozšíření, které zná server, má kartu".
  Do té doby jen debug hra (S16) – ta čte `App.debugExpansions` pod stejnými klíči.
- `rooms.js` (`_cardData` pro katalog Zuřivé Doroty) dostane `vosCardData` taky –
  `distinctCardKinds` z něj staví mřížku jmenovatelných karet.

### 2.3 Mixin a zrcadlo

- **`logic/valley.js`** (`ValleyMixin`, vzor „Mixin pattern" v CLAUDE.md): všechno, co
  nemá domov jinde – fronta výstřelů, okna reakcí, hromadné volby, Duch, Henry.
- **`core/valley.js`** – izomorfní predikáty, na které se ptá server, klient i bot:
  `vosOn`, `isBangCardPlay`, `lematBangOk`, `vosEvadable`/`evadeOptions`, `saveEligible`, `hasDuchCard`, `fanningTargets`,
  `evelynTargets`, `tornadoPickOk`, `pokerPickOk`, `bandidosPickOk`. Načte se v
  `index.html` před `core/playability.js`.

### 2.4 „Je to karta BANG!?" — R5

`isBangCardPlay(state, me, card, mode)` vrací true pro zahrání, které **je kartou BANG!**:
`playsAsBang` (pravý BANG!, Calamity Janet, Zúčtování) + Lemat (Black Flower se sem přidá
s Nejhledanějšími). Volá se
**v okamžiku zahrání** a výsledek si útok nese v `pendingResponse.bangCard` (vedle
`bangEffect`) až do konce obrany – Odměna a Brokovnice se ptají až při zásahu, kdy
karta už leží v odhozu.

### 2.5 Fronta výstřelů — R6

```
this._vosShots = [{ shooterIdx, targetIdx, source: 'BACKFIRE'|'FANNING'|'EVELYN', … }]
```

- **Plní ji:** Opětovná palba (po doběhnutí obrany), Roztříštěná kulka (druhý cíl, zapsaný
  už při zahrání), Evelyn (volba ve fázi 1).
- **Vybírá ji `_drainVosShots()`** v `_processSpecialQueue`, když je fronta odložených akcí
  prázdná a fáze je `PLAY` – přesně tam, kde dnes sedí `_drainGag`
  ([logic/characters.js:188](../logic/characters.js#L188)). Výstřel = `_beginBangResolution(
  shooter, target, isEffect: true, sourceName, …)` s kontextem `vos`, který se protahuje
  stejně jako dnes `ricochet` (pendingBarrelCheck → currentCheck → pendingResponse).
- **Konec výstřelu** pozná hák `_afterVosShot()` na stejných **třech** místech, kde dnes
  sedí `_afterFistfulHit()`: konec obrany ([response.js:403](../logic/response.js#L403)),
  úspěšný barel ([checks.js:241](../logic/checks.js#L241)) a záchrana Pivem/Sidem/Batohem
  ([response.js:214](../logic/response.js#L214)).
- Výstřel, jehož střelec nebo cíl mezitím odešel ze hry (`isInPlay`), propadá.
- **Kdo zabil:** `handleDamage` dnes předává smrt bez zabijáka, takže se za zabijáka
  považuje hráč na tahu ([logic/combat.js:35](../logic/combat.js#L35) →
  [handlePlayerDeath:76](../logic/combat.js#L76)). U výstřelů mimo pořadí (Opětovná palba,
  Henry) to je špatně – zabil střelec. `handleDamage` dostane `opts.killerIdx`
  a `pendingResponse.killerIdx` ho donese. Duel se tím **nemění** (jiná otázka, mimo rozsah).

### 2.6 Klikané zásahy s útočníkem i bez něj — R8

Dnešní `pendingDynamiteDamage = { playerIdx, hitsLeft, source, resume }`
([takeDynamiteHit](../logic/combat.js#L260)) dostane volitelný **`attackerIdx`**. S ním
klik nejde přímou dekrementací, ale přes `handleDamage(victim, attacker)` – tím se
vezou valouny, El Gringo, Bart Cassidy, Teren Kill i zabiják.

- **Dvojitá rána:** `{ hitsLeft: 2, source: 'AIM', attackerIdx, resume: 'RESPOND_TAIL' }`,
  po dobrání se pokračuje koncem obrany (Kulomet nemůže být, Dvojitá rána jde jen s BANG!).
  V RESPOND se pod Dvojitou ranou **nenabízí záchrana Pivem** – Pivo se hraje až mezi
  kliky, kde zachrání jeden život, jako u dynamitu.
- **Chřestýš:** `{ hitsLeft: 1, source: 'RATTLESNAKE', resume: 'CHECKS' }` bez útočníka
  (nemá majitele – nikdo zranění „nezpůsobil", dV).

### 2.7 Sekvenční skryté volby (Tornádo, Poker, Divoká banda)

Vzor Daltonové / Ruská ruleta / Youl Grinner: fronta hráčů v `pendingVosRound =
{ kind, queue, picks: { [idx]: [cardId…] }, playerIdx }`. Hráči volí **po jednom** (od
hráče po levici toho, kdo kartu zahrál), ale **volba se nikam nepřesouvá, dokud nevolili
všichni** – tím je „všichni najednou" splněné i při postupném klikání. Redakce schová
`picks` všem kromě vlastníka (§2.12). Hráč bez karty se přeskakuje (Tornádo s jednou
kartou: dá jednu).

Po poslední volbě jedna metoda provede všechny přesuny naráz, emitne jednu animaci
(`tornado_pass` / `poker_reveal`) a teprve potom pustí Suzy Lafayette
(`checkSuzyLafayette` pro všechny dotčené) a frontu.

### 2.8 Okno úniku `EVADE_OFFER` (Útěk, Mick Defender) — R4, R11

Jediný predikát **`vosEvadable(state, targetIdx, source)`** + **`evadeOptions(state,
targetIdx)`** (karta Útěk v ruce; Mick → karty, které `playsAsMissed` pustí).

**Kde se ptá** – tři vstupní body, přes které jde každá karta na jediný cíl:

| Vstup | Dnes | Co se zastaví |
|---|---|---|
| `_enterTargetSelection(sel)` (NOVÝ helper) | přímé `phase = "SELECTING_TARGET_CARD"` v `playSpecialCard`, `_dispatchDiscardExtraEffect`, `activateGreenCard`, `_repeatBrownEffect` | Panika, Cat Balou, Ragtime, Kankán, Krytý vůz, Lee Van Kliff, Komplic/Láhev ze Zlaté horečky |
| `_placeOnTarget(card, attIdx, tarIdx)` (NOVÝ helper) | vyložení Vězení v `playSpecialCard` | Vězení, Chřestýš, Odměna |
| `_startDuel(pr)` (NOVÝ helper) | `pendingResponse` duelu v `playSpecialCard` / `_repeatBrownEffect` | Duel (jen **před** začátkem, dV 1614261) |

Bang-efekty na jediný cíl (Úder, Tomahawk, Springfield, Derringer, Nůž, Pepperbox,
Puška na bizony, Roztříštěná kulka bez druhého cíle, výstřel Opětovné palby) **okno
nepotřebují** – mají RESPOND už dnes, takže v něm Útěk prostě přibude jako platná
odpověď, která efekt zruší celý.

Stav: `pendingEvade = { targetIdx, attackerIdx, cardName, resume: { kind: 'SELECTION' |
'PLACE' | 'DUEL', data } }`. **Pokračování je DATA, ne funkce**: odmítnutí obnoví uloženou
`pendingSelection` / vyloží uloženou kartu / založí uložený duel. Únik odhodí Útěk (nebo
Mickovu kartu Vedle!), útočná karta je už v odhozu (modrá karta jde do odhozu místo na
stůl) a hra jde do `PLAY` + `_processSpecialQueue()`.

**Strukturální test:** žádné `phase = "SELECTING_TARGET_CARD"` mimo `_enterTargetSelection`
s výjimkou vyjmenovaných hromadných (Rvačka, Daltonové, dělení mezi Vulture Samy).

### 2.9 Pozastavená akce (Henry Block) — R7

Henry potřebuje opak R6: **nejdřív výstřel, potom přesun karty**. Spouští se ve chvíli,
kdy je jasné, co se z Henryho ruky / stolu bere – tedy uvnitř:

- `resolveCardSelection` ([logic/play.js:409](../logic/play.js#L409)) – Panika, Cat
  Balou, Ragtime, Rvačka, Kankán, Krytý vůz, Lee Van Kliff, Komplic/Láhev;
- `drawCard` ([logic/draw.js:126](../logic/draw.js#L126)) – Jesse Jones, Pat Brennan;
- `gearForceDiscard` ([logic/goldRush.js:615](../logic/goldRush.js#L615)) – vynucené
  odhození vybavení (leží „před ním");
- odměna Obětavého skoku „2 karty z ruky zachráněného" (F8);
- Odražená střela ([`_ricochetDestroy`](../logic/fistful.js#L848)) – tady karta zaniká
  uprostřed obrany, takže **výjimečně jde výstřel frontou R6** (až po zničení).

Místo přesunu se uloží `_vosSuspended = { kind: 'SELECTION'|'DRAW'|'GEAR'|'SAVE', args,
phase }`, spustí se výstřel Henry → zloděj a po jeho konci (`_afterVosShot`) se akce
**zavolá znovu se stejnými argumenty** a příznakem „Henry už vystřelil". Fáze, ve které
akce běžela (DRAW u Jesse Jonese), se před tím obnoví. Zloděj mimo hru → akce propadá
a karta zůstává Henrymu (dV). Smrt zloděje na tahu ukončí tah obvyklou cestou
(`_autoEndTurnPending`).

Nespouští se: El Gringo (automatická schopnost), Divoká banda (dá se vyhnout – DB),
Poker, Tornádo, Flint Westwood (výměna), Youl Grinner (kartu dává Henry), Vulture Sam
(Henry je mrtvý), Daltonové a Brokovnice (odhazuje sám Henry).

### 2.10 Okno záchrany `SAVE_OFFER` (Obětavý skok) — R9

`saveEligible(state, victimIdx)` = existuje hráč, který: drží Obětavý skok, je ve hře,
**není oběť** a **není na tahu** (`_turnOwner()` – Zuřivá Doroty půjčuje sedadlo) a oběť
**může ztratit život** (není Duch). Kus je jen jeden, takže zachránce je nejvýš jeden.

Brána `_vosSaveGate(ctx)` stojí **na začátku** tří míst (R9):

| Místo | ctx.resume | Po rozhodnutí |
|---|---|---|
| RESPOND – oběť bere zásah ([response.js:251](../logic/response.js#L251)) | `'RESPOND'` | `handleResponse(victim, null)` znovu, s příznakem „rozhodnuto" (a při záchraně bez `handleDamage`) |
| klikaný zásah ([takeDynamiteHit](../logic/combat.js#L260)) | `'CLICK'` | klik proběhne / jen `hitsLeft--` |
| Pravé poledne ([takeNoonHit](../logic/highNoon.js#L431)) | `'NOON'` | totéž |

Pokračování je opět **znovuzavolání téže funkce**, takže zbytek toku se nemění o řádek.
Záchrana: Obětavý skok do odhozu, `_mollyPlayedOutOfTurn`, do fronty odložených akcí
**`SAVE_REWARD`** (odměna až po doběhnutí efektu – dV 1588981). Když fronta dojde
a zachráněný **je ve hře**, fáze `SAVE_REWARD`: zachránce volí „2 karty z ruky
zachráněného (náhodně)" nebo „2 z balíčku" (má-li zachráněný jen 1 kartu: ji, nebo
2 z balíčku; 0 karet → balíček automaticky). Výběr z ruky Henryho Blocka spouští Henryho
(§2.9).

Prozrazení (R4): pendingActor fáze `SAVE_OFFER` je zachránce – redakce mu ho nechá,
ostatním `saverIdx` schová a štítek ukáže „Čeká se, jestli někdo nezasáhne…".

### 2.11 Duch: hráč ve hře s nulou životů i mimo svůj tah — R10

```js
// core/valley.js
function hasDuchCard(p) { return !!p && (p.board || []).some(c => c.type === "Duch"); }
// core/distance.js
function isInPlay(p) { return !!p && (p.health > 0 || !!p._ghost || !!p._shadow || hasDuchCard(p)); }
function canHeal(p)  { return isInPlay(p) && !p._shadow && !hasDuchCard(p) && p.health < p.maxHealth; }
```

1. **Audit `health > 0` / `health <= 0`.** Dnes 56× `health > 0` a 51× `health <= 0`
   v `logic*`, `core`, `server`, `view`, `net`, `positions.js` (spočítáno). Každé místo
   se zařadí: „**ve hře**" → `isInPlay` (cíl Paniky, Vězení, Duelu, kdo dostane kartu
   v hokynářství, kdo se přeskakuje v `nextTurn`…), nebo „**skutečný život**" → zůstává
   (léčení, poslední život, Greg Digger). Výsledek hlídá **strukturální test**: každý
   výskyt v `logic/*` a `core/*` musí být v tabulce s důvodem (vzor test sedadel
   Lady Růže v `test/wws.seats.test.js`).
2. `nextTurn` ([logic.js:481](../logic.js#L481)) hráče s Duchem nepřeskakuje; Mrtvý muž,
   Hřbitov, Město duchů ani Stínoví pistolníci se ho netýkají – **není vyřazený** (dV:
   Hřbitov ducha nevrací, nechává mu kartu).
3. `evaluateWinner` (a `evaluateWinner3p`, [core/winCondition.js:23](../core/winCondition.js#L23))
   počítá Ducha za živého – „ghost-bandita brání výhře zákona" (dV).
4. **Konec tahu:** limit karet = životy = 0 → odhodí celou ruku, stůl zůstává. To dnešní
   `_handLimit` udělá samo (Sean Mallory 10, Nábojový pás 8 – vědomě ponecháno).
5. **Zahrání Ducha:** cíl = vyřazený hráč (`health <= 0 && !isInPlay`), nikdy sám
   sebe. Klient: klik na plochu vyřazeného hráče.
6. **Odchod:** `_vosGhostSettle()` – hák na stejných místech jako `_dorothySettle`
   (konec fronty + před broadcastem): hráč s `health <= 0`, který byl duchem (`_vosWasGhost`
   – jen pro tenhle přechod, ne pro pravidla) a kartu už nemá → vyřazení **bez odměny**,
   bez Vulture Sama / Grega Diggera / Herba Huntera (dV 2119446, 2587683), ruka i stůl do
   odhozu animací odchodu ducha (`_ghostLeaveAnim`). Odchod během vlastního tahu ukončí tah.
7. **Laso** (Fistful): karty na stole nemají efekt → duch je **vyřazen** (dV 1603935).
   **Belle Star** ducha nevyřazuje (žádná oficiální odpověď; jinak by duchové mizeli každý
   její tah).
8. Schopnost postavy podle Dynamite Boxu **zůstává** (Bill Noface líže 5, Chuck Wengam
   nemůže, Vera Custer smí kopírovat) – `hasAbility` se kvůli Duchovi nemění.

### 2.12 Redakce stavu

`redactState` ([server/rooms.js:54](../server/rooms.js#L54)) – nová tajná pole:

| Pole | Komu je vidět |
|---|---|
| `pendingVosRound.picks` (Tornádo, Poker) | jen vlastníkovi volby, do odhalení |
| `pendingSave.saverIdx` | jen zachránci (ostatní: `null` → obecný štítek) |
| `_vosSuspended.args` u Jesse Jonese | nic tajného (karta z ruky se bere náhodně až po výstřelu) |

`pendingEvade` je veřejné – cíl je známý z toho, že se na něj zahrálo. Co prozrazuje
samotná pauza, uživatel přijal (R4).

### 2.13 Klient

**Na stole nic nového nepřibude** – karty Údolí stínů leží v ruce a v pásu vyložených
karet jako Dodge City, Duch leží před vyřazeným hráčem. Přibude:

- **okna/lišty** (view/screens.js, vlastní hloubka jako u Zuřivé Doroty): `EVADE_OFFER`
  („Zahraješ Útěk / Vedle!?"), `SAVE_OFFER`, `SAVE_REWARD`, `LEMONADE_OFFER`; okno vidí jen
  ten, na koho se čeká, ostatní mají štítek čekání (`waitingStatus` v core/pending.js –
  český text pro každou novou fázi; u `SAVE_OFFER` obecný, viz §2.12);
- **výběr karet z ruky s potvrzením** pro `TORNADO_PICK` (2 karty), `POKER_PICK`,
  `BANDIDOS_DISCARD` (BANG!, nebo 2 karty), `SHOTGUN_DISCARD`; `POKER_TAKE` = řada
  vyložených karet uprostřed (vzor Rum);
- **přepínače při výběru karty** (slot tlačítek schopností, vzor `💥 ZAHRÁT JAKO BANG!`):
  Lemat („jako BANG!") a Dvojitá rána („+ Dvojitá rána" u vybrané karty BANG!);
- **dvoukrokové míření** Roztříštěné kulky (první cíl → zvýraznění povolených druhých);
- volba Evelyn ve fázi lízání (tlačítko „Vystřelit místo karty" + klik na cíl);
- **Duch:** vyřazený hráč s Duchem se kreslí jako hrající (stejně jako duch Města duchů),
  jen průsvitně a s kartou Duch v pásu;
- animace: `tornado_pass` (karty z ruky k levému sousedovi), `poker_reveal` (karty doprostřed
  lícem dolů → otočení → k hráči / do odhozu), výstřel zpět Opětovné palby jde existujícím
  BANG! letem.

Všechna okna musí fungovat i v mobilním profilu (kompaktní soupeři, docs/pravidla/rozlozeni.md).
Render neumím ověřit – po každé fázi s UI požádám o kontrolu v prohlížeči.

### 2.14 Assety

Vzor Dodge City (`EXPANSION_LOADERS.dodge_city` v [game.js:2214](../game.js#L2214)):
`buildCardTextures` upeče líc z artu + barvy + hodnoty + značky rozšíření. Formát stejný
jako dnešní art: **karta 650×1000 px** (bez barvy a hodnoty v rohu – ty se pečou zvlášť),
**značka 80×80 px** s průhledností, **portrét 650×1000 px**, vše `.webp`
(`tools/webp.js --quality=70`, značka bezeztrátově).

| Soubor | Co |
|---|---|
| `assets/card_art/udoli_stinu/roztristena_kulka.webp` | Roztříštěná kulka |
| `…/tomahawk.webp`, `…/dvojita_rana.webp`, `…/opetovna_palba.webp`, `…/utek.webp` | |
| `…/obetavy_skok.webp`, `…/posledni_pivo.webp`, `…/poker.webp`, `…/tornado.webp` | |
| `…/divoka_banda.webp`, `…/odmena.webp`, `…/chrestys.webp`, `…/lemat.webp` | |
| `…/brokovnice.webp`, `…/duch.webp` (obě kopie Ducha sdílí jeden art) | |
| `assets/card_marks/udoli_stinu.webp` | symbol supa |
| `assets/characters/050.webp` … `054.webp` | Colorado Bill, Evelyn Shebang, Henry Block, Limonádový Jim, Mick Defender |

**Art chodí průběžně**, takže chybějící soubor nesmí nic rozbít ani zdržet:

- Karta v datech nese `text` (český text karty) a `art`. Loader stahuje jen karty
  s vyplněným `art`; **do dodání je `art: null`** – žádné 404 v konzoli ani v
  `AssetLoads`, a karta se kreslí jako **štítek** (rám podle `border`, jméno, `text`,
  barva a hodnota – vzor `buildGearTextures` Zlaté horečky). Dodání = soubor do složky
  + jedno pole v JSON, nic jiného.
- Značka supa ani portréty **nejsou `critical`** – bez značky se peče karta bez ní, bez
  portrétu se kreslí jmenovka postavy (ověřit v F0, jak dnes vypadá chybějící `char_<id>`).
- Až dorazí poslední kus, štítky zůstanou jen jako záloha (stejně jako u Zlaté horečky).

### 2.15 Server: akce, guard, ledger, log

Nové socketové akce v `server/handlers.game.js` (každá zamkne vstup klienta, `App.blockInput`):

| Akce | Payload | Fáze |
|---|---|---|
| `play_fanning` | `{ cardIdx, firstIdx, secondIdx }` | PLAY |
| `play_bang` (rozšířená) | `+ aimCardId` (Dvojitá rána), `+ asBang` (Lemat – jako dnes Zúčtování) | PLAY |
| `play_special` (rozšířená) | Chřestýš, Odměna, Duch s cílem; Poker, Tornádo, Divoká banda bez cíle | PLAY |
| `vos_evade` | `{ cardIdx \| null }` (null = nevyhýbám se) | EVADE_OFFER |
| `vos_save` | `{ use: bool }` | SAVE_OFFER |
| `vos_save_reward` | `{ from: 'hand' \| 'deck' }` | SAVE_REWARD |
| `vos_pick` | `{ cardIds: [...] }` | TORNADO_PICK, POKER_PICK, BANDIDOS_DISCARD, SHOTGUN_DISCARD |
| `vos_poker_take` | `{ cardIds: [...] }` (0–2) | POKER_TAKE |
| `vos_lemonade` | `{ cardIdx \| null }` | LEMONADE_OFFER |
| `draw_card` (rozšířená) | `source: 'evelyn', targetIdx` | DRAW (Evelyn) |

- **Guard** (`server/guard.js`): všechny nové akce do `TURN_ACTIONS` – aktér je vždy ten,
  koho vrací `pendingActor`, takže výjimka „mimo pořadí" (jako Sid Ketchum) **není
  potřeba** ani u Obětavého skoku: ten se hraje jen ve vlastní fázi `SAVE_OFFER`.
  `vos_pick` navíc nese `playerIdx`, ať opožděný klik nevybere karty za dalšího v kolečku
  (stejný důvod jako `targetIdx` u `select_target_card`).
- **Ledger chování** (`server/ledger.js`, z něj bot dedukuje role): nepřátelské = Chřestýš
  a Odměna na někoho, Opětovná palba (výstřel zpět), první i druhý cíl Roztříštěné kulky,
  výstřel Evelyn, Dvojitá rána; přátelské = Obětavý skok (záchrana), Duch na vyřazeného.
  Henryho výstřel ani Divoká banda/Tornádo/Poker se nezapisují (míří automaticky / na všechny).
- **Herní log** (`core/gameLog.js` `formatEvent`, `logEvent` v pravidlech): české řádky pro
  každou novou událost (únik, záchrana, výstřel zpět, odchod ducha…) – kvůli hlášením chyb.

### 2.16 Časování animací

Nový **`core/vosAnim.js`** (vzor `core/goldRushAnim.js` / `core/wwsAnim.js`): trvání
`tornado_pass`, `poker_reveal` a odchodu ducha jako jediný zdroj pravdy pro klienta
(`net/handlers.js`), frontu animací (`_animDurationMs` + tabulka `ANIM_MS`) i serverové
držení botů (`room._vosBlockUntil` v `server/anim.js`). Bez toho bot zahraje další akci
uprostřed cinematiky a stav ji předběhne.

### 2.17 Zuřivá Doroty a Lee Van Kliff (Divoký západ)

Obě karty pracují s **katalogem druhů karet**, takže se nových 15 druhů objeví samo –
a proto musí mít každý druh rozhodnuté, co s ním:

| Karta | Doroty smí poručit? | Lee Van Kliff smí zopakovat? |
|---|---|---|
| Tomahawk | ano (cíl do vzdálenosti 2 od poručeného) | ano (`BANG_EFFECT`, `range: 2` – stávající větev `asBang`) |
| Poslední pivo | ano | ano (efekt = +1 život) |
| Poker, Tornádo, Divoká banda | ano (bez cíle) | ano (bez cíle) |
| Chřestýš, Odměna | ano (cíl) | ne – jsou modré (paměť drží jen hnědé) |
| Duch | ano (cíl = vyřazený) | ne – modrý |
| Lemat, Brokovnice | ano (jako každá zbraň) | ne – modré |
| Roztříštěná kulka | **ne** – dva cíle se do `pendingDorothy.targets` nevejdou | **ne** – stejný důvod |
| Dvojitá rána | **ne** – hraje se jen spolu s kartou BANG! | **ne** |
| Útěk, Obětavý skok, Opětovná palba | **ne** – hrají se jen jako reakce | **ne** – do paměti se nedostanou (reakce mimo vlastní tah se nezapisují) |

Technicky: rozšířit `dorothyCommandable` (core/playability.js) a `_brownRepeatSpec`
(logic/wildWest.js) o tahle pravidla, s testem „každý druh z `cards.udoli_stinu.json` má
v obou tabulkách rozhodnutí" (vzor strukturálních testů).

---

## 3. Přehled háků

| Karta / postava | Kde zasahuje | Zrcadlo pro klienta a bota |
|---|---|---|
| Tomahawk | jen data (`bangEffect`, `range: 2`) – dosah čte `cardReach` ([core/distance.js:147](../core/distance.js#L147)) | žádné nové |
| Poslední pivo | `cardEffects` v `playCard` ([logic/play.js:37](../logic/play.js#L37)) | `nativePlayInTurn` |
| Chřestýš | `handleStartOfTurnChecks` / `_applyCheckResult` ([logic/checks.js](../logic/checks.js)) | větev CHECK_DRAW už má |
| Odměna | konec obrany v `handleResponse` (zásah) | – |
| Lemat | `playBang` ([logic/play.js:131](../logic/play.js#L131)) + `isBangCardPlay` | `lematBangOk` v `cardPlayability` |
| Brokovnice | konec obrany → fronta `SHOTGUN_DISCARD` | `pendingActor` + větev bota |
| Opětovná palba | `playsAsMissed` + `handleResponse` → `_vosShots` | `playsAsMissed` |
| Roztříštěná kulka | `playBang`-like vstup se dvěma cíli → `_vosShots` | `fanningTargets` |
| Dvojitá rána | `playBang` (párová akce) → klikané zásahy | `aimOk` |
| Divoká banda, Tornádo, Poker | nový tok v `logic/valley.js` | `*PickOk`, větve bota |
| Duch | `isInPlay`/`canHeal`, `nextTurn`, `evaluateWinner`, settle hák | `hasDuchCard` všude |
| Útěk, Mick | tři helpery §2.8 + platná odpověď v RESPOND | `vosEvadable`, `evadeOptions` |
| Obětavý skok | tři brány §2.10 | `saveEligible` |
| Colorado Bill | `playBang` → sejmutí (CHECK_DRAW, reason `COLORADO`) → `_beginBangResolution(… unavoidable)` | `pendingResponse.unavoidable` čte `cardPlayability` |
| Limonádový Jim | trychtýř na kartu Pivo `_madamYtoOnBeer` ([logic/goldRush.js:903](../logic/goldRush.js#L903)) → přejmenovat na `_onBeerCardPlayed` | větev bota |
| Evelyn | `_getDrawOptions` ([logic/draw.js:112](../logic/draw.js#L112)) + `_drawCountFor` | `evelynTargets` |
| Henry Block | §2.9 | – |

---

## 4. Karty po jedné

**Tomahawk** — bang-efekt jako Úder, jen `range: 2` (dV: „max. 2, smí i na 1"). Není karta
BANG!: do limitu se nepočítá, nejde v duelu ani proti Indiánům, Odměna ani Brokovnice
se nespouští. A♦ → Apache Kida míjí (`_apacheImmune`). Útěk ho ruší (jediný cíl, není to
karta BANG!).

**Poslední pivo** — ve svém tahu +1 život přes `_heal`, i když ve hře zbývají dva hráči.
**Není to karta Pivo**: Madam Yto, Limonádový Jim, Tequila Joe (+2), Reverend ani Pivo za
valoun se ho netýkají; v RESPOND se jako záchrana nenabízí („nikdy mimo tah"). Duch ho
zahrát nemůže (`canHeal`).

**Chřestýš** — vyloží se před **libovolného** hráče (i sebe, i šerifa; ne dvakrát). Pořadí
na začátku tahu **Dynamit → Vězení → Chřestýš**; neúspěšné Vězení = žádné snímání.
Sejmutí jde existující cestou (`pendingCheckDraw.rattlesnakeIdx` → CHECKING → reason
`RATTLESNAKE`), takže se veze Lucky Duke, Podkova, John Pain i cinematika; barva přes
`_effSuit` (Požehnání = nikdy, Prokletí = vždy). ♠ → klikaný zásah bez útočníka (§2.6),
pak fáze lízání. Karta **zůstává**. Laso ji vypíná. Duch se nesnímá (nemůže ztratit život).

**Odměna** — vyloží se před libovolného hráče. Zasáhne-li ho někdo **kartou BANG!**
(R5, `pendingResponse.bangCard`), střelec si lízne 1 kartu (fronta `KILL_REWARD` s 1
kartou) – i když zásah cíl vyřadil (číst **před** úklidem stolu mrtvého, jako Wanted).
Dvojitá rána = 1 karta. Po Vedle!/Barelu nic. Laso a Belle Star (útočí ona) ji vypínají
(`_boardDead`, `_belleIgnoresBoard`). Pořadí odměn podle dV: Brokovnice → Odměna →
El Gringo.

**Lemat** (zbraň, dostřel 1) — ve **svém tahu** smí hráč použít libovolnou kartu z ruky
**kromě karty Vedle!** (typ `Vedle!` a Opětovná palba) jako BANG!. Je to **karta BANG!**
(R5): počítá se do limitu (Willy the Kid ji smí použít víckrát), spouští Odměnu, Colorado
Billa, Slaba. V duelu ne (dV: „jen při střelbě"). UI i predikát sdílí se Zúčtováním:
`showdownBangOk` se zobecní na `altBangOk(state, me, myIndex, card)` = Zúčtování **nebo**
Lemat (později i Black Flower) – karta si vlastní akci ponechává, jako BANG! jde přepínačem.
Laso Lemat vypíná (zbraň je karta na stole – stejně jako Volcanic).

**Brokovnice** (zbraň, dostřel 1) — zásah **kartou BANG!** od majitele Brokovnice →
zasažený (je-li ve hře a má kartu) odhodí 1 kartu **dle své volby**: fronta
`SHOTGUN_DISCARD` → stejnojmenná fáze. Vynucený odhoz – Molly nelíže (R13), Henry se
nespouští (odhazuje sám). Pod Lasem nic.

**Opětovná palba** — „počítá se jako karta Vedle!": přibude do `playsAsMissed`, takže ji
smí Elena Fuente, odhodit v Ruské ruletě, **Big Spencer ji hrát nesmí** (je to karta
Vedle!) a Calamity Janet ji smí zahrát jako BANG! (dV 2427678). Když obranu dokončí
(proti Slabovi je potřeba ještě jedno Vedle!), zapíše se výstřel `BACKFIRE` obránce →
**originátor** útoku (bang-efekt, bez dostřelu, Apache Kida zasáhne – 3. vydání). Platí
proti každému útoku, který má originátora (BANG!, bang-efekty, Kulomet, Henry, Evelyn,
jiná Opětovná palba); bez originátora jen jako Vedle!. Pod Coloradem s ♠ se zahrát nedá
(nic se nedá zrušit).

**Roztříštěná kulka** — vlastní akce `play_fanning { cardIdx, firstIdx, secondIdx }`.
Čerpá **limit karet BANG!** (`bangsPlayedThisTurn++`), ale kartou BANG! **není** (žádná
Odměna, Colorado, Slab, Brokovnice; Kazatel ji nezakazuje). První cíl v dostřelu zbraně;
druhý = `computeDistance(první, druhý) <= 1`, ne střelec – vzdálenost bez zbraní, ale
s Mustangem, Hledím, Rose Doolan, Paulem Regretem (DB). **Povinnost z DB:** existuje-li
v dostřelu cíl, který má druhého, musí být prvním cílem takový. Druhý výstřel je
**povinný** a jde **i když první minul** – zapíše se do `_vosShots` hned při zahrání,
takže doběhne po prvním. Bez možného druhého cíle je to obyčejný bang-efekt na jeden cíl
(a Útěk ho pak smí zrušit). `fanningTargets(state, me, myIndex)` = dvojice, kterou pustí
server, klient zvýrazní a bot vybere.

**Dvojitá rána** — hraje se **spolu s kartou BANG!** (`play_bang { …, aimCardId }`); obě
karty do odhozu, do limitu se počítá jedna. Zásah = **2 klikané zásahy s útočníkem**
(§2.6). Na vyhnutí stačí 1 Vedle! (Slab dál 2). Útěk ji nezruší (míří na BANG!, ne na
tebe – DB). Colorado ♠ → 2 životy automaticky. Odměna 1 karta, Brokovnice 1 odhoz,
El Gringo 2× (za každý život – jeho text; fanoušci se přou).

**Divoká banda** — **všichni ostatní** (od levého souseda) v `BANDIDOS_DISCARD` odhodí
**1 kartu BANG!** (`playsAsBang` – Calamity, Zúčtování; Lemat ne, není jejich tah) **nebo
2 libovolné karty**; s 1 kartou odhodí ji, bez karet nic. Q♦ → Apache Kid (i Kalumet)
vynechán jako u kárových Indiánů. Henry ani Útěk/Mick se neuplatní. **Život se neztrácí
nikdy** (to je mezinárodní znění, ne naše).

**Tornádo** — **každý ve hře** včetně hráče (bez Tornáda v ruce) vybere v `TORNADO_PICK`
2 karty (1, má-li jednu; 0 → přeskočen) pro souseda po levici (R12). Přesun až po volbě
posledního, naráz, jednou animací. Suzy až po přesunu. Henry, Útěk/Mick, Molly – ne.
Nic se neodhazuje ani nelíže – karty jen mění majitele.

**Poker** — **všichni ostatní** s kartou v ruce vyloží v `POKER_PICK` 1 kartu lícem dolů
(skrytě, §2.7). Po posledním odhalení naráz; **není-li mezi nimi Eso** (vytištěná hodnota
`A`), hráč v `POKER_TAKE` vezme **až 2** z nich, zbytek do odhozu; s Esem jde všechno do
odhozu. Henry, Útěk/Mick – ne (hromadná karta).

**Duch** — §2.11. Zahrání = vyložení před vyřazeného hráče (ne dva Duchy před jednoho –
jména). Johnny Kisch vyložením druhého Ducha odhodí prvního → jeho duch odchází (správně
podle Kischova textu).

**Útěk** — §2.8. Hraje ho **cíl** (i mimo svůj tah) jako odpověď v `EVADE_OFFER` nebo
v RESPOND bang-efektu na jediný cíl. Molly za něj líže (R13).

**Obětavý skok** — §2.10. „Lze zahrát pouze mimo tvůj tah" → zachránce není na tahu;
„jinému hráči" → ne sobě; smí zabránit i zranění, které způsobil sám (dV). Pořadí:
**až po** obraně oběti (Vedle!, Barel), před Pivem na posledním životě (oběť si Pivo
nechá, když ji zachrání jiný).

---

## 5. Postavy po jedné

Jen pět postav původního českého vydání (rozhodnutí uživatele). Tři bonusové postavy
Dynamite Boxu jsou v příloze A.

**Colorado Bill** (znění Dynamite Boxu) — po zahrání karty BANG! (R5) sejme
(`CHECK_DRAW`, reason `COLORADO`, Lucky Duke/Podkova/John Pain se vezou) **před**
barelem. ♠ (`_effSuit`) → `_beginBangResolution(…, { unavoidable: true })`: žádný
Barel, Jourdonnais, Vedle!, Opětovná palba ani Útěk; **zůstává** Pivo na posledním životě
a Obětavý skok (BANG! neruší, jen zachraňují život). Dvojitá rána s ♠ = 2 životy.

**Limonádový Jim** — trychtýř na kartu Pivo ([`_madamYtoOnBeer`](../logic/goldRush.js#L903),
volaný ze všech tří cest: `playCard`, `beerLastLifeSave`, `beerForNugget`) se přejmenuje
na `_onBeerCardPlayed` a k Yto přibude Jim: zahrál-li Pivo **jiný** hráč, Jim je ve hře,
`canHeal(Jim)` a má kartu v ruce → fronta `LEMONADE_OFFER` → Jim odhodí libovolnou kartu
za +1 život, nebo odmítne. Salón, Whisky, Poslední pivo ani Láhev kartou Pivo nejsou.

**Evelyn Shebang** (česká verze) — ve fázi 1 **před lízáním** (dV: rozhodnout předem)
přibude možnost „o kartu méně → BANG! na hráče ve vzdálenosti ≤ 1" (`computeDistance`,
bez zbraně). `cardsNeeded − 1` (Žízeň → 0, Příjezd vlaku → 2 – DB), výstřel do `_vosShots`
(odpálí se po fázi lízání). Bang-efekt, ne karta BANG!; BANG! smí hrát dál normálně.
Bez cíle ve vzdálenosti 1 se možnost nenabízí. Vynechat jde **nejvýš 1 kartu** a cíl je
**jeden**.

**Mick Defender** — §2.8: v `EVADE_OFFER` smí místo Útěku zahrát kartu, kterou pustí
`playsAsMissed` (ne pod Coloradem ♠). Proti kartám BANG! se brání normálně.

**Henry Block** — §2.9. Výstřel jde od Henryho (zabiják, valouny, El Gringo), bez dostřelu,
bang-efekt. Útěk ho nezruší (není to karta).

---

## 6. Bot

Každá nová fáze má větev v `decideBotAction` (hlídá strukturální test „každý kind
z pendingActor má větev"). Cílí se přes `beliefs` jako všude:

- **EVADE_OFFER** – uniknout, když efekt škodí (Vězení, Chřestýš, Panika/Cat Balou na
  hodnotnou kartu, Duel se slabší rukou); Mick šetří Vedle! na BANG!, pokud nejde o Vězení.
- **SAVE_OFFER** – zachránit jen pravděpodobného spojence (`enemyProbability` nízko), vždy
  když jde o poslední život; odměnu brát z balíčku (spojence neokrádat).
- **TORNADO_PICK / POKER_PICK / BANDIDOS_DISCARD / SHOTGUN_DISCARD** – nejnižší `keepScore`.
  Poker: drží-li bot Eso a hraje nepřítel, vyloží **Eso** (zablokuje mu výběr).
- **POKER_TAKE** – 2 nejlepší podle `keepScore`. **LEMONADE_OFFER** – zraněný + karta
  s nízkou hodnotou.
- **PLAY:** Chřestýš a Odměna na nepřítele, Duch na mrtvého **spojence** (role je odhalená),
  Tornádo/Divoká banda/Poker jen když nepřátelé mají karty, Lemat nejhorší kartou, když
  chybí BANG!, Roztříštěná kulka jen když povinný druhý cíl není spojenec, Dvojitá rána k BANG! na
  nepřítele, Opětovná palba přednostně před Vedle! proti nepříteli.
- **DRAW (Evelyn)** – použít, když je ve vzdálenosti 1 nepřítel.

Brzdy proti smyčkám: Tornádo a Poker nemění počet karet ve hře, takže nejsou „karty lízni N"
(`RECYCLE_CAP` se jich netýká); Lemat ale dělá z každé karty BANG! – limit ho drží.

---

## 7. Testy

Nové sady (vzor `test/goldRush.*.test.js`): `vos.cards.test.js` (F1, F3, F4),
`vos.characters.test.js` (F2, F3), `vos.ghost.test.js` (F5), `vos.reactions.test.js`
(F6–F8), `vos.bot.test.js`. Ke každé kartě aspoň: základní efekt, každý řádek okrajových
případů z §4–5, kombinace s rozšířeními, kde se to v plánu zmiňuje (Laso, Belle Star,
Požehnání/Prokletí, Zúčtování, Kazatel, Zlatá horečka, Zuřivá Doroty, Teren Kill,
Sacagaway u skrytých voleb).

**Strukturální testy:**
1. každý `health > 0` / `health <= 0` v `logic/*` a `core/*` je v tabulce „ve hře / život" (F5);
2. `SELECTING_TARGET_CARD` se zakládá jen přes `_enterTargetSelection` (F6);
3. volající `handleDamage` / `takeDynamiteHit` / `takeNoonHit` jsou vyjmenovaní – nový
   vstup ztráty života bez brány Obětavého skoku test shodí (F8);
4. existující „každý kind z pendingActor má větev bota" a „CHAR_RANK zná každou postavu".

**Zátěž** (`test/server.bots.test.js`): `udoli_stinu` do matice „rozšíření × 3–8 hráčů"
a varianty „balíček samých X" pro Obětavý skok, Útěk, Duch, Tornádo, Poker, Divokou bandu,
Opětovnou palbu, Roztříštěnou kulku a stůl plný Henrych Blocků / Micků Defenderů.

---

## 8. Pořadí prací

Každá fáze končí zeleným `npm test`, bootem serveru a commitem + pushem (trvalé pověření).
Fáze s UI končí prosbou o kontrolu v prohlížeči.

| Fáze | Obsah | Proč v tomhle pořadí |
|---|---|---|
| **F0** | Data (s `text`, `art: null`), `CardType`, `BLUE_CARD_TYPES`, characters.json + `CHAR_RANK`, mixin a zrcadlo (kostra), `core/vosAnim.js` (kostra), `VOS_CARDS_READY`/`VOS_READY` prázdné, loader se štítky (§2.14), debug přepínač, rozhodnutí pro Doroty a Lee Van Kliffa (§2.17) + jejich strukturální test | nic nemění pravidla, dá se ověřit samotné |
| **F1** | Tomahawk, Poslední pivo, Chřestýš, Odměna, Lemat (+ `altBangOk`), Brokovnice (+ `SHOTGUN_DISCARD`), `isBangCardPlay`; **menu: karta „již brzy" → zapínací** | jen existující mašinerie; po F1 se dá rozšíření hrát |
| **F2** | Colorado Bill, Limonádový Jim (+ `LEMONADE_OFFER`) | postavy bez nových mechanismů |
| **F3** | Fronta výstřelů + `_afterVosShot` + zabiják; Opětovná palba, Roztříštěná kulka, Evelyn; klikané zásahy s útočníkem → Dvojitá rána | první nový mechanismus, na kterém stojí F7 |
| **F4** | Divoká banda, Tornádo, Poker (+ redakce, animace) | samostatné, vzor Daltonové |
| **F5** | Duch: audit `health > 0` + strukturální test, `isInPlay`/`canHeal`, settle hák, výhra, kreslení | velký audit – samostatně, ať se dá revertovat |
| **F6** | Okno úniku: helpery §2.8 + strukturální test, Útěk, Mick Defender | mění vstup do výběru karty pro všechny karty |
| **F7** | Henry Block (pozastavená akce) | nejsložitější tok, potřebuje F3 |
| **F8** | Obětavý skok (brány + odměna + redakce) | riziko jako Teren Kill; bez držitele karty se hra nemění |
| **F9** | Politika bota, zátěž (matice + „balíček samých X"), invarianty rozložení, výměna štítků za art, CLAUDE.md + `docs/pravidla/udoli-stinu.md` | uzavření |

### Co se ve fázi F0 odchýlilo od plánu (a proč)

- **Kde žije „hotové"**: `VOS_READY` (postavy) je v logic/entities.js jako u ostatních
  rozšíření, ale `VOS_CARDS_READY` (druhy karet podle JMÉNA) je v **core/valley.js** – ptá
  se ho i klient (katalog Zuřivé Doroty v `clientCardKinds`) a server mimo GameState
  (`_cardData` debug hry v server/rooms.js), takže musí být izomorfní a bez logic.js.
- **Dodání portrétu** = smazat `"portrait": false` u postavy v characters.json (loader
  bez něj soubor nestahuje, žádné 404). **Dodání značky supa** = `VOS_MARK_READY = true`
  v core/valley.js – pole „v JSON" by muselo sedět na 16 kartách naráz. Že příznaky sedí
  se soubory na disku, hlídá test.
- **Chybějící portrét dnes vypadal** jako obecný placeholder bez jména (každé místo se
  ptá `textures.exists('char_' + id)`). Proto se pod tentýž klíč peče **jmenovka**
  (`buildPortraitLabels`, game.js) – nic dalšího se kvůli tomu měnit nemuselo.
- **Štítek karty** (`paintCardLabel`) je nová větev `paintCardTexture` pro kartu bez artu,
  ale s `text` – tedy jen Údolí stínů; ostatní karty bez artu jdou dál starou nouzovou
  cestou. Značka rozšíření se obecně bere z `mark_<exp>` (býk Dodge City beze změny).
- **Rozhodnutí §2.17** je tabulka `VOS_KINDS` (core/valley.js) s dvojicí `dorothy`/`lvk`
  a zdůvodněním u každého druhu. Zapojená je hned: `dorothyCommandable`
  (core/playability.js) a `_brownRepeatSpec` (logic/wildWest.js) se na ni ptají. Karta
  zahraná JAKO BANG! pod Zúčtováním opakuje BANG!, ne svůj efekt, takže tabulka platí
  až za větví `asBang`.
- **Debug hra**: S16 nabízí chystaná rozšíření jako zapínací kartu (`_menuExpansionGrid`
  s `soonToggle`); souhrn `expansionsLabel` je zná taky. Creative mode (dávání karet)
  dostává jen hotové druhy, **galerie karet** všechny – je na kontrolu štítků a artu.
- **Text štítku Obětavého skoku a Ducha** je podle pravidel Dynamite Boxu (2 karty z ruky,
  nebo z balíčku; Duch si nechává postavu), ne podle starší karty – art pravidla nemění.

---

### Co se ve fázi F1 odchýlilo od plánu (a proč)

- **`lematBangOk`, `altBangOk` a `isBangCardPlay` sedí v core/playability.js**, ne
  v core/valley.js: potřebují `isPlayTurn`, `bangLimitFree`, `lawLocksOther`
  a `preacherBlocks`, a playability.js se na valley.js ptá sám (Doroty), takže by vznikl
  kruh. V core/valley.js zůstalo to, co kruh nedělá: `lematActive`/`shotgunActive`
  (zbraň podle `effect`, Laso ji vypíná) a `vosPlaceTargetOk` (Chřestýš, Odměna).
- **Zásah = i záchrana posledního života.** Pivo / Sid Ketchum / Batoh v RESPOND zásah
  nezruší, jen vrátí život – Odměna i Brokovnice proto platí i tam
  (`_vosOnBangHit` volá i `_advanceAfterLastLifeSave`).
- **Kontext útoku je `vos = { bangCard, shotgun }`** (§2.5 počítal s `vos` až pro frontu
  výstřelů v F3). Zbraň se posuzuje při výstřelu, Odměna až při zásahu (leží na stole
  cíle a může se mezitím změnit jen tam, kde to pravidla dovolují). Bez zapnutého
  rozšíření se klíč do stavu nepíše vůbec, takže se staré snímky stavu nemění.
- **Akce `vos_pick { cardIds, playerIdx }` existuje už teď**, i když ji zatím používá jen
  Brokovnice (jedna karta) – F4 (Tornádo, Poker, Divoká banda) do ní jen přidá fáze.
  Guard kontroluje `playerIdx` proti `pendingActor`.
- **Dynamit, který zůstal ležet, se v tahu podruhé nesnímá** (`_dynamiteStayTurn`). Klikaný
  zásah Chřestýše se vrací do `handleStartOfTurnChecks` (výchozí `resume`), a ten by jinak
  sejmul znovu dynamit, který nebylo komu poslat.
- **Odměna líže přes existující `KILL_REWARD`** s popiskem (`label: 'Odměna'` → „Odměna –
  líže 1 kartu"); `waitingStatus` kvůli tomu umí i „1 kartu".
- **Animace:** vyložení Chřestýše a Odměny letí jako Vězení (`jail_sequence`, i pod
  Zuřivou Doroty), odhoz za Brokovnici jako `hand_to_discard`. Nová cinematika nevznikla.
- **Doroty** smí poručit Chřestýše i Odměnu (cíl kdokoli kromě poručeného – stávající
  pravidlo výběru cíle), Lee Van Kliff smí zopakovat Poslední pivo (`LAST_CALL`).
- **Log výstřelu nese jméno karty** (`logEvent('bang', { …, card })`) – pomáhá hlášením
  chyb a zátěž podle něj pozná, že se Tomahawk opravdu hrál.
- **Zjištěno mimochodem:** server v `playBang` dostřel neověřuje (hlídá ho jen klient
  a bot, i u základních karet). V F1 se to neměnilo; test Tomahawku proto ověřuje dostřel
  sdíleným predikátem `computeCanHit` + `bangEffectReach`.
- **Bot:** Chřestýš na nepřítele (27), Odměna na nepřítele v dostřelu (14), Poslední pivo
  jako Pivo, jen se nešetří; Lemat a Brokovnice mají ve `weaponValue` příplatek (jinak by
  na Colt nikdy nevyměnil); Lemat střílí „poslední možností" stejně jako Zúčtování.
  V `SHOTGUN_DISCARD` odhazuje nejnižší `keepScore`.

## 9. Co plán vědomě nedělá

- **Časovaná okna** („reaguj do 3 s"). Okno čeká na klik jako každá jiná fáze; uživatel
  zvolil pauzu jen tehdy, když reagovat jde.
- **Obě vydání naráz** jako volbu v menu. Jde to (rozdíly jsou v predikátech), ale
  zdvojnásobí to testy; přidat se dá později.
- **Tři bonusové postavy Dynamite Boxu** (Black Flower, Spot-Burst Ringer, Tuco the
  Franciscan) – patří do mini-rozšíření Nejhledanější (příloha A).
- **Kombinace s Velkou vlakovou loupeží** (Ironhorse v DB) – rozšíření ve hře není.
- Změnu toho, **kdo je zabiják v Duelu** – mimo rozsah (§2.5).

---

## 10. Rozhodnutí uživatele (2026-10-21, doplněno 2026-10-24)

**Plán je kompletní – implementace začíná fází F0.** Otevřené otázky žádné nezbyly;
co se rozhodlo cestou, se zapisuje k fázi do §8 (vzor „Co se ve fázi N odchýlilo od
plánu" u Zlaté horečky).

| Otázka | Odpověď |
|---|---|
| **Q1** – které vydání | **Česká mechanika podle Dynamite Boxu 2023, ale jen 5 postav původního českého vydání** (Colorado Bill, Evelyn Shebang, Henry Block, Limonádový Jim, Mick Defender). Tornádo předává 2 karty doleva, Divoká banda „BANG!, nebo 2 karty", Evelyn o 1 kartu méně na vzdálenost 1, Útěk/Mick jen na jediný cíl, Lemat kromě Vedle!, Brokovnice jen s kartou BANG!; Colorado sejme při každém BANG!, Duch si nechává schopnost, Obětavý skok bere 2 karty z ruky nebo z balíčku. Bonusové postavy → mini-rozšíření Nejhledanější (příloha A). |
| **Q2** – pauza na reakci | **Jen tehdy, když reagovat jde.** Ostatní poznají, že *někdo* Obětavý skok drží (kdo, se neukazuje), resp. že cíl má Útěk / Mick kartu Vedle!. |
| **Q3** – art | **Dodává uživatel průběžně** (15 artů karet, značka rozšíření, 5 portrétů – seznam souborů v §2.14). Co chybí, kreslí se jako štítek. **Pravidla se podle artu nemění** – platí tenhle plán, i kdyby karta nesla starší znění. |

**Drobnosti rozhodnuté plánem (stačí říct, kdyby to mělo být jinak):** Henry Block
jednou za akci (R7); Molly Stark jen za dobrovolné zahrání (R13); Poslední pivo pod
Reverendem jde (není to Pivo); Big Spencer Opětovnou palbu hrát nesmí; Belle Star Ducha
nevyřazuje, Laso ano; Chřestýš a Odměna smí i před sebe; Dvojitá rána dává El Gringovi
dvě krádeže.

---

## Příloha A — bonusové postavy Dynamite Boxu (pro mini-rozšíření Nejhledanější)

**Do Údolí stínů nepatří** (rozhodnutí uživatele): přijdou později v mini-rozšíření
**Nejhledanější** spolu s Annie Versary a Emilianem. Tady jen to, co už rešerše zjistila,
ať se to nemusí hledat znovu. Texty a upřesnění jsou v [podkladu §3, §4.2 a §5](udoli-stinu.md#3-postavy-8);
**český text karet nebyl nalezen** (podklad má jen neoficiální návrh).

**Tuco the Franciscan** (dV: Tuco Franziskaner, **5 životů**, šerif 6 → druhá karta
životů, `HIGH_HEALTH_CHARS`) — v `_drawCountFor` ([logic/draw.js:85](../logic/draw.js#L85))
+2, pokud **v okamžiku fáze lízání** nemá před sebou modrou kartu (`isBlueCard` na stole
+ skutečná zbraň). Zelené karty a vybavení Zlaté horečky modré nejsou. Vězení/Dynamit, které
ho úspěšným sejmutím opustily, mu bonus neberou (Dynamite Box); Chřestýš zůstává, takže
bonus bere. Kit Carlson / Black Jack z toho berou základ (vzor Krumpáč).

**Black Flower** (4 životy) — 1×/tah (`p._vosFlowerTurn === turnId`) smí kartu **♣**
(`_effSuit` – pod Požehnáním ani Prokletím žádná) zahrát jako **BANG! navíc**: do limitu se
nepočítá, smí i bez předchozího BANG! (dV). Je to karta BANG! (R5 – „zahraná jako karta
BANG!"), takže ji přidat do `isBangCardPlay` a `altBangOk`. Kazatel ji zakazuje.

**Spot-Burst Ringer** (dV: Der Spot – Burst Ringer, 4 životy) — 1×/tah smí **kartu BANG!**
(pravý BANG!, Calamity se svým Vedle!; ne přes Lemat – dV) zahrát jako **Kulomet**:
`_advanceMassAttack(…, GATLING)` se suitem karty, `_massAttackName = 'Bang! (Spot-Burst
Ringer)'`. Do limitu se nepočítá; Odměna, Colorado, Brokovnice ne (Kulomet). Kárový BANG!
Apache Kida míjí (dV). Kazatel to zakazuje. Bot: jen když je v okruhu víc nepřátel než
spojenců.
