import {
  createTeamMember,
  deleteEventById,
  deleteEventType,
  deleteMonthlyReport,
  deleteTeamMember,
  fetchAarGlobalTemplates,
  fetchCommandHighlightsNotes,
  fetchEventTypes,
  fetchEvents,
  fetchMonthlyReport,
  fetchMonthlyReports,
  fetchTeam,
  fetchTeamMembers,
  insertEvent,
  insertEventType,
  renameEventTypeInEvents,
  saveMonthlyReport,
  updateAarGlobalTemplates,
  updateCommandHighlightsNotes,
  updateEvent,
  updateEventAarFields,
  clearEventAar,
  finalizeEventAar,
  fetchAarAuditLog,
  insertAarAuditEntry,
  updateEventType,
  updateTeamMember,
} from './db.js';
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
let commandHighlightsNotes = '';
let currentView = 'events';
let reportsTab = 'event-reports';
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
  aarTableSort.column = null;
  aarTableSort.direction = SORT_ASC;
  aarHistoryTableSort.column = null;
  aarHistoryTableSort.direction = SORT_ASC;
  mirHistoryTableSort.column = null;
  mirHistoryTableSort.direction = SORT_ASC;

  refreshSortHeaderIndicators('#view-events .events-table', EVENTS_TABLE_SORT_COLUMNS, eventsTableSort);
  refreshSortHeaderIndicators('#reports-event-panel .reports-table', REPORTS_TABLE_SORT_COLUMNS, reportsTableSort);
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

function renderCalendar() {
  const container = document.getElementById('calendar-content');
  const sorted = sortEvents(events);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="empty-state">No events scheduled.</p>';
    return;
  }

  const months = new Map();

  sorted.forEach((event) => {
    const isoDate = getEventStartDate(event);
    const date = new Date(isoDate + 'T12:00:00');
    const monthKey = isTbd(isoDate)
      ? 'Date TBD'
      : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!months.has(monthKey)) months.set(monthKey, new Map());
    const days = months.get(monthKey);
    const dateKey = isTbd(isoDate) ? TBD : isoDate;
    if (!days.has(dateKey)) days.set(dateKey, []);
    days.get(dateKey).push(event);
  });

  container.innerHTML = [...months.entries()]
    .map(([monthLabel, days]) => {
      const dayBlocks = [...days.entries()]
        .map(([dateKey, dayEvents]) => {
          const eventsList = dayEvents
            .map(
              (event) => `
              <li class="calendar-event">
                <span class="calendar-event-type">${event.eventType}</span>
                <span class="calendar-event-meta">${displayValue(event.location, 'location')} · ${displayValue(event.participants, 'participants')}${isTbd(event.participants) ? '' : ' participants'}</span>
              </li>`
            )
            .join('');

          return `
            <div class="calendar-day">
              <h4 class="calendar-day-label">${formatEventDateDisplay(dayEvents[0])}</h4>
              <ul class="calendar-event-list">${eventsList}</ul>
            </div>`;
        })
        .join('');

      return `
        <div class="calendar-month">
          <h3 class="calendar-month-label">${monthLabel}</h3>
          ${dayBlocks}
        </div>`;
    })
    .join('');
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
  renderReportTable();
}

function setupReportsSubnav() {
  document.querySelectorAll('.reports-subtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchReportsTab(btn.dataset.reportsTab);
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
  document.getElementById('reports-aar-panel').hidden = tab !== 'aar';
  document.getElementById('reports-mir-panel').hidden = tab !== 'mir';

  const subtitle = document.getElementById('reports-subtitle');
  if (subtitle) {
    const subtitles = {
      'event-reports': 'Event Reports',
      aar: 'After Action Reports',
      mir: 'Monthly Impact Report',
    };
    subtitle.textContent = subtitles[tab] ?? 'Reports';
  }

  if (tab === 'event-reports') {
    renderReports();
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

function setAarCostTextElement(element, text, emptyPlaceholder) {
  if (!element) return;
  if (!hasAarFieldData(text)) {
    element.textContent = emptyPlaceholder;
    element.classList.add('aar-report-placeholder');
    return;
  }
  element.textContent = formatAarCost(text);
  element.classList.remove('aar-report-placeholder');
}

function setAarTextElement(element, text, emptyPlaceholder) {
  if (!element) return;
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed === TBD) {
    element.textContent = emptyPlaceholder;
    element.classList.add('aar-report-placeholder');
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

  const footerSeq = getAarReportRoot(root)?.querySelector('.aar-report-footer-seq');
  const valueSpan = footerSeq?.querySelector('span:last-child');
  if (valueSpan) {
    setAarTextElement(valueSpan, sequence, 'Sequence number will appear here.');
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

async function exportAarFromHistory(event, triggerBtn) {
  if (!event || !isAarFinalized(event)) {
    alert('Only finalized AARs can be exported from History Log.');
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
    .event-type-row-expanded {
      display: block;
      padding: 14px 0;
      border-bottom: 1px solid #dde3ea;
    }

    .event-type-row-expanded:last-child {
      border-bottom: none;
    }

    .event-type-name-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .event-type-name-row .event-type-input {
      flex: 1;
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

function renderSettings() {
  ensureEventTypeTemplateStyles();
  const container = document.getElementById('settings-content');
  const editable = canManageEventTypes();

  container.innerHTML = `
    <div class="settings-panel">
      <p class="settings-help">Edit event type names and AAR template text below. Name changes apply to new events and dropdowns.</p>
      <ul class="event-type-list" id="event-type-list"></ul>
      ${editable ? '<button type="button" class="btn btn-secondary" id="add-event-type-btn">+ Add Event Type</button>' : ''}
    </div>`;

  const list = container.querySelector('#event-type-list');
  eventTypeRecords.forEach((record, index) => {
    list.appendChild(createEventTypeRow(index, editable));
  });

  renderAarGlobalTemplatesSection(container, editable);

  if (editable) {
    container.querySelector('#add-event-type-btn').addEventListener('click', async () => {
      try {
        const sortOrder = eventTypeRecords.length;
        const created = await insertEventType('New Event Type', sortOrder);
        eventTypeRecords.push(created);
        syncEventTypeNames();
        renderSettings();
      } catch (err) {
        console.error(err);
        alert('Failed to add event type.');
      }
    });
  }
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
  li.className = 'event-type-row event-type-row-expanded';

  const nameRow = document.createElement('div');
  nameRow.className = 'event-type-name-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'event-type-input';
  input.value = record.name;
  input.readOnly = !editable;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'event-type-remove';
  removeBtn.setAttribute('aria-label', 'Remove event type');
  removeBtn.textContent = '×';
  removeBtn.disabled = !editable || eventTypeRecords.length <= 1;

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
      if (eventTypeRecords.length <= 1) return;
      try {
        await deleteEventType(record.id);
        eventTypeRecords.splice(index, 1);
        syncEventTypeNames();
        renderSettings();
      } catch (err) {
        console.error(err);
        alert('Failed to remove event type.');
      }
    });
  }

  nameRow.appendChild(input);
  nameRow.appendChild(removeBtn);
  li.appendChild(nameRow);
  li.appendChild(createEventTypeSeriesCodeField(record.seriesCode));
  li.appendChild(objectivesField.field);
  li.appendChild(descriptionField.field);
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
let trendsProjectionViewState = null;
let trendsExplorerViewState = null;
let trendsExplorerUserFunding = null;
let trendsExplorerSliderMax = 0;
let trendsExplorerAllocations = null;
let trendsExplorerHeldKeys = new Set();

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
  if (!grid) return;

  const cards = [
    { key: 'completedEvents', label: 'Completed Events' },
    { key: 'participantReach', label: 'Participant Reach' },
    { key: 'commandsReached', label: 'Commands Reached' },
    { key: 'totalRecordedEventCost', label: 'Total Recorded Event Cost' },
    { key: 'costPerParticipant', label: 'Cost per Participant' },
  ];

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
  commandsReached: 'Commands Reached',
  totalRecordedEventCost: 'Total Recorded Event Cost',
  costPerParticipant: 'Cost per Participant',
};

let trendsChartDrawState = null;

function getTrendsChartMetricKey() {
  const value = document.getElementById('trends-chart-metric')?.value;
  return TRENDS_CHART_METRICS[value] ? value : 'participantReach';
}

function getTrendsChartMetricLabel(metricKey = getTrendsChartMetricKey()) {
  return TRENDS_CHART_METRICS[metricKey] || TRENDS_CHART_METRICS.participantReach;
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
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  eventsForRange.forEach((event) => {
    const isoDate = getTrendsEventDate(event);
    if (!isoDate) return;
    const bucket = byKey.get(getTrendsChartBucketKey(isoDate, bucketSize));
    if (bucket) bucket.events.push(event);
  });

  return buckets.map((bucket) => ({
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

function buildTrendsChartComparisonSeries(currentBuckets, currentRange, period, compareMode, filters, bucketSize, metricKey) {
  if (compareMode === TRENDS_COMPARE_NONE) return [];

  const compareLabel = getTrendsComparisonPhrase(compareMode);
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
  if (metricKey === 'costPerParticipant') {
    return metrics.costPerParticipant;
  }
  return Number(metrics[metricKey]) || 0;
}

function formatTrendsChartValue(metricKey, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (metricKey === 'totalRecordedEventCost' || metricKey === 'costPerParticipant') {
    return formatTotalRecordedEventCost(value);
  }
  return String(Math.round(value));
}

function formatTrendsChartAxisValue(metricKey, value) {
  if (!Number.isFinite(value)) return '';
  const isCurrency = metricKey === 'totalRecordedEventCost' || metricKey === 'costPerParticipant';
  if (isCurrency) {
    if (value === 0) return '$0';
    if (value >= 1000) {
      const thousands = value / 1000;
      const compact = thousands >= 10 || Number.isInteger(thousands)
        ? String(Math.round(thousands))
        : thousands.toFixed(1).replace(/\.0$/, '');
      return `$${compact}k`;
    }
    return `$${Math.round(value)}`;
  }
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
  }
}

function showTrendsChartTooltip(anchor, point, metricLabel) {
  const tooltip = document.getElementById('trends-chart-tooltip');
  const body = document.querySelector('#view-trends .trends-chart-body');
  if (!tooltip || !body) return;

  tooltip.hidden = false;
  tooltip.textContent = '';
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

function redrawTrendsChartSvg() {
  if (!trendsChartDrawState) return;
  drawTrendsChartSvg(trendsChartDrawState);
}

function drawTrendsChartSvg(state) {
  const wrap = document.getElementById('trends-chart-svg-wrap');
  if (!wrap) return;

  hideTrendsChartTooltip();
  wrap.innerHTML = '';

  const { series, compareSeries, metricKey, metricLabel } = state;
  const width = Math.max(wrap.clientWidth || 640, 280);
  const height = wrap.clientWidth && wrap.clientWidth < 640 ? 240 : 280;
  const pad = {
    top: 16,
    right: 12,
    bottom: 36,
    left: width < 480 ? 40 : 52,
  };
  const plotWidth = Math.max(width - pad.left - pad.right, 40);
  const plotHeight = Math.max(height - pad.top - pad.bottom, 80);
  const values = [
    ...series.map((point) => point.value),
    ...(compareSeries || []).map((point) => point.value),
  ];
  const scale = getTrendsChartScale(values);
  const xAt = (index) => (
    series.length === 1
      ? pad.left + plotWidth / 2
      : pad.left + (index / (series.length - 1)) * plotWidth
  );
  const yAt = (value) => pad.top + plotHeight - (value / scale.max) * plotHeight;

  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': compareSeries?.length
      ? `Historical ${metricLabel} trend with ${state.compareLabel} comparison`
      : `Historical ${metricLabel} trend`,
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

  const maxLabels = width < 640 ? 4 : width < 900 ? 6 : 8;
  const visibleLabels = new Set(getVisibleTrendsChartLabelIndexes(series.length, maxLabels));
  series.forEach((point, index) => {
    if (!visibleLabels.has(index)) return;
    const label = createSvgElement('text', {
      x: xAt(index),
      y: height - 12,
      'text-anchor': 'middle',
      fill: '#9ca3af',
      'font-size': width < 480 ? 10 : 11,
      'font-family': 'inherit',
    });
    label.textContent = point.axisLabel;
    svg.appendChild(label);
  });

  function appendSeriesPath(points, style) {
    const plotted = points
      .map((point, index) => ({ point, index }))
      .filter((entry) => entry.point.value != null && Number.isFinite(entry.point.value));

    if (plotted.length > 1) {
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
        fill: style.stroke,
        stroke: '#ffffff',
        'stroke-width': 1.5,
        'pointer-events': 'none',
      });
      const show = () => showTrendsChartTooltip(hit, entry.point, metricLabel);
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', hideTrendsChartTooltip);
      hit.addEventListener('blur', hideTrendsChartTooltip);
      svg.appendChild(hit);
      svg.appendChild(marker);
    });
  }

  if (compareSeries?.length) {
    appendSeriesPath(compareSeries, {
      stroke: '#4b5563',
      width: 2,
      dash: '6 4',
      markerRadius: 3,
    });
  }

  appendSeriesPath(series, {
    stroke: '#00205b',
    width: 2.25,
    markerRadius: 3.5,
  });

  wrap.appendChild(svg);
}

function updateTrendsChartLegend(compareLabel) {
  const legend = document.getElementById('trends-chart-legend');
  const compareItem = document.getElementById('trends-chart-legend-compare');
  const compareLabelEl = document.getElementById('trends-chart-legend-compare-label');
  if (legend) legend.hidden = false;
  if (compareItem) compareItem.hidden = !compareLabel;
  if (compareLabelEl) compareLabelEl.textContent = compareLabel || '';
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

function hideTrendsChartChrome() {
  const legend = document.getElementById('trends-chart-legend');
  if (legend) legend.hidden = true;
  updateTrendsChartNote('');
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
}

function renderTrendsChartSection(currentRange, currentEvents, period) {
  const empty = document.getElementById('trends-chart-empty');
  const wrap = document.getElementById('trends-chart-svg-wrap');
  if (!empty || !wrap) return;

  if (!currentRange) {
    showTrendsChartEmpty('Choose a valid custom date range to view the historical trend.');
    return;
  }

  if (!currentEvents.length) {
    showTrendsChartEmpty('No finalized AAR data is available for this trend.');
    return;
  }

  const metricKey = getTrendsChartMetricKey();
  const metricLabel = getTrendsChartMetricLabel(metricKey);
  const bucketSize = getTrendsChartBucketSize(period, currentRange);
  const currentBuckets = aggregateTrendsChartBuckets(
    generateTrendsChartBuckets(currentRange, bucketSize),
    currentEvents,
    bucketSize
  );
  const series = currentBuckets.map((bucket) => {
    const value = getTrendsChartSeriesValue(bucket.metrics, metricKey);
    return {
      axisLabel: bucket.axisLabel,
      tooltipLabel: bucket.tooltipLabel,
      seriesLabel: 'Current Period',
      extraLabel: '',
      value,
      formattedValue: formatTrendsChartValue(metricKey, value),
    };
  });

  if (metricKey === 'costPerParticipant' && series.every((point) => point.value == null)) {
    showTrendsChartEmpty(
      'No participant data is available to calculate Cost per Participant for this period.'
    );
    return;
  }

  const compareMode = getTrendsCompareMode();
  const compareLabel = getTrendsComparisonPhrase(compareMode);
  let compareSeries = null;
  let compareNote = '';

  if (compareMode !== TRENDS_COMPARE_NONE) {
    compareSeries = buildTrendsChartComparisonSeries(
      currentBuckets,
      currentRange,
      period,
      compareMode,
      getTrendsFilterState(),
      bucketSize,
      metricKey
    );

    if (
      metricKey === 'costPerParticipant'
      && compareSeries.every((point) => point.value == null)
    ) {
      compareSeries = null;
      compareNote = 'No historical participant data is available for the selected Cost per Participant comparison.';
    }
  }

  empty.hidden = true;
  empty.textContent = '';
  wrap.hidden = false;
  updateTrendsChartLegend(compareSeries ? compareLabel : '');
  updateTrendsChartNote(compareNote);
  trendsChartDrawState = {
    series,
    compareSeries,
    metricKey,
    metricLabel,
    compareLabel,
  };
  drawTrendsChartSvg(trendsChartDrawState);
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
  updateTrendsBreakdownSummary(summary, [
    buildTrendsDemandHeadline(metricKey, currentTotal, currentMap.size),
    buildTrendsConcentrationSentence(rows, currentTotal, 3, 'program', 'programs', metricPhrase),
  ]);
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
  updateTrendsBreakdownSummary(summary, [
    buildTrendsReachBreadthSentence(currentEvents),
    buildTrendsConcentrationSentence(rows, currentTotal, 5, 'command', 'commands', metricPhrase),
  ]);
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
  updateTrendsBreakdownSummary(spendingSummary, [
    `${formatTotalRecordedEventCost(currentTotal)} recorded across ${currentMap.size} ${currentMap.size === 1 ? 'program' : 'programs'}`,
    buildTrendsConcentrationSentence(
      rows,
      currentTotal,
      3,
      'program',
      'programs',
      'recorded event costs'
    ),
  ]);
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
  const value = Number(document.getElementById('trends-projection-horizon')?.value);
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

const TRENDS_PROJECTION_MONTH_DAYS = 30.4375;

function getTrendsProjectionChartMetricKey() {
  const value = document.getElementById('trends-projection-metric')?.value;
  if (value === 'completedEvents' || value === 'recordedCost') return value;
  return 'participantReach';
}

function getTrendsProjectionMonthEquivalent(days) {
  if (!(days > 0)) return 0;
  return days / TRENDS_PROJECTION_MONTH_DAYS;
}

function getTrendsProjectionMonthlyPace(total, days) {
  const months = getTrendsProjectionMonthEquivalent(days);
  if (!(months > 0)) return 0;
  const pace = total / months;
  return Number.isFinite(pace) ? pace : 0;
}

function getTrendsProjectionMetricTotal(metrics, metricKey) {
  if (metricKey === 'completedEvents') return metrics.completedEvents;
  if (metricKey === 'recordedCost') return metrics.totalRecordedEventCost;
  return metrics.participantReach;
}

function getTrendsProjectionProjectedTotal(state, metricKey) {
  if (metricKey === 'completedEvents') return state.projectedEvents;
  if (metricKey === 'recordedCost') return state.projectedCost;
  return state.projectedReach;
}

function formatTrendsProjectionHistoricalRaw(metricKey, value) {
  if (metricKey === 'recordedCost') {
    return `${formatTotalRecordedEventCost(value)} over 12 months`;
  }
  if (metricKey === 'completedEvents') {
    const count = Math.round(value);
    const unit = count === 1 ? 'completed event' : 'completed events';
    return `${count} ${unit} over 12 months`;
  }
  const count = Math.round(value);
  if (count === 0) return '0 participant reach';
  const unit = count === 1 ? 'participant' : 'participants';
  return `${count.toLocaleString('en-US')} ${unit} over 12 months`;
}

function formatTrendsProjectionProjectedRaw(metricKey, value) {
  if (metricKey === 'recordedCost') return formatTotalRecordedEventCost(value);
  if (metricKey === 'completedEvents') {
    const count = Math.round(value);
    const unit = count === 1 ? 'completed event' : 'completed events';
    return `${count} ${unit}`;
  }
  const count = Math.round(value);
  if (count === 0) return '0 projected participant reach';
  const unit = count === 1 ? 'participant' : 'participants';
  return `${count.toLocaleString('en-US')} ${unit}`;
}

function formatTrendsProjectionPace(metricKey, pace) {
  if (metricKey === 'recordedCost') {
    return `${formatTotalRecordedEventCost(pace)} / month`;
  }
  const amount = Number.isFinite(pace) ? pace.toFixed(1) : '0.0';
  return `${amount} / month`;
}

function buildTrendsProjectionPaceSentence(metricKey, months, historicalPace) {
  const horizon = months === 6 ? '6-month' : months === 12 ? '12-month' : '3-month';
  if (metricKey === 'recordedCost') {
    return `The ${horizon} projection continues the recent historical pace of approximately ${formatTotalRecordedEventCost(historicalPace)} in recorded event cost per month.`;
  }
  if (metricKey === 'completedEvents') {
    const count = Math.round(historicalPace);
    const unit = count === 1 ? 'completed event' : 'completed events';
    return `The ${horizon} projection continues the recent historical pace of approximately ${count} ${unit} per month.`;
  }
  const count = Math.round(historicalPace);
  const unit = count === 1 ? 'participant' : 'participants';
  return `The ${horizon} projection continues the recent historical pace of approximately ${count} ${unit} per month.`;
}

function getTrendsProjectionMetricName(metricKey) {
  if (metricKey === 'completedEvents') return 'Completed Events';
  if (metricKey === 'recordedCost') return 'Recorded Event Cost';
  return 'Participant Reach';
}

function renderTrendsProjectionPaceChart() {
  const viz = document.getElementById('trends-projection-viz');
  const paceEl = document.getElementById('trends-projection-pace');
  const summary = document.getElementById('trends-projection-pace-summary');
  if (!viz || !paceEl || !summary) return;

  const state = trendsProjectionViewState;
  if (!state) {
    viz.hidden = true;
    paceEl.replaceChildren();
    summary.hidden = true;
    summary.textContent = '';
    return;
  }

  const metricKey = getTrendsProjectionChartMetricKey();
  const historicalTotal = getTrendsProjectionMetricTotal(state.historicalMetrics, metricKey);
  const projectedTotal = getTrendsProjectionProjectedTotal(state, metricKey);
  const historicalPace = getTrendsProjectionMonthlyPace(historicalTotal, state.basisDays);
  const projectedPace = getTrendsProjectionMonthlyPace(projectedTotal, state.horizonDays);
  const scaleMax = Math.max(historicalPace, projectedPace);
  const historicalWidth = scaleMax > 0 ? (historicalPace / scaleMax) * 100 : 0;
  const projectedWidth = scaleMax > 0 ? (projectedPace / scaleMax) * 100 : 0;
  const horizonLabel = `Projected ${state.months} Months`;
  const historicalRange = formatTrendsProjectionRange(state.windows.basis);
  const projectedRange = formatTrendsProjectionRange(state.windows.projection);
  const historicalRaw = formatTrendsProjectionHistoricalRaw(metricKey, historicalTotal);
  const projectedRaw = formatTrendsProjectionProjectedRaw(metricKey, projectedTotal);
  const historicalPaceText = formatTrendsProjectionPace(metricKey, historicalPace);
  const projectedPaceText = formatTrendsProjectionPace(metricKey, projectedPace);

  viz.hidden = false;
  paceEl.replaceChildren();

  const grid = document.createElement('div');
  grid.className = 'trends-projection-pace-grid';
  grid.setAttribute('role', 'img');
  grid.setAttribute(
    'aria-label',
    `${getTrendsProjectionMetricName(metricKey)}. Historical Basis ${historicalRange}: ${historicalRaw}, ${historicalPaceText}. ${horizonLabel} ${projectedRange}: ${projectedRaw}, ${projectedPaceText}.`
  );

  const historicalPanel = document.createElement('div');
  historicalPanel.className = 'trends-projection-pace-panel';
  const historicalTitle = document.createElement('div');
  historicalTitle.className = 'trends-projection-pace-title';
  historicalTitle.textContent = 'Historical Basis';
  const historicalRawEl = document.createElement('div');
  historicalRawEl.className = 'trends-projection-pace-raw';
  historicalRawEl.textContent = historicalRaw;
  const historicalTrack = document.createElement('div');
  historicalTrack.className = 'trends-projection-pace-track';
  const historicalBar = document.createElement('div');
  historicalBar.className = 'trends-projection-pace-bar trends-projection-pace-bar-historical';
  historicalBar.style.width = `${historicalWidth}%`;
  historicalTrack.append(historicalBar);
  const historicalRate = document.createElement('div');
  historicalRate.className = 'trends-projection-pace-rate';
  historicalRate.textContent = historicalPaceText;
  const historicalDates = document.createElement('div');
  historicalDates.className = 'trends-projection-pace-dates';
  historicalDates.textContent = historicalRange;
  historicalPanel.append(historicalTitle, historicalRawEl, historicalTrack, historicalRate, historicalDates);

  const projectedPanel = document.createElement('div');
  projectedPanel.className = 'trends-projection-pace-panel trends-projection-pace-panel-projected';
  const projectedKicker = document.createElement('div');
  projectedKicker.className = 'trends-projection-pace-kicker';
  projectedKicker.textContent = 'Projected';
  const projectedTitle = document.createElement('div');
  projectedTitle.className = 'trends-projection-pace-title';
  projectedTitle.textContent = horizonLabel;
  const projectedRawEl = document.createElement('div');
  projectedRawEl.className = 'trends-projection-pace-raw';
  projectedRawEl.textContent = projectedRaw;
  const projectedTrack = document.createElement('div');
  projectedTrack.className = 'trends-projection-pace-track';
  const projectedBar = document.createElement('div');
  projectedBar.className = 'trends-projection-pace-bar trends-projection-pace-bar-projected';
  projectedBar.style.width = `${projectedWidth}%`;
  projectedTrack.append(projectedBar);
  const projectedRate = document.createElement('div');
  projectedRate.className = 'trends-projection-pace-rate';
  projectedRate.textContent = projectedPaceText;
  const projectedDates = document.createElement('div');
  projectedDates.className = 'trends-projection-pace-dates';
  projectedDates.textContent = projectedRange;
  projectedPanel.append(
    projectedKicker,
    projectedTitle,
    projectedRawEl,
    projectedTrack,
    projectedRate,
    projectedDates
  );

  grid.append(historicalPanel, projectedPanel);
  paceEl.append(grid);

  summary.textContent = buildTrendsProjectionPaceSentence(metricKey, state.months, historicalPace);
  summary.hidden = false;
}

function renderTrendsProjectionSection(filters) {
  const empty = document.getElementById('trends-projection-empty');
  const body = document.getElementById('trends-projection-body');
  const metricsEl = document.getElementById('trends-projection-metrics');
  const methodEl = document.getElementById('trends-projection-method');
  if (!empty || !body || !metricsEl || !methodEl) return;

  const months = getTrendsProjectionHorizonMonths();
  const windows = getTrendsProjectionWindows(new Date(), months);
  const basisEvents = getTrendsEventsForRange(windows.basis, filters);

  if (!basisEvents.length) {
    trendsProjectionViewState = null;
    body.hidden = true;
    metricsEl.replaceChildren();
    methodEl.replaceChildren();
    renderTrendsProjectionPaceChart();
    empty.textContent = 'No finalized historical data is available to calculate a projection.';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  empty.textContent = '';
  body.hidden = false;

  const historicalMetrics = calculateTrendsMetrics(basisEvents);
  const basisDays = inclusiveDayCount(windows.basis.start, windows.basis.end);
  const horizonDays = inclusiveDayCount(windows.projection.start, windows.projection.end);
  const projectedEvents = Math.round(
    projectTrendsMetric(historicalMetrics.completedEvents, basisDays, horizonDays)
  );
  const projectedReach = Math.round(
    projectTrendsMetric(historicalMetrics.participantReach, basisDays, horizonDays)
  );
  const projectedCost = projectTrendsMetric(
    historicalMetrics.totalRecordedEventCost,
    basisDays,
    horizonDays
  );

  trendsProjectionViewState = {
    months,
    windows,
    basisDays,
    horizonDays,
    historicalMetrics,
    projectedEvents,
    projectedReach,
    projectedCost,
  };

  const cards = [
    {
      label: 'Projected Completed Events',
      value: String(projectedEvents),
    },
    {
      label: 'Projected Participant Reach',
      value: projectedReach.toLocaleString('en-US'),
    },
    {
      label: 'Projected Recorded Event Cost',
      value: formatTotalRecordedEventCost(projectedCost),
    },
  ];

  metricsEl.replaceChildren();
  cards.forEach((card) => {
    const item = document.createElement('div');
    item.className = 'trends-projection-metric';

    const badge = document.createElement('div');
    badge.className = 'trends-projection-badge';
    badge.textContent = 'Projected';

    const label = document.createElement('div');
    label.className = 'trends-projection-metric-label';
    label.textContent = card.label;

    const value = document.createElement('div');
    value.className = 'trends-projection-metric-value';
    value.textContent = card.value;

    item.append(badge, label, value);
    metricsEl.append(item);
  });

  methodEl.replaceChildren();
  const intro = document.createElement('p');
  intro.textContent = 'Projected from the average daily pace of finalized CREDO activity during the previous 12 months.';
  const basis = document.createElement('p');
  basis.textContent = `Historical basis: ${formatTrendsProjectionRange(windows.basis)}`;
  const horizon = document.createElement('p');
  horizon.textContent = `Projection: ${formatTrendsProjectionRange(windows.projection)}`;
  methodEl.append(intro, basis, horizon);
  renderTrendsProjectionPaceChart();
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
  if (!(amount > 0) || !Number.isFinite(amount)) return 1000;
  if (amount <= 10000) return 1000;
  if (amount <= 50000) return 5000;
  if (amount <= 100000) return 10000;
  if (amount <= 500000) return 50000;
  if (amount <= 2000000) return 100000;
  return 250000;
}

function getTrendsExplorerCleanMax(amount) {
  if (!(amount > 0) || !Number.isFinite(amount)) return 0;
  const increment = getTrendsExplorerRangeIncrement(amount);
  return Math.ceil(amount / increment) * increment;
}

function getTrendsExplorerSliderStep(max, fundingValue) {
  if (!(max > 0) || !Number.isFinite(max)) return 1;
  let step = 1;
  if (max <= 10000) step = 1;
  else if (max <= 100000) step = 1000;
  else if (max <= 1000000) step = 5000;
  else step = 10000;
  const amount = normalizeTrendsExplorerFunding(fundingValue);
  if (amount % step !== 0) return 1;
  return step;
}

function normalizeTrendsExplorerFunding(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function parseTrendsExplorerFunding(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  if (/[-−]/.test(text)) return null;
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function formatTrendsExplorerFunding(amount) {
  const normalizedFunding = normalizeTrendsExplorerFunding(amount);
  return normalizedFunding.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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

function calculateTrendsExplorerScenario(funding, assumptions) {
  const amount = normalizeTrendsExplorerFunding(funding);
  const avgCostPerEvent = assumptions?.avgCostPerEvent;
  if (!(avgCostPerEvent > 0) || !Number.isFinite(avgCostPerEvent)) {
    return {
      funding: amount,
      estimatedEvents: null,
      estimatedReach: null,
      modeledSpend: null,
      remaining: null,
    };
  }

  const estimatedEvents = Math.max(0, Math.floor(amount / avgCostPerEvent));
  const modeledSpend = estimatedEvents * avgCostPerEvent;
  const remaining = Math.max(0, amount - modeledSpend);
  const canEstimateReach = assumptions.participantReach > 0
    && assumptions.avgParticipantsPerEvent != null
    && Number.isFinite(assumptions.avgParticipantsPerEvent);
  const estimatedReach = canEstimateReach
    ? Math.round(estimatedEvents * assumptions.avgParticipantsPerEvent)
    : null;

  return {
    funding: amount,
    estimatedEvents: Number.isFinite(estimatedEvents) ? estimatedEvents : 0,
    estimatedReach: canEstimateReach && Number.isFinite(estimatedReach) ? estimatedReach : null,
    modeledSpend: Number.isFinite(modeledSpend) ? modeledSpend : 0,
    remaining: Number.isFinite(remaining) ? remaining : 0,
  };
}

function calculateTrendsExplorerProgramScenario(allocatedAmount, assumptions) {
  const amount = Number.isFinite(allocatedAmount) && allocatedAmount > 0 ? allocatedAmount : 0;
  const avgCostPerEvent = assumptions?.avgCostPerEvent;
  if (!(avgCostPerEvent > 0) || !Number.isFinite(avgCostPerEvent)) {
    return {
      funding: amount,
      estimatedEvents: 0,
      estimatedReach: null,
      modeledSpend: 0,
      remaining: amount,
    };
  }

  const estimatedEvents = Math.max(0, Math.floor(amount / avgCostPerEvent));
  const modeledSpend = estimatedEvents * avgCostPerEvent;
  const remaining = Math.max(0, amount - modeledSpend);
  const canEstimateReach = assumptions.participantReach > 0
    && assumptions.avgParticipantsPerEvent != null
    && Number.isFinite(assumptions.avgParticipantsPerEvent);
  const estimatedReach = canEstimateReach
    ? Math.round(estimatedEvents * assumptions.avgParticipantsPerEvent)
    : null;

  return {
    funding: amount,
    estimatedEvents: Number.isFinite(estimatedEvents) ? estimatedEvents : 0,
    estimatedReach: canEstimateReach && Number.isFinite(estimatedReach) ? estimatedReach : null,
    modeledSpend: Number.isFinite(modeledSpend) ? modeledSpend : 0,
    remaining: Number.isFinite(remaining) ? remaining : 0,
  };
}

function aggregateTrendsExplorerPrograms(eligibleEvents) {
  const map = new Map();
  eligibleEvents.forEach((event) => {
    const { key, label } = normalizeTrendsDemandEventType(event);
    const existing = map.get(key) || { key, label, events: [] };
    existing.events.push(event);
    map.set(key, existing);
  });

  return [...map.values()]
    .map((entry) => {
      const assumptions = calculateTrendsExplorerAssumptions(entry.events);
      return {
        key: entry.key,
        label: entry.label,
        assumptions,
      };
    })
    .filter((program) => (
      program.assumptions.completedEvents > 0
      && program.assumptions.avgCostPerEvent > 0
      && Number.isFinite(program.assumptions.avgCostPerEvent)
    ))
    .sort((a, b) => {
      if (b.assumptions.recordedCost !== a.assumptions.recordedCost) {
        return b.assumptions.recordedCost - a.assumptions.recordedCost;
      }
      return a.label.localeCompare(b.label);
    });
}

function allocateTrendsExplorerIntegerPercents(items, totalPoints) {
  const safeTotal = Number.isFinite(totalPoints) ? Math.max(0, Math.round(totalPoints)) : 0;
  if (!items.length) return {};
  if (safeTotal <= 0) {
    return Object.fromEntries(items.map((item) => [item.key, 0]));
  }

  const shareSum = items.reduce((sum, item) => sum + (Number(item.share) > 0 ? Number(item.share) : 0), 0);
  const exactItems = items.map((item) => {
    const share = Number(item.share) > 0 ? Number(item.share) : 0;
    const exact = shareSum > 0 ? (share / shareSum) * safeTotal : safeTotal / items.length;
    const floored = Math.floor(exact);
    return {
      key: item.key,
      label: item.label || item.key,
      percent: floored,
      remainder: exact - floored,
    };
  });

  let leftover = safeTotal - exactItems.reduce((sum, item) => sum + item.percent, 0);
  if (leftover < 0) leftover = 0;
  const ranked = [...exactItems].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.label.localeCompare(b.label);
  });
  for (let index = 0; index < leftover; index += 1) {
    ranked[index % ranked.length].percent += 1;
  }

  return Object.fromEntries(exactItems.map((item) => [item.key, item.percent]));
}

function getTrendsExplorerHistoricalAllocationPercents(programs) {
  if (!programs.length) return {};
  if (programs.length === 1) return { [programs[0].key]: 100 };
  return allocateTrendsExplorerIntegerPercents(
    programs.map((program) => ({
      key: program.key,
      label: program.label,
      share: program.assumptions.recordedCost,
    })),
    100
  );
}

function resolveTrendsExplorerAllocations(programs, storedAllocations) {
  const historical = getTrendsExplorerHistoricalAllocationPercents(programs);
  if (!programs.length) return {};
  if (!storedAllocations) return historical;

  const currentKeys = programs.map((program) => program.key);
  const preservedKeys = currentKeys.filter((key) => storedAllocations[key] != null);
  const addedKeys = currentKeys.filter((key) => storedAllocations[key] == null);

  if (preservedKeys.length === 0) return historical;

  if (addedKeys.length === 0) {
    if (preservedKeys.length === 1) return { [preservedKeys[0]]: 100 };
    const preservedItems = programs
      .filter((program) => preservedKeys.includes(program.key))
      .map((program) => ({
        key: program.key,
        label: program.label,
        share: storedAllocations[program.key] || 0,
      }));
    if (preservedItems.every((item) => !(item.share > 0))) return historical;
    return allocateTrendsExplorerIntegerPercents(preservedItems, 100);
  }

  const totalCost = programs.reduce((sum, program) => sum + program.assumptions.recordedCost, 0);
  const addedCost = programs
    .filter((program) => addedKeys.includes(program.key))
    .reduce((sum, program) => sum + program.assumptions.recordedCost, 0);
  if (!(totalCost > 0)) return historical;
  const addedShare = addedCost / totalCost;
  if (!(addedShare > 0) || addedShare >= 1) return historical;

  const addedTarget = Math.round(addedShare * 100);
  if (addedTarget >= 100) return historical;

  const addedItems = programs
    .filter((program) => addedKeys.includes(program.key))
    .map((program) => ({
      key: program.key,
      label: program.label,
      share: program.assumptions.recordedCost,
    }));
  const addedPercents = addedTarget > 0
    ? allocateTrendsExplorerIntegerPercents(addedItems, addedTarget)
    : Object.fromEntries(addedItems.map((item) => [item.key, 0]));
  const addedTotal = Object.values(addedPercents).reduce((sum, percent) => sum + percent, 0);
  const preservedTarget = Math.max(0, 100 - addedTotal);
  const preservedItems = programs
    .filter((program) => preservedKeys.includes(program.key))
    .map((program) => ({
      key: program.key,
      label: program.label,
      share: storedAllocations[program.key] || 0,
    }));
  if (preservedItems.every((item) => !(item.share > 0))) {
    preservedItems.forEach((item) => {
      item.share = 1;
    });
  }
  const preservedPercents = allocateTrendsExplorerIntegerPercents(preservedItems, preservedTarget);
  return { ...addedPercents, ...preservedPercents };
}

function pruneTrendsExplorerHeldKeys(programs) {
  const allowed = new Set((programs || []).map((program) => program.key));
  trendsExplorerHeldKeys = new Set([...trendsExplorerHeldKeys].filter((key) => allowed.has(key)));
  return trendsExplorerHeldKeys;
}

function setTrendsExplorerAllocationConstraintVisible(visible) {
  const el = document.getElementById('trends-explorer-allocation-constraint');
  if (!el) return;
  el.hidden = !visible;
}

function getTrendsExplorerHoldLabel(programLabel, held) {
  return held
    ? `Keep ${programLabel} at its current allocation while other programs are adjusted. Activate to allow automatic changes.`
    : `Keep ${programLabel} at its current allocation while other programs are adjusted.`;
}

function updateTrendsExplorerHoldControls(programs) {
  pruneTrendsExplorerHeldKeys(programs);
  const heldCount = trendsExplorerHeldKeys.size;
  const clearBtn = document.getElementById('trends-explorer-allocation-clear');
  if (clearBtn) clearBtn.hidden = heldCount < 2;

  document.querySelectorAll('[data-explorer-hold]').forEach((button) => {
    const programKey = button.dataset.explorerHold;
    const held = trendsExplorerHeldKeys.has(programKey);
    const label = button.dataset.explorerHoldLabel || programKey;
    button.setAttribute('aria-pressed', held ? 'true' : 'false');
    button.setAttribute('aria-label', getTrendsExplorerHoldLabel(label, held));
    button.classList.toggle('is-selected', held);
  });
}

function toggleTrendsExplorerHold(programKey) {
  if (!programKey) return;
  if (trendsExplorerHeldKeys.has(programKey)) {
    trendsExplorerHeldKeys.delete(programKey);
    setTrendsExplorerAllocationConstraintVisible(false);
  } else {
    trendsExplorerHeldKeys.add(programKey);
  }
  updateTrendsExplorerHoldControls(trendsExplorerViewState?.programs || []);
}

function clearTrendsExplorerHolds() {
  if (!trendsExplorerHeldKeys.size) return;
  trendsExplorerHeldKeys = new Set();
  setTrendsExplorerAllocationConstraintVisible(false);
  updateTrendsExplorerHoldControls(trendsExplorerViewState?.programs || []);
}

function redistributeTrendsExplorerAllocations(programs, currentPercents, editedKey, editedPercent, heldKeys = []) {
  if (programs.length === 1) {
    return { percents: { [programs[0].key]: 100 }, blocked: false };
  }

  const requested = Math.max(0, Math.min(100, Math.round(editedPercent)));
  const heldSet = new Set(
    (heldKeys || []).filter((key) => (
      key !== editedKey && programs.some((program) => program.key === key)
    ))
  );
  const heldPrograms = programs.filter((program) => heldSet.has(program.key));
  const flexiblePrograms = programs.filter((program) => (
    program.key !== editedKey && !heldSet.has(program.key)
  ));
  const heldTotal = heldPrograms.reduce(
    (sum, program) => sum + (currentPercents[program.key] || 0),
    0
  );
  const maxEdited = Math.max(0, 100 - heldTotal);
  const nextPercent = Math.max(0, Math.min(maxEdited, requested));
  const remaining = Math.max(0, 100 - nextPercent - heldTotal);
  const blocked = flexiblePrograms.length === 0 && requested !== nextPercent;
  const heldPercents = Object.fromEntries(
    heldPrograms.map((program) => [program.key, currentPercents[program.key] || 0])
  );

  if (flexiblePrograms.length === 0) {
    return {
      percents: {
        [editedKey]: nextPercent,
        ...heldPercents,
      },
      blocked,
    };
  }

  const positiveFlexible = flexiblePrograms.filter((program) => (currentPercents[program.key] || 0) > 0);
  const flexibleItems = flexiblePrograms.map((program) => {
    let share = 0;
    if (remaining <= 0) share = 0;
    else if (positiveFlexible.length > 0) share = currentPercents[program.key] || 0;
    else share = 1;
    return {
      key: program.key,
      label: program.label,
      share,
    };
  });
  const flexiblePercents = allocateTrendsExplorerIntegerPercents(flexibleItems, remaining);
  return {
    percents: {
      [editedKey]: nextPercent,
      ...heldPercents,
      ...flexiblePercents,
    },
    blocked: false,
  };
}

function calculateTrendsExplorerAllocatedTotals(funding, programs, percents) {
  const scenarioFunding = normalizeTrendsExplorerFunding(funding);
  const rows = programs.map((program) => {
    const percent = percents[program.key] || 0;
    const allocated = scenarioFunding * percent / 100;
    const scenario = calculateTrendsExplorerProgramScenario(allocated, program.assumptions);
    return {
      program,
      percent,
      allocated,
      scenario,
    };
  });

  const estimatedEvents = rows.reduce((sum, row) => sum + (row.scenario.estimatedEvents || 0), 0);
  const allocatedRows = rows.filter((row) => row.percent > 0);
  const reachRows = allocatedRows.filter((row) => row.scenario.estimatedReach != null);
  const missingReachRows = allocatedRows.filter((row) => row.scenario.estimatedReach == null);
  const estimatedReach = reachRows.length
    ? reachRows.reduce((sum, row) => sum + row.scenario.estimatedReach, 0)
    : null;
  const modeledSpend = rows.reduce((sum, row) => sum + (row.scenario.modeledSpend || 0), 0);
  const remaining = Math.max(0, scenarioFunding - modeledSpend);

  return {
    funding: scenarioFunding,
    rows,
    estimatedEvents: Number.isFinite(estimatedEvents) ? estimatedEvents : 0,
    estimatedReach: estimatedReach != null && Number.isFinite(estimatedReach) ? estimatedReach : null,
    reachIncomplete: missingReachRows.length,
    modeledSpend: Number.isFinite(modeledSpend) ? modeledSpend : 0,
    remaining: Number.isFinite(remaining) ? remaining : 0,
  };
}

function formatTrendsExplorerSignedCount(delta, singular, plural) {
  if (!Number.isFinite(delta) || delta === 0) return null;
  const amount = Math.abs(delta).toLocaleString('en-US');
  const unit = Math.abs(delta) === 1 ? singular : plural;
  return `${delta > 0 ? '+' : '−'}${amount} ${unit}`;
}

function formatTrendsExplorerSignedCurrency(delta, label) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) return null;
  const amount = formatTrendsExplorerCurrencyAuto(Math.abs(delta));
  return `${delta > 0 ? '+' : '−'}${amount} ${label}`;
}

function formatTrendsExplorerPointChange(delta) {
  if (!Number.isFinite(delta) || delta === 0) return 'No change';
  return delta > 0 ? `+${delta} pts` : `−${Math.abs(delta)} pts`;
}

function allocationsMatchTrendsExplorerBaseline(programs, currentPercents, baselinePercents) {
  return programs.every((program) => (
    (currentPercents[program.key] || 0) === (baselinePercents[program.key] || 0)
  ));
}

function getTrendsExplorerComparisonState(funding, programs, currentPercents) {
  const baselinePercents = getTrendsExplorerHistoricalAllocationPercents(programs);
  const current = calculateTrendsExplorerAllocatedTotals(funding, programs, currentPercents);
  const baseline = calculateTrendsExplorerAllocatedTotals(funding, programs, baselinePercents);
  return {
    funding: current.funding,
    current,
    baseline,
    baselinePercents,
    matchesBaseline: allocationsMatchTrendsExplorerBaseline(programs, currentPercents, baselinePercents),
  };
}

function hideTrendsExplorerComparison() {
  const section = document.getElementById('trends-explorer-comparison');
  if (section) section.hidden = true;
}

function renderTrendsExplorerComparison(currentTotals) {
  const section = document.getElementById('trends-explorer-comparison');
  const aggregatesEl = document.getElementById('trends-explorer-comparison-aggregates');
  const programsEl = document.getElementById('trends-explorer-comparison-programs');
  const reachNoteEl = document.getElementById('trends-explorer-comparison-reach-note');
  if (!section || !aggregatesEl || !programsEl || !reachNoteEl) return;

  const programs = trendsExplorerViewState?.programs || [];
  const currentPercents = trendsExplorerViewState?.allocations;
  if (programs.length < 2 || !currentPercents) {
    hideTrendsExplorerComparison();
    aggregatesEl.replaceChildren();
    programsEl.replaceChildren();
    reachNoteEl.hidden = true;
    reachNoteEl.textContent = '';
    return;
  }

  const comparison = getTrendsExplorerComparisonState(
    currentTotals.funding,
    programs,
    currentPercents
  );
  const { baseline, current, baselinePercents, matchesBaseline } = comparison;
  if (matchesBaseline) {
    hideTrendsExplorerComparison();
    aggregatesEl.replaceChildren();
    programsEl.replaceChildren();
    reachNoteEl.hidden = true;
    reachNoteEl.textContent = '';
    return;
  }

  section.hidden = false;

  const eventChip = formatTrendsExplorerSignedCount(
    current.estimatedEvents - baseline.estimatedEvents,
    'estimated event',
    'estimated events'
  );
  const spendChip = formatTrendsExplorerSignedCurrency(
    current.modeledSpend - baseline.modeledSpend,
    'modeled event spend'
  );
  const remainingChip = formatTrendsExplorerSignedCurrency(
    current.remaining - baseline.remaining,
    'remaining funding'
  );
  const reachClean = baseline.estimatedReach != null
    && current.estimatedReach != null
    && baseline.reachIncomplete === 0
    && current.reachIncomplete === 0;
  const reachChip = reachClean
    ? formatTrendsExplorerSignedCount(
      current.estimatedReach - baseline.estimatedReach,
      'participant engagement',
      'participant engagements'
    )
    : null;

  aggregatesEl.replaceChildren();
  const chips = [eventChip, reachChip, spendChip].filter(Boolean);
  if (chips.length === 0 && remainingChip) chips.push(remainingChip);
  if (chips.length === 0) {
    const unchanged = document.createElement('p');
    unchanged.className = 'trends-explorer-comparison-unchanged';
    unchanged.textContent = 'Estimated totals are unchanged at this funding level.';
    aggregatesEl.append(unchanged);
  } else {
    chips.forEach((text) => {
      const chip = document.createElement('span');
      chip.className = 'trends-explorer-comparison-chip';
      chip.textContent = text;
      aggregatesEl.append(chip);
    });
  }

  if (!reachClean && (baseline.reachIncomplete > 0 || current.reachIncomplete > 0
    || baseline.estimatedReach == null || current.estimatedReach == null)) {
    reachNoteEl.textContent = 'Participant comparison excludes programs without historical participant data.';
    reachNoteEl.hidden = false;
  } else {
    reachNoteEl.textContent = '';
    reachNoteEl.hidden = true;
  }

  programsEl.replaceChildren();
  current.rows.forEach((row) => {
    const startingPercent = baselinePercents[row.program.key] || 0;
    const currentPercent = row.percent || 0;
    if (currentPercent === startingPercent) return;
    const change = formatTrendsExplorerPointChange(currentPercent - startingPercent);
    const programRow = document.createElement('div');
    programRow.className = 'trends-explorer-comparison-program';
    programRow.setAttribute(
      'aria-label',
      `${row.program.label} ${startingPercent} percent to ${currentPercent} percent, ${change}.`
    );
    const name = document.createElement('div');
    name.className = 'trends-explorer-comparison-program-name';
    name.textContent = row.program.label;
    const detail = document.createElement('div');
    detail.className = 'trends-explorer-comparison-program-change';
    detail.textContent = `${startingPercent}% → ${currentPercent}%  (${change})`;
    programRow.append(name, detail);
    programsEl.append(programRow);
  });
}

function refreshTrendsExplorerAllocatedViews(currentTotals) {
  renderTrendsExplorerTotals(currentTotals);
  renderTrendsExplorerAllocation(currentTotals);
  renderTrendsExplorerComparison(currentTotals);
}

function resolveTrendsExplorerSliderMax(historicalCost, funding, existingMax) {
  const defaultMax = getTrendsExplorerCleanMax(historicalCost * 2);
  const fundingMax = funding > defaultMax ? getTrendsExplorerCleanMax(funding) : 0;
  const nextMax = Math.max(defaultMax, fundingMax, existingMax || 0, funding || 0);
  return Number.isFinite(nextMax) ? nextMax : 0;
}

function applyTrendsExplorerFunding(amount, options = {}) {
  const fromUser = Boolean(options.fromUser);
  const normalized = normalizeTrendsExplorerFunding(amount);
  if (fromUser) {
    trendsExplorerUserFunding = normalized;
  }
  const assumptions = trendsExplorerViewState?.assumptions;
  if (!assumptions) return;
  const historicalCost = assumptions.recordedCost;
  trendsExplorerSliderMax = resolveTrendsExplorerSliderMax(
    historicalCost,
    normalized,
    trendsExplorerSliderMax
  );
  if (trendsExplorerViewState) {
    trendsExplorerViewState.funding = normalized;
  }
  updateTrendsExplorerControls(normalized, trendsExplorerSliderMax);
  renderTrendsExplorerOutputs(normalized, assumptions);
}

function updateTrendsExplorerControls(funding, sliderMax) {
  const input = document.getElementById('trends-explorer-funding-input');
  const slider = document.getElementById('trends-explorer-funding-slider');
  const fundingValue = normalizeTrendsExplorerFunding(funding);
  const step = getTrendsExplorerSliderStep(sliderMax, fundingValue);
  const max = Math.max(0, sliderMax);

  if (slider) {
    slider.min = '0';
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(fundingValue);
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuemax', String(max));
    slider.setAttribute('aria-valuenow', String(fundingValue));
    slider.setAttribute('aria-valuetext', formatTrendsExplorerFunding(fundingValue));
  }

  if (input && document.activeElement !== input) {
    input.value = formatTrendsExplorerFunding(fundingValue);
  }
}

function buildTrendsExplorerSummary(scenario, options = {}) {
  const fundingText = formatTrendsExplorerFunding(scenario.funding);
  const events = scenario.estimatedEvents;
  if (events == null || !Number.isFinite(events)) return '';
  const eventUnit = events === 1 ? 'completed event' : 'completed events';
  const prefix = options.allocationMode
    ? 'Based on the selected program allocations'
    : 'Based on the selected historical data';
  const ratePhrase = options.allocationMode
    ? 'using observed historical delivery rates'
    : 'at the observed historical delivery rate';

  if (scenario.estimatedReach == null) {
    if (options.allocationMode) {
      return `${prefix}, ${fundingText} could support approximately ${events.toLocaleString('en-US')} ${eventUnit} ${ratePhrase}. Participant reach is unavailable for the allocated programs.`;
    }
    return `${prefix}, ${fundingText} could support approximately ${events.toLocaleString('en-US')} ${eventUnit} ${ratePhrase}.`;
  }

  const reach = scenario.estimatedReach;
  const reachUnit = reach === 1 ? 'participant engagement' : 'participant engagements';
  const reachCount = reach.toLocaleString('en-US');
  if (options.reachIncomplete > 0) {
    const excluded = options.reachIncomplete;
    const programUnit = excluded === 1 ? 'allocated program' : 'allocated programs';
    return `${prefix}, ${fundingText} could support approximately ${events.toLocaleString('en-US')} ${eventUnit} and ${reachCount}+ ${reachUnit} ${ratePhrase}. Participant reach excludes ${excluded} ${programUnit} without historical participant data.`;
  }
  return `${prefix}, ${fundingText} could support approximately ${events.toLocaleString('en-US')} ${eventUnit} and ${reachCount} ${reachUnit} ${ratePhrase}.`;
}

function renderTrendsExplorerOutputs(funding, assumptions) {
  const eventsEl = document.getElementById('trends-explorer-events-value');
  const reachEl = document.getElementById('trends-explorer-reach-value');
  const fundingEl = document.getElementById('trends-explorer-funding-value');
  const spendEl = document.getElementById('trends-explorer-spend');
  const reachNoteEl = document.getElementById('trends-explorer-reach-note');
  const summaryEl = document.getElementById('trends-explorer-summary');
  if (!eventsEl || !reachEl || !fundingEl || !spendEl || !summaryEl) return;

  const programs = trendsExplorerViewState?.programs || [];
  const percents = trendsExplorerViewState?.allocations;
  if (programs.length && percents) {
    const totals = calculateTrendsExplorerAllocatedTotals(funding, programs, percents);
    refreshTrendsExplorerAllocatedViews(totals);
    return;
  }

  hideTrendsExplorerComparison();

  if (reachNoteEl) {
    reachNoteEl.hidden = true;
    reachNoteEl.textContent = '';
  }

  const scenario = calculateTrendsExplorerScenario(funding, assumptions);
  eventsEl.textContent = scenario.estimatedEvents == null
    ? '—'
    : String(scenario.estimatedEvents);
  reachEl.textContent = scenario.estimatedReach == null
    ? '—'
    : scenario.estimatedReach.toLocaleString('en-US');
  fundingEl.textContent = formatTrendsExplorerFunding(scenario.funding);

  if (scenario.modeledSpend == null || scenario.remaining == null) {
    spendEl.hidden = true;
    spendEl.textContent = '';
    summaryEl.hidden = true;
    summaryEl.textContent = '';
    return;
  }

  spendEl.textContent = `Modeled event spend: ${formatTrendsExplorerCurrencyAuto(scenario.modeledSpend)}. Remaining scenario funding: ${formatTrendsExplorerCurrencyAuto(scenario.remaining)}.`;
  spendEl.hidden = false;
  summaryEl.textContent = buildTrendsExplorerSummary(scenario);
  summaryEl.hidden = false;
}

function renderTrendsExplorerTotals(totals) {
  const eventsEl = document.getElementById('trends-explorer-events-value');
  const reachEl = document.getElementById('trends-explorer-reach-value');
  const fundingEl = document.getElementById('trends-explorer-funding-value');
  const spendEl = document.getElementById('trends-explorer-spend');
  const reachNoteEl = document.getElementById('trends-explorer-reach-note');
  const summaryEl = document.getElementById('trends-explorer-summary');
  if (!eventsEl || !reachEl || !fundingEl || !spendEl || !summaryEl) return;

  eventsEl.textContent = String(totals.estimatedEvents);
  if (totals.estimatedReach == null) {
    reachEl.textContent = '—';
  } else if (totals.reachIncomplete > 0) {
    reachEl.textContent = `${totals.estimatedReach.toLocaleString('en-US')}+`;
  } else {
    reachEl.textContent = totals.estimatedReach.toLocaleString('en-US');
  }
  fundingEl.textContent = formatTrendsExplorerFunding(totals.funding);

  spendEl.textContent = `Modeled event spend: ${formatTrendsExplorerCurrencyAuto(totals.modeledSpend)}. Remaining scenario funding: ${formatTrendsExplorerCurrencyAuto(totals.remaining)}.`;
  spendEl.hidden = false;

  if (reachNoteEl) {
    if (totals.reachIncomplete > 0 && totals.estimatedReach != null) {
      const programUnit = totals.reachIncomplete === 1 ? 'allocated program' : 'allocated programs';
      reachNoteEl.textContent = `Participant reach excludes ${totals.reachIncomplete} ${programUnit} without historical participant data.`;
      reachNoteEl.hidden = false;
    } else {
      reachNoteEl.textContent = '';
      reachNoteEl.hidden = true;
    }
  }

  summaryEl.textContent = buildTrendsExplorerSummary(totals, {
    allocationMode: true,
    reachIncomplete: totals.reachIncomplete,
  });
  summaryEl.hidden = false;
}

function formatTrendsExplorerAllocationHistory(assumptions) {
  const costText = assumptions.avgCostPerEvent != null && Number.isFinite(assumptions.avgCostPerEvent)
    ? formatTotalRecordedEventCost(assumptions.avgCostPerEvent)
    : '—';
  const reachText = assumptions.avgParticipantsPerEvent != null && Number.isFinite(assumptions.avgParticipantsPerEvent)
    ? assumptions.avgParticipantsPerEvent.toFixed(1)
    : '—';
  return `Avg cost/event: ${costText}. Avg participants/event: ${reachText}.`;
}

function formatTrendsExplorerAllocationScenario(row) {
  const eventsText = String(row.scenario.estimatedEvents || 0);
  const reachText = row.scenario.estimatedReach == null
    ? '—'
    : row.scenario.estimatedReach.toLocaleString('en-US');
  const unusedText = formatTrendsExplorerCurrencyAuto(row.scenario.remaining || 0);
  return `Estimated Events: ${eventsText}. Estimated Reach: ${reachText}. Unused Allocation: ${unusedText}.`;
}

function updateTrendsExplorerAllocationRow(rowEl, row, singleProgram) {
  const percentEl = rowEl.querySelector('[data-explorer-percent]');
  const dollarsEl = rowEl.querySelector('[data-explorer-dollars]');
  const historyEl = rowEl.querySelector('[data-explorer-history]');
  const scenarioEl = rowEl.querySelector('[data-explorer-scenario]');
  const slider = rowEl.querySelector('[data-explorer-program]');
  const holdBtn = rowEl.querySelector('[data-explorer-hold]');
  const held = trendsExplorerHeldKeys.has(row.program.key);
  if (percentEl) percentEl.textContent = `${row.percent}%`;
  if (dollarsEl) dollarsEl.textContent = formatTrendsExplorerFunding(row.allocated);
  if (historyEl) historyEl.textContent = formatTrendsExplorerAllocationHistory(row.program.assumptions);
  if (scenarioEl) scenarioEl.textContent = formatTrendsExplorerAllocationScenario(row);
  if (holdBtn) {
    holdBtn.dataset.explorerHoldLabel = row.program.label;
    holdBtn.setAttribute('aria-pressed', held ? 'true' : 'false');
    holdBtn.setAttribute('aria-label', getTrendsExplorerHoldLabel(row.program.label, held));
    holdBtn.classList.toggle('is-selected', held);
  }
  if (slider) {
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(row.percent);
    slider.disabled = Boolean(singleProgram);
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuemax', '100');
    slider.setAttribute('aria-valuenow', String(row.percent));
    slider.setAttribute('aria-valuetext', `${row.percent} percent`);
  }
}

function buildTrendsExplorerAllocationRow(row, singleProgram) {
  const rowEl = document.createElement('div');
  rowEl.className = 'trends-explorer-allocation-row';
  rowEl.dataset.explorerProgramRow = row.program.key;
  const held = trendsExplorerHeldKeys.has(row.program.key);

  const programCell = document.createElement('div');
  programCell.className = 'trends-explorer-allocation-program';
  const holdBtn = document.createElement('button');
  holdBtn.type = 'button';
  holdBtn.className = 'trends-explorer-allocation-hold';
  holdBtn.dataset.explorerHold = row.program.key;
  holdBtn.dataset.explorerHoldLabel = row.program.label;
  holdBtn.setAttribute('aria-pressed', held ? 'true' : 'false');
  holdBtn.setAttribute('aria-label', getTrendsExplorerHoldLabel(row.program.label, held));
  if (held) holdBtn.classList.add('is-selected');
  const programCopy = document.createElement('div');
  programCopy.className = 'trends-explorer-allocation-program-copy';
  const nameEl = document.createElement('div');
  nameEl.className = 'trends-explorer-allocation-name';
  nameEl.textContent = row.program.label;
  const historyEl = document.createElement('p');
  historyEl.className = 'trends-explorer-allocation-history';
  historyEl.dataset.explorerHistory = '';
  historyEl.textContent = formatTrendsExplorerAllocationHistory(row.program.assumptions);
  programCopy.append(nameEl, historyEl);
  programCell.append(holdBtn, programCopy);

  const allocationCell = document.createElement('div');
  const allocationLabel = document.createElement('div');
  allocationLabel.className = 'trends-explorer-allocation-kicker';
  allocationLabel.textContent = 'Allocation';
  const percentEl = document.createElement('div');
  percentEl.className = 'trends-explorer-allocation-percent';
  percentEl.dataset.explorerPercent = '';
  percentEl.textContent = `${row.percent}%`;
  const dollarsEl = document.createElement('div');
  dollarsEl.className = 'trends-explorer-allocation-dollars';
  dollarsEl.dataset.explorerDollars = '';
  dollarsEl.textContent = formatTrendsExplorerFunding(row.allocated);
  allocationCell.append(allocationLabel, percentEl, dollarsEl);

  const sliderCell = document.createElement('div');
  sliderCell.className = 'trends-explorer-allocation-slider-cell';
  const sliderId = `trends-explorer-allocation-slider-${row.program.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const sliderLabel = document.createElement('label');
  sliderLabel.className = 'visually-hidden';
  sliderLabel.setAttribute('for', sliderId);
  sliderLabel.textContent = `${row.program.label} allocation percentage`;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = sliderId;
  slider.className = 'trends-explorer-allocation-slider';
  slider.dataset.explorerProgram = row.program.key;
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(row.percent);
  slider.disabled = singleProgram;
  slider.setAttribute('aria-valuemin', '0');
  slider.setAttribute('aria-valuemax', '100');
  slider.setAttribute('aria-valuenow', String(row.percent));
  slider.setAttribute('aria-valuetext', `${row.percent} percent`);
  sliderCell.append(sliderLabel, slider);

  const scenarioCell = document.createElement('div');
  scenarioCell.className = 'trends-explorer-allocation-scenario-cell';
  const scenarioLabel = document.createElement('div');
  scenarioLabel.className = 'trends-explorer-allocation-kicker';
  scenarioLabel.textContent = 'Scenario';
  const scenarioEl = document.createElement('p');
  scenarioEl.className = 'trends-explorer-allocation-scenario';
  scenarioEl.dataset.explorerScenario = '';
  scenarioEl.textContent = formatTrendsExplorerAllocationScenario(row);
  scenarioCell.append(scenarioLabel, scenarioEl);

  rowEl.append(programCell, allocationCell, sliderCell, scenarioCell);
  return rowEl;
}

function renderTrendsExplorerAllocationSummary(totals) {
  const summaryEl = document.getElementById('trends-explorer-allocation-summary');
  if (!summaryEl) return;
  const allocatedPct = totals.rows.reduce((sum, row) => sum + row.percent, 0);
  const programCount = totals.rows.length;
  const programLabel = programCount === 1 ? 'Program' : 'Programs';
  summaryEl.replaceChildren();

  const allocated = document.createElement('span');
  allocated.append('Allocated: ');
  const allocatedValue = document.createElement('strong');
  allocatedValue.textContent = `${allocatedPct}%`;
  allocated.append(allocatedValue);

  const funding = document.createElement('span');
  funding.append('Scenario Funding: ');
  const fundingValue = document.createElement('strong');
  fundingValue.textContent = formatTrendsExplorerFunding(totals.funding);
  funding.append(fundingValue);

  const programs = document.createElement('span');
  programs.append(`${programLabel}: `);
  const programsValue = document.createElement('strong');
  programsValue.textContent = String(programCount);
  programs.append(programsValue);
  summaryEl.append(allocated, funding, programs);
}

function renderTrendsExplorerAllocation(totals) {
  const section = document.getElementById('trends-explorer-allocation');
  const rowsEl = document.getElementById('trends-explorer-allocation-rows');
  if (!section || !rowsEl) return;

  if (!totals.rows.length || totals.rows.length < 2) {
    section.hidden = true;
    rowsEl.replaceChildren();
    setTrendsExplorerAllocationConstraintVisible(false);
    const clearBtn = document.getElementById('trends-explorer-allocation-clear');
    if (clearBtn) clearBtn.hidden = true;
    pruneTrendsExplorerHeldKeys(totals.rows.map((row) => row.program));
    return;
  }

  section.hidden = false;
  pruneTrendsExplorerHeldKeys(totals.rows.map((row) => row.program));
  renderTrendsExplorerAllocationSummary(totals);

  const singleProgram = totals.rows.length === 1;
  const existingRows = [...rowsEl.children];
  const existingKeys = existingRows.map((rowEl) => rowEl.dataset.explorerProgramRow);
  const nextKeys = totals.rows.map((row) => row.program.key);
  const canReuse = existingKeys.length === nextKeys.length
    && nextKeys.every((key, index) => existingKeys[index] === key);

  if (!canReuse) {
    rowsEl.replaceChildren();
    totals.rows.forEach((row) => {
      rowsEl.append(buildTrendsExplorerAllocationRow(row, singleProgram));
    });
  } else {
    existingRows.forEach((rowEl, index) => {
      updateTrendsExplorerAllocationRow(rowEl, totals.rows[index], singleProgram);
    });
  }
  updateTrendsExplorerHoldControls(totals.rows.map((row) => row.program));
}

function applyTrendsExplorerAllocationChange(programKey, editedPercent) {
  const state = trendsExplorerViewState;
  if (!state?.programs?.length) return;
  const result = redistributeTrendsExplorerAllocations(
    state.programs,
    state.allocations || {},
    programKey,
    editedPercent,
    [...trendsExplorerHeldKeys]
  );
  const nextAllocations = result.percents;
  trendsExplorerAllocations = nextAllocations;
  state.allocations = nextAllocations;
  setTrendsExplorerAllocationConstraintVisible(result.blocked);
  const totals = calculateTrendsExplorerAllocatedTotals(state.funding, state.programs, nextAllocations);
  refreshTrendsExplorerAllocatedViews(totals);
}

function resetTrendsExplorerAllocations() {
  const state = trendsExplorerViewState;
  if (!state?.programs?.length) return;
  trendsExplorerHeldKeys = new Set();
  setTrendsExplorerAllocationConstraintVisible(false);
  const historical = getTrendsExplorerHistoricalAllocationPercents(state.programs);
  trendsExplorerAllocations = historical;
  state.allocations = historical;
  const totals = calculateTrendsExplorerAllocatedTotals(state.funding, state.programs, historical);
  refreshTrendsExplorerAllocatedViews(totals);
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
  const allocation = document.getElementById('trends-explorer-allocation');
  trendsExplorerViewState = null;
  pruneTrendsExplorerHeldKeys([]);
  setTrendsExplorerAllocationConstraintVisible(false);
  if (allocation) allocation.hidden = true;
  hideTrendsExplorerComparison();
  if (body) body.hidden = true;
  if (empty) {
    empty.textContent = message;
    empty.hidden = false;
  }
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

  const historicalFunding = normalizeTrendsExplorerFunding(assumptions.recordedCost);
  const funding = trendsExplorerUserFunding != null ? trendsExplorerUserFunding : historicalFunding;
  const defaultMax = getTrendsExplorerCleanMax(assumptions.recordedCost * 2);
  if (trendsExplorerUserFunding == null) {
    trendsExplorerSliderMax = defaultMax;
  }
  trendsExplorerSliderMax = resolveTrendsExplorerSliderMax(
    assumptions.recordedCost,
    funding,
    trendsExplorerSliderMax
  );

  const programs = aggregateTrendsExplorerPrograms(eligibleEvents);
  pruneTrendsExplorerHeldKeys(programs);
  const allocations = resolveTrendsExplorerAllocations(programs, trendsExplorerAllocations);

  trendsExplorerViewState = {
    basis,
    assumptions,
    funding,
    programs,
    allocations,
  };
  renderTrendsExplorerAssumptions(basis, assumptions);
  updateTrendsExplorerControls(funding, trendsExplorerSliderMax);
  renderTrendsExplorerOutputs(funding, assumptions);
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
  renderTrendsProjectionSection(filters);
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
    'trends-compare',
    'trends-event-type',
    'trends-command',
    'trends-start-date',
    'trends-end-date',
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', renderTrends);
  });

  document.getElementById('trends-chart-metric')?.addEventListener('change', () => {
    const currentRange = getTrendsCurrentRange();
    const currentEvents = getTrendsEventsForRange(currentRange, getTrendsFilterState());
    renderTrendsChartSection(currentRange, currentEvents, getTrendsPeriodValue());
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

  document.getElementById('trends-projection-horizon')?.addEventListener('change', () => {
    renderTrendsProjectionSection(getTrendsFilterState());
  });

  document.getElementById('trends-projection-metric')?.addEventListener('change', () => {
    renderTrendsProjectionPaceChart();
  });

  document.getElementById('trends-explorer-funding-slider')?.addEventListener('input', () => {
    const slider = document.getElementById('trends-explorer-funding-slider');
    const parsed = parseTrendsExplorerFunding(slider?.value);
    if (parsed == null) return;
    applyTrendsExplorerFunding(parsed, { fromUser: true });
  });

  const explorerInput = document.getElementById('trends-explorer-funding-input');
  explorerInput?.addEventListener('input', () => {
    const parsed = parseTrendsExplorerFunding(explorerInput.value);
    if (parsed == null) return;
    applyTrendsExplorerFunding(parsed, { fromUser: true });
  });
  explorerInput?.addEventListener('change', () => {
    const parsed = parseTrendsExplorerFunding(explorerInput.value);
    if (parsed == null) {
      const fallback = trendsExplorerUserFunding != null
        ? trendsExplorerUserFunding
        : normalizeTrendsExplorerFunding(trendsExplorerViewState?.assumptions?.recordedCost || 0);
      explorerInput.value = formatTrendsExplorerFunding(fallback);
      return;
    }
    applyTrendsExplorerFunding(parsed, { fromUser: true });
    explorerInput.value = formatTrendsExplorerFunding(parsed);
  });
  explorerInput?.addEventListener('blur', () => {
    const parsed = parseTrendsExplorerFunding(explorerInput.value);
    const fallback = parsed != null
      ? parsed
      : (trendsExplorerUserFunding != null
        ? trendsExplorerUserFunding
        : normalizeTrendsExplorerFunding(trendsExplorerViewState?.assumptions?.recordedCost || 0));
    if (parsed != null) applyTrendsExplorerFunding(parsed, { fromUser: true });
    explorerInput.value = formatTrendsExplorerFunding(fallback);
  });

  document.getElementById('trends-explorer-allocation-rows')?.addEventListener('input', (event) => {
    const slider = event.target.closest('[data-explorer-program]');
    if (!slider) return;
    const parsedPercent = Number.parseInt(slider.value, 10);
    if (!Number.isFinite(parsedPercent)) return;
    applyTrendsExplorerAllocationChange(slider.dataset.explorerProgram, parsedPercent);
  });

  document.getElementById('trends-explorer-allocation-rows')?.addEventListener('click', (event) => {
    const holdBtn = event.target.closest('[data-explorer-hold]');
    if (!holdBtn) return;
    toggleTrendsExplorerHold(holdBtn.dataset.explorerHold);
  });

  document.getElementById('trends-explorer-allocation-reset')?.addEventListener('click', () => {
    resetTrendsExplorerAllocations();
  });

  document.getElementById('trends-explorer-allocation-clear')?.addEventListener('click', () => {
    clearTrendsExplorerHolds();
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
    calendar: 'view-calendar',
    reports: 'view-reports',
    trends: 'view-trends',
    team: 'view-team',
    settings: 'view-settings',
  };

  document.getElementById(viewMap[viewName]).hidden = false;

  if (TRACKER_VIEWS.includes(viewName)) {
    renderDashboard();
  } else if (viewName === 'calendar') {
    renderCalendar();
  } else if (viewName === 'reports') {
    switchReportsTab(reportsTab);
  } else if (viewName === 'trends') {
    renderTrends();
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
  } else if (currentView === 'calendar') {
    renderCalendar();
  } else if (currentView === 'reports') {
    if (reportsTab === 'event-reports') {
      renderReports();
    } else if (reportsTab === 'aar') {
      renderAarSearch();
    } else if (reportsTab === 'mir') {
      renderMirReport();
    }
  } else if (currentView === 'trends') {
    renderTrends();
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
  form.querySelector('[name="command"]').value =
    isTbd(event.command) ? '' : event.command;
  form.querySelector('[name="participants"]').value =
    isTbd(event.participants) ? '' : String(event.participants);
  form.querySelector('[name="location"]').value =
    isTbd(event.location) ? '' : event.location;
  form.querySelector('[name="venue"]').value = event.venue || '';
  form.querySelector('[name="venueCost"]').value = event.venueCost || '';
  form.querySelector('[name="cateringVendor"]').value = event.cateringVendor || '';
  form.querySelector('[name="cateringCost"]').value = event.cateringCost || '';
  form.querySelector('[name="lodgingCost"]').value = event.lodgingCost || '';
  form.querySelector('[name="transportationCost"]').value = event.transportationCost || '';
  form.querySelector('[name="materialsCost"]').value = event.materialsCost || '';
  form.querySelector('[name="otherCost"]').value = event.otherCost || '';
  form.querySelector('[name="otherCostDescription"]').value = event.otherCostDescription || '';
  setAdditionalEventCostsExpanded(hasAdditionalEventCostData(event));
  updateEventTotalRecordedCost(form);
  form.querySelector('[name="facilitators"]').value = event.facilitators || '';
  form.querySelector('[name="credoStaff"]').value = event.credoStaff || '';
  form.querySelector('[name="time"]').value = event.time || '';
  form.querySelector('[name="poc"]').value = event.poc || '';
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
  setupReports();
  setupReportsSubnav();
  setupAarSearch();
  setupAarHistoryLog();
  setupMirInternalNav();
  setupMirDraft();
  setupMirHistoryLog();
  setupModal();
  applyPermissions();
  switchView('events');
}
