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
            if (img.cloudinaryUrl) {
              let stableUrl = img.cloudinaryUrl;
              if (stableUrl.includes('/v')) {
                stableUrl = stableUrl.replace(/\/v\d+\//, '/');
              }
              return {
                ...img,
                url: stableUrl,
                storageUrl: stableUrl,
                cloudinaryUrl: stableUrl,
                blob: null
              };
            }
            else if (img.base64 && !img.blob) {
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

async function compressImage(blob, quality = 0.7, maxWidth = 1024, maxHeight = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(resolve, 'image/jpeg', quality);
    };

    img.src = URL.createObjectURL(blob);
  });
}

async function uploadToCloudinary(blob, filename = null) {
  if (!blob || !CONFIG.CLOUDINARY_CONFIG) {
    throw new Error('Missing blob or Cloudinary configuration');
  }

  try {
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', CONFIG.CLOUDINARY_CONFIG.uploadPreset);
    formData.append('api_key', CONFIG.CLOUDINARY_CONFIG.apiKey);

    if (filename) {
      formData.append('public_id', filename);
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CONFIG.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudinary API Error:', errorText);
      throw new Error(`Cloudinary upload failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (data.error) {
      console.error('Cloudinary Error Response:', data.error);
      throw new Error(data.error.message || 'Cloudinary upload error');
    }

    let stableUrl = data.secure_url;
    if (stableUrl.includes('/v')) {
      stableUrl = stableUrl.replace(/\/v\d+\//, '/');
    }

    return stableUrl;

  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

async function saveImagesToFirebase() {
  const db = window.firebaseDB;
  if (!db || !currentUser) return;

  try {
    const toSave = await Promise.all(savedImages.map(async img => {
      let base64 = '';

      if (img.blob && !img.cloudinaryUrl) {
        const compressedBlob = await compressImage(img.blob, 0.7, 1024, 1024);
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(compressedBlob);
        });
      }

      return {
        url: img.url || '',
        storageUrl: img.storageUrl || '',
        cloudinaryUrl: img.cloudinaryUrl || '',
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

function deduplicateImages() {
  const uniqueImages = [];
  const seenUrls = new Set();

  for (const img of savedImages) {
    const imageUrl = img.storageUrl || img.base64 || img.url;
    if (!imageUrl) continue;

    if (!seenUrls.has(imageUrl)) {
      seenUrls.add(imageUrl);
      uniqueImages.push(img);
    }
  }

  savedImages = uniqueImages;
}

function renderMyImages() {
  const grid = document.getElementById('myImagesGrid');
  const empty = document.getElementById('myImagesEmpty');
  if (!grid) return;

  deduplicateImages();

  if (!savedImages.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.innerHTML = '';

  savedImages.forEach((img, index) => {
    const imageUrl = img.storageUrl || img.base64 || img.url;
    if (!imageUrl) return;

    const container = document.createElement('div');
    container.className = 'my-image-container';
    container.style.cssText = 'position:relative;';

    const el = document.createElement('img');
    el.className = 'my-image-thumb';
    el.src = imageUrl;
    el.alt = img.prompt || '';
    el.title = img.prompt || '';
    el.style.cursor = 'pointer';
    el.onclick = () => openLightbox(imageUrl);

    const deleteBtn = document.createElement('button');
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteImage(index);
    };

    container.addEventListener('mouseenter', () => {
      deleteBtn.style.opacity = '1';
    });
    container.addEventListener('mouseleave', () => {
      deleteBtn.style.opacity = '0';
    });

    container.appendChild(el);
    container.appendChild(deleteBtn);
    grid.appendChild(container);
  });
}

async function saveMyImage(url, prompt, providedBlob = null) {

  if (!currentUser) {
    return;
  }

  try {
    let blobUrl = url;
    let storageBlob = providedBlob;
    let cloudinaryUrl = null;

    if (providedBlob) {
      blobUrl = URL.createObjectURL(providedBlob);
      try {
        cloudinaryUrl = await uploadToCloudinary(providedBlob, `generated_${Date.now()}`);
      } catch (cloudinaryError) {
        console.error('Failed to upload to Cloudinary, falling back to local storage:', cloudinaryError);
      }
    } else if (url.startsWith('blob:')) {
      try {
        blobUrl = url;
        const response = await fetch(url);
        storageBlob = await response.blob();
        try {
          cloudinaryUrl = await uploadToCloudinary(storageBlob, `generated_${Date.now()}`);
        } catch (cloudinaryError) {
          console.error('Failed to upload to Cloudinary, falling back to local storage:', cloudinaryError);
        }
      } catch (blobError) {
        console.error('Failed to process blob URL:', blobError);
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
          try {
            cloudinaryUrl = await uploadToCloudinary(storageBlob, `generated_${Date.now()}`);
          } catch (cloudinaryError) {
            console.error('Failed to upload to Cloudinary, falling back to local storage:', cloudinaryError);
          }
        }
      } catch (fetchError) {
        console.error('Failed to fetch image:', fetchError);
      }
    }

    const image = {
      url: cloudinaryUrl || blobUrl,
      storageUrl: cloudinaryUrl || blobUrl,
      originalUrl: url,
      blob: storageBlob,
      prompt,
      ts: Date.now(),
      cloudinaryUrl: cloudinaryUrl
    };

    const isDuplicate = savedImages.some(existingImg =>
      existingImg.originalUrl === url ||
      existingImg.storageUrl === (cloudinaryUrl || blobUrl) ||
      existingImg.url === (cloudinaryUrl || blobUrl) ||
      (cloudinaryUrl && existingImg.cloudinaryUrl === cloudinaryUrl)
    );

    if (!isDuplicate) {
      savedImages.unshift(image);
      renderMyImages();
      await saveImagesToFirebase();
    }
    return;

  } catch (error) {
    console.error('Error in saveMyImage:', error);
  }

  const image = {
    url,
    storageUrl: url,
    originalUrl: url,
    blob: null,
    prompt,
    ts: Date.now(),
    cloudinaryUrl: null
  };

  const isDuplicate = savedImages.some(existingImg =>
    existingImg.originalUrl === url ||
    existingImg.storageUrl === url ||
    existingImg.url === url
  );

  if (!isDuplicate) {
    savedImages.unshift(image);
    renderMyImages();
    await saveImagesToFirebase();
  }
}

async function generateImage(prompt, retryCount = 0) {
  const maxRetries = 3;
  const baseDelay = 1000;

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

    await sendImagePrompt(prompt);

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

    const inp = document.getElementById('inp');
    if (inp) {
      inp.value = prompt;
      addBubbleWithThinking('user', prompt);
      addBubble('assistant', errorMsg);
    }
  }
}

async function deleteImage(index) {
  if (!confirm('Are you sure you want to delete this image?')) return;

  try {
    savedImages.splice(index, 1);
    renderMyImages();
    await saveImagesToFirebase();
    toast.success('Image deleted');
  } catch (error) {
    console.error('Error deleting image:', error);
    toast.error('Failed to delete image');
  }
}

async function deleteAllImages() {
  let confirmed;

  const result = confirm('Are you sure you want to delete all your images? This action cannot be undone.');

  if (result instanceof Promise) {
    confirmed = await result;
  } else {
    confirmed = result;
  }

  if (!confirmed) {
    return;
  }

  try {
    savedImages = [];
    renderMyImages();
    await saveImagesToFirebase();
    toast.success('All images deleted');
  } catch (error) {
    console.error('Error deleting all images:', error);
    toast.error('Failed to delete images');
  }
}

async function quickImageSend(prompt) {
  const inp = document.getElementById('imagePromptInp');
  if (inp) inp.value = prompt;
  newChat();
  await sendImagePrompt(prompt);
}

function initImages() {
  const inp = document.getElementById('imagePromptInp');
  const sendBtn = document.getElementById('imgGenSend');
  const deleteAllBtn = document.getElementById('deleteAllImagesBtn');

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

  if (deleteAllBtn) {
    deleteAllBtn.onclick = deleteAllImages;
  }

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