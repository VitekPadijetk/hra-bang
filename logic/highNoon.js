// logic/highNoon.js — mixin GameState: rozšíření High Noon (balíček událostí).
// Šerif na začátku svého tahu (počínaje DRUHÝM kolem) odkryje horní kartu balíčku
// událostí; její efekt platí celé kolo, dokud ji nepřekryje další. Pravé poledne je
// vespod balíčku, takže přijde poslední a platí až do konce hry.
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {

// Karta, kterou šerif dá při přípravě vespod balíčku → líže se jako poslední.
const LAST_EVENT_KEY = 'PRAVE_POLEDNE';

const HighNoonMixin = {
    // ── Příprava balíčku (setupGame / setupDebugGame / setupNextGame) ──────────
    // Bez zapnutého rozšíření zůstane balíček prázdný a `hasEvent` vrací vždy false,
    // takže všechny háky v pravidlech jsou no-op.
    _setupEventDeck(options = {}) {
        this.eventDeck = [];
        this.activeEvent = null;
        this._sheriffTurns = 0;
        this._beginTurnStep = 0;
        this._eventEntering = null;
        const on = options.expansions && options.expansions.high_noon;
        if (!on || !Array.isArray(this.highNoonCardData)) return;

        // Karty z přibaleného rozšíření (Nová identita, Želízka) jen na vyžádání.
        const pool = this.highNoonCardData
            .filter(c => !c.extra || options.highNoonExtra)
            .map(c => ({ id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null }));
        const last = pool.filter(c => c.key === LAST_EVENT_KEY);
        const rest = pool.filter(c => c.key !== LAST_EVENT_KEY);
        this.deck.shuffleArray(rest);
        // Líže se přes pop() z konce pole → Pravé poledne musí ležet na indexu 0.
        this.eventDeck = last.concat(rest);
        this.logEvent('system', { msg: `High Noon: balíček událostí (${this.eventDeck.length} karet)` });
    },

    // Je právě aktivní tahle událost? Jediný dotaz, kterým se ptají všechna pravidla.
    hasEvent(key) {
        return !!this.activeEvent && this.activeEvent.key === key;
    },

    // ── Start tahu ────────────────────────────────────────────────────────────
    // Volá se z nextTurn() a z obou míst v logic/setup.js, kudy jde PRVNÍ tah hry.
    // Vrací true, když se čeká na rozhodnutí hráče – volající pak NESMÍ pokračovat
    // do handleStartOfTurnChecks(), o to se postará _resumeBeginTurn().
    //
    // Kroky jsou očíslované (`_beginTurnStep`), aby se dalo kdykoli pauznout a vrátit
    // se přesně sem: 0 = odkrytí události, 1 = její okamžitý efekt, 2 = Pravé poledne.
    _beginTurn() {
        this._beginTurnStep = 0;
        return this._runBeginTurn();
    },

    _resumeBeginTurn() {
        if (this._runBeginTurn()) return;
        this.handleStartOfTurnChecks();
    },

    _runBeginTurn() {
        const steps = [this._flipEvent, this._applyEventOnEnter, this._noonDamage];
        while (this._beginTurnStep < steps.length) {
            const step = steps[this._beginTurnStep++];
            if (step.call(this)) return true;
        }
        return false;
    },

    // Odkrytí nové události. Jen na šerifově tahu a až od jeho DRUHÉHO tahu
    // („počínaje druhým kolem"). Animaci odkrytí dohraje server podle
    // `_pendingHighNoonReveal` (vyzvedne ji hák před broadcastem, viz server/anim.js).
    _flipEvent() {
        const p = this.getCurrentPlayer();
        if (!p || p.role !== 'Sheriff') return false;
        this._sheriffTurns = (this._sheriffTurns || 0) + 1;
        if (this._sheriffTurns < 2) return false;
        if (!this.eventDeck || !this.eventDeck.length) return false;

        this.activeEvent = this.eventDeck.pop();
        this._eventEntering = this.activeEvent.key;
        this._pendingHighNoonReveal = Object.assign({}, this.activeEvent, { remaining: this.eventDeck.length });
        this.logEvent('event', { card: this.activeEvent.name, left: this.eventDeck.length });
        return false;
    },

    // Efekty, které se vyhodnotí JEDNOU při příchodu karty do hry.
    _applyEventOnEnter() {
        const key = this._eventEntering;
        this._eventEntering = null;
        if (!key) return false;

        if (key === 'DOKTOR') {
            // Hráč (hráči) s nejmenším aktuálním počtem životů si 1 život obnoví.
            const alive = this.players.filter(p => p.health > 0);
            if (alive.length) {
                const min = Math.min(...alive.map(p => p.health));
                alive.forEach(p => { if (p.health === min) this._heal(p, 1); });
                this.logEvent('event', { card: 'Doktor', heal: alive.filter(p => p.health === min + 1).map(p => p.name) });
            }
        }
        return false;
    },

    // ── Pravé poledne: ztráta 1 života na začátku tahu ────────────────────────
    // Hráč musí kliknout na životy (stejně jako u dynamitu) – zásah je tak vidět.
    // Na posledním životě smí místo toho zahrát Pivo (beerLastLifeSave / sidLastLifeSave).
    _noonDamage() {
        if (!this.hasEvent('PRAVE_POLEDNE')) return false;
        const p = this.getCurrentPlayer();
        if (!p || p.health <= 0) return false;
        this.pendingNoonDamage = { playerIdx: this.currentPlayerIndex };
        this.phase = "NOON_DAMAGE";
        return true;
    },

    takeNoonHit(playerIdx) {
        if (this.phase !== "NOON_DAMAGE") return;
        const pnd = this.pendingNoonDamage;
        if (!pnd || pnd.playerIdx !== playerIdx) return;
        this.pendingNoonDamage = null;
        // Fáze musí být PLAY dřív, než zásah padne: handlePlayerDeath z ní pozná, že
        // umřel hráč na tahu, a nastaví _autoEndTurnPending (server posune tah).
        this.phase = "PLAY";
        this.handleDamage(playerIdx, null);
        if (this.winner) return;
        if (this.players[playerIdx].health <= 0) return;   // smrt → tah posune server

        // Zranění mohlo do fronty přidat odloženou akci (Bart Cassidy si líže za zásah).
        // Ta musí doběhnout dřív, než se rozjedou kontroly na Dynamit/Vězení.
        if (this.specialActionQueue.length > 0) {
            this._resumeBeginTurnAfterQueue = true;
            this._processSpecialQueue();
            return;
        }
        this._resumeBeginTurn();
    },

    // ── Sdílené dotazy pravidel ───────────────────────────────────────────────
    // Kolik karet Bang! smí hráč zahrát za tah (Přestřelka = 2).
    _bangLimit() {
        return this.hasEvent('PRESTRELKA') ? 2 : 1;
    },

    // Kazatel: hráč nesmí ve SVÉM tahu zahrát kartu Bang! – včetně Vedle! v roli Bang!
    // u Calamity Janet (FAQ H5) a Bang! jako reakce v duelu ve vlastním tahu (FAQ H2).
    // Karty s bang-EFEKTEM (Úder, Nůž, Derringer, Springfield…) to neomezuje – nejsou
    // to karty Bang!.
    _bangBlocked(playerIdx) {
        return this.hasEvent('KAZATEL') && playerIdx === this.currentPlayerIndex;
    },

    // Reverend: po celé kolo nejde zahrát Pivo (Salón ano – není to karta Pivo, FAQ H1).
    _beerBlocked() {
        return this.hasEvent('REVEREND');
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HighNoonMixin;
} else {
    Object.assign(GameState.prototype, HighNoonMixin);
}
})();
