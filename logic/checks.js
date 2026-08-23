// logic/checks.js — mixin GameState: kontrolní líznutí na začátku tahu (Dynamit,
// Vězení) a vyhodnocení „checků" (Barel/Jourdonnais, Dynamit, Vězení) přes
// `_applyCheckResult`. Připojuje se na GameState.prototype. Viz „Mixin pattern".
(function () {
const ChecksMixin = {
    handleStartOfTurnChecks() {
        const p = this.players[this.currentPlayerIndex];
        if (!p) {
            this.logEvent('error', { scope: 'handleStartOfTurnChecks', msg: `hráč #${this.currentPlayerIndex} neexistuje` });
            return;
        }

        // Vera Custer (Dodge City) si postavu ke kopírování volí až TĚSNĚ PŘED fází lízání
        // (viz startDrawPhase) – checky na Dynamit/Vězení tedy ještě běží s kopií z minulého
        // tahu. Když jí Vězení tah sebere, k volbě se nedostane a kopie vyprší (_veraExpireCopy).

        // Fistful – Laso: karty na stole nemají efekt → nesnímá se, dynamit se neposouvá
        // ani nevybuchne a Vězení tah nebere. Obě karty zůstávají ležet a příští kolo
        // (až Laso vystřídá jiná událost) fungují zase normálně.
        const boardDead = this._boardDead();
        const dynamiteIdx = boardDead ? -1 : p.board.findIndex(c => c.type === CardType.DYNAMITE);
        const jailIdx = boardDead ? -1 : p.board.findIndex(c => c.type === CardType.JAIL);

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

        // Fistful – Vendeta: sejmutí na konci tahu (♥ = hraje ještě jednou). Není u něj
        // žádná karta na stole, jen důvod – jinak jede úplně stejnou cestou jako
        // Dynamit/Vězení, takže se zdarma veze i Lucky Duke a klientská cinematika.
        if (pcd.reason) {
            if (effectiveCharacter(p) === "Lucky Duke") {
                this.startLuckyDukeCheck({ reason: pcd.reason, playerIdx: pcd.playerIdx, boardIdx: null, checksLeft: 1, active: false });
                return;
            }
            const checkCard = this.deck.draw();
            this.deck.discard(checkCard);
            this.phase = "CHECKING";
            this.currentCheck = {
                active: true,
                reason: pcd.reason,
                playerIdx: pcd.playerIdx,
                card: checkCard,
                boardIdx: null
            };
            return;
        }

        if (pcd.dynamiteIdx !== null) {
            if (effectiveCharacter(p) === "Lucky Duke") {
                this.startLuckyDukeCheck({ reason: "DYNAMITE", playerIdx: pcd.playerIdx, boardIdx: pcd.dynamiteIdx, checksLeft: 1, active: false });
                return;
            }
            const checkCard = this.deck.draw();
            this.deck.discard(checkCard);
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
            this.deck.discard(checkCard);
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

    // Dynamit nevybuchl a nedal se posunout (zůstává u hráče). Pokračuj případným
    // Vězením a pak lízáním – ale dynamit se v TOMTO tahu už znovu nekontroluje.
    _continueAfterDynamite(playerIdx) {
        const p = this.players[playerIdx];
        const jailIdx = p.board.findIndex(c => c.type === CardType.JAIL);
        if (jailIdx !== -1) {
            this.pendingCheckDraw = { active: true, playerIdx, dynamiteIdx: null, jailIdx };
            this.phase = "CHECK_DRAW";
            return;
        }
        this.startDrawPhase();
    },

    _applyCheckResult(check) {
        const getNum = (val) => {
            if (val === 'J') return 11; if (val === 'Q') return 12;
            if (val === 'K') return 13; if (val === 'A') return 14;
            return parseInt(val);
        };
        const p = this.players[check.playerIdx];
        // Barva, která PLATÍ (Požehnání/Prokletí ji přebíjí) – hodnota zůstává vytištěná.
        const suit = this._effSuit(check.card);
        const numVal = getNum(check.card.value);

        let checkResult;
        if (check.reason === "DYNAMITE") checkResult = (suit === Suits.SPADES && numVal >= 2 && numVal <= 9) ? 'výbuch' : 'nevybuchl';
        else if (check.reason === "JAIL") checkResult = (suit === Suits.HEARTS) ? 'srdce → hraje' : 'vězení → konec tahu';
        else if (check.reason === "VENDETTA") checkResult = (suit === Suits.HEARTS) ? 'srdce → tah navíc' : 'konec tahu';
        else checkResult = (suit === Suits.HEARTS) ? 'srdce → uhnul' : 'neuhnul';
        this.logEvent('check', { who: p.name, kind: check.reason, card: `${check.card.value}${suit}`, result: checkResult });

        if (check.reason === "DYNAMITE") {
            if (suit === Suits.SPADES && numVal >= 2 && numVal <= 9) {
                // Vizuální slot v konvenci „slot 0 = zbraň" (klient si ji u soupeřů bez
                // zbraně posune sám – viz getBoardPos v net/handlers.js).
                const fromBoardIdx = 1 + check.boardIdx;
                const dynCard = p.board.splice(check.boardIdx, 1)[0];
                this.lastAnimEvent = { type: 'dynamite_explode', playerIdx: check.playerIdx, cardId: dynCard?.id, boardIdx: fromBoardIdx };
                this.deck.discard(dynCard);
                // Hráč musí 3× kliknout na životy (po jednom hitu)
                this.pendingDynamiteDamage = { playerIdx: check.playerIdx, hitsLeft: 3 };
                this.phase = "DYNAMITE_DAMAGE";
            } else {
                const fromBoardIdx = 1 + check.boardIdx;
                // Najdi dalšího ŽIVÉHO hráče BEZ dynamitu (jen ostatní – nikdy zpět na sebe).
                let targetIdx = null;
                for (let k = 1; k < this.players.length; k++) {
                    const idx = (check.playerIdx + k) % this.players.length;
                    const np = this.players[idx];
                    if (np.health > 0 && !np.board.some(c => c.type === CardType.DYNAMITE)) { targetIdx = idx; break; }
                }
                if (targetIdx === null) {
                    // Nikdo jiný nemůže dynamit převzít (všichni ho mají / jsou mrtví) →
                    // dynamit ZŮSTÁVÁ u hráče na tahu a check se pro TENTO tah už neopakuje
                    // (dynCard zůstává na p.board). Příští tah se zkontroluje znovu.
                    this._continueAfterDynamite(check.playerIdx);
                } else {
                    const dynCard = p.board.splice(check.boardIdx, 1)[0];
                    const np = this.players[targetIdx];
                    np.board.push(dynCard);
                    const toBoardIdx = 1 + (np.board.length - 1);
                    this.lastAnimEvent = { type: 'dynamite_pass', fromIdx: check.playerIdx, toIdx: targetIdx, cardId: dynCard?.id, fromBoardIdx, toBoardIdx };
                    this.handleStartOfTurnChecks();
                }
            }
        } else if (check.reason === "JAIL") {
            const jailCard = p.board.splice(check.boardIdx, 1)[0];
            const visualBoardIdx = 1 + check.boardIdx;
            this.lastAnimEvent = { type: 'board_to_discard', fromPlayerIdx: check.playerIdx, cardId: jailCard?.id, boardIdx: visualBoardIdx };
            this.deck.discard(jailCard);
            if (suit === Suits.HEARTS) {
                this.startDrawPhase();
            } else {
                // Vera Custer se z vězení nedostala → k volbě kopie (těsně před lízáním)
                // se nedostane a stará kopie tady vyprší: pro tohle kolo je bez schopnosti.
                this._veraExpireCopy(check.playerIdx);
                this.nextTurn();
            }
        } else if (check.reason === "VENDETTA") {
            // Fistful – Vendeta: ♥ podle _effSuit (Požehnání pomáhá, Prokletí zabíjí).
            // `_vendettaDone` je nastavené od začátku sejmutí, takže se nextTurn zeptat
            // znovu nemůže a tah se prostě posune dál.
            if (suit === Suits.HEARTS) {
                this._vendettaExtraTurn();
            } else {
                this.phase = "PLAY";
                this.nextTurn();
            }
        } else if (check.reason === "BARREL" || check.reason === "JOURDONNAIS") {
            if (suit === Suits.HEARTS) {
                const attacker = this.players[check.attackerIdx];
                // Kolik karet Vedle! si útok žádá celkem. Obvykle to nese sám check
                // (`missesNeeded` – Odstřelovač z Fistfulu = 2); dopočet ze Slaba the Killer
                // je záloha pro cesty, které check staví bez něj (Kulomet).
                // Bang-efekt: Slabův bonus neplatí (barel = uhnul napoprvé).
                const needed = check.missesNeeded ||
                    ((!check.bangEffect && effectiveCharacter(attacker) === "Slab the Killer") ? 2 : 1);

                // Úspěšný barel se počítá za JEDNU kartu Vedle! – u dvojnásobné obrany
                // (Slab the Killer, Odstřelovač) tedy zbytek musí hráč ještě dohrát.
                if (needed > 1 && (this.missesPlayed || 0) < 1 && check.sourceCard !== CardType.GATLING) {
                    this.missesPlayed = 0;
                    this.waitForMissed(check.playerIdx, check.attackerIdx, check.sourceCard, check.bangEffect, check.sourceCardName, check.ricochet, needed - 1);
                } else {
                    if (check.sourceCard === CardType.GATLING || check.sourceCard === CardType.INDIANS) {
                        this._advanceMassAttack(check.playerIdx, check.attackerIdx, check.sourceCard);
                        this._processSpecialQueue();
                    } else {
                        this.phase = "PLAY";
                        // Fistful of Cards: barel uhnul jednomu ze série zásahů → další.
                        if (!this._afterFistfulHit()) this._processSpecialQueue();
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
                        sourceCardName: check.sourceCardName,
                        bangEffect: check.bangEffect,
                        ricochet: check.ricochet,
                        missesNeeded: check.missesNeeded
                    };
                    this.phase = "BARREL_DRAW";
                } else {
                    // Barel neuhnul → obrana pokračuje s PŮVODNÍM počtem karet Vedle!.
                    // Bez `missesNeeded` by Odstřelovač spadl na 1 (útočník Slab být nemusí).
                    this.waitForMissed(check.playerIdx, check.attackerIdx, check.sourceCard, check.bangEffect, check.sourceCardName, check.ricochet, check.missesNeeded);
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
