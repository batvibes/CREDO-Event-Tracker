/**
 * Event-level facilitator history for the profile and the individual PDF.
 * Run: node scripts/validate-facilitator-experience-detail.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildFacilitationEventDetails,
  facilitationAttendanceTotal,
  facilitationDetailCoverageNote,
  facilitationExperiencePresentation,
  formatFacilitationEventDate,
  normalizeFacilitationAttendance,
  summarizeFacilitatorPersonnel,
} from '../js/facilitator-management.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start !== -1 && end !== -1, `missing slice ${startNeedle}`);
  return source.slice(start, end === -1 ? source.length : end);
}

const db = read('js/db.js');
const app = read('js/app.js');
const css = read('css/styles.css');
const pdf = read('js/facilitator-report-pdf-export.js');
const model = read('js/facilitator-management.js');
const attendanceRead = sliceBetween(db, 'async function fetchFacilitationEventRecords', 'const FACILITATOR_MANAGEMENT_PERSON_COLUMNS');
const laneRead = sliceBetween(db, 'function facilitationEvidenceLane', 'async function fetchFacilitationEventRecords');
const fetchSources = sliceBetween(db, 'export async function fetchFacilitatorManagementSources()', 'export async function fetchTeamDirectoryPersonnel');
const profilePaint = sliceBetween(app, 'function openFacilitatorDetail', 'function closeFacilitatorDetail');
const experiencePaint = profilePaint.slice(profilePaint.indexOf('FACILITATOR_EXPERIENCE_HEADING'));
const productToggle = sliceBetween(app, 'function appendFacilitatorExperienceProductCell', 'function appendFacilitatorExperienceDetailRow');
const detailRow = sliceBetween(app, 'function appendFacilitatorExperienceDetailRow', 'function openFacilitatorDetail');
const profilePdf = pdf.slice(pdf.indexOf('export async function exportFacilitatorProfilePdf'));
const tablePdf = sliceBetween(pdf, 'export async function exportFacilitatorTablePdf', 'function ensureSpace');
const detailHeader = sliceBetween(pdf, 'function drawFacilitationDetailHeader', 'function continueFacilitationDetail');
const continuation = sliceBetween(pdf, 'function continueFacilitationDetail', 'function drawFacilitationEventHistory');
const historyPdf = sliceBetween(pdf, 'function drawFacilitationEventHistory', 'function drawProfileExperience');
const detailCss = sliceBetween(css, 'html:has(#facilitator-detail-modal[open])', '#facilitator-qualification-modal {');
const capabilitiesExport = sliceBetween(app, 'async function exportVisibleCapabilitiesPdf', 'async function exportFacilitatorPopulationPdf');
const populationExport = sliceBetween(app, 'async function exportFacilitatorPopulationPdf', 'async function exportVisibleFacilitatorsPdf');
const rosterExport = sliceBetween(app, 'async function exportVisibleFacilitatorsPdf', 'async function exportFacilitatorProductPdf');
const productExport = sliceBetween(app, 'async function exportFacilitatorProductPdf', 'async function exportOpenFacilitatorPdf');

assert(fetchSources.includes(".from('facilitator_event_tokens')"), 'event-level evidence starts from facilitator tokens');
assert(fetchSources.includes('facilitationEvidenceLane(token)'), 'ordinary and T4T tokens are classified before they are joined');
assert(fetchSources.includes('fetchFacilitationEventRecords'), 'attendance is loaded with Facilitator Management, not when a row expands');
assert(laneRead.includes("token?.is_t4t === true") && laneRead.includes("'SafeTalk T4T'") && laneRead.includes("'ASIST T4T'"), 'T4T classification matches the existing aggregate rule');
assert(laneRead.includes("return 'ordinary'"), 'other tokens stay on the ordinary lane');
assert(attendanceRead.includes(".from('events')") && attendanceRead.includes('FACILITATION_EVENT_RECORD_COLUMNS') && db.includes("FACILITATION_EVENT_RECORD_COLUMNS = 'id, participants, start_date, end_date, date, date_type'"), 'attendance comes from the event participants value');
assert(attendanceRead.includes(".in('id', chunk)"), 'event attendance is one bounded lookup by event id');
assert(!/\.(insert|update|delete|upsert)\(/.test(attendanceRead), 'the attendance lookup does not write events');
assert(!/\.(insert|update|delete|upsert)\(/.test(fetchSources), 'the facilitator read does not write');
assert(!model.includes('is_t4t') && !model.includes('isT4t'), 'the personnel model does not reclassify the Event T4T flag');
assert(!model.includes(".from('events')") && !pdf.includes('.from(') && !pdf.includes('supabase'), 'the profile model and PDF do not query the database');

assert(normalizeFacilitationAttendance('18').attendance === 18, 'a numeric attendance string is kept');
assert(normalizeFacilitationAttendance(0).attendanceRecorded === true && normalizeFacilitationAttendance('0').attendance === 0, 'a real zero stays distinct from missing attendance');
assert(normalizeFacilitationAttendance(null).attendanceRecorded === false, 'null attendance is missing');
assert(normalizeFacilitationAttendance('').attendanceRecorded === false, 'blank attendance is missing');
assert(normalizeFacilitationAttendance('TBD').attendanceRecorded === false, 'TBD attendance is missing');
assert(normalizeFacilitationAttendance('18 people').attendanceRecorded === false, 'unusable attendance is missing');
assert(facilitationAttendanceTotal([
  { attendance: 18, attendanceRecorded: true },
  { attendance: null, attendanceRecorded: false },
  { attendance: 0, attendanceRecorded: true },
]) === 18, 'a total sums known numbers and does not turn a missing value into zero');
assert(facilitationAttendanceTotal([
  { attendance: null, attendanceRecorded: false },
  { attendance: null, attendanceRecorded: false },
]) == null, 'a total is empty when every attendance value is missing');

const tokens = [
  { lane: 'ordinary', person_id: 'doria', product_id: 'safetalk', event_id: 'event-1', recorded_on: '2024-11-14' },
  { lane: 'ordinary', person_id: 'doria', product_id: 'safetalk', event_id: 'event-1', recorded_on: '2024-11-14' },
  { lane: 'ordinary', person_id: 'doria', product_id: 'safetalk', event_id: 'event-2', recorded_on: '2024-10-03' },
  { lane: 'ordinary', person_id: 'doria', product_id: 'safetalk', event_id: 'future', recorded_on: '2027-01-01' },
  { lane: 't4t', person_id: 'doria', product_id: 'safetalk', event_id: 'event-1', recorded_on: '2025-02-07' },
  { lane: 'ordinary', person_id: 'doria', product_id: 'safetalk', event_id: 'undated' },
];
const eventRows = [
  { id: 'event-1', participants: '24', date_type: 'single', start_date: '2024-11-14', end_date: '2024-11-14' },
  { id: 'event-2', participants: 'TBD', date_type: 'range', start_date: '2024-10-03', end_date: '2024-10-05' },
  { id: 'event-3', participants: '9', date_type: 'single', start_date: '2024-01-01', end_date: '2024-01-01' },
];
const details = buildFacilitationEventDetails(tokens, eventRows, '2026-10-05');
const ordinary = details.filter((row) => row.lane === 'ordinary' && row.personId === 'doria' && row.productId === 'safetalk');
const t4t = details.filter((row) => row.lane === 't4t');
assert(ordinary.map((row) => row.eventId).join('|') === 'event-2|event-1', 'ordinary detail is one row per event, oldest first, with duplicates removed');
assert(!ordinary.some((row) => row.eventId === 'future' || row.eventId === 'undated'), 'future and undated tokens do not become detail rows');
assert(ordinary[0].attendanceRecorded === false && ordinary[0].attendance == null, 'missing event attendance stays missing');
assert(ordinary[1].attendance === 24 && ordinary[1].attendanceRecorded === true, 'detail attendance is the joined participants value');
assert(formatFacilitationEventDate(ordinary[0]) === '10/03/24 – 10/05/24', 'a date range uses the recorded facilitation date format');
assert(t4t.length === 1 && t4t[0].eventId === 'event-1' && t4t[0].attendance === 24, 'the same event can remain T4T evidence without replacing the ordinary row');
assert(facilitationAttendanceTotal(ordinary) === 24, 'the ordinary total ignores the missing attendance row');

const products = [{ id: 'safetalk', name: 'safeTALK', code: 'safetalk', sort_order: 1, active: true }];
const personnel = summarizeFacilitatorPersonnel(
  [{ id: 'doria', name: 'Jeff Doria', rank_title: 'Chaplain', active: true, is_facilitator: true }],
  [{
    person_id: 'doria',
    product_id: 'safetalk',
    events_conducted: 9,
    first_recorded_facilitation_on: '2024-10-03',
    most_recent_facilitation_on: '2026-09-22',
  }],
  [],
  products,
  [{
    person_id: 'doria',
    product_id: 'safetalk',
    events_conducted: 1,
    first_recorded_facilitation_on: '2025-02-07',
    most_recent_facilitation_on: '2025-02-07',
  }],
  [],
  details,
);
const person = personnel[0];
assert(person.eventsConducted === 10 && person.experience[0].eventsConducted === 9, 'aggregate counts stay on the derived experience');
assert(person.experience[0].facilitationEvents.length === 2, 'ordinary detail stays on the ordinary product row');
assert(person.t4tExperience[0].facilitationEvents.length === 1, 'T4T detail stays on the T4T product row');
assert(person.experience[0].facilitationEvents.every((row) => row.lane === 'ordinary'), 'an ordinary row does not absorb T4T deliveries');
const presentation = facilitationExperiencePresentation(person.experience[0]);
assert(presentation.events.map((row) => row.dateLabel).join('|') === '10/03/24 – 10/05/24|11/14/24', 'the shared presentation keeps chronological dates');
assert(presentation.events.map((row) => row.attendanceLabel).join('|') === '—|24', 'the shared presentation keeps missing and numeric attendance');
assert(presentation.totalAttendance === 24 && presentation.totalAttendanceLabel === '24', 'the PDF and profile share one attendance total');
assert(presentation.coverageNote === 'Event-level detail available for 2 of 9 recorded facilitations.', 'a short event list keeps the larger aggregate visible');
assert(facilitationDetailCoverageNote(2, 2) === '', 'a complete event list does not add a mismatch note');
assert(person.experience[0].firstRecordedOn === '2024-10-03' && person.experience[0].mostRecentOn === '2026-09-22', 'first and most recent aggregate dates stay unchanged');

assert(productToggle.includes("button.type = 'button'") && productToggle.includes('aria-expanded') && productToggle.includes('Show ${name} facilitation history'), 'the product control is a collapsed disclosure button');
assert(detailRow.includes('Hide') && detailRow.includes('aria-expanded') && detailRow.includes('detail.hidden = true'), 'history starts collapsed and can be hidden again');
assert(detailRow.includes('cell.colSpan = 4') && detailRow.includes('facilitator-experience-detail-row'), 'expanded history uses one cell across the summary columns');
assert(detailRow.includes("dateHeading.textContent = 'Date'") && detailRow.includes("attendanceHeading.textContent = 'Attendance'") && detailRow.includes('event.attendanceLabel') && detailRow.includes('Total Attendance'), 'the expanded history shows date, attendance, and the total');
assert(detailRow.includes('presentation.coverageNote'), 'a mismatch note uses the shared presentation');
assert(experiencePaint.includes('appendFacilitatorExperienceProductCell') && experiencePaint.includes('appendFacilitatorExperienceDetailRow'), 'both experience tables can disclose their own history');
assert(profilePaint.includes("wrap.className = 'table-wrap'") && profilePaint.includes("t4tWrap.className = 'table-wrap'"), 'experience tables keep the single profile scroller');
assert(!experiencePaint.includes("addEventListener('click'") && detailRow.includes("toggle.addEventListener('click'"), 'only the product control toggles the history');

assert(profilePdf.includes('drawProfileExperience') && historyPdf.includes('facilitationExperiencePresentation'), 'the individual PDF uses the same detail model');
assert(detailHeader.includes("pdf.text('Date'") && detailHeader.includes("pdf.text('Attendance'") && historyPdf.includes('Total Attendance:'), 'the individual PDF lists date, attendance, and the total');
assert(historyPdf.includes('continueFacilitationDetail') && continuation.includes('pdf.addPage()') && continuation.includes('drawFacilitationDetailHeader'), 'a long history continues on the next page with its column labels');
assert(!tablePdf.includes('drawFacilitationEventHistory') && !tablePdf.includes('Total Attendance'), 'shared table PDFs do not gain event history');
for (const surface of [capabilitiesExport, populationExport, rosterExport, productExport]) {
  assert(surface.includes('exportFacilitatorTablePdf') && !surface.includes('exportFacilitatorProfilePdf'), 'roster, capability, and product exports stay summary reports');
}

assert(detailCss.includes('width: min(960px, calc(100vw - 32px))'), 'the profile modal stays viewport-safe');
assert(detailCss.includes('table-layout: fixed'), 'the summary table keeps controlled column widths');
assert(detailCss.includes('width: 40%') && detailCss.includes('width: 15%') && detailCss.includes('width: 22.5%'), 'summary columns leave room for the date fields');
assert(detailCss.includes('td.facilitator-experience-product') && detailCss.includes('overflow-wrap: anywhere'), 'long product names wrap inside the product column');
assert(detailCss.includes('grid-template-columns: minmax(0, 1fr) auto'), 'expanded date and attendance share the full detail width');
assert(detailCss.includes('overflow-y: auto') && detailCss.includes('#facilitator-detail-modal .modal-body'), 'the profile body remains the vertical scroller');
assert(detailCss.includes('#facilitator-detail-modal .table-wrap') && detailCss.includes('overflow-y: visible') && detailCss.includes('max-height: none'), 'experience tables are not given a tiny vertical viewport');
const productModalCss = css.slice(css.indexOf('#facilitator-product-modal {'));
assert(!productModalCss.includes('td.facilitator-experience-product') && !productModalCss.includes('width: 40%'), 'the profile column layout stays on the facilitator profile');
const historyCss = sliceBetween(detailCss, '#facilitator-detail-modal .facilitator-experience-history {', '#facilitator-detail-modal .facilitator-experience-event,');
assert(historyCss.includes('overflow: visible') && historyCss.includes('max-height: none'), 'expanded history stays in the profile body flow');
assert(!/overflow-y:\s*auto/.test(historyCss) && !/max-height:\s*\d/.test(historyCss), 'expanded history does not become its own scroller');

let migrationStatus = '';
try {
  migrationStatus = execFileSync('git', ['status', '--short', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
const migrationLines = migrationStatus.split('\n').map((line) => line.trim()).filter(Boolean);
assert(migrationLines.every((line) => line.includes('048_merge_command_reference.sql')), 'facilitator experience detail adds no migration');

if (errors.length) {
  console.error(`validate-facilitator-experience-detail: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-facilitator-experience-detail: ok');
