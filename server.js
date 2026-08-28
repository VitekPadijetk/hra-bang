const express = require('express');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const { GameState } = require('./logic.js');
const { pendingActor } = require('./core/pending.js');

const app = express();
const server = http.createServer(app);

// Komprese websocketů. Stav hry chodí jako JSON a při KAŽDÉM broadcastu všem hráčům
// (jeden room_update ~25 KB, z toho 10 KB je zbytek balíčku; za partii jich je ~270
// na hráče, tedy ~34 MB při pěti lidech). Socket.IO má od v3 perMessageDeflate
// vypnutý; zapnutý stlačí ten payload na ~2,6 KB. Práh nechává drobné potvrzovací
// zprávy nekomprimované – u nich by režie zlibu převážila.
const io = new Server(server, { perMessageDeflate: { threshold: 1024 } });

// gzip textových odpovědí (JS/HTML/JSON je dohromady ~1,1 MB → ~250 KB). Obrázky
// middleware sám přeskočí, ty jsou komprimované už formátem.
app.use(compression());

// Localhost = vývoj: tam se assety NEcachují (jen ETag), jinak by se nově převedený
// art neprojevil ani po F5 a člověk by ladil grafiku, kterou prohlížeč vůbec nestáhl.
// Pozná se to podle hostname požadavku, ne podle env proměnné – nasazený server chodí
// na doméně, takže se konfigurovat nemusí nic.
function isLocalHost(req) {
    const h = (req && req.hostname) || '';
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
    // LAN adresa (testování na telefonu ve stejné síti) je pořád vývoj – nasazený
    // server chodí na doméně, nikdy na privátní IP.
    return /^10\./.test(h) || /^192\.168\./.test(h) ||
           /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

// express.static dává všemu max-age=0 + ETag, tedy „vždy se zeptej, obvykle dostaneš
// 304". Pro kód je to správně (nasazená verze musí být vidět hned), pro assety ne –
// těch je přes sto souborů a tahat je znovu každou session je právě to, co vyžralo
// bandwidth. Den je kompromis: pokryje „hrajeme dnes večer ještě jednou" a zároveň
// se změněný art projeví nejpozději druhý den. Delší platnost by chtěla verzi v URL,
// kterou tu bez build stepu nemáme.
app.use(express.static(__dirname, {
    setHeaders(res, filePath) {
        if (filePath.replace(/\\/g, '/').includes('/assets/')) {
            res.setHeader('Cache-Control', isLocalHost(res.req)
                ? 'no-cache'                      // vývoj: revaliduj přes ETag
                : 'public, max-age=86400');
        }
    }
}));

const cardData = JSON.parse(fs.readFileSync('cards.json', 'utf8'));
// Karty rozšíření Dodge City (přidají se do balíčku jen když je rozšíření zapnuté).
const dodgeCityCardData = JSON.parse(fs.readFileSync('cards.dodge_city.json', 'utf8'));
// Karty událostí rozšíření High Noon (samostatný balíček vedle hracího, ne do balíčku).
const highNoonCardData = JSON.parse(fs.readFileSync('cards.high_noon.json', 'utf8'));
// Karty událostí rozšíření A Fistful of Cards (druhý balíček událostí vedle High Noonu).
const fistfulCardData = JSON.parse(fs.readFileSync('cards.fistful.json', 'utf8'));
// Karty událostí rozšíření Divoký západ (třetí balíček; otáčí ho Dostavník / Wells Fargo).
const wwsCardData = JSON.parse(fs.readFileSync('cards.divoky_zapad.json', 'utf8'));

// ── Multi-game state & room service ─────────────────────────────────────────
// Sdílený kontext serveru. Room service (server/rooms.js) vlastní rooms Map
// a vystaví room helpery zpět na ctx; ostatní moduly/handlery je berou z ctx.
const ctx = { io, cardData, dodgeCityCardData, highNoonCardData, fistfulCardData, wwsCardData, GameState };
require('./server/version.js')(ctx);  // otisk nasazeného kódu (ctx.buildId) – klient podle něj pozná aktualizaci
require('./server/rooms.js')(ctx);
require('./server/gamelog.js')(ctx);  // strukturovaný herní log (JSONL na hru + konzole) – před vším ostatním
require('./server/ledger.js')(ctx);   // ledger chování (dedukce rolí boty) – před handlery
require('./server/guard.js')(ctx);    // autorizace akcí na hráče (ctx.guardedOn) – před registrací handlerů
const { rooms, makeRoom, roomPayload, broadcastRoom, broadcastRoomDelayed,
        broadcastLobbyList, getLobbyList, getGameList, findRoomBySocket,
        leaveRoom, glog } = ctx;
require('./server/intro.js')(ctx);
const { emitIntro, runIntroSequence, introStartCharPhase, introStartDeckPhase } = ctx;
require('./server/anim.js')(ctx);
const { emitAnim, emitDeathAnim, handleAutoEndTurn, handleReshuffleAndBroadcast } = ctx;
require('./server/lifecycle.js')(ctx);
const { startGame, startNextGame } = ctx;
require('./server/bots.js')(ctx);
const registerLobbyHandlers = require('./server/handlers.lobby.js');
const registerNextGameHandlers = require('./server/handlers.nextgame.js');
const registerGameHandlers = require('./server/handlers.game.js');
const registerCharacterHandlers = require('./server/handlers.characters.js');
const registerDebugHandlers = require('./server/handlers.debug.js');

// ── Connection ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    glog.system(`socket připojen: ${socket.id}`);

    // Otisk běžícího kódu – klient si ho pamatuje z prvního spojení a po reconnectu
    // porovná (změna = na server se nahrála nová verze, stránka je stará).
    socket.emit('server_version', ctx.buildId);

    socket.emit('lobby_list', getLobbyList());
    socket.emit('game_list', getGameList());

    function withRoom(cb) {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p) return;
        cb(room, p, room.gameState);
    }

    // Ingress lidských akcí: jen když v místnosti běží logovaná hra (room._logStream).
    // Aktér = seat vlastnící socket, ale u herních akcí ho zpřesníme přes pendingActor
    // (v debug módu sdílí všechny seaty jeden socket). Boti jdou přes fake socket (bots.js),
    // takže onAny je nezdvojuje. Logování nikdy neshodí server.
    socket.onAny((event, payload) => {
        try {
            if (event === 'client_log') return;   // řeší dedikovaný handler níže (glog.clientLog)
            const room = findRoomBySocket(socket.id);
            if (!room || !room._logStream) return;
            const gs = room.gameState;
            const p = room.players.find(pl => pl.socketId === socket.id);
            let idx = p ? p.playerIdx : null;
            try { const pa = pendingActor(gs); if (pa) idx = pa.idx; } catch (_) { /* ignore */ }
            glog.action(room, idx != null ? glog.actorLabel(gs, idx) : socket.id, event, payload);
        } catch (_) { /* logování nesmí shodit server */ }
    });

    // Klientská diagnostika (asset/render/notify) → složí se do logu hry, nebo server.log mimo hru.
    socket.on('client_log', (entry) => {
        try {
            const room = findRoomBySocket(socket.id);
            glog.clientLog(room, { level: entry && entry.level, msg: String(entry && entry.msg || ''), data: entry && entry.data });
        } catch (_) { /* ignore */ }
    });

    registerLobbyHandlers(socket, ctx, withRoom);
    registerNextGameHandlers(socket, ctx, withRoom);
    registerGameHandlers(socket, ctx, withRoom);
    registerCharacterHandlers(socket, ctx, withRoom);
    registerDebugHandlers(socket, ctx, withRoom);
});


const os = require('os');

function getLanIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    const lan = getLanIP();
    glog.system(`Bang! server běží – http://localhost:${PORT} (LAN http://${lan}:${PORT}) [build ${ctx.buildId}]`);
});