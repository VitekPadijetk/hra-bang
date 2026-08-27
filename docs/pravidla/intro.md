# Intro cinematika

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

## Intro: co drží pozice a co je jen animace

Intro **si umístěné karty pamatuje jako hotové souřadnice** (`_introState.placedCards`),
zatímco hra pozice počítá při každém překreslení z profilu rozložení. Dvě věci z toho
plynou a obě se musí držet:

- **Každá položka `placedCards` nese `rl` = jak se její pozice počítá** (`oppLives`,
  `oppChar`, `oppName`, `oppStar`, `oppRole`, `myRole`, `myLives`, `myChar`, `myName`,
  `colt`, `hand`). Změna velikosti okna / fullscreen zavolá `_introRelayoutPlaced()`
  ([view/intro.js](view/intro.js), volá ji resize handler v [game.js](game.js)), který
  je podle toho přepočítá. **Nová `placedCards.push` bez `rl` = karta, která po změně
  velikosti zůstane ležet na starém místě.**
- **Pozice musí sedět s herním renderem na pixel**, jinak přechod do hry blikne. Sdílí
  se proto výpočty, ne konstanty: jmenovka soupeře se počítá z rozměru karty (při 8
  hráčích je měřítko 0,25, ne 0,27 – konstanty 38,25/85,5 platily jen pro 0,27), moje
  jmenovka z `MY_ROLE_X()`/`myNameOffY`, Colt z `_introColtPos()`, hromádky přes
  `_introStackTopY` (vrch se počítá ze SKUTEČNÉHO počtu jako `drawDrawPiles`, jen
  vrstev se kreslí nejvýš 80).

Další dvě místa, kde přechod do hry dřív „naskočil":

- **Colt .45** se fade-inem objevuje jen při skutečné výměně zbraň → Colt. `App.coltVisible`
  má proto tři stavy a `null` (nastaví `resetBoardSlides`) znamená „deska se kreslí poprvé" –
  z intra tam Colt už leží, takže se nefaduje.
- **Rozsvícení hráče na tahu** (`applyTurnTint` ve [view/board.js](view/board.js)) se
  plynule nafaduje z neobarvené karty. Fade je vázaný na ČAS změny tahu
  (`App.turnTintStart`), ne na sprite – renderUI karty vytváří znovu při každém
  překreslení, takže by tween jinak pokaždé začínal od nuly.

Sprity zaparkované na konci intra (balíčky, které dojely na svou herní pozici) se po
`'done'` **neuklízí hned**: deska se vykreslí až s `room_update`, které jde frontou
animací. Úklid je odložený (`App.introDoneToken` ho zruší, kdyby mezitím začalo nové intro).

## Intro: rozdávání rolí a postav

- **Balíček postav je CELÝ pool** (základ 16, s Dodge City 31) – zamíchá se celý,
  rozdají se z něj dvě karty na hráče a **nerozdaný zbytek odletí jako celek ze stolu**
  (`_introFlyAwayCharDeck`). Odlétá **hned po rozdání poslední dvojice** (větev
  `char_cards_fly` s `step === order.length − 1`), ne až si všichni vyberou – na
  `chars_slide_in` zůstává jen pojistka pro případ, že se ten beat ztratil. Speciální
  případ: **8 hráčů bez rozšíření** – 16 postav, 8×2 rozdáno, balíček dojde a neodlétá
  nic. Počet posílá server (`charPoolCount` v [server/intro.js](server/intro.js),
  `startGame` v [server/lifecycle.js](server/lifecycle.js)).
- **Obě moje karty postav přiletí ve stejném rytmu jako soupeřům** – nejdřív levá,
  po `INTRO_CHAR_DEAL_GAP` pravá (dřív se mi objevily naráz). Každá se **ukáže hned, jak
  doletí ta její** (`_introState.charRevealed[idx]`, kreslí `_renderIntroCharSelect`);
  dřív gate `charChoicesRevealed` čekal na obě, takže levá po dokončení překlopení
  zmizela a naskočila znovu až s pravou. **Klikací** jsou obě až po obou – výběr se
  nesmí potvrdit dřív, než je vidět celá nabídka.
- **Cizí karta role letí k sedačce a pokračuje ZA okraj jeviště** (`_introDealRoleAway`),
  cestou se natočí do orientace toho hráče – roli si bere do ruky, nikdo ji nesmí vidět
  ležet. Ve hře pro 3 (role lícem nahoru) platí dál `_introPlacePublicRole`.
- **Balíček High Noon leží v intru se stejnou roztečí jako ostatní tři**
  (`INTRO_PLAY_DECK.x + 160`). Že je jeho herní pozice (`HN_PILE_X`) blíž se dorovná
  tím, že jeho závěrečný přesun je kratší, ne jinou roztečí na stole.

## Intro navazující hry

Navazující hra **má stejné intro jako první hra**, jen s předehrou pro přeživší.
Server (`server/intro.js`) → klient (`net/handlers.js` `intro_phase` → `view/intro.js`):

1. `init` (`nextGame: true`, `survivors: [{idx,char,health}]`, reálné `roleCount/charCount/deckCount`) –
   deska se rozloží: tři balíčky + postavy přeživších s tolika životy, kolik jim zbylo
   (balíček postav je o jejich karty menší). **Hvězda šerifa ještě ne** – role se rozdají později.
2. `nextgame_keep` (po 1 s) – MOJE postava vyletí zvětšená doprostřed + tlačítka ANO/NE.
3. `keep_result {playerIdx, keep}` po každém rozhodnutí – ANO: karta se usadí na svůj
   **základní** max (šerifův +1 je pořád tajný); NE: překlopí se, odletí zmenšená na balíček
   postav (`charCount++`) a karta životů zmizí fade-outem. Vlastní rozhodnutí se animuje
   hned z kliknutí, cizí z tohoto eventu.
4. Až se rozhodnou všichni → klasické `runIntroSequence` (role) beze změny.
5. `sheriff_reveal {playerIdx}` – jen když je šerifem **keeper**: +1 život (posun karty,
   280 ms jako herní posun životů) a fade-in hvězdy. `room._introKeepers` (snapshot z bodu 3)
   je jediné kritérium – „má postavu" nestačí, boti si ji vybírají hned po startu.
6. `introStartCharPhase` rozdá postavy jen hráčům mimo `_introKeepers`, dál už klasicky
   (výběr ze 2, `chars_slide_in` keepery přeskočí, míchání balíčku, rozdání karet, `done`).

Stav klienta drží `_introState.placedCards`; položky mají `key` (`char:3`, `lives:3`,
`name:3`, `star:3`), aby je šlo za běhu posunout/schovat/odstranit.

