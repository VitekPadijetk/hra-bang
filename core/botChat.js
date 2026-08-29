// core/botChat.js — hlášky botů do chatu. ČISTÁ izomorfní logika bez serveru:
// vstupem je prostý herní stav, výstupem jedna věta (nebo null). Emit řeší
// server/bots.js (hák `beforeBroadcast`), který si drží i snímek předchozího stavu.
//
// Proč to vůbec je: stůl plný botů je dnes němý, takže by ho Divoký západ – Roubík
// („kdo promluví, ztrácí 1 život") nikdy netrefil. Hlášky mají hodnotu i samy o sobě,
// ale tohle je důvod, proč vznikly právě teď.
//
// Spouštěč je vždy HERNÍ UDÁLOST, ne časovač: události se odvozují diffem dvou snímků
// stavu (`quipSnapshot` → `quipEvents`), takže se pravidel nemusí dotknout ani řádek.
// Sada vět je DATA (pole na spouštěč), ne kód – dá se rozšiřovat bez zásahu do logiky.

if (typeof require === 'function' && typeof eventActive === 'undefined') {
    globalThis.eventActive = require('./highNoon.js').eventActive;
}

// Aby to bylo koření, ne ukecaný stůl: malá šance na událost A strop „nejvýš jedna
// hláška za N tahů na bota". Bez stropu by se v zátěžových testech (tisíce partií)
// hlášky zvrhly ve spam – a pod Roubíkem by se bot upovídal k smrti.
const QUIP_CHANCE = 0.3;
const QUIP_COOLDOWN_TURNS = 4;

const QUIPS = {
    hit:      ["Au!", "To bolelo.", "Jen škrábnutí…", "Tohle si zapamatuju.", "Hej! Já se jen díval."],
    bigHit:   ["Áááá!", "Kdo to na mě hodil?!", "Tohle bylo o fous.", "Tak už toho nechte!"],
    low:      ["Poslední život… držte mi palce.", "Ještě jeden a jdu si lehnout.", "Doktora! Rychle!", "Nemám na rozdávání."],
    healed:   ["Na zdraví!", "To spravilo náladu.", "Ještě jedno a jsem jako rybička.", "Tohle bodlo."],
    jailed:   ["Za co mě zavíráte?!", "Šerife, to je omyl.", "Mříže mi nesluší.", "Pusťte mě ven!"],
    dynamite: ["To byl výbuch!", "Fííha… ještě dýchám.", "Kdo tu zapálil ten doutnák?!"],
    kill:     ["To bylo za minule.", "O jednoho míň.", "Další, prosím.", "Nic osobního."],
};

// Kompaktní snímek stavu, ze kterého se diffem poznají události. Drží ho volající
// (server/bots.js na `room`), aby core zůstalo bez paměti.
function quipSnapshot(state) {
    return {
        turnId: state?.turnId || 0,
        players: (state?.players || []).map(p => ({
            health: Math.max(0, p?.health || 0),
            // Typy jsou tytéž řetězce jako CardType v logic/entities.js (core je bez závislostí).
            jail: (p?.board || []).some(c => c && c.type === 'Vězení'),
            dynamite: (p?.board || []).some(c => c && c.type === 'Dynamit'),
        })),
    };
}

// Události mezi dvěma snímky. `playerIdx` je vždy ten, kdo MLUVÍ (u 'kill' tedy hráč
// na tahu, ne vyřazený). Vyřazení samo hlášku nemá – mrtvý nemluví.
function quipEvents(prev, state) {
    const out = [];
    const cur = quipSnapshot(state);
    if (!prev || !prev.players || prev.players.length !== cur.players.length) return out;
    let died = -1;
    for (let i = 0; i < cur.players.length; i++) {
        const a = prev.players[i], b = cur.players[i];
        if (b.health < a.health) {
            if (b.health <= 0) { died = i; continue; }
            if (a.dynamite && !b.dynamite) out.push({ kind: 'dynamite', playerIdx: i });
            // Poslední život je zajímavější věta než „to bolelo“, takže přebíjí i těžký zásah.
            else if (b.health === 1) out.push({ kind: 'low', playerIdx: i });
            else if (a.health - b.health >= 2) out.push({ kind: 'bigHit', playerIdx: i });
            else out.push({ kind: 'hit', playerIdx: i });
        } else if (b.health > a.health && a.health > 0) {
            out.push({ kind: 'healed', playerIdx: i });
        }
        if (!a.jail && b.jail) out.push({ kind: 'jailed', playerIdx: i });
    }
    if (died >= 0) {
        const k = state?.currentPlayerIndex;
        if (typeof k === 'number' && k !== died && cur.players[k] && cur.players[k].health > 0) {
            out.push({ kind: 'kill', playerIdx: k });
        }
    }
    return out;
}

// Věta, kterou bot na událost prohodí – nebo null (mlčí). `rng` je injektovatelné
// kvůli testům; `opts.lastQuipTurn` je turnId jeho poslední hlášky (drží volající).
function botQuip(event, state, botIdx, rng, opts = {}) {
    if (!event || event.playerIdx !== botIdx) return null;
    const p = state?.players?.[botIdx];
    if (!p || p.health <= 0) return null;
    // Divoký západ – Roubík: hláška stojí život jako komukoli jinému, ALE na posledním
    // životě bot mlčí. Je to politika bota, ne pravidlo – sebevražda hláškou vypadá
    // jako chyba hry, ne jako vtip. Kdyby to mělo být jinak, je to tenhle jeden řádek.
    if (eventActive(state, 'ROUBIK') && p.health <= 1) return null;
    const cooldown = opts.cooldownTurns ?? QUIP_COOLDOWN_TURNS;
    if (opts.lastQuipTurn !== undefined && opts.lastQuipTurn !== null &&
        (state?.turnId || 0) - opts.lastQuipTurn < cooldown) return null;
    const list = QUIPS[event.kind];
    if (!list || !list.length) return null;
    const r = typeof rng === 'function' ? rng : Math.random;
    if (r() >= (opts.chance ?? QUIP_CHANCE)) return null;
    return list[Math.min(list.length - 1, Math.floor(r() * list.length))];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { botQuip, quipEvents, quipSnapshot, QUIPS, QUIP_CHANCE, QUIP_COOLDOWN_TURNS };
}
