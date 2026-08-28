export const COLORS = {
  navy: [0, 32, 91],
  text: [17, 24, 39],
  secondary: [107, 114, 128],
  muted: [156, 163, 175],
  border: [229, 231, 235],
  divider: [209, 213, 219],
  stripe: [247, 249, 252],
  white: [255, 255, 255],
  plotLine: [229, 231, 235],
  axis: [209, 213, 219],
  current: [0, 32, 91],
  compare: [156, 163, 175],
  up: [52, 92, 58],
  down: [107, 83, 68],
  neutral: [107, 114, 128],
};

export const PAGE = {
  marginX: 0.55,
  contentBottom: 0.48,
};

export function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

export function pdfSafeText(value, fallback = '') {
  return text(value, fallback)
    .replace(/≈/g, '~')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '-')
    .replace(/[↑↓]/g, '');
}

export function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) return COLORS.navy;
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
}

export function formatLocalStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatGeneratedAt(date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildTrendsReportFilename(slug, date = new Date()) {
  return `CREDO_${slug}_Report_${formatLocalStamp(date)}.pdf`;
}

export async function loadLogoDataUrl() {
  const candidates = [
    () => new URL('../assets/credo-logo.jpg', import.meta.url).href,
    () => '/assets/credo-logo.jpg',
  ];
  for (const getUrl of candidates) {
    try {
      const response = await fetch(getUrl());
      if (!response.ok) continue;
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) return dataUrl;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export function comparisonPalette(direction) {
  if (direction === 'up') return COLORS.up;
  if (direction === 'down') return COLORS.down;
  return COLORS.neutral;
}

export function drawComparisonMarker(pdf, x, y, direction, color) {
  if (direction !== 'up' && direction !== 'down') return x;
  const size = 0.07;
  pdf.setFillColor(...color);
  if (direction === 'up') {
    pdf.triangle(x, y + 0.02, x + size / 2, y - size + 0.02, x + size, y + 0.02, 'F');
  } else {
    pdf.triangle(x, y - size + 0.04, x + size / 2, y + 0.04, x + size, y - size + 0.04, 'F');
  }
  return x + size + 0.05;
}

export function stripComparisonArrow(value) {
  return pdfSafeText(String(value || '').replace(/^[↑↓]\s*/, ''));
}

export function drawFooter(pdf, generatedAt, totalPages) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageNumber = pdf.internal.getCurrentPageInfo().pageNumber;

  pdf.setDrawColor(...COLORS.navy);
  pdf.setLineWidth(0.012);
  pdf.line(PAGE.marginX, pageHeight - 0.34, pageWidth - PAGE.marginX, pageHeight - 0.34);

  pdf.setTextColor(...COLORS.navy);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('CREDO Event Tracker', PAGE.marginX, pageHeight - 0.18);

  pdf.setTextColor(...COLORS.muted);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated ${generatedAt}`, pageWidth / 2, pageHeight - 0.18, { align: 'center' });

  if (totalPages > 1) {
    pdf.setTextColor(...COLORS.navy);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - PAGE.marginX, pageHeight - 0.18, {
      align: 'right',
    });
  }
}

export function drawReportHeader(pdf, meta, { compact = false, logoDataUrl = null } = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  const reportTitle = text(meta.reportTitle, 'Trends Report');
  let y = 0.42;

  if (compact) {
    pdf.setTextColor(...COLORS.navy);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('CREDO EVENT TRACKER', PAGE.marginX, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.secondary);
    pdf.setFontSize(8);
    const titleLines = pdf.splitTextToSize(pdfSafeText(reportTitle), contentWidth - 1.8);
    pdf.text(titleLines[0] || reportTitle, PAGE.marginX + 1.72, y);
    pdf.setDrawColor(...COLORS.navy);
    pdf.setLineWidth(0.012);
    pdf.line(PAGE.marginX, y + 0.12, pageWidth - PAGE.marginX, y + 0.12);
    return y + 0.28;
  }

  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, 'JPEG', PAGE.marginX, 0.28, 0.42, 0.42);
    } catch {
      // Skip logo if embedding fails.
    }
  }

  const textX = logoDataUrl ? PAGE.marginX + 0.52 : PAGE.marginX;
  pdf.setTextColor(...COLORS.navy);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('CREDO EVENT TRACKER', textX, y);

  pdf.setFontSize(16);
  const titleLines = pdf.splitTextToSize(pdfSafeText(reportTitle), contentWidth - (logoDataUrl ? 0.52 : 0));
  pdf.text(titleLines, textX, y + 0.28);
  y += 0.28 + Math.max(0.2, titleLines.length * 0.2);

  pdf.setDrawColor(...COLORS.navy);
  pdf.setLineWidth(0.018);
  pdf.line(PAGE.marginX, y, pageWidth - PAGE.marginX, y);

  y += 0.22;
  const metaItems = (meta.metaItems || []).filter((item) => item?.[0]);
  if (!metaItems.length) return y + 0.08;

  const colWidth = contentWidth / metaItems.length;
  let metaHeight = 0.28;
  metaItems.forEach((item) => {
    const lines = pdf.splitTextToSize(pdfSafeText(item[1], '-'), colWidth - 0.16);
    metaHeight = Math.max(metaHeight, 0.16 + lines.length * 0.13);
  });
  metaItems.forEach((item, index) => {
    const x = PAGE.marginX + index * colWidth;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLORS.muted);
    pdf.text(String(item[0]).toUpperCase(), x, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.text);
    const lines = pdf.splitTextToSize(pdfSafeText(item[1], '-'), colWidth - 0.16);
    pdf.text(lines, x, y + 0.16);
  });

  return y + metaHeight + 0.14;
}

export function drawSectionLabel(pdf, y, label) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.muted);
  pdf.text(pdfSafeText(label).toUpperCase(), PAGE.marginX, y);
  return y + 0.14;
}

export function drawNote(pdf, y, note) {
  if (!note) return y;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7.4);
  pdf.setTextColor(...COLORS.secondary);
  const lines = pdf.splitTextToSize(pdfSafeText(note), contentWidth);
  pdf.text(lines, PAGE.marginX, y);
  return y + lines.length * 0.12 + 0.08;
}

export function drawParagraph(pdf, y, paragraph, { fontSize = 8.5, color = COLORS.text, bold = false } = {}) {
  if (!paragraph) return y;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(fontSize);
  pdf.setTextColor(...color);
  const lines = pdf.splitTextToSize(pdfSafeText(paragraph), contentWidth);
  pdf.text(lines, PAGE.marginX, y);
  return y + lines.length * (fontSize * 0.0155) + 0.08;
}

export function drawKpiCards(pdf, y, kpis, sectionLabel = 'KPI SUMMARY') {
  if (!kpis?.length) return y;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  const gap = 0.08;
  const count = kpis.length;
  const cardWidth = (contentWidth - gap * (count - 1)) / count;
  let cardHeight = 0.92;

  kpis.forEach((kpi) => {
    const comparison = stripComparisonArrow(kpi.comparisonText);
    const lines = comparison ? pdf.splitTextToSize(comparison, cardWidth - 0.16) : [];
    cardHeight = Math.max(cardHeight, 0.72 + lines.length * 0.12);
  });

  y = drawSectionLabel(pdf, y, sectionLabel);

  kpis.forEach((kpi, index) => {
    const x = PAGE.marginX + index * (cardWidth + gap);
    pdf.setFillColor(...COLORS.stripe);
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.008);
    pdf.roundedRect(x, y, cardWidth, cardHeight, 0.04, 0.04, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.6);
    pdf.setTextColor(...COLORS.secondary);
    const labelLines = pdf.splitTextToSize(pdfSafeText(kpi.label), cardWidth - 0.16);
    pdf.text(labelLines, x + 0.08, y + 0.16);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.5);
    pdf.setTextColor(...COLORS.navy);
    const valueY = y + 0.16 + labelLines.length * 0.11 + 0.16;
    pdf.text(pdfSafeText(kpi.value, '-'), x + 0.08, valueY);

    if (kpi.comparisonText && kpi.comparisonText !== 'No comparison') {
      const color = comparisonPalette(kpi.comparisonDirection);
      const rest = stripComparisonArrow(kpi.comparisonText);
      const lines = pdf.splitTextToSize(rest, cardWidth - 0.24);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.4);
      pdf.setTextColor(...color);
      const textX = drawComparisonMarker(pdf, x + 0.08, valueY + 0.16, kpi.comparisonDirection, color);
      pdf.text(lines, textX, valueY + 0.16);
    }
  });

  return y + cardHeight + 0.18;
}

export function drawMetaGrid(pdf, y, sectionLabel, items) {
  const usable = (items || []).filter((item) => item?.[0]);
  if (!usable.length) return y;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  y = drawSectionLabel(pdf, y, sectionLabel);

  const colWidth = (contentWidth - 0.18) / 2;
  const rows = [];
  for (let i = 0; i < usable.length; i += 2) {
    rows.push([usable[i], usable[i + 1]].filter(Boolean));
  }

  let blockHeight = 0.08;
  rows.forEach((row) => {
    let rowHeight = 0.28;
    row.forEach((item) => {
      const lines = pdf.splitTextToSize(pdfSafeText(item[1], '-'), colWidth - 0.08);
      rowHeight = Math.max(rowHeight, 0.16 + lines.length * 0.13);
    });
    blockHeight += rowHeight;
  });

  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.008);
  pdf.roundedRect(PAGE.marginX, y, contentWidth, blockHeight, 0.04, 0.04, 'S');

  let rowY = y + 0.16;
  rows.forEach((row) => {
    let rowHeight = 0.28;
    row.forEach((item, col) => {
      const x = PAGE.marginX + 0.1 + col * (colWidth + 0.08);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.6);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(String(item[0]).toUpperCase(), x, rowY);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.text);
      const lines = pdf.splitTextToSize(pdfSafeText(item[1], '-'), colWidth - 0.08);
      pdf.text(lines, x, rowY + 0.14);
      rowHeight = Math.max(rowHeight, 0.16 + lines.length * 0.13);
    });
    rowY += rowHeight;
  });

  return rowY + 0.12;
}

export function drawSummaryLines(pdf, y, lines) {
  const usable = (lines || []).filter(Boolean);
  if (!usable.length) return y;
  usable.forEach((line, index) => {
    y = drawParagraph(pdf, y, line, {
      fontSize: index === 0 ? 10 : 8.5,
      bold: index === 0,
      color: index === 0 ? COLORS.navy : COLORS.text,
    });
  });
  return y + 0.02;
}

export async function createTrendsReportDocument({
  reportTitle,
  metaItems = [],
  generatedAtDate = new Date(),
} = {}) {
  const generatedAt = formatGeneratedAt(generatedAtDate);
  const [{ jsPDF }, logoDataUrl] = await Promise.all([
    import('jspdf'),
    loadLogoDataUrl(),
  ]);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  const headerMeta = {
    reportTitle,
    metaItems: [
      ...metaItems,
      ['Generated', generatedAt],
    ].slice(0, 4),
  };

  const ctx = {
    pdf,
    pageWidth,
    pageHeight,
    contentWidth,
    generatedAt,
    generatedAtDate,
    logoDataUrl,
    y: 0,
  };

  const startPage = (compact) => drawReportHeader(pdf, headerMeta, { compact, logoDataUrl });
  ctx.y = startPage(false);

  ctx.ensureSpace = (height) => {
    if (ctx.y + height <= pageHeight - PAGE.contentBottom) return;
    pdf.addPage();
    ctx.y = startPage(true);
  };

  ctx.finish = (filename) => {
    const totalPages = pdf.internal.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      drawFooter(pdf, generatedAt, totalPages);
    }
    pdf.save(filename);
  };

  return ctx;
}
