import {
  COLORS,
  PAGE,
  buildTrendsReportFilename,
  createTrendsReportDocument,
  drawKpiCards,
  drawMetaGrid,
  drawNote,
  drawParagraph,
  pdfSafeText,
} from './trends-report-pdf-shared.js';

const FINANCIALS_REPORT_EMPTY = {
  invalidRange: 'Enter a valid custom start and end date to review recorded expenditures.',
  noAars: 'No finalized After Action Reports match the selected period and program.',
  noCosts: 'No recorded event costs are available for this reporting selection.',
  noVenues: 'No recorded venue spending is available for this reporting selection.',
  noCaterers: 'No recorded catering spending is available for this reporting selection.',
};

export function buildFinancialsPdfFilename(date = new Date()) {
  return buildTrendsReportFilename('Financials', date);
}

export function formatFinancialsCurrency(total) {
  return (Number(total) || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatFinancialsShare(amount, total) {
  if (!(Number(total) > 0)) return '0.0%';
  return `${((Number(amount) / Number(total)) * 100).toFixed(1)}%`;
}

export function compareFinancialsRankedTotals(left, right) {
  const leftTotal = Number(left?.total) || 0;
  const rightTotal = Number(right?.total) || 0;
  if (rightTotal !== leftTotal) return rightTotal - leftTotal;
  return String(left?.name || left?.label || '').localeCompare(
    String(right?.name || right?.label || ''),
    'en',
    { sensitivity: 'base' }
  );
}

export function getFinancialsReportEmptyCopy({ range, matchingFinalizedAars, eventsWithRecordedCosts } = {}) {
  if (!range) return FINANCIALS_REPORT_EMPTY.invalidRange;
  if (!(Number(matchingFinalizedAars) > 0)) return FINANCIALS_REPORT_EMPTY.noAars;
  if (!(Number(eventsWithRecordedCosts) > 0)) return FINANCIALS_REPORT_EMPTY.noCosts;
  return '';
}

export function getFinancialsVendorEmptyCopy(type, { range, matchingFinalizedAars, rowCount } = {}) {
  if (!range) return FINANCIALS_REPORT_EMPTY.invalidRange;
  if (!(Number(matchingFinalizedAars) > 0)) return FINANCIALS_REPORT_EMPTY.noAars;
  if (!(Number(rowCount) > 0)) {
    return type === 'caterers' ? FINANCIALS_REPORT_EMPTY.noCaterers : FINANCIALS_REPORT_EMPTY.noVenues;
  }
  return '';
}

export function serializeFinancialsVendorRows(vendors, totalSpending) {
  return [...(vendors || [])]
    .filter((vendor) => Number(vendor?.total) > 0)
    .map((vendor) => {
      const total = Number(vendor.total) || 0;
      const eventCount = Number(vendor.eventCount) || 0;
      return {
        key: String(vendor.key || ''),
        name: String(vendor.name || ''),
        unspecified: Boolean(vendor.unspecified),
        total,
        eventCount,
        average: eventCount > 0 ? total / eventCount : null,
        share: formatFinancialsShare(total, totalSpending),
        sharePct: Number(totalSpending) > 0
          ? Math.max(0, Math.min(100, (total / Number(totalSpending)) * 100))
          : 0,
      };
    });
}

function toPlainCategory(category, totalSpending) {
  const amount = Number(category?.total) || 0;
  return {
    key: String(category?.key || ''),
    label: String(category?.label || ''),
    amount,
    share: formatFinancialsShare(amount, totalSpending),
    sharePct: Number(totalSpending) > 0
      ? Math.max(0, Math.min(100, (amount / Number(totalSpending)) * 100))
      : 0,
  };
}

export function buildFinancialsReportPayload({
  periodLabel = '',
  dateRangeLabel = '',
  programLabel = 'All Programs',
  matchingFinalizedAars = 0,
  range = null,
  summary = {},
  categories = [],
  venues = [],
  caterers = [],
  venueTotal,
  catererTotal,
} = {}) {
  const totalSpending = Number(summary.totalRecordedEventCost) || 0;
  const eventsWithRecordedCosts = Number(summary.eventsWithRecordedCosts) || 0;
  const averageValue = summary.averageRecordedCost == null
    ? '—'
    : formatFinancialsCurrency(summary.averageRecordedCost);
  const largestLabel = summary.largestCategory?.label || '—';
  const venueSpending = venueTotal == null
    ? (venues || []).reduce((sum, vendor) => sum + (Number(vendor.total) || 0), 0)
    : Number(venueTotal) || 0;
  const cateringSpending = catererTotal == null
    ? (caterers || []).reduce((sum, vendor) => sum + (Number(vendor.total) || 0), 0)
    : Number(catererTotal) || 0;
  const venueRows = serializeFinancialsVendorRows(venues, venueSpending);
  const catererRows = serializeFinancialsVendorRows(caterers, cateringSpending);

  return {
    periodLabel: String(periodLabel || ''),
    dateRangeLabel: String(dateRangeLabel || ''),
    programLabel: String(programLabel || 'All Programs'),
    matchingFinalizedAars: Number(matchingFinalizedAars) || 0,
    kpis: [
      {
        label: 'Total Recorded Spending',
        value: formatFinancialsCurrency(totalSpending),
      },
      {
        label: 'Events With Recorded Costs',
        value: eventsWithRecordedCosts.toLocaleString('en-US'),
      },
      {
        label: 'Average / Event',
        value: averageValue,
      },
      {
        label: 'Largest Category',
        value: largestLabel,
      },
    ],
    categories: (categories || []).slice(0, 6).map((category) => toPlainCategory(category, totalSpending)),
    venues: {
      total: venueSpending,
      identifiedCount: (venues || []).filter((vendor) => !vendor.unspecified && Number(vendor.total) > 0).length,
      rows: venueRows,
      emptyMessage: getFinancialsVendorEmptyCopy('venues', {
        range,
        matchingFinalizedAars,
        rowCount: venueRows.length,
      }),
    },
    caterers: {
      total: cateringSpending,
      identifiedCount: (caterers || []).filter((vendor) => !vendor.unspecified && Number(vendor.total) > 0).length,
      rows: catererRows,
      emptyMessage: getFinancialsVendorEmptyCopy('caterers', {
        range,
        matchingFinalizedAars,
        rowCount: catererRows.length,
      }),
    },
    emptyState: getFinancialsReportEmptyCopy({
      range,
      matchingFinalizedAars,
      eventsWithRecordedCosts,
    }),
  };
}

function createSyncedSpace(ctx) {
  let y = ctx.y;
  const space = (height) => {
    ctx.y = y;
    const before = y;
    ctx.ensureSpace(height);
    y = ctx.y;
    return y !== before;
  };
  return {
    get y() {
      return y;
    },
    set y(next) {
      y = next;
      ctx.y = next;
    },
    space,
  };
}

function drawShareBar(pdf, x, y, width, pct) {
  const barHeight = 0.07;
  pdf.setFillColor(...COLORS.stripe);
  pdf.rect(x, y, width, barHeight, 'F');
  const fillWidth = width * Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
  if (fillWidth > 0.01) {
    pdf.setFillColor(...COLORS.navy);
    pdf.rect(x, y, fillWidth, barHeight, 'F');
  }
}

function drawCategoryTable(ctx, categories) {
  const { pdf, contentWidth } = ctx;
  const cursor = createSyncedSpace(ctx);
  const x = PAGE.marginX;
  const nameX = x + 0.06;
  const amountX = x + 3.55;
  const shareX = x + 4.85;
  const barX = x + 5.15;
  const barWidth = Math.max(1.2, contentWidth - 5.15);

  const drawHeader = () => {
    pdf.setFillColor(...COLORS.stripe);
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.006);
    pdf.rect(x, cursor.y - 0.12, contentWidth, 0.22, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.7);
    pdf.setTextColor(...COLORS.muted);
    pdf.text('CATEGORY', nameX, cursor.y);
    pdf.text('AMOUNT', amountX, cursor.y, { align: 'right' });
    pdf.text('SHARE', shareX, cursor.y, { align: 'right' });
    cursor.y += 0.16;
  };

  cursor.space(0.38);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.navy);
  pdf.text('COST BREAKDOWN', x, cursor.y);
  cursor.y += 0.18;
  drawHeader();

  (categories || []).forEach((category, index) => {
    if (cursor.space(0.28)) drawHeader();
    if (index % 2 === 0) {
      pdf.setFillColor(...COLORS.stripe);
      pdf.rect(x, cursor.y - 0.08, contentWidth, 0.24, 'F');
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.2);
    pdf.setTextColor(...COLORS.text);
    pdf.text(pdfSafeText(category.label, '-'), nameX, cursor.y);
    pdf.text(pdfSafeText(formatFinancialsCurrency(category.amount)), amountX, cursor.y, { align: 'right' });
    pdf.text(pdfSafeText(category.share, '0.0%'), shareX, cursor.y, { align: 'right' });
    drawShareBar(pdf, barX, cursor.y - 0.05, barWidth, category.sharePct);
    cursor.y += 0.24;
  });

  cursor.y += 0.1;
  ctx.y = cursor.y;
}

function drawVendorTable(ctx, {
  title,
  nameHeader,
  totalLabel,
  identifiedLabel,
  group,
}) {
  const { pdf, contentWidth } = ctx;
  const cursor = createSyncedSpace(ctx);
  const x = PAGE.marginX;
  const nameX = x + 0.06;
  const totalX = x + 3.55;
  const eventsX = x + 4.45;
  const avgX = x + 5.85;
  const shareX = x + contentWidth - 0.04;

  const drawHeader = () => {
    pdf.setFillColor(...COLORS.stripe);
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.006);
    pdf.rect(x, cursor.y - 0.12, contentWidth, 0.22, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.7);
    pdf.setTextColor(...COLORS.muted);
    pdf.text(nameHeader, nameX, cursor.y);
    pdf.text('TOTAL', totalX, cursor.y, { align: 'right' });
    pdf.text('EVENTS', eventsX, cursor.y, { align: 'right' });
    pdf.text('AVG / EVENT', avgX, cursor.y, { align: 'right' });
    pdf.text('SHARE', shareX, cursor.y, { align: 'right' });
    cursor.y += 0.16;
  };

  cursor.space(0.72);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.navy);
  pdf.text(title, x, cursor.y);
  cursor.y += 0.16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.text);
  pdf.text(pdfSafeText(`${totalLabel}: ${formatFinancialsCurrency(group.total)}`), x, cursor.y);
  cursor.y += 0.14;
  pdf.setTextColor(...COLORS.secondary);
  pdf.text(pdfSafeText(`${identifiedLabel}: ${(group.identifiedCount || 0).toLocaleString('en-US')}`), x, cursor.y);
  cursor.y += 0.16;

  if (!group.rows?.length) {
    cursor.y = drawParagraph(pdf, cursor.y, group.emptyMessage || 'No recorded spending is available.', {
      color: COLORS.secondary,
    });
    ctx.y = cursor.y;
    return;
  }

  drawHeader();
  group.rows.forEach((row, index) => {
    const nameLines = pdf.splitTextToSize(pdfSafeText(row.name, '-'), 2.2);
    const height = Math.max(0.24, nameLines.length * 0.12 + 0.1);
    if (cursor.space(height + 0.04)) drawHeader();
    if (index % 2 === 0) {
      pdf.setFillColor(...COLORS.stripe);
      pdf.rect(x, cursor.y - 0.08, contentWidth, height, 'F');
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.text);
    pdf.text(nameLines, nameX, cursor.y);
    pdf.text(pdfSafeText(formatFinancialsCurrency(row.total)), totalX, cursor.y, { align: 'right' });
    pdf.text(String(row.eventCount || 0), eventsX, cursor.y, { align: 'right' });
    pdf.text(
      row.average == null ? '—' : pdfSafeText(formatFinancialsCurrency(row.average)),
      avgX,
      cursor.y,
      { align: 'right' }
    );
    pdf.text(pdfSafeText(row.share, '0.0%'), shareX, cursor.y, { align: 'right' });
    cursor.y += height;
  });

  cursor.y += 0.12;
  ctx.y = cursor.y;
}

export async function exportFinancialsReportPdf(payload) {
  const generatedAtDate = payload.generatedAt instanceof Date ? payload.generatedAt : new Date();
  const periodContext = [payload.periodLabel, payload.dateRangeLabel].filter(Boolean).join('\n');
  const ctx = await createTrendsReportDocument({
    reportTitle: 'CREDO Financials Report',
    metaItems: [
      ['Reporting Period', payload.periodLabel || '-'],
      ['Program', payload.programLabel || 'All Programs'],
    ],
    generatedAtDate,
  });

  ctx.ensureSpace(0.9);
  ctx.y = drawMetaGrid(ctx.pdf, ctx.y, 'Report Context', [
    ['Reporting Period', periodContext || '-'],
    ['Program', payload.programLabel || 'All Programs'],
  ]);

  ctx.ensureSpace(1.2);
  ctx.y = drawKpiCards(ctx.pdf, ctx.y, payload.kpis || [], 'SPENDING SUMMARY');
  ctx.y = drawNote(
    ctx.pdf,
    ctx.y,
    `Matching Finalized AARs: ${(Number(payload.matchingFinalizedAars) || 0).toLocaleString('en-US')}`
  );

  if (payload.emptyState) {
    ctx.ensureSpace(0.3);
    ctx.y = drawParagraph(ctx.pdf, ctx.y, payload.emptyState, { color: COLORS.secondary });
  }

  drawCategoryTable(ctx, payload.categories);
  drawVendorTable(ctx, {
    title: 'VENUE SPENDING',
    nameHeader: 'VENUE',
    totalLabel: 'Total Venue Spending',
    identifiedLabel: 'Identified Venues',
    group: payload.venues || { total: 0, identifiedCount: 0, rows: [], emptyMessage: FINANCIALS_REPORT_EMPTY.noVenues },
  });
  drawVendorTable(ctx, {
    title: 'CATERER SPENDING',
    nameHeader: 'CATERER',
    totalLabel: 'Total Catering Spending',
    identifiedLabel: 'Identified Caterers',
    group: payload.caterers || { total: 0, identifiedCount: 0, rows: [], emptyMessage: FINANCIALS_REPORT_EMPTY.noCaterers },
  });

  ctx.finish(payload.filename || buildFinancialsPdfFilename(generatedAtDate));
}
