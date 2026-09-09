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
// valouny a nedostal nic. Seznam roste s fázemi plánu (§9); ve fázi 5 bude úplný.
const GEAR_READY = ['ZH_PANAK', 'ZH_UNION_PACIFIC'];

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
        (this.players || []).forEach(p => { p.gear = []; p.nuggets = 0; });
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
    // Fáze 0: trychtýř je zapojený ze všech tří vstupů a zatím jen loguje. Těla plní
    // fáze 2 (Boty, Talisman) a 6 (Simeon Picos) – přibývají SEM, ne k volajícím.
    _afterLifeLost(playerIdx, opts = {}) {
        if (!this._goldRushOn()) return;
        const p = this.players[playerIdx];
        if (!p) return;
        this.logEvent('lifelost', {
            who: p.name, hp: p.health,
            by: opts.attackerIdx != null ? this.players[opts.attackerIdx]?.name : null,
            last: !!opts.last,
        });
    },

    // ── Dotazy ───────────────────────────────────────────────────────────────
    // „Ne dvě stejného jména" i všechny háky se ptají na `effect`, ne na `name` (R1).
    _hasGear(playerIdx, effect) {
        const p = this.players[playerIdx];
        return !!p && (p.gear || []).some(c => c.effect === effect);
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
    gearBuy(playerIdx, rowIdx) {
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
        if (card.border === 'black' && this._hasGear(playerIdx, card.effect)) return null;
        const cost = this._gearCost(playerIdx, card);
        if (!this._payNuggets(playerIdx, cost)) return null;

        // Koupená karta se nahrazuje OKAMŽITĚ (R7), ještě než se rozehraje její efekt –
        // ten může změnit fázi (Union Pacific vede na lízání), takže potom by se
        // doplnění muselo řešit odjinud.
        this.gearRow[rowIdx] = null;
        this._gearRefill();
        this.logEvent('gear', { act: 'buy', who: p.name, card: card.name, cost, border: card.border });
        if (card.border === 'black') {
            p.gear.push(card);
        } else {
            this._gearApplyBrown(playerIdx, card);
            this._gearDiscard(card);
        }
        return card;
    },

    // Soudce (Fistful) blokuje jen to, co někomu skončí před ním – tedy černý rám (R9).
    _gearJudgeBlocks(card) {
        return !!card && card.border === 'black' && this.hasEvent('SOUDCE');
    },

    // Co nákup udělá navíc, z pohledu Práva západu (léčení / líznuté karty).
    _gearLawOpts(card) {
        if (!card) return {};
        if (card.effect === 'ZH_PANAK') return { heal: 1 };
        if (card.effect === 'ZH_UNION_PACIFIC') return { draws: 4 };
        return {};
    },

    // Hnědý rám: efekt se uplatní HNED při nákupu a karta jde pod balíček. Karty, které
    // potřebují volbu, si tady jen otevřou vlastní fázi; zbytek se odbaví na místě.
    // Seznam roste s fázemi plánu (§9) – Láhev, Komplic, Rum a Zlatá horečka přijdou ve 4.
    _gearApplyBrown(playerIdx, card) {
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
            default: return;
        }
    },

    // Cíl hnědé karty s volbou (zatím jen Panák). `targetIdx` musí být ze seznamu, který
    // hra nabídla – stejná dohoda jako u Pokrevních bratří a Zuřivé Doroty.
    resolveGearTarget(playerIdx, targetIdx) {
        const pg = this.pendingGearTarget;
        if (this.phase !== "GEAR_TARGET" || !pg || pg.playerIdx !== playerIdx) return false;
        if (!pg.targets.includes(targetIdx)) return false;
        const t = this.players[targetIdx];
        this.pendingGearTarget = null;
        this.phase = "PLAY";
        const healed = this._heal(t, 1);
        this.logEvent('gear', { act: 'panak', who: this.players[playerIdx].name, target: t.name, heal: healed });
        this._processSpecialQueue();
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
