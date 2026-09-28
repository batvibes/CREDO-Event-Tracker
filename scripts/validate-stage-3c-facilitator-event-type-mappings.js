/**
 * Stage 3C Event Type to facilitator product mapping checks.
 * Run: node scripts/validate-stage-3c-facilitator-event-type-mappings.js
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

const approvedMappings = [
  ['Marriage Enrichment Retreat', 'marriage_enrichment_retreat'],
  ['Marriage Enrichment Workshop', 'marriage_enrichment_workshop'],
  ['Family Enrichment Retreat', 'family_enrichment_retreat'],
  ['Personal Growth Retreat', 'personal_growth_retreat'],
  ['Personal Growth Workshop', 'personal_growth_workshop'],
  ['ASIST T4T', 'asist_t4t'],
  ['ASIST Workshop', 'asist'],
  ['SafeTalk Workshop', 'safetalk'],
  ['SafeTalk T4T', 'safetalk_t4t'],
];

const unmappedEventTypes = ['Dinner Date Night', 'Leadership Development'];

const productsWithoutEventTypes = [
  'gottman_method',
  'seven_principles_for_making_marriage_work',
  'prep_8_0',
  'five_love_languages',
  'four_lenses',
  'strengths_discovery_encounter',
  'cliftonstrengths',
  'navigating_your_next_chapter',
];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function executableSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

const migrationPath = 'supabase/migrations/022_facilitator_event_type_product_mappings.sql';
assert(fs.existsSync(path.join(ROOT, migrationPath)), 'migration 022 exists');
const migration = read(migrationPath);
const executable = executableSql(migration);

const valuesStart = migration.indexOf('from (values');
const valuesEnd = migration.indexOf(') as approved(event_type_name, product_code)');
const valuesSql = valuesStart >= 0 && valuesEnd > valuesStart
  ? migration.slice(valuesStart, valuesEnd)
  : '';
const encodedMappings = [...valuesSql.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)]
  .map((match) => [match[1], match[2]]);

assert(encodedMappings.length === 9, 'exactly nine mappings are encoded');
assert(
  JSON.stringify(encodedMappings) === JSON.stringify(approvedMappings),
  'the nine Event Type names and product codes match the approved list',
);
for (const [eventTypeName, productCode] of approvedMappings) {
  assert(valuesSql.includes(`('${eventTypeName}', '${productCode}')`), `${eventTypeName} maps to ${productCode}`);
}
for (const eventTypeName of unmappedEventTypes) {
  assert(!valuesSql.includes(eventTypeName), `${eventTypeName} is not mapped`);
}
for (const productCode of productsWithoutEventTypes) {
  assert(!migration.includes(productCode), `${productCode} receives no mapping`);
}

assert(!/\b(like|ilike)\b|similarity\s*\(|levenshtein|pg_trgm|soundex|strpos\s*\(|position\s*\(/i.test(executable), 'mappings do not use partial or approximate text');
assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(executable), 'production UUIDs are not hardcoded');
assert(executable.includes('where name = v_event_type_name'), 'Event Types are resolved by exact name');
assert(executable.includes('where code = v_product_code'), 'products are resolved by exact code');
assert(executable.includes('v_event_type_count <> 1'), 'a missing or duplicated Event Type fails');
assert(executable.includes('v_product_count <> 1'), 'a missing or duplicated product code fails');
assert(executable.includes('raise exception'), 'lookup failures raise an exception');
assert(executable.includes('v_existing_product_id is distinct from v_product_id'), 'a different existing product fails');
assert(/if found then[\s\S]*is distinct from v_product_id then[\s\S]*raise exception[\s\S]*else\s+insert into public\.facilitator_event_type_products/i.test(executable), 'an identical mapping is left in place and only a missing mapping is inserted');
assert(!/\bon\s+conflict\b/i.test(executable), 'conflicts are not hidden by ON CONFLICT');

const inserts = [...executable.matchAll(/\binsert\s+into\s+([a-z0-9_.]+)/gi)].map((match) => match[1]);
assert(inserts.length === 1 && inserts[0] === 'public.facilitator_event_type_products', 'the only insert is an Event Type mapping');
for (const statement of ['update', 'delete', 'merge', 'truncate']) {
  assert(!new RegExp(`\\b${statement}\\b`, 'i').test(executable), `migration 022 contains no ${statement} statement`);
}
assert(!/\binsert\s+into\s+public\.facilitator_products\b/i.test(executable), 'no facilitator products are created');
assert(!/\binsert\s+into\s+public\.event_types\b/i.test(executable), 'no Event Types are created');
assert(!/facilitator_qualifications|standing|trainer_authority|first_facilitated_on|t4t_completed_on|expiration_on|governing_source/i.test(executable), 'qualifications are not created or changed');
assert(!/\b(update|insert\s+into|delete\s+from)\s+public\.events\b/i.test(executable), 'Events are not rewritten');
assert(!/people_name_aliases|team_members|is_facilitator|is_credo_staff|is_poc/i.test(executable), 'people, aliases, Manning, and roles are unchanged');
assert(!/\b(create\s+(or\s+replace\s+)?(function|view|table|trigger)|alter\s+table)\b/i.test(executable), 'migration 022 adds no schema objects');
assert(!/facilitator_event_tokens|facilitator_product_experience|facilitator_unresolved_history|split_facilitator_tokens|facilitator_event_date|facilitator_token_resolution/.test(executable), 'Stage 3B objects are not redefined');

let migrationDiff = '';
let experienceDiff = '';
let protectedDiff = '';
try {
  migrationDiff = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
  experienceDiff = execFileSync('git', ['diff', '--', 'supabase/migrations/021_facilitator_experience_foundation.sql'], { cwd: ROOT, encoding: 'utf8' });
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
assert(migrationDiff.trim() === '', 'migrations 020 and 021 are unchanged');
assert(experienceDiff.trim() === '', 'Stage 3B experience architecture is unchanged');
assert(protectedDiff.trim() === '', 'MIR, Team, Event, and Settings files are unchanged');
assert(!read('js/app.js').includes('facilitator_event_type_products'), 'Event Type mappings are not rewritten from the application shell');
assert(!read('js/db.js').includes('facilitator_event_type_products'), 'no mapping write wrapper was added');

if (errors.length) {
  console.error('validate-stage-3c-facilitator-event-type-mappings failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-3c-facilitator-event-type-mappings: ok');
