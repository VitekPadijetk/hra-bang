// logic/response.js — mixin GameState: reakce na útok (Vedle!/Bang! u duelu),
// záchrana posledního života Pivem/Sidem, postup po reakci. handleResponse je
// hlavní vyhodnocení RESPOND fáze. Připojuje se na GameState.prototype. Viz CLAUDE.md.
(function () {
const ResponseMixin = {
    // ── PIVO jako záchrana při posledním životě (RESPOND nebo DYNAMITE_DAMAGE) ──
    beerLastLifeSave(playerIdx, cardIdx) {
        const p = this.players[playerIdx];
        if (!p || p.health !== 1) return false;
        const card = p.hand[cardIdx];
        if (!card || card.type !== CardType.BEER) return false;
        const aliveCount = inPlayCount(this.players);   // duch (Město duchů) se počítá
        if (aliveCount <= 2) return false;
        if (this._beerBlocked()) return false;   // High Noon – Reverend: Pivo se hrát nedá
        if (this._suitBlocked(playerIdx, card)) return false;   // High Noon – Želízka

        // Tequila Joe (Dodge City): Pivo mu dá 2 životy i při záchraně před vyřazením.
        // Jeden život vždy zaplatí zásah, který ho měl vyřadit; přebytek se použije dál
        // (u dynamitu na další zásah, jinak jako skutečné vyléčení).
        const gain = effectiveCharacter(p) === "Tequila Joe" ? 2 : 1;

        // Validace fáze PŘED odhozením karty – jinak by se pivo ztratilo i při návratu false.
        if (this.phase === "DYNAMITE_DAMAGE") {
            const pdd = this.pendingDynamiteDamage;
            if (!pdd || pdd.playerIdx !== playerIdx) return false;

            this.deck.discard(p.hand.splice(cardIdx, 1)[0]);
            this.checkSuzyLafayette(p);

            // Dynamit je tu rozložený na 3 zásahy po 1 (klikání), pravidla ho berou jako
            // -3 najednou. Aby to vyšlo stejně, Joeův druhý život zruší i další zásah
            // (2 HP + pivo → přežije za jedno pivo), a když už žádný nezbývá, léčí.
            pdd.hitsLeft--;
            let extra = gain - 1;
            while (extra > 0 && pdd.hitsLeft > 0) { pdd.hitsLeft--; extra--; }
            if (extra > 0) p.health = Math.min(p.health + extra, p.maxHealth);

            if (pdd.hitsLeft <= 0) {
                this.pendingDynamiteDamage = null;
                // Ruská ruleta (Fistful) sem posílá zásahy z krokovače startu tahu →
                // pokračuje se do něj, ne do kontrol Dynamit/Vězení (viz _afterDamageClicks).
                this._afterDamageClicks(pdd.resume, false);
            }
            return true;
        }

        // High Noon – Pravé poledne: Pivo zruší ztrátu života na začátku tahu. Hráč
        // zůstává na 1 HP a tah pokračuje tam, kde ho start tahu přerušil.
        if (this.phase === "NOON_DAMAGE") {
            const pnd = this.pendingNoonDamage;
            if (!pnd || pnd.playerIdx !== playerIdx) return false;

            this.deck.discard(p.hand.splice(cardIdx, 1)[0]);
            this.checkSuzyLafayette(p);
            if (gain > 1) p.health = Math.min(p.health + gain - 1, p.maxHealth);

            this.pendingNoonDamage = null;
            this._resumeBeginTurn();
            return true;
        }

        if (this.phase === "RESPOND") {
            const pr = this.pendingResponse;
            if (!pr?.active || pr.targetIdx !== playerIdx) return false;
            // Fistful – Odražená střela neohrožuje život, ale kartu na stole. Pivo (ani
            // Sid) ji zachránit nemůže – jinak by šlo za jedno Pivo ubránit cokoli.
            if (pr.ricochet) return false;

            this.deck.discard(p.hand.splice(cardIdx, 1)[0]);
            // Molly Stark: Pivo zahrané mimo její tah je taky „zahraná karta z ruky",
            // takže si za něj lízne. V Duelu se náhrada odloží až na jeho konec (stejně
            // jako u Bang!) – zachráněný Duel končí hned v _advanceAfterLastLifeSave,
            // kde se odložené náhrady uvolní.
            this._mollyPlayedOutOfTurn(playerIdx, pr.sourceCard === CardType.DUEL);
            this.checkSuzyLafayette(p);

            // Zásah se nikdy neaplikuje (hráč zůstává na 1 HP) → přebytek je čisté léčení.
            if (gain > 1) p.health = Math.min(p.health + gain - 1, p.maxHealth);

            this._advanceAfterLastLifeSave(playerIdx);
            return true;
        }

        return false;
    },

    // ── SID KETCHUM záchrana při posledním životě ──────────────────────────────
    sidLastLifeSave(playerIdx, cardIdx1, cardIdx2) {
        const p = this.players[playerIdx];
        if (!p || p.health !== 1 || effectiveCharacter(p) !== "Sid Ketchum") return false;
        const aliveCount = inPlayCount(this.players);   // duch (Město duchů) se počítá
        if (aliveCount <= 2) return false;
        if (p.hand.length < 2) return false;
        // Fistful – Odražená střela ohrožuje kartu na stole, ne život (viz beerLastLifeSave).
        if (this.phase === "RESPOND" && this.pendingResponse?.ricochet) return false;

        const indices = [cardIdx1, cardIdx2].sort((a, b) => b - a);
        if (indices[0] >= p.hand.length || indices[1] < 0 || indices[0] === indices[1]) return false;
        indices.forEach(idx => {
            if (p.hand[idx]) this.deck.discard(p.hand.splice(idx, 1)[0]);
        });
        this.checkSuzyLafayette(p);

        if (this.phase === "DYNAMITE_DAMAGE") {
            const pdd = this.pendingDynamiteDamage;
            if (!pdd || pdd.playerIdx !== playerIdx) return false;
            pdd.hitsLeft--;
            if (pdd.hitsLeft <= 0) {
                this.pendingDynamiteDamage = null;
                this._afterDamageClicks(pdd.resume, false);   // Ruská ruleta → zpět do startu tahu
            }
            return true;
        }

        // High Noon – Pravé poledne (viz beerLastLifeSave).
        if (this.phase === "NOON_DAMAGE") {
            const pnd = this.pendingNoonDamage;
            if (!pnd || pnd.playerIdx !== playerIdx) return false;
            this.pendingNoonDamage = null;
            this._resumeBeginTurn();
            return true;
        }

        if (this.phase === "RESPOND") {
            this._advanceAfterLastLifeSave(playerIdx);
            return true;
        }

        return false;
    },

    // ── Pokračuj v RESPOND po záchraně (beer nebo Sid) ────────────────────────
    _advanceAfterLastLifeSave(playerIdx) {
        const pr = this.pendingResponse;
        if (!pr) return;
        pr.active = false;
        pr.responded.push(playerIdx);

        if (pr.sourceCard === CardType.DUEL) {
            // Pivo/Sid zachránilo život – duel končí (target přežil)
            const originator = this.players[pr.originatorIdx];
            const initialTarget = this.players[pr.initialTargetIdx];
            if (originator) this.checkSuzyLafayette(originator);
            if (initialTarget) this.checkSuzyLafayette(initialTarget);
            this.phase = "PLAY";
            this._releaseMollyDeferred();   // Duel skončil → uvolni Mollyiny odložené náhrady
            this._processSpecialQueue();
        } else if (pr.sourceCard === CardType.GATLING || pr.sourceCard === CardType.INDIANS) {
            this._advanceMassAttack(playerIdx, pr.originatorIdx, pr.sourceCard);
            this._processSpecialQueue();
        } else {
            this.phase = "PLAY";
            // Fistful of Cards: běží-li série zásahů, pošli hned další (viz logic/fistful.js).
            if (!this._afterFistfulHit()) this._processSpecialQueue();
            this.targetPlayer = null;
            this.currentAttacker = null;
        }
    },

    // ── Molly Stark (Dodge City): mimo svůj tah lízne 1 za každou dobrovolně zahranou/
    // odhozenou kartu. Během Duelu se náhrady odloží až do konce Duelu. ────────────
    _mollyPlayedOutOfTurn(playerIdx, isDuel) {
        const p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Molly Stark") return;
        if (this.currentPlayerIndex === playerIdx) return;   // jen mimo její tah
        if (isDuel) {
            this._mollyDeferred = (this._mollyDeferred || 0) + 1;
            this._mollyDeferredIdx = playerIdx;
        } else {
            this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx, cardsNeeded: 1 });
        }
    },

    _releaseMollyDeferred() {
        if (this._mollyDeferred && this._mollyDeferredIdx != null) {
            for (let k = 0; k < this._mollyDeferred; k++) {
                this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: this._mollyDeferredIdx, cardsNeeded: 1 });
            }
        }
        this._mollyDeferred = 0;
        this._mollyDeferredIdx = null;
    },

    handleResponse(playerIdx, cardIdx, boardCardId = null) {
        if (this.phase !== "RESPOND") return;
        if (!this.pendingResponse || !this.pendingResponse.active || this.pendingResponse.targetIdx !== playerIdx) return;

        const player = this.players[playerIdx];
        let respondedWithCard = false;

        if (cardIdx === null && boardCardId == null) {
            // Rozehraná Vedle! (proti Slabovi to první ze dvou) se hráči NEVRACÍ – zahráním
            // se spotřebovala a zůstává v odhozu, i když druhé Vedle! nepřišlo. Hráč prostě
            // schytá zásah. Odměna za Úhyb (UHYB_DRAW ve frontě) proto platí dál: karta byla
            // zahraná. Vezme si ji ale jen ten, kdo zásah přežil (viz níž).
            if (this.pendingResponse.partialMisses?.length > 0) {
                this.pendingResponse.partialMisses = [];
                this.missesPlayed = 0;
            }
            if (this.pendingResponse.sourceCard === CardType.BANG ||
                this.pendingResponse.sourceCard === CardType.GATLING ||
                this.pendingResponse.sourceCard === CardType.INDIANS) {
                const orig = this.players[this.pendingResponse.originatorIdx];
                if (orig) {
                    orig.stats.bangsHit++;
                }
            }
            // Fistful – Odražená střela: hráč neuhnul → místo zásahu se zničí zasažená
            // karta na jeho stole (životy se nehýbou, takže se nic z toho, co na zásah
            // navazuje, nespouští – ani Bart Cassidy, ani El Gringo, ani smrt).
            if (this.pendingResponse.ricochet) {
                this._ricochetDestroy(this.pendingResponse.ricochet);
            } else {
                this.handleDamage(playerIdx, this.pendingResponse.originatorIdx);

                // Zásah hráče vyřadil → líznutí za Úhyb už nemá kdo vybrat (stejná podmínka
                // jako u Suzy v _pruneSuzyQueue). Duch (Město duchů) hraje s 0 životy, ale
                // ve hře je, takže si lízne.
                if (!isInPlay(this.players[playerIdx])) {
                    for (let i = this.specialActionQueue.length - 1; i >= 0; i--) {
                        const a = this.specialActionQueue[i];
                        if (a.type === 'UHYB_DRAW' && a.playerIdx === playerIdx) this.specialActionQueue.splice(i, 1);
                    }
                }

                if (this.winner) {
                    this.pendingResponse.active = false;
                    return;
                }
            }

            this.pendingResponse.responded.push(playerIdx);
            respondedWithCard = false;
        } else {
            // Karta obrany může přijít z ruky (cardIdx) NEBO ze stolu jako zelená
            // Vedle!-karta (boardCardId: Železný plát/Stetson/Sombrero/Bible).
            const fromBoard = boardCardId != null;
            const sourceArr = fromBoard ? player.board : player.hand;
            const sourceIdx = fromBoard ? player.board.findIndex(c => c.id === boardCardId) : cardIdx;
            const card = sourceArr[sourceIdx];
            if (!card) return;

            let isValid = false;
            if (fromBoard) {
                // Zelená Vedle!-karta se počítá jako Vedle! (jen proti požadavku „Vedle!").
                // Belle Star útočí → cizí karty na stole (i zelené) na jejím tahu neplatí.
                isValid = card.green && card.activate === 'miss' &&
                        this.pendingResponse.requiredCard === CardType.MISSED &&
                        !this._boardDead() &&   // Fistful – Laso: karty na stole nemají efekt
                        !this._belleIgnoresBoard(this.pendingResponse.originatorIdx);
            } else if (this.pendingResponse.requiredCard === CardType.MISSED) {
                // Co se počítá za Vedle! (Úhyb, Elena Fuente, Calamity Janet i Zúčtování
                // z Divokého západu) drží jediný predikát v core/playability.js – klient
                // i bot se ptají stejně, takže se výčet nemůže rozejít.
                isValid = playsAsMissed(this, player, card);
            } else if (this.pendingResponse.requiredCard === CardType.BANG) {
                isValid = playsAsBang(this, player, card);
                // High Noon – Kazatel: kartu Bang! nesmí hráč zahrát ani jako reakci
                // v duelu, když je zrovna ON na tahu (FAQ H2). Duel pak automaticky
                // prohrává, protože nemá čím odpovědět. Zákaz platí na KARTU Bang!,
                // takže pod Zúčtováním (Divoký západ) odpoví jinou kartou.
                if (isValid && preacherBlocks(this, player, playerIdx, card)) isValid = false;
            }

            // High Noon – Želízka: hráč na tahu smí i jako reakci zahrát jen kartu
            // zvolené barvy (stejný výklad jako u Kazatele, FAQ H2). Platí to ale jen na
            // karty Z RUKY – zelená Vedle!-karta už leží ve hře a barvou se neomezuje.
            if (isValid && !fromBoard && this._suitBlocked(playerIdx, card)) isValid = false;

            if (!isValid) return;

            const playedCard = sourceArr.splice(sourceIdx, 1)[0];
            respondedWithCard = true;

            // Úhyb (a zelené karty s draw): kromě uhnutí si majitel lízne kartu/y.
            // Konzistentně s Bartem/Suzy to NEděláme automaticky – zařadíme líznutí do
            // fronty (UHYB_DRAW) a hráč si pak klikne na balíček (viz _processSpecialQueue).
            if (playedCard.draw) {
                for (let k = 0; k < playedCard.draw; k++) {
                    this.specialActionQueue.push({ type: 'UHYB_DRAW', playerIdx });
                }
            }

            if (this.pendingResponse.requiredCard === CardType.MISSED && this.pendingResponse.sourceCard !== CardType.DUEL) {
                if (!this.pendingResponse.partialMisses) this.pendingResponse.partialMisses = [];
                this.pendingResponse.partialMisses.push({ card: playedCard, playerIdx });
                this.deck.discard(playedCard);
                this.missesPlayed = (this.missesPlayed || 0) + 1;
                this._mollyPlayedOutOfTurn(playerIdx, false);   // Molly: lízne za každé Vedle! mimo tah
                const required = this.missesRequired || 1;
                if (this.missesPlayed < required) {
                    // Suzy Lafayette: „jakmile nemá v ruce karty, hned si jednu lízne" –
                    // platí i UPROSTŘED obrany. Proti Slabovi (2× Vedle!) jí zahráním
                    // posledního Vedle! došly karty, takže si musí líznout hned; jinak by
                    // druhé Vedle! nemohla dolíznout a schytala by zásah bez schopnosti.
                    // Fáze se přes interruptedPhase vrátí zpátky do RESPOND.
                    if (this.checkSuzyLafayette(player)) this._processSpecialQueue();
                    return;
                }
                this.pendingResponse.partialMisses = [];
                this.missesPlayed = 0;
                this.missesRequired = 1;
                this.checkSuzyLafayette(player);
            } else {
                this.deck.discard(playedCard);
                if (this.pendingResponse.sourceCard !== CardType.DUEL) {
                    this.checkSuzyLafayette(player);
                }
                // Molly: Bang! v Duelu mimo její tah → náhrada odložena do konce Duelu.
                this._mollyPlayedOutOfTurn(playerIdx, this.pendingResponse.sourceCard === CardType.DUEL);
            }

            this.pendingResponse.responded.push(playerIdx);
        }

        if (this.pendingResponse.sourceCard === CardType.DUEL) {
            if (respondedWithCard) {
                if (playerIdx === this.pendingResponse.originatorIdx) {
                    this.pendingResponse.targetIdx = this.pendingResponse.initialTargetIdx;
                } else {
                    this.pendingResponse.targetIdx = this.pendingResponse.originatorIdx;
                }
                this.pendingResponse.responded = [];
            } else {
                const originator = this.players[this.pendingResponse.originatorIdx];
                const initialTarget = this.players[this.pendingResponse.initialTargetIdx];
                if (originator) this.checkSuzyLafayette(originator);
                if (initialTarget) this.checkSuzyLafayette(initialTarget);
                this.pendingResponse.active = false;
                this.phase = "PLAY";
                this._releaseMollyDeferred();   // Duel skončil → uvolni Mollyiny odložené náhrady
                this._processSpecialQueue();
            }
        }
        else if (this.pendingResponse.sourceCard === CardType.GATLING || this.pendingResponse.sourceCard === CardType.INDIANS) {
            this._advanceMassAttack(playerIdx, this.pendingResponse.originatorIdx, this.pendingResponse.sourceCard);
            this._processSpecialQueue();
        }
        else {
            this.pendingResponse.active = false;
            this.phase = "PLAY";
            // Fistful of Cards: běží-li série zásahů, pošli hned další (viz logic/fistful.js).
            if (!this._afterFistfulHit()) this._processSpecialQueue();
            this.targetPlayer = null;
            this.currentAttacker = null;
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResponseMixin;
} else {
    Object.assign(GameState.prototype, ResponseMixin);
}
})();
