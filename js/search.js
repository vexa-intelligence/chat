const CYRON_BASE = 'https://cyron.pages.dev';

let searchModeEnabled = false;

function isSearchMode() {
    return searchModeEnabled;
}

function toggleSearchMode() {
    searchModeEnabled = !searchModeEnabled;
    const btn = document.getElementById('searchModeBtn');
    if (!btn) return;
    if (searchModeEnabled) {
        btn.classList.add('active');
        btn.title = 'Web search on';
    } else {
        btn.classList.remove('active');
        btn.title = 'Web search off';
    }
}

function injectSearchModeButton() {
    const searchBtn = document.getElementById('searchModeBtn');
    if (!searchBtn) return;
    searchBtn.addEventListener('click', toggleSearchMode);
}

async function cyronSearch(query) {
    const res = await fetch(`${CYRON_BASE}/search/${encodeURIComponent(query)}?categories=general&per_page=5`);
    if (!res.ok) throw new Error('Cyron HTTP ' + res.status);
    return res.json();
}

function buildSearchContext(query, data) {
    if (!data || !data.results || !data.results.all || !data.results.all.length) {
        return null;
    }

    const results = data.results.all.slice(0, 5);

    let ctx = `Web search results for: "${query}"\n\n`;
    results.forEach((r, i) => {
        ctx += `[${i + 1}] ${r.title || 'No title'}\n`;
        ctx += `URL: ${r.url}\n`;
        if (r.content) ctx += `${r.content.slice(0, 300)}\n`;
        ctx += '\n';
    });

    if (data.answers && data.answers.length) {
        ctx += `Direct answer: ${data.answers[0]}\n\n`;
    }

    if (data.infobox && data.infobox.content) {
        ctx += `Info: ${data.infobox.content.slice(0, 400)}\n\n`;
    }

    ctx += 'Use the search results above to answer the user\'s question. Cite sources by referencing their title and URL inline where relevant.';
    return ctx;
}

function addSearchStatusBubble() {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = 'msg-row bot search-status-row';
    row.id = 'searchStatusRow';
    const bub = document.createElement('div');
    bub.className = 'bot-bub search-status-bub';
    bub.innerHTML = '<i class="fa-solid fa-globe" style="font-size:12px;margin-right:6px;color:var(--accent);"></i><span class="search-status-text">Searching the web…</span>';
    row.appendChild(bub);
    feed.appendChild(row);
    return row;
}

function removeSearchStatusBubble() {
    document.getElementById('searchStatusRow')?.remove();
}

function updateSearchStatus(text) {
    const el = document.querySelector('.search-status-text');
    if (el) el.textContent = text;
}

function addSearchSourcesBar(results) {
    if (!results || !results.length) return;
    const feed = document.getElementById('feed');
    const bar = document.createElement('div');
    bar.className = 'msg-row bot';
    const bub = document.createElement('div');
    bub.className = 'bot-bub search-sources-bub';

    const chips = results.slice(0, 4).map(r => {
        let domain = '';
        try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { domain = r.url; }
        return `<a href="${escHtml(r.url)}" target="_blank" rel="noopener noreferrer" class="search-source-chip"><i class="fa-solid fa-link" style="font-size:10px"></i> ${escHtml(domain)}</a>`;
    }).join('');

    bub.innerHTML = `<div class="search-sources-row"><span class="search-sources-label"><i class="fa-solid fa-globe" style="font-size:11px;margin-right:4px;color:var(--accent)"></i>Sources</span>${chips}</div>`;
    bar.appendChild(bub);
    feed.appendChild(bar);
}

const _origSendChatText = window.sendChatText;

async function sendChatTextWithSearch(userMessage, loading, session) {
    if (!isSearchMode()) {
        return sendChatText(userMessage, loading, session);
    }

    const statusRow = addSearchStatusBubble();
    scrollBottom();

    let searchContext = null;
    let searchResults = [];

    try {
        const data = await cyronSearch(userMessage);
        searchResults = (data && data.results && data.results.all) ? data.results.all.slice(0, 5) : [];
        searchContext = buildSearchContext(userMessage, data);
        updateSearchStatus('Search complete');
    } catch (err) {
        updateSearchStatus('Search failed, using AI knowledge…');
    }

    await new Promise(r => setTimeout(r, 350));
    removeSearchStatusBubble();

    if (searchResults.length) {
        addSearchSourcesBar(searchResults);
        scrollBottom();
    }

    const history = buildConversationHistory(session);

    const systemContent = buildSystemPrompt();

    const messages = [
        { role: 'system', content: systemContent },
        ...history,
        {
            role: 'user',
            content: searchContext
                ? `${searchContext}\n\nUser question: ${userMessage}`
                : userMessage
        }
    ];

    const res = await fetch(`${CONFIG.BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: currentModel || 'vexa', messages })
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const raw = await res.json();

    if (!raw.success) {
        throw new Error(raw.error || 'API returned success: false');
    }

    let reply = String(extractText(raw)).trim();
    let think = null;
    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) { think = m[1].trim(); reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

    await typewriterSwap(loading, reply, think);
    return reply;
}

function initSearchMode() {
    injectSearchModeButton();

    const style = document.createElement('style');
    style.textContent = `
        #searchModeBtn.active {
            background: color-mix(in srgb, var(--accent) 12%, transparent);
        }
        .search-status-bub {
            display: flex;
            align-items: center;
            padding: 8px 14px;
            font-size: 0.8125rem;
            color: var(--muted);
            background: var(--surface);
            border-radius: var(--radius-lg);
            animation: pulse-opacity 1.4s ease-in-out infinite;
        }
        @keyframes pulse-opacity {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .search-sources-bub {
            padding: 8px 12px;
            background: var(--surface);
            border-radius: var(--radius-lg);
        }
        .search-sources-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .search-sources-label {
            font-size: 0.75rem;
            color: var(--muted);
            flex-shrink: 0;
        }
        .search-source-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 9px;
            border-radius: 999px;
            background: var(--surface2);
            color: var(--fg-muted);
            font-size: 0.72rem;
            text-decoration: none;
            border: 1px solid var(--border-light);
            transition: background 0.15s;
        }
        .search-source-chip:hover {
            background: var(--surface3);
            color: var(--fg);
        }
    `;
    document.head.appendChild(style);

    const origSendText = window.sendText;
    window.sendText = async function (text) {
        if (!isSearchMode()) {
            return origSendText(text);
        }

        busy = true;
        showPageRaw('chat');
        document.querySelector('.chat-wrap')?.classList.remove('empty-chat');
        const feedEmpty = document.getElementById('feedEmpty');
        if (feedEmpty) feedEmpty.remove();

        if (!currentUser) {
            const feed = document.getElementById('feed');
            feed.innerHTML = '';
            const row = document.createElement('div');
            row.className = 'msg-row bot';
            const bub = document.createElement('div');
            bub.className = 'bot-bub';
            bub.innerHTML = '<p>Please <a href="#" onclick="openAuthOverlay()" style="color:var(--accent);text-decoration:underline;">create an account</a> to start chatting with Vexa.</p>';
            row.appendChild(bub);
            feed.appendChild(row);
            busy = false;
            return;
        }

        let session;
        if (!currentSessionId || !chatSessions.find(s => s.id === currentSessionId)) {
            const newId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
            session = { id: newId, title: text.slice(0, 40), messages: [] };
            chatSessions.unshift(session);
            currentSessionId = newId;
            window.history.pushState({}, '', '/chat/' + newId);
            renderChatHistory();
        } else {
            session = chatSessions.find(s => s.id === currentSessionId);
        }

        if (editingMsgIndex !== null) {
            session.messages = session.messages.slice(0, editingMsgIndex);
            editingMsgIndex = null;
            document.getElementById('editIndicator')?.remove();
            const feed = document.getElementById('feed');
            const rows = feed.querySelectorAll('.msg-row');
            const keepRows = session.messages.length;
            Array.from(rows).slice(keepRows).forEach(r => r.remove());
        }

        const msgIndex = session.messages.length;
        session.messages.push({ role: 'user', content: text });
        addBubble('user', text, msgIndex);
        const loading = addLoading();

        let aiReply = null;
        try {
            aiReply = await sendChatTextWithSearch(text, loading, session);
        } catch (err) {
            removeSearchStatusBubble();
            swapText(loading, 'Error - ' + (err.message || 'try again.'));
        }

        if (aiReply) {
            session.messages.push({ role: 'assistant', content: aiReply });
            const s = getVexaSettings ? getVexaSettings() : {};
            if (s.autoTitle !== false && session.messages.filter(m => m.role === 'user').length === 1) {
                const aiTitle = await generateChatTitle(text, typeof aiReply === 'string' ? aiReply : '');
                if (aiTitle) {
                    session.title = aiTitle;
                    renderChatHistory();
                }
            }
            await saveChatToFirebase(session.id, session.title, session.messages);
        }

        busy = false;
        const sbtn = document.getElementById('sbtn');
        const inp = document.getElementById('inp');
        if (sbtn) sbtn.disabled = !inp?.value.trim();
        if (inp) inp.focus();
        const feed = document.getElementById('feed');
        if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    };
}

document.addEventListener('DOMContentLoaded', initSearchMode);