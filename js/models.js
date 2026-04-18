let allTextModels = [];
let modelsLoaded = false;
let currentModelType = 'text';

async function loadModels() {
    if (modelsLoaded) return;

    const container = document.getElementById('modelsContainer');

    try {
        const res = await fetch(`${CONFIG.BASE}/models`);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const raw = await res.json();
        const providerMap = raw.text_models_by_provider || {};

        allTextModels = raw.text_models.map(id => {
            let info = { label: id, provider: 'Unknown', description: '' };

            for (const group of Object.values(providerMap)) {
                const match = group.find(m => m.name === id);
                if (match) {
                    info = {
                        label: match.label || id,
                        provider: match.provider || 'Unknown',
                        description: match.description || ''
                    };
                    break;
                }
            }

            return [id, info];
        });

        document.getElementById('modelsSubtitle').textContent =
            `${allTextModels.length} models available`;

        const defModelSel = document.getElementById('defaultModelSelect');
        if (defModelSel) {
            defModelSel.innerHTML = '';
            allTextModels.forEach(([id, info]) => {
                const o = document.createElement('option');
                o.value = id;
                o.textContent = info.label || id;
                defModelSel.appendChild(o);
            });
        }

        const list = document.getElementById('modelPickerList');
        if (list) {
            list.innerHTML = '';
            allTextModels.forEach(([id, info]) => {
                const item = document.createElement('div');
                item.className = 'model-picker-item';
                item.dataset.val = id;

                item.innerHTML = `
                    <div class="mpi-info">
                        <div class="mpi-name">${escHtml(info.label || id)}</div>
                        <div class="mpi-sub">${escHtml(info.provider || 'Unknown')}</div>
                    </div>
                    <i class="fa-solid fa-check mpi-check" style="font-size:13px"></i>
                `;

                item.addEventListener('click', () => setModel(id, info.label || id));
                list.appendChild(item);
            });
        }

        modelsLoaded = true;
        renderModelsPage(currentModelType);

    } catch (err) {
        if (container) {
            container.innerHTML =
                `<div class="empty-state">Could not load models: ${escHtml(err.message)}</div>`;
        }
    }
}

function renderModelsPage(type) {
    currentModelType = type;

    const container = document.getElementById('modelsContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!allTextModels.length) {
        container.innerHTML = '<div class="empty-state">No text models.</div>';
        return;
    }

    const list = document.createElement('div');
    list.className = 'model-list-group';

    allTextModels.forEach(([id, info]) => {
        const card = document.createElement('div');
        card.className = 'model-card';

        const initials = (info.label || id).slice(0, 2).toUpperCase();

        const badge = 'Smart';

        card.innerHTML = `
            <div class="model-card-icon">${initials}</div>
            <div class="model-card-info">
                <div class="model-card-name">${escHtml(info.label || id)}</div>
                <div class="model-card-sub">${escHtml(info.provider || 'Unknown')}</div>
            </div>
            <span class="model-card-badge">${badge}</span>
        `;

        card.addEventListener('click', () => {
            setModel(id, info.label || id);
            showPage('chat');
        });

        list.appendChild(card);
    });

    container.appendChild(list);
}

function setModel(val, label) {
    currentModel = val;
    currentModelLabel = label || 'Vexa';

    const title = document.getElementById('topbarTitle');
    if (title?.querySelector('span')) {
        title.querySelector('span').textContent = currentModelLabel;
    }

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

    const autoItem = document.querySelector('.model-picker-item[data-val=""]');
    if (autoItem) {
        autoItem.addEventListener('click', () => setModel('', 'Auto'));
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
