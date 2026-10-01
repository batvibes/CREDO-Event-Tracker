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
  buildParticipantReviews,
  calendarDate,
  canRecordT4tCompletions,
  completionDateMessage,
  localCalendarToday,
  completionAlreadyRecorded,
  confirmParticipantChoice,
  defaultT4tCompletionDate,
  isDuplicateCompletionError,
  newDirectoryPersonInput,
  parseParticipantLines,
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

const moduleSource = read('js/t4t-completion-entry.js');
const app = read('js/app.js');
const db = read('js/db.js');
const opener = app.slice(app.indexOf('async function openT4tCompletionDialog'), app.indexOf('function createEditButton'));
const recordWrapper = db.slice(db.indexOf('export async function recordFacilitatorT4tCompletion'), db.indexOf('export async function deleteFacilitatorQualification'));
const entrySources = db.slice(db.indexOf('export async function fetchT4tCompletionEntrySources'), db.indexOf('function t4tCompletionRpcError'));
const facilitatorPeople = db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf(".from('facilitator_product_experience')"));
const recordRows = moduleSource.slice(moduleSource.indexOf('async function recordRows'), moduleSource.indexOf('function render()'));

assert(moduleSource.includes('matchDirectoryPerson'), 'review uses the identity matcher');
assert(moduleSource.includes('Use this person') && moduleSource.includes('Create New Person') && moduleSource.includes('New Person'), 'probable, ambiguous, and new rows require an explicit choice');
assert(moduleSource.includes('Inactive') && moduleSource.includes('Ready'), 'inactive people and ready rows are labeled');
assert(moduleSource.includes('Participant Names') && moduleSource.includes('Paste or enter one participant per line.'), 'names are entered as one participant per line');
assert(moduleSource.includes('Completion Date') && moduleSource.includes('Qualification Product'), 'the dialog shows the completion date and qualification product');
assert(moduleSource.includes('Review Participants') && moduleSource.includes('Record Completions') && moduleSource.includes('Done'), 'review, record, and done actions are present');
assert(moduleSource.includes('Recorded:') && moduleSource.includes('Already Recorded:') && moduleSource.includes('Failed:'), 'the result summary stays on screen');
assert(moduleSource.includes('governingSource: null') && moduleSource.includes('notes: null') && moduleSource.includes('sourceEventId: event.id'), 'each completion records the event and leaves qualification notes empty');
assert(moduleSource.includes('isFacilitator: false') && moduleSource.includes('isCredoStaff: false') && moduleSource.includes('isPoc: false'), 'new people are created without role flags');
assert(!moduleSource.includes('saveFacilitatorQualification') && !moduleSource.includes('save_facilitator_qualification'), 'completion entry does not save qualifications');
assert(!moduleSource.includes('standing') && !moduleSource.includes('trainerAuthority') && !moduleSource.includes('t4tCompletedOn'), 'completion entry does not change qualification facts');
assert(!moduleSource.includes("from './db.js'") && !moduleSource.includes('createPerson('), 'completion entry does not use the legacy person insert');
assert(!moduleSource.includes('event.facilitators') && !moduleSource.includes('event.participants') && !moduleSource.includes('event.roster'), 'facilitators, participant counts, and roster status are not attendee identities');
assert(!moduleSource.includes('endDate') && !moduleSource.includes('end_date'), 'the completion date does not read the event end date');
assert(!recordRows.includes('dialog.close'), 'recording leaves the result visible');
assert(!/\.(insert|update|delete|upsert)\(/.test(moduleSource), 'the workflow does not write tables directly');

assert(opener.includes('if (!canEditEvents()) return'), 'opening the workflow requires an editor or admin');
assert(opener.includes('saveDirectoryPerson') && opener.includes('recordFacilitatorT4tCompletion'), 'new people and completions use the existing RPCs');
assert(opener.includes('fetchT4tCompletionEntrySources') && opener.includes('renderFacilitatorManagement'), 'the workflow loads the directory and refreshes Facilitator Management');
assert(opener.includes('startDate: event.startDate') && opener.includes('date: event.date'), 'the workflow receives the start date and legacy date');
assert(!opener.includes('endDate') && !opener.includes('facilitators') && !opener.includes('participants') && !opener.includes('roster'), 'the event handoff omits end date, facilitators, participant count, and roster status');
assert(!opener.includes('createPerson(') && !opener.includes('saveFacilitatorQualification'), 'the event action does not use legacy person creation or qualification save');
assert(app.includes('T4T_COMPLETION_ACTION_LABEL') && app.includes('createT4tCompletionButton'), 'the event row uses the completion action');
assert(read('index.html').includes('>Record T4T Completions<'), 'the dialog title is Record T4T Completions');

assert(entrySources.includes('fetchFacilitatorManagementSources') && entrySources.includes('fetchPersonnelAliases'), 'matching loads facilitator people and aliases');
assert(!entrySources.includes(".eq('active'"), 'the completion directory does not drop inactive people');
assert(facilitatorPeople.includes(".from('people')") && !facilitatorPeople.includes(".eq('active'"), 'the facilitator people read includes inactive people');
assert(db.includes("'rank_title'") && db.includes("'command_organization'") && db.includes("'installation'") && db.includes("'active'"), 'people reads include rank, command, installation, and active');

assert(recordWrapper.includes(".rpc('record_facilitator_t4t_completion'"), 'completions are recorded through the RPC');
assert(recordWrapper.includes('p_person_id') && recordWrapper.includes('p_product_id') && recordWrapper.includes('p_completed_on'), 'the wrapper sends the person, ordinary product, and date');
assert(recordWrapper.includes('p_source_event_id') && recordWrapper.includes('p_governing_source') && recordWrapper.includes('p_notes'), 'the wrapper sends the source event, governing source, and notes');
assert(!recordWrapper.includes(".from('facilitator_t4t_completions')") && !/\.(insert|update|delete|upsert)\(/.test(recordWrapper), 'the browser does not insert completion rows directly');
assert(!recordWrapper.includes('save_facilitator_qualification'), 'the completion wrapper does not save a qualification');

if (errors.length) {
  console.error(`validate-t4t-bulk-completion-entry failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-t4t-bulk-completion-entry: ok');
