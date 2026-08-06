// view/menu.js — předherní a režijní UI: hlavní menu, lobby, zadání jména,
// statistiky a creative/debug overlay. Vytaženo z game.js byte-přesně.
// Načítá se PO game.js (sdílené globály: gameScene, state, myIndex, App, socket,
// roomState, renderUI, mAdd). Volané cross-file z renderUI (menu/lobby),
// view/screens.js (showStats) a view/board.js (showCreativeMode).

let _nameInputShown = false;
function showNameInput(onConfirm) {
    if (playerName !== null) return;
    if (_nameInputShown) return;
    _nameInputShown = true;

    let overlay = document.getElementById('name-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'name-overlay';
        overlay.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            background:rgba(30,26,36,0.98);padding:36px 48px;border-radius:16px;
            z-index:999;text-align:center;border:2px solid #8a6d1f;
            box-shadow:0 8px 40px rgba(0,0,0,0.6);font-family:'Oswald',sans-serif;`;
        overlay.innerHTML = `
            <p style="color:#e0b23c;font-size:26px;font-weight:600;margin:0 0 18px">Zadej své jméno</p>
            <input id="pname" maxlength="18" placeholder="Tvoje jméno"
                style="font-family:'Oswald',sans-serif;font-size:22px;padding:8px 14px;width:220px;border-radius:8px;
                border:1px solid #3a3242;background:#141118;color:#f2ede4;outline:none;">
            <p id="pname-err" style="color:#d64545;font-size:16px;margin:8px 0 0;min-height:20px;"></p>
            <button id="pname-ok" style="font-family:'Oswald',sans-serif;font-size:20px;font-weight:600;padding:8px 28px;
                background:#4a3a12;color:#e0b23c;border:1px solid #e0b23c;border-radius:8px;cursor:pointer;margin-top:8px;">OK</button>`;
        document.body.appendChild(overlay);

        const errEl = () => document.getElementById('pname-err');

        const validateName = (val) => {
            if (!val) return 'Jméno nesmí být prázdné.';
            const taken = App.allTakenNames || [];
            const inLobby = App.selectedLobby?.players || [];
            if (taken.includes(val) || inLobby.includes(val)) return `Jméno "${val}" je již obsazeno.`;
            return null;
        };

        const confirm = () => {
            const val = document.getElementById('pname')?.value.trim();
            if (!val) return;
            const err = validateName(val);
            if (err) { errEl().textContent = err; return; }
            playerName = val;
            overlay.remove();
            _nameInputShown = false;
            onConfirm(playerName);
        };

        document.getElementById('pname').oninput = () => {
            const val = document.getElementById('pname')?.value.trim();
            const err = validateName(val);
            errEl().textContent = err || '';
            socket.emit('get_taken_names');
        };
        document.getElementById('pname-ok').onclick = confirm;
        document.getElementById('pname').onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') confirm();
        };
        setTimeout(() => document.getElementById('pname')?.focus(), 50);
    }
}

function showCreativeMode(playerIdx) {
    const existingEl = document.getElementById('creative-overlay');
    if (existingEl) { existingEl.remove(); return; }

    const allCards = App.allCardsData || [];
    const pl = state?.players[playerIdx];
    if (!pl) return;

    const div = document.createElement('div');
    div.id = 'creative-overlay';
    div.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.93);z-index:2000;display:flex;flex-direction:column;
        font-family:sans-serif;color:#eee;box-sizing:border-box;`;

    div.innerHTML = `
      <div style="display:flex;align-items:center;padding:10px 16px;background:#111;gap:12px;flex-shrink:0">
        <span style="font-size:22px;font-weight:bold;color:#8f8">🃏 Creative Mode – ${pl.name}</span>
        <span style="color:#aaa;font-size:14px">Hráč:</span>
        ${state.players.map((p,i) => `<button onclick="document.getElementById('creative-overlay').remove();showCreativeMode(${i})"
          style="padding:4px 10px;background:${i===playerIdx?'#336':'#222'};color:${i===playerIdx?'#8cf':'#aaa'};
          border:none;border-radius:4px;cursor:pointer;font-size:13px">${p.name}</button>`).join('')}
        <span style="margin-left:auto">
          <input id="cm-search" placeholder="Hledat kartu…" style="padding:5px 10px;background:#222;color:#eee;
            border:1px solid #444;border-radius:4px;font-size:14px;width:180px">
          <button onclick="document.getElementById('creative-overlay').remove()"
            style="margin-left:8px;padding:5px 14px;background:#600;color:#fff;border:none;
            border-radius:4px;cursor:pointer;font-size:14px">✕ Zavřít</button>
        </span>
      </div>

      <div style="display:flex;flex:1;overflow:hidden">
        <div style="flex:1;display:flex;flex-direction:column;border-right:1px solid #333">
          <div style="padding:8px 12px;background:#0a2010;font-size:14px;color:#8f8;font-weight:bold;flex-shrink:0">
            ➕ Přidat kartu do ruky
          </div>
          <div id="cm-give-list" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start">
          </div>
        </div>
        <div style="flex:0 0 320px;display:flex;flex-direction:column">
          <div style="padding:8px 12px;background:#200a0a;font-size:14px;color:#f88;font-weight:bold;flex-shrink:0">
            ➖ Odebrat kartu
          </div>
          <div id="cm-remove-list" style="flex:1;overflow-y:auto;padding:8px">
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);

    const searchEl = div.querySelector('#cm-search');
    searchEl.addEventListener('input', () => renderGiveList(searchEl.value));
    setTimeout(() => searchEl.focus(), 50);

    function renderGiveList(filter = '') {
        const container = div.querySelector('#cm-give-list');
        container.innerHTML = '';
        const f = filter.toLowerCase();
        allCards.filter(c => !f || c.name.toLowerCase().includes(f) || (c.type||'').toLowerCase().includes(f))
            .forEach(c => {
                const btn = document.createElement('button');
                const typeColor = { 'Bang!':'#a33','Vedle!':'#33a','Pivo':'#aa3',
                    'Zbraň':'#373','Barel':'#373','Vybavení':'#373','Dynamit':'#373',
                    'Panika!':'#a3a','Cat Balou':'#a3a','Duel':'#733','Salon':'#3a3',
                    'Dostavník':'#3aa','Wells Fargo':'#3aa','Hokynářství':'#773',
                    'Indiáni!':'#a63','Kulomet':'#a63','Vězení':'#55a' }[c.type] || '#333';
                btn.textContent = `${c.name} (${c.type})`;
                btn.style.cssText = `padding:4px 8px;background:${typeColor};color:#eee;border:none;
                    border-radius:3px;cursor:pointer;font-size:12px;text-align:left;`;
                btn.onclick = () => {
                    socket.emit('debug_give_card', { playerIdx, card: c });
                    btn.style.outline = '2px solid #8f8';
                    setTimeout(() => { if (btn) btn.style.outline = ''; }, 600);
                };
                container.appendChild(btn);
            });
        if (!container.children.length) container.innerHTML = '<span style="color:#555;font-size:13px">Žádná karta</span>';
    }

    function renderRemoveList() {
        const container = div.querySelector('#cm-remove-list');
        container.innerHTML = '';

        const sections = [
            { label: 'Ruka', items: pl.hand.map((c,i) => ({ ...c, _area:'hand', _idx:i })) },
            { label: 'Zbraň', items: pl.weapon?.id !== -1 ? [{ ...pl.weapon, _area:'weapon', _idx:0 }] : [] },
            { label: 'Stůl', items: (pl.board||[]).map((c,i) => ({ ...c, _area:'board', _idx:i })) },
        ];

        sections.forEach(({ label, items }) => {
            if (!items.length) return;
            const hdr = document.createElement('div');
            hdr.textContent = label;
            hdr.style.cssText = 'font-size:12px;color:#888;margin:6px 0 3px;font-weight:bold;';
            container.appendChild(hdr);
            items.forEach(c => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:2px 0;';
                row.innerHTML = `<span style="font-size:12px;color:#ccc">${c.name||'?'}</span>
                  <button style="padding:2px 8px;background:#500;color:#f88;border:none;border-radius:3px;cursor:pointer;font-size:11px">✕</button>`;
                row.querySelector('button').onclick = () => {
                    socket.emit('debug_remove_card', { playerIdx, area: c._area, cardIdx: c._idx });
                    div.remove();
                    setTimeout(() => showCreativeMode(playerIdx), 150);
                };
                container.appendChild(row);
            });
        });
        if (!container.children.length) {
            container.innerHTML = '<span style="color:#555;font-size:13px">Hráč nemá žádné karty</span>';
        }
    }

    renderGiveList();
    renderRemoveList();
}

// ── MENU SCREENS ──────────────────────────────────────────────────────────────
// menuBtn zachovává původní signaturu, ale kreslí jednotné zaoblené tlačítko (theme).
// `color`/`hoverColor` se použijí jako výplň/hover (drží drobnou barevnou identitu akcí),
// rám i font řeší themeButton.
function menuBtn(x, y, label, color, hoverColor, w, h) {
    return themeButton(gameScene, x, y, w, h, label, {
        fill: color, fillHover: hoverColor, fontSize: '26px',
    });
}

function menuBackBtn(cb) {
    const { bg } = themeButton(gameScene, 110, 56, 150, 54, '◀  Zpět', {
        fill: THEME.color.panelNum, fillHover: THEME.color.panelHiNum,
        stroke: THEME.color.borderNum, textColor: THEME.color.textMuted, fontSize: '22px',
        onClick: cb,
    });
    bg.setDepth(500);
}

// Zaoblený interaktivní řádek seznamu (obsah – texty – se přidává zvlášť navrch).
function menuRow(x, y, w, h, onClick) {
    const r = 12;
    const g = gameScene.add.graphics();
    const draw = (fill, stroke) => {
        g.clear();
        g.fillStyle(fill, 1); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
        g.lineStyle(1.5, stroke, 0.8); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
    };
    draw(THEME.color.panelNum, THEME.color.borderNum);
    const zone = gameScene.add.zone(x, y, w, h).setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(THEME.color.panelHiNum, THEME.color.goldNum));
    zone.on('pointerout', () => draw(THEME.color.panelNum, THEME.color.borderNum));
    if (onClick) zone.on('pointerup', onClick);
    gameScene.cardsSprites.add(g);
    gameScene.cardsSprites.add(zone);
    return g;
}

// Jeden řádek zaškrtávátka rozšíření (zakládání hry i hra botů kreslí totéž).
// `exps` je objekt s příznaky rozšíření, který se rovnou přepíná; `onToggle` slouží
// k doprovodné akci (dotažení artu rozšíření, který se v preloadu nestahuje).
function expansionRow(y, exps, key, label, hint, onToggle) {
    const checked = !!exps[key];
    const box = gameScene.add.rectangle(760, y, 36, 36, checked ? 0x4a3a12 : 0x333333)
        .setOrigin(0.5).setStrokeStyle(2, checked ? 0xe0b23c : 0x666666)
        .setInteractive({ useHandCursor: true });
    const tick = gameScene.add.text(760, y, checked ? '✓' : '',
        { fontSize: '22px', color: '#e0b23c', fontStyle: 'bold' }).setOrigin(0.5);
    const labelTxt = gameScene.add.text(790, y - 10, label,
        { fontSize: '20px', color: checked ? '#e8dcc0' : '#aaa', fontStyle: checked ? 'bold' : 'normal' })
        .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    const hintTxt = gameScene.add.text(790, y + 14, hint, { fontSize: '14px', color: '#666' }).setOrigin(0, 0.5);
    const toggle = () => {
        exps[key] = !exps[key];
        if (exps[key] && onToggle) onToggle();
        renderUI();
    };
    box.on('pointerup', toggle);
    labelTxt.on('pointerup', toggle);
    [box, tick, labelTxt, hintTxt].forEach(o => gameScene.cardsSprites.add(o));
}

function addLogo(y = 240) {
    if (gameScene.textures.exists('logo')) {
        const logo = gameScene.add.image(960, y, 'logo');
        const scale = 500 / 2000;
        logo.setScale(scale);
        gameScene.cardsSprites.add(logo);
        return y + scale * 1090 / 2 + 20;
    }
    const fallback = gameScene.add.text(960, y, 'B A N G !',
        { fontFamily: THEME.fontUI, fontSize: '92px', color: THEME.color.danger, fontStyle: 'bold',
          shadow: { offsetX: 0, offsetY: 3, color: '#000', blur: 6, fill: true } }).setOrigin(0.5);
    gameScene.cardsSprites.add(fallback);
    return y + 70;
}

// ──────────────────────────────────────────────────────────────────────────────────



function renderMenuScreen(screen) {
    if (screen === 'kicked') {
        const msg = App.kickedMsg || 'Game leader ukončil hru.';
        addLogo(180);
        const bg = gameScene.add.rectangle(960, 480, 900, 200, 0x1a0000, 0.95)
            .setOrigin(0.5).setStrokeStyle(2, 0x880000);
        gameScene.cardsSprites.add(bg);
        gameScene.cardsSprites.add(
            gameScene.add.text(960, 450, '⚠️  ' + msg,
                { fontSize: '30px', color: '#ff8888', fontStyle: 'bold',
                  align: 'center', wordWrap: { width: 820 } })
                .setOrigin(0.5)
        );
        const { bg: btnBg } = menuBtn(960, 560, '◀  Zpět do menu', 0x4a1a00, 0x6a2a00, 400, 64);
        btnBg.on('pointerup', () => {
            App.menuScreen = 'main';
            App.kickedMsg = null;
            renderUI();
        });
        return;
    }

    if (screen === 'main') {
        const btmLogo = addLogo(250);

        const bW = 500, bH = 72, gap = 22;
        const startY = btmLogo + 80;
        const btns = [
            { label: '🎮  Připojit se ke hře', screen: 'join_list', color: 0x1a3326, hover: 0x27492f },
            { label: '✚  Vytvořit novou hru',  screen: 'create',    color: 0x33261a, hover: 0x493a27 },
            { label: '👁  Sledovat probíhající hru', screen: 'spectate_list', color: 0x1a2033, hover: 0x273049 },
            { label: '🤖  Sledovat hru botů', screen: 'bot_game', color: 0x2a1a33, hover: 0x3d2749 },
        ];
        const panelH = btns.length * (bH + gap) - gap + 56;
        themePanel(gameScene, 960, startY + (btns.length - 1) * (bH + gap) / 2, bW + 80, panelH);
        btns.forEach((b, i) => {
            const y = startY + i * (bH + gap);
            const { bg } = menuBtn(960, y, b.label, b.color, b.hover, bW, bH);
            bg.on('pointerup', () => {
                if (b.screen === 'join_list') {
                    App.joinListFetched = false;
                }
                App.menuScreen = b.screen;
                renderUI();
            });
        });

        const dbg = gameScene.add.text(1900, 1060, '⚙ DEBUG',
            { fontFamily: THEME.fontUI, fontSize: '16px', color: THEME.color.textMuted, backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 8, y: 5 } })
            .setOrigin(1, 1).setInteractive({ useHandCursor: true });
        dbg.on('pointerup', () => { App.menuScreen = 'debug'; renderUI(); });
        gameScene.cardsSprites.add(dbg);

    } else if (screen === 'create') {
        menuBackBtn(() => { App.menuScreen = 'main'; renderUI(); });

        themeTitle(gameScene, 960, 62, 'Vytvořit novou hru');

        if (!playerName) {
            const hint = gameScene.add.text(960, 160, 'Zadej nejdříve své jméno:',
                { fontSize: '26px', color: '#aaa' }).setOrigin(0.5);
            gameScene.cardsSprites.add(hint);
            showNameInput(name => { playerName = name; renderUI(); });
            return;
        }

        gameScene.add.text && (() => {
            const nameTxt = gameScene.add.text(960, 160, `Hráč: ${playerName}`,
                { fontFamily: THEME.fontUI, fontSize: '22px', color: THEME.color.gold }).setOrigin(0.5);
            gameScene.cardsSprites.add(nameTxt);
        })();

        themeTitle(gameScene, 960, 222, 'Název hry', { fontSize: '28px' });
        if (!App.createGameName && App.createGameNameOwner !== playerName) {
            App.createGameName = `Hra hráče ${playerName}`;
            App.createGameNameOwner = playerName;
        } else if (App.createGameNameOwner !== playerName) {
            App.createGameName = `Hra hráče ${playerName}`;
            App.createGameNameOwner = playerName;
        }
        const existingEl = document.getElementById('create-gamename');
        const currentInputVal = existingEl ? existingEl.value : App.createGameName;
        showTextInput('create-gamename', 760, 258, 400, 50, currentInputVal, v => {
            App.createGameName = v;
            renderUI();
        });

        const nameValid = (App.createGameName || '').trim().length > 0;

        const extLabel = gameScene.add.text(960, 340, 'Rozšíření',
            { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.gold, fontStyle: 'bold' }).setOrigin(0.5);
        gameScene.cardsSprites.add(extLabel);
        {
            if (!App.createOptions.expansions) App.createOptions.expansions = { dodge_city: false, high_noon: false };
            const exps = App.createOptions.expansions;
            expansionRow(384, exps, 'dodge_city', 'Dodge City',
                '(+40 karet a +15 postav; karty se symbolem býka)',
                () => loadExpansionAssets(gameScene, 'dodge_city'));
            expansionRow(440, exps, 'high_noon', 'High Noon',
                '(13 karet událostí; šerif odkrývá jednu na začátku kola)',
                () => loadExpansionAssets(gameScene, 'high_noon'));
        }

        const playerCountLabel = gameScene.add.text(960, 508, 'Počet hráčů',
            { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.gold, fontStyle: 'bold' }).setOrigin(0.5);
        gameScene.cardsSprites.add(playerCountLabel);

        const counts = [4, 5, 6, 7];
        counts.forEach((n, i) => {
            const x = 700 + i * 175;
            const isSelected = App.createPlayerCount === n;
            const bg = gameScene.add.rectangle(x, 578, 140, 70,
                isSelected ? 0x4a3a12 : 0x333333)
                .setOrigin(0.5).setInteractive({ useHandCursor: true });
            const numTxt = gameScene.add.text(x, 578, String(n),
                { fontSize: '38px', color: isSelected ? '#e0b23c' : '#bbb', fontStyle: 'bold' }).setOrigin(0.5);
            bg.on('pointerover', () => { if (!isSelected) bg.setFillStyle(0x444444); });
            bg.on('pointerout', () => { if (!isSelected) bg.setFillStyle(0x333333); });
            bg.on('pointerup', () => { App.createPlayerCount = n; renderUI(); });
            gameScene.cardsSprites.add(bg); gameScene.cardsSprites.add(numTxt);
        });

        const advY = 678;
        const chevron = App.createAdvanced ? '▲' : '▼';
        const advBtn = gameScene.add.text(960, advY, `${chevron}  Pokročilé možnosti  ${chevron}`,
            { fontFamily: THEME.fontUI, fontSize: '20px', color: THEME.color.textMuted, backgroundColor: 'rgba(50,45,55,0.6)', padding: { x: 16, y: 8 } })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        advBtn.on('pointerup', () => { App.createAdvanced = !App.createAdvanced; renderUI(); });
        gameScene.cardsSprites.add(advBtn);

        if (App.createAdvanced) {
            const opts = App.createOptions;
            const checkboxes = [
                { key: 'noAdvancedCards', label: 'Zakázat pokročilé karty', hint: '(bez Duelu, Hokynářství, Indiánů, Vězení, Dynamitu)' },
                { key: 'singleChar',      label: 'Přiřadit postavu náhodně', hint: '(hráči si nevybírají ze dvou postav)' },
                { key: 'rotatingSheriff', label: 'Rotující šerif', hint: '(šerif se po každé hře posouvá doleva)' },
            ];
            checkboxes.forEach((opt, i) => {
                const cy = 728 + i * 70;
                const checked = opts[opt.key];
                const boxBg = gameScene.add.rectangle(700, cy, 36, 36, checked ? 0x4a3a12 : 0x333333)
                    .setOrigin(0.5).setStrokeStyle(2, checked ? 0xe0b23c : 0x666666)
                    .setInteractive({ useHandCursor: true });
                const boxTick = gameScene.add.text(700, cy, checked ? '✓' : '',
                    { fontSize: '22px', color: '#e0b23c', fontStyle: 'bold' }).setOrigin(0.5);
                const labelTxt = gameScene.add.text(730, cy - 10, opt.label,
                    { fontSize: '20px', color: checked ? '#e8dcc0' : '#aaa', fontStyle: checked ? 'bold' : 'normal' })
                    .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
                const hintTxt = gameScene.add.text(730, cy + 14, opt.hint,
                    { fontSize: '14px', color: '#666' }).setOrigin(0, 0.5);
                const toggle = () => {
                    opts[opt.key] = !opts[opt.key];
                    renderUI();
                };
                boxBg.on('pointerup', toggle);
                labelTxt.on('pointerup', toggle);
                gameScene.cardsSprites.add(boxBg);
                gameScene.cardsSprites.add(boxTick);
                gameScene.cardsSprites.add(labelTxt);
                gameScene.cardsSprites.add(hintTxt);
            });
        }

        const createBtnY = App.createAdvanced ? 958 : 768;
        const canCreate = !!App.createPlayerCount && nameValid;
        themeButton(gameScene, 960, createBtnY, 420, 72, 'VYTVOŘIT HRU', {
            fill: canCreate ? THEME.color.successDarkNum : 0x2a2730,
            fillHover: canCreate ? 0x3f7a3f : 0x2a2730,
            stroke: canCreate ? THEME.color.successNum : THEME.color.borderNum,
            textColor: canCreate ? THEME.color.text : THEME.color.textMuted,
            fontSize: '28px',
            onClick: canCreate ? () => {
                const name = (App.createGameName || '').trim();
                if (!name) return;
                socket.emit('create_room', { name, maxPlayers: App.createPlayerCount, playerName, options: App.createOptions || {}, token: bangToken });
                App.createPlayerCount = null;
                App.createGameName = null;
                App.createGameNameOwner = null;
                App.createOptions = { noAdvancedCards: false, singleChar: false, rotatingSheriff: false, expansions: { dodge_city: false, high_noon: false } };
            } : undefined,
        });

        const dbg2 = gameScene.add.text(1900, 1060, '⚙ DEBUG',
            { fontFamily: THEME.fontUI, fontSize: '16px', color: THEME.color.textMuted, backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 8, y: 5 } })
            .setOrigin(1, 1).setInteractive({ useHandCursor: true });
        dbg2.on('pointerup', () => { App.menuScreen = 'debug'; renderUI(); });
        gameScene.cardsSprites.add(dbg2);

    } else if (screen === 'bot_game') {
        menuBackBtn(() => { App.menuScreen = 'main'; renderUI(); });

        themeTitle(gameScene, 960, 80, '🤖 Sledovat hru botů');

        const infoTxt = gameScene.add.text(960, 175,
            'Spustí hru složenou jen z počítačových hráčů, kterou budeš sledovat.',
            { fontFamily: THEME.fontUI, fontSize: '22px', color: THEME.color.textMuted, align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5);
        gameScene.cardsSprites.add(infoTxt);

        const playerCountLabel = gameScene.add.text(960, 300, 'Počet botů',
            { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.gold, fontStyle: 'bold' }).setOrigin(0.5);
        gameScene.cardsSprites.add(playerCountLabel);

        const counts = [4, 5, 6, 7];
        counts.forEach((n, i) => {
            const x = 700 + i * 175;
            const isSelected = App.botGameCount === n;
            const bg = gameScene.add.rectangle(x, 380, 140, 70,
                isSelected ? 0x4a3a12 : 0x333333)
                .setOrigin(0.5).setInteractive({ useHandCursor: true });
            const numTxt = gameScene.add.text(x, 380, String(n),
                { fontSize: '38px', color: isSelected ? '#e0b23c' : '#bbb', fontStyle: 'bold' }).setOrigin(0.5);
            bg.on('pointerover', () => { if (!isSelected) bg.setFillStyle(0x444444); });
            bg.on('pointerout', () => { if (!isSelected) bg.setFillStyle(0x333333); });
            bg.on('pointerup', () => { App.botGameCount = n; renderUI(); });
            gameScene.cardsSprites.add(bg); gameScene.cardsSprites.add(numTxt);
        });

        // Rozšíření – stejné přepínače jako u vytvoření běžné hry.
        const extLabel = gameScene.add.text(960, 462, 'Rozšíření',
            { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.gold, fontStyle: 'bold' }).setOrigin(0.5);
        gameScene.cardsSprites.add(extLabel);
        {
            if (!App.botGameExpansions) App.botGameExpansions = { dodge_city: false, high_noon: false };
            const bexps = App.botGameExpansions;
            expansionRow(510, bexps, 'dodge_city', 'Dodge City',
                '(+40 karet a +15 postav; karty se symbolem býka)',
                () => loadExpansionAssets(gameScene, 'dodge_city'));
            expansionRow(566, bexps, 'high_noon', 'High Noon',
                '(13 karet událostí; šerif odkrývá jednu na začátku kola)',
                () => loadExpansionAssets(gameScene, 'high_noon'));
        }

        themeButton(gameScene, 960, 664, 420, 72, '▶  SPUSTIT A SLEDOVAT', {
            fill: 0x2a1a33, fillHover: 0x3d2749, fontSize: '26px',
            onClick: () => {
                socket.emit('create_bot_game', {
                    count: App.botGameCount || 4,
                    options: { expansions: {
                        dodge_city: !!(App.botGameExpansions && App.botGameExpansions.dodge_city),
                        high_noon: !!(App.botGameExpansions && App.botGameExpansions.high_noon),
                    } },
                });
            },
        });

    } else if (screen === 'join_list') {
        menuBackBtn(() => { App.menuScreen = 'main'; App.joinListFetched = false; renderUI(); });
        themeTitle(gameScene, 960, 80, 'Připojit se ke hře');

        if (!App.joinListFetched) {
            App.joinListFetched = true;
            socket.emit('get_lobby_list');
        }

        const lobbies = App.lobbyList || [];
        if (lobbies.length === 0) {
            const hint = gameScene.add.text(960, 300, 'Žádné hry nečekají na hráče.',
                { fontFamily: THEME.fontUI, fontSize: '28px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(hint);
        } else {
            lobbies.forEach((lobby, i) => {
                const y = 180 + i * 90;
                menuRow(960, y, 900, 74, () => {
                    App.selectedLobby = lobby;
                    App.menuScreen = 'join_room';
                    App.joinListFetched = false;
                    App.joinRoomNamesFetched = false;
                    renderUI();
                });
                const txt = gameScene.add.text(570, y, `${lobby.name}`,
                    { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.text }).setOrigin(0, 0.5);
                const cnt = gameScene.add.text(1350, y,
                    `${lobby.playerCount} / ${lobby.maxPlayers} hráčů`,
                    { fontFamily: THEME.fontUI, fontSize: '22px', color: THEME.color.gold }).setOrigin(1, 0.5);
                gameScene.cardsSprites.add(txt);
                gameScene.cardsSprites.add(cnt);
            });
        }

    } else if (screen === 'join_room') {
        menuBackBtn(() => { App.menuScreen = 'join_list'; App.joinRoomNamesFetched = false; renderUI(); });
        const lobby = App.selectedLobby;
        if (!lobby) { App.menuScreen = 'join_list'; renderUI(); return; }
        if (!App.joinRoomNamesFetched) {
            App.joinRoomNamesFetched = true;
            socket.emit('get_taken_names');
        }

        themeTitle(gameScene, 960, 80, lobby.name);

        const sub = gameScene.add.text(960, 160, `${lobby.playerCount} / ${lobby.maxPlayers} hráčů`,
            { fontFamily: THEME.fontUI, fontSize: '28px', color: THEME.color.textMuted }).setOrigin(0.5);
        gameScene.cardsSprites.add(sub);

        lobby.players.forEach((name, i) => {
            const isMe = name === playerName;
            const bg = gameScene.add.rectangle(960, 240 + i * 68, 720, 58,
                isMe ? 0x4a3a12 : THEME.color.panelNum).setOrigin(0.5)
                .setStrokeStyle(1.5, isMe ? THEME.color.goldNum : THEME.color.borderNum);
            const txt = gameScene.add.text(960, 240 + i * 68, `${name}${isMe ? '  (ty)' : ''}`,
                { fontFamily: THEME.fontUI, fontSize: '26px', color: isMe ? THEME.color.gold : THEME.color.text }).setOrigin(0.5);
            gameScene.cardsSprites.add(bg);
            gameScene.cardsSprites.add(txt);
        });
        for (let i = lobby.players.length; i < lobby.maxPlayers; i++) {
            const emp = gameScene.add.text(960, 240 + i * 68, `${i + 1}. — čeká se…`,
                { fontFamily: THEME.fontUI, fontSize: '24px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(emp);
        }

        const joinY = 240 + lobby.maxPlayers * 68 + 50;

        const nameConflict = playerName && (
            lobby.players.includes(playerName) ||
            (App.allTakenNames || []).includes(playerName)
        );

        if (!playerName) {
            const hint = gameScene.add.text(960, joinY, 'Zadej své jméno:',
                { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(hint);
            showNameInput(name => {
                if (lobby.players.includes(name)) {
                    App.joinError = `Jméno "${name}" je již v místnosti obsazeno.`;
                    playerName = null;
                    _nameInputShown = false;
                    renderUI();
                    return;
                }
                playerName = name; renderUI();
            });
        } else {
            if (App.joinError || nameConflict) {
                const errMsg = nameConflict
                    ? `Jméno "${playerName}" je již v místnosti obsazeno.`
                    : App.joinError;
                const errTxt = gameScene.add.text(960, joinY, errMsg,
                    { fontFamily: THEME.fontUI, fontSize: '24px', color: THEME.color.danger, backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 10, y: 5 } }).setOrigin(0.5);
                gameScene.cardsSprites.add(errTxt);
                App.joinError = null;
            }
            if (!nameConflict) {
                const { bg } = menuBtn(960, joinY + 50, `PŘIPOJIT SE (jako ${playerName})`, 0x1a5a1a, 0x2a7a2a, 480, 68);
                bg.on('pointerup', () => socket.emit('join_room', { roomId: lobby.id, playerName, token: bangToken }));
            } else {
                const { bg } = menuBtn(960, joinY + 50, 'ZMĚNIT JMÉNO', 0x5a1a1a, 0x7a2a2a, 360, 60);
                bg.on('pointerup', () => {
                    playerName = null;
                    _nameInputShown = false;
                    App.joinError = null;
                    renderUI();
                });
            }
        }

    } else if (screen === 'spectate_list') {
        menuBackBtn(() => { App.menuScreen = 'main'; App.spectateListFetched = false; renderUI(); });
        if (!App.spectateListFetched) {
            App.spectateListFetched = true;
            socket.emit('get_game_list');
        }
        themeTitle(gameScene, 960, 80, 'Sledovat probíhající hru', { fontSize: '44px' });

        const games = App.gameList || [];
        if (games.length === 0) {
            const hint = gameScene.add.text(960, 300, 'Žádná hra právě neprobíhá.',
                { fontFamily: THEME.fontUI, fontSize: '28px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(hint);
        } else {
            games.forEach((g, i) => {
                const y = 180 + i * 90;
                menuRow(960, y, 900, 74, () => {
                    socket.emit('spectate', { roomId: g.id });
                    App.ignoreRoomId = null;   // sledujeme znovu (klidně i tu samou hru)
                    App.spectating = true;
                    App.spectateListFetched = false;
                });
                const txt = gameScene.add.text(570, y, g.name,
                    { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.text }).setOrigin(0, 0.5);
                const cnt = gameScene.add.text(1350, y, `${g.playerCount} hráčů`,
                    { fontFamily: THEME.fontUI, fontSize: '22px', color: THEME.color.gold }).setOrigin(1, 0.5);
                gameScene.cardsSprites.add(txt);
                gameScene.cardsSprites.add(cnt);
            });
        }

    } else if (screen === 'debug') {
        menuBackBtn(() => { App.menuScreen = 'main'; renderUI(); });
        themeTitle(gameScene, 960, 60, '⚙ DEBUG', { fontSize: '36px' });

        const roleColors = THEME.role;
        const roleList = ['Sheriff', 'Deputy', 'Outlaw', 'Renegade'];

        themePanel(gameScene, 960, 282, 980, 344);

        const roleLbl = gameScene.add.text(960, 140,
            `Role: ${App.debugRoles.join(', ') || '(náhodné)'}`,
            { fontFamily: THEME.fontUI, fontSize: '20px', color: THEME.color.textMuted }).setOrigin(0.5);
        gameScene.cardsSprites.add(roleLbl);

        roleList.forEach((role, ri) => {
            themeButton(gameScene, 690 + ri * 150, 195, 132, 48, `+ ${role}`, {
                fill: roleColors[role], fillHover: roleColors[role],
                stroke: THEME.color.goldNum, textColor: '#ffffff', fontSize: '16px',
                onClick: () => { App.debugRoles.push(role); renderUI(); },
            });
        });

        themeButton(gameScene, 1245, 195, 110, 48, '✕ Clear', {
            fontSize: '16px', textColor: THEME.color.textMuted,
            onClick: () => { App.debugRoles = []; renderUI(); },
        });

        // Přepínače rozšíření pro debug hru. Art se stahuje líně – při zapnutí ho hned
        // dotáhni, ať se stihne dřív, než hra začne (jinak by karty visely na placeholderu).
        {
            const dcOn = !!App.debugDodgeCity;
            themeButton(gameScene, 960, 252, 480, 46,
                (dcOn ? '☑' : '☐') + '  Rozšíření Dodge City (+40 karet)', {
                ...themeToggleStyle(dcOn), fontSize: '18px',
                onClick: () => {
                    App.debugDodgeCity = !App.debugDodgeCity;
                    if (App.debugDodgeCity) loadExpansionAssets(gameScene, 'dodge_city');
                    renderUI();
                },
            });
            const hnOn = !!App.debugHighNoon;
            themeButton(gameScene, 960, 304, 480, 46,
                (hnOn ? '☑' : '☐') + '  Rozšíření High Noon (13 událostí)', {
                ...themeToggleStyle(hnOn), fontSize: '18px',
                onClick: () => {
                    App.debugHighNoon = !App.debugHighNoon;
                    if (App.debugHighNoon) loadExpansionAssets(gameScene, 'high_noon');
                    renderUI();
                },
            });
        }

        [2, 3, 4, 5].forEach((n, i) => {
            themeButton(gameScene, 720 + i * 160, 372, 132, 58, `▶  ${n}P`, {
                fill: THEME.color.goldDarkNum, fillHover: 0xa8842a,
                stroke: THEME.color.goldNum, textColor: '#ffffff', fontSize: '24px',
                onClick: () => socket.emit('debug_start', { playerCount: n, roles: App.debugRoles || [],
                    dodgeCity: !!App.debugDodgeCity, highNoon: !!App.debugHighNoon }),
            });
        });
    }
}

function showTextInput(id, x, y, w, h, defaultVal, onChange) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('input');
        el.id = id;
        el.type = 'text';
        el.value = defaultVal || '';
        el.style.cssText = `position:fixed;background:#141118;color:#f2ede4;border:1px solid #3a3242;
            border-radius:8px;font-family:'Oswald',sans-serif;font-size:20px;padding:4px 10px;z-index:1000;outline:none;`;
        document.body.appendChild(el);

        el.addEventListener('keydown', (e) => { e.stopPropagation(); });
        el.addEventListener('keyup',   (e) => { e.stopPropagation(); });
        el.addEventListener('keypress',(e) => { e.stopPropagation(); });

        el.addEventListener('input', () => {
            App.createGameName = el.value;
        });
        el.addEventListener('blur', () => {
            App.createGameName = el.value;
            renderUI();
        });

        // Mobil: klepnutí mimo input (na plátno / jinam) schová klávesnici. Bez toho
        // ji nešlo zavřít a překrývala zbytek obrazovky (hráč neviděl na „VYTVOŘIT HRU").
        const dismiss = (e) => {
            if (e.target !== el && document.activeElement === el) el.blur();
        };
        el._dismissHandler = dismiss;
        document.addEventListener('pointerdown', dismiss);
    }
    const canvas = document.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0, width: 1920, height: 1080 };
    const scaleX = rect.width / 1920, scaleY = rect.height / 1080;
    el.style.left   = (rect.left + x * scaleX) + 'px';
    el.style.top    = (rect.top  + y * scaleY) + 'px';
    el.style.width  = (w * scaleX) + 'px';
    el.style.height = (h * scaleY) + 'px';
    // Bez auto-focusu: na mobilu by se jinak při otevření obrazovky sama vyskočila
    // klávesnice do názvu hry. Hráč input klepnutím zaměří sám, až bude chtít psát.
}

function cleanupTextInputs() {
    ['create-gamename'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el._dismissHandler) document.removeEventListener('pointerdown', el._dismissHandler);
            el.remove();
        }
    });
}

function renderLobbyScreen() {
    const room = roomState;
    const isLeader = room.leaderSocketId === socket.id;
    const myP = room.players.find(p => p.socketId === socket.id);

    const { bg: backBtn } = themeButton(gameScene, 130, 56, 190, 54, '◀  Opustit hru', {
        fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
        fontSize: '22px', onClick: () => socket.emit('leave_room'),
    });
    backBtn.setDepth(500);

    themeTitle(gameScene, 960, 80, room.roomName);

    const subT = gameScene.add.text(960, 155,
        `${room.players.length} / ${room.maxPlayers} hráčů`,
        { fontFamily: THEME.fontUI, fontSize: '28px', color: THEME.color.textMuted }).setOrigin(0.5);
    gameScene.cardsSprites.add(subT);

    const canManageBots = isLeader && (room.roomPhase === 'lobby' || room.roomPhase === 'next_lobby');

    room.players.forEach((p, i) => {
        const isMe = p.socketId === socket.id;
        const isLdr = p.socketId === room.leaderSocketId;
        const label = `${isLdr ? '👑 ' : ''}${p.name}${isMe ? '  (ty)' : ''}` +
            (room.roomPhase === 'next_lobby' ?
                (p.wantsNext === true ? '  ✅' : p.wantsNext === false ? '  ❌' : '  …') : '');
        const bg = gameScene.add.rectangle(960, 240 + i * 68, 720, 58,
            isMe ? 0x4a3a12 : THEME.color.panelNum).setOrigin(0.5)
            .setStrokeStyle(1.5, isMe ? THEME.color.goldNum : THEME.color.borderNum);
        const txt = gameScene.add.text(960, 240 + i * 68, label,
            { fontFamily: THEME.fontUI, fontSize: '26px', color: isMe ? THEME.color.gold : THEME.color.text }).setOrigin(0.5);
        gameScene.cardsSprites.add(bg); gameScene.cardsSprites.add(txt);
        // Lídr může bota z lobby odebrat (✕ na pravé straně řádku).
        if (canManageBots && p.isBot) {
            const rm = gameScene.add.text(1290, 240 + i * 68, '✕',
                { fontSize: '24px', color: '#f66', backgroundColor: 'rgba(80,0,0,0.7)', padding: { x: 12, y: 4 } })
                .setOrigin(0.5).setInteractive({ useHandCursor: true });
            rm.on('pointerover', () => rm.setColor('#ff9999'));
            rm.on('pointerout', () => rm.setColor('#f66'));
            rm.on('pointerup', () => socket.emit('remove_bot', { socketId: p.socketId }));
            gameScene.cardsSprites.add(rm);
        }
    });

    for (let i = room.players.length; i < room.maxPlayers; i++) {
        if (canManageBots) {
            // Prázdný slot = klikni pro přidání bota.
            const addBg = gameScene.add.rectangle(960, 240 + i * 68, 720, 58, THEME.color.panelNum)
                .setOrigin(0.5).setStrokeStyle(1.5, THEME.color.goldDarkNum).setInteractive({ useHandCursor: true });
            const addTxt = gameScene.add.text(960, 240 + i * 68, '➕  Přidat bota',
                { fontFamily: THEME.fontUI, fontSize: '24px', color: THEME.color.gold }).setOrigin(0.5);
            addBg.on('pointerover', () => addBg.setFillStyle(THEME.color.panelHiNum));
            addBg.on('pointerout', () => addBg.setFillStyle(THEME.color.panelNum));
            addBg.on('pointerup', () => socket.emit('add_bot'));
            gameScene.cardsSprites.add(addBg); gameScene.cardsSprites.add(addTxt);
        } else {
            const emp = gameScene.add.text(960, 240 + i * 68, `${i + 1}. — čeká se…`,
                { fontFamily: THEME.fontUI, fontSize: '24px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(emp);
        }
    }

    const btY = 240 + room.maxPlayers * 68 + 50;

    const leaderControls = (startEvent) => {
        themeButton(gameScene, 750, btY, 300, 68, 'ZRUŠIT HRU', {
            fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
            fontSize: '22px', onClick: () => socket.emit('cancel_game'),
        });
        const full = room.players.length >= room.maxPlayers;
        themeButton(gameScene, 1180, btY, 380, 68, 'ZAHÁJIT HRU', {
            fill: full ? THEME.color.successDarkNum : 0x2a2730,
            fillHover: full ? 0x3f7a3f : 0x2a2730,
            stroke: full ? THEME.color.successNum : THEME.color.borderNum,
            textColor: full ? THEME.color.text : THEME.color.textMuted,
            fontSize: '26px', onClick: full ? () => socket.emit(startEvent) : undefined,
        });
    };

    if (room.roomPhase === 'lobby') {
        if (isLeader) {
            leaderControls('start_game');
        } else {
            const wt = gameScene.add.text(960, btY, 'Čeká se na Game Leadera…',
                { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(wt);
        }
    } else if (room.roomPhase === 'next_lobby') {
        if (isLeader) {
            leaderControls('check_start_next');
        } else {
            const wt = gameScene.add.text(960, btY, 'Čeká se na doplnění hráčů a Game Leadera…',
                { fontFamily: THEME.fontUI, fontSize: '24px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(wt);
        }
    }
}

function showStats(players) {
    const existing = document.getElementById('stats-overlay');
    if (existing) { existing.remove(); return; }

    const groups = {
        'Zákon (Šerif + Pomocníci)': players.filter(p => p.role === 'Sheriff' || p.role === 'Deputy'),
        'Bandité': players.filter(p => p.role === 'Outlaw'),
        'Odpadlík': players.filter(p => p.role === 'Renegade'),
    };

    const renderPlayer = (p) => {
        const s = p.stats;
        const topCards = Object.entries(s.cardsUsed)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([t, n]) => `${t}×${n}`)
            .join(', ') || '–';
        const accuracy = s.bangsFired > 0 ? Math.round(s.bangsHit / s.bangsFired * 100) : 0;
        return `
        <tr style="border-bottom:1px solid #333">
            <td style="padding:6px 12px;color:#ffcc00">${p.name}</td>
            <td style="padding:6px;color:#aaa">${p.role}</td>
            <td style="padding:6px;color:#f88">${p.character || '–'}</td>
            <td style="padding:6px;text-align:center">${s.bangsFired}</td>
            <td style="padding:6px;text-align:center">${s.bangsHit} (${accuracy}%)</td>
            <td style="padding:6px;text-align:center">${s.damageDealt}</td>
            <td style="padding:6px;text-align:center;color:#f88">${s.damageTaken}</td>
            <td style="padding:6px;text-align:center">${s.cardsDrawn}</td>
            <td style="padding:6px;text-align:center">${s.cardsPlayed}</td>
            <td style="padding:6px;text-align:center">${s.cardsDiscarded}</td>
            <td style="padding:6px;text-align:center">${s.weaponsCycled}</td>
            <td style="padding:6px;font-size:12px;color:#888">${topCards}</td>
        </tr>`;
    };

    const renderGroup = (title, pArr) => {
        if (!pArr.length) return '';
        const gs = pArr.reduce((acc, p) => {
            Object.keys(p.stats).forEach(k => {
                if (typeof p.stats[k] === 'number') acc[k] = (acc[k] || 0) + p.stats[k];
            });
            return acc;
        }, {});
        const acc = gs.bangsFired > 0 ? Math.round(gs.bangsHit / gs.bangsFired * 100) : 0;
        return `
        <tr style="background:#1a1a2e"><td colspan="12" style="padding:8px 12px;color:#4af;font-weight:bold;font-size:15px">
            ${title} – Bang: ${gs.bangsFired}, Zásahy: ${gs.bangsHit} (${acc}%), Damage: ${gs.damageDealt}, Utrpěno: ${gs.damageTaken}
        </td></tr>
        ${pArr.map(renderPlayer).join('')}`;
    };

    const allStats = players.reduce((acc, p) => {
        Object.keys(p.stats).forEach(k => {
            if (typeof p.stats[k] === 'number') acc[k] = (acc[k] || 0) + p.stats[k];
        });
        return acc;
    }, {});
    const totalAcc = allStats.bangsFired > 0 ? Math.round(allStats.bangsHit / allStats.bangsFired * 100) : 0;

    const div = document.createElement('div');
    div.id = 'stats-overlay';
    div.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.92);z-index:1000;overflow-y:auto;padding:20px;box-sizing:border-box;`;
    div.innerHTML = `
        <div style="max-width:1200px;margin:0 auto">
        <h2 style="color:#ffcc00;text-align:center;margin-bottom:8px">📊 STATISTIKY HRY</h2>
        <p style="color:#888;text-align:center;margin-bottom:16px">
            Celkem: Bang!×${allStats.bangsFired}, Zásahy×${allStats.bangsHit} (${totalAcc}%),
            Damage×${allStats.damageDealt}, Líznuto×${allStats.cardsDrawn}, Odhoz×${allStats.cardsDiscarded}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#eee">
            <thead><tr style="background:#2a2a2a;color:#aaa;font-size:12px">
                <th style="padding:8px;text-align:left">Hráč</th>
                <th>Role</th><th>Postava</th>
                <th>Bang!</th><th>Trefil</th>
                <th>Udělil</th><th>Utrpěl</th>
                <th>Líznul</th><th>Zahrál</th><th>Odhodil</th>
                <th>Zbraně</th><th>Top karty</th>
            </tr></thead>
            <tbody>
                ${Object.entries(groups).map(([t, p]) => renderGroup(t, p)).join('')}
            </tbody>
        </table>
        <div style="text-align:center;margin-top:20px">
            <button onclick="document.getElementById('stats-overlay').remove()"
                style="padding:10px 30px;background:#800;color:#fff;border:none;
                border-radius:6px;font-size:18px;cursor:pointer">✕ Zavřít</button>
        </div></div>`;
    document.body.appendChild(div);
}

// ── Výzva k načtení stránky po nasazení nové verze ───────────────────────────
// Volá net/handlers.js, když se po reconnectu změnil otisk kódu na serveru
// (`server_version`, viz server/version.js). Prohlížeč drží starý JS, případná
// rozehraná místnost je po restartu serveru pryč – hráč potřebuje vědět, že to
// není chyba, ale aktualizace, a že stačí načíst stránku znovu.
// Záměrně DOM (ne Phaser): musí být vidět v menu, v lobby i uprostřed hry,
// a přežije to i scénu, která se zrovna nepřekresluje.
function showUpdateBanner() {
    if (document.getElementById('update-banner')) return;   // jednou stačí

    const bar = document.createElement('div');
    bar.id = 'update-banner';
    bar.style.cssText = `position:fixed;top:0;left:0;width:100%;z-index:2000;
        background:rgba(74,58,18,0.97);border-bottom:2px solid #e0b23c;
        box-shadow:0 4px 24px rgba(0,0,0,0.6);font-family:'Oswald',sans-serif;
        display:flex;align-items:center;justify-content:center;gap:18px;
        padding:10px 16px;box-sizing:border-box;`;
    bar.innerHTML = `
        <span style="color:#e0b23c;font-size:20px;font-weight:600">
            🔄 Vyšla nová verze hry – načti stránku znovu (F5).
        </span>
        <button id="update-reload" style="font-family:'Oswald',sans-serif;font-size:18px;font-weight:600;
            padding:6px 22px;background:#e0b23c;color:#2a2210;border:none;border-radius:8px;
            cursor:pointer;">Načíst znovu</button>`;
    document.body.appendChild(bar);
    document.getElementById('update-reload').onclick = () => location.reload();
}
