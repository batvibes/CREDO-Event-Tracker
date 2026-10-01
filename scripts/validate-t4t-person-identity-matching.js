/**
 * T4T bulk-entry identity matching checks.
 * Run: node scripts/validate-t4t-person-identity-matching.js
 *
 * Does not connect to Supabase and does not create people or completion rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchDirectoryPerson, personnelDisplayName } from '../js/personnel-identity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const matcherSource = read('js/personnel-identity.js');
const app = read('js/app.js');
const db = read('js/db.js');
const facilitator = read('js/facilitator-management.js');
const people = [
  {
    id: 'john',
    name: 'John Adams',
    rankTitle: 'LCDR',
    active: true,
    aliases: [],
  },
  {
    id: 'inactive',
    name: 'Jane Smith',
    rank_title: 'CDR',
    active: false,
    aliases: [{ displayName: 'J. Smith' }],
  },
  {
    id: 'legacy',
    name: 'CDR Scanlon',
    rankTitle: '',
    active: true,
    aliases: [],
  },
];
const aliases = [
  { personId: 'john', displayName: 'J. Adams' },
];
const peopleSnapshot = JSON.stringify(people);
const aliasSnapshot = JSON.stringify(aliases);

assert(personnelDisplayName('LCDR', 'John Adams') === 'LCDR John Adams', 'existing display names stay unchanged');
assert(!matcherSource.includes('supabase') && !matcherSource.includes('.from(') && !matcherSource.includes('.rpc('), 'the matcher does not write to the database');
assert(!app.includes('matchDirectoryPerson'), 'event UI delegates matching to the T4T completion workflow');
assert(read('js/t4t-completion-entry.js').includes('matchDirectoryPerson'), 'the T4T completion workflow uses the identity matcher');
assert(!facilitator.includes('matchDirectoryPerson'), 'Facilitator Management does not match or create people');
assert(!db.includes('matchDirectoryPerson'), 'the database layer does not record matches');
assert(!matcherSource.includes('save_facilitator_qualification') && !matcherSource.includes('record_facilitator_t4t_completion'), 'the matcher does not change qualifications or completion history');
assert(!matcherSource.includes('PERSONNEL_RANK_TOKENS'), 'probable matching does not use a rank vocabulary');
assert(!/levenshtein|similarity\s*\(|pg_trgm|soundex/i.test(matcherSource), 'the matcher does not use fuzzy name comparison');

const displayMatch = matchDirectoryPerson('  lcdr   john adams ', people, aliases);
assert(displayMatch.status === 'exact' && displayMatch.selectedPersonId === 'john', 'an exact display name returns that person id');
assert(displayMatch.normalizedInput === 'lcdr john adams', 'case and whitespace use the existing normalization');
assert(displayMatch.canCreateNew === false, 'an exact match cannot create a new person');
assert(displayMatch.candidates[0].active === true, 'an exact match keeps the person active state');

const personalMatch = matchDirectoryPerson('John Adams', people, aliases);
assert(personalMatch.status === 'exact' && personalMatch.selectedPersonId === 'john', 'an exact personal name returns that person id');
assert(personalMatch.candidates[0].match === 'personal-name', 'the personal-name match is identified');

const aliasMatch = matchDirectoryPerson('J. Adams', people, aliases);
assert(aliasMatch.status === 'exact' && aliasMatch.selectedPersonId === 'john' && aliasMatch.candidates[0].match === 'alias', 'a passed-in alias is an exact match');
const attachedAlias = matchDirectoryPerson('J. Smith', people, []);
assert(attachedAlias.status === 'exact' && attachedAlias.selectedPersonId === 'inactive', 'an alias already on the person is an exact match');

const probable = matchDirectoryPerson('LT John Adams', people, aliases);
assert(probable.status === 'probable' && probable.selectedPersonId == null, 'a military title prefix is probable without a rank list');
assert(probable.canCreateNew === false, 'a probable match cannot create a new person');
assert(probable.candidates.map((candidate) => candidate.personId).join(',') === 'john', 'the probable candidate is the existing person');
assert(probable.candidates[0].rankTitle === 'LCDR' && probable.candidates[0].commandOrganization === '', 'rank and command are shown as candidate metadata');
assert(matchDirectoryPerson('LCDR John Adams', [
  { id: 'john', name: 'John Adams', rankTitle: '', active: true },
], []).status === 'probable', 'an unrecognized leading title still finds the personal name');

const civilian = { id: 'robert', name: 'Robert Jones', rankTitle: '', commandOrganization: '', active: true };
const civilianExact = matchDirectoryPerson('Robert Jones', [civilian], []);
assert(civilianExact.status === 'exact' && civilianExact.selectedPersonId === 'robert', 'a civilian with no rank matches the personal name exactly');
assert(civilianExact.candidates[0].rankTitle === '' && civilianExact.candidates[0].commandOrganization === '', 'missing rank and command stay blank');
const doctor = matchDirectoryPerson('Dr. Jane Smith', [
  { id: 'jane', name: 'Jane Smith', rankTitle: '', command_organization: '', active: true },
], []);
assert(doctor.status === 'probable' && doctor.selectedPersonId == null && doctor.canCreateNew === false, 'a civilian title prefix is probable');
assert(doctor.candidates[0].personId === 'jane' && doctor.candidates[0].commandOrganization === '', 'a civilian without an organization remains the candidate');
const mister = matchDirectoryPerson('Mr. Robert Jones', [
  { ...civilian, commandOrganization: 'Naval Hospital' },
], []);
assert(mister.status === 'probable' && mister.candidates[0].commandOrganization === 'Naval Hospital', 'organization is display metadata and does not decide the match');

const boundary = matchDirectoryPerson('Joanne', [
  { id: 'ann', name: 'Ann', active: true },
  { id: 'joanne', name: 'Joanne', active: true },
], []);
assert(boundary.status === 'exact' && boundary.selectedPersonId === 'joanne', 'Ann does not match inside Joanne');
assert(matchDirectoryPerson('Joanne', [{ id: 'ann', name: 'Ann', active: true }], []).status === 'new', 'a shorter name inside one word is not probable');

const inactive = matchDirectoryPerson('CDR Jane Smith', people, aliases);
assert(inactive.status === 'exact' && inactive.selectedPersonId === 'inactive', 'an inactive person is still an exact identity match');
assert(inactive.candidates[0].active === false, 'an inactive match stays inactive');

const ambiguous = matchDirectoryPerson('John Adams', [
  { id: 'a', name: 'John Adams', rankTitle: 'LCDR', active: true },
  { id: 'b', name: 'John Adams', rankTitle: 'LT', active: true },
], []);
assert(ambiguous.status === 'ambiguous' && ambiguous.selectedPersonId == null, 'two personal-name matches stay ambiguous');
assert(ambiguous.canCreateNew === false, 'an ambiguous match cannot create a new person');
assert(ambiguous.candidates.map((candidate) => candidate.personId).sort().join(',') === 'a,b', 'ambiguous results include every candidate');

const unmatched = matchDirectoryPerson('Pat Noone', people, aliases);
assert(unmatched.status === 'new' && unmatched.candidates.length === 0 && unmatched.selectedPersonId == null, 'no plausible candidate is a new-person result');
assert(unmatched.canCreateNew === true, 'only a new result can create a person');
assert(matchDirectoryPerson('   ', people, aliases).canCreateNew === false, 'a blank name cannot create a person');

assert(JSON.stringify(people) === peopleSnapshot && JSON.stringify(aliases) === aliasSnapshot, 'matching does not change people or aliases');

if (errors.length) {
  console.error('validate-t4t-person-identity-matching failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-t4t-person-identity-matching: ok');
