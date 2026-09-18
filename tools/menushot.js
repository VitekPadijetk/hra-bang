// tools/menushot.js — snímek HTML menu v headless Chrome (ověření vzhledu bez prohlížeče).
// Plátno (herní stůl) se tím ověřit nedá, HTML vrstva menu ano (docs/menu-ui-plan.md).
//
//   node tools/menushot.js <url> <šířka>x<výška> <výstup.png> [js…]
//
// Každý další argument je JS, který se vyhodnotí v okně (postupně, s pauzou 400 ms),
// např. "localStorage.setItem('bangTheme','light')" nebo "MENU_ACTIONS.name()".
// Před prvním krokem se stránka načte znovu, takže localStorage z kroku platí.
// Chrome hledá na obvyklých cestách, jinak CHROME=… v prostředí. Server musí běžet.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [url, size, out, ...steps] = process.argv.slice(2);
if (!url || !size || !out) {
    console.error('použití: node tools/menushot.js <url> <šířka>x<výška> <výstup.png> [js…]');
    process.exit(2);
}
const [width, height] = size.split('x').map(Number);

const CANDIDATES = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = CANDIDATES.find(p => fs.existsSync(p));
if (!chromePath) { console.error('Chrome nenalezen (nastav CHROME=…)'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'menushot-'));
const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });

async function main() {
    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            target = list.find(t => t.type === 'page');
        } catch (_) { await sleep(100); }
    }
    if (!target) throw new Error('Chrome neodpovídá');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let seq = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    const send = (method, params = {}) => new Promise((res) => {
        const id = ++seq;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expr) => {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true });
        if (r.result?.exceptionDetails) console.error('chyba v kroku:', expr, '\n ', r.result.exceptionDetails.exception?.description);
    };

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await sleep(2500);
    if (steps.length) {
        // localStorage z prvního kroku se projeví až po načtení – proto krok, reload, zbytek.
        await evaluate(steps[0]);
        await send('Page.reload');
        await sleep(2500);
        await evaluate(steps[0]);
        for (const s of steps.slice(1)) { await evaluate(s); await sleep(400); }
    }
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    console.log('uloženo', out);
    ws.close();
}

main().catch(e => { console.error(e.message || e); process.exitCode = 1; })
    .finally(() => {
        chrome.kill();
        setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} }, 500);
    });
