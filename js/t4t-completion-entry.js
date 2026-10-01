/**
 * Record T4T Completions.
 * Identity comes from matchDirectoryPerson. Rank and command are display details.
 * Completion history is recorded through record_facilitator_t4t_completion.
 * Qualifications, facilitator text, and participant counts are not used.
 */
import { matchDirectoryPerson, personnelDisplayName } from './personnel-identity.js';

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
  const state = {
    step: 'loading',
    busy: false,
    error: '',
    completedOn: defaultT4tCompletionDate(event),
    rosterText: '',
    reviews: [],
    people: [],
    aliases: [],
    completions: [],
    products: options.initialProducts || [],
    target: t4tCompletionTarget(event, options.initialProducts || []),
    creatingIndex: null,
    draft: null,
  };

  function captureFields() {
    const date = body.querySelector('#t4t-completion-date');
    const names = body.querySelector('#t4t-completion-names');
    if (date) state.completedOn = date.value;
    if (names) state.rosterText = names.value;
    const form = body.querySelector('[data-new-person-form]');
    if (form && state.creatingIndex != null) {
      state.draft = {
        name: form.elements.name.value,
        rankTitle: form.elements.rankTitle.value,
        commandOrganization: form.elements.commandOrganization.value,
        installation: form.elements.installation.value,
      };
    }
  }

  function refreshKnown() {
    state.reviews = applyKnownCompletions(state.reviews, state.completions, {
      productId: state.target.productId,
      completedOn: state.completedOn,
      sourceEventId: event.id,
    });
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
      refreshKnown();
      render();
    });
    label.appendChild(input);
    if (futureMessage) {
      const note = doc.createElement('p');
      note.className = 't4t-completion-error';
      note.textContent = futureMessage;
      label.appendChild(note);
    }
    return label;
  }

  function renderReviewCard(row, index) {
    const card = doc.createElement('article');
    card.className = 't4t-completion-card';
    const entered = doc.createElement('p');
    entered.className = 't4t-completion-entered';
    entered.textContent = row.input;
    card.appendChild(entered);
    const status = doc.createElement('p');
    status.className = 't4t-completion-status';
    status.textContent = outcomeLabel(row);
    card.appendChild(status);

    if (row.note) {
      const note = doc.createElement('p');
      note.className = 't4t-completion-note';
      note.textContent = row.note;
      card.appendChild(note);
    }

    if (state.step === 'results') {
      const chosen = selectedDetails(row);
      if (chosen) appendCandidate(card, chosen);
      return card;
    }

    if (row.resolution === 'ready' || row.outcome === 'already-recorded') {
      const chosen = selectedDetails(row);
      if (chosen) appendCandidate(card, chosen);
      return card;
    }

    if (row.status === 'probable') {
      const candidate = row.candidates[0];
      if (candidate) appendCandidate(card, candidate);
      card.appendChild(button(doc, 'btn btn-secondary', 'Use this person', () => {
        captureFields();
        state.reviews[index] = confirmParticipantChoice(state.reviews[index], candidate?.personId);
        refreshKnown();
        render();
      }, state.busy || !candidate));
      return card;
    }

    if (row.status === 'ambiguous') {
      for (const candidate of row.candidates) {
        const choice = appendCandidate(card, candidate);
        choice.appendChild(button(
          doc,
          'btn btn-secondary',
          'Use this person',
          () => {
            captureFields();
            state.reviews[index] = confirmParticipantChoice(state.reviews[index], candidate.personId);
            refreshKnown();
            render();
          },
          state.busy,
        ));
      }
      return card;
    }

    if (row.status === 'new') {
      const title = doc.createElement('p');
      title.className = 't4t-completion-person';
      title.textContent = 'New Person';
      card.appendChild(title);
      if (state.creatingIndex !== index) {
        card.appendChild(button(doc, 'btn btn-secondary', 'Create New Person', () => {
          captureFields();
          state.creatingIndex = index;
          state.draft = {
            name: row.input,
            rankTitle: '',
            commandOrganization: '',
            installation: '',
          };
          render();
        }, state.busy));
        return card;
      }

      const form = doc.createElement('form');
      form.dataset.newPersonForm = 'true';
      form.className = 't4t-completion-new-person';
      const draft = state.draft || {};
      form.append(
        field(doc, 'Name', 'name', draft.name, true),
        field(doc, 'Rank / Title', 'rankTitle', draft.rankTitle, false),
        field(doc, 'Command / Organization', 'commandOrganization', draft.commandOrganization, false),
        field(doc, 'Installation', 'installation', draft.installation, false),
      );
      const actions = doc.createElement('div');
      actions.className = 't4t-completion-inline-actions';
      actions.append(
        button(doc, 'btn btn-secondary', 'Keep Unresolved', () => {
          state.creatingIndex = null;
          state.draft = null;
          render();
        }, state.busy),
        button(doc, 'btn btn-primary', 'Create New Person', () => {
          createRowPerson(index, form);
        }, state.busy),
      );
      form.appendChild(actions);
      form.addEventListener('submit', (submitEvent) => {
        submitEvent.preventDefault();
        createRowPerson(index, form);
      });
      card.appendChild(form);
    }
    return card;
  }

  async function createRowPerson(index, form) {
    if (state.busy) return;
    captureFields();
    const payload = newDirectoryPersonInput({
      name: form.elements.name.value,
      rankTitle: form.elements.rankTitle.value,
      commandOrganization: form.elements.commandOrganization.value,
      installation: form.elements.installation.value,
    });
    if (!payload) {
      state.reviews[index] = { ...state.reviews[index], note: 'Name is required.' };
      render();
      return;
    }
    state.busy = true;
    state.error = '';
    render();
    try {
      const created = await options.savePerson(payload);
      if (!created?.id) {
        state.reviews[index] = {
          ...state.reviews[index],
          note: 'The person could not be created.',
        };
        state.busy = false;
        render();
        return;
      }
      const directoryPerson = directoryPersonFromSave(created);
      if (directoryPerson.id) state.people = [...state.people, directoryPerson];
      state.reviews[index] = applyCreatedPerson(state.reviews[index], created);
      state.creatingIndex = null;
      state.draft = null;
      refreshKnown();
    } catch (error) {
      if (isDuplicatePersonError(error)) {
        try {
          const fresh = await options.loadSources();
          state.people = fresh.people || [];
          state.aliases = fresh.aliases || [];
          state.completions = fresh.completions || [];
          state.products = fresh.products || state.products;
          state.target = t4tCompletionTarget(event, state.products);
        } catch (reloadError) {
          state.reviews[index] = {
            ...state.reviews[index],
            note: reloadError?.message || 'The directory could not be refreshed.',
          };
          state.busy = false;
          render();
          return;
        }
        const [rematch] = buildParticipantReviews(state.reviews[index].input, state.people, state.aliases);
        state.reviews[index] = rematch || state.reviews[index];
        state.reviews[index] = {
          ...state.reviews[index],
          note: state.reviews[index].status === 'new'
            ? 'A personnel record with that name already exists. The name was not changed.'
            : 'That name is already in the directory.',
        };
        state.creatingIndex = state.reviews[index].status === 'new' ? index : null;
        refreshKnown();
      } else {
        state.reviews[index] = {
          ...state.reviews[index],
          note: error?.message || 'The person could not be created.',
        };
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  async function recordRows() {
    if (state.busy || !canRecordT4tCompletions({
      completedOn: state.completedOn,
      target: state.target,
      rows: state.reviews,
    })) return;
    state.busy = true;
    state.error = '';
    state.creatingIndex = null;
    render();
    const seen = new Set(
      state.reviews
        .filter((row) => row.outcome === 'already-recorded')
        .map((row) => row.selectedPersonId),
    );
    for (let index = 0; index < state.reviews.length; index += 1) {
      const row = state.reviews[index];
      if (row.outcome === 'already-recorded') continue;
      if (
        seen.has(row.selectedPersonId)
        || completionAlreadyRecorded(state.completions, {
          personId: row.selectedPersonId,
          productId: state.target.productId,
          completedOn: state.completedOn,
          sourceEventId: event.id,
        })
      ) {
        state.reviews[index] = { ...row, outcome: 'already-recorded', outcomeMessage: 'Already Recorded' };
        seen.add(row.selectedPersonId);
        continue;
      }
      try {
        await options.recordCompletion({
          personId: row.selectedPersonId,
          productId: state.target.productId,
          completedOn: state.completedOn,
          sourceEventId: event.id,
          governingSource: null,
          notes: null,
        });
        state.completions = [...state.completions, {
          person_id: row.selectedPersonId,
          product_id: state.target.productId,
          completed_on: state.completedOn,
          source_event_id: event.id,
        }];
        seen.add(row.selectedPersonId);
        state.reviews[index] = { ...row, outcome: 'recorded', outcomeMessage: '' };
      } catch (error) {
        if (isDuplicateCompletionError(error)) {
          seen.add(row.selectedPersonId);
          state.reviews[index] = { ...row, outcome: 'already-recorded', outcomeMessage: 'Already Recorded' };
        } else {
          state.reviews[index] = {
            ...row,
            outcome: 'failed',
            outcomeMessage: error?.message || 'The completion could not be recorded.',
          };
        }
      }
    }
    state.step = 'results';
    state.busy = false;
    render();
    try {
      await options.onRecorded?.();
    } catch (error) {
      state.error = error?.message || 'Completions were recorded, and Facilitator Management could not be refreshed.';
      render();
    }
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

    if (state.step === 'loading') {
      const loading = doc.createElement('p');
      loading.className = 't4t-completion-note';
      loading.textContent = 'Loading personnel and qualification products…';
      body.appendChild(loading);
      footer.appendChild(button(doc, 'btn btn-secondary', 'Cancel', requestClose, state.busy));
      return;
    }

    body.appendChild(renderFacts());

    if (state.step === 'unavailable' || !state.target.eligible) {
      const reason = doc.createElement('p');
      reason.className = 't4t-completion-note';
      reason.textContent = state.target.reason || 'This event is not a T4T completion source.';
      body.appendChild(reason);
      footer.appendChild(button(doc, 'btn btn-secondary', 'Cancel', requestClose, state.busy));
      return;
    }

    if (state.step === 'results') {
      const summary = summarizeT4tCompletionResults(state.reviews);
      const totals = doc.createElement('div');
      totals.className = 't4t-completion-summary';
      totals.append(
        summaryLine(doc, `Recorded: ${summary.recorded}`),
        summaryLine(doc, `Already Recorded: ${summary.alreadyRecorded}`),
        summaryLine(doc, `Failed: ${summary.failed}`),
      );
      body.appendChild(totals);
      state.reviews.forEach((row, index) => body.appendChild(renderReviewCard(row, index)));
      footer.appendChild(button(doc, 'btn btn-primary', 'Done', requestClose, false));
      return;
    }

    body.appendChild(renderDateField());

    if (state.step === 'entry') {
      const names = doc.createElement('label');
      names.className = 't4t-completion-field';
      names.append(doc.createTextNode('Participant Names'));
      const area = doc.createElement('textarea');
      area.id = 't4t-completion-names';
      area.rows = 8;
      area.value = state.rosterText;
      names.appendChild(area);
      const help = doc.createElement('p');
      help.className = 't4t-completion-help';
      help.textContent = 'Paste or enter one participant per line.';
      names.appendChild(help);
      body.appendChild(names);
      footer.append(
        button(doc, 'btn btn-secondary', 'Cancel', requestClose, state.busy),
        button(doc, 'btn btn-primary', 'Review Participants', () => {
          captureFields();
          state.reviews = buildParticipantReviews(state.rosterText, state.people, state.aliases);
          if (!state.reviews.length) {
            state.error = 'Enter at least one participant name.';
            render();
            return;
          }
          state.error = '';
          state.creatingIndex = null;
          state.step = 'review';
          refreshKnown();
          render();
        }, state.busy),
      );
      return;
    }

    state.reviews.forEach((row, index) => body.appendChild(renderReviewCard(row, index)));
    const record = button(doc, 'btn btn-primary', 'Record Completions', () => {
      captureFields();
      refreshKnown();
      recordRows();
    }, state.busy || !canRecordT4tCompletions({
      completedOn: state.completedOn,
      target: state.target,
      rows: state.reviews,
    }));
    footer.append(
      button(doc, 'btn btn-secondary', 'Edit Names', () => {
        captureFields();
        state.step = 'entry';
        state.creatingIndex = null;
        render();
      }, state.busy),
      button(doc, 'btn btn-secondary', 'Cancel', requestClose, state.busy),
      record,
    );
  }

  function summaryLine(ownerDocument, text) {
    const line = ownerDocument.createElement('p');
    line.textContent = text;
    return line;
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
      closeBtn.onclick = null;
      dialog.oncancel = null;
    },
  };
}
