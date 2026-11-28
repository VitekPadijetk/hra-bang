// core/armedAnim.js — časování animací rozšíření Ozbrojení a nebezpeční. BEZ Phaseru/DOM,
// izomorfní.
//
// Jediný zdroj pravdy (vzor core/vosAnim.js) pro klienta (net/handlers.js – playAdTokens),
// frontu animací (`_animDurationMs` v net/handlers.js) i serverové držení botů
// (flushAdAnim v server/anim.js). Bez toho bot zahraje další akci uprostřed letu
// a stav ho předběhne.
//
//   ad_tokens – lety kostiček žetonů nabití (plán §2.16, bug X). Jedna dávka = všechno,
//               co se v jedné akci pohnulo (rozmístění, platba, Rez, Frankie Canton,
//               Red Ringo, vrácení při odchodu ze hry). `flights` = [{ from, to, kind,
//               delay }], adresa `null` = zásoba, jinak { seat, cardId, slot } (cardId
//               null = postava, slot = vizuální slot „0 = zbraň, 1+k = k-tá karta").
//               `depleted` = [{ playerIdx, cardId }] – vyčerpané karty odletí do odhozu
//               až PO posledním žetonu (hlášení 2026-11-27T15-53-18-892Z).
//   discard_to_hand – karta z odhozu zpátky do ruky (Křesadlovka, Skrč se!), stará cesta.
const AD_ANIM = {
    flyMs: {
        load: 320,   // zásoba → karta/postava
        pay:  260,   // karta/postava → zásoba
        move: 420,   // karta/postava → karta/postava (Frankie, Red Ringo, Rez)
    },
    staggerMs:   90,   // rozestup startů kostiček jedné dávky (Rez letí všechny naráz)
    departMs:   380,   // vyčerpaná karta ze stolu do odhozu (= board_to_discard)
    departStaggerMs: 90,
    bufMs:       60,
};

// Druh letu podle adres: ze zásoby = load, do zásoby = pay, jinak move.
function adFlightKind(from, to) {
    if (!from) return 'load';
    if (!to) return 'pay';
    return 'move';
}

// Délka dávky ad_tokens: poslední doletěná kostička, pak odchod vyčerpaných karet.
function adTokensMs(a) {
    const flights = (a && a.flights) || [];
    const dep = (a && a.depleted) || [];
    if (!flights.length && !dep.length) return 0;
    let end = 0;
    flights.forEach(f => {
        end = Math.max(end, (f.delay || 0) + (AD_ANIM.flyMs[f.kind] || AD_ANIM.flyMs.move));
    });
    if (dep.length) end += (dep.length - 1) * AD_ANIM.departStaggerMs + AD_ANIM.departMs;
    return end + AD_ANIM.bufMs;
}

// Jak dlouho drží boty animace zapsaná pravidly (`_adAnim`, server/anim.js).
function adAnimMs(a) {
    if (!a) return 0;
    if (a.type === 'ad_tokens') return adTokensMs(a);
    if (a.type === 'discard_to_hand') return 400;
    return 400;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AD_ANIM, adFlightKind, adTokensMs, adAnimMs };
}
