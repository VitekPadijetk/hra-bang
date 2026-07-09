// logic/draw.js — mixin GameState: fáze lízání (běžná + Kit Carlson + Black Jack).
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {
const DrawMixin = {
    startDrawPhase() {
        const player = this.getCurrentPlayer();
        player.bangsPlayedThisTurn = 0;
        player._joseUses = 0;      // Dodge City: José Delgado max 2×/tah
        player._docUsed = false;   // Dodge City: Doc Holyday 1×/tah

        // Vera Custer (Dodge City) si postavu ke kopírování volí už v handleStartOfTurnChecks
        // (před checky na Dynamit/Vězení) – tady už je `_copiedCharacter` nastavené.

        if (effectiveCharacter(player) === "Kit Carlson") {
            this.startKitCarlsonDraw();
            return;
        }

        // Dodge City: Pixie Pete líže 3, Bill Noface 1 + 1 za každé zranění.
        let cardsNeeded = 2;
        if (effectiveCharacter(player) === "Pixie Pete") cardsNeeded = 3;
        else if (effectiveCharacter(player) === "Bill Noface") cardsNeeded = 1 + (player.maxHealth - player.health);

        this.drawPhaseState = { active: true, playerIdx: this.currentPlayerIndex, cardsNeeded, cardsDrawn: 0, options: this._getDrawOptions(player), isStartOfTurn: true };
        this.phase = "DRAW";
    },

    _getDrawOptions(player) {
        const opts = ['deck'];
        if (effectiveCharacter(player) === "Jesse Jones") opts.push('opponent_hand');
        if (effectiveCharacter(player) === "Pedro Ramirez") opts.push('discard');
        // Dodge City: Pat Brennan smí místo lízání vzít 1 kartu ze stolu libovolného hráče.
        if (effectiveCharacter(player) === "Pat Brennan") opts.push('board');
        return opts;
    },

    drawCard(source, sourceIdx = null, area = null, cardIdx = null) {
        console.log("DRAW", this.phase, this.drawPhaseState);
        if (this.phase !== "DRAW" || !this.drawPhaseState.active) return;

        const ds = this.drawPhaseState;
        const player = this.players[ds.playerIdx];

        // Dodge City: Pat Brennan – místo lízání vezmi 1 kartu ze stolu (výzbroj/modrá/zelená)
        // libovolného hráče do ruky; tím jeho fáze lízání končí (bere jen tuto jednu kartu).
        if (source === 'board' && effectiveCharacter(player) === "Pat Brennan" && ds.cardsDrawn === 0) {
            const target = this.players[sourceIdx];
            if (!target || target.health <= 0) return;
            let card = null;
            if (area === 'weapon') {
                if (target.weapon && target.weapon.id !== -1) {
                    card = target.weapon;
                    target.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
                }
            } else if (area === 'board') {
                if (target.board && target.board[cardIdx]) card = target.board.splice(cardIdx, 1)[0];
            }
            if (!card) return;
            if (card.green) delete card._playedTurn;   // v ruce už není „položená tento tah"
            player.hand.push(card);
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            this._finishDraw();
            return;
        }

        if (source === 'opponent_hand' && effectiveCharacter(player) === "Jesse Jones" && ds.cardsDrawn === 0) {
            const opponent = this.players[sourceIdx];
            if (!opponent || opponent.health <= 0 || opponent.hand.length === 0) return;
            const randomIdx = Math.floor(Math.random() * opponent.hand.length);
            player.hand.push(opponent.hand.splice(randomIdx, 1)[0]);
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            ds.options = ['deck'];
        }
        else if (source === 'discard' && effectiveCharacter(player) === "Pedro Ramirez" && ds.cardsDrawn === 0) {
            if (this.deck.discardPile.length === 0) return;
            const card = this.deck.discardPile.pop();
            player.hand.push(card);
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            ds.options = ['deck'];
        }
        else if (source === 'deck') {
            const card = this.deck.draw();
            console.log("LIZNUTA KARTA", card);
            if (!card) return;

            this.drawPhaseState.options = ['deck'];

            if (effectiveCharacter(player) === "Kit Carlson" && ds.isKitCarlson) {
                // FIX: Pro Kit Carlson je JAKÝKOLIV reshuffle vždy emergency –
                // výběr karet nesmí být zobrazen dřív než se zamíchá balíček.
                // Zachytíme reshuffle při c1 (už proběhl před tímto blokem)
                // i případný reshuffle při c2/c3.
                const reshuffledAtC1 = this.deck._reshuffleOccurred;
                const c2 = this.deck.draw();
                const c3 = this.deck.draw();
                if (reshuffledAtC1 || this.deck._reshuffleOccurred) {
                    this.deck._reshuffleWasProactive = false; // vždy emergency pro Kit Carlson
                }
                const revealed = [card, c2, c3].filter(Boolean);
                this.kitCarlsonState = {
                    revealed,
                    picked: [],
                    pendingAdd: []
                };
                this.drawPhaseState.active = false;
                this.phase = "KIT_CARLSON";
                return;
            }

            if (effectiveCharacter(player) === "Black Jack" && ds.cardsDrawn === 1 && ds.isStartOfTurn && !ds.blackJackWaitingForThird) {
                ds.blackJackCard = card;
                this.phase = "BLACK_JACK_CHECK";
                return;
            }

            player.hand.push(card);
            console.log("HAND LENGTH AFTER PUSH:", player.hand.length);
            console.log("LAST CARD:", player.hand[player.hand.length - 1]);
            console.log(
                "HAND AFTER DRAW",
                player.name,
                player.hand.length
            );
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;

            if (ds.blackJackWaitingForThird) {
                ds.blackJackWaitingForThird = false;
                this._finishDraw();
                return;
            }
        }
        else { return; }

        if (ds.cardsDrawn >= ds.cardsNeeded) {
            this._finishDraw();
        }
    },

    _finishDraw() {
        const isKillReward = this.drawPhaseState.isKillReward;
        this.drawPhaseState.active = false;
        if (isKillReward) {
            // Obnov fázi PŘED resume: jinak by další odložený special ve frontě
            // (typicky Suzy Lafayette s prázdnou rukou) zachytil přechodné "DRAW"
            // jako interruptedPhase a po doběhnutí by hra uvázla v DRAW bez
            // aktivního drawPhaseState. Vrátíme se tam, odkud kill-reward přerušil.
            this.phase = this.interruptedPhase || "PLAY";
            this._resumeAfterSpecial();
        } else {
            this.phase = "PLAY";
            this._processSpecialQueue();
        }
    },

    startKitCarlsonDraw() {
        const player = this.getCurrentPlayer();
        player.bangsPlayedThisTurn = 0;
        this.drawPhaseState = {
            active: true,
            playerIdx: this.currentPlayerIndex,
            cardsNeeded: 1,
            cardsDrawn: 0,
            options: ['deck'],
            isKitCarlson: true
        };
        this.phase = "DRAW";
    },

    kitCarlsonPick(cardIdx) {
        if (this.phase !== "KIT_CARLSON") return;
        const kc = this.kitCarlsonState;
        if (cardIdx < 0 || cardIdx >= kc.revealed.length) return;
        if (kc.pendingAdd.includes(cardIdx)) return;

        const player = this.getCurrentPlayer();
        const card = kc.revealed[cardIdx];
        // Vybraná karta jde do ruky HNED po každém výběru (klient ji rovnou odanimuje),
        // ne až po druhém. pickedIds drží veřejně ID už vybraných (panel je skryje).
        if (!kc.pickedIds) kc.pickedIds = [];
        kc.pickedIds.push(card.id);
        kc.pendingAdd.push(cardIdx);
        player.hand.push(card);

        if (kc.pendingAdd.length >= 2) {
            const pickedSet = new Set(kc.pendingAdd);
            kc.revealed.forEach((c, i) => {
                if (!pickedSet.has(i)) this.deck.cards.push(c); // nevybraná → zpátky do balíčku
            });
            this.kitCarlsonState = null;
            this.phase = "PLAY";
        }
    },

    resolveBlackJack(wantThird) {
        if (this.phase !== "BLACK_JACK_CHECK") return;
        const ds = this.drawPhaseState;
        const card = ds.blackJackCard;
        const isRed = card.suit === Suits.HEARTS || card.suit === Suits.DIAMONDS;
        const player = this.players[ds.playerIdx];
        player.hand.push(card);
        player.stats.cardsDrawn++;
        ds.cardsDrawn++;
        ds.blackJackCard = null;

        if (isRed) {
            this.drawPhaseState.cardsNeeded = 3;
            this.drawPhaseState.blackJackWaitingForThird = true;
            this.phase = "DRAW";
            return;
        }
        this._finishDraw();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrawMixin;
} else {
    Object.assign(GameState.prototype, DrawMixin);
}
})();
