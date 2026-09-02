// logic/play.js — mixin GameState: hraní karet (playCard router, Bang!, speciální
// karty, modré karty, barel-check, výběr cílové karty, hromadné útoky).
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {
const PlayMixin = {
    playCard(cardIndex) {
        if (this.phase !== "PLAY") return;
        const player = this.getCurrentPlayer();
        const card = player.hand[cardIndex];
        if (!card) return;

        // Karty „odhoď další kartu" (Springfield/Tequila/Whisky/Ragtime/Rvačka) se
        // NEhrají přes play_card – hráč nejdřív zvolí cíl (viz startDiscardExtra),
        // proto sem discardExtra karta nechodí; případný omyl je bezpečný no-op.
        if (card.discardExtra) return;

        // High Noon – Želízka: v tomhle tahu jen karty zvolené barvy.
        if (this._suitBlocked(this.currentPlayerIndex, card)) return;
        // Fistful – Právo západu: vynucená karta musí ven jako první (viz _lawLocked).
        if (this._lawLocked(this.currentPlayerIndex, card)) return;
        // Fistful – Soudce: nic se nesmí vyložit před hráče (výzbroj, modré, zelené).
        if (this._judgeBlocks(card)) return;

        this.logEvent('play', { who: player.name, card: card.name });

        // Zelené karty (Dodge City) se vykládají na stůl jako modré – aktivují se až
        // příští tah ze stolu (viz activateGreenCard). Nelze mít 2 stejného jména (D7).
        if (card.green) {
            const before = player.board.length;
            this.playBoardCard(player, cardIndex);
            if (player.board.length > before) this._trackCard(this.currentPlayerIndex, card.type);
            this.checkSuzyLafayette(player);
            this._processSpecialQueue();
            return;
        }

        const cardEffects = {
            [CardType.BEER]: () => {
                // High Noon – Reverend: po celé kolo nejde zahrát Pivo (Salón ano, FAQ H1).
                if (this._beerBlocked()) return false;
                // Jsou-li ve hře jen dva hráči, Pivo nemá žádný efekt. Doteď to server
                // hlídal jen u záchrany posledního života (beerLastLifeSave), takže v
                // koncovce 1v1 se z ruky pořád léčilo. Klient to nenabízel (cardPlayability),
                // ale pravidlo patří sem – Salón i ostatní léčení platí dál.
                // Duch (Město duchů) se počítá za hráče ve hře – s ním jsou u stolu tři.
                if (inPlayCount(this.players) <= 2) return false;
                // Tequila Joe (Dodge City): karta Pivo mu dá +2 (jiné léčení jen +1).
                // Přes _heal, který ohlídá i to, že mrtvého léčit nejde (duch při Městě
                // duchů ale ano) – jinak se Pivo vůbec nezahraje.
                const gain = hasAbility(player, "Tequila Joe") ? 2 : 1;
                return this._heal(player, gain) > 0;
            },
            [CardType.SALOON]: () => {
                // Léčí každého VE HŘE – při Městě duchů (High Noon) tedy i ducha, který si
                // zrovna odbývá svůj tah (isInPlay, ne health > 0).
                const anyDamaged = this.players.some(p => isInPlay(p) && p.health < p.maxHealth);
                if (!anyDamaged) return false;
                this.players.forEach(p => { this._heal(p, 1); });
                return true;
            },
            // Divoký západ (Wild West Show): jediný spouštěč nové události toho balíčku
            // je Dostavník / Wells Fargo, a odkrývá se PŘED lízáním – efekt karty se čte
            // nahlas hned a některé karty mění to, co hráč vzápětí uvidí a smí zahrát.
            // Krytý vůz (Dodge City) má vlastní CardType, takže se sem nedostane (FAQ Q16).
            [CardType.STAGECOACH]: () => {
                this._flipWwsEvent(this.currentPlayerIndex);
                this._setDrawPhase({ active: true, playerIdx: this.currentPlayerIndex, cardsNeeded: 2, cardsDrawn: 0, options: ['deck'], isStartOfTurn: false });
                this.phase = "DRAW";
                return true;
            },
            [CardType.WELLS_FARGO]: () => {
                this._flipWwsEvent(this.currentPlayerIndex);
                this._setDrawPhase({ active: true, playerIdx: this.currentPlayerIndex, cardsNeeded: 3, cardsDrawn: 0, options: ['deck'], isStartOfTurn: false });
                this.phase = "DRAW";
                return true;
            },
            [CardType.WEAPON]: () => {
                if (player.weapon.id !== -1) {
                    this.deck.discard(player.weapon);
                    player.stats.weaponsCycled++;
                }
                player.weapon = player.hand.splice(cardIndex, 1)[0];
                // Johnny Kisch (Fistful): stejnojmenné zbraně u ostatních jdou do odhozu.
                this._johnnyKischPurge(this.currentPlayerIndex, player.weapon.name, player.weapon);
                // Orazítkuj tah položení (stejně jako u zelených karet). Pravidla to
                // neomezuje – slouží botovi, aby si v jednom tahu nepřevykládal víc
                // zbraní za sebou a lepší si nechal „v zásobě" (core/botPolicy.js).
                player.weapon._playedTurn = this.turnId;
                return false;
            },
            [CardType.EQUIPMENT]: () => this.playBoardCard(player, cardIndex),
            [CardType.BARREL]: () => this.playBoardCard(player, cardIndex),
            [CardType.DYNAMITE]: () => this.playBoardCard(player, cardIndex),
            [CardType.INDIANS]: () => { this._massAttackSuit = this._effSuit(card); this._massAttackName = card.name; this._advanceMassAttack(this.currentPlayerIndex, this.currentPlayerIndex, CardType.INDIANS); return true; },
            [CardType.GATLING]: () => { this._massAttackSuit = this._effSuit(card); this._massAttackName = card.name; this._advanceMassAttack(this.currentPlayerIndex, this.currentPlayerIndex, CardType.GATLING); return true; },
            [CardType.STORE]: () => { this.openStore(); return true; }
        };

        const effect = cardEffects[card.type];
        if (effect) {
            const shouldDiscard = effect();
            if (shouldDiscard === false) {
                // Karta nebyla sehrána
            } else {
                this._trackCard(this.currentPlayerIndex, card.type);
                // Divoký západ – Lee Van Kliff: paměť poslední hnědé karty.
                this._markBrownPlayed(this.currentPlayerIndex, card);
            }
            if (shouldDiscard) {
                this.deck.discard(player.hand.splice(cardIndex, 1)[0]);
            }
            if (this.phase !== "STORE" && this.phase !== "DRAW") {
                this.checkSuzyLafayette(player);
            }
        }
        this._processSpecialQueue();
    },

    playBang(attackerIdx, targetIdx, cardIdx) {
        const attacker = this.players[attackerIdx];
        const target = this.players[targetIdx];
        const card = attacker?.hand[cardIdx];
        if (!attacker || !target || !card) return;
        // Cílem je každý VE HŘE – duch (Město duchů) v ní na svůj tah je, takže se na něj
        // střílet dá (jen umřít nemůže, viz handleDamage). Dostřel i klikatelnost cíle ho
        // pouštějí (computeCanHit/isInPlay), takže bez tohohle server Bang! tiše zahodil.
        if (!isInPlay(target)) return;
        if (this._suitBlocked(attackerIdx, card)) return;   // High Noon – Želízka
        // Fistful – Právo západu: vynucená karta musí ven jako první (viz _lawLocked).
        // `asBang` = tenhle výstřel čerpá limit karet Bang!, i když karta sama kartou
        // Bang! není (Zúčtování z Divokého západu) – jinak by šlo povinnost obejít tím,
        // že hráč limit vyplýtvá jinou kartou zahranou „jako Bang!".
        if (this._lawLocked(attackerIdx, card, { asBang: !card.bangEffect })) return;
        // Co se vůbec smí zahrát jako karta Bang! (Calamity Janet, Zúčtování z Divokého
        // západu) drží playsAsBang – tímtéž predikátem se ptá klient i bot. Karty
        // s bang-EFEKTEM (Úder, Springfield, Derringer, zelené) kartami Bang! nejsou,
        // míří se ale stejně, takže jdou mimo něj.
        if (!card.bangEffect && !playsAsBang(this, attacker, card)) return;

        // Karta s bang-efektem (Úder, …): NEpočítá se do limitu 1 Bang!/tah a Slabův
        // bonus (2× Vedle!) na ni neplatí. Jinak je to běžný útok (Barel, Vedle! funguje).
        const isEffect = !!card.bangEffect;
        const isWilly = hasAbility(attacker, "Willy the Kid");
        // Fistful – Laso: zbraň je karta na stole, takže Volcanic nedovolí Bang! bez limitu.
        const hasVolcanic = !this._boardDead() && attacker.weapon && attacker.weapon.name.includes("Volcanic");

        // High Noon – Kazatel: ve svém tahu nesmí hráč zahrát kartu Bang! (ani Willy,
        // ani s Volcanicem, ani Calamity Janet s kartou Vedle! – FAQ H5). Karty
        // s bang-efektem (Úder, Nůž…) to neomezuje, nejsou to karty Bang!; pod Zúčtováním
        // (Divoký západ) je naopak zakázaná i karta, která je Bang! jen „jako by"
        // (kartou Bang! je tam každá) – rozhoduje o tom preacherBlocks.
        if (!isEffect && preacherBlocks(this, attacker, attackerIdx, card)) return;

        if (!isEffect && !isWilly && !hasVolcanic && attacker.bangsPlayedThisTurn >= this._bangLimit()) {
            return;
        }

        if (!isEffect) attacker.bangsPlayedThisTurn++;
        attacker.stats.bangsFired++;
        this._trackCard(attackerIdx, card?.type || 'Bang!');
        // Divoký západ – Lee Van Kliff: paměť poslední hnědé karty (i karty, která je
        // kartou Bang! jen pod Zúčtováním / u Calamity Janet, a bang-efektu Úderu).
        this._markBrownPlayed(attackerIdx, card, { asBang: true });
        this.logEvent('bang', { who: attacker.name, target: target.name });
        this.deck.discard(attacker.hand.splice(cardIdx, 1)[0]);
        this.currentAttacker = attackerIdx;
        this.checkSuzyLafayette(attacker);

        // Apache Kid: kárový Bang!/bang-efekt na něj nemá efekt (Bang! se „zahrál" naprázdno).
        if (this._apacheImmune(targetIdx, this._effSuit(card), attackerIdx)) {
            this.phase = "PLAY";
            this._processSpecialQueue();
            return;
        }

        this._beginBangResolution(attackerIdx, targetIdx, isEffect, card.name);
        this._processSpecialQueue();
    },

    // Barel-check + fáze RESPOND pro Bang!/bang-efekt. Sdílí playBang i Springfield
    // (bang-efekt „any" po odhození další karty). isEffect = bez limitu/Slaba.
    // `sourceName` = SKUTEČNÁ karta, která útok spustila (Úder/Nůž/Derringer/Springfield…);
    // pravidla se dál řídí `sourceCard` (typ efektu), jméno je jen pro UI/log.
    // `ricochet` = { targetIdx, area, cardId } u Odražené střely (Fistful): vyhodnocení
    // je úplně stejné jako u Bang! (R3), jen ve chvíli „hráč neuhnul" se místo zásahu
    // zničí zasažená karta. Protahuje se proto celým řetězem až do pendingResponse.
    // `missesNeeded` = kolik karet Vedle! si útok žádá, když to neurčuje útočník
    // (Odstřelovač z Fistfulu = 2). null → spočítá se ze Slaba the Killer jako vždycky.
    // Protahuje se stejně jako `ricochet`, protože barelový check ho potřebuje na OBOU
    // stranách: při ♥ se za jednu kartu Vedle! počítá sám barel, jinak platí celé číslo.
    _beginBangResolution(attackerIdx, targetIdx, isEffect = false, sourceName = null, ricochet = null, missesNeeded = null) {
        const attacker = this.players[attackerIdx];
        const target = this.players[targetIdx];
        const needed = missesNeeded ||
            ((!isEffect && hasAbility(attacker, "Slab the Killer")) ? 2 : 1);

        let barrelChecksLeft = 0;
        let barrelReason = "BARREL";

        // Belle Star útočí (nebo je ve hře Laso) → Barel jako karta na stole neplatí;
        // Jourdonnaisova vrozená schopnost (ne karta) zůstává.
        const hasBarrelCard = !this._boardDead() && !this._belleIgnoresBoard(attackerIdx) &&
                              target.board.some(c => c.type === CardType.BARREL);

        if (hasAbility(target, "Jourdonnais") && hasBarrelCard) {
            barrelChecksLeft = 2;
            barrelReason = "JOURDONNAIS";
        } else if (hasAbility(target, "Jourdonnais")) {
            barrelChecksLeft = 1;
            barrelReason = "JOURDONNAIS";
        } else if (hasBarrelCard) {
            barrelChecksLeft = 1;
            barrelReason = "BARREL";
        }

        if (barrelChecksLeft > 0) {
            this.pendingBarrelCheck = {
                active: true,
                targetIdx,
                attackerIdx,
                checksLeft: barrelChecksLeft,
                reason: barrelReason,
                sourceCard: CardType.BANG,
                sourceCardName: sourceName || CardType.BANG,
                bangEffect: isEffect,
                ricochet,
                missesNeeded: needed
            };
            this.missesPlayed = 0;
            this.phase = "BARREL_DRAW";
        } else {
            this.pendingResponse = {
                active: true,
                originatorIdx: attackerIdx,
                targetIdx: targetIdx,
                requiredCard: CardType.MISSED,
                sourceCard: CardType.BANG,
                sourceCardName: sourceName || CardType.BANG,
                bangEffect: isEffect,
                ricochet,
                responded: []
            };
            this.phase = "RESPOND";
            this.missesRequired = needed;
            this.missesPlayed = 0;
            this.currentAttacker = attackerIdx;
        }
    },

    playSpecialCard(attIdx, tarIdx, cardIdx) {
        if (this.currentPlayerIndex !== attIdx) return;
        const attacker = this.players[attIdx];
        if (!attacker || !attacker.hand[cardIdx]) return;

        if (this._suitBlocked(attIdx, attacker.hand[cardIdx])) return;   // High Noon – Želízka
        // Fistful – Právo západu: vynucená karta musí ven jako první (viz _lawLocked).
        if (this._lawLocked(attIdx, attacker.hand[cardIdx])) return;
        // Fistful – Soudce: Vězení se vykládá před hráče (ostatní speciálky ne).
        if (this._judgeBlocks(attacker.hand[cardIdx])) return;

        const cardType = attacker.hand[cardIdx].type;

        if (cardType !== CardType.GATLING && cardType !== CardType.INDIANS) {
            if (tarIdx === null || !this.players[tarIdx]) return;
        }

        const target = tarIdx !== null ? this.players[tarIdx] : null;
        const card = attacker.hand.splice(cardIdx, 1)[0];

        if (card) this._trackCard(attIdx, card.type);
        // Divoký západ – Lee Van Kliff: paměť poslední hnědé karty (Vězení je modré,
        // takže se do ní nedostane).
        this._markBrownPlayed(attIdx, card);
        this.logEvent('special', { who: attacker.name, card: card.name, target: target ? target.name : null });

        if (card.type === CardType.JAIL) {
            const alreadyInJail = target.board.some(c => c.type === CardType.JAIL);
            if (target.role === "Sheriff" || alreadyInJail || !isInPlay(target)) {
                attacker.hand.splice(cardIdx, 0, card);
                this.checkSuzyLafayette(attacker);
                return;
            }
            // Apache Kid: kárové Vězení na něj nemá efekt (karta se odhodí naprázdno).
            if (this._apacheImmune(tarIdx, this._effSuit(card), attIdx)) {
                this.deck.discard(card);
                this.checkSuzyLafayette(attacker);
                this._processSpecialQueue();
                return;
            }
            target.board.push(card);
            // Johnny Kisch (Fistful): vyložením Vězení odhodí všechna ostatní Vězení ve hře.
            this._johnnyKischPurge(attIdx, card.name, card);
            this.checkSuzyLafayette(attacker);
            this._processSpecialQueue();
            return;
        }
        else if (card.type === CardType.CAT_BALOU || card.type === CardType.PANIC) {
            this.deck.discard(card);
            // Apache Kid: kárová Panika!/Cat Balou na něj nemá efekt (žádný výběr karty).
            if (this._apacheImmune(tarIdx, this._effSuit(card), attIdx)) {
                this.checkSuzyLafayette(attacker);
                this._processSpecialQueue();
                return;
            }
            this.phase = "SELECTING_TARGET_CARD";
            this.pendingSelection = {
                attackerIdx: attIdx,
                targetIdx: tarIdx,
                sourceCardType: card.type,
            };
            return;
        }
        else if (card.type === CardType.DUEL) {
            this.deck.discard(card);
            this.checkSuzyLafayette(attacker);
            // Apache Kid: kárový Duel (karta samotná ♦) na něj nemá efekt – odhodí se
            // naprázdno, žádná výměna Bang!. (Bang! zahrané JAKO reakce uvnitř duelu jsou
            // reakce, ne cílené karty, takže ty Apache zasáhnou bez ohledu na barvu.)
            if (this._apacheImmune(tarIdx, this._effSuit(card), attIdx)) {
                this._processSpecialQueue();
                return;
            }
            this.pendingResponse = {
                active: true,
                originatorIdx: attIdx,
                targetIdx: tarIdx,
                initialTargetIdx: tarIdx,
                requiredCard: CardType.BANG,
                sourceCard: CardType.DUEL,
                responded: []
            };
            this.phase = "RESPOND";
            this._processSpecialQueue();
            return;
        }
        else if (card.type === CardType.GATLING || card.type === CardType.INDIANS) {
            this.deck.discard(card);
            this.checkSuzyLafayette(attacker);
            this.missesRequired = 1;
            this.missesPlayed = 0;
            this._massAttackSuit = this._effSuit(card);   // Apache Kid: kárový hromadný útok ho míjí
            this._massAttackName = card.name;   // UI: skutečná karta (Houfnice ≠ Kulomet)
            this._advanceMassAttack(attIdx, attIdx, card.type);
            this._processSpecialQueue();
            return;
        }
        this._processSpecialQueue();
    },

    triggerBarrelDraw() {
        if (this.phase !== "BARREL_DRAW" || !this.pendingBarrelCheck?.active) return;
        const pbc = this.pendingBarrelCheck;
        this.pendingBarrelCheck = null;
        this.startBarrelCheck(pbc.targetIdx, pbc.attackerIdx, pbc.checksLeft, pbc.reason, pbc.sourceCard, pbc.bangEffect, pbc.sourceCardName, pbc.ricochet, pbc.missesNeeded, pbc.roulette);
    },

    // Vyloží kartu (modrou i zelenou) na stůl. Nelze mít 2 karty stejného jména (D7).
    // Zelené karty se navíc orazí kolem tahu položení (`_playedTurn`) – nelze je aktivovat
    // ve stejném tahu (viz activateGreenCard).
    playBoardCard(player, cardIndex) {
        const card = player.hand[cardIndex];
        if (player.board.some(c => c.name === card.name)) {
            return false;
        }
        if (card.green) card._playedTurn = this.turnId;
        const placed = player.hand.splice(cardIndex, 1)[0];
        player.board.push(placed);
        // Johnny Kisch (Fistful): stejnojmenné karty vyložené kdekoli u stolu se odhodí.
        this._johnnyKischPurge(this.players.indexOf(player), placed.name, placed);
        return false;
    },

    // `roulette` = sejmutí místo odhozu karty Vedle! v Ruské ruletě (Fistful, FAQ Q13).
    startBarrelCheck(targetIdx, attackerIdx, checksLeft, reason = "BARREL", sourceCard = null, bangEffect = false, sourceCardName = null, ricochet = null, missesNeeded = null, roulette = false) {
        const target = this.players[targetIdx];

        if (hasAbility(target, "Lucky Duke")) {
            const checkContext = { reason, playerIdx: targetIdx, attackerIdx, checksLeft, boardIdx: null, active: false, sourceCard, sourceCardName, bangEffect, ricochet, missesNeeded, roulette };
            this.startLuckyDukeCheck(checkContext);
            return;
        }

        const checkCard = this.deck.draw();
        this.deck.discard(checkCard);
        // Divoký západ – John Pain: ohlášený taker letí do cinematiky sejmutí (viz
        // _johnPainQueueCard) – odkrytá karta pak jde rovnou k němu, ne přes odhoz.
        const jpIdx = this._johnPainQueueCard(checkCard, targetIdx, { reveal: true });
        this.phase = "CHECKING";
        this.currentCheck = { active: true, reason, playerIdx: targetIdx, attackerIdx, card: checkCard, checksLeft, sourceCard, sourceCardName, bangEffect, ricochet, missesNeeded, roulette, johnPainIdx: jpIdx };
    },

    resolveCardSelection(attackerIdx, targetCardArea, targetCardIdx) {
        const sel = this.pendingSelection;
        if (!sel || sel.attackerIdx !== attackerIdx) return;

        // Ragtime/Rvačka (ignoreDistance) krade/odhazuje bez ohledu na vzdálenost.
        if (sel.sourceCardType === CardType.PANIC && sel.attackerIdx !== sel.targetIdx && !sel.ignoreDistance) {
            const dist = this.getDistance(sel.attackerIdx, sel.targetIdx);
            if (dist > 1) { return; }
        }
        // Ragtime (ignoreDistance) na VLASTNÍ stůl: z vlastní ruky se nekrade. Stejné
        // pravidlo jako ve startDiscardExtra, kde se cíl volí předem – tady se cílová
        // karta vybírá až po zahrání (Lee Van Kliff opakuje efekt, ne aktivaci).
        if (sel.ignoreDistance && sel.attackerIdx === sel.targetIdx && targetCardArea === 'hand') return;

        const attacker = this.players[sel.attackerIdx];
        const target = this.players[sel.targetIdx];

        // High Noon – Daltonové: hráč odhazuje MODROU kartu ze SVÉHO stolu. Z ruky se
        // nebere a zelené karty (Dodge City) modré nejsou. Neplatný klik radši ignoruj,
        // ať se výběr neposune na dalšího hráče, aniž by tenhle něco odhodil.
        if (sel.isDaltons) {
            if (targetCardArea === 'weapon') {
                if (!target.weapon || target.weapon.id === -1) return;
            } else if (targetCardArea !== 'board' || !target.board[targetCardIdx] ||
                       target.board[targetCardIdx].green) {
                return;
            }
        }

        let cardToMove = null;

        if (targetCardArea === 'hand') {
            const randomIndex = Math.floor(Math.random() * target.hand.length);
            cardToMove = target.hand.splice(randomIndex, 1)[0];
        }
        else if (targetCardArea === 'weapon') {
            cardToMove = target.weapon;
            target.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
        }
        else {
            cardToMove = target.board.splice(targetCardIdx, 1)[0];
        }

        if (cardToMove) {
            if (sel.sourceCardType === CardType.PANIC) {
                attacker.hand.push(cardToMove);
            } else {
                this.deck.discard(cardToMove);
            }
        }

        const srcType = sel.sourceCardType === 'Panika!' ? 'krade' : 'zahazuje';
        this.logEvent('special', { who: attacker.name, card: `${srcType} kartu`, target: target.name, area: targetCardArea, taken: cardToMove?.name });

        const wasBrawl = sel.isBrawl;
        const wasVultureSplit = sel.isVultureSplit;
        const wasDaltons = sel.isDaltons;
        // Dělení karet mezi Samy: klik do oblasti, kde už nic neleží, nic nepřesune –
        // výběr proto nech běžet dál (jinak by se dělení zacyklilo na kartách, které
        // nikdo nemůže vzít, protože tam nejsou).
        if (wasVultureSplit && !cardToMove) return;
        this.pendingSelection = null;
        this.checkSuzyLafayette(attacker);
        this.checkSuzyLafayette(target);
        if (wasVultureSplit) {
            // Dělení karet mrtvého mezi víc Vulture Samů: na řadu jde druhý Sam,
            // dokud karty nedojdou (viz logic/characters.js).
            this._advanceVultureSplit();
        } else if (wasBrawl) {
            // Rvačka: pokračuj dalším cílem ve frontě (každý ostatní odhodí 1 kartu).
            this._advanceBrawl();
        } else if (wasDaltons) {
            // High Noon – Daltonové: na řadu jde další hráč, po posledním se dokončí
            // start tahu (viz logic/highNoon.js).
            this._resumeDaltons();
        } else {
            this.phase = "PLAY";
            this._processSpecialQueue();
        }
    },

    _advanceMassAttack(currentPlayerIdx, originatorIdx, sourceCard) {
        let nextTarget = (currentPlayerIdx + 1) % this.players.length;
        let loopCount = 0;

        // Přeskoč hráče mimo hru (duch při Městě duchů zůstává cílem) i Apache Kida,
        // když je hromadný útok kárový (imunita vůči ♦).
        while (
            nextTarget !== originatorIdx &&
            (!isInPlay(this.players[nextTarget]) || this._apacheImmune(nextTarget, this._massAttackSuit, originatorIdx)) &&
            loopCount < this.players.length
        ) {
            nextTarget = (nextTarget + 1) % this.players.length;
            loopCount++;
        }

        if (nextTarget === originatorIdx || loopCount >= this.players.length) {
            this.pendingResponse.active = false;
            this.phase = "PLAY";
            this._processSpecialQueue();
            return;
        }

        const target = this.players[nextTarget];
        let barrelChecksLeft = 0;
        let barrelReason = "BARREL";

        if (sourceCard === CardType.GATLING) {
            // Belle Star útočí (originator) / Laso → Barel neplatí; Jourdonnaisova vrozená ano.
            const hasBarrelCard = !this._boardDead() && !this._belleIgnoresBoard(originatorIdx) &&
                                  target.board.some(c => c.type === CardType.BARREL);
            if (hasAbility(target, "Jourdonnais") && hasBarrelCard) {
                barrelChecksLeft = 2;
                barrelReason = "JOURDONNAIS";
            } else if (hasAbility(target, "Jourdonnais")) {
                barrelChecksLeft = 1;
                barrelReason = "JOURDONNAIS";
            } else if (hasBarrelCard) {
                barrelChecksLeft = 1;
                barrelReason = "BARREL";
            }
        }

        // UI: skutečně zahraná karta (Houfnice se chová jako Kulomet, ale jmenuje se jinak).
        const sourceName = this._massAttackName || sourceCard;

        if (barrelChecksLeft > 0) {
            this.pendingBarrelCheck = {
                active: true, targetIdx: nextTarget, attackerIdx: originatorIdx,
                checksLeft: barrelChecksLeft, reason: barrelReason, sourceCard: sourceCard,
                sourceCardName: sourceName
            };
            this.phase = "BARREL_DRAW";
        } else {
            this.pendingResponse = {
                active: true, originatorIdx: originatorIdx, targetIdx: nextTarget,
                requiredCard: sourceCard === CardType.GATLING ? CardType.MISSED : CardType.BANG,
                sourceCard: sourceCard, sourceCardName: sourceName, responded: []
            };
            // Hromadný útok (Kulomet/Indiáni): vždy jen 1 vedle/bang na cíl – Slabův
            // bonus (2 vedle) platí jen na obyčejný Bang, ne na Kulomet.
            this.missesRequired = 1;
            this.missesPlayed = 0;
            this.phase = "RESPOND";
        }
    },

    // `missesNeeded` = explicitní počet karet Vedle! (Odstřelovač 2, zbytek po úspěšném
    // barelu 1). null → spočítá se ze Slaba the Killer.
    waitForMissed(targetIdx, attackerIdx, sourceCard = CardType.BANG, bangEffect = false, sourceCardName = null, ricochet = null, missesNeeded = null) {
        const attacker = this.players[attackerIdx];
        this.pendingResponse = {
            active: true,
            originatorIdx: attackerIdx,
            targetIdx: targetIdx,
            requiredCard: CardType.MISSED,
            sourceCard: sourceCard,
            sourceCardName: sourceCardName || sourceCard,
            bangEffect: bangEffect,
            ricochet,
            responded: []
        };
        if (!this.missesPlayed || this.missesPlayed === 0) {
            // Bang-efekt: Slabův bonus (2× Vedle!) neplatí → vždy 1.
            this.missesRequired = missesNeeded ||
                ((!bangEffect && hasAbility(attacker, "Slab the Killer") && sourceCard !== CardType.GATLING) ? 2 : 1);
            this.missesPlayed = 0;
        }
        this.phase = "RESPOND";
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayMixin;
} else {
    Object.assign(GameState.prototype, PlayMixin);
}
})();
