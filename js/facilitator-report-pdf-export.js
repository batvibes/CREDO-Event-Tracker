import {
  FACILITATOR_EMPTY_EXPERIENCE,
  FACILITATOR_EMPTY_QUALIFICATIONS,
  FACILITATOR_EMPTY_T4T_EXPERIENCE,
  FACILITATOR_EXPERIENCE_HEADING,
  FACILITATOR_QUALIFICATIONS_HEADING,
  FACILITATOR_T4T_COMPLETION_HEADING,
  FACILITATOR_T4T_EXPERIENCE_HEADING,
  facilitationExperiencePresentation,
  facilitatorQualificationDisplayFields,
  facilitatorT4tCompletionDisplayFields,
  formatRecordedFacilitationDate,
  presentQualificationFollowUp,
} from './facilitator-management.js';
import { formatGeneratedAt, pdfSafeText } from './trends-report-pdf-shared.js';

const COLORS = {
  navy: [0, 32, 91],
  text: [31, 41, 55],
  secondary: [71, 85, 105],
  muted: [100, 116, 139],
  border: [203, 213, 225],
  stripe: [247, 249, 252],
  white: [255, 255, 255],
};

const PAGE = {
  marginX: 0.48,
  contentBottom: 0.46,
};

const BODY_SIZE = 8;
const HEADER_SIZE = 7;

export function sanitizeFacilitatorPdfSlug(value) {
  const cleaned = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
  return cleaned || 'Facilitators';
}

export function buildFacilitatorPdfFilename(label) {
  return `CREDO_${sanitizeFacilitatorPdfSlug(label)}.pdf`;
}

function displayValue(value) {
  const text = pdfSafeText(value, '');
  return text || '-';
}

function pageLimit(pdf) {
  return pdf.internal.pageSize.getHeight() - PAGE.contentBottom;
}

function contentWidth(pdf) {
  return pdf.internal.pageSize.getWidth() - PAGE.marginX * 2;
}

function drawFooter(pdf, pageNumber, totalPages) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const y = pageHeight - 0.26;
  pdf.setDrawColor(...COLORS.navy);
  pdf.setLineWidth(0.012);
  pdf.line(PAGE.marginX, pageHeight - 0.38, pageWidth - PAGE.marginX, pageHeight - 0.38);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLORS.navy);
  pdf.text('CREDO MCI West', PAGE.marginX, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - PAGE.marginX, y, { align: 'right' });
}

function drawBanner(pdf, { title, subtitle, scopeLines, compact }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const usable = contentWidth(pdf);
  let y = 0.4;

  pdf.setTextColor(...COLORS.navy);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('CREDO', PAGE.marginX, y);
  pdf.setFontSize(8);
  pdf.text('MCI WEST', PAGE.marginX, y + 0.15);

  const titleWidth = usable - 1.7;
  pdf.setFontSize(compact ? 9 : 13);
  const titleLines = pdf.splitTextToSize(pdfSafeText(title, 'Facilitator Report'), titleWidth);
  pdf.text(titleLines, pageWidth - PAGE.marginX, y, { align: 'right' });
  y += Math.max(0.32, titleLines.length * (compact ? 0.14 : 0.18));

  if (!compact && subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.secondary);
    const subtitleLines = pdf.splitTextToSize(pdfSafeText(subtitle), titleWidth);
    pdf.text(subtitleLines, pageWidth - PAGE.marginX, y, { align: 'right' });
    y += subtitleLines.length * 0.16;
  }

  pdf.setDrawColor(...COLORS.navy);
  pdf.setLineWidth(0.016);
  pdf.line(PAGE.marginX, y, pageWidth - PAGE.marginX, y);
  y += 0.16;

  if (!compact) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.muted);
    pdf.text(`Generated ${formatGeneratedAt(new Date())}`, PAGE.marginX, y);
    y += 0.16;
  }

  const activeScope = scopeLines.filter((line) => pdfSafeText(line, ''));
  if (!compact && activeScope.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.text);
    for (const line of activeScope) {
      const wrapped = pdf.splitTextToSize(pdfSafeText(line), usable);
      pdf.text(wrapped, PAGE.marginX, y);
      y += wrapped.length * 0.14;
    }
    y += 0.06;
  }

  return y;
}

function layoutColumns(pdf, columns) {
  const usable = contentWidth(pdf);
  const weight = columns.reduce((sum, column) => sum + column.weight, 0);
  let x = PAGE.marginX;
  return columns.map((column) => {
    const width = usable * (column.weight / weight);
    const laid = { ...column, x, width };
    x += width;
    return laid;
  });
}

function headerHeight(pdf, columns) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(HEADER_SIZE);
  let lines = 1;
  for (const column of columns) {
    column.headerLines = pdf.splitTextToSize(column.label.toUpperCase(), Math.max(column.width - 0.1, 0.3));
    lines = Math.max(lines, column.headerLines.length);
  }
  return Math.max(0.3, 0.1 + lines * 0.12);
}

function drawTableHeader(pdf, y, columns) {
  const height = headerHeight(pdf, columns);
  const width = contentWidth(pdf);
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(PAGE.marginX, y, width, height, 'F');
  pdf.setTextColor(...COLORS.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(HEADER_SIZE);
  for (const column of columns) {
    const textX = column.align === 'right' ? column.x + column.width - 0.05 : column.x + 0.05;
    pdf.text(column.headerLines, textX, y + 0.14, {
      align: column.align === 'right' ? 'right' : 'left',
      lineHeightFactor: 1.05,
    });
  }
  return y + height;
}

function rowMetrics(pdf, columns, row) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(BODY_SIZE);
  const lines = columns.map((column) => {
    const wrapped = pdf.splitTextToSize(
      displayValue(row?.[column.key]),
      Math.max(column.width - 0.1, 0.3),
    );
    return wrapped.length ? wrapped : ['-'];
  });
  const lineCount = Math.max(...lines.map((entry) => entry.length), 1);
  return {
    lines,
    height: Math.max(0.28, 0.08 + lineCount * 0.13),
  };
}

function drawTableRow(pdf, y, columns, metrics, shaded) {
  const width = contentWidth(pdf);
  pdf.setFillColor(...(shaded ? COLORS.stripe : COLORS.white));
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.006);
  pdf.rect(PAGE.marginX, y, width, metrics.height, 'FD');
  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(BODY_SIZE);
  columns.forEach((column, index) => {
    const textX = column.align === 'right' ? column.x + column.width - 0.05 : column.x + 0.05;
    pdf.text(metrics.lines[index], textX, y + 0.16, {
      align: column.align === 'right' ? 'right' : 'left',
      lineHeightFactor: 1.05,
    });
  });
}

async function openPdf(orientation) {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({
    orientation,
    unit: 'in',
    format: 'letter',
    compress: true,
  });
}

function finishPdf(pdf, filename) {
  const totalPages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    drawFooter(pdf, page, totalPages);
  }
  pdf.save(filename);
}

export async function exportFacilitatorTablePdf({
  title,
  subtitle = '',
  scopeLines = [],
  columns,
  rows,
  filename,
  orientation = 'landscape',
} = {}) {
  const pdf = await openPdf(orientation);
  const banner = { title, subtitle, scopeLines: scopeLines.filter(Boolean) };
  const laidColumns = layoutColumns(pdf, columns);
  let y = drawBanner(pdf, { ...banner, compact: false });

  const startTablePage = (compact) => {
    pdf.addPage();
    y = drawBanner(pdf, { ...banner, compact });
    y = drawTableHeader(pdf, y, laidColumns);
  };

  y = drawTableHeader(pdf, y, laidColumns);
  rows.forEach((row, index) => {
    const metrics = rowMetrics(pdf, laidColumns, row);
    if (y + metrics.height > pageLimit(pdf)) {
      startTablePage(true);
    }
    drawTableRow(pdf, y, laidColumns, metrics, index % 2 === 1);
    y += metrics.height;
  });

  finishPdf(pdf, filename);
}

function ensureSpace(pdf, state, banner, height) {
  if (state.y + height <= pageLimit(pdf)) return;
  pdf.addPage();
  state.y = drawBanner(pdf, { ...banner, compact: true });
}

function drawSectionTitle(pdf, state, banner, title) {
  ensureSpace(pdf, state, banner, 0.36);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...COLORS.navy);
  pdf.text(pdfSafeText(title).toUpperCase(), PAGE.marginX, state.y);
  state.y += 0.08;
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.01);
  pdf.line(PAGE.marginX, state.y, pdf.internal.pageSize.getWidth() - PAGE.marginX, state.y);
  state.y += 0.16;
}

function drawParagraph(pdf, state, banner, text) {
  const lines = pdf.splitTextToSize(pdfSafeText(text, '-'), contentWidth(pdf));
  for (const line of lines) {
    ensureSpace(pdf, state, banner, 0.15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(BODY_SIZE);
    pdf.setTextColor(...COLORS.text);
    pdf.text(line, PAGE.marginX, state.y);
    state.y += 0.15;
  }
  state.y += 0.06;
}

function drawLabeledValue(pdf, state, banner, label, value) {
  const valueWidth = contentWidth(pdf) - 2.05;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(BODY_SIZE);
  const lines = pdf.splitTextToSize(displayValue(value), Math.max(valueWidth, 1));
  lines.forEach((line, index) => {
    ensureSpace(pdf, state, banner, 0.18);
    pdf.setFontSize(BODY_SIZE);
    if (index === 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.muted);
      pdf.text(pdfSafeText(label), PAGE.marginX, state.y);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.text);
    pdf.text(line, PAGE.marginX + 2.05, state.y);
    state.y += 0.18;
  });
  state.y += 0.03;
}

function qualificationAlertLines(person, qualification, workshops) {
  const followUp = presentQualificationFollowUp({
    productCode: qualification.productCode,
    qualificationStanding: qualification.standing,
    t4tCompletedOn: qualification.t4tCompletedOn,
    personActive: person.active,
    workshops: Array.isArray(workshops)
      ? workshops.filter((row) => row.personId === person.id && row.productId === qualification.productId)
      : workshops,
  });
  return [followUp.warningLine, followUp.previousCycleLine, followUp.activityLine].filter(Boolean);
}

function drawFacilitationDetailHeader(pdf, state) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(...COLORS.muted);
  pdf.text('Date', PAGE.marginX + 0.18, state.y);
  pdf.text('Attendance', pageWidth - PAGE.marginX, state.y, { align: 'right' });
  state.y += 0.14;
}

function continueFacilitationDetail(pdf, state, banner) {
  pdf.addPage();
  state.y = drawBanner(pdf, { ...banner, compact: true });
  drawFacilitationDetailHeader(pdf, state);
}

function drawFacilitationEventHistory(pdf, state, banner, row) {
  const presentation = facilitationExperiencePresentation(row);
  if (!presentation.events.length && !presentation.coverageNote) return;
  const pageWidth = pdf.internal.pageSize.getWidth();
  if (presentation.events.length) {
    ensureSpace(pdf, state, banner, 0.34);
    drawFacilitationDetailHeader(pdf, state);
    for (const event of presentation.events) {
      if (state.y + 0.16 > pageLimit(pdf)) continueFacilitationDetail(pdf, state, banner);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...COLORS.secondary);
      pdf.text(pdfSafeText(event.dateLabel, '—'), PAGE.marginX + 0.18, state.y);
      pdf.text(pdfSafeText(event.attendanceLabel, '—'), pageWidth - PAGE.marginX, state.y, { align: 'right' });
      state.y += 0.14;
    }
    if (state.y + 0.18 > pageLimit(pdf)) continueFacilitationDetail(pdf, state, banner);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLORS.secondary);
    pdf.text(
      pdfSafeText(`Total Attendance: ${presentation.totalAttendanceLabel}`),
      pageWidth - PAGE.marginX,
      state.y,
      { align: 'right' },
    );
    state.y += 0.16;
  }
  if (presentation.coverageNote) {
    const lines = pdf.splitTextToSize(pdfSafeText(presentation.coverageNote), contentWidth(pdf) - 0.18);
    for (const line of lines) {
      ensureSpace(pdf, state, banner, 0.14);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(line, PAGE.marginX + 0.18, state.y);
      state.y += 0.13;
    }
  }
  state.y += 0.06;
}

function drawProfileExperience(pdf, state, banner, columns, rows) {
  for (const row of rows) {
    drawProfileTable(pdf, state, banner, columns, [{
      product: row.productName,
      events: String(row.eventsConducted),
      first: formatRecordedFacilitationDate(row.firstRecordedOn),
      recent: formatRecordedFacilitationDate(row.mostRecentOn),
    }]);
    drawFacilitationEventHistory(pdf, state, banner, row);
  }
}

function drawProfileTable(pdf, state, banner, columns, rows) {
  const laidColumns = layoutColumns(pdf, columns);
  const header = headerHeight(pdf, laidColumns);
  ensureSpace(pdf, state, banner, header + 0.28);
  state.y = drawTableHeader(pdf, state.y, laidColumns);
  rows.forEach((row, index) => {
    const metrics = rowMetrics(pdf, laidColumns, row);
    if (state.y + metrics.height > pageLimit(pdf)) {
      pdf.addPage();
      state.y = drawBanner(pdf, { ...banner, compact: true });
      state.y = drawTableHeader(pdf, state.y, laidColumns);
    }
    drawTableRow(pdf, state.y, laidColumns, metrics, index % 2 === 1);
    state.y += metrics.height;
  });
  state.y += 0.12;
}

export async function exportFacilitatorProfilePdf({
  person,
  workshops = null,
  t4tExperienceAvailable = false,
  filename,
} = {}) {
  const pdf = await openPdf('portrait');
  const personalName = person?.name || person?.displayName || 'Facilitator';
  const banner = {
    title: personalName,
    subtitle: 'Facilitator Report',
    scopeLines: [person?.displayName && person.displayName !== personalName ? person.displayName : ''],
  };
  const state = { y: drawBanner(pdf, { ...banner, compact: false }) };

  drawSectionTitle(pdf, state, banner, 'Identity / Status');
  drawLabeledValue(pdf, state, banner, 'Rank / Title', person?.rankTitle || '-');
  drawLabeledValue(pdf, state, banner, 'Name', personalName);
  drawLabeledValue(pdf, state, banner, 'Command / Organization', person?.commandOrganization || '-');
  drawLabeledValue(pdf, state, banner, 'Installation', person?.installation || '-');
  drawLabeledValue(pdf, state, banner, 'Status', person?.active === true ? 'Active' : 'Inactive');
  state.y += 0.08;

  drawSectionTitle(pdf, state, banner, FACILITATOR_QUALIFICATIONS_HEADING);
  const qualifications = person?.qualificationProducts ?? [];
  if (!qualifications.length) {
    drawParagraph(pdf, state, banner, FACILITATOR_EMPTY_QUALIFICATIONS);
  } else {
    for (const qualification of qualifications) {
      ensureSpace(pdf, state, banner, 0.28);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.text);
      const nameLines = pdf.splitTextToSize(pdfSafeText(qualification.productName, 'Product'), contentWidth(pdf));
      pdf.text(nameLines, PAGE.marginX, state.y);
      state.y += nameLines.length * 0.15 + 0.04;
      const fields = facilitatorQualificationDisplayFields(qualification);
      if (!fields.length) drawParagraph(pdf, state, banner, '-');
      for (const field of fields) drawLabeledValue(pdf, state, banner, field.label, field.value);
      for (const line of qualificationAlertLines(person, qualification, workshops)) {
        drawParagraph(pdf, state, banner, line);
      }
      state.y += 0.06;
    }
  }

  const completions = person?.t4tCompletions ?? [];
  if (completions.length) {
    drawSectionTitle(pdf, state, banner, FACILITATOR_T4T_COMPLETION_HEADING);
    for (const completion of completions) {
      ensureSpace(pdf, state, banner, 0.28);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.text);
      const nameLines = pdf.splitTextToSize(pdfSafeText(completion.productName, 'Product'), contentWidth(pdf));
      pdf.text(nameLines, PAGE.marginX, state.y);
      state.y += nameLines.length * 0.15 + 0.04;
      const fields = facilitatorT4tCompletionDisplayFields(completion);
      if (!fields.length) drawParagraph(pdf, state, banner, '-');
      for (const field of fields) drawLabeledValue(pdf, state, banner, field.label, field.value);
      state.y += 0.06;
    }
  }

  drawSectionTitle(pdf, state, banner, FACILITATOR_EXPERIENCE_HEADING);
  const experience = person?.experience ?? [];
  if (!experience.length) {
    drawParagraph(pdf, state, banner, FACILITATOR_EMPTY_EXPERIENCE);
  } else {
    drawProfileExperience(pdf, state, banner, [
      { key: 'product', label: 'Product', weight: 2.2 },
      { key: 'events', label: 'Events Conducted', weight: 1.1, align: 'right' },
      { key: 'first', label: 'First Recorded Facilitation', weight: 1.35, align: 'right' },
      { key: 'recent', label: 'Most Recent Facilitation', weight: 1.45, align: 'right' },
    ], experience);
  }

  if (t4tExperienceAvailable) {
    drawSectionTitle(pdf, state, banner, FACILITATOR_T4T_EXPERIENCE_HEADING);
    const t4tRows = person?.t4tExperience ?? [];
    if (!t4tRows.length) {
      drawParagraph(pdf, state, banner, FACILITATOR_EMPTY_T4T_EXPERIENCE);
    } else {
      drawProfileExperience(pdf, state, banner, [
        { key: 'product', label: 'Product', weight: 2.2 },
        { key: 'events', label: 'T4Ts Conducted', weight: 1.1, align: 'right' },
        { key: 'first', label: 'First Recorded T4T Facilitation', weight: 1.5, align: 'right' },
        { key: 'recent', label: 'Most Recent T4T Facilitation', weight: 1.55, align: 'right' },
      ], t4tRows);
    }
  }

  finishPdf(pdf, filename);
}
