// server/handlers.menu.js — herní menu (☰ ve hře): pauza a hlášení chyb (bugy 73, 76).
//
// PAUZA (jen game leader): `room.paused = { by, at }`. Nic jiného se nemění – hru
// zastaví to, že guard (server/guard.js) během pauzy zahodí každou herní akci a tick
// botů (server/bots.js) se nespustí. Prohlížet, zvětšovat karty, otevřít obchod
// i psát do chatu jde dál, to jsou věci klienta, které server nic nestojí.
// Pauza nastoupí MEZI akcemi: rozběhnuté serverové timeouty (dojezd cinematiky,
// odložený broadcast, automatické ukončení tahu po smrti) se nechají doběhnout,
// jinak by se klient a server rozešli uprostřed animace.
//
// Pozastavit nejde během intra a výběru postav – tam se postupuje přes handlery
// výběru (handlers.nextgame.js), které guard nehlídá, a intro jede samo na časovačích.
const { pendingActor } = require('../core/pending.js');

module.exports = function registerMenuHandlers(socket, ctx) {
    const { rooms, broadcastRoom } = ctx;

    // Lídr místnosti: hrající lídr je v room.players, lídr hry jen botů je divák
    // (není mezi hráči), proto se hledá podle leaderSocketId napřímo.
    function leaderRoom() {
        for (const [, r] of rooms) if (r.leaderSocketId === socket.id && !r._closed) return r;
        return null;
    }

    // Důvod, proč teď pozastavit nejde, nebo null.
    function pauseBlocker(room) {
        const gs = room.gameState;
        if (room.phase !== 'playing' || !gs) return 'hra neběží';
        if (gs.winner) return 'hra skončila';
        if (room._introPlaying) return 'běží úvod hry';
        const pa = pendingActor(gs);
        if (pa && (pa.kind === 'CHARACTER_SELECT' || pa.kind === 'KEEP_CHOICE')) return 'vybírají se postavy';
        return null;
    }

    socket.on('pause_game', (data) => {
        const room = leaderRoom();
        if (!room) return;
        const want = !!(data && data.paused);
        if (want === !!room.paused) return;
        if (want) {
            const why = pauseBlocker(room);
            if (why) { socket.emit('join_error', { title: 'Hru teď nejde pozastavit', hint: why }); return; }
            const lp = room.players.find(p => p.socketId === socket.id);
            room.paused = { by: lp ? lp.name : 'Game leader', at: Date.now() };
            ctx.glog.system(`⏸ hra pozastavena (${room.paused.by})`, { roomId: room.id });
        } else {
            room.paused = null;
            ctx.glog.system('▶ hra pokračuje', { roomId: room.id });
        }
        broadcastRoom(room);
        // Boti se po pauze rozjedou sami: tick se během ní nenaplánoval (scheduleBotTick).
        if (!room.paused) ctx.scheduleBotTick?.(room);
    });

    socket.on('bug_report', (data) => {
        const res = ctx.saveBugReport ? ctx.saveBugReport(socket, data) : { ok: false, error: 'Hlášení nejsou zapnutá.' };
        socket.emit('bug_report_result', res.ok ? { ok: true } : { ok: false, error: res.error });
    });
};
