# Co je nově jinak

Seřazeno podle toho, kolik práce to znamená mimo UI.

## Jen UI — server se nemění

**Menu z Phaseru do HTML vrstvy.** Všechny obrazovky mimo herní stůl jsou DOM nad canvasem.
Canvas zůstává na hru. Skryj vrstvu, když hra běží.

**Zakládání hry se vejde na obrazovku.** Rolující prostředek, neposuvná lišta akcí, mřížka
rozšíření se sype do jednoho sloupce. Tohle byl hlavní problém.

**Rozšíření mají nápovědu.** Jedna věta u každého, přímo v kartě. Hráč si nepamatuje, co je
„Fistful".

**Poznámka u počtu hráčů se mění podle volby.** 3 hráči = Město duchů, 8 = dva odpadlíci.

**Pokročilé volby jsou sbalené**, v hlavičce souhrn. „High Noon: přibalené karty" se zobrazuje
jen když má smysl.

**Seznam her ukazuje, co hráč potřebuje:** tečky sedaček, počet, stav, kdo zakládá, jestli je
to navazující hra. Plné stoly zůstávají viditelné.

**Prázdné seznamy nabízejí cestu dál** místo prázdné obrazovky.

**Lobby ukazuje nastavení místnosti** — počet i výčet rozšíření v podtitulku.

**Zamčená tlačítka říkají důvod.** „ZAHÁJIT HRU (stůl není plný)" místo šedého tlačítka.

**Tlačítko zpět má dvě podoby** — neutrální, a varovné když odchod ruší tvoje místo v lobby.

**Statistiky jsou seskupené podle rolí** a pod 900px rolují vodorovně.

**Dva motivy z jedné sady proměnných.** Žádná barva v komponentách.

**Nic není fixní šířky.** Testováno na 1280×720 a 740×360.

## Potřebuje drobnost na klientu

**Paměť voleb v `localStorage`:** `bangTheme`, `bangName`, `bangLayout`.
Jméno po F5 nezmizí, S2 se přeskočí, když je rozložení vybrané.

**Tvrdý limit jména na 18 znaků** při psaní, ne validace při odeslání.

**Okno se jménem má „✕"** — jde zavřít bez uložení.

**S1 nechává cestu dál** („Hrát i tak") místo tvrdého bloku na výšku.

## Potřebuje práci na serveru

**Jedno přihlášení místo dvou potvrzení.** Dnes hráč potvrdí na konci hry a pak znovu
v hlasování. Nově: klik na „Chci další hru" na S12 **je** přihlášení. Server potřebuje
jednu zprávu (`next:join` / `next:leave`) a stav na hráče (`in` / `wait` / `out`).

**Stav účasti pro všechny.** Každý klient potřebuje vidět, kdo je `in`, kdo `wait`, kdo `out` —
kvůli pruhu a odznakům. Dnes se posílá jen počet.

**Odhlášení z další hry.** Nová akce: kdo se přihlásil, může to vzít zpět (`next:leave`).

**Game Leader zahajuje další hru ručně** při 3+ přihlášených, místo automatu na vypršení času.

**Živé počty v hlavním menu.** „4 her čeká na hráče" / „1 hra právě běží" — menu potřebuje
odběr počtů, ne jen seznam po vstupu na S6.

**Game Leader může odebrat bota** z lobby (`room:removeBot`).

**Indikátor odpojení (G2).** Klient potřebuje znát číslo pokusu a čas do dalšího, aby mohl
napsat „3. pokus · další za 4 s".

**Obecná chybová hláška (G3).** Server posílá chybu ve dvou polích: co se stalo + co s tím.
Jednořádková chyba hráči nepomůže.

## Vědomě neřešeno

- **Chat v lobby** — nevybral jsi ho v prvním kole
- **Vyhodit lidského hráče z lobby** — dtto; dnes jde odebrat jen bot
- **Značka u odpojeného hráče ve hře** — je to herní stůl, jiný scope
- **Změna jména mimo hlavní menu** — dnes jen čipem v S3
