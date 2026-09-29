/**
 * Stage 5C AAR curriculum inheritance checks.
 * Run: node scripts/validate-stage-5c-aar-curriculum.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { aarCurriculumDisplayName } from '../js/aar-curriculum.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const choices = [
  { productId: 'gottman', name: 'Gottman, Seven Principles of Making Marriage Work', eventTypeName: 'Marriage Enrichment Workshop' },
  { productId: 'prep', name: 'PREP 8.0', eventTypeName: 'Marriage Enrichment Workshop' },
  { productId: 'lenses', name: '4 Lenses', eventTypeName: 'Personal Growth Workshop' },
  { productId: 'strengths', name: 'CliftonStrengths, Strengths Discovery Encounter', eventTypeName: 'Personal Growth Workshop' },
  { productId: 'chapter', name: 'Navigating Your Next Chapter', eventTypeName: 'Personal Growth Workshop' },
  { productId: 'blank-name', name: '   ', eventTypeName: 'Personal Growth Workshop' },
];

assert(aarCurriculumDisplayName('gottman', choices) === 'Gottman, Seven Principles of Making Marriage Work', 'a resolved Gottman curriculum uses the current product name');
assert(aarCurriculumDisplayName('prep', choices) === 'PREP 8.0', 'a resolved PREP curriculum uses the current product name');
assert(aarCurriculumDisplayName('lenses', choices) === '4 Lenses', 'a resolved 4 Lenses curriculum uses the current product name');
assert(aarCurriculumDisplayName('strengths', choices) === 'CliftonStrengths, Strengths Discovery Encounter', 'a resolved CliftonStrengths curriculum uses the current product name');
assert(aarCurriculumDisplayName('chapter', choices) === 'Navigating Your Next Chapter', 'a resolved Navigating Your Next Chapter curriculum uses the current product name');
assert(aarCurriculumDisplayName(null, choices) === null, 'a null curriculum is omitted');
assert(aarCurriculumDisplayName('', choices) === null, 'a blank curriculum is omitted');
assert(aarCurriculumDisplayName('   ', choices) === null, 'whitespace is omitted');
assert(aarCurriculumDisplayName('missing-product', choices) === null, 'an unresolved curriculum id is omitted');
assert(aarCurriculumDisplayName('blank-name', choices) === null, 'a blank product name is omitted');
assert(aarCurriculumDisplayName('gottman', []) === null, 'curriculum display is absent when Stage 5B choices are unavailable');
assert(aarCurriculumDisplayName('asist-id', [{ productId: 'asist-id', name: 'ASIST', eventTypeName: 'ASIST Workshop' }]) === 'ASIST', 'a name is shown only for the stored product id');
assert(aarCurriculumDisplayName(null, [{ productId: 'asist-id', name: 'ASIST', eventTypeName: 'ASIST Workshop' }]) === null, 'an Event Type alone does not create a curriculum label');

const model = read('js/aar-curriculum.js');
const app = read('js/app.js');
const db = read('js/db.js');
const html = read('index.html');
const pdf = read('js/aar-pdf-export.js');
const facilitator = read('js/facilitator-management.js');
const aarStart = html.indexOf('id="aar-report-article"');
const aarArticle = html.slice(aarStart, html.indexOf('</article>', aarStart));
const placeholderPattern = /Unknown|Unspecified|Not Selected|Not Identified|Specific product not yet identified|N\/A|\bNone\b|—/;

assert(!placeholderPattern.test(model), 'curriculum display does not invent placeholder wording');
assert(!model.includes('eventType'), 'curriculum display is not inferred from Event Type');
assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(model), 'curriculum display does not hard-code product UUIDs');
assert(model.includes('choice?.productId === productId'), 'the display name comes from the loaded product id');
assert(!aarArticle.includes('Curriculum / Product'), 'the AAR template has no standing curriculum row');
assert(!/<(select|input)\b/i.test(aarArticle), 'the AAR template has no curriculum input');
assert(app.includes('function syncAarCurriculumRow'), 'the open AAR syncs the inherited curriculum');
assert(app.includes('syncAarCurriculumRow(event, root)'), 'AAR population refreshes the inherited curriculum');
assert(app.includes('aarCurriculumDisplayName(event?.curriculumProductId, eventCurriculumChoices)'), 'the AAR resolves the parent Event curriculum against Stage 5B choices');
assert(app.includes("if (!name) return;"), 'a missing curriculum removes the display instead of leaving a label');
assert(app.includes("label.textContent = 'Curriculum / Product'"), 'a present curriculum uses the Curriculum / Product label');
assert(app.includes('value.textContent = name'), 'the displayed value is the resolved product name');
assert(!/<(select|input)[^>]*curriculum/i.test(app), 'the AAR does not create a curriculum input');
assert(!app.includes('aar_curriculum'), 'the AAR does not store its own curriculum');
assert(!db.includes('aar_curriculum'), 'no AAR curriculum column is written');
assert(!pdf.includes('curriculum_product_id'), 'the PDF exporter does not query or store curriculum');
assert(app.includes('populateAarDocument(event, { root: article, editable: false })'), 'AAR PDF export renders the same inherited document');

const aarFieldUpdate = db.slice(db.indexOf('export async function updateEventAarFields'), db.indexOf('export async function clearEventAar'));
assert(!aarFieldUpdate.includes('curriculum_product_id'), 'AAR field saves do not send curriculum_product_id');

let migrationDiff = '';
let eventCurriculumDiff = '';
let aarCurriculumDiff = '';
try {
  migrationDiff = execFileSync('git', ['diff', '--', 'supabase/migrations/023_facilitator_product_taxonomy_correction.sql'], { cwd: ROOT, encoding: 'utf8' });
  eventCurriculumDiff = execFileSync('git', ['diff', '--', 'js/event-curriculum.js'], { cwd: ROOT, encoding: 'utf8' });
  aarCurriculumDiff = execFileSync('git', ['diff', '--', 'js/aar-curriculum.js'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}
assert(migrationDiff.trim() === '', 'Migration 023 is unchanged');
assert(!facilitator.includes('curriculum_product_id'), 'Facilitator Management does not read Event curriculum');
assert(aarCurriculumDiff.trim() === '', 'Stage 5C AAR curriculum display is unchanged');
assert(eventCurriculumDiff.trim() === '', 'Stage 5B curriculum choice behavior is unchanged');
const migrationNames = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
assert(!migrationNames.some((name) => name.startsWith('024')), 'Stage 5C adds no migration');
assert(!app.includes('manualExperience') && !app.includes('qualification management'), 'Stage 5C does not add manual experience or qualification management');

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
  console.error('validate-stage-5c-aar-curriculum failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-5c-aar-curriculum: ok');
