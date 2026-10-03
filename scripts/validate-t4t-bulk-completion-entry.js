/**
 * Bulk Record T4T Completions checks.
 * Run: node scripts/validate-t4t-bulk-completion-entry.js
 *
 * Does not connect to Supabase and does not record completions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyCreatedPerson,
  attendanceCountLabel,
  attendanceRosterDiff,
  attendeeMatchText,
  buildParticipantReviews,
  calendarDate,
  canRecordT4tCompletions,
  completionDateMessage,
  localCalendarToday,
  completionAlreadyRecorded,
  confirmParticipantChoice,
  defaultT4tCompletionDate,
  eventAttendanceRecorded,
  eventSourcedAttendance,
  isDuplicateCompletionError,
  newDirectoryPersonInput,
  parseParticipantLines,
  rosterIncludesPerson,
  summarizeT4tCompletionResults,
  t4tCompletionActionVisible,
  t4tCompletionTarget,
} from '../js/t4t-completion-entry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const products = [
  { id: 'safetalk-id', name: 'safeTALK', code: 'safetalk' },
  { id: 'safetalk-t4t-id', name: 'safeTALK T4T', code: 'safetalk_t4t' },
  { id: 'asist-id', name: 'ASIST', code: 'asist' },
  { id: 'asist-t4t-id', name: 'ASIST T4T', code: 'asist_t4t' },
  { id: 'gottman-id', name: 'Gottman, Seven Principles of Making Marriage Work', code: 'gottman_seven_principles' },
  { id: 'prep-id', name: 'PREP 8.0', code: 'prep_8_0' },
  { id: 'lenses-id', name: '4 Lenses', code: 'four_lenses' },
  { id: 'strengths-id', name: 'CliftonStrengths, Strengths Discovery Encounter', code: 'cliftonstrengths_strengths_discovery_encounter' },
  { id: 'chapter-id', name: 'Navigating Your Next Chapter', code: 'navigating_your_next_chapter' },
  { id: 'retreat-id', name: 'Marriage Enrichment Retreat', code: 'marriage_enrichment_retreat' },
];

function target(event) {
  return t4tCompletionTarget(event, products);
}

const safetalk = target({ eventType: 'SafeTalk T4T', isT4t: false });
assert(safetalk.eligible && safetalk.productId === 'safetalk-id' && safetalk.productCode === 'safetalk' && safetalk.productName === 'safeTALK', 'SafeTalk T4T records the ordinary safeTALK product');
assert(safetalk.productId !== 'safetalk-t4t-id', 'SafeTalk T4T does not use the dedicated T4T product');

const asist = target({ eventType: 'ASIST T4T' });
assert(asist.eligible && asist.productId === 'asist-id' && asist.productCode === 'asist' && asist.productName === 'ASIST', 'ASIST T4T records the ordinary ASIST product');
assert(asist.productId !== 'asist-t4t-id', 'ASIST T4T does not use the dedicated T4T product');

assert(target({ eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: 'gottman-id' }).productCode === 'gottman_seven_principles', 'MEW T4T with Gottman uses Gottman');
assert(target({ eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: 'prep-id' }).productCode === 'prep_8_0', 'MEW T4T with PREP uses PREP 8.0');
assert(target({ eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: 'lenses-id' }).productCode === 'four_lenses', 'PGW T4T with 4 Lenses uses 4 Lenses');
assert(target({ eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: 'strengths-id' }).productCode === 'cliftonstrengths_strengths_discovery_encounter', 'PGW T4T with CliftonStrengths uses that product');
assert(target({ eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: 'chapter-id' }).productCode === 'navigating_your_next_chapter', 'PGW T4T with Navigating Your Next Chapter uses that product');

function actionVisible(event) {
  return t4tCompletionActionVisible({ canEdit: true, event, products });
}
assert(actionVisible({ eventType: 'ASIST T4T' }) === true && target({ eventType: 'ASIST T4T' }).productName === 'ASIST', 'ASIST T4T shows attendance for ordinary ASIST');
assert(actionVisible({ eventType: 'SafeTalk T4T' }) === true && target({ eventType: 'SafeTalk T4T' }).productName === 'safeTALK', 'SafeTalk T4T shows attendance for ordinary safeTALK');
assert(actionVisible({ eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: 'prep-id' }) === true, 'MEW T4T with PREP shows attendance');
assert(actionVisible({ eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: 'gottman-id' }) === true, 'MEW T4T with Gottman shows attendance');
assert(actionVisible({ eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: 'lenses-id' }) === true, 'PGW T4T with 4 Lenses shows attendance');
assert(actionVisible({ eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: 'strengths-id' }) === true, 'PGW T4T with CliftonStrengths shows attendance');
assert(actionVisible({ eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: 'chapter-id' }) === true, 'PGW T4T with Navigating Your Next Chapter shows attendance');
assert(actionVisible({ eventType: 'ASIST Workshop' }) === false, 'an ordinary ASIST Workshop hides attendance');
assert(actionVisible({ eventType: 'SafeTalk Workshop' }) === false, 'an ordinary safeTALK Workshop hides attendance');
assert(actionVisible({ eventType: 'Marriage Enrichment Workshop', isT4t: false, curriculumProductId: 'prep-id' }) === false, 'an ordinary MEW hides attendance');
assert(actionVisible({ eventType: 'Personal Growth Workshop', isT4t: false, curriculumProductId: 'lenses-id' }) === false, 'an ordinary PGW hides attendance');
assert(actionVisible({ eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: null }) === false, 'MEW T4T without a curriculum hides attendance');
assert(actionVisible({ eventType: 'Personal Growth Workshop', isT4t: true }) === false, 'PGW T4T without a curriculum hides attendance');
assert(actionVisible(null) === false, 'a new unsaved event hides attendance');

for (const event of [
  { eventType: 'SafeTalk Workshop' },
  { eventType: 'ASIST Workshop' },
  { eventType: 'Marriage Enrichment Retreat' },
  { eventType: 'Marriage Enrichment Workshop', isT4t: false, curriculumProductId: 'prep-id' },
  { eventType: 'Personal Growth Workshop', isT4t: false, curriculumProductId: 'lenses-id' },
  { eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: null },
  { eventType: 'Personal Growth Workshop', isT4t: true },
  { eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: 'safetalk-t4t-id' },
]) {
  assert(target(event).eligible === false, `${event.eventType} is not an eligible completion source in this state`);
}

assert(t4tCompletionActionVisible({ canEdit: true, event: { eventType: 'SafeTalk T4T' }, products }) === true, 'editors see the action on an eligible event');
assert(t4tCompletionActionVisible({ canEdit: false, event: { eventType: 'SafeTalk T4T' }, products }) === false, 'viewers do not see the action');
assert(t4tCompletionActionVisible({
  canEdit: true,
  event: { eventType: 'Marriage Enrichment Workshop', isT4t: false, curriculumProductId: 'prep-id' },
  products,
}) === false, 'an ordinary workshop does not show the action');

const exactPeople = [
  { id: 'john', name: 'John Adams', rank_title: 'LCDR', command_organization: 'Naval Hospital', active: true },
];
const exact = buildParticipantReviews('John Adams', exactPeople, [])[0];
assert(exact.status === 'exact' && exact.resolution === 'ready' && exact.selectedPersonId === 'john', 'an exact participant is ready');
assert(exact.candidates[0].rankTitle === 'LCDR' && exact.candidates[0].commandOrganization === 'Naval Hospital', 'exact review keeps rank and command for display');

const probable = buildParticipantReviews('LT John Adams', exactPeople, [])[0];
assert(probable.status === 'probable' && probable.resolution === 'pending' && probable.selectedPersonId == null, 'a probable participant waits for confirmation');
assert(canRecordT4tCompletions({
  completedOn: '2026-04-01',
  target: safetalk,
  rows: [probable],
}) === false, 'an unconfirmed probable row blocks recording');
const confirmed = confirmParticipantChoice(probable, 'john');
assert(confirmed.resolution === 'ready' && confirmed.selectedPersonId === 'john', 'Use this person resolves a probable row');

const ambiguousPeople = [
  { id: 'a', name: 'John Adams', rank_title: 'LCDR', command_organization: 'Clinic', active: true },
  { id: 'b', name: 'John Adams', rank_title: 'LT', command_organization: '', active: false },
];
const ambiguous = buildParticipantReviews('John Adams', ambiguousPeople, [])[0];
assert(ambiguous.status === 'ambiguous' && ambiguous.candidates.length === 2 && ambiguous.selectedPersonId == null, 'ambiguous participants are not selected automatically');
assert(canRecordT4tCompletions({ completedOn: '2026-04-01', target: safetalk, rows: [ambiguous] }) === false, 'an ambiguous row blocks recording until a person is chosen');
const chosen = confirmParticipantChoice(ambiguous, 'b');
assert(chosen.selectedPersonId === 'b' && chosen.candidates.find((candidate) => candidate.personId === 'b').active === false, 'an inactive ambiguous candidate can be chosen and stays inactive');

const createdInput = newDirectoryPersonInput({
  name: '  Robert   Jones ',
  rankTitle: '',
  commandOrganization: '',
  installation: 'Navy Region',
});
assert(createdInput.name === 'Robert Jones', 'a civilian name is saved without a rank');
assert(createdInput.rankTitle === '' && createdInput.commandOrganization === '', 'rank and command stay optional');
assert(createdInput.isFacilitator === false && createdInput.isCredoStaff === false && createdInput.isPoc === false, 'a new completion participant does not receive role flags');
assert(createdInput.id == null && !Object.prototype.hasOwnProperty.call(createdInput, 'active'), 'new-person input leaves active to the directory save');
assert(newDirectoryPersonInput({ name: '   ' }) == null, 'a blank new person is not submitted');
const newRow = buildParticipantReviews('Pat Noone', exactPeople, [])[0];
assert(newRow.status === 'new' && newRow.resolution === 'pending', 'an unknown participant stays new until creation is confirmed');
assert(canRecordT4tCompletions({ completedOn: '2026-04-01', target: safetalk, rows: [newRow] }) === false, 'a new row blocks recording before creation');
const createdRow = applyCreatedPerson(newRow, {
  id: 'pat',
  name: 'Pat Noone',
  rank_title: '',
  command_organization: '',
  installation: '',
  active: true,
});
assert(createdRow.resolution === 'ready' && createdRow.selectedPersonId === 'pat', 'an explicit create resolves the new row');

const inactive = buildParticipantReviews('Jane Smith', [
  { id: 'jane', name: 'Jane Smith', rank_title: '', command_organization: '', active: false },
], [])[0];
assert(inactive.status === 'exact' && inactive.selectedPersonId === 'jane' && inactive.candidates[0].active === false, 'an inactive exact match stays inactive');
const inactiveSnapshot = JSON.stringify(inactive.candidates[0]);
confirmParticipantChoice(inactive, 'jane');
assert(JSON.stringify(inactive.candidates[0]) === inactiveSnapshot, 'choosing an inactive person does not change that person');

const civilian = buildParticipantReviews('Robert Jones', [
  { id: 'robert', name: 'Robert Jones', rank_title: '', command_organization: '', active: true },
], [])[0];
assert(civilian.status === 'exact' && civilian.candidates[0].rankTitle === '' && civilian.candidates[0].commandOrganization === '', 'a civilian with no rank or command matches exactly');

assert(parseParticipantLines('John Adams\n\nLT John Adams\njohn   adams').join('|') === 'John Adams|LT John Adams', 'blank lines are ignored and only identical normalized lines are collapsed');

assert(defaultT4tCompletionDate({ startDate: '2026-04-02', endDate: '2026-04-05', date: '2026-04-02' }) === '2026-04-02', 'the default completion date is the start date');
assert(defaultT4tCompletionDate({ start_date: '', date: '2026-03-01', end_date: '2026-03-04' }) === '2026-03-01', 'a missing start date falls back to the legacy event date');
assert(defaultT4tCompletionDate({ startDate: 'TBD', date: '2026-03-01', endDate: '2026-03-09' }) === '', 'TBD does not become a completion date and the end date is not used');
assert(defaultT4tCompletionDate({ endDate: '2026-03-09' }) === '', 'an end date alone is not a completion date');
assert(calendarDate('2026-02-31') === '', 'an impossible calendar date is rejected');

function shiftLocalDate(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localCalendarToday(date);
}

const today = localCalendarToday();
const yesterday = shiftLocalDate(today, -1);
const tomorrow = shiftLocalDate(today, 1);
assert(canRecordT4tCompletions({ completedOn: yesterday, target: safetalk, rows: [exact], today }) === true, 'yesterday is a valid completion date');
assert(canRecordT4tCompletions({ completedOn: today, target: safetalk, rows: [exact], today }) === true, 'today is a valid completion date');
assert(canRecordT4tCompletions({ completedOn: tomorrow, target: safetalk, rows: [exact], today }) === false, 'tomorrow is not a valid completion date');
assert(completionDateMessage(tomorrow, today) === 'Completion date cannot be in the future.', 'a future completion date explains why it cannot be recorded');
assert(completionDateMessage(today, today) === '' && completionDateMessage(yesterday, today) === '', 'today and earlier dates do not show a future-date error');
assert(t4tCompletionActionVisible({
  canEdit: true,
  event: { eventType: 'SafeTalk T4T', startDate: tomorrow },
  products,
}) === true, 'a future T4T event still offers completion entry');
assert(defaultT4tCompletionDate({
  startDate: tomorrow,
  endDate: shiftLocalDate(tomorrow, 2),
  date: tomorrow,
}) === tomorrow, 'a future event still defaults to its start date');
assert(canRecordT4tCompletions({
  completedOn: defaultT4tCompletionDate({ startDate: tomorrow, date: tomorrow }),
  target: safetalk,
  rows: [exact],
  today,
}) === false, 'a future event default keeps Record Completions disabled');
assert(canRecordT4tCompletions({ completedOn: today, target: safetalk, rows: [exact], today }) === true, 'changing a future completion date to today allows recording when the rows are resolved');
assert(canRecordT4tCompletions({ completedOn: 'TBD', target: safetalk, rows: [exact], today }) === false, 'TBD is not a valid completion date');
assert(canRecordT4tCompletions({ completedOn: '04/01/2026', target: safetalk, rows: [exact], today }) === false, 'a non-ISO completion date is invalid');

const prior = [{ person_id: 'john', product_id: 'safetalk-id', completed_on: '2026-04-02', source_event_id: 'event-1' }];
assert(completionAlreadyRecorded(prior, {
  personId: 'john',
  productId: 'safetalk-id',
  completedOn: '2026-05-01',
  sourceEventId: 'event-1',
}) === true, 'the same person, product, and source event is already recorded');
assert(isDuplicateCompletionError({ hint: 'T4T_COMPLETION_DUPLICATE' }) && isDuplicateCompletionError({ code: 'T4T_COMPLETION_EVENT_DUPLICATE' }), 'duplicate RPC results stay duplicate results');
const summary = summarizeT4tCompletionResults([
  { outcome: 'recorded' },
  { outcome: 'already-recorded' },
  { outcome: 'failed' },
]);
assert(summary.recorded === 1 && summary.alreadyRecorded === 1 && summary.failed === 1, 'recorded, already recorded, and failed rows stay separate');

assert(attendeeMatchText({ firstName: 'Jane', lastName: '' }) === '', 'a last name is required before matching');
assert(attendeeMatchText({ firstName: '', lastName: 'Smith' }) === '', 'a first name is required before matching');
assert(attendeeMatchText({ rank: '', firstName: 'Jane', lastName: 'Smith', command: '1st Marine Division', installation: 'Camp Pendleton' }) === 'Jane Smith', 'rank, command, and installation stay optional');
assert(attendeeMatchText({ rank: 'HM2', firstName: ' Jane ', lastName: ' Smith ' }) === 'HM2 Jane Smith', 'rank plus first and last name is the match text');
assert(attendanceCountLabel(1) === '1 attendee' && attendanceCountLabel(3) === '3 attendees', 'the roster count uses singular and plural wording');

const loadedRoster = eventSourcedAttendance([
  { person_id: 'john', product_id: 'safetalk-id', completed_on: '2026-04-02', source_event_id: 'event-1' },
  { person_id: 'jane', product_id: 'safetalk-id', completed_on: '2026-04-02', source_event_id: null },
  { person_id: 'jane', product_id: 'safetalk-id', completed_on: '2026-05-01', source_event_id: 'event-2' },
  { person_id: 'pat', product_id: 'asist-id', completed_on: '2026-04-02', source_event_id: 'event-1' },
], {
  eventId: 'event-1',
  productId: 'safetalk-id',
  people: exactPeople,
});
assert(loadedRoster.map((row) => row.personId).join('|') === 'john', 'opening attendance loads only this event and qualification product');
assert(eventAttendanceRecorded(prior, { personId: 'john', productId: 'safetalk-id', sourceEventId: 'event-1' }) === true, 'the same person, product, and source event is attendance for that event');
assert(eventAttendanceRecorded([
  { person_id: 'john', product_id: 'safetalk-id', completed_on: '2026-04-02', source_event_id: null },
], { personId: 'john', productId: 'safetalk-id', sourceEventId: 'event-1' }) === false, 'a same-date manual row is not attendance for an event');
assert(eventAttendanceRecorded(prior, { personId: 'john', productId: 'safetalk-id', sourceEventId: 'event-2' }) === false, 'a different event is not attendance for this event');
assert(loadedRoster[0].completedOn === '2026-04-02' && loadedRoster[0].rankTitle === 'LCDR', 'a loaded attendee keeps the saved date and canonical rank');
assert(rosterIncludesPerson(loadedRoster, 'john') === true && rosterIncludesPerson(loadedRoster, 'jane') === false, 'a person already on the roster is recognized, and other history is not');
const removal = attendanceRosterDiff(loadedRoster, []);
assert(removal.remove.map((row) => row.personId).join('|') === 'john' && removal.add.length === 0, 'dropping a loaded attendee is a removal');
const addition = attendanceRosterDiff(loadedRoster, [...loadedRoster, { personId: 'ada', pendingPerson: null }]);
assert(addition.add.map((row) => row.personId).join('|') === 'ada' && addition.remove.length === 0, 'a roster person who is not saved yet is an addition');
const unchanged = attendanceRosterDiff(loadedRoster, loadedRoster.map((row) => ({ ...row, completedOn: '2026-09-01' })));
assert(unchanged.add.length === 0 && unchanged.remove.length === 0, 'changing the completion date does not rewrite an attendee who stays on the roster');
const stagedNew = attendanceRosterDiff([], [{ personId: null, pendingPerson: { name: 'Pat Noone' } }]);
assert(stagedNew.add.length === 1 && stagedNew.remove.length === 0, 'the diff helper can still tell a missing person from a saved roster');

const moduleSource = read('js/t4t-completion-entry.js');
const app = read('js/app.js');
const db = read('js/db.js');
const opener = app.slice(app.indexOf('async function openT4tCompletionDialog'), app.indexOf('function createDeleteButton'));
const recordWrapper = db.slice(db.indexOf('export async function recordFacilitatorT4tCompletion'), db.indexOf('export async function deleteFacilitatorQualification'));
const entrySources = db.slice(db.indexOf('export async function fetchT4tCompletionEntrySources'), db.indexOf('function t4tCompletionRpcError'));
const facilitatorPeople = db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf(".from('facilitator_product_experience')"));
const writeAttendance = moduleSource.slice(moduleSource.indexOf('async function writeAttendance'), moduleSource.indexOf('async function addExistingPerson'));
const createPerson = moduleSource.slice(moduleSource.indexOf('async function createAndRecordPerson'), moduleSource.indexOf('async function removeAttendee'));
const removeAttendee = moduleSource.slice(moduleSource.indexOf('async function removeAttendee'), moduleSource.indexOf('function refreshSuggestion'));
const requestClose = moduleSource.slice(moduleSource.indexOf('function requestClose'), moduleSource.indexOf('const closeBtn'));

assert(moduleSource.includes('matchDirectoryPerson'), 'adding an attendee uses the identity matcher');
assert(moduleSource.includes('Use Existing') && moduleSource.includes('This Is A Different Person') && moduleSource.includes('Add As New') && moduleSource.includes('No existing person found. Adding this attendee will create a new person.'), 'name suggestions appear before attendance is recorded');
assert(!moduleSource.includes('Create New Person'), 'adding a new person does not ask for a second confirmation');
assert(moduleSource.includes('Inactive'), 'inactive people stay labeled inactive');
assert(!moduleSource.includes('Participant Names') && !moduleSource.includes('textarea') && !moduleSource.includes('Review Participants'), 'the participant textarea and bulk review are gone');
assert(moduleSource.includes('>Rank<') === false && moduleSource.includes("'Rank'") && moduleSource.includes("'First Name'") && moduleSource.includes("'Last Name'") && moduleSource.includes("'Command'") && moduleSource.includes("'Installation'"), 'attendance entry uses rank, first name, last name, command, and installation');
assert(moduleSource.includes("textField('First Name', 't4t-attendee-first', state.form.firstName, true)") && moduleSource.includes("textField('Last Name', 't4t-attendee-last', state.form.lastName, true)"), 'first and last name are required');
assert(moduleSource.includes("textField('Rank', 't4t-attendee-rank', state.form.rank, false)") && moduleSource.includes("textField('Command', 't4t-attendee-command', state.form.command, false)") && moduleSource.includes("textField('Installation', 't4t-attendee-installation', state.form.installation, false)"), 'rank, command, and installation are optional');
assert(moduleSource.includes('Add Attendee') && moduleSource.includes('Attendance Roster') && moduleSource.includes('>Remove<') === false && moduleSource.includes("'Remove'") && moduleSource.includes("'Close'"), 'the roster can add and remove attendees, and the footer can close');
assert(!moduleSource.includes('Save Attendance'), 'there is no separate Save Attendance step');
assert(moduleSource.includes('Already on this attendance roster.'), 'a person already attending is not added again');
assert(moduleSource.includes('eventSourcedAttendance'), 'existing event attendance loads into the roster');
assert(moduleSource.includes('Completion Date') && moduleSource.includes('Qualification Product'), 'the dialog shows the completion date and qualification product');
assert(moduleSource.includes('People already saved keep their recorded date.'), 'a changed completion date does not silently rewrite saved attendees');
assert(writeAttendance.includes('await options.recordCompletion') && writeAttendance.indexOf('await options.recordCompletion') < writeAttendance.indexOf('showSavedRoster()'), 'Add Attendee records attendance before the person appears on the roster');
assert(writeAttendance.includes("if (completionErrorCode(error) !== 'T4T_COMPLETION_EVENT_DUPLICATE') throw error;"), 'a failed attendance record is not treated as a saved attendee');
assert(createPerson.indexOf('await options.createAttendancePerson') >= 0 && createPerson.indexOf('await options.createAttendancePerson') < createPerson.indexOf('await writeAttendance'), 'a new person is created, then their attendance is recorded');
assert(createPerson.includes('recoverExistingPerson') && createPerson.includes('isDuplicatePersonError'), 'a duplicate canonical name records attendance for the existing person');
assert(moduleSource.includes('suggestAttendancePeople') && moduleSource.includes('scheduleSuggestion') && moduleSource.includes(', 300)'), 'name suggestions are checked while typing, after a short pause');
assert(!createPerson.slice(createPerson.indexOf('} catch (error)')).includes('showSavedRoster'), 'a failed new-person attendance save does not show that person as an attendee');
assert(removeAttendee.indexOf('await options.removeCompletion') >= 0 && removeAttendee.indexOf('await options.removeCompletion') < removeAttendee.indexOf('showSavedRoster()'), 'Remove deletes the saved attendance before the row disappears');
assert(!removeAttendee.slice(removeAttendee.indexOf('} catch (error)')).includes('showSavedRoster'), 'a failed removal leaves the attendee visible');
assert(moduleSource.includes('footer.appendChild(close)') && !moduleSource.includes("'Save Attendance'"), 'Close is the only attendance footer action');
assert(!requestClose.includes('recordCompletion') && !requestClose.includes('removeCompletion') && !requestClose.includes('savePerson'), 'Close does not write attendance');
assert(moduleSource.includes('governingSource: null') && moduleSource.includes('notes: null') && moduleSource.includes('sourceEventId: event.id'), 'each completion records the event and leaves qualification notes empty');
assert(moduleSource.includes('isFacilitator: false') && moduleSource.includes('isCredoStaff: false') && moduleSource.includes('isPoc: false'), 'new people are created without role flags');
assert(!moduleSource.includes('saveFacilitatorQualification') && !moduleSource.includes('save_facilitator_qualification'), 'completion entry does not save qualifications');
assert(!moduleSource.includes('standing') && !moduleSource.includes('trainerAuthority') && !moduleSource.includes('t4tCompletedOn'), 'completion entry does not change qualification facts');
assert(!moduleSource.includes("from './db.js'") && !moduleSource.includes('createPerson('), 'completion entry does not use the legacy person insert');
assert(!moduleSource.includes('event.facilitators') && !moduleSource.includes('event.participants') && !moduleSource.includes('event.roster'), 'facilitators, participant counts, and roster status are not attendee identities');
assert(!moduleSource.includes('endDate') && !moduleSource.includes('end_date'), 'the completion date does not read the event end date');
assert(!writeAttendance.includes('dialog.close') && !removeAttendee.includes('dialog.close'), 'adding or removing an attendee leaves the roster open');
assert(!/\.(insert|update|delete|upsert)\(/.test(moduleSource), 'the workflow does not write tables directly');

assert(opener.includes('if (!canEditEvents()) return'), 'opening the workflow requires an editor or admin');
assert(opener.includes('createT4tAttendancePerson') && opener.includes('findCanonicalAttendancePerson') && opener.includes('recordFacilitatorT4tCompletion') && opener.includes('removeT4tAttendanceAttendee'), 'new people, additions, and removals use the attendance RPCs');
assert(opener.includes('fetchT4tCompletionEntrySources') && opener.includes('renderFacilitatorManagement'), 'the workflow loads the directory and refreshes Facilitator Management');
assert(opener.includes('startDate: event.startDate') && opener.includes('date: event.date'), 'the workflow receives the start date and legacy date');
assert(!opener.includes('endDate') && !opener.includes('facilitators') && !opener.includes('participants') && !opener.includes('roster'), 'the event handoff omits end date, facilitators, participant count, and roster status');
assert(!opener.includes('createPerson(') && !opener.includes('saveFacilitatorQualification'), 'the event action does not use legacy person creation or qualification save');
assert(app.includes('T4T_COMPLETION_ACTION_LABEL') && app.includes('createT4tCompletionButton'), 'the edit surface uses the completion action');
assert(!app.slice(app.indexOf('function renderTable'), app.indexOf('function render()')).includes('createT4tCompletionButton'), 'the events table action column does not host completion entry');
const html = read('index.html');
const css = read('css/styles.css');
assert(html.includes('id="event-t4t-completion-action" hidden>Manage T4T Attendance<'), 'the saved-event action is Manage T4T Attendance and starts hidden');
assert(html.includes('id="t4t-completion-title">Manage T4T Attendance<'), 'the attendance dialog uses the same action name');
assert(!html.includes('>Record T4T Completions<'), 'the old event action label is gone');
const facilitatorView = html.slice(html.indexOf('id="view-facilitators"'), html.indexOf('id="view-settings"'));
assert(!facilitatorView.includes('Manage T4T Attendance') && !facilitatorView.includes('event-t4t-completion-action'), 'Facilitator Management does not host attendance entry');
assert(!app.slice(app.indexOf('function openFacilitatorDetail'), app.indexOf('function closeFacilitatorDetail')).includes('openT4tCompletionDialog'), 'a facilitator profile does not open attendance entry');
const typeChange = app.slice(app.indexOf("typeSelect.addEventListener('change'"), app.indexOf("form.addEventListener('submit'"));
assert(!typeChange.includes('createT4tCompletionButton'), 'unsaved Event Type edits do not change attendance eligibility');
assert(css.includes('#new-event-modal #event-t4t-completion-action[hidden]') && css.includes('#new-event-modal #event-t4t-completion-action[hidden] {\n  display: none;\n}'), 'the attendance action stays hidden when its hidden attribute is set');

assert(entrySources.includes('fetchFacilitatorManagementSources') && entrySources.includes('fetchPersonnelAliases'), 'matching loads facilitator people and aliases');
assert(!entrySources.includes(".eq('active'"), 'the completion directory does not drop inactive people');
assert(facilitatorPeople.includes(".from('people')") && !facilitatorPeople.includes(".eq('active'"), 'the facilitator people read includes inactive people');
assert(db.includes("'rank_title'") && db.includes("'command_organization'") && db.includes("'installation'") && db.includes("'active'"), 'people reads include rank, command, installation, and active');

assert(recordWrapper.includes(".rpc('record_facilitator_t4t_completion'"), 'completions are recorded through the RPC');
assert(recordWrapper.includes('p_person_id') && recordWrapper.includes('p_product_id') && recordWrapper.includes('p_completed_on'), 'the wrapper sends the person, ordinary product, and date');
assert(recordWrapper.includes('p_source_event_id') && recordWrapper.includes('p_governing_source') && recordWrapper.includes('p_notes'), 'the wrapper sends the source event, governing source, and notes');
assert(!recordWrapper.includes(".from('facilitator_t4t_completions')") && !/\.(insert|update|delete|upsert)\(/.test(recordWrapper), 'the browser does not insert completion rows directly');
assert(!recordWrapper.includes('save_facilitator_qualification'), 'the completion wrapper does not save a qualification');
const removalMigration = read('supabase/migrations/029_remove_facilitator_t4t_completion_from_event.sql');
const removalBody = removalMigration.slice(removalMigration.indexOf('as $$'), removalMigration.indexOf('$$;'));
assert(removalMigration.includes('create or replace function public.remove_facilitator_t4t_completion_from_event('), 'event attendance removal has its own function');
assert(removalBody.includes('auth.uid() is null') && removalBody.includes('public.can_edit_events()'), 'removal requires an authenticated editor or admin');
assert(removalBody.includes('completion.person_id = p_person_id') && removalBody.includes('completion.product_id = p_product_id') && removalBody.includes('completion.source_event_id = p_source_event_id') && removalBody.includes('completion.source_event_id is not null'), 'removal matches only this person, product, and source event');
assert(!/update\s+public\.facilitator_qualifications/i.test(removalBody) && !/update\s+public\.people/i.test(removalBody), 'removal does not change qualifications or people');
assert(!/grant\s+(insert|update|delete|all)/i.test(removalMigration), 'removal does not grant direct table writes');
assert(removalMigration.includes('grant execute on function public.remove_facilitator_t4t_completion_from_event(uuid, uuid, uuid) to authenticated'), 'authenticated editors can execute the removal function');
const provenanceMigration = read('supabase/migrations/030_t4t_completion_source_uniqueness.sql');
const provenanceBody = provenanceMigration.slice(provenanceMigration.indexOf('as $$'), provenanceMigration.indexOf('$$;'));
assert(provenanceMigration.includes('drop constraint if exists facilitator_t4t_completions_person_product_date_key'), 'the global person, product, and date constraint is removed when it is still present');
assert(provenanceMigration.includes('create unique index if not exists facilitator_t4t_completions_manual_date_key') && provenanceMigration.includes('where source_event_id is null'), 'manual rows stay unique by person, product, and date, including when that index already exists');
assert(provenanceMigration.includes('facilitator_t4t_completions_source_event_key'), 'event-source uniqueness remains the person, product, and source event rule');
assert(!provenanceMigration.includes('drop index facilitator_t4t_completions_source_event_key') && !provenanceMigration.includes('drop index if exists facilitator_t4t_completions_source_event_key'), 'the event-source index is not dropped');
assert(provenanceBody.includes('p_source_event_id is null') && provenanceBody.includes('completion.source_event_id is null') && provenanceBody.includes("hint = 'T4T_COMPLETION_DUPLICATE'"), 'a second manual row for the same person, product, and date is rejected');
assert(provenanceBody.includes('completion.source_event_id = p_source_event_id') && provenanceBody.includes("hint = 'T4T_COMPLETION_EVENT_DUPLICATE'"), 'a second row for the same person, product, and source event is rejected');
assert(!provenanceBody.includes('and completion.completed_on = p_completed_on\n  ) then'), 'an event-sourced insert is not rejected merely because another row has the same date');
assert(!provenanceBody.includes('update public.facilitator_t4t_completions') && !provenanceBody.includes('source_event_id = p_source_event_id\n    where'), 'recording does not relabel an existing manual row as an event row');
assert(!/grant\s+/i.test(provenanceMigration) && !/revoke\s+/i.test(provenanceMigration) && !/row level security/i.test(provenanceMigration), 'provenance uniqueness does not change grants or row level security');
const removalWrapper = db.slice(db.indexOf('export async function removeFacilitatorT4tCompletionFromEvent'), db.indexOf('export async function deleteFacilitatorQualification'));
assert(removalWrapper.includes(".rpc('remove_facilitator_t4t_completion_from_event'"), 'the browser removes attendance through the RPC');
assert(!removalWrapper.includes(".from('facilitator_t4t_completions')"), 'the browser does not delete completion rows directly');
const attendanceCleanup = read('supabase/migrations/031_t4t_attendance_person_cleanup.sql');
assert(attendanceCleanup.includes('create table public.t4t_attendance_created_people'), 'attendance-created people have their own provenance table');
assert(attendanceCleanup.includes('insert into public.t4t_attendance_created_people'), 'creating an attendance person records that provenance');
assert(attendanceCleanup.includes('false,\n    false,\n    false,'), 'attendance-created people are not staff, facilitators, or points of contact');
assert(attendanceCleanup.includes('from public.t4t_attendance_created_people created') && attendanceCleanup.includes('delete from public.people person'), 'cleanup deletes a person only after proving attendance entry created them');
assert(attendanceCleanup.includes('facilitator_t4t_completions') && attendanceCleanup.includes('facilitator_qualifications') && attendanceCleanup.includes('people_name_aliases') && attendanceCleanup.includes('team_members') && attendanceCleanup.includes('facilitator_event_tokens') && attendanceCleanup.includes('is_credo_staff') && attendanceCleanup.includes('is_poc') && attendanceCleanup.includes('is_facilitator'), 'cleanup keeps a person who is still used elsewhere');
assert(attendanceCleanup.includes('when foreign_key_violation then'), 'an unknown reference keeps the person');
assert(!/grant\s+(insert|update|delete|all)\s+on\s+table\s+public\.people/i.test(attendanceCleanup), 'cleanup does not grant direct person deletion');

if (errors.length) {
  console.error(`validate-t4t-bulk-completion-entry failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-t4t-bulk-completion-entry: ok');
