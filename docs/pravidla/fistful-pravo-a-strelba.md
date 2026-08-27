# A Fistful of Cards — Právo západu, Odstřelovač, Odražená střela

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

## Právo západu (A Fistful of Cards): vynucená karta zamyká zbytek tahu

Druhá karta, kterou hráč ve fázi lízání vezme do ruky, se **veřejně ukáže** a musí ji
v tomhle tahu zahrát, pokud to jde. Jediný zdroj pravdy je `lawForcedCard`
([core/playability.js](core/playability.js)) – ptá se jím server (`_lawForced`), klient
(zlaté zvýraznění, zašedlé „Ukončit tah") i bot. Rozejít se nesmí, jinak by server tah
tiše odmítal ukončit a bot by posílal `end_turn` donekonečna.

- **Zámek zbytku tahu** — `_lawLocked(playerIdx, card)` ([logic/fistful.js](logic/fistful.js)).
  Dokud hráč vynucenou kartu drží a JDE zahrát, nesmí udělat nic jiného: `playCard`,
  `playBang`, `playSpecialCard`, `startDiscardExtra`, `activateGreenCard` a všechny aktivní
  schopnosti (Sid Ketchum, Uncle Will, Chuck Wengam, José Delgado, Doc Holyday) se na něj
  ptají. Bez toho jde povinnost snadno obejít: zahrát Pivo, aby se hráč doléčil a vynucený
  **Salón** přestal jít zahrát; zahrát **jiný Bang!** a vyčerpat jím limit (s Volcanicem
  se druhý Bang! prostě zahraje až PO tom vynuceném); nebo si kartu odhodit schopností.
  Klientské zrcadlo je jeden gate na začátku větve `isMyPlayTurn` v `cardPlayability`
  (zbytek ruky se rovnou zašedne) – zacyklení nehrozí, pro samotnou vynucenou kartu se
  gate přeskočí ještě před dotazem na `lawForcedCard`.
- **Bang! bez cíle míří na sebe** — `_lawHasTarget` u `SHOOT` vrací **vždy true**: když
  hráč na nikoho jiného nedosáhne, musí střelit sám sebe (`lawSelfShootOnly`). Klient mu
  k tomu výjimečně zvýrazní **vlastní postavu** (`drawMyArea`), bot má stejný fallback
  v `forcedLawIntent`. Bez toho se hra zasekne: `end_turn` server odmítne a jinou kartu
  hráč hrát nesmí.
- **Karta se ukáže veřejně, v ruce je pak zase tajná** — cinematika `law_reveal`
  (`startLawReveal` v [net/handlers.js](net/handlers.js), časování `LAW_ANIM`/`lawRevealMs`
  v [core/fistfulAnim.js](core/fistfulAnim.js)): karta vyletí doprostřed obrazovky,
  překlopí se, chvíli drží a pak jde do ruky – ostatním se cestou překlopí zpět na rub.
  Je to totéž tělo jako u Peyote (`startDeckCardReveal`), jen **bez pulzující marky**
  (nezkoumá se hodnota ani barva). `redactState` proto vynucenou kartu **nepouští** –
  v cizí ruce leží rubem nahoru jako každá jiná.
  Zdroje vynucené karty a jejich cinematika:
  | odkud | co se přehraje |
  |---|---|
  | běžná 2. karta z balíčku | `law_reveal` (`from` chybí → start na balíčku) |
  | Black Jack | jeho vlastní `BLACK_JACK_CHECK` reveal – ten markami **bliká** (barvu opravdu zkoumá), takže se `law_reveal` neposílá |
  | Claus "The Saint" | `law_reveal` s `from: 'claus'` – rozdávání se zastaví, karta vyletí ze své pozice v řadě a pak jde do ruky |
  | Kit Carlson | `law_reveal` s `from: 'kit'` – vlastník má odkrytou řadu uprostřed, ostatní parkující ruby u jeho místa (spotřebuje se jedna, jinak by ji `finishKitCarlsonSpectator` poslal do ruky ještě jednou). Klient u téhle volby vynechá vlastní let do ruky (`_kitLawPick` ve [view/board.js](view/board.js)) |
- **Z odkryté řady (Kit Carlson, Claus) je vynucená druhá karta v pořadí BALÍČKU, ne
  v pořadí klikání** – FAQ Q12: *„vybere si dvě a ukáže tu druhou (pozor, pořadí karet
  měnit nesmí!)"*. Jinak by si hráč vybíral, která karta ho bude v tahu držet. Řada leží
  v pořadí balíčku (index 0 = vrchní), takže `_lawMarkFromRow`
  ([logic/fistful.js](logic/fistful.js)) jen seřadí PONECHANÉ indexy a vezme ten druhý;
  volá se **až po posledním výběru** (dřív se neví, která to bude), a se Žízní (jedna
  ponechaná) žádná vynucená není. Dvě věci z toho plynou:
  - **Vynucená karta nemusí být ta, na kterou hráč právě klikl.** Serverové handlery ji
    proto hledají v řadě podle ID (`lawSlot`), ne podle indexu kliku, a u Clause se navíc
    může stát, že se pošle `claus_pick` (právě vybraná) **i** `law_reveal` (dřívější).
  - **Když vynucená vyjde na kartu vybranou dřív, je už v ruce.** `law_reveal` ji odtud
    vytáhne zpátky doprostřed – `startDeckCardReveal` si ji po dobu letu schová
    (`App.pendingDrawIds`), takže se nikdy nezdvojí.
- **Zlaté zvýraznění přebíjí všechna ostatní** — nastavuje se ve `drawMyArea` až úplně
  nakonec (i za zeleným zvýrazněním právě vybrané karty, ta se pozná vysunutím) a drží
  i po hover-outu. Hráč musí pořád vidět, která karta ho v tahu drží.

## Odstřelovač a Odražená střela (Fistful): dva nové způsoby, jak zahrát Bang!

Co se počítá za „kartu Bang!" (Bang!, u Calamity Janet i Vedle!, a musí projít Želízky)
je jediný helper **`bangCardFromHand`** ([core/playability.js](core/playability.js)) –
ptá se jím server, klient i bot.

### Odstřelovač (`ODSTRELOVAC`)

„Hráč smí ve svém tahu odhodit 2 karty Bang! najednou proti jinému hráči: ten se ubrání
jen dvěma kartami Vedle!."

- **Recykluje „odhoď další kartu" z Dodge City.** `startSniper` postaví tentýž
  `pendingDiscardAnother` (jen `effect: 'sniper'`), takže fáze `DISCARD_ANOTHER`,
  klientský výběr ceny, guard i větev bota fungují **bez úprav**. V
  [logic/dodgeCity.js](logic/dodgeCity.js) přibyly jen dva háky: validace ceny
  (`_sniperPayValid`) a dispatch (`_sniperAttack`).
- **Barel i Jourdonnais fungují**: `_sniperAttack` jde obyčejnou cestou
  `_beginBangResolution` s `missesNeeded = 2`. Úspěšné sejmutí se počítá za JEDNU ze dvou
  karet Vedle!, druhou musí hráč dohrát; neúspěšné nechá obranu na dvou. `missesNeeded`
  se proto protahuje celým řetězem (`_beginBangResolution` → `pendingBarrelCheck` →
  `startBarrelCheck` → `currentCheck` → `_applyCheckResult` → `waitForMissed`) – **bez
  něj by po neúspěšném barelu spadla obrana na jedno Vedle!**, protože útočník Slab
  být nemusí. Slabův bonus se s dvojkou nesčítá.
- **Nepočítá se jako zahraný Bang!** (FAQ Q07): `bangsPlayedThisTurn` se nezvyšuje, takže
  jde Odstřelovače opakovat, dokud jsou v ruce karty Bang!, a hráč si k tomu ve stejném
  tahu ještě vystřelí normální Bang!. Kazatel (High Noon) ho zakazuje dál – ten zakazuje
  kartu Bang! zahrát vůbec. Kvůli tomu musí `cardPlayability` (stejně jako u Odražené
  střely) kartu Bang! pustit i s vyčerpaným limitem; `bangAtPlayerOk` pak klientovi
  zhasne postavy a botovi zakáže větev `play_bang`.
- **Apache Kida mine jen tehdy, když jsou kárové OBĚ karty** – útok je z nich složený.
  Klient ani bot to nemusí zrcadlit: útok naprázdno je legální terminální stav.
- **UI:** tlačítko „🎯 ODSTŘELOVAČ: 2× BANG!" obsadí slot schopností (Sid/Chuck/José/
  Doc/Will se po dobu míření nekreslí – stejná dohoda jako u Peyote a Ranče), pak klik
  na postavu cíle a nakonec výběr druhé karty Bang! v ruce (ostatní jsou zašedlé).

### Odražená střela (`ODRAZENA_STRELA`)

„Hráči smí hrát karty Bang! proti kartám vyloženým před ostatními hráči. Zasažený hráč
smí kartu zachránit kartou Vedle!, jinak je karta odhozena."

- **Chová se jako normální Bang!** (R3), takže se beze zbytku recykluje
  `_beginBangResolution`: Barel i Jourdonnais mohou kartu zachránit, Slab vyžaduje
  2× Vedle! a kárová střela na Apache Kida nemá efekt. Nový je jen objekt
  `ricochet = { targetIdx, area, cardId }`, který se **protahuje celým řetězem**:
  `_beginBangResolution` → `pendingBarrelCheck` → `startBarrelCheck` (i checkContext
  Lucky Duka) → `currentCheck` → `waitForMissed` → `pendingResponse`. V `handleResponse`
  pak stačí jediná odbočka: místo `handleDamage` se volá `_ricochetDestroy`.
- **Dostřel NEPLATÍ** (FAQ Q15): střílí se na kteroukoli vyloženou kartu u stolu bez
  ohledu na vzdálenost – `ricochetTargetOk` se ptá jen „je to někdo jiný a je ve hře".
  Mustang/Skrýš, Paul Regret ani Laso proto cílení nijak nemění.
  **Do limitu 1× Bang!/tah se to nepočítá** (R2). Kvůli R2 musí
  `cardPlayability` pustit kartu Bang! i s vyčerpaným limitem – jinak by ji nešlo ani
  vybrat. Přibyl proto **`bangAtPlayerOk`**: klient s ním zhasne POSTAVY (na ty už se
  střílet nedá, svítí jen vyložené karty) a bot přeskočí větev `play_bang`. **Bez toho
  by klient nabízel výstřel, který server mlčky zahodí, a bot by ho posílal donekonečna.**
- **Pivo ani Sid Ketchum kartu nezachrání** – ohrožený není život, ale karta. Gate je
  v `beerLastLifeSave`/`sidLastLifeSave` a zrcadlí ho `cardPlayability`, zvýraznění
  v `drawMyArea` i větev bota; bez něj by šlo za jedno Pivo ubránit cokoli.
- **Zasažené Vězení hráče osvobodí, sestřelená zbraň se vrací na Colt .45** – obojí
  vyplyne samo z toho, že karta prostě zmizí ze stolu.
- **Blikání útočníka se odpojilo od jména postavy**: `attackHighlight`
  ([view/board.js](view/board.js)) rozhoduje jen podle `missesRequired > 1` u požadavku
  Vedle!, takže bliká i Odstřelovač (jehož útočník žádnou zvláštní schopnost mít nemusí).
- **Animace** `ricochet_shot` ([net/handlers.js](net/handlers.js)): karta Bang! letí
  z ruky na zasaženou kartu a odtud do odhozu (320 + 250 ms). Se zasaženou kartou se
  přitom nehýbe – její případný odlet přijde zvlášť jako `board_to_discard` přes
  `lastAnimEvent`. Typ je i v `MINE_LAND_TYPES` (končí v odhozu → pod Opuštěným dolem
  má doběh s překlopením na rub).

