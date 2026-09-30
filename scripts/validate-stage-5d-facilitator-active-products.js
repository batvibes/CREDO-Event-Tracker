/**
 * Stage 5D Facilitator Management active-product catalog checks.
 * Run: node scripts/validate-stage-5d-facilitator-active-products.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FACILITATOR_NO_EXPERIENCE_OR_RECORD,
  FACILITATOR_QUALIFICATION_NOT_ENTERED,
  buildFacilitatorOverview,
  buildFacilitatorProgramCapabilities,
  facilitatorProductFilterOptions,
  facilitatorProductPersonnel,
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

function product(id, name, code, sortOrder, active) {
  return { id, name, code, sort_order: sortOrder, active };
}

const activeCatalog = [
  product('p12', 'ASIST T4T', 'asist_t4t', 12, true),
  product('p1', 'Marriage Enrichment Retreat', 'marriage_enrichment_retreat', 1, true),
  product('p6', '4 Lenses', 'four_lenses', 6, true),
  product('p4', 'Gottman, Seven Principles of Making Marriage Work', 'gottman_seven_principles', 4, true),
  product('p9', 'safeTALK', 'safetalk', 9, true),
  product('p2', 'Family Enrichment Retreat', 'family_enrichment_retreat', 2, true),
  product('p11', 'safeTALK T4T', 'safetalk_t4t', 11, true),
  product('p8', 'Navigating Your Next Chapter', 'navigating_your_next_chapter', 8, true),
  product('p5', 'PREP 8.0', 'prep_8_0', 5, true),
  product('p3', 'Personal Growth Retreat', 'personal_growth_retreat', 3, true),
  product('p10', 'ASIST', 'asist', 10, true),
  product('p7', 'CliftonStrengths, Strengths Discovery Encounter', 'cliftonstrengths_strengths_discovery_encounter', 7, true),
];
const retiredCatalog = [
  product('r1', 'Marriage Enrichment Workshop', 'marriage_enrichment_workshop', 101, false),
  product('r2', 'Personal Growth Workshop', 'personal_growth_workshop', 102, false),
  product('r3', 'Gottman Method', 'gottman_method', 103, false),
  product('r4', 'Seven Principles for Making Marriage Work', 'seven_principles_for_making_marriage_work', 104, false),
  product('r5', 'Five Love Languages', 'five_love_languages', 105, false),
  product('r6', 'Strengths Discovery Encounter', 'strengths_discovery_encounter', 106, false),
  product('r7', 'CliftonStrengths', 'cliftonstrengths', 107, false),
];
const products = [...retiredCatalog, ...activeCatalog, product('missing-flag', 'Missing Flag', 'missing_flag', 50, undefined)];
const expectedNames = [
  'Marriage Enrichment Retreat',
  'Family Enrichment Retreat',
  'Personal Growth Retreat',
  'Gottman, Seven Principles of Making Marriage Work',
  'PREP 8.0',
  '4 Lenses',
  'CliftonStrengths, Strengths Discovery Encounter',
  'Navigating Your Next Chapter',
  'safeTALK',
  'ASIST',
  'safeTALK T4T',
  'ASIST T4T',
];

const people = [
  { id: 'pat', name: 'Pat', active: true, is_facilitator: false },
  { id: 'blake', name: 'Blake', active: true, is_facilitator: true },
  { id: 'ada', name: 'Ada', rank_title: 'LCDR', active: true, is_facilitator: false },
  { id: 'shane', name: 'Shane Freiberg', rank_title: 'LCDR', active: true, is_facilitator: false },
  { id: 'john', name: 'John Scanlon', rank_title: 'CDR', active: false, is_facilitator: false },
];
const beforeRole = blakeIsFacilitator(people);
const personnel = summarizeFacilitatorPersonnel(
  people,
  [
    { person_id: 'pat', product_id: 'r1', events_conducted: 5, most_recent_facilitation_on: '2026-09-01' },
    { person_id: 'ada', product_id: 'p5', events_conducted: 3, most_recent_facilitation_on: '2026-02-01' },
    { person_id: 'ada', product_id: 'r2', events_conducted: 8, most_recent_facilitation_on: '2026-08-01' },
    { person_id: 'shane', product_id: 'p4', events_conducted: 2, most_recent_facilitation_on: '2026-07-01' },
    { person_id: 'shane', product_id: 'p5', events_conducted: 1, most_recent_facilitation_on: '2026-01-01' },
    { person_id: 'shane', product_id: 'r3', events_conducted: 6, most_recent_facilitation_on: '2026-10-01' },
    { person_id: 'john', product_id: 'p10', events_conducted: 4, most_recent_facilitation_on: '2025-05-01' },
  ],
  [
    { person_id: 'pat', product_id: 'r3' },
    { person_id: 'blake', product_id: 'r3' },
    { person_id: 'ada', product_id: 'r3' },
    { person_id: 'shane', product_id: 'p4' },
    { person_id: 'shane', product_id: 'r3' },
  ],
  products,
);

function blakeIsFacilitator(rows) {
  return rows.find((row) => row.id === 'blake').is_facilitator;
}

assert(blakeIsFacilitator(people) === beforeRole, 'summarizing the active catalog does not change is_facilitator');
assert(!personnel.some((person) => person.id === 'pat'), 'a person whose only records are inactive products is omitted');
const blake = personnel.find((person) => person.id === 'blake');
assert(blake && blake.experience.length === 0 && blake.qualificationProducts.length === 0 && blake.eventsConducted === 0 && blake.mostRecentOn == null, 'an explicit facilitator with only inactive records stays on the roster with an empty current-product state');
const ada = personnel.find((person) => person.id === 'ada');
assert(ada.experience.map((row) => row.productName).join('|') === 'PREP 8.0', 'personnel product names include only active products');
assert(ada.eventsConducted === 3 && ada.mostRecentOn === '2026-02-01', 'Events Conducted and Most Recent ignore inactive product experience');
assert(ada.hasQualificationRecord === false && ada.qualificationProducts.length === 0, 'an inactive predecessor qualification is not a current qualification');
const shane = personnel.find((person) => person.id === 'shane');
assert(shane.qualificationProducts.map((row) => row.productName).join('|') === 'Gottman, Seven Principles of Making Marriage Work', 'current qualification display is limited to the active product');
assert(shane.eventsConducted === 3 && shane.mostRecentOn === '2026-07-01', 'active-product experience remains counted');
assert(personnel.some((person) => person.id === 'john' && person.active === false), 'inactive people with active-product experience remain visible');

const overview = buildFacilitatorOverview(personnel, products);
assert(overview.coverage.map((row) => row.productName).join('|') === expectedNames.join('|'), 'Product Coverage is the 12 active products in sort order');
assert(overview.coverage.every((row) => !retiredCatalog.some((item) => item.name === row.productName)), 'inactive predecessor products are absent from Product Coverage');
assert(overview.productsWithRecordedExperience === 3, 'products with recorded experience count only active products');
assert(overview.productsWithoutRecordedExperience === 9, 'zero-record active products remain in the catalog count');
assert(overview.recordedFacilitationInstances === 10, 'recorded instances exclude inactive product experience');
assert(overview.recent.every((row) => !['r1', 'r2', 'r3'].includes(row.productId)), 'Recent Recorded Facilitation excludes inactive products');
assert(overview.recent[0].productId === 'p4' && overview.recent[0].mostRecentOn === '2026-07-01', 'recent ordering still uses the latest active-product date');
assert(overview.attention.map((item) => `${item.personId}:${item.condition}`).join('|') === `blake:${FACILITATOR_NO_EXPERIENCE_OR_RECORD}|ada:${FACILITATOR_QUALIFICATION_NOT_ENTERED}`, 'Needs Attention uses current active-product records and ignores retired qualifications');
assert(!overview.attention.some((item) => item.personId === 'shane'), 'an active-product qualification record satisfies the existing personnel gap check');
assert(overview.activeFacilitatorPersonnel === 3, 'Active Facilitator Personnel counts current roster members and excludes inactive people');

const capabilities = buildFacilitatorProgramCapabilities(personnel, products);
assert(capabilities.map((row) => row.productName).join('|') === expectedNames.join('|'), 'Program Capabilities lists the same 12 active products');
const gottman = capabilities.find((row) => row.productId === 'p4');
assert(gottman.qualificationRecordCount === 1 && gottman.personnelCount === 1 && gottman.recordedInstances === 2, 'a predecessor qualification is not transferred onto the consolidated product');
const prep = capabilities.find((row) => row.productId === 'p5');
assert(prep.personnelCount === 2 && prep.qualificationRecordCount === 0 && prep.recordedInstances === 4, 'capability counts stay on the active product represented by the row');
const lenses = capabilities.find((row) => row.productId === 'p6');
assert(lenses.personnelCount === 0 && lenses.recordedInstances === 0 && lenses.qualificationRecordCount === 0, 'a zero-record active product remains visible');
const gottmanPeople = facilitatorProductPersonnel(personnel, 'p4');
assert(gottmanPeople.map((person) => person.personId).join('|') === 'shane', 'product detail includes only people with records on that active product');
assert(facilitatorProductPersonnel(personnel, 'r3').length === 0, 'a retired product has no operational detail population');
const filterNames = facilitatorProductFilterOptions(personnel).map((option) => option.name);
assert(filterNames.join('|') === 'Gottman, Seven Principles of Making Marriage Work|PREP 8.0|ASIST', 'the personnel product filter lists only active products');
assert(!filterNames.includes('Gottman Method') && !filterNames.includes('Marriage Enrichment Workshop'), 'retired products are absent from the product filter');

const legacy = [
  product('workshop', 'Marriage Enrichment Workshop', 'marriage_enrichment_workshop', 2, true),
  product('retreat', 'Marriage Enrichment Retreat', 'marriage_enrichment_retreat', 1, true),
];
const legacyCapabilities = buildFacilitatorProgramCapabilities([], legacy);
assert(legacyCapabilities.map((row) => row.productName).join('|') === 'Marriage Enrichment Retreat|Marriage Enrichment Workshop', 'products that are still active remain in the catalog before Migration 023');

const model = read('js/facilitator-management.js');
const db = read('js/db.js');
const html = read('index.html');
const fetchSources = db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf('export async function fetchTeamDirectoryPersonnel'));
const view = html.slice(html.indexOf('id="view-facilitators"'), html.indexOf('id="view-settings"'));
assert(fetchSources.includes(".select('id, name, code, active, sort_order')"), 'the facilitator product read includes active and sort_order');
assert(fetchSources.includes(".from('facilitator_product_experience')"), 'experience still comes from the derived view');
assert(!fetchSources.includes(".from('events')"), 'Facilitator Management does not read raw Events');
assert(!fetchSources.includes('facilitator_unclassified_workshop_history'), 'the unclassified workshop queue is not loaded');
assert(!/\.(insert|update|delete|upsert)\(/.test(fetchSources), 'the facilitator read does not write');
assert(model.includes('product.active !== true'), 'the operational catalog uses the active flag');
assert(!model.includes('marriage_enrichment_workshop') && !model.includes('gottman_method'), 'retired products are not hard-coded as a blacklist');
assert(!/\.from\('events'\)/.test(model), 'the model does not reconstruct experience from Events');
assert(!/\.(insert|update|delete|upsert)\(/.test(model), 'Facilitator Management does not write experience or qualifications');
assert(!/manual experience|off-system|save_facilitator_qualification/i.test(model), 'manual experience and qualification editing were not added');
assert(!view.includes('Development'), 'Development is not presented as a live view');
assert(!model.includes('curriculum_product_id') && !model.includes('aarCurriculumDisplayName'), 'Event Details and AAR curriculum behavior stay outside Facilitator Management');

let migrationDiff = '';
let eventCurriculumDiff = '';
let aarCurriculumDiff = '';
try {
  migrationDiff = execFileSync('git', ['diff', '--', 'supabase/migrations/023_facilitator_product_taxonomy_correction.sql'], { cwd: ROOT, encoding: 'utf8' });
  eventCurriculumDiff = execFileSync('git', ['diff', '--', 'js/event-curriculum.js'], { cwd: ROOT, encoding: 'utf8' });
  aarCurriculumDiff = execFileSync('git', ['diff', '--', 'js/aar-curriculum.js'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(migrationDiff.trim() === '', 'Migration 023 is unchanged');
assert(eventCurriculumDiff.trim() === '', 'Stage 5B Event curriculum behavior is unchanged');
const migrationNames = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
assert(migrationNames.includes('024_event_workshop_t4t.sql'), 'Stage 5E migration 024 is present');
assert(!migrationNames.some((name) => /^0(2[5-9]|[3-9]\d)_/.test(name)), 'no migration after 024 was added');

if (errors.length) {
  console.error('validate-stage-5d-facilitator-active-products failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-5d-facilitator-active-products: ok');
