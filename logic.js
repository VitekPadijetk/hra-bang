// Sdílená čistá logika vzdálenosti/dostřelu. V prohlížeči jsou computeDistance/computeCanHit
// globály z core/distance.js (načteno PŘED logic.js). V Node je sem musíme načíst přes require.
if (typeof computeDistance === 'undefined' && typeof require === 'function') {
    const __dist = require('./core/distance.js');
    globalThis.computeDistance = __dist.computeDistance;
    globalThis.computeCanHit = __dist.computeCanHit;
    globalThis.bangEffectReach = __dist.bangEffectReach;
    globalThis.effectiveCharacter = __dist.effectiveCharacter;
}

// V Node nejsou entity globály — načteme je z logic/entities.js a vystavíme na globalThis,
// aby na ně metody GameState mohly sahat bez kvalifikace. V prohlížeči jsou to globály
// z <script src="logic/entities.js"> načteného PŘED logic.js.
if (typeof CardType === 'undefined' && typeof require === 'function') {
    const __ent = require('./logic/entities.js');
    globalThis.CardType = __ent.CardType;
    globalThis.Suits = __ent.Suits;
    globalThis.ALL_CHARACTERS = __ent.ALL_CHARACTERS;
    globalThis.DODGE_CITY_CHARACTERS = __ent.DODGE_CITY_CHARACTERS;
    globalThis.Card = __ent.Card;
    globalThis.Player = __ent.Player;
    globalThis.Deck = __ent.Deck;
}

// Čisté helpery rolí/výhry. V prohlížeči globály z core/*, v Node přes require.
if (typeof rolesForPlayerCount === 'undefined' && typeof require === 'function') {
    const __roles = require('./core/roles.js');
    globalThis.rolesForPlayerCount = __roles.rolesForPlayerCount;
    globalThis.healthForCharacter = __roles.healthForCharacter;
}
if (typeof evaluateWinner === 'undefined' && typeof require === 'function') {
    globalThis.evaluateWinner = require('./core/winCondition.js').evaluateWinner;
}

class GameState {
    constructor() {
        this.players = [];
        this.deck = new Deck();
        // Deck loguje reshuffle/prázdný balíček přes logEvent (no-op než server nastaví _onEvent).
        this.deck._log = (type, data) => this.logEvent(type, data);
        this.currentPlayerIndex = 0;
        this.phase = "MENU";
        this.winner = null;
        
        this.storeCards = [];
        this.storePickerIndex = 0;
        this.storeAnim = null;   // cinematika hokynářství (řídí klient): { dealtBefore, mode, shuffleCount, total }

        this.pendingResponse = {
            active: false,
            originatorIdx: null,
            targetIdx: null,
            requiredCard: null,
            sourceCard: null,
            responded: []
        };

        this.drawPhaseState = {
            active: false,
            playerIdx: null,
            cardsNeeded: 2,
            cardsDrawn: 0,
            options: []
        };

        this.sidKetchumPending = null;
        this.specialActionQueue = [];
        this.pendingBartDraw = null;
        this.pendingUhybDraw = null;
        this.pendingElGringoSteal = null;
        this.turnId = 0;   // monotonní ID tahu (zelené karty: nelze aktivovat ve stejném tahu)
        // Dodge City – „odhoď další kartu" (cíl se volí PŘED zaplacením další karty).
        this.pendingDiscardAnother = null;
        this.pendingVeraCopy = null;   // Vera Custer – čeká na volbu kopírované postavy
        // Dělení karet mrtvého mezi VÍC Vulture Samů (Vulture Sam + Vera Custer, která ho
        // kopíruje): { deadIdx, pickers, next }. Viz logic/characters.js.
        this.pendingVultureSplit = null;
        this._pendingDeathReveal = null;   // po dodělení: server dohraje odhalení role
        this.brawlQueue = null;
        this.brawlAttackerIdx = null;
        this.interruptedPhase = null;
        this.lastAnimEvent = null;
        this.pendingDynamiteDamage = null;
        // Rozšíření High Noon – balíček událostí a právě platná karta. Bez zapnutého
        // rozšíření zůstává balíček prázdný a hasEvent() vrací vždy false.
        this.eventDeck = [];
        this.eventPile = [];            // už odkryté události (nejstarší → nejnovější)
        this.activeEvent = null;
        this.pendingNoonDamage = null;   // Pravé poledne: čeká se na kliknutí na životy
        this.daltonsQueue = null;        // Daltonové: fronta hráčů odhazujících modrou kartu
        this._sheriffTurns = 0;          // kolikátý tah šerifa běží (událost až od 2.)
        this._beginTurnStep = 0;         // krokovač startu tahu (viz logic/highNoon.js)
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    // Deleguje na sdílenou čistou funkci z core/distance.js (this == {players}).
    getDistance(fromIdx, toIdx) {
        return computeDistance(this, fromIdx, toIdx);
    }

    canHit(attackerIdx, targetIdx) {
        return computeCanHit(this, attackerIdx, targetIdx);
    }

    // Apache Kid (Dodge City): kárové (♦) karty zahrané JINÝMI hráči na něj nemají efekt.
    // Voláno na všech cílených cestách (Bang!/bang-efekt, hromadné útoky, Panika/Cat Balou,
    // Vězení, Krytý vůz, Duel). Pozor: gate-uje se BARVA CÍLENÉ KARTY. Bang! zahrané jako
    // REAKCE uvnitř duelu jsou reakce (ne cílené karty), takže Apache Kida zasáhnou bez
    // ohledu na barvu – proto se v handleResponse tento test nevolá. Kárová karta, kterou
    // zahraje Apache Kid SÁM NA SEBE, efekt má (pravidlo mluví o kartách „ostatních hráčů").
    _apacheImmune(targetIdx, cardSuit, attackerIdx = null) {
        if (attackerIdx !== null && attackerIdx === targetIdx) return false;
        const t = this.players[targetIdx];
        return !!t && effectiveCharacter(t) === "Apache Kid" && cardSuit === Suits.DIAMONDS;
    }

    // Belle Star (Dodge City): v jejím tahu nemají cizí karty na stole (Barel, Mustang/Skrýš,
    // zelené Vedle!) žádný efekt. Platí, jen když útočí ona sama (aktuální hráč). Dosah řeší
    // computeDistance (core/distance.js), tady se gate-uje Barel a zelené reakce.
    _belleIgnoresBoard(attackerIdx) {
        return attackerIdx === this.currentPlayerIndex &&
               effectiveCharacter(this.players[this.currentPlayerIndex]) === "Belle Star";
    }

    // Limit karet v ruce na konci tahu. Normálně = počet životů; Sean Mallory (Dodge City)
    // drží až 10 karet.
    _handLimit(player) {
        if (player && effectiveCharacter(player) === "Sean Mallory") return 10;
        return player ? (player.health || 0) : 0;
    }

    // Vyléčení se stropem na maximu životů. Mrtvého (0 životů) neléčí – ten se vrací
    // do hry jen přes vlastní pravidla (Pivo při posledním životě, Sid Ketchum).
    _heal(player, amount = 1) {
        if (!player || player.health <= 0 || amount <= 0) return 0;
        const before = player.health;
        player.health = Math.min(player.health + amount, player.maxHealth);
        return player.health - before;
    }

    discardCard(cardIdx) {
        const p = this.getCurrentPlayer();
        if (this.phase !== "DISCARD") return;
        const card = p.hand.splice(cardIdx, 1)[0];
        if (card) this.deck.discardPile.push(card);
        p.stats.cardsDiscarded++;
        if (p.hand.length <= this._handLimit(p)) {
            this.nextTurn();
        }
    }

    nextTurn() {
        this.turnId = (this.turnId || 0) + 1;   // monotonní ID tahu (zelené karty: „nelze aktivovat ve stejném tahu")
        // High Noon – Zlatá horečka: hraje se proti směru hodinových ručiček. Krok musí
        // použít i cyklus přeskakující mrtvé, jinak by se směr u mrtvého souseda obrátil.
        const step = this._turnStep();
        this.currentPlayerIndex = (this.currentPlayerIndex + step) % this.players.length;
        let p = this.players[this.currentPlayerIndex];
        while (p.health <= 0) {
            this.currentPlayerIndex = (this.currentPlayerIndex + step) % this.players.length;
            p = this.players[this.currentPlayerIndex];
        }
        const cp = this.players[this.currentPlayerIndex];
        this.logEvent('turn', { who: cp?.name, role: cp?.role, hp: cp?.health, max: cp?.maxHealth, hand: cp?.hand?.length });
        // High Noon: odkrytí události (šerif) a Pravé poledne se vyhodnocují PŘED
        // kontrolami na Dynamit/Vězení. Když si start tahu vyžádá rozhodnutí hráče,
        // pokračuje se až z _resumeBeginTurn (viz logic/highNoon.js).
        if (this._beginTurn()) return;
        this.handleStartOfTurnChecks();
    }

    openStore() {
        this.phase = "STORE";
        this.storeCards = [];
        const aliveCount = this.players.filter(p => p.health > 0).length;
        const origCount = this.deck.cards.length;
        for (let i = 0; i < aliveCount; i++) {
            this.storeCards.push(this.deck.draw());
        }
        // Cinematika hokynářství řízená klientem (zvednutí balíčků, rozdání, míchání
        // v horní poloze). dealtBefore (k) = kolik karet šlo rozdat z původního balíčku;
        // mode: 'none' = dost karet, balíček nevyprázdněn; 'proactive' = přesně tolik,
        // kolik se rozdává → balíček se vyprázdnil, míchá se až při výběru (neblokuje);
        // 'blocking' = málo karet → zbytek se rozdá až po zamíchání (výběr zamčen).
        const dealt = this.storeCards.filter(c => c).length;
        const k = Math.min(origCount, dealt);
        let mode = 'none';
        if (origCount < aliveCount) mode = 'blocking';
        else if (origCount === aliveCount) mode = 'proactive';
        const shuffleCount = this.deck._reshuffleOccurred ? (this.deck._reshuffleCount || 0) : 0;
        // origCount = kolik karet měl balíček PŘED rozdáním. Klient podle něj kreslí
        // hromádku po dobu rozdávání (stav už obsahuje případně zamíchaný balíček).
        this.storeAnim = { dealtBefore: k, mode, shuffleCount, total: dealt, origCount };
        // Míchání si přebírá klientská cinematika → potlač legacy reshuffle_anim a
        // jeho zpoždění broadcastu (handleReshuffleAndBroadcast).
        this.deck._reshuffleOccurred = false;
        this.deck._reshuffleCount = 0;
        this.deck._reshuffleWasProactive = false;
        this.storePickerIndex = this.currentPlayerIndex;
    }

    pickFromStore(cardIdx) {
        const card = this.storeCards[cardIdx];
        if (!card) return;
        this.storeCards[cardIdx] = null;
        this.players[this.storePickerIndex].hand.push(card);

        do {
            this.storePickerIndex = (this.storePickerIndex + 1) % this.players.length;
        } while (this.players[this.storePickerIndex].health <= 0);

        if (this.storeCards.every(c => c === null)) {
            this.phase = "PLAY";
            this.storeCards = [];
            this.storeAnim = null;
        }
    }

    tryEndTurn() {
        // Tah jde ukončit jen z hraní (a z odhazování, kde je to no-op). Opožděný klik
        // na „Ukončit tah" doručený už během lízání/reakce by jinak tah zahodil rovnou
        // (bez líznutí) nebo ukončil tah někomu jinému uprostřed obrany.
        if (this.phase !== "PLAY" && this.phase !== "DISCARD") return;
        const p = this.getCurrentPlayer();
        if (!p) {
            this.nextTurn();
            return;
        }
        const handLength = p.hand ? p.hand.length : 0;
        if (handLength > this._handLimit(p)) {
            this.phase = "DISCARD";
        } else {
            this.nextTurn();
        }
    }

    checkWinCondition() {
        if (this.isDebug) {
            const alive = this.players.filter(p => p.health > 0);
            const sheriff = alive.find(p => p.role === "Sheriff");
            const outlaws = alive.filter(p => p.role === "Outlaw");
            const renegades = alive.filter(p => p.role === "Renegade");
            let result = null;
            if (!sheriff) {
                result = alive.length === 1 && alive[0].role === "Renegade"
                    ? "Odpadlík by vyhrál!" : "Bandité by vyhráli!";
            } else if (outlaws.length === 0 && renegades.length === 0) {
                result = "Zákon by vyhrál!";
            }
            if (result) this.logEvent('system', { msg: `DEBUG – ${result} (hra pokračuje)` });
            return;
        }
        const w = evaluateWinner(this.players);
        if (w) {
            this.winner = w;
            this.logEvent('win', {
                winner: this.winner,
                survivors: this.players.filter(p => p.health > 0).map(p => `${p.name}(${p.role})`),
            });
        }
    }

    _trackCard(playerIdx, cardType) {
        const s = this.players[playerIdx]?.stats;
        if (!s) return;
        s.cardsUsed[cardType] = (s.cardsUsed[cardType] || 0) + 1;
        s.cardsPlayed++;
    }

    // Strukturovaná herní událost → injektovaný sink `_onEvent` (nastaví server v
    // lifecycle.js; zapíše ji do logu hry). V prohlížeči/testech je _onEvent undefined →
    // no-op. Funkce se přes JSON.stringify neserializuje, takže neuniká do klienta.
    logEvent(type, data) {
        if (!this._onEvent) return;
        try {
            this._onEvent(Object.assign({ ev: type, turn: this.turnId, phase: this.phase }, data || {}));
        } catch (_) { /* logování nesmí shodit pravidla */ }
    }
}

// ── Mixiny GameState ────────────────────────────────────────────────────────
// Tematicky rozdělené metody GameState žijí v logic/*. V Node je sem připojíme na
// prototyp; v prohlížeči se připojí samy přes vlastní <script> tagy načtené PO logic.js
// (viz pořadí v index.html). Konstanty/helpery v jejich tělech jsou globály z výše
// uvedených shimů (Node) nebo z dříve načtených <script> (browser).
if (typeof module !== 'undefined' && typeof require === 'function') {
    Object.assign(GameState.prototype,
        require('./logic/setup.js'),
        require('./logic/draw.js'),
        require('./logic/play.js'),
        require('./logic/combat.js'),
        require('./logic/response.js'),
        require('./logic/characters.js'),
        require('./logic/checks.js'),
        require('./logic/dodgeCity.js'),
        require('./logic/highNoon.js')
    );
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameState, Deck, Player, Card, CardType, Suits, ALL_CHARACTERS, DODGE_CITY_CHARACTERS };
}