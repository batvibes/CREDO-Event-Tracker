import pptxgen from 'pptxgenjs';

const NAVY = '00205B';
const NAVY_BORDER = '283A57';
const HEADER_BAND = 'EEF2F7';
const ROW_ALT = 'F7F9FB';
const BORDER_GRAY = 'DDE3EA';
const BODY_GRAY = '1F2937';
const MUTED_GRAY = '6B7280';

const FONT_FACE = 'Arial';

const SLIDE_W = 13.333;
const ML = 0.45;
const MR = 0.45;
const CONTENT_W = SLIDE_W - ML - MR;

const LAYOUT = {
  titleY: 0.16,
  titleH: 0.38,
  monthY: 0.54,
  monthH: 0.28,
  headerRuleY: 0.86,

  sec1BannerY: 0.94,
  sec1PanelsY: 1.22,
  sec1PanelH: 1.58,
  sec1PanelGap: 0.18,
  sec1PanelW: (CONTENT_W - 0.18) / 2,

  sec2BannerY: 2.88,
  sec2BoxY: 3.16,
  sec2BoxH: 0.5,

  sec3BannerY: 3.74,
  sec3MetricsY: 4.02,
  sec3MetricsH: 0.78,

  sec4BannerY: 4.88,
  sec4PhotosY: 5.16,
  sec4PhotoH: 1.32,

  footerY: 7.08,
};

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function noteText(value, placeholder) {
  const text = String(value ?? '').trim();
  return text || placeholder;
}

function panelHeaderCell(text) {
  return {
    text: text.toUpperCase(),
    options: {
      colspan: 2,
      fill: NAVY,
      color: 'FFFFFF',
      bold: true,
      fontSize: 8,
      fontFace: FONT_FACE,
      align: 'left',
      valign: 'middle',
    },
  };
}

function labelCell(text, options = {}) {
  return {
    text,
    options: {
      fill: options.fill ?? HEADER_BAND,
      color: BODY_GRAY,
      bold: true,
      fontSize: 8,
      fontFace: FONT_FACE,
      align: 'left',
      valign: 'middle',
      ...options,
    },
  };
}

function valueCell(text, options = {}) {
  return {
    text,
    options: {
      fill: options.fill ?? 'FFFFFF',
      color: NAVY,
      bold: true,
      fontSize: 9,
      fontFace: FONT_FACE,
      align: 'right',
      valign: 'middle',
      ...options,
    },
  };
}

function addSlideHeader(slide, subtitle) {
  slide.addText('CREDO MCI WEST MONTHLY IMPACT REPORT', {
    x: ML,
    y: LAYOUT.titleY,
    w: CONTENT_W,
    h: LAYOUT.titleH,
    fontFace: FONT_FACE,
    fontSize: 18,
    bold: true,
    color: NAVY,
    align: 'center',
    charSpacing: 0.5,
  });

  slide.addText(subtitle.toUpperCase(), {
    x: ML,
    y: LAYOUT.monthY,
    w: CONTENT_W,
    h: LAYOUT.monthH,
    fontFace: FONT_FACE,
    fontSize: 13,
    bold: true,
    color: BODY_GRAY,
    align: 'center',
  });

  slide.addShape('rect', {
    x: ML,
    y: LAYOUT.headerRuleY,
    w: CONTENT_W,
    h: 0.04,
    fill: { color: NAVY },
    line: { color: NAVY, width: 0 },
  });
}

function addSectionBanner(slide, text, y) {
  slide.addShape('rect', {
    x: ML,
    y,
    w: CONTENT_W,
    h: 0.24,
    fill: { color: NAVY },
    line: { color: NAVY, width: 0 },
  });

  slide.addText(text.toUpperCase(), {
    x: ML + 0.12,
    y: y + 0.03,
    w: CONTENT_W - 0.24,
    h: 0.18,
    fontFace: FONT_FACE,
    fontSize: 9,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
    charSpacing: 0.4,
  });
}

function addMetricPanel(slide, x, y, w, rows, rowH = 0.2) {
  slide.addShape('rect', {
    x,
    y,
    w,
    h: LAYOUT.sec1PanelH,
    fill: { color: 'FFFFFF' },
    line: { color: NAVY_BORDER, width: 1 },
  });

  slide.addTable(rows, {
    x,
    y,
    w,
    colW: [w * 0.62, w * 0.38],
    border: { type: 'solid', color: BORDER_GRAY, pt: 0.75 },
    rowH,
  });
}

function buildMonthReachRows(monthReach) {
  return [
    [panelHeaderCell('Month Reach')],
    [labelCell('Commands Supported'), valueCell(formatCount(monthReach.commandsSupported))],
    [labelCell('Beneficiaries Served'), valueCell(formatCount(monthReach.beneficiariesServed))],
    [labelCell('Workshops Conducted'), valueCell(formatCount(monthReach.workshopsConducted))],
    [labelCell('Retreats Conducted'), valueCell(formatCount(monthReach.retreatsConducted))],
  ];
}

function buildFytdRows(fytdMissionSupport) {
  const labels = fytdMissionSupport.categoryLabels ?? {};
  const dividerOpts = { border: [{ type: 'solid', color: NAVY, pt: 1.5 }] };

  return [
    [panelHeaderCell('FYTD Mission Support')],
    [
      labelCell(labels.suicidePrevention ?? 'SUICIDE PREVENTION'),
      valueCell(formatCount(fytdMissionSupport.suicidePrevention)),
    ],
    [
      labelCell(labels.personalGrowth ?? 'PERSONAL GROWTH'),
      valueCell(formatCount(fytdMissionSupport.personalGrowth)),
    ],
    [
      labelCell(labels.marriageEnrichment ?? 'MARRIAGE ENRICHMENT'),
      valueCell(formatCount(fytdMissionSupport.marriageEnrichment)),
    ],
    [
      labelCell(labels.retreats ?? 'RETREATS'),
      valueCell(formatCount(fytdMissionSupport.retreats)),
    ],
    [
      labelCell('FYTD Total', dividerOpts),
      valueCell(formatCount(fytdMissionSupport.fytdTotal), dividerOpts),
    ],
    [labelCell('Commands'), valueCell(formatCount(fytdMissionSupport.commands))],
  ];
}

function addManpowerPlaceholder(slide) {
  addSectionBanner(slide, '2. MANPOWER / MANNING', LAYOUT.sec2BannerY);

  slide.addShape('rect', {
    x: ML,
    y: LAYOUT.sec2BoxY,
    w: CONTENT_W,
    h: LAYOUT.sec2BoxH,
    fill: { color: 'FFFFFF' },
    line: { color: BORDER_GRAY, width: 1 },
  });

  slide.addText(
    'Manpower / manning summary placeholder — detailed metrics and notes will be added in a future release.',
    {
      x: ML + 0.12,
      y: LAYOUT.sec2BoxY + 0.1,
      w: CONTENT_W - 0.24,
      h: LAYOUT.sec2BoxH - 0.16,
      fontFace: FONT_FACE,
      fontSize: 9,
      color: MUTED_GRAY,
      italic: true,
      valign: 'top',
    }
  );
}

function addReadinessPlaceholders(slide) {
  addSectionBanner(
    slide,
    '3. READINESS OUTCOMES (FYTD) n = ___ assessments',
    LAYOUT.sec3BannerY
  );

  const boxW = (CONTENT_W - 0.24) / 3;

  for (let index = 0; index < 3; index += 1) {
    const x = ML + index * (boxW + 0.12);
    slide.addShape('rect', {
      x,
      y: LAYOUT.sec3MetricsY,
      w: boxW,
      h: LAYOUT.sec3MetricsH,
      fill: { color: ROW_ALT },
      line: { color: BORDER_GRAY, width: 1 },
    });

    slide.addText('__%', {
      x: x + 0.08,
      y: LAYOUT.sec3MetricsY + 0.2,
      w: boxW - 0.16,
      h: 0.4,
      fontFace: FONT_FACE,
      fontSize: 16,
      bold: true,
      color: NAVY,
      align: 'center',
      valign: 'middle',
    });
  }

  slide.addText('n = ___ assessments', {
    x: ML + 0.12,
    y: LAYOUT.sec3MetricsY + LAYOUT.sec3MetricsH + 0.06,
    w: 4,
    h: 0.18,
    fontFace: FONT_FACE,
    fontSize: 8,
    color: BODY_GRAY,
  });
}

function addPhotoPlaceholders(slide) {
  addSectionBanner(slide, '4. COMMAND HIGHLIGHTS (MONTH)', LAYOUT.sec4BannerY);

  const gap = 0.12;
  const photoW = (CONTENT_W - gap * 2) / 3;

  for (let index = 0; index < 3; index += 1) {
    const x = ML + index * (photoW + gap);
    slide.addShape('rect', {
      x,
      y: LAYOUT.sec4PhotosY,
      w: photoW,
      h: LAYOUT.sec4PhotoH,
      fill: { color: ROW_ALT },
      line: { color: BORDER_GRAY, width: 1 },
    });

    slide.addText('Photo placeholder', {
      x,
      y: LAYOUT.sec4PhotosY + LAYOUT.sec4PhotoH / 2 - 0.12,
      w: photoW,
      h: 0.24,
      fontFace: FONT_FACE,
      fontSize: 9,
      color: MUTED_GRAY,
      align: 'center',
      italic: true,
    });
  }
}

function addSlideFooter(slide) {
  slide.addText('Source: CREDO Impact Tracker & Post-Event Evaluations', {
    x: ML,
    y: LAYOUT.footerY,
    w: CONTENT_W,
    h: 0.2,
    fontFace: FONT_FACE,
    fontSize: 7,
    color: MUTED_GRAY,
    align: 'center',
  });
}

function addSlideOne(pptx, { monthYearLabel, section1Data }) {
  const slide = pptx.addSlide();
  const { monthReach, fytdMissionSupport } = section1Data;
  const leftX = ML;
  const rightX = ML + LAYOUT.sec1PanelW + LAYOUT.sec1PanelGap;

  addSlideHeader(slide, monthYearLabel);
  addSectionBanner(slide, '1. REACH + MISSION SUPPORT', LAYOUT.sec1BannerY);

  addMetricPanel(
    slide,
    leftX,
    LAYOUT.sec1PanelsY,
    LAYOUT.sec1PanelW,
    buildMonthReachRows(monthReach)
  );

  addMetricPanel(
    slide,
    rightX,
    LAYOUT.sec1PanelsY,
    LAYOUT.sec1PanelW,
    buildFytdRows(fytdMissionSupport),
    0.185
  );

  addManpowerPlaceholder(slide);
  addReadinessPlaceholders(slide);
  addPhotoPlaceholders(slide);
  addSlideFooter(slide);
}

function addNotesSection(slide, title, body, y, boxH) {
  slide.addShape('rect', {
    x: ML,
    y,
    w: CONTENT_W,
    h: 0.22,
    fill: { color: NAVY },
    line: { color: NAVY, width: 0 },
  });

  slide.addText(title.toUpperCase(), {
    x: ML + 0.12,
    y: y + 0.03,
    w: CONTENT_W - 0.24,
    h: 0.16,
    fontFace: FONT_FACE,
    fontSize: 8,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
    charSpacing: 0.3,
  });

  slide.addShape('rect', {
    x: ML,
    y: y + 0.24,
    w: CONTENT_W,
    h: boxH,
    fill: { color: 'FFFFFF' },
    line: { color: BORDER_GRAY, width: 1 },
  });

  slide.addText(body, {
    x: ML + 0.12,
    y: y + 0.32,
    w: CONTENT_W - 0.24,
    h: boxH - 0.16,
    fontFace: FONT_FACE,
    fontSize: 9,
    color: BODY_GRAY,
    valign: 'top',
    wrap: true,
  });
}

function addSlideTwo(pptx, { monthYearLabel, notes }) {
  const slide = pptx.addSlide();
  const boxH = 0.92;
  const gap = 0.1;
  let y = 0.98;

  addSlideHeader(slide, `${monthYearLabel} — NOTES`);

  const sections = [
    ['REACH + MISSION SUPPORT — NOTES', noteText(notes.reachNotes, 'Enter reach and mission support notes.')],
    ['MANPOWER / MANNING — NOTES', noteText(notes.manpowerNotes, 'Enter manpower / manning notes.')],
    ['READINESS OUTCOMES — NOTES', noteText(notes.readinessNotes, 'Enter readiness outcomes notes.')],
    ['COMMAND HIGHLIGHTS — NOTES', noteText(notes.commandHighlightsNotes, 'Enter command highlights notes.')],
  ];

  sections.forEach(([title, body]) => {
    addNotesSection(slide, title, body, y, boxH);
    y += 0.22 + boxH + gap;
  });
}

function buildFileName(monthName, year) {
  const safeMonth = String(monthName).replace(/\s+/g, '-');
  return `CREDO-MCI-WEST-Monthly-Impact-Report-${safeMonth}-${year}.pptx`;
}

export async function exportMonthlyImpactReportPptx({
  monthName,
  year,
  section1Data,
  notes,
}) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'CREDO Impact Tracker';
  pptx.subject = 'Monthly Impact Report';
  pptx.title = `CREDO MCI WEST Monthly Impact Report ${monthName} ${year}`;

  const monthYearLabel = `${monthName} ${year}`;

  addSlideOne(pptx, { monthYearLabel, section1Data });
  addSlideTwo(pptx, { monthYearLabel, notes });

  await pptx.writeFile({ fileName: buildFileName(monthName, year) });
}
