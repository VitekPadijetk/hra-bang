const test = require('node:test');
const assert = require('node:assert');
const {
    ASSET_MAX_ATTEMPTS, shouldRetryAsset, isPermanentlyMissing,
    retryAssetUrl, missingAssets
} = require('../core/assetLoad.js');

test('shouldRetryAsset: přerušené spojení (status 0) se opakuje', () => {
    assert.equal(shouldRetryAsset({ attempts: 1, status: 0 }), true);
    assert.equal(shouldRetryAsset({ attempts: 2, status: 503 }), true);
});

test('shouldRetryAsset: 4xx = soubor na serveru není → neopakovat', () => {
    assert.equal(shouldRetryAsset({ attempts: 1, status: 404 }), false);
    assert.equal(shouldRetryAsset({ attempts: 1, status: 403 }), false);
});

test('shouldRetryAsset: strop pokusů', () => {
    assert.equal(shouldRetryAsset({ attempts: ASSET_MAX_ATTEMPTS, status: 0 }), false);
    assert.equal(shouldRetryAsset({ attempts: 5, status: 0, maxAttempts: 8 }), true);
});

test('isPermanentlyMissing rozliší 404 od výpadku', () => {
    assert.equal(isPermanentlyMissing({ status: 404 }), true);
    assert.equal(isPermanentlyMissing({ status: 0 }), false);
    assert.equal(isPermanentlyMissing({ status: 500 }), false);
});

test('retryAssetUrl přidá cache-buster a nehromadí ho', () => {
    assert.equal(retryAssetUrl('assets/logo.png', 2), 'assets/logo.png?retry=2');
    assert.equal(retryAssetUrl('assets/logo.png?retry=2', 3), 'assets/logo.png?retry=3');
});

test('missingAssets: čeká na výpadky, 404 (soubor tam není) ignoruje', () => {
    const reg = {
        logo:      { url: 'a.png', kind: 'image', attempts: 1, status: 0 },
        card_back: { url: 'b.png', kind: 'image', attempts: 1, status: 0 },
        art_salon: { url: 'c.png', kind: 'image', attempts: 1, status: 404 },
        char_9:    { url: 'd.png', kind: 'image', attempts: 2, status: 503 },
        cards_data:{ url: 'cards.json', kind: 'json', attempts: 1, status: 0 },
    };
    const cache = { logo: true, cards_data: true };
    const missing = missingAssets(reg, key => !!cache[key]).sort();
    assert.deepEqual(missing, ['card_back', 'char_9']);
});

test('missingAssets: vše v cache → prázdno', () => {
    const reg = { logo: { kind: 'image', attempts: 1 }, cards_data: { kind: 'json', attempts: 1 } };
    assert.deepEqual(missingAssets(reg, () => true), []);
    assert.deepEqual(missingAssets(null, () => false), []);
});

test('missingAssets rozlišuje typ cache (image vs json)', () => {
    const reg = { cards_data: { kind: 'json', attempts: 1 }, logo: { kind: 'image', attempts: 1 } };
    const seen = [];
    missingAssets(reg, (key, kind) => { seen.push(kind); return true; });
    assert.deepEqual(seen.sort(), ['image', 'json']);
});
