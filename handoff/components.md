# Opakující se prvky

## Hlavička obrazovky

Neposuvná. Vlevo tlačítko zpět, pak nadpis a podtitulek. Vpravo 150px volno na rohové ovládání
(fullscreen), aby se dlouhý nadpis nedostal pod něj.

- Nadpis: Oswald 600, `clamp(18px,2.2vw,26px)`, `--gold`, jeden řádek s `text-overflow: ellipsis`
- Podtitulek: EB Garamond 14px, `--muted`, jeden řádek s ellipsis
- Pozadí `--headerBg`, dole 1px `--line`

**Tlačítko zpět má dvě podoby.** Když odchod nic neruší, je neutrální: „◀ Zpět", rám `--line2`.
Když hráč opouští lobby, ve kterém sedí, je varovné: „◀ Opustit hru", rám `--badLine`,
pozadí `--badBg`, text `--bad`. Rozlišení je záměrné — v lobby odchod ruší tvoje místo.

## Lišta akcí

Neposuvná, dole. `--headerBg`, nahoře 1px `--line`, `flex-wrap`. Vlevo souhrn stavu
(EB Garamond 15px, `--muted`), vpravo primární akce. Souhrn nese informaci, kterou hráč
potřebuje **než** klikne: „5 hráčů · Dodge City · High Noon" nebo „Vyber počet hráčů a zadej název."

## Tlačítka

| Typ | Použití | Vzhled |
|---|---|---|
| Primární | jedna akce na obrazovku | `linear-gradient(--goldHi, --gold)`, text `--onGold`, bez rámu |
| Sekundární | vedlejší akce | `--panel`, rám `--line2`, text `--text` |
| Nenápadné | zrušit, zavřít, do menu | průhledné, rám `--line`, text `--muted` |
| Ničivé | zrušit hru, vyhodit | průhledné, rám `--badLine`, text `--bad` |
| Zamčené | nesplněná podmínka | `--panel`, text `--dim`, `cursor: not-allowed` |

Zamčené tlačítko **říká, co chybí**, místo aby jen zešedlo: „▶ ZAHÁJIT HRU (stůl není plný)",
„▶ ZAHÁJIT DALŠÍ HRU (chybí 1)". Hráč nemá hádat, proč to nejde.

## Řádek místnosti (S6, S10)

Jeden klikatelný řádek, uvnitř pět bloků:

1. **Název + kdo** — název (Oswald 600 19px), pod ním „zakládá Calamity" nebo „hraje Calamity"
   plus „· navazující hra", když jde o pokračování (EB Garamond 14px `--muted`)
2. **Sedačky** — tolik 9px tečkových, kolik je míst; obsazené `--gold`, prázdné `--line2`.
   Tohle je čtení na první pohled: plný stůl je poznat bez čtení čísla.
3. **Počet** — „5 / 8", Oswald 16px, min. šířka 54px, aby řádky nepodskakovaly
4. **Stav** — „● ČEKÁ" `--ok` / „● PLNÁ" `--dim` / „● PROBÍHÁ" `--running`, min. šířka 86px
5. **Akce** — „PŘIPOJIT" (primární) / „PLNÁ" (zamčené) / „DÍVAT SE" (sekundární)

Levý okraj 4px v barvě stavu. Hover: rám `--gold`, pozadí `--panelHi`.

## Řádek sedačky (S7, S8, S9)

Pořadové číslo · ikona · jméno · přívlastek · akce.

- Ikona: 👑 Game Leader, 🤖 bot, 🎩 hráč, `·` prázdné místo
- Jméno: 18px; tvoje je `--gold`, ostatní `--text`, prázdné místo `--dim`
- Přívlastek: „(ty)", „Game Leader", „bot", „chce dál ✅" — EB Garamond 14px
- Tvůj řádek má rám `--gold` a pozadí `--noticeBg`
- Prázdné místo je průhledné s rámem `--line`; pro Game Leadera je klikatelné („➕ Bot"),
  pro ostatní jen „Čeká se…"
- Game Leader vidí u botů „✕" na odebrání

## Odznak stavu

Pilulka, rádius 14px, Oswald 13px, `letter-spacing: .06em`.

| Stav | Text | Vzhled |
|---|---|---|
| Účastní se | HRAJE | `linear-gradient(--goldHi, --gold)`, text `--onGold` |
| Rozhoduje se | ČEKÁ SE | průhledné, rám `--line2`, text `--muted` |
| Odešel | ODEŠEL | `--badBg`, rám `--badLine`, text `--bad` |

## Avatar

Kruh s iniciálami (první dva znaky jména, velkými, Rye 10–11px).

- Aktivní: `linear-gradient(135deg, --goldHi, --gold)`, text `--onGold`
- Neaktivní: `--line2`, text `--muted`

Velikost 24px v čipu, 26px v čipu se jménem, 30px v řádku seznamu.

## Zaškrtávací karta (rozšíření, pokročilé volby)

Klikatelná karta: čtvereček 22px vlevo (rádius 5px), vedle název a nápověda.

- Vypnuto: rám `--line2`, pozadí `--panel`, čtvereček průhledný s rámem `--line2`
- Zapnuto: rám `--gold`, pozadí `--noticeBg`, čtvereček plný `--gold` s „✔" v `--onGold`,
  název `--gold`
- Nápověda pod názvem: EB Garamond 14px `--muted`, `line-height: 1.35`, `text-wrap: pretty`

Nápověda je součást karty, ne tooltip. Hráč se rozhoduje mezi pěti rozšířeními, která si
nepamatuje — jedna věta ke každému je to, co mu chybělo.

## Pruh účasti (S13)

Segmentovaný pruh: jeden segment na hráče, ne procentní lišta. Zaplněné segmenty
`linear-gradient(--goldHi, --gold)`, prázdné průhledné s rámem `--line2`, výška 12px, mezera 4px,
rádius 3px. Počet segmentů = hráči, kteří ještě neodešli, nejméně 3.

Nad pruhem velké číslo `3 / 4` (Rye `clamp(30px,4.6vw,46px)` a `--muted` 20px pro jmenovatel).

## Okno (modal)

Přetmavení `--scrim` na celou vrstvu, uvnitř karta max. 420–440px:
`linear-gradient(--panel, --bg)`, rám `--line2`, rádius 12px, `box-shadow: 0 24px 60px rgba(0,0,0,.55)`.
Nadpis Rye 19–20px `--gold`, vpravo „✕".

Chybová zpráva ve formuláři má **rezervované místo** (`min-height: 22px`), aby okno nepodskočilo,
když se chyba objeví.

## Chybová hláška (toast)

Ukotvená dole na středu, max. 440px. `--toastBg`, rám `--badLine`. Vlevo „⚠" `--bad`,
pak dva řádky: co se stalo (Oswald 16px `--text`) a co s tím (EB Garamond 15px `--muted`).
Vpravo „✕".

Druhý řádek je povinný. „Do hry se nepodařilo připojit" hráči neřekne nic; „Stůl se mezitím
zaplnil. Vyber si ze seznamu jinou hru." mu řekne, co dál.
