import { fullNameIncludesRank, matchDirectoryPerson, personnelDisplayName } from './personnel-identity.js';

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function field(label, input) {
  const wrap = document.createElement('label');
  wrap.className = 'personnel-editor-field';
  const text = document.createElement('span');
  text.className = 'personnel-editor-label';
  text.textContent = label;
  wrap.append(text, input);
  return wrap;
}

function textInput(value, options = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'personnel-editor-input';
  input.value = value || '';
  input.autocomplete = 'off';
  if (options.required) input.required = true;
  if (options.maxLength) input.maxLength = options.maxLength;
  return input;
}

export function personnelEditorRoleValues(roleSurface, person, input = {}) {
  if (roleSurface === 'facilitator') {
    return {
      isCredoStaff: person?.isCredoStaff === true,
      isFacilitator: input.isFacilitator === true,
      isPoc: person?.isPoc === true,
      staffBilletOrRole: clean(person?.staffBilletOrRole),
      staffPrdEaos: clean(person?.staffPrdEaos),
    };
  }
  return {
    isCredoStaff: input.isCredoStaff === true,
    isFacilitator: person?.isFacilitator === true,
    isPoc: person?.isPoc === true,
    staffBilletOrRole: clean(input.staffBilletOrRole),
    staffPrdEaos: clean(input.staffPrdEaos),
  };
}

const EXACT_IDENTITY_MATCHES = new Set(['personal-name', 'display', 'alias']);

function exactIdentityCandidates(input, people) {
  const match = matchDirectoryPerson(input, people, []);
  return (match.candidates || []).filter((candidate) => EXACT_IDENTITY_MATCHES.has(candidate.match));
}

export function facilitatorReusePlan(identity, people = []) {
  const name = clean(typeof identity === 'string' ? identity : identity?.name);
  const rankTitle = clean(typeof identity === 'string' ? '' : identity?.rankTitle);
  const displayName = personnelDisplayName(rankTitle, name);
  const byId = new Map();
  for (const candidate of exactIdentityCandidates(name, people)) {
    byId.set(candidate.personId, candidate);
  }
  if (displayName && displayName !== name) {
    for (const candidate of exactIdentityCandidates(displayName, people)) {
      if (!byId.has(candidate.personId)) byId.set(candidate.personId, candidate);
    }
  }
  const candidates = [...byId.values()].sort((left, right) => (
    left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    || String(left.personId).localeCompare(String(right.personId))
  ));
  if (candidates.length === 1) return { status: 'reuse', candidates };
  if (candidates.length > 1) return { status: 'choose', candidates };
  return { status: 'new', candidates: [] };
}

export function facilitatorReuseValues(person) {
  return {
    id: person?.id ?? null,
    rankTitle: clean(person?.rankTitle),
    firstName: clean(person?.firstName),
    lastName: clean(person?.lastName),
    name: clean(person?.name),
    commandOrganization: clean(person?.commandOrganization),
    installation: clean(person?.installation),
    active: person?.active === true,
    isCredoStaff: person?.isCredoStaff === true,
    isFacilitator: true,
    isPoc: person?.isPoc === true,
    staffBilletOrRole: clean(person?.staffBilletOrRole),
    staffPrdEaos: clean(person?.staffPrdEaos),
  };
}

function isExistingPersonNameError(error) {
  return error?.code === 'REFERENCE_NAME_EXISTS' || /already exists/i.test(String(error?.message || ''));
}

function hasStructuredName(firstName, lastName) {
  return Boolean(clean(firstName) && clean(lastName));
}

export function legacyPersonnelNameDraft(name) {
  const tokens = clean(name).split(' ').filter(Boolean);
  if (tokens.length < 2) return { firstName: '', lastName: '' };
  return {
    firstName: tokens.slice(0, -1).join(' '),
    lastName: tokens[tokens.length - 1],
  };
}

export function personnelEditorNameDraft(person) {
  const firstName = clean(person?.firstName ?? person?.first_name);
  const lastName = clean(person?.lastName ?? person?.last_name);
  if (firstName || lastName) return { firstName, lastName, suggested: false };
  const draft = legacyPersonnelNameDraft(person?.name);
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    suggested: Boolean(draft.firstName && draft.lastName),
  };
}

export function validatePersonnelEditor(values) {
  const firstName = clean(values.firstName);
  const lastName = clean(values.lastName);
  const rankTitle = clean(values.rankTitle);
  const existingId = values?.id ?? null;
  const storedStructured = hasStructuredName(values?.storedFirstName, values?.storedLastName);
  const suppliedStructured = Boolean(firstName || lastName);
  const completeStructured = Boolean(firstName && lastName);
  const legacyUntouched = Boolean(existingId) && !storedStructured && !suppliedStructured;

  if (suppliedStructured && !completeStructured) {
    return firstName ? 'Last Name is required.' : 'First Name is required.';
  }
  if (!legacyUntouched && !completeStructured) {
    return firstName ? 'Last Name is required.' : 'First Name is required.';
  }

  const name = completeStructured ? clean(`${firstName} ${lastName}`) : clean(values.name);
  if (!name) return 'First Name is required.';
  if (!legacyUntouched && fullNameIncludesRank(rankTitle, name)) {
    return 'Rank / Title should not be entered in First Name or Last Name.';
  }
  if (values.isCredoStaff && !clean(values.staffBilletOrRole)) {
    return 'Billet / Role is required for CREDO Staff.';
  }
  return '';
}

export function reconciliationStructuredNames(person) {
  const draft = personnelEditorNameDraft(person);
  return { firstName: draft.firstName, lastName: draft.lastName };
}

export function reconciliationPersonalName(firstName, lastName) {
  const first = clean(firstName);
  const last = clean(lastName);
  if (!first || !last) return '';
  return clean(`${first} ${last}`);
}

export function validateReconciliationIdentity(values) {
  const firstName = clean(values?.firstName);
  const lastName = clean(values?.lastName);
  const rankTitle = clean(values?.rankTitle);
  if (!firstName) return 'First Name is required.';
  if (!lastName) return 'Last Name is required.';
  if (fullNameIncludesRank(rankTitle, reconciliationPersonalName(firstName, lastName))) {
    return 'Rank / Title should not be entered in First Name or Last Name.';
  }
  return '';
}

export function mountPersonnelEditor({
  body,
  footer,
  person = null,
  others = [],
  roleSurface = 'team',
  onSave,
  onArchive,
  onReconcile,
}) {
  const editing = Boolean(person?.id);
  let archiveConfirm = false;
  let reconcileOpen = false;
  let reconcileQuery = '';
  let reconcileSelectedId = '';
  let survivorChoice = '';
  let reconcileRank = '';
  let reconcileFirstName = '';
  let reconcileLastName = '';
  let reconcileConfirm = false;
  let message = '';
  let busy = false;
  let reuseCandidates = null;
  let reuseSelectedId = '';

  const legacyRecord = Boolean(person?.id) && !hasStructuredName(person?.firstName, person?.lastName);
  const editorDraft = personnelEditorNameDraft(person);
  const rankInput = textInput(person?.rankTitle, { maxLength: 40 });
  const firstNameInput = textInput(editorDraft.firstName, { required: !legacyRecord, maxLength: 100 });
  const lastNameInput = textInput(editorDraft.lastName, { required: !legacyRecord, maxLength: 100 });
  const commandInput = textInput(person?.commandOrganization, { maxLength: 200 });
  const installationInput = textInput(person?.installation, { maxLength: 200 });
  const staffInput = document.createElement('input');
  staffInput.type = 'checkbox';
  staffInput.checked = person?.isCredoStaff === true;
  const facilitatorInput = document.createElement('input');
  facilitatorInput.type = 'checkbox';
  facilitatorInput.checked = roleSurface === 'facilitator'
    ? (person?.id ? person.isFacilitator === true : true)
    : person?.isFacilitator === true;
  const billetInput = textInput(person?.staffBilletOrRole, { maxLength: 200 });
  const prdInput = textInput(person?.staffPrdEaos, { maxLength: 80 });

  function currentValues() {
    const firstName = clean(firstNameInput.value);
    const lastName = clean(lastNameInput.value);
    const structuredName = firstName && lastName ? clean(`${firstName} ${lastName}`) : '';
    return {
      id: person?.id ?? null,
      rankTitle: clean(rankInput.value),
      firstName,
      lastName,
      storedFirstName: clean(person?.firstName),
      storedLastName: clean(person?.lastName),
      name: structuredName || clean(person?.name),
      commandOrganization: clean(commandInput.value),
      installation: clean(installationInput.value),
      ...personnelEditorRoleValues(roleSurface, person, {
        isCredoStaff: staffInput.checked,
        isFacilitator: facilitatorInput.checked,
        staffBilletOrRole: clean(billetInput.value),
        staffPrdEaos: clean(prdInput.value),
      }),
    };
  }

  function labelText(text) {
    const strong = document.createElement('strong');
    strong.textContent = text;
    return strong;
  }

  function checkbox(input, label) {
    const wrap = document.createElement('label');
    wrap.className = 'personnel-editor-check';
    const text = document.createElement('span');
    text.textContent = label;
    wrap.append(input, text);
    return wrap;
  }

  function render() {
    body.replaceChildren();
    footer.replaceChildren();

    const general = document.createElement('div');
    general.className = 'personnel-editor-section';
    const generalTitle = document.createElement('h4');
    generalTitle.textContent = 'General';
    const nameRow = document.createElement('div');
    nameRow.className = 'personnel-editor-row personnel-editor-row-name';
    nameRow.append(
      field('Rank / Title', rankInput),
      field('First Name', firstNameInput),
      field('Last Name', lastNameInput),
    );
    const placeRow = document.createElement('div');
    placeRow.className = 'personnel-editor-row personnel-editor-row-place';
    placeRow.append(field('Command / Organization', commandInput), field('Installation', installationInput));
    if (legacyRecord && clean(person?.name)) {
      const legacyNote = document.createElement('p');
      legacyNote.className = 'personnel-editor-help';
      legacyNote.textContent = editorDraft.suggested
        ? `Existing name: “${clean(person.name)}”. Review the suggested First Name and Last Name before saving.`
        : `Existing name “${clean(person.name)}” stays until both First Name and Last Name are entered.`;
      general.append(generalTitle, nameRow, legacyNote, placeRow);
    } else {
      general.append(generalTitle, nameRow, placeRow);
    }

    const roles = document.createElement('div');
    roles.className = 'personnel-editor-section';
    const rolesTitle = document.createElement('h4');
    rolesTitle.textContent = 'Roles';
    const roleList = document.createElement('div');
    roleList.className = 'personnel-editor-checks';
    if (roleSurface === 'facilitator') {
      roleList.append(checkbox(facilitatorInput, 'Current Facilitator'));
    } else {
      roleList.append(checkbox(staffInput, 'CREDO Staff'));
    }
    roles.append(rolesTitle, roleList);

    const staffFields = document.createElement('div');
    staffFields.className = 'personnel-editor-section personnel-editor-staff';
    staffFields.hidden = !staffInput.checked;
    const staffTitle = document.createElement('h4');
    staffTitle.textContent = 'CREDO Staff';
    const staffRow = document.createElement('div');
    staffRow.className = 'personnel-editor-row personnel-editor-row-staff';
    staffRow.append(field('Billet / Role', billetInput), field('PRD / EAOS', prdInput));
    staffFields.append(staffTitle, staffRow);

    body.append(general, roles);
    if (roleSurface !== 'facilitator') body.appendChild(staffFields);

    if (reuseCandidates?.length) body.appendChild(renderReusePrompt());

    if (message) {
      const note = document.createElement('p');
      note.className = 'personnel-editor-message';
      note.textContent = message;
      body.appendChild(note);
    }

    if (editing) {
      const management = document.createElement('div');
      management.className = 'personnel-editor-management';
      management.append(renderArchive(), renderReconcile());
      body.appendChild(management);
      const reveal = reconcileConfirm
        ? '.personnel-editor-reconcile-confirm'
        : '.personnel-editor-final-identity';
      if (reconciliationArmed()) body.querySelector(reveal)?.scrollIntoView({ block: 'nearest' });
    }

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      document.getElementById('personnel-editor-modal')?.close();
    });

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-primary';
    save.textContent = 'Save';
    save.disabled = busy || reconciliationArmed();
    if (reuseCandidates?.length) save.disabled = true;
    if (reconciliationArmed()) {
      save.title = 'Clear the reconciliation selection to save this record.';
    }
    footer.append(cancel, save);
  }

  function clearReusePrompt(focus) {
    if (!reuseCandidates) return;
    reuseCandidates = null;
    reuseSelectedId = '';
    render();
    focus?.focus();
  }

  function reusePerson(personId) {
    return others.find((entry) => entry.id === personId) || null;
  }

  function renderReuseIdentity(person) {
    const identity = document.createElement('div');
    identity.className = 'personnel-editor-reuse-identity';
    const name = document.createElement('p');
    name.className = 'personnel-editor-reuse-name';
    name.textContent = personnelDisplayName(person?.rankTitle, person?.name) || '—';
    identity.appendChild(name);
    const command = document.createElement('p');
    command.textContent = clean(person?.commandOrganization) || '—';
    const installation = document.createElement('p');
    installation.textContent = clean(person?.installation) || '—';
    identity.append(command, installation);
    if (person?.active === false) {
      const inactive = document.createElement('p');
      inactive.className = 'personnel-editor-reuse-inactive';
      inactive.textContent = 'Inactive';
      identity.appendChild(inactive);
    }
    return identity;
  }

  function renderReusePrompt() {
    const section = document.createElement('div');
    section.className = 'personnel-editor-section personnel-editor-reuse';
    const title = document.createElement('h4');
    title.textContent = 'Existing Person Found';
    const help = document.createElement('p');
    help.className = 'personnel-editor-help';
    help.textContent = 'Use the existing person to set Current Facilitator. Their other information stays as it is.';
    section.append(title, help);

    const selected = reuseCandidates.length === 1
      ? reusePerson(reuseCandidates[0].personId) || reuseCandidates[0]
      : reusePerson(reuseSelectedId);

    if (reuseCandidates.length > 1) {
      reuseCandidates.forEach((candidate) => {
        const person = reusePerson(candidate.personId) || candidate;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'personnel-editor-match';
        if (candidate.personId === reuseSelectedId) button.classList.add('is-selected');
        button.textContent = personnelDisplayName(person.rankTitle, person.name || person.personalName);
        button.addEventListener('click', () => {
          reuseSelectedId = candidate.personId;
          render();
        });
        section.appendChild(button);
      });
    }

    if (selected && (reuseCandidates.length === 1 || reuseSelectedId)) {
      section.appendChild(renderReuseIdentity(selected));
      const useExisting = document.createElement('button');
      useExisting.type = 'button';
      useExisting.className = 'btn btn-primary';
      useExisting.textContent = 'Use Existing Person';
      useExisting.disabled = busy;
      useExisting.addEventListener('click', () => commitReuse(selected.id || selected.personId));
      section.appendChild(useExisting);
    }
    return section;
  }

  async function commitReuse(personId) {
    const existing = reusePerson(personId);
    if (!existing?.id) {
      message = 'That personnel record was not found.';
      render();
      return;
    }
    busy = true;
    message = '';
    render();
    try {
      await onSave(facilitatorReuseValues(existing));
      document.getElementById('personnel-editor-modal')?.close();
    } catch (error) {
      console.error(error);
      message = error?.message || 'Failed to save personnel record.';
      busy = false;
      render();
    }
  }

  function reconciliationArmed() {
    return Boolean(editing && reconcileSelectedId && survivorChoice);
  }

  function retiredRecord(selected) {
    if (!selected || survivorChoice === 'this') return selected;
    return person;
  }

  function renderArchive() {
    const section = document.createElement('div');
    section.className = 'personnel-editor-section personnel-editor-archive';
    if (!archiveConfirm) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'personnel-editor-quiet';
      button.textContent = 'Archive';
      button.disabled = busy;
      button.addEventListener('click', () => {
        archiveConfirm = true;
        message = '';
        render();
      });
      section.appendChild(button);
      return section;
    }

    const copy = document.createElement('p');
    copy.className = 'personnel-editor-help';
    copy.textContent = 'Archive this person? They leave the active directory and current Manning. The personnel record is kept.';
    const actions = document.createElement('div');
    actions.className = 'personnel-editor-inline-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn btn-secondary';
    back.textContent = 'Cancel';
    back.addEventListener('click', () => {
      archiveConfirm = false;
      render();
    });
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn-primary';
    confirm.textContent = 'Archive person';
    confirm.disabled = busy;
    confirm.addEventListener('click', async () => {
      busy = true;
      render();
      try {
        await onArchive(person.id);
        document.getElementById('personnel-editor-modal')?.close();
      } catch (error) {
        console.error(error);
        message = error?.message || 'Failed to archive personnel record.';
        busy = false;
        render();
      }
    });
    actions.append(back, confirm);
    section.append(copy, actions);
    return section;
  }

  function renderReconcile() {
    const details = document.createElement('details');
    details.className = 'personnel-editor-reconcile';
    details.open = reconcileOpen;
    const summary = document.createElement('summary');
    summary.textContent = 'Reconcile with another record';
    summary.addEventListener('click', (event) => {
      event.preventDefault();
      reconcileOpen = !reconcileOpen;
      render();
    });
    details.appendChild(summary);

    const help = document.createElement('p');
    help.className = 'personnel-editor-help';
    help.textContent = 'Use this only when you already know two records are the same person. Event history is not rewritten.';
    details.appendChild(help);

    const search = textInput(reconcileQuery, { maxLength: 200 });
    search.placeholder = 'Type the other record’s name';
    search.addEventListener('input', () => {
      reconcileQuery = search.value;
      reconcileSelectedId = '';
      survivorChoice = '';
      reconcileConfirm = false;
      render();
      const next = body.querySelector('.personnel-editor-reconcile input');
      next?.focus();
    });
    details.appendChild(field('Other record', search));

    const query = clean(reconcileQuery).toLowerCase();
    const matches = query.length < 2
      ? []
      : others
        .filter((entry) => entry.id !== person.id)
        .filter((entry) => personnelDisplayName(entry.rankTitle, entry.name).toLowerCase().includes(query))
        .slice(0, 8);

    if (query.length >= 2 && !matches.length) {
      const empty = document.createElement('p');
      empty.className = 'personnel-editor-help';
      empty.textContent = 'No other record has that name.';
      details.appendChild(empty);
    }

    matches.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'personnel-editor-match';
      button.textContent = personnelDisplayName(entry.rankTitle, entry.name);
      if (entry.id === reconcileSelectedId) button.classList.add('is-selected');
      button.addEventListener('click', () => {
        reconcileSelectedId = entry.id;
        survivorChoice = '';
        reconcileRank = '';
        reconcileFirstName = '';
        reconcileLastName = '';
        reconcileConfirm = false;
        render();
      });
      details.appendChild(button);
    });

    const selected = others.find((entry) => entry.id === reconcileSelectedId);
    if (selected) {
      const choice = document.createElement('div');
      choice.className = 'personnel-editor-choices';
      [
        ['this', `Keep this record (${personnelDisplayName(person.rankTitle, person.name)})`],
        ['other', `Keep the other record (${personnelDisplayName(selected.rankTitle, selected.name)})`],
      ].forEach(([value, label]) => {
        const labelEl = document.createElement('label');
        labelEl.className = 'personnel-editor-check';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'personnel-survivor';
        input.checked = survivorChoice === value;
        input.addEventListener('change', () => {
          survivorChoice = value;
          const source = value === 'this' ? person : selected;
          const names = reconciliationStructuredNames(source);
          reconcileRank = source.rankTitle || '';
          reconcileFirstName = names.firstName;
          reconcileLastName = names.lastName;
          reconcileConfirm = false;
          render();
        });
        const text = document.createElement('span');
        text.textContent = label;
        labelEl.append(input, text);
        choice.appendChild(labelEl);
      });
      details.appendChild(choice);
    }

    if (survivorChoice && selected) {
      const retiring = retiredRecord(selected);
      const survivor = survivorChoice === 'this' ? person : selected;
      const survivorStructured = hasStructuredName(survivor?.firstName, survivor?.lastName);
      const rank = textInput(reconcileRank, { maxLength: 40 });
      const firstName = textInput(reconcileFirstName, { required: true, maxLength: 100 });
      const lastName = textInput(reconcileLastName, { required: true, maxLength: 100 });
      const summary = document.createElement('div');
      summary.className = 'personnel-editor-reconcile-summary';

      function paintSummary() {
        summary.replaceChildren();
        const kept = document.createElement('div');
        const retiredLine = document.createElement('div');
        kept.append(labelText('Survivor: '), document.createTextNode(personnelDisplayName(reconcileRank, reconciliationPersonalName(reconcileFirstName, reconcileLastName)) || '—'));
        retiredLine.append(
          labelText('Retiring: '),
          document.createTextNode(personnelDisplayName(retiring?.rankTitle, retiring?.name) || '—'),
        );
        summary.append(kept, retiredLine);
      }

      function clearPendingConfirmation() {
        reconcileConfirm = false;
        reconcileButton.disabled = busy;
        paintSummary();
        details.querySelector('.personnel-editor-reconcile-confirm')?.remove();
      }
      rank.addEventListener('input', () => {
        reconcileRank = rank.value;
        clearPendingConfirmation();
      });
      firstName.addEventListener('input', () => {
        reconcileFirstName = firstName.value;
        clearPendingConfirmation();
      });
      lastName.addEventListener('input', () => {
        reconcileLastName = lastName.value;
        clearPendingConfirmation();
      });
      paintSummary();

      const identity = document.createElement('div');
      identity.className = 'personnel-editor-section personnel-editor-final-identity';
      const identityTitle = document.createElement('h4');
      identityTitle.textContent = 'Final Identity';
      const identityNote = document.createElement('p');
      identityNote.className = 'personnel-editor-help';
      const survivorDraft = personnelEditorNameDraft(survivor);
      identityNote.textContent = survivorStructured || !clean(survivor?.name)
        ? 'These values are kept as entered.'
        : survivorDraft.suggested
          ? `Existing name: “${clean(survivor.name)}”. Review the suggested First Name and Last Name before saving.`
          : `Existing name “${clean(survivor.name)}” is shown for reference. A combined legacy name is not split automatically.`;
      const identityRow = document.createElement('div');
      identityRow.className = 'personnel-editor-row personnel-editor-row-name';
      identityRow.append(field('Rank / Title', rank), field('First Name', firstName), field('Last Name', lastName));
      identity.append(identityTitle, identityNote, identityRow);

      const reconcileButton = document.createElement('button');
      reconcileButton.type = 'button';
      reconcileButton.className = 'btn btn-primary';
      reconcileButton.textContent = 'Reconcile Records';
      reconcileButton.disabled = busy || reconcileConfirm;
      reconcileButton.addEventListener('click', () => {
        const nextIdentity = {
          rankTitle: clean(reconcileRank),
          firstName: clean(reconcileFirstName),
          lastName: clean(reconcileLastName),
        };
        const problem = validateReconciliationIdentity(nextIdentity);
        if (problem) {
          message = problem;
          reconcileConfirm = false;
          render();
          return;
        }
        message = '';
        reconcileConfirm = true;
        render();
      });

      details.append(identity, summary, reconcileButton);

      if (reconcileConfirm) {
        const survivorId = survivorChoice === 'this' ? person.id : selected.id;
        const retiredId = survivorChoice === 'this' ? selected.id : person.id;
        const keptName = personnelDisplayName(reconcileRank, reconciliationPersonalName(reconcileFirstName, reconcileLastName));
        const retiredName = personnelDisplayName(retiring?.rankTitle, retiring?.name);
        const confirmPanel = document.createElement('div');
        confirmPanel.className = 'personnel-editor-reconcile-confirm';
        const confirmTitle = document.createElement('p');
        confirmTitle.className = 'personnel-editor-reconcile-confirm-title';
        confirmTitle.textContent = 'Reconcile personnel records?';
        const keepLine = document.createElement('p');
        keepLine.textContent = `Keep: ${keptName}`;
        const retireLine = document.createElement('p');
        retireLine.textContent = `Retire: ${retiredName}`;
        const aliasLine = document.createElement('p');
        aliasLine.className = 'personnel-editor-help';
        aliasLine.textContent = 'The retired identity will be preserved as an alias.';
        const historyLine = document.createElement('p');
        historyLine.className = 'personnel-editor-help';
        historyLine.textContent = 'Historical Event text will not be rewritten.';
        const actions = document.createElement('div');
        actions.className = 'personnel-editor-inline-actions';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'btn btn-secondary';
        back.textContent = 'Cancel';
        back.addEventListener('click', () => {
          reconcileConfirm = false;
          render();
        });
        const commit = document.createElement('button');
        commit.type = 'button';
        commit.className = 'btn btn-primary';
        commit.textContent = 'Reconcile';
        commit.disabled = busy;
        commit.addEventListener('click', async () => {
          const finalIdentity = {
            rankTitle: clean(reconcileRank),
            firstName: clean(reconcileFirstName),
            lastName: clean(reconcileLastName),
            name: reconciliationPersonalName(reconcileFirstName, reconcileLastName),
          };
          busy = true;
          message = '';
          render();
          try {
            await onReconcile(survivorId, retiredId, finalIdentity);
            document.getElementById('personnel-editor-modal')?.close();
          } catch (error) {
            console.error(error);
            message = error?.message || 'Failed to reconcile personnel records.';
            busy = false;
            reconcileConfirm = false;
            render();
          }
        });
        actions.append(back, commit);
        confirmPanel.append(confirmTitle, keepLine, retireLine, aliasLine, historyLine, actions);
        details.appendChild(confirmPanel);
      }
    }

    return details;
  }

  staffInput.addEventListener('change', () => {
    message = '';
    render();
  });
  firstNameInput.addEventListener('input', () => clearReusePrompt(firstNameInput));
  lastNameInput.addEventListener('input', () => clearReusePrompt(lastNameInput));
  rankInput.addEventListener('input', () => clearReusePrompt(rankInput));

  const form = body.closest('form');
  const onSubmit = async (event) => {
    event.preventDefault();
    if (reconciliationArmed()) return;
    const values = currentValues();
    const problem = validatePersonnelEditor(values);
    if (problem) {
      message = problem;
      render();
      return;
    }
    if (roleSurface === 'facilitator' && !editing) {
      const plan = facilitatorReusePlan(values, others);
      if (plan.status !== 'new') {
        reuseCandidates = plan.candidates;
        reuseSelectedId = '';
        message = '';
        render();
        return;
      }
    }
    busy = true;
    message = '';
    render();
    try {
      await onSave(values);
      document.getElementById('personnel-editor-modal')?.close();
    } catch (error) {
      console.error(error);
      if (roleSurface === 'facilitator' && !editing && isExistingPersonNameError(error)) {
        const plan = facilitatorReusePlan(values, others);
        if (plan.status !== 'new') {
          reuseCandidates = plan.candidates;
          reuseSelectedId = '';
          message = '';
          busy = false;
          render();
          return;
        }
      }
      message = error?.message || 'Failed to save personnel record.';
      busy = false;
      render();
    }
  };
  form?.addEventListener('submit', onSubmit);
  render();

  return () => {
    form?.removeEventListener('submit', onSubmit);
  };
}
