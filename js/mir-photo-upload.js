import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

const MIR_PHOTO_OBJECT_URLS = new Map();
const MIR_PHOTO_PENDING_DATA = new Map();
const MIR_PHOTO_SAVED_IMAGE_DATA = new Map();

const MIR_PHOTO_MAX_DIMENSION = 1200;
const MIR_PHOTO_JPEG_QUALITY = 0.82;
const MIR_PHOTO_CONTENT_TYPE = 'image/jpeg';
const MIR_PHOTO_CROP_ASPECT_RATIO_WIDE = 1200 / 675;
const MIR_PHOTO_CROP_ASPECT_RATIO_TALL = 675 / 1200;

let mirPhotoCropper = null;
let mirPhotoCropSession = null;
let mirPhotoCropModalInitialized = false;
let mirPhotoCropZoomSyncing = false;
let mirPhotoCropZoomRange = { min: 1, max: 1 };
let mirPhotoCropFrameMode = 'wide';

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

async function createOrientedImageDataUrl(file) {
  const { source, width, height, cleanup } = await loadOrientedImageSource(file);
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
  return canvas.toDataURL(MIR_PHOTO_CONTENT_TYPE, 0.92);
}

function getMirPhotoCropModalElements() {
  return {
    modal: document.getElementById('mir-photo-crop-modal'),
    title: document.getElementById('mir-photo-crop-modal-title'),
    image: document.getElementById('mir-photo-crop-image'),
    status: document.getElementById('mir-photo-crop-status'),
    zoom: document.getElementById('mir-photo-crop-zoom'),
    useBtn: document.getElementById('mir-photo-crop-use-btn'),
  };
}

function destroyMirPhotoCropper() {
  if (mirPhotoCropper) {
    mirPhotoCropper.destroy();
    mirPhotoCropper = null;
  }
}

function resetMirPhotoCropImage() {
  const { image } = getMirPhotoCropModalElements();
  if (!image) return;
  image.removeAttribute('src');
  image.removeAttribute('style');
}

function getMirPhotoCropAspectRatio(frameMode = mirPhotoCropFrameMode) {
  return frameMode === 'tall'
    ? MIR_PHOTO_CROP_ASPECT_RATIO_TALL
    : MIR_PHOTO_CROP_ASPECT_RATIO_WIDE;
}

function updateMirPhotoCropFrameButtons(frameMode) {
  document.getElementById('mir-photo-crop-frame-wide')?.classList.toggle(
    'mir-photo-crop-frame-btn-active',
    frameMode === 'wide',
  );
  document.getElementById('mir-photo-crop-frame-tall')?.classList.toggle(
    'mir-photo-crop-frame-btn-active',
    frameMode === 'tall',
  );
}

function setMirPhotoCropFrameMode(frameMode) {
  if (frameMode !== 'wide' && frameMode !== 'tall') return;
  if (mirPhotoCropFrameMode === frameMode) return;

  mirPhotoCropFrameMode = frameMode;
  updateMirPhotoCropFrameButtons(frameMode);

  if (!mirPhotoCropper) return;

  mirPhotoCropper.setAspectRatio(getMirPhotoCropAspectRatio(frameMode));
  initializeMirPhotoCropZoomControls(mirPhotoCropper);
}

function getMirPhotoCropZoomRatio(cropper) {
  const canvasData = cropper.getCanvasData();
  if (!canvasData?.naturalWidth) return 0;
  return canvasData.width / canvasData.naturalWidth;
}

function updateMirPhotoCropZoomSlider(cropper) {
  const { zoom } = getMirPhotoCropModalElements();
  if (!zoom || !cropper) return;

  const { min, max } = mirPhotoCropZoomRange;
  if (max <= min) {
    zoom.value = '0';
    return;
  }

  const ratio = getMirPhotoCropZoomRatio(cropper);
  const percent = Math.round(((ratio - min) / (max - min)) * 100);
  mirPhotoCropZoomSyncing = true;
  zoom.value = String(Math.max(0, Math.min(100, percent)));
  mirPhotoCropZoomSyncing = false;
}

function applyMirPhotoCropZoomFromSlider() {
  if (mirPhotoCropZoomSyncing || !mirPhotoCropper) return;

  const { zoom } = getMirPhotoCropModalElements();
  if (!zoom) return;

  const { min, max } = mirPhotoCropZoomRange;
  const targetRatio = min + ((max - min) * Number(zoom.value)) / 100;

  mirPhotoCropZoomSyncing = true;
  mirPhotoCropper.zoomTo(targetRatio);
  updateMirPhotoCropZoomSlider(mirPhotoCropper);
  mirPhotoCropZoomSyncing = false;
}

function initializeMirPhotoCropZoomControls(cropper) {
  const { zoom } = getMirPhotoCropModalElements();
  if (!zoom) return;

  const initialRatio = getMirPhotoCropZoomRatio(cropper);
  mirPhotoCropZoomRange = {
    min: initialRatio,
    max: initialRatio * 3,
  };
  updateMirPhotoCropZoomSlider(cropper);
}

function closeMirPhotoCropModal() {
  destroyMirPhotoCropper();
  resetMirPhotoCropImage();

  const { modal, status, useBtn, zoom } = getMirPhotoCropModalElements();
  if (status) {
    status.hidden = true;
    status.textContent = 'Preparing image…';
  }
  if (useBtn) useBtn.disabled = true;
  if (zoom) zoom.value = '0';
  mirPhotoCropFrameMode = 'wide';
  updateMirPhotoCropFrameButtons('wide');
  if (modal?.open) modal.close();

  mirPhotoCropSession = null;
}

async function openMirPhotoCropModal(slotEl, slotIndex, file) {
  const slotKey = getMirPhotoSlotKey(slotEl, slotIndex);
  mirPhotoCropSession = { slotEl, slotIndex, file, slotKey };

  const { modal, title, image, status, useBtn } = getMirPhotoCropModalElements();
  if (!modal || !image) {
    mirPhotoCropSession = null;
    throw new Error('MIR photo crop modal is unavailable.');
  }

  title.textContent = `Adjust Photo ${slotKey}`;
  status.hidden = false;
  status.textContent = 'Preparing image…';
  useBtn.disabled = true;
  mirPhotoCropFrameMode = 'wide';
  updateMirPhotoCropFrameButtons('wide');
  destroyMirPhotoCropper();
  resetMirPhotoCropImage();
  modal.showModal();

  try {
    image.src = await createOrientedImageDataUrl(file);
    await new Promise((resolve, reject) => {
      if (image.complete) {
        resolve();
        return;
      }
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load image.'));
    });

    mirPhotoCropper = new Cropper(image, {
      aspectRatio: getMirPhotoCropAspectRatio('wide'),
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      cropBoxMovable: false,
      cropBoxResizable: false,
      toggleDragModeOnDblclick: false,
      guides: true,
      center: true,
      background: true,
      zoomOnWheel: true,
      wheelZoomRatio: 0.08,
      responsive: true,
      restore: false,
      checkOrientation: false,
      ready() {
        initializeMirPhotoCropZoomControls(mirPhotoCropper);
        status.hidden = true;
        useBtn.disabled = false;
      },
      zoom() {
        if (!mirPhotoCropper || mirPhotoCropZoomSyncing) return;
        updateMirPhotoCropZoomSlider(mirPhotoCropper);
      },
    });
  } catch (err) {
    closeMirPhotoCropModal();
    throw err;
  }
}

async function acceptMirPhotoCropSelection() {
  if (!mirPhotoCropSession) return;

  const session = mirPhotoCropSession;
  closeMirPhotoCropModal();

  try {
    const prepared = await prepareMirPhotoFromFile(session.file, session.slotKey);
    setSlotPreviewFromPrepared(session.slotEl, session.slotIndex, prepared);
  } catch (err) {
    console.error(err);
    showSlotError(session.slotEl, 'Failed to prepare image. Please try another file.');
  }
}

function setupMirPhotoCropModal() {
  if (mirPhotoCropModalInitialized) return;
  mirPhotoCropModalInitialized = true;

  const { modal, zoom } = getMirPhotoCropModalElements();
  document.getElementById('mir-photo-crop-cancel-btn')?.addEventListener('click', closeMirPhotoCropModal);
  document.getElementById('mir-photo-crop-modal-close')?.addEventListener('click', closeMirPhotoCropModal);
  document.getElementById('mir-photo-crop-use-btn')?.addEventListener('click', () => {
    void acceptMirPhotoCropSelection();
  });
  zoom?.addEventListener('input', applyMirPhotoCropZoomFromSlider);
  document.getElementById('mir-photo-crop-frame-wide')?.addEventListener('click', () => {
    setMirPhotoCropFrameMode('wide');
  });
  document.getElementById('mir-photo-crop-frame-tall')?.addEventListener('click', () => {
    setMirPhotoCropFrameMode('tall');
  });

  modal?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeMirPhotoCropModal();
  });
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

  try {
    await openMirPhotoCropModal(slotEl, slotIndex, file);
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

  setupMirPhotoCropModal();

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
