const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const registerLobby = require('../server/handlers.lobby.js');
const registerNextGame = require('../server/handlers.nextgame.js');
const registerGame = require('../server/handlers.game.js');
const registerCharacters = require('../server/handlers.characters.js');
const registerDebug = require('../server/handlers.debug.js');

// Fake socket zaznamenávající registrované eventy (těla se nespouští)
function mkSocket() {
    const events = [];
    return {
        id: 's',
        on(ev) { events.push(ev); },
        emit() {}, join() {}, leave() {},
        _events: events,
    };
}

// ctx s no-op helpery (handlery se při registraci nevolají)
function mkCtx() {
    const noop = () => {};
    return new Proxy({ rooms: new Map() }, { get(t, k) { return k in t ? t[k] : noop; } });
}

const GROUPS = {
    lobby: { reg: registerLobby, events: [
        'create_room', 'join_room', 'leave_room', 'rejoin', 'start_game', 'cancel_game',
        'get_game_list', 'spectate', 'leave_spectate', 'go_to_menu', 'chat_message', 'disconnect',
        'add_bot', 'remove_bot', 'create_bot_game', 'expansion_ready',
    ] },
    nextgame: { reg: registerNextGame, events: [
        'select_character', 'intro_role_ok', 'keep_character', 'vote_next_game',
        'leader_start_next', 'confirm_next_game', 'check_start_next', 'open_next_lobby',
    ] },
    game: { reg: registerGame, events: [
        'draw_card', 'play_card', 'play_bang', 'play_special', 'select_target_card',
        'respond_to_card', 'end_turn', 'discard_card', 'kit_carlson_pick', 'kit_carlson_select',
        'lucky_duke_pick', 'lucky_duke_choose', 'trigger_barrel_draw', 'draw_from_barrel',
        'sid_ketchum_discard_both', 'take_dynamite_hit', 'respond_with_beer', 'beer_dynamite_save',
        'take_noon_hit', 'beer_noon_save', 'handcuffs_suit', 'new_identity_choose',
        'greygory_choice',
        'peyote_guess', 'ranch_exchange', 'blood_brothers', 'roulette_discard',
        'grinner_give', 'valentine_discard',
        'sniper_choose', 'play_ricochet',
        'sid_ketchum_cancel', 'sid_save_discard', 'store_pick',
        'discard_extra_choose', 'discard_another_card', 'cancel_discard_another', 'activate_green_card',
    ] },
    characters: { reg: registerCharacters, events: [
        'bart_cassidy_draw', 'uhyb_draw', 'get_taken_names', 'el_gringo_steal', 'suzy_draw',
        'trigger_check_draw', 'resolve_check', 'resolve_black_jack',
        'chuck_wengam', 'jose_delgado', 'doc_holyday', 'vera_copy',
        'uncle_will', 'claus_give', 'flint_westwood', 'lee_van_kliff', 'lady_rose',
        'dorothy_command', 'dorothy_target', 'dorothy_cancel', 'role_peek_ok',
    ] },
    debug: { reg: registerDebug, events: [
        'debug_start', 'debug_end_game', 'debug_give_card', 'debug_remove_card', 'debug_select_char',
    ] },
};

for (const [name, { reg, events }] of Object.entries(GROUPS)) {
    test(`handlers.${name} registruje právě svoje eventy`, () => {
        const socket = mkSocket();
        reg(socket, mkCtx(), () => {});
        assert.deepEqual([...socket._events].sort(), [...events].sort());
    });
}

test('všechny moduly dohromady pokrývají 88 unikátních eventů', () => {
    const all = [];
    for (const { reg } of Object.values(GROUPS)) {
        const socket = mkSocket();
        reg(socket, mkCtx(), () => {});
        all.push(...socket._events);
    }
    assert.equal(all.length, 88);
    assert.equal(new Set(all).size, 88, 'žádný event se nesmí registrovat dvakrát');
});

// Druhá polovina invariantu „bot se nikdy nezasekne" (první je v test/botPolicy.test.js):
// akce, kterou bot umí vystřelit, musí mít na serveru handler. Bez něj by socket event
// spadl do prázdna, stav by se nezměnil a driver by tutéž akci posílal donekonečna.
test('každou akci, kterou bot umí poslat, obsluhuje nějaký handler', () => {
    const botSrc = fs.readFileSync(__dirname + '/../core/botPolicy.js', 'utf8');
    const botEvents = [...new Set([...botSrc.matchAll(/event: '([a-z_]+)'/g)].map(m => m[1]))];
    assert.ok(botEvents.length > 30, `bot umí rozumný počet akcí (${botEvents.length})`);

    const registered = new Set();
    for (const { reg } of Object.values(GROUPS)) {
        const socket = mkSocket();
        reg(socket, mkCtx(), () => {});
        socket._events.forEach(e => registered.add(e));
    }
    const missing = botEvents.filter(e => !registered.has(e));
    assert.deepEqual(missing, [], 'akce bota bez handleru = zaseknutá hra jen botů');
});
