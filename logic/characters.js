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

    // ── Pravidlo „nejdřív doběhne efekt zahrané karty" ──────────────────────────
    // FAQ: „Musíte počkat na dokončení efektu naposledy zahrané karty, než budete moci
    // použít speciální schopnost své postavy nebo zahrát další kartu." U Suzy Lafayette
    // se proto prázdná ruka posuzuje AŽ POTOM: líznutí z Úhybu/Bible, ukradená karta
    // (Panika/Ragtime) i odměna za banditu jsou pořád součást té zahrané karty – po nich
    // už prázdnou ruku nemá a schopnost se vůbec nespustí.

    // Vyhoď z fronty líznutí, které mezitím přestalo platit (karty už dostala / je mimo hru).
    _pruneSuzyQueue() {
        for (let i = this.specialActionQueue.length - 1; i >= 0; i--) {
            const a = this.specialActionQueue[i];
            if (a.type !== 'SUZY_DRAW') continue;
            const p = this.players[a.playerIdx];
            if (!p || p.health <= 0 || p.hand.length > 0) this.specialActionQueue.splice(i, 1);
        }
    },

    // Běží ještě efekt karty, kterou Suzy zahrála? (čeká se na cizí reakci nebo cizí barel)
    // Dokud běží, líznutí zůstane ve frontě – každá cesta z RESPOND/barelu končí voláním
    // _processSpecialQueue, takže se k němu hra sama vrátí. Když je cílem ona sama (obrana
    // proti Slabovi), schopnost platí hned: efekt JEJÍ karty (Vedle!) už doběhl.
    _suzyEffectRunning(playerIdx) {
        const pr = this.pendingResponse;
        if (pr?.active && pr.targetIdx !== playerIdx) return true;
        const pbc = this.pendingBarrelCheck;
        if (pbc?.active && pbc.targetIdx !== playerIdx) return true;
        return false;
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

        // Suzy Lafayette: dokud efekt její karty běží, líznutí počká ve frontě. A když jí
        // ten efekt ještě dluží karty (odměna za banditu, Úhyb), pustíme je před ní – po
        // nich už prázdnou ruku mít nebude a _pruneSuzyQueue líznutí zahodí.
        if (this.specialActionQueue[0].type === 'SUZY_DRAW') {
            const suzyIdx = this.specialActionQueue[0].playerIdx;
            if (this._suzyEffectRunning(suzyIdx)) return false;
            if (this.specialActionQueue.some((a, i) => i > 0 && a.playerIdx === suzyIdx &&
                    (a.type === 'KILL_REWARD' || a.type === 'UHYB_DRAW'))) {
                this.specialActionQueue.push(this.specialActionQueue.shift());
            }
        }

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
        // Ve frontě může zbýt jen odložené Suzyino líznutí (čeká na dokončení efektu) –
        // pak se pokračuje, jako by byla prázdná. Jinak by hra zůstala viset ve fázi právě
        // dokončené schopnosti (např. EL_GRINGO_STEAL uprostřed hromadného útoku).
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
        // Mrtvý (i duch při Městě duchů) se neléčí – jinak by se dvěma kartami „obživl".
        if (p.health <= 0 || p.health >= p.maxHealth) return;
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
        if (p.health <= 0 || p.health >= p.maxHealth) return;   // duch (Město duchů) se neléčí
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
