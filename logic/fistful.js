// logic/fistful.js — mixin GameState: rozšíření A Fistful of Cards (druhý balíček událostí).
// Funguje úplně stejně jako High Noon a hraje se s ním SOUČASNĚ: na začátku tahu prvního
// hráče se odkryje karta z obou balíčků, nejdřív z High Noonu a hned za ní z Fistfulu.
// Karta „Fistful of Cards" leží vespod balíčku (jako Pravé poledne v HN) – přijde poslední
// a platí do konce hry.
//
// Stav je záměrně vedle High Noonu, ne místo něj:
//   High Noon → eventDeck / eventPile / activeEvent / _eventEntering
//   Fistful   → ffDeck    / ffPile    / activeFistful / _ffEntering
// Slévají se jen v `hasEvent` (logic/highNoon.js) a `eventActive` (core/highNoon.js), takže
// se všechna pravidla ptají pořád stejně a klíče karet jsou napříč balíčky unikátní.
//
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {

// Karta, která se při přípravě dává vespod balíčku → odkryje se jako poslední.
const LAST_FF_KEY = 'FISTFUL_OF_CARDS';

// Soudce: karty, které se z ruky vykládají PŘED hráče (vlastního i cizího). Zelené karty
// (Dodge City) mají vlastní typy, poznají se přes `card.green`.
const JUDGE_BLOCKED_TYPES = [CardType.WEAPON, CardType.EQUIPMENT, CardType.BARREL,
                             CardType.DYNAMITE, CardType.JAIL];

const FistfulMixin = {
    // ── Příprava balíčku (setupGame / setupDebugGame / setupNextGame) ──────────
    // Bez zapnutého rozšíření zůstane balíček prázdný a `hasEvent` vrací pro jeho klíče
    // vždy false, takže jsou všechny háky v pravidlech no-op.
    _setupFistfulDeck(options = {}) {
        this.ffDeck = [];
        this.ffPile = [];
        this.activeFistful = null;
        this._ffEntering = null;
        this.pendingFistful = null;
        this.pendingBlood = null;
        this.pendingRoulette = null;
        this._advanceRouletteAfterQueue = false;
        // Vendeta: sejmutí na konci tahu je jednou za tah, tah navíc neodkrývá událost.
        this._vendettaDone = false;
        this._extraTurn = false;
        // Mrtvý muž: kdo byl vyřazen jako první a jestli se návrat už použil.
        this._firstDeadIdx = null;
        this._deadManUsed = false;
        // Nová (i navazující) hra začíná bez události, takže i bez prohozených hromádek.
        if (this.deck) this.deck.mineMode = false;
        // Navazující hra přebírá hráče z předchozí – vynucená karta Práva západu, odkrytá
        // role vyřazeného ani nabídka Pokrevních bratrů po nich zůstat nesmí (redakce
        // ukazuje `_roleRevealed` celému stolu, viz server/rooms.js).
        (this.players || []).forEach(p => { p._lawCardId = null; p._roleRevealed = false; p._bbOfferedTurn = null; });
        const on = options.expansions && options.expansions.fistful;
        if (!on || !Array.isArray(this.fistfulCardData)) return;

        const pool = this.fistfulCardData
            .map(c => ({ id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null }));
        const last = pool.filter(c => c.key === LAST_FF_KEY);
        const rest = pool.filter(c => c.key !== LAST_FF_KEY);
        this.deck.shuffleArray(rest);
        // Líže se přes pop() z konce pole → Fistful of Cards musí ležet na indexu 0.
        this.ffDeck = last.concat(rest);
        this.logEvent('system', { msg: `Fistful: balíček událostí (${this.ffDeck.length} karet)` });
    },

    // Odkrytí karty z balíčku Fistful. Volá se z `_flipEvent` (logic/highNoon.js) hned
    // za odkrytím karty High Noonu – počítadlo kol (`_sheriffTurns`) i podmínka „jen na
    // tahu prvního hráče a až od 2. kola" jsou tím pádem společné pro oba balíčky.
    _flipFistfulEvent() {
        if (!this.ffDeck || !this.ffDeck.length) return;
        this.activeFistful = this.ffDeck.pop();
        // Odkryté karty zůstávají ležet na sobě (nová překryje předchozí) – klient z nich
        // kreslí hromádku lícem nahoru. `activeFistful` je vrchní karta hromádky.
        this.ffPile.push(this.activeFistful);
        this._ffEntering = this.activeFistful.key;
        this._pendingFistfulReveal = Object.assign({}, this.activeFistful,
            { deck: 'ff', remaining: this.ffDeck.length });
        this.logEvent('event', { card: this.activeFistful.name, left: this.ffDeck.length });
    },

    // Efekty, které se vyhodnotí JEDNOU při příchodu karty do hry (zatím žádné – Ruská
    // ruleta přibude ve své fázi). Vrací true, když se čeká na rozhodnutí hráče, a start
    // tahu se tím pádem pozastaví (viz `_runBeginTurn` v logic/highNoon.js).
    _applyFfEventOnEnter() {
        const key = this._ffEntering;
        this._ffEntering = null;
        if (!key) return false;
        if (key === 'RUSKA_RULETA') return this._startRoulette();
        return false;
    },

    // ── Opuštěný důl: „Líže se z odhozu, odhazuje se lícem dolů na balíček." ───
    // Samotné prohození hromádek umí Deck (logic/entities.js) – tady se jen zapíná.
    // Volá se z `_flipEvent` (logic/highNoon.js) HNED ZA odkrytím karet obou balíčků,
    // tedy dřív, než si start tahu sáhne na hromádky (kontrolní sejmutí na Dynamit
    // a Vězení už z prohozených líže – R7 nezná výjimky).
    //
    // Mimo odkrývání se s příznakem nehýbe, a to je celé „dokud je to možné":
    // když odhoz během kola dojde, shodí si `mineMode` sám `Deck.draw()` a pro zbytek
    // kola se hraje normálně. Zpátky ho zapne až tenhle sync na začátku dalšího kola.
    _syncMine() {
        this.deck.mineMode = this.hasEvent('OPUSTENY_DUL');
    },

    // ── Laso: „Karty vyložené před hráči nemají žádný efekt." ──────────────────
    // Jediný dotaz pravidel. Je to totéž, co už umí vypínač karet na stole u Belle Star
    // (`_belleIgnoresBoard` v logic.js), jen platí pro VŠECHNY hráče a i na karty vlastní.
    // Vypnuté jsou:
    //   • dostřel zbraně → 1 jako s Coltem (a Volcanic nedovolí Bang! bez limitu),
    //   • Mustang/Skrýš i Dalekohled/Hledí (computeDistance v core/distance.js),
    //   • Barel – Jourdonnaisova VROZENÁ schopnost platí dál, není to karta,
    //   • Dynamit i Vězení – žádné sejmutí, dynamit se neposouvá, vězení tah nebere,
    //   • zelené karty – aktivace i zelené Vedle! ze stolu.
    // Karty přitom zůstávají ležet, takže po skončení kola zase fungují.
    _boardDead() {
        return this.hasEvent('LASO');
    },

    // ── Soudce: „Hráči nesmí vykládat karty před sebe ani před ostatní hráče." ──
    // Blokuje jen cestu karty Z RUKY na stůl (výzbroj, modré, zelené a Vězení). Co už
    // leží, funguje dál – aktivace zelené karty i Hokynářství Uncle Willa jsou povolené.
    _judgeBlocks(card) {
        return this.hasEvent('SOUDCE') && !!card &&
               (!!card.green || JUDGE_BLOCKED_TYPES.includes(card.type));
    },

    // ── Právo západu: „Druhá lízaná karta se odkryje a musí se v tomhle tahu zahrát." ─
    // Označení karty. `nth` je pořadí karty v rámci fáze lízání (1-based) – volá se ze
    // všech cest, kudy karta v téhle fázi doputuje do ruky (běžné líznutí, Black Jack,
    // Kit Carlson a Claus si značí druhou PONECHANOU). Se Žízní (High Noon) se líže jen
    // jedna karta, takže žádná vynucená není. Nuluje se v `_beginTurn` (logic/highNoon.js).
    _lawMark(player, card, nth) {
        if (nth !== 2 || !player || !card || !this.hasEvent('PRAVO_ZAPADU')) return;
        player._lawCardId = card.id;
        this.logEvent('event', { card: 'Právo západu', who: player.name, msg: `musí zahrát ${card.name}` });
    },

    // Drží hráče v tahu vynucená karta? Trychtýř na sdílený helper z core/playability.js –
    // úplně stejně se ptá klient i bot, jinak by server tiše odmítal „Ukončit tah".
    _lawForced(playerIdx) {
        const p = this.players[playerIdx];
        return p ? lawForcedCard(this, p, playerIdx) : null;
    },

    // Zamyká vynucená karta zbytek tahu? Dokud ji hráč drží a JDE zahrát, nesmí udělat
    // nic jiného – povinnost by se jinak dala obejít: zahrát Pivo, aby vynucený Salón
    // přestal jít zahrát; zahrát jiný Bang! a vyčerpat jím limit (s Volcanicem se druhý
    // Bang! zahraje až PO tom vynuceném); nebo si kartu prostě odhodit schopností
    // (Sid Ketchum, Doc Holyday, José Delgado, Uncle Will, „odhoď další kartu").
    // `card` = karta hraná Z RUKY; null (schopnost postavy, aktivace zelené karty ze
    // stolu) je zamčené vždycky – i zelený bang-efekt by jinak vyčerpal limit Bang!.
    // Zrcadlo pro klienta i bota: lawLocksOther / cardPlayability v core/playability.js.
    _lawLocked(playerIdx, card = null) {
        const forced = this._lawForced(playerIdx);
        if (!forced) return false;
        return !card || card.id !== forced.card.id;
    },

    // Musí vynucený Bang! (nebo bang-efekt) letět SÁM NA SEBE? Jen když hráč na nikoho
    // jiného nedosáhne – jinak by se povinnost nedala splnit. Trychtýř na sdílený helper.
    _lawSelfShootOnly(playerIdx, card) {
        const p = this.players[playerIdx];
        return !!p && lawSelfShootOnly(this, p, playerIdx, card);
    },

    // ── Peyote: „Místo lízání hádej barvu vrchní karty; uhodneš – ber a hádej dál." ─
    // Nahrazuje CELOU fázi lízání včetně postav, které si ji upravují (Kit Carlson,
    // Jesse Jones, Pedro Ramirez, Pat Brennan, Black Jack, Claus) – ptáme se proto
    // hned v `startDrawPhase`, ještě před jejich větvemi. Počet karet se neřeší vůbec:
    // líže se, dokud hráč hádá, takže Žízeň ani Příjezd vlaku (High Noon) nic nemění.
    // Vrací true → fáze lízání se rozjela po svém a volající už nic nestaví.
    startPeyote() {
        if (!this.hasEvent('PEYOTE')) return false;
        const player = this.getCurrentPlayer();
        player.bangsPlayedThisTurn = 0;
        // drawPhaseState existuje jen kvůli _finishDraw (isStartOfTurn → Želízka, Ranč)
        // a proto, že se ho ptá spousta míst; `active: false` schová klikatelný balíček –
        // hádá se tlačítky, ne klikem na hromádku.
        this._setDrawPhase({
            active: false,
            playerIdx: this.currentPlayerIndex,
            cardsNeeded: 0,
            cardsDrawn: 0,
            options: [],
            isStartOfTurn: true,
            isPeyote: true,
        });
        this.pendingPeyote = { playerIdx: this.currentPlayerIndex, guesses: 0 };
        this.phase = "PEYOTE";
        return true;
    },

    // Jeden tip. Vrací { card, red, hit } pro animaci, nebo null (neplatný tip / prázdný
    // balíček i odhoz → fáze prostě skončí).
    peyoteGuess(playerIdx, red) {
        if (this.phase !== "PEYOTE" || !this.pendingPeyote) return null;
        if (this.pendingPeyote.playerIdx !== playerIdx) return null;
        const player = this.players[playerIdx];
        const card = this.deck.draw();
        if (!card) { this._endPeyote(); return null; }
        // ⚠️ JEDINÉ místo v kódu, kde se čte VYTIŠTĚNÁ `card.suit` (jinde vždy _effSuit).
        // Požehnání/Prokletí (High Noon) přebarvuje všechny karty na srdce/piky a hraje
        // se současně s Fistfulem – přes _effSuit by hráč hádal na jistotu a lízl si
        // celý balíček. Jakmile karta dosedne do ruky, přebarvení pro ni platí normálně
        // (_effSuit se počítá až při použití), takže výjimka končí tímhle řádkem.
        const isRed = card.suit === Suits.HEARTS || card.suit === Suits.DIAMONDS;
        const hit = (!!red === isRed);
        this.pendingPeyote.guesses++;
        if (hit) {
            player.hand.push(card);
            player.stats.cardsDrawn++;
            this.drawPhaseState.cardsDrawn++;
            this.logEvent('draw', { who: player.name, source: 'Peyote', cards: [card.name] });
        } else {
            this.deck.discard(card);
            this.logEvent('event', { card: 'Peyote', who: player.name, msg: `netrefil (${card.name})` });
            this._endPeyote();
        }
        return { card, red: !!red, hit };
    },

    _endPeyote() {
        this.pendingPeyote = null;
        this._finishDraw();
    },

    // ── Ranč: „Po fázi lízání smíš odhodit libovolný počet karet a líznout si stejně." ─
    // Volá se z _finishDraw ZA Želízky (High Noon má přednost: nejdřív barva, pak výměna),
    // takže na něj musí navázat i chooseHandcuffsSuit. Vrací true → čeká se na hráče.
    // Kdyby si mezitím vzala slovo fronta odložených akcí (Suzy Lafayette), zůstane hráč
    // pro tenhle tah bez výměny – stejná dohoda jako u Želízek, nikdy ne zaseknutý.
    _startRanch() {
        if (!this.hasEvent('RANC')) return false;
        const p = this.getCurrentPlayer();
        if (!p || !isInPlay(p) || !p.hand.length) return false;
        this.pendingRanch = { playerIdx: this.currentPlayerIndex };
        this.phase = "RANCH";
        return true;
    },

    // `cardIds` = co hráč označil (prázdné pole / nic = přeskočit). Bere se podle ID, ne
    // indexů: ruka se mezi odesláním a doručením mohla přeskládat.
    //
    // Odhoz proběhne naráz, ale karty odlétají do odhozu PO JEDNÉ a v pořadí, v jakém leží
    // v ruce (zleva doprava) – proto se `discarded` řadí podle indexu ve vějíři, ne podle
    // pořadí klikání. Náhradní karty si hráč líže RUČNĚ: nastaví se klasická fáze lízání
    // s `cardsNeeded` = počet odhozených, takže tolikrát klikne na balíček (a domíchání
    // balíčku se odbaví stejnou cestou jako u hokynářství).
    ranchExchange(playerIdx, cardIds) {
        if (this.phase !== "RANCH" || !this.pendingRanch) return null;
        if (this.pendingRanch.playerIdx !== playerIdx) return null;
        const p = this.players[playerIdx];
        const seen = new Set();
        const picked = [];
        (Array.isArray(cardIds) ? cardIds : []).forEach(id => {
            if (seen.has(id)) return;
            const i = p.hand.findIndex(c => c && c.id === id);
            if (i === -1) return;
            seen.add(id);
            picked.push({ i, card: p.hand[i] });
        });
        // Odzadu, ať se indexy během vyndávání neposunou; výsledek pak zleva doprava.
        picked.sort((a, b) => b.i - a.i).forEach(({ i }) => p.hand.splice(i, 1));
        const discarded = picked.slice().reverse().map(x => x.card);
        discarded.forEach(c => this.deck.discard(c));
        this.pendingRanch = null;
        if (!discarded.length) {
            this.phase = "PLAY";
            this.checkSuzyLafayette(p);
            this._processSpecialQueue();
            return { discarded };
        }
        this.logEvent('event', { card: 'Ranč', who: p.name, msg: `mění ${discarded.length} karet` });
        // Není to lízání na začátku tahu (`isStartOfTurn: false`) – Želízka ani Ranč sám
        // se po jeho dokončení znovu neptají, _finishDraw jen vrátí fázi PLAY.
        this._setDrawPhase({
            active: true,
            playerIdx,
            cardsNeeded: discarded.length,
            cardsDrawn: 0,
            options: ['deck'],
            isStartOfTurn: false,
            isRanch: true,
        });
        this.phase = "DRAW";
        return { discarded };
    },

    // ── Pokrevní bratři: „Na začátku svého tahu, před lízáním, smí hráč ztratit ──
    //     1 život a dát ho jinému hráči. Nesmí se tím zabít."
    // Ptá se `startDrawPhase` (logic/draw.js), tedy AŽ ZA kontrolami na Dynamit/Vězení:
    // kdo zůstal ve vězení, tah přeskakuje a nedaruje nic. Vzor je pauza Very Custer –
    // vrací true → fáze lízání se rozjede až po rozhodnutí (resolveBloodBrothers).
    // Nabidne se jen když je co dát (health ≥ 2 – „nesmí se tím zabít") a je komu
    // (R9: cíl musí být ve hře a zraněný; duch Města duchů se léčit smí, proto isInPlay).
    _startBloodBrothers() {
        if (!this.hasEvent('POKREVNI_BRATRI')) return false;
        const p = this.getCurrentPlayer();
        if (!p || !isInPlay(p) || p.health < 2) return false;
        if (p._bbOfferedTurn === this.turnId) return false;   // 1× za tah
        const targets = this._bloodBrothersTargets(this.currentPlayerIndex);
        if (!targets.length) return false;
        this.pendingBlood = { playerIdx: this.currentPlayerIndex, targets };
        this.phase = "BLOOD_BROTHERS";
        return true;
    },

    // Komu se dá život darovat: kdokoli jiný ve hře, kdo má co léčit (R9).
    _bloodBrothersTargets(fromIdx) {
        const out = [];
        this.players.forEach((p, i) => {
            if (i === fromIdx || !isInPlay(p) || p.health >= p.maxHealth) return;
            out.push(i);
        });
        return out;
    },

    // `targetIdx === null` (nebo neplatný cíl) = „Ne, děkuji". Fáze lízání se rozjede
    // v obou případech; `_bbOfferedTurn` zajišťuje, že se nabídka v tomhle tahu nevrátí.
    resolveBloodBrothers(playerIdx, targetIdx) {
        if (this.phase !== "BLOOD_BROTHERS" || !this.pendingBlood) return false;
        if (this.pendingBlood.playerIdx !== playerIdx) return false;
        const give = targetIdx !== null && targetIdx !== undefined &&
                     this.pendingBlood.targets.includes(targetIdx);
        const p = this.players[playerIdx];
        this.pendingBlood = null;
        p._bbOfferedTurn = this.turnId;
        this.phase = "PLAY";
        if (!give) { this.startDrawPhase(); return true; }

        const t = this.players[targetIdx];
        this.logEvent('event', { card: 'Pokrevní bratři', who: p.name, target: t.name });
        // Ztráta jde přes handleDamage BEZ útočníka: Bart Cassidy si za ni lízne,
        // El Gringo nekrade (není komu) a nikdo za případnou smrt nedostane odměnu.
        // Zabít se tím nejde – nabídka se dělá jen od 2 životů výš.
        this.handleDamage(playerIdx, null);
        this._heal(t, 1);
        // Zranění mohlo do fronty přidat odloženou akci (Bart Cassidy). Ta musí doběhnout
        // dřív, než se rozjede fáze lízání – frontu je proto nutné nejdřív pročistit
        // (viz „nejdřív doběhne efekt zahrané karty" v CLAUDE.md).
        this._pruneSuzyQueue();
        if (this.specialActionQueue.length > 0) {
            this._startDrawAfterQueue = true;
            this._processSpecialQueue();
            return true;
        }
        this.startDrawPhase();
        return true;
    },

    // ── Fistful of Cards: „Na začátku svého tahu je hráč zasažen tolika kartami ──
    //     Bang!, kolik má karet v ruce."
    // Krok 5 startu tahu (`_runBeginTurn` v logic/highNoon.js). Zásahy jdou po jednom
    // přes obyčejné vyhodnocení Bang! (`_beginBangResolution` bez útočníka), takže Barel,
    // Vedle!, zelené Vedle! i Pivo na posledním životě fungují na každý z nich zvlášť.
    // Bez útočníka navíc `effectiveCharacter(undefined)` vrací null → Slab ani Belle Star
    // se nechytnou a El Gringo nekrade (stejně jako u dynamitu).
    //
    // Krokovač startu tahu se po každém zásahu vrací SEM (`_beginTurnStep--`), takže se
    // další zásah pošle hned, jak ten předchozí doběhne – viz `_afterFistfulHit`.
    _fistfulHits() {
        if (!this.pendingFistful) {
            if (!this.hasEvent('FISTFUL_OF_CARDS')) return false;
            const p = this.getCurrentPlayer();
            // Ducha (Město duchů) se karta netýká (R10); prázdná ruka = žádný zásah.
            if (!p || p.health <= 0 || p._ghost || !p.hand.length) return false;
            // Počet zásahů se ZMRAZÍ na začátku – hraním Vedle! se ruka zmenšuje.
            this.pendingFistful = { playerIdx: this.currentPlayerIndex, hitsLeft: p.hand.length };
            this.logEvent('event', { card: 'Fistful of Cards', who: p.name, msg: `${p.hand.length}× Bang!` });
        }
        const pf = this.pendingFistful;
        const target = this.players[pf.playerIdx];
        if (this.winner) { this.pendingFistful = null; return true; }
        // Smrt uprostřed série → zbytek zásahů se zahodí a tah se posune. Nejde použít
        // _autoEndTurnPending: handlePlayerDeath ho nastavuje jen ve fázi PLAY/DRAW,
        // kdežto zásah dopadl ve fázi RESPOND (stejný důvod má i takeDynamiteHit).
        if (!isInPlay(target)) {
            this.pendingFistful = null;
            this.nextTurn();
            return true;
        }
        if (pf.hitsLeft <= 0) { this.pendingFistful = null; return false; }
        pf.hitsLeft--;
        this._beginTurnStep--;   // po vyřízení zásahu se krokovač vrátí sem
        this._beginBangResolution(null, pf.playerIdx, false, 'Fistful of Cards');
        return true;
    },

    // Jeden ze série zásahů doběhl (uhnul / schytal / zachránil ho Barel nebo Pivo).
    // Volá se ze všech tří míst, kde se obyčejný Bang! uzavírá – vrací true, když si
    // pokračování vzala na starost tahle cesta (volající pak už nesmí sahat na frontu).
    _afterFistfulHit() {
        if (!this.pendingFistful) return false;
        // Fronta odložených akcí (Bart Cassidy za ztracený život, Suzy s prázdnou rukou)
        // musí doběhnout dřív než další zásah; dojede přes _resumeBeginTurnAfterQueue.
        // Pročistit ji je nutné DŘÍV, než se podle její délky rozhoduje (viz CLAUDE.md).
        this._pruneSuzyQueue();
        if (this.specialActionQueue.length > 0) {
            this.phase = "PLAY";
            this._resumeBeginTurnAfterQueue = true;
            this._processSpecialQueue();
            return true;
        }
        this._resumeBeginTurn();
        return true;
    },

    // ── Ruská ruleta: „Počínaje šerifem každý odhodí kartu Vedle!; první, kdo ──
    //     nemůže, ztrácí 2 životy a efekt končí."
    // Okamžitý efekt při příchodu karty do hry (krok 3 startu tahu, `_runBeginTurn`
    // v logic/highNoon.js) – vrací true, takže se start tahu pozastaví, dokud kolečko
    // nedoběhne. Kolečko se OPAKUJE dokola, dokud někdo neselže; pořadí je po směru
    // od šerifa (ve hře pro 3 od pomocníka, `_firstPlayerIndex`), i při Zlaté horečce –
    // efekty karet jdou vždy po směru (FAQ H3). Duch (Město duchů) se neúčastní (R10).
    _startRoulette() {
        const n = this.players.length;
        const from = this._firstPlayerIndex();
        const order = [];
        for (let k = 0; k < n; k++) {
            const idx = (from + k) % n;
            const p = this.players[idx];
            if (p && p.health > 0 && !p._ghost) order.push(idx);
        }
        if (!order.length) return false;
        this.pendingRoulette = { playerIdx: null, order, pos: -1 };
        this.logEvent('event', { card: 'Ruská ruleta', order: order.map(i => this.players[i].name) });
        return this._advanceRoulette();
    },

    // Co se počítá za „kartu Vedle!" rozhoduje sdílený helper z core/playability.js –
    // tím samým se ptá klient (zvýraznění) i bot, takže se výčet nemůže rozejít.
    _rouletteValidCard(playerIdx, card, fromBoard) {
        return rouletteDiscardable(this, this.players[playerIdx], card, fromBoard);
    },

    // Na řadu jde další hráč v kolečku. Kdo nemá co odhodit, schytá 2 zásahy a efekt
    // končí – zásahy se klikají po jednom stejnou cestou jako výbuch dynamitu
    // (`pendingDynamiteDamage`), takže záchrana Pivem i Sidem Ketchumem, guard, klient
    // i bot fungují beze změny; liší se jen `resume`, tedy kam se pak pokračuje.
    // Vrací vždy true – start tahu se v obou případech pozastaví.
    _advanceRoulette() {
        const pr = this.pendingRoulette;
        if (!pr) return false;
        // Kolečko dokola: hráče mimo hru (mohl mezitím odejít) přeskoč, jinak by se
        // čekalo na klik, který nikdo neudělá.
        for (let tries = 0; tries < pr.order.length; tries++) {
            pr.pos = (pr.pos + 1) % pr.order.length;
            const idx = pr.order[pr.pos];
            const p = this.players[idx];
            if (!p || p.health <= 0) continue;
            if (!rouletteHasCard(this, p)) {
                this.pendingRoulette = null;
                this.logEvent('event', { card: 'Ruská ruleta', who: p.name, msg: 'nemá Vedle! → −2 životy' });
                this.pendingDynamiteDamage = { playerIdx: idx, hitsLeft: 2, source: 'ROULETTE', resume: 'BEGIN_TURN' };
                this.phase = "DYNAMITE_DAMAGE";
                return true;
            }
            pr.playerIdx = idx;
            this.phase = "ROULETTE_DISCARD";
            return true;
        }
        // U stolu nezbyl nikdo, kdo by mohl pokračovat – efekt prostě skončí.
        this.pendingRoulette = null;
        return false;
    },

    // Kolečko pokračuje dalším hráčem. Když už není kdo (všichni účastníci mezitím
    // odešli ze hry), dotoč start tahu – jinak by fáze zůstala viset bez `pendingRoulette`,
    // tedy s `pendingActor === null`, a nešlo by na ni kliknout.
    _continueRoulette() {
        if (!this._advanceRoulette()) this._resumeBeginTurn();
    },

    // Hráč odhodil kartu. `fromBoard` = zelená Vedle!-karta ze stolu, jinak karta z ruky
    // (podle ID – ruka se mezi klikem a doručením mohla přeskládat). Vrací odhozenou
    // kartu pro animaci, nebo null u neplatného kliku (výběr se pak NEposune dál).
    //
    // Karta se odhazuje, nehraje – její VLASTNÍ efekt (líznutí za Úhyb nebo Bibli) se
    // tedy nespustí. Schopnosti postav vázané na odhoz karty z ruky ale platí a musí
    // doběhnout HNED, ještě než se kolečko posune dál:
    //   • Suzy Lafayette – „jakmile nemá v ruce karty, hned si jednu lízne", takže do
    //     dalšího kola nastupuje zase s kartou (jinak by na svoji schopnost doplatila),
    //   • Molly Stark – „kdykoli zahraje NEBO ODHODÍ kartu z ruky mimo svůj tah, lízne si"
    //     (proto jen z ruky, ne u zelené karty ze stolu).
    // Obojí je klikací líznutí ve frontě odložených akcí; na řadu jde další hráč až po ní
    // (`_advanceRouletteAfterQueue`, viz _resumeAfterSpecial v logic/characters.js).
    rouletteDiscard(playerIdx, opts = {}) {
        if (this.phase !== "ROULETTE_DISCARD" || !this.pendingRoulette) return null;
        if (this.pendingRoulette.playerIdx !== playerIdx) return null;
        const p = this.players[playerIdx];
        if (!p) return null;
        const fromBoard = !!opts.fromBoard;
        const src = fromBoard ? p.board : p.hand;
        const i = src.findIndex(c => c && c.id === opts.cardId);
        if (i === -1) return null;
        const card = src[i];
        if (!this._rouletteValidCard(playerIdx, card, fromBoard)) return null;

        src.splice(i, 1);
        this.deck.discard(card);
        this.logEvent('event', { card: 'Ruská ruleta', who: p.name, msg: `odhazuje ${card.name}` });
        this.checkSuzyLafayette(p);
        if (!fromBoard) this._mollyPlayedOutOfTurn(playerIdx, false);
        const boardIdx = fromBoard ? 1 + i : null;
        // Frontu je nutné pročistit DŘÍV, než se podle její délky rozhoduje – jinak by
        // `length > 0` prošlo, `_processSpecialQueue` by nic nerozeběhlo a kolečko by se
        // nikdy neposunulo (viz „nejdřív doběhne efekt zahrané karty" v CLAUDE.md).
        this._pruneSuzyQueue();
        if (this.specialActionQueue.length > 0) {
            this._advanceRouletteAfterQueue = true;
            this._processSpecialQueue();
        } else {
            this._continueRoulette();
        }
        return { card, fromBoard, boardIdx };
    },

    // ── Vendeta: „Na konci svého tahu hráč sejme kartu: při ♥ hraje ještě jeden ──
    //     tah. V jednom tahu jen jednou."
    // Gate úplně nahoře v `nextTurn` (logic.js). Sejmutí jde existující cestou
    // CHECK_DRAW → CHECKING → `_applyCheckResult`, takže se zdarma veze i Lucky Duke,
    // klientská cinematika odkrytí i větev bota. `_vendettaDone` se nastaví hned tady:
    // „jen jednou za tah" pak platí i pro tah navíc (nový tah, ale týž hráč) a nemůže
    // vzniknout smyčka. Nuluje ho až přechod na jiného hráče (nextTurn).
    // Ukončení tahu smrtí Vendetu nespouští (hráč už není ve hře).
    _vendettaCheck() {
        if (!this.hasEvent('VENDETA') || this._vendettaDone || this.winner) return false;
        const p = this.getCurrentPlayer();
        if (!p || !isInPlay(p)) return false;
        this._vendettaDone = true;
        this.pendingCheckDraw = {
            active: true,
            playerIdx: this.currentPlayerIndex,
            dynamiteIdx: null,
            jailIdx: null,
            reason: 'VENDETTA',
        };
        this.phase = "CHECK_DRAW";
        return true;
    },

    // ♥ padlo → týž hráč hraje ještě jeden tah. Je to plnohodnotný tah: nové `turnId`
    // (zelené karty jdou zase aktivovat), znovu celý start tahu i kontroly na Dynamit
    // a Vězení – včetně dynamitu, který si hráč vyložil v první půlce tahu (R6).
    // `_extraTurn` jen zajistí, že se NEodkryje nová událost (R6) a nezapočítá se kolo.
    // Duch (Město duchů) si tím zahraje znovu jako duch: ruku odhodil už v tryEndTurn
    // (limit = 0 životů), `_ghost` mu zůstal a `_teardownGhost` se nespustil (R10).
    _vendettaExtraTurn() {
        this.turnId = (this.turnId || 0) + 1;
        this._extraTurn = true;
        const p = this.getCurrentPlayer();
        this.logEvent('event', { card: 'Vendeta', who: p?.name, msg: 'hraje ještě jeden tah' });
        this.phase = "PLAY";
        if (this._beginTurn()) return;
        this.handleStartOfTurnChecks();
    },

    // ── Odstřelovač: „Hráč smí ve svém tahu odhodit 2 karty Bang! najednou ──────
    //     proti jinému hráči: ten se ubrání jen dvěma kartami Vedle!."
    // Recykluje se „odhoď další kartu" z Dodge City: hráč zvolí cíl (startSniper), pak
    // ve fázi DISCARD_ANOTHER zaplatí druhou kartou Bang! (discardAnotherCard) a teprve
    // pak se útok spustí. Klient, bot i guard tím fungují beze změny.
    //
    // `cardIndex` = první karta Bang! v ruce, `targetIdx` = cíl. Neplatný pokus je tichý
    // no-op (stejně jako startDiscardExtra) – klient ani bot ho podle sniperOffer nenabídnou.
    startSniper(cardIndex, targetIdx) {
        if (this.phase !== "PLAY") return;
        const pIdx = this.currentPlayerIndex;
        const player = this.getCurrentPlayer();
        const card = player?.hand[cardIndex];
        if (!card) return;
        // Jediný zdroj pravdy sdílený s klientem i botem (core/playability.js): aktivní
        // událost, moje fáze PLAY, druhá karta Bang! v ruce, volný limit, Kazatel, Želízka
        // i Právo západu. Cíl se pak ověřuje zvlášť (dostřel + je vůbec ve hře).
        if (!sniperOffer(this, player, pIdx, card)) return;
        const target = this.players[targetIdx];
        if (!target || targetIdx === pIdx || !isInPlay(target)) return;
        if (!computeCanHit(this, pIdx, targetIdx)) return;

        this.pendingDiscardAnother = {
            playerIdx: pIdx,
            mainCardId: card.id,
            effect: 'sniper',
            target: { targetIdx },
        };
        this.phase = "DISCARD_ANOTHER";
    },

    // Je tahle karta platnou „cenou" Odstřelovače? Ptá se jí discardAnotherCard
    // (logic/dodgeCity.js) – neplatný klik se ignoruje, aby se hráči nespotřebovala
    // karta, kterou platit nesmí. Stejný výčet používá klient i bot.
    _sniperPayValid(playerIdx, card) {
        return bangCardFromHand(this, this.players[playerIdx], playerIdx, card);
    },

    // Obě karty Bang! jsou zaplacené (leží v odhozu) → útok. Bez barelového checku (R4):
    // ubránit se lze VÝHRADNĚ dvěma kartami Vedle!, Barel ani Jourdonnais nepomůžou.
    // Do limitu se počítá jako JEDNO zahrání Bang! (R4).
    _sniperAttack(playerIdx, targetIdx, mainCard, extraCard) {
        const attacker = this.players[playerIdx];
        const target = this.players[targetIdx];
        const done = () => { this.phase = "PLAY"; this._processSpecialQueue(); };
        if (!attacker || !target || targetIdx === playerIdx || !isInPlay(target)) { done(); return; }

        attacker.bangsPlayedThisTurn++;
        attacker.stats.bangsFired++;
        this.currentAttacker = playerIdx;
        this.logEvent('event', { card: 'Odstřelovač', who: attacker.name, target: target.name });

        // Apache Kid: útok je složený ze DVOU karet, takže ho mine jen tehdy, když jsou
        // kárové obě – jinak ta druhá dopadne (a bránit se pak stejně musí dvěma Vedle!).
        const bothDiamonds = this._effSuit(mainCard) === Suits.DIAMONDS &&
                             this._effSuit(extraCard) === Suits.DIAMONDS;
        if (bothDiamonds && this._apacheImmune(targetIdx, Suits.DIAMONDS, playerIdx)) { done(); return; }

        this.missesPlayed = 0;
        this.waitForMissed(targetIdx, playerIdx, CardType.BANG, false, 'Odstřelovač');
        // Až ZA waitForMissed – ta si missesRequired nastavuje podle Slaba (taky 2).
        this.missesRequired = 2;
        this._processSpecialQueue();
    },

    // ── Odražená střela: „Hráči smí hrát karty Bang! proti kartám vyloženým ─────
    //     před ostatními hráči. Zasažený hráč smí kartu zachránit kartou Vedle!,
    //     jinak je karta odhozena."
    // Chová se jako normální Bang! (R3), takže se beze zbytku recykluje
    // `_beginBangResolution`: Barel i Jourdonnais mohou kartu zachránit, Slab vyžaduje
    // 2× Vedle! a kárová střela na Apache Kida nemá efekt. Navíc se protáhne jen
    // `ricochet` – podle něj se ve chvíli „hráč neuhnul" místo zásahu zničí cílová karta.
    // Do limitu 1× Bang!/tah se to NEpočítá (R2).
    //
    // `area` = 'weapon' | 'board', `cardId` = konkrétní karta (ne index – stůl se mohl
    // mezi klikem a doručením přeskládat).
    playRicochet(attackerIdx, targetIdx, area, cardId, cardIdx) {
        if (this.phase !== "PLAY" || attackerIdx !== this.currentPlayerIndex) return;
        const attacker = this.players[attackerIdx];
        const card = attacker?.hand[cardIdx];
        if (!card || card.id == null) return;
        if (!ricochetOffer(this, attacker, attackerIdx, card)) return;
        if (!ricochetTargetOk(this, attackerIdx, targetIdx)) return;

        const target = this.players[targetIdx];
        const hit = area === 'weapon'
            ? ((target.weapon && target.weapon.id !== -1 && target.weapon.id === cardId) ? target.weapon : null)
            : (target.board || []).find(c => c && c.id === cardId) || null;
        if (!hit) return;

        attacker.stats.bangsFired++;
        this._trackCard(attackerIdx, card.type);
        this.logEvent('bang', { who: attacker.name, target: target.name, card: `Odražená střela → ${hit.name}` });
        this.deck.discard(attacker.hand.splice(cardIdx, 1)[0]);
        this.currentAttacker = attackerIdx;
        this.checkSuzyLafayette(attacker);

        // Apache Kid: kárový Bang! na něj nemá efekt ani přes Odraženou střelu (R3).
        if (this._apacheImmune(targetIdx, this._effSuit(card), attackerIdx)) {
            this.phase = "PLAY";
            this._processSpecialQueue();
            return;
        }

        this._beginBangResolution(attackerIdx, targetIdx, false, card.name,
            { targetIdx, area, cardId: hit.id });
        this._processSpecialQueue();
    },

    // Hráč se neubránil → cílová karta jde do odhozu. Dohledává se podle ID, ne indexu:
    // mezi zahráním střely a koncem obrany se stůl mohl přeskládat (Suzy, Molly…).
    // Zasažené Vězení hráče osvobodí, sestřelená zbraň se vrací na Colt .45 – obojí
    // vyplyne samo z toho, že karta prostě zmizí ze stolu.
    _ricochetDestroy(ric) {
        if (!ric) return;
        const p = this.players[ric.targetIdx];
        if (!p) return;
        let card = null, visBoardIdx = 0;
        if (ric.area === 'weapon') {
            if (p.weapon && p.weapon.id !== -1 && p.weapon.id === ric.cardId) {
                card = p.weapon;
                p.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
            }
        } else {
            const i = (p.board || []).findIndex(c => c && c.id === ric.cardId);
            if (i !== -1) { card = p.board.splice(i, 1)[0]; visBoardIdx = 1 + i; }
        }
        if (!card) return;
        this.deck.discard(card);
        // Vizuální slot v konvenci „slot 0 = zbraň" (stejně jako u dynamitu/vězení).
        this.lastAnimEvent = { type: 'board_to_discard', fromPlayerIdx: ric.targetIdx,
                               cardId: card.id, boardIdx: visBoardIdx };
        this.logEvent('event', { card: 'Odražená střela', who: p.name, msg: `přišel o ${card.name}` });
    },

    // ── Mrtvý muž: „Hráč vyřazený jako první se ve svém tahu vrací se 2 životy ──
    //     a 2 kartami."
    // Kdo se vrací (nebo -1). Ptá se tím `nextTurn` (logic.js), aby ho v pořadí
    // NEPŘESKOČILA, i krok 0 startu tahu. Návrat je jednorázový (`_deadManUsed`).
    _deadManReturnIdx() {
        if (!this.hasEvent('MRTVY_MUZ') || this._deadManUsed) return -1;
        const i = this._firstDeadIdx;
        if (i === null || i === undefined) return -1;
        return (this.players[i] && this.players[i].health <= 0) ? i : -1;
    },

    // Krok 0 startu tahu – schválně PŘED odkrytím událostí: hráč musí být zpátky ve hře
    // dřív, než na něj dopadne Pravé poledne nebo Fistful of Cards. Vrací se natrvalo,
    // ne jako duch (test na návrat je proto v nextTurn dřív než `_ghost`).
    // Dvě karty si líže RUČNĚ (klikáním na balíček) přes existující frontu KILL_REWARD;
    // start tahu se dotočí až po ní (`_resumeBeginTurnAfterQueue`).
    _deadManReturn() {
        const idx = this._deadManReturnIdx();
        if (idx === -1 || idx !== this.currentPlayerIndex) return false;
        const p = this.players[idx];
        this._deadManUsed = true;
        p._ghost = false;
        p.health = Math.min(2, p.maxHealth);
        this.logEvent('event', { card: 'Mrtvý muž', who: p.name, msg: 'vrací se do hry se 2 životy' });
        this.checkWinCondition();
        if (this.winner) return true;
        this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: idx, cardsNeeded: 2 });
        this.phase = "PLAY";
        this._resumeBeginTurnAfterQueue = true;
        this._processSpecialQueue();
        return true;
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FistfulMixin;
} else {
    Object.assign(GameState.prototype, FistfulMixin);
}
})();
