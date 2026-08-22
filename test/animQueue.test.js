// Testy prezentační fronty (core/animQueue.js). Čas si řídíme sami (fake timer),
// takže testy běží okamžitě a deterministicky.
const test = require('node:test');
const assert = require('node:assert');
const { createAnimQueue } = require('../core/animQueue');

// Minimální fake clock: setTimer/clearTimer + advance(ms) spouští splatné callbacky.
function mkClock() {
    let now = 0, id = 0;
    const timers = new Map();
    return {
        setTimer(fn, ms) { const t = ++id; timers.set(t, { at: now + ms, fn }); return t; },
        clearTimer(t) { timers.delete(t); },
        advance(ms) {
            const target = now + ms;
            for (;;) {
                let next = null, nextT = null;
                for (const [t, e] of timers) if (e.at <= target && (!next || e.at < next.at)) { next = e; nextT = t; }
                if (!next) break;
                now = next.at;
                timers.delete(nextT);
                next.fn();
            }
            now = target;
        },
    };
}

function mkQueue(clock, opts = {}) {
    return createAnimQueue({ setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...opts });
}

test('prázdná fronta: stav se commitne okamžitě (žádné zpoždění navíc)', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    q.pushState(() => log.push('state'));
    assert.deepStrictEqual(log, ['state']);
});

test('stav počká, dokud nedoběhne animace před ním', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    q.pushAnim(() => log.push('anim'), 380);
    q.pushState(() => log.push('state'));
    assert.deepStrictEqual(log, ['anim'], 'stav se nesmí projevit, dokud karta letí');
    clock.advance(379);
    assert.deepStrictEqual(log, ['anim']);
    clock.advance(1);
    assert.deepStrictEqual(log, ['anim', 'state']);
});

test('stav dorazivší SOUČASNĚ s animací (zadrhlá linka) se stejně počká', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    // Server poslal animaci i stav; klientovi se slily do jednoho okamžiku.
    q.pushAnim(() => log.push('anim'), 400);
    q.pushState(() => log.push('state'));
    clock.advance(0);
    assert.deepStrictEqual(log, ['anim']);
    clock.advance(400);
    assert.deepStrictEqual(log, ['anim', 'state']);
});

test('animace se přehrávají za sebou, ne přes sebe', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    q.pushAnim(() => log.push('a'), 300);
    q.pushAnim(() => log.push('b'), 300);
    q.pushAnim(() => log.push('c'), 300);
    assert.deepStrictEqual(log, ['a']);
    clock.advance(300);
    assert.deepStrictEqual(log, ['a', 'b']);
    clock.advance(300);
    assert.deepStrictEqual(log, ['a', 'b', 'c']);
});

test('pořadí animace → stav → animace zůstane zachované', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    q.pushAnim(() => log.push('a1'), 200);
    q.pushState(() => log.push('s1'));
    q.pushAnim(() => log.push('a2'), 200);
    q.pushState(() => log.push('s2'));
    clock.advance(200);
    assert.deepStrictEqual(log, ['a1', 's1', 'a2']);
    clock.advance(200);
    assert.deepStrictEqual(log, ['a1', 's1', 'a2', 's2']);
});

test('animace s nulovým trváním frontu nedrží', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    q.pushAnim(() => log.push('a'), 0);
    q.pushState(() => log.push('s'));
    assert.deepStrictEqual(log, ['a', 's']);
});

test('jedna DLOUHÁ animace není zaostávání – následující se nesmí zahodit', () => {
    // Smrt s plnou rukou trvá přes sekundu; kdyby se do zaostání počítala i právě
    // přehrávaná animace, přetekla by limit sama a zahodila by legitimní další animaci.
    const clock = mkClock();
    const dropped = [];
    const q = mkQueue(clock, { maxLagMs: 1400, onDrop: n => dropped.push(n) });
    const log = [];
    q.pushAnim(() => log.push('smrt'), 1210);
    q.pushAnim(() => log.push('dalsi'), 400);
    q.pushState(() => log.push('s'));
    assert.deepStrictEqual(dropped, [], 'nic se zahodit nemělo');
    clock.advance(1210);
    assert.deepStrictEqual(log, ['smrt', 'dalsi']);
    clock.advance(400);
    assert.deepStrictEqual(log, ['smrt', 'dalsi', 's']);
});

test('jediná čekající animace se nezahodí, ani když sama přesáhne maxLagMs', () => {
    const clock = mkClock();
    const dropped = [];
    const q = mkQueue(clock, { maxLagMs: 800, onDrop: n => dropped.push(n) });
    const log = [];
    q.pushAnim(() => log.push('kratka'), 300);
    q.pushAnim(() => log.push('smrt'), 1500);   // čeká sama → není zaostávání
    q.pushState(() => log.push('s'));
    assert.deepStrictEqual(dropped, []);
    clock.advance(300);
    assert.deepStrictEqual(log, ['kratka', 'smrt']);
    clock.advance(1500);
    assert.deepStrictEqual(log, ['kratka', 'smrt', 's']);
});

test('zaostávání se nekumuluje: přes maxLagMs se čekající animace zahodí a commitne poslední stav', () => {
    const clock = mkClock();
    const dropped = [];
    const q = mkQueue(clock, { maxLagMs: 700, onDrop: n => dropped.push(n) });
    const log = [];
    q.pushAnim(() => log.push('a1'), 400);   // začne hrát hned
    q.pushAnim(() => log.push('a2'), 400);
    q.pushState(() => log.push('s1'));
    q.pushAnim(() => log.push('a3'), 400);   // čekající: 400 + 400 = 800 > 700
    q.pushState(() => log.push('s2'));
    // a2 i a3 se zahodí (byly jen čekající); stavy zůstanou – jsou plné snímky
    // a jejich aplikace nic nestojí, takže dojedou hned po doběhnutí a1.
    assert.deepStrictEqual(dropped, [2]);
    clock.advance(400);
    assert.deepStrictEqual(log, ['a1', 's1', 's2']);
});

// Práh smí být FUNKCE – vyhodnotí se při každém měření, ne jen při vzniku fronty.
// Potřebuje to Opuštěný důl (Fistful): pod ním je každý let do odhozu delší, takže by
// dvě odhozené karty za sebou pevný práh přelezly a fronta by je zahodila.
test('maxLagMs smí být funkce a přepočítá se za běhu', () => {
    const clock = mkClock();
    const dropped = [];
    let limit = 700;
    const q = mkQueue(clock, { maxLagMs: () => limit, onDrop: n => dropped.push(n) });
    const log = [];
    // Zvednutý práh: stejná fronta jako v testu výš se NEzahodí.
    limit = 2000;
    q.pushAnim(() => log.push('a1'), 400);
    q.pushAnim(() => log.push('a2'), 400);
    q.pushAnim(() => log.push('a3'), 400);
    assert.deepStrictEqual(dropped, [], 'pod zvednutým prahem se nic nezahazuje');
    clock.advance(1200);
    assert.deepStrictEqual(log, ['a1', 'a2', 'a3']);

    // Práh zase dolů → stejné zaostávání už se zahodí.
    limit = 700;
    q.pushAnim(() => log.push('b1'), 400);
    q.pushAnim(() => log.push('b2'), 400);
    q.pushAnim(() => log.push('b3'), 400);
    assert.deepStrictEqual(dropped, [2]);
});

test('po zahození fronty se pokračuje normálně dál', () => {
    const clock = mkClock();
    const q = mkQueue(clock, { maxLagMs: 500 });
    const log = [];
    q.pushAnim(() => log.push('a1'), 400);   // rozehraje se hned
    q.pushAnim(() => log.push('a2'), 400);
    q.pushAnim(() => log.push('a3'), 400);   // čekající 2× 400 = 800 > 500 → a2 i a3 pryč
    q.pushState(() => log.push('s1'));
    clock.advance(400);
    assert.deepStrictEqual(log, ['a1', 's1']);
    q.pushAnim(() => log.push('a4'), 300);
    q.pushState(() => log.push('s2'));
    clock.advance(300);
    assert.deepStrictEqual(log, ['a1', 's1', 'a4', 's2']);
});

test('essential animace se při zaostávání nezahodí a udrží pořadí', () => {
    // Cinematika vyřazení hráče: nechává za sebou lokálně upravený stav (skryté karty,
    // mezifáze) a čeká na ni i server (drží boty) – zahodit se nesmí ani při zaostávání.
    const clock = mkClock();
    const dropped = [];
    const q = mkQueue(clock, { maxLagMs: 700, onDrop: n => dropped.push(n) });
    const log = [];
    q.pushAnim(() => log.push('a1'), 400);                          // hraje hned
    q.pushAnim(() => log.push('smrt'), 6000, { essential: true });   // čeká, ale nezahoditelná
    q.pushAnim(() => log.push('a2'), 400);
    q.pushAnim(() => log.push('a3'), 400);                          // 400+400 > 700 → zahodit
    q.pushState(() => log.push('s'));
    assert.deepStrictEqual(dropped, [2], 'zahodit se smí jen ta dvě obyčejná čekání');
    clock.advance(400);
    assert.deepStrictEqual(log, ['a1', 'smrt']);
    clock.advance(6000);
    assert.deepStrictEqual(log, ['a1', 'smrt', 's']);
});

test('samotná dlouhá essential animace nezahodí animace kolem sebe', () => {
    const clock = mkClock();
    const dropped = [];
    const q = mkQueue(clock, { maxLagMs: 700, onDrop: n => dropped.push(n) });
    const log = [];
    q.pushAnim(() => log.push('a1'), 300);                          // hraje hned
    q.pushAnim(() => log.push('smrt'), 6000, { essential: true });
    q.pushAnim(() => log.push('a2'), 400);
    assert.deepStrictEqual(dropped, [], 'jedna obyčejná čekající animace není zaostávání');
    clock.advance(300);
    clock.advance(6000);
    assert.deepStrictEqual(log, ['a1', 'smrt', 'a2']);
});

test('reset zahodí rozdělanou frontu (odchod ze hry) a nic nedocommituje', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    q.pushAnim(() => log.push('a'), 400);
    q.pushState(() => log.push('s'));
    q.reset();
    clock.advance(5000);
    assert.deepStrictEqual(log, ['a'], 'stav po resetu už nesmí dojet');
    assert.strictEqual(q.size(), 0);
    assert.strictEqual(q.pendingMs(), 0);
});

test('commit stavu smí sám něco zařadit (reentrance) bez rozbití pořadí', () => {
    const clock = mkClock();
    const q = mkQueue(clock);
    const log = [];
    q.pushState(() => { log.push('s1'); q.pushAnim(() => log.push('a-z-commitu'), 100); });
    q.pushState(() => log.push('s2'));
    // Animace zařazená z commitu gatuje další stav stejně jako každá jiná.
    assert.deepStrictEqual(log, ['s1', 'a-z-commitu']);
    clock.advance(100);
    assert.deepStrictEqual(log, ['s1', 'a-z-commitu', 's2']);
});

test('pendingMs počítá běžící i čekající animace, stavy ne', () => {
    const clock = mkClock();
    const q = mkQueue(clock, { maxLagMs: 100000 });
    q.pushAnim(() => {}, 400);   // běží
    q.pushState(() => {});
    q.pushAnim(() => {}, 300);
    assert.strictEqual(q.pendingMs(), 700);
    clock.advance(400);
    assert.strictEqual(q.pendingMs(), 300);
    clock.advance(300);
    assert.strictEqual(q.pendingMs(), 0);
});
