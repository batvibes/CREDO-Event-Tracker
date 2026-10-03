/**
 * Points of Contact directory and person-picker order.
 * Run: node scripts/validate-poc-directory.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparePersonnelDisplayNames } from '../js/personnel-identity.js';
import {
  PERSONNEL_MENU_RESULT_LIMIT,
  visiblePersonnelMenuOptions,
} from '../js/event-reference-fields.js';
import {
  TEAM_DIRECTORY_EMPTY_MESSAGES,
  directoryPersonnelName,
  directoryPersonnelNeedsReview,
  filterTeamDirectory,
  mapTeamDirectoryPerson,
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

function person(id, name, extra = {}) {
  return mapTeamDirectoryPerson({
    id,
    name,
    active: true,
    is_credo_staff: false,
    is_facilitator: false,
    is_poc: false,
    ...extra,
  });
}

const ordinary = person('ordinary', 'Hotel Contact');
const staff = person('staff', 'John Scanlon', { rank_title: 'CDR', is_credo_staff: true, staff_display_order: 1 });
const facilitator = person('facilitator', 'Brian Hamer', { rank_title: 'LCDR', is_facilitator: true });
const inactive = person('inactive', 'Former Contact', { active: false, is_poc: true });
const roster = [ordinary, staff, facilitator, inactive];
const pocIds = filterTeamDirectory(roster, 'poc').map((entry) => entry.id);
const staffIds = filterTeamDirectory(roster, 'staff').map((entry) => entry.id);

assert(pocIds.includes('ordinary'), 'A: an active person with every role flag false is in Points of Contact');
assert(pocIds.includes('staff'), 'B: active CREDO Staff are in Points of Contact');
assert(pocIds.includes('facilitator'), 'C: active facilitators are in Points of Contact');
assert(!pocIds.includes('inactive'), 'D: inactive people stay out of Points of Contact');
assert(staffIds.join(',') === 'staff', 'J: CREDO Staff still uses the staff flag');
assert(!staffIds.includes('ordinary') && !staffIds.includes('facilitator'), 'J: the staff tab does not gain ordinary or facilitator-only people');
assert(filterTeamDirectory(roster, 'poc').every((entry) => entry.active === true), 'Points of Contact stays limited to active people');
assert(new Set(pocIds).size === pocIds.length, 'Points of Contact does not duplicate a person');
assert(
  filterTeamDirectory(roster, 'poc').map((entry) => entry.id).join(',')
    === [...roster.filter((entry) => entry.active)].sort(comparePersonnelDisplayNames).map((entry) => entry.id).join(','),
  'F: Points of Contact order follows the shared display-name comparator',
);

const structuredRoster = [
  person('zoe', 'Zoe Adams', { first_name: 'Zoe', last_name: 'Adams', rank_title: 'CDR' }),
  person('ann', 'Ann Adams', { first_name: 'Ann', last_name: 'Adams', rank_title: 'LCDR' }),
  person('john', 'John Smith', { first_name: 'John', last_name: 'Smith' }),
];
assert(
  filterTeamDirectory(structuredRoster, 'poc').map((entry) => entry.id).join(',') === 'ann,zoe,john',
  'structured Points of Contact sort by last name, then first name',
);

const legacyRoster = [
  person('late', 'Zoe Late'),
  person('early', 'Aaron Early'),
];
assert(
  filterTeamDirectory(legacyRoster, 'poc').map((entry) => entry.id).join(',') === 'early,late',
  'legacy Points of Contact keep display-name order',
);

const mixedRoster = [
  person('legacy-scanlon', 'CDR John Scanlon'),
  person('structured-adams', 'Zoe Adams', { first_name: 'Zoe', last_name: 'Adams' }),
  person('structured-young', 'Ann Young', { first_name: 'Ann', last_name: 'Young' }),
  person('legacy-early', 'Aaron Early'),
  person('partial', 'Marta Zoe', { last_name: 'Adams' }),
];
assert(
  filterTeamDirectory(mixedRoster, 'poc').map((entry) => entry.id).join(',')
    === 'legacy-early,partial,structured-adams,legacy-scanlon,structured-young',
  'a last name alone sorts under that last name, and legacy names stay on display order',
);
const chaplainAdams = [
  person('chaplain-adams', 'Adams', { last_name: 'Adams', rank_title: 'Chaplain' }),
  person('legacy-chaplain', 'Chaplain Baker'),
  person('young', 'Carl Young', { first_name: 'Carl', last_name: 'Young' }),
];
assert(
  filterTeamDirectory(chaplainAdams, 'poc').map((entry) => entry.id).join(',')
    === 'chaplain-adams,legacy-chaplain,young',
  'Chaplain Adams with last name Adams sorts under Adams',
);
const lastOnly = [
  person('young', 'Young', { last_name: 'Young' }),
  person('adams', 'Adams', { last_name: 'Adams' }),
];
assert(
  filterTeamDirectory(lastOnly, 'poc').map((entry) => entry.id).join(',') === 'adams,young',
  'last-name-only people sort by last name',
);
const firstOnly = [
  person('james', 'James', { first_name: 'James' }),
  person('aaron', 'Aaron', { first_name: 'Aaron' }),
];
assert(
  filterTeamDirectory(firstOnly, 'poc').map((entry) => entry.id).join(',') === 'aaron,james',
  'first-name-only people sort by first name',
);

const sameName = [
  person('b', 'John Smith', { first_name: 'John', last_name: 'Smith', rank_title: 'CDR' }),
  person('a', 'John Smith', { first_name: 'John', last_name: 'Smith', rank_title: 'CDR' }),
];
assert(
  filterTeamDirectory(sameName, 'poc').map((entry) => entry.id).join(',') === 'a,b',
  'equal structured names use the stable id tie-breaker',
);
const rankTie = [
  person('lcdr', 'John Smith', { first_name: 'John', last_name: 'Smith', rank_title: 'LCDR' }),
  person('cdr', 'John Smith', { first_name: 'John', last_name: 'Smith', rank_title: 'CDR' }),
];
assert(
  filterTeamDirectory(rankTie, 'poc').map((entry) => entry.id).join(',') === 'cdr,lcdr',
  'matching structured names use display identity before the id',
);

const menuByLastName = visiblePersonnelMenuOptions([
  { id: 'young', name: 'Ann Young', firstName: 'Ann', lastName: 'Young', rankTitle: null },
  { id: 'adams', name: 'Zoe Adams', firstName: 'Zoe', lastName: 'Adams', rankTitle: 'CDR' },
], '');
assert(menuByLastName.map((entry) => entry.id).join(',') === 'adams,young', 'the person menu uses last name before display rank');

const lateInFetch = { id: 'late', name: 'Aaron Early', rankTitle: null, email: 'aaron@example.test' };
const earlyInFetch = { id: 'early', name: 'Zzz Late', rankTitle: null };
const filler = Array.from({ length: 58 }, (_, index) => ({
  id: `filler-${String(index).padStart(2, '0')}`,
  name: `Middle ${String(index).padStart(2, '0')}`,
  rankTitle: null,
}));
const fetchedOrder = [earlyInFetch, ...filler, lateInFetch];
const emptyMenu = visiblePersonnelMenuOptions(fetchedOrder, '');
assert(emptyMenu.length === PERSONNEL_MENU_RESULT_LIMIT, 'the empty menu keeps a visible cap');
assert(emptyMenu[0].id === 'late', 'F: empty-query order is display order, so Aaron Early is first');
assert(!emptyMenu.some((entry) => entry.id === 'early'), 'Zzz Late sorts after the visible cap');
assert(
  emptyMenu.every((entry, index) => index === 0 || comparePersonnelDisplayNames(emptyMenu[index - 1], entry) <= 0),
  'F: the visible menu is sorted before it is capped',
);

const found = visiblePersonnelMenuOptions(fetchedOrder, 'zzz');
assert(found.length === 1 && found[0].id === 'early', 'E/G: search scans the full directory and reaches a person outside the old first-50 cutoff');
const uniqueLate = visiblePersonnelMenuOptions(fetchedOrder, 'aaron early');
assert(uniqueLate.length === 1 && uniqueLate[0].id === 'late', 'E: a person who used to depend on fetch order is found by name');

const directory = read('js/team-personnel-directory.js');
const picker = read('js/event-reference-fields.js');
const db = read('js/db.js');
const createStart = db.indexOf('export async function createPerson');
const createBody = db.slice(createStart, db.indexOf('function referenceNameConflictError'));
assert(directory.includes('return [...personnel].sort(comparePersonnelDisplayNames)'), 'Points of Contact sorts with the shared personnel comparator');
assert(directory.includes("if (tab === 'poc') return sortByDisplayName(active)"), 'Points of Contact uses that shared sort');
assert(picker.includes('.sort(comparePersonnelDisplayNames)'), 'the person menu sorts with the shared personnel comparator');
assert(!directory.includes("person.isPoc === true"), 'Points of Contact no longer filters on the POC flag');
assert(!directory.includes("label: 'POC'"), 'the directory does not render a POC role badge');
const editor = read('js/team-personnel-editor.js');
assert(!editor.includes("checkbox(pocInput, 'Point of Contact')") && !editor.includes('Point of Contact'), 'the personnel editor has no Point of Contact role control');
assert(editor.includes('isPoc: person?.isPoc === true'), 'an ordinary personnel edit sends the stored POC flag back unchanged');
assert(directory.includes("if (tab === 'staff') return sortStaff(active.filter((person) => person.isCredoStaff === true))"), 'J: CREDO Staff filtering is unchanged');
assert(!/events\.facilitators|facilitator_event_tokens|facilitator_product_experience|facilitator_qualifications/.test(directory), 'I: the Team directory does not read facilitator history');
assert(!/facilitator_event_tokens|facilitator_product_experience|facilitator_t4t_product_experience/.test(picker), 'I: the person picker does not write facilitator history');
assert(picker.includes('onCreatePerson({ name: personName })'), 'a genuinely new contact is still created from the typed name');
assert(picker.includes('reuse_or_create_event_person') === false, 'the picker calls the database through its adapter');
assert(db.includes("rpc('reuse_or_create_event_person'"), 'event person creation uses the neutral reuse function');
assert(!createBody.includes('.insert('), 'H: event person creation no longer inserts from the browser');
assert(!createBody.includes('is_facilitator') && !createBody.includes('is_credo_staff') && !createBody.includes('is_poc'), 'H: the browser create wrapper does not set facilitator, staff, or POC flags');
assert(directory.includes("'Name', 'Rank / Title', 'Command / Organization', 'Roles'"), 'directory headers are Name, Rank / Title, Command / Organization, and Roles');
assert(directory.includes("actionHead.textContent = 'Action'"), 'the edit column has an Action header');
assert(directory.includes('button.textContent = \'Edit\''), 'the edit action remains');
assert(directory.includes('rankCell.className = \'team-directory-rank\''), 'every row keeps a Rank / Title cell');
assert(directory.includes('commandCell.className = \'team-directory-command\''), 'every row keeps a Command / Organization cell');
assert(directory.includes('roleCell.className = \'team-directory-roles\''), 'every row keeps a Roles cell');
assert(/if \(person\.commandOrganization\) commandCell\.textContent/.test(directory), 'a blank command leaves the cell in place');
assert(/if \(person\.rankTitle\) rankCell\.textContent/.test(directory), 'a blank rank leaves the cell in place');
assert(directory.includes('return [...personnel].sort(comparePersonnelDisplayNames)'), 'directory sorting still uses the shared structured-name comparator');
const bothNames = person('bareng', 'Ryan Bareng', { first_name: 'Ryan', last_name: 'Bareng', rank_title: 'CDR' });
const lastOnlyName = person('adams', 'Adams', { last_name: 'Adams', rank_title: 'Chaplain' });
const firstOnlyName = person('james', 'James', { first_name: 'James' });
const legacyName = person('legacy', 'Chaplain Alexander');
assert(directoryPersonnelName(bothNames) === 'Bareng, Ryan', 'a structured name displays as Last, First');
assert(directoryPersonnelName(lastOnlyName) === 'Adams', 'a last name alone displays without a comma');
assert(directoryPersonnelName(firstOnlyName) === 'James', 'a first name alone displays without a comma');
assert(!directoryPersonnelName(bothNames).includes('CDR'), 'rank stays out of the Name cell');
assert(directoryPersonnelName(legacyName) === 'Chaplain Alexander', 'a legacy record keeps its existing combined name');
assert(directoryPersonnelNeedsReview(legacyName) === true, 'a legacy record is marked Needs Review');
assert(directoryPersonnelNeedsReview(lastOnlyName) === false, 'a last-name-only record is not marked Needs Review');
assert(directoryPersonnelNeedsReview(firstOnlyName) === false, 'a first-name-only record is not marked Needs Review');
assert(directory.includes("review.textContent = 'Needs Review'"), 'the directory renders the Needs Review indicator');
const directoryCss = read('css/styles.css');
const directoryLayout = directoryCss.slice(directoryCss.indexOf('#view-team .team-directory-list {'), directoryCss.indexOf('#view-team .team-directory-head {'));
assert(directoryLayout.includes('grid-template-columns: subgrid'), 'directory rows share one set of column tracks');
assert(directoryLayout.includes('minmax(11rem, 1.25fr) minmax(5.75rem, 0.42fr) minmax(11rem, 1.2fr) max-content 4.5rem'), 'editable rows use Name, Rank / Title, Command, Roles, and Action tracks');
assert(!directoryLayout.includes('auto 56px'), 'Roles is no longer an independent auto column');
assert(TEAM_DIRECTORY_EMPTY_MESSAGES.poc === 'No active people are in the directory.', 'the empty directory copy matches the active-person view');
assert(TEAM_DIRECTORY_EMPTY_MESSAGES.staff === 'No active CREDO Staff have been designated yet.', 'the CREDO Staff empty copy is unchanged');

if (errors.length) {
  console.error('validate-poc-directory failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-poc-directory: ok');
