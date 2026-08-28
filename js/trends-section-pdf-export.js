import {
  COLORS,
  PAGE,
  buildTrendsReportFilename,
  comparisonPalette,
  createTrendsReportDocument,
  drawComparisonMarker,
  drawKpiCards,
  drawMetaGrid,
  drawNote,
  drawParagraph,
  drawSectionLabel,
  drawSummaryLines,
  pdfSafeText,
  stripComparisonArrow,
} from './trends-report-pdf-shared.js';

export function buildProgramDemandPdfFilename(date = new Date()) {
  return buildTrendsReportFilename('Program_Demand', date);
}

export function buildCommandReachPdfFilename(date = new Date()) {
  return buildTrendsReportFilename('Command_Reach', date);
}

export function buildResourceImpactPdfFilename(date = new Date()) {
  return buildTrendsReportFilename('Resource_Impact', date);
}

export function buildImpactExplorerPdfFilename(date = new Date()) {
  return buildTrendsReportFilename('Impact_Explorer', date);
}

function estimateRankedRowHeight(pdf, row, nameWidth, statsWidth) {
  const nameLines = pdf.splitTextToSize(pdfSafeText(row.label), nameWidth);
  const valueLines = pdf.splitTextToSize(pdfSafeText(row.valueText, '-'), statsWidth);
  const changeLines = row.comparisonText && row.comparisonText !== 'No comparison'
    ? pdf.splitTextToSize(stripComparisonArrow(row.comparisonText), statsWidth)
    : [];
  return Math.max(0.34, 0.12 + Math.max(nameLines.length, valueLines.length + changeLines.length) * 0.12);
}

function drawRankedDotPlot(pdf, x, y, width, height, row) {
  const midY = y + height / 2;
  pdf.setDrawColor(...COLORS.axis);
  pdf.setLineWidth(0.008);
  pdf.line(x, midY, x + width, midY);

  const currentPct = Math.max(0, Math.min(100, Number(row.currentPct) || 0));
  const comparePct = Math.max(0, Math.min(100, Number(row.comparePct) || 0));

  if (row.showCompare) {
    const left = Math.min(currentPct, comparePct);
    const span = Math.abs(currentPct - comparePct);
    if (span > 0.4) {
      pdf.setDrawColor(...COLORS.compare);
      pdf.setLineWidth(0.012);
      pdf.line(
        x + (left / 100) * width,
        midY,
        x + ((left + span) / 100) * width,
        midY
      );
    }
    pdf.setFillColor(...COLORS.compare);
    pdf.circle(x + (comparePct / 100) * width, midY, 0.035, 'F');
  }

  pdf.setFillColor(...COLORS.current);
  pdf.circle(x + (currentPct / 100) * width, midY, 0.04, 'F');
}

function drawRankedRows(ctx, rows, {
  sectionLabel = 'RANKED RESULTS',
  compareModeEnabled = false,
  comparePhrase = '',
  emptyMessage = 'No ranked results are available.',
} = {}) {
  const { pdf, contentWidth, ensureSpace } = ctx;
  ensureSpace(0.4);
  ctx.y = drawSectionLabel(pdf, ctx.y, sectionLabel);

  if (compareModeEnabled) {
    ctx.y = drawNote(
      pdf,
      ctx.y,
      `Solid navy marker = Current Period. Gray marker = ${comparePhrase || 'Comparison'}.`
    );
  }

  if (!rows?.length) {
    ctx.y = drawParagraph(pdf, ctx.y, emptyMessage, { color: COLORS.secondary });
    return;
  }

  const nameWidth = 1.7;
  const statsWidth = 1.45;
  const plotWidth = Math.max(1.4, contentWidth - nameWidth - statsWidth - 0.2);

  rows.forEach((row, index) => {
    const height = estimateRankedRowHeight(pdf, row, nameWidth, statsWidth);
    ensureSpace(height + 0.04);
    const y = ctx.y;
    if (index % 2 === 0) {
      pdf.setFillColor(...COLORS.stripe);
      pdf.rect(PAGE.marginX, y - 0.04, contentWidth, height, 'F');
    }

    const nameLines = pdf.splitTextToSize(pdfSafeText(row.label), nameWidth - 0.06);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.text);
    pdf.text(nameLines, PAGE.marginX + 0.04, y + 0.1);

    drawRankedDotPlot(
      pdf,
      PAGE.marginX + nameWidth,
      y,
      plotWidth,
      height,
      row
    );

    const statsX = PAGE.marginX + nameWidth + plotWidth + 0.1;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.navy);
    const valueLines = pdf.splitTextToSize(pdfSafeText(row.valueText, '-'), statsWidth);
    pdf.text(valueLines, statsX, y + 0.1);

    if (row.comparisonText && row.comparisonText !== 'No comparison') {
      const color = comparisonPalette(row.comparisonDirection);
      const rest = stripComparisonArrow(row.comparisonText);
      const changeLines = pdf.splitTextToSize(rest, statsWidth - 0.1);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(...color);
      const textX = drawComparisonMarker(pdf, statsX, y + 0.1 + valueLines.length * 0.12, row.comparisonDirection, color);
      pdf.text(changeLines, textX, y + 0.1 + valueLines.length * 0.12);
    }

    ctx.y += height + 0.02;
  });

  ctx.y += 0.08;
}

function drawSimpleTable(ctx, columns, rows, sectionLabel) {
  const { pdf, contentWidth, ensureSpace } = ctx;
  if (!rows?.length) return;
  ensureSpace(0.5);
  ctx.y = drawSectionLabel(pdf, ctx.y, sectionLabel);

  const widths = columns.map((column) => column.width);
  const headerHeight = 0.28;
  ensureSpace(headerHeight + 0.2);
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(PAGE.marginX, ctx.y, contentWidth, headerHeight, 'F');
  pdf.setTextColor(...COLORS.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  let x = PAGE.marginX;
  columns.forEach((column, index) => {
    pdf.text(pdfSafeText(column.label), x + 0.06, ctx.y + 0.18);
    x += widths[index];
  });
  ctx.y += headerHeight;

  rows.forEach((row, rowIndex) => {
    const cellLines = columns.map((column, index) => (
      pdf.splitTextToSize(pdfSafeText(row[column.key], '-'), widths[index] - 0.1)
    ));
    const height = Math.max(0.3, 0.12 + Math.max(...cellLines.map((lines) => lines.length)) * 0.12);
    ensureSpace(height);
    pdf.setFillColor(...(rowIndex % 2 === 0 ? COLORS.white : COLORS.stripe));
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.006);
    pdf.rect(PAGE.marginX, ctx.y, contentWidth, height, 'FD');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.4);
    pdf.setTextColor(...COLORS.text);
    let cellX = PAGE.marginX;
    cellLines.forEach((lines, index) => {
      if (index === 0) {
        pdf.setFont('helvetica', 'bold');
      } else {
        pdf.setFont('helvetica', 'normal');
      }
      pdf.text(lines, cellX + 0.06, ctx.y + 0.12);
      cellX += widths[index];
    });
    ctx.y += height;
  });
  ctx.y += 0.12;
}

async function exportRankedBreakdownReport({
  reportTitle,
  filename,
  periodLabel,
  comparisonLabel,
  measureByLabel,
  summaryLines,
  rows,
  compareModeEnabled,
  comparePhrase,
  emptyMessage,
  notes = [],
  generatedAtDate,
}) {
  const ctx = await createTrendsReportDocument({
    reportTitle,
    metaItems: [
      ['Reporting Period', periodLabel || '-'],
      ['Comparison', comparisonLabel || 'None'],
      ['Measure By', measureByLabel || '-'],
    ],
    generatedAtDate,
  });

  if (emptyMessage && !rows?.length) {
    ctx.y = drawParagraph(ctx.pdf, ctx.y, emptyMessage, { color: COLORS.secondary });
    ctx.finish(filename);
    return;
  }

  ctx.ensureSpace(0.5);
  ctx.y = drawSummaryLines(ctx.pdf, ctx.y, summaryLines);
  drawRankedRows(ctx, rows, {
    compareModeEnabled,
    comparePhrase,
    emptyMessage,
  });
  notes.filter(Boolean).forEach((note) => {
    ctx.ensureSpace(0.3);
    ctx.y = drawNote(ctx.pdf, ctx.y, note);
  });
  ctx.finish(filename);
}

export async function exportProgramDemandReportPdf(payload) {
  const generatedAtDate = payload.generatedAt instanceof Date ? payload.generatedAt : new Date();
  await exportRankedBreakdownReport({
    reportTitle: 'Program Demand Report',
    filename: payload.filename || buildProgramDemandPdfFilename(generatedAtDate),
    periodLabel: payload.periodLabel,
    comparisonLabel: payload.comparisonLabel,
    measureByLabel: payload.measureByLabel,
    summaryLines: payload.summaryLines,
    rows: payload.rows,
    compareModeEnabled: payload.compareModeEnabled,
    comparePhrase: payload.comparePhrase,
    emptyMessage: payload.emptyMessage || 'No finalized AAR data is available for Program Demand.',
    notes: [
      payload.rowNote,
      'Program Demand ranks Event Types by the selected activity measure using finalized After Action Reports.',
    ],
    generatedAtDate,
  });
}

export async function exportCommandReachReportPdf(payload) {
  const generatedAtDate = payload.generatedAt instanceof Date ? payload.generatedAt : new Date();
  await exportRankedBreakdownReport({
    reportTitle: 'Command Reach Report',
    filename: payload.filename || buildCommandReachPdfFilename(generatedAtDate),
    periodLabel: payload.periodLabel,
    comparisonLabel: payload.comparisonLabel,
    measureByLabel: payload.measureByLabel,
    summaryLines: payload.summaryLines,
    rows: payload.rows,
    compareModeEnabled: payload.compareModeEnabled,
    comparePhrase: payload.comparePhrase,
    emptyMessage: payload.emptyMessage || 'No finalized AAR data is available for Command Reach.',
    notes: [
      payload.rowNote,
      'Identified command breadth counts unique non-TBD commands. Unspecified activity may appear in the ranked list but does not increase identified-command breadth.',
    ],
    generatedAtDate,
  });
}

export async function exportResourceImpactReportPdf(payload) {
  const generatedAtDate = payload.generatedAt instanceof Date ? payload.generatedAt : new Date();
  const ctx = await createTrendsReportDocument({
    reportTitle: 'Resource Impact Report',
    metaItems: [
      ['Reporting Period', payload.periodLabel || '-'],
      ['Comparison', payload.comparisonLabel || 'None'],
    ],
    generatedAtDate,
  });

  if (payload.emptyMessage && !payload.kpis?.length) {
    ctx.y = drawParagraph(ctx.pdf, ctx.y, payload.emptyMessage, { color: COLORS.secondary });
    ctx.finish(payload.filename || buildResourceImpactPdfFilename(generatedAtDate));
    return;
  }

  ctx.ensureSpace(1.1);
  ctx.y = drawKpiCards(ctx.pdf, ctx.y, payload.kpis || [], 'Resource Impact KPIs');

  if (payload.relationshipText) {
    ctx.ensureSpace(0.35);
    ctx.y = drawParagraph(ctx.pdf, ctx.y, payload.relationshipText);
  }

  ctx.ensureSpace(0.4);
  ctx.y = drawSummaryLines(ctx.pdf, ctx.y, payload.spendingSummaryLines || []);
  drawRankedRows(ctx, payload.spendingRows || [], {
    sectionLabel: 'Recorded Spending by Program',
    compareModeEnabled: payload.compareModeEnabled,
    comparePhrase: payload.comparePhrase,
    emptyMessage: 'No recorded program spending is available for the selected period.',
  });

  if (payload.costDetailsExpanded && payload.costDetailRows?.length) {
    drawSimpleTable(ctx, [
      { key: 'label', label: 'PROGRAM', width: 2.6 },
      { key: 'recordedCost', label: 'TOTAL RECORDED COST', width: 1.7 },
      { key: 'completedEvents', label: 'COMPLETED EVENTS', width: 1.4 },
      { key: 'avgCostPerEvent', label: 'AVG COST / EVENT', width: 1.7 },
    ], payload.costDetailRows, 'Program Cost Details');
  } else if (!payload.costDetailsExpanded) {
    ctx.ensureSpace(0.3);
    ctx.y = drawNote(
      ctx.pdf,
      ctx.y,
      'Program Cost Details were collapsed in the current view and are not included in this report.'
    );
  }

  ctx.y = drawNote(
    ctx.pdf,
    ctx.y,
    'Resource Impact uses recorded event costs from finalized After Action Reports. It does not reinterpret event cost semantics.'
  );

  ctx.finish(payload.filename || buildResourceImpactPdfFilename(generatedAtDate));
}

export async function exportImpactExplorerReportPdf(payload) {
  const generatedAtDate = payload.generatedAt instanceof Date ? payload.generatedAt : new Date();
  const ctx = await createTrendsReportDocument({
    reportTitle: 'Impact Explorer Report',
    metaItems: [
      ['Historical Basis', payload.basisLabel || '-'],
      ['Scenario', payload.scenarioLabel || 'No Change'],
      ['Funding Change', payload.fundingChangeText || '$0'],
    ],
    generatedAtDate,
  });

  if (payload.emptyMessage) {
    ctx.y = drawParagraph(ctx.pdf, ctx.y, payload.emptyMessage, { color: COLORS.secondary });
    ctx.finish(payload.filename || buildImpactExplorerPdfFilename(generatedAtDate));
    return;
  }

  ctx.ensureSpace(0.8);
  ctx.y = drawMetaGrid(ctx.pdf, ctx.y, 'Scenario Balance', payload.balanceItems || []);

  ctx.ensureSpace(0.9);
  ctx.y = drawKpiCards(ctx.pdf, ctx.y, payload.impactKpis || [], 'Estimated Impact');

  if (payload.spendNote) {
    ctx.ensureSpace(0.3);
    ctx.y = drawNote(ctx.pdf, ctx.y, payload.spendNote);
  }
  if (payload.reachNote) {
    ctx.ensureSpace(0.3);
    ctx.y = drawNote(ctx.pdf, ctx.y, payload.reachNote);
  }
  if (payload.summary) {
    ctx.ensureSpace(0.4);
    ctx.y = drawParagraph(ctx.pdf, ctx.y, payload.summary);
  }

  ctx.ensureSpace(0.4);
  ctx.y = drawSectionLabel(ctx.pdf, ctx.y, 'Program Impact');
  ctx.y = drawNote(
    ctx.pdf,
    ctx.y,
    'Assignments reflect the current scenario. Changing one program does not move another.'
  );

  const programs = payload.programs || [];
  if (!programs.length) {
    ctx.y = drawParagraph(ctx.pdf, ctx.y, 'No program rows are available for this scenario.', {
      color: COLORS.secondary,
    });
  } else {
    programs.forEach((program) => {
      const blockHeight = program.estimable ? 0.72 : 0.55;
      ctx.ensureSpace(blockHeight);
      const y = ctx.y;
      pdfSafeBox(ctx.pdf, PAGE.marginX, y, ctx.contentWidth, blockHeight - 0.06);

      ctx.pdf.setFont('helvetica', 'bold');
      ctx.pdf.setFontSize(9);
      ctx.pdf.setTextColor(...COLORS.navy);
      ctx.pdf.text(pdfSafeText(program.label), PAGE.marginX + 0.1, y + 0.16);

      ctx.pdf.setFont('helvetica', 'normal');
      ctx.pdf.setFontSize(7.2);
      ctx.pdf.setTextColor(...COLORS.secondary);
      ctx.pdf.text(pdfSafeText(program.historyText || 'Insufficient recorded cost history'), PAGE.marginX + 0.1, y + 0.3);

      const cols = [
        ['Funding', program.fundingText],
        ['Events', program.eventsText],
        ['Participants', program.reachText],
      ];
      cols.forEach((col, index) => {
        const x = PAGE.marginX + 0.1 + index * 2.35;
        ctx.pdf.setFont('helvetica', 'bold');
        ctx.pdf.setFontSize(6.5);
        ctx.pdf.setTextColor(...COLORS.muted);
        ctx.pdf.text(col[0].toUpperCase(), x, y + 0.46);
        ctx.pdf.setFont('helvetica', 'normal');
        ctx.pdf.setFontSize(8);
        ctx.pdf.setTextColor(...COLORS.text);
        ctx.pdf.text(pdfSafeText(col[1], '-'), x, y + 0.58);
      });

      if (program.residualText) {
        ctx.pdf.setFont('helvetica', 'italic');
        ctx.pdf.setFontSize(6.5);
        ctx.pdf.setTextColor(...COLORS.secondary);
        ctx.pdf.text(pdfSafeText(program.residualText), PAGE.marginX + 4.8, y + 0.58);
      }

      ctx.y += blockHeight;
    });
  }

  if (payload.assumptions?.length) {
    ctx.ensureSpace(0.5);
    ctx.y = drawMetaGrid(ctx.pdf, ctx.y, 'Historical Assumptions', payload.assumptions);
  }

  if (payload.methodText) {
    ctx.ensureSpace(0.5);
    ctx.y = drawSectionLabel(ctx.pdf, ctx.y, 'Methodology');
    ctx.y = drawParagraph(ctx.pdf, ctx.y, payload.methodText, {
      fontSize: 8,
      color: COLORS.secondary,
    });
  }

  ctx.finish(payload.filename || buildImpactExplorerPdfFilename(generatedAtDate));
}

function pdfSafeBox(pdf, x, y, width, height) {
  pdf.setFillColor(...COLORS.stripe);
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.006);
  pdf.roundedRect(x, y, width, height, 0.03, 0.03, 'FD');
}
