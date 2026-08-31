import {
  createCaterer,
  createCommand,
  createLocation,
  createPerson,
  createTeamMember,
  createVenue,
  deleteEventById,
  deleteEventType,
  deleteMonthlyReport,
  deleteTeamMember,
  fetchAarGlobalTemplates,
  fetchCaterers,
  fetchCommandHighlightsNotes,
  fetchCommands,
  fetchEventTypes,
  fetchEvents,
  fetchLocations,
  fetchMonthlyReport,
  fetchMonthlyReports,
  fetchPeople,
  fetchTeam,
  fetchTeamMembers,
  fetchVenues,
  insertEvent,
  insertEventType,
  renameEventTypeInEvents,
  saveMonthlyReport,
  updateAarGlobalTemplates,
  updateCaterer,
  updateCommand,
  updateCommandHighlightsNotes,
  updateEvent,
  updateEventAarFields,
  clearEventAar,
  finalizeEventAar,
  fetchAarAuditLog,
  insertAarAuditEntry,
  updateEventType,
  updateLocation,
  updatePerson,
  updateTeamMember,
  updateVenue,
  removeCaterer,
  removeCommand,
  removeLocation,
  removePerson,
  removeVenue,
} from './db.js';
import { initEventReferenceFields } from './event-reference-fields.js';
import {
  exportMonthlyImpactReportPptx,
  generateMirPresentationBlob,
  calculateMirSection2Data,
  extractMirManpowerNotesText,
  extractMirPersonnelChanges,
  mergeMirManpowerNotesWithPersonnelChanges,
} from './monthly-report-pptx-export.js';
import {
  destroyMirPresentationPreview,
  renderMirPresentationPreview,
} from './mir-pptx-preview.js';
import { clearMirOpenPhotoSection, renderMirOpenPhotoSection } from './mir-photo-view.js';
import { applyMirPhotoSlots, clearMirPhotoSlots, getMirPhotosForSave, setupMirPhotoUploads } from './mir-photo-upload.js';
import { buildAarPdfFilename, exportAarReportElementToPdf } from './aar-pdf-export.js';
import { exportEventSyncReportPdf } from './event-report-pdf-export.js';
import {
  createReportsSearchSortState,
  formatReportsSearchMatchLabel,
  normalizeReportsSearchQuery,
  resolveReportsSearchSortState,
  searchReportsEvents,
  sortReportsSearchResults,
} from './reports-text-search.js';
import {
  buildTrendsOutlookPdfFilename,
  exportTrendsOutlookReportPdf,
} from './trends-outlook-pdf-export.js';
import {
  filterTrendsScheduledEvents,
  getTrendsScheduledFloorForEvents,
  resolveOutlookBucketValue,
} from './trends-outlook-scheduled.js';
import {
  assembleTrendsHistoricalAnalysisRows,
  buildTrendsDifferenceExplanation,
  collectTrendsDriverEventsForInterval,
  getTrendsDriverComparePhrase,
  isTrendsDriverCompareMode,
  pickTrendsHistoricalAnalysisSeries,
  resolveTrendsHistoricalAnalysisMode,
} from './trends-difference-drivers.js';
import {
  SETTINGS_PEOPLE_NOTE,
  SETTINGS_REFERENCE_CATEGORIES,
  SETTINGS_STAFF_NOTE,
  canRemoveEventTypeFromSettings,
  eventTypeMatchesSettingsQuery,
  filterReferenceEntriesForSettings,
  isSettingsReferenceCategory,
  normalizeSettingsSearchQuery,
} from './settings-reference-lists.js';
import {
  buildCommandReachPdfFilename,
  buildImpactExplorerPdfFilename,
  buildProgramDemandPdfFilename,
  buildResourceImpactPdfFilename,
  exportCommandReachReportPdf,
  exportImpactExplorerReportPdf,
  exportProgramDemandReportPdf,
  exportResourceImpactReportPdf,
} from './trends-section-pdf-export.js';
// PDF libraries load on demand via aar-pdf-export.js — not at app bootstrap.
import {
  canDeleteEvents,
  canEditEvents,
  canEditTeam,
  canManageEventTypes,
} from './auth.js';

const TBD = 'TBD';

const STATUSES = ['Not Started', 'In Progress', 'Complete'];

const STATUS_CLASS = {
  'Not Started': 'not-started',
  'In Progress': 'in-progress',
  Complete: 'complete',
};

const TRACKER_VIEWS = ['events'];

const DEFAULT_TEAM = {
  director: '',
  deputyDirector: '',
  gsPosition: '',
  lpo: '',
  credoStaff: '',
};

let events = [];
let eventTypes = [];
let eventTypeRecords = [];
let aarGlobalTemplates = {
  credoRequirements: '',
  commandRequirements: '',
};
let team = { ...DEFAULT_TEAM };
let teamMembers = [];
let referenceCommands = [];
let referenceLocations = [];
let referenceVenues = [];
let referenceCaterers = [];
let referencePeople = [];
let eventReferenceFields = null;
let commandHighlightsNotes = '';
let currentView = 'events';
let reportsTab = 'event-reports';
let settingsTab = 'event-types';
let settingsEventTypeQuery = '';
let settingsReferenceCategory = 'commands';
let settingsReferenceQuery = '';
let settingsReferenceForm = null;
let dateFilter = { month: 'all', year: 'all' };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

let reportResults = [];
let aarSearchResults = [];
let aarScreen = 'search';
let aarDocumentEventId = null;
let aarFinalEditEnabled = false;

const DEFAULT_AAR_FILTER = {
  filterType: 'cy',
  year: '',
  month: '',
  startDate: '',
  endDate: '',
  command: '',
  eventType: '',
};

let aarFilterState = { ...DEFAULT_AAR_FILTER };
let mirScreen = 'draft';
let mirOpenReport = null;

let dataLoadGeneration = 0;

const SORT_ASC = 'asc';
const SORT_DESC = 'desc';

const eventsTableSort = { column: 'date', direction: SORT_DESC };
const reportsTableSort = { column: null, direction: SORT_ASC };
const reportsSearchTableSort = createReportsSearchSortState();
let reportsSearchResults = [];
let reportsSearchAppliedQuery = '';
let reportsSearchTimer = null;
const REPORTS_SEARCH_DEBOUNCE_MS = 200;
const aarTableSort = { column: null, direction: SORT_ASC };
const aarHistoryTableSort = { column: null, direction: SORT_ASC };
const mirHistoryTableSort = { column: null, direction: SORT_ASC };

const EVENTS_TABLE_SORT_COLUMNS = [
  { key: 'date', index: 1 },
  { key: 'eventType', index: 2 },
  { key: 'command', index: 3 },
  { key: 'facilitators', index: 4 },
  { key: 'location', index: 5 },
  { key: 'reservation', index: 6 },
  { key: 'catering', index: 7 },
  { key: 'packout', index: 8 },
  { key: 'roster', index: 9 },
];

const REPORTS_TABLE_SORT_COLUMNS = [
  { key: 'date', index: 0 },
  { key: 'eventType', index: 1 },
  { key: 'command', index: 2 },
  { key: 'participants', index: 3 },
  { key: 'location', index: 4 },
];

const REPORTS_SEARCH_TABLE_SORT_COLUMNS = [
  { key: 'date', index: 0 },
  { key: 'eventType', index: 1 },
  { key: 'command', index: 2 },
  { key: 'location', index: 3 },
  { key: 'match', index: 4 },
];

const AAR_TABLE_SORT_COLUMNS = [
  { key: 'date', index: 0 },
  { key: 'eventType', index: 1 },
  { key: 'command', index: 2 },
  { key: 'location', index: 3 },
  { key: 'status', index: 4 },
];

const AAR_HISTORY_TABLE_SORT_COLUMNS = [
  { key: 'date', index: 0 },
  { key: 'sequenceNumber', index: 1 },
  { key: 'eventType', index: 2 },
  { key: 'command', index: 3 },
  { key: 'location', index: 4 },
  { key: 'venueCost', index: 5 },
  { key: 'cateringCost', index: 6 },
  { key: 'lastModified', index: 7 },
];

const MIR_HISTORY_TABLE_SORT_COLUMNS = [
  { key: 'monthYear', index: 0 },
  { key: 'status', index: 1 },
  { key: 'lastModified', index: 2 },
];

const MIR_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MIR_STATUS_SORT_ORDER = {
  Draft: 1,
  Final: 2,
};

const AAR_FIELD_LABELS = {
  aarVenue: 'Venue',
  aarVenueCost: 'Venue Cost',
  aarCateringVendor: 'Catering',
  aarCateringCost: 'Catering Cost',
  aarAttire: 'Attire',
  aarTravelTime: 'Travel Time',
  aarWaitlist: 'Waitlist',
  aarLessonsLearned: 'Lessons Learned',
};

const AAR_STATUS_SORT_ORDER = {
  'Not Started': 0,
  Draft: 1,
  Final: 2,
};

function isTbd(value) {
  return value === TBD || value === '' || value == null;
}

function toFieldValue(value) {
  if (value == null) return TBD;
  if (typeof value === 'string' && value.trim() === '') return TBD;
  return value;
}

function toParticipantValue(value) {
  if (isTbd(value)) return TBD;
  const trimmed = String(value).trim();
  if (trimmed === '') return TBD;
  const parsed = parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : TBD;
}

function displayValue(value, field) {
  if (isTbd(value)) return TBD;
  if (field === 'date') return formatDisplayDate(value);
  return String(value);
}

function formatDisplayDate(isoDate) {
  if (isTbd(isoDate)) return TBD;
  const date = new Date(isoDate + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return TBD;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function formatTimestamp(isoString) {
  if (!isoString) return TBD;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return TBD;
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function parseAarCostNumber(value) {
  if (!hasAarFieldData(value)) return null;
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function formatAarCost(value) {
  if (!hasAarFieldData(value)) return TBD;
  const num = parseAarCostNumber(value);
  if (num != null) {
    const formatted = num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `$${formatted}`;
  }
  return String(value).trim();
}

function formatAarCostForStorage(value) {
  const num = parseAarCostNumber(value);
  if (num == null) return String(value ?? '').trim();
  return formatAarCost(String(num));
}

function resolveAarVenue(event) {
  return hasAarFieldData(event.aarVenue) ? event.aarVenue : (event.venue || '');
}

function resolveAarVenueCost(event) {
  if (hasAarFieldData(event.aarVenueCost)) return event.aarVenueCost;
  if (hasAarFieldData(event.venueCost)) return event.venueCost;
  if (!hasAarFieldData(event.aarCateringCost) && hasAarFieldData(event.aarCost)) {
    return event.aarCost;
  }
  return '';
}

function resolveAarCateringVendor(event) {
  return hasAarFieldData(event.aarCateringVendor)
    ? event.aarCateringVendor
    : (event.cateringVendor || '');
}

function resolveAarCateringCost(event) {
  if (hasAarFieldData(event.aarCateringCost)) return event.aarCateringCost;
  return hasAarFieldData(event.cateringCost) ? event.cateringCost : '';
}

function compareAarHistoryCostValues(leftValue, rightValue) {
  const left = parseAarCostNumber(leftValue);
  const right = parseAarCostNumber(rightValue);
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function formatAarHistoryCostValue(value) {
  if (!hasAarFieldData(value)) return '—';
  const formatted = formatAarCost(value);
  return formatted === TBD ? '—' : formatted;
}

function compareTimestamps(aVal, bVal) {
  const left = aVal ? new Date(aVal).getTime() : 0;
  const right = bVal ? new Date(bVal).getTime() : 0;
  return left - right;
}

async function logAarAudit(eventId, action, details = null) {
  if (!eventId || !action) return;

  try {
    await insertAarAuditEntry(eventId, action, details);
  } catch (err) {
    console.error('Failed to log AAR audit entry:', err);
  }
}

function formatEventDateDisplay(event) {
  const dateType = event.dateType === 'range' ? 'range' : 'single';
  const start = event.startDate ?? event.date;
  if (dateType === 'range') {
    const end = event.endDate ?? start;
    if (isTbd(start) && isTbd(end)) return TBD;
    if (isTbd(start)) return formatDisplayDate(end);
    if (isTbd(end)) return formatDisplayDate(start);
    return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  }
  return displayValue(start, 'date');
}

function getEventStartDate(event) {
  return event.startDate ?? event.date;
}

function participantCount(value) {
  if (isTbd(value)) return 0;
  return typeof value === 'number' ? value : parseInt(value, 10) || 0;
}

function normalizeEvent(event) {
  event.dateType = event.dateType === 'range' ? 'range' : 'single';
  event.startDate = toFieldValue(event.startDate ?? event.date);
  event.endDate = event.dateType === 'range'
    ? toFieldValue(event.endDate ?? event.startDate)
    : event.startDate;
  event.date = event.startDate;
  event.participants = toParticipantValue(event.participants);
  event.location = toFieldValue(event.location);
  event.command = toFieldValue(event.command);
  event.venue = String(event.venue ?? '').trim();
  event.venueCost = String(event.venueCost ?? '').trim();
  event.cateringVendor = String(event.cateringVendor ?? '').trim();
  event.cateringCost = String(event.cateringCost ?? '').trim();
  event.lodgingCost = String(event.lodgingCost ?? '').trim();
  event.transportationCost = String(event.transportationCost ?? '').trim();
  event.materialsCost = String(event.materialsCost ?? '').trim();
  event.otherCost = String(event.otherCost ?? '').trim();
  event.otherCostDescription = String(event.otherCostDescription ?? '').trim();
  event.aarVenue = String(event.aarVenue ?? '').trim();
  event.aarCateringVendor = String(event.aarCateringVendor ?? '').trim();
  event.facilitators = String(event.facilitators ?? '').trim();
  event.credoStaff = String(event.credoStaff ?? '').trim();
  event.time = String(event.time ?? '').trim();
  event.poc = String(event.poc ?? '').trim();
  if (event.roster !== 'Complete' && event.roster !== 'Need Roster') {
    event.roster =
      event.rosterAcquired === 'Complete' ? 'Complete' : 'Need Roster';
  }
  delete event.rosterAcquired;
  return event;
}

function syncEventTypeNames() {
  eventTypes = eventTypeRecords.map((record) => record.name);
}

async function persistEvent(event) {
  try {
    const result = await updateEvent(event);
    const saved = result.event ?? result;
    Object.assign(event, normalizeEvent(saved));
    applyAarResequencePatches(result.resequenced);
    refreshOpenAarDocumentIfNeeded();
  } catch (err) {
    console.error(err);
    alert('Failed to save event.');
  }
}

async function persistNewEvent(event) {
  try {
    const saved = await insertEvent(event);
    Object.assign(event, normalizeEvent(saved));
    return true;
  } catch (err) {
    console.error(err);
    alert('Failed to create event.');
    return false;
  }
}

async function reloadEventsAfterCanonicalRename() {
  try {
    const loaded = await fetchEvents();
    events = loaded.map(normalizeEvent);
    render();
    refreshOpenAarDocumentIfNeeded();
  } catch (err) {
    console.error(err);
  }
}

function applyPermissions() {
  const newEventBtn = document.getElementById('new-event-btn');
  if (newEventBtn) {
    newEventBtn.hidden = !canEditEvents();
  }
  updateAarDocumentToolbar();
  updateMirDraftToolbar();
}

function cycleStatus(current) {
  const index = STATUSES.indexOf(current);
  return STATUSES[(index + 1) % STATUSES.length];
}

function formatDate(isoDate) {
  return displayValue(isoDate, 'date');
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function countEventsReadyToExecute(eventList = getFilteredEvents()) {
  return eventList.filter(
    (event) =>
      event.reservation === 'Complete' &&
      event.catering === 'Complete' &&
      event.packout === 'Complete' &&
      event.roster === 'Complete'
  ).length;
}

function isFilterAll() {
  return dateFilter.month === 'all' || dateFilter.year === 'all';
}

function getFilteredEvents() {
  if (isFilterAll()) return events;

  return events.filter((event) => {
    const isoDate = getEventStartDate(event);
    if (isTbd(isoDate)) return false;
    const date = new Date(isoDate + 'T12:00:00');
    return (
      date.getMonth() === Number(dateFilter.month) &&
      date.getFullYear() === Number(dateFilter.year)
    );
  });
}

function getEventYears() {
  const years = new Set();
  events.forEach((event) => {
    const isoDate = getEventStartDate(event);
    if (!isTbd(isoDate)) {
      years.add(new Date(isoDate + 'T12:00:00').getFullYear());
    }
  });
  return [...years].sort((a, b) => a - b);
}

function populateYearFilter() {
  const yearSelect = document.getElementById('filter-year');
  if (!yearSelect) return;

  const selected = dateFilter.year;
  yearSelect.innerHTML = [
    '<option value="all">Year</option>',
    ...getEventYears().map((year) => `<option value="${year}">${year}</option>`),
  ].join('');

  if (selected === 'all' || getEventYears().includes(Number(selected))) {
    yearSelect.value = selected;
  } else {
    yearSelect.value = 'all';
    dateFilter.year = 'all';
  }
}

function syncDateFilterUI() {
  const allBtn = document.getElementById('filter-all-btn');
  const monthSelect = document.getElementById('filter-month');
  const yearSelect = document.getElementById('filter-year');
  if (!allBtn || !monthSelect || !yearSelect) return;

  const all = isFilterAll();
  allBtn.classList.toggle('filter-btn-active', all);
  monthSelect.value = dateFilter.month;
  yearSelect.value = dateFilter.year;
}

function applyDateFilter() {
  syncDateFilterUI();
  renderKPIs();
  renderTable();
}

function setupDateFilter() {
  const monthSelect = document.getElementById('filter-month');
  const yearSelect = document.getElementById('filter-year');
  const allBtn = document.getElementById('filter-all-btn');

  monthSelect.innerHTML = [
    '<option value="all">Month</option>',
    ...MONTH_NAMES.map((name, index) => `<option value="${index}">${name}</option>`),
  ].join('');

  populateYearFilter();

  allBtn.addEventListener('click', () => {
    dateFilter = { month: 'all', year: 'all' };
    applyDateFilter();
  });

  monthSelect.addEventListener('change', () => {
    dateFilter.month = monthSelect.value;
    applyDateFilter();
  });

  yearSelect.addEventListener('change', () => {
    dateFilter.year = yearSelect.value;
    applyDateFilter();
  });

  syncDateFilterUI();
  setupEventsTableSorting();
}

function renderDashboard() {
  populateYearFilter();
  renderKPIs();
  renderTable();
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const aDate = getEventStartDate(a);
    const bDate = getEventStartDate(b);
    if (isTbd(aDate) && !isTbd(bDate)) return 1;
    if (!isTbd(aDate) && isTbd(bDate)) return -1;
    return String(aDate).localeCompare(String(bDate));
  });
}

function compareTextValues(aVal, bVal) {
  return String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, { sensitivity: 'base' });
}

function compareWithTbdLast(aVal, bVal, compareValues = compareTextValues) {
  if (isTbd(aVal) && !isTbd(bVal)) return 1;
  if (!isTbd(aVal) && isTbd(bVal)) return -1;
  return compareValues(aVal, bVal);
}

function compareEventDates(a, b) {
  return compareWithTbdLast(getEventStartDate(a), getEventStartDate(b));
}

function compareEventParticipants(a, b) {
  return compareWithTbdLast(a.participants, b.participants, (left, right) => {
    const leftNumber = parseInt(String(left), 10);
    const rightNumber = parseInt(String(right), 10);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return compareTextValues(left, right);
  });
}

function compareWorkflowStatus(aVal, bVal) {
  const leftIndex = STATUSES.indexOf(aVal);
  const rightIndex = STATUSES.indexOf(bVal);
  if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
  return compareTextValues(aVal, bVal);
}

function compareAarStatusValues(a, b) {
  const left = AAR_STATUS_SORT_ORDER[getAarStatus(a)] ?? 99;
  const right = AAR_STATUS_SORT_ORDER[getAarStatus(b)] ?? 99;
  return left - right;
}

const EVENTS_SORT_COMPARATORS = {
  date: compareEventDates,
  eventType: (a, b) => compareTextValues(a.eventType, b.eventType),
  command: (a, b) => compareWithTbdLast(a.command, b.command),
  facilitators: (a, b) => compareWithTbdLast(a.facilitators, b.facilitators),
  location: (a, b) => compareWithTbdLast(a.location, b.location),
  reservation: (a, b) => compareWorkflowStatus(a.reservation, b.reservation),
  catering: (a, b) => compareWorkflowStatus(a.catering, b.catering),
  packout: (a, b) => compareWorkflowStatus(a.packout, b.packout),
  roster: (a, b) => compareTextValues(a.roster, b.roster),
};

const REPORTS_SORT_COMPARATORS = {
  date: compareEventDates,
  eventType: (a, b) => compareTextValues(a.eventType, b.eventType),
  command: (a, b) => compareWithTbdLast(a.command, b.command),
  participants: compareEventParticipants,
  location: (a, b) => compareWithTbdLast(a.location, b.location),
};

const AAR_SORT_COMPARATORS = {
  date: compareEventDates,
  eventType: (a, b) => compareTextValues(a.eventType, b.eventType),
  command: (a, b) => compareWithTbdLast(a.command, b.command),
  location: (a, b) => compareWithTbdLast(a.location, b.location),
  status: compareAarStatusValues,
};

const AAR_HISTORY_SORT_COMPARATORS = {
  date: compareEventDates,
  sequenceNumber: (a, b) => compareTextValues(a.aarSequenceNumber, b.aarSequenceNumber),
  eventType: (a, b) => compareTextValues(a.eventType, b.eventType),
  command: (a, b) => compareWithTbdLast(a.command, b.command),
  location: (a, b) => compareWithTbdLast(a.location, b.location),
  venueCost: (a, b) => compareAarHistoryCostValues(resolveAarVenueCost(a), resolveAarVenueCost(b)),
  cateringCost: (a, b) =>
    compareAarHistoryCostValues(resolveAarCateringCost(a), resolveAarCateringCost(b)),
  lastModified: (a, b) => compareTimestamps(a.updatedAt, b.updatedAt),
};

const MIR_HISTORY_SORT_COMPARATORS = {
  monthYear: (a, b) => {
    const yearDiff = Number(a.reportYear) - Number(b.reportYear);
    if (yearDiff !== 0) return yearDiff;
    return Number(a.reportMonth) - Number(b.reportMonth);
  },
  status: (a, b) => compareMirStatusValues(a, b),
  lastModified: (a, b) => compareTimestamps(a.updatedAt, b.updatedAt),
};

function sortTableData(list, sortState, comparators, defaultColumn = 'date') {
  const column = sortState.column || defaultColumn;
  const direction = sortState.column ? sortState.direction : SORT_ASC;
  const compare = comparators[column];
  if (!compare) return [...list];

  const sorted = [...list].sort(compare);
  return direction === SORT_DESC ? sorted.reverse() : sorted;
}

function refreshSortHeaderIndicators(tableSelector, columns, sortState) {
  const table = document.querySelector(tableSelector);
  if (!table) return;

  columns.forEach(({ key, index }) => {
    const th = table.querySelectorAll('thead th')[index];
    if (!th) return;

    const indicator = th.querySelector('.sortable-header-indicator');
    if (!indicator) return;

    if (sortState.column === key) {
      indicator.textContent = sortState.direction === SORT_ASC ? '▲' : '▼';
      th.setAttribute('aria-sort', sortState.direction === SORT_ASC ? 'ascending' : 'descending');
    } else {
      indicator.textContent = '';
      th.removeAttribute('aria-sort');
    }
  });
}

function bindSortableTableHeaders(tableSelector, columns, sortState, onSortChange) {
  const table = document.querySelector(tableSelector);
  if (!table || table.dataset.sortHeadersBound === 'true') return;

  columns.forEach(({ key, index }) => {
    const th = table.querySelectorAll('thead th')[index];
    if (!th || th.dataset.sortKey) return;

    const label = th.textContent.trim();
    if (!label) return;

    th.dataset.sortKey = key;
    th.classList.add('sortable-th');
    th.textContent = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sortable-header-btn';
    btn.innerHTML =
      `<span class="sortable-header-label">${label}</span>`
      + '<span class="sortable-header-indicator" aria-hidden="true"></span>';
    btn.addEventListener('click', () => {
      if (sortState.column === key) {
        sortState.direction = sortState.direction === SORT_ASC ? SORT_DESC : SORT_ASC;
      } else {
        sortState.column = key;
        sortState.direction = SORT_ASC;
      }
      refreshSortHeaderIndicators(tableSelector, columns, sortState);
      onSortChange();
    });
    th.appendChild(btn);
  });

  table.dataset.sortHeadersBound = 'true';
  refreshSortHeaderIndicators(tableSelector, columns, sortState);
}

function resetTableSortState() {
  eventsTableSort.column = 'date';
  eventsTableSort.direction = SORT_DESC;
  reportsTableSort.column = null;
  reportsTableSort.direction = SORT_ASC;
  Object.assign(reportsSearchTableSort, createReportsSearchSortState());
  reportsSearchAppliedQuery = '';
  aarTableSort.column = null;
  aarTableSort.direction = SORT_ASC;
  aarHistoryTableSort.column = null;
  aarHistoryTableSort.direction = SORT_ASC;
  mirHistoryTableSort.column = null;
  mirHistoryTableSort.direction = SORT_ASC;

  refreshSortHeaderIndicators('#view-events .events-table', EVENTS_TABLE_SORT_COLUMNS, eventsTableSort);
  refreshSortHeaderIndicators('#reports-event-panel .reports-table', REPORTS_TABLE_SORT_COLUMNS, reportsTableSort);
  refreshSortHeaderIndicators('#reports-search-table', REPORTS_SEARCH_TABLE_SORT_COLUMNS, reportsSearchTableSort);
  refreshSortHeaderIndicators('#view-reports .aar-table:not(.aar-history-table)', AAR_TABLE_SORT_COLUMNS, aarTableSort);
  refreshSortHeaderIndicators('#aar-history-view .aar-history-table', AAR_HISTORY_TABLE_SORT_COLUMNS, aarHistoryTableSort);
  refreshSortHeaderIndicators('#mir-history-view .mir-history-table', MIR_HISTORY_TABLE_SORT_COLUMNS, mirHistoryTableSort);
}

function setupEventsTableSorting() {
  bindSortableTableHeaders(
    '#view-events .events-table',
    EVENTS_TABLE_SORT_COLUMNS,
    eventsTableSort,
    () => renderTable()
  );
}

function setupReportsTableSorting() {
  bindSortableTableHeaders(
    '#reports-event-panel .reports-table',
    REPORTS_TABLE_SORT_COLUMNS,
    reportsTableSort,
    () => renderReportTable()
  );
}

function setupReportsSearchTableSorting() {
  bindSortableTableHeaders(
    '#reports-search-table',
    REPORTS_SEARCH_TABLE_SORT_COLUMNS,
    reportsSearchTableSort,
    () => renderReportsSearchResults()
  );
}

function setupAarTableSorting() {
  bindSortableTableHeaders(
    '#view-reports .aar-table:not(.aar-history-table)',
    AAR_TABLE_SORT_COLUMNS,
    aarTableSort,
    () => renderAarResultsTable()
  );
}

function setupAarHistoryTableSorting() {
  bindSortableTableHeaders(
    '#aar-history-view .aar-history-table',
    AAR_HISTORY_TABLE_SORT_COLUMNS,
    aarHistoryTableSort,
    () => renderAarHistoryLog()
  );
}

function setupMirHistoryTableSorting() {
  bindSortableTableHeaders(
    '#mir-history-view .mir-history-table',
    MIR_HISTORY_TABLE_SORT_COLUMNS,
    mirHistoryTableSort,
    () => {
      void renderMirHistoryLog();
    }
  );
}

function getReportYears() {
  const years = getEventYears();
  if (years.length === 0) {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  }
  const min = years[0];
  const max = years[years.length - 1];
  const range = [];
  for (let year = min - 1; year <= max + 1; year += 1) {
    range.push(year);
  }
  return range;
}

function getEventIsoDate(event) {
  const isoDate = getEventStartDate(event);
  if (isTbd(isoDate)) return null;
  return isoDate;
}

function isDateInRange(isoDate, start, end) {
  return isoDate >= start && isoDate <= end;
}

function getCalendarYearRange(year) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

function getFiscalYearRange(fyYear) {
  return {
    start: `${fyYear - 1}-10-01`,
    end: `${fyYear}-09-30`,
  };
}

function getMonthYearRange(month, year) {
  const monthIndex = Number(month);
  const monthPart = String(monthIndex + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    start: `${year}-${monthPart}-01`,
    end: `${year}-${monthPart}-${String(lastDay).padStart(2, '0')}`,
  };
}

const MIR_FYTD_CATEGORY_LABELS = {
  suicidePrevention: 'SUICIDE PREVENTION',
  personalGrowth: 'PERSONAL GROWTH',
  marriageEnrichment: 'MARRIAGE ENRICHMENT',
  retreats: 'RETREATS',
};

const MIR_FYTD_SERIES_CODES = {
  suicidePrevention: new Set(['06', '07', '08', '09']),
  personalGrowth: new Set(['05', '10']),
  marriageEnrichment: new Set(['02', '03']),
  retreats: new Set(['01', '04']),
};

const MIR_WORKSHOP_SERIES_CODES = new Set(['02', '03', '05', '06', '07', '08', '09', '10']);
const MIR_RETREAT_SERIES_CODES = new Set(['01', '04']);

function filterEventsByIsoDateRange(start, end) {
  return events.filter((event) => {
    const isoDate = getEventIsoDate(event);
    return isoDate && isDateInRange(isoDate, start, end);
  });
}

function getMirEventsForMonthYear(month, year) {
  const { start, end } = getMonthYearRange(Number(month), Number(year));
  return filterEventsByIsoDateRange(start, end);
}

function getMirFytdRange(month, year) {
  const monthIndex = Number(month);
  const yearNum = Number(year);
  const fyEndingYear = monthIndex >= 9 ? yearNum + 1 : yearNum;
  const start = `${fyEndingYear - 1}-10-01`;
  const { end } = getMonthYearRange(monthIndex, yearNum);
  return { start, end };
}

function getMirEventsForFytd(month, year) {
  const { start, end } = getMirFytdRange(month, year);
  return filterEventsByIsoDateRange(start, end);
}

function isMirPersonalGrowthRetreat(eventTypeName) {
  const seriesCode = getEventTypeSeriesCode(eventTypeName);
  return seriesCode === '05' && /retreat/i.test(eventTypeName);
}

function isMirWorkshopEvent(event) {
  const seriesCode = getEventTypeSeriesCode(event.eventType);
  if (!seriesCode) return false;
  if (MIR_RETREAT_SERIES_CODES.has(seriesCode)) return false;
  if (isMirPersonalGrowthRetreat(event.eventType)) return false;
  if (MIR_WORKSHOP_SERIES_CODES.has(seriesCode)) return true;
  return false;
}

function isMirRetreatEvent(event) {
  const seriesCode = getEventTypeSeriesCode(event.eventType);
  if (!seriesCode) return false;
  if (MIR_RETREAT_SERIES_CODES.has(seriesCode)) return true;
  if (isMirPersonalGrowthRetreat(event.eventType)) return true;
  return false;
}

function getMirFytdCategoryKey(event) {
  const seriesCode = getEventTypeSeriesCode(event.eventType);
  if (!seriesCode) return null;

  if (MIR_FYTD_SERIES_CODES.suicidePrevention.has(seriesCode)) {
    return 'suicidePrevention';
  }
  if (MIR_FYTD_SERIES_CODES.marriageEnrichment.has(seriesCode)) {
    return 'marriageEnrichment';
  }
  if (MIR_FYTD_SERIES_CODES.retreats.has(seriesCode)) {
    return 'retreats';
  }
  if (seriesCode === '05' || seriesCode === '10') {
    return 'personalGrowth';
  }

  return null;
}

function countMirUniqueCommands(eventList) {
  const commands = new Set();
  eventList.forEach((event) => {
    if (!isTbd(event.command)) {
      commands.add(event.command);
    }
  });
  return commands.size;
}

function calculateMirMonthReach(monthEvents) {
  let beneficiariesServed = 0;
  let workshopsConducted = 0;
  let retreatsConducted = 0;

  monthEvents.forEach((event) => {
    beneficiariesServed += participantCount(event.participants);
    if (isMirWorkshopEvent(event)) {
      workshopsConducted += 1;
    } else if (isMirRetreatEvent(event)) {
      retreatsConducted += 1;
    }
  });

  return {
    commandsSupported: countMirUniqueCommands(monthEvents),
    beneficiariesServed,
    workshopsConducted,
    retreatsConducted,
  };
}

function calculateMirFytdMissionSupport(fytdEvents) {
  const counts = {
    suicidePrevention: 0,
    personalGrowth: 0,
    marriageEnrichment: 0,
    retreats: 0,
  };

  fytdEvents.forEach((event) => {
    const categoryKey = getMirFytdCategoryKey(event);
    if (categoryKey) {
      counts[categoryKey] += 1;
    }
  });

  return {
    ...counts,
    fytdTotal:
      counts.suicidePrevention
      + counts.personalGrowth
      + counts.marriageEnrichment
      + counts.retreats,
    commands: countMirUniqueCommands(fytdEvents),
    categoryLabels: { ...MIR_FYTD_CATEGORY_LABELS },
  };
}

function calculateMirSection1Data(month, year) {
  const reportMonth = Number(month);
  const reportYear = Number(year);
  const monthEvents = getMirEventsForMonthYear(reportMonth, reportYear);
  const fytdEvents = getMirEventsForFytd(reportMonth, reportYear);
  const monthRange = getMonthYearRange(reportMonth, reportYear);
  const fytdRange = getMirFytdRange(reportMonth, reportYear);

  return {
    reportMonth,
    reportYear,
    monthRange,
    fytdRange,
    monthReach: calculateMirMonthReach(monthEvents),
    fytdMissionSupport: calculateMirFytdMissionSupport(fytdEvents),
  };
}

function logMirSection1Calculations(month, year) {
  const section1 = calculateMirSection1Data(month, year);
  console.log('[mirSection1]', section1);
  return section1;
}

function getUniqueCommands() {
  const commands = new Set();
  events.forEach((event) => {
    if (!isTbd(event.command)) {
      commands.add(event.command);
    }
  });
  return [...commands].sort((a, b) => a.localeCompare(b));
}

function getReportCommands() {
  const commands = getUniqueCommands();
  if (commands.length > 0) return commands;
  if (events.length > 0 && events.every((event) => isTbd(event.command))) {
    return [TBD];
  }
  return [];
}

function populateReportFilterOptions() {
  const years = getReportYears();
  const yearOptions = years.map((year) => `<option value="${year}">${year}</option>`).join('');
  const monthOptions = MONTH_NAMES.map(
    (name, index) => `<option value="${index}">${name}</option>`
  ).join('');

  document.getElementById('report-year').innerHTML =
    '<option value="">Select year</option>' + yearOptions;
  document.getElementById('report-month').innerHTML =
    '<option value="">Select month</option>' + monthOptions;

  document.getElementById('report-command').innerHTML = [
    '<option value="">Select command</option>',
    ...getReportCommands().map((command) => `<option value="${command}">${command}</option>`),
  ].join('');

  document.getElementById('report-event-type').innerHTML = [
    '<option value="">Select event type</option>',
    ...eventTypes.map((type) => `<option value="${type}">${type}</option>`),
  ].join('');
}

function setReportFieldEnabled(fieldId, inputId, enabled) {
  const field = document.getElementById(fieldId);
  const input = document.getElementById(inputId);
  input.disabled = !enabled;
  field.classList.toggle('is-disabled', !enabled);
}

function updateReportFilterState() {
  const reportType = document.getElementById('report-type').value;

  setReportFieldEnabled('report-year-field', 'report-year', ['cy', 'fy', 'month-year'].includes(reportType));
  setReportFieldEnabled('report-month-field', 'report-month', reportType === 'month-year');
  setReportFieldEnabled('report-start-field', 'report-start-date', reportType === 'date-range');
  setReportFieldEnabled('report-end-field', 'report-end-date', reportType === 'date-range');
  setReportFieldEnabled('report-command-field', 'report-command', reportType === 'command');
  setReportFieldEnabled('report-event-type-field', 'report-event-type', reportType === 'event-type');
}

function filterReportEvents() {
  const reportType = document.getElementById('report-type').value;

  if (reportType === 'all') {
    return [...events];
  }

  return events.filter((event) => {
    const isoDate = getEventIsoDate(event);

    if (reportType === 'cy') {
      const year = document.getElementById('report-year').value;
      if (!year) return false;
      const { start, end } = getCalendarYearRange(Number(year));
      return isoDate && isDateInRange(isoDate, start, end);
    }

    if (reportType === 'fy') {
      const fyYear = document.getElementById('report-year').value;
      if (!fyYear) return false;
      const { start, end } = getFiscalYearRange(Number(fyYear));
      return isoDate && isDateInRange(isoDate, start, end);
    }

    if (reportType === 'month-year') {
      const month = document.getElementById('report-month').value;
      const year = document.getElementById('report-year').value;
      if (month === '' || !year) return false;
      const { start, end } = getMonthYearRange(Number(month), Number(year));
      return isoDate && isDateInRange(isoDate, start, end);
    }

    if (reportType === 'date-range') {
      const startDate = document.getElementById('report-start-date').value;
      const endDate = document.getElementById('report-end-date').value;
      if (!startDate || !endDate) return false;
      return isoDate && isDateInRange(isoDate, startDate, endDate);
    }

    if (reportType === 'command') {
      const command = document.getElementById('report-command').value;
      if (!command) return false;
      const eventCommand = isTbd(event.command) ? TBD : event.command;
      return eventCommand === command;
    }

    if (reportType === 'event-type') {
      const eventType = document.getElementById('report-event-type').value;
      if (!eventType) return false;
      return event.eventType === eventType;
    }

    return true;
  });
}

function renderReportTable() {
  const tbody = document.getElementById('report-body');
  const countEl = document.getElementById('report-count');

  countEl.textContent = `${reportResults.length} event${reportResults.length === 1 ? '' : 's'}`;

  if (reportResults.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5"><div class="empty-state">No events match the selected filters.</div></td></tr>';
    return;
  }

  const sorted = sortTableData(reportResults, reportsTableSort, REPORTS_SORT_COMPARATORS);

  tbody.innerHTML = sorted
    .map(
      (event) => `
      <tr>
        <td class="col-date">${displayValue(event.date, 'date')}</td>
        <td class="col-type">${event.eventType}</td>
        <td class="col-command">${displayValue(event.command, 'command')}</td>
        <td class="col-participants">${displayValue(event.participants, 'participants')}</td>
        <td class="col-location">${displayValue(event.location, 'location')}</td>
      </tr>`
    )
    .join('');
}

function generateReport() {
  reportResults = filterReportEvents();
  renderReportTable();
}

function clearReportFilters() {
  document.getElementById('report-type').value = 'all';
  document.getElementById('report-year').value = '';
  document.getElementById('report-month').value = '';
  document.getElementById('report-start-date').value = '';
  document.getElementById('report-end-date').value = '';
  document.getElementById('report-command').value = '';
  document.getElementById('report-event-type').value = '';
  updateReportFilterState();
  generateReport();
}

function getReportFilterSummary() {
  const reportType = document.getElementById('report-type').value;
  const labels = {
    all: 'All Events',
    cy: 'Calendar Year',
    fy: 'Fiscal Year',
    'month-year': 'Month & Year',
    'date-range': 'Date Range',
    command: 'Command',
    'event-type': 'Event Type',
  };

  if (reportType === 'cy' || reportType === 'fy') {
    return `${labels[reportType]}: ${document.getElementById('report-year').value || 'All'}`;
  }
  if (reportType === 'month-year') {
    const monthSelect = document.getElementById('report-month');
    const month = monthSelect.options[monthSelect.selectedIndex]?.text || '';
    const year = document.getElementById('report-year').value || '';
    return `Month & Year: ${month} ${year}`.trim();
  }
  if (reportType === 'date-range') {
    const start = document.getElementById('report-start-date').value;
    const end = document.getElementById('report-end-date').value;
    return `Date Range: ${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  }
  if (reportType === 'command') {
    return `Command: ${document.getElementById('report-command').value || 'All'}`;
  }
  if (reportType === 'event-type') {
    return `Event Type: ${document.getElementById('report-event-type').value || 'All'}`;
  }
  return 'All Events';
}

async function exportReportPdf() {
  if (reportResults.length === 0) return;

  const sorted = sortTableData(reportResults, reportsTableSort, REPORTS_SORT_COMPARATORS);
  const rows = sorted.map((event) => ({
    dates: formatEventDateDisplay(event),
    eventType: event.eventType,
    command: displayValue(event.command, 'command'),
    facilitators: event.facilitators || TBD,
    staff: event.credoStaff || TBD,
    expectedParticipants: displayValue(event.participants, 'participants'),
    location: displayValue(event.location, 'location'),
    reservation: event.reservation || 'Not Started',
    catering: event.catering || 'Not Started',
    packout: event.packout || 'Not Started',
  }));

  await exportEventSyncReportPdf({ rows, filterSummary: getReportFilterSummary() });
}

function setupReports() {
  populateReportFilterOptions();
  updateReportFilterState();

  document.getElementById('report-type').addEventListener('change', updateReportFilterState);
  document.getElementById('report-generate-btn').addEventListener('click', generateReport);
  document.getElementById('report-clear-btn').addEventListener('click', clearReportFilters);
  document.getElementById('report-export-btn').addEventListener('click', exportReportPdf);

  setupReportsTableSorting();
  setupReportsSearch();
  renderReportTable();
}

function getReportsSearchInputValue() {
  return document.getElementById('reports-search-input')?.value ?? '';
}

function applyReportsSearchQuery(query) {
  const nextSort = resolveReportsSearchSortState(
    reportsSearchAppliedQuery,
    query,
    reportsSearchTableSort
  );
  reportsSearchTableSort.column = nextSort.column;
  reportsSearchTableSort.direction = nextSort.direction;
  reportsSearchAppliedQuery = normalizeReportsSearchQuery(query);
  reportsSearchResults = searchReportsEvents(events, query);
  refreshSortHeaderIndicators(
    '#reports-search-table',
    REPORTS_SEARCH_TABLE_SORT_COLUMNS,
    reportsSearchTableSort
  );
  renderReportsSearchResults();
}

function scheduleReportsSearch() {
  clearTimeout(reportsSearchTimer);
  reportsSearchTimer = setTimeout(() => {
    applyReportsSearchQuery(getReportsSearchInputValue());
  }, REPORTS_SEARCH_DEBOUNCE_MS);
}

function renderReportsSearchResults() {
  const tbody = document.getElementById('reports-search-body');
  const countEl = document.getElementById('reports-search-count');
  const countWrap = document.getElementById('reports-search-count-wrap');
  if (!tbody) return;

  const query = reportsSearchAppliedQuery;
  if (!query) {
    if (countWrap) countWrap.hidden = true;
    if (countEl) countEl.textContent = '';
    tbody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">Enter a search to find events and AARs.</div></td></tr>';
    return;
  }

  const sorted = sortReportsSearchResults(reportsSearchResults, reportsSearchTableSort);
  if (countWrap) countWrap.hidden = false;
  if (countEl) {
    const count = sorted.length;
    countEl.textContent = `${count} result${count === 1 ? '' : 's'}`;
  }

  if (!sorted.length) {
    tbody.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">No events match this search.</div></td></tr>';
    return;
  }

  tbody.innerHTML = '';
  sorted.forEach((result) => {
    const event = result.event;
    const row = document.createElement('tr');

    const dateCell = document.createElement('td');
    dateCell.className = 'col-date';
    dateCell.textContent = formatEventDateDisplay(event);
    row.appendChild(dateCell);

    const typeCell = document.createElement('td');
    typeCell.className = 'col-type';
    typeCell.textContent = event.eventType;
    row.appendChild(typeCell);

    const commandCell = document.createElement('td');
    commandCell.className = 'col-command';
    commandCell.textContent = displayValue(event.command, 'command');
    row.appendChild(commandCell);

    const locationCell = document.createElement('td');
    locationCell.className = 'col-location';
    locationCell.textContent = displayValue(event.location, 'location');
    row.appendChild(locationCell);

    const matchCell = document.createElement('td');
    matchCell.className = 'col-match';
    matchCell.textContent = formatReportsSearchMatchLabel(result.matches);
    row.appendChild(matchCell);

    const actionCell = document.createElement('td');
    actionCell.className = 'col-actions aar-action-cell';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'aar-action-btn';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation();
      switchReportsTab('aar');
      openAarDocument(event);
    });
    actionCell.appendChild(openBtn);

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'aar-action-btn';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation();
      void exportAarPdfForEvent(event, exportBtn);
    });
    actionCell.appendChild(exportBtn);

    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
}

function renderReportsSearch() {
  applyReportsSearchQuery(getReportsSearchInputValue());
}

function setupReportsSearch() {
  const input = document.getElementById('reports-search-input');
  if (!input) return;

  input.addEventListener('input', scheduleReportsSearch);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearTimeout(reportsSearchTimer);
    applyReportsSearchQuery(input.value);
  });

  setupReportsSearchTableSorting();
  renderReportsSearchResults();
}

function setupReportsSubnav() {
  document.querySelectorAll('.reports-subtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchReportsTab(btn.dataset.reportsTab);
    });
  });
}

function setupSettingsSubnav() {
  document.querySelectorAll('.settings-subtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchSettingsTab(btn.dataset.settingsTab);
    });
  });
}

function switchReportsTab(tab) {
  if (reportsTab === 'aar') {
    captureAarFilterState();
  }

  reportsTab = tab;

  document.querySelectorAll('.reports-subtab').forEach((btn) => {
    btn.classList.toggle('reports-subtab-active', btn.dataset.reportsTab === tab);
  });

  document.getElementById('reports-event-panel').hidden = tab !== 'event-reports';
  const searchPanel = document.getElementById('reports-search-panel');
  if (searchPanel) searchPanel.hidden = tab !== 'search';
  document.getElementById('reports-aar-panel').hidden = tab !== 'aar';
  document.getElementById('reports-mir-panel').hidden = tab !== 'mir';

  const subtitle = document.getElementById('reports-subtitle');
  if (subtitle) {
    const subtitles = {
      'event-reports': 'Event Reports',
      search: 'Search',
      aar: 'After Action Reports',
      mir: 'Monthly Impact Report',
    };
    subtitle.textContent = subtitles[tab] ?? 'Reports';
  }

  if (tab === 'event-reports') {
    renderReports();
  } else if (tab === 'search') {
    renderReportsSearch();
  } else if (tab === 'aar') {
    renderAarSearch();
  } else if (tab === 'mir') {
    renderMirReport();
  }
}

function updateMirInternalNav() {
  document.querySelectorAll('.mir-internal-tab').forEach((btn) => {
    const activeView = mirScreen === 'open' ? 'history' : mirScreen;
    btn.classList.toggle('mir-internal-tab-active', btn.dataset.mirView === activeView);
  });
}

function updateMirScreen() {
  const draftView = document.getElementById('mir-draft-view');
  const historyView = document.getElementById('mir-history-view');
  const openView = document.getElementById('mir-open-view');
  if (!draftView || !historyView || !openView) return;

  draftView.hidden = mirScreen !== 'draft';
  historyView.hidden = mirScreen !== 'history';
  openView.hidden = mirScreen !== 'open';
}

function switchMirView(view) {
  if (view !== 'draft' && view !== 'history') return;

  mirScreen = view;
  updateMirInternalNav();
  updateMirScreen();

  if (view === 'draft') {
    setupMirDraft();
    updateMirDraftToolbar();
    loadMirDraftForSelection();
  } else if (view === 'history') {
    void renderMirHistoryLog();
  }
}

function setupMirInternalNav() {
  document.querySelectorAll('.mir-internal-tab').forEach((btn) => {
    if (btn.dataset.mirNavBound === 'true') return;
    btn.dataset.mirNavBound = 'true';
    btn.addEventListener('click', () => {
      switchMirView(btn.dataset.mirView);
    });
  });
  updateMirInternalNav();
  updateMirScreen();
}

function renderMirReport() {
  updateMirInternalNav();
  updateMirScreen();
  if (mirScreen === 'draft') {
    setupMirDraft();
    updateMirDraftToolbar();
    loadMirDraftForSelection();
  } else if (mirScreen === 'history') {
    void renderMirHistoryLog();
  } else if (mirScreen === 'open' && mirOpenReport) {
    void populateMirOpenView(mirOpenReport);
  }
}


function ensureMirPersonnelChangesFields() {
  const manpowerField = getMirNotesFields()[1];
  if (!manpowerField) return;

  const section = manpowerField.closest('.mir-notes-section');
  if (!section || section.querySelector('#mir-personnel-changes-fields')) return;

  if (!document.getElementById('mir-personnel-changes-styles')) {
    const style = document.createElement('style');
    style.id = 'mir-personnel-changes-styles';
    style.textContent = `
      .mir-personnel-changes-editor {
        margin-top: 18px;
        border-top: 1px solid #d7dee8;
        padding-top: 16px;
      }
      .mir-personnel-change-groups {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .mir-personnel-change-group {
        min-width: 0;
        border: 1px solid #d7dee8;
        border-radius: 8px;
        background: #fff;
        overflow: hidden;
      }
      .mir-personnel-change-group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-bottom: 1px solid #d7dee8;
        background: #f5f7fa;
      }
      .mir-personnel-change-group-title {
        margin: 0;
        color: #00205b;
        font-size: .78rem;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
      }
      .mir-personnel-change-add-btn {
        padding: 5px 9px;
        font-size: .75rem;
      }
      .mir-personnel-change-list {
        display: grid;
        gap: 10px;
        padding: 12px;
      }
      .mir-personnel-change-row {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.25fr) minmax(110px, .75fr) auto;
        gap: 8px;
        align-items: end;
        padding-bottom: 10px;
        border-bottom: 1px solid #e7ebf0;
      }
      .mir-personnel-change-row:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }
      .mir-personnel-change-field {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .mir-personnel-change-field-label {
        color: #4b5563;
        font-size: .68rem;
        font-weight: 700;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .mir-personnel-change-input {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        border: 1px solid #cfd7e3;
        border-radius: 5px;
        background: #fff;
        padding: 8px 9px;
        color: #111827;
        font: inherit;
        font-size: .82rem;
      }
      .mir-personnel-change-remove-btn {
        min-width: 34px;
        height: 34px;
        padding: 0;
        border: 1px solid #cfd7e3;
        border-radius: 5px;
        background: #fff;
        color: #7f1d1d;
        font-size: 1rem;
        cursor: pointer;
      }
      .mir-personnel-change-empty {
        margin: 0;
        padding: 4px 0;
        color: #6b7280;
        font-size: .8rem;
      }
      .mir-personnel-change-help {
        margin: 10px 0 0;
      }
      @media (max-width: 900px) {
        .mir-personnel-change-groups {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 640px) {
        .mir-personnel-change-row {
          grid-template-columns: 1fr;
          align-items: stretch;
        }
        .mir-personnel-change-remove-btn {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'mir-personnel-changes-fields';
  wrapper.className = 'mir-personnel-changes-editor';
  wrapper.innerHTML = `
    <h3 class="mir-photo-field-label" style="margin:0 0 10px;letter-spacing:.08em;text-transform:uppercase;color:#00205b;">Projected Personnel Changes</h3>
    <div class="mir-personnel-change-groups">
      <section class="mir-personnel-change-group" data-personnel-type="incoming">
        <div class="mir-personnel-change-group-header">
          <h4 class="mir-personnel-change-group-title">Incoming</h4>
          <button type="button" class="btn btn-secondary mir-personnel-change-add-btn" data-add-personnel="incoming">+ Add Person</button>
        </div>
        <div class="mir-personnel-change-list" id="mir-incoming-personnel-list"></div>
      </section>
      <section class="mir-personnel-change-group" data-personnel-type="outgoing">
        <div class="mir-personnel-change-group-header">
          <h4 class="mir-personnel-change-group-title">Outgoing</h4>
          <button type="button" class="btn btn-secondary mir-personnel-change-add-btn" data-add-personnel="outgoing">+ Add Person</button>
        </div>
        <div class="mir-personnel-change-list" id="mir-outgoing-personnel-list"></div>
      </section>
    </div>
    <p class="settings-help mir-personnel-change-help">The MIR displays the first two incoming and first two outgoing entries. Additional entries are summarized.</p>
  `;
  section.appendChild(wrapper);

  wrapper.querySelectorAll('[data-add-personnel]').forEach((button) => {
    button.addEventListener('click', () => {
      addMirPersonnelChangeRow(button.dataset.addPersonnel);
    });
  });

  renderMirPersonnelChangeRows('incoming', []);
  renderMirPersonnelChangeRows('outgoing', []);
}

function createMirPersonnelChangeRow(type, row = {}) {
  const element = document.createElement('div');
  element.className = 'mir-personnel-change-row';
  element.dataset.personnelType = type;
  const dateLabel = type === 'incoming' ? 'ETA' : 'PRD / EAOS';
  element.innerHTML = `
    <label class="mir-personnel-change-field">
      <span class="mir-personnel-change-field-label">Name</span>
      <input type="text" class="mir-personnel-change-input" data-personnel-field="name" value="">
    </label>
    <label class="mir-personnel-change-field">
      <span class="mir-personnel-change-field-label">Billet / Position</span>
      <input type="text" class="mir-personnel-change-input" data-personnel-field="billetOrPosition" value="">
    </label>
    <label class="mir-personnel-change-field">
      <span class="mir-personnel-change-field-label">${dateLabel}</span>
      <input type="text" class="mir-personnel-change-input" data-personnel-field="date" value="" placeholder="e.g. OCT 26">
    </label>
    <button type="button" class="mir-personnel-change-remove-btn" aria-label="Remove ${type} person">×</button>
  `;

  element.querySelector('[data-personnel-field="name"]').value = String(row.name ?? '');
  element.querySelector('[data-personnel-field="billetOrPosition"]').value = String(row.billetOrPosition ?? '');
  element.querySelector('[data-personnel-field="date"]').value = String(row.date ?? '');

  element.querySelector('.mir-personnel-change-remove-btn').addEventListener('click', () => {
    element.remove();
    ensureMirPersonnelChangeMinimumRow(type);
  });

  return element;
}

function getMirPersonnelChangeList(type) {
  return document.getElementById(`mir-${type}-personnel-list`);
}

function ensureMirPersonnelChangeMinimumRow(type) {
  const list = getMirPersonnelChangeList(type);
  if (!list || list.querySelector('.mir-personnel-change-row')) return;
  list.appendChild(createMirPersonnelChangeRow(type));
}

function addMirPersonnelChangeRow(type, row = {}) {
  ensureMirPersonnelChangesFields();
  const list = getMirPersonnelChangeList(type);
  if (!list) return;
  list.appendChild(createMirPersonnelChangeRow(type, row));
}

function renderMirPersonnelChangeRows(type, rows) {
  const list = getMirPersonnelChangeList(type);
  if (!list) return;
  list.textContent = '';
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (normalizedRows.length === 0) {
    list.appendChild(createMirPersonnelChangeRow(type));
    return;
  }
  normalizedRows.forEach((row) => list.appendChild(createMirPersonnelChangeRow(type, row)));
}

function readMirPersonnelChangeRows(type) {
  const list = getMirPersonnelChangeList(type);
  if (!list) return [];
  return [...list.querySelectorAll('.mir-personnel-change-row')]
    .map((row) => ({
      name: row.querySelector('[data-personnel-field="name"]')?.value.trim() ?? '',
      billetOrPosition: row.querySelector('[data-personnel-field="billetOrPosition"]')?.value.trim() ?? '',
      date: row.querySelector('[data-personnel-field="date"]')?.value.trim() ?? '',
    }))
    .filter((row) => row.name || row.billetOrPosition || row.date);
}

function readMirPersonnelChangesFromForm() {
  ensureMirPersonnelChangesFields();
  return {
    incoming: readMirPersonnelChangeRows('incoming'),
    outgoing: readMirPersonnelChangeRows('outgoing'),
  };
}

function applyMirPersonnelChangesToForm(changes) {
  ensureMirPersonnelChangesFields();
  renderMirPersonnelChangeRows('incoming', changes?.incoming ?? []);
  renderMirPersonnelChangeRows('outgoing', changes?.outgoing ?? []);
}

function clearMirPersonnelChangesForm() {
  applyMirPersonnelChangesToForm({ incoming: [], outgoing: [] });
}

function getMirReportNotes(report) {
  return {
    reachNotes: report.reachNotes ?? '',
    manpowerNotes: extractMirManpowerNotesText(report.manpowerNotes ?? ''),
    readinessNotes: report.readinessNotes ?? '',
    commandHighlightsNotes: report.commandHighlightsNotes ?? '',
  };
}

async function prepareMirReportGenerationInput(report) {
  const month = Number(report.reportMonth);
  const year = Number(report.reportYear);
  const monthName = MIR_MONTH_NAMES[month] ?? 'Month';
  const notes = getMirReportNotes(report);
  const teamMembers = await fetchTeamMembers();
  const personnelChanges = extractMirPersonnelChanges(report.manpowerNotes ?? '');
  const section1Data = calculateMirSection1Data(month, year);
  const section2Data = calculateMirSection2Data(teamMembers, personnelChanges);

  return {
    monthName,
    year,
    section1Data,
    section2Data,
    notes,
    photos: report.photos ?? {},
  };
}

async function exportMirReportPptx(report, triggerBtn) {
  if (!report) return;

  try {
    if (triggerBtn) triggerBtn.disabled = true;
    const input = await prepareMirReportGenerationInput(report);
    await exportMonthlyImpactReportPptx(input);
  } catch (err) {
    console.error(err);
    alert('Failed to export PowerPoint.');
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

function compareMirStatusValues(a, b) {
  const left = MIR_STATUS_SORT_ORDER[formatMirStatus(a.status)] ?? 99;
  const right = MIR_STATUS_SORT_ORDER[formatMirStatus(b.status)] ?? 99;
  return left - right;
}

function formatMirMonthYear(report) {
  const month = Number(report?.reportMonth);
  const year = Number(report?.reportYear);
  if (!Number.isFinite(month) || !Number.isFinite(year)) return TBD;
  const name = MIR_MONTH_NAMES[month];
  if (!name) return TBD;
  return `${name} ${year}`;
}

function formatMirStatus(status) {
  const value = String(status ?? 'draft').trim();
  if (!value) return 'Draft';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getMirNotesFields() {
  return [...document.querySelectorAll('#mir-draft-view .mir-notes-field')];
}

function getMirSelectedMonthYear() {
  return {
    month: document.getElementById('mir-month')?.value ?? '',
    year: document.getElementById('mir-year')?.value ?? '',
  };
}

function mirSelectionComplete() {
  const { month, year } = getMirSelectedMonthYear();
  return month !== '' && year !== '';
}

function clearMirDraftForm() {
  getMirNotesFields().forEach((field) => {
    field.value = '';
  });
  clearMirPersonnelChangesForm();
  clearMirPhotoSlots();

  const statusEl = document.querySelector('#mir-draft-view .mir-status-value');
  if (statusEl) statusEl.textContent = 'Draft';

  updateMirSavedIndicator(null);
}

function updateMirSavedIndicator(report) {
  const textEl = document.getElementById('mir-saved-indicator-text');
  const timeEl = document.getElementById('mir-saved-indicator-time');
  const indicatorEl = document.getElementById('mir-saved-indicator');
  if (!textEl || !timeEl) return;

  if (!mirSelectionComplete()) {
    textEl.textContent = '—';
    timeEl.hidden = true;
    timeEl.textContent = '';
    indicatorEl?.classList.remove('is-saved', 'is-unsaved');
    return;
  }

  if (report) {
    textEl.textContent = 'Draft saved';
    const savedAt = report.updatedAt || report.createdAt;
    if (savedAt) {
      timeEl.textContent = `Last saved: ${formatTimestamp(savedAt)}`;
      timeEl.hidden = false;
    } else {
      timeEl.hidden = true;
      timeEl.textContent = '';
    }
    indicatorEl?.classList.add('is-saved');
    indicatorEl?.classList.remove('is-unsaved');
    return;
  }

  textEl.textContent = 'No saved draft yet';
  timeEl.hidden = true;
  timeEl.textContent = '';
  indicatorEl?.classList.add('is-unsaved');
  indicatorEl?.classList.remove('is-saved');
}

function applyMirReportToForm(report) {
  const fields = getMirNotesFields();
  if (fields.length >= 4) {
    fields[0].value = report.reachNotes ?? '';
    fields[1].value = extractMirManpowerNotesText(report.manpowerNotes ?? '');
    fields[2].value = report.readinessNotes ?? '';
    fields[3].value = report.commandHighlightsNotes ?? '';
  }

  applyMirPersonnelChangesToForm(extractMirPersonnelChanges(report.manpowerNotes ?? ''));

  const statusEl = document.querySelector('#mir-draft-view .mir-status-value');
  if (statusEl) statusEl.textContent = formatMirStatus(report.status);

  applyMirPhotoSlots(report.photos ?? {});
  updateMirSavedIndicator(report);
}

function updateMirDraftToolbar() {
  const canEdit = mirSelectionComplete() && canEditEvents();
  const saveBtn = document.getElementById('mir-save-draft-btn');
  if (saveBtn) {
    saveBtn.disabled = !canEdit || mirDraftSaveInProgress;
    if (!mirDraftSaveInProgress) {
      saveBtn.textContent = MIR_SAVE_DRAFT_BUTTON_LABEL;
    }
  }

  const clearBtn = document.getElementById('mir-clear-draft-btn');
  if (clearBtn) {
    clearBtn.disabled = !canEdit;
  }

  const exportBtn = document.getElementById('mir-export-pptx-btn');
  if (exportBtn) {
    exportBtn.disabled = !mirSelectionComplete();
  }
}

let mirSaveFeedbackTimer = null;
let mirDraftSaveInProgress = false;

const MIR_SAVE_DRAFT_BUTTON_LABEL = 'Save Draft';

function setMirSaveDraftButtonSaving(isSaving) {
  const saveBtn = document.getElementById('mir-save-draft-btn');
  if (!saveBtn) return;

  if (isSaving) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    return;
  }

  saveBtn.textContent = MIR_SAVE_DRAFT_BUTTON_LABEL;
}

function showMirSaveSuccessFeedback() {
  const el = document.getElementById('mir-save-feedback');
  if (!el) return;

  if (mirSaveFeedbackTimer) {
    clearTimeout(mirSaveFeedbackTimer);
    mirSaveFeedbackTimer = null;
  }

  el.hidden = false;
  el.classList.remove('is-fading');

  mirSaveFeedbackTimer = setTimeout(() => {
    el.classList.add('is-fading');
    mirSaveFeedbackTimer = setTimeout(() => {
      el.hidden = true;
      el.classList.remove('is-fading');
      mirSaveFeedbackTimer = null;
    }, 400);
  }, 3000);
}

async function loadMirDraftForSelection() {
  updateMirDraftToolbar();
  clearMirPhotoSlots();

  if (!mirSelectionComplete()) {
    clearMirDraftForm();
    return;
  }

  const { month, year } = getMirSelectedMonthYear();

  logMirSection1Calculations(Number(month), Number(year));

  try {
    const report = await fetchMonthlyReport(Number(month), Number(year));
    if (report) {
      applyMirReportToForm(report);
    } else {
      clearMirDraftForm();
    }
  } catch (err) {
    console.error(err);
    alert('Failed to load monthly report.');
  }
}

async function saveMirDraft() {
  if (mirDraftSaveInProgress) return;

  mirDraftSaveInProgress = true;
  setMirSaveDraftButtonSaving(true);

  const fields = getMirNotesFields();
  const { month, year } = getMirSelectedMonthYear();

  try {
    const photos = await getMirPhotosForSave();
    const reportMonth = Number(month);
    console.log('[MIR save draft] report_month', {
      rawMonth: month,
      reportMonth,
      reportYear: Number(year),
      dbConstraintAllows: '0-11 (0=January, 11=December)',
    });
    const saved = await saveMonthlyReport({
      reportMonth,
      reportYear: Number(year),
      reachNotes: fields[0]?.value ?? '',
      manpowerNotes: mergeMirManpowerNotesWithPersonnelChanges(
        fields[1]?.value ?? '',
        readMirPersonnelChangesFromForm(),
      ),
      readinessNotes: fields[2]?.value ?? '',
      commandHighlightsNotes: fields[3]?.value ?? '',
      photos,
    });
    applyMirReportToForm(saved);
    showMirSaveSuccessFeedback();
  } catch (err) {
    console.error('[MIR save draft] failed', {
      message: err?.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
      error: err,
    });
    alert('Failed to save monthly report draft.');
  } finally {
    mirDraftSaveInProgress = false;
    setMirSaveDraftButtonSaving(false);
    updateMirDraftToolbar();
  }
}

async function exportMirDraftPptx() {
  if (!mirSelectionComplete()) return;

  const { month, year } = getMirSelectedMonthYear();
  const fields = getMirNotesFields();
  const photos = await getMirPhotosForSave();
  const report = {
    reportMonth: Number(month),
    reportYear: Number(year),
    reachNotes: fields[0]?.value ?? '',
    manpowerNotes: mergeMirManpowerNotesWithPersonnelChanges(
      fields[1]?.value ?? '',
      readMirPersonnelChangesFromForm(),
    ),
    readinessNotes: fields[2]?.value ?? '',
    commandHighlightsNotes: fields[3]?.value ?? '',
    photos,
  };

  await exportMirReportPptx(report);
}

async function clearMirDraft() {
  if (!mirSelectionComplete() || !canEditEvents()) return;

  const confirmed = confirm(
    'Are you sure you want to clear this monthly report draft?'
  );
  if (!confirmed) return;

  const { month, year } = getMirSelectedMonthYear();

  try {
    await deleteMonthlyReport(Number(month), Number(year));
    clearMirDraftForm();
    updateMirDraftToolbar();
  } catch (err) {
    console.error(err);
    alert('Failed to clear monthly report draft.');
  }
}

function setupMirDraft() {
  ensureMirPersonnelChangesFields();

  const monthEl = document.getElementById('mir-month');
  const yearEl = document.getElementById('mir-year');
  const saveBtn = document.getElementById('mir-save-draft-btn');
  const clearBtn = document.getElementById('mir-clear-draft-btn');
  const exportBtn = document.getElementById('mir-export-pptx-btn');

  if (monthEl && monthEl.dataset.mirDraftBound !== 'true') {
    monthEl.dataset.mirDraftBound = 'true';
    monthEl.addEventListener('change', () => {
      loadMirDraftForSelection();
    });
  }

  if (yearEl && yearEl.dataset.mirDraftBound !== 'true') {
    yearEl.dataset.mirDraftBound = 'true';
    yearEl.addEventListener('change', () => {
      loadMirDraftForSelection();
    });
  }

  if (saveBtn && saveBtn.dataset.mirDraftBound !== 'true') {
    saveBtn.dataset.mirDraftBound = 'true';
    saveBtn.addEventListener('click', () => {
      void saveMirDraft();
    });
  }

  if (clearBtn && clearBtn.dataset.mirDraftBound !== 'true') {
    clearBtn.dataset.mirDraftBound = 'true';
    clearBtn.addEventListener('click', () => {
      void clearMirDraft();
    });
  }

  if (exportBtn && exportBtn.dataset.mirDraftBound !== 'true') {
    exportBtn.dataset.mirDraftBound = 'true';
    exportBtn.addEventListener('click', () => {
      void exportMirDraftPptx();
    });
  }

  setupMirPhotoUploads();
  updateMirDraftToolbar();
}

async function editMirReportFromHistory(report) {
  if (!report) return;

  const monthEl = document.getElementById('mir-month');
  const yearEl = document.getElementById('mir-year');
  if (!monthEl || !yearEl) return;

  monthEl.value = String(report.reportMonth);
  yearEl.value = String(report.reportYear);

  switchMirView('draft');
}

async function exportMirFromHistory(report, triggerBtn) {
  if (!report) return;
  await exportMirReportPptx(report, triggerBtn);
}

function openMirHistoryDetails() {
  alert('Monthly report history details are not implemented yet.');
}

async function openMirFromHistory(report) {
  if (!report) return;

  mirOpenReport = report;
  mirScreen = 'open';
  updateMirInternalNav();
  updateMirScreen();
  await populateMirOpenView(report);
}

async function populateMirOpenView(report) {
  if (!report) return;

  const canvas = document.getElementById('mir-preview-canvas');
  const photoGrid = document.getElementById('mir-open-photo-grid');
  if (!canvas) return;

  renderMirOpenPhotoSection(photoGrid, report.photos ?? {});

  try {
    const input = await prepareMirReportGenerationInput(report);
    const blob = await generateMirPresentationBlob(input);
    await renderMirPresentationPreview(canvas, blob);
  } catch (err) {
    console.error(err);
    alert('Failed to load monthly report preview.');
  }
}

function setupMirOpenView() {
  const backBtn = document.getElementById('mir-open-back-btn');
  if (!backBtn || backBtn.dataset.mirOpenBound === 'true') return;

  backBtn.dataset.mirOpenBound = 'true';
  backBtn.addEventListener('click', () => {
    destroyMirPresentationPreview(document.getElementById('mir-preview-canvas'));
    clearMirOpenPhotoSection(document.getElementById('mir-open-photo-grid'));
    mirOpenReport = null;
    switchMirView('history');
  });
}

async function deleteMirReportFromHistory(report) {
  if (!report || !canEditEvents()) return;

  const confirmed = confirm(
    `Are you sure you want to delete the monthly report for ${formatMirMonthYear(report)}?`
  );
  if (!confirmed) return;

  try {
    await deleteMonthlyReport(report.reportMonth, report.reportYear);
    await renderMirHistoryLog();
  } catch (err) {
    console.error(err);
    alert('Failed to delete monthly report.');
  }
}

async function renderMirHistoryLog() {
  const tbody = document.getElementById('mir-history-body');
  const countEl = document.getElementById('mir-history-count');
  if (!tbody || !countEl) return;

  tbody.innerHTML = '<tr><td colspan="4"><div class="mir-empty-state">Loading monthly reports…</div></td></tr>';

  let reports = [];
  try {
    reports = await fetchMonthlyReports();
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      '<tr><td colspan="4"><div class="mir-empty-state">Failed to load monthly reports.</div></td></tr>';
    countEl.textContent = '0 reports';
    return;
  }

  countEl.textContent = `${reports.length} report${reports.length === 1 ? '' : 's'}`;

  if (reports.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4"><div class="mir-empty-state">No Monthly Reports yet.</div></td></tr>';
    return;
  }

  tbody.innerHTML = '';

  const sorted = sortTableData(
    reports,
    mirHistoryTableSort,
    MIR_HISTORY_SORT_COMPARATORS,
    'monthYear'
  );

  sorted.forEach((report) => {
    const row = document.createElement('tr');

    const monthYearCell = document.createElement('td');
    monthYearCell.textContent = formatMirMonthYear(report);
    row.appendChild(monthYearCell);

    const statusCell = document.createElement('td');
    statusCell.className = 'mir-status-cell';
    statusCell.textContent = formatMirStatus(report.status);
    row.appendChild(statusCell);

    const modifiedCell = document.createElement('td');
    modifiedCell.textContent = formatTimestamp(report.updatedAt);
    row.appendChild(modifiedCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'mir-action-cell mir-history-actions';

    const actionsGrid = document.createElement('div');
    actionsGrid.className = 'mir-history-actions-grid';

    const topRow = document.createElement('div');
    topRow.className = 'mir-history-actions-row';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'mir-history-action-btn';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => {
      void openMirFromHistory(report);
    });
    topRow.appendChild(openBtn);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mir-history-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      void editMirReportFromHistory(report);
    });
    topRow.appendChild(editBtn);

    const middleRow = document.createElement('div');
    middleRow.className = 'mir-history-actions-row';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'mir-history-action-btn';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', () => {
      void exportMirFromHistory(report, exportBtn);
    });
    middleRow.appendChild(exportBtn);

    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'mir-history-action-btn';
    historyBtn.textContent = 'History';
    historyBtn.addEventListener('click', () => {
      openMirHistoryDetails();
    });
    middleRow.appendChild(historyBtn);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'mir-history-actions-row';

    if (canEditEvents()) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'mir-history-action-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        void deleteMirReportFromHistory(report);
      });
      bottomRow.appendChild(deleteBtn);
    } else {
      const deleteSpacer = document.createElement('span');
      deleteSpacer.className = 'mir-history-action-spacer';
      deleteSpacer.setAttribute('aria-hidden', 'true');
      bottomRow.appendChild(deleteSpacer);
    }

    const bottomSpacer = document.createElement('span');
    bottomSpacer.className = 'mir-history-action-spacer';
    bottomSpacer.setAttribute('aria-hidden', 'true');
    bottomRow.appendChild(bottomSpacer);

    actionsGrid.appendChild(topRow);
    actionsGrid.appendChild(middleRow);
    actionsGrid.appendChild(bottomRow);
    actionsCell.appendChild(actionsGrid);

    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

function setupMirHistoryLog() {
  setupMirHistoryTableSorting();
  setupMirOpenView();
  void renderMirHistoryLog();
}

function updateAarInternalNav() {
  document.querySelectorAll('.aar-internal-tab').forEach((btn) => {
    const view = btn.dataset.aarView;
    const isActive = (view === 'search' || view === 'history') && view === aarScreen;
    btn.classList.toggle('aar-internal-tab-active', isActive);
  });
}

function switchAarView(view) {
  if (view !== 'search' && view !== 'history') return;

  if (aarScreen === 'search') {
    captureAarFilterState();
  }

  aarScreen = view;
  updateAarInternalNav();
  updateAarScreen();

  if (view === 'search') {
    renderAarResultsTable();
  } else if (view === 'history') {
    renderAarHistoryLog();
  }
}

function setupAarInternalNav() {
  document.querySelectorAll('.aar-internal-tab').forEach((btn) => {
    if (btn.dataset.aarNavBound === 'true') return;
    btn.dataset.aarNavBound = 'true';
    btn.addEventListener('click', () => {
      switchAarView(btn.dataset.aarView);
    });
  });
  updateAarInternalNav();
}

function updateAarScreen() {
  const internalNav = document.getElementById('aar-internal-nav');
  const searchView = document.getElementById('aar-search-view');
  const historyView = document.getElementById('aar-history-view');
  const documentView = document.getElementById('aar-document-view');
  const builderView = document.getElementById('aar-builder-view');
  const previewView = document.getElementById('aar-preview-view');
  if (!searchView || !documentView) return;

  const onListView = aarScreen === 'search' || aarScreen === 'history';

  if (internalNav) {
    internalNav.hidden = !onListView;
  }
  searchView.hidden = aarScreen !== 'search';
  if (historyView) historyView.hidden = aarScreen !== 'history';
  documentView.hidden = onListView;
  if (builderView) builderView.hidden = aarScreen !== 'document';
  if (previewView) previewView.hidden = aarScreen !== 'preview';
}

function openAarPreview() {
  const event = events.find((entry) => entry.id === aarDocumentEventId);
  if (!event) return;

  buildAarPreviewDocument(event);
  updateAarPreviewToolbar();
  aarScreen = 'preview';
  updateAarScreen();
  logAarAudit(event.id, 'Preview Viewed');
}

function closeAarPreview() {
  aarScreen = 'document';
  updateAarScreen();
}

function buildAarPreviewDocument(event) {
  const canvas = document.getElementById('aar-preview-canvas');
  const source = document.getElementById('aar-report-article');
  if (!canvas || !source) return;

  canvas.innerHTML = '';
  const article = source.cloneNode(true);
  article.id = 'aar-report-preview';
  article.querySelectorAll('.aar-editable-field').forEach((el) => el.remove());
  canvas.appendChild(article);
  populateAarDocument(event, { root: article, editable: false });
}

function getAarReportRoot(root) {
  if (root instanceof Element) return root;
  if (typeof root === 'string') return document.querySelector(root);
  return document.getElementById('aar-report-article');
}

function openAarDocument(event) {
  if (!event) return;
  captureAarFilterState();
  aarDocumentEventId = event.id;
  aarFinalEditEnabled = false;
  populateAarDocument(event);
  aarScreen = 'document';
  updateAarScreen();
  updateAarDocumentToolbar();
  updateAarPreviewToolbar();
}

function closeAarDocument() {
  renderAarResultsTable();
  aarDocumentEventId = null;
  aarFinalEditEnabled = false;
  aarScreen = 'search';
  updateAarScreen();
  updateAarInternalNav();
}

function getEventTypeTemplate(eventTypeName) {
  const record = eventTypeRecords.find((entry) => entry.name === eventTypeName);
  return {
    objectives: record?.objectives ?? '',
    description: record?.description ?? '',
  };
}

function aarPlainField(value) {
  if (isTbd(value)) return TBD;
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? TBD : trimmed;
}

const AAR_EMPTY_DISPLAY = '—';

function setAarCostTextElement(element, text) {
  if (!element) return;
  if (!hasAarFieldData(text)) {
    element.textContent = AAR_EMPTY_DISPLAY;
    element.classList.remove('aar-report-placeholder');
    return;
  }
  element.textContent = formatAarCost(text);
  element.classList.remove('aar-report-placeholder');
}

function setAarTextElement(element, text) {
  if (!element) return;
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed === TBD) {
    element.textContent = AAR_EMPTY_DISPLAY;
    element.classList.remove('aar-report-placeholder');
    return;
  }
  element.textContent = trimmed;
  element.classList.remove('aar-report-placeholder');
}

function findAarRmtCell(label, root) {
  const table = getAarReportRoot(root)?.querySelector('.aar-rmt-table');
  if (!table) return null;

  for (const th of table.querySelectorAll('th[scope="row"]')) {
    if (th.textContent.trim() === label) {
      return th.nextElementSibling;
    }
  }
  return null;
}

function setAarRmtField(label, value, emptyPlaceholder, root) {
  const cell = findAarRmtCell(label, root);
  if (!cell || cell.classList.contains('aar-rmt-empty')) return;
  setAarTextElement(cell, value, emptyPlaceholder);
}

function findAarReportSection(title, root) {
  return [...(getAarReportRoot(root)?.querySelectorAll('.aar-report-section') ?? [])].find(
    (section) => section.querySelector('.aar-report-section-title')?.textContent.trim() === title
  );
}

function setAarReportBlock(sectionTitle, blockLabel, text, emptyPlaceholder, root) {
  const section = findAarReportSection(sectionTitle, root);
  if (!section) return;

  for (const block of section.querySelectorAll('.aar-report-block')) {
    const heading = block.querySelector('.aar-report-block-label');
    if (heading?.textContent.trim() === blockLabel) {
      setAarTextElement(block.querySelector('.aar-report-box'), text, emptyPlaceholder);
      return;
    }
  }
}

function getEventTypeSeriesCode(eventTypeName) {
  const record = eventTypeRecords.find((entry) => entry.name === eventTypeName);
  return (record?.seriesCode ?? '').trim();
}

function hasValidEventTypeSeriesCode(seriesCode) {
  return /^\d+$/.test(String(seriesCode || '').trim());
}

function compareEventTypeSeriesOrder(nameA, nameB) {
  const codeA = getEventTypeSeriesCode(nameA);
  const codeB = getEventTypeSeriesCode(nameB);
  const validA = hasValidEventTypeSeriesCode(codeA);
  const validB = hasValidEventTypeSeriesCode(codeB);
  if (validA !== validB) return validA ? -1 : 1;
  if (validA && validB) {
    const numA = Number.parseInt(codeA, 10);
    const numB = Number.parseInt(codeB, 10);
    if (numA !== numB) return numA - numB;
  }
  return String(nameA || '').localeCompare(String(nameB || ''));
}

function getEventCalendarYear(event) {
  const start = event.startDate ?? event.date;
  if (isTbd(start)) return null;
  const year = parseInt(String(start).slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1000) return null;
  return year;
}

function isAarFinalized(event) {
  return event?.aarFinalized === true;
}

function canEditAarDocumentFields(event) {
  if (!canEditEvents()) return false;
  if (!isAarFinalized(event)) return true;
  return aarFinalEditEnabled;
}

function getAarSequenceNumber(event) {
  if (!isAarFinalized(event)) return '';
  return String(event.aarSequenceNumber ?? '').trim();
}

function setAarSequenceDisplay(event, root) {
  const sequence = getAarSequenceNumber(event);

  setAarRmtField(
    'AAR Sequence Number',
    sequence,
    'AAR sequence number will appear here.',
    root
  );

  const reportRoot = getAarReportRoot(root);
  const footerNote = reportRoot?.querySelector('.aar-report-footer-note');
  setAarTextElement(footerNote, '');

  const footerSeq = reportRoot?.querySelector('.aar-report-footer-seq');
  const valueSpan = footerSeq?.querySelector('span:last-child');
  if (valueSpan) {
    setAarTextElement(valueSpan, sequence);
  }
}

function populateAarDocument(event, options = {}) {
  const root = getAarReportRoot(options.root);
  if (!root) return;

  const template = getEventTypeTemplate(event.eventType);

  setAarRmtField('Event Type', event.eventType, 'Event type will appear here.', root);
  setAarRmtField('Date(s)', formatEventDateDisplay(event), 'Event date(s) will appear here.', root);
  setAarRmtField('Command', displayValue(event.command, 'command'), 'Command will appear here.', root);
  setAarRmtField('Location', displayValue(event.location, 'location'), 'Location will appear here.', root);
  setAarRmtField(
    'Participants',
    displayValue(event.participants, 'participants'),
    'Participants will appear here.',
    root
  );
  setAarRmtField('Facilitator(s)', aarPlainField(event.facilitators), 'Facilitator(s) will appear here.', root);
  setAarRmtField('Staffing', aarPlainField(event.credoStaff), 'Staffing will appear here.', root);
  setAarRmtField('Waitlist', event.aarWaitlist, 'Waitlist will appear here.', root);
  setAarRmtField('Time', aarPlainField(event.time), 'Time will appear here.', root);
  setAarRmtField(
    'Point(s) of Contact',
    aarPlainField(event.poc),
    'Point(s) of contact will appear here.',
    root
  );

  setAarReportBlock(
    'EVENT DESCRIPTION',
    'Objectives',
    template.objectives,
    'Objectives will appear here.',
    root
  );
  setAarReportBlock(
    'EVENT DESCRIPTION',
    'Description',
    template.description,
    'Description will appear here.',
    root
  );

  setAarReportBlock(
    'REQUIREMENTS',
    'CREDO Requirements',
    aarGlobalTemplates.credoRequirements,
    'CREDO requirements will appear here.',
    root
  );
  setAarReportBlock(
    'REQUIREMENTS',
    'Command Requirements',
    aarGlobalTemplates.commandRequirements,
    'Command requirements will appear here.',
    root
  );

  setAarSequenceDisplay(event, root);

  const allowEdit = options.editable !== false && canEditAarDocumentFields(event);
  if (allowEdit) {
    renderAarEditableFields(event, root);
  } else {
    renderAarReadOnlyFields(event, root);
  }
}

function applyAarEventPatch(eventId, patch) {
  if (!eventId || !patch) return;

  for (const list of [events, aarSearchResults]) {
    const match = list.find((entry) => entry.id === eventId);
    if (match) Object.assign(match, patch);
  }
}

function syncAarDraftFieldsToEvent(eventId, saved) {
  if (!eventId || !saved) return;

  const patch = {
    aarCost: saved.aarCost,
    aarVenue: saved.aarVenue,
    aarVenueCost: saved.aarVenueCost,
    aarCateringVendor: saved.aarCateringVendor,
    aarCateringCost: saved.aarCateringCost,
    aarAttire: saved.aarAttire,
    aarTravelTime: saved.aarTravelTime,
    aarWaitlist: saved.aarWaitlist,
    aarLessonsLearned: saved.aarLessonsLearned,
  };
  if (saved.updatedAt) patch.updatedAt = saved.updatedAt;
  applyAarEventPatch(eventId, patch);
}

function syncAarFinalizeToEvent(eventId, saved) {
  if (!eventId || !saved || saved.id !== eventId) return;

  applyAarEventPatch(eventId, {
    aarCost: saved.aarCost,
    aarVenue: saved.aarVenue,
    aarVenueCost: saved.aarVenueCost,
    aarCateringVendor: saved.aarCateringVendor,
    aarCateringCost: saved.aarCateringCost,
    aarAttire: saved.aarAttire,
    aarTravelTime: saved.aarTravelTime,
    aarWaitlist: saved.aarWaitlist,
    aarLessonsLearned: saved.aarLessonsLearned,
    aarFinalized: saved.aarFinalized === true,
    aarFinalizedAt: saved.aarFinalizedAt ?? null,
    aarSequenceNumber: saved.aarSequenceNumber == null ? '' : String(saved.aarSequenceNumber),
    updatedAt: saved.updatedAt ?? null,
  });
}

async function saveAarCostField(event, fieldKey, inputEl) {
  if (!canEditAarDocumentFields(event)) return;

  const raw = inputEl.value.trim();
  const newValue = raw === '' ? '' : formatAarCostForStorage(raw);
  const oldResolved = fieldKey === 'aarVenueCost'
    ? resolveAarVenueCost(event)
    : resolveAarCateringCost(event);
  const oldFormatted = hasAarFieldData(oldResolved) ? formatAarCostForStorage(oldResolved) : '';
  if (newValue === oldFormatted) {
    inputEl.value = newValue;
    return;
  }

  const wasNotStarted = getAarStatus(event) === 'Not Started';
  const wasFinalEdit = isAarFinalized(event) && aarFinalEditEnabled;

  try {
    const saved = await updateEventAarFields(event.id, { [fieldKey]: newValue });
    syncAarDraftFieldsToEvent(event.id, saved);
    if (saved.updatedAt) {
      applyAarEventPatch(event.id, { updatedAt: saved.updatedAt });
    }
    inputEl.value = newValue;

    if (wasNotStarted) {
      logAarAudit(event.id, 'Draft Created');
    } else if (wasFinalEdit) {
      const fieldLabel = AAR_FIELD_LABELS[fieldKey] ?? fieldKey;
      logAarAudit(event.id, 'Final Saved', `Updated ${fieldLabel}`);
    }
  } catch (err) {
    console.error(err);
    inputEl.value = oldFormatted;
    alert('Failed to save AAR field.');
  }
}

async function saveAarEditableField(event, fieldKey, inputEl) {
  if (!canEditAarDocumentFields(event)) return;

  const newValue = inputEl.value.trim();
  const oldValue = String(event[fieldKey] ?? '').trim();
  if (newValue === oldValue) return;

  const wasNotStarted = getAarStatus(event) === 'Not Started';
  const wasFinalEdit = isAarFinalized(event) && aarFinalEditEnabled;

  try {
    const saved = await updateEventAarFields(event.id, { [fieldKey]: newValue });
    syncAarDraftFieldsToEvent(event.id, saved);
    if (saved.updatedAt) {
      applyAarEventPatch(event.id, { updatedAt: saved.updatedAt });
    }

    if (wasNotStarted) {
      logAarAudit(event.id, 'Draft Created');
    } else if (wasFinalEdit) {
      const fieldLabel = AAR_FIELD_LABELS[fieldKey] ?? fieldKey;
      logAarAudit(event.id, 'Final Saved', `Updated ${fieldLabel}`);
    }
  } catch (err) {
    console.error(err);
    inputEl.value = oldValue;
    alert('Failed to save AAR field.');
  }
}

function renderAarEditableCostCell(cell, event, fieldKey, emptyPlaceholder) {
  if (!cell) return;
  cell.textContent = '';
  cell.classList.remove('aar-report-placeholder');

  const displayValue = fieldKey === 'aarVenueCost'
    ? resolveAarVenueCost(event)
    : resolveAarCateringCost(event);

  if (!canEditAarDocumentFields(event)) {
    setAarCostTextElement(cell, displayValue, emptyPlaceholder);
    return;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'aar-editable-field';
  input.value = hasAarFieldData(displayValue) ? formatAarCostForStorage(displayValue) : '';
  input.placeholder = emptyPlaceholder;
  input.addEventListener('blur', () => saveAarCostField(event, fieldKey, input));
  cell.appendChild(input);
}

function renderAarEditableCell(cell, event, fieldKey, emptyPlaceholder, resolvedValue = null) {
  if (!cell) return;
  cell.textContent = '';
  cell.classList.remove('aar-report-placeholder');

  const displayValue = resolvedValue == null ? event[fieldKey] : resolvedValue;
  if (!canEditAarDocumentFields(event)) {
    setAarTextElement(cell, displayValue, emptyPlaceholder);
    return;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'aar-editable-field';
  input.value = String(displayValue ?? '').trim();
  input.placeholder = emptyPlaceholder;
  input.addEventListener('blur', () => saveAarEditableField(event, fieldKey, input));
  cell.appendChild(input);
}

function renderAarEditableBox(box, event, fieldKey, emptyPlaceholder) {
  if (!box) return;
  box.textContent = '';
  box.classList.remove('aar-report-placeholder');

  if (!canEditAarDocumentFields(event)) {
    setAarTextElement(box, event[fieldKey], emptyPlaceholder);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.className = 'aar-editable-field aar-editable-textarea';
  textarea.value = String(event[fieldKey] ?? '').trim();
  textarea.placeholder = emptyPlaceholder;
  textarea.addEventListener('blur', () => saveAarEditableField(event, fieldKey, textarea));
  box.appendChild(textarea);
}

function renderAarEditableFields(event, root) {
  const reportRoot = getAarReportRoot(root);
  const costRow = reportRoot?.querySelector('.aar-cost-table tbody tr:nth-child(2)');
  if (costRow) {
    const cells = costRow.querySelectorAll('td');
    renderAarEditableCell(cells[0], event, 'aarVenue', 'Venue will appear here.', resolveAarVenue(event));
    renderAarEditableCostCell(cells[1], event, 'aarVenueCost', 'Venue cost will appear here.');
    renderAarEditableCell(cells[2], event, 'aarCateringVendor', 'Catering service will appear here.', resolveAarCateringVendor(event));
    renderAarEditableCostCell(cells[3], event, 'aarCateringCost', 'Catering cost will appear here.');
    renderAarEditableCell(cells[4], event, 'aarAttire', 'Attire will appear here.');
    renderAarEditableCell(cells[5], event, 'aarTravelTime', 'Travel time will appear here.');
  }

  const waitlistCell = reportRoot?.querySelector('.aar-waitlist-cell');
  renderAarEditableCell(waitlistCell, event, 'aarWaitlist', 'Waitlist will appear here.');

  const lessonsBox = reportRoot?.querySelector('.aar-report-box-lessons');
  renderAarEditableBox(lessonsBox, event, 'aarLessonsLearned', 'Lessons learned will appear here.');
}

function renderAarReadOnlyFields(event, root) {
  const reportRoot = getAarReportRoot(root);
  const costRow = reportRoot?.querySelector('.aar-cost-table tbody tr:nth-child(2)');
  if (costRow) {
    const cells = costRow.querySelectorAll('td');
    setAarTextElement(cells[0], resolveAarVenue(event), 'Venue will appear here.');
    setAarCostTextElement(cells[1], resolveAarVenueCost(event), 'Venue cost will appear here.');
    setAarTextElement(cells[2], resolveAarCateringVendor(event), 'Catering service will appear here.');
    setAarCostTextElement(cells[3], resolveAarCateringCost(event), 'Catering cost will appear here.');
    setAarTextElement(cells[4], event.aarAttire, 'Attire will appear here.');
    setAarTextElement(cells[5], event.aarTravelTime, 'Travel time will appear here.');
  }

  const waitlistCell = reportRoot?.querySelector('.aar-waitlist-cell');
  setAarTextElement(waitlistCell, event.aarWaitlist, 'Waitlist will appear here.');

  const lessonsBox = reportRoot?.querySelector('.aar-report-box-lessons');
  setAarTextElement(lessonsBox, event.aarLessonsLearned, 'Lessons learned will appear here.');
}

function hasAarFieldData(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function getAarStatus(event) {
  if (isAarFinalized(event)) return 'Final';
  if (
    hasAarFieldData(event.aarVenue)
    || hasAarFieldData(event.aarVenueCost)
    || hasAarFieldData(event.aarCateringVendor)
    || hasAarFieldData(event.aarCateringCost)
    || hasAarFieldData(event.aarCost)
    || hasAarFieldData(event.aarAttire)
    || hasAarFieldData(event.aarTravelTime)
    || hasAarFieldData(event.aarWaitlist)
    || hasAarFieldData(event.aarLessonsLearned)
  ) {
    return 'Draft';
  }
  return 'Not Started';
}

function hasAarProgress(event) {
  return getAarStatus(event) !== 'Not Started';
}

function applyAarResequencePatches(resequenced) {
  if (!Array.isArray(resequenced) || !resequenced.length) return;
  resequenced.forEach((saved) => {
    applyAarEventPatch(saved.id, {
      aarSequenceNumber: saved.aarSequenceNumber == null ? '' : String(saved.aarSequenceNumber),
      aarFinalized: saved.aarFinalized === true,
      aarFinalizedAt: saved.aarFinalizedAt ?? null,
      updatedAt: saved.updatedAt ?? null,
    });
  });
}

function refreshOpenAarDocumentIfNeeded() {
  if (!aarDocumentEventId) return;
  const open = events.find((entry) => entry.id === aarDocumentEventId);
  if (!open) return;
  if (aarScreen === 'preview') {
    buildAarPreviewDocument(open);
  } else if (aarScreen === 'document') {
    populateAarDocument(open);
  }
}

function syncAarClearToEvent(eventId, saved) {
  if (!eventId || !saved || saved.id !== eventId) return;

  applyAarEventPatch(eventId, {
    aarCost: saved.aarCost,
    aarVenue: saved.aarVenue,
    aarVenueCost: saved.aarVenueCost,
    aarCateringVendor: saved.aarCateringVendor,
    aarCateringCost: saved.aarCateringCost,
    aarAttire: saved.aarAttire,
    aarTravelTime: saved.aarTravelTime,
    aarWaitlist: saved.aarWaitlist,
    aarLessonsLearned: saved.aarLessonsLearned,
    aarFinalized: saved.aarFinalized === true,
    aarFinalizedAt: saved.aarFinalizedAt ?? null,
    aarSequenceNumber: saved.aarSequenceNumber == null ? '' : String(saved.aarSequenceNumber),
    updatedAt: saved.updatedAt ?? null,
  });
}

async function clearAarFromSearch(event) {
  if (!canEditEvents() || !event || !hasAarProgress(event)) return;

  const confirmed = confirm(
    'Clear this AAR? This will remove the AAR draft/final status, sequence number, finalized date, Venue Cost, Catering Cost, Attire, Travel Time, Waitlist, and Lessons Learned. The event itself will not be deleted.'
  );
  if (!confirmed) return;

  try {
    const result = await clearEventAar(event.id);
    const saved = result.event ?? result;
    syncAarClearToEvent(event.id, saved);
    applyAarResequencePatches(result.resequenced);
    syncAarStateAfterDataLoad();
    logAarAudit(event.id, 'Draft Cleared');

    if (aarDocumentEventId === event.id) {
      aarFinalEditEnabled = false;
      const refreshed = events.find((entry) => entry.id === event.id);
      if (refreshed) {
        if (aarScreen === 'preview') {
          buildAarPreviewDocument(refreshed);
        } else if (aarScreen === 'document') {
          populateAarDocument(refreshed);
        }
        updateAarDocumentToolbar();
        updateAarPreviewToolbar();
      }
    }

    renderAarResultsTable();
  } catch (err) {
    console.error(err);
    alert('Failed to clear AAR.');
  }
}

async function deleteAarFromHistory(event) {
  if (!canEditEvents() || !event || !isAarFinalized(event)) return;

  const confirmed = confirm(
    'Delete this After Action Report?\n\nThis will permanently remove the finalized report.\n\nThe associated Event will NOT be deleted.'
  );
  if (!confirmed) return;

  try {
    const result = await clearEventAar(event.id);
    const saved = result.event ?? result;
    syncAarClearToEvent(event.id, saved);
    applyAarResequencePatches(result.resequenced);
    syncAarStateAfterDataLoad();
    logAarAudit(event.id, 'Final Deleted');

    if (aarDocumentEventId === event.id) {
      aarDocumentEventId = null;
      aarFinalEditEnabled = false;
      aarScreen = 'history';
      updateAarScreen();
      updateAarInternalNav();
    }

    renderAarHistoryLog();
    if (aarScreen === 'search') {
      renderAarResultsTable();
    }
  } catch (err) {
    console.error(err);
    alert('Failed to delete After Action Report.');
  }
}

async function openAarDocumentForFinalEdit(event) {
  if (!canEditEvents() || !event || !isAarFinalized(event)) return;

  const confirmed = confirm(
    'Edit this finalized AAR? The sequence number will remain unchanged.'
  );
  if (!confirmed) return;

  captureAarFilterState();
  aarDocumentEventId = event.id;
  aarFinalEditEnabled = true;
  populateAarDocument(event);
  aarScreen = 'document';
  updateAarScreen();
  updateAarDocumentToolbar();
  updateAarPreviewToolbar();
  await logAarAudit(event.id, 'Final Edited', 'Final AAR opened for editing.');
}

function setupAarDocumentToolbar() {
  const actions = document.querySelector('#aar-builder-view .aar-doc-toolbar-actions');
  if (!actions) return;

  if (!document.getElementById('aar-reset-draft-btn')) {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'aar-doc-reset-btn';
    resetBtn.id = 'aar-reset-draft-btn';
    resetBtn.textContent = 'Reset Draft';
    resetBtn.addEventListener('click', resetAarDraft);
    actions.appendChild(resetBtn);
  }

  updateAarDocumentToolbar();
}

function updateAarDocumentToolbar() {
  const resetBtn = document.getElementById('aar-reset-draft-btn');
  if (resetBtn) {
    const event = events.find((entry) => entry.id === aarDocumentEventId);
    resetBtn.hidden = !canEditEvents() || !event || isAarFinalized(event);
  }
}

function setupAarPreviewToolbar() {
  const confirmBar = document.getElementById('aar-doc-confirm-bar');
  if (!confirmBar) return;

  if (!document.getElementById('aar-mark-final-btn')) {
    const finalBtn = document.createElement('button');
    finalBtn.type = 'button';
    finalBtn.className = 'aar-doc-final-btn';
    finalBtn.id = 'aar-mark-final-btn';
    finalBtn.textContent = 'Mark Final';
    finalBtn.addEventListener('click', markAarFinal);
    confirmBar.appendChild(finalBtn);
  }

  updateAarPreviewToolbar();
}

function buildAarExportReportElement(event) {
  const source = document.getElementById('aar-report-article');
  if (!source) {
    throw new Error('AAR report template not found.');
  }

  const article = source.cloneNode(true);
  article.querySelectorAll('.aar-editable-field').forEach((el) => el.remove());
  populateAarDocument(event, { root: article, editable: false });
  return article;
}

async function exportAarPdfForEvent(event, triggerBtn) {
  if (!event || !isAarFinalized(event)) {
    alert('Only finalized AARs can be exported.');
    return;
  }

  const filename = buildAarPdfFilename(getAarSequenceNumber(event), event.eventType);
  const host = document.createElement('div');
  host.className = 'aar-export-host';
  host.setAttribute('aria-hidden', 'true');

  try {
    if (triggerBtn) triggerBtn.disabled = true;
    host.appendChild(buildAarExportReportElement(event));
    const reportsView = document.getElementById('view-reports');
    (reportsView || document.body).appendChild(host);
    await exportAarReportElementToPdf(host.querySelector('.aar-report'), { filename });
    logAarAudit(event.id, 'PDF Exported', filename);
  } catch (err) {
    console.error(err);
    alert(err?.message || 'Failed to export AAR PDF. Please try again.');
  } finally {
    host.remove();
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

async function exportAarFromHistory(event, triggerBtn) {
  if (!event || !isAarFinalized(event)) {
    alert('Only finalized AARs can be exported from History Log.');
    return;
  }
  await exportAarPdfForEvent(event, triggerBtn);
}

function updateAarPreviewToolbar() {
  const event = events.find((entry) => entry.id === aarDocumentEventId);
  const finalBtn = document.getElementById('aar-mark-final-btn');
  if (finalBtn) {
    finalBtn.hidden = !canEditEvents() || !event || isAarFinalized(event);
  }
}

async function markAarFinal() {
  if (!canEditEvents() || !aarDocumentEventId) return;

  const event = events.find((entry) => entry.id === aarDocumentEventId);
  if (!event || isAarFinalized(event)) return;

  if (!getEventTypeSeriesCode(event.eventType)) {
    alert(
      'Cannot finalize this AAR: the event type has no series code. Assign a series code in Settings → Event Types before finalizing.'
    );
    return;
  }

  if (!getEventCalendarYear(event)) {
    alert(
      'Cannot finalize this AAR: the event must have a valid start date to assign a calendar year sequence number.'
    );
    return;
  }

  const confirmed = confirm(
    'Mark this AAR as final? A binder sequence number will be assigned from chronological order in this series and year, and the report will become read-only.'
  );
  if (!confirmed) return;

  try {
    const result = await finalizeEventAar(event.id);
    const saved = result.event ?? result;
    applyAarResequencePatches(result.resequenced);
    syncAarFinalizeToEvent(event.id, saved);
    syncAarStateAfterDataLoad();
    logAarAudit(
      event.id,
      'Finalized',
      saved.aarSequenceNumber ? `Sequence number ${saved.aarSequenceNumber}` : null
    );
    const refreshed = events.find((entry) => entry.id === aarDocumentEventId);
    if (refreshed) {
      populateAarDocument(refreshed);
      if (aarScreen === 'preview') {
        buildAarPreviewDocument(refreshed);
      }
      updateAarDocumentToolbar();
      updateAarPreviewToolbar();
      renderAarResultsTable();
      if (reportsTab === 'aar' && aarScreen === 'history' && currentView === 'reports') {
        renderAarHistoryLog();
      }
    }
  } catch (err) {
    console.error('[markAarFinal] failed', {
      eventId: event.id,
      eventType: event.eventType,
      startDate: event.startDate,
      date: event.date,
      seriesCode: getEventTypeSeriesCode(event.eventType),
      calendarYear: getEventCalendarYear(event),
      message: err?.message ?? String(err),
      code: err?.code ?? null,
      details: err?.details ?? null,
      hint: err?.hint ?? null,
    });
    if (err.message === 'NO_SERIES_CODE') {
      alert(
        'Cannot finalize this AAR: the event type has no series code. Assign a series code in Settings → Event Types before finalizing.'
      );
      return;
    }
    if (err.message === 'NO_VALID_START_DATE') {
      alert(
        'Cannot finalize this AAR: the event must have a valid start date to assign a calendar year sequence number.'
      );
      return;
    }
    if (err.message === 'ALREADY_FINALIZED') {
      alert('This AAR has already been finalized.');
      return;
    }
    alert('Failed to finalize AAR.');
  }
}

async function resetAarDraft() {
  if (!canEditEvents() || !aarDocumentEventId) return;

  const event = events.find((entry) => entry.id === aarDocumentEventId);
  if (!event || isAarFinalized(event)) return;

  const confirmed = confirm(
    'Reset this draft? This will clear Venue, Venue Cost, Catering, Catering Cost, Attire, Travel Time, Waitlist, and Lessons Learned.'
  );
  if (!confirmed) return;

  try {
    const saved = await updateEventAarFields(event.id, {
      aarCost: '',
      aarVenue: '',
      aarVenueCost: '',
      aarCateringVendor: '',
      aarCateringCost: '',
      aarAttire: '',
      aarTravelTime: '',
      aarWaitlist: '',
      aarLessonsLearned: '',
    });
    syncAarDraftFieldsToEvent(event.id, saved);
    if (saved.updatedAt) {
      applyAarEventPatch(event.id, { updatedAt: saved.updatedAt });
    }
    logAarAudit(event.id, 'Draft Reset');
    const refreshed = events.find((entry) => entry.id === aarDocumentEventId);
    if (refreshed) {
      populateAarDocument(refreshed);
      if (aarScreen === 'preview') {
        buildAarPreviewDocument(refreshed);
      }
    }
  } catch (err) {
    console.error(err);
    alert('Failed to reset draft.');
  }
}

function setAarFieldEnabled(fieldId, inputId, enabled) {
  const field = document.getElementById(fieldId);
  const input = document.getElementById(inputId);
  input.disabled = !enabled;
  field.classList.toggle('is-disabled', !enabled);
}

function captureAarFilterState() {
  const filterTypeEl = document.getElementById('aar-filter-type');
  if (!filterTypeEl) return;

  aarFilterState = {
    filterType: filterTypeEl.value,
    year: document.getElementById('aar-year').value,
    month: document.getElementById('aar-month').value,
    startDate: document.getElementById('aar-start-date').value,
    endDate: document.getElementById('aar-end-date').value,
    command: document.getElementById('aar-command').value,
    eventType: document.getElementById('aar-event-type').value,
  };
}

function applyAarFilterState() {
  const filterTypeEl = document.getElementById('aar-filter-type');
  if (!filterTypeEl) return;

  filterTypeEl.value = aarFilterState.filterType;
  document.getElementById('aar-year').value = aarFilterState.year;
  document.getElementById('aar-month').value = aarFilterState.month;
  document.getElementById('aar-start-date').value = aarFilterState.startDate;
  document.getElementById('aar-end-date').value = aarFilterState.endDate;
  document.getElementById('aar-command').value = aarFilterState.command;
  document.getElementById('aar-event-type').value = aarFilterState.eventType;
}

function syncAarStateAfterDataLoad() {
  aarSearchResults = filterAarEvents(aarFilterState);
}

function restoreAarDocumentIfOpen() {
  if (!aarDocumentEventId) return;

  const event = events.find((entry) => entry.id === aarDocumentEventId);
  if (!event) {
    aarScreen = 'search';
    aarDocumentEventId = null;
    aarFinalEditEnabled = false;
    return;
  }

  if (aarScreen === 'preview') {
    buildAarPreviewDocument(event);
  } else if (aarScreen === 'document') {
    populateAarDocument(event);
  }
  updateAarDocumentToolbar();
  updateAarPreviewToolbar();
}

function populateAarFilterOptions() {
  const years = getReportYears();
  const yearOptions = years.map((year) => `<option value="${year}">${year}</option>`).join('');
  const monthOptions = MONTH_NAMES.map(
    (name, index) => `<option value="${index}">${name}</option>`
  ).join('');

  document.getElementById('aar-year').innerHTML =
    '<option value="">Select year</option>' + yearOptions;
  document.getElementById('aar-month').innerHTML =
    '<option value="">Select month</option>' + monthOptions;

  document.getElementById('aar-command').innerHTML = [
    '<option value="">Select command</option>',
    ...getReportCommands().map((command) => `<option value="${command}">${command}</option>`),
  ].join('');

  document.getElementById('aar-event-type').innerHTML = [
    '<option value="">Select event type</option>',
    ...eventTypes.map((type) => `<option value="${type}">${type}</option>`),
  ].join('');

  applyAarFilterState();
}

function updateAarFilterState() {
  const filterTypeEl = document.getElementById('aar-filter-type');
  if (!filterTypeEl) return;

  aarFilterState.filterType = filterTypeEl.value;
  const filterType = filterTypeEl.value;

  setAarFieldEnabled('aar-year-field', 'aar-year', ['cy', 'fy', 'month-year'].includes(filterType));
  setAarFieldEnabled('aar-month-field', 'aar-month', filterType === 'month-year');
  setAarFieldEnabled('aar-start-field', 'aar-start-date', filterType === 'date-range');
  setAarFieldEnabled('aar-end-field', 'aar-end-date', filterType === 'date-range');
  setAarFieldEnabled('aar-command-field', 'aar-command', filterType === 'command');
  setAarFieldEnabled('aar-event-type-field', 'aar-event-type', filterType === 'event-type');
}

function filterAarEvents(state = aarFilterState) {
  const filterType = state.filterType;

  return events.filter((event) => {
    const isoDate = getEventIsoDate(event);

    if (filterType === 'cy') {
      const year = state.year;
      if (!year) return true;
      const { start, end } = getCalendarYearRange(Number(year));
      return isoDate && isDateInRange(isoDate, start, end);
    }

    if (filterType === 'fy') {
      const fyYear = state.year;
      if (!fyYear) return true;
      const { start, end } = getFiscalYearRange(Number(fyYear));
      return isoDate && isDateInRange(isoDate, start, end);
    }

    if (filterType === 'month-year') {
      const month = state.month;
      const year = state.year;
      if (month === '' || !year) return true;
      const { start, end } = getMonthYearRange(Number(month), Number(year));
      return isoDate && isDateInRange(isoDate, start, end);
    }

    if (filterType === 'date-range') {
      const startDate = state.startDate;
      const endDate = state.endDate;
      if (!startDate || !endDate) return true;
      return isoDate && isDateInRange(isoDate, startDate, endDate);
    }

    if (filterType === 'command') {
      const command = state.command;
      if (!command) return true;
      const eventCommand = isTbd(event.command) ? TBD : event.command;
      return eventCommand === command;
    }

    if (filterType === 'event-type') {
      const eventType = state.eventType;
      if (!eventType) return true;
      return event.eventType === eventType;
    }

    return true;
  });
}

function renderAarResultsTable() {
  const tbody = document.getElementById('aar-results-body');
  const countEl = document.getElementById('aar-result-count');
  if (!tbody || !countEl) return;

  captureAarFilterState();
  aarSearchResults = filterAarEvents();

  countEl.textContent = `${aarSearchResults.length} event${aarSearchResults.length === 1 ? '' : 's'}`;

  if (aarSearchResults.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6"><div class="aar-empty-state">No events match the selected filters.</div></td></tr>';
    return;
  }

  tbody.innerHTML = '';

  const sorted = sortTableData(aarSearchResults, aarTableSort, AAR_SORT_COMPARATORS);

  sorted.forEach((event) => {
    const status = getAarStatus(event);
    const row = document.createElement('tr');

    const dateCell = document.createElement('td');
    dateCell.textContent = formatEventDateDisplay(event);
    row.appendChild(dateCell);

    const typeCell = document.createElement('td');
    typeCell.textContent = event.eventType;
    row.appendChild(typeCell);

    const commandCell = document.createElement('td');
    commandCell.textContent = displayValue(event.command, 'command');
    row.appendChild(commandCell);

    const locationCell = document.createElement('td');
    locationCell.textContent = displayValue(event.location, 'location');
    row.appendChild(locationCell);

    const statusCell = document.createElement('td');
    statusCell.className = 'aar-status';
    statusCell.textContent = status;
    row.appendChild(statusCell);

    const actionCell = document.createElement('td');
    actionCell.className = 'aar-action-cell';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'aar-action-btn';
    openBtn.textContent = 'Draft';
    openBtn.addEventListener('click', () => {
      openAarDocument(event);
    });
    actionCell.appendChild(openBtn);

    if (isAarFinalized(event) && canEditEvents()) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'aar-action-btn aar-edit-final-btn';
      editBtn.textContent = 'Edit Final';
      editBtn.addEventListener('click', () => {
        openAarDocumentForFinalEdit(event);
      });
      actionCell.appendChild(editBtn);
    }

    if (hasAarProgress(event) && canEditEvents()) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'aar-action-btn aar-clear-btn';
      clearBtn.textContent = 'Clear AAR';
      clearBtn.addEventListener('click', () => {
        clearAarFromSearch(event);
      });
      actionCell.appendChild(clearBtn);
    }

    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
}

function searchAarEvents() {
  renderAarResultsTable();
}

function clearAarFilters() {
  aarFilterState = { ...DEFAULT_AAR_FILTER };
  applyAarFilterState();
  updateAarFilterState();
  renderAarResultsTable();
}

function setupAarFilterPersistence() {
  const filterIds = [
    'aar-filter-type',
    'aar-year',
    'aar-month',
    'aar-start-date',
    'aar-end-date',
    'aar-command',
    'aar-event-type',
  ];

  filterIds.forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.aarPersistBound === 'true') return;
    input.dataset.aarPersistBound = 'true';
    input.addEventListener('change', captureAarFilterState);
  });
}

function setupAarSearch() {
  populateAarFilterOptions();
  updateAarFilterState();
  setupAarFilterPersistence();

  document.getElementById('aar-filter-type').addEventListener('change', () => {
    captureAarFilterState();
    updateAarFilterState();
  });
  document.getElementById('aar-search-btn').addEventListener('click', searchAarEvents);
  document.getElementById('aar-clear-btn').addEventListener('click', clearAarFilters);
  document.getElementById('aar-back-btn').addEventListener('click', closeAarDocument);
  document.getElementById('aar-preview-btn').addEventListener('click', openAarPreview);
  document.getElementById('aar-preview-back-builder-btn').addEventListener('click', closeAarPreview);
  document.getElementById('aar-preview-back-events-btn').addEventListener('click', closeAarDocument);
  setupAarDocumentToolbar();
  setupAarPreviewToolbar();
  setupAarTableSorting();
  setupAarInternalNav();

  updateAarScreen();
  updateAarInternalNav();
  restoreAarDocumentIfOpen();
  if (aarScreen === 'history') {
    renderAarHistoryLog();
  } else {
    renderAarResultsTable();
  }
}

function renderAarSearch() {
  populateAarFilterOptions();
  updateAarFilterState();
  updateAarScreen();
  updateAarInternalNav();
  restoreAarDocumentIfOpen();
  if (aarScreen === 'history') {
    renderAarHistoryLog();
  } else if (aarScreen === 'search') {
    renderAarResultsTable();
  }
}

function getFinalizedAarEvents() {
  return events.filter((event) => isAarFinalized(event));
}

function openAarFromHistory(event) {
  if (!event) return;
  openAarDocument(event);
}

function renderAarHistoryLog() {
  const tbody = document.getElementById('aar-history-body');
  const countEl = document.getElementById('aar-history-count');
  if (!tbody || !countEl) return;

  const finalized = getFinalizedAarEvents();
  countEl.textContent = `${finalized.length} report${finalized.length === 1 ? '' : 's'}`;

  if (finalized.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9"><div class="aar-empty-state">No finalized AARs yet.</div></td></tr>';
    return;
  }

  tbody.innerHTML = '';

  const sorted = sortTableData(finalized, aarHistoryTableSort, AAR_HISTORY_SORT_COMPARATORS);

  sorted.forEach((event) => {
    const row = document.createElement('tr');

    const dateCell = document.createElement('td');
    dateCell.textContent = formatEventDateDisplay(event);
    row.appendChild(dateCell);

    const sequenceCell = document.createElement('td');
    sequenceCell.textContent = getAarSequenceNumber(event) || TBD;
    row.appendChild(sequenceCell);

    const typeCell = document.createElement('td');
    typeCell.textContent = event.eventType;
    row.appendChild(typeCell);

    const commandCell = document.createElement('td');
    commandCell.textContent = displayValue(event.command, 'command');
    row.appendChild(commandCell);

    const locationCell = document.createElement('td');
    locationCell.textContent = displayValue(event.location, 'location');
    row.appendChild(locationCell);

    const venueCostCell = document.createElement('td');
    venueCostCell.textContent = formatAarHistoryCostValue(resolveAarVenueCost(event));
    row.appendChild(venueCostCell);

    const cateringCostCell = document.createElement('td');
    cateringCostCell.textContent = formatAarHistoryCostValue(resolveAarCateringCost(event));
    row.appendChild(cateringCostCell);

    const modifiedCell = document.createElement('td');
    modifiedCell.textContent = formatTimestamp(event.updatedAt);
    row.appendChild(modifiedCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'aar-action-cell aar-history-actions';

    const actionsGrid = document.createElement('div');
    actionsGrid.className = 'aar-history-actions-grid';

    const topRow = document.createElement('div');
    topRow.className = 'aar-history-actions-row';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'aar-history-action-btn';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => {
      openAarFromHistory(event);
    });
    topRow.appendChild(openBtn);

    if (canEditEvents()) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'aar-history-action-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        openAarDocumentForFinalEdit(event);
      });
      topRow.appendChild(editBtn);
    } else {
      const topSpacer = document.createElement('span');
      topSpacer.className = 'aar-history-action-spacer';
      topSpacer.setAttribute('aria-hidden', 'true');
      topRow.appendChild(topSpacer);
    }

    const middleRow = document.createElement('div');
    middleRow.className = 'aar-history-actions-row';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'aar-history-action-btn';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', () => {
      void exportAarFromHistory(event, exportBtn);
    });
    middleRow.appendChild(exportBtn);

    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'aar-history-action-btn';
    historyBtn.textContent = 'History';
    historyBtn.addEventListener('click', () => {
      openAarAuditModal(event);
    });
    middleRow.appendChild(historyBtn);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'aar-history-actions-row';

    if (canEditEvents()) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'aar-history-action-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        void deleteAarFromHistory(event);
      });
      bottomRow.appendChild(deleteBtn);
    } else {
      const deleteSpacer = document.createElement('span');
      deleteSpacer.className = 'aar-history-action-spacer';
      deleteSpacer.setAttribute('aria-hidden', 'true');
      bottomRow.appendChild(deleteSpacer);
    }

    const bottomSpacer = document.createElement('span');
    bottomSpacer.className = 'aar-history-action-spacer';
    bottomSpacer.setAttribute('aria-hidden', 'true');
    bottomRow.appendChild(bottomSpacer);

    actionsGrid.appendChild(topRow);
    actionsGrid.appendChild(middleRow);
    actionsGrid.appendChild(bottomRow);
    actionsCell.appendChild(actionsGrid);

    row.appendChild(actionsCell);

    tbody.appendChild(row);
  });
}

async function openAarAuditModal(event) {
  const modal = document.getElementById('aar-audit-modal');
  const title = document.getElementById('aar-audit-modal-title');
  const tbody = document.getElementById('aar-audit-body');
  if (!modal || !title || !tbody || !event) return;

  const sequence = getAarSequenceNumber(event);
  title.textContent = sequence
    ? `AAR Audit History — ${sequence}`
    : 'AAR Audit History';

  tbody.innerHTML = '<tr><td colspan="3">Loading audit history…</td></tr>';
  modal.showModal();

  try {
    const entries = await fetchAarAuditLog(event.id);

    if (entries.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3"><div class="aar-empty-state">No audit history recorded.</div></td></tr>';
      return;
    }

    tbody.innerHTML = '';

    entries.forEach((entry) => {
      const row = document.createElement('tr');

      const timestampCell = document.createElement('td');
      timestampCell.textContent = formatTimestamp(entry.createdAt);
      row.appendChild(timestampCell);

      const actionCell = document.createElement('td');
      actionCell.textContent = entry.action;
      row.appendChild(actionCell);

      const detailsCell = document.createElement('td');
      detailsCell.textContent = entry.details ? entry.details : '—';
      row.appendChild(detailsCell);

      tbody.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      '<tr><td colspan="3"><div class="aar-empty-state">Failed to load audit history.</div></td></tr>';
  }
}

function closeAarAuditModal() {
  const modal = document.getElementById('aar-audit-modal');
  if (modal?.open) modal.close();
}

function setupAarAuditModal() {
  const modal = document.getElementById('aar-audit-modal');
  if (!modal || modal.dataset.aarAuditBound === 'true') return;

  modal.dataset.aarAuditBound = 'true';

  document.getElementById('aar-audit-modal-close')?.addEventListener('click', closeAarAuditModal);
  document.getElementById('aar-audit-modal-close-btn')?.addEventListener('click', closeAarAuditModal);
  modal.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeAarAuditModal();
  });
}

function setupAarHistoryLog() {
  setupAarHistoryTableSorting();
  setupAarAuditModal();
  renderAarHistoryLog();
}

function renderReports() {
  populateReportFilterOptions();
  updateReportFilterState();
  renderReportTable();
}

function createTeamMemberInput(value, placeholder, editable, onBlur, className = 'team-report-field') {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = className;
  input.value = value || '';
  input.placeholder = placeholder;
  input.readOnly = !editable;
  if (editable) {
    input.addEventListener('blur', onBlur);
  }
  return input;
}

function appendTeamMemberDeleteButton(row, anchorCell, memberId, editable) {
  if (!editable) return;

  row.classList.add('team-row-editable');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'team-row-delete-btn';
  btn.setAttribute('aria-label', 'Delete team member');
  btn.innerHTML = `
    <svg class="team-row-delete-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 1 7 0.5h2A1.5 1.5 0 0 1 10.5 2H13a1 1 0 1 1 0 2h-0.5l-0.6 8.2A1.5 1.5 0 0 1 10.4 14H5.6a1.5 1.5 0 0 1-1.5-1.8L3.5 4H3a1 1 0 1 1 0-2h2.5zM7 2h2l0.2 1H6.8L7 2zm0.5 4a0.5 0.5 0 0 0-1 0v6a0.5 0.5 0 0 0 1 0V6zm3 0a0.5 0.5 0 0 0-1 0v6a0.5 0.5 0 0 0 1 0V6z"/>
    </svg>`;
  btn.addEventListener('click', async () => {
    if (!confirm('Delete this team member?')) return;
    try {
      await deleteTeamMember(memberId);
      teamMembers = teamMembers.filter((member) => member.id !== memberId);
      renderTeamMembersTable(document.getElementById('team-members-body'), editable);
    } catch (err) {
      console.error(err);
      alert('Failed to delete team member.');
    }
  });
  anchorCell.appendChild(btn);
}

function renderTeamMembersTable(tbody, editable) {
  tbody.innerHTML = '';

  if (teamMembers.length === 0) {
    const row = document.createElement('tr');
    row.className = 'team-empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'No team members yet.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  teamMembers.forEach((member, index) => {
    const row = document.createElement('tr');
    if (index % 2 === 1) row.className = 'team-row-alt';

    const billetCell = document.createElement('td');
    billetCell.className = 'team-cell-billet';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'team-member-name-wrap';
    nameWrap.appendChild(
      createTeamMemberInput(member.name, 'Name', editable, async (e) => {
        const value = e.target.value.trim();
        if (value === member.name) return;
        try {
          member.name = value;
          await updateTeamMember(member.id, { name: value });
        } catch (err) {
          console.error(err);
          alert('Failed to save team member.');
          renderTeam();
        }
      }, 'team-member-name')
    );
    const billetWrap = document.createElement('div');
    billetWrap.className = 'team-member-billet-wrap';
    billetWrap.appendChild(
      createTeamMemberInput(member.billetOrRole, 'Billet / Role', editable, async (e) => {
        const value = e.target.value.trim();
        if (value === member.billetOrRole) return;
        try {
          member.billetOrRole = value;
          await updateTeamMember(member.id, { billetOrRole: value });
        } catch (err) {
          console.error(err);
          alert('Failed to save team member.');
          renderTeam();
        }
      }, 'team-member-billet')
    );
    billetCell.appendChild(nameWrap);
    billetCell.appendChild(billetWrap);
    row.appendChild(billetCell);

    const statusCell = document.createElement('td');
    statusCell.className = 'team-cell-status';
    statusCell.appendChild(
      createTeamMemberInput(member.statusNextAction, 'Status / Next Action', editable, async (e) => {
        const value = e.target.value.trim();
        if (value === member.statusNextAction) return;
        try {
          member.statusNextAction = value;
          await updateTeamMember(member.id, { statusNextAction: value });
        } catch (err) {
          console.error(err);
          alert('Failed to save team member.');
          renderTeam();
        }
      }, 'team-report-field team-field-status')
    );
    row.appendChild(statusCell);

    const prdCell = document.createElement('td');
    prdCell.className = 'team-cell-prd';
    const prdFieldWrap = document.createElement('div');
    prdFieldWrap.className = 'team-cell-prd-field';
    prdFieldWrap.appendChild(
      createTeamMemberInput(member.prdEaos, 'PRD / EAOS', editable, async (e) => {
        const value = e.target.value.trim();
        if (value === member.prdEaos) return;
        try {
          member.prdEaos = value;
          await updateTeamMember(member.id, { prdEaos: value });
        } catch (err) {
          console.error(err);
          alert('Failed to save team member.');
          renderTeam();
        }
      }, 'team-report-field team-field-prd')
    );
    prdCell.appendChild(prdFieldWrap);
    appendTeamMemberDeleteButton(row, prdCell, member.id, editable);
    row.appendChild(prdCell);

    tbody.appendChild(row);
  });
}

function renderTeamPageContent(container, editable) {
  container.innerHTML = `
    <div class="team-report">
      <section class="team-report-section">
        <div class="team-report-section-header">
          <h2 class="team-report-title">MANPOWER / MANNING</h2>
          ${editable ? '<button type="button" class="team-report-action-btn" id="add-team-member-btn">+ Add Team Member</button>' : ''}
        </div>
        <div class="team-report-divider" aria-hidden="true"></div>
        <div class="team-report-table-wrap">
          <table class="team-manpower-table">
            <thead>
              <tr>
                <th class="team-col-billet">Billet / Personnel</th>
                <th class="team-col-status">Status / Next Action</th>
                <th class="team-col-prd">PRD / EAOS</th>
              </tr>
            </thead>
            <tbody id="team-members-body"></tbody>
          </table>
        </div>
      </section>
      <section class="team-report-section team-report-notes-section">
        <h2 class="team-report-title">Command Highlights Notes</h2>
        <div class="team-report-divider" aria-hidden="true"></div>
        <textarea id="command-highlights-notes" class="team-report-notes" rows="10" ${editable ? '' : 'readonly'}></textarea>
      </section>
    </div>`;

  renderTeamMembersTable(container.querySelector('#team-members-body'), editable);

  const notesEl = container.querySelector('#command-highlights-notes');
  notesEl.value = commandHighlightsNotes;
  if (editable) {
    notesEl.addEventListener('blur', async () => {
      const value = notesEl.value;
      if (value === commandHighlightsNotes) return;
      try {
        commandHighlightsNotes = await updateCommandHighlightsNotes(value);
      } catch (err) {
        console.error(err);
        alert('Failed to save command highlights notes.');
        renderTeam();
      }
    });

    container.querySelector('#add-team-member-btn').addEventListener('click', async () => {
      try {
        const created = await createTeamMember({
          name: '',
          billetOrRole: '',
          statusNextAction: '',
          prdEaos: '',
          displayOrder: teamMembers.length,
        });
        teamMembers.push(created);
        renderTeamMembersTable(container.querySelector('#team-members-body'), editable);
      } catch (err) {
        console.error(err);
        alert('Failed to add team member.');
      }
    });
  }
}

async function renderTeam() {
  const container = document.getElementById('team-content');
  const editable = canEditTeam();

  container.innerHTML = '<p class="team-report-status">Loading team data…</p>';

  try {
    const [members, notes] = await Promise.all([
      fetchTeamMembers(),
      fetchCommandHighlightsNotes(),
    ]);
    teamMembers = members;
    commandHighlightsNotes = notes;
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="team-report-status team-report-status-error">Failed to load team data.</p>';
    return;
  }

  renderTeamPageContent(container, editable);
}

function ensureEventTypeTemplateStyles() {
  if (document.getElementById('event-type-template-styles')) return;

  const style = document.createElement('style');
  style.id = 'event-type-template-styles';
  style.textContent = `
    .event-type-name-row {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      margin-bottom: 12px;
    }

    .event-type-name-row .event-type-input {
      flex: 1;
    }

    .event-type-name-field {
      flex: 1;
      margin-bottom: 0;
    }

    .event-type-template-field {
      display: block;
      margin-bottom: 12px;
    }

    .event-type-template-label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #00205b;
    }

    .event-type-textarea {
      width: 100%;
      min-height: 88px;
      padding: 10px 12px;
      border: 1px solid #dde3ea;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.45;
      color: #1f2937;
      background: #fff;
      resize: vertical;
    }

    .event-type-textarea:focus {
      outline: none;
      border-color: #00205b;
      box-shadow: 0 0 0 3px rgba(0, 32, 91, 0.12);
    }

    .event-type-textarea:read-only {
      background: #f9fafb;
      color: #4b5563;
    }

    .event-type-series-code-input {
      width: 72px;
      padding: 8px 10px;
      border: 1px solid #dde3ea;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.06em;
      color: #4b5563;
      background: #f9fafb;
    }

    .settings-section + .settings-section {
      margin-top: 32px;
      padding-top: 32px;
      border-top: 1px solid #dde3ea;
    }

    .settings-section-title {
      margin: 0 0 8px;
      font-size: 0.875rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #00205b;
    }
  `;
  document.head.appendChild(style);
}

function cleanSettingsReferenceName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function updateSettingsSubnav() {
  document.querySelectorAll('.settings-subtab').forEach((btn) => {
    btn.classList.toggle('settings-subtab-active', btn.dataset.settingsTab === settingsTab);
  });

  const subtitle = document.getElementById('settings-subtitle');
  if (subtitle) {
    subtitle.textContent = settingsTab === 'reference-lists' ? 'Reference Lists' : 'Event Types';
  }

  const eventPanel = document.getElementById('settings-event-types-panel');
  const refPanel = document.getElementById('settings-reference-lists-panel');
  if (eventPanel) eventPanel.hidden = settingsTab !== 'event-types';
  if (refPanel) refPanel.hidden = settingsTab !== 'reference-lists';
}

function switchSettingsTab(tab) {
  settingsTab = tab === 'reference-lists' ? 'reference-lists' : 'event-types';
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  updateSettingsSubnav();
}

function applySettingsEventTypeFilter() {
  const list = document.getElementById('event-type-list');
  const empty = document.getElementById('settings-event-type-empty');
  if (!list) return;

  let visibleCount = 0;
  list.querySelectorAll('.event-type-item').forEach((item) => {
    const record = eventTypeRecords.find((entry) => entry.id === item.dataset.eventTypeId);
    const matches = eventTypeMatchesSettingsQuery(record, settingsEventTypeQuery);
    item.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  if (empty) {
    empty.hidden = visibleCount > 0 || !normalizeSettingsSearchQuery(settingsEventTypeQuery);
  }
}

function getSettingsReferenceItems(category) {
  switch (category) {
    case 'commands':
      return referenceCommands;
    case 'locations':
      return referenceLocations;
    case 'venues':
      return referenceVenues;
    case 'caterers':
      return referenceCaterers;
    case 'people':
      return referencePeople;
    default:
      return [];
  }
}

function setSettingsReferenceItems(category, list) {
  switch (category) {
    case 'commands':
      referenceCommands = list;
      break;
    case 'locations':
      referenceLocations = list;
      break;
    case 'venues':
      referenceVenues = list;
      break;
    case 'caterers':
      referenceCaterers = list;
      break;
    case 'people':
      referencePeople = list;
      break;
    default:
      return;
  }

  if (category === 'people') {
    eventReferenceFields?.refreshPeople();
  } else {
    eventReferenceFields?.refreshNamed();
  }
}

function settingsReferenceConflictMessage(error, fallbackName = 'that name') {
  if (error?.code === 'REFERENCE_NAME_EXISTS') {
    return error.message || `A roster entry named “${fallbackName}” already exists.`;
  }
  if (error?.message === 'REFERENCE_NAME_REQUIRED') {
    return 'Name is required.';
  }
  return null;
}

async function addSettingsReferenceEntry(category, name) {
  let created;
  if (category === 'commands') created = await createCommand(name);
  else if (category === 'locations') created = await createLocation(name);
  else if (category === 'venues') created = await createVenue(name);
  else if (category === 'caterers') created = await createCaterer(name);
  else if (category === 'people') created = await createPerson(name);
  else throw new Error('Invalid roster type.');

  setSettingsReferenceItems(category, upsertReferenceItem(getSettingsReferenceItems(category), created));
  return created;
}

async function renameSettingsReferenceEntry(category, id, name) {
  let updated;
  if (category === 'commands') updated = await updateCommand(id, { name });
  else if (category === 'locations') updated = await updateLocation(id, { name });
  else if (category === 'venues') updated = await updateVenue(id, { name });
  else if (category === 'caterers') updated = await updateCaterer(id, { name });
  else if (category === 'people') updated = await updatePerson(id, { name });
  else throw new Error('Invalid roster type.');

  setSettingsReferenceItems(category, applyReferenceUpdate(getSettingsReferenceItems(category), updated));
  await reloadEventsAfterCanonicalRename();
  return updated;
}

async function removeSettingsReferenceEntry(category, id) {
  if (category === 'commands') await removeCommand(id);
  else if (category === 'locations') await removeLocation(id);
  else if (category === 'venues') await removeVenue(id);
  else if (category === 'caterers') await removeCaterer(id);
  else if (category === 'people') await removePerson(id);
  else throw new Error('Invalid roster type.');

  setSettingsReferenceItems(category, removeReferenceItem(getSettingsReferenceItems(category), id));
}

function clearSettingsReferenceForm() {
  settingsReferenceForm = null;
}

function renderAarGlobalTemplatesSection(container, editable) {
  const section = document.createElement('div');
  section.className = 'settings-section';

  const title = document.createElement('h3');
  title.className = 'settings-section-title';
  title.textContent = 'AAR Global Templates';

  const help = document.createElement('p');
  help.className = 'settings-help';
  help.textContent =
    'Global requirements text used on every After Action Report. Changes save when you leave each field.';

  const credoField = createEventTypeTemplateField(
    'CREDO Requirements',
    aarGlobalTemplates.credoRequirements || '',
    editable,
    async () => {
      const nextValue = credoField.textarea.value;
      if (nextValue === aarGlobalTemplates.credoRequirements) return;

      try {
        const saved = await updateAarGlobalTemplates({ credoRequirements: nextValue });
        aarGlobalTemplates.credoRequirements = saved.credoRequirements;
      } catch (err) {
        console.error(err);
        credoField.textarea.value = aarGlobalTemplates.credoRequirements;
        alert('Failed to save CREDO Requirements.');
      }
    }
  );

  const commandField = createEventTypeTemplateField(
    'Command Requirements',
    aarGlobalTemplates.commandRequirements || '',
    editable,
    async () => {
      const nextValue = commandField.textarea.value;
      if (nextValue === aarGlobalTemplates.commandRequirements) return;

      try {
        const saved = await updateAarGlobalTemplates({ commandRequirements: nextValue });
        aarGlobalTemplates.commandRequirements = saved.commandRequirements;
      } catch (err) {
        console.error(err);
        commandField.textarea.value = aarGlobalTemplates.commandRequirements;
        alert('Failed to save Command Requirements.');
      }
    }
  );

  section.appendChild(title);
  section.appendChild(help);
  section.appendChild(credoField.field);
  section.appendChild(commandField.field);
  container.appendChild(section);
}

function renderSettingsEventTypesPanel() {
  ensureEventTypeTemplateStyles();
  const container = document.getElementById('settings-event-types-panel');
  if (!container) return;

  const editable = canManageEventTypes();
  container.innerHTML = `
    <p class="settings-help">Edit event type names and AAR template text below. Name changes apply to new events and dropdowns.</p>
    <label class="settings-search-field">
      <span class="settings-search-label">Search Event Types</span>
      <input type="search" id="settings-event-type-search" class="settings-search-input" placeholder="Search by name or series code" autocomplete="off">
    </label>
    <ul class="event-type-list" id="event-type-list"></ul>
    <p class="settings-help" id="settings-event-type-empty" hidden>No event types match this search.</p>
    ${editable ? '<button type="button" class="btn btn-secondary" id="add-event-type-btn">+ Add Event Type</button>' : ''}
  `;

  const list = container.querySelector('#event-type-list');
  eventTypeRecords.forEach((record, index) => {
    list.appendChild(createEventTypeRow(index, editable));
  });

  const searchInput = container.querySelector('#settings-event-type-search');
  if (searchInput) {
    searchInput.value = settingsEventTypeQuery;
    searchInput.addEventListener('input', () => {
      settingsEventTypeQuery = searchInput.value;
      applySettingsEventTypeFilter();
    });
  }
  applySettingsEventTypeFilter();

  renderAarGlobalTemplatesSection(container, editable);

  const addBtn = container.querySelector('#add-event-type-btn');
  if (editable && addBtn) {
    addBtn.addEventListener('click', async () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      try {
        const sortOrder = eventTypeRecords.length;
        const created = await insertEventType('New Event Type', sortOrder);
        eventTypeRecords.push(created);
        syncEventTypeNames();
        renderSettingsEventTypesPanel();
      } catch (err) {
        console.error(err);
        alert('Failed to add event type.');
      }
    });
  }
}

function renderSettingsReferenceAction(container, editable) {
  if (!editable || !settingsReferenceForm) return;

  const form = settingsReferenceForm;
  const panel = document.createElement('div');
  panel.className = 'settings-ref-action';

  const cancelForm = () => {
    clearSettingsReferenceForm();
    renderSettingsReferenceListsPanel();
  };

  if (form.mode === 'add' || form.mode === 'rename') {
    const title = document.createElement('div');
    title.className = 'settings-ref-action-title';
    title.textContent = form.mode === 'add' ? 'Add New' : 'Rename';

    const label = document.createElement('label');
    label.className = 'settings-ref-action-label';
    const labelText = document.createElement('span');
    labelText.textContent = 'Name';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'settings-search-input';
    input.maxLength = 200;
    input.value = form.draftName || (form.mode === 'rename' ? form.currentName : '');
    label.append(labelText, input);

    const actions = document.createElement('div');
    actions.className = 'settings-ref-action-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelForm);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = form.mode === 'add' ? 'Add' : 'Save';
    saveBtn.addEventListener('click', async () => {
      const nextName = cleanSettingsReferenceName(input.value);
      if (!nextName) {
        alert('Name is required.');
        return;
      }
      if (form.mode === 'add') {
        saveBtn.disabled = true;
        try {
          await addSettingsReferenceEntry(settingsReferenceCategory, nextName);
          clearSettingsReferenceForm();
          renderSettingsReferenceListsPanel();
        } catch (err) {
          console.error(err);
          saveBtn.disabled = false;
          alert(settingsReferenceConflictMessage(err, nextName) || 'Failed to add reference entry.');
        }
        return;
      }

      if (nextName === form.currentName) {
        cancelForm();
        return;
      }
      settingsReferenceForm = {
        ...form,
        mode: 'rename-confirm',
        draftName: nextName,
      };
      renderSettingsReferenceListsPanel();
    });

    actions.append(cancelBtn, saveBtn);
    panel.append(title, label, actions);
    container.appendChild(panel);
    input.focus();
    input.select();
    return;
  }

  if (form.mode === 'rename-confirm') {
    const lead = document.createElement('p');
    lead.className = 'settings-ref-action-lead';
    lead.textContent = `Rename “${form.currentName}” to “${form.draftName}”?`;

    const copy = document.createElement('p');
    copy.className = 'settings-help';
    copy.textContent = 'This will update this name everywhere it is currently used in Events and AARs.';

    const actions = document.createElement('div');
    actions.className = 'settings-ref-action-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      settingsReferenceForm = { ...form, mode: 'rename' };
      renderSettingsReferenceListsPanel();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Rename Everywhere';
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      const category = settingsReferenceCategory;
      const itemId = form.itemId;
      const draftName = form.draftName;
      clearSettingsReferenceForm();
      try {
        await renameSettingsReferenceEntry(category, itemId, draftName);
        if (currentView === 'settings' && settingsTab === 'reference-lists') {
          renderSettingsReferenceListsPanel();
        }
      } catch (err) {
        console.error(err);
        settingsReferenceForm = form;
        confirmBtn.disabled = false;
        if (currentView === 'settings' && settingsTab === 'reference-lists') {
          renderSettingsReferenceListsPanel();
        }
        alert(settingsReferenceConflictMessage(err, draftName) || 'Failed to rename roster entry.');
      }
    });

    actions.append(cancelBtn, confirmBtn);
    panel.append(lead, copy, actions);
    container.appendChild(panel);
    return;
  }

  if (form.mode === 'remove') {
    const lead = document.createElement('p');
    lead.className = 'settings-ref-action-lead';
    lead.textContent = `Remove “${form.currentName}” from the list?`;

    const copy = document.createElement('p');
    copy.className = 'settings-help';
    copy.textContent = 'This removes it from future selections. Existing Events and AARs will not be changed.';

    const actions = document.createElement('div');
    actions.className = 'settings-ref-action-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelForm);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Remove';
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      try {
        await removeSettingsReferenceEntry(settingsReferenceCategory, form.itemId);
        clearSettingsReferenceForm();
        renderSettingsReferenceListsPanel();
      } catch (err) {
        console.error(err);
        confirmBtn.disabled = false;
        alert('Failed to remove roster entry from the list.');
      }
    });

    actions.append(cancelBtn, confirmBtn);
    panel.append(lead, copy, actions);
    container.appendChild(panel);
  }
}

function fillSettingsReferenceTableBody(tbody, editable) {
  tbody.innerHTML = '';
  const items = getSettingsReferenceItems(settingsReferenceCategory);
  const visibleItems = filterReferenceEntriesForSettings(items, settingsReferenceQuery);

  if (!visibleItems.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = editable ? 2 : 1;
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = items.length && normalizeSettingsSearchQuery(settingsReferenceQuery)
      ? 'No names match this search.'
      : 'No roster entries in this list.';
    emptyCell.appendChild(empty);
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }

  visibleItems.forEach((item) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = item.name;
    row.appendChild(nameCell);

    if (editable) {
      const actionCell = document.createElement('td');
      actionCell.className = 'aar-action-cell settings-ref-actions-col';

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'aar-action-btn';
      renameBtn.textContent = 'Rename';
      renameBtn.addEventListener('click', () => {
        settingsReferenceForm = {
          mode: 'rename',
          itemId: item.id,
          currentName: item.name,
          draftName: item.name,
        };
        renderSettingsReferenceListsPanel();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'aar-action-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        settingsReferenceForm = {
          mode: 'remove',
          itemId: item.id,
          currentName: item.name,
        };
        renderSettingsReferenceListsPanel();
      });

      actionCell.append(renameBtn, removeBtn);
      row.appendChild(actionCell);
    }

    tbody.appendChild(row);
  });
}

function renderSettingsReferenceListsPanel() {
  const container = document.getElementById('settings-reference-lists-panel');
  if (!container) return;

  if (!isSettingsReferenceCategory(settingsReferenceCategory)) {
    settingsReferenceCategory = 'commands';
  }

  const editable = canEditEvents();
  const category = SETTINGS_REFERENCE_CATEGORIES.find((entry) => entry.key === settingsReferenceCategory);
  const items = getSettingsReferenceItems(settingsReferenceCategory);

  container.innerHTML = '';

  const catNav = document.createElement('div');
  catNav.className = 'settings-ref-cats';
  catNav.setAttribute('role', 'tablist');
  catNav.setAttribute('aria-label', 'Reference list categories');
  SETTINGS_REFERENCE_CATEGORIES.forEach((entry) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-ref-cat';
    btn.classList.toggle('settings-ref-cat-active', entry.key === settingsReferenceCategory);
    btn.textContent = entry.label;
    btn.addEventListener('click', () => {
      if (settingsReferenceCategory === entry.key) return;
      settingsReferenceCategory = entry.key;
      clearSettingsReferenceForm();
      renderSettingsReferenceListsPanel();
    });
    catNav.appendChild(btn);
  });
  container.appendChild(catNav);

  const heading = document.createElement('div');
  heading.className = 'settings-ref-heading';

  const title = document.createElement('h3');
  title.className = 'settings-section-title';
  title.textContent = category?.label || 'Reference Lists';

  const count = document.createElement('span');
  count.className = 'settings-ref-count';
  count.textContent = String(items.length);

  heading.append(title, count);
  container.appendChild(heading);

  if (settingsReferenceCategory === 'people') {
    const peopleNote = document.createElement('p');
    peopleNote.className = 'settings-help';
    peopleNote.textContent = SETTINGS_PEOPLE_NOTE;
    container.appendChild(peopleNote);
  }

  const staffNote = document.createElement('p');
  staffNote.className = 'settings-help settings-staff-note';
  staffNote.append(document.createTextNode(`${SETTINGS_STAFF_NOTE} `));
  const teamLink = document.createElement('button');
  teamLink.type = 'button';
  teamLink.className = 'settings-inline-link';
  teamLink.textContent = 'Open Team';
  teamLink.addEventListener('click', () => switchView('team'));
  staffNote.appendChild(teamLink);
  container.appendChild(staffNote);

  const toolbar = document.createElement('div');
  toolbar.className = 'settings-ref-toolbar';

  const searchField = document.createElement('label');
  searchField.className = 'settings-search-field';
  const searchLabel = document.createElement('span');
  searchLabel.className = 'settings-search-label';
  searchLabel.textContent = `Search ${category?.label || 'list'}`;
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'settings-search-input';
  searchInput.placeholder = 'Search by name';
  searchInput.autocomplete = 'off';
  searchInput.value = settingsReferenceQuery;
  searchInput.addEventListener('input', () => {
    settingsReferenceQuery = searchInput.value;
    const tableBody = container.querySelector('#settings-ref-body');
    if (tableBody) fillSettingsReferenceTableBody(tableBody, editable);
  });
  searchField.append(searchLabel, searchInput);
  toolbar.appendChild(searchField);

  if (editable) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary';
    addBtn.textContent = 'Add New';
    addBtn.addEventListener('click', () => {
      settingsReferenceForm = { mode: 'add', draftName: '' };
      renderSettingsReferenceListsPanel();
    });
    toolbar.appendChild(addBtn);
  }

  container.appendChild(toolbar);
  renderSettingsReferenceAction(container, editable);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'events-table settings-ref-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const nameHead = document.createElement('th');
  nameHead.textContent = 'Name';
  headRow.appendChild(nameHead);
  if (editable) {
    const actionsHead = document.createElement('th');
    actionsHead.className = 'settings-ref-actions-col';
    actionsHead.textContent = 'Actions';
    headRow.appendChild(actionsHead);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.id = 'settings-ref-body';
  fillSettingsReferenceTableBody(tbody, editable);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  container.appendChild(tableWrap);
}

function renderSettings() {
  updateSettingsSubnav();
  renderSettingsEventTypesPanel();
  renderSettingsReferenceListsPanel();
}

function createEventTypeTemplateField(labelText, value, editable, onSave) {
  const field = document.createElement('label');
  field.className = 'event-type-template-field';

  const label = document.createElement('span');
  label.className = 'event-type-template-label';
  label.textContent = labelText;

  const textarea = document.createElement('textarea');
  textarea.className = 'event-type-textarea';
  textarea.value = value;
  textarea.readOnly = !editable;
  textarea.rows = 4;

  if (editable) {
    textarea.addEventListener('blur', onSave);
  }

  field.appendChild(label);
  field.appendChild(textarea);
  return { field, textarea };
}

function createEventTypeSeriesCodeField(seriesCode) {
  const field = document.createElement('div');
  field.className = 'event-type-template-field';

  const label = document.createElement('span');
  label.className = 'event-type-template-label';
  label.textContent = 'Series Code';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'event-type-series-code-input';
  input.value = seriesCode || '';
  input.placeholder = '—';
  input.readOnly = true;
  input.tabIndex = -1;

  field.appendChild(label);
  field.appendChild(input);
  return field;
}

function createEventTypeRow(index, editable) {
  const record = eventTypeRecords[index];
  const li = document.createElement('li');
  li.className = 'event-type-item';
  li.dataset.eventTypeId = record.id;

  const details = document.createElement('details');
  details.className = 'event-type-row';

  const summary = document.createElement('summary');
  summary.className = 'event-type-summary';

  const codeEl = document.createElement('span');
  codeEl.className = 'event-type-summary-code';
  codeEl.textContent = record.seriesCode || '—';

  const nameEl = document.createElement('span');
  nameEl.className = 'event-type-summary-name';
  nameEl.textContent = record.name;

  const editEl = document.createElement('span');
  editEl.className = 'event-type-summary-edit';
  editEl.textContent = 'Edit ▾';

  summary.append(codeEl, nameEl, editEl);

  const body = document.createElement('div');
  body.className = 'event-type-row-body';

  const nameRow = document.createElement('div');
  nameRow.className = 'event-type-name-row';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'event-type-template-field event-type-name-field';
  const nameLabelText = document.createElement('span');
  nameLabelText.className = 'event-type-template-label';
  nameLabelText.textContent = 'Event Type';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'event-type-input';
  input.value = record.name;
  input.readOnly = !editable;
  nameLabel.append(nameLabelText, input);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'event-type-remove';
  removeBtn.setAttribute('aria-label', 'Remove event type');
  removeBtn.textContent = '×';
  removeBtn.disabled = !editable || !canRemoveEventTypeFromSettings(eventTypeRecords.length);

  const saveName = async () => {
    const trimmed = input.value.trim();
    if (!trimmed) {
      input.value = record.name;
      return;
    }
    const previous = record.name;
    if (trimmed === previous) return;

    try {
      const saved = await updateEventType(record.id, { name: trimmed });
      await renameEventTypeInEvents(previous, trimmed);
      record.name = saved.name;
      input.value = saved.name;
      nameEl.textContent = saved.name;
      events.forEach((event) => {
        if (event.eventType === previous) event.eventType = trimmed;
      });
      syncEventTypeNames();
    } catch (err) {
      console.error(err);
      input.value = record.name;
      alert('Failed to update event type.');
    }
  };

  const objectivesField = createEventTypeTemplateField(
    'Objectives',
    record.objectives || '',
    editable,
    async () => {
      const nextValue = objectivesField.textarea.value;
      if (nextValue === record.objectives) return;

      try {
        const saved = await updateEventType(record.id, { objectives: nextValue });
        record.objectives = saved.objectives;
      } catch (err) {
        console.error(err);
        objectivesField.textarea.value = record.objectives;
        alert('Failed to save objectives.');
      }
    }
  );

  const descriptionField = createEventTypeTemplateField(
    'Description',
    record.description || '',
    editable,
    async () => {
      const nextValue = descriptionField.textarea.value;
      if (nextValue === record.description) return;

      try {
        const saved = await updateEventType(record.id, { description: nextValue });
        record.description = saved.description;
      } catch (err) {
        console.error(err);
        descriptionField.textarea.value = record.description;
        alert('Failed to save description.');
      }
    }
  );

  if (editable) {
    input.addEventListener('blur', saveName);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });

    removeBtn.addEventListener('click', async () => {
      if (!canRemoveEventTypeFromSettings(eventTypeRecords.length)) return;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      try {
        await deleteEventType(record.id);
        const recordIndex = eventTypeRecords.findIndex((entry) => entry.id === record.id);
        if (recordIndex >= 0) eventTypeRecords.splice(recordIndex, 1);
        syncEventTypeNames();
        renderSettingsEventTypesPanel();
      } catch (err) {
        console.error(err);
        alert('Failed to remove event type.');
      }
    });
  }

  nameRow.appendChild(nameLabel);
  nameRow.appendChild(removeBtn);
  body.appendChild(nameRow);
  body.appendChild(createEventTypeSeriesCodeField(record.seriesCode));
  body.appendChild(objectivesField.field);
  body.appendChild(descriptionField.field);
  details.append(summary, body);
  li.appendChild(details);
  return li;
}

function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentFiscalYearNumber(date = new Date()) {
  return date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
}

function shiftLocalDateByMonths(date, months) {
  const shifted = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(date.getDate(), lastDay));
  return shifted;
}

function parseLocalIsoDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`);
}

function shiftLocalDateByYears(date, years) {
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay));
}

function shiftIsoDateByYears(isoDate, years) {
  return formatLocalIsoDate(shiftLocalDateByYears(parseLocalIsoDate(isoDate), years));
}

function shiftTrendsRangeByYears(range, years) {
  return {
    start: shiftIsoDateByYears(range.start, years),
    end: shiftIsoDateByYears(range.end, years),
  };
}

function addDaysToIsoDate(isoDate, days) {
  const date = parseLocalIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return formatLocalIsoDate(date);
}

function inclusiveDayCount(startIso, endIso) {
  const start = parseLocalIsoDate(startIso);
  const end = parseLocalIsoDate(endIso);
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / 86400000) + 1;
}

function getTrendsEventDate(event) {
  const raw = event?.startDate ?? event?.date;
  if (isTbd(raw)) return null;
  const isoDate = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (formatLocalIsoDate(parsed) !== isoDate) return null;
  return isoDate;
}

function getTrendsParticipantCount(value) {
  if (isTbd(value)) return 0;
  const num = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

function resolveTrendsVenueCost(event) {
  const aarValue = parseAarCostNumber(event.aarVenueCost);
  if (aarValue != null) return aarValue;
  return parseEventCostNumber(event.venueCost);
}

function resolveTrendsCateringCost(event) {
  const aarValue = parseAarCostNumber(event.aarCateringCost);
  if (aarValue != null) return aarValue;
  return parseEventCostNumber(event.cateringCost);
}

function getTrendsEventRecordedCost(event) {
  return (
    resolveTrendsVenueCost(event)
    + resolveTrendsCateringCost(event)
    + parseEventCostNumber(event.lodgingCost)
    + parseEventCostNumber(event.transportationCost)
    + parseEventCostNumber(event.materialsCost)
    + parseEventCostNumber(event.otherCost)
  );
}

function getTrendsCommandKey(event) {
  const command = String(event?.command ?? '').trim();
  if (!command || isTbd(command)) return '';
  return command;
}

function getTrendsCommandOptions() {
  const commands = new Set();
  events.forEach((event) => {
    if (!isAarFinalized(event)) return;
    const command = getTrendsCommandKey(event);
    if (command) commands.add(command);
  });
  return [...commands].sort((a, b) => a.localeCompare(b));
}

function populateTrendsSelect(select, placeholderHtml, values) {
  if (!select) return;
  const selected = select.value;
  select.innerHTML = [
    placeholderHtml,
    ...values.map((value) => `<option value="${value}">${value}</option>`),
  ].join('');
  if ([...select.options].some((option) => option.value === selected)) {
    select.value = selected;
  }
}

function populateTrendsFilterOptions() {
  populateTrendsSelect(
    document.getElementById('trends-event-type'),
    '<option value="">All Event Types</option>',
    eventTypes
  );
  populateTrendsSelect(
    document.getElementById('trends-command'),
    '<option value="">All Commands</option>',
    getTrendsCommandOptions()
  );
}

function updateTrendsCustomDateFields() {
  const isCustom = document.getElementById('trends-period')?.value === 'custom';
  const startField = document.getElementById('trends-start-field');
  const endField = document.getElementById('trends-end-field');
  const startInput = document.getElementById('trends-start-date');
  const endInput = document.getElementById('trends-end-date');
  if (startField) startField.hidden = !isCustom;
  if (endField) endField.hidden = !isCustom;
  if (startInput) startInput.disabled = !isCustom;
  if (endInput) endInput.disabled = !isCustom;
}

const TRENDS_COMPARE_PREVIOUS = 'previous';
const TRENDS_COMPARE_LAST_YEAR = 'last-year';
const TRENDS_COMPARE_AVG_2 = 'avg-2';
const TRENDS_COMPARE_AVG_3 = 'avg-3';
const TRENDS_COMPARE_NONE = 'none';
const TRENDS_BREAKDOWN_DEFAULT_ROWS = 8;
let trendsDemandExpanded = false;
let trendsReachExpanded = false;
let trendsSpendingExpanded = false;
let trendsCostDetailsExpanded = false;
let trendsExplorerViewState = null;
let trendsExplorerUserChange = null;
let trendsExplorerSliderMax = 0;
let trendsExplorerAssignments = null;

function getTrendsPeriodValue() {
  return document.getElementById('trends-period')?.value || 'this-fy';
}

function getTrendsCompareMode() {
  return document.getElementById('trends-compare')?.value || TRENDS_COMPARE_PREVIOUS;
}

function getTrendsFilterState() {
  return {
    eventType: document.getElementById('trends-event-type')?.value || '',
    command: document.getElementById('trends-command')?.value || '',
  };
}

function getTrendsCurrentRange() {
  const period = getTrendsPeriodValue();
  const today = new Date();
  const todayIso = formatLocalIsoDate(today);

  if (period === '3m' || period === '6m' || period === '12m') {
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    return {
      start: formatLocalIsoDate(shiftLocalDateByMonths(today, -months)),
      end: todayIso,
    };
  }

  if (period === 'last-fy') {
    return getFiscalYearRange(getCurrentFiscalYearNumber(today) - 1);
  }

  if (period === 'custom') {
    const start = document.getElementById('trends-start-date')?.value || '';
    const end = document.getElementById('trends-end-date')?.value || '';
    if (!start || !end || start > end) return null;
    return { start, end };
  }

  const fyRange = getFiscalYearRange(getCurrentFiscalYearNumber(today));
  return {
    start: fyRange.start,
    end: todayIso < fyRange.end ? todayIso : fyRange.end,
  };
}

function getPreviousEquivalentRange(currentRange, period) {
  if (period === 'this-fy' || period === 'last-fy') {
    return shiftTrendsRangeByYears(currentRange, -1);
  }

  const days = inclusiveDayCount(currentRange.start, currentRange.end);
  const end = addDaysToIsoDate(currentRange.start, -1);
  const start = addDaysToIsoDate(end, -(days - 1));
  return { start, end };
}

function getTrendsComparisonRanges(currentRange, period, compareMode) {
  if (!currentRange || compareMode === TRENDS_COMPARE_NONE) return [];

  if (compareMode === TRENDS_COMPARE_PREVIOUS) {
    return [getPreviousEquivalentRange(currentRange, period)];
  }
  if (compareMode === TRENDS_COMPARE_LAST_YEAR) {
    return [shiftTrendsRangeByYears(currentRange, -1)];
  }
  if (compareMode === TRENDS_COMPARE_AVG_2) {
    return [
      shiftTrendsRangeByYears(currentRange, -1),
      shiftTrendsRangeByYears(currentRange, -2),
    ];
  }
  if (compareMode === TRENDS_COMPARE_AVG_3) {
    return [
      shiftTrendsRangeByYears(currentRange, -1),
      shiftTrendsRangeByYears(currentRange, -2),
      shiftTrendsRangeByYears(currentRange, -3),
    ];
  }
  return [];
}

function getTrendsEventsForRange(range, filters) {
  if (!range) return [];

  const todayIso = formatLocalIsoDate(new Date());
  const eventType = filters?.eventType || '';
  const command = filters?.command || '';

  return events.filter((event) => {
    if (!isAarFinalized(event)) return false;

    const isoDate = getTrendsEventDate(event);
    if (!isoDate || isoDate > todayIso) return false;
    if (!isDateInRange(isoDate, range.start, range.end)) return false;
    if (eventType && event.eventType !== eventType) return false;
    if (command && getTrendsCommandKey(event) !== command) return false;
    return true;
  });
}

function getTrendsScheduledEventsForRange(range, filters) {
  return filterTrendsScheduledEvents(events, {
    todayIso: formatLocalIsoDate(new Date()),
    range,
    eventType: filters?.eventType || '',
    command: filters?.command || '',
    getEventDate: getTrendsEventDate,
    getCommandKey: getTrendsCommandKey,
  });
}

function calculateTrendsMetrics(eventsForRange) {
  const commands = new Set();
  let participantReach = 0;
  let totalRecordedEventCost = 0;

  eventsForRange.forEach((event) => {
    participantReach += getTrendsParticipantCount(event.participants);
    totalRecordedEventCost += getTrendsEventRecordedCost(event);
    const command = getTrendsCommandKey(event);
    if (command) commands.add(command);
  });

  return {
    completedEvents: eventsForRange.length,
    participantReach,
    commandsReached: commands.size,
    totalRecordedEventCost,
    costPerParticipant: participantReach > 0 ? totalRecordedEventCost / participantReach : null,
  };
}

function averageTrendsMetrics(metricsList) {
  const count = metricsList.length;
  if (count === 0) {
    return {
      completedEvents: 0,
      participantReach: 0,
      commandsReached: 0,
      totalRecordedEventCost: 0,
      costPerParticipant: null,
    };
  }

  const totals = metricsList.reduce(
    (sum, metrics) => ({
      completedEvents: sum.completedEvents + metrics.completedEvents,
      participantReach: sum.participantReach + metrics.participantReach,
      commandsReached: sum.commandsReached + metrics.commandsReached,
      totalRecordedEventCost: sum.totalRecordedEventCost + metrics.totalRecordedEventCost,
    }),
    {
      completedEvents: 0,
      participantReach: 0,
      commandsReached: 0,
      totalRecordedEventCost: 0,
    }
  );

  const cppValues = metricsList
    .map((metrics) => metrics.costPerParticipant)
    .filter((value) => value != null && Number.isFinite(value));

  return {
    completedEvents: totals.completedEvents / count,
    participantReach: totals.participantReach / count,
    commandsReached: totals.commandsReached / count,
    totalRecordedEventCost: totals.totalRecordedEventCost / count,
    costPerParticipant: cppValues.length > 0
      ? cppValues.reduce((sum, value) => sum + value, 0) / cppValues.length
      : null,
  };
}

function getTrendsComparisonPhrase(compareMode) {
  if (compareMode === TRENDS_COMPARE_PREVIOUS) return 'Previous Period';
  if (compareMode === TRENDS_COMPARE_LAST_YEAR) return 'Last Year';
  if (compareMode === TRENDS_COMPARE_AVG_2) return '2-Year Average';
  if (compareMode === TRENDS_COMPARE_AVG_3) return '3-Year Average';
  return '';
}

function buildTrendsMetricComparison(currentValue, baselineValue, compareMode, options = {}) {
  if (options.unavailable) {
    return {
      text: 'No comparison',
      direction: 'neutral',
    };
  }

  const phrase = getTrendsComparisonPhrase(compareMode);

  if (baselineValue > 0) {
    const percent = ((currentValue - baselineValue) / baselineValue) * 100;
    if (!Number.isFinite(percent)) {
      return { text: 'No comparison', direction: 'neutral' };
    }
    const rounded = Number(percent.toFixed(1));
    const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'neutral';
    const arrow = rounded > 0 ? '↑ ' : rounded < 0 ? '↓ ' : '';
    const magnitude = Math.abs(rounded).toFixed(1);
    return {
      text: `${arrow}${magnitude}% vs ${phrase}`,
      direction,
    };
  }

  if (baselineValue === 0 && currentValue === 0) {
    return {
      text: `No change vs ${phrase}`,
      direction: 'neutral',
    };
  }

  if (baselineValue === 0 && currentValue > 0) {
    return {
      text: `New activity vs ${phrase}`,
      direction: 'neutral',
    };
  }

  return {
    text: 'No comparison',
    direction: 'neutral',
  };
}

function buildTrendsComparison(currentMetrics, baselineMetrics, compareMode) {
  const currentCppUnavailable = currentMetrics.costPerParticipant == null;
  const baselineCppUnavailable = baselineMetrics.costPerParticipant == null;

  return {
    completedEvents: buildTrendsMetricComparison(
      currentMetrics.completedEvents,
      baselineMetrics.completedEvents,
      compareMode
    ),
    participantReach: buildTrendsMetricComparison(
      currentMetrics.participantReach,
      baselineMetrics.participantReach,
      compareMode
    ),
    commandsReached: buildTrendsMetricComparison(
      currentMetrics.commandsReached,
      baselineMetrics.commandsReached,
      compareMode
    ),
    totalRecordedEventCost: buildTrendsMetricComparison(
      currentMetrics.totalRecordedEventCost,
      baselineMetrics.totalRecordedEventCost,
      compareMode
    ),
    costPerParticipant: buildTrendsMetricComparison(
      currentMetrics.costPerParticipant ?? 0,
      baselineMetrics.costPerParticipant ?? 0,
      compareMode,
      { unavailable: currentCppUnavailable || baselineCppUnavailable }
    ),
  };
}

function formatTrendsKpiValue(key, metrics) {
  if (key === 'completedEvents' || key === 'commandsReached') {
    return String(metrics[key]);
  }
  if (key === 'participantReach') {
    return metrics.participantReach.toLocaleString('en-US');
  }
  if (key === 'totalRecordedEventCost') {
    return formatTotalRecordedEventCost(metrics.totalRecordedEventCost);
  }
  if (metrics.costPerParticipant == null) return '—';
  return formatTotalRecordedEventCost(metrics.costPerParticipant);
}

function formatTrendsExplainerRange(range) {
  const start = parseLocalIsoDate(range.start);
  const end = parseLocalIsoDate(range.end);
  const startMonth = start.toLocaleString('en-US', { month: 'short' });
  const endMonth = end.toLocaleString('en-US', { month: 'short' });
  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${startMonth} ${start.getDate()}, ${start.getFullYear()}–${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

function formatTrendsYearList(items) {
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  if (items.length === 3) return `${items[0]}, ${items[1]}, and ${items[2]}`;
  return items.join(', ');
}

function getTrendsRollingMonthCount(period) {
  if (period === '3m') return 3;
  if (period === '6m') return 6;
  if (period === '12m') return 12;
  return null;
}

function getTrendsFiscalYearShortLabel(range) {
  const startYear = parseInt(range.start.slice(0, 4), 10);
  return `FY${String(startYear + 1).slice(-2)}`;
}

function getTrendsExplainerQuestion(period, compareMode) {
  if (compareMode === TRENDS_COMPARE_NONE) {
    return 'Showing results for the selected time period without a historical comparison.';
  }

  const months = getTrendsRollingMonthCount(period);
  if (months != null) {
    if (compareMode === TRENDS_COMPARE_PREVIOUS) {
      return `How did we do in these ${months} months compared with the ${months} months immediately before?`;
    }
    if (compareMode === TRENDS_COMPARE_LAST_YEAR) {
      return `How did we do in these ${months} months compared with the same ${months}-month period last year?`;
    }
    if (compareMode === TRENDS_COMPARE_AVG_2) {
      return `How did we do in these ${months} months compared with the average for the same ${months}-month period over the previous 2 years?`;
    }
    if (compareMode === TRENDS_COMPARE_AVG_3) {
      return `How did we do in these ${months} months compared with the average for the same ${months}-month period over the previous 3 years?`;
    }
  }

  if (period === 'this-fy') {
    if (compareMode === TRENDS_COMPARE_PREVIOUS || compareMode === TRENDS_COMPARE_LAST_YEAR) {
      return 'How are we doing this fiscal year so far compared with the same point last fiscal year?';
    }
    if (compareMode === TRENDS_COMPARE_AVG_2) {
      return 'How are we doing this fiscal year so far compared with the average for this same period over the previous 2 years?';
    }
    if (compareMode === TRENDS_COMPARE_AVG_3) {
      return 'How are we doing this fiscal year so far compared with the average for this same period over the previous 3 years?';
    }
  }

  if (period === 'last-fy') {
    if (compareMode === TRENDS_COMPARE_PREVIOUS) {
      return 'How did we do last fiscal year compared with the fiscal year immediately before it?';
    }
    if (compareMode === TRENDS_COMPARE_LAST_YEAR) {
      return 'How did we do last fiscal year compared with the fiscal year before it?';
    }
    if (compareMode === TRENDS_COMPARE_AVG_2) {
      return 'How did we do last fiscal year compared with the average of the previous 2 fiscal years?';
    }
    if (compareMode === TRENDS_COMPARE_AVG_3) {
      return 'How did we do last fiscal year compared with the average of the previous 3 fiscal years?';
    }
  }

  if (period === 'custom') {
    if (compareMode === TRENDS_COMPARE_PREVIOUS) {
      return 'How did we do during this selected time compared with the same amount of time immediately before it?';
    }
    if (compareMode === TRENDS_COMPARE_LAST_YEAR) {
      return 'How did we do during this selected time compared with the same dates last year?';
    }
    if (compareMode === TRENDS_COMPARE_AVG_2) {
      return 'How did we do during this selected time compared with the average for these same dates over the previous 2 years?';
    }
    if (compareMode === TRENDS_COMPARE_AVG_3) {
      return 'How did we do during this selected time compared with the average for these same dates over the previous 3 years?';
    }
  }

  return '';
}

function formatTrendsExplainerDates(period, compareMode, currentRange, comparisonRanges) {
  const currentText = formatTrendsExplainerRange(currentRange);

  if (compareMode === TRENDS_COMPARE_AVG_2 || compareMode === TRENDS_COMPARE_AVG_3) {
    if (period === 'last-fy') {
      const labels = comparisonRanges.map((range) => getTrendsFiscalYearShortLabel(range));
      return `Current: ${currentText}\nBaseline: Average of ${formatTrendsYearList(labels)}`;
    }

    const years = comparisonRanges.map((range) => {
      if (period === 'this-fy') {
        return String(parseInt(range.start.slice(0, 4), 10) + 1);
      }
      return String(parseLocalIsoDate(range.end).getFullYear());
    });

    if (period === 'this-fy') {
      return `Current: ${currentText}\nBaseline: Same FY-to-date period in ${formatTrendsYearList(years)}`;
    }
    if (period === 'custom') {
      return `Current: ${currentText}\nBaseline: Same dates in ${formatTrendsYearList(years)}`;
    }
    return `Current: ${currentText}\nBaseline: Same period in ${formatTrendsYearList(years)}`;
  }

  const baselineRange = comparisonRanges[0];
  if (!baselineRange) return currentText;
  return `${currentText} vs ${formatTrendsExplainerRange(baselineRange)}`;
}

function renderTrendsComparisonExplainer(period, compareMode, currentRange, comparisonRanges) {
  const textEl = document.getElementById('trends-comparison-explainer-text');
  const datesEl = document.getElementById('trends-comparison-explainer-dates');
  if (!textEl || !datesEl) return;

  if (period === 'custom') {
    const start = document.getElementById('trends-start-date')?.value || '';
    const end = document.getElementById('trends-end-date')?.value || '';
    if (!start || !end) {
      textEl.textContent = 'Choose a Custom Start Date and Custom End Date to define the period.';
      datesEl.hidden = true;
      datesEl.textContent = '';
      return;
    }
    if (start > end) {
      textEl.textContent = 'Custom Start Date must be on or before Custom End Date.';
      datesEl.hidden = true;
      datesEl.textContent = '';
      return;
    }
  }

  textEl.textContent = getTrendsExplainerQuestion(period, compareMode);

  if (compareMode === TRENDS_COMPARE_NONE || !currentRange) {
    datesEl.hidden = true;
    datesEl.textContent = '';
    return;
  }

  const datesText = formatTrendsExplainerDates(
    period,
    compareMode,
    currentRange,
    comparisonRanges
  );
  if (!datesText) {
    datesEl.hidden = true;
    datesEl.textContent = '';
    return;
  }

  datesEl.hidden = false;
  datesEl.textContent = datesText;
}

function renderTrendsKpis(metrics, comparison) {
  const grid = document.getElementById('trends-kpi-grid');
  const cards = [
    { key: 'completedEvents', label: 'Completed Events' },
    { key: 'participantReach', label: 'Participant Reach' },
    { key: 'commandsReached', label: 'Commands Reached' },
    { key: 'totalRecordedEventCost', label: 'Total Recorded Event Cost' },
    { key: 'costPerParticipant', label: 'Cost per Participant' },
  ];

  trendsOutlookKpiSnapshot = cards.map((card) => {
    const comparisonInfo = comparison?.[card.key];
    return {
      key: card.key,
      label: card.label,
      value: formatTrendsKpiValue(card.key, metrics),
      comparisonText: comparisonInfo?.text || '',
      comparisonDirection: comparisonInfo?.direction || 'neutral',
    };
  });

  if (!grid) return;

  grid.innerHTML = cards
    .map((card) => {
      const comparisonInfo = comparison?.[card.key];
      const comparisonHtml = comparisonInfo
        ? `<div class="trends-kpi-comparison trends-kpi-comparison-${comparisonInfo.direction}">${comparisonInfo.text}</div>`
        : '';
      return `
      <div class="kpi-card">
        <div class="kpi-label">${card.label}</div>
        <div class="kpi-value">${formatTrendsKpiValue(card.key, metrics)}</div>
        ${comparisonHtml}
      </div>`;
    })
    .join('');
}

const TRENDS_CHART_METRICS = {
  completedEvents: 'Completed Events',
  participantReach: 'Participant Reach',
};

const TRENDS_OUTLOOK_MAX_PROGRAMS = 4;
const TRENDS_OUTLOOK_MIN_BUCKETS = 4;
const TRENDS_OUTLOOK_MIN_NONEMPTY = 3;
const TRENDS_OUTLOOK_STABLE_RATIO = 0.10;
const TRENDS_OUTLOOK_ALL_COLOR = '#00205b';
const TRENDS_OUTLOOK_COMPARE_COLOR = '#4b5563';
const TRENDS_OUTLOOK_PROJECTION_COLOR = '#6b5ca5';
const TRENDS_OUTLOOK_SCHEDULED_COLOR = '#0f766e';
const TRENDS_OUTLOOK_PROGRAM_COLORS = ['#2f6f4e', '#1d4ed8', '#a16207', '#0f766e'];

let trendsChartDrawState = null;
let trendsOutlookKpiSnapshot = null;
let trendsOutlookReportSnapshot = null;
let trendsDemandReportSnapshot = null;
let trendsReachReportSnapshot = null;
let trendsResourceReportSnapshot = null;
let trendsExplorerReportSnapshot = null;
let trendsOutlookSelectedKeys = [];
let trendsOutlookMultiCompareEnabled = false;
let trendsOutlookPrevProgramCount = 0;

function getTrendsChartMetricKey() {
  const value = document.getElementById('trends-chart-metric')?.value;
  return TRENDS_CHART_METRICS[value] ? value : 'participantReach';
}

function getTrendsChartMetricLabel(metricKey = getTrendsChartMetricKey()) {
  return TRENDS_CHART_METRICS[metricKey] || TRENDS_CHART_METRICS.participantReach;
}

function isTrendsChartProjectionEnabled() {
  return Boolean(document.getElementById('trends-chart-show-projection')?.checked);
}

function updateTrendsChartHorizonVisibility(enabled) {
  const field = document.getElementById('trends-chart-horizon-field');
  const select = document.getElementById('trends-chart-projection-horizon');
  if (field) field.hidden = !enabled;
  if (select) select.disabled = !enabled;
}

function getTrendsChartBucketSize(period, range) {
  if (period === '3m') return 'week';
  if (period === '6m' || period === '12m' || period === 'this-fy' || period === 'last-fy') {
    return 'month';
  }
  if (period === 'custom' && range) {
    const days = inclusiveDayCount(range.start, range.end);
    if (days <= 90) return 'week';
    if (days <= 730) return 'month';
    return 'quarter';
  }
  return 'month';
}

function getTrendsWeekStartMonday(isoDate) {
  const date = parseLocalIsoDate(isoDate);
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - offset);
  return formatLocalIsoDate(date);
}

function getTrendsQuarterStart(isoDate) {
  const date = parseLocalIsoDate(isoDate);
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return formatLocalIsoDate(new Date(date.getFullYear(), quarterMonth, 1));
}

function addCalendarMonthsToIso(isoDate, months) {
  const date = parseLocalIsoDate(isoDate);
  return formatLocalIsoDate(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

function getTrendsChartBucketKey(isoDate, bucketSize) {
  if (bucketSize === 'week') return getTrendsWeekStartMonday(isoDate);
  if (bucketSize === 'quarter') return getTrendsQuarterStart(isoDate);
  return isoDate.slice(0, 7);
}

function formatTrendsChartWeekLabel(weekStart, includeYear) {
  const date = parseLocalIsoDate(weekStart);
  const month = date.toLocaleString('en-US', { month: 'short' });
  return includeYear
    ? `${month} ${date.getDate()}, ${date.getFullYear()}`
    : `${month} ${date.getDate()}`;
}

function formatTrendsChartMonthAxisLabel(monthStart, includeYear) {
  const date = parseLocalIsoDate(monthStart);
  const month = date.toLocaleString('en-US', { month: 'short' });
  return includeYear ? `${month} ${date.getFullYear()}` : month;
}

function formatTrendsChartQuarterLabel(quarterStart) {
  const date = parseLocalIsoDate(quarterStart);
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
}

function generateTrendsChartBuckets(range, bucketSize) {
  if (!range) return [];

  const spansYears = range.start.slice(0, 4) !== range.end.slice(0, 4);
  const buckets = [];

  if (bucketSize === 'week') {
    let cursor = getTrendsWeekStartMonday(range.start);
    while (cursor <= range.end) {
      buckets.push({
        key: cursor,
        start: cursor,
        axisLabel: formatTrendsChartWeekLabel(cursor, spansYears),
        tooltipLabel: `Week of ${formatTrendsChartWeekLabel(cursor, spansYears)}`,
        events: [],
      });
      cursor = addDaysToIsoDate(cursor, 7);
    }
    return buckets;
  }

  if (bucketSize === 'quarter') {
    let cursor = getTrendsQuarterStart(range.start);
    const endKey = getTrendsQuarterStart(range.end);
    while (cursor <= endKey) {
      buckets.push({
        key: cursor,
        start: cursor,
        axisLabel: formatTrendsChartQuarterLabel(cursor),
        tooltipLabel: formatTrendsChartQuarterLabel(cursor),
        events: [],
      });
      cursor = addCalendarMonthsToIso(cursor, 3);
    }
    return buckets;
  }

  let cursor = `${range.start.slice(0, 7)}-01`;
  const endMonth = range.end.slice(0, 7);
  let previousYear = '';
  while (cursor.slice(0, 7) <= endMonth) {
    const year = cursor.slice(0, 4);
    const showYear = spansYears && (previousYear === '' || year !== previousYear);
    buckets.push({
      key: cursor.slice(0, 7),
      start: cursor,
      axisLabel: formatTrendsChartMonthAxisLabel(cursor, showYear),
      tooltipLabel: formatTrendsChartMonthAxisLabel(cursor, true),
      events: [],
    });
    previousYear = year;
    cursor = addCalendarMonthsToIso(cursor, 1);
  }
  return buckets;
}

function aggregateTrendsChartBuckets(buckets, eventsForRange, bucketSize) {
  const byKey = new Map(buckets.map((bucket) => [bucket.key, { ...bucket, events: [] }]));

  eventsForRange.forEach((event) => {
    const isoDate = getTrendsEventDate(event);
    if (!isoDate) return;
    const bucket = byKey.get(getTrendsChartBucketKey(isoDate, bucketSize));
    if (bucket) bucket.events.push(event);
  });

  return [...byKey.values()].map((bucket) => ({
    key: bucket.key,
    start: bucket.start,
    axisLabel: bucket.axisLabel,
    tooltipLabel: bucket.tooltipLabel,
    metrics: calculateTrendsMetrics(bucket.events),
  }));
}

function getTrendsChartUnclippedBucketRange(bucket, bucketSize) {
  if (bucketSize === 'week') {
    return {
      start: bucket.start,
      end: addDaysToIsoDate(bucket.start, 6),
    };
  }
  if (bucketSize === 'quarter') {
    const start = bucket.start;
    return {
      start,
      end: addDaysToIsoDate(addCalendarMonthsToIso(start, 3), -1),
    };
  }
  const start = `${bucket.start.slice(0, 7)}-01`;
  return {
    start,
    end: addDaysToIsoDate(addCalendarMonthsToIso(start, 1), -1),
  };
}

function clipTrendsChartInterval(interval, range) {
  if (!interval || !range) return null;
  const start = interval.start < range.start ? range.start : interval.start;
  const end = interval.end > range.end ? range.end : interval.end;
  if (start > end) return null;
  return { start, end };
}

function getTrendsChartEffectiveBucketRange(bucket, currentRange, bucketSize) {
  return clipTrendsChartInterval(
    getTrendsChartUnclippedBucketRange(bucket, bucketSize),
    currentRange
  );
}

function shiftTrendsChartIntervalByDays(interval, days) {
  return {
    start: addDaysToIsoDate(interval.start, days),
    end: addDaysToIsoDate(interval.end, days),
  };
}

function getTrendsChartHistoricalIntervals(effectiveInterval, period, compareMode, currentRange) {
  if (!effectiveInterval || compareMode === TRENDS_COMPARE_NONE) return [];

  if (compareMode === TRENDS_COMPARE_PREVIOUS) {
    if (period === 'this-fy' || period === 'last-fy') {
      return [shiftTrendsRangeByYears(effectiveInterval, -1)];
    }
    const days = inclusiveDayCount(currentRange.start, currentRange.end);
    return [shiftTrendsChartIntervalByDays(effectiveInterval, -days)];
  }

  if (compareMode === TRENDS_COMPARE_LAST_YEAR) {
    return [shiftTrendsRangeByYears(effectiveInterval, -1)];
  }

  if (compareMode === TRENDS_COMPARE_AVG_2) {
    return [
      shiftTrendsRangeByYears(effectiveInterval, -1),
      shiftTrendsRangeByYears(effectiveInterval, -2),
    ];
  }

  if (compareMode === TRENDS_COMPARE_AVG_3) {
    return [
      shiftTrendsRangeByYears(effectiveInterval, -1),
      shiftTrendsRangeByYears(effectiveInterval, -2),
      shiftTrendsRangeByYears(effectiveInterval, -3),
    ];
  }

  return [];
}

function formatTrendsChartHistoricalLabel(interval, bucketSize) {
  if (!interval) return '';
  if (bucketSize === 'week') {
    return `Week of ${formatTrendsChartWeekLabel(interval.start, true)}`;
  }
  if (bucketSize === 'quarter') {
    return formatTrendsChartQuarterLabel(interval.start);
  }
  return formatTrendsChartMonthAxisLabel(interval.start, true);
}

function formatTrendsChartAverageLabel(bucket, bucketSize) {
  if (bucketSize === 'week') {
    return `Week of ${formatTrendsChartWeekLabel(bucket.start, false)} equivalent`;
  }
  if (bucketSize === 'quarter') {
    const date = parseLocalIsoDate(bucket.start);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} equivalent`;
  }
  const date = parseLocalIsoDate(bucket.start);
  return `${date.toLocaleString('en-US', { month: 'short' })} equivalent`;
}

function buildTrendsChartComparisonSeries(currentBuckets, currentRange, period, compareMode, filters, bucketSize, metricKey, seriesLabel) {
  if (compareMode === TRENDS_COMPARE_NONE) return [];

  const compareLabel = seriesLabel || getTrendsComparisonPhrase(compareMode);
  const isAverage = compareMode === TRENDS_COMPARE_AVG_2 || compareMode === TRENDS_COMPARE_AVG_3;
  const periodCount = compareMode === TRENDS_COMPARE_AVG_3 ? 3 : compareMode === TRENDS_COMPARE_AVG_2 ? 2 : 1;

  return currentBuckets.map((bucket) => {
    const effective = getTrendsChartEffectiveBucketRange(bucket, currentRange, bucketSize);
    const historicalIntervals = getTrendsChartHistoricalIntervals(
      effective,
      period,
      compareMode,
      currentRange
    );
    const metricsList = historicalIntervals.map((interval) => (
      calculateTrendsMetrics(getTrendsEventsForRange(interval, filters))
    ));
    const metrics = metricsList.length === 1
      ? metricsList[0]
      : averageTrendsMetrics(metricsList);
    const value = getTrendsChartSeriesValue(metrics, metricKey);
    const primaryInterval = historicalIntervals[0];

    return {
      axisLabel: bucket.axisLabel,
      tooltipLabel: isAverage
        ? formatTrendsChartAverageLabel(bucket, bucketSize)
        : formatTrendsChartHistoricalLabel(primaryInterval, bucketSize),
      seriesLabel: compareLabel,
      extraLabel: isAverage ? `Average of ${periodCount} historical periods` : '',
      value,
      formattedValue: formatTrendsChartValue(metricKey, value),
    };
  });
}

function getTrendsChartSeriesValue(metrics, metricKey) {
  return Number(metrics[metricKey]) || 0;
}

function formatTrendsChartValue(metricKey, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

function formatTrendsChartAxisValue(metricKey, value) {
  if (!Number.isFinite(value)) return '';
  if (value >= 1000) {
    const thousands = value / 1000;
    const compact = thousands >= 10 || Number.isInteger(thousands)
      ? String(Math.round(thousands))
      : thousands.toFixed(1).replace(/\.0$/, '');
    return `${compact}k`;
  }
  return String(Math.round(value));
}

function getTrendsChartScale(values) {
  const numeric = values.filter((value) => value != null && Number.isFinite(value));
  const maxValue = numeric.length > 0 ? Math.max(0, ...numeric) : 0;
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 4, ticks: [0, 1, 2, 3, 4] };
  }

  const exponent = Math.floor(Math.log10(maxValue));
  const magnitude = 10 ** exponent;
  const fraction = maxValue / magnitude;
  let niceFraction = 10;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;

  const niceMax = niceFraction * magnitude;
  const tickCount = 4;
  const ticks = [];
  for (let i = 0; i <= tickCount; i += 1) {
    ticks.push((niceMax * i) / tickCount);
  }
  return { max: niceMax, ticks };
}

function getVisibleTrendsChartLabelIndexes(count, maxLabels) {
  if (count <= maxLabels) {
    return [...Array(count).keys()];
  }
  const step = Math.ceil(count / maxLabels);
  const indexes = [];
  for (let i = 0; i < count; i += step) indexes.push(i);
  if (indexes[indexes.length - 1] !== count - 1) indexes.push(count - 1);
  return indexes;
}

function hideTrendsChartTooltip() {
  const tooltip = document.getElementById('trends-chart-tooltip');
  if (tooltip) {
    tooltip.hidden = true;
    tooltip.textContent = '';
    tooltip.classList.remove('trends-chart-tooltip-driver');
  }
}

function formatTrendsDriverUnitValue(metricKey, value) {
  const count = Math.round(Number(value) || 0);
  if (metricKey === 'completedEvents') {
    return `${count} event${count === 1 ? '' : 's'}`;
  }
  return `${count.toLocaleString('en-US')} participant${count === 1 ? '' : 's'}`;
}

function collectTrendsDriverEvents(interval, context) {
  if (!interval || !context) return [];
  return collectTrendsDriverEventsForInterval(interval, {
    filters: context.filters,
    programKeys: context.programKeys,
    getEventsForRange: getTrendsEventsForRange,
    filterByProgramKeys: filterTrendsEventsByProgramKeys,
  });
}

function loadTrendsHistoricalAnalysisBucketEvents(index, context) {
  if (!context?.enabled || !context.buckets?.[index]) {
    return { currentEvents: [], compareEvents: [] };
  }
  const bucket = context.buckets[index];
  const effective = getTrendsChartEffectiveBucketRange(bucket, context.currentRange, context.bucketSize);
  const historicalIntervals = getTrendsChartHistoricalIntervals(
    effective,
    context.period,
    context.compareMode,
    context.currentRange
  );
  const compareInterval = historicalIntervals[0];
  return {
    currentEvents: collectTrendsDriverEvents(effective, context),
    compareEvents: collectTrendsDriverEvents(compareInterval, context),
  };
}

function buildTrendsHistoricalAnalysisRows(driverContext, seriesList, selectionMode, compareMode, metricKey) {
  const mode = resolveTrendsHistoricalAnalysisMode(compareMode, selectionMode, seriesList);
  return assembleTrendsHistoricalAnalysisRows({
    compareMode,
    metricKey,
    selectionMode,
    seriesList,
    loadBucketEvents: mode === 'drivers'
      ? (index) => loadTrendsHistoricalAnalysisBucketEvents(index, driverContext)
      : undefined,
    getParticipantCount: getTrendsParticipantCount,
  });
}

function getTrendsHistoricalAnalysisForExport(snapshot) {
  const selection = getTrendsOutlookSelection();
  const seriesList = snapshot?.chart?.seriesList || trendsChartDrawState?.seriesList || [];
  const compareMode = snapshot?.context?.compareMode || getTrendsOutlookCompareMode(selection);
  const selectionMode = snapshot?.context?.selectionMode || selection.mode;
  const metricKey = snapshot?.chart?.metricKey || getTrendsChartMetricKey();
  return buildTrendsHistoricalAnalysisRows(
    trendsChartDrawState?.driverContext,
    seriesList,
    selectionMode,
    compareMode,
    metricKey
  );
}

function buildTrendsChartDriverContext({
  selection,
  compareMode,
  metricKey,
  currentRange,
  period,
  bucketSize,
  currentBuckets,
}) {
  const supported = Boolean(
    selection?.mode !== 'multi'
    && isTrendsDriverCompareMode(compareMode)
    && (metricKey === 'completedEvents' || metricKey === 'participantReach')
    && currentRange
    && currentBuckets?.length
  );
  if (!supported) return { enabled: false };

  const program = selection.mode === 'single' ? selection.programs[0] : null;
  return {
    enabled: true,
    metricKey,
    compareMode,
    comparePhrase: getTrendsDriverComparePhrase(compareMode),
    currentRange,
    period,
    bucketSize,
    buckets: currentBuckets,
    bucketCount: currentBuckets.length,
    filters: program ? { ...getTrendsOutlookBaseFilters() } : { ...getTrendsFilterState() },
    programKeys: program ? [program.key] : [],
  };
}

function getTrendsDifferenceDriverTooltipModel(point, meta, state) {
  const context = state?.driverContext;
  if (!context?.enabled) return null;

  const seriesKind = meta?.seriesKind || point?.kind;
  if (seriesKind !== 'actual' && seriesKind !== 'compare') return null;

  const bucketIndex = Number(meta?.bucketIndex);
  if (!Number.isInteger(bucketIndex) || bucketIndex < 0 || bucketIndex >= context.bucketCount) {
    return null;
  }

  const actualSeries = (state.seriesList || []).find((entry) => entry.kind === 'actual');
  const compareSeries = (state.seriesList || []).find((entry) => entry.kind === 'compare');
  const currentPoint = actualSeries?.points?.[bucketIndex];
  const comparePoint = compareSeries?.points?.[bucketIndex];
  if (!currentPoint || !comparePoint) return null;

  const bucket = context.buckets[bucketIndex];
  const effective = getTrendsChartEffectiveBucketRange(bucket, context.currentRange, context.bucketSize);
  const historicalIntervals = getTrendsChartHistoricalIntervals(
    effective,
    context.period,
    context.compareMode,
    context.currentRange
  );
  const compareInterval = historicalIntervals[0];
  if (!effective || !compareInterval) return null;

  const currentValue = Number(currentPoint.value) || 0;
  const compareValue = Number(comparePoint.value) || 0;
  const explanation = Math.abs(currentValue - compareValue) < 1
    ? null
    : buildTrendsDifferenceExplanation({
      metricKey: context.metricKey,
      compareMode: context.compareMode,
      currentEvents: collectTrendsDriverEvents(effective, context),
      compareEvents: collectTrendsDriverEvents(compareInterval, context),
      getParticipantCount: getTrendsParticipantCount,
    });

  return {
    heading: currentPoint.tooltipLabel || point?.tooltipLabel || '',
    currentValue,
    compareValue,
    comparePhrase: context.comparePhrase,
    compareLabel: comparePoint.tooltipLabel || '',
    metricKey: context.metricKey,
    explanation: explanation?.sentence || '',
  };
}

function showTrendsChartTooltip(anchor, point, metricLabel, meta = {}) {
  const tooltip = document.getElementById('trends-chart-tooltip');
  const body = document.querySelector('#view-trends .trends-chart-body');
  if (!tooltip || !body) return;

  tooltip.hidden = false;
  tooltip.textContent = '';
  tooltip.classList.remove('trends-chart-tooltip-driver');

  const driverModel = getTrendsDifferenceDriverTooltipModel(point, meta, trendsChartDrawState);
  if (driverModel) {
    tooltip.classList.add('trends-chart-tooltip-driver');
    const heading = document.createElement('div');
    heading.className = 'trends-chart-tooltip-heading';
    heading.textContent = driverModel.heading;

    const currentLine = document.createElement('div');
    currentLine.textContent = `Current Period: ${formatTrendsDriverUnitValue(driverModel.metricKey, driverModel.currentValue)}`;

    const compareLine = document.createElement('div');
    const compareSuffix = driverModel.compareLabel ? ` (${driverModel.compareLabel})` : '';
    compareLine.textContent = `${driverModel.comparePhrase}${compareSuffix}: ${formatTrendsDriverUnitValue(driverModel.metricKey, driverModel.compareValue)}`;
    tooltip.append(heading, currentLine, compareLine);

    if (driverModel.explanation) {
      const divider = document.createElement('div');
      divider.className = 'trends-chart-tooltip-driver-block';
      const why = document.createElement('div');
      why.className = 'trends-chart-tooltip-driver-label';
      why.textContent = 'Why the difference?';
      const sentence = document.createElement('div');
      sentence.className = 'trends-chart-tooltip-driver-text';
      sentence.textContent = driverModel.explanation;
      divider.append(why, sentence);
      tooltip.append(divider);
    }
  } else {
    const labelLine = document.createElement('div');
    labelLine.textContent = point.tooltipLabel;
    const valueLine = document.createElement('div');
    valueLine.textContent = `${metricLabel}: ${point.formattedValue}`;
    tooltip.append(labelLine, valueLine);
    if (point.seriesLabel) {
      const seriesLine = document.createElement('div');
      seriesLine.textContent = point.seriesLabel;
      tooltip.append(seriesLine);
    }
    if (point.extraLabel) {
      const extraLine = document.createElement('div');
      extraLine.textContent = point.extraLabel;
      tooltip.append(extraLine);
    }
  }

  const bodyRect = body.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = anchorRect.left - bodyRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
  let top = anchorRect.top - bodyRect.top - tooltipRect.height - 10;
  left = Math.max(8, Math.min(left, bodyRect.width - tooltipRect.width - 8));
  if (top < 4) {
    top = anchorRect.bottom - bodyRect.top + 10;
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function getTrendsOutlookProgramOptions() {
  const map = new Map();
  (eventTypes || []).forEach((name) => {
    const { key, label } = normalizeTrendsDemandEventType({ eventType: name });
    map.set(key, label);
  });
  (events || []).forEach((event) => {
    if (!isAarFinalized(event)) return;
    const { key, label } = normalizeTrendsDemandEventType(event);
    if (!map.has(key)) map.set(key, label);
  });
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => compareEventTypeSeriesOrder(a.label, b.label));
}

function getTrendsOutlookSelection() {
  if (!trendsOutlookSelectedKeys.length) {
    return { mode: 'all', keys: [], programs: [] };
  }
  const options = getTrendsOutlookProgramOptions();
  const byKey = new Map(options.map((entry) => [entry.key, entry]));
  const programs = trendsOutlookSelectedKeys
    .map((key) => byKey.get(key))
    .filter(Boolean);
  if (!programs.length) {
    trendsOutlookSelectedKeys = [];
    return { mode: 'all', keys: [], programs: [] };
  }
  return {
    mode: programs.length === 1 ? 'single' : 'multi',
    keys: programs.map((entry) => entry.key),
    programs,
  };
}

function getTrendsOutlookProgramColor(index) {
  return TRENDS_OUTLOOK_PROGRAM_COLORS[index % TRENDS_OUTLOOK_PROGRAM_COLORS.length];
}

function lightenTrendsOutlookColor(hex, amount = 0.45) {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) return TRENDS_OUTLOOK_COMPARE_COLOR;
  const nums = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  const mixed = nums.map((value) => Math.round(value + (255 - value) * amount));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function filterTrendsEventsByProgramKeys(eventList, programKeys) {
  if (!programKeys?.length) return eventList;
  const allowed = new Set(programKeys);
  return eventList.filter((event) => allowed.has(normalizeTrendsDemandEventType(event).key));
}

function getTrendsOutlookBaseFilters() {
  return {
    eventType: '',
    command: getTrendsFilterState().command || '',
  };
}

function updateTrendsOutlookProgramToggleLabel() {
  const toggle = document.getElementById('trends-chart-program-toggle');
  if (!toggle) return;
  const selection = getTrendsOutlookSelection();
  if (selection.mode === 'all') {
    toggle.textContent = 'All Programs';
  } else if (selection.programs.length === 1) {
    toggle.textContent = selection.programs[0].label;
  } else {
    toggle.textContent = `${selection.programs.length} Programs Selected`;
  }
}

function setTrendsOutlookProgramLimitVisible(visible) {
  const limit = document.getElementById('trends-chart-program-limit');
  if (limit) limit.hidden = !visible;
}

function syncTrendsOutlookProgramInputs() {
  const allInput = document.getElementById('trends-chart-program-all');
  const list = document.getElementById('trends-chart-program-list');
  const selection = getTrendsOutlookSelection();
  if (allInput) allInput.checked = selection.mode === 'all';
  if (!list) return;
  list.querySelectorAll('input[data-outlook-program]').forEach((input) => {
    input.checked = selection.keys.includes(input.dataset.outlookProgram);
  });
  updateTrendsOutlookProgramToggleLabel();
}

function populateTrendsOutlookProgramMenu() {
  const list = document.getElementById('trends-chart-program-list');
  if (!list) return;
  const options = getTrendsOutlookProgramOptions();
  const valid = new Set(options.map((entry) => entry.key));
  trendsOutlookSelectedKeys = trendsOutlookSelectedKeys.filter((key) => valid.has(key));
  const existingKeys = [...list.querySelectorAll('input[data-outlook-program]')]
    .map((input) => input.dataset.outlookProgram);
  const nextKeys = options.map((option) => option.key);
  const sameOptions = existingKeys.length === nextKeys.length
    && nextKeys.every((key, index) => existingKeys[index] === key);
  if (!sameOptions) {
    list.replaceChildren();
    options.forEach((option) => {
      const label = document.createElement('label');
      label.className = 'trends-chart-program-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.outlookProgram = option.key;
      const text = document.createElement('span');
      text.textContent = option.label;
      label.append(input, text);
      list.append(label);
    });
  }
  syncTrendsOutlookProgramInputs();
}

function setTrendsOutlookProgramMenuOpen(open) {
  const menu = document.getElementById('trends-chart-program-menu');
  const toggle = document.getElementById('trends-chart-program-toggle');
  if (menu) menu.hidden = !open;
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function handleTrendsOutlookProgramChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.id === 'trends-chart-program-all') {
    if (target.checked) {
      trendsOutlookSelectedKeys = [];
      setTrendsOutlookProgramLimitVisible(false);
    } else if (!trendsOutlookSelectedKeys.length) {
      target.checked = true;
    }
    syncTrendsOutlookProgramInputs();
    renderTrendsChartSection(
      getTrendsCurrentRange(),
      getTrendsEventsForRange(getTrendsCurrentRange(), getTrendsFilterState()),
      getTrendsPeriodValue()
    );
    return;
  }

  const key = target.dataset.outlookProgram;
  if (!key) return;

  if (target.checked) {
    if (trendsOutlookSelectedKeys.length >= TRENDS_OUTLOOK_MAX_PROGRAMS) {
      target.checked = false;
      setTrendsOutlookProgramLimitVisible(true);
      syncTrendsOutlookProgramInputs();
      return;
    }
    setTrendsOutlookProgramLimitVisible(false);
    if (!trendsOutlookSelectedKeys.includes(key)) {
      trendsOutlookSelectedKeys = [...trendsOutlookSelectedKeys, key];
    }
  } else {
    trendsOutlookSelectedKeys = trendsOutlookSelectedKeys.filter((entry) => entry !== key);
    setTrendsOutlookProgramLimitVisible(false);
  }

  syncTrendsOutlookProgramInputs();
  renderTrendsChartSection(
    getTrendsCurrentRange(),
    getTrendsEventsForRange(getTrendsCurrentRange(), getTrendsFilterState()),
    getTrendsPeriodValue()
  );
}

function setupTrendsOutlookProgramControl() {
  const toggle = document.getElementById('trends-chart-program-toggle');
  const menu = document.getElementById('trends-chart-program-menu');
  if (!toggle || !menu || toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setTrendsOutlookProgramMenuOpen(menu.hidden);
  });
  menu.addEventListener('click', (event) => event.stopPropagation());
  menu.addEventListener('change', handleTrendsOutlookProgramChange);
  document.addEventListener('click', () => setTrendsOutlookProgramMenuOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setTrendsOutlookProgramMenuOpen(false);
  });
}

function getTrendsOutlookCompareMode(selection) {
  const globalMode = getTrendsCompareMode();
  if (selection.mode !== 'multi') {
    trendsOutlookMultiCompareEnabled = false;
    return globalMode;
  }
  if (trendsOutlookPrevProgramCount < 2 && selection.keys.length >= 2) {
    trendsOutlookMultiCompareEnabled = false;
  }
  if (!trendsOutlookMultiCompareEnabled) return TRENDS_COMPARE_NONE;
  return globalMode;
}

function fitTrendsOutlookLinearTrend(values) {
  const points = values
    .map((value, index) => ({ x: index, y: Number(value) }))
    .filter((point) => Number.isFinite(point.y));
  const nonEmpty = points.filter((point) => point.y > 0);
  if (
    points.length < TRENDS_OUTLOOK_MIN_BUCKETS
    || nonEmpty.length < TRENDS_OUTLOOK_MIN_NONEMPTY
  ) {
    return {
      ok: false,
      slope: 0,
      intercept: 0,
      direction: 'insufficient',
      mean: 0,
    };
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  points.forEach((point) => {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  });
  const denominator = (n * sumXX) - (sumX * sumX);
  const slope = denominator === 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denominator;
  const intercept = (sumY - (slope * sumX)) / n;
  const mean = sumY / n;
  const relativeSpan = Math.abs(slope * (n - 1)) / Math.max(Math.abs(mean), 1);
  let direction = 'stable';
  if (relativeSpan >= TRENDS_OUTLOOK_STABLE_RATIO) {
    direction = slope > 0 ? 'increasing' : 'decreasing';
  }

  return {
    ok: true,
    slope: Number.isFinite(slope) ? slope : 0,
    intercept: Number.isFinite(intercept) ? intercept : 0,
    direction,
    mean: Number.isFinite(mean) ? mean : 0,
    relativeSpan,
    pointCount: n,
    nonEmptyCount: nonEmpty.length,
  };
}

function classifyTrendsOutlookDirectionLabel(direction) {
  if (direction === 'increasing') return 'Increasing';
  if (direction === 'decreasing') return 'Decreasing';
  if (direction === 'stable') return 'Relatively Stable';
  return 'Insufficient History';
}

function getTrendsOutlookDirectionSentence(direction, metricLabel, options = {}) {
  if (direction === 'increasing') {
    return `Recent ${metricLabel.toLowerCase()} shows an upward trend. The projection extends that observed direction forward.`;
  }
  if (direction === 'decreasing') {
    return `Recent ${metricLabel.toLowerCase()} shows a downward trend. The projection extends that observed direction forward.`;
  }
  if (direction === 'stable') {
    return 'Recent activity has varied but does not show a strong sustained upward or downward trend.';
  }
  if (options.scheduledOnly) {
    return 'Not enough historical activity to estimate a directional trend. The outlook shown is based on events already scheduled.';
  }
  return 'Not enough historical activity to estimate an outlook for this selection.';
}

function getTrendsOutlookScheduledFloorMethodLines(metricKey) {
  const lines = [
    'Outlook combines recent historical trends with events already scheduled. Scheduled activity acts as a minimum and is not added twice.',
  ];
  if (metricKey === 'participantReach') {
    lines.push('Scheduled participant reach uses only Expected Participant counts already entered on events.');
  }
  return lines;
}

function getTrendsOutlookMethodLines(windows, {
  metricKey,
  scheduledOnly = false,
  includeScheduledFloor = false,
} = {}) {
  const lines = [];
  if (scheduledOnly) {
    lines.push('Not enough historical activity to estimate a directional trend. The outlook shown is based on events already scheduled.');
    if (metricKey === 'participantReach') {
      lines.push('Scheduled participant reach uses only Expected Participant counts already entered on events.');
    }
  } else if (includeScheduledFloor) {
    lines.push(...getTrendsOutlookScheduledFloorMethodLines(metricKey));
  } else {
    lines.push('Outlook extends the recent directional trend from finalized CREDO activity over the previous 12 months.');
  }
  if (windows) {
    lines.push(`Trend basis: ${formatTrendsProjectionRange(windows.basis)}`);
    lines.push(`Projection: ${formatTrendsProjectionRange(windows.projection)}`);
  }
  return lines;
}

function roundTrendsOutlookValue(metricKey, value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function buildTrendsOutlookActualSeries(buckets, metricKey, seriesLabel) {
  return buckets.map((bucket) => {
    const value = getTrendsChartSeriesValue(bucket.metrics, metricKey);
    return {
      axisLabel: bucket.axisLabel,
      tooltipLabel: bucket.tooltipLabel,
      seriesLabel,
      extraLabel: '',
      value,
      formattedValue: formatTrendsChartValue(metricKey, value),
    };
  });
}

function buildTrendsOutlookDirectionalProjection({
  currentBuckets,
  actualSeries,
  metricKey,
  programKeys,
  bucketSize,
  seriesLabel,
  color,
  filters = null,
}) {
  const months = getTrendsProjectionHorizonMonths();
  const windows = getTrendsProjectionWindows(new Date(), months);
  const queryFilters = filters || getTrendsOutlookBaseFilters();
  const basisEvents = filterTrendsEventsByProgramKeys(
    getTrendsEventsForRange(windows.basis, queryFilters),
    programKeys
  );
  const scheduledEvents = filterTrendsEventsByProgramKeys(
    getTrendsScheduledEventsForRange(windows.projection, queryFilters),
    programKeys
  );
  const projectionLabel = seriesLabel
    ? `${seriesLabel} · ${getTrendsOutlookProjectionHorizonLabel(months)}`
    : getTrendsOutlookProjectionHorizonLabel(months);

  const insufficientError = programKeys?.length
    ? 'Not enough historical activity to estimate an outlook for this program.'
    : (basisEvents.length
      ? 'Not enough historical activity to estimate an outlook.'
      : 'No finalized historical data is available to estimate an outlook.');

  let trend = {
    ok: false,
    slope: 0,
    intercept: 0,
    direction: 'insufficient',
    mean: 0,
  };
  if (basisEvents.length) {
    const basisBuckets = aggregateTrendsChartBuckets(
      generateTrendsChartBuckets(windows.basis, bucketSize),
      basisEvents,
      bucketSize
    );
    const basisValues = basisBuckets.map((bucket) => getTrendsChartSeriesValue(bucket.metrics, metricKey));
    trend = fitTrendsOutlookLinearTrend(basisValues);
  }

  const lastHistoricalKey = currentBuckets[currentBuckets.length - 1]?.key;
  const futureBuckets = generateTrendsChartBuckets(windows.projection, bucketSize)
    .filter((bucket) => !lastHistoricalKey || bucket.key > lastHistoricalKey);
  const lastSeriesPoint = actualSeries[actualSeries.length - 1];
  const lastIndex = actualSeries.length - 1;

  const scheduledByBucket = new Map(futureBuckets.map((bucket) => [bucket.key, []]));
  scheduledEvents.forEach((event) => {
    const isoDate = getTrendsEventDate(event);
    if (!isoDate) return;
    const bucketKey = getTrendsChartBucketKey(isoDate, bucketSize);
    if (!scheduledByBucket.has(bucketKey)) return;
    scheduledByBucket.get(bucketKey).push(event);
  });
  const hasScheduled = [...scheduledByBucket.values()].some((list) => list.length > 0);
  const scheduledOnly = !trend.ok && hasScheduled;

  if (!trend.ok && !hasScheduled) {
    return {
      months,
      windows,
      projectionLabel,
      projectionSeries: null,
      scheduledSeries: [],
      futureAxisLabels: [],
      boundaryIndex: null,
      projectedTotal: null,
      direction: 'insufficient',
      scheduledOnly: false,
      trend,
      error: insufficientError,
      color,
    };
  }

  const projectionSeries = [];
  const scheduledSeries = [];
  const futureAxisLabels = [];

  if (lastSeriesPoint && lastSeriesPoint.value != null && Number.isFinite(lastSeriesPoint.value)) {
    projectionSeries.push({
      ...lastSeriesPoint,
      index: lastIndex,
      seriesLabel: projectionLabel,
      extraLabel: lastSeriesPoint.extraLabel || '',
      isAnchor: true,
    });
  }

  let nextIndex = lastIndex + 1;
  let projectedTotal = 0;
  futureBuckets.forEach((bucket, offset) => {
    const bucketEvents = scheduledByBucket.get(bucket.key) || [];
    const scheduledFloor = getTrendsScheduledFloorForEvents(bucketEvents, metricKey);
    const rawForecast = Number(lastSeriesPoint?.value || 0) + (trend.slope * (offset + 1));
    const historicalForecast = trend.ok ? roundTrendsOutlookValue(metricKey, rawForecast) : 0;
    const value = roundTrendsOutlookValue(
      metricKey,
      resolveOutlookBucketValue({
        trendOk: trend.ok,
        historicalForecast,
        scheduledFloor,
      })
    );
    projectedTotal += value;
    futureAxisLabels.push(bucket.axisLabel);

    const extraLabel = scheduledFloor > 0
      ? `Scheduled: ${formatTrendsChartValue(metricKey, scheduledFloor)}`
      : (scheduledOnly
        ? 'Outlook based on currently scheduled activity'
        : 'Directional outlook from recent finalized history');

    projectionSeries.push({
      index: nextIndex,
      axisLabel: bucket.axisLabel,
      tooltipLabel: bucket.tooltipLabel,
      seriesLabel: projectionLabel,
      extraLabel,
      value,
      formattedValue: formatTrendsChartValue(metricKey, value),
      isAnchor: false,
    });

    if (scheduledFloor > 0) {
      scheduledSeries.push({
        index: nextIndex,
        axisLabel: bucket.axisLabel,
        tooltipLabel: bucket.tooltipLabel,
        seriesLabel: 'Scheduled',
        extraLabel: `Scheduled: ${formatTrendsChartValue(metricKey, scheduledFloor)}`,
        value: scheduledFloor,
        formattedValue: formatTrendsChartValue(metricKey, scheduledFloor),
        isAnchor: false,
      });
    }
    nextIndex += 1;
  });

  if (projectionSeries.length < 2) {
    return {
      months,
      windows,
      projectionLabel,
      projectionSeries: null,
      scheduledSeries: [],
      futureAxisLabels: [],
      boundaryIndex: null,
      projectedTotal: null,
      direction: trend.ok ? trend.direction : 'insufficient',
      scheduledOnly: false,
      trend,
      error: 'Not enough future time buckets are available to draw this projection.',
      color,
    };
  }

  return {
    months,
    windows,
    projectionLabel,
    projectionSeries,
    scheduledSeries,
    futureAxisLabels,
    boundaryIndex: lastIndex,
    projectedTotal,
    direction: trend.ok ? trend.direction : 'insufficient',
    scheduledOnly,
    trend,
    error: '',
    color,
  };
}

function getTrendsOutlookProjectionHorizonLabel(months) {
  if (months === 6) return 'Projected Next 6 Months';
  if (months === 12) return 'Projected Next 12 Months';
  return 'Projected Next 3 Months';
}

function getTrendsPeriodOptionLabel() {
  const select = document.getElementById('trends-period');
  return select?.options[select.selectedIndex]?.text || 'Selected period';
}

function getTrendsReportBaseMeta() {
  const periodLabel = getTrendsPeriodOptionLabel();
  const range = getTrendsCurrentRange();
  const rangeText = range ? formatTrendsExplainerRange(range) : '';
  const compareMode = getTrendsCompareMode();
  const comparisonLabel = compareMode === TRENDS_COMPARE_NONE
    ? 'None'
    : (getTrendsComparisonPhrase(compareMode) || 'None');
  return {
    periodLabel: rangeText ? `${periodLabel} (${rangeText})` : periodLabel,
    comparisonLabel,
    compareMode,
    comparePhrase: getTrendsComparisonPhrase(compareMode),
  };
}

function getTrendsMeasureByLabel(selectId) {
  const select = document.getElementById(selectId);
  return select?.options[select.selectedIndex]?.text || 'Participant Reach';
}

function buildTrendsBreakdownReportRows(rows, metricKey, compareMode) {
  const scaleMax = getTrendsBreakdownScaleMax(rows, compareMode);
  return rows.map((row) => {
    const comparison = compareMode === TRENDS_COMPARE_NONE
      ? null
      : buildTrendsMetricComparison(row.currentValue, row.baselineValue, compareMode);
    return {
      key: row.key,
      label: row.label,
      currentValue: row.currentValue,
      baselineValue: row.baselineValue,
      valueText: formatTrendsBreakdownValue(metricKey, row.currentValue),
      comparisonText: comparison?.text || '',
      comparisonDirection: comparison?.direction || 'neutral',
      currentPct: getTrendsBreakdownDotPercent(row.currentValue, scaleMax),
      comparePct: getTrendsBreakdownDotPercent(row.baselineValue, scaleMax),
      showCompare: compareMode !== TRENDS_COMPARE_NONE,
    };
  });
}

function setTrendsSectionExportBusy(button, busy, idleLabel = 'Export') {
  if (!button) return;
  button.disabled = Boolean(busy);
  const label = button.querySelector('span:last-child');
  if (label) label.textContent = busy ? 'Exporting…' : idleLabel;
}

async function runTrendsSectionExport(button, exportFn) {
  setTrendsSectionExportBusy(button, true);
  try {
    await exportFn();
  } catch (error) {
    console.error('Trends section report export failed.', error);
  } finally {
    setTrendsSectionExportBusy(button, false);
  }
}

function getTrendsOutlookProgramsReportLabel(selection = getTrendsOutlookSelection()) {
  if (selection.mode === 'all' || !selection.programs?.length) return 'All Programs';
  return selection.programs.map((program) => program.label).join(', ');
}

function getTrendsOutlookProjectionReportLabel(enabled) {
  if (!enabled) return 'Off';
  const months = getTrendsProjectionHorizonMonths();
  if (months === 6) return 'Next 6 Months';
  if (months === 12) return 'Next 12 Months';
  return 'Next 3 Months';
}

function buildTrendsOutlookReportContext(selection = getTrendsOutlookSelection()) {
  const base = getTrendsReportBaseMeta();
  const showProjection = isTrendsChartProjectionEnabled();
  return {
    periodLabel: base.periodLabel,
    comparisonLabel: base.comparisonLabel,
    metricLabel: getTrendsChartMetricLabel(),
    programsLabel: getTrendsOutlookProgramsReportLabel(selection),
    projectionLabel: getTrendsOutlookProjectionReportLabel(showProjection),
    projectionEnabled: showProjection,
  };
}

function createEmptyTrendsHistoricalAnalysis() {
  return {
    mode: 'omit',
    rows: [],
    compareColumnLabel: '',
    subtitleCompare: '',
    note: '',
  };
}

function updateTrendsOutlookReportSnapshot(partial = {}) {
  const context = partial.context || buildTrendsOutlookReportContext();
  trendsOutlookReportSnapshot = {
    kpis: trendsOutlookKpiSnapshot || [],
    context,
    chart: partial.chart || null,
    emptyMessage: partial.emptyMessage || '',
    legendItems: partial.legendItems || [],
    legendHint: partial.legendHint || '',
    note: partial.note || '',
    projectionEnabled: Boolean(context.projectionEnabled),
    projectionSummary: partial.projectionSummary || null,
    historicalAnalysis: partial.historicalAnalysis || createEmptyTrendsHistoricalAnalysis(),
  };
}

async function exportTrendsOutlookReport() {
  const button = document.getElementById('trends-outlook-export-btn');
  const snapshot = trendsOutlookReportSnapshot;
  if (!snapshot?.kpis?.length) return;

  const previousLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Exporting…';
  }

  try {
    const generatedAt = new Date();
    const payload = {
      ...structuredClone(snapshot),
      historicalAnalysis: getTrendsHistoricalAnalysisForExport(snapshot),
      generatedAt,
      filename: buildTrendsOutlookPdfFilename(generatedAt),
    };
    await exportTrendsOutlookReportPdf(payload);
  } catch (error) {
    console.error('Trend & Outlook report export failed.', error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousLabel || 'Export Report';
    }
  }
}

async function exportTrendsDemandReport() {
  const snapshot = trendsDemandReportSnapshot;
  if (!snapshot) return;
  const generatedAt = new Date();
  await exportProgramDemandReportPdf({
    ...structuredClone(snapshot),
    generatedAt,
    filename: buildProgramDemandPdfFilename(generatedAt),
  });
}

async function exportTrendsReachReport() {
  const snapshot = trendsReachReportSnapshot;
  if (!snapshot) return;
  const generatedAt = new Date();
  await exportCommandReachReportPdf({
    ...structuredClone(snapshot),
    generatedAt,
    filename: buildCommandReachPdfFilename(generatedAt),
  });
}

async function exportTrendsResourceReport() {
  const snapshot = trendsResourceReportSnapshot;
  if (!snapshot) return;
  const generatedAt = new Date();
  await exportResourceImpactReportPdf({
    ...structuredClone(snapshot),
    generatedAt,
    filename: buildResourceImpactPdfFilename(generatedAt),
  });
}

async function exportTrendsExplorerReport() {
  const snapshot = trendsExplorerReportSnapshot;
  if (!snapshot) return;
  const generatedAt = new Date();
  await exportImpactExplorerReportPdf({
    ...structuredClone(snapshot),
    generatedAt,
    filename: buildImpactExplorerPdfFilename(generatedAt),
  });
}

function formatTrendsOutlookProjectedTotal(metricKey, months, projectedTotal) {
  const horizon = months === 6 ? 'Next 6 Months' : months === 12 ? 'Next 12 Months' : 'Next 3 Months';
  if (metricKey === 'completedEvents') {
    const count = Math.round(projectedTotal || 0);
    const unit = count === 1 ? 'event' : 'events';
    return `Projected Completed Events — ${horizon}: ≈ ${count} ${unit}`;
  }
  const count = Math.round(projectedTotal || 0);
  const unit = count === 1 ? 'participant engagement' : 'participant engagements';
  return `Projected Participant Reach — ${horizon}: ≈ ${count.toLocaleString('en-US')} ${unit}`;
}

function redrawTrendsChartSvg() {
  if (!trendsChartDrawState) return;
  drawTrendsChartSvg(trendsChartDrawState);
}

function drawTrendsChartSvg(state) {
  const wrap = document.getElementById('trends-chart-svg-wrap');
  if (!wrap) return;

  hideTrendsChartTooltip();
  wrap.innerHTML = '';

  const {
    seriesList = [],
    axisLabels,
    boundaryIndex,
    boundaryLabel: boundaryCaption,
    metricKey,
    metricLabel,
  } = state;
  const width = Math.max(wrap.clientWidth || 640, 280);
  const height = wrap.clientWidth && wrap.clientWidth < 640 ? 240 : 280;
  const hasProjection = seriesList.some((entry) => entry.kind === 'projection');
  const pad = {
    top: hasProjection ? 22 : 16,
    right: 12,
    bottom: 36,
    left: width < 480 ? 40 : 52,
  };
  const plotWidth = Math.max(width - pad.left - pad.right, 40);
  const plotHeight = Math.max(height - pad.top - pad.bottom, 80);
  const labels = axisLabels?.length
    ? axisLabels
    : (seriesList[0]?.points || []).map((point) => point.axisLabel);
  const axisCount = Math.max(labels.length, 1);
  const values = seriesList.flatMap((entry) => (entry.points || []).map((point) => point.value));
  const scale = getTrendsChartScale(values);
  const xAt = (index) => (
    axisCount === 1
      ? pad.left + plotWidth / 2
      : pad.left + (index / (axisCount - 1)) * plotWidth
  );
  const yAt = (value) => pad.top + plotHeight - (value / scale.max) * plotHeight;

  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': state.ariaLabel || `${metricLabel} trend and outlook`,
  });

  scale.ticks.forEach((tick) => {
    const y = yAt(tick);
    svg.appendChild(createSvgElement('line', {
      x1: pad.left,
      y1: y,
      x2: pad.left + plotWidth,
      y2: y,
      stroke: '#e5e7eb',
      'stroke-width': 1,
    }));
    const label = createSvgElement('text', {
      x: pad.left - 8,
      y: y + 3,
      'text-anchor': 'end',
      fill: '#9ca3af',
      'font-size': width < 480 ? 10 : 11,
      'font-family': 'inherit',
    });
    label.textContent = formatTrendsChartAxisValue(metricKey, tick);
    svg.appendChild(label);
  });

  svg.appendChild(createSvgElement('line', {
    x1: pad.left,
    y1: pad.top + plotHeight,
    x2: pad.left + plotWidth,
    y2: pad.top + plotHeight,
    stroke: '#d1d5db',
    'stroke-width': 1,
  }));

  if (boundaryIndex != null && Number.isFinite(boundaryIndex) && axisCount > 1) {
    const x = xAt(boundaryIndex);
    svg.appendChild(createSvgElement('line', {
      x1: x,
      y1: pad.top,
      x2: x,
      y2: pad.top + plotHeight,
      stroke: '#9ca3af',
      'stroke-width': 1,
      'stroke-dasharray': '4 3',
    }));
    const boundaryText = createSvgElement('text', {
      x: Math.min(x + 4, pad.left + plotWidth - (width < 480 ? 72 : 96)),
      y: pad.top + 10,
      fill: '#6b7280',
      'font-size': 10,
      'font-family': 'inherit',
      'font-weight': 600,
    });
    boundaryText.textContent = boundaryCaption || 'Today';
    svg.appendChild(boundaryText);
  }

  const maxLabels = width < 640 ? 4 : width < 900 ? 6 : 8;
  const visibleLabels = new Set(getVisibleTrendsChartLabelIndexes(axisCount, maxLabels));
  labels.forEach((axisLabel, index) => {
    if (!visibleLabels.has(index)) return;
    const label = createSvgElement('text', {
      x: xAt(index),
      y: height - 12,
      'text-anchor': 'middle',
      fill: '#9ca3af',
      'font-size': width < 480 ? 10 : 11,
      'font-family': 'inherit',
    });
    label.textContent = axisLabel;
    svg.appendChild(label);
  });

  function appendSeriesPath(points, style, seriesKind) {
    const plotted = points
      .map((point, index) => ({
        point,
        index: point.index != null ? point.index : index,
      }))
      .filter((entry) => entry.point.value != null && Number.isFinite(entry.point.value));

    if (plotted.length > 1 && !style.markersOnly) {
      let segment = [];
      const flushSegment = () => {
        if (segment.length > 1) {
          const lineAttrs = {
            points: segment.map((entry) => `${xAt(entry.index)},${yAt(entry.point.value)}`).join(' '),
            fill: 'none',
            stroke: style.stroke,
            'stroke-width': style.width,
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
          };
          if (style.dash) lineAttrs['stroke-dasharray'] = style.dash;
          svg.appendChild(createSvgElement('polyline', lineAttrs));
        }
        segment = [];
      };

      plotted.forEach((entry, plottedIndex) => {
        const previous = plotted[plottedIndex - 1];
        if (previous && entry.index !== previous.index + 1) flushSegment();
        segment.push(entry);
      });
      flushSegment();
    }

    plotted.forEach((entry) => {
      if (style.skipAnchorMarker && entry.point.isAnchor) return;
      const x = xAt(entry.index);
      const y = yAt(entry.point.value);
      const hit = createSvgElement('circle', {
        class: 'trends-chart-point',
        cx: x,
        cy: y,
        r: 10,
        fill: 'transparent',
        tabindex: '0',
        role: 'img',
        'aria-label': `${entry.point.tooltipLabel}. ${metricLabel}: ${entry.point.formattedValue}. ${entry.point.seriesLabel || 'Current Period'}`,
      });
      const marker = createSvgElement('circle', {
        cx: x,
        cy: y,
        r: style.markerRadius,
        fill: style.markerFill || style.stroke,
        stroke: style.markerStroke || '#ffffff',
        'stroke-width': style.markerStrokeWidth || 1.5,
        'pointer-events': 'none',
      });
      const show = () => showTrendsChartTooltip(hit, entry.point, metricLabel, {
        seriesKind,
        bucketIndex: entry.index,
      });
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', hideTrendsChartTooltip);
      hit.addEventListener('blur', hideTrendsChartTooltip);
      svg.appendChild(hit);
      svg.appendChild(marker);
    });
  }

  seriesList.forEach((entry) => {
    if (!entry.points?.length) return;
    appendSeriesPath(entry.points, entry.style, entry.kind);
  });

  wrap.appendChild(svg);
}

function updateTrendsChartLegend(items, hint) {
  const legend = document.getElementById('trends-chart-legend');
  const hintEl = document.getElementById('trends-chart-legend-hint');
  if (!legend) return;
  legend.replaceChildren();
  if (!items?.length) {
    legend.hidden = true;
  } else {
    legend.hidden = false;
    items.forEach((item) => {
      const row = document.createElement('span');
      row.className = 'trends-chart-legend-item';
      const swatch = document.createElement('span');
      swatch.className = `trends-chart-legend-swatch ${item.swatchClass || ''}`.trim();
      swatch.setAttribute('aria-hidden', 'true');
      if (item.marker) {
        if (item.color) swatch.style.backgroundColor = item.color;
      } else {
        if (item.color) swatch.style.borderTopColor = item.color;
        if (item.dash) swatch.style.borderTopStyle = 'dashed';
        if (item.dotted) swatch.style.borderTopStyle = 'dotted';
      }
      const text = document.createElement('span');
      text.textContent = item.label;
      row.append(swatch, text);
      legend.append(row);
    });
  }
  if (hintEl) {
    hintEl.textContent = hint || '';
    hintEl.hidden = !hint;
  }
}

function updateTrendsChartNote(message) {
  const note = document.getElementById('trends-chart-note');
  if (!note) return;
  if (!message) {
    note.hidden = true;
    note.textContent = '';
    return;
  }
  note.hidden = false;
  note.textContent = message;
}

function updateTrendsChartProjectionSummary(summary) {
  const wrap = document.getElementById('trends-chart-projection-summary');
  const resultEl = document.getElementById('trends-chart-projection-result');
  const methodEl = document.getElementById('trends-chart-projection-method');
  if (!wrap || !resultEl || !methodEl) return;

  if (!summary) {
    wrap.hidden = true;
    resultEl.replaceChildren();
    methodEl.replaceChildren();
    return;
  }

  wrap.hidden = false;
  resultEl.replaceChildren();
  (summary.resultBlocks || []).forEach((block) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'trends-chart-projection-block';
    if (block.title) {
      const title = document.createElement('p');
      title.className = 'trends-chart-projection-title';
      title.textContent = block.title;
      blockEl.append(title);
    }
    if (block.outlook) {
      const outlook = document.createElement('p');
      outlook.className = 'trends-chart-projection-outlook';
      outlook.textContent = `Outlook: ${block.outlook}`;
      blockEl.append(outlook);
    }
    if (block.sentence) {
      const sentence = document.createElement('p');
      sentence.className = 'trends-chart-projection-sentence';
      sentence.textContent = block.sentence;
      blockEl.append(sentence);
    }
    if (block.lines?.length) {
      const list = document.createElement('ul');
      list.className = 'trends-chart-projection-list';
      block.lines.forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        list.append(li);
      });
      blockEl.append(list);
    }
    resultEl.append(blockEl);
  });

  methodEl.replaceChildren();
  (summary.methodLines || []).forEach((line) => {
    const p = document.createElement('p');
    p.textContent = line;
    methodEl.append(p);
  });
}

function hideTrendsChartChrome() {
  updateTrendsChartLegend([], '');
  updateTrendsChartNote('');
  updateTrendsChartProjectionSummary(null);
}

function showTrendsChartEmpty(message) {
  const empty = document.getElementById('trends-chart-empty');
  const wrap = document.getElementById('trends-chart-svg-wrap');
  hideTrendsChartTooltip();
  hideTrendsChartChrome();
  trendsChartDrawState = null;
  if (empty) {
    empty.hidden = false;
    empty.textContent = message;
  }
  if (wrap) {
    wrap.hidden = true;
    wrap.innerHTML = '';
  }
  updateTrendsOutlookReportSnapshot({
    chart: null,
    emptyMessage: message,
    legendItems: [],
    legendHint: '',
    note: '',
    projectionSummary: null,
  });
}

function renderTrendsChartSection(currentRange, currentEvents, period) {
  const empty = document.getElementById('trends-chart-empty');
  const wrap = document.getElementById('trends-chart-svg-wrap');
  if (!empty || !wrap) return;

  populateTrendsOutlookProgramMenu();
  setupTrendsOutlookProgramControl();

  const showProjection = isTrendsChartProjectionEnabled();
  updateTrendsChartHorizonVisibility(showProjection);
  const selection = getTrendsOutlookSelection();
  const globalCompareMode = getTrendsCompareMode();
  const compareMode = getTrendsOutlookCompareMode(selection);
  const multiComparePaused = selection.mode === 'multi'
    && !trendsOutlookMultiCompareEnabled
    && globalCompareMode !== TRENDS_COMPARE_NONE;
  trendsOutlookPrevProgramCount = selection.keys.length;

  if (!currentRange) {
    showTrendsChartEmpty('Choose a valid custom date range to view Trend & Outlook.');
    return;
  }

  const metricKey = getTrendsChartMetricKey();
  const metricLabel = getTrendsChartMetricLabel(metricKey);
  const bucketSize = getTrendsChartBucketSize(period, currentRange);
  const baseFilters = getTrendsOutlookBaseFilters();
  const scopedCurrentEvents = selection.mode === 'all'
    ? currentEvents
    : filterTrendsEventsByProgramKeys(currentEvents, selection.keys);

  if (!scopedCurrentEvents.length) {
    showTrendsChartEmpty(
      selection.mode === 'all'
        ? 'No finalized AAR data is available for this trend.'
        : 'No finalized AAR data is available for the selected program(s) in this period.'
    );
    return;
  }

  const currentBuckets = aggregateTrendsChartBuckets(
    generateTrendsChartBuckets(currentRange, bucketSize),
    scopedCurrentEvents,
    bucketSize
  );

  const seriesList = [];
  const legendItems = [];
  let axisLabels = currentBuckets.map((bucket) => bucket.axisLabel);
  let boundaryIndex = null;
  let boundaryLabel = '';
  let projectionSummary = null;
  let noteParts = [];
  let futureAxisLabels = [];
  const projectionResults = [];

  if (selection.mode === 'all' || selection.mode === 'single') {
    const program = selection.mode === 'single' ? selection.programs[0] : null;
    const color = selection.mode === 'single'
      ? getTrendsOutlookProgramColor(0)
      : TRENDS_OUTLOOK_ALL_COLOR;
    const actualLabel = program ? program.label : 'Current Period';
    const actualSeries = buildTrendsOutlookActualSeries(currentBuckets, metricKey, actualLabel);
    seriesList.push({
      kind: 'actual',
      points: actualSeries,
      style: {
        stroke: color,
        width: 2.25,
        markerRadius: 3.5,
      },
    });
    legendItems.push({
      label: actualLabel,
      color,
      swatchClass: 'trends-chart-legend-swatch-current',
    });

    if (compareMode !== TRENDS_COMPARE_NONE) {
      const compareFilters = program
        ? { ...baseFilters }
        : getTrendsFilterState();
      const compareEventsFilter = program
        ? (interval) => filterTrendsEventsByProgramKeys(
          getTrendsEventsForRange(interval, compareFilters),
          [program.key]
        )
        : null;

      let compareSeries;
      if (compareEventsFilter) {
        const compareLabel = `${program.label} · ${getTrendsComparisonPhrase(compareMode)}`;
        const isAverage = compareMode === TRENDS_COMPARE_AVG_2 || compareMode === TRENDS_COMPARE_AVG_3;
        const periodCount = compareMode === TRENDS_COMPARE_AVG_3 ? 3 : compareMode === TRENDS_COMPARE_AVG_2 ? 2 : 1;
        compareSeries = currentBuckets.map((bucket) => {
          const effective = getTrendsChartEffectiveBucketRange(bucket, currentRange, bucketSize);
          const historicalIntervals = getTrendsChartHistoricalIntervals(
            effective,
            period,
            compareMode,
            currentRange
          );
          const metricsList = historicalIntervals.map((interval) => (
            calculateTrendsMetrics(compareEventsFilter(interval))
          ));
          const metrics = metricsList.length === 1
            ? metricsList[0]
            : averageTrendsMetrics(metricsList);
          const value = getTrendsChartSeriesValue(metrics, metricKey);
          const primaryInterval = historicalIntervals[0];
          return {
            axisLabel: bucket.axisLabel,
            tooltipLabel: isAverage
              ? formatTrendsChartAverageLabel(bucket, bucketSize)
              : formatTrendsChartHistoricalLabel(primaryInterval, bucketSize),
            seriesLabel: compareLabel,
            extraLabel: isAverage ? `Average of ${periodCount} historical periods` : '',
            value,
            formattedValue: formatTrendsChartValue(metricKey, value),
          };
        });
      } else {
        compareSeries = buildTrendsChartComparisonSeries(
          currentBuckets,
          currentRange,
          period,
          compareMode,
          getTrendsFilterState(),
          bucketSize,
          metricKey
        );
      }

      const compareColor = selection.mode === 'single'
        ? lightenTrendsOutlookColor(color, 0.5)
        : TRENDS_OUTLOOK_COMPARE_COLOR;
      seriesList.unshift({
        kind: 'compare',
        points: compareSeries,
        style: {
          stroke: compareColor,
          width: 1.75,
          dash: '6 4',
          markerRadius: 2.75,
          markerFill: compareColor,
        },
      });
      legendItems.push({
        label: getTrendsComparisonPhrase(compareMode),
        color: compareColor,
        dash: true,
        swatchClass: 'trends-chart-legend-swatch-compare',
      });
    }

    if (showProjection) {
      const projection = buildTrendsOutlookDirectionalProjection({
        currentBuckets,
        actualSeries,
        metricKey,
        programKeys: program ? [program.key] : null,
        bucketSize,
        seriesLabel: program ? program.label : '',
        color: selection.mode === 'single' ? color : TRENDS_OUTLOOK_PROJECTION_COLOR,
        filters: program ? getTrendsOutlookBaseFilters() : getTrendsFilterState(),
      });
      if (projection.projectionSeries?.length) {
        futureAxisLabels = projection.futureAxisLabels;
        boundaryIndex = projection.boundaryIndex;
        const todayIso = formatLocalIsoDate(new Date());
        boundaryLabel = currentRange.end >= todayIso ? 'Today' : 'Projection begins';
        const projectionColor = selection.mode === 'single' ? color : TRENDS_OUTLOOK_PROJECTION_COLOR;
        if (projection.scheduledSeries?.length) {
          seriesList.push({
            kind: 'scheduled',
            points: projection.scheduledSeries,
            style: {
              stroke: TRENDS_OUTLOOK_SCHEDULED_COLOR,
              width: 1.85,
              markerRadius: 3.5,
              markerFill: TRENDS_OUTLOOK_SCHEDULED_COLOR,
              markerStroke: '#ffffff',
              markerStrokeWidth: 1.5,
              markersOnly: true,
            },
          });
          legendItems.push({
            label: 'Scheduled',
            color: TRENDS_OUTLOOK_SCHEDULED_COLOR,
            marker: true,
            swatchClass: 'trends-chart-legend-swatch-scheduled',
          });
        }
        seriesList.push({
          kind: 'projection',
          points: projection.projectionSeries,
          style: {
            stroke: projectionColor,
            width: 2,
            dash: '5 4',
            markerRadius: 3.25,
            markerFill: '#ffffff',
            markerStroke: projectionColor,
            markerStrokeWidth: 1.75,
            skipAnchorMarker: true,
          },
        });
        legendItems.push({
          label: 'Outlook',
          color: projectionColor,
          dash: true,
          swatchClass: 'trends-chart-legend-swatch-projection',
        });
        projectionResults.push(projection);
        projectionSummary = {
          resultBlocks: [{
            title: formatTrendsOutlookProjectedTotal(metricKey, projection.months, projection.projectedTotal),
            outlook: classifyTrendsOutlookDirectionLabel(projection.direction),
          }],
          methodLines: getTrendsOutlookMethodLines(projection.windows, {
            metricKey,
            scheduledOnly: projection.scheduledOnly,
            includeScheduledFloor: true,
          }),
        };
      } else {
        noteParts.push(projection.error || 'Not enough historical activity to estimate an outlook.');
        projectionSummary = {
          resultBlocks: [{
            title: projection.error || 'Not enough historical activity to estimate an outlook.',
            outlook: classifyTrendsOutlookDirectionLabel(projection.direction || 'insufficient'),
            sentence: getTrendsOutlookDirectionSentence(projection.direction || 'insufficient', metricLabel),
          }],
          methodLines: projection.windows ? [
            'Outlook requires enough recent finalized activity to establish direction.',
            `Trend basis: ${formatTrendsProjectionRange(projection.windows.basis)}`,
            `Projection: ${formatTrendsProjectionRange(projection.windows.projection)}`,
          ] : [],
        };
      }
    }
  } else {
    // Multi-program mode
    const programSeries = selection.programs.map((program, index) => {
      const color = getTrendsOutlookProgramColor(index);
      const programEvents = filterTrendsEventsByProgramKeys(scopedCurrentEvents, [program.key]);
      const programBuckets = aggregateTrendsChartBuckets(
        generateTrendsChartBuckets(currentRange, bucketSize),
        programEvents,
        bucketSize
      );
      const actualSeries = buildTrendsOutlookActualSeries(programBuckets, metricKey, program.label);
      return {
        program,
        color,
        buckets: programBuckets,
        actualSeries,
      };
    });

    programSeries.forEach((entry) => {
      seriesList.push({
        kind: 'actual',
        points: entry.actualSeries,
        style: {
          stroke: entry.color,
          width: 2.15,
          markerRadius: 3.25,
        },
      });
      legendItems.push({
        label: entry.program.label,
        color: entry.color,
        swatchClass: 'trends-chart-legend-swatch-current',
      });
    });

    if (compareMode !== TRENDS_COMPARE_NONE) {
      programSeries.forEach((entry) => {
        const compareColor = lightenTrendsOutlookColor(entry.color, 0.55);
        const compareLabel = `${entry.program.label} · ${getTrendsComparisonPhrase(compareMode)}`;
        const isAverage = compareMode === TRENDS_COMPARE_AVG_2 || compareMode === TRENDS_COMPARE_AVG_3;
        const periodCount = compareMode === TRENDS_COMPARE_AVG_3 ? 3 : compareMode === TRENDS_COMPARE_AVG_2 ? 2 : 1;
        const compareSeries = entry.buckets.map((bucket) => {
          const effective = getTrendsChartEffectiveBucketRange(bucket, currentRange, bucketSize);
          const historicalIntervals = getTrendsChartHistoricalIntervals(
            effective,
            period,
            compareMode,
            currentRange
          );
          const metricsList = historicalIntervals.map((interval) => (
            calculateTrendsMetrics(filterTrendsEventsByProgramKeys(
              getTrendsEventsForRange(interval, baseFilters),
              [entry.program.key]
            ))
          ));
          const metrics = metricsList.length === 1
            ? metricsList[0]
            : averageTrendsMetrics(metricsList);
          const value = getTrendsChartSeriesValue(metrics, metricKey);
          const primaryInterval = historicalIntervals[0];
          return {
            axisLabel: bucket.axisLabel,
            tooltipLabel: isAverage
              ? formatTrendsChartAverageLabel(bucket, bucketSize)
              : formatTrendsChartHistoricalLabel(primaryInterval, bucketSize),
            seriesLabel: compareLabel,
            extraLabel: isAverage ? `Average of ${periodCount} historical periods` : '',
            value,
            formattedValue: formatTrendsChartValue(metricKey, value),
          };
        });
        seriesList.unshift({
          kind: 'compare',
          points: compareSeries,
          style: {
            stroke: compareColor,
            width: 1.35,
            dash: '2 4',
            markerRadius: 2.25,
            markerFill: '#ffffff',
            markerStroke: compareColor,
            markerStrokeWidth: 1.25,
          },
        });
      });
      noteParts.push('Historical comparison shown as lighter dotted lines for each program.');
    }

    if (showProjection) {
      const todayIso = formatLocalIsoDate(new Date());
      boundaryLabel = currentRange.end >= todayIso ? 'Today' : 'Projection begins';
      const multiLines = [];
      let sharedWindows = null;
      let sharedMonths = getTrendsProjectionHorizonMonths();

      programSeries.forEach((entry) => {
        const projection = buildTrendsOutlookDirectionalProjection({
          currentBuckets: entry.buckets,
          actualSeries: entry.actualSeries,
          metricKey,
          programKeys: [entry.program.key],
          bucketSize,
          seriesLabel: entry.program.label,
          color: entry.color,
        });
        sharedWindows = projection.windows || sharedWindows;
        sharedMonths = projection.months || sharedMonths;
        if (projection.futureAxisLabels?.length > futureAxisLabels.length) {
          futureAxisLabels = projection.futureAxisLabels;
        }
        if (projection.boundaryIndex != null) boundaryIndex = projection.boundaryIndex;
        if (projection.projectionSeries?.length) {
          seriesList.push({
            kind: 'projection',
            points: projection.projectionSeries,
            style: {
              stroke: entry.color,
              width: 1.9,
              dash: '5 4',
              markerRadius: 3,
              markerFill: '#ffffff',
              markerStroke: entry.color,
              markerStrokeWidth: 1.6,
              skipAnchorMarker: true,
            },
          });
          const totalText = metricKey === 'completedEvents'
            ? `≈ ${Math.round(projection.projectedTotal || 0)} events`
            : `≈ ${Math.round(projection.projectedTotal || 0).toLocaleString('en-US')} participants`;
          multiLines.push(
            `${entry.program.label} — ${classifyTrendsOutlookDirectionLabel(projection.direction)} · ${totalText}`
          );
          projectionResults.push(projection);
        } else {
          multiLines.push(
            `${entry.program.label} — ${classifyTrendsOutlookDirectionLabel('insufficient')}`
          );
          noteParts.push(
            `${entry.program.label}: ${projection.error || 'Not enough historical activity to estimate an outlook.'}`
          );
        }
      });

      if (projectionResults.length) {
        legendItems.push({
          label: 'Outlook',
          color: '#6b7280',
          dash: true,
          swatchClass: 'trends-chart-legend-swatch-projection',
        });
      }

      const anyScheduledOnly = projectionResults.some((entry) => entry.scheduledOnly);
      projectionSummary = {
        resultBlocks: [{
          title: `Projected ${metricLabel} — ${getTrendsOutlookProjectionHorizonLabel(sharedMonths).replace('Projected ', '')}`,
          lines: multiLines,
        }],
        methodLines: sharedWindows ? getTrendsOutlookMethodLines(sharedWindows, {
          metricKey,
          scheduledOnly: anyScheduledOnly && projectionResults.every((entry) => entry.scheduledOnly),
          includeScheduledFloor: true,
        }) : [],
      };
    }
  }

  if (futureAxisLabels.length) {
    axisLabels = [
      ...currentBuckets.map((bucket) => bucket.axisLabel),
      ...futureAxisLabels,
    ];
  }

  if (multiComparePaused) {
    noteParts.unshift(
      'Historical comparison is paused in multi-program view. Change Compare With to show it for each program.'
    );
  }

  empty.hidden = true;
  empty.textContent = '';
  wrap.hidden = false;
  updateTrendsChartLegend(legendItems, '');
  updateTrendsChartNote(noteParts.filter(Boolean).join(' '));
  updateTrendsChartProjectionSummary(projectionSummary);
  trendsChartDrawState = {
    seriesList,
    axisLabels,
    boundaryIndex,
    boundaryLabel,
    metricKey,
    metricLabel,
    ariaLabel: `Trend and outlook for ${metricLabel}`,
    driverContext: buildTrendsChartDriverContext({
      selection,
      compareMode,
      metricKey,
      currentRange,
      period,
      bucketSize,
      currentBuckets,
    }),
  };
  drawTrendsChartSvg(trendsChartDrawState);
  updateTrendsOutlookReportSnapshot({
    chart: {
      seriesList,
      axisLabels,
      boundaryIndex,
      boundaryLabel,
      metricKey,
      metricLabel,
    },
    emptyMessage: '',
    legendItems,
    legendHint: '',
    note: noteParts.filter(Boolean).join(' '),
    projectionSummary,
    historicalAnalysis: buildTrendsHistoricalAnalysisRows(
      trendsChartDrawState.driverContext,
      seriesList,
      selection.mode,
      compareMode,
      metricKey
    ),
    context: {
      ...buildTrendsOutlookReportContext(selection),
      metricLabel,
      compareMode,
      selectionMode: selection.mode,
    },
  });
}

function getTrendsDemandMetricKey() {
  return document.getElementById('trends-demand-metric')?.value === 'completedEvents'
    ? 'completedEvents'
    : 'participantReach';
}

function normalizeTrendsDemandEventType(event) {
  const raw = String(event?.eventType ?? '').trim();
  if (!raw || isTbd(raw)) {
    return { key: 'Unspecified', label: 'Unspecified' };
  }
  return { key: raw, label: raw };
}

function aggregateTrendsDemandByEventType(eventsForRange) {
  const map = new Map();
  eventsForRange.forEach((event) => {
    const { key, label } = normalizeTrendsDemandEventType(event);
    const existing = map.get(key) || {
      key,
      label,
      participantReach: 0,
      completedEvents: 0,
    };
    existing.participantReach += getTrendsParticipantCount(event.participants);
    existing.completedEvents += 1;
    map.set(key, existing);
  });
  return map;
}

function averageTrendsDemandMaps(maps) {
  const result = new Map();
  if (!maps.length) return result;

  const keys = new Set();
  maps.forEach((map) => {
    map.forEach((_, key) => keys.add(key));
  });

  keys.forEach((key) => {
    let label = 'Unspecified';
    let participantReach = 0;
    let completedEvents = 0;
    maps.forEach((map) => {
      const entry = map.get(key);
      if (!entry) return;
      label = entry.label;
      participantReach += entry.participantReach;
      completedEvents += entry.completedEvents;
    });
    result.set(key, {
      key,
      label,
      participantReach: participantReach / maps.length,
      completedEvents: completedEvents / maps.length,
    });
  });

  return result;
}

function getTrendsDemandMetricValue(entry, metricKey) {
  if (!entry) return 0;
  if (metricKey === 'completedEvents') return entry.completedEvents;
  if (metricKey === 'recordedCost') return entry.recordedCost ?? 0;
  return entry.participantReach;
}

function formatTrendsDemandValue(value) {
  return Math.round(value).toLocaleString('en-US');
}

function formatTrendsDemandShare(currentValue, totalValue) {
  if (totalValue === 0) return '0.0%';
  const share = (currentValue / totalValue) * 100;
  if (!Number.isFinite(share)) return '0.0%';
  return `${share.toFixed(1)}%`;
}

function buildTrendsDemandRows(currentMap, baselineMap, metricKey, compareMode) {
  const keys = new Set(currentMap.keys());
  if (compareMode !== TRENDS_COMPARE_NONE) {
    baselineMap.forEach((_, key) => keys.add(key));
  }

  const rows = [];
  keys.forEach((key) => {
    const currentEntry = currentMap.get(key);
    const baselineEntry = baselineMap.get(key);
    const label = currentEntry?.label || baselineEntry?.label || 'Unspecified';
    const currentValue = getTrendsDemandMetricValue(currentEntry, metricKey);
    const baselineValue = getTrendsDemandMetricValue(baselineEntry, metricKey);
    rows.push({
      key,
      label,
      currentValue,
      baselineValue,
    });
  });

  rows.sort((a, b) => {
    if (b.currentValue !== a.currentValue) return b.currentValue - a.currentValue;
    return a.label.localeCompare(b.label);
  });

  return rows;
}

function getTrendsBreakdownUnit(metricKey, count) {
  if (metricKey === 'completedEvents') {
    return count === 1 ? 'completed event' : 'completed events';
  }
  return count === 1 ? 'participant' : 'participants';
}

function getTrendsBreakdownMetricPhrase(metricKey) {
  return metricKey === 'completedEvents' ? 'completed events' : 'participant reach';
}

function getTrendsBreakdownVisibleRows(rows, expanded) {
  if (expanded || rows.length <= TRENDS_BREAKDOWN_DEFAULT_ROWS) return rows;
  return rows.slice(0, TRENDS_BREAKDOWN_DEFAULT_ROWS);
}

function getTrendsBreakdownScaleMax(rows, compareMode) {
  let max = 0;
  rows.forEach((row) => {
    max = Math.max(max, row.currentValue);
    if (compareMode !== TRENDS_COMPARE_NONE) {
      max = Math.max(max, row.baselineValue);
    }
  });
  return max;
}

function getTrendsBreakdownDotPercent(value, scaleMax) {
  if (!(scaleMax > 0)) return 0;
  const percent = (value / scaleMax) * 100;
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

function buildTrendsConcentrationSentence(rows, currentTotal, topCount, singular, plural, metricPhrase) {
  if (!(currentTotal > 0)) return '';
  const positive = rows.filter((row) => row.currentValue > 0);
  const count = Math.min(topCount, positive.length);
  if (!count) return '';
  const sum = positive.slice(0, count).reduce((total, row) => total + row.currentValue, 0);
  const shareText = formatTrendsDemandShare(sum, currentTotal);
  if (count === 1) {
    return `1 ${singular} represents ${shareText} of ${metricPhrase}.`;
  }
  return `Top ${count} ${plural} represent ${shareText} of ${metricPhrase}.`;
}

function buildTrendsDemandHeadline(metricKey, currentTotal, programCount) {
  const amount = formatTrendsDemandValue(currentTotal);
  const unit = getTrendsBreakdownUnit(metricKey, currentTotal);
  const group = programCount === 1 ? 'program' : 'programs';
  return `${amount} ${unit} across ${programCount} ${group}`;
}

function buildTrendsReachBreadthSentence(eventsForRange) {
  const count = calculateTrendsMetrics(eventsForRange).commandsReached;
  if (count === 1) return '1 command reached';
  return `${count} commands reached`;
}

function formatTrendsBreakdownValue(metricKey, value) {
  if (metricKey === 'recordedCost') return formatTotalRecordedEventCost(value);
  return formatTrendsDemandValue(value);
}

function getTrendsBreakdownSpokenChange(comparison, compareMode) {
  if (!comparison) return '';
  const phrase = getTrendsComparisonPhrase(compareMode);
  if (comparison.text.startsWith('↑ ')) {
    const magnitude = comparison.text.slice(2).split('%')[0];
    return `Increase ${magnitude} percent versus ${phrase}.`;
  }
  if (comparison.text.startsWith('↓ ')) {
    const magnitude = comparison.text.slice(2).split('%')[0];
    return `Decrease ${magnitude} percent versus ${phrase}.`;
  }
  if (comparison.text.startsWith('New activity')) {
    return `New activity versus ${phrase}.`;
  }
  if (comparison.text.startsWith('No change')) {
    return `No change versus ${phrase}.`;
  }
  return `${comparison.text.replace(' vs ', ' versus ')}.`;
}

function getTrendsBreakdownAriaLabel(row, metricKey, compareMode, comparison) {
  if (metricKey === 'recordedCost') {
    let label = `${row.label}. Current Period recorded event cost: ${formatTotalRecordedEventCost(row.currentValue)}.`;
    if (compareMode === TRENDS_COMPARE_NONE) return label;
    const phrase = getTrendsComparisonPhrase(compareMode);
    label += ` ${phrase}: ${formatTotalRecordedEventCost(row.baselineValue)}.`;
    const spoken = getTrendsBreakdownSpokenChange(comparison, compareMode);
    if (spoken) label += ` ${spoken}`;
    return label;
  }

  const unit = getTrendsBreakdownUnit(metricKey, 2);
  let label = `${row.label}. Current Period: ${formatTrendsDemandValue(row.currentValue)} ${unit}.`;
  if (compareMode === TRENDS_COMPARE_NONE) return label;
  const phrase = getTrendsComparisonPhrase(compareMode);
  label += ` ${phrase}: ${formatTrendsDemandValue(row.baselineValue)} ${unit}.`;
  const spoken = getTrendsBreakdownSpokenChange(comparison, compareMode);
  if (spoken) label += ` ${spoken}`;
  return label;
}

function getTrendsBreakdownTooltip(row, metricKey, compareMode, comparison) {
  if (metricKey === 'recordedCost') {
    const lines = [
      row.label,
      `Current Period: ${formatTotalRecordedEventCost(row.currentValue)}`,
    ];
    if (compareMode !== TRENDS_COMPARE_NONE) {
      lines.push(`${getTrendsComparisonPhrase(compareMode)}: ${formatTotalRecordedEventCost(row.baselineValue)}`);
      if (comparison?.text) lines.push(comparison.text);
    }
    return lines.join('\n');
  }

  const unit = getTrendsBreakdownUnit(metricKey, 2);
  const lines = [
    row.label,
    `Current Period: ${formatTrendsDemandValue(row.currentValue)} ${unit}`,
  ];
  if (compareMode !== TRENDS_COMPARE_NONE) {
    lines.push(`${getTrendsComparisonPhrase(compareMode)}: ${formatTrendsDemandValue(row.baselineValue)} ${unit}`);
    if (comparison?.text) lines.push(comparison.text);
  }
  return lines.join('\n');
}

function updateTrendsBreakdownLegend(legendId, compareId, labelId, compareMode) {
  const legend = document.getElementById(legendId);
  const compareItem = document.getElementById(compareId);
  const compareLabel = document.getElementById(labelId);
  if (!legend) return;
  legend.hidden = false;
  if (!compareItem || !compareLabel) return;
  if (compareMode === TRENDS_COMPARE_NONE) {
    compareItem.hidden = true;
    compareLabel.textContent = '';
    return;
  }
  compareLabel.textContent = getTrendsComparisonPhrase(compareMode);
  compareItem.hidden = false;
}

function updateTrendsBreakdownSummary(summary, lines) {
  if (!summary) return;
  summary.replaceChildren();
  const usable = lines.filter(Boolean);
  if (!usable.length) {
    summary.hidden = true;
    return;
  }
  usable.forEach((text, index) => {
    const line = document.createElement('p');
    line.className = index === 0
      ? 'trends-breakdown-summary-primary'
      : 'trends-breakdown-summary-secondary';
    line.textContent = text;
    summary.append(line);
  });
  summary.hidden = false;
}

function updateTrendsBreakdownToggle(button, expanded, total, singular, plural) {
  if (!button) return;
  if (total <= TRENDS_BREAKDOWN_DEFAULT_ROWS) {
    button.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.textContent = '';
    return;
  }
  button.hidden = false;
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.textContent = expanded
    ? 'Show top 8'
    : `View all ${total} ${total === 1 ? singular : plural}`;
}

function createTrendsBreakdownRow(row, metricKey, compareMode, scaleMax) {
  const comparison = compareMode === TRENDS_COMPARE_NONE
    ? null
    : buildTrendsMetricComparison(row.currentValue, row.baselineValue, compareMode);
  const currentPct = getTrendsBreakdownDotPercent(row.currentValue, scaleMax);
  const comparePct = getTrendsBreakdownDotPercent(row.baselineValue, scaleMax);

  const item = document.createElement('div');
  item.className = 'trends-breakdown-row';
  item.setAttribute('role', 'listitem');

  const name = document.createElement('div');
  name.className = 'trends-breakdown-name';
  name.textContent = row.label;

  const plot = document.createElement('div');
  plot.className = 'trends-breakdown-plot';
  plot.setAttribute('role', 'img');
  plot.tabIndex = 0;
  plot.setAttribute('aria-label', getTrendsBreakdownAriaLabel(row, metricKey, compareMode, comparison));
  plot.title = getTrendsBreakdownTooltip(row, metricKey, compareMode, comparison);

  const track = document.createElement('div');
  track.className = 'trends-breakdown-track';

  const axis = document.createElement('span');
  axis.className = 'trends-breakdown-axis';
  axis.setAttribute('aria-hidden', 'true');
  track.append(axis);

  if (compareMode !== TRENDS_COMPARE_NONE) {
    const width = Math.abs(currentPct - comparePct);
    if (width > 0.4) {
      const connector = document.createElement('span');
      connector.className = 'trends-breakdown-connector';
      connector.setAttribute('aria-hidden', 'true');
      connector.style.left = `${Math.min(currentPct, comparePct)}%`;
      connector.style.width = `${width}%`;
      track.append(connector);
    }

    const compareDot = document.createElement('span');
    compareDot.className = 'trends-breakdown-dot trends-breakdown-dot-compare';
    compareDot.setAttribute('aria-hidden', 'true');
    compareDot.style.left = `${comparePct}%`;
    track.append(compareDot);
  }

  const currentDot = document.createElement('span');
  currentDot.className = 'trends-breakdown-dot trends-breakdown-dot-current';
  currentDot.setAttribute('aria-hidden', 'true');
  currentDot.style.left = `${currentPct}%`;
  track.append(currentDot);
  plot.append(track);

  const stats = document.createElement('div');
  stats.className = 'trends-breakdown-stats';
  const value = document.createElement('span');
  value.className = 'trends-breakdown-value';
  value.textContent = formatTrendsBreakdownValue(metricKey, row.currentValue);
  stats.append(value);
  if (comparison) {
    const change = document.createElement('span');
    change.className = `trends-breakdown-change trends-kpi-comparison-${comparison.direction}`;
    change.textContent = comparison.text;
    stats.append(change);
  }

  item.append(name, plot, stats);
  return item;
}

function renderTrendsBreakdownRows(list, rows, metricKey, compareMode) {
  list.replaceChildren();
  list.setAttribute('role', 'list');
  const scaleMax = getTrendsBreakdownScaleMax(rows, compareMode);
  rows.forEach((row) => {
    list.append(createTrendsBreakdownRow(row, metricKey, compareMode, scaleMax));
  });
  list.hidden = false;
}

function getTrendsBreakdownRenderArgs() {
  const currentRange = getTrendsCurrentRange();
  const filters = getTrendsFilterState();
  const compareMode = getTrendsCompareMode();
  const currentEvents = getTrendsEventsForRange(currentRange, filters);
  const comparisonRanges = (compareMode !== TRENDS_COMPARE_NONE && currentRange)
    ? getTrendsComparisonRanges(currentRange, getTrendsPeriodValue(), compareMode)
    : [];
  return { currentEvents, compareMode, comparisonRanges, filters };
}

function hideTrendsBreakdownPanel(ids, emptyMessage) {
  const summary = document.getElementById(ids.summary);
  const legend = document.getElementById(ids.legend);
  const empty = document.getElementById(ids.empty);
  const list = document.getElementById(ids.list);
  const toggle = document.getElementById(ids.toggle);
  if (summary) {
    summary.hidden = true;
    summary.replaceChildren();
  }
  if (legend) legend.hidden = true;
  if (list) {
    list.hidden = true;
    list.replaceChildren();
  }
  if (toggle) {
    toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '';
  }
  if (empty) {
    empty.textContent = emptyMessage;
    empty.hidden = false;
  }
}

function renderTrendsDemandSection(
  currentEvents,
  compareMode,
  comparisonRanges,
  filters
) {
  const summary = document.getElementById('trends-demand-summary');
  const empty = document.getElementById('trends-demand-empty');
  const list = document.getElementById('trends-demand-list');
  if (!summary || !empty || !list) return;

  empty.hidden = true;
  empty.textContent = '';

  if (!currentEvents.length) {
    hideTrendsBreakdownPanel({
      summary: 'trends-demand-summary',
      legend: 'trends-demand-legend',
      empty: 'trends-demand-empty',
      list: 'trends-demand-list',
      toggle: 'trends-demand-toggle',
    }, 'No finalized AAR data is available for Program Demand.');
    const base = getTrendsReportBaseMeta();
    trendsDemandReportSnapshot = {
      periodLabel: base.periodLabel,
      comparisonLabel: base.comparisonLabel,
      measureByLabel: getTrendsMeasureByLabel('trends-demand-metric'),
      summaryLines: [],
      rows: [],
      compareModeEnabled: false,
      comparePhrase: '',
      emptyMessage: 'No finalized AAR data is available for Program Demand.',
      rowNote: '',
    };
    return;
  }

  const metricKey = getTrendsDemandMetricKey();
  const currentMap = aggregateTrendsDemandByEventType(currentEvents);
  let baselineMap = new Map();

  if (compareMode !== TRENDS_COMPARE_NONE) {
    const historicalMaps = comparisonRanges.map((range) => (
      aggregateTrendsDemandByEventType(getTrendsEventsForRange(range, filters))
    ));
    baselineMap = historicalMaps.length === 1
      ? historicalMaps[0]
      : averageTrendsDemandMaps(historicalMaps);
  }

  const rows = buildTrendsDemandRows(currentMap, baselineMap, metricKey, compareMode);
  const currentTotal = rows.reduce((sum, row) => sum + row.currentValue, 0);
  const metricPhrase = getTrendsBreakdownMetricPhrase(metricKey);
  const summaryLines = [
    buildTrendsDemandHeadline(metricKey, currentTotal, currentMap.size),
    buildTrendsConcentrationSentence(rows, currentTotal, 3, 'program', 'programs', metricPhrase),
  ];
  updateTrendsBreakdownSummary(summary, summaryLines);
  updateTrendsBreakdownLegend(
    'trends-demand-legend',
    'trends-demand-legend-compare',
    'trends-demand-legend-compare-label',
    compareMode
  );
  renderTrendsBreakdownRows(
    list,
    getTrendsBreakdownVisibleRows(rows, trendsDemandExpanded),
    metricKey,
    compareMode
  );
  updateTrendsBreakdownToggle(
    document.getElementById('trends-demand-toggle'),
    trendsDemandExpanded,
    rows.length,
    'program',
    'programs'
  );
  const base = getTrendsReportBaseMeta();
  trendsDemandReportSnapshot = {
    periodLabel: base.periodLabel,
    comparisonLabel: base.comparisonLabel,
    measureByLabel: getTrendsMeasureByLabel('trends-demand-metric'),
    summaryLines,
    rows: buildTrendsBreakdownReportRows(rows, metricKey, compareMode),
    compareModeEnabled: compareMode !== TRENDS_COMPARE_NONE,
    comparePhrase: base.comparePhrase,
    emptyMessage: '',
    rowNote: rows.length > TRENDS_BREAKDOWN_DEFAULT_ROWS
      ? `Ranked programs include the full list of ${rows.length} programs.`
      : '',
  };
}

function getTrendsReachMetricKey() {
  return document.getElementById('trends-reach-metric')?.value === 'completedEvents'
    ? 'completedEvents'
    : 'participantReach';
}

function normalizeTrendsReachCommand(event) {
  const raw = String(event?.command ?? '').trim();
  if (!raw || isTbd(raw)) {
    return { key: 'Unspecified', label: 'Unspecified' };
  }
  return { key: raw, label: raw };
}

function aggregateTrendsReachByCommand(eventsForRange) {
  const map = new Map();
  eventsForRange.forEach((event) => {
    const { key, label } = normalizeTrendsReachCommand(event);
    const existing = map.get(key) || {
      key,
      label,
      participantReach: 0,
      completedEvents: 0,
    };
    existing.participantReach += getTrendsParticipantCount(event.participants);
    existing.completedEvents += 1;
    map.set(key, existing);
  });
  return map;
}

function renderTrendsReachSection(
  currentEvents,
  compareMode,
  comparisonRanges,
  filters
) {
  const summary = document.getElementById('trends-reach-summary');
  const empty = document.getElementById('trends-reach-empty');
  const list = document.getElementById('trends-reach-list');
  if (!summary || !empty || !list) return;

  empty.hidden = true;
  empty.textContent = '';

  if (!currentEvents.length) {
    hideTrendsBreakdownPanel({
      summary: 'trends-reach-summary',
      legend: 'trends-reach-legend',
      empty: 'trends-reach-empty',
      list: 'trends-reach-list',
      toggle: 'trends-reach-toggle',
    }, 'No finalized AAR data is available for Command Reach.');
    const base = getTrendsReportBaseMeta();
    trendsReachReportSnapshot = {
      periodLabel: base.periodLabel,
      comparisonLabel: base.comparisonLabel,
      measureByLabel: getTrendsMeasureByLabel('trends-reach-metric'),
      summaryLines: [],
      rows: [],
      compareModeEnabled: false,
      comparePhrase: '',
      emptyMessage: 'No finalized AAR data is available for Command Reach.',
      rowNote: '',
    };
    return;
  }

  const metricKey = getTrendsReachMetricKey();
  const currentMap = aggregateTrendsReachByCommand(currentEvents);
  let baselineMap = new Map();

  if (compareMode !== TRENDS_COMPARE_NONE) {
    const historicalMaps = comparisonRanges.map((range) => (
      aggregateTrendsReachByCommand(getTrendsEventsForRange(range, filters))
    ));
    baselineMap = historicalMaps.length === 1
      ? historicalMaps[0]
      : averageTrendsDemandMaps(historicalMaps);
  }

  const rows = buildTrendsDemandRows(currentMap, baselineMap, metricKey, compareMode);
  const currentTotal = rows.reduce((sum, row) => sum + row.currentValue, 0);
  const metricPhrase = getTrendsBreakdownMetricPhrase(metricKey);
  const summaryLines = [
    buildTrendsReachBreadthSentence(currentEvents),
    buildTrendsConcentrationSentence(rows, currentTotal, 5, 'command', 'commands', metricPhrase),
  ];
  updateTrendsBreakdownSummary(summary, summaryLines);
  updateTrendsBreakdownLegend(
    'trends-reach-legend',
    'trends-reach-legend-compare',
    'trends-reach-legend-compare-label',
    compareMode
  );
  renderTrendsBreakdownRows(
    list,
    getTrendsBreakdownVisibleRows(rows, trendsReachExpanded),
    metricKey,
    compareMode
  );
  updateTrendsBreakdownToggle(
    document.getElementById('trends-reach-toggle'),
    trendsReachExpanded,
    rows.length,
    'command',
    'commands'
  );
  const base = getTrendsReportBaseMeta();
  const hasUnspecified = rows.some((row) => row.key === 'Unspecified');
  trendsReachReportSnapshot = {
    periodLabel: base.periodLabel,
    comparisonLabel: base.comparisonLabel,
    measureByLabel: getTrendsMeasureByLabel('trends-reach-metric'),
    summaryLines,
    rows: buildTrendsBreakdownReportRows(rows, metricKey, compareMode),
    compareModeEnabled: compareMode !== TRENDS_COMPARE_NONE,
    comparePhrase: base.comparePhrase,
    emptyMessage: '',
    rowNote: [
      rows.length > TRENDS_BREAKDOWN_DEFAULT_ROWS
        ? `Ranked commands include the full list of ${rows.length} commands.`
        : '',
      hasUnspecified
        ? 'Unspecified appears in the ranked list when command is blank or TBD, but does not increase identified-command breadth.'
        : '',
    ].filter(Boolean).join(' '),
  };
}

function getTrendsCostPerCompletedEvent(metrics) {
  if (!metrics || !(metrics.completedEvents > 0)) return null;
  const value = metrics.totalRecordedEventCost / metrics.completedEvents;
  return Number.isFinite(value) ? value : null;
}

function getTrendsParticipantsPer10k(metrics) {
  if (!metrics || !(metrics.totalRecordedEventCost > 0)) return null;
  const value = (metrics.participantReach / metrics.totalRecordedEventCost) * 10000;
  return Number.isFinite(value) ? value : null;
}

function averageValidTrendsDerivedValues(values) {
  const valid = values.filter((value) => value != null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatTrendsResourceMetricValue(key, metrics) {
  if (key === 'totalRecordedEventCost') {
    return formatTotalRecordedEventCost(metrics.totalRecordedEventCost);
  }
  if (key === 'costPerParticipant') {
    return metrics.costPerParticipant == null
      ? '—'
      : formatTotalRecordedEventCost(metrics.costPerParticipant);
  }
  if (key === 'costPerCompletedEvent') {
    const value = getTrendsCostPerCompletedEvent(metrics);
    return value == null ? '—' : formatTotalRecordedEventCost(value);
  }
  const per10k = getTrendsParticipantsPer10k(metrics);
  return per10k == null ? '—' : per10k.toFixed(1);
}

function describeTrendsResourceChange(currentValue, baselineValue) {
  if (!(baselineValue > 0)) return null;
  const percent = ((currentValue - baselineValue) / baselineValue) * 100;
  if (!Number.isFinite(percent)) return null;
  const rounded = Number(percent.toFixed(1));
  const magnitude = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `increased ${magnitude}%`;
  if (rounded < 0) return `decreased ${magnitude}%`;
  return 'was unchanged';
}

function buildTrendsResourceRelationship(currentMetrics, baselineMetrics, compareMode) {
  if (compareMode === TRENDS_COMPARE_NONE || !baselineMetrics) return '';

  const phrase = getTrendsComparisonPhrase(compareMode);
  const reachChange = describeTrendsResourceChange(
    currentMetrics.participantReach,
    baselineMetrics.participantReach
  );
  const costChange = describeTrendsResourceChange(
    currentMetrics.totalRecordedEventCost,
    baselineMetrics.totalRecordedEventCost
  );
  const reachNew = baselineMetrics.participantReach === 0 && currentMetrics.participantReach > 0;
  const costNew = baselineMetrics.totalRecordedEventCost === 0 && currentMetrics.totalRecordedEventCost > 0;

  if (reachChange && costChange) {
    return `Participant reach ${reachChange} while recorded event costs ${costChange} versus ${phrase}.`;
  }
  if (reachNew && costNew) {
    return `Participant activity and recorded event costs are new relative to ${phrase}.`;
  }
  if (reachNew && costChange) {
    return `Participant activity is new relative to ${phrase}, while recorded event costs ${costChange}.`;
  }
  if (costNew && reachChange) {
    return `Recorded event costs are new relative to ${phrase}, while participant reach ${reachChange}.`;
  }
  if (reachNew) {
    return `Participant activity is new relative to ${phrase}.`;
  }
  if (costNew) {
    return `Recorded event costs are new relative to ${phrase}.`;
  }
  if (reachChange) {
    return `Participant reach ${reachChange} versus ${phrase}.`;
  }
  if (costChange) {
    return `Recorded event costs ${costChange} versus ${phrase}.`;
  }
  return '';
}

function buildTrendsResourceComparison(currentMetrics, historicalMetrics, compareMode) {
  if (compareMode === TRENDS_COMPARE_NONE || !historicalMetrics.length) {
    return { comparison: null, baselineMetrics: null };
  }

  const baselineMetrics = historicalMetrics.length === 1
    ? historicalMetrics[0]
    : averageTrendsMetrics(historicalMetrics);
  const currentCpe = getTrendsCostPerCompletedEvent(currentMetrics);
  const baselineCpe = averageValidTrendsDerivedValues(
    historicalMetrics.map(getTrendsCostPerCompletedEvent)
  );
  const currentPer10k = getTrendsParticipantsPer10k(currentMetrics);
  const baselinePer10k = averageValidTrendsDerivedValues(
    historicalMetrics.map(getTrendsParticipantsPer10k)
  );
  const currentCppUnavailable = currentMetrics.costPerParticipant == null;
  const baselineCppUnavailable = baselineMetrics.costPerParticipant == null;

  return {
    baselineMetrics,
    comparison: {
      totalRecordedEventCost: buildTrendsMetricComparison(
        currentMetrics.totalRecordedEventCost,
        baselineMetrics.totalRecordedEventCost,
        compareMode
      ),
      costPerParticipant: buildTrendsMetricComparison(
        currentMetrics.costPerParticipant ?? 0,
        baselineMetrics.costPerParticipant ?? 0,
        compareMode,
        { unavailable: currentCppUnavailable || baselineCppUnavailable }
      ),
      costPerCompletedEvent: buildTrendsMetricComparison(
        currentCpe ?? 0,
        baselineCpe ?? 0,
        compareMode,
        { unavailable: currentCpe == null || baselineCpe == null }
      ),
      participantsPer10k: buildTrendsMetricComparison(
        currentPer10k ?? 0,
        baselinePer10k ?? 0,
        compareMode,
        { unavailable: currentPer10k == null || baselinePer10k == null }
      ),
    },
  };
}

function aggregateTrendsSpendingByEventType(eventsForRange) {
  const map = new Map();
  eventsForRange.forEach((event) => {
    const { key, label } = normalizeTrendsDemandEventType(event);
    const existing = map.get(key) || {
      key,
      label,
      recordedCost: 0,
      completedEvents: 0,
    };
    existing.recordedCost += getTrendsEventRecordedCost(event);
    existing.completedEvents += 1;
    map.set(key, existing);
  });
  return map;
}

function averageTrendsSpendingMaps(maps) {
  const result = new Map();
  if (!maps.length) return result;

  const keys = new Set();
  maps.forEach((map) => {
    map.forEach((_, key) => keys.add(key));
  });

  keys.forEach((key) => {
    let label = 'Unspecified';
    let recordedCost = 0;
    maps.forEach((map) => {
      const entry = map.get(key);
      if (!entry) return;
      label = entry.label;
      recordedCost += entry.recordedCost;
    });
    result.set(key, {
      key,
      label,
      recordedCost: recordedCost / maps.length,
    });
  });

  return result;
}

function renderTrendsResourceMetrics(currentMetrics, comparison, compareMode) {
  const grid = document.getElementById('trends-resource-metrics');
  if (!grid) return;

  const cards = [
    { key: 'totalRecordedEventCost', label: 'Total Recorded Event Cost' },
    { key: 'costPerParticipant', label: 'Cost per Participant' },
    { key: 'costPerCompletedEvent', label: 'Cost per Completed Event' },
    { key: 'participantsPer10k', label: 'Participants per $10,000' },
  ];

  grid.replaceChildren();
  cards.forEach((card) => {
    const item = document.createElement('div');
    item.className = 'trends-resource-metric';

    const label = document.createElement('div');
    label.className = 'trends-resource-metric-label';
    label.textContent = card.label;

    const value = document.createElement('div');
    value.className = 'trends-resource-metric-value';
    value.textContent = formatTrendsResourceMetricValue(card.key, currentMetrics);

    item.append(label, value);

    const comparisonInfo = comparison?.[card.key];
    if (
      compareMode !== TRENDS_COMPARE_NONE
      && comparisonInfo
      && comparisonInfo.text !== 'No comparison'
    ) {
      const change = document.createElement('div');
      change.className = `trends-resource-metric-comparison trends-kpi-comparison-${comparisonInfo.direction}`;
      change.textContent = comparisonInfo.text;
      item.append(change);
    }

    grid.append(item);
  });
}

function renderTrendsResourceSection(
  currentEvents,
  currentMetrics,
  compareMode,
  comparisonRanges,
  filters,
  historicalMetrics
) {
  const empty = document.getElementById('trends-resource-empty');
  const body = document.getElementById('trends-resource-body');
  const relationship = document.getElementById('trends-resource-relationship');
  const spendingSummary = document.getElementById('trends-spending-summary');
  const spendingList = document.getElementById('trends-spending-list');
  if (!empty || !body || !relationship || !spendingSummary || !spendingList) return;

  if (!currentEvents.length) {
    body.hidden = true;
    relationship.hidden = true;
    relationship.textContent = '';
    spendingSummary.hidden = true;
    spendingSummary.replaceChildren();
    spendingList.hidden = true;
    spendingList.replaceChildren();
    updateTrendsBreakdownLegend(
      'trends-spending-legend',
      'trends-spending-legend-compare',
      'trends-spending-legend-compare-label',
      TRENDS_COMPARE_NONE
    );
    const spendingLegend = document.getElementById('trends-spending-legend');
    if (spendingLegend) spendingLegend.hidden = true;
    updateTrendsBreakdownToggle(
      document.getElementById('trends-spending-toggle'),
      false,
      0,
      'program',
      'programs'
    );
    empty.textContent = 'No finalized AAR data is available for Resource Impact.';
    empty.hidden = false;
    renderTrendsCostDetails(new Map());
    const base = getTrendsReportBaseMeta();
    trendsResourceReportSnapshot = {
      periodLabel: base.periodLabel,
      comparisonLabel: base.comparisonLabel,
      kpis: [],
      relationshipText: '',
      spendingSummaryLines: [],
      spendingRows: [],
      compareModeEnabled: false,
      comparePhrase: '',
      costDetailsExpanded: trendsCostDetailsExpanded,
      costDetailRows: [],
      emptyMessage: 'No finalized AAR data is available for Resource Impact.',
    };
    return;
  }

  empty.hidden = true;
  empty.textContent = '';
  body.hidden = false;

  const { comparison, baselineMetrics } = buildTrendsResourceComparison(
    currentMetrics,
    historicalMetrics,
    compareMode
  );
  renderTrendsResourceMetrics(currentMetrics, comparison, compareMode);

  const relationshipText = buildTrendsResourceRelationship(
    currentMetrics,
    baselineMetrics,
    compareMode
  );
  relationship.textContent = relationshipText;
  relationship.hidden = !relationshipText;

  const currentMap = aggregateTrendsSpendingByEventType(currentEvents);
  let baselineMap = new Map();
  if (compareMode !== TRENDS_COMPARE_NONE) {
    const historicalMaps = comparisonRanges.map((range) => (
      aggregateTrendsSpendingByEventType(getTrendsEventsForRange(range, filters))
    ));
    baselineMap = historicalMaps.length === 1
      ? historicalMaps[0]
      : averageTrendsSpendingMaps(historicalMaps);
  }

  const rows = buildTrendsDemandRows(currentMap, baselineMap, 'recordedCost', compareMode);
  const currentTotal = rows.reduce((sum, row) => sum + row.currentValue, 0);
  const spendingSummaryLines = [
    `${formatTotalRecordedEventCost(currentTotal)} recorded across ${currentMap.size} ${currentMap.size === 1 ? 'program' : 'programs'}`,
    buildTrendsConcentrationSentence(
      rows,
      currentTotal,
      3,
      'program',
      'programs',
      'recorded event costs'
    ),
  ];
  updateTrendsBreakdownSummary(spendingSummary, spendingSummaryLines);
  updateTrendsBreakdownLegend(
    'trends-spending-legend',
    'trends-spending-legend-compare',
    'trends-spending-legend-compare-label',
    compareMode
  );
  renderTrendsBreakdownRows(
    spendingList,
    getTrendsBreakdownVisibleRows(rows, trendsSpendingExpanded),
    'recordedCost',
    compareMode
  );
  updateTrendsBreakdownToggle(
    document.getElementById('trends-spending-toggle'),
    trendsSpendingExpanded,
    rows.length,
    'program',
    'programs'
  );
  renderTrendsCostDetails(currentMap);

  const base = getTrendsReportBaseMeta();
  const kpiCards = [
    { key: 'totalRecordedEventCost', label: 'Total Recorded Event Cost' },
    { key: 'costPerParticipant', label: 'Cost per Participant' },
    { key: 'costPerCompletedEvent', label: 'Cost per Completed Event' },
    { key: 'participantsPer10k', label: 'Participants per $10,000' },
  ];
  trendsResourceReportSnapshot = {
    periodLabel: base.periodLabel,
    comparisonLabel: base.comparisonLabel,
    kpis: kpiCards.map((card) => {
      const comparisonInfo = comparison?.[card.key];
      const includeComparison = compareMode !== TRENDS_COMPARE_NONE
        && comparisonInfo
        && comparisonInfo.text !== 'No comparison';
      return {
        key: card.key,
        label: card.label,
        value: formatTrendsResourceMetricValue(card.key, currentMetrics),
        comparisonText: includeComparison ? comparisonInfo.text : '',
        comparisonDirection: comparisonInfo?.direction || 'neutral',
      };
    }),
    relationshipText,
    spendingSummaryLines,
    spendingRows: buildTrendsBreakdownReportRows(rows, 'recordedCost', compareMode),
    compareModeEnabled: compareMode !== TRENDS_COMPARE_NONE,
    comparePhrase: base.comparePhrase,
    costDetailsExpanded: trendsCostDetailsExpanded,
    costDetailRows: buildTrendsCostDetailRows(currentMap).map((row) => ({
      label: row.label,
      recordedCost: formatTotalRecordedEventCost(row.recordedCost),
      completedEvents: String(row.completedEvents),
      avgCostPerEvent: formatTrendsAvgCostPerEvent(row.recordedCost, row.completedEvents),
    })),
    emptyMessage: '',
  };
}

function buildTrendsCostDetailRows(currentMap) {
  return [...currentMap.values()]
    .map((entry) => ({
      label: entry.label,
      recordedCost: entry.recordedCost,
      completedEvents: entry.completedEvents || 0,
    }))
    .sort((a, b) => {
      if (b.recordedCost !== a.recordedCost) return b.recordedCost - a.recordedCost;
      return a.label.localeCompare(b.label);
    });
}

function formatTrendsAvgCostPerEvent(recordedCost, completedEvents) {
  if (!(completedEvents > 0)) return '—';
  const value = recordedCost / completedEvents;
  if (!Number.isFinite(value)) return '—';
  return formatTotalRecordedEventCost(value);
}

function renderTrendsCostDetails(currentMap) {
  const details = document.getElementById('trends-cost-details');
  const toggle = document.getElementById('trends-cost-details-toggle');
  const empty = document.getElementById('trends-cost-details-empty');
  const wrap = document.getElementById('trends-cost-details-table-wrap');
  const body = document.getElementById('trends-cost-details-body');
  if (!details || !toggle || !empty || !wrap || !body) return;

  toggle.hidden = false;
  toggle.setAttribute('aria-expanded', trendsCostDetailsExpanded ? 'true' : 'false');
  toggle.textContent = trendsCostDetailsExpanded
    ? 'Hide program cost details'
    : 'View program cost details';

  if (trendsResourceReportSnapshot) {
    trendsResourceReportSnapshot = {
      ...trendsResourceReportSnapshot,
      costDetailsExpanded: trendsCostDetailsExpanded,
      costDetailRows: buildTrendsCostDetailRows(currentMap).map((row) => ({
        label: row.label,
        recordedCost: formatTotalRecordedEventCost(row.recordedCost),
        completedEvents: String(row.completedEvents),
        avgCostPerEvent: formatTrendsAvgCostPerEvent(row.recordedCost, row.completedEvents),
      })),
    };
  }

  if (!trendsCostDetailsExpanded) {
    details.hidden = true;
    empty.hidden = true;
    empty.textContent = '';
    wrap.hidden = true;
    body.replaceChildren();
    return;
  }

  details.hidden = false;
  const rows = buildTrendsCostDetailRows(currentMap);
  if (!rows.length) {
    wrap.hidden = true;
    body.replaceChildren();
    empty.textContent = 'No program cost details are available for the selected period.';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  empty.textContent = '';
  body.replaceChildren();
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const program = document.createElement('th');
    program.scope = 'row';
    program.className = 'trends-cost-details-program';
    program.textContent = row.label;

    const cost = document.createElement('td');
    cost.textContent = formatTotalRecordedEventCost(row.recordedCost);

    const events = document.createElement('td');
    events.textContent = String(row.completedEvents);

    const average = document.createElement('td');
    average.textContent = formatTrendsAvgCostPerEvent(row.recordedCost, row.completedEvents);

    tr.append(program, cost, events, average);
    body.append(tr);
  });
  wrap.hidden = false;
}

function getTrendsProjectionHorizonMonths() {
  const value = Number(document.getElementById('trends-chart-projection-horizon')?.value);
  if (value === 6 || value === 12) return value;
  return 3;
}

function formatTrendsProjectionRange(range) {
  const start = parseLocalIsoDate(range.start);
  const end = parseLocalIsoDate(range.end);
  const formatDate = (date) => (
    `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}, ${date.getFullYear()}`
  );
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function getTrendsProjectionWindows(today, months) {
  const todayIso = formatLocalIsoDate(today);
  return {
    basis: {
      start: addDaysToIsoDate(formatLocalIsoDate(shiftLocalDateByMonths(today, -12)), 1),
      end: todayIso,
    },
    projection: {
      start: addDaysToIsoDate(todayIso, 1),
      end: formatLocalIsoDate(shiftLocalDateByMonths(today, months)),
    },
  };
}

function projectTrendsMetric(historicalTotal, basisDays, horizonDays) {
  if (!(basisDays > 0) || !(horizonDays > 0)) return 0;
  const projected = (historicalTotal / basisDays) * horizonDays;
  return Number.isFinite(projected) ? projected : 0;
}

function getTrendsExplorerBasisRange(today = new Date()) {
  return getTrendsProjectionWindows(today, 3).basis;
}

function getTrendsExplorerEligibleEvents(events) {
  return events.filter((event) => getTrendsEventRecordedCost(event) > 0);
}

function calculateTrendsExplorerAssumptions(eligibleEvents) {
  let recordedCost = 0;
  let participantReach = 0;
  eligibleEvents.forEach((event) => {
    recordedCost += getTrendsEventRecordedCost(event);
    participantReach += getTrendsParticipantCount(event.participants);
  });
  const completedEvents = eligibleEvents.length;
  return {
    completedEvents,
    recordedCost,
    participantReach,
    avgCostPerEvent: completedEvents > 0 ? recordedCost / completedEvents : null,
    avgParticipantsPerEvent: completedEvents > 0 ? participantReach / completedEvents : null,
    avgCostPerParticipant: participantReach > 0 ? recordedCost / participantReach : null,
  };
}

function getTrendsExplorerRangeIncrement(amount) {
  const abs = Math.abs(amount);
  if (!(abs > 0) || !Number.isFinite(abs)) return 1000;
  if (abs <= 10000) return 1000;
  if (abs <= 50000) return 5000;
  if (abs <= 100000) return 10000;
  if (abs <= 500000) return 50000;
  if (abs <= 2000000) return 100000;
  return 250000;
}

function getTrendsExplorerCleanMax(amount) {
  const abs = Math.abs(amount);
  if (!(abs > 0) || !Number.isFinite(abs)) return 0;
  const increment = getTrendsExplorerRangeIncrement(abs);
  return Math.ceil(abs / increment) * increment;
}

function getTrendsExplorerSliderStep(max, changeValue) {
  const absMax = Math.abs(max);
  if (!(absMax > 0) || !Number.isFinite(absMax)) return 1;
  let step = 1;
  if (absMax <= 10000) step = 1;
  else if (absMax <= 100000) step = 1000;
  else if (absMax <= 1000000) step = 5000;
  else step = 10000;
  const amount = normalizeTrendsExplorerChange(changeValue);
  if (amount % step !== 0) return 1;
  return step;
}

function normalizeTrendsExplorerChange(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function parseTrendsExplorerChange(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const negative = /^[-−(]/.test(text) || /[−-]\s*\$/.test(text);
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded === 0) return 0;
  return negative ? -rounded : rounded;
}

function formatTrendsExplorerCurrency(amount) {
  const normalized = Math.round(Math.abs(Number(amount) || 0));
  return normalized.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatTrendsExplorerSignedCurrency(amount) {
  const normalized = normalizeTrendsExplorerChange(amount);
  if (normalized === 0) return '$0';
  const formatted = formatTrendsExplorerCurrency(Math.abs(normalized));
  return normalized > 0 ? `+${formatted}` : `-${formatted}`;
}

function formatTrendsExplorerCurrencyAuto(amount) {
  if (!Number.isFinite(amount)) return '—';
  const rounded = Math.round(amount * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return rounded.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatTrendsExplorerSignedCount(value, singular, plural) {
  const normalized = Number.isFinite(value) ? Math.round(value) : 0;
  const unit = Math.abs(normalized) === 1 ? singular : plural;
  if (normalized === 0) return `0 ${unit}`;
  const amount = Math.abs(normalized).toLocaleString('en-US');
  return `${normalized > 0 ? '+' : '-'}${amount} ${unit}`;
}

function getTrendsExplorerSignClass(value) {
  if (value > 0) return 'is-positive';
  if (value < 0) return 'is-negative';
  return '';
}

function getTrendsExplorerChangeLabel(change) {
  if (change > 0) return 'Additional Funding';
  if (change < 0) return 'Funding Reduction';
  return 'No Change';
}

function allocateTrendsExplorerIntegerAmounts(items, totalAmount) {
  const total = normalizeTrendsExplorerChange(totalAmount);
  if (!items.length) return {};
  if (total === 0) {
    return Object.fromEntries(items.map((item) => [item.key, 0]));
  }

  const shareSum = items.reduce((sum, item) => sum + (Number(item.share) > 0 ? Number(item.share) : 0), 0);
  const absTotal = Math.abs(total);
  const sign = total < 0 ? -1 : 1;
  const exactItems = items.map((item) => {
    const share = Number(item.share) > 0 ? Number(item.share) : 0;
    const exact = shareSum > 0 ? (share / shareSum) * absTotal : absTotal / items.length;
    const floored = Math.floor(exact);
    return {
      key: item.key,
      label: item.label || item.key,
      amount: floored,
      remainder: exact - floored,
    };
  });

  let leftover = absTotal - exactItems.reduce((sum, item) => sum + item.amount, 0);
  if (leftover < 0) leftover = 0;
  const ranked = [...exactItems].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.label.localeCompare(b.label);
  });
  for (let index = 0; index < leftover; index += 1) {
    ranked[index % ranked.length].amount += 1;
  }

  return Object.fromEntries(exactItems.map((item) => [item.key, item.amount * sign]));
}

function calculateTrendsExplorerSignedImpact(assignedAmount, assumptions) {
  const assigned = normalizeTrendsExplorerChange(assignedAmount);
  const avgCostPerEvent = assumptions?.avgCostPerEvent;
  if (!(avgCostPerEvent > 0) || !Number.isFinite(avgCostPerEvent)) {
    return {
      assigned,
      estimatedEvents: null,
      estimatedReach: null,
      modeledSpend: null,
      residual: assigned,
      insufficient: true,
    };
  }

  const sign = assigned < 0 ? -1 : (assigned > 0 ? 1 : 0);
  const estimatedEventsAbs = sign === 0 ? 0 : Math.floor(Math.abs(assigned) / avgCostPerEvent);
  const estimatedEvents = estimatedEventsAbs === 0 ? 0 : sign * estimatedEventsAbs;
  const modeledSpend = estimatedEvents * avgCostPerEvent;
  const residual = assigned - modeledSpend;
  const canEstimateReach = assumptions.participantReach > 0
    && assumptions.avgParticipantsPerEvent != null
    && Number.isFinite(assumptions.avgParticipantsPerEvent);
  const estimatedReach = canEstimateReach
    ? Math.round(estimatedEvents * assumptions.avgParticipantsPerEvent)
    : null;

  return {
    assigned,
    estimatedEvents: Number.isFinite(estimatedEvents) ? estimatedEvents : 0,
    estimatedReach: canEstimateReach && Number.isFinite(estimatedReach) ? estimatedReach : null,
    modeledSpend: Number.isFinite(modeledSpend) ? modeledSpend : 0,
    residual: Number.isFinite(residual) ? residual : 0,
    insufficient: false,
  };
}

function aggregateTrendsExplorerPrograms(basisEvents) {
  const map = new Map();
  basisEvents.forEach((event) => {
    const { key, label } = normalizeTrendsDemandEventType(event);
    const existing = map.get(key) || { key, label, events: [], costEvents: [] };
    existing.events.push(event);
    if (getTrendsEventRecordedCost(event) > 0) existing.costEvents.push(event);
    map.set(key, existing);
  });

  return [...map.values()]
    .map((entry) => {
      const assumptions = calculateTrendsExplorerAssumptions(entry.costEvents);
      const estimable = assumptions.completedEvents > 0
        && assumptions.avgCostPerEvent > 0
        && Number.isFinite(assumptions.avgCostPerEvent);
      return {
        key: entry.key,
        label: entry.label,
        assumptions,
        estimable,
        basisEventCount: entry.events.length,
      };
    })
    .sort((a, b) => compareEventTypeSeriesOrder(a.label, b.label));
}

function getTrendsExplorerEstimablePrograms(programs) {
  return (programs || []).filter((program) => program.estimable);
}

function getTrendsExplorerHistoricalAssignments(programs, change) {
  const nextChange = normalizeTrendsExplorerChange(change);
  const result = Object.fromEntries((programs || []).map((program) => [program.key, 0]));
  const estimable = getTrendsExplorerEstimablePrograms(programs);
  if (!estimable.length || nextChange === 0) return result;
  const allocated = allocateTrendsExplorerIntegerAmounts(
    estimable.map((program) => ({
      key: program.key,
      label: program.label,
      share: program.assumptions.recordedCost,
    })),
    nextChange
  );
  estimable.forEach((program) => {
    result[program.key] = allocated[program.key] || 0;
  });
  return result;
}

function sumTrendsExplorerAssignments(assignments, programs) {
  return (programs || []).reduce((sum, program) => (
    sum + normalizeTrendsExplorerChange(assignments?.[program.key] || 0)
  ), 0);
}

function getTrendsExplorerAssignmentBounds(change, assignments, programs, programKey) {
  const nextChange = normalizeTrendsExplorerChange(change);
  const othersSum = (programs || []).reduce((sum, program) => {
    if (program.key === programKey) return sum;
    return sum + normalizeTrendsExplorerChange(assignments?.[program.key] || 0);
  }, 0);

  if (nextChange > 0) {
    return { min: 0, max: Math.max(0, nextChange - othersSum) };
  }
  if (nextChange < 0) {
    return { min: Math.min(0, nextChange - othersSum), max: 0 };
  }
  return { min: 0, max: 0 };
}

function clampTrendsExplorerProgramAssignment(change, assignments, programs, programKey, requested) {
  const bounds = getTrendsExplorerAssignmentBounds(change, assignments, programs, programKey);
  const value = normalizeTrendsExplorerChange(requested);
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

function resolveTrendsExplorerAssignments(programs, change, storedAssignments) {
  const historical = getTrendsExplorerHistoricalAssignments(programs, change);
  if (!programs.length) return {};
  if (normalizeTrendsExplorerChange(change) === 0) {
    return Object.fromEntries(programs.map((program) => [program.key, 0]));
  }
  if (!storedAssignments) return historical;

  const next = {};
  programs.forEach((program) => {
    if (!program.estimable) {
      next[program.key] = 0;
      return;
    }
    if (storedAssignments[program.key] == null) {
      next[program.key] = 0;
      return;
    }
    next[program.key] = normalizeTrendsExplorerChange(storedAssignments[program.key]);
  });

  programs.forEach((program) => {
    if (!program.estimable) return;
    next[program.key] = clampTrendsExplorerProgramAssignment(
      change,
      next,
      programs,
      program.key,
      next[program.key]
    );
  });
  return next;
}

function calculateTrendsExplorerImpactTotals(change, programs, assignments) {
  const nextChange = normalizeTrendsExplorerChange(change);
  const rows = (programs || []).map((program) => {
    const assigned = normalizeTrendsExplorerChange(assignments?.[program.key] || 0);
    const impact = program.estimable
      ? calculateTrendsExplorerSignedImpact(assigned, program.assumptions)
      : {
        assigned,
        estimatedEvents: null,
        estimatedReach: null,
        modeledSpend: null,
        residual: assigned,
        insufficient: true,
      };
    return { program, assigned, impact };
  });

  const assignedTotal = rows.reduce((sum, row) => sum + row.assigned, 0);
  const unassigned = nextChange - assignedTotal;
  const eventRows = rows.filter((row) => row.impact.estimatedEvents != null);
  const estimatedEvents = eventRows.reduce((sum, row) => sum + (row.impact.estimatedEvents || 0), 0);
  const reachRows = eventRows.filter((row) => row.assigned !== 0 && row.impact.estimatedReach != null);
  const missingReachRows = eventRows.filter((row) => row.assigned !== 0 && row.impact.estimatedReach == null);
  const estimatedReach = eventRows.some((row) => row.impact.estimatedReach != null)
    ? eventRows.reduce((sum, row) => sum + (row.impact.estimatedReach || 0), 0)
    : null;
  const modeledSpend = eventRows.reduce((sum, row) => sum + (row.impact.modeledSpend || 0), 0);
  const residual = eventRows.reduce((sum, row) => sum + (row.impact.residual || 0), 0);

  return {
    change: nextChange,
    rows,
    assignedTotal,
    unassigned,
    estimatedEvents: Number.isFinite(estimatedEvents) ? estimatedEvents : 0,
    estimatedReach: estimatedReach != null && Number.isFinite(estimatedReach) ? estimatedReach : null,
    reachIncomplete: missingReachRows.length,
    modeledSpend: Number.isFinite(modeledSpend) ? modeledSpend : 0,
    residual: Number.isFinite(residual) ? residual : 0,
    assignedReachPrograms: reachRows.length,
  };
}

function resolveTrendsExplorerSliderMax(historicalCost, change, existingMax) {
  const defaultMax = Math.max(getTrendsExplorerCleanMax(historicalCost * 2), 100000);
  const changeMax = Math.abs(change) > defaultMax ? getTrendsExplorerCleanMax(change) : 0;
  const nextMax = Math.max(defaultMax, changeMax, existingMax || 0, Math.abs(change) || 0);
  return Number.isFinite(nextMax) ? nextMax : 0;
}

function setTrendsExplorerConstraint(message) {
  const el = document.getElementById('trends-explorer-constraint');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function applyTrendsExplorerChange(amount, options = {}) {
  const fromUser = Boolean(options.fromUser);
  const resetAssignments = options.resetAssignments !== false;
  const normalized = normalizeTrendsExplorerChange(amount);
  if (fromUser) {
    trendsExplorerUserChange = normalized;
  }
  const assumptions = trendsExplorerViewState?.assumptions;
  if (!assumptions) return;
  const historicalCost = assumptions.recordedCost;
  trendsExplorerSliderMax = resolveTrendsExplorerSliderMax(
    historicalCost,
    normalized,
    trendsExplorerSliderMax
  );
  const programs = trendsExplorerViewState?.programs || [];
  const assignments = resetAssignments
    ? getTrendsExplorerHistoricalAssignments(programs, normalized)
    : resolveTrendsExplorerAssignments(programs, normalized, trendsExplorerAssignments);
  trendsExplorerAssignments = assignments;
  if (trendsExplorerViewState) {
    trendsExplorerViewState.change = normalized;
    trendsExplorerViewState.assignments = assignments;
  }
  setTrendsExplorerConstraint('');
  updateTrendsExplorerControls(normalized, trendsExplorerSliderMax);
  renderTrendsExplorerOutputs();
}

function updateTrendsExplorerControls(change, sliderMax) {
  const input = document.getElementById('trends-explorer-funding-input');
  const slider = document.getElementById('trends-explorer-funding-slider');
  const hint = document.getElementById('trends-explorer-funding-hint');
  const changeValue = normalizeTrendsExplorerChange(change);
  const max = Math.max(0, sliderMax);
  const step = getTrendsExplorerSliderStep(max, changeValue);

  if (slider) {
    slider.min = String(-max);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(changeValue);
    slider.setAttribute('aria-valuemin', String(-max));
    slider.setAttribute('aria-valuemax', String(max));
    slider.setAttribute('aria-valuenow', String(changeValue));
    slider.setAttribute('aria-valuetext', formatTrendsExplorerSignedCurrency(changeValue));
  }

  if (input && document.activeElement !== input) {
    input.value = formatTrendsExplorerSignedCurrency(changeValue);
  }

  if (hint) {
    hint.textContent = changeValue > 0
      ? 'Additional event funding. No CREDO budget is required.'
      : changeValue < 0
        ? 'Reduced event funding. No CREDO budget is required.'
        : 'Enter additional funding or a reduction. No CREDO budget is required.';
  }
}

function buildTrendsExplorerSummary(totals) {
  const change = totals.change;
  if (change === 0) {
    return 'Enter a funding change to estimate how many completed events and participant engagements that gain or loss could represent at historical delivery rates.';
  }
  const direction = change > 0 ? 'additional funding' : 'funding reduction';
  const eventsText = formatTrendsExplorerSignedCount(totals.estimatedEvents, 'completed event', 'completed events');
  if (totals.estimatedReach == null) {
    return `Based on assigned programs, ${formatTrendsExplorerSignedCurrency(change)} in ${direction} could mean approximately ${eventsText} at observed historical delivery rates. Participant impact is unavailable for the assigned programs.`;
  }
  const reachText = formatTrendsExplorerSignedCount(
    totals.estimatedReach,
    'participant engagement',
    'participant engagements'
  );
  if (totals.reachIncomplete > 0) {
    const programUnit = totals.reachIncomplete === 1 ? 'program' : 'programs';
    return `Based on assigned programs, ${formatTrendsExplorerSignedCurrency(change)} in ${direction} could mean approximately ${eventsText} and ${reachText} at observed historical delivery rates. Participant impact excludes ${totals.reachIncomplete} ${programUnit} without historical participant data.`;
  }
  return `Based on assigned programs, ${formatTrendsExplorerSignedCurrency(change)} in ${direction} could mean approximately ${eventsText} and ${reachText} at observed historical delivery rates.`;
}

function setTrendsExplorerMetricValue(el, text, value) {
  if (!el) return;
  el.textContent = text;
  const metric = el.closest('.trends-explorer-metric');
  if (!metric) return;
  metric.classList.remove('is-positive', 'is-negative');
  const signClass = getTrendsExplorerSignClass(value);
  if (signClass) metric.classList.add(signClass);
}

function renderTrendsExplorerBalance(totals) {
  const el = document.getElementById('trends-explorer-balance');
  if (!el) return;
  el.replaceChildren();
  const change = totals.change;
  const items = [];
  if (change > 0) {
    items.push(['Additional Funding', formatTrendsExplorerSignedCurrency(change)]);
    items.push(['Assigned', formatTrendsExplorerCurrency(totals.assignedTotal)]);
    items.push(['Still Available', formatTrendsExplorerCurrency(totals.unassigned)]);
  } else if (change < 0) {
    items.push(['Funding Reduction', formatTrendsExplorerSignedCurrency(change)]);
    items.push(['Assigned Reduction', formatTrendsExplorerSignedCurrency(totals.assignedTotal)]);
    items.push(['Reduction Still to Assign', formatTrendsExplorerSignedCurrency(totals.unassigned)]);
  } else {
    items.push(['Funding Change', '$0']);
    items.push(['Assigned', '$0']);
    items.push(['Still Available', '$0']);
  }

  items.forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'trends-explorer-balance-item';
    const labelEl = document.createElement('span');
    labelEl.className = 'trends-explorer-balance-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'trends-explorer-balance-value';
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    el.append(item);
  });
}

function formatTrendsExplorerProgramHistory(assumptions) {
  const costText = assumptions.avgCostPerEvent != null && Number.isFinite(assumptions.avgCostPerEvent)
    ? formatTotalRecordedEventCost(assumptions.avgCostPerEvent)
    : '—';
  const reachText = assumptions.avgParticipantsPerEvent != null && Number.isFinite(assumptions.avgParticipantsPerEvent)
    ? Math.round(assumptions.avgParticipantsPerEvent * 10) / 10
    : '—';
  const reachDisplay = typeof reachText === 'number'
    ? (Number.isInteger(reachText) ? String(reachText) : reachText.toFixed(1))
    : reachText;
  return `${costText}/event · ${reachDisplay} participants/event`;
}

function formatTrendsExplorerResidual(row) {
  const residual = row.impact.residual;
  if (!row.program.estimable || !residual || residual === 0) return '';
  const absText = formatTrendsExplorerCurrencyAuto(Math.abs(residual));
  return `${absText} below next whole event`;
}

function formatTrendsExplorerCompactSigned(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const normalized = Math.round(value);
  if (normalized === 0) return '0';
  const amount = Math.abs(normalized).toLocaleString('en-US');
  return `≈ ${normalized > 0 ? '+' : '-'}${amount}`;
}

function getTrendsExplorerProgramSliderBounds(row, totals) {
  const bounds = getTrendsExplorerAssignmentBounds(
    totals.change,
    Object.fromEntries(totals.rows.map((entry) => [entry.program.key, entry.assigned])),
    totals.rows.map((entry) => entry.program),
    row.program.key
  );
  return bounds;
}

function updateTrendsExplorerProgramRow(rowEl, row, totals) {
  const dollarsEl = rowEl.querySelector('[data-explorer-dollars]');
  const percentEl = rowEl.querySelector('[data-explorer-percent]');
  const eventsEl = rowEl.querySelector('[data-explorer-events]');
  const reachEl = rowEl.querySelector('[data-explorer-reach]');
  const residualEl = rowEl.querySelector('[data-explorer-residual]');
  const input = rowEl.querySelector('[data-explorer-amount-input]');
  const slider = rowEl.querySelector('[data-explorer-amount-slider]');
  const signClass = getTrendsExplorerSignClass(row.assigned);

  if (dollarsEl) {
    dollarsEl.textContent = formatTrendsExplorerSignedCurrency(row.assigned);
    dollarsEl.classList.remove('is-positive', 'is-negative');
    if (signClass) dollarsEl.classList.add(signClass);
  }
  if (percentEl) {
    if (totals.change !== 0 && row.program.estimable) {
      const pct = Math.round((row.assigned / totals.change) * 100);
      percentEl.textContent = `${pct}% of funding change`;
      percentEl.hidden = false;
    } else {
      percentEl.textContent = '';
      percentEl.hidden = true;
    }
  }
  if (eventsEl) {
    eventsEl.textContent = row.impact.estimatedEvents == null
      ? '—'
      : formatTrendsExplorerCompactSigned(row.impact.estimatedEvents);
    eventsEl.classList.remove('is-positive', 'is-negative');
    if (row.impact.estimatedEvents) {
      const eventClass = getTrendsExplorerSignClass(row.impact.estimatedEvents);
      if (eventClass) eventsEl.classList.add(eventClass);
    }
  }
  if (reachEl) {
    if (row.impact.estimatedReach == null) {
      reachEl.textContent = row.program.estimable ? '—' : '—';
    } else {
      reachEl.textContent = formatTrendsExplorerCompactSigned(row.impact.estimatedReach);
    }
    reachEl.classList.remove('is-positive', 'is-negative');
    if (row.impact.estimatedReach) {
      const reachClass = getTrendsExplorerSignClass(row.impact.estimatedReach);
      if (reachClass) reachEl.classList.add(reachClass);
    }
  }
  const reachNoteEl = rowEl.querySelector('[data-explorer-reach-note]');
  if (reachNoteEl) {
    const missingReach = row.program.estimable && row.impact.estimatedReach == null;
    reachNoteEl.textContent = missingReach ? 'unavailable' : '';
    reachNoteEl.hidden = !missingReach;
  }
  if (residualEl) {
    const residualText = formatTrendsExplorerResidual(row);
    residualEl.textContent = residualText;
    residualEl.hidden = !residualText;
  }

  const bounds = getTrendsExplorerProgramSliderBounds(row, totals);
  const disabled = totals.change === 0 || !row.program.estimable;
  if (input && document.activeElement !== input) {
    input.value = formatTrendsExplorerSignedCurrency(row.assigned);
    input.disabled = disabled;
  }
  if (slider) {
    slider.min = String(bounds.min);
    slider.max = String(bounds.max);
    slider.step = '1';
    slider.value = String(row.assigned);
    slider.disabled = disabled || bounds.min === bounds.max;
    slider.setAttribute('aria-valuemin', String(bounds.min));
    slider.setAttribute('aria-valuemax', String(bounds.max));
    slider.setAttribute('aria-valuenow', String(row.assigned));
    slider.setAttribute('aria-valuetext', formatTrendsExplorerSignedCurrency(row.assigned));
  }
}

function buildTrendsExplorerProgramCell(label) {
  const cell = document.createElement('div');
  cell.className = 'trends-explorer-program-cell';
  cell.dataset.label = label;
  return cell;
}

function buildTrendsExplorerProgramRow(row, totals) {
  const rowEl = document.createElement('div');
  rowEl.className = 'trends-explorer-program-row';
  rowEl.dataset.explorerProgramRow = row.program.key;
  rowEl.dataset.explorerCompact = '1';

  const programCell = buildTrendsExplorerProgramCell('Program');
  const nameEl = document.createElement('div');
  nameEl.className = 'trends-explorer-program-name';
  nameEl.textContent = row.program.label;
  programCell.append(nameEl);
  if (row.program.estimable) {
    const historyEl = document.createElement('p');
    historyEl.className = 'trends-explorer-program-history';
    historyEl.textContent = formatTrendsExplorerProgramHistory(row.program.assumptions);
    programCell.append(historyEl);
  } else {
    const insufficient = document.createElement('p');
    insufficient.className = 'trends-explorer-program-insufficient';
    insufficient.textContent = 'Insufficient recorded cost history';
    programCell.append(insufficient);
    rowEl.classList.add('is-insufficient');
  }

  const fundingCell = buildTrendsExplorerProgramCell('Funding Impact');
  const dollarsEl = document.createElement('div');
  dollarsEl.className = 'trends-explorer-program-dollars';
  dollarsEl.dataset.explorerDollars = '';
  const percentEl = document.createElement('div');
  percentEl.className = 'trends-explorer-program-percent';
  percentEl.dataset.explorerPercent = '';
  fundingCell.append(dollarsEl, percentEl);

  const eventsCell = buildTrendsExplorerProgramCell('Event Impact');
  const eventsEl = document.createElement('div');
  eventsEl.className = 'trends-explorer-program-result';
  eventsEl.dataset.explorerEvents = '';
  const eventsUnit = document.createElement('div');
  eventsUnit.className = 'trends-explorer-program-unit';
  eventsUnit.textContent = 'events';
  const residualEl = document.createElement('p');
  residualEl.className = 'trends-explorer-program-residual';
  residualEl.dataset.explorerResidual = '';
  eventsCell.append(eventsEl, eventsUnit, residualEl);

  const reachCell = buildTrendsExplorerProgramCell('Participant Impact');
  const reachEl = document.createElement('div');
  reachEl.className = 'trends-explorer-program-result';
  reachEl.dataset.explorerReach = '';
  const reachUnit = document.createElement('div');
  reachUnit.className = 'trends-explorer-program-unit';
  reachUnit.textContent = 'participants';
  const reachNoteEl = document.createElement('p');
  reachNoteEl.className = 'trends-explorer-program-residual';
  reachNoteEl.dataset.explorerReachNote = '';
  reachCell.append(reachEl, reachUnit, reachNoteEl);

  const adjustCell = buildTrendsExplorerProgramCell('Adjust');
  adjustCell.classList.add('trends-explorer-program-controls');
  if (row.program.estimable) {
    const inputId = `trends-explorer-program-input-${row.program.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const sliderId = `trends-explorer-program-slider-${row.program.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const inputLabel = document.createElement('label');
    inputLabel.className = 'visually-hidden';
    inputLabel.setAttribute('for', inputId);
    inputLabel.textContent = `${row.program.label} funding impact`;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = inputId;
    input.className = 'reports-input trends-explorer-program-input';
    input.dataset.explorerAmountInput = '';
    input.dataset.explorerProgram = row.program.key;
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const sliderLabel = document.createElement('label');
    sliderLabel.className = 'visually-hidden';
    sliderLabel.setAttribute('for', sliderId);
    sliderLabel.textContent = `${row.program.label} funding impact slider`;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = sliderId;
    slider.className = 'trends-explorer-program-slider';
    slider.dataset.explorerAmountSlider = '';
    slider.dataset.explorerProgram = row.program.key;
    adjustCell.append(inputLabel, input, sliderLabel, slider);
  }

  rowEl.append(programCell, fundingCell, eventsCell, reachCell, adjustCell);
  updateTrendsExplorerProgramRow(rowEl, row, totals);
  return rowEl;
}

function renderTrendsExplorerPrograms(totals) {
  const section = document.getElementById('trends-explorer-programs');
  const rowsEl = document.getElementById('trends-explorer-program-rows');
  if (!section || !rowsEl) return;

  if (!totals.rows.length) {
    section.hidden = true;
    rowsEl.replaceChildren();
    return;
  }

  section.hidden = false;
  renderTrendsExplorerBalance(totals);

  const existingRows = [...rowsEl.children];
  const existingKeys = existingRows.map((rowEl) => rowEl.dataset.explorerProgramRow);
  const nextKeys = totals.rows.map((row) => row.program.key);
  const canReuse = existingKeys.length === nextKeys.length
    && nextKeys.every((key, index) => existingKeys[index] === key)
    && existingRows.every((rowEl) => rowEl.dataset.explorerCompact === '1');

  if (!canReuse) {
    rowsEl.replaceChildren();
    totals.rows.forEach((row) => {
      rowsEl.append(buildTrendsExplorerProgramRow(row, totals));
    });
  } else {
    existingRows.forEach((rowEl, index) => {
      updateTrendsExplorerProgramRow(rowEl, totals.rows[index], totals);
    });
  }
}

function renderTrendsExplorerOutputs() {
  const eventsEl = document.getElementById('trends-explorer-events-value');
  const reachEl = document.getElementById('trends-explorer-reach-value');
  const fundingEl = document.getElementById('trends-explorer-funding-value');
  const kickerEl = document.getElementById('trends-explorer-funding-kicker');
  const spendEl = document.getElementById('trends-explorer-spend');
  const reachNoteEl = document.getElementById('trends-explorer-reach-note');
  const summaryEl = document.getElementById('trends-explorer-summary');
  const state = trendsExplorerViewState;
  if (!eventsEl || !reachEl || !fundingEl || !spendEl || !summaryEl || !state) return;

  const totals = calculateTrendsExplorerImpactTotals(
    state.change,
    state.programs || [],
    state.assignments || {}
  );

  if (kickerEl) kickerEl.textContent = getTrendsExplorerChangeLabel(totals.change);
  setTrendsExplorerMetricValue(fundingEl, formatTrendsExplorerSignedCurrency(totals.change), totals.change);
  setTrendsExplorerMetricValue(
    eventsEl,
    `≈ ${formatTrendsExplorerSignedCount(totals.estimatedEvents, 'Event', 'Events')}`,
    totals.estimatedEvents
  );
  if (totals.estimatedReach == null) {
    setTrendsExplorerMetricValue(reachEl, '—', 0);
  } else {
    const reachText = totals.reachIncomplete > 0
      ? `≈ ${formatTrendsExplorerSignedCount(totals.estimatedReach, 'Participant Engagement', 'Participant Engagements')}+`
      : `≈ ${formatTrendsExplorerSignedCount(totals.estimatedReach, 'Participant Engagement', 'Participant Engagements')}`;
    setTrendsExplorerMetricValue(reachEl, reachText, totals.estimatedReach);
  }

  if (Math.abs(totals.residual) >= 0.005 && totals.change !== 0) {
    spendEl.textContent = `Assigned dollars that do not cover another complete historical-average event: ${formatTrendsExplorerSignedCurrency(totals.residual)}.`;
    spendEl.hidden = false;
  } else {
    spendEl.textContent = '';
    spendEl.hidden = true;
  }

  if (reachNoteEl) {
    if (totals.reachIncomplete > 0 && totals.estimatedReach != null) {
      const programUnit = totals.reachIncomplete === 1 ? 'program' : 'programs';
      reachNoteEl.textContent = `Participant impact excludes ${totals.reachIncomplete} ${programUnit} without historical participant data.`;
      reachNoteEl.hidden = false;
    } else {
      reachNoteEl.textContent = '';
      reachNoteEl.hidden = true;
    }
  }

  summaryEl.textContent = buildTrendsExplorerSummary(totals);
  summaryEl.hidden = false;
  renderTrendsExplorerPrograms(totals);

  const balanceItems = [];
  if (totals.change > 0) {
    balanceItems.push(['Additional Funding', formatTrendsExplorerSignedCurrency(totals.change)]);
    balanceItems.push(['Assigned', formatTrendsExplorerCurrency(totals.assignedTotal)]);
    balanceItems.push(['Still Available', formatTrendsExplorerCurrency(totals.unassigned)]);
  } else if (totals.change < 0) {
    balanceItems.push(['Funding Reduction', formatTrendsExplorerSignedCurrency(totals.change)]);
    balanceItems.push(['Assigned Reduction', formatTrendsExplorerSignedCurrency(totals.assignedTotal)]);
    balanceItems.push(['Reduction Still to Assign', formatTrendsExplorerSignedCurrency(totals.unassigned)]);
  } else {
    balanceItems.push(['Funding Change', '$0']);
    balanceItems.push(['Assigned', '$0']);
    balanceItems.push(['Still Available', '$0']);
  }

  const methodEl = document.querySelector('#trends-explorer-method p');
  trendsExplorerReportSnapshot = {
    emptyMessage: '',
    basisLabel: formatTrendsProjectionRange(state.basis),
    scenarioLabel: getTrendsExplorerChangeLabel(totals.change),
    fundingChangeText: formatTrendsExplorerSignedCurrency(totals.change),
    balanceItems,
    impactKpis: [
      {
        label: 'Funding Change',
        value: formatTrendsExplorerSignedCurrency(totals.change),
        comparisonText: '',
        comparisonDirection: 'neutral',
      },
      {
        label: 'Estimated Event Impact',
        value: `≈ ${formatTrendsExplorerSignedCount(totals.estimatedEvents, 'Event', 'Events')}`,
        comparisonText: '',
        comparisonDirection: 'neutral',
      },
      {
        label: 'Estimated Participant Impact',
        value: totals.estimatedReach == null
          ? '—'
          : (totals.reachIncomplete > 0
            ? `≈ ${formatTrendsExplorerSignedCount(totals.estimatedReach, 'Participant Engagement', 'Participant Engagements')}+`
            : `≈ ${formatTrendsExplorerSignedCount(totals.estimatedReach, 'Participant Engagement', 'Participant Engagements')}`),
        comparisonText: '',
        comparisonDirection: 'neutral',
      },
    ],
    spendNote: spendEl.hidden ? '' : spendEl.textContent,
    reachNote: reachNoteEl?.hidden ? '' : (reachNoteEl?.textContent || ''),
    summary: summaryEl.textContent,
    programs: totals.rows.map((row) => ({
      label: row.program.label,
      estimable: Boolean(row.program.estimable),
      historyText: row.program.estimable
        ? formatTrendsExplorerProgramHistory(row.program.assumptions)
        : 'Insufficient recorded cost history',
      fundingText: formatTrendsExplorerSignedCurrency(row.assigned),
      eventsText: row.impact.estimatedEvents == null
        ? '—'
        : formatTrendsExplorerCompactSigned(row.impact.estimatedEvents),
      reachText: row.impact.estimatedReach == null
        ? (row.program.estimable ? 'unavailable' : '—')
        : formatTrendsExplorerCompactSigned(row.impact.estimatedReach),
      residualText: formatTrendsExplorerResidual(row),
      avgCostPerEvent: row.program.assumptions?.avgCostPerEvent ?? null,
      avgParticipantsPerEvent: row.program.assumptions?.avgParticipantsPerEvent ?? null,
    })),
    assumptions: [
      ['Historical Basis', formatTrendsProjectionRange(state.basis)],
      ['Completed Events', String(state.assumptions.completedEvents)],
      ['Recorded Event Cost', formatTotalRecordedEventCost(state.assumptions.recordedCost)],
      ['Avg Cost / Event', state.assumptions.avgCostPerEvent != null && Number.isFinite(state.assumptions.avgCostPerEvent)
        ? formatTotalRecordedEventCost(state.assumptions.avgCostPerEvent)
        : '—'],
      ['Avg Participants / Event', state.assumptions.avgParticipantsPerEvent != null && Number.isFinite(state.assumptions.avgParticipantsPerEvent)
        ? state.assumptions.avgParticipantsPerEvent.toFixed(1)
        : '—'],
      ...(state.assumptions.avgCostPerParticipant != null && Number.isFinite(state.assumptions.avgCostPerParticipant)
        ? [['Avg Cost / Participant', formatTotalRecordedEventCost(state.assumptions.avgCostPerParticipant)]]
        : []),
    ],
    methodText: methodEl?.textContent || 'Impact Explorer estimates how a hypothetical funding change could affect completed events and participant engagements using recorded historical CREDO event costs and delivery rates from the previous 12 months. It does not use or require a CREDO budget, and it does not model command impact.',
  };
}

function applyTrendsExplorerProgramAssignment(programKey, requestedAmount) {
  const state = trendsExplorerViewState;
  if (!state?.programs?.length || !programKey) return;
  const program = state.programs.find((entry) => entry.key === programKey);
  if (!program?.estimable) return;

  const nextValue = clampTrendsExplorerProgramAssignment(
    state.change,
    state.assignments || {},
    state.programs,
    programKey,
    requestedAmount
  );
  const requested = normalizeTrendsExplorerChange(requestedAmount);
  if (requested !== nextValue) {
    if (state.change > 0) {
      const stillAvailable = Math.max(
        0,
        state.change - sumTrendsExplorerAssignments(state.assignments || {}, state.programs)
      );
      setTrendsExplorerConstraint(
        stillAvailable === 0
          ? 'No additional funding is still available. Reduce another program first.'
          : `Only ${formatTrendsExplorerCurrency(stillAvailable)} is still available.`
      );
    } else if (state.change < 0) {
      setTrendsExplorerConstraint(
        'Assigned reduction cannot exceed the requested funding reduction.'
      );
    } else {
      setTrendsExplorerConstraint('');
    }
  } else {
    setTrendsExplorerConstraint('');
  }

  const nextAssignments = { ...(state.assignments || {}) };
  nextAssignments[programKey] = nextValue;
  trendsExplorerAssignments = nextAssignments;
  state.assignments = nextAssignments;
  renderTrendsExplorerOutputs();
}

function resetTrendsExplorerScenario() {
  const state = trendsExplorerViewState;
  if (!state) return;
  const historical = getTrendsExplorerHistoricalAssignments(state.programs || [], state.change);
  trendsExplorerAssignments = historical;
  state.assignments = historical;
  setTrendsExplorerConstraint('');
  renderTrendsExplorerOutputs();
}

function renderTrendsExplorerAssumptions(range, assumptions) {
  const basisEl = document.getElementById('trends-explorer-assumption-basis');
  const eventsEl = document.getElementById('trends-explorer-assumption-events');
  const costEl = document.getElementById('trends-explorer-assumption-cost');
  const costEventEl = document.getElementById('trends-explorer-assumption-cost-event');
  const reachEventEl = document.getElementById('trends-explorer-assumption-reach-event');
  const costParticipantRow = document.getElementById('trends-explorer-assumption-cost-participant-row');
  const costParticipantEl = document.getElementById('trends-explorer-assumption-cost-participant');
  if (!basisEl || !eventsEl || !costEl || !costEventEl || !reachEventEl || !costParticipantRow || !costParticipantEl) {
    return;
  }

  basisEl.textContent = formatTrendsProjectionRange(range);
  eventsEl.textContent = String(assumptions.completedEvents);
  costEl.textContent = formatTotalRecordedEventCost(assumptions.recordedCost);
  costEventEl.textContent = assumptions.avgCostPerEvent != null && Number.isFinite(assumptions.avgCostPerEvent)
    ? formatTotalRecordedEventCost(assumptions.avgCostPerEvent)
    : '—';
  reachEventEl.textContent = assumptions.avgParticipantsPerEvent != null && Number.isFinite(assumptions.avgParticipantsPerEvent)
    ? assumptions.avgParticipantsPerEvent.toFixed(1)
    : '—';

  if (assumptions.avgCostPerParticipant != null && Number.isFinite(assumptions.avgCostPerParticipant)) {
    costParticipantEl.textContent = formatTotalRecordedEventCost(assumptions.avgCostPerParticipant);
    costParticipantRow.hidden = false;
  } else {
    costParticipantEl.textContent = '—';
    costParticipantRow.hidden = true;
  }
}

function showTrendsExplorerEmpty(message) {
  const empty = document.getElementById('trends-explorer-empty');
  const body = document.getElementById('trends-explorer-body');
  const programs = document.getElementById('trends-explorer-programs');
  trendsExplorerViewState = null;
  setTrendsExplorerConstraint('');
  if (programs) programs.hidden = true;
  if (body) body.hidden = true;
  if (empty) {
    empty.textContent = message;
    empty.hidden = false;
  }
  trendsExplorerReportSnapshot = {
    emptyMessage: message,
  };
}

function renderTrendsExplorerSection(filters) {
  const empty = document.getElementById('trends-explorer-empty');
  const body = document.getElementById('trends-explorer-body');
  if (!empty || !body) return;

  const basis = getTrendsExplorerBasisRange(new Date());
  const basisEvents = getTrendsEventsForRange(basis, filters);

  if (!basisEvents.length) {
    showTrendsExplorerEmpty('No finalized historical data is available to calculate an Impact Explorer scenario.');
    return;
  }

  const eligibleEvents = getTrendsExplorerEligibleEvents(basisEvents);
  if (!eligibleEvents.length) {
    showTrendsExplorerEmpty('No recorded historical event cost is available to calculate an Impact Explorer scenario.');
    return;
  }

  const assumptions = calculateTrendsExplorerAssumptions(eligibleEvents);
  if (!(assumptions.avgCostPerEvent > 0) || !Number.isFinite(assumptions.avgCostPerEvent)) {
    showTrendsExplorerEmpty('No recorded historical event cost is available to calculate an Impact Explorer scenario.');
    return;
  }

  empty.hidden = true;
  empty.textContent = '';
  body.hidden = false;

  const change = trendsExplorerUserChange != null ? trendsExplorerUserChange : 0;
  const defaultMax = Math.max(getTrendsExplorerCleanMax(assumptions.recordedCost * 2), 100000);
  if (trendsExplorerUserChange == null) {
    trendsExplorerSliderMax = defaultMax;
  }
  trendsExplorerSliderMax = resolveTrendsExplorerSliderMax(
    assumptions.recordedCost,
    change,
    trendsExplorerSliderMax
  );

  const programs = aggregateTrendsExplorerPrograms(basisEvents);
  const assignments = resolveTrendsExplorerAssignments(programs, change, trendsExplorerAssignments);
  trendsExplorerAssignments = assignments;

  trendsExplorerViewState = {
    basis,
    assumptions,
    change,
    programs,
    assignments,
  };
  renderTrendsExplorerAssumptions(basis, assumptions);
  updateTrendsExplorerControls(change, trendsExplorerSliderMax);
  renderTrendsExplorerOutputs();
}

function renderTrends() {
  if (!document.getElementById('view-trends')) return;

  populateTrendsFilterOptions();
  updateTrendsCustomDateFields();

  const currentRange = getTrendsCurrentRange();
  const filters = getTrendsFilterState();
  const compareMode = getTrendsCompareMode();
  const period = getTrendsPeriodValue();
  const currentEvents = getTrendsEventsForRange(currentRange, filters);
  const currentMetrics = calculateTrendsMetrics(currentEvents);
  const comparisonRanges = (compareMode !== TRENDS_COMPARE_NONE && currentRange)
    ? getTrendsComparisonRanges(currentRange, period, compareMode)
    : [];

  let comparison = null;
  let historicalMetrics = [];
  if (compareMode !== TRENDS_COMPARE_NONE && currentRange) {
    historicalMetrics = comparisonRanges.map((range) => (
      calculateTrendsMetrics(getTrendsEventsForRange(range, filters))
    ));
    const baselineMetrics = historicalMetrics.length === 1
      ? historicalMetrics[0]
      : averageTrendsMetrics(historicalMetrics);
    comparison = buildTrendsComparison(currentMetrics, baselineMetrics, compareMode);
  }

  renderTrendsComparisonExplainer(period, compareMode, currentRange, comparisonRanges);
  renderTrendsKpis(currentMetrics, comparison);
  renderTrendsChartSection(currentRange, currentEvents, period);
  renderTrendsDemandSection(currentEvents, compareMode, comparisonRanges, filters);
  renderTrendsReachSection(currentEvents, compareMode, comparisonRanges, filters);
  renderTrendsResourceSection(
    currentEvents,
    currentMetrics,
    compareMode,
    comparisonRanges,
    filters,
    historicalMetrics
  );
  renderTrendsExplorerSection(filters);

  const emptyMessage = document.getElementById('trends-empty-message');
  if (emptyMessage) {
    emptyMessage.hidden = currentEvents.length > 0;
  }
}

function setupTrends() {
  const period = document.getElementById('trends-period');
  if (!period) return;

  period.addEventListener('change', () => {
    updateTrendsCustomDateFields();
    renderTrends();
  });

  [
    'trends-event-type',
    'trends-command',
    'trends-start-date',
    'trends-end-date',
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', renderTrends);
  });

  document.getElementById('trends-compare')?.addEventListener('change', () => {
    const selection = getTrendsOutlookSelection();
    if (selection.mode === 'multi') {
      trendsOutlookMultiCompareEnabled = getTrendsCompareMode() !== TRENDS_COMPARE_NONE;
    }
    renderTrends();
  });

  const rerenderTrendsChart = () => {
    const currentRange = getTrendsCurrentRange();
    const currentEvents = getTrendsEventsForRange(currentRange, getTrendsFilterState());
    renderTrendsChartSection(currentRange, currentEvents, getTrendsPeriodValue());
  };

  document.getElementById('trends-chart-metric')?.addEventListener('change', rerenderTrendsChart);
  document.getElementById('trends-chart-show-projection')?.addEventListener('change', rerenderTrendsChart);
  document.getElementById('trends-chart-projection-horizon')?.addEventListener('change', rerenderTrendsChart);
  document.getElementById('trends-outlook-export-btn')?.addEventListener('click', () => {
    exportTrendsOutlookReport();
  });
  document.getElementById('trends-demand-export-btn')?.addEventListener('click', () => {
    runTrendsSectionExport(
      document.getElementById('trends-demand-export-btn'),
      exportTrendsDemandReport
    );
  });
  document.getElementById('trends-reach-export-btn')?.addEventListener('click', () => {
    runTrendsSectionExport(
      document.getElementById('trends-reach-export-btn'),
      exportTrendsReachReport
    );
  });
  document.getElementById('trends-resource-export-btn')?.addEventListener('click', () => {
    runTrendsSectionExport(
      document.getElementById('trends-resource-export-btn'),
      exportTrendsResourceReport
    );
  });
  document.getElementById('trends-explorer-export-btn')?.addEventListener('click', () => {
    runTrendsSectionExport(
      document.getElementById('trends-explorer-export-btn'),
      exportTrendsExplorerReport
    );
  });

  document.getElementById('trends-demand-metric')?.addEventListener('change', () => {
    const { currentEvents, compareMode, comparisonRanges, filters } = getTrendsBreakdownRenderArgs();
    renderTrendsDemandSection(currentEvents, compareMode, comparisonRanges, filters);
  });

  document.getElementById('trends-reach-metric')?.addEventListener('change', () => {
    const { currentEvents, compareMode, comparisonRanges, filters } = getTrendsBreakdownRenderArgs();
    renderTrendsReachSection(currentEvents, compareMode, comparisonRanges, filters);
  });

  document.getElementById('trends-demand-toggle')?.addEventListener('click', () => {
    trendsDemandExpanded = !trendsDemandExpanded;
    const { currentEvents, compareMode, comparisonRanges, filters } = getTrendsBreakdownRenderArgs();
    renderTrendsDemandSection(currentEvents, compareMode, comparisonRanges, filters);
  });

  document.getElementById('trends-reach-toggle')?.addEventListener('click', () => {
    trendsReachExpanded = !trendsReachExpanded;
    const { currentEvents, compareMode, comparisonRanges, filters } = getTrendsBreakdownRenderArgs();
    renderTrendsReachSection(currentEvents, compareMode, comparisonRanges, filters);
  });

  document.getElementById('trends-spending-toggle')?.addEventListener('click', () => {
    trendsSpendingExpanded = !trendsSpendingExpanded;
    const { currentEvents, compareMode, comparisonRanges, filters } = getTrendsBreakdownRenderArgs();
    const currentMetrics = calculateTrendsMetrics(currentEvents);
    const historicalMetrics = (compareMode !== TRENDS_COMPARE_NONE)
      ? comparisonRanges.map((range) => calculateTrendsMetrics(getTrendsEventsForRange(range, filters)))
      : [];
    renderTrendsResourceSection(
      currentEvents,
      currentMetrics,
      compareMode,
      comparisonRanges,
      filters,
      historicalMetrics
    );
  });

  document.getElementById('trends-cost-details-toggle')?.addEventListener('click', () => {
    trendsCostDetailsExpanded = !trendsCostDetailsExpanded;
    const { currentEvents } = getTrendsBreakdownRenderArgs();
    renderTrendsCostDetails(aggregateTrendsSpendingByEventType(currentEvents));
  });

  document.getElementById('trends-explorer-funding-slider')?.addEventListener('input', () => {
    const slider = document.getElementById('trends-explorer-funding-slider');
    const parsed = parseTrendsExplorerChange(slider?.value);
    if (parsed == null) return;
    applyTrendsExplorerChange(parsed, { fromUser: true });
  });

  const explorerInput = document.getElementById('trends-explorer-funding-input');
  explorerInput?.addEventListener('input', () => {
    const parsed = parseTrendsExplorerChange(explorerInput.value);
    if (parsed == null) return;
    applyTrendsExplorerChange(parsed, { fromUser: true });
  });
  explorerInput?.addEventListener('change', () => {
    const parsed = parseTrendsExplorerChange(explorerInput.value);
    if (parsed == null) {
      const fallback = trendsExplorerUserChange != null
        ? trendsExplorerUserChange
        : 0;
      explorerInput.value = formatTrendsExplorerSignedCurrency(fallback);
      return;
    }
    applyTrendsExplorerChange(parsed, { fromUser: true });
    explorerInput.value = formatTrendsExplorerSignedCurrency(parsed);
  });
  explorerInput?.addEventListener('blur', () => {
    const parsed = parseTrendsExplorerChange(explorerInput.value);
    const fallback = parsed != null
      ? parsed
      : (trendsExplorerUserChange != null ? trendsExplorerUserChange : 0);
    if (parsed != null) applyTrendsExplorerChange(parsed, { fromUser: true });
    explorerInput.value = formatTrendsExplorerSignedCurrency(fallback);
  });

  const programRows = document.getElementById('trends-explorer-program-rows');
  programRows?.addEventListener('input', (event) => {
    const slider = event.target.closest('[data-explorer-amount-slider]');
    if (slider) {
      const parsed = parseTrendsExplorerChange(slider.value);
      if (parsed == null) return;
      applyTrendsExplorerProgramAssignment(slider.dataset.explorerProgram, parsed);
      return;
    }
    const input = event.target.closest('[data-explorer-amount-input]');
    if (!input) return;
    const parsed = parseTrendsExplorerChange(input.value);
    if (parsed == null) return;
    applyTrendsExplorerProgramAssignment(input.dataset.explorerProgram, parsed);
  });
  programRows?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-explorer-amount-input]');
    if (!input) return;
    const parsed = parseTrendsExplorerChange(input.value);
    const current = trendsExplorerViewState?.assignments?.[input.dataset.explorerProgram] || 0;
    if (parsed == null) {
      input.value = formatTrendsExplorerSignedCurrency(current);
      return;
    }
    applyTrendsExplorerProgramAssignment(input.dataset.explorerProgram, parsed);
    input.value = formatTrendsExplorerSignedCurrency(
      trendsExplorerViewState?.assignments?.[input.dataset.explorerProgram] || 0
    );
  });
  programRows?.addEventListener('blur', (event) => {
    const input = event.target.closest('[data-explorer-amount-input]');
    if (!input) return;
    const current = trendsExplorerViewState?.assignments?.[input.dataset.explorerProgram] || 0;
    input.value = formatTrendsExplorerSignedCurrency(current);
  }, true);

  document.getElementById('trends-explorer-programs-reset')?.addEventListener('click', () => {
    resetTrendsExplorerScenario();
  });

  const chartWrap = document.getElementById('trends-chart-svg-wrap');
  if (chartWrap && typeof ResizeObserver !== 'undefined') {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (currentView === 'trends') redrawTrendsChartSvg();
      });
    });
    observer.observe(chartWrap);
  }

  updateTrendsCustomDateFields();
}

const FINANCIALS_COST_CATEGORIES = [
  { key: 'venue', label: 'Venue', resolve: resolveTrendsVenueCost },
  { key: 'catering', label: 'Catering', resolve: resolveTrendsCateringCost },
  { key: 'lodging', label: 'Lodging', resolve: (event) => parseEventCostNumber(event.lodgingCost) },
  {
    key: 'transportation',
    label: 'Transportation',
    resolve: (event) => parseEventCostNumber(event.transportationCost),
  },
  { key: 'materials', label: 'Materials', resolve: (event) => parseEventCostNumber(event.materialsCost) },
  { key: 'other', label: 'Other', resolve: (event) => parseEventCostNumber(event.otherCost) },
];

const FINANCIALS_CATEGORY_COLORS = {
  venue: '#00205b',
  catering: '#345c3a',
  lodging: '#1a4a7a',
  transportation: '#4b5563',
  materials: '#6b5344',
  other: '#9ca3af',
};

let financialsVendorType = 'venues';
let financialsSelectedVendorKey = null;

function getFinancialsPeriodValue() {
  return document.getElementById('financials-period')?.value || 'this-fy';
}

function getFinancialsProgramValue() {
  return document.getElementById('financials-program')?.value || '';
}

function populateFinancialsProgramOptions() {
  populateTrendsSelect(
    document.getElementById('financials-program'),
    '<option value="">All Programs</option>',
    eventTypes
  );
}

function updateFinancialsCustomDateFields() {
  const isCustom = getFinancialsPeriodValue() === 'custom';
  const startField = document.getElementById('financials-start-field');
  const endField = document.getElementById('financials-end-field');
  const startInput = document.getElementById('financials-start-date');
  const endInput = document.getElementById('financials-end-date');
  if (startField) startField.hidden = !isCustom;
  if (endField) endField.hidden = !isCustom;
  if (startInput) startInput.disabled = !isCustom;
  if (endInput) endInput.disabled = !isCustom;
}

function getFinancialsCurrentRange() {
  const period = getFinancialsPeriodValue();
  const today = new Date();
  const todayIso = formatLocalIsoDate(today);
  const calendarYear = today.getFullYear();

  if (period === '12m') {
    return {
      start: formatLocalIsoDate(shiftLocalDateByMonths(today, -12)),
      end: todayIso,
    };
  }

  if (period === 'last-fy') {
    return getFiscalYearRange(getCurrentFiscalYearNumber(today) - 1);
  }

  if (period === 'calendar-year') {
    return getCalendarYearRange(calendarYear);
  }

  if (period === 'ytd') {
    const yearRange = getCalendarYearRange(calendarYear);
    return {
      start: yearRange.start,
      end: todayIso < yearRange.end ? todayIso : yearRange.end,
    };
  }

  if (period === 'custom') {
    const start = document.getElementById('financials-start-date')?.value || '';
    const end = document.getElementById('financials-end-date')?.value || '';
    if (!start || !end || start > end) return null;
    return { start, end };
  }

  const fyRange = getFiscalYearRange(getCurrentFiscalYearNumber(today));
  return {
    start: fyRange.start,
    end: todayIso < fyRange.end ? todayIso : fyRange.end,
  };
}

function getFinancialsEvents(range, program) {
  if (!range) return [];

  const todayIso = formatLocalIsoDate(new Date());
  const selectedProgram = program || '';

  return events.filter((event) => {
    if (!isAarFinalized(event)) return false;

    const isoDate = getTrendsEventDate(event);
    if (!isoDate) return false;
    if (isoDate > todayIso && getFinancialsPeriodValue() !== 'calendar-year') return false;
    if (!isDateInRange(isoDate, range.start, range.end)) return false;
    if (selectedProgram && event.eventType !== selectedProgram) return false;
    return true;
  });
}

function getFinancialsCategoryTotals(eventsForRange) {
  return FINANCIALS_COST_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    total: eventsForRange.reduce((sum, event) => sum + category.resolve(event), 0),
  }));
}

function formatFinancialsPercent(amount, total) {
  if (!(total > 0)) return '0.0%';
  return `${((amount / total) * 100).toFixed(1)}%`;
}

function getFinancialsLargestCategory(categories) {
  let largest = null;
  categories.forEach((category) => {
    if (!(category.total > 0)) return;
    if (!largest || category.total > largest.total) largest = category;
  });
  return largest;
}

function calculateFinancialsSummary(eventsForRange, categories) {
  const totalRecordedEventCost = eventsForRange.reduce(
    (sum, event) => sum + getTrendsEventRecordedCost(event),
    0
  );
  const eventsWithRecordedCosts = eventsForRange.filter(
    (event) => getTrendsEventRecordedCost(event) > 0
  ).length;
  const largestCategory = getFinancialsLargestCategory(categories);
  const averageRecordedCost = eventsWithRecordedCosts > 0
    ? totalRecordedEventCost / eventsWithRecordedCosts
    : null;

  return {
    totalRecordedEventCost,
    eventsWithRecordedCosts,
    largestCategory,
    averageRecordedCost,
  };
}

function getFinancialsEmptyMessage(range, eventsForRange, eventsWithRecordedCosts) {
  if (!range) {
    return 'Enter a valid custom start and end date to review recorded expenditures.';
  }
  if (eventsForRange.length === 0) {
    return 'No finalized After Action Reports match the selected period and program.';
  }
  if (eventsWithRecordedCosts === 0) {
    return 'No recorded event costs for the selected period and program.';
  }
  return '';
}

function renderFinancialsSummary(summary) {
  const grid = document.getElementById('financials-kpi-grid');
  if (!grid) return;

  const largestLabel = summary.largestCategory?.label || '—';
  const averageLabel = summary.averageRecordedCost == null
    ? '—'
    : formatTotalRecordedEventCost(summary.averageRecordedCost);

  grid.innerHTML = `
    <div class="financials-summary-metric is-primary">
      <div class="financials-summary-label">Total Recorded Spending</div>
      <div class="financials-summary-value">${formatTotalRecordedEventCost(summary.totalRecordedEventCost)}</div>
    </div>
    <div class="financials-summary-metric">
      <div class="financials-summary-label">Events With Recorded Costs</div>
      <div class="financials-summary-value">${summary.eventsWithRecordedCosts.toLocaleString('en-US')}</div>
    </div>
    <div class="financials-summary-metric">
      <div class="financials-summary-label">Average / Event</div>
      <div class="financials-summary-value">${averageLabel}</div>
    </div>
    <div class="financials-summary-metric">
      <div class="financials-summary-label">Largest Category</div>
      <div class="financials-summary-value">${largestLabel}</div>
    </div>`;
}

function getFinancialsCategoryColor(key) {
  return FINANCIALS_CATEGORY_COLORS[key] || '#9ca3af';
}

function getFinancialsRankedCategories(categories) {
  return [...categories].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.label.localeCompare(right.label, 'en', { sensitivity: 'base' });
  });
}

function renderFinancialsDonut(categories, total) {
  const mount = document.getElementById('financials-donut');
  if (!mount) return;

  const size = 220;
  const cx = 110;
  const cy = 110;
  const radius = 76;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;
  const ranked = getFinancialsRankedCategories(categories);
  const active = total > 0 ? ranked.filter((category) => category.total > 0) : [];
  const gap = active.length > 1 ? circumference * 0.012 : 0;
  let offset = 0;

  const segments = active.map((category) => {
    const length = (category.total / total) * circumference;
    const dash = Math.max(0, length - gap);
    const slice = {
      color: getFinancialsCategoryColor(category.key),
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -offset,
    };
    offset += length;
    return slice;
  });

  const segmentMarkup = segments
    .map((segment) => `
      <circle
        cx="${cx}"
        cy="${cy}"
        r="${radius}"
        fill="none"
        stroke="${segment.color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${segment.dasharray}"
        stroke-dashoffset="${segment.dashoffset}"
        transform="rotate(-90 ${cx} ${cy})"
      ></circle>`)
    .join('');

  mount.innerHTML = `
    <div class="financials-donut-visual">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Cost breakdown totaling ${formatTotalRecordedEventCost(total)}">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#eef2f7" stroke-width="${strokeWidth}"></circle>
        ${segmentMarkup}
      </svg>
      <div class="financials-donut-center">
        <div class="financials-donut-center-label">Total</div>
        <div class="financials-donut-center-value">${formatTotalRecordedEventCost(total)}</div>
      </div>
    </div>`;
}

function renderFinancialsCategoryList(categories, total) {
  const list = document.getElementById('financials-category-list');
  if (!list) return;

  list.innerHTML = getFinancialsRankedCategories(categories)
    .map((category) => {
      const zeroClass = category.total > 0 ? '' : ' is-zero';
      const color = getFinancialsCategoryColor(category.key);
      return `
        <div class="financials-category-row${zeroClass}">
          <span class="financials-category-swatch" style="background:${color}" aria-hidden="true"></span>
          <span class="financials-category-name">${category.label}</span>
          <span class="financials-category-amount">${formatTotalRecordedEventCost(category.total)}</span>
          <span class="financials-category-pct">${formatFinancialsPercent(category.total, total)}</span>
        </div>`;
    })
    .join('');
}

const FINANCIALS_UNSPECIFIED_VENUE_KEY = 'unspecified-venue';
const FINANCIALS_UNSPECIFIED_CATERER_KEY = 'unspecified-caterer';

function getFinancialsVendorType() {
  return financialsVendorType === 'caterers' ? 'caterers' : 'venues';
}

function setFinancialsVendorType(type) {
  const nextType = type === 'caterers' ? 'caterers' : 'venues';
  if (nextType !== financialsVendorType) {
    closeFinancialsVendorDetail();
  }
  financialsVendorType = nextType;
  updateFinancialsVendorTabs();
}

function updateFinancialsVendorTabs() {
  const selected = getFinancialsVendorType();
  document.querySelectorAll('#view-financials .financials-vendor-tab').forEach((tab) => {
    const isActive = tab.dataset.vendorType === selected;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function escapeFinancialsHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getFinancialsResolvedVendorName(event, type) {
  const raw = type === 'caterers'
    ? resolveAarCateringVendor(event)
    : resolveAarVenue(event);
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || isTbd(trimmed)) return '';
  return trimmed;
}

function getFinancialsVendorCostResolver(type) {
  return type === 'caterers' ? resolveTrendsCateringCost : resolveTrendsVenueCost;
}

function getFinancialsVendorGroupKey(event, type) {
  const name = getFinancialsResolvedVendorName(event, type);
  if (name === '') {
    return type === 'caterers'
      ? FINANCIALS_UNSPECIFIED_CATERER_KEY
      : FINANCIALS_UNSPECIFIED_VENUE_KEY;
  }
  return name.toLowerCase();
}

function getFinancialsVendorContributingEvents(eventsForRange, type, vendorKey) {
  const resolveCost = getFinancialsVendorCostResolver(type);
  return eventsForRange
    .map((event) => ({
      event,
      cost: resolveCost(event),
      isoDate: getTrendsEventDate(event) || '',
    }))
    .filter((row) => row.cost > 0 && getFinancialsVendorGroupKey(row.event, type) === vendorKey)
    .sort((left, right) => {
      if (right.isoDate !== left.isoDate) return right.isoDate.localeCompare(left.isoDate);
      return 0;
    });
}

function aggregateFinancialsVendorPrograms(contributing) {
  const grouped = new Map();
  contributing.forEach(({ event, cost }) => {
    const { key, label } = normalizeTrendsDemandEventType(event);
    const existing = grouped.get(key);
    if (existing) {
      existing.total += cost;
      existing.eventCount += 1;
      return;
    }
    grouped.set(key, {
      key,
      name: label,
      total: cost,
      eventCount: 1,
    });
  });

  return [...grouped.values()].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
  });
}

function aggregateFinancialsVendorCommands(contributing) {
  const grouped = new Map();
  contributing.forEach(({ event }) => {
    const command = getTrendsCommandKey(event);
    const key = command ? command.toLowerCase() : 'unspecified-command';
    const existing = grouped.get(key);
    if (existing) {
      existing.eventCount += 1;
      return;
    }
    grouped.set(key, {
      key,
      name: command || 'Unspecified Command',
      eventCount: 1,
    });
  });

  return [...grouped.values()].sort((left, right) => {
    if (right.eventCount !== left.eventCount) return right.eventCount - left.eventCount;
    return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
  });
}

function closeFinancialsVendorDetail() {
  financialsSelectedVendorKey = null;
  const panel = document.getElementById('financials-vendor-detail');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
}

function updateFinancialsVendorRowState() {
  document.querySelectorAll('#financials-vendor-list .financials-vendor-row').forEach((row) => {
    const selected = row.dataset.vendorKey === financialsSelectedVendorKey;
    row.classList.toggle('is-selected', selected);
    row.setAttribute('aria-expanded', selected ? 'true' : 'false');
  });
}

function renderFinancialsVendorDetail(vendor, contributing, type) {
  const panel = document.getElementById('financials-vendor-detail');
  if (!panel) return;

  if (!vendor) {
    closeFinancialsVendorDetail();
    return;
  }

  const isCaterer = type === 'caterers';
  const detailLabel = isCaterer ? 'Caterer Details' : 'Venue Details';
  const totalLabel = isCaterer ? 'Total Catering Spending' : 'Total Venue Spending';
  const averageLabel = isCaterer ? 'Average Catering Cost / Event' : 'Average Venue Cost / Event';
  const averageValue = vendor.eventCount > 0
    ? formatTotalRecordedEventCost(vendor.total / vendor.eventCount)
    : '—';
  const programs = aggregateFinancialsVendorPrograms(contributing);
  const commands = aggregateFinancialsVendorCommands(contributing);

  const programMarkup = programs.length
    ? programs.map((program) => {
      const eventLabel = program.eventCount === 1 ? 'event' : 'events';
      const average = program.eventCount > 0
        ? formatTotalRecordedEventCost(program.total / program.eventCount)
        : '—';
      return `
        <li class="financials-vendor-detail-item">
          <div class="financials-vendor-detail-item-name">${escapeFinancialsHtml(program.name)}</div>
          <div class="financials-vendor-detail-item-meta">${program.eventCount} ${eventLabel} · ${formatTotalRecordedEventCost(program.total)} total · ${average}/event</div>
        </li>`;
    }).join('')
    : '<li class="financials-vendor-detail-empty">No programs recorded for this vendor.</li>';

  const commandMarkup = commands.length
    ? commands.map((command) => {
      const eventLabel = command.eventCount === 1 ? 'event' : 'events';
      return `
        <li class="financials-vendor-detail-item">
          <div class="financials-vendor-detail-item-name">${escapeFinancialsHtml(command.name)}</div>
          <div class="financials-vendor-detail-item-meta">${command.eventCount} ${eventLabel}</div>
        </li>`;
    }).join('')
    : '<li class="financials-vendor-detail-empty">No commands recorded for this vendor.</li>';

  const eventMarkup = contributing.length
    ? contributing.map(({ event, cost }) => {
      const program = normalizeTrendsDemandEventType(event).label;
      const command = getTrendsCommandKey(event) || 'Unspecified Command';
      return `
        <tr>
          <td data-label="Date">${escapeFinancialsHtml(formatEventDateDisplay(event))}</td>
          <td data-label="Program">${escapeFinancialsHtml(program)}</td>
          <td data-label="Command">${escapeFinancialsHtml(command)}</td>
          <td data-label="Recorded Cost">${formatTotalRecordedEventCost(cost)}</td>
        </tr>`;
    }).join('')
    : '<tr><td colspan="4">No contributing events.</td></tr>';

  panel.hidden = false;
  panel.innerHTML = `
    <div class="financials-vendor-detail-header">
      <div>
        <h4 class="financials-vendor-detail-title">${escapeFinancialsHtml(vendor.name)}</h4>
        <p class="financials-vendor-detail-kicker">${detailLabel}</p>
      </div>
      <button type="button" class="financials-vendor-detail-close" id="financials-vendor-detail-close">Close</button>
    </div>
    <div class="financials-vendor-detail-metrics">
      <div class="financials-vendor-detail-metric">
        <div class="financials-vendor-detail-metric-label">${totalLabel}</div>
        <div class="financials-vendor-detail-metric-value">${formatTotalRecordedEventCost(vendor.total)}</div>
      </div>
      <div class="financials-vendor-detail-metric">
        <div class="financials-vendor-detail-metric-label">Total Events</div>
        <div class="financials-vendor-detail-metric-value">${vendor.eventCount.toLocaleString('en-US')}</div>
      </div>
      <div class="financials-vendor-detail-metric">
        <div class="financials-vendor-detail-metric-label">${averageLabel}</div>
        <div class="financials-vendor-detail-metric-value">${averageValue}</div>
      </div>
    </div>
    <div class="financials-vendor-detail-split">
      <section class="financials-vendor-detail-block" aria-label="Programs">
        <h5 class="financials-vendor-detail-heading">Programs</h5>
        <ul class="financials-vendor-detail-list">${programMarkup}</ul>
      </section>
      <section class="financials-vendor-detail-block" aria-label="Commands served">
        <h5 class="financials-vendor-detail-heading">Commands Served</h5>
        <ul class="financials-vendor-detail-list">${commandMarkup}</ul>
      </section>
    </div>
    <section class="financials-vendor-detail-block" aria-label="Contributing events">
      <h5 class="financials-vendor-detail-heading">Events</h5>
      <div class="financials-vendor-detail-table-wrap">
        <table class="financials-vendor-detail-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Program</th>
              <th>Command</th>
              <th>Recorded Cost</th>
            </tr>
          </thead>
          <tbody>${eventMarkup}</tbody>
        </table>
      </div>
    </section>`;

  document.getElementById('financials-vendor-detail-close')?.addEventListener('click', () => {
    closeFinancialsVendorDetail();
    updateFinancialsVendorRowState();
  });
}

function openFinancialsVendorDetail(vendorKey, eventsForRange, vendors, type) {
  const vendor = vendors.find((entry) => entry.key === vendorKey);
  if (!vendor) {
    closeFinancialsVendorDetail();
    updateFinancialsVendorRowState();
    return;
  }

  financialsSelectedVendorKey = vendor.key;
  const contributing = getFinancialsVendorContributingEvents(eventsForRange, type, vendor.key);
  renderFinancialsVendorDetail(vendor, contributing, type);
  updateFinancialsVendorRowState();
}

function aggregateFinancialsVendors(eventsForRange, type) {
  const resolveCost = getFinancialsVendorCostResolver(type);
  const unspecifiedKey = type === 'caterers'
    ? FINANCIALS_UNSPECIFIED_CATERER_KEY
    : FINANCIALS_UNSPECIFIED_VENUE_KEY;
  const unspecifiedLabel = type === 'caterers' ? 'Unspecified Caterer' : 'Unspecified Venue';
  const grouped = new Map();

  eventsForRange.forEach((event) => {
    const cost = resolveCost(event);
    if (!(cost > 0)) return;

    const name = getFinancialsResolvedVendorName(event, type);
    const unspecified = name === '';
    const key = unspecified ? unspecifiedKey : name.toLowerCase();
    const existing = grouped.get(key);

    if (existing) {
      existing.total += cost;
      existing.eventCount += 1;
      return;
    }

    grouped.set(key, {
      key,
      name: unspecified ? unspecifiedLabel : name,
      unspecified,
      total: cost,
      eventCount: 1,
    });
  });

  return [...grouped.values()]
    .filter((vendor) => vendor.total > 0)
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
    });
}

function getFinancialsVendorEmptyMessage(range, eventsForRange, type, vendors) {
  if (!range) {
    return 'Enter a valid custom start and end date to review recorded expenditures.';
  }
  if (eventsForRange.length === 0) {
    return 'No finalized After Action Reports match the selected period and program.';
  }
  if (vendors.length === 0) {
    return type === 'caterers'
      ? 'No recorded catering spending for the selected period and program.'
      : 'No recorded venue spending for the selected period and program.';
  }
  return '';
}

function renderFinancialsVendorSummary(type, totalSpending, identifiedCount) {
  const summary = document.getElementById('financials-vendor-summary');
  if (!summary) return;

  const totalLabel = type === 'caterers' ? 'Total Catering Spending' : 'Total Venue Spending';
  const identifiedLabel = type === 'caterers' ? 'Identified Caterers' : 'Identified Venues';

  summary.innerHTML = `
    <div class="financials-vendor-metric">
      <div class="financials-vendor-metric-label">${totalLabel}</div>
      <div class="financials-vendor-metric-value">${formatTotalRecordedEventCost(totalSpending)}</div>
    </div>
    <div class="financials-vendor-metric">
      <div class="financials-vendor-metric-label">${identifiedLabel}</div>
      <div class="financials-vendor-metric-value">${identifiedCount.toLocaleString('en-US')}</div>
    </div>`;
}

function renderFinancialsVendorList(vendors, totalSpending, eventsForRange, type) {
  const list = document.getElementById('financials-vendor-list');
  if (!list) return;

  list.innerHTML = vendors
    .map((vendor) => {
      const width = totalSpending > 0
        ? Math.max(0, Math.min(100, (vendor.total / totalSpending) * 100))
        : 0;
      const eventLabel = vendor.eventCount === 1 ? 'event' : 'events';
      const averageLabel = vendor.eventCount > 0
        ? `${formatTotalRecordedEventCost(vendor.total / vendor.eventCount)}/event`
        : '—';
      const share = formatFinancialsPercent(vendor.total, totalSpending);
      const selected = vendor.key === financialsSelectedVendorKey;
      return `
        <button
          type="button"
          class="financials-vendor-row${selected ? ' is-selected' : ''}"
          data-vendor-key="${escapeFinancialsHtml(vendor.key)}"
          aria-expanded="${selected ? 'true' : 'false'}"
          aria-controls="financials-vendor-detail"
        >
          <div class="financials-vendor-row-main">
            <div class="financials-vendor-name">${escapeFinancialsHtml(vendor.name)}</div>
            <div class="financials-vendor-amount">${formatTotalRecordedEventCost(vendor.total)}</div>
          </div>
          <div class="financials-vendor-bar" aria-hidden="true">
            <span class="financials-vendor-bar-fill" style="width: ${width.toFixed(1)}%"></span>
          </div>
          <div class="financials-vendor-meta">
            <span>${vendor.eventCount} ${eventLabel}</span>
            <span>${averageLabel}</span>
            <span>${share}</span>
          </div>
        </button>`;
    })
    .join('');

  list.querySelectorAll('.financials-vendor-row').forEach((row) => {
    const openDetail = () => {
      openFinancialsVendorDetail(row.dataset.vendorKey, eventsForRange, vendors, type);
    };
    row.addEventListener('click', openDetail);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetail();
    });
  });
}

function renderFinancialsVendorSection(eventsForRange, range) {
  updateFinancialsVendorTabs();

  const type = getFinancialsVendorType();
  const resolveCost = getFinancialsVendorCostResolver(type);
  const vendors = aggregateFinancialsVendors(eventsForRange, type);
  const totalSpending = eventsForRange.reduce((sum, event) => sum + resolveCost(event), 0);
  const identifiedCount = vendors.filter((vendor) => !vendor.unspecified).length;
  const emptyMessage = getFinancialsVendorEmptyMessage(range, eventsForRange, type, vendors);

  renderFinancialsVendorSummary(type, totalSpending, identifiedCount);
  renderFinancialsVendorList(vendors, totalSpending, eventsForRange, type);

  const emptyEl = document.getElementById('financials-vendor-empty');
  if (emptyEl) {
    emptyEl.textContent = emptyMessage;
    emptyEl.hidden = !emptyMessage;
  }

  if (financialsSelectedVendorKey) {
    openFinancialsVendorDetail(financialsSelectedVendorKey, eventsForRange, vendors, type);
  } else {
    closeFinancialsVendorDetail();
  }
}

function renderFinancials() {
  if (!document.getElementById('view-financials')) return;

  populateFinancialsProgramOptions();
  updateFinancialsCustomDateFields();

  const range = getFinancialsCurrentRange();
  const eventsForRange = getFinancialsEvents(range, getFinancialsProgramValue());
  const categories = getFinancialsCategoryTotals(eventsForRange);
  const summary = calculateFinancialsSummary(eventsForRange, categories);
  const emptyMessage = getFinancialsEmptyMessage(
    range,
    eventsForRange,
    summary.eventsWithRecordedCosts
  );

  renderFinancialsSummary(summary);
  renderFinancialsDonut(categories, summary.totalRecordedEventCost);
  renderFinancialsCategoryList(categories, summary.totalRecordedEventCost);
  renderFinancialsVendorSection(eventsForRange, range);

  const emptyEl = document.getElementById('financials-empty-message');
  if (emptyEl) {
    emptyEl.textContent = emptyMessage;
    emptyEl.hidden = !emptyMessage;
  }
}

function setupFinancials() {
  const period = document.getElementById('financials-period');
  if (!period) return;

  period.addEventListener('change', () => {
    updateFinancialsCustomDateFields();
    renderFinancials();
  });

  ['financials-program', 'financials-start-date', 'financials-end-date'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', renderFinancials);
  });

  document.querySelectorAll('#view-financials .financials-vendor-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setFinancialsVendorType(tab.dataset.vendorType);
      renderFinancials();
    });
  });

  updateFinancialsVendorTabs();
  updateFinancialsCustomDateFields();
}

function switchView(viewName) {
  if (currentView === 'reports' && reportsTab === 'aar') {
    captureAarFilterState();
  }

  currentView = viewName;

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = true;
  });

  const viewMap = {
    events: 'view-events',
    reports: 'view-reports',
    trends: 'view-trends',
    financials: 'view-financials',
    team: 'view-team',
    settings: 'view-settings',
  };

  document.getElementById(viewMap[viewName]).hidden = false;

  if (TRACKER_VIEWS.includes(viewName)) {
    renderDashboard();
  } else if (viewName === 'reports') {
    switchReportsTab(reportsTab);
  } else if (viewName === 'trends') {
    renderTrends();
  } else if (viewName === 'financials') {
    renderFinancials();
  } else if (viewName === 'team') {
    renderTeam();
  } else if (viewName === 'settings') {
    renderSettings();
  }
}

function setupNavigation() {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });
}

function renderKPIs() {
  const grid = document.getElementById('kpi-grid');
  const filtered = getFilteredEvents();
  const totalParticipants = filtered.reduce((sum, e) => sum + participantCount(e.participants), 0);

  const kpis = [
    { label: 'Events Scheduled', value: filtered.length },
    { label: 'Expected Participants', value: totalParticipants.toLocaleString() },
    { label: 'Events Ready to Execute', value: countEventsReadyToExecute(filtered) },
  ];

  grid.innerHTML = kpis
    .map(
      (kpi) => `
      <div class="kpi-card">
        <div class="kpi-label">${kpi.label}</div>
        <div class="kpi-value">${kpi.value}</div>
      </div>`
    )
    .join('');
}

function attachEditableCell(cell, event, field) {
  cell.classList.add('editable-cell');

  if (field === 'date') {
    cell.textContent = formatEventDateDisplay(event);
  } else if (field === 'eventType') {
    cell.textContent = event.eventType;
  } else {
    cell.textContent = displayValue(event[field], field);
  }
}

async function deleteEvent(eventId) {
  if (!canDeleteEvents()) return;
  if (!confirm('Delete this event?')) return;
  try {
    const result = await deleteEventById(eventId);
    events = events.filter((e) => e.id !== eventId);
    applyAarResequencePatches(result?.resequenced);
    render();
  } catch (err) {
    console.error(err);
    alert('Failed to delete event.');
  }
}

function createEditButton(eventId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'event-edit-btn';
  btn.setAttribute('aria-label', 'Edit event');
  btn.textContent = 'Edit';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditEventModal(eventId);
  });
  return btn;
}

function createDeleteButton(eventId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'delete-btn';
  btn.setAttribute('aria-label', 'Delete event');
  btn.innerHTML = `
    <svg class="delete-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 1 7 0.5h2A1.5 1.5 0 0 1 10.5 2H13a1 1 0 1 1 0 2h-0.5l-0.6 8.2A1.5 1.5 0 0 1 10.4 14H5.6a1.5 1.5 0 0 1-1.5-1.8L3.5 4H3a1 1 0 1 1 0-2h2.5zM7 2h2l0.2 1H6.8L7 2zm0.5 4a0.5 0.5 0 0 0-1 0v6a0.5 0.5 0 0 0 1 0V6zm3 0a0.5 0.5 0 0 0-1 0v6a0.5 0.5 0 0 0 1 0V6z"/>
    </svg>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteEvent(eventId);
  });
  return btn;
}

function createRosterPill(eventId, roster) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const isComplete = roster === 'Complete';
  btn.className = `roster-pill ${isComplete ? 'complete' : 'need-roster'}`;
  btn.textContent = isComplete ? 'Complete' : 'Need Roster';
  btn.disabled = !canEditEvents();
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const event = events.find((entry) => entry.id === eventId);
    if (!event) return;
    event.roster = isComplete ? 'Need Roster' : 'Complete';
    await persistEvent(event);
    render();
  });
  return btn;
}

function createStatusPill(eventId, field, status) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `status-pill ${STATUS_CLASS[status]}`;
  btn.innerHTML = `<span class="status-dot"></span>${status}`;
  btn.disabled = !canEditEvents();
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const event = events.find((entry) => entry.id === eventId);
    if (!event) return;
    event[field] = cycleStatus(event[field]);
    await persistEvent(event);
    render();
  });
  return btn;
}

function renderTable() {
  const tbody = document.getElementById('events-body');
  const countEl = document.getElementById('event-count');
  const filtered = getFilteredEvents();

  countEl.textContent = `${filtered.length} event${filtered.length === 1 ? '' : 's'}`;

  if (events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">No events yet. Click <strong>+ New Event</strong> to add one.</div></td></tr>`;
    return;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">No events match this filter.</div></td></tr>`;
    return;
  }

  const sorted = sortTableData(filtered, eventsTableSort, EVENTS_SORT_COMPARATORS);
  tbody.innerHTML = '';

  sorted.forEach((event) => {
    const row = document.createElement('tr');
    if (canEditEvents()) {
      row.classList.add('event-row-editable');
      row.addEventListener('click', () => openEditEventModal(event.id));
    }

    const deleteCell = document.createElement('td');
    deleteCell.className = 'col-delete';
    deleteCell.addEventListener('click', (e) => e.stopPropagation());
    if (canEditEvents()) {
      deleteCell.appendChild(createEditButton(event.id));
    }
    if (canDeleteEvents()) {
      deleteCell.appendChild(createDeleteButton(event.id));
    }
    row.appendChild(deleteCell);

    const dateCell = document.createElement('td');
    dateCell.className = 'col-date';
    attachEditableCell(dateCell, event, 'date');
    row.appendChild(dateCell);

    const typeCell = document.createElement('td');
    typeCell.className = 'col-type';
    attachEditableCell(typeCell, event, 'eventType');
    row.appendChild(typeCell);

    const commandCell = document.createElement('td');
    commandCell.className = 'col-command';
    attachEditableCell(commandCell, event, 'command');
    row.appendChild(commandCell);

    const facilitatorsCell = document.createElement('td');
    facilitatorsCell.className = 'col-participants';
    attachEditableCell(facilitatorsCell, event, 'facilitators');
    row.appendChild(facilitatorsCell);

    const locationCell = document.createElement('td');
    locationCell.className = 'col-location';
    attachEditableCell(locationCell, event, 'location');
    row.appendChild(locationCell);

    [
      { pill: createStatusPill(event.id, 'reservation', event.reservation), detail: event.venue },
      { pill: createStatusPill(event.id, 'catering', event.catering), detail: event.cateringVendor },
      { pill: createStatusPill(event.id, 'packout', event.packout), detail: '' },
      { pill: createRosterPill(event.id, event.roster), detail: '' },
    ].forEach(({ pill, detail }) => {
      const statusCell = document.createElement('td');
      statusCell.className = 'col-status';
      statusCell.addEventListener('click', (e) => e.stopPropagation());
      statusCell.appendChild(pill);
      if (detail) {
        const detailEl = document.createElement('div');
        detailEl.className = 'status-detail';
        detailEl.textContent = detail;
        detailEl.title = detail;
        statusCell.appendChild(detailEl);
      }
      row.appendChild(statusCell);
    });

    tbody.appendChild(row);
  });
}

function render() {
  if (TRACKER_VIEWS.includes(currentView)) {
    renderDashboard();
  } else if (currentView === 'reports') {
    if (reportsTab === 'event-reports') {
      renderReports();
    } else if (reportsTab === 'search') {
      renderReportsSearch();
    } else if (reportsTab === 'aar') {
      renderAarSearch();
    } else if (reportsTab === 'mir') {
      renderMirReport();
    }
  } else if (currentView === 'trends') {
    renderTrends();
  } else if (currentView === 'financials') {
    renderFinancials();
  } else if (currentView === 'team') {
    renderTeam();
  } else if (currentView === 'settings') {
    renderSettings();
  }
}

function populateModalEventTypeSelect(select) {
  select.innerHTML = [
    '<option value="">Select event type</option>',
    ...eventTypes.map((type) => `<option value="${type}">${type}</option>`),
  ].join('');
}

function populateEventTypeSelect(select, selectedValue) {
  select.innerHTML = eventTypes
    .map((type) => `<option value="${type}">${type}</option>`)
    .join('');

  if (selectedValue && eventTypes.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function updateEventDateFieldsVisibility(form) {
  const dateType = form.querySelector('[name="dateType"]:checked')?.value || 'single';
  document.getElementById('event-single-date-fields').hidden = dateType !== 'single';
  document.getElementById('event-range-date-fields').hidden = dateType !== 'range';
}

const EVENT_COST_FIELD_NAMES = [
  'venueCost',
  'cateringCost',
  'lodgingCost',
  'transportationCost',
  'materialsCost',
  'otherCost',
];

function parseEventCostNumber(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return 0;
  const num = parseFloat(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function formatTotalRecordedEventCost(total) {
  return total.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function hasAdditionalEventCostData(event) {
  return [
    event.lodgingCost,
    event.transportationCost,
    event.materialsCost,
    event.otherCost,
    event.otherCostDescription,
  ].some((value) => String(value ?? '').trim() !== '');
}

function updateEventTotalRecordedCost(form) {
  const total = EVENT_COST_FIELD_NAMES.reduce((sum, name) => {
    const input = form.querySelector(`[name="${name}"]`);
    return sum + parseEventCostNumber(input?.value);
  }, 0);
  const output = document.getElementById('event-total-recorded-cost');
  if (output) output.value = formatTotalRecordedEventCost(total);
}

function setAdditionalEventCostsExpanded(expanded) {
  const section = document.getElementById('event-additional-costs');
  if (section) section.open = Boolean(expanded);
}

function sortReferenceByName(list) {
  return [...list].sort((left, right) =>
    String(left.name || '').localeCompare(String(right.name || ''), 'en', { sensitivity: 'base' })
  );
}

function upsertReferenceItem(list, item) {
  const next = list.filter((entry) => entry.id !== item.id);
  next.push(item);
  return sortReferenceByName(next);
}

function applyReferenceUpdate(list, updated) {
  if (!updated) return list;
  if (updated.active === false) {
    return list.filter((entry) => entry.id !== updated.id);
  }
  return upsertReferenceItem(list, updated);
}

function removeReferenceItem(list, id) {
  return list.filter((entry) => entry.id !== id);
}

function resetEventForm(form) {
  form.reset();
  form.querySelector('[name="dateType"][value="single"]').checked = true;
  document.getElementById('editing-event-id').value = '';
  document.getElementById('event-single-date').value = '';
  document.getElementById('event-range-start-date').value = '';
  document.getElementById('event-range-end-date').value = '';
  setAdditionalEventCostsExpanded(false);
  updateEventDateFieldsVisibility(form);
  updateEventTotalRecordedCost(form);
  eventReferenceFields?.reset();
}

function populateEventFormFromRecord(form, event) {
  const dateType = event.dateType === 'range' ? 'range' : 'single';
  form.querySelector(`[name="dateType"][value="${dateType}"]`).checked = true;
  updateEventDateFieldsVisibility(form);

  if (dateType === 'single') {
    const start = getEventStartDate(event);
    document.getElementById('event-single-date').value = isTbd(start) ? '' : start;
    document.getElementById('event-range-start-date').value = '';
    document.getElementById('event-range-end-date').value = '';
  } else {
    document.getElementById('event-single-date').value = '';
    document.getElementById('event-range-start-date').value =
      isTbd(event.startDate) ? '' : event.startDate;
    document.getElementById('event-range-end-date').value =
      isTbd(event.endDate) ? '' : event.endDate;
  }

  form.querySelector('[name="eventType"]').value = event.eventType;
  form.querySelector('[name="participants"]').value =
    isTbd(event.participants) ? '' : String(event.participants);
  form.querySelector('[name="venueCost"]').value = event.venueCost || '';
  form.querySelector('[name="cateringCost"]').value = event.cateringCost || '';
  form.querySelector('[name="lodgingCost"]').value = event.lodgingCost || '';
  form.querySelector('[name="transportationCost"]').value = event.transportationCost || '';
  form.querySelector('[name="materialsCost"]').value = event.materialsCost || '';
  form.querySelector('[name="otherCost"]').value = event.otherCost || '';
  form.querySelector('[name="otherCostDescription"]').value = event.otherCostDescription || '';
  setAdditionalEventCostsExpanded(hasAdditionalEventCostData(event));
  updateEventTotalRecordedCost(form);
  form.querySelector('[name="time"]').value = event.time || '';

  eventReferenceFields?.setFromEvent({
    command: isTbd(event.command) ? '' : event.command,
    location: isTbd(event.location) ? '' : event.location,
    venue: event.venue || '',
    cateringVendor: event.cateringVendor || '',
    facilitators: event.facilitators || '',
    credoStaff: event.credoStaff || '',
    poc: event.poc || '',
  });
}

function readEventFieldsFromForm(form) {
  const data = new FormData(form);
  const dateType = data.get('dateType') === 'range' ? 'range' : 'single';
  let startDate;
  let endDate;

  if (dateType === 'single') {
    startDate = toFieldValue(data.get('singleDate'));
    endDate = startDate;
  } else {
    startDate = toFieldValue(data.get('rangeStartDate'));
    endDate = toFieldValue(data.get('rangeEndDate'));
    if (!isTbd(startDate) && !isTbd(endDate) && endDate < startDate) {
      return { error: 'End date must be on or after the start date.' };
    }
  }

  return {
    dateType,
    startDate,
    endDate,
    date: startDate,
    eventType: data.get('eventType'),
    command: toFieldValue(String(data.get('command') || '').trim()),
    participants: toParticipantValue(data.get('participants')),
    location: toFieldValue(String(data.get('location') || '').trim()),
    venue: String(data.get('venue') || '').trim(),
    venueCost: String(data.get('venueCost') || '').trim(),
    cateringVendor: String(data.get('cateringVendor') || '').trim(),
    cateringCost: String(data.get('cateringCost') || '').trim(),
    lodgingCost: String(data.get('lodgingCost') || '').trim(),
    transportationCost: String(data.get('transportationCost') || '').trim(),
    materialsCost: String(data.get('materialsCost') || '').trim(),
    otherCost: String(data.get('otherCost') || '').trim(),
    otherCostDescription: String(data.get('otherCostDescription') || '').trim(),
    facilitators: String(data.get('facilitators') || '').trim(),
    credoStaff: String(data.get('credoStaff') || '').trim(),
    time: String(data.get('time') || '').trim(),
    poc: String(data.get('poc') || '').trim(),
  };
}

function openNewEventModal() {
  const modal = document.getElementById('new-event-modal');
  const form = document.getElementById('new-event-form');
  const typeSelect = form.querySelector('[name="eventType"]');

  document.getElementById('event-modal-title').textContent = 'New Event';
  document.getElementById('event-modal-submit').textContent = 'Add Event';
  populateModalEventTypeSelect(typeSelect);
  resetEventForm(form);
  document.getElementById('event-type-error').hidden = true;
  modal.showModal();
}

function openEditEventModal(eventId) {
  if (!canEditEvents()) return;

  const event = events.find((entry) => entry.id === eventId);
  if (!event) return;

  const modal = document.getElementById('new-event-modal');
  const form = document.getElementById('new-event-form');
  const typeSelect = form.querySelector('[name="eventType"]');

  document.getElementById('event-modal-title').textContent = 'Edit Event';
  document.getElementById('event-modal-submit').textContent = 'Save Event';
  populateModalEventTypeSelect(typeSelect);
  resetEventForm(form);
  document.getElementById('editing-event-id').value = eventId;
  populateEventFormFromRecord(form, event);
  document.getElementById('event-type-error').hidden = true;
  modal.showModal();
}

function setupModal() {
  const modal = document.getElementById('new-event-modal');
  const form = document.getElementById('new-event-form');
  const openBtn = document.getElementById('new-event-btn');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const typeSelect = form.querySelector('[name="eventType"]');
  const eventTypeError = document.getElementById('event-type-error');

  eventReferenceFields = initEventReferenceFields(form, {
    getCommands: () => referenceCommands,
    getLocations: () => referenceLocations,
    getVenues: () => referenceVenues,
    getCaterers: () => referenceCaterers,
    getPeople: () => referencePeople,
    getTeamMembers: () => teamMembers,
    canCreateReferences: () => canEditEvents(),
    createCommand: async (name) => {
      const created = await createCommand(name);
      referenceCommands = upsertReferenceItem(referenceCommands, created);
      return created;
    },
    createLocation: async (name) => {
      const created = await createLocation(name);
      referenceLocations = upsertReferenceItem(referenceLocations, created);
      return created;
    },
    createVenue: async (name) => {
      const created = await createVenue(name);
      referenceVenues = upsertReferenceItem(referenceVenues, created);
      return created;
    },
    createCaterer: async (name) => {
      const created = await createCaterer(name);
      referenceCaterers = upsertReferenceItem(referenceCaterers, created);
      return created;
    },
    createPerson: async (person) => {
      const created = await createPerson(person);
      referencePeople = upsertReferenceItem(referencePeople, created);
      return created;
    },
    updateCommand: async (id, updates) => {
      const updated = await updateCommand(id, updates);
      referenceCommands = applyReferenceUpdate(referenceCommands, updated);
      if (updates?.name) await reloadEventsAfterCanonicalRename();
      return updated;
    },
    updateLocation: async (id, updates) => {
      const updated = await updateLocation(id, updates);
      referenceLocations = applyReferenceUpdate(referenceLocations, updated);
      if (updates?.name) await reloadEventsAfterCanonicalRename();
      return updated;
    },
    updateVenue: async (id, updates) => {
      const updated = await updateVenue(id, updates);
      referenceVenues = applyReferenceUpdate(referenceVenues, updated);
      if (updates?.name) await reloadEventsAfterCanonicalRename();
      return updated;
    },
    updateCaterer: async (id, updates) => {
      const updated = await updateCaterer(id, updates);
      referenceCaterers = applyReferenceUpdate(referenceCaterers, updated);
      if (updates?.name) await reloadEventsAfterCanonicalRename();
      return updated;
    },
    updatePerson: async (id, updates) => {
      const updated = await updatePerson(id, updates);
      referencePeople = applyReferenceUpdate(referencePeople, updated);
      if (updates?.name) await reloadEventsAfterCanonicalRename();
      return updated;
    },
    removeCommand: async (id) => {
      const removed = await removeCommand(id);
      referenceCommands = removeReferenceItem(referenceCommands, id);
      return removed;
    },
    removeLocation: async (id) => {
      const removed = await removeLocation(id);
      referenceLocations = removeReferenceItem(referenceLocations, id);
      return removed;
    },
    removeVenue: async (id) => {
      const removed = await removeVenue(id);
      referenceVenues = removeReferenceItem(referenceVenues, id);
      return removed;
    },
    removeCaterer: async (id) => {
      const removed = await removeCaterer(id);
      referenceCaterers = removeReferenceItem(referenceCaterers, id);
      return removed;
    },
    removePerson: async (id) => {
      const removed = await removePerson(id);
      referencePeople = removeReferenceItem(referencePeople, id);
      return removed;
    },
    onPeopleChanged: () => {
      eventReferenceFields?.refreshPeople();
    },
    onNamedListsChanged: () => {
      eventReferenceFields?.refreshNamed();
    },
  });

  populateModalEventTypeSelect(typeSelect);

  form.querySelectorAll('[name="dateType"]').forEach((input) => {
    input.addEventListener('change', () => updateEventDateFieldsVisibility(form));
  });

  form.addEventListener('input', (e) => {
    if (EVENT_COST_FIELD_NAMES.includes(e.target?.name)) {
      updateEventTotalRecordedCost(form);
    }
  });

  function hideEventTypeError() {
    eventTypeError.hidden = true;
  }

  function showEventTypeError() {
    eventTypeError.hidden = false;
  }

  function closeModal() {
    modal.close();
  }

  modal.addEventListener('close', () => resetEventForm(form));

  openBtn.addEventListener('click', openNewEventModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  typeSelect.addEventListener('change', hideEventTypeError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editingEventId = document.getElementById('editing-event-id').value;
    const fields = readEventFieldsFromForm(form);

    if (fields.error) {
      alert(fields.error);
      return;
    }

    if (!fields.eventType) {
      showEventTypeError();
      return;
    }

    hideEventTypeError();

    if (editingEventId) {
      const event = events.find((entry) => entry.id === editingEventId);
      if (!event) return;

      Object.assign(event, fields);
      await persistEvent(event);
      render();
      closeModal();
      return;
    }

    const newEvent = {
      ...fields,
      reservation: 'Not Started',
      catering: 'Not Started',
      packout: 'Not Started',
      roster: 'Need Roster',
    };

    const saved = await persistNewEvent(newEvent);
    if (!saved) return;

    events.push(newEvent);
    render();
    closeModal();
  });
}

async function loadReferenceLists() {
  const settled = await Promise.allSettled([
    fetchCommands(),
    fetchLocations(),
    fetchVenues(),
    fetchCaterers(),
    fetchPeople(),
    fetchTeamMembers(),
  ]);

  const [commandsResult, locationsResult, venuesResult, caterersResult, peopleResult, teamMembersResult] = settled;

  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('Failed to load reference list', index, result.reason);
    }
  });

  referenceCommands = sortReferenceByName(commandsResult.status === 'fulfilled' ? commandsResult.value : []);
  referenceLocations = sortReferenceByName(locationsResult.status === 'fulfilled' ? locationsResult.value : []);
  referenceVenues = sortReferenceByName(venuesResult.status === 'fulfilled' ? venuesResult.value : []);
  referenceCaterers = sortReferenceByName(caterersResult.status === 'fulfilled' ? caterersResult.value : []);
  referencePeople = sortReferenceByName(peopleResult.status === 'fulfilled' ? peopleResult.value : []);
  teamMembers = teamMembersResult.status === 'fulfilled' ? teamMembersResult.value : [];
  eventReferenceFields?.refreshStaff();
  eventReferenceFields?.refreshPeople();
}

async function loadAllData() {
  const generation = ++dataLoadGeneration;

  const [types, teamData, loadedEvents, globalTemplates] = await Promise.all([
    fetchEventTypes(),
    fetchTeam(),
    fetchEvents(),
    fetchAarGlobalTemplates(),
  ]);

  if (generation !== dataLoadGeneration) return;

  eventTypeRecords = types;
  syncEventTypeNames();
  team = teamData;
  events = loadedEvents.map(normalizeEvent);
  aarGlobalTemplates = globalTemplates;
  resetTableSortState();
  syncAarStateAfterDataLoad();

  await loadReferenceLists();
  if (generation !== dataLoadGeneration) return;
}

export async function refreshApp() {
  await loadAllData();
  setupMirDraft();
  applyPermissions();
  render();
}

export async function initApp() {
  await loadAllData();
  document.getElementById('today-date').textContent = formatToday();
  setupNavigation();
  setupDateFilter();
  setupTrends();
  setupFinancials();
  setupReports();
  setupReportsSubnav();
  setupSettingsSubnav();
  setupAarSearch();
  setupAarHistoryLog();
  setupMirInternalNav();
  setupMirDraft();
  setupMirHistoryLog();
  setupModal();
  applyPermissions();
  switchView('events');
}
