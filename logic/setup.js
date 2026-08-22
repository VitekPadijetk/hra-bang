// logic/setup.js — mixin GameState: setup hry, výběr postav, setup další hry.
// Připojuje se na GameState.prototype (browser: <script> po logic.js; Node: require z logic.js).
// Globály v těle (CardType, ALL_CHARACTERS, rolesForPlayerCount, healthForCharacter, Player, Card)
// poskytuje logic.js (browser <script> dříve / Node globalThis shim).
(function () {
const SetupMixin = {
    // Data balíčku: základ + (volitelně) karty rozšíření Dodge City.
    // Rozšíření zapnuto přes options.expansions.dodge_city; data dodá server
    // (gs.dodgeCityCardData). Když chybí, vrací jen základní balíček.
    // Pool postav pro výběr: základ + postavy Dodge City, když je rozšíření zapnuté.
    _characterPool(options = {}) {
        const base = [...ALL_CHARACTERS];
        const exps = options.expansions || {};
        if (exps.dodge_city && typeof DODGE_CITY_CHARACTERS !== 'undefined') {
            base.push(...DODGE_CITY_CHARACTERS);
        }
        if (exps.fistful && typeof FISTFUL_CHARACTERS !== 'undefined') {
            base.push(...FISTFUL_CHARACTERS);
        }
        return base;
    },

    // Zapne pravidla pro 3 hráče (Město duchů), pokud u stolu opravdu platí – tedy když
    // sedí tři a nikdo z nich není šerif. Volá se z obou setupů; debug hra si role losuje
    // ze všech čtyř, takže tam šerif být může a jede klasika.
    _applyThreePlayerMode() {
        this.mode3p = isThreePlayerMode(this.players);
        this._winClaim3p = null;
        if (this.mode3p) {
            this.logEvent('system', {
                msg: `Hra pro 3 (Město duchů): role jsou odkryté, cíle v kruhu – ` +
                     this.players.map(p => `${p.name} (${p.role}) loví ${TARGET_3P[p.role]}`).join(', '),
            });
        }
    },

    _deckDataFor(options = {}) {
        if (options.expansions && options.expansions.dodge_city && Array.isArray(this.dodgeCityCardData)) {
            return this.cardData.concat(this.dodgeCityCardData);
        }
        return this.cardData;
    },

    setupGame(playerCount, playerNames = [], options = {}) {
        this.deck.initializeStandardDeck(this._deckDataFor(options));
        this.options = options;
        this._setupEventDeck(options);   // High Noon: balíček událostí (jinak no-op)
        this._setupFistfulDeck(options); // Fistful of Cards: druhý balíček (jinak no-op)

        // Zakázat pokročilé karty
        if (options.noAdvancedCards) {
            const banned = ['Duel', 'Hokynářství', 'Indiáni!', 'Vězení', 'Dynamit'];
            this.deck.cards = this.deck.cards.filter(c => !banned.includes(c.type));
            this.logEvent('system', { msg: `Pokročilé karty zakázány, balíček: ${this.deck.cards.length} karet` });
        }

        let roles = rolesForPlayerCount(playerCount);

        this.deck.shuffleArray(roles);

        let chars = this._characterPool(options);
        this.deck.shuffleArray(chars);

        this.players = [];
        for (let i = 0; i < playerCount; i++) {
            const role = roles[i];
            const name = playerNames[i] || `Hráč ${i + 1}`;
            const p = new Player(name, role, null, 4);
            if (options.singleChar) {
                // Náhodná postava bez výběru – rovnou přiřadit
                p.charChoices = [chars.pop()];
            } else {
                p.charChoices = [chars.pop(), chars.pop()];
            }
            this.players.push(p);
            this.logEvent('system', { msg: `Hráč #${i}: ${name} – role: ${role}, výběr postav: ${p.charChoices.join(' / ')}` });
        };

        this._applyThreePlayerMode();
        this.phase = "CHARACTER_SELECT";
        this.charSelectIndex = 0;
    },

    setupDebugGame(playerCount, playerNames = [], debugRoles = [], options = {}) {
        this.isDebug = true;
        this.options = options;
        this.deck.initializeStandardDeck(this._deckDataFor(options));
        this._setupEventDeck(options);   // High Noon: balíček událostí (jinak no-op)
        this._setupFistfulDeck(options); // Fistful of Cards: druhý balíček (jinak no-op)

        let roles = [...debugRoles];
        const allRoles = ["Sheriff", "Deputy", "Outlaw", "Renegade"];
        while (roles.length < playerCount) {
            roles.push(allRoles[Math.floor(Math.random() * allRoles.length)]);
        }
        roles = roles.slice(0, playerCount);
        this.deck.shuffleArray(roles);

        let chars = this._characterPool(options);
        this.deck.shuffleArray(chars);

        this.players = [];
        for (let i = 0; i < playerCount; i++) {
            const role = roles[i];
            const name = playerNames[i] || `Debug${i + 1}`;
            const p = new Player(name, role, null, 4);
            p.charChoices = this._characterPool(options);
            this.players.push(p);
            this.logEvent('system', { msg: `Debug hráč #${i}: ${name} – role: ${role}` });
        }

        this.phase = "CHARACTER_SELECT";
        this.charSelectIndex = 0;
    },

    debugGiveCard(playerIdx, cardData) {
        const p = this.players[playerIdx];
        if (!p || p.health <= 0) return;
        const resolvedType = CardType[cardData.type] || cardData.type;
        // cards.json drží barvu jako klíč ("DIAMONDS"…); reálný balíček ji mapuje přes
        // Suits[...] na symbol ('♦️'). Debug karty to musí dělat taky, jinak by např.
        // Apache Kidova imunita vůči ♦ (porovnává se Suits.DIAMONDS) na givenutých kartách
        // nefungovala.
        const resolvedSuit = Suits[cardData.suit] || cardData.suit;
        // Karta MUSÍ dostat nové, nikde nepoužité id. Kopie s původním id zůstává v
        // balíčku (creative ji odtud nebere) a při druhém rozdání téže karty by v ruce
        // ležely dvě se stejným id – klient přitom drží identitu karty právě podle id
        // (reflow slide `h<id>`, staging líznutí, zoom, výběr cíle). Dvě karty s jedním
        // id = jeden klíč na dvou pozicích: obě se schovají a plovoucí sprite mezi nimi
        // donekonečna lítá sem a tam. Původní id si karta nese v `texId`, ať si klient
        // najde správnou grafiku (textury card_<id> se pečou z cards.json).
        this._debugCardSeq = (this._debugCardSeq || 0) + 1;
        const uniqueId = 100000 + this._debugCardSeq;
        const card = new Card(uniqueId, cardData.name, resolvedType, resolvedSuit, cardData.value, cardData.props || {});
        card.texId = cardData.id;
        card.effect = cardData.props?.effect || cardData.effect || null;
        // Render metadata rozšíření (Dodge City); chování přenáší konstruktor Card z props.
        card.art = cardData.art || null;
        card.exp = cardData.exp || null;
        card.border = cardData.border || null;
        p.hand.push(card);
        this.logEvent('system', { msg: `Debug: ${p.name} dostává kartu ${card.name} (${resolvedType})` });
    },

    debugRemoveCard(playerIdx, area, cardIdx) {
        const p = this.players[playerIdx];
        if (!p) return;
        if (area === 'hand') {
            const card = p.hand.splice(cardIdx, 1)[0];
            if (card) this.deck.discard(card);
        } else if (area === 'board') {
            const card = p.board.splice(cardIdx, 1)[0];
            if (card) this.deck.discard(card);
        } else if (area === 'weapon') {
            if (p.weapon && p.weapon.id !== -1) {
                this.deck.discard(p.weapon);
                p.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
            }
        }
    },

    selectCharacter(playerIdx, charName) {
        const p = this.players[playerIdx];
        if (!p || p.character) return;
        if (!p.charChoices || !p.charChoices.includes(charName)) return;

        p.character = charName;
        this.logEvent('system', { msg: `${p.name} si vybral: ${charName} (role: ${p.role}, HP: ${p.maxHealth})` });

        const { base, max } = healthForCharacter(charName, p.role);
        p.maxHealth = max;
        p.health = p.maxHealth;
        p._baseHealth = base;

        const allChosen = this.players.every(pl => pl.character);

        if (allChosen) {
            const firstIdx = this._firstPlayerIndex();
            this.logEvent('system', { msg: `Všichni vybrali postavy, hra začíná! Začíná: ${this.players[firstIdx]?.name} (${this.players[firstIdx]?.role})` });
            this.players.forEach(pl => {
                const startCards = pl._baseHealth ?? (pl.health > 0 ? pl.health - (pl.role === "Sheriff" ? 1 : 0) : pl.health);
                for (let i = 0; i < startCards; i++) pl.hand.push(this.deck.draw());
            });
            this._dealSecondIdentities();   // High Noon (přibalené): druhá postava lícem dolů
            this.currentPlayerIndex = firstIdx;
            // První tah hry nejde přes nextTurn – start tahu (High Noon) proto ručně.
            if (this._beginTurn()) return;
            this.handleStartOfTurnChecks();
        }
    },

    // Auto-přiřazení postav (singleChar mode) — zavolá se ze serveru
    autoSelectAllCharacters() {
        this.players.forEach((p, idx) => {
            if (!p.character && p.charChoices && p.charChoices.length > 0) {
                this.selectCharacter(idx, p.charChoices[0]);
            }
        });
    },

    startFirstTurn() {
        this.turnId = (this.turnId || 0) + 1;   // první tah = turnId 1 (viz zelené karty)
        const p = this.getCurrentPlayer();
        p.hand.push(this.deck.draw(), this.deck.draw());
    },

    // prevSurvivorHealth: kolik životů měl přeživší na konci minulé hry – jen pro
    // zobrazení během intra navazující hry (postava leží na stole s tolika životy,
    // kolik jich měla). Po rozhodnutí „nechám si ji" se doplní na maximum.
    setupNextGame(playerNames, prevSurvivorChars = {}, options = {}, nextSheriffName = null, prevSurvivorHealth = {}) {
        this.deck.initializeStandardDeck(this._deckDataFor(options));
        this.options = options;
        this._setupEventDeck(options);   // High Noon: balíček událostí (jinak no-op)
        this._setupFistfulDeck(options); // Fistful of Cards: druhý balíček (jinak no-op)

        // Zakázat pokročilé karty
        if (options.noAdvancedCards) {
            const banned = ['Duel', 'Hokynářství', 'Indiáni!', 'Vězení', 'Dynamit'];
            this.deck.cards = this.deck.cards.filter(c => !banned.includes(c.type));
            this.logEvent('system', { msg: `Pokročilé karty zakázány, balíček: ${this.deck.cards.length} karet` });
        }

        const playerCount = playerNames.length;
        let roles = rolesForPlayerCount(playerCount);

        // Rotující šerif: pokud víme komu připadá role šerifa, přiřadíme mu ji. Ve hře pro
        // 3 (Město duchů) šerif není – rotuje se pomocník, tedy hráč, který začíná. Bez
        // toho by filter neodebral nic a splice by do 3členné hry přidal ČTVRTOU roli.
        const rotatedRole = roles.includes('Sheriff') ? 'Sheriff' : 'Deputy';
        if (nextSheriffName) {
            const targetIdx = playerNames.indexOf(nextSheriffName);
            if (targetIdx !== -1) {
                // Dáme rotovanou roli cílovému hráči, ostatní role zamícháme
                roles = roles.filter(r => r !== rotatedRole);
                this.deck.shuffleArray(roles);
                roles.splice(targetIdx, 0, rotatedRole);
                this.logEvent('system', { msg: `Rotující ${rotatedRole}: ${nextSheriffName} (idx ${targetIdx})` });
            } else {
                this.deck.shuffleArray(roles);
            }
        } else {
            this.deck.shuffleArray(roles);
        }

        const reservedChars = Object.values(prevSurvivorChars);
        let chars = this._characterPool(options).filter(c => !reservedChars.includes(c));
        this.deck.shuffleArray(chars);

        this.players = [];
        for (let i = 0; i < playerCount; i++) {
            const role = roles[i];
            const name = playerNames[i] || `Hráč ${i + 1}`;
            const p = new Player(name, role, null, 4);
            if (prevSurvivorChars[i]) {
                p._survivorChar = prevSurvivorChars[i];
                p._survivorHealth = prevSurvivorHealth[i] ?? null;
                p._awaitingKeepChoice = true;
            }
            this.players.push(p);
            this.logEvent('system', { msg: `Hráč #${i}: ${name} – role: ${role}${p._survivorChar ? ` (přeživší s ${p._survivorChar})` : ' (zemřelý, čeká na postavu)'}` });
        }

        this._applyThreePlayerMode();
        this._remainingChars = chars;
        this.phase = "CHARACTER_SELECT";

        const hasSurvivors = this.players.some(p => p._awaitingKeepChoice);
        if (!hasSurvivors) this._checkNextGameAllChosen();
    },

    selectCharacterForNextGame(playerIdx) {
        const p = this.players[playerIdx];
        if (!p) return;
        const charName = p._survivorChar;
        if (!charName) return;
        p.character = charName;
        p._awaitingKeepChoice = false;
        p._survivorChar = null;
        p._survivorHealth = null;
        const { base, max } = healthForCharacter(charName, p.role);
        p.maxHealth = max;
        p.health = p.maxHealth;
        // _baseHealth = počet startovních karet (viz _checkNextGameAllChosen a
        // intro rozdávání). Bez něj by šerif-přeživší dostal v animaci o kartu víc.
        p._baseHealth = base;
        this._checkNextGameAllChosen();
    },

    rejectCharacterForNextGame(playerIdx) {
        const p = this.players[playerIdx];
        if (!p || !p._awaitingKeepChoice) return;
        const rejectedChar = p._survivorChar;
        p._awaitingKeepChoice = false;
        p._survivorChar = null;
        p._survivorHealth = null;
        p.character = null;
        if (rejectedChar && this._remainingChars) {
            this._remainingChars.push(rejectedChar);
            this.deck.shuffleArray(this._remainingChars);
        }
        this._checkNextGameAllChosen();
    },

    _checkNextGameAllChosen() {
        const waiting = this.players.filter(p => p._awaitingKeepChoice);
        if (waiting.length > 0) return;

        const chars = this._remainingChars || [];
        this.players.forEach(p => {
            if (!p.character && !p.charChoices) {
                if (this.options?.singleChar) {
                    p.charChoices = [chars.pop()].filter(Boolean);
                } else {
                    p.charChoices = [chars.pop(), chars.pop()].filter(Boolean);
                }
            }
        });

        const allChosen = this.players.every(p => p.character);
        if (allChosen) {
            this.players.forEach(pl => {
                const startCards = pl._baseHealth ?? (pl.role === "Sheriff" ? pl.health - 1 : pl.health);
                for (let i = 0; i < startCards; i++) pl.hand.push(this.deck.draw());
            });
            this._dealSecondIdentities();   // High Noon (přibalené): druhá postava lícem dolů
            this.currentPlayerIndex = this._firstPlayerIndex();
            // První tah hry nejde přes nextTurn – start tahu (High Noon) proto ručně.
            if (this._beginTurn()) return;
            this.handleStartOfTurnChecks();
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SetupMixin;
} else {
    Object.assign(GameState.prototype, SetupMixin);
}
})();
