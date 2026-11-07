# Rozšíření Zlatá horečka (Gold Rush) — podrobně


Pravidlový podklad je [docs/zlata-horecka.md](../zlata-horecka.md) (texty všech 24 karet
s cenami, 8 postav, oficiální FAQ Q01–Q15, sken karet dV Giochi), implementační plán
[docs/zlata-horecka-plan.md](../zlata-horecka-plan.md) — karta po kartě, s háky, pořadím
prací (§9) a rozhodnutími R1–R16. **Art všech 15 karet vybavení a rub balíčku je ve hře**
(`assets/zlata_horecka_cards/<art>.webp`, `assets/other_cards/zlata_horecka/zlata_horecka_back.webp`;
jména karet v datech jsou podle něj). **Portréty 8 postav (042–049) jsou ve hře taky**
(`assets/characters/0NN.webp`, číslo = `id` v characters.json, tedy abecedně).

**Hotová je fáze 0 (měna), fáze 1 (obchod), fáze 2 (pasivní černé vybavení), fáze 3
(placené černé vybavení), fáze 4 (hnědé karty s volbou), fáze 5 (Wanted) a fáze 6
(8 postav).** Rozšíření jde zapnout (běžná hra / hra botů / debug), valouny přibývají,
kupuje se z obchodu, vybavení leží před hráčem a Pivo jde vyměnit za valoun. **Všech 15
druhů karet vybavení (24 kusů) i všech 8 postav je hotových**, takže `GEAR_READY`
i `GOLD_RUSH_READY` jsou dnes celé seznamy a zůstávají jen jako pojistka pro další
rozšíření (vzor `WILD_WEST_READY`). **Fáze 7 (varianta Stínoví pistolníci) je hotová
taky**, a **fáze 8** (nákupní politika bota: ocenění vybavení po majiteli `gearValueFor`
a šetření na lepší kartu `gearSaveFor` v core/botPolicy.js; invarianty rozložení rubu
vybavení) uzavřela celé rozšíření.

- **Stínoví pistolníci** = vlastní přepínač **`options.shadowGunslingers`**, nezávislý na
  rozšíření (R14; pokročilá volba na S5, zaškrtávátko na S11 a S16), mixin
  [logic/shadow.js](../../logic/shadow.js). Vyřazený se na KAŽDÝ svůj tah vrací jako stín
  (`p._shadow`, jen po dobu vlastního tahu – vzor Město duchů): 0 životů, 2 karty, na konci
  tahu odhodí ruku, stůl, zbraň i vybavení (`_shadowStrip` už v `tryEndTurn`, aby tah navíc
  začínal s prázdnýma rukama) a odchází (`_teardownShadow` v `nextTurn`). Pořadí návratů
  v `nextTurn`: Mrtvý muž → Hřbitov → Město duchů → stín. **Ztratit život nemůže sám od
  sebe** (má nulu, takže ho `handleDamage` i klikané zásahy míjejí); **získat nesmí** –
  to hlídá jediný predikát **`canHeal(p)`** (core/distance.js), na který se převedla
  všechna léčení na serveru, u klienta i u bota. `isInPlay` ho po dobu tahu počítá,
  `evaluateWinner` ne (zůstává mu nula – na rozdíl od ducha). Odchod NENÍ vyřazení:
  Vulture Sam, Greg Digger ani Herb Hunter nic (FAQ Q09); první vyřazení běží beze změny.
  **Stínový odpadlík** se na začátku stínového tahu přidá ke straně s víc odhalenými
  kartami rolí (remíza → bandité, `_shadowSideFor`) a nese ji v `p._shadowSide`; vyhrává
  s ní (`playerWon`) a bot za ni střílí – oboje přes **`teamRole(p)`** (core/roles.js).
  Kartu role kreslí `roleTexFor` (view/board.js); art `assets/roles/odpadlik_stin_*.webp`
  zatím chybí, místo něj stojí karta strany.

- **Rozšíření = `options.expansions.zlata_horecka`**, data `cards.zlata_horecka.json`
  (15 druhů → 24 kusů podle `copies`, id `600–614` → kusy `6000, 6001, …`).
- **Valoun za KAŽDÉ způsobené zranění** má jediné místo — `handleDamage`
  ([logic/combat.js](../../logic/combat.js)). Kulomet, Indiáni i Duel sem chodí jednou za oběť,
  takže se příklad z pravidel (3 zásahy = 3 valouny) veze zdarma. Co jde mimo `handleDamage`
  (dynamit, události, pokuta Madam Zuzany a Roubíku, Chuck Wengam), valoun nikomu nedává —
  nikdo tam nikomu zranění *nezpůsobil*.
- **Ztráta života má v kódu tři vstupy**, proto přibyl trychtýř
  **`_afterLifeLost(playerIdx, { attackerIdx, last })`** ([logic/goldRush.js](../../logic/goldRush.js)),
  volaný z `handleDamage`, `takeDynamiteHit` (obojí logic/combat.js) i `useChuckWengam`
  (logic/characters.js). Boty, Talisman a Simeon Picos reagují na ztrátu života z JAKÉHOKOLI
  zdroje, takže bez něj by tiše nefungovaly zrovna na dynamitu (rozhodnutí R5). Boty
  a Talisman v něm už sedí, Simeon Picos přibude ve fázi 6 — DO NĚHO, ne k volajícím.
  `last: true` vypíná Boty i Talisman („neúčinkují při ztrátě posledního života"),
  Simeona Picose ne.
- **Zapnutí rozšíření drží vlastní příznak `_goldRush`**, ne „balíček není prázdný" — kusů
  je 24 a všechny mohou být rozkoupené, takže by valouny uprostřed hry přestaly přibývat.
  Ptá se jím `_goldRushOn()`.
- **Redakce**: `gearDeck` se skrývá (jeho pořadí je příští nabídka obchodu), `gearRow`,
  `gearPile`, `player.gear` i `player.nuggets` jsou VEŘEJNÉ — pravidla říkají „pokládejte
  viditelně před sebe".
- **Loader assetů** (`EXPANSION_LOADERS.zlata_horecka` v [game.js](../../game.js)) stahuje rub
  balíčku (`zh_back`, jediný `critical` – je vidět hned v intru) a líce karet pod klíčem
  **`zh_art_<art>`**, NE `zh_<effect>`: ten od `create()` drží RenderTextura se štítkem
  a duplicitní klíč by Phaser přeskočil. Líc karty se tedy kreslí DO RenderTextury
  `zh_<effect>` (`buildGearTextures`): s artem v cache art, jinak čitelný ŠTÍTEK z dat
  (rám podle `border`, jméno, text, cena). Volá se z `create()` a znovu po dotažení artu –
  přemaluje tutéž RT (jako Požehnání/Prokletí u hracích karet), takže sprity vzniklé dřív
  ukážou art samy. Rub se kreslí přes `gearBackTex()` (do dotažení rub hrací karty).
  **Nákup má animaci letu** z balíčku vybavení na místo před hráčem (`gear_acquire`,
  viz řádek core/goldRushAnim.js) – okno obchodu se proto po nákupu zavře, jinak by let zakrylo.
- **Obchod se na desku nevešel.** Po zapnutí tří balíčků událostí zabírá vodorovné pásmo
  balíčků x 420–1330 a nad ním leží druhá řada karet horních soupeřů; 3 karty lícem vzhůru
  + rub tam místo nemají. Na stole proto leží jen **rub balíčku vybavení**
  (`gearSlot` v [core/layout.js](../../core/layout.js), x 1385 — napravo od High Noonu, nalevo od
  pravého soupeře; hlídají to invarianty v `test/positions.test.js`) a klik na něj otevře
  **překryvné okno** `renderGearShopOverlay` ([view/screens.js](../../view/screens.js)), ve kterém
  jsou dvě možnosti fáze 2: nákup a „donutit odhodit vybavení" (nabije režim a zavře
  okno — pak se kliká na kartu soupeře). Třetí, **Pivo za valoun**, je tlačítko
  „ZA VALOUN" u vybrané karty Pivo (view/board.js, slot `abilExtraSlot` vedle „ZAHRÁT
  JAKO BANG!"); Pivo s plnými životy se proto vybírá bez akce (`decideCardClick`,
  core/selection.js) a svítí jako hratelné. Okno drží `App.gearShop`
  a zavírá se samo, jakmile fáze opustí PLAY, aby nespolklo klik, na který se čeká.
- **Vybavení se kreslí v pásu vyložených karet, ale AŽ ZA skutečnými kartami** (a za dvojicí
  Greygoryho Decka) — indexy karet na stole se tím nehnou, jen se pás roztáhne. Zrcadlí to
  `_gearBandCount` v [positions.js](../../positions.js) (hlídá test) a platí i pro `_oppPortraitPos`,
  jinak by portrét soupeře jel po jiné dráze, než po jaké se kreslí.
- **Vybavení se ptá jedním dotazem, jestli PLATÍ** — `_gearOn(player, effect)`
  ([logic/goldRush.js](../../logic/goldRush.js), zrcadlo `gearOnFor` v [core/goldRush.js](../../core/goldRush.js)).
  Kromě vlastnictví (`_gearHas`) v něm sedí obě karty, které vybavení VYPÍNAJÍ (R10):
  **Laso** (Fistful, celý stůl) a **Belle Star** (Dodge City, ve svém tahu cizí karty na
  stole). Vypnutá karta pořád LEŽÍ před hráčem, takže se nákup, „ne dvě stejného" ani
  vynucené odhození ptají dál `_gearHas` — na `_gearOn` se ptají jen pravidlové háky.
- **Šest pasivních karet fáze 2 nemá vlastní metodu** — každá jen doplnila podmínku
  do háku, který už existoval: **Boty** a **Talisman** do `_afterLifeLost`, **Nábojový pás**
  do `_handLimit` ([logic.js](../../logic.js), `max(životy, 8)` — Big Spencer má 9 a nesmí si
  pohoršit), **Krumpáč** do `_drawCountFor` ([logic/draw.js](../../logic/draw.js)), **Kalumet**
  do `_apacheImmune` ([logic.js](../../logic.js)) a **Podkova** do `_checkRevealCount`
  ([logic/characters.js](../../logic/characters.js)).
  - **Boty** líznou přes FRONTU odložených akcí (`GEAR_BOOTS_DRAW` → vlastní klikací fáze
    `BOOTS_DRAW`), přesně jako Bart Cassidy — kdo má obojí, líže dvakrát. Fáze čeká na klik
    majitele, takže se musí čistit v `_pruneSuzyQueue`, kdyby mezitím ze hry odešel.
  - **Krumpáč** se veze i postavám, které fázi 1 mění, protože `_drawCountFor` je jediný
    zdroj: Kit Carlson odkrývá pořád 3 karty a nechá si 2 (kartu navíc dolízne z balíčku —
    stejně jako pod Příjezdem vlaku), Black Jackovi se +1 přičte k základu.
  - **Kalumet** je Apache Kid jako vybavení, proto sdílí `_apacheImmune`. Jediný rozdíl je
    dodatek „**toto vybavení nemá efekt v průběhu duelu**" = `opts.duel` na obou duelových
    cestách (`playSpecialCard` a opakování Lee Van Kliffem); Apache Kida kárový Duel dál míjí.
  - **Podkova** nemá vlastní mechaniku — jede po fázi `LUCKY_DUKE`. Kolik karet se u sejmutí
    odkryje, říká **`_checkRevealCount(player)`**: 1 klasicky, 2 s Lucky Dukem NEBO Podkovou,
    **3 s obojím** (sčítají se, R8). Je to jediné místo, kde se to počítá — ptá se jím všech
    pět cest, kudy se snímá. Popisek čekání se řídí `luckyDukeState.via` (klientský panel
    umí tři karty, geometrie je sdílená v `getLuckySlotPos`, [positions.js](../../positions.js)).
- **Fáze `GEAR_TARGET`** (Panák: „hráč dle tvé volby, i ty"; cílené režimy Láhve a Komplice;
  Wanted: „na libovolného hráče") je jediná fáze, kterou obchod má — nákup sám fází NENÍ
  (rozhodnutí R6). Cíl se vybírá klikem na postavu (stejný vzor jako Pokrevní
  bratři) – i SEBE si hráč vybere klikem na vlastní portrét (`gearSelfPick` v drawMyArea, bug 74).
- **Hnědé karty s volbou (fáze 4): Láhev a Komplic.** „Může být zahrána jako Panika!, Pivo
  nebo BANG!" / „…jako Hokynářství, Duel nebo Cat Balou." Dodatek „NEPOVAŽUJE SE za tu
  kartu" znamená, že se na ně nevztahuje nic, co se ptá na kartu samotnou: limit 1× BANG!/tah,
  Slabův bonus, Kazatel, „Pivo ve dvou hráčích", +2 Tequily Joea (FAQ Q14), paměť Lee Van
  Kliffa ani počítadlo Madam Zuzany. **Způsob se volí S NÁKUPEM** (`gear_buy { rowIdx, mode }`,
  tlačítka pod kartou v okně obchodu), ne po zaplacení — kdo zaplatí a pak zjistí, že zvolený
  způsob nemá na koho, přišel by o valouny zadarmo. Jediný zdroj pravdy „co jde, komu a proč
  ne" je trojice **`gearModesOf`/`gearModeTargets`/`gearCardReason`** v
  [core/goldRush.js](../../core/goldRush.js) (ptá se jí server, okno obchodu i bot). Efekt pak jede
  **`_repeatBrownEffect`** ([logic/wildWest.js](../../logic/wildWest.js)) — týmž tělem, jakým Lee
  Van Kliff spouští „efekt karty bez karty samotné", takže se veze Barel, Jourdonnais,
  Belle Star, výběr karty soupeře i duel. Láhev jako BANG! jde jako **bang-EFEKT**
  (`BANG_EFFECT`), čímž zdarma padá limit i Slab.
- **Rum** („Otoč! 4 karty: doplň si 1 život za každou různou barvu") je sejmutí, takže
  `_checkRevealCount` přidává kartu za Lucky Duka i Podkovu (5, s obojím 6 — FAQ Q05, R8),
  barvu čte `_effSuit` (pod Požehnáním jediná) a John Pain si otočené karty bere po jedné
  (FAQ Q12). „Vybrat výsledek" tu nic neznamená — počítají se VŠECHNY otočené karty. Karty
  se do odhozu pouštějí až po otočení poslední: dřív by je domíchání balíčku uprostřed
  vrátilo do hry. Má vlastní cinematiku (`gear_rum`, časování [core/goldRushAnim.js](../../core/goldRushAnim.js)).
- **Karta Zlatá horečka** („Tvůj tah končí. Doplň si všechny životy a zahraj další tah")
  jede v pořadí podle textu: `tryEndTurn` dohraje konec tahu (odhoz nad limit podle životů
  PŘED doléčením, Madam Zuzana, Vendeta) a doléčení s tahem navíc přijde až v háku
  **`_gearExtraTurnCheck`** v `nextTurn` (logic.js), hned za Vendetou. Tah navíc je
  Vendetin (`_vendettaExtraTurn('Zlatá horečka')`), tedy plnohodnotný. Koupit ji nejde pod
  **Právem západu** s vynucenou kartou (tah by nešlo ukončit) ani **duchovi** (na konci tahu
  odchází — stejný výklad jako FAQ Q13 u Dona Bella). Příznak nese HRÁČ (`p._gearExtraTurn`),
  ne sedadlo, a háček ho shodí i tehdy, když se tah navíc nekoná (hráč na konci tahu umřel).
- **Placené vybavení (fáze 3) se používá KLIKEM NA KARTU** v mém pásu vybavení, stejně
  jako zelené karty Dodge City. Co je klikací, říkají zrcadla `gearPanOk` /
  `gearRucksackOk` / `gearRucksackSaveOk` ([core/goldRush.js](../../core/goldRush.js)).
  - **Rýžovací mísa** (`gearPanUse`) za 1 valoun otevře běžnou fázi lízání mimo začátek
    tahu na 1 kartu — líže se klikem na balíček jako u Union Pacific. „Až 2× za tah" drží
    `p._panTurn`/`p._panUses` klíčované `turnId`, takže se nic nenuluje.
  - **Batoh** je jedna akce `gear_rucksack`: ve fázi PLAY za 2 valouny léčí, mimo ni je to
    **třetí záchrana posledního života** `rucksackLastLifeSave`
    ([logic/response.js](../../logic/response.js)) vedle Piva a Sida — tytéž tři fáze a totéž
    rozcestí `_advanceAfterLastLifeSave`. **Není to Pivo**: limit „ve dvou hráčích",
    Kazatel ani Želízka ho nebrzdí; Laso a Belle Star ano (přes `_gearOn`). Aktérem je ten,
    na koho hra čeká, takže guard (`pendingActor`) sedí i mimo tah.

- **Wanted (fáze 5)** je JEDINÁ černá karta, která neskončí před kupujícím: „Zahraj na
  libovolného hráče" znamená, že se po zaplacení vybírá cíl (`GEAR_TARGET`, kartu do té
  doby drží `pendingGearTarget.card` — nikde jinde neleží). Že se taková karta pozná, drží
  **seznam `GEAR_AIMED_BLACK`** ([core/goldRush.js](../../core/goldRush.js)), ne rovnost jednoho
  `effect` — stejný důvod jako u `GEAR_MODES`. **„Ne dvě stejného" se měří na CÍLI**
  (`gearBlackTargets`): kusy jsou tři, takže může viset na třech hráčích naráz a hráč
  s Wanted před sebou si další koupit smí; bez volného cíle se nedá koupit vůbec.
  Odměnu **„kdo toho hráče vyřadí, lízne si 2 karty a vezme si 1 valoun"** vyplácí
  `_gearWantedReward` volaný z `handlePlayerDeath` ([logic/combat.js](../../logic/combat.js))
  **mezi** odměnou za banditu (sčítají se — 2 + 3 karty a 1 + 1 valoun, dvě fronty
  `KILL_REWARD` jako u Herba Huntera) **a** pokutou šerifa za pomocníka. To pořadí je
  pravidlo: „nejprve si vezme 2 karty a teprve pak odhodí celou ruku, ale zlato si
  ponechá" — fronta se odbavuje až PO návratu z `handlePlayerDeath`, tedy až za pokutou,
  takže se v téhle jediné větvi karty místo lízání rovnou přesunou z balíčku do odhozu
  (`opts.loseHand`, podmínku počítá volající, ať nestojí na dvou místech). Příznak se
  musí přečíst **PŘED `_gearDropAll`** a čte se přes `_gearOn`, takže Laso i Belle Star
  odměnu vypínají (R10). Ledger chování i bot berou vyložení jako **nepřátelské** —
  bot ho pověsí jen na nepřítele (`gearWantedPick`) a bez nepřítele ho nekupuje.

- **Postavy (fáze 6)** jsou v [logic/goldRush.js](../../logic/goldRush.js), ne v logic/characters.js:
  všech osm se točí kolem valounů, takže patří k rozšíření. Všechny mají **4 životy**, což
  je default — `core/roles.js` proto nepotřebuje ani řádek (kontrast s Divokým západem,
  kde Big Spencer vynutil celou dráhu životů). Do výběru je pouští `_characterPool`
  jen se zapnutým rozšířením; portréty jsou **042–049** (dotahuje je loader rozšíření).
  - **Simeon Picos** a **Pretty Luzena** nemají vlastní metodu — jen doplnily podmínku do
    háku, který už existoval. Simeon do `_afterLifeLost`, a to **NAD** výjimkou na poslední
    život (Boty a Talisman „neúčinkují při ztrátě posledního života", jeho text tu větu
    nemá). Luzena do `_gearCost`, který deleguje do zrcadla **`gearCostFor`**
    ([core/goldRush.js](../../core/goldRush.js)) — cenovku v obchodě, rozhodnutí serveru
    i výpočet bota tím počítá jeden vzorec. Sleva se uplatní **automaticky na první nákup
    v tahu** (rozhodnutí R16) a spotřebuje ji až ÚSPĚŠNÝ nákup; na vynucené odhození cizího
    vybavení neplatí (tam se cena bere z karty).
  - **Jacky Murieta** (`useJackyMurieta`) nemění `bangsPlayedThisTurn`, ale **LIMIT**:
    zaplacené výstřely drží `p._jackyTurn`/`p._jackyBangs` klíčované `turnId` a vzorec
    **`jackyExtraBangs`** je jeden pro server (`_bangLimit` + hák v `playBang`) i pro
    klienta a bota (`bangLimitFree`, [core/playability.js](../../core/playability.js)).
    Playability si ho **nesmí require-ovat nahoře** — core/goldRush.js se na ni ptá sám
    (Právo západu u nákupu), takže by vznikl kruh; čte se až při prvním volání.
  - **Josh McCloud** (`useJoshMcCloud`) jde společným ocasem **`_gearAcquire`** s nákupem
    („lízne si, jako by ho koupil"), jen s dodatkem „černý rám, který už máš, odhoď".
    Kvůli němu vznikla fáze **`GEAR_MODE`** (`_gearModeChoice`/`chooseGearMode`): líznutá
    Láhev/Komplic je lícem dolů, takže se způsob volí AŽ PO líznutí — u nákupu se volí
    předem, aby se neplatilo naslepo. Pravidla počet líznutí neomezují (brzdou jsou
    valouny), ale **bot má strop `JOSH_BOT_CAP`**: hnědé vybavení se vrací pod balíček,
    takže by ho s plnou kapsou točil donekonečna a tah by nikdy neskončil (stejná past
    jako `RECYCLE_CAP`). Počítadlo `p._joshUses` je čistě pro bota, pravidla ho nečtou.
  - **Raddie Snake** (`useRaddieSnake`) je Rýžovací mísa jako schopnost: valoun za kartu,
    2× za tah, líže se klikem na balíček běžnou fází lízání mimo začátek tahu.
  - **Dutch Will** má vlastní fázi **`DUTCH_DISCARD`** uprostřed fáze 1 (vzor Youl
    Grinner): odhoz jedné z **právě líznutých** karet je pořád fáze 1, takže se ptá dřív
    než Želízka a Ranč — ocas fáze lízání je kvůli tomu vytažený do **`_finishDrawTail`**
    ([logic/draw.js](../../logic/draw.js)) a obě cesty jdou jím. Které karty přibyly, pozná
    **snímek ruky** (`_dutchSnapshot`, jedno místo ve `startDrawPhase`), takže se veze Kit
    Carlson, Claus, Black Jack, Jesse Jones, Pedro Ramirez i Pat Brennan; Peyote (Fistful)
    fázi 1 nahrazuje celou, tam se neuplatní. Pod **Žízní** (líže 1 kartu) se neuplatní
    vůbec — „jedna ze DVOU" nemá z čeho vybírat, takže nepřijde ani valoun.
    Seznam ID v `pendingDutchDiscard` **se redakcí schovává** (klient má cards.json,
    takže by z ID poznal kartu přesně — stejný důvod jako u `_lawCardId`).
  - **Madam Yto** (`_madamYtoOnBeer`) visí na trychtýři na **KARTU Pivo** (`_onBeerCardPlayed`,
    logic/characters.js), ne na léčení: volají ho všechny tři cesty, kudy se Pivo hraje (`playCard`, `beerLastLifeSave` ve všech třech
    fázích, `beerForNugget`), a nikdo jiný — Saloon, Whisky ani Láhev zahraná jako Pivo
    kartou Pivo nejsou. Líznutí jde frontou odložených akcí do fáze **`YTO_DRAW`** (vzor
    Boty), takže platí „nejdřív doběhne efekt zahrané karty" a `_pruneSuzyQueue` ho uklidí,
    kdyby majitelka mezitím odešla ze hry.
  - **Don Bell** (`_donBellCheck`/`_donBellResult`) je **poslední gate v `nextTurn`**, za
    kartou Zlatá horečka. Sejmutí recykluje cestu Vendety (CHECK_DRAW → CHECKING →
    `_applyCheckResult`, reason `DON_BELL`), takže se veze Lucky Duke, Podkova, John Pain,
    cinematika i větev bota; `_donBellDone` se nastaví hned na začátku, čímž „na konci tahu
    navíc už neotáčí znovu" platí samo a smyčka nemůže vzniknout. **Ve Vězení schopnost
    nefunguje** (FAQ Q06) — příznak `p._turnSkippedByJail` spotřebuje dřív Madam Zuzana,
    takže si to konec tahu pamatuje v `_jailSkipTurn`. **Duch** (Město duchů) se jí
    nedočká (FAQ Q13) a totéž platí pro tah navíc za kartu Zlatá horečka.

**Pozor na tři kolize jmen** (plán je řeší v §0):
- `ZLATA_HORECKA` je klíč karty **událostí High Noonu** (id 305, hra proti směru) —
  rozšíření do jmenného prostoru `hasEvent` **nevstupuje**, jeho karty se identifikují
  přes `effect` (`ZH_PODKOVA`, …), ne přes jméno.
- Jedna z karet vybavení se česky jmenuje **taky „Zlatá horečka"** (Gold Rush, cena 5).
- `CardType.EQUIPMENT = 'Vybavení'` už nesou **Hledí a Mustang**, takže karty Zlaté horečky
  se v kódu jmenují **`gear`** (`player.gear`), ne „vybavení".

