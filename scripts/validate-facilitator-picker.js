/**
 * Event Facilitator picker population.
 * Run: node scripts/validate-facilitator-picker.js
 *
 * Reads the current app and migrations. Does not connect to Supabase and
 * does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleFacilitatorMenuOptions } from '../js/event-reference-fields.js';
import { summarizeFacilitatorPersonnel } from '../js/facilitator-management.js';

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
const db = read('js/db.js');
const ordinaryExperience = read('supabase/migrations/025_facilitator_t4t_product_experience.sql');
const tokens = read('supabase/migrations/021_facilitator_experience_foundation.sql');

const facilitatorMount = sliceBetween(fields, "name: 'facilitators'", "name: 'poc'");
const pocMount = sliceBetween(fields, "name: 'poc'", "name: 'credoStaff'");
const staffMount = sliceBetween(fields, "name: 'credoStaff'", 'return {');
const selection = sliceBetween(fields, 'addToken({', '});');
const reusePerson = sliceBetween(db, 'export async function reuseOrCreateEventPerson', 'export async function createPerson');
const createPerson = sliceBetween(db, 'export async function createPerson', 'function referenceNameConflictError');

assert(facilitatorMount.includes('getMenuPeople: getFacilitatorPeople'), 'Facilitator picker uses the facilitator population');
assert(!facilitatorMount.includes('getPeople: () => referencePeople'), 'Facilitator picker does not inline the broad directory');
assert(pocMount.includes('getPeople,') && !pocMount.includes('getMenuPeople'), 'POC picker stays on the broad active directory');
assert(staffMount.includes('getTeamMembers') && !staffMount.includes('getMenuPeople'), 'CREDO Staff picker stays on Manning');
assert(!selection.includes('isFacilitator') && !selection.includes('is_facilitator'), 'selecting a facilitator does not set the facilitator flag');
assert(createPerson.includes('reuseOrCreateEventPerson(name)'), 'Add Person delegates to canonical reuse');
assert(reusePerson.includes("rpc('reuse_or_create_event_person'"), 'a new facilitator identity uses Migration 033');
assert(!createPerson.includes('is_facilitator:') && !createPerson.includes('isFacilitator'), 'event person creation does not set the facilitator flag');
assert(app.includes('getFacilitatorPeople: () => facilitatorPickerPeople'), 'the event form receives the facilitator population');
assert(app.includes('getPeople: () => referencePeople'), 'POC still receives every active person');
assert(app.includes('summarizeFacilitatorPersonnel('), 'the picker population comes from Facilitator Management inclusion');

assert(ordinaryExperience.includes('recorded_on <= current_date'), 'completed facilitation history still requires a recorded date on or before today');
assert(ordinaryExperience.includes('token.is_t4t is true'), 'ordinary facilitation history still excludes T4T events');
assert(tokens.includes('split_facilitator_tokens'), 'facilitator history still comes from the saved facilitator text');
assert(!tokens.includes('credo_staff') && !ordinaryExperience.includes('events.poc'), 'facilitator history does not read staff or POC text');

const people = [
  { id: 'known', name: 'Known Facilitator', rankTitle: null, active: true, is_facilitator: true },
  { id: 'ordinary', name: 'Hotel Contact', rankTitle: null, active: true, is_facilitator: false, is_poc: true },
  { id: 'history', name: 'Past Instructor', rankTitle: null, active: true, is_facilitator: false },
  { id: 't4t-history', name: 'T4T Instructor', rankTitle: null, active: true, is_facilitator: false },
  { id: 'qualified', name: 'Qualified Instructor', rankTitle: null, active: true, is_facilitator: false },
  { id: 'completed', name: 'T4T Graduate', rankTitle: null, active: true, is_facilitator: false },
  { id: 'staff', name: 'Staff Only', rankTitle: null, active: true, is_credo_staff: true, is_facilitator: false },
];
const products = [{ id: 'product', name: 'Workshop', code: 'workshop', active: true, sort_order: 1 }];
const roster = summarizeFacilitatorPersonnel(
  people,
  [{ person_id: 'history', product_id: 'product', events_conducted: 1 }],
  [{ person_id: 'qualified', product_id: 'product', standing: 'active' }],
  products,
  [{ person_id: 't4t-history', product_id: 'product', events_conducted: 1 }],
  [{ person_id: 'completed', product_id: 'product', completed_on: '2026-01-01' }],
);
const rosterIds = roster.map((person) => person.id).sort();
const menu = visibleFacilitatorMenuOptions(roster, people, '');
const menuIds = menu.map((person) => person.id).sort();

assert(menuIds.join(',') === rosterIds.join(','), 'the default Facilitator menu matches Facilitator Management inclusion');
assert(menuIds.includes('known') && menuIds.includes('history') && menuIds.includes('t4t-history'), 'facilitator-relevant people appear in the default menu');
assert(menuIds.includes('qualified') && menuIds.includes('completed'), 'qualification and T4T completion remain roster relevance');
assert(!menuIds.includes('ordinary') && !menuIds.includes('staff'), 'an ordinary contact is absent from the default Facilitator menu');
assert(menu.length !== people.length, 'the default Facilitator menu is not the broad directory');

const typed = visibleFacilitatorMenuOptions(roster, people, 'Hotel Contact');
assert(typed.some((person) => person.id === 'ordinary'), 'typing an existing ordinary person resolves that canonical person');
assert(!typed.some((person) => person.id === 'staff'), 'a partial unrelated person is not added by an exact name');
const partial = visibleFacilitatorMenuOptions(roster, people, 'Hotel');
assert(!partial.some((person) => person.id === 'ordinary'), 'ordinary contacts stay out of partial facilitator search');

if (errors.length) {
  console.error(`validate-facilitator-picker: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-facilitator-picker: PASS');
