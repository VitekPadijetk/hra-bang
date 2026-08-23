# Plán: rozšíření **A Fistful of Cards**

Druhý balíček událostí vedle High Noon. Pracovní plán – až bude hotovo, podstatné části
se přesunou do `CLAUDE.md` a tenhle soubor se smaže.

**Stav:** ✅ Fáze 0 (infrastruktura balíčku) · ✅ Fáze 1 (postavy) · ✅ Fáze 2 (Léčka,
Laso, Soudce) · ✅ Fáze 3 (Pálenka, Právo západu) · ✅ Fáze 4 (Peyote, Ranč) ·
✅ Fáze 5 (Opuštěný důl) · ✅ Fáze 6 (Pokrevní bratři, Fistful of Cards, Mrtvý muž) ·
✅ Fáze 7 (Ruská ruleta, Vendeta) · ✅ Fáze 8 (Odstřelovač, Odražená střela) ·
další na řadě je Fáze 9 (bot, zátěž, dokumentace). Výklady pravidel viz sekce 2.

Odchylky od plánu, které vyplynuly z implementace:
- **Zvednutí sloupců při hokynářství** nejde nastavit tak, aby vyhovělo oběma sousedům
  (řada rozdaných karet zdola, karty horního soupeře shora) – omezení se kříží o 5 px.
  Rozdíl se dělí na půl, takže na obou stranách zůstává necelý 3px překryv (`EVENT_STORE_SLACK`).
- **Claus odkrývá celou fázi jedním klikem** na balíček (při 8 hráčích by jinak klikal
  devětkrát). Karty leží v řadě uprostřed stolu (vzor Kit Carlson, jen měřítko se počítá
  z jejich počtu) a rozděluje je z ní: nejdřív si vezme svoje, pak po jedné ostatním.
  Komu se právě vybírá, drží `clausState.toIdx` – tomu hráči svítí postava.
- **Přibalené karty (Nová identita, Želízka)** se se zapnutým Fistfulem přidávají samy
  (`_hnExtraOn`), takže zaškrtávátko v „Pokročilých možnostech" v tom případě zmizí –
  obě karty jsou z tohohle rozšíření.
- **Laso vypíná i Volcanic.** „Karty vyložené před hráči nemají žádný efekt" se týká
  i zbraně, takže kromě dostřelu (→ 1 jako s Coltem) padá i její schopnost hrát Bang!
  bez limitu. Willy the Kid je postava, ta platí dál.
- **Právo západu vynucuje kartu jen s KONKRÉTNÍM cílem.** `cardPlayability` se u Bang!
  a Cat Balou na cíl neptá (na sebe sama střílet lze, Cat Balou vrací true vždy), takže
  by šlo tah zamknout kartou, kterou nemá kdo schytat. `lawForcedCard` proto navíc
  ověřuje existenci cíle — a bot má pro vynucenou kartu vlastní větev, která sáhne
  i po hráči, kterého by si dobrovolně nevybral. **Obojí je pojistka proti zaseknutí.**
- **Vynucená karta se odkrývá jen v tahu svého majitele.** Mimo něj je zase tajná
  (redakce i klient se ptají přes `currentPlayerIndex`), takže se `_lawCardId` nemusí
  nikde uklízet dřív, než ho zahodí `_beginTurn` na začátku hráčova dalšího tahu.
- **Pálenku vezme tlačítko v místě „Ukončit tah"**, ne u balíčku: ve fázi lízání je ten
  slot volný, kdežto na místě schopností může stát tlačítko Sida Ketchuma.
- **Peyote i Ranč obsadí OBA slotky tlačítek** (tip červená/černá, resp. vyměnit/přeskočit),
  takže se v jejich fázích tlačítko Sida Ketchuma nekreslí – stejně jako už nekreslí
  ve fázi odhazování nebo obrany. Léčit se dá hned po rozhodnutí.
- **Peyote se neptá na počet karet.** Kartářské události High Noonu (Žízeň −1, Příjezd
  vlaku +1) na něj nemají vliv – nelíže se „N karet", ale dokud hráč hádá. Přestat
  dobrovolně nejde, takže fáze vždycky končí jednou kartou v odhozu.
- **Ranč bere karty podle ID, ne indexů.** Mezi kliknutím a doručením se ruka mohla
  přeskládat; neznámá, cizí i zdvojená ID se tiše ignorují.
- **Opuštěný důl nepotřebuje `_mineOff`.** Plán počítal s příznakem na `GameState`, ale
  vyšel zbytečný: `mineMode` si při došlém odhozu shodí `Deck.draw()` sám a zpátky ho
  zapne až `_syncMine` při odkrytí další události. „Dokud je to možné" tím padá z pravidel
  úplně.
- **Pedro Ramirez pod dolem volbu `discard` nedostane.** Odhoz JE dobírací balíček, takže
  by bral tutéž kartu jako „z balíčku" – volba nic nepřidává a obcházela by trychtýř
  `draw()`. Vyřešilo to zároveň bota, u kterého plán čekal vlastní větev: propadne na
  `source: 'deck'` a bere z prohozené hromádky, ať je nahoře cokoli.
- **Trychtýř odhozu narostl na 47 míst** (plán psal 42) a k němu ještě čtení délek
  hromádek: hokynářství, odkrytá řada Kita/Clause a dvojice Lucky Duka. Serverové animace,
  které si hledaly „právě odhozenou kartu navrchu", dostaly `discardTop`/`takeFromDiscard`.
- **`maxLagMs` fronty animací musel jít z konstanty na funkci.** Doběh s výdrží prodlouží
  každý let do odhozu o ~1,2 s, takže dvě odhozené karty za sebou přelezly pevný práh
  1400 ms a fronta je **zahodila** – tedy právě tu animaci, kvůli které důl je.
- **Doběh nedostaly cinematiky, které kartu už ukázaly** zvětšenou uprostřed (sejmutí,
  Lucky Duke) ani odhoz při vyřazení hráče (má vlastní choreografii a serverové držení
  botů přes `deathSequenceMs`). Překlopení na rub tam proběhne bez výdrže, jen aby karta
  nepřeskočila bez přechodu.
- **Fistful of Cards nepotřebuje vlastní fázi.** Plán počítal s `pendingFistful` jako
  s vlastním pendingem; stačilo ale zásahy posílat přes obyčejné `_beginBangResolution`
  a **krokovač startu tahu po každém zásahu vrátit na krok 5** (`_beginTurnStep--`).
  Návrat obstarává `_afterFistfulHit()` volaný ze tří míst, kde se obyčejný Bang! uzavírá
  (handleResponse, `_advanceAfterLastLifeSave`, větev BARREL v `_applyCheckResult`).
- **Smrt uprostřed série posouvá tah sama** (`nextTurn()` ve `_fistfulHits`). Plán čekal
  `_autoEndTurnPending`, jenže ten `handlePlayerDeath` nastavuje jen ve fázi PLAY/DRAW –
  zásah dopadá v RESPOND. Stejný důvod má i `takeDynamiteHit`.
- **Pokrevní bratři si vyžádali čtvrtý „resume" příznak.** Darovaný život může naplnit
  frontu odložených akcí (Bart Cassidy), takže přibyl `_startDrawAfterQueue` – ve stejné
  rodině jako `_nextTurnAfterQueue` / `_resumeBeginTurnAfterQueue` / `_startChecksAfterQueue`.
- **Seznam cílů Pokrevních bratrů posílá server** (`pendingBlood.targets`), takže se
  klientské zvýraznění ani bot nemůžou s pravidly rozejít – žádné zrcadlo R9 nevzniklo.
- **`_roleRevealed` se zapisuje vždycky**, i bez zapnutého rozšíření. Je to jeden řádek
  v `handlePlayerDeath` a řeší tím zároveň redakci role vráceného Mrtvého muže.
- **Guard dostal i chybějící akce z fází 1–4** (`peyote_guess`, `ranch_exchange`,
  `claus_give`, `uncle_will`) – plán je odkládal do fáze 9, ale je to jeden řádek.
- **Ruská ruleta nepotřebuje „klik na životy" ve vlastní fázi.** Plán počítal s tím, že
  kdo nemá Vedle!, dostane zvýrazněné jen životy uvnitř `ROULETTE_DISCARD`. Server ale
  „nemá čím" pozná sám (`rouletteHasCard`) a takového hráče pošle rovnou do
  `DYNAMITE_DAMAGE` – tam už zvýrazněné životy, záchrana Pivem i Sidem, guard, klient
  i bot fungují beze změny. `pendingActor` ve fázi `ROULETTE_DISCARD` je tím pádem VŽDY
  hráč, který kartu má, takže se hra nemá jak zaseknout na kliku, který nikdo neudělá.
- **Odražená střela dělá z karty Bang! hratelnou kartu i s vyčerpaným limitem.** R2 říká,
  že se do limitu nepočítá – aby si ji hráč vůbec mohl vybrat, musí ji `cardPlayability`
  pustit. Přibyl proto `bangAtPlayerOk`: klient s ním zhasne POSTAVY (ty už se s vyčerpaným
  limitem střílet nedají) a bot přeskočí větev `play_bang`. Bez toho by klient nabízel
  výstřel, který server mlčky zahodí, a bot by ho posílal donekonečna.
- **Odražená střela se protahuje celým řetězem vyhodnocení Bang!**, ne přes globální
  pole na `GameState`: `_beginBangResolution(..., ricochet)` → `pendingBarrelCheck` →
  `startBarrelCheck` → `currentCheck` (i checkContext Lucky Duka) → `waitForMissed` →
  `pendingResponse`. Díky tomu barel, Jourdonnais i Slabovy dvě Vedle! fungují samy
  a v `handleResponse` stačí jediná odbočka „místo zásahu znič kartu".
- **Pivo ani Sid Ketchum před Odraženou střelou nezachrání.** Ohrožený není život, ale
  karta – bez gate v `beerLastLifeSave`/`sidLastLifeSave` by šlo za jedno Pivo ubránit
  cokoli. Zrcadla: `cardPlayability`, zvýraznění v `drawMyArea` i větev bota.
- **Odstřelovač recykluje „odhoď další kartu" beze zbytku** – `startSniper` postaví stejný
  `pendingDiscardAnother` (jen `effect: 'sniper'`), takže fáze DISCARD_ANOTHER, klientský
  výběr ceny, guard i větev bota fungují bez úprav. Doplnily se jen dva háky v
  `logic/dodgeCity.js`: validace ceny (`_sniperPayValid`) a dispatch (`_sniperAttack`).
- **Apache Kid vs. Odstřelovač: imunní jen když jsou kárové OBĚ karty.** Útok je složený
  ze dvou karet Bang!; jedna kárová ho nezruší (a bránit se stejně musí dvěma Vedle!).
  Klient ani bot to nemusí zrcadlit – útok naprázdno je legální terminální stav.
- **Blikání útočníka se odpojilo od jména postavy.** Doteď viselo na Slabovi; teď
  rozhoduje jen `missesRequired > 1` u požadavku Vedle!, takže bliká i Odstřelovač
  (jehož útočník žádnou zvláštní schopnost mít nemusí).
- **Tlačítko Odstřelovače obsadí slot schopností** (Sid/Chuck/José/Doc/Will se po dobu
  míření nekreslí) – stejná dohoda, jaká už platí pro Peyote a Ranč.
- **Odhod v Ruské ruletě není zahrání karty, ale JE to odhoz z ruky.** Vlastní efekt
  karty se nespustí (Úhyb ani Bible nelížou – „hraje se jako Vedle!" se na odhoz
  nevztahuje), zato schopnosti postav vázané na odhoz z ruky platí:
  **Suzy Lafayette** si za prázdnou ruku lízne a **Molly Stark** za odhozenou kartu mimo
  svůj tah taky („zahraje NEBO ODHODÍ kartu z ruky" – proto ne u zelené karty ze stolu).
- **Obě líznutí musí doběhnout DŘÍV, než se kolečko posune.** Kdyby čekala až za celým
  kolečkem, Suzy by do dalšího kola nastoupila s prázdnou rukou a na vlastní schopnost by
  doplatila. Přibyl proto pátý „resume" příznak `_advanceRouletteAfterQueue` (rodina
  `_nextTurnAfterQueue` / `_resumeBeginTurnAfterQueue` / `_startDrawAfterQueue` /
  `_startChecksAfterQueue`) a `_continueRoulette()`, který kolečko dotočí i ve chvíli,
  kdy už není kdo (jinak by fáze zůstala viset s `pendingActor === null`).
- **Kolečko končí, protože ostatním ruka ubývá.** Suzy i Molly si ji doplňují, ale jen
  dokud lížou karty s efektem Vedle!; ostatní účastníci ztrácejí kartu každé kolo, takže
  někdo dojde. Ověřeno 500 hrami jen botů s balíčkem samých Ruských ruletí a Vendet.
- **Zásahy z Ruské rulety musí umět vrátit se do KROKOVAČE startu tahu.** `pendingDynamiteDamage`
  dostalo `resume: 'BEGIN_TURN'` a nový trychtýř `_afterDamageClicks` (logic/combat.js),
  kterým prochází i obě záchrany posledního života. Bez toho by po dobrání zásahů běžely
  kontroly na Dynamit/Vězení podruhé – a hlavně: ruleta může vyřadit KOHOKOLI u stolu, ne
  jen hráče na tahu, takže větev „smrt → nextTurn()" by hráči na tahu sebrala tah.
- **Vendeta nepotřebuje vlastní fázi ani vlastní sejmutí.** Recykluje `CHECK_DRAW` →
  `CHECKING` → `_applyCheckResult` jen přes nové pole `pendingCheckDraw.reason`; tím se
  zdarma veze Lucky Duke, klientská cinematika odkrytí, banner „co a proč" i větev bota.
- **`_vendettaDone` se nastavuje už při ZAČÁTKU sejmutí**, ne až u tahu navíc. „V jednom
  tahu jen jednou" pak platí i pro ten tah navíc (nový `turnId`, ale týž hráč) a smyčka
  nemůže vzniknout ani při opakovaném volání `nextTurn` z fronty odložených akcí.
- **Tah přeskočený kvůli Vězení se na Vendetu snímá.** Tah formálně skončil; při ♥ si
  hráč tah navíc odehraje doopravdy (Vězení už leží v odhozu). Ukončení tahu SMRTÍ
  Vendetu naopak nespouští (`isInPlay`).

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
| 31 | **Claus "The Saint"** | 3 | Ve fázi lízání si lízne o jednu kartu víc, než je hráčů ve hře; pak dá po jedné kartě každému ostatnímu hráči a zbylé 2 si nechá. |
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
| R7 | Opuštěný důl | **Hromádky si po celé kolo vymění role.** Líže se **výhradně z odhozu** (fáze 1, kontrolní sejmutí, Dostavník, odměny, hokynářství – prostě všechno) a odhazuje se **výhradně na dobírací balíček**, lícem dolů (zahrané karty, odhoz na konci tahu, zaplacené ceny, zničené karty, šerifova pokuta i celá pozůstalost vyřazeného hráče a ducha). Platí to, **dokud odhoz nedojde**; pak se pro zbytek kola hraje normálně. Aby hráči věděli, co bylo zahráno, karta při letu **dosedne lícem nahoru, chvíli vydrží a teprve pak se překlopí na rub** – přesně jako u stolu. |
| R8 | Peyote vs. postavy měnící lízání | **Peyote přebíjí všechny** (Kit Carlson, Jesse Jones, Pedro Ramirez, Pat Brennan, Black Jack, Claus). |
| R9 | Pokrevní bratři – dát život hráči na plných životech | **Nelze.** Cílem je jen hráč ve hře se zraněním. |
| R10 | Duch (Město duchů) vs. FF karty | **Vendeta ano** – duch odhodí celou ruku a začne nový tah zase jako duch (znovu si líže 3). **Fistful of Cards ne** a **Ruská ruleta ne** – duch se jich neúčastní. |

### 2.1 Doplňky (odsouhlaseno)

- **Elena Fuente v Ruské ruletě: ano** – smí odhodit libovolnou kartu z ruky. Znamená to, že neselže, dokud drží aspoň jednu kartu.
- **Právo západu vs. Kit Carlson: ano** – vynucená je druhá karta, kterou si **nechá**.
- **Opuštěný důl nemá výjimky** – prohozené jsou obě hromádky pro všechny operace včetně kontrolních sejmutí a karet Lucky Duka. Kontrolní karta se tedy líže z odhozu a odchází na balíček, takže se pořadí normálně prostřídá (žádný deterministický dynamit).
- **„Dokud je to možné" = dokud odhoz nedojde.** Jakmile si někdo sáhne na prázdný odhoz, důl se pro **zbytek kola vypne** (příznak `_mineOff`) a hraje se normálně. Bez toho by to blikalo: první odhozená karta by se ocitla v odhozu a hned ji sebral další líznutí.

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

#### Claus "The Saint" (3 životy)
- **Pravidlo:** ve fázi 1 si lízne `(počet hráčů ve hře) + 1` karet, pak dá po jedné každému ostatnímu hráči ve hře a zbylé 2 si nechá.
- **Kde:** `logic/draw.js` – větev v `startDrawPhase` (vzor Kit Carlson), `clausState`, `logic/characters.js` `clausPick(revealIdx)` + `_clausAdvance()`, socket `claus_give`.
- **Průběh:** celá řada se odkryje naráz (klik na balíček), líce vidí jen Claus (`redactState`), ostatní ruby. Rozděluje klikáním – nejdřív sobě (`keep`), pak po jedné ostatním po směru; příjemci svítí postava (`clausState.toIdx`) a za každou kartou letí animace `claus_pick`.
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

✅ **Hotovo.** Testy: `test/fistful.events.test.js` (22) + cílená zátěž botů
„balíček samých Léček/Las/Soudců" v `test/server.bots.test.js`.

#### Léčka (`LECKA`)
- **Kde:** `core/distance.js` `computeDistance` – základ 1 místo výpočtu ze sedadel, **modifikátory platí dál** (Paul Regret, Rose Doolan, Mustang, Dalekohled) → `max(1, 1 + modifikátory)`.
- **Zrcadla:** žádná – funkce je sdílená serverem, klientem i botem. `core/distance.js` má standardní shim na `core/highNoon.js`; cyklus nevzniká (highNoon.js na distance.js nesahá).

#### Laso (`LASO`)
- **Kde:** `_boardDead()` v `logic/fistful.js`, zapojené přesně tam, kde už existuje analogický vypínač karet na stole u **Belle Star** (`_belleIgnoresBoard`) – jen platí pro všechny hráče a i na karty vlastní:
  - dostřel zbraně → 1 (Colt) v `computeCanHit`, `activateGreenCard` i `useDocHolyday`; **Volcanic tím ztrácí i neomezené Bang!** (`playBang`);
  - Mustang/Skrýš/Dalekohled/Hledí → `computeDistance` je ignoruje;
  - Barel → `_beginBangResolution` i `_advanceMassAttack` ho nepočítají (**Jourdonnaisova vrozená schopnost platí dál** – není to karta);
  - Dynamit a Vězení → `handleStartOfTurnChecks` je přeskočí (žádné sejmutí, dynamit se neposouvá, vězení tah nebere);
  - zelené karty → `activateGreenCard` odmítne, zelené Vedle! ze stolu v `handleResponse` neprojde.
- **Zrcadla:** `boardDeadFor` v `core/highNoon.js` → `core/playability.js` (Volcanic), `core/botPolicy.js` (`weaponReach`, aktivace zelené, zelená obrana) a `view/board.js` (`greenTurn`, `isRespondMiss`). **Bez nich se hra zasekne.**
- **Hrany:** karty zůstávají ležet, po kole zase fungují.

#### Soudce (`SOUDCE`)
- **Kde:** `_judgeBlocks(card)` v `logic/fistful.js`; gate v `playCard` (`WEAPON`/`EQUIPMENT`/`BARREL`/`DYNAMITE` + zelené) a v `playSpecialCard` (`JAIL`, ještě než karta opustí ruku).
- **Zrcadlo:** `judgeBlocksFor` v `core/highNoon.js` → jeden gate na začátku větve „můj tah" v `core/playability.js` (pokryje klienta i bota – oba jím prochází).
- **Hrany:** už vyložené karty fungují; aktivace zelené ze stolu i Hokynářství Uncle Willa jsou povolené.

---

### FÁZE 3 — Fáze lízání I: Pálenka, Právo západu · M

✅ **Hotovo.** Testy: `test/fistful.draw.test.js` (27), redakce v `test/server.rooms.test.js`
a cílená zátěž botů „balíček samých Pálenek a Práv západu" (se zapnutými Želízky)
v `test/server.bots.test.js`.

#### Pálenka (`PALENKA`)
- **Kde:** nový zdroj lízání `'liquor'`. `_drawOptionsBase()` (logic/draw.js) je jediný
  zdroj pravdy — dostane ho `_getDrawOptions` i vlastní fáze **Kita Carlsona a Clause**
  (rozhodují se dřív, než cokoli odkryjí). `drawCard('liquor')` ověří `options`
  a `cardsDrawn === 0`, zavolá `_heal(player, 1)` a rovnou `_finishDraw()` — fáze tedy
  končí obvyklou cestou (fronta odložených akcí, volba barvy pro Želízka).
- **UI:** tlačítko `🥃 PÁLENKA: +1 ❤️` v místě „Ukončit tah" (ve fázi lízání je volné).
  Server pro `'liquor'` neemituje žádnou animaci a posílá stav hned.
- **Hrany:** ocásek Kita za Příjezd vlaku volbu nemá (už líznul), odměna za banditu
  taky ne (není to lízání na začátku tahu), duch se napít smí (`_heal` → `isInPlay`).
- **Bot:** vezme ji zraněný s ≥ 3 kartami v ruce; duch ne (o život na konci tahu přijde).

#### Právo západu (`PRAVO_ZAPADU`)
- **Kde:** `_lawMark(player, card, nth)` v `logic/fistful.js` zapíše `player._lawCardId`
  pro **druhou** kartu fáze lízání. Volá se ze všech cest, kudy karta v téhle fázi
  doputuje do ruky: běžné líznutí a Black Jack (`logic/draw.js`), Kit Carlson
  (`kitCarlsonPick` — druhá **ponechaná**) a Claus (`clausPick` — rozdané se nepočítají).
  Nuluje se v `_beginTurn`, na začátku hráčova dalšího tahu.
- **`lawForcedCard(state, me, myIndex)` v `core/playability.js`** je **jediný zdroj
  pravdy**: karta je v ruce **a** `cardPlayability === true` **a** existuje konkrétní
  cíl (`_lawHasTarget` — Bang!/bang-efekt, Panika!, Cat Balou, Ragtime; zbytek pokrývá
  `cardPlayability`). Ptá se jím `tryEndTurn` (přes `GameState._lawForced`), bot
  i klient — rozejít se nesmí, jinak server tah tiše odmítne ukončit.
- **Odkrytí ostatním:** `redactState` (server/rooms.js) propustí tuhle jednu kartu
  v ruce hráče **na tahu**; klient ji ve vějíři soupeře nakreslí lícem (`drawHandCard`
  ve view/board.js, se stejnou podmínkou „je na tahu" kvůli debug hře).
- **UI:** vynucená karta v ruce svítí zlatě, „Ukončit tah" je zašedlé a nese
  `MUSÍŠ ZAHRÁT ⚡`.
- **Bot:** `forcedLawIntent` (core/botPolicy.js) hned na začátku `decidePlay` — vynucenou
  kartu zahraje jako první a cíl vybere „nejdřív nejpravděpodobnější nepřítel, jinak
  kdokoli platný" (práh nepřátelskosti by v koncovce nikoho nepustil = stall).
- **Hrany:** Žízeň (líže se 1) → žádná vynucená karta. Želízka mají přednost (zakázaná
  barva → `cardPlayability` false → nic nevynucuje). Peyote je z téhož balíčku, takže
  se nikdy nepotkají.

---

### FÁZE 4 — Fáze lízání II: Peyote a Ranč · L

✅ **Hotovo.**

#### Peyote (`PEYOTE`)
- **Kde:** `logic/fistful.js` `startPeyote()` volané ze `startDrawPhase` **hned za volbou Very Custer** (kopírovanou postavu si volí na celý tah, i když se v něm nelíže) a před větvemi Kita/Jesseho/Pedra/Pata/Black Jacka/Clause, fáze `PEYOTE`, `pendingPeyote`, akce `peyote_guess { red }`.
- **⚠️ Výjimka z pravidel (tvoje zadání):** hádání se vyhodnocuje proti **vytištěné `card.suit`**, ne `_effSuit`. S Požehnáním/Prokletím (obojí z HN, může běžet zároveň) by jinak byla každá karta uhodnutá a hráč by si líznul celý balíček. Jakmile karta **dosedne do ruky**, platí pro ni přebarvení normálně – to je zadarmo, `_effSuit` se počítá až při použití. Jsou to **jediná dvě místa v kódu, kde se `card.suit` čte napřímo**: `peyoteGuess` (logic/fistful.js) a jeho zrcadlo ve větvi `PEYOTE` bota (core/botPolicy.js) – kdyby bot počítal přes `effSuit`, tipoval by pod Požehnáním proti pravidlům. Obě místa mají velký komentář a vlastní test.
- **UI:** tlačítka „♥ ♦ ČERVENÁ" / „♠ ♣ ČERNÁ" (oba slotky u pravého okraje). Odkrytá karta jede **zkráceným sejmutím** (`startPeyoteReveal` v net/handlers.js, časování `core/fistfulAnim.js`) a pak letí do ruky, nebo do odhozu. Výdrž je polovilní proti klasickému sejmutí (1500 vs 3000 ms) – při šňůře správných tipů se to přehraje i pětkrát za sebou. Server o stejnou dobu drží boty (`room._revealBlockUntil`).
- **Hrany:** končí přes `_finishDraw()` s `isStartOfTurn: true`, aby navázala Želízka i Ranč. Došlý balíček se zamíchá standardní cestou.
- **Bot:** větev `PEYOTE` – hádá barvu, které je v odhozu a ve vlastní ruce vidět míň (té tedy v balíčku zbývá víc); pokračuje, dokud uhodne.

#### Ranč (`RANC`)
- **Kde:** `_startRanch()` z `_finishDraw` **za** Želízkami (HN má přednost – když se čeká na barvu, pustí Ranč na řadu až `chooseHandcuffsSuit`), fáze `RANCH`, akce `ranch_exchange { cardIds }` (prázdné pole = přeskočit).
- **UI:** označování karet v ruce (druhý klik odznačí) + tlačítka „Vyměnit (N)" a „Přeskočit".
- **Hrany:** líznutí proběhne naráz (hráč už rozhodl). Suzy s prázdnou rukou nezůstane.
- **Bot:** vymění karty pod prahem `keepScore` (max 3), jinak přeskočí.

**Testy:** `test/fistful.peyote.test.js` (24) – Peyote uhodl/neuhodl, přebíjí Kita/Clause/
Jesseho/Pedra/Pata/Black Jacka, **Požehnání ani Prokletí ho neovlivní** (u bota taky),
Žízeň/Příjezd vlaku nic nemění, duch hádá taky, prázdný balíček fázi jen ukončí,
navazují Želízka; Ranč vymění přesný počet, přeskočení funguje, cizí/zdvojená ID se
ignorují, prázdná ruka se neptá, tah nejde ukončit, Suzy zůstane v klidu, klik označuje.
Navíc zátěž „20 her jen botů s balíčkem samých Peyote a Rančů" (`test/server.bots.test.js`).

---

### FÁZE 5 — Opuštěný důl · M

**Pravidlo (R7):** po celé kolo si obě hromádky **vymění role** – líže se z odhozu,
odhazuje se lícem dolů na dobírací balíček. Bez výjimek: fáze lízání, kontrolní sejmutí,
Lucky Duke, Dostavník, hokynářství, odměny, pozůstalost vyřazeného. Končí to ve chvíli,
kdy odhoz dojde.

**Server – prohození patří do `Deck`, ne do pravidel**

`logic/entities.js` `Deck` je už dnes jediná cesta, kudy se líže (`draw()`); odhazování
je rozsypané po `deck.discardPile.push(...)`. Dostane proto tři metody a příznak:

```js
deck.mineMode                 // zapíná GameState podle aktivní události
get _drawPile()    { return this.mineMode ? this.discardPile : this.cards; }
get _discardPile() { return this.mineMode ? this.cards : this.discardPile; }
draw()             // popuje z _drawPile; prázdný odhoz v mineMode → nahlásí vyčerpání
discard(card)      // push na _discardPile
returnToTop(card)  // push na _drawPile (Kit Carlson vrací nevybrané karty)
```

- **Lízání je tím hotové jedním místem** – `draw()` používají úplně všechny cesty.
- **Odhazování:** mechanicky nahradit **42 ze 45** `deck.discardPile.push(x)` → `deck.discard(x)`. Vynechají se jen 3 uvnitř `Deck` (míchací mechanika).
- **`logic/draw.js:260`** (Kit vrací nevybrané karty na balíček) → `deck.returnToTop(...)`, aby je vracel na tu hromádku, ze které je vzal.
- **`openStore`** čte `deck.cards.length` jako „kolik karet měl balíček před rozdáním" (řídí cinematiku hokynářství) – musí se ptát délky **dobírané** hromádky, jinak se rozdávání spočítá špatně.
- **Vypnutí:** `GameState._mineOff` se nastaví, jakmile `draw()` nahlásí prázdný odhoz; drží se do konce kola (nuluje se při výměně události). `deck.mineMode` se přepočítá na začátku každého tahu.
- `drawForCheck` v `Deck` je mrtvý kód (nikdo ho nevolá) – buď smazat, nebo taky převést.

**Klient – dvě funkce a jeden nový doběh**
- `deckTopPos()` a `discardTopPos()` (game.js) jsou **jediné dva body**, odkud/kam všechny animace míří (včetně cinematiky vyřazení a odkrývání kontrolní karty). Při aktivním dole se prostě prohodí.
- **Klikatelná je hromádka, ze které se líže** – zvýraznění „lízni si" ve `view/board.js` se musí ptát přes stejný přepínač. Klikání na odhoz už existuje (Pedro Ramirez), takže se jen rozšíří podmínka.
- Nový doběh letu do „odhozu": karta **dosedne lícem nahoru, vydrží ~900 ms a pak se překlopí na rub** (`animateCardFlip` umí obojí) – jako u stolu. Doplnit do `ANIM_MS`, fronta animací tím drží stav o tu chvíli déle.

**Hrany**
- Balíček během kola jen roste (žádné domíchání), odhoz se vyprazdňuje.
- **Líže se z veřejné hromádky** – všichni vidí dopředu, co si kdo lízne, včetně kontrolního sejmutí. To je pointa karty, ne chyba.
- Peyote je z téhož balíčku, takže se s dolem nikdy nepotká.
- **Bot:** větev `DRAW` musí umět „ber z hromádky, ze které se líže, ať je nahoře cokoli" (dnes bere z odhozu jen Bang!/Pivo/Vedle!) – jinak stall.

**Testy:** zahraná karta skončí na balíčku a nelze si ji líznout; kontrolní sejmutí bere
z odhozu a odchází na balíček; Kit vrací nevybrané do odhozu; prázdný odhoz vypne důl na
zbytek kola; hokynářství rozdá správný počet.

✅ **Hotovo.** `test/fistful.mine.test.js` (17) + „20 her jen botů s balíčkem samých
Opuštěných dolů" (`test/server.bots.test.js`) + redakce `deck.mineMode`
(`test/server.rooms.test.js`) + funkční `maxLagMs` (`test/animQueue.test.js`).
Podrobnosti jsou v CLAUDE.md, sekce „Opuštěný důl".

---

### FÁZE 6 — Start tahu: Pokrevní bratři, Fistful of Cards, Mrtvý muž · L

✅ **Hotovo.** `test/fistful.turn.test.js` (25) + „20 her jen botů s balíčkem samých
Pokrevních bratrů / Mrtvých mužů / Fistfulů" (`test/server.bots.test.js`).
Podrobnosti jsou v CLAUDE.md, sekce „Start tahu (Fistful)".

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

✅ **Hotovo.** `test/fistful.roulette.test.js` (31) + „20 her jen botů s balíčkem samých
Ruských ruletí a Vendet" (`test/server.bots.test.js`) + autorizace `roulette_discard`
(`test/server.guard.test.js`). Podrobnosti viz odchylky nahoře.

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
2. **Trychtýř odhozu (fáze 5)** sahá na 42 míst v pravidlech. Riziko je nízké (mechanická
   záměna `discardPile.push(x)` → `discard(x)`), ale musí projít celý `npm test` a zátěž
   botů; dělám ho proto samostatným commitem.
3. **Render neumím ověřit** – po fázích 0, 4, 5, 6, 7 a 8 tě požádám o kontrolu v prohlížeči.
4. **Delší intro** při obou rozšířeních (~+7,6 s).
5. **Rozpočet postav:** 8 hráčů × 2 nabídky = 16; základ má přesně 16, s Fistfulem 19,
   s Dodge City 31/34. Smoke test na `setupGame(8)` ve všech kombinacích platí dál.
6. **Dvě aktivní události najednou** je stav, který dosud nemohl nastat. Vlastní test dostanou
   dvojice: Peyote × Požehnání, Mrtvý muž × Město duchů, Vendeta × Město duchů,
   Fistful × Pravé poledne, Laso × Vězení/Dynamit, Ranč × Želízka.
7. **Placeholder textury** musí ležet v `assets/` jako reálné soubory, jinak se hra kvůli
   `critical` assetům nesestaví.
