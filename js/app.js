let currentPage = 'chat';

function showPage(name) {
    currentPage = name;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + name);
    if (page) page.classList.add('active');

    document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
    if (name === 'images') document.getElementById('navImages')?.classList.add('active');
    if (name === 'models') document.getElementById('navModels')?.classList.add('active');

    if (name === 'models') {
        if (!modelsLoaded) loadModels(); else renderModelsPage(currentModelType);
    }
    if (name === 'images') {
        if (typeof loadImagesFromFirebase === 'function') loadImagesFromFirebase();
    }
    if (name === 'chat') setTimeout(() => document.getElementById('inp')?.focus(), 50);
    closeMobileDrawer();
}

function toggleSidebar() {
    if (window.innerWidth <= 680) {
        openMobileDrawer();
    } else {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        document.getElementById('topbarExpand').classList.toggle('visible', sidebar.classList.contains('collapsed'));
    }
}

function openMobileDrawer() {
    document.getElementById('mobileDrawer').classList.add('open');
    document.getElementById('mobileOverlay').classList.add('visible');
    syncMobileHistory();
    syncMobileUser();
}

function closeMobileDrawer() {
    document.getElementById('mobileDrawer')?.classList.remove('open');
    document.getElementById('mobileOverlay')?.classList.remove('visible');
}

function syncMobileHistory() {
    const container = document.getElementById('mobileHistoryList');
    if (!container) return;
    container.innerHTML = '';
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

        container.appendChild(item);
    });
}

function syncMobileUser() {
    if (!currentUser) {
        document.getElementById('mobileUserRow')?.classList.add('hidden');
        document.getElementById('mobileLoginRow')?.classList.remove('hidden');
        return;
    }
    document.getElementById('mobileUserRow')?.classList.remove('hidden');
    document.getElementById('mobileLoginRow')?.classList.add('hidden');
    const email = currentUser.email || '';
    const savedAvatar = localStorage.getItem('user_avatar_' + currentUser.uid);
    const mobileAvatarEl = document.getElementById('mobileUserAvatar');
    if (mobileAvatarEl) {
        mobileAvatarEl.innerHTML = savedAvatar
            ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : email.charAt(0).toUpperCase();
    }
    if (document.getElementById('mobileUserName')) document.getElementById('mobileUserName').textContent = email.split('@')[0];
    if (document.getElementById('mobileUserPlan')) document.getElementById('mobileUserPlan').textContent = 'Free';
}

function openUserPopover() {
    if (!currentUser) { openAuthOverlay(); return; }
    const email = currentUser.email || '';
    const savedAvatar = localStorage.getItem('user_avatar_' + currentUser.uid);
    const popoverAvatarEl = document.getElementById('popoverAvatar');
    if (popoverAvatarEl) {
        popoverAvatarEl.innerHTML = savedAvatar
            ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : email.charAt(0).toUpperCase();
    }
    document.getElementById('popoverName').textContent = email.split('@')[0];
    document.getElementById('popoverPlan').textContent = 'Free plan';
    document.getElementById('userPopoverOverlay').classList.add('visible');
}

function closeUserPopover() {
    document.getElementById('userPopoverOverlay').classList.remove('visible');
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initChat();
    initImages();
    initModels();
    initSettings();
    initCustomAlert();
    initMobileSwipeToDelete();
    loadModels();
    generateEmptyTitle().then(title => {
        const titleEl = document.querySelector('.feed-empty-title');
        if (titleEl && title) titleEl.textContent = title;
    });

    document.getElementById('sidebarCollapse').addEventListener('click', toggleSidebar);
    document.getElementById('topbarExpand').addEventListener('click', toggleSidebar);
    document.getElementById('newChatBtn').addEventListener('click', newChat);
    document.getElementById('navSearch').addEventListener('click', openSearchModal);

    document.getElementById('mobileDrawerClose').addEventListener('click', closeMobileDrawer);
    document.getElementById('mobileOverlay').addEventListener('click', closeMobileDrawer);
    document.getElementById('mdNewChat').addEventListener('click', () => { newChat(); closeMobileDrawer(); });
    document.getElementById('mdSearch').addEventListener('click', () => { closeMobileDrawer(); openSearchModal(); });
    document.getElementById('mdImages').addEventListener('click', () => showPage('images'));
    document.getElementById('mdModels').addEventListener('click', () => showPage('models'));
    document.getElementById('mobileLoginBtn').addEventListener('click', () => { closeMobileDrawer(); openAuthOverlay(); });

    document.getElementById('mobileUserBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        closeMobileDrawer();
        openUserPopover();
    });

    document.getElementById('userPopoverOverlay').addEventListener('click', e => {
        if (e.target === document.getElementById('userPopoverOverlay')) closeUserPopover();
    });
    document.getElementById('popoverSettings').addEventListener('click', () => { closeUserPopover(); openSettingsModal(); });
    document.getElementById('popoverLogout').addEventListener('click', () => { closeUserPopover(); signOut(); });

    const mobileSbtn = document.getElementById('mobileSbtn');
    if (mobileSbtn) {
        const inp = document.getElementById('inp');
        inp?.addEventListener('input', () => {
            if (mobileSbtn) mobileSbtn.disabled = !inp.value.trim() || busy;
        });
        mobileSbtn.addEventListener('click', doSend);
    }

    if (window.innerWidth > 680) {
        document.getElementById('topbarExpand').classList.remove('visible');
    } else {
        document.getElementById('topbarExpand').classList.add('visible');
    }

    window.addEventListener('resize', () => {
        const topbarExpand = document.getElementById('topbarExpand');
        if (window.innerWidth <= 680) {
            topbarExpand.classList.add('visible');
        } else {
            topbarExpand.classList.remove('visible');
            closeMobileDrawer();
        }
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const theme = localStorage.getItem('vexa_theme') || 'light';
        if (theme === 'system') applyTheme('system');
    });
});