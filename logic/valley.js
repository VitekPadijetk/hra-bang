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
};

if (typeof module !== 'undefined' && module.exports) module.exports = ValleyMixin;
else Object.assign(GameState.prototype, ValleyMixin);
})();
