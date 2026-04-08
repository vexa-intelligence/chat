let allTextModels = [];
let allImageModels = [];
let modelsLoaded = false;
let currentModelType = 'text';

async function loadModels() {
    if (modelsLoaded) return;
    const container = document.getElementById('modelsContainer');
    try {
        const res = await fetch(`${CONFIG.BASE}/models`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const raw = await res.json();
        allTextModels = raw.models ? Object.entries(raw.models) : [];
        allImageModels = [{ name: 'hd', label: 'HD', description: 'High quality image generation' }];

        document.getElementById('modelsSubtitle').textContent =
            `${allTextModels.length + allImageModels.length} models available`;

        const imgSel = document.getElementById('imageModelSelect');
        if (imgSel) imgSel.innerHTML = '<option value="hd" selected>HD</option>';

        const defModelSel = document.getElementById('defaultModelSelect');
        if (defModelSel) {
            allTextModels.forEach(([id, info]) => {
                const o = document.createElement('option');
                o.value = id;
                o.textContent = info.label || id;
                defModelSel.appendChild(o);
            });
        }

        const list = document.getElementById('modelPickerList');
        if (list) {
            allTextModels.forEach(([id, info]) => {
                const item = document.createElement('div');
                item.className = 'model-picker-item';
                item.dataset.val = id;
                item.innerHTML = `
                    <div class="mpi-info">
                        <div class="mpi-name">${escHtml(info.label || id)}</div>
                        <div class="mpi-sub">${escHtml(info.provider || id)}</div>
                    </div>
                    <i class="fa-solid fa-check mpi-check" style="font-size:13px"></i>`;
                item.addEventListener('click', () => setModel(id, info.label || id));
                list.appendChild(item);
            });
        }

        modelsLoaded = true;
        renderModelsPage(currentModelType);
    } catch (err) {
        if (container) container.innerHTML = `<div class="empty-state">Could not load models: ${escHtml(err.message)}</div>`;
    }
}

function renderModelsPage(type) {
    currentModelType = type;
    const container = document.getElementById('modelsContainer');
    container.innerHTML = '';

    const tabs = document.createElement('div');
    tabs.className = 'models-type-tabs';
    tabs.innerHTML = `
        <button class="models-type-tab ${type === 'text' ? 'active' : ''}" onclick="renderModelsPage('text')">Text</button>
        <button class="models-type-tab ${type === 'image' ? 'active' : ''}" onclick="renderModelsPage('image')">Image</button>`;
    container.appendChild(tabs);

    if (type === 'text') {
        if (!allTextModels.length) { container.insertAdjacentHTML('beforeend', '<div class="empty-state">No text models.</div>'); return; }
        const list = document.createElement('div');
        list.className = 'model-list-group';
        allTextModels.forEach(([id, info]) => {
            const card = document.createElement('div');
            card.className = 'model-card';
            const initials = (info.label || id).slice(0, 2).toUpperCase();
            const speedPct = Math.min(100, Math.round((info.speed || 0) / 10));
            const badge = speedPct > 70 ? 'Fast' : speedPct > 40 ? 'Medium' : 'Smart';
            card.innerHTML = `
                <div class="model-card-icon">${initials}</div>
                <div class="model-card-info">
                    <div class="model-card-name">${escHtml(info.label || id)}</div>
                    <div class="model-card-sub">${escHtml(info.provider || id)}</div>
                </div>
                <span class="model-card-badge">${badge}</span>`;
            card.addEventListener('click', () => { setModel(id, info.label || id); showPage('chat'); });
            list.appendChild(card);
        });
        container.appendChild(list);
    } else {
        if (!allImageModels.length) { container.insertAdjacentHTML('beforeend', '<div class="empty-state">No image models.</div>'); return; }
        const grid = document.createElement('div');
        grid.className = 'img-model-grid';
        allImageModels.forEach(m => {
            const card = document.createElement('div');
            card.className = 'img-model-card';
            card.innerHTML = `
                <div class="img-model-card-name">${escHtml(m.label || m.name)}</div>
                <div class="img-model-card-desc">${escHtml(m.description || '')}</div>`;
            card.addEventListener('click', () => {
                const sel = document.getElementById('imageModelSelect');
                if (sel) Array.from(sel.options).forEach(o => { if (o.value === m.name) sel.value = m.name; });
                showPage('images');
            });
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }
}

function setModel(val, label) {
    currentModel = val;
    currentModelLabel = label || 'Vexa';
    document.getElementById('modelSelectLabel').textContent = currentModelLabel;
    document.getElementById('topbarTitle').querySelector('span').textContent = currentModelLabel;
    document.querySelectorAll('.model-picker-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.val === val);
    });
    closeModelPicker();
}

function openModelPicker() {
    document.getElementById('modelPickerOverlay').classList.remove('hidden');
}

function closeModelPicker() {
    document.getElementById('modelPickerOverlay').classList.add('hidden');
}

function initModels() {
    const modelSelectBtn = document.getElementById('modelSelectBtn');
    if (modelSelectBtn) {
        modelSelectBtn.addEventListener('click', e => {
            e.stopPropagation();
            openModelPicker();
        });
    }

    const topbarTitle = document.getElementById('topbarTitle');
    if (topbarTitle) {
        topbarTitle.addEventListener('click', e => {
            e.stopPropagation();
            openModelPicker();
        });
    }

    const modelPickerOverlay = document.getElementById('modelPickerOverlay');
    if (modelPickerOverlay) {
        modelPickerOverlay.addEventListener('click', closeModelPicker);
    }

    const modelPicker = document.getElementById('modelPicker');
    if (modelPicker) {
        modelPicker.addEventListener('click', e => e.stopPropagation());
    }
}