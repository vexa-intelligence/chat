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
        if (confirm('Clear all chat history?')) {
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
            <div class="avatar-upload-container">
                <label class="avatar-upload-label">Profile Picture</label>
                <input type="file" id="avatarUpload" accept="image/*" class="avatar-upload-input">
                <div class="avatar-change-hint">Choose a new profile picture (JPG, PNG, GIF)</div>
            </div>`;
        document.getElementById('logoutBtn').addEventListener('click', signOut);
        document.getElementById('avatarUpload').addEventListener('change', handleAvatarUpload);
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

        const uploadInput = document.getElementById('avatarUpload');
        const hint = document.querySelector('.avatar-change-hint');
        if (hint) {
            hint.textContent = 'Profile picture updated successfully!';
            hint.style.color = '#10b981';
            setTimeout(() => {
                hint.textContent = 'Choose a new profile picture (JPG, PNG, GIF)';
                hint.style.color = '';
            }, 3000);
        }

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

        const hint = document.querySelector('.avatar-change-hint');
        if (hint) {
            hint.textContent = 'Upload failed, saved locally';
            hint.style.color = '#ef4444';
            setTimeout(() => {
                hint.textContent = 'Choose a new profile picture (JPG, PNG, GIF)';
                hint.style.color = '';
            }, 3000);
        }
    }
}

function updateAllAvatars(avatarUrl) {
    document.querySelectorAll('#userAvatar, #mobileUserAvatar, #popoverAvatar').forEach(el => {
        el.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    });
}

function applyTheme(theme) {
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}