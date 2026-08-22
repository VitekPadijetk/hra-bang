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

    // ── Uncle Will (A Fistful of Cards) ─────────────────────────────────────────
    // „Jednou za svůj tah smí zahrát libovolnou kartu z ruky jako Hokynářství."
    // Karta se odhodí a z balíčku se rozdá každému ve hře, přesně jako po zahrání
    // opravdového Hokynářství (openStore). Soudce (Fistful) to neomezuje – nic se
    // nevykládá před hráče; Želízka (High Noon) ano, karta jde z ruky.
    useUncleWill(playerIdx, cardIdx) {
        if (this.phase !== "PLAY" || playerIdx !== this.currentPlayerIndex) return false;
        const p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Uncle Will") return false;
        if (p._willUsedTurn === this.turnId) return false;
        const card = p.hand[cardIdx];
        if (!card) return false;
        if (this._suitBlocked(playerIdx, card)) return false;
        p._willUsedTurn = this.turnId;
        this.deck.discardPile.push(p.hand.splice(cardIdx, 1)[0]);
        this._trackCard(playerIdx, CardType.STORE);
        this.logEvent('special', { who: p.name, card: 'Uncle Will – hokynářství', taken: card.name });
        this.openStore();
        return true;
    },

    // ── Johnny Kisch (A Fistful of Cards) ───────────────────────────────────────
    // „Kdykoli vyloží kartu do hry, všechny ostatní vyložené karty se stejným jménem
    // se odhodí." Platí to u všech hráčů (i u něj samotného) a na výzbroj stejně jako
    // na modré/zelené karty. Volá se ze všech tří cest, kudy karta jde na stůl:
    // playBoardCard, větev WEAPON v playCard a Vězení v playSpecialCard (logic/play.js).
    //
    // `justPlayed` = právě položená karta, která se odhodit NESMÍ. Odhozený Dynamit
    // nevybuchne a odhozené Vězení hráče osvobodí – obojí je záměr (karta prostě
    // opouští hru). Animaci dohraje server podle `_johnnyPurgeAnim` (server/anim.js).
    _johnnyKischPurge(ownerIdx, cardName, justPlayed) {
        const owner = this.players[ownerIdx];
        if (!owner || effectiveCharacter(owner) !== "Johnny Kisch" || !cardName) return;
        const removed = [];
        this.players.forEach((p, i) => {
            if (p.weapon && p.weapon.id !== -1 && p.weapon.name === cardName && p.weapon !== justPlayed) {
                removed.push({ playerIdx: i, boardIdx: 0, cardId: p.weapon.id });
                this.deck.discardPile.push(p.weapon);
                p.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
            }
            for (let k = (p.board || []).length - 1; k >= 0; k--) {
                const c = p.board[k];
                if (c.name !== cardName || c === justPlayed) continue;
                // Vizuální slot: 0 = výzbroj, 1+k = k-tá karta na stole (stejná konvence
                // jako u Rvačky/Paniky – klient podle ní najde, odkud karta letí).
                removed.push({ playerIdx: i, boardIdx: 1 + k, cardId: c.id });
                p.board.splice(k, 1);
                this.deck.discardPile.push(c);
            }
        });
        if (!removed.length) return;
        this._johnnyPurgeAnim = (this._johnnyPurgeAnim || []).concat(removed);
        this.logEvent('special', { who: owner.name, card: 'Johnny Kisch', taken: cardName, count: removed.length });
    },

    // ── Claus "The Saint" (A Fistful of Cards) ──────────────────────────────────
    // Odkryté karty leží v řadě uprostřed stolu (viz startClausDraw v logic/draw.js)
    // a rozdělují se klikáním: nejdřív si Claus vezme `keep` karet pro sebe, pak dá po
    // jedné každému dalšímu hráči ve frontě (po směru od sebe).
    //
    // Kdo je zrovna na řadě, drží `clausState.toIdx` – přímo ve stavu, aby si to klient
    // (zvýrazněná postava příjemce) ani bot nemuseli dopočítávat. `null` = rozděleno.
    _clausAdvance() {
        const cs = this.clausState;
        if (!cs) return;
        cs.toIdx = cs.taken < cs.keep ? this.currentPlayerIndex
                 : (cs.queue.length ? cs.queue[0] : null);
    },

    // Klik na jednu z odkrytých karet: putuje tomu, kdo je právě na řadě (cs.toIdx).
    clausPick(revealIdx) {
        if (this.phase !== "CLAUS_GIVE" || !this.clausState) return false;
        const cs = this.clausState;
        const card = cs.revealed[revealIdx];
        if (!card || cs.picked.includes(revealIdx)) return false;
        const to = this.players[cs.toIdx];
        if (!to) return false;
        cs.picked.push(revealIdx);
        to.hand.push(card);
        if (cs.toIdx === this.currentPlayerIndex) {
            cs.taken++;
            // Fistful – Právo západu: vynucená je druhá karta, kterou si Claus NECHÁ
            // (rozdané se nepočítají – do jeho ruky nikdy nedošly).
            this._lawMark(to, card, cs.taken);
        } else {
            cs.queue.shift();
            this.logEvent('special', { who: this.getCurrentPlayer().name,
                                       card: 'Claus the Saint – dává kartu', target: to.name });
        }
        this._clausAdvance();
        if (cs.toIdx !== null) return true;
        // Rozděleno – fáze lízání končí klasickou cestou (fronta odložených akcí,
        // volba barvy pro Želízka).
        this.clausState = null;
        this._finishDraw();
        return true;
    },

    // ── Pravidlo „nejdřív doběhne efekt zahrané karty" ──────────────────────────
    // FAQ: „Musíte počkat na dokončení efektu naposledy zahrané karty, než budete moci
    // použít speciální schopnost své postavy nebo zahrát další kartu." U Suzy Lafayette
    // se proto prázdná ruka posuzuje AŽ POTOM: líznutí z Úhybu/Bible i ukradená karta
    // (Panika/Ragtime) jsou pořád součást té zahrané karty – po nich prázdnou ruku nemá
    // a schopnost se vůbec nespustí. Naopak schopnost platí DŘÍV než odměna za banditu
    // a než krádež El Gringa (ten jí tedy sebere právě líznutou kartu – přímo v pravidlech).

    // Vyhoď z fronty líznutí, které mezitím přestalo platit (karty už dostala / je mimo hru).
    _pruneSuzyQueue() {
        for (let i = this.specialActionQueue.length - 1; i >= 0; i--) {
            const a = this.specialActionQueue[i];
            if (a.type !== 'SUZY_DRAW') continue;
            const p = this.players[a.playerIdx];
            if (!p || p.health <= 0 || p.hand.length > 0) this.specialActionQueue.splice(i, 1);
        }
    },

    // Vrací `true`, když se z fronty něco rozeběhlo (nebo běží lízání) – tedy když hra
    // pokračuje sama a volající nemá sahat na fázi. `false` = fronta nic nespustila.
    _processSpecialQueue() {
        this._pruneSuzyQueue();
        if (this.specialActionQueue.length === 0) return false;

        // Neber další akci z fronty, když právě běží líznutí (běžné, Dostavník/Wells Fargo
        // i kill-reward). Jinak by se rozpracovaný drawPhaseState přepsal a hra uvázla ve
        // fázi DRAW s active=false (typicky 2 kill-rewardy z jedné smrti u hromadného útoku:
        // Herb Hunter + odměna za banditu). Po dokončení líznutí frontu dobere _resumeAfterSpecial
        // / _finishDraw (ty aktivní draw nastaví na false PŘED voláním, takže tenhle guard pustí).
        if (this.phase === "DRAW" && this.drawPhaseState?.active) return true;

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
        } else if (action.type === 'VULTURE_SPLIT') {
            this._nextVultureSplitPick();
        } else if (action.type === 'KILL_REWARD') {
            this.drawPhaseState = {
                active: true, playerIdx: action.playerIdx,
                cardsNeeded: action.cardsNeeded, cardsDrawn: 0,
                options: ['deck'], isStartOfTurn: false,
                isKillReward: true
            };
            this.phase = "DRAW";
        }
        return true;
    },

    _resumeAfterSpecial() {
        // Řídí se tím, jestli se z fronty něco rozeběhlo – ne její délkou: _pruneSuzyQueue
        // z ní může všechno vyházet (Suzy si mezitím kartu vzala z Úhybu) a hra by pak
        // zůstala viset ve fázi právě dokončené schopnosti (UHYB_DRAW) bez obnovení fáze.
        if (this._processSpecialQueue()) {
            return;
        } else if (this._nextTurnAfterQueue) {
            // Fronta po smrti na dynamit (Herb Hunter apod.) je dobraná → teprve teď posuň tah.
            this._nextTurnAfterQueue = false;
            this.interruptedPhase = null;
            if (!this.winner) this.nextTurn();
        } else if (this._resumeBeginTurnAfterQueue) {
            // High Noon – ztráta života od Pravého poledne mohla do fronty přidat líznutí
            // (Bart Cassidy). Až doběhne, dokonči start tahu (kontroly Dynamit/Vězení).
            this._resumeBeginTurnAfterQueue = false;
            this.interruptedPhase = null;
            if (!this.winner) this._resumeBeginTurn();
        } else if (this._startChecksAfterQueue) {
            // Výbuch dynamitu: Bartova líznutí za ztracené životy jsou dobraná → teprve
            // teď kontrola Vězení a fáze lízání (viz takeDynamiteHit).
            this._startChecksAfterQueue = false;
            this.interruptedPhase = null;
            if (!this.winner) this.handleStartOfTurnChecks();
        } else {
            this.phase = this.interruptedPhase || "PLAY";
            this.interruptedPhase = null;
        }
    },

    // ── Dělení karet mezi víc Vulture Samů ──────────────────────────────────────
    // Nastane, když má schopnost Vulture Sama zároveň víc hráčů (Vulture Sam + Vera
    // Custer, která ho kopíruje). Pravidlo: karty mrtvého si rozdělí – první si bere
    // ten, kdo je za mrtvým první po směru hodinových ručiček, pak druhý, a tak dál,
    // dokud karty nedojdou. Každý výběr je „stylem Panika": z ruky náhodná karta,
    // ze stolu konkrétní. Technicky se recykluje pendingSelection / SELECTING_TARGET_CARD,
    // takže klik klienta, bot i guard fungují beze změny (viz resolveCardSelection).

    // Kolik karet mrtvému ještě zbývá k rozebrání.
    _vultureSplitLeft() {
        const vs = this.pendingVultureSplit;
        const d = vs ? this.players[vs.deadIdx] : null;
        if (!d) return 0;
        return d.hand.length + d.board.length + ((d.weapon && d.weapon.id !== -1) ? 1 : 0);
    },

    // Připraví výběr pro Sama, který je na řadě. Když už není co brát (nebo nezbyl
    // žádný živý Sam), dělení skončí.
    _nextVultureSplitPick() {
        const vs = this.pendingVultureSplit;
        if (!vs) { this._resumeAfterSpecial(); return; }
        if (this._vultureSplitLeft() <= 0) { this._finishVultureSplit(); return; }
        let tries = 0;
        while (tries < vs.pickers.length && !(this.players[vs.pickers[vs.next]]?.health > 0)) {
            vs.next = (vs.next + 1) % vs.pickers.length;
            tries++;
        }
        if (tries >= vs.pickers.length) { this._finishVultureSplit(); return; }
        this.pendingSelection = {
            attackerIdx: vs.pickers[vs.next],
            targetIdx: vs.deadIdx,
            sourceCardType: CardType.PANIC,
            ignoreDistance: true,
            isVultureSplit: true
        };
        this.phase = "SELECTING_TARGET_CARD";
    },

    // Po každém vzetí karty: na řadu jde další Sam (nebo dělení skončí).
    _advanceVultureSplit() {
        const vs = this.pendingVultureSplit;
        if (!vs) { this._resumeAfterSpecial(); return; }
        vs.next = (vs.next + 1) % vs.pickers.length;
        this._nextVultureSplitPick();
    },

    // Konec dělení: cokoli by u mrtvého zbylo (nemělo by nic) padá do odhozu, jeho
    // místo se uklidí jako u běžné smrti a hra pokračuje frontou (odměna za banditu…).
    // _pendingDeathReveal říká serveru, že teď má dohrát cinematiku vyřazení (odhalení role).
    _finishVultureSplit() {
        const vs = this.pendingVultureSplit;
        this.pendingVultureSplit = null;
        this.pendingSelection = null;
        if (vs) {
            const d = this.players[vs.deadIdx];
            if (d) {
                const w = (d.weapon && d.weapon.id !== -1) ? [d.weapon] : [];
                this.deck.discardPile.push(...d.hand, ...d.board, ...w);
                d.hand = [];
                d.board = [];
                d.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
            }
            // High Noon – Město duchů: duch při odchodu ze hry roli neodhaluje (zná ji
            // celý stůl už od jeho vyřazení), takže se dohrávka cinematiky nespouští.
            if (!vs.isGhost) this._pendingDeathReveal = vs.deadIdx;
        }
        // Obnov fázi PŘED resume: `_processSpecialQueue` si při vytažení další odložené
        // akce (typicky odměny za banditu) uloží AKTUÁLNÍ fázi jako `interruptedPhase` a
        // po dobrání se do ní vrátí. Bez tohohle by si zapamatoval přechodné
        // "SELECTING_TARGET_CARD" – jenže `pendingSelection` je už null, takže by hra
        // po líznutí 3 karet uvázla ve fázi, kde na nikoho nečeká (nešlo by hrát dál).
        this.phase = this.interruptedPhase || "PLAY";
        this._resumeAfterSpecial();
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
        // Mrtvý se neléčí – jinak by se dvěma kartami „obživl". Duch (Město duchů) ve hře
        // je, takže se léčit smí (na konci svého tahu o to stejně přijde).
        if (!isInPlay(p) || p.health >= p.maxHealth) return;
        if (!p.hand[cardIdx]) return;

        const card = p.hand.splice(cardIdx, 1)[0];
        this.deck.discardPile.push(card);
        this.checkSuzyLafayette(p);

        if (!this.sidKetchumPending) {
            this.sidKetchumPending = { playerIdx };
        } else if (this.sidKetchumPending.playerIdx === playerIdx) {
            this._heal(p, 1);
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
        // Pořadí v odhozu kopíruje animaci: NEvybraná odletí hned, vybraná až po
        // klasickém sejmutí uprostřed obrazovky – leží tedy navrchu (viz
        // playLuckyDukeResult v game.js, kde se z vrchu odhozu i pozná).
        this.deck.discardPile.push(other);
        this.deck.discardPile.push(chosen);
        this.currentCheck = { ...ld.checkContext, card: chosen, active: false };
        this.luckyDukeState = null;
        this.phase = "CHECKING";
        this._applyCheckResult(this.currentCheck);
    },

    useSidKetchum(playerIdx, cardIndices) {
        let p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Sid Ketchum") return;
        if (!isInPlay(p) || p.health >= p.maxHealth) return;   // duch (Město duchů) se léčit smí
        if (cardIndices.length !== 2) return;
        cardIndices.sort((a, b) => b - a);
        if (new Set(cardIndices).size !== 2) return;
        this.deck.discardPile.push(p.hand.splice(cardIndices[0], 1)[0]);
        this.deck.discardPile.push(p.hand.splice(cardIndices[1], 1)[0]);
        this._heal(p, 1);
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
        // Modrá = i Vězení (viz isBlueCard v core/cardRules.js) – to, že se vykládá před
        // soupeře, z něj modrou kartu dělat nepřestává.
        if (!isBlueCard(p.hand[cardIdx])) return false;
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
        // Fistful – Laso: zbraň na stole nemá efekt → dostřel 1 jako s Coltem.
        const reach = this._boardDead() ? 1 : (p.weapon?.range || p.weapon?.props?.range || 1);
        if (this.getDistance(playerIdx, targetIdx) > reach) return false;

        // Apache Kid: Docovy odhozené karty jsou „zahrané jiným hráčem" → jsou-li OBĚ kárové,
        // je vůči nim imunní (bang bez efektu). Suity zjistíme před odhozením.
        const bothDiamonds = this._effSuit(p.hand[cardIndices[0]]) === Suits.DIAMONDS &&
                             this._effSuit(p.hand[cardIndices[1]]) === Suits.DIAMONDS;

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
    // Volí si žijící postavu, jejíž schopnost převezme (effectiveCharacter pak vrací kopii).
    // Volba padne TĚSNĚ PŘED fází lízání (po checku na Dynamit/Vězení – viz startDrawPhase)
    // a kopie platí přesně jedno kolo: do stejného bodu jejího příštího tahu. Nekopíruje
    // sama sebe (jen jedna Vera).
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
        // Zpátky do fáze lízání – tentokrát už s převzatou schopností (Kit Carlson,
        // Jesse Jones, Pixie Pete…); guard `_veraCopiedTurn === turnId` znovu neptá.
        this.startDrawPhase();
        return true;
    },

    // Kopie vyprší přesně v bodě, kde by si Vera volila novou (těsně před fází lízání).
    // Když se tam hra nedostane (Vězení jí sebralo tah), zůstane pro tohle kolo bez kopie.
    _veraExpireCopy(playerIdx) {
        const p = this.players[playerIdx];
        if (!p || p.character !== "Vera Custer") return;
        p._copiedCharacter = null;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CharactersMixin;
} else {
    Object.assign(GameState.prototype, CharactersMixin);
}
})();
