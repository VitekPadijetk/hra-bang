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
        // Sacagaway (odkryté ruce) mění REDAKCI stavu, ne pravidla – její příchod i odchod
        // je proto pro klienta předěl, na kterém se všechny cizí vějíře plynule přetočí.
        // Označí se tady, emituje `flushSacaFlip` před broadcastem (server/anim.js) –
        // stejný vzor jako `_pendingWwsReveal`.
        const sacaBefore = this.hasEvent('SACAGAWAY');
        this.activeWws = this.wwsDeck.pop();
        // Odkryté karty zůstávají ležet na sobě (nová překryje předchozí) – klient z nich
        // kreslí hromádku lícem nahoru. `activeWws` je vrchní karta hromádky.
        this.wwsPile.push(this.activeWws);
        this._wwsEntering = this.activeWws.key;
        this._pendingWwsReveal = Object.assign({}, this.activeWws,
            { deck: 'wws', remaining: this.wwsDeck.length, playerIdx });
        this.logEvent('event', { card: this.activeWws.name, left: this.wwsDeck.length });
        const sacaAfter = this.hasEvent('SACAGAWAY');
        if (sacaBefore !== sacaAfter) this._pendingSacaFlip = { open: sacaAfter };
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

    // ── Miláček Valentýn ──────────────────────────────────────────────────────
    // „Na začátku svého tahu odhodí každý hráč všechny karty z ruky a stejný počet karet
    // si dobere z balíčku." Poznámka v pravidlech: běžná fáze lízání proběhne normálně
    // ZA tím („players then also draw the usual 2 cards"), takže je to výměna NAVÍC.
    //
    // Je to POSLEDNÍ krok krokovače startu tahu (_runBeginTurn, logic/highNoon.js), ale
    // pořád ještě PŘED kontrolami na Dynamit/Vězení: hráč má do sejmutí jít s novou rukou
    // (mohl si vyměnit Pivo, kterým se před dynamitem zachrání).
    //
    // Náhradní karty si líže RUČNĚ klikáním na balíček – nastaví se klasická fáze lízání,
    // takže se domíchání balíčku odbaví úplně stejnou cestou jako u kteréhokoli jiného
    // lízání. `isStartOfTurn: false` je nutné hned dvakrát:
    //   • Želízka (High Noon) ani Ranč (Fistful) se u téhle fáze ptát nesmí – patří ke
    //     SKUTEČNÉ fázi lízání, která přijde až za kontrolami,
    //   • Opuštěný důl (Fistful) se Valentýna nesmí dotknout ani jednou půlkou: odhoz ruky
    //     není fáze 3 (jde do normálního odhozu, ne lícem dolů na balíček) a lízání náhrad
    //     není fáze 1 (bere se z dobíracího balíčku, ne z odhozu – viz _mineDrawCard).
    //
    // Suzy Lafayette se prázdnou rukou neprobudí: posuzuje se až po dokončení efektu
    // („nejdřív doběhne efekt zahrané karty"), a to už má karty zpátky.
    _startValentine() {
        if (!this.hasEvent('MILACEK_VALENTYN')) return false;
        const idx = this.currentPlayerIndex;
        const p = this.players[idx];
        if (!p || !isInPlay(p) || !p.hand.length) return false;
        const n = p.hand.length;
        const discarded = p.hand.splice(0, n);
        // Karty odlétají do odhozu PO JEDNÉ zleva doprava (jako u Ranče) – emit řeší hák
        // před broadcastem (flushValentine, server/anim.js), protože sem se hra dostane
        // z pěti různých cest, ale všechny končí broadcastem.
        this._valentineAnim = { playerIdx: idx, cardIds: discarded.map(c => c.id) };
        discarded.forEach(c => this.deck.discard(c));
        this.logEvent('event', { card: 'Miláček Valentýn', who: p.name, msg: `vyměňuje ${n} karet` });
        this._setDrawPhase({
            active: true,
            playerIdx: idx,
            cardsNeeded: n,
            cardsDrawn: 0,
            options: ['deck'],
            isStartOfTurn: false,
            isValentine: true,
        });
        this.phase = "DRAW";
        return true;
    },

    // ── Madam Zuzana ──────────────────────────────────────────────────────────
    // „Během svého tahu musí každý hráč zahrát alespoň 3 karty. Hráč, který to neudělá,
    // ztrácí 1 život." Počítadlo (`p._playedThisTurn`) plní _trackCard (logic.js) VŽDYCKY,
    // ne jen když karta platí – přijde-li Zuzana uprostřed tahu, počítají se i karty
    // zahrané předtím (FAQ Q02).
    //
    // Gate sedí úplně nahoře v `nextTurn` (logic.js), PŘED Vendetou (Fistful): pořadí na
    // konci tahu je fáze 3 (odhoz nad limit) → Zuzana → Vendeta → nový tah. Do nextTurn
    // se chodí dvěma cestami (tryEndTurn i discardCard), takže by gate v tryEndTurn minul
    // každého, kdo odhazoval.
    //
    // Zásah se KLIKÁ – recykluje se `pendingDynamiteDamage` (jako Ruská ruleta), takže
    // zvýrazněné životy, záchrana Pivem i Sidem Ketchumem, guard, klient i bot fungují
    // beze změny; liší se jen `resume`, tedy kam se pak pokračuje (_afterDamageClicks).
    // Bart Cassidy si za ztracený život lízne, El Gringo nekrade (není útočník).
    _zuzanaPenalty() {
        const p = this.getCurrentPlayer();
        // Vězení: koho tah přeskočil, ten karty hrát nemohl → nepenalizuje se (poznámka
        // v pravidlech). Příznak platí přesně pro tenhle jeden konec tahu, takže se čte
        // a nuluje i tehdy, když se Zuzana zrovna nehraje.
        const skipped = !!(p && p._turnSkippedByJail);
        if (p) p._turnSkippedByJail = false;
        if (!this.hasEvent('MADAM_ZUZANA') || this._zuzanaDone || this.winner) return false;
        if (skipped) return false;
        // Duch (Město duchů) má na konci svého tahu 0 životů (tryEndTurn) – zásah by ho
        // stejně minul, penalizace se ho tedy netýká.
        if (!p || p.health <= 0) return false;
        if ((p._playedThisTurn || 0) >= 3) return false;
        // Nastavit HNED na začátku – stejná past jako u `_vendettaDone`: bez toho by se
        // nextTurn po návratu z kliku zeptal znovu a hráč by platil pořád dokola.
        this._zuzanaDone = true;
        this.logEvent('event', { card: 'Madam Zuzana', who: p.name, msg: `zahrál jen ${p._playedThisTurn || 0} karty → −1 život` });
        this.pendingDynamiteDamage = { playerIdx: this.currentPlayerIndex, hitsLeft: 1, source: 'ZUZANA', resume: 'NEXT_TURN' };
        this.phase = "DYNAMITE_DAMAGE";
        return true;
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WildWestMixin;
} else {
    Object.assign(GameState.prototype, WildWestMixin);
}
})();
