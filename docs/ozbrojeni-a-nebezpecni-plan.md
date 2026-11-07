# Ozbrojení a nebezpeční (Armed & Dangerous) — implementační plán

Podklad: [`docs/ozbrojeni-a-nebezpecni.md`](ozbrojeni-a-nebezpecni.md) (texty všech 28 karet
a 8 postav, česká upřesnění, rozdíly vydání, nejasnosti) + PDF `on_rules_cz.pdf`,
`on_rules_eng.pdf` a přehled karet `on_karty_dvgiochi.webp`.

**Stav: návrh ke schválení (2026-11-06). Nic z toho ještě není v kódu.**
Výchozí stav: `npm test` = 1982 testů (po Údolí stínů F9).

> **Rozhodnutí uživatele (2026-11-06), viz §10:**
> 1. **Žetony se vždy rozmisťují i platí RUČNĚ** – hráč kliká, kam žeton dá a odkud ho
>    bere. Automaticky běží jen to, kde pravidla volbu nedávají (cena Nebezpečné karty se
>    platí z té karty, Rez bere ze všeho). Bot rozhoduje sám a hned.
> 2. **Žeton za zahrání dostává jen MODRÁ karta**, oranžová (Nebezpečná) ne. Nová Nebezpečná
>    karta tedy začíná na 3 žetonech, jak píšou pravidla.
> 3. **Pauza na reakci mimo tah jen tehdy, když reagovat jde** (stejně jako R4 Údolí stínů):
>    Stepní běžec, Al Preacher a Ms. Abigail zastaví hru, jen když hráč má kartu, schopnost
>    a žetony, kterými by mohl zareagovat.
> 4. **Art dodá uživatel** – do té doby se karty kreslí jako štítek (§2.15, §11).

---

## 0. V čem je tohle rozšíření jiné než všechna dosavadní

Ozbrojení a nebezpeční přidává 28 karet do hlavního balíčku a 8 postav – jako Dodge City
nebo Údolí stínů. Jádrem je ale **nový zdroj, který leží na kartách**:

1. **Žetony nabití leží na konkrétních kartách a postavách, ne na hráči.** Valouny Zlaté
   horečky jsou číslo u hráče; žeton nabití patří Nebezpečné kartě (zbraň s třemi žetony umí
   třikrát svůj zvláštní efekt a pak **odchází ze hry**) nebo postavě. Zásoba je **konečná**
   (32 kusů) a sdílená – když v ní nejsou 3 žetony, Nebezpečnou kartu nejde vyložit (§2.5).
2. **Oranžová karta = modrá karta s baterií.** Chová se jako modrá ve všem (Panika, Cat
   Balou, Vulture Sam, Soudce, Laso…), jen nese žetony a za ně dělá svůj efekt (§2.4, §2.9).
3. **Placené volby v okamžiku zahrání.** Vylepšení hnědé karty i zvláštní efekt zbraně se
   volí a platí **při zahrání, před efektem** – a podle rozhodnutí 1 hráč kliká, odkud platí
   (§2.8). Dnes žádná karta „volitelnou příplatkovou část" nemá.
4. **Opakování cizího sejmutí** (Stepní běžec): po KAŽDÉM sejmutí – Barel, Dynamit, Vězení,
   Bomba… – může majitel karty kdykoli, i mimo svůj tah, výsledek zahodit a nechat snímat
   znovu. Potřebuje okno mezi „karta je odkrytá" a „výsledek se použije" (§2.11).
5. **Karta, která koluje a má doutnák** (Bomba): sejmutí na začátku tahu ji buď pošle dál,
   nebo jí ubere žetony; když dojdou – a dojít můžou i cizí rukou (Rez, Frankie Canton) –
   vybuchne tomu, před kým zrovna leží (§4 Bomba).

Velkou část toho, co postavy dělají, už umí infrastruktura **Údolí stínů**: fronta výstřelů
mimo pořadí (Julie Cutter, Mexicali Kid, další cíle Rychlopalby), okno úniku (Ms. Abigail),
brána Obětavého skoku (každá nová ztráta života), kontext výstřelu `vos` s příznakem
`unavoidable` (Dvouhlavňovka). Plán ji používá, nestaví vedle ní druhou.

Pořadí prací (§8) staví nejdřív žetony a jednoduché karty, aby se brzy dalo hrát; okna mimo
tah (Stepní běžec, Al Preacher, Ms. Abigail) a Bomba přijdou až potom.

---

## 1. Co rozšíření obsahuje

| Skupina | Karty | Mechanismus | Fáze (§8) |
|---|---|---|---|
| ze základní hry | 4× BANG!, Cat Balou, Vedle! | žádný – jen do balíčku | A0 |
| Nebezpečné objekty bez cíle | Eso v rukávu, Bečka piva, Zvonice, Bandalír | použití za žetony z karty | A1 |
| hnědé „žetonové" | Nabíjení, Rez | rozmístění / přesun žetonů | A1, A3 |
| vylepšitelné bez cíle | Kolona, Malý doušek | platba při zahrání | A1 |
| Nebezpečné zbraně | Big Fifty, Buntline Special, Dvouhlavňovka, Thunderer | zvláštní efekt při kartě BANG! | A2 |
| obrana | Bedna (oranžová), Skrč se! (vylepšitelná) | efekt Vedle! | A2 |
| bang-efekty | Křesadlovka, Rychlopalba (vylepšitelné) | výstřel bez karty BANG!, trychtýř „zrušen" | A2 |
| útoky na kohokoli | Šíp (vylepšitelný), Paklíč, Bič, Squaw (vylepšitelná) | výběr cíle bez vzdálenosti | A3 |
| koluje | Bomba | sejmutí na začátku tahu, předání, výbuch | A4 |
| opakuje sejmutí | Stepní běžec | okno po sejmutí | A5 |
| postavy | Bloody Mary, Mexicali Kid | trychtýř „zrušen", fronta výstřelů | A2 |
| postavy | Bass Greeves, Frankie Canton, Red Ringo | schopnost = přesun žetonů | A3 |
| postavy | Julie Cutter | sejmutí po ztrátě života + výstřel | A5 |
| postavy | Al Preacher, Ms. Abigail | okna mimo tah | A6 |

---

## 2. Infrastruktura

### 2.1 Data

- **Nový soubor `cards.ozbrojeni.json`**, tvar jako `cards.udoli_stinu.json`:
  `{id, name, type, suit, value, art, exp:"ozbrojeni", border:"orange"|"brown", text, props}`.
  **id 200–227** (jeden záznam = jedna fyzická karta, 4× BANG! má čtyři id). Rozsah 200–299 je
  celý volný; 800–899 by kolidovalo s ručně stavěnými kartami v testech.
- **`props`** nese nové údaje (konstruktor `Card` v [logic/entities.js](../logic/entities.js)
  kopíruje jen vyjmenované klíče – přidat je tam, do `initializeStandardDeck`,
  `distinctCardKinds` i `debugGiveCard`):
  - `dangerous: { cost }` – Nebezpečná karta; `cost` = kolik žetonů stojí její použití
    (u zbraní cena zvláštního efektu). Bomba má `dangerous: { cost: null }`.
  - `upgrade: { cost }` – vylepšitelná hnědá karta; `cost` = cena jednoho vylepšení.
  - `effect` – identita efektu, prefix **`AD_`** (`AD_BIG_FIFTY`, `AD_THUNDERER`, …), stejně
    jako `ZH_`/`VOS_`. Zbraně mají `type: "WEAPON"` + `range`, ostatní vlastní `CardType`.
- **`CardType`**: nové klíče pro 18 nezbraňových druhů (`AD_ESO: 'Eso v rukávu'`, …,
  `AD_SQUAW: 'Squaw'`). Identita je český řetězec, unikátnost hlídá existující test
  (`test/vos.setup.test.js`).
- **Postavy** do `characters.json` jako **id 55–62** abecedně: 55 Al Preacher, 56 Bass Greeves,
  57 Bloody Mary, 58 Frankie Canton, 59 Julie Cutter, 60 Mexicali Kid, 61 Ms. Abigail,
  62 Red Ringo. Seznamy `ARMED_CHARACTERS` / `AD_READY` v logic/entities.js (+ shim
  v logic.js). Životy: všichni 4 (default), **Red Ringo 5** → `HIGH_HEALTH_CHARS`
  v [core/roles.js](../core/roles.js).
- **`AD_CARDS_READY`** (seznam jmen v core/armed.js, vzor `VOS_CARDS_READY`): do balíčku jdou
  jen karty, které už mají efekt. Roste po fázích, na konci je celý.
- Server načte data v `server.js`, předá je `gs.adCardData` v `server/lifecycle.js`;
  zapojit i `server/rooms.js` (debug katalog), `server/handlers.debug.js`,
  `test/_botHarness.js` a klientský preload v `game.js` (`cards_ozbrojeni_data`).
  Slévání do balíčku: `_deckDataFor(options)` v [logic/setup.js](../logic/setup.js).

### 2.2 Zapnutí

- **`options.expansions.ozbrojeni`** + řádek v `MENU_EXPANSIONS`
  ([core/menuModel.js](../core/menuModel.js)): `{ key: 'ozbrojeni', label: 'Ozbrojení
  a nebezpeční', hint: '28 karet a 8 postav; žetony nabití a Nebezpečné karty' }`.
  Test `test/menuModel.test.js` má výčet klíčů natvrdo – doplnit.
- **`EXPANSION_LOADERS.ozbrojeni`** v game.js **musí existovat od fáze A0** – server čeká na
  `expansion_ready` za každý zapnutý klíč a bez loaderu by start hry visel do `ASSET_WAIT_MS`.
- Postavy do výběru pouští `_characterPool` jen se zapnutým rozšířením.

### 2.3 Mixin, zrcadlo, jména

| Soubor | Co |
|---|---|
| `logic/armed.js` | mixin `ArmedMixin` – žetony, Nebezpečné karty, vylepšení, Bomba, okna, postavy |
| `core/armed.js` | zrcadlo nad prostým stavem: `adOn`, `adSupply`, `adLoadsOf`, `adSources`, `adPayOk`, `adPlaceTargets`, `adUseOk`, `adUpgradeMax`, `adWeaponSpecialOk`, `abigailIgnores`, `AD_KINDS`, `AD_CARDS_READY` … |
| `core/armedAnim.js` | časování cinematik (`AD_ANIM`, `adAnimMs`) pro klienta, frontu animací i držení botů |

Prefix v kódu **`ad`/`AD_`** (Armed & Dangerous) – je úplně volný. **Nepoužívat**:
`token*` (= identita pro rejoin a admin token), `load*` (klientské `loadAsset`,
`loadExpansionAssets` …), `preacher*` (Kazatel z High Noonu → Al Preacher je `_adAl*`).
Žetony v kódu: **`adLoads`** – na postavě `p.adLoads`, na kartě ve hře `card.adLoads`.

### 2.4 Co je oranžová karta — predikáty (R2)

Pravidla: oranžové karty „se chovají ve všech ohledech stejně jako modré". Rozhodnutí 2
ale říká, že **věta, která jmenuje modrý OKRAJ, oranžovou nezahrnuje** (Al Preacher píše
„modrou nebo oranžovou" výslovně). Proto dva pojmy:

| Predikát (core/cardRules.js) | Pravda pro | Ptá se |
|---|---|---|
| `isDangerousCard(card)` | `card.dangerous` | všechno nové v rozšíření |
| `isBlueCard(card)` | **beze změny** – jen modré | dobití za zahrání (R-U2), José Delgado |
| `isBrownCard(card)` (nový) | ne modrá, ne zelená, ne oranžová | Ms. Abigail, paměť Lee Van Kliffa (`_markBrownPlayed`), Zuřivá Doroty |
| „leží na stole" | modrá + oranžová + zelená | Panika/Cat Balou/Bič/Squaw, Vulture Sam, Pat Brennan, Laso, Belle Star, Soudce (`JUDGE_BLOCKED_TYPES`), `boardCardValue` bota |

Dnes se „hnědá = všechno kromě modré a zelené" počítá ručně na několika místech (LVK,
Doroty, okno úniku). Plán je převede na `isBrownCard`, jinak by se oranžová karta tvářila
jako hnědá a Lee Van Kliff by ji „opakoval".

### 2.5 Žetony: zásoba a jediné cesty (R3, R4)

- **Zásoba se neukládá, počítá se:** `adSupply(state) = 32 − Σ p.adLoads (hráči ve hře)
  − Σ card.adLoads (karty ve hře: board + weapon)`. Díky tomu se žetony karty, která opustí
  hru (Panika, Cat Balou, Vulture Sam, Pat Brennan, nová zbraň, vyřazení…), **vrátí do zásoby
  samy** – nikdo je nemusí ručně uklízet a nemůže se stát, že se ztratí.
- Na kartě, která odešla, může zůstat staré číslo `adLoads`; nevadí to (nepočítá se), ale
  **každé vyložení ho přepíše na 3**. Bomba je výjimka jen v tom, že se předává z ruky do
  ruky po stolech – žetony s ní jdou, protože jde tentýž objekt.
- **Jediné tři cesty, jak se žetony mění** (vzor `Deck` – nikde jinde se `.adLoads` nepíše,
  hlídá to strukturální test procházející zdrojáky):
  - `_adAdd(dst, n)` – ze zásoby na kartu/postavu; strop 4, a jen kolik je v zásobě.
    Vrací, kolik se skutečně přidalo.
  - `_adTake(src, n)` – z karty/postavy do zásoby. Když karta klesne na 0 → `_adDeplete`.
  - `_adMove(src, dst, n)` – přesun (Frankie, Red Ringo, Rez). Co se nevejde nad strop, jde
    do zásoby.
- **Adresa žetonu** = `{ seat, cardId }` (`cardId: null` = postava). Karta se adresuje
  **id, ne indexem** – indexy na stole se při odhozu posouvají. `seat` je sedadlo → patří do
  tabulky `SEAT_KEYS`/`SEAT_LIST_KEYS` (Lady Růže, test `wws.seats.test.js`).
- **`_adDeplete(card)`**: karta s nulou žetonů se hned odhodí (zbraň → zpátky Colt .45);
  Bomba místo odhozu **vybuchne** (§4 Bomba). Odhoz jde přes `deck.discard`, animace
  `ad_deplete`.
- Invariant „žetony ve hře + zásoba = 32" a „nikde víc než 4" kontrolují zátěžové hry po
  každé akci.

### 2.6 Kdy žetony opouštějí hru (R14)

Díky odvozené zásobě stačí na kartách nic nedělat. Na **postavě** se nulují výslovně:
`handlePlayerDeath` (vyřazení – i duch Údolí stínů, kdyby kartu Duch ztratil),
`_teardownGhost` (Město duchů), `_shadowStrip` (Stínoví pistolníci), návrat Mrtvého muže
a Hřbitova začíná s nulou. Hráč s kartou **Duch** (Údolí stínů) je ve hře a žetony drží
normálně. **Red Ringo** dostane své 4 žetony jen při rozdání postav (`selectCharacter`
/ `autoSelectAllCharacters` / navazující hra) – ne Vera Custer, ne Nová identita.

### 2.7 Rozmístění žetonů — fáze `AD_PLACE` (R-U1)

Jedna fáze pro všech pět situací, kdy hráč žetony **dává**:

| Spouštěč | Počet | Odkud | Kam | Smí nechat ležet |
|---|---|---|---|---|
| zahrál modrou kartu (i na jiného hráče, i Duch) | 1 | zásoba | své Nebezpečné karty, postava | ano |
| odhodil N karet v 3. fázi (nad limit) | N | zásoba | totéž | ano |
| Nabíjení | 3 | zásoba | totéž, libovolná kombinace | ano |
| Bass Greeves | 2 | zásoba | **jedno** místo (obě na tutéž kartu) | ne (aspoň 1 klik) |
| Red Ringo | až 2 | **jeho postava** | jen jeho Nebezpečné karty | ano |

- Stav: `pendingAdPlace = { playerIdx, left, from: 'SUPPLY'|'CHAR', oneTarget, reason }`,
  fáze `AD_PLACE`. Akce **`ad_place { seat, cardId }`** položí 1 žeton (u `oneTarget` rovnou
  všechny), **`ad_place_done`** zbytek nechá v zásobě. Fáze končí, když `left = 0`, nebo
  když už není kam dávat (všechno na 4, prázdná zásoba).
- **Do fáze se vůbec nevstupuje**, když není kam žeton dát (žádná vlastní Nebezpečná karta
  pod 4 a postava na 4, nebo prázdná zásoba). Jinak se podle rozhodnutí 1 ptá i tehdy, když
  je místo jediné.
- **Bomba ležící přede mnou je platný cíl** (R5) – žeton jí oddálí výbuch.
- **Kdy se fáze zakládá:** dobití za modrou kartu jde **frontou odložených akcí**
  (`{ type: 'AD_PLACE', … }` do `specialActionQueue`) ve chvíli zahrání – tedy i když se pak
  cíl Vězení brání Útěkem (Údolí stínů); fronta se odbaví, až efekt karty doběhne (pravidlo
  „nejdřív doběhne efekt zahrané karty"). Háky: tři vstupy, kde dnes sedí
  `_johnnyKischPurge` (`playCard` větev zbraně, `playBoardCard`, `_placeOnTarget`) –
  u `_placeOnTarget` ale **před** oknem úniku, ne v `_placeSettle`. Předaný Dynamit
  (`checks.js`) sem nevede – „ne ve chvíli, kdy modrou kartu od někoho dostanete".
- **3. fáze:** `discardCard` (logic.js) si odhozené karty počítá (`p._adDiscarded`); když ruka
  klesne na limit, místo `nextTurn()` založí `AD_PLACE` s `reason: 'DISCARD'` a `nextTurn()`
  zavolá až její konec. Gary Looter na tom nic nemění (karta byla odhozena).
- **Zobrazení:** nad mou zónou lišta „Rozmísti 2 ⛁ (Nabíjení)"; platné cíle (moje oranžové karty pod 4, portrét postavy) se zvýrazní
  stejně jako dnešní klikací cíle; klik = kostička přiletí ze zásoby (animace `ad_load`). Tlačítko **HOTOVO** (resp.
  „NECHAT V ZÁSOBĚ"). Na kompaktním profilu jsou cílem i štítky „⛁3" u karet.

### 2.8 Platba — platební lišta (R-U1)

Žetony z **libovolných vlastních zdrojů** (postava + vlastní Nebezpečné karty, ne Bomba –
R5) se platí za tři věci: **vylepšení hnědé karty**, **Mexicali Kid** a **Al Preacher**.
Cena Nebezpečné karty a zvláštního efektu zbraně se platí **z té karty**, tam volba není.

- **Platba je součást akce, ne fáze.** Klient hráče nechá naklikat zdroje a pošle je
  s akcí: `pay: [{ seat, cardId }, …]` (jedna položka = jeden žeton, `cardId: null` =
  postava). Server ji ověří jedním predikátem `adPayOk(state, seat, pay, cena)` (vlastní
  zdroje, ne Bomba, dost žetonů, přesně cena) a provede ji **před efektem**. Žádný
  rozpracovaný mezistav na serveru – odmítnutá akce nic nezaplatí.
- **Lišta:** jakmile volba něco stojí, objeví se „Zaplať 3 ⛁ · 0/3"; moje zdroje se
  žetony se zvýrazní jako klikací, klik na zdroj odebere jeden žeton (na zdroji ubyde jen vizuálně, nic nelétá – odletí až po potvrzení). Zdroj, který by platbou klesl na 0, dostane štítek
  „karta odejde". Po zaplnění **POTVRDIT** / **ZPĚT** (vrátí kostičky). Stav jen
  v klientu (`App.adPay`), kořen se při překreslení obnovuje (vzor `App.bugDraft`).
- **Vyčerpání platbou:** když platba vyprázdní kartu, karta odejde PŘED efektem. U zbraně
  to mění dostřel – proto se **cíle posuzují ve chvíli zahrání**, před platbou (R18).

### 2.9 Vyložení a použití Nebezpečné karty

- **Vyložení:** stejné cesty jako modrá karta (zbraň → větev zbraně v `playCard`,
  objekty → `playBoardCard`, Bomba → `playSpecialCard`/`_placeOnTarget` na libovolného
  hráče). Navíc: **zásoba musí mít aspoň 3 žetony** (jinak karta není hratelná – důvod
  „Došly žetony v zásobě" v `cardPlayability`), na kartu se dají 3 (`_adAdd`), dobití za
  modrou **neplatí** (R-U2), Al Preacher **ano** (oranžová výslovně).
- **Použití:** klik na vlastní oranžovou kartu ve fázi PLAY (vzor zelené karty Dodge City
  a placeného vybavení Zlaté horečky) → akce **`ad_use { cardId, … }`**. Zaplatí se `cost`
  z té karty (`_adTake`), pak efekt. Klikací je jen to, co projde `adUseOk` (core/armed.js –
  ptá se ho klient, server i bot): dost žetonů, správná fáze, karta „žije" (ne Laso, ne
  Belle Star během jejího tahu u cizí karty), efekt má smysl (Bečka piva ne na plném
  životě).
- **Výjimky z „jen ve svém tahu":** Bedna (v obraně, §4) a Stepní běžec (okno, §2.11).

### 2.10 Kontext výstřelu a trychtýř „výstřel zrušen"

Údolí stínů už vozí kontext výstřelu `vos` přes celé vyhodnocení (`_beginBangResolution`
→ `pendingBarrelCheck`/`pendingResponse` → `currentCheck` → `waitForMissed`). Plán do něj
přidá klíče, ne nový parametr:

| klíč | nastaví | čte |
|---|---|---|
| `unavoidable` (existuje) | Dvouhlavňovka (♦ přes `_effSuit`) | beze změny – Barel, Vedle!, Jourdonnais, Bedna se nenabídnou |
| `adBuntline` | Buntline Special | `_adShotCanceled` → cíl odhodí kartu |
| `adReturn: cardId` | vylepšená Křesadlovka | `_adShotCanceled` → karta zpátky do ruky |
| `adMary` | karta BANG! Bloody Mary | `_adShotCanceled` → líznutí |

Kontext se dnes zakládá jen se zapnutým Údolím (`vos = (this._vosOn() && …) ? {…} : null`
v `playBang`); podmínka se rozšíří na „Údolí NEBO Ozbrojení".

**Trychtýř `_adShotCanceled(pr)`** – dnes žádné jedno místo „výstřel byl zrušen" není.
Volá se ze všech míst, kde zrušení nastane: Barel/Jourdonnais ♥ (`_applyCheckResult`),
dokončená obrana Vedle! (`handleResponse`, tam, kde se volá `_vosBackfireCheck`), Útěk proti
bang-efektu, Bedna, Skrč se!. **Nevolá se** u Apache Kida (výstřel se vůbec neodehrál)
a u Ms. Abigail (ignoruje celý efekt) – R17. Každé místo má vlastní test.

**Big Fifty (R9)** nejde přes kontext, protože by ho musela číst každá schopnost a každá
karta cíle. Místo toho dostane cíl na dobu výstřelu příznak **`target._adMuted`**:
- `abilitiesOf`/`hasAbility` (core/distance.js) vrací prázdno stejně jako u Kocoviny
  (`_noAbility`) – jediný trychtýř všech ~85 dotazů „umí X?", takže Jourdonnais, Calamity
  Janet, Elena Fuente, Apache Kid, Bart Cassidy, El Gringo, Julie Cutter… zhasnou naráz.
- karty na stole: `_belleIgnoresBoard(attackerIdx)` se rozšíří na
  `_boardIgnoredFor(attackerIdx, targetIdx)` (Barel, zelené Vedle!, Bedna, Odměna);
  `_gearOn` vrací false (vybavení Zlaté horečky, jako Laso – rozhodnutí R10 ZH).
- **Karta Duch se neruší** (`hasDuchCard` na `_adMuted` nehledí).
- Příznak shazuje `_adShotEnd()` na konci obrany (konec `handleResponse`, úspěšný Barel,
  Apache) a pojistkou `nextTurn` a `_vosQuiet`. Zátěžový test hlídá, že ve fázi PLAY bez
  rozpracovaného výstřelu ho nikdo nemá.
- Dostřel: Big Fifty má 6, takže Mustang/Paul Regret rozhodují jen výjimečně; klient i bot
  při zapnutém efektu počítají `computeCanHit(…, { ignoreTargetMods: true })`.

### 2.11 Okno opakování sejmutí — Stepní běžec (R7)

- **Kde:** `_applyCheckResult` má přesně dva volající – `resolveCheck` a `luckyDukePick`.
  Na začátek obou přijde brána `_adRedrawGate()`: když je ve hře Stepní běžec s aspoň 1
  žetonem a jeho majitel smí reagovat (ve hře, karta „žije" – Laso, Belle Star), hra přejde
  do fáze **`AD_REDRAW_OFFER`** (`pendingAdRedraw = { holderIdx, ownerIdx, cards }`)
  a výsledek se zatím nepoužije. Jinak beze změny.
- Majitel: **ZOPAKOVAT (1 ⛁)** → `_adTake(stepní běžec, 1)`, nové sejmutí týmž postupem
  (`currentCheck` nese celý kontext: důvod, hráče, kartu na stole, kontext výstřelu) –
  `_checkRevealCount` platí znovu, takže **Lucky Duke otočí dvě nové karty a vybírá znovu**
  (výslovně v pravidlech), John Pain si vezme i novou kartu. Pak brána znovu (dokud jsou
  žetony). **NECHAT** → `_applyCheckResult` jako dřív.
- Karta Stepní běžec je v balíčku jen jedna, takže majitel je nejvýš jeden; kód přesto
  bere „první v pořadí od snímajícího", kdyby přibyla.
- **Co je sejmutí:** všechno, co jde cestou CHECK_DRAW → CHECKING (Dynamit, Vězení,
  Chřestýš, Bomba, Vendeta, Teren Kill, Don Bell, Colorado Bill, Julie Cutter) a Barel
  přes `startBarrelCheck`. **Rum a Helena Zontero ne** – mají vlastní odkrývání a nejsou to
  sejmutí s jedním výsledkem.
- Pauza je nutná jen kvůli rozhodnutí 3; když majitel reagovat nemůže, nic se nemění.
- Mezi starou a novou kartou se může domíchat balíček – animace musí umět „karty před →
  míchání → zbytek" (vzor `_revealAnim`).

### 2.12 Okno Al Preachera

- Když **jiný** hráč zahraje modrou nebo oranžovou kartu (vyložení, Vězení/Bomba na
  kohokoli, Duch), jde do fronty `{ type: 'AD_AL_OFFER', playerIdx: al }` – stejný háček
  jako dobití za modrou (§2.7), jen s oranžovou navíc. Okno se otevře, až efekt karty
  doběhne, a určitě dřív, než se zahraje další karta (fronta se odbavuje před návratem do
  PLAY) – přesně podmínka z pravidel.
- Jen když Al **může zaplatit 2** ze svých zdrojů (postava + jeho Nebezpečné karty; mimo
  tah výslovně smí) a je ve hře s platnou schopností. Fáze **`AD_AL_OFFER`**: platební lišta
  (2 ⛁) + **LÍZNOUT** / **NE**. Za jednu kartu nejvýš jedno líznutí. Líznutí jde běžnou
  cestou (fronta `KILL_REWARD`-like, štítek „Al Preacher").

### 2.13 Ms. Abigail v okně úniku a v obraně (R10)

- „Hnědá karta s hodnotou J, Q, K nebo A, jejímž je jediným cílem" – predikát
  `abigailIgnores(state, i, card, ctx)` v core/armed.js: `isBrownCard`, hodnota (tištěná –
  Požehnání/Prokletí mění jen barvu), jediný cíl, kartu nehrála ona sama, schopnost platí
  (Kocovina, Big Fifty ji vypnou).
- **Karty bez výstřelu** (Panika, Cat Balou, Duel, Kankán, Krytý vůz…): okno úniku Údolí
  stínů (`_vosEvadeGate` → fáze `EVADE_OFFER`). Dnes nese jen jméno karty a je za `vosOn` –
  rozšíří se o `card` (hodnota, okraj) a o druhou větev „Ms. Abigail" hlídanou `adOn`.
  Tlačítko **IGNOROVAT** vedle Útěku.
- **Karty BANG! a bang-efekty J–A** (i Calamity Janet s Vedle! J–A, Tomahawk, Křesadlovka,
  Springfield): v obraně (RESPOND) tlačítko **IGNOROVAT** – stejné místo, kde Údolí nabízí
  Útěk proti bang-efektu (`escapeRespondOk`). Výstřel skončí bez zásahu i bez zrušení
  (Buntline, Bloody Mary ani Opětovná palba se nespustí). Dvojitá rána k BANG! J–A se
  ignoruje spolu s ním. Výstřely bez karty (Mexicali Kid, Julie Cutter, Henry Block) hodnotu
  nemají.
- Volba se **vždy nabízí**, nic se neděje samo: spojenec jí může Panikou brát Vězení.
- Lee Van Kliff: opakovaný efekt nese hodnotu PŮVODNÍ karty (jako barvu u Apache Kida,
  Q12). Láhev/Komplic (Zlatá horečka) hodnotu nemají → neplatí. Hromadné karty (Kulomet,
  Indiáni, Poker, Tornádo, Divoká banda, Rvačka) ne – „Nefunguje proti kartám, které
  postihují všechny hráče".

### 2.14 Redakce stavu

Nic nového tajného: žetony na kartách i postavách, zásoba, Bomba i otočené karty Stepního
běžce jsou veřejné. `pendingAdDiscard` (Buntline) jen říká, KDO odhazuje. Paklíč bere
z ruky náhodně – animace nese `stolenIndex` (konvence krádeží). Kontrola redakce
(`redactState`) se přesto projde při každém novém poli `pending*`.

### 2.15 Klient — vykreslení a ovládání

- **Kostička žetonu**: dřevěná izometrická kostka (tři kosočtverce ve třech odstínech
  hnědé) kreslená do RenderTextury `ad_cube` v `create()`; až uživatel dodá
  `nabiti.webp`, přemaluje se artem (vzor `buildGearTextures`).
- **Žetony na kartě ve hře**: v pásu vyložených karet až 4 kostičky v mřížce 2×2 přes
  pravý dolní roh karty (desktop), na kompaktním profilu (mobil) štítek „⛁3". Kreslí se
  podle `card.id`, takže pás vyložených karet ani `positions.js` nemění počet slotů.
- **Žetony na postavě**: vedle portrétu jako valouny (`drawNuggets` → nový `drawAdLoads`,
  všech šest míst volání: tři větve soupeřů, kompaktní sloupec, moje zóna, divák). Když
  hraje i Zlatá horečka, stojí vedle sebe „💰3 ⛁2".
- **Zásoba**: malá pyramida kostiček s počtem „×24" u balíčků; geometrie
  `adSupplySlot(L, …)` v [core/layout.js](../core/layout.js) s invarianty
  v `test/positions.test.js` (nepřekrývá balíčky, události, obchod Zlaté horečky, řadu
  Pokeru; vejde se na jeviště 16:9 i mobilní profil).
- **Oranžový rám štítku**: `CARD_LABEL_BORDER` (game.js) zná jen hnědou/modrou/zelenou –
  přidat `orange`.
- **Ovládání** (všechno přes existující sloty tlačítek, `abilExtraSlot`):
  - vybraná karta BANG! se zbraní, jejíž efekt jde zaplatit → přepínač **„+ THUNDERER (1⛁)"**
    (vzor `ZAHRÁT JAKO BANG!`), u Dvouhlavňovky jen pro kárový BANG!;
  - vybraná vylepšitelná karta → **„VYLEPŠIT +1 (2⛁)"**, každý klik přidá jedno vylepšení
    (do toho, co jde zaplatit); u Šípu a Rychlopalby se vylepšení přidává **klikem na další
    cíl** (každý další různý cíl = +1 vylepšení), tlačítko **VYSTŘELIT** odešle;
  - pak platební lišta (§2.8);
  - klik na vlastní oranžovou kartu = použití; cíle (Paklíč, Bič) se vybírají klikem.
- **Okna** (`view/screens.js`, vlastní hloubka nad deskou – konvence `DOROTHY_DEPTH`):
  Stepní běžec (otočená karta + výsledek + ZOPAKOVAT/NECHAT), Al Preacher, předání Bomby
  (klik na hráče), Buntline (výběr karty z ruky – v mé zóně, ne okno).
- `App.blockInput = true` po každém odeslání; zvýraznění cílů i z `!App.blockInput`.
- Po každé změně renderu požádat uživatele o ověření v prohlížeči (canvas nevidím).

### 2.16 Animace — `core/armedAnim.js`

**Žádné efekty navíc.** Animace jsou na úrovni dnešní hry: karty a žetony se jen
**posouvají, otáčejí a překlápějí** – žádné částice, záblesky, razítka, tinty ani kreslené
sprity (zvon, šíp, chomáč, doutnák). Co jde existující animací, jde jí; nové jsou jen lety
kostičky žetonu, protože ta je ve hře nová.

Časování na jednom místě (vzor `core/vosAnim.js`), klient je přehrává
(`net/handlers.js`), fronta animací podle nich drží stav (`ANIM_MS`/`_animDurationMs`),
server o stejnou dobu drží boty (`room._adBlockUntil`).

**Nové (jen žetony):**

| Animace | Co je vidět | ~ms |
|---|---|---|
| `ad_load` | kostička přeletí ze zásoby na kartu/portrét; víc kusů za sebou s odstupem | 320 + 90/ks |
| `ad_pay` | kostička přeletí z karty/portrétu do zásoby | 260 |
| `ad_move` | kostička přeletí ze zdroje na cíl (Frankie Canton, Red Ringo, Rez – u Rezu všechny kusy naráz; co se nad 4 nevejde, letí dál do zásoby) | 420 |

**Existující animace (beze změny, jen nový spouštěč):**

| Situace | Animace |
|---|---|
| vyložení Nebezpečné karty, Bomba na hráče | stejný let jako modrá karta / Vězení; 3 kostičky pak `ad_load` |
| vyčerpaná karta (0 žetonů) | `board_to_discard` (`exactAngle`) |
| Thunderer | karta BANG! letí do odhozu jako vždy, pak z odhozu zpátky do ruky (obyčejný let) |
| Šíp, Rychlopalba, Křesadlovka | let zahrané karty jako u Indiánů / Bang! |
| Paklíč | `panic_sequence` se `stolenIndex` |
| Bič, Squaw | `catbalou_sequence` / `board_to_discard`; Squaw s vylepšením = krádež ze stolu |
| Stepní běžec | otočená karta letí do odhozu, nové sejmutí jde existující animací sejmutí (umí míchání uprostřed, vzor `_revealAnim`) |
| předání Bomby | posun karty k dalšímu hráči jako předání Dynamitu (i se žetony) |
| výbuch Bomby | stávající cinematika výbuchu Dynamitu, pak 2 klikané zásahy |
| Ms. Abigail ignoruje | karta jde do odhozu běžným letem |
| líznutí (Kolona, Eso v rukávu, Al Preacher, Bloody Mary) | jednotné líznutí, žádná vlastní animace |

**Stav bez animace:** Big Fifty (vypnutá schopnost cíle), Dvouhlavňovka (nelze zrušit)
a Zvonice (vzdálenost 1) se jen vypíšou do štítku čekání / logu – nic se nepřebarvuje.

Letící karty i kostičky startují ve velikosti zdroje a dosedají ve velikosti cíle
(`startScale`/`endScale`).

### 2.17 Server — akce, guard, ledger, log

- **Nové akce:** `ad_place`, `ad_place_done`, `ad_use`, `ad_redraw`, `ad_al`,
  `ad_bomb_pass`, `ad_discard` (Buntline), `ad_ability` (Bass, Frankie, Red Ringo, Mexicali).
  **Rozšířené payloady:** `play_bang` (`adWeapon`), `play_card`/`play_special` (`up`, `pay`,
  `targets`), obrana (`pay` pro Skrč se!, `adCrate`, `adIgnore`).
- **Guard** (`server/guard.js`): všechny nové akce do `TURN_ACTIONS`/`SELF_ACTIONS` podle
  toho, kdo je aktér; nové fáze dostanou větev v `pendingActor` (core/pending.js) a štítek
  v `waitingStatus`. Test `test/server.handlers.test.js` má počet eventů natvrdo (108) –
  upravit.
- **Ledger chování** (`server/ledger.js`): Bomba zahraná/předaná na X = nepřátelské; Paklíč,
  Šíp, Rychlopalba, výstřely Mexicali Kida a Julie Cutter = nepřátelské; Bič/Squaw jako Cat
  Balou (sundat X Vězení/Dynamit/Bombu = přátelské); Frankie bere z karty X = mírně
  nepřátelské; Stepní běžec – zopakování X-ova sejmutí, které dopadlo pro X dobře =
  nepřátelské, špatně = přátelské.
- **Log:** `glog.rule` pro každý pohyb žetonů (kdo, odkud, kam, kolik, zásoba).

### 2.18 Spolupráce s ostatními rozšířeními

| Rozšíření / karta | Chování |
|---|---|
| **Laso** (Fistful) | Nebezpečné karty nemají efekt (nejde použít, Bomba se nesnímá – jako Dynamit); žetony z nich jdou dál platit vylepšení (jsou to žetony, ne efekt karty) |
| **Belle Star** | v jejím tahu cizí oranžové karty nefungují (Bedna, Stepní běžec) |
| **Soudce** (Fistful) | oranžové karty nejdou vyložit (`JUDGE_BLOCKED_TYPES`) |
| **Kocovina** (HN) | schopnosti postav nefungují; žetony na postavě jdou platit vylepšení dál |
| **Požehnání/Prokletí** (HN) | Dvouhlavňovka, Bomba, Julie Cutter čtou barvu přes `_effSuit` |
| **Zúčtování** (WWS) | zvláštní efekt zbraně jen u „karty BANG!" podle `isBangCardPlay` (R12) |
| **Zuřivá Doroty** (WWS) | poručená karta jde **bez vylepšení a bez efektu zbraně**; oranžovou kartu poručený vyloží se 3 žetony; tabulka `AD_KINDS` (vzor `VOS_KINDS`) říká, co jde poručit (R13) |
| **Lee Van Kliff** (WWS) | opakuje jen základní efekt hnědé karty, bez vylepšení; oranžová není hnědá (R13) |
| **Lady Růže** (WWS) | nová pole se sedadlem do `SEAT_KEYS`; žetony jdou s hráčem |
| **Sacagaway** (WWS) | nic nového |
| **Vera Custer, Greygory Deck** | Vera smí kopírovat nové postavy (Red Ringo bez startovních žetonů); Greygory losuje jen ze základních 16 – beze změny |
| **Zlatá horečka** | vybavení není „karta ve hře" pro Bič/Squaw (jako Cat Balou), Big Fifty ho ale vypne (R9); Bečka piva a Malý doušek nejsou karta Pivo (R11); zranění od Bomby nikdo nezpůsobil → valoun nikomu |
| **Údolí stínů** | Henry Block střílí na Paklíč, Bič, Squaw (berou/odhazují jeho karty), ne na Frankieho ani Rez (žetony nejsou karty – R22); Útěk a Mick Defender se brání Bombě, Šípu, Paklíči, Biči (jediný cíl); každá nová ztráta života (Šíp, Bomba) jde branou `_vosSaveGate`; Dvojitá rána + efekt zbraně jde (je to karta BANG!); kartu Duch Big Fifty neruší |
| **Město duchů, Stínoví pistolníci, Mrtvý muž, Hřbitov** | žetony postavy při odchodu do zásoby, návrat s nulou (R14) |
| **Hra pro 3 / 8 hráčů** | nic zvláštního; v osmi se zásoba může vyčerpat – karta je pak nehratelná s důvodem |

---

## 3. Přehled háků

| Kde | Co přibude |
|---|---|
| `logic/entities.js` | `CardType` AD_*, kopírování `dangerous`/`upgrade` v `Card`, `ARMED_CHARACTERS`/`AD_READY` |
| `core/cardRules.js` | `isDangerousCard`, `isBrownCard`; `getActionForCard` pro nové typy |
| `logic/setup.js` | `_deckDataFor` (+ `AD_CARDS_READY`), `_characterPool`, Red Ringo 4 žetony |
| `logic/play.js` | `playCard` (zbraň, oranžová karta, dobití do fronty, Al), `playBang` (`adWeapon`, Thunderer, Dvouhlavňovka, Big Fifty, Bandalír v limitu), `playBoardCard`, `playSpecialCard` (Bomba, Šíp, Paklíč…), `_beginBangResolution` (kontext) |
| `logic/response.js` | `handleResponse` – Bedna, Skrč se!, IGNOROVAT, `_adShotCanceled`, `_adShotEnd` |
| `logic/checks.js` | `handleStartOfTurnChecks`/`triggerCheckDraw` (Bomba po Chřestýši), `_applyCheckResult` (BOMB, JULIE, Barel → `_adShotCanceled`), `resolveCheck` (brána Stepního běžce) |
| `logic/characters.js` | `luckyDukePick` (brána), `_processSpecialQueue` (AD_PLACE, AD_AL_OFFER, AD_DISCARD, AD_JULIE_CHECK) |
| `logic/combat.js` | `handleDamage` (Julie Cutter – jedno sejmutí za událost), `handlePlayerDeath` (žetony postavy) |
| `logic.js` | `discardCard` (žetony za odhoz → `AD_PLACE`), `_trackCard` (Zvonice), `nextTurn` (pojistky), shimy |
| `logic/highNoon.js` | `_bangLimit` beze změny; Bandalír jako `_adBandolierExtra` vedle `_jackyExtraBangs` |
| `logic/valley.js` | `_vosEvadeGate`/`vosEvade` – větev Ms. Abigail; `_vosQueueShot` pro Julie, Mexicali, Rychlopalbu |
| `logic/wildWest.js` | `_markBrownPlayed` → `isBrownCard`; `SEAT_KEYS` |
| `core/distance.js` | `abilitiesOf` (`_adMuted`), `computeDistance` (Zvonice), `computeCanHit` (`ignoreTargetMods`) |
| `core/playability.js` | `playsAsMissed` (+ Skrč se!), `bangLimitFree` (+ Bandalír), hratelnost oranžových karet (zásoba) |
| `core/valley.js` | `evadeOptions`/`vosEvadable` – Ms. Abigail přes `adOn` |
| `core/pending.js` | nové fáze: AD_PLACE, AD_REDRAW_OFFER, AD_AL_OFFER, AD_BOMB_PASS, AD_DISCARD |
| `core/botPolicy.js` | větve nových fází, `CHAR_RANK`, `keepScore`, `boardCardValue`, politika žetonů (§6) |
| `server/*` | handlery, guard, ledger, log, `room._adBlockUntil` |
| `view/board.js`, `view/screens.js`, `net/handlers.js`, `game.js` | kostičky, zásoba, lišty, okna, animace, loader |

---

## 4. Karty po jedné

### Ze základní hry: 4× BANG!, Cat Balou, Vedle! (A0)
Jen data (vlastní `art`, jinak shodné s kartami základní hry). Bez artu se kreslí artem
základní hry, ne štítkem.

### Eso v rukávu (A1) — oranžová, A♥, cena 2
Použití: zaplať 2 z karty → lízni 1 kartu (běžná fáze lízání mimo začátek tahu, vzor
Rýžovací mísy). Se 3 žetony jednou, s dobitím na 4 dvakrát. Test: líznutí, vyčerpání (3 → 1
→ nepoužitelná; 4 → 2 → 0 → odhoz).

### Bečka piva (A1) — oranžová, 4♥, cena 3
Použití ve svém tahu: +1 život. **Není to karta Pivo** (R11): funguje i ve dvou hráčích,
nebudí Madam Yto ani Limonádového Jima, Tequila Joe nedostane +1 navíc, a **nejde mimo tah**
(záchrana posledního života ji nenabízí). Na plném životě není klikací (`canHeal`).

### Zvonice (A1) — oranžová, 7♣, cena 1
Použití → `p._adBell = turnId`: „všechny vidíš ve vzdálenosti 1" pro **příští zahranou
kartu** (jakoukoli – i kartu bez vzdálenosti, R20). `computeDistance` vrací 1 pro útočníka
s živým příznakem (proti Mustangu, Úkrytu, Paulu Regretovi). Příznak shazuje `_trackCard`
(další zahraná karta), konec tahu a vyčerpání nic neruší. Lze použít víckrát za tah.
Test: Mustang + Zvonice, příznak po Panice zmizí, nepřežije tah.

### Bandalír (A1) — oranžová, 2♥, cena 1
„Jednou ve svém tahu smíš zahrát jednu kartu BANG! navíc." Žádné tlačítko: když hráč zahraje
kartu BANG! **nad limit** a Bandalír má žeton a v tomhle tahu se nepoužil, zaplatí se 1
z Bandalíru a výstřel projde (R21). Zrcadlo `adBandolierExtra(state, p)` (vzor
`jackyExtraBangs`) čte `bangLimitFree` – klient i bot vědí, že BANG! jde. Pořadí: běžný
limit → Jacky Murieta → Bandalír. Volcanic/Willy the Kid ho nepotřebují. Navíc zahraný
BANG! smí spustit efekt Nebezpečné zbraně (výslovně v pravidlech). Test: druhý BANG! projde
a stojí žeton; třetí ne; s Volcanicem se žeton nebere.

### Nabíjení (A1) — hnědá, 4♦
`AD_PLACE` se 3 žetony ze zásoby (libovolná kombinace vlastních karet a postavy, strop 4).
Při menší zásobě jen kolik je. Když není kam žetony dát (všechno na 4, nebo prázdná
zásoba), karta **není hratelná** (důvod v UI) – stejně jako Pivo na plném životě.

### Kolona (A1) — hnědá, 2♠, vylepšení 2: +1 karta
Lízni 2 + n karet (n = počet vylepšení). Líže se běžnou cestou jako Dostavník, ale **není to
Dostavník** – kartu Divokého západu neotáčí. Test: 0/1/2 vylepšení, platba ze dvou zdrojů.

### Malý doušek (A1) — hnědá, 5♥, vylepšení 3: +1 život
+1 + n životů (strop maximum). Ve svém tahu; jako záchrana posledního života ne (R11).
Vylepšení nad strop životů nejde zaplatit (klient ho nenabídne, server odmítne).

### Big Fifty (A2) — oranžová zbraň, Q♠, dostřel 6, cena 1
Se skutečnou kartou BANG! (`isBangCardPlay`) lze zaplatit 1 → cíl na dobu výstřelu
`_adMuted` (§2.10). Test: Barel se nesnímá, Jourdonnais ne, Mustang nebrání, Apache Kid
schytá kárový BANG!, Julie Cutter nesnímá, Odměna nevyplatí, Boty/Talisman mlčí, Duch
zůstává; po výstřelu je všechno zpátky.

### Buntline Special (A2) — oranžová zbraň, J♠, dostřel 2, cena 1
`vos.adBuntline`. Když je výstřel zrušen (Vedle!, Barel, Jourdonnais – i podle české
poznámky, Bedna, Skrč se!, Útěk), cíl odhodí kartu z ruky **dle svého výběru**: fronta
`AD_DISCARD` → fáze `AD_DISCARD` (cíl klikne na kartu ve své ruce). Prázdná ruka = nic.
Slab the Killer: platí až po zrušení celého výstřelu (obě Vedle!).

### Dvouhlavňovka (A2) — oranžová zbraň, 6♣, dostřel 1, cena 1
Jen u kárového BANG! (`_effSuit` – pod Požehnáním nikdy, pod Prokletím nikdy): 1 žeton →
`vos.unavoidable = true` (existující cesta Colorado Billa – Barel, Vedle!, Jourdonnais,
Bedna se nenabídnou).

### Thunderer (A2) — oranžová zbraň, 3♣, dostřel 3, cena 1
Zaplaceno → karta BANG! se hned po odhozu vrátí do ruky (`deck.takeFromDiscard`), ještě
než cíl zareaguje. Do limitu se počítá; s Bandalírem nebo jako Willy the Kid ji lze zahrát
znovu (R19). Volcanic se s ním nepotká – je to taky zbraň a Thunderer ho nahradil.
Animace: karta letí do odhozu a zpátky do ruky (obyčejné lety).

### Bedna (A2) — oranžová, 3♥, cena 2
V obraně proti efektu BANG! (karta i bang-efekt): zaplať 2 → efekt Vedle!. Tlačítko
**BEDNA (2⛁)** se nabízí v RESPOND a navíc i ve fázi BARREL_DRAW vedle snímání na Barel –
pravidla říkají „rozhodněte se, v jakém pořadí budete karty používat", takže kdo chce Bednu
dřív, nemusí nejdřív snímat. Neúspěšný Barel pokračuje do RESPOND, kde se Bedna nabídne
znovu. Big Fifty, Belle Star, Laso ji vypínají. Proti Slabovi je Bedna jedno Vedle!.

### Skrč se! (A2) — hnědá, 3♦, vylepšení 2: karta zpátky do ruky
Efekt Vedle! z ruky. **Není to karta Vedle!** (R12, precedens Úhyb a Tomahawk): Big Spencer
ji zahrát smí, Ruská ruleta ji nebere, Calamity Janet ji jako BANG! nezahraje. `playsAsMissed`
ji zná. Vylepšení se platí v obraně (mimo tah – platit vylepšení mimo tah pravidla nebrání)
a karta se po zrušení výstřelu vrátí do ruky.

### Křesadlovka (A2) — hnědá, A♠, vylepšení 2: když zrušen, zpátky do ruky
Bang-efekt na dostřel (není karta BANG!: limit, Slab, Odměna, Colorado, Bloody Mary, efekty
zbraní ne). Vylepšení se platí **při zahrání** (R8) → `vos.adReturn`; když výstřel zrušen,
karta jde do ruky a smí se hned zahrát znovu. Když zasáhne, žetony propadly.

### Rychlopalba (A2) — hnědá, 3♠, vylepšení 1: další různý cíl
Bang-efekt na dostřel; každý další cíl = +1 vylepšení, všechny cíle různé a v dostřelu
(posouzeno při zahrání). První výstřel hned, další přes `_vosQueueShot` (vzor druhého cíle
Roztříštěné kulky). Každý cíl se brání sám.

### Šíp (A3) — hnědá, 5♦, vylepšení 1: další různý cíl
Na **kohokoli bez ohledu na vzdálenost** (R23). Každý cíl odhodí kartu BANG! (co bere obrana
proti Indiánům – `playsAsBang`, tedy i Calamity Janet s Vedle! a pod Zúčtováním cokoli),
nebo ztratí 1 život (brána Obětavého skoku). Křesadlovkou ani Kulometem se odpovědět nedá.
Barel/Vedle! nepomáhají (není to BANG!). Útěk/Mick Defender jen u jediného cíle; Apache Kid
je imunní (♦). Implementace jako Indiáni s vlastním seznamem cílů.

### Paklíč (A3) — oranžová, 2♣, cena 3
Použití: vyber hráče (kohokoli, ne sebe) → náhodná karta z jeho ruky (cesta Paniky jen pro
ruku, bez vzdálenosti, `stolenIndex`). Henry Block střílí, Útěk/Mick se brání, Ms. Abigail
ne (není hnědá).

### Bič (A3) — oranžová, 5♣, cena 3
Použití: odhoď libovolnou kartu ve hře u kohokoli – **i u sebe** (vlastní Vězení, Dynamit,
Bomba; R6, precedens Cat Balou na sebe). Bez vzdálenosti. Vybavení Zlaté horečky ne. Bomba
odhozená Bičem nevybuchne. Henry Block ano.

### Squaw (A3) — hnědá, 3♦, vylepšení 2: odhozenou kartu si vezmi
Jako Bič (i na sebe, bez vzdálenosti), jen je to hnědá karta z ruky. S vylepšením jde
odhozená karta do ruky hráče (krádež ze stolu); Nebezpečná karta takhle získaná přijde bez
žetonů. Ms. Abigail se jí nevyhne (hodnota 3).

### Rez (A3) — hnědá, 9♠
Každý jiný hráč ve hře odebere 1 žeton z každé své Nebezpečné karty (i zbraně a Bomby
před sebou) a ze své postavy; všechny se přesunou na postavu hráče (strop 4, zbytek do
zásoby). Vyčerpané karty se odhodí, **Bomba vybuchne** tomu, před kým leží (pořadí výbuchů
po směru od hráče). Henry Block ne (R22). Animace `ad_move`. Nehratelná, když nikdo jiný nic
nemá.

### Bomba (A4) — oranžová, 7♦
- **Zahrání** na libovolného hráče (i sebe – bot nikdy) se 3 žetony, cestou
  `_placeOnTarget` (okno úniku Útěk/Mick jako u Vězení). Apache Kid: zahrát na něj nejde
  (7♦), předat mu ji ano (předání není zahrání). Al Preacher může lízat.
- **Sejmutí** na začátku tahu toho, před kým leží, **po Dynamitu, Vězení a Chřestýši**
  (`pendingCheckDraw.bombIdx`, `_adBombPending` vzor `_rattlesnakePending`). Při
  neúspěšném Vězení se na Bombu nesnímá (R5, stejně jako Chřestýš). Laso: nesnímá se.
- ♥♦ (`_effSuit`) → majitel vybere jiného hráče ve hře (fáze `AD_BOMB_PASS`, klik na
  hráče), Bomba se přesune i se žetony (`ad_bomb_pass`); příjemce se jí brání nemůže
  (není to zahrání) a žeton za modrou nedostává. Když není komu, zůstává.
- ♣♠ → `_adTake(bomba, 2)`; když dojdou → **výbuch**.
- **Výbuch** (`_adBombExplode`): Bomba do odhozu, 2 klikané zásahy (`pendingDynamiteDamage`
  se `source: 'BOMB'`, přes `_vosSaveGate('CLICK')`), **bez útočníka** (jako Dynamit
  a Chřestýš – valoun, Julie Cutter, odměna za banditu nikomu). Výbuch mimo začátek tahu
  (Rez, Frankie) má vlastní `resume: 'AD_BOMB'` zpátky do fáze, ve které nastal.
- Bomba **nevybuchne** při Panice, Cat Balou, Biči, Squaw, Vulture Samovi, Patu Brennanovi.
- Žetony na Bombu se dávat smí (dobití, Nabíjení, Bass, Red Ringo – oddálí výbuch), platit
  z ní ne (R5). Frankie si z ní vzít smí – poslední žeton = výbuch.
- Test: celé pořadí Dynamit → Vězení → Chřestýš → Bomba; předání; výbuch na začátku tahu
  i mimo něj; Bomba + Stepní běžec; smrt výbuchem uprostřed cizího tahu.

### Stepní běžec (A5) — oranžová, 4♣, cena 1
Viz §2.11. Testy: vlastní neúspěšné Vězení zopakované; soupeřův úspěšný Barel zopakovaný;
Lucky Duke otočí dvě nové; dvojí zopakování (2 žetony); vyčerpání na posledním žetonu;
okno se neotevře, když majitel nemůže (Laso, Belle Star, 0 žetonů, mimo hru).

---

## 5. Postavy po jedné

| Postava | Fáze | Implementace |
|---|---|---|
| **Bloody Mary** (4) | A2 | `_adShotCanceled`: výstřel byl jejím skutečným BANG! (`isBangCardPlay`) → fronta líznutí 1 karty. Ne Křesadlovka, Rychlopalba, Kulomet. |
| **Mexicali Kid** (4) | A2 | Tlačítko schopnosti ve fázi PLAY, 1× za tah: platební lišta 2 ⛁ → klik na cíl v dostřelu zbraně → `_beginBangResolution(kid, cíl, isEffect=true, 'Mexicali Kid', …, { shot: 'MEXICALI' })`. Nepočítá se do limitu, nespouští efekt zbraně, Jourdonnais/Barel/Bedna fungují. Jen ve vlastním tahu. |
| **Bass Greeves** (4) | A3 | Tlačítko, 1× za tah: klik na kartu z ruky (odhoz) → `AD_PLACE` se 2 žetony na **jedno** místo (`oneTarget`). Nejde, když není kam (vše na 4) nebo prázdná ruka. |
| **Frankie Canton** (4) | A3 | Tlačítko, 1× za tah: klik na libovolnou Nebezpečnou kartu ve hře (i vlastní, i Bombu) nebo na **cizí** postavu → `_adMove` 1 žeton na Frankieho. Nejde, když má sám 4. Vyčerpaná karta odejde, Bomba vybuchne (R22). |
| **Red Ringo** (5) | A3 | Při rozdání 4 žetony na postavě. Tlačítko, 1× za tah: `AD_PLACE` `from: 'CHAR'`, až 2, jen na jeho Nebezpečné karty (obě na jednu, nebo po jedné); zpátky na postavu nic. Nejde bez vlastní Nebezpečné karty. |
| **Julie Cutter** (4) | A5 | Hák v `handleDamage` (jedna UDÁLOST zranění s útočníkem = jedno sejmutí, i když ztratila 2 životy – Dvojitá rána jde přes `_startAimHits`, proto hák i tam a strukturální test „Dvojitá rána = 1 sejmutí"): útočník je jiný hráč, Julie po zásahu žije → fronta `AD_JULIE_CHECK` → CHECK_DRAW s `reason: 'JULIE'` (veze se Podkova i Stepní běžec) → ♥♦ přes `_effSuit` → `_vosQueueShot(julie, útočník, 'JULIE', 'Julie Cutter')`. Bez ohledu na vzdálenost, zrušitelné. Big Fifty ji vypne. Bomba/Dynamit/Chřestýš nemají útočníka → nic. |
| **Al Preacher** (4) | A6 | §2.12. |
| **Ms. Abigail** (4) | A6 | §2.13. |

`CHAR_RANK` (bot) podle recenze a vlastního odhadu: Ms. Abigail a Mexicali Kid vysoko,
Julie Cutter a Bloody Mary střed, Al Preacher, Bass Greeves, Red Ringo nízko, Frankie
Canton nejníž. Test „CHAR_RANK zná každou postavu" to vynutí.

---

## 6. Bot

Každá fáze přidává větve tak, aby strukturální testy („každá fáze z `pendingActor` má větev
v `decideBotAction`", „každá akce bota má handler", „každá akce je v guardu") byly zelené
**v každém commitu**. Politika:

- **Rozmístění (`AD_PLACE`):** pořadí cílů – Bomba přede mnou na 2 žetonech (žeton jí
  přidá jedno černé sejmutí) → zbraň, jejíž efekt používám → Bedna → Bandalír → Eso v rukávu
  → postava (univerzální, platí vylepšení i schopnosti) → ostatní. Karta, která by ani
  s dobitím nedosáhla na svou cenu (Paklíč/Bič na 1 žetonu), má nízkou prioritu.
- **Platba (`adPickPay`):** nejdřív postava (kromě žetonů, které potřebuje vlastní schopnost
  – Mexicali Kid a Al Preacher si drží 2), pak karty s nejméně cenným použitím; nikdy
  nevybít zbraň, když by tím ztratil dostřel na cíl, který chce trefit.
- **Nebezpečné karty:** Eso v rukávu hned; Bečka piva při ztrátě života; Zvonice jen když
  odemkne cíl (vzor `weaponUnlocksTarget`); Paklíč na nepřítele s nejvíc kartami; Bič jako
  Cat Balou (`boardCardValue`); Bedna v obraně po Barelu a před kartou Vedle! z ruky.
- **Zbraně:** Dvouhlavňovka u kárového BANG! vždy; Thunderer vždy, když mu zbraň po zaplacení
  zůstane, nebo když má další BANG! na stejný tah; Buntline, když má cíl karty v ruce;
  Big Fifty, když má cíl Barel/Bednu/Mustang/Jourdonnaise/Apache Kida.
- **Vylepšení:** Kolona a Malý doušek, když má žetony navíc; Šíp a Rychlopalba za každého
  dalšího pravděpodobného nepřítele (brzda přátelské palby `shootTargets` platí); Skrč se!
  zpátky do ruky, když má 2 žetony navíc; Squaw, když je karta cenná; Křesadlovka zřídka.
- **Okna:** Stepní běžec – opakuj, když je výsledek pro mou stranu špatný (soupeřův
  úspěšný Barel, můj neúspěšný Vězení/Dynamit, spojencova Bomba na ♣♠); Al Preacher – ano,
  když mu po zaplacení zůstanou žetony na vlastní schopnost; Ms. Abigail – ignoruj, kromě
  karty od pravděpodobného spojence, která jí pomáhá (Panika/Cat Balou/Bič na její Vězení,
  Dynamit, Bombu); předání Bomby – nejpravděpodobnějšímu nepříteli, raději s málo životy.
- **Schopnosti:** Bass odhodí kartu s nejnižším `keepScore`, když má co nabít; Frankie bere
  z nepřítelovy karty na 1 žetonu (vybije ji) nebo z Bomby na 1 žetonu před nepřítelem
  (vybuchne mu); Red Ringo dobíjí nejcennější kartu; Mexicali střílí, když má nepřítele
  v dostřelu.
- **`keepScore`, `boardCardValue`, `CHAR_RANK`** znají každý nový druh/postavu (testy to
  vynutí). Bomba přede mnou má zápornou hodnotu, před nepřítelem kladnou.
- **Proti zacyklení:** použití jsou omezená žetony nebo „1× za tah"; okno Stepního běžce
  končí nejpozději s posledním žetonem. Celkový počet žetonů a `_adBell` jdou do otisku
  pokroku `progressSig` (server/bots.js), aby stall guard viděl i „jen přesunul žeton".

---

## 7. Testy

- **Struktura:** jediné cesty k `.adLoads` (grep zdrojáků mimo `_adAdd/_adTake/_adMove`);
  `AD_KINDS` zná každý druh (Doroty/LVK); `CHAR_RANK`, `keepScore`; nová pole se sedadlem
  v `SEAT_KEYS`; nová ztráta života přes `_vosSaveGate`; každé `health > 0` v `LIFE_OK`.
- **Žetony:** strop 4, prázdná zásoba (karta nehratelná, `_adAdd` přidá jen zbytek),
  vyčerpání = odhoz (zbraň → Colt), Panika vezme kartu bez žetonů a nové vyložení dá 3,
  vyřazení vrátí žetony postavy.
- **Rozmístění/platba:** dobití za modrou (i Vězení na jiného, ne předaný Dynamit, ne
  oranžová – R-U2), odhoz nad limit (N žetonů, `nextTurn` až po fázi), `adPayOk` (cizí
  zdroj, Bomba, málo žetonů, špatný počet → odmítnuto bez platby).
- **Každá karta a postava** podle §4/§5, včetně interakcí z §2.18.
- **Zátěž:** `ozbrojeni` do matice „rozšíření × 3–8 hráčů" (`test/server.bots.test.js`)
  a vlastní soubor `test/ad.load.test.js` (souběh s ostatními) s variantami „balíček samých
  X" pro Bombu, Stepního běžce, Rez, Bič a Paklíč; invariant zásoby a `_adMuted` po každé
  akci. Kombinace se Zlatou horečkou, Údolím stínů a Divokým západem naráz.
- Názvy souborů `test/ad.*.test.js` (`ad.setup`, `ad.loads`, `ad.weapons`, `ad.bomb`,
  `ad.redraw`, `ad.chars`, `ad.bot`, `ad.load`).

---

## 8. Pořadí prací

Každá fáze končí zeleným `npm test`, bootem serveru a commitem + pushem (trvalé pověření).
Render změny ověřuje uživatel v prohlížeči.

| Fáze | Obsah | Co uživatel uvidí |
|---|---|---|
| **A0 Kostra** | data (id 200–227, postavy 55–62, `CardType`, `Card` props), menu, loader se štítky (oranžový rám, kostička `ad_cube`), mixin + `core/armed.js`, zásoba a tři cesty, vyložení Nebezpečných karet se 3 žetony (debug), vyčerpání, kostičky na kartách/postavách, pyramida zásoby, `isDangerousCard`/`isBrownCard`. Do balíčku jen 6 karet ze základní hry. | rozšíření v menu; v debug hře vyložená oranžová karta se 3 kostičkami, zásoba „×29" |
| **A1 Dobíjení a placení** | `AD_PLACE` (modrá karta, odhoz nad limit), platební lišta, Nabíjení, Eso v rukávu, Bečka piva, Zvonice, Bandalír, Kolona, Malý doušek + bot | rozmisťování kliknutím, platba za vylepšení |
| **A2 Zbraně a výstřely** | kontext výstřelu, `_adShotCanceled`, `_adMuted`, 4 zbraně, Bedna, Skrč se!, Křesadlovka, Rychlopalba, Bloody Mary, Mexicali Kid + bot | přepínač efektu zbraně |
| **A3 Ruce a stoly** | Šíp, Paklíč, Bič, Squaw, Rez, Bass Greeves, Frankie Canton, Red Ringo + bot | výběr cílů, přelety žetonů |
| **A4 Bomba** | sejmutí, předání, výbuch (i mimo tah), interakce + bot | předávání, výbuch |
| **A5 Sejmutí znovu** | brána Stepního běžce v `resolveCheck`/`luckyDukePick`, okno, Julie Cutter + bot | okno „ZOPAKOVAT" |
| **A6 Okna mimo tah** | Al Preacher, Ms. Abigail (okno úniku + RESPOND) + bot | IGNOROVAT, LÍZNOUT mimo tah |
| **A7 Dokončení** | zátěž (matice + `ad.load`), ladění bota, mobilní profil (štítky ⛁, lišty), `docs/pravidla/ozbrojeni.md`, řádek v CLAUDE.md, `AD_CARDS_READY`/`AD_READY` celé | celé rozšíření ve hře s boty |

Art (§11) se zapojuje průběžně, jak dorazí – štítek je jen záloha.

---

## 9. Co plán vědomě nedělá

- **Žádné odpočty v oknech** – rozhodnutí 3 (pauza, jen když jde reagovat).
- **Žádné předvolby** („vždy líznout", „vždy ignorovat") – odmítnuto spolu s variantou
  rozhodnutí 3.
- **Automatické rozmisťování a placení** pro lidi – rozhodnutí 1 (bot je samozřejmě
  automatický).
- Žetony na vybavení Zlaté horečky ani na zelených kartách Dodge City.
- Kostkovou hru, Legends a další mini-rozšíření.

---

## 10. Rozhodnutí

### Uživatel (2026-11-06)

| | Rozhodnutí |
|---|---|
| R-U1 | Žetony se rozmisťují i platí **vždy ručně** (§2.7, §2.8). |
| R-U2 | Dobití za zahrání platí **jen pro modrou kartu**, ne oranžovou (§2.4). |
| R-U3 | Okna mimo tah **jen když jde reagovat** (§2.11–2.13). |
| R-U4 | Art dodá uživatel; do té doby štítky. |

### Navržená (ke schválení – kde pravidla mlčí)

| | Návrh | Proč |
|---|---|---|
| R1 | Klíč `ozbrojeni`, prefix `ad`/`AD_`, soubory `logic/armed.js`, `core/armed.js`, `core/armedAnim.js`, data id 200–227, postavy 55–62 | volné jmenné prostory, žádná kolize |
| R2 | Oranžová = modrá pro všechno „na stole"; věta jmenující modrý okraj (dobití, José Delgado) ji nezahrnuje; nový `isBrownCard` | důsledek R-U2, jinak by LVK oranžovou „opakoval" |
| R3 | Zásoba se počítá (32 − žetony ve hře), tři jediné cesty změny | žetony se nemůžou ztratit ani zdvojit |
| R4 | Žetony karty, která opustí hru, jsou automaticky zpátky v zásobě; každé vyložení = 3 | pravidlo Paniky, bez úklidu na desítce míst |
| R5 | Bomba přede mnou smí dostávat žetony, platit se z ní nesmí; vybuchne při vyčerpání jakoukoli cestou; při neúspěšném Vězení se nesnímá; pořadí Dynamit → Vězení → Chřestýš → Bomba | „exploduje, když dojdou, například Rezem"; Chřestýš (Albi DB, dV) |
| R6 | Bič a Squaw i na vlastní karty; Paklíč jen cizí ruka | precedens Cat Balou na sebe |
| R7 | Stepní běžec na všechno přes CHECK_DRAW/CHECKING + Barel; ne Rum, Helena Zontero | jedno místo, jeden výsledek |
| R8 | Vylepšení Křesadlovky se platí při zahrání | obecné pravidlo „vždy ve chvíli zahrání" |
| R9 | Big Fifty jen na jeden výstřel; ruší schopnost a karty ve hře cíle včetně vybavení ZH a Odměny; kartu Duch ne | Laso/R10 ZH; Duch má zůstat „nezastřelitelný" |
| R10 | Ms. Abigail: J–A i u karet BANG!; volba se vždy nabízí; LVK nese hodnotu původní karty; ne vlastní karty | text karty; přátelské karty |
| R11 | Bečka piva a Malý doušek nejsou karta Pivo (2 hráči ano, Yto/Jim/Tequila Joe ne, záchrana posledního života ne) | pravidla jmenují „kartu Pivo" |
| R12 | Skrč se! = efekt Vedle!, ne karta Vedle!; Křesadlovka/Rychlopalba = bang-efekt; efekt zbraně podle `isBangCardPlay` | precedens Úhyb, Tomahawk, R5 Údolí |
| R13 | Doroty: poručená karta bez vylepšení a bez efektu zbraně; LVK jen základní efekt | nikdo neplatí za cizí rozkaz; Sciarra Q29 |
| R14 | Žetony postavy při vyřazení/odchodu ducha a stínu do zásoby; Red Ringo 4 žetony jen při rozdání | „Start with 4" = začátek hry |
| R15 | Julie Cutter: jedno sejmutí za událost zranění s útočníkem, jen když přežije | „It's just 1 BANG!" |
| R16 | Al Preacher: okno po doběhnutí efektu karty (frontou), 1 líznutí na kartu, platí i mimo tah | text upřesnění |
| R17 | „Zrušen" = Vedle!, Barel, Jourdonnais, Bedna, Skrč se!, Útěk, Opětovná palba; ne Apache Kid, ne Ms. Abigail | pravidla Buntline; Abigail ignoruje celý efekt |
| R18 | Cíle se posuzují ve chvíli zahrání, před platbou | platba může vybít zbraň |
| R19 | Thunderer vrací kartu hned; do limitu se počítá | upřesnění karty |
| R20 | Zvonice platí na příští zahranou kartu jakéhokoli druhu | „pro příští kartu, kterou zahraješ" |
| R21 | Bandalír se platí automaticky z Bandalíru při BANG! nad limit | cena jde z té karty, volba není |
| R22 | Frankie smí brát i z vlastních karet a z Bomby; Henry Block nestřílí na Frankieho ani Rez | žetony nejsou karty; El Gringo precedens |
| R23 | Šíp na kohokoli bez vzdálenosti, „karta BANG!" = co bere obrana proti Indiánům | na kartě není ikona dostřelu |

---

## 11. Assety od uživatele

Všechno **WebP** (`tools/webp.js --quality=70`, značky bezeztrátově). Dokud soubor chybí,
kreslí se štítek z dat (oranžový/hnědý rám, jméno, text, cena v kostičkách).

**Lícové strany karet** → `assets/card_art/ozbrojeni/<soubor>.webp`:

| Karta | soubor | | Karta | soubor |
|---|---|---|---|---|
| Eso v rukávu | `eso_v_rukavu` | | Malý doušek | `maly_dousek` |
| Bandalír | `bandalir` | | Šíp | `sip` |
| Bečka piva | `becka_piva` | | Kolona | `kolona` |
| Zvonice | `zvonice` | | Skrč se! | `skrc_se` |
| Bomba | `bomba` | | Křesadlovka | `kresadlovka` |
| Bedna | `bedna` | | Rychlopalba | `rychlopalba` |
| Paklíč | `paklic` | | Nabíjení | `nabijeni` |
| Stepní běžec | `stepni_bezec` | | Rez | `rez` |
| Bič | `bic` | | Squaw | `squaw` |
| Big Fifty | `big_fifty` | | BANG! (art rozšíření, volitelně) | `bang` |
| Buntline Special | `buntline_special` | | Cat Balou (volitelně) | `cat_balou` |
| Dvouhlavňovka | `dvouhlavnovka` | | Vedle! (volitelně) | `vedle` |
| Thunderer | `thunderer` | | | |

**Portréty postav** → `assets/characters/055.webp` … `062.webp` (Al Preacher, Bass Greeves,
Bloody Mary, Frankie Canton, Julie Cutter, Mexicali Kid, Ms. Abigail, Red Ringo).

**Volitelně:** značka rozšíření `assets/card_marks/ozbrojeni.webp` (pistole s dynamitem
v pravém horním rohu karet), kostička žetonu `assets/other_cards/ozbrojeni/nabiti.webp`
(jinak se kreslí).
