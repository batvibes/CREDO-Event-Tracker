/**
 * Stage 4B read-only Facilitator Management Overview checks.
 * Run: node scripts/validate-stage-4b-facilitator-management-overview.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FACILITATOR_EMPTY_EXPERIENCE,
  FACILITATOR_NO_DATA_GAPS,
  FACILITATOR_NO_EXPERIENCE_OR_RECORD,
  FACILITATOR_NO_PRODUCT_EXPERIENCE,
  FACILITATOR_QUALIFICATION_NOT_ENTERED,
  FACILITATOR_RECENT_LIMIT,
  buildFacilitatorOverview,
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

assert(html.includes('data-view="facilitators"'), 'the global destination remains Facilitator Management');
assert(view.includes('data-facilitator-view="overview"'), 'Overview is an internal Facilitator Management view');
assert(view.includes('data-facilitator-view="personnel"'), 'Personnel remains available');
assert(view.includes('id="facilitator-view-subtitle">Overview<'), 'Overview is the default internal view');
assert(view.includes('id="facilitator-overview-panel"'), 'the Overview panel exists');
assert(view.includes('id="facilitator-personnel-panel"'), 'the Personnel panel remains');
assert(view.includes('Product Coverage'), 'Product Coverage is shown');
assert(view.includes('Recent Recorded Facilitation'), 'recent activity is labeled as recorded facilitation');
assert(view.includes('Needs Attention'), 'factual data gaps have a section');
assert(view.includes('>People<') && view.includes('Recorded Instances') && view.includes('Most Recent'), 'coverage shows people, instances, and the latest date');
assert(app.includes("showFacilitatorView('overview')"), 'opening Facilitator Management starts on Overview');
assert(app.includes('buildFacilitatorOverview'), 'Overview is derived from the loaded personnel model');
assert(app.includes('Recorded Facilitation Instances'), 'the participation total uses an honest label');
const overviewPaint = app.slice(app.indexOf('function paintFacilitatorOverview'), app.indexOf('function paintFacilitatorPersonnel'));
assert(!overviewPaint.includes('Total Events'), 'the participation total is not labeled as unique Events');
assert(app.includes('openFacilitatorDetail') && app.includes('data-facilitator-person'), 'a facilitator name reuses the existing person detail');
assert(app.includes('data-facilitator-product'), 'a product row can open the product-centric view');
assert(view.includes('Program Capabilities'), 'Program Capabilities is available beside Overview');
assert(!view.includes('Development'), 'Development is not presented as a live view');

assert(model.includes(FACILITATOR_QUALIFICATION_NOT_ENTERED), 'experience without a qualification row is a missing record');
assert(model.includes(FACILITATOR_NO_EXPERIENCE_OR_RECORD), 'a designated facilitator without records is a data gap');
assert(model.includes(FACILITATOR_NO_PRODUCT_EXPERIENCE), 'a product without history uses neutral wording');
assert(model.includes(FACILITATOR_NO_DATA_GAPS) && model.includes(FACILITATOR_EMPTY_EXPERIENCE), 'empty states stay factual');
assert(!/unstaffed|unavailable|unqualified|mission capable|readiness|standing|trainer authority|at risk|noncompliant|expired|overdue/i.test(`${model}\n${view}`), 'coverage and gaps do not imply qualification or readiness');
assert(!/\.from\('events'\)/.test(model), 'the overview model does not read Events');
assert(!/\.from\('events'\)/.test(read('js/db.js').slice(db.indexOf('fetchFacilitatorManagementSources'), db.indexOf('fetchTeamDirectoryPersonnel'))), 'the facilitator read does not query Events');
assert(!/\.(insert|update|delete|upsert)\(/.test(model), 'Overview does not write');
assert(!db.includes('save_facilitator_qualification'), 'no qualification write was added');

const products = [
  { id: 'second', name: 'Second Product', code: 'second', sort_order: 2, active: true },
  { id: 'first', name: 'First Product', code: 'first', sort_order: 1, active: true },
  { id: 'empty', name: 'Empty Product', code: 'empty', sort_order: 3, active: true },
];
const activeExperienced = {
  id: 'ada',
  name: 'Ada',
  rank_title: 'LCDR',
  active: true,
  is_facilitator: true,
};
const inactiveExperienced = {
  id: 'john',
  name: 'John Scanlon',
  rank_title: 'CDR',
  active: false,
  is_facilitator: false,
};
const designatedOnly = {
  id: 'blake',
  name: 'Blake',
  active: true,
  is_facilitator: true,
};
const personnel = summarizeFacilitatorPersonnel(
  [activeExperienced, inactiveExperienced, designatedOnly],
  [
    { person_id: 'ada', product_id: 'second', events_conducted: 2, most_recent_facilitation_on: '2026-08-31' },
    { person_id: 'ada', product_id: 'first', events_conducted: 1, most_recent_facilitation_on: '2026-01-15' },
    { person_id: 'john', product_id: 'first', events_conducted: 4, most_recent_facilitation_on: '2025-11-02' },
    { person_id: 'ada', product_id: 'second', events_conducted: 9, most_recent_facilitation_on: null },
  ],
  [{ person_id: 'john', product_id: 'first' }],
  products,
);
const overview = buildFacilitatorOverview(personnel, products);

assert(overview.activeFacilitatorPersonnel === 2, 'active facilitator personnel uses the Stage 4A roster and excludes inactive people');
assert(overview.productsWithRecordedExperience === 2, 'coverage counts products present in recorded experience');
assert(overview.productsWithoutRecordedExperience === 1, 'products absent from experience remain in the catalog count');
assert(overview.recordedFacilitationInstances === 7, 'instances sum person and product participation rather than unique Events');
assert(overview.coverage.map((row) => row.productName).join('|') === 'First Product|Second Product|Empty Product', 'products stay in stored catalog order');
const empty = overview.coverage.find((row) => row.productId === 'empty');
assert(empty.peopleWithExperience === 0 && empty.recordedInstances === 0 && empty.mostRecentOn == null, 'a product without experience remains visible at zero');
const first = overview.coverage.find((row) => row.productId === 'first');
assert(first.peopleWithExperience === 2 && first.recordedInstances === 5, 'people are distinct and instances are not qualification rows');
assert(first.mostRecentOn === '2026-01-15', 'product recency uses the latest recorded facilitation date');
assert(overview.recent.length <= FACILITATOR_RECENT_LIMIT, 'recent facilitation is limited');
assert(overview.recent[0].personId === 'ada' && overview.recent[0].productId === 'second', 'recent rows are the latest recorded person and product pairs');
assert(overview.recent.every((row) => row.mostRecentOn), 'rows without a date are excluded');
assert(overview.attention.map((item) => `${item.personId}:${item.condition}`).join('|') === `blake:${FACILITATOR_NO_EXPERIENCE_OR_RECORD}|ada:${FACILITATOR_QUALIFICATION_NOT_ENTERED}`, 'attention lists only the two factual personnel gaps');
assert(!overview.attention.some((item) => item.personId === 'john'), 'an inactive historical facilitator is not flagged');

assert(!fs.existsSync(path.join(ROOT, 'supabase/migrations/023_facilitator_management_overview.sql')), 'Stage 4B adds no migration');
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
  console.error('validate-stage-4b-facilitator-management-overview failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-stage-4b-facilitator-management-overview: ok');
