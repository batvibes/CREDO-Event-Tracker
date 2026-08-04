const COLORS = {
  navy: [0, 32, 91],
  olive: [52, 63, 29],
  text: [31, 41, 55],
  muted: [100, 116, 139],
  border: [190, 199, 211],
  stripe: [247, 249, 252],
  white: [255, 255, 255],
  completeBg: [223, 244, 230],
  completeText: [2, 122, 72],
  progressBg: [255, 243, 205],
  progressText: [181, 95, 0],
  notStartedBg: [253, 226, 228],
  notStartedText: [180, 35, 24],
};

const PAGE = {
  marginX: 0.42,
  contentBottom: 0.46,
};

function text(value, fallback = 'TBD') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function statusPalette(status) {
  if (status === 'Complete') {
    return { background: COLORS.completeBg, text: COLORS.completeText };
  }
  if (status === 'In Progress') {
    return { background: COLORS.progressBg, text: COLORS.progressText };
  }
  return { background: COLORS.notStartedBg, text: COLORS.notStartedText };
}

const COLUMNS = [
  { key: 'dates', label: 'DATE(S)', width: 0.90, align: 'left' },
  { key: 'eventType', label: 'EVENT TYPE', width: 1.90, align: 'left' },
  { key: 'command', label: 'COMMAND', width: 1.45, align: 'left' },
  { key: 'facilitators', label: 'FACILITATOR(S)', width: 1.75, align: 'left' },
  { key: 'staff', label: 'STAFF', width: 1.65, align: 'left' },
  { key: 'expectedParticipants', label: 'EXPECTED\nPARTICIPANTS', width: 0.95, align: 'center' },
  { key: 'location', label: 'LOCATION', width: 1.70, align: 'left' },
  { key: 'reservation', label: 'RESERVATION', width: 0.95, align: 'center', status: true },
  { key: 'catering', label: 'CATERING', width: 0.90, align: 'center', status: true },
  { key: 'packout', label: 'PACKOUT', width: 0.90, align: 'center', status: true },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);

function drawHeader(pdf, data) {
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFillColor(...COLORS.white);
  pdf.rect(0, 0, pageWidth, 1.45, 'F');

  pdf.setTextColor(...COLORS.navy);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('CREDO', PAGE.marginX, 0.40);

  pdf.setFontSize(9);
  pdf.text('MCI WEST', PAGE.marginX, 0.61);

  pdf.setFontSize(18);
  pdf.text('EVENT SYNC REPORT', pageWidth - PAGE.marginX, 0.42, { align: 'right' });

  pdf.setDrawColor(...COLORS.navy);
  pdf.setLineWidth(0.024);
  pdf.line(PAGE.marginX, 0.77, pageWidth - PAGE.marginX, 0.77);

  pdf.setFillColor(...COLORS.olive);
  pdf.rect(PAGE.marginX, 0.89, TABLE_WIDTH, 0.32, 'F');

  pdf.setTextColor(...COLORS.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.text(text(data.filterSummary, 'All Events'), PAGE.marginX + 0.11, 1.10);

  pdf.setTextColor(...COLORS.muted);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.8);
  pdf.text(`Generated: ${data.generatedAt}`, PAGE.marginX, 1.36);

  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`TOTAL EVENTS: ${data.eventCount}`, pageWidth - 2.75, 1.36);
  pdf.text(
    `EXPECTED PARTICIPANTS: ${data.participantTotal}`,
    pageWidth - PAGE.marginX,
    1.36,
    { align: 'right' }
  );

  return 1.52;
}

function drawTableHeader(pdf, y) {
  const height = 0.48;

  // One continuous navy band prevents partial/blank header rendering.
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(PAGE.marginX, y, TABLE_WIDTH, height, 'F');

  let x = PAGE.marginX;
  pdf.setTextColor(...COLORS.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);

  for (const column of COLUMNS) {
    if (x > PAGE.marginX) {
      pdf.setDrawColor(...COLORS.white);
      pdf.setLineWidth(0.006);
      pdf.line(x, y, x, y + height);
    }

    const lines = column.label.split('\n');
    const textX = column.align === 'center' ? x + column.width / 2 : x + 0.07;
    const textY = lines.length > 1 ? y + 0.15 : y + 0.29;

    pdf.text(lines, textX, textY, {
      align: column.align,
      lineHeightFactor: 1.0,
    });

    x += column.width;
  }

  return y + height;
}

function wrapCell(pdf, value, width) {
  return pdf.splitTextToSize(text(value), Math.max(width - 0.14, 0.1));
}

function rowHeight(pdf, row) {
  let maxLines = 1;
  for (const column of COLUMNS) {
    if (column.status) continue;
    maxLines = Math.max(maxLines, wrapCell(pdf, row[column.key], column.width).length);
  }
  return Math.max(0.38, 0.14 + maxLines * 0.13);
}

function drawStatusCell(pdf, x, y, width, height, value) {
  const status = text(value, 'Not Started');
  const palette = statusPalette(status);

  pdf.setFillColor(...COLORS.white);
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.006);
  pdf.rect(x, y, width, height, 'FD');

  const pillWidth = Math.min(width - 0.12, 0.76);
  const pillHeight = 0.21;
  const pillX = x + (width - pillWidth) / 2;
  const pillY = y + (height - pillHeight) / 2;

  pdf.setFillColor(...palette.background);
  pdf.roundedRect(pillX, pillY, pillWidth, pillHeight, 0.03, 0.03, 'F');

  pdf.setTextColor(...palette.text);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(5.7);
  pdf.text(status, x + width / 2, pillY + 0.14, { align: 'center' });
}

function drawRow(pdf, row, y, index) {
  const height = rowHeight(pdf, row);
  let x = PAGE.marginX;

  for (const column of COLUMNS) {
    if (column.status) {
      drawStatusCell(pdf, x, y, column.width, height, row[column.key]);
      x += column.width;
      continue;
    }

    pdf.setFillColor(...(index % 2 === 0 ? COLORS.white : COLORS.stripe));
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.006);
    pdf.rect(x, y, column.width, height, 'FD');

    const lines = wrapCell(pdf, row[column.key], column.width);
    const textX = column.align === 'center' ? x + column.width / 2 : x + 0.07;

    pdf.setTextColor(...COLORS.text);
    pdf.setFont(
      'helvetica',
      column.key === 'dates' || column.key === 'eventType' ? 'bold' : 'normal'
    );
    pdf.setFontSize(6.35);
    pdf.text(lines, textX, y + 0.12, {
      align: column.align,
      lineHeightFactor: 1.06,
      baseline: 'top',
    });

    x += column.width;
  }

  return height;
}

function drawFooter(pdf, filterSummary, totalPages) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageNumber = pdf.internal.getCurrentPageInfo().pageNumber;

  pdf.setDrawColor(...COLORS.navy);
  pdf.setLineWidth(0.016);
  pdf.line(PAGE.marginX, pageHeight - 0.33, pageWidth - PAGE.marginX, pageHeight - 0.33);

  pdf.setTextColor(...COLORS.navy);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.7);
  pdf.text('CREDO MCI WEST', PAGE.marginX, pageHeight - 0.17);

  pdf.setTextColor(...COLORS.muted);
  pdf.setFont('helvetica', 'normal');
  pdf.text(text(filterSummary, 'All Events'), pageWidth / 2, pageHeight - 0.17, {
    align: 'center',
  });

  pdf.setTextColor(...COLORS.navy);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - PAGE.marginX, pageHeight - 0.17, {
    align: 'right',
  });
}

export async function exportEventSyncReportPdf({ rows, filterSummary = 'All Events' }) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'in',
    format: 'legal',
    compress: true,
  });

  const pageHeight = pdf.internal.pageSize.getHeight();
  const generatedAt = new Date().toLocaleString('en-US');
  const participantTotal = rows.reduce(
    (sum, row) => sum + (Number(row.expectedParticipants) || 0),
    0
  );

  const headerData = {
    filterSummary,
    generatedAt,
    eventCount: rows.length,
    participantTotal,
  };

  let y = drawHeader(pdf, headerData);
  y = drawTableHeader(pdf, y);

  rows.forEach((row, index) => {
    const height = rowHeight(pdf, row);

    if (y + height > pageHeight - PAGE.contentBottom) {
      pdf.addPage();
      y = drawHeader(pdf, headerData);
      y = drawTableHeader(pdf, y);
    }

    y += drawRow(pdf, row, y, index);
  });

  const totalPages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    drawFooter(pdf, filterSummary, totalPages);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  pdf.save(`CREDO_Event_Sync_Report_${stamp}.pdf`);
}
