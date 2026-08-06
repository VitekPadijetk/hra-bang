// logic/draw.js — mixin GameState: fáze lízání (běžná + Kit Carlson + Black Jack).
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {
const DrawMixin = {
    startDrawPhase() {
        const player = this.getCurrentPlayer();
        player.bangsPlayedThisTurn = 0;
        player._joseUses = 0;      // Dodge City: José Delgado max 2×/tah
        player._docUsed = false;   // Dodge City: Doc Holyday 1×/tah

        // Vera Custer (Dodge City): postavu ke kopírování si volí TĚSNĚ PŘED fází lízání,
        // tedy AŽ PO kontrolních líznutích na Dynamit/Vězení. Kopie z minulého tahu tady
        // vyprší (drží přesně jedno kolo – od tohoto bodu do stejného bodu příštího tahu),
        // proto se `_copiedCharacter` nuluje ještě před volbou. Volba 1×/tah: po ní se sem
        // vrátíme s `_veraCopiedTurn === turnId` a lízání se rozjede s převzatou schopností.
        if (player.character === "Vera Custer" && player._veraCopiedTurn !== this.turnId) {
            player._copiedCharacter = null;
            const choices = this._veraCopyChoices();
            if (choices.length > 0) {
                this.pendingVeraCopy = { playerIdx: this.currentPlayerIndex, choices };
                this.phase = "VERA_COPY";
                return;
            }
            player._veraCopiedTurn = this.turnId;   // nikdo ke kopírování → bez kopie
        }

        if (effectiveCharacter(player) === "Kit Carlson") {
            this.startKitCarlsonDraw();
            return;
        }

        const cardsNeeded = this._drawCountFor(player);

        this.drawPhaseState = { active: true, playerIdx: this.currentPlayerIndex, cardsNeeded, cardsDrawn: 0, options: this._getDrawOptions(player), isStartOfTurn: true };
        this.phase = "DRAW";
    },

    // Kolik karet si hráč líže ve fázi 1. JEDINÉ místo, které o tom rozhoduje – čte ho
    // i Kit Carlson (kolik odkryje a nechá si) a Black Jack (základ pro bonus za červenou).
    //   Dodge City: Pixie Pete 3, Bill Noface 1 + 1 za každé zranění
    //   High Noon:  Žízeň −1, Příjezd vlaku +1
    _drawCountFor(player) {
        let n = 2;
        if (effectiveCharacter(player) === "Pixie Pete") n += 1;
        else if (effectiveCharacter(player) === "Bill Noface") n = 1 + (player.maxHealth - player.health);
        if (this.hasEvent('ZIZEN')) n -= 1;
        if (this.hasEvent('PRIJEZD_VLAKU')) n += 1;
        return Math.max(1, n);
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
            this.logEvent('draw', { who: player.name, source: 'board', cards: [card.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            this._finishDraw();
            return;
        }

        if (source === 'opponent_hand' && effectiveCharacter(player) === "Jesse Jones" && ds.cardsDrawn === 0) {
            const opponent = this.players[sourceIdx];
            if (!opponent || opponent.health <= 0 || opponent.hand.length === 0) return;
            const randomIdx = Math.floor(Math.random() * opponent.hand.length);
            const stolen = opponent.hand.splice(randomIdx, 1)[0];
            player.hand.push(stolen);
            this.logEvent('draw', { who: player.name, source: 'opponent_hand', cards: [stolen.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            ds.options = ['deck'];
            // Okradený mohl přijít o poslední kartu → Suzy Lafayette si líže HNED, ještě
            // než si Jesse vezme druhou kartu z balíčku (pořadí: Jesse 1. karta z ruky →
            // Suzy → Jesse 2. karta). Běžnou frontu tady nejde použít: _processSpecialQueue
            // během aktivního lízání záměrně nic nepouští (jinak by kill-reward přepsal
            // drawPhaseState), tak si SUZY_DRAW z fronty vyzvedneme sami. drawPhaseState
            // zůstává aktivní a interruptedPhase="DRAW" vrátí Jesseho po Suzyině líznutí
            // přesně sem (viz _resumeAfterSpecial).
            if (this.checkSuzyLafayette(opponent) && ds.cardsDrawn < ds.cardsNeeded) {
                const qi = this.specialActionQueue.findIndex(a => a.type === 'SUZY_DRAW' && a.playerIdx === sourceIdx);
                if (qi !== -1) {
                    this.specialActionQueue.splice(qi, 1);
                    this.interruptedPhase = "DRAW";
                    this.pendingSuzyDraw = { playerIdx: sourceIdx };
                    this.phase = "SUZY_DRAW";
                    return;
                }
            }
        }
        else if (source === 'discard' && effectiveCharacter(player) === "Pedro Ramirez" && ds.cardsDrawn === 0) {
            if (this.deck.discardPile.length === 0) return;
            const card = this.deck.discardPile.pop();
            player.hand.push(card);
            this.logEvent('draw', { who: player.name, source: 'discard', cards: [card.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            ds.options = ['deck'];
        }
        else if (source === 'deck') {
            const card = this.deck.draw();
            if (!card) return;

            this.drawPhaseState.options = ['deck'];

            if (effectiveCharacter(player) === "Kit Carlson" && ds.isKitCarlson) {
                // FIX: Pro Kit Carlson je JAKÝKOLIV reshuffle vždy emergency –
                // výběr karet nesmí být zobrazen dřív než se zamíchá balíček.
                // Zachytíme reshuffle při c1 (už proběhl před tímto blokem)
                // i případný reshuffle při c2/c3.
                const reshuffledAtC1 = this.deck._reshuffleOccurred;
                // Odkryje o JEDNU kartu víc, než si nechá (běžně 3 a nechá si 2; se Žízní
                // odkryje 2 a nechá 1, s Příjezdem vlaku odkryje 4 a nechá 3 – FAQ H6).
                const needed = ds.kitNeeded || 2;
                const rest = [];
                for (let i = 0; i < needed; i++) rest.push(this.deck.draw());
                if (reshuffledAtC1 || this.deck._reshuffleOccurred) {
                    this.deck._reshuffleWasProactive = false; // vždy emergency pro Kit Carlson
                }
                const revealed = [card, ...rest].filter(Boolean);
                this.kitCarlsonState = {
                    revealed,
                    picked: [],
                    pendingAdd: [],
                    needed
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
            this.logEvent('draw', { who: player.name, source: 'deck', cards: [card.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;

            // Bonusová karta za červenou je doražená – dál rozhoduje běžné počítadlo
            // (s Příjezdem vlaku je základ 3, takže po bonusu ještě jedna zbývá).
            if (ds.blackJackWaitingForThird) ds.blackJackWaitingForThird = false;
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
            isKitCarlson: true,
            kitNeeded: this._drawCountFor(player)   // kolik karet si nakonec nechá
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
        this.logEvent('draw', { who: player.name, source: 'Kit Carlson', cards: [card.name] });

        if (kc.pendingAdd.length >= (kc.needed || 2)) {
            const pickedSet = new Set(kc.pendingAdd);
            // Nevybrané zpátky na balíček ve STEJNÉM pořadí, v jakém ležely (FAQ H6):
            // draw() bere z konce pole, takže se vrací odzadu (poslední odkrytá jde dolů).
            for (let i = kc.revealed.length - 1; i >= 0; i--) {
                if (!pickedSet.has(i)) this.deck.cards.push(kc.revealed[i]);
            }
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
        this.logEvent('draw', { who: player.name, source: 'deck (Black Jack)', cards: [card.name] });
        player.stats.cardsDrawn++;
        ds.cardsDrawn++;
        ds.blackJackCard = null;

        if (isRed) {
            // Za červenou druhou kartu si líže JEDNU navíc nad svůj základ (běžně 2 → 3,
            // s Příjezdem vlaku 3 → 4). Se Žízní se druhá karta vůbec nelíže, takže se
            // sem nedostane.
            this.drawPhaseState.cardsNeeded = ds.cardsNeeded + 1;
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
