const CYRON_BASE = 'https://cyron.pages.dev';

const VISIT_PROXIES = [
    {
        name: 'allorigins',
        fetch: async (url) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            try {
                const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url), { signal: ctrl.signal });
                if (!res.ok) throw new Error('allorigins HTTP ' + res.status);
                const data = await res.json();
                return data.contents || '';
            } finally { clearTimeout(t); }
        }
    },
    {
        name: 'corsproxy.io',
        fetch: async (url) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            try {
                const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(url), { signal: ctrl.signal });
                if (!res.ok) throw new Error('corsproxy HTTP ' + res.status);
                return res.text();
            } finally { clearTimeout(t); }
        }
    },
    {
        name: 'codetabs',
        fetch: async (url) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            try {
                const res = await fetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url), { signal: ctrl.signal });
                if (!res.ok) throw new Error('codetabs HTTP ' + res.status);
                return res.text();
            } finally { clearTimeout(t); }
        }
    }
];

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
    const res = await fetch(CYRON_BASE + '/search/' + encodeURIComponent(query) + '?categories=general&per_page=5');
    if (!res.ok) throw new Error('Cyron HTTP ' + res.status);
    return res.json();
}

function buildSearchContext(query, data) {
    if (!data || !data.results || !data.results.all || !data.results.all.length) return null;
    const results = data.results.all.slice(0, 5);
    let ctx = 'Web search results for: "' + query + '"\n\n';
    results.forEach((r, i) => {
        ctx += '[' + (i + 1) + '] ' + (r.title || 'No title') + '\n';
        ctx += 'URL: ' + r.url + '\n';
        if (r.content) ctx += r.content.slice(0, 300) + '\n';
        ctx += '\n';
    });
    if (data.answers && data.answers.length) ctx += 'Direct answer: ' + data.answers[0] + '\n\n';
    if (data.infobox && data.infobox.content) ctx += 'Info: ' + data.infobox.content.slice(0, 400) + '\n\n';
    ctx += "Use the search results above to answer the user's question. Do NOT output any HTML. Do not include source links or citations in your response.";
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

const VISIT_INTENT_RE = /\b(visit|go to|open|browse|read|check out|look at|fetch|load|scrape|summarize|analyze|what(?:'s| is) (?:on|at)|content of|tell me about|show me)\b/i;
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;

function detectVisitUrl(text) {
    const urls = text.match(URL_RE);
    if (!urls || !urls.length) return null;
    const hasIntent = VISIT_INTENT_RE.test(text);
    if (hasIntent) return urls[0];
    const stripped = text.replace(URL_RE, '').trim();
    if (stripped.length < 20) return urls[0];
    return null;
}

function parseHtmlToText(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    ['script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside', 'iframe', 'svg'].forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
    });
    const title = doc.title || '';
    const text = (doc.body?.innerText || doc.body?.textContent || '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 8000);
    return { title, text };
}

async function fetchPageText(url) {
    let lastErr;
    for (const proxy of VISIT_PROXIES) {
        updateVisitStatus('Fetching via ' + proxy.name + '…');
        try {
            const html = await proxy.fetch(url);
            if (html && html.length > 50) {
                const result = parseHtmlToText(html);
                if (result.text.length > 10) return result;
            }
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('All proxies failed');
}

function buildVisitContext(url, title, text) {
    let ctx = 'Visited page: ' + url + '\n';
    if (title) ctx += 'Page title: ' + title + '\n';
    ctx += '\n--- Page Content ---\n' + text + '\n--- End of Page Content ---\n\n';
    ctx += "Use the page content above to answer the user's question accurately. Quote the exact text where asked.";
    return ctx;
}

function addVisitStatusBubble() {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = 'msg-row bot';
    row.id = 'visitStatusRow';
    const bub = document.createElement('div');
    bub.className = 'bot-bub search-status-bub';
    bub.innerHTML = '<i class="fa-solid fa-earth-americas" style="font-size:12px;margin-right:6px;color:var(--accent);"></i><span id="visitStatusText">Visiting website…</span>';
    row.appendChild(bub);
    feed.appendChild(row);
    return row;
}

function removeVisitStatusBubble() {
    document.getElementById('visitStatusRow')?.remove();
}

function updateVisitStatus(text) {
    const el = document.getElementById('visitStatusText');
    if (el) el.textContent = text;
}

async function tryGetVisitContext(userMessage) {
    const url = detectVisitUrl(userMessage);
    if (!url) return null;
    addVisitStatusBubble();
    scrollBottom();
    try {
        const { title, text } = await fetchPageText(url);
        updateVisitStatus('Page loaded');
        await new Promise(r => setTimeout(r, 350));
        removeVisitStatusBubble();
        return buildVisitContext(url, title, text);
    } catch {
        updateVisitStatus('Could not load page');
        await new Promise(r => setTimeout(r, 500));
        removeVisitStatusBubble();
        return 'The user asked you to visit ' + url + ' but all proxy fetch attempts failed (network/CORS restriction). Do NOT say you cannot visit websites in general — fetching was attempted and blocked externally. Tell the user you tried but the page was unreachable, and share any relevant knowledge you have about ' + url + ' from training.';
    }
}

async function sendChatTextWithSearch(userMessage, loading, session) {
    const visitContext = await tryGetVisitContext(userMessage);

    if (visitContext) {
        const history = buildConversationHistory(session);
        const messages = [
            { role: 'system', content: buildSystemPrompt() },
            ...history,
            { role: 'user', content: visitContext + '\n\nUser question: ' + userMessage }
        ];

        const res = await fetchChat(messages, currentModel || 'vexa', currentAbortController?.signal);
        let reply = await readSSEStream(res, currentAbortController?.signal);
        if (!reply) throw new Error('Empty response');

        let think = null;
        const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
        if (m) { think = m[1].trim(); reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

        await typewriterSwap(loading, reply, think);
        return reply;
    }

    if (!isSearchMode()) {
        return sendChatText(userMessage, loading, session);
    }

    addSearchStatusBubble();
    scrollBottom();

    let searchContext = null;
    let searchResults = [];

    try {
        let searchQuery = userMessage;
        const lastUserMessage = session.messages[session.messages.length - 2]?.content || '';
        const researchPatterns = [
            /^(research|search|look up|find|google|dig into)\s+(it|that|this|more|deeper)/i,
            /^(tell me more|explain more|what about|research|search)$/i,
            /\b(research it|search it|find more|look up more)\b/i
        ];

        if (researchPatterns.some(p => p.test(userMessage)) && lastUserMessage) {
            try {
                const generated = await fetchQuery(
                    'Generate a concise search query (3-8 words) based on this topic. Only output the search query, nothing else. Topic: ' + lastUserMessage.slice(0, 200),
                    currentModel || 'vexa'
                );
                if (generated && generated.trim().length > 2) {
                    searchQuery = generated.trim().replace(/^["']|["']$/g, '');
                }
            } catch { }
        }

        const data = await cyronSearch(searchQuery);
        searchResults = (data && data.results && data.results.all) ? data.results.all.slice(0, 5) : [];
        searchContext = buildSearchContext(searchQuery, data);
        updateSearchStatus('Search complete');
    } catch {
        updateSearchStatus('Search failed, using AI knowledge…');
    }

    await new Promise(r => setTimeout(r, 350));
    removeSearchStatusBubble();

    const history = buildConversationHistory(session);
    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
        { role: 'user', content: searchContext ? searchContext + '\n\nUser question: ' + userMessage : userMessage }
    ];

    const res = await fetchChat(messages, currentModel || 'vexa', currentAbortController?.signal);
    let reply = await readSSEStream(res, currentAbortController?.signal);
    if (!reply) throw new Error('Empty response');

    let think = null;
    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) { think = m[1].trim(); reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

    await typewriterSwap(loading, reply, think);

    if (searchResults.length) {
        const feed = document.getElementById('feed');
        const bar = document.createElement('div');
        bar.className = 'msg-row bot';
        const bub = document.createElement('div');
        bub.className = 'bot-bub search-sources-bub';
        const sourcesRow = document.createElement('div');
        sourcesRow.className = 'search-sources-row';
        const label = document.createElement('span');
        label.className = 'search-sources-label';
        label.innerHTML = '<i class="fa-solid fa-globe" style="font-size:11px;margin-right:4px;color:var(--accent)"></i>Sources';
        sourcesRow.appendChild(label);
        searchResults.slice(0, 4).forEach(r => {
            let domain = '';
            try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { domain = r.url; }
            const favicon = `https://favicon.vemetric.com/${domain}`;
            const chip = document.createElement('a');
            chip.href = escHtml(r.url);
            chip.target = '_blank';
            chip.rel = 'noopener noreferrer';
            chip.className = 'search-source-chip';
            const img = document.createElement('img');
            img.src = favicon;
            img.className = 'search-source-favicon';
            img.alt = '';
            img.onerror = function () { this.style.display = 'none'; };
            chip.appendChild(img);
            chip.appendChild(document.createTextNode(' ' + domain));
            sourcesRow.appendChild(chip);
        });
        bub.appendChild(sourcesRow);
        bar.appendChild(bub);
        feed.appendChild(bar);
    }

    return reply;
}

function initSearchMode() {
    injectSearchModeButton();

    const origSendText = window.sendText;
    window.sendText = async function (text) {
        const hasVisitUrl = !!detectVisitUrl(text);

        if (!isSearchMode() && !hasVisitUrl) {
            return origSendText(text);
        }

        busy = true;
        showPageRaw('chat');
        document.querySelector('.chat-wrap')?.classList.remove('empty-chat');
        document.getElementById('feedEmpty')?.remove();

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
            removeVisitStatusBubble();
            if (err.name === 'AbortError' || err.message?.includes('aborted')) {
                swapText(loading, 'Chat stopped');
            } else {
                swapText(loading, 'Error — ' + (err.message || 'try again.'));
            }
        }

        if (aiReply) {
            session.messages.push({ role: 'assistant', content: aiReply });
            const s = typeof getVexaSettings === 'function' ? getVexaSettings() : {};
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
