// logic/shadow.js — mixin GameState: varianta Stínoví pistolníci (Zlatá horečka).
// Připojuje se na GameState.prototype. Viz „Mixin pattern" v CLAUDE.md.
//
// „Při této variantě nejste nikdy mimo hru!" Vyřazený hráč se na KAŽDÝ svůj tah vrací
// jako stín: 0 životů, lízne si 2 karty, odehraje tah normálně (i se schopností postavy)
// a na konci tahu odhodí ruku i vše před sebou. Mimo svůj tah je mimo hru pro všechny
// účely – přesně jako každý jiný vyřazený.
//
// Model je Město duchů (High Noon, `_ghost`), jen s jinými pravidly:
//   • `_shadow` drží jen po dobu vlastního tahu (nastaví nextTurn, shodí _teardownShadow),
//     takže mimo tah je stín obyčejný mrtvý hráč a nic dalšího se kontrolovat nemusí;
//   • isInPlay() ho po dobu tahu počítá (vzdálenost, cíl, hokynářství), ALE
//     evaluateWinner ho nepočítá – zůstává mu `health = 0` (duch se naopak za živého
//     počítá, FAQ H7). „Stíny se nepovažují za hrající postavy";
//   • „nemůže získat ani ztratit život": ztratit ho nemůže sám od sebe (handleDamage
//     i všechny klikané zásahy nulu míjejí), získat ho nesmí `_heal` a zrcadlo `canHeal`
//     (core/distance.js), kterým se ptá klient i bot;
//   • odchod NENÍ vyřazení (FAQ Q09): Vulture Sam nic nedostane, Greg Digger ani Herb
//     Hunter se nespustí. Při PRVNÍM vyřazení naopak platí všechna pravidla – to běží
//     beze změny v handlePlayerDeath. Valouny si hráč nechává (nikde se nenulují).
//
// Stínový odpadlík: odpadlík se na začátku každého svého stínového tahu přidá k SLABŠÍ
// straně – té, které leží odhaleno víc karet rolí (bez něj samého; šerif se počítá vždy).
// Při remíze k banditům. Stranu nese `_shadowSide` ('Deputy' / 'Outlaw') a vyhrává s ní
// (playerWon v core/menuModel.js); bot podle ní střílí (teamRole v core/roles.js).
(function () {
const ShadowMixin = {
    // Volá se ze všech tří setupů (nová hra, debug, navazující hra). Navazující hra
    // přebírá hráče z předchozí, takže příznaky po nich nesmí zůstat.
    _setupShadows(options = {}) {
        this._shadowGunslingers = !!options.shadowGunslingers;
        (this.players || []).forEach(p => { p._shadow = false; p._shadowSide = null; });
    },

    _shadowsOn() {
        return !!this._shadowGunslingers;
    },

    // Nástup stínu (nextTurn, po přeskočení Mrtvého muže, Hřbitova a Města duchů).
    _enterShadow(idx) {
        const p = this.players[idx];
        if (!p) return;
        p._shadow = true;
        p.health = 0;
        // Hra pro 3 má odkryté role a cíle v kruhu – strany, ke kterým by se šlo
        // přidat, tam nejsou.
        if (p.role === 'Renegade' && !this.mode3p) p._shadowSide = this._shadowSideFor(idx);
        this.logEvent('event', { card: 'Stínoví pistolníci', who: p.name,
            msg: 'vrací se na svůj tah jako stín' +
                 (p._shadowSide ? ` (stínový ${p._shadowSide === 'Deputy' ? 'pomocník' : 'bandita'})` : '') });
    },

    // Ke které straně se stínový odpadlík přidá: spočítají se ODHALENÉ karty rolí
    // ostatních hráčů (vyřazení + šerif, ne on sám). Víc odhalených = slabší strana =
    // tam se přidá; remíza → bandité. Druhý odpadlík (8 hráčů, FAQ Q02) se počítá podle
    // strany, ke které PRÁVĚ patří, jinak se ignoruje. Odhalenou roli drží `_roleRevealed`
    // (viz CLAUDE.md – nikdy `health <= 0`).
    _shadowSideFor(idx) {
        let law = 0, outlaws = 0;
        this.players.forEach((q, i) => {
            if (i === idx || !q) return;
            if (q.role !== 'Sheriff' && !q._roleRevealed) return;
            const side = q.role === 'Renegade' ? q._shadowSide : q.role;
            if (side === 'Sheriff' || side === 'Deputy') law++;
            else if (side === 'Outlaw') outlaws++;
        });
        return law > outlaws ? 'Deputy' : 'Outlaw';
    },

    // Odhoz „ruky i všeho před sebou" (včetně vybavení Zlaté horečky). Nikdo nic nedostane
    // (FAQ Q09) – ani Vulture Sam, ani Gary Looter (to je odhoz nad limit, ne tohle).
    // Idempotentní: s prázdnýma rukama nic nedělá, takže ho _teardownShadow smí volat
    // jako pojistku po tryEndTurn.
    _shadowStrip(idx) {
        const p = this.players[idx];
        if (!p) return;
        const weapon = (p.weapon && p.weapon.id !== -1) ? [p.weapon] : [];
        if (p.hand.length + p.board.length + weapon.length > 0) {
            // Stejná animace jako odchod ducha: karty po jedné do odhozu, bez poklesu
            // životů a bez role (emituje flushGhostLeave v server/anim.js).
            this._ghostLeaveAnim = {
                playerIdx: idx,
                blue: p.board.map(c => ({ id: c.id })),
                weapon: weapon.length ? { id: weapon[0].id } : null,
                hand: p.hand.map(c => ({ id: c.id })),
            };
            this.deck.discard(...p.hand, ...p.board, ...weapon);
            p.hand = [];
            p.board = [];
            p.weapon = new Card(-1, "Colt .45", CardType.WEAPON, null, null, { range: 1 });
        }
        this._gearDropAll(idx);
        p.health = 0;
    },

    // Konec tahu stínu (nextTurn, hned za odchodem ducha). Tah nikdy nezdržuje:
    // stín se nevyřazuje, takže se nespouští žádná reakce u stolu ani vyhodnocení výhry
    // (za živého se nepočítal ani během svého tahu).
    _teardownShadow() {
        const p = this.players[this.currentPlayerIndex];
        if (!p || !p._shadow) return;
        this._shadowStrip(this.currentPlayerIndex);
        p._shadow = false;
        this.logEvent('event', { card: 'Stínoví pistolníci', who: p.name, msg: 'stín odchází ze hry' });
    },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShadowMixin;
} else {
    Object.assign(GameState.prototype, ShadowMixin);
}
})();
