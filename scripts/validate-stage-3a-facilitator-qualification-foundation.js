/**
 * Stage 3A facilitator qualification foundation checks.
 * Run: node scripts/validate-stage-3a-facilitator-qualification-foundation.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const next = source.indexOf('\ncreate or replace function ', start + signature.length);
  const end = next < 0 ? source.length : next;
  return source.slice(start, end);
}

const migrationPath = 'supabase/migrations/020_facilitator_qualification_foundation.sql';
assert(fs.existsSync(path.join(ROOT, migrationPath)), 'migration 020 exists');
const migration = read(migrationPath);
const previous = read('supabase/migrations/019_personnel_editing.sql');

assert(migration.includes('create table public.facilitator_products'), 'facilitator_products exists');
assert(migration.includes('create table public.facilitator_event_type_products'), 'facilitator_event_type_products exists');
assert(migration.includes('create table public.facilitator_qualifications'), 'facilitator_qualifications exists');

const products = [
  [1, 'marriage_enrichment_retreat', 'Marriage Enrichment Retreat', null],
  [2, 'marriage_enrichment_workshop', 'Marriage Enrichment Workshop', null],
  [3, 'family_enrichment_retreat', 'Family Enrichment Retreat', null],
  [4, 'personal_growth_retreat', 'Personal Growth Retreat', null],
  [5, 'personal_growth_workshop', 'Personal Growth Workshop', null],
  [6, 'gottman_method', 'Gottman Method', null],
  [7, 'seven_principles_for_making_marriage_work', 'Seven Principles for Making Marriage Work', null],
  [8, 'prep_8_0', 'PREP 8.0', null],
  [9, 'five_love_languages', 'Five Love Languages', null],
  [10, 'four_lenses', 'Four Lenses', null],
  [11, 'strengths_discovery_encounter', 'Strengths Discovery Encounter', null],
  [12, 'cliftonstrengths', 'CliftonStrengths', null],
  [13, 'navigating_your_next_chapter', 'Navigating Your Next Chapter', null],
  [14, 'safetalk', 'safeTALK', 'safetalk_trainer'],
  [15, 'asist', 'ASIST', 'asist_trainer'],
  [16, 'safetalk_t4t', 'safeTALK T4T', null],
  [17, 'asist_t4t', 'ASIST T4T', null],
];

const insertStart = migration.indexOf('insert into public.facilitator_products');
const insertEnd = migration.indexOf(';', insertStart);
const insertSql = insertStart >= 0 ? migration.slice(insertStart, insertEnd) : '';
const seeded = [...insertSql.matchAll(/\('([^']+)', '([^']+)', (\d+), (null|'[^']*'), null\)/g)];
assert(seeded.length === 17, 'exactly 17 facilitator products are seeded');
products.forEach(([order, code, name, rule], index) => {
  const row = seeded[index];
  assert(row?.[1] === code && row?.[2] === name && Number(row?.[3]) === order, `product ${order} is ${name}`);
  const actualRule = row?.[4] === 'null' ? null : row?.[4]?.slice(1, -1);
  assert(actualRule === rule, `${name} rule_family is ${rule ?? 'null'}`);
});
assert(seeded.filter((row) => row[4] !== 'null').length === 2, 'only safeTALK and ASIST have a rule family');

assert(!/insert into public\.facilitator_event_type_products/i.test(migration), 'Stage 3A does not seed Event Type mappings');
assert(
  migration.includes('event_type_id uuid primary key references public.event_types (id) on delete restrict'),
  'Event Type map restricts deletion of an Event Type'
);
assert(
  migration.includes('product_id uuid not null references public.facilitator_products (id) on delete restrict'),
  'product foreign keys restrict deletion'
);

assert(
  migration.includes('constraint facilitator_qualifications_person_product_key unique (person_id, product_id)'),
  'one qualification per person and product'
);
assert(
  migration.includes('person_id uuid not null references public.people (id) on delete restrict'),
  'qualification person foreign key restricts deletion'
);
assert(
  migration.includes("check (standing in ('developing', 'provisional', 'registered', 'inactive'))"),
  'standing is limited to the four controlled values'
);
assert(
  migration.includes('trainer_authority boolean not null default false'),
  'trainer authority defaults false'
);
assert((migration.match(/insert into public\.facilitator_qualifications/g) || []).length === 1, 'qualifications are not seeded');

const saveFn = extractFunction(migration, 'create or replace function public.save_facilitator_qualification(');
const reconcileFn = extractFunction(migration, 'create or replace function public.reconcile_directory_people(');
assert(saveFn.includes('public.can_edit_events()'), 'qualification writes use the existing editor boundary');
assert(saveFn.includes('auth.uid()'), 'qualification writes record the authenticated user');
assert(!/public\.events|is_facilitator|is_credo_staff|is_poc|team_members/.test(saveFn), 'qualification writes do not derive from Events or change roles or Manning');
assert(saveFn.includes('v_trainer_authority boolean := coalesce(p_trainer_authority, false)'), 'trainer authority comes only from the explicit argument');
assert(!saveFn.includes('trainer_authority =') || saveFn.includes('trainer_authority = excluded.trainer_authority'), 'trainer authority is stored from the explicit argument');
assert(!/v_standing\s*:=(?! lower\(btrim\(coalesce\(p_standing)/.test(saveFn), 'standing is taken from the caller and not from another field');

const qualificationUpdate = reconcileFn.indexOf('update public.facilitator_qualifications');
const qualificationConflict = reconcileFn.indexOf('Conflicting facilitator qualifications must be resolved before reconciliation.');
const peopleDelete = reconcileFn.indexOf('delete from public.people\n  where id = v_retired_id');
assert(qualificationConflict > 0 && qualificationUpdate > qualificationConflict, 'a same-product qualification conflict is raised before rows are moved');
assert(qualificationUpdate > 0 && peopleDelete > qualificationUpdate, 'non-conflicting qualifications move before the retired person is deleted');
assert(reconcileFn.includes("hint = 'PERSONNEL_CONFLICT'"), 'qualification conflicts use PERSONNEL_CONFLICT');
const moveSql = reconcileFn.slice(qualificationUpdate, peopleDelete);
assert(moveSql.includes('person_id = v_survivor_id'), 'reconciliation reassigns the qualification to the survivor');
assert(moveSql.includes('where person_id = v_retired_id'), 'reconciliation moves only the retired person rows');
assert(!/standing\s*=|notes\s*=|trainer_authority\s*=/.test(moveSql), 'reconciliation does not merge qualification fields');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(reconcileFn), 'reconciliation does not rewrite event text');
assert(!/alter table public\.events\b/i.test(migration), 'Stage 3A does not change the Event schema');
assert(!/alter table public\.team_members\b/i.test(migration), 'Stage 3A does not change the Manning schema');
assert(!/from public\.events\b|join public\.events\b/i.test(migration), 'Stage 3A does not read Event history');

const previousReconcile = extractFunction(previous, 'create or replace function public.reconcile_directory_people(');
assert(previousReconcile.includes('delete from public.people'), 'migration 019 reconciliation remains in place on disk');
assert(!previous.includes('facilitator_qualifications'), 'migration 019 was not edited for Stage 3A');

const protectedPaths = [
  'js/monthly-report-pptx-export.js',
  'js/team-personnel-directory.js',
  'js/team-personnel-editor.js',
  'js/event-reference-fields.js',
  'js/settings-reference-lists.js',
  'js/personnel-identity.js',
  'js/db.js',
  'js/app.js',
  'index.html',
];
let protectedDiff = '';
try {
  protectedDiff = execFileSync('git', ['diff', '--name-only', '--', ...protectedPaths], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`protected diff failed: ${error.message}`);
}
assert(protectedDiff.trim() === '', 'MIR, Team, Event, Settings, and personnel client files are unchanged');
assert(!read('js/app.js').includes('facilitator_qualifications'), 'no Facilitator Management UI was added');
assert(!read('js/db.js').includes('save_facilitator_qualification'), 'no unused qualification client wrapper was added');
assert(!read('index.html').includes('Facilitator Management'), 'no Facilitator Management screen was added');

if (errors.length) {
  console.error('validate-stage-3a-facilitator-qualification-foundation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-3a-facilitator-qualification-foundation: ok');
