// core/animQueue.js — prezentační fronta klienta: srovná v čase přijaté ANIMACE
// (`card_animation`) a STAVOVÉ updaty (`room_update`), aby na sebe navazovaly i na
// pomalé/kolísavé lince.
//
// PROČ: server pošle animaci hned a nový stav až s pevnou prodlevou odměřenou NA
// SERVERU (broadcastRoomDelayed ~400 ms ≈ délka letu karty). Na rychlé lince to sedí.
// Jakmile se spojení zadrhne, oba eventy se slijí do jednoho okamžiku a stav se
// projeví dřív, než karta doletí – karta „už je v odhozu" a zároveň ještě letí.
// Stejně tak víc animací v jedné dávce (odhoz + krádež + smrt) se dnes přehraje přes
// sebe, protože nic nedrží jejich pořadí.
//
// JAK: obojí projde jednou lokální časovou osou. Položky se přehrávají v pořadí
// PŘÍJMU – Socket.IO doručuje eventy jednoho socketu v pořadí odeslání, takže pořadí
// příjmu JE pořadí, které server zamýšlel; není potřeba nic číslovat. Animace jedou
// jedna po druhé (další startuje, až doběhne předchozí) a stav se commitne teprve
// tehdy, když doběhlo všechno, co mu předcházelo.
//
// Trvání animace fronta neměří, dostane ho jako odhad (`est`) od volajícího – tabulka
// u přehrávače je jediné místo, kde se pacing ladí. Nepřesnost o pár desítek ms udělá
// jen drobnou mezeru nebo drobný překryv, nikdy zaseknutí (fronta se posune vždy).
//
// ZAOSTÁVÁNÍ SE NESMÍ KUMULOVAT: když se ve frontě naskládá víc než jedna ČEKAJÍCÍ
// animace a jejich součet přeleze `maxLagMs` (rychle hrající bot, slabý stroj, delší
// pauza v přenosu), čekající animace se
// zahodí a commitne se rovnou POSLEDNÍ stav. Je to bezpečné: `room_update` je vždy
// plný snímek (mezistavy nejsou potřeba) a animace jsou čistě vizuální – nespuštěná
// animace po sobě nenechá nic, na co by se čekalo.
function createAnimQueue(opts = {}) {
    // Práh smí být i FUNKCE – vyhodnotí se při každém měření. Potřebuje to Opuštěný důl
    // (Fistful): pod ním je každý let do odhozu delší o výdrž s překlopením na rub, takže
    // by dvě odhozené karty za sebou fixní práh přelezly a fronta by je zahodila – tedy
    // přesně tu animaci, kvůli které karta existuje.
    const _maxLagOpt = opts.maxLagMs ?? 1400;
    const maxLagMs   = () => (typeof _maxLagOpt === 'function' ? _maxLagOpt() : _maxLagOpt);
    const setTimer   = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t));
    const onDrop     = opts.onDrop || null;   // diagnostika: kolik animací se zahodilo

    const items = [];      // čekající položky v pořadí příjmu
    let timer = null;      // doběh právě přehrávané animace
    let busyMs = 0;        // její odhadované trvání (počítá se do zaostání)
    let pumping = false;   // reentrance guard (commit stavu může sám něco zařadit)

    // Kolik času má fronta ČEKAJÍCÍ (bez právě přehrávané animace) a z kolika animací.
    function waiting() {
        let ms = 0, n = 0;
        for (const it of items) if (it.kind === 'anim') { ms += it.est; n++; }
        return { ms, n };
    }

    // Totéž, ale jen ze ZAHODITELNÝCH animací – `essential` se nezahazuje, takže se ani
    // nesmí počítat do zaostávání (jinak by dlouhá cinematika sama vyvolala zahození
    // ostatních jen tím, že čeká ve frontě).
    function waitingDroppable() {
        let ms = 0, n = 0;
        for (const it of items) if (it.kind === 'anim' && !it.essential) { ms += it.est; n++; }
        return { ms, n };
    }

    // Zaostáváme? Měří se jen ČEKAJÍCÍ animace, a to nejmíň dvě: jedna animace není
    // zaostávání, ať trvá jakkoli dlouho (smrt s plnou rukou letí přes sekundu a musí
    // se přehrát celá – ne se zahodit jen proto, že sama přesáhne limit).
    function isLagging() {
        const w = waitingDroppable();
        return w.n > 1 && w.ms > maxLagMs();
    }

    // Odhad, jak dlouho bude trvat, než se fronta vyprázdní (vč. běžící animace).
    function pendingMs() { return busyMs + waiting().ms; }

    // Zaostáváme moc → čekající animace zahoď a nech jen poslední stav (plný snímek).
    // `essential` animace (cinematika vyřazení hráče) přežijí v původním pořadí – nechávají
    // za sebou lokálně upravený stav a čeká na ně i server, zahodit je nelze.
    function dropToLastState() {
        let dropped = 0, lastState = null;
        const keep = [];
        for (const it of items) {
            if (it.kind !== 'anim') { lastState = it; continue; }
            if (it.essential) keep.push(it);
            else dropped++;
        }
        items.length = 0;
        for (const it of keep) items.push(it);
        if (lastState) items.push(lastState);
        if (dropped && onDrop) onDrop(dropped);
    }

    function pump() {
        if (pumping || timer) return;   // běží animace → počkej na její konec
        pumping = true;
        try {
            while (items.length) {
                const it = items.shift();
                if (it.kind === 'state') { it.commit(); continue; }
                busyMs = it.est;
                it.run();
                if (it.est > 0) {
                    timer = setTimer(() => { timer = null; busyMs = 0; pump(); }, it.est);
                    return;
                }
                busyMs = 0;   // animace bez vlastního času (nic nedrží) → hned dál
            }
        } finally {
            pumping = false;
        }
    }

    function push(item) {
        items.push(item);
        if (isLagging()) dropToLastState();
        pump();
    }

    return {
        // run() spustí animaci, est = její odhadované trvání v ms (0 = fronta nečeká).
        // opts.essential = animace se nesmí zahodit ani při zaostávání fronty.
        pushAnim(run, est, opts) {
            push({ kind: 'anim', run, est: Math.max(0, Math.round(est) || 0), essential: opts?.essential === true });
        },
        // commit() aplikuje stav; zavolá se, až doběhne vše, co mu předcházelo.
        pushState(commit) { push({ kind: 'state', commit }); },
        // Odchod ze hry / nová hra: zahoď všechno rozdělané (nic se nedocommituje).
        reset() { if (timer) clearTimer(timer); timer = null; busyMs = 0; items.length = 0; },
        pendingMs,
        size: () => items.length,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createAnimQueue };
}
