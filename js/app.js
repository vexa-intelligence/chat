let currentPage = 'chat';

function showPageRaw(name) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    const targetPage = document.getElementById(`page-${name}`);
    if (targetPage) {
        targetPage.classList.add('active');
        currentPage = name;
    }
}

function showPage(name) {
    const pathMap = { chat: '/', images: '/images', models: '/models' };
    const path = pathMap[name] || '/';
    window.history.pushState({}, '', path);
    showPageRaw(name);
}

function navigate(path, pushState = true) {

    if (pushState) {
        window.history.pushState({}, '', path);
    }

    if (path === '/' || path === '/new-chat') {
        showPageRaw('chat');
        if (path === '/new-chat' && pushState) {
            newChat();
        }
    } else if (path.startsWith('/chat/')) {
        const sessionId = path.replace('/chat/', '');
        const session = chatSessions.find(s => s.id === sessionId);
        if (session) {
            loadSessionIntoChat(session);
        } else {
            loadChatsFromFirebase().then(() => {
                const session = chatSessions.find(s => s.id === sessionId);
                if (session) {
                    loadSessionIntoChat(session);
                } else {
                    newChat();
                }
            });
        }
    } else if (path === '/images') {
        showPage('images');
    } else if (path === '/models') {
        showPage('models');
    } else {
        showPageRaw('chat');
    }
}

function toggleSidebar() {
    const isMobile = window.innerWidth <= 680;
    const isLandscapeMobile = window.innerHeight <= 600 && window.innerWidth > window.innerHeight;

    if (isMobile || isLandscapeMobile) {
        openMobileDrawer();
    } else {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        document.getElementById('topbarExpand')
            .classList.toggle('visible', sidebar.classList.contains('collapsed'));
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
            <button class="history-item-del" data-id="${escHtml(s.id)}">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        item.querySelector('.history-item-del').addEventListener('click', e => {
            e.stopPropagation();
            handleChatDelete(s.id);
        });

        item.addEventListener('click', e => {
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
    const avatarEl = document.getElementById('mobileUserAvatar');

    if (avatarEl) {
        avatarEl.innerHTML = savedAvatar
            ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : email.charAt(0).toUpperCase();
    }

    const nameEl = document.getElementById('mobileUserName');
    const planEl = document.getElementById('mobileUserPlan');

    if (nameEl) nameEl.textContent = email.split('@')[0];
    if (planEl) planEl.textContent = 'Free';
}

function openUserPopover() {
    if (!currentUser) {
        openAuthOverlay();
        return;
    }

    const email = currentUser.email || '';
    const savedAvatar = localStorage.getItem('user_avatar_' + currentUser.uid);
    const avatarEl = document.getElementById('popoverAvatar');

    if (avatarEl) {
        avatarEl.innerHTML = savedAvatar
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
    initToast();
    initMobileSwipeToDelete();

    loadModels();

    const el = document.querySelector('.feed-empty-title');
    if (el) {
        el.textContent = '...';
    }

    generateEmptyTitle().then(title => {
        const titleEl = document.querySelector('.feed-empty-title');
        if (titleEl && title) {
            titleEl.textContent = title;
        }
    });

    setTimeout(() => {
        const input = document.getElementById('inp');
        if (input && currentPage === 'chat') input.focus();
    }, 100);

    initGlobalFocusManagement();

    document.getElementById('sidebarCollapse').addEventListener('click', toggleSidebar);
    document.getElementById('topbarExpand').addEventListener('click', toggleSidebar);
    document.getElementById('newChatBtn').addEventListener('click', newChat);
    document.getElementById('navSearch').addEventListener('click', openSearchModal);

    document.getElementById('mobileDrawerClose').addEventListener('click', closeMobileDrawer);
    document.getElementById('mobileOverlay').addEventListener('click', closeMobileDrawer);
    document.getElementById('mdNewChat').addEventListener('click', () => {
        newChat();
        closeMobileDrawer();
    });
    document.getElementById('mdSearch').addEventListener('click', () => {
        closeMobileDrawer();
        openSearchModal();
    });
    document.getElementById('mdImages').addEventListener('click', () => {
        showPage('images');
        closeMobileDrawer();
    });
    document.getElementById('mobileLoginBtn').addEventListener('click', () => {
        openAuthOverlay();
    });

    document.getElementById('mobileUserBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        openUserPopover();
    });

    document.getElementById('userInfo')?.addEventListener('click', e => {
        e.stopPropagation();
        openUserPopover();
    });

    document.getElementById('userPopoverOverlay').addEventListener('click', e => {
        if (e.target.id === 'userPopoverOverlay') closeUserPopover();
    });

    document.getElementById('popoverSettings').addEventListener('click', () => {
        closeUserPopover();
        openSettingsModal();
    });

    document.getElementById('popoverLogout').addEventListener('click', () => {
        closeUserPopover();
        signOut();
    });

    const mobileSbtn = document.getElementById('mobileSbtn');
    const inp = document.getElementById('inp');

    if (mobileSbtn && inp) {
        inp.addEventListener('input', () => {
            mobileSbtn.disabled = !inp.value.trim() || busy;
        });
        mobileSbtn.addEventListener('click', doSend);
    }

    const voiceBtn = document.getElementById('voiceBtn');
    const mobileVoiceBtn = document.getElementById('mobileVoiceBtn');
    let recognition = null;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (inp) {
                inp.value += transcript;
                inp.dispatchEvent(new Event('input'));
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };

        recognition.onend = () => {
            if (voiceBtn) voiceBtn.innerHTML = '<i class="fa-solid fa-microphone" style="font-size:14px"></i>';
            if (mobileVoiceBtn) mobileVoiceBtn.innerHTML = '<i class="fa-solid fa-microphone" style="font-size:16px"></i>';
        };

        const startVoiceInput = () => {
            if (recognition) {
                recognition.start();
                if (voiceBtn) voiceBtn.innerHTML = '<i class="fa-solid fa-stop" style="font-size:14px"></i>';
                if (mobileVoiceBtn) mobileVoiceBtn.innerHTML = '<i class="fa-solid fa-stop" style="font-size:16px"></i>';
            }
        };

        if (voiceBtn) voiceBtn.addEventListener('click', startVoiceInput);
        if (mobileVoiceBtn) mobileVoiceBtn.addEventListener('click', startVoiceInput);
    } else {
        if (voiceBtn) voiceBtn.style.display = 'none';
        if (mobileVoiceBtn) mobileVoiceBtn.style.display = 'none';
    }

    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) {
        attachBtn.addEventListener('click', () => {
            toast.comingSoon("File attachments");
        });
    }

    const topbarExpand = document.getElementById('topbarExpand');

    if (window.innerWidth > 680) topbarExpand.classList.remove('visible');
    else topbarExpand.classList.add('visible');

    window.addEventListener('resize', () => {
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

function showInputOverlay() {
    const inputArea = document.querySelector('.input-area');
    const backdrop = document.getElementById('inputBackdrop');

    if (inputArea && backdrop) {
        inputArea.classList.add('visible');
        backdrop.classList.add('visible');
        document.getElementById('inp')?.focus();
    }
}

function hideInputOverlay() {
    const inputArea = document.querySelector('.input-area');
    const backdrop = document.getElementById('inputBackdrop');

    if (inputArea && backdrop) {
        inputArea.classList.remove('visible');
        backdrop.classList.remove('visible');
    }
}

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const backdrop = document.getElementById('inputBackdrop');

        if (backdrop?.classList.contains('visible')) hideInputOverlay();
        else showInputOverlay();
    }
});

document.addEventListener('click', e => {
    if (e.target.id === 'inputBackdrop') hideInputOverlay();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const backdrop = document.getElementById('inputBackdrop');
        if (backdrop?.classList.contains('visible')) hideInputOverlay();
    }

    const inp = document.getElementById('inp');
    if (inp && document.activeElement !== inp && currentPage === 'chat' &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        e.key.length === 1 && !e.target.matches('input, textarea, select, button, a')) {
        e.preventDefault();
        inp.focus();
    }
});

function initGlobalFocusManagement() {
    const inp = document.getElementById('inp');
    if (!inp) return;

    document.addEventListener('click', (e) => {
        if (currentPage === 'chat' &&
            !e.target.matches('input, textarea, select, button, a') &&
            !e.target.closest('input, textarea, select, button, a') &&
            document.activeElement !== inp) {
            setTimeout(() => inp.focus(), 0);
        }
    });

    const originalShowPageRaw = showPageRaw;
    showPageRaw = function (name) {
        originalShowPageRaw(name);
        if (name === 'chat') {
            setTimeout(() => {
                if (inp) inp.focus();
            }, 100);
        }
    };

    window.addEventListener('focus', () => {
        if (currentPage === 'chat' && inp) {
            setTimeout(() => inp.focus(), 100);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && currentPage === 'chat' && inp) {
            setTimeout(() => inp.focus(), 100);
        }
    });

    const originalDoSend = window.doSend;
    if (originalDoSend) {
        window.doSend = function () {
            originalDoSend.apply(this, arguments);
            setTimeout(() => {
                if (inp && currentPage === 'chat') inp.focus();
            }, 100);
        };
    }
}