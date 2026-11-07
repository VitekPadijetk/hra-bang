// logic/armed.js — mixin GameState: rozšíření Ozbrojení a nebezpeční (Armed & Dangerous).
// Připojuje se na GameState.prototype (browser: <script> po logic.js; Node: require z logic.js).
// Globály v těle (adOn, adSupply, AD_LOAD_CAP, isDangerousCard, …) poskytuje core/armed.js
// a core/cardRules.js (browser <script> dříve / Node shim v logic.js).
//
// Plán: docs/ozbrojeni-a-nebezpecni-plan.md. Jádrem rozšíření jsou ŽETONY NABITÍ, které
// leží na konkrétních kartách a postavách (`adLoads`). Fáze A0 staví jen to, bez čeho nic
// dalšího nejde: zásobu, tři jediné cesty změny a vyložení Nebezpečné karty se 3 žetony.
//
// ── Jediné cesty, kudy se žetony mění (§2.5, R3) ───────────────────────────────
// `.adLoads` se píše VÝHRADNĚ v `_adAdd`, `_adTake` a `_adMove` (hlídá to strukturální test
// procházející zdrojáky, test/ad.setup.test.js) – stejná dohoda jako `Deck` pro hromádky.
// Zásoba se nikam nezapisuje: počítá ji `adSupply` (core/armed.js) z toho, co leží ve hře.
// Adresa žetonu do budoucna (fáze A1) = { seat, cardId } – karta podle id, ne indexu.
(function () {
const ArmedMixin = {
    _adOn() {
        return adOn(this);
    },

    _adSupply() {
        return adSupply(this);
    },

    // Kde karta leží ve hře: { playerIdx, area: 'weapon' | 'board', idx } nebo null.
    _adHolderOf(card) {
        if (!card) return null;
        for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];
            if (!p) continue;
            if (p.weapon && p.weapon === card) return { playerIdx: i, area: 'weapon', idx: null };
            const idx = (p.board || []).indexOf(card);
            if (idx !== -1) return { playerIdx: i, area: 'board', idx };
        }
        return null;
    },

    // Ze zásoby na kartu/postavu. Strop 4 a jen kolik v zásobě je („pokud by měly být
    // přidány další, jednoduše tento pokyn ignorujte"). Vrací, kolik se doopravdy přidalo.
    // `opts.fresh` = vyložení karty: staré číslo, které na ní mohlo zůstat z dřívějška
    // (Panika ji vzala i se žetony, ty se ale počítaly zpátky do zásoby), se zahodí.
    _adAdd(dst, n, opts = {}) {
        if (!dst) return 0;
        if (opts.fresh) dst.adLoads = 0;
        const have = dst.adLoads || 0;
        const got = Math.max(0, Math.min(n, AD_LOAD_CAP - have, this._adSupply()));
        if (got <= 0) return 0;
        dst.adLoads = have + got;
        this.logEvent('ad_loads', { op: 'add', card: dst.name || null, n: got,
                                    now: dst.adLoads, supply: this._adSupply() });
        return got;
    },

    // Z karty/postavy do zásoby. Karta, ze které odejde poslední žeton, se hned odhodí
    // (`_adDeplete`). Vrací, kolik se doopravdy vzalo.
    _adTake(src, n) {
        if (!src) return 0;
        const got = Math.max(0, Math.min(n, src.adLoads || 0));
        if (got <= 0) return 0;
        src.adLoads -= got;
        this.logEvent('ad_loads', { op: 'take', card: src.name || null, n: got,
                                    now: src.adLoads, supply: this._adSupply() });
        if (isDangerousCard(src) && src.adLoads === 0) this._adDeplete(src);
        return got;
    },

    // Přesun z karty/postavy na jinou (Frankie Canton, Red Ringo, Rez). Co se nad strop
    // cíle nevejde, je prostě v zásobě (zásoba se počítá, nikam se nevrací). Vrací, kolik
    // doletělo na cíl.
    _adMove(src, dst, n) {
        if (!src || !dst || src === dst) return 0;
        const got = Math.max(0, Math.min(n, src.adLoads || 0));
        if (got <= 0) return 0;
        src.adLoads -= got;
        const put = Math.min(got, AD_LOAD_CAP - (dst.adLoads || 0));
        if (put > 0) dst.adLoads = (dst.adLoads || 0) + put;
        this.logEvent('ad_loads', { op: 'move', from: src.name || null, to: dst.name || null,
                                    n: got, landed: put, supply: this._adSupply() });
        if (isDangerousCard(src) && src.adLoads === 0) this._adDeplete(src);
        return put;
    },

    // Vyložení Nebezpečné karty: 3 žetony ze zásoby. `adArmOk` (core/armed.js) předem
    // zaručil, že v zásobě jsou – jinak se karta zahrát nesmí.
    _adArm(card) {
        return this._adAdd(card, AD_ARM_LOADS, { fresh: true });
    },

    // „Když jsou z Nebezpečné karty odebrány všechny žetony, kartu ihned odhoďte."
    // Zbraň se tím vrací na Colt .45. (Bomba místo odhozu vybuchne – fáze A4; do té doby
    // se do hry nedostane, adArmOk ji nepustí.)
    _adDeplete(card) {
        const h = this._adHolderOf(card);
        if (!h) return;
        const p = this.players[h.playerIdx];
        if (h.area === 'weapon') {
            p.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
        } else {
            p.board.splice(h.idx, 1);
        }
        this.deck.discard(card);
        this.logEvent('ad_deplete', { who: p.name, card: card.name });
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ArmedMixin;
else Object.assign(GameState.prototype, ArmedMixin);
})();
