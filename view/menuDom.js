// view/menuDom.js — nové menu v HTML nad plátnem (plán: docs/menu-ui-plan.md).
// Načítá se PO game.js a view/menu.js (sdílené globály: App, socket, playerName,
// roomState, renderUI, setUiMode, uiModeStored, requestGameFullscreen) a po
// core/menuModel.js (esc, initialsOf, …).
//
// Převádí se po obrazovkách: které už kreslí DOM, říká MENU_DOM_SCREENS, zbytek kreslí
// dál Phaser (renderMenuScreen ve view/menu.js). renderUI se na začátku zeptá
// menuDomHandles() a vrstvu schová, když ji aktuální pohled nepoužívá.
//
// Render = HTML řetězec obrazovky; do DOM jde jen při změně (renderUI běží i při každém
// lobby_list, takže by jinak skákal scroll). Kliky nesou data-act a obsluhuje je jedna
// tabulka MENU_ACTIONS. Text od hráče (jméno, název hry) vždy přes esc().

const MENU_DOM_SCREENS = new Set(['main', 'ui_choice']);

function menuDomHandles(screen) {
    return MENU_DOM_SCREENS.has(screen);
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
    return _menuRoot;
}

function hideMenuDom() {
    if (_menuRoot) _menuRoot.style.display = 'none';
}

function renderMenuDom(screen) {
    const root = _menuEnsureRoot();
    root.style.display = '';
    root.dataset.theme = menuTheme();
    _menuFsEl.style.display = document.fullscreenElement ? 'none' : '';
    const build = MENU_SCREENS[screen];
    if (!build) return;
    _mountMenuHtml(build());
}

// Vymění obsah jen při změně a podrží pozici rolující části (když se změní jen
// číslo v seznamu, nesmí seznam odskočit nahoru).
function _mountMenuHtml(html) {
    if (html === _menuLastHtml) return;
    const scroller = _menuScreenEl.querySelector('.bu-scroll');
    const keep = scroller ? scroller.scrollTop : 0;
    _menuScreenEl.innerHTML = html;
    _menuLastHtml = html;
    const next = _menuScreenEl.querySelector('.bu-scroll');
    if (next && keep) next.scrollTop = keep;
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
};

// ── Akce ───────────────────────────────────────────────────────────────────

const MENU_ACTIONS = {
    fullscreen() { requestGameFullscreen(); },
    go(screen) {
        if (screen === 'join_list') App.joinListFetched = false;
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
