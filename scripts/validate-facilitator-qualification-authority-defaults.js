/**
 * Product-level qualification authority defaults and new-record autofill.
 * Run: node scripts/validate-facilitator-qualification-authority-defaults.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  facilitatorProductAuthorityDefault,
  facilitatorQualificationSaveInput,
  nextQualificationSourceSuggestion,
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

const migrationPath = 'supabase/migrations/026_facilitator_product_authority_defaults.sql';
const migration = read(migrationPath);
const db = read('js/db.js');
const app = read('js/app.js');
const model = read('js/facilitator-management.js');
const facilitatorRead = db.slice(
  db.indexOf('export async function fetchFacilitatorManagementSources'),
  db.indexOf('export async function fetchTeamDirectoryPersonnel'),
);
const editor = app.slice(app.indexOf('function paintFacilitatorQualificationEditor'), app.indexOf('function cancelFacilitatorQualificationEdit'));
const saveWrapper = db.slice(db.indexOf('export async function saveFacilitatorQualification'), db.indexOf('function personnelRpcError'));

const verified = [
  ['gottman_seven_principles', 'Gottman, Seven Principles of Making Marriage Work', 'The Gottman Institute'],
  ['prep_8_0', 'PREP 8.0', 'PREP Educational Products, Inc.'],
  ['four_lenses', '4 Lenses', 'Four Lenses / Shipley Communication'],
  ['safetalk', 'safeTALK', 'LivingWorks'],
  ['asist', 'ASIST', 'LivingWorks'],
  ['safetalk_t4t', 'safeTALK T4T', 'LivingWorks'],
  ['asist_t4t', 'ASIST T4T', 'LivingWorks'],
];
for (const [code, name, source] of verified) {
  assert(migration.includes(`('${code}', '${name}', '${source}')`), `${name} keeps its verified authority default`);
}
const unresolved = [
  'Marriage Enrichment Retreat',
  'Family Enrichment Retreat',
  'Personal Growth Retreat',
  'CliftonStrengths, Strengths Discovery Encounter',
  'Navigating Your Next Chapter',
];
for (const name of unresolved) {
  assert(!migration.includes(name), `${name} stays without an invented authority default`);
}
assert(migration.includes('v_count <> 7'), 'the migration updates only the seven verified products');
assert(migration.includes('product.code = catalog.code') && migration.includes('product.name = catalog.name'), 'defaults match the existing product code and exact name');
assert(!/facilitator_qualifications/i.test(migration), 'qualification rows are not changed');
assert(!/save_facilitator_qualification|create\s+(or\s+replace\s+)?function|create\s+policy|grant\s+|revoke\s+|enable\s+row\s+level\s+security|rule_family/i.test(migration), 'RPCs, permissions, RLS, and rule_family stay unchanged');
assert(!/\binsert\s+into\b/i.test(migration), 'the migration does not insert products');

assert(facilitatorRead.includes(".select('id, name, code, active, sort_order, governing_source')"), 'the facilitator product fetch loads governing_source');
assert(facilitatorRead.includes('id, person_id, product_id, standing, t4t_completed_on, first_facilitated_on, trainer_authority, expiration_on, governing_source, notes'), 'qualification rows still load their own governing_source');
assert(model.includes('governingSource: cleanText(product.governing_source ?? product.governingSource)'), 'the product catalog keeps the loaded authority default');

assert(facilitatorProductAuthorityDefault({ governing_source: ' LivingWorks ' }) === 'LivingWorks', 'a product default is trimmed');
assert(facilitatorProductAuthorityDefault({ governing_source: null }) === '', 'a null product default stays blank');
assert(facilitatorProductAuthorityDefault({ name: 'Marriage Enrichment Retreat' }) === '', 'a product without governing_source has no default');

const suggested = nextQualificationSourceSuggestion({
  origin: 'empty',
  currentValue: '',
  productDefault: 'LivingWorks',
});
assert(suggested.value === 'LivingWorks' && suggested.origin === 'suggested', 'a new qualification autofills a verified default');
const blank = nextQualificationSourceSuggestion({
  origin: 'empty',
  currentValue: '',
  productDefault: '',
});
assert(blank.value === '' && blank.origin === 'empty', 'a new qualification stays blank when the product has no default');
const manual = nextQualificationSourceSuggestion({
  origin: 'manual',
  currentValue: 'Command record',
  productDefault: 'The Gottman Institute',
});
assert(manual.value === 'Command record' && manual.origin === 'manual', 'a manual source survives a later product change');
const manualBlank = nextQualificationSourceSuggestion({
  origin: 'manual',
  currentValue: '',
  productDefault: 'LivingWorks',
});
assert(manualBlank.value === '' && manualBlank.origin === 'manual', 'a source the user cleared is not refilled');
const replaced = nextQualificationSourceSuggestion({
  origin: 'suggested',
  currentValue: 'LivingWorks',
  productDefault: 'PREP Educational Products, Inc.',
});
assert(replaced.value === 'PREP Educational Products, Inc.' && replaced.origin === 'suggested', 'an untouched suggestion follows the newly selected product');
const cleared = nextQualificationSourceSuggestion({
  origin: 'suggested',
  currentValue: 'LivingWorks',
  productDefault: '   ',
});
assert(cleared.value === '' && cleared.origin === 'empty', 'an untouched suggestion clears when the next product has no default');
const stored = nextQualificationSourceSuggestion({
  origin: 'stored',
  currentValue: 'Historical office',
  productDefault: 'LivingWorks',
});
assert(stored.value === 'Historical office' && stored.origin === 'stored', 'an existing qualification source is not replaced by the product default');
const storedBlank = nextQualificationSourceSuggestion({
  origin: 'stored',
  currentValue: '',
  productDefault: 'LivingWorks',
});
assert(storedBlank.value === '' && storedBlank.origin === 'stored', 'a blank historical source is not backfilled');

assert(editor.includes("qualificationSourceOrigin = creating ? 'empty' : 'stored'"), 'editing starts from the stored source instead of a suggestion');
assert(editor.includes('source.value = qualification?.governingSource || \'\''), 'the editor loads the qualification source that is already stored');
assert(editor.includes("qualificationSourceOrigin = 'manual'"), 'typing marks the source as manually entered');
assert(editor.includes('nextQualificationSourceSuggestion') && editor.includes('if (productSelect)'), 'only the new-qualification product control can suggest a source');
const fixedProduct = editor.slice(
  editor.indexOf('facilitator-qualification-product-fixed'),
  editor.indexOf("standing.id = 'facilitator-qualification-standing'"),
);
assert(!fixedProduct.includes('nextQualificationSourceSuggestion'), 'the fixed edit product does not suggest a source');
assert(editor.includes("source.id = 'facilitator-qualification-source'") && editor.includes("source.type = 'text'"), 'the authority source remains an editable text field');

const saved = facilitatorQualificationSaveInput({
  personId: 'ada',
  productId: 'safetalk',
  standing: 'registered',
  governingSource: ' LivingWorks ',
});
assert(saved.ok === true && saved.value.governingSource === 'LivingWorks', 'save still normalizes the qualification-level source');
const blankSaved = facilitatorQualificationSaveInput({
  personId: 'ada',
  productId: 'retreat',
  standing: 'developing',
  governingSource: '   ',
});
assert(blankSaved.value.governingSource === '', 'a blank qualification source still normalizes to empty before null');
assert(saveWrapper.includes("p_governing_source: qualification?.governingSource || null"), 'save still sends facilitator_qualifications.governing_source');
assert(saveWrapper.includes(".rpc('save_facilitator_qualification'"), 'save still uses the existing qualification RPC');
assert(!saveWrapper.includes(".from('facilitator_qualifications')"), 'the browser still does not write qualification rows directly');

if (errors.length) {
  console.error('validate-facilitator-qualification-authority-defaults failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-qualification-authority-defaults: ok');
