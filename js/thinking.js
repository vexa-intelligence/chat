const THINKING_STEPS_MAX = 8;
const RESEARCH_SOURCES_COUNT = 6;

async function sendChatTextWithThinking(userMessage, loading, session) {
    const history = buildConversationHistory(session);

    const thinkingSystemAddition = `
You are an advanced reasoning assistant. When you think through a problem, wrap your internal reasoning in <think>...</think> tags before giving your final answer. Be thorough in your reasoning, explore multiple angles, and then present a clean, clear final response after the thinking block.`;

    const messages = [
        { role: 'system', content: buildSystemPrompt() + thinkingSystemAddition },
        ...history,
        { role: 'user', content: userMessage }
    ];

    const loadingBub = loading.querySelector('.bot-bub');
    loadingBub.innerHTML = `<span class="thinking-inline"><span class="thinking-dot"></span>Thinking…</span>`;

    const res = await fetch(`${CONFIG.BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: currentModel || 'vexa', messages })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (!raw.success) throw new Error(raw.error || 'API error');

    let reply = String(extractText(raw)).trim();
    let think = null;

    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) {
        think = m[1].trim();
        reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    await new Promise(r => setTimeout(r, 200));

    await typewriterSwapWithThinking(loading, reply, think);
    return reply;
}

async function animateThinkingSteps(thinkText, loading) {
    const stepsContainer = loading.querySelector('#thinkingLiveSteps');
    if (!stepsContainer) return;

    const sentences = thinkText.match(/[^.!?\n]+[.!?\n]+/g) || [thinkText];
    const steps = sentences.slice(0, THINKING_STEPS_MAX);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i].trim();
        if (!step) continue;

        const stepEl = document.createElement('div');
        stepEl.className = 'thinking-live-step';
        stepEl.textContent = step;
        stepsContainer.appendChild(stepEl);

        await new Promise(r => setTimeout(r, 120 + Math.random() * 80));
        stepEl.classList.add('visible');

        stepsContainer.scrollTop = stepsContainer.scrollHeight;
        await new Promise(r => setTimeout(r, 180 + step.length * 4));
    }

    await new Promise(r => setTimeout(r, 300));
}

async function typewriterSwapWithThinking(row, text, think) {
    const bub = row.querySelector('.bot-bub');
    bub.innerHTML = '';

    if (think) {
        const block = document.createElement('div');
        block.className = 'think-block';
        block.innerHTML = `
            <button class="think-toggle">
                <svg viewBox="0 0 24 24" fill="currentColor" class="think-icon"><path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z"/></svg>
                <span class="think-label">Thought for a moment</span>
                <span class="think-pill">Show</span>
            </button>
            <div class="think-drawer">
                <div class="think-drawer-inner">${escHtml(think)}</div>
            </div>`;
        let open = false;
        const btn = block.querySelector('.think-toggle');
        const drawer = block.querySelector('.think-drawer');
        const pill = block.querySelector('.think-pill');
        btn.addEventListener('click', () => {
            open = !open;
            drawer.classList.toggle('open', open);
            pill.textContent = open ? 'Hide' : 'Show';
            pill.classList.toggle('active', open);
        });
        bub.appendChild(block);
    }

    const textEl = document.createElement('div');
    textEl.className = 'bot-bub-content';
    bub.appendChild(textEl);

    const tokens = tokenize(text);
    let rendered = '';

    for (let i = 0; i < tokens.length; i++) {
        rendered += tokens[i];
        textEl.innerHTML = fmt(rendered);
        await sleep(tokens[i].length > 3 ? 5 : 14);
    }

    textEl.innerHTML = fmt(rendered);
    attachCodeCopyListeners(row);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'msg-actions';
    actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy"><i class="fa-regular fa-copy"></i> Copy</button>';
    bub.appendChild(actionsEl);
    attachCopyText(row, () => text);
}

async function sendDeepResearch(userMessage, loading, session) {
    const bub = loading.querySelector('.bot-bub');
    bub.innerHTML = `
        <div class="dr-live">
            <span class="thinking-inline"><span class="thinking-dot"></span><span class="dr-live-label">Researching…</span></span>
            <div class="dr-live-steps" id="drSteps"></div>
            <div class="dr-live-chips" id="drSources"></div>
        </div>`;

    let steps = [];

    try {
        const stepsRes = await fetch(`${CONFIG.BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: currentModel || 'vexa',
                messages: [
                    { role: 'system', content: 'You generate short research step descriptions. Return ONLY a JSON array of 4-5 strings, each under 8 words, describing the steps to research this question. No markdown, no explanation, just the raw JSON array.' },
                    { role: 'user', content: userMessage }
                ]
            })
        });
        if (stepsRes.ok) {
            const stepsRaw = await stepsRes.json();
            const stepsText = String(extractText(stepsRaw)).trim().replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(stepsText);
            if (Array.isArray(parsed) && parsed.length) steps = parsed;
        }
    } catch { }

    const stepsEl = bub.querySelector('#drSteps');
    const sourcesEl = bub.querySelector('#drSources');
    const subtitleEl = bub.querySelector('.dr-live-label');

    let searchResults = [];
    try {
        const CYRON_BASE = 'https://cyron.pages.dev';
        const res = await fetch(`${CYRON_BASE}/search/${encodeURIComponent(userMessage)}?categories=general&per_page=${RESEARCH_SOURCES_COUNT}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.results && data.results.all) {
                searchResults = data.results.all.slice(0, RESEARCH_SOURCES_COUNT);
            }
        }
    } catch { }

    if (!steps.length) steps = ['Analyzing…', 'Researching…', 'Synthesizing…', 'Finalizing…'];

    for (let i = 0; i < steps.length; i++) {
        subtitleEl.textContent = steps[i];
        const stepEl = document.createElement('div');
        stepEl.className = 'dr-step';
        stepEl.innerHTML = `<i class="fa-solid fa-circle-check dr-step-icon"></i><span>${steps[i]}</span>`;
        stepsEl.appendChild(stepEl);
        setTimeout(() => stepEl.classList.add('done'), 100);

        if (i === 1 && searchResults.length) {
            searchResults.slice(0, 4).forEach(r => {
                let domain = r.url;
                try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }
                const chip = document.createElement('a');
                chip.href = r.url;
                chip.target = '_blank';
                chip.rel = 'noopener noreferrer';
                chip.className = 'dr-source-chip';
                chip.innerHTML = `<i class="fa-solid fa-link" style="font-size:9px"></i> ${escHtml(domain)}`;
                sourcesEl.appendChild(chip);
            });
        }

        await new Promise(r => setTimeout(r, 700 + Math.random() * 400));
    }

    let searchContext = '';
    if (searchResults.length) {
        searchContext = `Web research results for: "${userMessage}"\n\n`;
        searchResults.forEach((r, i) => {
            searchContext += `[${i + 1}] ${r.title || 'No title'}\nURL: ${r.url}\n`;
            if (r.content) searchContext += `${r.content.slice(0, 400)}\n`;
            searchContext += '\n';
        });
        searchContext += `Based on the above research, provide a comprehensive, well-structured answer. Include citations by referencing source titles and URLs.`;
    }

    const history = buildConversationHistory(session);
    const researchSystem = buildSystemPrompt() + ' You are in deep research mode. Provide thorough, detailed, well-cited answers with clear sections. Use headers to organize your response.';

    const messages = [
        { role: 'system', content: researchSystem },
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

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (!raw.success) throw new Error(raw.error || 'API error');

    let reply = String(extractText(raw)).trim();
    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const finalBub = loading.querySelector('.bot-bub');
    finalBub.innerHTML = '';

    if (searchResults.length) {
        const sourceBar = document.createElement('div');
        sourceBar.className = 'dr-final-sources';
        sourceBar.innerHTML = `<span class="dr-final-sources-label"><i class="fa-solid fa-globe" style="font-size:11px;margin-right:5px;color:var(--accent)"></i>Sources</span>`;
        searchResults.slice(0, 4).forEach(r => {
            let domain = r.url;
            try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }
            const chip = document.createElement('a');
            chip.href = r.url;
            chip.target = '_blank';
            chip.rel = 'noopener noreferrer';
            chip.className = 'search-source-chip';
            chip.innerHTML = `<i class="fa-solid fa-link" style="font-size:10px"></i> ${escHtml(domain)}`;
            sourceBar.appendChild(chip);
        });
        finalBub.appendChild(sourceBar);
    }

    const textEl = document.createElement('div');
    textEl.className = 'bot-bub-content';
    finalBub.appendChild(textEl);

    const tokens = tokenize(reply);
    let rendered = '';
    for (let i = 0; i < tokens.length; i++) {
        rendered += tokens[i];
        textEl.innerHTML = fmt(rendered);
        await sleep(tokens[i].length > 3 ? 4 : 12);
    }
    textEl.innerHTML = fmt(rendered);
    attachCodeCopyListeners(loading);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'msg-actions';
    actionsEl.innerHTML = '<button class="copy-text-btn" title="Copy"><i class="fa-regular fa-copy"></i> Copy</button>';
    finalBub.appendChild(actionsEl);
    attachCopyText(loading, () => reply);

    return reply;
}

async function sendChatWithVisionImages(text, images, loading, session) {
    const history = buildConversationHistory(session);

    const imageContents = await Promise.all(images.map(async (imageUrl) => {
        if (imageUrl.startsWith('data:')) {
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                return {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: match[1],
                        data: match[2]
                    }
                };
            }
        }
        return { type: 'image_url', image_url: { url: imageUrl } };
    }));

    const userContent = [
        ...imageContents,
        { type: 'text', text: text || 'Describe this image in detail.' }
    ];

    const messages = [
        { role: 'system', content: buildSystemPrompt() + ' You have vision capabilities and can accurately analyze images.' },
        ...history,
        { role: 'user', content: userContent }
    ];

    const res = await fetch(`${CONFIG.BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: currentModel || 'vexa',
            messages,
            vision: true,
            images: images
        })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (!raw.success) throw new Error(raw.error || 'API error');

    let reply = String(extractText(raw)).trim();
    let think = null;
    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) { think = m[1].trim(); reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

    await typewriterSwapWithThinking(loading, reply, think);
    return reply;
}

function initThinkingStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .think-block {
            margin-bottom: 12px;
            border-radius: 12px;
            background: color-mix(in srgb, var(--accent) 5%, var(--surface));
            border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
            overflow: hidden;
        }

        .think-toggle-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: none;
            border: none;
            cursor: pointer;
            font-family: var(--font);
            gap: 10px;
        }

        .think-toggle-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .think-sparkle-wrap {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--accent);
        }

        .think-sparkle-icon {
            width: 14px;
            height: 14px;
        }

        .think-toggle-label {
            font-size: 0.8125rem;
            font-weight: 500;
            color: var(--fg-muted);
        }

        .think-toggle-right {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .think-show-hide {
            font-size: 0.75rem;
            color: var(--accent);
            font-weight: 500;
        }

        .think-chevron {
            width: 14px;
            height: 14px;
            color: var(--accent);
            transition: transform 0.25s ease;
            flex-shrink: 0;
        }

        .think-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1);
        }

        .think-content.expanded {
            max-height: 800px;
        }

        .think-content-inner {
            padding: 0 14px 14px;
            font-size: 0.8125rem;
            color: var(--fg-muted);
            line-height: 1.7;
            white-space: pre-wrap;
            border-top: 1px solid color-mix(in srgb, var(--accent) 15%, var(--border));
            padding-top: 12px;
            font-style: italic;
        }

        .thinking-live-block {
            padding: 14px 16px;
            border-radius: 12px;
            background: color-mix(in srgb, var(--accent) 5%, var(--surface));
            border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
        }

        .thinking-live-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }

        .thinking-live-orb {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--accent);
            animation: orb-pulse 1.4s ease-in-out infinite;
            flex-shrink: 0;
        }

        @keyframes orb-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.7); }
        }

        .thinking-live-label {
            font-size: 0.8125rem;
            font-weight: 600;
            color: var(--accent);
        }

        .thinking-live-steps {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 180px;
            overflow-y: auto;
            scrollbar-width: none;
        }

        .thinking-live-steps::-webkit-scrollbar { display: none; }

        .thinking-live-step {
            font-size: 0.775rem;
            color: var(--fg-muted);
            line-height: 1.5;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.25s ease, transform 0.25s ease;
            padding-left: 18px;
            position: relative;
        }

        .thinking-live-step::before {
            content: '·';
            position: absolute;
            left: 6px;
            color: var(--accent);
            font-size: 1.1rem;
            line-height: 1;
            top: 1px;
        }

        .thinking-live-step.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .deep-research-live {
            padding: 16px 18px;
            border-radius: 14px;
            background: color-mix(in srgb, var(--accent) 5%, var(--surface));
            border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
        }

        .dr-header {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 16px;
        }

        .dr-orb-wrap {
            position: relative;
            width: 36px;
            height: 36px;
            flex-shrink: 0;
        }

        .dr-orb {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--accent);
            position: absolute;
            top: 6px;
            left: 6px;
            animation: orb-pulse 1.8s ease-in-out infinite;
        }

        .dr-orb-ring {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
            position: absolute;
            top: 0;
            left: 0;
            animation: ring-spin 2.5s linear infinite;
        }

        @keyframes ring-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .dr-title {
            font-size: 0.9375rem;
            font-weight: 700;
            color: var(--fg);
        }

        .dr-subtitle {
            font-size: 0.775rem;
            color: var(--fg-muted);
            margin-top: 2px;
            transition: all 0.3s ease;
        }

        .dr-steps {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
        }

        .dr-step {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.8125rem;
            color: var(--fg-muted);
            opacity: 0.4;
            transition: opacity 0.4s ease;
        }

        .dr-step.done {
            opacity: 1;
        }

        .dr-step-icon {
            color: var(--accent);
            font-size: 12px;
            flex-shrink: 0;
        }

        .dr-sources {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .dr-source-chip {
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
            animation: chip-pop 0.3s ease;
        }

        @keyframes chip-pop {
            from { transform: scale(0.85); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        .dr-source-chip:hover {
            background: var(--surface3);
            color: var(--fg);
        }

        .dr-final-sources {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            padding: 10px 0;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--border-light);
        }

        .dr-final-sources-label {
            font-size: 0.75rem;
            color: var(--muted);
            flex-shrink: 0;
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', initThinkingStyles);

window.sendChatTextWithThinking = sendChatTextWithThinking;
window.sendDeepResearch = sendDeepResearch;
window.sendChatWithVisionImages = sendChatWithVisionImages;
window.isThinkingMode = function () { return thinkingModeEnabled; };
window.isDeepResearch = function () { return deepResearchEnabled; };