// core/beliefs.js — ČISTÝ izomorfní modul: „za koho koho bot považuje".
//
// Bot NEZNÁ skryté role ostatních. Odvozuje je jen z VEŘEJNÝCH informací:
//   • složení rolí podle počtu hráčů (rolesForPlayerCount) – ví, KOLIK je kterého,
//   • veřejný šerif (hvězda) – jistota,
//   • mrtví hráči – po smrti se role odhalí (jistota),
//   • vlastní role – svou zná,
//   • ledger chování (kdo na koho útočil / koho léčil) – veřejné akce.
// Z toho spočítá pro každého ŽIJÍCÍHO neznámého hráče pravděpodobnostní rozdělení
// rolí a z něj „očekávanou nepřátelskost" pro cílení. Čtení `p.role` je povoleno JEN
// pro veřejné případy (sebe, šerif, mrtví) – živého neznámého se `role` nikdy nedotýká.
//
// Exporty:
//   roleHostility(myRole, targetRole, opts) -> number  (nepřátelskost dvojice rolí)
//   computeBeliefs(state, ledger, myIndex)  -> beliefs[] (rozdělení rolí na hráče)
//   expectedHostility(myRole, dist, opts)   -> number  (Σ P(role)·roleHostility)

if (typeof require === 'function') {
    if (typeof rolesForPlayerCount === 'undefined') {
        globalThis.rolesForPlayerCount = require('./roles.js').rolesForPlayerCount;
    }
}

const ROLES = ['Sheriff', 'Deputy', 'Outlaw', 'Renegade'];

// ── Nepřátelskost dvojice rolí (>0 = chci útočit, <=0 = spojenec/nestřílet) ────
// Čistá tabulka rolí BEZ čtení stavu. Renegade timing přes opts.outlawsAlive.
function roleHostility(myRole, targetRole, opts = {}) {
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
        // Chce zůstat poslední → sráží silnější stranu, šerifa nechává na konec (1v1).
        const outlawsAlive = !!opts.outlawsAlive;
        if (targetRole === 'Sheriff')  return outlawsAlive ? -50 : 5;
        if (targetRole === 'Outlaw')   return 3;
        if (targetRole === 'Deputy')   return 2;
        return -1; // jiný odpadlík (vzácné / prakticky nenastane)
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
    players.forEach((p, i) => { if (p.health <= 0) known[i] = p.role; }); // mrtví = veřejní

    // Zbývající „pool" rolí po odečtení jistot.
    const pool = { ...comp };
    for (const i in known) { const r = known[i]; if (pool[r] !== undefined) pool[r]--; }

    // Neznámí = živí hráči bez jisté role.
    const unknown = [];
    players.forEach((p, i) => { if (p.health > 0 && known[i] === undefined) unknown.push(i); });

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

// Odhad počtu žijících Outlawů (pro renegade timing) z beliefů.
function estimateOutlawsAlive(state, beliefs) {
    let sum = 0;
    (state.players || []).forEach((p, i) => {
        if (p.health > 0 && beliefs[i]) sum += beliefs[i].Outlaw || 0;
    });
    return sum;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { roleHostility, expectedHostility, computeBeliefs, estimateOutlawsAlive, ROLES };
}
