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
assert(!view.includes('data-facilitator-view="overview"'), 'Overview is no longer a Facilitator Management tab');
assert(!view.includes('>Overview<') && !view.includes('id="facilitator-overview-panel"') && !view.includes('Product Coverage'), 'Overview and Product Coverage are removed');
assert(view.includes('data-facilitator-view="capabilities"') && view.includes('data-facilitator-view="personnel"'), 'Program Capabilities and Facilitators remain');
assert(view.indexOf('data-facilitator-view="capabilities"') < view.indexOf('data-facilitator-view="personnel"'), 'Program Capabilities is the first tab');
assert(view.includes('id="facilitator-view-subtitle">Program Capabilities<'), 'Program Capabilities is the default internal view');
assert(view.includes('id="facilitator-personnel-panel"'), 'the Personnel panel remains');
assert(!view.includes('Recent Recorded Facilitation'), 'Recent Recorded Facilitation is not shown');
assert(!view.includes('Needs Attention') && !view.includes('facilitator-attention'), 'Needs Attention is not rendered');
assert(!view.includes('id="facilitator-summary"'), 'the four Overview metric cards are gone');
assert(!view.includes('Active Facilitator Personnel') && !view.includes('Products With Recorded Experience') && !view.includes('Products Without Recorded Experience') && !view.includes('Recorded Facilitation Instances'), 'the removed KPI labels are absent');
const capabilitiesPanel = view.slice(view.indexOf('id="facilitator-capabilities-panel"'), view.indexOf('id="facilitator-personnel-panel"'));
assert(capabilitiesPanel.includes('id="facilitator-anniversary-section" hidden'), 'an empty T4T alert section starts hidden under Program Capabilities');
assert(capabilitiesPanel.indexOf('id="facilitator-capabilities-table"') < capabilitiesPanel.indexOf('>T4T Anniversary Alerts<'), 'T4T Anniversary Alerts follow the Program Capabilities table');
assert(capabilitiesPanel.includes('>Facilitator<') && capabilitiesPanel.includes('>Status<') && capabilitiesPanel.includes('>Progress<') && capabilitiesPanel.includes('>Deadline<'), 'T4T alerts keep Facilitator, Product, Status, Progress, and Deadline');
assert(capabilitiesPanel.includes('>Instructors<') && capabilitiesPanel.includes('Recorded Instances') && capabilitiesPanel.includes('>Most Recent<') && capabilitiesPanel.includes('Qualification Records'), 'Program Capabilities keeps Instructors, Recorded Instances, Most Recent, and Qualification Records');
assert(!capabilitiesPanel.includes('>Personnel<') && !capabilitiesPanel.includes('Recorded Experience'), 'Program Capabilities no longer shows Personnel or Recorded Experience');
assert(app.includes("showFacilitatorView('capabilities')"), 'opening Facilitator Management starts on Program Capabilities');
assert(app.includes("FACILITATOR_VIEW_LABELS[view] ? view : 'capabilities'"), 'a stale Overview selection falls back to Program Capabilities');
assert(!app.includes("showFacilitatorView('overview')"), 'Facilitator Management does not open Overview');
assert(model.includes('export function buildFacilitatorOverview'), 'the coverage model remains available');
const alertPaint = app.slice(app.indexOf('function paintFacilitatorAnniversaryAlerts'), app.indexOf('function facilitatorCapabilityFilterState'));
assert(!alertPaint.includes('Total Events'), 'the participation total is not labeled as unique Events');
assert(!alertPaint.includes('Active Facilitator Personnel') && !alertPaint.includes('Recorded Facilitation Instances'), 'alerts do not paint KPI cards');
assert(!alertPaint.includes('recordedInstances') && !alertPaint.includes('FACILITATOR_NO_PRODUCT_EXPERIENCE'), 'alerts do not paint lifetime counts or a recorded-experience flag');
assert(!alertPaint.includes('facilitator-attention') && !alertPaint.includes('overview.attention'), 'alerts do not paint the data-gap list');
assert(alertPaint.includes('anniversarySection.hidden = anniversaryAlerts.length === 0'), 'T4T Anniversary Alerts are hidden when there are no current alerts');
assert(alertPaint.includes('buildQualificationAnniversaryWarnings('), 'T4T alerts still render from the existing alert list');
assert(app.includes('openFacilitatorDetail') && app.includes('data-facilitator-person'), 'a facilitator name reuses the existing person detail');
const capabilityPaint = app.slice(app.indexOf('function paintFacilitatorProgramCapabilities'), app.indexOf('function paintFacilitatorPersonnel'));
assert(capabilityPaint.includes('openFacilitatorProduct(product.productId)'), 'a Program Capabilities row opens the product view');
assert(view.includes('Program Capabilities'), 'Program Capabilities is the Facilitator Management home');
assert(!view.includes('Development'), 'Development is not presented as a live view');

assert(model.includes(FACILITATOR_QUALIFICATION_NOT_ENTERED), 'experience without a qualification row is a missing record');
assert(model.includes(FACILITATOR_NO_EXPERIENCE_OR_RECORD), 'a designated facilitator without records is a data gap');
assert(model.includes(FACILITATOR_NO_PRODUCT_EXPERIENCE), 'a product without history uses neutral wording');
assert(model.includes(FACILITATOR_NO_DATA_GAPS) && model.includes(FACILITATOR_EMPTY_EXPERIENCE), 'empty states stay factual');
const overviewModel = model.slice(model.indexOf('export function buildFacilitatorOverview'), model.indexOf('export function buildFacilitatorProgramCapabilities'));
assert(!/unstaffed|unavailable|unqualified|mission capable|readiness|standing|trainer authority|at risk|noncompliant|expired|overdue/i.test(`${overviewModel}\n${view}`), 'coverage and gaps do not imply qualification or readiness');
assert(!/\.from\('events'\)/.test(model), 'the overview model does not read Events');
assert(!/\.from\('events'\)/.test(read('js/db.js').slice(db.indexOf('fetchFacilitatorManagementSources'), db.indexOf('fetchTeamDirectoryPersonnel'))), 'the facilitator read does not query Events');
assert(!/\.(insert|update|delete|upsert)\(/.test(model), 'Overview does not write');
const facilitatorRead = db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf('export async function fetchTeamDirectoryPersonnel'));
assert(!facilitatorRead.includes('save_facilitator_qualification'), 'the overview read does not save qualifications');

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
assert(first.instructors === 2 && empty.instructors === 0, 'instructors follow the same distinct people and keep a zero-coverage product visible');
assert(first.mostRecentOn === '2026-01-15', 'product recency uses the latest recorded facilitation date');
const both = summarizeFacilitatorPersonnel(
  [{ id: 'quinn', name: 'Quinn', active: true, is_facilitator: true }],
  [{ person_id: 'quinn', product_id: 'first', events_conducted: 2, most_recent_facilitation_on: '2026-03-01' }],
  [{ person_id: 'quinn', product_id: 'first' }],
  products,
);
const bothCoverage = buildFacilitatorOverview(both, products).coverage.find((row) => row.productId === 'first');
assert(bothCoverage.instructors === 1 && bothCoverage.peopleWithExperience === 1, 'a person with experience and a qualification counts once');
assert(bothCoverage.mostRecentOn === '2026-03-01', 'a qualification does not replace the recorded facilitation date');
const recordOnly = summarizeFacilitatorPersonnel(
  [{ id: 'ria', name: 'Ria', active: true, is_facilitator: false }],
  [],
  [{ person_id: 'ria', product_id: 'second' }],
  products,
);
const recordCoverage = buildFacilitatorOverview(recordOnly, products);
const recordSecond = recordCoverage.coverage.find((row) => row.productId === 'second');
assert(recordCoverage.coverage.map((row) => row.productName).join('|') === 'First Product|Second Product|Empty Product', 'qualification-only coverage still lists the full catalog');
assert(recordSecond.instructors === 1 && recordSecond.peopleWithExperience === 0 && recordSecond.mostRecentOn == null, 'a qualification record counts an instructor without inventing a facilitation date');
assert(recordCoverage.attention.length === 0, 'Needs Attention logic is unchanged for a person who already has a qualification record');
assert(!Object.prototype.hasOwnProperty.call(overview, 'recent'), 'Overview no longer builds a recent facilitation list');
assert(!alertPaint.includes('facilitator-recent-body'), 'alerts do not render Recent Recorded Facilitation');
assert(overview.attention.map((item) => `${item.personId}:${item.condition}`).join('|') === `blake:${FACILITATOR_NO_EXPERIENCE_OR_RECORD}|ada:${FACILITATOR_QUALIFICATION_NOT_ENTERED}`, 'attention lists only the two factual personnel gaps');
assert(!overview.attention.some((item) => item.personId === 'john'), 'an inactive historical facilitator is not flagged');

assert(!fs.existsSync(path.join(ROOT, 'supabase/migrations/023_facilitator_management_overview.sql')), 'Stage 4B adds no migration');
for (const relativePath of [
  'supabase/migrations/020_facilitator_qualification_foundation.sql',
  'supabase/migrations/021_facilitator_experience_foundation.sql',
  'supabase/migrations/022_facilitator_event_type_product_mappings.sql',
  'js/monthly-report-pptx-export.js',
  'js/event-reference-fields.js',
  'js/personnel-identity.js',
]) {
  const diff = execFileSync('git', ['diff', '--', relativePath], { cwd: ROOT, encoding: 'utf8' });
  assert(diff.trim() === '', `${relativePath} is unchanged`);
}
const migrationDiff = execFileSync('git', ['diff', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
assert(migrationDiff.trim() === '', 'committed migrations are unchanged');
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
const untrackedMigrations = untracked.split('\n').map((line) => line.trim()).filter(Boolean);
assert(untrackedMigrations.every((line) => line.endsWith('025_facilitator_t4t_product_experience.sql') || line.endsWith('048_merge_command_reference.sql')), 'new migrations are the facilitator T4T experience view or command merge');
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
