// logic/fistful.js — mixin GameState: rozšíření A Fistful of Cards (druhý balíček událostí).
// Funguje úplně stejně jako High Noon a hraje se s ním SOUČASNĚ: na začátku tahu prvního
// hráče se odkryje karta z obou balíčků, nejdřív z High Noonu a hned za ní z Fistfulu.
// Karta „Fistful of Cards" leží vespod balíčku (jako Pravé poledne v HN) – přijde poslední
// a platí do konce hry.
//
// Stav je záměrně vedle High Noonu, ne místo něj:
//   High Noon → eventDeck / eventPile / activeEvent / _eventEntering
//   Fistful   → ffDeck    / ffPile    / activeFistful / _ffEntering
// Slévají se jen v `hasEvent` (logic/highNoon.js) a `eventActive` (core/highNoon.js), takže
// se všechna pravidla ptají pořád stejně a klíče karet jsou napříč balíčky unikátní.
//
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {

// Karta, která se při přípravě dává vespod balíčku → odkryje se jako poslední.
const LAST_FF_KEY = 'FISTFUL_OF_CARDS';

// Soudce: karty, které se z ruky vykládají PŘED hráče (vlastního i cizího). Zelené karty
// (Dodge City) mají vlastní typy, poznají se přes `card.green`.
const JUDGE_BLOCKED_TYPES = [CardType.WEAPON, CardType.EQUIPMENT, CardType.BARREL,
                             CardType.DYNAMITE, CardType.JAIL];

const FistfulMixin = {
    // ── Příprava balíčku (setupGame / setupDebugGame / setupNextGame) ──────────
    // Bez zapnutého rozšíření zůstane balíček prázdný a `hasEvent` vrací pro jeho klíče
    // vždy false, takže jsou všechny háky v pravidlech no-op.
    _setupFistfulDeck(options = {}) {
        this.ffDeck = [];
        this.ffPile = [];
        this.activeFistful = null;
        this._ffEntering = null;
        // Navazující hra přebírá hráče z předchozí – vynucená karta Práva západu po nich nesmí
        // zůstat (redakce ji ukazuje celému stolu, viz server/rooms.js).
        (this.players || []).forEach(p => { p._lawCardId = null; });
        const on = options.expansions && options.expansions.fistful;
        if (!on || !Array.isArray(this.fistfulCardData)) return;

        const pool = this.fistfulCardData
            .map(c => ({ id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null }));
        const last = pool.filter(c => c.key === LAST_FF_KEY);
        const rest = pool.filter(c => c.key !== LAST_FF_KEY);
        this.deck.shuffleArray(rest);
        // Líže se přes pop() z konce pole → Fistful of Cards musí ležet na indexu 0.
        this.ffDeck = last.concat(rest);
        this.logEvent('system', { msg: `Fistful: balíček událostí (${this.ffDeck.length} karet)` });
    },

    // Odkrytí karty z balíčku Fistful. Volá se z `_flipEvent` (logic/highNoon.js) hned
    // za odkrytím karty High Noonu – počítadlo kol (`_sheriffTurns`) i podmínka „jen na
    // tahu prvního hráče a až od 2. kola" jsou tím pádem společné pro oba balíčky.
    _flipFistfulEvent() {
        if (!this.ffDeck || !this.ffDeck.length) return;
        this.activeFistful = this.ffDeck.pop();
        // Odkryté karty zůstávají ležet na sobě (nová překryje předchozí) – klient z nich
        // kreslí hromádku lícem nahoru. `activeFistful` je vrchní karta hromádky.
        this.ffPile.push(this.activeFistful);
        this._ffEntering = this.activeFistful.key;
        this._pendingFistfulReveal = Object.assign({}, this.activeFistful,
            { deck: 'ff', remaining: this.ffDeck.length });
        this.logEvent('event', { card: this.activeFistful.name, left: this.ffDeck.length });
    },

    // Efekty, které se vyhodnotí JEDNOU při příchodu karty do hry (zatím žádné – Ruská
    // ruleta přibude ve své fázi). Vrací true, když se čeká na rozhodnutí hráče, a start
    // tahu se tím pádem pozastaví (viz `_runBeginTurn` v logic/highNoon.js).
    _applyFfEventOnEnter() {
        const key = this._ffEntering;
        this._ffEntering = null;
        if (!key) return false;
        return false;
    },

    // ── Laso: „Karty vyložené před hráči nemají žádný efekt." ──────────────────
    // Jediný dotaz pravidel. Je to totéž, co už umí vypínač karet na stole u Belle Star
    // (`_belleIgnoresBoard` v logic.js), jen platí pro VŠECHNY hráče a i na karty vlastní.
    // Vypnuté jsou:
    //   • dostřel zbraně → 1 jako s Coltem (a Volcanic nedovolí Bang! bez limitu),
    //   • Mustang/Skrýš i Dalekohled/Hledí (computeDistance v core/distance.js),
    //   • Barel – Jourdonnaisova VROZENÁ schopnost platí dál, není to karta,
    //   • Dynamit i Vězení – žádné sejmutí, dynamit se neposouvá, vězení tah nebere,
    //   • zelené karty – aktivace i zelené Vedle! ze stolu.
    // Karty přitom zůstávají ležet, takže po skončení kola zase fungují.
    _boardDead() {
        return this.hasEvent('LASO');
    },

    // ── Soudce: „Hráči nesmí vykládat karty před sebe ani před ostatní hráče." ──
    // Blokuje jen cestu karty Z RUKY na stůl (výzbroj, modré, zelené a Vězení). Co už
    // leží, funguje dál – aktivace zelené karty i Hokynářství Uncle Willa jsou povolené.
    _judgeBlocks(card) {
        return this.hasEvent('SOUDCE') && !!card &&
               (!!card.green || JUDGE_BLOCKED_TYPES.includes(card.type));
    },

    // ── Právo západu: „Druhá lízaná karta se odkryje a musí se v tomhle tahu zahrát." ─
    // Označení karty. `nth` je pořadí karty v rámci fáze lízání (1-based) – volá se ze
    // všech cest, kudy karta v téhle fázi doputuje do ruky (běžné líznutí, Black Jack,
    // Kit Carlson a Claus si značí druhou PONECHANOU). Se Žízní (High Noon) se líže jen
    // jedna karta, takže žádná vynucená není. Nuluje se v `_beginTurn` (logic/highNoon.js).
    _lawMark(player, card, nth) {
        if (nth !== 2 || !player || !card || !this.hasEvent('PRAVO_ZAPADU')) return;
        player._lawCardId = card.id;
        this.logEvent('event', { card: 'Právo západu', who: player.name, msg: `musí zahrát ${card.name}` });
    },

    // Drží hráče v tahu vynucená karta? Trychtýř na sdílený helper z core/playability.js –
    // úplně stejně se ptá klient i bot, jinak by server tiše odmítal „Ukončit tah".
    _lawForced(playerIdx) {
        const p = this.players[playerIdx];
        return p ? lawForcedCard(this, p, playerIdx) : null;
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FistfulMixin;
} else {
    Object.assign(GameState.prototype, FistfulMixin);
}
})();
