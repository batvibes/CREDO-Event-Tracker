/**
 * LivingWorks activity overlay checks for safeTALK and ASIST.
 * Run: node scripts/validate-livingworks-activity-overlay.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildQualificationAnniversaryWarnings,
  buildT4tAnniversaryAlerts,
  evaluateLivingWorksActivity,
  formatLivingWorksActivityLine,
  presentQualificationFollowUp,
  summarizeFacilitatorPersonnel,
} from '../js/facilitator-management.js';
import { ordinaryLivingWorksWorkshops } from '../js/livingworks-workshops.js';

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
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function activity(overrides = {}) {
  return evaluateLivingWorksActivity({
    productCode: 'safetalk',
    qualificationStanding: 'provisional',
    t4tCompletedOn: '2024-06-15',
    personActive: true,
    workshops: [],
    today: '2025-01-15',
    ...overrides,
  });
}

function workshop(eventId, recordedOn, extra = {}) {
  return { eventId, recordedOn, ...extra };
}

const model = read('js/facilitator-management.js');
const db = read('js/db.js');
const filter = read('js/livingworks-workshops.js');
const activitySource = model.slice(model.indexOf('const LIVINGWORKS_ACTIVITY_RULES'));
const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));

assert(activity({ productCode: 'safetalk', qualificationStanding: 'provisional' }).requiredCount === 3, 'safeTALK provisional requires 3 workshops');
assert(activity({ productCode: 'asist', qualificationStanding: 'provisional' }).requiredCount === 3, 'ASIST provisional requires 3 workshops');
assert(activity({ productCode: 'safetalk', qualificationStanding: 'registered' }).requiredCount === 2, 'safeTALK registered requires 2 workshops');
assert(activity({ productCode: 'asist', qualificationStanding: 'registered' }).requiredCount === 1, 'ASIST registered requires 1 workshop');

for (const [name, input] of [
  ['Developing', { qualificationStanding: 'developing' }],
  ['an inactive qualification', { qualificationStanding: 'inactive' }],
  ['an inactive person', { personActive: false }],
  ['a non-LivingWorks product', { productCode: 'gottman_seven_principles' }],
  ['safeTALK T4T', { productCode: 'safetalk_t4t' }],
  ['ASIST T4T', { productCode: 'asist_t4t' }],
]) {
  const result = activity(input);
  assert(result.applicable === false && result.activityStatus === 'none', `${name} is not a LivingWorks activity requirement`);
  assert(result.completedCount == null && result.requiredCount == null, `${name} does not invent a workshop fraction`);
}

const provisional = activity({
  today: '2025-06-15',
  workshops: [
    workshop('on-start', '2024-06-15'),
    workshop('on-end', '2025-06-15'),
    workshop('after', '2025-06-16'),
    workshop('duplicate-a', '2024-08-01'),
    workshop('duplicate-a', '2024-08-01'),
    workshop('same-day-b', '2024-08-01'),
    workshop('future', '2025-12-01'),
  ],
});
assert(provisional.windowStart === '2024-06-15' && provisional.windowEnd === '2025-06-15', 'the provisional window runs from T4T completion through the anniversary');
assert(provisional.completedCount === 4, 'the completion date, anniversary date, and two same-day events count, while the duplicate token, next day, and future date do not');
assert(provisional.activityStatus === 'met', 'three or more provisional workshops meet the requirement');

const registeredLater = activity({
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  today: '2026-09-30',
  workshops: [
    workshop('boundary', '2026-06-15'),
    workshop('next-cycle', '2026-06-16'),
  ],
});
assert(registeredLater.windowStart === '2026-06-16' && registeredLater.windowEnd === '2027-06-15', 'the registered example uses the current anniversary year');
assert(registeredLater.completedCount === 1 && registeredLater.requiredCount === 2, 'the anniversary date stays with the cycle that is ending');
assert(registeredLater.activityStatus === 'not_yet_met', 'one of two registered workshops is not yet met');

const firstRegisteredYear = activity({
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  today: '2025-12-01',
});
assert(firstRegisteredYear.windowStart === '2025-06-15' && firstRegisteredYear.windowEnd === '2026-06-15', 'a registered qualification in the first year uses that first cycle');
assert(firstRegisteredYear.requiredCount === 2, 'the first registered year does not use the provisional count');

const leap = activity({
  qualificationStanding: 'provisional',
  t4tCompletedOn: '2024-02-29',
  today: '2025-02-28',
  workshops: [workshop('leap-day', '2024-02-29'), workshop('clamped', '2025-02-28'), workshop('next', '2025-03-01')],
});
assert(leap.windowEnd === '2025-02-28' && leap.completedCount === 2, 'Feb 29 clamps to Feb 28 and that anniversary date counts');
const leapNext = activity({
  qualificationStanding: 'registered',
  t4tCompletedOn: '2024-02-29',
  today: '2025-03-01',
});
assert(leapNext.windowStart === '2025-03-01' && leapNext.windowEnd === '2026-02-28', 'the cycle after a clamped Feb 29 starts the following calendar day');

const missing = activity({ t4tCompletedOn: null, today: '2026-09-30' });
const futureAnchor = activity({ t4tCompletedOn: '2026-10-01', today: '2026-09-30' });
assert(missing.applicable === false && futureAnchor.applicable === false, 'a missing or future T4T date has no activity window');
assert(formatLivingWorksActivityLine(missing) === '' && formatLivingWorksActivityLine(futureAnchor) === '', 'a missing or future T4T date has no activity line');

const products = [
  { id: 'safetalk', name: 'safeTALK', code: 'safetalk', sort_order: 9, active: true },
  { id: 'asist', name: 'ASIST', code: 'asist', sort_order: 10, active: true },
  { id: 'gottman', name: 'Gottman', code: 'gottman_seven_principles', sort_order: 4, active: true },
  { id: 't4t', name: 'safeTALK T4T', code: 'safetalk_t4t', sort_order: 11, active: true },
];
const people = [
  { id: 'ada', name: 'Ada', active: true, is_facilitator: true },
  { id: 'blake', name: 'Blake', active: true, is_facilitator: true },
];
const personnel = summarizeFacilitatorPersonnel(people, [], [
  { person_id: 'ada', product_id: 'safetalk', standing: 'registered', t4t_completed_on: '2024-06-15' },
  { person_id: 'ada', product_id: 'asist', standing: 'registered', t4t_completed_on: '2024-06-15' },
  { person_id: 'ada', product_id: 'gottman', standing: 'registered', t4t_completed_on: '2024-07-15' },
  { person_id: 'blake', product_id: 'safetalk', standing: 'provisional', t4t_completed_on: '2024-06-15' },
  { person_id: 'blake', product_id: 'asist', standing: 'provisional', t4t_completed_on: null },
], products);
const snapshot = JSON.stringify(personnel);
const end = '2025-06-15';
const within = (count, productId) => Array.from({ length: count }, (_, index) => ({
  eventId: `${productId}-${index}`,
  personId: 'ada',
  productId,
  recordedOn: '2024-08-01',
}));
const metWorkshops = [
  ...within(2, 'safetalk'),
  ...within(1, 'asist'),
];
const today30 = shiftCalendarDays(end, -30);
const today7 = shiftCalendarDays(end, -7);
const today91 = shiftCalendarDays(end, -91);
const metRows = buildQualificationAnniversaryWarnings(personnel, metWorkshops, today30);
assert(!metRows.some((row) => row.personId === 'ada' && (row.productCode === 'safetalk' || row.productCode === 'asist')), 'a met safeTALK or ASIST requirement does not warn 30 days before the anniversary');
assert(metRows.some((row) => row.productName === 'Gottman' && row.status === 'upcoming'), 'a non-LivingWorks product keeps its date warning');

const unmetSafe = buildQualificationAnniversaryWarnings(personnel, within(1, 'safetalk'), today30);
assert(unmetSafe.find((row) => row.personId === 'ada' && row.productCode === 'safetalk')?.status === 'needs_attention', 'safeTALK registered 1 of 2 at 30 days needs attention');
assert(unmetSafe.find((row) => row.personId === 'ada' && row.productCode === 'safetalk')?.progress === '1 of 2 workshops', 'the warning row shows workshop progress');

const metAsist = buildQualificationAnniversaryWarnings(personnel, within(1, 'asist'), today7);
assert(!metAsist.some((row) => row.personId === 'ada' && row.productCode === 'asist'), 'ASIST registered 1 of 1 at 7 days does not warn');
const unmetAsist = buildQualificationAnniversaryWarnings(personnel, [], today7);
assert(unmetAsist.find((row) => row.personId === 'ada' && row.productCode === 'asist')?.status === 'urgent', 'ASIST registered 0 of 1 at 7 days is urgent');
assert(unmetAsist.find((row) => row.personId === 'ada' && row.productCode === 'asist')?.progress === '0 of 1 workshop', 'one required workshop stays singular');

const provisionalMet = buildQualificationAnniversaryWarnings(personnel, [
  { eventId: 'p1', personId: 'blake', productId: 'safetalk', recordedOn: '2024-07-01' },
  { eventId: 'p2', personId: 'blake', productId: 'safetalk', recordedOn: '2024-08-01' },
  { eventId: 'p3', personId: 'blake', productId: 'safetalk', recordedOn: '2024-09-01' },
], today30);
assert(!provisionalMet.some((row) => row.personId === 'blake' && row.productCode === 'safetalk'), 'provisional 3 of 3 before the deadline does not warn');

const provisionalClosed = buildQualificationAnniversaryWarnings(personnel, [
  { eventId: 'p1', personId: 'blake', productId: 'safetalk', recordedOn: '2024-07-01' },
  { eventId: 'p2', personId: 'blake', productId: 'safetalk', recordedOn: '2024-08-01' },
], shiftCalendarDays(end, 1));
const closed = provisionalClosed.find((row) => row.personId === 'blake' && row.productCode === 'safetalk');
assert(closed?.status === 'overdue' && closed?.progress === '2 of 3 workshops', 'provisional 2 of 3 after the deadline is overdue');

const distant = buildQualificationAnniversaryWarnings(personnel, [], today91);
assert(!distant.some((row) => row.personId === 'ada' && (row.productCode === 'safetalk' || row.productCode === 'asist')), 'an unmet requirement more than 90 days away does not warn');
const distantProfile = presentQualificationFollowUp({
  productCode: 'safetalk',
  qualificationStanding: 'registered',
  t4tCompletedOn: '2024-06-15',
  personActive: true,
  workshops: [],
  today: today91,
});
assert(distantProfile.warning.status === 'none' && distantProfile.activityLine.includes('Not Yet Met'), 'the profile still shows progress when no warning is active');
assert(distantProfile.activityLine === '0 of 2 workshops through 06/15/25 — Not Yet Met', 'the profile line names the window end');

const verification = presentQualificationFollowUp({
  productCode: 'asist',
  qualificationStanding: 'provisional',
  t4tCompletedOn: null,
  personActive: true,
  workshops: [],
  today: '2026-09-30',
});
assert(verification.warning.status === 'needs_verification' && verification.activityLine === '', 'a missing T4T date keeps Needs Verification and omits the activity fraction');
assert(JSON.stringify(personnel) === snapshot, 'activity evaluation does not change qualification facts');

const generic = buildT4tAnniversaryAlerts(personnel, today30);
assert(generic.some((row) => row.productCode === 'safetalk'), 'the generic anniversary list stays available for non-composed checks');

const tokens = ordinaryLivingWorksWorkshops([
  { event_id: 'workshop', person_id: 'ada', product_id: 'safetalk', recorded_on: '2024-08-01', event_type: 'SafeTalk Workshop', is_t4t: false },
  { event_id: 'workshop', person_id: 'ada', product_id: 'safetalk', recorded_on: '2024-08-01', event_type: 'SafeTalk Workshop', is_t4t: false },
  { event_id: 't4t-flag', person_id: 'ada', product_id: 'safetalk', recorded_on: '2024-09-01', event_type: 'SafeTalk Workshop', is_t4t: true },
  { event_id: 'dedicated', person_id: 'ada', product_id: 't4t', recorded_on: '2024-09-02', event_type: 'SafeTalk T4T', is_t4t: false },
  { event_id: 'unresolved', person_id: null, product_id: 'safetalk', recorded_on: '2024-09-03', event_type: 'SafeTalk Workshop', is_t4t: false },
  { event_id: 'future', person_id: 'ada', product_id: 'asist', recorded_on: '2026-12-01', event_type: 'ASIST Workshop', is_t4t: false },
  { event_id: 'invalid', person_id: 'ada', product_id: 'asist', recorded_on: 'TBD', event_type: 'ASIST Workshop', is_t4t: false },
  { event_id: 'blank-product', person_id: 'ada', product_id: null, recorded_on: '2024-09-04', event_type: 'SafeTalk Workshop', is_t4t: false },
], products, '2026-09-30');
assert(tokens.map((row) => row.eventId).join('|') === 'workshop', 'ordinary filtering keeps one resolved past workshop and drops T4T, unresolved, future, invalid, and unmapped rows');

const metLine = formatLivingWorksActivityLine(activity({
  qualificationStanding: 'registered',
  today: '2025-06-15',
  workshops: [workshop('a', '2024-08-01'), workshop('b', '2024-09-01')],
}));
assert(metLine === '2 of 2 workshops through 06/15/25 — Met', 'a met requirement renders as Met');
const closedLine = formatLivingWorksActivityLine(activity({
  qualificationStanding: 'provisional',
  today: '2025-06-16',
  workshops: [workshop('a', '2024-08-01')],
}));
assert(closedLine === '1 of 3 workshops through 06/15/25 — Window Closed', 'a closed unmet provisional window says Window Closed');

const missedSafe = activity({
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  today: '2026-09-30',
  workshops: [workshop('prev-1', '2025-08-01')],
});
assert(missedSafe.previousCycleMissed === true, 'registered safeTALK previous cycle 1 of 2 is missed');
assert(missedSafe.previousCompletedCount === 1 && missedSafe.previousRequiredCount === 2, 'the missed safeTALK cycle keeps its own count');
assert(missedSafe.previousWindowStart === '2025-06-15' && missedSafe.previousWindowEnd === '2026-06-15', 'the missed cycle is the anniversary year that just ended');
assert(missedSafe.windowStart === '2026-06-16' && missedSafe.completedCount === 0, 'current-cycle progress stays on the open year');

const metPreviousSafe = activity({
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  today: '2026-09-30',
  workshops: [workshop('prev-1', '2025-08-01'), workshop('prev-2', '2025-09-01')],
});
assert(metPreviousSafe.previousCycleMissed === false && metPreviousSafe.previousCompletedCount === 2, 'registered safeTALK previous cycle 2 of 2 is not missed');

const missedAsist = activity({
  productCode: 'asist',
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  today: '2026-09-30',
  workshops: [],
});
assert(missedAsist.previousCycleMissed === true && missedAsist.previousCompletedCount === 0 && missedAsist.previousRequiredCount === 1, 'registered ASIST previous cycle 0 of 1 is missed');

const metPreviousAsist = activity({
  productCode: 'asist',
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  today: '2026-09-30',
  workshops: [workshop('asist-prev', '2025-10-01')],
});
assert(metPreviousAsist.previousCycleMissed === false && metPreviousAsist.previousCompletedCount === 1, 'registered ASIST previous cycle 1 of 1 is not missed');

const clearedByNewCycle = activity({
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  today: '2026-09-30',
  workshops: [
    workshop('prev-1', '2025-08-01'),
    workshop('new-1', '2026-07-01'),
    workshop('new-2', '2026-08-01'),
  ],
});
assert(clearedByNewCycle.previousCycleMissed === true && clearedByNewCycle.previousCompletedCount === 1, 'a workshop in the new cycle does not satisfy the previous cycle');
assert(clearedByNewCycle.completedCount === 2 && clearedByNewCycle.activityStatus === 'met', 'current-cycle progress still advances normally');

const cyclePersonnel = summarizeFacilitatorPersonnel([
  { id: 'cara', name: 'Cara', active: true, is_facilitator: true },
], [], [
  { person_id: 'cara', product_id: 'safetalk', standing: 'registered', t4t_completed_on: '2025-06-15' },
], products);
const missedOverview = buildQualificationAnniversaryWarnings(cyclePersonnel, [
  { eventId: 'prev-1', personId: 'cara', productId: 'safetalk', recordedOn: '2025-08-01' },
  { eventId: 'new-1', personId: 'cara', productId: 'safetalk', recordedOn: '2026-07-01' },
  { eventId: 'new-2', personId: 'cara', productId: 'safetalk', recordedOn: '2026-08-01' },
], '2026-09-30');
const missedRow = missedOverview.filter((row) => row.personId === 'cara' && row.productCode === 'safetalk');
assert(missedRow.length === 1 && missedRow[0].status === 'overdue' && missedRow[0].deadline === '2026-06-15', 'a missed previous cycle remains Overdue after the anniversary');
assert(missedRow[0].progress === '1 of 2 workshops', 'the overdue row shows the missed cycle progress');

const missedProfile = presentQualificationFollowUp({
  productCode: 'safetalk',
  qualificationStanding: 'registered',
  t4tCompletedOn: '2025-06-15',
  personActive: true,
  workshops: [
    workshop('prev-1', '2025-08-01'),
    workshop('new-1', '2026-07-01'),
    workshop('new-2', '2026-08-01'),
  ],
  today: '2026-09-30',
});
assert(missedProfile.previousCycleLine === 'Previous cycle: 1 of 2 workshops through 06/15/26 — Requirement Not Met', 'the profile names the missed previous cycle');
assert(missedProfile.activityLine === 'Current cycle: 2 of 2 workshops through 06/15/27 — Met', 'the profile keeps current-cycle progress separate');
assert(missedProfile.progress === '2 of 2 workshops', 'profile progress follows the current cycle');

const competingToday = '2027-05-16';
const competing = buildQualificationAnniversaryWarnings(cyclePersonnel, [
  { eventId: 'prev-1', personId: 'cara', productId: 'safetalk', recordedOn: '2025-08-01' },
  { eventId: 'current-1', personId: 'cara', productId: 'safetalk', recordedOn: '2026-07-01' },
], competingToday);
const competingRows = competing.filter((row) => row.personId === 'cara' && row.productCode === 'safetalk');
assert(competingRows.length === 1 && competingRows[0].status === 'overdue' && competingRows[0].deadline === '2026-06-15', 'a missed previous cycle is preferred over a current-cycle warning');

const immediateOnly = activity({
  qualificationStanding: 'registered',
  t4tCompletedOn: '2023-06-15',
  today: '2026-09-30',
  workshops: [workshop('immediate-a', '2025-08-01'), workshop('immediate-b', '2025-09-01')],
});
assert(immediateOnly.previousWindowStart === '2025-06-16' && immediateOnly.previousWindowEnd === '2026-06-15', 'only the immediately preceding cycle is evaluated');
assert(immediateOnly.previousCycleMissed === false && immediateOnly.previousCompletedCount === 2, 'an older missed year does not stay overdue once the preceding cycle is met');
assert(!Array.isArray(immediateOnly.cycles), 'older anniversary years are not collected');

const provisionalAfter = activity({
  qualificationStanding: 'provisional',
  today: '2025-06-16',
  workshops: [workshop('a', '2024-08-01')],
});
assert(provisionalAfter.previousCycleMissed === false && provisionalAfter.previousWindowStart == null, 'provisional qualifications do not gain a previous registered cycle');
assert(provisionalAfter.activityStatus === 'window_closed' && provisionalAfter.completedCount === 1, 'a short provisional window stays closed');

assert(!model.includes('is_t4t') && !model.includes('isT4t'), 'the personnel model does not read the Event T4T flag');
assert(db.includes(".from('facilitator_event_tokens')"), 'ordinary workshop rows are read from facilitator event tokens');
assert(!db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf('export async function fetchTeamDirectoryPersonnel')).includes(".from('events')"), 'the facilitator read does not query Events directly');
assert(filter.includes('is_t4t') && filter.includes('SafeTalk T4T') && filter.includes('ASIST T4T'), 'T4T deliveries are excluded beside the personnel model');
assert(!activitySource.includes('facilitator_t4t_completions'), 'activity windows do not read completion history');
assert(!activitySource.includes('facilitator_t4t_product_experience'), 'activity windows do not read the T4T delivery aggregate');
assert(!activitySource.includes('expiration_on') && !activitySource.includes('expirationOn'), 'activity evaluation does not read expiration');
assert(!/\.(insert|update|delete|upsert|rpc)\(/.test(activitySource), 'activity evaluation does not write');
assert(migrations.filter((name) => /^0(29|[3-9]\d)_/.test(name)).sort().join('|') === '029_remove_facilitator_t4t_completion_from_event.sql|030_t4t_completion_source_uniqueness.sql|031_t4t_attendance_person_cleanup.sql', 'migrations after 028 are attendance removal, completion provenance, and attendance-created person cleanup');

if (errors.length) {
  console.error('validate-livingworks-activity-overlay failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-livingworks-activity-overlay: ok');
