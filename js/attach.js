let attachDropdownOpen = false;
let thinkingModeEnabled = false;
let deepResearchEnabled = false;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 10 * 1024 * 1024;

function getAttachIcon() {
    if (thinkingModeEnabled) return '<i class="fa-solid fa-lightbulb" style="font-size:15px;"></i>';
    if (deepResearchEnabled) return '<i class="fa-solid fa-flask" style="font-size:15px;"></i>';
    if (window.uploadedImages && window.uploadedImages.length > 0) return '<i class="fa-solid fa-image" style="font-size:15px;"></i>';
    if (isSearchMode && isSearchMode()) return '<i class="fa-solid fa-compass" style="font-size:15px;"></i>';
    return '<i class="fa-solid fa-plus" style="font-size:15px"></i>';
}

function updateAttachBtnIcon() {
    const btn = document.getElementById('attachBtn');
    if (!btn) return;
    btn.innerHTML = getAttachIcon();
}

function isThinkingMode() { return thinkingModeEnabled; }
function isDeepResearch() { return deepResearchEnabled; }

function toggleThinkingMode() {
    thinkingModeEnabled = !thinkingModeEnabled;
    if (thinkingModeEnabled) deepResearchEnabled = false;
    updateAttachBtnIcon();
    updateDropdownActiveStates();
}

function toggleDeepResearch() {
    deepResearchEnabled = !deepResearchEnabled;
    if (deepResearchEnabled) thinkingModeEnabled = false;
    updateAttachBtnIcon();
    updateDropdownActiveStates();
}

function updateDropdownActiveStates() {
    const thinkingItem = document.querySelector('[data-action="thinking"]');
    const researchItem = document.querySelector('[data-action="research"]');
    const searchItem = document.querySelector('[data-action="search"]');

    if (thinkingItem) thinkingItem.classList.toggle('active-mode', thinkingModeEnabled);
    if (researchItem) researchItem.classList.toggle('active-mode', deepResearchEnabled);
    if (searchItem && isSearchMode) searchItem.classList.toggle('active-mode', isSearchMode());
}

function toggleAttachDropdown() {
    const dropdown = document.getElementById('attachDropdown');
    const attachBtn = document.getElementById('attachBtn');
    if (!dropdown || !attachBtn) return;

    attachDropdownOpen = !attachDropdownOpen;

    if (attachDropdownOpen) {
        updateDropdownActiveStates();
        dropdown.classList.add('show');
        attachBtn.classList.add('active');
        setTimeout(() => {
            document.addEventListener('click', closeAttachDropdownOutside);
        }, 100);
    } else {
        dropdown.classList.remove('show');
        attachBtn.classList.remove('active');
        document.removeEventListener('click', closeAttachDropdownOutside);
    }
}

function closeAttachDropdownOutside(event) {
    const container = document.querySelector('.attach-dropdown-container');
    const dropdown = document.getElementById('attachDropdown');

    if (container && container.contains(event.target)) {
        return;
    }

    if (dropdown && dropdown.contains(event.target)) {
        return;
    }

    closeAttachDropdown();
}

function closeAttachDropdown() {
    const dropdown = document.getElementById('attachDropdown');
    const attachBtn = document.getElementById('attachBtn');
    if (dropdown && attachBtn) {
        dropdown.classList.remove('show');
        attachBtn.classList.remove('active');
        attachDropdownOpen = false;
        document.removeEventListener('click', closeAttachDropdownOutside);
    }
}

function triggerImageUpload() {
    toast.comingSoon('Image upload');
}

function triggerCameraCapture() {
    toast.comingSoon('Camera capture');
}

function toggleWebSearch() {
    if (typeof toggleSearchMode === 'function') toggleSearchMode();
    updateAttachBtnIcon();
    updateDropdownActiveStates();
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
        alert('Please select a valid image file (JPEG, PNG, WEBP, or GIF)');
        event.target.value = '';
        return;
    }

    if (file.size > MAX_BYTES) {
        alert('Image is too large. Maximum size is 10 MB');
        event.target.value = '';
        return;
    }

    try {
        const reader = new FileReader();
        reader.onload = async function (e) {
            const dataUrl = e.target.result;
            addImageToInput(dataUrl);
            updateAttachBtnIcon();
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Error processing image:', error);
        alert('Failed to process image. Please try again.');
    }

    event.target.value = '';
}

function addImageToInput(imageUrl) {
    const inp = document.getElementById('inp');
    if (!inp) return;

    const imagePreview = document.createElement('div');
    imagePreview.className = 'input-image-preview';
    imagePreview.innerHTML = `
        <img src="${imageUrl}" alt="Uploaded image">
        <button type="button" class="img-preview-remove" onclick="removeInputImage(this, '${imageUrl}')">
            <i class="fa-solid fa-xmark" style="font-size:10px"></i>
        </button>
    `;

    const imagesRow = document.getElementById('inputImagesRow') || createImagesRow();
    imagesRow.appendChild(imagePreview);

    if (!window.uploadedImages) window.uploadedImages = [];
    window.uploadedImages.push(imageUrl);

    inp.placeholder = 'Ask about the image...';
    updateAttachBtnIcon();
}

function removeInputImage(btn, imageUrl) {
    btn.parentElement.remove();
    if (window.uploadedImages) {
        window.uploadedImages = window.uploadedImages.filter(u => u !== imageUrl);
    }
    const imagesRow = document.getElementById('inputImagesRow');
    if (imagesRow && !imagesRow.children.length) imagesRow.remove();

    const inp = document.getElementById('inp');
    if (inp && (!window.uploadedImages || !window.uploadedImages.length)) {
        inp.placeholder = 'Ask anything';
    }
    updateAttachBtnIcon();
}

function createImagesRow() {
    const inputBox = document.getElementById('chatInputBox');
    const existing = document.getElementById('inputImagesRow');
    if (existing) return existing;

    const row = document.createElement('div');
    row.id = 'inputImagesRow';
    row.className = 'input-images-row';
    inputBox.insertBefore(row, inputBox.firstChild);
    return row;
}

function injectAttachButton() {
    const attachBtn = document.getElementById('attachBtn');
    if (!attachBtn) return;

    attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAttachDropdown();
    });

    const dropdown = document.getElementById('attachDropdown');
    if (dropdown) {
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    const imageUploadInput = document.getElementById('imageUploadInput');
    const cameraInput = document.getElementById('cameraInput');
    if (imageUploadInput) imageUploadInput.disabled = true;
    if (cameraInput) cameraInput.disabled = true;
}

document.addEventListener('DOMContentLoaded', () => {
    injectAttachButton();

    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        .input-images-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 10px 14px 0;
        }

        .input-image-preview {
            position: relative;
            width: 72px;
            height: 72px;
            border-radius: 10px;
            overflow: visible;
            flex-shrink: 0;
        }

        .input-image-preview img {
            width: 72px;
            height: 72px;
            object-fit: cover;
            border-radius: 10px;
            border: 1.5px solid var(--border);
            display: block;
        }

        .img-preview-remove {
            position: absolute;
            top: -6px;
            right: -6px;
            width: 18px;
            height: 18px;
            background: var(--fg);
            color: var(--bg);
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.15s;
            z-index: 2;
        }

        .img-preview-remove:hover { transform: scale(1.15); }

        .attach-dropdown-item.active-mode {
            background: color-mix(in srgb, var(--accent) 10%, transparent);
        }

        .attach-dropdown-item.active-mode .main-text {
            color: var(--accent);
        }

        .attach-dropdown-item .mode-check {
            margin-left: auto;
            font-size: 11px;
            color: var(--accent);
            display: none;
        }

        .attach-dropdown-item.active-mode .mode-check {
            display: block;
        }
    `;
    document.head.appendChild(styleSheet);
});