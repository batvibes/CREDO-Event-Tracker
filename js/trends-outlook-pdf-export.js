import {
  COLORS,
  PAGE,
  buildTrendsReportFilename,
  createTrendsReportDocument,
  drawKpiCards,
  drawMetaGrid,
  drawNote,
  hexToRgb,
  pdfSafeText,
} from './trends-report-pdf-shared.js';

export function buildTrendsOutlookPdfFilename(date = new Date()) {
  return buildTrendsReportFilename('Trend_Outlook', date);
}

function formatChartAxisValue(metricKey, value) {
  if (!Number.isFinite(value)) return '';
  if (value >= 1000) {
    const thousands = value / 1000;
    const compact = thousands >= 10 || Number.isInteger(thousands)
      ? String(Math.round(thousands))
      : thousands.toFixed(1).replace(/\.0$/, '');
    return `${compact}k`;
  }
  return String(Math.round(value));
}

function getChartScale(values) {
  const numeric = values.filter((value) => value != null && Number.isFinite(value));
  const maxValue = numeric.length > 0 ? Math.max(0, ...numeric) : 0;
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 4, ticks: [0, 1, 2, 3, 4] };
  }

  const exponent = Math.floor(Math.log10(maxValue));
  const magnitude = 10 ** exponent;
  const fraction = maxValue / magnitude;
  let niceFraction = 10;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;

  const niceMax = niceFraction * magnitude;
  const tickCount = 4;
  const ticks = [];
  for (let i = 0; i <= tickCount; i += 1) {
    ticks.push((niceMax * i) / tickCount);
  }
  return { max: niceMax, ticks };
}

function visibleLabelIndexes(count, maxLabels) {
  if (count <= maxLabels) return [...Array(count).keys()];
  const step = Math.ceil(count / maxLabels);
  const indexes = [];
  for (let i = 0; i < count; i += step) indexes.push(i);
  if (indexes[indexes.length - 1] !== count - 1) indexes.push(count - 1);
  return indexes;
}

function dashPattern(dash) {
  const parts = String(dash || '')
    .trim()
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  if (parts.length < 2) return [0.055, 0.04];
  const scale = 0.0095;
  return [Math.max(0.012, parts[0] * scale), Math.max(0.02, parts[1] * scale)];
}

function drawLegend(pdf, x, y, width, items, hint) {
  let cursorX = x;
  let cursorY = y;
  const lineHeight = 0.16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.2);

  (items || []).forEach((item) => {
    const label = pdfSafeText(item.label);
    const labelWidth = pdf.getTextWidth(label) + 0.28;
    if (cursorX + labelWidth > x + width) {
      cursorX = x;
      cursorY += lineHeight;
    }
    const rgb = hexToRgb(item.color);
    pdf.setDrawColor(...rgb);
    pdf.setLineWidth(0.018);
    if (item.dash || item.dotted) {
      pdf.setLineDashPattern(item.dotted ? [0.02, 0.035] : dashPattern(item.dash === true ? '5 4' : item.dash), 0);
    } else {
      pdf.setLineDashPattern([], 0);
    }
    pdf.line(cursorX, cursorY - 0.03, cursorX + 0.16, cursorY - 0.03);
    pdf.setLineDashPattern([], 0);
    pdf.setTextColor(...COLORS.text);
    pdf.text(label, cursorX + 0.2, cursorY);
    cursorX += labelWidth;
  });

  if (hint) {
    cursorY += lineHeight;
    pdf.setTextColor(...COLORS.secondary);
    pdf.setFontSize(7);
    const hintLines = pdf.splitTextToSize(pdfSafeText(hint), width);
    pdf.text(hintLines, x, cursorY);
    cursorY += hintLines.length * 0.12;
  }

  return cursorY + 0.08;
}

function drawChart(pdf, y, chart) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  const chartHeight = 3.05;
  const x = PAGE.marginX;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.muted);
  pdf.text('TREND & OUTLOOK', x, y);
  y += 0.1;

  pdf.setDrawColor(...COLORS.border);
  pdf.setFillColor(...COLORS.white);
  pdf.setLineWidth(0.008);
  pdf.roundedRect(x, y, contentWidth, chartHeight, 0.04, 0.04, 'FD');

  if (!chart?.seriesList?.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...COLORS.secondary);
    const message = pdfSafeText(chart?.emptyMessage, 'No chart data is available for this selection.');
    const lines = pdf.splitTextToSize(message, contentWidth - 0.4);
    pdf.text(lines, x + contentWidth / 2, y + chartHeight / 2, { align: 'center' });
    return y + chartHeight + 0.14;
  }

  const pad = { top: 0.28, right: 0.18, bottom: 0.38, left: 0.52 };
  const plotX = x + pad.left;
  const plotY = y + pad.top;
  const plotWidth = contentWidth - pad.left - pad.right;
  const plotHeight = chartHeight - pad.top - pad.bottom;
  const seriesList = chart.seriesList || [];
  const labels = chart.axisLabels?.length
    ? chart.axisLabels
    : (seriesList[0]?.points || []).map((point) => point.axisLabel);
  const axisCount = Math.max(labels.length, 1);
  const values = seriesList.flatMap((entry) => (entry.points || []).map((point) => point.value));
  const scale = getChartScale(values);
  const xAt = (index) => (
    axisCount === 1
      ? plotX + plotWidth / 2
      : plotX + (index / (axisCount - 1)) * plotWidth
  );
  const yAt = (value) => plotY + plotHeight - (value / scale.max) * plotHeight;

  pdf.setDrawColor(...COLORS.plotLine);
  pdf.setLineWidth(0.008);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(...COLORS.muted);
  scale.ticks.forEach((tick) => {
    const tickY = yAt(tick);
    pdf.line(plotX, tickY, plotX + plotWidth, tickY);
    pdf.text(formatChartAxisValue(chart.metricKey, tick), plotX - 0.06, tickY + 0.03, {
      align: 'right',
    });
  });

  pdf.setDrawColor(...COLORS.axis);
  pdf.line(plotX, plotY + plotHeight, plotX + plotWidth, plotY + plotHeight);

  if (chart.boundaryIndex != null && Number.isFinite(chart.boundaryIndex) && axisCount > 1) {
    const boundaryX = xAt(chart.boundaryIndex);
    pdf.setDrawColor(156, 163, 175);
    pdf.setLineDashPattern([0.04, 0.03], 0);
    pdf.line(boundaryX, plotY, boundaryX, plotY + plotHeight);
    pdf.setLineDashPattern([], 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...COLORS.secondary);
    const caption = pdfSafeText(chart.boundaryLabel, 'Today');
    const captionWidth = pdf.getTextWidth(caption);
    pdf.text(caption, Math.min(boundaryX + 0.05, plotX + plotWidth - captionWidth - 0.04), plotY + 0.12);
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(...COLORS.muted);
  visibleLabelIndexes(axisCount, 8).forEach((index) => {
    pdf.text(pdfSafeText(labels[index] || ''), xAt(index), y + chartHeight - 0.12, { align: 'center' });
  });

  seriesList.forEach((entry) => {
    const style = entry.style || {};
    const plotted = (entry.points || [])
      .map((point, index) => ({
        point,
        index: point.index != null ? point.index : index,
      }))
      .filter((item) => item.point.value != null && Number.isFinite(item.point.value));
    if (!plotted.length) return;

    const rgb = hexToRgb(style.stroke);
    pdf.setDrawColor(...rgb);
    pdf.setLineWidth((style.width || 2) * 0.009);
    if (style.dash) {
      pdf.setLineDashPattern(dashPattern(style.dash), 0);
    } else {
      pdf.setLineDashPattern([], 0);
    }

    let segment = [];
    const flushSegment = () => {
      if (segment.length > 1) {
        for (let i = 1; i < segment.length; i += 1) {
          pdf.line(
            xAt(segment[i - 1].index),
            yAt(segment[i - 1].point.value),
            xAt(segment[i].index),
            yAt(segment[i].point.value)
          );
        }
      }
      segment = [];
    };
    plotted.forEach((item, plottedIndex) => {
      const previous = plotted[plottedIndex - 1];
      if (previous && item.index !== previous.index + 1) flushSegment();
      segment.push(item);
    });
    flushSegment();
    pdf.setLineDashPattern([], 0);

    plotted.forEach((item) => {
      if (style.skipAnchorMarker && item.point.isAnchor) return;
      const cx = xAt(item.index);
      const cy = yAt(item.point.value);
      const radius = Math.max(0.028, (style.markerRadius || 3) * 0.011);
      const fill = hexToRgb(style.markerFill || style.stroke);
      const stroke = hexToRgb(style.markerStroke || '#ffffff');
      pdf.setFillColor(...fill);
      pdf.setDrawColor(...stroke);
      pdf.setLineWidth((style.markerStrokeWidth || 1.5) * 0.008);
      pdf.circle(cx, cy, radius, 'FD');
    });
  });

  return y + chartHeight + 0.12;
}

function drawProjectionSection(pdf, startY, ensureSpace, summary) {
  if (!summary) return startY;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE.marginX * 2;
  let y = startY;

  const blocks = summary.resultBlocks || [];
  const methodLines = summary.methodLines || [];
  if (!blocks.length && !methodLines.length) return y;

  ensureSpace(0.36);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.muted);
  pdf.text('OUTLOOK', PAGE.marginX, y);
  y += 0.16;

  blocks.forEach((block) => {
    const titleLines = block.title
      ? pdf.splitTextToSize(pdfSafeText(block.title), contentWidth)
      : [];
    const sentenceLines = block.sentence
      ? pdf.splitTextToSize(pdfSafeText(block.sentence), contentWidth)
      : [];
    const listLines = (block.lines || []).flatMap((line) => (
      pdf.splitTextToSize(pdfSafeText(`-  ${line}`), contentWidth)
    ));
    const height = (titleLines.length + (block.outlook ? 1 : 0) + sentenceLines.length) * 0.16
      + listLines.length * 0.14
      + 0.12;
    ensureSpace(height);

    if (titleLines.length) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(...COLORS.navy);
      pdf.text(titleLines, PAGE.marginX, y);
      y += titleLines.length * 0.16;
    }
    if (block.outlook) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...COLORS.text);
      pdf.text(pdfSafeText(`Outlook: ${block.outlook}`), PAGE.marginX, y);
      y += 0.16;
    }
    if (sentenceLines.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.text);
      pdf.text(sentenceLines, PAGE.marginX, y);
      y += sentenceLines.length * 0.14 + 0.04;
    }
    if (listLines.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.text);
      pdf.text(listLines, PAGE.marginX, y);
      y += listLines.length * 0.14 + 0.04;
    }
    y += 0.06;
  });

  if (methodLines.length) {
    const wrapped = methodLines.flatMap((line) => pdf.splitTextToSize(pdfSafeText(line), contentWidth));
    ensureSpace(0.2 + wrapped.length * 0.13);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLORS.muted);
    pdf.text('METHODOLOGY', PAGE.marginX, y);
    y += 0.14;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.secondary);
    pdf.text(wrapped, PAGE.marginX, y);
    y += wrapped.length * 0.13;
  }

  return y;
}

export async function exportTrendsOutlookReportPdf(payload) {
  if (!payload?.kpis?.length) return;

  const generatedAtDate = payload.generatedAt instanceof Date ? payload.generatedAt : new Date();
  const ctx = await createTrendsReportDocument({
    reportTitle: 'Trend & Outlook Report',
    metaItems: [
      ['Reporting Period', payload.context?.periodLabel || '-'],
      ['Comparison', payload.context?.comparisonLabel || 'None'],
    ],
    generatedAtDate,
  });

  ctx.ensureSpace(1.2);
  ctx.y = drawKpiCards(ctx.pdf, ctx.y, payload.kpis);

  ctx.ensureSpace(0.9);
  ctx.y = drawMetaGrid(ctx.pdf, ctx.y, 'Trend & Outlook Context', [
    ['Metric', payload.context?.metricLabel],
    ['Programs', payload.context?.programsLabel],
    ['Comparison', payload.context?.comparisonLabel],
    ['Projection', payload.context?.projectionLabel],
  ]);

  const chartBlock = 3.45 + (payload.legendItems?.length ? 0.28 : 0);
  ctx.ensureSpace(chartBlock);
  ctx.y = drawChart(ctx.pdf, ctx.y, payload.chart || { emptyMessage: payload.emptyMessage });
  ctx.y = drawLegend(
    ctx.pdf,
    PAGE.marginX,
    ctx.y,
    ctx.contentWidth,
    payload.legendItems,
    payload.legendHint
  );
  ctx.y = drawNote(ctx.pdf, ctx.y, payload.note);

  if (payload.projectionEnabled) {
    ctx.y = drawProjectionSection(ctx.pdf, ctx.y, ctx.ensureSpace, payload.projectionSummary);
  }

  ctx.finish(payload.filename || buildTrendsOutlookPdfFilename(generatedAtDate));
}
