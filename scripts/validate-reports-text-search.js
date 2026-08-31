/**
 * Verify Reports Event & AAR text search helpers.
 * Run: node scripts/validate-reports-text-search.js
 */
import {
  collectReportsSearchMatches,
  createReportsSearchSortState,
  formatReportsSearchMatchLabel,
  getReportsSearchMatchSortKey,
  normalizeReportsSearchQuery,
  resolveReportsSearchSortState,
  searchReportsEvents,
  sortReportsSearchResults,
} from '../js/reports-text-search.js';

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    errors.push(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

const pgw = {
  id: 'evt-t4t',
  eventType: 'Personal Growth Workshop',
  startDate: '2026-06-12',
  date: '2026-06-12',
  endDate: '2026-06-12',
  command: 'NMCB-4',
  location: 'Camp Pendleton',
  venue: 'Chapel',
  aarLessonsLearned: 'Strengths Discovery Encounter T4T',
  aarFinalized: false,
  objectives: 'Should not match T4T from a shared template.',
  description: 'Shared Event Description must not be searched.',
  credoRequirements: 'Global CREDO Requirements must not be searched.',
  commandRequirements: 'Global Command Requirements must not be searched.',
};

const commandEvent = {
  id: 'evt-mardiv',
  eventType: 'Commanding Officer Relationship Training',
  startDate: '2026-08-01',
  date: '2026-08-01',
  command: '1st MARDIV',
  location: 'Camp Pendleton',
  aarLessonsLearned: '',
  aarFinalized: true,
};

const locationEvent = {
  id: 'evt-29palms',
  eventType: 'Personal Growth Workshop',
  startDate: '2025-11-03',
  date: '2025-11-03',
  command: '7th Marines',
  location: 'Twentynine Palms',
  aarLessonsLearned: '',
};

const finalizedLessons = {
  id: 'evt-final-t4t',
  eventType: 'Personal Growth Workshop',
  startDate: '2026-07-20',
  date: '2026-07-20',
  command: '1st MARDIV',
  location: 'Oceanside',
  aarLessonsLearned: 'Follow-up T4T notes after finalize.',
  aarFinalized: true,
};

const multiMatch = {
  id: 'evt-multi',
  eventType: 'T4T Workshop',
  startDate: '2026-05-01',
  date: '2026-05-01',
  command: 'T4T Command',
  location: 'T4T Hall',
  aarLessonsLearned: 'Strengths Discovery Encounter T4T',
};

const tbdEvent = {
  id: 'evt-tbd',
  eventType: 'Personal Growth Workshop',
  startDate: 'TBD',
  date: 'TBD',
  command: 'NMCB-4',
  location: 'TBD',
  aarLessonsLearned: 'T4T waiting on a date',
};

const olderDated = {
  id: 'evt-old',
  eventType: 'Personal Growth Workshop',
  startDate: '2024-01-15',
  date: '2024-01-15',
  command: 'NMCB-4',
  location: 'Camp Pendleton',
  aarLessonsLearned: 'T4T archive note',
};

const events = [
  pgw,
  commandEvent,
  locationEvent,
  finalizedLessons,
  multiMatch,
  tbdEvent,
  olderDated,
];

assertEqual(normalizeReportsSearchQuery('  T4T  '), 't4t', 'query is trimmed and lowercased');

const caseResults = searchReportsEvents(events, 't4t');
assert(caseResults.some((result) => result.event.id === 'evt-t4t'), 'case-insensitive matching finds T4T');

const partial = searchReportsEvents(events, 'discovery');
assert(
  partial.some((result) => result.event.id === 'evt-t4t'),
  'partial matching finds Discovery in Lessons Learned'
);

const t4tHit = searchReportsEvents([pgw], 'T4T')[0];
assertEqual(t4tHit?.matches[0]?.label, 'Lessons Learned', 'T4T in Lessons Learned is the primary match');
assertEqual(t4tHit?.event?.id, 'evt-t4t', 'matching Event id is retained for Open');
assert(t4tHit?.event === pgw, 'search result keeps the original Event reference');

assert(
  searchReportsEvents(events, 'Personal Growth Workshop').some((result) => result.event.id === 'evt-t4t'),
  'Event Type matching works'
);
assert(
  searchReportsEvents(events, '1st MARDIV').some((result) => result.event.id === 'evt-mardiv'),
  'Command matching works'
);
assert(
  searchReportsEvents(events, 'Twentynine Palms').some((result) => result.event.id === 'evt-29palms'),
  'Location matching works'
);

const draftHit = searchReportsEvents([pgw], 'T4T')[0];
assertEqual(draftHit?.event?.aarFinalized, false, 'draft AAR Lessons Learned is searchable');
assertEqual(draftHit?.matches[0]?.label, 'Lessons Learned', 'draft Lessons Learned is identified');

const finalHit = searchReportsEvents([finalizedLessons], 'T4T')[0];
assertEqual(finalHit?.event?.aarFinalized, true, 'finalized AAR Lessons Learned is searchable');
assertEqual(finalHit?.matches[0]?.label, 'Lessons Learned', 'finalized Lessons Learned is identified');

assertEqual(searchReportsEvents(events, '').length, 0, 'empty query returns zero results');
assertEqual(searchReportsEvents(events, '   ').length, 0, 'whitespace query returns zero results');
assertEqual(searchReportsEvents(events, 'no-such-phrase-xyz').length, 0, 'no-match query returns zero results');

const multi = searchReportsEvents([multiMatch], 'T4T')[0];
assert(multi?.matches.length >= 3, 'one Event can match several fields');
assertEqual(multi?.matches[0]?.label, 'Lessons Learned', 'Lessons Learned has primary priority');
assertEqual(
  formatReportsSearchMatchLabel(multi.matches),
  `Lessons Learned +${multi.matches.length - 1}`,
  'multiple matches display primary label plus additional count'
);
assertEqual(getReportsSearchMatchSortKey(multi), 'Lessons Learned', 'Match sort uses primary label only');

const templateOnly = {
  id: 'evt-template',
  eventType: 'Personal Growth Workshop',
  startDate: '2026-04-01',
  date: '2026-04-01',
  command: 'NMCB-4',
  location: 'Camp Pendleton',
  aarLessonsLearned: '',
  objectives: 'Strengths Discovery Encounter T4T',
  description: 'T4T appears only in shared Event Description',
  credoRequirements: 'T4T in global CREDO Requirements',
  commandRequirements: 'T4T in global Command Requirements',
};
assertEqual(
  searchReportsEvents([templateOnly], 'T4T').length,
  0,
  'shared template Objectives / Description / Requirements are not searched'
);
assertEqual(collectReportsSearchMatches(templateOnly, 't4t').length, 0, 'template-only T4T produces no matches');

const datedResults = searchReportsEvents(
  [olderDated, tbdEvent, finalizedLessons, pgw],
  'T4T'
);
const newestFirst = sortReportsSearchResults(datedResults, createReportsSearchSortState());
assertEqual(newestFirst[0]?.event?.id, 'evt-final-t4t', 'newest dated Event is first');
assertEqual(newestFirst[newestFirst.length - 1]?.event?.id, 'evt-tbd', 'TBD dates remain after dated Events');
assertEqual(createReportsSearchSortState().column, 'date', 'initial sort column is date');
assertEqual(createReportsSearchSortState().direction, 'desc', 'initial sort direction is Date DESC');

const dateAsc = sortReportsSearchResults(datedResults, { column: 'date', direction: 'asc' });
assertEqual(dateAsc[0]?.event?.id, 'evt-old', 'Date toggle to ASC shows oldest dated Event first');
assertEqual(dateAsc[dateAsc.length - 1]?.event?.id, 'evt-tbd', 'Date ASC still keeps TBD last');

const typeAsc = sortReportsSearchResults(
  searchReportsEvents([commandEvent, pgw], 'Camp Pendleton'),
  { column: 'eventType', direction: 'asc' }
);
assert(
  String(typeAsc[0]?.event?.eventType) <= String(typeAsc[1]?.event?.eventType),
  'another column begins ASC'
);

const keptSort = resolveReportsSearchSortState('T4T', 'T4T', { column: 'eventType', direction: 'asc' });
assertEqual(keptSort.column, 'eventType', 'unchanged query keeps current sort column');
const resetSort = resolveReportsSearchSortState('T4T', 'discovery', { column: 'eventType', direction: 'asc' });
assertEqual(resetSort.column, 'date', 'query change resets to Date');
assertEqual(resetSort.direction, 'desc', 'query change resets to Date DESC');
const clearedSort = resolveReportsSearchSortState('T4T', '   ', { column: 'command', direction: 'asc' });
assertEqual(clearedSort.column, 'date', 'cleared query resets to Date');
assertEqual(clearedSort.direction, 'desc', 'cleared query resets to Date DESC');

const matchSorted = sortReportsSearchResults(
  [
    { event: pgw, matches: [{ key: 'command', label: 'Command' }] },
    { event: finalizedLessons, matches: [{ key: 'aarLessonsLearned', label: 'Lessons Learned' }] },
  ],
  { column: 'match', direction: 'asc' }
);
assertEqual(matchSorted[0]?.matches[0]?.label, 'Command', 'Match sort uses primary label, not +N');
assertEqual(
  formatReportsSearchMatchLabel([
    { key: 'aarLessonsLearned', label: 'Lessons Learned' },
    { key: 'command', label: 'Command' },
    { key: 'location', label: 'Location' },
  ]),
  'Lessons Learned +2',
  'three matching fields display Lessons Learned +2'
);

if (errors.length) {
  console.error('validate-reports-text-search failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('validate-reports-text-search: ok');
