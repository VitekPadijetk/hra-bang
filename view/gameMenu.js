// view/gameMenu.js — herní menu (☰ ve hře) a lišta pauzy (bugy 73, 76).
//
// Kreslí se v HTML vrstvě celoplošných oken (`.bu-ov-root`, view/menuDom.js), ne na
// plátně: je to formulář s textovým polem a nad deskou musí ležet bez ohledu na hloubky
// Phaseru. Otevírá ho Phaserové tlačítko „☰ Menu" v levém horním rohu (game.js).
//
//   • Pozastavit / Pokračovat – jen game leader. Server (server/handlers.menu.js) pak
//     zahazuje všechny herní akce; tady je jen lišta, která to všem řekne.
//   • Nahlásit chybu – text jde socketem na server a uloží se do reports/ i s odkazem
//     na herní log a snímkem stavu (server/reports.js).
//   • Celá obrazovka, Ukončit hru (lídr) – dřív samostatná tlačítka v rozích.
//
// Stav drží App.gameMenu (null | 'main' | 'report') a App.bug* (state.js).

function gameMenuIsLeader() {
    return !!(typeof roomState !== 'undefined' && roomState && roomState.leaderSocketId === socket.id);
}

function gameMenuInGame() {
    return !!(typeof roomState !== 'undefined' && roomState && roomState.gameState &&
        roomState.roomPhase !== 'lobby' && roomState.roomPhase !== 'next_lobby');
}

function openGameMenu() {
    App.gameMenu = 'main';
    renderMenuOverlays();
}

// Lišta pauzy: nahoře uprostřed, kliky propouští jen sama na sebe (deska pod ní
// zůstává prohlížecí – zvětšování karet i obchod fungují dál).
function _ovPause() {
    const p = gameMenuInGame() && roomState.paused;
    if (!p || roomState.gameState.winner) return '';
    const by = p.by ? ` — pozastavil ${esc(p.by)}` : '';
    const btn = gameMenuIsLeader()
        ? '<button class="bu-pause-btn" data-act="gmResume">▶ Pokračovat</button>' : '';
    return `<div class="bu-pause" role="status"><span class="bu-pause-ico">⏸</span>` +
        `<span class="bu-pause-txt">Hra je pozastavená${by}</span>${btn}</div>`;
}

function _ovGameMenu() {
    if (!App.gameMenu) return '';
    if (!gameMenuInGame()) { App.gameMenu = null; return ''; }
    return App.gameMenu === 'report' ? _gmReport() : _gmMain();
}

function _gmMain() {
    const leader = gameMenuIsLeader();
    const st = roomState.gameState;
    const live = !st.winner;
    const rows = [];
    if (leader && live && roomState.roomPhase === 'playing') {
        rows.push(roomState.paused
            ? '<button class="bu-btn primary block" data-act="gmResume">▶ Pokračovat ve hře</button>'
            : '<button class="bu-btn block" data-act="gmPause">⏸ Pozastavit hru</button>');
    }
    rows.push('<button class="bu-btn block" data-act="gmReport">🐞 Nahlásit chybu</button>');
    rows.push(document.fullscreenElement
        ? '<button class="bu-btn block" data-act="gmFullscreenExit">⛶ Ukončit celou obrazovku</button>'
        : '<button class="bu-btn block" data-act="gmFullscreen">⛶ Celá obrazovka</button>');
    if (leader && live && !App.spectating) {
        rows.push('<button class="bu-btn danger block" data-act="gmCancelGame">✕ Ukončit hru</button>');
    }
    const note = leader ? '' : '<div class="bu-dialog-note">Pozastavit hru může jen game leader.</div>';
    return '<div class="bu-scrim" data-act="gmCloseScrim"><div class="bu-dialog bu-gm" role="dialog" aria-label="Menu">' +
        '<div class="bu-dialog-title">Menu</div>' +
        `<div class="bu-gm-list">${rows.join('')}</div>${note}` +
        '<button class="bu-btn quiet block" data-act="gmClose">Zpět do hry</button></div></div>';
}

function _gmReport() {
    const sent = App.bugSent;
    const body = sent
        ? '<div class="bu-dialog-hint">Díky! Hlášení je uložené na serveru i se záznamem hry, takže se dá dohledat, co se stalo.</div>' +
          '<button class="bu-btn primary block" data-act="gmClose">Zpět do hry</button>'
        : '<div class="bu-dialog-hint">Co se stalo a co jsi čekal? Záznam hry a stav stolu se přiloží samy.</div>' +
          '<textarea class="bu-input bu-gm-text" data-bug="1" maxlength="2000" rows="6" ' +
          'placeholder="Např.: zahrál jsem Paniku na Willyho a karta mi zůstala v ruce…"></textarea>' +
          (App.bugError ? `<div class="bu-gm-err">${esc(App.bugError)}</div>` : '') +
          `<button class="bu-btn primary block" data-act="gmSend"${App.bugSending ? ' disabled' : ''}>` +
          `${App.bugSending ? 'Odesílám…' : 'Odeslat hlášení'}</button>` +
          '<button class="bu-btn quiet block" data-act="gmBack">Zpět</button>';
    return '<div class="bu-scrim"><div class="bu-dialog bu-gm" role="dialog" aria-label="Nahlásit chybu">' +
        `<div class="bu-dialog-title">🐞 Nahlásit chybu</div>${body}</div></div>`;
}

// Kontext k hlášení: to, co hráč sám nenapíše a server neví (jeho strana obrazovky).
function _gmReportContext() {
    const st = roomState && roomState.gameState;
    return {
        roomId: roomState && roomState.roomId,
        myIndex: typeof myIndex !== 'undefined' ? myIndex : null,
        spectating: !!App.spectating,
        phase: st ? st.phase : null,
        currentPlayerIndex: st ? st.currentPlayerIndex : null,
        blockInput: !!App.blockInput,
        layout: App.layout && App.layout.name || null,
        viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
        fullscreen: !!document.fullscreenElement,
        userAgent: navigator.userAgent,
        build: App.serverBuild || null,
        socketLog: (App.socketLog || []).slice(0, 25),
    };
}

Object.assign(MENU_ACTIONS, {
    gmClose() { App.gameMenu = null; renderMenuOverlays(); },
    // Klik do ztmavení mimo okno zavírá; klik dovnitř okna probublá sem taky, proto
    // se zavírá jen tehdy, když cíl byl samotné ztmavení.
    gmCloseScrim(_arg, el) {
        if (_gmLastClickTarget !== el) return;
        App.gameMenu = null; renderMenuOverlays();
    },
    gmPause() { socket.emit('pause_game', { paused: true }); App.gameMenu = null; renderMenuOverlays(); },
    gmResume() { socket.emit('pause_game', { paused: false }); App.gameMenu = null; renderMenuOverlays(); },
    gmReport() {
        App.gameMenu = 'report'; App.bugSent = false; App.bugError = null;
        renderMenuOverlays();
        _ovRoot && _ovRoot.querySelector('textarea[data-bug]')?.focus();
    },
    gmBack() { App.gameMenu = 'main'; App.bugError = null; renderMenuOverlays(); },
    gmSend() {
        const text = (App.bugDraft || '').trim();
        if (text.length < 5) { App.bugError = 'Popiš chybu aspoň pár slovy.'; renderMenuOverlays(); return; }
        App.bugSending = true; App.bugError = null;
        renderMenuOverlays();
        socket.emit('bug_report', { text, context: _gmReportContext() });
    },
    gmFullscreen() { App.gameMenu = null; renderMenuOverlays(); requestGameFullscreen(); },
    gmFullscreenExit() {
        App.gameMenu = null; renderMenuOverlays();
        try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); } catch (_) {}
    },
    gmCancelGame() {
        if (confirm('Opravdu chceš ukončit hru? Všichni hráči se vrátí do menu.')) {
            App.gameMenu = null; renderMenuOverlays();
            socket.emit('cancel_game');
        }
    },
});

// Klik na ztmavení se pozná podle původního cíle (closest('[data-act]') by ho z okna
// vyzvedl taky). Zachytává se dřív než delegovaný handler kořene.
let _gmLastClickTarget = null;
{
    const root = _ovEnsureRoot();
    root.addEventListener('click', (e) => { _gmLastClickTarget = e.target; }, true);
    // Koncept hlášení se drží v App, protože kořen se při změně stavu (toast, pauza)
    // překreslí celý a textové pole by přišlo o napsaný text.
    root.addEventListener('input', (e) => {
        if (e.target && e.target.matches && e.target.matches('textarea[data-bug]')) App.bugDraft = e.target.value;
    });
    // Klávesy v poli nesmí propadnout do hry (Phaser / chat poslouchají na dokumentu).
    root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && App.gameMenu) { App.gameMenu = null; renderMenuOverlays(); return; }
        if (e.target && e.target.matches && e.target.matches('textarea[data-bug]')) e.stopPropagation();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && App.gameMenu) { App.gameMenu = null; renderMenuOverlays(); }
    });
}

// Po překreslení kořene vrať textovému poli napsaný text (a fokus, pokud ho mělo).
function gameMenuAfterRender(root, hadFocus) {
    const ta = root.querySelector('textarea[data-bug]');
    if (!ta) return;
    ta.value = App.bugDraft || '';
    if (hadFocus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

socket.on('bug_report_result', (res) => {
    App.bugSending = false;
    if (res && res.ok) { App.bugSent = true; App.bugDraft = ''; App.bugError = null; }
    else App.bugError = (res && res.error) || 'Hlášení se nepodařilo odeslat.';
    renderMenuOverlays();
});

document.addEventListener('fullscreenchange', () => { if (App.gameMenu) renderMenuOverlays(); });
