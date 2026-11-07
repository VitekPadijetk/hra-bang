# Rozšíření Divoký západ (Wild West Show) — podrobně


**Hotové je celé rozšíření (fáze 0–12)**: balíček je ve hře, **všech deset karet událostí**
něco dělá (včetně té vespod) a **všech osm postav má schopnost**.
Co která karta potřebovala a proč se to dělá právě takhle, najdeš
v [docs/wild-west-show-plan.md](../wild-west-show-plan.md) —
je tam karta po kartě, kde je hák, co se musí měnit spolu a jaké testy to má mít.
Pravidlový podklad (texty karet, oficiální FAQ Q01–Q18, Sciarrovo FAQ) leží v
[docs/wild-west-show.md](../wild-west-show.md), staženými PDF vedle.
**Zdroj pravdy pro chování karty je český text vysázený na artu**, ne anglické FAQ.

Co už platí (fáze 0):

- **Událost neotáčí šerif, ale kdokoli zahráním Dostavníku nebo Wells Farga**
  (`_flipWwsEvent` volaný z `playCard`, [logic/play.js](../../logic/play.js)). Krytý vůz má
  vlastní `CardType`, takže jí neprojde (FAQ Q16), a zopakování efektu ji posílá
  s `{ repeat: true }` (Sciarra Q19). Na začátku hry proto **žádná událost tohoto
  balíčku neplatí**.
- Je to **třetí balíček vedle High Noonu a Fistfulu** (`wwsDeck`/`wwsPile`/`activeWws`,
  mixin [logic/wildWest.js](../../logic/wildWest.js), data `cards.divoky_zapad.json`, id 500–509).
  Slévá se jen v `hasEvent` a `eventActive` — všechna tři rozšíření jdou zapnout naráz.
- Karta **Divoký západ** leží vespod balíčku a po odkrytí se **už nevyměňuje**.
- **Zúčtování** (fáze 2) je hotové: každá karta smí jít jako Bang! a každá karta Bang!
  i jako Vedle!. Obě věty jsou POVOLUJÍCÍ – karta si svou vlastní akci ponechává, takže
  se v UI na výstřel přepíná tlačítkem `💥 ZAHRÁT JAKO BANG!` (`selectedState.showdown`,
  slot tlačítek schopností ve `view/board.js`). Rozhoduje o tom pětice predikátů
  v `core/playability.js` (viz řádek výš).
- **Sacagaway** (fáze 2b) je hotová. „Všichni hráči hrají s odhalenými kartami v ruce
  (vyjma svých rolí)" – **jediná karta hry, která mění redakci stavu, ne pravidla**.
  Z ruky se pořád bere NÁHODNĚ (FAQ Q17), takže se `resolveCardSelection` nezměnilo o řádek;
  krádež z odkryté ruky si ten fyzický postup jen přehraje (ruka lícem dolů → zamíchání →
  náhodná karta → ruka zase lícem nahoru, `core/wwsAnim.js`). Příchod i odchod karty je
  předěl, na kterém se cizí vějíře **plynule přetočí** (`saca_flip`), a lety karet se
  odkryté ruce přizpůsobí (`revealFromHand`/`hideIntoHand` v net/handlers.js).
- **Pět postav** (fáze 4) je hotových: **Big Spencer** (9 životů, 5 startovních karet,
  nesmí hrát KARTY Vedle! – `bigSpencerBlocked` v `playsAsMissed`, takže Barel,
  Jourdonnais, zelené Vedle! i Úhyb fungují a pod Zúčtováním smí jako Vedle! kartu
  BANG!), **Gary Looter** (hák ve fázi 3 `discardCard`, vyhrává nad Opuštěným dolem),
  **John Pain** (sejmutá karta se zapíše a přesune až po doběhnutí efektu),
  **Youl Grinner** (vlastní fáze `GRINNER_GIVE` před lízáním) a **Flint Westwood**
  (1×/tah výměna 1 karty za 2 náhodné; pořadí ber → dej → Suzy, Sciarra Q32).
- **Hřbitov a Helena Zontero** (fáze 7) jsou hotové. Obě karty přerozdávají role a obě
  jdou jedním tělem (`_reshuffleRoles`, logic/wildWest.js): vezmi role uvedených hráčů,
  zamíchej je (od DVOU výš, s jednou není co míchat), rozdej zpátky a **shoď jim
  `_roleRevealed`** – tím se role stane zase tajnou (viz redakce výš). Ledger chování
  (server/ledger.js) se resetuje, protože dedukce „střílel na šerifa, tedy bandita" se
  přerozdáním stala nepravdou; pravidla to jen označí (`_ledgerResetPending`), reset udělá
  server v háku před broadcastem, protože ledger žije na `room`, ne ve stavu.
  **Hřbitov** vrací každého vyřazeného na začátku JEHO tahu (natrvalo a opakovaně), takže
  je v `nextTurn` třetí výjimka z přeskakování mrtvých – a duchem se pod ním nikdo nestává
  (pořadí testů: Mrtvý muž → Hřbitov → duch). Míchá se **při každém návratu**, dokud zbývají
  aspoň dvě vyřazené role: při pěti vyřazených tedy čtyřikrát. **Helena Zontero** je jediná
  karta balíčku s okamžitým efektem při příchodu (`_applyWwsEventOnEnter`); sejmutí NEJDE
  cestou `pendingCheckDraw`, protože se karta otáčí automaticky – Lucky Duke ani John Pain
  se u ní neuplatní (FAQ Q09). Barva se čte přes `_effSuit`, takže Požehnání/Prokletí platí.
  Cinematika má dvě půlky (`core/wwsAnim.js`): **veřejnou** (karty rolí ze stolu doprostřed,
  riffle, zpátky rubem nahoru – jen tam, kde karta role leží: vyřazení pod Hřbitovem, ve hře
  pro 3 všichni) a **soukromou** `role_peek` („každý hráč se podívá na svou novou roli").
  `role_peek` je jediná animace, jejíž payload je **pro každý socket jiný** (roli v něm má
  jen její majitel) – `playerIdxs` je naopak u všech stejné, aby fronta držela stav stejně
  dlouho a klienti se nerozešli.
- **Divoký západ** (fáze 8), karta vespod balíčku, je hotový: „Cílem každého hráče se
  stává: Zůstaň poslední ve hře!" Mění **podmínku výhry**, ne průběh hry:
  `checkWinCondition` (logic.js) předá `lastManStanding: this.hasEvent('DIVOKY_ZAPAD')`
  a `evaluateWinner` (core/winCondition.js) tím přebíjí jak klasické strany, tak pravidla
  pro 3 hráče – vrací **jméno** posledního živého. Smrt šerifa hru **nekončí** (odkrývání
  událostí to ustojí samo, `_eventFlipperIdx` posune šerifovu pozici na dalšího živého)
  a **role zůstávají v platnosti** (FAQ Q15): šerif nesmí do vězení, odměna 3 karet za
  banditu i šerifova pokuta za vlastního pomocníka platí dál – nekóduje se k tomu nic,
  jen to drží testy. Jediná výjimka: **nárok `_winClaim3p`** (logic/combat.js) se pod
  kartou nezískává, protože cíle v kruhu přestaly platit. **Bot** se to dozví jedinou
  větví v `roleHostility` (core/beliefs.js): pod `opts.lastManStanding` je nepřítelem
  **každý** – bez toho by strana šerifa v koncovce jen lízala a odhazovala.
- **Teren Kill** (fáze 5) je hotový: hák `_terenKillCheck` úplně nahoře
  v `handlePlayerDeath` **pozastaví vyřazení** – hráč se drží na 1 životě (jinak by ho
  `isInPlay` i `checkWinCondition` uprostřed nedokončeného vyřazení vyškrtly ze hry)
  a do fronty odložených akcí jde `TEREN_CHECK`. Sejmutí pak jede existující cestou
  CHECK_DRAW → CHECKING → `_applyCheckResult` jako Vendeta, takže se zdarma veze Lucky
  Duke, John Pain, klientská cinematika i větev bota. ♠ = vyřazení proběhne doopravdy
  (`_terenKillResult` na tu chvíli vrátí fázi, ve které zásah padl, ať se pozná
  `_autoEndTurnPending`); jinak zůstává na 1 životě a líže si kartu (KILL_REWARD).
- **Lee Van Kliff** (fáze 6) je hotový: schopnost stojí na PAMĚTI poslední hnědé karty
  (`_lastBrown`, logic/wildWest.js). Hnědá = všechno kromě modrých (`isBlueCard`) a
  zelených, takže vyložení Mustangu paměť nesmaže. Opakuje se **efekt, ne aktivace**:
  cena „odhoď další kartu" se podruhé neplatí (Sciarra Q29), zopakovaný Dostavník/Wells
  Fargo **neotáčí** kartu Divokého západu (Q19), Apache Kida rozhoduje barva PŮVODNÍ
  karty (Q12) a cíl smí být jiný (FAQ Q13). Do limitu 1× Bang!/tah se nepočítá ani
  odhozený BANG!, ani opakovaný efekt; Madam Zuzaně se ale opakování počítá jako zahraná
  karta (Q24). Cílené efekty jdou existující cestou (RESPOND, SELECTING_TARGET_CARD),
  takže se veze Barel, Slab, Vulture Sam i klientské animace.
- **Miláček Valentýn a Madam Zuzana** (fáze 3) jsou hotové. Valentýn je **poslední krok
  krokovače startu tahu** (`_runBeginTurn`, logic/highNoon.js) – tedy ještě před kontrolami
  na Dynamit/Vězení, ale až za vším ostatním; ruku odhazuje hráč sám, kartu po kartě
  (fáze `VALENTINE_DISCARD`, bug 35), a náhrady si líže ručně klasickou fází lízání. Zuzana je naopak gate na **začátku `nextTurn`** (logic.js), tedy až za fází 3
  (odhoz nad limit) a ještě před sejmutím Vendety.
- **Roubík** (fáze 9) je hotový a je to **jediná karta hry, která se váže na chat**:
  odeslání zprávy stojí 1 život. Zpráva se nezahazuje (karta mluvení zakazuje pod pokutou,
  ne úplně) a nic se nepotvrzuje. **Zásah se KLIKÁ** (recykluje `pendingDynamiteDamage`
  jako Madam Zuzana, `source: 'GAG'`), takže si ho hráč ubere sám a smí se zachránit Pivem.
  Chat chodí asynchronně a trefí libovolnou fázi, takže se seat nejdřív zapíše
  (`_gagPending`) a klikaný zásah se nasadí na nejbližším místě, kde smí **přerušit**
  (`_gagCalm`): rovnou při zprávě, jinak `_processSpecialQueue` / `_resumeAfterSpecial`,
  nejpozději `nextTurn` (`_gagAtTurnEnd`, jediné místo s `force`). Přerušit smí i cizí
  obranu nebo výběr karty – fáze se po kliknutí vrátí (`_gagResumePhase`, `_gagResume`).
  Nesmí jen tam, kde už někdo klikáním ztrácí život, kde běží fronta odložených akcí /
  lízání, a kde se čeká na rozhodnutí od **samotného pokutovaného** (jeho smrt by nechala
  viset `pending*` té fáze; jeho vlastní tah je výjimka, tam smrt řeší `_autoEndTurnPending`).
  Dokud pokuta visí, má ten hráč **zavřený chat** (`gagBlocked` – ptá se jím server,
  zrcadlí klient i hlášky botů); bez toho by devíti zprávami naskládal devět zásahů
  a zabil se dřív, než by na první klikl. Zásah pak jde přes `takeDynamiteHit`, takže se
  veze Bart Cassidy (líznutí) i cinematika vyřazení. Divák není hráč a neplatí nic.
  Ke kartě patří i **hlášky botů** (`core/botChat.js` + `flushBotQuips` v server/bots.js) –
  bez nich by Roubík boty nikdy netrefil, protože stůl plný botů byl doteď němý.
- Na stole leží **nalevo** od balíčků (`eventPileSlots(L, hnOn, ffOn, wwsOn)`): bere levý
  pár `ffPileX/ffActiveX`, a jen když ho drží Fistful (mobil se zapnutým High Noonem),
  ustoupí o krok dál na `wwsPileX/wwsActiveX`. **Dnešní rozložení High Noonu a Fistfulu
  se tím nemění o pixel.**

- **Greygory Deck** (fáze 10) je hotový, a s ním i refaktor, bez kterého se udělat
  nedal: dotaz „umí X?" prošel z `effectiveCharacter(p) === "Jméno"` na
  **`hasAbility(p, "Jméno")`** (core/distance.js) na všech ~85 místech. Sám Greygory
  žádnou schopnost nemá – má ty **dvě, které si líznul** (`p._greygoryChars`, pole nese
  ten, kdo schopnost právě má, ne Greygory). Líže se ze **skutečného balíčku postav**:
  jen 16 postav základní hry (FAQ Q30) a z nich jen ty, jejichž karta je fyzicky volná
  (R12) – nikdo je nehraje, nemá je jako počítadlo životů (Nová identita, `_secondChar`)
  ani je nedrží jako Greygory. Vlastní dvojice se do poolu vrací (FAQ Q01), takže si
  po výměně může líznout tytéž. Líznutí má vlastní cinematiku (`greygory_deal`,
  payload zapisuje `_greygoryDraw`, posílá `flushGreygory` v server/anim.js, přehrává
  `playGreygoryDeal` v net/handlers.js) – na začátku hry se ale nehraje (`silent`),
  tam karty postav rozdává intro. **Pool smí vyjít prázdný** – „smůla" je legální stav,
  hráč pak tenhle tah nemá schopnost žádnou a nabídka výměny se nedává vůbec.
  Nabídku dostává **jen ten, kdo Greygoryho doopravdy hraje**; Vera Custer si dvojici
  líže rovnou při volbě kopie (R10) a vyprší jí spolu s kopií, kdežto Greygorymu mezi
  tahy zůstává. Kombinace schopností ve fázi lízání jde beze změny pravidel (FAQ Q31):
  Jesse + Pedro přidají obě své možnosti do `options`, Kit Carlson + Jesse si vezme
  první kartu z ruky a z řady si nechá o jednu míň, Kit + Black Jack ukáže **druhou
  ponechanou** kartu a při červené lízne navíc. **Absolutní konflikt v tom poolu
  nastat nemůže** – Kit vs. Claus by ho udělal, jenže Claus the Saint je z Fistfulu,
  ne ze základní hry, takže se Greygorymu do dvojice nikdy nedostane.
- Dvojice je **veřejná**: leží jako dvě menší karty **vedle portrétu, směrem ke středu
  stolu** (a jede s ním po nábojích) – u mě si bere slot tlačítka schopnosti, které jí
  uhne doprava (`greyAbilShift`). Nejsou to karty ve hře, takže do pásu vyloženého
  vybavení nepatří; geometrii vlastní `core/layout.js` (`greyMySlot`/`greyOppSlot`)
  a zacílení animací `positions.js` (`getGreygoryCardPos`). Jedinou výjimkou je
  **kompaktní profil (mobil)**, kde na tuhle geometrii není místo – tam dvojice zůstává
  na KONCI pásu vyložených karet, aby se indexy skutečných karet nehnuly (`greyDetached`).
- **Lady Růže z Texasu** (fáze 11) je hotová: „Během svého tahu si může každý hráč
  vyměnit místo s hráčem po své pravici a ten tak přeskočí svůj nejbližší tah."
  Je to **jediná karta, která mění sedadla** – a sedadlo je v tomhle projektu INDEX do
  `players`, takže se výměnou přeskládá kus stavu naráz. Jádrem je `_swapSeats`
  (logic/wildWest.js): prohodí dva prvky pole (tím se přenese ruka, stůl, zbraň, role,
  postava, životy i příznaky hráče) a pak **obecným průchodem** přemapuje každé číslo ve
  stavu, které sedadlo znamená. Obecným schválně: ruční výčet polí by při dalším pravidle
  zastaral, takže musí být každý klíč vypadající jako index v jedné ze tří tabulek
  (`SEAT_KEYS` / `SEAT_LIST_KEYS` / `NOT_SEAT_KEYS`) – že žádný nechybí, hlídá
  **strukturální test** procházející zdrojáky `logic/*` (test/wws.seats.test.js).
  Druhá pojistka je pravidlová: měnit místo jde jen ve fázi `PLAY`, takže je většina
  `pending*` polí prokazatelně prázdná. **Sedadlo ale žije i mimo stav hry**: pořadí
  `room.players` (odtud jde `myIndex` do klienta), ledger chování a snímek pro hlášky
  botů – to dorovná `swapRoomSeats` (server/rooms.js). „Po pravici" = `(i−1+n)%n`
  **bez ohledu na Zlatou horečku** (efekt karty jde vždycky po směru, FAQ H3); vyřazení
  se přeskakují. Prohozený dostane `_skipNextTurn` a `nextTurn` ho přeskočí ve stejné
  smyčce jako mrtvé – přeskočení je „jako by tam neseděl", tedy bez startu tahu, bez
  sejmutí na Dynamit/Vězení i bez penalizace Madam Zuzany. Počet použití karta neomezuje,
  hra ale ano, a to **dvěma pojistkami proti smyčce, ve které jeden hráč nikdy nepřijde
  na tah**: (1) **jedna výměna za tah** (`_roseUsedThisTurn`, nuluje ho začátek každého
  tahu) a (2) **nikdo nepřijde o dva tahy za sebou** (`p._roseSkippedLast` nasazuje
  `_roseSkip` na OBĚŤ, shazuje ho tah, který si doopravdy odehraje). Ta druhá je nutná:
  v koncovce chce přesednout každý (soused je nepřítel), takže se zbytek stolu střídá
  v tom, koho přeskočí – hlídat „tutéž dvojici" proto nestačí, přeskakovat ho může
  pokaždé někdo jiný. Naměřeno v zátěži: hra pro 3, 865 tahů, oběť odehrála 1 tah
  a 861× byla přeskočena. Právo západu (Fistful) výměnu **nezakazuje
  plošně**, jen když by se jí hráč vyvlékl z povinnosti (vzdálenosti se přesednutím
  mění) – ověřuje se to na kopii stavu s prohozenými sedadly, viz `roseSwapOffer`.
  **Bot** se vymění jen s pravděpodobným nepřítelem; „nejvýš jednou za tah" je rovnou
  pravidlo, takže vlastní brzdu nepotřebuje.

- **Zuřivá Doroty** (fáze 12) je hotová: „Hráč na tahu může jmenovat kartu a vybrat hráče,
  který ji musí zahrát (pokud ji má)." Pravidlově nejdivočejší karta balíčku, protože na dobu
  jedné karty **prohodí, kdo je na tahu**. Řeší to VYPŮJČENÉ SEDADLO (`_dorothyPlay`,
  logic/wildWest.js): `currentPlayerIndex` se přepíše na poručeného, karta jde úplně běžnou
  cestou a sedadlo se ve `finally` vrátí. Tím se zdarma veze celé FAQ: vzdálenosti i Slab
  se počítají podle poručeného (Q05), duel prohrává a karty za Dostavník líže poručený (Q06),
  limit 1× Bang!/tah i počítadlo Madam Zuzany se připisují jemu. Sedadlo se půjčuje **jen na
  synchronní zahrání** – všechno, co běží dál (RESPOND, barel, výběr karty, lízání,
  hokynářství), si své sedadlo nese výslovně v `pending*`/`drawPhaseState`; kdyby zůstalo
  vypůjčené přes celou obranu, byl by po tu dobu „na tahu" poručený – tah by mu šlo ukončit
  a jeho smrt by ukončila tah někomu jinému (proto `_turnOwner()` v `handlePlayerDeath`).
  Jmenuje se **z mřížky ARTŮ** (`renderDorothyOverlay`, view/screens.js) postavené z KATALOGU
  DRUHŮ karet (`distinctCardKinds`, logic/entities.js) – server ho staví z dat balíčku,
  klient z Phaser cache, takže se nevozí ve stavu. Co jde poručit, komu a s jakým cílem,
  rozhoduje šestice predikátů v `core/playability.js` (`dorothyReady`/`dorothyOffer`/
  `dorothyPlayerOk`/`dorothyTargets`/`dorothyNeedsTarget`/`dorothyBudget`) – dotazy jsou
  **hypotetické**: jestli poručený kartu doopravdy má, se poroučející dozví až tím, že ji
  zahraje (nebo že **ukáže ruku** – `_dorothyReveal`, druhá výjimka z redakce vedle
  Sacagaway). Cíl vybírá poroučející ze seznamu od serveru (`pendingDorothy.targets`, fáze
  `DOROTHY_TARGET`) – táž dohoda jako u Pokrevních bratří. Strop je **jedno poručení za tah**
  (stejně jako u Lady Růže) a tutéž dvojici (karta, poručený) nelze poručit dvakrát: neúspěšné poručení
  nemění stav vůbec, takže by ho bot bez stropu posílal donekonečna (a proto je
  `_dorothyUsed` i v otisku pokroku `progressSig`, server/bots.js). **Karty „odhoď další
  kartu" (Dodge City) se poručit nedají** – cenu by platil poručený kartou vlastní volby
  a u Ragtime by si sám vybíral i okradenou kartu, takže by věta „cíl(e) vybíráš ty"
  neplatila ani z poloviny.

Všech osm postav
(`WILD_WEST_CHARACTERS` v [logic/entities.js](../../logic/entities.js), id 34–41) už schopnost
má, takže `WILD_WEST_READY` je dnes celý seznam a zůstává jen jako pojistka pro další
rozšíření.

