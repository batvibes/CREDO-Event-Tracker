/**
 * Facilitator Management personnel-ownership checks.
 * Run: node scripts/validate-facilitator-personnel-consolidation.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterFacilitatorPersonnel, summarizeFacilitatorPersonnel } from '../js/facilitator-management.js';
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

assert(!facilitatorView.includes('>Overview<') && !facilitatorView.includes('data-facilitator-view="overview"'), 'Facilitator Management no longer has an Overview tab');
assert(facilitatorView.indexOf('data-facilitator-view="capabilities"') < facilitatorView.indexOf('data-facilitator-view="personnel"'), 'Program Capabilities is the first Facilitator Management tab');
assert(facilitatorView.includes('>Facilitators<') && facilitatorView.includes('>Program Capabilities<'), 'Facilitator Management tabs are Program Capabilities and Facilitators');
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
assert(historical[0].productCount === 1 && historical[0].eventsConducted === 2 && historical[0].mostRecentOn === '2024-06-01', 'an ordinary-only facilitator still counts only that experience');
assert(historical[0].experience.length === 1 && historical[0].t4tExperience.length === 0, 'an ordinary-only profile keeps T4T facilitation empty');

const rosterProducts = [
  { id: 'lenses', name: '4 Lenses', code: 'four_lenses', active: true, sort_order: 6 },
  { id: 'safetalk', name: 'safeTALK', code: 'safetalk', active: true, sort_order: 9 },
  { id: 'safetalk-t4t', name: 'safeTALK T4T', code: 'safetalk_t4t', active: true, sort_order: 11 },
  { id: 'asist', name: 'ASIST', code: 'asist', active: true, sort_order: 10 },
  { id: 'asist-t4t', name: 'ASIST T4T', code: 'asist_t4t', active: true, sort_order: 12 },
];
const roster = summarizeFacilitatorPersonnel(
  [
    { id: 'kermit', name: 'Kermit Jones', active: true, is_facilitator: false },
    { id: 'both', name: 'Both Kinds', active: true, is_facilitator: true },
    { id: 'dedicated', name: 'Dedicated T4T', active: true, is_facilitator: false },
    { id: 'future-only', name: 'Future Only', active: true, is_facilitator: true },
  ],
  [
    { person_id: 'both', product_id: 'lenses', events_conducted: 2, first_recorded_facilitation_on: '2026-01-10', most_recent_facilitation_on: '2026-04-02' },
    { person_id: 'both', product_id: 'safetalk', events_conducted: 1, first_recorded_facilitation_on: '2026-02-01', most_recent_facilitation_on: '2026-02-01' },
    { person_id: 'dedicated', product_id: 'asist', events_conducted: 1, first_recorded_facilitation_on: '2025-08-01', most_recent_facilitation_on: '2025-08-01' },
  ],
  [],
  rosterProducts,
  [
    { person_id: 'kermit', product_id: 'lenses', events_conducted: 1, first_recorded_facilitation_on: '2026-09-01', most_recent_facilitation_on: '2026-09-01' },
    { person_id: 'both', product_id: 'lenses', events_conducted: 1, first_recorded_facilitation_on: '2026-05-18', most_recent_facilitation_on: '2026-05-18' },
    { person_id: 'both', product_id: 'safetalk-t4t', events_conducted: 1, first_recorded_facilitation_on: '2026-03-15', most_recent_facilitation_on: '2026-03-15' },
    { person_id: 'dedicated', product_id: 'asist-t4t', events_conducted: 2, first_recorded_facilitation_on: '2026-03-02', most_recent_facilitation_on: '2026-06-01' },
    { person_id: null, product_id: 'lenses', events_conducted: 4, most_recent_facilitation_on: '2026-09-01' },
    { person_id: 'kermit', product_id: null, events_conducted: 3, most_recent_facilitation_on: '2025-03-10' },
    { person_id: 'kermit', product_id: 'missing-curriculum', events_conducted: 1, most_recent_facilitation_on: '2026-11-20' },
  ],
);
const kermit = roster.find((person) => person.id === 'kermit');
assert(kermit.productCount === 1 && kermit.eventsConducted === 1 && kermit.mostRecentOn === '2026-09-01', 'Kermit Jones roster summary is 1 / 1 / 09/01/26 from the 4 Lenses T4T');
assert(kermit.experience.length === 0 && kermit.t4tExperience.length === 1 && kermit.t4tExperience[0].productName === '4 Lenses', 'Kermit’s profile keeps ordinary and T4T facilitation separate');
assert(kermit.qualificationProducts.length === 0, 'roster summary does not create a qualification');
const combined = roster.find((person) => person.id === 'both');
assert(combined.productCount === 2 && combined.eventsConducted === 5 && combined.mostRecentOn === '2026-05-18', 'ordinary and T4T products dedupe, events add, and Most Recent is the later date');
assert(combined.experience.length === 2 && combined.t4tExperience.length === 2, 'combined roster totals do not merge the profile lists');
const dedicated = roster.find((person) => person.id === 'dedicated');
assert(dedicated.productCount === 1 && dedicated.eventsConducted === 3 && dedicated.mostRecentOn === '2026-06-01', 'ASIST T4T counts as ASIST and its events are added once');
assert(dedicated.t4tExperience[0].productName === 'ASIST T4T' && dedicated.experience[0].productName === 'ASIST', 'the profile still names the dedicated T4T product separately');
assert(roster.find((person) => person.id === 'future-only').eventsConducted === 0, 'a facilitator with no past facilitation row stays at zero');
const completionOnly = summarizeFacilitatorPersonnel(
  [
    { id: 'jason', name: 'CDR Jason Dipinto', rank_title: null, active: true, is_facilitator: false },
    { id: 'kermit-check', name: 'Kermit Jones', active: true, is_facilitator: false },
  ],
  [],
  [],
  rosterProducts,
  [
    { person_id: 'kermit-check', product_id: 'lenses', events_conducted: 1, first_recorded_facilitation_on: '2026-09-01', most_recent_facilitation_on: '2026-09-01' },
  ],
  [
    { id: 'jason-completion', person_id: 'jason', product_id: 'lenses', completed_on: '2026-09-01' },
  ],
);
const jasonRoster = completionOnly.find((person) => person.id === 'jason');
assert(completionOnly.map((person) => person.id).join(',') === 'jason,kermit-check', 'T4T completion history places a person on the Facilitators roster once');
assert(jasonRoster.isFacilitator === false && jasonRoster.eventsConducted === 0 && jasonRoster.productCount === 0, 'a completion-only roster row does not gain ordinary event counts');
assert(jasonRoster.qualificationProducts.length === 0 && jasonRoster.experience.length === 0 && jasonRoster.t4tExperience.length === 0, 'a completion-only profile does not invent qualifications or facilitation');
assert(jasonRoster.t4tCompletions.length === 1 && jasonRoster.t4tCompletions[0].productName === '4 Lenses', 'a completion-only profile keeps the T4T completion');
assert(filterFacilitatorPersonnel(completionOnly, { query: 'dipinto' }).map((person) => person.id).join(',') === 'jason', 'search finds a T4T-completion-only person');
assert(filterFacilitatorPersonnel(completionOnly, { productId: 'lenses' }).map((person) => person.id).sort().join(',') === 'jason,kermit-check', 'a product filter includes completion history without dropping facilitation');
assert(!roster.some((person) => person.id == null), 'an unresolved identity is not added to the roster');
const experienceView = read('supabase/migrations/025_facilitator_t4t_product_experience.sql');
assert(experienceView.includes('count(distinct token.event_id)::integer as events_conducted'), 'roster event totals use the views’ distinct Event counts');
assert(experienceView.includes('token.recorded_on <= current_date'), 'future facilitation stays out of the aggregates the roster sums');
assert(experienceView.includes('token.person_id is not null') && experienceView.includes('token.product_id is not null'), 'unresolved people and events without a product stay out of the aggregates');
assert(experienceView.includes('and not (') && experienceView.includes('token.is_t4t is true'), 'one Event stays in only one aggregate, so the roster sum does not count it twice');

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
assert(fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((name) => /^0(29|[3-9]\d)_/.test(name)).sort().join('|') === '029_remove_facilitator_t4t_completion_from_event.sql|030_t4t_completion_source_uniqueness.sql|031_t4t_attendance_person_cleanup.sql|032_repair_personnel_reconciliation.sql|033_reuse_or_create_event_person.sql', 'migrations after 028 are attendance removal, completion provenance, attendance-created person cleanup, personnel reconciliation repair, and event person reuse');

if (errors.length) {
  console.error('validate-facilitator-personnel-consolidation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-personnel-consolidation: ok');
