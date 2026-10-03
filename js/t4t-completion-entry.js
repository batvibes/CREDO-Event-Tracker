/**
 * Manage T4T Attendance.
 * Identity comes from matchDirectoryPerson. Rank and command are display details.
 * Additions use record_facilitator_t4t_completion.
 * Removals use remove_facilitator_t4t_completion_from_event for this event and product.
 * Qualifications, facilitator text, and participant counts are not used.
 */
import { matchDirectoryPerson, personnelDisplayName } from './personnel-identity.js';
import { attendancePersonalParts, findAttendancePersonByName, suggestAttendancePeople } from './t4t-attendance-suggestions.js';

export const T4T_COMPLETION_ACTION_LABEL = 'Manage T4T Attendance';

const DEDICATED_TARGETS = {
  'SafeTalk T4T': { productCode: 'safetalk', productName: 'safeTALK' },
  'ASIST T4T': { productCode: 'asist', productName: 'ASIST' },
};

const WORKSHOP_CODES = {
  'Marriage Enrichment Workshop': ['gottman_seven_principles', 'prep_8_0'],
  'Personal Growth Workshop': [
    'four_lenses',
    'cliftonstrengths_strengths_discovery_encounter',
    'navigating_your_next_chapter',
  ],
};

function clean(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeLine(value) {
  return clean(value).toLowerCase();
}

function eventTypeName(event) {
  return clean(event?.eventType ?? event?.event_type);
}

function workshopT4t(event) {
  return event?.isT4t === true || event?.is_t4t === true;
}

function curriculumId(event) {
  const value = event?.curriculumProductId ?? event?.curriculum_product_id ?? '';
  return clean(value);
}

function blankTarget(reason) {
  return {
    eligible: false,
    productId: null,
    productCode: null,
    productName: null,
    reason,
  };
}

export function t4tCompletionTarget(event, products) {
  const eventType = eventTypeName(event);
  const dedicated = DEDICATED_TARGETS[eventType];
  if (dedicated) {
    const product = (products || []).find((entry) => (
      entry?.id
      && entry.code === dedicated.productCode
      && entry.name === dedicated.productName
    ));
    if (!product) return blankTarget('The ordinary qualification product is not available.');
    return {
      eligible: true,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      reason: '',
    };
  }

  const allowed = WORKSHOP_CODES[eventType];
  if (!allowed) return blankTarget('This event is not a T4T completion source.');
  if (!workshopT4t(event)) return blankTarget('This workshop is not marked as Training for Trainers.');
  const productId = curriculumId(event);
  if (!productId) return blankTarget('A curriculum is required before T4T completions can be recorded.');
  const product = (products || []).find((entry) => entry?.id === productId);
  if (!product || !allowed.includes(product.code) || product.code === 'safetalk_t4t' || product.code === 'asist_t4t') {
    return blankTarget('The selected curriculum is not an ordinary qualification product for this workshop.');
  }
  return {
    eligible: true,
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    reason: '',
  };
}

export function t4tCompletionActionVisible({ canEdit, event, products }) {
  return canEdit === true && t4tCompletionTarget(event, products).eligible;
}

export function calendarDate(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return '';
  return text;
}

export function localCalendarToday(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function completionDateMessage(value, today = localCalendarToday()) {
  const date = calendarDate(value);
  if (!date || date <= today) return '';
  return 'Completion date cannot be in the future.';
}

function presentText(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function defaultT4tCompletionDate(event) {
  const start = presentText(event?.startDate ?? event?.start_date);
  const legacy = presentText(event?.date);
  const raw = start !== '' ? start : legacy;
  return calendarDate(raw);
}

export function parseParticipantLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const seen = new Set();
  const kept = [];
  for (const line of lines) {
    const trimmed = clean(line);
    if (!trimmed) continue;
    const key = normalizeLine(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
  }
  return kept;
}

function reviewFromMatch(match) {
  const exact = match.status === 'exact' && match.selectedPersonId;
  return {
    input: match.input,
    normalizedInput: match.normalizedInput,
    status: match.status,
    candidates: match.candidates || [],
    selectedPersonId: exact ? match.selectedPersonId : null,
    resolution: exact ? 'ready' : 'pending',
    outcome: null,
    outcomeMessage: '',
    note: '',
    createdPerson: null,
  };
}

export function buildParticipantReviews(text, people, aliases) {
  return parseParticipantLines(text).map((line) => reviewFromMatch(matchDirectoryPerson(line, people, aliases)));
}

export function confirmParticipantChoice(row, personId) {
  if (!row || (row.status !== 'probable' && row.status !== 'ambiguous')) return row;
  const candidate = (row.candidates || []).find((entry) => entry.personId === personId);
  if (!candidate) return row;
  return {
    ...row,
    selectedPersonId: candidate.personId,
    resolution: 'ready',
    note: '',
  };
}

export function newDirectoryPersonInput(values) {
  const name = clean(values?.name);
  if (!name) return null;
  return {
    id: null,
    rankTitle: clean(values?.rankTitle),
    name,
    commandOrganization: clean(values?.commandOrganization),
    installation: clean(values?.installation),
    isCredoStaff: false,
    isFacilitator: false,
    isPoc: false,
    staffBilletOrRole: null,
    staffPrdEaos: null,
  };
}

export function directoryPersonFromSave(created) {
  return {
    id: created?.id ?? null,
    name: created?.name ?? '',
    rank_title: created?.rank_title ?? created?.rankTitle ?? '',
    command_organization: created?.command_organization ?? created?.commandOrganization ?? '',
    installation: created?.installation ?? '',
    active: created?.active !== false,
  };
}

export function applyCreatedPerson(row, created) {
  if (!row || row.status !== 'new' || !created?.id) return row;
  const rankTitle = created.rank_title ?? created.rankTitle ?? '';
  const commandOrganization = created.command_organization ?? created.commandOrganization ?? '';
  return {
    ...row,
    selectedPersonId: created.id,
    resolution: 'ready',
    note: '',
    createdPerson: {
      personId: created.id,
      displayName: personnelDisplayName(rankTitle, created.name),
      personalName: created.name ?? '',
      rankTitle,
      commandOrganization,
      active: created.active !== false,
    },
  };
}

export function isDuplicatePersonError(error) {
  return error?.code === 'REFERENCE_NAME_EXISTS' || /already exists/i.test(String(error?.message || ''));
}

export function completionErrorCode(error) {
  const hint = error?.hint || error?.code || '';
  if (hint === 'T4T_COMPLETION_DUPLICATE' || hint === 'T4T_COMPLETION_EVENT_DUPLICATE') return hint;
  const message = String(error?.message || '');
  if (/already recorded for that person, product, and date/i.test(message)) return 'T4T_COMPLETION_DUPLICATE';
  if (/for that event is already recorded/i.test(message)) return 'T4T_COMPLETION_EVENT_DUPLICATE';
  return hint;
}

export function isDuplicateCompletionError(error) {
  const code = completionErrorCode(error);
  return code === 'T4T_COMPLETION_DUPLICATE' || code === 'T4T_COMPLETION_EVENT_DUPLICATE';
}

function completionPersonId(row) {
  return row?.person_id ?? row?.personId ?? null;
}

function completionProductId(row) {
  return row?.product_id ?? row?.productId ?? null;
}

function completionDate(row) {
  return String(row?.completed_on ?? row?.completedOn ?? '').slice(0, 10);
}

function completionEventId(row) {
  return row?.source_event_id ?? row?.sourceEventId ?? null;
}

export function completionAlreadyRecorded(completions, { personId, productId, completedOn, sourceEventId }) {
  return (completions || []).some((row) => {
    if (completionPersonId(row) !== personId) return false;
    if (completionProductId(row) !== productId) return false;
    return completionDate(row) === completedOn || (sourceEventId && completionEventId(row) === sourceEventId);
  });
}

export function eventAttendanceRecorded(completions, { personId, productId, sourceEventId }) {
  if (!personId || !productId || !sourceEventId) return false;
  return (completions || []).some((row) => (
    completionPersonId(row) === personId
    && completionProductId(row) === productId
    && completionEventId(row) === sourceEventId
  ));
}

export function applyKnownCompletions(rows, completions, context) {
  return (rows || []).map((row) => {
    if (row.outcome === 'recorded' || row.outcome === 'failed') return row;
    if (row.resolution !== 'ready' || !row.selectedPersonId) {
      if (row.outcome === 'already-recorded') return { ...row, outcome: null, outcomeMessage: '' };
      return row;
    }
    if (completionAlreadyRecorded(completions, { ...context, personId: row.selectedPersonId })) {
      return { ...row, outcome: 'already-recorded', outcomeMessage: 'Already Recorded' };
    }
    if (row.outcome === 'already-recorded') return { ...row, outcome: null, outcomeMessage: '' };
    return row;
  });
}

export function canRecordT4tCompletions({ completedOn, target, rows, today = localCalendarToday() }) {
  if (!target?.eligible || !target.productId) return false;
  if (!calendarDate(completedOn) || completionDateMessage(completedOn, today)) return false;
  if (!rows?.length) return false;
  return rows.every((row) => (
    row.outcome === 'already-recorded'
    || (row.resolution === 'ready' && row.selectedPersonId && !row.outcome)
  ));
}

export function summarizeT4tCompletionResults(rows) {
  return {
    recorded: (rows || []).filter((row) => row.outcome === 'recorded').length,
    alreadyRecorded: (rows || []).filter((row) => row.outcome === 'already-recorded').length,
    failed: (rows || []).filter((row) => row.outcome === 'failed').length,
  };
}

function selectedDetails(row) {
  if (row.createdPerson?.personId === row.selectedPersonId) return row.createdPerson;
  return (row.candidates || []).find((candidate) => candidate.personId === row.selectedPersonId) || null;
}

function outcomeLabel(row) {
  if (row.outcome === 'recorded') return 'Recorded';
  if (row.outcome === 'already-recorded') return 'Already Recorded';
  if (row.outcome === 'failed') return row.outcomeMessage ? `Failed: ${row.outcomeMessage}` : 'Failed';
  if (row.resolution === 'ready') return 'Ready';
  if (row.status === 'probable' || row.status === 'ambiguous') return 'Needs a choice';
  if (row.status === 'new') return 'New Person';
  return '';
}

function appendDetail(parent, label, value) {
  if (!value) return;
  const line = parent.ownerDocument.createElement('p');
  line.className = 't4t-completion-detail';
  const name = parent.ownerDocument.createElement('span');
  name.className = 't4t-completion-detail-label';
  name.textContent = label;
  line.append(name, parent.ownerDocument.createTextNode(value));
  parent.appendChild(line);
}

function appendCandidate(parent, candidate) {
  const block = parent.ownerDocument.createElement('div');
  block.className = 't4t-completion-candidate';
  const name = parent.ownerDocument.createElement('p');
  name.className = 't4t-completion-person';
  name.textContent = candidate.displayName || candidate.personalName || 'Person';
  block.appendChild(name);
  appendDetail(block, 'Rank / Title: ', candidate.rankTitle);
  appendDetail(block, 'Command / Organization: ', candidate.commandOrganization);
  if (candidate.active === false) {
    const inactive = parent.ownerDocument.createElement('p');
    inactive.className = 't4t-completion-inactive';
    inactive.textContent = 'Inactive';
    block.appendChild(inactive);
  }
  parent.appendChild(block);
  return block;
}

function button(doc, className, text, onClick, disabled) {
  const node = doc.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  node.disabled = disabled === true;
  node.addEventListener('click', onClick);
  return node;
}

export function attendeeFormValues(values) {
  return {
    rank: clean(values?.rank),
    firstName: clean(values?.firstName),
    lastName: clean(values?.lastName),
    command: clean(values?.command),
    installation: clean(values?.installation),
  };
}

export function attendeeMatchText(values) {
  const form = attendeeFormValues(values);
  if (!form.firstName || !form.lastName) return '';
  return personnelDisplayName(form.rank, `${form.firstName} ${form.lastName}`);
}

export function rosterAttendeeFromPerson(person, extras = {}) {
  const rankTitle = clean(person?.rank_title ?? person?.rankTitle);
  const personalName = clean(person?.name ?? person?.personalName);
  const personId = person?.id ?? person?.personId ?? null;
  return {
    key: personId,
    personId,
    pendingPerson: null,
    displayName: personnelDisplayName(rankTitle, personalName) || personalName || 'Person',
    personalName,
    rankTitle,
    commandOrganization: clean(person?.command_organization ?? person?.commandOrganization),
    installation: clean(person?.installation),
    active: person?.active === false ? false : true,
    completedOn: extras.completedOn ?? null,
  };
}

export function eventSourcedAttendance(completions, { eventId, productId, people }) {
  const rows = [];
  const seen = new Set();
  for (const row of completions || []) {
    if (!eventId || completionEventId(row) !== eventId) continue;
    if (!productId || completionProductId(row) !== productId) continue;
    const personId = completionPersonId(row);
    if (!personId || seen.has(personId)) continue;
    seen.add(personId);
    const person = (people || []).find((entry) => entry?.id === personId);
    rows.push(rosterAttendeeFromPerson(person || { id: personId, name: 'Person' }, {
      completedOn: completionDate(row),
    }));
  }
  rows.sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    || String(left.personId).localeCompare(String(right.personId)));
  return rows;
}

export function rosterIncludesPerson(roster, personId) {
  if (!personId) return false;
  return (roster || []).some((row) => row?.personId === personId);
}

export function attendanceRosterDiff(saved, working) {
  const savedRows = saved || [];
  const workingRows = working || [];
  const savedIds = new Set(savedRows.map((row) => row.personId).filter(Boolean));
  const workingIds = new Set(workingRows.map((row) => row.personId).filter(Boolean));
  return {
    add: workingRows.filter((row) => !row.personId || !savedIds.has(row.personId)),
    remove: savedRows.filter((row) => row.personId && !workingIds.has(row.personId)),
  };
}

export function attendanceCountLabel(count) {
  const total = Number(count) || 0;
  return total === 1 ? '1 attendee' : `${total} attendees`;
}

export function attendanceMetaLine(attendee) {
  const parts = [clean(attendee?.commandOrganization), clean(attendee?.installation)].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

function field(doc, label, name, value, required) {
  const wrap = doc.createElement('label');
  wrap.className = 't4t-completion-field';
  wrap.append(doc.createTextNode(label));
  const input = doc.createElement('input');
  input.name = name;
  input.value = value ?? '';
  input.required = required === true;
  input.autocomplete = 'off';
  wrap.appendChild(input);
  return wrap;
}

export function mountT4tCompletionWorkflow(dialog, options) {
  const body = dialog.querySelector('#t4t-completion-body');
  const footer = dialog.querySelector('#t4t-completion-footer');
  const doc = dialog.ownerDocument;
  let active = true;
  const event = options.event;
  const emptyForm = () => ({
    rank: '',
    firstName: '',
    lastName: '',
    command: '',
    installation: '',
  });
  const state = {
    step: 'loading',
    busy: false,
    error: '',
    notice: '',
    completedOn: defaultT4tCompletionDate(event),
    form: emptyForm(),
    roster: [],
    people: [],
    aliases: [],
    completions: [],
    products: options.initialProducts || [],
    target: t4tCompletionTarget(event, options.initialProducts || []),
    pending: null,
    focusFirst: false,
    boundPersonId: null,
    confirmedDifferent: false,
    suggestion: { status: 'empty', people: [] },
    restoreFocusId: '',
    restoreCaret: null,
  };
  let suggestTimer = 0;

  function captureFields() {
    const date = body.querySelector('#t4t-completion-date');
    if (date) state.completedOn = date.value;
    const read = (id) => body.querySelector(`#${id}`)?.value ?? '';
    if (body.querySelector('#t4t-attendee-first')) {
      state.form = attendeeFormValues({
        rank: read('t4t-attendee-rank'),
        firstName: read('t4t-attendee-first'),
        lastName: read('t4t-attendee-last'),
        command: read('t4t-attendee-command'),
        installation: read('t4t-attendee-installation'),
      });
    }
  }

  function clearForm() {
    state.form = emptyForm();
  }

  function personById(personId) {
    return state.people.find((person) => person.id === personId) || null;
  }

  function showSavedRoster() {
    state.roster = eventSourcedAttendance(state.completions, {
      eventId: event.id,
      productId: state.target.productId,
      people: state.people,
    });
  }

  function completionDateError() {
    return completionDateMessage(state.completedOn) || (calendarDate(state.completedOn) ? '' : 'A completion date is required.');
  }

  function rememberCompletion(personId) {
    state.completions = [...state.completions, {
      person_id: personId,
      product_id: state.target.productId,
      completed_on: state.completedOn,
      source_event_id: event.id,
    }];
  }

  async function refreshFacilitatorManagement() {
    try {
      await options.onRecorded?.();
    } catch (error) {
      state.error = error?.message || 'Attendance was saved, and Facilitator Management could not be refreshed.';
      render();
    }
  }

  function renderFacts() {
    const facts = doc.createElement('dl');
    facts.className = 't4t-completion-facts';
    for (const [label, value] of [
      ['Event Type', event.eventType || '—'],
      ['Event Date', options.eventDateLabel || '—'],
      ['Qualification Product', state.target.productName || '—'],
    ]) {
      const row = doc.createElement('div');
      const term = doc.createElement('dt');
      term.textContent = label;
      const detail = doc.createElement('dd');
      detail.textContent = value;
      row.append(term, detail);
      facts.appendChild(row);
    }
    return facts;
  }

  function renderDateField() {
    const label = doc.createElement('label');
    label.className = 't4t-completion-field';
    label.append(doc.createTextNode('Completion Date'));
    const input = doc.createElement('input');
    input.type = 'date';
    input.id = 't4t-completion-date';
    input.value = state.completedOn;
    input.required = true;
    input.max = localCalendarToday();
    const futureMessage = completionDateMessage(state.completedOn);
    input.setAttribute('aria-invalid', futureMessage ? 'true' : 'false');
    input.addEventListener('change', () => {
      captureFields();
      render();
    });
    label.appendChild(input);
    return label;
  }

  function renderDateNote() {
    const futureMessage = completionDateMessage(state.completedOn);
    const note = doc.createElement('p');
    note.className = futureMessage ? 't4t-completion-error' : 't4t-completion-note';
    note.textContent = futureMessage || 'This date is used for attendees added during this save. People already saved keep their recorded date.';
    return note;
  }

  function textField(labelText, id, value, required) {
    const label = doc.createElement('label');
    label.className = 't4t-completion-field';
    label.append(doc.createTextNode(required ? `${labelText}*` : labelText));
    const input = doc.createElement('input');
    input.id = id;
    input.value = value ?? '';
    input.required = required === true;
    input.autocomplete = 'off';
    input.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key !== 'Enter') return;
      keyEvent.preventDefault();
      addAttendee();
    });
    if (id === 't4t-attendee-first' || id === 't4t-attendee-last') {
      input.addEventListener('input', () => {
        state.boundPersonId = null;
        state.confirmedDifferent = false;
        scheduleSuggestion();
      });
    }
    label.appendChild(input);
    return label;
  }

  async function writeAttendance(person) {
    const attendee = rosterAttendeeFromPerson(person, { completedOn: state.completedOn });
    if (!attendee.personId || rosterIncludesPerson(state.roster, attendee.personId)) {
      state.error = 'Already on this attendance roster.';
      state.notice = '';
      state.pending = null;
      return;
    }
    const dateError = completionDateError();
    if (dateError) {
      state.error = dateError;
      state.notice = '';
      return;
    }
    const recordedHere = eventAttendanceRecorded(state.completions, {
      personId: attendee.personId,
      productId: state.target.productId,
      sourceEventId: event.id,
    });
    if (!recordedHere) {
      try {
        await options.recordCompletion({
          personId: attendee.personId,
          productId: state.target.productId,
          completedOn: state.completedOn,
          sourceEventId: event.id,
          governingSource: null,
          notes: null,
        });
      } catch (error) {
        if (completionErrorCode(error) !== 'T4T_COMPLETION_EVENT_DUPLICATE') throw error;
      }
      rememberCompletion(attendee.personId);
    }
    showSavedRoster();
    state.pending = null;
    state.error = '';
    state.notice = 'Attendee added.';
    clearForm();
    state.focusFirst = true;
  }

  async function addExistingPerson(person) {
    if (state.busy || !state.target.eligible) return;
    captureFields();
    state.busy = true;
    state.error = '';
    state.notice = '';
    state.pending = null;
    render();
    try {
      await writeAttendance(person);
    } catch (error) {
      state.error = error?.message || 'The attendee could not be added.';
      state.notice = '';
    }
    const added = !state.error;
    state.busy = false;
    render();
    if (added) await refreshFacilitatorManagement();
  }

  async function createAndRecordPerson(form) {
    if (state.busy || !state.target.eligible) return;
    captureFields();
    const payload = newDirectoryPersonInput({
      name: `${form.firstName} ${form.lastName}`,
      rankTitle: form.rank,
      commandOrganization: form.command,
      installation: form.installation,
    });
    if (!payload) {
      state.error = 'First name and last name are required.';
      state.notice = '';
      render();
      return;
    }
    const dateError = completionDateError();
    if (dateError) {
      state.error = dateError;
      state.notice = '';
      render();
      return;
    }
    state.busy = true;
    state.error = '';
    state.notice = '';
    state.pending = null;
    render();
    try {
      const created = await options.createAttendancePerson(payload);
      if (!created?.id) throw new Error('The person could not be created.');
      const directoryPerson = directoryPersonFromSave(created);
      const person = directoryPerson.id ? directoryPerson : created;
      if (person.id && !personById(person.id)) state.people = [...state.people, person];
      await writeAttendance(person);
    } catch (error) {
      const existing = isDuplicatePersonError(error) ? await recoverExistingPerson(payload) : null;
      if (existing?.id || existing?.personId) {
        const personId = existing.id ?? existing.personId;
        if (!personById(personId)) state.people = [...state.people, existing];
        try {
          await writeAttendance(existing);
        } catch (recordError) {
          state.error = recordError?.message || 'The attendee could not be added.';
          state.notice = '';
        }
      } else {
        state.error = isDuplicatePersonError(error)
          ? 'A personnel record with that name already exists. The name was not changed.'
          : (error?.message || 'The attendee could not be added.');
        state.notice = '';
      }
    }
    const added = !state.error;
    state.busy = false;
    render();
    if (added) await refreshFacilitatorManagement();
  }

  async function removeAttendee(attendee) {
    if (state.busy || !attendee?.personId) return;
    captureFields();
    state.busy = true;
    state.error = '';
    state.notice = '';
    render();
    try {
      const removedAttendance = await options.removeCompletion({
        personId: attendee.personId,
        productId: state.target.productId,
        sourceEventId: event.id,
      });
      if (removedAttendance?.personRemoved) {
        state.people = state.people.filter((person) => person.id !== attendee.personId);
      }
      state.completions = state.completions.filter((row) => !(
        completionPersonId(row) === attendee.personId
        && completionProductId(row) === state.target.productId
        && completionEventId(row) === event.id
      ));
      showSavedRoster();
      state.notice = 'Attendee removed.';
    } catch (error) {
      state.error = error?.message || 'The attendee could not be removed.';
      state.notice = '';
    }
    const removed = !state.error;
    state.busy = false;
    render();
    if (removed) await refreshFacilitatorManagement();
  }

  async function recoverExistingPerson(payload) {
    const loaded = findAttendancePersonByName(payload, state.people, state.aliases);
    if (loaded) return loaded;
    if (!options.findExistingPerson) return null;
    return options.findExistingPerson(payload);
  }

  function refreshSuggestion() {
    state.suggestion = suggestAttendancePeople({
      firstName: state.form.firstName,
      lastName: state.form.lastName,
      rankTitle: state.form.rank,
    }, state.people, state.aliases);
  }

  function scheduleSuggestion() {
    const activeId = doc.activeElement?.id || '';
    const caret = doc.activeElement?.selectionStart;
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => {
      if (!active) return;
      captureFields();
      refreshSuggestion();
      state.restoreFocusId = activeId;
      state.restoreCaret = caret;
      render();
    }, 300);
  }

  function useSuggestedPerson(personId) {
    const person = personById(personId);
    if (!person) return;
    const parts = attendancePersonalParts(person, state.people, state.form.rank);
    captureFields();
    state.form = {
      ...state.form,
      rank: clean(person.rank_title),
      firstName: parts.first,
      lastName: parts.last,
      command: clean(person.command_organization),
      installation: clean(person.installation),
    };
    state.boundPersonId = person.id;
    state.confirmedDifferent = false;
    state.pending = null;
    refreshSuggestion();
    state.notice = '';
    state.error = rosterIncludesPerson(state.roster, person.id) ? 'Already on this attendance roster.' : '';
    state.focusFirst = true;
    render();
  }

  function addAttendee() {
    if (state.busy) return;
    captureFields();
    const form = state.form;
    if (!form.firstName || !form.lastName) {
      state.error = 'First name and last name are required.';
      state.notice = '';
      render();
      return;
    }
    refreshSuggestion();
    const exact = matchDirectoryPerson(attendeeMatchText({ ...form, rank: '' }), state.people, state.aliases);
    state.notice = '';
    if (state.boundPersonId) {
      const bound = personById(state.boundPersonId);
      if (!bound) {
        state.boundPersonId = null;
      } else if (rosterIncludesPerson(state.roster, bound.id)) {
        state.error = 'Already on this attendance roster.';
        render();
        return;
      } else {
        state.error = '';
        addExistingPerson(bound);
        return;
      }
    }
    if (!state.confirmedDifferent && state.suggestion.status === 'exact') {
      if (state.suggestion.people.length === 1) {
        const person = personById(state.suggestion.people[0].personId);
        if (person && rosterIncludesPerson(state.roster, person.id)) {
          state.error = 'Already on this attendance roster.';
          render();
          return;
        }
        state.error = '';
        addExistingPerson(person || { id: state.suggestion.people[0].personId, name: state.suggestion.people[0].personalName });
        return;
      }
      state.error = 'Choose the existing person.';
      render();
      return;
    }
    if (state.suggestion.status === 'possible' && !state.confirmedDifferent) {
      state.error = 'Choose an existing person, or confirm this is a different person.';
      render();
      return;
    }
    if (!state.confirmedDifferent && exact.status === 'exact' && exact.selectedPersonId) {
      const person = personById(exact.selectedPersonId);
      if (person && rosterIncludesPerson(state.roster, person.id)) {
        state.error = 'Already on this attendance roster.';
        render();
        return;
      }
      state.error = '';
      addExistingPerson(person || { id: exact.selectedPersonId, name: form.firstName });
      return;
    }
    state.error = '';
    createAndRecordPerson(form);
  }

  function confirmDifferentPerson() {
    captureFields();
    state.confirmedDifferent = true;
    state.boundPersonId = null;
    state.error = '';
    render();
  }

  function suggestionMeta(person, status) {
    const details = [];
    if (status !== 'exact' && person.rankTitle) details.push(person.rankTitle);
    if (person.commandOrganization) details.push(person.commandOrganization);
    if (person.installation) details.push(person.installation);
    return details;
  }

  function renderSuggestion() {
    const suggestion = state.suggestion;
    if (!suggestion || suggestion.status === 'empty') return null;
    const showingMatches = (suggestion.status === 'exact' || suggestion.status === 'possible')
      && !state.confirmedDifferent
      && suggestion.people.length;
    if (!showingMatches) {
      const note = doc.createElement('p');
      note.className = 't4t-attendee-suggestion-note';
      note.textContent = 'No existing person found. Adding this attendee will create a new person.';
      return note;
    }
    const box = doc.createElement('div');
    box.className = 't4t-attendee-suggestion';
    suggestion.people.forEach((person, index) => {
      const row = doc.createElement('div');
      row.className = 't4t-attendee-suggestion-row';
      const label = doc.createElement('span');
      label.className = 't4t-attendee-suggestion-label';
      label.textContent = suggestion.status === 'exact' ? 'Existing person found:' : 'Possible match:';
      const name = doc.createElement('span');
      name.className = 't4t-attendee-suggestion-name';
      name.textContent = suggestion.status === 'exact'
        ? (person.displayName || person.personalName)
        : (person.personalName || person.displayName);
      row.append(label, name);
      const details = suggestionMeta(person, suggestion.status);
      if (details.length) {
        const meta = doc.createElement('span');
        meta.className = 't4t-attendee-suggestion-meta';
        meta.textContent = `· ${details.join(' · ')}`;
        row.appendChild(meta);
      }
      const actions = doc.createElement('span');
      actions.className = 't4t-attendee-suggestion-actions';
      actions.appendChild(button(doc, 'btn btn-secondary', 'Use Existing', () => {
        useSuggestedPerson(person.personId);
      }, state.busy));
      if (index === 0) {
        actions.appendChild(button(
          doc,
          'btn btn-secondary',
          suggestion.status === 'exact' ? 'Add As New' : 'This Is A Different Person',
          confirmDifferentPerson,
          state.busy,
        ));
      }
      row.appendChild(actions);
      box.appendChild(row);
    });
    return box;
  }

  function renderRoster() {
    const section = doc.createElement('section');
    section.className = 't4t-attendance-roster';
    const headingRow = doc.createElement('div');
    headingRow.className = 't4t-roster-heading';
    const heading = doc.createElement('h4');
    heading.textContent = 'Attendance Roster';
    const count = doc.createElement('p');
    count.className = 't4t-roster-count';
    count.textContent = attendanceCountLabel(state.roster.length);
    headingRow.append(heading, count);
    section.appendChild(headingRow);
    if (!state.roster.length) {
      const empty = doc.createElement('p');
      empty.className = 't4t-completion-note';
      empty.textContent = 'No attendees yet.';
      section.appendChild(empty);
      return section;
    }
    const columns = doc.createElement('div');
    columns.className = 't4t-roster-columns';
    for (const label of ['Name', 'Command', 'Installation', 'Action']) {
      const cell = doc.createElement('span');
      cell.textContent = label;
      columns.appendChild(cell);
    }
    section.appendChild(columns);
    for (const attendee of state.roster) {
      const row = doc.createElement('article');
      row.className = 't4t-roster-row';
      const name = doc.createElement('p');
      name.className = 't4t-roster-name';
      name.textContent = attendee.displayName || attendee.personalName || 'Person';
      if (attendee.active === false) {
        const inactive = doc.createElement('span');
        inactive.className = 't4t-completion-inactive';
        inactive.textContent = 'Inactive';
        name.appendChild(inactive);
      }
      const command = doc.createElement('p');
      command.className = 't4t-roster-meta t4t-roster-command';
      command.textContent = clean(attendee.commandOrganization) || '—';
      const installation = doc.createElement('p');
      installation.className = 't4t-roster-meta t4t-roster-installation';
      installation.textContent = clean(attendee.installation) || '—';
      row.append(
        name,
        command,
        installation,
        button(doc, 'btn btn-secondary', 'Remove', () => {
          removeAttendee(attendee);
        }, state.busy),
      );
      section.appendChild(row);
    }
    return section;
  }

  function render() {
    if (!active) return;
    body.replaceChildren();
    footer.replaceChildren();
    if (state.error) {
      const error = doc.createElement('p');
      error.className = 't4t-completion-error';
      error.textContent = state.error;
      body.appendChild(error);
    }
    if (state.notice) {
      const notice = doc.createElement('p');
      notice.className = 't4t-completion-note';
      notice.textContent = state.notice;
      body.appendChild(notice);
    }

    if (state.step === 'loading') {
      const loading = doc.createElement('p');
      loading.className = 't4t-completion-note';
      loading.textContent = 'Loading personnel and qualification products…';
      body.appendChild(loading);
      footer.appendChild(button(doc, 'btn btn-secondary', 'Close', requestClose, state.busy));
      return;
    }

    const summary = doc.createElement('div');
    summary.className = 't4t-event-summary';
    summary.appendChild(renderFacts());
    body.appendChild(summary);

    if (state.step === 'unavailable' || !state.target.eligible) {
      const reason = doc.createElement('p');
      reason.className = 't4t-completion-note';
      reason.textContent = state.target.reason || 'This event is not a T4T completion source.';
      body.appendChild(reason);
      footer.appendChild(button(doc, 'btn btn-secondary', 'Close', requestClose, state.busy));
      return;
    }

    summary.appendChild(renderDateField());
    body.appendChild(renderDateNote());

    const entry = doc.createElement('section');
    entry.className = 't4t-attendee-entry';
    const entryHeading = doc.createElement('h4');
    entryHeading.textContent = 'Add Attendee';
    entry.appendChild(entryHeading);
    const entryGrid = doc.createElement('div');
    entryGrid.className = 't4t-attendee-grid';
    entryGrid.append(
      textField('Rank', 't4t-attendee-rank', state.form.rank, false),
      textField('First Name', 't4t-attendee-first', state.form.firstName, true),
      textField('Last Name', 't4t-attendee-last', state.form.lastName, true),
      textField('Command', 't4t-attendee-command', state.form.command, false),
      textField('Installation', 't4t-attendee-installation', state.form.installation, false),
    );
    const entryActions = doc.createElement('div');
    entryActions.className = 't4t-attendee-actions';
    entryActions.appendChild(button(doc, 'btn btn-secondary', 'Add Attendee', addAttendee, state.busy));
    entryGrid.appendChild(entryActions);
    entry.appendChild(entryGrid);
    const suggestion = renderSuggestion();
    if (suggestion) entry.appendChild(suggestion);
    body.appendChild(entry);
    body.appendChild(renderRoster());

    const close = button(doc, 'btn btn-secondary', 'Close', requestClose, state.busy);
    close.classList.add('t4t-attendance-close');
    footer.appendChild(close);
    if (state.focusFirst) {
      state.focusFirst = false;
      state.restoreFocusId = '';
      body.querySelector('#t4t-attendee-first')?.focus();
    } else if (state.restoreFocusId) {
      const field = body.querySelector(`#${state.restoreFocusId}`);
      const caret = state.restoreCaret;
      state.restoreFocusId = '';
      state.restoreCaret = null;
      if (field) {
        field.focus();
        if (typeof caret === 'number') field.setSelectionRange(caret, caret);
      }
    }
  }

  function requestClose() {
    if (state.busy) return;
    dialog.close();
  }

  const closeBtn = dialog.querySelector('#t4t-completion-close');
  closeBtn.onclick = requestClose;
  dialog.oncancel = (cancelEvent) => {
    if (state.busy) cancelEvent.preventDefault();
  };

  render();
  options.loadSources().then((sources) => {
    if (!active) return;
    state.people = sources?.people || [];
    state.aliases = sources?.aliases || [];
    state.completions = sources?.completions || [];
    state.products = sources?.products || [];
    state.target = t4tCompletionTarget(event, state.products);
    if (state.target.eligible) showSavedRoster();
    state.step = state.target.eligible ? 'entry' : 'unavailable';
    render();
  }).catch((error) => {
    if (!active) return;
    state.error = error?.message || 'Personnel and products could not be loaded.';
    state.step = 'unavailable';
    state.target = blankTarget(state.error);
    render();
  });

  return {
    destroy() {
      active = false;
      clearTimeout(suggestTimer);
      closeBtn.onclick = null;
      dialog.oncancel = null;
    },
  };
}
