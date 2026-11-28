# Ozbrojení a nebezpeční (Armed & Dangerous)

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.
> Implementační plán (žetony, Nebezpečné karty, fáze A0–A7, rozhodnutí R-U1–R-U4 a R1–R23, co se v které fázi odchýlilo): [docs/ozbrojeni-a-nebezpecni-plan.md](../ozbrojeni-a-nebezpecni-plan.md).
> Pravidlový podklad (texty 28 karet a 8 postav, česká upřesnění Albi, nejasnosti): [docs/ozbrojeni-a-nebezpecni.md](../ozbrojeni-a-nebezpecni.md).

## Stav a rozhodnutí

**Hotové je celé rozšíření (fáze A0–A7)**: všech 28 karet (22 vlastních druhů + 6 karet
základní hry) i 8 postav má efekt, bot je umí hrát a rozšíření jde zapnout v menu jako každé
jiné (`MENU_EXPANSIONS`; že nápověda sedí s `AD_CARDS_READY`/`AD_READY`, hlídá
`test/ad.finish.test.js`). Oba seznamy jsou dnes celé a zůstávají jen jako pojistka.

**Rozhodnutí uživatele (plán, záhlaví):**
1. **Žetony se vždy rozmisťují i platí RUČNĚ** – hráč kliká, kam žeton dá a odkud ho bere.
   Automaticky jen to, kde pravidla volbu nedávají (cena Nebezpečné karty se platí z té
   karty, Rez bere ze všeho). Bot rozhoduje sám a hned.
2. **Žeton za zahrání dostává jen MODRÁ karta**, oranžová (Nebezpečná) ne – nová
   Nebezpečná karta začíná na 3 žetonech.
3. **Pauza na reakci mimo tah jen tehdy, když reagovat jde** (jako R4 Údolí stínů): Stepní
   běžec, Al Preacher a Ms. Abigail zastaví hru, jen když hráč má kartu, schopnost a žetony.
4. Art je dodaný (`assets/card_art/ozbrojeni/*.webp`, portréty `assets/characters/055–062.webp`,
   značka `assets/card_marks/ozbrojeni.webp`, `AD_MARK_READY = true`). Kostička `nabiti.webp`
   dodaná není, kreslí se (`ad_cube`).

**Jména:** klíč `ozbrojeni`, prefix `ad`/`AD_`, soubory `logic/armed.js` (mixin),
`core/armed.js` (zrcadlo pro klienta a bota), data `cards.ozbrojeni.json` (id 200–227),
postavy 55–62 (`ARMED_CHARACTERS`).

## Žetony nabití (A0–A1)

- **Zásoba se počítá, neukládá**: `adSupply(state)` = 32 − žetony ve hře. Invariant
  „nikde víc než 4, zásoba 0–32" hlídá zátěž po každé akci (`checkLoads` v `test/ad.load.test.js`).
- **Tři jediné cesty změny žetonů**: `_adAdd` (i vyložení `{ fresh: true }`), `_adTake`,
  `_adMove`. Strukturální test pouští zápis `.adLoads` jen v nich. Vyčerpaná karta
  (0 žetonů) odchází do odhozu (`_adDeplete`), zbraň → Colt.
- **Odchod ze hry vrací žetony postavy** (`_adLeavePlay` v `handlePlayerDeath`,
  `_teardownGhost`, `_teardownShadow`, `_vosGhostLeave`) – vyřazený, který se vrátil
  (Hřbitov, duch, stín), by jinak poslal zásobu do minusu.
- **`isBlueCard` Nebezpečnou kartu nebere** (`!card.dangerous`) – Nebezpečná zbraň má typ
  „Zbraň", ale dobití za modrou ani José Delgado se jí netýká. Predikáty `isDangerousCard`,
  `isBrownCard` (core/cardRules.js). Soudce bere Nebezpečné karty přes `card.dangerous`.
- **Fáze `AD_PLACE`** (`pendingAdPlace = { playerIdx, left, reason, from?, oneTarget?, direct? }`):
  žeton za modrou kartu (fronta, hák `_adQueueBlue` ve třech vstupech vyložení), za odhoz nad
  limit (`_adDiscardPlace`, `nextTurn` až po fázi), Nabíjení, Bass Greeves (`oneTarget`),
  Red Ringo (`from: 'CHAR'`). Cíle `adPlaceTargets` (čte `from` sám).
- **Platba je součást akce, ne fáze**: `pay: [{ seat, cardId }, …]` (cardId null = postava),
  ověří `adPayOk`/`adUpgradeOk` dřív, než cokoli animuje; odmítnutá akce nic nezaplatí.
  Klient drží rozpracovanou platbu v `selectedState.adUp`/`adPay`, model `adPayNeed`.
- **Zvonice žije v core/distance.js** (`adBellActive`) – distance.js nesmí require-ovat armed.js.
- **Bandalír se používá vědomě** (bug V, ruší R21): klik na Bandalír ho zapne
  (`selectedState.adBand`), pak smí jít jen karta BANG! nad limit (`adBandCards`,
  core/playability.js) a `play_bang` nese `band: true`. Zapnutí je dočasný příznak
  `_adBandArm` na hráči, který `adBandolierExtra` čte: server ho drží jen po dobu
  `playBang` (obal kolem `_playBangRun`), bot po dobu rozhodování (obal `decideBotAction`
  přes `adBandWith`), klient ho na svou kopii stavu nastavuje každý render (`adBandSync`).
  Ve stavu nikdy nezůstane. Zapnout jde jen s vyčerpaným limitem a kartou BANG!, kterou
  jde vystřelit (`adBandArmOk`). Zaplacený Bandalír drží +1 do konce tahu (`_adBandTurn`),
  i když se vyčerpal.

## Zbraně a výstřely (A2)

- **Výstřel nese kontext `vos` i bez Údolí stínů** (`_adShotStart`: `unavoidable`,
  `adBuntline`, `adReturn`, `adMary`, `adAbby`). Colorado Bill se proto ptá na `vos.bangCard`.
- **Zrušení výstřelu jde trychtýřem `_adShotCanceled`** (Barel, Vedle!, Útěk, Bedna).
  Bedna se v obraně používá klikem na kartu na stole (bug V), tlačítko není.
- **Big Fifty drží `_adMuted` na cíli** – `hasAbility` pak nic nepovolí. Každý nový konec
  obrany musí volat `_adShotEnd()` (konec `handleResponse` je vytažený do `_respondAdvance`).
- **Buntline** odhazuje fází Brokovnice (`SHOTGUN_DISCARD` s `label`), žádné `AD_DISCARD`.
- **Thunderer** vrací kartu hned v `playBang` (`_adThunderReturn`), animace přes `gs._adThunderDone`.
- Karty zpátky do ruky po zrušení (Křesadlovka, Skrč se!) animuje `flushAdAnim` (server/anim.js).
- Skrč se! je ve svém tahu nehratelná (`nativePlayInTurn`).

## Ruce a stoly (A3)

- **Šíp jede po cestě Indiánů**: `pendingResponse.sourceCard = INDIANS`, `adArrow: true`,
  seznam cílů `_adArrow.queue`, na který se ptá `_advanceMassAttack` (`_adArrowNext`).
  Jediný cíl má okno úniku (`resume.kind === 'AD_ARROW'`). Ne na sebe, ne na Ducha.
- **Paklíč** = cesta Paniky s `ignoreDistance` a `pick: hand`; **Bič a Squaw** = cesta
  Cat Balou s `adNoHand` (Squaw s vylepšením jako Panika – karta do ruky).
- **Squaw z ruky a Bič ze stolu se míří rovnou na kartu ve hře** (bug V, jako Panika/CB):
  `adBoardPick`/`adBoardPickClick` (view/board.js) pošle `play_special` / `ad_use`
  a hned `select_target_card`. Server se neměnil – když napřed otevře okno úniku, hráč
  klikne kartu znovu ve fázi výběru. Paklíč míří dál na postavu (bere náhodně z ruky).
- Akce bez obecného `ad_ability`: `ad_use`, `play_special { up, pay, extra }`, `ad_bass`,
  `ad_frankie`, `ad_ringo`, `ad_mexicali`.

## Bomba (A4)

- Zahrání vlastní větví v `playSpecialCard`; `_placeOnTarget` dává Nebezpečné kartě 3 žetony
  PŘED oknem úniku. Cíle `adBombTargets` (kdokoli ve hře bez Bomby, i sám, 3 žetony v zásobě).
- Sejmutí za Chřestýšem (`_adBombOrDraw`, `pendingCheckDraw.bombIdx`, jedno za tah
  `_adBombTurn`), předání fází `AD_BOMB_PASS`.
- **Výbuch cizí rukou (Rez, Frankie) jde frontou `AD_BOMB_BLAST`** a zásahy nesou
  `resume: 'QUEUE'` – po nich PLAY, smrt oběti tah neposouvá (jen hráče na tahu dorovná
  `_turnOwnerGone`).

## Sejmutí znovu (A5)

- **Stepní běžec je brána `_adRedrawGate` před `_applyCheckResult`** v obou volajících
  (`resolveCheck`, `luckyDukePick`). Nové sejmutí se musí vejít do `currentCheck` (nese celý
  kontext). Fáze `AD_REDRAW_OFFER`, akce `ad_redraw { redo }`, kdo smí `adRedrawOwner`,
  verdikt `adCheckVerdict`. `boardIdx` se po platbě dohledá znovu.
- **Julie Cutter** jde frontou `AD_JULIE_CHECK` → `CHECK_DRAW` s `reason: 'AD_JULIE'`;
  od téhož útočníka čeká ve frontě nejvýš jedno sejmutí (Dvojitá rána = jedno).

## Okna mimo tah (A6)

- **Al Preacher** visí na `_adQueueBlue` (`_adQueueAl`, ZA dobitím) → fronta/fáze
  `AD_AL_OFFER`, akce `ad_al { pay }`, líznutí jako `KILL_REWARD`.
- **Ms. Abigail** dvěma cestami: brána `_vosEvadeGate` bere zahranou kartu (`card`, stačí
  `{ value }`) a otevře okno úniku i bez Údolí stínů (`pendingEvade.abigail`); výstřel nese
  `vos.adAbby` (`_adAbbyVos`), v obraně `adAbigailRespondOk`. **Nový vstup hnědé karty na
  jediný cíl musí kartu bráně předat** (`opts.card` v `_enterTargetSelection`, třetí parametr
  `_startDuel`, `_adAbbyVos` u výstřelu), jinak ji Abigail ignorovat nepůjde. Ignorovat jde
  i nezrušitelný výstřel (ignorovat ≠ zrušit, `_adShotCanceled` se nevolá).

## Zuřivá Doroty a Lee Van Kliff (A7)

Co smí Doroty poručit a LVK zopakovat, říká **jediná tabulka `AD_KINDS`** (core/armed.js,
R13; každý druh tam musí být – hlídá strukturální test v `test/ad.loads.test.js`).

- **Doroty** poroučí i karty s cílem bez vzdálenosti: `DOROTHY_AIMED` zná `Šíp`, `Squaw`
  a `Bomba` a `dorothyTargets` se ptá týmiž dotazy jako vlastní zahrání (`adArrowTargets`,
  `adBoardTargets`, `adBombTargets`) z pozice poručeného. **Squaw a Bomba smí mířit i na
  samotného poručeného** (`DOROTHY_SELF_OK`) – jeho stůl / před něj. Poručená karta jde bez
  vylepšení (`playSpecialCard` bez `adOpts`). Oranžové karty se poručenému vyloží se
  3 žetony; Skrč se! (jen reakce) poručit nejde. Bomba letí `jail_sequence` (dorothyAnim).
- **LVK** opakuje jen základní efekt (jeden cíl, bez vylepšení): Kolona, Malý doušek,
  Nabíjení, Rez, Křesadlovka, Rychlopalba, a od A7 **Šíp** (`aim: 'arrow'` →
  `_adArrowStart` s barvou PŮVODNÍ karty) a **Squaw** (`aim: 'squaw'` → `_adBoardDiscard`,
  i vlastní stůl). Oranžové karty nejsou hnědé, takže paměť `_lastBrown` vůbec nezaloží.
  Bot vybírá cíl opakování stejnými helpery jako při zahrání z ruky (`adBotArrowTargets`,
  `adBotBoardTarget`).

## Bot, zátěž a rozložení (A7)

- **Zátěž** je ve vlastním souboru `test/ad.load.test.js` (běží souběžně s ostatními):
  namnožené karty hotových fází (A1–A3) samo i se vším, „balíček samých X" pro Bombu,
  Stepního běžce a Rez/Bič/Paklíč, partie s postavami natvrdo (A2–A6) a **skutečný balíček
  se skutečným výběrem postav** pro 3–8 hráčů, v páru s každým ostatním rozšířením a se
  všemi naráz. Matice v `test/server.bots.test.js` se kvůli délce běhu nezdvojnásobuje
  (stejně jako u Divokého západu).
- **Bot** v 2500 partiích skutečného balíčku nepotřeboval nouzovou akci ani jednou;
  úspěšnost postav rozšíření (0,35–0,48 při průměru 0,39) je v mezích šumu a síly postav
  (nejvýš Red Ringo a Mexicali Kid), takže ladění nebylo třeba.
- **Mobilní profil**: na kompaktním profilu stojí místo kostiček na kartě štítek „⛁3"
  (`drawAdCubes`), žetony na postavě ve štítku valounů „💰3 ⛁2" (`drawNuggets`, všech šest
  míst volání), pyramida zásoby `adSupplySlot` s invarianty pro oba profily
  (`test/positions.test.js`). Bannery rozmístění/platby leží na `x = 960` jako u ostatních
  rozšíření – to je střed jeviště v obou profilech (jeviště roste symetricky).

## Co zůstává (záměrně mimo A7)

- **Lety kostiček** (`ad_load`, `ad_pay`, `ad_move`, `core/armedAnim.js` z plánu §2.16)
  zatím nejsou – žetony se jen objeví/zmizí se stavem. Pravidla na nich nestojí.

## Testy

`test/ad.setup.test.js` (kostra, balíček, výběr postav), `ad.loads` (žetony, platba, A1),
`ad.weapons` (A2), `ad.hands` (A3), `ad.bomb` (A4), `ad.redraw` (A5), `ad.chars` (A6),
`ad.finish` (A7: Doroty, LVK, celé rozšíření v menu) a zátěž `ad.load`.
