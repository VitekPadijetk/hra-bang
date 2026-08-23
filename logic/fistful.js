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
