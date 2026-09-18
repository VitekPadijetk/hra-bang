// core/menuModel.js — čistá logika nového menu v HTML (view/menuDom.js), bez DOM.
// Texty a rozhodnutí, která se dají otestovat v Node: skloňování počtů, iniciály,
// jméno hráče, escapování, nastavení nové hry. Plán: docs/menu-ui-plan.md.

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

const ADVANCED_OPTIONS = [
    { key: 'noAdvancedCards', label: 'Zakázat pokročilé karty', hint: 'Bez Duelu, Hokynářství, Indiánů, Vězení a Dynamitu' },
    { key: 'singleChar', label: 'Přiřadit postavu náhodně', hint: 'Hráči si nevybírají ze dvou postav' },
    { key: 'rotatingSheriff', label: 'Rotující šerif', hint: 'Šerif se po každé hře posouvá doleva' },
    { key: 'highNoonExtra', label: 'High Noon: přibalené karty', hint: '+ Nová identita a Želízka z Fistfulu' },
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
function botGameOptions(exps, hnExtra) {
    const expansions = emptyExpansions();
    for (const k of Object.keys(expansions)) expansions[k] = !!(exps && exps[k]);
    return { expansions, highNoonExtra: expansions.high_noon && !!hnExtra };
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

// Řádky sedaček (components.md „Řádek sedačky"; S7, ve fázi 4 i lobby S8/S9): obsazená
// místa v pořadí u stolu, pak prázdná. `me` = moje jméno (zvýrazněný řádek s „(ty)"),
// `leader` = jméno Game Leadera.
function seatRows(names, maxPlayers, { leader = null, me = null } = {}) {
    const list = names || [];
    const rows = [];
    for (let i = 0; i < Math.max(maxPlayers || 0, list.length); i++) {
        const name = list[i];
        if (name == null) { rows.push({ idx: i + 1, empty: true }); continue; }
        const bot = isBotName(name);
        const isLeader = leader != null && name === leader;
        const isMe = me != null && name === me;
        rows.push({
            idx: i + 1, empty: false, bot, leader: isLeader, me: isMe,
            icon: isLeader ? '👑' : bot ? '🤖' : '🎩',
            name: plainName(name),
            tag: [isMe ? '(ty)' : '', isLeader ? 'Game Leader' : '', bot ? 'bot' : ''].filter(Boolean).join(' · '),
        });
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
    };
}
