const App = {
    menuScreen: 'main',
    lobbyList: [],
    gameList: [],
    blockInput: false,
    reshuffleAnimating: false,
    reshuffleIsProactive: false,
    pendingDrawCount: 0,
    lastConfirmedDrawn: 0,
    spectating: false,
    allCardsData: null,
    allTakenNames: [],
    selectedLobby: null,
    joinError: null,
    notifyMsg: null,
    kickedMsg: null,
    introRoleOkSent: false,
    introExpected: false,
    myIntroIndex: null,
    debugViewAs: null,
    debugSelectFor: null,
    debugRoles: [],
    debugDodgeCity: false,
    chatMessages: [],
    chatOpen: false,
    chatUnread: 0,
    createGameName: null,
    createGameNameOwner: null,
    createPlayerCount: null,
    createOptions: { noAdvancedCards: false, singleChar: false, rotatingSheriff: false, expansions: { dodge_city: false } },
    botGameCount: 4,
    // ID karet, které právě letí do MOJÍ ruky (animace líznutí/krádeže). Dokud je
    // karta tady, board.js ji v ruce nevykreslí – slot je rezervovaný a karta se
    // objeví až po dosednutí své animace (rychlé líznutí po sobě → postupně).
    pendingDrawIds: new Set(),
    // Aktivní letící líznutí ({ cardId, slotIndex, sprite }) – při novém líznutí se
    // jejich cíle přepočítají na aktuální rozteč ruky (retargetDrawAnims), aby karta
    // dosedla přesně tam, kam ji board.js vykreslí (jinak posun při přerozprostření).
    drawAnims: [],
    // Počet právě letících líznutí u jednotlivých soupeřů (playerIdx -> count) – rychlá
    // líznutí za sebou tak míří na postupné sloty a mají rostoucí depth (správné vrstvy).
    oppDrawPending: {},
    // Vera Custer: portréty, které v update() cyklicky přepínají mezi kopírovanou
    // postavou (blikající zvýraznění, ~8 s) a vlastní Verou (bez zvýraznění, ~2 s).
    // Naplňuje renderGameBoard, čte scene.update(). Prvky: { sprite, selfTex, copyTex }.
    veraPortraits: [],
    // Přesná pozice rezervovaného slotu gated karty z board.js (cardId -> {x,y}).
    // Letící líznutí se na ni zaměřuje – board.js je autorita, žádný odhad slotu.
    gatedSlotPos: {},
    // ID karty, kterou právě animujeme do odhozu (dynamit bum / vězení). Dokud je
    // nastavené, board.js ji navrchu odhozu nevykreslí – objeví se až po animaci.
    discardAnimHideId: null,
    // Posun postavy po kartě životů při zásahu/vyléčení (playerIdx -> { fromHealth,
    // sprite }). board.js rozjede plovoucí postavu ze staré pozice na novou.
    healthAnims: {},
    // ID karet právě odlétajících do odhozu při smrti hráče (Návrh 2). board.js je
    // navrchu odhozu skryje, dokud nedoletí – objeví se postupně, jak dosedají.
    deathDiscardHideIds: new Set(),
    // ID karet právě ukradených z výzbroje/stolu hráče (Panika/Cat Balou). board.js
    // je na boardu/výzbroji NEvykreslí, dokud plovoucí animace nedoletí – jinak by
    // byla karta po dobu letu vidět dvakrát (reálná i letící).
    stealHideIds: new Set(),
    // ID karet právě odlétajících z RUKY vlastníka (hraná/odhazovaná karta, panika/CB).
    // Server ji může dočasně vrátit do ruky a znovu rozeslat (aby zůstala vidět, než ji
    // zvedne animace) → room_update by ji jinak vrátil zpět doprostřed letu a přepočítal
    // rozteč ruky (ukradená karta pak mířila o slot vedle). Dokud animace běží, room_update
    // tyto karty z rukou odstraní. Vyčistí se na začátku (nové) hry.
    handFlyHideIds: new Set(),
    // Kit Carlson / Lucky Duke cinematika: karty se rozdávají z balíčku do panelu
    // (kitDealIds/luckyDealIds = ještě nedoletělé, board.js je v panelu skryje),
    // kitRevealCards/luckyRevealCards = pozice slotů pro následné lety, kitPicked =
    // ID karet, které si Kit vybral (zbylá letí zpět do balíčku). discardFlyHideIds =
    // karty letící do odhozu (Lucky), board.js je v odhozu skryje do doletu.
    kitDealIds: new Set(),
    kitRevealCards: null,
    kitPicked: [],
    luckyDealIds: new Set(),
    luckyRevealCards: null,
    discardFlyHideIds: new Set(),
    // Hokynářství na stole: balíčky se zvednou (storePileLiftY), karty se rozdají do
    // řady pod nimi (storeDealIds = ještě nedoletělé sloty, gated), výběr může být
    // dočasně zamčený (storeLocked, případ nedostatku) a u proaktivního míchání čeká
    // návrat balíčků na dokončení míchání (storeShuffleEndAt = timestamp konce).
    // storeShuffling = běží míchací cinematika ve zvednuté poloze (balíček se po tu dobu
    // nekreslí, stejně jako u klasického domíchání); storeShuffleBlock = hráči byli
    // rychlejší než míchání a hra na jeho dokončení čeká se zamčeným UI (blockInput,
    // který room_update kvůli tomuhle flagu nesmí předčasně odemknout).
    storePileLiftY: 0,
    storeDealIds: new Set(),
    storeLocked: false,
    storeShuffleEndAt: 0,
    storeShuffling: false,
    storeShuffleBlock: false,
    discardBorderShown: false,
    // Pedro Ramirez: po kliknutí na odhoz (vzít první kartu z odhozu) zamkni odhoz,
    // ať se během letové animace nedá klikat znovu (jinak by se odpálilo víc animací).
    // Ruší se v room_update, jakmile server potvrdí líznutí.
    pedroDrawLock: false,
    // Když hraju/odhazuju kartu já, zachytíme PŘED optimistickým odebráním z ruky
    // přesnou pozici jejího slotu (cardId -> {x,y}). Letová animace z ní vyjde, ať
    // karta letí z místa, kde reálně ležela, ne z obecné kotvy ruky. Čte se jednou.
    playedCardFromPos: {},
    // Kit Carlson – co vidí OSTATNÍ (ne Kit): 3 rubové karty přiletí k Němu a parkují
    // mezi ním a středem; při výběru odlétají do ruky, nevybraná do balíčku.
    kitSpecParked: [],
    kitSpecPicksDone: 0,
    createAdvanced: false,
    joinListFetched: false,
    joinRoomNamesFetched: false,
    spectateListFetched: false,
    // Plynulé přeskládání ruky/stolu (reflow slide): když karta odejde/přijde, ostatní
    // karty nemají skočit na nové místo, ale doklouzat. cardHome = poslední vykreslená
    // cílová pozice karty (klíč -> {x,y}); cardSlides = běžící plovoucí klouzání (klíč ->
    // { sprite, tween, tx, ty }), sprite žije MIMO cardsSprites, aby přežil re-render
    // (stejný idiom jako healthAnims/runHealthSlide). _cardSeen = klíče vykreslené v
    // aktuálním renderu → po renderu se nepoužité klíče proberou (viz pruneCardSlides).
    cardHome: {},
    cardSlides: {},
    _cardSeen: new Set(),
};
