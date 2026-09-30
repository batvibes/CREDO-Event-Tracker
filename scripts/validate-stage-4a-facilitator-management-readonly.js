/**
 * Stage 4A read-only Facilitator Management checks.
 * Run: node scripts/validate-stage-4a-facilitator-management-readonly.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FACILITATOR_EMPTY_EXPERIENCE,
  FACILITATOR_EMPTY_PERSONNEL,
  FACILITATOR_EMPTY_QUALIFICATIONS,
  FACILITATOR_EXPERIENCE_HEADING,
  FACILITATOR_QUALIFICATIONS_HEADING,
  facilitatorQualificationDisplayFields,
  filterFacilitatorPersonnel,
  formatQualificationStanding,
  formatRecordedFacilitationDate,
  sortFacilitatorPersonnel,
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

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const next = source.indexOf('\nexport async function ', start + signature.length);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

const html = read('index.html');
const app = read('js/app.js');
const db = read('js/db.js');
const model = read('js/facilitator-management.js');
const fetchSources = extractFunction(db, 'export async function fetchFacilitatorManagementSources()');

assert(html.includes('data-view="facilitators"'), 'Facilitator Management is a sidebar destination');
assert(html.includes('Facilitator Management'), 'the destination is labeled Facilitator Management');
assert(html.includes('id="view-facilitators"'), 'the Facilitator Management view exists');
assert(html.includes('>Personnel<'), 'Personnel is the Stage 4A view');
assert(html.includes('id="facilitator-personnel-table"'), 'the Personnel table exists');
assert(html.includes('>Name<') && html.includes('Command / Organization') && html.includes('>Installation<'), 'name, command, and installation columns exist');
assert(html.includes('>Products<') && html.includes('Events Conducted') && html.includes('Most Recent'), 'experience summary columns exist');
assert(html.includes('id="facilitator-search"'), 'name search exists');
assert(html.includes('id="facilitator-detail-modal"'), 'person detail uses the existing dialog pattern');
assert(app.includes("facilitators: 'view-facilitators'"), 'navigation opens the Facilitator Management view');
assert(app.includes('fetchFacilitatorManagementSources'), 'the view reads the facilitator data access function');
assert(app.includes('First Recorded Facilitation') && app.includes('Most Recent Facilitation'), 'product detail shows derived facilitation dates');
assert(model.includes(FACILITATOR_EMPTY_PERSONNEL) && model.includes(FACILITATOR_EMPTY_EXPERIENCE), 'empty states use the approved wording');
assert(model.includes(FACILITATOR_EMPTY_QUALIFICATIONS), 'a person without qualification rows uses the profile empty state');
assert(app.includes('FACILITATOR_EMPTY_PERSONNEL') && app.includes('FACILITATOR_EMPTY_EXPERIENCE') && app.includes('FACILITATOR_EMPTY_QUALIFICATIONS'), 'the Personnel view uses those empty states');

assert(fetchSources.includes(".from('people')"), 'population can include people marked as facilitators');
assert(fetchSources.includes(".from('facilitator_product_experience')"), 'historical experience is read from the Stage 3B view');
assert(fetchSources.includes(".from('facilitator_qualifications')"), 'population can include people with qualification rows');
assert(fetchSources.includes('person_id, product_id, events_conducted, first_recorded_facilitation_on, most_recent_facilitation_on'), 'experience fields come from the derived view');
assert(fetchSources.includes(".select('id, person_id, product_id, standing, t4t_completed_on, first_facilitated_on, trainer_authority, expiration_on, governing_source, notes')"), 'the profile loads the stored qualification fields');
assert(!fetchSources.includes('created_at') && !fetchSources.includes('updated_by'), 'qualification audit fields are not loaded');
assert(!/\.(insert|update|delete|upsert)\(/.test(fetchSources), 'the facilitator read does not write');
assert(!fetchSources.includes(".from('events')"), 'Event history is not recalculated in the client');
assert(!fetchSources.includes('save_facilitator_qualification'), 'the facilitator read does not save qualifications');

assert(!/is_facilitator\s*[:=]\s*true/.test(model), 'recorded experience does not assign the Facilitator role');
assert(!/\.(insert|update|delete|upsert)\(/.test(model), 'the personnel model does not write');
assert(!model.includes(".from('events')"), 'the personnel model does not read Events');
const facilitatorView = html.slice(html.indexOf('id="view-facilitators"'), html.indexOf('id="view-settings"'));
assert(!/standing|trainer_authority|readiness|certification|qualified/i.test(facilitatorView), 'Personnel and Overview markup do not present standing or certification');
const detail = app.slice(app.indexOf('function openFacilitatorDetail'), app.indexOf('function closeFacilitatorDetail'));
assert(detail.includes('FACILITATOR_QUALIFICATIONS_HEADING') && detail.includes('FACILITATOR_EXPERIENCE_HEADING'), 'the profile has qualification and recorded-experience sections');
assert(model.includes(FACILITATOR_QUALIFICATIONS_HEADING) && model.includes(FACILITATOR_EXPERIENCE_HEADING), 'profile section titles are the qualification and recorded-experience headings');
assert(detail.includes('First Recorded Facilitation') && detail.includes('row.firstRecordedOn'), 'recorded experience keeps the derived first date');
assert(!detail.includes('save_facilitator_qualification') && !detail.includes('createElement(\'button\')'), 'the profile does not add qualification editing');

const products = [{ id: 'asist', name: 'ASIST', code: 'asist', sort_order: 15, active: true }];
const flagged = { id: 'flagged', name: 'Ada', rank_title: 'LCDR', command_organization: 'CREDO', installation: 'Camp Pendleton', active: true, is_facilitator: true };
const experienced = { id: 'experienced', name: 'John Scanlon', rank_title: 'CDR', command_organization: 'CREDO', installation: 'Camp Pendleton', active: false, is_facilitator: false };
const qualified = { id: 'qualified', name: 'Blake', rank_title: '', active: true, is_facilitator: false };
const outsider = { id: 'outsider', name: 'Pat', rank_title: '', active: true, is_facilitator: false };
const before = experienced.is_facilitator;
const personnel = summarizeFacilitatorPersonnel(
  [flagged, experienced, qualified, outsider],
  [{
    person_id: 'experienced',
    product_id: 'asist',
    events_conducted: 3,
    first_recorded_facilitation_on: '2024-03-01',
    most_recent_facilitation_on: '2025-06-15',
  }],
  [{ person_id: 'qualified', product_id: 'asist' }],
  products,
);
assert(experienced.is_facilitator === before, 'summarizing experience does not change is_facilitator');
assert(personnel.map((person) => person.id).sort().join(',') === 'experienced,flagged,qualified', 'the roster includes facilitator flags, experience, and qualification records');
assert(!personnel.some((person) => person.id === 'outsider'), 'a person with no facilitator evidence is omitted');
const history = personnel.find((person) => person.id === 'experienced');
assert(history.isFacilitator === false && history.active === false, 'inactive historical experience stays visible without a role change');
assert(history.productCount === 1 && history.eventsConducted === 3, 'product count and events conducted come from derived experience');
assert(history.experience[0].firstRecordedOn === '2024-03-01', 'first recorded facilitation stays the derived date');
assert(history.hasQualificationRecord === false, 'experience alone does not create a qualification record');
assert(personnel.find((person) => person.id === 'qualified').experience.length === 0, 'a qualification record does not invent Event experience');
assert(personnel.find((person) => person.id === 'flagged').eventsConducted === 0, 'a facilitator flag without history contributes no conducted events');
assert(formatRecordedFacilitationDate('2024-03-01') === '03/01/24', 'recorded dates use the application date format');
assert(formatRecordedFacilitationDate(null) === '—', 'a missing date does not become today');
assert(filterFacilitatorPersonnel(personnel, { active: 'inactive' }).map((person) => person.id).join(',') === 'experienced', 'inactive personnel can be filtered without being removed from the roster');
assert(sortFacilitatorPersonnel(personnel, 'name', 'asc').map((person) => person.displayName).join('|') === 'Blake|CDR John Scanlon|LCDR Ada', 'default name order is deterministic');

const profile = summarizeFacilitatorPersonnel(
  [{ id: 'ada', name: 'Ada', rank_title: 'LCDR', command_organization: 'CREDO', installation: 'Camp Pendleton', active: true, is_facilitator: true }],
  [{
    person_id: 'ada',
    product_id: 'asist',
    events_conducted: 2,
    first_recorded_facilitation_on: '2024-03-01',
    most_recent_facilitation_on: '2025-06-15',
  }],
  [{
    id: 'qual-1',
    person_id: 'ada',
    product_id: 'asist',
    standing: 'provisional',
    t4t_completed_on: '2026-05-18',
    first_facilitated_on: '2019-04-01',
    trainer_authority: false,
    governing_source: 'LivingWorks',
    notes: 'Completed the applicable T4T.',
  }],
  products,
);
const ada = profile[0];
assert(ada.qualificationProducts[0].id === 'qual-1' && ada.qualificationProducts[0].productName === 'ASIST', 'a qualification stays with its person and product');
assert(ada.experience[0].firstRecordedOn === '2024-03-01', 'profile experience keeps the Event-derived first date');
assert(ada.qualificationProducts[0].firstFacilitatedOn === '2019-04-01', 'manual first facilitated stays separate from recorded experience');
assert(ada.qualificationProducts[0].trainerAuthority === false, 'a T4T completion date does not grant trainer authority');
const fields = facilitatorQualificationDisplayFields(ada.qualificationProducts[0]);
assert(fields.map((field) => field.label).join('|') === 'T4T Completed|Standing|First Facilitated|Governing Source|Notes', 'blank qualification fields are omitted');
assert(fields.find((field) => field.label === 'Standing')?.value === 'Provisional', 'provisional standing renders in title case');
assert(fields.find((field) => field.label === 'T4T Completed')?.value === '05/18/26', 'T4T completion renders as a stored training date');
assert(!fields.some((field) => field.label === 'Trainer / T4T Authority'), 'false trainer authority is omitted');
assert(formatQualificationStanding('developing') === 'Developing', 'developing renders in title case');
assert(formatQualificationStanding('registered') === 'Registered', 'registered renders in title case');
assert(formatQualificationStanding('inactive') === 'Inactive', 'inactive renders in title case');
assert(formatQualificationStanding('qualified') == null, 'an unrecognized standing is not invented');
const withAuthority = facilitatorQualificationDisplayFields({ trainerAuthority: true, standing: 'registered' });
assert(withAuthority.find((field) => field.label === 'Trainer / T4T Authority')?.value === 'Yes', 'trainer authority renders only from the stored true value');
assert(!fs.existsSync(path.join(ROOT, 'supabase/migrations/023_facilitator_management.sql')), 'Stage 4A does not add a migration');

const protectedPaths = [
  'js/monthly-report-pptx-export.js',
  'js/team-personnel-directory.js',
  'js/team-personnel-editor.js',
  'js/event-reference-fields.js',
  'js/settings-reference-lists.js',
  'js/personnel-identity.js',
  'supabase/migrations/020_facilitator_qualification_foundation.sql',
  'supabase/migrations/021_facilitator_experience_foundation.sql',
  'supabase/migrations/022_facilitator_event_type_product_mappings.sql',
];
let protectedDiff = '';
let migrationDiff = '';
let status = '';
try {
  protectedDiff = execFileSync('git', ['diff', '--name-only', '--', ...protectedPaths], { cwd: ROOT, encoding: 'utf8' });
  migrationDiff = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
  status = execFileSync('git', ['status', '--short', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(protectedDiff.trim() === '', 'MIR, Manning, Team, and Stage 3 migrations are unchanged');
assert(migrationDiff.trim() === '', 'committed migrations are unchanged');
const migrationStatus = status.split('\n').map((line) => line.trim()).filter(Boolean);
assert(migrationStatus.every((line) => line.includes('024_event_workshop_t4t.sql')), 'the only new migration is 024_event_workshop_t4t.sql');
for (const filePath of [
  'scripts/spike-output/section_iii_sorm_command_function_navy_governance_training  -  Repaired.pptx',
  'scripts/spike-output/section_iv_navstds_occstds_navy_governance_training  -  Repaired.pptx',
]) {
  assert(fs.existsSync(path.join(ROOT, filePath)), `repaired PowerPoint remains present: ${filePath}`);
}

if (errors.length) {
  console.error('validate-stage-4a-facilitator-management-readonly failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-4a-facilitator-management-readonly: ok');
