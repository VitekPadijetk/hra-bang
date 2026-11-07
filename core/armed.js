// core/armed.js — zrcadlo rozšíření Ozbrojení a nebezpeční (Armed & Dangerous) nad prostým
// stavem. BEZ Phaseru/DOM. Izomorfní: v prohlížeči globály (načteno PŘED
// core/playability.js), v Node přes require. Ptá se jím server (logic/armed.js), klient
// (view/*) i bot – kdyby se rozešli, server akci mlčky odmítne a hra botů se zasekne.
//
// Plán: docs/ozbrojeni-a-nebezpecni-plan.md. Predikáty karet přibývají s fázemi A1–A7.
//
// POZOR na jména (§2.3): prefix `ad`/`AD_`. Žetony nabití jsou v kódu `adLoads` – na
// postavě `p.adLoads`, na kartě ve hře `card.adLoads`. Nepoužívat `token*` (identita pro
// rejoin), `load*` (klientské načítání assetů) ani `preacher*` (Kazatel z High Noonu).

if (typeof require === 'function') {
    if (typeof isInPlay === 'undefined') globalThis.isInPlay = require('./distance.js').isInPlay;
    if (typeof isDangerousCard === 'undefined') globalThis.isDangerousCard = require('./cardRules.js').isDangerousCard;
    if (typeof canHeal === 'undefined') globalThis.canHeal = require('./distance.js').canHeal;
    if (typeof boardDeadFor === 'undefined') globalThis.boardDeadFor = require('./highNoon.js').boardDeadFor;
    if (typeof effSuit === 'undefined') globalThis.effSuit = require('./highNoon.js').effSuit;
    if (typeof hasAbility === 'undefined') globalThis.hasAbility = require('./distance.js').hasAbility;
    if (typeof computeCanHit === 'undefined') globalThis.computeCanHit = require('./distance.js').computeCanHit;
}

// Zapnuté rozšíření? (Klíč drží menu i server: options.expansions.ozbrojeni.)
function adOn(state) {
    return !!(state && state.options && state.options.expansions &&
              state.options.expansions.ozbrojeni);
}

// Které DRUHY karet (jméno karty) už mají hotový efekt, a tedy smí do balíčku (vzor
// VOS_CARDS_READY). Karta bez efektu by ležela v ruce, bot by ji zkoušel hrát a server
// mlčky odmítal. Roste s fázemi A1–A6; na konci (A7) je celý.
const AD_CARDS_READY = [
    // A0 – šest karet ze základní hry (4× BANG!, Cat Balou, Vedle!): jen do balíčku
    'Bang!', 'Cat Balou', 'Vedle!',
    // A1 – dobíjení a placení: Nebezpečné objekty bez cíle a hnědé karty bez cíle
    'Eso v rukávu', 'Bečka piva', 'Zvonice', 'Bandalír',
    'Nabíjení', 'Kolona', 'Malý doušek',
    // A2 – zbraně a výstřely
    'Big Fifty', 'Buntline Special', 'Dvouhlavňovka', 'Thunderer',
    'Bedna', 'Skrč se!', 'Křesadlovka', 'Rychlopalba',
];

// Data karet rozšíření zúžená na hotové druhy – tohle jde do balíčku (`_deckDataFor`,
// logic/setup.js).
function adReadyCards(data) {
    return (data || []).filter(c => c && AD_CARDS_READY.includes(c.name));
}

// Katalog karet debug hry: hotové druhy + Nebezpečné karty, které už jde VYLOŽIT (fáze A0
// – vyložení se 3 žetony a kostičky na stole), i když jejich efekt ještě nefunguje. Bomba
// ne: ta se hraje na libovolného hráče a přijde až s fází A4.
function adDebugCards(data) {
    return (data || []).filter(c => c && (AD_CARDS_READY.includes(c.name) ||
        (c.props && c.props.dangerous && c.props.dangerous.cost != null)));
}

// Je dodaná značka rozšíření (pistole s dynamitem, assets/card_marks/ozbrojeni.webp)?
// Dokud soubor není, loader ho nestahuje (žádné 404) a karty se pečou bez značky.
const AD_MARK_READY = false;

// ── Žetony nabití (§2.5) ─────────────────────────────────────────────────────
// 32 dřevěných kostiček ve společné zásobě. Na kartě i na postavě nejvýš 4. Nová
// Nebezpečná karta začíná na 3 („bez ohledu na to, je-li to zbraň nebo objekt").
const AD_LOAD_TOTAL = 32;
const AD_LOAD_CAP = 4;
const AD_ARM_LOADS = 3;

// Kolik žetonů leží na kartě nebo postavě.
function adLoadsOf(holder) {
    return (holder && holder.adLoads) || 0;
}

// Nebezpečné karty, které hráč má VE HŘE (zbraň + stůl). Colt .45 kartou není.
function adCardsInPlay(p) {
    if (!p) return [];
    const out = [];
    if (p.weapon && p.weapon.id !== -1 && isDangerousCard(p.weapon)) out.push(p.weapon);
    (p.board || []).forEach(c => { if (isDangerousCard(c)) out.push(c); });
    return out;
}

// Zásoba se NEUKLÁDÁ, počítá se (R3): 32 minus žetony na postavách hráčů ve hře a na
// jejich Nebezpečných kartách ve hře. Karta, která hru opustí (Panika, Cat Balou, Vulture
// Sam, nová zbraň, vyřazení…), tím vrátí své žetony do zásoby sama – nikdo je nemusí
// uklízet a nemůžou se ztratit ani zdvojit. Staré číslo, které na takové kartě zůstane,
// se nepočítá a každé vyložení ho přepíše (`_adAdd` s `fresh`).
function adSupply(state) {
    let used = 0;
    ((state && state.players) || []).forEach(p => {
        if (!p || !isInPlay(p)) return;
        used += adLoadsOf(p);
        adCardsInPlay(p).forEach(c => { used += adLoadsOf(c); });
    });
    return AD_LOAD_TOTAL - used;
}

// Smí hráč Nebezpečnou kartu z ruky vyložit? Jako modrá (ne dvě stejného jména, zbraň
// ne tutéž znovu) a navíc „pokud v zásobě není požadovaný počet žetonů, kartu nemůžete
// zahrát". Bomba (cena null, hraje se na libovolného hráče) zatím ne – fáze A4.
function adArmOk(state, me, card) {
    if (!me || !isDangerousCard(card)) return false;
    if (card.dangerous.cost == null) return false;
    if (adSupply(state) < AD_ARM_LOADS) return false;
    if (card.type === 'Zbraň') return !(me.weapon && me.weapon.id !== -1 && me.weapon.name === card.name);
    return !(me.board || []).some(c => c.name === card.name);
}

// Kolik stojí použití Nebezpečné karty (u zbraní zvláštní efekt). Bomba nic.
function adCardCost(card) {
    return (card && card.dangerous && card.dangerous.cost) || 0;
}

// Nebezpečná karta hráče ve hře podle id (adresa žetonu je { seat, cardId }, karta se
// adresuje id, ne indexem – indexy na stole se odhozem posouvají).
function adFindCard(p, cardId) {
    if (cardId == null) return null;
    return adCardsInPlay(p).find(c => c.id === cardId) || null;
}

// ── Rozmístění žetonů – fáze AD_PLACE (§2.7) ─────────────────────────────────
// Kam smí hráč dát žeton ze zásoby: na své Nebezpečné karty pod stropem a na svou
// postavu pod stropem. Prázdná zásoba = nikam. Vrací seznam adres { seat, cardId }
// (`cardId: null` = postava). Prázdný seznam = do fáze se vůbec nevstupuje.
function adPlaceTargets(state, idx) {
    if (!adOn(state)) return [];
    const p = state.players && state.players[idx];
    if (!p || !isInPlay(p) || adSupply(state) <= 0) return [];
    const out = [];
    adCardsInPlay(p).forEach(c => {
        if (adLoadsOf(c) < AD_LOAD_CAP) out.push({ seat: idx, cardId: c.id });
    });
    if (adLoadsOf(p) < AD_LOAD_CAP) out.push({ seat: idx, cardId: null });
    return out;
}

function adPlaceOk(state, idx, seat, cardId) {
    const cid = cardId == null ? null : cardId;
    return adPlaceTargets(state, idx).some(t => t.seat === seat && t.cardId === cid);
}

// Proč se žetony rozmisťují – popisek lišty a štítku čekání.
const AD_PLACE_REASON = {
    BLUE: 'za modrou kartu',
    DISCARD: 'za odhozené karty',
    RELOAD: 'Nabíjení',
};

// ── Platba (§2.8) ────────────────────────────────────────────────────────────
// Z čeho smí hráč platit vylepšení: jeho postava a jeho Nebezpečné karty se žetony –
// Bomba ne (R5). Laso platbu nebere: žetony nejsou efekt karty.
function adSources(state, idx) {
    const p = state.players && state.players[idx];
    if (!p || !isInPlay(p)) return [];
    const out = [];
    if (adLoadsOf(p) > 0) out.push({ seat: idx, cardId: null, loads: adLoadsOf(p) });
    adCardsInPlay(p).forEach(c => {
        if (c.type !== 'Bomba' && adLoadsOf(c) > 0) out.push({ seat: idx, cardId: c.id, loads: adLoadsOf(c) });
    });
    return out;
}

function adPayable(state, idx) {
    return adSources(state, idx).reduce((s, x) => s + x.loads, 0);
}

// Je platba v pořádku? `pay` = pole adres, jedna položka = jeden žeton. Jen vlastní
// zdroje, z žádného víc, než na něm leží, a přesně `cost` kusů. Ptá se server před
// efektem i klient (tlačítko POTVRDIT) – odmítnutá akce nic nezaplatí.
function adPayOk(state, idx, pay, cost) {
    if (!Array.isArray(pay) || pay.length !== cost) return false;
    const src = adSources(state, idx);
    const used = new Map();
    for (const it of pay) {
        if (!it || it.seat !== idx) return false;
        const cid = it.cardId == null ? null : it.cardId;
        const s = src.find(x => x.cardId === cid);
        if (!s) return false;
        const n = (used.get(cid) || 0) + 1;
        if (n > s.loads) return false;
        used.set(cid, n);
    }
    return true;
}

// ── Vylepšení hnědé karty (§2.8, §4) ─────────────────────────────────────────
function adUpgradeCost(card) {
    return (card && card.upgrade && card.upgrade.cost) || 0;
}

// Kolik vylepšení si hráč k té kartě může zaplatit. Malý doušek nad strop životů
// vylepšit nejde (+1 život dá karta sama). Vylepšitelné karty dalších fází (Šíp,
// Skrč se!…) zatím 0 – jejich efekt vylepšení ještě nezná.
function adUpgradeMax(state, idx, card) {
    if (!adOn(state) || !card || !card.upgrade) return 0;
    const cost = adUpgradeCost(card);
    if (!cost) return 0;
    const p = state.players[idx];
    if (!p) return 0;
    let max = Math.floor(adPayable(state, idx) / cost);
    if (card.type === 'Malý doušek') max = Math.min(max, Math.max(0, (p.maxHealth || 0) - (p.health || 0) - 1));
    // Skrč se! a Křesadlovka: jediné vylepšení = karta zpátky do ruky.
    else if (card.type === 'Skrč se!' || card.type === 'Křesadlovka') max = Math.min(max, 1);
    // Rychlopalba: každé vylepšení = další, jiný cíl v dostřelu.
    else if (card.type === 'Rychlopalba') max = Math.min(max, Math.max(0, adQuickTargets(state, idx).length - 1));
    else if (card.type !== 'Kolona') max = 0;
    return Math.max(0, max);
}

// Jsou vylepšení a platba k zahrání karty v pořádku?
function adUpgradeOk(state, idx, card, up, pay) {
    const n = up || 0;
    if (!Number.isInteger(n) || n < 0) return false;
    if (n === 0) return !pay || pay.length === 0;
    if (n > adUpgradeMax(state, idx, card)) return false;
    return adPayOk(state, idx, pay, n * adUpgradeCost(card));
}

// ── Použití Nebezpečné karty (§2.9) ──────────────────────────────────────────
// Fistful – Právo západu: použití může vynucenou kartu „vypnout" (líznutí, léčení).
// playability.js armed.js require-uje, takže se čte až při volání (žádný kruh).
let _adLawFn = null;
function _adLawLocks(state, p, idx, opts) {
    if (!_adLawFn) {
        _adLawFn = (typeof lawLocksOther !== 'undefined') ? lawLocksOther
                 : (typeof require === 'function' ? require('./playability.js').lawLocksOther : null);
        if (!_adLawFn) _adLawFn = () => false;
    }
    return !!_adLawFn(state, p, idx, null, opts);
}

// Které Nebezpečné karty se používají klikem (ve svém tahu, ve fázi PLAY).
const AD_USE_KINDS = ['Eso v rukávu', 'Bečka piva', 'Zvonice'];

// Smí hráč tu svou Nebezpečnou kartu teď použít? Ptá se server (adUse), klient
// (klikatelná karta) i bot – kdyby se rozešli, hra botů by se zasekla.
function adUseOk(state, idx, card) {
    if (!adOn(state) || !card || state.phase !== 'PLAY' || state.currentPlayerIndex !== idx) return false;
    const p = state.players[idx];
    if (!p || !isInPlay(p)) return false;
    if (!adFindCard(p, card.id)) return false;
    if (!AD_USE_KINDS.includes(card.type)) return false;
    if (boardDeadFor(state)) return false;   // Fistful – Laso: karty na stole nemají efekt
    if (adLoadsOf(card) < adCardCost(card)) return false;
    if (card.type === 'Eso v rukávu') return !_adLawLocks(state, p, idx, { draws: 1 });
    if (card.type === 'Bečka piva') {
        return canHeal(p) && (p.health || 0) < (p.maxHealth || 0) && !_adLawLocks(state, p, idx, { heal: 1 });
    }
    // Zvonice: znovu ji použít, dokud platí, nemá smysl (žeton by propadl).
    if (card.type === 'Zvonice') return !adBellLive(state, p);
    return false;
}

// Zvonice: „pro příští kartu, kterou zahraješ, vidíš všechny ve vzdálenosti 1".
// Dotaz žije v core/distance.js (computeDistance se na něj ptá a distance.js nesmí
// require-ovat armed.js); tady je jen pro pohodlí volajících.
function adBellLive(state, p) {
    if (typeof adBellActive === 'undefined' && typeof require === 'function') {
        globalThis.adBellActive = require('./distance.js').adBellActive;
    }
    return adBellActive(state, p);
}

// Bandalír: „Jednou ve svém tahu smíš zahrát jednu kartu BANG! navíc." O kolik zvedá
// limit karet BANG! (0/1). Použitý Bandalír drží limit +1 do konce tahu, i když se tím
// vyčerpal a odešel. Žádné tlačítko – cena se zaplatí sama při BANG! nad limit (R21).
function adBandolierExtra(state, p) {
    if (!adOn(state) || !p) return 0;
    if (p._adBandTurn === state.turnId) return 1;
    if (boardDeadFor(state)) return 0;
    const b = adCardsInPlay(p).find(c => c.type === 'Bandalír');
    return b && adLoadsOf(b) >= adCardCost(b) ? 1 : 0;
}

// Nabíjení: hratelné, jen když je kam žetony dát (jako Pivo na plném životě).
function adReloadOk(state, idx) {
    return adPlaceTargets(state, idx).length > 0;
}

// ── Fáze A2: zbraně a výstřely (§2.10, §4) ───────────────────────────────────
// playability.js armed.js require-uje, takže isBangCardPlay se čte až při volání.
let _adBangCardFn = null;
function _adIsBangCard(state, p, idx, card) {
    if (!_adBangCardFn) {
        _adBangCardFn = (typeof isBangCardPlay !== 'undefined') ? isBangCardPlay
                      : (typeof require === 'function' ? require('./playability.js').isBangCardPlay : null);
        if (!_adBangCardFn) return false;
    }
    return !!_adBangCardFn(state, p, idx, card);
}

// Zvláštní efekty Nebezpečných zbraní (identita = `effect` karty) a jejich popisky.
const AD_WEAPON_EFFECTS = {
    AD_BIG_FIFTY:     'zruší schopnost a karty cíle',
    AD_BUNTLINE:      'po zrušení cíl odhodí kartu',
    AD_DOUBLE_BARREL: 'nelze zrušit',
    AD_THUNDERER:     'BANG! zpátky do ruky',
};

// Hráčova Nebezpečná zbraň se zvláštním efektem (nebo null).
function adWeaponOf(p) {
    const w = p && p.weapon;
    return (w && w.id !== -1 && isDangerousCard(w) && AD_WEAPON_EFFECTS[w.effect]) ? w : null;
}

// Smí hráč k téhle kartě zaplatit zvláštní efekt své zbraně? Jen se skutečnou KARTOU
// BANG! (R12 – Zúčtování, Calamity, Lemat ano; bang-efekty, Kulomet ne), ve svém tahu,
// se žetonem na zbrani a bez Lasa. Dvouhlavňovka jen u kárového BANG! (barva přes
// effSuit – pod Požehnáním ani Prokletím kára není). Ptá se server (playBang
// s `adWeapon`), klient (přepínač u vybrané karty) i bot. Zuřivá Doroty hraje bez
// efektu (R13) – poručené zahrání žádné `adWeapon` nenese.
function adWeaponSpecialOk(state, idx, card) {
    if (!adOn(state) || !card || card._placeholder) return false;
    const p = state.players && state.players[idx];
    if (!p || !isInPlay(p) || state.phase !== 'PLAY' || state.currentPlayerIndex !== idx) return false;
    const w = adWeaponOf(p);
    if (!w || boardDeadFor(state)) return false;
    if (adLoadsOf(w) < adCardCost(w)) return false;
    if (!_adIsBangCard(state, p, idx, card)) return false;
    if (w.effect === 'AD_DOUBLE_BARREL') return effSuit(state, card) === '♦️';
    return true;
}

// Big Fifty (R9): po dobu výstřelu má cíl vypnutou schopnost (hasAbility to čte sám,
// core/distance.js) i karty ve hře – Barel, zelené Vedle!, Bedna, Odměna, vybavení.
function adMuted(p) {
    return !!(p && p._adMuted);
}

// Bedna: „Zaplať 2 ⛁ z této karty: účinkuje jako Vedle!." V obraně (RESPOND) proti
// čemukoli, na co platí Vedle! (BANG!, bang-efekty, Kulomet), a už ve fázi BARREL_DRAW
// – kdo chce Bednu dřív než Barel, nemusí nejdřív snímat. Tam jen tehdy, když jedno
// Vedle! výstřel celý zruší (proti Slabovi se nejdřív snímá). Nezrušitelný výstřel
// (Dvouhlavňovka, Colorado), Big Fifty, Laso a Belle Star ji vypínají.
function adCrateCard(p) {
    return adCardsInPlay(p).find(c => c.type === 'Bedna') || null;
}
function adCrateOk(state, idx) {
    if (!adOn(state)) return false;
    const p = state.players && state.players[idx];
    if (!p || !isInPlay(p) || adMuted(p) || boardDeadFor(state)) return false;
    const crate = adCrateCard(p);
    if (!crate || adLoadsOf(crate) < adCardCost(crate)) return false;
    let origIdx;
    if (state.phase === 'RESPOND') {
        const pr = state.pendingResponse;
        if (!pr || !pr.active || pr.targetIdx !== idx) return false;
        if (pr.requiredCard !== 'Vedle!' || pr.sourceCard === 'Duel') return false;
        if (pr.vos && pr.vos.unavoidable) return false;
        origIdx = pr.originatorIdx;
    } else if (state.phase === 'BARREL_DRAW') {
        const pb = state.pendingBarrelCheck;
        if (!pb || !pb.active || pb.targetIdx !== idx || pb.roulette) return false;
        if ((pb.missesNeeded || 1) - (state.missesPlayed || 0) > 1) return false;
        origIdx = pb.attackerIdx;
    } else return false;
    // Belle Star: v jejím tahu cizí karty na stole neplatí.
    const cur = state.currentPlayerIndex;
    if (origIdx === cur && cur !== idx && hasAbility(state.players[cur], 'Belle Star')) return false;
    return true;
}

// Rychlopalba a Mexicali Kid: kdo smí být cílem (jiní hráči v dostřelu zbraně). Na sebe
// se jako u každého bang-efektu vystřelit smí, ale jen jedním výstřelem bez vylepšení.
function adQuickTargets(state, idx) {
    const out = [];
    ((state && state.players) || []).forEach((p, i) => {
        if (i !== idx && isInPlay(p) && computeCanHit(state, idx, i)) out.push(i);
    });
    return out;
}

// Jsou další cíle Rychlopalby v pořádku? Všechny různé, jiné než první cíl i střelec
// a v dostřelu – posuzuje se při zahrání, před platbou (R18).
function adQuickExtraOk(state, idx, firstIdx, extra) {
    if (!Array.isArray(extra)) return false;
    const ok = adQuickTargets(state, idx);
    const seen = new Set([firstIdx]);
    for (const t of extra) {
        if (!Number.isInteger(t) || seen.has(t) || !ok.includes(t)) return false;
        seen.add(t);
    }
    return true;
}

// Mexicali Kid: „Jednou ve svém tahu smí zaplatit 2 ⛁ a vystřelit BANG!" (dostřel
// zbraně, do limitu se nepočítá, efekt zbraně nespouští). Platí se ze všech vlastních
// zdrojů (platební lišta).
const AD_MEXICALI_COST = 2;
function adMexicaliOk(state, idx) {
    if (!adOn(state) || state.phase !== 'PLAY' || state.currentPlayerIndex !== idx) return false;
    const p = state.players && state.players[idx];
    if (!p || !isInPlay(p) || !hasAbility(p, 'Mexicali Kid')) return false;
    if (p._adMexTurn === state.turnId) return false;
    return adPayable(state, idx) >= AD_MEXICALI_COST && adQuickTargets(state, idx).length > 0;
}

// ── Zuřivá Doroty a Lee Van Kliff (R13, vzor VOS_KINDS) ─────────────────────
// Co smí Doroty poručit a co si Lee Van Kliff zapamatuje. Oranžová karta není hnědá
// (paměť LVK drží jen hnědé), poručená karta jde bez vylepšení. Druhy, jejichž efekt
// přijde až v dalších fázích, zatím ne – poručit kartu bez efektu by nic neudělalo.
// Tři karty ze základní hry (BANG!, Cat Balou, Vedle!) se chovají jako základní.
const AD_KINDS = {
    'Eso v rukávu':     { dorothy: true,  lvk: false, why: 'oranžová – poručený ji vyloží se 3 žetony' },
    'Bandalír':         { dorothy: true,  lvk: false, why: 'oranžová – poručený ji vyloží se 3 žetony' },
    'Bečka piva':       { dorothy: true,  lvk: false, why: 'oranžová – poručený ji vyloží se 3 žetony' },
    'Zvonice':          { dorothy: true,  lvk: false, why: 'oranžová – poručený ji vyloží se 3 žetony' },
    'Bomba':            { dorothy: false, lvk: false, why: 'efekt přijde ve fázi A4' },
    'Bedna':            { dorothy: true,  lvk: false, why: 'oranžová – poručený ji vyloží se 3 žetony' },
    'Paklíč':           { dorothy: false, lvk: false, why: 'efekt přijde ve fázi A3' },
    'Stepní běžec':     { dorothy: false, lvk: false, why: 'efekt přijde ve fázi A5' },
    'Bič':              { dorothy: false, lvk: false, why: 'efekt přijde ve fázi A3' },
    'Big Fifty':        { dorothy: true,  lvk: false, why: 'zbraň – poručený ji vyloží se 3 žetony (efekt zbraně se platí jen u karty BANG!)' },
    'Buntline Special': { dorothy: true,  lvk: false, why: 'zbraň – poručený ji vyloží se 3 žetony (efekt zbraně se platí jen u karty BANG!)' },
    'Dvouhlavňovka':    { dorothy: true,  lvk: false, why: 'zbraň – poručený ji vyloží se 3 žetony (efekt zbraně se platí jen u karty BANG!)' },
    'Thunderer':        { dorothy: true,  lvk: false, why: 'zbraň – poručený ji vyloží se 3 žetony (efekt zbraně se platí jen u karty BANG!)' },
    'Malý doušek':      { dorothy: true,  lvk: true,  why: 'efekt = +1 život, bez vylepšení' },
    'Šíp':              { dorothy: false, lvk: false, why: 'efekt přijde ve fázi A3' },
    'Kolona':           { dorothy: true,  lvk: true,  why: 'lízni 2, bez vylepšení' },
    'Skrč se!':         { dorothy: false, lvk: false, why: 'hraje se jen jako reakce' },
    'Křesadlovka':      { dorothy: true,  lvk: true,  why: 'bang-efekt na dostřel, bez vylepšení' },
    'Rychlopalba':      { dorothy: true,  lvk: true,  why: 'bang-efekt na dostřel, jeden cíl (bez vylepšení)' },
    'Nabíjení':         { dorothy: true,  lvk: true,  why: 'rozmísti 3 žetony' },
    'Rez':              { dorothy: false, lvk: false, why: 'efekt přijde ve fázi A3' },
    'Squaw':            { dorothy: false, lvk: false, why: 'efekt přijde ve fázi A3' },
};
const AD_BASE_NAMES = ['Bang!', 'Cat Balou', 'Vedle!'];

function _adKind(card) {
    if (!card || card.exp !== 'ozbrojeni' || AD_BASE_NAMES.includes(card.name)) return null;
    return AD_KINDS[card.name] || { dorothy: false, lvk: false };   // neznámý druh: radši ne
}

// Smí Zuřivá Doroty tenhle druh poručit? Karty mimo rozšíření se to netýká (true).
function adDorothyOk(card) {
    const k = _adKind(card);
    return k ? k.dorothy : true;
}

// Smí Lee Van Kliff zopakovat vlastní efekt téhle karty?
function adRepeatOk(card) {
    const k = _adKind(card);
    return k ? k.lvk : true;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { adOn, AD_CARDS_READY, adReadyCards, adDebugCards, AD_MARK_READY,
                       AD_LOAD_TOTAL, AD_LOAD_CAP, AD_ARM_LOADS,
                       adLoadsOf, adCardsInPlay, adSupply, adArmOk,
                       adCardCost, adFindCard, adPlaceTargets, adPlaceOk, AD_PLACE_REASON,
                       adSources, adPayable, adPayOk, adUpgradeCost, adUpgradeMax, adUpgradeOk,
                       AD_USE_KINDS, adUseOk, adBellLive, adBandolierExtra, adReloadOk,
                       AD_WEAPON_EFFECTS, adWeaponOf, adWeaponSpecialOk, adMuted,
                       adCrateCard, adCrateOk, adQuickTargets, adQuickExtraOk,
                       AD_MEXICALI_COST, adMexicaliOk,
                       AD_KINDS, adDorothyOk, adRepeatOk };
}
