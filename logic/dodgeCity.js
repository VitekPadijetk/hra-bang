// logic/dodgeCity.js — mixin GameState: mechanika rozšíření Dodge City „odhoď další
// kartu" (Springfield/Tequila/Whisky/Ragtime/Rvačka). Připojuje se na GameState.prototype
// (browser: <script> po logic.js; Node: require z logic.js). Globály (CardType) dodá logic.js.
//
// POŘADÍ AKCE (shodné pro všechny): hráč vybere hlavní kartu → zvolí CÍL (balíček u
// Whisky/Rvačky, postavu u Tequily/Springfieldu, kartu soupeře u Ragtime) → hlavní karta
// se „zmenší" (fáze DISCARD_ANOTHER) → hráč klikne na jinou svou kartu (cenu) → teprve pak
// se spustí efekt. Do odhozu jde nejdřív odhozená („další") karta, pak hlavní karta.
(function () {
const DodgeCityMixin = {
    // Hráč zahrál kartu s `discardExtra` a rovnou zvolil cíl efektu. Uložíme cíl a
    // přejdeme na výběr „další karty" (ceny). `target` = { targetIdx, area, boardIdx }
    // podle efektu; u heal_self_2/brawl je null (cíl je implicitní / všichni).
    startDiscardExtra(cardIndex, target) {
        if (this.phase !== "PLAY") return;
        const player = this.getCurrentPlayer();
        const card = player.hand[cardIndex];
        if (!card || !card.discardExtra) return;
        if (player.hand.length < 2) return; // není čím zaplatit „další kartu"
        const effect = card.discardExtra;
        const pIdx = this.currentPlayerIndex;

        // Validace zvoleného cíle podle efektu (neplatný cíl → nic se nestane).
        if (effect === 'heal_any') {
            const t = this.players[target?.targetIdx];
            if (!t || t.health <= 0) return;
        } else if (effect === 'bang_any') {
            const t = this.players[target?.targetIdx];
            if (!t || t.health <= 0 || target.targetIdx === pIdx) return;
        } else if (effect === 'steal_any') {
            const t = this.players[target?.targetIdx];
            if (!t || t.health <= 0 || target.targetIdx === pIdx || !this._hasAnyCard(t) || !target.area) return;
        }

        this.pendingDiscardAnother = {
            playerIdx: pIdx,
            mainCardId: card.id,
            effect,
            target: target || null,
        };
        this.phase = "DISCARD_ANOTHER";
    },

    // Hráč si to rozmyslel: hlavní karta ještě NEBYLA odhozena (leží v ruce), takže
    // stačí zrušit rozehraný stav a vrátit se do fáze hraní.
    cancelDiscardAnother(playerIdx) {
        const pending = this.pendingDiscardAnother;
        if (!pending || pending.playerIdx !== playerIdx) return;
        if (this.phase !== "DISCARD_ANOTHER") return;
        this.pendingDiscardAnother = null;
        this.phase = "PLAY";
    },

    // Hráč vybral „další kartu" (cenu) – odhodíme ji i hlavní kartu a spustíme efekt.
    // Do odhozu jde NEJPRVE odhozená („další") karta, pak hlavní karta (dle pravidel).
    discardAnotherCard(playerIdx, extraCardIdx) {
        const pending = this.pendingDiscardAnother;
        if (!pending || pending.playerIdx !== playerIdx) return;
        const player = this.players[playerIdx];
        if (!player) return;
        const mainIdx = player.hand.findIndex(c => c.id === pending.mainCardId);
        if (mainIdx === -1) return;
        if (extraCardIdx === mainIdx || !player.hand[extraCardIdx]) return;

        const { effect, target } = pending;
        this._trackCard(playerIdx, player.hand[mainIdx].type);

        // Nejdřív vyjmi „další" (odhozenou) kartu, pak hlavní (indexy se posunou → hledej znovu).
        const extraCard = player.hand.splice(extraCardIdx, 1)[0];
        const mainIdx2 = player.hand.findIndex(c => c.id === pending.mainCardId);
        const mainCard = mainIdx2 !== -1 ? player.hand.splice(mainIdx2, 1)[0] : null;
        this.deck.discardPile.push(extraCard);           // 1) odhozená karta
        if (mainCard) this.deck.discardPile.push(mainCard); // 2) hraná karta navrch

        this.pendingDiscardAnother = null;
        this.checkSuzyLafayette(player);
        this._dispatchDiscardExtraEffect(playerIdx, effect, target);
    },

    _dispatchDiscardExtraEffect(playerIdx, effect, target) {
        const player = this.players[playerIdx];
        if (effect === 'heal_self_2') {
            // Whisky: +2 sobě (do maxima).
            player.health = Math.min(player.health + 2, player.maxHealth);
            this.phase = "PLAY";
            this._processSpecialQueue();
        } else if (effect === 'heal_any') {
            // Tequila: +1 zvolenému hráči. Je to efekt „vyléčit život", ne Pivo → i
            // Tequila Joe dostane jen +1 jako kdokoli jiný.
            const t = this.players[target?.targetIdx];
            if (t && t.health > 0) t.health = Math.min(t.health + 1, t.maxHealth);
            this.phase = "PLAY";
            this._processSpecialQueue();
        } else if (effect === 'bang_any') {
            // Springfield: bang-efekt na zvoleného hráče (bez omezení vzdálenosti/limitu).
            const targetIdx = target?.targetIdx;
            const t = this.players[targetIdx];
            if (!t || t.health <= 0 || targetIdx === playerIdx) {
                this.phase = "PLAY";
                this._processSpecialQueue();
                return;
            }
            this.players[playerIdx].stats.bangsFired++;
            this.currentAttacker = playerIdx;
            this._beginBangResolution(playerIdx, targetIdx, true); // isEffect = true
            this._processSpecialQueue();
        } else if (effect === 'steal_any') {
            // Ragtime: ukradni konkrétní kartu zvoleného hráče (Panika bez vzdálenosti).
            // Cíl karty už znám z target → vyřeš rovnou přes společnou resolveCardSelection.
            const targetIdx = target?.targetIdx;
            const t = this.players[targetIdx];
            if (!t || t.health <= 0 || targetIdx === playerIdx || !this._hasAnyCard(t)) {
                this.phase = "PLAY";
                this._processSpecialQueue();
                return;
            }
            this.pendingSelection = { attackerIdx: playerIdx, targetIdx, sourceCardType: CardType.PANIC, ignoreDistance: true };
            this.phase = "SELECTING_TARGET_CARD";
            this.resolveCardSelection(playerIdx, target.area, target.boardIdx);
        } else if (effect === 'brawl') {
            // Rvačka: teprve teď (po zaplacení) si hráč vybírá po směru komu a co zahodí.
            this._startBrawl(playerIdx);
        } else {
            this.phase = "PLAY";
            this._processSpecialQueue();
        }
    },

    // Rvačka: každý ostatní živý hráč s kartou odhodí 1 kartu, kterou vybere útočník.
    // Pořadí po směru hodinových ručiček počínaje hráčem po levici útočníka (idx+1).
    _startBrawl(attackerIdx) {
        this.brawlAttackerIdx = attackerIdx;
        const n = this.players.length;
        const order = [];
        for (let k = 1; k < n; k++) {
            const idx = (attackerIdx + k) % n;
            if (this.players[idx].health > 0 && this._hasAnyCard(this.players[idx])) order.push(idx);
        }
        this.brawlQueue = order;
        this._advanceBrawl();
    },

    _advanceBrawl() {
        while (this.brawlQueue && this.brawlQueue.length > 0) {
            const targetIdx = this.brawlQueue.shift();
            const t = this.players[targetIdx];
            if (t && t.health > 0 && this._hasAnyCard(t)) {
                this.pendingSelection = {
                    attackerIdx: this.brawlAttackerIdx,
                    targetIdx,
                    sourceCardType: CardType.CAT_BALOU,
                    ignoreDistance: true,
                    isBrawl: true,
                };
                this.phase = "SELECTING_TARGET_CARD";
                return;
            }
        }
        // Fronta prázdná → konec Rvačky.
        this.brawlQueue = null;
        this.brawlAttackerIdx = null;
        this.phase = "PLAY";
        this._processSpecialQueue();
    },

    _hasAnyCard(p) {
        return p.hand.length > 0 ||
            (p.weapon && p.weapon.id !== -1) ||
            (p.board && p.board.length > 0);
    },

    // ── Zelené karty: aktivace ze stolu ve svém tahu ────────────────────────────
    // Vedle!-zelené (activate 'miss') se ve svém tahu NEaktivují – jen jako reakce
    // (viz handleResponse s boardCardId). Ostatní se odhodí a spustí efekt.
    activateGreenCard(playerIdx, cardId, target) {
        if (this.phase !== "PLAY") return;
        if (this.currentPlayerIndex !== playerIdx) return;
        const player = this.players[playerIdx];
        if (!player) return;
        const idx = player.board.findIndex(c => c.id === cardId);
        if (idx === -1) return;
        const card = player.board[idx];
        if (!card.green) return;
        if (card._playedTurn === this.turnId) return;   // nelze ve stejném tahu, kdy byla položena
        if (card.activate === 'miss') return;            // Vedle!-zelené jen jako reakce

        const discardAndTrack = () => {
            player.board.splice(idx, 1);
            this.deck.discardPile.push(card);
            this._trackCard(playerIdx, card.type);
        };

        // Bang-efekt zelené (Pepperbox/Puška na bizony/Nůž/Derringer/Houfnice).
        if (card.bangEffect) {
            if (card.range === 'mass') {                 // Houfnice = útok na všechny ostatní (Kulomet)
                discardAndTrack();
                this.currentAttacker = playerIdx;
                this.missesRequired = 1; this.missesPlayed = 0;
                this._massAttackSuit = card.suit;        // Apache Kid: kárová Houfnice ho míjí
                this._advanceMassAttack(playerIdx, playerIdx, CardType.GATLING);
                this._processSpecialQueue();
                return;
            }
            const targetIdx = target?.targetIdx;
            const t = this.players[targetIdx];
            let reach;
            if (card.range === 'any') reach = Infinity;
            else if (typeof card.range === 'number') reach = card.range;
            else reach = player.weapon?.range || player.weapon?.props?.range || 1;   // 'weapon' = dostřel zbraně
            if (!t || t.health <= 0 || targetIdx === playerIdx || computeDistance(this, playerIdx, targetIdx) > reach) return;
            // Apache Kid: kárová bang-efekt zelená ho míjí (karta se přesto odhodí).
            if (this._apacheImmune(targetIdx, card.suit, playerIdx)) {
                discardAndTrack();
                this.phase = "PLAY";
                this._processSpecialQueue();
                return;
            }
            discardAndTrack();
            if (card.draw) { for (let k = 0; k < card.draw; k++) this.specialActionQueue.push({ type: 'UHYB_DRAW', playerIdx }); }
            player.stats.bangsFired++;
            this.currentAttacker = playerIdx;
            this._beginBangResolution(playerIdx, targetIdx, true); // isEffect = true
            this._processSpecialQueue();
            return;
        }

        const eff = card.activate;
        if (eff === 'heal_self') {                       // Čutora – +1 sobě (efekt, ne Pivo)
            if (player.health >= player.maxHealth) return;
            discardAndTrack();
            player.health = Math.min(player.health + 1, player.maxHealth);
            this.checkSuzyLafayette(player);
            this.phase = "PLAY";
            this._processSpecialQueue();
            return;
        }
        if (eff === 'draw_3') {                          // Pony express – lízni 3 (Wells Fargo)
            discardAndTrack();
            this.checkSuzyLafayette(player);
            this.drawPhaseState = { active: true, playerIdx, cardsNeeded: 3, cardsDrawn: 0, options: ['deck'], isStartOfTurn: false };
            this.phase = "DRAW";
            return;
        }
        if (eff === 'steal_any' || eff === 'discard_any') {   // Krytý vůz / Kankán – bez vzdálenosti
            const targetIdx = target?.targetIdx;
            const t = this.players[targetIdx];
            if (!t || t.health <= 0 || targetIdx === playerIdx || !this._hasAnyCard(t) || !target?.area) return;
            // Apache Kid: kárový Krytý vůz (9♦) ho míjí – karta se aktivuje naprázdno.
            if (this._apacheImmune(targetIdx, card.suit, playerIdx)) {
                discardAndTrack();
                this.checkSuzyLafayette(player);
                this.phase = "PLAY";
                this._processSpecialQueue();
                return;
            }
            discardAndTrack();
            this.checkSuzyLafayette(player);
            this.pendingSelection = {
                attackerIdx: playerIdx, targetIdx,
                sourceCardType: eff === 'steal_any' ? CardType.PANIC : CardType.CAT_BALOU,
                ignoreDistance: true,
            };
            this.phase = "SELECTING_TARGET_CARD";
            this.resolveCardSelection(playerIdx, target.area, target.boardIdx);
            return;
        }
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DodgeCityMixin;
} else {
    Object.assign(GameState.prototype, DodgeCityMixin);
}
})();
