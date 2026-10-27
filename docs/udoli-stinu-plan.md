# Údolí stínů (The Valley of Shadows) — implementační plán

Podklad: [`docs/udoli-stinu.md`](udoli-stinu.md) (texty všech 16 karet a 8 postav v obou
vydáních, upřesnění z českých pravidel 3. vydání a Dynamite Boxu, oficiální upřesnění dV
a odpovědi dV na BGG, tabulka rozporů) + PDF `us_rules_cz.pdf`, `us_dynamite_box_cz.pdf`,
`us_rules_eng.pdf` a přehled karet `us_karty_dvgiochi.webp`.

**Stav: plán schválený (2026-10-21), hotové jsou fáze F0 (kostra), F1 (šest karet,
2026-10-24), F2 (Colorado Bill, Limonádový Jim, 2026-10-24), F3 (fronta výstřelů:
Opětovná palba, Roztříštěná kulka, Dvojitá rána, Evelyn Shebang, 2026-10-24), F4
(kolečko voleb: Divoká banda, Tornádo, Poker, 2026-10-25), F5 (Duch, 2026-10-25), F6
(okno úniku: Útěk, Mick Defender, 2026-10-26), F7 (Henry Block – pozastavená akce,
2026-10-27) a F8 (Obětavý skok – okno záchrany a odměna, 2026-10-27).**
Rozšíření jde zapnout v menu (`MENU_EXPANSIONS` v [core/menuModel.js](../core/menuModel.js));
do balíčku jde všech 15 druhů karet a do výběru všech 5 postav (nápovědu v menu drží
v souladu test).
Po F0: `npm test` = 1714 testů (výchozí stav byl 1697). Po F1: 1752 testů. Po F2:
1782 testů. Po F3: 1813 testů. Po F4: 1837 testů. Po F5: 1869 testů. Po F6: 1903
testů. Po F7: 1931 testů. Po F8: **1966 testů, 0 chyb**.

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
**značka 100×100 px** (stejně jako býk Dodge City, zvětšený kvůli supovi) s průhledností, **portrét 650×1000 px**, vše `.webp`
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

**Stav dodání (2026-10-24):** všech 15 artů karet, 5 portrétů i značka supa
(`VOS_MARK_READY = true`) jsou ve hře.

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
| **F3** ✓ | Fronta výstřelů + `_afterVosShot` + zabiják; Opětovná palba, Roztříštěná kulka, Evelyn; klikané zásahy s útočníkem → Dvojitá rána | první nový mechanismus, na kterém stojí F7 |
| **F4** ✓ | Divoká banda, Tornádo, Poker (+ redakce, animace) | samostatné, vzor Daltonové |
| **F5** ✓ | Duch: audit `health > 0` + strukturální test, `isInPlay`/`canHeal`, settle hák, výhra, kreslení | velký audit – samostatně, ať se dá revertovat |
| **F6** ✓ | Okno úniku: helpery §2.8 + strukturální test, Útěk, Mick Defender | mění vstup do výběru karty pro všechny karty |
| **F7** ✓ | Henry Block (pozastavená akce) | nejsložitější tok, potřebuje F3 |
| **F8** ✓ | Obětavý skok (brány + odměna + redakce) | riziko jako Teren Kill; bez držitele karty se hra nemění |
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

### Co se ve fázi F2 odchýlilo od plánu (a proč)

- **Nezrušitelnost nese kontext `vos`, ne `pendingResponse.unavoidable`.** Po pikovém
  sejmutí dostane útok `vos.unavoidable: true`; `vos` se už od F1 protahuje celým
  řetězem (barel → check → RESPOND), takže nové pole nemuselo nikam dalšímu. Ptá se
  jediný predikát **`vosUnavoidable(state)`** (core/valley.js): server v
  `handleResponse` (odmítne kartu z ruky i zelenou ze stolu), klient v
  `cardPlayability` a `isRespondMiss` (view/board.js), bot v RESPOND. Barel
  a Jourdonnais se vypínají už v `_beginBangResolution` (na barel se vůbec nesnímá).
  **Útěk a Opětovná palba (F3, F6) se na `vosUnavoidable` musí ptát taky.**
- **Sejmutí nese rozehraný BANG!** v `pendingCheckDraw.colorado = { attackerIdx,
  targetIdx, isEffect, sourceName, vos }` a `triggerCheckDraw` ho předá do
  `currentCheck` i do kontextu Lucky Duka / Podkovy. Výsledek dohrává
  `_coloradoResult` (logic/valley.js) přes `_beginBangResolution`.
- **Kárový BANG! na Apache Kida se nesnímá** – nemá žádný efekt, takže by nebylo co
  rušit (hák sedí v `playBang` až za imunitou). Jediný rozdíl proti doslovnému čtení:
  John Pain by si tu sejmutou kartu nevzal.
- **Zuřivá Doroty:** poručený Colorado sejme sám (`pendingCheckDraw.playerIdx` je jeho
  sedadlo, ne vypůjčené) – sedadlo se vrací hned jako u každého jiného zahrání.
- **Trychtýř na kartu Pivo se nepřejmenoval, ale rozdělil:** nový `_onBeerCardPlayed`
  (logic/characters.js) volá `_madamYtoOnBeer` (zůstal v logic/goldRush.js)
  a `_lemonadeOnBeer` (logic/valley.js). Všech pět míst volání ukazuje na trychtýř.
  Pořadí ve frontě: Madam Yto líže dřív, Jimova nabídka přijde po ní.
- **Jim i za Pivo za valoun** (Zlatá horečka) – i to je „zahraná karta Pivo"; stejný
  výklad jako u Madam Yto (dodatek „nezáleží, jestli šlo na život, nebo na valoun").
- **Akce je `vos_lemonade { cardId | null, playerIdx }`** (plán psal `cardIdx`): ID se
  nerozjede s optimistickým odebráním karty v klientu a `playerIdx` hlídá guard proti
  opožděnému kliku (víc Jimů jde přes Veru Custer / Greygoryho Decka).
- **Kdo nabídku dostane:** `lemonadeEligible` = ve hře, `canHeal` (ne plné životy, ne
  stín) a aspoň jedna karta. Táž podmínka čistí frontu (`_pruneSuzyQueue`), kdyby se
  Jim mezitím doléčil nebo odešel. Vynucenou kartu Práva západu odhodit nesmí (jen ve
  vlastním tahu, `lawProtectedCard`). Odhoz je dobrovolný, takže Molly Stark za něj
  mimo tah líže (R13) a Suzy Lafayette s prázdnou rukou taky.
- **UI bez okna:** banner nahoře, svítící ruka (klik = odhodit) a tlačítko „NE, DĚKUJI"
  v místě „Ukončit tah" – stejný vzor jako Brokovnice a Pokrevní bratři.
- **Bot:** Jim vymění kartu s `keepScore ≤ 4` (Vězení, Hokynářství, Panika…), na ≤ 2
  životech cokoli kromě Piva; jinak odmítne. Colorado nepotřeboval nic – sejmutí je
  existující větev `CHECK_DRAW`.
- **`beerByIdx`** (kdo Pivo zahrál, jen pro banner) je sedadlo, takže přibyl do
  `SEAT_KEYS` (logic/wildWest.js) – hlídá to strukturální test Lady Růže.

### Co se ve fázi F3 odchýlilo od plánu (a proč)

- **`_afterVosShot` nevznikl.** Výstřel končí na stejných místech jako každý jiný BANG!
  (konec obrany, úspěšný barel, záchrana posledního života) a všechna tři volají
  `_processSpecialQueue` ve fázi PLAY – tam se rovnou odpálí další výstřel z fronty
  (`_drainVosShots`, hned za Roubíkem). Další místa odpalu: `_resumeAfterSpecial`
  (za `gagFlush`), pojistka v `tryEndTurn` (nejdřív výstřel, pak konec tahu) a v háku
  `beforeBroadcast` (server/anim.js); `nextTurn` nedoběhlé výstřely zahodí.
- **Ocas fáze lízání frontu podrží** (`_vosHolding` v `_finishDrawTail`
  a `chooseHandcuffsSuit`): po frontě odložených akcí se tam ptají Želízka a Ranč
  („je fáze PLAY?") a výstřel Evelyn by je přeskočil. Odpálí se až za nimi.
- **Zabiják** se nepředává přes `pendingResponse.killerIdx`, ale z kontextu útoku:
  výstřel nese `vos.shot` (BACKFIRE / FANNING / EVELYN) a `handleResponse` pak volá
  `handleDamage(…, { killerIdx: originatorIdx })`; Dvojitá rána předává zabijáka v každém
  kliku. Duel se nemění (jak plán chtěl).
- **Smrt hráče na tahu mimo fázi PLAY** (výstřel zpět ho zabil ve fázi RESPOND) se
  dorovnává obecným `_turnOwnerGone` (logic/combat.js): s frontou odložených akcí
  (odměna za banditu, Herb Hunter…) `_nextTurnAfterQueue`, bez ní `_autoEndTurnPending`.
  **Zjištěno mimochodem a opraveno:** úplně stejně zůstával na tahu mrtvý hráč, který
  prohrál VLASTNÍ Duel (v základní hře) – mohl dál hrát karty, bot pak tah ukončil sám.
  `_turnOwnerGone` se teď volá i na konci Duelu; zátěž F3 to hlídá.
- **Pivo proti Dvojité ráně v obraně je dovolené** (plán ho v RESPOND zakazoval): zachrání
  jeden ze dvou životů a druhý se kliká (`_advanceAfterLastLifeSave` → `_startAimHits(…, 1)`).
  Výsledek je stejný jako „Pivo až mezi kliky", jen klient ani bot nepotřebují nový zákaz.
- **Opětovná palba je `isMissedCard`** (core/playability.js) – jediný dotaz „je to karta
  Vedle!?" pro `playsAsMissed`, Big Spencera, Calamity Janet (`playsAsBang`, Kazatel,
  `nativePlayInTurn`, `getActionForCard`) i Lemat. Ve vlastním tahu se nehraje.
- **Roztříštěná kulka má akci `FANNING`** (getActionForCard) a hratelnost `fanningOk`
  (limit BANG!, Právo západu jako u BANG!u, cíl existuje). `fanningTargets` vrací seznam
  už zúžený podle povinnosti DB; bez možného druhého cíle se klientem poslaný druhý cíl
  tiše zahodí a je to obyčejný výstřel. Lee Van Kliff si ji do paměti zapíše (je hnědá),
  zopakovat ji ale nesmí (`VOS_KINDS`).
- **Lemat smí udělat BANG! i z Roztříštěné kulky a Dvojité rány** – výjimkou je jen
  karta Vedle! (text karty).
- **Evelyn Shebang** = volba `'evelyn'` v `options` fáze lízání (nabídne se jen s cílem
  ve vzdálenosti 1) a akce `draw_card { source: 'evelyn', sourceIdx: cíl }` – nová akce
  nevznikla. Pod Žízní (`cardsNeeded` 1 → 0) fáze lízání hned končí.
- **Bot:** Opětovná palba přednostně proti nepříteli (proti spojenci obyčejné Vedle!),
  Dvojitá rána ke každému výstřelu kartou BANG!, Roztříštěná kulka jen na dvojici bez
  spojence (`fanningPick`; vynucená Právem západu na kohokoli), Evelyn na nepřítele
  ve vzdálenosti 1. `keepScore`: Opětovná palba 7, kulka 6, Dvojitá rána 4.
- **Animace:** výstřel z fronty žádnou let nemá (není karta) – banner obrany ho
  pojmenuje („Opětovná palba od hráče X"). Dvojitá rána přidává do banneru „−2 ❤"
  a klikané zásahy mají popisek „🎯 Dvojitá rána".

### Co se ve fázi F4 odchýlilo od plánu (a proč)

- **Jeden stav pro všechny tři karty:** `pendingVosRound = { kind, byIdx, waiting,
  picks, pool, playerIdx }` (logic/valley.js) se čtyřmi fázemi `BANDIDOS_DISCARD`,
  `TORNADO_PICK`, `POKER_PICK` a `POKER_TAKE`. **Z ruky vybírají všichni naráz**
  (rozhodl uživatel 2026-10-25 – zrychlí to hru): `waiting` = kdo ještě nevybral,
  hra počká na posledního. Na víc hráčů najednou se čeká jen tady, proto přibylo
  **`pendingActors(state)`** a **`waitingStatusFor(state, idx)`** (core/pending.js):
  bot driver rozhýbe kteréhokoli čekajícího bota, guard pustí `vos_pick` od kohokoli
  z `waiting` (jen za vlastní místo) a klient rozsvítí jantarově všechny, kdo ještě
  vybírají. `pendingActor` vrací prvního z nich (popisek, log). Výběr z vyložených
  karet Pokeru (`POKER_TAKE`) dělá jen hráč, který Poker zahrál (`playerIdx`). Hráč bez
  karet nevybírá vůbec.
- **Divoká banda odhazuje hned**, ne až po posledním (plán §2.7 ji házel do jednoho pytle
  s Tornádem a Pokerem). Text karty nic současného neříká a odhoz je veřejný, takže
  skrývat není co. Platná volba = 1 karta, která `playsAsBang` (Calamity, Zúčtování),
  nebo 2 libovolné, s jedinou kartou ta jedna. Q♦ vynechá Apache Kida i Kalumet.
- **Tornádo a Poker si volbu jen zapíšou** (`picks`), karty se hýbou až po posledním.
  Redakce nechává `picks[].cardIds` jen vlastníkovi (ostatním prázdný seznam = „už
  volil"). Tornádo nejdřív všem vezme a pak rozdá, takže se přijatá karta v tomtéž
  Tornádu neposílá dál. Poker přesune vyložené karty do `pool` – po dobu výběru neleží
  v žádné hromádce (jako nabídka hokynářství); s Esem (vytištěná hodnota `A`) nebo bez
  karet jdou rovnou do odhozu.
- **Jediný predikát platné volby:** `vosRoundPickOk` a `pokerTakeOk` (core/valley.js) –
  server odmítá, klient podle nich rozsvěcí tlačítko a bot je musí splnit.
  `playsAsBang` si core/valley.js bere líně (playability.js se na valley.js ptá sám).
- **Karta odchází z ruky dřív, než se začne vybírat** (`_vosPlayRound`, volá ji
  `cardEffects` v `playCard` a vrací `false`): jinak by šlo Tornádo předat sousedovi.
- **Fronta odložených akcí během kolečka stojí** (`_processSpecialQueue` vrací `true`,
  dokud `pendingVosRound` existuje) a kolečko si ji zavolá samo po doběhnutí. Suzy
  Lafayette, která dala poslední kartu, si tak lízne až po přesunu – a u Tornáda, které
  jí karty vrátilo, vůbec. Ze stejného důvodu ho **nepřeruší Roubík** (`_gagCalm`):
  líznutí Barta Cassidyho za pokutu by nemělo kudy proběhnout.
- **Lee Van Kliff** opakuje všechny tři (`_brownRepeatSpec` → `_startVosRound`, Apache
  Kida rozhoduje barva PŮVODNÍ karty), **Zuřivá Doroty** je poroučí běžnou cestou
  `playCard` (kolečko si `byIdx` nese samo, sedadlo se vrací hned).
- **Akce:** `vos_pick { cardIds, playerIdx }` (rozšířená) a nová `vos_poker_take
  { cardIds, playerIdx }` (0–2 karty najednou, ne po jedné). Obě hlídá guard proti
  opožděnému kliku. Do otisku pokroku botů (`progressSig`) přibylo „kdo je na řadě
  a kolik voleb je zapsaných" – zápis volby jinak stav viditelně nemění.
- **Animace** zapisují pravidla (`_vosAnim`) a posílá je hák `flushVosAnim` před
  broadcastem (kolečko doběhne z vos_pick, play_card, Lee Van Kliffa i Doroty):
  `tornado_pass` (jen počty karet – které karty dávám já, ví klient ze své volby),
  `poker_reveal` (veřejné karty i s hodnotou a barvou; s Esem se žádný nápis
  neukazuje – první Eso, `aceIdx`, se zvětší, zabliká na něm hodnota stejnou markou
  jako u sejmutí a všechno odletí do odhozu) a `poker_take`.
  Časování v core/vosAnim.js, boti čekají na `room._vosBlockUntil`.
- **UI:** výběr v ruce jako u Ranče (`App.vosSel`, celá ruka světle modře, označené
  karty zmenšené a šedé, hover kartu jen zvětší; tlačítko ODHODIT / PŘEDAT / VYLOŽIT
  v místě „Ukončit tah"), vyložené karty Pokeru v řadě uprostřed stolu se jménem toho,
  kdo je vyložil (klik označí, tlačítko VZÍT / NEBRAT NIC). Kdo už volil a čeká, má své
  karty v ruce zašedlé.
- **Bot:** Divoká banda radši nejlacinější kartou BANG! než dvěma kartami, Tornádo
  a Poker nejhorší karty (`keepScore`); hraje-li Poker nepřítel, vyloží Eso. Z vyložených
  karet bere 2 nejcennější (Dynamit nechá). Divokou bandu hraje s převahou nepřátel,
  Poker vždy, když mají ostatní karty, Tornádo až nakonec tahu.
- Henry Block, Útěk ani Mick Defender ještě nejsou (F6, F7) – nic se kvůli nim nečeká.

### Co se ve fázi F5 odchýlilo od plánu (a proč)

- **Tři dotazy místo dvou, všechny v core/distance.js:** `hasDuchCard` (karta na stole),
  `isVosGhost` (= vyřazený s kartou Duch) a nový **`staysInPlay`** = „ve hře NATRVALO"
  (živý nebo Duch). `isInPlay` zahrnuje i ducha Města duchů a stín na jejich tah, a řada
  míst (pořadí tahů, kdo odkrývá události, Daltonové, výhra, dedukce rolí, Mrtvý muž,
  Hřbitov) je dřív schválně vynechávala přes `health > 0` – ta se ptají `staysInPlay`,
  takže se jim nic nemění. `hasDuchCard` se proto přesunul z core/valley.js do
  core/distance.js (ptá se ho isInPlay); core/valley.js ho dál exportuje.
- **Na Ducha se nestřílí.** Plán to neřešil; Duch „nemůže ztratit žádný život", takže by
  výstřel nic neudělal a obrana by byla zbytečná pauza (R4). `computeCanHit` pro Ducha
  vrací `false` (tím se ptá klient, bot i server), `playBang` a Duel ho odmítají,
  Kulomet / Indiáni ho přeskakují, Evelyn ani Roztříštěná kulka (ani druhým cílem) na
  něj nemíří a odložený výstřel z fronty na Ducha propadá. Krást, odhazovat, Vězení,
  Chřestýš, Odměna i Daltonové na něj jdou – ve hře je.
- **Co bere život, Ducha míjí:** dynamit se k němu posouvá (ve hře je), u něj vybuchne
  bez zásahu a tah jde dál; na Chřestýše se mu nesnímá; Ruská ruleta, Fistful of Cards,
  Pravé poledne, Madam Zuzana i Roubík se ho netýkají (ptají se `health > 0` – skutečný
  život). Léčit se nedá ničím (`canHeal`, `_heal`), **Nová identita** se mu nenabízí
  („klesne na 2 životy" by byl zisk), Greg Digger se jako Duch neléčí, Herb Hunter líže.
- **Úklid po odchodu (`_vosGhostSettle`, logic/valley.js)** proběhne v KLIDU (fáze PLAY,
  nic rozdělaného – `_vosGhostCalm`) na čtyřech místech: `_processSpecialQueue`
  s prázdnou frontou, `_resumeAfterSpecial`, krok startu tahu hned za efekty událostí
  (`_vosGhostTurnStep` – Daltonové a Laso) a hák před broadcastem (server/anim.js).
  Odvozený stav hráče vyřadí okamžitě, úklid jen odhodí ruku a stůl (animace odchodu
  ducha, `_ghostLeaveAnim`), přepočítá výhru a – odešel-li hráč na tahu – posune tah.
  Odejdou-li dva naráz (Laso), animaci dostane jen první.
- **Soudce** (Fistful) nově blokuje i Chřestýše a Odměnu – v F1 to chybělo – a s nimi
  Ducha: všechny tři se vykládají před hráče.
- **Helena Zontero** míchá role všech hráčů VE HŘE, tedy i Ducha – jeho role je pak
  zase tajná (`_roleRevealed` shodí `_reshuffleRoles`). Hřbitov ho naopak nevrací
  a jeho roli nemíchá (není vyřazený, dV 1528720).
- **Animace a ledger:** Duch letí před cíl jako Vězení (`jail_sequence`, i pod Zuřivou
  Doroty), v ledgeru chování je to pomoc (`support`). Doroty smí Ducha poručit (cíl =
  vyřazený), Duel poručit na Ducha nejde.
- **Klient:** s vybraným Duchem jde kliknout na portrét vyřazeného hráče (jinak je
  neinteraktivní); Duch se kreslí jako hrající, jen s průsvitným portrétem
  (`VOS_GHOST_ALPHA`, view/board.js). Krádeže (Panika, Cat Balou, Ragtime, Krytý vůz,
  Kankán, Pat Brennan) Ducha zvýrazní. **Render neověřený** – čeká na kontrolu v prohlížeči.
- **Bot:** karta Duch na stole má hodnotu 10 (`boardCardValue`) – Daltoni ani Rvačka
  ji spojenci nesundají a Cat Balou / Panika nepříteli sáhnou rovnou po ní
  (`chooseTargetCardArea`). Ducha nepřítele bot krade přednostně (skóre 31; rankEnemies
  ho nevrací, protože se na něj nestřílí). Ducha zahraje jen na vyřazeného spojence
  (role je odhalená, skóre 24); pod Právem západu na kohokoli platného.
- **Strukturální test** (test/vos.ghost.test.js, `LIFE_OK`): každé napřímo položené
  `health > 0` / `health <= 0` v logic.js, logic/* a core/* má v tabulce důvod; po
  auditu jich zbylo 38, všechny „skutečný život". Klient (view/*) se v testu nehlídá.
- **Zátěž** „balíček plný Duchů" (16 kusů, 3–8 hráčů, samo i se vším): v jednom běhu
  29 návratů, 15 odchodů, 88 tahů Duchů; nikdy nezůstal vyřazený na tahu a Duch nikdy
  nezískal život.
- **Zjištěno mimochodem:** zátěž F1 („odhoz Brokovnice se ani jednou neobjevil") občas
  selže na pokrytí – i na čistém stavu před F5 (2 z 25 běhů). Nejde o zaseknutí, jen
  o vzácný jev v malém počtu her.

### Co se ve fázi F6 odchýlilo od plánu (a proč)

- **Tři vstupy podle §2.8, pokračování jako DATA:** `_enterTargetSelection(sel, { evade,
  pick })`, `_placeOnTarget(card, att, tar)` a `_startDuel(pr, evadable)` (logic/valley.js)
  se zastaví ve fázi `EVADE_OFFER` přes `_vosEvadeGate`, ale jen když `vosEvadable`
  (core/valley.js) – cíl drží Útěk, nebo je Mick a má kartu, kterou pustí `playsAsMissed`
  (R4). Odmítnutí dohraje `_evadeContinue` podle `pendingEvade.resume` (`SELECTION` /
  `PLACE` / `DUEL`), ne znovuzavoláním původní funkce. Karty s předem zvolenou oblastí
  (Ragtime, Krytý vůz, Kankán) nesou v `resume.pick` i ji, takže se po odmítnutí rovnou
  vyřeší. Sám na sebe se nikdo nevyhýbá (Ragtime na vlastní stůl, Chřestýš před sebe),
  Duch (cíl = vyřazený) okno neotevírá.
- **Vyložená karta leží před cílem UŽ BĚHEM rozmýšlení** (Vězení, Chřestýš, Odměna):
  letí tam svou obvyklou animací a cíl vidí, čemu se vyhýbá; únik ji odtud odhodí
  (`board_to_discard`). Johnny Kisch a Suzy Lafayette se vyhodnotí až po rozhodnutí
  (`_placeSettle`). Plán počítal s kartou „v odhozu místo na stole".
- **Dokud okno visí, fronta odložených akcí stojí** (`_processSpecialQueue` vrací `true`,
  vzor kolečka voleb) a **Roubík ho nepřeruší** (`_gagCalm`). Suzy, která zahrála poslední
  kartu (Paniku), si lízne až po rozhodnutí cíle.
- **Útěk proti bang-efektu** (Úder, Tomahawk, Springfield, zelené karty, výstřel Opětovné
  palby, Roztříštěná kulka s jediným cílem, opakování Lee Van Kliffem) je v RESPOND další
  platná odpověď – zruší CELÝ efekt (na počtu Vedle! nezáleží a nic se neodráží). Jediný
  predikát `escapeRespondOk` (core/valley.js) se ptá serveru (`handleResponse`), klienta
  (`cardPlayability`) i bota. Neplatí proti kartě BANG! (`vos.bangCard`, Odstřelovač,
  Odražená střela), hromadným útokům, Duelu, útoku bez střelce (Fistful of Cards),
  Coloradovu ♠ ani proti tomu, co kartou není nebo nemíří na jediného: kontext útoku
  dostal příznak **`vos.noEscape`** (Doc Holyday, Láhev jako BANG! ze Zlaté horečky,
  Roztříštěná kulka se dvěma cíli – oba výstřely) a výstřel Evelyn se pozná podle
  `vos.shot`.
- **Zlatá horečka (R11):** Komplic a Láhev jdou přes `_repeatBrownEffect` stejně jako Lee
  Van Kliff, takže deskriptor nese `gear: true` a okno se pro ně neotevírá.
- **Mick a Úhyb:** zahraje-li Mick jako kartu Vedle! Úhyb, líznutí k němu patří (jako
  v obraně, `UHYB_DRAW`). Big Spencer (třeba přes Greygoryho Decka) kartu Vedle! hrát
  nesmí, takže se mu okno neotevře – hlídá to sám `playsAsMissed`.
- **Molly Stark (R13)** líže za Útěk i za Mickovo Vedle! – je to dobrovolně zahraná karta
  mimo tah.
- **Akce je `vos_evade { cardId | null, playerIdx }`** (plán psal `cardIdx`) – stejný
  důvod jako u Limonádového Jima. Guard ji hlídá proti opožděnému kliku. Ragtime
  v `discard_another_card` krádež neanimuje, dokud se čeká na únik; animace krádeže /
  odhozu po odmítnutí (oblast zvolená předem) posílá handler `vos_evade`.
- **Bot:** Vězení a Chřestýšovi uhne vždycky, Odměně jen Útěkem, Panice / Cat Balou od
  nepřítele vždycky (od spojence jen když mu na stole neleží Vězení / Dynamit, které by
  mu mohl sundávat), Duelu když nemá aspoň dvě karty BANG!. Mick si jedinou kartu Vedle!
  šetří na BANG! (utratí ji na Vězení / Chřestýše, Duel, nebo když jich má víc). Útěk
  v obraně až po obyčejném Vedle! a zelené kartě ze stolu. `keepScore` Útěku 5.
- **UI** (view/board.js): banner „X na tebe hraje Y – vyhneš se?", svítící Útěk / karty
  Vedle! (klik = únik, intent `VOS_EVADE`) a tlačítko „NEVYHÝBAT SE" v místě „Ukončit tah"
  – vzor Limonádového Jima. **Render neověřený.**
- **Strukturální test** (test/vos.reactions.test.js): `phase = "SELECTING_TARGET_CARD"`
  smí v logic.js a logic/* stát jen v `_enterTargetSelection`, `_evadeContinue` a třech
  hromadných výběrech (`_advanceBrawl`, `_nextVultureSplitPick`, `_advanceDaltons`).
- **Zjištěno mimochodem a opraveno (F5):**
  1. **Duch pod Právem západu** zůstal v tahu zamčený: vynucený BANG! bez jiného cíle se
     má poslat na sebe, jenže na Ducha se střílet nedá – server výstřel odmítal a tah
     nešel ani ukončit (i člověku). `_lawHasTarget` (core/playability.js) teď pro Ducha
     bez jiného cíle povinnost nevynucuje.
  2. **Zátěž „balíček plný Duchů" občas nedoběhla** – vinou testu, ne pravidel: server
     drží Paniku, Cat Balou, Krytý vůz a Kankán mimo odhoz, dokud je tam nedoveze animace
     (`setTimeout` v server/handlers.game.js), a synchronní pumpa testu timeouty nikdy
     nespustila. Po pár stech tazích v balíčku nezbyla jediná karta, která by Duchovi
     sebrala kartu, a hra samých Duchů neměla jak skončit. `pumpToWinner`
     (test/server.bots.test.js) teď po každé akci spustí čekající timeouty (`mock.timers`).
- **Zátěž F6:** balíček plný Útěků (+ Tomahawky), každá druhá hra se stolem samých Micků,
  čtvrtina se všemi rozšířeními; hlídá, že okno nikdy nezůstane viset mimo svou fázi
  a že se otevřelo, uniklo se Útěkem, Mickem i v obraně.

### Co se ve fázi F7 odchýlilo od plánu (a proč)

- **Pozastavená akce je `_vosSuspended = { kind, henryIdx, thiefIdx, … }`** (logic/valley.js)
  se třemi druhy – `SELECTION` (uložený výběr + oblast + ID karty na stole), `DRAW` (Jesse
  Jones / Pat Brennan: zdroj, cíl, oblast a `drawId` fáze lízání) a `GEAR` (ID vybavení).
  Argumenty jsou POJMENOVANÁ pole, ne pole `args` (§2.9): sedadla v nich musí umět
  přemapovat výměna míst Lady Růže, takže `henryIdx`/`thiefIdx` přibyly do `SEAT_KEYS`.
  `SAVE` (odměna Obětavého skoku) přibude s F8 – stačí zavolat `_henrySuspend`.
- **Kde se akce dokončí:** `_henryResume` sedí na začátku `_processSpecialQueue` (hned po
  pročištění fronty) a v `_resumeAfterSpecial` – tedy PŘED schopnostmi, které výstřel
  spustil (Bart Cassidy, El Gringo): krádež je pořád efekt zahrané karty („nejdřív doběhne
  efekt"). El Gringo, kterého Henry zasáhl, mu tak bere kartu až PO krádeži. Pojistky
  jsou v `tryEndTurn` a v háku před broadcastem; `nextTurn` nedoběhlou akci zahodí.
  `_afterVosShot` nevznikl (stejně jako v F3) – konec výstřelu poznají ta místa sama
  (fáze PLAY, žádná obrana / barel / sejmutí / klikaný zásah).
- **Teren Kill jako zloděj** (Divoký západ): výstřel ho „vyřadil", ale vyřazení se
  pozastavilo na sejmutí. Akce proto čeká, až fronta sejmutí odbaví: ♠ = umírá a karta
  zůstává Henrymu, jinak si ji vezme (a pak si líže za přežití).
- **Fáze lízání během výstřelu** (Jesse, Pat): `drawPhaseState` zůstává, jen dostane
  `active: false`; po výstřelu se fáze DRAW obnoví a `drawCard` se zavolá znovu. Že jde
  pořád o tutéž fázi lízání, hlídá `drawId`. Kterou kartu Jesse z ruky dostane, se
  losuje až po výstřelu.
- **Na koho se nestřílí:** Henry střílí jen na toho, kdo umí ztratit život – na Ducha,
  stín ani ducha Města duchů na nule ne (pauza by nic neudělala, R4); akce pak proběhne
  hned. Sám sobě (vlastní Cat Balou / Ragtime na svůj stůl) Henry nestřílí.
- **Rvačka:** spouští Henryho jednou za jeho kartu – každý cíl Rvačky je vlastní výběr,
  takže „jednou za akci" plyne samo. Po výstřelu Rvačka pokračuje dalším cílem.
- **Zlatá horečka:** cena za vynucené odhození vybavení se platí HNED (je to „zahraná
  karta" té akce, stejně jako Panika jde do odhozu před výstřelem); vybavení odejde až
  po výstřelu (`_gearForceFinish`).
- **Zabiják je Henry** (`vos.shot = 'HENRY'`, stejně jako u Opětovné palby): odměnu za
  vyřazeného banditu dostává on. Útěk výstřel nezruší (`noEscape`); Opětovná palba ano
  a výstřel zpět jde frontou výstřelů – odpálí se až po dokončené krádeži.
- **Animace:** handlery (`select_target_card`, `discard_another_card`, `draw_card`)
  při pozastavení let krádeže NEposílají – Panika / Cat Balou z ruky jen doletí do odhozu.
  Pohyb karty si po výstřelu zapíšou pravidla (`_henryAnim`, ID karty hlásí sama akce
  přes `_henryMovedId`) a pošle ho hák před broadcastem `flushHenryMove` (server/anim.js)
  existujícími animacemi: `ragtime_steal` (z ruky líc jen zloděj), `jesse_jones_draw`,
  `hand_to_discard` / `board_to_discard`. Redakce `_henryAnim` pro jistotu nuluje.
  Banner obrany říká „Henry Block (X) střílí – sáhl jsi na jeho kartu!". **Render
  neověřený.**
- **Zjištěno mimochodem a opraveno:** `resolveCardSelection` brala jako kartu i Colt .45
  (výchozí zbraň s `id: -1`) a se záporným indexem stolu by `splice(-1)` odebrala
  poslední kartu. Obojí teď nevezme nic – klient ani bot to nikdy neposílali.
- **Roubík** pozastavenou akci nepřeruší (`_gagCalm`) – pokuta by mohla vyřadit zloděje
  i Henryho uprostřed efektu, který se ještě nedohrál.
- **Bot** nepotřeboval nic: výstřel je obyčejná obrana (RESPOND). Že bot při výběru
  cíle Paniky / Cat Balou Henryho zatím nezohledňuje, je věc F9 (politika bota).
- **Zátěž F7:** stůl samých Henryů, nebo Henry + Jesse Jones + Pat Brennan, balíček
  s pětinásobkem Panik a Cat Balou (a s Dodge City i Rvačky, Ragtime, Krytý vůz,
  Kankán). Za běh ~190 výstřelů, 4–10× zloděj padl a karta zůstala Henrymu; nikdy
  nezůstala viset akce ve fázi PLAY a žádná karta se nezdvojila.

### Co se ve fázi F8 odchýlilo od plánu (a proč)

- **Brána má tři výsledky** – `_vosSaveGate(victimIdx, resume)` vrací `'PASS'` (zásah jede
  dál), `'SAVED'` (zásah se neuplatní) a `'WAIT'` (okno se otevřelo, volající končí).
  Pokračování je opravdu znovuzavolání téže funkce (§2.10): rozhodnutí se zapíše do
  `_vosSaveDecision`, `_vosSaveContinue` vrátí fázi (`pendingSave.backPhase`) a zavolá
  `handleResponse` / `takeDynamiteHit` / `takeNoonHit` znovu – brána rozhodnutí spotřebuje.
  Zbytek toku (konec Duelu, další cíl Kulometu, série Fistfulu, Teren Kill) se nezměnil.
- **Dvojitá rána se v RESPOND neptá** – její dva životy jsou klikané zásahy, takže se okno
  otevírá u KAŽDÉHO z nich zvlášť (brána CLICK). Stejně dynamit: každý ze tří zásahů je
  „1 život" a dá se zachránit zvlášť. Odražená střela (Fistful) život neohrožuje – brána
  se přeskakuje.
- **Záchrana není zásah.** Karta říká „zabráníš ztratit život" – na rozdíl od Piva na
  posledním životě (které život vrací) se tedy nespouští nic, co patří zásahu: Odměna,
  Brokovnice, valoun, Bart Cassidy, El Gringo, statistika zásahů.
- **Pořadí vůči Pivu:** okno se otevře, až oběť zásah PŘIJME (klik na životy). Oběť
  na posledním životě si tedy může vybrat Pivo dřív, než se zeptá zachránce – plán chtěl
  „před Pivem", jenže kdo kartu drží, oběť neví (R4), takže by se rozhodovala naslepo
  tak jako tak. Když zachránce odmítne, život padá (Pivo už oběť nezahrála).
- **Víc zachránců:** kus je v balíčku jeden, ale s namnoženými daty (zátěž, debug) jich
  může být víc – nabídka jde po směru od oběti jednomu po druhém (`pendingSave.declined`).
  Zachránce smí být i Duch (je ve hře); duch Města duchů a stín ne (ve hře jsou jen na
  svůj tah, a ten je pak „jejich tah").
- **Redakce:** ostatním se nuluje `saverIdx` i `declined` (i odmítnutí prozrazuje, kdo kartu
  drží), takže jim `pendingActor` vrátí `null`. Štítek u hráče se nekreslí nikomu; banner
  nahoře říká „X ztrácí život (zdroj) – čeká se, jestli někdo nezasáhne…".
- **Odměna jde přes `_vosSaveRewards`, ne přes frontu odložených akcí.** Fronta se
  odbavuje i uprostřed efektu (Bart Cassidy mezi zásahy dynamitu, mezi cíli Kulometu),
  kdežto odměna má přijít až „po doběhnutí efektu" (dV 1588981). Vyřizuje se proto
  v klidu – `_drainSaveReward` na začátku `_drainVosShots`, takže všude, kde se odpaluje
  fronta výstřelů (fronta odložených akcí, konec tahu, hák před broadcastem). Klid
  (`_vosQuiet`) sdílí s frontou výstřelů. U dynamitu a Pravého poledne tak odměna přijde
  až po startu tahu oběti (fáze lízání je pořád součást startu tahu). Tím je rozhodnutá
  i otevřená otázka 4 (podklad §7): „přežije-li" = přežije CELÝ efekt.
- **Odměna z balíčku se líže klikáním** (`KILL_REWARD` se štítkem „Obětavý skok"), jako
  každé jiné líznutí – žádná nová animace (paměť „líznutí jsou jednotná"). Z ruky se berou
  náhodné karty; animaci (`ragtime_steal` bez `chosen`, tedy pod Sacagaway s gestem) zapíše
  pravidlo do `_vosSaveAnim` a pošle `flushSaveTake` – karty se u Henryho berou až po jeho
  výstřelu uvnitř cizí akce, stejně jako u F7.
- **Zjištěno při zátěži a opraveno:** zásah, o kterém se rozhodovalo, se dohrává uvnitř
  handleru `vos_save` – ne v `respond_to_card` / `take_dynamite_hit`, odkud přišel. Ty po
  zásahu posílají animaci vyřazení a volají `handleAutoEndTurn`; bez toho samého v
  `vos_save` zůstal hráč, kterého na jeho tahu zabil Henryho výstřel, mrtvý na tahu.
- **Bot:** zachraňuje pravděpodobného spojence (šance „nepřítel" ≤ 0,2), na posledním
  životě i toho, kdo je spíš spojenec než nepřítel; nepříteli nikdy. Odměnu od spojence
  bere z balíčku, od nepřítele se dvěma kartami z ruky – kromě Henryho Blocka (vystřelil
  by). `keepScore` Obětavého skoku 5. Protože bot zachraňuje jen spojence, cestu „z ruky"
  v zátěži F8 vynucuje polovina her přepsáním volby (jinak by se nespustila).
- **Strukturální test** (test/vos.save.test.js): každé `handleDamage(`, `takeDynamiteHit(`,
  `takeNoonHit(` a `health--` v logic.js a logic/* má v tabulce důvod – brána, nebo
  dobrovolná ztráta (Chuck Wengam, Pokrevní bratři).
- **Menu:** nápověda je teď „16 karet a 5 postav; karty hrané mimo tah a Duch" (test hlídá,
  že „Rozpracované" zmizí, až je hotovo všechno).

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
