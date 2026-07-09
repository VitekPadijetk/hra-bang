const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isResponseTurn, isPlayTurn, canActOnHand } = require('../core/phaseInfo.js');

function st(opts = {}) {
    return {
        phase: opts.phase ?? 'PLAY',
        currentPlayerIndex: opts.currentPlayerIndex ?? 0,
        pendingResponse: opts.pendingResponse,
    };
}

test('isResponseTurn: true jen pro RESPOND s aktivní odpovědí mířenou na mě', () => {
    const s = st({ phase: 'RESPOND', pendingResponse: { active: true, targetIdx: 1 } });
    assert.equal(isResponseTurn(s, 1), true);
});

test('isResponseTurn: false při jiné fázi, neaktivní odpovědi, jiném cíli nebo bez pendingResponse', () => {
    assert.equal(isResponseTurn(st({ phase: 'PLAY', pendingResponse: { active: true, targetIdx: 1 } }), 1), false);
    assert.equal(isResponseTurn(st({ phase: 'RESPOND', pendingResponse: { active: false, targetIdx: 1 } }), 1), false);
    assert.equal(isResponseTurn(st({ phase: 'RESPOND', pendingResponse: { active: true, targetIdx: 2 } }), 1), false);
    assert.equal(isResponseTurn(st({ phase: 'RESPOND' }), 1), false); // pendingResponse undefined
});

test('isPlayTurn: true jen pro můj tah ve fázi PLAY', () => {
    assert.equal(isPlayTurn(st({ phase: 'PLAY', currentPlayerIndex: 2 }), 2), true);
    assert.equal(isPlayTurn(st({ phase: 'DISCARD', currentPlayerIndex: 2 }), 2), false);
    assert.equal(isPlayTurn(st({ phase: 'PLAY', currentPlayerIndex: 3 }), 2), false);
});

test('canActOnHand: true pro můj tah ve fázi PLAY i DISCARD', () => {
    assert.equal(canActOnHand(st({ phase: 'PLAY', currentPlayerIndex: 2 }), 2), true);
    assert.equal(canActOnHand(st({ phase: 'DISCARD', currentPlayerIndex: 2 }), 2), true);
    assert.equal(canActOnHand(st({ phase: 'RESPOND', currentPlayerIndex: 2 }), 2), false);
    assert.equal(canActOnHand(st({ phase: 'PLAY', currentPlayerIndex: 3 }), 2), false);
});
