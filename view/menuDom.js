// view/menuDom.js — nové menu v HTML nad plátnem (plán: docs/menu-ui-plan.md).
// Načítá se PO game.js a view/menu.js (sdílené globály: App, socket, playerName,
// bangToken, gameScene, roomState, renderUI, setUiMode, uiModeStored,
// requestGameFullscreen, loadExpansionAssets) a po core/menuModel.js (esc, initialsOf, …).
//
// Převádí se po obrazovkách: které už kreslí DOM, říká MENU_DOM_SCREENS (menu mimo
// místnost) a MENU_DOM_ROOM_PHASES (lobby místnosti), zbytek kreslí dál Phaser
// (renderMenuScreen ve view/menu.js). renderUI se na začátku zeptá menuDomScreen()
// a vrstvu schová, když ji aktuální pohled nepoužívá.
//
// Render = HTML řetězec obrazovky; do DOM jde jen při změně (renderUI běží i při každém
// lobby_list, takže by jinak skákal scroll). Kliky nesou data-act a obsluhuje je jedna
// tabulka MENU_ACTIONS. Text od hráče (jméno, název hry) vždy přes esc().
//
// Textová pole (data-field) se při psaní NEPŘEKRESLUJÍ – nový <input> by vzal fokus
// a na mobilu zaklapl klávesnici. Psaní zapíše hodnotu přes MENU_FIELDS a vymění jen
// oblasti označené data-live (souhrn a tlačítko v liště), viz _patchMenuLive.

const MENU_DOM_SCREENS = new Set(['main', 'ui_choice', 'create', 'bot_game', 'join_list', 'join_room', 'spectate_list', 'kicked']);

// Fáze místnosti, které kreslí vrstva: lobby = S8, next_lobby = S9 (jméno obrazovky = fáze).
const MENU_DOM_ROOM_PHASES = new Set(['lobby', 'next_lobby']);

// Kterou obrazovku má vrstva právě kreslit, nebo null (pak ji renderUI schová).
// Mimo místnost rozhoduje App.menuScreen, v místnosti její fáze; po výhře (state.winner)
// konec hry (S12) a přes něj statistiky (S14).
function menuDomScreen() {
    // Statistiky patří k výsledku hry – odchodem nebo další hrou se zavřou samy.
    if (!state || !state.winner) App.statsOpen = false;
    if (!roomState) {
        const screen = App.menuScreen || 'main';
        return MENU_DOM_SCREENS.has(screen) ? screen : null;
    }
    if (MENU_DOM_ROOM_PHASES.has(roomState.roomPhase)) return roomState.roomPhase;
    if (state && state.winner) {
        if (App.statsOpen) return 'stats';
        // Hlasování o další hře (roomPhase 'finished', S13) kreslí do fáze 6 plánu ještě Phaser.
        if (roomState.roomPhase !== 'finished') return 'winner';
    }
    return null;
}

// ── Motiv ──────────────────────────────────────────────────────────────────

function menuTheme() {
    try { return localStorage.getItem('bangTheme') === 'light' ? 'light' : 'dark'; } catch (_) { return 'dark'; }
}

function setMenuTheme(theme) {
    try { localStorage.setItem('bangTheme', theme); } catch (_) {}
    document.querySelectorAll('.bang-ui').forEach(el => { el.dataset.theme = theme; });
    renderUI();
}

// ── Kořen vrstvy ───────────────────────────────────────────────────────────

let _menuRoot = null;
let _menuScreenEl = null;
let _menuFsEl = null;
let _menuLastHtml = null;

function _menuEnsureRoot() {
    if (_menuRoot) return _menuRoot;
    _menuRoot = document.createElement('div');
    _menuRoot.id = 'bang-ui';
    _menuRoot.className = 'bang-ui';
    _menuRoot.dataset.theme = menuTheme();
    _menuRoot.innerHTML =
        '<div class="bu-table"><div class="bu-stage">' +
        '<button class="bu-fs" data-act="fullscreen">⛶ Fullscreen</button>' +
        '<div class="bu-screen"></div>' +
        '</div></div>';
    document.body.appendChild(_menuRoot);
    _menuScreenEl = _menuRoot.querySelector('.bu-screen');
    _menuFsEl = _menuRoot.querySelector('.bu-fs');
    _menuRoot.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (!el || el.disabled || !_menuRoot.contains(el)) return;
        const fn = MENU_ACTIONS[el.dataset.act];
        if (fn) fn(el.dataset.arg, el);
    });
    _menuRoot.addEventListener('input', (e) => {
        const field = e.target.dataset && e.target.dataset.field;
        if (!field || !MENU_FIELDS[field]) return;
        MENU_FIELDS[field](e.target.value, e.target);
        _patchMenuLive();
    });
    // Phaser poslouchá klávesnici na window – psaní do pole k němu nesmí probublat.
    const isField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    ['keydown', 'keyup', 'keypress'].forEach(type => _menuRoot.addEventListener(type, (e) => {
        if (!isField(e.target)) return;
        e.stopPropagation();
        if (type === 'keydown' && e.key === 'Enter') {
            const submit = e.target.dataset.submit;
            e.target.blur();
            if (submit && MENU_ACTIONS[submit]) MENU_ACTIONS[submit]();
        }
    }));
    // Mobil: klepnutí mimo pole schová klávesnici (iOS ji jinak nechá překrývat lištu akcí).
    _menuRoot.addEventListener('pointerdown', (e) => {
        const a = document.activeElement;
        if (isField(a) && _menuRoot.contains(a) && e.target !== a) a.blur();
    });
    return _menuRoot;
}

let _menuScreenName = null;

function hideMenuDom() {
    if (_menuRoot) _menuRoot.style.display = 'none';
    _menuScreenName = null;   // návrat na tutéž obrazovku (třeba po sledování) je nový vstup
}

function renderMenuDom(screen) {
    const root = _menuEnsureRoot();
    root.style.display = '';
    root.dataset.theme = menuTheme();
    // Statistiky jsou přes celou obrazovku (i přes rohové ovládání) a vpravo mají „✕ Zavřít".
    _menuFsEl.style.display = document.fullscreenElement || screen === 'stats' ? 'none' : '';
    const build = MENU_SCREENS[screen];
    if (!build) return;
    // Jiná obrazovka začíná nahoře – scroll se drží jen v rámci jedné.
    if (screen !== _menuScreenName) {
        _menuScreenName = screen;
        _menuLastHtml = null;
        _menuScreenEl.innerHTML = '';
        if (MENU_ENTER[screen]) MENU_ENTER[screen]();
    }
    _mountMenuHtml(build());
}

// Jednou při vstupu na obrazovku (odkudkoli – z menu, zpět z detailu, po konci sledování).
const MENU_ENTER = {
    // Jméno se na S7 kontroluje proti obsazeným na serveru; stará chyba ze serveru patří
    // minulému pokusu.
    join_room() {
        App.joinError = null;
        socket.emit('get_taken_names');
    },
    // game_list chodí sám při každé změně, tohle je jen pojistka čerstvosti po návratu.
    spectate_list() { socket.emit('get_game_list'); },
};

// Vymění obsah jen při změně a podrží pozici rolující části (když se změní jen
// číslo v seznamu, nesmí seznam odskočit nahoru) i fokus (klávesnicí ovládané
// menu by po každém přepnutí volby skočilo na začátek stránky).
function _mountMenuHtml(html) {
    if (html === _menuLastHtml) return;
    const scroller = _menuScreenEl.querySelector('.bu-scroll');
    const keep = scroller ? scroller.scrollTop : 0;
    const focusSel = _menuFocusSelector(document.activeElement);
    _menuScreenEl.innerHTML = html;
    _menuLastHtml = html;
    const next = _menuScreenEl.querySelector('.bu-scroll');
    if (next && keep) next.scrollTop = keep;
    if (focusSel) {
        const el = _menuScreenEl.querySelector(focusSel);
        if (el) el.focus({ preventScroll: true });
    }
}

// Selektor, podle kterého se prvek s fokusem najde i v novém HTML (nebo null).
function _menuFocusSelector(el) {
    if (!el || !_menuScreenEl.contains(el) || !el.dataset) return null;
    const q = (v) => `"${String(v).replace(/["\\]/g, '\\$&')}"`;
    if (el.dataset.field) return `[data-field=${q(el.dataset.field)}]`;
    if (!el.dataset.act) return null;
    return `[data-act=${q(el.dataset.act)}]` + (el.dataset.arg != null ? `[data-arg=${q(el.dataset.arg)}]` : '');
}

// Po psaní do pole: vymění jen oblasti data-live, pole samo zůstane (i s fokusem).
// _menuLastHtml se srovná s novým stavem, takže další renderUI nic nepřestaví.
function _patchMenuLive() {
    const build = MENU_SCREENS[_menuScreenName];
    if (!build) return;
    const html = build();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    _menuScreenEl.querySelectorAll('[data-live]').forEach(el => {
        const fresh = tpl.content.querySelector(`[data-live="${el.dataset.live}"]`);
        if (fresh) el.replaceWith(fresh);
    });
    _menuLastHtml = html;
}

// ── Sdílené prvky (handoff/components.md) ──────────────────────────────────

// Neposuvná hlavička: zpět + nadpis a podtitulek. Text od hráče předává volající už
// escapovaný. `leave` = varovná podoba „Opustit hru" (odchod ruší místo v lobby).
function _menuHead(title, sub, { act = 'go', arg = 'main', leave = false } = {}) {
    return `<div class="bu-head">` +
        `<button class="bu-back${leave ? ' leave' : ''}" data-act="${act}"${arg != null ? ` data-arg="${arg}"` : ''}>` +
        `${leave ? '◀ Opustit hru' : '◀ Zpět'}</button>` +
        `<div class="bu-head-txt"><div class="bu-title">${title}</div><div class="bu-sub">${sub}</div></div></div>`;
}

// Neposuvná lišta akcí: vlevo souhrn (co hráč potřebuje vědět, než klikne), vpravo akce.
// data-live – při psaní do pole se vyměňuje jen tahle část (_patchMenuLive).
// `bad` = souhrn je chyba (obsazené jméno, odmítnutí ze serveru); summary null = lišta
// bez souhrnu (lobby – akce se roztáhnou přes celou šířku).
function _menuBar(summary, actionHtml, { bad = false } = {}) {
    const sum = summary == null ? '' : `<div class="bu-bar-sum${bad ? ' bad' : ''}">${summary}</div>`;
    return `<div class="bu-bar" data-live="bar">${sum}${actionHtml}</div>`;
}

// Řádek místnosti (S6, S10): název + kdo, tečky sedaček, počet, stav, akce.
// Celý řádek je jedno tlačítko – „akce" vpravo je jen jeho popisek (vnořený <button> nejde).
function _menuRoomRow(item, running, act) {
    const v = roomRowView(item, running);
    const dots = v.seats.map(on => `<span class="bu-dot${on ? ' on' : ''}"></span>`).join('');
    return `<button class="bu-room ${v.state}" data-act="${act}" data-arg="${esc(item.id)}">` +
        `<span class="bu-room-main"><span class="bu-room-name">${esc(item.name)}</span>` +
        `<span class="bu-room-who">${esc(v.who)}</span></span>` +
        `<span class="bu-room-seats"><span class="bu-dots">${dots}</span>` +
        `<span class="bu-room-count">${v.count}</span></span>` +
        `<span class="bu-room-state">${v.stateText}</span>` +
        `<span class="bu-room-cta">${v.cta}</span></button>`;
}

// Prázdný seznam: slepá ulička se mění na rozcestí – vždy s akcí, kam dál.
function _menuEmpty(text, btnLabel, screen) {
    return `<div class="bu-empty"><div class="bu-empty-title">Prázdno</div>` +
        `<div class="bu-empty-text">${text}</div>` +
        `<button class="bu-btn primary" data-act="go" data-arg="${screen}">${btnLabel}</button></div>`;
}

// Řádky sedaček (S7, S8, S9) – data ze seatRows / lobbySeatRows (core/menuModel.js).
// Lídrovi v lobby je prázdné místo celé jedním tlačítkem „➕ Bot" (addBot) – větší cíl pro
// prst než malé tlačítko v řádku – a u bota má „✕" na odebrání (removeId). Prázdná místa
// schválně nenesou data-arg: fokus pak po přidání bota skočí na další volné místo
// (_menuFocusSelector), takže se stůl dá klávesnicí doplnit opakovaným Enterem.
function _menuSeats(rows) {
    const idx = (r) => `<span class="bu-seat-idx">${r.idx}.</span>`;
    return '<div class="bu-seats">' + rows.map(r => {
        if (r.empty && r.addBot) {
            return `<button class="bu-seat empty add" data-act="addBot">${idx(r)}` +
                `<span class="bu-seat-ico">·</span><span class="bu-seat-name">Přidat bota</span>` +
                `<span class="bu-seat-act">➕ Bot</span></button>`;
        }
        if (r.empty) {
            return `<div class="bu-seat empty">${idx(r)}` +
                `<span class="bu-seat-ico">·</span><span class="bu-seat-name">Čeká se…</span></div>`;
        }
        const rm = r.removeId
            ? `<button class="bu-seat-act rm" data-act="removeBot" data-arg="${esc(r.removeId)}"` +
              ` aria-label="Odebrat ${esc(r.name)}" title="Odebrat bota">✕</button>`
            : '';
        return `<div class="bu-seat${r.me ? ' me' : ''}">${idx(r)}` +
            `<span class="bu-seat-ico">${r.icon}</span><span class="bu-seat-name">${esc(r.name)}</span>` +
            `<span class="bu-seat-tag">${r.tag}</span>${rm}</div>`;
    }).join('') + '</div>';
}

// Poznámka nad obsahem (⏳ čekání, ⚠ problém).
function _menuNotice(ico, html, { bad = false } = {}) {
    return `<div class="bu-notice${bad ? ' bad' : ''}"><span class="bu-notice-ico">${ico}</span><span>${html}</span></div>`;
}

// Položka seznamu, kterou má S7 otevřenou – vždy ČERSTVÁ z lobby_list (seznam chodí sám
// při každé změně), takže se počet i jména v detailu mění živě. null = hra v seznamu
// už není (začala, nebo ji zakladatel zrušil).
function _menuOpenLobby() {
    const id = App.selectedLobby && App.selectedLobby.id;
    const fresh = (App.lobbyList || []).find(r => r.id === id) || null;
    if (fresh) App.selectedLobby = fresh;   // okno se jménem z něj bere obsazená jména
    return fresh;
}

// Řada 3–8 (počet hráčů / botů) – vždy šest tlačítek, i na mobilu.
function _menuCountRow(act, current) {
    return '<div class="bu-counts">' + [3, 4, 5, 6, 7, 8].map(n => {
        const on = current === n;
        return `<button class="bu-count${on ? ' on' : ''}" data-act="${act}" data-arg="${n}" aria-pressed="${on}">${n}</button>`;
    }).join('') + '</div>';
}

// Zaškrtávací karta (rozšíření) nebo řádek (pokročilá volba, cls 'bu-opt').
function _menuCheck(cls, act, key, label, hint, on) {
    return `<button class="${cls}${on ? ' on' : ''}" data-act="${act}" data-arg="${key}" aria-pressed="${on}">` +
        `<span class="bu-box">${on ? '✔' : ''}</span>` +
        `<span class="bu-check-txt"><span class="bu-check-name">${label}</span>` +
        `<span class="bu-check-hint">${hint}</span></span></button>`;
}

function _menuExpansionGrid(act, exps) {
    return '<div class="bu-checks">' +
        MENU_EXPANSIONS.map(e => _menuCheck('bu-check', act, e.key, e.label, e.hint, !!exps[e.key])).join('') +
        '</div>';
}

// Zapnutí rozšíření rovnou dotáhne jeho art (v preloadu se nestahuje).
// HN_EXTRA_AUTO (view/menu.js) — DOČASNÉ: zapnutí High Noon zaškrtne i přibalené karty.
function _menuToggleExpansion(exps, key, onHighNoon) {
    exps[key] = !exps[key];
    if (exps[key]) {
        loadExpansionAssets(gameScene, key);
        if (key === 'high_noon') onHighNoon();
    }
    renderUI();
}

// ── Obrazovky ──────────────────────────────────────────────────────────────

const MENU_SCREENS = {
    // S3 — hlavní menu
    main() {
        const waiting = waitingGamesCount(App.lobbyList);
        const running = (App.gameList || []).length;
        const mobileNow = App.uiProfile === 'mobile';
        const theme = menuTheme();
        const action = (screen, ico, slot, name, sub) =>
            `<button class="bu-menu-btn" data-act="go" data-arg="${screen}">` +
            `<span class="bu-menu-ico ${slot}">${ico}</span>` +
            `<span class="bu-menu-txt"><span class="bu-menu-name">${name}</span>` +
            `<span class="bu-menu-sub">${sub}</span></span></button>`;
        return `
<div class="bu-scroll"><div class="bu-center">
  <div class="bu-logo-wrap">
    <div class="bu-logo">BANG!</div>
    <div class="bu-motto">Poslední, kdo stojí, bere vše.</div>
  </div>
  <div class="bu-menu-grid">
    ${action('join_list', '🎮', 'a', 'Připojit se ke hře', waitingGamesLabel(waiting))}
    ${action('create', '✚', 'b', 'Vytvořit novou hru', '3 až 8 hráčů, 5 rozšíření')}
    ${action('spectate_list', '👁', 'c', 'Sledovat probíhající hru', runningGamesLabel(running))}
    ${action('bot_game', '🤖', 'd', 'Sledovat hru botů', 'Hra bez lidí, rozjede se hned')}
  </div>
  <div class="bu-chips">
    <button class="bu-chip name" data-act="name">
      <span class="bu-avatar${playerName ? '' : ' off'}">${esc(initialsOf(playerName))}</span>
      <span>${playerName ? esc(playerName) : 'Zadat jméno'}</span>
      <span class="bu-chip-edit">✎</span>
    </button>
    <button class="bu-chip" data-act="layout">${mobileNow ? '📱 Mobilní rozložení' : '🖥 PC rozložení'}</button>
    <button class="bu-chip" data-act="theme">${theme === 'dark' ? '🌙 Tmavý motiv' : '☀ Světlý motiv'}</button>
    <button class="bu-chip quiet" data-act="go" data-arg="debug">⚙ Debug</button>
  </div>
</div></div>`;
    },

    // S2 — volba rozložení desky
    ui_choice() {
        // Doporučená je ta, kterou by hra zapnula sama (App.uiProfile – zatím bez volby).
        const auto = App.uiProfile === 'mobile' ? 'big' : 'normal';
        const stored = uiModeStored();
        const card = (mode, ico, name, desc) =>
            `<button class="bu-choice${stored === mode ? ' on' : ''}" data-act="pickLayout" data-arg="${mode}">` +
            `<span class="bu-choice-ico">${ico}</span>` +
            `<span class="bu-choice-name">${name}</span>` +
            `<span class="bu-choice-desc">${desc}</span>` +
            `<span class="bu-choice-tag">${mode === auto ? '✓ doporučeno pro tvé zařízení' : ''}</span></button>`;
        return `
<div class="bu-scroll"><div class="bu-center">
  <div class="bu-logo-wrap">
    <div class="bu-display">Jaké rozložení?</div>
    <div class="bu-lead">Vyber, jak se má kreslit herní stůl. Změnit to jde kdykoli v menu.</div>
  </div>
  <div class="bu-choice-grid">
    ${card('big', '📱', 'Mobilní rozložení', 'Větší karty, soupeři v jedné řadě nahoře, ruka přes celou šířku. Pro telefon a tablet.')}
    ${card('normal', '🖥', 'PC rozložení', 'Soupeři v kruhu kolem stolu, menší karty. Pro počítač a velké displeje.')}
  </div>
</div></div>`;
    },

    // S5 — vytvořit hru
    create() {
        // Výchozí název patří jménu: po přejmenování v menu se nabídne nový.
        if (App.createGameNameOwner !== playerName) {
            App.createGameName = playerName ? defaultRoomName(playerName) : '';
            App.createGameNameOwner = playerName;
        }
        const opts = App.createOptions;
        if (!opts.expansions) opts.expansions = emptyExpansions();
        const exps = opts.expansions;
        const count = App.createPlayerCount;
        const args = { count, title: App.createGameName, playerName, exps };
        const blocked = !!createGameBlocker(args);
        const open = !!App.createAdvanced;
        const advRows = visibleAdvancedOptions(exps)
            .map(o => _menuCheck('bu-opt', 'createAdv', o.key, o.label, o.hint, !!opts[o.key])).join('');
        return `
${_menuHead('Vytvořit novou hru', 'Nastavení platí od začátku hry a pak se nemění')}
<div class="bu-scroll"><div class="bu-form">
  <div class="bu-field-row">
    <label class="bu-field">
      <span class="bu-label">Název hry</span>
      <input class="bu-input compact" data-field="roomName" data-submit="createGame" maxlength="${ROOM_NAME_MAX}"
        value="${esc(App.createGameName)}" autocomplete="off" enterkeyhint="go">
    </label>
    <div class="bu-owner">Hráč: <span>${playerName ? esc(playerName) : '—'}</span></div>
  </div>
  <div>
    <div class="bu-label-row"><span class="bu-label">Počet hráčů</span><span class="bu-required${count ? ' off' : ''}">povinné</span></div>
    ${_menuCountRow('createCount', count)}
    <div class="bu-note">${playerCountNote(count)}</div>
  </div>
  <div>
    <div class="bu-label">Rozšíření <span class="bu-label-aside">— libovolná kombinace</span></div>
    ${_menuExpansionGrid('createExp', exps)}
  </div>
  <div class="bu-adv">
    <button class="bu-adv-head" data-act="createAdvOpen" aria-expanded="${open}">
      <span>Pokročilé možnosti <span class="bu-adv-sum">${advancedSummary(opts, exps)}</span></span>
      <span class="bu-adv-caret">${open ? '▲' : '▼'}</span>
    </button>
    ${open ? `<div class="bu-adv-body">${advRows}</div>` : ''}
  </div>
</div></div>
${_menuBar(esc(createGameSummary(args)),
    `<button class="bu-btn primary bar" data-act="createGame"${blocked ? ' disabled' : ''}>VYTVOŘIT HRU</button>`)}`;
    },

    // S11 — hra botů
    bot_game() {
        if (!App.botGameExpansions) App.botGameExpansions = emptyExpansions();
        const exps = App.botGameExpansions;
        const count = App.botGameCount || 4;
        const extraOn = !!App.botGameHighNoonExtra;
        const extra = !hnExtraVisible(exps) ? '' :
            `<button class="bu-extra${extraOn ? ' on' : ''}" data-act="botHnExtra" aria-pressed="${extraOn}">` +
            `<span class="bu-box">${extraOn ? '✔' : ''}</span>` +
            `<span>Přibalené karty <span class="bu-label-aside">— Nová identita a Želízka z Fistfulu</span></span></button>`;
        return `
${_menuHead('Sledovat hru botů', 'Hra bez lidí · rozjede se hned')}
<div class="bu-scroll"><div class="bu-form">
  <div class="bu-intro">Spustí hru složenou jen z počítačových hráčů, kterou budeš sledovat.
    Jméno se nevyžaduje a hra se rozjede hned, bez rozdávání rolí.</div>
  <div>
    <div class="bu-label">Počet botů</div>
    ${_menuCountRow('botCount', count)}
  </div>
  <div>
    <div class="bu-label">Rozšíření</div>
    ${_menuExpansionGrid('botExp', exps)}
  </div>
  ${extra}
</div></div>
${_menuBar(esc(botGameSummary(count, exps)),
    '<button class="bu-btn primary bar" data-act="startBotGame">▶ SPUSTIT A SLEDOVAT</button>')}`;
    },

    // S6 — připojit se (seznam her, které čekají na hráče; i plné a navazující)
    join_list() {
        const list = App.lobbyList || [];
        const body = list.length
            ? `<div class="bu-list">${list.map(r => _menuRoomRow(r, false, 'openRoom')).join('')}</div>`
            : _menuEmpty('Žádné hry nečekají na hráče.', 'Vytvořit vlastní hru', 'create');
        return `
${_menuHead('Připojit se ke hře', esc(joinListSubtitle(list)))}
<div class="bu-scroll">${body}</div>`;
    },

    // S7 — detail hry před připojením (zpět vede na S6, ne do menu)
    join_room() {
        const item = _menuOpenLobby();
        const last = App.selectedLobby || {};
        const block = joinRoomBlocker(item, playerName, App.allTakenNames);
        const head = _menuHead(esc(last.name || 'Hra'), item ? esc(joinRoomSubtitle(item)) : 'už není v seznamu',
            { arg: 'join_list' });
        if (!item) {
            return `${head}
<div class="bu-scroll"><div class="bu-form">${_menuNotice('⚠', esc(block.text), { bad: true })}</div></div>
${_menuBar('', '<button class="bu-btn bar" data-act="go" data-arg="join_list">◀ ZPĚT NA SEZNAM</button>')}`;
        }
        const seats = _menuSeats(seatRows(item.players, item.maxPlayers, { leader: item.leader }));
        let bar;
        if (block && block.kind === 'full') {
            bar = _menuBar(esc(block.text), '<button class="bu-btn primary bar" disabled>▶ STŮL JE PLNÝ</button>');
        } else if (block && block.kind === 'name') {
            bar = _menuBar(esc(block.text), '<button class="bu-btn primary bar" data-act="name">ZADAT JMÉNO</button>');
        } else if (block && block.kind === 'taken') {
            bar = _menuBar(esc(block.text), '<button class="bu-btn primary bar" data-act="name">ZMĚNIT JMÉNO</button>', { bad: true });
        } else {
            // Chyba ze serveru (plno / obsazené jméno těsně před námi) platí do dalšího pokusu.
            const sum = App.joinError || `Hraje se: ${expansionsLabel(expansionsFromKeys(item.expansions))}`;
            bar = _menuBar(esc(sum),
                `<button class="bu-btn primary bar" data-act="joinRoom">PŘIPOJIT SE (jako ${esc(playerName)})</button>`,
                { bad: !!App.joinError });
        }
        return `${head}
<div class="bu-scroll"><div class="bu-form">${seats}</div></div>
${bar}`;
    },

    // S8 — lobby místnosti, S9 — lobby další hry (roomPhase; data z room_update)
    lobby() { return _menuLobby(); },
    next_lobby() { return _menuLobby(); },

    // S10 — sledovat probíhající hru (sledování není hlavní cesta → akce je sekundární)
    spectate_list() {
        const list = App.gameList || [];
        const body = list.length
            ? `<div class="bu-list">${list.map(g => _menuRoomRow(g, true, 'spectate')).join('')}</div>`
            : _menuEmpty('Žádná hra právě neprobíhá.', 'Sledovat hru botů', 'bot_game');
        return `
${_menuHead('Sledovat probíhající hru', esc(spectateListSubtitle(list)))}
<div class="bu-scroll">${body}</div>`;
    },

    // S12 — konec hry (state.winner, roomPhase 'playing'). Stav po výhře chodí bez redakce.
    // Kdo je „já" a kdo lídr, se pozná podle socketId; divák v room.players není.
    winner() {
        const room = roomState;
        const me = (room.players || []).find(p => p.socketId === socket.id) || null;
        const v = endGameView({
            spectator: !me,
            leader: !!me && room.leaderSocketId === socket.id,
            voted: !!me && me.wantsNext === true,
        });
        const chips = nextGameChips(state.players, room.players);
        const mark = { in: '✅', wait: '…', out: '✕' };
        const tokens = chips.map(c =>
            `<span class="bu-token ${c.status}"><span class="bu-avatar${c.status === 'in' ? '' : ' off'}">${esc(c.initials)}</span>` +
            `<span class="bu-token-name">${esc(c.name)}</span><span class="bu-token-state">${mark[c.status]}</span></span>`).join('');
        const primary = v.primary
            ? `<button class="bu-btn primary" data-act="${v.primary.act}">${v.primary.label}</button>`
            : `<span class="bu-done">${v.done}</span>`;
        const exit = v.exit
            ? `<button class="bu-btn ${v.exit.danger ? 'danger' : 'quiet'}" data-act="${v.exit.act}">${v.exit.label}</button>`
            : '';
        return `
<div class="bu-scroll"><div class="bu-center"><div class="bu-end">
  <div class="bu-kicker">Konec hry</div>
  <div class="bu-result">${esc(state.winner)}</div>
  <div class="bu-actions">
    <button class="bu-btn gold" data-act="stats">📊 Statistiky</button>
    ${primary}
    ${exit}
  </div>
  <div class="bu-tokens">${tokens}</div>
  <div class="bu-end-sum">${esc(nextGameSummary(chips))}</div>
  ${v.note ? `<div class="bu-end-note">${esc(v.note)}</div>` : ''}
</div></div></div>`;
    },

    // S14 — statistiky hry přes celou obrazovku (z S12, i ze staré Phaserové S13 přes showStats).
    // Tabulka má pevnou minimální šířku a na úzkém displeji roluje vodorovně.
    stats() {
        const players = state.players || [];
        const cols = ['Hráč', 'Postava', 'Bang!', 'Trefil', 'Udělil', 'Utrpěl', 'Líznul', 'Zahrál', 'Odhodil', 'Top karty'];
        const head = `<div class="bu-srow head">${cols.map(c => `<span>${c}</span>`).join('')}</div>`;
        const row = (r) => `<div class="bu-srow${r.me ? ' me' : ''}">` +
            `<span class="name">${r.sheriff ? '⭐ ' : ''}${esc(r.name)}</span><span class="char">${esc(r.character)}</span>` +
            [r.bangs, r.hit, r.dealt, r.taken, r.drawn, r.played, r.discarded].map(x => `<span>${esc(x)}</span>`).join('') +
            `<span class="top">${esc(r.top)}</span></div>`;
        const groups = statsGroups(players, state.winner, myIndex).map(g => `
  <div>
    <div class="bu-sgroup ${g.color}"><span class="bu-sgroup-dot"></span>` +
            `<span class="bu-sgroup-title">${esc(g.title)}</span><span class="bu-sgroup-sum">${esc(g.summary)}</span></div>
    <div class="bu-stable">${head}${g.rows.map(row).join('')}</div>
  </div>`).join('');
        return `
<div class="bu-stats-head">
  <div class="bu-head-txt"><div class="bu-stats-title">Statistiky hry</div>` +
            `<div class="bu-sub">${esc(statsTotalsLabel(players))}</div></div>
  <button class="bu-btn quiet bu-stats-x" data-act="statsClose">✕ Zavřít</button>
</div>
<div class="bu-scroll bu-stats-body"><div class="bu-stats-grid">${groups}</div></div>`;
    },

    // S15 — vyhozen (lídr hru zrušil nebo opustil). Hlavní akce vede k hraní, ne do menu.
    kicked() {
        const v = kickedView(App.kickedMsg, { spectator: !!App.kickedSpectator });
        return `
<div class="bu-scroll"><div class="bu-center">
  <div class="bu-logo-wrap"><div class="bu-logo small">BANG!</div></div>
  <div class="bu-kick" role="alert">
    <div class="bu-kick-title">${esc(v.title)}</div>
    <div class="bu-kick-hint">${esc(v.hint)}</div>
  </div>
  <div class="bu-actions">
    <button class="bu-btn" data-act="go" data-arg="main">◀ Zpět do menu</button>
    <button class="bu-btn primary" data-act="go" data-arg="${v.next.screen}">${v.next.label}</button>
  </div>
</div></div>`;
    },
};

// S8 / S9. Zpět je varovné „Opustit hru" – odchod tu ruší místo u stolu (components.md).
// Lídr zahajuje a ruší, ostatní čekají; prázdná místa lídr doplňuje boty.
function _menuLobby() {
    const room = roomState;
    const isLeader = room.leaderSocketId === socket.id;
    const note = lobbyNotice(room, isLeader);
    // Pokročilé volby nad sedačkami – pod nimi by je při 8 místech nikdo neviděl.
    const rules = roomRulesLabel(room.options);
    const rulesLine = rules ? `<div class="bu-rules">Pravidla: <span>${esc(rules)}</span></div>` : '';
    let actions;
    if (isLeader) {
        const start = lobbyStartButton(room, App.startPressed);
        actions = `<button class="bu-btn primary bar grow" data-act="startGame"${start.can ? '' : ' disabled'}>${start.label}</button>` +
            '<button class="bu-btn danger bar" data-act="cancelGame">✕ ZRUŠIT HRU</button>';
    } else {
        actions = `<div class="bu-wait">${esc(lobbyWaitText(room))}</div>`;
    }
    return `
${_menuHead(esc(lobbyTitle(room)), esc(lobbySubtitle(room)), { act: 'leaveRoom', arg: null, leave: true })}
<div class="bu-scroll"><div class="bu-form">
  ${note ? _menuNotice(note.ico, esc(note.text)) : ''}
  ${rulesLine}
  ${_menuSeats(lobbySeatRows(room, socket.id))}
</div></div>
${_menuBar(null, actions)}`;
}

// ── Textová pole (data-field) ──────────────────────────────────────────────
// Zapíšou hodnotu do stavu; překreslí se jen data-live oblasti (_patchMenuLive).

const MENU_FIELDS = {
    roomName(value) {
        App.createGameName = value;
        App.createGameNameOwner = playerName;
    },
};

// ── Akce ───────────────────────────────────────────────────────────────────

const MENU_ACTIONS = {
    fullscreen() { requestGameFullscreen(); },
    go(screen) {
        // Zakládá se pod jménem – bez něj se nejdřív zeptej, na S5 se jde až po „OK".
        if (screen === 'create' && !playerName) {
            openNameModal({ onConfirm: () => { App.menuScreen = 'create'; renderUI(); } });
            return;
        }
        App.menuScreen = screen;
        renderUI();
    },
    name() { openNameModal({}); },
    layout() { setUiMode(App.uiProfile === 'mobile' ? 'normal' : 'big'); },
    theme() { setMenuTheme(menuTheme() === 'dark' ? 'light' : 'dark'); },
    pickLayout(mode) {
        App.menuScreen = 'main';
        setUiMode(mode);
    },

    // S5
    createCount(n) { App.createPlayerCount = Number(n); renderUI(); },
    createExp(key) {
        _menuToggleExpansion(App.createOptions.expansions, key, () => { App.createOptions.highNoonExtra = true; });
    },
    createAdvOpen() { App.createAdvanced = !App.createAdvanced; renderUI(); },
    createAdv(key) { App.createOptions[key] = !App.createOptions[key]; renderUI(); },
    createGame() {
        const name = (App.createGameName || '').trim();
        if (createGameBlocker({ count: App.createPlayerCount, title: name, playerName })) return;
        socket.emit('create_room', { name, maxPlayers: App.createPlayerCount, playerName, options: App.createOptions || {}, token: bangToken });
        App.createPlayerCount = null;
        App.createGameName = null;
        App.createGameNameOwner = null;
        App.createOptions = { noAdvancedCards: false, singleChar: false, rotatingSheriff: false, highNoonExtra: false, expansions: emptyExpansions() };
    },

    // S11
    botCount(n) { App.botGameCount = Number(n); renderUI(); },
    botExp(key) {
        _menuToggleExpansion(App.botGameExpansions, key, () => { App.botGameHighNoonExtra = true; });
    },
    botHnExtra() { App.botGameHighNoonExtra = !App.botGameHighNoonExtra; renderUI(); },
    startBotGame() {
        App.ignoreRoomId = null;   // vstupujeme do hry (jako u sledování) – filtr už nemá co blokovat
        socket.emit('create_bot_game', {
            count: App.botGameCount || 4,
            options: botGameOptions(App.botGameExpansions, App.botGameHighNoonExtra),
        });
    },

    // S6 → S7
    openRoom(id) {
        const item = (App.lobbyList || []).find(r => r.id === id);
        if (!item) return;
        App.selectedLobby = item;
        App.menuScreen = 'join_room';
        renderUI();
    },
    // S7 – server odpoví room_joined (→ lobby), nebo join_error (→ souhrn v liště).
    joinRoom() {
        const item = _menuOpenLobby();
        if (joinRoomBlocker(item, playerName, App.allTakenNames)) return;
        App.joinError = null;
        socket.emit('join_room', { roomId: item.id, playerName, token: bangToken });
    },

    // S8 / S9 – odpovědi chodí jako room_update (sedačky), go_to_menu (odchod, zrušení)
    // a u ostatních kicked_from_game (S15).
    leaveRoom() { socket.emit('leave_room'); },
    cancelGame() { socket.emit('cancel_game'); },
    addBot() { socket.emit('add_bot'); },
    removeBot(socketId) { socket.emit('remove_bot', { socketId }); },
    // Zahájení jde zmáčknout jen jednou: App.startPressed zamkne tlačítko hned z kliknutí
    // (odpověď serveru přijde až za sítí); odemkne ho room_update (net/handlers.js).
    startGame() {
        if (!roomState || !lobbyStartButton(roomState, App.startPressed).can) return;
        App.startPressed = true;
        socket.emit(lobbyStartEvent(roomState));
        renderUI();
    },

    // S12 / S14. Hlasování jede ještě po staru (endGameView v core/menuModel.js).
    stats() { App.statsOpen = true; renderUI(); },
    statsClose() { App.statsOpen = false; renderUI(); },
    nextVote() { socket.emit('vote_next_game', true); },
    // Druhý klik lídra by hlasování spustil znovu a vynuloval hlasy, které mezitím přišly –
    // tlačítko se proto zamkne hned; stav (fáze 'finished') ho vzápětí stejně vystřídá.
    nextStart(_, el) {
        if (el) el.disabled = true;
        socket.emit('leader_start_next');
    },
    toMenu() { socket.emit('go_to_menu'); },

    // S10
    spectate(id) {
        App.ignoreRoomId = null;   // sledujeme znovu (klidně i tu samou hru)
        App.spectating = true;
        socket.emit('spectate', { roomId: id });
    },
};

// ── S4 — okno se jménem ────────────────────────────────────────────────────
// Vlastní kořen (ne uvnitř vrstvy): otevírají ho i staré Phaserové obrazovky přes
// showNameInput (view/menu.js), pod kterými je vrstva schovaná.
//   onConfirm(name) – po uložení; onCancel() – po ✕ / Esc (bez uložení).

let _nameModal = null;

function openNameModal({ onConfirm, onCancel } = {}) {
    closeNameModal();
    socket.emit('get_taken_names');
    const root = document.createElement('div');
    root.className = 'bang-ui bu-modal-root';
    root.dataset.theme = menuTheme();
    root.innerHTML = `
<div class="bu-modal-scrim">
  <div class="bu-modal" role="dialog" aria-modal="true" aria-labelledby="bu-name-title">
    <div class="bu-modal-head">
      <div class="bu-modal-title" id="bu-name-title">Tvoje jméno</div>
      <button class="bu-modal-x" data-name="close" aria-label="Zavřít">✕</button>
    </div>
    <div class="bu-modal-lead">Vidí ho ostatní u stolu. Nejvýš ${NAME_MAX} znaků.</div>
    <input class="bu-input" maxlength="${NAME_MAX}" placeholder="Tvoje jméno" autocomplete="nickname">
    <div class="bu-form-error"></div>
    <button class="bu-btn primary block" data-name="save">OK</button>
  </div>
</div>`;
    document.body.appendChild(root);
    const input = root.querySelector('.bu-input');
    const errEl = root.querySelector('.bu-form-error');
    input.value = playerName || '';

    const taken = () => (App.allTakenNames || []).concat(App.selectedLobby?.players || [])
        .filter(n => n !== playerName);   // vlastní dosavadní jméno obsazené není
    const showErr = (msg) => {
        errEl.textContent = msg || '';
        input.classList.toggle('err', !!msg);
    };
    const save = () => {
        const val = input.value.trim();
        const err = nameError(val, taken());
        if (err) { showErr(err); return; }
        playerName = val;
        try { localStorage.setItem('bangName', val); } catch (_) {}
        closeNameModal();
        if (onConfirm) onConfirm(val);
        else renderUI();
    };
    const cancel = () => {
        closeNameModal();
        if (onCancel) onCancel();
    };

    input.addEventListener('input', () => {
        const clamped = clampName(input.value);
        if (clamped !== input.value) input.value = clamped;
        showErr(input.value.trim() ? nameError(input.value, taken()) : '');
        socket.emit('get_taken_names');
    });
    // stopPropagation: Phaser poslouchá klávesnici na window.
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') cancel();
    });
    root.addEventListener('click', (e) => {
        const act = e.target.closest('[data-name]')?.dataset.name;
        if (act === 'save') save();
        if (act === 'close') cancel();
    });
    _nameModal = root;
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeNameModal() {
    if (_nameModal) { _nameModal.remove(); _nameModal = null; }
}
