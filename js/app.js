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
} from './monthly-report-pptx-export.js';
import {
  destroyMirPresentationPreview,
  renderMirPresentationPreview,
} from './mir-pptx-preview.js';
import { applyMirPhotoSlots, clearMirPhotoSlots, getMirPhotosForSave, setupMirPhotoUploads } from './mir-photo-upload.js';
import { buildAarPdfFilename, exportAarReportElementToPdf } from './aar-pdf-export.js';
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

const eventsTableSort = { column: null, direction: SORT_ASC };
const reportsTableSort = { column: null, direction: SORT_ASC };
const aarTableSort = { column: null, direction: SORT_ASC };
const aarHistoryTableSort = { column: null, direction: SORT_ASC };
const mirHistoryTableSort = { column: null, direction: SORT_ASC };

const EVENTS_TABLE_SORT_COLUMNS = [
  { key: 'date', index: 1 },
  { key: 'eventType', index: 2 },
  { key: 'command', index: 3 },
  { key: 'participants', index: 4 },
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
  aarVenueCost: 'Venue Cost',
  aarCateringCost: 'Catering Cost',
  aarAttire: 'Attire',
  aarTravelTime: 'Travel Time',
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

function resolveAarVenueCost(event) {
  if (hasAarFieldData(event.aarVenueCost)) return event.aarVenueCost;
  if (!hasAarFieldData(event.aarCateringCost) && hasAarFieldData(event.aarCost)) {
    return event.aarCost;
  }
  return '';
}

function resolveAarCateringCost(event) {
  return hasAarFieldData(event.aarCateringCost) ? event.aarCateringCost : '';
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
    const saved = await updateEvent(event);
    Object.assign(event, normalizeEvent(saved));
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
  participants: compareEventParticipants,
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
  eventsTableSort.column = null;
  eventsTableSort.direction = SORT_ASC;
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

function csvEscape(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportReportCsv() {
  if (reportResults.length === 0) return;

  const headers = ['Date', 'Event Type', 'Command', 'Expected Participants', 'Location'];
  const rows = reportResults.map((event) =>
    [
      displayValue(event.date, 'date'),
      event.eventType,
      displayValue(event.command, 'command'),
      displayValue(event.participants, 'participants'),
      displayValue(event.location, 'location'),
    ]
      .map(csvEscape)
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'credo-event-report.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function setupReports() {
  populateReportFilterOptions();
  updateReportFilterState();

  document.getElementById('report-type').addEventListener('change', updateReportFilterState);
  document.getElementById('report-generate-btn').addEventListener('click', generateReport);
  document.getElementById('report-clear-btn').addEventListener('click', clearReportFilters);
  document.getElementById('report-export-btn').addEventListener('click', exportReportCsv);

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

function getMirReportNotes(report) {
  return {
    reachNotes: report.reachNotes ?? '',
    manpowerNotes: report.manpowerNotes ?? '',
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
  const section1Data = calculateMirSection1Data(month, year);
  const section2Data = calculateMirSection2Data(teamMembers);

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
    fields[1].value = report.manpowerNotes ?? '';
    fields[2].value = report.readinessNotes ?? '';
    fields[3].value = report.commandHighlightsNotes ?? '';
  }

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
      manpowerNotes: fields[1]?.value ?? '',
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
    manpowerNotes: fields[1]?.value ?? '',
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
  if (!canvas) return;

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
  return Number.isFinite(year) ? year : null;
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
    aarVenueCost: saved.aarVenueCost,
    aarCateringCost: saved.aarCateringCost,
    aarAttire: saved.aarAttire,
    aarTravelTime: saved.aarTravelTime,
    aarLessonsLearned: saved.aarLessonsLearned,
  };
  if (saved.updatedAt) patch.updatedAt = saved.updatedAt;
  applyAarEventPatch(eventId, patch);
}

function syncAarFinalizeToEvent(eventId, saved) {
  if (!eventId || !saved || saved.id !== eventId) return;

  applyAarEventPatch(eventId, {
    aarCost: saved.aarCost,
    aarVenueCost: saved.aarVenueCost,
    aarCateringCost: saved.aarCateringCost,
    aarAttire: saved.aarAttire,
    aarTravelTime: saved.aarTravelTime,
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

function renderAarEditableCell(cell, event, fieldKey, emptyPlaceholder) {
  if (!cell) return;
  cell.textContent = '';
  cell.classList.remove('aar-report-placeholder');

  if (!canEditAarDocumentFields(event)) {
    setAarTextElement(cell, event[fieldKey], emptyPlaceholder);
    return;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'aar-editable-field';
  input.value = String(event[fieldKey] ?? '').trim();
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
    renderAarEditableCostCell(cells[0], event, 'aarVenueCost', 'Venue cost will appear here.');
    renderAarEditableCostCell(cells[1], event, 'aarCateringCost', 'Catering cost will appear here.');
    renderAarEditableCell(cells[2], event, 'aarAttire', 'Attire will appear here.');
    renderAarEditableCell(cells[3], event, 'aarTravelTime', 'Travel time will appear here.');
  }

  const lessonsBox = reportRoot?.querySelector('.aar-report-box-lessons');
  renderAarEditableBox(lessonsBox, event, 'aarLessonsLearned', 'Lessons learned will appear here.');
}

function renderAarReadOnlyFields(event, root) {
  const reportRoot = getAarReportRoot(root);
  const costRow = reportRoot?.querySelector('.aar-cost-table tbody tr:nth-child(2)');
  if (costRow) {
    const cells = costRow.querySelectorAll('td');
    setAarCostTextElement(cells[0], resolveAarVenueCost(event), 'Venue cost will appear here.');
    setAarCostTextElement(cells[1], resolveAarCateringCost(event), 'Catering cost will appear here.');
    setAarTextElement(cells[2], event.aarAttire, 'Attire will appear here.');
    setAarTextElement(cells[3], event.aarTravelTime, 'Travel time will appear here.');
  }

  const lessonsBox = reportRoot?.querySelector('.aar-report-box-lessons');
  setAarTextElement(lessonsBox, event.aarLessonsLearned, 'Lessons learned will appear here.');
}

function hasAarFieldData(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function getAarStatus(event) {
  if (isAarFinalized(event)) return 'Final';
  if (
    hasAarFieldData(event.aarVenueCost)
    || hasAarFieldData(event.aarCateringCost)
    || hasAarFieldData(event.aarCost)
    || hasAarFieldData(event.aarAttire)
    || hasAarFieldData(event.aarTravelTime)
    || hasAarFieldData(event.aarLessonsLearned)
  ) {
    return 'Draft';
  }
  return 'Not Started';
}

function hasAarProgress(event) {
  return getAarStatus(event) !== 'Not Started';
}

function syncAarClearToEvent(eventId, saved) {
  if (!eventId || !saved || saved.id !== eventId) return;

  applyAarEventPatch(eventId, {
    aarCost: saved.aarCost,
    aarVenueCost: saved.aarVenueCost,
    aarCateringCost: saved.aarCateringCost,
    aarAttire: saved.aarAttire,
    aarTravelTime: saved.aarTravelTime,
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
    'Clear this AAR? This will remove the AAR draft/final status, sequence number, finalized date, Venue Cost, Catering Cost, Attire, Travel Time, and Lessons Learned. The event itself will not be deleted.'
  );
  if (!confirmed) return;

  try {
    const saved = await clearEventAar(event.id);
    syncAarClearToEvent(event.id, saved);
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
    const saved = await clearEventAar(event.id);
    syncAarClearToEvent(event.id, saved);
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
  const toolbar = document.querySelector('#aar-preview-view .aar-doc-toolbar-preview');
  if (!toolbar) return;

  let actions = toolbar.querySelector('.aar-doc-toolbar-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'aar-doc-toolbar-actions';
    toolbar.appendChild(actions);
  }

  if (!document.getElementById('aar-mark-final-btn')) {
    const finalBtn = document.createElement('button');
    finalBtn.type = 'button';
    finalBtn.className = 'aar-doc-final-btn';
    finalBtn.id = 'aar-mark-final-btn';
    finalBtn.textContent = 'Mark Final';
    finalBtn.addEventListener('click', markAarFinal);
    actions.appendChild(finalBtn);
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
    'Mark this AAR as final? A binder sequence number will be permanently assigned and the report will become read-only.'
  );
  if (!confirmed) return;

  try {
    const saved = await finalizeEventAar(event.id);
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
    console.error(err);
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
    'Reset this draft? This will clear Venue Cost, Catering Cost, Attire, Travel Time, and Lessons Learned.'
  );
  if (!confirmed) return;

  try {
    const saved = await updateEventAarFields(event.id, {
      aarCost: '',
      aarVenueCost: '',
      aarCateringCost: '',
      aarAttire: '',
      aarTravelTime: '',
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
    await deleteEventById(eventId);
    events = events.filter((e) => e.id !== eventId);
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

    const participantsCell = document.createElement('td');
    participantsCell.className = 'col-participants';
    attachEditableCell(participantsCell, event, 'participants');
    row.appendChild(participantsCell);

    const locationCell = document.createElement('td');
    locationCell.className = 'col-location';
    attachEditableCell(locationCell, event, 'location');
    row.appendChild(locationCell);

    [
      createStatusPill(event.id, 'reservation', event.reservation),
      createStatusPill(event.id, 'catering', event.catering),
      createStatusPill(event.id, 'packout', event.packout),
      createRosterPill(event.id, event.roster),
    ].forEach((pill) => {
      const statusCell = document.createElement('td');
      statusCell.className = 'col-status';
      statusCell.addEventListener('click', (e) => e.stopPropagation());
      statusCell.appendChild(pill);
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

function resetEventForm(form) {
  form.reset();
  form.querySelector('[name="dateType"][value="single"]').checked = true;
  document.getElementById('editing-event-id').value = '';
  document.getElementById('event-single-date').value = '';
  document.getElementById('event-range-start-date').value = '';
  document.getElementById('event-range-end-date').value = '';
  updateEventDateFieldsVisibility(form);
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
