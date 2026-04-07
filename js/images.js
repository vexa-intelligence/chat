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
          const parsedImages = JSON.parse(data.images);

          savedImages = await Promise.all(parsedImages.map(async img => {
            if (img.base64 && !img.blob) {
              try {
                const blobUrl = img.base64.startsWith('data:') ? img.base64 : URL.createObjectURL(await (await fetch(img.base64)).blob());

                return {
                  ...img,
                  blob: null,
                  url: blobUrl,
                  storageUrl: blobUrl
                };
              } catch (e) {
                console.error('Failed to recreate blob from base64:', e);
                return img;
              }
            }
            return img;
          }));

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
    const toSave = await Promise.all(savedImages.map(async img => {
      let base64 = '';

      if (img.blob) {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(img.blob);
        });
      }

      return {
        url: img.url || '',
        storageUrl: img.storageUrl || '',
        base64: base64,
        prompt: img.prompt || '',
        ts: img.ts || Date.now()
      };
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
    if (!imageUrl) return;

    const el = document.createElement('img');
    el.className = 'my-image-thumb';
    el.src = imageUrl;
    el.alt = img.prompt || '';
    el.title = img.prompt || '';
    el.style.cursor = 'pointer';
    el.onclick = () => openLightbox(imageUrl);
    grid.appendChild(el);
  });
}

async function saveMyImage(url, prompt, providedBlob = null) {

  if (!currentUser) {
    return;
  }

  try {
    let blobUrl = url;
    let storageBlob = providedBlob;

    if (providedBlob) {
      blobUrl = URL.createObjectURL(providedBlob);
    } else if (url.startsWith('blob:')) {
      try {
        blobUrl = url;
        const response = await fetch(url);
        storageBlob = await response.blob();
      } catch (blobError) {
      }
    } else if (url.startsWith('http') || url.startsWith('/')) {
      const fetchUrl = url.startsWith('/') ? CONFIG.BASE + url : url;
      try {
        const response = await fetch(fetchUrl, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-cache'
        });
        if (response.ok) {
          storageBlob = await response.blob();
          blobUrl = URL.createObjectURL(storageBlob);
        }
      } catch (fetchError) {
      }
    }

    const image = {
      url: blobUrl,
      storageUrl: blobUrl,
      originalUrl: url,
      blob: storageBlob,
      prompt,
      ts: Date.now()
    };

    savedImages.unshift(image);
    renderMyImages();
    await saveImagesToFirebase();
    return;

  } catch (error) {
  }

  const image = {
    url,
    storageUrl: url,
    originalUrl: url,
    blob: null,
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
      body: JSON.stringify({
        prompt,
        model: 'hd',
        preference: 'quality'
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error Response:', errorText);

      if ((res.status === 502 || res.status === 503 || res.status === 504) && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return generateImage(prompt, retryCount + 1);
      }

      if (res.status === 502) {
        throw new Error('Image generation service temporarily unavailable. Please try again in a few minutes.');
      }

      throw new Error(`API ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unknown error');

    let proxyUrl = data.proxy_url;
    if (!proxyUrl) throw new Error('No image URL received');

    if (proxyUrl.startsWith('/')) proxyUrl = CONFIG.BASE + proxyUrl;

    let imageBlob = null;
    let displayUrl = proxyUrl;

    try {
      const imageResponse = await fetch(proxyUrl);
      if (imageResponse.ok) {
        imageBlob = await imageResponse.blob();
        displayUrl = URL.createObjectURL(imageBlob);
      }
    } catch (error) {
      console.error('Failed to fetch image from proxy:', error);
    }

    area.innerHTML = `
    <div class="image-output-inner">
      <div class="image-output-result">
        <img src="${displayUrl}" alt="${prompt}" style="cursor:pointer">
      </div>
      <div class="image-output-footer">
        <span class="image-output-prompt">${prompt}</span>
        <button id="imgOutputClose">×</button>
      </div>
    </div>`;

    document.getElementById('imgOutputClose').onclick = closeImageOutput;
    area.querySelector('img').onclick = () => openLightbox(displayUrl);

    saveMyImage(displayUrl, prompt, imageBlob);
  } catch (err) {
    console.error('Image generation error:', err);

    if ((err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) && retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateImage(prompt, retryCount + 1);
    }

    const errorMsg = err.message.includes('501')
      ? 'Image generation service not configured. Please contact administrator.'
      : err.message.includes('502')
        ? 'Image generation service temporarily unavailable. The service may be experiencing high demand. Please try again later.'
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

  initLightbox();
}

function initLightbox() {
  const lightboxOverlay = document.getElementById('lightboxOverlay');
  const lightboxImage = document.getElementById('lightboxImage');

  if (!lightboxOverlay || !lightboxImage) return;

  lightboxOverlay.addEventListener('click', (e) => {
    if (e.target === lightboxOverlay) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
    }
  });
}

function openLightbox(imageUrl) {
  const lightboxOverlay = document.getElementById('lightboxOverlay');
  const lightboxImage = document.getElementById('lightboxImage');

  if (!lightboxOverlay || !lightboxImage) return;

  lightboxImage.src = imageUrl;
  lightboxOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightboxOverlay = document.getElementById('lightboxOverlay');

  if (!lightboxOverlay) return;

  lightboxOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}