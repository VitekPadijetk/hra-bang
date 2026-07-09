// logic/characters.js — mixin GameState: speciální schopnosti postav a jejich
// fronta (Suzy Lafayette, Bart Cassidy, El Gringo, Sid Ketchum, Lucky Duke).
// `_processSpecialQueue`/`_resumeAfterSpecial` řídí frontu odložených schopností.
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {
const CharactersMixin = {
    checkSuzyLafayette(player) {
        if (player && effectiveCharacter(player) === "Suzy Lafayette" && player.hand.length === 0 && player.health > 0) {
            const playerIdx = this.players.findIndex(p => p === player);
            const alreadyInQueue = this.specialActionQueue.some(a => a.type === 'SUZY_DRAW' && a.playerIdx === playerIdx);
            const alreadyPending = this.pendingSuzyDraw && this.pendingSuzyDraw.playerIdx === playerIdx;
            if (playerIdx !== -1 && !alreadyInQueue && !alreadyPending) {
                this.specialActionQueue.push({ type: 'SUZY_DRAW', playerIdx: playerIdx });
            }
            return true;
        }
        return false;
    },

    suzyLafayetteDraw(playerIdx) {
        if (this.phase !== "SUZY_DRAW" || !this.pendingSuzyDraw) return;
        if (this.pendingSuzyDraw.playerIdx !== playerIdx) return;
        this.players[playerIdx].hand.push(this.deck.draw());
        this.pendingSuzyDraw = null;
        this._resumeAfterSpecial();
    },

    _processSpecialQueue() {
        if (this.specialActionQueue.length === 0) return;

        // Neber další akci z fronty, když právě běží líznutí (běžné, Dostavník/Wells Fargo
        // i kill-reward). Jinak by se rozpracovaný drawPhaseState přepsal a hra uvázla ve
        // fázi DRAW s active=false (typicky 2 kill-rewardy z jedné smrti u hromadného útoku:
        // Herb Hunter + odměna za banditu). Po dokončení líznutí frontu dobere _resumeAfterSpecial
        // / _finishDraw (ty aktivní draw nastaví na false PŘED voláním, takže tenhle guard pustí).
        if (this.phase === "DRAW" && this.drawPhaseState?.active) return;

        if (this.phase !== "BART_DRAW" && this.phase !== "EL_GRINGO_STEAL" && this.phase !== "SUZY_DRAW" && this.phase !== "UHYB_DRAW") {
            this.interruptedPhase = this.phase;
        }

        const action = this.specialActionQueue.shift();
        if (action.type === 'BART_DRAW') {
            this.pendingBartDraw = { playerIdx: action.playerIdx };
            this.phase = "BART_DRAW";
        } else if (action.type === 'EL_GRINGO_STEAL') {
            this.pendingElGringoSteal = { playerIdx: action.playerIdx, attackerIdx: action.attackerIdx };
            this.phase = "EL_GRINGO_STEAL";
        } else if (action.type === 'SUZY_DRAW') {
            this.pendingSuzyDraw = { playerIdx: action.playerIdx };
            this.phase = "SUZY_DRAW";
        } else if (action.type === 'UHYB_DRAW') {
            this.pendingUhybDraw = { playerIdx: action.playerIdx };
            this.phase = "UHYB_DRAW";
        } else if (action.type === 'KILL_REWARD') {
            this.drawPhaseState = {
                active: true, playerIdx: action.playerIdx,
                cardsNeeded: action.cardsNeeded, cardsDrawn: 0,
                options: ['deck'], isStartOfTurn: false,
                isKillReward: true
            };
            this.phase = "DRAW";
        }
    },

    _resumeAfterSpecial() {
        if (this.specialActionQueue.length > 0) {
            this._processSpecialQueue();
        } else if (this._nextTurnAfterQueue) {
            // Fronta po smrti na dynamit (Herb Hunter apod.) je dobraná → teprve teď posuň tah.
            this._nextTurnAfterQueue = false;
            this.interruptedPhase = null;
            if (!this.winner) this.nextTurn();
        } else {
            this.phase = this.interruptedPhase || "PLAY";
            this.interruptedPhase = null;
        }
    },

    bartCassidyDraw(playerIdx) {
        if (this.phase !== "BART_DRAW" || !this.pendingBartDraw) return;
        if (this.pendingBartDraw.playerIdx !== playerIdx) return;
        this.players[playerIdx].hand.push(this.deck.draw());
        this.pendingBartDraw = null;
        this._resumeAfterSpecial();
    },

    // Úhyb: majitel si po uhnutí lízne 1 kartu kliknutím na balíček (fronta UHYB_DRAW).
    uhybDraw(playerIdx) {
        if (this.phase !== "UHYB_DRAW" || !this.pendingUhybDraw) return;
        if (this.pendingUhybDraw.playerIdx !== playerIdx) return;
        const dc = this.deck.draw();
        if (dc) this.players[playerIdx].hand.push(dc);
        this.pendingUhybDraw = null;
        this._resumeAfterSpecial();
    },

    elGringoSteal(playerIdx) {
        if (this.phase !== "EL_GRINGO_STEAL" || !this.pendingElGringoSteal) return;
        if (this.pendingElGringoSteal.playerIdx !== playerIdx) return;
        const el = this.players[playerIdx];
        const attacker = this.players[this.pendingElGringoSteal.attackerIdx];
        if (attacker && attacker.hand.length > 0) {
            const randomIdx = Math.floor(Math.random() * attacker.hand.length);
            el.hand.push(attacker.hand.splice(randomIdx, 1)[0]);
            this.checkSuzyLafayette(attacker);
        }
        this.pendingElGringoSteal = null;
        this._resumeAfterSpecial();
    },

    sidKetchumDiscardOne(playerIdx, cardIdx) {
        const p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Sid Ketchum") return;
        if (p.health >= p.maxHealth) return;
        if (!p.hand[cardIdx]) return;

        const card = p.hand.splice(cardIdx, 1)[0];
        this.deck.discardPile.push(card);
        this.checkSuzyLafayette(p);

        if (!this.sidKetchumPending) {
            this.sidKetchumPending = { playerIdx };
        } else if (this.sidKetchumPending.playerIdx === playerIdx) {
            p.health = Math.min(p.health + 1, p.maxHealth);
            this.sidKetchumPending = null;
        }
    },

    startLuckyDukeCheck(checkContext) {
        const hadEnough = this.deck.cards.length >= 2;
        const c1 = this.deck.draw();
        const c2 = this.deck.draw();
        if (!c1 || !c2) return;
        if (this.deck._reshuffleOccurred && !hadEnough) {
            this.deck._reshuffleWasProactive = false;
        }
        this.luckyDukeState = {
            cards: [c1, c2],
            checkContext
        };
        this.phase = "LUCKY_DUKE";
    },

    luckyDukePick(cardIdx) {
        if (this.phase !== "LUCKY_DUKE") return;
        const ld = this.luckyDukeState;
        const chosen = ld.cards[cardIdx];
        const other = ld.cards[1 - cardIdx];
        this.deck.discardPile.push(chosen);
        this.deck.discardPile.push(other);
        this.currentCheck = { ...ld.checkContext, card: chosen, active: false };
        this.luckyDukeState = null;
        this.phase = "CHECKING";
        this._applyCheckResult(this.currentCheck);
    },

    useSidKetchum(playerIdx, cardIndices) {
        let p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Sid Ketchum") return;
        if (p.health >= p.maxHealth) return;
        if (cardIndices.length !== 2) return;
        cardIndices.sort((a, b) => b - a);
        if (new Set(cardIndices).size !== 2) return;
        this.deck.discardPile.push(p.hand.splice(cardIndices[0], 1)[0]);
        this.deck.discardPile.push(p.hand.splice(cardIndices[1], 1)[0]);
        p.health++;
        this.checkSuzyLafayette(p);
    },

    // ── Dodge City: aktivní schopnosti (styl Sid Ketchum) ───────────────────────
    // Chuck Wengam: ztrať 1 život → lízni 2 (opakovatelné, ne poslední život).
    useChuckWengam(playerIdx) {
        if (this.phase !== "PLAY" || this.currentPlayerIndex !== playerIdx) return false;
        const p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Chuck Wengam" || p.health <= 1) return false;
        p.health--;
        this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx, cardsNeeded: 2 });
        this._processSpecialQueue();
        return true;
    },

    // José Delgado: odhoď modrou kartu z ruky → lízni 2 (max 2×/tah).
    useJoseDelgado(playerIdx, cardIdx) {
        if (this.phase !== "PLAY" || this.currentPlayerIndex !== playerIdx) return false;
        const p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "José Delgado") return false;
        if ((p._joseUses || 0) >= 2) return false;
        const card = p.hand[cardIdx];
        const blueTypes = [CardType.WEAPON, CardType.BARREL, CardType.EQUIPMENT, CardType.DYNAMITE];
        if (!card || !blueTypes.includes(card.type)) return false;
        this.deck.discardPile.push(p.hand.splice(cardIdx, 1)[0]);
        p._joseUses = (p._joseUses || 0) + 1;
        this.checkSuzyLafayette(p);
        this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx, cardsNeeded: 2 });
        this._processSpecialQueue();
        return true;
    },

    // Doc Holyday: 1×/tah odhoď 2 karty z ruky → bang-efekt na cíl v dostřelu zbraně.
    useDocHolyday(playerIdx, cardIndices, targetIdx) {
        if (this.phase !== "PLAY" || this.currentPlayerIndex !== playerIdx) return false;
        const p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Doc Holyday" || p._docUsed) return false;
        if (!Array.isArray(cardIndices) || cardIndices.length !== 2 || new Set(cardIndices).size !== 2) return false;
        if (!p.hand[cardIndices[0]] || !p.hand[cardIndices[1]]) return false;
        const target = this.players[targetIdx];
        if (!target || target.health <= 0 || targetIdx === playerIdx) return false;
        const reach = p.weapon?.range || p.weapon?.props?.range || 1;
        if (this.getDistance(playerIdx, targetIdx) > reach) return false;

        // Apache Kid: Docovy odhozené karty jsou „zahrané jiným hráčem" → jsou-li OBĚ kárové,
        // je vůči nim imunní (bang bez efektu). Suity zjistíme před odhozením.
        const bothDiamonds = p.hand[cardIndices[0]].suit === Suits.DIAMONDS &&
                             p.hand[cardIndices[1]].suit === Suits.DIAMONDS;

        const idxs = [...cardIndices].sort((a, b) => b - a);
        this.deck.discardPile.push(p.hand.splice(idxs[0], 1)[0]);
        this.deck.discardPile.push(p.hand.splice(idxs[1], 1)[0]);
        p._docUsed = true;
        this.checkSuzyLafayette(p);

        if (bothDiamonds && effectiveCharacter(target) === "Apache Kid") {
            this.phase = "PLAY";
            this._processSpecialQueue();
            return true;
        }

        p.stats.bangsFired++;
        this.currentAttacker = playerIdx;
        this._beginBangResolution(playerIdx, targetIdx, true); // isEffect = true (bez limitu/Slaba)
        this._processSpecialQueue();
        return true;
    },

    // ── Vera Custer (Dodge City) ────────────────────────────────────────────────
    // Na začátku svého tahu si zvolí žijící postavu, jejíž schopnost převezme (effectiveCharacter
    // pak vrací kopii) až do svého příštího tahu. Nekopíruje sama sebe (jen jedna Vera).
    _veraCopyChoices() {
        const me = this.currentPlayerIndex;
        const out = [];
        this.players.forEach((p, i) => {
            if (i === me || p.health <= 0 || !p.character) return;
            if (p.character === "Vera Custer") return;
            if (!out.includes(p.character)) out.push(p.character);
        });
        return out;
    },

    veraCopyCharacter(playerIdx, charName) {
        if (this.phase !== "VERA_COPY" || !this.pendingVeraCopy) return false;
        if (this.pendingVeraCopy.playerIdx !== playerIdx) return false;
        const player = this.players[playerIdx];
        if (!player || player.character !== "Vera Custer") return false;
        if (!this.pendingVeraCopy.choices.includes(charName)) return false;

        player._copiedCharacter = charName;
        player._veraCopiedTurn = this.turnId;
        this.pendingVeraCopy = null;
        // Zpět do začátku tahu: teď se rozjedou checky (Dynamit/Vězení) už s převzatou
        // schopností (např. Lucky Duke → 2 karty na check), pak fáze lízání.
        this.handleStartOfTurnChecks();
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CharactersMixin;
} else {
    Object.assign(GameState.prototype, CharactersMixin);
}
})();
