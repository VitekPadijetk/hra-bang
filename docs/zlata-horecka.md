# Zlatá horečka (Gold Rush) — pravidlový podklad

Rozšíření *BANG! Gold Rush* (Emiliano Sciarra, daVinci Editrice 2011; česky Albi).
Tohle je **podklad pro implementaci**, ne plán — plán leží v
[zlata-horecka-plan.md](zlata-horecka-plan.md).

## Zdroje

| Soubor | Co to je |
|---|---|
| [`zh_rules_cz.pdf`](zh_rules_cz.pdf) | **česká pravidla (Albi, překlad Michal Šmíd)** — textová vrstva čitelná `pdftotext` |
| [`zh_rules_eng.pdf`](zh_rules_eng.pdf) | oficiální anglická pravidla dV Giochi |
| [`zh_faq_eng.pdf`](zh_faq_eng.pdf) | oficiální FAQ v 1.0, Q01–Q15 |
| [`zh_karty_dvgiochi.webp`](zh_karty_dvgiochi.webp) | **sken všech 24 karet + 8 postav + role** z oficiální galerie dV Giochi |

Karty jednotlivě: `https://bang.dvgiochi.com/content/4/cards/04_<it_slug>.png`,
seznam s počty kusů na `https://bang.dvgiochi.com/cardslist.php?id=4&lang=en`.

**Zdroj pravdy pro text karty bude český art**, až dorazí (stejná dohoda jako
u Divokého západu). Do té doby platí italsko-anglický tisk z galerie výš, protože ten je
**vysázený na kartě** — česká pravidla popisují jen dodatky, ne plné texty.

---

## Obsah rozšíření

- **24 karet vybavení** v 15 druzích (viz tabulka),
- **8 karet postav**, všechny se **4 životy**,
- **1 karta role „Stínový odpadlík"** (oboustranná: stínový pomocník / stínový bandita),
- **30 zlatých valounů** (plastové žetony).

Hraje se se základním Bang! a jde **libovolně kombinovat s ostatními rozšířeními**.

---

## Pravidla

### Zlaté valouny

> Vždy, když způsobíte **jinému hráči** ztrátu života **jakýmkoliv způsobem** (zahráním
> karty BANG!, Indiáni!, Duel atd.), vezměte si 1 valoun zlata ze společné zásoby. Pokud
> způsobíte jednou kartou ztrátu života více hráčům, vezměte si zlato **za každé zranění**.
> Své zlaté valouny pokládejte **viditelně před sebe**.

Příklad z pravidel: při hře 5 hráčů Sid zahraje Kulomet, Paul se vyhne, Pedro, Rose a Suzy
ztratí život → Sid si vezme **3 valouny**.

Když valouny v zásobě dojdou, pravidla říkají „použijte vhodnou náhradu" — zásoba tedy
**není omezením**, je to jen komponenta.

### Fáze 2: tři nové možnosti

**1. Nákup jedné nebo více karet vybavení.** Kupuje se z **obchodu** = 3 karty vybavení
ležící lícem vzhůru vedle balíčku vybavení. Cena je vytištěná na kartě (1–5 valounů).

- **Hnědý rám** → efekt se uplatní **okamžitě** a karta jde **na spodek balíčku vybavení
  lícem nahoru**.
- **Černý rám** → karta zůstane **ležet před hráčem** (jako modrá karta).
- Koupená karta se **okamžitě nahradí** novou z balíčku vybavení.

**2. Donucení jiného hráče, aby odhodil kartu vybavení.** Zaplatíš **cenu vybavení + 1
valoun**. Vlastník se **nemůže bránit**. Karta jde na spodek balíčku vybavení lícem nahoru.

**3. Získání zlata za Pivo.** Zahráním karty Pivo z ruky si vezmeš **1 valoun** místo
doplnění života. Takto lze zahrát libovolný počet Piv. **Karty s podobným efektem
(Salón, Whisky, Láhev) takhle zahrát nejde.**

Počet nákupů ani odhození **není nijak omezený**.

### Vybavení — obecná pravidla

- Před sebou smíš mít libovolný počet karet vybavení s černým rámem, ale **ne dvě stejného
  jména** (stejné pravidlo jako u modrých karet).
- **Karty vybavení nemohou být cílem Paniky ani Cat Balou** — a stejně tak ani karet
  z rozšíření s podobným efektem, ani **speciálních schopností postav (pravidla jmenují
  Pata Brennana)**. Jediný způsob, jak vybavení odhodit, je **zaplatit jeho cenu + 1 valoun**.
- Když jsi **vyřazen ze hry**, tvé karty vybavení se odhodí na spodek balíčku vybavení lícem
  vzhůru. **Vulture Sam je nezískává.**
- Jakmile se na vrchu balíčku vybavení objeví karta **lícem vzhůru**, balíček se
  **zamíchá** a vytvoří se nový lícem dolů.

---

## Karty vybavení (24 karet v 15 druzích)

Cena je číslo v pravém dolním rohu karty. Sloupec „CZ" je český název: **tučně** = doložený
z českých pravidel Albi, *kurzívou* = **návrh k ověření z artu** (česká pravidla ten název
neuvádějí, protože ke kartě nemají dodatek).

### Hnědý rám — efekt se uplatní hned při nákupu (13 karet)

| CZ | EN / IT | cena | ks | text karty |
|---|---|---|---|---|
| *PANÁK* | Shot / Bicchierino | 1 | 3 | Hráč dle tvé volby (i ty) si doplní 1 život. |
| **LÁHEV** | Bottle / Bottiglia | 2 | 3 | Může být zahrána jako Panika!, Pivo nebo BANG! |
| **KOMPLIC** | Pardner / Complice | 2 | 3 | Může být zahrán jako Hokynářství, Duel nebo Cat Balou. |
| **RUM** | Rhum / Rum | 3 | 2 | „Otoč!" 4 karty: doplň si 1 život za každou různou barvu. |
| *UNION PACIFIC* | Union Pacific | 4 | 1 | Lízni si 4 karty z balíčku. |
| *ZLATÁ HOREČKA* ⚠ | Gold Rush / Corsa all'Oro | 5 | 1 | Tvůj tah končí. Doplň si všechny životy a zahraj další tah. |

### Černý rám — leží před hráčem (11 karet)

| CZ | EN / IT | cena | ks | text karty |
|---|---|---|---|---|
| **BOTY** | Boots / Stivali | 3 | 1 | Pokaždé, když ztratíš 1 život, lízni si 1 kartu z balíčku. |
| **WANTED!** | Wanted / Ricercato | 2 | 3 | Zahraj na libovolného hráče. Kdo toho hráče vyřadí, lízne si 2 karty a vezme si 1 valoun. |
| *RÝŽOVACÍ PÁNEV* | Gold Pan / Setaccio | 3 | 1 | Zaplať 1 valoun a lízni si 1 kartu z balíčku. Použitelné až 2× za tah. |
| **PODKOVA** | Horseshoe / Ferro di cavallo | 2 | 1 | Pokaždé, když „otáčíš!", odkryj o kartu navíc a vyber výsledek. |
| **TALISMAN** | Lucky Charm / Talismano | 3 | 1 | Pokaždé, když ztratíš 1 život, vezmi si 1 valoun. |
| **BATOH** | Rucksack / Zaino | 3 | 1 | Zaplať 2 valouny a doplň si 1 život. |
| **KALUMET** | Calumet | 3 | 1 | Karty káry zahrané ostatními na tebe nemají efekt. |
| *OPASEK* | Gun Belt / Cinturone | 2 | 1 | Na konci tahu smíš mít v ruce až 8 karet. |
| *KRUMPÁČ* | Pickaxe / Piccone | 4 | 1 | Ve fázi 1 svého tahu si lízni o kartu navíc. |

⚠ **Kolize jmen:** karta vybavení *Gold Rush* by se česky jmenovala **Zlatá horečka** —
tedy stejně jako **celé rozšíření** a zároveň stejně jako **existující karta událostí High
Noonu** (`ZLATA_HORECKA`, id 305, „hra probíhá proti směru hodinových ručiček"). Plán to
řeší v §0/R1.

### Dodatky ke kartám (z pravidel)

- **BOTY, TALISMAN:** neúčinkují při ztrátě **posledního** života. U Talismanu navíc:
  valoun ber **vždy ze společné zásoby**, ne od hráče, který ti ztrátu způsobil.
- **LÁHEV:** i když má stejný efekt, **nepovažuje se** za Paniku, Pivo ani BANG!.
  BANG! zahraný Láhví **se nepočítá do limitu 1 BANG! za tah**.
- **KOMPLIC:** i když má stejný efekt, **nepovažuje se** za Cat Balou, Hokynářství ani Duel.
- **PODKOVA:** všechny otočené karty se poté odhodí.
- **RUM:** příklad z pravidel — otočíš 4 karty a doplníš si tolik životů, kolik padlo
  **různých barev** (příklad v pravidlech dává 3). Všechny otočené karty se poté odhodí.
- **BATOH:** může se použít **i mimo tah vlastníka**, pokud ztrácí **poslední život**.
- **WANTED!:** líznuté 2 karty a 1 valoun se **přičítají** k jiným efektům — vyřadíš-li
  banditu s Wanted!, vezmeš si 2 + 3 = **5 karet** a 1 + 1 = **2 valouny**. Pokud šerif
  vyřadí pomocníka s Wanted!, **nejprve si vezme 2 karty** a teprve pak odhodí celou ruku,
  ale **zlato si ponechá**.

---

## Postavy (8, všechny 4 životy)

| Postava | Text karty | Dodatek z pravidel |
|---|---|---|
| **Don Bell** | Na konci svého tahu „otočí!": padne-li srdce nebo káro, hraje tah navíc. | Na konci tahu **navíc už neotáčí** znovu. |
| **Dutch Will** | Lízne si 2 karty, 1 odhodí a vezme si 1 valoun. | Odhazuje **jednu ze dvou právě líznutých** (dle své volby) ve fázi 1. |
| **Jacky Murieta** | Ve svém tahu smí zaplatit 2 valouny a vystřelit 1 BANG! navíc. | Smí to **vícekrát za tah**, když zaplatí. **Nehraje k tomu žádnou kartu.** |
| **Josh McCloud** | Smí si za 2 valouny líznout **vrchní vybavení z balíčku**. | Jen ve **svém tahu**. Lízne-li černý rám, který už má, **musí ho odhodit**. |
| **Madam Yto** | Pokaždé, když je zahráno Pivo, lízne si 1 kartu z balíčku. | Nezáleží, jestli šlo Pivo na život, nebo na valoun, ani **kdo** ho zahrál (i ona sama). **Neplatí pro Whisky, Salón ani Láhev.** |
| **Pretty Luzena** | Jednou za tah smí koupit vybavení za cenu **sníženou o 1**. | Koupit smí víc karet, ale **jen jedna** je levnější. Na kartě za 1 valoun ji tím dostane **zdarma**. |
| **Raddie Snake** | Ve svém tahu smí odhodit 1 valoun a líznout si 1 kartu (až 2×). | — |
| **Simeon Picos** | Pokaždé, když ztratí 1 život, vezme si 1 valoun. | Valoun **vždy ze společné zásoby**, ne od hráče, který mu ztrátu způsobil. |

Pozn.: česká pravidla mají v nadpisech dvě chyby proti tisku na kartě — „JACK MURIETA"
(karta: **Jacky Murieta**) a „SIMOEN PICOS" (karta: **Simeon Picos**).

---

## Varianta: Stínoví pistolníci

> Při této variantě nejste nikdy mimo hru!

Jde použít **i bez Zlaté horečky**, ale postavy rozšíření jsou balancované právě pro ni.

Když jsi vyřazen, **platí všechna pravidla pro vyřazení**: odhodíš ruku i vše před sebou
(včetně vybavení), odhalíš roli, zkontroluje se podmínka vítězství, za banditu si vyřazující
vezme 3 karty. **Ponecháš si ale všechny své zlaté valouny.**

Během **každého svého dalšího tahu** (kdy bys byl na tahu, kdybys nebyl vyřazen) se dočasně
vracíš jako **stínový pistolník** (stínový bandita / pomocník / odpadlík):

- máš **0 životů**, lízneš si **2 karty**, odehraješ tah normálně a zase odejdeš;
- během stínového tahu jsi **naživu se všemi schopnostmi**, ale **nemůžeš získat ani ztratit
  život**;
- na konci tahu odhodíš **ruku i vše před sebou** (včetně koupeného vybavení).

**Mimo svůj tah jsi mimo hru pro všechny účely**: neúčinkuje tvoje schopnost, nepočítáš se
do vzdálenosti ani do efektů karet (Hokynářství, Dynamit…).

Valouny si necháváš od tahu k tahu a **smíš je dál získávat i jako stínový pistolník**;
ve stínovém tahu smíš nakupovat vybavení i nutit ostatní odhazovat.

**Stínoví pistolníci se nepovažují za „hrající postavy", které jsou vyřazené** — takže se
na jejich dočasný odchod nevztahuje nic, co se váže na vyřazení hráče: **Vulture Sam nic
nezíská**, a stejně tak **Greg Digger ani Herb Hunter** (Dodge City) své schopnosti
nespustí.

**Dynamit** se vždy posouvá po směru hodinových ručiček k **následujícímu hráči, který je
stále ve hře** — stínové pistolníky **přeskoč**.

### Stínový odpadlík

Na začátku **každého svého tahu** se připojí ke **slabší straně**: spočítá se počet **jiných
odhalených rolí** (ostatní vyřazení hráči **plus šerif**, ale ne jeho vlastní). Přidá se ke
straně, která má **více odhalených karet rolí**; **při remíze k banditům**. Podle toho otočí
kartu role na stranu *stínový pomocník* / *stínový bandita* a **vyhrává s tou stranou**.
Role platí **do začátku jeho dalšího tahu**, i když se situace mezitím změní. Do původní
role Odpadlík se **nikdy nevrací**. Karta *Stínový odpadlík* se do počítání **nikdy nezapočítá**.

---

## FAQ (oficiální, v 1.0)

| # | Otázka | Odpověď |
|---|---|---|
| Q01 | Jsem vyřazen jako odpadlík — počítám role hned? | Ne. Vezmeš si kartu stínového odpadlíka, ale jsi dočasně mimo hru; stranu určíš **až na začátku svého příštího tahu**. |
| Q02 | Jde varianta hrát v 8 hráčích (dva odpadlíci)? | Ano. Jeden použije kartu *Stínový odpadlík*, druhý svou běžnou kartu Odpadlík lícem nahoru (otočenou podle strany). Druhý stínový odpadlík se do počtu započítá podle strany, ke které **právě** patří; jinak se ignoruje. |
| Q03 | Zachovám si jako stínový pistolník kartu postavy? | Ano. **Mimo svůj tah ale schopnost nefunguje.** |
| Q04 | Zabije-li šerif pomocníka, odhazuje i vybavení? | **Ano**, i vybavení. |
| Q05 | Lucky Duke × Rum? | Otočí **5 karet místo 4**. |
| Q06 | Může Don Bell použít schopnost ve Vězení? | **Ne.** |
| Q07 | Kdy se hraje koupené *Wanted!*? | **Okamžitě** — před sebe, nebo před jiného hráče. |
| Q08 | Josh McCloud jako stínový pistolník? | Na konci tahu odhodí ruku i vše před sebou (má 0 životů). Pak může hrát další tah (lízne 2 nové karty a hraje normálně). |
| Q09 | Vyřazen a stanu se stínovým pistolníkem — dostane Vulture Sam mé karty? | **Ano, při prvním vyřazení** („platí všechna pravidla pro vyřazení"). Při **odchodu ze stínového tahu už ne.** |
| Q10 | Můžu zaplatit za odhození **vlastního** vybavení? | **Ne** — jen vybavení **jiného** hráče. |
| Q11 | Můžu měnit Pivo na valoun, když zbývají 2 hráči? | **Ano.** |
| Q12 | John Pain × Rum? | Bere si do ruky **všechny otočené karty po jedné**, dokud nemá 6 karet nebo méně. |
| Q13 | Don Bell × Město duchů? | Na konci tahu je vyřazen a **schopnost se neuplatní**. |
| Q14 | Tequila Joe × Láhev? | Zahraje-li ji jako Pivo, doplní si **jen 1 život**. |
| Q15 | Tequila Joe × „Pivo za valoun"? | Získá **jen 1 valoun**, ne 2. |

---

## Rozpory a mezery v podkladech

1. **Doplňování obchodu.** Česká pravidla obsahují obě věty: „*Na konci vašeho tahu opět
   doplňte karty vybavení (obchod) tak, aby ležely 3 lícem vzhůru*" **i** „*Ve chvíli, kdy
   si někdo z obchodu koupí nějaké vybavení, se tato karta okamžitě nahradí novou kartou*".
   Anglický originál zná **jen okamžité doplnění**. → plán bere **okamžité**.
2. **Šest českých názvů karet chybí.** Česká pravidla jmenují jen 9 karet vybavení (ty,
   ke kterým mají dodatek). Panák, Rýžovací pánev, Opasek, Krumpáč, Union Pacific a Zlatá
   horečka v nich **nejsou** — jsou jen na kartách. Návrhy v tabulce výš se musí ověřit
   z artu, až dorazí.
3. **Rum a počet životů.** Text karty říká „1 život za každou **různou barvu**" ze 4
   otočených karet, tedy 1–4. Příklad v pravidlech dává 3.
4. **Podkova × Lucky Duke.** FAQ Q05 řeší jen Rum. Kolik karet se otáčí, když má hráč
   Podkovu **a zároveň** je Lucky Duke, oficiální podklad neřeší → plán rozhoduje sám.
