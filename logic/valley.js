// logic/valley.js — mixin GameState: rozšíření Údolí stínů (The Valley of Shadows).
// Připojuje se na GameState.prototype (browser: <script> po logic.js; Node: require z logic.js).
// Globály v těle (vosOn, hasDuchCard, …) poskytuje core/valley.js (browser <script> dříve /
// Node shim v logic.js).
//
// Plán: docs/udoli-stinu-plan.md. Rozšíření nepřidává balíček ani nic na stůl – 16 karet
// jde do hlavního balíčku (jen hotové druhy, VOS_CARDS_READY) a 5 postav do výběru.
// Sem patří všechno, co nemá domov jinde: fronta výstřelů (F3), hromadné skryté volby (F4),
// Duch (F5), okna reakcí (F6, F8) a pozastavená akce Henryho Blocka (F7).
//
// Fáze F2 přidala obě postavy bez nových mechanismů: Colorado Bill (sejmutí při kartě
// BANG!, ♠ = nezrušitelný) a Limonádový Jim (nabídka „odhoď kartu za +1 život" za cizí
// Pivo, fáze LEMONADE_OFFER).
//
// Fáze F1 sedí většinou na existujících hácích – tady je jen to, co patří zásahu kartou
// BANG! (Odměna, Brokovnice). Ostatní karty F1:
//   Tomahawk      – jen data (bang-efekt s dostřelem 2, cards.udoli_stinu.json),
//   Poslední pivo – cardEffects v playCard (logic/play.js),
//   Chřestýš      – kontroly na začátku tahu (logic/checks.js), vyložení v playSpecialCard,
//   Lemat         – playBang + lematBangOk/altBangOk (core/playability.js).
(function () {
const ValleyMixin = {
    // Je rozšíření zapnuté? Zrcadlo `vosOn` (core/valley.js) pro klienta a bota.
    _vosOn() {
        return vosOn(this);
    },

    // ── Zásah KARTOU BANG! ───────────────────────────────────────────────────
    // Volá se na obou místech, kde útok „trefil": obránce zásah přijal (handleResponse)
    // a obránce na posledním životě se zachránil Pivem / Sidem / Batohem
    // (_advanceAfterLastLifeSave) – záchrana vrací život, zásah to ale byl.
    // Útok si od zahrání nese `pr.vos = { bangCard, shotgun }` (playBang), protože karta
    // už tou dobou leží v odhozu (R5). Po Vedle! nebo Barelu sem nic nedojde.
    //
    // Obojí jde do fronty odložených akcí PŘED zranění (volající nás volá dřív než
    // handleDamage), takže pořadí je to z dV: Brokovnice → Odměna → El Gringo.
    _vosOnBangHit(pr) {
        if (!pr || !pr.vos || !pr.vos.bangCard) return;
        const targetIdx = pr.targetIdx;
        const originatorIdx = pr.originatorIdx;
        const target = this.players[targetIdx];
        const shooter = originatorIdx != null ? this.players[originatorIdx] : null;
        if (!target || !shooter) return;

        // Brokovnice: „Hráč zasažený kartou BANG! z této zbraně musí odhodit kartu z ruky
        // dle svého výběru (pokud nějakou má)." Zbraň se posoudila při výstřelu; jestli
        // má zasažený co odhodit, se ptá až fronta (_pruneSuzyQueue) – zásah ho může
        // vyřadit a jeho karty uklidit. Odhoz je vynucený: Molly Stark za něj nelíže
        // (R13) a Henry Block se nespouští, odhazuje sám.
        if (pr.vos.shotgun && target.hand.length > 0) {
            this.specialActionQueue.push({ type: 'SHOTGUN_DISCARD', playerIdx: targetIdx, attackerIdx: originatorIdx });
            this.logEvent('special', { who: shooter.name, card: 'Brokovnice', target: target.name, msg: 'odhodí kartu' });
        }

        // Odměna: „Kdo zasáhne hráče s kartou Odměna kartou BANG!, lízne si kartu." Platí
        // i tehdy, když zásah cíl vyřadil – proto se čte TEĎ, než smrt stůl uklidí.
        // Laso (karty na stole nemají efekt) a Belle Star (v jejím tahu cizí karty na
        // stole neplatí) ji vypínají.
        const bounty = !this._boardDead() && !this._belleIgnoresBoard(originatorIdx) &&
                       (target.board || []).some(c => c && c.type === CardType.BOUNTY);
        if (bounty) {
            this.specialActionQueue.push({ type: 'KILL_REWARD', playerIdx: originatorIdx, cardsNeeded: 1, label: 'Odměna' });
            this.logEvent('special', { who: shooter.name, card: 'Odměna', target: target.name, msg: 'lízne si kartu' });
        }
    },

    // ── Brokovnice: odhoz karty dle volby (fáze SHOTGUN_DISCARD) ─────────────────
    // `cardIds` = pole kvůli společné akci `vos_pick` (Tornádo/Poker/Divoká banda vybírají
    // víc karet, F4); Brokovnice bere právě jednu. Vrací { card, handIdx } pro animaci,
    // nebo null u neplatného kliku (fáze pak trvá dál).
    vosPick(playerIdx, cardIds) {
        if (this.phase === "SHOTGUN_DISCARD") {
            const ps = this.pendingShotgun;
            if (!ps || ps.playerIdx !== playerIdx) return null;
            const ids = Array.isArray(cardIds) ? cardIds : [];
            if (ids.length !== 1) return null;
            const p = this.players[playerIdx];
            const i = (p?.hand || []).findIndex(c => c && c.id === ids[0]);
            if (i === -1) return null;
            const card = p.hand.splice(i, 1)[0];
            this.deck.discard(card);
            this.pendingShotgun = null;
            this.logEvent('special', { who: p.name, card: 'Brokovnice', taken: card.name, msg: 'odhazuje' });
            // Poslední kartou se vyprázdnila ruka → Suzy Lafayette si líže. Líznutí jde
            // frontou, takže se odbaví v pořadí za tím, co už čeká (Odměna, El Gringo).
            this.checkSuzyLafayette(p);
            this._resumeAfterSpecial();
            return { card, handIdx: i };
        }
        return null;
    },

    // ── Colorado Bill (F2) ───────────────────────────────────────────────────
    // „Když zahraješ kartu BANG!, sejmi. Pokud je sejmutá karta piková ♠, nelze tento
    // BANG! zrušit." (znění Dynamite Boxu). Hák sedí v playBang, hned za Apache Kidem
    // (kárový BANG!, který na Apache nemá efekt, se nesnímá – nebylo by co rušit).
    // Sejmutí jde existující cestou CHECK_DRAW → CHECKING → _applyCheckResult (reason
    // `COLORADO`), takže se veze Lucky Duke, Podkova, John Pain, cinematika i bot.
    // Rozehraný BANG! si sejmutí nese v `colorado` a dohraje ho _coloradoResult.
    _startColorado(attackerIdx, targetIdx, isEffect, sourceName, vos) {
        this.pendingCheckDraw = {
            active: true, playerIdx: attackerIdx,
            dynamiteIdx: null, jailIdx: null, reason: 'COLORADO',
            colorado: { attackerIdx, targetIdx, isEffect: !!isEffect, sourceName, vos },
        };
        this.phase = "CHECK_DRAW";
    },

    // Výsledek sejmutí: ♠ = útok dostane `vos.unavoidable` (žádný Barel, Jourdonnais ani
    // karta Vedle! – viz vosUnavoidable), jinak běží jako každý jiný BANG!. Mezi zahráním
    // a sejmutím se nic odehrát nemůže (nanejvýš líznutí Suzy Lafayette), takže cíl je
    // pořád ve hře; pojistka je tu jen pro jistotu, ať hra nikdy neuvázne.
    _coloradoResult(check, spade) {
        const c = check && check.colorado;
        if (!c || !isInPlay(this.players[c.targetIdx]) || !isInPlay(this.players[c.attackerIdx])) {
            this.phase = "PLAY";
            this._processSpecialQueue();
            return;
        }
        const vos = spade ? { ...c.vos, unavoidable: true } : c.vos;
        this._beginBangResolution(c.attackerIdx, c.targetIdx, c.isEffect, c.sourceName, null, null, vos);
        this._processSpecialQueue();
    },

    // ── Limonádový Jim (F2) ──────────────────────────────────────────────────
    // „Vždy, když některý z hráčů zahraje kartu PIVO, může si Jim za odhození libovolné
    // karty doplnit 1 život." + upřesnění Albi: „Nemůže použít svou schopnost, když on
    // sám hraje PIVO." Volá ho trychtýř na KARTU Pivo `_onBeerCardPlayed`
    // (logic/characters.js) ze všech tří cest, kudy se Pivo hraje – Salón, Whisky,
    // Poslední pivo ani Láhev kartou Pivo nejsou, takže sem nechodí.
    //
    // Nabídka jde do FRONTY odložených akcí (fáze LEMONADE_OFFER, vzor Madam Yto):
    // platí „nejdřív doběhne efekt zahrané karty" a fronta ji zahodí, kdyby Jim mezitím
    // odešel ze hry nebo neměl kam léčit (_pruneSuzyQueue). Víc Jimů u stolu jde jen přes
    // Veru Custer / Greygoryho Decka – každý dostane svou nabídku.
    _lemonadeOnBeer(beerByIdx) {
        if (!this._vosOn()) return;
        this.players.forEach((p, i) => {
            if (i === beerByIdx || !hasAbility(p, "Limonádový Jim") || !lemonadeEligible(p)) return;
            this.specialActionQueue.push({ type: 'LEMONADE_OFFER', playerIdx: i, beerByIdx });
        });
    },

    // Jim odpovídá na nabídku: `cardId` = karta z ruky, kterou odhodí za +1 život;
    // null = nechce. Vrací { card, handIdx } pro animaci, { declined: true }, nebo null
    // u neplatného kliku (fáze pak trvá dál – odmítnout jde vždycky, takže neuvázne).
    lemonadeChoice(playerIdx, cardId) {
        if (this.phase !== "LEMONADE_OFFER") return null;
        const pl = this.pendingLemonade;
        if (!pl || pl.playerIdx !== playerIdx) return null;
        const p = this.players[playerIdx];
        if (cardId == null) {
            this.pendingLemonade = null;
            this.logEvent('special', { who: p.name, card: 'Limonádový Jim', msg: 'nechce' });
            this._resumeAfterSpecial();
            return { declined: true };
        }
        const i = (p?.hand || []).findIndex(c => c && c.id === cardId);
        if (i === -1 || !canHeal(p)) return null;
        // Fistful – Právo západu: vynucenou kartu schopnost odhodit nesmí (stejně jako
        // u Sida Ketchuma). Mimo vlastní tah se to netýká (lawProtectedCard to ví).
        if (this._lawProtected(playerIdx, p.hand[i])) return null;
        const card = p.hand.splice(i, 1)[0];
        this.deck.discard(card);
        this.pendingLemonade = null;
        this._heal(p, 1);
        this.logEvent('special', { who: p.name, card: 'Limonádový Jim', taken: card.name, msg: 'odhazuje za +1 život' });
        // Odhoz je DOBROVOLNÝ (Jim se rozhodl) → Molly Stark si za něj mimo tah lízne
        // (R13) a Suzy Lafayette s vyprázdněnou rukou taky.
        this._mollyPlayedOutOfTurn(playerIdx, false);
        this.checkSuzyLafayette(p);
        this._resumeAfterSpecial();
        return { card, handIdx: i };
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ValleyMixin;
else Object.assign(GameState.prototype, ValleyMixin);
})();
