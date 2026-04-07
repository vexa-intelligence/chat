let busy = false;
let chatSessions = [];
let currentSessionId = null;
let currentModel = '';
let currentModelLabel = 'Vexa';
let isLoadingSession = false;

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

function fmtTableCell(cell) {
    let processed = escHtml(cell);
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');
    processed = processed.replace(/~~(.+?)~~/g, '<del>$1</del>');
    processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    return processed;
}

const HLJS_LANGS = ['javascript', 'js', 'typescript', 'ts', 'python', 'py', 'java', 'c', 'cpp', 'cs', 'csharp', 'ruby', 'rb', 'go', 'rust', 'swift', 'kotlin', 'php', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'bash', 'sh', 'sql', 'xml', 'markdown', 'md', 'r', 'dart', 'scala', 'perl', 'lua'];

function detectLang(langHint) {
    if (!langHint) return null;
    const l = langHint.toLowerCase().trim();
    if (l === 'js') return 'javascript';
    if (l === 'ts') return 'typescript';
    if (l === 'py') return 'python';
    if (l === 'rb') return 'ruby';
    if (l === 'sh') return 'bash';
    if (l === 'cs' || l === 'csharp') return 'csharp';
    if (HLJS_LANGS.includes(l)) return l;
    return null;
}

function highlightCode(code, langHint) {
    const lang = detectLang(langHint);
    if (lang && window.hljs) {
        try {
            return window.hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch { }
    }
    if (window.hljs) {
        try {
            return window.hljs.highlightAuto(code).value;
        } catch { }
    }
    return escHtml(code);
}

function fmt(raw) {
    let t = String(raw);

    const codeBlocks = [];
    const tableBlocks = [];

    t = t.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang: lang.trim(), code: code.trim() });
        return `\x00CODE${idx}\x00`;
    });

    t = t.replace(/(\|.+?\|\n\|[-\s\|]+\|\n(?:\|.+\|\n?)*)/g, (match) => {
        const idx = tableBlocks.length;
        const lines = match.trim().split('\n');
        if (lines.length < 2) return match;

        let table = '<div class="markdown-table-wrapper"><table class="markdown-table">';

        const headerCells = lines[0].split('|').map(cell => cell.trim()).filter(cell => cell);
        table += '<thead><tr>';
        headerCells.forEach(cell => {
            table += `<th>${fmtTableCell(cell)}</th>`;
        });
        table += '</tr></thead>';

        table += '<tbody>';
        for (let i = 2; i < lines.length; i++) {
            const cells = lines[i].split('|').map(cell => cell.trim()).filter(cell => cell);
            if (cells.length > 0) {
                table += '<tr>';
                cells.forEach(cell => {
                    table += `<td>${fmtTableCell(cell)}</td>`;
                });
                table += '</tr>';
            }
        }
        table += '</tbody></table></div>';

        tableBlocks.push(table);
        return `\x00TABLE${idx}\x00`;
    });

    t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    t = t.replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>');
    t = t.replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>');
    t = t.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
    t = t.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
    t = t.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
    t = t.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');

    t = t.replace(/^&gt;&gt;\s+(.+)$/gm, '<blockquote><blockquote>$1</blockquote></blockquote>');
    t = t.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    t = t.replace(/^---+$/gm, '<hr>');

    t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
    t = t.replace(/<u>(.+?)<\/u>/g, '<u>$1</u>');
    t = t.replace(/<mark>(.+?)<\/mark>/g, '<mark>$1</mark>');
    t = t.replace(/<sub>(.+?)<\/sub>/g, '<sub>$1</sub>');
    t = t.replace(/<sup>(.+?)<\/sup>/g, '<sup>$1</sup>');

    t = t.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    t = t.replace(/(^|[\s\n])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

    const lines = t.split('\n');
    const output = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (/^\x00CODE\d+\x00$/.test(line.trim())) {
            output.push(line);
            i++;
            continue;
        }

        const taskDone = line.match(/^(\s*)[*\-]\s+\[x\]\s+(.*)$/i);
        const taskTodo = line.match(/^(\s*)[*\-]\s+\[\s*\]\s+(.*)$/);
        if (taskDone) {
            output.push(`<li class="task-item done"><span class="task-check">✓</span> ${taskDone[2]}</li>`);
            i++;
            continue;
        }
        if (taskTodo) {
            output.push(`<li class="task-item todo"><span class="task-check">☐</span> ${taskTodo[2]}</li>`);
            i++;
            continue;
        }

        const ulMatch = line.match(/^(\s*)[*\-]\s+(.*)$/);
        if (ulMatch) {
            const indent = ulMatch[1].length;
            output.push(`<li data-indent="${indent}">${ulMatch[2]}</li>`);
            i++;
            continue;
        }

        const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (olMatch) {
            const indent = olMatch[1].length;
            output.push(`<li class="ol-item" data-indent="${indent}" data-num="${olMatch[2]}">${olMatch[3]}</li>`);
            i++;
            continue;
        }

        if (/^<h[1-6]>|^<blockquote>|^<hr>/.test(line)) {
            output.push(line);
            i++;
            continue;
        }

        if (line.trim() === '') {
            output.push('<br-blank>');
        } else {
            output.push(line);
        }
        i++;
    }

    let html = output.join('\n');

    html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, match => {
        const items = match.trim().split('\n').filter(Boolean);
        const isOl = items[0] && items[0].includes('class="ol-item"');
        const tag = isOl ? 'ol' : 'ul';
        const inner = items.map(item => item.replace(/ data-indent="\d+"/, '').replace(/ data-num="\d+"/, '')).join('\n');
        return `<${tag}>${inner}</${tag}>`;
    });

    html = html.replace(/\n/g, ' ');

    const paragraphs = html.split(/<br>\s*<br>/);
    if (paragraphs.length > 1) {
        html = paragraphs.map(p => p.trim() ? `<p>${p.trim()}</p>` : '').join('');
    }

    html = html.replace(/\x00CODE(\d+)\x00/g, (_, idx) => {
        const { lang, code } = codeBlocks[parseInt(idx)];
        const highlighted = highlightCode(code, lang);
        const langLabel = lang ? `<span class="code-lang-label">${escHtml(lang)}</span>` : '';
        return `<div class="code-block-wrap"><div class="code-block-header">${langLabel}<button class="copy-code-btn" title="Copy code"><i class="fa-regular fa-copy"></i> Copy</button></div><pre><code class="hljs language-${lang || 'plaintext'}">${highlighted}</code></pre></div>`;
    });

    html = html.replace(/\x00TABLE(\d+)\x00/g, (_, idx) => {
        return tableBlocks[parseInt(idx)] || '';
    });

    return html;
}

function extractText(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return String(raw);

    if (raw.message && typeof raw.message === 'object' && raw.message.content) {
        return String(raw.message.content);
    }

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

async function typewriterTitle(element, text) {
    element.textContent = '';
    const chars = text.split('');
    for (let i = 0; i < chars.length; i++) {
        element.textContent += chars[i];
        await sleep(10 + Math.random() * 10);
    }
}

function attachCopyText(row, getText) {
    const btn = row.querySelector('.copy-text-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const text = getText();
        navigator.clipboard.writeText(text).then(() => {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
            setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
            setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
        });
    });
}

function attachCodeCopyListeners(row) {
    row.querySelectorAll('.copy-code-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pre = btn.closest('.code-block-wrap')?.querySelector('pre code');
            if (!pre) return;
            const code = pre.innerText || pre.textContent;
            navigator.clipboard.writeText(code).then(() => {
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
                setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
                setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
            });
        });
    });
}

function addBubble(role, text) {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = 'msg-row ' + (role === 'user' ? 'user' : 'bot');

    if (role === 'user') {
        const bub = document.createElement('div');
        bub.className = 'user-bub';
        bub.innerHTML = escHtml(text).replace(/\n/g, '<br>');
        row.appendChild(bub);
    } else {
        const bub = document.createElement('div');
        bub.className = 'bot-bub';
        const rendered = fmt(text);
        bub.innerHTML = `<div class="bot-bub-content">${rendered}</div><div class="msg-actions"><button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button></div>`;
        row.appendChild(bub);
        let rawText = text;
        attachCopyText(row, () => rawText);
        attachCodeCopyListeners(row);
    }

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
    const bub = row.querySelector('.bot-bub');
    bub.innerHTML = `<div class="bot-bub-content">${fmt(text)}</div><div class="msg-actions"><button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button></div>`;
    attachCopyText(row, () => text);
    attachCodeCopyListeners(row);
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
    img.style.cursor = 'pointer';
    img.onclick = () => openLightbox(url);
    img.onload = scrollBottom;
    img.onerror = () => { bub.innerHTML = `<div class="bot-bub-content">${fmt('Could not load image.')}</div>`; };
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
    textEl.className = 'bot-bub-content';
    bub.appendChild(textEl);
    const cur = document.createElement('span');
    cur.className = 'tw-cur';
    textEl.appendChild(cur);

    const tokens = tokenize(text);
    let rendered = '';
    let inCodeBlock = false;
    let codeBlockStart = -1;
    let codeLang = '';

    for (let i = 0; i < tokens.length; i++) {
        rendered += tokens[i];

        if (rendered.includes('```')) {
            const codeBlockMatches = rendered.match(/```([\w]*)\n?/g);
            if (codeBlockMatches) {
                const matchCount = codeBlockMatches.length;

                if (matchCount % 2 === 1) {
                    if (!inCodeBlock) {
                        inCodeBlock = true;
                        codeBlockStart = rendered.lastIndexOf('```');
                        const langMatch = rendered.match(/```(\w*)/);
                        codeLang = langMatch ? langMatch[1] : '';

                        const codeWrapper = document.createElement('div');
                        codeWrapper.className = 'code-block-wrap';
                        codeWrapper.innerHTML = `
                            <div class="code-block-header">
                                <span class="code-lang-label">${escHtml(codeLang)}</span>
                                <button class="copy-code-btn" title="Copy code">
                                    <i class="fa-regular fa-copy"></i> Copy
                                </button>
                            </div>
                            <pre><code class="hljs language-${codeLang || 'plaintext'}"></code></pre>
                        `;
                        textEl.appendChild(codeWrapper);

                        const copyBtn = codeWrapper.querySelector('.copy-code-btn');
                        copyBtn.addEventListener('click', () => {
                            const code = codeWrapper.querySelector('code').innerText || codeWrapper.querySelector('code').textContent;
                            navigator.clipboard.writeText(code).then(() => {
                                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
                                setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
                            }).catch(() => {
                                const ta = document.createElement('textarea');
                                ta.value = code;
                                document.body.appendChild(ta);
                                ta.select();
                                document.execCommand('copy');
                                document.body.removeChild(ta);
                                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
                                setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
                            });
                        });
                    }
                } else {
                    if (inCodeBlock) {
                        inCodeBlock = false;
                        const codeContent = rendered.substring(codeBlockStart + 3 + codeLang.length).replace(/```[\s\S]*$/, '');
                        const codeElement = textEl.querySelector('.code-block-wrap:last-child code');
                        if (codeElement) {
                            codeElement.textContent = codeContent;
                            if (window.hljs && codeLang) {
                                try {
                                    const highlighted = window.hljs.highlight(codeContent, { language: detectLang(codeLang), ignoreIllegals: true }).value;
                                    codeElement.innerHTML = highlighted;
                                } catch { }
                            }
                        }
                    }
                }
            }
        }

        if (!inCodeBlock) {
            textEl.innerHTML = fmt(rendered);
            textEl.appendChild(cur);
        } else {
            const codeElement = textEl.querySelector('.code-block-wrap:last-child code');
            if (codeElement) {
                const afterCodeStart = rendered.substring(codeBlockStart + 3 + codeLang.length);
                const codeContent = afterCodeStart.replace(/```[\s\S]*$/, '');

                codeElement.textContent = codeContent;
                if (window.hljs && codeLang) {
                    try {
                        const highlighted = window.hljs.highlight(codeContent, { language: detectLang(codeLang), ignoreIllegals: true }).value;
                        codeElement.innerHTML = highlighted;
                    } catch { }
                }
                codeElement.appendChild(cur);
            }
        }

        scrollBottom();
        await sleep(tokens[i].length > 3 ? 5 : 14);
    }

    cur.remove();

    textEl.innerHTML = fmt(rendered);
    attachCodeCopyListeners(row);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'msg-actions';
    actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button>';
    bub.appendChild(actionsEl);
    attachCopyText(row, () => text);
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
        const res = await fetch(`${CONFIG.BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: currentModel || 'vexa',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant. Be concise.' },
                    { role: 'user', content: `In 4 words or fewer, write a short title for this conversation. Only output the title, no punctuation.\nUser: ${userMessage.slice(0, 200)}\nAssistant: ${aiReply.slice(0, 200)}` }
                ]
            })
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const title = String(extractText(raw)).trim().replace(/^["']|["']$/g, '').slice(0, 60);
        return title || null;
    } catch { return null; }
}

async function generateEmptyTitle() {
    try {
        const res = await fetch(`${CONFIG.BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: currentModel || 'vexa',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant. Be concise.' },
                    { role: 'user', content: 'Generate a short question or prompt to start a conversation with an AI assistant, in 6 words or fewer. Only output the prompt.' }
                ]
            })
        });
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
            messages: messages,
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
            if (Array.isArray(data.messages)) {
                messages = data.messages;
            } else if (typeof data.messages === 'string') {
                try { messages = JSON.parse(data.messages); } catch { }
            }
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

function buildConversationHistory(session) {
    if (!session || !session.messages) return [];

    let messages = session.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => {
            if (typeof m.content === 'string') return true;
            if (typeof m.content === 'object' && m.content.type === 'image') return false;
            return typeof m.content === 'string';
        })
        .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));

    const systemMessage = { role: 'system', content: 'You are a helpful assistant. Be concise.' };
    const maxChars = 14000;

    let historyMessages = [];
    let totalChars = systemMessage.content.length;

    for (let i = messages.length - 1; i >= 0 && historyMessages.length < 8; i--) {
        const messageChars = JSON.stringify(messages[i]).length + 10;
        if (totalChars + messageChars > maxChars) break;

        historyMessages.unshift(messages[i]);
        totalChars += messageChars;
    }

    return historyMessages;
}

async function sendChatText(userMessage, loading, session) {
    const history = buildConversationHistory(session);
    const messages = [
        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
        ...history,
        { role: 'user', content: userMessage }
    ];

    const res = await fetch(`${CONFIG.BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: currentModel || 'vexa',
            messages
        })
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error('Chat API Error:', res.status, errorText);
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

async function sendChatImage(prompt, loading) {
    const imgModel = document.getElementById('image-model-select')?.value || 'hd';
    const res = await fetch(`${CONFIG.BASE}/image?q=${encodeURIComponent(prompt)}&model=${encodeURIComponent(imgModel)}`);
    if (!res.ok) throw new Error('Image API ' + res.status);
    const raw = await res.json();
    const remoteUrl = raw.proxy_url ?? raw.url ?? raw.image ?? raw.src ?? (raw.data && (raw.data.url ?? raw.data.proxy_url)) ?? '';
    if (!remoteUrl) { swapText(loading, 'No image URL returned.'); return null; }
    let displayUrl;
    try {
        const fullUrl = remoteUrl.startsWith('/') ? CONFIG.BASE + remoteUrl : remoteUrl;
        const resp = await fetch(fullUrl);
        if (!resp.ok) throw new Error();
        const blob = await resp.blob();
        displayUrl = URL.createObjectURL(blob);
    } catch { displayUrl = remoteUrl.startsWith('/') ? CONFIG.BASE + remoteUrl : remoteUrl; }
    swapImage(loading, displayUrl, prompt);

    try {
        const fullUrl = remoteUrl.startsWith('/') ? CONFIG.BASE + remoteUrl : remoteUrl;
        const resp = await fetch(fullUrl);
        const blob = await resp.blob();
        const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        return { type: 'image', prompt, dataUrl };
    } catch {
        return { type: 'image', prompt, url: remoteUrl.startsWith('/') ? CONFIG.BASE + remoteUrl : remoteUrl };
    }
}

async function sendText(text) {
    busy = true;
    showPageRaw('chat');
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
        window.history.pushState({}, '', '/chat/' + newId);
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
            aiReply = await sendChatText(text, loading, session);
        }
    } catch (err) {
        swapText(loading, 'Error - ' + (err.message || 'try again.'));
    }

    if (aiReply) {
        const replyContent = typeof aiReply === 'object' ? aiReply : aiReply;
        if (typeof replyContent === 'object' && replyContent.type === 'image') {
            session.messages.push({ role: 'assistant', content: replyContent });
        } else {
            session.messages.push({ role: 'assistant', content: replyContent });
        }
        if (session.messages.filter(m => m.role === 'user').length === 1) {
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
    scrollBottom();
}

async function loadSessionIntoChat(session) {
    if (isLoadingSession) {
        return;
    }
    isLoadingSession = true;

    try {
        currentSessionId = session.id;
        window.history.pushState({}, '', '/chat/' + session.id);
        const feed = document.getElementById('feed');
        feed.innerHTML = '';

        if (!session.messages || !session.messages.length) {
            const empty = document.createElement('div');
            empty.className = 'feed-empty';
            empty.id = 'feedEmpty';
            const title = await generateEmptyTitle();
            empty.innerHTML = `<div class="feed-empty-title"></div>`;
            feed.appendChild(empty);

            const titleEl = empty.querySelector('.feed-empty-title');
            if (title && titleEl) {
                await typewriterTitle(titleEl, title);
            }
            return;
        }

        session.messages.forEach((msg, index) => {
            let content = msg.content;
            if (typeof content === 'string') {
                try {
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === 'object' && parsed.type === 'image') {
                        content = parsed;
                    }
                } catch { }
            }

            if (content && typeof content === 'object' && content.type === 'image') {
                const row = addBubble(msg.role === 'user' ? 'user' : 'bot', '');
                if (msg.role === 'assistant') {
                    const imageUrl = content.dataUrl || content.url;
                    if (imageUrl) {
                        swapImage(row, imageUrl, content.prompt);
                    }
                }
            } else {
                addBubble(msg.role === 'user' ? 'user' : 'bot', content);
            }
        });
        renderChatHistory();
        showPageRaw('chat');
        setTimeout(() => {
            const inp = document.getElementById('inp');
            if (inp) inp.focus();
        }, 100);
    } finally {
        isLoadingSession = false;
    }
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
        const isMobile = window.innerWidth <= 680;
        if (e.key === 'Enter') {
            if (isMobile) {
                if (e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            } else {
                if (!e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            }
        }
    });
    inp.addEventListener('keypress', e => {
        const isMobile = window.innerWidth <= 680;
        if (e.key === 'Enter') {
            if (isMobile) {
                if (e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            } else {
                if (!e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            }
        }
    });
    inp.addEventListener('keyup', e => {
        const isMobile = window.innerWidth <= 680;
        if (e.key === 'Enter') {
            if (isMobile) {
                if (e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            } else {
                if (!e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            }
        }
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
    window.history.pushState({}, '', '/new-chat');
    renderChatHistory();
    const feed = document.getElementById('feed');
    feed.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.id = 'feedEmpty';
    const title = await generateEmptyTitle();
    empty.innerHTML = `<div class="feed-empty-title"></div>`;
    feed.appendChild(empty);

    const titleEl = empty.querySelector('.feed-empty-title');
    if (title && titleEl) {
        await typewriterTitle(titleEl, title);
    }

    showPageRaw('chat');
    document.getElementById('inp')?.focus();
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
        let matchedContent = '';
        if (session.messages && session.messages.length > 0) {
            for (const message of session.messages) {
                let messageContent = '';
                if (typeof message.content === 'string') {
                    messageContent = message.content;
                } else if (message.content && typeof message.content === 'object') {
                    messageContent = message.content.type === 'image' ? (message.content.prompt || '') : String(message.content);
                }
                if (messageContent.toLowerCase().includes(trimmedQuery)) {
                    contentMatch = true;
                    matchedContent = messageContent;
                    break;
                }
            }
        }
        if (titleMatch || contentMatch) {
            results.push({ session, titleMatch, contentMatch, matchedContent });
        }
    });
    renderSearchResults(results, trimmedQuery);
}

function renderSearchResults(results, query) {
    const resultsContainer = document.getElementById('searchResults');
    if (results.length === 0) {
        resultsContainer.innerHTML = `<div class="search-no-results"><i class="fa-solid fa-search"></i><p>No chats found matching "${escHtml(query)}"</p></div>`;
        return;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today); thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today); thisMonth.setMonth(thisMonth.getMonth() - 1);
    const grouped = { 'Today': [], 'Yesterday': [], 'Previous 7 days': [], 'Previous 30 days': [], 'Older': [] };
    results.forEach(result => {
        const d = new Date(result.session.ts || Date.now());
        if (d >= today) grouped['Today'].push(result);
        else if (d >= yesterday) grouped['Yesterday'].push(result);
        else if (d >= thisWeek) grouped['Previous 7 days'].push(result);
        else if (d >= thisMonth) grouped['Previous 30 days'].push(result);
        else grouped['Older'].push(result);
    });
    resultsContainer.innerHTML = '';
    Object.entries(grouped).forEach(([groupName, groupResults]) => {
        if (!groupResults.length) return;
        const dateHeader = document.createElement('div');
        dateHeader.className = 'search-date-group';
        dateHeader.textContent = groupName;
        resultsContainer.appendChild(dateHeader);
        groupResults.forEach(({ session, contentMatch, matchedContent }) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            let snippet = '';
            if (contentMatch && matchedContent) {
                const matchIndex = matchedContent.toLowerCase().indexOf(query.toLowerCase());
                const start = Math.max(0, matchIndex - 30);
                const end = Math.min(matchedContent.length, matchIndex + query.length + 30);
                snippet = matchedContent.substring(start, end);
                if (start > 0) snippet = '...' + snippet;
                if (end < matchedContent.length) snippet += '...';
                snippet = highlightMatch(escHtml(snippet), query);
            }
            resultItem.innerHTML = `<div class="search-result-title">${highlightMatch(escHtml(session.title), query)}</div>${snippet ? `<div class="search-result-snippet">${snippet}</div>` : ''}`;
            resultItem.addEventListener('click', () => { closeSearchModal(); loadSessionIntoChat(session); });
            resultsContainer.appendChild(resultItem);
        });
    });
}

function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchModalOverlay = document.getElementById('searchModalOverlay');
    searchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (value.trim()) searchChats(value);
        else resetSearchResults();
    });
    searchModalOverlay.addEventListener('click', (e) => {
        if (e.target === searchModalOverlay) closeSearchModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !searchModalOverlay.classList.contains('hidden')) closeSearchModal();
    });
}

function closeSearchModal() {
    const overlay = document.getElementById('searchModalOverlay');
    const input = document.getElementById('searchInput');
    overlay.classList.add('hidden');
    input.value = '';
    resetSearchResults();
}

function openSearchModal() {
    const overlay = document.getElementById('searchModalOverlay');
    const input = document.getElementById('searchInput');
    overlay.classList.remove('hidden');
    input.focus();
    resetSearchResults();
}