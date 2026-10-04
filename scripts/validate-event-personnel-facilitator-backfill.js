/**
 * Stage 2B facilitator relationship backfill.
 * Run: node scripts/validate-event-personnel-facilitator-backfill.js
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

const migration = read('supabase/migrations/040_event_personnel_facilitator_backfill.sql');
const foundation = read('supabase/migrations/039_event_personnel.sql');
const insertStart = migration.indexOf('insert into public.event_personnel');
const insertEnd = migration.indexOf('where not exists', insertStart);
const insert = migration.slice(insertStart, insertEnd);

assert(migration.includes('split_facilitator_tokens(event.facilitators)'), 'tokens come from events.facilitators');
assert(migration.includes('facilitator_token_resolution(token.token)'), 'person identity uses the existing exact resolution');
assert(migration.includes('with ordinality as token(token, ordinality)'), 'token order comes from the existing split');
assert(migration.includes('(token.ordinality - 1)::integer as position'), 'position preserves source order starting at 0');
assert(migration.includes('token.token as source_text'), 'source text is the historical facilitator token');
assert(insert.includes('planned.person_id'), 'person_id comes from the resolved token');
assert(insert.includes("'facilitator'"), 'the insert role is facilitator');
assert(insert.includes('planned.source_text'), 'the insert keeps the historical token');
assert(insert.includes('\n    null,'), 'contact email is null');
assert(insert.includes('planned.position'), 'the insert keeps source order');
assert(!insert.includes("'poc'") && !insert.includes("'credo_staff'"), 'the insert does not create poc or staff rows');
assert(migration.includes('where not exists'), 'an existing matching facilitator row is not inserted again');
assert(!/delete\s+from\s+public\.event_personnel/i.test(migration), 'existing event personnel rows are not deleted');
assert(!/truncate/i.test(migration), 'event personnel is not truncated');
assert(!/update\s+public\.event_personnel/i.test(migration), 'existing event personnel rows are not overwritten');

assert(/unresolved tokens/i.test(migration) && /ambiguous tokens/i.test(migration), 'unresolved and ambiguous tokens stop the migration');
assert(migration.includes('match_count = 0') && migration.includes('match_count > 1'), 'preflight classifies unresolved and ambiguous tokens');
assert(migration.includes('person_id is null or match_count is distinct from 1'), 'a token must resolve to exactly one person');
assert(migration.includes('raise exception'), 'a failed preflight raises before the insert');
assert(migration.indexOf('raise exception') < insertStart, 'the refusal happens before any insert');
assert(migration.includes('having count(*) > 1'), 'the same canonical person cannot be planned twice for one event');

assert(!/insert\s+into\s+public\.people/i.test(migration), 'the backfill does not create people');
assert(!/update\s+public\.events/i.test(migration), 'event text columns are not updated');
assert(!/events\.facilitators\s*=/.test(migration) && !/event\.facilitators\s*=/.test(migration), 'events.facilitators is not rewritten');
assert(!/events\.poc\s*=/.test(migration) && !/event\.poc\s*=/.test(migration) && !/events\.poc\b/.test(migration.replace(/--[^\n]*/g, '')), 'events.poc is untouched');
assert(!/credo_staff\s*=/.test(migration), 'events.credo_staff is not rewritten');
assert(migration.includes("role in ('poc', 'credo_staff')"), 'poc and staff row counts are preserved');
assert(!migration.includes('create or replace view public.facilitator_'), 'facilitator experience definitions are unchanged');
assert(!migration.includes('view public.facilitator_event_tokens'), 'the facilitator token definition is unchanged');
assert(!migration.includes('view public.facilitator_product_experience'), 'ordinary experience definition is unchanged');
assert(!migration.includes('view public.facilitator_t4t_product_experience'), 'T4T experience definition is unchanged');
assert(migration.includes('from public.facilitator_event_tokens'), 'parity reads the current facilitator tokens');
assert(migration.includes('from public.facilitator_product_experience'), 'ordinary experience totals are compared');
assert(migration.includes('from public.facilitator_t4t_product_experience'), 'T4T experience totals are compared');
assert(migration.includes('link.source_text = token.facilitator_token'), 'stored source text must equal the historical token');
assert(migration.includes('link.person_id = token.person_id'), 'stored person must equal the resolved person');
assert(!/insert\s+into\s+public\.event_personnel/i.test(foundation), 'the foundation migration still inserts nothing');

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
  console.error(`validate-event-personnel-facilitator-backfill failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-event-personnel-facilitator-backfill: ok');
