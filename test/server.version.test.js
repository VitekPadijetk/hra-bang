// test/server.version.test.js — otisk nasazeného kódu (server/version.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeBuildId, listSourceFiles } = require('../server/version.js');
const installVersion = require('../server/version.js');

function mkTree() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bang-build-'));
    fs.mkdirSync(path.join(root, 'core'));
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(root, 'game.js'), 'let a = 1;');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');
    fs.writeFileSync(path.join(root, 'core', 'pending.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(root, 'assets', 'bang.png'), 'binary');
    return root;
}

test('otisk je stabilní mezi voláními (restart beze změny kódu ho nemění)', () => {
    const root = mkTree();
    assert.strictEqual(computeBuildId(root), computeBuildId(root));
});

test('změna zdrojáku otisk změní', () => {
    const root = mkTree();
    const before = computeBuildId(root);
    fs.writeFileSync(path.join(root, 'core', 'pending.js'), 'module.exports = { x: 1 };');
    assert.notStrictEqual(computeBuildId(root), before);
});

test('pouhé přepsání souboru stejným obsahem otisk nemění', () => {
    const root = mkTree();
    const before = computeBuildId(root);
    fs.writeFileSync(path.join(root, 'game.js'), 'let a = 1;');   // nové mtime, stejný obsah
    assert.strictEqual(computeBuildId(root), before);
});

test('assety a lockfile se do otisku nepočítají', () => {
    const root = mkTree();
    const before = computeBuildId(root);
    fs.writeFileSync(path.join(root, 'assets', 'bang.png'), 'jiny obrazek');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":4}');
    assert.strictEqual(computeBuildId(root), before);
});

test('seznam souborů je deterministický a bere jen kód', () => {
    const root = mkTree();
    const files = listSourceFiles(root);
    assert.deepStrictEqual(files, ['game.js', 'index.html', 'core/pending.js']);
});

test('install nastaví ctx.buildId na neprázdný string', () => {
    const ctx = {};
    installVersion(ctx);
    assert.strictEqual(typeof ctx.buildId, 'string');
    assert.ok(ctx.buildId.length >= 8);
});
