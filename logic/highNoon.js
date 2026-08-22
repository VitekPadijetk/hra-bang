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
        this.eventPile = [];
        this.activeEvent = null;
        this._sheriffTurns = 0;
        this._beginTurnStep = 0;
        this._eventEntering = null;
        this.daltonsQueue = null;
        this.pendingHandcuffs = null;
        this.pendingNewIdentity = null;
        // Navazující hra přebírá hráče z předchozí – Kocovina, duch ani Želízka po nich
        // nesmí zůstat (druhou postavu rozdá až _dealSecondIdentities po výběru postav).
        (this.players || []).forEach(p => { p._noAbility = false; p._ghost = false; p._handcuffsSuit = null; });
        const on = options.expansions && options.expansions.high_noon;
        if (!on || !Array.isArray(this.highNoonCardData)) return;

        // Karty z přibaleného rozšíření (Nová identita, Želízka) jen na vyžádání.
        const pool = this.highNoonCardData
            .filter(c => !c.extra || this._hnExtraOn(options))
            .map(c => ({ id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null }));
        const last = pool.filter(c => c.key === LAST_EVENT_KEY);
        const rest = pool.filter(c => c.key !== LAST_EVENT_KEY);
        this.deck.shuffleArray(rest);
        // Líže se přes pop() z konce pole → Pravé poledne musí ležet na indexu 0.
        this.eventDeck = last.concat(rest);
        this.logEvent('system', { msg: `High Noon: balíček událostí (${this.eventDeck.length} karet)` });
    },

    // Patří do balíčku i dvě přibalené karty (Nová identita, Želízka)? Obě jsou původem
    // z A Fistful of Cards, takže se zapnutým Fistfulem se do hry přidávají samy –
    // zaškrtávátko v „Pokročilých možnostech" je jen pro hru se samotným High Noonem
    // (klient ho pak vůbec nekreslí, viz view/menu.js).
    _hnExtraOn(options) {
        const o = options || {};
        return !!o.highNoonExtra || !!(o.expansions && o.expansions.fistful);
    },

    // Je právě aktivní tahle událost? Jediný dotaz, kterým se ptají všechna pravidla.
    // Ptá se OBOU balíčků (High Noon i Fistful of Cards) – hrají se současně a klíče karet
    // jsou napříč nimi unikátní, takže se volající nemusí starat, ze kterého karta je.
    // Klientské zrcadlo: `eventActive` v core/highNoon.js.
    hasEvent(key) {
        return (!!this.activeEvent && this.activeEvent.key === key) ||
               (!!this.activeFistful && this.activeFistful.key === key);
    },

    // Požehnání / Prokletí: po celé kolo se VŠECHNY karty počítají jako srdcové / pikové.
    // Mění se jen barva, hodnota zůstává (Dynamit potřebuje ♠ 2–9, takže při Prokletí
    // vybuchne na každé kartě s hodnotou 2–9). Jediný zdroj pravdy pro barvu karty –
    // pravidla se na `card.suit` nikde neptají napřímo. Klientské zrcadlo:
    // core/highNoon.js `effSuit`, vizuální překreslení marek: buildCardTextures v game.js.
    _effSuit(card) {
        if (!card) return null;
        if (this.hasEvent('POZEHNANI')) return Suits.HEARTS;
        if (this.hasEvent('PROKLETI')) return Suits.SPADES;
        return card.suit;
    },

    // ── Start tahu ────────────────────────────────────────────────────────────
    // Volá se z nextTurn() a z obou míst v logic/setup.js, kudy jde PRVNÍ tah hry.
    // Vrací true, když se čeká na rozhodnutí hráče – volající pak NESMÍ pokračovat
    // do handleStartOfTurnChecks(), o to se postará _resumeBeginTurn().
    //
    // Kroky jsou očíslované (`_beginTurnStep`), aby se dalo kdykoli pauznout a vrátit
    // se přesně sem: 0 = odkrytí událostí (obou balíčků), 1 = okamžitý efekt karty
    // High Noon, 2 = okamžitý efekt karty Fistful, 3 = Pravé poledne, 4 = Nová identita.
    _beginTurn() {
        this._beginTurnStep = 0;
        // Želízka (High Noon) platí přesně jeden tah. Barvu je nutné zahodit hned na
        // začátku – ne až ve fázi lízání: kontroly na Dynamit/Vězení (a s nimi záchrana
        // Pivem) běží dřív a jely by ještě podle barvy z MINULÉHO tahu tohohle hráče.
        const cp = this.getCurrentPlayer();
        if (cp) cp._handcuffsSuit = null;
        return this._runBeginTurn();
    },

    _resumeBeginTurn() {
        if (this._runBeginTurn()) return;
        this.handleStartOfTurnChecks();
    },

    _runBeginTurn() {
        // Pořadí vyhodnocení: nejdřív High Noon, pak Fistful of Cards (viz logic/fistful.js).
        // Okamžité efekty obou karet jsou proto DVA kroky – když si ten první vyžádá
        // rozhodnutí hráče (Daltonové), musí se druhý spustit až po jeho dokončení.
        const steps = [this._flipEvent, this._applyEventOnEnter, this._applyFfEventOnEnter,
                       this._noonDamage, this._newIdentityOffer];
        while (this._beginTurnStep < steps.length) {
            const step = steps[this._beginTurnStep++];
            if (step.call(this)) return true;
        }
        return false;
    },

    // Odkrytí nové události. Jen na tahu prvního hráče a až od jeho DRUHÉHO tahu
    // („počínaje druhým kolem"). Prvním hráčem je šerif; ve hře pro 3 (Město duchů) šerif
    // není, takže kolo počítá tah pomocníka (_firstPlayerIndex). Animaci odkrytí dohraje
    // server podle `_pendingHighNoonReveal` (vyzvedne ji hák před broadcastem, server/anim.js).
    _flipEvent() {
        const p = this.getCurrentPlayer();
        if (!p || this.currentPlayerIndex !== this._firstPlayerIndex()) return false;
        this._sheriffTurns = (this._sheriffTurns || 0) + 1;
        if (this._sheriffTurns < 2) return false;

        if (this.eventDeck && this.eventDeck.length) {
            this.activeEvent = this.eventDeck.pop();
            // Odkryté karty zůstávají ležet na sobě (nová překryje předchozí) – klient z nich
            // kreslí hromádku lícem nahoru. `activeEvent` je vrchní karta hromádky.
            this.eventPile.push(this.activeEvent);
            this._eventEntering = this.activeEvent.key;
            this._pendingHighNoonReveal = Object.assign({}, this.activeEvent,
                { deck: 'hn', remaining: this.eventDeck.length });
            this.logEvent('event', { card: this.activeEvent.name, left: this.eventDeck.length });
        }
        // Balíček Fistful of Cards se otáčí ve stejný okamžik, hned za High Noonem – i když
        // High Noon už došel (proto se sem nesmí vracet dřív). Viz logic/fistful.js.
        this._flipFistfulEvent();
        return false;
    },

    // Efekty, které se vyhodnotí JEDNOU při příchodu karty do hry.
    _applyEventOnEnter() {
        const key = this._eventEntering;
        this._eventEntering = null;
        if (!key) return false;

        // Kocovina: po celé kolo neplatí žádné schopnosti postav. Příznak čte
        // effectiveCharacter (core/distance.js), kterým prochází VŠECHNY kontroly
        // schopností v pravidlech i v klientských zrcadlech. Přepisuje se při každé
        // výměně události – jinak by kocovina zůstala viset i po jejím překrytí.
        const hangover = key === 'KOCOVINA';
        (this.players || []).forEach(p => { p._noAbility = hangover; });

        if (key === 'DALTONOVE') return this._startDaltons();

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

    // ── Daltonové: každý odhodí jednu svou modrou kartu ───────────────────────
    // Pořadí od šerifa po směru hodinových ručiček – i při Zlaté horečce, protože
    // efekty karet jdou vždy po směru (FAQ H3). Ve hře pro 3 (Město duchů) šerif není,
    // takže se začíná u pomocníka (_firstPlayerIndex). Vybírá se stejnou cestou jako
    // u Rvačky (pendingSelection / SELECTING_TARGET_CARD), jen attacker === target: hráč
    // sahá na SVŮJ stůl. Klik klienta, bot i guard tím fungují beze změny.
    _startDaltons() {
        const n = this.players.length;
        const from = this._firstPlayerIndex();
        const order = [];
        for (let k = 0; k < n; k++) {
            const idx = (from + k) % n;
            if (this.players[idx].health > 0) order.push(idx);
        }
        this.daltonsQueue = order;
        this.logEvent('event', { card: 'Daltonové', order: order.map(i => this.players[i].name) });
        return this._advanceDaltons();
    },

    // Kolik modrých karet má hráč vyloženo. Modrá = výzbroj + karty na stole kromě
    // zelených (Dodge City). Vězení i Dynamit se počítají (FAQ H4).
    _daltonsBlueCount(p) {
        if (!p) return 0;
        const w = (p.weapon && p.weapon.id !== -1) ? 1 : 0;
        return w + (p.board || []).filter(c => !c.green).length;
    },

    // Postaví výběr pro dalšího hráče ve frontě (hráče bez modré karty přeskočí).
    // Vrací true, když se čeká na jeho klik.
    _advanceDaltons() {
        while (this.daltonsQueue && this.daltonsQueue.length > 0) {
            const idx = this.daltonsQueue.shift();
            const p = this.players[idx];
            if (p && p.health > 0 && this._daltonsBlueCount(p) > 0) {
                this.pendingSelection = {
                    attackerIdx: idx,
                    targetIdx: idx,
                    sourceCardType: CardType.CAT_BALOU,
                    ignoreDistance: true,
                    isDaltons: true,
                };
                this.phase = "SELECTING_TARGET_CARD";
                return true;
            }
        }
        this.daltonsQueue = null;
        return false;
    },

    // Po odhození: na řadu jde další hráč, po posledním se dokončí start tahu.
    _resumeDaltons() {
        if (this._advanceDaltons()) return;
        this.pendingSelection = null;
        // Odhoz mohl do fronty přidat odloženou akci (Suzy Lafayette s prázdnou rukou).
        // Ta musí doběhnout dřív, než se rozjede zbytek startu tahu (Pravé poledne,
        // kontroly na Dynamit/Vězení) – stejně jako po zásahu od Pravého poledne.
        this._pruneSuzyQueue();   // stejný důvod jako u dynamitu (viz logic/combat.js)
        if (this.specialActionQueue.length > 0) {
            this.phase = "PLAY";
            this._resumeBeginTurnAfterQueue = true;
            this._processSpecialQueue();
            return;
        }
        this._resumeBeginTurn();
    },

    // ── Město duchů: konec tahu ducha ─────────────────────────────────────────
    // Duch se na konci SVÉHO tahu vrací mezi vyřazené. Ruku má v tu chvíli prázdnou
    // (limit karet = počet životů = 0, FAQ H8) – co mu zbylo na stole, sebere Vulture Sam,
    // jinak to padá do odhozu. Greg Digger a Herb Hunter se spustí stejně jako při běžném
    // vyřazení (FAQ X4). Volá se z nextTurn PŘED posunem tahu; vrací true, když se tah
    // teď posunout NESMÍ (běží fronta odložených akcí, nebo je po hře).
    _teardownGhost() {
        const idx = this.currentPlayerIndex;
        const g = this.players[idx];
        if (!g || !g._ghost) return false;
        g._ghost = false;
        // Co si duch během tahu naléčil, tu končí. Normálně to shodí už tryEndTurn (ještě
        // před limitem karet), tady je to pojistka pro každou jinou cestu ke konci tahu –
        // vyřazený hráč musí mít nulu, jinak by ho `health > 0` počítalo za živého.
        g.health = 0;

        const weapon = (g.weapon && g.weapon.id !== -1) ? [g.weapon] : [];
        const leftCount = g.hand.length + g.board.length + weapon.length;
        // Pořadí Vulture Samů = po směru od odcházejícího (viz handlePlayerDeath).
        const vultures = [];
        for (let step = 1; step <= this.players.length; step++) {
            const i = (idx + step) % this.players.length;
            const p = this.players[i];
            if (i === idx || !p || p.health <= 0) continue;
            if (effectiveCharacter(p) === "Vulture Sam") vultures.push(i);
        }

        if (vultures.length > 1 && leftCount > 0) {
            // Víc Samů → karty se dělí po jedné (stejná cesta jako u smrti), jen se na
            // konci nedohrává odhalení role: duch ji má odkrytou od svého vyřazení.
            this.pendingVultureSplit = { deadIdx: idx, pickers: vultures, next: 0, isGhost: true };
            this.specialActionQueue.push({ type: 'VULTURE_SPLIT' });
        } else {
            if (vultures.length === 1) {
                const vulture = this.players[vultures[0]];
                vulture.hand.push(...g.hand, ...g.board, ...weapon);
                this.checkSuzyLafayette(vulture);
            } else if (leftCount > 0) {
                // Odhoz je vidět: klient přehraje stejnou animaci jako u šerifovy ztráty
                // karet (karty po jedné do odhozu, bez poklesu životů a bez role).
                this._ghostLeaveAnim = {
                    playerIdx: idx,
                    blue: g.board.map(c => ({ id: c.id })),
                    weapon: weapon.length ? { id: weapon[0].id } : null,
                    hand: g.hand.map(c => ({ id: c.id })),
                };
                this.deck.discardPile.push(...g.hand, ...g.board, ...weapon);
            }
            g.hand = [];
            g.board = [];
            g.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
        }

        this.players.forEach((p, i) => {
            if (i === idx || p.health <= 0) return;
            if (effectiveCharacter(p) === "Greg Digger") {
                p.health = Math.min(p.health + 2, p.maxHealth);
            }
            if (effectiveCharacter(p) === "Herb Hunter") {
                this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: i, cardsNeeded: 2 });
            }
        });

        this.logEvent('event', { card: 'Město duchů', who: g.name, msg: 'odchází ze hry' });
        // Duch se do teď počítal za živého (FAQ H7). Jeho odchodem může padnout
        // rozhodnutí, které do teď blokoval (poslední bandita/odpadlík byl on).
        this.checkWinCondition();
        if (this.winner) return true;

        this._pruneSuzyQueue();   // stejný důvod jako u dynamitu (viz logic/combat.js)
        if (this.specialActionQueue.length > 0) {
            this.phase = "PLAY";
            this._nextTurnAfterQueue = true;
            this._processSpecialQueue();
            return true;
        }
        return false;
    },

    // ── Zlatá horečka: hraje se proti směru hodinových ručiček ────────────────
    // Krok pro nextTurn (logic.js). Jediné místo, kde se směr obrací – posun dynamitu,
    // pořadí v hokynářství, hromadné útoky, Rvačka i Daltonové zůstávají po směru (FAQ H3).
    _turnStep() {
        return this.hasEvent('ZLATA_HORECKA') ? this.players.length - 1 : 1;
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
        this._pruneSuzyQueue();   // stejný důvod jako u dynamitu (viz logic/combat.js)
        if (this.specialActionQueue.length > 0) {
            this._resumeBeginTurnAfterQueue = true;
            this._processSpecialQueue();
            return;
        }
        this._resumeBeginTurn();
    },

    // ── Nová identita (přibalená karta z A Fistful of Cards) ──────────────────
    // Každý hráč má od začátku hry druhou postavu lícem dolů. Na začátku svého tahu
    // si ji smí vzít místo současné a klesnout na 2 životy; odložená postava se vymění
    // (příště se smí vrátit zpátky). Karty se rozdají až PO výběru postav – nevybrané
    // se totiž vracejí do balíčku, jinak by jich pro 7 hráčů bez Dodge City nezbylo dost.
    _dealSecondIdentities() {
        const o = this.options || {};
        if (!this._hnExtraOn(o) || !(o.expansions && o.expansions.high_noon)) return;
        // Odložená identita = ta z dvojice, kterou si hráč na začátku hry NEvybral.
        // Kde žádná volba nebyla – náhodné přiřazení (singleChar), debug hra (nabídka
        // je celý pool) nebo přeživší z minulé hry – se sáhne do zbytku balíčku postav.
        const taken = new Set(this.players.map(p => p.character).filter(Boolean));
        this.players.forEach(p => {
            const ch = Array.isArray(p.charChoices) ? p.charChoices : [];
            const rejected = ch.length === 2 ? ch.find(c => c && c !== p.character) : null;
            p._secondChar = (rejected && !taken.has(rejected)) ? rejected : null;
            if (p._secondChar) taken.add(p._secondChar);
        });
        const pool = this._characterPool(o).filter(c => !taken.has(c));
        this.deck.shuffleArray(pool);
        this.players.forEach(p => { if (!p._secondChar) p._secondChar = pool.pop() || null; });
        this.logEvent('system', { msg: `Nová identita: rozdány druhé postavy (${this.players.map(p => p._secondChar).join(', ')})` });
    },

    // Krok startu tahu: nabídka výměny. Vrací true → čeká se na rozhodnutí hráče.
    _newIdentityOffer() {
        if (!this.hasEvent('NOVA_IDENTITA')) return false;
        const p = this.getCurrentPlayer();
        if (!p || !isInPlay(p) || !p._secondChar) return false;
        this.pendingNewIdentity = { playerIdx: this.currentPlayerIndex, character: p._secondChar };
        this.phase = "NEW_IDENTITY";
        return true;
    },

    resolveNewIdentity(playerIdx, take) {
        if (this.phase !== "NEW_IDENTITY" || !this.pendingNewIdentity) return false;
        if (this.pendingNewIdentity.playerIdx !== playerIdx) return false;
        const p = this.players[playerIdx];
        this.pendingNewIdentity = null;
        if (take && p && p._secondChar) {
            const from = p.character;
            const to = p._secondChar;
            p.character = to;
            p._secondChar = from;          // stará postava se stane tou odloženou
            p._copiedCharacter = null;     // s postavou padá i kopie Very Custer
            const { base, max } = healthForCharacter(to, p.role);
            p.maxHealth = max;
            p._baseHealth = base;
            p.health = Math.min(2, max);   // „a klesne na 2 životy"
            this.logEvent('event', { card: 'Nová identita', who: p.name, from, to });
        }
        this.phase = "PLAY";
        this._resumeBeginTurn();
        return true;
    },

    // ── Želízka (přibalená karta z A Fistful of Cards) ────────────────────────
    // Po fázi lízání si hráč na tahu zvolí barvu a v tomto tahu smí hrát jen karty
    // té barvy. Volá se z _finishDraw (logic/draw.js); vrací true → čeká se na volbu.
    _startHandcuffs() {
        if (!this.hasEvent('ZELIZKA')) return false;
        const p = this.getCurrentPlayer();
        if (!p || !isInPlay(p)) return false;
        this.pendingHandcuffs = { playerIdx: this.currentPlayerIndex };
        this.phase = "HANDCUFFS_SUIT";
        return true;
    },

    chooseHandcuffsSuit(playerIdx, suit) {
        if (this.phase !== "HANDCUFFS_SUIT" || !this.pendingHandcuffs) return false;
        if (this.pendingHandcuffs.playerIdx !== playerIdx) return false;
        const all = [Suits.HEARTS, Suits.DIAMONDS, Suits.CLUBS, Suits.SPADES];
        if (!all.includes(suit)) return false;
        const p = this.players[playerIdx];
        p._handcuffsSuit = suit;
        this.pendingHandcuffs = null;
        this.phase = "PLAY";
        this.logEvent('event', { card: 'Želízka', who: p.name, suit });
        this._processSpecialQueue();
        return true;
    },

    // Smí hráč TUHLE kartu teď zahrát? Želízka omezují jen hráče na tahu – včetně karet
    // zahraných jako reakce v jeho VLASTNÍM tahu (stejný výklad jako u Kazatele, FAQ H2).
    // Týká se to VÝHRADNĚ karet hraných z RUKY: co už leží na stole, je ve hře, takže
    // aktivace zelené karty ani zelené Vedle! ze stolu barvou omezené nejsou (volající
    // se proto ptá jen u karet z ruky – tenhle helper to sám nepozná).
    // Barvu bere přes _effSuit, takže se to skládá s Požehnáním/Prokletím (i když se ty
    // s Želízky nikdy nepotkají – platná událost je vždy jen jedna).
    _suitBlocked(playerIdx, card) {
        if (!this.hasEvent('ZELIZKA') || !card) return false;
        if (playerIdx !== this.currentPlayerIndex) return false;
        const p = this.players[playerIdx];
        if (!p || !p._handcuffsSuit) return false;
        return this._effSuit(card) !== p._handcuffsSuit;
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
