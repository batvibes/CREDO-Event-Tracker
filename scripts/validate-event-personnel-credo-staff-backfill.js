/**
 * Stage 2D CREDO Staff relationship backfill.
 * Run: node scripts/validate-event-personnel-credo-staff-backfill.js
 *
 * Does not connect to Supabase and does not apply the migration.
 */
import fs from 'node:fs';
import path from 'node:path';
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

const migration = read('supabase/migrations/042_event_personnel_credo_staff_backfill.sql');
const executable = migration.replace(/--[^\n]*/g, '');
const insertStart = migration.indexOf('insert into public.event_personnel');
const insertEnd = migration.indexOf('where not exists', insertStart);
const insert = migration.slice(insertStart, insertEnd);
const splitter = migration.slice(
  migration.indexOf('create or replace function public.split_credo_staff_tokens'),
  migration.indexOf('comment on function public.split_credo_staff_tokens'),
);
const review = migration.slice(
  migration.indexOf('create view public.event_personnel_unresolved_credo_staff'),
  migration.indexOf('comment on view public.event_personnel_unresolved_credo_staff'),
);

assert(migration.includes('create or replace function public.split_credo_staff_tokens(p_raw text)'), 'staff splitting has its own helper');
assert(!migration.includes('split_facilitator_tokens'), 'staff splitting does not reuse the facilitator splitter');
assert(!migration.includes('split_poc_tokens'), 'staff splitting does not reuse the POC splitter');
assert(splitter.includes("v_char = ',' and not v_in_angles"), 'commas inside angle brackets stay in the token');
assert(splitter.includes('v_part := btrim(v_current)'), 'source tokens keep their internal text');
assert(splitter.includes('source_text := v_part'), 'source text is the historical staff token');
assert(splitter.includes('match_name := public.clean_reference_display_name(v_part)'), 'matching uses the cleaned staff token');
assert(splitter.includes('token_position := v_position'), 'position follows source order');
assert(migration.includes('public.facilitator_token_resolution(planned.match_name)'), 'person identity uses exact display, personal-name, and alias resolution');
assert(insert.includes("'credo_staff'"), 'the insert role is credo_staff');
assert(insert.includes('planned.person_id'), 'a resolved person id and a null unresolved id both come from the plan');
assert(insert.includes('planned.source_text'), 'the insert keeps the historical token');
assert(insert.includes('\n    null,'), 'contact email is null');
assert(insert.includes('planned.position'), 'the insert keeps source order');
assert(!insert.includes("'facilitator'") && !insert.includes("'poc'"), 'the insert does not create facilitator or POC rows');
assert(!/v_unresolved\s*>\s*0/.test(migration), 'unresolved staff tokens do not stop the migration');
assert(migration.includes('match_count > 1'), 'ambiguous tokens are classified');
assert(migration.includes('ambiguous tokens'), 'ambiguous tokens stop the migration');
assert(migration.includes('v_null_rows <> v_unresolved'), 'unresolved tokens stay person_id null');
assert(migration.includes('v_linked_rows <> v_resolved'), 'resolved tokens keep their person id');
assert(migration.includes('where not exists'), 'an existing matching staff row is not inserted again');
assert(migration.includes('existing.person_id is not distinct from planned.person_id'), 'an existing null or linked person must match before the row is left in place');
assert(!/delete\s+from\s+public\.event_personnel/i.test(executable), 'existing event personnel rows are not deleted');
assert(!/truncate/i.test(executable), 'event personnel is not truncated');
assert(!/update\s+public\.event_personnel/i.test(executable), 'existing event personnel rows are not overwritten');
assert(!/update\s+public\.events/i.test(executable), 'event text columns are not updated');
assert(!/credo_staff\s*=/.test(executable), 'events.credo_staff is not rewritten');
assert(!/events\.facilitators\s*=/.test(executable) && !/event\.facilitators\s*=/.test(executable), 'events.facilitators is not rewritten');
assert(!/events\.poc\s*=/.test(executable) && !/event\.poc\s*=/.test(executable), 'events.poc is not rewritten');
assert(!/insert\s+into\s+public\.people/i.test(executable), 'the backfill does not create people');
assert(migration.includes("remember_personnel_display_alias("), 'Palomino is linked through the existing alias helper');
assert(migration.includes("'RPSN Palomino'"), 'the verified historical token is stored as an alias');
assert(migration.includes("public.normalize_reference_name(person.name) = 'kimberly palomino'"), 'the alias is tied to Kimberly Palomino by canonical name');
assert(!/where\s+id\s*=\s*'[0-9a-f-]{36}'/i.test(executable), 'the alias lookup does not hardcode a person or event id');
assert(migration.includes('v_facilitators_before <> 352'), 'facilitator rows must remain 352');
assert(migration.includes('v_poc_before <> 295'), 'POC rows must remain 295');
assert(migration.includes("where role = 'facilitator'"), 'facilitator rows are counted and compared');
assert(migration.includes("where role = 'poc'"), 'POC rows are counted and compared');
assert(migration.includes('v_plan_rows <> v_split_rows'), 'the planned rows must equal the staff splitter count');
assert(migration.includes('min(position) <> 0'), 'staff positions must start at 0');
assert(migration.indexOf('raise exception') < insertStart, 'the refusal happens before any insert');
assert(!migration.includes('create or replace view public.facilitator_'), 'facilitator experience definitions are unchanged');
assert(!migration.includes('view public.facilitator_event_tokens'), 'the facilitator token definition is unchanged');
assert(!migration.includes('view public.facilitator_product_experience'), 'ordinary experience definition is unchanged');
assert(!migration.includes('view public.facilitator_t4t_product_experience'), 'T4T experience definition is unchanged');
assert(migration.includes('from public.facilitator_event_tokens'), 'facilitator token parity is rechecked');
assert(migration.includes('from public.facilitator_product_experience'), 'ordinary experience totals are compared');
assert(migration.includes('from public.facilitator_t4t_product_experience'), 'T4T experience totals are compared');
assert(migration.includes('v_staff_text_after is distinct from v_staff_text_before'), 'events.credo_staff text is compared before and after the insert');
assert(review.includes('link.person_id is null'), 'the review read model contains unresolved staff only');
assert(review.includes('link.source_text') && review.includes('link.position') && review.includes('link.event_id') && review.includes('link.id'), 'the review read model returns the relationship, event, token, and position');
assert(review.includes('event.event_type') && review.includes('as event_date'), 'the review read model returns the event type and date');

for (const relativePath of [
  'js/app.js',
  'js/event-reference-fields.js',
  'js/facilitator-management.js',
  'js/aar-pdf-export.js',
  'js/event-report-pdf-export.js',
]) {
  assert(!read(relativePath).includes('fetchEventPersonnel'), `${relativePath} does not read event personnel yet`);
}

if (errors.length) {
  console.error(`validate-event-personnel-credo-staff-backfill failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-event-personnel-credo-staff-backfill: ok');
