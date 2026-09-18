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
