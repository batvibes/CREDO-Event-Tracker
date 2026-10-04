/**
 * T4T attendance partial-name identity, reuse, and structured creation checks.
 * Run: node scripts/validate-t4t-attendance-identity.js
 *
 * Does not connect to Supabase and does not create people or completion rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestAttendancePeople } from '../js/t4t-attendance-suggestions.js';
import {
  ATTENDANCE_NAME_REQUIRED,
  attendancePersonalName,
  directoryPersonFromSave,
  newDirectoryPersonInput,
  validateAttendanceIdentity,
} from '../js/t4t-completion-entry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function ids(result) {
  return (result.people || []).map((person) => person.personId).sort().join('|');
}

const ashley = {
  id: 'ashley',
  name: 'Ashley',
  first_name: null,
  last_name: 'Ashley',
  rank_title: 'Chaplain',
  command_organization: 'CREDO',
  installation: 'Naval Station',
  active: true,
};
const dawn = {
  id: 'dawn',
  name: 'Dawn Ashley',
  first_name: 'Dawn',
  last_name: 'Ashley',
  rank_title: 'LT',
  command_organization: 'Navy Region',
  installation: 'Camp Pendleton',
  active: true,
};
const legacyAshley = {
  id: 'legacy-ashley',
  name: 'Ashley',
  rank_title: 'Chaplain',
  command_organization: 'CREDO',
  installation: 'Naval Station',
  active: true,
};
const kimberly = {
  id: 'kimberly',
  name: 'Kimberly',
  first_name: 'Kimberly',
  last_name: null,
  rank_title: '',
  active: true,
};

assert(validateAttendanceIdentity({ firstName: 'Dawn', lastName: 'Ashley' }) === '', 'first and last name are accepted');
assert(validateAttendanceIdentity({ firstName: 'Kimberly', lastName: '' }) === '', 'a first name alone is accepted');
assert(validateAttendanceIdentity({ firstName: '', lastName: 'Smith' }) === '', 'a last name alone is accepted');
assert(validateAttendanceIdentity({ rank: 'LT', firstName: '', lastName: '' }) === ATTENDANCE_NAME_REQUIRED, 'rank alone is rejected');
assert(validateAttendanceIdentity({ firstName: '   ', lastName: '   ' }) === ATTENDANCE_NAME_REQUIRED, 'a blank personal name is rejected');
assert(ATTENDANCE_NAME_REQUIRED === 'First Name or Last Name is required.', 'attendance uses the shared personal-name message');

const full = suggestAttendancePeople({ firstName: 'Dawn', lastName: 'Ashley', rankTitle: 'HM2' }, [dawn, ashley], []);
assert(full.status === 'exact' && full.people.length === 1 && full.people[0].personId === 'dawn', 'a unique first and last name reuses that person');
assert(full.people[0].rankTitle === 'LT', 'a different entered rank does not replace the directory rank in the suggestion');

const lastOnly = suggestAttendancePeople({ firstName: '', lastName: 'Ashley', rankTitle: 'LT' }, [ashley], []);
assert(lastOnly.status === 'exact' && lastOnly.people[0].personId === 'ashley', 'a unique surname finds the structured person');
assert(lastOnly.people[0].rankTitle === 'Chaplain', 'a rank mismatch does not hide the surname match');

const legacy = suggestAttendancePeople({ firstName: '', lastName: 'Ashley', rankTitle: 'LT' }, [legacyAshley], []);
assert(legacy.status === 'exact' && legacy.people[0].personId === 'legacy-ashley', 'a legacy one-token surname remains discoverable');

const firstOnly = suggestAttendancePeople({ firstName: 'Kimberly', lastName: '' }, [kimberly, ashley], []);
assert(firstOnly.status === 'exact' && firstOnly.people[0].personId === 'kimberly', 'a unique first name finds that person');

const aliasOnly = suggestAttendancePeople({ firstName: '', lastName: 'Ashley' }, [
  { id: 'other', name: 'Pat Noone', rank_title: 'LT', active: true },
], [{ personId: 'other', displayName: 'Ashley' }]);
assert(aliasOnly.status === 'exact' && aliasOnly.people[0].personId === 'other', 'a surname alias is a candidate');

const twoSurnames = suggestAttendancePeople({ firstName: '', lastName: 'Ashley', rankTitle: 'LT' }, [ashley, dawn], []);
assert(twoSurnames.status === 'choose' && ids(twoSurnames) === 'ashley|dawn', 'two surnames stay candidates and are not selected automatically');
assert(twoSurnames.people.every((person) => person.rankTitle && person.commandOrganization && person.installation), 'surname candidates keep rank, command, and installation');

const twoFirst = suggestAttendancePeople({ firstName: 'Kimberly', lastName: '' }, [
  kimberly,
  { ...kimberly, id: 'kimberly-2', command_organization: 'Other' },
], []);
assert(twoFirst.status === 'choose' && ids(twoFirst) === 'kimberly|kimberly-2', 'two matching first names stay candidates');

const none = suggestAttendancePeople({ firstName: '', lastName: 'Smith', rankTitle: 'LT' }, [ashley], []);
assert(none.status === 'none' && none.people.length === 0, 'an unmatched surname stays a new-person result');

const lastCreated = newDirectoryPersonInput({
  rankTitle: 'LT',
  firstName: '',
  lastName: 'Smith',
  commandOrganization: 'Navy',
  installation: 'Camp Pendleton',
});
assert(lastCreated.name === 'Smith' && lastCreated.lastName === 'Smith' && lastCreated.firstName === '', 'a last-only attendee stores only the surname');
assert(lastCreated.rankTitle === 'LT', 'a last-only attendee keeps the entered rank');
assert(lastCreated.isCredoStaff === false && lastCreated.isFacilitator === false && lastCreated.isPoc === false, 'a last-only attendee has no role flags');

const firstCreated = newDirectoryPersonInput({ rankTitle: '', firstName: 'Kimberly', lastName: '' });
assert(firstCreated.name === 'Kimberly' && firstCreated.firstName === 'Kimberly' && firstCreated.lastName === '', 'a first-only attendee stores only that name');

const bothCreated = newDirectoryPersonInput({ rankTitle: 'LT', firstName: 'Dawn', lastName: 'Ashley' });
assert(bothCreated.name === 'Dawn Ashley' && bothCreated.firstName === 'Dawn' && bothCreated.lastName === 'Ashley', 'both names stay structured');
assert(newDirectoryPersonInput({ rankTitle: 'LT', firstName: '', lastName: '' }) == null, 'rank alone is not submitted');
assert(attendancePersonalName('Dawn', 'Ashley') === 'Dawn Ashley' && attendancePersonalName('', 'Smith') === 'Smith' && attendancePersonalName('Kimberly', '') === 'Kimberly', 'the compatibility name uses only the known personal-name parts');

const saved = directoryPersonFromSave({
  id: 'created',
  name: 'Smith',
  first_name: null,
  last_name: 'Smith',
  rank_title: 'LT',
});
assert(saved.id === 'created' && saved.name === 'Smith' && saved.last_name === 'Smith' && saved.first_name == null && saved.rank_title === 'LT', 'a saved attendance person keeps the structured surname');

const entry = read('js/t4t-completion-entry.js');
const useExisting = entry.slice(entry.indexOf('function useSuggestedPerson'), entry.indexOf('function reuseSuggestedPerson'));
assert(useExisting.includes('addExistingPerson(person)'), 'Use Existing records the selected person');
assert(!useExisting.includes('state.form'), 'Use Existing does not stop at prefilling the form');
assert(entry.includes('Already on this attendance roster.'), 'a person already on the roster is not added again');
assert(entry.includes('Attendee added.'), 'a completed add shows confirmation');
assert(entry.includes("body.querySelector('#t4t-attendee-rank')?.focus()"), 'the next entry starts at Rank');
assert(entry.includes('More than one person matches this name. Choose one.'), 'multiple matches explain that a choice is required');
assert(entry.includes('This Is A Different Person'), 'an ambiguous match can be confirmed as a different person');
assert(entry.includes('Choose the existing person.'), 'an ambiguous match stops creation');
const createPerson = entry.slice(entry.indexOf('async function createAndRecordPerson'), entry.indexOf('async function removeAttendee'));
assert(createPerson.includes('firstName: form.firstName') && createPerson.includes('lastName: form.lastName'), 'creation sends structured name parts');
assert(!createPerson.includes('`${form.firstName} ${form.lastName}`'), 'creation does not concatenate partial names');
const removeAttendee = entry.slice(entry.indexOf('async function removeAttendee'), entry.indexOf('async function recoverExistingPerson'));
assert(removeAttendee.includes('personRemoved'), 'removal drops a local person only when attendance cleanup says the person was removed');
assert(removeAttendee.includes('options.removeCompletion'), 'removal still deletes the attendance record');

const db = read('js/db.js');
const createWrapper = db.slice(db.indexOf('export async function createT4tAttendancePerson'), db.indexOf('export async function removeT4tAttendanceAttendee'));
assert(createWrapper.includes('p_first_name') && createWrapper.includes('p_last_name') && !createWrapper.includes('p_name'), 'attendance creation sends structured names');
assert(db.includes(".rpc('record_facilitator_t4t_completion'") && db.includes(".rpc('remove_facilitator_t4t_attendance'"), 'attendance recording and cleanup RPCs stay in place');

const migration = read('supabase/migrations/038_structured_t4t_attendance_person.sql');
assert(migration.includes('public.save_directory_person_structured('), 'attendance creation uses the structured personnel save');
assert(migration.includes('p_first_name') && migration.includes('p_last_name'), 'the attendance RPC accepts partial structured names');
assert(migration.includes('false,\n    false,\n    false,'), 'attendance-created people are not staff, facilitators, or points of contact');
assert(migration.includes('insert into public.t4t_attendance_created_people'), 'attendance provenance is still recorded');
assert(migration.includes('drop function if exists public.create_t4t_attendance_person(text, text, text, text)'), 'the combined-name attendance signature is replaced');
assert(!migration.includes('update public.events') && !migration.includes('is_facilitator = true'), 'the attendance migration does not rewrite events or grant the facilitator role');

const cleanup = read('supabase/migrations/031_t4t_attendance_person_cleanup.sql');
assert(cleanup.includes('from public.t4t_attendance_created_people created') && cleanup.includes('delete from public.people person'), 'cleanup still deletes only an attendance-created person');
assert(cleanup.includes('is_credo_staff') && cleanup.includes('is_facilitator') && cleanup.includes('is_poc'), 'cleanup still keeps a person who has a role');

if (errors.length) {
  console.error(`validate-t4t-attendance-identity failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-t4t-attendance-identity: ok');
