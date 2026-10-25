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
        // Dynamit, který v tomhle tahu už jednou zůstal ležet (nebylo komu ho poslat),
        // se znovu nesnímá – sem se totiž vrací i klikaný zásah Chřestýše (níž).
        const dynamiteIdx = (boardDead || this._dynamiteStayTurn === this.turnId) ? -1
            : p.board.findIndex(c => c.type === CardType.DYNAMITE);
        const jailIdx = boardDead ? -1 : p.board.findIndex(c => c.type === CardType.JAIL);
        const rattlesnakeIdx = this._rattlesnakePending(p);

        if (dynamiteIdx !== -1 || jailIdx !== -1 || rattlesnakeIdx !== -1) {
            this.pendingCheckDraw = {
                active: true,
                playerIdx: this.currentPlayerIndex,
                dynamiteIdx: dynamiteIdx !== -1 ? dynamiteIdx : null,
                jailIdx: jailIdx !== -1 ? jailIdx : null,
                ...(rattlesnakeIdx !== -1 ? { rattlesnakeIdx } : {})
            };
            this.phase = "CHECK_DRAW";
            return;
        }

        this.startDrawPhase();
    },

    // Údolí stínů – Chřestýš: „Na začátku svého tahu hráč s kartou Chřestýš otočí kartu:
    // jsou-li to piky ♠, ztrácí 1 život." Pořadí snímání je Dynamit → Vězení → Chřestýš
    // (Dynamite Box) a karta po sejmutí ZŮSTÁVÁ ležet – proto si tah pamatuje, že už se
    // na ni snímalo (`_vosSnakeTurn`), jinak by se po klikaném zásahu (který se vrací do
    // handleStartOfTurnChecks) snímalo dokola. Laso ji vypíná jako každou kartu na stole.
    // Vrací index karty na stole, nebo -1.
    _rattlesnakePending(p) {
        if (!p || this._boardDead() || p._vosSnakeTurn === this.turnId) return -1;
        // Duch (Údolí stínů) život ztratit nemůže – na Chřestýše se mu nesnímá.
        if (isVosGhost(p)) return -1;
        return p.board.findIndex(c => c.type === CardType.RATTLESNAKE);
    },

    // Po Dynamitu a Vězení: Chřestýš, nebo rovnou fáze lízání. Neúspěšné Vězení sem
    // nevede (tah se přeskočí), takže se na Chřestýše pak už nesnímá (Dynamite Box).
    _rattlesnakeOrDraw(playerIdx) {
        const rattlesnakeIdx = this._rattlesnakePending(this.players[playerIdx]);
        if (rattlesnakeIdx !== -1) {
            this.pendingCheckDraw = { active: true, playerIdx, dynamiteIdx: null, jailIdx: null, rattlesnakeIdx };
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
            // Údolí stínů – Colorado Bill: sejmutí nese rozehraný BANG! (komu, čím, kontext
            // `vos`), aby ho výsledek mohl dohrát (viz _coloradoResult, logic/valley.js).
            const extra = pcd.colorado ? { colorado: pcd.colorado } : {};
            if (this._checkRevealCount(p) > 1) {
                this.startLuckyDukeCheck({ reason: pcd.reason, playerIdx: pcd.playerIdx, boardIdx: null, checksLeft: 1, active: false, ...extra });
                return;
            }
            const checkCard = this.deck.draw({ toDiscard: true });
            this.deck.discard(checkCard);
            // Divoký západ – John Pain: komu karta připadne, se ohlásí rovnou do checku,
            // ať z odkrytí letí přímo k němu (viz _johnPainQueueCard).
            const takerIdx = this._johnPainQueueCard(checkCard, pcd.playerIdx, { reveal: true });
            this.phase = "CHECKING";
            this.currentCheck = {
                active: true,
                reason: pcd.reason,
                playerIdx: pcd.playerIdx,
                card: checkCard,
                boardIdx: null,
                johnPainIdx: takerIdx,
                ...extra
            };
            return;
        }

        if (pcd.dynamiteIdx !== null) {
            if (this._checkRevealCount(p) > 1) {
                this.startLuckyDukeCheck({ reason: "DYNAMITE", playerIdx: pcd.playerIdx, boardIdx: pcd.dynamiteIdx, checksLeft: 1, active: false });
                return;
            }
            const checkCard = this.deck.draw({ toDiscard: true });
            this.deck.discard(checkCard);
            const takerIdx = this._johnPainQueueCard(checkCard, pcd.playerIdx, { reveal: true });   // Divoký západ – John Pain
            this.phase = "CHECKING";
            this.currentCheck = {
                active: true,
                reason: "DYNAMITE",
                playerIdx: pcd.playerIdx,
                card: checkCard,
                boardIdx: pcd.dynamiteIdx,
                johnPainIdx: takerIdx
            };
            return;
        }

        if (pcd.jailIdx === null && pcd.rattlesnakeIdx != null) {
            // Údolí stínů – Chřestýš (až po Dynamitu a Vězení). Od teď je v tomhle tahu
            // odbavený, ať se po zásahu nesnímá znovu (viz _rattlesnakePending).
            p._vosSnakeTurn = this.turnId;
            if (this._checkRevealCount(p) > 1) {
                this.startLuckyDukeCheck({ reason: "RATTLESNAKE", playerIdx: pcd.playerIdx, boardIdx: pcd.rattlesnakeIdx, checksLeft: 1, active: false });
                return;
            }
            const checkCard = this.deck.draw({ toDiscard: true });
            this.deck.discard(checkCard);
            const takerIdx = this._johnPainQueueCard(checkCard, pcd.playerIdx, { reveal: true });   // Divoký západ – John Pain
            this.phase = "CHECKING";
            this.currentCheck = {
                active: true,
                reason: "RATTLESNAKE",
                playerIdx: pcd.playerIdx,
                card: checkCard,
                boardIdx: pcd.rattlesnakeIdx,
                johnPainIdx: takerIdx
            };
            return;
        }

        if (pcd.jailIdx !== null) {
            if (this._checkRevealCount(p) > 1) {
                this.startLuckyDukeCheck({ reason: "JAIL", playerIdx: pcd.playerIdx, boardIdx: pcd.jailIdx, checksLeft: 1, active: false });
                return;
            }
            const checkCard = this.deck.draw({ toDiscard: true });
            this.deck.discard(checkCard);
            const takerIdx = this._johnPainQueueCard(checkCard, pcd.playerIdx, { reveal: true });   // Divoký západ – John Pain
            this.phase = "CHECKING";
            this.currentCheck = {
                active: true,
                reason: "JAIL",
                playerIdx: pcd.playerIdx,
                card: checkCard,
                boardIdx: pcd.jailIdx,
                johnPainIdx: takerIdx
            };
            return;
        }
    },

    // Dynamit nevybuchl a nedal se posunout (zůstává u hráče). Pokračuj případným
    // Vězením a pak lízáním – ale dynamit se v TOMTO tahu už znovu nekontroluje.
    _continueAfterDynamite(playerIdx) {
        const p = this.players[playerIdx];
        // Zapamatuj si to: handleStartOfTurnChecks se v tomhle tahu může zavolat znovu
        // (klikaný zásah Chřestýše) a dynamit se snímá jen jednou za tah.
        this._dynamiteStayTurn = this.turnId;
        const jailIdx = p.board.findIndex(c => c.type === CardType.JAIL);
        if (jailIdx !== -1) {
            this.pendingCheckDraw = { active: true, playerIdx, dynamiteIdx: null, jailIdx };
            this.phase = "CHECK_DRAW";
            return;
        }
        this._rattlesnakeOrDraw(playerIdx);
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
        else if (check.reason === "TEREN_KILL") checkResult = (suit === Suits.SPADES) ? 'pik → vyřazen' : 'zůstává na 1 životě';
        else if (check.reason === "RATTLESNAKE") checkResult = (suit === Suits.SPADES) ? 'pik → ztrácí život' : 'nic';
        else if (check.reason === "COLORADO") checkResult = (suit === Suits.SPADES) ? 'pik → BANG! nejde zrušit' : 'BANG! jako obvykle';
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
                // Údolí stínů – Duch život ztratit nemůže: dynamit vybuchne (odhodí se),
                // ale zásahy propadají a tah pokračuje kontrolou Vězení.
                if (isVosGhost(p)) {
                    this.logEvent('special', { who: p.name, card: 'Duch', msg: 'dynamit mu nic neudělá' });
                    this.handleStartOfTurnChecks();
                    return;
                }
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
                    if (staysInPlay(np) && !np.board.some(c => c.type === CardType.DYNAMITE)) { targetIdx = idx; break; }
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
                // Údolí stínů: po Vězení ještě Chřestýš (jinak rovnou lízání).
                this._rattlesnakeOrDraw(check.playerIdx);
            } else {
                // Vera Custer se z vězení nedostala → k volbě kopie (těsně před lízáním)
                // se nedostane a stará kopie tady vyprší: pro tohle kolo je bez schopnosti.
                this._veraExpireCopy(check.playerIdx);
                // Divoký západ – Madam Zuzana: koho tah přeskočil kvůli Vězení, ten karty
                // hrát nemohl → nepenalizuje se (čte a nuluje to _zuzanaPenalty v nextTurn).
                p._turnSkippedByJail = true;
                this.nextTurn();
            }
        } else if (check.reason === "RATTLESNAKE") {
            // Údolí stínů – Chřestýš: ♠ (podle _effSuit – Požehnání chrání vždy, Prokletí
            // kousne vždy) = klikaný zásah BEZ útočníka. Chřestýš nemá majitele, takže
            // zranění nikdo „nezpůsobil" (dV): žádný valoun, El Gringo ani zabiják.
            // Karta zůstává ležet. Po zásahu se pokračuje do handleStartOfTurnChecks, které
            // už ví, že Chřestýš i Dynamit jsou v tomhle tahu odbavené → fáze lízání.
            if (suit === Suits.SPADES) {
                this.pendingDynamiteDamage = { playerIdx: check.playerIdx, hitsLeft: 1, source: 'RATTLESNAKE' };
                this.phase = "DYNAMITE_DAMAGE";
            } else {
                this.startDrawPhase();
            }
        } else if (check.reason === "COLORADO") {
            // Údolí stínů – Colorado Bill: ♠ (podle _effSuit – Požehnání nikdy, Prokletí
            // vždy) = rozehraný BANG! nejde zrušit. Viz _coloradoResult (logic/valley.js).
            this._coloradoResult(check, suit === Suits.SPADES);
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
        } else if (check.reason === "DON_BELL") {
            // Zlatá horečka – Don Bell: červená (♥ nebo ♦) = tah navíc. Barva se čte přes
            // _effSuit jako všude jinde, takže Požehnání dává tah navíc vždycky a Prokletí
            // nikdy. `_donBellDone` je nastavené od začátku sejmutí, takže se nextTurn
            // zeptat znovu nemůže a tah se prostě posune dál.
            this._donBellResult(suit === Suits.HEARTS || suit === Suits.DIAMONDS);
        } else if (check.reason === "TEREN_KILL") {
            // Divoký západ – Teren Kill: ♠ = vyřazení, které se na tohle sejmutí
            // pozastavilo, proběhne doopravdy; cokoli jiného = zůstává na 1 životě
            // a líže si kartu. Viz _terenKillResult (logic/wildWest.js).
            this._terenKillResult(check.playerIdx, suit === Suits.SPADES);
        } else if (check.reason === "BARREL" || check.reason === "JOURDONNAIS") {
            // Fistful – Ruská ruleta: sejmutí nahrazuje odhozenou kartu Vedle! (FAQ Q13),
            // takže se nevyhodnocuje obrana, ale kolečko (viz _rouletteBarrelResult).
            if (check.roulette) { this._rouletteBarrelResult(check, suit === Suits.HEARTS); return; }
            if (suit === Suits.HEARTS) {
                const attacker = this.players[check.attackerIdx];
                // Kolik karet Vedle! si útok žádá celkem. Obvykle to nese sám check
                // (`missesNeeded` – Odstřelovač z Fistfulu = 2); dopočet ze Slaba the Killer
                // je záloha pro cesty, které check staví bez něj (Kulomet).
                // Bang-efekt: Slabův bonus neplatí (barel = uhnul napoprvé).
                const needed = check.missesNeeded ||
                    ((!check.bangEffect && hasAbility(attacker, "Slab the Killer")) ? 2 : 1);

                // Úspěšný barel se počítá za JEDNU kartu Vedle! – u dvojnásobné obrany
                // (Slab the Killer, Odstřelovač) tedy zbytek musí hráč ještě dohrát.
                if (needed > 1 && (this.missesPlayed || 0) < 1 && check.sourceCard !== CardType.GATLING) {
                    this.missesPlayed = 0;
                    this.waitForMissed(check.playerIdx, check.attackerIdx, check.sourceCard, check.bangEffect, check.sourceCardName, check.ricochet, needed - 1, check.vos || null);
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
                        missesNeeded: check.missesNeeded,
                        ...(check.vos ? { vos: check.vos } : {})
                    };
                    this.phase = "BARREL_DRAW";
                } else {
                    // Barel neuhnul → obrana pokračuje s PŮVODNÍM počtem karet Vedle!.
                    // Bez `missesNeeded` by Odstřelovač spadl na 1 (útočník Slab být nemusí).
                    this.waitForMissed(check.playerIdx, check.attackerIdx, check.sourceCard, check.bangEffect, check.sourceCardName, check.ricochet, check.missesNeeded, check.vos || null);
                }
            }
        }
    },

    resolveCheck() {
        if (!this.currentCheck || !this.currentCheck.active) return;
        const check = this.currentCheck;
        const p = this.players[check.playerIdx];
        check.active = false;

        if (this._checkRevealCount(p) > 1) {
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
