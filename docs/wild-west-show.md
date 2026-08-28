# BANG! Wild West Show — referenční materiál

Podklad pro implementaci rozšíření. **Zdroj pravdy pro text karty je český text
vytištěný na artu** v `assets/divoky_zapad_cards/` — ten hráč vidí ve hře.
Anglické znění a FAQ slouží k výkladu sporných míst.

Staženo 2026-08-23 z oficiálních zdrojů (dV Giochi) — PDF leží vedle:
`wws_rules_eng.pdf`, `wws_faq_eng.pdf`.

- Obsah rozšíření: **10 karet událostí + 8 postav** ([oficiální seznam karet](https://bang.dvgiochi.com/cardslist.php?id=6&lang=en))
- Autor: Emiliano Sciarra, dV Giochi, 2010

---

## Jak se rozšíření hraje (odlišnost od High Noon / Fistfulu)

Z pravidel (`wws_rules_eng.pdf`):

> Before starting, set aside the card titled **Wild West Show** and shuffle the other
> cards, face down in a separate pile. Then, add *Wild West Show* at the bottom of this
> pile (**WWS** pile), and place it in the middle of the table.
>
> The game proceeds as usual, with the following modification. **When you play a
> Stagecoach or Wells Fargo**, take the WWS pile and place it in front of you. Then,
> reveal the top card and read its effect aloud. That effect is now valid, and continues
> until a new *Stagecoach* or *Wells Fargo* is played. Whoever plays the next *Stagecoach*
> or *Wells Fargo* takes the WWS pile, reveals a new card from the top which replaces the
> previous card, and so on. Remove the previous card from play.
>
> **Exception**: once revealed, the card titled *Wild West Show* stays in play until the
> end of the game, and it doesn't get replaced.

Tedy: **událost neotáčí šerif na začátku kola, ale kdokoli zahráním Dostavníku nebo
Wells Farga.** Na začátku hry žádná událost neplatí. Karta *Divoký západ* leží vespod
(stejný vzor jako Pravé poledne / Fistful of Cards).

**Neotáčí to nic jiného** (FAQ Q16 — ani Krytý vůz z Dodge City) a **neotáčí to ani
zopakování Dostavníku/Wells Farga schopností Lee Van Kliffa** (Sciarra Q19).

---

## Karty událostí (10)

| Klíč (návrh) | Česky (z artu) | Anglicky | Art |
|---|---|---|---|
| `HRBITOV` | Hřbitov | Bone Orchard | `hrbitov` |
| `MILACEK_VALENTYN` | Miláček Valentýn | Darling Valentine | `milacek_valentyn` |
| `ZURIVA_DOROTY` | Zuřivá Doroty | Dorothy Rage | `zuriva_doroty` |
| `ROUBIK` | Roubík | Gag | `roubik` |
| `HELENA_ZONTERO` | Helena Zontero | Helena Zontero | `helena_zontero` |
| `LADY_RUZE_Z_TEXASU` | Lady Růže z Texasu | Lady Rose of Texas | `lady_ruze_z_texasu` |
| `MADAM_ZUZANA` | Madam Zuzana | Miss Susanna | `madam_zuzana` |
| `SACAGAWAY` | Sacagaway | Sacagaway | `sacagaway` |
| `ZUCTOVANI` | Zúčtování | Showdown | `zuctovani` |
| `DIVOKY_ZAPAD` | Divoký západ | Wild West Show | `divoky_zapad` |

### Texty z artu (české, závazné pro UI)

- **Hřbitov** — „Na začátku svého tahu se všichni vyřazení hráči vrátí do hry s 1 životem.
  Role vyřazených hráčů zamíchejte a rozdejte náhodně."
- **Miláček Valentýn** — „Na začátku svého tahu odhodí každý hráč všechny karty z ruky
  a stejný počet karet si dobere z balíčku."
- **Zuřivá Doroty** — „Hráč na tahu může jmenovat kartu a vybrat hráče, který ji musí
  zahrát (pokud ji má)."
- **Roubík** — „Hráči nesmí mluvit (mohou gestikulovat, sténat atd.). Každý kdo promluví,
  ztrácí 1 život."
- **Helena Zontero** — „Když přijde Helena do hry, otočte vrchní kartu z dobíracího
  balíčku: jsou-li to srdce ♥ nebo káry ♦, zamíchejte všechny aktivní role s výjimkou
  Šerifa a znovu je náhodně a tajně rozdejte. Každý hráč se podívá na svou novou roli."
- **Lady Růže z Texasu** — „Během svého tahu si může každý hráč vyměnit místo s hráčem
  po své pravici a ten tak přeskočí svůj nejbližší tah."
- **Madam Zuzana** — „Během svého tahu musí každý hráč zahrát alespoň 3 karty. Hráč,
  který to neudělá, ztrácí 1 život."
- **Sacagaway** — „Všichni hráči hrají s odhalenými kartami v ruce (vyjma svých rolí)."
- **Zúčtování** — „Každá karta může být hrána jako by to byla karta **BANG!**. Každá
  karta **BANG!** může být hrána jako by to byla karta **Vedle!**."
- **Divoký západ** — „Cílem každého hráče se stává: ‚Zůstaň poslední ve hře!'"

### Poznámky z pravidel (karta NOTES v krabici)

- **Bone Orchard** — „Players return to play **permanently**. Hence, they stay in play
  even after the *Bone orchard* terminates its effect, if they are still in play."
- **Darling Valentine** — „Players then also draw the usual 2 cards from the deck."
  (tj. výměna ruky je NAVÍC, fáze lízání proběhne normálně)
- **Dorothy Rage** — „If the forced player does not have the called card, he must show
  his hand. If he has it, he must play it **as if it was his turn** (also for counting
  the distances), but **you choose any target(s)** if the card requires so."
- **Lady Rose of Texas** — „Bring your cards, your mat, etc. with you!" (mění se sedadlo
  včetně všeho vyloženého)
- **Miss Susanna** — „This effect does not apply to players skipping their turn because
  of the *Jail*."
- **Showdown** — „Big Spencer may use *BANG!* as they were *Missed!* and Lee Van Kliff
  may discard any card to use his ability."
- **Wild West Show** — „It is just like each player has the same goal of the Renegade.
  However, **the actual roles stay the same**: therefore the Sheriff may not go to *Jail*,
  and eliminating an Outlaw brings the usual 3 cards reward. **If the Sheriff is
  eliminated, the game continues.** Victory is individual."

Německá pravidla to u Divokého západu upřesňují stejně: hra nekončí smrtí šerifa
a běží, dokud nezůstane 1 hráč.

---

## Postavy (8)

Životy a schopnosti (ověřeno proti oficiálnímu FAQ a strategickým průvodcům).

| Postava | Životy | Schopnost (anglicky, tištěné znění) |
|---|---|---|
| **Big Spencer** | **9** | „He starts with 5 cards. He can't play *Missed!*." |
| **Flint Westwood** | 4 | „During his turn, he may trade 1 card from hand with 2 cards at random from the hand of another player." |
| **Gary Looter** | **5** | „He draws all excess cards discarded by other players at the end of their turn." |
| **Greygory Deck** | 4 | „At the start of his turn, he may draw 2 characters at random. He has all the abilities of the drawn characters." |
| **John Pain** | 4 | „If he has less than 6 cards in hand, each time any player *draws!*, John adds the card just drawn to his hand." |
| **Lee Van Kliff** | 4 | „During his turn, he may discard a *BANG!* to repeat the effect of a brown-bordered card he just played." |
| **Teren Kill** | **3** | „Each time he would be eliminated *draw!*: if it is not Spades, Teren stays at 1 life point, and draws 1 card." |
| **Youl Grinner** | 4 | „Before drawing, players with more hand cards than him must give him one card of their choice." |

### Poznámky z pravidel k postavám

- **Flint Westwood** — „The card from your hand is of your choice, not at random.
  If the target player has only one card, you get only one card."
- **Greygory Deck** — „The only valid characters are those from the basic game. At the
  beginning of your next turn, you decide whether to keep the characters or to change
  them. If you choose to change them, **you must change both of them**. This ability also
  applies at the beginning of the game."
- **John Pain** — „The card drawn this way **may not be used immediately**; you must wait
  until the previous effect ends. For example, if it's a *Beer* and you lose at the same
  time your last life point, you may not use it."
- **Lee Van Kliff** — „The brown-bordered card may be also another *BANG!* You may repeat
  each effect **one time only**. If you repeat the effect of a *Stagecoach* or *Wells
  Fargo*, the WWS card only changes the first time. Repeating the effect counts as one
  card played, if *Miss Susanna* is in play."
- **Teren Kill** — „If the *draw!* is unsuccessful, you can't play a *Beer* to save you."

---

## Oficiální FAQ (dV Giochi, `wws_faq_eng.pdf`)

Q01–Q18. Toto je **závazné** znění (turnajové).

- **Q01** Když Greygory Deck mění postavy, míchají se ty předchozí zpátky mezi ostatní?
  → **Ano.** Zamíchej všechny postavy a pak náhodně dvě líznout (může dostat i ty právě odložené).
- **Q02** Když Madam Zuzana přijde do hry uprostřed tahu, počítají se karty zahrané dřív
  v tomtéž tahu do těch tří? → **Ano** — text mluví o „během tahu", takže i karty zahrané
  před příchodem karty.
- **Q03** Kdo dává kartu Youl Grinnerovi při shodě? → **Každý z těch hráčů** (všichni, kdo
  mají v ruce víc karet než on).
- **Q04** Musím u Zuřivé Doroty popsat akci celou dřív, než vím, jestli cíl kartu má?
  → **Ano.** Nestačí „zahraj BANG!", musí to být „zahraj BANG! na tamtoho hráče". Akce
  musí být pro toho hráče **proveditelná** (nesmí se poručit výstřel mimo jeho dostřel).
- **Q05** Jaká vzdálenost se u Zuřivé Doroty počítá? A když poručím Slabu Killerovi
  vystřelit? → **Všechno (vzdálenost, efekty) se počítá tak, jako by kartu hrál ten
  poručený.** Slab jako poroučející tedy dvě Vedle! nevynutí; Slab jako poroučený ano.
- **Q06** Když poručím někomu zahrát Duel a on ho prohraje, kdo ztrácí život? A kdo si
  líže karty za Dostavník / Paniku? → **Poručený hráč** ztrácí život; **on** (ne ty)
  si líže karty.
- **Q07** Smí Big Spencer používat Barel a jiné karty s efektem Vedle!? → **Ano**, zákaz
  se týká jen karet *Vedle!*.
- **Q08** Kolikrát jde použít Lady Růže z Texasu? → Pravidlo palce: dohodněte si strop
  **x opakování za sebou, kde x = počet žijících hráčů** — jinak hrozí smyčka, která
  jednoho hráče vyřadí ze hry.
- **Q09** Bere John Pain kartu otočenou kvůli Heleně Zontero? → **Ne**, ta karta se otáčí
  automaticky, ne hráčem.
- **Q10** Zakazuje Roubík i psanou komunikaci (SMS…)? → Na dohodě skupiny; doporučuje se
  zakázat i psané zprávy.
- **Q11** Co když Vera Custer kopíruje Johna Paina a někdo sejme kartu? → Kartu bere
  **první hráč po směru hodinových ručiček od toho, kdo snímal**.
- **Q12** Když Teren Killa vyhodí do vzduchu Dynamit, kolikrát snímá? → **Jednou.**
  ♠ = vyřazen, jinak zůstává na 1 životě (a líže si kartu).
- **Q13** Smí Lee Van Kliff zopakovat efekt na **jiný cíl**? → **Ano.**
- **Q14** Bere si Gary Looter své vlastní karty odhozené nad limit? → **Ne!**
- **Q15** Platí za Divokého západu šerifova pokuta za zabití pomocníka? A odměna 3 karet
  za banditu? → **Ano** (obojí; role zůstávají).
- **Q16** Kolikrát smí Flint Westwood použít schopnost za tah? → **Jen jednou.**
- **Q17** Jak se řeší Flint Westwood / Panika / Cat Balou, když je ve hře Sacagaway?
  → Karty se otočí **lícem dolů**, zamíchají, náhodně se vezme jedna (u Flinta dvě)
  a zbytek se zase odhalí.
- **Q18** Co když Teren Kill schytá smrtelný zásah a má v ruce Pivo? → Má na výběr:
  **buď** zahraje Pivo a zůstane na 1 životě (pak si ale **nelíže** kartu), **nebo**
  Pivo nezahraje a snímá — a při ♠ je vyřazen a **Pivo už zahrát nesmí**.

---

## Neoficiální FAQ (Emiliano Sciarra, překlad Martin Pulido)

Doplňuje oficiální FAQ o otázky, které v něm nejsou. Není turnajově závazné, ale odpovědi
jsou podle autora „téměř identické". Zdroj:
[bangcardgame.blogspot.com](http://bangcardgame.blogspot.com/2011/01/wild-west-show-faq-in-english.html)

Co navíc řeší (číslování Sciarrovo):

- **Q12** Lee Van Kliff a Apache Kid: rozhoduje **barva PŮVODNÍ hnědé karty**, ne barva
  karty BANG!, kterou Lee odhazuje. Kartou BANG! ♦ se dá zopakovat i Kulomet a Apache Kida
  to zasáhne. Odhozený BANG! **není zahraný**, jen odhozený (viz Q24).
- **Q19** Zopakování Dostavníku / Wells Farga **nemění kartu Divokého západu** — schopnost
  opakuje efekt karty, ne kartu samotnou.
- **Q22** Když snímá Lucky Duke (2 karty), John Pain bere **obě**. Má-li 5 karet, bere
  **jen tu první** (nevybírá si). Karty se posuzují v pořadí snímání.
- **Q24** Karta BANG!, kterou Lee Van Kliff platí schopnost, se **nepočítá** do tří karet
  Madam Zuzany — byla „odhozena", ne „zahrána".
- **Q25** Gary Looter jako šerif má **6 životů a limit 6 karet**.
- **Q26** Youl Grinnerova schopnost se spouští **ve fázi lízání** (před ním).
- **Q29** Když Lee Van Kliff opakuje efekt karty, která se platí odhozením další karty
  (Rvačka, Ragtime, Whisky), **cenu už znovu neplatí** — opakuje se efekt, ne aktivace.
- **Q30/Q31** Greygory Deck bere **jen postavy základní hry**. Když si dvě schopnosti
  odporují **absolutně**, vybere si jednu (nelíže novou); jinak se kombinují — příklady:
  Jesse Jones + Kit Carlson, Jesse Jones + Pedro Ramirez, Kit Carlson + Black Jack.
- **Q32** Když Flint Westwood vezme Suzy Lafayette poslední kartu (nebo dvě), Suzy si za
  prázdnou ruku lízne — a Flint tu líznutou kartu **nedostane**.
- **Q33** Flint Westwood nesmí schopnost použít proti hráči **s prázdnou rukou**.
- **Q21** Hřbitov vrací hráče do hry **opakovaně**, dokud je karta ve hře.
- **Q9 (Sciarra)** Big Spencer má vždy **5 karet na začátku** bez ohledu na roli; jako
  šerif má **10 životů** a tím i limit 10 karet v ruce.

---

## Zdroje

- [Oficiální seznam karet — dV Giochi](https://bang.dvgiochi.com/cardslist.php?id=6&lang=en)
- [Oficiální pravidla (PDF)](https://www.dvgiochi.com/giochi/wildwestshow/download/BANG!_wild_west_show_rules.pdf) → `docs/wws_rules_eng.pdf`
- [Oficiální FAQ (PDF)](https://www.dvgiochi.com/giochi/wildwestshow/download/bang_wild_west_show_faq_eng.pdf) → `docs/wws_faq_eng.pdf`
- [Neoficiální FAQ Emiliana Sciarry (anglicky)](http://bangcardgame.blogspot.com/2011/01/wild-west-show-faq-in-english.html)
- [Recenze rozšíření s citacemi textů karet](http://bangcardgame.blogspot.com/2011/06/review-wild-west-show.html)
- [Německá souhrnná pravidla HN + AFoC + VoS + WWS (PDF)](https://www.dvgiochi.com/giochi/highnoon/download/Bang_HN_AFoC_VoS_WWS_rules_DEU.pdf)
