/**
 * Stage 5A facilitator product taxonomy correction checks.
 * Run: node scripts/validate-stage-5a-facilitator-taxonomy-correction.js
 *
 * Does not connect to Supabase and does not apply migration 023.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

const migrationPath = 'supabase/migrations/023_facilitator_product_taxonomy_correction.sql';

const activeCatalog = [
  ['marriage_enrichment_retreat', 'Marriage Enrichment Retreat', 1],
  ['family_enrichment_retreat', 'Family Enrichment Retreat', 2],
  ['personal_growth_retreat', 'Personal Growth Retreat', 3],
  ['gottman_seven_principles', 'Gottman, Seven Principles of Making Marriage Work', 4],
  ['prep_8_0', 'PREP 8.0', 5],
  ['four_lenses', '4 Lenses', 6],
  ['cliftonstrengths_strengths_discovery_encounter', 'CliftonStrengths, Strengths Discovery Encounter', 7],
  ['navigating_your_next_chapter', 'Navigating Your Next Chapter', 8],
  ['safetalk', 'safeTALK', 9],
  ['asist', 'ASIST', 10],
  ['safetalk_t4t', 'safeTALK T4T', 11],
  ['asist_t4t', 'ASIST T4T', 12],
];

const retiredCatalog = [
  ['marriage_enrichment_workshop', 'Marriage Enrichment Workshop', 101],
  ['personal_growth_workshop', 'Personal Growth Workshop', 102],
  ['gottman_method', 'Gottman Method', 103],
  ['seven_principles_for_making_marriage_work', 'Seven Principles for Making Marriage Work', 104],
  ['five_love_languages', 'Five Love Languages', 105],
  ['strengths_discovery_encounter', 'Strengths Discovery Encounter', 106],
  ['cliftonstrengths', 'CliftonStrengths', 107],
];

const directMappings = [
  ['Marriage Enrichment Retreat', 'marriage_enrichment_retreat'],
  ['Family Enrichment Retreat', 'family_enrichment_retreat'],
  ['Personal Growth Retreat', 'personal_growth_retreat'],
  ['ASIST Workshop', 'asist'],
  ['ASIST T4T', 'asist_t4t'],
  ['SafeTalk Workshop', 'safetalk'],
  ['SafeTalk T4T', 'safetalk_t4t'],
];

const allowedCurricula = [
  ['Marriage Enrichment Workshop', 'gottman_seven_principles'],
  ['Marriage Enrichment Workshop', 'prep_8_0'],
  ['Personal Growth Workshop', 'four_lenses'],
  ['Personal Growth Workshop', 'cliftonstrengths_strengths_discovery_encounter'],
  ['Personal Growth Workshop', 'navigating_your_next_chapter'],
];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function executableSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

const migration = read(migrationPath);
const executable = executableSql(migration);
const originalProducts = read('supabase/migrations/020_facilitator_qualification_foundation.sql');
const originalMappings = read('supabase/migrations/022_facilitator_event_type_product_mappings.sql');

assert(migration.startsWith('-- 023: Facilitator product taxonomy correction'), 'migration 023 identifies the taxonomy correction');
assert(!/\bsecurity\s+definer\b/i.test(executable), 'migration 023 adds no security definer function');
assert(!/\bto anon\b/i.test(executable), 'anonymous users receive no new grant');
assert(!/\bto public\b/i.test(executable), 'public receives no new grant');
assert(executable.includes('revoke all on function public.enforce_event_curriculum_compatibility() from public, anon'), 'the curriculum check is revoked from public and anon');
assert(executable.includes('grant execute on function public.enforce_event_curriculum_compatibility() to authenticated'), 'authenticated users can execute the curriculum check when saving an Event');

for (const [code, name, sortOrder] of activeCatalog) {
  if (code === 'gottman_seven_principles' || code === 'cliftonstrengths_strengths_discovery_encounter') continue;
  assert(
    executable.includes(`('${code}', '${name}', ${sortOrder}, true)`),
    `${name} remains an active current product`,
  );
}
assert(executable.includes("('gottman_seven_principles', 'Gottman, Seven Principles of Making Marriage Work', 4, null, null, true)"), 'canonical Gottman curriculum is inserted');
assert(executable.includes("('cliftonstrengths_strengths_discovery_encounter', 'CliftonStrengths, Strengths Discovery Encounter', 7, null, null, true)"), 'canonical CliftonStrengths curriculum is inserted');

for (const [code, name, sortOrder] of retiredCatalog) {
  assert(
    executable.includes(`('${code}', '${name}', ${sortOrder}, false)`),
    `${name} is retired in place and marked inactive`,
  );
}
assert(!/\bdelete\s+from\s+public\.facilitator_products\b/i.test(executable), 'product identity is not deleted');
assert(!/\b(update|insert\s+into|delete\s+from)\s+public\.facilitator_qualifications\b/i.test(executable), 'qualification rows are not merged or rewritten');
assert(executable.includes('Gottman consolidation conflict'), 'a Gottman qualification conflict stops the migration');
assert(executable.includes('CliftonStrengths consolidation conflict'), 'a CliftonStrengths qualification conflict stops the migration');
assert(executable.includes("product.code in ('gottman_method', 'seven_principles_for_making_marriage_work')"), 'Gottman predecessors are compared before consolidation');
assert(executable.includes("product.code in ('cliftonstrengths', 'strengths_discovery_encounter')"), 'CliftonStrengths predecessors are compared before consolidation');

assert(executable.includes('delete from public.facilitator_event_type_products mapping'), 'generic workshop direct mappings are removed');
assert(executable.includes("event_type.name in ('Marriage Enrichment Workshop', 'Personal Growth Workshop')"), 'only the generic workshop mappings are removed');
for (const [eventType, code] of directMappings) {
  assert(executable.includes(`('${eventType}', '${code}')`), `${eventType} keeps its direct product mapping`);
}
assert(executable.includes('v_direct_count <> 7'), 'the seven direct mappings must still exist');
for (const [eventType, code] of allowedCurricula) {
  assert(executable.includes(`('${eventType}', '${code}')`), `${eventType} allows ${code}`);
}
assert(!executable.includes("('Marriage Enrichment Workshop', 'marriage_enrichment_workshop')"), 'MEW is not reinserted as its own product');
assert(!executable.includes("('Personal Growth Workshop', 'personal_growth_workshop')"), 'PGW is not reinserted as its own product');
assert(executable.includes("('five_love_languages', 'Five Love Languages', 105, false)"), 'Five Love Languages is retired in place');
const allowedValues = executable.slice(executable.indexOf("('Marriage Enrichment Workshop', 'gottman_seven_principles')"));
assert(allowedValues.startsWith("('Marriage Enrichment Workshop', 'gottman_seven_principles')"), 'allowed curricula are declared after the catalog correction');
assert(!allowedValues.includes('five_love_languages'), 'Five Love Languages is not an allowed future curriculum');
assert(!allowedValues.includes('marriage_enrichment_workshop'), 'the retired MEW product is not an allowed curriculum');
assert(!allowedValues.includes('personal_growth_workshop'), 'the retired PGW product is not an allowed curriculum');

assert(/add column curriculum_product_id uuid references/i.test(executable), 'Event curriculum is a nullable product reference');
assert(!/add column curriculum_product_id uuid\s+not null/i.test(executable), 'Event curriculum is not required');
assert(!/\bupdate\s+public\.events\b/i.test(executable), 'historical Events are not rewritten');
assert(!/\binsert\s+into\s+public\.events\b/i.test(executable), 'no Event rows are created');
assert(executable.includes('if new.curriculum_product_id is null then'), 'a null curriculum remains valid');
assert(executable.includes('Selected curriculum is not an active allowed curriculum'), 'an incompatible curriculum is rejected');
assert(!/new\.curriculum_product_id\s*:=/i.test(executable), 'the trigger does not invent or clear a curriculum');
assert(executable.includes('product.active = true'), 'only an active allowed curriculum can be selected');

assert(executable.includes('create or replace view public.facilitator_event_tokens'), 'derived token credit is corrected in place');
assert(executable.includes('with (security_invoker = true)'), 'derived views stay subject to caller policies');
assert(executable.includes('event.curriculum_product_id is not null'), 'selected curriculum can create product credit');
assert(executable.includes('event.curriculum_product_id is null'), 'a null curriculum does not use the generic workshop product');
assert(executable.includes('else null::uuid'), 'a workshop without a selected curriculum credits no product');
assert(!/\b(create|insert\s+into)\s+(table\s+)?public\.facilitator_product_experience\b/i.test(executable), 'experience stays a derived view');
assert(!/materialized/i.test(executable), 'experience is not materialized');
assert(executable.includes('create view public.facilitator_unclassified_workshop_history'), 'unclassified workshop history can be reviewed later');
assert(executable.includes('This is not product experience'), 'unclassified workshop history is not called experience');
assert(executable.includes('revoke all on table public.facilitator_unclassified_workshop_history from public, anon, authenticated'), 'the unclassified view is not public');
assert(executable.includes('grant select on table public.facilitator_unclassified_workshop_history to authenticated'), 'authenticated users can read unclassified workshop history');

assert(!/\b(update|insert\s+into|delete\s+from)\s+public\.(people|people_name_aliases|team_members)\b/i.test(executable), 'people and Manning are not written');
assert(!/is_facilitator|is_credo_staff|is_poc/i.test(executable), 'personnel roles are not inferred');
assert(!/Specific product not yet identified|Unknown|Unspecified/i.test(migration), 'no placeholder curriculum language is introduced');
assert(!/\bmanual_experience\b|off-system|external facilitation/i.test(migration), 'manual experience is not introduced');
assert(!/create table public\.facilitator_qualifications/i.test(executable), 'qualification management is not rebuilt');

assert(originalProducts.includes("('marriage_enrichment_workshop', 'Marriage Enrichment Workshop'"), 'migration 020 remains the historical 17-product seed');
assert(originalMappings.includes("('Marriage Enrichment Workshop', 'marriage_enrichment_workshop')"), 'migration 022 remains the historical direct workshop mapping');
assert(originalMappings.includes("('Personal Growth Workshop', 'personal_growth_workshop')"), 'migration 022 remains the historical PGW mapping');

assert(!read('js/facilitator-management.js').includes('curriculum_product_id'), 'Facilitator Management does not edit Event curriculum');
assert(!read('js/facilitator-management.js').includes('facilitator_event_type_allowed_products'), 'Facilitator Management does not read allowed curricula');
const facilitatorRead = read('js/db.js').slice(
  read('js/db.js').indexOf('export async function fetchFacilitatorManagementSources'),
  read('js/db.js').indexOf('export async function fetchTeamDirectoryPersonnel'),
);
assert(facilitatorRead.includes(".select('id, name, code, active, sort_order')"), 'the facilitator catalog read includes the active flag');
assert(!facilitatorRead.includes(".eq('active'"), 'the catalog query returns the active flag instead of hiding rows in SQL');

const protectedPaths = [
  'js/monthly-report-pptx-export.js',
  'js/team-personnel-directory.js',
  'js/team-personnel-editor.js',
  'js/event-reference-fields.js',
  'js/settings-reference-lists.js',
  'js/personnel-identity.js',
  'supabase/migrations/020_facilitator_qualification_foundation.sql',
  'supabase/migrations/021_facilitator_experience_foundation.sql',
  'supabase/migrations/022_facilitator_event_type_product_mappings.sql',
];
let protectedDiff = '';
try {
  protectedDiff = execFileSync('git', ['diff', '--name-only', '--', ...protectedPaths], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(protectedDiff.trim() === '', 'MIR, Team, Settings, and migrations 020-022 are unchanged');

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
  console.error('validate-stage-5a-facilitator-taxonomy-correction failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-5a-facilitator-taxonomy-correction: ok');
