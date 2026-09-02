// core/wwsAnim.js — časování cinematik rozšíření Divoký západ (Wild West Show).
// Jediný zdroj pravdy: klient je podle těchhle čísel přehrává (net/handlers.js), server
// o stejnou dobu drží boty (room._wwsBlockUntil v server/anim.js) a fronta animací si
// podle nich spočítá, jak dlouho zdržet stav (ANIM_MS / _animDurationMs v net/handlers.js).
// Izomorfní: globál v prohlížeči, require v Node. Viz CLAUDE.md (vzor core/fistfulAnim.js).

// ── Sacagaway: přetočení všech cizích vějířů ─────────────────────────────────
// „Všichni hráči hrají s odhalenými kartami v ruce." Karta přichází (a odchází) uprostřed
// hry, takže se ruce nesmí přepnout skokem – vějíře se PLYNULE přetočí, karta po kartě
// s malým odstupem, ať to čte oko. Vějíře jednotlivých hráčů se rozjíždějí po sobě
// (handStaggerMs), takže vlna obejde stůl.
const SACA_FLIP = {
    preMs:          140,   // pauza, než se ruce hnou (dojíždí odkrytí karty události)
    flipMs:         320,   // překlopení jedné karty (2× 160 – zúžení na nulu a zpět)
    cardStaggerMs:   55,   // odstup karet uvnitř jednoho vějíře
    handStaggerMs:  110,   // odstup mezi vějíři jednotlivých hráčů
    tailMs:         140,   // doznění, ať stav nedorazí přesně na hranu dotočení
};

// Jak dlouho trvá přetočení sady vějířů. `fanSizes` = počty karet v jednotlivých rukou
// (v pořadí, ve kterém se rozjíždějí). Prázdné ruce se nepřetáčejí, ale pořadí drží,
// takže se vlna kolem stolu nezrychlí.
function sacaFlipMs(fanSizes) {
    const D = SACA_FLIP;
    const sizes = Array.isArray(fanSizes) ? fanSizes : [];
    let last = 0;
    sizes.forEach((n, i) => {
        if (!n) return;
        last = Math.max(last, i * D.handStaggerMs + (n - 1) * D.cardStaggerMs + D.flipMs);
    });
    if (!last) return 0;
    return D.preMs + last + D.tailMs;
}

// ── Sacagaway × krádež z ruky: fyzický postup z FAQ Q17 ──────────────────────
// Odkrytá ruka NEMĚNÍ nic na tom, jak se z ní bere – Panika, Cat Balou, Ragtime, Jesse
// Jones i Flint Westwood losují dál. FAQ Q17 to popisuje doslova: postižený hráč ruku
// otočí lícem dolů, ZAMÍCHÁ ji, teprve pak se z ní vezme náhodná karta a ruka se zase
// odhalí. Kdyby se vybíralo, byla by Panika pod Sacagaway přesně mířená zbraň.
//
// Cinematika ten postup ukazuje, jinak by hráč, který soupeři vidí do ruky a nemůže si
// vybrat, měl pocit, že je to chyba UI:
//   1. vějíř oběti se přetočí na ruby  (downMs, karty s odstupem)
//   2. sesbírá se na hromádku, krátce zamíchá a zase rozprostře  (gatherMs/holdMs/spreadMs)
//   3. odletí náhodná karta  (to už je běžná animace krádeže – ruka je rubem nahoru,
//      takže se chová přesně jako bez Sacagaway)
//   4. zbytek ruky se přetočí zpátky lícem nahoru  (upMs)
const SACA_STEAL = {
    downMs:         240,   // přetočení vějíře lícem dolů
    cardStaggerMs:   40,   // odstup karet uvnitř vějíře (platí pro dolů i nahoru)
    gatherMs:       200,   // sesbírání do hromádky
    holdMs:         180,   // zamíchání (hromádka drží pohromadě)
    spreadMs:       200,   // rozprostření zpátky do vějíře
    upMs:           240,   // přetočení zpátky lícem nahoru
};

// O kolik se krádež z ruky ODLOŽÍ (kroky 1–2), než se karta smí odlepit.
function sacaStealPreMs(n) {
    const D = SACA_STEAL;
    if (!n) return 0;
    return D.downMs + Math.max(0, n - 1) * D.cardStaggerMs + D.gatherMs + D.holdMs + D.spreadMs;
}

// Jak dlouho trvá krok 4 (přetočení zbytku ruky zpátky lícem nahoru). `n` = počet karet,
// které v ruce ZŮSTALY.
function sacaStealPostMs(n) {
    const D = SACA_STEAL;
    if (!n) return 0;
    return D.upMs + Math.max(0, n - 1) * D.cardStaggerMs;
}

// Celkové prodloužení animace krádeže z ruky pod Sacagaway (pre + post). `n` = počet
// karet v ruce oběti PŘED krádeží. O tuhle dobu se musí podržet fronta i boti.
function sacaStealExtraMs(n) {
    if (!n) return 0;
    return sacaStealPreMs(n) + sacaStealPostMs(n - 1);
}

// ── Helena Zontero: sejmutí, které rozhoduje o přerozdání rolí ───────────────
// Karta se otáčí AUTOMATICKY (FAQ Q09), takže NEJDE cestou sejmutí – Lucky Duke ani
// John Pain se u ní neuplatní. Vizuálně je to ale totéž co Peyote: karta vyletí
// z balíčku doprostřed, překlopí se, chvíli drží s pulzující markou barvy a sjede do
// odhozu. Výdrž je delší než u Peyote – u stolu se na ni dívají všichni a rozhoduje
// o tom, jestli se za chvíli přerozdají role.
const HELENA_ANIM = {
    flyMs: 450,     // balíček → střed (uvnitř běží překlopení rub→líc, 2× 225)
    holdMs: 1700,   // odkrytá karta drží s pulzující markou barvy
    landMs: 400,    // do odhozu
    bufMs: 100,     // rezerva, ať stav nedorazí přesně na hranu dosednutí
};

function helenaRevealMs() {
    const D = HELENA_ANIM;
    return D.flyMs + D.holdMs + D.landMs + D.bufMs;
}

// ── Přerozdání rolí (Hřbitov, Helena Zontero): veřejná půlka ─────────────────
// Karty rolí, které LEŽÍ na stole (u Hřbitova vyřazení hráči, ve hře pro 3 všichni),
// odletí ze svých slotů doprostřed, cestou se přetočí na rub a složí se do hromádky;
// nad ní se přehraje stávající riffle cinematika (core/shuffleAnim.js) a pak se karty
// rozdají zpátky – rubem nahoru, protože role je od té chvíle zase tajná.
//
// Míchá se pár karet (2–7), takže riffle jede rychleji než u herního balíčku: přebíjí
// se `riffleMs`/`perCardMax`, ať se cinematika nevleče. Vzorec musí být jediný – klient
// podle něj animuje, fronta podle něj zdrží stav a server o stejnou dobu drží boty.
const ROLE_SHUFFLE = {
    gatherMs:  520,   // karty ze slotů doprostřed (cestou překlopení lícem → rub)
    holdMs:    220,   // hromádka chvíli leží, než se do ní sáhne
    dealMs:    520,   // rozdání zpátky na sloty
    tailMs:    180,   // doznění, ať stav nedorazí přesně na hranu dosednutí
    riffleMs:  900,   // zkrácený riffle (parametr core/shuffleAnim.js)
    perCardMax: 130,
};

// Parametry riffle míchání pro hromádku rolí – předávají se do core/shuffleAnim.js.
function roleShuffleOpts() {
    return { riffleMs: ROLE_SHUFFLE.riffleMs, perCardMax: ROLE_SHUFFLE.perCardMax };
}

// `n` = kolik karet rolí se sesbíralo doprostřed. Nula = veřejná půlka se nehraje vůbec
// (role živých hráčů na stole neleží – Helena mimo hru pro 3).
function roleShuffleMs(n, shuffleDurationFn) {
    if (!n) return 0;
    const D = ROLE_SHUFFLE;
    // shuffleDurationMs je v core/shuffleAnim.js (v prohlížeči globál, v Node require).
    const dur = typeof shuffleDurationFn === 'function'
        ? shuffleDurationFn
        : (typeof shuffleDurationMs === 'function' ? shuffleDurationMs
           : (typeof require === 'function' ? require('./shuffleAnim.js').shuffleDurationMs : null));
    const shuffleMs = dur ? dur(n, roleShuffleOpts()) : 0;
    return D.gatherMs + D.holdMs + shuffleMs + D.dealMs + D.tailMs;
}

// ── Přerozdání rolí: soukromá půlka („každý hráč se podívá na svou novou roli") ──
// Rub karty role přiletí z okraje jeviště doprostřed, otočí se JEN svému majiteli,
// chvíli drží a odletí zpátky za okraj. Přehraje si ji každý klient sám za sebe –
// ostatní z ní nevidí nic, takže se nedá odečíst ani to, kdo se zrovna dívá.
const ROLE_PEEK = {
    flyMs:   420,   // z okraje jeviště doprostřed (rubem nahoru)
    flipMs:  300,   // překlopení rub → líc (2× 150)
    holdMs: 1800,   // vlastní role drží, ať se stihne přečíst
    backMs:  300,   // překlopení zpátky na rub
    outMs:   380,   // odlet za okraj jeviště
    bufMs:   120,
};

function rolePeekMs() {
    const D = ROLE_PEEK;
    return D.flyMs + D.flipMs + D.holdMs + D.backMs + D.outMs + D.bufMs;
}

// ── Greygory Deck: líznutí nové dvojice postav ──────────────────────────────
// „Na začátku svého tahu si smí líznout 2 postavy náhodně." Líže se ze SKUTEČNÉHO
// balíčku postav – z těch, jejichž karta je zrovna volná (R12) – a cinematika ukazuje
// přesně to: shora přiletí balíček volných karet, stávající dvojice se do něj vrátí
// (cestou se přetočí na rub; rubem karty postavy JE karta životů), balíček se zamíchá
// stejným riffle jako každý jiný (core/shuffleAnim.js), vypadne z něj nová dvojice
// a balíček zase odletí nahoru. Bez ní by se dvě karty u portrétu jen tiše vyměnily.
//
// Míchá se malá hromádka (nejvýš 16 karet základní hry), takže se riffle zkracuje –
// stejným způsobem jako u přerozdání rolí.
const GREYGORY_DEAL = {
    inMs:       460,   // balíček shora doprostřed stolu
    gatherMs:   360,   // stávající dvojice do balíčku (cestou překlopení lícem → rub)
    holdMs:     180,   // hromádka chvíli leží, než se do ní sáhne
    dealMs:     440,   // nová dvojice z balíčku na místo u portrétu (cestou se odkryje)
    outMs:      420,   // balíček odletí zpátky nahoru
    tailMs:     180,   // doznění, ať stav nedorazí přesně na hranu dosednutí
    // Zkrácený riffle: hromádka je malá (nejvýš 16 karet), ale cinematika se nesmí
    // vléct – jede se svižněji než u herního balíčku i u rolí.
    riffleMs:   600, perCardMax: 70,
    preMs:       80, cutMs: 300, gapMs: 120, shuffleTailMs: 120,
};

// Parametry riffle míchání pro balíček postav – předávají se do core/shuffleAnim.js.
function greygoryShuffleOpts() {
    const D = GREYGORY_DEAL;
    return { riffleMs: D.riffleMs, perCardMax: D.perCardMax,
             preMs: D.preMs, cutMs: D.cutMs, gapMs: D.gapMs, tailMs: D.shuffleTailMs };
}

// `poolSize` = kolik karet postav je volných (tolik jich balíček má), `oldCount` = kolik
// karet se do něj vrací (0 na začátku hry a u Very Custer, jinak 2).
function greygoryDealMs(poolSize, oldCount, shuffleDurationFn) {
    const D = GREYGORY_DEAL;
    const n = Math.max(1, Number(poolSize) || 0);
    const dur = typeof shuffleDurationFn === 'function'
        ? shuffleDurationFn
        : (typeof shuffleDurationMs === 'function' ? shuffleDurationMs
           : (typeof require === 'function' ? require('./shuffleAnim.js').shuffleDurationMs : null));
    const shuffleMs = (n >= 2 && dur) ? dur(n, greygoryShuffleOpts()) : D.holdMs;
    return D.inMs + (oldCount ? D.gatherMs : 0) + D.holdMs + shuffleMs
         + D.dealMs + D.outMs + D.tailMs;
}

// ── Greygory Deck: nabídka „nechat, nebo líznout novou?" ─────────────────────
// Dvojice u portrétu je malá a text schopnosti se z ní nedá přečíst, takže se na dobu
// rozhodování zvětší – vyroste ze svých míst doprostřed a po volbě se tam zase vrátí.
// Není to fáze animace (nabídka žádnou frontu nedrží), jen doba růstu a smrštění.
const GREYGORY_OFFER_ZOOM = {
    growMs:   300,
    shrinkMs: 260,
};

// ── Lady Růže z Texasu: výměna sedadel ───────────────────────────────────────
// „Během svého tahu si může každý hráč vyměnit místo s hráčem po své pravici."
// Sedadlo je v tomhle kódu index, takže se výměnou přeskládá půlka stolu naráz – bez
// cinematiky by hráči jen skokem přeskočili a nikdo by nepoznal, co se stalo. Oba
// portréty proto přeletí po oblouku na místo toho druhého a stav dorazí, až doletí.
const SEAT_SWAP = {
    preMs:  120,   // pauza, ať je vidět, odkud se startuje
    flyMs:  620,   // let po oblouku na sedadlo toho druhého
    tailMs: 160,   // doznění, ať stav nedorazí přesně na hranu dosednutí
    lift:   0.28,  // výška oblouku jako podíl vzdálenosti mezi sedadly
    grow:   1.35,  // o kolik portrét v nejvyšším bodě oblouku naroste
};

function seatSwapMs() {
    const D = SEAT_SWAP;
    return D.preMs + D.flyMs + D.tailMs;
}

// ── Zuřivá Doroty: „nemá-li poručenou kartu, musí ukázat ruku" ───────────
// Ruka se neodhazuje ani nikam neletí – jen se na chvíli otočí lícem nahoru. Není to
// tedy animace (klient kreslí odkryté karty sám, jakmile mu je pustí redakce, viz
// redactState v server/rooms.js), ale ČAS: jak dlouho zůstává vidět. Server podle něj
// naplánuje zhasnutí i držení botů, ať se hra pod odkrytou rukou neposune.
const DOROTHY_REVEAL = {
    holdMs: 2600,   // jak dlouho je ruka vidět
};

function dorothyRevealMs() {
    return DOROTHY_REVEAL.holdMs;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOROTHY_REVEAL, dorothyRevealMs,
                       SACA_FLIP, sacaFlipMs, SACA_STEAL,
                       sacaStealPreMs, sacaStealPostMs, sacaStealExtraMs,
                       HELENA_ANIM, helenaRevealMs,
                       ROLE_SHUFFLE, roleShuffleOpts, roleShuffleMs,
                       ROLE_PEEK, rolePeekMs,
                       SEAT_SWAP, seatSwapMs,
                       GREYGORY_DEAL, greygoryShuffleOpts, greygoryDealMs,
                       GREYGORY_OFFER_ZOOM };
}
