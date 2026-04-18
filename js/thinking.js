const THINKING_STEPS_MAX = 8;
const RESEARCH_SOURCES_COUNT = 6;

async function getFavicon(url) {
    try {
        const domain = new URL(url).hostname.replace('www.', '').replace(/\/+$/, '');
        return `https://favicon.vemetric.com/${domain}`;
    } catch {
        return null;
    }
}

async function sendChatTextWithThinking(userMessage, loading, session) {
    const history = buildConversationHistory(session);

    const thinkingSystemAddition = `
You are an advanced reasoning assistant. When you think through a problem, wrap your internal reasoning in <think>...</think> tags before giving your final answer. Be thorough in your reasoning, explore multiple angles, and then present a clean, clear final response after the thinking block.

IMPORTANT: Always start your response with <think> tags containing your step-by-step reasoning process. Format your thinking as follows:
- Start with "So the user said..." followed by a brief restatement of their question
- Then explain your reasoning process with multiple points
- End with your conclusion or approach
Then close with </think> tags, then provide your final answer.`;

    const messages = [
        { role: 'system', content: buildSystemPrompt() + thinkingSystemAddition },
        ...history,
        { role: 'user', content: userMessage }
    ];

    const loadingBub = loading.querySelector('.bot-bub');
    loadingBub.innerHTML = `<span class="thinking-inline"><span class="thinking-dot"></span>Thinking…</span>`;

    const res = await fetchChat(messages, currentModel || 'vexa', currentAbortController?.signal);
    const reply = await readSSEStream(res, currentAbortController?.signal);

    if (!reply) throw new Error('Empty response');

    let text = reply;
    let think = null;

    const m = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) {
        think = m[1].trim();
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    } else {
        try {
            const thinkText = await fetchQuery(
                `Provide step-by-step thinking for this question. Format: "So the user said..." followed by reasoning points, then conclusion. Be analytical, 3-5 sentences. Question: ${userMessage}`,
                currentModel || 'vexa'
            );
            if (thinkText) think = thinkText;
        } catch { }

        if (!think) {
            think = `So the user said "${userMessage}". I need to understand what they're asking and provide a helpful response based on the context.`;
        }
    }

    swapTextWithThinking(loading, text, think);

    return think ? { content: text, thinking: think } : text;
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
        const stepsText = await fetchQuery(
            `Generate a JSON array of 4-5 short research step descriptions (under 8 words each) for researching this question. Return ONLY the raw JSON array, no markdown. Question: ${userMessage}`,
            currentModel || 'vexa'
        );
        const cleaned = stepsText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length) steps = parsed;
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
        { role: 'user', content: searchContext ? `${searchContext}\n\nUser question: ${userMessage}` : userMessage }
    ];

    const res = await fetchChat(messages, currentModel || 'vexa', currentAbortController?.signal);
    let reply = await readSSEStream(res, currentAbortController?.signal);

    if (!reply) throw new Error('Empty response');

    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const finalBub = loading.querySelector('.bot-bub');
    finalBub.innerHTML = '';

    if (searchResults.length) {
        const sourceBar = document.createElement('div');
        sourceBar.className = 'dr-final-sources';
        const sourceLabel = document.createElement('span');
        sourceLabel.className = 'dr-final-sources-label';
        sourceLabel.innerHTML = '<i class="fa-solid fa-globe" style="font-size:11px;margin-right:5px;color:var(--accent)"></i>Sources';
        sourceBar.appendChild(sourceLabel);
        searchResults.slice(0, 4).forEach(r => {
            let domain = r.url;
            try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }
            const favicon = `https://favicon.vemetric.com/${domain}`;
            const chip = document.createElement('a');
            chip.href = r.url;
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
            sourceBar.appendChild(chip);
        });
        finalBub.appendChild(sourceBar);
    }

    const textEl = document.createElement('div');
    textEl.className = 'bot-bub-content';
    finalBub.appendChild(textEl);

    swapTextWithThinkingAndResearch(loading, reply, searchResults);

    return reply;
}

async function sendChatWithVisionImages(text, images, loading, session) {
    const history = buildConversationHistory(session);

    const imageContents = await Promise.all(images.map(async (imageUrl) => {
        if (imageUrl.startsWith('data:')) {
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
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

    const res = await fetchChat(messages, currentModel || 'vexa', currentAbortController?.signal);
    let reply = await readSSEStream(res, currentAbortController?.signal);

    if (!reply) throw new Error('Empty response');

    let think = null;
    const m = reply.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) { think = m[1].trim(); reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); }

    swapTextWithThinking(loading, reply, think);

    return think ? { content: reply, thinking: think } : reply;
}

window.sendChatTextWithThinking = sendChatTextWithThinking;
window.sendDeepResearch = sendDeepResearch;
window.sendChatWithVisionImages = sendChatWithVisionImages;
window.isThinkingMode = function () { return thinkingModeEnabled; };
window.isDeepResearch = function () { return deepResearchEnabled; };
