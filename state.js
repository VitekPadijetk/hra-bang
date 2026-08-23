const App = {
    menuScreen: 'main',
    lobbyList: [],
    gameList: [],
    blockInput: false,
    // Rozměr herního jeviště v design px (core/layout.js computeStage) – dopočítá ho
    // game.js applyStage podle skutečného poměru stran displeje, aby se využily i pruhy
    // po stranách. Dokud není spočítané, čte se základní 16:9 (currentStage()).
    stage: null,
    // Profil rozložení desky: 'desktop' | 'mobile' (core/layout.js). Jméno + samotný
    // profil; čte je currentLayout(), ze kterého kreslí view/board.js i positions.js.
    uiProfile: null,
    layout: null,
    reshuffleAnimating: false,
    reshuffleIsProactive: false,
    pendingDrawCount: 0,
    lastConfirmedDrawn: 0,
    // Vlastník fáze lízání, ke které pendingDrawCount/lastConfirmedDrawn patří. Když se
    // změní (DRAW → DRAW jiného hráče, řetěz kill-rewardů), počítadlo se musí vynulovat.
    lastDrawOwner: null,
    // ID té fáze lízání (drawPhaseState.drawId ze serveru). Řetěz kill-rewardů běží
    // i pro TÉHOŽ hráče (Herb Hunter 2 + odměna za banditu 3), takže samotný vlastník
    // předěl nepozná – viz core/drawCounter.js.
    lastDrawId: null,
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
    // Lídr zmáčkl „Zahájit hru" – zamkne tlačítko, než dorazí odpověď serveru
    // (start může chvíli čekat na assety rozšíření). Viz view/menu.js.
    startPressed: false,
    introRoleOkSent: false,
    introExpected: false,
    myIntroIndex: null,
    debugViewAs: null,
    debugSelectFor: null,
    debugRoles: [],
    debugDodgeCity: false,
    debugHighNoon: false,
    debugHighNoonExtra: false,
    debugFistful: false,
    // High Noon (přibalené) – Nová identita: stav cinematiky nabídky (net/handlers.js).
    // { ready, decided } – ready = karta doletěla doprostřed a je překlopená lícem nahoru.
    niReveal: null,
    niHideSecond: false,   // odložená karta zrovna letí → nekreslit ji u životů
    niHideChar: false,     // stará postava se zrovna překlápí na rub → nekreslit ji na jejím místě
    chatMessages: [],
    chatOpen: false,
    chatUnread: 0,
    createGameName: null,
    createGameNameOwner: null,
    createPlayerCount: null,
    createOptions: { noAdvancedCards: false, singleChar: false, rotatingSheriff: false, highNoonExtra: false, expansions: { dodge_city: false, high_noon: false, fistful: false } },
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
    // Postava útočníka, který u jediného cíle vyžaduje víc než jedno Vedle!
    // (Slab the Killer) – v update() bliká. Naplňuje renderGameBoard (view/board.js).
    attackPulse: [],
    // Přesná pozice rezervovaného slotu gated karty z board.js (cardId -> {x,y}).
    // Letící líznutí se na ni zaměřuje – board.js je autorita, žádný odhad slotu.
    gatedSlotPos: {},
    // ID karty, kterou právě animujeme do odhozu (dynamit bum / vězení). Dokud je
    // nastavené, board.js ji navrchu odhozu nevykreslí – objeví se až po animaci.
    discardAnimHideId: null,
    // Colt .45 na mém stole: kreslí se právě teď? + kdy začal jeho fade-in (0 = nefaduje).
    // Slouží k plynulému objevení Coltu na místě sebrané/zničené zbraně (view/board.js).
    // null = deska se ještě nekreslila (Colt se pak neobjevuje fade-inem, viz board.js)
    coltVisible: null,
    coltFadeStart: 0,
    // Rozsvícení postavy hráče na tahu se plynule nafaduje; drží se čas změny tahu.
    lastCurrentIdx: null,
    turnTintStart: 0,
    // Odložený úklid intro spritů po 'done' (net/handlers.js) – token proti tomu, aby
    // vyprchal do už rozjetého NOVÉHO intra.
    introDoneToken: 0,
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
    // Claus "The Saint" (Fistful): odkrytá řada uprostřed stolu. clausPanel = geometrie
    // řady (clausPanelLayout – měřítko podle počtu karet), clausDealSlots = sloty, jejichž
    // karta ještě letí z balíčku, clausTakenSlots = sloty, ze kterých karta právě odlétá
    // k příjemci (mizí se startem letu, ne až s příchozím stavem). Klíčem je INDEX slotu,
    // ne ID karty – ostatní hráči řadu vidí jen rubem (redactState), takže žádná ID nemají.
    clausPanel: null,
    clausDealSlots: new Set(),
    clausTakenSlots: new Set(),
    // Fistful – Ranč: ID karet z ruky, které mám označené k výměně (druhý klik odznačí).
    // Čistě klientský výběr: server dostane až seznam v `ranch_exchange`. Vyprazdňuje se
    // s odchodem z fáze RANCH (net/handlers.js).
    ranchSel: new Set(),
    // High Noon / Fistful of Cards: po dobu cinematiky odkrytí karty události kreslíme
    // balíček událostí podle animace, ne podle stavu (ten dorazí až po ní) – karta
    // z balíčku odchází hned se startem letu. null = kresli podle stavu (drawEventPile).
    hnDeckLeft: null,
    ffDeckLeft: null,
    // Hokynářství na stole: balíčky se zvednou (storePileLiftY), karty se rozdají do
    // řady pod nimi (storeDealIds = ještě nedoletělé sloty, gated), výběr může být
    // dočasně zamčený (storeLocked, případ nedostatku) a u proaktivního míchání čeká
    // návrat balíčků na dokončení míchání (storeShuffleEndAt = timestamp konce).
    // storeShuffling = běží míchací cinematika ve zvednuté poloze (balíček se po tu dobu
    // nekreslí, stejně jako u klasického domíchání); storeShuffleBlock = hráči byli
    // rychlejší než míchání a hra na jeho dokončení čeká se zamčeným UI (blockInput,
    // který room_update kvůli tomuhle flagu nesmí předčasně odemknout).
    // dealDeckCount = kolik karet má PO DOBU rozdávání ukazovat dobírací balíček
    // (hokynářství i odkrytá řada Kita Carlsona / Clause – viz dealRevealRow).
    // Stav už v okamžiku otevření hokynářství obsahuje zamíchaný (velký) balíček, takže
    // by hromádka skočila z „4 karet" na sto ještě než se z ní vůbec začne rozdávat.
    // Držíme proto vlastní počet, který ubývá s každou odlétající kartou (a na nule
    // hromádka zmizí – přesně s poslední rozdanou kartou). null = kresli podle stavu.
    storePileLiftY: 0,
    dealDeckCount: null,
    storeDealIds: new Set(),
    storeLocked: false,
    storeShuffleEndAt: 0,
    storeShuffling: false,
    storeShuffleBlock: false,
    // Odkrytá řada (Kit Carlson / Claus): revealShuffling = uprostřed rozdávání běží
    // míchací cinematika (balíček se po tu dobu nekreslí, jako u hokynářství);
    // revealLocked = řada se ještě rozdává, takže z ní zatím nejde vybírat. Stav
    // s fází dorazí hned (míchání si řídí klient), takže bez zámku by šlo kliknout
    // na kartu, která ještě letí – stejná dohoda jako storeLocked u hokynářství.
    revealShuffling: false,
    revealLocked: false,
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
    kitSpecNeeded: 2,       // kolik si Kit nechá (Žízeň = 1) – snímek ze startu rozdávání
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
