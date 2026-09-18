# Bang! online — handoff: redesign menu a lobby

Tenhle balíček popisuje UI **mimo herní stůl**: hlavní menu, zakládání hry, seznamy, lobby,
konec hry a globální prvky. Návrh je v `Bang Menu.dc.html` v korunním projektu — otevři si ho
v prohlížeči, horní lišta „Náhled" přepíná mezi obrazovkami, motivy a šířkami. Ta lišta je
**jen pro prohlížení návrhu**, do hry nepatří.

## Soubory

| Soubor | Co v něm je |
|---|---|
| `README.md` | tenhle přehled + zásadní rozhodnutí |
| `tokens.md` | barvy, typografie, rozměry — oba motivy |
| `screens.md` | obrazovka po obrazovce: obsah, stavy, akce, texty |
| `components.md` | opakující se prvky (řádek místnosti, řádek sedačky, odznaky, tlačítka) |
| `changes.md` | co je nově jinak proti dnešnímu stavu, včetně dopadů na server |

## Tři rozhodnutí, na kterých návrh stojí

**1. Menu jde z Phaseru do HTML vrstvy nad canvasem.** Tohle je ta hlavní změna. Canvas zůstává
na herní stůl, ale všechny obrazovky mimo hru jsou DOM — `position:fixed` vrstva nad canvasem,
kterou skryješ, když se rozjede hra. Důvod: rolující seznamy, reflow textu, hover, vstupní pole
a přizpůsobení šířce jsou v Phaseru drahé a v HTML zdarma. Přímý důsledek toho, co tě štvalo —
že se na obrazovce zakládání hry nevejdou tlačítka rozšíření a na mobilu to nejde přečíst.

**2. Jeden zdroj barev, dva motivy.** Všechny barvy jsou CSS custom properties na jednom
kořenovém elementu. Přepnutí motivu = přepsat jednu sadu proměnných, nikde v komponentách
není barva zadrátovaná. Viz `tokens.md`.

**3. Nic není fixní šířky.** Každá obrazovka je `flex` kolona: neposuvná hlavička, rolující
prostředek, neposuvná lišta akcí dole. Mřížky používají `repeat(auto-fit, minmax(min(100%, 265px), 1fr))`,
takže se samy skládají do jednoho sloupce. Testováno na 1280×720 i na 740×360 (mobil na šířku).

## Otevřené otázky pro implementaci

- **Paměť motivu a jména.** Návrh je počítá jako `localStorage`: `bangTheme` (`dark` | `light`),
  `bangName`, `bangLayout` (`normal` | `big`). Výchozí motiv tmavý.
- **Obrazovka S2 (volba rozložení)** se dnes ptá při každém spuštění. V návrhu je „doporučeno
  pro tvé zařízení" podle šířky okna — dá se přeskočit, když je volba v `localStorage`.
- **Minimální počet hráčů pro navazující hru** je v návrhu 3. Jestli to server řeší jinak, uprav
  text na S13.
