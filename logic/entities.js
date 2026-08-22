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

// Postavy rozšíření A Fistful of Cards (všechny 4 životy). Do výběru se přidají
// jen se zapnutým rozšířením (options.expansions.fistful → _characterPool).
const FISTFUL_CHARACTERS = [
    "Claus the Saint", "Uncle Will", "Johnny Kisch"
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
    constructor() { this.cards = []; this.discardPile = []; this.mineMode = false; }

    // ── Opuštěný důl (A Fistful of Cards) ─────────────────────────────────────
    // Po celé kolo si obě hromádky vymění role: líže se z ODHOZU a odhazuje se lícem
    // dolů na DOBÍRACÍ balíček. Prohození sedí tady, a ne v pravidlech, protože
    // draw()/discard() jsou jediné dvě cesty, kterými karta z hromádek odchází
    // a přichází – pravidla se tím pádem nemusí ptát vůbec.
    // Přepínač zapíná GameState (_syncMine v logic/fistful.js) při odkrytí nové
    // události; mezi koly se s ním nehýbe a draw() si ho sám shodí, až odhoz dojde.
    // Getery jsou na prototypu, takže je JSON.stringify do room_update nepošle
    // (klient si aktivní důl pozná z `mineMode`, které vlastní property je).
    get _drawPile()    { return this.mineMode ? this.discardPile : this.cards; }
    get _discardPile() { return this.mineMode ? this.cards : this.discardPile; }

    // Jediná cesta, kudy karta jde do odhozu. Bere i víc karet naráz (pozůstalost
    // vyřazeného hráče). Prázdné/undefined se ignoruje – volající si pak nemusí
    // hlídat, jestli zbraň nebo karta vůbec existuje.
    discard(...cards) {
        const pile = this._discardPile;
        cards.forEach(c => { if (c) pile.push(c); });
    }

    // Kit Carlson vrací nevybrané karty navrch TÉ hromádky, ze které si je vzal.
    returnToTop(card) { if (card) this._drawPile.push(card); }

    // Vrch odhozu = poslední odhozená karta (Pedro Ramirez, Krytý vůz, animace).
    discardTop() {
        const pile = this._discardPile;
        return pile.length ? pile[pile.length - 1] : null;
    }

    // Vyzvedni z odhozu konkrétní kartu zpátky – vrácené nepoužité Vedle! (Úhyb proti
    // Slabovi) nebo karta, kterou si server po zahrání drží kvůli animaci.
    takeFromDiscard(cardId) {
        const pile = this._discardPile;
        const i = pile.findIndex(c => c && c.id === cardId);
        return i === -1 ? null : pile.splice(i, 1)[0];
    }

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
        if (this._log) this._log('reshuffle', { count: this.cards.length, discard: this.discardPile.length });
        return this.cards.length > 0;
    }

    draw() {
        // Opuštěný důl: líže se z odhozu a NEMÍCHÁ se – dobírací balíček během kola
        // jen roste (chodí na něj odhazované karty), odhoz se vyprazdňuje. Jakmile
        // dojde, důl pro zbytek kola končí („dokud je to možné") a pokračuje se
        // normálně; zpátky ho zapne až _syncMine při odkrytí další události, takže
        // se příznak nemusí nikde uklízet.
        if (this.mineMode) {
            if (this.discardPile.length > 0) return this.discardPile.pop();
            this.mineMode = false;
            if (this._log) this._log('mine_exhausted', { deck: this.cards.length });
        }
        if (this.cards.length === 0) {
            if (!this._reshuffle()) {
                if (this._log) this._log('deck_empty', {});
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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CardType, Suits, ALL_CHARACTERS, DODGE_CITY_CHARACTERS, FISTFUL_CHARACTERS, Card, Player, Deck };
}
