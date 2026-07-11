// logic/combat.js — mixin GameState: zranění, smrt hráče, Sid Ketchum záchrana,
// dynamitové zásahy. Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {
const CombatMixin = {
    handleDamage(targetIdx, attackerIdx = null) {
        let target = this.players[targetIdx];
        if (!target || target.health <= 0) return;

        target.health--;
        target.stats.damageTaken++;
        if (attackerIdx !== null && attackerIdx !== targetIdx) {
            this.players[attackerIdx].stats.damageDealt++;
        }

        const attName = attackerIdx !== null ? this.players[attackerIdx]?.name : null;
        this.logEvent('damage', { who: target.name, hp: `${target.health + 1}→${target.health}`, by: attName });

        if (target.health <= 0) {
            target.health = 0;
            this.handlePlayerDeath(targetIdx);
            return;
        }

        if (effectiveCharacter(target) === "Bart Cassidy") {
            this.specialActionQueue.push({ type: 'BART_DRAW', playerIdx: targetIdx });
        }
        if (effectiveCharacter(target) === "El Gringo" && attackerIdx !== null && attackerIdx !== targetIdx) {
            const attacker = this.players[attackerIdx];
            if (attacker && attacker.health > 0 && attacker.hand.length > 0) {
                this.specialActionQueue.push({ type: 'EL_GRINGO_STEAL', playerIdx: targetIdx, attackerIdx });
            }
        }
    },

    sidSaveDiscard(playerIdx, cardIdx) {
        if (this.phase !== "SID_SAVE" || !this.pendingSidSave) return;
        if (this.pendingSidSave.playerIdx !== playerIdx) return;
        const p = this.players[playerIdx];
        if (!p || !p.hand[cardIdx]) return;

        this.deck.discardPile.push(p.hand.splice(cardIdx, 1)[0]);

        if (!this.pendingSidSave.firstDiscarded) {
            this.pendingSidSave.firstDiscarded = true;
            return;
        }

        p.health = 1;
        this.logEvent('special', { who: p.name, card: 'Sid Ketchum (záchrana 2 kartami)' });
        this.pendingSidSave = null;
        this._resumeAfterSpecial();
    },

    handlePlayerDeath(deadIdx, explicitKillerIdx = undefined) {
        const deadPlayer = this.players[deadIdx];
        const killerIdx = explicitKillerIdx === undefined ? this.currentPlayerIndex : explicitKillerIdx;
        const killer = killerIdx !== null ? this.players[killerIdx] : null;

        this._deathAnimPlayerIdx = deadIdx;

        // Snapshot karet PŘED přesunem (animace odhozu/krádeže – Návrh 2): modré karty
        // (player.board, pořadí nejstarší→nejnovější), zbraň (jen skutečná, ne Colt),
        // a ruka. Identity jsou po odhození/sebrání veřejné → posílají se všem.
        this._deathAnimData = this._deathAnimData || {};
        this._deathAnimData[deadIdx] = {
            blue: deadPlayer.board.map(c => ({ id: c.id })),
            weapon: (deadPlayer.weapon && deadPlayer.weapon.id !== -1) ? { id: deadPlayer.weapon.id } : null,
            hand: deadPlayer.hand.map(c => ({ id: c.id })),
        };

        const vulture = this.players.find(p => effectiveCharacter(p) === "Vulture Sam" && p.health > 0);

        // Skutečná zbraň (ne výchozí Colt) jde do hry stejně jako modré/ruka – buď ji sebere
        // Vulture Sam, nebo padne do odhozu. Dřív se ztrácela (jen se resetovala na Colt).
        const deadWeapon = (deadPlayer.weapon && deadPlayer.weapon.id !== -1) ? [deadPlayer.weapon] : [];

        if (vulture) {
            vulture.hand.push(...deadPlayer.hand, ...deadPlayer.board, ...deadWeapon);
            this.checkSuzyLafayette(vulture);
        } else {
            this.deck.discardPile.push(...deadPlayer.hand, ...deadPlayer.board, ...deadWeapon);
        }

        deadPlayer.hand = [];
        deadPlayer.board = [];
        deadPlayer.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };

        if (deadPlayer.role === "Outlaw" && killerIdx !== null && killerIdx !== deadIdx) {
            this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: killerIdx, cardsNeeded: 3 });
        }

        if (deadPlayer.role === "Deputy" && killer && killer.role === "Sheriff") {
            const killerWeapon = (killer.weapon && killer.weapon.id !== -1) ? [killer.weapon] : [];
            this.deck.discardPile.push(...killer.hand, ...killer.board, ...killerWeapon);
            killer.hand = []; killer.board = [];
            killer.weapon = new Card(-1, "Colt .45", CardType.WEAPON, null, null, { range: 1 });
        }

        // Dodge City – reakce na vyřazení JINÉ postavy (nezáleží, kdo zabil):
        // Greg Digger +2 životy (do maxima), Herb Hunter lízne 2 karty (kill-reward fronta).
        this.players.forEach((p, idx) => {
            if (idx === deadIdx || p.health <= 0) return;
            if (effectiveCharacter(p) === "Greg Digger") {
                p.health = Math.min(p.health + 2, p.maxHealth);
            }
            if (effectiveCharacter(p) === "Herb Hunter") {
                this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: idx, cardsNeeded: 2 });
            }
        });

        const killerName = killerIdx !== null ? this.players[killerIdx]?.name : 'dynamit';
        let deathReward = null;
        if (deadPlayer.role === "Outlaw") deathReward = `${killerName} +3 karty`;
        else if (deadPlayer.role === "Deputy" && this.players[killerIdx]?.role === "Sheriff") deathReward = `Šerif ${killerName} ztrácí všechny karty`;
        this.logEvent('death', { who: deadPlayer.name, role: deadPlayer.role, killer: killerName, reward: deathReward });

        this.checkWinCondition();

        if (!this.winner && deadIdx === this.currentPlayerIndex &&
            (this.phase === "PLAY" || this.phase === "DRAW")) {
            this._autoEndTurnPending = true;
            this._deadPlayerIdx = deadIdx;
        }
    },

    // ── DYNAMIT: hráč klikne na životy (1 hit z 3) ────────────────────────────
    takeDynamiteHit(playerIdx) {
        if (this.phase !== "DYNAMITE_DAMAGE") return;
        const pdd = this.pendingDynamiteDamage;
        if (!pdd || pdd.playerIdx !== playerIdx) return;

        const p = this.players[playerIdx];
        p.health--;
        p.stats.damageTaken++;
        this.logEvent('dynamite', { who: p.name, hp: p.health, hitsLeft: pdd.hitsLeft - 1 });

        if (p.health <= 0) {
            p.health = 0;
            this.pendingDynamiteDamage = null;
            this.handlePlayerDeath(playerIdx, null);
            if (this.winner) return;
            // Smrt na dynamit může do fronty přidat odložené akce (Herb Hunter: lízni 2 za
            // vyřazení). Ty se MUSÍ dobrat DŘÍV, než se posune tah – jinak by začal hrát další
            // hráč (a líznul si na svůj dynamit) s Herbovou odměnou pořád ve frontě a hra by
            // uvázla. Tah proto posuneme až po vyprázdnění fronty (viz _nextTurnAfterQueue).
            if (this.specialActionQueue.length > 0) {
                this._nextTurnAfterQueue = true;
                this._processSpecialQueue();
            } else {
                this.nextTurn();
            }
            return;
        }

        pdd.hitsLeft--;
        if (pdd.hitsLeft <= 0) {
            this.pendingDynamiteDamage = null;
            this.handleStartOfTurnChecks();
        }
        // Jinak zůstane v DYNAMITE_DAMAGE – hráč klikne znovu
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CombatMixin;
} else {
    Object.assign(GameState.prototype, CombatMixin);
}
})();
