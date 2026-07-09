// logic/checks.js — mixin GameState: kontrolní líznutí na začátku tahu (Dynamit,
// Vězení) a vyhodnocení „checků" (Barel/Jourdonnais, Dynamit, Vězení) přes
// `_applyCheckResult`. Připojuje se na GameState.prototype. Viz „Mixin pattern".
(function () {
const ChecksMixin = {
    handleStartOfTurnChecks() {
        const p = this.players[this.currentPlayerIndex];
        if (!p) {
            console.error(`❌ handleStartOfTurnChecks: hráč #${this.currentPlayerIndex} neexistuje!`);
            return;
        }

        // Vera Custer (Dodge City): postavu ke kopírování si volí HNED na začátku tahu,
        // ještě PŘED kontrolním líznutím na Dynamit/Vězení (může tak převzít např. Lucky
        // Duka a líznout si na check 2 karty). Volba 1×/tah; po volbě se sem vrátíme
        // (už s `_veraCopiedTurn === turnId`, takže se checky rozjedou normálně).
        if (p.character === "Vera Custer" && p._veraCopiedTurn !== this.turnId) {
            const choices = this._veraCopyChoices();
            if (choices.length > 0) {
                this.pendingVeraCopy = { playerIdx: this.currentPlayerIndex, choices };
                this.phase = "VERA_COPY";
                return;
            }
            p._veraCopiedTurn = this.turnId;   // nikdo ke kopírování → bez kopie
            p._copiedCharacter = null;
        }

        const dynamiteIdx = p.board.findIndex(c => c.type === CardType.DYNAMITE);
        const jailIdx = p.board.findIndex(c => c.type === CardType.JAIL);

        if (dynamiteIdx !== -1 || jailIdx !== -1) {
            this.pendingCheckDraw = {
                active: true,
                playerIdx: this.currentPlayerIndex,
                dynamiteIdx: dynamiteIdx !== -1 ? dynamiteIdx : null,
                jailIdx: jailIdx !== -1 ? jailIdx : null
            };
            this.phase = "CHECK_DRAW";
            return;
        }

        this.startDrawPhase();
    },

    triggerCheckDraw() {
        if (this.phase !== "CHECK_DRAW" || !this.pendingCheckDraw?.active) return;

        const pcd = this.pendingCheckDraw;
        this.pendingCheckDraw = null;
        this.phase = "PLAY";

        const p = this.players[pcd.playerIdx];

        if (pcd.dynamiteIdx !== null) {
            if (effectiveCharacter(p) === "Lucky Duke") {
                this.startLuckyDukeCheck({ reason: "DYNAMITE", playerIdx: pcd.playerIdx, boardIdx: pcd.dynamiteIdx, checksLeft: 1, active: false });
                return;
            }
            const checkCard = this.deck.draw();
            this.deck.discardPile.push(checkCard);
            this.phase = "CHECKING";
            this.currentCheck = {
                active: true,
                reason: "DYNAMITE",
                playerIdx: pcd.playerIdx,
                card: checkCard,
                boardIdx: pcd.dynamiteIdx
            };
            return;
        }

        if (pcd.jailIdx !== null) {
            if (effectiveCharacter(p) === "Lucky Duke") {
                this.startLuckyDukeCheck({ reason: "JAIL", playerIdx: pcd.playerIdx, boardIdx: pcd.jailIdx, checksLeft: 1, active: false });
                return;
            }
            const checkCard = this.deck.draw();
            this.deck.discardPile.push(checkCard);
            this.phase = "CHECKING";
            this.currentCheck = {
                active: true,
                reason: "JAIL",
                playerIdx: pcd.playerIdx,
                card: checkCard,
                boardIdx: pcd.jailIdx
            };
            return;
        }
    },

    _applyCheckResult(check) {
        const getNum = (val) => {
            if (val === 'J') return 11; if (val === 'Q') return 12;
            if (val === 'K') return 13; if (val === 'A') return 14;
            return parseInt(val);
        };
        const p = this.players[check.playerIdx];
        const suit = check.card.suit;
        const numVal = getNum(check.card.value);

        if (check.reason === "DYNAMITE") {
            if (suit === Suits.SPADES && numVal >= 2 && numVal <= 9) {
                const pHasWeapon = p.weapon && p.weapon.id !== -1;
                const fromBoardIdx = (pHasWeapon ? 1 : 0) + check.boardIdx;
                const dynCard = p.board.splice(check.boardIdx, 1)[0];
                this.lastAnimEvent = { type: 'dynamite_explode', playerIdx: check.playerIdx, cardId: dynCard?.id, boardIdx: fromBoardIdx };
                this.deck.discardPile.push(dynCard);
                // Hráč musí 3× kliknout na životy (po jednom hitu)
                this.pendingDynamiteDamage = { playerIdx: check.playerIdx, hitsLeft: 3 };
                this.phase = "DYNAMITE_DAMAGE";
            } else {
                const pHasWeapon = p.weapon && p.weapon.id !== -1;
                const fromBoardIdx = (pHasWeapon ? 1 : 0) + check.boardIdx;
                const dynCard = p.board.splice(check.boardIdx, 1)[0];
                let nextIdx = (check.playerIdx + 1) % this.players.length;
                let loopGuard = 0;
                while (loopGuard < this.players.length) {
                    const np = this.players[nextIdx];
                    const hasDynamite = np.board.some(c => c.type === CardType.DYNAMITE);
                    if (np.health > 0 && !hasDynamite) break;
                    nextIdx = (nextIdx + 1) % this.players.length;
                    loopGuard++;
                }
                if (loopGuard >= this.players.length) {
                    this.deck.discardPile.push(dynCard);
                } else {
                    const np = this.players[nextIdx];
                    const npHasWeapon = np.weapon && np.weapon.id !== -1;
                    np.board.push(dynCard);
                    const toBoardIdx = (npHasWeapon ? 1 : 0) + (np.board.length - 1);
                    this.lastAnimEvent = { type: 'dynamite_pass', fromIdx: check.playerIdx, toIdx: nextIdx, cardId: dynCard?.id, fromBoardIdx, toBoardIdx };
                }
                this.handleStartOfTurnChecks();
            }
        } else if (check.reason === "JAIL") {
            const jailCard = p.board.splice(check.boardIdx, 1)[0];
            const hasWeapon = p.weapon && p.weapon.id !== -1;
            const visualBoardIdx = hasWeapon ? check.boardIdx + 1 : check.boardIdx;
            this.lastAnimEvent = { type: 'board_to_discard', fromPlayerIdx: check.playerIdx, cardId: jailCard?.id, boardIdx: visualBoardIdx };
            this.deck.discardPile.push(jailCard);
            if (suit === Suits.HEARTS) {
                this.startDrawPhase();
            } else {
                this.nextTurn();
            }
        } else if (check.reason === "BARREL" || check.reason === "JOURDONNAIS") {
            if (suit === Suits.HEARTS) {
                const attacker = this.players[check.attackerIdx];
                // Bang-efekt: Slabův bonus neplatí (barel = uhnul napoprvé).
                const slabBonus = (!check.bangEffect && effectiveCharacter(attacker) === "Slab the Killer") ? 1 : 0;

                if (slabBonus > 0 && (this.missesPlayed || 0) < 1 && check.sourceCard !== CardType.GATLING) {
                    this.missesRequired = 1;
                    this.missesPlayed = 1;
                    this.waitForMissed(check.playerIdx, check.attackerIdx, check.sourceCard, check.bangEffect);
                } else {
                    if (check.sourceCard === CardType.GATLING || check.sourceCard === CardType.INDIANS) {
                        this._advanceMassAttack(check.playerIdx, check.attackerIdx, check.sourceCard);
                        this._processSpecialQueue();
                    } else {
                        this.phase = "PLAY";
                        this._processSpecialQueue();
                    }
                }
            } else {
                if (check.checksLeft > 1) {
                    this.pendingBarrelCheck = {
                        active: true,
                        targetIdx: check.playerIdx,
                        attackerIdx: check.attackerIdx,
                        checksLeft: check.checksLeft - 1,
                        reason: check.reason === "JOURDONNAIS" ? "BARREL" : check.reason,
                        sourceCard: check.sourceCard,
                        bangEffect: check.bangEffect
                    };
                    this.phase = "BARREL_DRAW";
                } else {
                    this.waitForMissed(check.playerIdx, check.attackerIdx, check.sourceCard, check.bangEffect);
                }
            }
        }
    },

    resolveCheck() {
        if (!this.currentCheck || !this.currentCheck.active) return;
        const check = this.currentCheck;
        const p = this.players[check.playerIdx];
        check.active = false;

        if (effectiveCharacter(p) === "Lucky Duke") {
            this.startLuckyDukeCheck(check);
            return;
        }

        this._applyCheckResult(check);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChecksMixin;
} else {
    Object.assign(GameState.prototype, ChecksMixin);
}
})();
