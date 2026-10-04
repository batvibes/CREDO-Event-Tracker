/**
 * Stage 2C point-of-contact relationship backfill.
 * Run: node scripts/validate-event-personnel-poc-backfill.js
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

const migration = read('supabase/migrations/041_event_personnel_poc_backfill.sql');
const executable = migration.replace(/--[^\n]*/g, '');
const insertStart = migration.indexOf('insert into public.event_personnel');
const insertEnd = migration.indexOf('where not exists', insertStart);
const insert = migration.slice(insertStart, insertEnd);
const splitter = migration.slice(
  migration.indexOf('create or replace function public.split_poc_tokens'),
  migration.indexOf('comment on function public.split_poc_tokens'),
);

assert(migration.includes('create or replace function public.split_poc_tokens(p_raw text)'), 'POC splitting has its own helper');
assert(!migration.includes('split_facilitator_tokens'), 'POC splitting does not reuse the facilitator splitter');
assert(splitter.includes("v_char = ',' and not v_in_angles"), 'commas inside angle brackets stay in the token');
assert(splitter.includes('v_part := btrim(v_current)'), 'source tokens keep their internal text');
assert(splitter.includes('source_text := v_part'), 'source text is the historical POC token');
assert(splitter.includes("regexp_match(v_part, '^(.+?)\\s*<([^<>]+)>\\s*$')"), 'a trailing angle-bracket email is recognized');
assert(splitter.includes("v_candidate_email ~ '^[^[:space:]<>,]+@[^[:space:]<>,]+$'"), 'malformed bracket text is not treated as an email');
assert(splitter.includes('v_email := v_candidate_email'), 'the extracted email is trimmed and stored separately');
assert(splitter.includes('v_name := v_candidate_name'), 'identity matching uses the name beside the email');
assert(migration.includes('public.facilitator_token_resolution(planned.match_name)'), 'person identity uses exact display, personal-name, and alias resolution on the name');
assert(!migration.includes('facilitator_token_resolution(planned.source_text)'), 'resolution does not see the email wrapper');

assert(insert.includes("'poc'"), 'the insert role is poc');
assert(insert.includes('planned.person_id'), 'person_id comes from the resolved name');
assert(insert.includes('planned.source_text'), 'the insert keeps the historical token');
assert(insert.includes('planned.contact_email'), 'the insert keeps the event email');
assert(insert.includes('planned.position'), 'the insert keeps source order');
assert(!insert.includes("'facilitator'") && !insert.includes("'credo_staff'"), 'the insert does not create facilitator or staff rows');
assert(migration.includes('where not exists'), 'an existing matching POC row is not inserted again');
assert(migration.includes('existing.contact_email is not distinct from planned.contact_email'), 'an existing POC email must match before the row is left in place');
assert(!/delete\s+from\s+public\.event_personnel/i.test(executable), 'existing event personnel rows are not deleted');
assert(!/truncate/i.test(executable), 'event personnel is not truncated');
assert(!/update\s+public\.event_personnel/i.test(executable), 'existing event personnel rows are not overwritten');
assert(!/update\s+public\.events/i.test(executable), 'event text columns are not updated');
assert(!/events\.poc\s*=/.test(executable) && !/event\.poc\s*=/.test(executable), 'events.poc is not rewritten');
assert(!/events\.facilitators\s*=/.test(executable) && !/event\.facilitators\s*=/.test(executable), 'events.facilitators is not rewritten');
assert(!/credo_staff\s*=/.test(executable), 'events.credo_staff is not rewritten');
assert(!/insert\s+into\s+public\.people/i.test(executable), 'the backfill does not create people');
assert(!/people_name_aliases/i.test(executable), 'aliases are not changed');

assert(/unresolved tokens/i.test(migration) && /ambiguous tokens/i.test(migration), 'unresolved and ambiguous tokens stop the migration');
assert(migration.includes('match_count = 0') && migration.includes('match_count > 1'), 'preflight classifies unresolved and ambiguous tokens');
assert(migration.includes('person_id is null or match_count is distinct from 1'), 'a token must resolve to exactly one person');
assert(migration.includes('v_facilitators_before <> 352'), 'the backfill expects the 352 facilitator rows already loaded');
assert(migration.includes("where role = 'facilitator'"), 'facilitator rows are counted and compared');
assert(migration.includes("where role = 'credo_staff'"), 'CREDO Staff rows are counted');
assert(migration.includes('v_plan_rows <> v_split_rows'), 'the planned rows must equal the POC splitter count');
assert(migration.includes('min(position) <> 0'), 'POC positions must start at 0');
assert(migration.indexOf('raise exception') < insertStart, 'the refusal happens before any insert');
assert(!migration.includes('create or replace view public.facilitator_'), 'facilitator experience definitions are unchanged');
assert(!migration.includes('view public.facilitator_event_tokens'), 'the facilitator token definition is unchanged');
assert(!migration.includes('view public.facilitator_product_experience'), 'ordinary experience definition is unchanged');
assert(!migration.includes('view public.facilitator_t4t_product_experience'), 'T4T experience definition is unchanged');
assert(migration.includes('from public.facilitator_event_tokens'), 'facilitator token parity is rechecked');
assert(migration.includes('from public.facilitator_product_experience'), 'ordinary experience totals are compared');
assert(migration.includes('from public.facilitator_t4t_product_experience'), 'T4T experience totals are compared');
assert(migration.includes('v_poc_text_after is distinct from v_poc_text_before'), 'events.poc text is compared before and after the insert');

for (const relativePath of [
  'js/facilitator-management.js',
  'js/aar-pdf-export.js',
  'js/event-report-pdf-export.js',
]) {
  assert(!read(relativePath).includes('fetchEventPersonnel'), `${relativePath} does not query event personnel directly`);
}
assert(read('js/app.js').includes('fetchEventPersonnel'), 'event screens load event personnel in one request');
assert(read('js/event-reference-fields.js').includes('setFromPersonnel'), 'the event editor loads canonical personnel rows');

if (errors.length) {
  console.error(`validate-event-personnel-poc-backfill failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-event-personnel-poc-backfill: ok');
