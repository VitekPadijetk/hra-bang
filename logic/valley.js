// logic/valley.js — mixin GameState: rozšíření Údolí stínů (The Valley of Shadows).
// Připojuje se na GameState.prototype (browser: <script> po logic.js; Node: require z logic.js).
// Globály v těle (vosOn, hasDuchCard, …) poskytuje core/valley.js (browser <script> dříve /
// Node shim v logic.js).
//
// Plán: docs/udoli-stinu-plan.md. Rozšíření nepřidává balíček ani nic na stůl – 16 karet
// jde do hlavního balíčku (jen hotové druhy, VOS_CARDS_READY) a 5 postav do výběru.
// Sem patří všechno, co nemá domov jinde: fronta výstřelů (F3), hromadné skryté volby (F4),
// Duch (F5), okna reakcí (F6, F8) a pozastavená akce Henryho Blocka (F7).
// Fáze F0 je jen kostra.
(function () {
const ValleyMixin = {
    // Je rozšíření zapnuté? Zrcadlo `vosOn` (core/valley.js) pro klienta a bota.
    _vosOn() {
        return vosOn(this);
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ValleyMixin;
else Object.assign(GameState.prototype, ValleyMixin);
})();
