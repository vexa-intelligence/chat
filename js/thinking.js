const THINKING_STEPS_MAX = 8;
const RESEARCH_SOURCES_COUNT = 6;

async function getFavicon(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        const cleanDomain = domain.replace(/\/+$/, '');
        return `https://favicon.vemetric.com/${cleanDomain}`;
    } catch {
        return null;
    }
}

async function sendChatTextWithThinking(userMessage, loading, session) {
    console.log('DEBUG: Thinking mode activated for message:', userMessage);
    const history = buildConversationHistory(session);

    const thinkingSystemAddition = `
You are an advanced reasoning assistant. When you think through a problem, wrap your internal reasoning in <think>...</think> tags before giving your final answer. Be thorough in your reasoning, explore multiple angles, and then present a clean, clear final response after the thinking block.

IMPORTANT: Always start your response with <think> tags containing your step-by-step reasoning process, then close with </think> tags, then provide your final answer.`;

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

    console.log('DEBUG: Raw AI reply for thinking mode:', reply);

    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) {
        think = m[1].trim();
        reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        console.log('DEBUG: Extracted thinking content:', think);
        console.log('DEBUG: Cleaned reply:', reply);
    } else {
        console.log('DEBUG: No <think> tags found in AI reply - generating fallback thinking');

        try {
            const thinkRes = await fetch(`${CONFIG.BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: currentModel || 'vexa',
                    messages: [
                        { role: 'system', content: 'You are a reasoning assistant. Provide step-by-step thinking for this question. Be analytical and break down the problem. Output 3-5 sentences showing your thought process.' },
                        { role: 'user', content: userMessage }
                    ]
                })
            });

            if (thinkRes.ok) {
                const thinkRaw = await thinkRes.json();
                if (thinkRaw.success) {
                    think = String(extractText(thinkRaw)).trim();
                    console.log('DEBUG: Generated fallback thinking:', think);
                }
            }
        } catch (err) {
            console.log('DEBUG: Failed to generate fallback thinking');
        }

        if (!think) {
            think = `Let me think through this step by step. The question is asking for "${userMessage}". I need to consider the key concepts and provide a precise answer.`;
            console.log('DEBUG: Using simple fallback thinking');
        }
    }

    await new Promise(r => setTimeout(r, 200));

    await typewriterSwapWithThinking(loading, reply, think);

    if (think) {
        return {
            content: reply,
            thinking: think
        };
    }

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
            <button class="think-toggle-btn">
                <div class="think-toggle-left">
                    <svg viewBox="0 0 24 24" fill="currentColor" class="think-sparkle-icon"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/></svg>
                    <span class="think-toggle-label">Thought for a moment</span>
                </div>
                <div class="think-toggle-right">
                    <span class="think-show-hide">Hide thinking</span>
                    <svg class="think-chevron open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
            </button>
            <div class="think-content open">
                <div class="think-content-inner">${escHtml(think)}</div>
            </div>`;
        let open = true;
        const btn = block.querySelector('.think-toggle-btn');
        const content = block.querySelector('.think-content');
        const label = block.querySelector('.think-show-hide');
        const chevron = block.querySelector('.think-chevron');
        btn.addEventListener('click', () => {
            open = !open;
            content.classList.toggle('open', open);
            chevron.classList.toggle('open', open);
            label.textContent = open ? 'Hide thinking' : 'Show thinking';
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
        scrollBottom();
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
            const chipsPromises = searchResults.slice(0, 4).map(async r => {
                let domain = r.url;
                try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }

                const favicon = await getFavicon(r.url);
                const faviconHtml = favicon ? `<img src="${escHtml(favicon)}" class="search-source-favicon" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">` : '';
                const fallbackIcon = `<i class="fa-solid fa-link" style="font-size:9px;${favicon ? 'display:none;' : ''}"></i>`;

                const chip = document.createElement('a');
                chip.href = r.url;
                chip.target = '_blank';
                chip.rel = 'noopener noreferrer';
                chip.className = 'dr-source-chip';
                chip.innerHTML = `${faviconHtml}${fallbackIcon} ${escHtml(domain)}`;

                return chip;
            });

            const chips = await Promise.all(chipsPromises);
            chips.forEach(chip => sourcesEl.appendChild(chip));
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

        const chipsPromises = searchResults.slice(0, 4).map(async r => {
            let domain = r.url;
            try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }

            const favicon = await getFavicon(r.url);
            const faviconHtml = favicon ? `<img src="${escHtml(favicon)}" class="search-source-favicon" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">` : '';
            const fallbackIcon = `<i class="fa-solid fa-link" style="font-size:10px;${favicon ? 'display:none;' : ''}"></i>`;

            const chip = document.createElement('a');
            chip.href = r.url;
            chip.target = '_blank';
            chip.rel = 'noopener noreferrer';
            chip.className = 'search-source-chip';
            chip.innerHTML = `${faviconHtml}${fallbackIcon} ${escHtml(domain)}`;

            return chip;
        });

        const chips = await Promise.all(chipsPromises);
        chips.forEach(chip => sourceBar.appendChild(chip));
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

    if (think) {
        return {
            content: reply,
            thinking: think
        };
    }

    return reply;
}

window.sendChatTextWithThinking = sendChatTextWithThinking;
window.sendDeepResearch = sendDeepResearch;
window.sendChatWithVisionImages = sendChatWithVisionImages;
window.isThinkingMode = function () { return thinkingModeEnabled; };
window.isDeepResearch = function () { return deepResearchEnabled; };
