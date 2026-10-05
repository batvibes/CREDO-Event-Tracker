/**
 * Trumba / Registration tracker status.
 * Run: node scripts/validate-event-registration-status.js
 *
 * Reads the current app and migration. Does not connect to Supabase
 * and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGISTRATION_STATUS_CLASS,
  REGISTRATION_STATUSES,
  compareRegistrationStatus,
  cycleRegistrationStatus,
  normalizeRegistrationStatus,
} from '../js/registration-status.js';

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
  return source.slice(start, end);
}

const app = read('js/app.js');
const db = read('js/db.js');
const css = read('css/styles.css');
const html = read('index.html');
const migration = read('supabase/migrations/045_event_registration_status.sql');
const reportPdf = read('js/event-report-pdf-export.js');
const aarPdf = read('js/aar-pdf-export.js');
const mirExport = read('js/monthly-report-pptx-export.js');
const trendsPdf = read('js/trends-section-pdf-export.js');
const financialsPdf = read('js/financials-pdf-export.js');
const eventsHead = sliceBetween(html, '<table class="events-table">', '</thead>');
const sortColumns = sliceBetween(app, 'const EVENTS_TABLE_SORT_COLUMNS = [', '];');
const comparators = sliceBetween(app, 'const EVENTS_SORT_COMPARATORS = {', '};');
const ready = sliceBetween(app, 'function countEventsReadyToExecute', 'function isFilterAll');
const statusPill = sliceBetween(app, 'function createStatusPill', 'function renderTable');
const rosterPill = sliceBetween(app, 'function createRosterPill', 'function createRegistrationPill');
const registrationPill = sliceBetween(app, 'function createRegistrationPill', 'function createStatusPill');
const newEvent = sliceBetween(app, 'const newEvent = {', 'const saved = await persistNewEvent');
const eventRead = sliceBetween(db, 'export function eventFromRow', 'function aarAuditEntryFromRow');
const eventWrite = sliceBetween(db, 'export function eventToRow', 'function eventWriteRow');

assert(eventsHead.indexOf('<th>Roster</th>') < eventsHead.indexOf('<th>Trumba / Registration</th>'), 'Trumba / Registration follows Roster');
assert(eventsHead.includes('<th>Reservation</th>') && eventsHead.includes('<th>Catering</th>') && eventsHead.includes('<th>Packout</th>'), 'the existing operational headers remain');
assert(sortColumns.includes("{ key: 'reservation', index: 6 }"), 'Reservation keeps sort index 6');
assert(sortColumns.includes("{ key: 'catering', index: 7 }"), 'Catering keeps sort index 7');
assert(sortColumns.includes("{ key: 'packout', index: 8 }"), 'Packout keeps sort index 8');
assert(sortColumns.includes("{ key: 'roster', index: 9 }"), 'Roster keeps sort index 9');
assert(sortColumns.includes("{ key: 'registration', index: 10 }"), 'Registration sorts at index 10');
assert(comparators.includes('compareWorkflowStatus(a.reservation, b.reservation)'), 'Reservation sort is unchanged');
assert(comparators.includes('compareWorkflowStatus(a.catering, b.catering)'), 'Catering sort is unchanged');
assert(comparators.includes('compareWorkflowStatus(a.packout, b.packout)'), 'Packout sort is unchanged');
assert(comparators.includes('compareTextValues(a.roster, b.roster)'), 'Roster sort is unchanged');
assert(comparators.includes('compareRegistrationStatus(a.registration, b.registration)'), 'Registration sorts by its own status order');
assert(app.includes("const STATUSES = ['Not Started', 'In Progress', 'Complete']"), 'the shared workflow labels stay Not Started, In Progress, and Complete');
assert(statusPill.includes('cycleStatus(event[field])'), 'Reservation, Catering, and Packout still use the shared cycle');
assert(rosterPill.includes("event.roster = isComplete ? 'Need Roster' : 'Complete'"), 'Roster still toggles Need Roster and Complete');
assert(registrationPill.includes('cycleRegistrationStatus(event.registration)'), 'the registration button uses the registration cycle');
assert(registrationPill.includes('REGISTRATION_STATUS_CLASS[current]'), 'the registration button uses the registration style map');
assert(newEvent.includes("reservation: 'Not Started'") && newEvent.includes("roster: 'Need Roster'") && newEvent.includes("registration: 'Not Started'"), 'a new event defaults registration to Not Started and leaves the other statuses alone');
assert(!ready.includes('registration'), 'ready-to-execute still ignores registration');
assert(eventRead.includes("registration: row.registration || 'Not Started'"), 'event reads default a missing registration value to Not Started');
assert(eventWrite.includes('reservation: event.reservation') && eventWrite.includes('catering: event.catering') && eventWrite.includes('packout: event.packout') && eventWrite.includes('roster: event.roster'), 'the existing status writes remain');
assert(eventWrite.includes("registration: event.registration ?? 'Not Started'"), 'event writes include registration');
assert(eventWrite.includes('options.includeRegistration === false'), 'registration is omitted from writes until the column exists');
assert(migration.includes('add column if not exists registration text not null default \'Not Started\''), 'migration 045 adds registration with a Not Started default');
assert(!/update\s+public\.events/i.test(migration), 'migration 045 does not rewrite existing event rows');

assert(REGISTRATION_STATUSES.join('|') === 'Not Started|Registration Created|Registration Live', 'registration has three labels');
assert(cycleRegistrationStatus('Not Started') === 'Registration Created', 'Not Started advances to Registration Created');
assert(cycleRegistrationStatus('Registration Created') === 'Registration Live', 'Registration Created advances to Registration Live');
assert(cycleRegistrationStatus('Registration Live') === 'Not Started', 'Registration Live returns to Not Started');
assert(cycleRegistrationStatus('Anything else') === 'Not Started', 'an unknown registration value returns to Not Started');
assert(normalizeRegistrationStatus(undefined) === 'Not Started', 'a missing registration value is Not Started');
assert(REGISTRATION_STATUS_CLASS['Not Started'] === 'registration-neutral', 'Registration Not Started uses a neutral style');
assert(REGISTRATION_STATUS_CLASS['Registration Created'] === 'in-progress', 'Registration Created uses the in-progress style');
assert(REGISTRATION_STATUS_CLASS['Registration Live'] === 'complete', 'Registration Live uses the complete style');
assert(app.includes("'Not Started': 'not-started'"), 'Reservation, Catering, and Packout Not Started stay on the red style');
assert(css.includes('.status-pill.not-started {\n  background: var(--status-not-started-bg);'), 'the shared Not Started pill stays red');
assert(css.includes('.status-pill.registration-neutral {\n  background: #f3f4f6;\n  color: #6b7280;'), 'Registration Not Started uses the gray roster treatment');
assert(css.includes('.roster-pill.need-roster {\n  background: #f3f4f6;\n  color: #6b7280;'), 'Roster Need Roster stays gray');
const operationalColumns = sliceBetween(css, '#view-events .events-table th:nth-child(7),', '#view-events .events-table td.col-participants');
assert(operationalColumns.includes('width: 132px') && operationalColumns.includes('text-align: center'), 'the four shorter operational columns share a centered width');
assert(operationalColumns.includes('width: 184px'), 'Trumba / Registration is wider than the other operational columns');
assert(!operationalColumns.includes('220px'), 'Trumba / Registration is no longer about twice as wide');
assert(operationalColumns.includes('justify-content: center'), 'operational headers center over their status pills');
assert(
  compareRegistrationStatus('Registration Live', 'Not Started') > 0
    && compareRegistrationStatus('Not Started', 'Registration Created') < 0
    && compareRegistrationStatus('Registration Created', 'Registration Live') < 0,
  'registration sorts Not Started, then Registration Created, then Registration Live',
);
assert(normalizeRegistrationStatus(null) === 'Not Started', 'a null registration value exports as Not Started');
assert(normalizeRegistrationStatus('') === 'Not Started', 'a blank registration value exports as Not Started');
assert(normalizeRegistrationStatus('Registration Created') === 'Registration Created', 'Registration Created exports as itself');
assert(normalizeRegistrationStatus('Registration Live') === 'Registration Live', 'Registration Live exports as itself');

const reportColumns = sliceBetween(reportPdf, 'const COLUMNS = [', '];');
const reportPalette = sliceBetween(reportPdf, 'function statusPalette', 'const COLUMNS');
const reportExport = sliceBetween(app, 'async function exportReportPdf', 'function setupReports');
const reportTable = sliceBetween(html, 'class="events-table reports-table"', 'id="report-body"');
const reportScreen = sliceBetween(app, 'function renderReportTable', 'function generateReport');
const columnWidths = [...reportColumns.matchAll(/width:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
const columnWidthSum = columnWidths.reduce((sum, width) => sum + width, 0);

assert(reportColumns.indexOf("key: 'packout'") < reportColumns.indexOf("key: 'registration'"), 'the PDF places registration after Packout');
assert(reportColumns.includes("key: 'reservation'") && reportColumns.includes("key: 'catering'") && reportColumns.includes("key: 'packout'"), 'the PDF keeps Reservation, Catering, and Packout');
assert(reportColumns.includes("label: 'TRUMBA /\\nREGISTRATION'"), 'the PDF header is Trumba / Registration');
assert(columnWidthSum <= 13.16, `event report columns fit the legal landscape page (${columnWidthSum})`);
assert(reportExport.includes('registration: normalizeRegistrationStatus(event.registration)'), 'the PDF payload uses the event registration value');
assert(reportPalette.includes("columnKey === 'registration' && status === 'Not Started'") && reportPalette.includes('COLORS.neutralBg'), 'PDF Registration Not Started uses the neutral gray');
assert(reportPdf.includes('neutralBg: [243, 244, 246]') && reportPdf.includes('neutralText: [107, 114, 128]'), 'the PDF neutral gray matches the roster gray');
assert(reportPalette.includes("status === 'Registration Created'") && reportPalette.includes('COLORS.progressBg'), 'Registration Created uses the in-progress PDF color');
assert(reportPalette.includes("status === 'Registration Live'") && reportPalette.includes('COLORS.completeBg'), 'Registration Live uses the complete PDF color');
assert(reportPalette.includes('return { background: COLORS.notStartedBg, text: COLORS.notStartedText };'), 'other Not Started PDF statuses stay red');
assert(reportPdf.includes('statusPalette(status, columnKey)') && reportPdf.includes('column.key'), 'PDF status color follows the column');
assert(reportTable.includes('<th>Date</th>') && reportTable.includes('<th>Event Type</th>') && reportTable.includes('<th>Command</th>') && reportTable.includes('Expected Participants') && reportTable.includes('<th>Location</th>'), 'the on-screen Event Report columns stay Date, Event Type, Command, Expected Participants, and Location');
assert(!reportTable.includes('Trumba') && !reportTable.includes('Registration'), 'the on-screen Event Report table does not add registration');
assert(!reportScreen.includes('registration') && !reportScreen.includes('Trumba'), 'the on-screen report renderer does not print registration');
assert(!aarPdf.includes('Trumba') && !aarPdf.includes('registration'), 'AAR PDF export is unchanged');
assert(!mirExport.includes('Trumba') && !trendsPdf.includes('Trumba') && !financialsPdf.includes('Trumba'), 'other report exports do not receive registration');

if (errors.length) {
  console.error(`validate-event-registration-status: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-event-registration-status: PASS');
