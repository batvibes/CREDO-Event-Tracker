function sanitizeFilenamePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\s\W]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function buildAarPdfFilename(sequenceNumber, eventType) {
  const sequence = sanitizeFilenamePart(sequenceNumber) || 'unknown';
  const type = sanitizeFilenamePart(eventType) || 'event';
  return `AAR_${sequence}_${type}.pdf`;
}

function waitForImages(element) {
  const images = [...element.querySelectorAll('img')];
  return Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );
}

async function renderReportPdf(reportElement, filename) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  await waitForImages(reportElement);

  const canvas = await html2canvas(reportElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgData = canvas.toDataURL('image/png');
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

export async function exportAarReportElementToPdf(reportElement, { filename }) {
  if (!reportElement?.classList?.contains('aar-report')) {
    throw new Error('AAR report content not found for export.');
  }

  await renderReportPdf(reportElement, filename);
}

export async function exportAarPreviewToPdf(previewCanvas, { filename }) {
  if (!previewCanvas) {
    throw new Error('AAR preview canvas not found.');
  }

  const report = previewCanvas.querySelector('.aar-report');
  if (!report) {
    throw new Error('AAR preview report is empty.');
  }

  await exportAarReportElementToPdf(report, { filename });
}
