// Sdílené stavební bloky pro headless testy GameState (logic.js).
// Není to *.test.js, takže ho runner nebere jako testovací soubor – jen se requiruje.
//
// Princip: GameState stavíme ručně (ne přes setupGame/setupDebugGame), protože:
//   • setupGame míchá balíček i role → nedeterministické,
//   • setupDebugGame nastaví isDebug=true, kvůli čemuž checkWinCondition NEvyhodnotí
//     výhru (jen loguje). Ruční sestavení necháva isDebug falsy → pravidla běží normálně.

const fs = require('fs');
const path = require('path');
const { GameState, Player, Card, CardType, Suits } = require('../logic.js');

const cardData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cards.json'), 'utf8')
);

let _id = 5000;
const nextId = () => _id++;

// Vytvoř hru. specs = pole { role, character, maxHealth, health, name }.
// opts = { phase='PLAY', current=0 }. Na tahu je hráč `current`.
function mkGame(specs, opts = {}) {
    const g = new GameState();
    g.cardData = cardData;
    g.players = specs.map((s, i) => {
        const max = s.maxHealth ?? 4;
        const p = new Player(s.name ?? `P${i}`, s.role ?? 'Outlaw', s.character ?? null, max);
        p.health = s.health ?? max;
        return p;
    });
    g.phase = opts.phase ?? 'PLAY';
    g.currentPlayerIndex = opts.current ?? 0;
    return g;
}

// Vytvoř kartu daného typu (type je hodnota CardType, např. CardType.BANG).
function mkCard(type, o = {}) {
    const c = new Card(o.id ?? nextId(), o.name ?? type, type, o.suit ?? Suits.CLUBS, o.value ?? '5', o.props ?? {});
    if (o.effect) c.effect = o.effect;
    return c;
}

// Dej kartu do ruky hráče; vrať její index v ruce.
function give(g, idx, type, o = {}) {
    const c = mkCard(type, o);
    g.players[idx].hand.push(c);
    return g.players[idx].hand.length - 1;
}

// Polož kartu rovnou na stůl (board) hráče; vrať ji.
function board(g, idx, type, o = {}) {
    const c = mkCard(type, o);
    g.players[idx].board.push(c);
    return c;
}

// Polož kartu na vršek balíčku – další draw() ji vrátí (draw dělá pop z konce cards).
// Pro check karty (barel/dynamit/vězení) je podstatná barva a hodnota.
function topDeck(g, suit, value = '5') {
    g.deck.cards.push(mkCard(CardType.BANG, { suit, value }));
}

module.exports = { mkGame, mkCard, give, board, topDeck, cardData, CardType, Suits, GameState };
