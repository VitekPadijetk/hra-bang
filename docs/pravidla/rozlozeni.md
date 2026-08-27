# Rozložení desky: mobilní profil a pás vyložených karet

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

## Kompaktní soupeři (mobilní profil rozložení)

Na mobilu se soupeři nekreslí v okruhu kolem stolu (`oppMode: 'ring'`), ale v jedné řadě
nahoře – jeden sloupec na soupeře (`oppMode: 'compact'`). Uvolní to boky i spodek pro moji
zónu a hlavně dá vyloženým kartám soupeřů vlastní řadu.

**Profil si hráč smí vybrat sám.** Automatika (`pickLayoutProfile`) je jen výchozí odhad;
na dotykovém displeji nebo v úzkém okně se hra hned po startu zeptá obrazovkou
`ui_choice` (`renderMenuScreen` ve [view/menu.js](view/menu.js)) – zapíná ji
`shouldAskLayoutNow()` v [game.js](game.js) nad čistým pravidlem `shouldAskLayout`
([core/layout.js](core/layout.js)). Volba se pamatuje v `localStorage.bangUiMode`
(`'big'` = mobil, `'normal'` = PC), takže se ptáme jen jednou; přepnout jde kdykoli
chipem v levém dolním rohu hlavního menu. Obojí vede na **`setUiMode(mode)`**
([game.js](game.js)), které po zápisu volá `applyStage()` + `_introRelayoutPlaced()` +
přepočet Clausova panelu – tedy přesně to, co dělá změna velikosti okna, protože profil
se mění pod rukama celému klientovi. `?ui=mobile`/`?ui=desktop` má dál přednost před
uloženou volbou (testování mobilního rozložení na PC) a otázku vypíná.

Sloupec shora dolů: **otočená karta životů s portrétem** (chová se přesně jako soupeř
vlevo – portrét jede po nábojích doprava, hvězda šerifa se stejnými offsety) → **vějíř
rubů ruky** (menší měřítko, ale pořád skutečné karty) → **jméno + ⏳ stav** (oba řádky se
rezervují vždy, ať se sloupec nemění) → **řada vyložených karet** (stojí, angle 0).

- **Veškerá geometrie je v `core/layout.js`** (`COMPACT` + `compact*`), protože ji musí
  stejně počítat renderer (`drawCompactOpponent` ve view/board.js) i zacílení animací
  (`positions.js`). Nic z toho se nikde nepočítá „ručně podle sebe".
- **Měřítko není v profilu**, závisí na počtu soupeřů: `compactMetrics(n, L, stage)` ho
  odvodí ze ŠÍŘKY sloupce (`colW = min(560, (stage.w − 80)/n)`, aby řada 3 karet sloupec
  přesně vyplnila) a zastropí VÝŠKOU pásma (`oppBandH` – pod ním leží balíčky). Ptát se
  proto přes **`oppScale(L, n)`**, ne na `L.scaleOpp`. Řada vyložených karet je vždy JEN
  JEDNA – od 4. karty se rozestup zmenší (`compactBoardStep`); druhá řada by přetekla na
  balíčky a odpovídající zmenšení všech karet by bylo horší než překryv. **Sloupec proto
  má konstantní výšku, ať má hráč vyloženo cokoli** – řada se ani neposune, ani nezasáhne
  souseda (rozestup se počítá z `colW`).
- **Spodek sloupce je `oppTop + oppBandH` (440) a přímo pod ním leží balíčky**: prostřední
  sloupce stojí nad balíčkem/odhozem/High Noon. Vrch balíčku není `pileY − 75`, ale o půl
  tloušťky hromádky výš (80 vrstev po 0,25 px → 455), takže na 440 zbývá 15 px mezera.
  Hlídá to test „řada vyložených karet nedosáhne ani na plný balíček". Výjimka:
  **hokynářství balíčky zvedne o `storeLift` (120) a po dobu cinematiky spodek sloupců
  překryje** – na mobilu na tu řadu navíc jinde místo není (pásma jsou naskládaná těsně).
- **Vějíř ruky je menší než vyložené karty** (`m.fanScale`), jinak by se sloupec nevešel.
  Tím se poprvé rozchází „velikost karty na stole" a „velikost karty v ruce", což u okruhu
  nikdy neplatilo: letící karta musí na hand slot dosednout v `handCardScale(L, n, isSelf)`,
  jinak při dosednutí viditelně skočí. V `net/handlers.js` to řeší **`sideScale(idx, 'hand')`**
  (bez druhého parametru = karta na stole) – na desktopu vrací obojí totéž, takže rozlišení
  nemůže PC rozbít. Pro balíček/odhoz je vedle něj **`pileScale()`** (= `L.scaleDeck`).
- Kotva soupeře zůstává **středem karty životů** jako u okruhu, takže helpery „pod jakým
  úhlem leží karty hráče" (`_renderSideAngle`, `_kitSpecAngleFor`) propadnou na 0° správně
  a `_deathRoleStartPos` pošle kartu role zpoza HORNÍHO okraje.
- Intro: `_introOppSlots` bere stranu **z kotvy** (dřív ji dopočítávalo zpětně z pozice
  ruky prahy na okraje – u kompaktní řady je strana jen jedna a netrefilo by ji);
  `_introDealRestPos` míří u kompaktní řady rovnou na `getHandSlotPos`.

Testy: `test/layout.test.js` hlídá, že sloupec nevyleze ze své šířky (portrét při 5
životech, řada karet, vějíř) ani z pásma nad balíčky, a to pro 1–6 soupeřů na všech
reálných poměrech stran; `test/positions.test.js` hlídá, že positions.js dává přesně to,
co kreslí deska.

**Moje zóna na mobilu** má dvě řady: **stůl** (`myBaseY`, měřítko beze změny) a pod ním
**ruka** (`handY`, `scaleHand` 0.46) přes celou šířku jeviště – na telefonu je karta v ruce
54 CSS px místo 42 a vedle sebe se jich bez překryvu vejde 15 (dnes se překrývají od 7.).
Ruka se v pásu **vystředí** (`handAlign: 'center'`, viz `myHandRow`), jinak by se pár
karet krčilo v levém rohu; jedna karta pak leží přesně na `myHandAnchorX` (= střed jeviště).
Na desktopu je `handY === myBaseY` a `scaleHand === scaleMe`, takže je to pixelově dnešní
stav. Karta životů je vpravo (`livesX` 1500): portrét při 5 životech sahá 195 px vzhůru,
takže musí minout jak balíčky uprostřed, tak pásmo soupeřů nahoře – **to je nejtěsnější
místo celého rozložení a hlídá ho test**. Akční tlačítka (`btnEndX/btnEndY`,
`btnAbilX/btnAbilY`) jsou ve dvou řadách u pravého okraje vedle karty životů. Řada
hokynářství (`storeRowOffY`, `storeLift`) se musí vejít mezi zvednuté balíčky a můj stůl.

Zbytky pevných souřadnic mé zóny se proto přesunuly do profilu: `MY_ROLE_X()`/`MY_LIVES_X()`…
(view/intro.js) a `NI_MY_X()`… (net/handlers.js) jsou **funkce, ne konstanty** – profil se
ustaví až v `applyStage`, tedy po načtení těch souborů.

## Pás vyložených karet: dvě řady, které nikdy nedosáhnou na balíčky

Vyložené karty (výzbroj + modré + zelené, u vyřazeného i karta role) mají **pevný počet
slotů `rows × perRow`** a jejich **půdorys se nikdy nemění**. Karty nad kapacitu nepřidají
třetí řadu – **zmenší se rozestup uvnitř řady** (stejný princip jako `compactBoardStep` na
mobilu). Řeší to `boardBand(count, rows, perRow, cardExtent, gap)` + `boardSlot(idx, band)`
v [core/layout.js](core/layout.js).

Proč: řady rostou vždy **směrem k balíčkům uprostřed stolu** (u horního soupeře dolů, u mě
vzhůru) a dřív rostly bez stropu. Horní soupeř tak **od 7. vyložené karty ležel na
balíčku** (řada 2 sahá na y 507, vrch plného balíčku je 455) a od 10. na něm ležel celý –
v Dodge City je 7–10 karet na stole běžné, takže to šlo vidět už při 6 hráčích.

- Profil nese `oppBoardRows: 2, oppBoardPerRow: 3` a `myBoardRows` (desktop 2, **mobil 1** –
  druhá řada mojí zóny by tam spadla přímo na balíčky, y 470–650 vs 465–615; prakticky se to
  nepozná, do řady se vejde 10 karet).
- Do kapacity pásu je to **pixelově dnešní stav** (`step = karta + mezera`,
  `slot = i % perRow` / `floor(i / perRow)`).
- Konzumenti: tři větve okruhu + `drawMyArea` ([view/board.js](view/board.js)) a
  `getBoardCardPos` ([positions.js](positions.js)) – **musí se měnit spolu**.
- `numBluePrimary`/`numBlue` zůstávají `min(count, oppBoardPerRow)`: šířka pásu se nemění,
  takže vystředění skupiny karty životů je beze změny.
- **Výjimka:** cinematika hokynářství zvedá balíčky o `storeLift` (120), takže druhou řadu
  horního soupeře po tu chvíli překryje – stejná dohoda, jaká už platí pro kompaktní
  sloupce na mobilu. Test proto měří proti **klidové** výšce balíčků. Se dvěma řadami
  událostí (High Noon + Fistful) navíc zvednutí nejde nastavit tak, aby vyhovělo oběma
  sousedům naráz (rozdaná řada zdola, karty horního soupeře shora) – omezení se kříží
  o 5 px, takže se rozdíl dělí na půl a na obou stranách zbyde necelý 3px překryv
  (`EVENT_STORE_SLACK` v [core/layout.js](core/layout.js)).

Testy: `boardBand` v `test/layout.test.js` (pixelová identita do kapacity, konstantní
půdorys nad ní) a v `test/positions.test.js` invariant „pás nedosáhne na balíčky ani na
souseda" pro **2–8 hráčů, každé sedadlo a 1–14 karet**.

