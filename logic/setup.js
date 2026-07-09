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
        if (options.expansions && options.expansions.dodge_city && typeof DODGE_CITY_CHARACTERS !== 'undefined') {
            return base.concat(DODGE_CITY_CHARACTERS);
        }
        return base;
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

        // Zakázat pokročilé karty
        if (options.noAdvancedCards) {
            const banned = ['Duel', 'Hokynářství', 'Indiáni!', 'Vězení', 'Dynamit'];
            this.deck.cards = this.deck.cards.filter(c => !banned.includes(c.type));
            console.log(`🚫 Pokročilé karty zakázány, balíček: ${this.deck.cards.length} karet`);
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
            console.log(`🎭 Hráč #${i}: ${name} – role: ${role}, výběr postav: ${p.charChoices.join(' / ')}`);
        };

        this.phase = "CHARACTER_SELECT";
        this.charSelectIndex = 0;
    },

    setupDebugGame(playerCount, playerNames = [], debugRoles = [], options = {}) {
        this.isDebug = true;
        this.options = options;
        this.deck.initializeStandardDeck(this._deckDataFor(options));

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
            console.log(`🐛 Debug hráč #${i}: ${name} – role: ${role}`);
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
        const card = new Card(cardData.id, cardData.name, resolvedType, resolvedSuit, cardData.value, cardData.props || {});
        card.effect = cardData.props?.effect || cardData.effect || null;
        // Render metadata rozšíření (Dodge City); chování přenáší konstruktor Card z props.
        card.art = cardData.art || null;
        card.exp = cardData.exp || null;
        card.border = cardData.border || null;
        p.hand.push(card);
        console.log(`🐛 Debug: ${p.name} dostává kartu ${card.name} (${resolvedType})`);
    },

    debugRemoveCard(playerIdx, area, cardIdx) {
        const p = this.players[playerIdx];
        if (!p) return;
        if (area === 'hand') {
            const card = p.hand.splice(cardIdx, 1)[0];
            if (card) this.deck.discardPile.push(card);
        } else if (area === 'board') {
            const card = p.board.splice(cardIdx, 1)[0];
            if (card) this.deck.discardPile.push(card);
        } else if (area === 'weapon') {
            if (p.weapon && p.weapon.id !== -1) {
                this.deck.discardPile.push(p.weapon);
                p.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
            }
        }
    },

    selectCharacter(playerIdx, charName) {
        const p = this.players[playerIdx];
        if (!p || p.character) return;
        if (!p.charChoices || !p.charChoices.includes(charName)) return;

        p.character = charName;
        console.log(`✅ ${p.name} si vybral: ${charName} (role: ${p.role}, HP: ${p.maxHealth})`);

        const { base, max } = healthForCharacter(charName, p.role);
        p.maxHealth = max;
        p.health = p.maxHealth;
        p._baseHealth = base;

        const allChosen = this.players.every(pl => pl.character);

        if (allChosen) {
            console.log(`🚀 Všichni vybrali postavy, hra začíná! Šerif: ${this.players.find(pl => pl.role === 'Sheriff')?.name}`);
            this.players.forEach(pl => {
                const startCards = pl._baseHealth ?? (pl.health > 0 ? pl.health - (pl.role === "Sheriff" ? 1 : 0) : pl.health);
                for (let i = 0; i < startCards; i++) pl.hand.push(this.deck.draw());
            });
            this.currentPlayerIndex = this.players.findIndex(pl => pl.role === "Sheriff");
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

    setupNextGame(playerNames, prevSurvivorChars = {}, options = {}, nextSheriffName = null) {
        this.deck.initializeStandardDeck(this._deckDataFor(options));
        this.options = options;

        // Zakázat pokročilé karty
        if (options.noAdvancedCards) {
            const banned = ['Duel', 'Hokynářství', 'Indiáni!', 'Vězení', 'Dynamit'];
            this.deck.cards = this.deck.cards.filter(c => !banned.includes(c.type));
            console.log(`🚫 Pokročilé karty zakázány, balíček: ${this.deck.cards.length} karet`);
        }

        const playerCount = playerNames.length;
        let roles = rolesForPlayerCount(playerCount);

        // Rotující šerif: pokud víme komu připadá role šerifa, přiřadíme mu ji
        if (nextSheriffName) {
            const targetIdx = playerNames.indexOf(nextSheriffName);
            if (targetIdx !== -1) {
                // Dáme šerifa cílovému hráči, ostatní role zamícháme
                roles = roles.filter(r => r !== 'Sheriff');
                this.deck.shuffleArray(roles);
                roles.splice(targetIdx, 0, 'Sheriff');
                console.log(`👑 Rotující šerif: ${nextSheriffName} (idx ${targetIdx})`);
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
                p._awaitingKeepChoice = true;
            }
            this.players.push(p);
            console.log(`🎭 Hráč #${i}: ${name} – role: ${role}${p._survivorChar ? ` (přeživší s ${p._survivorChar})` : ' (zemřelý, čeká na postavu)'}`);
        }

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
        const { max } = healthForCharacter(charName, p.role);
        p.maxHealth = max;
        p.health = p.maxHealth;
        this._checkNextGameAllChosen();
    },

    rejectCharacterForNextGame(playerIdx) {
        const p = this.players[playerIdx];
        if (!p || !p._awaitingKeepChoice) return;
        const rejectedChar = p._survivorChar;
        p._awaitingKeepChoice = false;
        p._survivorChar = null;
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
            this.currentPlayerIndex = this.players.findIndex(pl => pl.role === "Sheriff");
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
