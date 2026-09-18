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
