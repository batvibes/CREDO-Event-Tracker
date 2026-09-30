/**
 * Facilitator qualification entry and editing checks.
 * Run: node scripts/validate-facilitator-qualification-editing.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACILITATOR_STANDING_OPTIONS,
  facilitatorQualificationProductChoices,
  facilitatorQualificationSaveInput,
  summarizeFacilitatorPersonnel,
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

const app = read('js/app.js');
const db = read('js/db.js');
const model = read('js/facilitator-management.js');
const migrationNames = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
const detail = app.slice(app.indexOf('function openFacilitatorDetail'), app.indexOf('function closeFacilitatorDetail'));
const managerOpen = app.slice(app.indexOf('function openFacilitatorQualificationManager'), app.indexOf('async function renderFacilitatorManagement'));
const editor = app.slice(app.indexOf('function paintFacilitatorQualificationEditor'), app.indexOf('function cancelFacilitatorQualificationEdit'));
const cancel = app.slice(app.indexOf('function cancelFacilitatorQualificationEdit'), app.indexOf('async function submitFacilitatorQualification'));
const submit = app.slice(app.indexOf('async function submitFacilitatorQualification'), app.indexOf('function openFacilitatorQualificationManager'));
const saveWrapper = db.slice(db.indexOf('export async function saveFacilitatorQualification'), db.indexOf('function personnelRpcError'));
const facilitatorRead = db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf('export async function fetchTeamDirectoryPersonnel'));
const overview = model.slice(model.indexOf('export function buildFacilitatorOverview'), model.indexOf('export function buildFacilitatorProgramCapabilities'));
const capabilities = model.slice(model.indexOf('export function buildFacilitatorProgramCapabilities'), model.indexOf('export function filterFacilitatorProgramCapabilities'));

assert(facilitatorRead.includes('standing, t4t_completed_on, first_facilitated_on, trainer_authority, expiration_on, governing_source, notes'), 'qualification profile fields still load');
assert(detail.includes('canEditEvents()') && detail.includes('Manage Qualifications'), 'admin and editor users can open Manage Qualifications');
assert(managerOpen.includes('if (!canEditEvents()) return'), 'viewer users cannot open qualification editing');
assert(!detail.includes('saveFacilitatorQualification'), 'the read-only profile does not save');

const products = [
  { id: 'retired', name: 'Marriage Enrichment Workshop', code: 'marriage_enrichment_workshop', sort_order: 101, active: false },
  { id: 'lenses', name: '4 Lenses', code: 'four_lenses', sort_order: 6, active: true },
  { id: 'gottman', name: 'Gottman, Seven Principles of Making Marriage Work', code: 'gottman_seven_principles', sort_order: 4, active: true },
  { id: 'prep', name: 'PREP 8.0', code: 'prep_8_0', sort_order: 5, active: true },
];
const choices = facilitatorQualificationProductChoices(products, [{ productId: 'prep' }]);
assert(choices.map((product) => product.name).join('|') === 'Gottman, Seven Principles of Making Marriage Work|4 Lenses', 'new qualifications offer the remaining active products in catalog order');
assert(!choices.some((product) => product.id === 'retired' || product.id === 'prep'), 'inactive products and existing qualifications are not offered again');
assert(editor.includes('facilitator-qualification-product-fixed') && editor.includes('qualification.productId'), 'an existing qualification keeps its product fixed');
assert(editor.includes('id = \'facilitator-qualification-product\'') && editor.includes('facilitatorQualificationProductChoices'), 'a new qualification chooses from the eligible active catalog');
assert(submit.includes('qualification?.productId'), 'editing submits the existing product id');
assert(submit.includes('A qualification record already exists for that product.'), 'a second qualification for the same product is refused before save');

assert(FACILITATOR_STANDING_OPTIONS.map((option) => option[0]).join('|') === 'developing|provisional|registered|inactive', 'standing stays limited to the four stored values');
assert(!model.includes("'qualified'") && !editor.includes('Qualified'), 'Qualified is not added as a standing');
const manual = facilitatorQualificationSaveInput({
  personId: 'ada',
  productId: 'lenses',
  standing: 'developing',
  t4tCompletedOn: '2026-05-18',
  firstFacilitatedOn: '2019-04-01',
  firstRecordedOn: '2024-03-01',
  trainerAuthority: false,
  expirationOn: '2027-01-15',
  governingSource: ' LivingWorks ',
  notes: ' Attended the applicable T4T.\n',
});
assert(manual.ok === true, 'a complete manual qualification can be prepared');
assert(manual.value.standing === 'developing', 'a T4T completion date does not change standing');
assert(manual.value.t4tCompletedOn === '2026-05-18', 'T4T Completed is saved from its own date');
assert(manual.value.trainerAuthority === false, 'T4T completion does not grant trainer authority');
assert(manual.value.firstFacilitatedOn === '2019-04-01', 'First Facilitated is the manual qualification date');
assert(manual.value.firstFacilitatedOn !== '2024-03-01', 'the Event-derived first date is not copied into the qualification');
assert(manual.value.expirationOn === '2027-01-15', 'Expiration is saved from its own date');
assert(manual.value.governingSource === 'LivingWorks' && manual.value.notes === 'Attended the applicable T4T.', 'governing source and notes are saved from their own fields');
const authority = facilitatorQualificationSaveInput({
  personId: 'ada',
  productId: 'lenses',
  standing: 'provisional',
  trainerAuthority: true,
});
assert(authority.value.trainerAuthority === true && authority.value.standing === 'provisional', 'trainer authority is saved from its own control');
assert(facilitatorQualificationSaveInput({ personId: 'ada', productId: 'lenses', standing: 'qualified', t4tCompletedOn: '2026-05-18' }).ok === false, 'an unrecognized standing is rejected');
assert(facilitatorQualificationSaveInput({ personId: 'ada', productId: 'lenses', standing: '', t4tCompletedOn: '2026-05-18' }).ok === false, 'a T4T date does not default standing to Provisional');

assert(saveWrapper.includes(".rpc('save_facilitator_qualification'"), 'saves go through save_facilitator_qualification');
assert(!saveWrapper.includes(".from('facilitator_qualifications')") && !/\.(insert|update|delete|upsert)\(/.test(saveWrapper), 'the browser does not write facilitator_qualifications directly');
assert(!app.includes(".from('facilitator_qualifications')"), 'the application shell does not write qualification rows directly');
assert(!cancel.includes('saveFacilitatorQualification'), 'Cancel does not call the save RPC');
assert(submit.includes('renderFacilitatorManagement') && submit.includes('openFacilitatorDetail'), 'a successful save reloads Facilitator Management and refreshes the profile');
assert(!/delete qualification|deleteFacilitatorQualification/i.test(`${app}\n${db}\n${model}`), 'qualification deletion was not added');

const personnel = summarizeFacilitatorPersonnel(
  [{ id: 'ada', name: 'Ada', active: true, is_facilitator: true }],
  [{ person_id: 'ada', product_id: 'lenses', events_conducted: 2, first_recorded_facilitation_on: '2024-03-01', most_recent_facilitation_on: '2026-05-01' }],
  [],
  products,
);
assert(personnel[0].experience[0].firstRecordedOn === '2024-03-01', 'recorded experience remains the derived date');
assert(detail.includes('row.firstRecordedOn') && !detail.slice(detail.indexOf('FACILITATOR_EXPERIENCE_HEADING')).includes('createElement(\'button\')'), 'Recorded Facilitation Experience stays read-only');
assert(!model.includes(".from('events')") && !facilitatorRead.includes(".from('events')"), 'Facilitator Management does not read Events directly');
assert(app.includes('facilitatorProductFilterOptions(facilitatorProducts)'), 'the Personnel product filter still uses the active catalog');
assert(!overview.includes('standing') && !overview.includes('expiration'), 'Needs Attention and coverage do not gain qualification alerts');
assert(!capabilities.includes('trainer_authority') && !capabilities.includes('expiration'), 'Program Capabilities does not edit qualifications');
assert(migrationNames.includes('025_facilitator_t4t_product_experience.sql'), 'T4T facilitation experience migration 025 is present');
assert(!migrationNames.some((name) => /^0(2[6-9]|[3-9]\d)_/.test(name)), 'no migration after 025 was added');

if (errors.length) {
  console.error('validate-facilitator-qualification-editing failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-qualification-editing: ok');
