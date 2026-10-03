/**
 * Personnel role removal and explicit person deletion.
 * Run: node scripts/validate-personnel-lifecycle.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeFacilitatorPersonnel } from '../js/facilitator-management.js';
import { filterTeamDirectory, mapTeamDirectoryPerson } from '../js/team-personnel-directory.js';
import {
  personnelLifecycleActions,
  personnelLifecycleCopy,
  personnelRoleRemovalValues,
} from '../js/team-personnel-editor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const both = {
  id: 'both',
  rankTitle: 'LT',
  firstName: 'Test',
  lastName: 'McTesterton',
  name: 'Test McTesterton',
  commandOrganization: 'Test Command',
  installation: 'Test Base',
  active: true,
  isFacilitator: true,
  isPoc: true,
  isCredoStaff: true,
  staffBilletOrRole: 'Director',
  staffPrdEaos: '2027',
};
const pocOnly = {
  ...both,
  id: 'poc-only',
  isFacilitator: false,
  isCredoStaff: false,
  staffBilletOrRole: '',
  staffPrdEaos: '',
};
const facilitatorOnly = {
  ...both,
  id: 'facilitator-only',
  isPoc: false,
  isCredoStaff: false,
  staffBilletOrRole: '',
  staffPrdEaos: '',
};

const removedPoc = personnelRoleRemovalValues(both, 'poc');
assert(removedPoc.id === 'both', 'removing the POC role keeps the same people.id');
assert(removedPoc.isPoc === false, 'removing the POC role clears only that flag');
assert(removedPoc.isFacilitator === true && removedPoc.isCredoStaff === true, 'removing the POC role keeps facilitator and CREDO Staff status');
assert(removedPoc.staffBilletOrRole === 'Director' && removedPoc.staffPrdEaos === '2027', 'removing the POC role keeps CREDO Staff details');
assert(removedPoc.firstName === 'Test' && removedPoc.lastName === 'McTesterton' && removedPoc.name === 'Test McTesterton', 'removing the POC role keeps the stored name');
assert(removedPoc.rankTitle === 'LT' && removedPoc.commandOrganization === 'Test Command', 'removing the POC role keeps rank and command');
assert(removedPoc.active === true, 'removing the POC role does not archive the person');

const removedFacilitator = personnelRoleRemovalValues(both, 'facilitator');
assert(removedFacilitator.id === 'both', 'removing facilitator status keeps the same people.id');
assert(removedFacilitator.isFacilitator === false, 'removing facilitator status clears only that flag');
assert(removedFacilitator.isPoc === true && removedFacilitator.isCredoStaff === true, 'removing facilitator status keeps POC and CREDO Staff status');
assert(removedFacilitator.staffBilletOrRole === 'Director', 'removing facilitator status keeps CREDO Staff details');
assert(removedFacilitator.active === true, 'removing facilitator status does not archive the person');
assert(personnelRoleRemovalValues(facilitatorOnly, 'facilitator').active === true, 'a facilitator-only person stays active when facilitator status is removed');

const removedPocOnly = personnelRoleRemovalValues(pocOnly, 'poc');
assert(removedPocOnly.id === 'poc-only' && removedPocOnly.isPoc === false, 'a POC-only removal clears the POC role and keeps the id');
assert(removedPocOnly.isFacilitator === false && removedPocOnly.isCredoStaff === false, 'a POC-only removal does not invent another role');
assert(removedPocOnly.active === true, 'a roleless person stays active after the POC role is removed');

const facilitatorActive = mapTeamDirectoryPerson({
  id: 'facilitator',
  name: 'Kept Facilitator',
  active: true,
  is_poc: false,
  is_facilitator: true,
});
const staffActive = mapTeamDirectoryPerson({
  id: 'staff',
  name: 'Kept Staff',
  active: true,
  is_poc: false,
  is_credo_staff: true,
});
const pocActive = mapTeamDirectoryPerson({
  id: 'poc',
  name: 'Kept Contact',
  active: true,
  is_poc: true,
  is_facilitator: true,
  is_credo_staff: true,
});
const roleless = mapTeamDirectoryPerson({
  id: 'roleless',
  name: 'Roleless Person',
  active: true,
  is_poc: false,
  is_facilitator: false,
  is_credo_staff: false,
});
const inactivePoc = mapTeamDirectoryPerson({
  id: 'inactive',
  name: 'Former Contact',
  active: false,
  is_poc: true,
});
const contacts = filterTeamDirectory([facilitatorActive, staffActive, pocActive, roleless, inactivePoc], 'poc').map((person) => person.id);
assert(contacts.includes('facilitator'), 'an active facilitator appears in Points of Contact');
assert(contacts.includes('staff'), 'an active staff member appears in Points of Contact');
assert(contacts.includes('poc'), 'an active person with the POC role appears in Points of Contact');
assert(contacts.includes('roleless'), 'an active roleless person appears in Points of Contact');
assert(!contacts.includes('inactive'), 'an inactive person stays out of Points of Contact');
const archived = mapTeamDirectoryPerson({ ...roleless, active: false });
assert(filterTeamDirectory([archived], 'poc').length === 0, 'archiving a person removes them from the active personnel directory');

const products = [{ id: 'safetalk', name: 'safeTALK', code: 'safetalk', active: true, sort_order: 1 }];
const currentFacilitator = summarizeFacilitatorPersonnel(
  [{ id: 'flag', name: 'Current Facilitator', active: true, is_facilitator: true, is_poc: true, is_credo_staff: false }],
  [{ person_id: 'flag', product_id: 'safetalk', events_conducted: 1, first_recorded_facilitation_on: '2024-01-01', most_recent_facilitation_on: '2024-06-01' }],
  [{ id: 'q-current', person_id: 'flag', product_id: 'safetalk', standing: 'current' }],
  products,
  [],
  [{ person_id: 'flag', product_id: 'safetalk', completed_on: '2024-01-01' }],
);
assert(currentFacilitator.map((person) => person.id).join(',') === 'flag', 'an explicit facilitator appears in Facilitator Management');
assert(currentFacilitator[0].eventsConducted === 1 && currentFacilitator[0].qualificationProducts.length === 1 && currentFacilitator[0].t4tCompletions.length === 1, 'history calculations remain for a current facilitator');

const qualified = summarizeFacilitatorPersonnel(
  [{ id: 'qual', name: 'Qualified Person', active: true, is_facilitator: false, is_poc: true, is_credo_staff: false }],
  [],
  [{ id: 'q1', person_id: 'qual', product_id: 'safetalk', standing: 'current' }],
  products,
);
assert(qualified.length === 1 && qualified[0].qualificationProducts.length === 1, 'a qualification alone includes the person');
assert(qualified[0].isFacilitator === false && qualified[0].isPoc === true, 'a retained qualification keeps the other roles');
const experienced = summarizeFacilitatorPersonnel(
  [{ id: 'exp', name: 'Experienced Person', active: true, is_facilitator: false, is_poc: false, is_credo_staff: true }],
  [{ person_id: 'exp', product_id: 'safetalk', events_conducted: 2, first_recorded_facilitation_on: '2024-01-01', most_recent_facilitation_on: '2024-06-01' }],
  [],
  products,
);
assert(experienced.length === 1 && experienced[0].eventsConducted === 2 && experienced[0].isCredoStaff === true, 'ordinary facilitation history alone includes the person and keeps CREDO Staff status');
const attended = summarizeFacilitatorPersonnel(
  [{ id: 'attended', name: 'T4T Person', active: true, is_facilitator: false, is_poc: true, is_credo_staff: true }],
  [],
  [],
  products,
  [],
  [{ person_id: 'attended', product_id: 'safetalk', completed_on: '2024-03-01' }],
);
assert(attended.length === 1 && attended[0].t4tCompletions.length === 1 && attended[0].isPoc === true && attended[0].isCredoStaff === true, 'T4T completion history alone includes the person and keeps the other roles');
const removedFromRoster = summarizeFacilitatorPersonnel(
  [{
    id: 'both',
    name: 'Test McTesterton',
    active: removedFacilitator.active,
    is_facilitator: removedFacilitator.isFacilitator,
    is_poc: removedFacilitator.isPoc,
    is_credo_staff: removedFacilitator.isCredoStaff,
  }],
  [{ person_id: 'both', product_id: 'safetalk', events_conducted: 3, most_recent_facilitation_on: '2024-06-01' }],
  [{ id: 'q2', person_id: 'both', product_id: 'safetalk', standing: 'current' }],
  products,
);
assert(removedFromRoster.length === 1 && removedFromRoster[0].isFacilitator === false, 'clearing the facilitator role leaves a historically evidenced person visible');
assert(removedFromRoster[0].isPoc === true && removedFromRoster[0].isCredoStaff === true, 'POC and CREDO Staff stay after the facilitator role is cleared');
assert(removedFromRoster[0].eventsConducted === 3 && removedFromRoster[0].qualificationProducts.length === 1, 'clearing the facilitator role does not delete history');
const t4tOnly = summarizeFacilitatorPersonnel(
  [{ id: 't4t-only', name: 'T4T Instructor', active: true, is_facilitator: false }],
  [],
  [],
  products,
  [{ person_id: 't4t-only', product_id: 'safetalk', events_conducted: 1, most_recent_facilitation_on: '2024-06-01' }],
);
assert(t4tOnly.length === 1 && t4tOnly[0].t4tExperience.length === 1, 'T4T facilitation evidence alone includes the person');
const deletedId = 'both';
const afterDelete = removedFromRoster.filter((person) => person.id !== deletedId);
assert(afterDelete.length === 0, 'deleting the person removes them from Facilitator Management');
assert(filterTeamDirectory([mapTeamDirectoryPerson({
  id: 'kept',
  name: 'Kept Person',
  active: true,
})], 'poc').every((person) => person.id !== deletedId), 'deleting the person removes them from Points of Contact');

assert(personnelLifecycleActions(pocOnly, 'team').join(',') === 'delete', 'the Team editor offers deletion and does not offer a Points of Contact removal');
assert(personnelLifecycleActions(both, 'team').join(',') === 'delete', 'the Team editor does not clear the facilitator role');
assert(personnelLifecycleActions(both, 'facilitator').join(',') === 'clear-facilitator,delete', 'Facilitator Management offers clearing the facilitator role and deletion');
assert(personnelLifecycleActions({ ...facilitatorOnly, isFacilitator: false }, 'facilitator').join(',') === 'delete', 'the facilitator role action is hidden when that role is already off');
assert(!personnelLifecycleActions(both, 'facilitator').includes('remove-poc'), 'Facilitator Management does not offer a Points of Contact removal');

const deleteCopy = personnelLifecycleCopy({ rankTitle: 'LT', name: 'Test McTesterton' }, 'delete');
assert(deleteCopy.title === 'Delete LT Test McTesterton?', 'deletion names the person');
assert(deleteCopy.body === 'This permanently removes this personnel record. Any roles, qualifications, aliases, and linked personnel data may also be removed. Historical event information may be affected.', 'deletion explains the impact');
assert(deleteCopy.confirm === 'Delete Person', 'deletion is labeled Delete Person');
assert(personnelLifecycleCopy(pocOnly, 'remove-poc') === null, 'there is no Points of Contact removal confirmation');
const facilitatorCopy = personnelLifecycleCopy(both, 'clear-facilitator');
assert(facilitatorCopy.confirm === 'Clear Facilitator Role', 'the facilitator action clears the role');
assert(facilitatorCopy.body.includes('qualifications, and facilitation history stay'), 'clearing the facilitator role keeps qualifications and history');
assert(facilitatorCopy.body.includes('remain in Facilitator Management when that history exists'), 'clearing the role does not promise removal from Facilitator Management');
assert(!facilitatorCopy.body.includes('leave the Facilitator Management'), 'the confirmation does not claim the person leaves Facilitator Management');

const editor = read('js/team-personnel-editor.js');
const app = read('js/app.js');
const db = read('js/db.js');
const fields = read('js/event-reference-fields.js');
const migration = read('supabase/migrations/037_delete_directory_person.sql');
assert(!editor.includes('Point of Contact'), 'the personnel editor has no Point of Contact role control');
assert(!editor.includes('Remove from Points of Contact') && !editor.includes('remove-poc'), 'the editor does not offer removal from Points of Contact');
assert(!editor.includes('Remove Facilitator'), 'the editor does not offer a misleading Remove Facilitator action');
assert(editor.includes('Clear Facilitator Role'), 'Facilitator Management can clear the facilitator role');
assert(editor.includes('Archive this person? They leave the active directory'), 'archive still removes the person from the active directory');
assert(editor.includes('onArm?.(action)'), 'the first lifecycle click only asks for confirmation');
assert(editor.includes("confirm.className = pendingAction === 'delete' ? 'btn btn-danger' : 'btn btn-primary'"), 'Delete Person is confirmed with a separate destructive button');
assert(editor.includes("if (action === 'delete') await onDelete(person.id)"), 'the editor deletes only after confirmation');
assert(!editor.includes('saveDirectoryPerson'), 'the editor does not save a role change itself');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(editor), 'role removal does not rewrite event text');

const removal = app.slice(app.indexOf('async function applyPersonnelRoleRemoval'), app.indexOf('async function applyPersonnelDeletion'));
assert(removal.includes('saveDirectoryPerson(values)') && removal.includes('personnelRoleRemovalValues(person, role)'), 'role removal saves the full stored identity with one flag cleared');
assert(!removal.includes('archiveDirectoryPerson'), 'clearing the facilitator role does not archive the person');
assert(!app.includes('activeFacilitatorRoster'), 'the Facilitators list is not restricted to the facilitator flag');
assert(app.includes('filterFacilitatorPersonnel(facilitatorPersonnel, facilitatorFilterState())'), 'the Facilitators list uses the summarized facilitator population');
assert(!removal.includes('deleteDirectoryPerson') && !removal.includes('facilitator_qualifications'), 'role removal does not delete the person or qualification rows');
const deletion = app.slice(app.indexOf('async function applyPersonnelDeletion'), app.indexOf('function openFacilitatorDetail'));
assert(deletion.includes('deleteDirectoryPerson(id)'), 'Delete Person uses the deletion function');
assert(deletion.includes('renderFacilitatorManagement()') && deletion.includes('renderTeam()'), 'deleting a person refreshes Facilitator Management and the personnel directory');
assert(!deletion.includes('saveDirectoryPerson'), 'deletion is not a role update');
assert(app.includes("surface: 'facilitator'") && app.includes('createPersonnelLifecycleControls'), 'Facilitator Management puts lifecycle actions on the detail');
assert(db.includes("rpc('delete_directory_person'"), 'the client deletes through the database function');

assert(migration.includes('where person_id = p_id'), 'linked rows are deleted only for the selected person');
assert(migration.includes('delete from public.people\n  where id = p_id'), 'the people row delete is limited to the selected id');
assert(migration.includes('public.facilitator_qualifications'), 'deletion clears that person\'s qualifications');
assert(migration.includes('public.facilitator_t4t_completions'), 'deletion clears that person\'s T4T completions');
assert(migration.includes('public.team_members'), 'deletion clears that person\'s Manning row');
assert(migration.includes('public.people_name_aliases'), 'deletion clears that person\'s aliases');
assert(migration.includes('public.t4t_attendance_created_people'), 'deletion clears that person\'s attendance provenance');
assert(!/update\s+public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(migration), 'deletion does not rewrite event text');
assert(migration.includes("hint = 'PERSONNEL_DELETE_REFERENCE'"), 'an unexpected remaining reference rolls the deletion back');
assert(migration.indexOf('delete from public.facilitator_qualifications') < migration.indexOf('delete from public.people'), 'restricting child rows are removed before the person');

const chipStart = fields.indexOf('const chip = createChip(label, () => {');
const chip = fields.slice(chipStart, fields.indexOf('});', chipStart));
assert(chip.includes('tokens = tokens.filter((_, i) => i !== index)'), 'removing a person from an event only removes that event chip');
assert(!/saveDirectoryPerson|archiveDirectoryPerson|deleteDirectoryPerson|isPoc|isFacilitator|is_poc|is_facilitator/.test(chip), 'an event chip removal does not change a global role or delete the person');
assert(fields.includes("canManage: () => false"), 'event personnel menus still cannot manage the directory');

if (errors.length) {
  console.error('validate-personnel-lifecycle failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-personnel-lifecycle: ok');
