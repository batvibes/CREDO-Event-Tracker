/**
 * Row-level Delete Person shortcuts for the personnel directory and Facilitators list.
 * Run: node scripts/validate-personnel-row-delete.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { personnelLifecycleCopy } from '../js/team-personnel-editor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : '';
}

const directory = read('js/team-personnel-directory.js');
const app = read('js/app.js');
const html = read('index.html');
const editor = read('js/team-personnel-editor.js');

const button = sliceBetween(directory, 'export function createPersonnelRowDeleteButton', 'function appendEditButton');
assert(button.includes("button.textContent = '×'"), 'the row control is a subdued multiplication sign');
assert(button.includes('aria-label`, `Delete ${identity}`') || button.includes('`Delete ${identity}`'), 'the row control names the person');
assert(button.includes("button.title = 'Delete person'"), 'the row control offers a Delete person tooltip');
assert(button.includes('event.stopPropagation()'), 'the row control does not activate the rest of the row');
assert(button.includes('onRequestDelete?.(person)'), 'the row control asks for confirmation instead of deleting immediately');
assert(!button.includes('onEdit') && !button.includes('openPersonnelEditor') && !button.includes('deleteDirectoryPerson'), 'the row control does not edit or delete by itself');

const compact = sliceBetween(directory, 'function renderCompactDirectory', 'function staffCellText');
assert(compact.includes('appendActionCell(row, person, onEdit, \'div\')'), 'Points of Contact still renders Edit');
assert(compact.includes('appendDeleteCell(row, person, onDelete, \'div\')'), 'every editable Points of Contact row can render one delete control');
assert(sliceBetween(directory, 'function appendDeleteCell', 'function appendActionCell').includes('createPersonnelRowDeleteButton(person, onDelete)'), 'the directory delete control is the shared button');

const gate = directory.slice(directory.indexOf('const onDelete'), directory.indexOf('panel.replaceChildren()'));
assert(gate.includes("selectedTab === 'poc'") && gate.includes('options.onDelete'), 'the directory delete control is limited to Points of Contact');
assert(!sliceBetween(directory, 'function renderStaffDirectory', 'export function renderTeamDirectoryView').includes('appendDeleteCell'), 'CREDO Staff rows keep Edit without a row delete control');

const request = sliceBetween(app, 'function requestPersonnelDeletion', 'function cancelPersonnelDeletion');
const cancel = sliceBetween(app, 'function cancelPersonnelDeletion', 'async function confirmPersonnelDeletion');
const confirm = sliceBetween(app, 'async function confirmPersonnelDeletion', 'function bindPersonnelDeleteModal');
const deletion = sliceBetween(app, 'async function applyPersonnelDeletion', 'function openFacilitatorDetail');
const paint = sliceBetween(app, 'function paintFacilitatorPersonnel', 'function appendDetailLine');

assert(request.includes("personnelLifecycleCopy(person, 'delete')"), 'row deletion uses the shared Delete Person confirmation');
assert(!request.includes('applyPersonnelDeletion') && !request.includes('deleteDirectoryPerson'), 'opening confirmation does not delete the person');
assert(cancel.includes('personnel-delete-modal') && !cancel.includes('applyPersonnelDeletion') && !cancel.includes('deleteDirectoryPerson'), 'Cancel closes the confirmation and changes nothing');
assert(confirm.includes('await applyPersonnelDeletion(person.id)'), 'Confirm uses the existing delete handler');
assert(confirm.includes('This person could not be deleted.') && confirm.includes('personnel-delete-message'), 'a failed delete shows an error and leaves the confirmation open');
assert(!confirm.slice(confirm.indexOf('} catch (error) {')).includes('.close()'), 'a failed delete does not dismiss the confirmation');

assert(deletion.includes('deleteDirectoryPerson(id)'), 'row confirmation and profile deletion share delete_directory_person');
assert(deletion.includes('renderFacilitatorManagement()') && deletion.includes('renderTeam()'), 'a successful delete refreshes Facilitator Management and the personnel directory');
assert(app.includes('paintFacilitatorProgramCapabilities()'), 'Program Capabilities still refreshes with facilitator data');
assert(app.includes('onDelete: requestPersonnelDeletion'), 'the directory row uses the shared confirmation');
assert(paint.includes('createPersonnelRowDeleteButton(person, requestPersonnelDeletion)'), 'every facilitator row can render one delete control');
assert(paint.includes("event.target.closest('.personnel-row-delete')") && paint.includes('event.stopPropagation()'), 'clicking the facilitator control does not open the profile');
assert(html.includes('id="personnel-delete-modal"'), 'confirmation uses one dialog');
assert(html.includes('id="personnel-delete-cancel"') && html.includes('id="personnel-delete-confirm"'), 'confirmation offers Cancel and Delete Person');
assert(html.includes('class="personnel-row-delete-head"'), 'the Facilitators table reserves the far-right delete column');
assert(editor.includes("if (action === 'delete') await onDelete(person.id)"), 'profile and editor Delete Person still confirm through the same delete callback');
assert(editor.includes('Archive this person? They leave the active directory'), 'Archive remains a separate action');

const copy = personnelLifecycleCopy({ rankTitle: 'Chaplain', name: 'Adams' }, 'delete');
assert(copy.title === 'Delete Chaplain Adams?', 'confirmation names the person');
assert(copy.confirm === 'Delete Person', 'confirmation is labeled Delete Person');
assert(copy.body.includes('Historical event text will remain'), 'confirmation keeps historical event text');

if (errors.length) {
  console.error(`validate-personnel-row-delete: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-personnel-row-delete: ok');
