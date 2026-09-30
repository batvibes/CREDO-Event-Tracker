/**
 * Stage 5E MEW / PGW Event-level T4T checks.
 * Run: node scripts/validate-stage-5e-event-workshop-t4t.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { aarCurriculumDisplayName } from '../js/aar-curriculum.js';
import {
  isMissingEventCurriculumSchemaError,
  normalizeCurriculumProductId,
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

function extractFunction(source, name) {
  const exported = source.indexOf(`export function ${name}`);
  const start = exported >= 0 ? exported : source.indexOf(`function ${name}`);
  if (start < 0) {
    errors.push(`missing function ${name}`);
    return '';
  }
  const params = source.indexOf('(', start);
  let paren = 0;
  let brace = -1;
  for (let index = params; index < source.length; index += 1) {
    if (source[index] === '(') paren += 1;
    else if (source[index] === ')') {
      paren -= 1;
      if (paren === 0) {
        brace = source.indexOf('{', index);
        break;
      }
    }
  }
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/^export /, '');
    }
  }
  errors.push(`unterminated function ${name}`);
  return '';
}

const db = read('js/db.js');
const app = read('js/app.js');
const html = read('index.html');
const css = read('css/styles.css');
const migration = read('supabase/migrations/024_event_workshop_t4t.sql');
const migration023 = read('supabase/migrations/023_facilitator_product_taxonomy_correction.sql');
const experience021 = read('supabase/migrations/021_facilitator_experience_foundation.sql');
const facilitator = read('js/facilitator-management.js');

const context = vm.createContext({
  normalizeCurriculumProductId,
  Object,
  String,
  Error,
  Boolean,
});
vm.runInContext([
  'booleanFromDb',
  'resolveEventDates',
  'readEventT4tColumn',
  'assignEventT4t',
  'assignEventCurriculumProductId',
  'readEventCurriculumColumn',
  'normalizeLoadedEventT4t',
  'mergeEventT4t',
  'eventTypeAllowsWorkshopT4t',
  'eventT4tValueForSave',
  'eventFromRow',
  'eventToRow',
].map((name) => extractFunction(db, name)).join('\n') + `
this.eventFromRow = eventFromRow;
this.normalizeLoadedEventT4t = normalizeLoadedEventT4t;
this.mergeEventT4t = mergeEventT4t;
this.eventTypeAllowsWorkshopT4t = eventTypeAllowsWorkshopT4t;
this.eventT4tValueForSave = eventT4tValueForSave;
this.eventToRow = eventToRow;
`, context);

function freshT4t(row) {
  return context.normalizeLoadedEventT4t(context.eventFromRow(row));
}

const baseRow = {
  id: 'workshop',
  date: '2026-04-08',
  event_type: 'Marriage Enrichment Workshop',
  aar_finalized: false,
};

assert(freshT4t({ ...baseRow, is_t4t: true }) === true, 'a fresh row that owns is_t4t true hydrates true');
assert(freshT4t({ ...baseRow, is_t4t: false }) === false, 'a fresh row that owns is_t4t false hydrates false');
const missingFlag = context.eventFromRow(baseRow);
assert(!Object.prototype.hasOwnProperty.call(missingFlag, 'isT4t'), 'a fresh pre-024 row does not invent an isT4t property');
assert(freshT4t(baseRow) === false, 'a fresh row without is_t4t behaves as false');
assert(context.mergeEventT4t(false, { isT4t: true }) === true, 'a returned true is authoritative');
assert(context.mergeEventT4t(true, { isT4t: false }) === false, 'a returned false is authoritative');
assert(context.mergeEventT4t(true, { id: 'workshop', eventType: 'Marriage Enrichment Workshop' }) === true, 'a save response that omits is_t4t preserves the in-memory flag');
assert(context.mergeEventT4t(true, { roster: 'Complete' }) === true, 'an unrelated full Event save preserves T4T when the response omits the column');
assert(context.mergeEventT4t(false, { isT4t: false }) === false, 'an explicit false clear stays false');

const omittedWrite = context.eventToRow({
  dateType: 'single',
  startDate: '2026-04-08',
  participants: '1',
  isT4t: true,
}, { includeT4t: false });
assert(!Object.prototype.hasOwnProperty.call(omittedWrite, 'is_t4t'), 'pre-probe writes omit is_t4t');
const trueWrite = context.eventToRow({
  dateType: 'single',
  startDate: '2026-04-08',
  participants: '1',
  eventType: 'Marriage Enrichment Workshop',
  isT4t: true,
}, { includeT4t: true });
assert(trueWrite.is_t4t === true, 'a confirmed T4T schema sends true');
assert(context.eventT4tValueForSave('Marriage Enrichment Retreat', true) === false, 'leaving MEW/PGW produces false before the save payload is built');

const workshops = ['Marriage Enrichment Workshop', 'Personal Growth Workshop'];
const blocked = [
  'Marriage Enrichment Retreat',
  'Family Enrichment Retreat',
  'Personal Growth Retreat',
  'SafeTalk Workshop',
  'ASIST Workshop',
  'SafeTalk T4T',
  'ASIST T4T',
];
for (const name of workshops) {
  assert(context.eventTypeAllowsWorkshopT4t(name) === true, `${name} may use the Event T4T flag`);
  assert(context.eventT4tValueForSave(name, true) === true, `${name} keeps a checked T4T flag`);
  assert(context.eventT4tValueForSave(name, false) === false, `${name} can remain unchecked`);
}
for (const name of blocked) {
  assert(context.eventTypeAllowsWorkshopT4t(name) === false, `${name} does not use the Event T4T flag`);
  assert(context.eventT4tValueForSave(name, true) === false, `leaving to ${name} saves is_t4t false`);
}
assert(context.eventT4tValueForSave('Personal Growth Workshop', true) === true, 'switching MEW to PGW can preserve a checked flag');
assert(context.eventT4tValueForSave('Marriage Enrichment Workshop', true) === true, 'switching PGW to MEW can preserve a checked flag');

assert(isMissingEventCurriculumSchemaError({ code: 'PGRST204' }), 'a missing T4T column uses the existing missing-schema handling');
assert(isMissingEventCurriculumSchemaError({ code: 'PGRST205' }), 'a missing schema object uses the existing missing-schema handling');
assert(isMissingEventCurriculumSchemaError({ code: '42P01' }), 'an undefined table uses the existing missing-schema handling');
assert(isMissingEventCurriculumSchemaError({ code: '42703' }), 'an undefined column uses the existing missing-schema handling');
assert(!isMissingEventCurriculumSchemaError({ code: '42501' }), 'a permission failure still propagates');
assert(!isMissingEventCurriculumSchemaError({ code: '08006' }), 'a network failure still propagates');
assert(!isMissingEventCurriculumSchemaError(new Error('fetch failed')), 'an unexpected error still propagates');

const t4tProbe = db.slice(db.indexOf(".select('is_t4t')"));
const t4tMissingBranch = t4tProbe.slice(0, t4tProbe.indexOf('eventT4tSchemaAvailable = true'));
assert(db.includes(".select('curriculum_product_id')"), 'the curriculum probe remains separate');
assert(db.includes(".select('is_t4t')"), 'the T4T probe reads events.is_t4t');
assert(db.indexOf(".select('curriculum_product_id')") < db.indexOf(".select('is_t4t')"), 'curriculum support is established before the T4T probe');
assert(t4tMissingBranch.includes('return { available: true, t4tAvailable: false, choices }'), 'a missing T4T column leaves curriculum available');
assert(!t4tMissingBranch.includes('eventCurriculumSchemaAvailable = false'), 'a missing T4T column does not turn curriculum support off');
assert(db.includes('let eventT4tSchemaAvailable = false'), 'T4T writes stay off until the probe succeeds');
assert(db.includes('includeT4t: eventT4tSchemaAvailable'), 'full Event saves include is_t4t only after the probe');

const choices = [
  { productId: 'gottman', name: 'Gottman, Seven Principles of Making Marriage Work' },
  { productId: 'prep', name: 'PREP 8.0' },
  { productId: 'lenses', name: '4 Lenses' },
  { productId: 'strengths', name: 'CliftonStrengths, Strengths Discovery Encounter' },
  { productId: 'chapter', name: 'Navigating Your Next Chapter' },
];
assert(aarCurriculumDisplayName('lenses', choices, false) === '4 Lenses', 'AAR keeps the canonical name when T4T is false');
assert(aarCurriculumDisplayName('lenses', choices, true) === '4 Lenses T4T', 'AAR suffixes 4 Lenses when the Event is T4T');
assert(aarCurriculumDisplayName('prep', choices, true) === 'PREP 8.0 T4T', 'AAR suffixes PREP 8.0 when the Event is T4T');
assert(aarCurriculumDisplayName('gottman', choices, true) === 'Gottman, Seven Principles of Making Marriage Work T4T', 'AAR suffixes Gottman when the Event is T4T');
assert(aarCurriculumDisplayName('strengths', choices, true) === 'CliftonStrengths, Strengths Discovery Encounter T4T', 'AAR suffixes CliftonStrengths when the Event is T4T');
assert(aarCurriculumDisplayName('chapter', choices, true) === 'Navigating Your Next Chapter T4T', 'AAR suffixes Navigating Your Next Chapter when the Event is T4T');
assert(aarCurriculumDisplayName(null, choices, true) === null, 'a blank curriculum omits the AAR row even when T4T is true');
assert(aarCurriculumDisplayName('', choices, true) === null, 'an empty curriculum omits the AAR row even when T4T is true');
assert(!aarCurriculumDisplayName('lenses', choices, true).includes('4 Lenses T4T T4T'), 'the suffix is applied once');

assert(app.includes('aarCurriculumDisplayName(\n    event?.curriculumProductId,\n    eventCurriculumChoices,\n    event?.isT4t === true,\n  )'), 'AAR render passes the Event T4T flag');
assert(app.includes('syncAarCurriculumRow(event, root)'), 'AAR population still owns the curriculum row');
assert(app.includes('populateAarDocument(event, { root: article, editable: false })'), 'PDF export uses the same AAR population path');
assert(!app.includes('aar_t4t') && !db.includes('aar_t4t'), 'T4T is not stored as an AAR column');
assert(!html.includes('data-aar-t4t'), 'the AAR template has no T4T control');

const form = html.slice(html.indexOf('id="event-curriculum-field"'), html.indexOf('id="event-modal-submit"'));
assert(form.includes('id="event-t4t-field" hidden'), 'the T4T checkbox starts hidden');
assert(form.includes('name="isT4t"'), 'the T4T control is a checkbox field');
assert(form.includes('Training for Trainers (T4T)'), 'the checkbox label is Training for Trainers (T4T)');
assert(!form.includes('checked'), 'the checkbox is not auto-checked in markup');
assert(css.includes('#new-event-modal #event-t4t-field[hidden] {\n  display: none;\n}'), 'the hidden T4T label stays hidden');
assert(app.includes('syncEventT4tField(form, false)'), 'a reset Event starts unchecked');
assert(app.includes('syncEventT4tField(form, event.isT4t === true)'), 'opening an Event applies the stored flag after Event Type is set');
assert(app.includes('syncEventT4tField(form);'), 'an Event Type change reconciles the current checkbox');
const typeChange = app.slice(app.indexOf("typeSelect.addEventListener('change'"), app.indexOf("typeSelect.addEventListener('change'") + 240);
assert(typeChange.includes('syncEventCurriculumField(form);'), 'an Event Type change still reconciles curriculum');
assert(typeChange.includes('syncEventT4tField(form);'), 'an Event Type change reconciles T4T in the same turn');
assert(!/\[name="curriculumProductId"\][\s\S]{0,200}syncEventT4tField/.test(app), 'changing curriculum does not itself change T4T');

assert(/is_t4t boolean not null default false/.test(migration), 'Migration 024 adds is_t4t boolean not null default false');
assert(!/update\s+public\.events/i.test(migration), 'Migration 024 does not backfill historical Events to true');
assert(migration.includes('create or replace function public.enforce_event_t4t_applicability()'), 'the applicability function is created');
assert(migration.includes('create trigger events_t4t_applicability'), 'the applicability trigger is created');
assert(migration.includes('before insert or update of event_type, is_t4t'), 'the trigger watches Event Type and is_t4t');
assert(migration.includes('if new.is_t4t is not true then'), 'false is returned without raising');
assert(migration.includes("'Marriage Enrichment Workshop'"), 'MEW is an exact allowed Event Type');
assert(migration.includes("'Personal Growth Workshop'"), 'PGW is an exact allowed Event Type');
assert(migration.includes('raise exception'), 'an invalid true raises instead of being cleared');
assert(!/new\.is_t4t\s*:=/.test(migration), 'the trigger does not silently clear is_t4t');
const applicability = migration.slice(
  migration.indexOf('create or replace function public.enforce_event_t4t_applicability()'),
  migration.indexOf('comment on function public.enforce_event_t4t_applicability()'),
);
assert(!applicability.includes('curriculum_product_id'), 'the T4T trigger does not modify curriculum');
assert(!/\bsecurity\s+definer\b/i.test(migration), 'the T4T function is not security definer');
assert(migration.includes('set search_path = public'), 'the T4T function sets the public search path');
assert(!migration.includes('SafeTalk T4T') || migration.includes('including SafeTalk T4T and ASIST T4T'), 'SafeTalk T4T and ASIST T4T are documented as outside this flag');
const viewStart = migration.indexOf('create or replace view public.facilitator_event_tokens');
const view = migration.slice(viewStart, migration.indexOf('comment on view public.facilitator_event_tokens'));
assert(view.includes('security_invoker = true'), 'the token view stays security invoker');
assert(view.includes('public.split_facilitator_tokens(event.facilitators)'), 'tokens still come only from events.facilitators');
assert(!view.includes('credo_staff') && !view.includes('poc'), 'credo_staff and poc do not generate facilitator tokens');
const productCase = view.slice(view.indexOf('case'), view.indexOf('end as product_id'));
assert(!productCase.includes('is_t4t'), 'T4T does not change the credited product');
assert(productCase.includes('then event.curriculum_product_id'), 'a selected curriculum remains the product');
assert(productCase.includes('then mapping.product_id'), 'direct mappings remain the product when no curriculum catalog applies');
assert(productCase.includes('else null::uuid'), 'a null workshop curriculum still credits no product');
assert(view.includes('event.is_t4t'), 'each token row carries the Event is_t4t flag');
assert(!migration.includes('facilitator_product_experience'), 'facilitator_product_experience is not redefined');
assert(!/insert\s+into\s+public\.facilitator_/i.test(migration), 'the migration does not insert facilitator evidence');
assert(experience021.includes('count(distinct token.event_id)'), 'recorded experience still counts distinct Events');
assert(migration.trim().endsWith("notify pgrst, 'reload schema';"), 'Migration 024 reloads the API schema');

assert(!facilitator.includes('is_t4t') && !facilitator.includes('isT4t'), 'Facilitator Management does not read the Event T4T flag');
assert(app.includes("if (!name) return;"), 'a missing curriculum name still removes the AAR row');

let migration023Diff = '';
let eventCurriculumDiff = '';
let facilitatorDiff = '';
try {
  migration023Diff = execFileSync('git', ['diff', '--', 'supabase/migrations/023_facilitator_product_taxonomy_correction.sql'], { cwd: ROOT, encoding: 'utf8' });
  eventCurriculumDiff = execFileSync('git', ['diff', '--', 'js/event-curriculum.js'], { cwd: ROOT, encoding: 'utf8' });
  facilitatorDiff = execFileSync('git', ['diff', '--', 'js/facilitator-management.js'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(migration023Diff.trim() === '', 'Migration 023 is unchanged');
assert(eventCurriculumDiff.trim() === '', 'js/event-curriculum.js is unchanged');
assert(facilitatorDiff.trim() === '', 'js/facilitator-management.js is unchanged');
assert(migration023.includes('create trigger events_curriculum_compatibility'), 'the curriculum compatibility trigger remains in Migration 023');
assert(!migration.includes('events_curriculum_compatibility'), 'Migration 024 does not replace the curriculum trigger');

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
  console.error('validate-stage-5e-event-workshop-t4t failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-5e-event-workshop-t4t: ok');
