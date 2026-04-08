class ToastManager {
    constructor() {
        this.container = document.getElementById('toastContainer');
        this.toasts = new Map();
        this.toastId = 0;
    }

    show(message, options = {}) {
        const {
            title = '',
            duration = 4000,
            closable = true
        } = options;

        const id = ++this.toastId;
        const toast = this.createToast(id, message, title, closable);

        this.container.appendChild(toast);
        this.toasts.set(id, toast);

        if (duration > 0) {
            setTimeout(() => this.remove(id), duration);
        }

        return id;
    }

    createToast(id, message, title, closable) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.dataset.toastId = id;

        const content = document.createElement('div');
        content.className = 'toast-content';

        if (title) {
            const titleElement = document.createElement('div');
            titleElement.className = 'toast-title';
            titleElement.textContent = title;
            content.appendChild(titleElement);
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'toast-message';
        messageElement.textContent = message;
        content.appendChild(messageElement);

        toast.appendChild(content);

        if (closable) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.innerHTML = '<i class="fa-solid fa-xmark" style="font-size:12px"></i>';
            closeBtn.addEventListener('click', () => this.remove(id));
            toast.appendChild(closeBtn);
        }

        return toast;
    }

    remove(id) {
        const toast = this.toasts.get(id);
        if (!toast) return;

        toast.classList.add('removing');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.toasts.delete(id);
        }, 300);
    }

    info(message, options = {}) {
        return this.show(message, { ...options, type: 'info' });
    }

    success(message, options = {}) {
        return this.show(message, { ...options, type: 'success' });
    }

    warning(message, options = {}) {
        return this.show(message, { ...options, type: 'warning' });
    }

    error(message, options = {}) {
        return this.show(message, { ...options, type: 'error' });
    }

    comingSoon(feature) {
        return this.info(`${feature} is coming soon!`, {
            title: 'Coming Soon',
            duration: 3000,
            icon: '<i class="fa-solid fa-rocket" style="font-size:12px"></i>'
        });
    }

    clear() {
        this.toasts.forEach((toast, id) => this.remove(id));
    }
}

const toast = new ToastManager();

function initToast() {

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { toast, initToast };
}
