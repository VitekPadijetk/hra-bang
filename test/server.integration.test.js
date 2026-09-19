const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameState, Card, CardType } = require('../logic.js');

const installRoomService = require('../server/rooms.js');
const installIntroService = require('../server/intro.js');
const installAnimService = require('../server/anim.js');
const installLifecycle = require('../server/lifecycle.js');
const registerLobby = require('../server/handlers.lobby.js');
const registerNextGame = require('../server/handlers.nextgame.js');
const registerGame = require('../server/handlers.game.js');
const registerCharacters = require('../server/handlers.characters.js');
const registerDebug = require('../server/handlers.debug.js');

const cardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.json', 'utf8'));
const highNoonCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.high_noon.json', 'utf8'));
const fistfulCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.fistful.json', 'utf8'));
const wwsCardData = JSON.parse(fs.readFileSync(__dirname + '/../cards.divoky_zapad.json', 'utf8'));

before(() => { console.log = () => {}; });

// Plnohodnotnější mock io + socket, který umí vyvolat zaregistrované handlery.
function mkEnv() {
    const sockets = new Map();
    // io.to(kanál) doručuje jen socketům, které v kanálu SKUTEČNĚ jsou (join/leave) –
    // jinak by odhlášení diváka nešlo otestovat.
    const io = {
        sockets: { sockets },
        emit() {},
        to(channel) {
            return {
                emit(ev, payload) {
                    for (const s of sockets.values()) {
                        if (s.rooms.has(channel)) s.emit(ev, payload);
                    }
                },
            };
        },
    };
    const ctx = { io, cardData, highNoonCardData, fistfulCardData, wwsCardData, GameState };
    installRoomService(ctx);
    installIntroService(ctx);
    installAnimService(ctx);
    installLifecycle(ctx);

    function mkSocket(id) {
        const handlers = {};
        const socket = {
            id,
            rooms: new Set([id]),          // jako reálný socket.io: vlastní kanál + join/leave
            on(ev, fn) { handlers[ev] = fn; },
            emit() {},
            join(r) { socket.rooms.add(r); },
            leave(r) { socket.rooms.delete(r); },
            fire(ev, ...args) { if (handlers[ev]) handlers[ev](...args); },
            handlers,
        };
        sockets.set(id, socket);
        function withRoom(cb) {
            const room = ctx.findRoomBySocket(socket.id);
            if (!room) return;
            const p = room.players.find(pl => pl.socketId === socket.id);
            if (!p) return;
            cb(room, p, room.gameState);
        }
        registerLobby(socket, ctx, withRoom);
        registerNextGame(socket, ctx, withRoom);
        registerGame(socket, ctx, withRoom);
        registerCharacters(socket, ctx, withRoom);
        registerDebug(socket, ctx, withRoom);
        return socket;
    }
    return { ctx, io, mkSocket };
}

test('create_room handler skutečně vytvoří místnost (resolved všechny ctx reference)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    s.fire('create_room', { name: 'Stůl', maxPlayers: 4, playerName: 'Alice', options: {} });
    assert.equal(ctx.rooms.size, 1);
    const room = [...ctx.rooms.values()][0];
    assert.equal(room.players[0].name, 'Alice');
});

// Počet hráčů z klienta se ořezává na 3–8. Bez toho by šlo socketem vyrobit místnost
// s počtem, pro který rolesForPlayerCount vrací prázdné pole (role undefined → hra by
// hned vyhlásila „Bandité vyhráli").
test('create_room ořeže nesmyslný počet hráčů na povolený rozsah', () => {
    const cases = [[99, 8], [1, 3], [0, 3], [-5, 3], [8, 8], [3, 3], ['x', 4], [undefined, 4]];
    for (const [asked, want] of cases) {
        const { ctx, mkSocket } = mkEnv();
        mkSocket('s1').fire('create_room', { name: 'Stůl', maxPlayers: asked, playerName: 'Alice', options: {} });
        const room = [...ctx.rooms.values()][0];
        assert.equal(room.maxPlayers, want, `maxPlayers ${asked} → ${want}`);
    }
});

test('join_room handler přidá druhého hráče', () => {
    const { ctx, mkSocket } = mkEnv();
    const s1 = mkSocket('s1');
    s1.fire('create_room', { name: 'Stůl', maxPlayers: 4, playerName: 'Alice', options: {} });
    const room = [...ctx.rooms.values()][0];
    const s2 = mkSocket('s2');
    s2.fire('join_room', { roomId: room.id, playerName: 'Bob' });
    assert.equal(room.players.length, 2);
    assert.equal(room.players[1].name, 'Bob');
});

// Divák nesedí v room.players, takže ho z kanálu '<roomId>_spectators' nic nevyhodilo –
// po návratu do menu mu chodily další room_update a klient ho překlopil zpátky do hry.
test('leave_spectate odhlásí diváka – další broadcast už mu nechodí', () => {
    const { ctx, mkSocket } = mkEnv();
    const s1 = mkSocket('s1');
    s1.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    room.phase = 'playing';

    const spec = mkSocket('spec');
    const seen = [];
    spec.emit = (ev) => seen.push(ev);

    spec.fire('spectate', { roomId: room.id });
    assert.ok(spec.rooms.has(room.id + '_spectators'), 'divák je v kanálu');
    ctx.broadcastRoom(room);
    assert.equal(seen.filter(e => e === 'room_update').length, 2);   // vstupní + broadcast

    spec.fire('leave_spectate');
    assert.equal(spec.rooms.has(room.id + '_spectators'), false, 'divák je z kanálu venku');
    assert.ok(seen.includes('spectate_left'));

    ctx.broadcastRoom(room);
    assert.equal(seen.filter(e => e === 'room_update').length, 2, 'po odhlášení už nic nechodí');
});

test('spectate jiné hry odhlásí z předchozí (nekouká do dvou najednou)', () => {
    const { ctx, mkSocket } = mkEnv();
    mkSocket('s1').fire('debug_start', { playerCount: 3, roles: [] });
    mkSocket('s2').fire('debug_start', { playerCount: 3, roles: [] });
    const [a, b] = [...ctx.rooms.values()];
    a.phase = 'playing'; b.phase = 'playing';

    const spec = mkSocket('spec');
    spec.fire('spectate', { roomId: a.id });
    spec.fire('spectate', { roomId: b.id });
    assert.equal(spec.rooms.has(a.id + '_spectators'), false);
    assert.ok(spec.rooms.has(b.id + '_spectators'));
});

test('join_room odhlásí diváka ze sledované hry (vlastní hra vítězí)', () => {
    const { ctx, mkSocket } = mkEnv();
    mkSocket('s1').fire('debug_start', { playerCount: 3, roles: [] });
    const watched = [...ctx.rooms.values()][0];
    watched.phase = 'playing';

    const spec = mkSocket('spec');
    spec.fire('spectate', { roomId: watched.id });
    spec.fire('create_room', { name: 'Můj stůl', maxPlayers: 4, playerName: 'Alice', options: {} });
    assert.equal(spec.rooms.has(watched.id + '_spectators'), false);
});

test('debug_start handler rozjede debug hru (resolved makeRoom/cardData/setupDebugGame)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    s.fire('debug_start', { playerCount: 3, roles: [] });
    assert.equal(ctx.rooms.size, 1);
    const room = [...ctx.rooms.values()][0];
    assert.equal(room.gameState.isDebug, true);
    assert.equal(room.gameState.players.length, 3);
});

// Vizuální slot karty na stole se posílá v JEDNOTNÉ konvenci „slot 0 = zbraň" –
// i když hráč zbraň nemá (na svém stole tam má výchozí Colt .45). Přepočet pro
// soupeře bez zbraně dělá klient (getBoardPos v net/handlers.js). Dřív posílal server
// index bez zbraňového slotu a krádež/odhoz z vlastního stolu letěla o kartu vedle.
test('animace karty ze stolu posílá slot v konvenci „0 = zbraň" i bez zbraně', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    gs.players[1].weapon = { id: -1 };                       // žádná zbraň
    gs.players[1].board = [{ id: 991, name: 'Barel', type: 'Barel' }];
    gs.phase = 'SELECTING_TARGET_CARD';
    gs.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: 'Cat Balou' };
    room._pendingPanicCard = { type: 'catbalou_sequence', attackerIdx: 0, targetIdx: 1, cardId: 990 };

    s.fire('select_target_card', { attackerIdx: 0, area: 'board', cardIdx: 0 });
    const a = anims.find(x => x.type === 'catbalou_sequence');
    assert.ok(a, 'animace catbalou_sequence se musí odeslat');
    assert.equal(a.boardIdx, 1);   // board[0] = slot 1 (slot 0 patří zbrani/Coltu)
});

// Krádež/odhoz z RUKY bere NÁHODNOU kartu – animace proto musí nést i slot, ze kterého
// karta odešla (stolenIndex). Klient podle něj kartu odebere z ruky a rozehraje let z
// jejího místa; dřív mizela vždy poslední (u vlastní ruky viditelně špatná karta).
test('panika z ruky posílá stolenIndex = slot vzaté karty', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    const hand = [{ id: 801 }, { id: 802 }, { id: 803 }, { id: 804 }];
    gs.players[1].hand = hand.map(c => ({ ...c, name: 'X', type: 'Bang!' }));
    gs.players[0].hand = [];
    gs.phase = 'SELECTING_TARGET_CARD';
    gs.pendingSelection = { attackerIdx: 0, targetIdx: 1, sourceCardType: 'Panika!' };
    room._pendingPanicCard = { type: 'panic_sequence', attackerIdx: 0, targetIdx: 1, cardId: 990 };

    s.fire('select_target_card', { attackerIdx: 0, area: 'hand', cardIdx: null });
    const a = anims.find(x => x.type === 'panic_sequence');
    assert.ok(a, 'animace panic_sequence se musí odeslat');
    // Ukradená karta je teď poslední v ruce útočníka – stolenIndex ukazuje na její
    // původní slot v ruce oběti (ne slepě na poslední).
    const stolenId = gs.players[0].hand[gs.players[0].hand.length - 1].id;
    assert.equal(a.stolenIndex, hand.findIndex(c => c.id === stolenId));
    assert.ok(a.stolenIndex >= 0 && a.stolenIndex < 4);
});

test('dělení karet mezi Vulture Samy: ragtime_steal z ruky nese stolenIndex', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    const dead = gs.players[2];
    dead.health = 0;
    dead.hand = [{ id: 811, name: 'A', type: 'Bang!' }, { id: 812, name: 'B', type: 'Bang!' }, { id: 813, name: 'C', type: 'Bang!' }];
    gs.players[0].hand = [];
    gs.phase = 'SELECTING_TARGET_CARD';
    gs.pendingSelection = { attackerIdx: 0, targetIdx: 2, sourceCardType: 'Panika!', ignoreDistance: true, isVultureSplit: true };
    gs.pendingVultureSplit = { deadIdx: 2, pickers: [0, 1], next: 0 };

    s.fire('select_target_card', { attackerIdx: 0, area: 'hand', cardIdx: null });
    const a = anims.find(x => x.type === 'ragtime_steal');
    assert.ok(a, 'animace ragtime_steal se musí odeslat');
    const stolenId = gs.players[0].hand[gs.players[0].hand.length - 1].id;
    assert.equal(a.stolenIndex, [811, 812, 813].indexOf(stolenId));
});

test('end_turn / chat handlery běží bez chyby (game + lobby modul)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    // singleChar hra: create + start → rovnou playing
    s.fire('create_room', { name: 'X', maxPlayers: 3, playerName: 'A', options: { singleChar: true } });
    const room = [...ctx.rooms.values()][0];
    const s2 = mkSocket('s2'); s2.fire('join_room', { roomId: room.id, playerName: 'B' });
    const s3 = mkSocket('s3'); s3.fire('join_room', { roomId: room.id, playerName: 'C' });
    s.fire('start_game');
    assert.equal(room.gameState.players.length, 3);
    // tyto handlery musí projít bez ReferenceError
    s.fire('chat_message', { text: 'ahoj' });
    s.fire('end_turn');
    assert.ok(true);
});

// Start hry se zapnutým rozšířením chvíli čeká na art u všech hráčů. Po tu dobu se
// v lobby nesmí nic pohnout: pořadí u stolu se losuje až těsně před startem (jinak by
// se hráčům seznam přeskládal pod rukama) a druhý klik na „Zahájit hru" se zahazuje
// (jinak by přepsal čekání a hra by po vypršení limitu nastartovala dvakrát).
test('start_game: pořadí se losuje až po assetech a druhý klik se zahodí', () => {
    const { ctx, mkSocket } = mkEnv();
    const s1 = mkSocket('s1');
    s1.fire('create_room', { name: 'X', maxPlayers: 3, playerName: 'A',
                             options: { expansions: { high_noon: true } } });
    const room = [...ctx.rooms.values()][0];
    mkSocket('s2').fire('join_room', { roomId: room.id, playerName: 'B' });
    mkSocket('s3').fire('join_room', { roomId: room.id, playerName: 'C' });

    const orderBefore = room.players.map(p => p.name);
    s1.fire('start_game');
    assert.equal(room.assetsWaiting, true, 'čeká se na art rozšíření');
    assert.equal(room.phase, 'lobby');
    assert.deepEqual(room.players.map(p => p.name), orderBefore, 'v lobby se pořadí nepřeskládá');

    const cb = room._assetWaitCb, timer = room._assetWaitTimer;
    s1.fire('start_game');   // druhý klik během čekání
    assert.equal(room._assetWaitCb, cb, 'druhý klik nepřepíše čekání na assety');
    assert.equal(room._assetWaitTimer, timer, 'a nenechá viset druhý timer');
    clearTimeout(room._assetWaitTimer);
});

// Lobby tlačítko je bez plného stolu zamčené, ale klik mohl odejít těsně předtím, než
// někdo odešel – server proto start sám nepustí (stejně jako check_start_next).
test('start_game: neplný stůl hru nespustí', () => {
    const { ctx, mkSocket } = mkEnv();
    const s1 = mkSocket('s1');
    s1.fire('create_room', { name: 'X', maxPlayers: 4, playerName: 'A', options: { singleChar: true } });
    const room = [...ctx.rooms.values()][0];
    mkSocket('s2').fire('join_room', { roomId: room.id, playerName: 'B' });
    mkSocket('s3').fire('join_room', { roomId: room.id, playerName: 'C' });
    s1.fire('start_game');
    assert.equal(room.phase, 'lobby');
    mkSocket('s4').fire('join_room', { roomId: room.id, playerName: 'D' });
    s1.fire('start_game');
    assert.equal(room.gameState.players.length, 4, 's plným stolem už startuje');
});

// Lucky Duke: obě odkryté karty musí do odhozu doletět PŘED výsledkem checku (vězení/
// dynamit), jinak výsledná karta dosedne na hromádku první a ty dvě se přes ni přehrají.
// Server proto posílá vlastní animaci `lucky_duke_result` (nese, která karta byla vybraná)
// a teprve za ní výsledek – fronta na klientu to pak přehraje v tomhle pořadí.
test('lucky_duke_pick: nejdřív lucky_duke_result (s chosenId), pak výsledek checku', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;

    const jail = { id: 950, name: 'Vězení', type: 'Vězení' };
    gs.players[0].board = [jail];
    gs.phase = 'LUCKY_DUKE';
    gs.luckyDukeState = {
        cards: [{ id: 941, suit: '♠️', value: '3' }, { id: 942, suit: '♥️', value: '7' }],
        checkContext: { reason: 'JAIL', playerIdx: 0, boardIdx: 0, checksLeft: 1, active: false },
    };

    s.fire('lucky_duke_pick', 1);          // srdce → z vězení ven
    const iRes = anims.findIndex(a => a.type === 'lucky_duke_result');
    const iJail = anims.findIndex(a => a.type === 'board_to_discard');
    assert.ok(iRes !== -1, 'lucky_duke_result se musí odeslat');
    assert.ok(iJail !== -1, 'odlet vězení do odhozu se musí odeslat');
    assert.ok(iRes < iJail, 'odkryté karty odlétají dřív než výsledek checku');
    assert.equal(anims[iRes].chosenId, 942);
    assert.deepEqual(anims[iRes].otherIds, [941]);   // s Podkovou (ZH) jich je víc
    assert.equal(anims[iJail].cardId, jail.id);
});

// Debug hra rozdává postavy vlastní cestou (debug_select_char), a ta dřív skákala rovnou
// na handleStartOfTurnChecks. `_beginTurn` se tím na PRVNÍM tahu vůbec nespustil, takže
// se `_sheriffTurns` nezapočítalo a první událost High Noon / Fistfulu se odkryla až na
// TŘETÍM tahu šerifa místo na druhém.
test('debug hra počítá kola událostí od prvního tahu (High Noon/Fistful)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    s.fire('debug_start', {
        playerCount: 4, roles: ['Sheriff', 'Outlaw', 'Outlaw', 'Renegade'],
        highNoon: true, fistful: true,
    });
    const gs = [...ctx.rooms.values()][0].gameState;
    assert.ok(gs.eventDeck.length > 0, 'balíček událostí se připravil');
    gs.players.forEach((p, i) => s.fire('debug_select_char', { playerIdx: i, charName: 'Paul Regret' }));

    assert.equal(gs._sheriffTurns, 1, 'první tah se započítal');
    assert.equal(gs.activeEvent, null, 'na prvním tahu se ještě nic neodkrývá');

    // Druhý tah šerifa (u stolu jsou čtyři) už událost odkryje.
    const start = gs.eventDeck.length;
    for (let i = 0; i < 4; i++) gs.nextTurn();
    assert.equal(gs.currentPlayerIndex, gs._firstPlayerIndex());
    assert.equal(gs._sheriffTurns, 2);
    assert.ok(gs.activeEvent, 'karta High Noon je ve hře');
    assert.equal(gs.eventDeck.length, start - 1);
    assert.ok(gs.activeFistful, 'a karta Fistfulu taky');
});

// Bug 26: pravidla odmítnutou akci mlčky ignorují (karta zůstane v ruce), animace se ale
// emitovala BEZ ohledu na výsledek – karta odletěla do odhozu a s příštím stavem se
// vrátila do ruky. Vypadalo to jako bliknutí („zahrál jsem jinou kartu než tu vynucenou
// Právem západu a ona se vrátila"). Teď se animace emituje až podle výsledku.
test('odmítnutá karta se neanimuje (Želízka: špatná barva → žádný let)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, data) => { if (ev === 'card_animation') anims.push(data); };
    s.fire('debug_start', { playerCount: 3, roles: [] });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;
    gs.activeEvent = highNoonCardData.find(c => c.key === 'ZELIZKA');

    gs.phase = 'PLAY';
    gs.currentPlayerIndex = 0;
    gs.players[0]._handcuffsSuit = '♥️';
    gs.players[0].hand = [{ id: 900, name: 'Bang!', type: 'Bang!', suit: '♠️', value: '5' },
                          { id: 901, name: 'Panika!', type: 'Panika!', suit: '♠️', value: '5' }];
    gs.players[0].weapon = { id: -1, name: 'Colt .45', props: { range: 1 } };

    s.fire('play_bang', { attackerIdx: 0, targetIdx: 1, cardIdx: 0 });
    assert.equal(gs.players[0].hand[0].id, 900, 'pravidla kartu odmítla – zůstala v ruce');
    assert.deepEqual(anims, [], 'a nic neletělo');

    s.fire('play_special', { attackerIdx: 0, targetIdx: 1, cardIdx: 1 });
    assert.equal(gs.players[0].hand.length, 2, 'Panika! taky neprošla');
    assert.deepEqual(anims, [], 'ani tady nic neletělo');

    // Kontrola z druhé strany: karta správné barvy projde a animace se pošle.
    gs.players[0].hand[0] = { id: 902, name: 'Bang!', type: 'Bang!', suit: '♥️', value: '5' };
    s.fire('play_bang', { attackerIdx: 0, targetIdx: 1, cardIdx: 0 });
    assert.ok(anims.some(a => a.type === 'hand_to_discard' && a.cardId === 902),
        'povolená karta se animuje jako dřív');
});

// Debug hra: jeden socket ovládá všechna sedadla, takže `find` podle socketId vrací pořád
// první – do chatu psal věčně Debug1 a Roubík pokutoval jeho, ne toho, kdo právě hraje.
// Mluví ten, na koho hra čeká.
test('chat v debug hře mluví za sedadlo, na které se čeká', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const said = [];
    s.emit = (ev, msg) => { if (ev === 'chat_message') said.push(msg.name); };
    s.fire('debug_start', { playerCount: 3 });
    const gs = [...ctx.rooms.values()][0].gameState;
    gs.phase = 'PLAY';
    gs.currentPlayerIndex = 2;
    s.fire('chat_message', { text: 'ahoj' });
    gs.currentPlayerIndex = 0;
    s.fire('chat_message', { text: 'nazdar' });
    // Každá zpráva dojde třikrát – všechna tři sedadla visí na tomtéž socketu.
    assert.equal(said[0], 'Debug3');
    assert.equal(said[said.length - 1], 'Debug1');
});

// Bug 67: za posledním líznutím Dostavníku / Wells Farga jde do fronty cinematika
// odkrytí karty Divokého západu (4,6 s) a stav čeká až za ní – karta by se majiteli
// objevila v ruce teprve po ní. Server mu proto k poslednímu líznutí přibalí i DATA
// karty (`stageCard`) a klient si ji položí do ruky rovnou. Ostatním jde pořád jen rub,
// takže se nic neprozradí.
test('poslední líznutí Dostavníku nese majiteli i data karty (stageCard)', () => {
    const { ctx, mkSocket } = mkEnv();
    const s = mkSocket('s1');
    const anims = [];
    s.emit = (ev, payload) => { if (ev === 'card_animation') anims.push(payload); };
    s.fire('debug_start', { playerCount: 3, divokyZapad: true });
    const room = [...ctx.rooms.values()][0];
    const gs = room.gameState;
    gs.phase = 'PLAY';
    gs.currentPlayerIndex = 0;
    const me = gs.players[0];
    me.hand.push(new Card(9001, 'Dostavník', CardType.STAGECOACH, 'Srdce', 'A'));
    gs.playCard(me.hand.length - 1);
    assert.equal(gs.phase, 'DRAW');
    assert.equal(gs.drawPhaseState.wwsFlip, true);

    s.fire('draw_card', { source: 'deck' });
    s.fire('draw_card', { source: 'deck' });

    const draws = anims.filter(a => a.type === 'draw');
    assert.equal(draws.length, 2);
    assert.equal(draws[0].stageCard, undefined, 'první líznutí nic nestaguje – stav dorazí včas');
    assert.ok(gs.activeWws, 'druhé líznutí kartu události otočilo');
    assert.ok(draws[1].stageCard, 'poslední líznutí nese data karty');
    assert.equal(draws[1].stageCard.id, draws[1].cardId);
    assert.ok(me.hand.some(c => c.id === draws[1].stageCard.id), 'a je to opravdu karta v jeho ruce');
});

// ── Další hra: účast (S12 / S13, docs/menu-ui-plan.md D8) ──────────────────────
// Místnost po konci hry: čtyři hráči přes skutečné handlery, stav hry s vítězem.
// Emity socketů se zaznamenávají (`emits[id]`), ať jde poznat, kdo šel do menu.
function endedRoom(options = {}) {
    const env = mkEnv();
    const socks = ['s1', 's2', 's3', 's4'].map(id => env.mkSocket(id));
    socks[0].fire('create_room', { name: 'Stůl', maxPlayers: 4, playerName: 'Alice', options, token: 'tok-Alice' });
    const room = [...env.ctx.rooms.values()][0];
    ['Bob', 'Cyril', 'Dana'].forEach((n, i) =>
        socks[i + 1].fire('join_room', { roomId: room.id, playerName: n, token: 'tok-' + n }));
    room.phase = 'playing';
    room.gameState = { winner: 'Zákon vyhrál!', players: room.players.map((p, i) => (
        { name: p.name, role: i ? 'Outlaw' : 'Sheriff', character: 'Bart Cassidy', health: i === 1 ? 0 : 2 })) };
    const emits = {};
    socks.forEach(s => { emits[s.id] = []; s.emit = (ev, payload) => emits[s.id].push({ ev, payload }); });
    const who = (id) => room.players.find(p => p.socketId === id);
    return { ...env, room, socks, emits, who };
}

test('next_join / next_leave: přihlášení jedním kliknutím, lídr se odhlásit nemůže', () => {
    const { room, socks: [s1, s2], who, emits } = endedRoom();
    s2.fire('next_join');
    assert.equal(who('s2').wantsNext, true);
    assert.ok(emits.s3.some(e => e.ev === 'room_update'), 'ostatní se to dozví hned');
    s2.fire('next_leave');
    assert.equal(who('s2').wantsNext, null, 'odhlášený je zase mezi rozhodujícími se');
    s1.fire('next_join');
    s1.fire('next_leave');
    assert.equal(who('s1').wantsNext, true, 'lídr hru zahájí, nebo zruší – neodhlašuje se');
    // Lobby další hry: stav hry je pořád ten vyhraný, přihlašovat se tam ale už nejde.
    room.phase = 'next_lobby';
    s2.fire('next_join');
    assert.equal(who('s2').wantsNext, null);
});

test('next_start: bez tří přihlášených nic; pak kdo se nepřihlásil, jde do menu a zbytek do lobby další hry', () => {
    const { ctx, room, socks: [s1, s2, s3, s4], emits } = endedRoom();
    s2.fire('next_join');
    s1.fire('next_start');   // lídr + Bob = 2
    assert.equal(room.phase, 'playing', 'málo přihlášených → start neprojde');
    assert.equal(room.players.length, 4);

    s3.fire('next_join');
    s3.fire('next_start');   // start smí jen lídr
    assert.equal(room.phase, 'playing');

    s1.fire('next_start');   // lídr (i nepřihlášený – startem hraje) + Bob + Cyril = 3
    assert.equal(room.phase, 'next_lobby');
    assert.deepEqual(room.players.map(p => p.name), ['Alice', 'Bob', 'Cyril']);
    assert.deepEqual(room.players.map(p => p.playerIdx), [0, 1, 2]);
    assert.ok(room.players.every(p => p.wasOriginalSurvivor), 'S9: „chce dál ✅"');
    assert.ok(room.players.every(p => p.wantsNext === null));
    assert.ok(emits.s4.some(e => e.ev === 'go_to_menu'), 'Dana se nerozhodla → menu');
    assert.equal(s4.rooms.has(room.id), false, 'a opustila kanál místnosti');
    assert.equal(ctx.findRoomBySocket('s4'), null);
    assert.ok(!emits.s2.some(e => e.ev === 'go_to_menu'));
    assert.ok(ctx.getLobbyList().some(r => r.id === room.id), 'místnost je znovu v seznamu S6');
});

test('next_start s plným stolem rovnou startuje navazující hru', () => {
    const { room, socks: [s1, s2, s3, s4] } = endedRoom({ singleChar: true });
    [s2, s3, s4].forEach(s => s.fire('next_join'));
    const before = room.gameState;
    s1.fire('next_start');
    assert.notEqual(room.gameState, before, 'nová hra');
    assert.ok(['char_select', 'playing'].includes(room.phase));
    assert.equal(room.gameState.players.length, 4);
    assert.ok(!room.gameState.winner);
    assert.ok(room.players.every(p => p.wantsNext === null && !p.wasOriginalSurvivor), 'stav účasti se po startu nuluje');
    s1.fire('next_start');   // opožděný druhý klik – už není konec hry
    assert.equal(room.gameState.players.length, 4);
});

test('check_start_next startuje jen z lobby další hry s plným stolem', () => {
    const { room, socks: [s1, s2, s3] } = endedRoom({ singleChar: true });
    s1.fire('check_start_next');
    assert.equal(room.phase, 'playing', 'z konce hry ne – tam je next_start');
    [s2, s3].forEach(s => s.fire('next_join'));
    s1.fire('next_start');
    assert.equal(room.phase, 'next_lobby');
    s1.fire('check_start_next');
    assert.equal(room.phase, 'next_lobby', 'neplný stůl');
});

// Token je klíč k místu po výpadku (rejoin) – kdo by znal cizí, převzal by ho.
test('room_update neposílá tokeny hráčů', () => {
    const { ctx, room } = endedRoom();
    assert.ok(room.players.every(p => p.token), 'server je drží');
    const sent = ctx.roomPayload(room, 0).players;
    assert.ok(sent.every(p => !('token' in p)));
    assert.deepEqual(sent.map(p => p.name), ['Alice', 'Bob', 'Cyril', 'Dana']);
});
