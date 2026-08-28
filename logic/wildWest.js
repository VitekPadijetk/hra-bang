// logic/wildWest.js — mixin GameState: rozšíření Divoký západ (Wild West Show).
// TŘETÍ balíček událostí. Hraje se současně s High Noonem i Fistfulem, ale otáčí se
// úplně jinak: událost NEODKRÝVÁ šerif na začátku kola, nýbrž kdokoli, kdo zahraje
// Dostavník nebo Wells Fargo (hák v `playCard`, logic/play.js). Na začátku hry proto
// žádná událost tohoto balíčku neplatí. Karta „Divoký západ" leží vespod balíčku
// (jako Pravé poledne v HN a Fistful of Cards v FF) – přijde poslední a už se nemění.
//
// Stav je vedle obou předchozích, ne místo nich (stejné rozhodnutí jako u Fistfulu –
// nesahat na hotové):
//   High Noon     → eventDeck / eventPile / activeEvent   / _eventEntering
//   Fistful       → ffDeck    / ffPile    / activeFistful / _ffEntering
//   Divoký západ  → wwsDeck   / wwsPile   / activeWws     / _wwsEntering
// Slévají se jen v `hasEvent` (logic/highNoon.js) a `eventActive` (core/highNoon.js),
// takže se všechna pravidla ptají pořád stejně a klíče karet jsou napříč balíčky unikátní.
//
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {

// Karta, která se při přípravě dává vespod balíčku → odkryje se jako poslední a platí
// do konce hry (dalším Dostavníkem se už nevyměňuje).
const LAST_WWS_KEY = 'DIVOKY_ZAPAD';

const WildWestMixin = {
    // ── Příprava balíčku (setupGame / setupDebugGame / setupNextGame) ──────────
    // Bez zapnutého rozšíření zůstane balíček prázdný a `hasEvent` vrací pro jeho klíče
    // vždy false, takže jsou všechny háky v pravidlech no-op.
    _setupWwsDeck(options = {}) {
        this.wwsDeck = [];
        this.wwsPile = [];
        this.activeWws = null;
        this._wwsEntering = null;
        const on = options.expansions && options.expansions.divoky_zapad;
        if (!on || !Array.isArray(this.wwsCardData)) return;

        const pool = this.wwsCardData
            .map(c => ({ id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null }));
        const last = pool.filter(c => c.key === LAST_WWS_KEY);
        const rest = pool.filter(c => c.key !== LAST_WWS_KEY);
        this.deck.shuffleArray(rest);
        // Líže se přes pop() z konce pole → Divoký západ musí ležet na indexu 0.
        this.wwsDeck = last.concat(rest);
        this.logEvent('system', { msg: `Divoký západ: balíček událostí (${this.wwsDeck.length} karet)` });
    },

    // Odkrytí karty z balíčku Divokého západu. Volá se z `playCard` (logic/play.js) při
    // zahrání Dostavníku nebo Wells Farga, PŘED nastavením fáze lízání – efekt karty se
    // čte nahlas hned a některé karty mění to, co hráč vzápětí uvidí a smí zahrát.
    //
    // Vrací true, když se hra musí na vyhodnocení nově příchozí karty pozastavit
    // (zatím žádná taková není – Helena Zontero přibude ve své fázi).
    //
    // Volající, kteří kartu otáčet NESMÍ:
    //  – Krytý vůz (Dodge City) má vlastní CardType, takže sem vůbec nepřijde (FAQ Q16),
    //  – zopakování Dostavníku/Wells Farga Lee Van Kliffem posílá `repeat` (Sciarra Q19).
    _flipWwsEvent(playerIdx, opts = {}) {
        if (opts.repeat) return false;
        if (!this.wwsDeck || !this.wwsDeck.length) return false;
        // Divoký západ (karta vespod) zůstává v platnosti do konce hry a nevyměňuje se.
        if (this.activeWws && this.activeWws.key === LAST_WWS_KEY) return false;
        this.activeWws = this.wwsDeck.pop();
        // Odkryté karty zůstávají ležet na sobě (nová překryje předchozí) – klient z nich
        // kreslí hromádku lícem nahoru. `activeWws` je vrchní karta hromádky.
        this.wwsPile.push(this.activeWws);
        this._wwsEntering = this.activeWws.key;
        this._pendingWwsReveal = Object.assign({}, this.activeWws,
            { deck: 'wws', remaining: this.wwsDeck.length, playerIdx });
        this.logEvent('event', { card: this.activeWws.name, left: this.wwsDeck.length });
        return this._applyWwsEventOnEnter();
    },

    // Efekty, které se vyhodnotí JEDNOU při příchodu karty do hry. Na rozdíl od High Noonu
    // a Fistfulu to NEBĚŽÍ v krokovači startu tahu – karta přichází uprostřed cizí fáze 2.
    // Vrací true, když se čeká na rozhodnutí hráče (zatím nikdy; Helena Zontero přibude
    // ve své fázi).
    _applyWwsEventOnEnter() {
        const key = this._wwsEntering;
        this._wwsEntering = null;
        if (!key) return false;
        return false;
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WildWestMixin;
} else {
    Object.assign(GameState.prototype, WildWestMixin);
}
})();
