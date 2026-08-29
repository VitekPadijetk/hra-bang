// core/beliefs.js — ČISTÝ izomorfní modul: „za koho koho bot považuje".
//
// Bot NEZNÁ skryté role ostatních. Odvozuje je jen z VEŘEJNÝCH informací:
//   • složení rolí podle počtu hráčů (rolesForPlayerCount) – ví, KOLIK je kterého,
//   • veřejný šerif (hvězda) – jistota,
//   • mrtví hráči – po smrti se role odhalí, a odhalená zůstává (Mrtvý muž se vrací do hry),
//   • vlastní role – svou zná,
//   • ledger chování (kdo na koho útočil / koho léčil) – veřejné akce.
// Z toho spočítá pro každého ŽIJÍCÍHO neznámého hráče pravděpodobnostní rozdělení
// rolí a z něj „očekávanou nepřátelskost" pro cílení. Čtení `p.role` je povoleno JEN
// pro veřejné případy (sebe, šerif, jednou odhalení) – živého neznámého se `role` nedotýká.
//
// Exporty:
//   roleHostility(myRole, targetRole, opts) -> number  (nepřátelskost dvojice rolí)
//   computeBeliefs(state, ledger, myIndex)  -> beliefs[] (rozdělení rolí na hráče)
//   expectedHostility(myRole, dist, opts)   -> number  (Σ P(role)·roleHostility)

if (typeof require === 'function') {
    if (typeof rolesForPlayerCount === 'undefined') {
        globalThis.rolesForPlayerCount = require('./roles.js').rolesForPlayerCount;
    }
    if (typeof TARGET_3P === 'undefined') {
        globalThis.TARGET_3P = require('./roles.js').TARGET_3P;
    }
}

const ROLES = ['Sheriff', 'Deputy', 'Outlaw', 'Renegade'];

// ── Nepřátelskost dvojice rolí (>0 = chci útočit, <=0 = spojenec/nestřílet) ────
// Čistá tabulka rolí BEZ čtení stavu. Renegade timing přes opts.outlawsAlive.
function roleHostility(myRole, targetRole, opts = {}) {
    // Hra pro 3 (Město duchů): cíle jsou v kruhu a vyhrává jen jeden, takže nepřítelem je
    // KAŽDÝ. Můj určený nepřítel má prioritu – jeho vyřazením hru rovnou vyhraju; třetí
    // hráč musí umřít taky (novým cílem je pak zůstat naživu jako poslední), ale výhru
    // sám nepřinese.
    if (opts.mode3p && !opts.lastManStanding) return TARGET_3P[myRole] === targetRole ? 3 : 1;
    // Divoký západ (karta vespod balíčku Wild West Show): „Zůstaň poslední ve hře!"
    // Vyhrát může jen jeden, takže je nepřítelem KAŽDÝ – bez téhle větve by strana
    // šerifa v koncovce jen lízala a odhazovala (spojenec podle role není nepřítel)
    // a hra jen botů by nedoběhla. Stejná past, jakou už jednou vyřešilo
    // nouzové cílení (DESPERATE_ENEMY_P, core/botPolicy.js).
    if (opts.lastManStanding) return 1;
    if (myRole === 'Outlaw') {
        if (targetRole === 'Sheriff')  return 3;
        if (targetRole === 'Deputy')   return 2;
        if (targetRole === 'Renegade') return 1;
        return -1; // jiný bandita = spojenec
    }
    if (myRole === 'Sheriff') {
        if (targetRole === 'Outlaw')   return 3;
        if (targetRole === 'Renegade') return 2;
        return -100; // šerif nikdy nestřílí sebe ani pomocníka
    }
    if (myRole === 'Deputy') {
        if (targetRole === 'Outlaw')   return 3;
        if (targetRole === 'Renegade') return 2;
        return -100; // chrání šerifa i ostatní pomocníky
    }
    if (myRole === 'Renegade') {
        // Vyhraje jen jako POSLEDNÍ žijící, tedy až v souboji 1v1 se šerifem. Dokud žije
        // kdokoli další – bandita, pomocník NEBO druhý odpadlík – je zabití šerifa prohra
        // (vyhráli by bandité), takže na něj nestřílí. Pořadí: nejdřív bandité, pomocníci
        // a druhý odpadlík, šerif úplně nakonec.
        const othersAlive = !!opts.outlawsAlive || !!opts.deputiesAlive || !!opts.renegadesAlive;
        if (targetRole === 'Sheriff')  return othersAlive ? -50 : 5;
        if (targetRole === 'Outlaw')   return 3;
        if (targetRole === 'Deputy')   return 2;
        // Při 8 hráčích jsou odpadlíci DVA a každý hraje sám za sebe – druhý odpadlík je
        // tedy rival, ne spojenec (vyhrát můžou jen jednotlivě, jako poslední žijící).
        return 2;
    }
    return 1;
}

// Očekávaná nepřátelskost vůči hráči s rozdělením rolí `dist`.
// Příspěvek každé role ořízneme na ±CLAMP: JISTÝ spojenec zůstane jasně záporný
// (nikdy nestřílet), ale NEJISTOTA nezmrazí bota – jinak by silná hodnota „-100"
// (nestřílet pomocníka) vážená malou pravděpodobností paralyzovala i útok na
// pravděpodobného nepřítele (viz šerif v 5 hráčích na začátku hry).
const HOSTILITY_CLAMP = 6;
function expectedHostility(myRole, dist, opts = {}) {
    if (!dist) return 0;
    let sum = 0;
    for (const r of ROLES) {
        const p = dist[r] || 0;
        if (p) {
            let h = roleHostility(myRole, r, opts);
            if (h > HOSTILITY_CLAMP) h = HOSTILITY_CLAMP;
            else if (h < -HOSTILITY_CLAMP) h = -HOSTILITY_CLAMP;
            sum += p * h;
        }
    }
    return sum;
}

// Jaká je šance, že je hráč s rozdělením `dist` pro mě NEPŘÍTEL (role, na kterou se
// podle roleHostility útočí). Na rozdíl od expectedHostility se neváží silou – slouží
// jen jako pojistka „tohle není JISTÝ spojenec" při nouzovém cílení (viz rankEnemies).
function enemyProbability(myRole, dist, opts = {}) {
    if (!dist) return 0;
    let p = 0;
    for (const r of ROLES) {
        if ((dist[r] || 0) > 0 && roleHostility(myRole, r, opts) > 0) p += dist[r];
    }
    return p;
}

function countRoles(list) {
    const c = { Sheriff: 0, Deputy: 0, Outlaw: 0, Renegade: 0 };
    for (const r of list) if (c[r] !== undefined) c[r]++;
    return c;
}

function ledgerPair(ledger, a, b) {
    const row = ledger && ledger.pairs && ledger.pairs[a];
    const cell = row && row[b];
    return { hostile: (cell && cell.hostile) || 0, support: (cell && cell.support) || 0 };
}

// ── Hlavní: rozdělení rolí pro každého hráče podle veřejných informací ─────────
function computeBeliefs(state, ledger, myIndex) {
    const players = state.players || [];
    const n = players.length;
    const comp = countRoles(rolesForPlayerCount(n));

    // Veřejné jistoty: sebe, šerif (hvězda), mrtví (odhalená role).
    const sheriffIdx = players.findIndex(p => p.role === 'Sheriff');
    const known = {};                         // idx -> jistá role (jen veřejné případy)
    known[myIndex] = players[myIndex] && players[myIndex].role;
    if (sheriffIdx !== -1) known[sheriffIdx] = 'Sheriff';
    // Mrtví mají roli odkrytou – a `_roleRevealed` ji drží i po NÁVRATU do hry: Mrtvý muž
    // (A Fistful of Cards) vrací prvního vyřazeného zpátky, jeho roli u toho ale viděl celý
    // stůl a klient ji dál ukazuje (viz redactState v server/rooms.js). Duch (Město duchů) je
    // zvláštní případ téhož – na svůj tah má životy nad nulou. Bez tohohle by bot byl jediný
    // u stolu, kdo na jednou odhalenou roli zapomene, a hádal by ji znovu od nuly.
    // Rozhoduje VÝHRADNĚ `_roleRevealed`, ne `health <= 0`: přerozdání rolí (Hřbitov,
    // Helena Zontero – Divoký západ) příznak zase shodí, takže je role vyřazeného hráče
    // znovu tajná a bot ji nesmí „znát" o nic víc než ostatní. Zrcadlí to redakci stavu.
    players.forEach((p, i) => { if (p._roleRevealed) known[i] = p.role; });
    // Hra pro 3 (Město duchů): všechny tři role leží lícem nahoru, takže se nic nededukuje.
    if (state.mode3p) players.forEach((p, i) => { known[i] = p.role; });

    // Zbývající „pool" rolí po odečtení jistot.
    const pool = { ...comp };
    for (const i in known) { const r = known[i]; if (pool[r] !== undefined) pool[r]--; }

    // Neznámí = hráči bez jisté role. Normálně jsou to právě ti živí (každý vyřazený má
    // roli odkrytou), po přerozdání rolí mezi VYŘAZENÝMI (Hřbitov – Divoký západ) sem ale
    // patří i oni: jejich role zase nikdo nezná a pod Hřbitovem se navíc vracejí do hry.
    // Musí být v poolu, jinak by se jejich role rozprostřely na živé a součet rozdělení
    // by přesáhl 1. Na cílení to nemá vliv – bot střílí jen na hráče ve hře.
    const unknown = [];
    players.forEach((p, i) => { if (known[i] === undefined) unknown.push(i); });

    // Prior: pool rovnoměrně rozprostřený na neznámé (respektuje složení – role, které
    // v poolu nezbyly, mají 0). Neznámý nikdy není Sheriff (šerif je veřejný).
    const prior = {};
    const denom = unknown.length || 1;
    for (const r of ROLES) prior[r] = Math.max(0, pool[r]) / denom;

    // ── Zarovnání proti šerifovi z chování (2 iterace: „nepřítel mého nepřítele") ──
    // anti[idx] ∈ ~[-1,1]: >0 = jedná proti straně šerifa (spíš Outlaw/Renegade),
    //                       <0 = jedná pro stranu šerifa (spíš Deputy).
    const alive = players.map((p, i) => p.health > 0 ? i : -1).filter(i => i !== -1);
    const anti = {};
    unknown.forEach(i => { anti[i] = 0; });

    // Statické „zarovnání" jistě známých hráčů (kotvy pro dedukci ostatních).
    const anchorAlign = (idx) => {
        if (idx === sheriffIdx) return -1;                 // šerif = pro-šerif strana
        const kr = known[idx];
        if (kr === 'Deputy') return -1;
        if (kr === 'Outlaw' || kr === 'Renegade') return 1;
        return null;                                        // neznámý → dynamické anti
    };

    const W_SHERIFF = 0.9, W_SECOND = 0.5, W_ONME = 0.6;
    const myRole = players[myIndex] && players[myIndex].role;
    const iAmSheriffSide = myRole === 'Sheriff' || myRole === 'Deputy';

    for (let iter = 0; iter < 3; iter++) {
        const next = {};
        unknown.forEach(X => {
            let s = 0;
            alive.forEach(Y => {
                if (Y === X) return;
                const alignY = anchorAlign(Y) != null ? anchorAlign(Y) : (anti[Y] || 0);
                if (!alignY) return;
                const { hostile, support } = ledgerPair(ledger, X, Y);
                // Útok na hráče se zarovnáním alignY → X je opačně zarovnaný.
                // Podpora hráče se zarovnáním alignY → X je stejně zarovnaný.
                const w = (Y === sheriffIdx) ? W_SHERIFF : W_SECOND;
                if (hostile) s += -alignY * Math.min(hostile, 3) * w;
                if (support) s +=  alignY * Math.min(support, 3) * w;
            });
            // Útoky na mě (jsem-li strana šerifa) → útočník je proti šerifovi.
            if (iAmSheriffSide) {
                const { hostile } = ledgerPair(ledger, X, myIndex);
                if (hostile) s += Math.min(hostile, 3) * W_ONME;
            }
            next[X] = Math.max(-1, Math.min(1, s));
        });
        unknown.forEach(X => { anti[X] = next[X]; });
    }

    // ── Mapování prior + anti → rozdělení rolí ────────────────────────────────
    const K = 0.8;
    const beliefs = new Array(n).fill(null);
    // Jistě známí: degenerované rozdělení.
    for (const i in known) {
        const r = known[i];
        const d = { Sheriff: 0, Deputy: 0, Outlaw: 0, Renegade: 0 };
        if (d[r] !== undefined) d[r] = 1;
        beliefs[i] = d;
    }
    unknown.forEach(X => {
        const a = anti[X] || 0;
        const d = {
            Sheriff: 0,
            Deputy:   prior.Deputy   * (1 - K * a),
            Outlaw:   prior.Outlaw   * (1 + K * a),
            Renegade: prior.Renegade * (1 + K * a * 0.5),
        };
        let tot = d.Deputy + d.Outlaw + d.Renegade;
        if (tot <= 0) { // pool byl prázdný / degenerace → rovnoměrně mezi možné role
            const present = ROLES.filter(r => r !== 'Sheriff' && pool[r] > 0);
            present.forEach(r => { d[r] = 1 / present.length; });
            tot = present.length ? 1 : 0;
        }
        if (tot > 0) { d.Deputy /= tot; d.Outlaw /= tot; d.Renegade /= tot; }
        beliefs[X] = d;
    });

    return beliefs;
}

// Odhad počtu žijících hráčů dané role (pro renegade timing) z beliefů.
function estimateRoleAlive(state, beliefs, role) {
    let sum = 0;
    (state.players || []).forEach((p, i) => {
        if (p.health > 0 && beliefs[i]) sum += beliefs[i][role] || 0;
    });
    return sum;
}

function estimateOutlawsAlive(state, beliefs) { return estimateRoleAlive(state, beliefs, 'Outlaw'); }
// Kolik ŽIJÍCÍCH odpadlíků kromě mě – při 8 hráčích jsou dva a druhý je rival, kvůli
// kterému odpadlík ještě nesmí sáhnout na šerifa (roleHostility, opts.renegadesAlive).
function estimateOtherRenegadesAlive(state, beliefs, myIndex) {
    let sum = 0;
    (state.players || []).forEach((p, i) => {
        if (i !== myIndex && p.health > 0 && beliefs[i]) sum += beliefs[i].Renegade || 0;
    });
    return sum;
}
function estimateDeputiesAlive(state, beliefs) { return estimateRoleAlive(state, beliefs, 'Deputy'); }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { roleHostility, expectedHostility, enemyProbability, computeBeliefs,
                       estimateOutlawsAlive, estimateDeputiesAlive, estimateOtherRenegadesAlive,
                       estimateRoleAlive, ROLES };
}
