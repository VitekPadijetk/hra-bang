// Rozšíření Dodge City – fáze 3: Úhyb (funguje jako Vedle! + lízne 1 kartu).
// Líznutí NENÍ automatické – po uhnutí se zařadí do fronty (UHYB_DRAW) a hráč si
// klikne na balíček (konzistentně s Bartem/Suzy). Klik = gs.uhybDraw(playerIdx).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkGame, mkCard, give, board, topDeck, CardType, Suits } = require('./_helpers.js');
const { cardPlayability } = require('../core/playability.js');
const { pendingActor } = require('../core/pending.js');

before(() => { console.log = () => {}; });

const uhybProps = { props: { draw: 1 } };

test('Úhyb ubrání Bang! (žádné zranění) → čeká UHYB_DRAW, klik na balíček lízne 1', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    const uhyb = give(g, 1, CardType.UHYB, uhybProps); // jediná karta v ruce cíle → index 0
    topDeck(g, Suits.CLUBS, '3'); // karta, kterou si Úhyb lízne

    g.playBang(0, 1, bang);
    assert.equal(g.phase, 'RESPOND');

    g.handleResponse(1, uhyb);
    assert.equal(g.players[1].health, 4);      // uhnul
    assert.equal(g.phase, 'UHYB_DRAW');        // NElízl automaticky – čeká na klik
    assert.equal(g.players[1].hand.length, 0); // Úhyb pryč, líznutá zatím není
    assert.deepEqual(pendingActor(g), { idx: 1, kind: 'UHYB_DRAW' });

    g.uhybDraw(1);
    assert.equal(g.phase, 'PLAY');             // návrat do přerušené fáze
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.players[1].hand[0].value, '3'); // opravdu líznul z balíčku
});

test('Úhyb ubrání i bang-efekt (Úder) a pak lízne kliknutím', () => {
    const g = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    const punch = give(g, 0, CardType.PUNCH, { props: { bangEffect: true, range: 1 } });
    const uhyb = give(g, 1, CardType.UHYB, uhybProps);
    topDeck(g, Suits.HEARTS, '9');

    g.playBang(0, 1, punch);
    g.handleResponse(1, uhyb);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'UHYB_DRAW');
    g.uhybDraw(1);
    assert.equal(g.phase, 'PLAY');
    assert.equal(g.players[1].hand[0].value, '9');
});

test('Slab: Úhyb + Vedle! (2 uhnutí), Úhyb přesto lízne (po dokončení obrany)', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    give(g, 1, CardType.UHYB, uhybProps); // idx 0
    give(g, 1, CardType.MISSED);          // idx 1
    topDeck(g, Suits.SPADES, '4');

    g.playBang(0, 1, bang);
    assert.equal(g.missesRequired, 2);

    g.handleResponse(1, 0);               // Úhyb: uhne 1×, líznutí zařazeno do fronty
    assert.equal(g.phase, 'RESPOND');     // stále chybí 1 Vedle!
    // Ruka teď: [Vedle!]. Zahrajeme Vedle! na indexu 0.
    g.handleResponse(1, 0);
    assert.equal(g.players[1].health, 4);
    assert.equal(g.phase, 'UHYB_DRAW');   // obrana hotová → teprve teď líznutí z Úhybu
    g.uhybDraw(1);
    assert.equal(g.phase, 'PLAY');
});

test('Slab: Úhyb bez druhého Vedle! → schytá zásah, Úhyb ZŮSTÁVÁ v odhozu a lízne', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    const uhyb = give(g, 1, CardType.UHYB, uhybProps); // jediná karta v ruce cíle → idx 0
    topDeck(g, Suits.SPADES, '4');

    g.playBang(0, 1, bang);
    assert.equal(g.missesRequired, 2);

    g.handleResponse(1, 0);               // Úhyb: uhne 1×, líznutí zařazeno do fronty
    assert.equal(g.phase, 'RESPOND');     // stále chybí 1 Vedle!

    g.handleResponse(1, null);            // schytá zásah (nemá druhé Vedle!)
    assert.equal(g.players[1].health, 3); // dostal zásah
    // Zahraný Úhyb se nevrací – zůstává v odhozu, takže platí i jeho líznutí.
    assert.equal(g.players[1].hand.length, 0);
    assert.equal(g.deck.discardTop().type, CardType.UHYB);
    assert.equal(g.phase, 'UHYB_DRAW');
    g.uhybDraw(1);
    assert.equal(g.players[1].hand.length, 1);
    assert.equal(g.players[1].hand[0].value, '4');
});

test('Slab: zásah Úhybem obránce vyřadí → líznutí za Úhyb propadá', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' },
                      { role: 'Outlaw' }, { role: 'Renegade' }]);
    g.players[1].health = 1;
    const bang = give(g, 0, CardType.BANG);
    give(g, 1, CardType.UHYB, uhybProps);
    topDeck(g, Suits.SPADES, '4');

    g.playBang(0, 1, bang);
    g.handleResponse(1, 0);               // Úhyb: uhne 1×, líznutí ve frontě
    g.handleResponse(1, null);            // druhé Vedle! nemá → zásah ho vyřadí

    assert.equal(g.players[1].health, 0);
    assert.equal(g.specialActionQueue.filter(a => a.type === 'UHYB_DRAW').length, 0);
    assert.notEqual(g.phase, 'UHYB_DRAW');
});

test('Slab: první Vedle! zůstane v odhozu, i když druhé nepřijde', () => {
    const g = mkGame([{ role: 'Sheriff', character: 'Slab the Killer' }, { role: 'Outlaw' }]);
    const bang = give(g, 0, CardType.BANG);
    give(g, 1, CardType.MISSED);          // jediné Vedle! v ruce cíle

    g.playBang(0, 1, bang);
    g.handleResponse(1, 0);               // zahraje Vedle! – proti Slabovi je potřeba druhé
    assert.equal(g.phase, 'RESPOND');
    assert.equal(g.missesPlayed, 1);

    g.handleResponse(1, null);            // schytá zásah
    assert.equal(g.players[1].health, 3);
    assert.equal(g.players[1].hand.length, 0);          // Vedle! se NEvrací
    assert.equal(g.deck.discardTop().type, CardType.MISSED);
    assert.equal(g.missesPlayed, 0);
    assert.equal(g.phase, 'PLAY');
});

test('cardPlayability: Úhyb hratelný jako reakce, ne ve vlastním tahu', () => {
    const uhyb = mkCard(CardType.UHYB, uhybProps);

    // Reakce (RESPOND, cíl = index 1, vyžaduje Vedle!)
    const resp = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }], { phase: 'RESPOND' });
    resp.pendingResponse = { active: true, originatorIdx: 0, targetIdx: 1, requiredCard: 'Vedle!', responded: [] };
    assert.equal(cardPlayability(resp, resp.players[1], 1, uhyb), true);

    // Vlastní tah (PLAY) → nehratelný (Úhyb je jen obranná reakce)
    const play = mkGame([{ role: 'Sheriff' }, { role: 'Outlaw' }]);
    assert.equal(cardPlayability(play, play.players[0], 0, uhyb), false);
});
