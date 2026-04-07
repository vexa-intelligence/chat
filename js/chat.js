let busy = false;
let chatSessions = [];
let currentSessionId = null;
let currentModel = '';
let currentModelLabel = 'Vexa';

const IMG_RE = /\b(generate|create|draw|make|paint|render|produce|design|imagine)\b[\s\S]{0,60}?\b(image|picture|photo|illustration|artwork|painting|drawing|portrait|landscape|scene|wallpaper)\b|\b(image|picture|photo)\s+of\b|^(draw|paint|generate|render|imagine)\b/i;

function isImg(t) { return IMG_RE.test(t); }

function cleanImgPrompt(t) {
    return t.replace(/\b(please|can you|could you|hey|vexa)\b/gi, '')
        .replace(/\b(generate|create|draw|make|paint|render|produce|design|imagine)\b/gi, '')
        .replace(/\b(an?|the)\s+(image|picture|photo|illustration|artwork|painting|drawing|portrait)\b/gi, '')
        .replace(/\b(image|picture|photo)\s+(of|showing|depicting)\b/gi, '')
        .replace(/\s+/g, ' ').trim() || t;
}

function escHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(t) {
    return String(t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
}

function extractText(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return String(raw);
    const v = raw.response ?? raw.message ?? raw.content ?? raw.text ?? raw.reply ?? raw.output ?? raw.result;
    if (v !== undefined && String(v).trim() !== '') return String(v);
    if (Array.isArray(raw.choices) && raw.choices.length) {
        const c = raw.choices[0];
        return String(c?.message?.content ?? c?.text ?? '');
    }
    return JSON.stringify(raw);
}

function scrollBottom() {
    requestAnimationFrame(() => {
        const feed = document.getElementById('feed');
        if (feed) feed.scrollTop = feed.scrollHeight;
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function addBubble(role, text) {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = 'msg-row ' + (role === 'user' ? 'user' : 'bot');
    const bub = document.createElement('div');
    bub.className = role === 'user' ? 'user-bub' : 'bot-bub';
    bub.innerHTML = role === 'user'
        ? escHtml(text).replace(/\n/g, '<br>')
        : '<p>' + fmt(text) + '</p>';
    row.appendChild(bub);
    feed.appendChild(row);
    scrollBottom();
    return row;
}

function addLoading() {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = 'msg-row bot';
    const bub = document.createElement('div');
    bub.className = 'bot-bub';
    bub.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
    row.appendChild(bub);
    feed.appendChild(row);
    scrollBottom();
    return row;
}

function swapText(row, text) {
    row.querySelector('.bot-bub').innerHTML = '<p>' + fmt(text) + '</p>';
    scrollBottom();
}

function swapImage(row, url, prompt) {
    const bub = row.querySelector('.bot-bub');
    bub.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'gen-img-wrap';
    const cap = document.createElement('div');
    cap.className = 'gen-img-cap';
    cap.textContent = prompt;
    const img = document.createElement('img');
    img.className = 'gen-img';
    img.src = url;
    img.alt = prompt;
    img.onload = scrollBottom;
    img.onerror = () => { bub.innerHTML = '<p>' + fmt('Could not load image.') + '</p>'; };
    wrap.appendChild(cap);
    wrap.appendChild(img);
    bub.appendChild(wrap);
    scrollBottom();
    saveMyImage(url, prompt);
}

async function typewriterSwap(row, text, think) {
    const bub = row.querySelector('.bot-bub');
    bub.innerHTML = '';
    if (think) {
        const block = document.createElement('div');
        block.className = 'think-block';
        block.innerHTML = `<div class="think-head"><svg class="think-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><span class="think-lbl">Reasoning</span></div><div class="think-body">${escHtml(think)}</div>`;
        block.querySelector('.think-head').addEventListener('click', () => block.classList.toggle('open'));
        bub.appendChild(block);
    }
    const textEl = document.createElement('div');
    bub.appendChild(textEl);
    const cur = document.createElement('span');
    cur.className = 'tw-cur';
    textEl.appendChild(cur);
    const tokens = tokenize(text);
    let rendered = '';
    for (let i = 0; i < tokens.length; i++) {
        rendered += tokens[i];
        textEl.innerHTML = '<p>' + fmt(rendered) + '</p>';
        textEl.appendChild(cur);
        scrollBottom();
        await sleep(tokens[i].length > 3 ? 5 : 14);
    }
    cur.remove();
    textEl.innerHTML = '<p>' + fmt(rendered) + '</p>';
    scrollBottom();
}

function tokenize(text) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        if (text[i] === ' ') {
            let j = i;
            while (j < text.length && text[j] === ' ') j++;
            chunks.push(text.slice(i, j));
            i = j;
        } else {
            let j = i;
            while (j < text.length && text[j] !== ' ') j++;
            const word = text.slice(i, j);
            if (word.length > 8) {
                let k = i;
                while (k < j) { const end = Math.min(k + 3, j); chunks.push(text.slice(k, end)); k = end; }
            } else chunks.push(word);
            i = j;
        }
    }
    return chunks;
}

async function generateChatTitle(userMessage, aiReply) {
    try {
        const res = await fetch(`${CONFIG.BASE}/query?q=${encodeURIComponent(
            `In 4 words or fewer, write a short title for this conversation. Only output the title, no punctuation.\nUser: ${userMessage.slice(0, 200)}\nAssistant: ${aiReply.slice(0, 200)}`
        )}&model=${encodeURIComponent(currentModel || '')}`);
        if (!res.ok) return null;
        const raw = await res.json();
        const title = String(extractText(raw)).trim().replace(/^["']|["']$/g, '').slice(0, 60);
        return title || null;
    } catch { return null; }
}

async function generateEmptyTitle() {
    try {
        const res = await fetch(`${CONFIG.BASE}/query?q=${encodeURIComponent(
            'Generate a short question or prompt to start a conversation with an AI assistant, in 6 words or fewer. Only output the prompt.'
        )}&model=${encodeURIComponent(currentModel || '')}`);
        if (!res.ok) return '';
        const raw = await res.json();
        const title = String(extractText(raw)).trim().replace(/^["']|["']$/g, '').slice(0, 100);
        return title || '';
    } catch { return ''; }
}

async function saveChatToFirebase(sessionId, title, messages) {
    const db = window.firebaseDB;
    if (!db || !currentUser) return;
    try {
        await db.collection('chat_sessions').doc(sessionId).set({
            user_id: currentUser.uid,
            title,
            messages: JSON.stringify(messages),
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error('Error saving chat:', e);
    }
}

async function loadChatsFromFirebase() {
    const db = window.firebaseDB;
    if (!db || !currentUser) return;
    try {
        const snapshot = await db.collection('chat_sessions')
            .where('user_id', '==', currentUser.uid)
            .orderBy('updated_at', 'desc')
            .limit(50)
            .get();
        chatSessions = snapshot.docs.map(doc => {
            const data = doc.data();
            let messages = [];
            try { messages = JSON.parse(data.messages || '[]'); } catch { }
            return { id: doc.id, title: data.title || 'Chat', messages };
        });
        renderChatHistory();
    } catch (e) {
        console.error('Error loading chats:', e);
    }
}

async function deleteChatFromFirebase(id) {
    const db = window.firebaseDB;
    if (!db || !currentUser) return;
    try {
        await db.collection('chat_sessions').doc(id).delete();
    } catch (e) {
        console.error('Error deleting chat:', e);
    }
}

async function clearAllChatsFromFirebase() {
    const db = window.firebaseDB;
    if (!db || !currentUser) return;
    try {
        const snapshot = await db.collection('chat_sessions')
            .where('user_id', '==', currentUser.uid)
            .get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (e) {
        console.error('Error clearing chats:', e);
    }
}

async function sendChatText(userMessage, loading) {
    let url = `${CONFIG.BASE}/query?q=${encodeURIComponent(userMessage)}`;
    if (currentModel) url += `&model=${encodeURIComponent(currentModel)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    let reply = String(extractText(raw)).trim();
    let think = null;
    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) { think = m[1].trim(); reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }
    await typewriterSwap(loading, reply, think);
    return reply;
}

async function sendChatImage(prompt, loading) {
    const imgModel = document.getElementById('image-model-select')?.value || 'hd';
    const res = await fetch(`${CONFIG.BASE}/image?q=${encodeURIComponent(prompt)}&model=${encodeURIComponent(imgModel)}`);
    if (!res.ok) throw new Error('Image API ' + res.status);
    const raw = await res.json();
    const remoteUrl = raw.proxy_url ?? raw.url ?? raw.image ?? raw.src ?? (raw.data && (raw.data.url ?? raw.data.proxy_url)) ?? '';
    if (!remoteUrl) { swapText(loading, 'No image URL returned.'); return null; }
    let displayUrl;
    try {
        const resp = await fetch(String(remoteUrl));
        if (!resp.ok) throw new Error();
        const blob = await resp.blob();
        displayUrl = URL.createObjectURL(blob);
    } catch { displayUrl = String(remoteUrl); }
    swapImage(loading, displayUrl, prompt);

    try {
        const resp = await fetch(String(remoteUrl));
        const blob = await resp.blob();
        const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        return { type: 'image', prompt, dataUrl };
    } catch {
        return { type: 'image', prompt, url: remoteUrl };
    }
}

async function sendText(text) {
    busy = true;
    showPage('chat');
    const feedEmpty = document.getElementById('feedEmpty');
    if (feedEmpty) feedEmpty.style.display = 'none';

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
        renderChatHistory();
    } else {
        session = chatSessions.find(s => s.id === currentSessionId);
    }

    session.messages.push({ role: 'user', content: text });
    addBubble('user', text);
    const loading = addLoading();

    let aiReply = null;
    try {
        if (isImg(text)) {
            aiReply = await sendChatImage(cleanImgPrompt(text), loading);
        } else {
            aiReply = await sendChatText(text, loading);
        }
    } catch (err) {
        swapText(loading, 'Error — ' + (err.message || 'try again.'));
    }

    if (aiReply) {
        session.messages.push({ role: 'assistant', content: aiReply });
        if (session.messages.length === 2) {
            const aiTitle = await generateChatTitle(text, aiReply);
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
    scrollBottom();
}

async function loadSessionIntoChat(session) {
    currentSessionId = session.id;
    const feed = document.getElementById('feed');
    feed.innerHTML = '';
    if (!session.messages || !session.messages.length) {
        const empty = document.createElement('div');
        empty.className = 'feed-empty';
        empty.id = 'feedEmpty';
        const title = await generateEmptyTitle();
        empty.innerHTML = `<div class="feed-empty-title">${escHtml(title)}</div>`;
        feed.appendChild(empty);
        return;
    }
    session.messages.forEach(msg => {
        if (msg.content && typeof msg.content === 'object' && msg.content.type === 'image') {
            const row = addBubble(msg.role === 'user' ? 'user' : 'bot', '');
            if (msg.role === 'assistant') {
                swapImage(row, msg.content.dataUrl || msg.content.url, msg.content.prompt);
            }
        } else {
            addBubble(msg.role === 'user' ? 'user' : 'bot', msg.content);
        }
    });
    renderChatHistory();
    showPage('chat');
}

function renderChatHistory() {
    const sidebarList = document.getElementById('chatHistoryList');
    const mobileList = document.getElementById('mobileHistoryList');

    if (sidebarList) {
        sidebarList.innerHTML = '';
        chatSessions.slice(0, 50).forEach(s => {
            const item = document.createElement('div');
            item.className = 'history-item' + (s.id === currentSessionId ? ' active' : '');
            item.dataset.id = s.id;
            item.innerHTML = `
                <div class="history-item-content">${escHtml(s.title)}</div>
                <button class="history-item-del" title="Delete" data-id="${escHtml(s.id)}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;

            item.querySelector('.history-item-del').addEventListener('click', e => {
                e.stopPropagation();
                handleChatDelete(s.id);
            });

            item.addEventListener('click', (e) => {
                if (!e.target.closest('.history-item-del')) {
                    loadSessionIntoChat(s);
                }
            });

            sidebarList.appendChild(item);
        });
    }

    if (mobileList) {
        mobileList.innerHTML = '';
        chatSessions.slice(0, 50).forEach(s => {
            const item = document.createElement('div');
            item.className = 'history-item' + (s.id === currentSessionId ? ' active' : '');
            item.dataset.id = s.id;
            item.innerHTML = `
                <div class="history-item-content">${escHtml(s.title)}</div>
                <button class="history-item-del" title="Delete" data-id="${escHtml(s.id)}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;

            item.querySelector('.history-item-del').addEventListener('click', e => {
                e.stopPropagation();
                handleChatDelete(s.id);
            });

            item.addEventListener('click', (e) => {
                if (!e.target.closest('.history-item-del')) {
                    loadSessionIntoChat(s);
                    closeMobileDrawer();
                }
            });

            mobileList.appendChild(item);
        });
    }

    if (typeof syncMobileHistory === 'function') syncMobileHistory();
}

function initChat() {
    const inp = document.getElementById('inp');
    const sbtn = document.getElementById('sbtn');
    inp.addEventListener('input', () => {
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 160) + 'px';
        sbtn.disabled = !inp.value.trim() || busy;
    });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    sbtn.addEventListener('click', doSend);

    initSearch();
}

function doSend() {
    const inp = document.getElementById('inp');
    const text = inp.value.trim();
    if (!text || busy) return;
    inp.value = '';
    inp.style.height = 'auto';
    document.getElementById('sbtn').disabled = true;
    sendText(text);
}

async function newChat() {
    currentSessionId = null;
    renderChatHistory();
    const feed = document.getElementById('feed');
    feed.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.id = 'feedEmpty';
    const title = await generateEmptyTitle();
    empty.innerHTML = `<div class="feed-empty-title">${escHtml(title)}</div>`;
    feed.appendChild(empty);
    showPage('chat');
    document.getElementById('inp')?.focus();
}

function openSearchModal() {
    document.getElementById('searchModalOverlay').classList.remove('hidden');
    document.getElementById('searchInput').focus();
}

function closeSearchModal() {
    document.getElementById('searchModalOverlay').classList.add('hidden');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClearBtn').classList.add('hidden');
    resetSearchResults();
}

function resetSearchResults() {
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = `
        <div class="search-empty-state">
            <i class="fa-solid fa-magnifying-glass" style="font-size:24px;color:var(--muted)"></i>
            <p>Type to search your chat history</p>
        </div>
    `;
}

function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return text.replace(regex, '<span class="search-result-match">$1</span>');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchChats(query) {
    if (!query || query.trim() === '') {
        resetSearchResults();
        return;
    }

    const trimmedQuery = query.trim().toLowerCase();
    const results = [];

    chatSessions.forEach(session => {
        const titleMatch = session.title.toLowerCase().includes(trimmedQuery);

        let contentMatch = false;
        let matchedMessage = null;
        let matchedContent = '';

        if (session.messages && session.messages.length > 0) {
            for (const message of session.messages) {
                let messageContent = '';

                if (typeof message.content === 'string') {
                    messageContent = message.content;
                } else if (message.content && typeof message.content === 'object') {
                    if (message.content.type === 'image') {
                        messageContent = message.content.prompt || '';
                    } else {
                        messageContent = String(message.content);
                    }
                }

                if (messageContent.toLowerCase().includes(trimmedQuery)) {
                    contentMatch = true;
                    matchedMessage = message;
                    matchedContent = messageContent;
                    break;
                }
            }
        }

        if (titleMatch || contentMatch) {
            results.push({
                session,
                titleMatch,
                contentMatch,
                matchedMessage,
                matchedContent
            });
        }
    });

    renderSearchResults(results, trimmedQuery);
}

function renderSearchResults(results, query) {
    const resultsContainer = document.getElementById('searchResults');

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="search-no-results">
                <i class="fa-solid fa-search"></i>
                <p>No chats found matching "${escHtml(query)}"</p>
            </div>
        `;
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() - 1);

    const grouped = {
        'Today': [],
        'Yesterday': [],
        'Previous 7 days': [],
        'Previous 30 days': [],
        'Older': []
    };

    results.forEach(result => {
        const { session } = result;
        const sessionDate = new Date(session.ts || Date.now());

        if (sessionDate >= today) {
            grouped['Today'].push(result);
        } else if (sessionDate >= yesterday) {
            grouped['Yesterday'].push(result);
        } else if (sessionDate >= thisWeek) {
            grouped['Previous 7 days'].push(result);
        } else if (sessionDate >= thisMonth) {
            grouped['Previous 30 days'].push(result);
        } else {
            grouped['Older'].push(result);
        }
    });

    resultsContainer.innerHTML = '';

    Object.entries(grouped).forEach(([groupName, groupResults]) => {
        if (groupResults.length === 0) return;

        const dateHeader = document.createElement('div');
        dateHeader.className = 'search-date-group';
        dateHeader.textContent = groupName;
        resultsContainer.appendChild(dateHeader);

        groupResults.forEach(result => {
            const { session, titleMatch, contentMatch, matchedMessage, matchedContent } = result;

            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';

            let snippet = '';
            if (contentMatch && matchedContent) {
                const matchIndex = matchedContent.toLowerCase().indexOf(query.toLowerCase());
                const start = Math.max(0, matchIndex - 30);
                const end = Math.min(matchedContent.length, matchIndex + query.length + 30);
                snippet = matchedContent.substring(start, end);
                if (start > 0) snippet = '...' + snippet;
                if (end < matchedContent.length) snippet = snippet + '...';

                snippet = highlightMatch(snippet, query);
            }

            resultItem.innerHTML = `
                <div class="search-result-title">${highlightMatch(escHtml(session.title), query)}</div>
                ${snippet ? `<div class="search-result-snippet">${snippet}</div>` : ''}
            `;

            resultItem.addEventListener('click', () => {
                closeSearchModal();
                loadSessionIntoChat(session);
            });

            resultsContainer.appendChild(resultItem);
        });
    });
}

function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchModalOverlay = document.getElementById('searchModalOverlay');

    searchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (value.trim()) {
            searchChats(value);
        } else {
            resetSearchResults();
        }
    });

    searchModalOverlay.addEventListener('click', (e) => {
        if (e.target === searchModalOverlay) {
            closeSearchModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !searchModalOverlay.classList.contains('hidden')) {
            closeSearchModal();
        }
    });
}