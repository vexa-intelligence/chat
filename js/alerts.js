let currentAlertCallback = null;

function showCustomAlert(title, message, confirmText = 'Delete', cancelText = 'Cancel', isDangerous = true) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customAlertOverlay');
        const titleEl = document.getElementById('customAlertTitle');
        const messageEl = document.getElementById('customAlertMessage');
        const confirmBtn = document.getElementById('customAlertConfirm');
        const cancelBtn = document.getElementById('customAlertCancel');

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        if (isDangerous) {
            confirmBtn.className = 'custom-alert-confirm-btn';
        } else {
            confirmBtn.className = 'custom-alert-confirm-btn safe';
        }

        currentAlertCallback = resolve;

        overlay.classList.remove('hidden');

        if (isDangerous) {
            cancelBtn.focus();
        } else {
            confirmBtn.focus();
        }
    });
}

function closeCustomAlert(confirmed = false) {
    const overlay = document.getElementById('customAlertOverlay');
    overlay.classList.add('hidden');

    if (currentAlertCallback) {
        currentAlertCallback(confirmed);
        currentAlertCallback = null;
    }
}

function initCustomAlert() {
    const confirmBtn = document.getElementById('customAlertConfirm');
    const cancelBtn = document.getElementById('customAlertCancel');
    const overlay = document.getElementById('customAlertOverlay');

    confirmBtn.addEventListener('click', () => closeCustomAlert(true));
    cancelBtn.addEventListener('click', () => closeCustomAlert(false));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCustomAlert(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            closeCustomAlert(false);
        }
    });
}

function initMobileSwipeToDelete() {
    const mobileHistory = document.querySelector('.mobile-drawer-history');
    if (!mobileHistory) return;

    mobileHistory.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.history-item-delete');
        if (!deleteBtn) return;

        e.preventDefault();
        e.stopPropagation();

        const item = deleteBtn.closest('.history-item');
        const sessionId = item.dataset.id;

        if (sessionId) {
            handleChatDelete(sessionId);
        }
    });

    mobileHistory.addEventListener('click', (e) => {
        const item = e.target.closest('.history-item');
        if (!item || e.target.closest('.history-item-delete')) return;

        const sessionId = item.dataset.id;
        if (sessionId) {
            const session = chatSessions.find(s => s.id === sessionId);
            if (session) {
                loadSessionIntoChat(session);
                closeMobileDrawer();
            }
        }
    });
}

async function handleChatDelete(sessionId) {
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    const confirmed = await showCustomAlert(
        'Delete Chat',
        `Are you sure you want to delete "${session.title}"? This action cannot be undone.`,
        'Delete',
        'Cancel',
        true
    );

    if (confirmed) {
        chatSessions = chatSessions.filter(s => s.id !== sessionId);

        await deleteChatFromFirebase(sessionId);

        if (currentSessionId === sessionId) {
            newChat();
        }

        renderChatHistory();
    }
}

window.alert = function (message) {
    showCustomAlert('Alert', message, 'OK', '', false).then(() => { });
};

window.confirm = function (message) {
    return new Promise((resolve) => {
        showCustomAlert('Confirm', message, 'OK', 'Cancel', false).then(confirmed => {
            resolve(confirmed);
        });
    });
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showCustomAlert,
        closeCustomAlert,
        initCustomAlert,
        initMobileSwipeToDelete,
        handleChatDelete
    };
}
