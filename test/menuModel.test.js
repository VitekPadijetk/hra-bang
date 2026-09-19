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
    assert.equal(keys({}).length, 3);
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
