const TBD_TOKEN = 'TBD';

export const REPORTS_TEXT_SEARCH_FIELDS = [
  { key: 'aarLessonsLearned', label: 'Lessons Learned' },
  { key: 'aarWaitlist', label: 'Waitlist' },
  { key: 'aarAttire', label: 'Attire' },
  { key: 'aarTravelTime', label: 'Travel Time' },
  { key: 'aarVenue', label: 'AAR Venue' },
  { key: 'aarCateringVendor', label: 'AAR Catering' },
  { key: 'aarSequenceNumber', label: 'AAR Sequence Number' },
  { key: 'otherCostDescription', label: 'Other Cost Description' },
  { key: 'eventType', label: 'Event Type' },
  { key: 'command', label: 'Command' },
  { key: 'location', label: 'Location' },
  { key: 'venue', label: 'Venue' },
  { key: 'cateringVendor', label: 'Catering Vendor' },
  { key: 'facilitators', label: 'Facilitators' },
  { key: 'credoStaff', label: 'CREDO Staff' },
  { key: 'poc', label: 'Points of Contact' },
  { key: 'time', label: 'Time' },
  { key: 'participants', label: 'Expected Participants' },
  { key: 'startDate', label: 'Date' },
  { key: 'date', label: 'Date' },
  { key: 'endDate', label: 'Date' },
];

export function normalizeReportsSearchQuery(query) {
  return String(query ?? '').trim().toLowerCase();
}

export function createReportsSearchSortState() {
  return { column: 'date', direction: 'desc' };
}

function isBlankSearchValue(value) {
  const text = String(value ?? '').trim();
  return text === '' || text.toUpperCase() === TBD_TOKEN;
}

function compareSearchText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, { sensitivity: 'base' });
}

function compareSearchValuesBlankLast(left, right) {
  if (isBlankSearchValue(left) && !isBlankSearchValue(right)) return 1;
  if (!isBlankSearchValue(left) && isBlankSearchValue(right)) return -1;
  return compareSearchText(left, right);
}

export function fieldContainsReportsSearchQuery(value, needle) {
  if (!needle) return false;
  if (value == null) return false;
  const text = String(value).trim();
  if (text === '') return false;
  return text.toLowerCase().includes(needle);
}

export function collectReportsSearchMatches(event, needle) {
  if (!needle) return [];
  const matches = [];
  const seenLabels = new Set();
  REPORTS_TEXT_SEARCH_FIELDS.forEach((field) => {
    if (seenLabels.has(field.label)) return;
    if (!fieldContainsReportsSearchQuery(event?.[field.key], needle)) return;
    seenLabels.add(field.label);
    matches.push({ key: field.key, label: field.label });
  });
  return matches;
}

export function searchReportsEvents(eventList, query) {
  const needle = normalizeReportsSearchQuery(query);
  if (!needle) return [];
  const list = Array.isArray(eventList) ? eventList : [];
  const results = [];
  list.forEach((event) => {
    const matches = collectReportsSearchMatches(event, needle);
    if (!matches.length) return;
    results.push({ event, matches });
  });
  return results;
}

export function formatReportsSearchMatchLabel(matches) {
  if (!matches?.length) return '';
  const extra = matches.length - 1;
  return extra > 0 ? `${matches[0].label} +${extra}` : matches[0].label;
}

export function getReportsSearchMatchSortKey(result) {
  return result?.matches?.[0]?.label || '';
}

export function getReportsSearchEventDate(result) {
  const event = result?.event ?? result;
  return event?.startDate ?? event?.date ?? '';
}

export function compareReportsSearchDates(a, b, direction = 'desc') {
  const aDate = getReportsSearchEventDate(a);
  const bDate = getReportsSearchEventDate(b);
  const aBlank = isBlankSearchValue(aDate);
  const bBlank = isBlankSearchValue(bDate);
  if (aBlank && !bBlank) return 1;
  if (!aBlank && bBlank) return -1;
  const cmp = String(aDate).localeCompare(String(bDate));
  return direction === 'asc' ? cmp : -cmp;
}

export function resolveReportsSearchSortState(previousQuery, nextQuery, currentSort) {
  if (normalizeReportsSearchQuery(previousQuery) !== normalizeReportsSearchQuery(nextQuery)) {
    return createReportsSearchSortState();
  }
  return currentSort || createReportsSearchSortState();
}

export function sortReportsSearchResults(results, sortState = createReportsSearchSortState()) {
  const list = Array.isArray(results) ? [...results] : [];
  const column = sortState?.column || 'date';
  const direction = sortState?.direction === 'asc' ? 'asc' : 'desc';

  if (column === 'date') {
    list.sort((a, b) => compareReportsSearchDates(a, b, direction));
    return list;
  }

  const comparators = {
    eventType: (a, b) => compareSearchText(a.event?.eventType, b.event?.eventType),
    command: (a, b) => compareSearchValuesBlankLast(a.event?.command, b.event?.command),
    location: (a, b) => compareSearchValuesBlankLast(a.event?.location, b.event?.location),
    match: (a, b) => compareSearchText(getReportsSearchMatchSortKey(a), getReportsSearchMatchSortKey(b)),
  };
  const compare = comparators[column];
  if (!compare) return list;
  list.sort(compare);
  return direction === 'desc' ? list.reverse() : list;
}
