/**
 * Stage 3B facilitator experience foundation checks.
 * Run: node scripts/validate-stage-3b-facilitator-experience-foundation.js
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

function extractObject(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const end = source.indexOf('$$;', start);
  return end < 0 ? '' : source.slice(start, end);
}

function executableSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

const migrationPath = 'supabase/migrations/021_facilitator_experience_foundation.sql';
assert(fs.existsSync(path.join(ROOT, migrationPath)), 'migration 021 exists');
const migration = read(migrationPath);

assert(migration.includes('create view public.facilitator_event_tokens'), 'token read model exists');
assert(migration.includes('create view public.facilitator_product_experience'), 'product experience read model exists');
assert(migration.includes('create view public.facilitator_unresolved_history'), 'unresolved history read model exists');
assert(migration.includes('with (security_invoker = true)'), 'read models use the caller privileges');
assert(!/security definer/i.test(migration), 'Stage 3B functions do not bypass row security');

assert(!/insert into public\.facilitator_qualifications/i.test(migration), 'no qualification rows are seeded or created');
assert(!/update public\.facilitator_qualifications/i.test(migration), 'qualification rows are not updated');
assert(!/delete from public\.facilitator_qualifications/i.test(migration), 'qualification rows are not deleted');
assert(!/insert into public\.facilitator_event_type_products/i.test(migration), 'no Event Type mappings are seeded');
assert(!/update public\.facilitator_event_type_products/i.test(migration), 'Event Type mappings are not written');
assert(!/insert into public\.people\b/i.test(migration), 'unresolved tokens do not create people');
assert(!/insert into public\.people_name_aliases/i.test(migration), 'unresolved tokens do not create aliases');
assert(!/update public\.people\b/i.test(migration), 'personnel roles are not inferred');
assert(!/is_facilitator\s*=/.test(migration), 'the Facilitator role is not assigned from experience');
assert(!/trainer_authority/.test(migration), 'trainer authority is not inferred');
assert(!/standing\s*=/.test(migration), 'qualification standing is not changed');
assert(!/update public\.events\b|insert into public\.events\b|delete from public\.events\b/i.test(migration), 'Event history is not rewritten');
assert(!/update public\.team_members\b|insert into public\.team_members\b/i.test(migration), 'Manning is not changed');

const experience = migration.slice(
  migration.indexOf('create view public.facilitator_product_experience'),
  migration.indexOf('create view public.facilitator_unresolved_history'),
);
assert(experience.includes('token.person_id is not null'), 'experience keeps only a resolved person');
assert(experience.includes('token.product_id is not null'), 'experience requires an explicit product mapping');
assert(experience.includes('token.recorded_on is not null'), 'experience requires a usable recorded date');
assert(experience.includes('token.recorded_on <= current_date'), 'experience counts only a date that is today or earlier');
assert(experience.includes('events_conducted'), 'experience exposes events conducted');
assert(experience.includes('first_recorded_facilitation_on'), 'experience exposes the earliest recorded date');
assert(experience.includes('most_recent_facilitation_on'), 'experience exposes the latest recorded date');
assert(experience.includes('count(distinct token.event_id)'), 'one Event counts once for a person and product');
assert(!/aar_finalized|reservation|catering|packout|roster|cancelled|canceled/i.test(experience), 'experience does not invent an Event completion filter');

const resolution = extractObject(migration, 'create or replace function public.facilitator_token_resolution(');
assert(resolution.includes('public.personnel_display_name'), 'resolution uses the canonical display name');
assert(resolution.includes('public.people_name_aliases'), 'resolution uses explicit aliases');
assert(resolution.includes('public.normalize_reference_name'), 'resolution uses exact normalized text');
assert(resolution.includes('count(*) = 1'), 'only an unambiguous person is resolved');
assert(resolution.includes('else null::uuid'), 'ambiguous tokens stay unresolved');
assert(resolution.includes('(array_agg(candidates.candidate_id))[1]'), 'the single matching person id is read without min(uuid)');
assert(!/\b(min|max)\s*\(\s*candidates\.candidate_id\s*\)/i.test(resolution), 'resolution does not aggregate the candidate UUID with min or max');
assert(/\bunion\b/i.test(resolution) && !/\bunion\s+all\b/i.test(resolution), 'match_count counts distinct people, not matching identity paths');
assert(!/similarity\s*\(|levenshtein|pg_trgm|soundex|strpos\s*\(|position\s*\(|\slike\s+/i.test(resolution), 'resolution is not partial or approximate');

const unresolved = migration.slice(
  migration.indexOf('create view public.facilitator_unresolved_history'),
  migration.indexOf('revoke all on function public.split_facilitator_tokens'),
);
assert(unresolved.includes('token.match_count is distinct from 1'), 'the audit keeps unmatched and ambiguous tokens');
assert(unresolved.includes('facilitator_token'), 'the audit exposes the historical token');
assert(unresolved.includes('event_count'), 'the audit exposes how often a token appears');
assert(!/current_date|recorded_on is not null/.test(unresolved), 'unresolved history keeps future and undated tokens');

const tokens = migration.slice(
  migration.indexOf('create view public.facilitator_event_tokens'),
  migration.indexOf('create view public.facilitator_product_experience'),
);
assert(tokens.includes('public.facilitator_event_type_products'), 'product credit joins the explicit mapping table');
assert(tokens.includes('event_type.name = event.event_type'), 'Event Type text matches the catalog name exactly');
assert(tokens.includes('public.split_facilitator_tokens(event.facilitators)'), 'tokens come from facilitator text');
assert(!tokens.includes('event.poc') && !tokens.includes('event.credo_staff'), 'POC and CREDO Staff text are not facilitation');
assert(!/current_date|recorded_on is not null/.test(tokens), 'the token view keeps future and undated assignments');

const executable = executableSql(migration);
for (const statement of ['insert', 'update', 'delete', 'merge', 'truncate']) {
  assert(!new RegExp(`\\b${statement}\\b`, 'i').test(executable), `migration 021 contains no ${statement} statement`);
}
assert(
  !/\b(min|max)\s*\([^)]*\b(candidate_id|person_id|event_id|product_id|event_type_id)\b/i.test(executable),
  'migration 021 does not aggregate UUID identifiers with min or max',
);

const protectedFunctions = [
  'public.split_facilitator_tokens(text)',
  'public.facilitator_event_date(text, text)',
  'public.facilitator_token_resolution(text)',
];
for (const signature of protectedFunctions) {
  assert(migration.includes(`revoke all on function ${signature} from public, anon`), `${signature} is revoked from public and anon`);
  assert(migration.includes(`grant execute on function ${signature} to authenticated`), `${signature} is executable by authenticated users`);
}
const protectedViews = [
  'public.facilitator_event_tokens',
  'public.facilitator_product_experience',
  'public.facilitator_unresolved_history',
];
for (const viewName of protectedViews) {
  assert(migration.includes(`revoke all on table ${viewName} from public, anon, authenticated`), `${viewName} privileges are reset before the select grant`);
  assert(migration.includes(`grant select on table ${viewName} to authenticated`), `${viewName} is readable by authenticated users`);
}
assert(!/\bto anon\b/i.test(migration), 'anonymous users are not granted the new objects');
assert(!/\bto public\b/i.test(migration), 'public is not granted the new objects');

const eventTypes = read('supabase/schema.sql');
const eventTypeTable = eventTypes.slice(
  eventTypes.indexOf('create table public.event_types'),
  eventTypes.indexOf('create table public.team'),
);
assert(/name\s+text\s+not\s+null\s+unique/i.test(eventTypeTable), 'event_types.name is unique in the committed schema');
const earlierMigrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql') && name < '021_');
for (const name of earlierMigrations) {
  const sql = executableSql(read(`supabase/migrations/${name}`));
  assert(!/drop\s+constraint\s+(if\s+exists\s+)?event_types_name_key/i.test(sql), `${name} does not drop event_types.name uniqueness`);
}

let migrationDiff = '';
let protectedDiff = '';
try {
  migrationDiff = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
  protectedDiff = execFileSync('git', ['diff', '--name-only', '--',
    'js/monthly-report-pptx-export.js',
    'js/team-personnel-directory.js',
    'js/team-personnel-editor.js',
    'js/event-reference-fields.js',
    'js/settings-reference-lists.js',
    'js/personnel-identity.js',
  ], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(migrationDiff.trim() === '', 'previous migrations are unchanged');
assert(protectedDiff.trim() === '', 'MIR, Team, Event, and Settings files are unchanged');

if (errors.length) {
  console.error('validate-stage-3b-facilitator-experience-foundation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-3b-facilitator-experience-foundation: ok');
