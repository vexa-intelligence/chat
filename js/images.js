let savedImages = [];
let isFetchingPreviews = false;
let previewQueue = [];

const DISCOVER_PROMPTS = [
  { prompt: 'Reimagine my pet as a human, photorealistic portrait', label: 'Reimagine my pet as a human' },
  { prompt: 'Stylish fashion editorial portrait photography', label: 'Style me' },
  { prompt: 'Bowl cut hairstyle portrait funny', label: 'Give them a bowl cut' },
  { prompt: 'Black and white coloring page illustration for kids simple', label: 'Create a coloring page' }
];

const STYLE_PROMPTS = [
  'Spring botanical portrait, vibrant flowers, warm sunlight',
  'Caricature trend exaggerated comic art style',
  'Flower petals portrait delicate pastel',
  'Gold metallic statue ancient emperor portrait',
  'Crayon drawing colorful child illustration style',
  'Watercolor soft painting artistic landscape'
];

async function fetchDiscoverPreview(prompt, cardEl) {
  const thumb = cardEl?.querySelector('.discover-thumb');
  if (!thumb) return;

  thumb.classList.remove('skeleton');
  thumb.style.cssText = 'background:none;padding:0;overflow:hidden';

  const img = document.createElement('img');
  img.src = `https://picsum.photos/seed/${encodeURIComponent(prompt)}/300/300`;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:10px;display:block';
  thumb.appendChild(img);
}

async function fetchStylePreview(prompt, previewEl) {
  if (!previewEl) return;

  previewEl.classList.remove('skeleton');
  previewEl.style.cssText = 'background:none;overflow:hidden';

  const img = document.createElement('img');
  img.src = `https://loremflickr.com/300/300/${encodeURIComponent(prompt.split(' ')[0])}`;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:14px;display:block';
  previewEl.appendChild(img);
}

async function processPreviewQueue() {
  if (isFetchingPreviews || !previewQueue.length) return;

  isFetchingPreviews = true;

  while (previewQueue.length) {
    const { prompt, cardEl, previewEl, type } = previewQueue.shift();
    if (type === 'style') {
      await fetchStylePreview(prompt, previewEl);
    } else {
      await fetchDiscoverPreview(prompt, cardEl);
    }
  }

  isFetchingPreviews = false;
}

function initDiscoverPreviews() {
  document.querySelectorAll('.discover-card').forEach((card, i) => {
    const thumb = card.querySelector('.discover-thumb');
    if (!thumb) return;

    thumb.classList.add('skeleton');
    thumb.style.background = '';

    const prompt =
      DISCOVER_PROMPTS[i]?.prompt ||
      card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] ||
      '';

    previewQueue.push({ prompt, cardEl: card, type: 'discover' });
  });
}

function initStylePreviews() {
  document.querySelectorAll('.style-card').forEach((card, i) => {
    const preview = card.querySelector('.style-card-preview');
    if (!preview) return;

    preview.classList.add('skeleton');
    preview.style.background = '';

    const prompt =
      STYLE_PROMPTS[i] ||
      card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] ||
      '';

    previewQueue.push({ prompt, previewEl: preview, type: 'style' });
  });
}

async function loadImagesFromFirebase() {
  const db = window.firebaseDB;
  if (!db || !currentUser) return;

  try {
    const doc = await db.collection('user_images').doc(currentUser.uid).get();

    if (doc.exists) {
      const data = doc.data();
      if (data.images) {
        try {
          savedImages = JSON.parse(data.images);
          renderMyImages();
        } catch {
          savedImages = [];
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
}

async function saveImagesToFirebase() {
  const db = window.firebaseDB;
  if (!db || !currentUser) return;

  try {
    const toSave = savedImages.map(img => ({
      url: img.url || '',
      storageUrl: img.storageUrl || '',
      prompt: img.prompt || '',
      ts: img.ts || Date.now()
    }));

    await db.collection('user_images').doc(currentUser.uid).set(
      {
        images: JSON.stringify(toSave),
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch (e) {
    console.error(e);
  }
}

function renderMyImages() {
  const grid = document.getElementById('myImagesGrid');
  if (!grid) return;

  if (!savedImages.length) {
    grid.innerHTML = '<div class="my-images-empty">Your generated images will appear here</div>';
    return;
  }

  grid.innerHTML = '';

  savedImages.forEach(img => {
    const imageUrl = img.storageUrl || img.base64 || img.url;
    if (!imageUrl || imageUrl.startsWith('blob:')) return;

    const el = document.createElement('img');
    el.className = 'my-image-thumb';
    el.src = imageUrl;
    el.alt = img.prompt || '';
    el.title = img.prompt || '';
    grid.appendChild(el);
  });
}

async function saveMyImage(url, prompt) {

  if (!currentUser) {
    return;
  }

  try {
    let permanentUrl = url;
    if (url.startsWith('blob:')) {
      const response = await fetch(url);
      const blob = await response.blob();
      permanentUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }

    const image = {
      url: permanentUrl,
      storageUrl: permanentUrl,
      originalUrl: url,
      prompt,
      ts: Date.now()
    };

    savedImages.unshift(image);

    renderMyImages();
    await saveImagesToFirebase();
    return;

  } catch (error) {
    console.error('Failed to convert image:', error);
    console.warn('Using original URL as fallback');
  }

  const image = {
    url,
    storageUrl: url,
    prompt,
    ts: Date.now()
  };

  savedImages.unshift(image);

  renderMyImages();
  await saveImagesToFirebase();
}

async function generateImage(prompt, retryCount = 0) {
  const maxRetries = 3;
  const baseDelay = 1000;

  const area = document.getElementById('imageOutputArea');

  area.innerHTML = `
  <div class="image-output-inner">
    <div class="image-output-loading">
      <div class="dots"><span></span><span></span><span></span></div>
      <span>Generating image${retryCount > 0 ? ` (retry ${retryCount}/${maxRetries})` : ''}...</span>
    </div>
  </div>`;
  area.classList.remove('hidden');

  try {
    const res = await fetch(`${CONFIG.BASE}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: 'hd', preference: 'quality' })
    });

    if (!res.ok) {
      if ((res.status === 502 || res.status === 503 || res.status === 504) && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return generateImage(prompt, retryCount + 1);
      }
      throw new Error(`API ${res.status}`);
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    let imgUrl = data.proxy_url;
    if (!imgUrl) throw new Error('No image');

    if (imgUrl.startsWith('/')) imgUrl = CONFIG.BASE + imgUrl;

    area.innerHTML = `
    <div class="image-output-inner">
      <div class="image-output-result">
        <img src="${imgUrl}" alt="${prompt}">
      </div>
      <div class="image-output-footer">
        <span class="image-output-prompt">${prompt}</span>
        <button id="imgOutputClose">×</button>
      </div>
    </div>`;

    document.getElementById('imgOutputClose').onclick = closeImageOutput;

    saveMyImage(imgUrl, prompt);
  } catch (err) {
    console.error('Image generation error:', err);

    if ((err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) && retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateImage(prompt, retryCount + 1);
    }

    const errorMsg = err.message.includes('501')
      ? 'Image generation service not configured. Please contact administrator.'
      : err.message;
    area.innerHTML = `<div class="image-output-inner error">${errorMsg}</div>`;
  }
}

function closeImageOutput() {
  document.getElementById('imageOutputArea')?.classList.add('hidden');
}

function quickImageSend(prompt) {
  const inp = document.getElementById('imagePromptInp');
  inp.value = prompt;
  generateImage(prompt);
}

function initImages() {
  const inp = document.getElementById('imagePromptInp');
  const sendBtn = document.getElementById('imgGenSend');

  sendBtn.onclick = () => {
    const prompt = inp.value.trim();
    if (prompt) generateImage(prompt);
  };

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const p = inp.value.trim();
      if (p) generateImage(p);
    }
  });

  setTimeout(() => {
    initDiscoverPreviews();
    initStylePreviews();
    processPreviewQueue();
  }, 800);
}