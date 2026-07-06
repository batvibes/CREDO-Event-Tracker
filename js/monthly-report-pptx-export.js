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

export const MIR_MANPOWER_MAX_ROWS = 5;

const MANPOWER_ROW_FIELDS = [
  { shapeSuffix: 'name', dataKey: 'name' },
  { shapeSuffix: 'title', dataKey: 'billetOrRole' },
  { shapeSuffix: 'role', dataKey: 'statusNextAction' },
  { shapeSuffix: 'date', dataKey: 'prdEaos' },
];

export function calculateMirSection2Data(teamMembers) {
  const sorted = [...(teamMembers ?? [])].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );
  const rows = sorted.slice(0, MIR_MANPOWER_MAX_ROWS).map((member) => ({
    name: member.name ?? '',
    billetOrRole: member.billetOrRole ?? '',
    statusNextAction: member.statusNextAction ?? '',
    prdEaos: member.prdEaos ?? '',
  }));
  return { rows };
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

function setShapeTextAligned(slideXml, shapeName, text, alignment = 'ctr') {
  const shape = extractShape(slideXml, shapeName);
  const escaped = escapeXml(text);
  let updatedShape = shape;

  if (/<a:pPr[^>]*\balgn="/i.test(updatedShape)) {
    updatedShape = updatedShape.replace(
      /(<a:pPr[^>]*\balgn=")([^"]*)(")/i,
      `$1${alignment}$3`,
    );
  } else {
    updatedShape = updatedShape.replace(/<a:p>/, `<a:p><a:pPr algn="${alignment}"/>`);
  }

  let replaced = false;
  updatedShape = updatedShape.replace(/<a:t>[^<]*<\/a:t>/, (match) => {
    if (replaced) return match;
    replaced = true;
    return `<a:t>${escaped}</a:t>`;
  });
  if (!replaced) {
    throw new Error(`MIR template shape has no <a:t> node: ${shapeName}`);
  }

  return slideXml.replace(shape, updatedShape);
}

function getShapeBounds(slideXml, shapeName) {
  const shape = extractShape(slideXml, shapeName);
  const offMatch = shape.match(/<a:off x="(\d+)" y="(\d+)"/);
  const extMatch = shape.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  if (!offMatch || !extMatch) {
    throw new Error(`MIR template shape has no bounds: ${shapeName}`);
  }

  return {
    x: Number(offMatch[1]),
    y: Number(offMatch[2]),
    cx: Number(extMatch[1]),
    cy: Number(extMatch[2]),
  };
}

function calculateCenteredImagePlacement(frame, imageWidth, imageHeight) {
  const width = Math.max(1, Number(imageWidth));
  const height = Math.max(1, Number(imageHeight));
  const imageAspect = width / height;
  const frameAspect = frame.cx / frame.cy;

  let cx;
  let cy;

  if (imageAspect > frameAspect) {
    cx = frame.cx;
    cy = Math.round(frame.cx / imageAspect);
  } else {
    cy = frame.cy;
    cx = Math.round(frame.cy * imageAspect);
  }

  return {
    x: frame.x + Math.round((frame.cx - cx) / 2),
    y: frame.y + Math.round((frame.cy - cy) / 2),
    cx,
    cy,
  };
}

function hasMirPhotoImage(slotData) {
  return typeof slotData?.imageData === 'string' && slotData.imageData.startsWith('data:image/');
}

function hasMirPhotoText(value) {
  return String(value ?? '').trim().length > 0;
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid MIR photo data URL.');
  }

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    contentType: match[1],
    bytes,
  };
}

function getNextShapeId(slideXml) {
  const ids = [...slideXml.matchAll(/\bid="(\d+)"/g)].map((match) => Number(match[1]));
  return Math.max(0, ...ids) + 1;
}

function getNextMediaFileName(zip) {
  let maxIndex = 0;
  Object.keys(zip.files).forEach((path) => {
    const match = path.match(/^ppt\/media\/image(\d+)\.(jpe?g|png)$/i);
    if (match) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  });
  return `image${maxIndex + 1}.jpeg`;
}

function getNextRelationshipId(relsXml) {
  const ids = [...relsXml.matchAll(/\bId="rId(\d+)"/g)].map((match) => Number(match[1]));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function addSlideImageRelationship(relsXml, mediaTarget) {
  const rId = getNextRelationshipId(relsXml);
  const relationship =
    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaTarget}"/>`;
  return {
    relsXml: relsXml.replace('</Relationships>', `${relationship}</Relationships>`),
    rId,
  };
}

function buildMirPhotoPictureXml({ id, name, rId, x, y, cx, cy }) {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

const MIR_PHOTO_SLOT_CONFIG = [
  {
    slotKey: '1',
    frameShape: 'Rectangle 76',
    labelShape: 'mir_photo_slot_1',
    titleShape: 'mir_photo_slot_1_title',
    captionShape: 'mir_photo_slot_1_caption',
  },
  {
    slotKey: '2',
    frameShape: 'Rectangle 80',
    labelShape: 'mir_photo_slot_2',
    titleShape: 'mir_photo_slot_2_title',
    captionShape: 'mir_photo_slot_2_caption',
  },
  {
    slotKey: '3',
    frameShape: 'Rectangle 84',
    labelShape: 'mir_photo_slot_3',
    titleShape: 'mir_photo_slot_3_title',
    captionShape: 'mir_photo_slot_3_caption',
  },
];

async function applyMirPhotosToSlide1(zip, slideXml, photos = {}) {
  let xml = slideXml;
  const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
  let relsXml = await zip.file(relsPath).async('string');
  let nextShapeId = getNextShapeId(xml);

  for (const slot of MIR_PHOTO_SLOT_CONFIG) {
    const slotData = photos?.[slot.slotKey];
    if (!hasMirPhotoImage(slotData)) continue;

    const imageWidth = Number(slotData.width);
    const imageHeight = Number(slotData.height);
    if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) {
      continue;
    }

    const frame = getShapeBounds(xml, slot.frameShape);
    const placement = calculateCenteredImagePlacement(frame, imageWidth, imageHeight);
    const { bytes } = dataUrlToBytes(slotData.imageData);
    const mediaFileName = getNextMediaFileName(zip);
    const mediaPath = `ppt/media/${mediaFileName}`;

    zip.file(mediaPath, bytes);

    const relationship = addSlideImageRelationship(relsXml, `../media/${mediaFileName}`);
    relsXml = relationship.relsXml;

    const pictureXml = buildMirPhotoPictureXml({
      id: nextShapeId,
      name: `mir_photo_image_${slot.slotKey}`,
      rId: relationship.rId,
      ...placement,
    });
    nextShapeId += 1;

    xml = xml.replace('</p:spTree>', `${pictureXml}</p:spTree>`);
    xml = setShapeText(xml, slot.labelShape, '');

    if (hasMirPhotoText(slotData.eventTitle)) {
      xml = setShapeTextAligned(xml, slot.titleShape, String(slotData.eventTitle).trim(), 'ctr');
    }

    if (hasMirPhotoText(slotData.caption)) {
      xml = setShapeTextAligned(xml, slot.captionShape, String(slotData.caption).trim(), 'ctr');
    }
  }

  zip.file(relsPath, relsXml);
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

function getMirManpowerShapeNames() {
  const shapeNames = [];
  for (let rowIndex = 1; rowIndex <= MIR_MANPOWER_MAX_ROWS; rowIndex += 1) {
    for (const field of MANPOWER_ROW_FIELDS) {
      shapeNames.push(`mir_manpower_row${rowIndex}_${field.shapeSuffix}`);
    }
  }
  return shapeNames;
}

const SLIDE1_SHAPE_NAMES = [
  'mir_month_label',
  'mir_month_reach_commands',
  'mir_month_reach_beneficiaries',
  'mir_month_reach_workshops',
  'mir_month_reach_retreats',
  'mir_fytd_marriage',
  'mir_fytd_personal_growth',
  'mir_fytd_suicide',
  'mir_fytd_retreats',
  'mir_fytd_total',
  'mir_fytd_commands',
  ...getMirManpowerShapeNames(),
];

const SLIDE2_SHAPE_NAMES = [
  'mir_notes_month_label',
  ...NOTES_SECTIONS.map((section) => section.shape),
];

function buildMirReportShapeValues({ monthName, year, section1Data, section2Data, notes }) {
  const monthYearLabel = `${monthName} ${year}`;
  const { monthReach, fytdMissionSupport } = section1Data;
  const values = {};

  values.mir_month_label = monthYearLabel.toUpperCase();
  values.mir_month_reach_commands = formatCount(monthReach.commandsSupported);
  values.mir_month_reach_beneficiaries = formatCount(monthReach.beneficiariesServed);
  values.mir_month_reach_workshops = formatCount(monthReach.workshopsConducted);
  values.mir_month_reach_retreats = formatCount(monthReach.retreatsConducted);
  values.mir_fytd_marriage = formatCount(fytdMissionSupport.marriageEnrichment);
  values.mir_fytd_personal_growth = formatCount(fytdMissionSupport.personalGrowth);
  values.mir_fytd_suicide = formatCount(fytdMissionSupport.suicidePrevention);
  values.mir_fytd_retreats = formatCount(fytdMissionSupport.retreats);
  values.mir_fytd_total = formatCount(fytdMissionSupport.fytdTotal);
  values.mir_fytd_commands = formatCount(fytdMissionSupport.commands);

  for (let rowIndex = 0; rowIndex < MIR_MANPOWER_MAX_ROWS; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const row = section2Data.rows[rowIndex] ?? {};
    for (const field of MANPOWER_ROW_FIELDS) {
      values[`mir_manpower_row${rowNumber}_${field.shapeSuffix}`] = String(row[field.dataKey] ?? '');
    }
  }

  values.mir_notes_month_label = `${monthYearLabel.toUpperCase()} — NOTES / AMPLIFICATION`;
  for (const section of NOTES_SECTIONS) {
    const userText = notes[section.noteKey];
    values[section.shape] = hasUserNote(userText)
      ? String(userText).trim()
      : section.placeholder;
  }

  return values;
}

function applyShapeValuesToSlide(slideXml, shapeNames, shapeValues) {
  let xml = slideXml;
  for (const shapeName of shapeNames) {
    if (!Object.prototype.hasOwnProperty.call(shapeValues, shapeName)) continue;
    xml = setShapeText(xml, shapeName, shapeValues[shapeName]);
  }
  return xml;
}

function applyNotesGuideLines(slideXml, notes) {
  let xml = slideXml;
  for (const section of NOTES_SECTIONS) {
    if (!hasUserNote(notes[section.noteKey])) continue;
    for (const guideLine of section.guideLines) {
      xml = removeShape(xml, guideLine);
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

async function loadMirTemplateBuffer() {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(`Failed to load MIR template (${response.status})`);
  }
  return response.arrayBuffer();
}

const MIR_PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export async function generateMirPresentationBlob({
  monthName,
  year,
  section1Data,
  section2Data,
  notes,
  photos,
}) {
  const templateBuffer = await loadMirTemplateBuffer();
  const output = await buildMirPresentationZip({
    templateBuffer,
    monthName,
    year,
    section1Data,
    section2Data,
    notes,
    photos,
  });

  return new Blob([output], { type: MIR_PPTX_MIME });
}

export async function buildMirPresentationZip({
  templateBuffer,
  monthName,
  year,
  section1Data,
  section2Data,
  notes,
  photos = {},
}) {
  const shapeValues = buildMirReportShapeValues({
    monthName,
    year,
    section1Data,
    section2Data,
    notes,
  });
  const zip = await JSZip.loadAsync(templateBuffer);

  const slide1Path = 'ppt/slides/slide1.xml';
  const slide2Path = 'ppt/slides/slide2.xml';

  const slide1Xml = await zip.file(slide1Path).async('string');
  const slide2Xml = await zip.file(slide2Path).async('string');

  let slide1 = applyShapeValuesToSlide(slide1Xml, SLIDE1_SHAPE_NAMES, shapeValues);
  slide1 = await applyMirPhotosToSlide1(zip, slide1, photos);
  let slide2 = applyShapeValuesToSlide(slide2Xml, SLIDE2_SHAPE_NAMES, shapeValues);
  slide2 = applyNotesGuideLines(slide2, notes);
  zip.file(slide1Path, slide1);
  zip.file(slide2Path, slide2);

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
  section2Data,
  notes,
  photos,
}) {
  const blob = await generateMirPresentationBlob({
    monthName,
    year,
    section1Data,
    section2Data,
    notes,
    photos,
  });

  triggerDownload(blob, buildFileName(monthName, year));
}
