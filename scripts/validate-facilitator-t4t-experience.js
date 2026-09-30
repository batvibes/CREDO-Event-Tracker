/**
 * T4T facilitation experience checks.
 * Run: node scripts/validate-facilitator-t4t-experience.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FACILITATOR_EMPTY_T4T_EXPERIENCE,
  FACILITATOR_NO_EXPERIENCE_OR_RECORD,
  FACILITATOR_QUALIFICATION_NOT_ENTERED,
  FACILITATOR_T4T_EXPERIENCE_HEADING,
  buildFacilitatorOverview,
  buildFacilitatorProgramCapabilities,
  facilitatorProductFilterOptions,
  facilitatorProductPersonnel,
  filterFacilitatorPersonnel,
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

const migration = read('supabase/migrations/025_facilitator_t4t_product_experience.sql');
const tokens = read('supabase/migrations/024_event_workshop_t4t.sql');
const taxonomy = read('supabase/migrations/023_facilitator_product_taxonomy_correction.sql');
const resolution = read('supabase/migrations/021_facilitator_experience_foundation.sql');
const app = read('js/app.js');
const db = read('js/db.js');
const model = read('js/facilitator-management.js');
const ordinaryStart = migration.indexOf('create or replace view public.facilitator_product_experience');
const t4tStart = migration.indexOf('create or replace view public.facilitator_t4t_product_experience');
const ordinary = migration.slice(ordinaryStart, t4tStart);
const t4tView = migration.slice(t4tStart, migration.indexOf('comment on view public.facilitator_t4t_product_experience'));
const tokenView = tokens.slice(
  tokens.indexOf('create or replace view public.facilitator_event_tokens'),
  tokens.indexOf('comment on view public.facilitator_event_tokens'),
);
const detail = app.slice(app.indexOf('function openFacilitatorDetail'), app.indexOf('function closeFacilitatorDetail'));
const t4tSection = detail.slice(detail.indexOf('facilitatorT4tExperienceAvailable'));
const fetchSources = db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf('export async function fetchTeamDirectoryPersonnel'));
const editor = app.slice(app.indexOf('function paintFacilitatorQualificationEditor'), app.indexOf('function cancelFacilitatorQualificationEdit'));
const submit = app.slice(app.indexOf('async function submitFacilitatorQualification'), app.indexOf('function openFacilitatorQualificationManager'));

assert(ordinaryStart >= 0 && t4tStart > ordinaryStart, 'ordinary and T4T experience views are both defined');
assert(ordinary.includes('security_invoker = true') && t4tView.includes('security_invoker = true'), 'both experience views stay security invoker');
assert(ordinary.includes('from public.facilitator_event_tokens token') && t4tView.includes('from public.facilitator_event_tokens token'), 'both aggregates read derived facilitator tokens');
assert(ordinary.includes('and not (\n    token.is_t4t is true\n    or coalesce(token.event_type, \'\') in (\'SafeTalk T4T\', \'ASIST T4T\')\n  )'), 'ordinary experience is the null-safe complement of the T4T classification');
assert(ordinary.includes("coalesce(token.event_type, '')"), 'a null event_type stays eligible for ordinary experience');
assert(t4tView.includes('token.is_t4t is true'), 'T4T experience includes curriculum Events where is_t4t is true');
assert(t4tView.includes("token.event_type in ('SafeTalk T4T', 'ASIST T4T')"), 'dedicated T4T Event Types count without requiring is_t4t');
assert(!t4tView.includes("token.event_type in ('SafeTalk T4T', 'ASIST T4T') and token.is_t4t"), 'dedicated T4T Event Types do not also require is_t4t');
for (const viewSql of [ordinary, t4tView]) {
  assert(viewSql.includes('count(distinct token.event_id)'), 'experience counts distinct Event IDs');
  assert(viewSql.includes('token.recorded_on is not null'), 'undated Events do not count');
  assert(viewSql.includes('token.recorded_on <= current_date'), 'future Events do not count');
  assert(viewSql.includes('token.person_id is not null'), 'unresolved facilitator identities do not count');
  assert(viewSql.includes('token.product_id is not null'), 'a token without a resolved product does not count');
}
assert(!/\b(four_lenses|prep_8_0|gottman_seven_principles|cliftonstrengths_strengths_discovery_encounter|navigating_your_next_chapter)\b/.test(migration), 'curriculum products are not hard-coded into the T4T aggregate');
assert(taxonomy.includes("('Marriage Enrichment Workshop', 'gottman_seven_principles')"), 'Gottman remains an allowed MEW curriculum');
assert(taxonomy.includes("('Marriage Enrichment Workshop', 'prep_8_0')"), 'PREP 8.0 remains an allowed MEW curriculum');
assert(taxonomy.includes("('Personal Growth Workshop', 'four_lenses')"), '4 Lenses remains an allowed PGW curriculum');
assert(taxonomy.includes("('Personal Growth Workshop', 'cliftonstrengths_strengths_discovery_encounter')"), 'CliftonStrengths remains an allowed PGW curriculum');
assert(taxonomy.includes("('Personal Growth Workshop', 'navigating_your_next_chapter')"), 'Navigating Your Next Chapter remains an allowed PGW curriculum');
assert(tokenView.includes('then event.curriculum_product_id'), 'a selected allowed curriculum remains the credited product');
assert(tokenView.includes('else null::uuid'), 'a workshop without a selected curriculum still credits no product');
assert(migration.includes('from public.facilitator_event_tokens token'), 'Migration 025 reads the token view');
assert(!migration.includes('create or replace view public.facilitator_event_tokens'), 'Migration 025 does not replace token product resolution');
assert(taxonomy.includes("('SafeTalk T4T', 'safetalk_t4t')"), 'SafeTalk T4T stays mapped to the safeTALK T4T product');
assert(taxonomy.includes("('ASIST T4T', 'asist_t4t')"), 'ASIST T4T stays mapped to the ASIST T4T product');
assert(!migration.includes("'safetalk'") && !migration.includes("'asist'"), 'dedicated T4T experience is not remapped onto the base products');
assert(tokenView.includes('public.split_facilitator_tokens(event.facilitators)'), 'tokens still come only from events.facilitators');
assert(!tokenView.includes('credo_staff') && !tokenView.includes('poc'), 'token generation does not use credo_staff or poc');
assert(!/\bcredo_staff\b/.test(migration) && !/\bpoc\b/.test(migration), 'the experience split does not read credo_staff or poc');
assert(resolution.includes('case when count(*) = 1 then'), 'ambiguous or unmatched tokens stay unresolved');
assert(!/\b(insert\s+into|update\s+public\.|delete\s+from)\b/i.test(migration), 'the migration does not write Events, qualifications, or history');
assert(!migration.includes('facilitator_qualifications'), 'T4T facilitation does not write qualification facts');
assert(!/\bcreate\s+table\b/i.test(migration), 'T4T experience is not a writable table');
assert(migration.includes('grant select on table public.facilitator_product_experience to authenticated'), 'ordinary experience stays readable by authenticated users');
assert(migration.includes('grant select on table public.facilitator_t4t_product_experience to authenticated'), 'T4T experience is readable by authenticated users');
assert(migration.includes('revoke all on table public.facilitator_t4t_product_experience from public, anon, authenticated'), 'T4T experience is not granted to anonymous users');
assert(!migration.includes('create policy'), 'derived experience has no write policy');

assert(model.includes(FACILITATOR_T4T_EXPERIENCE_HEADING) && model.includes(FACILITATOR_EMPTY_T4T_EXPERIENCE), 'the T4T profile copy is defined');
assert(detail.includes('FACILITATOR_T4T_EXPERIENCE_HEADING'), 'the profile contains T4T Facilitation Experience');
assert(t4tSection.includes('FACILITATOR_EMPTY_T4T_EXPERIENCE'), 'the T4T section has its empty state');
assert(t4tSection.includes('T4Ts Conducted') && t4tSection.includes('First Recorded T4T Facilitation') && t4tSection.includes('Most Recent T4T Facilitation'), 'the T4T section uses the T4T column labels');
assert(t4tSection.includes('row.productName') && t4tSection.includes('person.t4tExperience'), 'the T4T section shows only loaded evidence rows');
assert(!t4tSection.includes('createElement(\'button\')'), 'the T4T section is read-only');
assert(detail.includes('if (facilitatorT4tExperienceAvailable)'), 'the T4T section renders from the T4T aggregate');
assert(fetchSources.includes(".from('facilitator_t4t_product_experience')"), 'T4T experience is read from its derived view');
assert(fetchSources.includes(".from('facilitator_product_experience')"), 'ordinary experience remains on its derived view');
assert(fetchSources.includes('t4tExperienceAvailable'), 'a missing T4T view does not discard ordinary Facilitator Management data');
assert(fetchSources.includes('isMissingEventCurriculumSchemaError'), 'only a missing relation uses the empty T4T result');
assert(!fetchSources.includes(".from('events')") && !model.includes(".from('events')"), 'Facilitator Management does not read Events directly');
assert(!/\.(insert|update|delete|upsert)\(/.test(model), 'Facilitator Management does not write experience or qualifications');
assert(!model.includes('is_t4t') && !model.includes('isT4t'), 'the personnel model does not read the Event T4T flag');
assert(editor.includes('FACILITATOR_STANDING_OPTIONS') && submit.includes('saveFacilitatorQualification'), 'qualification editing remains the existing save path');
assert(!submit.includes('t4tExperience'), 'saving a qualification does not read T4T facilitation evidence');
assert(!migration.includes('within 12') && !model.includes('co-trainer') && !model.includes('every portion'), 'LivingWorks compliance rules were not added');

const products = [
  { id: 'lenses', name: '4 Lenses', code: 'four_lenses', sort_order: 6, active: true },
  { id: 'prep', name: 'PREP 8.0', code: 'prep_8_0', sort_order: 5, active: true },
  { id: 'safetalk-t4t', name: 'safeTALK T4T', code: 'safetalk_t4t', sort_order: 11, active: true },
  { id: 'empty', name: 'Navigating Your Next Chapter', code: 'navigating_your_next_chapter', sort_order: 8, active: true },
];
const people = [
  { id: 'jane', name: 'Jane Doe', active: true, is_facilitator: false },
  { id: 'sam', name: 'Sam', active: true, is_facilitator: false },
  { id: 'blake', name: 'Blake', active: true, is_facilitator: true },
  { id: 'outsider', name: 'Pat', active: true, is_facilitator: false },
];
const personnel = summarizeFacilitatorPersonnel(
  people,
  [{ person_id: 'jane', product_id: 'lenses', events_conducted: 2, first_recorded_facilitation_on: '2026-01-10', most_recent_facilitation_on: '2026-04-02' }],
  [],
  products,
  [
    { person_id: 'jane', product_id: 'lenses', events_conducted: 1, first_recorded_facilitation_on: '2026-05-18', most_recent_facilitation_on: '2026-05-18' },
    { person_id: 'sam', product_id: 'safetalk-t4t', events_conducted: 1, first_recorded_facilitation_on: '2026-03-15', most_recent_facilitation_on: '2026-03-15' },
  ],
);
assert(personnel.map((person) => person.id).sort().join('|') === 'blake|jane|sam', 'a T4T-only person stays in Facilitator Management');
assert(!personnel.some((person) => person.id === 'outsider'), 'a person with no facilitator evidence is still omitted');
const jane = personnel.find((person) => person.id === 'jane');
assert(jane.experience.length === 1 && jane.t4tExperience.length === 1, 'ordinary and T4T evidence stay on separate profile lists');
assert(jane.experience[0].eventsConducted === 2 && jane.t4tExperience[0].eventsConducted === 1, 'the same product can have both kinds of evidence without merging the rows');
assert(jane.hasQualificationRecord === false && jane.qualificationProducts.length === 0, 'T4T facilitation does not create a qualification');
assert(jane.productCount === 1 && jane.eventsConducted === 2, 'the personnel roster counts ordinary experience');
const sam = personnel.find((person) => person.id === 'sam');
assert(sam.experience.length === 0 && sam.t4tExperience[0].productName === 'safeTALK T4T', 'dedicated T4T evidence is shown only in the T4T list');
assert(filterFacilitatorPersonnel(personnel, { productId: 'safetalk-t4t' }).map((person) => person.id).join('|') === 'sam', 'the personnel product filter recognizes T4T evidence');
assert(filterFacilitatorPersonnel(personnel, { productId: 'lenses' }).map((person) => person.id).join('|') === 'jane', 'the personnel product filter still recognizes ordinary evidence');
assert(filterFacilitatorPersonnel(personnel, { productId: 'empty' }).length === 0, 'a product with no evidence still matches nobody');
assert(facilitatorProductFilterOptions(products).some((product) => product.id === 'empty'), 'a zero-record active product stays in the filter');

const overview = buildFacilitatorOverview(personnel, products);
const lenses = overview.coverage.find((row) => row.productId === 'lenses');
assert(lenses.peopleWithExperience === 1 && lenses.recordedInstances === 3, 'overview counts one person once and adds ordinary and T4T instances');
assert(lenses.mostRecentOn === '2026-05-18', 'overview recency uses the later of the two aggregates');
const safetalk = overview.coverage.find((row) => row.productId === 'safetalk-t4t');
assert(safetalk.peopleWithExperience === 1 && safetalk.recordedInstances === 1, 'overview keeps dedicated T4T evidence');
assert(overview.recordedFacilitationInstances === 4, 'overview instances are the sum of the separate aggregates');
assert(overview.attention.map((item) => `${item.personId}:${item.condition}`).sort().join('|') === [
  `blake:${FACILITATOR_NO_EXPERIENCE_OR_RECORD}`,
  `jane:${FACILITATOR_QUALIFICATION_NOT_ENTERED}`,
  `sam:${FACILITATOR_QUALIFICATION_NOT_ENTERED}`,
].sort().join('|'), 'Needs Attention treats T4T evidence as recorded facilitator evidence');

const capabilities = buildFacilitatorProgramCapabilities(personnel, products);
const capabilityLenses = capabilities.find((row) => row.productId === 'lenses');
assert(capabilityLenses.personnelCount === 1 && capabilityLenses.recordedExperienceCount === 1 && capabilityLenses.recordedInstances === 3, 'Program Capabilities counts a person once and keeps both instance totals');
assert(capabilityLenses.qualificationRecordCount === 0, 'T4T facilitation does not become a qualification record');
const capabilityDetail = facilitatorProductPersonnel(personnel, 'safetalk-t4t');
assert(capabilityDetail.length === 1 && capabilityDetail[0].hasRecordedExperience === true && capabilityDetail[0].recordedInstances === 1, 'product detail keeps T4T-only evidence');
assert(capabilityDetail[0].hasQualificationRecord === false, 'product detail does not invent a qualification from T4T facilitation');

let historicalDiff = '';
try {
  historicalDiff = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations/021_facilitator_experience_foundation.sql', 'supabase/migrations/023_facilitator_product_taxonomy_correction.sql', 'supabase/migrations/024_event_workshop_t4t.sql', 'js/event-curriculum.js', 'js/aar-curriculum.js', 'js/event-report-filters.js', 'js/monthly-report-pptx-export.js'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(historicalDiff.trim() === '', 'historical experience, curriculum, reporting, and MIR files are unchanged');

if (errors.length) {
  console.error('validate-facilitator-t4t-experience failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-t4t-experience: ok');
