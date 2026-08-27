# Redakce stavu a bandwidth (assety, komprese)

> Vytaženo z `CLAUDE.md`, aby se to nenačítalo do každé session. Konvence, mapa souborů a pravidlo „nejdřív doběhne efekt zahrané karty" zůstávají tam.

## Redakce stavu: klient dostane jen to, co má vidět

`GameState` nemá `toJSON`, takže se do `room_update` serializuje **celý**. Dřív to
znamenalo, že si každý hráč mohl v konzoli přečíst role všech, jejich ruce i pořadí
balíčku — klient to jen nekreslil. Ořezává to **`redactState(gs, viewerIdx, revealAll)`**
v `server/rooms.js`, kterým prochází každý `roomPayload`.

- **Skryje se**: role ostatních, jejich ruce (nahradí je `{ id: null, _placeholder: true }`,
  takže **délka ruky zůstává** — jen podle ní se kreslí vějíř rubů), pořadí balíčku
  (`deck.cards` → stejný počet zástupných karet), pořadí OBOU balíčků událostí
  (`eventDeck`/`ffDeck`), odložené identity (`_secondChar`), **vynucená karta Práva
  západu** (`_lawCardId` — ukázala se veřejně cinematikou `law_reveal` a pak leží v ruce
  rubem nahoru jako každá jiná) a **odkrytá řada Clause the Saint** (`clausState` vidí
  jen on; ostatním z ní zbývá počet karet a `picked`).
- **Veřejné zůstává**: šerifova role (zná ji celý stůl), role vyřazených (odhalí se při
  smrti — duch má `health 0`, takže spadne pod stejnou podmínku, a **vrácený Mrtvý muž**
  přes `_roleRevealed`, protože ten už žije), **všechny role ve hře pro 3** (`gs.mode3p` —
  leží lícem nahoru), odhoz, vyložené karty, zbraně, životy, postavy, **odkryté karty
  událostí** (`eventPile`/`ffPile`) a `charChoices` (podle jejich počtu pozná
  `pendingActor` fázi výběru postav i na klientovi).
- **Redakce Opuštěného dolu sedí sama od sebe**: `deck.cards` (kam se pod ním odhazuje
  lícem dolů) jsou skryté, `discardPile` (odkud se líže) veřejný. Že všichni vidí dopředu,
  co si kdo lízne — včetně kontrolní karty — **je pointa karty, ne chyba**.
- **Neredaguje se vůbec**: debug hra (jeden socket ovládá všechna místa), stav po konci
  hry (`gs.winner` — výherní obrazovka i statistiky role ukazují) a divák u hry jen botů.
- **Divák běžné hry vidí jen veřejné informace.** Bez toho by stačilo otevřít si hru ve
  druhé záložce jako divák a číst spoluhráčům karty.
- **Boti redakcí neprocházejí** — `server/bots.js` čte `room.gameState` napřímo.

Dvě místa, kde na to musí kód myslet:

- **Role při vyřazení chodí v datech animace** (`role` v `player_death_discard` /
  `vulture_sam_steal` / `player_death_reveal`), ne ze stavu. Stav se na klientu aplikuje
  až ZA celou cinematikou (fronta animací), takže v okamžiku odhalení je pro klienta
  vyřazený hráč pořád živý a jeho roli by redakce ještě schovávala. Klient si ji proto
  ve fázi `'settled'` **zapíše do svého stavu** (`playDeathSequence`/`playDeathRoleReveal`
  v net/handlers.js) – jinak by karta role po dosednutí na slot chvíli (než dorazí stav)
  kreslila fallback `deadRoleMap[...] || …`, tedy banditu, ať měl mrtvý roli jakoukoli.
  Fallback je z téhož důvodu **rub** (`role_card_back`), ne konkrétní role.
- **Karta odlétající z ruky soupeře se nedá najít podle `id`.** `_liftCardFromHand`
  (net/handlers.js) proto u zakryté ruky odebere poslední slot — ve vějíři rubů na tom
  nezáleží a bez toho by ruka zůstala do příchodu stavu o kartu širší a pak cuknula.

Pokryto testy v `test/server.rooms.test.js` (sekce „Redakce stavu").

## Bandwidth: assety jsou WebP, ne PNG

Hosting jednou spadl na vyčerpanou bandwidth — jedna partie pěti lidí stála ~0,5 GB.
Art karet je sken malované karty **včetně vysázeného pravidlového textu**; jako PNG
650×1000 vážil ~1,3 MB (skoro 2 bajty na pixel, prakticky bez komprese) a celá sada
95,8 MB. Jedno načtení hry z toho stáhlo 42 MB (základ) až 97 MB (obě rozšíření) — a
protože se to nevešlo do cache mobilního prohlížeče, tahal si telefon všechno znovu
každou session.

- **V `assets/` jsou `.webp`, žádné `.png`.** Cesty staví výhradně `preload()` a
  `EXPANSION_LOADERS` v `game.js` (jinde se URL assetu nesestavuje). Sada má 6,3 MB,
  jedno načtení 3,0 MB / 7,1 MB s oběma rozšířeními.
- **Převod dělá `tools/webp.js`** (`--measure`, `--quality=N`, `--replace`). `sharp`
  není závislost hry, instaluje se jen na převod přes `npm install sharp --no-save`.
  Zdrojové PNG zůstávají v historii gitu, takže jde kdykoli převést na jinou kvalitu.
- **Nasazeno je q70.** Naměřeno na 122 souborech: q70 6,3 MB / q80 8,3 MB / q90 13,3 MB.
- **Marky hodnoty/barvy jdou bezeztrátově** — jsou to ostré glyfy, které se při snímání
  zvětšují (`pulseCheckMark`), takže by na nich byly artefakty vidět. Celá složka má
  i tak jen 216 kB. Řeší to `isLossless()` v `tools/webp.js`.
- **Alfa je všude reálně využitá** (zaoblené rohy karet). WebP ji nese a u lossy ukládá
  bezeztrátově, takže rohy zůstávají ostré — nový art proto smí mít průhlednost.
- **Nový art přidávej rovnou jako `.webp`.** Přibude-li PNG, stačí znovu spustit skript.

Server k tomu v `server.js`:

- `perMessageDeflate` na Socket.IO. `room_update` (~25 kB, z toho 10 kB zbytek balíčku)
  chodí všem hráčům při každém broadcastu, za partii ~270× — zabalený má ~2,6 kB.
  Socket.IO ho má od v3 vypnutý, takže se to musí zapnout ručně.
- `compression()` na HTTP (klientský JS je 38 souborů / 807 kB → 242 kB).
- `Cache-Control` v `express.static`: assety `max-age=86400`, kód zůstává na
  `max-age=0` + ETag (nasazená verze musí být vidět hned). Delší platnost assetů by
  chtěla verzi v URL, kterou tu bez build stepu nemáme.
- **Na localhostu (a na LAN IP) se assety NEcachují** (`no-cache` + ETag, `isLocalHost`
  v `server.js`): jinak se nově převedený art neprojeví ani po F5 a člověk ladí grafiku,
  kterou prohlížeč vůbec nestáhl. Pozná se to podle hostname požadavku, ne podle env
  proměnné – nasazený server chodí na doméně, takže se nekonfiguruje nic.

