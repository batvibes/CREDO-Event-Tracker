/**
 * Stage 2A Team directory checks.
 * Run: node scripts/validate-stage-2a-team-directory.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TEAM_DIRECTORY_EMPTY_MESSAGES,
  TEAM_DIRECTORY_TABS,
  TEAM_STAFF_COLUMNS,
  filterTeamDirectory,
  isCommandHighlightsNotesVisible,
  mapTeamDirectoryPerson,
  teamDirectoryRoleBadges,
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

function unquoteGitPath(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

const directorySource = read('js/team-personnel-directory.js');
const dbSource = read('js/db.js');
const appSource = read('js/app.js');
const htmlSource = read('index.html');

const teamView = htmlSource.slice(htmlSource.indexOf('id="view-team"'), htmlSource.indexOf('id="view-facilitators"'));
assert(TEAM_DIRECTORY_TABS.map((tab) => tab.label).join('|') === 'CREDO Staff|Points of Contact', 'Team tabs are CREDO Staff and Points of Contact');
assert(!teamView.includes('All Personnel'), 'All Personnel is not a Team tab');
assert(!teamView.includes('>Facilitators<'), 'Facilitators is not a Team tab');
assert(teamView.includes('>CREDO Staff<'), 'CREDO Staff tab is in the Team page');
assert(teamView.includes('>Points of Contact<'), 'Points of Contact tab is in the Team page');
assert(teamView.includes('id="team-tab-staff"') && teamView.includes('aria-selected="true"'), 'CREDO Staff is the default tab');
assert(htmlSource.includes('<h1>Team</h1>'), 'Team header remains');
assert(htmlSource.includes('<h2>Personnel Directory</h2>'), 'Team subtitle is the personnel directory');
assert(!htmlSource.includes('CREDO MCI West Staff'), 'old staff-only subtitle is gone');

assert(dbSource.includes("from('people')") && dbSource.includes('export async function fetchTeamDirectoryPersonnel()'), 'Team directory reads public.people');
assert(dbSource.includes(".eq('active', true)"), 'Team directory query keeps the active roster');
for (const column of [
  'rank_title',
  'command_organization',
  'installation',
  'is_credo_staff',
  'is_facilitator',
  'is_poc',
  'staff_billet_or_role',
  'staff_status_next_action',
  'staff_prd_eaos',
  'staff_display_order',
]) {
  assert(dbSource.includes(column), `Team directory select includes ${column}`);
}

assert(
  /export async function fetchTeamMembers\(\) \{\s*const \{ data, error \} = await supabase\s*\.from\('team_members'\)\s*\.select\('\*'\)\s*\.order\('display_order', \{ ascending: true \}\);/.test(dbSource),
  'fetchTeamMembers() still reads public.team_members'
);
assert(dbSource.includes('export async function createTeamMember('), 'legacy createTeamMember helper remains');
assert(dbSource.includes('export async function updateTeamMember('), 'legacy updateTeamMember helper remains');
assert(dbSource.includes('export async function deleteTeamMember('), 'legacy deleteTeamMember helper remains');
assert(
  dbSource.includes(".select('id, name, first_name, last_name, normalized_name, rank_title, email, phone, active, created_at, updated_at')"),
  'fetchPeople() keeps the reference roster columns and includes structured names for sorting'
);

const prepareMir = appSource.match(/async function prepareMirReportGenerationInput\(report\) \{[\s\S]*?\n\}/);
assert(prepareMir, 'prepareMirReportGenerationInput() still exists');
assert(prepareMir?.[0].includes('fetchTeamMembers()'), 'prepareMirReportGenerationInput() still calls fetchTeamMembers()');
assert(!prepareMir?.[0].includes('fetchTeamDirectoryPersonnel'), 'MIR generation does not read the Team directory helper');
assert(!prepareMir?.[0].includes("from('people')"), 'MIR generation does not read public.people');

assert(appSource.includes('fetchTeamDirectoryPersonnel()'), 'Team page loads the personnel directory');
assert(appSource.includes('fetchTeamMembers()'), 'Team page still refreshes legacy team members for existing selectors');
assert(appSource.includes('updateCommandHighlightsNotes'), 'Command Highlights Notes save remains');
assert(appSource.includes('id="command-highlights-notes"'), 'Command Highlights Notes field remains');
assert(appSource.includes('fetchCommandHighlightsNotes()'), 'Command Highlights Notes still load from the existing source');
assert(appSource.includes('syncCommandHighlightsNotesVisibility'), 'Command Highlights Notes visibility follows the Team tab');
assert(isCommandHighlightsNotesVisible('staff') === true, 'Command Highlights Notes render on CREDO Staff');
assert(isCommandHighlightsNotesVisible('all') === false, 'Command Highlights Notes stay off All Personnel');
assert(isCommandHighlightsNotesVisible('facilitators') === false, 'Command Highlights Notes stay off Facilitators');
assert(isCommandHighlightsNotesVisible('poc') === false, 'Command Highlights Notes stay off Points of Contact');
assert(!appSource.includes('add-team-member-btn'), 'old inline staff add control is not on the Team page');
assert(!appSource.includes('createTeamMember('), 'Team page does not create team_members rows');
assert(!appSource.includes('updateTeamMember('), 'Team page does not update team_members rows');
assert(!appSource.includes('deleteTeamMember('), 'Team page does not delete team_members rows');
assert(!/MANPOWER \/ MANNING/.test(appSource), 'old manpower heading is not rendered');

assert(!/\b(qualification|certification|t4t|expiration|availability|facilitator management)\b/i.test(directorySource), 'no qualification or Facilitator Management feature was added');
assert(!/events\.facilitators|events\.poc|from\('events'\)|from\('team_members'\)/.test(directorySource), 'directory rules do not read events or team_members');

const ada = mapTeamDirectoryPerson({
  id: '1',
  name: '  Ada Staff  ',
  rank_title: 'LCDR',
  command_organization: ' CREDO ',
  installation: 'Camp Pendleton',
  active: true,
  is_credo_staff: true,
  is_facilitator: false,
  is_poc: false,
  staff_billet_or_role: 'Director',
  staff_status_next_action: 'On station',
  staff_prd_eaos: '2027',
  staff_display_order: 2,
});
const nameOnly = mapTeamDirectoryPerson({
  id: '2',
  name: 'Facilitator In Name Only',
  command_organization: 'POC Office',
  active: true,
  is_credo_staff: false,
  is_facilitator: false,
  is_poc: false,
});
const blair = mapTeamDirectoryPerson({
  id: '3',
  name: 'Blair Both',
  active: true,
  is_credo_staff: true,
  is_facilitator: true,
  is_poc: true,
  staff_billet_or_role: 'Chaplain',
  staff_display_order: 0,
});
const inactive = mapTeamDirectoryPerson({
  id: '4',
  name: 'Inactive Staff',
  active: false,
  is_credo_staff: true,
  is_facilitator: true,
  is_poc: true,
});
const casey = mapTeamDirectoryPerson({
  id: '5',
  name: 'Casey Facilitator',
  command_organization: 'Navy',
  active: true,
  is_credo_staff: false,
  is_facilitator: true,
  is_poc: false,
});
const drew = mapTeamDirectoryPerson({
  id: '6',
  name: 'Drew POC',
  active: true,
  is_credo_staff: false,
  is_facilitator: false,
  is_poc: true,
});
const stringFlags = mapTeamDirectoryPerson({
  id: '7',
  name: 'String Flag',
  active: true,
  is_credo_staff: 'true',
  is_facilitator: 1,
  is_poc: 'yes',
});
const zoe = mapTeamDirectoryPerson({
  id: '8',
  name: 'Zoe Unordered',
  active: true,
  is_credo_staff: true,
  is_facilitator: false,
  is_poc: false,
  staff_display_order: null,
});

assert(ada.rankTitle === 'LCDR', 'rank/title is mapped');
assert(ada.commandOrganization === 'CREDO', 'command/organization is mapped');
assert(ada.installation === 'Camp Pendleton', 'installation is mapped');
assert(ada.staffBilletOrRole === 'Director', 'staff billet is mapped');
assert(ada.staffStatusNextAction === 'On station', 'staff status is mapped');
assert(ada.staffPrdEaos === '2027', 'staff PRD/EAOS is mapped');
assert(ada.isCredoStaff === true && ada.isFacilitator === false && ada.isPoc === false, 'explicit false flags stay false');
assert(stringFlags.isCredoStaff === false && stringFlags.isFacilitator === false && stringFlags.isPoc === false, 'non-boolean flags are not inferred as roles');

const roster = [ada, nameOnly, blair, inactive, casey, drew, stringFlags, zoe, { ...ada, name: 'Ada Duplicate' }];
const ids = (people) => people.map((person) => person.id);

assert(ids(filterTeamDirectory(roster, 'all')).join(',') === '1,3,5,6,2,7,8', 'All Personnel lists each active person once');
assert(!ids(filterTeamDirectory(roster, 'all')).includes('4'), 'inactive personnel are excluded from All Personnel');
assert(ids(filterTeamDirectory(roster, 'staff')).join(',') === '3,1,8', 'CREDO Staff uses is_credo_staff and display order');
assert(ids(filterTeamDirectory(roster, 'facilitators')).join(',') === '3,5', 'Facilitators uses is_facilitator only');
assert(ids(filterTeamDirectory(roster, 'poc')).join(',') === '3,5,6,2,1,7,8', 'Points of Contact lists every active person in display order');
assert(filterTeamDirectory(roster, 'poc').some((person) => person.id === '2' && person.isPoc === false), 'an active person is listed without the POC flag');
assert(!ids(filterTeamDirectory(roster, 'poc')).includes('4'), 'inactive people stay out of Points of Contact');
assert(!ids(filterTeamDirectory(roster, 'staff')).includes('2'), 'a facilitator-like name is not CREDO Staff');
assert(!ids(filterTeamDirectory(roster, 'facilitators')).includes('2'), 'command text does not confer Facilitator');

assert(teamDirectoryRoleBadges(blair).map((badge) => badge.label).join('|') === 'Staff|Facilitator', 'Staff and Facilitator badges still render');
assert(!teamDirectoryRoleBadges(blair).some((badge) => badge.label === 'POC'), 'the legacy POC flag is not a directory badge');
assert(teamDirectoryRoleBadges(ada).map((badge) => badge.label).join('|') === 'Staff', 'Staff badge is shown only for CREDO Staff');
assert(teamDirectoryRoleBadges(nameOnly).length === 0, 'a person with no explicit role gets no badge');
assert(teamDirectoryRoleBadges(stringFlags).length === 0, 'badges are not manufactured from loose flag values');

assert(TEAM_STAFF_COLUMNS.map((column) => column.label).join('|') === 'Name|Billet / Role|PRD / EAOS', 'CREDO Staff columns are Name, Billet / Role, and PRD / EAOS');
assert(!TEAM_STAFF_COLUMNS.some((column) => column.id === 'status'), 'CREDO Staff view does not include a status column');
assert(!directorySource.includes('Status / Next Action'), 'Team directory does not render Status / Next Action');
assert(!/staffCellText[\s\S]*staffStatusNextAction/.test(directorySource), 'Team directory rendering does not print staff status');
assert(directorySource.includes('staffStatusNextAction: cleanText(row?.staff_status_next_action)'), 'staff status remains mapped for the personnel record');
assert(dbSource.includes('staff_status_next_action'), 'directory fetch still reads staff_status_next_action');
assert(/status_next_action/.test(dbSource), 'legacy team_members status field remains in the data layer');
assert(TEAM_DIRECTORY_EMPTY_MESSAGES.staff === 'No active CREDO Staff have been designated yet.', 'CREDO Staff empty state copy');
assert(TEAM_DIRECTORY_EMPTY_MESSAGES.poc === 'No active people are in the directory.', 'POC empty state copy');
assert(!Object.values(TEAM_DIRECTORY_EMPTY_MESSAGES).some((message) => /facilitator/i.test(message)), 'Team empty states do not mention facilitators');

let diffNames = '';
let status = '';
try {
  diffNames = execFileSync('git', ['diff', '--name-only', '--', 'js/monthly-report-pptx-export.js', 'js/mir-pptx-preview.js', 'js/mir-photo-upload.js', 'js/mir-photo-view.js'], { cwd: ROOT, encoding: 'utf8' });
  status = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git inspection failed: ${error.message}`);
}

assert(diffNames.trim() === '', 'MIR export files are unchanged');
let migrationDiff = '';
try {
  migrationDiff = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`migration diff failed: ${error.message}`);
}
assert(migrationDiff.trim() === '', 'committed migrations are unchanged');
const migrationLines = status.split('\n').filter((line) => line.includes('supabase/migrations/'));
assert(migrationLines.every((line) => line.includes('037_delete_directory_person.sql') || line.includes('038_structured_t4t_attendance_person.sql') || line.includes('039_event_personnel.sql') || line.includes('040_event_personnel_facilitator_backfill.sql') || line.includes('041_event_personnel_poc_backfill.sql')), 'new migrations are personnel deletion, structured T4T attendance identity, the event personnel foundation, the facilitator relationship backfill, or the POC relationship backfill');

const untrackedPptx = [
  'scripts/spike-output/section_iii_sorm_command_function_navy_governance_training  -  Repaired.pptx',
  'scripts/spike-output/section_iv_navstds_occstds_navy_governance_training  -  Repaired.pptx',
];
const untracked = status.split('\n').filter(Boolean).map((line) => unquoteGitPath(line.slice(3)));
for (const filePath of untrackedPptx) {
  assert(untracked.includes(filePath), `repaired PowerPoint remains untracked: ${filePath}`);
  assert(!diffNames.includes(filePath), `repaired PowerPoint was not edited: ${filePath}`);
}

if (errors.length) {
  console.error('validate-stage-2a-team-directory failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-2a-team-directory: ok');
