# Kronika (veřejný herní log ve hře) — implementační plán

**Stav (2026-11-28): návrh, nic se ještě neimplementovalo.**

Cíl: hráč si během hry otevře panel, kde vidí, **kdo na koho střílel, co se zahrálo
a jak to dopadlo**, a může to filtrovat: kdo střílel na hráče X, na koho střílel
hráč Y, kdo hrál konkrétní kartu, jen zranění/smrti apod. K tomu matice
„kdo na koho" pro dedukci rolí.

Panel vypadá a chová se jako **chat** ([chat.js](../chat.js)): vyjíždí zprava,
na mobilu se mění na spodní list.

---

## 0. Z čeho se vychází

| Co už existuje | Kde | Proč to nestačí |
|---|---|---|
| `gs.logEvent(type, data)` (~180 volání), události `bang`/`special`/`damage`/`death`/`check`/`event`/`play`/`draw`… s poli `who`/`target`/`card` | logic.js:924, logic/* | Jde jen do serverového `logs/*.jsonl` (`ctx.glog.rule`). Obsahuje tajné věci (role, líznuté karty, ukradené karty z ruky). Hráče označuje **jménem**, `card` je někdy složený text (`Odražená střela → X`, `${srcType} kartu`). |
| Typ `respond` v `LogEvent` | core/gameLog.js | **Nikde se nevolá** – z logu nejde poznat, jestli střelu zastavil Vedle!, Barel, nebo to byl zásah. |
| `room.behaviorLedger` | server/ledger.js | Jen počítadla dvojic `hostile`/`support`, ne jednotlivé záznamy. |
| Chat: DOM panel `#chat-root` + bublina `#chat-toggle-btn`, `showOrHideChat(inGame)` | chat.js | Vzor UI – zkopíruje se styl i mechanika. |

Sink `gs._onEvent` nastavují tři místa (server/lifecycle.js:76 a :173,
server/handlers.debug.js:48) – všude na `ctx.glog.rule(room, evt)`.

---

## 1. Rozhodnutí

| # | Rozhodnutí | Výchozí volba (lze změnit) |
|---|---|---|
| K1 | Rozsah | **Všechno veřejné**: střelba, hnědé i modré karty, obrana, zranění, léčení, smrti, sejmutí, události, valouny/vybavení, žetony. Filtry to unesou. |
| K2 | Divák | **Vidí kroniku** ve stejné redakci jako hráč. Hra jen botů (`botGame`) jako u stavu – odkryto vše. |
| K3 | Po konci hry | **Odkryje se všechno** (líznuté a ukradené karty) – rozbor partie. Fáze K5, volitelná. |
| K4 | Identita hráče | **Stabilní `pid` = sedadlo při startu hry**, ne aktuální sedadlo ani jméno (jména nejsou zaručeně unikátní, Lady Růže prohazuje sedadla). Mapu `seat → pid` drží kronika a přemapuje ji `swapRoomSeats`. |
| K5 | Kde kronika žije | **`room.chronicle`, mimo `gameState`** (jako ledger). `redactState` se jí netýká, nové pole ve stavu nevzniká. |
| K6 | Přenos | **Přírůstek v `room_update`** (`chronicleDelta`), ne zvláštní socket událost. `room_update` jde na klientu frontou animací, takže záznam se objeví **až po dojetí animace** – kronika nepředběhne, co hráč ještě nevidí. |
| K7 | UI | **Samostatný panel zprava jako chat**, vlastní bublina 📜 nad bublinou chatu. Kronika a chat se **vzájemně vylučují** (otevření jednoho zavře druhý) – oba zabírají stejný pravý okraj. |
| K8 | Odznak | Bublina 📜 **nepočítá nepřečtené** (pořád by svítila), jen **červená tečka, když na MĚ někdo vystřelil / zahrál útočnou kartu**, dokud kroniku neotevřu. |
| K9 | Strop | 1500 záznamů na hru (8 hráčů s rozšířeními dělá řádově stovky). Klient drží všechny – filtr musí vidět celou hru. |

---

## 2. Data — `core/chronicle.js` (čisté, izomorfní, testované)

### 2.1 Záznam

```js
{
  seq: 42,            // pořadí v rámci hry, rostoucí
  turn: 7,            // gs.turnId
  round: 2,           // kolo (počítá se při průchodu šerifem)
  owner: 3,           // pid hráče na tahu (seskupení „Kolo 2 · tah Anny")
  kind: 'shot',       // viz 2.2
  actor: 3,           // pid, nebo null (událost, dynamit)
  target: 1,          // pid, nebo null
  card: 'BANG!',      // čisté jméno karty / schopnosti, nebo null
  via: 'Gatling',     // volitelné: nadřazený zdroj (Kulomet → jednotlivé výstřely)
  outcome: 'vedle',   // volitelné: viz 2.3
  shotId: 17,         // volitelné: spojuje výstřel s obranou a zraněním
  note: '…'           // volitelné: krátký veřejný text pro to, co nemá vlastní pole
}
```

### 2.2 Druhy (`kind`)

`turn` (začátek tahu – jen oddělovač) · `shot` (BANG! a vše, co je výstřel: Kulomet,
Indiáni jako útok, Duel, Odražená střela, Mexicali Kid, Julie Cutter…) · `play` (hnědá/modrá
karta bez výstřelu) · `steal` (Panika, Cat Balou, Ragtime, schopnosti) · `defend`
(Vedle!, Barel, Úhyb, Bedna…) · `damage` · `heal` · `death` · `check` (sejmutí) ·
`event` (High Noon / Fistful / Divoký západ) · `econ` (valouny, vybavení, žetony) ·
`ability` (schopnost postavy bez cíle).

Filtrové čipy v UI sdružují druhy: **Střelba** = shot+defend · **Karty** = play+steal ·
**Zranění** = damage+heal · **Smrti** = death · **Ostatní** = check+event+econ+ability.

### 2.3 Výsledek výstřelu

Výstřel dostane `shotId`. Navazující `defend`/`damage` s tím samým `shotId`
**doplní `outcome` do záznamu výstřelu** (záznam se na serveru mutuje, než odejde
v přírůstku; když už odešel, pošle se jako `patch` – viz 3.2). V UI je pak jeden řádek:

> Anna → Bob · **BANG!** · ✗ Vedle!
> Anna → Bob · **BANG!** · 💥 zásah (4→3)

Hodnoty: `vedle` · `barel` · `uhyb` · `zasah` · `zruseno` (výstřel zrušen – trychtýř
`_adShotCanceled`) · `unik` (okno úniku Údolí stínů).

### 2.4 Funkce

- `toPublicEntry(evt, pidOf)` → záznam, nebo `null`. **Whitelist**: zná typ události →
  vybere jen veřejná pole. Neznámý typ = `null` (nic neuteče omylem).
- `filterChronicle(entries, { actor, target, card, kinds, involves })` – `involves`
  = hráč je actor NEBO target (rychlý filtr „všechno kolem Boba").
- `shotMatrix(entries, { kinds })` → `{ [actor]: { [target]: { shots, hits } } }`.
- `cardsSeen(entries)` → seřazený seznam karet, které v kronice padly (nabídka filtru).
- `formatEntry(entry, names)` → `{ icon, text, outcomeText, tone }` pro UI (čistě,
  ať je to testovatelné bez DOM).

### 2.5 Redakce (co se do kroniky NEdostane)

| Událost | Ve hře se ukáže |
|---|---|
| Líznutí z balíčku | „Bob si lízl 2 karty" (bez jmen) |
| Krádež z RUKY (Panika, Ragtime, Pedro z ruky, Jesse Jones) | „Anna vzala Bobovi kartu z ruky" |
| Krádež ze STOLU | i se jménem karty (je veřejná) |
| Odhoz, sejmutí, Duel, karty z odhozu | se jménem (veřejné) |
| Role | jen u `death` (odkrytá role) – nikdy jinde |
| Kit Carlson / Lucky Duke / Claus – vrácená nebo nevybraná karta | počet, ne jména |

Pod Sacagaway / Zuřivou Doroty se **kronika neodkrývá** – výjimky z redakce platí pro
stav, ne pro historii (po skončení karty by jinak odkryté zůstalo navždy).

Strukturální test: každý `type` volaný přes `logEvent` musí být v tabulce
`CHRONICLE_TYPES` (buď s mapováním, nebo výslovně `null` = jen do serverového logu).
Nový `logEvent` bez rozhodnutí → test spadne.

---

## 3. Server

### 3.1 Sběr — `server/chronicle.js`

Factory `installChronicle(ctx)` (instalace za `gamelog`):

- `openChronicle(room, gs)` – `room.chronicle = { seq: 0, entries: [], seatToPid: [...], sent: 0 }`.
  Volá se tam, kde se nastavuje `_onEvent` (3 místa výš).
- Sink se rozdvojí: `gs._onEvent = (evt) => { ctx.glog.rule(room, evt); ctx.chronicleRecord(room, evt); }`.
  Ideálně jeden helper `ctx.attachRuleSink(room, gs)`, ať se tři místa nerozjedou.
- `chronicleRecord` → `toPublicEntry` → push.
- `swapChronicleSeats(room, i, j)` – volá `swapRoomSeats` (vedle `swapLedgerSeats`).
- `chronicleDelta(room)` → `{ from, entries, patches }` od posledního odeslání.

### 3.2 Přenos

- `roomPayload` přidá `chronicle: { seq, delta: [...], patches: [...] }`. Všem stejné
  (K2), u `botGame` i se skrytými poli.
- **Reconnect / nový divák / `rejoin`**: první payload pro daný socket nese
  `chronicleFull` (celé pole). Server si u socketu pamatuje `lastChronicleSeq`.
- Klient: když `delta.from !== App.chronicle.length` → požádá o celou kroniku
  (`chronicle_sync`) – ochrana proti výpadku.

### 3.3 Doplnění chybějících událostí v pravidlech (`logEvent`)

Pole `wi`/`ti` (sedadla actor/target) a `cardName` (čisté jméno) se doplní k
existujícím voláním, která je nemají – jméno hráče nestačí (K4). Konkrétně:

1. **`respond`** – logic/response.js: každá obrana (Vedle!, Barel, Úhyb, Bedna,
   Jourdonnais, Elena…), včetně „neubránil se". Nese `shotId`.
2. **`shotId`** – zakládá se v `playBang`, `_startDuel`, hromadných útocích, frontě
   výstřelů Údolí stínů, Odražené střele, Julie Cutter, Mexicali Kid. Ideálně jedno
   místo: kde se zakládá `pendingResponse` / kontext výstřelu (`vos`).
3. **`heal`** – Pivo, Saloon, Doc Holyday, Lékárník… (dnes rozházené / chybí).
4. **`damage`** dostane `shotId`, když vznikl z výstřelu (jinak dynamit, Indiáni…).

Tahle část je **nejpracnější** (desítky míst napříč rozšířeními) – proto vlastní fáze
a k ní zátěžový test: v hrách jen botů musí mít každý `shot` výsledný `outcome`.

---

## 4. Klient — `chronicle.js` (vedle `chat.js`)

### 4.1 Vzhled (zkopírovaný z chatu)

```
                                      ┌──────────────────────────────┐
                                      │ 📜 Kronika      [Seznam|Kdo→koho] ✕ │
                                      ├──────────────────────────────┤
                                      │ Kdo [všichni ▾]  Na koho [▾] │
                                      │ Karta [▾]        ✕ zrušit    │
                                      │ (Střelba)(Karty)(Zranění)…   │
                                      ├──────────────────────────────┤
                                      │ ── Kolo 2 · tah Anny ──      │
                                      │ 🔫 Anna → Bob · BANG! ✗ Vedle!│
                                      │ 🔫 Anna → Cyril · BANG! 💥 4→3│
                                      │ 🃏 Anna · Hostinec            │
                                      │ ── Kolo 2 · tah Boba ──      │
                                      │ ✋ Bob vzal Anně kartu z ruky │
                                      │ ☠ Cyril vyřazen (Odpadlík)    │
                                      └──────────────────────────────┘
          (📜)  ← nová bublina, nad (💬)
          (💬)
```

- `#chron-root`: stejné CSS jako `#chat-root` (420 px, `translateX(100%)` →
  `.open`), `z-index` 3000. Na mobilu (`max-width:900px, pointer:coarse`) spodní
  list `60dvh` jako chat.
- `#chron-toggle-btn`: `bottom: 146px` (chat má 80 px + 54 px bublina + mezera);
  na mobilu nad chatovou bublinou o 64+12 px. Tečka `#chron-dot` (K8).
- **Vzájemné vyloučení (K7)**: `toggleChronicle()` zavře chat a naopak. Jeden malý
  společný helper `closeSidePanels(except)` – chat.js se upraví o jeden řádek.
- `showOrHideChat(inGame)` → stejný přepínač i pro kroniku (nebo `showOrHideSidePanels`).
- Řádky: ikona druhu · jména (barva hráče/sedadla jako na desce) · karta tučně ·
  výsledek vpravo (zelená = ubráněno, červená = zásah).
- Řádek, kde jsem actor/target, má jemné zvýraznění (jako `.chat-msg.mine`).

### 4.2 Filtry

- **Kdo** / **Na koho**: `<select>` s hráči (i vyřazenými, se ☠). Klik na jméno
  v řádku = nastaví „Kdo" (Shift/dlouhý stisk = „Na koho").
- **Karta**: `<select>` z `cardsSeen()`.
- **Čipy druhů** (multi-select), výchozí všechny zapnuté; čipy jen zužují.
- „✕ zrušit filtry". Filtr se pamatuje v `localStorage` (try/catch) jen jako pohodlí.
- Pole s klávesami nesmí propadnout do Phaseru – stejný `stopPropagation` jako
  v view/gameMenu.js:154.

### 4.3 Záložka „Kdo → koho"

Tabulka střelec (řádky) × cíl (sloupce), buňka = `výstřely / zásahy`, sytost barvy
podle počtu. Klik na buňku → přepne na Seznam s filtrem Kdo=řádek, Na koho=sloupec.
Přepínač: jen výstřely / všechny útoky (shot+steal+útočné hnědé).
Na mobilu se tabulka posouvá vodorovně uvnitř panelu (ne celá stránka).

### 4.4 Stav a napojení

- `App.chronicle = []`, `App.chronOpen`, `App.chronFilter`, `App.chronDot` (state.js).
- V handleru `room_update` (net/handlers.js – místo, kde se aplikuje stav, tedy už
  ZA frontou animací) zavolat `applyChronicle(payload.chronicle)`.
- Render panelu jen když je otevřený (jinak jen připsat do pole + tečka) – žádná
  zátěž během hry se zavřeným panelem.
- Nová hra (navazující) = `chronicleFull` s prázdným polem → vyčistit.
- `index.html`: `<script src="core/chronicle.js">` (před game.js) a
  `<script src="chronicle.js">` hned za `chat.js`.

---

## 5. Fáze

| Fáze | Obsah | Ověření |
|---|---|---|
| **K1** | `core/chronicle.js`: záznam, `toPublicEntry` + tabulka `CHRONICLE_TYPES` pro existující události, `filterChronicle`, `shotMatrix`, `cardsSeen`, `formatEntry`. | `test/chronicle.test.js`: mapování, redakce (žádné jméno líznuté / z ruky ukradené karty, žádná role mimo `death`), filtry, matice. |
| **K2** | Pravidla: `wi`/`ti`/`cardName`, `shotId`, nové `respond` a `heal`, `damage` se `shotId`. Strukturální test „každý typ `logEvent` je v `CHRONICLE_TYPES`". | Testy pravidel (BANG!→Vedle!, Barel, Kulomet, Duel, Odražená střela, Údolí, Ozbrojení). Zátěž botů: každý `shot` má `outcome`. |
| **K3** | Server: `server/chronicle.js`, rozdvojený sink (`attachRuleSink`), přírůstek v `roomPayload`, `chronicleFull` při rejoin/divákovi, `chronicle_sync`, přemapování v `swapRoomSeats`. | `test/server.chronicle.test.js` s fake io: přírůstky, reconnect, divák, Lady Růže, hra botů. |
| **K4** | Klient: `chronicle.js` panel + bublina, vzájemné vyloučení s chatem, seznam, filtry, tečka. | **Ruční ověření v prohlížeči** (desktop + mobil). |
| **K5** | Záložka „Kdo → koho". | Ruční ověření. |
| **K6** *(volitelně)* | Po konci hry odkrýt skrytá pole (K3): server drží u záznamu `secret` (jména karet), po `winner` je pošle. | Test: před koncem nic, po konci vše. |
| **K7** *(volitelně)* | Ledger botů krmit z kroniky místo `recordBehavior` – jeden zdroj veřejného chování. | Zátěž botů beze změny výsledků dedukce. |

Po K4 přidat řádek do tabulky v CLAUDE.md a podrobnosti do `docs/pravidla/kronika.md`.

---

## 6. Pasti, na které myslet

- **Pořadí vůči animaci** – přírůstek jen v `room_update`, nikdy samostatným emitem
  (jinak „Cyril vyřazen" v kronice dřív, než doletí rána).
- **Sedadla** – nikdy neukládat aktuální sedadlo do záznamu; vždy `pid` (K4).
- **Zuřivá Doroty** půjčuje `currentPlayerIndex` – actor výstřelu je poručený hráč,
  `note` „na rozkaz Doroty". Brát z `wi` předaného voláním, ne z `currentPlayerIndex`.
- **Duch (Údolí stínů) / Město duchů** – hráč s nulou životů může střílet; kronika
  ho nesmí ukazovat jako mrtvého, jen podle `death` záznamů.
- **Hřbitov / Helena Zontero** přerozdávají role → starý `death` záznam ukazuje roli
  v okamžiku smrti; to je v pořádku (historie), ale v nápovědě řádku to říct.
- **Debug hra** – kronika běží taky (užitečné při ladění), nic zvláštního.
- **Výkon** – `toPublicEntry` je levné; render jen při otevřeném panelu; matice se
  počítá líně při přepnutí záložky.
