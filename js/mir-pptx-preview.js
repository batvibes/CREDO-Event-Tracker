import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';

let activePreview = null;

function getContainer(container) {
  if (container instanceof HTMLElement) return container;
  if (typeof container === 'string') return document.querySelector(container);
  return null;
}

export function destroyMirPresentationPreview(container) {
  const root = getContainer(container);
  if (activePreview?.viewer) {
    activePreview.viewer.destroy();
  }
  if (root) {
    root.innerHTML = '';
  }
  activePreview = null;
}

export async function renderMirPresentationPreview(container, pptxBlob) {
  const root = getContainer(container);
  if (!root || !pptxBlob) return;

  destroyMirPresentationPreview(root);
  root.innerHTML = '<p class="mir-pptx-preview-status">Loading presentation…</p>';

  try {
    const arrayBuffer = await pptxBlob.arrayBuffer();
    const viewer = await PptxViewer.open(arrayBuffer, root, {
      fitMode: 'contain',
      zoomPercent: 100,
      zipLimits: RECOMMENDED_ZIP_LIMITS,
      scrollContainer: root,
      renderMode: 'list',
      listOptions: {
        windowed: false,
        showSlideLabels: false,
      },
    });

    activePreview = { container: root, viewer };
  } catch (err) {
    console.error(err);
    root.innerHTML =
      '<p class="mir-pptx-preview-status mir-pptx-preview-error">Failed to load presentation preview.</p>';
    activePreview = null;
    throw err;
  }
}
