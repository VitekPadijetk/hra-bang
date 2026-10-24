// core/vosAnim.js — časování cinematik rozšíření Údolí stínů. BEZ Phaseru/DOM, izomorfní.
//
// Jediný zdroj pravdy (vzor core/goldRushAnim.js, core/wwsAnim.js) pro klienta
// (net/handlers.js), frontu animací (`_animDurationMs` + tabulka `ANIM_MS`) i serverové
// držení botů (`room._vosBlockUntil` v server/anim.js). Bez toho bot zahraje další akci
// uprostřed cinematiky a stav ji předběhne.
//
// Fáze F0 je jen kostra. Přibude:
//   tornado_pass – karty z ruky k levému sousedovi, všichni naráz (F4),
//   poker_reveal – karty doprostřed lícem dolů → otočení → k hráči / do odhozu (F4),
//   odchod ducha – vyřazení hráče, kterému sebrali kartu Duch (F5).
const VOS_ANIM = {};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VOS_ANIM };
}
