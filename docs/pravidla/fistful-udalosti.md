# A Fistful of Cards — události a jejich efekty

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

## A Fistful of Cards: dva balíčky událostí vedle sebe

Druhé rozšíření událostí. **Hraje se SOUČASNĚ s High Noonem**, ne místo něj – na začátku
tahu prvního hráče se odkryje karta z obou balíčků, nejdřív z High Noonu a hned za ní
z Fistfulu. Klíčové rozhodnutí bylo **nesahat na existující High Noon**: `GameState` má
druhou sadu polí místo přepisu na obecnou strukturu.

| High Noon | A Fistful of Cards |
|---|---|
| `eventDeck` / `eventPile` / `activeEvent` | `ffDeck` / `ffPile` / `activeFistful` |
| `_pendingHighNoonReveal` / `_eventEntering` | `_pendingFistfulReveal` / `_ffEntering` |
| [logic/highNoon.js](logic/highNoon.js) | [logic/fistful.js](logic/fistful.js) |

**Slévají se jen na dvou místech**, a proto zůstala všechna existující volání beze změny:

- `GameState.hasEvent(key)` → `activeEvent?.key === key || activeFistful?.key === key`,
- `eventActive(state, key)` ([core/highNoon.js](core/highNoon.js)) → totéž nad prostým
  JSON stavem (klient a bot).

Klíče karet jsou napříč oběma balíčky unikátní, takže se pravidla nikdy nemusí ptát, ze
kterého balíčku karta je. `_sheriffTurns` (počítadlo kol) je **společné** – oba balíčky se
otáčejí ve stejný okamžik.

- **Karta „Fistful of Cards" leží vespod** (jako Pravé poledne v High Noonu): přijde
  poslední a platí do konce hry. `_setupFistfulDeck` ji proto dává na index 0 – líže se
  přes `pop()` z konce.
- **Přibalené karty (Nová identita, Želízka) jsou původem z Fistfulu**, takže se se
  zapnutým Fistfulem přidávají do balíčku High Noonu samy (`_hnExtraOn`) a zaškrtávátko
  v „Pokročilých možnostech" se v tom případě vůbec nekreslí.
- **Dvě aktivní události najednou** je stav, který dřív nemohl nastat. Vlastní testy proto
  dostaly dvojice, které se kříží: Peyote × Požehnání, Mrtvý muž × Město duchů,
  Vendeta × Město duchů, Fistful of Cards × Pravé poledne, Laso × Vězení/Dynamit,
  Ranč × Želízka.

**Testy** jsou rozdělené po tématech: `fistful.test.js` (příprava balíčku a odkrývání),
`fistful.events.test.js`, `fistful.characters.test.js`, `fistful.draw.test.js`,
`fistful.peyote.test.js`, `fistful.mine.test.js`, `fistful.turn.test.js`,
`fistful.roulette.test.js`, `fistful.attacks.test.js` + zátěžové hry jen botů
(`server.bots.test.js`, „balíček samých X" pro každou rizikovou kartu).

### Invariant „bot se nikdy nezasekne" a jak ho hlídají testy

Historicky nejčastější chyba v projektu: nové pravidlo dostane vlastní fázi nebo něco
zakáže, ale zrcadlo v `core/playability.js` / `core/botPolicy.js` chybí. Server akci
mlčky odmítne, bot ji pošle znovu, stav se nezmění → **hra jen botů zamrzne**. Tři
strukturální testy to hlídají, aniž by musela zátěž trefit tu správnou kartu:

- „každý kind z pendingActor má v decideBotAction svou větev" (`test/botPolicy.test.js`),
- „každou akci, kterou bot umí poslat, obsluhuje nějaký handler" (`test/server.handlers.test.js`),
- „každá herní akce bota je v guardu" (`test/server.guard.test.js`).

K tomu „matice rozšíření × 3–8 hráčů" (`test/server.bots.test.js`) – všech osm kombinací
`dodge_city × high_noon × fistful` pro každý počet hráčů.

## Start tahu (Fistful): Mrtvý muž, Fistful of Cards, Pokrevní bratři

Tři karty, které sahají do startu tahu. Krokovač `_runBeginTurn`
([logic/highNoon.js](logic/highNoon.js)) je proto osmikrokový a **pořadí je pravidlo**:

```
0. _deadManReturn        ← Mrtvý muž: návrat prvního vyřazeného      (Fistful)
1. _flipEvent            ← odkrytí karty High Noon a hned za ní Fistful
2. _applyEventOnEnter    ← okamžitý efekt karty High Noon (Kocovina, Daltonové, Doktor)
3. _applyFfEventOnEnter  ← okamžitý efekt karty Fistful
4. _noonDamage           ← Pravé poledne                             (High Noon)
5. _fistfulHits          ← Fistful of Cards: N× Bang!                (Fistful)
6. _newIdentityOffer     ← Nová identita                             (High Noon, přibalené)
7. _startBloodBrothers   ← Pokrevní bratři: daruj 1 život            (Fistful)
```

**Pokrevní bratři jsou poslední, ale pořád PŘED kontrolami na Dynamit/Vězení** – „na
začátku svého tahu, před lízáním", a sejmutí na Dynamit i Vězení už k fázi lízání patří.
Život tedy stihne darovat i ten, koho vzápětí vyhodí do vzduchu dynamit nebo komu vězení
tah vezme.

### Mrtvý muž (`MRTVY_MUZ`)

„Hráč vyřazený jako první se ve svém tahu vrací se 2 životy a 2 kartami." Vrací se
**natrvalo**, ne jako duch.

- **Kdo to je** drží `_firstDeadIdx`, zapisuje ho `handlePlayerDeath`
  ([logic/combat.js](logic/combat.js)) **nezávisle na zapnutém rozšíření** – je to laciné
  a spolu s ním se nastaví `p._roleRevealed`.
- **Role zůstává odkrytá.** Redakce (`redactState` v [server/rooms.js](server/rooms.js)) se
  proto ptá i přes `_roleRevealed`: `health <= 0` po návratu neplatí, ale roli už celý stůl
  viděl. **Karta role naopak ze slotu zmizí** – `_roleSlot` ([view/board.js](view/board.js))
  i `hasRoleCard` ([positions.js](positions.js)) jedou dál podle životů, takže se to srovná
  samo (obojí se ale musí měnit SPOLU, jinak animace míří o kartu vedle).
- **V pořadí tahů se nepřeskakuje** – `nextTurn` ([logic.js](logic.js)) se ptá přes
  `_deadManReturnIdx()`, což je zároveň jednorázovost (`_deadManUsed`). Test je **dřív než
  `_ghost`**: s Městem duchů (High Noon) se první vyřazený vrací doopravdy, ostatní jako
  duchové.
- **Dvě karty si líže ručně** přes existující frontu `KILL_REWARD` (klik na balíček);
  start tahu se dotočí až po ní (`_resumeBeginTurnAfterQueue`). Navazující (vlastní) fáze
  lízání patří TÉMUŽ hráči a začíná zase od nuly – rozliší je `drawId`, viz
  `core/drawCounter.js`.
- **Návrat se animuje posunem po kartě životů** (0 → 2). Posun postavy (`runHealthSlide`
  ve [view/board.js](view/board.js)) se proto spouští i z NULOVÉ výchozí hodnoty
  (`_applyRoomUpdate` v [net/handlers.js](net/handlers.js)); smrt se pořád nesnímá,
  tu hlídá podmínka na NOVÝ stav > 0. Týká se to i ducha (Město duchů), který se během
  svého tahu doléčí.

### Fistful of Cards (`FISTFUL_OF_CARDS`)

„Na začátku svého tahu je hráč zasažen tolika kartami Bang!, kolik má karet v ruce."
Karta leží vespod balíčku, takže přijde poslední a platí do konce hry.

- **Každý zásah je obyčejný Bang! bez útočníka** – `_beginBangResolution(null, idx, …)`.
  Barel, Jourdonnais, Vedle!, zelené Vedle! i Pivo na posledním životě proto fungují na
  každý zásah zvlášť, a `effectiveCharacter(undefined)` vrací null, takže se Slab ani
  Belle Star nechytnou, **El Gringo nekrade** a **za smrt nikdo nedostane odměnu** (přesně
  jako u dynamitu, kde `handlePlayerDeath` dostane `killerIdx === deadIdx`).
- **Počet zásahů se zmrazí na začátku** (`pendingFistful.hitsLeft`) – hraním Vedle! ruka
  ubývá, ale zásahů přijde tolik, kolik jich bylo.
- **Krokovač se po každém zásahu vrací na krok 5** (`_beginTurnStep--` ve `_fistfulHits`),
  takže se další zásah pošle hned, jak ten předchozí doběhne. Návrat obstarává
  **`_afterFistfulHit()`** ([logic/fistful.js](logic/fistful.js)), volaný ze **tří míst,
  kde se obyčejný Bang! uzavírá** – `handleResponse` (uhnul i schytal),
  `_advanceAfterLastLifeSave` (Pivo/Sid) a větev BARREL v `_applyCheckResult`. **Musí se
  měnit spolu**; kterékoli zapomenuté místo znamená tah, který zůstane viset ve fázi PLAY
  se zbylými zásahy ve vzduchu. Fronta odložených akcí (Bart Cassidy, Suzy, Úhyb) má
  přednost a dojede přes `_resumeBeginTurnAfterQueue`.
- **Smrt uprostřed série** zbytek zásahů zahodí a `_fistfulHits` sám posune tah
  (`nextTurn()`). `_autoEndTurnPending` použít nejde: `handlePlayerDeath` ho nastavuje jen
  ve fázi PLAY/DRAW, kdežto zásah dopadl v RESPOND (stejný důvod má `takeDynamiteHit`).
- **Ducha (Město duchů) míjí** (R10) a prázdná ruka krok přeskočí.
- **Útok bez útočníka na klientu**: `describePendingResponse` ([core/pending.js](core/pending.js))
  vrací `attackerName: null` (ne `'?'`), banner ve [view/board.js](view/board.js) pak větu
  „od hráče X" vynechá a místo ní ukáže, kolik zásahů ještě zbývá. `attackHighlight` se na
  `originatorIdx == null` vypne sama.

### Pokrevní bratři (`POKREVNI_BRATRI`)

„Na začátku svého tahu, před lízáním, smí hráč ztratit 1 život a dát ho jinému hráči.
Nesmí se tím zabít."

- Fáze `BLOOD_BROTHERS` + `pendingBlood = { playerIdx, targets }`, akce
  `blood_brothers { targetIdx | null }`. **Nabídne se jen když je co dát (health ≥ 2) a je
  komu**: cíl musí být ve hře a zraněný (R9). 1× za tah (`_bbOfferedTurn === turnId`).
- **Seznam platných cílů posílá server** (`pendingBlood.targets`) – klient i bot si podle
  něj svítí/vybírají, takže se s pravidly nemůžou rozejít.
- Ztráta jde přes `handleDamage(idx, null)` → **Bart Cassidy si lízne, El Gringo nekrade**.
  Když se tím naplní fronta, start tahu se dotočí až po ní – příznak
  **`_resumeBeginTurnAfterQueue`** v `_resumeAfterSpecial` ([logic/characters.js](logic/characters.js)).
- **UI:** cíl se vybírá klikem na postavu soupeře (vlastní blok v `addCharInteraction`,
  vzor „odhoď další kartu"), odmítnutí je tlačítko v místě „Ukončit tah"; slot schopností
  proto v téhle fázi nedostane Sid Ketchum (stejně jako u Peyote/Ranče).

## Laso, Soudce, Léčka (Fistful): tři karty, které mění pravidla plošně

Všechny tři jsou „pasivní" – žádná fáze, jen jeden dotaz, kterým se ptají všechna
dotčená místa.

- **Laso** („karty vyložené před hráči nemají žádný efekt") = `_boardDead()`
  ([logic/fistful.js](logic/fistful.js)), zrcadlo `boardDeadFor` ([core/highNoon.js](core/highNoon.js)).
  Je to totéž, co už uměl vypínač karet na stole u Belle Star (`_belleIgnoresBoard`), jen
  platí pro VŠECHNY hráče a i na karty vlastní. Vypnuté jsou: dostřel zbraně (→ 1 jako
  s Coltem, **takže ani Volcanic nedovolí Bang! bez limitu**), Mustang/Skrýš i Dalekohled/
  Hledí, Barel (Jourdonnaisova VROZENÁ schopnost platí dál – není to karta), Dynamit
  i Vězení (žádné sejmutí, dynamit se neposouvá, vězení tah nebere) a zelené karty včetně
  zelených Vedle! ze stolu. Karty přitom zůstávají ležet, takže po skončení kola fungují zase.
- **Soudce** („hráči nesmí vykládat karty před sebe ani před ostatní") = `_judgeBlocks(card)`,
  zrcadlo `judgeBlocksFor`. Blokuje jen cestu karty **z ruky na stůl** (výzbroj, modré,
  zelené a Vězení). Co už leží, funguje dál – aktivace zelené karty i Hokynářství
  Uncle Willa jsou povolené.
- **Léčka** („vzdálenost mezi kterýmikoli dvěma hráči je 1") **nemá vlastní metodu**:
  ptá se na ni přímo `computeDistance` ([core/distance.js](core/distance.js)). Základ ze
  sedadel se zahodí, modifikátory (Paul Regret, Rose Doolan, Mustang/Skrýš, Dalekohled/
  Hledí) se počítají od jedničky dál.

## Opuštěný důl (Fistful): jen fáze 1 a fáze 3 hráče na tahu

„Ve fázi lízání si hráč líže z odhazovacího balíčku; odhazované karty se pokládají lícem
dolů na dobírací balíček." **Není to prohození hromádek** (FAQ Q03/Q04): týká se to jen
dvou přesných míst v tahu HRÁČE NA TAHU, a jen jeho – ostatní lížou i odhazují normálně.

| kde | co se děje |
|---|---|
| **fáze 1** – lízání (i Kit Carlson, Claus, Black Jack, Pálenka…) | líže se z ODHOZU |
| **fáze 3** – odhoz nad limit karet na konci tahu | odhazuje se lícem dolů NAVRCH balíčku |
| fáze 2 – zahrané i odhozené karty, obrana, Duel, schopnosti postav | do odhozu, jako vždy |
| Dostavník / Krytý vůz / hokynářství | lížou z BALÍČKU (FAQ Q04) |
| kontrolní sejmutí (Dynamit, Vězení, Barel, Lucky Duke, Vendeta) | z balíčku do odhozu, jako vždy |
| pozůstalost vyřazeného hráče, odměny za banditu | do odhozu / z balíčku, jako vždy |

**Rozhoduje se JEDNOU za tah**, na začátku fáze lízání (`_startMineTurn`
v [logic/fistful.js](logic/fistful.js)): nejsou-li v odhozu karty na CELÉ lízání
(`_mineNeeded` – Kit 3, Claus celá řada, Black Jack +1 za červenou), hráč si podle
FAQ Q03 lízne všechno z dobíracího balíčku **a odhazuje normálně** – důl se pro tenhle
tah neuplatní vůbec. Výsledek drží `_mineTurn` (prosté pole stavu → doteče přes
`room_update` i ke klientovi) a nuluje ho `_beginTurn`, takže platí přesně jeden tah.

Trychtýře jsou dva a jinam se nesahá: **`_mineDrawCard(ds)`** (fáze 1 – bere z odhozu jen
při `ds.isStartOfTurn`) a **`_mineDiscardEndTurn(card)`** (fáze 3, volá ho `discardCard`
v [logic.js](logic.js)). Nad nimi jsou na `Deck` tři metody: `drawFromDiscard()`,
`discardToDrawPile()` a `returnToDiscardTop()` (nevybraná karta Kita se vrací navrch té
hromádky, ze které si ji vzal).

- **`ds.isStartOfTurn` v `_mineDrawCard` je nutnost, ne kosmetika.** Bez něj by z odhozu
  lízal i Dostavník – a hráč by si okamžitě vzal zpátky kartu, kterou právě zahrál.
  Vznikne z toho nekonečná pumpa (Dostavník za Dostavníkem), balíček se přelije do jedné
  ruky a hra uvázne ve fázi DRAW s prázdnými hromádkami.
- **`_mineDrawCard` má i tak pojistku** „došel odhoz → ber z balíčku": fáze lízání MUSÍ
  vždycky dojít do konce, jinak by bot klikal na balíček donekonečna.
- **Pedro Ramirez volbu `discard` nedostane** (`_getDrawOptions`): pod dolem by bral tutéž
  kartu jako z „balíčku".
- **Redakce sedí sama od sebe:** líže se z `discardPile`, který je veřejný. Že všichni
  vidí dopředu, co si hráč na tahu lízne, **je pointa karty, ne chyba.**

**Klient.** `deckTopPos()` / `discardTopPos()` se **neprohazují** – místa hromádek jsou
pevná. Jediné, co se pod dolem přesune, je zdroj fáze 1: **`minePhase1Pos()`**
([game.js](game.js)), který volají jen cesty, co opravdu berou z odhozu (běžné líznutí,
druhá karta Black Jacka, odkryté řady Kita a Clause). Zvýraznění a klikání hromádek se
prohodí jen ve fázi 1 (`_mine` ve [view/board.js](view/board.js) se ptá i na fázi).

- **Odkud karta letí, říká SERVER, ne klientský dohad.** `draw` nese `fromDiscard`
  a `hand_to_discard` nese `toDeck` – klient by z (opožděného) stavu nepoznal, jestli
  zrovna běží fáze 1 nebo 3 téhož tahu.
- **Lízání z veřejné hromádky:** karta musí z odhozu zmizet HNED se startem letu
  (`mineTakeFromPile`, brána `App.discardFlyHideIds`), nepřeklápí se rub→líc a k soupeři
  se naopak přetáčí LÍCEM→RUB (mizí mu do skryté ruky) – proto se to líznutí posílá
  veřejně (`emitAnim` s `cardId`), celý stůl kartu stejně viděl dopředu.
- **Odhoz na konci tahu** letí na dobírací balíček, dosedne lícem nahoru, vydrží
  `MINE_ANIM.holdMs` a teprve pak se překlopí na rub (`mineLandThen` v game.js) – jinak
  by zmizel dřív, než by kdokoli přečetl, co se odhodilo. Fronta animací o tu dobu drží
  stav (`_animDurationMs` se ptá na `data.toDeck`) a o stejnou dobu se drží i boti
  (`room._mineBlockUntil` v [server/anim.js](server/anim.js), taky přes `toDeck`) –
  **obě místa se musí měnit spolu**. `maxLagMs` je proto funkce: víc odhozených karet za
  sebou by pevný práh 1400 ms vyhodnotil jako zaostávání a zahodil právě ty animace,
  kvůli kterým důl je.

**Vyčerpání odhozu uprostřed dávky.** Kit a Claus odkrývají víc karet naráz; `_mineNeeded`
si na ně sice sáhne dopředu, ale kdyby přesto došly, zbytek se dobere z dobíracího balíčku
a **nic se nemíchá** – `mode` v `_revealAnim` i `storeAnim` proto musí zůstat `'none'`,
kdykoli `shuffleCount === 0`. Bez toho by klient přehrál míchací cinematiku, která se
nikdy nestala (a boti by se o ni podrželi).

Testy: `test/fistful.mine.test.js` (21) + „20 her jen botů s balíčkem samých Opuštěných
dolů" (`test/server.bots.test.js`).


## Peyote (Fistful): hádání barvy místo fáze lízání

„Místo klasického lízání hráč hádá barvu vrchní karty a odkryje ji. Uhodl → bere si ji
a hádá znovu. Neuhodl → karta jde do odhozu a fáze lízání končí."

- **Přebíjí všechny postavy, které si lízání upravují** (Kit Carlson, Jesse Jones, Pedro
  Ramirez, Pat Brennan, Black Jack, Claus – R8), proto se `startPeyote()` ptá hned na
  začátku `startDrawPhase` ([logic/draw.js](logic/draw.js)), ještě před jejich větvemi.
- **Počet karet se v hádání neřeší vůbec.** Líže se, dokud hráč hádá, takže Žízeň
  (High Noon) nemá co ubrat a fáze vždy skončí jednou kartou v odhozu (přestat dobrovolně
  nejde). `drawPhaseState` existuje jen kvůli `_finishDraw` (Želízka, Ranč) a má
  `active: false` – hádá se tlačítky, ne klikem na hromádku.
- **Příjezd vlaku (High Noon) kartu navíc dává i tady** – hádáním se k ní dobrat nedá
  (kolik karet padne, je na hráči), takže se líže úplně klasicky klikem na balíček až
  ZA hádáním (`_endPeyote` v [logic/fistful.js](logic/fistful.js) nastaví novou
  `drawPhaseState` s `cardsNeeded: 1`). Je to stejný ocásek, jaký má Kit Carlson
  (`kitExtra`), a pořád je to lízání na začátku tahu, takže se Želízka i Ranč ptají až
  za ním. Když došel balíček i odhoz, fáze prostě skončí – jinak by se nedala dokončit.
- **Jediné místo v kódu, kde se čte VYTIŠTĚNÁ `card.suit`.** Pod Požehnáním/Prokletím
  (High Noon) by přes `_effSuit` každý tip sedl a hráč by si lízl celý balíček; výjimka
  je proto i v klientské cinematice a v botově větvi `PEYOTE`. Jakmile karta dosedne
  do ruky (nebo do odhozu), přebarvení pro ni platí normálně.
- **Vytištěnou barvu ukazuje CELÁ cinematika, ne jen výdrž uprostřed.** Textury `card_<id>`
  jsou pod Požehnáním/Prokletím přepečené na srdce/piky, takže se karta odkrývaná z balíčku
  přebarvovala i tam, kde se zrovna sázelo na tu vytištěnou; `printedSuit: true` proto
  nesahá jen na pulzující marku (`pulseCheckMark`), ale rovnou na texturu spritu –
  **`printedSuitTex(card)`** ([game.js](game.js)) upeče jednorázově variantu
  `card_<id>_printed` (stejnou cestou jako běžné karty, sdílený `paintCardTexture`),
  kterou si letící karta drží od překlopení až po dosednutí. Ve stavu (ruka, odhoz) už
  je zase běžná přebarvená textura.
- **Tip je veřejný.** Nad odkrývanou kartou visí popisek `TIP: ♥ ♦ ČERVENÁ` / `♠ ♣ ČERNÁ`
  (`caption` v `startDeckCardReveal`, [net/handlers.js](net/handlers.js)) – bez něj ostatní
  hráči vidí jen výsledek a nepoznají, jestli karta sedla náhodou, nebo jestli hráč barvu
  znal. Zhasíná stejným `stopPulse` jako pulzující marka, tedy přesně když karta vyráží
  ze středu do ruky/odhozu.
- **Obě tlačítka (červená/černá) obsadí oba slotky**, takže se ve fázi `PEYOTE` nekreslí
  tlačítko Sida Ketchuma – stejně jako u Ranče a Pokrevních bratrů.

## Ruská ruleta (Fistful): kolečko „odhoď kartu Vedle!"

„Když přijde karta do hry, počínaje šerifem každý hráč odhodí kartu Vedle!. První, kdo
nemůže, ztrácí 2 životy a efekt končí."

- Okamžitý efekt při příchodu karty (krok 3 startu tahu) – `_startRoulette` vrací `true`,
  takže se start tahu pozastaví. Kolečko se **opakuje dokola**, dokud někdo neselže;
  pořadí je po směru od šerifa (ve hře pro 3 od pomocníka, `_firstPlayerIndex`) i při
  Zlaté horečce – efekty karet jdou vždy po směru (FAQ H3). Duch (Město duchů) se
  neúčastní (R10).
- **Jeden hráč na řadě = `_rouletteTurn(idx, barrelDone)`** a pořadí možností je pravidlo:
  **nejdřív Barel/Jourdonnais** (FAQ Q13 – sejmutí místo odhozu; při ♥ hráč projde
  zadarmo), pak odhoz karty, a kdo nemůže ani jedno, schytá 2 zásahy. Sejmutí se zkouší
  první schválně: je zadarmo, takže když nevyjde, hráč kartu odhodí stejně jako by musel.
  Recykluje se **barelový check obyčejného Bang!** s příznakem `roulette: true`, který se
  protahuje až do `currentCheck` – fáze `BARREL_DRAW`, `pendingActor`, guard, klik na
  balíček i větev bota (`trigger_barrel_draw`) tím fungují beze změny. Vyhodnocení má
  vlastní odbočku hned na začátku barelové větve `_applyCheckResult`
  (`_rouletteBarrelResult`), protože se neřeší obrana, ale kolečko. Kolik sejmutí hráč
  má, říká sdílený **`rouletteBarrelChecks`** ([core/playability.js](core/playability.js)):
  Barel 1, Jourdonnais 1, obojí 2 – **Laso vypíná jen Barel jako kartu, Jourdonnaisova
  vrozená schopnost platí dál**.
- **Kdo nemá čím, se do fáze `ROULETTE_DISCARD` vůbec nedostane**: `rouletteHasCard` to
  pozná na serveru a pošle ho rovnou do existující klikací fáze zásahů
  (`pendingDynamiteDamage` se `source: 'ROULETTE'` a `resume: 'BEGIN_TURN'`). Tím zdarma
  fungují zvýrazněné životy, záchrana Pivem i Sidem, guard, klient i bot – a `pendingActor`
  ve fázi `ROULETTE_DISCARD` je VŽDY hráč, který kartu má, takže se hra nemá jak zaseknout
  na kliku, který nikdo neudělá.
- **Co se počítá za „kartu Vedle!"** rozhoduje jediný helper `rouletteDiscardable`
  ([core/playability.js](core/playability.js)): z ruky Vedle!, Úhyb, u Calamity Janet
  i Bang!, u **Eleny Fuente libovolná karta** – a ze stolu zelená Vedle!-karta
  (Železný plát/Sombrero/Bible; s Lasem ne). Odhod je **povinný**, dobrovolně životy
  ztratit nejde.
- **Odhod není zahrání karty, ale JE to odhoz z ruky.** Vlastní efekt karty se nespustí
  (Úhyb ani Bible nelížou), zato schopnosti vázané na odhoz z ruky platí: **Suzy
  Lafayette** si za prázdnou ruku lízne a **Molly Stark** za odhozenou kartu mimo svůj
  tah taky (proto ne u zelené karty ze stolu). Obojí je klikací líznutí ve frontě
  odložených akcí – kolečko se posune až po ní (`_advanceRouletteAfterQueue`).

## Vendeta (Fistful): sejmutí na konci tahu, při ♥ tah navíc

- **Gate úplně nahoře v `nextTurn`** ([logic.js](logic.js)), a to **PŘED `_teardownGhost`** –
  duch (Město duchů) Vendetu dostává taky. Sejmutí jde existující cestou
  `CHECK_DRAW → CHECKING → _applyCheckResult` přes nové pole `pendingCheckDraw.reason`,
  takže se zdarma veze **Lucky Duke**, klientská cinematika odkrytí i větev bota.
- **`_vendettaDone` se nastaví hned na začátku sejmutí**: „jen jednou za tah" pak platí
  i pro tah navíc (nový tah, ale týž hráč) a nemůže vzniknout smyčka. Nuluje ho až
  přechod na jiného hráče.
- **Tah navíc je plnohodnotný**: nové `turnId` (zelené karty jdou zase aktivovat), znovu
  celý start tahu i kontroly na Dynamit a Vězení – **včetně dynamitu, který si hráč
  vyložil v první půlce tahu** (R6). `_extraTurn` jen zajistí, že se NEodkryje nová
  událost a nezapočítá se kolo.
- **Ukončení tahu smrtí Vendetu nespouští** (hráč už není ve hře). Duch si díky ní zahraje
  znovu jako duch: ruku odhodil už v `tryEndTurn` (limit = 0 životů), `_ghost` mu zůstal
  a `_teardownGhost` se nespustil (R10).

## Ranč (A Fistful of Cards): odhoz po jedné, náhradní karty ručně

„Po fázi lízání smíš odhodit libovolný počet karet a líznout si stejně." Odhoz i lízání
se dřív odbyly naráz jedním kliknutím; teď:

- `ranchExchange` ([logic/fistful.js](logic/fistful.js)) jen **odhodí** označené karty
  a nastaví klasickou fázi lízání (`drawPhaseState` s `cardsNeeded` = počet odhozených,
  `isRanch: true`, **`isStartOfTurn: false`** – Želízka ani Ranč sám se znovu neptají).
  Náhradní karty si hráč lízne **ručně**, klikem na balíček za každou odhozenou; domíchání
  balíčku se tím odbaví úplně stejnou cestou jako u kteréhokoli jiného lízání.
- Odhoz se řadí **podle pozice ve vějíři**, ne podle pořadí klikání – karty pak odlétají
  do odhozu po jedné zleva doprava (`hand_to_discard` jde frontou animací, takže se
  přehrají za sebou a stav dorazí až za nimi, ať je jich kolik chce).
- Suzy Lafayette se neprobudí: prázdnou ruku vidí až po dokončení efektu, a to už má
  karty zpátky (viz „nejdřív doběhne efekt zahrané karty").

