/**
 * Event Add Person create-or-reuse checks.
 * Run: node scripts/validate-event-person-reuse.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { personnelDisplayName } from '../js/personnel-identity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function norm(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveEventPerson(people, aliases, typed) {
  const needle = norm(typed);
  const ids = new Set();
  for (const person of people) {
    if (norm(person.name) === needle || norm(personnelDisplayName(person.rankTitle, person.name)) === needle) {
      ids.add(person.id);
    }
  }
  for (const alias of aliases) {
    if (norm(alias.normalizedName) === needle) ids.add(alias.personId);
  }
  if (ids.size > 1) return { status: 'ambiguous', ids: [...ids] };
  if (ids.size === 1) {
    const person = people.find((entry) => entry.id === [...ids][0]);
    return { status: 'reused', person: { ...person } };
  }
  const created = {
    id: `new-${people.length + 1}`,
    name: String(typed ?? '').trim().replace(/\s+/g, ' '),
    rankTitle: null,
    active: true,
    isCredoStaff: false,
    isFacilitator: false,
    isPoc: false,
    email: null,
    phone: null,
  };
  return { status: 'created', person: created };
}

const scanlon = {
  id: 'scanlon',
  name: 'John Scanlon',
  rankTitle: 'CDR',
  email: 'scanlon@example.test',
  active: true,
  isCredoStaff: true,
  isFacilitator: false,
  isPoc: false,
};
const before = { ...scanlon };

const byPersonal = resolveEventPerson([scanlon], [], 'John Scanlon');
assert(byPersonal.status === 'reused' && byPersonal.person.id === 'scanlon', '1: an exact personal name is reused');

const byDisplay = resolveEventPerson([scanlon], [], 'CDR John Scanlon');
assert(byDisplay.status === 'reused' && byDisplay.person.id === 'scanlon', '2: a rank plus personal name reuses the existing display');
assert(byDisplay.person.name === 'John Scanlon' && byDisplay.person.rankTitle === 'CDR', '2: reuse keeps the stored rank and personal name');
assert(JSON.stringify(scanlon) === JSON.stringify(before), '4: reuse does not modify the existing person');

const byAlias = resolveEventPerson(
  [scanlon],
  [{ personId: 'scanlon', normalizedName: 'chaplain scanlon' }],
  'Chaplain Scanlon',
);
assert(byAlias.status === 'reused' && byAlias.person.id === 'scanlon', '3: an exact alias is reused');
assert(byAlias.person.isFacilitator === false && byAlias.person.isCredoStaff === true, '8/9: reuse returns the existing flags unchanged');

const created = resolveEventPerson([scanlon], [], 'Hotel Front Desk');
assert(created.status === 'created', '5: a new name creates a person');
assert(
  created.person.isCredoStaff === false
    && created.person.isFacilitator === false
    && created.person.isPoc === false
    && created.person.rankTitle == null,
  '5: the new person is neutral',
);
const repeated = resolveEventPerson([scanlon, created.person], [], 'Hotel Front Desk');
assert(repeated.status === 'reused' && repeated.person.id === created.person.id, '6: repeating the same name reuses the created person');

const ambiguous = resolveEventPerson(
  [scanlon, { ...scanlon, id: 'other', rankTitle: 'LCDR' }],
  [],
  'John Scanlon',
);
assert(ambiguous.status === 'ambiguous', '7: two personal-name matches are not reduced to one person');

const displayAndAlias = resolveEventPerson(
  [scanlon, { id: 'other', name: 'Pat Other', rankTitle: null, isFacilitator: false }],
  [{ personId: 'other', normalizedName: 'cdr john scanlon' }],
  'CDR John Scanlon',
);
assert(displayAndAlias.status === 'ambiguous', '7: a display match and another person alias are not chosen automatically');

const typo = resolveEventPerson(
  [{ id: 'jason', name: 'Jason Dipinto', rankTitle: null, isFacilitator: false }],
  [],
  'Jason Dipintos',
);
assert(typo.status === 'created', 'a one-character difference stays a new person');

const migration = read('supabase/migrations/033_reuse_or_create_event_person.sql');
const fnStart = migration.indexOf('create or replace function public.reuse_or_create_event_person');
const fn = migration.slice(fnStart, migration.indexOf('comment on function public.reuse_or_create_event_person'));
assert(fn.includes('public.personnel_display_name(person.rank_title, person.name)'), 'the database matches the composed display name');
assert(fn.includes('public.normalize_reference_name(person.name) = v_norm'), 'the database matches the personal name');
assert(fn.includes('alias.normalized_name = v_norm'), 'the database matches an alias');
assert(fn.includes("hint = 'PERSONNEL_IDENTITY_AMBIGUOUS'"), 'an ambiguous match has its own error');
assert(fn.includes('cardinality(v_ids) > 1'), 'more than one match stops the function');
assert(fn.includes('is_credo_staff,\n      is_facilitator,\n      is_poc'), 'a new person stores the three role flags');
assert(fn.includes('values (v_name, true, false, false, false)'), 'a new person is active and neutral');
assert(!/\bupdate\s+public\.people\b/i.test(fn), 'reuse does not update the person');
assert(!/insert\s+into\s+public\.team_members/i.test(fn), 'event person creation does not create Manning');
assert(!/facilitator_qualifications|facilitator_t4t_completions|public\.events/i.test(fn), 'event person creation does not write history or event text');
assert(!/levenshtein|similarity\s*\(|pg_trgm|soundex/i.test(fn), 'event person creation does not fuzzy-match');

const picker = read('js/event-reference-fields.js');
const saveStart = picker.indexOf("menu.querySelector('.ref-inline-save')");
const saveBody = picker.slice(saveStart, picker.indexOf('function personSecondaryText'));
assert(saveBody.includes('onCreatePerson({ name: personName })'), 'Add Person asks the server to reuse or create');
assert(!saveBody.includes('findPersonnelByHistoricalName'), 'Add Person does not keep the first browser match');
assert(saveBody.includes('personnelDisplayName(created.rankTitle, created.name)'), 'a reused person is shown by the canonical display name');
assert(saveBody.includes('Using the existing person'), 'reuse is distinguished from a new person');
assert(saveBody.includes('error?.message'), 'the database identity message is shown');

const staffStart = picker.indexOf('function addOtherStaffName');
const staffBody = picker.slice(staffStart, picker.indexOf('function renderAddOtherPanel'));
assert(staffBody.includes('id: null') && staffBody.includes('orphan: true'), '10: Add Other Staff remains event text');
assert(!staffBody.includes('onCreatePerson') && !staffBody.includes('createPerson'), '10: Add Other Staff does not create a person');

const db = read('js/db.js');
assert(db.includes("rpc('reuse_or_create_event_person'"), 'the client calls the neutral database function');
assert(db.includes('PERSONNEL_IDENTITY_AMBIGUOUS'), 'an ambiguous result stays a specific error');
assert(!db.slice(db.indexOf('export async function createPerson'), db.indexOf('function referenceNameConflictError')).includes('.from(\'people\')'), 'the browser no longer inserts people directly');

const tokens = read('supabase/migrations/024_event_workshop_t4t.sql');
const experience = read('supabase/migrations/025_facilitator_t4t_product_experience.sql');
const tokenView = tokens.slice(tokens.indexOf('create or replace view public.facilitator_event_tokens'), tokens.indexOf('comment on view public.facilitator_event_tokens'));
assert(tokenView.includes('public.split_facilitator_tokens(event.facilitators)'), '13: facilitator credit still comes from facilitator text');
assert(!tokenView.includes('credo_staff') && !tokenView.includes('event.poc'), '11/12: staff and POC text are not facilitator tokens');
assert(experience.includes('token.recorded_on <= current_date'), '14: future facilitator events stay out of completed history');
assert(experience.includes("coalesce(token.event_type, '') in ('SafeTalk T4T', 'ASIST T4T')"), 'T4T deliveries stay on their own aggregate');

if (errors.length) {
  console.error('validate-event-person-reuse failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-event-person-reuse: ok');
