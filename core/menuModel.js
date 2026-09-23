// core/menuModel.js — čistá logika nového menu v HTML (view/menuDom.js), bez DOM.
// Texty a rozhodnutí, která se dají otestovat v Node: skloňování počtů, iniciály,
// jméno hráče, escapování, nastavení nové hry. Plán: docs/menu-ui-plan.md.

// Konec hry (S12, S14) potřebuje české názvy rolí a poznat hru pro 3 (core/roles.js).
if (typeof require === 'function') {
    if (typeof roleNameCz === 'undefined') globalThis.roleNameCz = require('./roles.js').roleNameCz;
    if (typeof isThreePlayerMode === 'undefined') globalThis.isThreePlayerMode = require('./roles.js').isThreePlayerMode;
    if (typeof teamRole === 'undefined') globalThis.teamRole = require('./roles.js').teamRole;
}

// Každý text od hráče (jméno, název hry) jde do innerHTML jen přes esc() –
// název místnosti vidí všichni v seznamu her, takže by jinak byl XSS pro celý server.
function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// České skloňování: 1 hra / 2–4 hry / 0 a 5+ her.
function czPlural(n, one, few, many) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

// Popisek pod „Připojit se ke hře" v hlavním menu (S3).
function waitingGamesLabel(n) {
    if (!n) return 'Žádné hry nečekají na hráče';
    return `${n} ${czPlural(n, 'hra čeká', 'hry čekají', 'her čeká')} na hráče`;
}

// Popisek pod „Sledovat probíhající hru" (S3).
function runningGamesLabel(n) {
    if (!n) return 'Žádná hra právě neběží';
    return `${n} ${czPlural(n, 'hra', 'hry', 'her')} právě běží`;
}

// Hra s volným místem – jen ty se počítají do „čeká na hráče".
function waitingGamesCount(lobbyList) {
    return (lobbyList || []).filter(r => r && r.playerCount < r.maxPlayers).length;
}

// Iniciály do avataru: první dva znaky jména velkými, bez prefixu bota.
// Array.from, ne slice – emoji / znaky mimo BMP se nesmí rozpůlit.
function initialsOf(name) {
    const clean = String(name || '').replace(/^🤖\s*/, '').trim();
    if (!clean) return '?';
    return Array.from(clean).slice(0, 2).join('').toUpperCase();
}

const NAME_MAX = 18;

// Tvrdý limit jména při psaní (ne validace při odeslání).
function clampName(value) {
    return Array.from(String(value || '')).slice(0, NAME_MAX).join('');
}

// Chyba jména pro okno S4, nebo null. `taken` = jména obsazená na serveru.
function nameError(value, taken) {
    const v = String(value || '').trim();
    if (!v) return 'Jméno nesmí být prázdné.';
    if ((taken || []).includes(v)) return `Jméno »${v}« je již obsazeno.`;
    return null;
}

// ── Nastavení hry (S5 Vytvořit hru, S11 Hra botů) ─────────────────────────

// Rozšíření v pořadí karet na obrazovce. JEDINÝ výčet – emptyExpansions() i souhrn v liště
// se staví z něj, takže přibývající rozšíření se nedá zapomenout dopsat do jedné z kopií
// (checkbox pak nešel zaškrtnout).
const MENU_EXPANSIONS = [
    { key: 'dodge_city', label: 'Dodge City', hint: '+40 karet a +15 postav; karty se symbolem býka' },
    { key: 'high_noon', label: 'High Noon', hint: '13 karet událostí; šerif odkrývá jednu na začátku kola' },
    { key: 'fistful', label: 'Fistful', hint: '15 karet událostí a 3 postavy; hraje se i vedle High Noonu' },
    { key: 'divoky_zapad', label: 'Divoký západ', hint: '10 karet událostí a 8 postav; otáčí je Dostavník a Wells Fargo' },
    { key: 'zlata_horecka', label: 'Zlatá horečka', hint: 'Zlaté valouny za zranění a obchod s 24 kartami vybavení' },
];

// Výchozí (všechna vypnutá) sada příznaků rozšíření – pro všechny obrazovky i reset po založení.
function emptyExpansions() {
    const out = {};
    for (const e of MENU_EXPANSIONS) out[e.key] = false;
    return out;
}

// `short` = jak se volba jmenuje v lobby (S8/S9), kde ji vidí i ti, kdo ji nezapínali.
const ADVANCED_OPTIONS = [
    { key: 'noAdvancedCards', label: 'Zakázat pokročilé karty', hint: 'Bez Duelu, Hokynářství, Indiánů, Vězení a Dynamitu', short: 'bez pokročilých karet' },
    { key: 'singleChar', label: 'Přiřadit postavu náhodně', hint: 'Hráči si nevybírají ze dvou postav', short: 'postavy náhodně' },
    { key: 'rotatingSheriff', label: 'Rotující šerif', hint: 'Šerif se po každé hře posouvá doleva', short: 'rotující šerif' },
    { key: 'highNoonExtra', label: 'High Noon: přibalené karty', hint: '+ Nová identita a Želízka z Fistfulu', short: 'přibalené karty High Noonu' },
    // Varianta ze Zlaté horečky, ale hraje se i bez ní (pravidla to výslovně dovolují).
    { key: 'shadowGunslingers', label: 'Stínoví pistolníci', hint: 'Vyřazení se na svůj tah vracejí jako stín s 0 životy', short: 'stínoví pistolníci' },
];

// „Přibalené karty" (Nová identita, Želízka) mají smysl jen s High Noonem BEZ Fistfulu –
// obě karty jsou z Fistfulu, takže s ním jdou do balíčku samy (_hnExtraOn v logic/highNoon.js).
function hnExtraVisible(exps) {
    return !!(exps && exps.high_noon && !exps.fistful);
}

function visibleAdvancedOptions(exps) {
    return ADVANCED_OPTIONS.filter(o => o.key !== 'highNoonExtra' || hnExtraVisible(exps));
}

// Souhrn v hlavičce sbalených pokročilých možností. Počítá jen VIDITELNÉ volby –
// schované „přibalené karty" by jinak hlásily zapnutou volbu, kterou hráč nevidí.
function advancedSummary(opts, exps) {
    const n = visibleAdvancedOptions(exps).filter(o => opts && opts[o.key]).length;
    return n ? `· ${n} ${czPlural(n, 'zapnutá', 'zapnuté', 'zapnutých')}` : '· vše výchozí';
}

// Poznámka pod řadou počtu hráčů – mění se podle volby (3 a 8 mají jiná pravidla).
function playerCountNote(n) {
    if (n === 3) return 'Město duchů: bez šerifa, role lícem nahoru, každý loví určeného soupeře.';
    if (n === 8) return 'Šerif, 2× Pomocník, 3× Bandita, 2× Odpadlík — jediný počet se dvěma odpadlíky.';
    return 'Hra startuje až s plným stolem. Prázdná místa doplníš boty v lobby.';
}

function playersLabel(n) { return `${n} ${czPlural(n, 'hráč', 'hráči', 'hráčů')}`; }
function botsLabel(n) { return `${n} ${czPlural(n, 'bot', 'boti', 'botů')}`; }

// „Dodge City · High Noon", nebo „základní hra".
function expansionsLabel(exps) {
    const names = MENU_EXPANSIONS.filter(e => exps && exps[e.key]).map(e => e.label);
    return names.length ? names.join(' · ') : 'základní hra';
}

const ROOM_NAME_MAX = 40;

function defaultRoomName(playerName) {
    return `Hra hráče ${playerName}`;
}

// Proč nejde hru založit (věta do lišty akcí), nebo null. Zamčené tlačítko hráči říká,
// co chybí, místo aby jen zešedlo.
function createGameBlocker({ count, title, playerName }) {
    if (!playerName) return 'Nejdřív si v menu zadej jméno.';
    const noCount = !count, noTitle = !String(title || '').trim();
    if (noCount && noTitle) return 'Vyber počet hráčů a zadej název.';
    if (noCount) return 'Vyber počet hráčů.';
    if (noTitle) return 'Zadej název hry.';
    return null;
}

// Levá strana lišty akcí na S5: důvod zamčení, nebo „5 hráčů · Dodge City".
function createGameSummary(args) {
    return createGameBlocker(args) || `${playersLabel(args.count)} · ${expansionsLabel(args.exps)}`;
}

function botGameSummary(count, exps) {
    return `${botsLabel(count)} · ${expansionsLabel(exps)}`;
}

// Volby pro create_bot_game: všechna rozšíření jako boolean, přibalené karty jen s High Noonem.
// `shadows` = varianta Stínoví pistolníci (nezávislá na rozšířeních).
function botGameOptions(exps, hnExtra, shadows) {
    const expansions = emptyExpansions();
    for (const k of Object.keys(expansions)) expansions[k] = !!(exps && exps[k]);
    return { expansions, highNoonExtra: expansions.high_noon && !!hnExtra, shadowGunslingers: !!shadows };
}

// ── Seznamy her (S6 Připojit se, S10 Sledovat) a detail hry (S7) ──────────
// Položka seznamu přichází ze serveru (listItem v server/rooms.js):
// { id, name, maxPlayers, playerCount, players, leader, next, expansions: [klíč], botGame }.

// Bot se pozná podle prefixu jména (server/bots.js dává „🤖 Bot 1"); ikonu kreslí řádek sám.
function isBotName(name) {
    return /^🤖/.test(String(name || ''));
}

function plainName(name) {
    return String(name || '').replace(/^🤖\s*/, '');
}

// Rozšíření ze seznamu klíčů (tak je posílá server) – neznámé klíče se přeskočí.
function expansionsFromKeys(keys) {
    const out = emptyExpansions();
    for (const k of keys || []) if (k in out) out[k] = true;
    return out;
}

// Druhý řádek položky seznamu: kdo hru vede, jestli je navazující, co se hraje.
function roomWhoLine(item, running) {
    const who = item.botGame ? 'hra jen botů'
        : item.leader ? `${running ? 'hraje' : 'zakládá'} ${plainName(item.leader)}` : '';
    return [who, item.next ? 'navazující hra' : '', expansionsLabel(expansionsFromKeys(item.expansions))]
        .filter(Boolean).join(' · ');
}

const ROOM_ROW_STATES = {
    wait: { text: '● ČEKÁ', cta: 'PŘIPOJIT' },
    full: { text: '● PLNÁ', cta: 'PLNÁ' },
    running: { text: '● PROBÍHÁ', cta: 'DÍVAT SE' },
};

// Pohled na řádek seznamu (components.md „Řádek místnosti"): stav, texty a obsazená místa.
// Plný stůl v seznamu zůstává – hráč vidí, že hra existuje, a může počkat.
function roomRowView(item, running) {
    const max = item.maxPlayers || 0;
    const taken = Math.min(item.playerCount || 0, max);
    const state = running ? 'running' : taken >= max ? 'full' : 'wait';
    return {
        state,
        who: roomWhoLine(item, running),
        count: `${item.playerCount || 0} / ${max}`,
        seats: Array.from({ length: max }, (_, i) => i < taken),
        stateText: ROOM_ROW_STATES[state].text,
        cta: ROOM_ROW_STATES[state].cta,
    };
}

function joinListSubtitle(lobbyList) {
    return `${waitingGamesLabel(waitingGamesCount(lobbyList))} · seznam se obnovuje sám`;
}

function spectateListSubtitle(gameList) {
    return `${runningGamesLabel((gameList || []).length)} · seznam se obnovuje sám`;
}

// Podtitulek S7: „5 / 8 hráčů · zakládá Calamity · navazující hra".
function joinRoomSubtitle(item) {
    return [
        `${item.playerCount || 0} / ${item.maxPlayers || 0} hráčů`,
        item.leader ? `zakládá ${plainName(item.leader)}` : '',
        item.next ? 'navazující hra' : '',
    ].filter(Boolean).join(' · ');
}

// Jeden obsazený řádek sedačky (components.md „Řádek sedačky"). `extra` = přívlastek navíc
// („chce dál ✅" v lobby další hry).
function _seatRow(i, name, { isLeader, isMe, bot, extra = '' }) {
    return {
        idx: i + 1, empty: false, bot, leader: isLeader, me: isMe,
        icon: isLeader ? '👑' : bot ? '🤖' : '🎩',
        name: plainName(name),
        tag: [isMe ? '(ty)' : '', isLeader ? 'Game Leader' : '', bot ? 'bot' : '', extra].filter(Boolean).join(' · '),
    };
}

// Řádky sedaček v detailu hry (S7): obsazená místa v pořadí u stolu, pak prázdná.
// Seznam her nese jen jména – `me` = moje jméno (zvýrazněný řádek s „(ty)"),
// `leader` = jméno Game Leadera.
function seatRows(names, maxPlayers, { leader = null, me = null } = {}) {
    const list = names || [];
    const rows = [];
    for (let i = 0; i < Math.max(maxPlayers || 0, list.length); i++) {
        const name = list[i];
        if (name == null) { rows.push({ idx: i + 1, empty: true }); continue; }
        rows.push(_seatRow(i, name, {
            isLeader: leader != null && name === leader,
            isMe: me != null && name === me,
            bot: isBotName(name),
        }));
    }
    return rows;
}

// Co brání připojit se v S7, nebo null. Pořadí = co hráč řeší první: zmizelou nebo plnou
// hru jménem nespraví. `taken` = jména obsazená na serveru (taken_names).
//   gone  – hra v seznamu už není (mezitím začala nebo ji lídr zrušil)
//   full  – stůl je plný
//   name  – hráč ještě nemá jméno
//   taken – jméno už u stolu (nebo jinde na serveru) někdo má
function joinRoomBlocker(item, playerName, taken) {
    if (!item) return { kind: 'gone', text: 'Hra mezitím začala nebo ji zakladatel zrušil. Vyber si ze seznamu jinou.' };
    if ((item.playerCount || 0) >= (item.maxPlayers || 0)) {
        return { kind: 'full', text: 'Stůl je plný. Počkej, až se místo uvolní, nebo si vyber jinou hru.' };
    }
    if (!playerName) return { kind: 'name', text: 'Nejdřív si zadej jméno, pod kterým budeš hrát.' };
    if ((item.players || []).includes(playerName) || (taken || []).includes(playerName)) {
        return { kind: 'taken', text: `Jméno »${playerName}« už někdo používá. Zvol si jiné.` };
    }
    return null;
}

// ── Lobby místnosti (S8) a lobby další hry (S9) ───────────────────────────
// `room` = room_update (roomPayload v server/rooms.js): { roomName, roomPhase ('lobby' |
// 'next_lobby'), leaderSocketId, maxPlayers, players: [{ socketId, name, isBot,
// wasOriginalSurvivor }], options: { expansions: {klíč: bool}, …}, assetsWaiting }.
// Kdo je „já" a kdo lídr, se pozná podle socketId, ne podle jména.

function lobbyIsNext(room) { return !!room && room.roomPhase === 'next_lobby'; }

function lobbyMissing(room) {
    return Math.max(0, (room.maxPlayers || 0) - (room.players || []).length);
}

function lobbyTitle(room) {
    return lobbyIsNext(room) ? `Další hra: ${room.roomName}` : room.roomName;
}

// „4 / 5 hráčů · Dodge City · High Noon" – kdo se připojil, vidí, do čeho jde.
function lobbySubtitle(room) {
    const exps = (room.options && room.options.expansions) || {};
    return `${(room.players || []).length} / ${room.maxPlayers || 0} hráčů · ${expansionsLabel(exps)}`;
}

// Zapnuté pokročilé volby místnosti („rotující šerif · postavy náhodně"), nebo ''.
// Přibalené karty jen tam, kde platí (High Noon bez Fistfulu) – jinak je server ignoruje.
function roomRulesLabel(options) {
    const opts = options || {};
    return visibleAdvancedOptions(opts.expansions || {})
        .filter(o => opts[o.key]).map(o => o.short).join(' · ');
}

// Řádky sedaček v lobby. Lídr (`manage`) vidí na prázdném místě „➕ Bot" (addBot)
// a u bota „✕" (removeId = socketId bota). V lobby další hry má přívlastek „chce dál ✅"
// každý, kdo do ní přešel z minulé hry (server mu nechal wasOriginalSurvivor).
function lobbySeatRows(room, mySocketId) {
    const players = room.players || [];
    const manage = room.leaderSocketId != null && room.leaderSocketId === mySocketId;
    const next = lobbyIsNext(room);
    const rows = [];
    for (let i = 0; i < Math.max(room.maxPlayers || 0, players.length); i++) {
        const p = players[i];
        if (!p) { rows.push({ idx: i + 1, empty: true, addBot: manage }); continue; }
        const row = _seatRow(i, p.name, {
            isLeader: p.socketId === room.leaderSocketId,
            isMe: p.socketId === mySocketId,
            bot: !!p.isBot || isBotName(p.name),
            extra: next && p.wasOriginalSurvivor ? 'chce dál ✅' : '',
        });
        row.removeId = manage && row.bot ? p.socketId : null;
        rows.push(row);
    }
    return rows;
}

// Poznámka nad sedačkami: { ico, text }, nebo null. Vždy JEDNA (na telefonu na šířku by
// dvě zabraly skoro celou výšku), v pořadí důležitosti:
//   1. po kliknutí na START se čeká na art zapnutého rozšíření (stahuje se líně) – bez
//      hlášky by to vypadalo, že se nic neděje;
//   2. stůl není plný (doplnit boty umí jen lídr);
//   3. v lobby další hry pravidlo o přeživších.
function lobbyNotice(room, isLeader) {
    if (room.assetsWaiting) return { ico: '⏳', text: 'Načítám karty rozšíření u všech hráčů…' };
    const n = lobbyMissing(room);
    if (n) {
        const who = n === 1
            ? (isLeader ? 'Můžeš ho doplnit botem.' : 'Game Leader ho může doplnit botem.')
            : (isLeader ? 'Můžeš je doplnit boty.' : 'Game Leader je může doplnit boty.');
        return { ico: '⏳', text: `Hra začne, až bude stůl plný — chybí ${n} ${czPlural(n, 'hráč', 'hráči', 'hráčů')}. ${who}` };
    }
    if (lobbyIsNext(room)) return { ico: '🎭', text: 'Přeživší si v další hře mohou nechat svou postavu.' };
    return null;
}

// Tlačítko lídra. `pressed` = klik už odešel (App.startPressed) – zamyká hned, odpověď
// serveru přijde až za sítí; assetsWaiting ho drží po dobu čekání na art rozšíření.
// Zamčené tlačítko říká, co chybí (components.md).
function lobbyStartButton(room, pressed) {
    if (pressed || room.assetsWaiting) return { label: 'ZAHAJUJI…', can: false };
    if (lobbyMissing(room)) return { label: '▶ ZAHÁJIT HRU (stůl není plný)', can: false };
    return { label: '▶ ZAHÁJIT HRU', can: true };
}

// Start navazující hry má na serveru vlastní událost.
function lobbyStartEvent(room) {
    return lobbyIsNext(room) ? 'check_start_next' : 'start_game';
}

// Rámeček v liště místo tlačítek (všichni kromě lídra).
function lobbyWaitText(room) {
    if (room.assetsWaiting) return 'Game Leader zahájil hru — čeká se na karty rozšíření…';
    if (!lobbyMissing(room)) return 'Stůl je plný — čeká se, až Game Leader zahájí hru…';
    return lobbyIsNext(room) ? 'Čeká se na doplnění hráčů a Game Leadera…' : 'Čeká se na Game Leadera…';
}

// ── Konec hry (S12), statistiky (S14), vyhození (S15) ────────────────────
// Stav hry po výhře chodí celý, bez redakce (redactState v server/rooms.js), takže role
// i statistiky všech hráčů jsou veřejné. `state.winner` je rovnou věta vítěze
// (core/winCondition.js): „Zákon vyhrál!", ve hře pro 3 „Pomocník vyhrál!", pod kartou
// Divoký západ „{jméno} vyhrál!".

// Vyhrál tenhle hráč? Podle věty vítěze, ne podle toho, kdo žije: pomocníci i bandité
// vyhrávají se svou stranou i mrtví, odpadlík jen jako poslední živý (při 8 hráčích jsou
// dva a vyhrát může nejvýš jeden).
function playerWon(p, winner, players) {
    if (!p || !winner) return false;
    if (winner === `${p.name} vyhrál!`) return true;   // Divoký západ: vyhrává jednotlivec
    if (isThreePlayerMode(players)) return winner === `${roleNameCz(p.role)} vyhrál!`;
    // Stínový odpadlík (Stínoví pistolníci) vyhrává se stranou, ke které se naposledy
    // přidal (`teamRole`); do role Odpadlík se už nikdy nevrací.
    const team = teamRole(p);
    if (winner === 'Zákon vyhrál!') return team === 'Sheriff' || team === 'Deputy';
    if (winner === 'Bandité vyhráli!') return team === 'Outlaw';
    if (winner === 'Odpadlík vyhrál!') return team === 'Renegade' && p.health > 0;
    return false;
}

// ── Další hra: účast (S12 čipy, S13) – docs/menu-ui-plan.md D8 ───────────
// Po konci hry se každý přihlásí jedním kliknutím (server next_join, odhlášení
// next_leave) a nikdo nic nepotvrzuje podruhé. Odpočet není: hru zahájí lídr ručně
// (next_start), jakmile je přihlášených aspoň NEXT_MIN_PLAYERS. Kdo se do té doby
// nepřihlásí, do hry nejde. Server se ptá téže konstanty (server/handlers.nextgame.js).
const NEXT_MIN_PLAYERS = 3;

// Soupiska skončené hry: jeden řádek na hráče, v pořadí u stolu.
//   status – in: přihlášený (wantsNext), wait: ještě se nerozhodl,
//            out: odešel – v místnosti (room.players) už není, zůstává jen ve stavu hry.
// Páruje se podle jména: playerIdx v místnosti se po odchodu přečísluje a jména jsou
// u stolu unikátní. Lídra a mě pozná podle socketId.
function nextRoster(gamePlayers, roomPlayers, { leaderSocketId = null, mySocketId = null } = {}) {
    const room = roomPlayers || [];
    return (gamePlayers || []).map(gp => {
        const rp = room.find(r => r.name === gp.name) || null;
        return {
            name: plainName(gp.name), initials: initialsOf(gp.name),
            status: !rp ? 'out' : rp.wantsNext === true ? 'in' : 'wait',
            bot: !!(rp && rp.isBot) || isBotName(gp.name),
            leader: !!rp && leaderSocketId != null && rp.socketId === leaderSocketId,
            me: !!rp && mySocketId != null && rp.socketId === mySocketId,
            away: !!(rp && rp.disconnected),
        };
    });
}

// Součty soupisky. total = kdo ještě může hrát (bez těch, co odešli).
function nextTally(roster) {
    const count = (st) => (roster || []).filter(r => r.status === st).length;
    const inN = count('in'), waitN = count('wait'), outN = count('out');
    return {
        in: inN, wait: waitN, out: outN, total: inN + waitN,
        missing: Math.max(0, NEXT_MIN_PLAYERS - inN), canStart: inN >= NEXT_MIN_PLAYERS,
    };
}

function _nextRestParts(t) {
    const parts = [];
    if (t.wait) parts.push(`${t.wait} ${czPlural(t.wait, 'se rozhoduje', 'se rozhodují', 'se rozhoduje')}`);
    if (t.out) parts.push(`${t.out} ${czPlural(t.out, 'odešel', 'odešli', 'odešlo')}`);
    return parts;
}

// Řádek pod čipy (S12): „3 hráči jsou v další hře · 1 se rozhoduje · 1 odešel", a dokud
// jich je málo, kolik je potřeba.
function nextGameSummary(roster) {
    const t = nextTally(roster);
    const head = t.canStart
        ? `${t.in} ${czPlural(t.in, 'hráč je', 'hráči jsou', 'hráčů je')} v další hře`
        : `Na další hru jsou potřeba alespoň ${NEXT_MIN_PLAYERS} hráči · ` +
          (t.in ? `zatím ${t.in} ${czPlural(t.in, 'přihlášený', 'přihlášení', 'přihlášených')}` : 'zatím nikdo');
    return [head, ..._nextRestParts(t)].join(' · ');
}

// Tlačítka S12 podle toho, kdo se dívá: { primary, exit } (akce { label, act, danger }).
// „Chci další hru" rovnou přihlašuje a kdo klikne, přejde na S13 sám (menuDomScreen).
// `joined` = už je přihlášený a na S12 se vrátil (◀ Zpět ze S13) – hlavní akce ho vrací
// na S13. Odchod lídra ruší hru všem, proto u něj „Zrušit hru", ne nevinně vypadající
// „Do menu". Divák se nepřihlašuje, jen odchází.
function endGameView({ spectator = false, leader = false, joined = false } = {}) {
    if (spectator) return { primary: { label: '◀ Zpět do menu', act: 'toMenu' }, exit: null };
    return {
        primary: joined
            ? { label: '✅ Jsi v další hře ›', act: 'nextOpen' }
            : { label: '▶ Chci další hru', act: 'nextJoin' },
        exit: leader
            ? { label: '✕ Zrušit hru', act: 'cancelGame', danger: true }
            : { label: '✕ Do menu', act: 'toMenu', danger: false },
    };
}

// S13 – účast v další hře. `roster` z nextRoster (s mySocketId), `maxPlayers` = stůl
// místnosti, `starting` = lídr už klikl na start (odpověď serveru přijde až za sítí).
//   bar      – segment na hráče (true = přihlášený), aspoň NEXT_MIN_PLAYERS
//   headSub  – podtitulek hlavičky
//   joined   – jsem přihlášený → zelený pruh (joinedText) místo tlačítka „Chci hrát dál"
//   canLeave – „Odhlásit se" (lídr ne: hru buď zahájí, nebo zruší)
//   start    – jen lídr: { label, can }, note = co start udělá, když stůl nebude plný
function nextGameView(roster, { leader = false, maxPlayers = 0, starting = false } = {}) {
    const t = nextTally(roster);
    const me = (roster || []).find(r => r.me) || null;
    const joined = !!me && me.status === 'in';
    let rest;
    if (t.wait) rest = `Čeká se na ${t.wait} ${czPlural(t.wait, 'hráče', 'hráče', 'hráčů')}.`;
    else if (!t.canStart) rest = `Na další hru jsou potřeba alespoň ${NEXT_MIN_PLAYERS} hráči.`;
    else rest = leader ? 'Všichni se rozhodli — můžeš zahájit.' : 'Čeká se na Game Leadera.';
    let start = null, note = null;
    if (leader) {
        const label = starting ? 'ZAHAJUJI…'
            : t.canStart ? `▶ ZAHÁJIT DALŠÍ HRU (${t.in} ${czPlural(t.in, 'hráč', 'hráči', 'hráčů')})`
            : `▶ ZAHÁJIT DALŠÍ HRU (chybí ${t.missing})`;
        start = { label, can: t.canStart && !starting };
        const free = Math.max(0, (maxPlayers || 0) - t.in);
        if (t.canStart && free) {
            note = free === 1 ? 'Volné místo u stolu doplníš v lobby další hry.'
                : `Volná místa u stolu (${free}) doplníš v lobby další hry.`;
        }
    }
    return {
        headSub: !joined ? 'Zatím nejsi přihlášený'
            : leader && t.canStart ? 'Jsi přihlášený — hru zahajuješ ty'
            : 'Jsi přihlášený — čeká se na ostatní',
        headline: t.canStart ? 'Další hra může začít' : 'Chybí hráči do další hry',
        sub: t.wait
            ? `${t.wait} ${czPlural(t.wait, 'hráč se ještě rozhoduje', 'hráči se ještě rozhodují', 'hráčů se ještě rozhoduje')} · kdo neodpoví, do hry nejde`
            : 'Všichni se rozhodli.',
        count: t.in, total: t.total,
        bar: Array.from({ length: Math.max(t.total, NEXT_MIN_PLAYERS) }, (_, i) => i < t.in),
        joined, joinedText: `✅ Jsi v další hře. ${rest}`,
        canLeave: joined && !leader,
        start, note,
        exit: leader
            ? { label: '✕ Zrušit hru', act: 'cancelGame', danger: true }
            : { label: 'Opustit hru', act: 'toMenu', danger: false },
    };
}

// Přívlastek řádku S13: „(ty) · Game Leader · bot · odpojen".
function nextRowTag(row) {
    return [row.me ? '(ty)' : '', row.leader ? 'Game Leader' : '', row.bot ? 'bot' : '',
        row.away ? 'odpojen' : ''].filter(Boolean).join(' · ');
}

function _pct(part, whole) {
    return whole > 0 ? Math.round(part / whole * 100) : 0;
}

function _sumStats(players) {
    const acc = {};
    for (const p of players || []) {
        for (const [k, v] of Object.entries((p && p.stats) || {})) {
            if (typeof v === 'number') acc[k] = (acc[k] || 0) + v;
        }
    }
    return acc;
}

// Souhrnná řádka v hlavičce S14: „Bang!×34 · Zásahy×21 (62 %) · Zranění×19 · Líznuto×88 · Odhoz×61".
function statsTotalsLabel(players) {
    const s = _sumStats(players);
    const fired = s.bangsFired || 0, hit = s.bangsHit || 0;
    return `Bang!×${fired} · Zásahy×${hit} (${_pct(hit, fired)} %) · Zranění×${s.damageDealt || 0}` +
        ` · Líznuto×${s.cardsDrawn || 0} · Odhoz×${s.cardsDiscarded || 0}`;
}

// Tři nejpoužívanější karty: „Bang!×9, Pivo×4, Kolt×2" (klíč = typ karty, _trackCard v logic.js).
function topCardsLabel(cardsUsed) {
    const top = Object.entries(cardsUsed || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return top.length ? top.map(([t, n]) => `${t}×${n}`).join(', ') : '–';
}

// Řádek tabulky S14 (sloupce podle handoff/screens.md).
function statsRow(p) {
    const s = (p && p.stats) || {};
    const fired = s.bangsFired || 0, hit = s.bangsHit || 0;
    return {
        name: p.name, character: p.character || '–', sheriff: p.role === 'Sheriff',
        bangs: fired, hit: fired ? `${hit} (${_pct(hit, fired)} %)` : '0',
        dealt: s.damageDealt || 0, taken: s.damageTaken || 0, drawn: s.cardsDrawn || 0,
        played: s.cardsPlayed || 0, discarded: s.cardsDiscarded || 0, top: topCardsLabel(s.cardsUsed),
    };
}

// Strany v tabulce statistik. `color` = třída barvy role (--roleSheriff / --roleOutlaw /
// --roleRenegade). Ve hře pro 3 (Město duchů) strany nejsou – každá role hraje sama za sebe.
const STATS_SIDES = [
    { roles: ['Sheriff', 'Deputy'], title: 'Zákon', lead: 'Šerif + Pomocníci', color: 'sheriff' },
    { roles: ['Outlaw'], title: 'Bandité', color: 'outlaw' },
    { roles: ['Renegade'], title: 'Odpadlík', titleMany: 'Odpadlíci', color: 'renegade' },
];
const STATS_SIDES_3P = [
    { roles: ['Deputy'], title: 'Pomocník', color: 'sheriff' },
    { roles: ['Outlaw'], title: 'Bandita', color: 'outlaw' },
    { roles: ['Renegade'], title: 'Odpadlík', color: 'renegade' },
];

// Hráči seskupení podle stran (S14): [{ title, color, summary, rows }]. Prázdná strana
// se vynechá; hráč s neznámou rolí nezmizí, spadne do „Ostatní". `meIdx` = můj index
// ve hře (řádek se zvýrazní), divák null.
function statsGroups(players, winner, meIdx = null) {
    const list = players || [];
    const sides = isThreePlayerMode(list) ? STATS_SIDES_3P : STATS_SIDES;
    const known = new Set(sides.flatMap(s => s.roles));
    const groups = sides.map(s => ({ side: s, members: list.filter(p => p && s.roles.includes(p.role)) }));
    groups.push({ side: { title: 'Ostatní', color: 'other' }, members: list.filter(p => p && !known.has(p.role)) });
    return groups.filter(g => g.members.length).map(({ side, members }) => {
        const n = members.length;
        const won = members.filter(p => playerWon(p, winner, list));
        const result = won.length === n ? (n === 1 ? 'vyhrál' : 'vyhráli')
            : !won.length ? (n === 1 ? 'prohrál' : 'prohráli')
            : `vyhrál ${won.map(p => plainName(p.name)).join(', ')}`;
        return {
            title: n > 1 && side.titleMany ? side.titleMany : side.title,
            color: side.color,
            summary: [side.lead, playersLabel(n), result].filter(Boolean).join(' · '),
            rows: members.map(p => Object.assign(statsRow(p), { me: meIdx != null && list.indexOf(p) === meIdx })),
        };
    });
}

// S15: server posílá jedinou větu („Game leader ukončil hru." / „… opustil hru.").
// Druhý řádek říká, co dál (components.md – hláška bez rady hráči nic neřekne), a hlavní
// akce vede k hraní: hráči „Najít jinou hru" (S6), divákovi „Sledovat jinou hru" (S10).
function kickedView(msg, { spectator = false } = {}) {
    const title = String(msg || 'Game leader ukončil hru.').replace(/^Game leader\b/, 'Game Leader');
    const lead = /opustil/.test(title) ? 'Bez něj hra nemůže pokračovat, stůl se rozpustil.' : 'Stůl se rozpustil.';
    return spectator
        ? { title, hint: `${lead} Můžeš sledovat jinou hru nebo si pustit hru botů.`,
            next: { label: 'Sledovat jinou hru', screen: 'spectate_list' } }
        : { title, hint: `${lead} Můžeš se přidat k jiné hře nebo založit vlastní.`,
            next: { label: 'Najít jinou hru', screen: 'join_list' } };
}

// ── Celoplošné vrstvy: S0 načítání, S1 otoč telefon, G1 banner, G2 výpadek, G3 hláška ──

// S0: pruh načítání pod logem. `missing` = opravné kolo (ensureAssetsLoaded v game.js)
// dotahuje soubory, které při preloadu spadly – procenta tam nedávají smysl.
function loadingView({ pct = 0, missing = 0 } = {}) {
    const p = Math.max(0, Math.min(100, Math.round((pct || 0) * 100)));
    if (missing) {
        return { pct: p, label: '', text: `Dotahuji ${missing} ${czPlural(missing, 'soubor', 'soubory', 'souborů')}…` };
    }
    return { pct: p, label: `${p} %`, text: 'Načítám karty a postavy…' };
}

// G2: výpadek spojení. Kdo sedí u stolu, potřebuje hlavně vědět, že o místo nepřijde
// (server ho drží podle tokenu, viz 'rejoin' v net/handlers.js).
function connLostView(inRoom, attempt) {
    return {
        title: 'Ztraceno spojení',
        hint: inRoom
            ? 'Zkouším se připojit znovu. Tvoje místo u stolu zůstává zabrané — nikam nespěchej.'
            : 'Zkouším se připojit znovu. Server je nejspíš chvíli nedostupný.',
        note: attempt > 0 ? `${attempt}. pokus o připojení` : 'Připojuji…',
    };
}

// G3: server posílá join_error jako { title, hint } – nadpis hlášky a věta, co s tím.
// Starší tvar (holý řetězec) zůstává čitelný, ať klient nepadá na půlce nasazení.
function joinErrorView(err) {
    if (!err) return null;
    const fallback = 'Do hry se nepodařilo připojit';
    if (typeof err === 'string') return { title: fallback, hint: err };
    return { title: err.title || fallback, hint: err.hint || '' };
}

// ── S16 Debug ─────────────────────────────────────────────────────────────

// 2 hráči jsou jen v debug hře (setupDebugGame si role losuje sám, rolesForPlayerCount
// je pro ně „Sheriff + Outlaw").
const DEBUG_PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8];
const DEBUG_ROLES = ['Sheriff', 'Deputy', 'Outlaw', 'Renegade'];

// Dlaždice stavu klienta. `tone` = barva hodnoty ('ok' | 'bad' | 'text' | 'muted').
function debugStats({ connected, pingMs, build, waiting, running }) {
    return [
        { label: 'Spojení', value: connected ? 'připojen' : 'odpojen', tone: connected ? 'ok' : 'bad' },
        { label: 'Odezva serveru', value: pingMs == null ? '—' : `${pingMs} ms`,
          tone: pingMs == null ? 'muted' : pingMs > 250 ? 'bad' : 'text' },
        { label: 'Hry na serveru', value: `${waiting} čeká · ${running} běží`, tone: 'text' },
        { label: 'Otisk serveru', value: build ? String(build).slice(0, 7) : '—', tone: 'muted' },
    ];
}

// Role debug hry v pořadí, v jakém se naklikaly; zbytek si server dolosuje.
function debugRolesLabel(roles) {
    const list = (roles || []).map(roleNameCz);
    return list.length ? list.join(', ') : '(náhodné)';
}

// Payload pro 'debug_start'. Klíče jsou camelCase per rozšíření – takhle je čte
// server/handlers.debug.js, zatímco obrazovky menu drží rozšíření pod klíči
// MENU_EXPANSIONS (dodge_city, …), takže se to musí jednou přeložit.
function debugStartPayload({ count, roles, exps, hnExtra, shadows }) {
    const e = exps || {};
    return {
        playerCount: count,
        roles: roles || [],
        dodgeCity: !!e.dodge_city,
        highNoon: !!e.high_noon,
        highNoonExtra: !!(e.high_noon && hnExtra),
        fistful: !!e.fistful,
        divokyZapad: !!e.divoky_zapad,
        zlataHorecka: !!e.zlata_horecka,
        shadowGunslingers: !!shadows,
    };
}

// Řádek logu zpráv (S16) z jednoho záznamu kruhového bufferu (net/handlers.js).
function socketLogLine(entry) {
    const d = new Date(entry.t);
    const two = (n) => String(n).padStart(2, '0');
    const dirs = { in: ['← přišlo', 'in'], out: ['→ odešlo', 'out'] };
    const [dir, cls] = dirs[entry.dir] || ['···', 'sys'];
    return {
        time: `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`,
        dir, cls,
        msg: entry.note ? `${entry.event} · ${entry.note}` : entry.event,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        esc, czPlural, waitingGamesLabel, runningGamesLabel, waitingGamesCount,
        initialsOf, NAME_MAX, clampName, nameError,
        MENU_EXPANSIONS, emptyExpansions, ADVANCED_OPTIONS, hnExtraVisible, visibleAdvancedOptions,
        advancedSummary, playerCountNote, playersLabel, botsLabel, expansionsLabel,
        ROOM_NAME_MAX, defaultRoomName, createGameBlocker, createGameSummary,
        botGameSummary, botGameOptions,
        isBotName, plainName, expansionsFromKeys, roomWhoLine, roomRowView,
        joinListSubtitle, spectateListSubtitle, joinRoomSubtitle, seatRows, joinRoomBlocker,
        lobbyIsNext, lobbyMissing, lobbyTitle, lobbySubtitle, roomRulesLabel, lobbySeatRows,
        lobbyNotice, lobbyStartButton, lobbyStartEvent, lobbyWaitText,
        playerWon, NEXT_MIN_PLAYERS, nextRoster, nextTally, nextGameSummary, endGameView,
        nextGameView, nextRowTag,
        statsTotalsLabel, topCardsLabel, statsRow, statsGroups, kickedView,
        loadingView, connLostView, joinErrorView,
        DEBUG_PLAYER_COUNTS, DEBUG_ROLES, debugStats, debugRolesLabel, debugStartPayload, socketLogLine,
    };
}
