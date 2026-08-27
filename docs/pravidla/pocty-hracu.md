# Hra pro 3 a pro 8 hráčů (Město duchů)

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

## Hra pro 3 hráče (Město duchů): odkryté role a cíle v kruhu

U stolu **nesedí šerif**, ale pomocník, bandita a odpadlík; všechny tři role leží **lícem
nahoru**. Cíle jsou v kruhu (`TARGET_3P` v core/roles.js): pomocník loví odpadlíka,
odpadlík banditu, bandita pomocníka. Kdo svého určeného nepřítele vyřadí **osobně**,
vyhrává hned; zabije-li ho někdo jiný (nebo dynamit, tedy nikdo), novým cílem obou zbylých
je zůstat naživu jako poslední. Odměnu **3 karet dostane každý, kdo někoho vyřadil**, bez
ohledu na role.

Trik implementace je, že **většina „co s tím, že není šerif" vypadne sama**: Vězení na
kohokoli ([logic/play.js](logic/play.js) `playSpecialCard`), žádný +1 život
(`healthForCharacter`), žádná pokuta za zabití pomocníka ([logic/combat.js](logic/combat.js))
i zvýraznění cílů v UI viselo na roli `Sheriff`, která ve hře pro 3 neexistuje. **Tyhle
podmínky se proto neupravovaly – jen se testem ověřilo, že platí.**

- **Zapnutí režimu** – `gs.mode3p`, nastaví `_applyThreePlayerMode()` (logic/setup.js) z obou
  setupů přes `isThreePlayerMode(players)` = *tři hráči a nikdo není šerif*. Debug hra pro 3
  si role losuje ze všech čtyř, takže tam šerif být může a jede klasika. `mode3p` je prosté
  pole stavu → doteče přes `room_update` i ke klientovi (redakce ho propouští).
- **Kdo začíná** – `firstPlayerIndex(players)` (core/roles.js), na `GameState` jako
  `_firstPlayerIndex()`. Řídí první tah, pořadí rozdávání v intru (`server/intro.js`),
  odkrytí karty High Noon (`_flipEvent`) a start Daltonů (`_startDaltons`). **Dřív bylo
  všude `findIndex(role === 'Sheriff')`, které by vrátilo −1 a hra by se nerozjela.**
- **Výhra** – `evaluateWinner(players, { mode3p, winClaimIdx })` → `evaluateWinner3p`.
  `_winClaim3p` nastaví `handlePlayerDeath`, když `TARGET_3P[killer.role] === dead.role`.
  Bez claimu se vítěz hlásí **až při jednom živém**, čímž se „nový cíl = zůstat poslední"
  implementuje sám. **Vypisuje se jednotné číslo podle role** („Bandita vyhrál!") – každá
  role je u stolu jen jedna, množné „Bandité vyhráli!" by nedávalo smysl.
- **Odkryté role** – `redactState` je propouští (`server/rooms.js`) a karta role leží na
  stole u každého. Recykluje se **týž slot, jaký dostane vyřazený hráč**: `_roleSlot`
  ([view/board.js](view/board.js)) a zrcadlící `hasRoleCard`/`displayIdx`
  ([positions.js](positions.js)) – **ty se musí měnit spolu**, jinak animace míří o kartu
  vedle. Cinematika vyřazení proto **odhalování role přeskakuje** (`skipReveal`), stejně
  jako u šerifa; server i klient to počítají shodně, aby se boti podrželi na správnou dobu.
  Slot je obsazený **od začátku hry**, takže se skupina „životy + postava" středí jinak
  (`numBluePrimary` v `drawOpponents`) – **`_introOppSlots` ([view/intro.js](view/intro.js))
  to musí počítat taky** (`numBlue = state.mode3p ? 1 : 0`), jinak karty postav soupeřů
  v intru dosednou na kartu role.
- **Intro** – `runIntroSequence` posílá roli **i v broadcastu** `role_card_fly`, ale JEN
  v 3P (u ostatních počtů je tajná a chodí výhradně soukromým `intro_role`; hlídá to test).
  Klient cizí kartu za letu překlopí a nechá ji ležet přes `placedCards` (`role:<idx>`) na
  slotu, kam ji pak kreslí deska – přechod do hry je beze skoku.
- **Rotující šerif** – v 3P rotuje **pomocník**. `roles.filter(r => r !== 'Sheriff')` by
  v 3P neodebral nic a `splice` by do 3členné hry přidal ČTVRTOU roli.
- **Bot** – `computeBeliefs` v 3P nic nededukuje (všechny role zná jistě) a `roleHostility`
  má vlastní cyklickou větev (`opts.mode3p`): můj určený nepřítel 3, třetí hráč 1. **Nikdo
  není spojenec** – vyhrát může jen jeden.
- **Rozložení** – oba soupeři sedí **naproti vedle sebe** (`OPPONENT_ANCHORS[2]` = dvě horní
  kotvy), ne po bocích.

## Hra pro 8 hráčů (Město duchů)

Jen jiná sada rolí: **1 šerif, 2 pomocníci, 3 bandité, 2 odpadlíci**
(`rolesForPlayerCount(8)`). Je to **jediný počet se dvěma odpadlíky** a `evaluateWinner`
to zvládá bez úpravy: odpadlík vyhrává jen jako jediný žijící, takže mrtvý šerif proti dvěma
živým odpadlíkům dá výhru banditům. Co bylo potřeba dodělat:

- **Kotvy soupeřů** – `OPPONENT_ANCHORS[7]` = 2 vlevo, 3 nahoře, 2 vpravo. Nahoře je rozteč
  430 px, proto se při 7 soupeřích zmenší i karty (`oppScaleByCount`, 0,27 → 0,25).
- **Bot** – druhý odpadlík je **rival, ne spojenec** (`roleHostility` Renegade vs Renegade)
  a taky drží šerifa při životě (`opts.renegadesAlive`): dokud žije, je zabití šerifa prohra.
- **Rozpočet postav** – 8 hráčů × 2 nabídky = **přesně 16 základních postav**, nulová
  rezerva. Hlídá to smoke test na `setupGame(8)` ve všech kombinacích
  `singleChar`/`highNoonExtra`.
- **Mobil** – kompaktní řada zvládá libovolný počet, jen `COMPACT.minScale` muselo klesnout
  z 0,24 na 0,22: je to PODLAHA (`Math.max`), takže při 7 sloupcích na jevišti 1920 px
  šroubovala měřítko nahoru a řada tří karet se do sloupce 262,9 px nevešla.

**Povolený rozsah je 3–8 a ořezává ho server** (`clampPlayerCount` v
`server/handlers.lobby.js`) – `create_room` ho dřív nevalidoval vůbec, takže
socketem šlo vyrobit místnost pro 99 lidí, kde `rolesForPlayerCount` vrátí prázdné pole.

