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

    // Hráč odchází ze hry (vyřazení, konec tahu ducha Města duchů, odchod stínu, Duch
    // Údolí stínů bez karty): žetony z postavy jdou do zásoby (R14). Karty se nemusí
    // řešit – ty hru opouštějí samy a zásoba je přestane počítat. Postava ale zůstává
    // u stolu, a kdyby se vrátila (Hřbitov, Mrtvý muž, další tah ducha/stínu) se starým
    // číslem, počítalo by se znovu a zásoba by šla do minusu.
    _adLeavePlay(idx) {
        const p = this.players[idx];
        if (p && p.adLoads) this._adTake(p, p.adLoads);
    },

    // Adresa žetonu { seat, cardId } → objekt, na kterém žetony leží (postava nebo
    // Nebezpečná karta hráče ve hře). null = neplatná adresa.
    _adAt(seat, cardId) {
        const p = this.players[seat];
        if (!p) return null;
        return cardId == null ? p : adFindCard(p, cardId);
    },

    // ── Rozmístění žetonů – fáze AD_PLACE (§2.7, R-U1) ─────────────────────────
    // Hráč dává žetony ze zásoby RUČNĚ, po jednom kliku (ad_place), a smí zbytek nechat
    // v zásobě (ad_place_done). Spouštěče: zahraná modrá karta (fronta odložených akcí –
    // až doběhne efekt karty), Nabíjení (taky frontou) a odhoz nad limit v 3. fázi
    // (`_adDiscardPlace`, pak teprve nextTurn).

    // Zahrál hráč modrou kartu (i Vězení na jiného, i Ducha)? Dostane 1 žeton – ale až
    // doběhne efekt karty, proto fronta. Oranžová karta žeton nedostává (R-U2), předaný
    // Dynamit taky ne („ne ve chvíli, kdy modrou kartu od někoho dostanete").
    _adQueueBlue(playerIdx, card) {
        if (!this._adOn() || !isBlueCard(card)) return;
        if (!isInPlay(this.players[playerIdx])) return;
        this.specialActionQueue.push({ type: 'AD_PLACE', playerIdx, n: 1, reason: 'BLUE' });
    },

    // Založ fázi rozmisťování. Volá se jen tehdy, když je kam žetony dát (fronta
    // neplatné položky vyhází v _pruneSuzyQueue, odhoz se ptá sám).
    _adStartPlace(playerIdx, n, reason) {
        this.pendingAdPlace = { playerIdx, left: n, reason };
        this.phase = "AD_PLACE";
        this.logEvent('ad_place', { who: this.players[playerIdx]?.name, n, reason });
    },

    // Klik na kartu / postavu: položí se 1 žeton ze zásoby. Vrací true, když prošel.
    adPlace(playerIdx, seat, cardId) {
        const pa = this.pendingAdPlace;
        if (this.phase !== "AD_PLACE" || !pa || pa.playerIdx !== playerIdx) return false;
        if (!adPlaceOk(this, playerIdx, seat, cardId)) return false;
        if (this._adAdd(this._adAt(seat, cardId), 1) <= 0) return false;
        pa.left--;
        if (pa.left <= 0 || adPlaceTargets(this, playerIdx).length === 0) this._adFinishPlace();
        return true;
    },

    // „Nechat v zásobě": zbytek žetonů hráč nerozmístí.
    adPlaceDone(playerIdx) {
        const pa = this.pendingAdPlace;
        if (this.phase !== "AD_PLACE" || !pa || pa.playerIdx !== playerIdx) return false;
        this._adFinishPlace();
        return true;
    },

    _adFinishPlace() {
        const pa = this.pendingAdPlace;
        this.pendingAdPlace = null;
        if (pa && pa.reason === 'DISCARD') {
            // Odhoz nad limit byl poslední krok tahu – teprve teď se tah posune.
            this.phase = "DISCARD";
            this.nextTurn();
            return;
        }
        this._resumeAfterSpecial();
    },

    // 3. fáze: hráč odhodil N karet nad limit → N žetonů ze zásoby. Volá discardCard,
    // když ruka klesla na limit; vrací true, když se rozmisťuje (nextTurn pak zavolá
    // až konec fáze AD_PLACE). Počítadlo se nuluje vždy, ať příští tah začíná od nuly.
    _adDiscardPlace(playerIdx) {
        const p = this.players[playerIdx];
        const n = (p && p._adDiscarded) || 0;
        if (p) p._adDiscarded = 0;
        if (!this._adOn() || n <= 0 || adPlaceTargets(this, playerIdx).length === 0) return false;
        this._adStartPlace(playerIdx, n, 'DISCARD');
        return true;
    },

    // ── Platba (§2.8) ───────────────────────────────────────────────────────────
    // `pay` už prošel adPayOk. Žetony se berou po zdrojích naráz: vyčerpaná karta se
    // odhodí (`_adTake` → `_adDeplete`) a další položka by ji už nenašla.
    _adPay(playerIdx, pay) {
        const groups = new Map();
        (pay || []).forEach(it => {
            const cid = it.cardId == null ? null : it.cardId;
            groups.set(cid, (groups.get(cid) || 0) + 1);
        });
        for (const [cid, n] of groups) this._adTake(this._adAt(playerIdx, cid), n);
    },

    // ── Použití Nebezpečné karty (§2.9) ─────────────────────────────────────────
    // Klik na vlastní oranžovou kartu ve fázi PLAY. Cena se platí z té karty (volba
    // není); když ji vyprázdní, karta odejde PŘED efektem. Co je klikací, říká adUseOk
    // (core/armed.js) – tentýž dotaz má klient i bot. Vrací true, když se použila.
    adUse(playerIdx, cardId) {
        const p = this.players[playerIdx];
        const card = p ? adFindCard(p, cardId) : null;
        if (!card || !adUseOk(this, playerIdx, card)) return false;
        const type = card.type;
        this._adTake(card, adCardCost(card));
        this.logEvent('ad_use', { who: p.name, card: card.name });
        if (type === CardType.AD_ACE) {
            // Eso v rukávu: lízni 1 kartu – běžná fáze lízání mimo začátek tahu
            // (vzor Rýžovací mísy), karta přiletí klikem na balíček.
            this._setDrawPhase({ active: true, playerIdx, cardsNeeded: 1, cardsDrawn: 0,
                                 options: ['deck'], isStartOfTurn: false });
            this.phase = "DRAW";
        } else if (type === CardType.AD_BEER_KEG) {
            // Bečka piva: +1 život. Není to karta Pivo (R11) – Madam Yto, Limonádový Jim
            // ani Tequila Joe se jí netýkají a platí i ve dvou hráčích.
            this._heal(p, 1);
        } else if (type === CardType.AD_BELL_TOWER) {
            // Zvonice: příští zahraná karta vidí všechny ve vzdálenosti 1 (adBellActive).
            p._adBell = { turn: this.turnId, at: p._playedThisTurn || 0 };
        }
        return true;
    },

    // Bandalír: BANG! nad limit projde, když Bandalír v tomhle tahu ještě nepomohl
    // a má žeton – zaplatí se 1 z něj (R21). Volá playBang, až je jisté, že výstřel
    // projde; `base` = limit bez Bandalíru.
    _adBandolierPay(p, base) {
        if (!this._adOn() || !p || (p.bangsPlayedThisTurn || 0) < base) return;
        if (p._adBandTurn === this.turnId) return;
        const b = adCardsInPlay(p).find(c => c.type === CardType.AD_BANDOLIER);
        if (!b) return;
        p._adBandTurn = this.turnId;
        this._adTake(b, adCardCost(b));
        this.logEvent('ad_use', { who: p.name, card: b.name, msg: 'BANG! navíc' });
    },

    // ── Hnědé karty A1: Nabíjení, Kolona, Malý doušek (§4) ──────────────────────
    // Volá je playCard (karta z ruky) i Lee Van Kliff (opakování – bez vylepšení).
    // `up` = počet vylepšení, platba už proběhla. Vrací true, když efekt proběhl.
    _adBrownEffect(playerIdx, type, up = 0) {
        const p = this.players[playerIdx];
        if (type === CardType.AD_RELOAD) {
            if (!adReloadOk(this, playerIdx)) return false;
            // Do fronty: rozmisťuje se, až doběhne efekt karty (a Suzy si lízne až potom).
            this.specialActionQueue.push({ type: 'AD_PLACE', playerIdx, n: 3, reason: 'RELOAD' });
            return true;
        }
        if (type === CardType.AD_CARAVAN) {
            // Kolona: lízni 2 + vylepšení. Líže se jako Dostavník, ale Dostavník to není –
            // kartu Divokého západu neotáčí (žádné wwsFlip).
            this._setDrawPhase({ active: true, playerIdx, cardsNeeded: 2 + up, cardsDrawn: 0,
                                 options: ['deck'], isStartOfTurn: false });
            this.phase = "DRAW";
            return true;
        }
        if (type === CardType.AD_NIP) {
            // Malý doušek: +1 život (+1 za vylepšení). Není to karta Pivo (R11).
            return this._heal(p, 1 + up) > 0;
        }
        return false;
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ArmedMixin;
else Object.assign(GameState.prototype, ArmedMixin);
})();
