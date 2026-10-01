/**
 * Generic T4T anniversary alert checks.
 * Run: node scripts/validate-t4t-anniversary-alerts.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildT4tAnniversaryAlerts,
  evaluateT4tAnniversaryAlert,
  formatT4tAnniversaryProfileLine,
  summarizeFacilitatorPersonnel,
  t4tAnniversaryProductApplicable,
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

function shiftCalendarDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function alert(overrides = {}) {
  return evaluateT4tAnniversaryAlert({
    productCode: 'asist',
    t4tCompletedOn: '2024-06-15',
    qualificationStanding: 'registered',
    personActive: true,
    today: '2025-06-15',
    ...overrides,
  });
}

const model = read('js/facilitator-management.js');
const app = read('js/app.js');
const html = read('index.html');
const view = html.slice(html.indexOf('id="view-facilitators"'), html.indexOf('id="view-settings"'));
const helper = model.slice(
  model.indexOf('const T4T_ANNIVERSARY_PRODUCT_CODES'),
  model.indexOf('const LIVINGWORKS_ACTIVITY_RULES'),
);
const displayFields = model.slice(
  model.indexOf('export function facilitatorQualificationDisplayFields'),
  model.indexOf('export function facilitatorQualificationProductChoices'),
);
const overviewModel = model.slice(
  model.indexOf('export function buildFacilitatorOverview'),
  model.indexOf('export function buildFacilitatorProgramCapabilities'),
);
const detail = app.slice(app.indexOf('function openFacilitatorDetail'), app.indexOf('function closeFacilitatorDetail'));
const profileAlert = detail.slice(detail.indexOf('presentQualificationFollowUp'), detail.indexOf('followUp.activityLine'));
const anniversaryHeading = view.indexOf('T4T Anniversary Alerts');

for (const code of [
  'gottman_seven_principles',
  'prep_8_0',
  'four_lenses',
  'cliftonstrengths_strengths_discovery_encounter',
  'navigating_your_next_chapter',
  'safetalk',
  'asist',
]) {
  assert(t4tAnniversaryProductApplicable(code), `${code} is an applicable T4T anniversary product`);
  assert(alert({ productCode: code, today: '2025-06-15' }).status === 'urgent', `${code} is evaluated`);
}

for (const code of [
  'marriage_enrichment_retreat',
  'family_enrichment_retreat',
  'personal_growth_retreat',
  'safetalk_t4t',
  'asist_t4t',
]) {
  assert(!t4tAnniversaryProductApplicable(code), `${code} is outside the T4T anniversary set`);
  assert(alert({ productCode: code, t4tCompletedOn: '2020-01-01', today: '2026-09-30' }).status === 'none', `${code} produces no alert`);
}

assert(alert({ personActive: false }).status === 'none', 'an inactive person produces no alert');
assert(alert({ personActive: undefined }).status === 'none', 'a missing person active flag produces no alert');
assert(alert({ qualificationStanding: 'inactive', t4tCompletedOn: '2020-01-01' }).status === 'none', 'an inactive qualification produces no alert');
assert(alert({ qualificationStanding: '' }).status === 'none', 'a missing standing produces no alert');
assert(alert({ qualificationStanding: null }).status === 'none', 'a null standing produces no alert');
assert(alert({ qualificationStanding: 'qualified' }).status === 'none', 'an unrecognized standing produces no alert');
for (const standing of ['developing', 'provisional', 'registered']) {
  assert(alert({ qualificationStanding: standing }).status === 'urgent', `${standing} is evaluated`);
}

const missing = alert({ t4tCompletedOn: null, today: '2026-09-30' });
assert(missing.status === 'needs_verification' && missing.label === 'Needs Verification', 'a missing T4T date needs verification');
assert(missing.deadline == null && missing.daysRemaining == null, 'a missing T4T date has no deadline');
assert(missing.reason === 'No T4T completion date is recorded.', 'a missing T4T date states that none is recorded');
assert(alert({ t4tCompletedOn: '' }).status === 'needs_verification', 'a blank T4T date needs verification');
assert(
  formatT4tAnniversaryProfileLine(missing) === 'Needs Verification — no T4T completion date recorded',
  'the profile line for a missing date stays factual',
);

const future = alert({ t4tCompletedOn: '2026-10-01', today: '2026-09-30' });
assert(future.status === 'needs_verification' && future.reason === 'T4T completion date is in the future.', 'a future T4T date needs verification');
assert(future.deadline == null, 'a future T4T date does not invent an anniversary deadline');
assert(
  formatT4tAnniversaryProfileLine(future) === 'Needs Verification — T4T completion date is in the future.',
  'the profile line states that the T4T date is in the future',
);

const deadline = '2025-06-15';
const thresholds = [
  [91, 'none', ''],
  [90, 'upcoming', 'Upcoming'],
  [31, 'upcoming', 'Upcoming'],
  [30, 'needs_attention', 'Needs Attention'],
  [8, 'needs_attention', 'Needs Attention'],
  [7, 'urgent', 'Urgent'],
  [0, 'urgent', 'Urgent'],
  [-1, 'overdue', 'Overdue'],
];
for (const [daysRemaining, status, label] of thresholds) {
  const result = alert({ today: shiftCalendarDays(deadline, -daysRemaining) });
  assert(result.deadline === deadline, `${daysRemaining} days uses the 12-month deadline`);
  assert(result.daysRemaining === daysRemaining, `${daysRemaining} days remaining is counted from the deadline`);
  assert(result.status === status && result.label === label, `${daysRemaining} days is ${status || 'none'}`);
}

const leap = alert({ t4tCompletedOn: '2024-02-29', today: '2025-02-28' });
assert(leap.deadline === '2025-02-28' && leap.daysRemaining === 0 && leap.status === 'urgent', 'Feb 29 lands on Feb 28 in the following non-leap year');
assert(alert({ t4tCompletedOn: '2024-02-29', today: '2025-03-01' }).status === 'overdue', 'the day after a clamped Feb 29 anniversary is overdue');
const leapYearDate = alert({ t4tCompletedOn: '2024-03-01', today: '2025-03-01' });
assert(leapYearDate.deadline === '2025-03-01' && leapYearDate.status === 'urgent', 'a normal leap-year date keeps the same month and day');
assert(alert({ t4tCompletedOn: '2024-02-28', today: '2025-02-28' }).deadline === '2025-02-28', 'Feb 28 stays Feb 28 in the following year');
assert(!helper.includes('365'), 'the anniversary helper does not use a 365-day offset');

assert(
  formatT4tAnniversaryProfileLine(alert({ t4tCompletedOn: '2025-12-15', today: shiftCalendarDays('2026-12-15', -90) }))
    === 'Upcoming — anniversary due 12/15/26',
  'an upcoming profile line shows the anniversary date',
);
assert(
  formatT4tAnniversaryProfileLine({ status: 'needs_attention', label: 'Needs Attention', deadline: '2026-10-24' })
    === 'Needs Attention — anniversary due 10/24/26',
  'a needs-attention profile line shows the anniversary date',
);
assert(
  formatT4tAnniversaryProfileLine({ status: 'urgent', label: 'Urgent', deadline: '2026-10-05' })
    === 'Urgent — anniversary due 10/05/26',
  'an urgent profile line shows the anniversary date',
);
assert(
  formatT4tAnniversaryProfileLine({ status: 'overdue', label: 'Overdue', deadline: '2026-09-12' })
    === 'Overdue — anniversary was due 09/12/26',
  'an overdue profile line says the anniversary was due',
);

const products = [
  { id: 'gottman', name: 'Gottman', code: 'gottman_seven_principles', sort_order: 4, active: true },
  { id: 'prep', name: 'PREP 8.0', code: 'prep_8_0', sort_order: 5, active: true },
  { id: 'lenses', name: '4 Lenses', code: 'four_lenses', sort_order: 6, active: true },
  { id: 'strengths', name: 'CliftonStrengths', code: 'cliftonstrengths_strengths_discovery_encounter', sort_order: 7, active: true },
  { id: 'chapter', name: 'Navigating Your Next Chapter', code: 'navigating_your_next_chapter', sort_order: 8, active: true },
  { id: 'safetalk', name: 'safeTALK', code: 'safetalk', sort_order: 9, active: true },
  { id: 'asist', name: 'ASIST', code: 'asist', sort_order: 10, active: true },
  { id: 'mer', name: 'Marriage Enrichment Retreat', code: 'marriage_enrichment_retreat', sort_order: 1, active: true },
  { id: 't4t', name: 'safeTALK T4T', code: 'safetalk_t4t', sort_order: 11, active: true },
];
const people = [
  { id: 'zoe', name: 'Zoe', active: true, is_facilitator: false },
  { id: 'amy', name: 'Amy', active: true, is_facilitator: false },
  { id: 'zed', name: 'Zed', active: true, is_facilitator: false },
  { id: 'cara', name: 'Cara', active: true, is_facilitator: false },
  { id: 'eve', name: 'Eve', active: true, is_facilitator: false },
  { id: 'blake', name: 'Blake', active: true, is_facilitator: false },
  { id: 'john', name: 'John', active: false, is_facilitator: false },
  { id: 'sam', name: 'Sam', active: true, is_facilitator: false },
  { id: 'pat', name: 'Pat', active: true, is_facilitator: false },
];
const qualifications = [
  { person_id: 'zoe', product_id: 'asist', standing: 'registered', t4t_completed_on: '2023-01-01' },
  { person_id: 'zoe', product_id: 'gottman', standing: 'registered', t4t_completed_on: '2024-06-15' },
  { person_id: 'amy', product_id: 'prep', standing: 'provisional', t4t_completed_on: '2024-07-15' },
  { person_id: 'zed', product_id: 'safetalk', standing: 'developing', t4t_completed_on: '2024-06-20' },
  { person_id: 'cara', product_id: 'chapter', standing: 'registered', t4t_completed_on: '2024-08-14' },
  { person_id: 'eve', product_id: 'lenses', standing: 'registered', t4t_completed_on: '2024-08-14' },
  { person_id: 'blake', product_id: 'strengths', standing: 'registered', t4t_completed_on: null },
  { person_id: 'blake', product_id: 'gottman', standing: 'developing', t4t_completed_on: '' },
  { person_id: 'john', product_id: 'asist', standing: 'registered', t4t_completed_on: '2020-01-01' },
  { person_id: 'sam', product_id: 'safetalk', standing: 'inactive', t4t_completed_on: '2020-01-01' },
  { person_id: 'pat', product_id: 'mer', standing: 'registered', t4t_completed_on: '2020-01-01' },
  { person_id: 'pat', product_id: 't4t', standing: 'registered', t4t_completed_on: '2020-01-01' },
  { person_id: 'pat', product_id: 'prep', standing: 'qualified', t4t_completed_on: '2020-01-01' },
];
const personnel = summarizeFacilitatorPersonnel(people, [], qualifications, products);
const snapshot = JSON.stringify(personnel);
const alerts = buildT4tAnniversaryAlerts(personnel, '2025-06-15');
assert(JSON.stringify(personnel) === snapshot, 'building alerts does not change personnel or qualification facts');
assert(personnel.find((person) => person.id === 'zoe').qualificationProducts.every((row) => row.productCode), 'qualification rows keep the product code');
const zoe = alerts.filter((row) => row.personId === 'zoe');
assert(zoe.length === 2, 'one person with two alerting qualifications produces two rows');
assert(alerts.map((row) => `${row.status}:${row.displayName}:${row.productName}`).join('|') === [
  'overdue:Zoe:ASIST',
  'urgent:Zoe:Gottman',
  'urgent:Zed:safeTALK',
  'needs_attention:Amy:PREP 8.0',
  'upcoming:Cara:Navigating Your Next Chapter',
  'upcoming:Eve:4 Lenses',
  'needs_verification:Blake:CliftonStrengths',
  'needs_verification:Blake:Gottman',
].join('|'), 'alerts sort by status, then nearest deadline, then name and product');
assert(alerts.filter((row) => row.status === 'needs_verification').every((row) => row.deadline == null), 'Needs Verification rows have no deadline');
assert(!alerts.some((row) => row.personId === 'john' || row.personId === 'sam' || row.personId === 'pat'), 'inactive people, inactive records, retreats, T4T course products, and unrecognized records stay out of the alert list');

assert(!view.includes('>Needs Attention<'), 'the data-gap heading is not on Facilitator Management');
assert(anniversaryHeading > view.indexOf('>Product Coverage<'), 'T4T Anniversary Alerts follows Product Coverage');
assert(view.includes('id="facilitator-anniversary-body"'), 'the anniversary table has a body');
assert(!/Overdue|Upcoming|Urgent|Needs Verification/.test(view), 'status words are rendered from the alert result');
assert(!/overdue|standing|readiness|expired/i.test(overviewModel), 'the existing overview model stays free of anniversary status language');
assert(app.includes('buildQualificationAnniversaryWarnings('), 'Overview paints the derived alert list');
assert(app.includes('anniversarySection.hidden = anniversaryAlerts.length === 0'), 'an empty anniversary list hides the section');
assert(app.includes('button.dataset.facilitatorPerson = alert.personId'), 'an anniversary name reuses the facilitator profile control');
assert(detail.includes('followUp.warningLine'), 'the profile shows the derived status line');
assert(!displayFields.includes('anniversary') && !displayFields.includes('Needs Verification'), 'stored qualification fields stay unchanged');
assert(!profileAlert.includes('canEditEvents'), 'the profile status line is not limited to editors');
assert(!detail.includes('saveFacilitatorQualification'), 'opening the profile does not save a qualification');
assert(!helper.includes('facilitator_event_experience'), 'anniversary alerts do not read ordinary experience');
assert(!helper.includes('facilitator_t4t_product_experience'), 'anniversary alerts do not read T4T facilitation');
assert(!helper.includes('facilitator_t4t_completions'), 'anniversary alerts do not read completion history');
assert(!helper.includes('expiration_on') && !helper.includes('expirationOn'), 'anniversary alerts do not read expiration');
assert(!helper.includes('first_facilitated_on') && !helper.includes('firstFacilitatedOn'), 'anniversary alerts do not read first facilitated');
assert(!helper.includes('trainer_authority') && !helper.includes('trainerAuthority'), 'anniversary alerts do not read trainer authority');
assert(!helper.includes('rule_family') && !helper.includes('ruleFamily'), 'anniversary alerts do not read rule family');
assert(!helper.includes('events_conducted') && !helper.includes('eventsConducted'), 'anniversary alerts do not count workshops');
assert(!/\.(insert|update|delete|upsert|rpc)\(/.test(helper), 'anniversary alerts do not write');

if (errors.length) {
  console.error('validate-t4t-anniversary-alerts failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-t4t-anniversary-alerts: ok');
