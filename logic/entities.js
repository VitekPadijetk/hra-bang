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
    "Claus the Saint", "Johnny Kisch", "Uncle Will"
];

// Postavy rozšíření Divoký západ (Wild West Show). Portréty 034–041, data
// (characters.json) i životy (core/roles.js: Big Spencer 9, Gary Looter 5, Teren Kill 3)
// jsou hotové pro všech osm; v DEBUG hře se zapnutým rozšířením jdou vybrat všechny
// (`_characterPool` + options.debugPool), ať se dá vyzkoušet i to, co ještě nemá pravidla.
const WILD_WEST_CHARACTERS = [
    "Big Spencer", "Flint Westwood", "Gary Looter", "Greygory Deck",
    "John Pain", "Lee Van Kliff", "Teren Kill", "Youl Grinner"
];

// …a podmnožina, která už MÁ schopnost, tedy ta, která smí do OSTRÉ hry. Seznam roste
// s každou fází implementace (docs/wild-west-show-plan.md §10) a zmizí, až budou hotové
// všechny – pak se `_characterPool` bude ptát rovnou na WILD_WEST_CHARACTERS.
// Chybí: Teren Kill (fáze 5), Lee Van Kliff (fáze 6), Greygory Deck (fáze 10).
const WILD_WEST_READY = [
    "Big Spencer", "Flint Westwood", "Gary Looter", "John Pain", "Youl Grinner"
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

    // Kanonické názvy hromádek. Zůstávají jako getery, protože se na ně ptá spousta
    // míst; obě role jsou pevné (dřív je Opuštěný důl prohazoval, viz níž).
    get _drawPile()    { return this.cards; }
    get _discardPile() { return this.discardPile; }

    // ── Opuštěný důl (A Fistful of Cards) ─────────────────────────────────────
    // „Ve fázi lízání si hráč líže z odhazovacího balíčku; odhazované karty se pokládají
    // lícem dolů na dobírací balíček." Podle FAQ (Q03/Q04) to NENÍ prosté prohození
    // hromádek – platí to jen na dvě přesná místa v tahu HRÁČE NA TAHU:
    //   • fáze 1 (lízání)            → drawFromDiscard(),
    //   • fáze 3 (odhoz nad limit)   → discardToDrawPile().
    // Všechno ostatní (zahrané i odhozené karty ve fázi 2, Dostavník/Krytý vůz/
    // hokynářství, kontrolní sejmutí, schopnosti postav, pozůstalost vyřazeného
    // i celé tahy ostatních hráčů) jede úplně normálně přes draw()/discard().
    // Jestli se důl v tomhle tahu vůbec uplatní, rozhoduje `GameState._mineTurn`
    // (logic/fistful.js) – nejsou-li v odhozu karty na celé lízání, tah jede bez dolu.

    // Fáze 1 pod dolem: karta se bere z odhozu (leží tam lícem nahoru, takže je veřejná).
    // Nemíchá se – `_mineTurn` zaručuje, že je karet dost.
    drawFromDiscard() { return this.discardPile.length ? this.discardPile.pop() : null; }

    // Fáze 3 pod dolem: odhozené karty jdou lícem dolů NAVRCH dobíracího balíčku, takže
    // je někdo hned zase lízne. draw() bere z konce pole → push() je „navrch".
    discardToDrawPile(...cards) { cards.forEach(c => { if (c) this.cards.push(c); }); }

    // Nevybraná karta z odkryté řady (Kit Carlson) zpátky navrch ODHOZU – pod dolem si
    // ji odtud vzal, takže se tam i vrací.
    returnToDiscardTop(card) { if (card) this.discardPile.push(card); }

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
    module.exports = { CardType, Suits, ALL_CHARACTERS, DODGE_CITY_CHARACTERS, FISTFUL_CHARACTERS, WILD_WEST_CHARACTERS, WILD_WEST_READY, Card, Player, Deck };
}
