const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideCardClick } = require('../core/selection.js');

// Výchozí kontext kliknutí; jednotlivé testy přepisují jen relevantní pole.
function ctx(over = {}) {
    const base = {
        state: {
            phase: 'PLAY',
            currentPlayerIndex: 0,
            players: [{ health: 4 }, { health: 4 }, { health: 4 }],
            pendingResponse: undefined,
            pendingDynamiteDamage: undefined,
        },
        me: { health: 4, character: null, hand: [] },
        myIndex: 0,
        selectedState: { cardIndex: null, action: null },
        card: { id: 7, type: 'Bang!' },
        index: 0,
        blockInput: false,
        isMySidActive: false,
        playable: true,
    };
    return { ...base, ...over };
}

test('blockInput → NONE', () => {
    assert.deepEqual(decideCardClick(ctx({ blockInput: true })), { type: 'NONE' });
});

test('placeholder karta → NONE', () => {
    assert.deepEqual(decideCardClick(ctx({ card: { _placeholder: true } })), { type: 'NONE' });
});

test('klik na už vybranou kartu → DESELECT', () => {
    const c = ctx({ index: 2, selectedState: { cardIndex: 2, action: 'SHOOT' } });
    assert.deepEqual(decideCardClick(c), { type: 'DESELECT' });
});

test('Sid Ketchum: první klik → SID_STAGE', () => {
    const c = ctx({
        isMySidActive: true,
        selectedState: { sidKetchum: {} },
        index: 3, card: { id: 42, type: 'Pivo' },
    });
    assert.deepEqual(decideCardClick(c), { type: 'SID_STAGE', index: 3, cardId: 42 });
});

test('Sid Ketchum: druhý klik na jinou kartu → SID_DISCARD_BOTH', () => {
    const c = ctx({
        isMySidActive: true,
        selectedState: { sidKetchum: { stagedIdx: 1 } },
        index: 4,
    });
    assert.deepEqual(decideCardClick(c), { type: 'SID_DISCARD_BOTH', cardIdx1: 1, cardIdx2: 4 });
});

test('Sid Ketchum: druhý klik na tutéž kartu → RENDER', () => {
    const c = ctx({
        isMySidActive: true,
        selectedState: { sidKetchum: { stagedIdx: 2 } },
        index: 2,
    });
    assert.deepEqual(decideCardClick(c), { type: 'RENDER' });
});

test('Pivo při výbuchu dynamitu na posledním životě → BEER_DYNAMITE_SAVE', () => {
    const c = ctx({
        state: {
            phase: 'DYNAMITE_DAMAGE',
            currentPlayerIndex: 0,
            players: [{ health: 1 }, { health: 4 }, { health: 4 }],
            pendingDynamiteDamage: { playerIdx: 0 },
        },
        me: { health: 1, character: null, hand: [] },
        card: { id: 37, type: 'Pivo' },
        index: 1,
    });
    assert.deepEqual(decideCardClick(c), { type: 'BEER_DYNAMITE_SAVE', index: 1 });
});

test('není můj tah → NONE', () => {
    const c = ctx({ state: { phase: 'PLAY', currentPlayerIndex: 1, players: [{ health: 4 }, { health: 4 }] } });
    assert.deepEqual(decideCardClick(c), { type: 'NONE' });
});

test('nehratelná karta v mém tahu → UNPLAYABLE_FLASH', () => {
    assert.deepEqual(decideCardClick(ctx({ playable: false })), { type: 'UNPLAYABLE_FLASH' });
});

test('obrana Pivem na posledním životě → RESPOND_BEER', () => {
    const c = ctx({
        state: {
            phase: 'RESPOND',
            currentPlayerIndex: 1,
            players: [{ health: 1 }, { health: 4 }, { health: 4 }],
            pendingResponse: { active: true, targetIdx: 0, requiredCard: 'Vedle!' },
        },
        me: { health: 1, character: null, hand: [] },
        card: { id: 37, type: 'Pivo' },
        index: 2,
    });
    assert.deepEqual(decideCardClick(c), { type: 'RESPOND_BEER', index: 2 });
});

test('běžná obrana kartou → RESPOND', () => {
    const c = ctx({
        state: {
            phase: 'RESPOND',
            currentPlayerIndex: 1,
            players: [{ health: 4 }, { health: 4 }],
            pendingResponse: { active: true, targetIdx: 0, requiredCard: 'Vedle!' },
        },
        card: { id: 30, type: 'Vedle!' },
        index: 1,
    });
    assert.deepEqual(decideCardClick(c), { type: 'RESPOND', index: 1 });
});

test('odhození ve fázi DISCARD → DISCARD', () => {
    const c = ctx({
        state: { phase: 'DISCARD', currentPlayerIndex: 0, players: [{ health: 4 }, { health: 4 }] },
        playable: null,
        index: 3,
    });
    assert.deepEqual(decideCardClick(c), { type: 'DISCARD', index: 3 });
});

test('výběr karty k zahrání → SELECT s odvozenou akcí', () => {
    const c = ctx({ card: { id: 7, type: 'Bang!' }, index: 0 });
    assert.deepEqual(decideCardClick(c), { type: 'SELECT', index: 0, action: 'SHOOT' });
});

test('výběr modré karty → SELECT s akcí PLAY_BLUE', () => {
    const c = ctx({ card: { id: 65, type: 'Zbraň' }, index: 1 });
    assert.deepEqual(decideCardClick(c), { type: 'SELECT', index: 1, action: 'PLAY_BLUE' });
});
