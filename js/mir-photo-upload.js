const MIR_PHOTO_OBJECT_URLS = new Map();
const MIR_PHOTO_PENDING_DATA = new Map();
const MIR_PHOTO_SAVED_IMAGE_DATA = new Map();

const MIR_PHOTO_MAX_DIMENSION = 1200;
const MIR_PHOTO_JPEG_QUALITY = 0.82;
const MIR_PHOTO_CONTENT_TYPE = 'image/jpeg';

function isImageFile(file) {
  return Boolean(file && typeof file.type === 'string' && file.type.startsWith('image/'));
}

function getMirPhotoSlots() {
  return [...document.querySelectorAll('#mir-draft-view .mir-photo-slot')];
}

function getSlotElements(slotEl) {
  return {
    fileInput: slotEl.querySelector('.mir-photo-file-input'),
    uploadPrompt: slotEl.querySelector('.mir-photo-upload-prompt'),
    previewWrap: slotEl.querySelector('.mir-photo-preview'),
    previewImg: slotEl.querySelector('.mir-photo-preview-img'),
    replaceBtn: slotEl.querySelector('.mir-photo-replace-btn'),
    titleInput: slotEl.querySelector('.mir-photo-title-input'),
    captionInput: slotEl.querySelector('.mir-photo-caption-input'),
    errorEl: slotEl.querySelector('.mir-photo-error'),
  };
}

function getMirPhotoSlotKey(slotEl, slotIndex) {
  return String(slotEl.dataset.photoIndex ?? slotIndex + 1);
}

function estimateBase64DataBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] ?? '';
  return Math.round(base64.length * 0.75);
}

function normalizePreparedPhoto(slotData) {
  const imageData = slotData?.imageData;
  if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
    return null;
  }

  return {
    imageData,
    contentType: slotData.contentType ?? MIR_PHOTO_CONTENT_TYPE,
    width: Number.isFinite(Number(slotData.width)) ? Number(slotData.width) : null,
    height: Number.isFinite(Number(slotData.height)) ? Number(slotData.height) : null,
  };
}

function copyPreparedPhotoEntry(prepared) {
  return {
    imageData: prepared.imageData,
    contentType: prepared.contentType ?? MIR_PHOTO_CONTENT_TYPE,
    width: prepared.width,
    height: prepared.height,
  };
}

function appendPreparedPhotoFields(entry, prepared) {
  entry.imageData = prepared.imageData;
  entry.contentType = prepared.contentType ?? MIR_PHOTO_CONTENT_TYPE;
  if (Number.isFinite(prepared.width)) entry.width = prepared.width;
  if (Number.isFinite(prepared.height)) entry.height = prepared.height;
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image.'));
    };

    img.src = objectUrl;
  });
}

async function loadOrientedImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to Image rendering below.
    }
  }

  const img = await loadImageElementFromFile(file);
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    cleanup: () => {},
  };
}

function scaleMirPhotoDimensions(width, height) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const scale = Math.min(1, MIR_PHOTO_MAX_DIMENSION / Math.max(safeWidth, safeHeight));

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

async function prepareMirPhotoFromFile(file, slotKey) {
  const { source, width: sourceWidth, height: sourceHeight, cleanup } = await loadOrientedImageSource(file);
  const { width, height } = scaleMirPhotoDimensions(sourceWidth, sourceHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    cleanup();
    throw new Error('Canvas is unavailable.');
  }

  context.drawImage(source, 0, 0, width, height);
  cleanup();

  const imageData = canvas.toDataURL(MIR_PHOTO_CONTENT_TYPE, MIR_PHOTO_JPEG_QUALITY);
  const prepared = {
    imageData,
    contentType: MIR_PHOTO_CONTENT_TYPE,
    width,
    height,
  };

  console.log(
    '[MIR photo prepared]',
    slotKey,
    prepared.contentType,
    prepared.width,
    prepared.height,
    estimateBase64DataBytes(prepared.imageData),
  );

  return prepared;
}

function revokeSlotObjectUrl(slotIndex) {
  const url = MIR_PHOTO_OBJECT_URLS.get(slotIndex);
  if (!url) return;
  URL.revokeObjectURL(url);
  MIR_PHOTO_OBJECT_URLS.delete(slotIndex);
}

function hideSlotError(slotEl) {
  const { errorEl } = getSlotElements(slotEl);
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function showSlotError(slotEl, message) {
  const { errorEl } = getSlotElements(slotEl);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function setSlotPreviewFromDataUrl(slotEl, slotIndex, dataUrl) {
  const { previewWrap, previewImg } = getSlotElements(slotEl);

  revokeSlotObjectUrl(slotIndex);
  previewImg.src = dataUrl;
  previewImg.alt = 'Photo preview';
  previewWrap.hidden = false;
  slotEl.classList.add('has-photo');
}

function setSlotPreviewFromPrepared(slotEl, slotIndex, prepared) {
  MIR_PHOTO_PENDING_DATA.set(slotIndex, copyPreparedPhotoEntry(prepared));
  MIR_PHOTO_SAVED_IMAGE_DATA.delete(slotIndex);
  setSlotPreviewFromDataUrl(slotEl, slotIndex, prepared.imageData);
}

function clearMirPhotoSlot(slotEl, slotIndex) {
  MIR_PHOTO_PENDING_DATA.delete(slotIndex);
  MIR_PHOTO_SAVED_IMAGE_DATA.delete(slotIndex);

  const {
    fileInput,
    previewWrap,
    previewImg,
    titleInput,
    captionInput,
  } = getSlotElements(slotEl);

  revokeSlotObjectUrl(slotIndex);
  previewImg.removeAttribute('src');
  previewImg.alt = 'Photo preview';
  previewWrap.hidden = true;
  slotEl.classList.remove('has-photo');

  if (fileInput) fileInput.value = '';
  if (titleInput) titleInput.value = '';
  if (captionInput) captionInput.value = '';
  hideSlotError(slotEl);
}

async function handleFileSelected(slotEl, slotIndex, file) {
  if (!file) return;

  if (!isImageFile(file)) {
    showSlotError(slotEl, 'Please select an image file (JPEG, PNG, GIF, or WebP).');
    return;
  }

  hideSlotError(slotEl);

  const slotKey = getMirPhotoSlotKey(slotEl, slotIndex);

  try {
    const prepared = await prepareMirPhotoFromFile(file, slotKey);
    setSlotPreviewFromPrepared(slotEl, slotIndex, prepared);
  } catch (err) {
    console.error(err);
    showSlotError(slotEl, 'Failed to prepare image. Please try another file.');
  }
}

function openMirPhotoFilePicker(slotEl) {
  getSlotElements(slotEl).fileInput?.click();
}

let mirPhotoUploadsInitialized = false;

export function setupMirPhotoUploads() {
  if (mirPhotoUploadsInitialized) return;
  mirPhotoUploadsInitialized = true;

  getMirPhotoSlots().forEach((slotEl, slotIndex) => {
    const { fileInput, uploadPrompt, replaceBtn } = getSlotElements(slotEl);

    uploadPrompt?.addEventListener('click', () => {
      openMirPhotoFilePicker(slotEl);
    });

    replaceBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      openMirPhotoFilePicker(slotEl);
    });

    fileInput?.addEventListener('change', () => {
      void handleFileSelected(slotEl, slotIndex, fileInput.files?.[0] ?? null);
      fileInput.value = '';
    });
  });
}

export function clearMirPhotoSlots() {
  getMirPhotoSlots().forEach((slotEl, slotIndex) => {
    clearMirPhotoSlot(slotEl, slotIndex);
  });
}

export async function getMirPhotosForSave() {
  const photos = {};
  const slots = getMirPhotoSlots();

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slotEl = slots[slotIndex];
    const slotKey = getMirPhotoSlotKey(slotEl, slotIndex);
    const { titleInput, captionInput } = getSlotElements(slotEl);

    const entry = {
      eventTitle: titleInput?.value ?? '',
      caption: captionInput?.value ?? '',
    };

    const pending = MIR_PHOTO_PENDING_DATA.get(slotIndex);
    if (pending) {
      appendPreparedPhotoFields(entry, pending);
    } else if (MIR_PHOTO_SAVED_IMAGE_DATA.has(slotIndex)) {
      appendPreparedPhotoFields(entry, MIR_PHOTO_SAVED_IMAGE_DATA.get(slotIndex));
    }

    photos[slotKey] = entry;
  }

  return photos;
}

export function applyMirPhotoSlots(photos = {}) {
  getMirPhotoSlots().forEach((slotEl, slotIndex) => {
    clearMirPhotoSlot(slotEl, slotIndex);

    const slotKey = getMirPhotoSlotKey(slotEl, slotIndex);
    const slotData = photos?.[slotKey] ?? {};
    const { titleInput, captionInput } = getSlotElements(slotEl);

    if (titleInput) titleInput.value = slotData.eventTitle ?? '';
    if (captionInput) captionInput.value = slotData.caption ?? '';

    const prepared = normalizePreparedPhoto(slotData);
    if (prepared) {
      MIR_PHOTO_SAVED_IMAGE_DATA.set(slotIndex, prepared);
      MIR_PHOTO_PENDING_DATA.delete(slotIndex);
      setSlotPreviewFromDataUrl(slotEl, slotIndex, prepared.imageData);
    }
  });
}
