function getAiThemes() {
    try {
        return JSON.parse(localStorage.getItem('vexa_ai_themes') || '[]');
    } catch {
        return [];
    }
}

async function loadAiThemesFromFirebase() {
    let themes = [];

    if (currentUser && window.firebaseDB) {
        try {
            const doc = await window.firebaseDB.collection('user_preferences').doc(currentUser.uid).get();
            if (doc.exists) {
                const data = doc.data();
                if (data.ai_themes) {
                    themes = data.ai_themes;
                    localStorage.setItem('vexa_ai_themes', JSON.stringify(themes));
                }
                if (data.active_ai_theme) {
                    localStorage.setItem('vexa_active_ai_theme', data.active_ai_theme);
                }
                return themes;
            }
        } catch (e) {
            console.error('Error loading AI themes from Firebase:', e);
        }
    }

    return getAiThemes();
}

function saveAiThemes(themes) {
    localStorage.setItem('vexa_ai_themes', JSON.stringify(themes));

    if (currentUser && window.firebaseDB) {
        try {
            window.firebaseDB.collection('user_preferences').doc(currentUser.uid).set({
                ai_themes: themes
            }, { merge: true });
        } catch (e) {
            console.error('Error saving AI themes to Firebase:', e);
        }
    }
}

function applyAiTheme(theme) {
    const root = document.documentElement;
    const vars = theme.vars;
    Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
    localStorage.setItem('vexa_active_ai_theme', theme.id);
    localStorage.removeItem('vexa_theme');
    const sel = document.getElementById('themeSelect');
    if (sel) sel.value = '';

    if (currentUser && window.firebaseDB) {
        try {
            window.firebaseDB.collection('user_preferences').doc(currentUser.uid).set({
                active_ai_theme: theme.id
            }, { merge: true });
        } catch (e) {
            console.error('Error saving active AI theme to Firebase:', e);
        }
    }

    const container = document.getElementById('aiThemesList');
    if (container) {
        updateAiThemesUI();
    }
}

function clearAiThemeOverrides() {
    const root = document.documentElement;
    const varNames = ['--bg', '--bg2', '--surface-rgb', '--surface', '--surface2', '--surface3', '--fg', '--fg-muted', '--muted', '--light', '--border', '--border-light', '--accent', '--accent-hover'];
    varNames.forEach(v => root.style.removeProperty(v));
    localStorage.removeItem('vexa_active_ai_theme');

    if (currentUser && window.firebaseDB) {
        try {
            window.firebaseDB.collection('user_preferences').doc(currentUser.uid).set({
                active_ai_theme: null
            }, { merge: true });
        } catch (e) {
            console.error('Error clearing active AI theme from Firebase:', e);
        }
    }

    const container = document.getElementById('aiThemesList');
    const settingsModal = document.getElementById('settingsModalOverlay');
    if (container && settingsModal && !settingsModal.classList.contains('hidden')) {
        updateAiThemesUI();
    }
}

function updateAiThemesUI() {
    const container = document.getElementById('aiThemesList');
    if (!container) return;

    const activeId = localStorage.getItem('vexa_active_ai_theme');
    const cards = container.querySelectorAll(':scope > [data-id]');

    cards.forEach(card => {
        const themeId = card.dataset.id;
        const isActive = themeId === activeId;
        const applyBtn = card.querySelector('.ai-theme-apply-btn');

        if (applyBtn) {
            applyBtn.textContent = isActive ? 'Active' : 'Apply';
            applyBtn.style.background = isActive ? 'var(--fg)' : 'var(--surface2)';
            applyBtn.style.color = isActive ? 'var(--bg)' : 'var(--fg)';
        }
    });
}

async function renderAiThemes() {
    const container = document.getElementById('aiThemesList');
    if (!container) return;
    const themes = await loadAiThemesFromFirebase();
    if (!themes.length) {
        container.innerHTML = '<div style="font-size:0.8125rem;color:var(--muted);padding:4px 2px;">No AI themes yet. Describe one above to generate it.</div>';
        return;
    }
    const activeId = localStorage.getItem('vexa_active_ai_theme');
    container.innerHTML = '';
    themes.forEach(theme => {
        const isActive = theme.id === activeId;
        const card = document.createElement('div');
        card.dataset.id = theme.id;
        card.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--radius-lg);background:var(--surface);cursor:pointer;';
        card.innerHTML = `
            <div style="display:flex;gap:5px;flex-shrink:0;">
                <div style="width:14px;height:14px;border-radius:50%;background:${theme.vars['--bg']};border:1px solid rgba(128,128,128,0.3);"></div>
                <div style="width:14px;height:14px;border-radius:50%;background:${theme.vars['--fg']};border:1px solid rgba(128,128,128,0.3);"></div>
                <div style="width:14px;height:14px;border-radius:50%;background:${theme.vars['--accent']};border:1px solid rgba(128,128,128,0.3);"></div>
            </div>
            <div style="flex:1;min-width:0;">
                <div class="ai-theme-name-display" data-id="${theme.id}" style="font-size:0.875rem;font-weight:500;color:var(--fg);cursor:text;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(theme.name)}</div>
                <div style="font-size:0.7rem;color:var(--muted);margin-top:1px;">${escHtml(theme.prompt)}</div>
            </div>
            <button class="ai-theme-apply-btn" data-id="${theme.id}" style="padding:5px 12px;border-radius:var(--radius);background:${isActive ? 'var(--fg)' : 'var(--surface2)'};color:${isActive ? 'var(--bg)' : 'var(--fg)'};font-size:0.75rem;font-weight:600;border:none;cursor:pointer;font-family:var(--font);flex-shrink:0;">${isActive ? 'Active' : 'Apply'}</button>
            <button class="ai-theme-del-btn" data-id="${theme.id}" style="width:28px;height:28px;border-radius:var(--radius-sm);background:transparent;border:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;"><i class="fa-solid fa-trash"></i></button>
        `;

        card.querySelector('.ai-theme-apply-btn').addEventListener('click', async e => {
            e.stopPropagation();
            const button = e.currentTarget;
            const themeId = button?.dataset?.id;
            if (!themeId) return;

            const themes = await loadAiThemesFromFirebase();
            const t = themes.find(x => x.id === themeId);
            if (t) {
                applyAiTheme(t);
                const themeSelect = document.getElementById('themeSelect');
                if (themeSelect) {
                    themeSelect.value = t.id;
                    setTimeout(() => {
                        themeSelect.value = t.id;
                    }, 50);
                }
            }
        });

        card.querySelector('.ai-theme-del-btn').addEventListener('click', async e => {
            e.stopPropagation();
            const button = e.currentTarget;
            const themeId = button?.dataset?.id;
            if (!themeId) return;

            const confirmed = await confirm('Delete this theme?');
            if (!confirmed) return;
            const themes = await loadAiThemesFromFirebase();
            const filteredThemes = themes.filter(x => x.id !== themeId);
            saveAiThemes(filteredThemes);
            if (localStorage.getItem('vexa_active_ai_theme') === themeId) {
                clearAiThemeOverrides();
                applyTheme(localStorage.getItem('vexa_theme') || 'light');
            }
            renderAiThemes();
            if (typeof populateAiThemesInDropdown === 'function') {
                populateAiThemesInDropdown();
            }
        });

        const nameEl = card.querySelector('.ai-theme-name-display');
        nameEl.addEventListener('click', async e => {
            e.stopPropagation();
            const id = nameEl.dataset.id;
            const themes = await loadAiThemesFromFirebase();
            const t = themes.find(x => x.id === id);
            if (!t) return;
            const input = document.createElement('input');
            input.value = t.name;
            input.style.cssText = 'font-size:0.875rem;font-weight:500;color:var(--fg);background:transparent;border:none;outline:none;border-bottom:1px solid var(--muted);width:100%;font-family:var(--font);';
            nameEl.replaceWith(input);
            input.focus();
            input.select();
            const commit = async () => {
                const newName = input.value.trim() || t.name;
                t.name = newName;
                await saveAiThemes(themes);
                renderAiThemes();
                if (typeof populateAiThemesInDropdown === 'function') {
                    populateAiThemesInDropdown();
                }
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
        });

        container.appendChild(card);
    });
}

async function generateAiTheme(prompt) {
    const statusEl = document.getElementById('aiThemeStatus');
    const btn = document.getElementById('aiThemeGenBtn');
    if (!prompt.trim()) return;

    if (statusEl) { statusEl.textContent = 'Generating theme...'; statusEl.style.display = 'block'; }
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
        const aiPrompt = `Generate a UI color theme based on this description: "${prompt}". Return ONLY valid JSON, no markdown, no explanation. Schema: {"name":"<creative short name>","vars":{"--bg":"<hex>","--bg2":"<hex>","--surface-rgb":"<rgba>","--surface":"<hex>","--surface2":"<hex>","--surface3":"<hex>","--fg":"<hex>","--fg-muted":"<hex>","--muted":"<hex>","--light":"<hex>","--border":"<hex>","--border-light":"<hex>","--accent":"<hex>","--accent-hover":"<hex>"}}. Rules: ensure strong contrast between --bg and --fg (WCAG AA). --accent should pop against --bg. --surface should be slightly lighter/darker than --bg. Make it beautiful and cohesive for the prompt.`;

        const response = await fetch(CONFIG.BASE + '/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: aiPrompt, model: 'vexa' })
        });

        const data = await response.json();
        const text = data.response || '';
        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        const newTheme = {
            id: 'aitheme_' + Date.now(),
            name: parsed.name || prompt,
            prompt: prompt,
            vars: parsed.vars
        };

        const themes = await loadAiThemesFromFirebase();
        themes.unshift(newTheme);
        saveAiThemes(themes);

        applyAiTheme(newTheme);

        if (typeof populateAiThemesInDropdown === 'function') {
            populateAiThemesInDropdown();
        }

        if (statusEl) statusEl.textContent = 'Theme "' + newTheme.name + '" created and applied!';
        setTimeout(() => { if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; } }, 3000);

        const inp = document.getElementById('aiThemePrompt');
        if (inp) inp.value = '';

    } catch (err) {
        if (statusEl) statusEl.textContent = 'Failed to generate theme. Try again.';
        console.error(err);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Generate'; }
}

function initAiThemes() {
    const btn = document.getElementById('aiThemeGenBtn');
    const inp = document.getElementById('aiThemePrompt');

    if (btn) {
        btn.addEventListener('click', () => generateAiTheme(inp?.value || ''));
    }
    if (inp) {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') generateAiTheme(inp.value); });
    }

    loadAiThemesFromFirebase().then(themes => {
        const activeId = localStorage.getItem('vexa_active_ai_theme');
        if (activeId) {
            const t = themes.find(x => x.id === activeId);
            if (t) applyAiTheme(t);
        }
        renderAiThemes();
    });

    const settingsModalOverlay = document.getElementById('settingsModalOverlay');
    if (settingsModalOverlay) {
        const observer = new MutationObserver(async () => {
            if (!settingsModalOverlay.classList.contains('hidden')) {
                await renderAiThemes();
            }
        });
        observer.observe(settingsModalOverlay, { attributes: true, attributeFilter: ['class'] });
    }

    renderAiThemes();
}

document.addEventListener('DOMContentLoaded', initAiThemes);