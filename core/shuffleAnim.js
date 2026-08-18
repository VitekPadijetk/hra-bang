// core/shuffleAnim.js — časování riffle míchání balíčku (intro i hra).
// Jediný zdroj pravdy: klient animaci přehrává (view/intro.js _animateIntroShuffle,
// game.js playReshuffleCinematic), server podle STEJNÉHO vzorce odkládá další beat
// intra (server/intro.js). Bez sdíleného vzorce se rozdávání rozjelo dřív, než
// míchání doběhlo – při 8 hráčích (16 karet postav) to bylo vidět na první pohled.
//
// Sled fází (stejný pro všechny balíčky):
//   preMs   balíček leží, jak ho kreslí statická hromádka
//   cutMs   horní polovina se JAKO CELEK oddělí doprava, spodní doleva
//   gapMs   pauza s rozděleným balíčkem
//   riffle  karty střídavě zleva/zprava padají doprostřed – hromádka se skládá
//           odspodu nahoru, poslední dosedne úplně navrch (perCard × (n−1) + cardMs)
//   tailMs  doznění, teprve pak jede další beat

const SHUFFLE_ANIM = {
    // Kolik vrstev se vůbec kreslí. Stejný strop má statická hromádka (view/board.js
    // drawDrawPiles i _drawIntroStack), takže se animace a statický balíček kryjí.
    maxLayers: 80,
    preMs: 160,
    cutMs: 420,
    gapMs: 200,
    cardMs: 150,      // let jedné karty na skládanou hromádku
    perCardMin: 22,   // rozestup mezi kartami riffle (velký balíček = rychlý sled)
    perCardMax: 180,  // malý balíček (role) ať se nemihne
    riffleMs: 2200,   // cílová délka riffle, z ní se dopočítá rozestup
    tailMs: 220,
};

// Kolik karet se opravdu animuje (a tedy i kreslí) – nikdy víc, než kreslí hromádka.
function shuffleLayers(n, opts) {
    const o = opts || {};
    const cap = o.maxLayers ?? SHUFFLE_ANIM.maxLayers;
    return Math.max(1, Math.min(cap, Math.floor(n) || 0));
}

// Rozestup mezi dvěma po sobě padajícími kartami.
function shufflePerCard(n, opts) {
    const o = opts || {};
    const k = shuffleLayers(n, o);
    const target = o.riffleMs ?? SHUFFLE_ANIM.riffleMs;
    const lo = o.perCardMin ?? SHUFFLE_ANIM.perCardMin;
    const hi = o.perCardMax ?? SHUFFLE_ANIM.perCardMax;
    return Math.min(hi, Math.max(lo, target / k));
}

// Kde se balíček rozdělí: horní půlka (indexy 0..half−1, 0 = vrchní karta) jde
// doprava, zbytek zůstane vlevo. Při lichém počtu je větší ta HORNÍ.
function shuffleCutHalf(n, opts) {
    return Math.ceil(shuffleLayers(n, opts) / 2);
}

// Pořadí, v jakém karty padají doprostřed – indexy do hromádky (0 = vrchní karta),
// od SPODKU nové hromádky nahoru. Střídá se horní a spodní půlka; při lichém počtu
// začíná ta VĚTŠÍ, jinak by na konci spadly dvě karty z jedné strany za sebou
// (A B A B … A A místo A B A B … B A).
function shuffleRiffleOrder(n, opts) {
    const k = shuffleLayers(n, opts);
    const half = shuffleCutHalf(k, opts);
    const bottom = [];                       // spodní půlka (zůstala vlevo), odspodu nahoru
    for (let i = k - 1; i >= half; i--) bottom.push(i);
    const top = [];                          // odebraná horní půlka (vpravo), odspodu nahoru
    for (let i = half - 1; i >= 0; i--) top.push(i);
    const first  = top.length > bottom.length ? top : bottom;
    const second = first === top ? bottom : top;
    const order = [];
    for (let j = 0; j < Math.max(first.length, second.length); j++) {
        if (j < first.length)  order.push(first[j]);
        if (j < second.length) order.push(second[j]);
    }
    return order;
}

// Kdy dosedne poslední karta (= od kdy smí hromádku vystřídat statický balíček).
function shuffleSettleMs(n, opts) {
    const o = opts || {};
    const k = shuffleLayers(n, o);
    return Math.round((o.preMs ?? SHUFFLE_ANIM.preMs)
        + (o.cutMs ?? SHUFFLE_ANIM.cutMs)
        + (o.gapMs ?? SHUFFLE_ANIM.gapMs)
        + shufflePerCard(k, o) * Math.max(0, k - 1)
        + (o.cardMs ?? SHUFFLE_ANIM.cardMs));
}

// Celková délka animace i s dozněním – tohle čeká server, než pošle další beat.
function shuffleDurationMs(n, opts) {
    const o = opts || {};
    return shuffleSettleMs(n, o) + (o.tailMs ?? SHUFFLE_ANIM.tailMs);
}

// Izomorfní: v prohlížeči globály, v Node/testech require('./core/shuffleAnim.js').
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SHUFFLE_ANIM, shuffleLayers, shuffleCutHalf, shuffleRiffleOrder,
                       shufflePerCard, shuffleSettleMs, shuffleDurationMs };
}
