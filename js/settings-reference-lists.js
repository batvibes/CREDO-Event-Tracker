export const SETTINGS_REFERENCE_CATEGORIES = [
  { key: 'commands', label: 'Commands' },
  { key: 'locations', label: 'Locations' },
  { key: 'venues', label: 'Venues' },
  { key: 'caterers', label: 'Caterers' },
  { key: 'people', label: 'People' },
];

export const SETTINGS_PEOPLE_NOTE = 'Used for Facilitators and Points of Contact.';
export const SETTINGS_STAFF_NOTE = 'CREDO Staff is managed under Team.';

export function normalizeSettingsSearchQuery(query) {
  return String(query ?? '').trim().toLowerCase();
}

export function eventTypeMatchesSettingsQuery(record, query) {
  const needle = normalizeSettingsSearchQuery(query);
  if (!needle) return true;
  const name = String(record?.name ?? '').toLowerCase();
  const seriesCode = String(record?.seriesCode ?? '').toLowerCase();
  return name.includes(needle) || seriesCode.includes(needle);
}

export function filterEventTypesForSettings(records, query) {
  const list = Array.isArray(records) ? records : [];
  return list.filter((record) => eventTypeMatchesSettingsQuery(record, query));
}

export function filterReferenceEntriesForSettings(entries, query) {
  const list = Array.isArray(entries) ? entries : [];
  const needle = normalizeSettingsSearchQuery(query);
  if (!needle) return list;
  return list.filter((entry) => String(entry?.name ?? '').toLowerCase().includes(needle));
}

export function sortReferenceEntriesForSettings(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return [...list].sort((left, right) =>
    String(left?.name ?? '').localeCompare(String(right?.name ?? ''), 'en', { sensitivity: 'base' })
  );
}

export function canRemoveEventTypeFromSettings(count) {
  return Number(count) > 1;
}

export function isSettingsReferenceCategory(key) {
  return SETTINGS_REFERENCE_CATEGORIES.some((category) => category.key === key);
}
