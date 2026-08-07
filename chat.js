// Registrace socket handleru pro chat (socket je definován v game.js, který se načítá před tímto souborem)
socket.on('chat_message', (msg) => {
    App.chatMessages.push(msg);
    if (App.chatMessages.length > 200) App.chatMessages.shift();
    appendChatMessage(msg);
    if (!App.chatOpen) {
        App.chatUnread++;
        updateChatBadge();
    }
});

function initChat() {
    if (document.getElementById('chat-root')) return;

    const style = document.createElement('style');
    style.textContent = `
    #chat-root { position:fixed; bottom:0; right:0; width:420px; height:100vh;
        display:flex; flex-direction:column; z-index:3000;
        transform:translateX(100%); transition:transform 0.35s cubic-bezier(.4,0,.2,1);
        background:rgba(20,17,24,0.98); border-left:2px solid #8a6d1f;
        font-family:'Oswald','Trebuchet MS',sans-serif; box-sizing:border-box; }
    #chat-root.open { transform:translateX(0); }
    #chat-header { padding:12px 16px; background:#141118; border-bottom:1px solid #3a3242;
        font-size:18px; color:#e0b23c; font-weight:600; letter-spacing:0.5px;
        flex-shrink:0; display:flex; align-items:center; }
    #chat-close { margin-left:auto; cursor:pointer; font-size:20px; color:#9a9088; padding:0 4px; transition:color 0.15s; }
    #chat-close:hover { color:#d64545; }
    #chat-messages { flex:1; overflow-y:auto; padding:10px 14px; display:flex; flex-direction:column; gap:6px; }
    #chat-messages::-webkit-scrollbar { width:5px; }
    #chat-messages::-webkit-scrollbar-thumb { background:#3a3242; border-radius:3px; }
    .chat-msg { padding:7px 11px; border-radius:10px; background:#26212f; max-width:100%; word-break:break-word;
        border:1px solid #3a3242; }
    .chat-msg.mine { background:#33291a; border-color:#8a6d1f; align-self:flex-end; }
    .chat-name { font-size:12px; color:#c9a24a; font-weight:600; margin-bottom:2px; }
    .chat-msg.mine .chat-name { color:#e0b23c; }
    .chat-text { font-size:15px; color:#f2ede4; line-height:1.4; }
    .chat-time { font-size:10px; color:#6b6560; margin-top:2px; text-align:right; }
    #chat-input-row { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #3a3242;
        background:#141118; flex-shrink:0; }
    #chat-input { flex:1; background:#0f0d12; color:#f2ede4; border:1px solid #3a3242; border-radius:8px;
        font-family:'Oswald',sans-serif; padding:8px 12px; font-size:15px; outline:none; resize:none; height:40px; }
    #chat-input:focus { border-color:#e0b23c; }
    #chat-send { padding:0 16px; background:#4a3a12; color:#e0b23c; border:1px solid #8a6d1f; border-radius:8px;
        cursor:pointer; font-family:'Oswald',sans-serif; font-size:14px; font-weight:600; white-space:nowrap; transition:background 0.15s; }
    #chat-send:hover { background:#5c4915; }
    #chat-toggle-btn { position:fixed; bottom:80px; right:20px; width:54px; height:54px;
        background:rgba(30,26,36,0.95); border-radius:50%; z-index:3001; cursor:pointer;
        display:flex; align-items:center; justify-content:center; font-size:24px;
        border:2px solid #8a6d1f; transition:transform 0.2s; box-shadow:0 2px 14px rgba(0,0,0,0.6); }
    #chat-toggle-btn:hover { transform:scale(1.12); border-color:#e0b23c; }
    #chat-badge { position:absolute; top:-4px; right:-4px; background:#d64545; color:#fff;
        border-radius:50%; width:20px; height:20px; font-size:11px; font-weight:bold;
        display:none; align-items:center; justify-content:center; pointer-events:none; }

    /* Mobil / malý displej: postranní panel 420px překryje víc než polovinu obrazovky.
       Přepíná se na spodní panel přes celou šířku (vyjíždí zdola, tedy translateY –
       přepsat se musí OBĚ polohy, zavřená i .open). Vstupní pole musí mít aspoň 16px,
       jinak iOS Safari při zaměření zoomuje celou stránku a hra se rozjede. */
    @media (max-width:900px), (pointer:coarse) {
        #chat-root { width:100%; left:0; right:0; height:60vh; height:60dvh;
            border-left:none; border-top:2px solid #8a6d1f;
            transform:translateY(100%); }
        #chat-root.open { transform:translateY(0); }
        #chat-header { font-size:20px; padding:14px 16px; }
        #chat-close { font-size:26px; padding:0 10px; }
        .chat-text { font-size:16px; }
        .chat-name { font-size:13px; }
        #chat-input-row { padding-bottom:calc(10px + env(safe-area-inset-bottom)); }
        #chat-input { font-size:16px; height:46px; }
        #chat-send { font-size:16px; padding:0 20px; }
        #chat-toggle-btn { width:64px; height:64px; font-size:30px;
            bottom:calc(16px + env(safe-area-inset-bottom));
            right:calc(16px + env(safe-area-inset-right)); }
        #chat-badge { width:24px; height:24px; font-size:13px; }
    }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'chat-root';
    panel.innerHTML = `
        <div id="chat-header">💬 Herní chat
            <span id="chat-close">✕</span>
        </div>
        <div id="chat-messages"></div>
        <div id="chat-input-row">
            <input id="chat-input" type="text" placeholder="Napiš zprávu…" maxlength="300" autocomplete="off">
            <button id="chat-send">Odeslat</button>
        </div>`;
    document.body.appendChild(panel);

    const toggleBtn = document.createElement('div');
    toggleBtn.id = 'chat-toggle-btn';
    toggleBtn.innerHTML = `<span id="chat-icon">💬</span><span id="chat-badge"></span>`;
    document.body.appendChild(toggleBtn);

    const input = panel.querySelector('#chat-input');
    const sendBtn = panel.querySelector('#chat-send');

    function sendMsg() {
        const text = input.value.trim();
        if (!text) return;
        socket.emit('chat_message', { text });
        input.value = '';
    }

    sendBtn.addEventListener('click', sendMsg);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
    panel.querySelector('#chat-close').addEventListener('click', toggleChat);
    toggleBtn.addEventListener('click', toggleChat);

    App.chatMessages.forEach(m => appendChatMessage(m));
}

function toggleChat() {
    const panel = document.getElementById('chat-root');
    if (!panel) return;
    App.chatOpen = !App.chatOpen;
    if (App.chatOpen) {
        panel.classList.add('open');
        document.getElementById('chat-icon').textContent = '✕';
        App.chatUnread = 0;
        updateChatBadge();
        const msgs = document.getElementById('chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    } else {
        panel.classList.remove('open');
        document.getElementById('chat-icon').textContent = '💬';
    }
}

function updateChatBadge() {
    const badge = document.getElementById('chat-badge');
    if (!badge) return;
    const n = App.chatUnread;
    badge.style.display = n > 0 ? 'flex' : 'none';
    badge.textContent = n > 9 ? '9+' : String(n);
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const isMine = msg.name === playerName;
    const div = document.createElement('div');
    div.className = 'chat-msg' + (isMine ? ' mine' : '');
    const t = new Date(msg.ts);
    const timeStr = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0');
    div.innerHTML = `<div class="chat-name">${escHtml(msg.name)}</div>
        <div class="chat-text">${escHtml(msg.text)}</div>
        <div class="chat-time">${timeStr}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (App.chatOpen) container.scrollTop = container.scrollHeight;
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showOrHideChat(inGame) {
    const btn = document.getElementById('chat-toggle-btn');
    const panel = document.getElementById('chat-root');
    if (inGame) {
        if (!document.getElementById('chat-root')) initChat();
        if (btn) btn.style.display = 'flex';
    } else {
        if (btn) btn.style.display = 'none';
        if (panel) { panel.classList.remove('open'); App.chatOpen = false; }
    }
}
