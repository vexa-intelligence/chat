let currentPage = 'chat';

function filterLettersNumbers(t) {
    return String(t).replace(/[^a-zA-Z0-9\s]/g, '').trim();
}

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
        const isCollapsed = sidebar.classList.contains('collapsed');

        sidebar.classList.toggle('collapsed');

        const topbarExpand = document.getElementById('topbarExpand');
        const icon = topbarExpand.querySelector('i');

        if (isCollapsed) {
            icon.className = 'fa-solid fa-xmark';
        } else {
            icon.className = 'fa-solid fa-bars';
        }
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

function initMobileDrawerGestures() {
    const mobileDrawer = document.getElementById('mobileDrawer');
    const mobileOverlay = document.getElementById('mobileOverlay');
    if (!mobileDrawer || !mobileOverlay) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let startTime = 0;

    function isMobile() {
        return window.innerWidth <= 680 || window.innerHeight <= 909;
    }

    function onStart(clientY) {
        if (!isMobile()) return;
        startY = clientY;
        currentY = clientY;
        startTime = Date.now();
        isDragging = true;
        mobileDrawer.style.transition = 'none';
        mobileOverlay.style.transition = 'none';
    }

    function onMove(clientY) {
        if (!isDragging) return;
        currentY = clientY;
        const delta = currentY - startY;
        if (delta <= 0) return;

        mobileDrawer.style.transform = `translateY(${delta}px)`;
        const opacity = Math.max(0.6 - (delta / 400), 0.1);
        mobileOverlay.style.backgroundColor = `rgba(0,0,0,${opacity})`;
    }

    function onEnd() {
        if (!isDragging) return;
        isDragging = false;
        const delta = currentY - startY;
        const velocity = delta / Math.max(Date.now() - startTime, 1);

        if (delta > 120 || velocity > 0.6) {
            mobileDrawer.style.transition = 'transform 0.38s cubic-bezier(0.32,0.72,0,1)';
            mobileOverlay.style.transition = 'background-color 0.38s ease';
            requestAnimationFrame(() => {
                mobileDrawer.style.transform = 'translateY(100%)';
                mobileOverlay.style.backgroundColor = 'rgba(0,0,0,0)';
            });
            setTimeout(() => {
                closeMobileDrawer();
                mobileDrawer.style.transition = '';
                mobileDrawer.style.transform = '';
                mobileOverlay.style.transition = '';
                mobileOverlay.style.backgroundColor = '';
            }, 400);
        } else {
            mobileDrawer.style.transition = 'transform 0.32s cubic-bezier(0.32,0.72,0,1)';
            mobileOverlay.style.transition = 'background-color 0.32s ease';
            requestAnimationFrame(() => {
                mobileDrawer.style.transform = 'translateY(0)';
                mobileOverlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
            });
            setTimeout(() => {
                mobileDrawer.style.transition = '';
                mobileDrawer.style.transform = '';
                mobileOverlay.style.transition = '';
                mobileOverlay.style.backgroundColor = '';
            }, 320);
        }
    }

    mobileDrawer.addEventListener('touchstart', e => {
        if (!isMobile()) return;
        const touch = e.touches[0];
        const target = e.target;
        const drawerHead = mobileDrawer.querySelector('.mobile-drawer-head');
        const inHead = drawerHead && drawerHead.contains(target);
        if (!inHead) return;
        onStart(touch.clientY);
    }, { passive: true });

    mobileDrawer.addEventListener('touchmove', e => {
        if (!isDragging) return;
        onMove(e.touches[0].clientY);
        e.preventDefault();
    }, { passive: false });

    mobileDrawer.addEventListener('touchend', () => onEnd(), { passive: true });
    mobileDrawer.addEventListener('touchcancel', () => onEnd(), { passive: true });
}

function syncMobileHistory() {
    const container = document.getElementById('mobileHistoryList');
    if (!container) return;

    const historyItems = container.querySelectorAll('.history-item');
    historyItems.forEach(item => item.remove());

    chatSessions.slice(0, 50).forEach(s => {
        const item = document.createElement('div');
        item.className = 'history-item' + (s.id === currentSessionId ? ' active' : '');
        item.dataset.id = s.id;

        item.innerHTML = `
            <div class="history-item-content">${filterLettersNumbers(s.title)}</div>
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
    const avatarTop = document.getElementById('mobileUserAvatarTop');
    if (!avatarTop) return;

    if (!currentUser) {
        avatarTop.innerHTML = '<i class="fa-solid fa-user" style="font-size:14px"></i>';
        return;
    }

    const email = currentUser.email || '';
    const savedAvatar = localStorage.getItem('user_avatar_' + currentUser.uid);
    avatarTop.innerHTML = savedAvatar
        ? `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : email.charAt(0).toUpperCase();
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
    initMobileDrawerGestures();

    loadModels();

    const el = document.querySelector('.feed-empty-title');
    if (el) {
        el.textContent = '...';
        generateEmptyTitle(el);
    }

    let hasFocusedInitially = false;

    const focusInput = () => {
        const input = document.getElementById('inp');
        if (input && currentPage === 'chat' && !hasFocusedInitially) {
            const isMobile = window.innerWidth <= 680;
            const isLandscapeMobile = window.innerHeight <= 600 && window.innerWidth > window.innerHeight;
            if (isMobile || isLandscapeMobile) {
                return false;
            }
            input.focus();
            hasFocusedInitially = true;
            return true;
        }
        return false;
    };

    let focusAttempts = 0;
    const maxFocusAttempts = 10;

    const tryFocusInput = () => {
        if (focusAttempts >= maxFocusAttempts) return;
        if (focusInput()) return;
        focusAttempts++;
        setTimeout(tryFocusInput, 100);
    };

    tryFocusInput();

    window.addEventListener('load', () => {
        setTimeout(tryFocusInput, 200);
    });

    document.addEventListener('touchstart', () => {
        if (!focusInput()) {
            setTimeout(tryFocusInput, 50);
        }
    }, { once: true, passive: true });

    initGlobalFocusManagement();

    const topbarExpand = document.getElementById('topbarExpand');
    if (topbarExpand) topbarExpand.addEventListener('click', toggleSidebar);

    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) newChatBtn.addEventListener('click', newChat);

    const navSearch = document.getElementById('navSearch');
    if (navSearch) navSearch.addEventListener('click', openSearchModal);

    const mobileOverlay = document.getElementById('mobileOverlay');
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileDrawer);

    document.getElementById('mobileUserAvatarTop')?.addEventListener('click', e => {
        e.stopPropagation();
        if (!currentUser) { openAuthOverlay(); return; }
        openSettingsModal();
    });

    document.getElementById('mdSearchBtn')?.addEventListener('click', () => {
        closeMobileDrawer();
        openSearchModal();
    });

    const mobileDrawerVexa = document.querySelector('.mobile-drawer-head span');
    if (mobileDrawerVexa) {
        mobileDrawerVexa.addEventListener('click', closeMobileDrawer);
        mobileDrawerVexa.style.cursor = 'pointer';
    }

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

    const voiceBtn = document.getElementById('voiceBtn');
    let recognition = null;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        const inp = document.getElementById('inp');

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
        };

        const startVoiceInput = () => {
            if (recognition) {
                recognition.start();
                if (voiceBtn) voiceBtn.innerHTML = '<i class="fa-solid fa-stop" style="font-size:14px"></i>';
            }
        };

        const stopVoiceInput = () => {
            if (recognition) {
                recognition.stop();
                recognition.abort();
                if (voiceBtn) voiceBtn.innerHTML = '<i class="fa-solid fa-microphone" style="font-size:14px"></i>';
            }
        };

        const toggleVoiceInput = () => {
            if (voiceBtn && voiceBtn.innerHTML.includes('fa-stop')) {
                stopVoiceInput();
            } else {
                startVoiceInput();
            }
        };

        if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceInput);
    } else {
        if (voiceBtn) voiceBtn.style.display = 'none';
    }

    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) {
        attachBtn.addEventListener('click', () => {
        });
    }

    topbarExpand?.classList.add('visible');

    window.addEventListener('resize', () => {
        if (window.innerWidth > 680) {
            closeMobileDrawer();
        }
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const theme = localStorage.getItem('vexa_theme') || 'light';
        if (theme === 'system') applyTheme('system');
    });

    let themeSwitchTimeout = null;
    const debouncedApplyTheme = (theme) => {
        clearTimeout(themeSwitchTimeout);
        themeSwitchTimeout = setTimeout(() => {
            if (typeof applyTheme === 'function') {
                applyTheme(theme);
            }
        }, 50);
    };

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            const currentTheme = localStorage.getItem('vexa_theme') || 'light';
            const themes = ['light', 'dark', 'system'];
            const currentIndex = themes.indexOf(currentTheme);
            const nextTheme = themes[(currentIndex + 1) % themes.length];

            const themeSelect = document.getElementById('themeSelect');
            if (themeSelect) {
                themeSelect.value = nextTheme;
            }

            localStorage.setItem('vexa_theme', nextTheme);
            if (currentUser) {
                saveUserPrefToFirebase('theme', nextTheme);
            }
            debouncedApplyTheme(nextTheme);
        }
    });

    document.documentElement.classList.add('theme-initialized');
    setTimeout(() => {
        document.documentElement.classList.remove('theme-initialized');
    }, 500);

    if (typeof watchSystemThemeChanges === 'function') {
        watchSystemThemeChanges();
    }
});

(function () {
    function checkDrawerOpen() {
        var drawer = document.getElementById('mobileDrawer');
        var btn = document.getElementById('floatingChatBtn');
        if (!btn) return;
        if (drawer && drawer.classList.contains('open')) {
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    }
    var drawer = document.getElementById('mobileDrawer');
    if (drawer) {
        var obs = new MutationObserver(checkDrawerOpen);
        obs.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }
})();

function showInputOverlay() {
    const inputArea = document.querySelector('.input-area');
    const backdrop = document.getElementById('inputBackdrop');

    if (inputArea && backdrop) {
        inputArea.classList.add('visible');
        backdrop.classList.add('visible');

        const isMobile = window.innerWidth <= 680;
        const isLandscapeMobile = window.innerHeight <= 600 && window.innerWidth > window.innerHeight;
        if (!isMobile && !isLandscapeMobile) {
            document.getElementById('inp')?.focus();
        }
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
});

function initGlobalFocusManagement() {
    const inp = document.getElementById('inp');
    if (!inp) return;

    const isMobileDevice = () => {
        const isMobile = window.innerWidth <= 680;
        const isLandscapeMobile = window.innerHeight <= 600 && window.innerWidth > window.innerHeight;
        return isMobile || isLandscapeMobile;
    };

    let hasFocusedOnce = false;

    const focusOnce = () => {
        if (!hasFocusedOnce && !isMobileDevice() && inp && currentPage === 'chat') {
            inp.focus();
            hasFocusedOnce = true;
        }
    };

    const originalShowPageRaw = showPageRaw;
    showPageRaw = function (name) {
        originalShowPageRaw(name);
        if (name === 'chat') {
            focusOnce();
        }
    };

    const originalDoSend = window.doSend;
    if (originalDoSend) {
        window.doSend = function () {
            originalDoSend.apply(this, arguments);
        };
    }

    focusOnce();
}