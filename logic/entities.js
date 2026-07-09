// logic/entities.js — datové/hodnotové třídy a konstanty Bang!.
// Izomorfní: v prohlížeči globály (načteno PŘED logic.js), v Node přes require z logic.js.

const CardType = {
    BANG: 'Bang!',
    MISSED: 'Vedle!',
    BEER: 'Pivo',
    STAGECOACH: 'Dostavník',
    WELLS_FARGO: 'Wells Fargo',
    STORE: 'Hokynářství',
    WEAPON: 'Zbraň',
    EQUIPMENT: 'Vybavení',
    INDIANS: 'Indiáni!',
    GATLING: 'Kulomet',
    JAIL: 'Vězení',
    DYNAMITE: 'Dynamit',
    BARREL: 'Barel',
    PANIC: 'Panika!',
    CAT_BALOU: 'Cat Balou',
    SALOON: 'Salon',
    DUEL: 'Duel',
    // ── Rozšíření Dodge City ──────────────────────────────────────────────
    UHYB: 'Úhyb',
    PUNCH: 'Úder',
    SPRINGFIELD: 'Springfield',
    TEQUILA: 'Tequila',
    WHISKY: 'Whisky',
    RAGTIME: 'Ragtime',
    BRAWL: 'Rvačka',
    IRON_PLATE: 'Železný plát',
    STETSON: 'Stetson',
    SOMBRERO: 'Sombrero',
    BIBLE: 'Bible',
    PEPPERBOX: 'Pepperbox',
    BUFFALO_RIFLE: 'Puška na bizony',
    KNIFE: 'Nůž',
    DERRINGER: 'Derringer',
    CANTEEN: 'Čutora',
    COVERED_WAGON: 'Krytý vůz',
    CAN_CAN: 'Kankán',
    PONY_EXPRESS: 'Pony express',
    HOWITZER: 'Houfnice'
};

const Suits = { HEARTS: '♥️', DIAMONDS: '♦️', SPADES: '♠️', CLUBS: '♣️' };

const ALL_CHARACTERS = [
    "Bart Cassidy", "Black Jack", "Calamity Janet", "El Gringo",
    "Jesse Jones", "Jourdonnais", "Kit Carlson", "Lucky Duke",
    "Paul Regret", "Pedro Ramirez", "Rose Doolan", "Sid Ketchum",
    "Slab the Killer", "Suzy Lafayette", "Vulture Sam", "Willy the Kid"
];

// Postavy rozšíření Dodge City zařazené do výběru. Fáze 7 přidává globální/kopírovací
// schopnosti: Apache Kid (imunita vůči ♦), Belle Star (ruší cizí karty na stole ve svém
// tahu), Vera Custer (kopíruje cizí schopnost).
const DODGE_CITY_CHARACTERS = [
    "Apache Kid", "Belle Star", "Bill Noface", "Chuck Wengam", "Doc Holyday",
    "Elena Fuente", "Greg Digger", "Herb Hunter", "José Delgado", "Molly Stark",
    "Pat Brennan", "Pixie Pete", "Sean Mallory", "Tequila Joe", "Vera Custer"
];

class Card {
    constructor(id, name, type, suit, value, props = {}) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.suit = suit;
        this.value = value;
        this.range = props.range || null;
        this.effect = props.effect || null;
        // Metadata rozšíření (Dodge City) přenášená z props na kartu – ať se karta
        // chová stejně bez ohledu na cestu vzniku (balíček / debug / testy).
        if (props.green) this.green = true;
        if (props.bangEffect) this.bangEffect = true;
        if (props.draw) this.draw = props.draw;
        if (props.discardExtra) this.discardExtra = props.discardExtra;
        // Efekt zelené karty po aktivaci ze stolu: 'miss' | 'heal_self' | 'steal_any' |
        // 'discard_any' | 'draw_3' (bang-efekt zelené řeší bangEffect+range, ne activate).
        if (props.activate) this.activate = props.activate;
    }
}

class Player {
    constructor(name, role, character, maxHealth) {
        this.name = name;
        this.role = role;
        this.character = character;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.hand = [];
        this.board = [];
        this.weapon = { id: -1, name: "Colt .45", type: CardType.WEAPON, props: { range: 1 } };
        this.bangsPlayedThisTurn = 0;
        this.stats = {
            cardsUsed: {},
            bangsFired: 0,
            bangsHit: 0,
            damageDealt: 0,
            damageTaken: 0,
            weaponsCycled: 0,
            cardsDrawn: 0,
            cardsPlayed: 0,
            cardsDiscarded: 0,
        };
    }

    hasEquipment(effectName) {
        return this.board.some(card => card.effect === effectName);
    }

    getReach() {
        let reach = 1;
        const weapon = this.board.find(c => c.type === CardType.WEAPON);
        if (weapon && weapon.props && weapon.props.range) {
            reach = weapon.props.range;
        }
        return reach;
    }
}

class Deck {
    constructor() { this.cards = []; this.discardPile = []; }

    initializeStandardDeck(cardData) {
        this.cards = [];
        cardData.forEach(c => {
            const card = new Card(
                c.id, c.name, CardType[c.type], Suits[c.suit], c.value,
                c.props || {}
            );
            card.effect = c.props?.effect || c.effect || null;
            // Rozšíření (Dodge City): render metadata (symbol býka). Chování (green/
            // bangEffect/draw/discardExtra) přenáší už konstruktor Card z props.
            card.art = c.art || null;
            card.exp = c.exp || null;
            card.border = c.border || null;
            this.cards.push(card);
        });
        this.shuffleArray(this.cards);
    };

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    _reshuffle() {
        if (this.discardPile.length === 0) return false;
        const top = this.discardPile.length > 1 ? this.discardPile.pop() : null;
        this.cards = this.discardPile.splice(0);
        if (top) this.discardPile.push(top);
        this.shuffleArray(this.cards);
        this._reshuffleOccurred = true;
        this._reshuffleCount = this.cards.length;
        // default: emergency (volající nastaví true pokud je proaktivní)
        this._reshuffleWasProactive = false;
        console.log(`🔀 Balíček promíchán (${this.cards.length} karet, odhoz: ${this.discardPile.length})`);
        return this.cards.length > 0;
    }

    draw() {
        if (this.cards.length === 0) {
            if (!this._reshuffle()) {
                console.warn('⚠️ Balíček i odhoz jsou prázdné – nelze lízat');
                return null;
            }
            // Emergency reshuffle: _reshuffleWasProactive zůstane false
        }
        const card = this.cards.pop() || null;
        // Proaktivní zamíchání – pokud po líznutí deck = 0 karet, okamžitě se zamíchá pro příště
        if (card && this.cards.length === 0 && this.discardPile.length > 1) {
            this._reshuffle();
            this._reshuffleWasProactive = true; // přepíše false z _reshuffle()
        }
        return card;
    }

    drawForCheck(player) {
        if (player && player.character === "Lucky Duke") {
            const c1 = this.draw();
            const c2 = this.draw();
            const chosen = (c1.suit === Suits.HEARTS || c2.suit === Suits.HEARTS) ?
                           (c1.suit === Suits.HEARTS ? c1 : c2) : c1;
            const other = (chosen === c1) ? c2 : c1;
            this.discardPile.push(other);
            return chosen;
        }
        const card = this.draw();
        this.discardPile.push(card);
        return card;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CardType, Suits, ALL_CHARACTERS, DODGE_CITY_CHARACTERS, Card, Player, Deck };
}
