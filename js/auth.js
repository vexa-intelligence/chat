
let auth = null;
let db = null;
let storage = null;
let currentUser = null;
window.firebaseDB = null;
window.firebaseStorage = null;

function initFirebase() {
    if (!CONFIG.FIREBASE_CONFIG.apiKey) return;

    if (!firebase.apps.length) {
        firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
    }

    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();

    window.firebaseDB = db;
    window.firebaseStorage = storage;

    db.settings({
        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
        merge: true
    });
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        updateAuthUI();
        if (user) {
            closeAuthOverlay();
            await loadUserPrefsFromFirebase();
            await loadChatsFromFirebase();

            navigate(window.location.pathname, false);

            if (typeof _pendingChatId !== 'undefined' && _pendingChatId) {
                const s = chatSessions.find(s => s.id === _pendingChatId);
                if (s) { loadSessionIntoChat(s); }
                _pendingChatId = null;
            }
            if (typeof loadImagesFromFirebase === 'function') await loadImagesFromFirebase();
        } else {
            chatSessions = [];
            currentSessionId = null;
            renderChatHistory();
            newChat();
        }
    });
}

async function loadUserPrefsFromFirebase() {
    if (!db || !currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (!doc.exists) return;
        const data = doc.data();
        if (data.theme) {
            applyTheme(data.theme);
            localStorage.setItem('vexa_theme', data.theme);
            const sel = document.getElementById('themeSelect');
            if (sel) sel.value = data.theme;
        }
        if (data.fontSize) {
            document.documentElement.style.fontSize = data.fontSize + 'px';
            localStorage.setItem('vexa_fontsize', data.fontSize);
            const sel = document.getElementById('fontSizeSelect');
            if (sel) sel.value = data.fontSize;
        }
        if (data.model && data.modelLabel) {
            currentModel = data.model;
            currentModelLabel = data.modelLabel;
            const lbl = document.getElementById('modelSelectLabel');
            if (lbl) lbl.textContent = data.modelLabel;
            const ttl = document.getElementById('topbarTitle')?.querySelector('span');
            if (ttl) ttl.textContent = data.modelLabel;
            document.querySelectorAll('.model-picker-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.val === data.model);
            });
        }
        if (data.avatar) {
            localStorage.setItem('user_avatar_' + currentUser.uid, data.avatar);
            updateAllAvatars(data.avatar);
        }
    } catch { }
}

async function saveUserPrefToFirebase(key, value) {
    if (!db || !currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).set(
            { [key]: value, updated_at: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
    } catch { }
}

function updateAuthUI() {
    const userInfo = document.getElementById('userInfo');
    const authPrompt = document.getElementById('authPrompt');
    const topbarLoginBtn = document.getElementById('topbarLoginBtn');
    if (currentUser) {
        userInfo?.classList.remove('hidden');
        authPrompt?.classList.add('hidden');
        topbarLoginBtn?.classList.add('hidden');
        const email = currentUser.email || '';
        const savedAvatar = localStorage.getItem('user_avatar_' + currentUser.uid);
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl) {
            avatarEl.innerHTML = savedAvatar
                ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : email.charAt(0).toUpperCase();
        }
        const mobileAvatarEl = document.getElementById('mobileUserAvatar');
        if (mobileAvatarEl) {
            mobileAvatarEl.innerHTML = savedAvatar
                ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : email.charAt(0).toUpperCase();
        }
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = email.split('@')[0];
        const userPlanEl = document.getElementById('userPlan');
        if (userPlanEl) userPlanEl.textContent = 'Free plan';
        updateSettingsAccountUI(true);
    } else {
        userInfo?.classList.add('hidden');
        authPrompt?.classList.remove('hidden');
        topbarLoginBtn?.classList.remove('hidden');
        updateSettingsAccountUI(false);
    }
}

function openAuthOverlay() {
    document.getElementById('auth-overlay')?.classList.remove('hidden');
    document.getElementById('authEmail')?.focus();
}

function closeAuthOverlay() {
    document.getElementById('auth-overlay')?.classList.add('hidden');
    const errEl = document.getElementById('authError');
    if (errEl) errEl.textContent = '';
}

let authMode = 'login';

function initAuth() {
    initFirebase();
    document.getElementById('authClose')?.addEventListener('click', closeAuthOverlay);
    document.getElementById('auth-overlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('auth-overlay')) closeAuthOverlay();
    });
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            authMode = tab.dataset.tab;
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('authSubmit').textContent = authMode === 'login' ? 'Continue' : 'Create account';
            document.getElementById('authError').textContent = '';
        });
    });
    document.getElementById('authForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!auth) { document.getElementById('authError').textContent = 'Auth not configured.'; return; }
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        const btn = document.getElementById('authSubmit');
        btn.textContent = 'Loading…';
        btn.disabled = true;
        document.getElementById('authError').textContent = '';
        try {
            if (authMode === 'login') {
                await auth.signInWithEmailAndPassword(email, password);
            } else {
                const cred = await auth.createUserWithEmailAndPassword(email, password);
                const theme = localStorage.getItem('vexa_theme') || 'light';
                const fontSize = localStorage.getItem('vexa_fontsize') || '15';
                await db.collection('users').doc(cred.user.uid).set({
                    email,
                    theme,
                    fontSize,
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    plan: 'free'
                });
            }
        } catch (err) {
            document.getElementById('authError').textContent = err.message || 'Something went wrong.';
        }
        btn.textContent = authMode === 'login' ? 'Continue' : 'Create account';
        btn.disabled = false;
    });
    document.getElementById('sidebarLoginBtn')?.addEventListener('click', openAuthOverlay);
    document.getElementById('topbarLoginBtn')?.addEventListener('click', openAuthOverlay);
}

async function signOut() {
    if (auth) await auth.signOut();
    currentUser = null;
    updateAuthUI();
    chatSessions = [];
    currentSessionId = null;
    renderChatHistory();
    newChat();
}