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

// ── Klasifikace indexových polí stavu (Lady Růže z Texasu, viz `_swapSeats`) ──────
// Sedadlo = index do `players`. Klíč, jehož hodnota sedadlo JE:
const SEAT_KEYS = new Set([
    'currentPlayerIndex', 'storePickerIndex', 'currentAttacker',
    'playerIdx', 'targetIdx', 'attackerIdx', 'originatorIdx', 'initialTargetIdx',
    'fromIdx', 'toIdx', 'fromPlayerIdx', 'toPlayerIdx',
    'deadIdx', 'killerIdx', 'drawerIdx', 'grinnerIdx', 'takerIdx', 'discarderIdx',
    'sourceIdx', 'ownerIdx', 'winClaimIdx', 'brawlAttackerIdx', 'commandedIdx',
    '_dorothyOwnerIdx', 'johnPainIdx', 'announcedIdx',
    '_firstDeadIdx', '_deadPlayerIdx', '_deathAnimPlayerIdx', '_mollyDeferredIdx',
    '_terenDyingIdx', '_pendingDeathReveal', '_winClaim3p',
]);
// Klíč, jehož hodnota je POLE sedadel (fronty, pořadí, seznamy):
const SEAT_LIST_KEYS = new Set([
    'responded', 'daltonsQueue', 'brawlQueue', 'queue', 'order', 'pickers',
    '_gagPending', 'visible', 'peek', 'playerIdxs', 'idxs',
]);
// Klíč, který se na sedadlo jen podobá – je to index do JINÉHO pole (stůl, ruka,
// nabídka postav) a přemapovat se nesmí:
const NOT_SEAT_KEYS = new Set([
    'boardIdx', 'fromBoardIdx', 'toBoardIdx', 'visBoardIdx', 'visualBoardIdx',
    'dynamiteIdx', 'jailIdx', 'handIdx', 'cardIdx', 'cardIndex', 'cardIndices',
    'targetCardIdx', 'extraCardIdx', 'charSelectIndex', 'stolenIndex', 'revealIdx',
    'keptIdxs', 'randomIdx', 'randomIndex',
]);
// Podstromy, do kterých se při přemapování vůbec nechodí (viz `_remapSeats`).
const SEAT_SKIP_KEYS = new Set(['players', 'deck', 'storeCards', 'cardData', '_deathAnimData']);

const WildWestMixin = {
    // ── Příprava balíčku (setupGame / setupDebugGame / setupNextGame) ──────────
    // Bez zapnutého rozšíření zůstane balíček prázdný a `hasEvent` vrací pro jeho klíče
    // vždy false, takže jsou všechny háky v pravidlech no-op.
    _setupWwsDeck(options = {}) {
        this.wwsDeck = [];
        this.wwsPile = [];
        this.activeWws = null;
        this._wwsEntering = null;
        // Payloady cinematik přerozdání rolí (Hřbitov / Helena Zontero) patří jedné hře –
        // navazující hra přebírá hráče z předchozí, takže po nich zůstat nesmí.
        this._helenaAnim = null;
        this._roleShuffleAnim = null;
        this._ledgerResetPending = false;
        this.pendingGreygory = null;
        this._greygoryAnim = null;
        this.pendingValentine = null;   // Miláček Valentýn: klikané odhazování ruky
        // Navazující hra přebírá hráče z předchozí – líznutá dvojice Greygoryho Decka
        // patří jedné hře, v té další se líže z čerstvě zamíchaného balíčku postav.
        (this.players || []).forEach(p => { p._greygoryChars = null; });
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
        // Helena Zontero je JEDINÁ karta balíčku s okamžitým efektem při příchodu.
        // Nepozastavuje hru: sejmutí i přerozdání rolí proběhne rovnou (hráč se na nic
        // neptá), takže se vrací false a Dostavník / Wells Fargo pokračuje lízáním.
        if (key === 'HELENA_ZONTERO') this._helenaZontero();
        return false;
    },

    // ── Přerozdání rolí (Hřbitov, Helena Zontero) ─────────────────────────────
    // Společné tělo obou karet: vezmi role uvedených hráčů, zamíchej je a rozdej
    // zpátky týmž hráčům. Míchá se jen od DVOU rolí výš – s jednou není co míchat
    // a role zůstává tam, kde je (u Hřbitova s jediným vyřazeným je to no-op).
    //
    // `opts.visible` = seaty, na jejichž stole karta role LEŽÍ (a klient ji tedy vidí)
    // – u Hřbitova vyřazení hráči, ve hře pro 3 (Město duchů) všichni. Podle toho se
    // pozná, co se má přehrát veřejně (sesbírání → zamíchání → rozdání) a komu se
    // nová role ukáže jen soukromě.
    //
    // Šerif se do výměny nikdy nedostane: jeho maximum životů je o 1 vyšší (core/roles.js),
    // takže by se s rolí musel přepočítat i `maxHealth`. Helena ho vyjímá textem karty,
    // u Hřbitova to nemůže nastat (smrt šerifa hru končí) – vyjímá se pro jistotu, ať
    // to neshodí ani debug hra, ve které se výhra nevyhodnocuje.
    _reshuffleRoles(idxs, opts = {}) {
        const list = (idxs || []).filter(i => this.players[i]);
        if (list.length < 2) return false;
        const roles = list.map(i => this.players[i].role);
        this.deck.shuffleArray(roles);
        list.forEach((i, k) => {
            const p = this.players[i];
            p.role = roles[k];
            // Přerozdaná role je zase TAJNÁ. Redakce stavu (server/rooms.js) se proto
            // ptá výhradně `_roleRevealed`, ne `health <= 0` – jinak by role vyřazených
            // hráčů utekla klientovi hned prvním broadcastem po zamíchání.
            p._roleRevealed = false;
        });
        // Ledger chování (server/ledger.js) je veřejná mapa „kdo na koho útočil" a boti
        // z něj přes core/beliefs.js dedukují skryté role. Přerozdáním se stal nepravdou:
        // bez resetu by bot střílel podle staré mapy. Vlastní reset udělá server v háku
        // před broadcastem (flushRoleShuffle, server/anim.js) – ledger žije na `room`,
        // ne ve stavu hry.
        this._ledgerResetPending = true;
        this._roleShuffleAnim = {
            card: opts.card || null,
            // Všechny seaty, jejichž role se míchá – v tomhle pořadí se pak rozdávají
            // zpátky. Veřejná půlka cinematiky se hraje za VŠECHNY (i za ty, jejichž
            // karta role na stole neleží): karty jim přiletí zpoza okraje jeviště,
            // zamíchají se doprostřed a rozdají zase k nim (bug 61). Bez toho se
            // Helena Zontero v běžné hře neprojevila vizuálně vůbec.
            all: list.slice(),
            visible: (opts.visible || []).filter(i => list.includes(i)),
            // Ve hře pro 3 (Město duchů) leží role lícem nahoru – přerozdají se veřejně
            // a soukromé nahlédnutí nemá smysl.
            peek: this.mode3p ? [] : list.slice(),
        };
        this.logEvent('event', { card: opts.card || 'Role', msg: `přerozdání rolí (${list.length})` });
        return true;
    },

    // ── Hřbitov ───────────────────────────────────────────────────────────────
    // „Na začátku svého tahu se všichni vyřazení hráči vrátí do hry s 1 životem.
    //  Role vyřazených hráčů zamíchejte a rozdejte náhodně."
    //
    // „Svého" je zvratné a patří k podmětu → každý vyřazený se vrací na začátku SVÉHO
    // tahu (přesně jako Mrtvý muž). Návrat je TRVALÝ a OPAKOVATELNÝ – kdo padne znovu,
    // vrátí se zas (Sciarra Q21). Proto `nextTurn` (logic.js) vyřazené nepřeskakuje,
    // dokud karta platí, a duchem (Město duchů) se pod ní nikdo nestává.
    //
    // Je to krok 0b krokovače startu tahu, hned ZA Mrtvým mužem (logic/highNoon.js):
    // ten se vrací se 2 životy a 2 kartami, což je striktně lepší, a je jednorázový.
    //
    // Karta o kartách nemluví → hráč se vrací s prázdnou rukou a líže si až v normální
    // fázi lízání. Vulture Sam / Greg Digger / Herb Hunter se spustili už při původním
    // vyřazení; návrat nespouští nic.
    _boneOrchardReturn() {
        if (!this.hasEvent('HRBITOV')) return false;
        const idx = this.currentPlayerIndex;
        const p = this.players[idx];
        if (!p || p.health > 0) return false;
        // Míchají se role všech, kdo jsou v TENHLE okamžik vyřazení – včetně toho, kdo
        // se právě vrací (R2). Není to jednorázová akce při příchodu karty: při pěti
        // vyřazených se zamíchá čtyřikrát (5, 4, 3 a 2 zbylé role), u poslední už ne.
        const dead = [];
        this.players.forEach((q, i) => {
            if (q && q.health <= 0 && q.role !== 'Sheriff') dead.push(i);
        });
        p._ghost = false;
        p.health = 1;
        this.logEvent('event', { card: 'Hřbitov', who: p.name, msg: 'vrací se do hry s 1 životem' });
        this._reshuffleRoles(dead, { visible: dead, card: 'Hřbitov' });
        // Návrat i přerozdání může výhru zrušit (mrtvý je zpátky ve hře) i způsobit
        // (odpadlík dostal roli bandity).
        this.checkWinCondition();
        return !!this.winner;
    },

    // ── Helena Zontero ────────────────────────────────────────────────────────
    // „Když přijde Helena do hry, otočte vrchní kartu z dobíracího balíčku: jsou-li to
    //  srdce ♥ nebo káry ♦, zamíchejte všechny aktivní role s výjimkou Šerifa a znovu
    //  je náhodně a tajně rozdejte. Každý hráč se podívá na svou novou roli."
    //
    // Karta se otáčí AUTOMATICKY, ne hráčem → Lucky Duke ani John Pain se neuplatní
    // (FAQ Q09, R3). Proto se schválně NEJDE cestou `pendingCheckDraw` (ta oba veze
    // zdarma), ale je to vlastní jednorázové otočení s vlastní animací.
    //
    // Barva se čte přes `_effSuit`, takže Požehnání (vždy ♥) i Prokletí (vždy ♠) platí
    // i tady – na rozdíl od Peyote, které je jedinou výjimkou v celé hře.
    //
    // „Aktivní role" = hráči ve hře (`isInPlay`, tedy i duch) kromě šerifa. Maximum
    // životů se proto nemění: +1 má jen šerif a ten si roli drží.
    _helenaZontero() {
        const card = this.deck.draw();
        if (!card) return false;
        const suit = this._effSuit(card);
        const red = suit === Suits.HEARTS || suit === Suits.DIAMONDS;
        this.deck.discard(card);
        // Karta je veřejná (letí do odhozu) → animace ji smí nést celou.
        this._helenaAnim = { card, red };
        this.logEvent('event', { card: 'Helena Zontero',
                                 msg: `${card.name} → ${red ? 'ČERVENÁ, role se přerozdají' : 'ČERNÁ, nic se neděje'}` });
        if (!red) return false;
        const idxs = [];
        this.players.forEach((q, i) => {
            if (q && isInPlay(q) && q.role !== 'Sheriff') idxs.push(i);
        });
        // Hra pro 3 (Město duchů): šerif u stolu není, takže se míchají všechny tři role –
        // a leží lícem nahoru, takže se přerozdají VEŘEJNĚ.
        this._reshuffleRoles(idxs, { visible: this.mode3p ? idxs : [], card: 'Helena Zontero' });
        // Hra pro 3: nárok „vyřadil jsem osobně svého určeného nepřítele" je po výměně
        // cílů bezpředmětný.
        if (this.mode3p) this._winClaim3p = null;
        this.checkWinCondition();
        return true;
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
    // ODHOZ SE TAKY KLIKÁ – karta po kartě, jako u Ruské rulety (bug 35). Automatika
    // odhodila celou ruku naráz a hráč jen koukal, co mu odletělo; teď má vlastní fázi
    // (`VALENTINE_DISCARD` + `pendingValentine`), ze které se hra hne, až je ruka prázdná.
    // Kolik karet se dolízne, se proto pamatuje předem (`count`) – v okamžiku přechodu
    // do fáze lízání už je ruka nutně prázdná.
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
        this.logEvent('event', { card: 'Miláček Valentýn', who: p.name, msg: `vyměňuje ${n} karet` });
        this.pendingValentine = { playerIdx: idx, count: n };
        this.phase = "VALENTINE_DISCARD";
        return true;
    },

    // Jeden klik = jedna odhozená karta. Odhoz je povinný a bez volby („všechny"), takže
    // se nic nepotvrzuje – klikatelná je celá ruka a fáze skončí sama s poslední kartou.
    // Suzy Lafayette se prázdnou rukou neprobudí: posuzuje se až po dokončení efektu
    // („nejdřív doběhne efekt zahrané karty"), a ten končí až dolízáním náhrad.
    valentineDiscard(playerIdx, cardId) {
        if (this.phase !== "VALENTINE_DISCARD" || !this.pendingValentine) return null;
        if (this.pendingValentine.playerIdx !== playerIdx) return null;
        const p = this.players[playerIdx];
        if (!p) return null;
        const i = p.hand.findIndex(c => c && c.id === cardId);
        if (i === -1) return null;
        const card = p.hand.splice(i, 1)[0];
        this.deck.discard(card);
        if (p.hand.length) return { card, done: false };

        // Ruka je prázdná → náhrady si líže klasickou fází lízání (viz komentář výš).
        const need = this.pendingValentine.count;
        this.pendingValentine = null;
        this._setDrawPhase({
            active: true,
            playerIdx,
            cardsNeeded: need,
            cardsDrawn: 0,
            options: ['deck'],
            isStartOfTurn: false,
            isValentine: true,
        });
        this.phase = "DRAW";
        return { card, done: true };
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

    // ── Lady Růže z Texasu ────────────────────────────────────
    // „Během svého tahu si může každý hráč vyměnit místo s hráčem po své pravici a ten
    //  tak přeskočí svůj nejbližší tah."
    //
    // Nepovinná akce ve fázi PLAY. Kdo je „po pravici", jestli se smí a kolikrát ještě,
    // rozhoduje `roseSwapOffer` (core/playability.js) – tentýž predikát, kterým se ptá
    // klient (tlačítko) i bot, takže se nemají jak rozejít.
    //
    // Vrací { fromIdx, toIdx } pro animaci, nebo null u neplatné akce.
    useLadyRose(playerIdx) {
        if (this.phase !== "PLAY" || this.currentPlayerIndex !== playerIdx) return null;
        const j = roseSwapOffer(this, playerIdx);
        if (j == null) return null;
        const me = this.players[playerIdx];
        const other = this.players[j];
        // Strop „x použití za sebou" (FAQ Q08). Sérii nuluje začátek tahu, ve kterém se
        // předtím neměnilo (`_beginTurn`, logic/highNoon.js).
        this._roseStreak = (this._roseStreak || 0) + 1;
        this._roseUsedThisTurn = true;
        // „…a ten tak přeskočí svůj nejbližší tah." Příznak cestuje s hráčem (prohazují
        // se prvky pole players), takže je jedno, na kterém sedadle skončí.
        other._skipNextTurn = true;
        this.logEvent('event', { card: 'Lady Růže z Texasu', who: me.name, target: other.name,
                                 msg: 'vyměnili si místo' });
        this._swapSeats(playerIdx, j);
        return { fromIdx: playerIdx, toIdx: j };
    },

    // Přeskočí tenhle hráč tah? Dotaz je zároveň spotřebou – příznak platí jednorázově.
    // Volá ho smyčka v `nextTurn` (logic.js) na stejném místě, kde se přeskakují vyřazení:
    // přeskočení je „jako by tam neseděl", takže neproběhne start tahu (a s ním ani
    // sejmutí na Dynamit či Vězení) ani penalizace Madam Zuzany – hráč sice nehrál,
    // ale ani hrát nesměl.
    _roseSkip(p) {
        if (!p || !p._skipNextTurn) return false;
        p._skipNextTurn = false;
        if (isInPlay(p)) {
            this.logEvent('event', { card: 'Lady Růže z Texasu', who: p.name, msg: 'přeskakuje tah' });
        }
        return true;
    },

    // ── Výměna sedadel ────────────────────────────────────────────
    // Sedadlo je v tomhle kódu INDEX do `players`, a spousta stavu je jím klíčovaná.
    // Výměna proto není jen prohození dvou prvků pole: musí se přemapovat každé číslo
    // ve stavu, které sedadlo znamená.
    //
    // Dělá se to OBECNÝM průchodem stavu, ne ručním výčtem polí – na ruční výčet by se
    // při každém dalším pravidle zapomnělo. Každý klíč, který vypadá jako index, musí být
    // v jedné ze tří tabulek výš; že žádný nechybí, hlídá strukturální test
    // (test/wws.seats.test.js), který projde zdrojáky `logic/*`.
    //
    // Druhá pojistka je pravidlová: výměna je povolená JEN ve fázi PLAY bez rozdělaného
    // efektu, takže je většina těch polí prokazatelně prázdná (`pendingResponse`,
    // `pendingSelection`, fronty hromadných útoků…). Přemapovat se doopravdy musí
    // `currentPlayerIndex`, paměť Lee Van Kliffa, čekající pokuty Roubíku, `_firstDeadIdx`
    // (Mrtvý muž) a payloady cinematik – ostatní se veze s nimi.
    _swapSeats(i, j) {
        if (i === j || !this.players[i] || !this.players[j]) return;
        const tmp = this.players[i];
        this.players[i] = this.players[j];
        this.players[j] = tmp;
        const map = (x) => (x === i ? j : (x === j ? i : x));
        this._remapSeats(this, map, new Set());
        // `_deathAnimData` je jediné pole, které je sedadlem KLÍČOVANÉ (ne hodnotou),
        // takže ho obecný průchod minul.
        if (this._deathAnimData) {
            const out = {};
            Object.keys(this._deathAnimData).forEach(k => { out[map(Number(k))] = this._deathAnimData[k]; });
            this._deathAnimData = out;
        }
    },

    // Rekurzivní přemapování. Do `players`/`deck`/`storeCards`/`cardData` se nechodí:
    // hráči ani karty žádné sedadlo nedrží (příznaky jako `_skipNextTurn` cestují
    // s hráčem samy) a jsou to největší kusy stavu.
    _remapSeats(node, map, seen) {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) { node.forEach(v => this._remapSeats(v, map, seen)); return; }
        Object.keys(node).forEach(k => {
            if (SEAT_SKIP_KEYS.has(k)) return;
            const v = node[k];
            if (SEAT_KEYS.has(k)) {
                if (typeof v === 'number') node[k] = map(v);
            } else if (SEAT_LIST_KEYS.has(k)) {
                if (Array.isArray(v)) node[k] = v.map(x => (typeof x === 'number' ? map(x) : x));
            } else {
                this._remapSeats(v, map, seen);
            }
        });
    },

    // ── Roubík ────────────────────────────────────────────────────────────────
    // „Hráči nesmí mluvit (mohou gestikulovat, sténat atd.). Každý kdo promluví, ztrácí
    // 1 život." U stolu se to vynutit nedá, ve hře s chatem ano: odeslání zprávy stojí
    // 1 život. Zpráva se přitom NEZAHAZUJE – karta mluvení zakazuje pod pokutou, ne
    // úplně – a nevaruje se ani nepotvrzuje: karta leží odkrytá na stole a je na hráči,
    // aby věděl, co platí (potvrzovací okno by z vtipu udělalo formulář).
    //
    // Pokuta je ODLOŽENÁ. Chat přichází asynchronně a může trefit libovolnou fázi
    // (RESPOND, míchání, cinematiku vyřazení); zásah uprostřed by rozbil rozdělaný
    // efekt. Seat se proto jen zapíše do `_gagPending` a vybere se na nejbližším klidném
    // místě – hned tady (když je zrovna klid), jinak v `_processSpecialQueue` /
    // `_resumeAfterSpecial`, nejpozději na konci tahu (`_gagAtTurnEnd`).
    //
    // Zásah jde přes `handleDamage(idx, null)`: Bart Cassidy si za ztracený život lízne,
    // El Gringo nekrade (není útočník). Divák není hráč, takže ho nic nestojí; mrtvý
    // hráč (a duch mimo svůj tah, který je taky na nule) taky o nic nepřijde.
    gagSpeak(playerIdx) {
        if (!this.hasEvent('ROUBIK')) return false;
        const p = this.players?.[playerIdx];
        if (!p || p.health <= 0) return false;
        if (!this._gagPending) this._gagPending = [];
        this._gagPending.push(playerIdx);
        this.logEvent('event', { card: 'Roubík', who: p.name, msg: 'promluvil → −1 život' });
        return true;
    },

    // Je klid na to vybrat odloženou pokutu? Fáze PLAY znamená, že neběží obrana,
    // sejmutí, výběr karty ani klikané zásahy; k tomu prázdná fronta odložených akcí
    // (do rozdělané schopnosti se sahat nesmí) a žádný čekající automatický konec tahu.
    _gagCalm() {
        if (this.winner || this._autoEndTurnPending) return false;
        if (this.phase !== "PLAY") return false;
        if (this.specialActionQueue?.length) return false;
        if (this.drawPhaseState?.active || this.pendingCheckDraw?.active) return false;
        return true;
    },

    // Vybere odložené pokuty. Vrací true, když nějaká opravdu dopadla (volající pak musí
    // počítat s tím, že se změnily životy, mohla vzniknout fronta odložených akcí nebo
    // dokonce padnout hráč). `force` = volající si klid zaručuje sám (konec tahu).
    _drainGag(force = false) {
        if (!this._gagPending || !this._gagPending.length) return false;
        if (!force && !this._gagCalm()) return false;
        const queue = this._gagPending;
        this._gagPending = [];
        let hit = false;
        for (const idx of queue) {
            if (this.winner) break;
            const p = this.players?.[idx];
            if (!p || p.health <= 0) continue;   // mezitím vypadl ze hry → pokuta propadá
            this.handleDamage(idx, null);
            hit = true;
        }
        return hit;
    },

    // Vybrat pokutu a rovnou nechat rozeběhnout, co tím vzniklo (Bart Cassidy si za
    // ztracený život líže). Tohle je vstup pro volající ZVENČÍ pravidel – server po
    // příchodu zprávy do chatu a `_resumeAfterSpecial`. Uvnitř `_processSpecialQueue`
    // se volá holý `_drainGag`: frontu tam dobere kód hned pod ním.
    gagFlush() {
        if (!this._drainGag()) return false;
        if (this.specialActionQueue.length) this._processSpecialQueue();
        return true;
    },

    // Konec tahu je poslední klidné místo, takže se tady vybírá i mimo fázi PLAY.
    // Vrací true, když si pokuta vzala tok hry (výhra / rozdělaná fronta odložených
    // akcí) a `nextTurn` má skončit – vrátí se do něj až `_resumeAfterSpecial`.
    _gagAtTurnEnd() {
        if (!this._gagPending || !this._gagPending.length || this.winner) return false;
        // Zásah mohl vyřadit hráče, jehož tah právě končí. `handlePlayerDeath` na to ve
        // fázi PLAY nastaví `_autoEndTurnPending` – jenže tah se posouvá právě teď, takže
        // by ho server posunul podruhé. Příznak se proto vrátí na původní hodnotu.
        const autoEnd = this._autoEndTurnPending;
        if (!this._drainGag(true)) return false;
        if (this.winner) return true;
        this._autoEndTurnPending = autoEnd;
        if (this.specialActionQueue.length) {
            // Bart Cassidy / Herb Hunter / odměna za banditu se musí dobrat DŘÍV, než se
            // posune tah. Pojistka podle CLAUDE.md: příznak se nechává nastavený jen
            // tehdy, když se z fronty opravdu něco rozeběhlo (_pruneSuzyQueue ji umí
            // vyprázdnit a hra by na `_nextTurnAfterQueue` čekala navždy).
            this._nextTurnAfterQueue = true;
            if (this._processSpecialQueue()) return true;
            this._nextTurnAfterQueue = false;
        }
        return false;
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
            if (p && isInPlay(p) && hasAbility(p, "Gary Looter")) return p;
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
    //
    // `opts.reveal` = kartu ukazuje klientská cinematika sejmutí (startCheckReveal). Ta
    // potřebuje UŽ TEĎ vědět, komu karta připadne, aby z odkrytí letěla rovnou k němu
    // místo oklikou přes odhoz (bug 28). Predikce se dělá TÍMŽ dotazem jako skutečný
    // přesun (_johnPainTakerFor), jen o kus dřív – mezi sejmutím a doběhnutím efektu se
    // taker může změnit (John Pain zemře, nebo si doplní ruku na 6). Fronta si proto
    // ohlášeného pamatuje: sedí-li, animaci už přehrál klient a server ji neposílá;
    // rozejde-li se, pošle se dodatečně z odhozu (viz _drainJohnPain).
    _johnPainQueueCard(card, drawerIdx, opts = {}) {
        if (!card) return null;
        if (!(this.players || []).some(p => p && isInPlay(p) && hasAbility(p, "John Pain"))) return null;
        if (!this._johnPainQueue) this._johnPainQueue = [];
        const announcedIdx = opts.reveal ? this.players.indexOf(this._johnPainTakerFor(drawerIdx)) : -1;
        this._johnPainQueue.push({ cardId: card.id, drawerIdx, announcedIdx });
        return announcedIdx >= 0 ? announcedIdx : null;
    },

    // Komu karta připadne. „Kdokoli" zahrnuje i jeho samotného, takže se hledá od
    // snímajícího VČETNĚ (k = 0); víc Johnů (Vera Custer, Greygory Deck) řeší oficiální
    // FAQ Q11 – bere první po směru od toho, kdo snímal. Limit 6 karet se posuzuje až
    // tady, takže Lucky Dukeovi s 5 kartami v ruce vezme John jen tu první (Q22).
    _johnPainTakerFor(drawerIdx) {
        const n = this.players?.length || 0;
        for (let k = 0; k < n; k++) {
            const p = this.players[(drawerIdx + k) % n];
            if (p && isInPlay(p) && hasAbility(p, "John Pain") && p.hand.length < 6) return p;
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
            // Ohlášeného takera (viz _johnPainQueueCard) už klient odanimoval jako součást
            // odkrytí sejmuté karty – druhý let z odhozu by kartu poslal podruhé.
            if (e.announcedIdx !== takerIdx) {
                if (!this._johnPainAnim) this._johnPainAnim = [];
                this._johnPainAnim.push({ toPlayerIdx: takerIdx, cardId: card.id });
            }
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
        if (!me || !hasAbility(me, "Youl Grinner")) return false;
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
        if (!p || !hasAbility(p, "Flint Westwood")) return null;
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

    // ── Greygory Deck ─────────────────────────────────────────────────────────
    // „Na začátku svého tahu si smí líznout 2 postavy náhodně. Má všechny jejich
    // schopnosti." Dotaz „umí X?" proto nejde přes `effectiveCharacter`, ale přes
    // `hasAbility`/`abilitiesOf` (core/distance.js) – tam je i celý výklad.
    //
    // Bere JEN postavy základní hry (ALL_CHARACTERS, 16 – poznámka v pravidlech
    // i FAQ Q30) a jen ty, jejichž KARTA je fyzicky volná (R12): líže se ze
    // skutečného balíčku postav, takže z těch 16 vypadne každá, kterou někdo hraje
    // (`p.character`), má pod počítadlem životů (`p._secondChar`, Nová identita –
    // rub karty postavy JE ta karta životů) nebo ji drží jako Greygory
    // (`p._greygoryChars` – druhý Greygory u stolu, nebo Vera, která ho kopíruje).
    //
    // VLASTNÍ dvojice se do poolu vrací (FAQ Q01: zamíchat všechny a líznout dvě,
    // klidně zas ty odložené), proto se odečítá `_greygoryChars` ostatních, ne svůj.
    // Pool SMÍ vyjít menší než 2 – i prázdný. „Smůla" je legální stav, ne chyba:
    // hráč pak tenhle tah prostě žádnou schopnost nemá a `abilitiesOf` vrátí [].
    _greygoryPool(selfIdx) {
        const used = new Set();
        (this.players || []).forEach((p, i) => {
            if (!p) return;
            if (p.character) used.add(p.character);
            if (p._secondChar) used.add(p._secondChar);
            if (i !== selfIdx) (p._greygoryChars || []).forEach(c => used.add(c));
        });
        return ALL_CHARACTERS.filter(c => !used.has(c));
    },

    // Zamíchat volné postavy a líznout dvě. Jediná cesta, jak dvojice vzniká –
    // volá ji rozdání na začátku hry, výměna na začátku tahu i Vera Custer, když si
    // Greygoryho zvolí ke kopírování.
    // `opts.silent` = bez cinematiky. Platí na začátku hry: karty postav tam rozdává
    // intro a balíček by přiletěl doprostřed rozdávání.
    _greygoryDraw(playerIdx, opts) {
        const p = this.players[playerIdx];
        if (!p) return [];
        const pool = this._greygoryPool(playerIdx);
        const old = [...(p._greygoryChars || [])];
        this.deck.shuffleArray(pool);
        p._greygoryChars = pool.slice(0, 2);
        // Cinematika líznutí: shora přiletí balíček volných karet postav, stávající
        // dvojice se do něj vrátí, zamíchá se a vypadne z něj nová (core/wwsAnim.js).
        // Pravidla o socketu nevědí – payload si vyzvedne hák před broadcastem
        // (flushGreygory, server/anim.js) a tam se i vynuluje, takže ve stavu nezůstane.
        // `poolSize` je velikost balíčku PO návratu staré dvojice: ta je ve `_greygoryPool`
        // vlastního hráče započítaná (vrací se do něj, FAQ Q01).
        if (!(opts && opts.silent)) {
            this._greygoryAnim = { playerIdx, poolSize: pool.length, old,
                                   next: [...p._greygoryChars] };
        }
        this.logEvent('event', { card: 'Greygory Deck', who: p.name,
                                 msg: `líže postavy: ${p._greygoryChars.join(', ') || '(nezbyla žádná volná)'}` });
        return p._greygoryChars;
    },

    // První dvojici dostane hned na začátku hry („This ability also applies at the
    // beginning of the game"). Volá se z obou míst, kudy se rozdávají startovní ruce
    // (logic/setup.js), a to AŽ ZA `_dealSecondIdentities` – odložené identity musí
    // z poolu ubrat dřív, než se z něj líže.
    _greygoryDealAll() {
        (this.players || []).forEach((p, i) => {
            if (p && p.character === "Greygory Deck" && !p._greygoryChars) this._greygoryDraw(i, { silent: true });
        });
    },

    // Krok krokovače startu tahu (`_runBeginTurn`, logic/highNoon.js), hned PŘED
    // Miláčkem Valentýnem: nechat dvojici, nebo si líznout novou? Vyměnit jde jen
    // OBĚ naráz; předchozí se zamíchají zpátky a můžou padnout znovu (FAQ Q01).
    //
    // Nabídka patří tomu, kdo Greygoryho DOOPRAVDY hraje. Vera Custer ji nedostává
    // nikdy: kopie platí přesně jedno kolo, takže není co si nechávat – dvojici si
    // líže rovnou při volbě kopie (veraCopyCharacter, logic/characters.js), která
    // přijde až za tímhle krokem. Kocovina (High Noon) schopnost vypíná celou.
    //
    // Nezbyla-li ani jedna volná karta, nenabízí se vůbec: výměna „za nic" je past,
    // ne rozhodnutí. Kolik jich je volných, proto putuje do stavu (`free`).
    _greygoryOffer() {
        const p = this.getCurrentPlayer();
        if (!p || !isInPlay(p) || p._noAbility) return false;
        if (p.character !== "Greygory Deck") return false;
        const free = this._greygoryPool(this.currentPlayerIndex);
        if (free.length === 0) return false;
        this.pendingGreygory = {
            playerIdx: this.currentPlayerIndex,
            current: [...(p._greygoryChars || [])],
            free: free.length
        };
        this.phase = "GREYGORY_OFFER";
        return true;
    },

    resolveGreygory(playerIdx, swap) {
        if (this.phase !== "GREYGORY_OFFER" || !this.pendingGreygory) return false;
        if (this.pendingGreygory.playerIdx !== playerIdx) return false;
        this.pendingGreygory = null;
        if (swap) this._greygoryDraw(playerIdx);
        this.phase = "PLAY";
        this._resumeBeginTurn();
        return true;
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
        if (!hasAbility(p, "Teren Kill")) return false;

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

    // ── Lee Van Kliff ─────────────────────────────────────────────────────────────────
    // „Během svého tahu smí odhodit kartu BANG! a zopakovat efekt hnědé karty, kterou
    // právě zahrál."
    //
    // Schopnost stojí na PAMĚTI poslední hnědé karty (`_lastBrown`), kterou plní
    // `_markBrownPlayed` na všech čtyřech cestách, jimiž se hnědá karta hraje: playCard,
    // playBang, playSpecialCard (logic/play.js) a discardAnotherCard (logic/dodgeCity.js).
    // Nuluje se na začátku tahu (`_beginTurn`, logic/highNoon.js) – i u Vendetina tahu
    // navíc, protože ten jde stejným krokovačem.
    //
    // Zapamatovaný deskriptor nese i to, JAKÝ cíl opakování potřebuje (`aim`), takže se
    // klient, bot i server ptají jedním predikátem (lvkOffer/lvkTargetOk,
    // core/playability.js) a nemají jak se rozejít.
    //
    // Pasti, které pravidla explicitně řeší:
    //   • Každý efekt jen jednou (`repeated`) – poznámka v pravidlech.
    //   • Cenu „odhoď další kartu" (Rvačka, Ragtime, Whisky) se NEplatí znovu (Sciarra
    //     Q29): opakuje se efekt, ne aktivace, takže opakování začíná rovnou od efektu.
    //   • Cíl smí být jiný (FAQ Q13) – proto se vybírá znovu a ten původní se neukládá.
    //   • Apache Kid: rozhoduje barva PŮVODNÍ hnědé karty, ne odhozeného BANG! (Sciarra Q12).
    //   • Do limitu 1× Bang!/tah se nepočítá ani odhozený BANG! (není zahraný), ani
    //     opakovaný efekt – stejný výklad jako u Odstřelovače (FAQ Q07 Fistfulu).
    //   • Madam Zuzana: opakování se počítá jako zahraná karta, zaplacený BANG! ne (Q24).
    //   • Dostavník / Wells Fargo: opakování NEMĚNÍ kartu Divokého západu (Sciarra Q19).
    //   • Zúčtování: zaplatit smí libovolná karta – padá to samo z `bangCardFromHand`.

    // Zapiš právě zahranou HNĚDOU kartu. Hnědá = všechno kromě modrých (isBlueCard,
    // core/cardRules.js) a zelených. Modrá ani zelená paměť NEMAŽE – „karta, kterou právě
    // zahrál" je poslední HNĚDÁ karta tohohle tahu; vyložení Mustangu mezitím schopnost
    // nezruší.
    // `opts.asBang` = hrálo se to jako karta Bang! / bang-efekt (playBang),
    // `opts.deEffect` = efekt „odhoď další kartu" (Springfield/Tequila/Whisky/Ragtime/
    // Rvačka a Odstřelovač z Fistfulu), `opts.extraSuit` = barva druhé karty Odstřelovače.
    _markBrownPlayed(playerIdx, card, opts = {}) {
        if (!card || card.green || isBlueCard(card)) return;
        const spec = this._brownRepeatSpec(card, opts);
        if (!spec) return;
        this._lastBrown = Object.assign({
            playerIdx, turnId: this.turnId,
            cardId: card.id, name: card.name, type: card.type,
            suit: card.suit,        // VYTIŠTĚNÁ barva; _effSuit se na ni ptá až při opakování
            repeated: false,
        }, spec);
    },

    // Co se dá u téhle karty zopakovat a jaký cíl na to je potřeba. `null` = nic
    // (typicky karta, která se ve svém tahu vůbec nehraje).
    _brownRepeatSpec(card, opts = {}) {
        if (opts.deEffect) {
            switch (opts.deEffect) {
                case 'bang_any':    return { effect: 'bang_any',    aim: 'shoot', range: 'any' };
                case 'heal_any':    return { effect: 'heal_any',    aim: 'heal' };
                case 'heal_self_2': return { effect: 'heal_self_2', aim: null };
                case 'steal_any':   return { effect: 'steal_any',   aim: 'steal' };
                case 'brawl':       return { effect: 'brawl',       aim: null };
                case 'sniper':      return { effect: 'sniper',      aim: 'shoot',
                                             extraSuit: opts.extraSuit != null ? opts.extraSuit : null };
                default:            return null;
            }
        }
        if (opts.asBang) {
            // Karta s bang-EFEKTEM (Úder) si nese svůj pevný dostřel; obyčejný Bang!
            // (i ten, kterým je karta jen pod Zúčtováním) střílí na dostřel zbraně.
            return card.bangEffect
                ? { effect: 'BANG_EFFECT', aim: 'shoot', range: card.range != null ? card.range : null }
                : { effect: 'BANG',        aim: 'shoot', range: null };
        }
        switch (card.type) {
            case CardType.BEER:        return { effect: 'BEER',        aim: null };
            case CardType.SALOON:      return { effect: 'SALOON',      aim: null };
            case CardType.STORE:       return { effect: 'STORE',       aim: null };
            case CardType.STAGECOACH:  return { effect: 'STAGECOACH',  aim: null };
            case CardType.WELLS_FARGO: return { effect: 'WELLS_FARGO', aim: null };
            case CardType.INDIANS:     return { effect: 'INDIANS',     aim: null };
            case CardType.GATLING:     return { effect: 'GATLING',     aim: null };
            case CardType.DUEL:        return { effect: 'DUEL',        aim: 'duel' };
            case CardType.PANIC:       return { effect: 'PANIC',       aim: 'panic' };
            case CardType.CAT_BALOU:   return { effect: 'CAT_BALOU',   aim: 'catbalou' };
            default:                   return null;
        }
    },

    // Hráč odhodil kartu BANG! a opakuje efekt. `targetIdx` = nový cíl (u efektů bez cíle
    // null). Vrací { paidCardId, targetIdx, effect } pro animaci, nebo null u neplatné
    // akce (tichý no-op – klient ani bot ji podle lvkOffer nenabídnou).
    useLeeVanKliff(playerIdx, cardId, targetIdx = null) {
        if (this.phase !== "PLAY" || this.currentPlayerIndex !== playerIdx) return null;
        const p = this.players[playerIdx];
        if (!p) return null;
        const lb = lvkOffer(this, p, playerIdx);
        if (!lb) return null;
        const i = p.hand.findIndex(c => c && c.id === cardId);
        if (i === -1 || !lvkPayOk(this, p, playerIdx, p.hand[i])) return null;
        if (lb.aim && !lvkTargetOk(this, p, playerIdx, targetIdx)) return null;

        lb.repeated = true;                       // každý efekt jen jednou
        const pay = p.hand.splice(i, 1)[0];
        this.deck.discard(pay);
        // Madam Zuzana: opakování je zahraná karta, zaplacený BANG! ne (Sciarra Q24).
        this._trackCard(playerIdx, lb.type);
        this.logEvent('special', { who: p.name, card: 'Lee Van Kliff',
                                   msg: 'opakuje ' + lb.name,
                                   target: targetIdx != null ? this.players[targetIdx]?.name : null });
        // Suzy Lafayette: ruka se mohla zaplacením vyprázdnit. Líznutí jde do FRONTY
        // a odbaví se, až doběhne efekt (viz „nejdřív doběhne efekt" v CLAUDE.md).
        // Výjimka je stejná jako v playCard: fáze STORE/DRAW si karty rozdají samy
        // a Suzy by rozdělanou nabídku hokynářství přebila.
        if (lb.effect !== 'STORE' && lb.effect !== 'STAGECOACH' && lb.effect !== 'WELLS_FARGO') {
            this.checkSuzyLafayette(p);
        }
        this._repeatBrownEffect(playerIdx, lb, targetIdx);
        return { paidCardId: pay.id, targetIdx: lb.aim ? targetIdx : null, effect: lb.effect };
    },

    // Znovu spusť efekt zapamatované hnědé karty. Každá větev kopíruje cestu, kterou by
    // šla karta sama (playCard / playBang / playSpecialCard / _dispatchDiscardExtraEffect),
    // jen bez odhazování karty a bez placení ceny (Sciarra Q29).
    _repeatBrownEffect(playerIdx, lb, targetIdx) {
        const p = this.players[playerIdx];
        const src = { suit: lb.suit };            // barva PŮVODNÍ hnědé karty (Sciarra Q12)
        const done = () => { this.phase = "PLAY"; this._processSpecialQueue(); };

        switch (lb.effect) {
            case 'BANG':
            case 'BANG_EFFECT':
            case 'bang_any':
            case 'sniper': {
                p.stats.bangsFired++;
                this.currentAttacker = playerIdx;
                if (lb.effect === 'sniper') {
                    // Odstřelovač byl složený ze DVOU karet, takže ho kárová imunita mine
                    // jen tehdy, byly-li kárové obě (viz _sniperAttack).
                    const bothD = this._effSuit(src) === Suits.DIAMONDS &&
                                  this._effSuit({ suit: lb.extraSuit }) === Suits.DIAMONDS;
                    if (bothD && this._apacheImmune(targetIdx, Suits.DIAMONDS, playerIdx)) { done(); return; }
                    this.missesPlayed = 0;
                    this._beginBangResolution(playerIdx, targetIdx, false, 'Odstřelovač', null, 2);
                } else {
                    if (this._apacheImmune(targetIdx, this._effSuit(src), playerIdx)) { done(); return; }
                    // isEffect = bang-EFEKT (Úder, Springfield): bez Slabova bonusu.
                    // Limit 1× Bang!/tah nečerpá ani opakovaný pravý Bang! (viz výš),
                    // proto se `bangsPlayedThisTurn` nezvyšuje ani v jedné větvi.
                    this._beginBangResolution(playerIdx, targetIdx, lb.effect !== 'BANG', lb.name);
                }
                break;
            }
            case 'DUEL': {
                if (this._apacheImmune(targetIdx, this._effSuit(src), playerIdx)) { done(); return; }
                this.pendingResponse = {
                    active: true, originatorIdx: playerIdx, targetIdx,
                    initialTargetIdx: targetIdx,
                    requiredCard: CardType.BANG, sourceCard: CardType.DUEL, responded: []
                };
                this.phase = "RESPOND";
                break;
            }
            case 'PANIC':
            case 'CAT_BALOU': {
                const type = lb.effect === 'PANIC' ? CardType.PANIC : CardType.CAT_BALOU;
                if (this._apacheImmune(targetIdx, this._effSuit(src), playerIdx)) { done(); return; }
                // Kartu si hráč vybere ve fázi SELECTING_TARGET_CARD (stejně jako po
                // zahrání karty) – frontu proto nechej ležet, dobere ji resolveCardSelection.
                this.phase = "SELECTING_TARGET_CARD";
                this.pendingSelection = { attackerIdx: playerIdx, targetIdx, sourceCardType: type };
                return;
            }
            case 'steal_any': {
                // Ragtime: krádež bez ohledu na vzdálenost, i z vlastního stolu.
                this.phase = "SELECTING_TARGET_CARD";
                this.pendingSelection = { attackerIdx: playerIdx, targetIdx,
                                          sourceCardType: CardType.PANIC, ignoreDistance: true };
                return;
            }
            case 'INDIANS':
            case 'GATLING': {
                const type = lb.effect === 'INDIANS' ? CardType.INDIANS : CardType.GATLING;
                this.missesRequired = 1;
                this.missesPlayed = 0;
                this._massAttackSuit = this._effSuit(src);
                this._massAttackName = lb.name;
                this._advanceMassAttack(playerIdx, playerIdx, type);
                break;
            }
            case 'BEER': {
                // Tequila Joe: karta Pivo mu dá +2. Při dvou hráčích Pivo efekt nemá –
                // pak se ale nedalo ani zahrát, takže tahle paměť vzniknout nemohla.
                this._heal(p, hasAbility(p, "Tequila Joe") ? 2 : 1);
                done();
                return;
            }
            case 'SALOON': {
                this.players.forEach(q => { this._heal(q, 1); });
                done();
                return;
            }
            case 'heal_any': {
                this._heal(this.players[targetIdx], 1);
                done();
                return;
            }
            case 'heal_self_2': {
                this._heal(p, 2);
                done();
                return;
            }
            case 'STORE': {
                this.openStore();
                this._processSpecialQueue();
                return;
            }
            case 'STAGECOACH':
            case 'WELLS_FARGO': {
                // Sciarra Q19: opakování NEOTÁČÍ kartu Divokého západu – proto se tady
                // (na rozdíl od playCard) _flipWwsEvent nevolá.
                this._setDrawPhase({ active: true, playerIdx, isStartOfTurn: false,
                                     cardsNeeded: lb.effect === 'WELLS_FARGO' ? 3 : 2,
                                     cardsDrawn: 0, options: ['deck'] });
                this.phase = "DRAW";
                this._processSpecialQueue();
                return;
            }
            case 'brawl': {
                this._startBrawl(playerIdx);
                return;
            }
            default:
                done();
                return;
        }
        this._processSpecialQueue();
    },

    // ── Zuřivá Doroty ─────────────────────────────
    // „Hráč na tahu může jmenovat kartu a vybrat hráče, který ji musí zahrát (pokud ji má)."
    // Poznámka v pravidlech: nemá-li ji, ukáže ruku; má-li ji, musí ji zahrát, JAKO BY BYL
    // NA TAHU (i pro počítání vzdáleností), ale cíl(e) vybírá poroučející.
    //
    // Technicky je to VYPŮJČENÉ SEDADLO: `currentPlayerIndex` se na dobu efektu přepíše na
    // poručeného a karta jde běžnou cestou (playCard / playBang / playSpecialCard). Tím se
    // zdarma veze úplně všechno – vzdálenosti i schopnosti poručeného (FAQ Q05: Slab jako
    // poručený si vyžádá 2× Vedle!), duel prohraje poručený a karty za Dostavník si líže
    // poručený (FAQ Q06), limit 1× Bang!/tah se počítá jemu, Madam Zuzaně se karta připíše
    // jemu a Johnny Kisch i odkrytí nové karty Divokého západu fungují beze změny.
    //
    // Sedadlo je vypůjčené JEN po dobu synchronního zahrání (vrací ho `finally`
    // v `_dorothyPlay`) – proč zrovna tak a co by se stalo jinak, je u něj.

    // Katalog DRUHŮ karet, ze kterých se jmenuje. Staví se z dat balíčku, ne z ruky –
    // jmenovat lze i kartu, kterou nikdo nedrží (a právě v tom je ta karta zajímavá).
    _dorothyKinds() {
        return distinctCardKinds(this._deckDataFor(this.options || {}));
    },

    // Kdo je doopravdy na tahu. Po dobu vypůjčeného sedadla to NENÍ currentPlayerIndex –
    // ptá se tím `handlePlayerDeath` (kdo umřel „na svém tahu") i `tryEndTurn`.
    _turnOwner() {
        return this._dorothyOwnerIdx != null ? this._dorothyOwnerIdx : this.currentPlayerIndex;
    },

    // Krok 1: „jmenuji KARTU a vybírám HRÁČE". Vrací popis toho, co se stalo, nebo null
    // u neplatného poručení:
    //   { revealed: true }   – poručený kartu nemá, ukázal ruku (tah pokračuje)
    //   { needTarget: true } – čeká se, až poroučející vybere cíl (fáze DOROTHY_TARGET)
    //   { played: true }     – karta už jde svou běžnou cestou
    dorothyCommand(playerIdx, cardName, commandedIdx) {
        if (this.phase !== "PLAY" || this.currentPlayerIndex !== playerIdx) return null;
        if (this._dorothyOwnerIdx != null) return null;      // sedadlo je zrovna vypůjčené
        // Levá závora (aktivní karta, strop poručení, Právo západu) je JINÝ dotaz než
        // „smí se tahle karta poručit tomuhle hráči" – server musí projít oběma, jinak
        // by pustil poručení bez karty na stole nebo přes strop.
        if (!dorothyReady(this, playerIdx)) return null;
        const kind = this._dorothyKinds().find(c => c.name === cardName);
        if (!kind) return null;
        if (!dorothyPlayerOk(this, playerIdx, kind, commandedIdx)) return null;

        // Strop i zákaz opakování dvojice se spotřebují HNED – i neúspěšné poručení
        // (poručený kartu nemá) je poručení. Bez toho by ho bot posílal donekonečna:
        // stav se jím nezmění o jediné pole.
        this._dorothyUsed = (this._dorothyUsed || 0) + 1;
        this._dorothyDone = (this._dorothyDone || []).concat([{ name: cardName, commandedIdx }]);

        const commanded = this.players[commandedIdx];
        const owner = this.players[playerIdx];
        const cardIdx = (commanded.hand || []).findIndex(c => c && !c._placeholder && c.name === cardName);
        if (cardIdx === -1) {
            // „Nemá-li poručený hráč jmenovanou kartu, musí ukázat ruku." Ruka se odkryje
            // jen na chvíli – je to vedle Sacagaway jediné místo, kde událost sahá do
            // redakce stavu (viz redactState v server/rooms.js). Zhasne ji server po
            // dojezdu, jinak by odkrytá zůstala napořád.
            this._dorothyReveal = { playerIdx: commandedIdx };
            this.logEvent('event', { card: 'Zuřivá Doroty', who: owner.name, target: commanded.name,
                                     msg: 'poručil ' + cardName + ' – nemá ji, ukazuje ruku' });
            return { revealed: true, playerIdx: commandedIdx };
        }

        this.logEvent('event', { card: 'Zuřivá Doroty', who: owner.name, target: commanded.name,
                                 msg: 'poroučí zahrát ' + cardName });
        const card = commanded.hand[cardIdx];
        if (dorothyNeedsTarget(this, commandedIdx, card)) {
            this.pendingDorothy = {
                playerIdx, commandedIdx, cardId: card.id, cardName,
                targets: dorothyTargets(this, commandedIdx, card),
            };
            this.phase = "DOROTHY_TARGET";
            return { needTarget: true, commandedIdx };
        }
        this._dorothyPlay(playerIdx, commandedIdx, card.id, null);
        return { played: true, commandedIdx, cardId: card.id };
    },

    // Krok 2: poroučející vybral cíl ze seznamu, který mu poslal server (R5) – stejná
    // dohoda jako u Pokrevních bratří, aby se klient s pravidly nemohl rozejít.
    dorothyChooseTarget(playerIdx, targetIdx) {
        const pd = this.pendingDorothy;
        if (this.phase !== "DOROTHY_TARGET" || !pd || pd.playerIdx !== playerIdx) return null;
        if (!(pd.targets || []).includes(targetIdx)) return null;
        this.pendingDorothy = null;
        const commandedIdx = pd.commandedIdx;
        const res = this._dorothyPlay(playerIdx, commandedIdx, pd.cardId, targetIdx);
        if (!res) { this.phase = "PLAY"; return null; }
        return { played: true, commandedIdx, cardId: pd.cardId, targetIdx };
    },

    // Zrušení rozmyšleného poručení (cíl se nakonec nevybral). Do stropu je poručení
    // započítané už z kroku 1, takže se hra nemá jak zacyklit ani tudy.
    dorothyCancel(playerIdx) {
        if (this.phase !== "DOROTHY_TARGET" || this.pendingDorothy?.playerIdx !== playerIdx) return false;
        this.pendingDorothy = null;
        this.phase = "PLAY";
        return true;
    },

    // Vypůjčení sedadla + zahrání karty běžnou cestou.
    _dorothyPlay(ownerIdx, commandedIdx, cardId, targetIdx) {
        const commanded = this.players[commandedIdx];
        const cardIdx = (commanded?.hand || []).findIndex(c => c && c.id === cardId);
        if (cardIdx === -1) return null;
        const card = commanded.hand[cardIdx];
        // Omezení vázaná na VLASTNÍ tah, která poručenému zbyla z toho minulého (nulují se
        // až na začátku jeho dalšího tahu). Kdyby zůstala, server by poručenou kartu tiše
        // odmítl – přesně ta třída chyby, kterou hlídá invariant „bot se nikdy nezasekne".
        // Zrcadlí to `dorothyAsIf` (core/playability.js), kterým se ptá klient i bot.
        commanded._handcuffsSuit = null;
        commanded._lawCardId = null;

        // Sedadlo se půjčuje jen na SYNCHRONNÍ zahrání karty – to je jediné místo, kde
        // pravidla čtou `currentPlayerIndex` (vzdálenosti, limit Bang!, Kazatel, Želízka,
        // počítadlo Madam Zuzany, odkrytí nové karty za Dostavník). Všechno, co pak běží dál
        // (RESPOND, barel, výběr karty, lízání, hokynářství), si své sedadlo nese výslovně
        // v `pending*` / `drawPhaseState`, takže se sedadlo vrací HNED. To je záměr:
        // kdyby zůstalo vypůjčené přes celou obranu, byl by po tu dobu „na tahu" poručený
        // – tah by mu šlo ukončit, jeho smrt by tah ukončila za někoho jiného a fáze PLAY
        // by po doběhnutí efektu čekala na špatného hráče (a hra jen botů by zamrzla).
        this._dorothyOwnerIdx = ownerIdx;
        this.currentPlayerIndex = commandedIdx;
        this.phase = "PLAY";
        const action = turnActionForCard(this, commanded, commandedIdx, card);
        try {
            if (action === 'SHOOT') {
                this.playBang(commandedIdx, targetIdx, cardIdx);
            } else if (DOROTHY_AIMED.includes(action)) {
                this.playSpecialCard(commandedIdx, targetIdx, cardIdx);
            } else {
                this.playCard(cardIdx);
            }
        } finally {
            this.currentPlayerIndex = ownerIdx;
            this._dorothyOwnerIdx = null;
        }
        return { commandedIdx, cardId, targetIdx };
    },

    // Pojistka na vrácení sedadla. `_dorothyPlay` ho vrací sám (ve `finally`), takže tohle
    // je jen záchranná síť pro případ, že by nějaká budoucí cesta sedadlo půjčila déle:
    // volá se z fronty odložených akcí (_resumeAfterSpecial) i z háku před broadcastem
    // (server/anim.js), tedy odkud vede cesta ke každému klidnému stavu.
    //
    // „Klid" = fáze PLAY a prázdná fronta odložených akcí.
    _dorothySettle() {
        if (this._dorothyOwnerIdx == null) return false;
        if (this.phase !== "PLAY" || (this.specialActionQueue || []).length > 0) return false;
        this.currentPlayerIndex = this._dorothyOwnerIdx;
        this._dorothyOwnerIdx = null;
        return true;
    },
};

// Tabulky ven pro strukturální test (test/wws.seats.test.js) – ten hlídá, že každý
// indexový klíč ze `logic/*` je v některé z nich. Je to prototypová vlastnost, takže
// se do broadcastovaného stavu nedostane (JSON serializuje jen vlastní pole).
WildWestMixin._SEAT_TABLES = { SEAT_KEYS, SEAT_LIST_KEYS, NOT_SEAT_KEYS, SEAT_SKIP_KEYS };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WildWestMixin;
} else {
    Object.assign(GameState.prototype, WildWestMixin);
}
})();
