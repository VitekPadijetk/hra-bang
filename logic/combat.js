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
            // High Noon – Město duchů: duch během svého tahu umřít nemůže. Zásah mu život
            // sebere (klidně i ten, který si naléčil), ale srazí ho jen na nulu – tam už
            // ho další zásahy míjejí (early return nahoře). Schopnosti za ztrátu života
            // (Bart Cassidy, El Gringo) se pod tím spustí normálně.
            if (!target._ghost) {
                this.handlePlayerDeath(targetIdx);
                return;
            }
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

        // Vulture Samů může být u stolu víc – prakticky Vulture Sam + Vera Custer, která
        // jeho schopnost zrovna kopíruje. Pořadí = po směru hodinových ručiček od mrtvého
        // (první za ním si vybírá první kartu), viz _startVultureSplit v logic/characters.js.
        const vultures = [];
        for (let step = 1; step <= this.players.length; step++) {
            const i = (deadIdx + step) % this.players.length;
            const p = this.players[i];
            if (i === deadIdx || !p || !isInPlay(p)) continue;   // duch (Město duchů) sbírá taky
            if (effectiveCharacter(p) === "Vulture Sam") vultures.push(i);
        }

        // Skutečná zbraň (ne výchozí Colt) jde do hry stejně jako modré/ruka – buď ji sebere
        // Vulture Sam, nebo padne do odhozu. Dřív se ztrácela (jen se resetovala na Colt).
        const deadWeapon = (deadPlayer.weapon && deadPlayer.weapon.id !== -1) ? [deadPlayer.weapon] : [];
        const deadCardCount = deadPlayer.hand.length + deadPlayer.board.length + deadWeapon.length;

        if (vultures.length > 1 && deadCardCount > 0) {
            // Dva a víc Samů → karty se DĚLÍ: střídavě si berou po jedné (jako Panika –
            // z ruky náhodně, ze stolu konkrétní kartu), dokud karty nedojdou. Hra se do
            // té doby pozastaví; karty zůstávají u mrtvého, aby bylo z čeho vybírat.
            // Fronta: VULTURE_SPLIT je před odměnou za banditu (ta se přidává níž).
            this.pendingVultureSplit = { deadIdx, pickers: vultures, next: 0 };
            this.specialActionQueue.push({ type: 'VULTURE_SPLIT' });
        } else {
            if (vultures.length === 1) {
                const vulture = this.players[vultures[0]];
                vulture.hand.push(...deadPlayer.hand, ...deadPlayer.board, ...deadWeapon);
                this.checkSuzyLafayette(vulture);
            } else {
                this.deck.discardPile.push(...deadPlayer.hand, ...deadPlayer.board, ...deadWeapon);
            }

            deadPlayer.hand = [];
            deadPlayer.board = [];
            deadPlayer.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
        }

        // Dodge City – reakce na vyřazení JINÉ postavy (nezáleží, kdo zabil):
        // Greg Digger +2 životy (do maxima), Herb Hunter lízne 2 karty (kill-reward fronta).
        // Herb je ve frontě PŘED odměnou za banditu: schopnost postavy se vyhodnotí dřív
        // než odměna za roli (a u zabijáka-Herba se tak jeho 2 karty nesmíchají s 3 kartami).
        this.players.forEach((p, idx) => {
            if (idx === deadIdx || p.health <= 0) return;
            if (effectiveCharacter(p) === "Greg Digger") {
                p.health = Math.min(p.health + 2, p.maxHealth);
            }
            if (effectiveCharacter(p) === "Herb Hunter") {
                this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: idx, cardsNeeded: 2 });
            }
        });

        // Hra pro 3 (Město duchů): 3 karty dostane každý, kdo někoho vyřadil, bez ohledu na
        // role. Kdo vyřadil SVÉHO určeného nepřítele (TARGET_3P), hru tím vyhrál – zabije-li
        // ho někdo jiný (nebo dynamit, tedy nikdo), novým cílem obou zbylých je zůstat
        // naživu jako poslední, což řeší samo evaluateWinner3p.
        if (this.mode3p) {
            if (killerIdx !== null && killerIdx !== deadIdx) {
                this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: killerIdx, cardsNeeded: 3 });
                if (killer && TARGET_3P[killer.role] === deadPlayer.role) this._winClaim3p = killerIdx;
            }
        }
        else if (deadPlayer.role === "Outlaw" && killerIdx !== null && killerIdx !== deadIdx) {
            this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: killerIdx, cardsNeeded: 3 });
        }

        // Pokuta za zabití vlastního pomocníka. Ve hře pro 3 šerif není, takže tahle větev
        // tam nikdy nespustí (podmínka na roli Sheriff se nesplní).
        if (deadPlayer.role === "Deputy" && killer && killer.role === "Sheriff") {
            const killerWeapon = (killer.weapon && killer.weapon.id !== -1) ? [killer.weapon] : [];
            // Snapshot PŘED přesunem: klient odhodí šerifovy karty stejnou animací jako
            // při smrti (po jedné do odhozu), jen bez poklesu životů a bez odhalení role –
            // a Colt .45 mu zůstává. Emituje server/anim.js (emitDeathAnim).
            if (killer.hand.length || killer.board.length || killerWeapon.length) {
                this._sheriffPenaltyAnim = {
                    playerIdx: killerIdx,
                    blue: killer.board.map(c => ({ id: c.id })),
                    weapon: killerWeapon.length ? { id: killerWeapon[0].id } : null,
                    hand: killer.hand.map(c => ({ id: c.id })),
                };
            }
            this.deck.discardPile.push(...killer.hand, ...killer.board, ...killerWeapon);
            killer.hand = []; killer.board = [];
            killer.weapon = new Card(-1, "Colt .45", CardType.WEAPON, null, null, { range: 1 });
        }

        const killerName = killerIdx !== null ? this.players[killerIdx]?.name : 'dynamit';
        let deathReward = null;
        if (this.mode3p) {
            if (killerIdx !== null && killerIdx !== deadIdx) deathReward = `${killerName} +3 karty`;
            if (this._winClaim3p !== null) deathReward += ' a vyhrává (vlastní cíl)';
        }
        else if (deadPlayer.role === "Outlaw") deathReward = `${killerName} +3 karty`;
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
            // Frontu je nutné nejdřív pročistit: _pruneSuzyQueue z ní vyhodí líznutí, které
            // už neplatí (Suzy Lafayette mezitím karty dostala / je mimo hru). Bez toho by
            // `length > 0` prošlo, _processSpecialQueue by nic nerozeběhlo a hra by uvázla
            // ve fázi, ve které zrovna je – u dynamitu s prázdným pendingDynamiteDamage,
            // takže by na ni ani nešlo kliknout (pendingActor = null).
            this._pruneSuzyQueue();
            if (this.specialActionQueue.length > 0) {
                this._nextTurnAfterQueue = true;
                this._processSpecialQueue();
            } else {
                this.nextTurn();
            }
            return;
        }

        pdd.hitsLeft--;

        // Bart Cassidy si líže za KAŽDÝ ztracený život – dynamit nevyjímaje. Zásahy se tu
        // klikají po jednom, takže líznutí přibude ke každému z nich (a Bart smí zahrát
        // Pivo z karty, kterou si zrovna líznul). Nejde to přes handleDamage: ten by
        // spustil i cizí reakce (El Gringo), jenže u dynamitu žádný útočník není. Do fronty
        // se dává jen za PŘEŽITÝ zásah – stejně jako v handleDamage (smrt řeší větev výš).
        if (effectiveCharacter(p) === "Bart Cassidy") {
            this.specialActionQueue.push({ type: 'BART_DRAW', playerIdx });
        }

        if (pdd.hitsLeft <= 0) {
            this.pendingDynamiteDamage = null;
            // Frontu je nutné dobrat DŘÍV než kontrolu Vězení a fázi lízání:
            // _processSpecialQueue během aktivního lízání záměrně nic nepouští, takže by
            // Bartova líznutí zůstala viset až za jeho vlastní fází lízání.
            this._pruneSuzyQueue();   // viz komentář u smrti na dynamit výš
            if (this.specialActionQueue.length > 0) {
                this._startChecksAfterQueue = true;
                this._processSpecialQueue();
            } else {
                this.handleStartOfTurnChecks();
            }
            return;
        }
        // Zbývají další zásahy: po případném líznutí se přes interruptedPhase vrátíme
        // do DYNAMITE_DAMAGE a hráč klikne znovu.
        this._processSpecialQueue();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CombatMixin;
} else {
    Object.assign(GameState.prototype, CombatMixin);
}
})();
