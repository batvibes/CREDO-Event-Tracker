/**
 * Verify Settings Event Type filter and Reference Lists helpers.
 * Run: node scripts/validate-settings-reference-lists.js
 */
import {
  SETTINGS_PEOPLE_NOTE,
  SETTINGS_REFERENCE_CATEGORIES,
  SETTINGS_STAFF_NOTE,
  canRemoveEventTypeFromSettings,
  eventTypeMatchesSettingsQuery,
  filterEventTypesForSettings,
  filterReferenceEntriesForSettings,
  isSettingsReferenceCategory,
  normalizeSettingsSearchQuery,
  sortReferenceEntriesForSettings,
} from '../js/settings-reference-lists.js';

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    errors.push(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    errors.push(`${message} (expected ${right}, got ${left})`);
  }
}

const eventTypes = [
  { id: '1', name: 'Marriage Enrichment Retreat', seriesCode: '01', sortOrder: 1 },
  { id: '2', name: 'Dinner Date Night', seriesCode: '02', sortOrder: 2 },
  { id: '3', name: 'ASIST Workshop', seriesCode: '06', sortOrder: 7 },
  { id: '4', name: 'SafeTalk T4T', seriesCode: '08', sortOrder: 9 },
  { id: '5', name: 'ASIST T4T', seriesCode: '09', sortOrder: 10 },
];

assertEqual(normalizeSettingsSearchQuery('  ASIST  '), 'asist', 'query is trimmed and lowercased');
assertEqual(normalizeSettingsSearchQuery('   '), '', 'whitespace-only query is empty');
assertEqual(normalizeSettingsSearchQuery(null), '', 'null query is empty');

assert(eventTypeMatchesSettingsQuery(eventTypes[0], ''), 'empty query matches every Event Type');
assert(eventTypeMatchesSettingsQuery(eventTypes[0], 'marriage'), 'name substring matches');
assert(eventTypeMatchesSettingsQuery(eventTypes[0], 'MARRIAGE'), 'name match is case-insensitive');
assert(eventTypeMatchesSettingsQuery(eventTypes[0], '01'), 'series code substring matches');
assert(eventTypeMatchesSettingsQuery(eventTypes[4], 't4t'), 'T4T matches Event Type name');
assert(!eventTypeMatchesSettingsQuery(eventTypes[0], 'asist'), 'unrelated query does not match');
assert(!eventTypeMatchesSettingsQuery(eventTypes[1], '01'), 'series code does not fuzzy-match other types');

const marriageHits = filterEventTypesForSettings(eventTypes, 'Marriage');
assertEqual(marriageHits.length, 1, 'Marriage returns one Event Type');
assertEqual(marriageHits[0].id, '1', 'Marriage hit keeps original record');

const t4tHits = filterEventTypesForSettings(eventTypes, 'T4T');
assertDeepEqual(
  t4tHits.map((entry) => entry.id),
  ['4', '5'],
  'T4T keeps sort_order / source order'
);

const seriesHits = filterEventTypesForSettings(eventTypes, '06');
assertEqual(seriesHits[0].id, '3', 'series code 06 finds ASIST Workshop');

const allHits = filterEventTypesForSettings(eventTypes, '   ');
assertDeepEqual(
  allHits.map((entry) => entry.id),
  eventTypes.map((entry) => entry.id),
  'empty query returns all Event Types in original order'
);

assertEqual(filterEventTypesForSettings(null, 'asist').length, 0, 'null Event Type list is empty');

const commands = [
  { id: 'c2', name: 'NMCB-4' },
  { id: 'c1', name: '1st MARDIV' },
  { id: 'c3', name: 'Camp Pendleton' },
];

const sorted = sortReferenceEntriesForSettings(commands);
assertDeepEqual(
  sorted.map((entry) => entry.name),
  ['1st MARDIV', 'Camp Pendleton', 'NMCB-4'],
  'reference entries sort A–Z'
);
assertEqual(commands[0].name, 'NMCB-4', 'sort helper does not mutate the source list');

const campHits = filterReferenceEntriesForSettings(sorted, 'camp');
assertEqual(campHits.length, 1, 'reference search is case-insensitive substring');
assertEqual(campHits[0].name, 'Camp Pendleton', 'Camp matches Camp Pendleton');

const filteredInOrder = filterReferenceEntriesForSettings(sorted, 'c');
assertDeepEqual(
  filteredInOrder.map((entry) => entry.name),
  ['Camp Pendleton', 'NMCB-4'],
  'reference filter preserves A–Z order'
);

assertDeepEqual(
  filterReferenceEntriesForSettings(sorted, '').map((entry) => entry.id),
  sorted.map((entry) => entry.id),
  'empty reference query returns the full list'
);

assertEqual(SETTINGS_REFERENCE_CATEGORIES.length, 5, 'five reference categories');
assertDeepEqual(
  SETTINGS_REFERENCE_CATEGORIES.map((category) => category.key),
  ['commands', 'locations', 'venues', 'caterers', 'people'],
  'category order is Commands, Locations, Venues, Caterers, People'
);
assert(
  !SETTINGS_REFERENCE_CATEGORIES.some((category) => /staff/i.test(category.key) || /staff/i.test(category.label)),
  'CREDO Staff is not a Reference Lists CRUD category'
);
assert(!isSettingsReferenceCategory('staff'), 'staff is not a valid reference category key');
assert(isSettingsReferenceCategory('people'), 'people is a valid reference category key');
assertEqual(
  SETTINGS_PEOPLE_NOTE,
  'Used for Facilitators and Points of Contact.',
  'People explanation copy'
);
assertEqual(SETTINGS_STAFF_NOTE, 'CREDO Staff is managed under Team.', 'Staff handoff copy');

assert(canRemoveEventTypeFromSettings(2), 'Event Type remove allowed when more than one remains');
assert(!canRemoveEventTypeFromSettings(1), 'last Event Type cannot be removed');
assert(!canRemoveEventTypeFromSettings(0), 'zero Event Types cannot be removed');

if (errors.length) {
  console.error('validate-settings-reference-lists failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-settings-reference-lists: ok');
