// server/guard.js — autorizace herních akcí NA HRÁČE (ne globálně).
//
// Proč: herní handlery čtou aktéra ze STAVU (`gs.currentPlayerIndex`,
// `gs.storePickerIndex`, `pendingXY.playerIdx`), ne z odesílatele. Každý příchozí
// event tedy posunul hru bez ohledu na to, kdo ho poslal. Na pomalé lince proto:
//   • dvojklik na „Ukončit tah" (klient ještě nemá nový stav, tlačítko pořád svítí)
//     poslal end_turn 2–3×  →  přeskočilo se několik hráčů,
//   • opožděný klik doručený až po změně stavu odehrál akci za někoho jiného
//     (výběr v hokynářství, odhoz, reakce…).
//
// Guard proto před spuštěním handleru ověří, že hra čeká právě na místo (seat)
// tohoto socketu – autorita je `pendingActor` z core/pending.js (stejný zdroj
// pravdy, jaký používá klient i bot). Když ne, akci zahodí a pošle odesílateli
// 'action_rejected' (klient si tím odemkne UI – nový stav už nepřijde).
//
// Factory installActionGuard(ctx) vystaví `ctx.guardedOn(socket)` = náhrada za
// `socket.on` pro herní handlery (handlers.game.js / handlers.characters.js).
const { pendingActor } = require('../core/pending.js');

module.exports = function installActionGuard(ctx) {

    // Akce, které posouvají hru za „toho, na koho se čeká". Od jiného hráče jde
    // vždy o opožděný/duplicitní klik → zahodit.
    const TURN_ACTIONS = new Set([
        'draw_card', 'play_card', 'play_bang', 'play_special', 'select_target_card',
        'respond_to_card', 'end_turn', 'discard_card', 'store_pick',
        'kit_carlson_pick', 'kit_carlson_select', 'lucky_duke_pick', 'lucky_duke_choose',
        'trigger_barrel_draw', 'draw_from_barrel', 'take_dynamite_hit',
        'respond_with_beer', 'beer_dynamite_save',
        'discard_extra_choose', 'discard_another_card', 'cancel_discard_another',
        'activate_green_card',
        'bart_cassidy_draw', 'uhyb_draw', 'el_gringo_steal', 'suzy_draw',
        'trigger_check_draw', 'resolve_check', 'resolve_black_jack',
        'chuck_wengam', 'jose_delgado', 'doc_holyday', 'vera_copy',
    ]);

    // Akce mimo pořadí (Sid Ketchum léčí kdykoli, i v cizím tahu) – tady nelze
    // porovnávat s pendingActor, ale pořád musí platit, že hráč hraje SÁM ZA SEBE.
    const SELF_ACTIONS = new Set([
        'sid_ketchum_discard_both', 'sid_ketchum_cancel', 'sid_save_discard',
    ]);

    // Místa (seaty), která tento socket ovládá. Normálně právě jedno; v debug hře
    // sdílí jeden socket všechna místa (ta se guardem neřeší, viz níže).
    function seatsOf(room, socketId) {
        return room.players.filter(p => p.socketId === socketId).map(p => p.playerIdx);
    }

    // Vrátí důvod odmítnutí, nebo null když je akce v pořádku.
    function rejectReason(gs, seats, event, payload) {
        if (SELF_ACTIONS.has(event)) {
            const idx = payload && payload.playerIdx;
            return (idx != null && !seats.includes(idx)) ? `hraje za cizí místo #${idx}` : null;
        }
        if (!TURN_ACTIONS.has(event)) return null;
        if (gs.winner) return 'hra už skončila';
        const pa = pendingActor(gs);
        // pendingActor === null = přechodný/neznámý stav (např. SID_SAVE): nic
        // nepřidáváme, ať guard nikdy nezablokuje víc než dosavadní chování.
        if (pa && !seats.includes(pa.idx)) return `čeká se na #${pa.idx} (${pa.kind})`;
        return null;
    }

    // Náhrada za socket.on pro herní handlery: stejná signatura, jen akci nejdřív
    // prožene guardem. Eventy mimo oba seznamy propouští beze změny.
    function guardedOn(socket) {
        return function on(event, cb) {
            socket.on(event, (payload) => {
                const room = ctx.findRoomBySocket(socket.id);
                const gs = room && room.gameState;
                // Mimo místnost/hru guard neřeší nic (handler stejně skončí ve withRoom).
                // Debug hra: jeden socket legitimně ovládá všechna místa → přeskoč.
                if (room && gs && !gs.isDebug) {
                    const seats = seatsOf(room, socket.id);
                    const why = seats.length ? rejectReason(gs, seats, event, payload) : null;
                    if (why) {
                        ctx.glog.reject(room, ctx.glog.actorLabel(gs, seats[0]), event, why);
                        socket.emit('action_rejected', { event, reason: why });
                        return;
                    }
                }
                cb(payload);
            });
        };
    }

    Object.assign(ctx, { guardedOn });
    return ctx;
};
