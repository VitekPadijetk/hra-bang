const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cardPlayability } = require('../core/playability.js');

function P(o = {}) {
    return {
        health: o.health ?? 4,
        maxHealth: o.maxHealth ?? 4,
        character: o.character ?? null,
        role: o.role ?? 'Outlaw',
        weapon: o.weapon ?? { id: -1, name: 'Colt .45', props: { range: 1 } },
        board: o.board ?? [],
        hand: o.hand ?? [],
        bangsPlayedThisTurn: o.bangsPlayedThisTurn ?? 0,
    };
}
function S(players, opts = {}) {
    return {
        players,
        phase: opts.phase ?? 'PLAY',
        currentPlayerIndex: opts.currentPlayerIndex ?? 0,
        pendingResponse: opts.pendingResponse,
    };
}
// zkratka: hraju za hráče 0
function play(players, card, opts = {}) {
    return cardPlayability(S(players, opts), players[0], 0, card);
}

test('placeholder vrací null', () => {
    assert.equal(play([P(), P()], { _placeholder: true }), null);
});

test('mimo můj tah vrací null', () => {
    assert.equal(play([P(), P()], { type: 'Bang!' }, { currentPlayerIndex: 1 }), null);
});

// ── Fáze RESPOND ────────────────────────────────────────────────────────────
test('RESPOND: Pivo zachrání při posledním životě (>2 živí)', () => {
    const players = [P({ health: 1 }), P(), P()];
    const opts = { phase: 'RESPOND', pendingResponse: { active: true, targetIdx: 0, requiredCard: 'Bang!' } };
    assert.equal(play(players, { type: 'Pivo' }, opts), true);
});

test('RESPOND req=Vedle! (obrana proti Bang!): Vedle! brání, Bang! ne; Calamity Janet brání i Bangem', () => {
    const opts = { phase: 'RESPOND', pendingResponse: { active: true, targetIdx: 0, requiredCard: 'Vedle!' } };
    assert.equal(play([P(), P()], { type: 'Vedle!' }, opts), true);
    assert.equal(play([P(), P()], { type: 'Bang!' }, opts), false);
    assert.equal(play([P({ character: 'Calamity Janet' }), P()], { type: 'Bang!' }, opts), true);
});

test('RESPOND req=Bang! (duel): Bang! odpovídá, Vedle! ne; Calamity Janet odpoví i Vedlem', () => {
    const opts = { phase: 'RESPOND', pendingResponse: { active: true, targetIdx: 0, requiredCard: 'Bang!' } };
    assert.equal(play([P(), P()], { type: 'Bang!' }, opts), true);
    assert.equal(play([P(), P()], { type: 'Vedle!' }, opts), false);
    assert.equal(play([P({ character: 'Calamity Janet' }), P()], { type: 'Vedle!' }, opts), true);
});

// ── Fáze PLAY: Bang! limit ──────────────────────────────────────────────────
test('Bang!: limit 1× za kolo, Willy the Kid a Volcanic limit obchází', () => {
    assert.equal(play([P(), P()], { type: 'Bang!' }), true);
    assert.equal(play([P({ bangsPlayedThisTurn: 1 }), P()], { type: 'Bang!' }), false);
    assert.equal(play([P({ bangsPlayedThisTurn: 1, character: 'Willy the Kid' }), P()], { type: 'Bang!' }), true);
    assert.equal(play([P({ bangsPlayedThisTurn: 1, weapon: { id: 63, name: 'Volcanic' } }), P()], { type: 'Bang!' }), true);
});

test('Vedle! mimo obranu nehratelné (kromě Calamity Janet)', () => {
    assert.equal(play([P(), P()], { type: 'Vedle!' }), false);
    // Calamity Janet hraje Vedle! jako Bang! (a má volný limit)
    assert.equal(play([P({ character: 'Calamity Janet' }), P()], { type: 'Vedle!' }), true);
});

// ── Cílené karty ────────────────────────────────────────────────────────────
test('Vězení: jen na nešerify bez vězení', () => {
    assert.equal(play([P(), P({ role: 'Outlaw' })], { type: 'Vězení' }), true);
    assert.equal(play([P(), P({ role: 'Sheriff' })], { type: 'Vězení' }), false);
    assert.equal(play([P(), P({ role: 'Outlaw', board: [{ type: 'Vězení' }] })], { type: 'Vězení' }), false);
});

test('Panika!: cíl do vzdálenosti 1 s kartou, nebo sám sebe', () => {
    // soupeř na dosah 1 s kartou v ruce
    assert.equal(play([P(), P({ hand: [{ id: 1 }] })], { type: 'Panika!' }), true);
    // nikdo nemá nic a já taky ne -> nehratelné
    assert.equal(play([P(), P(), P()], { type: 'Panika!' }), false);
    // můžu zacílit sám sebe, když mám modrou kartu na stole
    assert.equal(play([P({ board: [{ id: 9, name: 'Barel' }] }), P(), P()], { type: 'Panika!' }), true);
});

test('Duel: potřebuje aspoň jednoho dalšího živého', () => {
    assert.equal(play([P()], { type: 'Duel' }), false);
    assert.equal(play([P(), P()], { type: 'Duel' }), true);
});

// ── Léčení ──────────────────────────────────────────────────────────────────
test('Pivo: jen při >2 živých a zraněném hráči', () => {
    assert.equal(play([P({ health: 3 }), P(), P()], { type: 'Pivo' }), true);
    assert.equal(play([P({ health: 3 }), P()], { type: 'Pivo' }), false); // jen 2 živí
    assert.equal(play([P(), P(), P()], { type: 'Pivo' }), false);         // plné zdraví
});

test('Salon: jen když je někdo zraněný', () => {
    assert.equal(play([P({ health: 3 }), P()], { type: 'Salon' }), true);
    assert.equal(play([P(), P()], { type: 'Salon' }), false);
});

// ── Modré karty ─────────────────────────────────────────────────────────────
test('Zbraň: nelze nasadit stejnou už drženou', () => {
    assert.equal(play([P({ weapon: { id: 65, name: 'Schofield' } }), P()], { type: 'Zbraň', name: 'Schofield' }), false);
    assert.equal(play([P({ weapon: { id: 65, name: 'Schofield' } }), P()], { type: 'Zbraň', name: 'Remington' }), true);
});

test('Vybavení/Barel: nelze duplikovat na stole', () => {
    assert.equal(play([P({ board: [{ name: 'Mustang' }] }), P()], { type: 'Vybavení', name: 'Mustang' }), false);
    assert.equal(play([P(), P()], { type: 'Vybavení', name: 'Mustang' }), true);
});

test('ostatní karty (např. Dostavník) jsou ve fázi PLAY hratelné', () => {
    assert.equal(play([P(), P()], { type: 'Dostavník' }), true);
});
