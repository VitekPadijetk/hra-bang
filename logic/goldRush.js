// logic/goldRush.js — mixin GameState: rozšíření Zlatá horečka (Gold Rush).
//
// Na rozdíl od High Noonu, Fistfulu a Divokého západu NEPŘIDÁVÁ balíček událostí.
// Přidává tři kolmé osy, které v kódu doteď nebyly:
//   1. MĚNU        – zlaté valouny (`player.nuggets`), přibývají za způsobená zranění,
//   2. OBCHOD      – čtvrtou hromádku na stole, ze které se ve fázi 2 kupuje (fáze 1),
//   3. VYBAVENÍ    – druhou vrstvu karet před hráčem (`player.gear`), záměrně IMUNNÍ
//                    vůči všemu, co dnes umí sahat na karty na stole (rozhodnutí R3).
// Plán: docs/zlata-horecka-plan.md, podklad docs/zlata-horecka.md.
//
// Identita karty v pravidlech je `effect` (ZH_PODKOVA, …), NIKDY jméno – „Zlatá horečka"
// se jmenuje rozšíření, jedna karta vybavení A ZÁROVEŇ existující karta událostí High
// Noonu (klíč ZLATA_HORECKA, id 305). Do jmenného prostoru `hasEvent` proto rozšíření
// vůbec nevstupuje (rozhodnutí R1).
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

const GoldRushMixin = {
    // ── Příprava balíčku vybavení (setupGame / setupDebugGame / setupNextGame) ──
    // Bez zapnutého rozšíření zůstane balíček prázdný, `_goldRushOn()` vrací false
    // a všechny háky v pravidlech jsou no-op.
    //
    // Navazující hra přebírá hráče z předchozí, takže se valouny i koupené vybavení
    // musí vynulovat tady – jinak by si do nové hry každý přinesl své jmění.
    _setupGearDeck(options = {}) {
        this.gearDeck = [];
        this.gearRow = [null, null, null];   // obchod: 3 karty lícem vzhůru (fáze 1)
        this.gearPile = [];
        this._goldRush = false;
        (this.players || []).forEach(p => { p.gear = []; p.nuggets = 0; });
        const on = options.expansions && options.expansions.zlata_horecka;
        if (!on || !Array.isArray(this.gearCardData)) return;
        this._goldRush = true;

        const pool = [];
        this.gearCardData.forEach(kind => pool.push(...gearPieces(kind)));
        this.deck.shuffleArray(pool);
        this.gearDeck = pool;
        this.logEvent('system', { msg: `Zlatá horečka: balíček vybavení (${this.gearDeck.length} karet)` });
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
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoldRushMixin;
} else {
    Object.assign(GameState.prototype, GoldRushMixin);
}
})();
