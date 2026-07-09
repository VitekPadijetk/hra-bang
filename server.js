const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const { GameState } = require('./logic.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname));

const cardData = JSON.parse(fs.readFileSync('cards.json', 'utf8'));
// Karty rozšíření Dodge City (přidají se do balíčku jen když je rozšíření zapnuté).
const dodgeCityCardData = JSON.parse(fs.readFileSync('cards.dodge_city.json', 'utf8'));

// ── Multi-game state & room service ─────────────────────────────────────────
// Sdílený kontext serveru. Room service (server/rooms.js) vlastní rooms Map
// a vystaví room helpery zpět na ctx; ostatní moduly/handlery je berou z ctx.
const ctx = { io, cardData, dodgeCityCardData, GameState };
require('./server/rooms.js')(ctx);
require('./server/ledger.js')(ctx);   // ledger chování (dedukce rolí boty) – před handlery
const { rooms, makeRoom, roomPayload, broadcastRoom, broadcastRoomDelayed,
        broadcastLobbyList, getLobbyList, getGameList, findRoomBySocket,
        leaveRoom } = ctx;
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
    console.log(`🔌 ${socket.id}`);

    socket.emit('lobby_list', getLobbyList());
    socket.emit('game_list', getGameList());

    function withRoom(cb) {
        const room = findRoomBySocket(socket.id);
        if (!room) return;
        const p = room.players.find(pl => pl.socketId === socket.id);
        if (!p) return;
        cb(room, p, room.gameState);
    }

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
    console.log('');
    console.log('🎮 Bang! server běží!');
    console.log(`   Lokálně:  http://localhost:${PORT}`);
    console.log(`   Přes LAN: http://${lan}:${PORT}`);
    console.log('');
});