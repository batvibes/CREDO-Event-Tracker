/**
 * Event Details facilitator and POC dropdown labels.
 * Run: node scripts/validate-event-personnel-menu.js
 *
 * Reads the current app. Does not connect to Supabase.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { personnelDisplayName } from '../js/personnel-identity.js';
import {
  compareEventMenuPeople,
  eventMenuPersonLabel,
  visibleFacilitatorMenuOptions,
  visiblePersonnelMenuOptions,
} from '../js/event-reference-fields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start !== -1 && end !== -1, `missing slice ${startNeedle}`);
  return source.slice(start, end);
}

const fields = read('js/event-reference-fields.js');
const app = read('js/app.js');
const peopleMount = sliceBetween(fields, 'function mountPeopleMulti', 'function mountStaffMulti');
const staffMount = sliceBetween(fields, 'function mountStaffMulti', 'export function initEventReferenceFields');
const selection = sliceBetween(
  peopleMount,
  'const person = [...directory, ...menuSource].find((entry) => entry.id === button.dataset.id);',
  'data-action="add-person"',
);
const sync = sliceBetween(app, 'function syncFacilitatorPickerPeople', 'async function loadFacilitatorPickerPeople');
const reload = sliceBetween(app, 'async function reloadEventsAfterCanonicalRename', 'function applyPermissions');

assert(peopleMount.includes('eventMenuPersonLabel(person)'), 'facilitator and POC options use the menu label');
assert(!peopleMount.includes('ref-menu-option-name">${escapeHtml(personnelDisplayName'), 'open menu options do not render the rank-bearing display name');
assert(selection.includes('personnelDisplayName(person.rankTitle, person.name)'), 'selecting a person keeps the rank-bearing canonical name');
assert(selection.includes('name: displayName'), 'the selected chip stores that canonical name');
assert(staffMount.includes('escapeHtml(member.name)'), 'CREDO Staff options still use the team member name');
assert(!staffMount.includes('eventMenuPersonLabel'), 'CREDO Staff does not use the facilitator/POC menu label');
assert(!sync.includes('if (existing) return existing'), 'the facilitator menu does not keep a stale directory person');
assert(sync.includes('pickerField(row, [\'first_name\', \'firstName\']'), 'a cleared first name replaces the previous facilitator menu identity');
assert(reload.includes('refreshFacilitatorPickerIdentity()'), 'a canonical save refreshes facilitator menu identity from the current directory');

assert(eventMenuPersonLabel({
  rankTitle: 'Chaplain',
  firstName: 'John',
  lastName: 'Adams',
  name: 'John Adams',
}) === 'Adams, John', 'a full structured name displays as Last, First');
assert(eventMenuPersonLabel({
  rankTitle: 'Chaplain',
  firstName: null,
  lastName: 'Adams',
  name: 'Adams',
}) === 'Adams', 'a last name alone displays without rank or a comma');
assert(eventMenuPersonLabel({
  rankTitle: 'CDR',
  firstName: 'John',
  lastName: 'Scanlon',
  name: 'John Scanlon',
}) === 'Scanlon, John', 'Scanlon displays without rank');
assert(eventMenuPersonLabel({
  rankTitle: 'LT',
  firstName: 'Dawn',
  lastName: 'Ashley',
  name: 'Dawn Ashley',
}) === 'Ashley, Dawn', 'Ashley displays without rank');
assert(eventMenuPersonLabel({
  rankTitle: 'LT',
  firstName: 'James',
  lastName: null,
  name: 'James',
}) === 'James', 'a first name alone displays that first name');
assert(eventMenuPersonLabel({
  rankTitle: 'CDR',
  firstName: null,
  lastName: null,
  name: 'Pat Legacy',
  aliases: [{ displayName: 'Obsolete Alias' }],
}) === 'Pat Legacy', 'a legacy person uses the current personal name, not an alias');

const adams = {
  id: 'adams',
  rankTitle: 'Chaplain',
  firstName: null,
  lastName: 'Adams',
  name: 'Adams',
  aliases: [{ displayName: 'Chaplain John Adams' }],
};
const scanlon = {
  id: 'scanlon',
  rankTitle: 'CDR',
  firstName: 'John',
  lastName: 'Scanlon',
  name: 'John Scanlon',
  email: 'scanlon@example.test',
};
const ashley = {
  id: 'ashley',
  rankTitle: 'LT',
  firstName: 'Dawn',
  lastName: 'Ashley',
  name: 'Dawn Ashley',
};
const alexander = {
  id: 'alexander',
  rankTitle: 'Chaplain',
  firstName: null,
  lastName: 'Alexander',
  name: 'Alexander',
};
const armes = {
  id: 'armes',
  rankTitle: 'LCDR',
  firstName: null,
  lastName: 'Armes',
  name: 'Armes',
};
const zeller = {
  id: 'zeller',
  rankTitle: 'Admiral',
  firstName: 'Amy',
  lastName: 'Zeller',
  name: 'Amy Zeller',
};
const roster = [zeller, scanlon, ashley, armes, adams, alexander];

assert(
  visiblePersonnelMenuOptions(roster, '').map((person) => person.id).join(',')
    === 'adams,alexander,armes,ashley,scanlon,zeller',
  'menu results sort by last name, then first name, ignoring rank',
);
assert(
  visibleFacilitatorMenuOptions(roster, roster, '').map((person) => eventMenuPersonLabel(person)).join('|')
    === 'Adams|Alexander|Armes|Ashley, Dawn|Scanlon, John|Zeller, Amy',
  'the facilitator menu shows the same current labels',
);

const johnAdams = {
  id: 'john-adams',
  rankTitle: 'Chaplain',
  firstName: 'John',
  lastName: 'Adams',
  name: 'John Adams',
};
const byFirst = visiblePersonnelMenuOptions([johnAdams, scanlon, ashley], 'John');
assert(byFirst.map((person) => person.id).join(',') === 'john-adams,scanlon', 'first-name search finds current people named John');
assert(
  byFirst.map((person) => eventMenuPersonLabel(person)).join('|') === 'Adams, John|Scanlon, John',
  'first-name search still renders Last, First',
);
const aliasJohn = visiblePersonnelMenuOptions([adams, scanlon], 'John');
assert(aliasJohn.map((person) => person.id).join(',') === 'adams,scanlon', 'an alias containing John can find the current person');
assert(
  aliasJohn.map((person) => eventMenuPersonLabel(person)).join('|') === 'Adams|Scanlon, John',
  'an alias match does not render the obsolete name',
);

const byLast = visiblePersonnelMenuOptions(roster, 'Scan');
assert(byLast.length === 1 && eventMenuPersonLabel(byLast[0]) === 'Scanlon, John', 'a last-name fragment finds the current label');

const byRank = visiblePersonnelMenuOptions(roster, 'Chaplain');
assert(byRank.map((person) => person.id).join(',') === 'adams,alexander', 'rank search still finds current chaplains');
assert(byRank.every((person) => !eventMenuPersonLabel(person).includes('Chaplain')), 'rank search does not put the rank in the option label');

const byAlias = visibleFacilitatorMenuOptions(roster, roster, 'Chaplain John Adams');
assert(byAlias.length === 1 && byAlias[0].id === 'adams', 'an old alias resolves to the one current person');
assert(eventMenuPersonLabel(byAlias[0]) === 'Adams', 'an alias match renders the current last name');
assert(
  personnelDisplayName(byAlias[0].rankTitle, byAlias[0].name) === 'Chaplain Adams',
  'the same person still has the rank-bearing canonical display',
);

const byEmail = visiblePersonnelMenuOptions(roster, 'scanlon@example.test');
assert(byEmail.length === 1 && byEmail[0].id === 'scanlon', 'email search still finds the current person');

const outside = {
  id: 'ordinary',
  name: 'Hotel Contact',
  rankTitle: null,
  active: true,
};
assert(
  !visibleFacilitatorMenuOptions(roster, [outside, ...roster], '').some((person) => person.id === 'ordinary'),
  'the default facilitator menu does not gain ordinary directory people',
);
assert(
  visibleFacilitatorMenuOptions(roster, [outside, ...roster], 'Hotel Contact').some((person) => person.id === 'ordinary'),
  'an exact typed directory name can still resolve that person',
);

if (errors.length) {
  console.error(`validate-event-personnel-menu: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-event-personnel-menu: PASS');
