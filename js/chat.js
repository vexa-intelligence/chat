let busy = false;
let currentAbortController = null;
let chatSessions = [];
let currentSessionId = null;
let currentModel = '';
let currentModelLabel = 'Vexa';
let isLoadingSession = false;
let editingMsgIndex = null;

const IMG_RE = /\b(generate|create|draw|make|paint|render|produce|design|imagine)\s+(an?\s+)?(image|picture|photo|illustration|artwork|painting|drawing|portrait|landscape|scene|wallpaper)\b|\b(image|picture|photo|illustration|artwork|painting|drawing|portrait|landscape|scene|wallpaper)\b/i;

function isImg(t) { return IMG_RE.test(t); }


function cleanImgPrompt(t) {
    return t.replace(/['"]/g, '')
        .replace(/\b(please|can you|could you|hey|vexa)\b/gi, '')
        .replace(/\b(generate|create|draw|make|paint|render|produce|design|imagine)\b/gi, '')
        .replace(/\b(an?|the)\s+(image|picture|photo|illustration|artwork|painting|drawing|portrait)\b/gi, '')
        .replace(/\b(image|picture|photo)\s+(of|showing|depicting)\b/gi, '')
        .replace(/\s+/g, ' ').trim() || t.replace(/['"]/g, '');
}

function escHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function filterLettersNumbers(t) {
    return String(t).replace(/[^a-zA-Z0-9\s]/g, '').trim();
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
    const searchSourcesBlocks = [];

    t = t.replace(/<div class="search-sources-bub"><div class="search-sources-row">[\s\S]*?<\/div><\/div>/g, (match) => {
        const idx = searchSourcesBlocks.length;
        searchSourcesBlocks.push(match);
        return `\x00SOURCES${idx}\x00`;
    });

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

    html = html.replace(/<br-blank>/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');

    html = html.replace(/\x00CODE(\d+)\x00/g, (_, idx) => {
        const { lang, code } = codeBlocks[parseInt(idx)];
        const highlighted = highlightCode(code, lang);
        const langLabel = lang ? `<span class="code-lang-label">${escHtml(lang)}</span>` : '';
        return `<div class="code-block-wrap"><div class="code-block-header">${langLabel}<button class="copy-code-btn" title="Copy code"><i class="fa-regular fa-copy"></i> Copy</button></div><pre><code class="hljs language-${lang || 'plaintext'}">${highlighted}</code></pre></div>`;
    });

    html = html.replace(/\x00TABLE(\d+)\x00/g, (_, idx) => {
        return tableBlocks[parseInt(idx)] || '';
    });

    html = html.replace(/\x00SOURCES(\d+)\x00/g, (_, idx) => {
        return searchSourcesBlocks[parseInt(idx)] || '';
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

async function readSSEStream(response, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buf = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (signal?.aborted) { reader.cancel(); break; }

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
                try {
                    const parsed = JSON.parse(line.slice(6));
                    if (parsed.error) throw new Error(parsed.error.message || 'Stream error');
                    const chunk = parsed.choices?.[0]?.delta?.content;
                    if (chunk) fullText += chunk.replace(/\\n/g, '\n');
                } catch (e) {
                    if (e.message !== 'Stream error') continue;
                    throw e;
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullText;
}

async function streamSSEToElement(response, textEl, onChunk, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buf = '';
    let firstChunk = true;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (signal?.aborted) { reader.cancel(); break; }

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
                try {
                    const parsed = JSON.parse(line.slice(6));
                    if (parsed.error) throw new Error(parsed.error.message || 'Stream error');
                    const chunk = parsed.choices?.[0]?.delta?.content;
                    if (chunk) {
                        const unescaped = chunk.replace(/\\n/g, '\n');
                        fullText += unescaped;
                        if (firstChunk) {
                            const bub = textEl.closest('.bot-bub');
                            const dots = bub?.querySelector('.dots');
                            if (dots) dots.remove();
                            const thinkingInline = bub?.querySelector('.thinking-inline');
                            if (thinkingInline) thinkingInline.remove();
                            firstChunk = false;
                        }
                        if (onChunk) onChunk(unescaped, fullText);
                    }
                } catch (e) {
                    if (e.message !== 'Stream error') continue;
                    throw e;
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullText;
}

async function fetchChat(messages, model, signal) {
    const res = await fetch(`${CONFIG.BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || currentModel || 'vexa', messages }),
        signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res;
}

async function fetchQuery(prompt, model) {
    const res = await fetch(`${CONFIG.BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: prompt, model: model || currentModel || 'vexa' })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Query failed');
    return data.response || '';
}

function scrollBottom() {
    requestAnimationFrame(() => {
        const feed = document.getElementById('feed');
        if (feed) feed.scrollTop = feed.scrollHeight;
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


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

function openMsgContextMenu(e, msgIndex) {
    closeMsgContextMenu();
    const session = chatSessions.find(s => s.id === currentSessionId);
    const msg = session?.messages[msgIndex];
    if (!msg) return;

    const menu = document.createElement('div');
    menu.className = 'msg-ctx-menu';
    menu.id = 'msgCtxMenu';

    const now = new Date();
    const timeStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    menu.innerHTML = `<div class="msg-ctx-time">${timeStr}</div>
        <button class="msg-ctx-item" id="ctxCopy"><i class="fa-regular fa-copy" style="font-size:14px;width:16px"></i> Copy</button>
        ${msg.role === 'user' ? `<button class="msg-ctx-item" id="ctxEdit"><i class="fa-solid fa-pencil" style="font-size:14px;width:16px"></i> Edit</button>` : ''}`;

    document.body.appendChild(menu);

    const menuW = menu.offsetWidth || 200;
    const menuH = menu.offsetHeight || 100;
    let left = e.clientX - menuW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    let top = e.clientY - menuH - 12;
    if (top < 8) top = e.clientY + 12;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.querySelector('#ctxCopy')?.addEventListener('click', () => {
        const content = typeof msg.content === 'string' ? msg.content : '';
        navigator.clipboard.writeText(content).catch(() => { });
        closeMsgContextMenu();
    });

    menu.querySelector('#ctxEdit')?.addEventListener('click', () => {
        startEditMessage(msgIndex);
        closeMsgContextMenu();
    });

    setTimeout(() => document.addEventListener('click', closeMsgContextMenu, { once: true }), 10);
}

function closeMsgContextMenu() {
    document.getElementById('msgCtxMenu')?.remove();
}

function startEditMessage(msgIndex) {
    const session = chatSessions.find(s => s.id === currentSessionId);
    if (!session) return;
    const msg = session.messages[msgIndex];
    if (!msg || msg.role !== 'user') return;

    editingMsgIndex = msgIndex;
    const inp = document.getElementById('inp');
    const inputBox = document.getElementById('chatInputBox');
    if (!inp || !inputBox) return;

    document.getElementById('editIndicator')?.remove();

    const indicator = document.createElement('div');
    indicator.className = 'edit-indicator';
    indicator.id = 'editIndicator';
    indicator.innerHTML = `<i class="fa-solid fa-pencil" style="font-size:12px"></i><span>Edit message</span><button onclick="cancelEdit()" style="margin-left:auto;color:var(--muted);background:none;border:none;cursor:pointer;padding:2px 4px;"><i class="fa-solid fa-xmark"></i></button>`;
    inputBox.insertBefore(indicator, inputBox.firstChild);

    inp.value = typeof msg.content === 'string' ? msg.content : '';
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 160) + 'px';
    document.getElementById('sbtn').disabled = !inp.value.trim();
    inp.focus();
}

function cancelEdit() {
    editingMsgIndex = null;
    document.getElementById('editIndicator')?.remove();
    const inp = document.getElementById('inp');
    if (inp) {
        inp.value = '';
        inp.style.height = 'auto';
        inp.dispatchEvent(new Event('input'));
    }
}

function addBubble(role, text, msgIndex, thinkingContent, researchContent) {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = 'msg-row ' + (role === 'user' ? 'user' : 'bot');

    const s = typeof getVexaSettings === 'function' ? getVexaSettings() : {};
    const showTs = !!s.showTimestamps;

    if (role === 'user') {
        const bub = document.createElement('div');
        bub.className = 'user-bub';
        bub.innerHTML = escHtml(text).replace(/\n/g, '<br>');
        if (showTs) {
            const tsEl = document.createElement('div');
            tsEl.className = 'msg-timestamp';
            tsEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            bub.appendChild(tsEl);
        }
        row.appendChild(bub);

        if (msgIndex !== undefined) {
            let pressTimer;
            bub.addEventListener('contextmenu', e => { e.preventDefault(); openMsgContextMenu(e, msgIndex); });
            bub.addEventListener('touchstart', e => { pressTimer = setTimeout(() => openMsgContextMenu(e.touches[0], msgIndex), 500); }, { passive: true });
            bub.addEventListener('touchend', () => clearTimeout(pressTimer));
            bub.addEventListener('touchmove', () => clearTimeout(pressTimer));
            bub.addEventListener('dblclick', e => openMsgContextMenu(e, msgIndex));
        }
    } else {
        const bub = document.createElement('div');
        bub.className = 'bot-bub';

        if (thinkingContent) {
            bub.appendChild(buildThinkBlock(thinkingContent, true));
        }

        if (researchContent && researchContent.sources && researchContent.sources.length) {
            const sourceBar = document.createElement('div');
            sourceBar.className = 'dr-final-sources';
            sourceBar.innerHTML = `<span class="dr-final-sources-label"><i class="fa-solid fa-globe" style="font-size:11px;margin-right:5px;color:var(--accent)"></i>Sources</span>`;
            researchContent.sources.slice(0, 4).forEach(r => {
                let domain = String(r.url);
                try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }
                const chip = document.createElement('a');
                chip.href = String(r.url);
                chip.target = '_blank';
                chip.rel = 'noopener noreferrer';
                chip.className = 'search-source-chip';
                const img = document.createElement('img');
                img.src = `https://favicon.vemetric.com/${domain}`;
                img.className = 'search-source-favicon';
                img.alt = '';
                img.onerror = function () { this.style.display = 'none'; };
                chip.appendChild(img);
                chip.appendChild(document.createTextNode(' ' + domain));
                sourceBar.appendChild(chip);
            });
            bub.appendChild(sourceBar);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'bot-bub-content';
        contentDiv.innerHTML = fmt(text);
        bub.appendChild(contentDiv);

        const actionsEl = document.createElement('div');
        actionsEl.className = 'msg-actions';
        actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button>';
        bub.appendChild(actionsEl);

        if (showTs) {
            const tsEl = document.createElement('div');
            tsEl.className = 'msg-timestamp';
            tsEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            bub.appendChild(tsEl);
        }
        row.appendChild(bub);
        attachCopyText(row, () => text);
        attachCodeCopyListeners(row);
    }

    feed.appendChild(row);
    return row;
}

function buildThinkBlock(thinkingContent, startOpen) {
    const block = document.createElement('div');
    block.className = 'think-block';
    block.innerHTML = `
        <button class="think-toggle-btn">
            <div class="think-toggle-left">
                <svg viewBox="0 0 24 24" fill="currentColor" class="think-sparkle-icon"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/></svg>
                <span class="think-toggle-label">Thought for a moment</span>
            </div>
            <div class="think-toggle-right">
                <span class="think-show-hide">${startOpen ? 'Hide thinking' : 'Show thinking'}</span>
                <svg class="think-chevron ${startOpen ? 'open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
        </button>
        <div class="think-content ${startOpen ? 'open' : ''}">
            <div class="think-content-inner"></div>
        </div>`;

    let open = !!startOpen;
    const btn = block.querySelector('.think-toggle-btn');
    const content = block.querySelector('.think-content');
    const label = block.querySelector('.think-show-hide');
    const chevron = block.querySelector('.think-chevron');
    const inner = block.querySelector('.think-content-inner');
    if (thinkingContent) inner.textContent = thinkingContent;

    btn.addEventListener('click', () => {
        open = !open;
        content.classList.toggle('open', open);
        chevron.classList.toggle('open', open);
        label.textContent = open ? 'Hide thinking' : 'Show thinking';
    });

    return block;
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
    return row;
}

function swapTextWithThinking(row, text, think) {
    const bub = row.querySelector('.bot-bub');
    bub.innerHTML = '';

    if (think) {
        const block = buildThinkBlock(null, true);
        bub.appendChild(block);
        const thinkInner = block.querySelector('.think-content-inner');
        thinkInner.textContent = think;
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'bot-bub-content';
    contentDiv.innerHTML = fmt(text);
    bub.appendChild(contentDiv);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'msg-actions';
    actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button>';
    bub.appendChild(actionsEl);
    attachCopyText(row, () => text);
    attachCodeCopyListeners(row);
}

function swapTextWithThinkingAndResearch(row, text, searchResults) {
    const bub = row.querySelector('.bot-bub');

    if (searchResults && searchResults.length) {
        const sourceBar = document.createElement('div');
        sourceBar.className = 'dr-final-sources';
        sourceBar.innerHTML = `<span class="dr-final-sources-label"><i class="fa-solid fa-globe" style="font-size:11px;margin-right:5px;color:var(--accent)"></i>Sources</span>`;
        searchResults.slice(0, 4).forEach(r => {
            let domain = String(r.url);
            try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }
            const chip = document.createElement('a');
            chip.href = String(r.url);
            chip.target = '_blank';
            chip.rel = 'noopener noreferrer';
            chip.className = 'search-source-chip';
            chip.innerHTML = `<i class="fa-solid fa-link" style="font-size:10px"></i> ${escHtml(domain)}`;
            sourceBar.appendChild(chip);
        });
        bub.appendChild(sourceBar);
    }

    const textEl = document.createElement('div');
    textEl.className = 'bot-bub-content';
    textEl.innerHTML = fmt(text);
    bub.appendChild(textEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'msg-actions';
    actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy"><i class="fa-regular fa-copy"></i> Copy</button>';
    bub.appendChild(actionsEl);
    attachCopyText(row, () => text);
    attachCodeCopyListeners(row);
}

function swapText(row, text) {
    const bub = row.querySelector('.bot-bub');
    bub.innerHTML = `<div class="bot-bub-content">${fmt(text)}</div><div class="msg-actions"><button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button></div>`;
    attachCopyText(row, () => text);
    attachCodeCopyListeners(row);
}

async function generateImageCaption(prompt) {
    try {
        const caption = await fetchQuery(
            `Create an artistic caption (3-6 words) for an image generated from this prompt: "${prompt}". Return ONLY the caption, no quotes or explanation.`,
            currentModel || 'vexa'
        );
        let cleaned = caption.replace(/^["']|["']$/g, '').trim();
        cleaned = cleaned.replace(/^(Image generated|Generated image|Image caption|Caption|Here is|The caption is)[:\s]*/i, '').trim();
        if (cleaned.length >= 4 && !/^(a|an|the|image|picture)$/.test(cleaned.toLowerCase())) {
            return cleaned;
        }
    } catch { }
    return prompt;
}

function swapImage(row, url, prompt) {
    const bub = row.querySelector('.bot-bub');
    bub.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'gen-img-wrap';
    const cap = document.createElement('div');
    cap.className = 'gen-img-cap';
    cap.textContent = 'Generating caption...';
    const img = document.createElement('img');
    img.className = 'gen-img';
    img.src = url;
    img.alt = prompt;
    img.style.cursor = 'pointer';
    img.onclick = () => openLightbox(url);
    img.onerror = () => { bub.innerHTML = `<div class="bot-bub-content">${fmt('Could not load image.')}</div>`; };
    wrap.appendChild(cap);
    wrap.appendChild(img);
    bub.appendChild(wrap);
    saveMyImage(url, prompt);

    generateImageCaption(prompt).then(aiCaption => {
        cap.textContent = aiCaption;
    });
}



async function generateChatTitle(userMessage, aiReply) {
    try {
        const title = await fetchQuery(
            `In 4 words or fewer, write a short title for this conversation. Only output the title, no punctuation.\nUser: ${userMessage.slice(0, 200)}\nAssistant: ${aiReply.slice(0, 200)}`,
            currentModel || 'vexa'
        );
        return title.trim().replace(/^["']|["']$/g, '').slice(0, 60) || null;
    } catch { return null; }
}

async function generateEmptyTitle(titleEl = null) {
    try {
        const messages = [
            { role: 'system', content: 'Generate a casual, relatable conversation starter someone might say to an AI. Max 6 words. Only output the prompt.' },
            { role: 'user', content: 'Generate a conversation starter.' }
        ];

        const res = await fetchChat(messages, currentModel || 'vexa');

        if (titleEl) {
            await streamSSEToElement(res, titleEl, (chunk, fullText) => {
                titleEl.textContent = fullText;
            });
            return titleEl.textContent.trim().replace(/^["']|["']$/g, '').slice(0, 100) || '';
        } else {
            const title = await readSSEStream(res);
            return title.trim().replace(/^["']|["']$/g, '').slice(0, 100) || '';
        }
    } catch { return ''; }
}

async function saveChatToFirebase(sessionId, title, messages) {
    const db = window.firebaseDB;
    if (!db || !currentUser) return;
    try {
        const clean = JSON.parse(JSON.stringify(messages, (key, val) => val === undefined ? null : val));
        await db.collection('chat_sessions').doc(sessionId).set({
            user_id: currentUser.uid,
            title,
            messages: clean,
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

function buildSystemPrompt() {
    let prefs = window.vexaPersonalization;
    if (!prefs) {
        try { prefs = JSON.parse(localStorage.getItem('vexa_personalization') || 'null'); } catch { }
    }

    const s = typeof getVexaSettings === 'function' ? getVexaSettings() : {};

    if (s.systemPrompt) return s.systemPrompt.trim();

    const now = new Date();
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    let system = `You are Vexa, a sharp, witty, deeply personal AI. Today is ${dateStr} (${timeOfDay}). You remember everything said in this conversation and reference it naturally. You never repeat yourself, never give generic filler answers. You are direct, insightful, and adapt your tone to the user. When you don't know something, say so plainly. Never start replies with "Of course!", "Certainly!", "Great question!", or sycophantic openers.`;

    const toneMap = {
        balanced: 'Be clear and human — not robotic, not overly formal.',
        professional: 'Use professional, precise language. Stay concise.',
        casual: 'Be casual and conversational, like a knowledgeable friend.',
        concise: 'Be extremely concise. One or two sentences max unless more is truly needed.',
        detailed: 'Give thorough, well-structured responses with context and examples.'
    };

    if (prefs) {
        const tone = toneMap[prefs.baseTone] || toneMap.balanced;
        system += ' ' + tone;
        if (prefs.nickname) system += ` Call the user "${prefs.nickname}" occasionally (not every message).`;
        if (prefs.aboutUser) system += ` Context about who you're talking to: ${prefs.aboutUser}.`;
        if (prefs.customInstructions) system += ` User's custom instructions (follow these): ${prefs.customInstructions}.`;

        const charMap = {
            charWarm: { more: 'Be warm, empathetic, and emotionally intelligent.', less: 'Stay neutral and purely factual.' },
            charEnthusiastic: { more: 'Show genuine enthusiasm when the topic warrants it.', less: 'Stay calm and measured.' },
            charHeaders: { more: 'Use headers to organize longer responses.', less: 'Write in flowing prose, never headers.' },
            charEmoji: { more: 'Use emojis sparingly but naturally.', less: 'Never use emojis.' },
            charHumor: { more: 'Weave in light, smart humor when appropriate.', less: 'Keep all responses serious.' }
        };

        Object.entries(charMap).forEach(([key, vals]) => {
            if (prefs[key] === 'more') system += ' ' + vals.more;
            else if (prefs[key] === 'less') system += ' ' + vals.less;
        });
    } else {
        system += ' ' + toneMap.balanced;
    }

    if (s.responseLength) {
        const lenMap = {
            short: "Keep all responses brief — cut anything that isn't essential.",
            balanced: '',
            detailed: 'Give full, detailed responses. Include examples, nuance, and context.'
        };
        if (lenMap[s.responseLength]) system += ' ' + lenMap[s.responseLength];
    }

    if (s.responseLang && s.responseLang !== 'auto') {
        system += ` Always respond in ${s.responseLang}, regardless of the language the user writes in.`;
    }

    if (s.memoryEnabled) {
        try {
            const memories = JSON.parse(localStorage.getItem('vexa_memory') || '[]');
            if (memories.length) {
                system += ` Remembered facts about this user (use naturally, don't list them): ${memories.join('; ')}.`;
            }
        } catch { }
    }

    return system;
}

function buildConversationHistory(session) {
    if (!session || !session.messages) return [];

    let messages = session.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => typeof m.content === 'string' || (typeof m.content === 'object' && m.content?.type !== 'image'))
        .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
        .filter(m => m.content.length > 0);

    const systemContent = buildSystemPrompt();
    const maxChars = 28000;
    let historyMessages = [];
    let totalChars = systemContent.length;

    for (let i = messages.length - 1; i >= 0 && historyMessages.length < 20; i--) {
        const msgChars = messages[i].content.length + 20;
        if (totalChars + msgChars > maxChars) break;
        historyMessages.unshift(messages[i]);
        totalChars += msgChars;
    }

    return historyMessages;
}

async function sendChatText(userMessage, loading, session) {
    if (window.isThinkingMode && window.isThinkingMode()) {
        return sendChatTextWithThinking(userMessage, loading, session);
    }
    if (window.isDeepResearch && window.isDeepResearch()) {
        return sendDeepResearch(userMessage, loading, session);
    }

    const history = buildConversationHistory(session);
    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
        { role: 'user', content: userMessage }
    ];

    const res = await fetchChat(messages, currentModel || 'vexa', currentAbortController?.signal);

    const bub = loading.querySelector('.bot-bub');
    const contentDiv = document.createElement('div');
    contentDiv.className = 'bot-bub-content';
    bub.appendChild(contentDiv);

    const reply = await streamSSEToElement(res, contentDiv, (chunk, fullText) => {
        contentDiv.innerHTML = fmt(fullText);
        scrollBottom();
        attachCodeCopyListeners(loading);
    }, currentAbortController?.signal);

    if (!reply) throw new Error('Empty response from server');

    let text = reply;
    let think = null;
    const m = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) { think = m[1].trim(); text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

    if (think) {
        const block = buildThinkBlock(think, false);
        bub.insertBefore(block, contentDiv);
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'msg-actions';
    actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button>';
    bub.appendChild(actionsEl);
    attachCopyText(loading, () => text);
    attachCodeCopyListeners(loading);

    return text;
}

async function sendChatImage(prompt, loading) {
    let imagePrompt = cleanImgPrompt(prompt);
    if (!/^(draw|paint|generate|render|create|imagine|make)\b/i.test(imagePrompt)) {
        imagePrompt = 'Generate an image of ' + imagePrompt;
    }
    const res = await fetch(`${CONFIG.BASE}/image?q=${encodeURIComponent(imagePrompt)}&model=hd`);
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

async function getImageDescription(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 512;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let r = 0, g = 0, b = 0, brightness = 0;
            const total = imageData.length / 4;
            for (let i = 0; i < imageData.length; i += 4) {
                r += imageData[i];
                g += imageData[i + 1];
                b += imageData[i + 2];
                brightness += (imageData[i] * 0.299 + imageData[i + 1] * 0.587 + imageData[i + 2] * 0.114);
            }
            r = Math.round(r / total);
            g = Math.round(g / total);
            b = Math.round(b / total);
            brightness = Math.round(brightness / total);

            const dominant = r > g && r > b ? 'reddish' : g > r && g > b ? 'greenish' : b > r && b > g ? 'bluish' : 'neutral';
            const brightnessDesc = brightness > 200 ? 'very bright' : brightness > 128 ? 'moderately bright' : brightness > 64 ? 'somewhat dark' : 'very dark';
            const aspect = img.width > img.height * 1.2 ? 'landscape/wide' : img.height > img.width * 1.2 ? 'portrait/tall' : 'square';
            const res = `${img.width}x${img.height}px`;

            resolve(`[Image attached — ${res}, ${aspect} orientation, ${brightnessDesc}, dominant tone: ${dominant}. Avg RGB: ${r},${g},${b}]`);
        };
        img.onerror = () => resolve('[Image attached — could not analyze]');
        img.src = dataUrl;
    });
}

async function sendChatWithImages(text, images, loading, session) {
    const history = buildConversationHistory(session);
    const descriptions = await Promise.all(images.map(url => getImageDescription(url)));
    const imageContext = descriptions.join(' ');
    const userContent = (text ? text + '\n\n' : 'Describe and analyze this image.\n\n') + imageContext;

    const messages = [
        { role: 'system', content: buildSystemPrompt() + ' When given image metadata like dimensions, brightness, and color tone, use it to describe and reason about the image as best you can.' },
        ...history,
        { role: 'user', content: userContent }
    ];

    const res = await fetchChat(messages, currentModel || 'vexa', currentAbortController?.signal);

    const bub = loading.querySelector('.bot-bub');
    const contentDiv = document.createElement('div');
    contentDiv.className = 'bot-bub-content';
    bub.appendChild(contentDiv);

    const reply = await streamSSEToElement(res, contentDiv, (chunk, fullText) => {
        contentDiv.innerHTML = fmt(fullText);
        scrollBottom();
        attachCodeCopyListeners(loading);
    }, currentAbortController?.signal);

    if (!reply) throw new Error('Empty response from server');

    let text2 = reply;
    let think = null;
    const m = text2.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) { think = m[1].trim(); text2 = text2.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

    if (think) {
        const block = buildThinkBlock(think, false);
        bub.insertBefore(block, contentDiv);
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'msg-actions';
    actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy message"><i class="fa-regular fa-copy"></i> Copy</button>';
    bub.appendChild(actionsEl);
    attachCopyText(loading, () => text2);
    attachCodeCopyListeners(loading);

    return text2;
}

function addBubbleWithImages(role, text, images) {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = `msg-row ${role}`;

    const bub = document.createElement('div');
    bub.className = `${role}-bub`;

    if (text) {
        const textP = document.createElement('p');
        textP.textContent = text;
        bub.appendChild(textP);
    }

    if (images && images.length > 0) {
        const imageContainer = document.createElement('div');
        imageContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;';
        images.forEach(imageUrl => {
            const imgWrapper = document.createElement('div');
            imgWrapper.style.cssText = 'position:relative;display:inline-block;max-width:200px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);';
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = 'Uploaded image';
            img.style.cssText = 'width:100%;height:auto;display:block;object-fit:cover;';
            imgWrapper.appendChild(img);
            imageContainer.appendChild(imgWrapper);
        });
        bub.appendChild(imageContainer);
    }

    row.appendChild(bub);
    feed.appendChild(row);
    setTimeout(() => { feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }); }, 100);
    return row;
}

async function sendText(text, displayText) {
    busy = true;
    currentAbortController = new AbortController();
    setSendBtnState(true);

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
        bub.innerHTML = '<p>Please <a href="#" onclick="openAuthOverlay()" style="color:var(--accent);text-decoration:underline;">create an account</a>.</p>';
        row.appendChild(bub);
        feed.appendChild(row);
        busy = false;
        setSendBtnState(false);
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
    }

    session.messages.push({ role: 'user', content: text });
    addBubble('user', displayText || text);
    const loading = addLoading();

    let aiReply = null;
    try {
        if (typeof closeImageOutput === 'function') closeImageOutput();

        if (window.uploadedImages?.length > 0) {
            aiReply = await sendChatWithImages(text, window.uploadedImages, loading, session);
            window.uploadedImages = [];
            document.getElementById('inputImagesRow')?.remove();
            const inpEl = document.getElementById('inp');
            if (inpEl) inpEl.placeholder = 'Ask anything';
        } else if (window.isDeepResearch && window.isDeepResearch()) {
            aiReply = await sendDeepResearch(text, loading, session);
        } else if (window.isThinkingMode && window.isThinkingMode()) {
            aiReply = await sendChatTextWithThinking(text, loading, session);
        } else if (isImg(text)) {
            aiReply = await sendChatImage(cleanImgPrompt(text), loading);
        } else if (typeof isSearchMode === 'function' && isSearchMode()) {
            aiReply = await sendChatTextWithSearch(text, loading, session);
        } else {
            aiReply = await sendChatText(text, loading, session);
        }
    } catch (err) {
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            swapText(loading, 'Chat stopped');
        } else {
            swapText(loading, 'Error — ' + (err.message || 'try again.'));
        }
    }

    if (aiReply) {
        const replyContent = aiReply;
        if (typeof replyContent === 'object' && replyContent.type === 'image') {
            session.messages.push({ role: 'assistant', content: replyContent });
        } else if (typeof replyContent === 'object' && replyContent.thinking) {
            session.messages.push({ role: 'assistant', content: replyContent.content, thinking: replyContent.thinking });
        } else if (typeof replyContent === 'object' && replyContent.sources) {
            session.messages.push({ role: 'assistant', content: replyContent.content, research: { sources: replyContent.sources } });
        } else {
            session.messages.push({ role: 'assistant', content: replyContent });
        }

        if (session.messages.filter(m => m.role === 'user').length === 1) {
            const replyText = typeof aiReply === 'string' ? aiReply : (aiReply?.content || '');
            const aiTitle = await generateChatTitle(text, replyText);
            if (aiTitle) {
                session.title = aiTitle;
                renderChatHistory();
            }
        }
        await saveChatToFirebase(session.id, session.title, session.messages);
    }

    busy = false;
    currentAbortController = null;
    setSendBtnState(false);
    document.getElementById('inp')?.focus();
    const feed = document.getElementById('feed');
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
}

async function sendImagePrompt(prompt) {
    busy = true;
    showPageRaw('chat');
    document.querySelector('.chat-wrap')?.classList.remove('empty-chat');
    document.getElementById('feedEmpty')?.remove();

    let session;
    if (!currentSessionId || !chatSessions.find(s => s.id === currentSessionId)) {
        const newId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
        session = { id: newId, title: prompt.slice(0, 40), messages: [] };
        chatSessions.unshift(session);
        currentSessionId = newId;
        window.history.pushState({}, '', '/chat/' + newId);
        renderChatHistory();
    } else {
        session = chatSessions.find(s => s.id === currentSessionId);
    }

    session.messages.push({ role: 'user', content: prompt });
    addBubble('user', prompt);
    const loading = addLoading();

    let aiReply = null;
    try {
        aiReply = await sendChatImage(prompt, loading);
    } catch (err) {
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            swapText(loading, 'Request cancelled. Please try again.');
        } else {
            swapText(loading, 'Error — ' + (err.message || 'try again.'));
        }
    }

    if (aiReply) {
        if (typeof aiReply === 'object' && aiReply.type === 'image') {
            session.messages.push({ role: 'assistant', content: aiReply });
        } else {
            session.messages.push({ role: 'assistant', content: aiReply });
        }
        if (session.messages.filter(m => m.role === 'user').length === 1) {
            const replyText = typeof aiReply === 'string' ? aiReply : (aiReply?.content || '');
            const aiTitle = await generateChatTitle(prompt, replyText);
            if (aiTitle) {
                session.title = aiTitle;
                renderChatHistory();
            }
        }
        await saveChatToFirebase(session.id, session.title, session.messages);
    }

    busy = false;
    currentAbortController = null;
    setSendBtnState(false);
    document.getElementById('inp')?.focus();
    const feed = document.getElementById('feed');
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
}

async function loadSessionIntoChat(session) {
    if (isLoadingSession) return;
    isLoadingSession = true;

    try {
        currentSessionId = session.id;
        window.history.pushState({}, '', '/chat/' + session.id);
        const feed = document.getElementById('feed');
        feed.innerHTML = '';
        const chatWrap = document.querySelector('.chat-wrap');
        if (chatWrap) chatWrap.classList.toggle('empty-chat', !session.messages || !session.messages.length);

        if (!session.messages || !session.messages.length) {
            if (chatWrap) chatWrap.classList.add('empty-chat');
            const empty = document.createElement('div');
            empty.className = 'feed-empty';
            empty.id = 'feedEmpty';
            empty.innerHTML = `<div class="feed-empty-title">...</div>`;
            feed.appendChild(empty);
            const titleEl = empty.querySelector('.feed-empty-title');
            if (titleEl) {
                generateEmptyTitle(titleEl);
            }
            return;
        }

        session.messages.forEach((msg, index) => {
            let content = msg.content;

            if (typeof content === 'string') {
                try {
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === 'object' && parsed.type === 'image') content = parsed;
                } catch { }
            }

            if (msg.role === 'user' && msg.docWidget && msg.docWidget.length) {
                const userRow = document.createElement('div');
                userRow.className = 'msg-row user';
                msg.docWidget.forEach(dw => {
                    const chip = document.createElement('div');
                    chip.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);border-radius:10px;border:1px solid var(--border);max-width:260px;align-self:flex-end;margin-bottom:4px;';
                    const wc = dw.wordCount > 1000 ? `${Math.round(dw.wordCount / 1000 * 10) / 10}k words` : `${dw.wordCount} words`;
                    chip.innerHTML = `<i class="fa-solid fa-file-lines" style="color:var(--accent);font-size:15px;flex-shrink:0;"></i><div><div style="font-size:0.875rem;font-weight:600;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${escHtml(dw.name)}</div><div style="font-size:0.75rem;color:var(--muted);">${wc}</div></div>`;
                    userRow.appendChild(chip);
                });
                const rawText = typeof msg.content === 'string' ? msg.content.replace(/<file name="[^"]*">[\s\S]*?<\/file>/g, '').trim() : '';
                if (rawText) {
                    const userBub = document.createElement('div');
                    userBub.className = 'user-bub';
                    userBub.textContent = rawText;
                    userRow.appendChild(userBub);
                }
                feed.appendChild(userRow);
                return;
            }

            if (content && typeof content === 'object' && content.type === 'image') {
                const row = addBubble(msg.role === 'user' ? 'user' : 'bot', '', msg.role === 'user' ? index : undefined);
                if (msg.role === 'assistant') {
                    const imageUrl = content.dataUrl || content.url;
                    if (imageUrl) swapImage(row, imageUrl, content.prompt);
                }
            } else {
                let displayContent = content;
                if (typeof displayContent === 'object' && displayContent !== null) {
                    if (displayContent.type === 'image') return;
                    displayContent = displayContent.content || displayContent.prompt || JSON.stringify(displayContent);
                }
                addBubble(
                    msg.role === 'user' ? 'user' : 'bot',
                    displayContent,
                    msg.role === 'user' ? index : undefined,
                    msg.role === 'assistant' ? (typeof msg.thinking === 'string' ? msg.thinking : null) : null,
                    msg.research || null
                );
            }
        });

        renderChatHistory();
        showPageRaw('chat');
        setTimeout(() => {
            document.getElementById('inp')?.focus();
            const feed = document.getElementById('feed');
            if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
        }, 100);
    } finally {
        isLoadingSession = false;
    }
}

async function newChat() {
    currentSessionId = null;
    cancelEdit();
    window.history.pushState({}, '', '/new-chat');
    renderChatHistory();
    const feed = document.getElementById('feed');
    feed.innerHTML = '';
    const chatWrap = document.querySelector('.chat-wrap');
    if (chatWrap) chatWrap.classList.add('empty-chat');
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.id = 'feedEmpty';
    empty.innerHTML = `<div class="feed-empty-title">...</div>`;
    feed.appendChild(empty);

    showPageRaw('chat');
    document.getElementById('inp')?.focus();

    const titleEl = document.querySelector('.feed-empty-title');
    if (titleEl) {
        generateEmptyTitle(titleEl);
    }
}

function renderChatHistory() {
    const sidebarList = document.getElementById('chatHistoryList');
    const mobileList = document.getElementById('mobileHistoryList');

    sidebarList?.querySelectorAll('.history-item').forEach(item => item.remove());
    if (mobileList) {
        mobileList.querySelectorAll('.history-item').forEach(item => item.remove());
    }

    chatSessions.slice(0, 50).forEach(s => {
        if (sidebarList) {
            const sidebarItem = document.createElement('div');
            sidebarItem.className = 'history-item' + (s.id === currentSessionId ? ' active' : '');
            sidebarItem.dataset.id = s.id;
            sidebarItem.innerHTML = `
                    <div class="history-item-content">${filterLettersNumbers(s.title)}</div>
                    <button class="history-item-del" title="Delete" data-id="${escHtml(s.id)}">
                        <i class="fa-solid fa-xmark"></i>
                    </button>`;
            sidebarItem.querySelector('.history-item-del').addEventListener('click', e => {
                e.stopPropagation();
                handleChatDelete(s.id);
            });
            sidebarItem.addEventListener('click', e => {
                if (!e.target.closest('.history-item-del')) {
                    loadSessionIntoChat(s);
                }
            });
            sidebarList.appendChild(sidebarItem);
        }

        if (mobileList) {
            const mobileItem = document.createElement('div');
            mobileItem.className = 'history-item' + (s.id === currentSessionId ? ' active' : '');
            mobileItem.dataset.id = s.id;
            mobileItem.innerHTML = `
                    <div class="history-item-content">${filterLettersNumbers(s.title)}</div>
                    <button class="history-item-del" data-id="${escHtml(s.id)}">
                        <i class="fa-solid fa-xmark"></i>
                    </button>`;
            mobileItem.querySelector('.history-item-del').addEventListener('click', e => {
                e.stopPropagation();
                handleChatDelete(s.id);
            });
            mobileItem.addEventListener('click', e => {
                if (!e.target.closest('.history-item-del')) {
                    loadSessionIntoChat(s);
                    closeMobileDrawer();
                }
            });
            mobileList.appendChild(mobileItem);
        }
    });
}
function initChat() {
    const inp = document.getElementById('inp');
    const sbtn = document.getElementById('sbtn');
    inp.addEventListener('input', () => {
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 160) + 'px';
        const inputBox = document.querySelector('.input-box');
        if (inputBox) {
            const minHeight = 24;
            const maxHeight = 160;
            const currentHeight = Math.min(inp.scrollHeight, 160);
            const progress = Math.min((currentHeight - minHeight) / (maxHeight - minHeight), 1);
            const baseRadius = 40;
            const minRadius = 10;
            inputBox.style.borderRadius = (baseRadius - (progress * (baseRadius - minRadius))) + 'px';
        }
        sbtn.disabled = !inp.value.trim();
    });

    function shouldSendOnEnter() {
        const isMobile = window.innerWidth <= 680;
        if (isMobile) return false;
        const s = typeof getVexaSettings === 'function' ? getVexaSettings() : {};
        return s.sendOnEnter !== false;
    }

    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            if (shouldSendOnEnter() && !e.shiftKey) {
                e.preventDefault();
                doSend();
            } else if (!shouldSendOnEnter() && e.ctrlKey) {
                e.preventDefault();
                doSend();
            }
        }
    });

    sbtn.addEventListener('click', doSend);
    initSearch();
}

function setSendBtnState(isGenerating) {
    const sbtn = document.getElementById('sbtn');
    const inp = document.getElementById('inp');
    if (!sbtn) return;
    if (isGenerating) {
        sbtn.disabled = false;
        sbtn.innerHTML = '<i class="fa-solid fa-stop" style="font-size:13px"></i>';
        sbtn.classList.add('stop-mode');
    } else {
        sbtn.innerHTML = '<i class="fa-solid fa-arrow-up" style="font-size:13px"></i>';
        sbtn.classList.remove('stop-mode');
        sbtn.disabled = !inp?.value.trim();
    }
}

function doSend() {
    const inp = document.getElementById('inp');
    if (busy) {
        if (currentAbortController) {
            currentAbortController.abort();
            setSendBtnState(false);
        }
        return;
    }
    const text = inp.value.trim();
    const hasDocs = window.uploadedDocs && window.uploadedDocs.length > 0;
    const hasImages = window.uploadedImages && window.uploadedImages.length > 0;
    if (!text && !hasDocs && !hasImages) return;
    inp.value = '';
    inp.style.height = 'auto';

    if (hasDocs) {
        showPageRaw('chat');
        document.querySelector('.chat-wrap')?.classList.remove('empty-chat');
        document.getElementById('feedEmpty')?.remove();

        const docs = [...window.uploadedDocs];
        const userText = text;

        docs.forEach(doc => {
            addBubbleWithDocWidget(doc.name, doc.text, userText || '');
        });

        const docContext = docs.map(doc => {
            const MAX_CHARS = 60000;
            const truncated = doc.text.length > MAX_CHARS ? doc.text.slice(0, MAX_CHARS) + '\n[... truncated]' : doc.text;
            return `<file name="${doc.name}">\n${truncated}\n</file>`;
        }).join('\n\n');

        const fullText = userText ? userText + '\n\n' + docContext : docContext;
        const displayText = userText || docs[0].name;

        if (typeof clearUploadedDocs === 'function') clearUploadedDocs();

        if (!currentUser) {
            const feed = document.getElementById('feed');
            const row = document.createElement('div');
            row.className = 'msg-row bot';
            const bub = document.createElement('div');
            bub.className = 'bot-bub';
            bub.innerHTML = '<p>Please <a href="#" onclick="openAuthOverlay()" style="color:var(--accent);text-decoration:underline;">create an account</a>.</p>';
            row.appendChild(bub);
            feed.appendChild(row);
            return;
        }

        let session;
        if (!currentSessionId || !chatSessions.find(s => s.id === currentSessionId)) {
            const newId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
            session = { id: newId, title: displayText.slice(0, 40), messages: [] };
            chatSessions.unshift(session);
            currentSessionId = newId;
            window.history.pushState({}, '', '/chat/' + newId);
            renderChatHistory();
        } else {
            session = chatSessions.find(s => s.id === currentSessionId);
        }

        session.messages.push({ role: 'user', content: fullText, docWidget: docs.map(d => ({ name: d.name, wordCount: d.text.trim().split(/\s+/).length })) });

        busy = true;
        currentAbortController = new AbortController();
        setSendBtnState(true);

        const loading = addLoading();

        (async () => {
            let aiReply = null;
            try {
                aiReply = await sendChatText(fullText, loading, session);
            } catch (err) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) {
                    swapText(loading, 'Chat stopped');
                } else {
                    swapText(loading, 'Error — ' + (err.message || 'try again.'));
                }
            }

            if (aiReply) {
                session.messages.push({ role: 'assistant', content: aiReply });
                if (session.messages.filter(m => m.role === 'user').length === 1) {
                    const aiTitle = await generateChatTitle(displayText, typeof aiReply === 'string' ? aiReply : '');
                    if (aiTitle) { session.title = aiTitle; renderChatHistory(); }
                }
                await saveChatToFirebase(session.id, session.title, session.messages);
            }

            busy = false;
            currentAbortController = null;
            setSendBtnState(false);
            document.getElementById('inp')?.focus();
            const feed = document.getElementById('feed');
            if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
        })();

        return;
    }

    const docContext = '';
    const fullText = text;

    if (typeof clearUploadedDocs === 'function') clearUploadedDocs();

    sendText(fullText, text || (hasImages ? (window.uploadedImages?.[0] ? 'Image' : '') : ''));
}

function resetSearchResults() {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = `<div class="search-empty-state"><p>Type to search your chat history</p></div>`;
}

function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return text.replace(regex, '<span class="search-result-match">$1</span>');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchChats(query) {
    if (!query || query.trim() === '') { resetSearchResults(); return; }
    const trimmedQuery = query.trim().toLowerCase();
    const results = [];
    chatSessions.forEach(session => {
        const titleMatch = session.title.toLowerCase().includes(trimmedQuery);
        let contentMatch = false;
        let matchedContent = '';
        if (session.messages && session.messages.length > 0) {
            for (const message of session.messages) {
                let messageContent = '';
                if (typeof message.content === 'string') messageContent = message.content;
                else if (message.content && typeof message.content === 'object') {
                    messageContent = message.content.type === 'image' ? (message.content.prompt || '') : String(message.content);
                }
                if (messageContent.toLowerCase().includes(trimmedQuery)) {
                    contentMatch = true;
                    matchedContent = messageContent;
                    break;
                }
            }
        }
        if (titleMatch || contentMatch) results.push({ session, titleMatch, contentMatch, matchedContent });
    });
    renderSearchResults(results, trimmedQuery);
}

function renderSearchResults(results, query) {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;
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
    if (!searchInput || !searchModalOverlay) return;
    searchInput.addEventListener('input', e => {
        const value = e.target.value;
        if (value.trim()) searchChats(value);
        else resetSearchResults();
    });
    searchModalOverlay.addEventListener('click', e => {
        if (e.target === searchModalOverlay) closeSearchModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !searchModalOverlay.classList.contains('hidden')) closeSearchModal();
    });
}

function closeSearchModal() {
    const overlay = document.getElementById('searchModalOverlay');
    const input = document.getElementById('searchInput');
    overlay?.classList.add('hidden');
    if (input) input.value = '';
    resetSearchResults();
}

function openSearchModal() {
    const overlay = document.getElementById('searchModalOverlay');
    const input = document.getElementById('searchInput');
    overlay?.classList.remove('hidden');
    input?.focus();
    resetSearchResults();
}

window.addBubble = addBubble;
window.addBubbleWithThinking = addBubble;
window.buildThinkBlock = buildThinkBlock;
window.fetchChat = fetchChat;
window.fetchQuery = fetchQuery;
window.readSSEStream = readSSEStream;
window.streamSSEToElement = streamSSEToElement;
window.swapText = swapText;
window.swapImage = swapImage;
window.addLoading = addLoading;
window.fmt = fmt;
window.escHtml = escHtml;
window.scrollBottom = scrollBottom;
window.sleep = sleep;
window.buildSystemPrompt = buildSystemPrompt;
window.buildConversationHistory = buildConversationHistory;
window.attachCopyText = attachCopyText;
window.attachCodeCopyListeners = attachCodeCopyListeners;
window.loadSessionIntoChat = loadSessionIntoChat;
