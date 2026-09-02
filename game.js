const socket = io();

// Klientská diagnostika (chybějící textura, nenačtené pozadí, notify) → server, který ji
// složí do logu hry / server.log (server/gamelog.js). Nahrazuje dřívější console.* na klientu.
// socket.io bufferuje emity poslané před navázáním spojení, takže časné hlášky se neztratí.
function clog(level, msg, data) {
    try { socket.emit('client_log', { level, msg, data }); } catch (_) { /* logování nesmí shodit klienta */ }
}

// Nezachycená výjimka klienta = hra „ztuhne" nebo zůstane hnědá obrazovka (pozadí plátna),
// zatímco sokety běží dál – z logu hry to bez tohohle nešlo poznat. Posíláme jen prvních
// pár hlášek: padající render loop by jinak zaplavil log stovkami stejných řádků za vteřinu.
let _crashLogged = 0;
function _reportCrash(what, err) {
    if (_crashLogged >= 5) return;
    _crashLogged++;
    clog('error', 'PÁD KLIENTA (' + what + '): ' + (err?.message || String(err)),
         { stack: String(err?.stack || '').split('\n').slice(0, 6).join(' | ') });
}
window.addEventListener('error', (e) => _reportCrash('window.onerror', e.error || e));
window.addEventListener('unhandledrejection', (e) => _reportCrash('promise', e.reason));

// Jeviště se přizpůsobí skutečnému poměru stran displeje (core/layout.js). Základ
// zůstává 1920×1080 – jen se dopočítá, kolik design px navíc se vejde do pruhů, které
// při FITu na 16:9 zůstávaly prázdné (telefon na šířku ~19,5:9, okno prohlížeče taky).
// Souřadnice 0…1920 / 0…1080 drží kamera přesně uprostřed (applyStage), takže se
// stávajícím rozložením nehne – přibude jen viditelná plocha po stranách.
App.stage = computeStage(window.innerWidth, window.innerHeight);
App.uiProfile = detectLayoutProfile();
App.layout = resolveLayout(getLayout(App.uiProfile), App.stage);

const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: App.stage.w,
        height: App.stage.h
    },
    backgroundColor: '#4a3018',
    parent: 'game-container',
    // Výchozích 32 paralelních stahování (~165 souborů) na horší lince/mobilu končilo
    // občasným přerušením spojení → chybějící textura a zelený placeholder. Prohlížeč
    // stejně jede max ~6 spojení na doménu, takže nižší strop nic nezpomalí, jen ubere
    // rozpracovaných requestů (a nesoupeří tolik se socketem).
    loader: { maxParallelDownloads: 8 },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);

let state = null;
let selectedState = { cardIndex: null, action: null };
let myIndex = null;
let gameScene = null;
let playerName = null;
let _myNextGameVote = null;
let roomState = null;

// ── Reconnect identita (token + session) ─────────────────────────────────────
// socket.id se po reconnectu/F5 mění, takže nemůže být identitou. bangToken je
// stabilní per-prohlížeč klíč (přežije F5/výpadek) a slouží jako identita pro rejoin.
// bangSession = právě hraná místnost (+ jméno) v localStorage → po načtení stránky
// se umíme sami vrátit do hry (server drží naše místo a dočasně za nás hraje bot).
let bangToken = null;
try {
    bangToken = localStorage.getItem('bangToken');
    if (!bangToken) {
        bangToken = (window.crypto?.randomUUID?.() || ('t' + Date.now() + Math.random().toString(36).slice(2)));
        localStorage.setItem('bangToken', bangToken);
    }
} catch (e) { bangToken = 't' + Date.now() + Math.random().toString(36).slice(2); }

function saveBangSession(roomId) {
    try { localStorage.setItem('bangSession', JSON.stringify({ roomId, name: playerName })); } catch (e) {}
}
function clearBangSession() {
    try { localStorage.removeItem('bangSession'); } catch (e) {}
}
function loadBangSession() {
    try { return JSON.parse(localStorage.getItem('bangSession') || 'null'); } catch (e) { return null; }
}

// Souřadnicová soustava hry (jeviště kolem ní jen přidává plochu, viz core/layout.js).
const GAME_W = 1920, GAME_H = 1080;
const GAME_CENTER_X = GAME_W / 2, GAME_CENTER_Y = GAME_H / 2;

// Poloha hromádek uprostřed stolu. Bere se z profilu rozložení (core/layout.js) –
// stejného, ze kterého kreslí view/board.js. Snímek při startu: profil se v půlce
// hry nepřepíná (dopadlo by to na už letící animace).
const _L0 = currentLayout();
const DECK_X = GAME_CENTER_X - _L0.deckOffX, DECK_Y = _L0.pileY;
const DISCARD_X = GAME_CENTER_X + _L0.deckOffX, DISCARD_Y = _L0.pileY;

// Balíček/odhoz se v board.js (drawDrawPiles) kreslí jako hromádka: každá vrstva je
// o PILE_PX_PER_CARD výš, takže VRCH hromádky leží nad základní pozicí (DECK_Y/DISCARD_Y).
// Karta letící do/z hromádky musí mířit na tento vrch, ne na základnu – jinak u vysoké
// hromádky dosedne viditelně „pod ni" a po překreslení poskočí. Hodnota i vzorec musí
// sedět s board.js (stackTop / topY). App.storePileLiftY zvedá obě hromádky (Hokynářství).
// Rozšíření High Noon / A Fistful of Cards: balíček událostí (rub) a hromádka odkrytých
// karet (líc). Stejné měřítko jako balíček/odhoz; při hokynářství se zvedají spolu s nimi.
// NEJSOU to konstanty jako DECK_X/DISCARD_X: pozice závisí na tom, KTERÁ rozšíření se
// v téhle hře hrají (jedno = klasické místo vpravo od odhozu, obě = nad sebou), a to se
// ustaví až se hrou. Geometrii řeší eventPileSlots/eventPileLift v core/layout.js.
function eventDecksOn(on) {
    if (on) return on;
    const has = (deck, pile) => ((state?.[deck]?.length || 0) + (state?.[pile]?.length || 0)) > 0;
    return { hn: has('eventDeck', 'eventPile'), ff: has('ffDeck', 'ffPile'),
             wws: has('wwsDeck', 'wwsPile') };
}
// which = 'hn' | 'ff' | 'wws' → { deckX, activeX, y } se započítaným zvednutím při
// hokynářství, nebo null, když se ten balíček nehraje. `on` umí přebít intro (má vlastní
// počty karet).
function eventSlot(which, on) {
    const L = currentLayout();
    const d = eventDecksOn(on);
    const slots = eventPileSlots(L, d.hn, d.ff, d.wws);
    const s = slots[which];
    if (!s) return null;
    return { deckX: s.deckX, activeX: s.activeX,
             y: s.y - eventPileLift(L, App.storePileLiftY || 0, slots.stacked) };
}
// Textury balíčku událostí: 'hn_<art>' / 'ff_<art>' / 'wws_<art>',
// rub 'hn_back' / 'ff_back' / 'wws_back'.
function eventTexPrefix(which) { return which === 'ff' ? 'ff_' : which === 'wws' ? 'wws_' : 'hn_'; }

const PILE_PX_PER_CARD = 0.25;
// Velikost karty ležící v balíčku / odhozu. MUSÍ sedět s board.js (scaleDeck) – karta,
// která do hromádky dolétá (nebo z ní startuje), se musí zmenšit přesně na ni, jinak
// „dosedne" menší než hromádka a než ji překreslení srovná, je to vidět (o to víc,
// když sprite na cíli chvíli počká na opožděný broadcast – holdThenFinish).
const PILE_SCALE = _L0.scaleDeck;
function _pileTopY(baseY, count) {
    const lift = App.storePileLiftY || 0;
    return (baseY - lift) - Math.max(0, count - 1) * PILE_PX_PER_CARD / 2;
}
// A Fistful of Cards – Opuštěný důl: „ve fázi lízání se líže z odhozu, odhazuje se
// lícem dolů na dobírací balíček". NENÍ to prohození hromádek – týká se to jen FÁZE 1
// a FÁZE 3 hráče na tahu (FAQ Q03/Q04), takže se pozice hromádek nikdy neprohazují
// a všechno ostatní (zahrané karty, sejmutí, hokynářství, Dostavník) letí jako vždycky.
// Server rozhoduje jednou za tah (`_mineTurn`, viz logic/fistful.js) a posílá to ve stavu.
function mineOn() { return !!state?._mineTurn; }
// Fyzická místa obou hromádek (levá = `deck.cards`, pravá = `deck.discardPile`).
// Vrch se počítá z aktuálního stavu: při líznutí je karta ještě ve stavu, po reshufflu
// tam už leží nová hromádka.
function _leftPilePos()  { return { x: DECK_X,    y: _pileTopY(DECK_Y,    state?.deck?.cards?.length ?? 0) }; }
function _rightPilePos() { return { x: DISCARD_X, y: _pileTopY(DISCARD_Y, state?.deck?.discardPile?.length ?? 0) }; }

// Odkud se líže a kam se odhazuje. Pevné role – Opuštěný důl je neprohazuje (viz mineOn).
function deckTopPos()    { return _leftPilePos(); }
// Karta letící DO odhozu je v okamžiku animace už ve stavu na cílové hromádce (broadcast
// dorazí okolo card_animation), takže count zahrnuje i ji → cíl = její budoucí klidová
// poloha navrchu.
function discardTopPos() { return _rightPilePos(); }
// Opuštěný důl – zdroj FÁZE 1 (líže se z odhozu). Volají jen cesty, které pod dolem
// opravdu berou z odhozu: běžné líznutí, druhá karta Black Jacka a odkryté řady
// Kita Carlsona a Clause.
function minePhase1Pos() { return mineOn() ? _rightPilePos() : _leftPilePos(); }

// ── NOVÉ VYKRESLOVÁNÍ KARET ───────────────────────────────────────────────────
// Karta se při startu složí z art-obrázku druhu (assets/card_art/<art>.webp) + malých
// marek hodnoty/barvy (assets/card_marks/*.webp) do textury card_<id> (buildCardTextures).
// Když art druhu chybí, karta se poskládá z placeholderu + názvu + marek – čitelná karta
// vznikne VŽDY. (Staré hotové karty assets/playing_cards/<id>.png jako fallback padly:
// v repu ani na hostingu nejsou, takže se jen 80× zbytečně stahovalo 404.)
//
// CARD_TEX_W/H = velikost výsledné textury. Teď 325×500 (shodné se současným zobrazením),
// takže se NEMĚNÍ žádný display scale. Art i marky se kreslí ve 2× (návrh pro 4K) a při
// bakování zmenší. Až se udělá globální 4K průchod (všechny assety 2× + render-rezoluce
// plátna), stačí zvednout CARD_TEX_W/H na 650×1000 a půlit display scale u VŠECH sprintů.
const CARD_TEX_W = 325, CARD_TEX_H = 500;
// Umístění marek v prostoru karty (levý dolní roh); marky jsou kresleny pro 650px kartu.
// Sdíleno buildCardTextures (bake) i pulseCheckMark (zvýraznění při snímání).
// valX/valY = kotva (levý dolní roh) čísla hodnoty; barva (suit) sedí napravo od čísla
// na vlastní výšce suitY. Vše v prostoru baked karty (CARD_TEX_W×H).
const MARK_LAYOUT = {
    scale: CARD_TEX_W / 650,
    valX: CARD_TEX_W * 0.05 + 7.5,
    valY: CARD_TEX_H * 0.96 + 12.5,
    suitY: CARD_TEX_H * 0.96 + 8,
    gap: CARD_TEX_W * 0.01,
    // Symbol rozšíření (býk Dodge City) – pravý horní roh, kotva origin(1,0).
    bullX: CARD_TEX_W * 0.97,
    bullY: CARD_TEX_H * 0.02,
    bullScale: CARD_TEX_W / 650
};

const ALL_CHARACTERS_CLIENT = [
    "Bart Cassidy", "Black Jack", "Calamity Janet", "El Gringo",
    "Jesse Jones", "Jourdonnais", "Kit Carlson", "Lucky Duke",
    "Paul Regret", "Pedro Ramirez", "Rose Doolan", "Sid Ketchum",
    "Slab the Killer", "Suzy Lafayette", "Vulture Sam", "Willy the Kid"
];

// --- ZOOM KARET ---
let _hoverTimer = null;
let _zoomObjects = [];
let _zoomTween = null;
let _zoomVisible = false;
let _zoomFadeTimer = null;
// Identita karty, jejíž zoom je naplánovaný/zobrazený (id karty nebo 'char:N'…). Drží
// se NEZÁVISLE na spritu: renderUI stůl překresluje (staré sprity zničí, nové vytvoří),
// takže zoom nesmí viset na konkrétním spritu, ale na tom, CO je pod kurzorem. Díky
// tomu cizí akce (překreslení) neresetuje odpočet ani zvýraznění té samé karty.
let _zoomKey = null;

// --- DOTYKOVÝ REŽIM ---
// Na mobilu Phaserův activePointer po zvednutí prstu ZŮSTANE na místě posledního dotyku
// (a 'pointerover' přijde už při tapnutí), takže pouhé ťuknutí na kartu/postavu nastartovalo
// odpočet a karta se po chvíli sama zvětšila – i když se ničeho nedržím. Na dotyku proto
// zvětšuj jen jako „long press": vyžaduj DRŽENÍ prstu po celou dobu odpočtu i zobrazení.
// Stav dotyku si držíme z nativních listenerů (běží dřív než Phaser zpracuje frontu událostí,
// takže při 'pointerover' už je _touchActive spolehlivě true), ne z pointer.isDown.
let _touchInput = false;    // zařízení se ovládá dotykem (zjištěno prvním dotykem)
let _touchActive = false;   // právě se držím prstem na displeji
const ZOOM_HOLD_MS_MOUSE = 1600;
const ZOOM_HOLD_MS_TOUCH = 600;

if (typeof window !== 'undefined') {
    const opts = { passive: true, capture: true };
    window.addEventListener('touchstart', () => { _touchInput = true; _touchActive = true; }, opts);
    const endTouch = (e) => {
        if (e.touches && e.touches.length > 0) return;   // jiný prst ještě drží
        _touchActive = false;
        _onTouchRelease();
        maybeOfferFullscreen();
    };
    window.addEventListener('touchend', endTouch, opts);
    window.addEventListener('touchcancel', endTouch, opts);
}

// --- MOBILNÍ RÁM ---
// Hrubá detekce malého dotykového displeje pro DOM/rámovou vrstvu (chat, inputy,
// fullscreen). Rozložení herní desky se podle ní zatím NEMĚNÍ – to řeší až profil
// rozložení. Čte se za běhu, takže sedí i po otočení telefonu.
function isSmallTouchUi() {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth || 1920;
    const coarse = !!window.matchMedia?.('(pointer: coarse)')?.matches;
    return w < 820 || (coarse && w < 1100);
}

// Lišta prohlížeče na mobilu ukusuje ~15 % výšky plátna. Fullscreen musí vyjít
// z uživatelského gesta, takže se o něj hlásíme z dotyku. Zámek orientace umí
// Android, iOS ne – proto try/catch a tiché selhání.
function requestGameFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return Promise.resolve(false);
    return Promise.resolve()
        .then(() => req.call(el))
        .then(() => {
            try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch (_) {}
            return true;
        })
        .catch(() => false);
}

// Který profil rozložení zapnout (core/layout.js pickLayoutProfile drží pravidla).
//   ?ui=mobile / ?ui=desktop – testování mobilního režimu na PC
//   localStorage.bangUiMode  – ruční přepínač hráče ('big' | 'normal')
//   jinak podle šířky plátna a toho, jestli se ovládá dotykem
function detectLayoutProfile() {
    let query = null, stored = null;
    try { query = new URLSearchParams(location.search).get('ui'); } catch (_) {}
    try { stored = localStorage.getItem('bangUiMode'); } catch (_) {}
    // Šířka okna, ne plátna: s adaptivním jevištěm plátno šířku okna vyplňuje, a hlavně
    // se tahle funkce volá i při startu, kdy `game` ještě neexistuje.
    const width = window.innerWidth;
    const coarse = !!window.matchMedia?.('(pointer: coarse)')?.matches;
    return pickLayoutProfile({ query, stored, width, coarse });
}

// Ruční přepínač rozložení (obrazovka „PC nebo mobil?" na startu + přepínač v menu).
// Hodnoty v localStorage jsou 'big' (mobilní rozložení) / 'normal' (PC) – čte je
// detectLayoutProfile výš přes pickLayoutProfile.
function uiModeStored() {
    try { return localStorage.getItem('bangUiMode'); } catch (_) { return null; }
}

function setUiMode(mode) {
    try { localStorage.setItem('bangUiMode', mode); } catch (_) {}
    // Profil se mění pod rukama celému klientovi: přepočítej jeviště (a s ním kameru,
    // pozadí i App.layout) a překresli. Intro drží pozice jako hotové souřadnice, takže
    // se musí přepočítat zvlášť – stejně jako po změně velikosti okna.
    applyStage();
    if (typeof _introRelayoutPlaced === 'function') _introRelayoutPlaced();
    if (App.clausPanel) App.clausPanel = clausPanelLayout(App.clausPanel.n);
    if (gameScene) renderUI();
}

// Zeptat se na rozložení hned po startu? (core/layout.js shouldAskLayout drží pravidla.)
function shouldAskLayoutNow() {
    if (typeof window === 'undefined') return false;
    let query = null;
    try { query = new URLSearchParams(location.search).get('ui'); } catch (_) {}
    const coarse = !!window.matchMedia?.('(pointer: coarse)')?.matches;
    return shouldAskLayout({ query, stored: uiModeStored(), width: window.innerWidth, coarse });
}

// Přepočítá jeviště podle aktuální plochy okna a srovná podle něj plátno, kameru
// a pozadí. Kamera se posune o půlku přírůstku, takže původní souřadnice (0…1920 /
// 0…1080) zůstávají uprostřed a rozložení desky se nehne – přírůstek se objeví jako
// souřadnice pod nulou vlevo/nahoře a nad 1920/1080 vpravo/dole.
// Zároveň přepne profil rozložení, když se displej dostal do jiné kategorie.
// Vrací true, když se rozměr jeviště nebo profil opravdu změnil.
function applyStage() {
    const stage = computeStage(window.innerWidth, window.innerHeight);
    const profile = detectLayoutProfile();
    const sizeChanged = !App.stage || App.stage.w !== stage.w || App.stage.h !== stage.h;
    const profileChanged = App.uiProfile !== profile;
    App.stage = stage;
    App.uiProfile = profile;
    // Profil se dopočítá na jeviště – co se lepí na okraj (konec ruky, počet karet
    // v řadě stolu, kotvy soupeřů) se odvodí od skutečné šířky, ne od pevných 1920.
    App.layout = resolveLayout(getLayout(profile), stage);
    // setGameSize je metoda určená přesně pro škálovací režimy typu FIT (na rozdíl od
    // resize, které patří k NONE/RESIZE). Voláme ji jen při skutečné změně.
    if (sizeChanged && game?.scale?.setGameSize) game.scale.setGameSize(stage.w, stage.h);
    if (gameScene) {
        gameScene.cameras?.main?.setScroll(-stage.dx, -stage.dy);
        // Pozadí a závoj vznikají jednou v createScene (renderUI je nemaže), takže se
        // musí přeměřit tady – jinak by po otočení telefonu zůstal po straně holý pruh.
        if (gameScene.bgImage) {
            const cover = stageCoverSize(stage);
            gameScene.bgImage.setDisplaySize(cover.w, cover.h);
        }
        if (gameScene.bgFill) gameScene.bgFill.setSize(stage.w, stage.h);
        if (gameScene.bgScrim) gameScene.bgScrim.setSize(stage.w, stage.h);
    }
    return sizeChanged || profileChanged;
}

// Změna velikosti okna / otočení telefonu / vstup do fullscreenu mění plochu plátna.
// Phaser si plátno přeškáluje sám, ale poměr stran (a tím i jeviště), DOM prvky
// polohované nad plátnem (input názvu hry) a rozhodnutí odvozená od velikosti displeje
// (tlačítko ⛶ FS) drží starý stav, dokud nepřijde překreslení – jinde v klientu žádný
// resize handler není.
if (typeof window !== 'undefined') {
    let _resizeTimer = null;
    const onViewportChange = () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            applyStage();
            // Intro si umístěné karty drží jako hotové souřadnice (placedCards), takže
            // se na nový profil musí přepočítat – ve hře to renderGameBoard dělá samo.
            if (typeof _introRelayoutPlaced === 'function') _introRelayoutPlaced();
            // Clausova odkrytá řada je taky hotová geometrie (měřítko se počítá ze šířky
            // jeviště), takže se po změně velikosti musí přepočítat.
            if (App.clausPanel) App.clausPanel = clausPanelLayout(App.clausPanel.n);
            if (gameScene) renderUI();
        }, 120);
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    document.addEventListener('fullscreenchange', onViewportChange);
}

// Nabídka fullscreenu při prvním tapnutí ve hře – jednou za relaci. Když hráč
// fullscreen opustí, znovu se nevnucuje (má tlačítko ⛶ FS v rohu).
let _fsOffered = false;
try { _fsOffered = sessionStorage.getItem('bangFsOffered') === '1'; } catch (e) {}
function maybeOfferFullscreen() {
    if (_fsOffered || document.fullscreenElement) return;
    if (!isSmallTouchUi()) return;
    if (window.innerHeight > window.innerWidth) return;   // v portrétu běží výzva k otočení
    if (!roomState || !state || state.phase === 'MENU') return;
    _fsOffered = true;
    try { sessionStorage.setItem('bangFsOffered', '1'); } catch (e) {}
    requestGameFullscreen();
}

// Zvednutí prstu = konec long pressu: naplánovaný odpočet zruš, zobrazený zoom zhasni.
function _onTouchRelease() {
    if (!_hoverTimer && !_zoomVisible) return;
    if (_zoomVisible && _zoomObjects[0]?.active) fadeOutZoom(_zoomObjects[0]);
    else stopCardZoom();
}

function cancelZoomTimer() {
    clearTimeout(_hoverTimer);
    _hoverTimer = null;
}

function _cancelFadeTimer() {
    clearTimeout(_zoomFadeTimer);
    _zoomFadeTimer = null;
}

// `key` = identita zvětšované karty (viz startCardZoom). Platná karta High Noon ('hn:…')
// je čistá informace – nikdy se na ni neklikà a nemá cenu ji schovávat, když zrovna
// líznu/se bráním; naopak právě tehdy se hráč potřebuje podívat, co platí.
function _zoomSuppressed(key) {
    if (typeof key === 'string' && key.startsWith('hn:')) return false;
    if (!state) return false;
    // Běžné letící animace zoom NEblokují (zobrazí se nad nimi, depth 900 > 800). Přeruší
    // ho jen míchání/snímání balíčku – to zabírá střed obrazovky, kde zoom vzniká.
    if (App.reshuffleAnimating) return true;
    if (selectedState.cardIndex !== null) return true;
    if (selectedState.sidKetchum !== undefined) return true;
    // Fázové potlačení (líznutí, odhoz, reakce, kontroly…) platí jen když jsem to JÁ, kdo je
    // na tahu / má reagovat. state.phase je GLOBÁLNÍ, takže když soupeř zrovna líže/hraje,
    // nesmí mi to blokovat zoom – v cizím tahu klidně zvětšuj.
    const iAmActing = myIndex != null && (
        state.currentPlayerIndex === myIndex ||
        (state.phase === 'RESPOND' && state.pendingResponse?.targetIdx === myIndex) ||
        (state.phase === 'DYNAMITE_DAMAGE' && state.pendingDynamiteDamage?.playerIdx === myIndex)
    );
    if (iAmActing) {
        const suppressPhases = ['RESPOND','DISCARD','BARREL_DRAW','BART_DRAW',
                                'SUZY_DRAW','EL_GRINGO_STEAL','CHECK_DRAW','KIT_CARLSON','LUCKY_DUKE','DRAW','DYNAMITE_DAMAGE'];
        if (suppressPhases.includes(state.phase)) return true;
    }
    return false;
}

// Pozice kurzoru v herních souřadnicích (bez závislosti na Phaserově input listu, který se
// po vytvoření spritů plní až další snímek → hitTestPointer by hned po renderUI vracel prázdno).
function _pointerPos() {
    const p = gameScene?.input?.activePointer;
    if (!p) return null;
    const x = (p.worldX != null) ? p.worldX : p.x;
    const y = (p.worldY != null) ? p.worldY : p.y;
    return (x == null || y == null) ? null : { x, y };
}

// Je pod kurzorem stále karta (nebo její zoom-obraz) s daným klíčem? Počítá se GEOMETRICKY
// proti spritům ve skupině (ne přes Phaser input list), takže to platí i hned po překreslení.
// Řeší, když karta zmizela (cizí akce), změnila se obrazovka nebo kurzor kartu opustil.
function _pointerOverZoomKey(key) {
    if (key == null || !gameScene) return true;
    const pos = _pointerPos();
    if (!pos) return true;
    const list = gameScene.cardsSprites?.getChildren?.() || [];
    for (const o of list) {
        if (!o || o._zoomKey !== key || !o.visible || !o.getBounds) continue;
        try { if (o.getBounds().contains(pos.x, pos.y)) return true; } catch (e) {}
    }
    const img = _zoomObjects[0];
    if (img?.active && img._zoomKey === key && img.getBounds) {
        try { if (img.getBounds().contains(pos.x, pos.y)) return true; } catch (e) {}
    }
    return false;
}

function startCardZoom(texKey, key = null) {
    if (_zoomSuppressed(key)) return;
    // Dotyk: odpočet startuje jen se drženým prstem (tapnutí zoom nespustí).
    if (_touchInput && !_touchActive) return;
    _cancelFadeTimer();
    // Stejná karta je pořád pod kurzorem (typicky po překreslení stolu cizí akcí): neresetuj
    // odpočet ani nezhasínej – necháme běžet původní časovač/zoom.
    if (key != null && key === _zoomKey && (_zoomVisible || _hoverTimer)) return;
    if (_zoomVisible) return;
    cancelZoomTimer();
    if (!texKey || texKey === 'placeholder') return;
    _zoomKey = key;
    _hoverTimer = setTimeout(() => {
        _hoverTimer = null;   // časovač doběhl – od teď „nečeká"
        if (!gameScene || _zoomSuppressed(key)) return;
        if (_touchInput && !_touchActive) { _zoomKey = null; return; }   // prst mezitím pustil
        if (!_pointerOverZoomKey(key)) { _zoomKey = null; return; }   // karta mezitím zmizela
        stopCardZoom();
        _zoomKey = key;   // stopCardZoom klíč vynuloval, obnov
        const targetScale = Math.min(1700 / 325, 880 / 500) * 0.92;
        const img = gameScene.add.image(960, 540, texKey)
            .setDepth(900).setAlpha(0).setScale(targetScale * 0.85)
            .setInteractive();
        img._zoomKey = key;   // ať guard uzná i kurzor nad samotným zoom-obrazem
        _zoomObjects = [img];
        _zoomVisible = true;
        if (_zoomTween) _zoomTween.stop();
        _zoomTween = gameScene.tweens.add({
            targets: img, alpha: 1, scale: targetScale,
            duration: 500, ease: 'Power2'
        });
        // Odchod z velké karty zhasíná hned – ale jen když kurzor NENÍ zpátky na té malé
        // (ta může ležet přesně pod zoomem; při poll-always se pointerout umí ozvat i tak).
        img.on('pointerout', () => { if (!_pointerOverZoomKey(_zoomKey)) fadeOutZoom(img); });
        img.on('pointerdown', () => fadeOutZoom(img));
    }, _touchInput ? ZOOM_HOLD_MS_TOUCH : ZOOM_HOLD_MS_MOUSE);
}

function scheduleZoomFade() {
    // ZÁMĚRNĚ neruší odpočet ani _zoomKey: 'pointerout' přichází i při běžném překreslení
    // stolu (starý sprite se zničí = out, hned vznikne nový = over) a tvrdý reset by u karty
    // pod nehybným kurzorem shodil zvětšení. Skutečný úklid (kurzor opustil kartu) řeší
    // _tickCardZoom() podle geometrie. Tady jen naplánuj doznění UŽ zobrazeného zoomu –
    // dává to grace okno při přejezdu mezi kartami; návrat na kartu ho v startCardZoom zruší.
    if (!_zoomVisible) return;
    _cancelFadeTimer();
    _zoomFadeTimer = setTimeout(() => {
        _zoomFadeTimer = null;
        // Pořád stojím na místě zvětšované karty (nebo na jejím zoom-obrazu)? Pak zhasínat
        // nesmíme: karta ležící uprostřed stolu se schová POD velkou kartu, čímž dostane
        // 'pointerout' – bez téhle kontroly se zoom zhasl, kurzor byl zase na malé kartě,
        // odpočet se rozjel znovu a celé to blikalo dokola. Skutečný odchod z karty odchytí
        // geometricky _tickCardZoom() v update() smyčce.
        if (_pointerOverZoomKey(_zoomKey)) return;
        if (_zoomVisible && _zoomObjects[0]?.active) {
            fadeOutZoom(_zoomObjects[0]);
        }
    }, 300);
}

function fadeOutZoom(img) {
    _cancelFadeTimer();
    if (!_zoomVisible) { cancelZoomTimer(); _zoomKey = null; return; }
    _zoomVisible = false;
    _zoomKey = null;
    if (!img?.active) { _zoomObjects = []; return; }
    if (_zoomTween) { _zoomTween.stop(); _zoomTween = null; }
    gameScene.tweens.add({
        targets: img, alpha: 0, scale: img.scale * 0.85,
        duration: 300, ease: 'Power2',
        onComplete: () => { if (img?.active) img.destroy(); _zoomObjects = []; }
    });
}

function stopCardZoom() {
    _cancelFadeTimer();
    cancelZoomTimer();
    _zoomVisible = false;
    _zoomKey = null;
    if (_zoomTween) { _zoomTween.stop(); _zoomTween = null; }
    _zoomObjects.forEach(o => { try { if (o?.active) o.destroy(); } catch(e){} });
    _zoomObjects = [];
}

// Backstop volaný z update() smyčky: zoom čeká/svítí, ale karta s jeho klíčem už není pod
// kurzorem (cizí akce ji odstranila / změna obrazovky / kurzor odešel při překreslení, kdy
// Phaser 'pointerout' nepošle) → zoom ukliď. Při běžném hoveru téže karty se nestane nic.
function _tickCardZoom() {
    if (!gameScene) return;
    if (!_zoomVisible && !_hoverTimer) return;
    // Míchání/snímání balíčku zabírá střed – běžící/naplánovaný zoom přeruš.
    if (App.reshuffleAnimating) { stopCardZoom(); return; }
    // Dotyk: bez drženého prstu zoom nežije (pojistka, kdyby nám utekl touchend).
    if (_touchInput && !_touchActive) {
        if (_zoomVisible && _zoomObjects[0]?.active) fadeOutZoom(_zoomObjects[0]);
        else stopCardZoom();
        return;
    }
    if (_zoomKey == null) return;
    if (_pointerOverZoomKey(_zoomKey)) return;
    if (_zoomVisible && _zoomObjects[0]?.active) fadeOutZoom(_zoomObjects[0]);
    else stopCardZoom();
}

// Zvýraznění (tint/scale) i zoom drží pointerover handlery jednotlivých karet. Po překreslení
// stolu vzniknou NOVÉ sprity v základním stavu; Phaserův 'pointerover' na nehybném kurzoru
// dorazí až příští snímek (nové sprity se do input listu zařadí se zpožděním) → karta by na
// okamžik probliknala bez zvýraznění a zoomu by se resetoval odpočet. Proto hned po renderu
// synchronně dohledáme GEOMETRICKY vrchní kartu pod kurzorem a vyvoláme na ní pointerover –
// zvýraznění i zoom se nasadí PŘED vykreslením. Idempotentní s pozdějším Phaserovým pointerover.
function _reapplyPointerHover() {
    if (!gameScene?.cardsSprites) return;
    // Na dotyku žádný „kurzor" neexistuje – pointer visí tam, kde jsem naposledy ťukl.
    // Obnovovat pod ním hover po každém překreslení = falešně zvýrazněná karta bez prstu.
    if (_touchInput && !_touchActive) return;
    const pos = _pointerPos();
    if (!pos) return;
    let top = null;
    gameScene.cardsSprites.getChildren().forEach(o => {
        if (!o || !o.input || !o.visible || !o.getBounds) return;
        if (top && o.depth < top.depth) return;
        let b; try { b = o.getBounds(); } catch (e) { return; }
        if (b.contains(pos.x, pos.y)) top = o;
    });
    if (top) top.emit('pointerover', gameScene.input.activePointer);
}

// --- OPTIMISTICKÉ AKTUALIZACE ---
function optimisticRemoveCard(cardIdx) {
    if (!state || myIndex === null || !state.players?.[myIndex]) return;
    const me = state.players[myIndex];
    if (cardIdx !== null && cardIdx !== undefined && me.hand[cardIdx]) {
        // Zachyť pozici slotu PŘED odebráním – letová animace karty z ní vyjde.
        const card = me.hand[cardIdx];
        if (card?.id != null) {
            App.playedCardFromPos[card.id] = getHandSlotPos(myIndex, cardIdx, me.hand.length);
        }
        me.hand.splice(cardIdx, 1);
    }
}

function optimisticAddCardToHand(playerIdx) {
    if (!state || !state.players?.[playerIdx]) return;
    state.players[playerIdx].hand.push({ id: null, _placeholder: true });
}

// Nejkratší dotočení z `start` na orientaci `end` PŘI symetrii karty o 180°: karta
// vlevo (90°) a vpravo (−90°) vypadá stejně (svisle), takže přechod left→right není
// žádná rotace, ne otočka o 180°. Vrátí cílový úhel ve stejné orientaci jako `end`,
// ale co nejblíž k `start`.
function nearestCardAngle(start, end) {
    let delta = (end - start) % 180;
    if (delta > 90) delta -= 180;
    else if (delta < -90) delta += 180;
    return start + delta;
}

// Jako nearestCardAngle, ale BEZ 180° symetrie: u překlopené (lícem nahoru) karty ZÁLEŽÍ
// na orientaci (0° je čitelné, 180° je vzhůru nohama – nejsou zaměnitelné). Vrátí end
// posunutý o násobek 360° nejblíž ke start (nejkratší otočka se zachováním „čitelnosti").
function nearestAngle360(start, end) {
    let e = end;
    while (e - start > 180)  e -= 360;
    while (e - start < -180) e += 360;
    return e;
}

// opts.startAngle/endAngle: karta se během letu plynule dotočí (např. dynamit
// letící k hráči na boku, jehož karty jsou renderované otočené o 90°). Rotace bere
// nejkratší cestu se symetrií 180° (viz nearestCardAngle). opts.scale nastaví pevnou
// velikost; opts.startScale/endScale ji nechá během letu plynule změnit (zvětšit/zmenšit).
// opts.delay: sprite se VYTVOŘÍ hned (sedí na startu), ale rozletí se až po prodlevě –
// aby karta nezmizela mezi koncem panelu a začátkem svého letu (Lucky NEvybraná).
// Po dosednutí letu podrž sprite na cíli, dokud `holdUntil()` není true (typicky „karta už
// je ve stavu odhozu / na boardu / v ruce"), pak teprve zavolej finish (odkrytí + zánik).
// Bez toho by po doletu – dřív, než dorazí room_update s kartou – problikla stará karta na
// cíli (např. předchozí vrchní karta odhozu). Strop (maxTries × 16 ms, výchozí ~720 ms)
// hlídá, ať sprite nezůstane viset, když predikát nikdy nenastane.
// Strop se ale NEuplatní, dokud animační fronta ještě něco drží (další animace nebo
// dosud neaplikovaný stav) – jinak by dlouhá cinematika zařazená mezi let a jeho stav
// (vězení do odhozu → odkrytí karty High Noon) nechala sprite zaniknout dřív, než stav
// dorazí, a karta by na desce problikla zpátky na původním místě. Tvrdý strop
// (HOLD_HARD_TRIES ≈ 10 s) hlídá, ať sprite nezůstane viset navždy.
const HOLD_HARD_TRIES = 625;
function holdThenFinish(sprite, holdUntil, finish, maxTries = 45) {
    if (!holdUntil || !gameScene) { finish(); return; }
    let tries = 0;
    const queueHolding = () => (typeof animQueueBusy === 'function') && animQueueBusy();
    const poll = () => {
        if (!sprite?.active) return;
        if (holdUntil()) { finish(); return; }
        tries++;
        if (tries > HOLD_HARD_TRIES || (tries > maxTries && !queueHolding())) finish();
        else gameScene.time.delayedCall(16, poll);
    };
    poll();
}

// A Fistful of Cards – Opuštěný důl: odhoz nad limit karet (FÁZE 3) jde LÍCEM DOLŮ na
// dobírací balíček, takže by karta zmizela dřív, než by kdokoli přečetl, co se odhodilo.
// Dosedne proto lícem nahoru, vydrží MINE_ANIM.holdMs a teprve pak se překlápí na rub.
// Používá to jen tenhle odhoz (`hand_to_discard` s `toDeck`) a parkující řada Kita
// u ostatních hráčů; bez `opts.mineLand` je to no-op.
// Časování je v core/fistfulAnim.js, aby o stejnou dobu počkala i fronta stavu (ANIM_MS).
function mineLandThen(sprite, opts, next) {
    if (!opts.mineLand || !sprite?.active || !gameScene) { next(); return; }
    const half = MINE_ANIM.flipMs / 2;
    // Karta, kterou cinematika předtím ukázala zvětšenou uprostřed (sejmutí, Lucky Duke),
    // se držet znovu nemusí – překlopí se rovnou (mineLandHold: 0).
    const hold = opts.mineLandHold ?? MINE_ANIM.holdMs;
    gameScene.time.delayedCall(hold, () => {
        if (!sprite?.active) { next(); return; }
        const sx = sprite.scaleX, sy = sprite.scaleY;
        // Překlopení kolem svislé osy: zúžit na nulu, na hraně vyměnit texturu za rub,
        // roztáhnout zpět (stejná mechanika jako flip v animateCardFlip, jen bez letu).
        gameScene.tweens.add({
            targets: sprite, scaleX: 0, duration: half, ease: 'Linear',
            onComplete: () => {
                if (!sprite?.active) { next(); return; }
                sprite.setTexture('card_back').setScale(0, sy);
                gameScene.tweens.add({ targets: sprite, scaleX: sx, duration: half,
                                       ease: 'Linear', onComplete: next });
            }
        });
    });
}

// Druhá strana téhož: pod dolem se ve fázi 1 LÍŽE z odhozu, kde karta leží LÍCEM NAHORU.
// Znamená to dvě věci, které se bez dolu řešit nemusely, protože z rubového balíčku
// není co vidět:
//   • karta musí z hromádky zmizet HNED se startem letu (jinak tam viditelně leží celý
//     let a zmizí, až dorazí stav) – přesně jako u Pedra Ramireze,
//   • nesmí se překlápět rub→líc: k majiteli letí lícem nahoru rovnou, k soupeři se
//     naopak musí přetočit LÍCEM→RUB (mizí mu do skryté ruky).
// Vrací funkci „karta dosedla", kterou volající zavolá v onComplete; mimo důl no-op.
function mineTakeFromPile(cardId) {
    if (!mineOn() || cardId == null) return () => {};
    App.discardFlyHideIds.add(cardId);
    renderUI();
    return () => { App.discardFlyHideIds.delete(cardId); renderUI(); };
}

function animateCard(fromX, fromY, toX, toY, texKey, duration = 380, onComplete = null, opts = {}) {
    if (!gameScene) return;
    const startAngle = opts.startAngle ?? 0;
    const rawEnd     = opts.endAngle ?? startAngle;
    // opts.exactAngle: bez 180° symetrie – ZÁLEŽÍ na skutečné orientaci cíle (dynamit
    // letící naproti k hornímu hráči se musí viditelně otočit o 180°, ne se „srovnat" na 0).
    const endAngle   = opts.exactAngle ? nearestAngle360(startAngle, rawEnd) : nearestCardAngle(startAngle, rawEnd);
    const startScale = opts.startScale ?? opts.scale ?? 0.28;
    const endScale   = opts.endScale ?? opts.scale ?? startScale;
    const delay      = opts.delay || 0;
    const depth      = opts.depth ?? 800;
    const sprite = gameScene.add.image(fromX, fromY, texKey)
        .setScale(startScale).setAngle(startAngle).setDepth(depth).setAlpha(0.95);
    gameScene.tweens.add({
        targets: sprite, x: toX, y: toY,
        duration, delay, ease: 'Power2',
        onComplete: () => mineLandThen(sprite, opts, () => holdThenFinish(sprite, opts.holdUntil, () => {
            if (sprite?.active) sprite.destroy();
            if (onComplete) onComplete();
        }, opts.holdTries))
    });
    if (endAngle !== startAngle) {
        gameScene.tweens.add({ targets: sprite, angle: endAngle, duration, delay, ease: 'Power2' });
    }
    if (endScale !== startScale) {
        gameScene.tweens.add({ targets: sprite, scaleX: endScale, scaleY: endScale, duration, delay, ease: 'Power2' });
    }
}

// Letící karta, která se během letu OTOČÍ z rubu na líc (reveal) a zároveň
// plynule naroste z velikosti balíčku (startScale) na velikost karty v ruce
// (endScale) – působí, že "dosedne" do ruky. Sdílený primitiv pro líznutí,
// sejmutí, hokynářství i speciální postavy.
function animateCardFlip(fromX, fromY, toX, toY, backTex, faceTex, opts = {}) {
    if (!gameScene) return null;
    const duration   = opts.duration   ?? 400;
    const startScale = opts.startScale ?? 0.28;
    const endScale   = opts.endScale   ?? 0.4;
    const flip       = opts.flip !== false;   // default: otáčet rub→líc
    const reverse    = opts.reverse === true; // true: otáčet líc→rub (karta se schovává)
    const onComplete = opts.onComplete ?? null;
    // Rotace za letu: karta se plynule dotočí z startAngle na endAngle (bok = ±90°,
    // protější = 180°). Nejkratší cestou při 180° symetrii karty (nearestCardAngle).
    const startAngle = opts.startAngle ?? 0;
    // Překlopená karta končí lícem nahoru → orientace musí sedět (0° ≠ 180°), proto
    // 360° varianta (ne nearestCardAngle, která 0° a 180° zaměňuje → karta vzhůru nohama).
    const endAngle   = nearestAngle360(startAngle, opts.endAngle ?? startAngle);
    // Hrana překlopení („prostorově"): podle orientace, ve které karta patří (seat = větší
    // z |start|,|end|). Svislé karty (bok, ±90°) se skládají po DOLNÍ lokální hraně
    // (originY=1), rovné/protější (0°/180°) po HORNÍ (originY=0). Origin dáme na tu hranu,
    // aby se plocha při flipu složila K NÍ (ne ke středu) → hrana zůstane přišpendlená a
    // druhá půlka karty se k ní „sklopí". Po rotaci to na obrazovce vyjde: já=horní hrana,
    // protější=dolní, vlevo=levá, vpravo=pravá.
    const seatAngle = Math.abs(endAngle) >= Math.abs(startAngle) ? endAngle : startAngle;
    const originY = (Math.abs(seatAngle) % 180 === 90) ? 1 : 0;
    // Při flipu startujeme rubem (otočí se na líc); reverse opačně lícem (otočí na rub);
    // bez flipu rovnou lícem (jen růst). midTex = textura po výměně na hraně.
    const startTex = flip ? (reverse ? faceTex : backTex) : faceTex;
    const midTex   = reverse ? backTex : faceTex;
    const sprite = gameScene.add.image(fromX, fromY, startTex)
        .setDepth(800).setAlpha(0.97).setOrigin(0.5, originY);
    const H = sprite.height || 500;
    // Vektor od STŘEDU karty k hraně-originu (v pixelech) pro danou scale a úhel: podél
    // lokální osy Y (+ = dolů), otočený o angle (rotace vektoru (0,v)).
    const hingeVec = (scale, angleDeg) => {
        const v = (originY - 0.5) * H * scale;
        const rad = angleDeg * Math.PI / 180;
        return { x: -Math.sin(rad) * v, y: Math.cos(rad) * v };
    };
    // Dráhu vede HRANA (origin), ať zůstane přišpendlená; střed karty z ní vychází. from/to
    // jsou STŘEDY (kotvy/sloty), převedeme je na polohu hrany. Cíl ukládáme na sprite kvůli
    // re-targetingu za letu (rychlá líznutí – retargetDrawAnims).
    const hf = hingeVec(startScale, startAngle);
    const ht = hingeVec(endScale, endAngle);
    sprite._flipHingeFrom = { x: fromX + hf.x, y: fromY + hf.y };
    sprite._flipHingeTo   = { x: toX + ht.x,   y: toY + ht.y };
    sprite._retargetTo = (cx, cy) => {
        const h = hingeVec(endScale, endAngle);
        sprite._flipHingeTo = { x: cx + h.x, y: cy + h.y };
    };
    // Rovnou nastav počáteční transformaci (stav pro t=0) – jinak by se sprite první frame,
    // než proběhne první onUpdate, vykreslil na (fromX,fromY) v plné velikosti (scale 1) a
    // problikla by „obří karta" u odesílajícího hráče.
    sprite.setPosition(sprite._flipHingeFrom.x, sprite._flipHingeFrom.y).setAngle(startAngle).setScale(startScale);
    let texSwapped = !flip;
    const holder = { t: 0 };
    sprite._drawPosTween = gameScene.tweens.add({
        targets: holder, t: 1, duration, ease: 'Cubic.easeInOut',
        onUpdate: () => {
            if (!sprite.active) return;
            const t = holder.t;
            const px = sprite._flipHingeFrom.x + (sprite._flipHingeTo.x - sprite._flipHingeFrom.x) * t;
            const py = sprite._flipHingeFrom.y + (sprite._flipHingeTo.y - sprite._flipHingeFrom.y) * t;
            const angle = startAngle + (endAngle - startAngle) * t;
            const scale = startScale + (endScale - startScale) * t;
            // Flip po lokální ose Y: scaleY scale→0 v první půlce (karta se postaví na
            // hranu), na hraně výměna textury, 0→scale ve druhé půlce. Bez flipu jen růst.
            let scaleY = scale;
            if (flip) {
                if (t < 0.5) scaleY = scale * (1 - t * 2);
                else { if (!texSwapped) { sprite.setTexture(midTex); texSwapped = true; } scaleY = scale * (t * 2 - 1); }
            }
            sprite.setPosition(px, py);
            sprite.setAngle(angle);
            sprite.setScale(scale, scaleY);
        },
        onComplete: () => mineLandThen(sprite, opts, () => holdThenFinish(sprite, opts.holdUntil, () => {
            // Nejdřív odkryj cílovou kartu (onComplete typicky zruší hide + renderUI), pak
            // teprve zahoď letící sprite – ať pod ním už leží finální karta a neprobliká
            // stará vrchní karta odhozu.
            if (onComplete) onComplete();
            if (sprite?.active) sprite.destroy();
        }, opts.holdTries))
    });
    return sprite;
}

// Sdílená animace karty letící do MOJÍ ruky (líznutí z balíčku/odhozu, krádež z
// ruky soupeře přes Jesse/El Gringo/Paniku, Bart, Suzy, Pedro…). Zacílí na finální
// slot v ruce, kartu po dobu letu v ruce skryje (staging přes App.pendingDrawIds)
// a po dosednutí ji odkryje – proto se rychlá líznutí po sobě objeví postupně.
// opts.faceUp = zdroj je už lícem nahoru (bez otočení). Vrací true, pokud animaci
// převzala (jsem majitel a kartu znám); jinak false → volající animuje rub sám.
// Celkový počet karet, který bude mít ruka po doletu všech aktuálně letících líznutí
// (= karty ve stavu + dosud nedoletělé, které ve stavu ještě nejsou). Stejný počet
// použije board.js pro rozteč, takže cíl animace sedí na finální slot.
function _drawAnimTotal() {
    const myHand = state.players[myIndex].hand;
    const pendingNotInState = [...App.pendingDrawIds].filter(id => !myHand.some(c => c.id === id)).length;
    return myHand.length + pendingNotInState;
}

// Přepočítá cíle všech letících líznutí na aktuální rozteč ruky. Volá se při každém
// novém líznutí – jinak by se první z rychle po sobě líznutých karet animovala na
// rozteč pro menší počet karet a po přerozprostření ruky by „blikla" jinam.
function retargetDrawAnims() {
    if (!App.drawAnims.length || myIndex === null || !state?.players?.[myIndex]) return;
    const total = _drawAnimTotal();
    App.drawAnims.forEach(a => {
        if (!a.sprite?.active || !a.sprite._retargetTo) return;
        // Přednost má PŘESNÁ pozice slotu z board.js (gated karta už je ve stavu);
        // dokud karta ve stavu není (před broadcastem), spočítej odhadem.
        const t = App.gatedSlotPos[a.cardId] || getHandSlotPos(myIndex, a.slotIndex, total);
        if (a._lastX === t.x && a._lastY === t.y) return;   // beze změny → neresetuj tween
        a._lastX = t.x; a._lastY = t.y;
        a.sprite._retargetTo(t.x, t.y);   // přepočte cílovou hranu (onUpdate k ní plynule dotáhne)
    });
}

function animateDrawToMyHand(playerIdx, cardId, fromX, fromY, opts = {}) {
    if (myIndex === null || playerIdx !== myIndex) return false;
    if (cardId === undefined || cardId === null) return false;
    if (!state?.players?.[myIndex]) return false;
    const myHand = state.players[myIndex].hand;
    const ownIdx = myHand.findIndex(c => c.id === cardId);
    const pendingAhead = [...App.pendingDrawIds].filter(id => !myHand.some(c => c.id === id)).length;
    // Slot: pokud karta už ve stavu je (broadcast dorazil dřív než animace), cílíme na
    // její skutečný index; jinak přijde za stávající karty + dosud nedoletělé.
    const slotIndex = ownIdx !== -1 ? ownIdx : myHand.length + pendingAhead;
    App.pendingDrawIds.add(cardId);
    const onDone = () => {
        App.pendingDrawIds.delete(cardId);
        const ai = App.drawAnims.findIndex(a => a.cardId === cardId);
        if (ai !== -1) App.drawAnims.splice(ai, 1);
        if (opts.onComplete) opts.onComplete();
        renderUI();
    };
    const target = getHandSlotPos(myIndex, slotIndex, _drawAnimTotal());
    // Zdroj může být otočený (krádež z ruky/boardu soupeře – Jesse/Panika): startAngle
    // = orientace zdroje, endAngle vždy 0 (moje ruka je dole). Default 0 → líznutí z
    // balíčku/odhozu/hokynářství se nikam netočí (beze změny chování).
    // opts.holdUntil: po doletu drž sprite na cíli (a kartu ve stagingu), dokud predikát
    // neplatí – typicky „zdroj už ve stavu není". Jinak by se zdroj (slot hokynářství)
    // odkryl dřív, než dorazí opožděný broadcast, a karta by tam na chvíli problikla.
    // Default: drž, dokud karta reálně NENÍ v mojí ruce ve stavu. Server posílá stav
    // ~350 ms po líznutí, tedy těsně před dosednutím – jenže při rychlém druhém líznutí
    // se ve frontě (core/animQueue.js) zařadí až ZA animaci té druhé karty. Bez držení
    // by první karta po doletu zanikla a v ruce se objevila o pár set ms později =
    // viditelné probliknutí. Takhle sprite počká přesně na svůj stav a karta pod ním
    // rovnou naskočí. Delší strop (holdTries) pokryje i tři líznutí rychle za sebou.
    const holdUntil = opts.holdUntil ||
        (() => (state?.players?.[myIndex]?.hand || []).some(c => c.id === cardId));
    // endScale = velikost karty v MOJÍ ruce (scaleHand v board.js). Default animateCardFlip
    // je 0.4, takže karta dosedala o kus větší než ostatní v ruce – dokud sprite hned
    // zanikal, nebylo to poznat, s držením do příchodu stavu je to vidět jako „karta se
    // po chvíli zmenší". Na mobilu je ruka větší než stůl (0.46), proto z profilu.
    // startScale default = velikost balíčku: líznutí z balíčku/odhozu tak vzlétne přesně
    // v jeho velikosti a k mojí ruce naroste. Krádež z cizí ruky/stolu si startScale
    // předává sama (velikost karty u okradeného, na mobilu výrazně menší).
    const L = currentLayout();
    const sprite = animateCardFlip(fromX, fromY, target.x, target.y, 'card_back', getCardTex(cardId),
        { flip: !opts.faceUp, duration: opts.duration,
          startScale: opts.startScale ?? L.scaleDeck, endScale: handCardScale(L, 1, true),
          onComplete: onDone, holdUntil, holdTries: 90, startAngle: opts.startAngle ?? 0, endAngle: 0 });
    if (sprite) App.drawAnims.push({ cardId, slotIndex, sprite });
    retargetDrawAnims();   // sjednotí rozteč všech letících karet (vč. už letících)
    renderUI();
    return true;
}

// ── Identita karty vs. její grafika ──────────────────────────────────────────
// Textury `card_<id>` se pečou z cards.json, takže platí jen pro id z dat. Karta
// rozdaná v creative módu má vlastní (unikátní) id – v `texId` si nese to původní.
// Alias id → texId si klient zapíše z každého stavu, aby ho našel i tehdy, když už
// karta ve stavu není (letící sprite se kreslí dřív/později než dorazí stav).
function registerCardTexAliases(st) {
    if (!st?.players) return;
    const note = (c) => { if (c && c.texId !== undefined && c.texId !== null) App.cardTexAlias[c.id] = c.texId; };
    st.players.forEach(p => {
        (p.hand || []).forEach(note);
        (p.board || []).forEach(note);
        note(p.weapon);
    });
    (st.deck?.discardPile || []).forEach(note);
}

// id karty → id, pod kterým je upečená její textura (creative karty mají alias).
function texIdOf(cardId) {
    const alias = App.cardTexAlias[cardId];
    return alias === undefined ? cardId : alias;
}

function getCardTex(cardId) {
    if (cardId === undefined || cardId === null) return 'card_back';
    const id = texIdOf(cardId);
    return gameScene.textures.exists('card_' + id) ? 'card_' + id : 'card_back';
}

// ── MÍCHACÍ CINEMATIKA BALÍČKU ───────────────────────────────────────────────
// Odhoz se posbírá doprostřed stolu, CELÁ hromádka se přetočí lícem dolů, zarovná
// se, prostřídá (riffle – přesně to samé míchání jako v intru, core/shuffleAnim.js)
// a odletí na balíček. SDÍLENÁ: klasické domíchání (reshuffle_anim v net/handlers.js)
// i hokynářství, kde běží ve zvednuté poloze (opts.liftY) – jinak naprosto stejná
// animace i délka, ať to hráč pozná jako totéž míchání.
// opts.liftY     – o kolik pixelů výš (Hokynářství zvedá oba balíčky, App.storePileLiftY).
// opts.depthBase – základ depth letících karet (řadí se i mezi sebou při riffle).
// opts.faceIds   – ID karet odhozu odspodu nahoru; hromádka se pak sbírá LÍCEM NAHORU
//                  a přetočení je vidět. Bez nich se sbírá rubem (hokynářství, kde už
//                  je odhoz ve stavu zamíchaný).
// opts.onDone    – zavolá se po RESHUFFLE_ANIM_MS, kdy je míchání vizuálně hotové.
// Stav (blockInput, skrytí balíčku, ořez odhozu) si řídí volající – tohle je jen animace.
// RESHUFFLE_ANIM_MS MUSÍ sedět se serverem (server/anim.js _reshuffleBlockUntil = 5700),
// který o stejnou dobu odkládá boty i broadcast.
const RESHUFFLE_ANIM_MS = 5700;
// Riffle se musí vejít mezi sběr a odlet na balíček, takže je hutnější než v intru
// (kde má balíček celou scénu pro sebe). Délka vyjde skoro stejná pro 5 i 80 karet.
const RESHUFFLE_RIFFLE = { riffleMs: 1700, perCardMin: 12, perCardMax: 400 };
function playReshuffleCinematic(cardCount, opts = {}) {
    const finish = () => { if (opts.onDone) opts.onDone(); };
    if (!gameScene) { setTimeout(finish, 0); return; }
    const lift = opts.liftY || 0;
    const D0 = opts.depthBase ?? 5;

    const cx = GAME_W / 2, cy = GAME_H / 2 - 60 - lift;
    const srcX = DISCARD_X, srcY = DISCARD_Y - lift;
    const dstX = DECK_X,    dstY = DECK_Y - lift;
    const N = shuffleLayers(cardCount);
    const SCALE = PILE_SCALE;
    const CARD_W = 325 * SCALE;
    const px = PILE_PX_PER_CARD;
    const faceIds = opts.faceIds || null;

    // Časová osa: sběr → přetočení → zarovnání → riffle → odlet na balíček.
    const GATHER_MS  = 1150, GATHER_FLY = 420;
    const FLIP_AT    = 1330, FLIP_MS = 200;      // 200 dovnitř + 200 ven
    const SQUARE_AT  = 1850, SQUARE_MS = 300;
    const RIFFLE_AT  = 2200;
    const FLY_MS     = 560;
    const riffleSettle = shuffleSettleMs(N, RESHUFFLE_RIFFLE);
    const flyAt = Math.min(RIFFLE_AT + riffleSettle + 120, RESHUFFLE_ANIM_MS - FLY_MS - 60);

    // Sběr: karty leží na odhozu jako hromádka a po jedné se přenesou doprostřed.
    // Dosednou lehce rozházené – teprve zarovnání z nich udělá srovnaný balíček.
    const srcTop = srcY - (N - 1) * px / 2;
    const gatherTop = cy - (N - 1) * px / 2;
    const sprites = [];
    const gatherStagger = N > 1 ? (GATHER_MS - GATHER_FLY) / (N - 1) : 0;
    for (let i = 0; i < N; i++) {
        // i = 0 je spodní karta hromádky (leží na odhozu nejníž a bere se první).
        const tex = faceIds ? getCardTex(faceIds[i]) : 'card_back';
        const sp = gameScene.add.image(srcX, srcTop + (N - 1 - i) * px, tex)
            .setScale(SCALE).setDepth(D0 + i);
        sprites.push(sp);
        gameScene.tweens.add({
            targets: sp,
            x: cx + (Math.random() - 0.5) * 14,
            y: gatherTop + (N - 1 - i) * px + (Math.random() - 0.5) * 8,
            angle: (Math.random() - 0.5) * 7,
            duration: GATHER_FLY,
            delay: i * gatherStagger,
            ease: 'Power2',
        });
    }

    // Přetočení CELÉ hromádky lícem dolů – všechny karty naráz (je to jeden blok).
    gameScene.time.delayedCall(FLIP_AT, () => {
        sprites.forEach(sp => {
            if (!sp.active) return;
            gameScene.tweens.add({
                targets: sp, scaleX: 0, duration: FLIP_MS, ease: 'Sine.easeIn',
                onComplete: () => {
                    if (!sp.active) return;
                    sp.setTexture('card_back');
                    gameScene.tweens.add({ targets: sp, scaleX: SCALE, duration: FLIP_MS, ease: 'Sine.easeOut' });
                }
            });
        });
    });

    // Zarovnání: z rozházené hromádky srovnaný balíček (přesně tak, jak pak vyletí
    // půlka do riffle).
    gameScene.time.delayedCall(SQUARE_AT, () => {
        sprites.forEach((sp, i) => {
            if (!sp.active) return;
            gameScene.tweens.add({
                targets: sp, x: cx, y: gatherTop + (N - 1 - i) * px, angle: 0,
                duration: SQUARE_MS, ease: 'Cubic.easeOut',
            });
        });
    });

    // Riffle – stejná choreografie jako v intru: horní půlka se jako celek oddělí
    // doprava, spodní doleva, pak karty střídavě padají doprostřed a hromádka se
    // skládá odspodu nahoru. Index 0 = SPODNÍ karta, proto se pořadí obrací.
    const top = (k) => sprites[N - 1 - k];        // k = 0 je vrchní karta hromádky
    const half = shuffleCutHalf(N);
    const cutX = CARD_W * 0.6;
    const topCenter = gatherTop + (half - 1) * px / 2;
    const botCenter = gatherTop + (half + N - 1) * px / 2;

    gameScene.time.delayedCall(RIFFLE_AT + SHUFFLE_ANIM.preMs, () => {
        for (let k = 0; k < N; k++) {
            const sp = top(k);
            if (!sp?.active) continue;
            const isTop = k < half;
            gameScene.tweens.add({
                targets:  sp,
                x:     cx + (isTop ? cutX : -cutX),
                y:     sp.y + (isTop ? cy - topCenter : cy - botCenter),
                angle: isTop ? 6 : -6,
                duration: SHUFFLE_ANIM.cutMs, ease: 'Cubic.easeInOut',
            });
        }
    });

    const interleaved = shuffleRiffleOrder(N);
    // Kam která karta v hotové hromádce dosedla – podle toho pak odlétá na balíček.
    // Bez toho by se cestou přeskládala zpátky do původního pořadí (a bylo by to vidět).
    const finalSlot = new Array(N);
    const perCard = shufflePerCard(N, RESHUFFLE_RIFFLE);
    const riffleStart = RIFFLE_AT + SHUFFLE_ANIM.preMs + SHUFFLE_ANIM.cutMs + SHUFFLE_ANIM.gapMs;
    interleaved.forEach((k, j) => {
        const sp = top(k);
        const slot = N - 1 - j;    // 0 = vrch hotové hromádky
        finalSlot[N - 1 - k] = slot;
        gameScene.time.delayedCall(riffleStart + j * perCard, () => {
            if (!sp?.active) return;
            sp.setDepth(D0 + N + j);   // za letu nad hromádkou, po dosednutí do vrstev
            gameScene.tweens.add({
                targets: sp, x: cx, y: gatherTop + slot * px, angle: 0,
                duration: SHUFFLE_ANIM.cardMs, ease: 'Cubic.easeIn',
                onComplete: () => { if (sp.active) sp.setDepth(D0 + j); },
            });
        });
    });

    // Hotový balíček odletí na svou herní pozici jako celek – každá karta si drží
    // vrstvu, ve které po zamíchání skončila.
    gameScene.time.delayedCall(flyAt, () => {
        const dstTop = dstY - (N - 1) * px / 2;
        sprites.forEach((sp, i) => {
            if (!sp.active) return;
            // Na balíčku PARKUJE až do konce animace (uklidí ho závěrečný delayedCall) –
            // deska ho po tu dobu ještě nekreslí (App.reshuffleAnimating), takže by po
            // zničení zůstalo místo balíčku prázdno.
            gameScene.tweens.add({
                targets: sp, x: dstX, y: dstTop + (finalSlot[i] ?? (N - 1 - i)) * px,
                duration: FLY_MS, ease: 'Power2.easeInOut',
            });
        });
    });

    gameScene.time.delayedCall(RESHUFFLE_ANIM_MS, () => {
        sprites.forEach(sp => { if (sp?.active) sp.destroy(); });
        finish();
    });
}

// ── HOKYNÁŘSTVÍ: cinematika na stole ──────────────────────────────────────────
// Balíčky vyjedou nahoru (storeLift), pod ně se rozdají karty (flip rub→líc),
// případně se v horní poloze zamíchá. Pozice slotů řeší getStoreSlotPos (positions.js),
// časování musí sedět s bot settle (server/bots.js storeOpenDelayMs, server/anim.js
// storeCinematicMs).
// O kolik celý blok (balíčky + řada) povyskočí, do volného místa nad středem. Z profilu:
// na mobilu je můj stůl vejš, takže se řada hokynářství musí vejít do menší mezery.
function storeLift() { return currentLayout().storeLift; }   // 120
const STORE_DEAL_STAGGER = 190;
const STORE_DEAL_MS = 440;

// Plynulé zvednutí/spuštění obou balíčků. Tween na pomocném objektu + renderUI
// (board.js kreslí balíčky podle App.storePileLiftY).
function animatePileLift(target, onDone) {
    if (!gameScene) { App.storePileLiftY = target; if (onDone) onDone(); return; }
    const holder = { v: App.storePileLiftY || 0 };
    gameScene.tweens.add({
        targets: holder, v: target, duration: 320, ease: 'Cubic.easeInOut',
        onUpdate: () => { App.storePileLiftY = holder.v; renderUI(); },
        onComplete: () => { App.storePileLiftY = target; renderUI(); if (onDone) onDone(); }
    });
}

// Rozdá storeCards[from..to) z balíčku do řady (flip rub→líc, stagger). Po doletu
// poslední zavolá onDone. Sloty jsou gated (App.storeDealIds), board.js je ukáže až po doletu.
// S každou odlétající kartou ubere jednu vrstvu z kresleného balíčku (App.dealDeckCount),
// takže hromádka viditelně mizí a s poslední kartou je pryč (viz startStoreCinematic).
function dealStoreCards(cards, from, to, onDone) {
    const indices = [];
    for (let i = from; i < to; i++) if (cards[i]) indices.push(i);
    if (!indices.length) { if (onDone) onDone(); return; }
    const count = cards.length;
    // Hokynářství rozdává z dobíracího balíčku i pod Opuštěným dolem (FAQ Q04).
    const deckX = deckTopPos().x;
    // Základna hromádky, ze které se rozdává. Vrch si dopočítáme až v okamžiku letu,
    // a to z počtu, který se PRÁVĚ kreslí (App.dealDeckCount) – ne ze stavu, který už
    // rozdané karty nemá. Zvednutí balíčků (storeLift) je uvnitř _pileTopY, takže se
    // odečítat podruhé NESMÍ: karta by pak vzlétala o celý zdvih nad hromádkou.
    const _baseY = DECK_Y;
    const _faceUp = false;
    indices.forEach((i, n) => {
        setTimeout(() => {
            const card = cards[i];
            if (!card) return;
            const deckY = _pileTopY(_baseY, App.dealDeckCount ?? (state?.deck?.cards?.length ?? 0));
            if (App.dealDeckCount !== null) App.dealDeckCount = Math.max(0, App.dealDeckCount - 1);
            if (!gameScene) { App.storeDealIds.delete(card.id); return; }
            const slot = getStoreSlotPos(i, count, App.storePileLiftY || 0);
            animateCardFlip(deckX, deckY, slot.x, slot.y, 'card_back', getCardTex(card.id),
                { flip: !_faceUp, startScale: currentLayout().scaleDeck, endScale: 0.3, duration: STORE_DEAL_MS,
                  onComplete: () => { App.storeDealIds.delete(card.id); renderUI(); } });
            renderUI();   // hromádka o kartu nižší (s poslední rozdanou kartou zmizí úplně)
        }, n * STORE_DEAL_STAGGER);
    });
    const total = (indices.length - 1) * STORE_DEAL_STAGGER + STORE_DEAL_MS + 40;
    setTimeout(() => { if (onDone) onDone(); }, total);
}

// Míchání v hokynářství = TOTÁŽ cinematika jako klasické domíchání balíčku, jen
// posunutá nahoru do zvednuté polohy balíčků. Stejná délka → hra na ni čeká stejně
// (App.storeShuffleEndAt drží konec, balíček je po tu dobu schovaný jako u klasického).
function playStoreShuffle(count, onDone) {
    App.storeShuffleEndAt = Date.now() + RESHUFFLE_ANIM_MS;
    App.storeShuffling = true;
    renderUI();
    playReshuffleCinematic(count, {
        liftY: App.storePileLiftY || 0,
        depthBase: 60,   // nad zvednutými balíčky i řadou hokynářství (58), pod letícími kartami (800)
        onDone: () => {
            App.storeShuffling = false;
            App.storeShuffleEndAt = 0;
            renderUI();
            if (onDone) onDone();
        }
    });
}

// Vstup do fáze STORE: zvednout balíčky, rozdat (případně s mícháním dle režimu).
function startStoreCinematic() {
    if (!state) return;
    const cards = state.storeCards || [];
    const sa = state.storeAnim || { mode: 'none', dealtBefore: cards.length, total: cards.length };
    App.storeShuffleEndAt = 0;
    App.storeDealIds = new Set(cards.filter(c => c).map(c => c.id));   // vše gated → objeví se po doletu
    App.storeLocked = (sa.mode === 'blocking');
    const N = cards.length;
    const k = Math.min(sa.dealtBefore ?? N, N);
    // Kolik karet měl balíček PŘED rozdáním. Stav, který s fází STORE dorazil, už má
    // balíček případně zamíchaný (velký) – kdybychom kreslili jeho počet, hromádka by
    // v okamžiku zvednutí skočila ze čtyř karet na sto. Kreslíme proto vlastní počet,
    // který ubývá s každou rozdanou kartou (dealStoreCards).
    const origCount = sa.origCount ?? (sa.mode === 'none'
        ? (state.deck?.cards?.length ?? 0) + N
        : (sa.mode === 'proactive' ? N : k));
    App.dealDeckCount = origCount;
    renderUI();
    const shufN = sa.shuffleCount || 20;
    animatePileLift(storeLift(), () => {
        if (sa.mode === 'blocking') {
            // Nedostatek karet: rozdej zbylé (zamčené) → zamíchej → dorozdej → odemkni.
            dealStoreCards(cards, 0, k, () => {
                playStoreShuffle(shufN, () => {
                    // Po zamíchání je na stole nový (velký) balíček; zbylé karty se z něj
                    // teprve rozdají, takže do doletu poslední drž počet o ně vyšší.
                    App.dealDeckCount = (state?.deck?.cards?.length ?? 0) + (N - k);
                    dealStoreCards(cards, k, N, () => {
                        App.dealDeckCount = null; App.storeLocked = false; renderUI();
                    });
                });
            });
        } else if (sa.mode === 'proactive') {
            // Přesně tolik: rozdej vše, pak míchej paralelně (výběr už běží).
            dealStoreCards(cards, 0, N, () => { playStoreShuffle(shufN, () => { App.dealDeckCount = null; renderUI(); }); });
        } else {
            dealStoreCards(cards, 0, N, () => { App.dealDeckCount = null; renderUI(); });
        }
    });
}

// Konec hokynářství (STORE → PLAY): balíčky sjedou zpět; u proaktivního míchání se na
// jeho dokončení počká. Během čekání drž UI zamčené (App.storeShuffleBlock) – hráči si
// směli brát i během míchání, ale pokud byli rychlejší, hra počká, stejně jako u
// klasického proaktivního domíchání. Boty drží server (room._reshuffleBlockUntil).
function endStoreCinematic() {
    App.storeLocked = false;
    App.dealDeckCount = null;
    App.storeDealIds = new Set();
    const wait = Math.max(0, (App.storeShuffleEndAt || 0) - Date.now());
    if (wait > 0) {
        App.storeShuffleBlock = true;
        App.blockInput = true;
        renderUI();
    }
    setTimeout(() => {
        if (App.storeShuffleBlock) {
            App.storeShuffleBlock = false;
            App.blockInput = false;
        }
        App.storeShuffling = false;
        App.storeShuffleEndAt = 0;
        animatePileLift(0);
    }, wait);
}

// ── SEJMUTÍ / REVEAL ─────────────────────────────────────────────────────────
// Délka revealu sejmutí: 450 (balíček→střed: otočení+zvětšení) + 3000 (drží
// odhalená) + 400 (zmenší se a odletí do odhozu). Klient i bot (scheduleBotTick)
// musí mít stejné tempo, ať odhoz/ruka naskočí přesně po doletu.
const CHECK_REVEAL_MS = 3850;
const REVEAL_CX = 960, REVEAL_CY = 470, REVEAL_BIG = 0.7;
// Odhalená karta letí a drží uprostřed NAD vším (820 > letové karty 800). Jakmile ale
// dosedne do odhozu, je to už jen „vrchní karta hromádky" a musí být POD kartami, které
// přiletí po ní: výsledek sejmutí (vězení do odhozu, dynamit) se posílá hned po revealu
// a s depth 800 se pod ni zasouval – objevil se navrchu až ve chvíli, kdy reveal sprite
// zanikl (čeká na broadcast). Pod hromádkou (depth 0) přitom zůstat nesmí.
const REVEAL_PILE_DEPTH = 700;

// Záplata, která ZAKRYJE zapečené (malé) marky v levém dolním rohu karty. Bere výřez
// z PŮVODNÍHO artu druhu – tam marky ještě nejsou – posazený přesně na místo karty a ve
// stejném měřítku, takže je od okolí k nerozeznání. Bez ní pod pulzující zvětšenou markou
// prosvítá ta malá vytištěná (marky jsou průhledné glyfy, zvětšená ta malá nepřekryje)
// a obojí se přes sebe rozmaže.
// `box` = obdélník marek v prostoru karty (CARD_TEX_W×H), viz pulseCheckMark.
function _markCoverPatch(x, y, scale, card, box) {
    const aKey = artKey(card);
    const srcKey = (aKey && gameScene.textures.exists(aKey)) ? aKey
                 : (gameScene.textures.exists('placeholder') ? 'placeholder' : null);
    if (!srcKey) return null;
    const img = gameScene.add.image(x, y, srcKey).setDepth(829);
    const sw = img.width, sh = img.height;   // rozměr ZDROJOVÉ textury (art je ve 2×)
    if (!sw || !sh) { img.destroy(); return null; }
    img.setDisplaySize(CARD_TEX_W * scale, CARD_TEX_H * scale);
    // Výřez se zadává v pixelech zdrojové textury (Phaser ho pak škáluje s objektem).
    const pad = 6;                                   // v prostoru karty
    const fx = sw / CARD_TEX_W, fy = sh / CARD_TEX_H;
    const cx = Math.max(0, (box.x0 - pad) * fx);
    const cy = Math.max(0, (box.y0 - pad) * fy);
    img.setCrop(cx, cy,
        Math.min(sw - cx, (box.x1 - box.x0 + pad * 2) * fx),
        Math.min(sh - cy, (box.y1 - box.y0 + pad * 2) * fy));
    img._isMarkCover = true;
    return img;
}

// Zvýraznění zkoumané hodnoty/barvy při snímání: přes odkrytou kartu se překryjí marky
// hodnoty+barvy (stejné textury jako zapečené) a pulzují (zvětší se a zpět). Vrací
// { marks, tween } pro úklid, nebo null když karta nemá nové marky (fallback druh) –
// tehdy je hodnota zapečená ve staré kartě a pulz nejde udělat.
// marks[0] je (když se povedla) záplata přes zapečené marky – vidět je tak jen ta
// pulzující; po skončení pulzu (stopPulse) záplata mizí s ní a zůstane zase jen malá.
// `opts.printedSuit` = ukaž VYTIŠTĚNOU barvu, ne tu platnou. Potřebuje to jediné místo
// v pravidlech, které se řídí vytištěnou barvou – Peyote (A Fistful of Cards): tipuje se
// proti tomu, co je na kartě natištěné, takže by pod Požehnáním/Prokletím (High Noon)
// odkrytá karta ukazovala jinou barvu, než na kterou se právě sázelo. Přebarvení pro ni
// začne platit až ve chvíli, kdy dosedne do ruky (tam už je marka zapečená).
function pulseCheckMark(x, y, scale, card, opts = {}) {
    if (!gameScene) return null;
    const vKey = valueMarkKey(card);
    const sKey = opts.printedSuit ? suitMarkKey(card) : effSuitMarkKey(card);
    if (!vKey || !sKey || !gameScene.textures.exists(vKey) || !gameScene.textures.exists(sKey)) return null;
    const W = CARD_TEX_W, H = CARD_TEX_H, L = MARK_LAYOUT;
    const left = x - (W * scale) / 2, top = y - (H * scale) / 2;   // levý horní roh karty na obrazovce
    const mScale = L.scale * scale;
    // Kotva vlevo dole (origin 0,1) – stejně jako zapečené marky, ať pulz sedí přesně.
    // Barva má DŮLEŽITÝ LEVÝ KRAJ: sedí hned za číslem (šířka čísla + konstantní mezera).
    const val = gameScene.add.image(left + L.valX * scale, top + L.valY * scale, vKey)
        .setOrigin(0, 1).setScale(mScale).setDepth(830);
    const suitX = L.valX + val.width * L.scale + L.gap;           // v prostoru karty
    const suit = gameScene.add.image(left + suitX * scale, top + L.suitY * scale, sKey)
        .setOrigin(0, 1).setScale(mScale).setDepth(830);
    const cover = _markCoverPatch(x, y, scale, card, {
        x0: L.valX,
        y0: Math.min(L.valY - val.height * L.scale, L.suitY - suit.height * L.scale),
        x1: suitX + suit.width * L.scale,
        y1: Math.max(L.valY, L.suitY),
    });
    if (cover && opts.tint) cover.setTint(opts.tint);
    const marks = cover ? [cover, val, suit] : [val, suit];
    const tween = gameScene.tweens.add({
        targets: [val, suit], scaleX: mScale * 1.45, scaleY: mScale * 1.45,
        duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    return { marks, tween };
}

// Sejmutí (Dynamit/Vězení/Barel/Jourdonnais): kontrolní karta vyletí z balíčku do
// středu, otočí se rub→líc a zvětší, 3 s drží, pak se zmenší a odletí do odhozu.
function startCheckReveal(check) {
    if (!gameScene || !check?.card) return;
    const faceTex = getCardTex(check.card.id);
    let pulse = null;
    const stopPulse = () => {
        if (!pulse) return;
        if (pulse.tween) pulse.tween.remove();
        pulse.marks.forEach(m => m.destroy());
        pulse = null;
    };
    // Sejmutí (draw!) se Opuštěného dolu netýká – bere se vždycky z dobíracího balíčku
    // a karta se za letu překlopí rub→líc.
    const _from = deckTopPos();
    const _faceUp = false;
    const sprite = gameScene.add.image(_from.x, _from.y, _faceUp ? faceTex : 'card_back')
        .setScale(PILE_SCALE).setDepth(820).setAlpha(0.98);
    // 1) hromádka → střed: posun + růst (+ flip rub→líc, mimo důl)
    gameScene.tweens.add({ targets: sprite, x: REVEAL_CX, y: REVEAL_CY, duration: 450, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleY: REVEAL_BIG, duration: 450, ease: 'Cubic.easeOut' });
    if (_faceUp) {
        gameScene.tweens.add({ targets: sprite, scaleX: REVEAL_BIG, duration: 450, ease: 'Cubic.easeOut',
            onComplete: () => { if (sprite.active) pulse = pulseCheckMark(REVEAL_CX, REVEAL_CY, REVEAL_BIG, check.card); } });
    } else {
    gameScene.tweens.add({ targets: sprite, scaleX: 0, duration: 225, ease: 'Sine.easeIn',
        onComplete: () => { if (!sprite.active) return; sprite.setTexture(faceTex);
            gameScene.tweens.add({ targets: sprite, scaleX: REVEAL_BIG, duration: 225, ease: 'Sine.easeOut',
                onComplete: () => { pulse = pulseCheckMark(REVEAL_CX, REVEAL_CY, REVEAL_BIG, check.card); } }); } });
    }
    // Divoký západ – John Pain: sejmutou kartu si bere, takže z odkrytí neletí do odhozu
    // a hned zase ven (dva lety místo jednoho, bug 28), ale rovnou do jeho ruky – přesně
    // jako druhá karta Black Jacka. Komu připadne, říká server v `johnPainIdx`
    // (predikce týmž dotazem, kterým se karta pak opravdu přesune – viz logic/wildWest.js).
    const _jp = (typeof check.johnPainIdx === 'number' && check.johnPainIdx >= 0
                 && state?.players?.[check.johnPainIdx]) ? check.johnPainIdx : null;
    if (_jp !== null) {
        const jpMine = _jp === myIndex && myIndex !== null;
        const jpHand = state.players[_jp].hand || [];
        const jpTo = getHandSlotPos(_jp, jpHand.length, jpHand.length + 1);
        const jpScale = jpMine ? 0.4 : 0.3;
        if (jpMine) App.pendingDrawIds.add(check.card.id);   // skryj v ruce do doletu (staging)
        const jpDelay = 450 + 3000;
        gameScene.tweens.add({ targets: sprite, x: jpTo.x, y: jpTo.y, scaleY: jpScale,
            delay: jpDelay, duration: 400, ease: 'Cubic.easeIn',
            // Marka leží na PEVNÉ pozici uprostřed (nedrží se karty) – zhasni ji se startem letu.
            onStart: () => stopPulse(),
            onComplete: () => holdThenFinish(sprite,
                () => (state?.players?.[_jp]?.hand || []).some(c => c.id === check.card.id),
                () => {
                    stopPulse();
                    if (jpMine) App.pendingDrawIds.delete(check.card.id);
                    if (sprite.active) sprite.destroy();
                    renderUI();
                }) });
        // Z odhozu karta odejde teprve až doběhne efekt, kvůli kterému se snímalo
        // (u barelu klidně po celé obraně) – do té doby ji v hromádce neukazuj, vizuálně
        // už leží v jeho ruce. Pojistka pro případ, že se predikce rozejde se skutečností
        // (John Pain mezitím zemře / doplní ruku na 6): po chvíli se skrývání pustí.
        App.discardFlyHideIds.add(check.card.id);
        let jpWait = 0;
        const jpPoll = () => {
            if (!gameScene) return;
            const inPile = (state?.deck?.discardPile || []).some(c => c.id === check.card.id);
            if (!inPile || (jpWait += 120) > 6000) { App.discardFlyHideIds.delete(check.card.id); renderUI(); return; }
            gameScene.time.delayedCall(120, jpPoll);
        };
        gameScene.time.delayedCall(jpDelay + 400, jpPoll);
        const jpAngle = _kitSpecAngleFor(_jp);
        if (jpAngle) gameScene.tweens.add({ targets: sprite, angle: jpAngle, delay: jpDelay, duration: 400, ease: 'Cubic.easeIn' });
        if (hideIntoHand(_jp)) {
            // ...míří do skryté ruky → za letu se překlopí zpátky na rub.
            gameScene.tweens.add({ targets: sprite, scaleX: 0, delay: jpDelay, duration: 200, ease: 'Sine.easeIn',
                onComplete: () => { if (!sprite.active) return; sprite.setTexture('card_back');
                    gameScene.tweens.add({ targets: sprite, scaleX: jpScale, duration: 200, ease: 'Sine.easeOut' }); } });
        } else {
            gameScene.tweens.add({ targets: sprite, scaleX: jpScale, delay: jpDelay, duration: 400, ease: 'Cubic.easeIn' });
        }
        return;
    }
    // 2) po 3 s drhu se zmenší a odletí do odhozu. Sprite po dosednutí podrž na místě,
    // dokud kontrolní karta na vrcholu odhozu není VIDITELNÁ (fáze už není CHECKING, kde ji
    // board.js schovává) – jinak po zániku spritu problikne předchozí vrchní karta odhozu.
    // Zmenšení PŘESNĚ na velikost karty v odhozu (PILE_SCALE) – ne na „nějakých" 0.28,
    // jinak karta dosedne menší než hromádka a než sprite zanikne (čeká na broadcast,
    // holdThenFinish), je ten rozdíl vidět.
    const _checkDiscard = discardTopPos();   // vrch odhozu, ať kontrolní karta dosedne na hromádku
    gameScene.tweens.add({ targets: sprite, x: _checkDiscard.x, y: _checkDiscard.y, scaleX: PILE_SCALE, scaleY: PILE_SCALE,
        delay: 450 + 3000, duration: 400, ease: 'Cubic.easeIn',
        // Se začátkem sestupu do odhozu jde karta z „reveal" vrstvy do vrstvy hromádky –
        // výsledek sejmutí (vězení/dynamit) letí za ní a musí dosednout NAD ni.
        onStart: () => { stopPulse(); sprite.setDepth(REVEAL_PILE_DEPTH); },
        onComplete: () => holdThenFinish(sprite, () => {
            // Drž, dokud kontrolní karta není ve stavu odhozu A zároveň skončila fáze
            // CHECKING (board.js ji do té doby navrchu schovává). NEvyžaduj, aby byla
            // úplně navrchu – vyhodnocení (Vězení/Dynamit) hned přidá další kartu NAD
            // ni; kdyby byl predikát vázán na „top", sprite by tu ležel ještě 720 ms a
            // překrýval by čerstvě dosednutou kartu (vězení pak vypadalo „o 1 níž").
            const dp = state?.deck?.discardPile;
            return !!dp?.some(c => c.id === check.card.id) &&
                   !(state.phase === 'CHECKING' && state.currentCheck?.active);
        }, () => { stopPulse(); if (sprite.active) sprite.destroy(); }) });
}

// Black Jack: 2. líznutá karta se zkoumá (stejný reveal jako sejmutí), ale pak
// místo do odhozu letí do RUKY. Majitel ji zná (zůstává lícem, v ruce skrytá do
// doletu); ostatní vidí, jak se otočí zpět na rub a letí k Black Jackovi.
function startBlackJackReveal(ds) {
    if (!gameScene || !ds?.blackJackCard || !state) return;
    const card = ds.blackJackCard;
    const playerIdx = ds.playerIdx;
    const faceTex = getCardTex(card.id);
    const isOwner = playerIdx === myIndex && myIndex !== null;
    const hand = state.players[playerIdx]?.hand ?? [];
    const handTarget = getHandSlotPos(playerIdx, hand.length, hand.length + 1);
    const endScale = isOwner ? 0.4 : 0.3;
    // Opuštěný důl: druhá karta Black Jacka JE lízání ve fázi 1, takže se pod dolem
    // bere z odhozu (lícem nahoru) – vzlétni odtamtud a nepřeklápěj.
    const _from = minePhase1Pos();
    const _faceUp = mineOn();
    const sprite = gameScene.add.image(_from.x, _from.y, _faceUp ? faceTex : 'card_back')
        .setScale(0.28).setDepth(820).setAlpha(0.98);
    // Black Jack zkoumá BARVU druhé karty úplně stejně jako kdokoli při sejmutí, takže
    // musí i stejně blikat hodnota+barva (bez toho stůl nevěděl, na co se vlastně kouká).
    let pulse = null;
    const stopPulse = () => {
        if (!pulse) return;
        if (pulse.tween) pulse.tween.remove();
        pulse.marks.forEach(m => m.destroy());
        pulse = null;
    };
    // 1) hromádka → střed (karta je veřejná – všichni vidí líc)
    gameScene.tweens.add({ targets: sprite, x: REVEAL_CX, y: REVEAL_CY, duration: 450, ease: 'Cubic.easeOut' });
    gameScene.tweens.add({ targets: sprite, scaleY: REVEAL_BIG, duration: 450, ease: 'Cubic.easeOut' });
    if (_faceUp) {
        gameScene.tweens.add({ targets: sprite, scaleX: REVEAL_BIG, duration: 450, ease: 'Cubic.easeOut',
            onComplete: () => { if (sprite.active) pulse = pulseCheckMark(REVEAL_CX, REVEAL_CY, REVEAL_BIG, card); } });
    } else {
    gameScene.tweens.add({ targets: sprite, scaleX: 0, duration: 225, ease: 'Sine.easeIn',
        onComplete: () => { if (!sprite.active) return; sprite.setTexture(faceTex);
            gameScene.tweens.add({ targets: sprite, scaleX: REVEAL_BIG, duration: 225, ease: 'Sine.easeOut',
                onComplete: () => { if (sprite.active) pulse = pulseCheckMark(REVEAL_CX, REVEAL_CY, REVEAL_BIG, card); } }); } });
    }
    if (isOwner) App.pendingDrawIds.add(card.id);   // skryj v ruce do doletu (staging)
    const flyDelay = 450 + 3000;
    // 2) po 3 s letí do ruky Black Jacka
    gameScene.tweens.add({ targets: sprite, x: handTarget.x, y: handTarget.y, scaleY: endScale,
        delay: flyDelay, duration: 420, ease: 'Cubic.easeIn',
        // Marka leží na PEVNÉ pozici uprostřed obrazovky (nedrží se karty), takže musí
        // zhasnout přesně se startem letu do ruky – jinak by zůstala viset ve vzduchu.
        onStart: () => stopPulse(),
        onComplete: () => { if (sprite.active) sprite.destroy();
            if (isOwner) {
                App.pendingDrawIds.delete(card.id);
                // Karta se objeví PŘESNĚ při dosednutí: pokud broadcast s vyhodnocením
                // ještě nedorazil, vlož ji do ruky optimisticky (další broadcast stav
                // stejně přepíše, takže žádný duplikát).
                const h = state?.players?.[myIndex]?.hand;
                if (h && !h.some(c => c.id === card.id)) h.push(card);
                renderUI();
            } else {
                // Ostatní: karta (rub) se v jeho ruce objeví TAKÉ přesně při dosednutí spritu,
                // ať mezi koncem letu a (opožděným) room_update není prázdné místo (probliknutí).
                // Do skryté ruky ale patří placeholder BEZ ID (to pošle i redakce) – se
                // skutečnou kartou ji deska nakreslí lícem, takže by se karta hned po
                // dosednutí odkryla a překlopení za letu vypadalo, že se nekonalo.
                const h = state?.players?.[playerIdx]?.hand;
                if (h && !h.some(c => c.id === card.id)) {
                    h.push(hideIntoHand(playerIdx) ? { id: null, _placeholder: true } : card);
                    renderUI();
                }
            } } });
    if (isOwner) {
        gameScene.tweens.add({ targets: sprite, scaleX: endScale, delay: flyDelay, duration: 420, ease: 'Cubic.easeIn' });
    } else {
        // ostatní: karta míří do vějíře ruky soupeře → za letu se dotočí do jeho
        // orientace (bok = ±90°, protější = 180°), jako běžné líznutí do ruky.
        const seatAngle = _kitSpecAngleFor(playerIdx);
        if (seatAngle) gameScene.tweens.add({ targets: sprite, angle: seatAngle, delay: flyDelay, duration: 420, ease: 'Cubic.easeIn' });
        // ...a překlopí se zpět na rub – ale JEN když do skryté ruky opravdu míří.
        // Pod Sacagaway, v debug hře i u diváka hry jen botů leží ruce odkryté, takže by
        // karta dosedla jako rub do vějíře kresleného lícem a hned se překlopila zpátky
        // (hideIntoHand je jediný zdroj pravdy, viz net/handlers.js).
        if (hideIntoHand(playerIdx)) {
            gameScene.tweens.add({ targets: sprite, scaleX: 0, delay: flyDelay, duration: 210, ease: 'Sine.easeIn',
                onComplete: () => { if (!sprite.active) return; sprite.setTexture('card_back');
                    gameScene.tweens.add({ targets: sprite, scaleX: endScale, duration: 210, ease: 'Sine.easeOut' }); } });
        } else {
            gameScene.tweens.add({ targets: sprite, scaleX: endScale, delay: flyDelay, duration: 420, ease: 'Cubic.easeIn' });
        }
    }
}

// ── ODKRYTÁ ŘADA (Kit Carlson / Claus): rozdání z balíčku, případně s mícháním ──
// Když balíček během odkrývání DOJDE, rozdá se nejdřív to, co v něm bylo, pak se
// zamíchá (hra čeká) a teprve pak dorazí zbytek – přesně jako v hokynářství.
// Režim posílá server v `anim` (viz _revealAnim v logic/draw.js); tempo (stagger/fly)
// musí zrcadlit server/anim.js revealCinematicMs, aby se o stejnou dobu podrželi boti.
//
//   n        – kolik karet se rozdává
//   anim     – { mode, dealtBefore, shuffleCount, origCount } ze stavu
//   tempo    – { start, stagger, fly }
//   flyOne(i)– odešli JEDNU kartu (index i) z balíčku do jejího slotu
function dealRevealRow(n, anim, tempo, flyOne, onDone) {
    const a = anim || {};
    const k = a.mode === 'blocking' ? Math.min(a.dealtBefore ?? n, n) : n;
    // Balíček kreslíme po dobu rozdávání podle vlastního počtu – stav, který s fází
    // dorazil, už má případně zamíchaný (velký) balíček a hromádka by skočila.
    App.dealDeckCount = a.origCount ?? (state?.deck?.cards?.length ?? 0) + n;
    // Dokud se rozdává (a případně míchá), z řady se nevybírá – stav s fází dorazil hned.
    App.revealLocked = true;
    const runChunk = (from, to, done) => {
        if (to <= from) { done(); return; }
        for (let i = from; i < to; i++) {
            const idx = i;
            setTimeout(() => {
                if (!gameScene) return;
                if (App.dealDeckCount !== null) App.dealDeckCount = Math.max(0, App.dealDeckCount - 1);
                flyOne(idx);
                renderUI();   // hromádka o kartu nižší
            }, tempo.start + (idx - from) * tempo.stagger);
        }
        setTimeout(done, tempo.start + (to - from - 1) * tempo.stagger + tempo.fly + 40);
    };
    const finish = () => { App.dealDeckCount = null; App.revealLocked = false; renderUI(); if (onDone) onDone(); };
    runChunk(0, k, () => {
        if (a.mode === 'blocking') {
            App.revealShuffling = true;
            renderUI();
            playReshuffleCinematic(a.shuffleCount || 20, { depthBase: 5, onDone: () => {
                App.revealShuffling = false;
                // Po zamíchání leží na stole nový (velký) balíček; zbylé karty se z něj
                // teprve rozdají, takže do doletu poslední drž počet o ně vyšší.
                App.dealDeckCount = (state?.deck?.cards?.length ?? 0) + (n - k);
                renderUI();
                runChunk(k, n, finish);
            } });
        } else if (a.mode === 'proactive') {
            // Balíček se vyprázdnil poslední kartou – míchá se až teď, paralelně s výběrem.
            // Po dobu míchání se hromádka NEKRESLÍ (revealShuffling): stav už nese
            // zamíchaný (plný) balíček, takže bez toho se objevil hned na začátku
            // cinematiky – vedle míchané hromádky ležel druhý, hotový.
            App.dealDeckCount = null;
            App.revealLocked = false;
            App.revealShuffling = true;
            App.revealShuffleRunning = true;
            renderUI();
            playReshuffleCinematic(a.shuffleCount || 20, { depthBase: 5, onDone: () => {
                App.revealShuffleRunning = false;
                App.revealShuffling = false;
                renderUI();
            } });
            if (onDone) onDone();
        } else {
            finish();
        }
    });
}

// ── KIT CARLSON / LUCKY DUKE: rozdání karet do panelu + následné lety ──────────
// Karty letí z balíčku do panelu a překlopí se rub→líc (jako reveal sejmutí).
// Sloty se v board.js skryjí (kitDealIds/luckyDealIds), dokud karta nedoletí.

// Kit Carlson (vidí jen Kit): 3 karty z balíčku do řady panelu.
const KIT_TEMPO = { start: 0, stagger: 160, fly: 420 };
function startKitCarlsonDeal() {
    if (!gameScene || !state?.kitCarlsonState) return;
    const revealed = state.kitCarlsonState.revealed || [];
    const spacing = 260, startX = 960 - spacing, slotY = 480, slotScale = 0.6;
    App.kitDealIds = new Set(revealed.map(c => c.id));
    App.kitRevealCards = revealed.map((c, i) => ({ id: c.id, x: startX + i * spacing, y: slotY }));
    App.kitPicked = [];
    renderUI();
    dealRevealRow(revealed.length, state.kitCarlsonState.anim, KIT_TEMPO, (i) => {
        const card = revealed[i];
        if (!card) return;
        const _deckTop = minePhase1Pos();
        // Opuštěný důl: karty se berou z odhozu, kde ležely lícem nahoru → bez překlápění.
        animateCardFlip(_deckTop.x, _deckTop.y, startX + i * spacing, slotY, 'card_back', getCardTex(card.id),
            { flip: !mineOn(), startScale: 0.28, endScale: slotScale, duration: KIT_TEMPO.fly,
              onComplete: () => { App.kitDealIds.delete(card.id); renderUI(); } });
    });
}

// Kit výsledek (Kit player): vybrané karty už odletěly do ruky při kliknutí (viz
// pick handler v board.js). Tady doletí jen NEvybraná zpět do balíčku.
function playKitCarlsonResult() {
    const reveal = App.kitRevealCards || [];
    const picked = App.kitPicked || [];
    reveal.forEach(rc => {
        if (picked.includes(rc.id)) return;
        // Nevybraná: překlopí se líc→rub a zmenší při návratu na vrch té hromádky,
        // ze které se brala (pod Opuštěným dolem tedy do odhozu).
        const _deckTop = minePhase1Pos();
        animateCardFlip(rc.x, rc.y, _deckTop.x, _deckTop.y, 'card_back', getCardTex(rc.id),
            { flip: true, reverse: true, startScale: 0.6, endScale: 0.28, duration: 440 });
    });
    App.kitRevealCards = null;
    App.kitPicked = [];
    App.dealDeckCount = null;    // konec rozdávání řady → balíček zase podle stavu
    if (!App.revealShuffleRunning) App.revealShuffling = false;
    App.revealLocked = false;
}

// ── CLAUS "THE SAINT" (Fistful): odkrytá řada ────────────────────────────────
// CLAUS ji má uprostřed stolu, lícem nahoru: karet je až devět (osm hráčů, s Příjezdem
// vlaku i deset), takže se na rozdíl od Kitova panelu MĚŘÍTKO počítá z jejich počtu –
// řada se musí vejít mezi okraje jeviště. Mezera mezi kartami je naopak PEVNÁ (a malá):
// karty se mají zvětšovat, ne rozestupovat. OSTATNÍ ji vidí rubem u jeho místa (viz
// clausPanelLayout níž). Tahle geometrie je jediný zdroj pravdy pro kreslení
// (view/board.js), rozdávání z balíčku i následné lety k příjemcům, takže se nikde
// nesmí dopočítávat „podle sebe".
const CLAUS_ROW_Y = 470, CLAUS_MAX_SCALE = 0.6, CLAUS_GAP = 10;

// Pohled OSTATNÍCH (a diváka): karty jsou pro ně zakryté (redactState), takže uprostřed
// stolu by z nich byla jen anonymní řada rubů, kterou si nikdo s Clausem nespojí. Parkují
// proto kousek od jeho místa – přesně jako Kitovy rubové karty (_kitSpecParked), jen víc
// vedle sebe: karet je až deset, takže rozteč s jejich počtem klesá a délka řady je
// zastropovaná, ať nesahá na sousedy. OFF/SCALE/STEP zrcadlí Kitovy hodnoty.
const CLAUS_SPEC_OFF = 175, CLAUS_SPEC_SCALE = 0.3, CLAUS_SPEC_STEP = 66, CLAUS_SPEC_MAX_LEN = 480;

function clausPanelLayout(n) {
    const count = Math.max(1, n || 1);
    const clausIdx = state?.currentPlayerIndex ?? 0;   // Claus je vždycky hráč na tahu
    if (!(myIndex !== null && clausIdx === myIndex)) {
        // Kotva: kousek od Clausovy ruky směrem ke středu stolu; řada se pak roztahuje
        // podél kolmice, takže na boku leží nastojato (stejně jako jeho ostatní karty).
        const hand = getPlayerHandPos(clausIdx);
        const dx = 960 - hand.x, dy = 540 - hand.y;
        const dlen = Math.hypot(dx, dy) || 1;
        const ux = dx / dlen, uy = dy / dlen;
        const spacing = Math.min(CLAUS_SPEC_STEP, CLAUS_SPEC_MAX_LEN / Math.max(1, count - 1));
        return { n: count, scale: CLAUS_SPEC_SCALE, spacing, spectator: true,
                 angle: _kitSpecAngleFor(clausIdx),
                 ax: hand.x + ux * CLAUS_SPEC_OFF, ay: hand.y + uy * CLAUS_SPEC_OFF,
                 perpx: -uy, perpy: ux };
    }
    const avail = Math.max(600, (stageRight() - stageLeft()) - 180);
    const scale = Math.max(0.16, Math.min(CLAUS_MAX_SCALE,
        (avail - CLAUS_GAP * (count - 1)) / (count * CARD_TEX_W)));
    const spacing = CARD_TEX_W * scale + CLAUS_GAP;
    // Střed jeviště zůstává na 960 i po roztažení plátna (viz computeStage).
    return { n: count, scale, spacing, angle: 0, y: CLAUS_ROW_Y, startX: 960 - (count - 1) * spacing / 2 };
}

function clausSlotPos(i) {
    const P = App.clausPanel || clausPanelLayout(state?.clausState?.revealed?.length || 1);
    if (P.spectator) {
        const off = (i - (P.n - 1) / 2) * P.spacing;
        return { x: P.ax + P.perpx * off, y: P.ay + P.perpy * off };
    }
    return { x: P.startX + i * P.spacing, y: P.y };
}

// Vstup do fáze CLAUS_GIVE: karty odletí z balíčku do řady. Claus je vidí lícem
// (překlopí se za letu), ostatní i divák jen rubem – v jejich stavu je řada zakrytá
// (redactState), takže se se sloty pracuje přes INDEX, ne přes ID karty.
const CLAUS_TEMPO = { start: 100, stagger: 110, fly: 420 };
function startClausDeal() {
    if (!gameScene || !state?.clausState) return;
    const revealed = state.clausState.revealed || [];
    const P = clausPanelLayout(revealed.length);
    App.clausPanel = P;
    // Reconnect uprostřed fáze: co je rozdané, se znovu rozdávat nesmí.
    const picked = new Set(state.clausState.picked || []);
    App.clausDealSlots = new Set(revealed.map((_, i) => i).filter(i => !picked.has(i)));
    App.clausTakenSlots = new Set();
    const pileScale = currentLayout().scaleDeck;
    renderUI();
    dealRevealRow(revealed.length, state.clausState.anim, CLAUS_TEMPO, (i) => {
        const card = revealed[i];
        if (picked.has(i) || !App.clausDealSlots?.has(i)) return;
        const from = minePhase1Pos();
        const to = clausSlotPos(i);
        const done = () => { App.clausDealSlots?.delete(i); renderUI(); };
        if (card?.id != null) {
            // Opuštěný důl: z odhozu jdou karty lícem nahoru → nepřeklápět.
            animateCardFlip(from.x, from.y, to.x, to.y, 'card_back', getCardTex(card.id),
                { flip: !mineOn(), startScale: pileScale, endScale: P.scale, duration: CLAUS_TEMPO.fly,
                  endAngle: P.angle || 0, onComplete: done });
        } else {
            // Ostatním řada parkuje u Clausova místa, takže na boku dosedá nastojato.
            animateCard(from.x, from.y, to.x, to.y, 'card_back', CLAUS_TEMPO.fly, done,
                { startScale: pileScale, endScale: P.scale, endAngle: P.angle || 0 });
        }
    });
}

function endClausDeal() {
    App.clausPanel = null;
    App.clausDealSlots = new Set();
    App.clausTakenSlots = new Set();
    App.dealDeckCount = null;
    if (!App.revealShuffleRunning) App.revealShuffling = false;
    App.revealLocked = false;
}

// ── KIT CARLSON – pohled OSTATNÍCH (ne Kit) ───────────────────────────────────
// Kit si potají líže 3 karty; ostatní místo toho uvidí 3 RUBOVÉ karty přiletět z
// balíčku k Němu a zaparkovat mezi ním a středem. Při výběru odlétají do jeho ruky,
// poslední nevybraná zpět do balíčku. Na boku se karty otáčí dle orientace Kita.
function _kitSpecAngleFor(kitIdx) {
    const view = myIndex === null ? 0 : myIndex;
    if (kitIdx === view) return 0;
    const total = state.players.length;
    const diff = (kitIdx - view + total) % total;
    const side = getOpponentAnchors(total)[diff - 1]?.side;
    return side === 'left' ? 90 : side === 'right' ? -90 : side === 'top' ? 180 : 0;
}

function _clearKitSpecSprites() {
    (App.kitSpecParked || []).forEach(p => { if (p?.sprite?.active) p.sprite.destroy(); });
    App.kitSpecParked = [];
    App.kitSpecPicksDone = 0;
    App.oppHandHideCount = {};   // žádné rozletěné Kitovy karty → nic neskrývej
    App.dealDeckCount = null;    // konec rozdávání řady → balíček zase podle stavu
    if (!App.revealShuffleRunning) App.revealShuffling = false;
    App.revealLocked = false;
}

function startKitCarlsonDealSpectator() {
    if (!gameScene || !state) return;
    _clearKitSpecSprites();
    const kitIdx = state.currentPlayerIndex;
    const n = state.kitCarlsonState?.revealed?.length || 3;
    const hand = getPlayerHandPos(kitIdx);
    const CX = 960, CY = 540;
    const dx = CX - hand.x, dy = CY - hand.y;
    const dlen = Math.hypot(dx, dy) || 1;
    const ux = dx / dlen, uy = dy / dlen;       // jednotkový směr ke středu
    const OFF = 175;                             // jak daleko od Kita do středu karty parkují
    const ax = hand.x + ux * OFF, ay = hand.y + uy * OFF;
    const perpx = -uy, perpy = ux;              // kolmice – podél ní se vějíř roztáhne
    // Menší karty (na úrovni ostatních karet soupeřů), aby nepůsobily jako obří reveal;
    // menší i rozteč, ať se vějíř mezi postavou a středem nerozjede přes celou obrazovku.
    const spread = 66, scale = 0.3;
    const angle = _kitSpecAngleFor(kitIdx);
    App.kitSpecKitIdx = kitIdx;
    App.kitSpecPicksDone = 0;
    // Kolik si Kit nechá – běžně 2, se Žízní (High Noon) jen 1. Zapamatovat se to musí
    // TEĎ: při závěrečném letu už je kitCarlsonState ve stavu null.
    App.kitSpecNeeded = state.kitCarlsonState?.needed ?? 2;
    App.kitSpecParked = [];
    // Sprity se vyrobí hned (drží pořadí i pro pozdější lety), ale odstartují je až
    // dealRevealRow – při došlém balíčku mezi ně vloží míchací cinematiku.
    const slots = [];
    for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * spread;
        const tx = ax + perpx * off, ty = ay + perpy * off;
        // Opuštěný důl: karty se berou z ODHOZU, kde je celý stůl viděl lícem nahoru
        // (kitCarlsonState.revealed chodí v room_update všem). Vzlétnou proto lícem
        // a u Kita se přetočí na rub – jinak by z veřejné hromádky odletěl rub.
        const _mineFace = mineOn() && state.kitCarlsonState?.revealed?.[i]?.id != null;
        const sp = gameScene.add.image(DECK_X, DECK_Y,
                _mineFace ? getCardTex(state.kitCarlsonState.revealed[i].id) : 'card_back')
            .setScale(0.28).setAngle(0).setDepth(805 + i).setAlpha(0);
        App.kitSpecParked.push({ sprite: sp, x: tx, y: ty, angle });
        slots.push({ sp, tx, ty, mineFace: _mineFace });
    }
    dealRevealRow(n, state.kitCarlsonState?.anim, KIT_TEMPO, (i) => {
        const sl = slots[i];
        if (!sl || !sl.sp.active) return;
        sl.sp.setPosition(minePhase1Pos().x, minePhase1Pos().y).setAlpha(1);
        gameScene.tweens.add({ targets: sl.sp, x: sl.tx, y: sl.ty, scaleX: scale, scaleY: scale,
            angle, duration: KIT_TEMPO.fly, ease: 'Cubic.easeOut',
            // Pod dolem karta vzlétla lícem (viz výš) – na místě se překlopí na rub, ať
            // ostatní dál vidí jen to, co vidět mají (identitu si pamatuje jen Kit).
            onComplete: () => mineLandThen(sl.sp, sl.mineFace ? { mineLand: true, mineLandHold: 0 } : {}, () => {}) });
    });
}

// Mezivýběr (1. výběr, fáze stále KIT_CARLSON): nově vybrané karty odešli do ruky Kita.
// Necháme aspoň 1 parkující kartu pro závěrečný let (poslední výběr + návrat do balíčku).
function advanceKitCarlsonSpectator() {
    if (!gameScene || !state) return;
    const picked = state.kitCarlsonState?.pickedIds?.length || 0;
    while (App.kitSpecPicksDone < picked && App.kitSpecParked.length > 1) {
        _kitSpecFlyToHand(App.kitSpecParked.shift());
        App.kitSpecPicksDone++;
    }
}

// Konec Kit Carlsona pro ostatní: zbylé parkující karty – všechny krom poslední do
// ruky Kita (vybrané), poslední zpět do balíčku (nevybraná).
function finishKitCarlsonSpectator() {
    const parked = App.kitSpecParked || [];
    // Kolik jich ještě nedoletělo do ruky (zbytek = nevybrané do balíčku). Počet, který
    // si Kit nechává, je běžně 2, se Žízní 1 (App.kitSpecNeeded ze startu rozdávání).
    // Robustní i pro málo karet v balíčku (revealed < 3).
    const toHand = Math.max(0, (App.kitSpecNeeded ?? 2) - (App.kitSpecPicksDone || 0));
    parked.forEach((slot, i) => {
        if (i < toHand) _kitSpecFlyToHand(slot, i * 120, i);
        else _kitSpecFlyToDeck(slot, i * 120);
    });
    App.kitSpecParked = [];
    App.kitSpecPicksDone = 0;
}

// Vybraná karta odletí do ruky Kita. Ctí „předchozí pravidla": míří na KONCOVÝ slot
// jeho vějíře (ne obecný střed ruky), zmenší se na velikost jeho karet a otočí se do
// jeho orientace. slotBump posune cíl u víc karet za sebou, ať nedosednou na sebe.
function _kitSpecFlyToHand(slot, delay = 0, slotBump = 0) {
    const sp = slot?.sprite;
    if (!gameScene || !sp?.active) { if (sp?.active) sp.destroy(); return; }
    const kitIdx = App.kitSpecKitIdx ?? state?.currentPlayerIndex ?? 0;
    // Vybraná karta už je v Kitově ruce ze serveru (room_update). Drž ji ale skrytou,
    // dokud sem animace nedosedne – ať se v ruce neobjeví HNED, ale až po doletu.
    App.oppHandHideCount = App.oppHandHideCount || {};
    App.oppHandHideCount[kitIdx] = (App.oppHandHideCount[kitIdx] || 0) + 1;
    const handLen = state?.players?.[kitIdx]?.hand?.length ?? 0;
    const visLen = Math.max(0, handLen - App.oppHandHideCount[kitIdx]);   // viditelné karty (bez letících)
    const total = handLen + slotBump + 1;
    const to = getHandSlotPos(kitIdx, visLen + slotBump, total);           // dosedne na koncový VIDITELNÝ slot
    // Karta dosedá do RUKY (u kompaktní řady soupeřů je vějíř menší než vyložené karty).
    const scale = handCardScale(currentLayout(), (state?.players?.length || 2) - 1,
        kitIdx === (myIndex === null ? 0 : myIndex));
    const angle = _kitSpecAngleFor(kitIdx);
    renderUI();   // skryj nově přibylou kartu v ruce hned (než dosedne sprite)
    gameScene.tweens.add({ targets: sp, x: to.x, y: to.y, scaleX: scale, scaleY: scale,
        angle, delay, duration: 380, ease: 'Cubic.easeIn',
        onComplete: () => {
            if (sp.active) sp.destroy();
            // Sprite dosedl → kartu v ruce odkryj (sniž skrytý počet).
            if (App.oppHandHideCount) App.oppHandHideCount[kitIdx] = Math.max(0, (App.oppHandHideCount[kitIdx] || 1) - 1);
            renderUI();
        } });
}

function _kitSpecFlyToDeck(slot, delay = 0) {
    const sp = slot?.sprite;
    if (!gameScene || !sp?.active) { if (sp?.active) sp.destroy(); return; }
    const _deckTop = minePhase1Pos();
    gameScene.tweens.add({ targets: sp, x: _deckTop.x, y: _deckTop.y, scaleX: 0.28, scaleY: 0.28,
        angle: 0, delay, duration: 380, ease: 'Cubic.easeIn',
        onComplete: () => { if (sp.active) sp.destroy(); } });
}

// Lucky Duke (vidí všichni): 2 karty z balíčku do panelu.
function startLuckyDukeDeal() {
    if (!gameScene || !state?.luckyDukeState) return;
    const cards = state.luckyDukeState.cards || [];
    const slotY = 480, slotScale = 0.65;
    const xOf = i => i === 0 ? 660 : 1260;
    App.luckyDealIds = new Set(cards.map(c => c.id));
    App.luckyRevealCards = cards.map((c, i) => ({ id: c.id, x: xOf(i), y: slotY }));
    renderUI();
    // Karty odcházejí z VRCHU balíčku a v jeho velikosti (PILE_SCALE) – ne ze středu
    // hromádky a o kus menší, jinak to vypadá, že se v balíčku „objevují" zevnitř.
    // Vrch se bere hned teď: stav už obě karty z balíčku odebral.
    const _from = deckTopPos();
    // Během výběru se marky ZÁMĚRNĚ nezvýrazňují – karty jsou dvě a blikání na obou
    // rozptyluje. Pulz přijde až na vybrané kartě uprostřed obrazovky, přesně jako
    // u běžného sejmutí (viz playLuckyDukeResult).
    cards.forEach((card, i) => {
        setTimeout(() => {
            if (!gameScene) return;
            animateCardFlip(_from.x, _from.y, xOf(i), slotY, 'card_back', getCardTex(card.id),
                { flip: true, startScale: PILE_SCALE, endScale: slotScale, duration: 420,
                  onComplete: () => { App.luckyDealIds.delete(card.id); renderUI(); } });
        }, i * 160);
    });
}

// Lucky výsledek: NEvybraná karta odletí ze svého slotu rovnou do odhozu, vybraná se
// přesune doprostřed obrazovky a odtud je to ÚPLNĚ KLASICKÉ sejmutí – zvětší se, zabliká
// jí zkoumaná hodnota+barva (pulseCheckMark) a po výdrži sjede do odhozu. Teprve pak jde
// ve frontě výsledek checku (vězení/dynamit), takže karty leží na hromádce ve stejném
// pořadí, v jakém dosedly (logika je tak i vkládá – viz luckyDukePick).
// Kterou si vybral, říká server (`lucky_duke_result` nese chosenId); bez něj (fallback
// z room_update) je to ta na vrcholu odhozu.
const LD_DROP_MS = 400;        // nevybraná ze slotu do odhozu
const LD_TO_CENTER_MS = 450;   // vybraná ze slotu doprostřed (+ zvětšení)
const LD_HOLD_MS = 3000;       // výdrž uprostřed s pulzující markou (jako startCheckReveal)
const LD_TO_DISCARD_MS = 400;  // sestup do odhozu
function playLuckyDukeResult(chosenId) {
    const reveal = App.luckyRevealCards || [];
    App.luckyRevealCards = null;
    if (!gameScene || !reveal.length) return;
    const dp = state?.deck?.discardPile || [];
    const chosenIdResolved = (chosenId !== undefined && chosenId !== null)
        ? chosenId : dp[dp.length - 1]?.id;
    const picked = reveal.find(rc => rc.id === chosenIdResolved) || reveal[0];
    // Karta (hodnota + barva) pro pulz: dokud animace běží, je stav ještě ve fázi
    // LUCKY_DUKE (fronta ho pustí až za ní); po fallbacku už leží v odhozu.
    const cardOf = (id) => (state?.luckyDukeState?.cards || []).find(c => c.id === id)
                        || dp.find(c => c.id === id) || null;

    // Panel je po dobu animace prázdný: stav (a s ním konec fáze LUCKY_DUKE) dorazí až
    // za celou cinematikou, takže by board.js jinak kreslil obě karty dál na slotech,
    // zatímco letí. `luckyDealIds` je přesně ten filtr, kterým je při rozdávání skrývá.
    reveal.forEach(rc => { App.luckyDealIds.add(rc.id); App.discardFlyHideIds.add(rc.id); });
    renderUI();
    const _luckyDiscard = discardTopPos();   // vrch odhozu, ať karty dosednou na hromádku
    const inDiscardNow = (id) => (state?.deck?.discardPile || []).some(c => c.id === id);

    // 1) NEvybraná(é) rovnou do odhozu – panel se uvolní a střed patří jen té zkoumané.
    // Depth POD hromádkovou vrstvou vybrané karty: nevybraná dosedne na odhoz jako první
    // a leží tam (holdUntil) po celou cinematiku, dokud nedorazí stav. S výchozím depth
    // (800) by přebila jak zvětšenou kartu uprostřed, tak její sestup do odhozu.
    reveal.forEach(rc => {
        if (rc === picked) return;
        animateCard(rc.x, rc.y, _luckyDiscard.x, _luckyDiscard.y, getCardTex(rc.id), LD_DROP_MS, () => {
            App.discardFlyHideIds.delete(rc.id); renderUI();
        }, { startScale: 0.65, endScale: PILE_SCALE, depth: REVEAL_PILE_DEPTH - 1,
             holdUntil: () => inDiscardNow(rc.id) });
    });

    // 2) Vybraná doprostřed → pulz → do odhozu (klasické sejmutí, viz startCheckReveal).
    const card = cardOf(picked.id);
    const sprite = gameScene.add.image(picked.x, picked.y, getCardTex(picked.id))
        .setScale(0.65).setDepth(820).setAlpha(0.98);
    let pulse = null;
    const stopPulse = () => {
        if (!pulse) return;
        if (pulse.tween) pulse.tween.remove();
        pulse.marks.forEach(m => m.destroy());
        pulse = null;
    };
    gameScene.tweens.add({
        targets: sprite, x: REVEAL_CX, y: REVEAL_CY, scaleX: REVEAL_BIG, scaleY: REVEAL_BIG,
        duration: LD_TO_CENTER_MS, ease: 'Cubic.easeOut',
        onComplete: () => { if (sprite.active && card) pulse = pulseCheckMark(REVEAL_CX, REVEAL_CY, REVEAL_BIG, card); }
    });
    gameScene.tweens.add({
        targets: sprite, x: _luckyDiscard.x, y: _luckyDiscard.y, scaleX: PILE_SCALE, scaleY: PILE_SCALE,
        delay: LD_TO_CENTER_MS + LD_HOLD_MS, duration: LD_TO_DISCARD_MS, ease: 'Cubic.easeIn',
        // Se začátkem sestupu jde karta z „reveal" vrstvy do vrstvy hromádky – výsledek
        // sejmutí (vězení/dynamit) letí za ní a musí dosednout NAD ni.
        onStart: () => { stopPulse(); sprite.setDepth(REVEAL_PILE_DEPTH); },
        onComplete: () => holdThenFinish(sprite, () => inDiscardNow(picked.id), () => {
            stopPulse();
            if (sprite.active) sprite.destroy();
            App.discardFlyHideIds.delete(picked.id);
            renderUI();
        })
    });
}




// ── DEBUG: galerie karet ──────────────────────────────────────────────────────
// ── Divoký západ – Zuřivá Doroty: katalog DRUHŮ karet ──────────────────
// Jmenuje se DRUH karty, ne konkrétní kus, takže se z dat balíčku vezme od každého
// jména první karta jako zástupce (distinctCardKinds, logic/entities.js). Server dělá
// pravděpodobně totéž ze svých dat (`_dorothyKinds`) – tady se berů z Phaser cache,
// aby se katalog nemusel vozit v každém broadcastu stavu.
//
// Cachuje se: seznam se během hry nemění (jen se zapnutým Dodge City je delší).
function clientCardKinds() {
    const dodge = !!state?.options?.expansions?.dodge_city;
    if (App._cardKinds && App._cardKindsDodge === dodge) return App._cardKinds;
    const base = gameScene?.cache?.json?.get('cards_data') || [];
    const dc = dodge ? (gameScene?.cache?.json?.get('cards_dodge_city_data') || []) : [];
    if (!base.length) return [];
    App._cardKindsDodge = dodge;
    App._cardKinds = distinctCardKinds(base.concat(dc));
    return App._cardKinds;
}

// Mřížka všech karet (miniatury z reálných textur card_<id>) + náhled vybrané karty
// ve 100 % (scale 1.0 = nativní velikost baked textury, CARD_TEX_W×H). Slouží k
// vizuální kontrole nového vykreslování (art + marky). Otevírá debug tlačítko.
function showCardGallery() {
    if (!gameScene) return;
    if (gameScene._gallery) { closeCardGallery(); return; }   // toggle
    ensureAllExpansionAssets();   // galerie ukazuje i karty rozšíření → dotáhni jejich art
    const g = gameScene.add.group();
    gameScene._gallery = g;
    // Galerie: základní karty + karty rozšíření (Dodge City), ať jdou zkontrolovat všechny.
    const _base = gameScene.cache.json.get('cards_data') || [];
    const _dodge = gameScene.cache.json.get('cards_dodge_city_data') || [];
    const data = (_base.length || _dodge.length) ? _base.concat(_dodge) : (App.allCardsData || []);

    const bg = gameScene.add.rectangle(960, 540, stageW(), stageH(), 0x000000, 0.92)
        .setDepth(3000).setInteractive();
    bg.on('pointerdown', closeCardGallery);   // klik mimo kartu = zavřít
    g.add(bg);

    const close = gameScene.add.text(1890, 18, '✕ Zavřít',
        { fontSize: '22px', color: '#fff', backgroundColor: '#600', padding: { x: 12, y: 6 } })
        .setOrigin(1, 0).setDepth(3003).setInteractive({ useHandCursor: true });
    close.on('pointerdown', closeCardGallery);
    g.add(close);

    // Náhled 100 % vpravo
    const previewX = 1330, previewY = 500;
    let big = null, label = null;
    const showBig = (card) => {
        if (big) big.destroy();
        if (label) label.destroy();
        big = gameScene.add.image(previewX, previewY, getCardTex(card.id)).setScale(1).setDepth(3001);
        g.add(big);
        const suit = { HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣', SPADES: '♠' }[card.suit] || card.suit;
        const usesNew = artKey(card) && gameScene.textures.exists(artKey(card))
            && valueMarkKey(card) && gameScene.textures.exists(valueMarkKey(card))
            && suitMarkKey(card) && gameScene.textures.exists(suitMarkKey(card));
        label = gameScene.add.text(previewX, previewY + CARD_TEX_H / 2 + 14,
            `${card.name}  ${card.value}${suit}   (id ${card.id}, art: ${card.art})\n` +
            (usesNew ? 'nová grafika (art + marky)' : 'FALLBACK – stará karta (chybí art/marky)'),
            { fontSize: '20px', color: usesNew ? '#8f8' : '#fb6', align: 'center',
              backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 10, y: 6 } })
            .setOrigin(0.5, 0).setDepth(3003);
        g.add(label);
    };

    // Mřížka miniatur vlevo
    const cols = 8, thumbScale = 0.135;
    const tw = CARD_TEX_W * thumbScale, th = CARD_TEX_H * thumbScale;
    const gx = 40, gy = 70, padX = 8, padY = 8;
    g.add(gameScene.add.text(gx, 30, 'Klikni na kartu → náhled 100 %',
        { fontSize: '18px', color: '#ccc' }).setDepth(3003));
    data.forEach((card, i) => {
        const cx = gx + (i % cols) * (tw + padX);
        const cy = gy + Math.floor(i / cols) * (th + padY);
        const t = gameScene.add.image(cx, cy, getCardTex(card.id))
            .setOrigin(0, 0).setScale(thumbScale).setDepth(3001)
            .setInteractive({ useHandCursor: true });
        t.on('pointerover', () => t.setTint(0xffff88));
        t.on('pointerout', () => t.clearTint());
        t.on('pointerdown', () => showBig(card));
        g.add(t);
    });

    if (data.length) showBig(data[0]);
}
function closeCardGallery() {
    if (gameScene && gameScene._gallery) {
        gameScene._gallery.destroy(true);   // zničí i děti (sprity/texty/rect)
        gameScene._gallery = null;
    }
}

// Chat systém je v chat.js (načteno po game.js)

// ── ZÁKLADNÍ FUNKCE PHASERU ──────────────────────────────────────────────

// ── Registr assetů + opakované načtení ───────────────────────────────────────
// Phaser na loader sice čeká, ale soubor, který skončí chybou (přerušené spojení
// na horší lince / mobilu), jen přeskočí – hra se pak sestaví se zelenými placeholdery
// a pomůže až F5. Proto jde KAŽDÉ načtení přes loadAsset() do registru AssetLoads a:
//   1) loaderror soubor rovnou zařadí zpátky do běžícího loaderu (cache-buster obejde
//      nakešovanou chybnou odpověď), pokud to má smysl (viz core/assetLoad.js),
//   2) create() před sestavením textur ověří, že jsou všechny assety v cache; když ne,
//      běží opravné kolo (ensureAssetsLoaded) s cedulí „Načítám…".
// Soubory, které na serveru nejsou (odpověď 4xx – typicky art karty, který ještě nemáme
// nakreslený), se neopakují: karta se poskládá z placeholderu a čekat na ně nemá smysl.
// Rozhoduje tedy HTTP status, ne seznam „nepovinných" souborů v kódu.
const AssetLoads = {};

function loadAsset(scene, kind, key, url) {
    // Klíč už registrovaný (art sdílený základní sadou a Dodge City) – drž první URL;
    // duplicitní klíč Phaser stejně přeskočí a případný retry má mířit na existující soubor.
    if (!AssetLoads[key]) AssetLoads[key] = { url, kind, attempts: 1, status: 0 };
    scene.load[kind](key, url);
}

// Je asset v cache? (obrázek → texture manager, JSON → json cache)
function assetInCache(scene, key, kind) {
    return kind === 'json' ? scene.cache.json.exists(key) : scene.textures.exists(key);
}

// Znovu zařadí asset do loaderu (další pokus s cache-busterem). Vrací false, když už nemá smysl.
function retryAsset(scene, key, status) {
    const info = AssetLoads[key];
    if (!info) return false;
    if (status != null) info.status = status;
    if (!shouldRetryAsset(info)) return false;
    info.attempts++;
    const url = retryAssetUrl(info.url, info.attempts);
    clog('warn', 'Asset se nenačetl, pokus č. ' + info.attempts, { key, url, status: info.status });
    scene.load[info.kind](key, url);
    return true;
}

function preload() {
    // Míň souběžných stahování = míň selhaných souborů. Phaser jich ve výchozím stavu
    // pouští 32 naráz; na slabší lince (mobil) se jich část utne a hra se pak sestaví
    // s placeholdery. Assetů je i tak přes stovku, takže při 8 paralelních to načítání
    // znatelně nezpomalí, ale výrazně sníží počet chyb, které musí opravovat retry.
    this.load.maxParallelDownloads = 8;

    // Kamera na jeviště hned v preloadu – bez toho by cedule „Načítám…" (souřadnice
    // 960,540) seděla vlevo od skutečného středu, dokud scénu nesestaví createScene.
    this.cameras?.main?.setScroll(-(App.stage?.dx || 0), -(App.stage?.dy || 0));

    // Cedule s průběhem – jinak je do konce načítání jen prázdné plátno.
    const loadTxt = this.add.text(960, 540, 'Načítám…', {
        fontFamily: 'Arial', fontSize: '34px', color: '#e8dcc0'
    }).setOrigin(0.5).setDepth(5000);
    this._loadingText = loadTxt;
    this.load.on('progress', p => {
        if (this._loadingText) this._loadingText.setText('Načítám… ' + Math.round(p * 100) + ' %');
    });

    // Pozadí ve 4K. Při paralelním stahování všech textur občas soubor skončí loaderror
    // → zůstala by holá barva plátna. Proto ho při chybě párkrát znovu zařadíme do fronty
    // s cache-busterem (obejde nakešovanou chybu). Retry běží, dokud loader v preloadu
    // ještě jede, takže se stihne než doběhne create(). (Dřív tu byl jako první pokus
    // fallback na background.png – ten v repu ani na hostingu není, takže jen plodil 404.)
    let bgRetries = 0;
    const BG_SRC = 'assets/background.webp';
    this.load.on('loaderror', function (file) {
        if (file.key === 'background' && bgRetries < 4) {
            bgRetries++;
            const src = BG_SRC + '?retry=' + bgRetries;
            clog('warn', 'Pozadí se nenačetlo, pokus č. ' + bgRetries, { src });
            this.load.image('background', src);
            return;
        }
        // Status z XHR (Phaser načítá obrázky přes XHR): 404 = soubor tam není, 0/5xx = výpadek.
        const status = (file.xhrLoader && file.xhrLoader.status) || 0;
        if (retryAsset(this, file.key, status)) return;
        clog('warn', 'Chybí textura, použije se placeholder', { src: file.src, status });
    }, this);

    loadAsset(this, 'image', 'background', BG_SRC);
    loadAsset(this, 'image', 'logo', 'assets/logo.webp');
    loadAsset(this, 'image', 'card_back', 'assets/other_cards/playing_card_back.webp');
    loadAsset(this, 'image', 'placeholder', 'assets/card_placeholder.webp');
    loadAsset(this, 'image', 'colt_.45', 'assets/other_cards/colt_.45.webp');

    // Nové vykreslování: data karet + art druhů (assets/card_art/<art>.webp) + marky
    // hodnoty/barvy (assets/card_marks/*.webp). Art/marky se doplní do fronty, jakmile
    // je JSON načtený (chybějící art jen zaloguje loaderror → karta z placeholderu).
    loadAsset(this, 'json', 'cards_data', 'cards.json');
    this.load.on('filecomplete-json-cards_data', (key, type, data) => {
        // Soubory: card_art/<art>.webp, card_marks/<hodnota>.webp (Q.webp, 10.webp…) a
        // card_marks/<barva>.webp (hearts.webp…). Texturové klíče drží prefix (art_/value_/suit_).
        distinctArtKeys(data).forEach(a => loadAsset(this, 'image', 'art_' + a, `assets/card_art/${a}.webp`));
        ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].forEach(v =>
            loadAsset(this, 'image', 'value_' + v, `assets/card_marks/${v}.webp`));
        ['hearts', 'diamonds', 'clubs', 'spades'].forEach(s =>
            loadAsset(this, 'image', 'suit_' + s, `assets/card_marks/${s}.webp`));
    });

    // Data karet rozšíření (JSON je malý, art se dotahuje až se zapnutým rozšířením –
    // viz loadExpansionAssets). Bez dat by nešla postavit debug galerie ani zapéct textury.
    loadAsset(this, 'json', 'cards_dodge_city_data', 'cards.dodge_city.json');
    loadAsset(this, 'json', 'cards_high_noon_data', 'cards.high_noon.json');
    loadAsset(this, 'json', 'cards_fistful_data', 'cards.fistful.json');
    loadAsset(this, 'json', 'cards_divoky_zapad_data', 'cards.divoky_zapad.json');

    loadAsset(this, 'json', 'characters_data', 'characters.json');
    for (let i = 0; i <= 15; i++) {   // 0–15 základ; 16–30 (Dodge City) až s rozšířením
        let paddedId = i.toString().padStart(3, '0');
        loadAsset(this, 'image', 'char_' + i, `assets/characters/${paddedId}.webp`);
    }

    loadAsset(this, 'image', 'lives', 'assets/other_cards/lives.webp');
    loadAsset(this, 'image', 'role_card_back', 'assets/other_cards/role_card_back.webp');
    // Karty rolí jsou dodané ve 2× (650×1000) → v createScene se srovnají na 325×500
    // (normalizeTexture), takže se všude kreslí ve stejném měřítku jako dřív.
    // Klíč zůstal číselný (role_000…003 = mapa RoleImages), soubor nese jméno role.
    loadAsset(this, 'image', 'role_000', 'assets/roles/sceriffo.webp');   // Sheriff
    loadAsset(this, 'image', 'role_001', 'assets/roles/bandita.webp');    // Outlaw
    loadAsset(this, 'image', 'role_002', 'assets/roles/odpadlik.webp');   // Renegade
    loadAsset(this, 'image', 'role_003', 'assets/roles/vice.webp');       // Deputy
    loadAsset(this, 'image', 'sheriff_star', 'assets/other_cards/sheriff_star.webp');
}

// Počká, dokud nejsou v cache VŠECHNY assety, které na serveru jsou – co při preloadu
// spadlo, zkusí znovu v dalších kolech loaderu (max ASSET_REPAIR_ROUNDS). Teprve pak
// pustí `done`, takže buildCardTextures nikdy nezapeče placeholder jen kvůli výpadku
// sítě. Když se to ani po všech kolech nepovede, hra se rozjede jako dřív (placeholdery)
// – radši hrát s placeholdery než viset na černé obrazovce.
// POZOR: volat JEN před buildCardTextures (ten už z načtených artů peče card_<id>).
function ensureAssetsLoaded(scene, done, round) {
    round = round || 1;
    const missing = missingAssets(AssetLoads, (key, kind) => assetInCache(scene, key, kind));
    if (!missing.length || round > ASSET_REPAIR_ROUNDS) {
        if (missing.length) clog('warn', 'Assety se nedonačetly, jede se s placeholdery', { missing: missing.slice(0, 20), count: missing.length });
        done();
        return;
    }
    clog('warn', 'Donačítám chybějící assety, kolo ' + round, { missing: missing.slice(0, 20), count: missing.length });
    if (scene._loadingText) scene._loadingText.setText('Načítám… (' + missing.length + ')');

    // Do dalšího kola pusť i ty, které už vyčerpaly pokusy v preloadu – tady chceme
    // soubory dotáhnout za každou cenu, jen s omezeným počtem kol.
    for (const key of missing) {
        const info = AssetLoads[key];
        info.attempts++;
        info.maxAttempts = info.attempts + ASSET_MAX_ATTEMPTS;   // uvolni strop pro loaderror retry
        scene.load[info.kind](key, retryAssetUrl(info.url, info.attempts));
    }
    scene.load.once('complete', () => ensureAssetsLoaded(scene, done, round + 1));
    scene.load.start();
}

// ── Assety rozšíření: dotahují se AŽ když je rozšíření ve hře ───────────────────
// Art Dodge City (27 MB) a jeho portréty postav (18 MB) tvoří většinu stahování, ale hrají
// se jen v části her. Preload proto bere jen základ; jakmile klient uvidí zapnuté rozšíření
// (options v room_update, nebo debug obrazovka), dotáhne jeho soubory za běhu a TEPRVE PAK
// zapeče jejich textury – kdyby se pekly dřív, zůstal by v nich natrvalo placeholder.
const ExpansionAssets = {};      // exp -> 'loading' | 'done'
let _expLoading = false;
const _expQueue = [];

// Každý loader zařadí své soubory do loaderu a vrátí callback, který se zavolá,
// až jsou v cache (normalizace velikostí, zapečení textur karet).
const EXPANSION_LOADERS = {
    dodge_city(scene) {
        const data = scene.cache.json.get('cards_dodge_city_data') || [];
        // Art se sdíleným slugem se základem (bang…) se nenačítá znovu – klíč art_<slug>
        // už drží základní karta (duplicitní klíč Phaser přeskočí), takže „reskin" karty
        // rozšíření použijí základní art + domalovaný býk.
        distinctArtKeys(data).forEach(a => loadAsset(scene, 'image', 'art_' + a, `assets/card_art/dodge_city/${a}.webp`));
        loadAsset(scene, 'image', 'mark_dodge_city', 'assets/card_marks/dodge_city.webp');
        for (let i = 16; i <= 30; i++) {
            loadAsset(scene, 'image', 'char_' + i, `assets/characters/${i.toString().padStart(3, '0')}.webp`);
        }
        return {
            // Bez artu jsou karty rozšíření placeholder – kritické je proto všechno,
            // co se kreslí hned (marka býka + první karty v ruce).
            critical: ['mark_dodge_city'],
            done: () => {
                normalizeCharTextures(scene, 16, 30);
                buildCardTextures(scene, data);
            },
        };
    },

    high_noon(scene) {
        // Karty událostí nejsou hrací karty – nepečou se z artu + marek, kreslí se
        // rovnou jako hotový obrázek (klíč hn_<art>). Rub balíčku má vlastní texturu.
        const data = scene.cache.json.get('cards_high_noon_data') || [];
        // Pořadí ve frontě loaderu = pořadí stahování. Rub balíčku a Pravé poledne se
        // ukazují hned v intru (hromádka + odložená karta), takže musí být první;
        // zbytek karet se stihne dotáhnout, než šerif první událost odkryje.
        loadAsset(scene, 'image', 'hn_back', 'assets/other_cards/high_noon/high_noon_back.webp');
        const noon = data.find(c => c.key === 'PRAVE_POLEDNE');
        if (noon) loadAsset(scene, 'image', 'hn_' + noon.art, `assets/high_noon_cards/${noon.art}.webp`);
        data.forEach(c => loadAsset(scene, 'image', 'hn_' + c.art, `assets/high_noon_cards/${c.art}.webp`));
        return {
            // Kritické = co je vidět hned v intru: rub balíčku a odložené Pravé poledne.
            critical: ['hn_back'].concat(noon ? ['hn_' + noon.art] : []),
            done: () => {
                // Dodané ve 2× (650×1000) → srovnat na 325×500, ať platí stejná měřítka
                // jako u ostatních karet na stole.
                normalizeTexture(scene, 'hn_back');
                data.forEach(c => normalizeTexture(scene, 'hn_' + c.art));
            },
        };
    },

    fistful(scene) {
        // Druhý balíček událostí – všechno stejně jako u High Noonu, jen s prefixem ff_.
        // Navíc má rozšíření 3 postavy (portréty 031–033), které se dotahují taky až tady.
        const data = scene.cache.json.get('cards_fistful_data') || [];
        loadAsset(scene, 'image', 'ff_back', 'assets/other_cards/fistful/fistful_back.webp');
        // Karta Fistful of Cards se ukazuje hned v intru (odložená vedle balíčku), takže
        // musí být ve frontě loaderu první; zbytek se stihne, než šerif první událost odkryje.
        const first = data.find(c => c.key === 'FISTFUL_OF_CARDS');
        if (first) loadAsset(scene, 'image', 'ff_' + first.art, `assets/fistful_cards/${first.art}.webp`);
        data.forEach(c => loadAsset(scene, 'image', 'ff_' + c.art, `assets/fistful_cards/${c.art}.webp`));
        for (let i = 31; i <= 33; i++) {
            loadAsset(scene, 'image', 'char_' + i, `assets/characters/${i.toString().padStart(3, '0')}.webp`);
        }
        return {
            critical: ['ff_back'].concat(first ? ['ff_' + first.art] : []),
            done: () => {
                // Dodané ve 2× (650×1000) → srovnat na 325×500 jako ostatní karty.
                normalizeTexture(scene, 'ff_back');
                data.forEach(c => normalizeTexture(scene, 'ff_' + c.art));
                normalizeCharTextures(scene, 31, 33);
            },
        };
    },

    divoky_zapad(scene) {
        // Třetí balíček událostí – všechno stejně jako u High Noonu/Fistfulu, jen
        // s prefixem wws_. Rozšíření má navíc 8 postav (portréty 034–041).
        const data = scene.cache.json.get('cards_divoky_zapad_data') || [];
        loadAsset(scene, 'image', 'wws_back', 'assets/other_cards/divoky_zapad/divoky_zapad.webp');
        // Karta Divoký západ se ukazuje hned v intru (odložená vedle balíčku), takže
        // musí být ve frontě loaderu první; zbytek se stihne, než ji někdo odkryje.
        const first = data.find(c => c.key === 'DIVOKY_ZAPAD');
        if (first) loadAsset(scene, 'image', 'wws_' + first.art, `assets/divoky_zapad_cards/${first.art}.webp`);
        data.forEach(c => loadAsset(scene, 'image', 'wws_' + c.art, `assets/divoky_zapad_cards/${c.art}.webp`));
        for (let i = 34; i <= 41; i++) {
            loadAsset(scene, 'image', 'char_' + i, `assets/characters/${i.toString().padStart(3, '0')}.webp`);
        }
        return {
            critical: ['wws_back'].concat(first ? ['wws_' + first.art] : []),
            done: () => {
                // Dodané ve 2× (650×1000) → srovnat na 325×500 jako ostatní karty.
                normalizeTexture(scene, 'wws_back');
                data.forEach(c => normalizeTexture(scene, 'wws_' + c.art));
                normalizeCharTextures(scene, 34, 41);
            },
        };
    },
};

// Dotáhne assety jednoho rozšíření (idempotentní). Rozšíření se řadí do fronty a načítají
// po jednom – dvě souběžná scene.load.start() by si šlapala po 'complete'.
function loadExpansionAssets(scene, exp) {
    if (!scene || !EXPANSION_LOADERS[exp]) return;
    // Už načtené (jiná hra ve stejné relaci) – jen znovu potvrď serveru připravenost.
    if (ExpansionAssets[exp] === 'done') { try { socket.emit('expansion_ready', { exp }); } catch (_) {} return; }
    if (ExpansionAssets[exp]) return;
    ExpansionAssets[exp] = 'loading';
    _expQueue.push(exp);
    _pumpExpansionQueue(scene);
}

function _pumpExpansionQueue(scene) {
    if (_expLoading || !_expQueue.length) return;
    const exp = _expQueue.shift();
    _expLoading = true;
    clog('info', 'Dotahuji assety rozšíření', { exp });
    let spec;
    try { spec = EXPANSION_LOADERS[exp](scene); }
    catch (e) { _expLoading = false; clog('error', 'Assety rozšíření: chyba fronty', { exp, e: String(e) }); return; }
    _reportWhenCritical(scene, exp, spec.critical || []);
    scene.load.once('complete', () => {
        // Stejná oprava výpadků jako po preloadu: co spadlo, zkusí se znovu.
        ensureAssetsLoaded(scene, () => {
            try { spec.done(); } catch (e) { clog('error', 'Assety rozšíření: chyba dokončení', { exp, e: String(e) }); }
            ExpansionAssets[exp] = 'done';
            _expLoading = false;
            renderUI();
            _pumpExpansionQueue(scene);
        });
    });
    scene.load.start();
}

// Jakmile jsou v cache KLÍČOVÉ textury rozšíření (rub balíčku a spol.), řekni to serveru –
// ten na ně čeká se startem hry, aby nikomu neproblikl placeholder. Zbytek artu se
// dotahuje dál na pozadí. Po limitu se ohlásí tak jako tak (soubor může chybět natrvalo).
function _reportWhenCritical(scene, exp, keys) {
    let waited = 0;
    const tick = () => {
        const ready = keys.every(k => scene.textures.exists(k));
        if (ready || waited > 40000) {
            if (!ready) clog('warn', 'Klíčové textury rozšíření chybí, hlásím připravenost i tak', { exp, keys });
            try { socket.emit('expansion_ready', { exp }); } catch (_) { /* offline */ }
            return;
        }
        waited += 250;
        setTimeout(tick, 250);
    };
    tick();
}

// Podle options ze serveru (room.options / gameState.options) dotáhni, co je zapnuté.
function ensureExpansionAssetsFor(options) {
    const exps = options && options.expansions;
    if (!exps || !gameScene) return;
    Object.keys(EXPANSION_LOADERS).forEach(exp => { if (exps[exp]) loadExpansionAssets(gameScene, exp); });
}

// Debug/kreativní režim ukazuje karty všech rozšíření → potřebuje všechen art.
function ensureAllExpansionAssets() {
    if (!gameScene) return;
    Object.keys(EXPANSION_LOADERS).forEach(exp => loadExpansionAssets(gameScene, exp));
}

// Složí textury card_<id> z art druhu + marek hodnoty/barvy. Když art chybí (ještě není
// nakreslený, nebo se nestáhl), poskládá kartu z placeholderu + názvu + marek – texturu
// dostane KAŽDÁ karta, žádná nikdy nezůstane na rubu (getCardTex by jinak vrátil
// 'card_back' a karta by ve hře byla k nerozeznání od zakryté). Volá se v create() pro
// základní karty a pak znovu pro každé rozšíření, až doteče jeho art (loadExpansionAssets).
// Výsledná textura má rozměr CARD_TEX_W×H (teď = současné velikosti).
// `cardList` = které karty zapéct. Bez něj se berou základní karty (cards_data); karty
// rozšíření se pečou zvlášť, až doteče jejich art (viz loadExpansionAssets) – jinak by se
// jim natrvalo zapekl placeholder.
// Vykreslí OBSAH jedné karty do připravené RenderTextury: art druhu (nebo nouzový
// placeholder + název) + marky hodnoty/barvy + symbol rozšíření. `sKey` = marka barvy,
// která se má ZAPÉCT – volající tím rozhoduje, jestli platí přebarvení (Požehnání/Prokletí),
// nebo vytištěná barva. Vytažené z buildCardTextures, aby šla stejnou cestou upéct
// i varianta s vytištěnou barvou pro Peyote (viz printedSuitTex).
function paintCardTexture(scene, rt, card, sKey) {
    const W = CARD_TEX_W, H = CARD_TEX_H, L = MARK_LAYOUT;
    const aKey = artKey(card), vKey = valueMarkKey(card);
    const hasArt = !!aKey && scene.textures.exists(aKey);
    const isExp = card.exp || null;
    const drawMarks = () => {
        // marky do levého dolního rohu (hodnota, vedle ní barva); origin(0,1) = kotva vlevo dole
        if (vKey && scene.textures.exists(vKey)) {
            const val = scene.make.image({ key: vKey, add: false }).setOrigin(0, 1).setScale(L.scale);
            rt.draw(val, L.valX, L.valY);
            if (sKey && scene.textures.exists(sKey)) {
                const suit = scene.make.image({ key: sKey, add: false }).setOrigin(0, 1).setScale(L.scale);
                rt.draw(suit, L.valX + val.displayWidth + L.gap, L.suitY);
                suit.destroy();
            }
            val.destroy();
        }
    };
    if (hasArt) {
        // Hlavní cesta: art druhu + marky hodnoty/barvy. Marky se kreslí každá zvlášť,
        // takže i kdyby některá chyběla, art se použije (lepší než náhradní karta).
        const art = scene.make.image({ key: aKey, add: false }).setOrigin(0, 0);
        art.setDisplaySize(W, H);
        rt.draw(art, 0, 0); art.destroy();
        drawMarks();
    } else {
        // Nouzová cesta (art druhu chybí): placeholder + název nahoře + marky. Stejně
        // jako u karet rozšíření bez artu, ale býka dostanou dál jen karty rozšíření.
        const ph = scene.make.image({ key: 'placeholder', add: false }).setOrigin(0, 0);
        ph.setDisplaySize(W, H);
        rt.draw(ph, 0, 0); ph.destroy();
        const nameTxt = scene.make.text({ x: 0, y: 0, add: false, text: card.name || '', style: {
            fontFamily: 'Arial', fontSize: '30px', color: '#1a1a1a', fontStyle: 'bold',
            align: 'center', wordWrap: { width: W * 0.86 }
        } }).setOrigin(0.5, 0);
        rt.draw(nameTxt, W / 2, H * 0.06); nameTxt.destroy();
        drawMarks();
    }
    // Symbol rozšíření (býk) do pravého horního rohu. Jen Dodge City – jiná rozšíření
    // mají vlastní (nebo žádnou) marku, býka by dostat nesměla.
    if (isExp === 'dodge_city' && scene.textures.exists('mark_dodge_city')) {
        const bull = scene.make.image({ key: 'mark_dodge_city', add: false }).setOrigin(1, 0).setScale(L.bullScale);
        rt.draw(bull, L.bullX, L.bullY); bull.destroy();
    }
}

function buildCardTextures(scene, cardList) {
    const allData = cardList || scene.cache.json.get('cards_data');
    if (!allData) { clog('error', 'cards_data nenačteno – karty zůstanou na rubu'); return; }
    const W = CARD_TEX_W, H = CARD_TEX_H;
    scene._cardRTs = scene._cardRTs || {};
    // Který seznam se kdy pekl – přepečení při Požehnání/Prokletí musí projít všechny
    // (základ + rozšíření, jejichž art se mezitím dotáhl).
    scene._bakedCardLists = scene._bakedCardLists || [];
    if (!scene._bakedCardLists.includes(allData)) scene._bakedCardLists.push(allData);
    // High Noon – Požehnání/Prokletí: marka barvy se přebíjí pro VŠECHNY karty.
    const overrideSKey = scene._suitOverride ? 'suit_' + SUIT_SLUG[scene._suitOverride] : null;
    const missingArt = [];   // karty složené z placeholderu (chybí art) – do logu
    for (const card of allData) {
        const aKey = artKey(card);
        if (!(aKey && scene.textures.exists(aKey))) missingArt.push(card.id + ':' + (card.name || '?'));
        // PŘEPEČENÍ (Požehnání/Prokletí) kreslí do STEJNÉ RenderTextury, jen ji vyčistí.
        // Texturu `card_<id>` tím nikdy nerušíme – dřív se odstranila a založila znovu pod
        // stejným klíčem, jenže sprity, které renderUI nepřekreslí (letící karty držené na
        // cíli, klouzající karty při přeskládání ruky, zvětšení), si držely tu ZAHOZENOU:
        // při dalším snímku pak renderer sáhl na uvolněnou GL texturu a spadl – hra ztuhla
        // nebo zůstala hnědá obrazovka. Navíc se tím ušetří ~100 nových RT (a framebufferů)
        // na každou změnu události.
        let rt = scene._cardRTs[card.id];
        if (rt) rt.clear();
        else {
            // Klíč bez vlastní RT (neměl by nastat) – ať saveTexture nekoliduje.
            if (scene.textures.exists('card_' + card.id)) scene.textures.remove('card_' + card.id);
            rt = scene.make.renderTexture({ width: W, height: H }, false);
            scene._cardRTs[card.id] = rt;        // RT drží texturu → nedestruovat
            rt.saveTexture('card_' + card.id);   // getCardTex/getTex beze změny
        }
        paintCardTexture(scene, rt, card, overrideSKey || suitMarkKey(card));
    }
    if (missingArt.length) {
        clog('warn', 'Karty bez artu složené z placeholderu: ' + missingArt.length,
             { cards: missingArt.slice(0, 30) });
    }
}

// ── High Noon: Požehnání / Prokletí přebarvují VŠECHNY karty ───────────────────
// Karty se nepřebarvují jen v pravidlech (GameState._effSuit), ale i vizuálně – jinak by
// se hráč rozhodoval podle vytištěné barvy, která zrovna neplatí. Přepeče se OBSAH stejných
// textur card_<id> (buildCardTextures kreslí do téže RenderTextury), takže i sprity vzniklé
// dřív ukazují novou barvu samy od sebe – textura se nikdy neruší.
function suitOverrideForEvent(key) {
    if (key === 'POZEHNANI') return 'HEARTS';
    if (key === 'PROKLETI') return 'SPADES';
    return null;
}

// Marka barvy, která má být na kartě VIDĚT. Používá ji i pulzující zvýraznění při snímání
// (pulseCheckMark) – jinak by se přes kartu zapečenou jako piková překryla vytištěná srdcová.
function effSuitMarkKey(card) {
    const ov = gameScene && gameScene._suitOverride;
    return ov ? 'suit_' + SUIT_SLUG[ov] : suitMarkKey(card);
}

// Textura karty s VYTIŠTĚNOU barvou. Potřebuje ji jediné místo v pravidlech, které se
// vytištěnou barvou řídí – Peyote (A Fistful of Cards): tipuje se proti tomu, co je na
// kartě natištěné, takže pod Požehnáním/Prokletím nesmí odkrytá karta ukázat přebarvenou
// marku ani při odkrývání z balíčku, ani za letu do ruky/odhozu (přebarvení pro ni začne
// platit až tam, kde dosedne). Bez override je to prostě běžná textura; jinak se JEDNOU
// upeče varianta `card_<id>_printed` – její obsah se nikdy nemění (vytištěná barva je
// konstanta), takže se nechává nacachovaná i po přepečení všech ostatních karet.
function printedSuitTex(card) {
    if (!gameScene || !card) return 'card_back';
    if (!gameScene._suitOverride) return getCardTex(card.id);
    const key = 'card_' + texIdOf(card.id) + '_printed';
    gameScene._printedRTs = gameScene._printedRTs || {};
    if (!gameScene._printedRTs[key]) {
        const rt = gameScene.make.renderTexture({ width: CARD_TEX_W, height: CARD_TEX_H }, false);
        gameScene._printedRTs[key] = rt;   // RT drží texturu → nedestruovat
        rt.saveTexture(key);
        paintCardTexture(gameScene, rt, card, suitMarkKey(card));
    }
    return key;
}

// Idempotentní: když se platná barva nemění, neudělá nic. Volá se z cinematiky odkrytí
// (během výdrže karty uprostřed obrazovky, kdy se nic jiného neanimuje) i z
// _applyRoomUpdate jako pojistka, kdyby animace nedorazila.
function applySuitOverride(scene, suitKey) {
    const want = suitKey || null;
    if (!scene || (scene._suitOverride || null) === want) return;
    scene._suitOverride = want;
    // Zvětšení karty zhasni: obsah textury se pod ním změní, což u nehybného náhledu
    // vypadá jako „karta se sama přebarvila". Po najetí kurzorem naskočí znovu, správně.
    stopCardZoom();
    (scene._bakedCardLists || []).forEach(list => buildCardTextures(scene, list));
    renderUI();
}

// Textura dodaná ve 2× rozlišení (650×1000) srovnaná na standardních 325×500 – přerenderuje
// se do menší canvas textury pod stejným klíčem, takže veškeré vykreslování (stejné scale
// jako u ostatních karet/portrétů) funguje beze změny.
function normalizeTexture(scene, key) {
    if (!scene.textures.exists(key)) return;
    const src = scene.textures.get(key).getSourceImage();
    if (!src || src.width <= 400) return;   // už v normální velikosti
    const w = Math.round(src.width / 2);
    const h = Math.round(src.height / 2);
    scene.textures.remove(key);
    const canvasTex = scene.textures.createCanvas(key, w, h);
    canvasTex.context.drawImage(src, 0, 0, w, h);
    canvasTex.refresh();
}

// Portréty postav (016–030 z Dodge City jsou dodané ve 2×) srovnané na 325×500.
function normalizeCharTextures(scene, from = 0, to = 30) {
    for (let i = from; i <= to; i++) normalizeTexture(scene, 'char_' + i);
}

// Karty rolí (assets/roles/*.webp jsou dodané ve 2×) srovnané na 325×500 – kreslí se
// na desce, v intru i při odhalení role vedle běžných karet, takže musí mít stejnou
// velikost textury jako ony (jinak by se musela půlit měřítka na všech těch místech).
function normalizeRoleTextures(scene) {
    for (let i = 0; i <= 3; i++) normalizeTexture(scene, 'role_' + i.toString().padStart(3, '0'));
}

function create() {
    // Nejdřív dotáhni, co při preloadu spadlo (jinak by se zapekly placeholdery), teprve
    // pak postav scénu. gameScene se nastaví až v createScene – dokud je null, renderUI
    // volané ze socketu (lobby_list…) se samo přeskočí a překreslí se po startu.
    ensureAssetsLoaded(this, () => createScene.call(this));
}

// Vlastní sestavení scény. Běží až jsou assety v cache (viz ensureAssetsLoaded), jinak
// beze změny – `this` je scéna, stejně jako dřív v create().
function createScene() {
    if (this._loadingText) { this._loadingText.destroy(); this._loadingText = null; }

    gameScene = this;

    // Kamera musí sedět na jevišti dřív, než se cokoli nakreslí.
    applyStage();

    normalizeCharTextures(this);
    normalizeRoleTextures(this);
    buildCardTextures(this);

    // Pozadí i závoj se roztahují přes CELÉ jeviště (tedy i přes pruhy po stranách,
    // které při širším poměru stran přibyly) – jinak by z nich prosvítala holá výplň
    // plátna. Obrázek se škáluje jako CSS „cover", ať se nedeformuje.
    // Kdyby se pozadí ani po retry nenačetlo, nevkládej „rozbitou" texturu (zelený
    // placeholder) – radši nech tmavou výplň, přes kterou stejně leží bgScrim.
    if (this.textures.exists('background')) {
        let bg = this.add.image(960, 540, 'background');
        const cover = stageCoverSize();
        bg.setDisplaySize(cover.w, cover.h);
        gameScene.bgImage = bg;
    } else {
        gameScene.bgFill = this.add.rectangle(960, 540, stageW(), stageH(), 0x2a1c10);
    }

    // Ztmavovací závoj přes pozadí kvůli čitelnosti (obrázek pozadí je místy světlý/rušný
    // a text nad ním nešel přečíst). Persistentní – NENÍ v cardsSprites, takže ho renderUI
    // nemaže; jen mu tam měníme průhlednost (menu/výsledky tmavší, herní stůl jemnější).
    gameScene.bgScrim = this.add.rectangle(960, 540, stageW(), stageH(), 0x0e0b14).setAlpha(0.55);

    gameScene.cardsSprites = this.add.group();
    // Separatni skupina pro intro animace - necisti se pri renderUI
    gameScene.introSprites = this.add.group();

    // Hover vyhodnocuj KAŽDÝ snímek, ne jen při pohybu myši. renderUI stůl překresluje
    // (staré sprity zničí, nové vytvoří); s výchozím „poll on move" by po cizí akci
    // zvýraznění karty pod nehybným kurzorem zmizelo, dokud uživatel nepohne myší. Takto
    // Phaser znovu vyvolá pointerover na nově vytvořeném spritu i bez pohybu.
    this.input.setPollAlways();

    document.addEventListener('fullscreenchange', () => { if (gameScene) renderUI(); });

    // Dotykový displej / úzké okno: než hráč uvidí menu, ať si vybere rozložení desky.
    // Ptáme se jen jednou (volba se pamatuje) a jen když v menu opravdu jsme – po
    // reloadu uprostřed hry rejoin roomState nastaví a menu se vůbec nekreslí.
    if (shouldAskLayoutNow()) App.menuScreen = 'ui_choice';

    renderUI();

    // Fonty (Oswald) se načítají z CDN asynchronně. Immediate-mode render mohl padnout
    // na systémový fallback; po dokončení načtení překreslíme správným fontem.
    if (document.fonts && document.fonts.load) {
        Promise.all([
            document.fonts.load("700 24px 'Oswald'"),
            document.fonts.load("600 24px 'Oswald'"),
            document.fonts.load("400 20px 'Oswald'"),
        ]).then(() => { if (gameScene) renderUI(); }).catch(() => {});
    }
}

function update() {
    _tickVeraPortraits();
    // AŽ za Verou: útočící Vera Custer (kopíruje Slaba) je v obou seznamech a blikání
    // útočníka musí přebít barvu, kterou jí nastaví _tickVeraPortraits.
    _tickAttackPulse();
    _tickCardZoom();
}

// Slab the Killer útočí: jeho postava (obarvená ATTACK_TINT ve view/board.js) bliká,
// ať cíl hned vidí, že jedno Vedle! nestačí. Řízeno hodinami (Date.now) → stejná fáze
// pro každého i po překreslení; seznam staví renderGameBoard (App.attackPulse).
const ATTACK_PULSE_MS = 620;
function _tickAttackPulse() {
    const list = App.attackPulse;
    if (!list || !list.length) return;
    // Plynulý přechod bílá ↔ červená (žádné skoky ani mizení karty).
    const t = Math.abs(Math.sin((Date.now() % (ATTACK_PULSE_MS * 2)) / ATTACK_PULSE_MS * Math.PI));
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(0xffffff),
        Phaser.Display.Color.IntegerToColor(0xff3333),
        100, Math.round(t * 100));
    const tint = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    for (const sp of list) {
        if (sp && sp.active) sp.setTint(tint);
    }
}

// Vera Custer: portrét u jejího místa cyklicky střídá kopírovanou postavu a vlastní
// Veru, ať všichni vidí (a poznají), koho zrovna kopíruje – bez zabírání dalšího místa.
//   ~8 s: kopírovaná postava, jemně bliká (velmi slabý zelený nádech) = „zvýrazněná,
//         ale není to ona" (žádná průhlednost ani zvětšování – jen barva)
//   ~2 s: čistá Vera Custer bez zvýraznění (obnoví se původní obarvení, pokud bylo)
// Mezi oběma stavy PLYNULÝ přechod – vodorovné překlopení (scaleX 1→0→1), textura se
// vymění v půlce (když je karta „na hraně"), takže žádný tvrdý skok.
// Řízeno hodinami (Date.now) → stejná fáze pro každého i po překreslení. Portréty
// registruje renderGameBoard (App.veraPortraits); mrtvé/překreslené sprity přeskoč.
function _tickVeraPortraits() {
    const list = App.veraPortraits;
    if (!list || !list.length) return;
    const CYCLE = 10000, COPY_MS = 8000, TR = 480, H = TR / 2;   // TR = délka překlopení
    const t = Date.now() % CYCLE;

    // Velmi jemný pulzující zelený nádech. Vychází ze SOUČASNÉHO obarvení portrétu
    // (baseTint), ne z bílé: hráč na tahu má postavu zvýrazněnou zeleně (0x88ff88) a to
    // musí platit i ve chvíli, kdy je na jejím místě vidět kopírovaná postava – jinak by
    // Vera během „cizí" fáze vypadala, že na tahu není. Pulz jen sráží červený a modrý
    // kanál (zelený drží), takže barva zůstane a jen lehce probliká.
    const s = Math.abs(Math.sin(t / 300));
    const f = 1 - s * (1 - 0xdd / 0xff);               // 100 % → 86,7 % (slabý nádech)
    const greenTintFrom = (base) => {
        const b = (base == null) ? 0xffffff : base;
        const r = Math.round(((b >> 16) & 0xff) * f);
        const g = (b >> 8) & 0xff;
        const bl = Math.round((b & 0xff) * f);
        return (r << 16) | (g << 8) | bl;
    };

    // Urči zobrazený stav + faktor překlopení (flip). Přechody jsou na hranicích
    // t=8000 (kopie→Vera) a t=0≡10000 (Vera→kopie), okno ±H.
    let showCopy, flip = 1;
    const d8 = t - COPY_MS;                              // vzdálenost k hranici 8000
    const d0 = t < CYCLE / 2 ? t : t - CYCLE;            // znaménková vzdálenost k 0/10000
    if (Math.abs(d8) < H) {
        const p = (d8 + H) / TR;                         // 0..1
        flip = Math.abs(Math.cos(p * Math.PI));
        showCopy = p < 0.5;                             // z kopie do Very
    } else if (Math.abs(d0) < H) {
        const p = (d0 + H) / TR;
        flip = Math.abs(Math.cos(p * Math.PI));
        showCopy = p >= 0.5;                            // z Very do kopie
    } else {
        showCopy = t < COPY_MS;
    }

    for (const v of list) {
        const sp = v.sprite;
        if (!sp || !sp.active) continue;
        const tex = showCopy ? v.copyTex : v.selfTex;
        if (tex && sp.texture.key !== tex) sp.setTexture(tex);
        if (showCopy) sp.setTint(greenTintFrom(v.baseTint));
        else if (v.baseTint != null) sp.setTint(v.baseTint);
        else sp.clearTint();
        sp.scaleX = v.baseScaleX * flip;
    }
}

// getPlayerPosition je v positions.js

// POZOR: klientský `state` je prostý JSON objekt z payload.gameState (NE instance
// GameState), takže nemá metody. Proto používáme čisté funkce computeDistance/computeCanHit
// z core/distance.js (načteno před game.js), které počítají nad prostým objektem {players}.

const RoleImages = {
    "Sheriff": "role_000",
    "Outlaw": "role_001",
    "Renegade": "role_002",
    "Deputy": "role_003"
};



// Helper pro přidání prvků do modálních overlayů (depth nad reshufflem)
function mAdd(obj, depth = 201) {
    if (obj && obj.setDepth) obj.setDepth(depth);
    gameScene.cardsSprites.add(obj);
    return obj;
}

function renderUI() {
    if (!gameScene) return;

    // Kreslila deska v předchozím renderu? Reflow slide (klouzání karet z minulé pozice)
    // smí navazovat jen na PŘEDCHOZÍ render desky – po intru / výběru postav / menu /
    // vítězné obrazovce jsou uložené pozice z jiné hry a musí se zahodit (viz níž).
    const _boardWasShown = App.boardShown;
    App.boardShown = false;

    const isSpectator = myIndex === null && !!state;

    gameScene.cardsSprites.clear(true, true);
    // POZN.: zoom karty tu ZÁMĚRNĚ nerušíme. renderUI běží i při cizí akci a tvrdý
    // stopCardZoom() by resetoval odpočet/zvýraznění karty pod nehybným kurzorem. Zoom je
    // klíčovaný identitou karty (_zoomKey) a uklízí ho _tickCardZoom() z update() smyčky,
    // jakmile pod kurzorem přestane být karta s daným klíčem (změna obrazovky, zmizení karty).

    // Závoj pozadí jen v menu/lobby/výběru/výsledcích (čitelnost textu). U herního
    // stolu je pozadí klasické bez ztmavení (závoj se úplně vypne).
    {
        const inLobbyOrMenu = !roomState || roomState.roomPhase === 'lobby' || roomState.roomPhase === 'next_lobby';
        const showingBoard = !inLobbyOrMenu && !!state && !state.winner
            && state.phase !== 'MENU' && state.phase !== 'CHARACTER_SELECT'
            && !_introActive() && !App.introExpected;
        if (gameScene.bgScrim) gameScene.bgScrim.setAlpha(showingBoard ? 0 : 0.55);
    }

    showOrHideChat(!!(roomState && state && state.phase !== 'MENU' && state.phase !== 'CHARACTER_SELECT') || _introActive() || !!App.introExpected);

    if (!roomState || (roomState.roomPhase !== 'lobby' && roomState.roomPhase !== 'next_lobby')) {
        cleanupTextInputs?.();
    }

    {
        const isFs = !!document.fullscreenElement;
        if (!isFs) {
            // Na dotykovém displeji je 22px písmo ~8 CSS px – tlačítko nešlo trefit prstem.
            const small = isSmallTouchUi();
            let fsBtn = gameScene.add.text(stageRight() - 20, stageTop() + 20, '⛶ FS',
                { fontFamily: THEME.fontUI, fontSize: small ? '40px' : '22px', color: '#9a9088', backgroundColor: 'rgba(0,0,0,0.55)', padding: small ? { x: 18, y: 12 } : { x: 10, y: 6 } })
                .setOrigin(1, 0).setDepth(1000).setInteractive({ useHandCursor: true });
            fsBtn.on('pointerover', () => fsBtn.setColor('#e0b23c'));
            fsBtn.on('pointerout', () => fsBtn.setColor('#9a9088'));
            fsBtn.on('pointerdown', () => requestGameFullscreen());
            gameScene.cardsSprites.add(fsBtn);
        }
    }

    if (state?.isDebug && state.phase !== "MENU" && state.phase !== "CHARACTER_SELECT" && state.players) {
        // Přepínač hráčů – sjednocený vzhled s herními tlačítky (themeButton + toggle styl).
        // Řada začíná až za rohovým „Ukončit hru" (30..240), ať se nepřekrývají.
        const btnY = stageTop() + 30, btnH = 48, btnW = 104, gap = 8, startX = stageLeft() + 260;
        state.players.forEach((p, i) => {
            const isActive = i === myIndex;
            const bx = startX + i * (btnW + gap);
            const { bg } = themeButton(gameScene, bx, btnY, btnW, btnH,
                `P${i + 1}: ${p.name.replace('Debug', '')}`,
                { origin: [0, 0], ...themeToggleStyle(isActive), fontSize: '15px',
                  onClick: isActive ? undefined : () => { App.debugViewAs = i; myIndex = i; renderUI(); } });
            bg.setDepth(1000);
        });
    }

    // ── MENU / LOBBY ──────────────────────────────────────────────────────────
    if (!roomState) {
        renderMenuScreen(App.menuScreen || 'main');
        return;
    }

    const rPhase = roomState.roomPhase;
    if (rPhase === 'lobby' || rPhase === 'next_lobby') {
        cleanupTextInputs?.();
        renderLobbyScreen();
        return;
    }

    if (!state) return;
    if (state.phase !== "MENU" && !state.players) return;

    // ── INTRO (mícání, rozdávání rolí/postav/karet) ────────
    if (_introActive() || App.introExpected) {
        if (_introActive()) {
            renderIntroScene();
        } else {
            // Intro brzy dorazi (50ms delay na serveru) - zobraz prazdnou obrazovku
            const cover = stageCoverSize();
            const bg2 = gameScene.textures.exists('background')
                ? gameScene.add.image(960, 540, 'background').setDisplaySize(cover.w, cover.h).setDepth(0)
                : gameScene.add.rectangle(960, 540, stageW(), stageH(), 0x2a1c10).setDepth(0);
            gameScene.cardsSprites.add(bg2);
        }
        return;
    }

    if (App.spectating) {
        // Hra jen botů (jsem její zakladatel = leader): řekni serveru, ať ji
        // rozpustí. Navigaci pak provede echo 'go_to_menu' (→ hlavní menu).
        const { bg: specBack } = themeButton(gameScene, stageLeft() + 30, stageTop() + 30, 260, 52, '◀  Opustit sledování', {
            origin: [0, 0], fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030,
            stroke: THEME.color.dangerNum, fontSize: '20px',
            onClick: () => {
                if (roomState && roomState.leaderSocketId === socket.id) {
                    socket.emit('go_to_menu');
                    return;
                }
                // Server nás musí odhlásit z kanálu diváků, jinak nás další room_update
                // z menu vrátí zpátky do hry. Než ale odhlášení doběhne, můžou být updaty
                // téhle místnosti už na cestě → ignoruj je lokálně (App.ignoreRoomId).
                socket.emit('leave_spectate');
                stopSpectating(roomState?.roomId);
            },
        });
        specBack.setDepth(500);
    }

    // Lídrovské „Ukončit hru" jen pro hrajícího lídra – ne pro diváka (ten už má
    // „Opustit sledování"; navíc cancel_game divákovi botí hry stejně nefunguje).
    if (roomState && roomState.leaderSocketId === socket.id && !state?.winner && !App.spectating) {
        const { bg: cancelBtn } = themeButton(gameScene, stageLeft() + 30, stageTop() + 30, 210, 48, '✕  Ukončit hru', {
            origin: [0, 0], fill: THEME.color.dangerDarkNum, fillHover: 0x9a3030,
            stroke: THEME.color.dangerNum, fontSize: '18px',
            onClick: () => {
                if (confirm('Opravdu chceš ukončit hru? Všichni hráči se vrátí do menu.')) {
                    socket.emit('cancel_game');
                }
            },
        });
        cancelBtn.setDepth(500);
    }

    if (state?.winner) { renderWinnerScreen(); return; }

    if (state.phase === "CHARACTER_SELECT") { renderCharacterSelectScreen(); return; }

    // Deska se kreslí po pauze (start hry, návrat z výběru/vítěze) → zahoď domovské
    // pozice klouzání z předchozí hry, jinak by všechny karty i postavy doklouzaly
    // z dávných míst (vypadá to jako posun, po kterém se reálně nic nezmění).
    if (!_boardWasShown) resetBoardSlides();
    App.boardShown = true;
    renderGameBoard();
    // Dodge City – Vera Custer volí kopírovanou postavu (overlay přes desku).
    if (state.phase === "VERA_COPY") renderVeraCopyOverlay();
    // High Noon (přibalené) – Želízka: volba barvy; Nová identita: výměna postavy.
    if (state.phase === "HANDCUFFS_SUIT") renderHandcuffsOverlay();
    if (state.phase === "NEW_IDENTITY") renderNewIdentityOverlay();
    // Divoký západ – Greygory Deck si na začátku tahu vybírá, jestli dvojici vymění.
    if (state.phase === "GREYGORY_OFFER") renderGreygoryOverlay();
    // Divoký západ – Zuřivá Doroty: mřížka druhů karet, ze které se jmenuje. Není to
    // fáze (jméno karty se ještě nikam neposlalo), ale nabitá schopnost – stejně jako
    // „DOC: 2 karty → BANG" žije v `selectedState`, dokud hráč nedoklikne.
    if (selectedState?.dorothy && !selectedState.dorothy.cardName) renderDorothyOverlay();
    // board.js právě zapsal přesné pozice rezervovaných slotů → zaměř na ně letící líznutí.
    retargetDrawAnims();
    // Nové sprity vznikly bez zvýraznění → hned nasaď hover na kartu pod kurzorem (bez čekání
    // na pohyb myší / další snímek), ať zvýraznění po cizí akci neprobliká.
    _reapplyPointerHover();
}
