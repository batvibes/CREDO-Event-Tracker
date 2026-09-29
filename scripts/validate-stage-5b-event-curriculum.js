/**
 * Stage 5B optional Event curriculum checks.
 * Run: node scripts/validate-stage-5b-event-curriculum.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildEventCurriculumChoices,
  curriculumChoicesForEventType,
  isMissingEventCurriculumSchemaError,
  reconcileCurriculumProductId,
} from '../js/event-curriculum.js';

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
  { id: 'gottman', code: 'gottman_seven_principles', name: 'Gottman, Seven Principles of Making Marriage Work', active: true, sort_order: 4 },
  { id: 'prep', code: 'prep_8_0', name: 'PREP 8.0', active: true, sort_order: 5 },
  { id: 'lenses', code: 'four_lenses', name: '4 Lenses', active: true, sort_order: 6 },
  { id: 'strengths', code: 'cliftonstrengths_strengths_discovery_encounter', name: 'CliftonStrengths, Strengths Discovery Encounter', active: true, sort_order: 7 },
  { id: 'chapter', code: 'navigating_your_next_chapter', name: 'Navigating Your Next Chapter', active: true, sort_order: 8 },
  { id: 'asist', code: 'asist', name: 'ASIST', active: true, sort_order: 10 },
  { id: 'mew-product', code: 'marriage_enrichment_workshop', name: 'Marriage Enrichment Workshop', active: false, sort_order: 101 },
  { id: 'pgw-product', code: 'personal_growth_workshop', name: 'Personal Growth Workshop', active: false, sort_order: 102 },
  { id: 'old-gottman', code: 'gottman_method', name: 'Gottman Method', active: false, sort_order: 103 },
  { id: 'seven', code: 'seven_principles_for_making_marriage_work', name: 'Seven Principles for Making Marriage Work', active: false, sort_order: 104 },
  { id: 'love', code: 'five_love_languages', name: 'Five Love Languages', active: false, sort_order: 105 },
  { id: 'sde', code: 'strengths_discovery_encounter', name: 'Strengths Discovery Encounter', active: false, sort_order: 106 },
  { id: 'clifton', code: 'cliftonstrengths', name: 'CliftonStrengths', active: false, sort_order: 107 },
];

const eventTypes = [
  { id: 'mew-type', name: 'Marriage Enrichment Workshop' },
  { id: 'pgw-type', name: 'Personal Growth Workshop' },
  { id: 'asist-type', name: 'ASIST Workshop' },
];

const choices = buildEventCurriculumChoices({
  allowedRows: [
    { event_type_id: 'mew-type', product_id: 'gottman' },
    { event_type_id: 'mew-type', product_id: 'prep' },
    { event_type_id: 'mew-type', product_id: 'love' },
    { event_type_id: 'mew-type', product_id: 'mew-product' },
    { event_type_id: 'pgw-type', product_id: 'lenses' },
    { event_type_id: 'pgw-type', product_id: 'strengths' },
    { event_type_id: 'pgw-type', product_id: 'chapter' },
    { event_type_id: 'pgw-type', product_id: 'old-gottman' },
    { event_type_id: 'pgw-type', product_id: 'seven' },
    { event_type_id: 'pgw-type', product_id: 'sde' },
    { event_type_id: 'pgw-type', product_id: 'clifton' },
    { event_type_id: 'pgw-type', product_id: 'pgw-product' },
  ],
  products,
  eventTypes,
});

const mew = curriculumChoicesForEventType(choices, 'Marriage Enrichment Workshop');
const pgw = curriculumChoicesForEventType(choices, 'Personal Growth Workshop');
const asist = curriculumChoicesForEventType(choices, 'ASIST Workshop');

assert(mew.map((choice) => choice.code).join('|') === 'gottman_seven_principles|prep_8_0', 'MEW offers the two current curricula in catalog order');
assert(mew.map((choice) => choice.name).join('|') === 'Gottman, Seven Principles of Making Marriage Work|PREP 8.0', 'MEW labels use the current product names');
assert(pgw.map((choice) => choice.code).join('|') === 'four_lenses|cliftonstrengths_strengths_discovery_encounter|navigating_your_next_chapter', 'PGW offers the three current curricula');
assert(pgw.map((choice) => choice.name).join('|') === '4 Lenses|CliftonStrengths, Strengths Discovery Encounter|Navigating Your Next Chapter', 'PGW labels use the current product names');
assert(asist.length === 0, 'a direct Event Type with no allowed curriculum stays without a selector');
assert(!choices.some((choice) => [
  'marriage_enrichment_workshop',
  'personal_growth_workshop',
  'gottman_method',
  'seven_principles_for_making_marriage_work',
  'five_love_languages',
  'strengths_discovery_encounter',
  'cliftonstrengths',
].includes(choice.code)), 'retired products are not selectable curricula');
assert(reconcileCurriculumProductId(choices, 'Marriage Enrichment Workshop', '') === null, 'a blank MEW curriculum saves as null');
assert(reconcileCurriculumProductId(choices, 'Marriage Enrichment Workshop', '   ') === null, 'whitespace is not a curriculum');
assert(reconcileCurriculumProductId(choices, 'Personal Growth Workshop', null) === null, 'a null PGW curriculum stays null');
assert(reconcileCurriculumProductId(choices, 'Marriage Enrichment Workshop', 'gottman') === 'gottman', 'an allowed MEW curriculum is kept');
assert(reconcileCurriculumProductId(choices, 'Personal Growth Workshop', 'gottman') === null, 'a MEW curriculum is not carried onto PGW');
assert(reconcileCurriculumProductId(choices, 'ASIST Workshop', 'gottman') === null, 'leaving the workshop Event Types clears the curriculum');
assert(reconcileCurriculumProductId(choices, 'Personal Growth Workshop', 'lenses') === 'lenses', 'an allowed PGW curriculum is kept');
assert(reconcileCurriculumProductId(choices, 'Marriage Enrichment Workshop', 'love') === null, 'an inactive product is not retained');

assert(isMissingEventCurriculumSchemaError({ code: 'PGRST204' }), 'a missing column is treated as the pre-023 schema');
assert(isMissingEventCurriculumSchemaError({ code: 'PGRST205' }), 'a missing allowed-curriculum table is treated as the pre-023 schema');
assert(isMissingEventCurriculumSchemaError({ code: '42P01' }), 'an undefined table is treated as the pre-023 schema');
assert(isMissingEventCurriculumSchemaError({ code: '42703' }), 'an undefined column is treated as the pre-023 schema');
assert(!isMissingEventCurriculumSchemaError({ code: '42501' }), 'a permission failure is not treated as a missing schema');
assert(!isMissingEventCurriculumSchemaError({ code: 'PGRST301' }), 'an authentication failure is not treated as a missing schema');

const model = read('js/event-curriculum.js');
const db = read('js/db.js');
const app = read('js/app.js');
const html = read('index.html');
const facilitator = read('js/facilitator-management.js');
const migration = read('supabase/migrations/023_facilitator_product_taxonomy_correction.sql');
const form = html.slice(html.indexOf('id="new-event-form"'), html.indexOf('id="event-modal-submit"'));
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

assert(form.includes('Curriculum / Product'), 'Event Details labels the dependent field Curriculum / Product');
assert(form.includes('id="event-curriculum-field" hidden'), 'the curriculum field is hidden until an Event Type has allowed choices');
assert(read('css/styles.css').includes('#new-event-modal #event-curriculum-field[hidden] {\n  display: none;\n}'), 'the Event Details label style does not override the hidden curriculum field');
assert(form.includes('name="curriculumProductId"'), 'the curriculum control is a form field');
assert(!/Unknown|Unspecified|Specific product not yet identified|TBD/.test(form.slice(form.indexOf('event-curriculum-field'))), 'the curriculum field has no placeholder status text');
assert(!/Unknown|Unspecified|Specific product not yet identified|TBD/.test(model), 'curriculum logic does not invent placeholder text');
assert(!uuidPattern.test(model), 'curriculum logic does not hard-code product UUIDs');
assert(!uuidPattern.test(form), 'Event Details does not hard-code product UUIDs');
assert(model.includes('product.active === true'), 'only active products become choices');
assert(model.includes('choice.eventTypeName === eventTypeName'), 'choices follow the exact Event Type name');

assert(db.includes('curriculumProductId: row.curriculum_product_id ?? null'), 'loaded events keep a null curriculum when the column is absent or null');
assert(db.includes('if (options.includeCurriculum)'), 'the curriculum column is added to a save only when requested');
assert(db.includes('includeCurriculum: eventCurriculumSchemaAvailable'), 'saves include the column only after the Stage 5A schema probe succeeds');
assert(db.includes('let eventCurriculumSchemaAvailable = false'), 'curriculum writes stay off until the probe succeeds');
assert(db.includes("select('curriculum_product_id')"), 'the probe checks for the Event curriculum column');
assert(db.includes(".from('facilitator_event_type_allowed_products')"), 'allowed curricula are read from the Stage 5A relationship');
assert(db.includes(".select('id, name, code, active, sort_order')"), 'curriculum choices read whether a product is active');
assert(db.includes('isMissingEventCurriculumSchemaError'), 'a missing Stage 5A object does not become a general failure');
assert(!db.includes('service_role'), 'the client does not use the service role');
assert(!/security\s+definer/i.test(db), 'no security definer function was added');

assert(app.includes('syncEventCurriculumField'), 'Event Type changes refresh the curriculum choices');
assert(app.includes('readEventCurriculumProductId'), 'the form reads the optional curriculum');
assert(app.includes('loadEventCurriculumSupport'), 'startup loads curriculum support without writing events');
assert(!/setAarRmtField\(\s*['"]Curriculum/.test(app), 'AAR does not fill curriculum through an editable report field');
const aarArticleStart = html.indexOf('id="aar-report-article"');
const aarArticle = html.slice(aarArticleStart, html.indexOf('</article>', aarArticleStart));
assert(!aarArticle.includes('Curriculum / Product'), 'the AAR template does not reserve a curriculum row');
assert(!/<(select|input)\b/i.test(aarArticle), 'the AAR template has no curriculum control');
assert(!facilitator.includes('curriculum_product_id'), 'Facilitator Management is unchanged by the curriculum field');
assert(!facilitator.includes('facilitator_event_type_allowed_products'), 'Facilitator Management does not read allowed curricula');
assert(db.includes(".select('id, name, code, sort_order')"), 'the Facilitator Management product read still does not filter on active');

let migrationDiff = '';
let facilitatorDiff = '';
try {
  migrationDiff = execFileSync('git', ['diff', '--', 'supabase/migrations/023_facilitator_product_taxonomy_correction.sql'], { cwd: ROOT, encoding: 'utf8' });
  facilitatorDiff = execFileSync('git', ['diff', '--', 'js/facilitator-management.js'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(migrationDiff.trim() === '', 'Migration 023 is unchanged');
assert(facilitatorDiff.trim() === '', 'Facilitator Management is unchanged');
assert(migration.includes('add column curriculum_product_id'), 'the review still sees the Stage 5A curriculum column');

const repaired = [
  'scripts/spike-output/section_iii_sorm_command_function_navy_governance_training  -  Repaired.pptx',
  'scripts/spike-output/section_iv_navstds_occstds_navy_governance_training  -  Repaired.pptx',
];
let status = '';
try {
  status = execFileSync('git', ['status', '--short', '--', ...repaired], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git status failed: ${error.message}`);
}
for (const filePath of repaired) {
  assert(fs.existsSync(path.join(ROOT, filePath)), `repaired PowerPoint remains present: ${filePath}`);
  assert(status.includes(filePath), `repaired PowerPoint remains untracked: ${filePath}`);
}

if (errors.length) {
  console.error('validate-stage-5b-event-curriculum failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-5b-event-curriculum: ok');
