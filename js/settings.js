function getVexaSettings() {
    try { return JSON.parse(localStorage.getItem('vexa_settings') || '{}'); } catch { return {}; }
}

function setVexaSetting(key, value) {
    const s = getVexaSettings();
    s[key] = value;
    localStorage.setItem('vexa_settings', JSON.stringify(s));
    if (currentUser && window.firebaseDB) {
        window.firebaseDB.collection('user_preferences').doc(currentUser.uid)
            .set({ settings: s }, { merge: true }).catch(() => { });
    }
}

async function loadVexaSettingsFromFirebase() {
    if (!currentUser || !window.firebaseDB) return;
    try {
        const doc = await window.firebaseDB.collection('user_preferences').doc(currentUser.uid).get();
        if (doc.exists && doc.data().settings) {
            const remote = doc.data().settings;
            const merged = Object.assign(getVexaSettings(), remote);
            localStorage.setItem('vexa_settings', JSON.stringify(merged));
        }
    } catch { }
}

async function populateAiThemesInDropdown() {
    const themeSelect = document.getElementById('themeSelect');
    if (!themeSelect) return;

    const activeAiThemeId = localStorage.getItem('vexa_active_ai_theme');
    const savedTheme = localStorage.getItem('vexa_theme') || 'light';
    const currentValue = activeAiThemeId || savedTheme;

    const aiThemes = await loadAiThemesFromFirebase();

    const existingAiOptions = themeSelect.querySelectorAll('option[value^="aitheme_"], option:disabled');
    existingAiOptions.forEach(option => option.remove());

    if (aiThemes.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '--- AI Themes ---';
        separator.style.cssText = 'font-weight: 600; color: var(--muted);';
        themeSelect.appendChild(separator);

        aiThemes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.name;
            themeSelect.appendChild(option);
        });
    }

    themeSelect.value = currentValue;
}

function applyVexaSettingsToUI() {
    const s = getVexaSettings();

    const sendOnEnterToggle = document.getElementById('sendOnEnterToggle');
    if (sendOnEnterToggle) sendOnEnterToggle.checked = s.sendOnEnter !== false;

    const autoTitleToggle = document.getElementById('autoTitleToggle');
    if (autoTitleToggle) autoTitleToggle.checked = s.autoTitle !== false;

    const showTimestampsToggle = document.getElementById('showTimestampsToggle');
    if (showTimestampsToggle) showTimestampsToggle.checked = !!s.showTimestamps;

    const streamingToggle = document.getElementById('streamingToggle');
    if (streamingToggle) streamingToggle.checked = s.streaming !== false;

    const memoryToggle = document.getElementById('memoryToggle');
    if (memoryToggle) memoryToggle.checked = !!s.memoryEnabled;

    const responseLengthSelect = document.getElementById('responseLengthSelect');
    if (responseLengthSelect) responseLengthSelect.value = s.responseLength || 'balanced';

    const responseLangSelect = document.getElementById('responseLangSelect');
    if (responseLangSelect) responseLangSelect.value = s.responseLang || 'auto';

    const systemPromptTextarea = document.getElementById('systemPromptTextarea');
    if (systemPromptTextarea) systemPromptTextarea.value = s.systemPrompt || '';

    const defaultModelSelect = document.getElementById('defaultModelSettingSelect');
    if (defaultModelSelect) defaultModelSelect.value = s.defaultModel || '';

    if (s.showTimestamps) {
        document.body.classList.add('show-timestamps');
    } else {
        document.body.classList.remove('show-timestamps');
    }
}

function initSettingsControls() {
    const sendOnEnterToggle = document.getElementById('sendOnEnterToggle');
    if (sendOnEnterToggle) {
        sendOnEnterToggle.addEventListener('change', () => {
            setVexaSetting('sendOnEnter', sendOnEnterToggle.checked);
        });
    }

    const autoTitleToggle = document.getElementById('autoTitleToggle');
    if (autoTitleToggle) {
        autoTitleToggle.addEventListener('change', () => {
            setVexaSetting('autoTitle', autoTitleToggle.checked);
        });
    }

    const showTimestampsToggle = document.getElementById('showTimestampsToggle');
    if (showTimestampsToggle) {
        showTimestampsToggle.addEventListener('change', () => {
            setVexaSetting('showTimestamps', showTimestampsToggle.checked);
            if (showTimestampsToggle.checked) {
                document.body.classList.add('show-timestamps');
            } else {
                document.body.classList.remove('show-timestamps');
            }
        });
    }

    const streamingToggle = document.getElementById('streamingToggle');
    if (streamingToggle) {
        streamingToggle.addEventListener('change', () => {
            setVexaSetting('streaming', streamingToggle.checked);
        });
    }

    const memoryToggle = document.getElementById('memoryToggle');
    if (memoryToggle) {
        memoryToggle.addEventListener('change', () => {
            setVexaSetting('memoryEnabled', memoryToggle.checked);
        });
    }

    const responseLengthSelect = document.getElementById('responseLengthSelect');
    if (responseLengthSelect) {
        responseLengthSelect.addEventListener('change', () => {
            setVexaSetting('responseLength', responseLengthSelect.value);
        });
    }

    const responseLangSelect = document.getElementById('responseLangSelect');
    if (responseLangSelect) {
        responseLangSelect.addEventListener('change', () => {
            setVexaSetting('responseLang', responseLangSelect.value);
        });
    }

    const systemPromptTextarea = document.getElementById('systemPromptTextarea');
    const saveSystemPromptBtn = document.getElementById('saveSystemPromptBtn');
    if (saveSystemPromptBtn && systemPromptTextarea) {
        saveSystemPromptBtn.addEventListener('click', () => {
            setVexaSetting('systemPrompt', systemPromptTextarea.value.trim());
            saveSystemPromptBtn.textContent = 'Saved!';
            setTimeout(() => { saveSystemPromptBtn.textContent = 'Save'; }, 2000);
        });
    }

    const defaultModelSettingSelect = document.getElementById('defaultModelSettingSelect');
    if (defaultModelSettingSelect) {
        defaultModelSettingSelect.addEventListener('change', () => {
            setVexaSetting('defaultModel', defaultModelSettingSelect.value);
            const label = defaultModelSettingSelect.options[defaultModelSettingSelect.selectedIndex]?.text || '';
            if (defaultModelSettingSelect.value) {
                setModel(defaultModelSettingSelect.value, label);
            }
        });
    }

    const exportChatsBtn = document.getElementById('exportChatsBtn');
    if (exportChatsBtn) {
        exportChatsBtn.addEventListener('click', exportAllChats);
    }

    const clearChatsSettingsBtn = document.getElementById('clearChatsSettingsBtn');
    if (clearChatsSettingsBtn) {
        clearChatsSettingsBtn.addEventListener('click', async () => {
            const confirmed = await confirm('Delete all chat history? This cannot be undone.');
            if (confirmed) {
                await clearAllChatsFromFirebase();
                chatSessions = [];
                currentSessionId = null;
                renderChatHistory();
                newChat();
            }
        });
    }
}

function populateDefaultModelSelect() {
    const sel = document.getElementById('defaultModelSettingSelect');
    if (!sel || !allTextModels || !allTextModels.length) return;
    sel.innerHTML = '<option value="">Auto</option>';
    allTextModels.forEach(([id, info]) => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = info.label || id;
        sel.appendChild(o);
    });
    const s = getVexaSettings();
    sel.value = s.defaultModel || '';
}

function getUsageStats() {
    const totalSessions = chatSessions ? chatSessions.length : 0;
    const totalMessages = chatSessions
        ? chatSessions.reduce((acc, s) => acc + (s.messages ? s.messages.filter(m => m.role === 'user').length : 0), 0)
        : 0;
    const savedImagesCount = typeof savedImages !== 'undefined' ? savedImages.length : 0;
    return { totalSessions, totalMessages, savedImagesCount };
}

function renderUsageStats() {
    const el = document.getElementById('usageStatsContent');
    if (!el) return;
    const { totalSessions, totalMessages, savedImagesCount } = getUsageStats();
    el.innerHTML = `
        <div class="settings-row">
            <div class="settings-row-label"><span>Total chats</span></div>
            <span style="font-size:0.8125rem;color:var(--muted);padding-right:10px;">${totalSessions}</span>
        </div>
        <div class="settings-row">
            <div class="settings-row-label"><span>Messages sent</span></div>
            <span style="font-size:0.8125rem;color:var(--muted);padding-right:10px;">${totalMessages}</span>
        </div>
        <div class="settings-row" style="border-bottom:none">
            <div class="settings-row-label"><span>Saved images</span></div>
            <span style="font-size:0.8125rem;color:var(--muted);padding-right:10px;">${savedImagesCount}</span>
        </div>`;
}

function exportAllChats() {
    if (!chatSessions || !chatSessions.length) {
        toast.info('No chats to export.');
        return;
    }
    const data = JSON.stringify(chatSessions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vexa-chats-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function initSettings() {
    initMobileSettingsGestures();

    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const isMobile = window.innerWidth <= 680 || window.innerHeight <= 909;
            if (isMobile) {
                openSettingsSection(tab.dataset.section);
                return;
            }
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            tab.classList.add('active');
            const sec = document.getElementById('settings-' + tab.dataset.section);
            if (sec) sec.classList.add('active');
        });
    });

    document.getElementById('themeSelect')?.addEventListener('change', async e => {
        const theme = e.target.value;

        if (theme.startsWith('aitheme_')) {
            const themes = await loadAiThemesFromFirebase();
            const aiTheme = themes.find(t => t.id === theme);
            if (aiTheme) {
                applyAiTheme(aiTheme);
                setTimeout(() => {
                    e.target.value = theme;
                }, 10);
            }
        } else {
            applyTheme(theme);
            localStorage.setItem('vexa_theme', theme);
            saveUserPrefToFirebase('theme', theme);
            clearAiThemeOverrides();
        }
    });

    document.getElementById('fontSizeSelect')?.addEventListener('change', e => {
        const size = e.target.value;
        document.documentElement.style.fontSize = size + 'px';
        localStorage.setItem('vexa_fontsize', size);
        saveUserPrefToFirebase('fontSize', size);
    });

    document.getElementById('clearChatsBtn')?.addEventListener('click', async () => {
        const confirmed = await confirm('Clear all chat history?');
        if (confirmed) {
            await clearAllChatsFromFirebase();
            chatSessions = [];
            currentSessionId = null;
            renderChatHistory();
            newChat();
        }
    });

    document.getElementById('savePersonalizationBtn')?.addEventListener('click', savePersonalization);

    populateAiThemesInDropdown().then(() => {
        const activeAiThemeId = localStorage.getItem('vexa_active_ai_theme');
        if (!activeAiThemeId) {
            const savedTheme = localStorage.getItem('vexa_theme') || 'light';
            applyTheme(savedTheme);
        }
    });

    const savedFontSize = localStorage.getItem('vexa_fontsize') || '15';
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    if (fontSizeSelect) fontSizeSelect.value = savedFontSize;
    document.documentElement.style.fontSize = savedFontSize + 'px';

    document.getElementById('settingsBtn')?.addEventListener('click', openSettingsModal);
    document.getElementById('topbarSettingsBtn')?.addEventListener('click', openSettingsModal);

    document.getElementById('settingsModalOverlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('settingsModalOverlay')) closeSettingsModal();
    });
    document.getElementById('settingsModalClose')?.addEventListener('click', closeSettingsModal);

    initSettingsControls();
    applyVexaSettingsToUI();

    loadVexaSettingsFromFirebase().then(() => {
        applyVexaSettingsToUI();
        populateDefaultModelSelect();
    });
}

function openSettingsModal() {
    updateSettingsAccountUI(!!currentUser);
    loadPersonalization();
    document.getElementById('settingsModalOverlay')?.classList.remove('hidden');
    const isMobile = window.innerWidth <= 680 || window.innerHeight <= 909;
    if (isMobile) {
        showSettingsMenu();
    }
    populateAiThemesInDropdown();
    applyVexaSettingsToUI();
    populateDefaultModelSelect();
    renderUsageStats();
}

function closeSettingsModal() {
    document.getElementById('settingsModalOverlay')?.classList.add('hidden');
}

function updateSettingsAccountUI(loggedIn) {
    const profileHeader = document.getElementById('settingsProfileHeader');
    const el = document.getElementById('accountContent');

    if (loggedIn && currentUser) {
        const email = currentUser.email || '';
        const username = email.split('@')[0];
        const savedAvatar = localStorage.getItem('user_avatar_' + currentUser.uid);
        const initials = username.slice(0, 2).toUpperCase();

        if (profileHeader) {
            profileHeader.innerHTML = `
                <div class="settings-profile-avatar" id="settingsProfileAvatar">
                    ${savedAvatar ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : initials}
                </div>
                <div class="settings-profile-name">${escHtml(username)}</div>
                <div class="settings-profile-username">${escHtml(username)}</div>
                <button class="settings-profile-edit-btn" onclick="document.getElementById('avatarUpload').click()">Edit profile</button>
                <input type="file" id="avatarUpload" accept="image/*" style="display:none;">`;
            document.getElementById('avatarUpload')?.addEventListener('change', handleAvatarUpload);
        }

        if (el) {
            el.innerHTML = `
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span>Email</span>
                    </div>
                    <span style="font-size:0.8125rem;color:var(--muted);padding-right: 10px;">${escHtml(email)}</span>
                </div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span>Subscription</span>
                    </div>
                    <span style="font-size:0.8125rem;color:var(--muted);padding-right: 10px;">Free Plan</span>
                </div>
                <div class="settings-row" style="border-bottom:none">
                    <div class="settings-row-label">
                        <span style="color:var(--danger)">Log out</span>
                    </div>
                    <button class="settings-danger-btn" id="logoutBtn" style="border-color:var(--border);color:var(--fg)">Log out</button>
                </div>`;
            document.getElementById('logoutBtn')?.addEventListener('click', signOut);
        }
    } else {
        if (profileHeader) profileHeader.innerHTML = '';
        if (el) {
            el.innerHTML = `
                <div class="settings-row" style="border-bottom:none">
                    <div class="account-not-logged">
                        <p>You are not logged in.</p>
                        <button class="auth-submit" id="settingsLoginBtn" style="margin-top:12px;width:auto;padding:10px 24px">Log in</button>
                    </div>
                </div>`;
            document.getElementById('settingsLoginBtn')?.addEventListener('click', openAuthOverlay);
        }
    }
}

async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CONFIG.CLOUDINARY_CONFIG.uploadPreset);
        formData.append('api_key', CONFIG.CLOUDINARY_CONFIG.apiKey);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CONFIG.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) throw new Error('Cloudinary upload failed');

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const cloudinaryUrl = data.secure_url;

        localStorage.setItem('user_avatar_' + currentUser.uid, cloudinaryUrl);
        updateAllAvatars(cloudinaryUrl);
        updateSettingsAccountUI(true);
        await saveUserPrefToFirebase('avatar', cloudinaryUrl);

    } catch (error) {
        console.error('Avatar upload error:', error);

        const reader = new FileReader();
        reader.onload = async function (event) {
            const avatarData = event.target.result;
            localStorage.setItem('user_avatar_' + currentUser.uid, avatarData);
            updateAllAvatars(avatarData);
            updateSettingsAccountUI(true);
            await saveUserPrefToFirebase('avatar', avatarData);
        };
        reader.readAsDataURL(file);
    }
}

function updateAllAvatars(avatarUrl) {
    document.querySelectorAll('#userAvatar, #mobileUserAvatar, #popoverAvatar').forEach(el => {
        el.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    });
}

function applyTheme(theme) {
    document.documentElement.classList.add('theme-switching');

    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }

    setTimeout(() => {
        document.documentElement.classList.remove('theme-switching');
    }, 300);

    createThemeSwitchFeedback();
}

function initSystemThemeDetection() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    if (localStorage.getItem('vexa_theme') === 'system') {
        applyTheme('system');
    }

    mediaQuery.addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('vexa_theme') || 'light';
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });

    window.themeMediaQuery = mediaQuery;
}

function getEffectiveTheme() {
    const savedTheme = localStorage.getItem('vexa_theme') || 'light';
    if (savedTheme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return savedTheme;
}

function watchSystemThemeChanges() {
    if (!window.themeMediaQuery) {
        initSystemThemeDetection();
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const currentTheme = localStorage.getItem('vexa_theme') || 'light';
            if (currentTheme === 'system') {
                const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                const currentEffective = getEffectiveTheme();
                if (systemTheme !== currentEffective) {
                    applyTheme('system');
                }
            }
        }
    });
}

function createThemeSwitchFeedback() {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 9999;
        transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    document.body.appendChild(feedback);

    requestAnimationFrame(() => {
        feedback.style.width = '200vw';
        feedback.style.height = '200vw';
        feedback.style.opacity = '0';
    });

    setTimeout(() => {
        feedback.remove();
    }, 600);
}

async function savePersonalization() {
    const prefs = {
        baseTone: document.getElementById('baseToneSelect')?.value || 'balanced',
        charWarm: document.getElementById('charWarm')?.value || 'default',
        charEnthusiastic: document.getElementById('charEnthusiastic')?.value || 'default',
        charHeaders: document.getElementById('charHeaders')?.value || 'default',
        charEmoji: document.getElementById('charEmoji')?.value || 'default',
        charHumor: document.getElementById('charHumor')?.value || 'default',
        customInstructions: document.getElementById('customInstructions')?.value || '',
        nickname: document.getElementById('userNickname')?.value || '',
        aboutUser: document.getElementById('aboutUser')?.value || ''
    };

    localStorage.setItem('vexa_personalization', JSON.stringify(prefs));

    if (currentUser && window.firebaseDB) {
        try {
            await window.firebaseDB.collection('user_preferences').doc(currentUser.uid).set(prefs, { merge: true });
        } catch (e) {
            console.error('Error saving personalization:', e);
        }
    }

    const btn = document.getElementById('savePersonalizationBtn');
    if (btn) {
        btn.textContent = 'Saved!';
        setTimeout(() => { btn.textContent = 'Save preferences'; }, 2000);
    }
}

async function loadPersonalization() {
    let prefs = null;

    if (currentUser && window.firebaseDB) {
        try {
            const doc = await window.firebaseDB.collection('user_preferences').doc(currentUser.uid).get();
            if (doc.exists) prefs = doc.data();
        } catch (e) { }
    }

    if (!prefs) {
        try { prefs = JSON.parse(localStorage.getItem('vexa_personalization') || 'null'); } catch { }
    }

    if (!prefs) return;

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
    };

    setVal('baseToneSelect', prefs.baseTone);
    setVal('charWarm', prefs.charWarm);
    setVal('charEnthusiastic', prefs.charEnthusiastic);
    setVal('charHeaders', prefs.charHeaders);
    setVal('charEmoji', prefs.charEmoji);
    setVal('charHumor', prefs.charHumor);
    setVal('customInstructions', prefs.customInstructions);
    setVal('userNickname', prefs.nickname);
    setVal('aboutUser', prefs.aboutUser);

    window.vexaPersonalization = prefs;
}

function showSettingsMenu() {
    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    const body = document.querySelector('.settings-modal-body');
    if (!body) return;

    const mobileTitle = document.getElementById('settingsMobileTitle');
    if (mobileTitle) mobileTitle.textContent = 'Settings';

    const backBtn = document.getElementById('settingsBackBtn');
    const closeBtn = document.getElementById('settingsModalClose');
    if (backBtn) backBtn.classList.add('hidden');
    if (closeBtn) closeBtn.classList.remove('hidden');

    let menuEl = document.getElementById('settingsMobileMenu');
    if (!menuEl) {
        menuEl = document.createElement('div');
        menuEl.id = 'settingsMobileMenu';
        body.prepend(menuEl);
    }

    const email = currentUser?.email || '';
    const username = email.split('@')[0] || '';
    const savedAvatar = currentUser ? localStorage.getItem('user_avatar_' + currentUser.uid) : null;
    const initials = username.slice(0, 2).toUpperCase() || 'U';

    const avatarHtml = savedAvatar
        ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : initials;

    const profileHtml = currentUser ? `
        <div class="smm-profile">
            <div class="smm-avatar">${avatarHtml}</div>
            <div class="smm-name">${escHtml(username)}</div>
            <div class="smm-username">${escHtml(username)}</div>
            <button class="smm-edit-btn" onclick="document.getElementById('avatarUploadMain')?.click()">Edit profile</button>
            <input type="file" id="avatarUploadMain" accept="image/*" style="display:none;">
        </div>
        <div class="smm-section-label">Account</div>
        <div class="smm-card">
            <div class="smm-card-item">
                <div class="smm-item-icon"><i class="fa-regular fa-envelope"></i></div>
                <div class="smm-item-body">
                    <div class="smm-item-title">Email</div>
                    <div class="smm-item-sub">${escHtml(email)}</div>
                </div>
            </div>
            <div class="smm-card-item">
                <div class="smm-item-icon"><i class="fa-solid fa-plus-circle"></i></div>
                <div class="smm-item-body"><div class="smm-item-title">Subscription</div></div>
                <span class="smm-item-badge">Free Plan</span>
            </div>
            <div class="smm-card-item smm-chevron-item" onclick="openSettingsSection('personalization')">
                <div class="smm-item-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                <div class="smm-item-body"><div class="smm-item-title">Personalization</div></div>
                <i class="fa-solid fa-chevron-right smm-chevron"></i>
            </div>
        </div>
    ` : `
        <div class="smm-profile">
            <div class="smm-avatar">U</div>
            <div class="smm-name">Not logged in</div>
            <button class="smm-edit-btn" onclick="closeSettingsModal();openAuthOverlay()">Log in</button>
        </div>
    `;

    menuEl.innerHTML = profileHtml + `
        <div class="smm-section-label">Discord</div>
        <div class="smm-card">
            <div class="smm-card-item smm-chevron-item" onclick="openSettingsSection('discord')">
                <div class="smm-item-icon"><i class="fa-brands fa-discord"></i></div>
                <div class="smm-item-body"><div class="smm-item-title">Discord</div></div>
                <i class="fa-solid fa-chevron-right smm-chevron"></i>
            </div>
        </div>
        <div class="smm-section-label">Preferences</div>
        <div class="smm-card">
            <div class="smm-card-item smm-chevron-item" onclick="openSettingsSection('general')">
                <div class="smm-item-icon"><i class="fa-solid fa-sliders"></i></div>
                <div class="smm-item-body"><div class="smm-item-title">General</div></div>
                <i class="fa-solid fa-chevron-right smm-chevron"></i>
            </div>
            <div class="smm-card-item smm-chevron-item" onclick="openSettingsSection('appearance')">
                <div class="smm-item-icon"><i class="fa-solid fa-palette"></i></div>
                <div class="smm-item-body"><div class="smm-item-title">Appearance</div></div>
                <i class="fa-solid fa-chevron-right smm-chevron"></i>
            </div>
            <div class="smm-card-item smm-chevron-item" onclick="openSettingsSection('ai')">
                <div class="smm-item-icon"><i class="fa-solid fa-robot"></i></div>
                <div class="smm-item-body"><div class="smm-item-title">AI & Response</div></div>
                <i class="fa-solid fa-chevron-right smm-chevron"></i>
            </div>
            <div class="smm-card-item smm-chevron-item" onclick="openSettingsSection('data')">
                <div class="smm-item-icon"><i class="fa-solid fa-database"></i></div>
                <div class="smm-item-body"><div class="smm-item-title">Data controls</div></div>
                <i class="fa-solid fa-chevron-right smm-chevron"></i>
            </div>
        </div>
        <div style="height:32px"></div>
    `;

    body.style.padding = '0 0 40px';
    menuEl.style.display = 'block';

    document.getElementById('avatarUploadMain')?.addEventListener('change', handleAvatarUpload);
}

function openSettingsSection(key) {
    const body = document.querySelector('.settings-modal-body');
    const menuEl = document.getElementById('settingsMobileMenu');
    if (menuEl) menuEl.style.display = 'none';

    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById('settings-' + key);
    if (sec) {
        sec.classList.add('active');
        body.style.padding = '16px 20px 40px';
    }

    const titleMap = { discord: 'Discord', general: 'General', account: 'Account', appearance: 'Appearance', personalization: 'Personalization', data: 'Data controls', ai: 'AI & Response' };
    const mobileTitle = document.getElementById('settingsMobileTitle');
    if (mobileTitle) mobileTitle.textContent = titleMap[key] || 'Settings';

    const backBtn = document.getElementById('settingsBackBtn');
    const closeBtn = document.getElementById('settingsModalClose');
    if (backBtn) backBtn.classList.remove('hidden');
    if (closeBtn) closeBtn.classList.add('hidden');

    if (backBtn) {
        backBtn.onclick = () => {
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            body.style.padding = '0';
            if (menuEl) menuEl.style.display = 'block';
            mobileTitle.textContent = 'Settings';
            backBtn.classList.add('hidden');
            closeBtn.classList.remove('hidden');
        };
    }

    if (key === 'data') renderUsageStats();
    if (key === 'ai') { applyVexaSettingsToUI(); populateDefaultModelSelect(); }
}

function initMobileSettingsGestures() {
    const settingsModal = document.getElementById('settingsModal');
    const settingsModalOverlay = document.getElementById('settingsModalOverlay');
    if (!settingsModal || !settingsModalOverlay) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let startTime = 0;
    let dragHandle = null;

    function ensureHandle() {
        if (dragHandle) return dragHandle;
        dragHandle = document.createElement('div');
        dragHandle.style.cssText = `
            position:absolute;top:0;left:0;right:0;height:48px;
            display:flex;align-items:center;justify-content:center;
            cursor:grab;flex-shrink:0;z-index:20;touch-action:none;
        `;
        const pill = document.createElement('div');
        pill.style.cssText = `
            width:36px;height:4px;border-radius:2px;
            background:var(--border-light);margin-top:10px;pointer-events:none;
        `;
        dragHandle.appendChild(pill);
        settingsModal.prepend(dragHandle);
        return dragHandle;
    }

    function isMobile() {
        return window.innerWidth <= 680 || window.innerHeight <= 909;
    }

    function onStart(clientY) {
        startY = clientY;
        currentY = clientY;
        startTime = Date.now();
        isDragging = true;
        settingsModal.style.transition = 'none';
    }

    function onMove(clientY) {
        if (!isDragging) return;
        currentY = clientY;
        const delta = currentY - startY;
        if (delta <= 0) return;
        settingsModal.style.transform = `translateY(${delta}px)`;
        const opacity = Math.max(0.6 - (delta / 400), 0.1);
        settingsModalOverlay.style.backgroundColor = `rgba(0,0,0,${opacity})`;
    }

    function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        const delta = currentY - startY;
        const velocity = delta / Math.max(Date.now() - startTime, 1);

        if (delta > 120 || velocity > 0.6) {
            settingsModal.style.transition = 'transform 0.38s cubic-bezier(0.32,0.72,0,1)';
            settingsModalOverlay.style.transition = 'background-color 0.38s ease';
            requestAnimationFrame(() => {
                settingsModal.style.transform = 'translateY(110%)';
                settingsModalOverlay.style.backgroundColor = 'rgba(0,0,0,0)';
            });
            setTimeout(() => {
                closeSettingsModal();
                settingsModal.style.transition = '';
                settingsModal.style.transform = '';
                settingsModalOverlay.style.transition = '';
                settingsModalOverlay.style.backgroundColor = '';
            }, 400);
        } else {
            settingsModal.style.transition = 'transform 0.32s cubic-bezier(0.32,0.72,0,1)';
            settingsModalOverlay.style.transition = 'background-color 0.32s ease';
            requestAnimationFrame(() => {
                settingsModal.style.transform = 'translateY(0)';
                settingsModalOverlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
            });
            setTimeout(() => {
                settingsModal.style.transition = '';
                settingsModal.style.transform = '';
                settingsModalOverlay.style.transition = '';
                settingsModalOverlay.style.backgroundColor = '';
            }, 320);
        }
    }

    settingsModal.addEventListener('touchstart', e => {
        if (!isMobile()) return;
        const handle = ensureHandle();
        const touch = e.touches[0];
        const target = e.target;
        const inHandle = handle.contains(target);
        const mobileHeader = settingsModal.querySelector('.settings-mobile-header');
        const inHeader = mobileHeader && mobileHeader.contains(target);
        if (!inHandle && !inHeader) return;
        onStart(touch.clientY);
    }, { passive: true });

    settingsModal.addEventListener('touchmove', e => {
        if (!isDragging) return;
        onMove(e.touches[0].clientY);
        e.preventDefault();
    }, { passive: false });

    settingsModal.addEventListener('touchend', () => onEnd(), { passive: true });
    settingsModal.addEventListener('touchcancel', () => onEnd(), { passive: true });
}