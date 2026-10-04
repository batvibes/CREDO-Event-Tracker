/**
 * Derived Facilitator population cards, product filters, and CREDO-recorded labels.
 * Run: node scripts/validate-facilitator-population-navigation.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACILITATOR_EMPTY_EXPERIENCE,
  FACILITATOR_EMPTY_T4T_EXPERIENCE,
  FACILITATOR_POPULATION_ALL_RECORDS,
  FACILITATOR_POPULATION_CREDO_USED,
  FACILITATOR_POPULATION_TRAINED_POOL,
  FACILITATOR_POPULATIONS,
  countFacilitatorPopulations,
  facilitatorInPopulation,
  facilitatorPopulationDefaultSort,
  filterFacilitatorPersonnel,
  sortFacilitatorPersonnel,
  summarizeFacilitatorPersonnel,
} from '../js/facilitator-management.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function ids(records) {
  return (records ?? []).map((record) => record.id).sort().join(',');
}

const products = [
  { id: 'asist', name: 'ASIST', code: 'asist', active: true, sort_order: 1 },
  { id: 'prep', name: 'PREP', code: 'prep_8_0', active: true, sort_order: 2 },
  { id: 'asist-t4t', name: 'ASIST T4T', code: 'asist_t4t', active: true, sort_order: 3 },
];

function person(id, extra = {}) {
  return {
    id,
    name: extra.name || id,
    first_name: extra.firstName || '',
    last_name: extra.lastName || extra.name || id,
    active: extra.active !== false,
    is_facilitator: extra.isFacilitator === true,
  };
}

const people = [
  person('ordinary', { name: 'Ann Ordinary', firstName: 'Ann', lastName: 'Ordinary' }),
  person('t4t-instructor', { name: 'Bea Instructor', firstName: 'Bea', lastName: 'Instructor' }),
  person('completion', { name: 'Cara Completion', firstName: 'Cara', lastName: 'Completion' }),
  person('qualified', { name: 'Dan Qualified', firstName: 'Dan', lastName: 'Qualified' }),
  person('both-training', { name: 'Eve Both', firstName: 'Eve', lastName: 'Both' }),
  person('flag-only', { name: 'Finn Flag', firstName: 'Finn', lastName: 'Flag', isFacilitator: true }),
  person('used-and-qualified', { name: 'Gia Used', firstName: 'Gia', lastName: 'Used' }),
  person('used-and-completed', { name: 'Hal Used', firstName: 'Hal', lastName: 'Used' }),
  person('cross-product', { name: 'Ivy Cross', firstName: 'Ivy', lastName: 'Cross' }),
  person('inactive-used', { name: 'Zoe Young', firstName: 'Zoe', lastName: 'Young', active: false }),
  person('inactive-trained', { name: 'Ada Young', firstName: 'Ada', lastName: 'Young', active: false }),
  person('outsider', { name: 'Pat Outsider', firstName: 'Pat', lastName: 'Outsider' }),
];

const roster = summarizeFacilitatorPersonnel(
  people,
  [
    {
      person_id: 'ordinary',
      product_id: 'asist',
      events_conducted: 2,
      first_recorded_facilitation_on: '2024-01-01',
      most_recent_facilitation_on: '2024-06-01',
    },
    {
      person_id: 'used-and-qualified',
      product_id: 'asist',
      events_conducted: 1,
      first_recorded_facilitation_on: '2025-01-01',
      most_recent_facilitation_on: '2025-04-01',
    },
    {
      person_id: 'cross-product',
      product_id: 'asist',
      events_conducted: 1,
      first_recorded_facilitation_on: '2023-05-01',
      most_recent_facilitation_on: '2023-05-01',
    },
    {
      person_id: 'inactive-used',
      product_id: 'asist',
      events_conducted: 1,
      first_recorded_facilitation_on: '2022-02-01',
      most_recent_facilitation_on: '2026-01-15',
    },
  ],
  [
    { id: 'qual-dan', person_id: 'qualified', product_id: 'prep', standing: 'registered' },
    { id: 'qual-gia', person_id: 'used-and-qualified', product_id: 'asist', standing: 'provisional' },
    { id: 'qual-inactive', person_id: 'inactive-trained', product_id: 'prep', standing: 'developing' },
  ],
  products,
  [
    {
      person_id: 't4t-instructor',
      product_id: 'asist-t4t',
      events_conducted: 1,
      first_recorded_facilitation_on: '2025-08-01',
      most_recent_facilitation_on: '2025-08-01',
    },
    {
      person_id: 'used-and-completed',
      product_id: 'prep',
      events_conducted: 1,
      first_recorded_facilitation_on: '2024-11-01',
      most_recent_facilitation_on: '2024-11-01',
    },
  ],
  [
    { id: 'done-cara', person_id: 'completion', product_id: 'asist', completed_on: '2026-02-01' },
    { id: 'done-eve', person_id: 'both-training', product_id: 'prep', completed_on: '2026-03-01' },
    { id: 'done-hal', person_id: 'used-and-completed', product_id: 'prep', completed_on: '2024-10-01' },
    { id: 'done-ivy', person_id: 'cross-product', product_id: 'prep', completed_on: '2026-04-01' },
  ],
);

assert(!roster.some((record) => record.id === 'outsider'), 'a person with no facilitator evidence stays off the roster');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'ordinary'), FACILITATOR_POPULATION_CREDO_USED), 'ordinary experience is CREDO-Used');
assert(facilitatorInPopulation(roster.find((record) => record.id === 't4t-instructor'), FACILITATOR_POPULATION_CREDO_USED), 'T4T facilitation experience is CREDO-Used');
assert(!facilitatorInPopulation(roster.find((record) => record.id === 'completion'), FACILITATOR_POPULATION_CREDO_USED), 'T4T completion is not CREDO-Used');
assert(!facilitatorInPopulation(roster.find((record) => record.id === 'qualified'), FACILITATOR_POPULATION_CREDO_USED), 'a qualification is not CREDO-Used');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'completion'), FACILITATOR_POPULATION_TRAINED_POOL), 'T4T completion only is the trained pool');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'qualified'), FACILITATOR_POPULATION_TRAINED_POOL), 'qualification only is the trained pool');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'both-training'), FACILITATOR_POPULATION_TRAINED_POOL), 'completion plus a qualification with no facilitation is the trained pool');
assert(!facilitatorInPopulation(roster.find((record) => record.id === 'flag-only'), FACILITATOR_POPULATION_CREDO_USED), 'the facilitator flag alone is not CREDO-Used');
assert(!facilitatorInPopulation(roster.find((record) => record.id === 'flag-only'), FACILITATOR_POPULATION_TRAINED_POOL), 'the facilitator flag alone is not the trained pool');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'flag-only'), FACILITATOR_POPULATION_ALL_RECORDS), 'the facilitator flag alone stays in All Records');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'used-and-qualified'), FACILITATOR_POPULATION_CREDO_USED), 'facilitation plus a qualification stays CREDO-Used');
assert(!facilitatorInPopulation(roster.find((record) => record.id === 'used-and-qualified'), FACILITATOR_POPULATION_TRAINED_POOL), 'facilitation plus a qualification is not the trained pool');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'used-and-completed'), FACILITATOR_POPULATION_CREDO_USED), 'facilitation plus a completion stays CREDO-Used');
assert(!facilitatorInPopulation(roster.find((record) => record.id === 'used-and-completed'), FACILITATOR_POPULATION_TRAINED_POOL), 'facilitation plus a completion is not the trained pool');
assert(!facilitatorInPopulation(roster.find((record) => record.id === 'cross-product'), FACILITATOR_POPULATION_TRAINED_POOL), 'facilitation for one product keeps a completion for another out of the trained pool');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'inactive-used'), FACILITATOR_POPULATION_CREDO_USED), 'an inactive person with facilitation remains CREDO-Used');
assert(facilitatorInPopulation(roster.find((record) => record.id === 'inactive-trained'), FACILITATOR_POPULATION_TRAINED_POOL), 'an inactive person with a qualification remains in the trained pool');

const counts = countFacilitatorPopulations(roster);
assert(counts[FACILITATOR_POPULATION_CREDO_USED] === 6, 'CREDO-Used counts every person with facilitation evidence');
assert(counts[FACILITATOR_POPULATION_TRAINED_POOL] === 4, 'the trained pool counts completion and qualification records without facilitation');
assert(counts[FACILITATOR_POPULATION_ALL_RECORDS] === roster.length, 'All Records counts the existing facilitator population');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_CREDO_USED })) === 'cross-product,inactive-used,ordinary,t4t-instructor,used-and-completed,used-and-qualified', 'CREDO-Used is facilitation evidence only');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_TRAINED_POOL })) === 'both-training,completion,inactive-trained,qualified', 'the trained pool excludes facilitation and the role flag');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_ALL_RECORDS })) === ids(roster), 'All Records keeps the full summarized roster');

assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_CREDO_USED, productId: 'asist' })) === 'cross-product,inactive-used,ordinary,used-and-qualified', 'CREDO-Used product filtering uses facilitation evidence for that product');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_CREDO_USED, productId: 'asist-t4t' })) === 't4t-instructor', 'CREDO-Used matches a dedicated T4T product from T4T facilitation');
assert(!filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_CREDO_USED, productId: 'prep' }).some((record) => record.id === 'completion' || record.id === 'cross-product'), 'CREDO-Used does not match a product from completion or qualification alone');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_TRAINED_POOL, productId: 'asist' })) === 'completion', 'trained-pool product filtering uses completion or qualification');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_TRAINED_POOL, productId: 'prep' })) === 'both-training,inactive-trained,qualified', 'trained-pool product filtering still requires no CREDO facilitation');
assert(ids(filterFacilitatorPersonnel(roster, { productId: 'asist' })) === 'completion,cross-product,inactive-used,ordinary,used-and-qualified', 'All Records keeps broad product matching across facilitation, qualification, and completion');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_CREDO_USED, active: 'inactive' })) === 'inactive-used', 'the Active filter still limits CREDO-Used');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_TRAINED_POOL, active: 'active' })) === 'both-training,completion,qualified', 'the Active filter still limits the trained pool');
assert(ids(filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_CREDO_USED, query: 'young' })) === 'inactive-used', 'search still applies inside a population');

const credoDefault = facilitatorPopulationDefaultSort(FACILITATOR_POPULATION_CREDO_USED);
const trainedDefault = facilitatorPopulationDefaultSort(FACILITATOR_POPULATION_TRAINED_POOL);
const allDefault = facilitatorPopulationDefaultSort(FACILITATOR_POPULATION_ALL_RECORDS);
assert(credoDefault.column === 'recent' && credoDefault.direction === 'desc', 'CREDO-Used defaults to most recent CREDO descending');
assert(trainedDefault.column === 'name' && trainedDefault.direction === 'asc', 'the trained pool defaults to Name ascending');
assert(allDefault.column === 'name' && allDefault.direction === 'asc', 'All Records defaults to Name ascending');

const recentOrder = sortFacilitatorPersonnel(
  filterFacilitatorPersonnel(roster, { population: FACILITATOR_POPULATION_CREDO_USED }),
  credoDefault.column,
  credoDefault.direction,
).map((record) => record.id);
assert(recentOrder.join(',') === 'inactive-used,t4t-instructor,used-and-qualified,used-and-completed,ordinary,cross-product', 'CREDO-Used default order is most recent CREDO first');
const tiedRecent = sortFacilitatorPersonnel([
  { id: 'b', mostRecentOn: '2024-01-01', firstName: 'Zoe', lastName: 'Young', name: 'Zoe Young', displayName: 'CDR Zoe Young', rankTitle: 'CDR' },
  { id: 'a', mostRecentOn: '2024-01-01', firstName: 'Ann', lastName: 'Adams', name: 'Ann Adams', displayName: 'PO1 Ann Adams', rankTitle: 'PO1' },
], 'recent', 'desc').map((record) => record.id);
assert(tiedRecent.join(',') === 'a,b', 'equal most-recent dates break ties by structured surname');
assert(sortFacilitatorPersonnel(roster, 'name', 'asc').map((record) => record.id).slice(0, 3).join(',') === 'both-training,completion,cross-product', 'Name ascending still sorts by structured surname');
assert(sortFacilitatorPersonnel(roster, 'events', 'desc')[0].id === 'ordinary', 'manual event sorting still works');

const html = read('index.html');
const app = read('js/app.js');
const css = read('css/styles.css');
const model = read('js/facilitator-management.js');
const personnel = html.slice(html.indexOf('id="facilitator-personnel-panel"'), html.indexOf('id="view-settings"'));
const capabilities = html.slice(html.indexOf('id="facilitator-capabilities-panel"'), html.indexOf('id="facilitator-personnel-panel"'));

assert(personnel.includes('CREDO-Used') && personnel.includes('Trained / Qualification Pool') && personnel.includes('All Records'), 'three population cards render');
assert(personnel.includes('People with recorded facilitation on CREDO-tracked events.'), 'the CREDO-Used card uses its description');
assert(personnel.includes('People with T4T completion or qualification records, but no CREDO-recorded facilitation.'), 'the trained-pool card uses its description');
assert(personnel.includes('All facilitator-relevant personnel records.'), 'the All Records card uses its description');
assert(personnel.includes('data-facilitator-population="credo-used"') && personnel.includes('aria-pressed="true"'), 'CREDO-Used starts selected');
assert(personnel.includes('data-facilitator-population-count="credo-used"') && personnel.includes('data-facilitator-population-count="trained-pool"') && personnel.includes('data-facilitator-population-count="all-records"'), 'each card has a count');
assert(personnel.includes('>CREDO Events<') && personnel.includes('>Most Recent CREDO<'), 'the roster uses CREDO-recorded column labels');
assert(!personnel.includes('>Events Conducted<') && !personnel.includes('>Most Recent<'), 'the roster no longer uses the broader column labels');
assert(capabilities.includes('>Most Recent<') && capabilities.includes('>Instructors<'), 'Program Capabilities columns stay unchanged');
assert(!capabilities.includes('facilitator-population-card'), 'population cards stay on the Facilitators roster');
assert(FACILITATOR_EMPTY_EXPERIENCE === 'No CREDO-recorded facilitation.', 'the profile states that missing facilitation is CREDO-recorded');
assert(FACILITATOR_EMPTY_T4T_EXPERIENCE === 'No CREDO-recorded T4T facilitation.', 'missing T4T facilitation is labeled as CREDO-recorded');
assert(model.includes(FACILITATOR_EMPTY_EXPERIENCE) && model.includes(FACILITATOR_EMPTY_T4T_EXPERIENCE), 'the clarified empty states live in the facilitator model');
assert(app.includes('selectFacilitatorPopulation') && app.includes('paintFacilitatorPopulationCards'), 'selecting a card updates the roster without a reload');
assert(app.includes('population: facilitatorPopulation'), 'roster filtering uses the selected population');
assert(app.includes("facilitatorSort.column = definition.defaultSort.column"), 'switching populations applies that population’s default sort');
assert(app.includes('bindSortableTableHeaders(\'#facilitator-personnel-table\''), 'manual sort controls remain');
assert(app.includes("event.target.closest('.personnel-row-delete')"), 'the delete control still does not open the profile');
assert(app.includes('openFacilitatorDetail(person.id)'), 'a normal row still opens the profile');
assert(css.includes('.facilitator-population-cards') && css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'), 'the cards share one equal-width row');
assert(css.includes('grid-template-columns: 1fr'), 'narrow screens stack the cards');
assert(FACILITATOR_POPULATIONS.map((entry) => entry.id).join(',') === 'credo-used,trained-pool,all-records', 'the population order is CREDO-Used, trained pool, then All Records');
assert(!model.includes('create table') && !model.includes('.insert('), 'population navigation does not write stored classifications');

if (errors.length) {
  console.error(`validate-facilitator-population-navigation: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-facilitator-population-navigation: ok');
