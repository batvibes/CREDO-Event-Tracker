/**
 * Facilitator Management personnel-ownership checks.
 * Run: node scripts/validate-facilitator-personnel-consolidation.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeFacilitatorPersonnel } from '../js/facilitator-management.js';
import {
  facilitatorReusePlan,
  facilitatorReuseValues,
  personnelEditorRoleValues,
  validatePersonnelEditor,
} from '../js/team-personnel-editor.js';
import {
  TEAM_DIRECTORY_EMPTY_MESSAGES,
  TEAM_DIRECTORY_TABS,
  isTeamDirectoryTab,
} from '../js/team-personnel-directory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const html = read('index.html');
const app = read('js/app.js');
const editor = read('js/team-personnel-editor.js');
const teamView = html.slice(html.indexOf('id="view-team"'), html.indexOf('id="view-facilitators"'));
const facilitatorView = html.slice(html.indexOf('id="view-facilitators"'), html.indexOf('id="view-settings"'));
const detail = app.slice(app.indexOf('function openFacilitatorDetail'), app.indexOf('function closeFacilitatorDetail'));
const editorOpen = app.slice(app.indexOf('function openPersonnelEditor'), app.indexOf('function renderTeamDirectoryPanel'));

assert(TEAM_DIRECTORY_TABS.map((tab) => tab.id).join('|') === 'staff|poc', 'Team exposes only CREDO Staff and Points of Contact');
assert(!teamView.includes('All Personnel') && !teamView.includes('data-team-tab="all"'), 'the All Personnel tab is absent');
assert(!teamView.includes('>Facilitators<') && !teamView.includes('data-team-tab="facilitators"'), 'the Facilitators tab is absent from Team');
assert(teamView.includes('>CREDO Staff<') && teamView.includes('>Points of Contact<'), 'Team keeps CREDO Staff and Points of Contact');
assert(isTeamDirectoryTab('staff') && isTeamDirectoryTab('poc'), 'the remaining Team tabs are valid');
assert(!isTeamDirectoryTab('all') && !isTeamDirectoryTab('facilitators'), 'removed Team tabs are not selectable');
assert(teamView.includes('id="team-tab-staff"') && teamView.includes('aria-selected="true"'), 'Team defaults to CREDO Staff');
assert(app.includes("let teamDirectoryTab = 'staff'"), 'Team state defaults to CREDO Staff');
assert(!editor.includes("checkbox(facilitatorInput, 'Facilitator')"), 'the Team editor does not expose a Facilitator role control');
assert(editor.includes("checkbox(staffInput, 'CREDO Staff')") && editor.includes("checkbox(pocInput, 'Point of Contact')"), 'the Team editor keeps CREDO Staff and Point of Contact');
assert(!Object.values(TEAM_DIRECTORY_EMPTY_MESSAGES).some((message) => /facilitator/i.test(message)), 'Team empty states do not mention facilitators');

const preserved = personnelEditorRoleValues('team', {
  id: 'ada',
  isFacilitator: true,
  isCredoStaff: true,
  isPoc: false,
  staffBilletOrRole: 'Director',
}, {
  isCredoStaff: true,
  isFacilitator: false,
  isPoc: true,
  staffBilletOrRole: 'Director',
});
assert(preserved.isFacilitator === true, 'a Team edit preserves the existing facilitator role');
assert(preserved.isPoc === true && preserved.isCredoStaff === true, 'a Team edit still saves the Team roles that are shown');

assert(facilitatorView.includes('>Overview<') && facilitatorView.includes('>Facilitators<') && facilitatorView.includes('>Program Capabilities<'), 'Facilitator Management tabs are Overview, Facilitators, and Program Capabilities');
assert(facilitatorView.includes('id="add-facilitator-btn"') && facilitatorView.includes('>Add Facilitator<'), 'Add Facilitator is on the Facilitators tab');
assert(facilitatorView.includes('id="add-facilitator-btn" hidden'), 'Add Facilitator is hidden until an editor is confirmed');
assert(app.includes('add.hidden = !canEditTeam()'), 'viewers do not receive the add control');
assert(detail.includes('Edit Facilitator') && detail.includes('canEditTeam()'), 'Edit Facilitator is limited to the personnel-edit permission');
assert(detail.includes('Manage Qualifications') && detail.includes('canEditEvents()'), 'qualification management remains on the profile');
assert(detail.includes('FACILITATOR_QUALIFICATIONS_HEADING') && detail.includes('FACILITATOR_T4T_COMPLETION_HEADING'), 'qualifications and T4T history remain on the profile');
assert(detail.includes('FACILITATOR_EXPERIENCE_HEADING') && detail.includes('FACILITATOR_T4T_EXPERIENCE_HEADING'), 'ordinary and T4T facilitation experience remain on the profile');
assert(app.includes('openFacilitatorDetail('), 'the facilitator profile still opens');

const created = personnelEditorRoleValues('facilitator', null, { isFacilitator: true });
assert(created.isFacilitator === true, 'adding a facilitator sets the facilitator role');
assert(created.isCredoStaff === false && created.isPoc === false, 'a new facilitator does not receive Team roles');
assert(validatePersonnelEditor({ name: 'Ada Civilian', rankTitle: '', isCredoStaff: false }) === '', 'a facilitator name does not require rank, command, or installation');

const edited = personnelEditorRoleValues('facilitator', {
  id: 'ada',
  isFacilitator: true,
  isCredoStaff: true,
  isPoc: true,
  staffBilletOrRole: 'Director',
  staffPrdEaos: '2027',
}, {
  isFacilitator: true,
  isCredoStaff: false,
  isPoc: false,
  staffBilletOrRole: '',
  staffPrdEaos: '',
});
assert(edited.isCredoStaff === true && edited.isPoc === true, 'a Facilitator Management edit preserves Team roles');
assert(edited.staffBilletOrRole === 'Director' && edited.staffPrdEaos === '2027', 'a Facilitator Management edit preserves CREDO Staff details');
assert(edited.isFacilitator === true, 'Current Facilitator remains available from Facilitator Management');

const products = [{ id: 'safetalk', name: 'safeTALK', code: 'safetalk', active: true, sort_order: 1 }];
const historical = summarizeFacilitatorPersonnel(
  [{ id: 'pat', name: 'Pat', active: true, is_facilitator: false, is_credo_staff: true, is_poc: true }],
  [{ person_id: 'pat', product_id: 'safetalk', events_conducted: 2, first_recorded_facilitation_on: '2024-01-01', most_recent_facilitation_on: '2024-06-01' }],
  [],
  products,
);
assert(historical.length === 1 && historical[0].isFacilitator === false, 'historical facilitators remain without an explicit facilitator flag');
assert(historical[0].isCredoStaff === true && historical[0].isPoc === true, 'historical facilitator records keep their other roles');

const staff = {
  id: 'staff',
  name: 'Ada Lane',
  rankTitle: 'CDR',
  commandOrganization: 'CREDO MCI WEST',
  installation: 'Camp Pendleton',
  active: true,
  isCredoStaff: true,
  isPoc: false,
  isFacilitator: false,
  staffBilletOrRole: 'Director',
  staffPrdEaos: 'JUL 27',
};
const poc = {
  id: 'poc',
  name: 'Bea Cole',
  rankTitle: '',
  commandOrganization: '1st MARDIV',
  installation: 'Camp Pendleton',
  active: true,
  isCredoStaff: false,
  isPoc: true,
  isFacilitator: false,
  staffBilletOrRole: '',
  staffPrdEaos: '',
};
const both = { ...staff, id: 'both', isPoc: true };
const inactive = { ...poc, id: 'inactive', name: 'Cara Dunn', active: false };

const staffPlan = facilitatorReusePlan({ name: 'Ada Lane', rankTitle: 'LCDR' }, [staff]);
const staffReuse = facilitatorReuseValues(staff);
assert(staffPlan.status === 'reuse' && staffPlan.candidates.length === 1, 'an existing CREDO Staff person can be reused as a facilitator');
assert(staffReuse.id === 'staff' && staffReuse.isFacilitator === true, 'reuse keeps the existing person and sets the facilitator role');
assert(staffReuse.isCredoStaff === true && staffReuse.staffBilletOrRole === 'Director' && staffReuse.staffPrdEaos === 'JUL 27', 'reuse preserves CREDO Staff billet and PRD/EAOS');
assert(staffReuse.name === 'Ada Lane' && staffReuse.rankTitle === 'CDR', 'reuse does not replace the stored name or rank');
assert(staffReuse.commandOrganization === 'CREDO MCI WEST' && staffReuse.installation === 'Camp Pendleton', 'reuse preserves command and installation');

const pocReuse = facilitatorReuseValues(poc);
assert(facilitatorReusePlan({ name: 'Bea Cole' }, [poc]).status === 'reuse', 'an existing Point of Contact can be reused as a facilitator');
assert(pocReuse.id === 'poc' && pocReuse.isPoc === true && pocReuse.isCredoStaff === false && pocReuse.isFacilitator === true, 'reuse preserves the Point of Contact role');

const bothReuse = facilitatorReuseValues(both);
assert(facilitatorReusePlan({ name: 'Ada Lane' }, [both]).status === 'reuse', 'a person with both Team roles can be reused');
assert(bothReuse.isCredoStaff === true && bothReuse.isPoc === true && bothReuse.isFacilitator === true, 'reuse preserves both Team roles');

const inactiveReuse = facilitatorReuseValues(inactive);
assert(facilitatorReusePlan({ name: 'Cara Dunn' }, [inactive]).status === 'reuse', 'an inactive person can be reused');
assert(inactiveReuse.active === false && inactiveReuse.isFacilitator === true && inactiveReuse.isPoc === true, 'reuse keeps an inactive person inactive');

assert(facilitatorReusePlan({ name: 'Pat Noone' }, [staff, poc]).status === 'new', 'a name with no existing person still creates a facilitator');
const probable = facilitatorReusePlan({ name: 'LT Ada Lane' }, [staff]);
assert(probable.status === 'new' && probable.candidates.length === 0, 'a partial name is not automatically merged');
const ambiguous = facilitatorReusePlan({ name: 'John Adams' }, [
  { id: 'a', name: 'John Adams', rankTitle: 'CDR', active: true },
  { id: 'b', name: 'John Adams', rankTitle: '', active: false },
]);
assert(ambiguous.status === 'choose' && ambiguous.candidates.length === 2 && ambiguous.selectedPersonId == null, 'more than one exact match requires an explicit choice');

assert(editor.includes('Existing Person Found') && editor.includes('Use Existing Person'), 'Add Facilitator asks before reusing an existing person');
assert(editor.includes("inactive.textContent = 'Inactive'"), 'an inactive match is labeled Inactive');
assert(editor.includes("roleSurface === 'facilitator' && !editing"), 'reuse is limited to Add Facilitator');
assert(editor.includes('facilitatorReuseValues(existing)') && editor.includes('await onSave(values)'), 'reuse and new facilitators both save the canonical person');
assert(!/levenshtein|similarity\s*\(|pg_trgm|soundex/i.test(editor), 'reuse does not add fuzzy matching');

assert(editorOpen.includes("roleSurface === 'facilitator' ? 'facilitator' : 'team'"), 'Team editing stays on the Team role surface');
assert(editorOpen.includes('p_is_facilitator') === false && editorOpen.includes('saveDirectoryPerson(values)'), 'both surfaces save the canonical person');
assert(!/create table public\.people\b/i.test(`${app}\n${editor}`), 'no duplicate people table was introduced');
assert(!fs.readdirSync(path.join(ROOT, 'supabase/migrations')).some((name) => /^0(29|[3-9]\d)_/.test(name)), 'no migration was added');

if (errors.length) {
  console.error('validate-facilitator-personnel-consolidation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-personnel-consolidation: ok');
