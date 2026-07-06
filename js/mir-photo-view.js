const MIR_OPEN_PHOTO_SLOT_KEYS = ['1', '2', '3'];

function normalizeViewPhoto(slotData) {
  const imageData = slotData?.imageData;
  if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
    return null;
  }

  return {
    imageData,
    eventTitle: slotData.eventTitle ?? '',
    caption: slotData.caption ?? '',
  };
}

function createOpenPhotoPlaceholder(slotKey) {
  const area = document.createElement('div');
  area.className = 'mir-open-photo-upload-area';
  area.innerHTML = `
    <div class="mir-open-photo-placeholder" aria-hidden="true">
      <span class="mir-open-photo-placeholder-icon">+</span>
      <span class="mir-open-photo-placeholder-text">Upload image</span>
    </div>
  `;
  area.setAttribute('aria-label', `Photo ${slotKey} empty`);
  return area;
}

function createOpenPhotoImageArea(slotKey, photo) {
  const area = document.createElement('div');
  area.className = 'mir-open-photo-upload-area mir-open-photo-has-image';

  const img = document.createElement('img');
  img.className = 'mir-open-photo-img';
  img.alt = `Photo ${slotKey} preview`;
  img.src = photo.imageData;

  area.appendChild(img);
  return area;
}

function createOpenPhotoField(label, value, caption = false) {
  const field = document.createElement('div');
  field.className = 'mir-open-photo-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'mir-photo-field-label';
  labelEl.textContent = label;

  const textEl = document.createElement('p');
  textEl.className = caption ? 'mir-open-photo-text mir-open-photo-caption' : 'mir-open-photo-text';
  textEl.textContent = value;

  field.append(labelEl, textEl);
  return field;
}

function createOpenPhotoSlot(slotKey, slotData = {}) {
  const slot = document.createElement('div');
  slot.className = 'mir-open-photo-slot';
  slot.dataset.photoIndex = slotKey;

  const photo = normalizeViewPhoto(slotData);
  slot.append(
    photo ? createOpenPhotoImageArea(slotKey, photo) : createOpenPhotoPlaceholder(slotKey),
    createOpenPhotoField('Event Title', photo?.eventTitle ?? slotData.eventTitle ?? ''),
    createOpenPhotoField('Caption', photo?.caption ?? slotData.caption ?? '', true),
  );

  if (photo) {
    slot.classList.add('has-photo');
  }

  return slot;
}

export function clearMirOpenPhotoSection(container) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (root) {
    root.replaceChildren();
  }
}

export function renderMirOpenPhotoSection(container, photos = {}) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) return;

  root.replaceChildren();
  MIR_OPEN_PHOTO_SLOT_KEYS.forEach((slotKey) => {
    root.appendChild(createOpenPhotoSlot(slotKey, photos?.[slotKey] ?? {}));
  });
}
