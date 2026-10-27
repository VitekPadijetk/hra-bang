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
// Fáze F4 přidala KOLEČKO VOLEB (`pendingVosRound`): Divoká banda, Tornádo a Poker
// nechají každého (ostatního) hráče vybrat karty z ruky – všichni naráz; u Tornáda
// a Pokeru se karty přesunou až po volbě posledního. Dokud kolečko běží, fronta odložených akcí stojí.
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
        // F4 – kolečko voleb (Divoká banda, Tornádo, Poker).
        if (this.pendingVosRound && this.phase === vosRoundPhase(this.pendingVosRound)) {
            return this._vosRoundPick(playerIdx, cardIds);
        }
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

    // ── Kolečko voleb (F4): Divoká banda, Tornádo, Poker ─────────────────────
    // Všechny tři karty nechají vybírat karty z ruky KAŽDÉHO (ostatního) hráče. Vybírají
    // VŠICHNI NARÁZ – kdo ještě nevybral, drží `waiting` – a hra počká na posledního
    // (zrychlí to hru proti kolečku po jednom jako u Indiánů). Stav:
    // `pendingVosRound = { kind, byIdx, waiting, picks, pool, playerIdx }`.
    // Pravidla „všichni najednou" (Tornádo) a skrytý výběr (Poker) splňuje to, že se karty
    // u těch dvou NIKAM nepřesouvají, dokud nevybral poslední – volby (`picks`) vidí do té
    // doby jen jejich vlastník (redactState v server/rooms.js). `playerIdx` má jen výběr
    // z vyložených karet Pokeru (POKER_TAKE) – ten dělá jediný hráč.
    //
    // Dokud kolečko běží, fronta odložených akcí se NEodbavuje (_processSpecialQueue si
    // to hlídá): Suzy Lafayette, která dala poslední kartu, si lízne až po přesunu – a u
    // Tornáda zjistí, že jí soused karty mezitím dal. Pravidlo „nejdřív doběhne efekt".
    // Odhoz je vynucený, takže Molly Stark za něj nelíže (R13) a Henry Block se
    // nespouští (dává/odhazuje sám, plán §2.9).

    // Karta z ruky hráče na tahu (cesta playCard). Karta musí z ruky ven DŘÍV, než se
    // začne vybírat – jinak by Tornádo šlo předat sousedovi spolu s ostatními kartami.
    // Vrací false (playCard ji pak už neodhazuje, odhozená je).
    _vosPlayRound(cardIndex, kind) {
        const idx = this.currentPlayerIndex;
        const p = this.players[idx];
        const card = p.hand.splice(cardIndex, 1)[0];
        this.deck.discard(card);
        this._trackCard(idx, card.type);
        this._markBrownPlayed(idx, card);
        this._startVosRound(kind, idx, this._effSuit(card));
        return false;
    },

    // Založí kolečko. `suit` = platná barva zahrané karty – Divoká banda je Q♦, takže
    // Apache Kida (i Kalumet) vynechá stejně jako kárové Indiány.
    // Tornádo: „KAŽDÝ hráč" – i ten, kdo ho zahrál. Ostatní dvě karty míří na „všechny
    // ostatní". Kdo nemá kartu, nevybírá („pokud můžou"). Pořadí v `waiting` je po směru
    // od levého souseda – jen kvůli pendingActor (popisek, log); vybírá se naráz.
    _startVosRound(kind, byIdx, suit = null) {
        const n = this.players.length;
        const span = kind === 'TORNADO' ? n : n - 1;
        const waiting = [];
        for (let k = 1; k <= span; k++) {
            const idx = (byIdx + k) % n;
            const p = this.players[idx];
            if (!isInPlay(p) || !p.hand.length) continue;
            if (kind === 'BANDIDOS' && this._apacheImmune(idx, suit, byIdx)) continue;
            waiting.push(idx);
        }
        this.pendingVosRound = { kind, byIdx, waiting, picks: [], playerIdx: null };
        return this._advanceVosRound();
    },

    // Kdo ještě vybírá, smí dál; kdo mezitím odešel ze hry nebo nemá kartu, vypadne.
    // Nikdo nezbyl → kolečko se dokončí. Vrací true, když se čeká na volbu.
    _advanceVosRound() {
        const r = this.pendingVosRound;
        if (!r) return false;
        r.waiting = r.waiting.filter(idx => {
            const p = this.players[idx];
            return isInPlay(p) && p.hand.length > 0;
        });
        if (r.waiting.length) {
            this.phase = VOS_ROUND_PHASES[r.kind];
            return true;
        }
        this._finishVosRound();
        return false;
    },

    // Hráč vybral karty (`vos_pick`). Smí kdokoli, na koho se ještě čeká – vybírá se
    // naráz. Platnost hlídá vosRoundPickOk (core/valley.js) – stejný predikát rozsvěcí
    // klientovi tlačítko a ptá se ho bot.
    // Vrací { discarded: [{ card, handIdx }] } (Divoká banda – animace odhozu),
    // { picked: true } (Tornádo, Poker), nebo null u neplatné volby.
    _vosRoundPick(playerIdx, cardIds) {
        if (!vosRoundPickOk(this, playerIdx, cardIds)) return null;
        const r = this.pendingVosRound;
        const p = this.players[playerIdx];
        let res;
        if (r.kind === 'BANDIDOS') {
            const discarded = [];
            for (const id of cardIds) {
                const i = p.hand.findIndex(c => c && c.id === id);
                const card = p.hand.splice(i, 1)[0];
                this.deck.discard(card);
                discarded.push({ card, handIdx: i });
            }
            this.logEvent('special', { who: p.name, card: 'Divoká banda',
                                       taken: discarded.map(d => d.card.name).join(', '), msg: 'odhazuje' });
            this.checkSuzyLafayette(p);
            res = { discarded };
        } else {
            r.picks.push({ playerIdx, cardIds: cardIds.slice() });
            this.logEvent('special', { who: p.name, card: r.kind === 'TORNADO' ? 'Tornádo' : 'Poker',
                                       msg: r.kind === 'TORNADO' ? `vybral ${cardIds.length} k předání` : 'vyložil kartu lícem dolů' });
            res = { picked: true };
        }
        r.waiting = r.waiting.filter(i => i !== playerIdx);
        this._advanceVosRound();
        return res;
    },

    // Další hráč ve hře po levici (po směru, i+1) – Tornádo (R12). Bez ohledu na Zlatou
    // horečku z High Noonu: efekty karet jdou vždycky po směru (FAQ H3).
    _vosLeftOf(idx) {
        const n = this.players.length;
        for (let k = 1; k < n; k++) {
            const j = (idx + k) % n;
            if (isInPlay(this.players[j])) return j;
        }
        return null;
    },

    // Volili všichni – teď se teprve něco hýbe. Karty, které si hráč vybral, se berou
    // jen pokud je pořád drží (kolečko smí mezitím přerušit nanejvýš vyřazení).
    _finishVosRound() {
        const r = this.pendingVosRound;
        if (!r) return;
        r.playerIdx = null;
        if (r.kind === 'TORNADO') {
            const moves = [];
            for (const pk of r.picks) {
                const giver = this.players[pk.playerIdx];
                if (!isInPlay(giver)) continue;
                const cards = pk.cardIds.map(id => giver.hand.find(c => c && c.id === id)).filter(Boolean);
                const toIdx = this._vosLeftOf(pk.playerIdx);
                if (!cards.length || toIdx == null) continue;
                moves.push({ fromIdx: pk.playerIdx, toIdx, cards });
            }
            // Nejdřív všem vzít, teprve pak rozdat – „všichni najednou": karta, kterou
            // hráč dostal, se v tomtéž Tornádu dál neposílá.
            for (const m of moves) {
                const g = this.players[m.fromIdx];
                for (const c of m.cards) g.hand.splice(g.hand.indexOf(c), 1);
            }
            for (const m of moves) this.players[m.toIdx].hand.push(...m.cards);
            this._vosAnimPush({ type: 'tornado_pass',
                                moves: moves.map(m => ({ fromIdx: m.fromIdx, toIdx: m.toIdx, count: m.cards.length })) });
            this.logEvent('special', { who: this.players[r.byIdx]?.name, card: 'Tornádo',
                                       msg: moves.length ? 'karty předány doleva' : 'nikdo nemá co předat' });
            this.pendingVosRound = null;
            this.players.forEach(p => this.checkSuzyLafayette(p));
            this.phase = "PLAY";
            this._processSpecialQueue();
            return;
        }
        if (r.kind === 'POKER') {
            const pool = [];
            for (const pk of r.picks) {
                const giver = this.players[pk.playerIdx];
                if (!isInPlay(giver)) continue;
                const i = giver.hand.findIndex(c => c && c.id === pk.cardIds[0]);
                if (i === -1) continue;
                pool.push({ card: giver.hand.splice(i, 1)[0], fromIdx: pk.playerIdx });
            }
            const ace = pokerHasAce(pool.map(e => e.card));
            const by = this.players[r.byIdx];
            if (pool.length) {
                // Vyložené karty jsou teď veřejné – hodnota a barva jdou s animací, aby klient
                // u Esa zvětšil kartu a zablikal na ní hodnotu (`aceIdx` = první Eso).
                this._vosAnimPush({ type: 'poker_reveal', byIdx: r.byIdx, ace,
                                    aceIdx: ace ? pool.findIndex(e => e.card.value === 'A') : -1,
                                    cards: pool.map(e => ({ id: e.card.id, fromIdx: e.fromIdx,
                                                            value: e.card.value, suit: e.card.suit })) });
            }
            this.logEvent('special', { who: by?.name, card: 'Poker',
                                       taken: pool.map(e => e.card.name).join(', '),
                                       msg: !pool.length ? 'nikdo nic nevyložil' : (ace ? 'Eso – vše do odhozu' : 'bez Esa') });
            pool.forEach(e => this.checkSuzyLafayette(this.players[e.fromIdx]));
            // S Esem (nebo když není co brát) jde všechno do odhozu hned.
            if (!pool.length || ace || !isInPlay(by)) {
                pool.forEach(e => this.deck.discard(e.card));
                this.pendingVosRound = null;
                this.phase = "PLAY";
                this._processSpecialQueue();
                return;
            }
            r.picks = [];
            r.waiting = [];
            r.pool = pool;
            r.playerIdx = r.byIdx;
            this.phase = "POKER_TAKE";
            return;
        }
        // Divoká banda: odhazovalo se průběžně, není co dokončovat.
        this.pendingVosRound = null;
        this.phase = "PLAY";
        this._processSpecialQueue();
    },

    // Poker: hráč si z vyložených karet bere „až 2" (`cardIds`, i prázdné), zbytek jde
    // do odhozu. Vrací { taken, discarded } (ID karet) pro animaci, nebo null.
    vosPokerTake(playerIdx, cardIds) {
        if (this.phase !== "POKER_TAKE" || !pokerTakeOk(this, playerIdx, cardIds)) return null;
        const r = this.pendingVosRound;
        const p = this.players[playerIdx];
        const taken = [], discarded = [];
        for (const e of r.pool) {
            if (cardIds.includes(e.card.id)) { p.hand.push(e.card); taken.push(e.card.id); }
            else { this.deck.discard(e.card); discarded.push(e.card.id); }
        }
        this.logEvent('special', { who: p.name, card: 'Poker',
                                   msg: taken.length ? `bere si ${taken.length}` : 'nic si nebere' });
        this._vosAnimPush({ type: 'poker_take', playerIdx, taken, discarded });
        this.pendingVosRound = null;
        this.phase = "PLAY";
        this._processSpecialQueue();
        return { taken, discarded };
    },

    // Animace kolečka zapisují pravidla, posílá je hák před broadcastem (flushVosAnim
    // v server/anim.js) – kolečko může doběhnout z víc akcí (vos_pick, play_card, Lee
    // Van Kliff, Zuřivá Doroty), takže se to nedá navázat na jeden handler.
    _vosAnimPush(a) {
        if (!this._vosAnim) this._vosAnim = [];
        this._vosAnim.push(a);
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
    // `noEscape` = výstřel nemíří na JEDINÝ cíl (Roztříštěná kulka se dvěma cíli), takže
    // se mu Útěkem vyhnout nejde (F6, escapeRespondOk).
    _vosQueueShot(shooterIdx, targetIdx, source, sourceName, noEscape = false) {
        if (!this._vosShots) this._vosShots = [];
        this._vosShots.push({ shooterIdx, targetIdx, source, sourceName, ...(noEscape ? { noEscape: true } : {}) });
    },

    // Smí se teď odpálit další výstřel? Jen v klidu – stejná dohoda jako u odložené pokuty
    // Roubíku: nic neběží, na nic se nečeká a nikdo si na dobrání fronty nenaplánoval
    // pokračování (viz „Rodina resume příznaků" v CLAUDE.md).
    _vosShotCalm() {
        if (!this._vosShots || !this._vosShots.length) return false;
        if (this.winner || this._vosHold) return false;
        // Henry Block (F7): akce čeká na dokončení – efekt zahrané karty ještě neskončil.
        if (this._vosSuspended) return false;
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
            // Na Ducha (F5) se nestřílí – život ztratit nemůže (computeCanHit).
            if (!isInPlay(sh) || !isInPlay(tg) || isVosGhost(tg)) {
                this.logEvent('special', { who: sh?.name, card: s.sourceName, target: tg?.name, msg: 'výstřel propadá' });
                continue;
            }
            this.logEvent('bang', { who: sh.name, target: tg.name, card: s.sourceName });
            this.currentAttacker = s.shooterIdx;
            this._beginBangResolution(s.shooterIdx, s.targetIdx, true, s.sourceName, null, null,
                                      { shot: s.source, ...(s.noEscape ? { noEscape: true } : {}) });
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
        // Se dvěma cíli nemíří kulka na jediného – Útěk ji nezruší ani jednomu (F6).
        const multi = secondIdx != null;
        if (multi) this._vosQueueShot(attackerIdx, secondIdx, 'FANNING', card.name, true);

        // Apache Kid: kárový efekt BANG! ho míjí (karta je 2♠, kárová být jen nemůže –
        // pojistka pro budoucí změny barvy).
        if (this._apacheImmune(firstIdx, this._effSuit(card), attackerIdx)) {
            this.phase = "PLAY";
            this._processSpecialQueue();
            return true;
        }
        this._beginBangResolution(attackerIdx, firstIdx, true, card.name, null, null,
                                  { shot: 'FANNING', ...(multi ? { noEscape: true } : {}) });
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

    // ── Okno úniku (F6): Útěk a Mick Defender ───────────────────────────────
    // Útěk: „Pokud jsi jediným cílem karty jiné než BANG!, vyhneš se efektu odhozením
    // této karty." Mick Defender: „Pokud je Mick jediným cílem karty, může použít kartu
    // VEDLE, aby se jejímu efektu vyhnul." Karty na jediný cíl, které nemají vlastní
    // obranu (Panika, Cat Balou, Duel, Ragtime, Kankán, Krytý vůz, Vězení, Chřestýš,
    // Odměna, opakování Lee Van Kliffem), jdou do hry jedním ze TŘÍ vstupů níž
    // (_enterTargetSelection, _placeOnTarget, _startDuel) – a ten se zastaví ve fázi
    // EVADE_OFFER, ale JEN když cíl reagovat může (R4, vosEvadable v core/valley.js).
    // Bang-efekty okno nepotřebují: Útěk je pro ně platná odpověď v RESPOND
    // (escapeRespondOk, handleResponse v logic/response.js).
    //
    // Pokračování po odmítnutí je DATA, ne funkce (`resume`):
    //   SELECTION – uložený výběr karty soupeře (`sel`), u Ragtime / Krytého vozu /
    //               Kankánu i předem zvolená oblast (`pick`), která se pak rovnou vyřeší,
    //   PLACE     – karta UŽ LEŽÍ před cílem (`cardId`): vidí ji celý stůl a únik ji
    //               jen odhodí; Johnny Kisch a Suzy se vyhodnotí až po rozhodnutí,
    //   DUEL      – uložený `pendingResponse` duelu (únik jde jen PŘED začátkem, dV).
    // Dokud okno visí, fronta odložených akcí stojí (_processSpecialQueue) a Roubík ho
    // nepřeruší (_gagCalm) – Suzy Lafayette, která zahrála poslední kartu, si lízne až
    // po rozhodnutí.

    _vosEvadeGate(attackerIdx, targetIdx, cardName, resume) {
        if (!vosEvadable(this, attackerIdx, targetIdx)) return false;
        this.pendingEvade = { targetIdx, attackerIdx, cardName, resume };
        this.phase = "EVADE_OFFER";
        this.logEvent('special', { who: this.players[targetIdx]?.name, card: cardName,
                                   msg: 'může se vyhnout (Útěk / Mick Defender)' });
        return true;
    },

    // Vstup do výběru karty soupeře (SELECTING_TARGET_CARD) pro kartu na JEDINÝ cíl.
    // Hromadné výběry (Rvačka, Daltonové, dělení mezi Vulture Samy) jdou dál napřímo –
    // že nikdo jiný fázi nezakládá, hlídá strukturální test (test/vos.evade.test.js).
    // `opts.evade` = jméno karty, když se jí smí cíl vyhnout (vybavení Zlaté horečky ne,
    // R11); `opts.pick` = { area, boardIdx } u karet, které oblast volí předem.
    // Vrací true, když se čeká na rozhodnutí cíle (volající pak na fázi nesahá).
    _enterTargetSelection(sel, opts = {}) {
        if (opts.evade && this._vosEvadeGate(sel.attackerIdx, sel.targetIdx, opts.evade,
                { kind: 'SELECTION', sel, pick: opts.pick || null })) return true;
        this.pendingSelection = sel;
        this.phase = "SELECTING_TARGET_CARD";
        if (opts.pick) this.resolveCardSelection(sel.attackerIdx, opts.pick.area, opts.pick.boardIdx);
        return false;
    },

    // Vyložení karty před cíl (Vězení, Chřestýš, Odměna, Duch). Karta leží na stole hned,
    // takže ji během rozmýšlení vidí celý stůl; únik ji odtamtud jen odhodí. Duch míří na
    // vyřazeného hráče, ten se vyhýbat nemá čím (a nechtěl by).
    _placeOnTarget(card, attIdx, tarIdx) {
        const target = this.players[tarIdx];
        target.board.push(card);
        if (card.type !== CardType.DUCH &&
            this._vosEvadeGate(attIdx, tarIdx, card.name, { kind: 'PLACE', cardId: card.id })) return true;
        this._placeSettle(card, attIdx, tarIdx);
        return false;
    },

    _placeSettle(card, attIdx, tarIdx) {
        const target = this.players[tarIdx];
        // Duch: hráč je od teď zpátky ve hře. Příznak slouží JEN k úklidu po odchodu
        // (_vosGhostSettle) – pravidla se ptají karty na stole.
        if (card.type === CardType.DUCH) {
            target._vosWasGhost = true;
            this.logEvent('event', { card: 'Duch', who: target.name, msg: `vrací se do hry (zahrál ${this.players[attIdx]?.name})` });
        }
        // Johnny Kisch (Fistful): vyložením odhodí stejnojmenné karty u stolu.
        this._johnnyKischPurge(attIdx, card.name, card);
        this.checkSuzyLafayette(this.players[attIdx]);
        this._processSpecialQueue();
    },

    // Začátek duelu. `evadable` = smí se cíl duelu vyhnout (Komplic ze Zlaté horečky ne).
    _startDuel(pr, evadable = true) {
        if (evadable && this._vosEvadeGate(pr.originatorIdx, pr.targetIdx, 'Duel',
                { kind: 'DUEL', pr })) return true;
        this.pendingResponse = pr;
        this.phase = "RESPOND";
        return false;
    },

    // Cíl se rozhodl: `cardId` = karta, kterou se vyhýbá (Útěk, nebo Mickova karta Vedle!
    // – co smí, říká evadeOptions), null = nevyhýbá se a efekt jede dál. Vrací
    // { card, handIdx, placed } pro animaci, { declined: true }, nebo null u neplatného
    // kliku (fáze pak trvá dál – odmítnout jde vždycky, takže neuvázne).
    vosEvade(playerIdx, cardId) {
        if (this.phase !== "EVADE_OFFER") return null;
        const pe = this.pendingEvade;
        if (!pe || pe.targetIdx !== playerIdx) return null;
        const p = this.players[playerIdx];
        if (cardId == null) {
            this.pendingEvade = null;
            this.logEvent('special', { who: p.name, card: pe.cardName, msg: 'nevyhýbá se' });
            this._evadeContinue(pe);
            return { declined: true };
        }
        if (!evadeOptions(this, playerIdx).some(c => c.id === cardId)) return null;
        const i = p.hand.findIndex(c => c && c.id === cardId);
        const card = p.hand.splice(i, 1)[0];
        this.deck.discard(card);
        this.pendingEvade = null;
        // Vyložená karta jde ze stolu cíle do odhozu – efekt nenastal.
        let placed = null;
        if (pe.resume.kind === 'PLACE') {
            const t = this.players[pe.targetIdx];
            const bi = t.board.findIndex(c => c && c.id === pe.resume.cardId);
            if (bi !== -1) {
                placed = { card: t.board.splice(bi, 1)[0], boardIdx: bi };
                this.deck.discard(placed.card);
            }
        }
        // Mick zahrál Úhyb jako kartu Vedle! – líznutí k němu patří (jako v obraně).
        if (card.draw) for (let k = 0; k < card.draw; k++) this.specialActionQueue.push({ type: 'UHYB_DRAW', playerIdx });
        this.logEvent('special', { who: p.name, card: card.name, target: this.players[pe.attackerIdx]?.name,
                                   msg: `vyhýbá se: ${pe.cardName}` });
        // Únik je DOBROVOLNĚ zahraná karta mimo tah → Molly Stark si lízne (R13).
        this._mollyPlayedOutOfTurn(playerIdx, false);
        this.checkSuzyLafayette(p);
        this.checkSuzyLafayette(this.players[pe.attackerIdx]);
        this.phase = "PLAY";
        this._processSpecialQueue();
        return { card, handIdx: i, placed };
    },

    // Odmítnutý únik: efekt pokračuje přesně tam, kde ho brána zastavila.
    _evadeContinue(pe) {
        const r = pe.resume;
        if (r.kind === 'SELECTION') {
            this.pendingSelection = r.sel;
            this.phase = "SELECTING_TARGET_CARD";
            if (r.pick) this.resolveCardSelection(r.sel.attackerIdx, r.pick.area, r.pick.boardIdx);
            return;
        }
        if (r.kind === 'PLACE') {
            const t = this.players[pe.targetIdx];
            const card = (t.board || []).find(c => c && c.id === r.cardId);
            this.phase = "PLAY";
            if (card) { this._placeSettle(card, pe.attackerIdx, pe.targetIdx); return; }
            this._processSpecialQueue();
            return;
        }
        if (r.kind === 'DUEL') {
            this.pendingResponse = r.pr;
            this.phase = "RESPOND";
            this._processSpecialQueue();
            return;
        }
        this.phase = "PLAY";
        this._processSpecialQueue();
    },

    // ── Duch (F5, R10) ───────────────────────────────────────────────────────
    // „Polož před vyřazeného hráče. Ten se vrací do hry se svou postavou, ale nemůže
    // získat ani ztratit žádný život." Že je hráč Duch, se ODVOZUJE z karty na stole
    // (isVosGhost, core/distance.js) – pravidla se tedy nic dalšího ptát nemusí. Tady je
    // jen ÚKLID po odchodu: kartu Duch může ze stolu sebrat deset různých cest (Panika,
    // Cat Balou, Rvačka, Daltonové, Odražená střela, Johnny Kisch, Pat Brennan, Kankán…)
    // a žádná z nich o Duchovi neví. Odvozený stav hráče vyřadí v tu ránu (isInPlay),
    // ale jeho ruka a stůl zůstaly ležet a výhra se nepřepočítala – to dorovná
    // _vosGhostSettle, až je klid. `_vosWasGhost` slouží JEN tomuhle přechodu.
    //
    // Laso (Fistful): karty na stole nemají efekt → duchové jsou vyřazeni (dV 1603935),
    // i s kartou Duch. Belle Star Ducha nevyřazuje (jinak by mizeli každý její tah).
    //
    // Odchod NENÍ vyřazení (dV 2119446, 2587683): žádná odměna za banditu, Vulture Sam,
    // Greg Digger ani Herb Hunter. Ruka i stůl jdou do odhozu animací odchodu ducha.

    // Je klid na úklid? Fáze PLAY a nic rozdělaného (stejná myšlenka jako _vosShotCalm).
    _vosGhostCalm() {
        if (this.winner || this.phase !== "PLAY") return false;
        if (this._dorothyOwnerIdx != null) return false;
        if (this._vosSuspended) return false;   // Henry Block: akce ještě nedoběhla
        if ((this.specialActionQueue || []).length) return false;
        if (this.drawPhaseState?.active || this.pendingCheckDraw?.active) return false;
        if (this.pendingDynamiteDamage || this.pendingNoonDamage) return false;
        if (this.pendingResponse?.active || this.pendingBarrelCheck?.active) return false;
        if (this.pendingSelection || this.pendingVosRound || this.pendingVultureSplit) return false;
        if (this._nextTurnAfterQueue || this._resumeBeginTurnAfterQueue ||
            this._startChecksAfterQueue || this._advanceRouletteAfterQueue ||
            this._advanceGrinnerAfterQueue || this._gagResumeAfterQueue) return false;
        return true;
    },

    // Ukliď po Duších, kteří odešli. `force` = volající si klid zaručuje sám (krok startu
    // tahu za Daltony a Lasem). Vrací true, když se tím hra pohnula tak, že volající nesmí
    // pokračovat: padl vítěz, nebo odešel hráč na tahu a tah se posunul.
    _vosGhostSettle(force = false) {
        if (!(this.players || []).some(p => p && p._vosWasGhost)) return false;
        if (!force && !this._vosGhostCalm()) return false;
        const laso = this._boardDead();
        const gone = [];
        this.players.forEach((p, i) => {
            if (!p || !p._vosWasGhost) return;
            if (p.health > 0) { p._vosWasGhost = false; return; }   // (pojistka – nová hra)
            if (isVosGhost(p) && !laso) return;                       // pořád je Duch
            this._vosGhostLeave(i, laso);
            gone.push(i);
        });
        if (!gone.length) return false;
        // Duch se do teď počítal za živého (brání výhře zákona i odpadlíka, dV 1507774).
        this.checkWinCondition();
        if (this.winner) return true;
        // Odešel hráč, kterému patří tah → tah končí (stejně jako smrt na vlastním tahu).
        if (gone.includes(this._turnOwner())) {
            if (this._vosShots) this._vosShots.length = 0;
            this.targetPlayer = null;
            this.currentAttacker = null;
            this.nextTurn();
            return true;
        }
        return false;
    },

    _vosGhostLeave(idx, laso) {
        const p = this.players[idx];
        p._vosWasGhost = false;
        const weapon = (p.weapon && p.weapon.id !== -1) ? [p.weapon] : [];
        if (p.hand.length + p.board.length + weapon.length > 0) {
            // Stejná animace jako odchod ducha Města duchů (flushGhostLeave, server/anim.js).
            // Slot je jeden – odejdou-li dva naráz (Laso), druhý odloží karty bez animace.
            if (!this._ghostLeaveAnim) {
                this._ghostLeaveAnim = {
                    playerIdx: idx,
                    blue: p.board.map(c => ({ id: c.id })),
                    weapon: weapon.length ? { id: weapon[0].id } : null,
                    hand: p.hand.map(c => ({ id: c.id })),
                };
            }
            this.deck.discard(...p.hand, ...p.board, ...weapon);
            p.hand = [];
            p.board = [];
            p.weapon = new Card(-1, "Colt .45", CardType.WEAPON, null, null, { range: 1 });
        }
        this._gearDropAll(idx);   // Zlatá horečka: vybavení jako při vyřazení
        p.health = 0;
        this.logEvent('event', { card: 'Duch', who: p.name,
            msg: laso ? 'pod Lasem karta Duch nemá efekt – odchází ze hry' : 'přišel o kartu Duch – odchází ze hry' });
    },

    // Krok startu tahu hned za efekty obou karet událostí: Daltonové („každý odhodí modrou
    // kartu") i Laso umí Ducha vyřadit dřív, než se start tahu dotočí. Odešel-li hráč na
    // tahu, posune se tah (_vosGhostSettle) – start tahu mrtvému se dotáčet nesmí.
    _vosGhostTurnStep() {
        return this._vosGhostSettle(true);
    },

    // ── Henry Block (F7, R7): pozastavená akce ──────────────────────────────
    // „Hráč, který si vezme nebo odhodí kartu z Henryho ruky nebo ležící před ním, je
    // cílem efektu BANG!." + dV: „Karta se vezme (odhodí) až POTOM, co se automatický
    // BANG! vyhodnotí" a „když zloděj umře, karta zůstává Henrymu". Je to tedy OPAK fronty
    // výstřelů (R6): nejdřív výstřel, teprve pak přesun karty.
    //
    // Hák sedí jen tam, kde kartu bere / odhazuje HRÁČ SVÝM ROZHODNUTÍM (Albi: „Vzít =
    // Panika, Ragtime, Krytý vůz, Jesse Jones, Pat Brennan; odhodit = Cat Balou, Rvačka,
    // Kankán"; DB: „neuplatní se u schopností spouštěných herními efekty jako El Gringo"):
    //   SELECTION – resolveCardSelection (Panika, Cat Balou, Ragtime, Rvačka, Kankán,
    //               Krytý vůz, opakování Lee Van Kliffem, Komplic/Láhev, Zuřivá Doroty),
    //   DRAW      – drawCard (Jesse Jones z ruky, Pat Brennan ze stolu),
    //   GEAR      – gearForceDiscard (Zlatá horečka: donucení odhodit vybavení).
    // Odražená střela (Fistful) kartu ničí uprostřed obrany – tam jde Henryho výstřel
    // výjimečně frontou výstřelů, až po zničení (_henryRicochet).
    // Nespouští se: El Gringo, Vulture Sam, Johnny Kisch, Gary Looter (automatické),
    // Daltonové a Brokovnice (odhazuje sám Henry), Divoká banda, Tornádo, Poker, Flint
    // Westwood (výměna) ani Youl Grinner (kartu dává Henry).
    //
    // Akce se místo přesunu karty zapíše do `_vosSuspended` (pokračování jako DATA, vzor
    // okna úniku) a spustí se výstřel Henry → zloděj: bang-efekt bez dostřelu, nese
    // `vos.shot = 'HENRY'` (zabil Henry, ne hráč na tahu) a `noEscape` (Útěk ho nezruší –
    // není to karta). Až obrana doběhne, _henryResume akci zavolá znovu se stejnými
    // argumenty a s `_henryPass`, takže se podruhé nestřílí („jednou za akci"). Zloděj
    // mimo hru → akce propadá a karta zůstává Henrymu. Smrt zloděje na tahu ukončí tah
    // obvyklou cestou (_turnOwnerGone).

    // Vystřelí Henry na zloděje? Jen když je Henry ve hře, zloděj je někdo jiný a umí
    // ztratit život – na Ducha (i stín a ducha Města duchů na nule) by byl výstřel jen
    // zbytečná pauza (R4), akce pak proběhne hned.
    _henryFires(henryIdx, thiefIdx) {
        if (!this._vosOn() || this._henryPass || this.winner) return false;
        if (henryIdx == null || thiefIdx == null || henryIdx === thiefIdx) return false;
        const h = this.players[henryIdx], t = this.players[thiefIdx];
        if (!h || !t || !isInPlay(h) || !hasAbility(h, "Henry Block")) return false;
        if (!isInPlay(t) || isVosGhost(t) || t.health <= 0) return false;
        return true;
    },

    // Pozastav akci `s` ({ kind, … }) a vystřel. Vrací true, když se akce pozastavila –
    // volající pak kartu NEPŘESOUVÁ a na fázi nesahá.
    _henrySuspend(henryIdx, thiefIdx, s) {
        if (!this._henryFires(henryIdx, thiefIdx)) return false;
        this._vosSuspended = { ...s, henryIdx, thiefIdx };
        this.logEvent('special', { who: this.players[henryIdx].name, card: 'Henry Block',
                                   target: this.players[thiefIdx].name, msg: 'střílí na toho, kdo mu bere kartu' });
        this.currentAttacker = henryIdx;
        this._beginBangResolution(henryIdx, thiefIdx, true, 'Henry Block', null, null,
                                  { shot: 'HENRY', noEscape: true });
        return true;
    },

    // Doběhl výstřel? Volá se z _processSpecialQueue (hned po pročištění fronty, tedy
    // PŘED schopnostmi, které výstřel spustil – Bart Cassidy, El Gringo: „nejdřív doběhne
    // efekt zahrané karty") a z _resumeAfterSpecial. Vrací true, když se akce rozeběhla
    // (volající pak na fázi nesahá); false = nic se nedělo, nebo akce propadla.
    _henryResume() {
        const s = this._vosSuspended;
        if (!s) return false;
        if (this.winner) { this._vosSuspended = null; return false; }
        // Výstřel ještě běží (obrana, barel, sejmutí, klikaný zásah).
        if (this.phase !== "PLAY") return false;
        if (this.pendingResponse?.active || this.pendingBarrelCheck?.active ||
            this.pendingCheckDraw?.active || this.currentCheck?.active || this.luckyDukeState ||
            this.pendingDynamiteDamage || this.pendingNoonDamage) return false;
        // Divoký západ – Teren Kill: výstřel zloděje „vyřadil", ale vyřazení se pozastavilo
        // na sejmutí. Jestli umře (a karta zůstane Henrymu), se ví až po něm – fronta
        // odložených akcí ho rozhodne dřív, než se sem vrátíme.
        if (this.pendingTerenKill && this.pendingTerenKill.playerIdx === s.thiefIdx) return false;
        this._vosSuspended = null;
        const thief = this.players[s.thiefIdx];
        if (!isInPlay(thief)) {
            this.logEvent('special', { who: this.players[s.henryIdx]?.name, card: 'Henry Block',
                                       target: thief?.name, msg: 'zloděj padl – karta zůstává Henrymu' });
            return false;
        }
        const before = this._henrySnap(s.henryIdx);
        delete this._henryMovedId;
        this._henryPass = true;
        try {
            if (s.kind === 'SELECTION') {
                this.pendingSelection = s.sel;
                this.phase = "SELECTING_TARGET_CARD";
                this.resolveCardSelection(s.sel.attackerIdx, s.area, this._henryCardPos(s));
            } else if (s.kind === 'DRAW') {
                const ds = this.drawPhaseState;
                if (!ds || ds.drawId !== s.drawId || ds.playerIdx !== s.thiefIdx) {
                    this._processSpecialQueue();   // (pojistka – fáze lízání mezitím zanikla)
                } else {
                    ds.active = true;
                    this.phase = "DRAW";
                    this.drawCard(s.source, s.sourceIdx, s.area, this._henryCardPos(s));
                }
            } else if (s.kind === 'GEAR') {
                this._gearForceFinish(s.thiefIdx, s.henryIdx, s.cardId);
                this.phase = "PLAY";
                this._processSpecialQueue();
            }
        } finally {
            delete this._henryPass;
        }
        this._henryMoveAnim(s, before);
        return true;
    },

    // Index karty na stole podle ID – mezi zahráním a dokončením se stůl smí přeskládat.
    // Karta, která zmizela, dá -1 (resolveCardSelection i drawCard pak nevezmou nic).
    _henryCardPos(s) {
        if (s.area !== 'board') return s.cardIdx;
        const h = this.players[s.henryIdx];
        return (h?.board || []).findIndex(c => c && c.id === s.cardId);
    },

    // Co Henry drží PŘED dokončením akce (jen ID) – z toho se dopočítá slot, odkud vzatá
    // karta odešla (vějíř ruky / pás stolu / zbraň).
    _henrySnap(idx) {
        const p = this.players[idx] || {};
        return { hand: (p.hand || []).map(c => c.id), board: (p.board || []).map(c => c.id),
                 weapon: (p.weapon && p.weapon.id !== -1) ? p.weapon.id : null };
    },

    // Animace přesunu karty po výstřelu. Akce doběhla uvnitř CIZÍ socket akce (obrana,
    // barel, záchrana Pivem…), takže si ji pravidla jen zapíšou a pošle ji hák před
    // broadcastem (flushHenryMove v server/anim.js). Vizuální slot stolu je v konvenci
    // „slot 0 = zbraň", `stolenIndex` = slot ve vějíři (karta z ruky se bere náhodně).
    // Kterou kartu akce vzala, si zapíše sama (`_henryMovedId` v resolveCardSelection
    // a drawCard) – rozdíl ruky by nestačil: hned za akcí se odbavuje fronta a ta smí
    // Henrymu sebrat další karty (odchod Ducha mu odhodí celou ruku).
    _henryMoveAnim(s, before) {
        const id = this._henryMovedId;
        delete this._henryMovedId;
        if (id == null || s.kind === 'GEAR') return;
        let m = null;
        const hi = before.hand.indexOf(id), bi = before.board.indexOf(id);
        if (hi !== -1) m = { area: 'hand', cardId: id, boardIdx: null, stolenIndex: hi };
        else if (bi !== -1) m = { area: 'board', cardId: id, boardIdx: 1 + bi, stolenIndex: null };
        else if (before.weapon === id) m = { area: 'weapon', cardId: id, boardIdx: 0, stolenIndex: null };
        if (!m) return;
        const thief = this.players[s.thiefIdx];
        const stolen = (thief?.hand || []).some(c => c && c.id === id);
        const mode = !stolen ? 'discard' : (s.kind === 'DRAW' && m.area === 'hand' ? 'jesse' : 'steal');
        this._henryAnim = { mode, thiefIdx: s.thiefIdx, henryIdx: s.henryIdx, ...m };
    },

    // Zlatá horečka – vynucené odhození vybavení (gearForceDiscard) po Henryho výstřelu.
    // Zaplaceno je už od začátku (cena je „zahraná karta"); vybavení se dohledává podle
    // ID, a kdyby mezitím zmizelo, prostě se nic neodhodí.
    _gearForceFinish(playerIdx, targetIdx, cardId) {
        const t = this.players[targetIdx];
        const gi = (t?.gear || []).findIndex(c => c && c.id === cardId);
        if (gi === -1) return null;
        const card = t.gear.splice(gi, 1)[0];
        this._gearDiscard(card);
        this.logEvent('gear', { act: 'force', who: this.players[playerIdx]?.name, target: t.name, card: card.name });
        return card;
    },

    // Fistful – Odražená střela zničila Henrymu kartu na stole. Karta zaniká uprostřed
    // obrany, takže se tu výjimečně nic nepozastavuje: výstřel jde do fronty výstřelů
    // (R6) a odpálí se, až obrana doběhne.
    _henryRicochet(henryIdx, shooterIdx) {
        if (!this._henryFires(henryIdx, shooterIdx)) return;
        this._vosQueueShot(henryIdx, shooterIdx, 'HENRY', 'Henry Block', true);
        this.logEvent('special', { who: this.players[henryIdx].name, card: 'Henry Block',
                                   target: this.players[shooterIdx].name, msg: 'střílí na toho, kdo mu zničil kartu' });
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ValleyMixin;
else Object.assign(GameState.prototype, ValleyMixin);
})();
