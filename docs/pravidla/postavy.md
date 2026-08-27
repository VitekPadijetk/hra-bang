# Postavy a jejich zvláštní případy

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

## Slab the Killer: zahrané Vedle! se nevrací a útočník je vidět

Dvě věci, které spolu drží: proti Slabovi je potřeba **2× Vedle!** a hráč to musí vědět
DŘÍV, než to první zahraje.

- **Rozehraná Vedle! zůstávají v odhozu.** Dřív se hráči vracela do ruky, když druhé
  Vedle! nepřišlo (`partialMisses` v [logic/response.js](logic/response.js)) – zahraná
  karta se tím ale brala zpět, což pravidla neznají. Teď je karta prostě pryč a hráč
  schytá zásah. Odpadl s tím i serverový návrat karty (`discard_to_hand` ve větvi
  „schytat zásah" v [server/handlers.game.js](server/handlers.game.js)); ta animace
  zůstává jen pro zrušené léčení Sidem Ketchumem.
- **Úhyb si tím pádem líznutí drží** – karta byla zahraná, takže `UHYB_DRAW` ve frontě
  platí. Vyhodí se jen tomu, koho ten zásah vyřadil (stejná podmínka jako u Suzy
  v `_pruneSuzyQueue`; duch z Města duchů má 0 životů, ale ve hře je → lízne si).
- **Postava útočníka se u jediného cíle rozsvítí červeně** (`attackHighlight` +
  `applyAttackTint` ve [view/board.js](view/board.js), `ATTACK_TINT`). Zvýraznění má
  přednost před tahem/čekáním/Clausem a kreslí se ve všech čtyřech větvích okruhu,
  v kompaktním sloupci, v mojí zóně i v diváckém pohledu – **musí se měnit spolu**.
  Hromadné útoky (Kulomet/Indiáni) se nezvýrazňují: cílem je celý stůl. U Duelu je
  útočníkem vždy ta druhá strana (`targetIdx` se v odpovídání střídá).
- **Blikání = „jedno Vedle! nestačí"**: rozhoduje `missesRequired > 1` u požadavku
  `Vedle!`, ne jen jméno postavy – Slabův bonus totiž neplatí na bang-efekt (Úder), kde
  by blikání lhalo. Samotný pulz je `_tickAttackPulse` v [game.js](game.js) nad seznamem
  `App.attackPulse`, který se – stejně jako `App.veraPortraits` – staví od nuly při
  každém renderu desky. **Volá se AŽ za `_tickVeraPortraits`**: útočící Vera Custer, která
  kopíruje Slaba, je v obou seznamech a blikání musí přebít barvu nastavenou Verou.

## Dělení karet mezi víc Vulture Samů

Schopnost Vulture Sama může mít zároveň víc hráčů (Vulture Sam + Vera Custer, která ho
kopíruje). Pravidlo: karty vyřazeného si **rozdělí** – bere se střídavě po jedné, začíná
ten, kdo je za mrtvým první po směru hodinových ručiček. Hra se do rozdělení pozastaví.

Technicky se recykluje existující „panika" cesta, takže klik klienta, bot i guard fungují
beze změny:

1. `handlePlayerDeath` (logic/combat.js) najde všechny živé Samy. Je-li jich víc a mrtvý
   má karty, **karty se nepřesouvají** – zůstanou u mrtvého a do fronty jde
   `{ type: 'VULTURE_SPLIT' }` (tj. PŘED odměnou za banditu).
2. `_nextVultureSplitPick` (logic/characters.js) postaví `pendingSelection`
   (`sourceCardType: PANIC`, `ignoreDistance`, `isVultureSplit`) a fázi `SELECTING_TARGET_CARD`.
3. Klik/bot pošle `select_target_card` → `resolveCardSelection` přesune kartu a přes
   `_advanceVultureSplit` pustí na řadu druhého Sama. Server k tomu emituje `ragtime_steal`
   (z ruky privátně – majitel vidí líc, ostatní rub).
4. Po poslední kartě `_finishVultureSplit` uklidí místo mrtvého, nastaví `_pendingDeathReveal`
   a vrátí se k frontě (teprve teď se líznou 3 karty za banditu).

Cinematika vyřazení je proto rozpůlená: `vulture_split_death` (pokles na nulu, karty
zůstávají ležet) → jednotlivé `ragtime_steal` → `player_death_reveal` (úklid + odhalení role).
Klient po tu dobu drží `App.vultureSplitIdx` – podle něj `deathCardsStillShown` kreslí
karty mrtvého dál a slot pro kartu role zatím nerezervuje.

## Lucky Duke: výběr a pak KLASICKÉ sejmutí

Lucky Duke si u každého snímání líže 2 karty a jednu si vybere. Během výběru se marky
(hodnota/barva) **nezvýrazňují** – blikání na obou kartách mate. Po kliknutí
(`playLuckyDukeResult` v game.js):

1. NEvybraná odletí ze svého slotu rovnou do odhozu (`LD_DROP_MS`) – v depth **pod**
   hromádkovou vrstvou vybrané karty (`REVEAL_PILE_DEPTH - 1`). Na odhozu totiž leží
   (`holdUntil`) po celou cinematiku, dokud nedorazí stav; s výchozím depth `animateCard`
   (800) překrývala jak zvětšenou kartu uprostřed, tak její sestup do odhozu.
2. Vybraná se přesune doprostřed obrazovky a odtud jede přesně to, co vidí každý jiný
   hráč u sejmutí (`startCheckReveal`): zvětšení → `pulseCheckMark` → výdrž → sestup do
   odhozu. Součet `LD_TO_CENTER_MS + LD_HOLD_MS + LD_TO_DISCARD_MS` = `CHECK_REVEAL_MS`
   (3850) a **musí se rovnat `ANIM_MS.lucky_duke_result`** v `net/handlers.js`.
3. Teprve pak jde frontou výsledek checku (vězení/dynamit). Protože vybraná karta dosedne
   jako poslední, `luckyDukePick` (logic/characters.js) ji do odhozu vkládá **až po**
   nevybrané – hromádka tak sedí s tím, co hráč viděl.

Po dobu cinematiky drží server boty přes `room._revealBlockUntil` (nastaví `handleLuckyDuke`,
respektuje `scheduleBotTick`) – stejně jako u smrti nebo odkrytí karty High Noon.
Panel karet se po kliknutí schová přes `App.luckyDealIds` (stav s koncem fáze `LUCKY_DUKE`
dorazí až za celou animací, jinak by karty zůstaly viset na slotech).

## Odkrytá řada (Kit Carlson / Claus): došlý balíček ji rozdělí na dvě části

Odkrytá řada se rozdává **stejnou cestou jako hokynářství**. Když balíček během odkrývání
dojde, odkryje se nejdřív to, co v něm bylo, pak se zamíchá (hra čeká) a teprve pak dorazí
zbytek – dřív se jen o 5,7 s odložil celý broadcast a řada naskočila naráz až po míchání.

- Rozhoduje o tom `_revealAnim(deckBefore, dealt)` ([logic/draw.js](logic/draw.js)), jehož
  výsledek jde ve stavu jako `kitCarlsonState.anim` / `clausState.anim`:
  `'none'` (karet byl dostatek), `'proactive'` (balíček se vyprázdnil poslední odkrytou
  kartou → míchá se až po rozdání, paralelně s výběrem), `'blocking'` (došel dřív → rozdá
  se `dealtBefore`, zamíchá se, dorozdá se zbytek). Zároveň **potlačí legacy
  `reshuffle_anim`** (vynuluje `_reshuffleOccurred`), aby se míchání nepřehrálo dvakrát –
  přesně jako `openStore`.
- **Kde ta řada leží, závisí na tom, KDO se dívá** (`clausPanelLayout`/`clausSlotPos`
  v [game.js](game.js), jediný zdroj pro kreslení, rozdávání i lety k příjemcům):
  vlastník ji má odkrytou uprostřed stolu, **ostatní i divák ji vidí rubem zaparkovanou
  u jeho místa** a natočenou podle jeho sedadla – u Kita to tak bylo vždycky
  (`_kitSpecParked`), u Clause je řada jen delší, takže se rozteč s počtem karet zmenšuje
  a délka je zastropovaná (`CLAUS_SPEC_*`). Uprostřed stolu by z ní byla jen anonymní
  hromada rubů, kterou si nikdo s Clausem nespojí. Kdo kreslí/animuje kartu z řady, musí
  proto brát i **`P.angle`** (deska, `claus_pick`, `law_reveal` s `from: 'claus'`).
- Klient to hraje přes `dealRevealRow(n, anim, tempo, flyOne, onDone)` ([game.js](game.js)) –
  jeden rozdávač pro Kitův panel, Clausovu řadu i pohled ostatních na Kita. Po dobu
  rozdávání kreslí balíček podle vlastního počtu (`App.dealDeckCount`, sdílené
  s hokynářstvím) a drží `App.revealLocked` (z řady zatím nejde vybírat – stav s fází
  dorazí hned, protože míchání si řídí klient) a `App.revealShuffling` (balíček se po tu
  dobu nekreslí).
- Boti čekají přes `room._revealBlockUntil` / `room._reshuffleBlockUntil`, které se počítají
  **stejným vzorcem** (`revealCinematicMs` v [server/anim.js](server/anim.js), tempo v
  `REVEAL_TEMPO` musí zrcadlit `KIT_TEMPO`/`CLAUS_TEMPO` v game.js).
- Když karet není dost ani po zamíchání (došel i odhoz), odkryje se prostě míň:
  Kit si nechá `min(kitNeeded, revealed.length)`, Claus má přednost před rozdáváním
  (`keep` napřed, `queue` až ze zbytku) – jinak by výběr nešel dokončit.

## Claus the Saint, Uncle Will a Johnny Kisch (postavy z Fistfulu)

- **Claus the Saint** (3 životy) – ve fázi lízání odkryje o kartu víc, než je hráčů ve
  hře, pak dá po jedné každému ostatnímu a 2 si nechá. **Odkrývá celou fázi jedním klikem**
  na balíček (při 8 hráčích by jinak klikal devětkrát) a rozděluje z odkryté řady:
  nejdřív si vezme svoje, pak po jedné ostatním. Komu se právě vybírá, drží
  `clausState.toIdx` – tomu hráči svítí postava. Kde ta řada leží a co s ní udělá došlý
  balíček, řeší sekce „Odkrytá řada (Kit Carlson / Claus)" níž.
- **Uncle Will** (4 životy) – jednou za svůj tah smí zahrát libovolnou kartu z ruky jako
  Hokynářství. Aktivní režim (tlačítko „WILL: karta → 🏪") čeká na klik na kartu v ruce,
  stejně jako José/Doc.
- **Johnny Kisch** (4 životy) – kdykoli vyloží kartu do hry, všechny ostatní vyložené
  karty se stejným jménem se odhodí. Jediný trychtýř je `_johnnyKischPurge(ownerIdx,
  cardName, justPlayed)` ([logic/characters.js](logic/characters.js)), volaný ze všech
  tří míst, kudy karta na stůl doputuje: `playBoardCard`, výměna zbraně
  ([logic/play.js](logic/play.js)) a vyložení Vězení před soupeře.

## Pivo nemá efekt, když jsou ve hře dva hráči

Klient to nenabízel už dřív (`cardPlayability`), ale server pravidlo hlídal jen u záchrany
posledního života (`beerLastLifeSave`), takže v koncovce 1v1 se z ruky pořád léčilo. Gate je
teď i v efektu `CardType.BEER` ([logic/play.js](logic/play.js)). **Zákaz platí jen na kartu
Pivo** – Salón, Whisky, Čutora, Tequila i Sid Ketchum léčí dál.

## Pálenka se nenabízí s plnými životy

„Vynech fázi lízání a vezmi si 1 život" nemá s plnými životy co dát, takže by tlačítko
šlo zmáčknout jen omylem – a hráč by přišel o celou fázi lízání za nulu. Rozhoduje o tom
`_drawOptionsBase(player)` ([logic/draw.js](logic/draw.js)), tedy **jediný zdroj pravdy**
pro server, klientské tlačítko i bota; `drawCard('liquor')` se navíc ptá znovu v okamžiku
akce (`options` je jen snímek z okamžiku, kdy fáze začala).

