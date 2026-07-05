import JSZip from 'jszip';

const TEMPLATE_URL = '/templates/MIR_Master_Template.pptx';

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function hasUserNote(value) {
  return String(value ?? '').trim().length > 0;
}

function removeShape(slideXml, shapeName) {
  const shape = extractShape(slideXml, shapeName);
  return slideXml.replace(shape, '');
}

function extractShape(slideXml, shapeName) {
  const pattern = new RegExp(
    `<p:sp>(?:(?!</p:sp>).)*?name="${escapeRegex(shapeName)}"(?:(?!</p:sp>).)*?</p:sp>`,
    's',
  );
  const match = slideXml.match(pattern);
  if (!match) {
    throw new Error(`MIR template shape not found: ${shapeName}`);
  }
  return match[0];
}

function setShapeText(slideXml, shapeName, text) {
  const shape = extractShape(slideXml, shapeName);
  const escaped = escapeXml(text);
  let replaced = false;
  const updatedShape = shape.replace(/<a:t>[^<]*<\/a:t>/, (match) => {
    if (replaced) return match;
    replaced = true;
    return `<a:t>${escaped}</a:t>`;
  });
  if (!replaced) {
    throw new Error(`MIR template shape has no <a:t> node: ${shapeName}`);
  }
  return slideXml.replace(shape, updatedShape);
}

function applySection1ToSlide1(slideXml, { monthYearLabel, section1Data }) {
  const { monthReach, fytdMissionSupport } = section1Data;
  let xml = slideXml;

  xml = setShapeText(xml, 'mir_month_label', monthYearLabel.toUpperCase());

  xml = setShapeText(xml, 'mir_month_reach_commands', formatCount(monthReach.commandsSupported));
  xml = setShapeText(xml, 'mir_month_reach_beneficiaries', formatCount(monthReach.beneficiariesServed));
  xml = setShapeText(xml, 'mir_month_reach_workshops', formatCount(monthReach.workshopsConducted));
  xml = setShapeText(xml, 'mir_month_reach_retreats', formatCount(monthReach.retreatsConducted));

  xml = setShapeText(xml, 'mir_fytd_marriage', formatCount(fytdMissionSupport.marriageEnrichment));
  xml = setShapeText(xml, 'mir_fytd_personal_growth', formatCount(fytdMissionSupport.personalGrowth));
  xml = setShapeText(xml, 'mir_fytd_suicide', formatCount(fytdMissionSupport.suicidePrevention));
  xml = setShapeText(xml, 'mir_fytd_retreats', formatCount(fytdMissionSupport.retreats));
  xml = setShapeText(xml, 'mir_fytd_total', formatCount(fytdMissionSupport.fytdTotal));
  xml = setShapeText(xml, 'mir_fytd_commands', formatCount(fytdMissionSupport.commands));

  return xml;
}

const NOTES_SECTIONS = [
  {
    noteKey: 'reachNotes',
    shape: 'mir_notes_reach',
    placeholder: 'Enter reach and mission support notes for this reporting period.',
    guideLines: ['Rectangle 21', 'Rectangle 22', 'Rectangle 23', 'Rectangle 24'],
  },
  {
    noteKey: 'manpowerNotes',
    shape: 'mir_notes_manpower',
    placeholder: 'Enter manpower and manning notes for this reporting period.',
    guideLines: ['Rectangle 27', 'Rectangle 28', 'Rectangle 29', 'Rectangle 30'],
  },
  {
    noteKey: 'readinessNotes',
    shape: 'mir_notes_readiness',
    placeholder: 'Enter readiness outcomes notes for this reporting period.',
    guideLines: ['Rectangle 33', 'Rectangle 34', 'Rectangle 35', 'Rectangle 36'],
  },
  {
    noteKey: 'commandHighlightsNotes',
    shape: 'mir_notes_command_highlights',
    placeholder: 'Enter command highlights notes for this reporting period.',
    guideLines: ['Rectangle 39', 'Rectangle 40', 'Rectangle 41', 'Rectangle 42'],
  },
];

function applyNotesToSlide2(slideXml, { monthYearLabel, notes }) {
  let xml = slideXml;
  const label = `${monthYearLabel.toUpperCase()} — NOTES / AMPLIFICATION`;

  xml = setShapeText(xml, 'mir_notes_month_label', label);

  for (const section of NOTES_SECTIONS) {
    const userText = notes[section.noteKey];
    if (hasUserNote(userText)) {
      xml = setShapeText(xml, section.shape, String(userText).trim());
      for (const guideLine of section.guideLines) {
        xml = removeShape(xml, guideLine);
      }
    } else {
      xml = setShapeText(xml, section.shape, section.placeholder);
    }
  }

  return xml;
}

function buildFileName(monthName, year) {
  const safeMonth = String(monthName).replace(/\s+/g, '-');
  return `CREDO-MCI-WEST-Monthly-Impact-Report-${safeMonth}-${year}.pptx`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function buildMirPresentationZip({
  templateBuffer,
  monthName,
  year,
  section1Data,
  notes,
}) {
  const monthYearLabel = `${monthName} ${year}`;
  const zip = await JSZip.loadAsync(templateBuffer);

  const slide1Path = 'ppt/slides/slide1.xml';
  const slide2Path = 'ppt/slides/slide2.xml';

  const slide1Xml = await zip.file(slide1Path).async('string');
  const slide2Xml = await zip.file(slide2Path).async('string');

  zip.file(slide1Path, applySection1ToSlide1(slide1Xml, { monthYearLabel, section1Data }));
  zip.file(slide2Path, applyNotesToSlide2(slide2Xml, { monthYearLabel, notes }));

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function exportMonthlyImpactReportPptx({
  monthName,
  year,
  section1Data,
  notes,
}) {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(`Failed to load MIR template (${response.status})`);
  }

  const templateBuffer = await response.arrayBuffer();
  const output = await buildMirPresentationZip({
    templateBuffer,
    monthName,
    year,
    section1Data,
    notes,
  });

  triggerDownload(
    new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
    buildFileName(monthName, year),
  );
}
