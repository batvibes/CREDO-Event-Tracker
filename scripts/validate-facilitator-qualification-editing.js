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
  facilitatorQualificationDisplayFields,
  facilitatorQualificationProductChoices,
  facilitatorQualificationSaveInput,
  qualificationT4tHistoryRecord,
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
assert(saveWrapper.includes('p_trainer_authority: qualification?.trainerAuthority === true'), 'save still sends the instructor flag from its own boolean');
assert(!saveWrapper.includes(".from('facilitator_qualifications')") && !/\.(insert|update|delete|upsert)\(/.test(saveWrapper), 'the browser does not write facilitator_qualifications directly');
assert(!app.includes(".from('facilitator_qualifications')"), 'the application shell does not write qualification rows directly');
assert(!cancel.includes('saveFacilitatorQualification'), 'Cancel does not call the save RPC');
assert(submit.includes('renderFacilitatorManagement') && submit.includes('openFacilitatorDetail'), 'a successful save reloads Facilitator Management and refreshes the profile');
assert(submit.includes('qualificationT4tHistoryRecord') && submit.includes('recordFacilitatorT4tCompletion'), 'a saved T4T Completed date ensures completion history through the existing RPC');
assert(submit.includes('T4T_COMPLETION_DUPLICATE'), 'an equivalent history row is left in place');
assert(submit.includes('The qualification was saved, but the T4T completion history could not be recorded.'), 'a history failure stays visible after the qualification save');
assert(!submit.includes('deleteFacilitatorT4t') && !submit.includes(".from('facilitator_t4t_completions')"), 'qualification editing does not delete or rewrite completion history');
assert(!read('js/t4t-completion-entry.js').includes('qualificationT4tHistoryRecord'), 'event-driven attendance does not use the qualification history path');

const jane = { personId: 'jane', productId: 'asist', productCode: 'asist', t4tCompletedOn: '2024-04-10', governingSource: 'LivingWorks', notes: 'Legacy qualification note.' };
const created = qualificationT4tHistoryRecord(jane, []);
assert(created?.completedOn === '2024-04-10' && created.sourceEventId === null && created.governingSource === 'LivingWorks' && created.notes === null, 'a new T4T Completed date plans one manual history row');
assert(!Object.prototype.hasOwnProperty.call(created, 'standing') && !Object.prototype.hasOwnProperty.call(created, 'active'), 'the history plan does not change standing or reactivate a person');
assert(qualificationT4tHistoryRecord(jane, [{ personId: 'jane', productId: 'asist', completedOn: '2024-04-10' }]) === null, 'saving the same date again does not plan another row');
assert(qualificationT4tHistoryRecord(jane, [{ person_id: 'jane', product_id: 'asist', completed_on: '2024-04-10', source_event_id: 'event-1', governing_source: 'LivingWorks' }]) === null, 'an event-driven row for the same date blocks a second row');
const changed = qualificationT4tHistoryRecord({ ...jane, t4tCompletedOn: '2026-05-12' }, [{ personId: 'jane', productId: 'asist', completedOn: '2024-04-10' }]);
assert(changed?.completedOn === '2026-05-12' && changed.sourceEventId === null, 'a changed qualification date appends a new history row');
assert(qualificationT4tHistoryRecord({ ...jane, t4tCompletedOn: '' }, [{ personId: 'jane', productId: 'asist', completedOn: '2024-04-10' }]) === null, 'clearing the qualification date plans no history change');
assert(qualificationT4tHistoryRecord({ ...jane, t4tCompletedOn: null, governingSource: '' }, []) === null, 'a blank T4T Completed date creates nothing');
assert(qualificationT4tHistoryRecord({ ...jane, governingSource: '  ' }, []).governingSource === null, 'a blank governing source is not invented');
assert(submit.includes('productCode: facilitatorProducts.find'), 'qualification history uses the saved product code before calling the record RPC');
assert(submit.indexOf('saveFacilitatorQualification') < submit.indexOf('qualificationT4tHistoryRecord'), 'the qualification still saves before any history decision');
for (const productCode of ['safetalk', 'gottman_seven_principles', 'prep_8_0', 'four_lenses', 'cliftonstrengths_strengths_discovery_encounter', 'navigating_your_next_chapter']) {
  const planned = qualificationT4tHistoryRecord({ ...jane, productCode }, []);
  assert(planned?.productId === jane.productId && planned.completedOn === '2024-04-10' && planned.sourceEventId === null, `${productCode} with a T4T date plans completion history`);
}
for (const productCode of ['safetalk_t4t', 'asist_t4t', 'marriage_enrichment_retreat', 'family_enrichment_retreat', 'personal_growth_retreat', 'marriage_enrichment_workshop']) {
  assert(qualificationT4tHistoryRecord({ ...jane, productCode }, []) === null, `${productCode} with a T4T date does not plan completion history`);
}
assert(qualificationT4tHistoryRecord({ ...jane, productCode: '' }, []) === null, 'a qualification without a completion-target code does not plan history');

const hiddenInstructor = facilitatorQualificationDisplayFields({ trainerAuthority: false, t4tCompletedOn: '2026-05-18', standing: 'developing' });
assert(!hiddenInstructor.some((field) => field.label === 'Train-the-Trainer Instructor'), 'a false instructor flag stays omitted from the profile');
const shownInstructor = facilitatorQualificationDisplayFields({ trainerAuthority: true, standing: 'registered' });
assert(shownInstructor.find((field) => field.label === 'Train-the-Trainer Instructor')?.value === 'Yes', 'a true instructor flag renders Yes');
assert(editor.includes('Train-the-Trainer Instructor'), 'the checkbox label is Train-the-Trainer Instructor');
assert(editor.includes("authority.id = 'facilitator-qualification-authority'") && editor.includes("authority.type = 'checkbox'"), 'the instructor control stays the existing checkbox');
assert(editor.includes('Indicates this facilitator is qualified to conduct Train-the-Trainer instruction for this product.'), 'the instructor checkbox has its helper text');
assert(!editor.includes('Trainer / T4T Authority'), 'the old trainer authority label is gone from the editor');

const qualificationList = app.slice(app.indexOf('function paintFacilitatorQualificationList'), app.indexOf('function paintFacilitatorQualificationEditor'));
const removal = app.slice(app.indexOf('function paintFacilitatorQualificationRemoval'), app.indexOf('async function confirmFacilitatorQualificationRemoval'));
const removalConfirm = app.slice(app.indexOf('async function confirmFacilitatorQualificationRemoval'), app.indexOf('function openFacilitatorQualificationManager'));
const deleteWrapper = db.slice(db.indexOf('export async function deleteFacilitatorQualification'), db.indexOf('function personnelRpcError'));
const deleteMigration = read('supabase/migrations/027_facilitator_qualification_delete.sql');
const deleteBody = deleteMigration.slice(deleteMigration.indexOf('as $$'), deleteMigration.indexOf('$$;'));
assert(qualificationList.includes('facilitator-qualification-remove') && qualificationList.includes('paintFacilitatorQualificationRemoval'), 'Manage Qualifications can open removal for one row');
assert(!qualificationList.includes('deleteFacilitatorQualification'), 'the list control does not delete before confirmation');
assert(!detail.includes('facilitator-qualification-remove') && !detail.includes('deleteFacilitatorQualification'), 'the read-only profile has no remove control');
assert(removal.includes("title.textContent = 'Remove Qualification'"), 'confirmation title is Remove Qualification');
assert(removal.includes('Remove ${productName} qualification for ${personName}? This removes the qualification record only. Recorded facilitation experience and personnel information will not be affected.'), 'confirmation explains that only the qualification record is removed');
assert(removal.includes("cancel.textContent = 'Cancel'") && removal.includes('paintFacilitatorQualificationList()'), 'Cancel returns to the qualification list');
assert(!removal.includes('deleteFacilitatorQualification') && !removal.includes('window.confirm'), 'Cancel does not delete and confirmation is inside the dialog');
assert(removalConfirm.includes('deleteFacilitatorQualification(qualification.id)'), 'confirmed removal calls the RPC with the qualification id');
assert(removalConfirm.includes('renderFacilitatorManagement') && removalConfirm.includes('openFacilitatorDetail') && removalConfirm.includes('paintFacilitatorQualificationList'), 'a successful removal reloads Facilitator Management and returns to the list');
const removalCatch = removalConfirm.slice(removalConfirm.indexOf('} catch'));
assert(!removalCatch.includes('paintFacilitatorQualificationList') && !removalCatch.includes('qualificationProducts'), 'a failed removal leaves the visible record in place');
assert(deleteWrapper.includes(".rpc('delete_facilitator_qualification'") && deleteWrapper.includes('p_qualification_id: id'), 'the browser deletes through delete_facilitator_qualification by id');
assert(!deleteWrapper.includes(".from('facilitator_qualifications')") && !/\.(insert|update|delete|upsert)\(/.test(deleteWrapper), 'the browser does not delete facilitator_qualifications directly');
assert(deleteMigration.includes('security definer') && deleteMigration.includes('set search_path = public'), 'the delete function is security definer with a fixed search path');
assert(deleteBody.includes('auth.uid() is null') && deleteBody.includes('public.can_edit_events()') && deleteBody.includes("errcode = '42501'"), 'delete requires an authenticated editor or admin');
assert(deleteBody.includes('delete from public.facilitator_qualifications') && deleteBody.includes('where id = p_qualification_id'), 'delete targets one qualification row by its primary key');
assert(deleteBody.includes("hint = 'QUALIFICATION_NOT_FOUND'"), 'a missing qualification id raises not found');
assert(!/delete\s+from\s+public\.(people|facilitator_products|events|facilitator_product_experience|facilitator_t4t_product_experience)\b/i.test(deleteBody), 'delete does not remove people, products, events, or experience');
assert(!/where\s+(person_id|product_id)\b/i.test(deleteBody), 'delete does not select a row by person or product');
assert(deleteMigration.includes('revoke all on function public.delete_facilitator_qualification(uuid) from public') && deleteMigration.includes('revoke all on function public.delete_facilitator_qualification(uuid) from anon') && deleteMigration.includes('grant execute on function public.delete_facilitator_qualification(uuid) to authenticated'), 'only authenticated users can execute the delete function');

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
assert(migrationNames.includes('026_facilitator_product_authority_defaults.sql'), 'verified product authority defaults use migration 026');
assert(migrationNames.includes('027_facilitator_qualification_delete.sql'), 'qualification removal uses migration 027');
assert(migrationNames.includes('028_facilitator_t4t_completion_history.sql'), 'T4T completion history uses migration 028');
assert(!migrationNames.some((name) => /^0(29|[3-9]\d)_/.test(name)), 'no migration after 028 was added');

if (errors.length) {
  console.error('validate-facilitator-qualification-editing failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-qualification-editing: ok');
