// Rozšíření Údolí stínů – fáze F9: politika bota.
//
// Větve bota pro nové fáze (EVADE_OFFER, SAVE_OFFER, kolečko voleb…) přibývaly s fázemi
// F1–F8 a testují je jejich vlastní sady. Tady je to, co přišlo až na konec:
//   • HENRY BLOCK – „Hráč, který si vezme nebo odhodí kartu z Henryho ruky nebo ležící
//     před ním, je cílem efektu BANG!." Bot proto bere Henrymu kartu až jako poslední
//     možnost a s výstřelem, který by ho vyřadil, vůbec (henryAwarePick, core/botPolicy.js).
//     Kdo vystřelí, říká jediný predikát `henryFires` (core/valley.js) – ptá se ho
//     i server (`_henryFires`, logic/valley.js).
//   • `keepScore` zná každý druh karty rozšíření (jinak by padl na výchozí 1 a bot by
//     ho odhazoval jako první).
//
// Podklad: docs/udoli-stinu-plan.md §6.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mkGame, give, CardType } = require('./_helpers.js');
const { Card, distinctCardKinds } = require('../logic/entities.js');
const BP = require('../core/botPolicy.js');
const { henryFires } = require('../core/valley.js');

before(() => { console.log = () => {}; });

const vosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cards.udoli_stinu.json'), 'utf8'));
const kinds = distinctCardKinds(vosData);

let _vid = 88000;
function vcard(name) {
    const k = kinds.find(c => c.name === name);
    assert.ok(k, name);
    const c = new Card(_vid++, k.name, k.type, k.suit, k.value,
        { range: k.range, effect: k.effect, bangEffect: k.bangEffect });
    c.effect = k.effect;
    c.exp = 'udoli_stinu';
    return c;
}

const VOS_ON = { expansions: { udoli_stinu: true } };
const HENRY = 'Henry Block';
// Čtyři hráči, bot (0) je šerif. Na vzdálenost 1 má dva bandity: Henryho (1, zraněný –
// bez Henryho by byl prvním cílem) a obyčejného (3). Odpadlík (2) sedí naproti.
const BELIEFS = { 1: { Outlaw: 1 }, 2: { Renegade: 1 }, 3: { Outlaw: 1 } };
function mkTable({ myHp = 4, vos = true, me = null } = {}) {
    const g = mkGame([
        { role: 'Sheriff', health: myHp, maxHealth: 5, character: me },
        { role: 'Outlaw', character: HENRY, health: 2 },
        { role: 'Renegade' },
        { role: 'Outlaw' },
    ]);
    if (vos) g.options = VOS_ON;
    g.turnId = 1;
    give(g, 1, CardType.BEER, { name: 'Pivo' });
    give(g, 3, CardType.BEER, { name: 'Pivo' });
    return g;
}
const panic = (g) => give(g, 0, CardType.PANIC, { name: 'Panika!' });
const miss = (g) => give(g, 0, CardType.MISSED, { name: 'Vedle!' });

// ── Sdílený predikát ─────────────────────────────────────────────────────────

test('henryFires: střílí jen Henry na někoho jiného, kdo umí ztratit život, a jen s rozšířením', () => {
    const g = mkTable();
    assert.equal(henryFires(g, 1, 0), true, 'Henry na zloděje');
    assert.equal(henryFires(g, 3, 0), false, 'obyčejný hráč nestřílí');
    assert.equal(henryFires(g, 1, 1), false, 'sám sobě ne');
    g.players[0].health = 0;
    assert.equal(henryFires(g, 1, 0), false, 'na nulu životů ne');
    const off = mkTable({ vos: false });
    assert.equal(henryFires(off, 1, 0), false, 'bez Údolí stínů nic');
});

test('_henryFires na serveru se ptá týmž predikátem (a navíc jednou za akci)', () => {
    const g = mkTable();
    assert.equal(g._henryFires(1, 0), henryFires(g, 1, 0));
    g._henryPass = true;
    assert.equal(g._henryFires(1, 0), false, 'v téhle akci už vystřelil');
});

// ── Krádež od Henryho až jako poslední možnost ──────────────────────────────

test('bot: Panika radši na jiného nepřítele než na Henryho (bez rozšíření by šel na Henryho)', () => {
    const off = mkTable({ vos: false });
    panic(off);
    const a0 = BP.decideBotAction(off, 0, BELIEFS);
    assert.equal(a0.event, 'play_special');
    assert.equal(a0.payload.targetIdx, 1, 'kontrola: zraněný bandita je prvním cílem');

    const g = mkTable();
    panic(g);
    const a = BP.decideBotAction(g, 0, BELIEFS);
    assert.equal(a.event, 'play_special');
    assert.equal(a.payload.targetIdx, 3, 'od Henryho by schytal výstřel');
});

test('bot: když jiný cíl není, vezme kartu i Henrymu – výstřel přežije', () => {
    const g = mkTable();
    g.players[3].hand = [];
    panic(g);
    const a = BP.decideBotAction(g, 0, BELIEFS);
    assert.equal(a.event, 'play_special');
    assert.equal(a.payload.targetIdx, 1);
});

test('bot: na posledním životě a bez Vedle! na Henryho nesáhne; s Vedle! ano', () => {
    const g = mkTable({ myHp: 1 });
    g.players[3].hand = [];
    panic(g);
    const a = BP.decideBotAction(g, 0, BELIEFS);
    assert.ok(!(a.event === 'play_special' && a.payload.targetIdx === 1), 'výstřel by ho vyřadil');
    assert.equal(BP.henryShotDeadly(g, 0), true);

    const h = mkTable({ myHp: 1 });
    h.players[3].hand = [];
    panic(h);
    miss(h);
    assert.equal(BP.henryShotDeadly(h, 0), false, 'Vedle! výstřel zastaví');
    const b = BP.decideBotAction(h, 0, BELIEFS);
    assert.equal(b.event, 'play_special');
    assert.equal(b.payload.targetIdx, 1);
});

test('henryAwarePick: Henry je jen záloha, při smrtelném výstřelu ani to', () => {
    const g = mkTable();
    const list = [{ idx: 1 }, { idx: 3 }];
    assert.equal(BP.henryAwarePick(g, 0, list, () => true).idx, 3);
    assert.equal(BP.henryAwarePick(g, 0, list, e => e.idx === 1).idx, 1, 'jiný cíl není → Henry');
    g.players[0].health = 1;
    assert.equal(BP.henryAwarePick(g, 0, list, e => e.idx === 1), null, 'výstřel by ho vyřadil');
});

test('bot Jesse Jones: od Henryho nelíže, radši z balíčku', () => {
    const mk = (vos) => {
        const g = mkTable({ vos, me: 'Jesse Jones' });
        g.players[3].hand = [];
        g.phase = 'DRAW';
        g.drawPhaseState = { playerIdx: 0, cardsDrawn: 0, cardsNeeded: 2,
                             options: ['deck', 'opponent_hand'], isStartOfTurn: true, drawId: 1, active: true };
        return g;
    };
    const off = BP.decideBotAction(mk(false), 0, BELIEFS);
    assert.equal(off.payload.source, 'opponent_hand', 'kontrola: bez rozšíření líže od Henryho');
    const a = BP.decideBotAction(mk(true), 0, BELIEFS);
    assert.equal(a.event, 'draw_card');
    assert.equal(a.payload.source, 'deck');
});

test('bot Pat Brennan: Henrymu ze stolu nebere, radši z balíčku', () => {
    const mk = (vos) => {
        const g = mkTable({ vos, me: 'Pat Brennan' });
        g.players[1].weapon = new Card(88900, 'Schofield', CardType.WEAPON, 'CLUBS', 'J', { range: 2 });
        g.phase = 'DRAW';
        g.drawPhaseState = { playerIdx: 0, cardsDrawn: 0, cardsNeeded: 2,
                             options: ['deck', 'board'], isStartOfTurn: true, drawId: 1, active: true };
        return g;
    };
    const off = BP.decideBotAction(mk(false), 0, BELIEFS);
    assert.equal(off.payload.source, 'board', 'kontrola: bez rozšíření bere Henrymu zbraň');
    assert.equal(off.payload.sourceIdx, 1);
    const a = BP.decideBotAction(mk(true), 0, BELIEFS);
    assert.equal(a.payload.source, 'deck');
});

test('Rvačka: s výstřelem Henryho, který by bota vyřadil, ji nehraje', () => {
    const g = mkTable();
    assert.equal(BP.henryBrawlDeadly(g, 0), false, 'na plných životech výstřel přežije');
    g.players[0].health = 1;
    assert.equal(BP.henryBrawlDeadly(g, 0), true);
    g.players[1].hand = [];
    assert.equal(BP.henryBrawlDeadly(g, 0), false, 'Henry nemá co odhodit – nestřílí');
});

// ── keepScore ────────────────────────────────────────────────────────────────

test('keepScore zná každý druh karty Údolí stínů (žádný nepadá na výchozí 1)', () => {
    for (const k of kinds) {
        const s = BP.keepScore(vcard(k.name));
        assert.ok(s > 1, `${k.name}: keepScore ${s} – bot by ji odhazoval jako první`);
    }
});
