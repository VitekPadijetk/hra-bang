const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../core/menuModel');

test('esc: escapuje HTML i uvozovky', () => {
    assert.equal(M.esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
    assert.equal(M.esc("O'Neil & spol."), 'O&#39;Neil &amp; spol.');
    assert.equal(M.esc(null), '');
});

test('czPlural: 1 / 2–4 / 0 a 5+', () => {
    const f = n => M.czPlural(n, 'hra', 'hry', 'her');
    assert.deepEqual([0, 1, 2, 4, 5, 11].map(f), ['her', 'hra', 'hry', 'hry', 'her', 'her']);
});

test('waitingGamesLabel: nula má vlastní větu, jinak se skloňuje', () => {
    assert.equal(M.waitingGamesLabel(0), 'Žádné hry nečekají na hráče');
    assert.equal(M.waitingGamesLabel(1), '1 hra čeká na hráče');
    assert.equal(M.waitingGamesLabel(3), '3 hry čekají na hráče');
    assert.equal(M.waitingGamesLabel(5), '5 her čeká na hráče');
});

test('runningGamesLabel: nula má vlastní větu, jinak se skloňuje', () => {
    assert.equal(M.runningGamesLabel(0), 'Žádná hra právě neběží');
    assert.equal(M.runningGamesLabel(1), '1 hra právě běží');
    assert.equal(M.runningGamesLabel(2), '2 hry právě běží');
    assert.equal(M.runningGamesLabel(7), '7 her právě běží');
});

test('waitingGamesCount: plné stoly se nepočítají', () => {
    const list = [
        { playerCount: 2, maxPlayers: 5 },
        { playerCount: 5, maxPlayers: 5 },
        { playerCount: 0, maxPlayers: 3 },
    ];
    assert.equal(M.waitingGamesCount(list), 2);
    assert.equal(M.waitingGamesCount(null), 0);
});

test('initialsOf: dva znaky velkými, bez prefixu bota, emoji se nepůlí', () => {
    assert.equal(M.initialsOf('calamity'), 'CA');
    assert.equal(M.initialsOf('🤖 Bot 1'), 'BO');
    assert.equal(M.initialsOf(''), '?');
    assert.equal(M.initialsOf('😀x'), '😀X');
});

test('clampName: tvrdý limit 18 znaků', () => {
    assert.equal(M.clampName('a'.repeat(25)).length, M.NAME_MAX);
    assert.equal(M.clampName('Honza'), 'Honza');
});

test('nameError: prázdné, obsazené, v pořádku', () => {
    assert.equal(M.nameError('   ', []), 'Jméno nesmí být prázdné.');
    assert.equal(M.nameError('Calamity', ['Calamity']), 'Jméno »Calamity« je již obsazeno.');
    assert.equal(M.nameError('Honza', ['Calamity']), null);
});

// ── Nastavení hry (S5, S11) ────────────────────────────────────────────────

test('emptyExpansions: všechna rozšíření z MENU_EXPANSIONS, všechna vypnutá', () => {
    const e = M.emptyExpansions();
    assert.deepEqual(Object.keys(e), M.MENU_EXPANSIONS.map(x => x.key));
    assert.ok(Object.values(e).every(v => v === false));
    assert.notEqual(M.emptyExpansions(), e, 'pokaždé nový objekt – přepínače se nesmí sdílet');
});

test('MENU_EXPANSIONS: každé rozšíření, které zná server, má kartu s nápovědou', () => {
    // Klíče čte server v options.expansions (logic/setup.js); nové rozšíření bez karty
    // by v menu nešlo zapnout.
    const keys = M.MENU_EXPANSIONS.map(x => x.key);
    for (const k of ['dodge_city', 'high_noon', 'fistful', 'divoky_zapad', 'zlata_horecka']) {
        assert.ok(keys.includes(k), k);
    }
    assert.ok(M.MENU_EXPANSIONS.every(x => x.label && x.hint));
});

test('přibalené karty: jen High Noon bez Fistfulu', () => {
    assert.equal(M.hnExtraVisible({ high_noon: true }), true);
    assert.equal(M.hnExtraVisible({ high_noon: true, fistful: true }), false);
    assert.equal(M.hnExtraVisible({ fistful: true }), false);
    assert.equal(M.hnExtraVisible(null), false);
    const keys = exps => M.visibleAdvancedOptions(exps).map(o => o.key);
    assert.ok(keys({ high_noon: true }).includes('highNoonExtra'));
    assert.ok(!keys({}).includes('highNoonExtra'));
    assert.equal(keys({}).length, 4);
    // Stínoví pistolníci jdou i bez Zlaté horečky (pravidla to výslovně dovolují).
    assert.ok(keys({}).includes('shadowGunslingers'));
});

test('advancedSummary: počítá jen viditelné volby a skloňuje', () => {
    assert.equal(M.advancedSummary({}, {}), '· vše výchozí');
    assert.equal(M.advancedSummary({ singleChar: true }, {}), '· 1 zapnutá');
    assert.equal(M.advancedSummary({ singleChar: true, rotatingSheriff: true }, {}), '· 2 zapnuté');
    // Schované přibalené karty (High Noon vypnutý) se nehlásí jako zapnutá volba.
    assert.equal(M.advancedSummary({ highNoonExtra: true }, {}), '· vše výchozí');
    assert.equal(M.advancedSummary({ highNoonExtra: true }, { high_noon: true }), '· 1 zapnutá');
});

test('playerCountNote: 3 a 8 mají vlastní větu', () => {
    assert.match(M.playerCountNote(3), /^Město duchů/);
    assert.match(M.playerCountNote(8), /2× Odpadlík/);
    assert.equal(M.playerCountNote(5), M.playerCountNote(null));
});

test('souhrny: skloňování hráčů a botů, výčet rozšíření', () => {
    assert.equal(M.playersLabel(3), '3 hráči');
    assert.equal(M.playersLabel(5), '5 hráčů');
    assert.equal(M.botsLabel(4), '4 boti');
    assert.equal(M.botsLabel(8), '8 botů');
    assert.equal(M.expansionsLabel({}), 'základní hra');
    assert.equal(M.expansionsLabel({ high_noon: true, dodge_city: true }), 'Dodge City · High Noon');
    assert.equal(M.botGameSummary(4, { fistful: true }), '4 boti · Fistful');
});

test('createGameBlocker: říká, co chybí; jinak souhrn nastavení', () => {
    const base = { count: 5, title: 'Hra', playerName: 'Honza', exps: { dodge_city: true } };
    assert.equal(M.createGameBlocker(base), null);
    assert.equal(M.createGameSummary(base), '5 hráčů · Dodge City');
    assert.equal(M.createGameBlocker({ ...base, count: null, title: '  ' }), 'Vyber počet hráčů a zadej název.');
    assert.equal(M.createGameBlocker({ ...base, count: null }), 'Vyber počet hráčů.');
    assert.equal(M.createGameBlocker({ ...base, title: '' }), 'Zadej název hry.');
    assert.equal(M.createGameBlocker({ ...base, playerName: null }), 'Nejdřív si v menu zadej jméno.');
    assert.equal(M.createGameSummary({ ...base, title: '' }), 'Zadej název hry.');
});

test('botGameOptions: všechna rozšíření jako boolean, přibalené karty jen s High Noonem', () => {
    const o = M.botGameOptions({ high_noon: true }, true);
    assert.deepEqual(Object.keys(o.expansions), M.MENU_EXPANSIONS.map(x => x.key));
    assert.equal(o.expansions.high_noon, true);
    assert.equal(o.expansions.fistful, false);
    assert.equal(o.highNoonExtra, true);
    assert.equal(M.botGameOptions({}, true).highNoonExtra, false);
    assert.equal(M.botGameOptions(undefined, false).expansions.dodge_city, false);
    assert.equal(M.botGameOptions({}, false).shadowGunslingers, false);
    assert.equal(M.botGameOptions({}, false, true).shadowGunslingers, true);
});

// ── Seznamy her (S6, S10) a detail hry (S7) ───────────────────────────────

const item = (over = {}) => ({
    id: 'game1', name: 'Stůl', maxPlayers: 5, playerCount: 2, players: ['Calamity', '🤖 Bot 1'],
    leader: 'Calamity', next: false, expansions: [], botGame: false, ...over,
});

test('isBotName / plainName: bot se pozná podle prefixu, ikonu kreslí řádek sám', () => {
    assert.equal(M.isBotName('🤖 Bot 1'), true);
    assert.equal(M.isBotName('Bota'), false);
    assert.equal(M.plainName('🤖 Bot 1'), 'Bot 1');
    assert.equal(M.plainName('Calamity'), 'Calamity');
});

test('expansionsFromKeys: klíče ze serveru → příznaky, neznámé se přeskočí', () => {
    const e = M.expansionsFromKeys(['high_noon', 'neznamé']);
    assert.equal(e.high_noon, true);
    assert.equal(e.dodge_city, false);
    assert.equal('neznamé' in e, false);
    assert.equal(M.expansionsLabel(M.expansionsFromKeys(undefined)), 'základní hra');
});

test('roomRowView: čeká / plná / probíhá, tečky podle obsazených míst', () => {
    const wait = M.roomRowView(item(), false);
    assert.equal(wait.state, 'wait');
    assert.equal(wait.stateText, '● ČEKÁ');
    assert.equal(wait.cta, 'PŘIPOJIT');
    assert.equal(wait.count, '2 / 5');
    assert.deepEqual(wait.seats, [true, true, false, false, false]);

    const full = M.roomRowView(item({ playerCount: 5 }), false);
    assert.equal(full.state, 'full');
    assert.equal(full.cta, 'PLNÁ');

    const run = M.roomRowView(item({ playerCount: 5 }), true);
    assert.equal(run.state, 'running');
    assert.equal(run.stateText, '● PROBÍHÁ');
    assert.equal(run.cta, 'DÍVAT SE');
});

test('roomWhoLine: kdo vede, navazující hra, rozšíření (nebo základní hra)', () => {
    assert.equal(M.roomWhoLine(item(), false), 'zakládá Calamity · základní hra');
    assert.equal(M.roomWhoLine(item({ next: true, expansions: ['dodge_city', 'high_noon'] }), true),
        'hraje Calamity · navazující hra · Dodge City · High Noon');
    assert.equal(M.roomWhoLine(item({ leader: null, botGame: true }), true), 'hra jen botů · základní hra');
});

test('podtitulky seznamů: počet čekajících (bez plných) a běžících', () => {
    assert.equal(M.joinListSubtitle([item(), item({ playerCount: 5 })]), '1 hra čeká na hráče · seznam se obnovuje sám');
    assert.equal(M.joinListSubtitle([]), 'Žádné hry nečekají na hráče · seznam se obnovuje sám');
    assert.equal(M.spectateListSubtitle([item(), item()]), '2 hry právě běží · seznam se obnovuje sám');
    assert.equal(M.joinRoomSubtitle(item({ next: true })), '2 / 5 hráčů · zakládá Calamity · navazující hra');
});

test('seatRows: obsazená místa v pořadí, pak prázdná; lídr, bot a já', () => {
    const rows = M.seatRows(['Calamity', '🤖 Bot 1', 'Honza'], 4, { leader: 'Calamity', me: 'Honza' });
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map(r => r.idx), [1, 2, 3, 4]);
    assert.equal(rows[0].icon, '👑');
    assert.equal(rows[0].tag, 'Game Leader');
    assert.equal(rows[1].icon, '🤖');
    assert.equal(rows[1].name, 'Bot 1');
    assert.equal(rows[1].tag, 'bot');
    assert.equal(rows[2].icon, '🎩');
    assert.equal(rows[2].me, true);
    assert.equal(rows[2].tag, '(ty)');
    assert.equal(rows[3].empty, true);
});

test('joinRoomBlocker: zmizelá a plná hra přebijí jméno, pak jméno, pak obsazené jméno', () => {
    assert.equal(M.joinRoomBlocker(null, 'Honza', []).kind, 'gone');
    assert.equal(M.joinRoomBlocker(item({ playerCount: 5 }), null, []).kind, 'full');
    assert.equal(M.joinRoomBlocker(item(), null, []).kind, 'name');
    assert.equal(M.joinRoomBlocker(item(), 'Calamity', []).kind, 'taken');
    assert.equal(M.joinRoomBlocker(item(), 'Honza', ['Honza']).kind, 'taken');
    assert.equal(M.joinRoomBlocker(item(), 'Honza', ['Doc']), null);
});

// ── Lobby (S8, S9) ─────────────────────────────────────────────────────────

const lobby = (over = {}) => Object.assign({
    roomName: 'Saloon', roomPhase: 'lobby', leaderSocketId: 'L', maxPlayers: 5,
    players: [
        { socketId: 'L', name: 'Calamity' },
        { socketId: 'b1', name: '🤖 Bot 1', isBot: true },
        { socketId: 'H', name: 'Honza', wasOriginalSurvivor: true },
    ],
    options: { expansions: { dodge_city: true, high_noon: true } },
    assetsWaiting: false,
}, over);

test('lobbyTitle / lobbySubtitle: počet a rozšíření, další hra má vlastní nadpis', () => {
    assert.equal(M.lobbyTitle(lobby()), 'Saloon');
    assert.equal(M.lobbyTitle(lobby({ roomPhase: 'next_lobby' })), 'Další hra: Saloon');
    assert.equal(M.lobbySubtitle(lobby()), '3 / 5 hráčů · Dodge City · High Noon');
    assert.equal(M.lobbySubtitle(lobby({ options: {} })), '3 / 5 hráčů · základní hra');
});

test('lobbySeatRows: lídr a já podle socketId, lídr spravuje boty a prázdná místa', () => {
    const asLeader = M.lobbySeatRows(lobby(), 'L');
    assert.equal(asLeader.length, 5);
    assert.equal(asLeader[0].icon, '👑');
    assert.equal(asLeader[0].me, true);
    assert.equal(asLeader[0].tag, '(ty) · Game Leader');
    assert.equal(asLeader[1].removeId, 'b1');
    assert.equal(asLeader[2].removeId, null);
    assert.deepEqual(asLeader.slice(3).map(r => [r.empty, r.addBot]), [[true, true], [true, true]]);

    const asGuest = M.lobbySeatRows(lobby(), 'H');
    assert.equal(asGuest[2].me, true);
    assert.equal(asGuest[1].removeId, null, 'bota odebírá jen lídr');
    assert.equal(asGuest[3].addBot, false, 'bota přidává jen lídr');
    assert.equal(asGuest[2].tag, '(ty)', 'v první hře se „chce dál" neukazuje');
});

test('lobbySeatRows: v lobby další hry „chce dál ✅" u toho, kdo přešel z minulé hry', () => {
    const rows = M.lobbySeatRows(lobby({ roomPhase: 'next_lobby' }), 'L');
    assert.equal(rows[2].tag, 'chce dál ✅');
    assert.equal(rows[0].tag, '(ty) · Game Leader');
});

test('lobbyNotice: volné místo skloňuje a boty nabízí jen lídrovi', () => {
    assert.equal(M.lobbyNotice(lobby(), true).text,
        'Hra začne, až bude stůl plný — chybí 2 hráči. Můžeš je doplnit boty.');
    assert.equal(M.lobbyNotice(lobby({ maxPlayers: 4 }), false).text,
        'Hra začne, až bude stůl plný — chybí 1 hráč. Game Leader ho může doplnit botem.');
    assert.match(M.lobbyNotice(lobby({ maxPlayers: 8 }), true).text, /chybí 5 hráčů/);
    assert.equal(M.lobbyNotice(lobby({ maxPlayers: 3 }), true), null);
});

test('lobbyNotice: vždy jedna – art rozšíření > volné místo > přeživší v další hře', () => {
    const next = { roomPhase: 'next_lobby' };
    assert.match(M.lobbyNotice(lobby({ ...next, maxPlayers: 3, assetsWaiting: true }), true).text, /karty rozšíření/);
    assert.match(M.lobbyNotice(lobby(next), true).text, /chybí 2 hráči/);
    assert.equal(M.lobbyNotice(lobby({ ...next, maxPlayers: 3 }), true).ico, '🎭');
});

test('lobbyStartButton: zamčené říká proč; klik a čekání na art zamykají', () => {
    assert.deepEqual(M.lobbyStartButton(lobby(), false), { label: '▶ ZAHÁJIT HRU (stůl není plný)', can: false });
    assert.deepEqual(M.lobbyStartButton(lobby({ maxPlayers: 3 }), false), { label: '▶ ZAHÁJIT HRU', can: true });
    assert.equal(M.lobbyStartButton(lobby({ maxPlayers: 3 }), true).can, false);
    assert.equal(M.lobbyStartButton(lobby({ maxPlayers: 3, assetsWaiting: true }), false).label, 'ZAHAJUJI…');
    assert.equal(M.lobbyStartEvent(lobby()), 'start_game');
    assert.equal(M.lobbyStartEvent(lobby({ roomPhase: 'next_lobby' })), 'check_start_next');
});

test('lobbyWaitText: čekání na art > plný stůl > doplnění', () => {
    assert.equal(M.lobbyWaitText(lobby()), 'Čeká se na Game Leadera…');
    assert.equal(M.lobbyWaitText(lobby({ roomPhase: 'next_lobby' })), 'Čeká se na doplnění hráčů a Game Leadera…');
    assert.match(M.lobbyWaitText(lobby({ maxPlayers: 3 })), /^Stůl je plný/);
    assert.match(M.lobbyWaitText(lobby({ maxPlayers: 3, assetsWaiting: true })), /karty rozšíření/);
});

test('roomRulesLabel: zapnuté pokročilé volby, přibalené karty jen s High Noonem bez Fistfulu', () => {
    assert.equal(M.roomRulesLabel({}), '');
    assert.equal(M.roomRulesLabel({ rotatingSheriff: true, singleChar: true }), 'postavy náhodně · rotující šerif');
    assert.equal(M.roomRulesLabel({ highNoonExtra: true, expansions: { high_noon: true } }), 'přibalené karty High Noonu');
    assert.equal(M.roomRulesLabel({ highNoonExtra: true, expansions: { high_noon: true, fistful: true } }), '');
});

// ── Konec hry (S12), statistiky (S14), vyhození (S15) ──

const pl = (name, role, extra = {}) => ({ name, role, health: 2, character: 'Bart Cassidy', stats: {
    cardsUsed: {}, bangsFired: 0, bangsHit: 0, damageDealt: 0, damageTaken: 0,
    weaponsCycled: 0, cardsDrawn: 0, cardsPlayed: 0, cardsDiscarded: 0 }, ...extra });

test('playerWon: strana vyhrává i s mrtvými, odpadlík jen jako poslední živý', () => {
    const table = [pl('A', 'Sheriff'), pl('B', 'Deputy', { health: 0 }), pl('C', 'Outlaw', { health: 0 }),
        pl('D', 'Renegade', { health: 0 }), pl('E', 'Renegade')];
    assert.deepEqual(table.map(p => M.playerWon(p, 'Zákon vyhrál!', table)), [true, true, false, false, false]);
    assert.deepEqual(table.map(p => M.playerWon(p, 'Bandité vyhráli!', table)), [false, false, true, false, false]);
    assert.deepEqual(table.map(p => M.playerWon(p, 'Odpadlík vyhrál!', table)), [false, false, false, false, true]);
});

test('playerWon: stínový odpadlík vyhrává se stranou, ke které se přidal', () => {
    const table = [{ name: 'S', role: 'Sheriff', health: 3 }, { name: 'O', role: 'Outlaw', health: 0 },
                   { name: 'R', role: 'Renegade', health: 0, _shadowSide: 'Deputy' }];
    // Hra pro 3 je jen bez šerifa – tady šerif je, takže jede klasika.
    assert.equal(M.playerWon(table[2], 'Zákon vyhrál!', table), true);
    assert.equal(M.playerWon(table[2], 'Bandité vyhráli!', table), false);
    assert.equal(M.playerWon({ ...table[2], _shadowSide: 'Outlaw' }, 'Bandité vyhráli!', table), true);
});

test('playerWon: hra pro 3 podle role, Divoký západ podle jména', () => {
    const three = [pl('A', 'Deputy'), pl('B', 'Outlaw'), pl('C', 'Renegade')];
    assert.deepEqual(three.map(p => M.playerWon(p, 'Bandita vyhrál!', three)), [false, true, false]);
    const table = [pl('A', 'Sheriff'), pl('B', 'Outlaw'), pl('C', 'Outlaw')];
    assert.deepEqual(table.map(p => M.playerWon(p, 'C vyhrál!', table)), [false, false, true]);
    assert.equal(M.playerWon(table[0], null, table), false);
});

// ── Další hra: účast (S12 čipy, S13) – D8 ──

const roomPl = (name, socketId, wantsNext = null, extra = {}) => ({ name, socketId, wantsNext, ...extra });

test('nextRoster: páruje podle jména, kdo odešel z místnosti, je out; lídr a já podle socketId', () => {
    const game = [pl('Honza', 'Sheriff'), pl('🤖 Bot 1', 'Outlaw'), pl('Kitty', 'Renegade'), pl('Ringo', 'Outlaw')];
    const room = [roomPl('Honza', 'H', true), roomPl('🤖 Bot 1', 'B1', true, { isBot: true }),
        roomPl('Ringo', 'R', null, { disconnected: true })];
    const r = M.nextRoster(game, room, { leaderSocketId: 'H', mySocketId: 'R' });
    assert.deepEqual(r.map(x => [x.name, x.initials, x.status]), [
        ['Honza', 'HO', 'in'], ['Bot 1', 'BO', 'in'], ['Kitty', 'KI', 'out'], ['Ringo', 'RI', 'wait'],
    ]);
    assert.deepEqual(r.map(x => x.leader), [true, false, false, false]);
    assert.deepEqual(r.map(x => x.me), [false, false, false, true]);
    assert.deepEqual(r.map(x => x.bot), [false, true, false, false]);
    assert.equal(r[3].away, true, 'odpojený (hraje za něj bot)');
    assert.equal(r[2].leader, false, 'kdo odešel, není ničím – ani „já" bez socketId');
    assert.equal(M.nextRowTag(r[0]), 'Game Leader');
    assert.equal(M.nextRowTag(r[3]), '(ty) · odpojen');
    assert.equal(M.nextRowTag(r[1]), 'bot');
});

const roster = (...st) => st.map((status, i) => ({ status, me: false, name: 'P' + i }));

test('nextTally: total bez odešlých, start od NEXT_MIN_PLAYERS přihlášených', () => {
    assert.equal(M.NEXT_MIN_PLAYERS, 3);
    assert.deepEqual(M.nextTally(roster('in', 'in', 'wait', 'out')),
        { in: 2, wait: 1, out: 1, total: 3, missing: 1, canStart: false });
    assert.equal(M.nextTally(roster('in', 'in', 'in')).canStart, true);
    assert.equal(M.nextTally(roster('in', 'in', 'in')).missing, 0);
});

test('nextGameSummary: kolik je v další hře, a dokud je málo, kolik je potřeba', () => {
    assert.equal(M.nextGameSummary(roster('in', 'in', 'in', 'wait', 'out')), '3 hráči jsou v další hře · 1 se rozhoduje · 1 odešel');
    assert.equal(M.nextGameSummary(roster('in', 'in', 'in', 'in', 'in')), '5 hráčů je v další hře');
    assert.equal(M.nextGameSummary(roster('in', 'wait', 'wait')),
        'Na další hru jsou potřeba alespoň 3 hráči · zatím 1 přihlášený · 2 se rozhodují');
    assert.equal(M.nextGameSummary(roster('wait', 'wait', 'out', 'out')),
        'Na další hru jsou potřeba alespoň 3 hráči · zatím nikdo · 2 se rozhodují · 2 odešli');
});

test('endGameView: „Chci další hru" rovnou přihlašuje; lídr ruší hru, divák jen odchází', () => {
    const leader = M.endGameView({ leader: true });
    assert.equal(leader.primary.act, 'nextJoin');
    assert.deepEqual(leader.exit, { label: '✕ Zrušit hru', act: 'cancelGame', danger: true });
    assert.equal(M.endGameView({}).primary.act, 'nextJoin');
    assert.equal(M.endGameView({}).exit.act, 'toMenu');
    // Přihlášený, který se vrátil ze S13 (◀ Zpět), jde hlavní akcí zpátky na S13.
    assert.equal(M.endGameView({ joined: true }).primary.act, 'nextOpen');
    const spec = M.endGameView({ spectator: true, leader: true });
    assert.equal(spec.primary.act, 'toMenu');
    assert.equal(spec.exit, null);
});

test('nextGameView: přihlášený hráč – zelený pruh, odhlásit se, bez startu', () => {
    const r = roster('in', 'in', 'wait', 'out');
    r[1].me = true;
    const v = M.nextGameView(r, { maxPlayers: 4 });
    assert.equal(v.headline, 'Chybí hráči do další hry');
    assert.equal(v.sub, '1 hráč se ještě rozhoduje · kdo neodpoví, do hry nejde');
    assert.equal(v.count, 2);
    assert.equal(v.total, 3);
    assert.deepEqual(v.bar, [true, true, false]);
    assert.equal(v.joined, true);
    assert.equal(v.joinedText, '✅ Jsi v další hře. Čeká se na 1 hráče.');
    assert.equal(v.canLeave, true);
    assert.equal(v.start, null);
    assert.deepEqual(v.exit, { label: 'Opustit hru', act: 'toMenu', danger: false });
    assert.equal(v.headSub, 'Jsi přihlášený — čeká se na ostatní');
});

test('nextGameView: nepřihlášený hráč dostane „Chci hrát dál"', () => {
    const r = roster('in', 'wait', 'wait');
    r[2].me = true;
    const v = M.nextGameView(r, { maxPlayers: 3 });
    assert.equal(v.joined, false);
    assert.equal(v.canLeave, false);
    assert.equal(v.headSub, 'Zatím nejsi přihlášený');
    assert.equal(v.sub, '2 hráči se ještě rozhodují · kdo neodpoví, do hry nejde');
    assert.equal(v.bar.length, 3, 'segmentů aspoň tolik, kolik je potřeba');
});

test('nextGameView: lídr – start zamčený, dokud nejsou tři; pak s poznámkou o volných místech', () => {
    const few = roster('in', 'in', 'wait');
    few[0].me = true;
    const a = M.nextGameView(few, { leader: true, maxPlayers: 4 });
    assert.deepEqual(a.start, { label: '▶ ZAHÁJIT DALŠÍ HRU (chybí 1)', can: false });
    assert.equal(a.canLeave, false, 'lídr se neodhlašuje – hru zahájí, nebo zruší');
    assert.deepEqual(a.exit, { label: '✕ Zrušit hru', act: 'cancelGame', danger: true });
    assert.equal(a.note, null);

    const ok = roster('in', 'in', 'in', 'out');
    ok[0].me = true;
    const b = M.nextGameView(ok, { leader: true, maxPlayers: 4 });
    assert.deepEqual(b.start, { label: '▶ ZAHÁJIT DALŠÍ HRU (3 hráči)', can: true });
    assert.equal(b.headline, 'Další hra může začít');
    assert.equal(b.sub, 'Všichni se rozhodli.');
    assert.equal(b.joinedText, '✅ Jsi v další hře. Všichni se rozhodli — můžeš zahájit.');
    assert.equal(b.headSub, 'Jsi přihlášený — hru zahajuješ ty');
    assert.equal(b.note, 'Volné místo u stolu doplníš v lobby další hry.');

    const full = roster('in', 'in', 'in', 'in', 'in');
    full[0].me = true;
    assert.equal(M.nextGameView(full, { leader: true, maxPlayers: 5 }).note, null, 'plný stůl startuje rovnou');
    assert.deepEqual(M.nextGameView(full, { leader: true, maxPlayers: 5, starting: true }).start,
        { label: 'ZAHAJUJI…', can: false });
});

test('statsRow + topCardsLabel: přesnost v procentech, tři nejčastější karty', () => {
    const p = pl('Honza', 'Sheriff');
    Object.assign(p.stats, { bangsFired: 9, bangsHit: 6, cardsUsed: { 'Bang!': 9, Pivo: 4, Barel: 1, Kolt: 2 } });
    const r = M.statsRow(p);
    assert.equal(r.hit, '6 (67 %)');
    assert.equal(r.top, 'Bang!×9, Pivo×4, Kolt×2');
    assert.equal(r.sheriff, true);
    assert.equal(M.statsRow(pl('X', 'Outlaw', { character: null })).hit, '0');
    assert.equal(M.statsRow(pl('X', 'Outlaw', { character: null })).character, '–');
    assert.equal(M.topCardsLabel({}), '–');
});

test('statsTotalsLabel: součty přes všechny hráče', () => {
    const a = pl('A', 'Sheriff'), b = pl('B', 'Outlaw');
    Object.assign(a.stats, { bangsFired: 3, bangsHit: 2, damageDealt: 2, cardsDrawn: 10, cardsDiscarded: 4 });
    Object.assign(b.stats, { bangsFired: 1, bangsHit: 1, damageDealt: 1, cardsDrawn: 5, cardsDiscarded: 1 });
    assert.equal(M.statsTotalsLabel([a, b]), 'Bang!×4 · Zásahy×3 (75 %) · Zranění×3 · Líznuto×15 · Odhoz×5');
    assert.equal(M.statsTotalsLabel([]), 'Bang!×0 · Zásahy×0 (0 %) · Zranění×0 · Líznuto×0 · Odhoz×0');
});

test('statsGroups: strany v pořadí Zákon / Bandité / Odpadlík, souhrn s výsledkem', () => {
    const table = [pl('Ringo', 'Outlaw'), pl('Honza', 'Sheriff'), pl('Kitty', 'Renegade', { health: 0 }),
        pl('Cal', 'Deputy', { health: 0 }), pl('Bot', 'Outlaw')];
    const g = M.statsGroups(table, 'Zákon vyhrál!', 1);
    assert.deepEqual(g.map(x => x.title), ['Zákon', 'Bandité', 'Odpadlík']);
    assert.deepEqual(g.map(x => x.color), ['sheriff', 'outlaw', 'renegade']);
    assert.equal(g[0].summary, 'Šerif + Pomocníci · 2 hráči · vyhráli');
    assert.equal(g[1].summary, '2 hráči · prohráli');
    assert.equal(g[2].summary, '1 hráč · prohrál');
    assert.deepEqual(g[0].rows.map(r => [r.name, r.me]), [['Honza', true], ['Cal', false]]);
});

test('statsGroups: dva odpadlíci – vyhrát může jen jeden; hra pro 3 po rolích', () => {
    const eight = [pl('S', 'Sheriff', { health: 0 }), pl('R1', 'Renegade', { health: 0 }), pl('R2', 'Renegade')];
    const ren = M.statsGroups(eight, 'Odpadlík vyhrál!').find(x => x.color === 'renegade');
    assert.equal(ren.title, 'Odpadlíci');
    assert.equal(ren.summary, '2 hráči · vyhrál R2');
    const three = [pl('A', 'Deputy'), pl('B', 'Outlaw'), pl('C', 'Renegade')];
    const g = M.statsGroups(three, 'Pomocník vyhrál!');
    assert.deepEqual(g.map(x => `${x.title}: ${x.summary}`),
        ['Pomocník: 1 hráč · vyhrál', 'Bandita: 1 hráč · prohrál', 'Odpadlík: 1 hráč · prohrál']);
});

test('statsGroups: hráč s neznámou rolí nezmizí', () => {
    const g = M.statsGroups([pl('A', 'Sheriff'), pl('B', undefined)], 'Zákon vyhrál!');
    assert.deepEqual(g.map(x => x.title), ['Zákon', 'Ostatní']);
});

test('kickedView: druhý řádek radí, hlavní akce vede k hraní (divák ke sledování)', () => {
    const v = M.kickedView('Game leader ukončil hru.');
    assert.equal(v.title, 'Game Leader ukončil hru.');
    assert.match(v.hint, /^Stůl se rozpustil\. Můžeš se přidat/);
    assert.deepEqual(v.next, { label: 'Najít jinou hru', screen: 'join_list' });
    assert.match(M.kickedView('Game leader opustil hru.').hint, /^Bez něj/);
    assert.equal(M.kickedView(null, { spectator: true }).next.screen, 'spectate_list');
    assert.equal(M.kickedView(null).title, 'Game Leader ukončil hru.');
});

// ── Celoplošné vrstvy a debug (fáze 7) ────────────────────────────────────

test('loadingView: procenta se ořezávají, opravné kolo místo nich hlásí soubory', () => {
    assert.deepEqual(M.loadingView({ pct: 0.624 }), { pct: 62, label: '62 %', text: 'Načítám karty a postavy…' });
    assert.equal(M.loadingView().pct, 0);
    assert.equal(M.loadingView({ pct: 2 }).pct, 100);
    assert.equal(M.loadingView({ pct: -1 }).pct, 0);
    const rep = M.loadingView({ pct: 1, missing: 3 });
    assert.equal(rep.label, '');
    assert.equal(rep.text, 'Dotahuji 3 soubory…');
    assert.equal(M.loadingView({ pct: 1, missing: 1 }).text, 'Dotahuji 1 soubor…');
    assert.equal(M.loadingView({ pct: 1, missing: 7 }).text, 'Dotahuji 7 souborů…');
});

test('connLostView: u stolu slibuje místo, v menu ne; pokus se počítá až od prvního', () => {
    assert.match(M.connLostView(true, 1).hint, /místo u stolu zůstává zabrané/);
    assert.doesNotMatch(M.connLostView(false, 1).hint, /stolu/);
    assert.equal(M.connLostView(true, 0).note, 'Připojuji…');
    assert.equal(M.connLostView(true, 3).note, '3. pokus o připojení');
});

test('joinErrorView: { title, hint } i starší holý řetězec', () => {
    assert.deepEqual(M.joinErrorView({ title: 'A', hint: 'B' }), { title: 'A', hint: 'B' });
    assert.deepEqual(M.joinErrorView('Hra je plná'), { title: 'Do hry se nepodařilo připojit', hint: 'Hra je plná' });
    assert.equal(M.joinErrorView({ hint: 'B' }).title, 'Do hry se nepodařilo připojit');
    assert.equal(M.joinErrorView(null), null);
});

test('debugStats: čtyři dlaždice, odpojení a pomalá odezva svítí červeně', () => {
    const on = M.debugStats({ connected: true, pingMs: 38, build: 'abcdef1234', waiting: 2, running: 1 });
    assert.deepEqual(on.map(d => d.value), ['připojen', '38 ms', '2 čeká · 1 běží', 'abcdef1']);
    assert.deepEqual(on.map(d => d.tone), ['ok', 'text', 'text', 'muted']);
    const off = M.debugStats({ connected: false, pingMs: null, build: null, waiting: 0, running: 0 });
    assert.deepEqual(off.map(d => d.value), ['odpojen', '—', '0 čeká · 0 běží', '—']);
    assert.deepEqual(off.map(d => d.tone), ['bad', 'muted', 'text', 'muted']);
    assert.equal(M.debugStats({ connected: true, pingMs: 400 })[1].tone, 'bad');
});

test('debugRolesLabel: role česky v pořadí zadání, prázdno = náhodné', () => {
    assert.equal(M.debugRolesLabel([]), '(náhodné)');
    assert.equal(M.debugRolesLabel(), '(náhodné)');
    assert.equal(M.debugRolesLabel(['Sheriff', 'Outlaw']), 'Šerif, Bandita');
});

test('debugStartPayload: klíče rozšíření se překládají na camelCase serveru', () => {
    const exps = { dodge_city: true, high_noon: true, fistful: false, divoky_zapad: true, zlata_horecka: false };
    assert.deepEqual(M.debugStartPayload({ count: 5, roles: ['Sheriff'], exps, hnExtra: true }), {
        playerCount: 5, roles: ['Sheriff'],
        dodgeCity: true, highNoon: true, highNoonExtra: true,
        fistful: false, divokyZapad: true, zlataHorecka: false, shadowGunslingers: false,
    });
    assert.equal(M.debugStartPayload({ count: 4, exps: {}, shadows: true }).shadowGunslingers, true);
    // Přibalené karty bez High Noonu nedávají smysl a server by je stejně zahodil.
    assert.equal(M.debugStartPayload({ count: 3, exps: {}, hnExtra: true }).highNoonExtra, false);
    assert.deepEqual(M.debugStartPayload({ count: 3, exps: {} }).roles, []);
});

test('socketLogLine: směr, čas a jednořádkový popis', () => {
    const t = new Date(2026, 0, 2, 9, 5, 7).getTime();
    assert.deepEqual(M.socketLogLine({ t, dir: 'in', event: 'lobby_list', note: '3 položek' }),
        { time: '09:05:07', dir: '← přišlo', cls: 'in', msg: 'lobby_list · 3 položek' });
    assert.equal(M.socketLogLine({ t, dir: 'out', event: 'add_bot' }).msg, 'add_bot');
    assert.equal(M.socketLogLine({ t, dir: 'out', event: 'add_bot' }).dir, '→ odešlo');
    assert.equal(M.socketLogLine({ t, dir: '?', event: 'x' }).cls, 'sys');
});
