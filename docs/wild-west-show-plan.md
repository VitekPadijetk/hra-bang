# Divoký západ (Wild West Show) — implementační plán

Podklady: [`docs/wild-west-show.md`](wild-west-show.md) (texty karet, oficiální FAQ Q01–Q18,
Sciarrovo FAQ, poznámky z pravidel) + PDF `wws_rules_eng.pdf` / `wws_faq_eng.pdf`.

**Zdroj pravdy pro text karty je český art** v `assets/divoky_zapad_cards/` — hráč ho vidí
ve hře, takže se pravidlo musí chovat podle něj. FAQ slouží k výkladu sporných míst.

Výchozí stav: `npm test` = **1002 testů, 0 chyb**.

---

## 0. Rozhodnutí, která plán fixuje

Odsouhlaseno předem:

1. **Životy nad 5 → druhá karta životů vedle.** Big Spencer 9 (10 jako šerif), Gary Looter
   5 (6 jako šerif). Karta životů má 5 nábojů; nad 5 se vyloží druhá a portrét jezdí po
   dvojici jako po jedné desetislotové dráze. Detail v §7.
2. **Roubík se naváže na chat.** Dokud platí, stojí odeslání zprávy 1 život. Detail v §4.9.
3. **Greygory Deck se dělá pořádně** — `effectiveCharacter` → `hasAbility()` napříč jádrem
   i zrcadly. Detail v §6.
4. **Balíček Divokého západu leží NALEVO od balíčků** a všechna tři rozšíření událostí
   jdou hrát naráz. Detail v §2.5.

### Body, které plán rozhoduje sám (ke schválení, ne blokující)

| # | Věc | Rozhodnutí plánu | Proč |
|---|---|---|---|
| R1 | Zúčtování: smí být karta BANG! hrána i jako BANG!? | **Ano.** Obě věty na kartě jsou povolující („může být hrána"), takže BANG! zůstává BANG! a navíc smí i jako Vedle!. | Vytištěný český text. (Odpověď zaměstnance dV Giochi na BGG zní restriktivněji, ale hráč u našeho stolu čte kartu.) |
| R2 | Hřbitov: kdy se míchají role? | **Při každém návratu**, přes role všech hráčů, kteří jsou v ten okamžik vyřazení (včetně vracejícího se). | Jediný výklad, ve kterém věta „Role vyřazených hráčů zamíchejte" něco dělá. Při jednom mrtvém je to no-op. |
| R3 | Helena Zontero: platí na její sejmutí Lucky Duke / John Pain? | **Ne, ani jedno.** | FAQ Q09 – karta se otáčí automaticky, ne hráčem. Táž věta vylučuje i Lucky Duka. |
| R4 | Lady Růže / Zuřivá Doroty: kolikrát? | **Tolikrát, kolik je živých hráčů** — přesně podle FAQ Q08. U Lady Růže je to strop na použití **za sebou**, u Zuřivé Doroty strop **na jeden tah**. | Karta počet neuvádí, ale FAQ dává explicitní pravidlo palce a nemá cenu vymýšlet přísnější. |
| R5 | Zuřivá Doroty: kdy se volí cíl poroučené karty? | Poroučející vybere **jméno karty + hráče**, a teprve pak **cíl** — ze seznamu legálních cílů TOHO hráče. | FAQ Q04 chce vše dopředu, ale u stolu jde o to, aby se nedal cíl vybrat podle toho, co se ukázalo. Server tu informaci hlídá sám a Q04 věcně (Q05: vzdálenosti poroučeného, „akce musí být proveditelná") zůstává v platnosti. |
| R6 | Víc Gary Looterů (Vera Custer ho kopíruje) | Karty bere **první po směru od odhazujícího**. | Pravidla to neřeší. Dělení jako u Vulture Sama by za jednu odhozenou kartu rozjelo celou interaktivní fázi na konci cizího tahu. |
| R7 | Gary Looter × Opuštěný důl (Fistful) | **Gary vyhrává** — karta se k balíčku vůbec nedostane. | Schopnost kartu zachytí dřív, než se rozhoduje, kam se odkládá. |
| R8 | Youl Grinner: kdy se určuje, kdo má víc karet? | **Jednou, snímkem na začátku** jeho fáze lízání. | FAQ Q03 „každý z těch hráčů" mluví o jedné množině; jinak by pořadí dávání měnilo, kdo platí. |
| R9 | Big Spencer × Zúčtování | Smí hrát kartu BANG! jako Vedle! | Poznámka v pravidlech doslova. Zákaz se týká jen **karet Vedle!**. |
| R10 | Vera Custer kopírující Greygoryho Decka | **Smí ho kopírovat.** Při volbě kopie si rovnou lízne vlastní dvojici postav a má jejich schopnosti do konce kola. | Rekurze nehrozí: Greygory bere **jen postavy základní hry** (FAQ Q30) a žádná z těch 16 schopnosti nerozdává — ani Vera, ani Greygory v tom poolu nejsou. |
| R11 | Mobil: druhá karta životů | Kompaktní sloupec zůstává **jednokartový** a nad 5 životů ukáže **číslo**. | Sloupec je široký jednu kartu (`colW`), druhá karta by ho zdvojnásobila a řada 7 sloupců by se nevešla. |
| R12 | Greygory Deck: co je „postava základní hry"? | Jen ta, jejíž **karta je fyzicky volná** — nikdo ji nehraje, nemá ji jako počítadlo životů (Nová identita) ani ji nedrží jako Greygory. Nezbudou-li dvě, líznou se míň; nezbude-li nic, **je tenhle tah bez schopnosti**. | Líže se ze skutečného balíčku postav. „Smůla" je legální stav a nesmí nic zaseknout. |
| R13 | Smí se bot upovídat k smrti? | **Ne** — na 1 životě pod Roubíkem mlčí. | Politika bota, ne pravidlo. Sebevražda hláškou vypadá jako chyba hry, ne jako vtip. |

---

## 1. Co rozšíření obsahuje

**10 karet událostí** (art hotový v `assets/divoky_zapad_cards/`, 650×1000 PNG) a
**8 postav** (art **chybí**, potřeba portréty 034–041).

Zásadní odlišnost od High Noonu a Fistfulu: **událost neotáčí šerif na začátku kola, ale
kdokoli zahráním Dostavníku nebo Wells Farga.** Na začátku hry žádná událost neplatí.
Karta *Divoký západ* leží vespod balíčku (stejný vzor jako Pravé poledne).

Neotáčí to nic jiného (FAQ Q16 — ani Krytý vůz z Dodge City) a **neotáčí to ani zopakování
Dostavníku/Wells Farga Lee Van Kliffem** (Sciarra Q19).

---

## 2. Infrastruktura

### 2.1 Data

Nový `cards.divoky_zapad.json`, schéma 1:1 podle `cards.fistful.json`, id **500–509**
(500 = `DIVOKY_ZAPAD`, tedy karta „vespod", stejně jako 400 = `FISTFUL_OF_CARDS`):

```json
{ "id": 501, "key": "HRBITOV", "name": "Hřbitov", "art": "hrbitov",
  "text": "Na začátku svého tahu se všichni vyřazení hráči vrátí do hry s 1 životem. Role vyřazených hráčů zamíchejte a rozdejte náhodně." }
```

Klíče: `HRBITOV`, `MILACEK_VALENTYN`, `ZURIVA_DOROTY`, `ROUBIK`, `HELENA_ZONTERO`,
`LADY_RUZE_Z_TEXASU`, `MADAM_ZUZANA`, `SACAGAWAY`, `ZUCTOVANI`, `DIVOKY_ZAPAD`.
Klíče **musí být unikátní napříč všemi třemi balíčky** — `hasEvent` se nikdy neptá,
z kterého balíčku karta je (to je dnešní dohoda z Fistfulu a platí dál).

Postavy do `characters.json` jako id **34–41** a do `logic/entities.js` jako
`WILD_WEST_CHARACTERS` (přidá je `_characterPool` při `exps.divoky_zapad`).

### 2.2 Nový mixin `logic/wildWest.js`

Zrcadlí `logic/fistful.js`. Třetí sada polí místo přepisu na obecnou strukturu —
**stejné rozhodnutí jako u Fistfulu a ze stejného důvodu** (nesahat na hotové):

| High Noon | Fistful | Divoký západ |
|---|---|---|
| `eventDeck`/`eventPile`/`activeEvent` | `ffDeck`/`ffPile`/`activeFistful` | `wwsDeck`/`wwsPile`/`activeWws` |
| `_pendingHighNoonReveal`/`_eventEntering` | `_pendingFistfulReveal`/`_ffEntering` | `_pendingWwsReveal`/`_wwsEntering` |

Metody: `_setupWwsDeck(options)`, `_flipWwsEvent(playerIdx)`, `_applyWwsEventOnEnter()`,
plus vše, co má domov jen tady (§4).

**Slévá se to na dvou místech, přesně jako Fistful:**

- `GameState.hasEvent(key)` → přibude `|| this.activeWws?.key === key`
  ([logic/highNoon.js](../logic/highNoon.js)),
- `eventActive(state, key)` → totéž nad prostým JSON stavem
  ([core/highNoon.js](../core/highNoon.js)).

Nic dalšího se nemění — všechna existující volání `hasEvent` fungují beze změny.

### 2.3 Spouštěč: Dostavník / Wells Fargo

Jediný hák v [logic/play.js](../logic/play.js) `playCard`, ve větvích
`CardType.STAGECOACH` a `CardType.WELLS_FARGO`, **před** nastavením fáze `DRAW`:

```js
[CardType.STAGECOACH]: () => {
    this._flipWwsEvent(this.currentPlayerIndex);      // Divoký západ: nová událost
    this._setDrawPhase({ … });
    this.phase = "DRAW";
    return true;
},
```

Proč před lízáním: efekt karty se má číst nahlas hned při zahrání a **Sacagaway
i Zúčtování mění to, co hráč vzápětí uvidí a smí zahrát**.

`_flipWwsEvent` **musí umět odmítnout**: volá se s příznakem `repeat` z Lee Van Kliffa
(Sciarra Q19 — zopakování efektu kartu nemění) a Krytý vůz jí neprochází vůbec (FAQ Q16),
protože má vlastní `CardType`.

Vyhodnocení okamžitých efektů (`_applyWwsEventOnEnter`) běží **hned za odkrytím**, ne
v krokovači startu tahu — karta přichází uprostřed cizí fáze 2. Prakticky to potřebuje
jen **Helena Zontero**; ta se ale musí umět pozastavit (sejmutí + přerozdání rolí), takže
`_flipWwsEvent` vrací `true` = „hra čeká" a `playCard` v tom případě lízání Dostavníku
odloží do `_wwsResumeDraw` (obdoba `_resumeBeginTurnAfterQueue`).

### 2.4 Stav a redakce

Do konstruktoru `GameState`: `wwsDeck: []`, `wwsPile: []`, `activeWws: null`,
`_wwsEntering: null`, plus per-kartu: `pendingDorothy`, `pendingGrinner`, `pendingTeren`,
`pendingGreygory`, `_roseStreak`, `_roseUsedThisTurn`, `_dorothyUsed`, `_dorothyDone: []`,
`_gagPending: []`, `_valentineDone`.

`redactState` ([server/rooms.js](../server/rooms.js)):

- **skrýt** `wwsDeck` (pořadí balíčku) — stejně jako `eventDeck`/`ffDeck`,
- **veřejné** `wwsPile` + `activeWws`,
- **Sacagaway obrací redakci ruky naruby** — dokud platí, ruce se nenahrazují
  `_placeholder` kartami (§4.2). To je jediné místo, kde událost sahá do redakce.

### 2.5 Rozložení stolu — třetí sloupec nalevo

Dnes: dobírací balíček `x = 870`, odhoz `1050`, High Noon `1170/1280` (vpravo od odhozu),
Fistful na mobilu zrcadlově `750/640` (vlevo od balíčku), na desktopu nad High Noonem
(`eventStack: 'vertical'`, `eventRowGap: 170`).

**Divoký západ dostane levý pár `wwsPileX: 750`, `wwsActiveX: 640`** a `eventPileSlots`
se rozšíří na tři balíčky:

```js
function eventPileSlots(L, hnOn, ffOn, wwsOn)   // → { hn, ff, wws, stacked }
```

- **Desktop:** High Noon + Fistful se chovají **pixelově jako dnes** (samo → klasické
  místo vpravo; obojí → nad sebou vpravo). Divoký západ leží vlevo na `750/640`. Tím
  se nemění nic, co už je hotové, a přibude jen nová dvojice slotů.
- **Mobil** (`eventStack: 'horizontal'`): Fistful drží dnešní `750/640`, Divoký západ
  jde o jeden krok dál doleva na **`530/420`**. Pásmo v `y = 540` je na mobilu volné
  přes celou šířku (kompaktní řada končí na 440, moje zóna začíná na 660), takže se
  čtyři sloupce vejdou. Když Fistful zapnutý není, sedne si Divoký západ rovnou na
  `750/640`.
- `eventPileLift` (zvednutí při hokynářství) se řídí dál jen podle `stacked` — levé
  sloupce nad sebou nikdy nejsou, takže se jich netýká.

**Testy:** `test/layout.test.js` + `test/positions.test.js` dostanou invariant „žádné dva
sloupce událostí se nepřekrývají a žádný nedosáhne na balíčky ani na kartu soupeře" pro
všech **8 kombinací** zapnutých balíčků × oba profily × 2–8 hráčů.

### 2.6 Assety

- **Karty událostí:** převést `assets/divoky_zapad_cards/*.png` → `.webp` skriptem
  `node tools/webp.js --replace --quality=70` (art je 650×1000, tedy 2× — `normalizeTexture`
  ho srovná na 325×500 jako u High Noonu). Totéž rub
  `assets/other_cards/divoky_zapad/divoky_zapad.png`.
- **Portréty postav 034–041 už jsou hotové.** Do doby, než budou nakreslené, `tools/placeholder.js`
  — hra nesmí spadnout na chybějícím assetu (`core/assetLoad.js` to ošetří, ale portrét
  by byl zelený obdélník).
- **Nový loader** v `EXPANSION_LOADERS` ([game.js](../game.js)) podle vzoru `fistful`:
  rub `wws_back` + karta `DIVOKY_ZAPAD` jako `critical` (ukazují se v intru), zbytek na
  pozadí, portréty 34–41, `normalizeCharTextures(scene, 34, 41)`.
- **Intro** (`server/intro.js`) dostane čtvrtý balíček do deck fáze: `wws_top` →
  `shuffle_wws` → `wws_bottom` (přesně tři beaty jako High Noon).

### 2.7 Zapnutí v lobby

`options.expansions.divoky_zapad`. Zaškrtávátko ve `view/menu.js` (běžná hra, hra botů,
debug), `server/handlers.debug.js`, `server/lifecycle.js` (čekání na assety).
Rozšíření je **nezávislé na ostatních** — jde zapnout samo i se všemi třemi.

---

## 3. Přehled: kde která karta zasahuje

| Karta | Typ zásahu | Hlavní místo |
|---|---|---|
| Zúčtování | pasivní dotaz | `core/playability.js` (2 nové predikáty) |
| Sacagaway | redakce + render | `server/rooms.js`, `view/board.js` |
| Madam Zuzana | konec tahu | `logic.js` `tryEndTurn` |
| Miláček Valentýn | start tahu | krokovač `_runBeginTurn` |
| Hřbitov | pořadí tahů + role | `logic.js` `nextTurn`, krokovač |
| Helena Zontero | okamžitý efekt | `_applyWwsEventOnEnter` |
| Lady Růže z Texasu | akce ve fázi 2 | nový `_wwsSeatSwap` |
| Zuřivá Doroty | nová fáze | nové fáze `DOROTHY_*` |
| Roubík | mimo herní smyčku | chat handler + odložená fronta |
| Divoký západ | podmínka výhry | `core/winCondition.js` |

---

## 4. Karty událostí — implementace po jedné

### 4.1 Zúčtování (`ZUCTOVANI`)

> Každá karta může být hrána jako by to byla karta **BANG!**.
> Každá karta **BANG!** může být hrána jako by to byla karta **Vedle!**.

Je to Calamity Janet zobecněná na všechny hráče a na všechny karty. Dnes je „co se počítá
za Bang! / za Vedle!" **rozsypané do deseti inline podmínek** `effectiveCharacter(me) ===
"Calamity Janet"` (playability 6×, `core/cardRules.js`, `logic/response.js` 2×,
`core/botPolicy.js` 2×). To se nejdřív **stáhne do dvou predikátů** v
[core/playability.js](../core/playability.js):

```js
// Smí hráč tuhle kartu z ruky zahrát jako BANG! ?
function playsAsBang(state, me, card) {
    if (!card || card._placeholder) return false;
    if (card.type === "Bang!") return true;
    if (hasAbility(me, "Calamity Janet") && card.type === "Vedle!") return true;
    if (eventActive(state, 'ZUCTOVANI')) return true;      // každá karta
    return false;
}
// …a jako Vedle! ?
function playsAsMissed(state, me, card) {
    if (!card || card._placeholder) return false;
    if (card.type === "Vedle!") return !bigSpencerBlocked(me);   // Big Spencer, §5.1
    if (hasAbility(me, "Calamity Janet") && card.type === "Bang!") return true;
    if (hasAbility(me, "Elena Fuente")) return true;
    if (eventActive(state, 'ZUCTOVANI') && card.type === "Bang!") return true;
    return false;
}
```

Tenhle refaktor je **hodnota sám o sobě**: dnes se ta pravidla musí ručně držet v souladu
na deseti místech a přesně proto existuje invariant „bot se nikdy nezasekne".

Kde se predikáty nasadí (server, klient i bot přes tytéž funkce):

- `playBang` / `cardPlayability` / `core/cardRules.js` `getActionForCard` → `playsAsBang`,
- `handleResponse` (obrana i Bang! v duelu) → `playsAsMissed` / `playsAsBang`,
- `bangCardFromHand` (Odstřelovač, Odražená střela, Lee Van Kliff) → `playsAsBang`,
- `rouletteDiscardable` (Ruská ruleta) → `playsAsMissed`,
- `core/botPolicy.js` větev `RESPOND` a `PLAY`.

**Hrany:**

- Limit 1× Bang!/tah platí dál — Zúčtování z něj nedělá pumpu (proto ani Suzy Lafayette
  nevystřílí donekonečna, což je známý dotaz na BGG).
- **Želízka** (High Noon) se ptají na **skutečnou barvu karty**, ne na to, čím se tváří —
  `suitBlockedFor` zůstává beze změny a `playsAsBang` ho volá jako první.
- **Big Spencer** smí kartu BANG! zahrát jako Vedle! (R9) — proto je zákaz v `playsAsMissed`
  navázaný na `card.type === "Vedle!"`, ne na roli karty.
- **Lee Van Kliff** smí za schopnost odhodit libovolnou kartu (poznámka v pravidlech) —
  padne to samo, protože se ptá `bangCardFromHand` → `playsAsBang`.
- Karta zahraná jako Bang! si nese **svou** barvu → Apache Kid, Barel a Jourdonnais fungují
  normálně.

**Testy:** modrá karta zahraná jako Bang!; Vedle! zahrané jako Bang!; Bang! jako obrana;
Bang! jako odhoz v Ruské ruletě; Odstřelovač zaplacený dvěma libovolnými kartami;
Zúčtování × Želízka (barva pořád omezuje); Zúčtování × Kazatel (Kazatel zakazuje kartu
Bang!, ne roli — jiná karta jako Bang! projde).

---

### 4.2 Sacagaway (`SACAGAWAY`)

> Všichni hráči hrají s odhalenými kartami v ruce (vyjma svých rolí).

Jediná událost, která sahá do **redakce stavu**.

- [server/rooms.js](../server/rooms.js) `redactState`: dokud `eventActive(gs,'SACAGAWAY')`,
  **ruce se nenahrazují** `{ id: null, _placeholder: true }`. Role, pořadí balíčků,
  odložené identity a Clausova řada se skrývají dál.
- Divák běžné hry: vidí ruce taky (karta říká „všichni hráči hrají s odhalenými kartami",
  je to veřejná informace u stolu).
- [view/board.js](../view/board.js): vějíř soupeře se dnes kreslí z délky pole jako ruby.
  Nově: má-li karta `id`, kreslí se **lícem**. Týká se to **všech pěti větví** (okruh
  vlevo/nahoře/vpravo/uprostřed, kompaktní sloupec) **plus diváckého pohledu** — musí se
  měnit spolu, jinak jeden soused ukazuje ruby a druhý líce.
- [net/handlers.js](../net/handlers.js) `_liftCardFromHand`: dnes u **zakryté** ruky
  odebírá poslední slot (ve vějíři rubů na tom nezáleží). S odhalenou rukou by to škublo
  špatnou kartou — musí se použít `stolenIndex`, který server **už posílá** u
  `panic_sequence` / `catbalou_sequence` / `ragtime_steal` / `jesse_jones_draw`.
- Krádež z ruky (`ragtime_steal`) se dnes posílá **soukromě** (majitel líc, ostatní rub).
  Pod Sacagaway se pošle veřejně s `cardId` — stejná odbočka, jakou má lízání z odhozu
  pod Opuštěným dolem.
- **Bot se nemění.** Boti dnes čtou `room.gameState` napřímo, redakcí neprocházejí — tedy
  ruce viděli vždycky. Sacagaway jim nic nepřidá (a nesmí jim nic vzít).

#### Z ruky se pořád bere NÁHODNĚ (FAQ Q17)

Odkrytá ruka **nemění nic na tom, jak se z ní bere**. Panika, Cat Balou, Krytý vůz,
Ragtime, Jesse Jones, Flint Westwood i dělení karet mezi víc Vulture Samů losují dál —
**v pravidlech se tedy nemění vůbec nic** a `resolveCardSelection`
([logic/play.js](../logic/play.js)) zůstává beze změny.

FAQ Q17 to říká výslovně: postižený hráč ruku **otočí lícem dolů, zamíchá ji**, teprve
pak se z ní náhodně vezme jedna (u Flinta dvě) karta a ruka se zase odhalí. Kdyby se
vybíralo, byla by z Paniky pod Sacagaway přesně mířená zbraň — a to je právě to, čemu
ta věta brání.

Stojí za to ten postup **ukázat**, ne jen dodržet: jinak hráč, který soupeři vidí do ruky
a nemůže si vybrat, bude mít pocit, že je to chyba UI. Cinematika krádeže pod Sacagaway
proto kopíruje fyzický postup:

1. vějíř oběti se **přetočí na ruby** a krátce **zamíchá** (`core/shuffleAnim.js`,
   nejkratší varianta — je to gesto, ne rozdávání),
2. odletí náhodná karta (pořád přes `stolenIndex`, viz níž),
3. zbytek ruky se **přetočí zpátky lícem nahoru**.

Časování patří do `core/wwsAnim.js` vedle přetáčení při příchodu karty, ať o stejnou dobu
počká fronta animací i boti.

#### Přetočení ruky je animace, ne skok

- **Příchod karty:** všechny cizí vějíře se **plynule přetočí lícem nahoru**
  (`animateCardFlip`, karty postupně s malým odstupem, ať to čte oko).
- **Odchod karty** (překryje ji další Dostavník/Wells Fargo): přetočí se zpátky na rub.
- Časování patří do **`core/wwsAnim.js`** (nový soubor podle vzoru `core/highNoonAnim.js`),
  aby o stejnou dobu počkala fronta animací (`ANIM_MS`) i boti
  (`room._wwsBlockUntil` v [server/anim.js](../server/anim.js)) — **obě místa se musí
  měnit spolu**, to je dnešní dohoda u každé cinematiky.
- **Lety karet se přizpůsobí odkryté ruce.** Dnes se karta k soupeři do ruky přetáčí
  lícem→rubem (mizí mu do skryté ruky) a od něj rubem→lícem. Pod Sacagaway se **nepřetáčí
  vůbec** — letí lícem celou cestu, protože obě ruce jsou odkryté. Týká se to
  `animateDrawToMyHand`, `ragtime_steal`, `jesse_jones_draw`, `panic_sequence`,
  `catbalou_sequence` i rozdávání v hokynářství.
- **`_liftCardFromHand`** ([net/handlers.js](../net/handlers.js)) dnes u zakryté ruky
  odebírá poslední slot (ve vějíři rubů na tom nezáleží). S odkrytou rukou by škublo
  špatnou kartou — musí jít přes `stolenIndex`, který server **už posílá**.
- Krádež z ruky (`ragtime_steal`) se dnes posílá **soukromě** (majitel líc, ostatní rub).
  Pod Sacagaway se pošle veřejně s `cardId` — stejná odbočka, jakou má lízání z odhozu
  pod Opuštěným dolem.

**Testy:** `test/server.rooms.test.js` sekce „Redakce stavu" — se Sacagaway ruce projdou,
role ne; bez ní se nic nemění. Dál: **Panika pod Sacagaway bere pořád náhodně** (FAQ Q17)
a `resolveCardSelection` se nezměnilo; krádež nese `stolenIndex`; Sacagaway odejde
s další kartou události a ruce se zase skryjí.

---

### 4.3 Madam Zuzana (`MADAM_ZUZANA`)

> Během svého tahu musí každý hráč zahrát alespoň 3 karty. Hráč, který to neudělá,
> ztrácí 1 život.

**Počítadlo běží vždycky, ne jen když karta platí** — FAQ Q02: přijde-li Zuzana uprostřed
tahu, počítají se i karty zahrané předtím. Rozšíří se `_trackCard` v [logic.js](../logic.js),
které už se volá na každé cestě „karta byla sehrána":

```js
_trackCard(playerIdx, cardType) {
    …dnešní statistiky…
    const p = this.players[playerIdx];
    if (p) p._playedThisTurn = (p._playedThisTurn || 0) + 1;   // Madam Zuzana
}
```

Nuluje se v `nextTurn` při přechodu na jiného hráče (vedle `_vendettaDone`/`_extraTurn`).
Vendetin **tah navíc je nový tah** → počítadlo se nuluje a tři karty se hrají znovu.

**Co se počítá:** karta zahraná z ruky. **Nepočítá se** odhoz (Ruská ruleta, limit na konci
tahu), cena „odhoď další kartu" ani karta BANG!, kterou platí Lee Van Kliff (Sciarra Q24).
**Počítá se** zopakování efektu Lee Van Kliffem (poznámka v pravidlech) → `_trackCard`
se v jeho větvi zavolá.

**Vyhodnocení až PO odhozu, a hráč na životy klikne.** Pořadí na konci tahu je pravidlo:

```
fáze 3 (odhoz nad limit)  →  Madam Zuzana: klik na životy  →  Vendeta: sejmutí  →  nextTurn
```

Gate proto **nepatří do `tryEndTurn`**, ale úplně nahoru do `nextTurn` ([logic.js](../logic.js)),
**před `_vendettaCheck()`**:

```js
nextTurn() {
    if (this._zuzanaPenalty()) return;   // Madam Zuzana: čeká se na klik na životy
    if (this._vendettaCheck()) return;   // Fistful – Vendeta (až za Zuzanou)
    if (this._teardownGhost()) return;
    …
}
```

Do `nextTurn` se totiž chodí **dvěma cestami** (`tryEndTurn`, když se odhazovat nemusí,
a `discardCard`, když se dohodil poslední přebytek) — kdyby gate seděl v `tryEndTurn`,
hráč, který odhazoval, by penalizaci minul. Nahoře v `nextTurn` je to jedno místo pro obě.

`_zuzanaPenalty()` postaví existující klikací fázi zásahů:
`pendingDynamiteDamage = { playerIdx, hitsLeft: 1, source: 'ZUZANA', resume: 'NEXT_TURN' }`.
Tím zdarma fungují **zvýrazněné životy, záchrana Pivem i Sidem, guard, klient i bot** —
stejný trik, jaký použila Ruská ruleta. `_afterDamageClicks` se naučí `'NEXT_TURN'`
(vrátí se do `nextTurn`, tedy rovnou na Vendetu).

`_zuzanaDone` se nastaví **hned na začátku** penalizace — stejná past jako u
`_vendettaDone`: bez toho by se `nextTurn` po návratu z kliku zeptal znovu a hráč by
platil pořád dokola. Nuluje se až přechodem na jiného hráče.

**Hrany:**

- **Vězení** — poznámka v pravidlech: netýká se hráče, který tah přeskakuje kvůli Vězení.
  `_applyCheckResult` ve větvi JAIL nastaví `p._turnSkippedByJail = true`; `_zuzanaPenalty`
  ho čte a nuluje.
- **Duch** (Město duchů) má na konci tahu 0 životů a `tryEndTurn` mu je shodí ještě před
  limitem karet → penalizace se ho **netýká** (`isInPlay` ano, ale `health === 0`; zásah
  ducha stejně mine).
- Ztráta života jde přes `handleDamage(idx, null)` → **Bart Cassidy si lízne, El Gringo
  nekrade** (není útočník), a smrt na konci vlastního tahu vede rovnou na `nextTurn`.
- Naplní-li se frontou odložených akcí, dojede se přes `_nextTurnAfterQueue`.

**Klient: žádný text navíc — svítí sama karta Zuzany.** Ve svém tahu vidí hráč **vrchní
kartu na hromádce odkrytých událostí Divokého západu** lehce obarvenou:

| stav | barva |
|---|---|
| zahráno 0–2 karty (penalizace hrozí) | jemně **červená** |
| zahráno 3+ (splněno) | jemně **zelená** |

- Kreslí se to jen **hráči na tahu** a jen jemu (ostatním leží karta neobarvená) — je to
  ukazatel jeho vlastního závazku, ne stav stolu.
- Obarvení je **tint na kartě události**, ne rámeček ani text: stůl už má tři zvýrazňovací
  barvy (tah zeleně, čekání, útok červeně) a čtvrtý křiklavý prvek uprostřed by přebíjel
  všechny. Sytost proto výrazně níž než u `ATTACK_TINT`.
- Sedí to i tam, kde se textový ukazatel nevejde: **kompaktní mobilní profil** nemá u
  tlačítka Ukončit tah místo navíc, kdežto karta události leží v pásmu balíčků vždy.

**Testy:** 2 karty → −1 život; 3 karty → nic; karta zahraná před příchodem Zuzany se
počítá; Vězení = bez penalizace; poslední život + Pivo = záchrana; Lee Van Kliff (opakování
se počítá, zaplacený BANG! ne); **penalizace přijde AŽ po odhozu a PŘED sejmutím Vendety**;
`_zuzanaDone` zabrání druhé penalizaci v tomtéž tahu.

---

### 4.4 Miláček Valentýn (`MILACEK_VALENTYN`)

> Na začátku svého tahu odhodí každý hráč všechny karty z ruky a stejný počet karet si
> dobere z balíčku.

Poznámka v pravidlech: **„Players then also draw the usual 2 cards from the deck"** — výměna
je NAVÍC, běžná fáze lízání proběhne normálně za ní.

Nový **krok krokovače startu tahu** ([logic/highNoon.js](../logic/highNoon.js) `_runBeginTurn`).
Pořadí je pravidlo, takže se do dnešní osmikrokové posloupnosti vloží nové kroky Divokého
západu takhle:

```
0. _deadManReturn        ← Mrtvý muž                              (Fistful)
0b. _boneOrchardReturn   ← Hřbitov: návrat vyřazeného             (Divoký západ)  §4.5
1. _flipEvent            ← odkrytí High Noon + Fistful
2. _applyEventOnEnter    ← okamžitý efekt High Noon
3. _applyFfEventOnEnter  ← okamžitý efekt Fistful
4. _noonDamage           ← Pravé poledne                          (High Noon)
5. _fistfulHits          ← Fistful of Cards                       (Fistful)
6. _newIdentityOffer     ← Nová identita                          (High Noon, přibalené)
7. _startBloodBrothers   ← Pokrevní bratři                        (Fistful)
8. _greygoryOffer        ← Greygory Deck: vyměnit postavy?        (Divoký západ)  §5.8
9. _startValentine       ← Miláček Valentýn: výměna ruky          (Divoký západ)
```

**Hřbitov je krok 0b, hned za Mrtvým mužem** — vyřazený hráč musí být zpátky ve hře dřív,
než na něj cokoli dopadne, a Mrtvý muž má přednost (vrací se s 2 životy a 2 kartami, což
je striktně lepší, a je jednorázový).

**Miláček Valentýn je až úplně poslední, ale pořád PŘED kontrolami na Dynamit/Vězení** —
je to „na začátku svého tahu" a hráč má do sejmutí jít s novou rukou (mohl si vyměnit
Pivo, kterým se před dynamitem zachrání).

`_startValentine()`:

1. prázdná ruka → `return false` (krok se přeskočí),
2. odhodí celou ruku **po jedné, podle pozice ve vějíři** (jako Ranč) — `hand_to_discard`
   jde frontou animací, takže karty odlétají zleva doprava a stav dorazí až za nimi,
3. nastaví klasickou fázi lízání `_setDrawPhase({ cardsNeeded: N, isStartOfTurn: false,
   isValentine: true })` — **náhradní karty si hráč lízne ručně**, klikem na balíček.
   Domíchání balíčku se tím odbaví úplně stejnou cestou jako u kteréhokoli jiného lízání.
4. vrací `true` → start tahu se pozastaví; `_finishDraw` s `isValentine` pokračuje přes
   `_resumeBeginTurn()`.

`isStartOfTurn: false` je nutné: **Želízka ani Ranč se u téhle fáze nesmí ptát** (ty patří
k té skutečné fázi lízání, která přijde až za kontrolami).

**Suzy Lafayette se neprobudí** — prázdnou ruku posuzuje až po dokončení efektu a to už
má karty zpátky (pravidlo „nejdřív doběhne efekt zahrané karty", `_pruneSuzyQueue`).

**Výměna leží PŘED fází 1, ne v žádné z očíslovaných fází.** Fáze 1 je lízání, fáze 2 je
samotný tah (kdy hráč hraje karty), fáze 3 je odhoz nad limit. Valentýn je „na začátku
svého tahu", tedy ještě před fází 1 — a to je přesně důvod, proč se ho **Opuštěný důl
(Fistful) nedotkne ani jednou půlkou**:

- odhoz ruky **není fáze 3** → jde do normálního odhozu, ne lícem dolů na balíček,
- lízání náhrad **není fáze 1** → bere se z dobíracího balíčku, ne z odhozu
  (`_mineDrawCard` se ptá `ds.isStartOfTurn`, které je u Valentýna `false`).

Obojí padne samo z toho, jak je fáze postavená; nic se nekóduje, ale zaslouží si to test —
je to přesně ta hrana, na které se dá `isStartOfTurn` omylem nastavit špatně.

**Testy:** výměna 4 karet; prázdná ruka = no-op; za výměnou proběhne normální lízání 2 karet;
Valentýn × Želízka (barva se volí až po SKUTEČNÉM lízání); Valentýn × Opuštěný důl;
Valentýn × Ranč (Ranč se ptá jednou, až za normálním lízáním).

---

### 4.5 Hřbitov (`HRBITOV`)

> Na začátku svého tahu se všichni vyřazení hráči vrátí do hry s 1 životem.
> Role vyřazených hráčů zamíchejte a rozdejte náhodně.

„Svého" je zvratné a patří k podmětu „všichni vyřazení hráči" → **každý vyřazený se vrací
na začátku SVÉHO tahu**, přesně jako Mrtvý muž. Návrat je **trvalý** (poznámka v pravidlech)
a **opakovatelný** — kdo padne znovu, vrátí se zas (Sciarra Q21).

**Pořadí tahů:** `nextTurn` ([logic.js](../logic.js)) dnes přeskakuje mrtvé, s výjimkou
Města duchů a Mrtvého muže. Přibude třetí výjimka:

```js
const boneOrchard = this.hasEvent('HRBITOV');
…
while (p.health <= 0 && !ghostTown && !boneOrchard && this.currentPlayerIndex !== deadManIdx)
```

Pozor na **pořadí testů**: Mrtvý muž → Hřbitov → duch. Kdo se vrací natrvalo, nesmí
nastoupit jako duch.

**Návrat** (`_boneOrchardReturn`, krok 0b):

1. hráč na tahu je vyřazený a `hasEvent('HRBITOV')` → `health = 1`, `_ghost = false`,
2. **přerozdání rolí** (R2): vezmi role všech hráčů, kteří jsou v tenhle okamžik vyřazení
   (**včetně vracejícího se**), zamíchej je (`deck.shuffleArray`) a rozdej zpátky týmž
   hráčům. Míchá se **jen když jsou aspoň dvě** — s jednou rolí není co míchat,
3. každému, kdo dostal roli, se **zruší `_roleRevealed`**,
4. **reset ledgeru chování** (`initLedger`, [server/ledger.js](../server/ledger.js)):
   dedukce „střílel na šerifa, tedy bandita" se přerozdáním rolí stala nepravdou. Bez
   resetu by bot cílil podle staré mapy,
5. `checkWinCondition()` znovu — návrat mrtvého může výhru **zrušit** i **způsobit**
   (přerozdání změní, kdo je odpadlík),
6. hráč **nedostává karty** (karta o nich nemluví) — lízne si normálně ve své fázi lízání.

**Míchá se na začátku tahu KAŽDÉHO vyřazeného hráče**, dokud zbývají aspoň dvě vyřazené
role. Při pěti vyřazených se tedy zamíchá **čtyřikrát** (při 5, 4, 3 a 2 zbylých rolích;
u poslední už není s čím), pokud mezitím nikdo další nepadne. Není to jednorázová akce
při příchodu karty — to je na téhle kartě to podstatné a musí to zafixovat test.

#### Role po přerozdání: vrácený je vidí, mrtví ne

Přerozdání se **ukáže**, protože jinak by nikdo nepochopil, že se něco stalo:

1. **Sesbírání** — karty rolí vyřazených hráčů odletí ze svých slotů doprostřed stolu,
   cestou se **přetočí na rub** a složí se do hromádky. Recykluje se `animateCardFlip`
   a hromádková vrstva, kterou už umí odkrývání karty události.
2. **Zamíchání** — nad hromádkou se přehraje **stávající riffle cinematika**
   (`core/shuffleAnim.js`, `shuffleDurationMs`) — týž vzorec, kterým se míchají balíčky
   v intru. Server o stejnou dobu drží boty (`room._wwsBlockUntil`).
3. **Rozdání** — karty odletí rubem nahoru zpátky ke svým hráčům.
4. **Vracející se hráč si svou roli prohlédne** — karta mu vyletí doprostřed, otočí se
   **jen jemu** a potvrdí ji tlačítkem **OK**, přesně jako na začátku hry. Recykluje se
   `emitIntroRole` / potvrzení role z intra ([server/intro.js](../server/intro.js)),
   takže je to hotová cesta včetně čekání serveru.
5. **Ostatní vyřazení** roli **neodhalí**. V jejich slotu leží dál karta role, ale
   **`role_card_back` místo líce** — stůl vidí, že roli mají, ne jakou.

Tím se mění dnešní pravidlo „vyřazený hráč má roli odkrytou":

- **`redactState`** ([server/rooms.js](../server/rooms.js)) — role vyřazeného je veřejná
  jen dokud platí `_roleRevealed`; po přerozdání ho ztratí a role se skryje. Dnes se
  redakce ptá i na `health <= 0`, což by ji propustilo — **tahle podmínka musí ustoupit
  `_roleRevealed`**, jinak by přerozdání neuteklo klientovi ani serveru.
- **`_roleSlot`** ([view/board.js](../view/board.js)) a zrcadlící **`hasRoleCard`/`displayIdx`**
  ([positions.js](../positions.js)) — slot **zůstává obsazený** (karta tam leží dál),
  mění se jen textura na `role_card_back`. **Obojí se musí měnit spolu**, jinak animace
  míří o kartu vedle; půdorys se naštěstí nemění vůbec, protože karta ze slotu nemizí.
- Fallback při neznámé roli už dnes **je rub** (`role_card_back`), takže se klient nemá
  jak splést.

**Vulture Sam, Greg Digger, Herb Hunter** se spustili už při původním vyřazení; návrat
nespouští nic.

**Odměna 3 karet za banditu platí i za opakovaně zabitého banditu** — nic se nekóduje,
je to důsledek. (Recenze to považuje za nevyváženost karty; není to naše chyba.)

**Testy:** návrat s 1 životem na svém tahu; dva mrtví → vrací se každý na svém tahu;
přerozdání zamíchá **jen role vyřazených**; **5 vyřazených = 4 zamíchání** (a u poslední
role se nemíchá); `_roleRevealed` se ruší; **redakce po přerozdání roli mrtvého skrývá**
a jeho slot drží rub; vrácený hráč roli potvrzuje jako v intru; Hřbitov × Město duchů
(natrvalo, ne duch); Hřbitov × Mrtvý muž (2 životy a 2 karty vyhrávají); opakovaný návrat
po druhém vyřazení; výhra se přepočítá.

---

### 4.6 Helena Zontero (`HELENA_ZONTERO`)

> Když přijde Helena do hry, otočte vrchní kartu z dobíracího balíčku: jsou-li to srdce ♥
> nebo káry ♦, zamíchejte všechny aktivní role s výjimkou Šerifa a znovu je náhodně
> a tajně rozdejte. Každý hráč se podívá na svou novou roli.

Jediná událost s **okamžitým efektem při příchodu** → `_applyWwsEventOnEnter`.

- Karta se otočí, ukáže, a jde do odhozu. Barva se čte přes **`_effSuit`** (Požehnání /
  Prokletí platí i tady — pod Požehnáním sedne vždycky, pod Prokletím nikdy).
- **Lucky Duke ani John Pain se neuplatní** (R3, FAQ Q09) — karta se otáčí automaticky,
  ne hráčem. Proto se **nesmí** použít cesta `pendingCheckDraw` (ta Lucky Duka veze
  zdarma); je to vlastní jednorázové otočení s vlastní animací `wws_helena_reveal`
  (tělo sdílené s `startDeckCardReveal` u Peyote, s pulzující markou barvy).
- **Červená** → přerozdání:
  - „aktivní role" = hráči **ve hře** (`isInPlay`, tedy i duch) **kromě šerifa**,
  - role se zamíchají a rozdají zpátky týmž hráčům,
  - `_roleRevealed` se ruší každému, kdo roli dostal (týká se vráceného Mrtvého muže),
  - `initLedger` reset (týž důvod jako u Hřbitova),
  - `checkWinCondition()` znovu.
- **Hra pro 3 (Město duchů):** šerif u stolu není, takže se míchají všechny tři role.
  Leží lícem nahoru → přerozdají se **veřejně** (redakce je v `mode3p` propouští dál)
  a `_winClaim3p` se **zruší**: nárok „vyřadil jsem osobně svého určeného nepřítele" je
  po výměně cílů bezpředmětný.
- **Maximum životů se nemění** — šerif si roli drží, a všechny ostatní role mají stejný
  základ (`healthForCharacter`). Kdyby se šerif míchal, musel by se přepočítat `maxHealth`;
  proto je z výměny vyňatý i v kódu, ne jen v textu.
- Klient: **každý hráč se podívá na svou novou roli** → cinematika „karta role přiletí,
  otočí se jen mně, vrátí se" (recyklace `startNewIdentityReveal`).

**Testy:** ♥ přerozdá, ♠ ne; šerif si roli drží; Prokletí = nikdy; Požehnání = vždy;
role vyřazených se nemíchají; John Pain si kartu nebere; Lucky Duke nevybírá; ledger reset;
3P varianta; výhra se přepočítá.

---

### 4.7 Lady Růže z Texasu (`LADY_RUZE_Z_TEXASU`)

> Během svého tahu si může každý hráč vyměnit místo s hráčem po své pravici a ten tak
> přeskočí svůj nejbližší tah.

Nepovinná akce ve fázi `PLAY`. **Počet použití karta neomezuje**, opakovat jde i v jednom
tahu — strop je podle FAQ Q08 **x použití ZA SEBOU, kde x = počet žijících hráčů** (R4).

„Za sebou" znamená bez tahu, ve kterém kartu nikdo nepoužil. Drží to `_roseStreak`:
každé použití ho zvýší, a `nextTurn` ho **vynuluje**, když v končícím tahu nikdo místo
neměnil. Strop se počítá ze **žijících** hráčů (`health > 0`), takže s ubývajícím stolem
klesá. Je to jediná pojistka proti smyčce, ve které jeden hráč nikdy nepřijde na tah —
proto ji hlídá i test, ne jen UI.

**„Po pravici" = předchozí hráč po směru hodinových ručiček**, tedy `(i - 1 + n) % n` —
**bez ohledu na Zlatou horečku**. Je to efekt karty, a ty jdou v tomhle projektu vždycky
po směru (FAQ H3, stejné pravidlo jako Daltonové, posun dynamitu a hokynářství).

Jádrem je jediný trychtýř `_swapSeats(i, j)`, protože **sedadlo je v tomhle kódu index**
a spousta stavu je indexy klíčovaná. Prohodí se prvky pole `players` (tím se přenese ruka,
stůl, zbraň, role, postava, životy i statistiky) a pak se **přemapují všechny indexy**:

| pole | kde |
|---|---|
| `currentPlayerIndex` | `logic.js` |
| `storePickerIndex` | `logic.js` |
| `_firstDeadIdx` | Mrtvý muž |
| `pendingResponse.{originatorIdx,targetIdx,initialTargetIdx,responded[]}` | response |
| `pendingSelection.{attackerIdx,targetIdx}` | play |
| `pendingDiscardAnother.{playerIdx,targetIdx}` | dodgeCity |
| `pendingBarrelCheck.{targetIdx,attackerIdx}`, `currentCheck.playerIdx` | checks |
| `pendingCheckDraw.playerIdx`, `pendingDynamiteDamage.playerIdx` | checks/combat |
| `daltonsQueue[]`, `brawlQueue[]`, `brawlAttackerIdx` | highNoon/dodgeCity |
| `pendingRoulette.playerIdx`, `pendingBlood.*`, `pendingVultureSplit.*` | fistful/characters |
| `_deathAnimData{}`, `_deathAnimPlayerIdx` | combat |
| `room.behaviorLedger` | server/ledger.js |

**Pojistka proti tomu, aby se na některé zapomnělo:** akce je povolená **jen ve fázi
`PLAY` bez rozdělaného efektu** (`pendingActor(gs).kind === 'PLAY'`), takže je většina
těch polí prokazatelně prázdná. Zbytek (`_firstDeadIdx`, `_deathAnimData`, ledger)
se přemapuje a **strukturální test** projde `GameState` a ohlásí každé pole, jehož jméno
končí na `Idx`/`Index` a které `_swapSeats` nezná.

Dál:

- `currentPlayerIndex = j` (hráč si nese tah do nového sedadla),
- prohozený hráč dostane `_skipNextTurn = true`; `nextTurn` ho **jednou** přeskočí a příznak
  zruší. Přeskočení je „jako by tam neseděl": žádný start tahu, žádné sejmutí na Dynamit
  ani Vězení, **a žádná penalizace Madam Zuzany** (nehrál, ale ani nesměl).
- **Vzdálenosti se změní samy** — `computeDistance` počítá ze sedadel.
- **Klient:** nová animace `wws_seat_swap` — oba bloky (karta životů + portrét + jmenovka
  + vějíř + vyložené karty) si prohodí kotvy po oblouku. Kotvy dává `getOpponentAnchors`,
  takže se animuje z jedné kotvy do druhé; po dojezdu překreslí deska. **Vyžaduje ověření
  v prohlížeči** (render se automaticky otestovat nedá).
- Klientské cache klíčované indexem (`App.healthAnims`, `App.deathSeq`, `App.veraPortraits`,
  `App.attackPulse`, `App.vultureSplitIdx`) se při výměně **vynulují** — přemapovat je
  nemá cenu, staví se od nuly při každém renderu desky.
- **UI:** tlačítko „🔄 LADY RŮŽE: vyměnit místo" ve slotu schopností (stejná dohoda jako
  Odstřelovač / Uncle Will — po dobu nabídky se Sid/Chuck/José/Doc/Will nekreslí).
- **Bot:** vymění se, jen když je hráč po jeho pravici pravděpodobný nepřítel
  (`enemyProbability`), a **nejvýš jednou za svůj tah** — strop `_roseStreak` je pravidlo
  pro hráče, ne rozumná politika pro bota. Bez tohohle vlastního omezení by bot vyčerpal
  celý strop v jednom tahu a hra jen botů by se zvrhla v přesedávání.

**Testy:** výměna prohodí ruce i stoly; prohozený přeskočí právě jeden tah; vzdálenosti
sedí po výměně; **strop `x` použití za sebou platí a `nextTurn` bez použití ho nuluje**;
strop klesá s ubývajícími hráči; Zlatá horečka směr „po pravici" nemění; přeskočený hráč
nedostane penalizaci Zuzany; strukturální test na indexová pole.

---

### 4.8 Zuřivá Doroty (`ZURIVA_DOROTY`)

> Hráč na tahu může jmenovat kartu a vybrat hráče, který ji musí zahrát (pokud ji má).

Poznámka v pravidlech: *„Nemá-li poručený hráč jmenovanou kartu, musí ukázat ruku.
Má-li ji, musí ji zahrát, jako by byl na tahu (i pro počítání vzdáleností), ale cíl(e)
vybíráš ty."* FAQ Q05: **všechno se počítá podle poručeného** (poručíš-li Slabovi
vystřelit, cíl potřebuje 2× Vedle!). FAQ Q06: **poručený** ztrácí život v duelu
a **poručený** si líže karty za Dostavník/Paniku.

**Nejrizikovější karta rozšíření** — dělá se poslední.

**Průběh:**

1. Tlačítko „🎭 DOROTY: porouč kartu" (slot schopností) → fáze `DOROTHY_NAME`.
   Nabídka: **jen karty, které jde v tahu zahrát** — staví se z dat balíčku
   (`_deckDataFor`) a filtruje přes `cardPlayability`. `Vedle!` a `Úhyb` v ní nejsou
   (ve vlastním tahu je zahrát nelze), pokud zrovna neplatí Zúčtování.

   **Vybírá se z ARTŮ karet, ne ze seznamu jmen.** Přes desku se rozloží mřížka
   skutečných karet — jedna za každý druh — a hráč na jednu klikne; ta se vysune
   a zvětší jako karta v ruce. Textury `card_<id>` už jsou zapečené pro **každou** kartu
   (`buildCardTextures`), takže se nic nekreslí zvlášť: pro každý druh se vezme
   **první id z dat** jako reprezentant. Seznam jmen by u hry, která je celá o obrázcích
   karet, byl cizí prvek — a hráč hledá „tu s dynamitem", ne řetězec.

   Mřížka je **překryvné okno přes desku** (vzor `renderVeraCopyOverlay` /
   `renderHandcuffsOverlay` ve [view/screens.js](../view/screens.js)), takže se rozložení
   stolu nemusí nijak posouvat. Se zapnutým Dodge City je druhů kolem 30 → mřížka se
   škáluje podle počtu (stejný princip jako rozteč v Clausově řadě) a na mobilu se
   scrolluje.
2. Klik na postavu soupeře → fáze `DOROTHY_TARGET` nebo rovnou vyhodnocení.
   Server ověří, že **akce je pro toho hráče proveditelná** (FAQ Q04): karta jde z jeho
   ruky zahrát a existuje pro ni legální cíl **z jeho pozice**. Nejde-li to, akci odmítne
   a klient ji ani nenabídne (`dorothyOffer` v `core/playability.js` — sdílený helper pro
   server, klienta i bota).
3. **Nemá kartu** → jeho ruka se **veřejně ukáže** (`_dorothyReveal = { playerIdx }`,
   redakce ji na tu dobu propustí, klient přehraje „vějíř se otočí lícem, vydrží, otočí
   zpět"). Tah pokračuje.
4. **Má kartu** → cíl vybírá **poručující** (R5), ze seznamu legálních cílů poručeného,
   který posílá server (`pendingDorothy.targets`) — stejná dohoda jako u Pokrevních bratrů,
   aby se klient s pravidly nemohl rozejít.
5. **Zahrání** — „vypůjčený tah":
   ```
   _dorothyOwnerIdx = currentPlayerIndex;
   currentPlayerIndex = commandedIdx;
   …běžná cesta playCard / playBang / playSpecialCard…
   ```
   Efekt tím jede **beze změny** — a s ním i Q05 (vzdálenosti, Slab, Apache Kid) a Q06
   (duel prohraje poručený, karty líže poručený).
   Návrat sedadla řeší nový příznak z rodiny „resume": **`_dorothyRestoreAfterQueue`**.
   Vrací se v okamžiku, kdy je fáze zpátky `PLAY` a fronta odložených akcí prázdná —
   tedy stejný test, jaký používá `_resumeAfterSpecial`.
6. Dokud je sedadlo vypůjčené, **`tryEndTurn` je zamčené** (`_dorothyOwnerIdx !== null`) —
   jinak by poručený ukončil cizí tah.

**Hrany:**

- **Nejvýš `x` poručení za tah, kde `x` = počet žijících hráčů** (R4) — `_dorothyUsed`
  se nuluje s tahem. Karta sama počet neomezuje a FAQ Q08 mluví o Lady Růži, ale **strop
  tu není kosmetika**: neúspěšné poručení (cíl kartu nemá → jen ukáže ruku) **nemění stav**,
  takže by ho bot poslal donekonečna a hra jen botů by zamrzla. Přesně ta třída chyby,
  kterou hlídá invariant „bot se nikdy nezasekne".
  K tomu druhá pojistka: **tutéž dvojici (jméno karty, poručený) nelze v jednom tahu
  poručit dvakrát** — podruhé už se nic nedozvíš a nic se nestane.
- Poručená karta se počítá do **limitu 1× Bang!/tah poručeného** (hraje ji on), do
  **Madam Zuzany poručenému** a spouští **Johnnyho Kische** i **Divoký západ**
  (Dostavník poručený jako karta = nová událost; není to opakování efektu).
- Poručený **nesmí být sám poručující** (karta říká „vybrat hráče", tedy jiného).
- Duch (Město duchů) je ve hře → poručit mu jde.
- **Právo západu** (Fistful): drží-li poručující vynucenou kartu, `_lawLocked` mu Dorotu
  zakáže (je to „něco jiného než zahrát vynucenou kartu"). Drží-li ji **poručený**,
  poručená karta ho z povinnosti neosvobodí.
- **Bot:** nová větev `DOROTHY_NAME`/`DOROTHY_TARGET` v `decideBotAction` (hlídá to
  strukturální test „každý kind z pendingActor má svou větev"). Volí nejcennější poručení
  = Bang! na svého nepřítele z ruky nepřítele.

**Testy:** poručený Bang! podle vzdálenosti poručeného; Slab jako poručený vyžaduje 2×
Vedle!; poručující Slab ne; duel prohraje poručený; Dostavník líže poručený; nemá kartu →
ukáže ruku; akce bez legálního cíle se nenabídne; sedadlo se vrátí i když efekt přeruší
Bart Cassidy; `tryEndTurn` je po dobu vypůjčky zamčené; **strop `x` poručení za tah**;
tatáž dvojice (karta, hráč) podruhé neprojde.

---

### 4.9 Roubík (`ROUBIK`)

> Hráči nesmí mluvit (mohou gestikulovat, sténat atd.). Každý kdo promluví, ztrácí 1 život.

U stolu to vynutit nejde, ve hře **s chatem** ano. Rozhodnuto: **odeslání zprávy do chatu
stojí 1 život, dokud Roubík platí.**

- Hák v chat handleru ([server/handlers.lobby.js](../server/handlers.lobby.js)): odesílatel
  je hráčem téhle hry a je ve hře → zapiš penalizaci.
- **Zpráva se nezahazuje** — projde normálně. Karta mluvení zakazuje pod pokutou, ne úplně.
- **Žádné varování ani potvrzování.** Karta leží odkrytá na stole a je na hráči, aby
  věděl, co platí — přesně jako u každé jiné události. Potvrzovací okno by z vtipu
  udělalo formulář.
- **Penalizace je odložená, ne okamžitá.** Chat přichází asynchronně a může trefit
  libovolnou fázi (RESPOND, míchání, cinematiku vyřazení). Zásah uprostřed by rozbil
  rozdělaný efekt. Proto:
  ```
  _gagPending.push(playerIdx)     // fronta seatů čekajících na pokutu
  ```
  a vyprázdní se **na nejbližším klidném místě** — v `_processSpecialQueue` (na jeho konci,
  když se nic nerozeběhlo) a v `nextTurn`. Zásah pak jde přes `handleDamage(idx, null)`
  → Bart Cassidy si lízne, El Gringo nekrade.
- **Divák** o nic nepřijde (není hráč), **bot ano** — viz níž.
- Mrtvý hráč (i duch mimo svůj tah) o nic nepřijde.

#### Hlášky botů (samostatná funkce, ne jen kvůli Roubíku)

Boti dnes do chatu nepíšou vůbec, takže by je Roubík nikdy netrefil. Přibude proto
**obecná schopnost botů občas něco prohodit** — je to hodnota sama o sobě (stůl plný
botů je dnes němý) a zároveň dá Roubíku šanci zafungovat i na ně.

- **Čistá logika v `core/botChat.js`** (izomorfní, testovatelná bez serveru):
  `botQuip(event, state, botIdx, rng) → string | null`. Server ji volá z háku
  `beforeBroadcast` ([server/bots.js](../server/bots.js)) nad událostmi, které stejně
  už zná.
- **Na co reagují** (spouštěč = herní událost, ne časovač): schytal víc zásahů naráz,
  spadl na 1 život, někdo ho vyléčil, sebral někomu kartu, někoho vyřadil, vybuchl mu
  dynamit, dostal Vězení.
- **Jak často:** malá pravděpodobnost na událost **a** strop „nejvýš jedna hláška za
  N tahů na bota" (`_quipCooldownTurn`). Cílem je, aby to bylo koření, ne ukecaný stůl —
  a aby se hlášky nezvrhly ve spam v zátěžových testech, kde běží tisíce partií.
- **Pod Roubíkem hláška stojí život jako komukoli jinému** — jde stejnou cestou
  (`_gagPending`), žádná výjimka.
- **Jedna pojistka:** bot **na 1 životě pod Roubíkem mlčí**. Je to politika bota, ne
  pravidlo — sebevražda hláškou vypadá jako chyba hry, ne jako vtip. Kdyby to mělo být
  jinak, je to jednořádková změna v `botQuip`.
- Hlášky jsou **česky** a krátké; sada je data, ne kód (pole vět na spouštěč), takže se
  dá rozšiřovat bez zásahu do logiky.

**Testy:** zpráva pod Roubíkem = −1 život; bez Roubíku nic; divák nic; penalizace se
nevyhodnotí uprostřed fáze RESPOND, ale až po ní; smrt z penalizace posune tah;
`botQuip` respektuje cooldown; bot na 1 životě pod Roubíkem mlčí; **hra jen botů
s balíčkem samých Roubíků doběhne** (a nikdo se neupovídá k smrti).

---

### 4.10 Divoký západ (`DIVOKY_ZAPAD`) — karta vespod

> Cílem každého hráče se stává: „Zůstaň poslední ve hře!"

Poznámka v pravidlech: *role zůstávají v platnosti* — šerif nesmí do vězení, za banditu
je pořád odměna 3 karet a **šerifova pokuta za pomocníka platí taky** (FAQ Q15). Smrt
šerifa hru **nekončí**. Výhra je individuální.

- `_setupWwsDeck` ji dává na index 0 → líže se přes `pop()` z konce, takže přijde poslední
  a **nevyměňuje se** (přesně jako Pravé poledne a Fistful of Cards).
- `evaluateWinner(players, opts)` dostane `opts.lastManStanding`:
  ```js
  if (opts.lastManStanding) {
      const alive = players.filter(p => p.health > 0 || p._ghost);
      return alive.length === 1 ? `${alive[0].name} vyhrál!` : null;
  }
  ```
  Vrací se **jméno hráče**, ne role — to je nová podoba vítěze a musí ji unést i výherní
  obrazovka (`renderWinnerScreen` ve [view/screens.js](../view/screens.js)) a statistiky.
- `checkWinCondition` předá `lastManStanding: this.hasEvent('DIVOKY_ZAPAD')`.
- **Hra pro 3** (`mode3p`): Divoký západ **ruší nárok** `_winClaim3p` (cíle v kruhu
  přestávají platit) a přepne na „poslední živý". Prakticky je to v `evaluateWinner`
  jedna větev navíc **před** `if (opts.mode3p)`.
- **Šerif smí umřít a hra běží dál** → v `handlePlayerDeath` se nesmí vyhodnotit konec.
  Padne to samo, protože rozhoduje `evaluateWinner`; ale ověřit testem.
- Pokuta za pomocníka a odměna za banditu zůstávají **beze změny** (FAQ Q15) — nic se
  nekóduje, jen se to testem zafixuje.
- Bot: `roleHostility` dostane větev „každý je nepřítel" (jako `mode3p`, ale bez kruhu) —
  bez ní by boti v koncovce jen lízali a odhazovali, protože spojenec podle role není
  nepřítel. Stejná past, jakou už jednou vyřešilo `DESPERATE_ENEMY_P`.

**Testy:** poslední živý vyhrává bez ohledu na roli; smrt šerifa hru neukončí; pokuta za
pomocníka platí; odměna za banditu platí; karta se neodkrývá pryč dalším Dostavníkem;
3P varianta; hra jen botů s balíčkem samých Divokých západů doběhne.

---

## 5. Postavy — implementace po jedné

Životy do `core/roles.js`. Dnešní `LOW_HEALTH_CHARS` (seznam tříživotových) přestává stačit,
protože přibývají 5 a 9 → **nahradí ho mapa** s výchozí hodnotou 4:

```js
const CHAR_HEALTH = { /* 3 */ "Paul Regret": 3, …, "Teren Kill": 3,
                      /* 5 */ "Gary Looter": 5,
                      /* 9 */ "Big Spencer": 9 };
function baseHealthForCharacter(n) { return CHAR_HEALTH[n] || 4; }
```

`LOW_HEALTH_CHARS` zůstane exportovaný jako odvozený seznam, aby se nerozbily testy,
které se na něj ptají.

### 5.1 Big Spencer — 9 životů (asset 034)

> Začíná s 5 kartami. Nemůže hrát karty Vedle!.

- **Startovní ruka je 5, ne 9.** `selectCharacter` ([logic/setup.js](../logic/setup.js))
  dnes bere `startCards = pl._baseHealth`. Přibude `_startCards`:
  ```js
  pl._startCards = startCardsForCharacter(pl.character, pl._baseHealth);   // Big Spencer 5
  ```
  a **stejné pole musí číst intro** — [server/intro.js](../server/intro.js) `:303` dnes
  rozdává `_baseHealth ?? maxHealth ?? 4`. Bez toho by animace rozdala 9 karet a stav
  by pak ukázal 5.
- **Nesmí hrát karty Vedle!** — jediný dotaz `bigSpencerBlocked(me)` uvnitř `playsAsMissed`
  (§4.1), takže se ptají server, klient i bot jedním helperem.
  - **Barel a Jourdonnais fungují** (FAQ Q07) — nejsou to karty Vedle!.
  - **Zelené Vedle! ze stolu fungují** (Železný plát / Sombrero / Bible) — schopnost mluví
    o kartách Vedle!, tyhle mají vlastní typ.
  - **Úhyb funguje** — je to jiná karta.
  - **Pod Zúčtováním smí hrát kartu BANG! jako Vedle!** (R9).
  - **Ruská ruleta:** odhodit kartu Vedle! smí (odhoz není zahrání) — proto je zákaz
    v `playsAsMissed`, ne v `rouletteDiscardable`.
- **Limit karet v ruce = životy** → až 9 (10 jako šerif, Sciarra Q9).
- **Render:** druhá karta životů (§7). Bez ní je postava nepoužitelná, takže §7 jde
  ve stejné fázi.

### 5.2 Gary Looter — 5 životů (asset 036)

> Bere si všechny karty, které ostatní hráči odhodí nad limit na konci svého tahu.

- Hák v `discardCard` ([logic.js](../logic.js)), fáze `DISCARD`:
  ```js
  const looter = this._garyLooterFor(this.currentPlayerIndex);   // null = nikdo
  if (looter !== null) looter.hand.push(card);
  else this._mineDiscardEndTurn(card);
  ```
- **Své vlastní karty si nebere** (FAQ Q14) — `_garyLooterFor` vrací null, když by
  odhazujícím byl on sám.
- **Víc Gary Looterů** (Vera Custer): první po směru od odhazujícího (R6).
- **Opuštěný důl** (Fistful): Gary vyhrává, karta se na balíček nedostane (R7).
- Odhoz mimo konec tahu (Ruská ruleta, cena „odhoď další kartu", Daltonové, Sid Ketchum)
  se ho **netýká** — schopnost mluví o odhozu nad limit na konci tahu.
- **Molly Stark** je zrcadlový případ, ale nekoliduje: ona líže za **své** karty odhozené
  mimo svůj tah, Gary bere **cizí** odhoz na konci cizího tahu.
- **Suzy Lafayette**: odhazující si vyprázdní ruku → lízne si (fronta), Gary má karty.
- Animace: `hand_to_discard` se nahradí letem do Garyho ruky (soukromě, jako `ragtime_steal`
  — ostatní vidí rub, Gary líc; pod Sacagaway všichni líc).

### 5.3 John Pain — 4 životy (asset 038)

> Má-li v ruce méně než 6 karet, bere si každou kartu, kterou kdokoli sejme.

- Hák **na konci vyhodnocení sejmutí** (`_applyCheckResult` a `resolveCheck`,
  [logic/checks.js](../logic/checks.js)): karta už je v odhozu (`deck.discard(checkCard)`
  proběhl při líznutí a `check.card` se jí ptá na hodnotu), takže se vytáhne zpět
  `deck.takeFromDiscard(card.id)` a dá do ruky.
- **Až po dokončení efektu** (poznámka v pravidlech: „nesmíš ji použít okamžitě") →
  jde to do `specialActionQueue` jako `{ type: 'JOHN_PAIN_TAKE', playerIdx, cardId }`.
  Tím je splněné i „když je to Pivo a zároveň ztrácíš poslední život, nesmíš ho zahrát".
- Které sejmutí: **Dynamit, Vězení, Barel, Jourdonnais, Lucky Duke, Vendeta (Fistful),
  barel v Ruské ruletě.** Ne Peyote (to není sejmutí, ale fáze lízání) a **ne Helena
  Zontero** (FAQ Q09, R3).
- **Lucky Duke líže 2 karty → John Pain bere obě** (Sciarra Q22). Má-li 5 karet, bere
  **jen tu první** v pořadí snímání (nevybírá si). Prakticky: fronta se plní po jedné
  a před každým odbavením se znovu ptá `hand.length < 6`.
- **Bere i své vlastní sejmutí** („kdokoli").
- **Víc Johnů Painů** (Vera Custer, Greygory Deck): bere **první po směru od toho, kdo
  snímal** (oficiální FAQ Q11).
- Přes `hasAbility` to platí i pro Greygoryho Decka.

### 5.4 Youl Grinner — 4 životy (asset 041)

> Než si začne líznout, musí mu každý hráč, který má v ruce víc karet než on, dát
> jednu kartu podle své volby.

- Spouští se **na začátku jeho fáze lízání** (FAQ Q26), tedy v `startDrawPhase`
  ([logic/draw.js](../logic/draw.js)) **úplně první** — ještě před Peyote, které jinak
  přebíjí všechny postavy s vlastním lízáním.
- Nová fáze **`GRINNER_GIVE`** + `pendingGrinner = { grinnerIdx, queue: [...], targets }`.
  Fronta = hráči po směru od Youla, kteří mají v ruce **víc karet než on**; množina se
  **určí jednou, snímkem** (R8, FAQ Q03 „každý z těch hráčů").
- Každý ve frontě klikne na kartu ve své ruce → letí Youlovi (`ragtime_steal`, soukromě).
- `pendingActor` kind `GRINNER_GIVE` → nutná **větev bota**, **záznam v guardu**
  a **štítek** ve `_WAIT_LABELS` („Youl Grinner – dává kartu"). Bez nich se hra jen botů
  zasekne (invariant „bot se nikdy nezasekne").
- Prázdná fronta → fáze se nezaloží vůbec a lízání jede normálně.
- **Suzy Lafayette**, která dá poslední kartu, si lízne (fronta odložených akcí) —
  a kolečko se posune až po ní, stejný příznak jako `_advanceRouletteAfterQueue`.
- **Duch** (Město duchů) na svém tahu schopnost používá; **mrtví nedávají**.
- Youl v Vězení tah přeskočí → k fázi lízání nedojde → nikdo nedává.

### 5.5 Teren Kill — 3 životy (asset 040)

> Pokaždé, když by měl být vyřazen, sejme kartu: není-li to pik, zůstává na 1 životě
> a lízne si kartu.

- Hák **na začátku `handlePlayerDeath`** ([logic/combat.js](../logic/combat.js)) — je to
  jediný trychtýř vyřazení a **umí se pozastavit** (dělá to už dělení karet mezi víc
  Vulture Samů, takže je ta cesta prošlapaná).
- Sejmutí jde existující cestou `pendingCheckDraw.reason = 'TEREN_KILL'` →
  `CHECK_DRAW → CHECKING → _applyCheckResult`. Zdarma se tím veze **Lucky Duke**,
  klientská cinematika odkrytí i větev bota — přesně jako u Vendety.
- Výsledek přes `_effSuit`:
  - **♠** → hráč je opravdu vyřazen; pokračuje se do původního `handlePlayerDeath`
    (Vulture Sam, odměna za banditu, pokuta za pomocníka, animace).
  - jinak → `health = 1` a **lízne si 1 kartu** (klikací líznutí ve frontě odložených akcí,
    stejný vzor jako odměna za zabití).
- **Pivo / Sid Ketchum** (FAQ Q18): hráč má na výběr, ale ne obojí.
  - Zahraje Pivo → zůstává na 1 životě a **nelíže si kartu** (sejmutí neproběhne).
  - Nezahraje a sejme → při ♠ je vyřazen a **Pivo už zahrát nesmí**.
  Prakticky: ve fázi `CHECK_DRAW` s `reason: 'TEREN_KILL'` je Pivo/Sid pořád nabídnuté
  (klient je zvýrazní), ale **klik na balíček volbu uzavře** — a `beerLastLifeSave`
  s `_terenChecked === true` vrátí `false`.
- **Dynamit** (FAQ Q12): snímá se **jednou**, ne třikrát. `takeDynamiteHit` proto smí
  Terena poslat na kontrolu jen při prvním smrtelném zásahu; zbytek zásahů se zahodí.
- **Duch** (Město duchů) umřít nemůže → kontrola se nespouští.
- **Fistful of Cards** (série zásahů): smrt uprostřed série zbytek zahodí; Teren, který
  přežil, sérii dohraje.

### 5.6 Lee Van Kliff — 4 životy (asset 039)

> Během svého tahu smí odhodit kartu BANG! a zopakovat efekt hnědé karty, kterou právě
> zahrál.

- Nová paměť `_lastBrown = { cardId, type, name, suit, repeated: false }`, nastavovaná
  na všech cestách hnědé karty: `playCard`, `playBang`, `playSpecialCard`, `startDiscardExtra`.
  Nuluje se na začátku tahu.
- **Hnědá = všechno kromě modrých a zelených** — dotaz jde přes `isBlueCard`
  ([core/cardRules.js](../core/cardRules.js)) a `card.green`, tedy přes existující
  jediný zdroj pravdy.
- **Každý efekt jen jednou** (poznámka v pravidlech) → `repeated`.
- **Cena se neplatí znovu** (Sciarra Q29): Rvačka, Ragtime i Whisky se opakují bez druhé
  odhozené karty — opakuje se efekt, ne aktivace.
- **Cíl smí být jiný** (FAQ Q13).
- **Aktivuje ji jen skutečná karta BANG!** (Sciarra Q23), ne karta s bang-efektem
  (Úder, Nůž, Derringer). Dotaz jde přes `bangCardFromHand` → pod Zúčtováním tedy
  libovolná karta (poznámka v pravidlech).
- **Apache Kid**: rozhoduje barva **původní hnědé karty**, ne odhozené BANG! (Sciarra Q12).
  Proto se `_lastBrown.suit` pamatuje zvlášť.
- **Nepočítá se do limitu 1× Bang!/tah** (odhozený BANG! není zahraný; opakovaný efekt
  taky ne) — stejný výklad jako u Odstřelovače (FAQ Q07 Fistfulu).
- **Madam Zuzana**: opakování se počítá jako zahraná karta, zaplacený BANG! ne (Q24).
- **Dostavník / Wells Fargo**: opakování **nemění kartu Divokého západu** (Q19) →
  `_flipWwsEvent(idx, { repeat: true })` se nespustí.
- **UI:** tlačítko „🔁 LEE VAN KLIFF: zopakovat <jméno karty>" ve slotu schopností, pak
  výběr karty BANG! v ruce (ostatní zašedlé) a nakonec cíl.

### 5.7 Flint Westwood — 4 životy (asset 035)

> Během svého tahu smí vyměnit 1 kartu z ruky za 2 náhodné karty z ruky jiného hráče.

- **Jednou za tah** (FAQ Q16) — `_flintUsedTurn === turnId`.
- Svou kartu **vybírá**, cizí jsou **náhodné** (poznámka v pravidlech).
- Cíl musí mít **aspoň 1 kartu** (Sciarra Q33); má-li jen jednu, dostane Flint jen jednu.
- **Dostřel neplatí** — karta o vzdálenosti nemluví, takže kterýkoli hráč ve hře.
- Pořadí operací kvůli **Suzy Lafayette** (Sciarra Q32): nejdřív se **vezmou** cizí karty,
  pak se **dá** Flintova, a teprve pak se posoudí prázdná ruka — Suzy si tak lízne
  a Flint tu líznutou kartu **nedostane**.
- UI: tlačítko „🤝 FLINT: vyměnit" → klik na postavu → výběr vlastní karty.
- Animace: dvě `ragtime_steal` (k Flintovi) + jedna zpět; pod Sacagaway veřejně.

### 5.8 Greygory Deck — 4 životy (asset 037)

> Na začátku svého tahu si smí líznout 2 postavy náhodně. Má všechny jejich schopnosti.

Viz **§6 (refaktor `hasAbility`)** — bez něj se to udělat nedá.

- **Jen postavy základní hry** (`ALL_CHARACTERS`, 16) — poznámka v pravidlech i FAQ Q30.
- **A jen ty, jejichž karta je fyzicky volná (R12).** Líže se ze skutečného balíčku
  postav, takže z 16 základních vypadnou ty, které někdo drží:
  - kdokoli je **hraje** (`p.character`),
  - kdokoli je má **jako počítadlo životů** — odložená identita z Nové identity
    (`p._secondChar`); rub karty postavy JE ta karta životů, viz „Nová identita" v CLAUDE.md,
  - kdokoli je právě **drží jako Greygory** (`p._greygoryChars`) — druhý Greygory u stolu
    nebo Vera, která ho kopíruje.

  Vlastní dvojice se do poolu **vrací** (FAQ Q01: zamíchat všechny a líznout dvě, klidně
  zas ty odložené), takže se odečítá pool ostatních, ne svůj.

  `_greygoryPool(selfIdx)` je jediný zdroj pravdy a **smí vrátit míň než 2**. Když nezbude
  nic, hráč tenhle tah **nemá žádnou schopnost** — „smůla" je legální stav, ne chyba.
  Zvlášť u 8 hráčů s Novou identitou to nastat může a nesmí to nic zaseknout: nabídka
  „nechat / vyměnit" se pak nedává vůbec a `abilitiesOf` vrátí prázdné pole.
  **Nabídnout výměnu, po které by hráč zůstal s ničím, je past** — proto je v nabídce
  vidět, kolik karet je volných, a při nule se nenabízí.
- **První dvojici dostane hned na začátku hry** („This ability also applies at the
  beginning of the game") → `selectCharacter` mu je přidělí spolu se startovní rukou.
- Na začátku každého dalšího tahu **nabídka** (krok 8 krokovače): nechat, nebo **vyměnit
  obě** (nelze jen jednu). Při výměně se předchozí **zamíchají zpátky** a může je líznout
  znovu (FAQ Q01).
- Fáze `GREYGORY_OFFER` + `pendingGreygory` → `pendingActor` kind, větev bota, guard, štítek.
- **Konflikt schopností** (Sciarra Q31): schopnosti se **kombinují**, kdykoli to jde.
  Prakticky se to týká jen fáze lízání a řeší to už dnešní `_drawOptionsBase`, které vrací
  **seznam možností**:
  - Jesse Jones + Pedro Ramirez → nabídnou se obě možnosti („z ruky" i „z odhozu"),
  - Kit Carlson + Black Jack → odkryje 3, nechá si 2, druhou ponechanou ukáže; při červené
    lízne třetí (Q31 příklad 3),
  - Kit Carlson + Jesse Jones → nejdřív karta z cizí ruky, pak odkrytá řada na tu druhou.
  - Když se dvě schopnosti **opravdu vylučují**, dostane hráč volbu a **nelíže si novou
    postavu** (Q31). **Při implementaci se ukázalo, že takový pár mezi těmi 16 neexistuje**:
    celou fázi lízání si přebírají jen Kit Carlson a Claus „The Saint", jenže Claus je
    z Fistfulu, ne ze základní hry. Fáze `GREYGORY_DRAW_PICK` se proto nedělala – byl by
    to kód, do kterého se nedá dostat.
- **Vera Custer ho kopírovat SMÍ** (R10). Rekurze nehrozí — Greygory bere jen ze 16 postav
  základní hry a žádná z nich schopnosti nerozdává; Vera ani Greygory v tom poolu nejsou.
  Jedna věc se ale musí dořešit, protože se **časování neshoduje**:
  - Greygory si dvojici líže v **kroku 8 krokovače startu tahu**, kdežto Vera si kopii volí
    až v `startDrawPhase` ([logic/draw.js](../logic/draw.js)) — tedy **až za** tím krokem
    (a až po kontrolách na Dynamit/Vězení). V okamžiku kroku 8 ještě Greygoryho nemá,
    takže se jí nabídka nespustí.
  - Řešení: **volbou kopie si Vera dvojici rovnou lízne** (tamtéž v `startDrawPhase`,
    hned za volbou). Nabídka „nechat, nebo vyměnit" se jí **nikdy nedává** — kopie platí
    přesně jedno kolo, takže není co si nechávat; při každém kopírování líže čerstvou dvojici.
  - `_greygoryChars` **vyprší spolu s kopií**: tam, kde `startDrawPhase` dnes zahazuje
    `_copiedCharacter` předchozího kola, se zahodí i dvojice — ale **jen hráči, který není
    sám Greygory Deck** (tomu dvojice mezi tahy zůstává).
  - Dvojice líznutá Verou je pořád **veřejná** (kreslí se u ní stejně jako u Greygoryho),
    takže stůl vidí, co si zkopírovala.
- **Kocovina** (High Noon) vypne obě schopnosti naráz — padne to samo, `abilitiesOf`
  vrací při `_noAbility` prázdné pole. Platí to i pro Veru kopírující Greygoryho.
- **Render:** vedle jeho karty postavy leží **dvě malé karty** s líznutými postavami
  (kdo je má, vidí každý — schopnost je veřejná). Zabírají místo v pásu vyložených karet,
  takže se musí započítat do `boardBand` (jinak by řada dosáhla na balíčky).

---

## 6. Refaktor: `effectiveCharacter` → `hasAbility`

Dnes má hráč **právě jednu** schopnost a ptá se na ni ~45 kontrol
`effectiveCharacter(x) === "Jméno"` v `logic/*`, `core/playability.js`, `core/botPolicy.js`
a `view/board.js`. Greygory Deck má **dvě**, takže se ten dotaz musí otočit.

**Nový trychtýř v [core/distance.js](../core/distance.js)** (vedle `effectiveCharacter`,
který zůstává):

```js
// Které schopnosti hráči právě platí. Kocovina (High Noon) je všechny vypíná.
// Vera Custer se ptá skrz kopii, Greygory Deck skrz svou líznutou dvojici –
// a když Vera kopíruje Greygoryho, platí JEJÍ dvojice (R10).
function abilitiesOf(p) {
    if (!p || p._noAbility) return [];                  // Kocovina
    const base = p._copiedCharacter || p.character;     // Vera Custer kopíruje
    if (base === "Greygory Deck") return [...(p._greygoryChars || [])];
    return base ? [base] : [];
}
function hasAbility(p, name) { return abilitiesOf(p).includes(name); }
```

Všimni si, že **`_greygoryChars` je pole hráče, ne Greygoryho** — nese ho ten, kdo
schopnost právě má. Greygory si ho drží mezi tahy, Vera dostane vlastní na jedno kolo.

`effectiveCharacter(p)` **zůstává beze změny** a používá se dál tam, kde jde o **jednu
postavu k zobrazení**: portrét, problikávání Very Custer, overlay volby kopie, štítky,
`CHAR_RANK` bota. Maximum životů a portrét čtou `p.character` napřímo, takže se Kocovinou
ani Greygorym nemění — to platí dál.

**Postup (byte-přesně, po malých commitech):**

1. Přidat `abilitiesOf`/`hasAbility` + testy (Kocovina, Vera, Greygory, prázdný hráč).
2. Mechanicky nahradit `effectiveCharacter(x) === "Jméno"` → `hasAbility(x, "Jméno")`
   soubor po souboru, `npm test` po každém.
3. **Strukturální test**: v `logic/*`, `core/playability.js`, `core/botPolicy.js`
   a `view/board.js` nesmí zbýt žádné `effectiveCharacter(...) === "` mimo povolený
   seznam míst (portrét, overlay, štítek). Bez něj se to za půl roku rozjede zpátky.
4. Teprve pak Greygory Deck.

Riziko je v šířce, ne v hloubce: každá záměna je lokální a chráněná 1002 testy.

---

## 7. Render: víc než 5 životů

Karta životů (`assets/other_cards/lives.webp`, 325×500) má **5 nábojů**; portrét po ní
jezdí o `bulletH × health`, kde `bulletH = cardH × 0,93 / 5`. Nad 5 životů by portrét
z karty sjel — u Big Spencera o dvě délky karty.

**Řešení: druhá karta životů vedle** (rozhodnuto). Dvojice se chová jako jedna dráha
o 10 slotech.

- **`core/layout.js`**: nová čistá funkce
  ```js
  livesTrack(L, maxHealth, scale) → { cards: 1|2, step, zeroX/zeroY, slots }
  ```
  `cards = maxHealth > 5 ? 2 : 1`, `step = bulletH` beze změny. Portrét sedí
  `step × health` od **nulového konce dráhy**, tedy od vnějšího okraje té vzdálenější
  karty. Pro `maxHealth ≤ 5` vrací **pixelově dnešní stav** — to je podmínka, ne cíl.
- **Kde se to promítne** (musí se měnit **spolu**, jinak animace míří o kartu vedle):
  - [view/board.js](../view/board.js) — čtyři větve okruhu (vlevo / nahoře / vpravo /
    uprostřed), `drawMyArea`, `drawSpectatorPlayer`, `drawCompactOpponent`,
  - [positions.js](../positions.js) — `getBoardCardPos`, `hasRoleCard`, `displayIdx`
    (druhá karta životů posouvá sloty vyložených karet),
  - `numBluePrimary` / `numBlue` — vystředění skupiny „životy + postava" se dvěma kartami
    mění,
  - [view/intro.js](../view/intro.js) — `_introOppSlots`, `MY_LIVES_X()`,
    `_introPlaceSurvivors` (přeživší s jejich životy), `_introSheriffReveal` (+1 život),
  - [net/handlers.js](../net/handlers.js) — `NI_MY_X()` a spol. (Nová identita),
  - `runHealthSlide` — beze změny, jen dostane jinou cílovou souřadnici.
- **Mobil / kompaktní sloupec** (R11): sloupec je široký přesně jednu kartu (`colW`)
  a druhá by ho zdvojnásobila — při 7 soupeřích by se řada nevešla. Kompaktní profil proto
  zůstane **jednokartový** a nad 5 životů ukáže **číslo** vedle portrétu.
- **Nejtěsnější místo rozložení** je dnes moje karta životů na mobilu: portrét při 5
  životech sahá 195 px vzhůru a musí minout balíčky i pásmo soupeřů. Test to hlídá —
  a rozšíří se na **maxHealth až 10** pro všechny počty hráčů, obě profily a všechna
  sedadla.
- **Ověření v prohlížeči je nutné** — canvas se automaticky otestovat nedá. Testy pohlídají
  geometrii (nic nepřeteče, nic nedosáhne na balíčky), ne vzhled.

---

## 8. Bot

Bez zrcadel se **hra jen botů zasekne** — server akci mlčky odmítne, bot ji pošle znovu,
stav se nezmění. Hlídají to tři strukturální testy, ale je levnější to napsat rovnou.

**Nové větve `decideBotAction`** (jedna na každý nový `pendingActor.kind`):
`GRINNER_GIVE`, `DOROTHY_NAME`, `DOROTHY_TARGET`, `GREYGORY_OFFER` (`GREYGORY_DRAW_PICK`
nakonec ne – viz §5.8).
`TEREN_KILL_CHECK` a Valentýnovo lízání větev **nepotřebují** — recyklují `CHECK_DRAW`
a `DRAW`.

**Nové volby ve fázi `PLAY`** (nepovinné akce, žádný nový kind):
Lady Růže (výměna místa), Lee Van Kliff (opakování), Flint Westwood (výměna karet),
Zuřivá Doroty (poručení).

**Zrcadla pravidel** v `core/playability.js` (tedy sdílená se serverem i klientem):
Zúčtování (`playsAsBang`/`playsAsMissed`), Big Spencer (`bigSpencerBlocked`),
Zuřivá Doroty (`dorothyOffer`), Lady Růže (`roseSwapOffer`), Lee Van Kliff (`lvkOffer`),
Flint Westwood (`flintOffer`).

**`roleHostility`** ([core/beliefs.js](../core/beliefs.js)) dostane větev pro Divoký západ:
každý je nepřítel, nikdo spojenec.

---

## 9. Testy

Rozdělené po tématech, podle vzoru Fistfulu:

| soubor | co pokrývá |
|---|---|
| `wws.test.js` | příprava balíčku, Divoký západ vespod, spouštěč Dostavník/Wells Fargo, FAQ Q16/Q19 |
| `wws.events.test.js` | Madam Zuzana, Miláček Valentýn, Zúčtování, Sacagaway, Roubík |
| `wws.roles.test.js` | Hřbitov a Helena Zontero — přerozdání rolí, redakce, ledger, výhra |
| `wws.seats.test.js` | Lady Růže — výměna sedadel, přemapování indexů, přeskočený tah |
| `wws.dorothy.test.js` | Zuřivá Doroty — vypůjčený tah, Q04/Q05/Q06 |
| `wws.characters.test.js` | všech 8 postav |
| `wws.greygory.test.js` | `hasAbility`, kombinace schopností, Kocovina, **Vera kopírující Greygoryho** (líznutí při volbě kopie, vypršení dvojice po kole, Greygorymu dvojice zůstává), rekurze není možná, **`_greygoryPool` odečítá hrané postavy i odložené identity a smí vrátit 0** |
| `wws.win.test.js` | Divoký západ jako podmínka výhry, FAQ Q15 |
| `botChat.test.js` | hlášky botů — cooldown, mlčení na 1 životě pod Roubíkem, sada vět je data |

Plus rozšíření stávajících:

- `test/layout.test.js` + `test/positions.test.js` — druhá karta životů (maxHealth 6–10),
  třetí sloupec událostí, 8 kombinací rozšíření,
- `test/server.rooms.test.js` — redakce se Sacagaway a po přerozdání rolí,
- `test/botPolicy.test.js` / `server.handlers.test.js` / `server.guard.test.js` —
  tři strukturální invarianty pokryjí nové kindy samy,
- `test/server.bots.test.js` — **matice rozšíření se zvětší ze 8 na 16 kombinací**
  (`dodge_city × high_noon × fistful × divoky_zapad`) × 3–8 hráčů, plus „balíček samých X"
  pro každou rizikovou kartu: Hřbitov, Helena Zontero, Lady Růže, Zuřivá Doroty,
  Miláček Valentýn, Divoký západ.

**Pozor na dobu běhu:** 16 kombinací × 6 počtů hráčů je 96 her jen botů. Dnešní sada běží
9,4 s; matici je potřeba měřit a případně prořídit (např. plná matice jen pro 4 a 7 hráčů).

---

## 10. Pořadí prací

Každá fáze končí zeleným `npm test` a bootem serveru. Fáze 0 je hratelná — karty jsou
ve hře a odkrývají se, jen ještě nic nedělají.

> **Stav: fáze 0, 1, 2, 2b, 3, 4, 5, 6, 7, 8 a 9 hotové.** Data, mixin, spouštěč (Dostavník / Wells Fargo), redakce,
> třetí sloupec, loader, intro (`wws_top` → `shuffle_wws` → `wws_bottom`) i zaškrtávátka
> v lobby / hře botů / debugu; k tomu dráha životů nad 5 (fáze 1) a životy postav.
> **Postavy 34–41 jsou v `characters.json`, jako `WILD_WEST_CHARACTERS` i s vlastními
> životy (core/roles.js), ale do OSTRÉ hry se ještě nepřidávají** — schopnosti přijdou
> s fázemi 4–12 a do té doby by u stolu seděly postavy bez schopnosti. Vybrat je jde
> v debug hře; do ostré je pustí zrušení podmínky `options.debugPool` v `_characterPool`
> (logic/setup.js).
>
> **Fáze 1 dovybrala tři věci, které jsou v §7 popsané nejednoznačně:**
>
> - **Dvojice karet leží V ŘADĚ** (jedna souvislá dráha 10 nábojů), ne vedle sebe kolmo.
>   Vzorec pro portrét se tím vůbec nemění (`zero + step × health`) a `positions.js` se
>   nemuselo sahat: druhá karta roste směrem, kterým sloty vyložených karet nerostou,
>   takže se vystředění skupiny (`numBluePrimary`/`numBlue`) nemění. **Daň:** portrét při
>   9–10 životech zajede 36–70 px přes spodek odhazovacího balíčku (v mojí zóně leží karta
>   životů přesně pod ním) a hornímu šerifovi s 10 životy o ~13 px na dobírací. Dráha o 10
>   slotech potřebuje 515 px a mezi balíčky a spodkem jeviště je 465 – vejít se nemůže
>   v žádném uspořádání. Týká se to jen Big Spencera u plného zdraví. Samotné karty dráhy
>   na balíčky nedosáhnou nikdy (hlídá test/positions.test.js + test/layout.test.js).
> - **Životy postav** (`core/roles.js` `HIGH_HEALTH_CHARS` + Teren Kill v `LOW_HEALTH_CHARS`)
>   se dělaly už tady, ne až ve fázi 4: bez nich nemá nikdo víc než 5 životů a fáze 1 nejde
>   v prohlížeči vůbec vidět. Schopnosti zůstávají na svých fázích.
> - **Ověření v prohlížeči**: postavy 34–41 jdou vybrat v DEBUG hře se zapnutým Divokým
>   západem (`_characterPool` + `options.debugPool`, logic/setup.js). Do ostré hry se pořád
>   nepřidávají – tam by seděly bez schopnosti.
>
> **Fáze 2 (Zúčtování) dořešila tři věci, které §4.1 nechává otevřené:**
>
> - **Karta si svoji vlastní akci ponechává** (obě věty jsou povolující, R1), takže
>   `getActionForCard` NEMOHL vrátit „vždycky SHOOT" – jinak by pod Zúčtováním nešlo
>   vypít Pivo ani poslat Vězení. Místo toho se z `cardPlayability` vytáhl predikát
>   **`nativePlayInTurn`** („smí se karta zahrát ve své vlastní roli?") a nad ním stojí
>   **`turnActionForCard`**: vlastní akce, a jen když ta zrovna nejde (Vedle!/Úhyb ve svém
>   tahu, druhá zelená téhož jména, Salon bez zraněných), se míří. Ptají se jím klient
>   (`decideCardClick`), bot (`forcedLawIntent`) i Právo západu (`_lawHasTarget`,
>   `lawSelfShootOnly`) – bez toho se hra jen botů zasekla na vynuceném Vedle!
>   (`play_card`, který server mlčky odmítá).
> - **UI: přepínač `💥 ZAHRÁT JAKO BANG!`** v slotu tlačítek schopností (vedle Odstřelovače),
>   `selectedState.showdown`. Bez něj se u Vězení/Paniky/Duelu nedá poznat, jestli klik na
>   soupeře znamená vlastní akci, nebo výstřel. **Daň:** nabitý přepínač obsadí slot, takže
>   se v tu chvíli nekreslí Sid/Chuck/José/Doc; a když se kartou zároveň nabízí Odstřelovač,
>   ustoupí tlačítko jemu (zrušit se dá odznačením karty).
> - **Kazatel × Zúčtování** dostal vlastní predikát **`preacherBlocks`**: zákaz míří na
>   KARTU Bang! (a na Vedle! Calamity Janet, FAQ H5), ne na roli, ve které se hraje –
>   jiná karta zahraná „jako Bang!" tedy projde. Nahradil holé `bangBlockedFor` v playBang,
>   handleResponse, cardPlayability, sniperOffer i ricochetOffer.

> **Fáze 2b (Sacagaway) rozhodla čtyři věci, které §4.2 nechává otevřené:**
>
> - **Krádež z ruky zůstává SOUKROMÁ, i když je ruka odkrytá.** §4.2 chtěla poslat
>   `ragtime_steal` veřejně s `cardId`; jenže o dva odstavce níž si sama vyžádala gesto
>   z FAQ Q17 — ruka se otočí lícem dolů a **zamíchá**, teprve pak se z ní bere. V tu
>   chvíli identitu opravdu nikdo nezná, takže by veřejný `cardId` gesto popíral. Veřejně
>   jde všechno OSTATNÍ (`emitAnimPrivate` pod Sacagaway posílá majitelův payload všem):
>   líznutí, Claus, hokynářství — karta míří do odkryté ruky, kde je vzápětí veřejná.
>   Výjimku drží `fromShuffledHand` v [server/anim.js](../server/anim.js).
> - **`_liftCardFromHand` se měnit nemuselo.** §4.2 čekala, že bude potřeba `stolenIndex`;
>   jenže funkce hledá kartu **podle `id`** a fallback „uber poslední slot" má výslovně
>   podmíněný tím, že je ruka samý placeholder. Pod Sacagaway se karta podle ID najde,
>   takže se odebere ta správná a fallback se vůbec nepoužije. `stolenIndex` u krádeží
>   (`_stolenHandSlot`) se posílá tak jako tak, beze změny.
> - **Gesto se netýká MOJÍ ruky.** Svou ruku vidím lícem tak jako tak a vybírat se z ní
>   nedalo nikdy, takže ji nemá smysl přede mnou otáčet a míchat — a fanoušek by se
>   pral se stagingem letících líznutí (`pendingDrawIds`). Gesto proto běží na každém
>   vějíři KROMĚ vějíře toho, kdo se dívá (`_sacaStealGesture`).
> - **Gesto obaluje krádež, nemění ji.** Po dobu jeho běhu leží vějíř oběti rubem nahoru
>   (`App.sacaHandDown`), takže se všechny čtyři sekvence krádeže (Panika, Cat Balou,
>   Ragtime, Jesse/El Gringo) přehrají **beze změny** — jen se o gesto odloží a pak se
>   zbytek ruky přetočí zpátky. Odložení se dělá tím, že se `_playCardAnim` zavolá znovu
>   s `_sacaDone`, takže se těla case větví nesahá.
>
> **Fáze 4 rozhodla pět věcí, které §5 nechává otevřené:**
>
> - **Postavy jdou do OSTRÉ hry po jedné, jak přibývají schopnosti.** `WILD_WEST_READY`
>   ([logic/entities.js](../logic/entities.js)) je podmnožina `WILD_WEST_CHARACTERS`,
>   kterou bere `_characterPool` v ostré hře; debug hra nabízí všech osm dál. Seznam
>   roste s fázemi 5, 6 a 10 a pak zmizí. Bez toho by fáze 4 nebyla hratelná — a hlavně
>   by se postavy vůbec nedostaly do zátěžových her jen botů.
> - **Stall guard bota musel zjemnit otisk pokroku** (`progressSig`, [server/bots.js](../server/bots.js)):
>   Divoký západ přinesl TŘI cesty, kterými karta jen přeskakuje z ruky do ruky (Gary
>   Looter, Youl Grinner, Flint Westwood), takže se SOUČET karet v rukou nezmění a guard
>   hlásil zaseknutí tam, kde hra běžela. Ruce se proto počítají po hráčích.
> - **John Pain se odbavuje v `_pruneSuzyQueue`.** §5.3 chtěla `specialActionQueue`
>   s vlastní položkou; jenže ta se odbavuje jen na místech, kam některé větve sejmutí
>   (Vězení sebralo tah, Vendeta neuspěla, dynamit se posunul) vůbec nevedou. Karta se
>   proto jen zapíše (`_johnPainQueue`) a přesune se při pročištění fronty — to je
>   jediné místo, které se veze se VŠEMI cestami — plus pojistka v `nextTurn`
>   a `startDrawPhase`. Rozložený zásah (dynamit, Pravé poledne) drain blokuje: mezi
>   jeho zásahy jde zahrát Pivo na záchranu posledního života, tedy přesně to, co
>   poznámka na kartě zakazuje.
> - **Animace „kartu vybral její majitel" nese `chosen`.** Gary Looter, Youl Grinner
>   i Flintova vlastní karta letí jako `ragtime_steal`, ale pod Sacagaway se u nich
>   NEHRAJE gesto se zamícháním ruky (FAQ Q17 je o NÁHODNÉ krádeži). Rozhoduje o tom
>   jediné pole, které čtou `fromShuffledHand`/`holdForSacaSteal` ([server/anim.js](../server/anim.js))
>   i klient ([net/handlers.js](../net/handlers.js)). Dvě karty, které si Flint bere,
>   `chosen` nemají — ty náhodné jsou.
> - **Big Spencerova startovní ruka je vlastní pole `_startCards`**, ne dopočet z životů:
>   čte ho jak skutečné rozdání ([logic/setup.js](../logic/setup.js), debug), tak animace
>   rozdávání v intru ([server/intro.js](../server/intro.js)). Bez sdíleného pole by
>   intro rozdalo 9 karet a stav pak ukázal 5.
>
> **Fáze 5 rozhodla tři věci, které §5.5 nechává otevřené:**
>
> - **Pozastavený Teren se drží na 1 životě, ne na nule.** §5.5 mluví o „pozastavení
>   vyřazení" jako u dělení karet mezi víc Vulture Samů – jenže tam je hráč už mrtvý,
>   kdežto tady ještě může přežít. Na nule by ho `isInPlay` vyškrtlo ze hry a
>   `checkWinCondition` (kterou volá kdekdo) by uprostřed nedokončeného vyřazení
>   vyhlásil vítěze. Hráč proto zůstává na 1 životě po celou dobu sejmutí a na nulu
>   ho srazí až ♠.
> - **Pivo se ve fázi `CHECK_DRAW` nenabízí.** §5.5 chtěla nabídku nechat svítit
>   a zavřít ji až klikem na balíček; jenže volba „Pivo, nebo sejmutí" (FAQ Q18) padá
>   už o krok dřív – ve fázi, ve které zásah dopadl (RESPOND / DYNAMITE_DAMAGE /
>   NOON_DAMAGE). Jakmile se sejmutí rozjede, žádná z těch fází neběží, takže
>   `beerLastLifeSave` vrátí `false` sama od sebe a `_terenChecked` není potřeba.
> - **Dynamit se hlídá sám.** `takeDynamiteHit` nuluje `pendingDynamiteDamage` ještě
>   před voláním `handlePlayerDeath`, takže zbylé zásahy propadnou bez jediné podmínky
>   navíc (FAQ Q12). Doplnit se musela jen jedna větev: přežil-li Teren, tah pokračuje
>   tam, kam by ho poslaly dobrané zásahy (`_afterDamageClicks`), ne posunem na dalšího
>   hráče.
>
> **Fáze 7 rozhodla pět věcí, které §4.5 a §4.6 nechávají otevřené:**
>
> - **Nahlédnutí na novou roli není interaktivní.** Plán chtěl u Hřbitova recyklovat
>   potvrzení role z intra (tlačítko OK), jenže to je vlastní fáze – a s ní `pendingActor`,
>   větev bota, guard a štítek. Helena přitom stejnou věc („každý hráč se podívá na svou
>   novou roli") dělá pro víc hráčů naráz, kde se tlačítky čekat nedá vůbec. Obě karty proto
>   používají TOTOŽNOU neinteraktivní cinematiku `role_peek`: rub přiletí z okraje jeviště,
>   otočí se jen svému majiteli, chvíli drží a odletí. Nic se nezastavuje, jen se o její
>   délku podrží boti a fronta animací (`rolePeekMs`, core/wwsAnim.js).
> - **Novou roli si prohlédne KAŽDÝ, komu ji přerozdání dalo** – ne jen vracející se hráč.
>   U Hřbitova to jsou i ostatní vyřazení: dostali novou roli a její jediná další příležitost
>   ji uvidět by přišla až při jejich vlastním návratu, kdy už se ale nemusí míchat nic
>   (poslední vyřazená role zůstává, jak je). Bez toho by hráč mohl vypadnout ze hry, vrátit
>   se a nevědět, za koho hraje.
> - **Payload `role_peek` je pro každý socket jiný.** Roli nese ANIMACE, ne stav – nový stav
>   dorazí až za celou cinematikou, takže by si klient ve `state` přečetl pořád tu starou.
>   Na to nestačí `emitAnim` (všem stejné) ani `emitAnimPrivate` (dvě varianty), takže má
>   `flushWwsRoles` (server/anim.js) vlastní emit. `playerIdxs` je naopak u VŠECH stejné,
>   aby fronta animací držela stav stejně dlouho i u toho, kdo si nepřehraje nic – jinak by
>   se klienti rozešli.
> - **Šerif je z přerozdání vyňatý i u Hřbitova**, ne jen u Heleny. Text karty ho neuvádí,
>   ale mrtvý šerif hru končí, takže je to v ostré hře no-op – a v DEBUG hře (kde se výhra
>   nevyhodnocuje) to je jediná pojistka proti tomu, aby roli se šerifovým +1 k životům
>   dostal hráč, kterému by se `maxHealth` nikdo nepřepočítal.
> - **Helena hru nepozastavuje.** Plán počítal s tím, že `_flipWwsEvent` bude umět vrátit
>   `true` a Dostavník si lízání odloží do `_wwsResumeDraw`. Ukázalo se, že to není potřeba:
>   sejmutí se nikoho na nic neptá (nejde cestou `pendingCheckDraw`, protože se karta otáčí
>   automaticky – FAQ Q09), takže celý efekt proběhne synchronně a viditelný je jen
>   animacemi. `_wwsResumeDraw` proto nevznikl.
>
> **Fáze 8 rozhodla tři věci, které §4.10 nechává otevřené:**
>
> - **`lastManStanding` přebíjí i hru pro 3 hráče – včetně už ZÍSKANÉHO nároku.** Plán počítal
>   jen s větví navíc v `evaluateWinner` před `if (opts.mode3p)`. Jenže `_winClaim3p` se
>   nastavuje v `handlePlayerDeath` (logic/combat.js), a kdyby se ukládal dál, tvrdil by log
>   „a vyhrává (vlastní cíl)" o hráči, který nevyhrál nic. Nárok se proto pod kartou
>   ani nezískává. Odměna 3 karet za vyřazení zůstává.
> - **Debug hra má vlastní větev.** `checkWinCondition` v ní výhru jen loguje (hra pokračuje),
>   takže by se jinak i pod kartou hlásilo „Bandité by vyhráli" v okamžiku, kdy šerif
>   umřel a hra běží dál. Pod kartou hlásí „<jméno> by vyhrál!" až u posledního živého.
> - **Nulu živých není potřeba řešit.** Vyřazení jde vždy po jednom a `handlePlayerDeath`
>   vyhodnotí výhru po každém z nich, takže se vítěz najde už předposlední smrtí –
>   i u rozložených zásahů (dynamit, Pravé poledne, Fistful of Cards, Ruská ruleta).
>   Vzorec `alive.length === 1` proto stačí.
>
> **Šerif smí umřít a hra běží dál** – High Noon si to zvládl sám: odkrývání událostí
> se už dnes ptá `_eventFlipperIdx` (logic/highNoon.js), které při mrtvém prvním hráči
> posune „šerifovu pozici" na dalšího živého. Bez toho by se s jeho smrtí zastavil celý
> balíček High Noonu i Fistfulu.
>
> **Redakce dostala nové jediné pravidlo:** odkrytou roli drží **výhradně** `_roleRevealed`.
> Dnešní `health <= 0` z ní muselo ustoupit – jinak by role přerozdaná mezi vyřazenými hráči
> utekla klientovi hned prvním broadcastem. Stejné pravidlo platí pro `computeBeliefs`
> (core/beliefs.js), který navíc musel začít počítat vyřazeného hráče bez odhalené role mezi
> NEZNÁMÉ: jeho role se jinak rozprostřela na živé a rozdělení pravděpodobností nedalo 1.
> Klient se měnit nemusel vůbec – `deadRoleMap[null]` už dnes padá na `role_card_back`
> a slot ze skupiny nemizí, takže se ani nehnul půdorys.
>
> **Fáze 9 rozhodla čtyři věci, které §4.9 nechává otevřené:**
>
> - **Klidné místo se pozná fází, ne délkou fronty.** §4.9 chtěla frontu vyprázdnit „na konci
>   `_processSpecialQueue`, když se nic nerozeběhlo". Jenže tam se volá ještě ve fázi právě
>   dokončené schopnosti (`interruptedPhase` se obnovuje až v `_resumeAfterSpecial`), takže by
>   zásah dopadl doprostřed rozdělaného efektu. Rozhoduje proto `_gagCalm()`: fáze `PLAY`,
>   prázdná fronta, žádné aktivní lízání ani sejmutí a žádný čekající automatický konec tahu.
>   Vybírá se na TŘECH místech – v `_processSpecialQueue` (tam frontu dobere kód hned pod ním),
>   v `_resumeAfterSpecial` po obnovení fáze a nejpozději v `nextTurn`.
> - **Zásah může frontu zase naplnit.** Bart Cassidy si za ztracený život líže, smrt přidá
>   Herba Huntera i odměnu za banditu. Volající zvenčí pravidel (server po zprávě do chatu,
>   `_resumeAfterSpecial`) proto nesahá na `_drainGag` napřímo, ale na **`gagFlush()`**, které
>   frontu rovnou rozeběhne. Bez toho by odložená akce zůstala viset a spustila se až o něco
>   později v úplně jiné fázi.
> - **`nextTurn` je jediné místo, kde se vybírá i mimo fázi PLAY** (`_gagAtTurnEnd`, `force`).
>   Má to dvě pasti: pokuta může vyřadit hráče, jehož tah právě končí – `handlePlayerDeath` na
>   to ve fázi PLAY nastaví `_autoEndTurnPending` a server by tah posunul PODRUHÉ, takže se
>   příznak vrací na původní hodnotu; a když zásah naplnil frontu, musí se dobrat dřív než
>   posun tahu (`_nextTurnAfterQueue`) – ovšem jen tehdy, když `_processSpecialQueue` opravdu
>   něco rozeběhlo, jinak by hra na příznak čekala navždy (past z CLAUDE.md).
> - **Hlášky botů stojí na diffu stavu, ne na háku v pravidlech.** §4.9 chtěla `botQuip` volat
>   „nad událostmi, které server stejně už zná" – jenže žádný takový feed neexistuje
>   (`gs._onEvent` patří logu). `core/botChat.js` proto události odvozuje ze dvou snímků stavu
>   (`quipSnapshot` → `quipEvents`), takže se pravidel nedotkl ani řádek. Emituje se z háku
>   `beforeBroadcast` (server/anim.js), **ne** ze `scheduleBotTick`: ten se debouncuje, takže
>   by většina událostí propadla. Zpráva jde ven přes nový `ctx.emitChat` – bot reálný socket
>   nemá, takže by jinak neměl kudy promluvit.
>
| # | Fáze | Obsah | Riziko |
|---|---|---|---|
| **0** ✅ | Kostra | data, `logic/wildWest.js`, spouštěč, třetí sloupec, assety, loader, intro, lobby | nízké |
| **1** ✅ | Render životů | `livesTrack`, druhá karta, mobilní číslo, testy geometrie | **render — nutné ověření v prohlížeči** |
| **2** ✅ | Zúčtování | `playsAsBang`/`playsAsMissed`/`showdownBangOk`/`preacherBlocks`/`nativePlayInTurn`/`turnActionForCard`, přepínač v UI | střední (dotýká se obrany) |
| **2b** ✅ | Sacagaway | redakce ruky, přetáčení vějířů, lety karet lícem | **render — nutné ověření v prohlížeči; pravidla se nemění** |
| **3** ✅ | Start / konec tahu | Miláček Valentýn, Madam Zuzana | nízké |
| **4** ✅ | Postavy bez zásahu do jádra | Big Spencer, Gary Looter, John Pain, Flint Westwood, Youl Grinner | nízké |
| **5** ✅ | Teren Kill | pozastavení vyřazení, Pivo vs. sejmutí | střední |
| **6** ✅ | Lee Van Kliff | paměť poslední hnědé karty, opakování efektu | střední |
| **7** ✅ | Role | Hřbitov, Helena Zontero (redakce, ledger, výhra) | **vysoké** |
| **8** ✅ | Divoký západ | podmínka výhry, bot | střední |
| **9** ✅ | Roubík | chat, odložená fronta, **hlášky botů (`core/botChat.js`)** | nízké |
| **10** ✅ | `hasAbility` + Greygory Deck | refaktor ~85 míst, pak postava | **vysoké (šířka)** |
| **11** ✅ | Lady Růže z Texasu | výměna sedadel, přemapování indexů, animace | **vysoké** |
| **12** | Zuřivá Doroty | vypůjčený tah | **nejvyšší** |

Fáze 1 je hned na druhém místě schválně: bez ní se Big Spencer nedá ani ukázat, a je to
jediná položka, kterou nejde ověřit testem — čím dřív se na ni podíváš v prohlížeči, tím líp.

---

## 11. Co plán vědomě nedělá

- **Balíček se fyzicky nepřesouvá před hráče**, který zahrál Dostavník („take the WWS pile
  and place it in front of you"). Zůstává na stole vlevo. Je to jen gesto — pravidlově
  nenese nic a stálé místo je pro klienta i pro animace levnější.
- **Roubík nehlídá hlasovou komunikaci** — jen chat. Nic jiného hra nevidí.
- **Sacagaway nedává možnost si kartu z ruky vybrat** — FAQ Q17 nařizuje ruku zamíchat
  a brát náhodně, a plán to dodržuje. Odkrytá ruka mění jen to, co je vidět.
- **Roubík nemá vlastní strop ani varování.** Kdo chce chatovat za životy, může.
- **Bot Lady Růži nevyčerpá** (nejvýš jednou za svůj tah), i když pravidlo mu povoluje víc.
  Není to pravidlo, je to politika bota — hra jen botů by se jinak zvrhla v přesedávání.
