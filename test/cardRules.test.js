const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getActionForCard } = require('../core/cardRules.js');

test('Bang! spustí akci SHOOT', () => {
    assert.equal(getActionForCard({ type: 'Bang!' }, 'Bart Cassidy'), 'SHOOT');
});

test('Calamity Janet smí střílet i kartou Vedle!', () => {
    assert.equal(getActionForCard({ type: 'Vedle!' }, 'Calamity Janet'), 'SHOOT');
});

test('Vedle! u jiné postavy NENÍ SHOOT (je to obyčejná karta)', () => {
    assert.equal(getActionForCard({ type: 'Vedle!' }, 'Bart Cassidy'), 'PLAY_CARD');
});

test('cílené karty vrací svůj vlastní typ', () => {
    for (const type of ['Panika!', 'Cat Balou', 'Duel', 'Vězení']) {
        assert.equal(getActionForCard({ type }, 'Kdokoli'), type);
    }
});

test('modré karty vrací PLAY_BLUE', () => {
    for (const type of ['Zbraň', 'Barel', 'Vybavení', 'Dynamit']) {
        assert.equal(getActionForCard({ type }, 'Kdokoli'), 'PLAY_BLUE');
    }
});

test('ostatní karty vrací PLAY_CARD', () => {
    for (const type of ['Pivo', 'Dostavník', 'Kulomet', 'Indiáni!', 'Salon']) {
        assert.equal(getActionForCard({ type }, 'Kdokoli'), 'PLAY_CARD');
    }
});
