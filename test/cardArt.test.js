const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { artKey, valueMarkKey, suitMarkKey, distinctArtKeys } = require('../core/cardArt.js');

const cardData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.json'), 'utf8'));

test('artKey: prefix art_ nebo null', () => {
    assert.equal(artKey({ art: 'bang' }), 'art_bang');
    assert.equal(artKey({ art: 'cat_balou' }), 'art_cat_balou');
    assert.equal(artKey({}), null);
    assert.equal(artKey(null), null);
});

test('valueMarkKey: prefix value_ (i pro 10)', () => {
    assert.equal(valueMarkKey({ value: 'Q' }), 'value_Q');
    assert.equal(valueMarkKey({ value: '10' }), 'value_10');
    assert.equal(valueMarkKey({}), null);
});

test('suitMarkKey: mapuje suit na slug, neznámý → null', () => {
    assert.equal(suitMarkKey({ suit: 'HEARTS' }), 'suit_hearts');
    assert.equal(suitMarkKey({ suit: 'DIAMONDS' }), 'suit_diamonds');
    assert.equal(suitMarkKey({ suit: 'CLUBS' }), 'suit_clubs');
    assert.equal(suitMarkKey({ suit: 'SPADES' }), 'suit_spades');
    assert.equal(suitMarkKey({ suit: 'JOKER' }), null);
    assert.equal(suitMarkKey({}), null);
});

test('distinctArtKeys: unikátní, prázdné bezpečně', () => {
    assert.deepEqual(distinctArtKeys([{ art: 'bang' }, { art: 'bang' }, { art: 'pivo' }]).sort(), ['bang', 'pivo']);
    assert.deepEqual(distinctArtKeys([]), []);
    assert.deepEqual(distinctArtKeys(undefined), []);
});

test('cards.json: každá karta má art, value i známý suit (marky/art rozlišitelné)', () => {
    for (const c of cardData) {
        assert.ok(artKey(c), `karta id=${c.id} (${c.name}) nemá art`);
        assert.ok(valueMarkKey(c), `karta id=${c.id} nemá value`);
        assert.ok(suitMarkKey(c), `karta id=${c.id} má neznámý suit ${c.suit}`);
    }
    // 22 druhů artu (viz plán)
    assert.equal(distinctArtKeys(cardData).length, 22);
});
