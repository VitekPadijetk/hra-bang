// Renderery samostatných obrazovek herního klienta (čistě Phaser).
// Vytaženo z renderUI() v game.js. Funkce běží ve sdíleném globálním
// scope (klasické <script>), takže čtou globály game.js (gameScene, state,
// roomState, socket, App, myIndex, …) a volají renderUI()/showStats() za běhu.
// Načítá se v index.html až ZA game.js.

function renderWinnerScreen() {
        const isLeader = roomState?.leaderSocketId === socket.id;
        const myP = roomState?.players?.find(p => p.socketId === socket.id);
        const rPhase = roomState?.roomPhase;
        const isSpectator = myIndex === null;

        themeTitle(gameScene, 960, 120, state.winner, { fontSize: '64px' });

        themeButton(gameScene, 960, 240, 280, 56, '📊 STATISTIKY', {
            fontSize: '24px', onClick: () => showStats(state.players),
        });

        // Divák (vč. sledování hry jen botů) nehlasuje o další hře – jen zpět do menu.
        if (isSpectator) {
            themeButton(gameScene, 960, 380, 340, 64, '◀ ZPĚT DO MENU', {
                fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
                fontSize: '28px', onClick: () => socket.emit('go_to_menu'),
            });
            return;
        }

        if (rPhase === 'finished') {
            const wantY = 330;
            const wantTxt = gameScene.add.text(960, wantY, 'Koho uvidíme v další hře?',
                { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(wantTxt);

            (roomState?.players || []).forEach((p, i) => {
                const icon = p.wantsNext === true ? '✅' : p.wantsNext === false ? '❌' : '…';
                const col  = p.wantsNext === true ? '#5fae5f' : p.wantsNext === false ? '#d64545' : '#9a9088';
                const isMe = p.socketId === socket.id;
                gameScene.cardsSprites.add(
                    gameScene.add.text(960, 380 + i * 48, `${icon}  ${p.name}${isMe ? ' (ty)' : ''}`,
                        { fontSize: '22px', color: col,
                          backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 12, y: 4 } })
                        .setOrigin(0.5)
                );
            });

            const btY = 380 + (roomState?.players?.length || 4) * 48 + 30;

            const timer = roomState?.nextGameTimer;
            if (timer !== null && timer !== undefined) {
                const timerCol = timer <= 5 ? '#ff4444' : timer <= 10 ? '#ffaa44' : '#ffff88';
                const timerTxt = gameScene.add.text(960, btY - 45,
                    `⏱ Zbývá ${timer}s na potvrzení`,
                    { fontSize: '24px', color: timerCol, fontStyle: 'bold',
                      backgroundColor: 'rgba(0,0,0,0.65)', padding: { x: 12, y: 6 } })
                    .setOrigin(0.5);
                gameScene.cardsSprites.add(timerTxt);
                if (timer <= 5) {
                    gameScene.tweens.add({
                        targets: timerTxt, alpha: { from: 1, to: 0.3 },
                        duration: 350, yoyo: true, repeat: -1
                    });
                }
            }

            if (isLeader) {
                const players = roomState?.players || [];
                const allDecided = players.every(p => p.wantsNext !== null && p.wantsNext !== undefined);
                const allIn = players.every(p => p.wantsNext === true);
                const roomFull = players.length >= (roomState?.maxPlayers || 99);
                const canStartDirect = allIn && roomFull;

                themeButton(gameScene, 700, btY, 280, 60, 'ZRUŠIT HRU', {
                    fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
                    fontSize: '22px', onClick: () => socket.emit('cancel_game'),
                });

                if (allDecided) {
                    const label = canStartDirect ? 'ZAHÁJIT HRU ▶' : 'DOPLNIT HRÁČE';
                    themeButton(gameScene, 1220, btY, 300, 60, label, {
                        fill: canStartDirect ? THEME.color.successDarkNum : 0x4a3a12,
                        fillHover: canStartDirect ? 0x3f7a3f : 0x5c4915,
                        stroke: canStartDirect ? THEME.color.successNum : THEME.color.goldNum,
                        fontSize: '22px',
                        onClick: () => canStartDirect
                            ? socket.emit('check_start_next')
                            : socket.emit('open_next_lobby'),
                    });
                } else {
                    gameScene.cardsSprites.add(
                        gameScene.add.text(1220, btY, 'Čekám na rozhodnutí hráčů…',
                            { fontFamily: THEME.fontUI, fontSize: '20px', color: THEME.color.textMuted }).setOrigin(0.5));
                }

            } else {
                if (!myP || myP.wantsNext === null || myP.wantsNext === undefined) {
                    const { bg: confirmB } = themeButton(gameScene, 960, btY, 360, 64, '✅ CHCI HRÁT DÁL', {
                        fill: THEME.color.successDarkNum, fillHover: 0x3f7a3f, stroke: THEME.color.successNum,
                        fontSize: '24px', onClick: () => socket.emit('confirm_next_game'),
                    });
                    gameScene.tweens.add({
                        targets: confirmB,
                        alpha: { from: 1, to: 0.25 },
                        duration: 450,
                        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                    });
                } else if (myP.wantsNext === true) {
                    gameScene.cardsSprites.add(
                        gameScene.add.text(960, btY, '✅ Připojen – čekám na ostatní',
                            { fontFamily: THEME.fontUI, fontSize: '24px', color: THEME.color.success }).setOrigin(0.5));
                }

                themeButton(gameScene, 960, btY + 70, 280, 54, 'OPUSTIT HRU', {
                    fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
                    fontSize: '22px', onClick: () => socket.emit('go_to_menu'),
                });
            }

        } else {
            const wantCount = (roomState?.players || []).filter(p => p.wantsNext === true).length;

            if (isLeader) {
                if (wantCount > 0) {
                    gameScene.cardsSprites.add(
                        gameScene.add.text(960, 320, `${wantCount} hráč(ů) chce hrát dál`,
                            { fontFamily: THEME.fontUI, fontSize: '22px', color: THEME.color.gold }).setOrigin(0.5));
                }

                themeButton(gameScene, 700, 430, 300, 60, '✕ ZRUŠIT HRU', {
                    fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
                    fontSize: '24px', onClick: () => socket.emit('cancel_game'),
                });

                themeButton(gameScene, 1220, 430, 300, 60, '▶ DALŠÍ HRA', {
                    fill: THEME.color.successDarkNum, fillHover: 0x3f7a3f, stroke: THEME.color.successNum,
                    fontSize: '24px', onClick: () => socket.emit('leader_start_next'),
                });

            } else {
                const voted = myP?.wantsNext === true;
                themeButton(gameScene, 700, 380, 340, 60, voted ? '✓ HLASOVÁNO' : '▶ CHCI DALŠÍ HRU', {
                    ...(voted
                        ? { fill: 0x1e3a3a, fillHover: 0x1e3a3a, stroke: THEME.color.goldDarkNum, textColor: THEME.color.success }
                        : { fill: THEME.color.successDarkNum, fillHover: 0x3f7a3f, stroke: THEME.color.successNum }),
                    fontSize: '26px',
                    onClick: voted ? undefined : () => { socket.emit('vote_next_game', true); renderUI(); },
                });

                themeButton(gameScene, 1220, 380, 260, 60, '✕ DO MENU', {
                    fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
                    fontSize: '26px', onClick: () => socket.emit('go_to_menu'),
                });
            }
        }
        return;
}

function renderCharacterSelectScreen() {
        const myPlayer = state.players[myIndex];

        if (myPlayer._awaitingKeepChoice && myPlayer._survivorChar) {
            themeTitle(gameScene, 960, 120, 'Přežil jsi – nová role:', { fontSize: '40px' });

            const roleMap = { 'Sheriff': 'role_000', 'Outlaw': 'role_001', 'Renegade': 'role_002', 'Deputy': 'role_003' };
            const roleTex = roleMap[myPlayer.role] || 'role_001';
            let roleImg = gameScene.add.image(560, 370, roleTex).setScale(0.6);
            gameScene.cardsSprites.add(roleImg);

            const charData = gameScene.cache.json.get('characters_data');
            const charInfo = charData?.find(c => c.name === myPlayer._survivorChar);
            const texKey = charInfo && gameScene.textures.exists('char_' + charInfo.id)
                ? 'char_' + charInfo.id : 'placeholder';
            let charImg = gameScene.add.image(1360, 370, texKey).setScale(0.6);
            gameScene.cardsSprites.add(charImg);

            let keepLabel = gameScene.add.text(960, 620,
                `Chceš si nechat postavu ${myPlayer._survivorChar}?`,
                { fontFamily: THEME.fontUI, fontSize: '28px', color: THEME.color.text }).setOrigin(0.5);
            gameScene.cardsSprites.add(keepLabel);

            themeButton(gameScene, 700, 730, 380, 60, '✓ ANO, NECHÁM SI JI', {
                fill: THEME.color.successDarkNum, fillHover: 0x3f7a3f, stroke: THEME.color.successNum,
                fontSize: '26px', onClick: () => socket.emit('keep_character', true),
            });

            themeButton(gameScene, 1220, 730, 300, 60, '✗ CHCI JINOU', {
                fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
                fontSize: '26px', onClick: () => socket.emit('keep_character', false),
            });
            return;
        }

        const survivorsDeciding = state.players.some(p => p._awaitingKeepChoice);
        if (!myPlayer.character && !myPlayer.charChoices && survivorsDeciding) {
            const names = state.players.filter(p => p._awaitingKeepChoice).map(p => p.name).join(', ');
            let title = gameScene.add.text(960, 380, '⏳ Čekáme na přeživší hráče…',
                { fontFamily: THEME.fontUI, fontSize: '38px', color: THEME.color.textMuted, backgroundColor: 'rgba(0,0,0,0.7)', padding: 18 })
                .setOrigin(0.5);
            gameScene.cardsSprites.add(title);
            let sub = gameScene.add.text(960, 480, `Rozhodují: ${names}`,
                { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(sub);
            return;
        }

        if (state.isDebug) {
            const charData = gameScene.cache.json.get('characters_data');
            const allUnchosenIdxs = state.players.map((p,i) => i).filter(i => !state.players[i].character);

            if (!allUnchosenIdxs.length) return;

            if (App.debugSelectFor === undefined || App.debugSelectFor === null ||
                state.players[App.debugSelectFor]?.character) {
                App.debugSelectFor = allUnchosenIdxs[0];
            }
            const selIdx = App.debugSelectFor;
            const selPlayer = state.players[selIdx];

            state.players.forEach((p, i) => {
                const chosen = !!p.character;
                const isActive = i === selIdx;
                const col = chosen ? '#2a5' : (isActive ? '#44a' : '#333');
                let tab = gameScene.add.text(120 + i * 230, 30, `${p.name}${chosen ? ' ✓' : ''}`,
                    { fontSize: '18px', color: isActive ? '#8cf' : (chosen ? '#4d4' : '#888'),
                      backgroundColor: col, padding: { x: 10, y: 6 } })
                    .setOrigin(0.5, 0).setInteractive({ useHandCursor: !chosen });
                if (!chosen) tab.on('pointerdown', () => { App.debugSelectFor = i; renderUI(); });
                gameScene.cardsSprites.add(tab);
            });

            const roleMap = { 'Sheriff': 'role_000', 'Outlaw': 'role_001', 'Renegade': 'role_002', 'Deputy': 'role_003' };
            const roleTex = roleMap[selPlayer.role];
            let title = gameScene.add.text(960, 55, `Vybíráš pro: ${selPlayer.name} (${roleNameCz(selPlayer.role)})`,
                { fontSize: '26px', color: '#8cf' }).setOrigin(0.5);
            gameScene.cardsSprites.add(title);
            if (roleTex) {
                let rImg = gameScene.add.image(1820, 55, roleTex).setScale(0.3);
                gameScene.cardsSprites.add(rImg);
            }

            const cols = 4, spacing = 240;
            const startX = 960 - ((cols - 1) * spacing) / 2;
            const allChoices = selPlayer.charChoices || ALL_CHARACTERS_CLIENT;
            // Stránkování – se všemi postavami rozšíření (31) se nevejdou na jednu obrazovku.
            const PER_PAGE = 16;   // 4 sloupce × 4 řady
            const totalPages = Math.max(1, Math.ceil(allChoices.length / PER_PAGE));
            if (App.debugCharPage == null) App.debugCharPage = 0;
            App.debugCharPage = Math.max(0, Math.min(App.debugCharPage, totalPages - 1));
            const page = App.debugCharPage;
            const pageChoices = allChoices.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

            pageChoices.forEach((charName, i) => {
                const charInfo = charData?.find(c => c.name === charName);
                const texKey = charInfo && gameScene.textures.exists('char_' + charInfo.id)
                    ? 'char_' + charInfo.id : 'placeholder';
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx = startX + col * spacing;
                const cy = 140 + row * 200;
                let cs = gameScene.add.image(cx, cy, texKey).setScale(0.34)
                    .setInteractive({ useHandCursor: true });
                cs.on('pointerover', () => { cs.setScale(0.39); cs.setTint(0xddffdd); });
                cs.on('pointerout',  () => { cs.setScale(0.34); cs.clearTint(); });
                cs.on('pointerdown', () => {
                    socket.emit('debug_select_char', { playerIdx: selIdx, charName });
                    const nextIdx = allUnchosenIdxs.find(i2 => i2 !== selIdx);
                    App.debugSelectFor = nextIdx ?? null;
                });
                let nameLbl = gameScene.add.text(cx, cy + 92, charName,
                    { fontSize: '13px', color: '#ccc', backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 3, y: 2 } })
                    .setOrigin(0.5);
                gameScene.cardsSprites.add(cs);
                gameScene.cardsSprites.add(nameLbl);
            });

            // Ovládání stránek
            if (totalPages > 1) {
                const py = 1010;
                if (page > 0) {
                    let prev = gameScene.add.text(700, py, '◀ Předchozí',
                        { fontSize: '22px', color: '#8cf', backgroundColor: '#234', padding: { x: 12, y: 8 } })
                        .setOrigin(0.5).setInteractive({ useHandCursor: true });
                    prev.on('pointerdown', () => { App.debugCharPage = page - 1; renderUI(); });
                    gameScene.cardsSprites.add(prev);
                }
                let ind = gameScene.add.text(960, py, `Strana ${page + 1}/${totalPages}`,
                    { fontSize: '22px', color: '#ccc' }).setOrigin(0.5);
                gameScene.cardsSprites.add(ind);
                if (page < totalPages - 1) {
                    let next = gameScene.add.text(1220, py, 'Další ▶',
                        { fontSize: '22px', color: '#8cf', backgroundColor: '#234', padding: { x: 12, y: 8 } })
                        .setOrigin(0.5).setInteractive({ useHandCursor: true });
                    next.on('pointerdown', () => { App.debugCharPage = page + 1; renderUI(); });
                    gameScene.cardsSprites.add(next);
                }
            }
            return;
        }

        if (!myPlayer.character && myPlayer.charChoices) {
            const charData = gameScene.cache.json.get('characters_data');
            themeTitle(gameScene, 960, 80, 'Vyber si postavu', { fontSize: '52px' });

                const roleMap2 = { 'Sheriff': 'role_000', 'Outlaw': 'role_001', 'Renegade': 'role_002', 'Deputy': 'role_003' };
                const myRole = state.players[myIndex]?.role;
                if (myRole && roleMap2[myRole]) {
                    let roleSprite = gameScene.add.image(960, 850, roleMap2[myRole]).setScale(0.5);
                    gameScene.cardsSprites.add(roleSprite);
                }

                myPlayer.charChoices.forEach((charName, idx) => {
                    const charInfo = charData?.find(c => c.name === charName);
                    const texKey = charInfo && gameScene.textures.exists('char_' + charInfo.id)
                        ? 'char_' + charInfo.id : 'placeholder';
                    const cardX = idx === 0 ? 560 : 1360;
                    const cardY = 520;
                    let charSprite = gameScene.add.image(cardX, cardY, texKey)
                        .setScale(0.75).setInteractive({ useHandCursor: true });
                    charSprite.on('pointerover', () => { charSprite.setScale(0.82); charSprite.setTint(0xddffdd); });
                    charSprite.on('pointerout',  () => { charSprite.setScale(0.75); charSprite.clearTint(); });
                    charSprite.on('pointerdown', () => socket.emit('select_character', charName));
                    gameScene.cardsSprites.add(charSprite);
                });

                const waiting = state.players.filter(p => !p.character).length - 1;
                if (waiting > 0) {
                    let waitHint = gameScene.add.text(960, 1010, 'Ostatní hráči také vybírají...',
                        { fontFamily: THEME.fontUI, fontSize: '24px', color: THEME.color.textMuted }).setOrigin(0.5);
                    gameScene.cardsSprites.add(waitHint);
                }

        } else if (!myPlayer.character) {
            let waitText = gameScene.add.text(960, 540, 'Načítání...',
                { fontFamily: THEME.fontUI, fontSize: '30px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(waitText);
        } else {
            let doneText = gameScene.add.text(960, 460, '✓ Postava vybrána!',
                { fontFamily: THEME.fontUI, fontSize: '48px', color: THEME.color.success }).setOrigin(0.5);
            gameScene.cardsSprites.add(doneText);

            const charData = gameScene.cache.json.get('characters_data');
            const charInfo = charData?.find(c => c.name === myPlayer.character);
            const texKey = charInfo && gameScene.textures.exists('char_' + charInfo.id)
                        ? 'char_' + charInfo.id : 'placeholder';

            let myChar = gameScene.add.image(960, 230, texKey).setScale(0.45);
            gameScene.cardsSprites.add(myChar);

            const stillChoosing = state.players.filter(p => !p.character);
            let waitText = gameScene.add.text(960, 620,
                stillChoosing.length > 0
                    ? `Čekám na ${stillChoosing.length} hráče...`
                    : 'Všichni vybrali, hra začíná!',
                { fontFamily: THEME.fontUI, fontSize: '32px', color: THEME.color.textMuted }).setOrigin(0.5);
            gameScene.cardsSprites.add(waitText);
        }
        return;
}

// Dodge City – Vera Custer: na začátku tahu vybírá živou postavu ke zkopírování.
// Vykresluje se přes herní desku (renderGameBoard už proběhl). Klik → emit vera_copy.
function renderVeraCopyOverlay() {
    const pvc = state.pendingVeraCopy;
    if (!pvc) return;
    // Okno s výběrem vidí POUZE Vera – ostatní hráči (ani diváci) nesmí vidět, kterou
    // postavu si zvolila (skrytá informace jako role). Pro ně se overlay nekreslí vůbec.
    // TODO(návrh, zatím NEimplementováno): jak dát ostatním vědět, koho Vera kopíruje –
    //   viz komentář nad funkcí / poznámku pro uživatele.
    if (pvc.playerIdx !== myIndex) return;
    const charData = gameScene.cache.json.get('characters_data');

    // Ztmavené pozadí přes celou desku.
    const backdrop = gameScene.add.rectangle(960, 540, stageW(), stageH(), 0x000000, 0.78)
        .setInteractive();   // spolkne kliknutí mimo portréty
    gameScene.cardsSprites.add(backdrop);

    const iAmVera = true;   // sem se dostane jen Vera (viz early return výše)

    themeTitle(gameScene, 960, 150, 'Vera Custer – vyber postavu ke zkopírování',
        { fontSize: '40px' });

    const choices = pvc.choices || [];
    const n = choices.length;
    const spacing = 340;
    const startX = 960 - (n - 1) * spacing / 2;

    choices.forEach((name, i) => {
        const cx = startX + i * spacing;
        const charInfo = charData?.find(c => c.name === name);
        const texKey = charInfo && gameScene.textures.exists('char_' + charInfo.id)
            ? 'char_' + charInfo.id : 'placeholder';

        const portrait = gameScene.add.image(cx, 520, texKey).setScale(0.55);
        gameScene.cardsSprites.add(portrait);

        const label = gameScene.add.text(cx, 780, name,
            { fontSize: '26px', color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', padding: 8 })
            .setOrigin(0.5);
        gameScene.cardsSprites.add(label);

        if (iAmVera) {
            portrait.setInteractive({ useHandCursor: true });
            const pick = () => socket.emit('vera_copy', { charName: name });
            portrait.on('pointerover', () => portrait.setScale(0.6));
            portrait.on('pointerout', () => portrait.setScale(0.55));
            portrait.on('pointerdown', pick);
        }
    });
}

// ── High Noon (přibalené) – Želízka: volba barvy pro tenhle tah ──────────────
// Vykresluje se přes herní desku (renderGameBoard už proběhl). Vidí ho jen hráč,
// který volí; ostatním stačí čekací štítek (core/pending.js).
function renderHandcuffsOverlay() {
    const ph = state.pendingHandcuffs;
    if (!ph || ph.playerIdx !== myIndex) return;

    const backdrop = gameScene.add.rectangle(960, 540, stageW(), stageH(), 0x000000, 0.78)
        .setInteractive();   // spolkne kliknutí mimo tlačítka
    gameScene.cardsSprites.add(backdrop);

    themeTitle(gameScene, 960, 250, '🔗 Želízka – vyber barvu', { fontSize: '42px' });

    const hint = gameScene.add.text(960, 330,
        'V tomhle tahu smíš zahrát jen karty zvolené barvy.',
        { fontFamily: THEME.fontUI, fontSize: '26px', color: THEME.color.textMuted }).setOrigin(0.5);
    gameScene.cardsSprites.add(hint);

    // Pořadí i symboly odpovídají Suits v logic/entities.js (server porovnává přesně je).
    const SUITS = [
        { s: '♥️', label: 'Srdce',  red: true },
        { s: '♦️', label: 'Káry',   red: true },
        { s: '♣️', label: 'Kříže',  red: false },
        { s: '♠️', label: 'Piky',   red: false },
    ];
    const spacing = 300;
    const startX = 960 - (SUITS.length - 1) * spacing / 2;

    SUITS.forEach((it, i) => {
        const cx = startX + i * spacing;
        // Kolik karet té barvy zrovna držím – ať se hráč rozhoduje podle ruky.
        const mine = (state.players[myIndex]?.hand || [])
            .filter(c => (typeof effSuit === 'function' ? effSuit(state, c) : c.suit) === it.s).length;

        const { bg } = themeButton(gameScene, cx, 560, 230, 230, `${it.s}\n${it.label}`, {
            fill: it.red ? 0x4a1414 : 0x1c1c26, fillHover: it.red ? 0x6b1d1d : 0x2c2c3a,
            stroke: it.red ? 0xd05050 : 0x8888aa,
            textColor: it.red ? '#ff9a9a' : '#dfe0f0', fontSize: '40px',
            onClick: () => {
                if (App.blockInput) return;
                App.blockInput = true;
                socket.emit('handcuffs_suit', { suit: it.s });
                renderUI();
            },
        });
        bg.setDepth(1001);

        const cnt = gameScene.add.text(cx, 700, `${mine}× v ruce`,
            { fontFamily: THEME.fontUI, fontSize: '20px', color: THEME.color.textMuted }).setOrigin(0.5);
        cnt.setDepth(1002);
        gameScene.cardsSprites.add(cnt);
    });
}

// ── High Noon (přibalené) – Nová identita: výměna postavy na začátku tahu ────
// Odložená postava vyletí zpod karty životů doprostřed a překlopí se (animaci spouští
// net/handlers.js `startNewIdentityReveal`). Tohle je STATICKÁ část, která se kreslí,
// až karta doletí (App.niReveal.ready) – zvětšená karta + tlačítka ANO/NE.
function renderNewIdentityOverlay() {
    const pni = state.pendingNewIdentity;
    if (!pni || pni.playerIdx !== myIndex) return;
    if (!App.niReveal || !App.niReveal.ready || App.niReveal.decided) return;

    const charData = gameScene.cache.json.get('characters_data');
    const info = charData?.find(c => c.name === pni.character);
    const texKey = info && gameScene.textures.exists('char_' + info.id)
        ? 'char_' + info.id : 'placeholder';

    const card = gameScene.add.image(960, 420, texKey).setScale(0.80).setDepth(1000);
    gameScene.cardsSprites.add(card);

    const q = gameScene.add.text(960, 760, `Vezmeš si novou identitu (${pni.character}) a klesneš na 2 životy?`,
        { fontFamily: THEME.fontUI, fontSize: '30px', color: THEME.color.text,
          backgroundColor: 'rgba(0,0,0,0.72)', padding: { x: 18, y: 8 } })
        .setOrigin(0.5).setDepth(1001);
    gameScene.cardsSprites.add(q);

    const { bg: yesBg } = themeButton(gameScene, 700, 880, 380, 64, '✓ ANO, VYMĚNIT', {
        fill: THEME.color.successDarkNum, fillHover: 0x3f7a3f, stroke: THEME.color.successNum,
        fontSize: '26px', onClick: () => confirmNewIdentity(true),
    });
    yesBg.setDepth(1001);

    const { bg: noBg } = themeButton(gameScene, 1220, 880, 340, 64, '✗ ZŮSTÁVÁM', {
        fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030, stroke: THEME.color.dangerNum,
        fontSize: '26px', onClick: () => confirmNewIdentity(false),
    });
    noBg.setDepth(1001);
}

function confirmNewIdentity(take) {
    if (!App.niReveal || App.niReveal.decided) return;
    App.niReveal.decided = true;
    App.blockInput = true;
    socket.emit('new_identity_choose', { take: !!take });
    renderUI();   // tlačítka i zvětšená karta zmizí; dojezd dohraje new_identity_result
}
