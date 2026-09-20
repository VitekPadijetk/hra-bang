// logic/goldRush.js — mixin GameState: rozšíření Zlatá horečka (Gold Rush).
//
// Na rozdíl od High Noonu, Fistfulu a Divokého západu NEPŘIDÁVÁ balíček událostí.
// Přidává tři kolmé osy, které v kódu doteď nebyly:
//   1. MĚNU        – zlaté valouny (`player.nuggets`), přibývají za způsobená zranění,
//   2. OBCHOD      – čtvrtou hromádku na stole, ze které se ve fázi 2 kupuje,
//   3. VYBAVENÍ    – druhou vrstvu karet před hráčem (`player.gear`), záměrně IMUNNÍ
//                    vůči všemu, co dnes umí sahat na karty na stole (rozhodnutí R3).
// Plán: docs/zlata-horecka-plan.md, podklad docs/zlata-horecka.md.
//
// Identita karty v pravidlech je `effect` (ZH_PODKOVA, …), NIKDY jméno – „Zlatá horečka"
// se jmenuje rozšíření, jedna karta vybavení A ZÁROVEŇ existující karta událostí High
// Noonu (klíč ZLATA_HORECKA, id 305). Do jmenného prostoru `hasEvent` proto rozšíření
// vůbec nevstupuje (rozhodnutí R1).
//
// NA HROMÁDKY VYBAVENÍ SE SAHÁ JEN PŘES `_gearDraw` / `_gearDiscard`. Je to stejná
// dohoda jako u `Deck` (viz Konvence v CLAUDE.md) a drží pravidlo, které jinde není:
// odhozené vybavení se vrací LÍCEM VZHŮRU POD balíček a „jakmile se na vrchu balíčku
// objeví karta lícem vzhůru, balíček se zamíchá". Face-up část proto žije ve VLASTNÍM
// poli `gearPile` (je veřejná – leží lícem nahoru) a `gearDeck` drží jen tu lícem dolů,
// jejíž pořadí je tajné (redakce, server/rooms.js).
//
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
(function () {

// Kus vybavení = jeden fyzický exemplář druhu. Druhů je 15, kusů 24 (`copies`), takže
// každý kus musí dostat vlastní `id` – `_trackCard`, animace i klient adresují karty ID.
// Vzorec `id = druh * 10 + pořadí` drží ID číselné a řadu 600–614 čitelnou (6000, 6001…).
function gearPieces(kind) {
    const n = Math.max(1, kind.copies || 1);
    const out = [];
    for (let k = 0; k < n; k++) {
        out.push({
            id: kind.id * 10 + k,
            effect: kind.effect, name: kind.name, art: kind.art,
            border: kind.border, cost: kind.cost,
            text: kind.text || null,
        });
    }
    return out;
}

// Které druhy vybavení se do balíčku vůbec rozdávají. Stejný vzor jako `WILD_WEST_READY`
// (logic/entities.js): rozšíření se dá hrát dřív, než je hotových všech 15 druhů, a karta,
// jejíž efekt ještě není napsaný, se nesmí dostat do obchodu – hráč by za ni zaplatil
// valouny a nedostal nic. Fází 5 je seznam ÚPLNÝ (všech 15 druhů) a zůstává jen jako
// pojistka pro další rozšíření – stejně jako `WILD_WEST_READY` po dodělání Divokého západu.
const GEAR_READY = ['ZH_PANAK', 'ZH_UNION_PACIFIC',
                    // fáze 2 – pasivní černé vybavení (leží před hráčem a jen mění pravidla)
                    'ZH_BOTY', 'ZH_TALISMAN', 'ZH_NABOJOVY_PAS', 'ZH_KRUMPAC', 'ZH_KALUMET', 'ZH_PODKOVA',
                    // fáze 3 – placené černé vybavení (leží před hráčem a používá se za valouny)
                    'ZH_RYZOVACI_MISA', 'ZH_BATOH',
                    // fáze 4 – hnědé s volbou (Láhev, Komplic) a se sejmutím / tahem navíc
                    'ZH_LAHEV', 'ZH_KOMPLIC', 'ZH_RUM', 'ZH_ZLATA_HORECKA',
                    // fáze 5 – černé vybavení na CIZÍ stůl (odměna za vyřazení jeho majitele)
                    'ZH_WANTED'];

// Wanted: „Kdo toho hráče vyřadí, lízne si 2 karty a vezme si 1 valoun."
const WANTED_CARDS = 2;
const WANTED_NUGGETS = 1;

// Rýžovací mísa: „Použitelné až 2× za tah."
const PAN_USES_PER_TURN = 2;

// Rum: „Otoč! 4 karty" – každý zdroj „karty navíc" (Lucky Duke, Podkova) přidá jednu.
const RUM_FLIPS = 4;

// Cílený režim Láhve / Komplice → deskriptor efektu pro `_repeatBrownEffect`
// (logic/wildWest.js), tedy pro TOTÉŽ tělo, kterým Lee Van Kliff opakuje efekt karty
// bez karty samotné. Láhev jako BANG! jde jako bang-EFEKT (`BANG_EFFECT`): do limitu
// 1× BANG!/tah se nepočítá (dodatek karty) a Slabův bonus na něj neplatí – přesně jako
// na ostatní karty, které mají efekt BANG!, ale kartou BANG! nejsou (Úder, Springfield).
const GEAR_MODE_EFFECT = { BANG: 'BANG_EFFECT', DUEL: 'DUEL', PANIC: 'PANIC', CAT_BALOU: 'CAT_BALOU' };

const GoldRushMixin = {
    // ── Příprava balíčku vybavení (setupGame / setupDebugGame / setupNextGame) ──
    // Bez zapnutého rozšíření zůstane balíček prázdný, `_goldRushOn()` vrací false
    // a všechny háky v pravidlech jsou no-op.
    //
    // Navazující hra přebírá hráče z předchozí, takže se valouny i koupené vybavení
    // musí vynulovat tady – jinak by si do nové hry každý přinesl své jmění.
    _setupGearDeck(options = {}) {
        this.gearDeck = [];
        this.gearRow = [null, null, null];   // obchod: 3 karty lícem vzhůru
        this.gearPile = [];                  // odhozené: lícem vzhůru POD balíčkem
        this._goldRush = false;
        this.pendingGearTarget = null;
        this._gearRumReveal = null;
        // Počítadlo Rýžovací mísy je klíčované `turnId`, který navazující hra čísluje
        // znovu – starý záznam by jinak mohl sednout na tah nové hry. Zaplacený tah navíc
        // (karta Zlatá horečka) se do nové hry taky nepřenáší.
        (this.players || []).forEach(p => {
            p.gear = []; p.nuggets = 0; p._panTurn = null; p._panUses = 0; p._gearExtraTurn = false;
        });
        const on = options.expansions && options.expansions.zlata_horecka;
        if (!on || !Array.isArray(this.gearCardData)) return;
        this._goldRush = true;

        const pool = [];
        this.gearCardData.forEach(kind => {
            if (!GEAR_READY.includes(kind.effect)) return;
            pool.push(...gearPieces(kind));
        });
        this.deck.shuffleArray(pool);
        this.gearDeck = pool;
        this._gearRefill();
        this.logEvent('system', { msg: `Zlatá horečka: balíček vybavení (${this.gearDeck.length} karet, obchod ${this.gearRow.filter(Boolean).length})` });
    },

    // Je rozšíření zapnuté? VLASTNÍ příznak, ne „balíček není prázdný": kusů je 24
    // a všechny mohou být zrovna rozkoupené, takže by se prázdný balíček nedal odlišit
    // od vypnutého rozšíření – a valouny by uprostřed hry přestaly přibývat.
    _goldRushOn() {
        return !!this._goldRush;
    },

    // ── Ekonomika ────────────────────────────────────────────────────────────
    // „Vždy, když způsobíte JINÉMU hráči ztrátu života JAKÝMKOLIV způsobem, vezměte si
    // 1 valoun ze společné zásoby. Pokud způsobíte jednou kartou ztrátu života více
    // hráčům, vezměte si zlato za KAŽDÉ zranění."
    // Zásoba se nemodeluje (R4) – valouny jsou jen číslo u hráče.
    _gainNugget(playerIdx, n = 1) {
        if (!this._goldRushOn()) return;
        const p = this.players[playerIdx];
        if (!p || n <= 0) return;
        p.nuggets = (p.nuggets || 0) + n;
        this.logEvent('nuggets', { who: p.name, gain: n, total: p.nuggets });
    },

    // Zaplacení. Vrací false, když hráč nemá dost – volající pak akci NESMÍ provést.
    _payNuggets(playerIdx, n) {
        const p = this.players[playerIdx];
        if (!p || n < 0 || (p.nuggets || 0) < n) return false;
        p.nuggets -= n;
        if (n > 0) this.logEvent('nuggets', { who: p.name, pay: n, total: p.nuggets });
        return true;
    },

    // ── Trychtýř „hráč právě ztratil 1 život" (rozhodnutí R5) ────────────────
    // Zisk valounu ÚTOČNÍKA stačí věšet na `handleDamage`, ale REAKCE OBĚTI (Boty,
    // Talisman, Simeon Picos) platí na ztrátu života z JAKÉHOKOLI zdroje – a mimo
    // `handleDamage` jde i `takeDynamiteHit` (výbuch dynamitu, Madam Zuzana, Roubík)
    // a `useChuckWengam` (dobrovolná ztráta). Bez jednoho trychtýře by Talisman tiše
    // nefungoval zrovna na dynamitu; je to stejný vzor jako `hasAbility`.
    //
    //   `attackerIdx` – kdo ztrátu způsobil (null = událost / vlastní pokuta / dynamit),
    //   `last`        – byl to POSLEDNÍ život? Boty i Talisman se pak neuplatní
    //                   („neúčinkují při ztrátě posledního života"); Simeon Picos ano,
    //                   jeho text tu výjimku nemá.
    //
    // Fáze 6 (Simeon Picos) přibude SEM, ne k volajícím.
    _afterLifeLost(playerIdx, opts = {}) {
        if (!this._goldRushOn()) return;
        const p = this.players[playerIdx];
        if (!p) return;
        this.logEvent('lifelost', {
            who: p.name, hp: p.health,
            by: opts.attackerIdx != null ? this.players[opts.attackerIdx]?.name : null,
            last: !!opts.last,
        });
        // „Neúčinkují při ztrátě POSLEDNÍHO života" – platí na Boty i Talisman shodně
        // (dodatek v pravidlech). Zbytek trychtýře (Simeon Picos) tu výjimku nemá,
        // proto se nesmí odbýt jedním early returnem nahoře.
        if (opts.last) return;
        // Talisman: „Pokaždé, když ztratíš 1 život, vezmi si 1 valoun." Vždy ze SPOLEČNÉ
        // zásoby, ne od toho, kdo ztrátu způsobil – útočník o svůj valoun nepřichází.
        if (this._gearOn(p, 'ZH_TALISMAN')) this._gainNugget(playerIdx, 1);
        // Boty: „Pokaždé, když ztratíš 1 život, lízni si 1 kartu z balíčku." Je to přesně
        // tvar Barta Cassidyho, takže se líznutí odkládá do FRONTY – platí pro ně celé
        // pravidlo „nejdřív doběhne efekt zahrané karty". Vlastní typ (ne recyklovaný
        // BART_DRAW), aby log i klientské zvýraznění říkaly správnou příčinu.
        if (this._gearOn(p, 'ZH_BOTY')) {
            this.specialActionQueue.push({ type: 'GEAR_BOOTS_DRAW', playerIdx });
        }
    },

    // ── Dotazy ───────────────────────────────────────────────────────────────
    // „Ne dvě stejného jména" i všechny háky se ptají na `effect`, ne na `name` (R1).
    _hasGear(playerIdx, effect) {
        return this._gearHas(this.players[playerIdx], effect);
    },

    // Totéž nad OBJEKTEM hráče. Většina háků fáze 2 (limit karet v ruce, počet líznutých
    // karet, sejmutí, kárová imunita) dostává hráče, ne jeho sedadlo – dohledávat index
    // by znamenalo `indexOf` na každém z nich.
    _gearHas(player, effect) {
        return !!player && (player.gear || []).some(c => c && c.effect === effect);
    },

    // JEDINÝ dotaz, kterým se ptají pravidlové háky vybavení: „platí téhle kartě zrovna
    // teď efekt?" Kromě vlastnictví v něm sedí obě karty, které vybavení VYPÍNAJÍ (R10) –
    // jinak by se výjimka musela psát u každého druhu zvlášť a jeden by se zapomněl.
    //   • Fistful – Laso: „karty na stole nemají efekt" (platí pro celý stůl),
    //   • Dodge City – Belle Star: v jejím tahu nemají efekt CIZÍ karty na stole.
    // Vlastnictví samo (nákup, „ne dvě stejného", vynucené odhození) se ptá `_gearHas`:
    // vypnutá karta pořád leží před hráčem a pořád se dá koupit jen jednou.
    _gearOn(player, effect) {
        if (!this._gearHas(player, effect)) return false;
        if (this._boardDead()) return false;
        const idx = this.players.indexOf(player);
        return !(idx !== this.currentPlayerIndex && this._belleIgnoresBoard(this.currentPlayerIndex));
    },

    // Cena karty pro KONKRÉTNÍHO hráče. Jediné místo, kde se cena liší podle toho, kdo
    // kupuje – Pretty Luzena (fáze 6) má jednou za tah slevu 1. Zrcadlo pro klienta
    // a bota je `gearCostFor` (core/goldRush.js); rozejít se nesmí.
    _gearCost(playerIdx, card) {
        return card ? Math.max(0, card.cost || 0) : 0;
    },

    // ── Hromádky vybavení: JEDINÁ cesta, kudy se na ně smí sáhnout ───────────
    // Vrch balíčku = konec pole `gearDeck` (stejně jako u `Deck.draw`). Došel-li lícem
    // dolů otočený balíček, zamíchá se do něj celá odhozená (lícem vzhůru ležící)
    // hromádka – to je ono pravidlové „jakmile se na vrchu objeví karta lícem vzhůru,
    // balíček se zamíchá a vytvoří se nový lícem dolů".
    _gearDraw() {
        if (!this.gearDeck.length) {
            if (!this.gearPile.length) return null;
            this.gearDeck = this.gearPile.splice(0);
            this.deck.shuffleArray(this.gearDeck);
            this.logEvent('gear', { act: 'shuffle', left: this.gearDeck.length });
        }
        return this.gearDeck.pop() || null;
    },

    // Karta odchází ze hry: „na spodek balíčku vybavení lícem vzhůru". Vrací se tudy
    // použité hnědé vybavení, vynuceně odhozené i pozůstalost vyřazeného hráče.
    _gearDiscard(...cards) {
        cards.forEach(c => { if (c) this.gearPile.push(c); });
    },

    // Obchod má vždy 3 karty lícem vzhůru; koupená se doplní OKAMŽITĚ (rozhodnutí R7).
    // Dojdou-li karty úplně, slot zůstane prázdný (null) – to je legální stav.
    _gearRefill() {
        for (let i = 0; i < this.gearRow.length; i++) {
            if (this.gearRow[i]) continue;
            this.gearRow[i] = this._gearDraw();
        }
    },

    // ── Fáze 2, možnost 1: nákup vybavení z obchodu ─────────────────────────
    // NENÍ to fáze (rozhodnutí R6): kupuje se ve fázi PLAY, kolikrát hráč chce a dokud
    // má valouny – čekat se na nikoho nemusí. Vrací koupenou kartu (klient si podle ní
    // pustí animaci), nebo null, když se nákup neuskutečnil.
    // `opts.mode` = jak se zahraje Láhev / Komplic (GEAR_MODES v core/goldRush.js); karta
    // s režimy bez platného režimu neprojde – volí se PŘED zaplacením, ne po něm.
    gearBuy(playerIdx, rowIdx, opts = {}) {
        if (!this._goldRushOn() || this.phase !== "PLAY") return null;
        if (playerIdx !== this.currentPlayerIndex) return null;
        const p = this.players[playerIdx];
        const card = this.gearRow[rowIdx];
        if (!p || !card || !isInPlay(p)) return null;
        // Fistful – Soudce: „Hráči nesmí vykládat karty před sebe ani před ostatní
        // hráče." Týká se jen ČERNÝCH karet – ty před hráčem zůstávají ležet (R9);
        // hnědá se hned použije a jde pod balíček, takže před nikým neskončí.
        if (this._gearJudgeBlocks(card)) return null;
        // Fistful – Právo západu: vynucená karta musí ven jako první. Nákup ji smí
        // předběhnout jen tehdy, když po něm půjde pořád zahrát (léčení a líznuté
        // karty ji můžou „vypnout" – to modeluje _lawLocked).
        if (this._lawLocked(playerIdx, null, this._gearLawOpts(card))) return null;
        // „Ne dvě stejného jména" – jako u modrých karet, jen se ptáme na `effect` (R1).
        // Kontrola musí být PŘED zaplacením, jinak by hráč přišel o valouny zadarmo.
        // U Wanted se neměří na kupujícím, ale až na vybraném CÍLI (gearBlackTargets) –
        // karta jde „na libovolného hráče", takže vlastní stůl nic neblokuje.
        if (card.border === 'black' && !gearAimedBlack(card) && this._hasGear(playerIdx, card.effect)) return null;
        // Láhev / Komplic: bez zvoleného (a právě hratelného) režimu se nekupuje.
        const modes = gearModesOf(card);
        const mode = modes ? opts.mode : null;
        if (modes && !modes.includes(mode)) return null;
        // Podmínky vázané na efekt karty (režim a jeho cíle, Rum na plný život, Zlatá
        // horečka pod Právem západu / jako duch) – TÝŽ predikát, kterým se ptá okno
        // obchodu i bot (core/goldRush.js). Musí být před zaplacením, jako všechno výš.
        if (gearCardReason(this, playerIdx, card, mode) !== null) return null;
        const cost = this._gearCost(playerIdx, card);
        if (!this._payNuggets(playerIdx, cost)) return null;

        // Koupená karta se nahrazuje OKAMŽITĚ (R7), ještě než se rozehraje její efekt –
        // ten může změnit fázi (Union Pacific vede na lízání), takže potom by se
        // doplnění muselo řešit odjinud.
        this.gearRow[rowIdx] = null;
        this._gearRefill();
        this.logEvent('gear', { act: 'buy', who: p.name, card: card.name, cost, border: card.border,
                                mode: mode ? GEAR_MODE_LABEL[mode] : undefined });
        if (card.border === 'black') {
            // Wanted: „zahraj na libovolného hráče" – karta se nevykládá před kupujícího,
            // ale počká si na cíl ve stejné fázi jako Panák. Do té doby ji drží pending
            // (nikde jinde neleží), takže se nesmí ztratit ani v cestě „cíl mezitím odešel
            // ze hry" – tu řeší resolveGearTarget odhozením pod balíček.
            if (gearAimedBlack(card)) {
                this.pendingGearTarget = {
                    playerIdx, effect: card.effect, cardName: card.name, card,
                    targets: gearBlackTargets(this, playerIdx, card),
                };
                this.phase = "GEAR_TARGET";
            } else {
                p.gear.push(card);
            }
        } else {
            // Na spodek balíčku jde karta HNED: efekt Zlaté horečky ukončí tah a rovnou
            // rozjede další, takže „potom" by znamenalo až uprostřed nového tahu.
            this._gearDiscard(card);
            this._gearApplyBrown(playerIdx, card, mode);
        }
        return card;
    },

    // Soudce (Fistful) blokuje jen to, co někomu skončí před ním – tedy černý rám (R9).
    _gearJudgeBlocks(card) {
        return !!card && card.border === 'black' && this.hasEvent('SOUDCE');
    },

    // Co nákup udělá navíc, z pohledu Práva západu (léčení / líznuté karty).
    // Zrcadlí gearLawOpts (core/goldRush.js); Rum počítá nejhorší případ (4 barvy).
    // Láhev a Komplic se posuzují až podle zvoleného režimu – to dělá gearCardReason.
    _gearLawOpts(card) {
        if (!card) return {};
        if (card.effect === 'ZH_PANAK') return { heal: 1 };
        if (card.effect === 'ZH_UNION_PACIFIC') return { draws: 4 };
        if (card.effect === 'ZH_RUM') return { heal: 4 };
        return {};
    },

    // Hnědý rám: efekt se uplatní HNED při nákupu a karta jde pod balíček. Karty, které
    // potřebují volbu, si tady jen otevřou vlastní fázi; zbytek se odbaví na místě.
    // `mode` = zvolený režim Láhve / Komplice (u ostatních karet null).
    _gearApplyBrown(playerIdx, card, mode = null) {
        if (mode) { this._gearPlayMode(playerIdx, card, mode); return; }
        switch (card.effect) {
            // Panák: „Hráč dle tvé volby (i ty) si doplní 1 život." Volí se klikem na
            // hráče (fáze GEAR_TARGET, stejná dohoda jako u Pokrevních bratří). Není-li
            // koho léčit, efekt vyšumí – karta je i tak zaplacená a použitá.
            case 'ZH_PANAK': {
                const targets = [];
                this.players.forEach((p, i) => {
                    if (isInPlay(p) && p.health < p.maxHealth) targets.push(i);
                });
                if (!targets.length) {
                    this.logEvent('gear', { act: 'panak', who: this.players[playerIdx].name, target: null });
                    return;
                }
                this.pendingGearTarget = { playerIdx, effect: card.effect, cardName: card.name, targets };
                this.phase = "GEAR_TARGET";
                return;
            }
            // Union Pacific: „Lízni si 4 karty z balíčku." Běžná fáze lízání mimo začátek
            // tahu – přesně jako Dostavník / Wells Fargo, jen bez otočení karty Divokého
            // západu (to dělá výhradně Dostavník a Wells Fargo, FAQ Q16).
            case 'ZH_UNION_PACIFIC': {
                this._setDrawPhase({ active: true, playerIdx, cardsNeeded: 4, cardsDrawn: 0,
                                     options: ['deck'], isStartOfTurn: false });
                this.phase = "DRAW";
                return;
            }
            case 'ZH_RUM': this._gearRum(playerIdx); return;
            // Zlatá horečka: „Tvůj tah končí. Doplň si všechny životy a zahraj další tah."
            // Tah se ukončí ÚPLNĚ obyčejně (tryEndTurn – odhoz nad limit, Madam Zuzana,
            // Vendeta) a doléčení s tahem navíc přijde až na jeho konci, v pořadí textu
            // karty – háček `_gearExtraTurnCheck` v nextTurn. Příznak nese HRÁČ, ne sedadlo:
            // mezi nákupem a koncem tahu nic nesedí jinak, a kdyby na konci tahu umřel
            // (pokuta Madam Zuzany), háček ho jen shodí.
            case 'ZH_ZLATA_HORECKA': {
                const p = this.players[playerIdx];
                p._gearExtraTurn = true;
                this.logEvent('gear', { act: 'zlata_horecka', who: p.name, msg: 'tah končí, hraje další' });
                this.tryEndTurn();
                return;
            }
            default: return;
        }
    },

    // ── Láhev a Komplic: „může být zahrána jako…" ───────────────────────────
    // Karta NENÍ tou kartou, jejíž efekt má (dodatek) – proto se nic nevyrábí, nic nejde
    // do odhozu hracího balíčku a nic se nepočítá: ani limit 1× BANG!/tah, ani zahraná
    // karta Madam Zuzaně (`_trackCard`), ani paměť Lee Van Kliffa (`_markBrownPlayed`).
    // Efekt jede stejným tělem, jakým Lee Van Kliff opakuje efekt karty bez karty samotné
    // (`_repeatBrownEffect`) – takže se veze Barel, Jourdonnais, Belle Star, výběr karty
    // soupeře i duel přesně jako u skutečné karty.
    _gearPlayMode(playerIdx, card, mode) {
        const p = this.players[playerIdx];
        switch (mode) {
            // Pivo: +1 život. Ne víc – Tequila Joe si Láhví doplní jen 1 (FAQ Q14) a Madam
            // Yto (fáze 6) se nespouští; a ani „ve dvou hráčích Pivo nemá efekt" ani
            // Kazatel se na ni nevztahují, protože kartou Pivo není.
            case 'BEER': {
                const healed = this._heal(p, 1);
                this.logEvent('gear', { act: 'mode', who: p.name, card: card.name, mode: 'Pivo', heal: healed });
                return;
            }
            // Hokynářství: rozdává úplně stejně jako karta (cinematika i pořadí výběru).
            // Uncle Willa to nespouští – jeho schopnost se na kartu Hokynářství ani neptá.
            case 'STORE': {
                this.logEvent('gear', { act: 'mode', who: p.name, card: card.name, mode: 'Hokynářství' });
                this.openStore();
                return;
            }
            // Cílené režimy: cíl se vybírá klikem na hráče ve stejné fázi jako u Panáku.
            // Seznam spočítal týž predikát, podle kterého šel nákup vůbec udělat, takže
            // prázdný být nemůže.
            default: {
                this.pendingGearTarget = {
                    playerIdx, effect: card.effect, cardName: card.name, mode,
                    targets: gearModeTargets(this, playerIdx, mode),
                };
                this.phase = "GEAR_TARGET";
                return;
            }
        }
    },

    // Cíl karty s volbou (Panák, cílené režimy Láhve a Komplice, Wanted). `targetIdx` musí
    // být ze seznamu, který hra nabídla – stejná dohoda jako u Pokrevních bratří a Zuřivé
    // Doroty.
    resolveGearTarget(playerIdx, targetIdx) {
        const pg = this.pendingGearTarget;
        if (this.phase !== "GEAR_TARGET" || !pg || pg.playerIdx !== playerIdx) return false;
        if (!pg.targets.includes(targetIdx)) return false;
        const t = this.players[targetIdx];
        this.pendingGearTarget = null;
        this.phase = "PLAY";
        // Wanted: karta se vyloží před vybraného hráče (i před kupujícího, FAQ Q07).
        // Cíl mohl mezitím odejít ze hry – pokuta Roubíku smí tuhle volbu přerušit, když
        // se čeká na někoho jiného než na pokutovaného. Zaplacená karta se pak nesmí
        // ztratit: jde pod balíček vybavení, jako by ji majitel odhodil.
        if (pg.card) {
            const who = this.players[playerIdx];
            if (!t || !isInPlay(t)) {
                this._gearDiscard(pg.card);
                this.logEvent('gear', { act: 'wanted_place', who: who?.name, target: null });
            } else {
                t.gear.push(pg.card);
                this.logEvent('gear', { act: 'wanted_place', who: who?.name, target: t.name });
            }
            this._processSpecialQueue();
            return true;
        }
        if (pg.mode) {
            this._gearModeHit(playerIdx, pg, targetIdx);
            return true;
        }
        const healed = this._heal(t, 1);
        this.logEvent('gear', { act: 'panak', who: this.players[playerIdx].name, target: t.name, heal: healed });
        this._processSpecialQueue();
        return true;
    },

    // Cílený režim Láhve / Komplice dostal cíl → efekt jde cestou skutečné karty.
    _gearModeHit(playerIdx, pg, targetIdx) {
        const t = this.players[targetIdx];
        this.logEvent('gear', { act: 'mode', who: this.players[playerIdx].name, card: pg.cardName,
                                mode: GEAR_MODE_LABEL[pg.mode], target: t ? t.name : null });
        // Cíl mezitím mohl odejít ze hry – pokuta Roubíku smí přerušit i tuhle volbu, když
        // se čeká na někoho jiného než na pokutovaného. Efekt pak prostě vyšumí (karta je
        // zaplacená a použitá); čekat na nový cíl by mohlo uváznout, kdyby žádný nezbyl.
        if (!t || !isInPlay(t)) { this._processSpecialQueue(); return; }
        // Karta vybavení nemá barvu, takže ji Apache Kid ani Kalumet nezastaví – `suit: null`
        // projde `_effSuit` jako „ne káro" (pod Požehnáním srdce, pod Prokletím piky).
        this._repeatBrownEffect(playerIdx, {
            effect: GEAR_MODE_EFFECT[pg.mode],
            name: `${pg.cardName} (${GEAR_MODE_LABEL[pg.mode]})`,
            suit: null,
        }, targetIdx);
    },

    // ── Rum: „Otoč! 4 karty: doplň si 1 život za každou různou barvu." ──────
    // Je to sejmutí („otoč!"), takže platí všechno, co se na sejmutí váže:
    //   • Lucky Duke i Podkova přidávají kartu navíc (FAQ Q05: Lucky Duke otočí 5) a
    //     sčítají se (R8) – ptá se `_checkRevealCount`, stejně jako všech pět ostatních cest,
    //   • barva se čte přes `_effSuit` (Požehnání = jediná barva srdce, Prokletí piky),
    //   • John Pain si bere otočené karty po jedné, dokud má v ruce méně než 6 (FAQ Q12) –
    //     až doběhne efekt, tedy po doléčení (`_johnPainQueueCard` → `_drainJohnPain`).
    // „Vybrat výsledek" (Podkova, Lucky Duke) tu nic neznamená: počítají se všechny otočené
    // karty, víc karet = víc šancí na další barvu. Opuštěný důl (Fistful) se sejmutí
    // netýká – bere se z balíčku jako vždy.
    _gearRum(playerIdx) {
        const p = this.players[playerIdx];
        const want = RUM_FLIPS + this._checkRevealCount(p) - 1;
        // Otočené karty leží, dokud se neotočí všechny, NA STOLE – do odhozu jdou až potom.
        // Kdyby šly hned, domíchání balíčku uprostřed (došel by) by je vrátilo zpátky.
        const cards = [];
        for (let k = 0; k < want; k++) {
            const c = this.deck.draw({ toDiscard: true });
            if (!c) break;   // došly obě hromádky – počítá se z toho, co se otočilo
            cards.push(c);
        }
        cards.forEach(c => this.deck.discard(c));
        const suits = new Set(cards.map(c => this._effSuit(c)).filter(Boolean));
        const healed = this._heal(p, suits.size);
        cards.forEach(c => this._johnPainQueueCard(c, playerIdx));
        // Pro cinematiku (server/handlers.game.js – gear_buy): karty jsou po otočení
        // veřejné, takže payload smí dostat celý stůl.
        this._gearRumReveal = {
            type: 'gear_rum', playerIdx,
            cards: cards.map(c => ({ id: c.id, name: c.name, suit: c.suit, value: c.value })),
            suits: suits.size, healed,
        };
        this.logEvent('gear', { act: 'rum', who: p.name,
                                cards: cards.map(c => `${c.value}${this._effSuit(c)}`).join(' '),
                                suits: suits.size, heal: healed });
        // „Nejdřív doběhne efekt" – teprve teď si John Pain vezme otočené karty.
        this._processSpecialQueue();
    },

    // ── Karta Zlatá horečka: tah navíc ──────────────────────────────────────
    // Háček v nextTurn (logic.js) hned za Vendetou: tah skončil úplně obyčejně a teď se
    // doléčí a hraje znovu. Tah navíc je týž jako u Vendety (`_vendettaExtraTurn`,
    // logic/fistful.js) – plnohodnotný tah s novým `turnId`, kontrolami na Dynamit/Vězení
    // i fází lízání, jen bez odkrytí nové události. Příznak se shodí VŽDYCKY, i když se
    // tah navíc nekoná (hráč na konci tahu umřel) – jinak by čekal na jeho návrat do hry.
    _gearExtraTurnCheck() {
        const p = this.getCurrentPlayer();
        if (!p || !p._gearExtraTurn) return false;
        p._gearExtraTurn = false;
        if (!isInPlay(p) || this.winner) return false;
        const healed = this._heal(p, p.maxHealth);
        this.logEvent('gear', { act: 'zlata_horecka', who: p.name, heal: healed });
        this._vendettaExtraTurn('Zlatá horečka');
        return true;
    },

    // ── Fáze 2, možnost 2: donutit jiného hráče odhodit vybavení ────────────
    // „Zaplať cenu vybavení + 1 valoun. Vlastník se nemůže bránit." Jen CIZÍ vybavení
    // (FAQ Q10) – vlastní si takhle odhodit nejde. Cena se bere z ceny vytištěné na
    // kartě, ne přes `_gearCost`: sleva Pretty Luzeny platí na NÁKUP, ne na tohle.
    gearForceDiscard(playerIdx, targetIdx, gearIdx) {
        if (!this._goldRushOn() || this.phase !== "PLAY") return null;
        if (playerIdx !== this.currentPlayerIndex || targetIdx === playerIdx) return null;
        const p = this.players[playerIdx];
        const t = this.players[targetIdx];
        const card = t && (t.gear || [])[gearIdx];
        if (!p || !card || !isInPlay(t)) return null;
        const cost = Math.max(0, card.cost || 0) + 1;
        if (!this._payNuggets(playerIdx, cost)) return null;
        t.gear.splice(gearIdx, 1);
        this._gearDiscard(card);
        this.logEvent('gear', { act: 'force', who: p.name, target: t.name, card: card.name, cost });
        return card;
    },

    // ── Fáze 2, možnost 3: Pivo za valoun ───────────────────────────────────
    // „Zahráním karty Pivo z ruky si vezmeš 1 valoun místo doplnění života." Je to
    // VLASTNÍ akce, ne větev playCard – hráč musí umět říct, že tohle Pivo chce na zlato.
    // Karty s podobným efektem (Salón, Whisky, Láhev) takhle zahrát nejde, proto se ptáme
    // přesně na typ Pivo.
    beerForNugget(playerIdx, cardIdx) {
        if (!this._goldRushOn() || this.phase !== "PLAY") return null;
        if (playerIdx !== this.currentPlayerIndex) return null;
        const p = this.players[playerIdx];
        const card = p && p.hand[cardIdx];
        if (!card || card.type !== CardType.BEER) return null;
        // Kazatel (High Noon) zakazuje ZAHRÁT Pivo – a tohle je zahrání Piva.
        if (this._beerBlocked()) return null;
        if (this._suitBlocked(playerIdx, card)) return null;        // Želízka
        if (this._lawLocked(playerIdx, card)) return null;          // Právo západu
        // Pravidlo „ve dvou hráčích nemá Pivo efekt" se sem NEVZTAHUJE (FAQ Q11) a
        // Tequila Joe si vezme taky jen 1 valoun, ne 2 (FAQ Q15).
        p.hand.splice(cardIdx, 1);
        this.deck.discard(card);
        this._gainNugget(playerIdx, 1);
        this._trackCard(playerIdx, card.type);
        this._markBrownPlayed(playerIdx, card);   // Divoký západ – Lee Van Kliff
        this.logEvent('gear', { act: 'beer_nugget', who: p.name });
        this.checkSuzyLafayette(p);
        this._processSpecialQueue();
        return card;
    },

    // ── Placené černé vybavení (fáze 3): Rýžovací mísa a Batoh ─────────────
    // Obě karty leží před hráčem a používají se za valouny. Stejně jako nákup to NENÍ
    // fáze (R6): používá je hráč na tahu ve fázi PLAY a nikdo jiný nečeká. Jedinou
    // výjimkou je Batoh na posledním životě – ten smí i mimo tah (rucksackLastLifeSave,
    // logic/response.js). Zrcadlo pro klienta a bota: gearPanOk / gearRucksackOk /
    // gearRucksackSaveOk (core/goldRush.js).

    // Kolikrát už hráč v TOMHLE tahu rýžoval. Klíčované `turnId`, takže se nic nenuluje:
    // nový tah (i Vendetin tah navíc) má nové ID a počítadlo začíná od nuly.
    _panUsesThisTurn(player) {
        return player && player._panTurn === this.turnId ? (player._panUses || 0) : 0;
    },

    // Rýžovací mísa: „Zaplať 1 valoun a lízni si 1 kartu z balíčku. Použitelné až 2×
    // za tah." Líže se KLIKEM na balíček, běžnou fází lízání mimo začátek tahu – stejně
    // jako Union Pacific (líznutí jdou jednou cestou, včetně animace). Vrací true, když
    // se rýžovalo.
    gearPanUse(playerIdx) {
        if (!this._goldRushOn() || this.phase !== "PLAY") return false;
        if (playerIdx !== this.currentPlayerIndex) return false;
        const p = this.players[playerIdx];
        if (!p || !isInPlay(p) || !this._gearOn(p, 'ZH_RYZOVACI_MISA')) return false;
        const used = this._panUsesThisTurn(p);
        if (used >= PAN_USES_PER_TURN) return false;
        // Fistful – Právo západu: líznutá karta může vynucenou kartu „vypnout" (_lawLocked).
        if (this._lawLocked(playerIdx, null, { draws: 1 })) return false;
        if (!this._payNuggets(playerIdx, 1)) return false;
        p._panTurn = this.turnId;
        p._panUses = used + 1;
        this.logEvent('gear', { act: 'pan', who: p.name, use: p._panUses });
        this._setDrawPhase({ active: true, playerIdx, cardsNeeded: 1, cardsDrawn: 0,
                             options: ['deck'], isStartOfTurn: false });
        this.phase = "DRAW";
        return true;
    },

    // Platí hráči Batoh a má na něj? Společná podmínka obou použití (v tahu i na
    // posledním životě); `_gearOn` v sobě nese Laso i Belle Star (R10).
    _rucksackReady(player) {
        return !!player && this._gearOn(player, 'ZH_BATOH') && (player.nuggets || 0) >= 2;
    },

    // Batoh: „Zaplať 2 valouny a doplň si 1 život." Ve svém tahu (fáze PLAY) kolikrát
    // chce, má-li co doplnit. Mimo fázi PLAY jen jako záchrana POSLEDNÍHO života
    // (dodatek „i mimo tah vlastníka") – to je `rucksackLastLifeSave` vedle Piva a Sida.
    // Tahle metoda je jen rozcestí, ať klient i bot posílají jednu akci.
    gearRucksackUse(playerIdx) {
        if (!this._goldRushOn()) return false;
        if (this.phase !== "PLAY") return this.rucksackLastLifeSave(playerIdx);
        if (playerIdx !== this.currentPlayerIndex) return false;
        const p = this.players[playerIdx];
        if (!p || !isInPlay(p) || !this._rucksackReady(p)) return false;
        if (p.health >= p.maxHealth) return false;
        if (this._lawLocked(playerIdx, null, { heal: 1 })) return false;   // Právo západu
        this._payNuggets(playerIdx, 2);
        const healed = this._heal(p, 1);
        this.logEvent('gear', { act: 'rucksack', who: p.name, heal: healed });
        return true;
    },

    // ── Wanted: odměna za vyřazení jeho majitele ────────────────────────────
    // „Kdo toho hráče vyřadí, lízne si 2 karty a vezme si 1 valoun." Volá handlePlayerDeath
    // (logic/combat.js) MEZI odměnou za banditu a pokutou šerifa za pomocníka – obojí
    // z toho plyne z pravidel:
    //   • odměny se SČÍTAJÍ: bandita s Wanted dá 2 + 3 = 5 karet a 1 + 1 = 2 valouny.
    //     Karty jdou dvěma frontami po 2 a 3 (jako u Herba Huntera), ne jednou pětkou –
    //     jsou to dva různé efekty a každý se líže vlastní fází,
    //   • „vyřadí-li šerif pomocníka s Wanted, NEJPRVE si vezme 2 karty a teprve pak
    //     odhodí celou ruku, ale zlato si ponechá" – čili karty jsou ztracené. Fronta
    //     odložených akcí se odbavuje až po návratu z handlePlayerDeath, tedy AŽ ZA
    //     pokutou; líznout je do ruky „na oko" by je hráči nechalo. Výsledek pravidla je
    //     přesně „dvě karty z balíčku do odhozu", takže se tak i provedou.
    // `opts.loseHand` = chystá se pokuta šerifa za pomocníka (počítá ji volající, ať se
    // tahle podmínka nepíše na dvou místech).
    _gearWantedReward(killerIdx, opts = {}) {
        if (!this._goldRushOn()) return;
        const killer = this.players[killerIdx];
        if (!killer || !isInPlay(killer)) return;
        this._gainNugget(killerIdx, WANTED_NUGGETS);
        this.logEvent('gear', { act: 'wanted', who: killer.name,
                                cards: WANTED_CARDS, nuggets: WANTED_NUGGETS,
                                lost: opts.loseHand ? 'pokuta šerifa' : undefined });
        if (opts.loseHand) {
            for (let k = 0; k < WANTED_CARDS; k++) {
                const c = this.deck.draw();
                if (!c) break;
                this.deck.discard(c);
            }
            return;
        }
        this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: killerIdx, cardsNeeded: WANTED_CARDS });
    },

    // ── Vyřazení hráče ──────────────────────────────────────────────────────
    // „Když jsi vyřazen ze hry, tvé karty vybavení se odhodí na spodek balíčku vybavení
    // lícem vzhůru. Vulture Sam je nezískává." Že je Sam nedostane, plyne z R3
    // STRUKTURÁLNĚ – gear leží mimo `board`/`hand`, takže se do jeho hrsti nemá jak
    // dostat; tady se jen uklidí. Volá handlePlayerDeath (logic/combat.js).
    _gearDropAll(playerIdx) {
        const p = this.players[playerIdx];
        if (!p || !(p.gear || []).length) return;
        this.logEvent('gear', { act: 'death_drop', who: p.name, n: p.gear.length });
        this._gearDiscard(...p.gear);
        p.gear = [];
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoldRushMixin;
} else {
    Object.assign(GameState.prototype, GoldRushMixin);
}
})();
