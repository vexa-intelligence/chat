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

function syncMobileHistory() {
    const container = document.getElementById('mobileHistoryList');
    if (!container) return;

    container.innerHTML = '';

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

    const focusInput = () => {
        const input = document.getElementById('inp');
        if (input && currentPage === 'chat') {
            input.focus();
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
        openUserPopover();
    });

    document.getElementById('mdSearchBtn')?.addEventListener('click', () => {
        closeMobileDrawer();
        openSearchModal();
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

        if (voiceBtn) voiceBtn.addEventListener('click', startVoiceInput);
    } else {
        if (voiceBtn) voiceBtn.style.display = 'none';
    }

    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) {
        attachBtn.addEventListener('click', () => {
            toast.comingSoon("File attachments");
        });
    }

    topbarExpand?.classList.add('visible');

    const scrollBtn = document.getElementById('scrollToBottomBtn');
    let touchStartY = 0;
    let touchStartX = 0;

    function updateScrollButton() {
        const feed = document.getElementById('feed');
        if (!feed || !scrollBtn) return;

        const isScrolledUp = feed.scrollTop < feed.scrollHeight - feed.clientHeight - 100;
        scrollBtn.classList.toggle('visible', isScrolledUp);
    }

    const feed = document.getElementById('feed');
    if (feed) {
        feed.addEventListener('scroll', updateScrollButton);
    }

    if (scrollBtn) {
        scrollBtn.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        scrollBtn.addEventListener('touchmove', (e) => {
            const touchY = e.touches[0].clientY;
            const touchX = e.touches[0].clientX;
            const deltaY = touchY - touchStartY;
            const deltaX = touchX - touchStartX;

            if (deltaY > 50 && Math.abs(deltaX) < Math.abs(deltaY)) {
                scrollBtn.classList.add('swiping-down');
            }
        }, { passive: true });

        scrollBtn.addEventListener('touchend', (e) => {
            const touchY = e.changedTouches[0].clientY;
            const deltaY = touchY - touchStartY;

            if (deltaY > 80) {
                scrollBtn.classList.remove('visible');
                setTimeout(() => {
                    scrollBtn.classList.remove('swiping-down');
                }, 300);
            } else {
                scrollBtn.classList.remove('swiping-down');
            }
        });

        scrollBtn.addEventListener('click', () => {
            const feed = document.getElementById('feed');
            if (feed) {
                feed.scrollTo({
                    top: feed.scrollHeight,
                    behavior: 'smooth'
                });
            }
        });
    }

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