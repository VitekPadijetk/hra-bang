// server/ledger.js — „ledger chování" místnosti: veřejný záznam, kdo na koho útočil
// / koho léčil. Boti z něj (přes core/beliefs.js) DEDUKUJÍ skryté role – útoky/léčení
// jsou v Bangu veřejné, takže sbírat je NENÍ cheat (skryté zůstávají jen role a ruce).
//
// Žije na `room.behaviorLedger` (mimo broadcastovaný gameState – klient ho nepotřebuje).
// Čistě aditivní počítadla dvojic (actor -> target): { hostile, support }. Žádná pravidla.
//
// Factory installLedger(ctx): vystaví initLedger/recordBehavior na ctx.
module.exports = function installLedger(ctx) {
    function initLedger(room) {
        if (room) room.behaviorLedger = { pairs: {} };
    }

    // entry = { actorIdx, targetIdx, kind: 'hostile' | 'support' }
    function recordBehavior(room, entry) {
        if (!room || !entry) return;
        const { actorIdx, targetIdx } = entry;
        if (actorIdx == null || targetIdx == null || actorIdx === targetIdx) return;
        if (!room.behaviorLedger) initLedger(room);
        const pairs = room.behaviorLedger.pairs;
        const row = pairs[actorIdx] || (pairs[actorIdx] = {});
        const cell = row[targetIdx] || (row[targetIdx] = { hostile: 0, support: 0 });
        if (entry.kind === 'support') cell.support++;
        else cell.hostile++;
    }

    // Divoký západ – Lady Růže z Texasu: sedadlo je klíč ledgeru na OBOU úrovních
    // (kdo jednal i na koho), takže se výměna míst musí promítnout sem – jinak by bot
    // po přesednutí přisuzoval chování špatnému hráči a dedukoval podle staré mapy.
    // Ledger žije na `room`, ne ve stavu hry, takže ho `_swapSeats` (logic/wildWest.js)
    // přemapovat nemůže a volá se odsud, ze socket handleru.
    function swapLedgerSeats(room, i, j) {
        const pairs = room && room.behaviorLedger && room.behaviorLedger.pairs;
        if (!pairs || i === j) return;
        const m = (k) => (k === String(i) ? String(j) : (k === String(j) ? String(i) : k));
        const out = {};
        Object.keys(pairs).forEach(a => {
            const row = {};
            Object.keys(pairs[a]).forEach(t => { row[m(t)] = pairs[a][t]; });
            out[m(a)] = row;
        });
        room.behaviorLedger.pairs = out;
    }

    Object.assign(ctx, { initLedger, recordBehavior, swapLedgerSeats });
    return ctx;
};
