/**
 * Facilitators roster identity and surname sorting.
 * Run: node scripts/validate-facilitator-roster-identity.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sortFacilitatorPersonnel, summarizeFacilitatorPersonnel } from '../js/facilitator-management.js';
import {
  directoryPersonnelName,
  directoryPersonnelNeedsReview,
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

function person(id, extra) {
  return {
    id,
    commandOrganization: 'Navy',
    installation: 'Camp Pendleton',
    productCount: 1,
    eventsConducted: 1,
    mostRecentOn: '2024-06-01',
    active: true,
    ...extra,
  };
}

const scanlon = person('scanlon', {
  name: 'John Scanlon',
  firstName: 'John',
  lastName: 'Scanlon',
  rankTitle: 'CDR',
  displayName: 'CDR John Scanlon',
});
const guy = person('guy', {
  name: 'New Guy',
  firstName: 'New',
  lastName: 'Guy',
  rankTitle: 'PO2',
  displayName: 'PO2 New Guy',
});
const adams = person('adams', {
  name: 'Adams',
  firstName: '',
  lastName: 'Adams',
  rankTitle: 'Chaplain',
  displayName: 'Chaplain Adams',
});
const zoe = person('zoe', {
  name: 'Zoe Adams',
  firstName: 'Zoe',
  lastName: 'Adams',
  rankTitle: 'LCDR',
  displayName: 'LCDR Zoe Adams',
});
const james = person('james', {
  name: 'James',
  firstName: 'James',
  lastName: '',
  rankTitle: '',
  displayName: 'James',
});
const legacy = person('legacy', {
  name: 'Chaplain Alexander',
  firstName: '',
  lastName: '',
  rankTitle: '',
  displayName: 'Chaplain Alexander',
});

assert(directoryPersonnelName(scanlon) === 'Scanlon, John', 'a first and last name display as Last, First');
assert(scanlon.rankTitle === 'CDR' && !directoryPersonnelName(scanlon).includes('CDR'), 'rank stays out of the Name value');
assert(directoryPersonnelName(adams) === 'Adams', 'a last name alone displays as that last name');
assert(directoryPersonnelName(james) === 'James', 'a first name alone displays as that first name');
assert(directoryPersonnelName(legacy) === 'Chaplain Alexander', 'a legacy record keeps its combined name');
assert(directoryPersonnelNeedsReview(legacy) === true, 'a legacy record needs review');
assert(directoryPersonnelNeedsReview(adams) === false, 'a last-name-only record does not need review');
assert(directoryPersonnelNeedsReview(james) === false, 'a first-name-only record does not need review');

const roster = [scanlon, guy, adams, zoe, james, legacy];
const ascending = sortFacilitatorPersonnel(roster, 'name', 'asc').map((entry) => entry.id);
assert(ascending.join(',') === 'adams,zoe,legacy,guy,james,scanlon', 'Name ascending sorts by surname, then first name');
assert(sortFacilitatorPersonnel(roster, 'name', 'desc').map((entry) => entry.id).join(',') === [...ascending].reverse().join(','), 'Name descending reverses that order');
assert(ascending.indexOf('adams') < ascending.indexOf('scanlon') && ascending.indexOf('guy') < ascending.indexOf('scanlon'), 'rank does not place CDR ahead of later surnames');

const sameLast = sortFacilitatorPersonnel([
  person('b', { name: 'Zoe Adams', firstName: 'Zoe', lastName: 'Adams', rankTitle: 'CDR', displayName: 'CDR Zoe Adams' }),
  person('a', { name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', rankTitle: 'PO2', displayName: 'PO2 Ann Adams' }),
], 'name', 'asc').map((entry) => entry.id);
assert(sameLast.join(',') === 'a,b', 'the same surname uses first name before rank');

const tied = sortFacilitatorPersonnel([
  person('b', { name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', rankTitle: 'CDR', displayName: 'CDR Ann Adams' }),
  person('a', { name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', rankTitle: 'CDR', displayName: 'CDR Ann Adams' }),
], 'name', 'asc').map((entry) => entry.id);
assert(tied.join(',') === 'a,b', 'equal structured names use the stable id tie-breaker');

const byCommand = sortFacilitatorPersonnel([
  person('young', { name: 'Zoe Young', firstName: 'Zoe', lastName: 'Young', rankTitle: 'CDR', displayName: 'CDR Zoe Young', commandOrganization: 'Navy' }),
  person('adams-navy', { name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', rankTitle: 'PO1', displayName: 'PO1 Ann Adams', commandOrganization: 'Navy' }),
  person('other', { name: 'Bea West', firstName: 'Bea', lastName: 'West', rankTitle: '', displayName: 'Bea West', commandOrganization: 'Army' }),
], 'command', 'asc').map((entry) => entry.id);
assert(byCommand.join(',') === 'other,adams-navy,young', 'Command sort stays primary and breaks ties by structured name');

const byInstallation = sortFacilitatorPersonnel([
  person('late', { installation: 'San Diego', name: 'Zoe Young', firstName: 'Zoe', lastName: 'Young', rankTitle: 'CDR', displayName: 'CDR Zoe Young' }),
  person('early', { installation: 'San Diego', name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', rankTitle: 'PO1', displayName: 'PO1 Ann Adams' }),
  person('pendleton', { installation: 'Camp Pendleton', name: 'Bea West', firstName: 'Bea', lastName: 'West', rankTitle: '', displayName: 'Bea West' }),
], 'installation', 'asc').map((entry) => entry.id);
assert(byInstallation.join(',') === 'pendleton,early,late', 'Installation sort stays primary and breaks ties by structured name');

const byProducts = sortFacilitatorPersonnel([
  person('more', { productCount: 3, name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', displayName: 'PO1 Ann Adams', rankTitle: 'PO1' }),
  person('less-b', { productCount: 1, name: 'Zoe Young', firstName: 'Zoe', lastName: 'Young', displayName: 'CDR Zoe Young', rankTitle: 'CDR' }),
  person('less-a', { productCount: 1, name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', displayName: 'LCDR Ann Adams', rankTitle: 'LCDR' }),
], 'products', 'asc').map((entry) => entry.id);
assert(byProducts.join(',') === 'less-a,less-b,more', 'Products sort stays numeric and breaks ties by structured name');

const byEvents = sortFacilitatorPersonnel([
  person('more', { eventsConducted: 4, name: 'Zoe Young', firstName: 'Zoe', lastName: 'Young', displayName: 'CDR Zoe Young', rankTitle: 'CDR' }),
  person('less', { eventsConducted: 1, name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', displayName: 'PO1 Ann Adams', rankTitle: 'PO1' }),
], 'events', 'asc').map((entry) => entry.id);
assert(byEvents.join(',') === 'less,more', 'Events Conducted sort stays numeric');

const byRecent = sortFacilitatorPersonnel([
  person('later', { mostRecentOn: '2025-02-01', name: 'Zoe Young', firstName: 'Zoe', lastName: 'Young', displayName: 'CDR Zoe Young', rankTitle: 'CDR' }),
  person('same-b', { mostRecentOn: '2024-01-01', name: 'Zoe Young', firstName: 'Zoe', lastName: 'Young', displayName: 'CDR Zoe Young', rankTitle: 'CDR' }),
  person('same-a', { mostRecentOn: '2024-01-01', name: 'Ann Adams', firstName: 'Ann', lastName: 'Adams', displayName: 'PO1 Ann Adams', rankTitle: 'PO1' }),
], 'recent', 'asc').map((entry) => entry.id);
assert(byRecent.join(',') === 'same-a,same-b,later', 'Most Recent sort stays chronological and breaks ties by structured name');

const products = [{ id: 'safetalk', name: 'safeTALK', code: 'safetalk', active: true, sort_order: 1 }];
const included = summarizeFacilitatorPersonnel(
  [{ id: 'past', name: 'Pat', active: true, is_facilitator: false }],
  [{ person_id: 'past', product_id: 'safetalk', events_conducted: 1 }],
  [],
  products,
);
assert(included.length === 1 && included[0].isFacilitator === false, 'historical facilitation still includes a person without the facilitator flag');

const app = read('js/app.js');
const html = read('index.html');
const css = read('css/styles.css');
const paint = app.slice(app.indexOf('function paintFacilitatorPersonnel'), app.indexOf('function appendDetailLine'));
assert(paint.includes('directoryPersonnelName(person)'), 'the Facilitators name cell uses the shared directory name');
assert(paint.includes("rankCell.className = 'facilitator-rank'"), 'rank is a separate cell');
assert(!paint.includes('nameCell.textContent = person.displayName'), 'the Name cell does not use the combined display name');
assert(paint.includes('person.displayName || \'Facilitator\''), 'the profile opener still identifies the row');
assert(app.includes("title.textContent = person.displayName || 'Facilitator'"), 'the facilitator profile title still uses the existing display name');
assert(html.includes('<th class="facilitator-rank">Rank / Title</th>') && html.includes('<th>Name</th>'), 'the roster header is Rank / Title then Name');
assert(app.includes("{ key: 'name', index: 1 }") && app.includes("{ key: 'recent', index: 6 }"), 'Name and the later columns remain sortable after the rank column');
assert(paint.includes("event.target.closest('.personnel-row-delete')"), 'the delete control still does not open the profile');
assert(css.includes('td.facilitator-rank') && css.includes('font-weight: 400') && css.includes('color: #4b5563'), 'Rank / Title stays subdued');
assert(!css.includes('background: #fef2f2') && !css.includes('outline: 2px solid #991b1b'), 'the delete control no longer uses a bright red highlight');
assert(css.includes('.personnel-row-delete:focus-visible') && css.includes('outline: 2px solid #c4b5b5'), 'the delete control keeps a visible focus state');

if (errors.length) {
  console.error(`validate-facilitator-roster-identity: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-facilitator-roster-identity: ok');
