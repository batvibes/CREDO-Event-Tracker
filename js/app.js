import {
  deleteEventById,
  deleteEventType,
  fetchEventTypes,
  fetchEvents,
  fetchTeam,
  insertEvent,
  insertEventType,
  renameEventTypeInEvents,
  updateEvent,
  updateEventType,
  updateTeam,
} from './db.js';
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

const TEAM_FIELDS = [
  { key: 'director', label: 'Director' },
  { key: 'deputyDirector', label: 'Deputy Director' },
  { key: 'gsPosition', label: 'GS Position' },
  { key: 'lpo', label: 'LPO' },
  { key: 'credoStaff', label: 'CREDO Staff' },
];

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
let team = { ...DEFAULT_TEAM };
let currentView = 'events';
let dateFilter = { month: 'all', year: 'all' };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

let reportResults = [];
let dataLoadGeneration = 0;

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

function participantCount(value) {
  if (isTbd(value)) return 0;
  return typeof value === 'number' ? value : parseInt(value, 10) || 0;
}

function normalizeEvent(event) {
  event.date = toFieldValue(event.date);
  event.participants = toParticipantValue(event.participants);
  event.location = toFieldValue(event.location);
  event.command = toFieldValue(event.command);
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

async function persistTeam() {
  try {
    team = await updateTeam(team);
  } catch (err) {
    console.error(err);
    alert('Failed to save team.');
  }
}

function applyPermissions() {
  const newEventBtn = document.getElementById('new-event-btn');
  if (newEventBtn) {
    newEventBtn.hidden = !canEditEvents();
  }
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
    if (isTbd(event.date)) return false;
    const date = new Date(event.date + 'T12:00:00');
    return (
      date.getMonth() === Number(dateFilter.month) &&
      date.getFullYear() === Number(dateFilter.year)
    );
  });
}

function getEventYears() {
  const years = new Set();
  events.forEach((event) => {
    if (!isTbd(event.date)) {
      years.add(new Date(event.date + 'T12:00:00').getFullYear());
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
}

function renderDashboard() {
  populateYearFilter();
  renderKPIs();
  renderTable();
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    if (isTbd(a.date) && !isTbd(b.date)) return 1;
    if (!isTbd(a.date) && isTbd(b.date)) return -1;
    return String(a.date).localeCompare(String(b.date));
  });
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
    const date = new Date(event.date + 'T12:00:00');
    const monthKey = isTbd(event.date)
      ? 'Date TBD'
      : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!months.has(monthKey)) months.set(monthKey, new Map());
    const days = months.get(monthKey);
    const dateKey = isTbd(event.date) ? TBD : event.date;
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
              <h4 class="calendar-day-label">${formatDate(dateKey)}</h4>
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
  if (isTbd(event.date)) return null;
  return event.date;
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

  tbody.innerHTML = reportResults
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
  reportResults = sortEvents(filterReportEvents());
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

  renderReportTable();
}

function renderReports() {
  populateReportFilterOptions();
  updateReportFilterState();
  renderReportTable();
}

function renderTeam() {
  const container = document.getElementById('team-content');
  const form = document.createElement('form');
  form.className = 'team-form';
  form.id = 'team-form';
  const editable = canEditTeam();

  TEAM_FIELDS.forEach(({ key, label }) => {
    const field = document.createElement('label');
    field.className = 'team-field';

    const labelEl = document.createElement('span');
    labelEl.className = 'team-label';
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'team-input';
    input.name = key;
    input.value = team[key] || '';
    input.readOnly = !editable;

    if (editable) {
      input.addEventListener('blur', async () => {
        team[key] = input.value.trim();
        await persistTeam();
      });
    }

    field.appendChild(labelEl);
    field.appendChild(input);
    form.appendChild(field);
  });

  container.innerHTML = '';
  container.appendChild(form);
}

function renderSettings() {
  const container = document.getElementById('settings-content');
  const editable = canManageEventTypes();

  container.innerHTML = `
    <div class="settings-panel">
      <p class="settings-help">Edit event type names below. Changes apply to new events and dropdowns.</p>
      <ul class="event-type-list" id="event-type-list"></ul>
      ${editable ? '<button type="button" class="btn btn-secondary" id="add-event-type-btn">+ Add Event Type</button>' : ''}
    </div>`;

  const list = container.querySelector('#event-type-list');
  eventTypeRecords.forEach((record, index) => {
    list.appendChild(createEventTypeRow(index, editable));
  });

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

function createEventTypeRow(index, editable) {
  const record = eventTypeRecords[index];
  const li = document.createElement('li');
  li.className = 'event-type-row';

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

  const saveType = async () => {
    const trimmed = input.value.trim();
    if (!trimmed) {
      input.value = record.name;
      return;
    }
    const previous = record.name;
    if (trimmed === previous) return;

    try {
      await updateEventType(record.id, trimmed);
      await renameEventTypeInEvents(previous, trimmed);
      record.name = trimmed;
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

  if (editable) {
    input.addEventListener('blur', saveType);
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

  li.appendChild(input);
  li.appendChild(removeBtn);
  return li;
}

function switchView(viewName) {
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
    renderReports();
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
  const eventId = event.id;
  cell.classList.add('editable-cell');

  function getDisplayValue() {
    if (field === 'eventType') return event.eventType;
    return displayValue(event[field], field);
  }

  function showDisplay() {
    cell.textContent = getDisplayValue();
  }

  function startEdit() {
    if (!canEditEvents()) return;
    if (cell.querySelector('.cell-editor')) return;

    const record = events.find((e) => e.id === eventId);
    if (!record) return;

    const original = record[field];
    let input;

    if (field === 'date') {
      input = document.createElement('input');
      input.type = 'date';
      input.className = 'cell-editor';
      input.value = isTbd(record.date) ? '' : record.date;
    } else if (field === 'eventType') {
      input = document.createElement('select');
      input.className = 'cell-editor';
      populateEventTypeSelect(input, record.eventType);
    } else if (field === 'participants') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-editor';
      input.value = isTbd(record.participants) ? '' : String(record.participants);
    } else if (field === 'location') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-editor';
      input.value = isTbd(record.location) ? '' : record.location;
    } else if (field === 'command') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-editor';
      input.value = isTbd(record.command) ? '' : record.command;
    }

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();

    if (field === 'location' || field === 'command') {
      input.select();
    } else if (field === 'participants') {
      input.select();
    }

    let committed = false;

    const commit = async () => {
      if (committed) return;
      committed = true;

      let newValue;

      if (field === 'date') {
        newValue = toFieldValue(input.value);
      } else if (field === 'eventType') {
        newValue = input.value;
        if (!newValue) {
          record[field] = original;
          renderTable();
          return;
        }
      } else if (field === 'participants') {
        newValue = toParticipantValue(input.value);
      } else if (field === 'location') {
        newValue = toFieldValue(input.value.trim());
      } else if (field === 'command') {
        newValue = toFieldValue(input.value.trim());
      }

      if (newValue !== record[field]) {
        record[field] = newValue;
        await persistEvent(record);
      }

      renderKPIs();
      renderTable();
    };

    input.addEventListener('blur', commit);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        committed = true;
        record[field] = original;
        renderTable();
      }
    });
  }

  showDisplay();
  if (canEditEvents()) {
    cell.addEventListener('click', startEdit);
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

function createDeleteButton(eventId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'delete-btn';
  btn.setAttribute('aria-label', 'Delete event');
  btn.innerHTML = `
    <svg class="delete-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 1 7 0.5h2A1.5 1.5 0 0 1 10.5 2H13a1 1 0 1 1 0 2h-0.5l-0.6 8.2A1.5 1.5 0 0 1 10.4 14H5.6a1.5 1.5 0 0 1-1.5-1.8L3.5 4H3a1 1 0 1 1 0-2h2.5zM7 2h2l0.2 1H6.8L7 2zm0.5 4a0.5 0.5 0 0 0-1 0v6a0.5 0.5 0 0 0 1 0V6zm3 0a0.5 0.5 0 0 0-1 0v6a0.5 0.5 0 0 0 1 0V6z"/>
    </svg>`;
  btn.addEventListener('click', () => deleteEvent(eventId));
  return btn;
}

function createRosterPill(eventId, roster) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const isComplete = roster === 'Complete';
  btn.className = `roster-pill ${isComplete ? 'complete' : 'need-roster'}`;
  btn.textContent = isComplete ? 'Complete' : 'Need Roster';
  btn.disabled = !canEditEvents();
  btn.addEventListener('click', async () => {
    const event = events.find((e) => e.id === eventId);
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
  btn.addEventListener('click', async () => {
    const event = events.find((e) => e.id === eventId);
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

  const sorted = sortEvents(filtered);
  tbody.innerHTML = '';

  sorted.forEach((event) => {
    const row = document.createElement('tr');

    const deleteCell = document.createElement('td');
    deleteCell.className = 'col-delete';
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
    renderReports();
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

function setupModal() {
  const modal = document.getElementById('new-event-modal');
  const form = document.getElementById('new-event-form');
  const openBtn = document.getElementById('new-event-btn');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const typeSelect = form.querySelector('[name="eventType"]');
  const eventTypeError = document.getElementById('event-type-error');

  populateModalEventTypeSelect(typeSelect);

  function hideEventTypeError() {
    eventTypeError.hidden = true;
  }

  function showEventTypeError() {
    eventTypeError.hidden = false;
  }

  function openModal() {
    form.reset();
    populateModalEventTypeSelect(typeSelect);
    hideEventTypeError();
    modal.showModal();
  }

  function closeModal() {
    modal.close();
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  typeSelect.addEventListener('change', hideEventTypeError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const eventType = data.get('eventType');

    if (!eventType) {
      showEventTypeError();
      return;
    }

    hideEventTypeError();

    const newEvent = {
      date: toFieldValue(data.get('date')),
      eventType,
      command: toFieldValue(String(data.get('command') || '').trim()),
      participants: toParticipantValue(data.get('participants')),
      location: toFieldValue(String(data.get('location') || '').trim()),
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

  const [types, teamData, loadedEvents] = await Promise.all([
    fetchEventTypes(),
    fetchTeam(),
    fetchEvents(),
  ]);

  if (generation !== dataLoadGeneration) return;

  eventTypeRecords = types;
  syncEventTypeNames();
  team = teamData;
  events = loadedEvents.map(normalizeEvent);
}

export async function refreshApp() {
  await loadAllData();
  applyPermissions();
  render();
}

export async function initApp() {
  await loadAllData();
  document.getElementById('today-date').textContent = formatToday();
  setupNavigation();
  setupDateFilter();
  setupReports();
  setupModal();
  applyPermissions();
  switchView('events');
}
