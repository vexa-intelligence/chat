let attachDropdownOpen = false;
let thinkingModeEnabled = false;
let deepResearchEnabled = false;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_DOC_TYPES = new Set([
    'text/plain', 'text/markdown', 'text/csv', 'text/html',
    'application/json', 'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DOC_BYTES = 2 * 1024 * 1024;

window.uploadedDocs = window.uploadedDocs || [];

function getAttachIcon() {
    if (thinkingModeEnabled) return '<i class="fa-solid fa-lightbulb" style="font-size:15px;"></i>';
    if (deepResearchEnabled) return '<i class="fa-solid fa-flask" style="font-size:15px;"></i>';
    if (window.uploadedImages && window.uploadedImages.length > 0) return '<i class="fa-solid fa-image" style="font-size:15px;"></i>';
    if (window.uploadedDocs && window.uploadedDocs.length > 0) return '<i class="fa-solid fa-file-lines" style="font-size:15px;"></i>';
    if (isSearchMode && isSearchMode()) return '<i class="fa-solid fa-compass" style="font-size:15px;"></i>';
    return '<i class="fa-solid fa-plus" style="font-size:15px"></i>';
}

function updateAttachBtnIcon() {
    const btn = document.getElementById('attachBtn');
    if (!btn) return;
    btn.innerHTML = getAttachIcon();
}

function updateFeedEmptyTitlePosition() {
    const titleEl = document.querySelector('.feed-empty-title');
    if (!titleEl) return;

    const hasImages = window.uploadedImages && window.uploadedImages.length > 0;
    const hasDocs = window.uploadedDocs && window.uploadedDocs.length > 0;

    if (hasImages || hasDocs) {
        titleEl.classList.add('files-uploaded');
    } else {
        titleEl.classList.remove('files-uploaded');
    }
}

function isThinkingMode() { return thinkingModeEnabled; }
function isDeepResearch() { return deepResearchEnabled; }

function toggleThinkingMode() {
    thinkingModeEnabled = !thinkingModeEnabled;
    if (thinkingModeEnabled) deepResearchEnabled = false;
    setVexaSetting('thinkingMode', thinkingModeEnabled);
    setVexaSetting('deepResearch', false);
    updateAttachBtnIcon();
    updateDropdownActiveStates();
}

function toggleDeepResearch() {
    deepResearchEnabled = !deepResearchEnabled;
    if (deepResearchEnabled) thinkingModeEnabled = false;
    setVexaSetting('deepResearch', deepResearchEnabled);
    setVexaSetting('thinkingMode', false);
    updateAttachBtnIcon();
    updateDropdownActiveStates();
}

function toggleWebSearch() {
    if (typeof toggleSearchMode === 'function') toggleSearchMode();
    if (typeof isSearchMode === 'function') {
        const newState = isSearchMode();
        setVexaSetting('searchMode', newState);
    }
    updateAttachBtnIcon();
    updateDropdownActiveStates();
}

function updateDropdownActiveStates() {
    const thinkingItem = document.querySelector('#attachDropdown [data-action="thinking"]');
    const researchItem = document.querySelector('#attachDropdown [data-action="research"]');
    const searchItem = document.querySelector('#attachDropdown [data-action="search"]');

    const thinkingItemMobile = document.querySelector('#attachDropdownMobile [data-action="thinking"]');
    const researchItemMobile = document.querySelector('#attachDropdownMobile [data-action="research"]');
    const searchItemMobile = document.querySelector('#attachDropdownMobile [data-action="search"]');

    if (thinkingItem) thinkingItem.classList.toggle('active-mode', thinkingModeEnabled);
    if (researchItem) researchItem.classList.toggle('active-mode', deepResearchEnabled);
    if (searchItem && isSearchMode) searchItem.classList.toggle('active-mode', isSearchMode());

    if (thinkingItemMobile) thinkingItemMobile.classList.toggle('active-mode', thinkingModeEnabled);
    if (researchItemMobile) researchItemMobile.classList.toggle('active-mode', deepResearchEnabled);
    if (searchItemMobile && isSearchMode) searchItemMobile.classList.toggle('active-mode', isSearchMode());
}

function populateMobilePhotoStrip() {
    if (window.innerWidth > 680) return;
    const row = document.getElementById('attachPhotoRow');
    if (!row) return;
    const existing = row.querySelectorAll('.attach-photo-thumb');
    existing.forEach(el => el.remove());

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', handleImageUpload);
    document.body.appendChild(input);

    for (let i = 0; i < 3; i++) {
        const thumb = document.createElement('div');
        thumb.className = 'attach-photo-thumb';
        thumb.style.cssText = 'background:#2c2c2e;display:flex;align-items:center;justify-content:center;cursor:pointer;';
        thumb.addEventListener('click', () => { closeAttachDropdown(); input.click(); });
        row.appendChild(thumb);
    }
}

function updateModeLabels() {
    const activeMode = thinkingModeEnabled ? 'thinking' : deepResearchEnabled ? 'research' : (isSearchMode && isSearchMode()) ? 'search' : null;
    const statusEl = document.getElementById('attachModeStatus');
    const statusElMobile = document.getElementById('attachModeStatusMobile');
    const labels = { thinking: 'Thinking on', research: 'Deep Research on', search: 'Web Search on' };

    if (activeMode) {
        if (statusEl) {
            statusEl.textContent = labels[activeMode];
            statusEl.style.display = 'block';
        }
        if (statusElMobile) {
            statusElMobile.textContent = labels[activeMode];
            statusElMobile.style.display = 'block';
        }
    } else {
        if (statusEl) statusEl.style.display = 'none';
        if (statusElMobile) statusElMobile.style.display = 'none';
    }
}

function injectAttachButton() {
    const attachBtn = document.getElementById('attachBtn');
    if (!attachBtn) return;

    attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAttachDropdown();
    });

    const pcDropdown = document.getElementById('attachDropdown');
    if (pcDropdown) {
        let isDragging = false;
        let startY = 0;
        let startBottom = 0;

        const handle = pcDropdown.querySelector('.attach-dropdown-handle');
        if (handle) {
            handle.addEventListener('mousedown', (e) => {
                isDragging = true;
                startY = e.clientY;
                startBottom = parseInt(window.getComputedStyle(pcDropdown).bottom);
                pcDropdown.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const deltaY = e.clientY - startY;
                const newBottom = startBottom - deltaY;
                pcDropdown.style.bottom = newBottom + 'px';
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                pcDropdown.style.cursor = '';
            });
        }
    }

    const imageUploadInput = document.getElementById('imageUploadInput');
    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', handleImageUpload);
    }

    const docInput = document.createElement('input');
    docInput.type = 'file';
    docInput.id = 'docUploadInput';
    docInput.accept = '.txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.doc,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    docInput.style.display = 'none';
    docInput.multiple = true;
    document.body.appendChild(docInput);

    docInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            await handleDocUpload(file);
        }
        e.target.value = '';
    });

    initPasteAndDrop();

    document.addEventListener('click', (e) => {
        if (!attachDropdownOpen) return;
        const pcDropdown = document.getElementById('attachDropdown');
        const mobileDropdown = document.getElementById('attachDropdownMobile');
        const attachBtn = document.getElementById('attachBtn');
        const dropdownContainer = document.querySelector('.attach-dropdown-container');

        if (!pcDropdown?.contains(e.target) &&
            !mobileDropdown?.contains(e.target) &&
            !attachBtn?.contains(e.target) &&
            !dropdownContainer?.contains(e.target)) {
            closeAttachDropdown();
        }
    });
}

function toggleAttachDropdown() {
    const pcDropdown = document.getElementById('attachDropdown');
    const mobileDropdown = document.getElementById('attachDropdownMobile');
    const attachBtn = document.getElementById('attachBtn');

    if (!pcDropdown || !mobileDropdown || !attachBtn) {
        return;
    }

    attachDropdownOpen = !attachDropdownOpen;

    if (attachDropdownOpen) {
        let bd = document.getElementById('attachSheetBackdrop');
        if (!bd) {
            bd = document.createElement('div');
            bd.id = 'attachSheetBackdrop';
            bd.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);';
            bd.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAttachDropdown();
            });
            document.body.appendChild(bd);
        }
        if (window.innerWidth <= 680) bd.style.display = 'block';
        updateDropdownActiveStates();
        populateMobilePhotoStrip();
        updateModeLabels();

        if (window.innerWidth <= 680) {
            mobileDropdown.classList.add('show');
        } else {
            pcDropdown.classList.add('show');
        }
        attachBtn.classList.add('active');
    } else {
        closeAttachDropdown();
    }
}

function closeAttachDropdown() {
    const pcDropdown = document.getElementById('attachDropdown');
    const mobileDropdown = document.getElementById('attachDropdownMobile');
    const attachBtn = document.getElementById('attachBtn');
    const bd = document.getElementById('attachSheetBackdrop');
    if (bd) bd.style.display = 'none';
    if (pcDropdown) pcDropdown.classList.remove('show');
    if (mobileDropdown) mobileDropdown.classList.remove('show');
    if (attachBtn) {
        attachBtn.classList.remove('active');
        attachDropdownOpen = false;
    }
}

function triggerImageUpload() {
    closeAttachDropdown();
    const input = document.getElementById('imageUploadInput');
    if (input) { input.disabled = false; input.click(); }
}

function triggerDocUpload() {
    closeAttachDropdown();
    const input = document.getElementById('docUploadInput');
    if (input) input.click();
}

function triggerCameraCapture() {
    toast.comingSoon('Camera capture');
}

function getDocIcon(mimeType, fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (mimeType === 'application/pdf' || ext === 'pdf') return 'fa-file-pdf';
    if (mimeType === 'application/json' || ext === 'json') return 'fa-file-code';
    if (mimeType === 'text/csv' || ext === 'csv') return 'fa-file-csv';
    if (mimeType === 'text/html' || ext === 'html' || ext === 'htm') return 'fa-file-code';
    if (ext === 'md' || ext === 'markdown') return 'fa-file-lines';
    if (mimeType.startsWith('application/') && (mimeType.includes('word') || ext === 'doc' || ext === 'docx')) return 'fa-file-word';
    return 'fa-file-lines';
}

function addDocToInput(fileName, mimeType, text) {
    const docsRow = getOrCreateDocsRow();

    const chip = document.createElement('div');
    chip.className = 'input-doc-chip';
    chip.dataset.fileName = fileName;

    const icon = getDocIcon(mimeType, fileName);
    const truncated = fileName.length > 22 ? fileName.slice(0, 20) + '…' : fileName;
    const wordCount = text.trim().split(/\s+/).length;
    const sizeLabel = wordCount > 1000 ? `${Math.round(wordCount / 1000 * 10) / 10}k words` : `${wordCount} words`;

    chip.innerHTML = `
        <div class="input-doc-chip-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="input-doc-chip-info">
            <div class="input-doc-chip-name">${truncated}</div>
            <div class="input-doc-chip-meta">${sizeLabel}</div>
        </div>
        <button type="button" class="input-doc-chip-remove" title="Remove"><i class="fa-solid fa-xmark" style="font-size:9px"></i></button>
    `;

    chip.querySelector('.input-doc-chip-remove').addEventListener('click', () => {
        chip.remove();
        window.uploadedDocs = window.uploadedDocs.filter(d => d.name !== fileName);
        const row = document.getElementById('inputDocsRow');
        if (row && !row.children.length) row.remove();
        updateAttachBtnIcon();
        updateFeedEmptyTitlePosition();
    });

    docsRow.appendChild(chip);

    if (!window.uploadedDocs) window.uploadedDocs = [];
    window.uploadedDocs.push({ name: fileName, mimeType, text });

    updateAttachBtnIcon();
    updateFeedEmptyTitlePosition();
}

function getOrCreateDocsRow() {
    const existing = document.getElementById('inputDocsRow');
    if (existing) return existing;

    const inputArea = document.querySelector('.input-area');
    const inputBox = document.getElementById('chatInputBox');
    const row = document.createElement('div');
    row.id = 'inputDocsRow';
    row.className = 'input-docs-row';

    inputArea.insertBefore(row, inputBox);
    return row;
}

async function extractTextFromFile(file) {
    if (file.type === 'application/pdf') {
        return await extractTextFromPdf(file);
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsText(file);
    });
}

async function extractTextFromPdf(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const typedArray = new Uint8Array(e.target.result);
                if (window.pdfjsLib) {
                    const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
                    let fullText = '';
                    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        fullText += content.items.map(item => item.str).join(' ') + '\n';
                    }
                    resolve(fullText.trim() || '[PDF: no extractable text found]');
                } else {
                    resolve('[PDF attached — install a PDF reader to extract text]');
                }
            } catch {
                resolve('[PDF: could not extract text]');
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

async function handleDocUpload(file) {
    if (!file) return;

    const isAllowedDoc = ALLOWED_DOC_TYPES.has(file.type) ||
        /\.(txt|md|markdown|csv|json|html|htm|pdf|doc|docx)$/i.test(file.name);

    if (!isAllowedDoc) {
        if (typeof toast !== 'undefined') toast.show('Unsupported file type', 'Only text, PDF, CSV, JSON, and Word docs are supported.');
        else alert('Unsupported file type.');
        return;
    }

    if (file.size > MAX_DOC_BYTES) {
        if (typeof toast !== 'undefined') toast.show('File too large', 'Max document size is 2 MB.');
        else alert('File is too large. Maximum is 2 MB.');
        return;
    }

    try {
        const text = await extractTextFromFile(file);
        addDocToInput(file.name, file.type || 'text/plain', text);
        closeAttachDropdown();
    } catch (err) {
        if (typeof toast !== 'undefined') toast.show('Read error', err.message || 'Could not read file.');
        else alert('Could not read file.');
    }
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        alert('Please select a valid image file (JPEG, PNG, WEBP, or GIF)');
        event.target.value = '';
        return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
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
    updateFeedEmptyTitlePosition();
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
    updateFeedEmptyTitlePosition();
}

function createImagesRow() {
    const inputBox = document.getElementById('chatInputBox');
    const existing = document.getElementById('inputImagesRow');
    if (existing) return existing;

    const row = document.createElement('div');
    row.id = 'inputImagesRow';
    row.className = 'input-images-row';

    const docsRow = document.getElementById('inputDocsRow');
    if (docsRow) {
        inputBox.insertBefore(row, docsRow.nextSibling);
    } else {
        inputBox.insertBefore(row, inputBox.firstChild);
    }
    return row;
}

function clearUploadedDocs() {
    window.uploadedDocs = [];
    document.getElementById('inputDocsRow')?.remove();
    updateAttachBtnIcon();
    updateFeedEmptyTitlePosition();
}

function buildDocContext() {
    if (!window.uploadedDocs || !window.uploadedDocs.length) return '';
    return window.uploadedDocs.map(doc => {
        const MAX_CHARS = 60000;
        const truncated = doc.text.length > MAX_CHARS ? doc.text.slice(0, MAX_CHARS) + '\n[... truncated]' : doc.text;
        return `<file name="${doc.name}">\n${truncated}\n</file>`;
    }).join('\n\n');
}

function parseDocWidgetData(text) {
    const sections = [];
    const lines = text.split('\n');
    let currentSection = null;
    let currentRows = [];

    const tableHeaderRe = /^Category\s+School\s*#?1\s+School\s*#?2/i;
    const sectionRe = /^SECTION\s+\d+[:\s]+(.+)/i;
    const reflectionRe = /^(SECTION 5|BEST FIT SCORE|FINAL REFLECTION)/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (sectionRe.test(line)) {
            if (currentSection) sections.push({ ...currentSection, rows: currentRows });
            currentSection = { title: line, rows: [] };
            currentRows = [];
            continue;
        }

        if (tableHeaderRe.test(line)) continue;

        if (currentSection) {
            const parts = line.split(/\s{2,}|\t/);
            if (parts.length >= 2) {
                currentRows.push(parts.map(p => p.trim()).filter(Boolean));
            } else {
                currentRows.push([line]);
            }
        }
    }

    if (currentSection) sections.push({ ...currentSection, rows: currentRows });
    return sections;
}

function renderDocAsWidget(fileName, text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'doc-widget-wrap';
    wrapper.style.cssText = 'background:var(--surface);border-radius:12px;overflow:hidden;border:1px solid var(--border);max-width:340px;width:100%;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);background:var(--surface2);';
    header.innerHTML = `<i class="fa-solid fa-file-lines" style="color:var(--accent);font-size:16px;flex-shrink:0;"></i><span style="font-size:0.9375rem;font-weight:600;color:var(--fg);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(fileName)}</span>`;
    wrapper.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 14px;overflow-x:auto;max-height:180px;overflow-y:auto;font-size:0.8125rem;';

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let currentTable = null;
    let html = '';
    let inReflection = false;

    const tableHeaderRe = /^Category\s+School/i;
    const sectionRe = /^SECTION\s+\d+/i;
    const reflectionRe = /FINAL REFLECTION|BEST FIT SCORE/i;
    const instructionsRe = /^Instructions:/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (reflectionRe.test(line)) {
            inReflection = true;
            html += `<div style="font-size:0.8125rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin:18px 0 10px;">${escHtml(line)}</div>`;
            continue;
        }

        if (instructionsRe.test(line)) {
            html += `<div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;font-style:italic;">${escHtml(line)}</div>`;
            continue;
        }

        if (sectionRe.test(line)) {
            inReflection = false;
            html += `<div style="font-size:0.8125rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin:18px 0 8px;">${escHtml(line)}</div>`;
            continue;
        }

        if (tableHeaderRe.test(line)) {
            const cols = line.split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean);
            html += `<div style="overflow-x:auto;margin-bottom:4px;"><table style="width:100%;border-collapse:collapse;font-size:0.8125rem;">`;
            html += `<thead><tr>`;
            cols.forEach((col, ci) => {
                html += `<th style="padding:8px 12px;text-align:${ci === 0 ? 'left' : 'center'};background:var(--surface3);color:var(--fg-muted);font-weight:600;border:1px solid var(--border);white-space:nowrap;">${escHtml(col)}</th>`;
            });
            html += `</tr></thead><tbody>`;
            currentTable = { cols: cols.length };
            continue;
        }

        if (currentTable) {
            const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 1) {
                const isScore = /^\d+$/.test(parts[parts.length - 1]);
                html += `<tr>`;
                for (let c = 0; c < currentTable.cols; c++) {
                    const val = parts[c] || '';
                    const center = c > 0;
                    html += `<td contenteditable="true" data-placeholder="${c === 0 ? '' : '—'}" style="padding:8px 12px;border:1px solid var(--border);color:var(--fg);text-align:${center ? 'center' : 'left'};background:var(--surface);min-width:${c === 0 ? '160px' : '120px'};cursor:text;outline:none;" onfocus="this.style.background='var(--surface2)'" onblur="this.style.background='var(--surface)'">${escHtml(val)}</td>`;
                }
                html += `</tr>`;

                const nextLine = lines[i + 1]?.trim() || '';
                const isNextHeader = tableHeaderRe.test(nextLine) || sectionRe.test(nextLine) || reflectionRe.test(nextLine) || !nextLine;
                if (isNextHeader) {
                    html += `</tbody></table></div>`;
                    currentTable = null;
                }
            } else {
                html += `</tbody></table></div>`;
                currentTable = null;
                i--;
            }
            continue;
        }

        if (inReflection) {
            if (/_{3,}/.test(line)) {
                html += `<div contenteditable="true" style="min-height:36px;border-bottom:1px solid var(--border);margin:6px 0;padding:6px 4px;font-size:0.9rem;color:var(--fg);outline:none;cursor:text;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"></div>`;
            } else {
                html += `<div style="font-size:0.875rem;color:var(--fg-muted);margin:8px 0 4px;font-weight:500;">${escHtml(line)}</div>`;
            }
            continue;
        }

        html += `<div style="font-size:0.875rem;color:var(--fg-muted);margin:4px 0;">${escHtml(line)}</div>`;
    }

    if (currentTable) html += `</tbody></table></div>`;

    body.innerHTML = html;

    const saveBtn = document.createElement('button');
    saveBtn.style.cssText = 'margin:4px 18px 16px;padding:8px 18px;border-radius:8px;background:var(--fg);color:var(--bg);font-size:0.8125rem;font-weight:600;border:none;cursor:pointer;font-family:var(--font);';
    saveBtn.textContent = 'Save to Firebase';
    saveBtn.addEventListener('click', async () => {
        const db = window.firebaseDB;
        if (!db || !currentUser) {
            if (typeof toast !== 'undefined') toast.show('Not signed in', 'Please sign in to save.');
            return;
        }
        const cells = body.querySelectorAll('[contenteditable]');
        const saved = [];
        cells.forEach((cell, idx) => {
            saved.push({ index: idx, value: cell.innerText.trim() });
        });
        try {
            await db.collection('doc_widgets').add({
                user_id: currentUser.uid,
                file_name: fileName,
                cells: saved,
                saved_at: firebase.firestore.FieldValue.serverTimestamp()
            });
            saveBtn.textContent = 'Saved ✓';
            setTimeout(() => { saveBtn.textContent = 'Save to Firebase'; }, 2000);
        } catch (e) {
            if (typeof toast !== 'undefined') toast.show('Save failed', e.message || 'Try again.');
        }
    });

    wrapper.appendChild(body);
    wrapper.appendChild(saveBtn);
    return wrapper;
}

function addBubbleWithDocWidget(fileName, text, userText) {
    const feed = document.getElementById('feed');
    const userRow = document.createElement('div');
    userRow.className = 'msg-row user';

    const chip = document.createElement('div');
    chip.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);border-radius:10px;border:1px solid var(--border);max-width:260px;align-self:flex-end;margin-bottom:4px;';
    const wordCount = text.trim().split(/\s+/).length;
    const wc = wordCount > 1000 ? `${Math.round(wordCount / 1000 * 10) / 10}k words` : `${wordCount} words`;
    chip.innerHTML = `<i class="fa-solid fa-file-lines" style="color:var(--accent);font-size:15px;flex-shrink:0;"></i><div><div style="font-size:0.875rem;font-weight:600;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${escHtml(fileName)}</div><div style="font-size:0.75rem;color:var(--muted);">${wc}</div></div>`;
    userRow.appendChild(chip);

    if (userText) {
        const userBub = document.createElement('div');
        userBub.className = 'user-bub';
        userBub.textContent = userText;
        userRow.appendChild(userBub);
    }

    feed.appendChild(userRow);
    return userRow;
}

function initPasteAndDrop() {
    const inp = document.getElementById('inp');
    const inputBox = document.getElementById('chatInputBox');
    if (!inp || !inputBox) return;

    inp.addEventListener('paste', async (e) => {
        const items = Array.from(e.clipboardData?.items || []);

        const fileItems = items.filter(item => item.kind === 'file');
        if (!fileItems.length) return;

        const imageFiles = fileItems.filter(item => ALLOWED_IMAGE_TYPES.has(item.type));
        const docFiles = fileItems.filter(item => !ALLOWED_IMAGE_TYPES.has(item.type));

        if (imageFiles.length || docFiles.length) {
            e.preventDefault();
        }

        for (const item of imageFiles) {
            const file = item.getAsFile();
            if (!file) continue;
            if (file.size > MAX_IMAGE_BYTES) {
                if (typeof toast !== 'undefined') toast.show('Image too large', 'Max 10 MB per image.');
                continue;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                addImageToInput(ev.target.result);
                updateAttachBtnIcon();
            };
            reader.readAsDataURL(file);
        }

        for (const item of docFiles) {
            const file = item.getAsFile();
            if (file) await handleDocUpload(file);
        }
    });

    const dropZone = inputBox;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over');
        }
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer?.files || []);
        for (const file of files) {
            if (ALLOWED_IMAGE_TYPES.has(file.type)) {
                if (file.size > MAX_IMAGE_BYTES) {
                    if (typeof toast !== 'undefined') toast.show('Image too large', 'Max 10 MB.');
                    continue;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    addImageToInput(ev.target.result);
                    updateAttachBtnIcon();
                };
                reader.readAsDataURL(file);
            } else {
                await handleDocUpload(file);
            }
        }
    });

    document.addEventListener('dragover', (e) => {
        if (!e.target.closest('#chatInputBox')) {
            e.dataTransfer.dropEffect = 'none';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.pdfjsLib) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
        };
        document.head.appendChild(script);
    }

    function restoreAttachModes() {
        const s = typeof getVexaSettings === 'function' ? getVexaSettings() : {};
        thinkingModeEnabled = !!s.thinkingMode;
        deepResearchEnabled = !!s.deepResearch;

        if (typeof toggleSearchMode === 'function' && typeof isSearchMode === 'function') {
            const currentSearchMode = isSearchMode();
            const savedSearchMode = s.searchMode;
            if (savedSearchMode !== currentSearchMode) {
                toggleSearchMode();
            }
        }
        updateAttachBtnIcon();
        updateDropdownActiveStates();
    }

    injectAttachButton();
    restoreAttachModes();
});