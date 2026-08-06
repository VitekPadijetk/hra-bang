const App = {
    menuScreen: 'main',
    lobbyList: [],
    gameList: [],
    blockInput: false,
    reshuffleAnimating: false,
    reshuffleIsProactive: false,
    pendingDrawCount: 0,
    lastConfirmedDrawn: 0,
    // Vlastník fáze lízání, ke které pendingDrawCount/lastConfirmedDrawn patří. Když se
    // změní (DRAW → DRAW jiného hráče, řetěz kill-rewardů), počítadlo se musí vynulovat.
    lastDrawOwner: null,
    spectating: false,
    // Místnost, jejíž zprávy už nás nezajímají (právě jsme přestali sledovat její hru).
    // Odhlášení z kanálu diváků na serveru je asynchronní, takže updaty odeslané těsně
    // předtím ještě dorazí – bez tohohle filtru by nás z menu vrátily zpátky do hry.
    ignoreRoomId: null,
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
    debugHighNoon: false,
    chatMessages: [],
    chatOpen: false,
    chatUnread: 0,
    createGameName: null,
    createGameNameOwner: null,
    createPlayerCount: null,
    createOptions: { noAdvancedCards: false, singleChar: false, rotatingSheriff: false, expansions: { dodge_city: false, high_noon: false } },
    botGameCount: 4,
    // ID karet, které právě letí do MOJÍ ruky (animace líznutí/krádeže). Dokud je
    // karta tady, board.js ji v ruce nevykreslí – slot je rezervovaný a karta se
    // objeví až po dosednutí své animace (rychlé líznutí po sobě → postupně).
    pendingDrawIds: new Set(),
    // Karta rozdaná v creative módu má vlastní unikátní id (aby nekolidovala s kopií
    // v balíčku), ale grafiku má upečenou pod původním id z cards.json. Tady je mapa
    // id -> texId, kterou plní registerCardTexAliases z každého stavu.
    cardTexAlias: {},
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
    // Cinematika vyřazení hráče (core/deathAnim.js): playerIdx -> fáze.
    //   'dying'      – postava klesá na 0 životů, karty ještě leží na místě
    //   'discarding' – karty odlétají (u zdroje mizí postupně, viz deathHandHide)
    //   'settled'    – ruka i stůl jsou pryč, místo pro kartu role je rezervované,
    //                  ale karta se NEkreslí (letí zrovna doprostřed obrazovky)
    // Dokud je hráč v některé fázi, board.js podle toho kreslí jeho místo; po dojezdu
    // se záznam smaže a karta role se objeví staticky.
    deathSeq: {},
    // Které SLOTY ruky vyřazeného hráče už odletěly (playerIdx -> Set slotů). Slot
    // zůstává prázdný (vějíř se nepřeskládá), karta se prostě přestane kreslit.
    deathHandHide: {},
    // Dělení karet mrtvého mezi VÍC Vulture Samů: index vyřazeného hráče, jehož karty
    // zatím leží na stole a Samové si je střídavě rozebírají. Po tu dobu se jeho místo
    // kreslí pořád s kartami (a bez karty role) – ta se odhalí až po rozdělení.
    vultureSplitIdx: null,
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
    // storeDeckCount = kolik karet má PO DOBU rozdávání ukazovat dobírací balíček.
    // Stav už v okamžiku otevření hokynářství obsahuje zamíchaný (velký) balíček, takže
    // by hromádka skočila z „4 karet" na sto ještě než se z ní vůbec začne rozdávat.
    // Držíme proto vlastní počet, který ubývá s každou odlétající kartou (a na nule
    // hromádka zmizí – přesně s poslední rozdanou kartou). null = kresli podle stavu.
    storePileLiftY: 0,
    storeDeckCount: null,
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
    // Jesse Jones: totéž pro klik na ruku soupeře (vzít první kartu z cizí ruky). Balíček
    // přitom zůstává klikatelný – Jesse hned nato líže druhou kartu z něj.
    jesseStealLock: false,
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
    // Kreslil PŘEDCHOZÍ render herní desku? Klouzání navazuje jen na předchozí render
    // desky; když se mezi tím ukazovalo intro/výběr postav/menu/vítěz, jsou pozice v
    // cardHome z JINÉ hry a musí se zahodit (viz resetBoardSlides v view/board.js).
    boardShown: false,
};
