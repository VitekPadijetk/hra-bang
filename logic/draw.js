// logic/draw.js — mixin GameState: fáze lízání (běžná + Kit Carlson + Black Jack).
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {

// Kit Carlson odkrývá vždy tolik karet – nezávisle na tom, kolik si jich nechá
// (Žízeň 1, jinak 2). Zrcadlí to i klient (panel + pohled ostatních).
const KIT_REVEAL = 3;

const DrawMixin = {
    startDrawPhase() {
        const player = this.getCurrentPlayer();
        player.bangsPlayedThisTurn = 0;
        player._joseUses = 0;      // Dodge City: José Delgado max 2×/tah
        player._docUsed = false;   // Dodge City: Doc Holyday 1×/tah

        // Vera Custer (Dodge City): postavu ke kopírování si volí TĚSNĚ PŘED fází lízání,
        // tedy AŽ PO kontrolních líznutích na Dynamit/Vězení. Kopie z minulého tahu tady
        // vyprší (drží přesně jedno kolo – od tohoto bodu do stejného bodu příštího tahu),
        // proto se `_copiedCharacter` nuluje ještě před volbou. Volba 1×/tah: po ní se sem
        // vrátíme s `_veraCopiedTurn === turnId` a lízání se rozjede s převzatou schopností.
        if (player.character === "Vera Custer" && player._veraCopiedTurn !== this.turnId) {
            player._copiedCharacter = null;
            const choices = player._noAbility ? [] : this._veraCopyChoices();
            if (choices.length > 0) {
                this.pendingVeraCopy = { playerIdx: this.currentPlayerIndex, choices };
                this.phase = "VERA_COPY";
                return;
            }
            // Nikdo ke kopírování → bez kopie. Totéž při Kocovině (High Noon): schopnosti
            // neplatí, takže Vera novou postavu nekopíruje a stará kopie tady vypršela (FAQ X6).
            player._veraCopiedTurn = this.turnId;
        }

        // A Fistful of Cards – Peyote: nahrazuje celou fázi lízání a přebíjí i postavy,
        // které si ji upravují (R8). Až ZA volbou Very Custer – kopírovanou postavu si
        // volí na tenhle tah, i když se v něm nakonec nelíže z balíčku.
        if (this.startPeyote()) return;

        if (effectiveCharacter(player) === "Kit Carlson") {
            this.startKitCarlsonDraw();
            return;
        }

        if (effectiveCharacter(player) === "Claus the Saint") {
            this.startClausDraw();
            return;
        }

        const cardsNeeded = this._drawCountFor(player);

        this.drawPhaseState = { active: true, playerIdx: this.currentPlayerIndex, cardsNeeded, cardsDrawn: 0, options: this._getDrawOptions(player), isStartOfTurn: true };
        this.phase = "DRAW";
    },

    // Kolik karet si hráč líže ve fázi 1. JEDINÉ místo, které o tom rozhoduje – čte ho
    // i Kit Carlson (kolik odkryje a nechá si) a Black Jack (základ pro bonus za červenou).
    //   Dodge City: Pixie Pete 3, Bill Noface 1 + 1 za každé zranění
    //   High Noon:  Město duchů 3 (základ), Žízeň −1, Příjezd vlaku +1
    // FAQ X3: duch Pixie Pete líže 4 (3+1), duch Bill Noface 5 (vlastní vzorec s 0 životy).
    _drawCountFor(player) {
        let n = player._ghost ? 3 : 2;
        if (effectiveCharacter(player) === "Pixie Pete") n += 1;
        else if (effectiveCharacter(player) === "Bill Noface") n = 1 + (player.maxHealth - player.health);
        if (this.hasEvent('ZIZEN')) n -= 1;
        if (this.hasEvent('PRIJEZD_VLAKU')) n += 1;
        return Math.max(1, n);
    },

    // A Fistful of Cards – Pálenka: hráč smí vynechat celou fázi lízání a získat za to
    // 1 život. Volba se nabízí u KAŽDÉHO lízání na začátku tahu, tedy i u postav s vlastní
    // fází (Kit Carlson, Claus) – rozhodují se dřív, než se cokoli odkryje. `options` je
    // jediný zdroj pravdy: Jesse/Pedro si je po první kartě sami ořežou na ['deck'],
    // klient podle nich kreslí tlačítko a bot se ptá úplně stejně.
    // S PLNÝMI ŽIVOTY se nenabízí vůbec: hráč by se vzdal celé fáze lízání za nic
    // (léčit se není kam) – tlačítko by šlo zmáčknout jen omylem.
    _drawOptionsBase(player) {
        const canHeal = !!player && isInPlay(player) && player.health < player.maxHealth;
        return (this.hasEvent('PALENKA') && canHeal) ? ['deck', 'liquor'] : ['deck'];
    },

    _getDrawOptions(player) {
        const opts = this._drawOptionsBase(player);
        if (effectiveCharacter(player) === "Jesse Jones") opts.push('opponent_hand');
        // Opuštěný důl (Fistful): odhoz JE dobírací balíček, takže by Pedro bral tutéž
        // kartu jako „z balíčku" – volba nic nepřidává a jen by obešla trychtýř draw()
        // (a s ním vypnutí dolu, až odhoz dojde).
        if (effectiveCharacter(player) === "Pedro Ramirez" && !this.deck.mineMode) opts.push('discard');
        // Dodge City: Pat Brennan smí místo lízání vzít 1 kartu ze stolu libovolného hráče.
        if (effectiveCharacter(player) === "Pat Brennan") opts.push('board');
        return opts;
    },

    drawCard(source, sourceIdx = null, area = null, cardIdx = null) {
        if (this.phase !== "DRAW" || !this.drawPhaseState.active) return;

        const ds = this.drawPhaseState;
        const player = this.players[ds.playerIdx];

        // A Fistful of Cards – Pálenka: místo celé fáze lízání si hráč vezme 1 život.
        // Rozhoduje se místo PRVNÍ karty (později už ne) a fáze tím končí klasickou cestou
        // (_finishDraw → fronta odložených akcí, volba barvy pro Želízka). Léčit se smí i duch
        // (Město duchů) – hlídá to _heal přes isInPlay.
        if (source === 'liquor') {
            if (!(ds.options || []).includes('liquor') || ds.cardsDrawn > 0) return;
            // `options` je snímek z okamžiku, kdy fáze začala – ověř i teď, že je pořád
            // co léčit (jinak by hráč zahodil celou fázi lízání za nulu).
            if (!this._drawOptionsBase(player).includes('liquor')) return;
            const healed = this._heal(player, 1);
            this.logEvent('event', { card: 'Pálenka', who: player.name, msg: `vynechal lízání (+${healed} život)` });
            this._finishDraw();
            return;
        }

        // Dodge City: Pat Brennan – místo lízání vezmi 1 kartu ze stolu (výzbroj/modrá/zelená)
        // libovolného hráče do ruky; tím jeho fáze lízání končí (bere jen tuto jednu kartu).
        if (source === 'board' && effectiveCharacter(player) === "Pat Brennan" && ds.cardsDrawn === 0) {
            const target = this.players[sourceIdx];
            if (!target || target.health <= 0) return;
            let card = null;
            if (area === 'weapon') {
                if (target.weapon && target.weapon.id !== -1) {
                    card = target.weapon;
                    target.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
                }
            } else if (area === 'board') {
                if (target.board && target.board[cardIdx]) card = target.board.splice(cardIdx, 1)[0];
            }
            if (!card) return;
            if (card.green) delete card._playedTurn;   // v ruce už není „položená tento tah"
            player.hand.push(card);
            this.logEvent('draw', { who: player.name, source: 'board', cards: [card.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            this._finishDraw();
            return;
        }

        if (source === 'opponent_hand' && effectiveCharacter(player) === "Jesse Jones" && ds.cardsDrawn === 0) {
            const opponent = this.players[sourceIdx];
            if (!opponent || opponent.health <= 0 || opponent.hand.length === 0) return;
            const randomIdx = Math.floor(Math.random() * opponent.hand.length);
            const stolen = opponent.hand.splice(randomIdx, 1)[0];
            player.hand.push(stolen);
            this.logEvent('draw', { who: player.name, source: 'opponent_hand', cards: [stolen.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            ds.options = ['deck'];
            // Okradený mohl přijít o poslední kartu → Suzy Lafayette si líže HNED, ještě
            // než si Jesse vezme druhou kartu z balíčku (pořadí: Jesse 1. karta z ruky →
            // Suzy → Jesse 2. karta). Běžnou frontu tady nejde použít: _processSpecialQueue
            // během aktivního lízání záměrně nic nepouští (jinak by kill-reward přepsal
            // drawPhaseState), tak si SUZY_DRAW z fronty vyzvedneme sami. drawPhaseState
            // zůstává aktivní a interruptedPhase="DRAW" vrátí Jesseho po Suzyině líznutí
            // přesně sem (viz _resumeAfterSpecial).
            if (this.checkSuzyLafayette(opponent) && ds.cardsDrawn < ds.cardsNeeded) {
                const qi = this.specialActionQueue.findIndex(a => a.type === 'SUZY_DRAW' && a.playerIdx === sourceIdx);
                if (qi !== -1) {
                    this.specialActionQueue.splice(qi, 1);
                    this.interruptedPhase = "DRAW";
                    this.pendingSuzyDraw = { playerIdx: sourceIdx };
                    this.phase = "SUZY_DRAW";
                    return;
                }
            }
        }
        else if (source === 'discard' && effectiveCharacter(player) === "Pedro Ramirez" && ds.cardsDrawn === 0) {
            if (this.deck.discardPile.length === 0) return;
            const card = this.deck.discardPile.pop();
            player.hand.push(card);
            this.logEvent('draw', { who: player.name, source: 'discard', cards: [card.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            ds.options = ['deck'];
        }
        else if (source === 'deck') {
            // Kolik karet měl balíček PŘED líznutím – potřebují to odkryté řady
            // (Kit Carlson / Claus), viz _revealAnim.
            const deckBefore = this.deck._drawPile.length;
            const card = this.deck.draw();
            if (!card) return;

            this.drawPhaseState.options = ['deck'];

            if (effectiveCharacter(player) === "Kit Carlson" && ds.isKitCarlson) {
                // Odkrývá VŽDY 3 karty (to je jeho schopnost) – mění se jen kolik si z nich
                // nechá: běžně 2, se Žízní 1. Příjezd vlaku počet odkrytých nezvyšuje: nechá
                // si 2 a kartu navíc si pak lízne klasicky z balíčku (ds.kitExtra, viz
                // kitCarlsonPick).
                const rest = [];
                for (let i = 0; i < KIT_REVEAL - 1; i++) rest.push(this.deck.draw());
                const revealed = [card, ...rest].filter(Boolean);
                this.kitCarlsonState = {
                    revealed,
                    picked: [],
                    pendingAdd: [],
                    // Nikdy si nesmí nechat víc, než kolik karet se povedlo odkrýt
                    // (došlý balíček) – jinak by výběr nešel dokončit.
                    needed: Math.min(ds.kitNeeded || 2, revealed.length),
                    extra: ds.kitExtra || 0,
                    // Rozdání řady (a případné míchání uprostřed) si řídí klient – viz _revealAnim.
                    anim: this._revealAnim(deckBefore, revealed.length),
                };
                this.drawPhaseState.active = false;
                this.phase = "KIT_CARLSON";
                return;
            }

            // Claus "The Saint": celá fáze se odkryje NAJEDNOU (jedním klikem na balíček)
            // do řady uprostřed stolu – přesně jako u Kita Carlsona, jen karet může být až
            // devět a vidí je jen on (ostatním leží rubem, viz redactState). Rozdělí je pak
            // klikáním: nejdřív si vezme svoje, pak po jedné ostatním (fáze CLAUS_GIVE).
            if (ds.isClaus && effectiveCharacter(player) === "Claus the Saint") {
                const order = (ds.clausOrder || []).filter(i => isInPlay(this.players[i]));
                const total = (ds.clausKeep || 2) + order.length;
                const revealed = [card];
                for (let i = 1; i < total; i++) {
                    const c = this.deck.draw();
                    if (c) revealed.push(c);
                }
                // Došlý balíček: co si nechává má přednost, teprve zbytek se rozdává –
                // jinak by na poslední hráče ve frontě nezbylo a výběr by nešel dokončit.
                const keep = Math.min(ds.clausKeep || 2, revealed.length);
                const queue = order.slice(0, Math.max(0, revealed.length - keep));
                ds.cardsDrawn = 1;
                player.stats.cardsDrawn += keep;
                this.logEvent('draw', { who: player.name, source: 'deck (Claus)', cards: revealed.map(c => c.name) });
                this.drawPhaseState.active = false;
                // Rozdání řady (a případné míchání uprostřed) si řídí klient – viz _revealAnim.
                this.clausState = { revealed, picked: [], keep, taken: 0, queue,
                                    toIdx: this.currentPlayerIndex,
                                    anim: this._revealAnim(deckBefore, revealed.length) };
                this.phase = "CLAUS_GIVE";
                return;
            }

            if (effectiveCharacter(player) === "Black Jack" && ds.cardsDrawn === 1 && ds.isStartOfTurn && !ds.blackJackWaitingForThird) {
                ds.blackJackCard = card;
                this.phase = "BLACK_JACK_CHECK";
                return;
            }

            player.hand.push(card);
            this.logEvent('draw', { who: player.name, source: 'deck', cards: [card.name] });
            player.stats.cardsDrawn++;
            ds.cardsDrawn++;
            // Fistful – Právo západu: druhá karta fáze lízání je odkrytá a musí se zahrát.
            if (ds.isStartOfTurn) this._lawMark(player, card, ds.cardsDrawn);

            // Bonusová karta za červenou je doražená – dál rozhoduje běžné počítadlo
            // (s Příjezdem vlaku je základ 3, takže po bonusu ještě jedna zbývá).
            if (ds.blackJackWaitingForThird) ds.blackJackWaitingForThird = false;
        }
        else { return; }

        if (ds.cardsDrawn >= ds.cardsNeeded) {
            this._finishDraw();
        }
    },

    // Odkrytá řada (Kit Carlson / Claus) se rozdává stejnou cestou jako hokynářství:
    // karty letí z balíčku po jedné a když během odkrývání DOJDE, odkryje se nejdřív to,
    // co v balíčku bylo, pak se zamíchá (hra čeká) a teprve pak dorazí zbytek.
    // `deckBefore` = velikost balíčku před první odkrytou kartou, `dealt` = kolik se jich
    // nakonec podařilo odkrýt (míň jen tehdy, když došel i odhoz).
    //   'none'      – karet byl dostatek, nemíchá se,
    //   'proactive' – balíček se vyprázdnil poslední odkrytou kartou → míchá se až po
    //                 rozdání, paralelně s výběrem,
    //   'blocking'  – došel dřív → rozdá se `dealtBefore`, zamíchá se, dorozdá se zbytek.
    // Míchání si přebírá klientská cinematika, takže se legacy reshuffle_anim (a s ním
    // i zdržení broadcastu v handleReshuffleAndBroadcast) potlačí – přesně jako v openStore.
    _revealAnim(deckBefore, dealt) {
        const before = Math.max(0, deckBefore | 0);
        const n = Math.max(0, dealt | 0);
        const mode = before < n ? 'blocking' : (before === n ? 'proactive' : 'none');
        const shuffleCount = this.deck._reshuffleOccurred ? (this.deck._reshuffleCount || 0) : 0;
        this.deck._reshuffleOccurred = false;
        this.deck._reshuffleCount = 0;
        this.deck._reshuffleWasProactive = false;
        return { dealtBefore: Math.min(before, n), mode, shuffleCount, total: n, origCount: before };
    },

    _finishDraw() {
        const isKillReward = this.drawPhaseState.isKillReward;
        const wasStartOfTurn = this.drawPhaseState.isStartOfTurn;
        this.drawPhaseState.active = false;
        if (isKillReward) {
            // Obnov fázi PŘED resume: jinak by další odložený special ve frontě
            // (typicky Suzy Lafayette s prázdnou rukou) zachytil přechodné "DRAW"
            // jako interruptedPhase a po doběhnutí by hra uvázla v DRAW bez
            // aktivního drawPhaseState. Vrátíme se tam, odkud kill-reward přerušil.
            this.phase = this.interruptedPhase || "PLAY";
            this._resumeAfterSpecial();
        } else {
            this.phase = "PLAY";
            this._processSpecialQueue();
            // High Noon – Želízka: po fázi lízání si hráč na tahu volí barvu. Ptáme se až
            // po frontě odložených akcí (na konci lízání bývá prázdná); kdyby si ji fronta
            // vzala, zůstane hráč pro tenhle tah bez omezení – nikdy ne zaseknutý.
            // Fistful – Ranč (výměna karet) jde AŽ ZA Želízky, takže když se čeká na barvu,
            // pustí ho na řadu chooseHandcuffsSuit (logic/highNoon.js).
            if (wasStartOfTurn && this.phase === "PLAY" && !this._startHandcuffs()) this._startRanch();
        }
    },

    // Claus "The Saint" (A Fistful of Cards): ve fázi 1 si lízne o kartu víc, než je
    // hráčů ve hře, pak dá po jedné kartě každému ostatnímu a zbytek si nechá.
    // Kolik si NECHÁ, řídí _drawCountFor (Žízeň 1, Příjezd vlaku 3, duch 3) – stejná
    // dohoda jako u Kita Carlsona. Počet rozdaných je dán počtem spoluhráčů ve hře,
    // takže si celkem lízne `rozdané + ponechané` (u čtyř hráčů a bez událostí 5).
    // Odkrývá se to všechno naráz jedním klikem na balíček (cardsNeeded: 1) – při osmi
    // hráčích by jinak klikal devětkrát a řada by se plnila po jedné kartě.
    startClausDraw() {
        const player = this.getCurrentPlayer();
        player.bangsPlayedThisTurn = 0;
        const keep = this._drawCountFor(player);
        const n = this.players.length;
        const order = [];
        for (let k = 1; k < n; k++) {
            const i = (this.currentPlayerIndex + k) % n;
            if (isInPlay(this.players[i])) order.push(i);
        }
        this.drawPhaseState = {
            active: true,
            playerIdx: this.currentPlayerIndex,
            cardsNeeded: 1,
            cardsDrawn: 0,
            options: this._drawOptionsBase(player),
            // Pořád je to lízání na začátku tahu – Želízka (High Noon) se ptají až za ním.
            isStartOfTurn: true,
            isClaus: true,
            clausKeep: keep,
            clausOrder: order,
        };
        this.phase = "DRAW";
    },

    startKitCarlsonDraw() {
        const player = this.getCurrentPlayer();
        player.bangsPlayedThisTurn = 0;
        // Odkryté karty jsou vždy 3 (schopnost); mění se jen kolik si jich nechá.
        // Žízeň (líže 1) → nechá si 1; Příjezd vlaku (líže 3) → nechá si 2 z odkrytých
        // a zbylou kartu si po výběru lízne klasicky z balíčku (kitExtra).
        const total = this._drawCountFor(player);
        const keep = Math.min(total, KIT_REVEAL - 1);
        this.drawPhaseState = {
            active: true,
            playerIdx: this.currentPlayerIndex,
            cardsNeeded: 1,
            cardsDrawn: 0,
            options: this._drawOptionsBase(player),
            isKitCarlson: true,
            // I Kitovo odkrývání JE fáze lízání na začátku tahu – bez tohoto příznaku by
            // _finishDraw přeskočil volbu barvy pro Želízka (High Noon) a Kit by jako
            // jediná postava hrál bez omezení.
            isStartOfTurn: true,
            kitNeeded: keep,            // kolik si nechá z odkrytých
            kitExtra: total - keep      // kolik si po výběru dolízne z balíčku
        };
        this.phase = "DRAW";
    },

    kitCarlsonPick(cardIdx) {
        if (this.phase !== "KIT_CARLSON") return;
        const kc = this.kitCarlsonState;
        if (cardIdx < 0 || cardIdx >= kc.revealed.length) return;
        if (kc.pendingAdd.includes(cardIdx)) return;

        const player = this.getCurrentPlayer();
        const card = kc.revealed[cardIdx];
        // Vybraná karta jde do ruky HNED po každém výběru (klient ji rovnou odanimuje),
        // ne až po druhém. pickedIds drží veřejně ID už vybraných (panel je skryje).
        if (!kc.pickedIds) kc.pickedIds = [];
        kc.pickedIds.push(card.id);
        kc.pendingAdd.push(cardIdx);
        player.hand.push(card);
        this.logEvent('draw', { who: player.name, source: 'Kit Carlson', cards: [card.name] });
        // Fistful – Právo západu: vynucená je druhá karta, kterou si NECHÁ.
        this._lawMark(player, card, kc.pendingAdd.length);

        if (kc.pendingAdd.length >= (kc.needed || 2)) {
            const pickedSet = new Set(kc.pendingAdd);
            // Nevybrané zpátky na balíček ve STEJNÉM pořadí, v jakém ležely (FAQ H6):
            // draw() bere z konce pole, takže se vrací odzadu (poslední odkrytá jde dolů).
            for (let i = kc.revealed.length - 1; i >= 0; i--) {
                if (!pickedSet.has(i)) this.deck.returnToTop(kc.revealed[i]);
            }
            const extra = kc.extra || 0;
            this.kitCarlsonState = null;
            if (extra > 0) {
                // Příjezd vlaku (High Noon): karta nad rámec schopnosti se líže úplně
                // klasicky z balíčku, až po výběru (klik na balíček jako u kohokoli jiného).
                this.drawPhaseState = {
                    active: true,
                    playerIdx: this.currentPlayerIndex,
                    cardsNeeded: extra,
                    cardsDrawn: 0,
                    options: ['deck'],
                    // Pořád je to lízání na začátku tahu (jen jeho ocásek) – Želízka se
                    // ptají až za ním, viz _finishDraw.
                    isStartOfTurn: true
                };
                this.phase = "DRAW";
                return;
            }
            // Konec lízání jde JEDNÍM místem (_finishDraw) – tam se dobere fronta
            // odložených akcí a zeptají se Želízka.
            this._finishDraw();
        }
    },

    resolveBlackJack(wantThird) {
        if (this.phase !== "BLACK_JACK_CHECK") return;
        const ds = this.drawPhaseState;
        const card = ds.blackJackCard;
        // Barva, která platí (Požehnání = vše červené, Prokletí = vše černé).
        const suit = this._effSuit(card);
        const isRed = suit === Suits.HEARTS || suit === Suits.DIAMONDS;
        const player = this.players[ds.playerIdx];
        player.hand.push(card);
        this.logEvent('draw', { who: player.name, source: 'deck (Black Jack)', cards: [card.name] });
        player.stats.cardsDrawn++;
        ds.cardsDrawn++;
        // Fistful – Právo západu: Black Jackova druhá karta je odkrytá tak jako tak.
        this._lawMark(player, card, ds.cardsDrawn);
        ds.blackJackCard = null;

        if (isRed) {
            // Za červenou druhou kartu si líže JEDNU navíc nad svůj základ (běžně 2 → 3,
            // s Příjezdem vlaku 3 → 4). Se Žízní se druhá karta vůbec nelíže, takže se
            // sem nedostane.
            this.drawPhaseState.cardsNeeded = ds.cardsNeeded + 1;
            this.drawPhaseState.blackJackWaitingForThird = true;
            this.phase = "DRAW";
            return;
        }
        // Černá druhá karta = žádný bonus, ale fáze lízání tím nutně nekončí: s Příjezdem
        // vlaku (High Noon) zbývá ještě karta za událost a líže se až teď, na konci.
        if (ds.cardsDrawn < ds.cardsNeeded) {
            this.phase = "DRAW";
            return;
        }
        this._finishDraw();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrawMixin;
} else {
    Object.assign(GameState.prototype, DrawMixin);
}
})();
