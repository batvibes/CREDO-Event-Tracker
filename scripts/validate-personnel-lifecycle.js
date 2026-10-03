/**
 * Personnel role removal and explicit person deletion.
 * Run: node scripts/validate-personnel-lifecycle.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeFacilitatorRoster, summarizeFacilitatorPersonnel } from '../js/facilitator-management.js';
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
assert(contacts.join(',') === 'poc', 'Points of Contact lists only an active person with the POC role');
assert(!contacts.includes('facilitator'), 'an active facilitator without the POC role is absent from Points of Contact');
assert(!contacts.includes('staff'), 'an active staff member without the POC role is absent from Points of Contact');
assert(!contacts.includes('roleless'), 'a roleless active person is absent from Points of Contact');

const afterPocRemoval = mapTeamDirectoryPerson({
  id: 'both',
  name: 'Test McTesterton',
  rank_title: 'LT',
  active: removedPoc.active,
  is_poc: removedPoc.isPoc,
  is_facilitator: removedPoc.isFacilitator,
  is_credo_staff: removedPoc.isCredoStaff,
});
assert(afterPocRemoval.active === true && afterPocRemoval.isFacilitator === true, 'POC removal leaves a facilitator active');
assert(filterTeamDirectory([afterPocRemoval], 'poc').length === 0, 'POC removal takes a remaining facilitator off the Points of Contact roster');
const staffAfterPocRemoval = mapTeamDirectoryPerson({
  id: 'staff-kept',
  name: 'Staff Kept',
  active: true,
  is_poc: false,
  is_facilitator: false,
  is_credo_staff: true,
});
assert(filterTeamDirectory([staffAfterPocRemoval], 'poc').length === 0, 'a remaining staff member without the POC role is absent from Points of Contact');
assert(filterTeamDirectory([staffAfterPocRemoval], 'staff').map((person) => person.id).join(',') === 'staff-kept', 'that staff member stays on CREDO Staff');

const products = [{ id: 'safetalk', name: 'safeTALK', code: 'safetalk', active: true, sort_order: 1 }];
const currentFacilitator = summarizeFacilitatorPersonnel(
  [{ id: 'flag', name: 'Current Facilitator', active: true, is_facilitator: true, is_poc: true, is_credo_staff: false }],
  [{ person_id: 'flag', product_id: 'safetalk', events_conducted: 1, first_recorded_facilitation_on: '2024-01-01', most_recent_facilitation_on: '2024-06-01' }],
  [{ id: 'q-current', person_id: 'flag', product_id: 'safetalk', standing: 'current' }],
  products,
  [],
  [{ person_id: 'flag', product_id: 'safetalk', completed_on: '2024-01-01' }],
);
assert(activeFacilitatorRoster(currentFacilitator).map((person) => person.id).join(',') === 'flag', 'the active roster is the people with facilitator status');
assert(currentFacilitator[0].eventsConducted === 1 && currentFacilitator[0].qualificationProducts.length === 1 && currentFacilitator[0].t4tCompletions.length === 1, 'history calculations remain for a current facilitator');

const qualified = summarizeFacilitatorPersonnel(
  [{ id: 'qual', name: 'Qualified Person', active: true, is_facilitator: false, is_poc: true, is_credo_staff: false }],
  [],
  [{ id: 'q1', person_id: 'qual', product_id: 'safetalk', standing: 'current' }],
  products,
);
assert(qualified.length === 1 && qualified[0].qualificationProducts.length === 1, 'qualification rows stay attached to the same person');
assert(qualified[0].isFacilitator === false && qualified[0].isPoc === true, 'a retained qualification keeps the other roles');
assert(activeFacilitatorRoster(qualified).length === 0, 'qualifications do not keep a non-facilitator on the active roster');
const experienced = summarizeFacilitatorPersonnel(
  [{ id: 'exp', name: 'Experienced Person', active: true, is_facilitator: false, is_poc: false, is_credo_staff: true }],
  [{ person_id: 'exp', product_id: 'safetalk', events_conducted: 2, first_recorded_facilitation_on: '2024-01-01', most_recent_facilitation_on: '2024-06-01' }],
  [],
  products,
);
assert(experienced.length === 1 && experienced[0].eventsConducted === 2 && experienced[0].isCredoStaff === true, 'recorded facilitation history and CREDO Staff status stay');
assert(activeFacilitatorRoster(experienced).length === 0, 'historical facilitation does not keep them on the active roster');
const attended = summarizeFacilitatorPersonnel(
  [{ id: 'attended', name: 'T4T Person', active: true, is_facilitator: false, is_poc: true, is_credo_staff: true }],
  [],
  [],
  products,
  [],
  [{ person_id: 'attended', product_id: 'safetalk', completed_on: '2024-03-01' }],
);
assert(attended.length === 1 && attended[0].t4tCompletions.length === 1 && attended[0].isPoc === true && attended[0].isCredoStaff === true, 'T4T history stays and the other roles stay');
assert(activeFacilitatorRoster(attended).length === 0, 'T4T history does not keep them on the active roster');
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
assert(activeFacilitatorRoster(removedFromRoster).length === 0, 'removing facilitator status takes them off the active roster');
assert(removedFromRoster[0].isPoc === true && removedFromRoster[0].isCredoStaff === true, 'POC and CREDO Staff stay after facilitator removal');
assert(removedFromRoster[0].eventsConducted === 3 && removedFromRoster[0].qualificationProducts.length === 1, 'history remains available after facilitator removal');
assert(filterTeamDirectory([mapTeamDirectoryPerson({
  id: 'both',
  name: 'Test McTesterton',
  active: true,
  is_poc: true,
  is_facilitator: false,
})], 'poc').length === 1, 'a remaining POC stays on the Points of Contact roster');

assert(personnelLifecycleActions(pocOnly, 'team').join(',') === 'remove-poc,delete', 'the Team editor offers POC removal and deletion for a POC');
assert(personnelLifecycleActions({ ...pocOnly, isPoc: false }, 'team').join(',') === 'delete', 'POC removal is hidden when the person is not a POC');
assert(personnelLifecycleActions(both, 'facilitator').join(',') === 'remove-facilitator,delete', 'Facilitator Management offers facilitator removal and deletion');
assert(personnelLifecycleActions({ ...facilitatorOnly, isFacilitator: false }, 'facilitator').join(',') === 'delete', 'facilitator removal is hidden when facilitator status is already off');
assert(!personnelLifecycleActions(both, 'team').includes('remove-facilitator'), 'the Team editor does not take facilitator status off');
assert(!personnelLifecycleActions(both, 'facilitator').includes('remove-poc'), 'Facilitator Management does not take the POC role off');

const deleteCopy = personnelLifecycleCopy({ rankTitle: 'LT', name: 'Test McTesterton' }, 'delete');
assert(deleteCopy.title === 'Delete LT Test McTesterton?', 'deletion names the person');
assert(deleteCopy.body === 'This permanently removes this personnel record. Any roles, qualifications, aliases, and linked personnel data may also be removed. Historical event information may be affected.', 'deletion explains the impact');
assert(deleteCopy.confirm === 'Delete Person', 'deletion is labeled Delete Person');
const pocCopy = personnelLifecycleCopy(pocOnly, 'remove-poc');
assert(pocCopy.confirm === 'Remove from Points of Contact', 'POC removal uses the directory label');
assert(pocCopy.body.includes('leave the Points of Contact roster') && pocCopy.body.includes('personnel record is kept'), 'POC removal leaves the roster and keeps the record');
assert(!pocCopy.body.includes('leave the active directory'), 'POC removal does not describe archival');
const multiCopy = personnelLifecycleCopy(both, 'remove-poc');
assert(multiCopy.body.includes('Facilitator status, CREDO Staff status'), 'POC removal tells a multi-role person the other roles stay');
assert(multiCopy.body.includes('leave the Points of Contact roster'), 'a remaining facilitator still leaves the Points of Contact roster');
const facilitatorCopy = personnelLifecycleCopy(both, 'remove-facilitator');
assert(facilitatorCopy.body.includes('qualifications, and facilitation history stay'), 'facilitator removal keeps qualifications and history');
assert(facilitatorCopy.body.includes('leave the Facilitator Management roster'), 'facilitator removal leaves the active roster');
assert(!facilitatorCopy.body.includes('when no facilitation'), 'history does not decide active roster membership');

const editor = read('js/team-personnel-editor.js');
const app = read('js/app.js');
const db = read('js/db.js');
const fields = read('js/event-reference-fields.js');
const migration = read('supabase/migrations/037_delete_directory_person.sql');
assert(!editor.includes('Point of Contact'), 'role removal does not restore a Point of Contact checkbox');
assert(editor.includes('onArm?.(action)'), 'the first lifecycle click only asks for confirmation');
assert(editor.includes("confirm.className = pendingAction === 'delete' ? 'btn btn-danger' : 'btn btn-primary'"), 'Delete Person is confirmed with a separate destructive button');
assert(editor.includes("if (action === 'delete') await onDelete(person.id)"), 'the editor deletes only after confirmation');
assert(!editor.includes('saveDirectoryPerson'), 'the editor does not save a role change itself');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(editor), 'role removal does not rewrite event text');

const removal = app.slice(app.indexOf('async function applyPersonnelRoleRemoval'), app.indexOf('async function applyPersonnelDeletion'));
assert(removal.includes('saveDirectoryPerson(values)') && removal.includes('personnelRoleRemovalValues(person, role)'), 'role removal saves the full stored identity with one flag cleared');
assert(!removal.includes('archiveDirectoryPerson'), 'role removal does not archive the person');
assert(app.includes('activeFacilitatorRoster(facilitatorPersonnel)'), 'the Facilitator Management list uses facilitator status');
assert(!removal.includes('deleteDirectoryPerson') && !removal.includes('facilitator_qualifications'), 'role removal does not delete the person or qualification rows');
const deletion = app.slice(app.indexOf('async function applyPersonnelDeletion'), app.indexOf('function openFacilitatorDetail'));
assert(deletion.includes('deleteDirectoryPerson(id)'), 'Delete Person uses the deletion function');
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
