/**
 * Stage 5F Event Report curriculum/T4T filters and AAR History visibility.
 * Run: node scripts/validate-stage-5f-event-report-curriculum-t4t.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ALL_T4T_EVENTS_REPORT_OPTION,
  eventMatchesEventTypeReport,
  compareHistoryCurriculumLabels,
  filterEventsForEventTypeReport,
  historyCurriculumLabel,
  nextWorkshopCurriculumFilter,
  reportWorkshopControlsVisible,
} from '../js/event-report-filters.js';

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
const css = read('css/styles.css');
const filters = read('js/event-report-filters.js');
const choices = [
  { productId: 'gottman', name: 'Gottman, Seven Principles of Making Marriage Work', eventTypeName: 'Marriage Enrichment Workshop' },
  { productId: 'prep', name: 'PREP 8.0', eventTypeName: 'Marriage Enrichment Workshop' },
  { productId: 'lenses', name: '4 Lenses', eventTypeName: 'Personal Growth Workshop' },
  { productId: 'strengths', name: 'CliftonStrengths, Strengths Discovery Encounter', eventTypeName: 'Personal Growth Workshop' },
  { productId: 'chapter', name: 'Navigating Your Next Chapter', eventTypeName: 'Personal Growth Workshop' },
];

const events = [
  { id: 'mew-plain', eventType: 'Marriage Enrichment Workshop', isT4t: false, curriculumProductId: 'prep' },
  { id: 'mew-t4t', eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: 'prep' },
  { id: 'mew-gottman', eventType: 'Marriage Enrichment Workshop', isT4t: false, curriculumProductId: 'gottman' },
  { id: 'mew-blank-t4t', eventType: 'Marriage Enrichment Workshop', isT4t: true, curriculumProductId: null },
  { id: 'pgw-plain', eventType: 'Personal Growth Workshop', isT4t: false, curriculumProductId: 'lenses' },
  { id: 'pgw-t4t', eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: 'lenses' },
  { id: 'pgw-blank-t4t', eventType: 'Personal Growth Workshop', isT4t: true, curriculumProductId: null },
  { id: 'mer', eventType: 'Marriage Enrichment Retreat', isT4t: false, curriculumProductId: null },
  { id: 'safetalk', eventType: 'SafeTalk Workshop', isT4t: false, curriculumProductId: null },
  { id: 'asist', eventType: 'ASIST Workshop', isT4t: false, curriculumProductId: null },
  { id: 'safetalk-t4t', eventType: 'SafeTalk T4T', isT4t: false, curriculumProductId: null },
  { id: 'asist-t4t', eventType: 'ASIST T4T', isT4t: false, curriculumProductId: null },
];

function ids(criteria) {
  return filterEventsForEventTypeReport(events, criteria).map((event) => event.id);
}

assert(reportWorkshopControlsVisible('event-type', 'Marriage Enrichment Workshop').curriculum === true, 'MEW shows the curriculum filter');
assert(reportWorkshopControlsVisible('event-type', 'Personal Growth Workshop').t4t === true, 'PGW shows the T4T checkbox');
assert(reportWorkshopControlsVisible('event-type', 'Marriage Enrichment Retreat').curriculum === false, 'a retreat hides the curriculum filter');
assert(reportWorkshopControlsVisible('event-type', 'SafeTalk T4T').t4t === false, 'SafeTalk T4T hides the workshop T4T checkbox');
assert(reportWorkshopControlsVisible('event-type', 'ASIST T4T').curriculum === false, 'ASIST T4T hides the curriculum filter');
assert(reportWorkshopControlsVisible('event-type', ALL_T4T_EVENTS_REPORT_OPTION).curriculum === false, 'All T4T Events hides the curriculum filter');
assert(reportWorkshopControlsVisible('event-type', ALL_T4T_EVENTS_REPORT_OPTION).t4t === false, 'All T4T Events hides the T4T checkbox');
assert(reportWorkshopControlsVisible('all', 'Marriage Enrichment Workshop').curriculum === false, 'curriculum controls stay hidden for other report types');
assert(nextWorkshopCurriculumFilter('Marriage Enrichment Workshop', 'Personal Growth Workshop', 'prep') === null, 'switching MEW to PGW resets curriculum');
assert(nextWorkshopCurriculumFilter('Personal Growth Workshop', 'Marriage Enrichment Workshop', 'lenses') === null, 'switching PGW to MEW resets curriculum');
assert(nextWorkshopCurriculumFilter('Marriage Enrichment Workshop', 'Marriage Enrichment Workshop', 'prep') === 'prep', 'staying on MEW keeps the selected curriculum');

assert(ids({ eventType: 'Marriage Enrichment Workshop', t4t: false, curriculumProductId: '' }).join() === 'mew-plain,mew-gottman', 'unchecked T4T returns only non-T4T MEW events');
assert(ids({ eventType: 'Marriage Enrichment Workshop', t4t: false, curriculumProductId: 'prep' }).join() === 'mew-plain', 'a specific curriculum with unchecked T4T matches that product and is_t4t false');
assert(ids({ eventType: 'Marriage Enrichment Workshop', t4t: true, curriculumProductId: 'prep' }).join() === 'mew-t4t', 'a specific curriculum with checked T4T matches that product and is_t4t true');
assert(ids({ eventType: 'Personal Growth Workshop', t4t: true, curriculumProductId: '' }).join() === 'pgw-t4t,pgw-blank-t4t', 'All Curricula with T4T checked includes a null curriculum');
assert(ids({ eventType: 'Personal Growth Workshop', t4t: true, curriculumProductId: 'lenses' }).join() === 'pgw-t4t', 'a specific curriculum excludes a null-curriculum T4T event');
assert(ids({ eventType: 'Marriage Enrichment Retreat', t4t: true, curriculumProductId: 'prep' }).join() === 'mer', 'an ordinary Event Type ignores a stale curriculum and T4T filter');

const allT4t = ids({ eventType: ALL_T4T_EVENTS_REPORT_OPTION });
assert(allT4t.includes('mew-t4t') && allT4t.includes('mew-blank-t4t'), 'All T4T Events includes MEW events with is_t4t true');
assert(allT4t.includes('pgw-t4t') && allT4t.includes('pgw-blank-t4t'), 'All T4T Events includes PGW events with is_t4t true');
assert(allT4t.includes('safetalk-t4t'), 'All T4T Events includes SafeTalk T4T');
assert(allT4t.includes('asist-t4t'), 'All T4T Events includes ASIST T4T');
assert(!allT4t.includes('mew-plain') && !allT4t.includes('pgw-plain'), 'All T4T Events excludes ordinary MEW and PGW');
assert(!allT4t.includes('safetalk') && !allT4t.includes('asist'), 'All T4T Events excludes ordinary SafeTalk and ASIST workshops');
assert(eventMatchesEventTypeReport({ eventType: 'SafeTalk Workshop', isT4t: true }, { eventType: ALL_T4T_EVENTS_REPORT_OPTION }) === false, 'a workshop flag on SafeTalk Workshop does not make it a dedicated T4T event');

assert(historyCurriculumLabel({ eventType: 'Personal Growth Workshop', curriculumProductId: 'lenses', isT4t: false }, choices) === '4 Lenses', 'history shows the canonical curriculum for an ordinary workshop');
assert(historyCurriculumLabel({ eventType: 'Personal Growth Workshop', curriculumProductId: 'lenses', isT4t: true }, choices) === '4 Lenses T4T', 'history suffixes T4T for a workshop T4T event');
assert(historyCurriculumLabel({ eventType: 'Marriage Enrichment Workshop', curriculumProductId: 'prep', isT4t: false }, choices) === 'PREP 8.0', 'history shows PREP 8.0');
assert(historyCurriculumLabel({ eventType: 'Marriage Enrichment Workshop', curriculumProductId: 'prep', isT4t: true }, choices) === 'PREP 8.0 T4T', 'history shows PREP 8.0 T4T');
assert(historyCurriculumLabel({ eventType: 'Personal Growth Workshop', curriculumProductId: null, isT4t: true }, choices) === null, 'a null curriculum does not display bare T4T');
assert(historyCurriculumLabel({ eventType: 'SafeTalk T4T', curriculumProductId: null, isT4t: false }, choices) === null, 'SafeTalk T4T does not copy its Event Type into the curriculum column');
assert(historyCurriculumLabel({ eventType: 'ASIST T4T', curriculumProductId: 'lenses', isT4t: false }, choices) === null, 'ASIST T4T does not duplicate its Event Type or invent a curriculum');

const curriculumSortEvents = [
  { eventType: 'Marriage Enrichment Workshop', curriculumProductId: null, isT4t: true },
  { eventType: 'Personal Growth Workshop', curriculumProductId: 'lenses', isT4t: true },
  { eventType: 'Marriage Enrichment Workshop', curriculumProductId: 'prep', isT4t: false },
  { eventType: 'Personal Growth Workshop', curriculumProductId: 'lenses', isT4t: false },
  { eventType: 'Marriage Enrichment Workshop', curriculumProductId: 'gottman', isT4t: false },
  { eventType: 'Marriage Enrichment Workshop', curriculumProductId: 'prep', isT4t: true },
  { eventType: 'Personal Growth Workshop', curriculumProductId: 'strengths', isT4t: false },
  { eventType: 'SafeTalk T4T', curriculumProductId: null, isT4t: false },
  { eventType: 'Personal Growth Workshop', curriculumProductId: 'chapter', isT4t: false },
];
const curriculumSortLabel = (event) => historyCurriculumLabel(event, choices);
const curriculumAscending = [...curriculumSortEvents].sort((left, right) => (
  compareHistoryCurriculumLabels(curriculumSortLabel(left), curriculumSortLabel(right))
));
const curriculumAscendingLabels = curriculumAscending.map(curriculumSortLabel);
assert(curriculumAscendingLabels.join('|') === [
  '4 Lenses',
  '4 Lenses T4T',
  'CliftonStrengths, Strengths Discovery Encounter',
  'Gottman, Seven Principles of Making Marriage Work',
  'Navigating Your Next Chapter',
  'PREP 8.0',
  'PREP 8.0 T4T',
  null,
  null,
].join('|'), 'ascending curriculum sort uses the displayed name and keeps blank values last');
const curriculumDescendingLabels = [...curriculumAscending].reverse().map(curriculumSortLabel);
assert(curriculumDescendingLabels[0] === null && curriculumDescendingLabels.at(-1) === '4 Lenses', 'descending curriculum sort reverses the ascending order');
assert(compareHistoryCurriculumLabels(null, '4 Lenses') > 0, 'a non-applicable curriculum sorts after a resolved name');
assert(compareHistoryCurriculumLabels('PREP 8.0', 'PREP 8.0 T4T') < 0, 'a T4T suffix sorts with its displayed value');
assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(filters), 'report filters do not hard-code product UUIDs');
assert(!filters.includes('Gottman') && !filters.includes('4 Lenses'), 'report filters do not keep a second curriculum name list');

const filterBar = html.slice(html.indexOf('id="report-event-type-field"'), html.indexOf('id="report-clear-btn"'));
assert(filterBar.includes('id="report-event-type"'), 'Event Type remains a report control');
assert(filterBar.includes('id="report-curriculum-field" hidden'), 'Curriculum / Product starts hidden');
assert(filterBar.includes('All Curricula'), 'the curriculum filter can select all curricula');
assert(filterBar.includes('id="report-t4t-field" hidden'), 'the report T4T checkbox starts hidden');
assert(filterBar.includes('>T4T<'), 'the report checkbox is labeled T4T');
assert(filterBar.indexOf('id="report-event-type"') < filterBar.indexOf('id="report-curriculum"'), 'Curriculum / Product follows Event Type');
assert(filterBar.indexOf('id="report-curriculum"') < filterBar.indexOf('id="report-t4t"'), 'T4T follows Curriculum / Product');
assert(filterBar.indexOf('id="report-t4t"') < filterBar.indexOf('id="report-generate-btn"'), 'Generate Report follows T4T');
assert(css.includes('.reports-filter-bar .reports-filter-field[hidden] {\n  display: none;\n}'), 'hidden report controls stay hidden');

const reportTable = html.slice(html.indexOf('class="events-table reports-table"'), html.indexOf('id="report-body"'));
assert(!reportTable.includes('Curriculum / Product'), 'the Event Report table does not gain a curriculum column');
const historyHead = html.slice(html.indexOf('class="events-table aar-table aar-history-table"'), html.indexOf('id="aar-history-body"'));
const historyType = historyHead.indexOf('<th>Event Type</th>');
const historyCurriculum = historyHead.indexOf('<th>Curriculum / Product</th>');
const historyCommand = historyHead.indexOf('<th>Command</th>');
assert(historyType >= 0 && historyType < historyCurriculum && historyCurriculum < historyCommand, 'AAR History places Curriculum / Product immediately after Event Type');
assert(app.includes('historyCurriculumLabel(event, eventCurriculumChoices) || AAR_EMPTY_DISPLAY'), 'AAR History uses the shared curriculum label and the em dash empty value');
assert(app.includes("curriculumCell.textContent = historyCurriculumLabel"), 'AAR History renders curriculum as text');
assert(!app.slice(app.indexOf('function renderAarHistoryLog'), app.indexOf('function openAarAuditModal')).includes("createElement('input'"), 'AAR History does not edit curriculum or T4T');
assert(app.includes('eventMatchesEventTypeReport(event, eventTypeCriteria)'), 'Event Type reports use the reporting filter');
assert(app.includes('curriculumChoicesForEventType(eventCurriculumChoices, eventType)'), 'curriculum options come from the loaded curriculum catalog');
assert(app.includes(`<option value="${'${ALL_T4T_EVENTS_REPORT_OPTION}'}">${'${ALL_T4T_EVENTS_REPORT_LABEL}'}</option>`), 'All T4T Events is added only to the report Event Type control');
assert(!app.slice(app.indexOf('function populateModalEventTypeSelect'), app.indexOf('function populateEventTypeSelect')).includes('ALL_T4T_EVENTS_REPORT_OPTION'), 'Event Details does not offer All T4T Events');
assert(!html.includes('All T4T Events'), 'All T4T Events is not a stored option in the page markup');
const historySortColumns = app.slice(
  app.indexOf('const AAR_HISTORY_TABLE_SORT_COLUMNS'),
  app.indexOf('const MIR_HISTORY_TABLE_SORT_COLUMNS'),
);
const historyComparators = app.slice(
  app.indexOf('const AAR_HISTORY_SORT_COMPARATORS'),
  app.indexOf('const MIR_HISTORY_SORT_COMPARATORS'),
);
assert(historySortColumns.includes("{ key: 'curriculum', index: 3 }"), 'Curriculum / Product uses the AAR History header sort');
assert(historySortColumns.includes("{ key: 'date', index: 0 }"), 'the Date header remains sortable');
assert(historySortColumns.includes("{ key: 'sequenceNumber', index: 1 }"), 'the Sequence Number header remains sortable');
assert(historySortColumns.includes("{ key: 'eventType', index: 2 }"), 'the Event Type header remains sortable');
assert(historySortColumns.includes("{ key: 'command', index: 4 }"), 'the Command header remains sortable');
assert(historySortColumns.includes("{ key: 'location', index: 5 }"), 'the Location header remains sortable');
assert(historySortColumns.includes("{ key: 'venueCost', index: 6 }"), 'the Venue Cost header remains sortable');
assert(historySortColumns.includes("{ key: 'cateringCost', index: 7 }"), 'the Catering Cost header remains sortable');
assert(historySortColumns.includes("{ key: 'lastModified', index: 8 }"), 'the Last Modified header remains sortable');
assert(historyComparators.includes('compareHistoryCurriculumLabels('), 'curriculum sorting uses the displayed curriculum label');
assert(historyComparators.includes('historyCurriculumLabel(a, eventCurriculumChoices)'), 'curriculum sorting reads the shared history label');
assert(!historyComparators.includes('AAR_EMPTY_DISPLAY'), 'the em dash is not the curriculum sort key');
assert(historyComparators.includes('compareWithTbdLast(a.command, b.command)'), 'Command keeps its existing comparator');
assert(app.includes('return direction === SORT_DESC ? sorted.reverse() : sorted;'), 'descending sort still reverses the shared table sort');
assert(app.includes("bindSortableTableHeaders(\n    '#aar-history-view .aar-history-table',\n    AAR_HISTORY_TABLE_SORT_COLUMNS,"), 'AAR History still binds headers through the shared sorter');

const migrationNames = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
assert(migrationNames.includes('025_facilitator_t4t_product_experience.sql'), 'T4T facilitation experience migration 025 is present');

let migration023Diff = '';
let migration024Diff = '';
let migration025Diff = '';
let eventCurriculumDiff = '';
let aarCurriculumDiff = '';
try {
  migration023Diff = execFileSync('git', ['diff', '--', 'supabase/migrations/023_facilitator_product_taxonomy_correction.sql'], { cwd: ROOT, encoding: 'utf8' });
  migration024Diff = execFileSync('git', ['diff', '--', 'supabase/migrations/024_event_workshop_t4t.sql'], { cwd: ROOT, encoding: 'utf8' });
  migration025Diff = execFileSync('git', ['diff', '--', 'supabase/migrations/025_facilitator_t4t_product_experience.sql'], { cwd: ROOT, encoding: 'utf8' });
  eventCurriculumDiff = execFileSync('git', ['diff', '--', 'js/event-curriculum.js'], { cwd: ROOT, encoding: 'utf8' });
  aarCurriculumDiff = execFileSync('git', ['diff', '--', 'js/aar-curriculum.js'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(migration023Diff.trim() === '', 'Migration 023 is unchanged');
assert(migration024Diff.trim() === '', 'Migration 024 is unchanged');
assert(migration025Diff.trim() === '', 'Migration 025 is unchanged');
assert(eventCurriculumDiff.trim() === '', 'Event curriculum behavior is unchanged');
const facilitator = read('js/facilitator-management.js');
assert(!facilitator.includes('is_t4t') && !facilitator.includes('isT4t'), 'Facilitator Management does not read the Event T4T flag');
assert(!facilitator.includes('save_facilitator_qualification'), 'Facilitator Management does not edit qualifications');
assert(aarCurriculumDiff.trim() === '', 'the AAR curriculum helper is reused without a competing formatter');

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
  console.error('validate-stage-5f-event-report-curriculum-t4t failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-5f-event-report-curriculum-t4t: ok');
