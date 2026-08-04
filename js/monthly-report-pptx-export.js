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

export const MIR_PERSONNEL_CHANGE_MAX_ROWS = 2;

const MIR_PERSONNEL_CHANGES_START = '\n[MIR_PERSONNEL_CHANGES]\n';
const MIR_PERSONNEL_CHANGES_END = '\n[/MIR_PERSONNEL_CHANGES]';

function normalizeMirPersonnelChangeRows(rows) {
  return (rows ?? [])
    .map((row) => ({
      name: String(row?.name ?? '').trim(),
      billetOrPosition: String(row?.billetOrPosition ?? '').trim(),
      date: String(row?.date ?? '').trim(),
    }))
    .filter((row) => row.name || row.billetOrPosition || row.date);
}

export function extractMirManpowerNotesText(value) {
  const raw = String(value ?? '');
  const startIndex = raw.indexOf(MIR_PERSONNEL_CHANGES_START.trim());
  if (startIndex === -1) return raw.trim();
  return raw.slice(0, startIndex).trim();
}

export function extractMirPersonnelChanges(value) {
  const raw = String(value ?? '');
  const startToken = MIR_PERSONNEL_CHANGES_START.trim();
  const endToken = MIR_PERSONNEL_CHANGES_END.trim();
  const startIndex = raw.indexOf(startToken);
  const endIndex = raw.indexOf(endToken);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return { incoming: [], outgoing: [] };
  }

  const jsonText = raw.slice(startIndex + startToken.length, endIndex).trim();
  try {
    const parsed = JSON.parse(jsonText);
    return {
      incoming: normalizeMirPersonnelChangeRows(parsed.incoming),
      outgoing: normalizeMirPersonnelChangeRows(parsed.outgoing),
    };
  } catch (_err) {
    return { incoming: [], outgoing: [] };
  }
}

export function mergeMirManpowerNotesWithPersonnelChanges(notes, changes) {
  const cleanNotes = extractMirManpowerNotesText(notes);
  const payload = {
    incoming: normalizeMirPersonnelChangeRows(changes?.incoming),
    outgoing: normalizeMirPersonnelChangeRows(changes?.outgoing),
  };

  if (payload.incoming.length === 0 && payload.outgoing.length === 0) {
    return cleanNotes;
  }

  return `${cleanNotes}${MIR_PERSONNEL_CHANGES_START}${JSON.stringify(payload)}${MIR_PERSONNEL_CHANGES_END}`.trim();
}

export function calculateMirSection2Data(teamMembers, personnelChanges = { incoming: [], outgoing: [] }) {
  const sorted = [...(teamMembers ?? [])].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );
  const rows = sorted.slice(0, MIR_MANPOWER_MAX_ROWS).map((member) => ({
    name: member.name ?? '',
    billetOrRole: member.billetOrRole ?? '',
    statusNextAction: member.statusNextAction ?? '',
    prdEaos: member.prdEaos ?? '',
  }));
  return {
    rows,
    personnelChanges: {
      incoming: normalizeMirPersonnelChangeRows(personnelChanges.incoming),
      outgoing: normalizeMirPersonnelChangeRows(personnelChanges.outgoing),
    },
  };
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


function updateShapeBounds(slideXml, shapeName, bounds) {
  const shape = extractShape(slideXml, shapeName);
  let updatedShape = shape;
  updatedShape = updatedShape.replace(
    /<a:off x="\d+" y="\d+"\/>/,
    `<a:off x="${bounds.x}" y="${bounds.y}"/>`,
  );
  updatedShape = updatedShape.replace(
    /<a:ext cx="\d+" cy="\d+"\/>/,
    `<a:ext cx="${bounds.cx}" cy="${bounds.cy}"/>`,
  );
  return slideXml.replace(shape, updatedShape);
}

function srgb(color) {
  return String(color).replace('#', '').toUpperCase();
}

function getTextRunXml({ text: value, size = 700, bold = false, color = '00205B' }) {
  return `<a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${srgb(color)}"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:rPr><a:t>${escapeXml(value)}</a:t></a:r>`;
}

function buildMirTextShapeXml({ id, name, x, y, cx, cy, text: value, size = 700, bold = false, color = '00205B', align = 'l' }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="${align}"/>${getTextRunXml({ text: value, size, bold, color })}</a:p></p:txBody></p:sp>`;
}

function buildMirRectShapeXml({ id, name, x, y, cx, cy, fill = 'FFFFFF', line = 'C5CCD8', lineWidth = 6350 }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${srgb(fill)}"/></a:solidFill><a:ln w="${lineWidth}"><a:solidFill><a:srgbClr val="${srgb(line)}"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
}

function insertShapes(slideXml, shapes) {
  return slideXml.replace('</p:spTree>', `${shapes.join('')}</p:spTree>`);
}

function createDisplayPersonnelChangeRows(rows, emptyLabel) {
  const normalized = normalizeMirPersonnelChangeRows(rows);
  if (normalized.length === 0) {
    return [{ name: emptyLabel, billetOrPosition: '', date: '' }];
  }

  const visible = normalized.slice(0, MIR_PERSONNEL_CHANGE_MAX_ROWS);
  const remaining = normalized.length - visible.length;
  if (remaining > 0) {
    visible.push({ name: `+ ${remaining} additional`, billetOrPosition: '', date: '' });
  }
  return visible;
}

function addMirPersonnelChangeTable(shapes, nextIdRef, { x, y, width, sectionTitle, headerFill, titleColor, rows, emptyLabel, dateLabel }) {
  const headerHeight = 177800;
  const columnHeaderHeight = 165100;
  const rowHeight = 228600;
  const nameWidth = 571500;
  const dateWidth = 469900;
  const billetWidth = width - nameWidth - dateWidth;

  shapes.push(buildMirRectShapeXml({ id: nextIdRef.id++, name: `${sectionTitle}_header_fill`, x, y, cx: width, cy: headerHeight, fill: headerFill, line: 'C5CCD8' }));
  shapes.push(buildMirTextShapeXml({ id: nextIdRef.id++, name: `${sectionTitle}_title`, x: x + 76200, y: y + 35560, cx: width - 152400, cy: 101600, text: sectionTitle, size: 820, bold: true, color: titleColor }));

  const headerY = y + headerHeight;
  const columns = [
    { label: 'NAME', x, w: nameWidth },
    { label: 'BILLET / POSITION', x: x + nameWidth, w: billetWidth },
    { label: dateLabel, x: x + nameWidth + billetWidth, w: dateWidth },
  ];
  for (const column of columns) {
    shapes.push(buildMirRectShapeXml({ id: nextIdRef.id++, name: `${sectionTitle}_${column.label}_cell`, x: column.x, y: headerY, cx: column.w, cy: columnHeaderHeight, fill: 'FFFFFF', line: 'C5CCD8' }));
    shapes.push(buildMirTextShapeXml({ id: nextIdRef.id++, name: `${sectionTitle}_${column.label}_text`, x: column.x + 50800, y: headerY + 35560, cx: column.w - 101600, cy: 88900, text: column.label, size: 620, bold: true, color: '00205B' }));
  }

  createDisplayPersonnelChangeRows(rows, emptyLabel).forEach((row, index) => {
    const rowY = headerY + columnHeaderHeight + rowHeight * index;
    const fill = index % 2 === 0 ? 'FFFFFF' : 'F7F9FC';
    const values = [
      { value: row.name, x, w: nameWidth, bold: true },
      { value: row.billetOrPosition, x: x + nameWidth, w: billetWidth, bold: false },
      { value: row.date, x: x + nameWidth + billetWidth, w: dateWidth, bold: true },
    ];
    for (const cell of values) {
      shapes.push(buildMirRectShapeXml({ id: nextIdRef.id++, name: `${sectionTitle}_row${index}_cell`, x: cell.x, y: rowY, cx: cell.w, cy: rowHeight, fill, line: 'C5CCD8' }));
      shapes.push(buildMirTextShapeXml({ id: nextIdRef.id++, name: `${sectionTitle}_row${index}_text`, x: cell.x + 50800, y: rowY + 50800, cx: cell.w - 101600, cy: 88900, text: cell.value, size: 600, bold: cell.bold, color: '00205B' }));
    }
  });
}

function applyMirSection2Layout(slideXml, section2Data) {
  let xml = slideXml;
  const manpowerRows = [
    { bg: 'Rectangle 156', checkbox: 'Rectangle 157', row: 1, y: 2209800 },
    { bg: 'Rectangle 162', checkbox: 'Rectangle 163', row: 2, y: 2552700 },
    { bg: 'Rectangle 168', checkbox: 'Rectangle 169', row: 3, y: 2895600 },
    { bg: 'Rectangle 174', checkbox: 'Rectangle 175', row: 4, y: 3238500 },
    { bg: 'Rectangle 180', checkbox: 'Rectangle 181', row: 5, y: 3581400 },
  ];

  xml = updateShapeBounds(xml, 'TextBox 152', { x: 6502400, y: 1911350, cx: 1257300, cy: 171450 });
  xml = updateShapeBounds(xml, 'TextBox 153', { x: 7950200, y: 1911350, cx: 914400, cy: 171450 });
  xml = updateShapeBounds(xml, 'TextBox 154', { x: 8902700, y: 1911350, cx: 635000, cy: 171450 });
  xml = updateShapeBounds(xml, 'Rectangle 155', { x: 6388100, y: 2101850, cx: 3048000, cy: 8255 });

  for (const row of manpowerRows) {
    xml = updateShapeBounds(xml, row.bg, { x: 6388100, y: row.y, cx: 3048000, cy: 327025 });
    xml = updateShapeBounds(xml, row.checkbox, { x: 6539700, y: row.y + 114300, cx: 107950, cy: 107950 });
    xml = updateShapeBounds(xml, `mir_manpower_row${row.row}_name`, { x: 6743700, y: row.y + 63500, cx: 1016000, cy: 215444 });
    xml = updateShapeBounds(xml, `mir_manpower_row${row.row}_title`, { x: 6743700, y: row.y + 193040, cx: 1016000, cy: 110489 });
    xml = updateShapeBounds(xml, `mir_manpower_row${row.row}_role`, { x: 7975600, y: row.y + 78740, cx: 863600, cy: 200055 });
    xml = updateShapeBounds(xml, `mir_manpower_row${row.row}_date`, { x: 8940800, y: row.y + 78740, cx: 558800, cy: 184150 });
  }

  const shapes = [];
  const nextIdRef = { id: getNextShapeId(xml) };
  shapes.push(buildMirRectShapeXml({ id: nextIdRef.id++, name: 'mir_personnel_changes_divider', x: 9575800, y: 1917700, cx: 9525, cy: 1993900, fill: '9AA7B8', line: '9AA7B8' }));
  shapes.push(buildMirTextShapeXml({ id: nextIdRef.id++, name: 'mir_personnel_changes_heading', x: 9766300, y: 1911350, cx: 1917700, cy: 171450, text: 'PROJECTED PERSONNEL CHANGES', size: 760, bold: true, color: '00205B', align: 'ctr' }));

  const tableX = 9715500;
  const tableWidth = 1974850;
  addMirPersonnelChangeTable(shapes, nextIdRef, {
    x: tableX,
    y: 2146300,
    width: tableWidth,
    sectionTitle: 'INCOMING',
    headerFill: 'EAF4EA',
    titleColor: '107C41',
    rows: section2Data?.personnelChanges?.incoming,
    emptyLabel: 'None projected',
    dateLabel: 'ETA',
  });
  addMirPersonnelChangeTable(shapes, nextIdRef, {
    x: tableX,
    y: 3048000,
    width: tableWidth,
    sectionTitle: 'OUTGOING',
    headerFill: 'FDE8E8',
    titleColor: 'C00000',
    rows: section2Data?.personnelChanges?.outgoing,
    emptyLabel: 'None projected',
    dateLabel: 'PRD / EAOS',
  });
  shapes.push(buildMirTextShapeXml({ id: nextIdRef.id++, name: 'mir_personnel_changes_note', x: tableX, y: 3860800, cx: tableWidth, cy: 88900, text: '* Dates based on current orders / projections and are subject to change.', size: 520, bold: false, color: '00205B' }));

  return insertShapes(xml, shapes);
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
  slide1 = applyMirSection2Layout(slide1, section2Data);
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
