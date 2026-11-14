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
    // `opts` (fáze A3): `oneTarget` – všechny žetony na jedno místo jedním klikem (Bass
    // Greeves), `from: 'CHAR'` – žetony jdou z postavy, ne ze zásoby (Red Ringo),
    // `direct` – fáze se zakládá přímo z PLAY (schopnost), ne z fronty odložených akcí.
    _adStartPlace(playerIdx, n, reason, opts = {}) {
        this.pendingAdPlace = { playerIdx, left: n, reason,
                                ...(opts.oneTarget ? { oneTarget: true } : {}),
                                ...(opts.from ? { from: opts.from } : {}),
                                ...(opts.direct ? { direct: true } : {}) };
        this.phase = "AD_PLACE";
        this.logEvent('ad_place', { who: this.players[playerIdx]?.name, n, reason });
    },

    // Klik na kartu / postavu: položí se 1 žeton ze zásoby (Red Ringo: z postavy; Bass
    // Greeves: všechny naráz). Vrací true, když prošel.
    adPlace(playerIdx, seat, cardId) {
        const pa = this.pendingAdPlace;
        if (this.phase !== "AD_PLACE" || !pa || pa.playerIdx !== playerIdx) return false;
        if (!adPlaceOk(this, playerIdx, seat, cardId)) return false;
        const dst = this._adAt(seat, cardId);
        if (pa.oneTarget) {
            // Bass Greeves: „nemůžete dát po jednom žetonu na dvě různé karty". Co se nad
            // strop nevejde, propadá (pokyn se ignoruje).
            if (this._adAdd(dst, pa.left) <= 0) return false;
            this._adFinishPlace();
            return true;
        }
        const got = pa.from === 'CHAR' ? this._adMove(this.players[playerIdx], dst, 1)
                                       : this._adAdd(dst, 1);
        if (got <= 0) return false;
        pa.left--;
        if (pa.left <= 0 || adPlaceTargets(this, playerIdx).length === 0) this._adFinishPlace();
        return true;
    },

    // „Nechat v zásobě": zbytek žetonů hráč nerozmístí. Bass Greeves ne – kartu už
    // odhodil a žetony dát musí (aspoň jeden klik); fáze se pro něj zakládá, jen když
    // je kam, a končí, jakmile místo dojde.
    adPlaceDone(playerIdx) {
        const pa = this.pendingAdPlace;
        if (this.phase !== "AD_PLACE" || !pa || pa.playerIdx !== playerIdx) return false;
        if (pa.oneTarget && adPlaceTargets(this, playerIdx).length > 0) return false;
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
        if (pa && pa.direct) {
            // Schopnost postavy (Bass, Red Ringo) – zpátky do PLAY; Suzy, která odhozem
            // vyprázdnila ruku, si lízne teď (fronta).
            this.phase = "PLAY";
            this._processSpecialQueue();
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
    // `targetIdx` = cíl Paklíče / Biče (adUseTargetOk – posuzuje se před platbou).
    adUse(playerIdx, cardId, targetIdx = null) {
        const p = this.players[playerIdx];
        const card = p ? adFindCard(p, cardId) : null;
        if (!card || !adUseOk(this, playerIdx, card)) return false;
        const type = card.type;
        if (AD_USE_AIMED.includes(type) && !adUseTargetOk(this, playerIdx, card, targetIdx)) return false;
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
        } else if (type === CardType.AD_LOCK_PICK) {
            // Paklíč: náhodná karta z ruky libovolného hráče – cesta Paniky jen pro ruku,
            // bez vzdálenosti. Útěk / Mick Defender se smí vyhnout (jediný cíl), Henry
            // Block střílí (resolveCardSelection). Oblast je daná předem (`pick`).
            this._enterTargetSelection({ attackerIdx: playerIdx, targetIdx,
                                         sourceCardType: CardType.PANIC, ignoreDistance: true,
                                         adSource: card.name },
                                       { evade: card.name, pick: { area: 'hand', boardIdx: null } });
        } else if (type === CardType.AD_WHIP) {
            // Bič: odhoď libovolnou kartu ve hře – i u sebe (R6), bez vzdálenosti, ne z ruky.
            this._adBoardDiscard(playerIdx, targetIdx, card.name, false);
        }
        return true;
    },

    // Bič a Squaw: výběr karty ve hře cíle (cesta Cat Balou, u Squaw s vylepšením cesta
    // Paniky – karta do ruky), bez vzdálenosti a bez ruky (`adNoHand`). Cizímu hráči se
    // smí vyhnout (Útěk, Mick); na sebe okno úniku nevzniká (vosEvadable).
    _adBoardDiscard(attackerIdx, targetIdx, name, take) {
        this._enterTargetSelection({ attackerIdx, targetIdx,
                                     sourceCardType: take ? CardType.PANIC : CardType.CAT_BALOU,
                                     ignoreDistance: true, adNoHand: true, adSource: name },
                                   { evade: name });
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
        if (type === CardType.AD_RUST) return this._adRust(playerIdx);
        return false;
    },

    // ── Fáze A3: ruce a stoly (§4, §5) ──────────────────────────────────────────

    // Rez: „Všichni ostatní hráči musí odstranit po 1 ⛁ z každé své Nebezpečné karty
    // a z postavy. Všechny takto odstraněné ⛁ položte na svou postavu (do limitu 4)
    // a zbytek vraťte do zásoby." Po směru od hráče; vyčerpané karty se odhodí
    // (_adMove → _adDeplete). Henry Block nestřílí – žetony nejsou karty (R22).
    _adRust(playerIdx) {
        if (!adRustOk(this, playerIdx)) return false;
        const me = this.players[playerIdx];
        const n = this.players.length;
        let moved = 0;
        for (let k = 1; k < n; k++) {
            const q = this.players[(playerIdx + k) % n];
            if (!isInPlay(q)) continue;
            adCardsInPlay(q).slice().forEach(c => {
                if ((c.adLoads || 0) > 0) { this._adMove(c, me, 1); moved++; }
            });
            if ((q.adLoads || 0) > 0) { this._adMove(q, me, 1); moved++; }
        }
        this.logEvent('special', { who: me.name, card: 'Rez', msg: `sebral ${moved} ⛁ (na postavě ${me.adLoads || 0})` });
        return true;
    },

    // Šíp: každý cíl odhodí kartu BANG! (co bere obrana proti Indiánům – playsAsBang),
    // nebo ztratí 1 život. Jede po cestě Indiánů (RESPOND s requiredCard BANG!), jen se
    // seznamem cílů: `_adArrow.queue` čte _advanceMassAttack. Apache Kid je imunní (♦).
    // Jediný cíl se smí vyhnout (Útěk, Mick Defender) – víc cílů ne.
    _adArrowStart(attackerIdx, targets, card) {
        this.missesRequired = 1;
        this.missesPlayed = 0;
        this._massAttackSuit = this._effSuit(card);
        this._massAttackName = card.name;
        this._adArrow = { queue: targets.slice() };
        this.currentAttacker = attackerIdx;
        if (targets.length === 1 &&
            this._vosEvadeGate(attackerIdx, targets[0], card.name, { kind: 'AD_ARROW' })) return;
        this._adArrowNext(attackerIdx);
    },

    // Další cíl Šípu (volá _advanceMassAttack i okno úniku). Přeskočí, kdo mezitím
    // vypadl, Ducha a Apache Kida; po posledním se vrací do PLAY.
    _adArrowNext(originatorIdx) {
        const a = this._adArrow;
        while (a && a.queue.length) {
            const t = a.queue.shift();
            const tp = this.players[t];
            if (!isInPlay(tp) || isVosGhost(tp) || this._apacheImmune(t, this._massAttackSuit, originatorIdx)) continue;
            this.pendingResponse = {
                active: true, originatorIdx, targetIdx: t,
                requiredCard: CardType.BANG, sourceCard: CardType.INDIANS,
                sourceCardName: this._massAttackName || 'Šíp', responded: [], adArrow: true
            };
            this.missesRequired = 1;
            this.missesPlayed = 0;
            this.phase = "RESPOND";
            return;
        }
        this._adArrow = null;
        if (this.pendingResponse) this.pendingResponse.active = false;
        this.phase = "PLAY";
        this._processSpecialQueue();
    },

    // ── Postavy A3 ──────────────────────────────────────────────────────────────

    // Red Ringo: „Začínáš se 4 ⛁" – jen při rozdání postav (R14), ne Vera Custer ani Nová
    // identita. Volá se, když si všichni vyberou (nová i navazující hra).
    _adDealRingo() {
        if (!this._adOn()) return;
        this.players.forEach(p => {
            if (p && p.character === 'Red Ringo') this._adAdd(p, AD_RINGO_START, { fresh: true });
        });
    },

    // Bass Greeves: odhoď 1 kartu z ruky → 2 ⛁ ze zásoby na JEDNO své místo (fáze
    // AD_PLACE s `oneTarget`). Vrací odhozenou kartu (animace) nebo null.
    adBass(playerIdx, cardId) {
        if (!adBassOk(this, playerIdx)) return null;
        const p = this.players[playerIdx];
        const i = p.hand.findIndex(c => c && c.id === cardId);
        if (i === -1 || !adBassCardOk(this, playerIdx, p.hand[i])) return null;
        p._adBassTurn = this.turnId;
        const card = p.hand.splice(i, 1)[0];
        this.deck.discard(card);
        this.logEvent('special', { who: p.name, card: 'Bass Greeves', taken: card.name, msg: 'odhazuje za 2 ⛁' });
        this.checkSuzyLafayette(p);
        this._adStartPlace(playerIdx, 2, 'BASS', { oneTarget: true, direct: true });
        return card;
    },

    // Frankie Canton: 1 ⛁ z libovolné Nebezpečné karty ve hře nebo z cizí postavy na
    // Frankieho. Vyčerpaná karta se odhodí (_adMove → _adDeplete). Vrací true.
    adFrankie(playerIdx, seat, cardId) {
        if (!adFrankieOk(this, playerIdx) || !adFrankieSourceOk(this, playerIdx, seat, cardId)) return false;
        const p = this.players[playerIdx];
        const src = this._adAt(seat, cardId);
        p._adFrankieTurn = this.turnId;
        this.logEvent('special', { who: p.name, card: 'Frankie Canton', target: this.players[seat]?.name,
                                   taken: cardId == null ? 'postava' : src.name, msg: 'bere 1 ⛁' });
        this._adMove(src, p, 1);
        return true;
    },

    // Red Ringo: až 2 ⛁ z postavy na své Nebezpečné karty (fáze AD_PLACE s `from: 'CHAR'`;
    // obě na jednu kartu, nebo po jedné; zbytek smí nechat na postavě).
    adRingo(playerIdx) {
        if (!adRingoOk(this, playerIdx)) return false;
        const p = this.players[playerIdx];
        p._adRingoTurn = this.turnId;
        this._adStartPlace(playerIdx, Math.min(AD_RINGO_MOVE, p.adLoads || 0), 'RINGO', { from: 'CHAR', direct: true });
        return true;
    },

    // ── Fáze A2: zbraně a výstřely (§2.10) ──────────────────────────────────────
    // Výstřel si od zahrání nese kontext `vos` (Údolí stínů ho zavedlo pro Odměnu
    // a Brokovnici). Ozbrojení do něj přidává klíče, ne nový parametr:
    //   unavoidable   – Dvouhlavňovka (existující cesta Colorado Billa),
    //   adBuntline    – Buntline Special: zrušený výstřel → cíl odhodí kartu,
    //   adReturn: id  – vylepšená Křesadlovka: zrušený výstřel → karta zpátky do ruky,
    //   adMary        – karta BANG! Bloody Mary: zrušený výstřel → líznutí,
    //   adBigFifty    – Big Fifty (jen pro štítek; vypnutí drží `target._adMuted`).

    // Volá playBang, až je zahrání ověřené (adWeaponSpecialOk, adUpgradeOk, cíle
    // Rychlopalby) – teprve tady se platí, PŘED efektem. Vrací klíče kontextu nebo null.
    // `o` = { weapon, up, pay, bangCard, targetIdx }.
    _adShotStart(attackerIdx, card, o) {
        if (!this._adOn()) return null;
        const a = this.players[attackerIdx];
        const ctx = {};
        if (o.up) this._adPay(attackerIdx, o.pay);
        if (card.type === CardType.AD_FLINTLOCK && o.up) ctx.adReturn = card.id;
        // Bloody Mary: „Kdykoli je zrušena její karta BANG!, lízne si 1 kartu." Jen skutečná
        // karta BANG! (Křesadlovka, Rychlopalba ani Kulomet ne).
        if (o.bangCard && hasAbility(a, "Bloody Mary")) ctx.adMary = true;
        if (o.weapon) {
            const w = adWeaponOf(a);
            const eff = w.effect;
            // Cena se platí z té zbraně; vyčerpaná odejde PŘED efektem (dostřel už se
            // posoudil, R18). Efekt výstřelu ale platí – je zaplacený.
            this._adTake(w, adCardCost(w));
            this.logEvent('ad_use', { who: a.name, card: w.name, msg: AD_WEAPON_EFFECTS[eff] });
            if (eff === 'AD_BUNTLINE') ctx.adBuntline = true;
            else if (eff === 'AD_DOUBLE_BARREL') ctx.unavoidable = true;
            else if (eff === 'AD_THUNDERER') this._adThunder = { playerIdx: attackerIdx, cardId: card.id };
            else if (eff === 'AD_BIG_FIFTY') {
                ctx.adBigFifty = true;
                const t = this.players[o.targetIdx];
                if (t) t._adMuted = true;
            }
        }
        return Object.keys(ctx).length ? ctx : null;
    },

    // Thunderer: „vezmi si tu kartu BANG! zpátky do ruky" – hned po odhozu, ještě než cíl
    // zareaguje (R19). Animaci (do odhozu a zpátky) pošle handler play_bang.
    _adThunderReturn() {
        const t = this._adThunder;
        if (!t) return null;
        this._adThunder = null;
        const p = this.players[t.playerIdx];
        const c = p ? this.deck.takeFromDiscard(t.cardId) : null;
        if (!c) return null;
        p.hand.push(c);
        this.logEvent('special', { who: p.name, card: 'Thunderer', taken: c.name, msg: 'bere BANG! zpátky' });
        // Pro handler play_bang: karta letí do odhozu a zpátky (server/handlers.game.js).
        this._adThunderDone = { playerIdx: t.playerIdx, cardId: c.id };
        return this._adThunderDone;
    },

    // Karta z odhozu zpátky do ruky (Křesadlovka, Skrč se!). Animaci pošle hák před
    // broadcastem (`_adAnim` → flushAdAnim, server/anim.js) – zrušení výstřelu nastává
    // v různých akcích (obrana, Barel, Bedna).
    _adBackToHand(playerIdx, cardId, why) {
        const p = this.players[playerIdx];
        if (!p || !isInPlay(p)) return false;
        const c = this.deck.takeFromDiscard(cardId);
        if (!c) return false;
        p.hand.push(c);
        if (!this._adAnim) this._adAnim = [];
        this._adAnim.push({ type: 'discard_to_hand', toPlayerIdx: playerIdx, cardId });
        this.logEvent('special', { who: p.name, card: why, msg: 'karta zpátky do ruky' });
        return true;
    },

    // ── Trychtýř „výstřel byl zrušen" (§2.10, R17) ──────────────────────────────
    // Volá se ze všech míst, kde zrušení nastane: Barel/Jourdonnais ♥ (_applyCheckResult),
    // dokončená obrana Vedle!/Skrč se! (handleResponse), Útěk proti bang-efektu, Bedna.
    // NEvolá se u Apache Kida (výstřel se neodehrál) ani u Ms. Abigail (ignoruje efekt).
    // `pr` = { targetIdx, originatorIdx, vos, adDuck }.
    _adShotCanceled(pr) {
        if (!pr || !this._adOn()) return;
        const v = pr.vos || {};
        const tgt = pr.targetIdx, orig = pr.originatorIdx;
        // Skrč se! s vylepšením: karta se vrací do ruky obránci.
        (pr.adDuck || []).forEach(d => this._adBackToHand(d.playerIdx, d.cardId, 'Skrč se!'));
        if (v.adReturn != null && orig != null) this._adBackToHand(orig, v.adReturn, 'Křesadlovka');
        // Buntline Special: cíl odhodí kartu z ruky dle svého výběru – stejná fáze jako
        // Brokovnice (SHOTGUN_DISCARD, vynucený odhoz: Molly nelíže, Henry nestřílí).
        const t = this.players[tgt];
        if (v.adBuntline && t && isInPlay(t) && t.hand.length > 0) {
            this.specialActionQueue.push({ type: 'SHOTGUN_DISCARD', playerIdx: tgt, attackerIdx: orig, label: 'Buntline Special' });
            this.logEvent('special', { who: this.players[orig]?.name, card: 'Buntline Special', target: t.name, msg: 'odhodí kartu' });
        }
        // Bloody Mary: zrušená karta BANG! → líznutí.
        if (v.adMary && orig != null && isInPlay(this.players[orig])) {
            this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: orig, cardsNeeded: 1, label: 'Bloody Mary' });
            this.logEvent('special', { who: this.players[orig].name, card: 'Bloody Mary', msg: 'lízne si kartu' });
        }
    },

    // Big Fifty: konec výstřelu – cílům se vrací schopnost i karty. Volá se na koncích
    // obrany (handleResponse, úspěšný Barel, Bedna, záchrana, Dvojitá rána, Apache Kid)
    // a pojistkou v nextTurn. Dokud příznak drží, hasAbility cíli nic nepovolí.
    _adShotEnd() {
        (this.players || []).forEach(p => { if (p && p._adMuted) delete p._adMuted; });
    },

    // ── Bedna (§4) ──────────────────────────────────────────────────────────────
    // „Zaplať 2 ⛁ z této karty: účinkuje jako Vedle!." V RESPOND je to jedno Vedle!
    // (proti Slabovi zbývá ještě jedno), ve fázi BARREL_DRAW zruší výstřel rovnou (adCrateOk
    // ji tam pustí jen tehdy, když jedno Vedle! stačí). Vrací true, když se použila.
    adCrate(playerIdx) {
        if (!adCrateOk(this, playerIdx)) return false;
        const p = this.players[playerIdx];
        const crate = adCrateCard(p);
        this._adTake(crate, adCardCost(crate));
        this.logEvent('ad_use', { who: p.name, card: 'Bedna', msg: 'účinkuje jako Vedle!' });
        if (this.phase === "BARREL_DRAW") {
            const pb = this.pendingBarrelCheck;
            this.pendingBarrelCheck = null;
            this.missesPlayed = 0;
            this._adShotCanceled({ targetIdx: pb.targetIdx, originatorIdx: pb.attackerIdx, vos: pb.vos });
            this._adShotEnd();
            if (pb.sourceCard === CardType.GATLING || pb.sourceCard === CardType.INDIANS) {
                this._advanceMassAttack(pb.targetIdx, pb.attackerIdx, pb.sourceCard);
                this._processSpecialQueue();
            } else {
                this.phase = "PLAY";
                if (!this._afterFistfulHit()) this._processSpecialQueue();
                this.targetPlayer = null;
                this.currentAttacker = null;
            }
            return true;
        }
        // RESPOND: jako zahrané Vedle! (bez karty – nic se neodhazuje, Molly nelíže).
        const pr = this.pendingResponse;
        this.missesPlayed = (this.missesPlayed || 0) + 1;
        if (this.missesPlayed < (this.missesRequired || 1)) return true;
        this._vosBackfireCheck(pr, playerIdx);
        this._adShotCanceled(pr);
        pr.partialMisses = [];
        this.missesPlayed = 0;
        this.missesRequired = 1;
        pr.responded.push(playerIdx);
        this._respondAdvance(playerIdx, true);
        return true;
    },

    // ── Mexicali Kid (§5) ───────────────────────────────────────────────────────
    // „Jednou ve svém tahu smí zaplatit 2 ⛁ a vystřelit BANG!" na cíl v dostřelu zbraně.
    // Bang-efekt (bez limitu, bez efektu zbraně, bez Slaba); Barel, Jourdonnais i Bedna
    // fungují. Cíl se posuzuje před platbou (R18). Vrací true, když se vystřelilo.
    adMexicali(playerIdx, targetIdx, pay) {
        if (!adMexicaliOk(this, playerIdx)) return false;
        if (!adQuickTargets(this, playerIdx).includes(targetIdx)) return false;
        if (!adPayOk(this, playerIdx, pay, AD_MEXICALI_COST)) return false;
        const p = this.players[playerIdx];
        p._adMexTurn = this.turnId;
        this._adPay(playerIdx, pay);
        this.logEvent('bang', { who: p.name, target: this.players[targetIdx].name, card: 'Mexicali Kid' });
        this.currentAttacker = playerIdx;
        this._beginBangResolution(playerIdx, targetIdx, true, 'Mexicali Kid', null, null, { shot: 'MEXICALI' });
        this._processSpecialQueue();
        return true;
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ArmedMixin;
else Object.assign(GameState.prototype, ArmedMixin);
})();
