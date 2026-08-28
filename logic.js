// Sdílená čistá logika vzdálenosti/dostřelu. V prohlížeči jsou computeDistance/computeCanHit
// globály z core/distance.js (načteno PŘED logic.js). V Node je sem musíme načíst přes require.
if (typeof computeDistance === 'undefined' && typeof require === 'function') {
    const __dist = require('./core/distance.js');
    globalThis.computeDistance = __dist.computeDistance;
    globalThis.computeCanHit = __dist.computeCanHit;
    globalThis.bangEffectReach = __dist.bangEffectReach;
    globalThis.effectiveCharacter = __dist.effectiveCharacter;
}
// Samostatný shim: core/playability.js si při vlastním require doplní jen část globálů
// z distance.js, takže by blok výš (hlídaný computeDistance) mohl být přeskočený.
if (typeof isInPlay === 'undefined' && typeof require === 'function') {
    globalThis.isInPlay = require('./core/distance.js').isInPlay;
}
if (typeof inPlayCount === 'undefined' && typeof require === 'function') {
    globalThis.inPlayCount = require('./core/distance.js').inPlayCount;
}

// V Node nejsou entity globály — načteme je z logic/entities.js a vystavíme na globalThis,
// aby na ně metody GameState mohly sahat bez kvalifikace. V prohlížeči jsou to globály
// z <script src="logic/entities.js"> načteného PŘED logic.js.
if (typeof CardType === 'undefined' && typeof require === 'function') {
    const __ent = require('./logic/entities.js');
    globalThis.CardType = __ent.CardType;
    globalThis.Suits = __ent.Suits;
    globalThis.ALL_CHARACTERS = __ent.ALL_CHARACTERS;
    globalThis.DODGE_CITY_CHARACTERS = __ent.DODGE_CITY_CHARACTERS;
    globalThis.FISTFUL_CHARACTERS = __ent.FISTFUL_CHARACTERS;
    globalThis.WILD_WEST_CHARACTERS = __ent.WILD_WEST_CHARACTERS;
    globalThis.WILD_WEST_READY = __ent.WILD_WEST_READY;
    globalThis.Card = __ent.Card;
    globalThis.Player = __ent.Player;
    globalThis.Deck = __ent.Deck;
}

// Čisté helpery rolí/výhry. V prohlížeči globály z core/*, v Node přes require.
if (typeof rolesForPlayerCount === 'undefined' && typeof require === 'function') {
    const __roles = require('./core/roles.js');
    globalThis.rolesForPlayerCount = __roles.rolesForPlayerCount;
    globalThis.healthForCharacter = __roles.healthForCharacter;
}
// Divoký západ – Big Spencer: 9 životů, ale 5 startovních karet (core/roles.js).
if (typeof startCardsForCharacter === 'undefined' && typeof require === 'function') {
    globalThis.startCardsForCharacter = require('./core/roles.js').startCardsForCharacter;
}
// Hra pro 3 hráče (Město duchů): kruh cílů + dotaz „platí tady pravidla pro 3?"
if (typeof TARGET_3P === 'undefined' && typeof require === 'function') {
    const __roles3 = require('./core/roles.js');
    globalThis.TARGET_3P = __roles3.TARGET_3P;
    globalThis.isThreePlayerMode = __roles3.isThreePlayerMode;
    globalThis.firstPlayerIndex = __roles3.firstPlayerIndex;
}
if (typeof evaluateWinner === 'undefined' && typeof require === 'function') {
    globalThis.evaluateWinner = require('./core/winCondition.js').evaluateWinner;
}
// „Je to modrá karta?" (José Delgado) – jediný zdroj pravdy pro server, klient i bota.
if (typeof isBlueCard === 'undefined' && typeof require === 'function') {
    globalThis.isBlueCard = require('./core/cardRules.js').isBlueCard;
}
// A Fistful of Cards – Právo západu: „drží hráče v tahu vynucená karta?" Stejným helperem
// se ptá klient (rámeček, zašedlé tlačítko) i bot, jinak by se hra zasekla na tiše
// odmítnutém „Ukončit tah". core/playability.js na logic.js nesahá, cyklus nevzniká.
if (typeof lawForcedCard === 'undefined' && typeof require === 'function') {
    globalThis.lawForcedCard = require('./core/playability.js').lawForcedCard;
    globalThis.lawSelfShootOnly = require('./core/playability.js').lawSelfShootOnly;
    globalThis.lawLocksOther = require('./core/playability.js').lawLocksOther;
    globalThis.lawProtectedCard = require('./core/playability.js').lawProtectedCard;
    globalThis.lawHandcuffsSuit = require('./core/playability.js').lawHandcuffsSuit;
}
// A Fistful of Cards – Ruská ruleta: „co se počítá za kartu Vedle!". Stejný helper si
// bere klient (zvýraznění) i bot, takže se výčet nemůže rozejít se serverem.
if (typeof rouletteDiscardable === 'undefined' && typeof require === 'function') {
    globalThis.rouletteDiscardable = require('./core/playability.js').rouletteDiscardable;
    globalThis.rouletteHasCard = require('./core/playability.js').rouletteHasCard;
    globalThis.rouletteBarrelChecks = require('./core/playability.js').rouletteBarrelChecks;
}
// A Fistful of Cards – Odstřelovač a Odražená střela: „co se počítá za kartu Bang!",
// „zbývá volný limit Bang!/tah" a „je tenhle cíl v dostřelu". Znovu tytéž helpery pro
// server, klienta i bota – kdyby se rozešly, server by akci odmítl a bot ji posílal dál.
if (typeof bangCardFromHand === 'undefined' && typeof require === 'function') {
    const __pl = require('./core/playability.js');
    globalThis.bangCardFromHand = __pl.bangCardFromHand;
    // Divoký západ – Zúčtování: „co se počítá za kartu Bang! / Vedle!". Tímtéž predikátem
    // se ptá server (playBang, handleResponse), klient i bot; rozejít se nesmí.
    globalThis.playsAsBang = __pl.playsAsBang;
    globalThis.playsAsMissed = __pl.playsAsMissed;
    globalThis.preacherBlocks = __pl.preacherBlocks;
    globalThis.bangLimitFree = __pl.bangLimitFree;
    globalThis.bangAtPlayerOk = __pl.bangAtPlayerOk;
    globalThis.ricochetOffer = __pl.ricochetOffer;
    globalThis.ricochetTargetOk = __pl.ricochetTargetOk;
    globalThis.ricochetAvailable = __pl.ricochetAvailable;
    globalThis.sniperOffer = __pl.sniperOffer;
    // Divoký západ – Lee Van Kliff: „je co opakovat, je čím zaplatit a je na koho".
    // Deskriptor `_lastBrown` staví server, ale ptá se na něj i klient a bot.
    globalThis.lvkRepeat = __pl.lvkRepeat;
    globalThis.lvkPayOk = __pl.lvkPayOk;
    globalThis.lvkTargetOk = __pl.lvkTargetOk;
    globalThis.lvkOffer = __pl.lvkOffer;
}

class GameState {
    constructor() {
        this.players = [];
        this.deck = new Deck();
        // Deck loguje reshuffle/prázdný balíček přes logEvent (no-op než server nastaví _onEvent).
        this.deck._log = (type, data) => this.logEvent(type, data);
        this.currentPlayerIndex = 0;
        this.phase = "MENU";
        this.winner = null;
        
        this.storeCards = [];
        this.storePickerIndex = 0;
        this.storeAnim = null;   // cinematika hokynářství (řídí klient): { dealtBefore, mode, shuffleCount, total }

        this.pendingResponse = {
            active: false,
            originatorIdx: null,
            targetIdx: null,
            requiredCard: null,
            sourceCard: null,
            responded: []
        };

        this.drawPhaseState = {
            active: false,
            playerIdx: null,
            cardsNeeded: 2,
            cardsDrawn: 0,
            options: []
        };

        this.sidKetchumPending = null;
        this.specialActionQueue = [];
        this.pendingBartDraw = null;
        this.pendingUhybDraw = null;
        this.pendingElGringoSteal = null;
        this.turnId = 0;   // monotonní ID tahu (zelené karty: nelze aktivovat ve stejném tahu)
        // Dodge City – „odhoď další kartu" (cíl se volí PŘED zaplacením další karty).
        this.pendingDiscardAnother = null;
        this.pendingVeraCopy = null;   // Vera Custer – čeká na volbu kopírované postavy
        // Dělení karet mrtvého mezi VÍC Vulture Samů (Vulture Sam + Vera Custer, která ho
        // kopíruje): { deadIdx, pickers, next }. Viz logic/characters.js.
        this.pendingVultureSplit = null;
        this._pendingDeathReveal = null;   // po dodělení: server dohraje odhalení role
        this.brawlQueue = null;
        this.brawlAttackerIdx = null;
        this.interruptedPhase = null;
        this.lastAnimEvent = null;
        this.pendingDynamiteDamage = null;
        // Rozšíření High Noon – balíček událostí a právě platná karta. Bez zapnutého
        // rozšíření zůstává balíček prázdný a hasEvent() vrací vždy false.
        this.eventDeck = [];
        this.eventPile = [];            // už odkryté události (nejstarší → nejnovější)
        this.activeEvent = null;
        this.pendingNoonDamage = null;   // Pravé poledne: čeká se na kliknutí na životy
        this.daltonsQueue = null;        // Daltonové: fronta hráčů odhazujících modrou kartu
        this.pendingHandcuffs = null;    // Želízka: čeká se na volbu barvy (po fázi lízání)
        this.pendingNewIdentity = null;  // Nová identita: nabídka výměny postavy na začátku tahu
        this._sheriffTurns = 0;          // kolikátý tah šerifa běží (událost až od 2.)
        this._beginTurnStep = 0;         // krokovač startu tahu (viz logic/highNoon.js)
        // Rozšíření A Fistful of Cards – DRUHÝ balíček událostí, hraje se současně
        // s High Noonem. Otáčí se ve stejný okamžik (společné `_sheriffTurns`) a `hasEvent`
        // se ptá obou balíčků najednou. Viz logic/fistful.js.
        this.ffDeck = [];
        this.ffPile = [];               // už odkryté karty Fistfulu (nejstarší → nejnovější)
        this.activeFistful = null;
        this._ffEntering = null;
        // Rozšíření Divoký západ (Wild West Show) – TŘETÍ balíček událostí. Neotáčí ho
        // šerif na začátku kola, ale kdokoli zahráním Dostavníku / Wells Farga, takže na
        // začátku hry žádná jeho událost neplatí. Viz logic/wildWest.js.
        this.wwsDeck = [];
        this.wwsPile = [];              // už odkryté karty Divokého západu (nejstarší → nejnovější)
        this.activeWws = null;
        this._wwsEntering = null;
        this.pendingPeyote = null;      // Peyote: čeká se na tip červená/černá
        this.pendingRanch = null;       // Ranč: čeká se na výměnu karet (po fázi lízání)
        this.pendingBlood = null;       // Pokrevní bratři: nabídka darovat 1 život (před lízáním)
        this.pendingFistful = null;     // Fistful of Cards: rozdělaná série zásahů na začátku tahu
        this._mineTurn = false;         // Opuštěný důl: líže tenhle tah z odhozu? (fáze 1 a 3)
        // Divoký západ – Teren Kill: pozastavené vyřazení, na které se právě snímá.
        // `_terenDyingIdx` drží hák vypnutý ve chvíli, kdy sejmutí padlo na pik a vyřazení
        // se dokončuje doopravdy (viz logic/wildWest.js).
        this.pendingTerenKill = null;
        this._terenDyingIdx = null;
        this._firstDeadIdx = null;      // Mrtvý muž: kdo byl vyřazen jako první
        this._deadManUsed = false;      // Mrtvý muž: návrat je jednorázový
        this.pendingRoulette = null;    // Ruská ruleta: kolečko odhazování karet Vedle!
        this._advanceRouletteAfterQueue = false;   // …a jeho posun až po frontě odložených akcí
        this._lastBrown = null;        // Divoký západ – Lee Van Kliff: poslední hnědá karta tahu
        this._vendettaDone = false;     // Vendeta: sejmutí je v jednom tahu jen jednou
        this._extraTurn = false;        // Vendeta: běží tah navíc (nová událost se neodkrývá)
        // Hra pro 3 hráče (Město duchů): odkryté role a cíle v kruhu. mode3p jde i do
        // klienta (řídí zobrazení karet rolí i redakci stavu), _winClaim3p drží seat, který
        // osobně vyřadil svého určeného nepřítele, a tím hru vyhrál.
        this.mode3p = false;
        this._winClaim3p = null;
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    // „Šerifova pozice": kdo začíná hru, od koho jdou efekty po směru (Daltonové) a na čí
    // tah se odkrývá karta High Noon. Ve hře pro 3 (Město duchů) šerif není a začíná
    // pomocník – bez tohohle by findIndex('Sheriff') vrátil -1 a hra se nerozjela.
    // Pravidlo samo je čistá funkce v core/roles.js (ptá se jí i server nad prostým stavem).
    _firstPlayerIndex() {
        return firstPlayerIndex(this.players);
    }

    // Deleguje na sdílenou čistou funkci z core/distance.js (this == {players}).
    getDistance(fromIdx, toIdx) {
        return computeDistance(this, fromIdx, toIdx);
    }

    canHit(attackerIdx, targetIdx) {
        return computeCanHit(this, attackerIdx, targetIdx);
    }

    // Apache Kid (Dodge City): kárové (♦) karty zahrané JINÝMI hráči na něj nemají efekt.
    // Voláno na všech cílených cestách (Bang!/bang-efekt, hromadné útoky, Panika/Cat Balou,
    // Vězení, Krytý vůz, Duel). Pozor: gate-uje se BARVA CÍLENÉ KARTY. Bang! zahrané jako
    // REAKCE uvnitř duelu jsou reakce (ne cílené karty), takže Apache Kida zasáhnou bez
    // ohledu na barvu – proto se v handleResponse tento test nevolá. Kárová karta, kterou
    // zahraje Apache Kid SÁM NA SEBE, efekt má (pravidlo mluví o kartách „ostatních hráčů").
    _apacheImmune(targetIdx, cardSuit, attackerIdx = null) {
        if (attackerIdx !== null && attackerIdx === targetIdx) return false;
        const t = this.players[targetIdx];
        return !!t && effectiveCharacter(t) === "Apache Kid" && cardSuit === Suits.DIAMONDS;
    }

    // Belle Star (Dodge City): v jejím tahu nemají cizí karty na stole (Barel, Mustang/Skrýš,
    // zelené Vedle!) žádný efekt. Platí, jen když útočí ona sama (aktuální hráč). Dosah řeší
    // computeDistance (core/distance.js), tady se gate-uje Barel a zelené reakce.
    _belleIgnoresBoard(attackerIdx) {
        return attackerIdx === this.currentPlayerIndex &&
               effectiveCharacter(this.players[this.currentPlayerIndex]) === "Belle Star";
    }

    // Limit karet v ruce na konci tahu. Normálně = počet životů; Sean Mallory (Dodge City)
    // drží až 10 karet.
    _handLimit(player) {
        if (player && effectiveCharacter(player) === "Sean Mallory") return 10;
        return player ? (player.health || 0) : 0;
    }

    // Vyléčení se stropem na maximu životů. Mrtvého neléčí – ten se vrací do hry jen
    // přes vlastní pravidla (Pivo při posledním životě, Sid Ketchum). Duch (Město duchů)
    // ve hře JE (isInPlay), takže se léčit MŮŽE: naléčené životy pak smí utratit postava,
    // která za dobrovolnou ztrátu života profituje (Chuck Wengam). Na konci jeho tahu
    // spadnou zase na nulu (tryEndTurn / _teardownGhost).
    _heal(player, amount = 1) {
        if (!player || !isInPlay(player) || amount <= 0) return 0;
        const before = player.health;
        player.health = Math.min(player.health + amount, player.maxHealth);
        return player.health - before;
    }

    discardCard(cardIdx) {
        const p = this.getCurrentPlayer();
        if (this.phase !== "DISCARD") return;
        const card = p.hand.splice(cardIdx, 1)[0];
        // Divoký západ – Gary Looter si bere karty, které ostatní odhodí nad limit na
        // konci svého tahu. Vyhrává i nad Opuštěným dolem (R7): karta se k balíčku vůbec
        // nedostane, protože ji schopnost zachytí dřív, než se řeší, kam se odkládá.
        const looter = card ? this._garyLooterFor(this.currentPlayerIndex) : null;
        if (looter) {
            looter.hand.push(card);
            this.logEvent('special', { who: looter.name, card: 'Gary Looter',
                                       target: p.name, taken: card.name });
        }
        // A Fistful of Cards – Opuštěný důl: odhoz nad limit karet je FÁZE 3, takže pod
        // dolem jde lícem dolů navrch dobíracího balíčku (viz _mineDiscardEndTurn).
        else if (card) this._mineDiscardEndTurn(card);
        p.stats.cardsDiscarded++;
        if (p.hand.length <= this._handLimit(p)) {
            this.nextTurn();
        }
    }

    nextTurn() {
        // Divoký západ – John Pain: pojistka pro větve, které frontu odložených akcí
        // neberou (Vězení sebralo tah, Vendeta neuspěla) – nejpozději na konci tahu.
        this._drainJohnPain();
        // Divoký západ – Madam Zuzana: kdo za svůj tah nezahrál 3 karty, ztrácí život.
        // Je to úplně první gate: pořadí na konci tahu je fáze 3 (odhoz nad limit) →
        // Zuzana → Vendeta → nový tah. Sedí tady (a ne v tryEndTurn), protože se do
        // nextTurn chodí DVĚMA cestami – tryEndTurn i discardCard.
        if (this._zuzanaPenalty()) return;
        // Fistful – Vendeta: na konci svého tahu hráč sejme kartu a při ♥ hraje ještě
        // jednou. Gate je úplně nahoře, PŘED odchodem ducha (Město duchů): duch Vendetu
        // dostává taky (R10) a ze hry odchází až na konci toho tahu navíc.
        if (this._vendettaCheck()) return;
        // High Noon – Město duchů: končí-li právě tah ducha, odejde ze hry ještě předtím,
        // než se posune tah (odloží karty, spustí Grega Diggera/Herba Huntera). Když se
        // tím naplní fronta odložených akcí, posune tah až _resumeAfterSpecial.
        if (this._teardownGhost()) return;
        this.turnId = (this.turnId || 0) + 1;   // monotonní ID tahu (zelené karty: „nelze aktivovat ve stejném tahu")
        // High Noon – Zlatá horečka: hraje se proti směru hodinových ručiček. Krok musí
        // použít i cyklus přeskakující mrtvé, jinak by se směr u mrtvého souseda obrátil.
        const step = this._turnStep();
        // High Noon – Město duchů: vyřazení hráči se na svůj tah vracejí do hry, takže se
        // v pořadí NEpřeskakují. Událost se mění jen na šerifově tahu (uvnitř _beginTurn),
        // takže v tomhle bodě už platí ta správná.
        const ghostTown = this.hasEvent('MESTO_DUCHU');
        // Fistful – Mrtvý muž: první vyřazený se na svůj tah vrací do hry NATRVALO, takže
        // se v pořadí taky nepřeskakuje. Test je dřív než `_ghost` – když běží obě události,
        // vrací se doopravdy, ne jako duch (návrat pak dokončí krok 0 startu tahu).
        const deadManIdx = this._deadManReturnIdx();
        this.currentPlayerIndex = (this.currentPlayerIndex + step) % this.players.length;
        let p = this.players[this.currentPlayerIndex];
        while (p.health <= 0 && !ghostTown && this.currentPlayerIndex !== deadManIdx) {
            this.currentPlayerIndex = (this.currentPlayerIndex + step) % this.players.length;
            p = this.players[this.currentPlayerIndex];
        }
        if (ghostTown && p.health <= 0 && this.currentPlayerIndex !== deadManIdx) {
            p._ghost = true;
            this.logEvent('event', { card: 'Město duchů', who: p.name, msg: 'vrací se na jeden tah do hry' });
        }
        // Fistful – Vendeta: sejmutí („jen jednou za tah") i příznak tahu navíc platí vždy
        // jen pro hráče, jehož tah právě skončil. Nuluje se to tedy při přechodu na jiného
        // – a NUTNĚ ještě před _beginTurn(), který se ptá _extraTurn (odkrytí událostí).
        this._vendettaDone = false;
        this._extraTurn = false;
        // Divoký západ – Madam Zuzana: totéž pro její penalizaci (jen jednou za tah)
        // a pro počítadlo zahraných karet, které patří vždy jednomu tahu jednoho hráče.
        this._zuzanaDone = false;
        const cp = this.players[this.currentPlayerIndex];
        if (cp) cp._playedThisTurn = 0;
        this.logEvent('turn', { who: cp?.name, role: cp?.role, hp: cp?.health, max: cp?.maxHealth, hand: cp?.hand?.length });
        // High Noon: odkrytí události (šerif) a Pravé poledne se vyhodnocují PŘED
        // kontrolami na Dynamit/Vězení. Když si start tahu vyžádá rozhodnutí hráče,
        // pokračuje se až z _resumeBeginTurn (viz logic/highNoon.js).
        if (this._beginTurn()) return;
        this.handleStartOfTurnChecks();
    }

    openStore() {
        this.phase = "STORE";
        this.storeCards = [];
        // Hokynářství rozdává kartu každému hráči VE HŘE – při Městě duchů (High Noon)
        // tedy i duchovi, který si zrovna odbývá svůj tah.
        const aliveCount = this.players.filter(p => isInPlay(p)).length;
        const origCount = this.deck._drawPile.length;
        for (let i = 0; i < aliveCount; i++) {
            this.storeCards.push(this.deck.draw());
        }
        // Cinematika hokynářství řízená klientem (zvednutí balíčků, rozdání, míchání
        // v horní poloze). dealtBefore (k) = kolik karet šlo rozdat z původního balíčku;
        // mode: 'none' = dost karet, balíček nevyprázdněn; 'proactive' = přesně tolik,
        // kolik se rozdává → balíček se vyprázdnil, míchá se až při výběru (neblokuje);
        // 'blocking' = málo karet → zbytek se rozdá až po zamíchání (výběr zamčen).
        const dealt = this.storeCards.filter(c => c).length;
        const k = Math.min(origCount, dealt);
        const shuffleCount = this.deck._reshuffleOccurred ? (this.deck._reshuffleCount || 0) : 0;
        // 'blocking'/'proactive' POPISUJÍ MÍCHÁNÍ – bez něj musí zůstat 'none', jinak klient
        // přehraje míchací cinematiku, která se nikdy nestala (Opuštěný důl: odhoz dojde
        // uprostřed rozdávání, důl se vypne a zbytek se rozdá z dobíracího balíčku).
        let mode = 'none';
        if (shuffleCount && origCount < aliveCount) mode = 'blocking';
        else if (shuffleCount && origCount === aliveCount) mode = 'proactive';
        // origCount = kolik karet měl balíček PŘED rozdáním. Klient podle něj kreslí
        // hromádku po dobu rozdávání (stav už obsahuje případně zamíchaný balíček).
        this.storeAnim = { dealtBefore: k, mode, shuffleCount, total: dealt, origCount };
        // Míchání si přebírá klientská cinematika → potlač legacy reshuffle_anim a
        // jeho zpoždění broadcastu (handleReshuffleAndBroadcast).
        this.deck._reshuffleOccurred = false;
        this.deck._reshuffleCount = 0;
        this.deck._reshuffleWasProactive = false;
        this.storePickerIndex = this.currentPlayerIndex;
    }

    pickFromStore(cardIdx) {
        const card = this.storeCards[cardIdx];
        if (!card) return;
        this.storeCards[cardIdx] = null;
        this.players[this.storePickerIndex].hand.push(card);

        do {
            this.storePickerIndex = (this.storePickerIndex + 1) % this.players.length;
        } while (!isInPlay(this.players[this.storePickerIndex]));

        if (this.storeCards.every(c => c === null)) {
            this.phase = "PLAY";
            this.storeCards = [];
            this.storeAnim = null;
        }
    }

    tryEndTurn() {
        // Tah jde ukončit jen z hraní (a z odhazování, kde je to no-op). Opožděný klik
        // na „Ukončit tah" doručený už během lízání/reakce by jinak tah zahodil rovnou
        // (bez líznutí) nebo ukončil tah někomu jinému uprostřed obrany.
        if (this.phase !== "PLAY" && this.phase !== "DISCARD") return;
        const p = this.getCurrentPlayer();
        if (!p) {
            this.nextTurn();
            return;
        }
        // A Fistful of Cards – Právo západu: odkrytou druhou lízanou kartu musí hráč zahrát,
        // dokud to jde – tah tedy zatím ukončit nelze. Klient tlačítko zašedí a bot kartu
        // zahraje jako první, oba se ptají TÍM SAMÝM helperem (viz _lawForced).
        if (this.phase === "PLAY" && this._lawForced(this.currentPlayerIndex)) return;
        // High Noon – Město duchů: co si duch během svého tahu naléčil, na jeho konci zase
        // ztrácí (do hry se vrátil s nulou). Musí to padnout PŘED limitem karet, aby zbytek
        // tahu proběhl „klasicky": limit = 0 životů → odhodí celou ruku (FAQ H8).
        if (p._ghost) p.health = 0;
        const handLength = p.hand ? p.hand.length : 0;
        if (handLength > this._handLimit(p)) {
            this.phase = "DISCARD";
        } else {
            this.nextTurn();
        }
    }

    checkWinCondition() {
        if (this.isDebug) {
            const alive = this.players.filter(p => p.health > 0);
            const sheriff = alive.find(p => p.role === "Sheriff");
            const outlaws = alive.filter(p => p.role === "Outlaw");
            const renegades = alive.filter(p => p.role === "Renegade");
            let result = null;
            if (!sheriff) {
                result = alive.length === 1 && alive[0].role === "Renegade"
                    ? "Odpadlík by vyhrál!" : "Bandité by vyhráli!";
            } else if (outlaws.length === 0 && renegades.length === 0) {
                result = "Zákon by vyhrál!";
            }
            if (result) this.logEvent('system', { msg: `DEBUG – ${result} (hra pokračuje)` });
            return;
        }
        // mode3p/_winClaim3p: hra pro 3 hráče (Město duchů) – viz core/winCondition.js.
        const w = evaluateWinner(this.players, { mode3p: this.mode3p, winClaimIdx: this._winClaim3p });
        if (w) {
            this.winner = w;
            this.logEvent('win', {
                winner: this.winner,
                survivors: this.players.filter(p => p.health > 0).map(p => `${p.name}(${p.role})`),
            });
        }
    }

    // Každá fáze lízání dostane vlastní ID. Klient podle něj pozná, že jedno lízání
    // skončilo a začalo JINÉ – a vynuluje počítadlo naklikaných, ještě nepotvrzených
    // líznutí (core/drawCounter.js). Samotné `playerIdx`/`cardsDrawn` na to nestačí:
    // řetěz kill-rewardů (Herb Hunter 2 karty → odměna za banditu 3) běží pro TÉHOŽ
    // hráče a oba broadcasty (odložené o 350 ms) doručí `cardsDrawn: 0`, takže by
    // počítadlo nepoznalo předěl, zůstalo přeplněné a balíček by přestal jít rozkliknout.
    _setDrawPhase(ds) {
        this._drawSeq = (this._drawSeq || 0) + 1;
        ds.drawId = this._drawSeq;
        this.drawPhaseState = ds;
        return ds;
    }

    // Volá se na KAŽDÉ cestě „karta byla sehrána". Vedle statistik z toho žije
    // Divoký západ – Madam Zuzana (`_playedThisTurn`): počítadlo běží pořád, ne jen
    // když karta platí, protože přijde-li Zuzana uprostřed tahu, počítají se i karty
    // zahrané předtím (FAQ Q02). Odhozy (Ruská ruleta, limit na konci tahu) ani cena
    // „odhoď další kartu" sem nechodí, takže se do počtu samy nezapočítají.
    _trackCard(playerIdx, cardType) {
        const p = this.players[playerIdx];
        if (p) p._playedThisTurn = (p._playedThisTurn || 0) + 1;
        const s = p?.stats;
        if (!s) return;
        s.cardsUsed[cardType] = (s.cardsUsed[cardType] || 0) + 1;
        s.cardsPlayed++;
    }

    // Strukturovaná herní událost → injektovaný sink `_onEvent` (nastaví server v
    // lifecycle.js; zapíše ji do logu hry). V prohlížeči/testech je _onEvent undefined →
    // no-op. Funkce se přes JSON.stringify neserializuje, takže neuniká do klienta.
    logEvent(type, data) {
        if (!this._onEvent) return;
        try {
            this._onEvent(Object.assign({ ev: type, turn: this.turnId, phase: this.phase }, data || {}));
        } catch (_) { /* logování nesmí shodit pravidla */ }
    }
}

// ── Mixiny GameState ────────────────────────────────────────────────────────
// Tematicky rozdělené metody GameState žijí v logic/*. V Node je sem připojíme na
// prototyp; v prohlížeči se připojí samy přes vlastní <script> tagy načtené PO logic.js
// (viz pořadí v index.html). Konstanty/helpery v jejich tělech jsou globály z výše
// uvedených shimů (Node) nebo z dříve načtených <script> (browser).
if (typeof module !== 'undefined' && typeof require === 'function') {
    Object.assign(GameState.prototype,
        require('./logic/setup.js'),
        require('./logic/draw.js'),
        require('./logic/play.js'),
        require('./logic/combat.js'),
        require('./logic/response.js'),
        require('./logic/characters.js'),
        require('./logic/checks.js'),
        require('./logic/dodgeCity.js'),
        require('./logic/highNoon.js'),
        require('./logic/fistful.js'),
        require('./logic/wildWest.js')
    );
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameState, Deck, Player, Card, CardType, Suits, ALL_CHARACTERS, DODGE_CITY_CHARACTERS };
}