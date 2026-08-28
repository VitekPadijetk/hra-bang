// logic/wildWest.js — mixin GameState: rozšíření Divoký západ (Wild West Show).
// TŘETÍ balíček událostí. Hraje se současně s High Noonem i Fistfulem, ale otáčí se
// úplně jinak: událost NEODKRÝVÁ šerif na začátku kola, nýbrž kdokoli, kdo zahraje
// Dostavník nebo Wells Fargo (hák v `playCard`, logic/play.js). Na začátku hry proto
// žádná událost tohoto balíčku neplatí. Karta „Divoký západ" leží vespod balíčku
// (jako Pravé poledne v HN a Fistful of Cards v FF) – přijde poslední a už se nemění.
//
// Stav je vedle obou předchozích, ne místo nich (stejné rozhodnutí jako u Fistfulu –
// nesahat na hotové):
//   High Noon     → eventDeck / eventPile / activeEvent   / _eventEntering
//   Fistful       → ffDeck    / ffPile    / activeFistful / _ffEntering
//   Divoký západ  → wwsDeck   / wwsPile   / activeWws     / _wwsEntering
// Slévají se jen v `hasEvent` (logic/highNoon.js) a `eventActive` (core/highNoon.js),
// takže se všechna pravidla ptají pořád stejně a klíče karet jsou napříč balíčky unikátní.
//
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {

// Karta, která se při přípravě dává vespod balíčku → odkryje se jako poslední a platí
// do konce hry (dalším Dostavníkem se už nevyměňuje).
const LAST_WWS_KEY = 'DIVOKY_ZAPAD';

const WildWestMixin = {
    // ── Příprava balíčku (setupGame / setupDebugGame / setupNextGame) ──────────
    // Bez zapnutého rozšíření zůstane balíček prázdný a `hasEvent` vrací pro jeho klíče
    // vždy false, takže jsou všechny háky v pravidlech no-op.
    _setupWwsDeck(options = {}) {
        this.wwsDeck = [];
        this.wwsPile = [];
        this.activeWws = null;
        this._wwsEntering = null;
        const on = options.expansions && options.expansions.divoky_zapad;
        if (!on || !Array.isArray(this.wwsCardData)) return;

        const pool = this.wwsCardData
            .map(c => ({ id: c.id, key: c.key, name: c.name, art: c.art, text: c.text || null }));
        const last = pool.filter(c => c.key === LAST_WWS_KEY);
        const rest = pool.filter(c => c.key !== LAST_WWS_KEY);
        this.deck.shuffleArray(rest);
        // Líže se přes pop() z konce pole → Divoký západ musí ležet na indexu 0.
        this.wwsDeck = last.concat(rest);
        this.logEvent('system', { msg: `Divoký západ: balíček událostí (${this.wwsDeck.length} karet)` });
    },

    // Odkrytí karty z balíčku Divokého západu. Volá se z `playCard` (logic/play.js) při
    // zahrání Dostavníku nebo Wells Farga, PŘED nastavením fáze lízání – efekt karty se
    // čte nahlas hned a některé karty mění to, co hráč vzápětí uvidí a smí zahrát.
    //
    // Vrací true, když se hra musí na vyhodnocení nově příchozí karty pozastavit
    // (zatím žádná taková není – Helena Zontero přibude ve své fázi).
    //
    // Volající, kteří kartu otáčet NESMÍ:
    //  – Krytý vůz (Dodge City) má vlastní CardType, takže sem vůbec nepřijde (FAQ Q16),
    //  – zopakování Dostavníku/Wells Farga Lee Van Kliffem posílá `repeat` (Sciarra Q19).
    _flipWwsEvent(playerIdx, opts = {}) {
        if (opts.repeat) return false;
        if (!this.wwsDeck || !this.wwsDeck.length) return false;
        // Divoký západ (karta vespod) zůstává v platnosti do konce hry a nevyměňuje se.
        if (this.activeWws && this.activeWws.key === LAST_WWS_KEY) return false;
        // Sacagaway (odkryté ruce) mění REDAKCI stavu, ne pravidla – její příchod i odchod
        // je proto pro klienta předěl, na kterém se všechny cizí vějíře plynule přetočí.
        // Označí se tady, emituje `flushSacaFlip` před broadcastem (server/anim.js) –
        // stejný vzor jako `_pendingWwsReveal`.
        const sacaBefore = this.hasEvent('SACAGAWAY');
        this.activeWws = this.wwsDeck.pop();
        // Odkryté karty zůstávají ležet na sobě (nová překryje předchozí) – klient z nich
        // kreslí hromádku lícem nahoru. `activeWws` je vrchní karta hromádky.
        this.wwsPile.push(this.activeWws);
        this._wwsEntering = this.activeWws.key;
        this._pendingWwsReveal = Object.assign({}, this.activeWws,
            { deck: 'wws', remaining: this.wwsDeck.length, playerIdx });
        this.logEvent('event', { card: this.activeWws.name, left: this.wwsDeck.length });
        const sacaAfter = this.hasEvent('SACAGAWAY');
        if (sacaBefore !== sacaAfter) this._pendingSacaFlip = { open: sacaAfter };
        return this._applyWwsEventOnEnter();
    },

    // Efekty, které se vyhodnotí JEDNOU při příchodu karty do hry. Na rozdíl od High Noonu
    // a Fistfulu to NEBĚŽÍ v krokovači startu tahu – karta přichází uprostřed cizí fáze 2.
    // Vrací true, když se čeká na rozhodnutí hráče (zatím nikdy; Helena Zontero přibude
    // ve své fázi).
    _applyWwsEventOnEnter() {
        const key = this._wwsEntering;
        this._wwsEntering = null;
        if (!key) return false;
        return false;
    },

    // ── Miláček Valentýn ──────────────────────────────────────────────────────
    // „Na začátku svého tahu odhodí každý hráč všechny karty z ruky a stejný počet karet
    // si dobere z balíčku." Poznámka v pravidlech: běžná fáze lízání proběhne normálně
    // ZA tím („players then also draw the usual 2 cards"), takže je to výměna NAVÍC.
    //
    // Je to POSLEDNÍ krok krokovače startu tahu (_runBeginTurn, logic/highNoon.js), ale
    // pořád ještě PŘED kontrolami na Dynamit/Vězení: hráč má do sejmutí jít s novou rukou
    // (mohl si vyměnit Pivo, kterým se před dynamitem zachrání).
    //
    // Náhradní karty si líže RUČNĚ klikáním na balíček – nastaví se klasická fáze lízání,
    // takže se domíchání balíčku odbaví úplně stejnou cestou jako u kteréhokoli jiného
    // lízání. `isStartOfTurn: false` je nutné hned dvakrát:
    //   • Želízka (High Noon) ani Ranč (Fistful) se u téhle fáze ptát nesmí – patří ke
    //     SKUTEČNÉ fázi lízání, která přijde až za kontrolami,
    //   • Opuštěný důl (Fistful) se Valentýna nesmí dotknout ani jednou půlkou: odhoz ruky
    //     není fáze 3 (jde do normálního odhozu, ne lícem dolů na balíček) a lízání náhrad
    //     není fáze 1 (bere se z dobíracího balíčku, ne z odhozu – viz _mineDrawCard).
    //
    // Suzy Lafayette se prázdnou rukou neprobudí: posuzuje se až po dokončení efektu
    // („nejdřív doběhne efekt zahrané karty"), a to už má karty zpátky.
    _startValentine() {
        if (!this.hasEvent('MILACEK_VALENTYN')) return false;
        const idx = this.currentPlayerIndex;
        const p = this.players[idx];
        if (!p || !isInPlay(p) || !p.hand.length) return false;
        const n = p.hand.length;
        const discarded = p.hand.splice(0, n);
        // Karty odlétají do odhozu PO JEDNÉ zleva doprava (jako u Ranče) – emit řeší hák
        // před broadcastem (flushValentine, server/anim.js), protože sem se hra dostane
        // z pěti různých cest, ale všechny končí broadcastem.
        this._valentineAnim = { playerIdx: idx, cardIds: discarded.map(c => c.id) };
        discarded.forEach(c => this.deck.discard(c));
        this.logEvent('event', { card: 'Miláček Valentýn', who: p.name, msg: `vyměňuje ${n} karet` });
        this._setDrawPhase({
            active: true,
            playerIdx: idx,
            cardsNeeded: n,
            cardsDrawn: 0,
            options: ['deck'],
            isStartOfTurn: false,
            isValentine: true,
        });
        this.phase = "DRAW";
        return true;
    },

    // ── Madam Zuzana ──────────────────────────────────────────────────────────
    // „Během svého tahu musí každý hráč zahrát alespoň 3 karty. Hráč, který to neudělá,
    // ztrácí 1 život." Počítadlo (`p._playedThisTurn`) plní _trackCard (logic.js) VŽDYCKY,
    // ne jen když karta platí – přijde-li Zuzana uprostřed tahu, počítají se i karty
    // zahrané předtím (FAQ Q02).
    //
    // Gate sedí úplně nahoře v `nextTurn` (logic.js), PŘED Vendetou (Fistful): pořadí na
    // konci tahu je fáze 3 (odhoz nad limit) → Zuzana → Vendeta → nový tah. Do nextTurn
    // se chodí dvěma cestami (tryEndTurn i discardCard), takže by gate v tryEndTurn minul
    // každého, kdo odhazoval.
    //
    // Zásah se KLIKÁ – recykluje se `pendingDynamiteDamage` (jako Ruská ruleta), takže
    // zvýrazněné životy, záchrana Pivem i Sidem Ketchumem, guard, klient i bot fungují
    // beze změny; liší se jen `resume`, tedy kam se pak pokračuje (_afterDamageClicks).
    // Bart Cassidy si za ztracený život lízne, El Gringo nekrade (není útočník).
    _zuzanaPenalty() {
        const p = this.getCurrentPlayer();
        // Vězení: koho tah přeskočil, ten karty hrát nemohl → nepenalizuje se (poznámka
        // v pravidlech). Příznak platí přesně pro tenhle jeden konec tahu, takže se čte
        // a nuluje i tehdy, když se Zuzana zrovna nehraje.
        const skipped = !!(p && p._turnSkippedByJail);
        if (p) p._turnSkippedByJail = false;
        if (!this.hasEvent('MADAM_ZUZANA') || this._zuzanaDone || this.winner) return false;
        if (skipped) return false;
        // Duch (Město duchů) má na konci svého tahu 0 životů (tryEndTurn) – zásah by ho
        // stejně minul, penalizace se ho tedy netýká.
        if (!p || p.health <= 0) return false;
        if ((p._playedThisTurn || 0) >= 3) return false;
        // Nastavit HNED na začátku – stejná past jako u `_vendettaDone`: bez toho by se
        // nextTurn po návratu z kliku zeptal znovu a hráč by platil pořád dokola.
        this._zuzanaDone = true;
        this.logEvent('event', { card: 'Madam Zuzana', who: p.name, msg: `zahrál jen ${p._playedThisTurn || 0} karty → −1 život` });
        this.pendingDynamiteDamage = { playerIdx: this.currentPlayerIndex, hitsLeft: 1, source: 'ZUZANA', resume: 'NEXT_TURN' };
        this.phase = "DYNAMITE_DAMAGE";
        return true;
    },

    // ── Postavy ───────────────────────────────────────────────────────────────

    // Gary Looter: „Bere si všechny karty, které ostatní hráči odhodí nad limit na konci
    // svého tahu." Vrací hráče, kterému karta místo odhozu připadne, nebo null.
    //   • Své vlastní karty si nebere (FAQ Q14) – proto se hledá až od SOUSEDA.
    //   • Víc Garyů (Vera Custer, Greygory Deck): první po směru od odhazujícího (R6).
    //     Směr je vždy po směru hodinových ručiček – Zlatá horečka (High Noon) obrací
    //     jen pořadí tahů (FAQ H3), ne efekty karet.
    //   • Kocovina (High Noon) schopnost vypíná – dotaz proto jde přes effectiveCharacter.
    //   • Mrtvý Gary nebere; duch (Město duchů) ve hře JE, takže bere (isInPlay).
    // Volá se JEN z discardCard (fáze 3 = odhoz nad limit na konci tahu). Odhoz mimo něj
    // (Ruská ruleta, cena „odhoď další kartu", Daltonové, Sid Ketchum) se Garyho netýká.
    _garyLooterFor(discarderIdx) {
        const n = this.players?.length || 0;
        for (let k = 1; k < n; k++) {
            const p = this.players[(discarderIdx + k) % n];
            if (p && isInPlay(p) && effectiveCharacter(p) === "Gary Looter") return p;
        }
        return null;
    },

    // ── John Pain ─────────────────────────────────────────────────────────────
    // „Má-li v ruce méně než 6 karet, bere si každou kartu, kterou kdokoli sejme."
    // Karta se NESMÍ použít okamžitě – hráč musí počkat, až doběhne efekt, kvůli kterému
    // se snímalo (poznámka na kartě: je-li to Pivo a zároveň ztrácíš poslední život,
    // zahrát ho nesmíš). Řeší se to odložením: sejmutí kartu jen ZAPÍŠE (_johnPainQueue)
    // a do ruky se přesune až při pročištění fronty odložených akcí, tedy ve chvíli,
    // kdy je efekt hotový (viz _pruneSuzyQueue → _drainJohnPain).
    //
    // Které sejmutí: Dynamit, Vězení, Barel, Jourdonnais, Lucky Duke (obě karty,
    // Sciarra Q22), Vendeta a barel v Ruské ruletě – tedy všechna, která procházejí
    // check machinerií. NE Peyote (to je fáze lízání, ne sejmutí) a NE Helena Zontero
    // (FAQ Q09 – karta se otáčí automaticky, ne hráčem).
    _johnPainQueueCard(card, drawerIdx) {
        if (!card) return;
        if (!(this.players || []).some(p => p && isInPlay(p) && effectiveCharacter(p) === "John Pain")) return;
        if (!this._johnPainQueue) this._johnPainQueue = [];
        this._johnPainQueue.push({ cardId: card.id, drawerIdx });
    },

    // Komu karta připadne. „Kdokoli" zahrnuje i jeho samotného, takže se hledá od
    // snímajícího VČETNĚ (k = 0); víc Johnů (Vera Custer, Greygory Deck) řeší oficiální
    // FAQ Q11 – bere první po směru od toho, kdo snímal. Limit 6 karet se posuzuje až
    // tady, takže Lucky Dukeovi s 5 kartami v ruce vezme John jen tu první (Q22).
    _johnPainTakerFor(drawerIdx) {
        const n = this.players?.length || 0;
        for (let k = 0; k < n; k++) {
            const p = this.players[(drawerIdx + k) % n];
            if (p && isInPlay(p) && effectiveCharacter(p) === "John Pain" && p.hand.length < 6) return p;
        }
        return null;
    },

    // Přesune zapsané karty z odhozu do ruky. Volá se z _pruneSuzyQueue (logic/characters.js),
    // takže se veze se VŠEMI místy, která frontu odložených akcí pročišťují nebo odbavují,
    // a k tomu z nextTurn/startDrawPhase jako pojistka pro větve, které frontu neberou
    // (Vězení, Vendeta, posun dynamitu). Karta, která už v odhozu není (domíchání balíčku),
    // se prostě přeskočí.
    _drainJohnPain() {
        const list = this._johnPainQueue;
        if (!list || !list.length) return;
        // Rozložený zásah (výbuch dynamitu, Pravé poledne) se kliká po jednom, ale
        // pravidlově je to JEDEN efekt – a jeho zásahy jsou přesně ta chvíle, kdy hráč
        // smí zahrát Pivo na záchranu posledního života (beerLastLifeSave). Kdyby si
        // sejmutou kartu vzal mezi zásahy, mohl by se jí zachránit – přesně to, co
        // poznámka na kartě zakazuje. Zbytek zásahů se tedy počká.
        if (this.pendingDynamiteDamage || this.pendingNoonDamage) return;
        this._johnPainQueue = [];
        list.forEach(e => {
            const taker = this._johnPainTakerFor(e.drawerIdx);
            if (!taker) return;
            const card = this.deck.takeFromDiscard(e.cardId);
            if (!card) return;
            taker.hand.push(card);
            const takerIdx = this.players.indexOf(taker);
            if (!this._johnPainAnim) this._johnPainAnim = [];
            this._johnPainAnim.push({ toPlayerIdx: takerIdx, cardId: card.id });
            this.logEvent('special', { who: taker.name, card: 'John Pain', taken: card.name });
        });
    },

    // ── Youl Grinner ──────────────────────────────────────────────────────────
    // „Než si začne líznout, musí mu každý hráč, který má v ruce víc karet než on, dát
    // jednu kartu podle své volby." Spouští se na začátku JEHO fáze lízání (FAQ Q26),
    // tedy ještě před Peyote, Kitem Carlsonem i vším ostatním, co si lízání přebírá.
    //
    // Množina dávajících se určí JEDNOU, snímkem (R8 / FAQ Q03 „každý z těch hráčů"):
    // jinak by pořadí dávání měnilo, kdo ještě platí. Pořadí je po směru od Youla.
    // Mrtví nedávají; duch (Město duchů) na svém tahu schopnost používá.
    _startGrinner() {
        if (this._grinnerTurn === this.turnId) return false;   // v tomhle tahu už proběhlo
        const idx = this.currentPlayerIndex;
        const me = this.players[idx];
        if (!me || effectiveCharacter(me) !== "Youl Grinner") return false;
        this._grinnerTurn = this.turnId;
        const n = this.players.length;
        const mine = me.hand.length;
        const queue = [];
        for (let k = 1; k < n; k++) {
            const j = (idx + k) % n;
            const p = this.players[j];
            if (p && isInPlay(p) && p.hand.length > mine) queue.push(j);
        }
        if (!queue.length) return false;   // nikdo nemá víc karet → lízání jede normálně
        this.pendingGrinner = { grinnerIdx: idx, queue };
        this.logEvent('special', { who: me.name, card: 'Youl Grinner',
                                   target: queue.map(i => this.players[i].name).join(', ') });
        this.phase = "GRINNER_GIVE";
        return true;
    },

    // Hráč na řadě dal kartu. Vrací { card, handIdx } pro animaci, nebo null u neplatného
    // kliku (fronta se pak NEposune). Karta se DÁVÁ, neodhazuje – Molly Stark si za ni
    // tedy nelíže (její schopnost mluví o zahrání nebo odhození). Suzy Lafayette naopak
    // ano: kdo dal poslední kartu, má prázdnou ruku a hned si líže – a kolečko se posune
    // až po ní (_advanceGrinnerAfterQueue), aby do dalšího kola nastoupila s kartou.
    grinnerGive(playerIdx, cardId) {
        if (this.phase !== "GRINNER_GIVE" || !this.pendingGrinner) return null;
        const pg = this.pendingGrinner;
        if (pg.queue[0] !== playerIdx) return null;
        const p = this.players[playerIdx];
        const grinner = this.players[pg.grinnerIdx];
        if (!p || !grinner) return null;
        const i = p.hand.findIndex(c => c && c.id === cardId);
        if (i === -1) return null;

        const card = p.hand.splice(i, 1)[0];
        grinner.hand.push(card);
        pg.queue.shift();
        this.logEvent('special', { who: p.name, card: 'Youl Grinner', target: grinner.name, taken: card.name });
        this.checkSuzyLafayette(p);
        // Frontu pročisti DŘÍV, než se podle její délky rozhoduje (viz CLAUDE.md) – jinak
        // by `length > 0` prošlo, _processSpecialQueue by nic nerozeběhlo a kolečko by
        // se nikdy neposunulo.
        this._pruneSuzyQueue();
        if (this.specialActionQueue.length > 0) {
            this._advanceGrinnerAfterQueue = true;
            this._processSpecialQueue();
        } else {
            this._advanceGrinner();
        }
        return { card, handIdx: i };
    },

    // Na řadu jde další dávající; když už nikdo nezbyl, pokračuje se fází lízání.
    // Hráče, kteří mezitím odešli ze hry nebo přišli o karty, přeskoč – jinak by se
    // čekalo na klik, který nikdo neudělá.
    _advanceGrinner() {
        const pg = this.pendingGrinner;
        if (!pg) return;
        while (pg.queue.length) {
            const p = this.players[pg.queue[0]];
            if (p && isInPlay(p) && p.hand.length > 0) break;
            pg.queue.shift();
        }
        if (pg.queue.length) { this.phase = "GRINNER_GIVE"; return; }
        this.pendingGrinner = null;
        this.phase = "PLAY";
        // _grinnerTurn drží tenhle tah, takže se schopnost znovu nespustí.
        this.startDrawPhase();
    },

    // ── Flint Westwood ────────────────────────────────────────────────────────
    // „Během svého tahu smí vyměnit 1 kartu z ruky za 2 náhodné karty z ruky jiného
    // hráče." Jednou za tah (FAQ Q16). Svou kartu VYBÍRÁ, cizí jsou NÁHODNÉ; má-li cíl
    // jen jednu kartu, dostane Flint jen jednu (Sciarra Q33). O vzdálenosti karta nemluví,
    // takže dostřel neplatí – cílem smí být kdokoli ve hře.
    //
    // Pořadí operací je kvůli Suzy Lafayette (Sciarra Q32) závazné: nejdřív se cizí karty
    // VEZMOU, pak se dá Flintova, a teprve pak se posuzují prázdné ruce. Suzy, které Flint
    // vybral ruku, tak dostane jeho kartu dřív, než by si stihla líznout – a Flint tu
    // líznutou kartu nedostane.
    //
    // Vrací { taken: [{card, slot}], given } pro animace, nebo null u neplatné akce.
    useFlintWestwood(playerIdx, targetIdx, cardId) {
        if (this.phase !== "PLAY" || this.currentPlayerIndex !== playerIdx) return null;
        const p = this.players[playerIdx];
        if (!p || effectiveCharacter(p) !== "Flint Westwood") return null;
        if (p._flintUsedTurn === this.turnId) return null;
        const t = this.players[targetIdx];
        if (!t || targetIdx === playerIdx || !isInPlay(t) || !t.hand.length) return null;
        const give = p.hand.find(c => c && c.id === cardId);
        if (!give) return null;
        // Fistful – Právo západu: vynucenou kartu schopnost dát pryč nesmí (hráč by se
        // jí zbavil, aniž by ji zahrál). Ruka jinak o jednu zhubne a o dvě povyroste,
        // takže vynucené kartě samotná výměna nijak nehrozí.
        if (this._lawProtected(playerIdx, give)) return null;
        if (this._lawLocked(playerIdx, null, { discards: 1, draws: 2 })) return null;

        p._flintUsedTurn = this.turnId;
        const taken = [];
        for (let k = 0; k < 2 && t.hand.length; k++) {
            const slot = Math.floor(Math.random() * t.hand.length);
            taken.push({ card: t.hand.splice(slot, 1)[0], slot });
        }
        taken.forEach(x => p.hand.push(x.card));
        const gi = p.hand.findIndex(c => c && c.id === cardId);
        const givenSlot = gi;
        p.hand.splice(gi, 1);
        t.hand.push(give);
        this.logEvent('special', { who: p.name, card: 'Flint Westwood', target: t.name,
                                   taken: taken.map(x => x.card.name).join(', ') });
        // Teprve teď (viz Q32 výš). Flintova ruka prázdná být nemůže – vzal si aspoň
        // jednu kartu – takže se posuzuje jen cíl.
        this.checkSuzyLafayette(t);
        this._processSpecialQueue();
        return { taken, given: give, givenSlot };
    },

    // ── Teren Kill ────────────────────────────────────────────────────────────────────
    // „Pokaždé, když by měl být vyřazen, sejme kartu: není-li to pik, zůstává na
    // 1 životě a lízne si kartu."
    //
    // Hák je úplně nahoře v `handlePlayerDeath` (logic/combat.js) – jediný trychtýř
    // vyřazení. Vyřazení se POZASTAVÍ: hráč se místo nuly drží na 1 životě a sejmutí
    // se zařadí do fronty odložených akcí (`TEREN_CHECK`). Držet ho naživu je nutné:
    // jinak by `checkWinCondition` uprostřed nedokončeného vyřazení vyhlásil vítěze
    // a `isInPlay` by ho vyškrtlo ze hry, přestože ještě může přežít.
    //
    // Sejmutí pak jede existující cestou CHECK_DRAW → CHECKING → `_applyCheckResult`
    // (stejně jako Vendeta), takže se zdarma veze Lucky Duke, John Pain, klientská
    // cinematika odkrytí i větev bota.
    //
    // Pivo / Sid Ketchum (FAQ Q18): hráč má na výběr, ale ne obojí. Záchrana se nabízí
    // PŘED zásahem (fáze RESPOND / DYNAMITE_DAMAGE / NOON_DAMAGE, viz beerLastLifeSave);
    // jakmile zásah padne a sejmutí se rozjede, je hráč na 1 životě jen technicky
    // a žádná z těch fází už neběží – Pivo tedy zahrát nejde (věta z pravidel
    // „nepovede-li se sejmutí, nesmíš se zachránit Pivem").
    //
    // Dynamit (FAQ Q12): snímá se JEDNOU. Zbytek zásahů propadá – `takeDynamiteHit`
    // pending nuluje ještě před voláním `handlePlayerDeath`.
    //
    // Duch (Město duchů) umřít nemůže, takže se kontrola nespouští.
    _terenKillCheck(deadIdx, killerArg) {
        const p = this.players[deadIdx];
        if (!p || p._ghost) return false;
        if (this._terenDyingIdx === deadIdx) return false;   // sejmutí padlo na pik → umírá
        if (effectiveCharacter(p) !== "Teren Kill") return false;

        p.health = 1;
        this.pendingTerenKill = { playerIdx: deadIdx, killerArg, phase: this.phase };
        this.specialActionQueue.push({ type: 'TEREN_CHECK', playerIdx: deadIdx });
        this.logEvent('special', { who: p.name, card: 'Teren Kill', msg: 'snímá na vyřazení' });
        return true;
    },

    // Sejmutí doběhlo (volá `_applyCheckResult`). ♠ = vyřazení proběhne doopravdy,
    // cokoli jiného = zůstává na 1 životě a líže si kartu (klikací líznutí ve frontě
    // odložených akcí, stejný vzor jako odměna za zabití).
    _terenKillResult(playerIdx, isSpade) {
        const ptk = this.pendingTerenKill;
        this.pendingTerenKill = null;
        const p = this.players[playerIdx];
        if (!p) return;
        // Kam se hra vrací, až sejmutí (a líznutí za ně) doběhne. Obnovit fázi je nutné
        // PŘED resume (stejně jako v _finishVultureSplit): jinak by si líznutí uložilo
        // přechodné „CHECKING" jako interruptedPhase a hra by v něm uvázla.
        const back = this.interruptedPhase || "PLAY";

        if (!isSpade) {
            p.health = 1;
            this.logEvent('special', { who: p.name, card: 'Teren Kill', msg: 'zůstává na 1 životě' });
            this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx, cardsNeeded: 1 });
            this.phase = back;
            this._resumeAfterSpecial();
            return;
        }

        // ♠ → hráč je opravdu vyřazen. Fáze se na dobu vyřazení vrátí na tu, ve které
        // zásah padl: `handlePlayerDeath` z ní pozná, jestli umřel hráč na tahu
        // (_autoEndTurnPending). `_terenDyingIdx` drží hák vypnutý, ať se sejmutí
        // nespustí podruhé.
        p.health = 0;
        this.phase = ptk?.phase || back;
        this._terenDyingIdx = playerIdx;
        this.handlePlayerDeath(playerIdx, ptk ? ptk.killerArg : undefined);
        this._terenDyingIdx = null;
        this.phase = back;

        // Pokračování naplánované na dobranou frontu počítalo s tím, že hráč žije. Když
        // byl na tahu a je vyřazený, dotáčelo by start tahu mrtvému – tah se místo toho
        // posune (a rozdělaná série zásahů od Fistful of Cards končí).
        if (!isInPlay(this.getCurrentPlayer())) {
            this._resumeBeginTurnAfterQueue = false;
            this._startChecksAfterQueue = false;
            this.pendingFistful = null;
            if (!this._autoEndTurnPending && !this.winner) this._nextTurnAfterQueue = true;
        }
        // Umřel hráč na tahu ve fázi PLAY/DRAW → tah posune server (handleAutoEndTurn),
        // stejně jako u Pravého poledne. Sahat na frontu tady už nesmíme.
        if (this._autoEndTurnPending) return;
        this._resumeAfterSpecial();
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WildWestMixin;
} else {
    Object.assign(GameState.prototype, WildWestMixin);
}
})();
