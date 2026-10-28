// Sdílený harness pro zátěž „hra jen botů": ctx serveru s no-op broadcasty a pumpa,
// která hru synchronně dohraje. Používá ho test/server.bots.test.js i zátěž Údolí
// stínů (test/vos.load.test.js) – ta běží ve vlastním souboru, aby se spouštěla
// souběžně s ostatními (node --test pouští soubory paralelně).
// Není to *.test.js, takže ho runner nebere jako testovací soubor – jen se requiruje.
const { mock } = require('node:test');
const fs = require('node:fs');
const { GameState } = require('../logic.js');
const { pendingActor } = require('../core/botPolicy.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));

// Synchronně dohraje hru jen botů (broadcasty jsou v buildCtx no-op).
// `onTick` (volitelný) se volá PŘED každou akcí bota – dá se jím sledovat, jakými
// fázemi hra prošla, nebo do ní zasáhnout (např. doplnit valouny, ať se protočí obchod).
//
// Timeouty serveru se spouští hned po každé akci (mock.timers): server drží některé karty
// MIMO odhoz, dokud je tam nedoveze animace (Panika, Cat Balou, Krytý vůz, Kankán –
// setTimeout v server/handlers.game.js). Při synchronním pumpování by se timeouty nikdy
// nespustily a karty by ze hry postupně mizely – po pár stech tazích v balíčku nezbyla
// jediná Panika ani Cat Balou a hra samých Duchů (Údolí stínů) neměla jak skončit.
function pumpToWinner(ctx, room, onTick) {
    let guard = 0;
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        while (!room.gameState.winner && guard++ < 8000) {
            const pa = pendingActor(room.gameState);
            if (!pa || !room.players[pa.idx]?.isBot) break;
            if (onTick) onTick(room.gameState);
            ctx.runBotTickOnce(room);
            mock.timers.runAll();
        }
    } finally { mock.timers.reset(); }
    return guard;
}

function buildCtx() {
    const sockets = new Map();
    const io = { sockets: { sockets }, emit() {}, to() { return { emit() {} }; } };
    const ctx = { io, cardData, GameState };
    require('../server/rooms.js')(ctx);
    require('../server/ledger.js')(ctx);   // ledger chování (dedukce rolí boty) – jako v server.js
    require('../server/guard.js')(ctx);    // guard „čí je tah" – ať ho boti proberou celou hrou
    // No-op broadcasty: testujeme logiku, ne vizuál. Override PŘED instalací anim/intro/
    // lifecycle/bots, aby je zachytili (a tím i handlery botů). Tím odpadnou všechny timery
    // a driver jde pumpovat synchronně (broadcastRoom = no-op ⇒ afterBroadcast se nevolá).
    ctx.broadcastRoom = () => {};
    ctx.broadcastRoomDelayed = () => {};
    ctx.broadcastLobbyList = () => {};
    require('../server/anim.js')(ctx);
    require('../server/intro.js')(ctx);
    require('../server/lifecycle.js')(ctx);
    require('../server/bots.js')(ctx);
    return ctx;
}

module.exports = { buildCtx, pumpToWinner, cardData };
