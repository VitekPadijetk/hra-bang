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
// Fáze F3 přidala první nový mechanismus – FRONTU VÝSTŘELŮ (`_vosShots`, R6): výstřely
// bez karty a mimo pořadí se zapíšou a odpálí, až efekt, který je vyvolal, celý doběhne
// (Opětovná palba, druhý cíl Roztříštěné kulky, Evelyn Shebang) – a KLIKANÉ ZÁSAHY
// S ÚTOČNÍKEM (R8, Dvojitá rána: dva životy, každý přes handleDamage). Smrt hráče na tahu
// mimo jeho fázi PLAY dorovnává `_turnOwnerGone` (logic/combat.js).
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

    // ── Fronta výstřelů (F3, R6) ─────────────────────────────────────────────
    // Výstřely BEZ karty a mimo pořadí (Opětovná palba, druhý cíl Roztříštěné kulky,
    // Evelyn Shebang) se nespouští hned: zapíšou se a odpálí se, až efekt, který je
    // vyvolal, CELÝ doběhne – fáze PLAY, prázdná fronta odložených akcí, nic rozdělaného
    // (pravidlo „nejdřív doběhne efekt zahrané karty"). Kdyby Opětovná palba vystřelila
    // uprostřed Kulometu, přepsala by `pendingResponse` dalšího cíle. Vzor: Roubík.
    //
    // Výstřel je bang-EFEKT (žádný Slab, žádná Odměna, Brokovnice ani Colorado) a nese
    // kontext `vos.shot`, podle kterého se pozná, že zabil střelec, ne hráč na tahu.
    _vosQueueShot(shooterIdx, targetIdx, source, sourceName) {
        if (!this._vosShots) this._vosShots = [];
        this._vosShots.push({ shooterIdx, targetIdx, source, sourceName });
    },

    // Smí se teď odpálit další výstřel? Jen v klidu – stejná dohoda jako u odložené pokuty
    // Roubíku: nic neběží, na nic se nečeká a nikdo si na dobrání fronty nenaplánoval
    // pokračování (viz „Rodina resume příznaků" v CLAUDE.md).
    _vosShotCalm() {
        if (!this._vosShots || !this._vosShots.length) return false;
        if (this.winner || this._vosHold) return false;
        if (this.phase !== "PLAY") return false;
        if (this._autoEndTurnPending || this._dorothyOwnerIdx != null) return false;
        if ((this.specialActionQueue || []).length) return false;
        if (this.drawPhaseState?.active || this.pendingCheckDraw?.active) return false;
        if (this.pendingDynamiteDamage || this.pendingNoonDamage) return false;
        if (this.pendingResponse?.active || this.pendingBarrelCheck?.active) return false;
        if (this._nextTurnAfterQueue || this._resumeBeginTurnAfterQueue ||
            this._startChecksAfterQueue || this._advanceRouletteAfterQueue ||
            this._advanceGrinnerAfterQueue || this._gagResumeAfterQueue) return false;
        return true;
    },

    // Odpal nejstarší výstřel, jde-li to. Vrací true, když se rozeběhl (hra čeká na
    // obranu) – volající pak nesmí sahat na fázi. Výstřel, jehož střelec nebo cíl mezitím
    // odešel ze hry, propadá.
    _drainVosShots() {
        if (!this._vosShotCalm()) return false;
        while (this._vosShots.length) {
            const s = this._vosShots.shift();
            const sh = this.players[s.shooterIdx], tg = this.players[s.targetIdx];
            if (!isInPlay(sh) || !isInPlay(tg)) {
                this.logEvent('special', { who: sh?.name, card: s.sourceName, target: tg?.name, msg: 'výstřel propadá' });
                continue;
            }
            this.logEvent('bang', { who: sh.name, target: tg.name, card: s.sourceName });
            this.currentAttacker = s.shooterIdx;
            this._beginBangResolution(s.shooterIdx, s.targetIdx, true, s.sourceName, null, null, { shot: s.source });
            return true;
        }
        return false;
    },

    // Spusť `fn`, aniž by se po cestě odpálil výstřel z fronty. Potřebuje to ocas fáze
    // lízání: po frontě odložených akcí se tam ještě ptá Želízka a Ranč („je fáze PLAY?")
    // a výstřel Evelyn by je přeskočil. Odpaluje se až za nimi.
    _vosHolding(fn) {
        this._vosHold = (this._vosHold || 0) + 1;
        try { return fn(); }
        finally { if (--this._vosHold <= 0) delete this._vosHold; }
    },

    // ── Opětovná palba (F3) ──────────────────────────────────────────────────
    // „Počítá se jako karta VEDLE!. Hráč, který na tebe střílel, je nyní cílem efektu
    // BANG!." Volá se z handleResponse ve chvíli, kdy je obrana DOKONČENÁ (proti Slabovi
    // je potřeba ještě jedno Vedle!, samotná Opětovná palba nestačí – dV). Platí proti
    // každému útoku, který má střelce (BANG!, bang-efekty, Kulomet, jiný výstřel zpět);
    // bez střelce (Fistful of Cards) je to jen Vedle!. Apache Kida výstřel zasáhne
    // (nemá barvu – 3. vydání).
    _vosBackfireCheck(pr, playerIdx) {
        if (!this._vosOn() || !pr) return;
        if (!(pr.partialMisses || []).some(m => m && m.card && m.card.type === CardType.BACKFIRE)) return;
        const from = pr.originatorIdx;
        if (from == null || from === playerIdx || !this.players[from]) return;
        this._vosQueueShot(playerIdx, from, 'BACKFIRE', 'Opětovná palba');
        this.logEvent('special', { who: this.players[playerIdx].name, card: 'Opětovná palba',
                                   target: this.players[from].name, msg: 'střílí zpět' });
    },

    // ── Dvojitá rána (F3, R8) ────────────────────────────────────────────────
    // „Je-li napadený hráč zasažen, ztrácí dva životy." Každý život je klikaný zásah
    // S ÚTOČNÍKEM (`pendingDynamiteDamage.attackerIdx`) – jde přes handleDamage, takže se
    // na každý život zvlášť veze valoun, El Gringo, Bart Cassidy, Teren Kill i Pivo na
    // posledním životě (mezi kliky, jako u dynamitu). Konec obrany dohraje _vosAimTail.
    _startAimHits(victimIdx, attackerIdx, hits) {
        if (this.pendingResponse) this.pendingResponse.active = false;
        this.pendingDynamiteDamage = { playerIdx: victimIdx, hitsLeft: hits, source: 'AIM', attackerIdx, resume: 'RESPOND_TAIL' };
        this.phase = "DYNAMITE_DAMAGE";
        this.logEvent('special', { who: this.players[attackerIdx]?.name, card: 'Dvojitá rána',
                                   target: this.players[victimIdx]?.name, msg: `−${hits} život` });
    },

    // Jeden klik na životy pod Dvojitou ranou (volá takeDynamiteHit, logic/combat.js).
    _vosAimClick(playerIdx) {
        const pdd = this.pendingDynamiteDamage;
        const attackerIdx = pdd.attackerIdx;
        pdd.hitsLeft--;
        const last = pdd.hitsLeft <= 0;
        if (last) this.pendingDynamiteDamage = null;
        this.handleDamage(playerIdx, attackerIdx, { killerIdx: attackerIdx });
        if (this.winner) { this.pendingDynamiteDamage = null; return; }
        const victim = this.players[playerIdx];
        // Vyřazený (nebo Teren Kill, který vyřazení pozastavil na sejmutí – snímá se jen
        // jednou, FAQ Q12): zbytek zásahů propadá. Líznutí za Úhyb mrtvý nevybere.
        if (!isInPlay(victim) || this.pendingTerenKill) {
            this.pendingDynamiteDamage = null;
            if (!isInPlay(victim)) {
                for (let i = this.specialActionQueue.length - 1; i >= 0; i--) {
                    const a = this.specialActionQueue[i];
                    if (a.type === 'UHYB_DRAW' && a.playerIdx === playerIdx) this.specialActionQueue.splice(i, 1);
                }
            }
            this._vosAimTail();
            return;
        }
        if (last) { this._vosAimTail(); return; }
        // Zbývá druhý život: líznutí Barta Cassidyho / krádež El Gringa doběhnou hned
        // a hra se přes interruptedPhase vrátí do DYNAMITE_DAMAGE.
        this._processSpecialQueue();
    },

    // Konec obrany proti BANG!u s Dvojitou ranou – totéž, co dělá handleResponse po
    // obyčejném zásahu (fáze PLAY, fronta odložených akcí, případně další výstřel).
    _vosAimTail() {
        this.pendingDynamiteDamage = null;
        if (this.pendingResponse) this.pendingResponse.active = false;
        this.phase = "PLAY";
        if (this._turnOwnerGone()) return;
        if (!this._afterFistfulHit()) this._processSpecialQueue();
        this.targetPlayer = null;
        this.currentAttacker = null;
    },

    // ── Roztříštěná kulka (F3) ───────────────────────────────────────────────
    // „Účinkuje jako BANG! na dostřel. Hráč dle tvého výběru ve vzdálenosti 1 od
    // napadeného hráče (kromě tebe) se stává také terčem efektu BANG!." Čerpá limit karet
    // BANG! (DB), ale kartou BANG! není (žádná Odměna, Brokovnice, Colorado ani Slab;
    // Kazatel ji nezakazuje). Druhý výstřel je POVINNÝ a jde i tehdy, když první minul –
    // proto se zapíše do fronty výstřelů hned teď a odpálí se po prvním. Kdo smí být
    // prvním a druhým cílem, říká fanningTargets (core/valley.js), ptá se i klient a bot.
    // Vrací true, když se karta zahrála.
    playFanning(attackerIdx, cardIdx, firstIdx, secondIdx = null) {
        if (this.phase !== "PLAY" || attackerIdx !== this.currentPlayerIndex) return false;
        const a = this.players[attackerIdx];
        const card = a?.hand[cardIdx];
        if (!card || card.type !== CardType.FANNING) return false;
        if (this._suitBlocked(attackerIdx, card)) return false;   // High Noon – Želízka
        if (!fanningOk(this, a, attackerIdx, card)) return false;
        const t = fanningTargets(this, attackerIdx).find(x => x.first === firstIdx);
        if (!t) return false;
        if (t.seconds.length) { if (!t.seconds.includes(secondIdx)) return false; }
        else secondIdx = null;

        a.bangsPlayedThisTurn++;
        a.stats.bangsFired++;
        this._trackCard(attackerIdx, card.type);
        this._markBrownPlayed(attackerIdx, card);
        this.logEvent('bang', { who: a.name, target: this.players[firstIdx].name, card: card.name,
                                ...(secondIdx != null ? { second: this.players[secondIdx].name } : {}) });
        this.deck.discard(a.hand.splice(cardIdx, 1)[0]);
        this.currentAttacker = attackerIdx;
        this.checkSuzyLafayette(a);
        if (secondIdx != null) this._vosQueueShot(attackerIdx, secondIdx, 'FANNING', card.name);

        // Apache Kid: kárový efekt BANG! ho míjí (karta je 2♠, kárová být jen nemůže –
        // pojistka pro budoucí změny barvy).
        if (this._apacheImmune(firstIdx, this._effSuit(card), attackerIdx)) {
            this.phase = "PLAY";
            this._processSpecialQueue();
            return true;
        }
        this._beginBangResolution(attackerIdx, firstIdx, true, card.name, null, null, { shot: 'FANNING' });
        this._processSpecialQueue();
        return true;
    },

    // ── Evelyn Shebang (F3) ──────────────────────────────────────────────────
    // „Ve své fázi 1 si smí líznout o 1 kartu méně, čímž automaticky vystřelí BANG! na
    // vzdálenost 1." Volí se PŘED lízáním (dV), nejvýš jedna karta a jeden cíl. Pod Žízní
    // si pak nelízne nic, pod Příjezdem vlaku 2 (Dynamite Box). Výstřel jde do fronty
    // a odpálí se po fázi lízání (bang-efekt, ne karta BANG! – BANG! smí hrát dál).
    // Volá drawCard (logic/draw.js) se zdrojem 'evelyn'.
    evelynShoot(targetIdx) {
        const ds = this.drawPhaseState;
        if (!ds || !evelynOffer(this, ds.playerIdx)) return false;
        if (!evelynTargets(this, ds.playerIdx).includes(targetIdx)) return false;
        const me = this.players[ds.playerIdx];
        ds.cardsNeeded--;
        ds.evelynUsed = true;
        ds.options = (ds.options || []).filter(o => o !== 'evelyn');
        this._vosQueueShot(ds.playerIdx, targetIdx, 'EVELYN', 'Evelyn Shebang');
        this.logEvent('special', { who: me.name, card: 'Evelyn Shebang', target: this.players[targetIdx].name,
                                   msg: 'o kartu méně → BANG!' });
        if (ds.cardsDrawn >= ds.cardsNeeded) this._finishDraw();
        return true;
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
