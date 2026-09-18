# Obrazovky

Kompletní texty jsou v návrhu `Bang Menu.dc.html` — tady je struktura, stavy a chování.

---

## S0 — Načítání

Logo BANG! (Rye), pod ním pruh průběhu (výška 10px, rádius 6px, rám `--line2`, výplň
`linear-gradient(90deg, --gold, --goldHi)`), pod pruhem popisek vlevo a procenta vpravo.

- Text: „Načítám karty a postavy…" + „62 %"
- Bez tlačítek, bez hlavičky

---

## S1 — Otoč telefon

Zobrazí se nad vším ostatním, když je okno na výšku. Přetmavení `--scrim`.

Ikona 📱 s animací otočení (`@keyframes rot` — 0° → −90°, 2.4s), pod ní „Otoč telefon na šířku"
(Rye 24px) a vysvětlení: „Bang! se hraje na šířku — na výšku je všechno malé a karty se nevejdou."

Dole nenápadné „Hrát i tak". Návrh záměrně nechává cestu dál — zablokovat hráče úplně je horší
než ho nechat hrát v neideálním režimu.

---

## S2 — Volba rozložení

Dvě velké karty vedle sebe, na úzkém jevišti pod sebou.

| | Mobilní rozložení | PC rozložení |
|---|---|---|
| Ikona | 📱 | 🖥 |
| Popis | Větší karty, soupeři v jedné řadě nahoře, ruka přes celou šířku. Pro telefon a tablet. | Soupeři v kruhu kolem stolu, menší karty. Pro počítač a velké displeje. |

Ta karta, která odpovídá šířce okna, nese zelenou značku „✓ doporučeno pro tvé zařízení".
Vybraná má rám `--gold` a pozadí `--noticeBg`.

Volba se ukládá (`bangLayout`) a při dalším spuštění se obrazovka přeskočí. Přepnout jde
kdykoli čipem v hlavním menu.

---

## S3 — Hlavní menu

Vystředěné svisle. Tři bloky: logo, čtyři akce, řádek čipů.

**Logo:** „BANG!" (Rye, `clamp(34px,6vw,76px)`, `--gold`, vrhá stín `--logoShadow`), pod ním
motto kurzívou: „Poslední, kdo stojí, bere vše."

**Čtyři akce** v mřížce 2×2 (na úzkém pod sebou). Každá: ikona v barevném čtverci 42px, název,
popisek s živým počtem.

| Akce | Popisek |
|---|---|
| 🎮 Připojit se ke hře | „4 her čeká na hráče" (živý počet) |
| ✚ Vytvořit novou hru | „3 až 8 hráčů, 5 rozšíření" |
| 👁 Sledovat probíhající hru | „1 hra právě běží" (živý počet) |
| 🤖 Sledovat hru botů | „Hra bez lidí, rozjede se hned" |

Popisky s počtem jsou důležité: hráč vidí, jestli má cenu klikat na „Připojit se", než to udělá.
Když je 0, napiš „Žádné hry nečekají na hráče" — a klik vede na prázdný seznam s nabídkou
vytvořit hru.

**Čipy** dole: jméno s avatarem a „✎" (otevře S4), rozložení, motiv, Debug.

---

## S4 — Jméno (okno)

Otevírá se z čipu v S3 nebo automaticky, když jméno chybí.

- Nadpis „Tvoje jméno" (Rye), vysvětlení „Vidí ho ostatní u stolu. Nejvýš 18 znaků."
- Pole, tvrdý limit 18 znaků (`slice(0,18)`, ne validace při odeslání)
- Chyby: „Jméno nesmí být prázdné." / „Jméno »Calamity« je již obsazeno."
- Místo pro chybu je rezervované, okno nepodskakuje
- „✕" vpravo nahoře zavře bez uložení; „OK" uloží

Uložení jména přepíše i výchozí název hry na „Hra hráče <jméno>".

---

## S5 — Vytvořit hru

Rolující prostředek + neposuvná lišta akcí. **Tohle je obrazovka, která dnes nefunguje** —
tlačítka rozšíření se nevejdou. Nové řešení:

**1. Název hry + hráč** — pole na plnou šířku, vedle přerušovaný rámeček „Hráč: Honza"

**2. Počet hráčů** — šest tlačítek v řadě (3–8), vždy šest i na mobilu. Nepovinné dokud nevybere,
pak vpravo od popisku svítí „povinné" v `--bad`.

Pod tlačítky **poznámka, která se mění podle volby**:
- 3 hráči: „Město duchů: bez šerifa, role lícem nahoru, každý loví určeného soupeře."
- 8 hráčů: „Šerif, 2× Pomocník, 3× Bandita, 2× Odpadlík — jediný počet se dvěma odpadlíky."
- jinak: „Hra startuje až s plným stolem. Prázdná místa doplníš boty v lobby."

**3. Rozšíření** — pět zaškrtávacích karet, každá s názvem a jednou větou nápovědy. Mřížka
`auto-fit minmax(min(100%, 265px), 1fr)`: na 1280px tři v řadě, na 740px jedna. Celá sekce roluje.

| Rozšíření | Nápověda |
|---|---|
| Dodge City | +40 karet a +15 postav; karty se symbolem býka |
| High Noon | 13 karet událostí; šerif odkrývá jednu na začátku kola |
| Fistful | 15 karet událostí a 3 postavy; hraje se i vedle High Noonu |
| Divoký západ | 10 karet událostí a 8 postav; otáčí je Dostavník a Wells Fargo |
| Zlatá horečka | Zlaté valouny za zranění a obchod s 24 kartami vybavení |

**4. Pokročilé možnosti** — sbalené, v hlavičce souhrn („· vše výchozí" / „· 2 zapnuté").
Uvnitř řádky se zaškrtávátkem:

| Volba | Nápověda |
|---|---|
| Zakázat pokročilé karty | Bez Duelu, Hokynářství, Indiánů, Vězení a Dynamitu |
| Přiřadit postavu náhodně | Hráči si nevybírají ze dvou postav |
| Rotující šerif | Šerif se po každé hře posouvá doleva |
| High Noon: přibalené karty | + Nová identita a Želízka z Fistfulu |

Poslední volba se zobrazuje **jen když** je zapnutý High Noon a vypnutý Fistful — jinak nemá smysl.

**Lišta akcí:** vlevo souhrn („5 hráčů · Dodge City · High Noon" nebo „Vyber počet hráčů a zadej
název."), vpravo „VYTVOŘIT HRU". Tlačítko je zamčené, dokud není vybraný počet a neprázdný název.

---

## S6 — Připojit se (seznam)

Rolující seznam řádků místností (viz `components.md`). Podtitulek v hlavičce: „4 her čeká na
hráče · seznam se obnovuje sám".

**Prázdný stav:** „Prázdno" (Rye, poloprůhledně), pod ním „Žádné hry nečekají na hráče."
a primární tlačítko „Vytvořit vlastní hru". Slepá ulička se mění na rozcestí.

Plné stoly v seznamu zůstávají (šedě, tlačítko „PLNÁ" zamčené) — hráč vidí, že hra existuje,
a může si počkat.

---

## S7 — Detail hry

Hlavička: název místnosti, podtitulek „5 / 8 hráčů · zakládá Calamity".
Obsah: řádky sedaček, prázdná místa jako „Čeká se…".
Lišta akcí: primární „PŘIPOJIT SE (jako Honza)" — jméno je v tlačítku, aby hráč viděl,
pod jakým jménem vstupuje.

Zpět vede na S6, ne do menu.

---

## S8 — Lobby místnosti

Hlavička: název hry, podtitulek s počtem a **výčtem rozšíření** („4 / 5 hráčů · Dodge City ·
High Noon" nebo „· základní hra"). Tohle dnes chybí — hráč, který se připojil, nevidí,
do čeho jde.

**Poznámka nahoře**, když stůl není plný: „⏳ Hra začne, až bude stůl plný — chybí 1 hráč(ů).
Můžeš je doplnit boty."

Řádky sedaček; prázdná místa jsou pro Game Leadera klikatelná („➕ Bot").

**Lišta akcí podle role:**
- Game Leader: „▶ ZAHÁJIT HRU" (zamčené dokud není plno, s důvodem v textu) + „✕ ZRUŠIT HRU"
- ostatní: přerušovaný rámeček „Čeká se na Game Leadera…"

Tlačítko zpět je v této obrazovce varovné („◀ Opustit hru").

---

## S9 — Lobby další hry

Jako S8, s rozdíly:
- Nadpis „Další hra: <název>"
- Poznámka: „Přeživší si v další hře mohou nechat svou postavu."
- U hráčů, kteří potvrdili, přívlastek „chce dál ✅"

---

## S10 — Sledovat hru

Seznam jako S6, ale jen běžící hry. Řádek: „hraje Calamity", stav „● PROBÍHÁ" (`--running`),
akce „DÍVAT SE" (sekundární, ne primární — sledování není hlavní cesta).

Prázdný stav: „Žádná hra právě neprobíhá."

---

## S11 — Hra botů

Úvodní věta: „Spustí hru složenou jen z počítačových hráčů, kterou budeš sledovat. Jméno se
nevyžaduje a hra se rozjede hned, bez rozdávání rolí."

Pak počet botů (3–8, stejná řada jako v S5) a rozšíření (stejné karty). Když je zapnutý
High Noon bez Fistfulu, přidá se řádek „Přibalené karty".

Lišta akcí: souhrn „4 botů · Dodge City" + primární „▶ SPUSTIT A SLEDOVAT".

---

## S12 — Konec hry

Vystředěné. „KONEC HRY" (proložené, `--muted`), pod ním výsledek v Rye `clamp(30px,5.4vw,60px)`:
„Zákon vyhrál!" / „Bandité vyhráli!" / „Odpadlík vyhrál!"

**Tři akce:** „📊 Statistiky" (sekundární), „▶ Chci další hru" (primární), „✕ Do menu" (nenápadné).

**Klik na „Chci další hru" tě rovnou přihlásí** a přepne na S13 — žádné druhé potvrzení.
Tohle je změna proti dnešnímu stavu, kde hráč potvrzoval dvakrát.

Pod tlačítky **řada čipů s avatary** — jeden na hráče: iniciály, jméno, značka ✅ / … / ✕.
Kdo hraje dál, má zlatý avatar a rám `--gold`; kdo odešel, má jméno v `--dim`. Pod řadou
souhrn: „3 hráčů je v další hře · 1 se rozhoduje", nebo „Na další hru jsou potřeba alespoň 3 hráči".

---

## S13 — Další hra (účast)

Nahradilo hlasování. Nikde se nepotvrzuje dvakrát.

**Hlavička obsahu:** vlevo nadpis „Další hra může začít" / „Chybí hráči do další hry" a pod ním
„1 hráč(ů) se ještě rozhoduje · kdo neodpoví, do hry nejde". Vpravo velké `3 / 4`.

**Segmentovaný pruh** — jeden segment na hráče, zaplněné zlatě. Na první pohled je vidět,
kolik lidí chybí, bez čtení.

**Řádky hráčů:** avatar s iniciálami, jméno, přívlastek, odznak **HRAJE / ČEKÁ SE / ODEŠEL**.
Levý okraj 4px v barvě stavu.

**Spodní část podle mého stavu:**
- už jsem přihlášený → zelený pruh „✅ Jsi v další hře. Čeká se na 1 hráč(ů)." s nenápadným
  „Odhlásit se". Žádné potvrzovací tlačítko.
- ještě jsem neklikl → primární „✅ CHCI HRÁT DÁL"

**Game Leader** má navíc „▶ ZAHÁJIT DALŠÍ HRU (3 hráčů)", zamčené dokud nejsou tři:
„▶ ZAHÁJIT DALŠÍ HRU (chybí 1)". Vede na S9.

Dole nenápadné „Opustit hru".

---

## S14 — Statistiky (přes celou obrazovku)

Otevírá se z S12, zavírá „✕ Zavřít".

Hlavička: „Statistiky hry" (Rye) + souhrnná řádka: „Bang!×34 · Zásahy×21 (62 %) · Damage×19 ·
Líznuto×88 · Odhoz×61".

Tělo: **hráči seskupení podle rolí**, ne jeden dlouhý seznam. Každá skupina má nadpis s barevnou
tečkou (`--roleSheriff` / `--roleOutlaw` / `--roleRenegade`) a souhrn: „Šerif + Pomocníci ·
2 hráči · vyhráli".

Tabulka: Hráč · Postava · Bang! · Trefil · Udělil · Utrpěl · Líznul · Zahrál · Odhodil · Top karty.
Pod 900px roluje vodorovně (`min-width: 900px` na obsahu), ne se needitelně sype.

---

## S15 — Vyhozen

Logo, pak červený rámeček: „Game Leader ukončil hru." + „Stůl se rozpustil. Můžeš se přidat
k jiné hře nebo založit vlastní."

Dvě akce: „◀ Zpět do menu" (sekundární) a „Najít jinou hru" (primární, vede na S6).
Primární je ta druhá — hráč chtěl hrát, tak mu nabídni hraní, ne menu.

---

## S16 — Debug

Jen pro vývoj. Podtitulek: „Jen pro vývoj — do produkce se neukazuje."

**Karty stavu:** Socket (`--ok` když připojen) · Ping · Místností na serveru · Verze klienta

**Simulovat stav** — tlačítka, která vyvolají jednotlivé stavy: chybová hláška, odpojení,
banner nové verze, vyhození ze hry, hlasování o další hře, zapomenout jméno.

**Poslední zprávy ze serveru** — monospace log: čas · směr (`← recv` v `--ok`, `→ send`
v `--gold`, `···` v `--dim`) · zpráva. Šest posledních.

---

## G1 — Banner nové verze

Ukotvený nahoře přes celou šířku, zlatý (`linear-gradient(--goldHi, --gold)`), text `--onGold`.
„Vyšla nová verze hry — načti stránku znovu." + tlačítko „Načíst znovu" + „✕".

Zlatý, ne červený — je to informace, ne chyba.

---

## G2 — Ztracené spojení

Okno nad vším (`z-index` nejvyšší), přetmavení `--scrim`. Nedá se zavřít klikem mimo.

Tři pulzující tečky (`@keyframes pulse`, posun 0.2s mezi nimi), pod nimi „Ztraceno spojení"
(Rye 19px) a „Zkouším se připojit znovu. Tvoje místo u stolu zůstává zabrané — nikam nespěchej."

Pod tím stav pokusu: „3. pokus · další za 4 s". A tlačítko „Načíst stránku znovu".

Ta věta o místě u stolu je podstatná — hráč, kterému spadne spojení, si myslí, že o hru přišel.

---

## G3 — Chybová hláška

Toast dole na středu, viz `components.md`. Dvouřádkový: co se stalo + co s tím.
Příklad: „Do hry se nepodařilo připojit" / „Stůl se mezitím zaplnil. Vyber si ze seznamu jinou hru."
