function initSettings() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            tab.classList.add('active');
            const sec = document.getElementById('settings-' + tab.dataset.section);
            if (sec) sec.classList.add('active');
        });
    });

    document.getElementById('themeSelect')?.addEventListener('change', e => {
        const theme = e.target.value;
        applyTheme(theme);
        localStorage.setItem('vexa_theme', theme);
        saveUserPrefToFirebase('theme', theme);
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

    const savedTheme = localStorage.getItem('vexa_theme') || 'light';
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = savedTheme;
    applyTheme(savedTheme);

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
}

function openSettingsModal() {
    updateSettingsAccountUI(!!currentUser);
    document.getElementById('settingsModalOverlay')?.classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModalOverlay')?.classList.add('hidden');
}

function updateSettingsAccountUI(loggedIn) {
    const el = document.getElementById('accountContent');
    if (!el) return;
    if (loggedIn && currentUser) {
        const email = currentUser.email || '';
        const savedAvatar = localStorage.getItem('user_avatar_' + currentUser.uid);
        const avatarHtml = savedAvatar
            ? `<img src="${savedAvatar}" class="account-avatar-img" />`
            : `<div class="account-avatar">${email.charAt(0).toUpperCase()}</div>`;
        el.innerHTML = `
            <div class="account-logged">
                <div class="account-logged-info">
                    ${avatarHtml}
                    <div>
                        <div class="account-name">${escHtml(email.split('@')[0])}</div>
                        <div class="account-email">${escHtml(email)}</div>
                    </div>
                </div>
                <button class="account-logout-btn" id="logoutBtn">Log out</button>
            </div>
            <input type="file" id="avatarUpload" accept="image/*" class="avatar-upload-input" style="display:none;">`;
        document.getElementById('logoutBtn').addEventListener('click', signOut);
        document.getElementById('avatarUpload').addEventListener('change', handleAvatarUpload);
        const avatarImg = document.querySelector('.account-avatar-img');
        if (avatarImg) {
            avatarImg.addEventListener('click', () => {
                document.getElementById('avatarUpload').click();
            });
        }
    } else {
        el.innerHTML = `
            <div class="account-not-logged">
                <p>You are not logged in.</p>
                <button class="auth-submit" id="settingsLoginBtn" style="margin-top:12px;width:auto;padding:10px 24px">Log in</button>
            </div>`;
        document.getElementById('settingsLoginBtn').addEventListener('click', openAuthOverlay);
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