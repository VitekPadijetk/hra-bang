# Údolí stínů (The Valley of Shadows)

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.
> Plán karta po kartě (háky, rozhodnutí R1–R15, co se v které fázi odchýlilo): [docs/udoli-stinu-plan.md](../udoli-stinu-plan.md).
> Pravidla obou vydání (české Albi je originál a u devíti karet se liší od mezinárodního): [docs/udoli-stinu.md](../udoli-stinu.md).

## Stav a rozhodnutí

**Hotové je celé rozšíření (fáze F0–F9)**: všech 15 druhů karet (16 kusů) i 5 postav má
efekt, bot je umí hrát a rozšíření jde zapnout v menu jako každé jiné (`MENU_EXPANSIONS`;
že nápověda sedí s `VOS_CARDS_READY`/`VOS_READY`, hlídá test v `test/vos.cards.test.js`).
Oba seznamy jsou dnes celé a zůstávají jen jako pojistka (vzor `GEAR_READY`).

**Rozhodnuto uživatelem:** česká mechanika podle Dynamite Boxu 2023, ale jen **5 postav**
původního českého vydání (tři bonusové patří do budoucího mini-rozšíření Nejhledanější,
podklady jsou v příloze A plánu), pauza na reakci jen když reagovat jde (R4), art dodává
uživatel. **Pravidla platí podle plánu a art je NEMĚNÍ** – zásada „zdroj pravdy = text
na artu" z Divokého západu se na Údolí stínů nevztahuje.

**Pozor na jména:** v kódu prefix `vos`, nikdy `shadow` (= Stínoví pistolníci) ani `ghost`
(= duch Města duchů) – karta Duch je `DUCH` / `hasDuchCard`.

Soubory: data `cards.udoli_stinu.json` (id 700–715, `text` pro štítek, `art` = slug
v `assets/card_art/udoli_stinu/`), postavy id 50–54 v characters.json, mixin
[logic/valley.js](../../logic/valley.js), zrcadlo [core/valley.js](../../core/valley.js)
(`vosOn`, `VOS_CARDS_READY` = druhy, které smí do balíčku, `VOS_MARK_READY`,
`hasDuchCard` a tabulka **`VOS_KINDS`** = co smí poručit Zuřivá Doroty a zopakovat Lee
Van Kliff – hlídá ji strukturální test), časování [core/vosAnim.js](../../core/vosAnim.js).

## Assety (F0)

Art všech 15 karet i 5 portrétů je dodaný (`assets/card_art/udoli_stinu/*.webp`,
`assets/characters/050–054.webp`) a s nimi **značka supa**
(`assets/card_marks/udoli_stinu.webp`, `VOS_MARK_READY = true`). Značky rozšíření (býk
i sup) mají **100×100 px** a pečou se v rozměru souboru × 0,5 (`MARK_LAYOUT.bullScale`,
game.js), kotva pravý horní roh – jiný rozměr souboru = jiná velikost na kartě.
Štítky zůstávají jako záloha: karta bez artu, ale s `text`, jde přes `paintCardLabel`,
postava s `portrait: false` přes `buildPortraitLabels` (game.js).

## Karty na existující mašinerii (F1)

- **Tomahawk** – jen data: bang-efekt s dostřelem 2.
- **Poslední pivo** – `cardEffects` v `playCard`; není to karta Pivo.
- **Chřestýš** – sejmutí v `logic/checks.js` po Dynamitu a Vězení
  (`_rattlesnakePending`/`_rattlesnakeOrDraw`), ♠ = klikaný zásah se `source:
  'RATTLESNAKE'`. Karta zůstává, takže si tah pamatuje `p._vosSnakeTurn` a dynamit, který
  zůstal ležet, `_dynamiteStayTurn`.
- **Odměna** a **Brokovnice** – `_vosOnBangHit` v logic/valley.js; volá se při zásahu
  z `handleResponse` i ze záchrany posledního života v `_advanceAfterLastLifeSave`.
  Brokovnice má fázi **`SHOTGUN_DISCARD`** z fronty odložených akcí a akci **`vos_pick`**.
- **Lemat** – `lematBangOk` → `altBangOk` = Zúčtování NEBO Lemat, týž přepínač
  „ZAHRÁT JAKO BANG!".

Chřestýš a Odměna se vykládají přes `playSpecialCard` před LIBOVOLNÉHO hráče – jediný
dotaz je `vosPlaceTargetOk` (core/valley.js).

**„Je to karta BANG!?" (R5) = `isBangCardPlay`** (core/playability.js – ne core/valley.js,
playability se na valley ptá sám, vznikl by kruh): zjišťuje se V OKAMŽIKU ZAHRÁNÍ
v `playBang` a útok si výsledek nese jako **`vos = { bangCard, shotgun }`** stejnou cestou
jako `ricochet` (pendingBarrelCheck → currentCheck → pendingResponse). Bez zapnutého
rozšíření se klíč `vos` do stavu vůbec nepíše.

## Colorado Bill a Limonádový Jim (F2)

**Colorado Bill** (`_startColorado`/`_coloradoResult` v logic/valley.js) – hák v `playBang`
hned za Apache Kidem: karta BANG! jde nejdřív do sejmutí `CHECK_DRAW` s reason
`COLORADO`, rozehraný útok si nese `pendingCheckDraw.colorado`; ♠ přidá do kontextu
**`vos.unavoidable`**, které vypne Barel i Jourdonnaise v `_beginBangResolution`
a odmítne každou obrannou kartu v `handleResponse` – Pivo/Sid/Batoh na posledním životě
zůstávají. Klient, bot i server se ptají **`vosUnavoidable`** (core/valley.js); Útěk
a Opětovná palba se na něj ptají taky.

**Limonádový Jim** (`_lemonadeOnBeer`/`lemonadeChoice`) – trychtýř na KARTU Pivo
**`_onBeerCardPlayed`** v logic/characters.js, který volá i Madam Yto; za CIZÍ Pivo jde
do fronty `LEMONADE_OFFER` → fáze `LEMONADE_OFFER`/`pendingLemonade`, akce
**`vos_lemonade { cardId | null, playerIdx }`**, kdo smí, říká `lemonadeEligible`.

## Fronta výstřelů (F3)

**`_vosShots`** (R6, logic/valley.js – vzor Roubík): výstřel bez karty a mimo pořadí se
zapíše (`_vosQueueShot`) a odpálí (`_drainVosShots`) až v KLIDU (`_vosShotCalm`: fáze PLAY,
prázdná fronta odložených akcí, nic rozdělaného, žádný resume příznak). Odpaluje se
v `_processSpecialQueue` (za Roubíkem), v `_resumeAfterSpecial`, pojistkou v `tryEndTurn`
a v háku `beforeBroadcast` (server/anim.js); `nextTurn` zbytek zahodí. **Ocas fáze lízání
frontu podrží (`_vosHolding`)** – Želízka a Ranč se ptají „je fáze PLAY?" a rozeběhlý
výstřel Evelyn by je přeskočil.

Výstřel je bang-efekt s kontextem **`vos.shot`** – podle něj `handleDamage(…, { killerIdx })`
připíše smrt STŘELCI, ne hráči na tahu. **Smrt hráče na tahu ve fázi RESPOND /
DYNAMITE_DAMAGE dorovná `_turnOwnerGone`** (logic/combat.js): `handlePlayerDeath` posouvá
tah jen ve fázi PLAY/DRAW. Volá se na konci každé obrany (kromě série Fistful of Cards,
tu si řeší krokovač startu tahu), na konci Duelu a v ocasu Dvojité rány. Opravilo to i
starý Duel, ve kterém prohrávající iniciátor zůstal mrtvý na tahu, a v F9 vynucený Bang!
na sebe pod Právem západu (Fistful).

Karty:

- **Opětovná palba** – `isMissedCard` v core/playability.js = karta Vedle! pro Calamity,
  Big Spencera, Kazatele i Lemat; výstřel zpět zapíše `_vosBackfireCheck` až při
  DOKONČENÉ obraně.
- **Roztříštěná kulka** – `playFanning`, akce **`play_fanning { cardIdx, firstIdx,
  secondIdx }`**, akce karty `FANNING`, cíle `fanningTargets` v core/valley.js už zúžené
  podle povinnosti Dynamite Boxu, `fanningOk`; čerpá limit BANG!, kartou BANG! není.
- **Dvojitá rána** – `play_bang` + `aimCardId`, `aimOk`/`aimCardFor`; zásah = **klikané
  zásahy S ÚTOČNÍKEM** `pendingDynamiteDamage.attackerIdx` → `_vosAimClick` přes
  `handleDamage`, `resume: 'RESPOND_TAIL'` → `_vosAimTail`; Pivo v obraně zruší jen jeden
  ze dvou životů.
- **Evelyn Shebang** (postava) – volba `'evelyn'` v `options` fáze lízání (`evelynOffer`/
  `evelynTargets`, `drawCard('evelyn', cíl)` → `evelynShoot`).

UI: přepínač „+ DVOJITÁ RÁNA" nad slotem schopností (geometrie `abilExtraSlot`, viz F9),
dvoukrokové míření kulky (`_vosFanningRole`), tlačítko Evelyn ve slotu schopností; výstřel
z ruky posílá jen `emitPlayBang` (view/board.js).

## Kolečko voleb (F4)

**`pendingVosRound`** (logic/valley.js – `_startVosRound`/`_advanceVosRound`/`_vosRoundPick`/
`_finishVosRound`/`vosPokerTake`) pro **Divokou bandu** (`BANDIDOS_DISCARD`, odhazuje se
hned), **Tornádo** (`TORNADO_PICK`) a **Poker** (`POKER_PICK` → `POKER_TAKE`).

**Z ruky vybírají všichni naráz** (`waiting` = kdo ještě nevybral) – jediné místo hry, kde
se čeká na víc hráčů najednou, proto **`pendingActors`/`waitingStatusFor`**
(core/pending.js): ptá se jimi bot driver, guard (`vos_pick` od kohokoli z `waiting`, jen
za vlastní místo), `decideBotAction` i jantarové zvýraznění na desce. U Tornáda a Pokeru
se volba jen zapíše do `picks` (redakce ji nechává jen vlastníkovi) a karty se hýbou až po
posledním. Platnou volbu říká `vosRoundPickOk`/`pokerTakeOk` (core/valley.js).

**Dokud kolečko běží, `_processSpecialQueue` nic nespouští (vrací `true`) a Roubík ho
nepřeruší** – Suzy Lafayette si lízne až po přesunu. Karta jde z ruky ven dřív, než se
vybírá (`_vosPlayRound`). Akce `vos_pick` a `vos_poker_take`; animace (`tornado_pass`,
`poker_reveal`, `poker_take`) zapisují pravidla do `_vosAnim` a posílá je `flushVosAnim`
(server/anim.js), boti čekají na `room._vosBlockUntil` (časování core/vosAnim.js).
Řada vyložených karet Pokeru má geometrii v `pokerRow`/`pokerSlotX` (core/layout.js,
viz F9) – sdílí ji deska i obě cinematiky.

## Duch (F5)

Vyřazený hráč zpátky ve hře s nulou životů, natrvalo. Stav se ODVOZUJE z karty na stole –
trojice **`hasDuchCard`/`isVosGhost`/`staysInPlay`** v core/distance.js; `isInPlay` Ducha
zahrnuje, `canHeal` ne. **`staysInPlay` = „ve hře natrvalo" (živý nebo Duch)** – bez
ducha Města duchů a stínu, kteří jsou ve hře jen na svůj tah; ptá se jím pořadí tahů,
výhra, kdo odkrývá události, Daltonové, Mrtvý muž, Hřbitov a dedukce rolí.

**Na Ducha se nestřílí** (`computeCanHit` vrací false, playBang, Duel, hromadné útoky,
Evelyn i fronta výstřelů ho míjejí) a nic, co bere život, na něj nedopadá (dynamit
vybuchne bez zásahu, Chřestýš se nesnímá); krást, odhazovat, Vězení i Daltonové na něj
jdou. Kartu může sebrat kdokoli – odchod uklízí **`_vosGhostSettle`** (logic/valley.js;
volá ho `_processSpecialQueue`, `_resumeAfterSpecial`, krok startu tahu `_vosGhostTurnStep`
za Daltony a Lasem a hák před broadcastem) v klidu: ruka a stůl do odhozu
(`_ghostLeaveAnim`), bez odměny, přepočet výhry, a odešel-li hráč na tahu, posun tahu.
`_vosWasGhost` slouží JEN tomuhle úklidu. Laso Ducha vyřazuje i s kartou.

**Každé napřímo položené `health > 0` / `health <= 0` v logic.js, logic/* a core/* musí
být v tabulce `LIFE_OK` s důvodem** (strukturální test v `test/vos.ghost.test.js`) –
„ve hře" se ptá `isInPlay`/`staysInPlay`, napřímo jen skutečný život.

## Okno úniku – Útěk a Mick Defender (F6)

Fáze **`EVADE_OFFER`** (logic/valley.js). Karta na JEDINÝ cíl bez vlastní obrany jde do
hry jedním ze tří vstupů:

- **`_enterTargetSelection`** – Panika, Cat Balou, Ragtime, Krytý vůz, Kankán, Lee Van
  Kliff. **Fázi `SELECTING_TARGET_CARD` napřímo nesmí zakládat nic jiného** než tři
  hromadné výběry – hlídá to strukturální test v `test/vos.reactions.test.js`.
- **`_placeOnTarget`** – Vězení, Chřestýš, Odměna, Duch; karta leží před cílem už během
  rozmýšlení.
- **`_startDuel`**.

Brána `_vosEvadeGate` otevře okno, jen když cíl reagovat může (`vosEvadable`/`evadeOptions`,
core/valley.js: Útěk v ruce, nebo Mick s kartou, kterou pustí `playsAsMissed`); odmítnutí
dohraje `_evadeContinue` podle `pendingEvade.resume` (DATA: `SELECTION`+`pick` / `PLACE` /
`DUEL`). Dokud okno visí, fronta odložených akcí stojí a Roubík ho nepřeruší. Akce
**`vos_evade { cardId | null, playerIdx }`**. Vybavení Zlaté horečky (Komplic, Láhev) okno
neotevírá (`gear: true` v deskriptoru `_repeatBrownEffect`).

**Útěk proti bang-efektu** je platná odpověď v RESPOND, která zruší celý efekt – jediný
predikát **`escapeRespondOk`**; co kartou na jediný cíl není (Doc Holyday, Láhev,
Roztříštěná kulka se dvěma cíli), nese v kontextu útoku **`vos.noEscape`**.

## Henry Block – pozastavená akce (F7)

Opak fronty výstřelů: NEJDŘÍV výstřel, pak přesun karty; „když zloděj umře, karta zůstává
Henrymu". Kdo vystřelí, říká jediný predikát **`henryFires(state, henryIdx, thiefIdx)`**
(core/valley.js; server `_henryFires` k němu přidává jen „v téhle akci už vystřelil",
`_henryPass`) – ptá se ho i bot.

Hák **`_henrySuspend`** sedí tam, kde kartu bere / odhazuje hráč svým rozhodnutím:
`resolveCardSelection` (Panika, Cat Balou, Ragtime, Rvačka, Kankán, Krytý vůz, Lee Van
Kliff, Komplic/Láhev, Zuřivá Doroty – ne Daltonové ani dělení mezi Vulture Samy),
`drawCard` (Jesse Jones, Pat Brennan), `gearForceDiscard` (Zlatá horečka, cena se platí
hned) a odměna Obětavého skoku z ruky. Akce se zapíše do **`_vosSuspended = { kind:
'SELECTION'|'DRAW'|'GEAR'|'SAVE', henryIdx, thiefIdx, … }`** (DATA, `henryIdx`/`thiefIdx`
jsou v `SEAT_KEYS`) a Henry vystřelí bang-efekt s `vos.shot = 'HENRY'` (zabil Henry)
a `noEscape`. **`_henryResume`** ji dokončí na začátku `_processSpecialQueue` (PŘED
schopnostmi, které výstřel spustil – Bart, El Gringo) a v `_resumeAfterSpecial`;
s `_henryPass` se podruhé nestřílí. Teren Kill jako zloděj: čeká se na jeho sejmutí.
Fáze lízání Jesseho/Pata během výstřelu jen dostane `active: false` (pozná ji `drawId`).
Odražená střela jde výjimečně frontou výstřelů (`_henryRicochet`).

Handlery při pozastavení let krádeže neposílají; pohyb si po výstřelu zapíšou pravidla
(`_henryAnim`, ID z `_henryMovedId`) a pošle ho **`flushHenryMove`** (server/anim.js) jako
`ragtime_steal` / `jesse_jones_draw` / odhoz. Roubík ji nepřeruší, `nextTurn` ji zahodí.

## Obětavý skok – okno záchrany a odměna (F8)

Fáze **`SAVE_OFFER`** a **`SAVE_REWARD`** (logic/valley.js).

**Brána `_vosSaveGate(victimIdx, resume)` stojí na TŘECH místech, kde ztráta života
vychází z rozhodnutí oběti (R9)**: oběť bere zásah v `handleResponse` (`'RESPOND'` – BANG!,
bang-efekty, Kulomet, Indiáni, prohraný Duel, výstřely mimo pořadí, Fistful of Cards),
klikaný zásah `takeDynamiteHit` (`'CLICK'` – dynamit, Chřestýš, Ruská ruleta, Madam
Zuzana, Roubík i oba životy Dvojité rány zvlášť) a `takeNoonHit` (`'NOON'`). **Každý nový
vstup ke ztrátě života musí jít přes ni, nebo být vyjmenovaný s důvodem** (dobrovolná
ztráta – Chuck Wengam, Pokrevní bratři) – hlídá to strukturální test v
`test/vos.save.test.js`.

Okno se otevře jen se zachráncem (`saveCandidates` v core/valley.js: drží kartu, je ve hře,
není oběť a NENÍ NA TAHU – `_turnOwner`); víc zachránců (namnožená data) dostává nabídku
po směru od oběti po jednom. **Kdo zachraňuje, vidí jen on** – `redactState` ostatním nuluje
`pendingSave.saverIdx` i `declined`, takže jim `pendingActor` vrátí `null` (R4).

Pokračování je ZNOVUZAVOLÁNÍ téže funkce: rozhodnutí se zapíše do `_vosSaveDecision`
a brána ho při druhém průchodu spotřebuje (`_vosSaveContinue`); zachráněný klik jen
odečte zásah (`_vosSavedClick`, vzor Pivo). Záchrana není zásah – žádná Odměna,
Brokovnice ani valoun. **Zásah se po rozhodnutí dohrává uvnitř handleru `vos_save`, takže
ten musí udělat totéž co `respond_to_card`/`take_dynamite_hit`** (animace vyřazení +
`handleAutoEndTurn`) – jinak mrtvý zůstane na tahu.

**Odměna až po doběhnutí CELÉHO efektu** (dV 1588981): záchrana se zapíše do
`_vosSaveRewards` a vyřídí se v klidu (`_drainSaveReward` na začátku `_drainVosShots`, klid
= `_vosQuiet`, tedy i po Kulometu, po všech zásazích dynamitu, po startu tahu); „přežije-li"
se posuzuje až tehdy. Volba `vos_save_reward { from: 'hand'|'deck', playerIdx }`: z ruky
2 NÁHODNÉ karty (animaci zapíše `_vosSaveAnim`, pošle `flushSaveTake` v server/anim.js),
z balíčku `KILL_REWARD` se štítkem; zachráněný bez karet → rovnou balíček. Z ruky
**Henryho Blocka** = jeho výstřel na zachránce (`_henrySuspend` s `kind: 'SAVE'`). Dokud
okno nebo volba visí, fronta odložených akcí stojí a Roubík je nepřeruší.

## Bot, zátěž a rozložení (F9)

**Bot** – větve pro všechny nové fáze přibývaly s F1–F8 (strukturální test „každý kind
z pendingActor má větev bota"). F9 přidala **Henryho Blocka do výběru cíle**
(`henryAwarePick`/`henryShotDeadly`/`henryBrawlDeadly` v core/botPolicy.js): krádež od
Henryho jen jako poslední možnost, s výstřelem, který by bota vyřadil (poslední život
a žádná karta Vedle!), vůbec. Platí pro každou cestu, kudy bot cizí kartu bere nebo
odhazuje – Panika, Cat Balou, Ragtime, Krytý vůz, Kankán, Lee Van Kliff, Komplic / Láhev,
vynucené odhození vybavení (s Henrym za poloviční hodnotu) i Rvačka; Jesse Jones a Pat
Brennan od Henryho nelížou nikdy (balíček je zadarmo). K tomu `keepScore` pro Ducha –
**`keepScore` musí znát každý druh karty rozšíření** (test v `test/vos.bot.test.js`).

**Zátěž** je ve vlastním souboru **`test/vos.load.test.js`** (sdílený harness
`buildCtx`/`pumpToWinner` v `test/_botHarness.js`), aby běžela souběžně
s `test/server.bots.test.js`. Obsahuje sady F1–F8 (namnožená data jednotlivých fází, stoly
plné jedné postavy) a „balíček samých X" pro **každý** z 15 druhů, který hlídá obecné
invarianty: žádné okno ani rozdělaná akce nezůstane viset mimo svou fázi, vyřazený
nezůstane na tahu, žádná karta se nezdvojí a Duch nezíská život. Údolí stínů je navíc
čtvrtý rozměr hlavní matice „rozšíření × 3–8 hráčů" v `test/server.bots.test.js`.
**Zátěž pumpuje hru synchronně, ale timeouty serveru spouští po každé akci**
(`mock.timers` v `pumpToWinner`) – server drží Paniku, Cat Balou, Krytý vůz i Kankán mimo
odhoz, dokud je tam nedoveze animace, a bez toho karty ze hry postupně mizely. Kde bot
nějakou cestu chytře obchází (zloděj, kterého Henry vyřadí; Jesse u Henryho; odměna
„z ruky"), polovina her ji vynucuje sama – jinak by ji zátěž přestala procházet.

**Rozložení** – na stůl rozšíření nepřidává nic trvalého, ale dvě věci se kreslí přes
ostatní, takže by kolize nebyla vidět jako rozbitá deska, jen by něco tiše zakrývalo:

- **Řada vyložených karet Pokeru** (`POKER_TAKE`) – `pokerRow(L)`/`pokerSlotX(L, i, n)`
  v core/layout.js, pole profilu `pokerRowY`/`pokerScale`/`pokerStepX`. Desktop 560 /
  0,46 / 165 (pod druhou řadou stolu horního soupeře, mezi bočními soupeři při 8 hráčích),
  mobil 546 / 0,32 / 175 (pásmo mezi kompaktní řadou soupeřů a mým stolem – vyhoví jen
  y 544–548).
- **Přepínač „+ DVOJITÁ RÁNA"** – `abilExtraSlot(L, abilX)`: o řádek nad slotem schopností,
  na mobilu (kde je nad ním „Ukončit tah") ještě o řádek výš.

Obojí hlídají invarianty v `test/positions.test.js` (desktop, široké, vysoké, mobil,
mobil 16:9; 3–8 hráčů s plným stolem i rukou).

## Testy

`test/vos.setup.test.js`, `test/vos.cards.test.js`, `test/vos.characters.test.js`,
`test/vos.shots.test.js` (F3), `test/vos.round.test.js` (F4), `test/vos.ghost.test.js` (F5),
`test/vos.reactions.test.js` (F6), `test/vos.henry.test.js` (F7), `test/vos.save.test.js` (F8),
`test/vos.bot.test.js` (F9) a zátěž `test/vos.load.test.js`.

Strukturální testy, které hlídají, že se nový kód nerozejde s mechanismy rozšíření:

1. každé `health > 0` / `health <= 0` v logic/* a core/* je v tabulce `LIFE_OK` (F5);
2. `SELECTING_TARGET_CARD` se zakládá jen přes `_enterTargetSelection` (F6);
3. každý vstup ztráty života jde přes bránu Obětavého skoku, nebo je vyjmenovaný (F8);
4. `VOS_KINDS` má rozhodnutí pro každý druh karty (Doroty, Lee Van Kliff – F0);
5. `keepScore` zná každý druh karty (F9).
