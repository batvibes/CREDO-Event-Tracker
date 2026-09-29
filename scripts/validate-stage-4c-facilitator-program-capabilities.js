/**
 * Stage 4C read-only Program Capabilities checks.
 * Run: node scripts/validate-stage-4c-facilitator-program-capabilities.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FACILITATOR_NO_FACILITATOR_RECORDS,
  FACILITATOR_QUALIFICATION_NONE,
  FACILITATOR_QUALIFICATION_ON_FILE,
  buildFacilitatorProgramCapabilities,
  facilitatorProductPersonnel,
  filterFacilitatorProductPersonnel,
  filterFacilitatorProgramCapabilities,
  sortFacilitatorProgramCapabilities,
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

const html = read('index.html');
const app = read('js/app.js');
const db = read('js/db.js');
const model = read('js/facilitator-management.js');
const view = html.slice(html.indexOf('id="view-facilitators"'), html.indexOf('id="view-settings"'));
const overviewAt = view.indexOf('data-facilitator-view="overview"');
const personnelAt = view.indexOf('data-facilitator-view="personnel"');
const capabilitiesAt = view.indexOf('data-facilitator-view="capabilities"');

assert(view.includes('>Program Capabilities<'), 'Program Capabilities is an internal Facilitator Management view');
assert(overviewAt >= 0 && overviewAt < personnelAt && personnelAt < capabilitiesAt, 'tab order is Overview, Personnel, then Program Capabilities');
assert(view.includes('id="facilitator-view-subtitle">Overview<'), 'Overview remains the default');
assert(app.includes("showFacilitatorView('overview')"), 'opening Facilitator Management starts on Overview');
assert(view.includes('id="facilitator-capabilities-table"'), 'the product table exists');
assert(view.includes('>Personnel<') && view.includes('Recorded Experience') && view.includes('Recorded Instances') && view.includes('Qualification Records'), 'product columns keep experience and qualification records separate');
assert(view.includes('id="facilitator-personnel-panel"'), 'Personnel remains present');
assert(view.includes('id="facilitator-overview-panel"'), 'Overview remains present');
assert(!view.includes('Development'), 'Development is not presented as a live view');
assert(html.includes('id="facilitator-product-modal"'), 'product detail reuses the dialog pattern');
assert(app.includes('openFacilitatorDetail') && app.includes('facilitator-product-personnel'), 'a person name reuses the existing person detail');
assert(app.includes("showFacilitatorView('capabilities')"), 'Overview product rows open Program Capabilities');
assert(!/qualified facilitator|qualified personnel|unqualified/i.test(`${model}\n${view}\n${html.slice(html.indexOf('id="facilitator-product-modal"'), html.indexOf('id="aar-audit-modal"'))}`), 'product personnel are not labeled qualified or unqualified');
assert(!/standing|trainer_authority|readiness|expiration|trainer authority/i.test(model), 'Program Capabilities does not infer standing, readiness, or authority');
assert(!/\.from\('events'\)/.test(model), 'the product model does not read Events');
assert(!/\.(insert|update|delete|upsert)\(/.test(model), 'Program Capabilities does not write');
assert(!/is_facilitator\s*[:=]\s*true/.test(model), 'product membership does not assign the Facilitator role');
assert(!db.includes('save_facilitator_qualification'), 'no qualification write was added');
assert(!/\.from\('events'\)/.test(db.slice(db.indexOf('fetchFacilitatorManagementSources'), db.indexOf('fetchTeamDirectoryPersonnel'))), 'the facilitator read does not query Events');

const products = [
  { id: 'second', name: 'Second Product', code: 'second', sort_order: 2, active: true },
  { id: 'first', name: 'First Product', code: 'first', sort_order: 1, active: true },
  { id: 'empty', name: 'Empty Product', code: 'empty', sort_order: 3, active: true },
];
const personnel = summarizeFacilitatorPersonnel(
  [
    { id: 'ada', name: 'Ada', rank_title: 'LCDR', command_organization: 'CREDO', installation: 'Camp Pendleton', active: true, is_facilitator: false },
    { id: 'john', name: 'John Scanlon', rank_title: 'CDR', active: false, is_facilitator: false },
    { id: 'blake', name: 'Blake', active: true, is_facilitator: false },
  ],
  [
    { person_id: 'ada', product_id: 'first', events_conducted: 2, first_recorded_facilitation_on: '2026-01-15', most_recent_facilitation_on: '2026-08-31' },
    { person_id: 'john', product_id: 'first', events_conducted: 3, first_recorded_facilitation_on: '2025-11-02', most_recent_facilitation_on: '2025-12-01' },
    { person_id: 'ada', product_id: 'first', events_conducted: 9, most_recent_facilitation_on: '2024-01-01' },
  ],
  [
    { person_id: 'ada', product_id: 'first' },
    { person_id: 'blake', product_id: 'second' },
  ],
  products,
);
const capabilities = buildFacilitatorProgramCapabilities(personnel, products);
assert(capabilities.map((row) => row.productName).join('|') === 'First Product|Second Product|Empty Product', 'products stay in stored catalog order');
const first = capabilities.find((row) => row.productId === 'first');
assert(first.personnelCount === 2, 'a person with both experience and a qualification record is counted once');
assert(first.recordedExperienceCount === 2, 'recorded experience counts people, including inactive history');
assert(first.recordedInstances === 5, 'recorded instances sum Stage 3B participation and ignore the duplicate row');
assert(first.mostRecentOn === '2026-08-31', 'most recent uses the latest Stage 3B date');
assert(first.qualificationRecordCount === 1, 'qualification records are counted separately from experience');
const second = capabilities.find((row) => row.productId === 'second');
assert(second.personnelCount === 1 && second.recordedExperienceCount === 0 && second.recordedInstances === 0 && second.mostRecentOn == null && second.qualificationRecordCount === 1, 'a qualification record does not become historical experience');
const empty = capabilities.find((row) => row.productId === 'empty');
assert(empty.personnelCount === 0 && empty.recordedExperienceCount === 0 && empty.recordedInstances === 0 && empty.mostRecentOn == null && empty.qualificationRecordCount === 0, 'a product with no records remains visible at zero');
assert(filterFacilitatorProgramCapabilities(capabilities, { presence: 'without' }).map((row) => row.productId).join('|') === 'empty', 'the empty-product filter uses personnel, not qualification language');
assert(filterFacilitatorProgramCapabilities(capabilities, { query: 'second' }).length === 1, 'product search matches the product name');
assert(sortFacilitatorProgramCapabilities(capabilities, 'instances', 'desc')[0].productId === 'first', 'numeric sort is available');
assert(sortFacilitatorProgramCapabilities(capabilities, 'catalog', 'asc').map((row) => row.productId).join('|') === 'first|second|empty', 'canonical order can be restored');

const firstPeople = facilitatorProductPersonnel(personnel, 'first');
assert(firstPeople.map((person) => person.personId).join('|') === 'john|ada', 'product detail includes inactive historical personnel');
assert(firstPeople.find((person) => person.personId === 'ada').hasQualificationRecord === true, 'experience and a qualification record stay separate on the same person');
const blake = facilitatorProductPersonnel(personnel, 'second')[0];
assert(blake.hasRecordedExperience === false && blake.recordedInstances === 0 && blake.firstRecordedOn == null && blake.mostRecentOn == null && blake.hasQualificationRecord === true, 'qualification-only personnel are not shown as historical experience');
assert(filterFacilitatorProductPersonnel(firstPeople, { active: 'inactive' }).map((person) => person.personId).join('|') === 'john', 'product detail can show inactive personnel without hiding them by default');
assert(model.includes(FACILITATOR_NO_FACILITATOR_RECORDS), 'an empty product uses neutral wording');
assert(model.includes(FACILITATOR_QUALIFICATION_ON_FILE) && model.includes(FACILITATOR_QUALIFICATION_NONE), 'qualification presence is On file or None');

assert(!fs.existsSync(path.join(ROOT, 'supabase/migrations/023_facilitator_program_capabilities.sql')), 'Stage 4C adds no migration');
for (const relativePath of [
  'supabase/migrations/020_facilitator_qualification_foundation.sql',
  'supabase/migrations/021_facilitator_experience_foundation.sql',
  'supabase/migrations/022_facilitator_event_type_product_mappings.sql',
  'js/monthly-report-pptx-export.js',
  'js/team-personnel-directory.js',
  'js/team-personnel-editor.js',
  'js/event-reference-fields.js',
  'js/settings-reference-lists.js',
  'js/personnel-identity.js',
]) {
  const diff = execFileSync('git', ['diff', '--', relativePath], { cwd: ROOT, encoding: 'utf8' });
  assert(diff.trim() === '', `${relativePath} is unchanged`);
}
const migrationDiff = execFileSync('git', ['diff', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
assert(migrationDiff.trim() === '', 'committed migrations are unchanged');
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
assert(untracked.trim() === '', 'Stage 5B adds no untracked migration');
for (const repaired of [
  'scripts/spike-output/section_iii_sorm_command_function_navy_governance_training  -  Repaired.pptx',
  'scripts/spike-output/section_iv_navstds_occstds_navy_governance_training  -  Repaired.pptx',
]) {
  assert(fs.existsSync(path.join(ROOT, repaired)), `${repaired} remains present`);
  const tracked = execFileSync('git', ['ls-files', '--', repaired], { cwd: ROOT, encoding: 'utf8' });
  assert(tracked.trim() === '', `${repaired} remains untracked`);
}

if (errors.length) {
  console.error('validate-stage-4c-facilitator-program-capabilities failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-stage-4c-facilitator-program-capabilities: ok');
