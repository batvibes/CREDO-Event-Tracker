function cleanReferenceDisplayName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeReferenceName(value) {
  return cleanReferenceDisplayName(value).toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitCommaSeparatedList(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const parts = [];
  let current = '';
  let inAngles = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '<') inAngles = true;
    if (ch === '>') inAngles = false;
    if (ch === ',' && !inAngles) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const trailing = current.trim();
  if (trailing) parts.push(trailing);
  return parts;
}

export function serializeFacilitators(tokens) {
  return tokens
    .map((token) => cleanReferenceDisplayName(token.name))
    .filter(Boolean)
    .join(', ');
}

export function serializeCredoStaff(tokens) {
  return serializeFacilitators(tokens);
}

export function serializePoc(tokens) {
  return tokens
    .map((token) => {
      const name = cleanReferenceDisplayName(token.name);
      if (!name) return '';
      const email = String(token.email ?? '').trim();
      return email ? `${name} <${email}>` : name;
    })
    .filter(Boolean)
    .join(', ');
}

export function parseFacilitatorTokens(raw, people) {
  const parts = splitCommaSeparatedList(raw);
  if (!parts.length) return { mode: 'empty', tokens: [], legacyRaw: '' };

  const peopleByName = new Map(
    (people || []).map((person) => [normalizeReferenceName(person.name), person])
  );

  return {
    mode: 'tokens',
    tokens: parts.map((part) => {
      const name = cleanReferenceDisplayName(part);
      const match = peopleByName.get(normalizeReferenceName(name));
      if (match) {
        return {
          id: match.id,
          name: match.name,
          email: match.email || null,
          orphan: false,
        };
      }
      return { id: null, name, email: null, orphan: true };
    }),
    legacyRaw: '',
  };
}

export function parsePocTokens(raw, people) {
  const parts = splitCommaSeparatedList(raw);
  if (!parts.length) return { mode: 'empty', tokens: [], legacyRaw: '' };

  const peopleByName = new Map(
    (people || []).map((person) => [normalizeReferenceName(person.name), person])
  );

  const tokens = [];
  let safe = true;

  for (const part of parts) {
    const angleMatch = part.match(/^(.+?)\s*<([^<>]+)>\s*$/);
    if (angleMatch) {
      const name = cleanReferenceDisplayName(angleMatch[1]);
      const email = String(angleMatch[2] || '').trim();
      if (!name || !email) {
        safe = false;
        break;
      }
      const match = peopleByName.get(normalizeReferenceName(name));
      tokens.push({
        id: match?.id ?? null,
        name: match?.name || name,
        email,
        orphan: !match,
      });
      continue;
    }

    const name = cleanReferenceDisplayName(part);
    if (!name) {
      safe = false;
      break;
    }

    // Email-only fragments are common in historical POC text and are not safe person identities.
    if (name.includes('@') && !name.includes(' ')) {
      safe = false;
      break;
    }

    const match = peopleByName.get(normalizeReferenceName(name));
    if (match) {
      tokens.push({
        id: match.id,
        name: match.name,
        email: match.email || null,
        orphan: false,
      });
      continue;
    }

    tokens.push({ id: null, name, email: null, orphan: true });
  }

  if (!safe) {
    return { mode: 'legacy', tokens: [], legacyRaw: String(raw).trim() };
  }

  return { mode: 'tokens', tokens, legacyRaw: '' };
}

export function parseCredoStaffTokens(raw, teamMembers) {
  const parts = splitCommaSeparatedList(raw);
  if (!parts.length) return { mode: 'empty', tokens: [], legacyRaw: '' };

  const membersByName = new Map(
    (teamMembers || [])
      .filter((member) => cleanReferenceDisplayName(member.name))
      .map((member) => [normalizeReferenceName(member.name), member])
  );

  return {
    mode: 'tokens',
    tokens: parts.map((part) => {
      const name = cleanReferenceDisplayName(part);
      const match = membersByName.get(normalizeReferenceName(name));
      if (match) {
        return { id: match.id, name: match.name, orphan: false };
      }
      return { id: null, name, orphan: true };
    }),
    legacyRaw: '',
  };
}

function findNamedMatch(items, raw) {
  const normalized = normalizeReferenceName(raw);
  if (!normalized) return null;
  return (items || []).find((item) => normalizeReferenceName(item.name) === normalized) || null;
}

function closeAllMenus(except = null) {
  document.querySelectorAll('.ref-menu:not([hidden])').forEach((menu) => {
    if (menu !== except) menu.hidden = true;
  });
}

function bindOutsideClose(root, menu) {
  const onPointerDown = (event) => {
    if (root.contains(event.target)) return;
    menu.hidden = true;
  };
  document.addEventListener('pointerdown', onPointerDown);
  return () => document.removeEventListener('pointerdown', onPointerDown);
}

function createChip(label, onRemove) {
  const chip = document.createElement('span');
  chip.className = 'ref-chip';
  const text = document.createElement('span');
  text.className = 'ref-chip-label';
  text.textContent = label;
  chip.appendChild(text);
  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ref-chip-remove';
    removeBtn.setAttribute('aria-label', `Remove ${label}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove();
    });
    chip.appendChild(removeBtn);
  }
  return chip;
}

function referenceConflictMessage(error, fallbackName = 'that name') {
  if (error?.code === 'REFERENCE_NAME_EXISTS') {
    return error.message || `A roster entry named “${fallbackName}” already exists.`;
  }
  return null;
}

function renameConfirmMarkup(oldName, newName) {
  return `
    <div class="ref-manage-panel">
      <div class="ref-manage-header">
        <button type="button" class="ref-manage-back" data-action="manage-back">← Back</button>
        <div class="ref-manage-title">Rename</div>
      </div>
      <p class="ref-rename-confirm-lead">Rename “${escapeHtml(oldName)}” to “${escapeHtml(newName)}”?</p>
      <p class="ref-rename-confirm-copy">This will update this name everywhere it is currently used in Events and AARs.</p>
      <div class="ref-inline-add-actions">
        <button type="button" class="btn btn-secondary" data-action="rename-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="rename-everywhere">Rename Everywhere</button>
      </div>
    </div>`;
}

function removeConfirmMarkup(name) {
  return `
    <div class="ref-manage-panel">
      <div class="ref-manage-header">
        <button type="button" class="ref-manage-back" data-action="manage-back">← Back</button>
        <div class="ref-manage-title">Remove from list</div>
      </div>
      <p class="ref-rename-confirm-lead">Remove “${escapeHtml(name)}” from the list?</p>
      <p class="ref-rename-confirm-copy">This removes it from future selections. Existing Events and AARs will not be changed.</p>
      <div class="ref-inline-add-actions">
        <button type="button" class="btn btn-secondary" data-action="remove-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="remove-confirm">Remove</button>
      </div>
    </div>`;
}

function mountNamedCombobox(root, options) {
  const {
    name,
    placeholder,
    addLabel,
    manageLabel,
    getItems,
    canCreate,
    canManage,
    onCreate,
    onUpdate,
    onRemove,
  } = options;

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = name;
  hidden.value = '';

  const control = document.createElement('div');
  control.className = 'ref-combobox-control';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ref-combobox-input';
  input.autocomplete = 'off';
  input.placeholder = placeholder;
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'ref-combobox-clear';
  clearBtn.setAttribute('aria-label', 'Clear selection');
  clearBtn.textContent = '×';
  clearBtn.hidden = true;

  const menu = document.createElement('div');
  menu.className = 'ref-menu ref-combobox-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');

  control.append(input, clearBtn);
  root.classList.add('ref-field', 'ref-combobox');
  root.replaceChildren(hidden, control, menu);

  let selected = null;
  let orphanValue = '';
  let unbindOutside = null;
  let menuMode = 'search'; // search | manage | rename | rename-confirm | remove-confirm
  let renameTarget = null;
  let pendingRenameName = '';
  let removeTarget = null;

  function syncHidden() {
    hidden.value = selected?.name || orphanValue || '';
  }

  function syncInputDisplay() {
    const value = selected?.name || orphanValue || '';
    input.value = value;
    clearBtn.hidden = !value;
    root.classList.toggle('has-orphan', Boolean(orphanValue) && !selected);
  }

  function closeMenu() {
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    menuMode = 'search';
    renameTarget = null;
    pendingRenameName = '';
    removeTarget = null;
  }

  function setSelection(item, orphan = '') {
    selected = item || null;
    orphanValue = item ? '' : cleanReferenceDisplayName(orphan);
    syncHidden();
    syncInputDisplay();
    closeMenu();
  }

  function filteredItems(query) {
    const normalizedQuery = normalizeReferenceName(query);
    const items = getItems() || [];
    if (!normalizedQuery) return items.slice(0, 50);
    return items
      .filter((item) => normalizeReferenceName(item.name).includes(normalizedQuery))
      .slice(0, 50);
  }

  function applyCanonicalRename(oldName, updated) {
    if (!updated?.name) return;
    const oldNorm = normalizeReferenceName(oldName || updated.previousName);
    const current = selected?.name || orphanValue || '';
    if (selected?.id === updated.id || (oldNorm && normalizeReferenceName(current) === oldNorm)) {
      selected = updated;
      orphanValue = '';
      syncHidden();
      syncInputDisplay();
    }
  }

  async function commitRename(nextName) {
    try {
      const previousName = renameTarget.name;
      const updated = await onUpdate(renameTarget.id, { name: nextName });
      applyCanonicalRename(previousName, updated);
      menuMode = 'manage';
      pendingRenameName = '';
      renderMenu();
    } catch (error) {
      console.error(error);
      alert(referenceConflictMessage(error, nextName) || 'Failed to rename roster entry.');
    }
  }

  async function commitRemove() {
    const item = removeTarget;
    if (!item) return;
    try {
      menuMode = 'manage';
      await onRemove(item.id);
      if (selected?.id === item.id) {
        // Preserve the stored/selected display value; do not erase history.
        selected = null;
        orphanValue = item.name;
        syncHidden();
        syncInputDisplay();
      }
      removeTarget = null;
      renderManagePanel();
    } catch (error) {
      console.error(error);
      menuMode = 'remove-confirm';
      alert('Failed to remove roster entry from the list.');
    }
  }

  function renderRemoveConfirmPanel() {
    menu.innerHTML = removeConfirmMarkup(removeTarget?.name || '');

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      removeTarget = null;
      renderManagePanel();
    });
    menu.querySelector('[data-action="remove-cancel"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      removeTarget = null;
      renderManagePanel();
    });
    menu.querySelector('[data-action="remove-confirm"]')?.addEventListener('click', () => {
      commitRemove();
    });
  }

  function renderRenameConfirmPanel() {
    menu.innerHTML = renameConfirmMarkup(renameTarget?.name || '', pendingRenameName);

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'rename';
      renderRenamePanel();
    });
    menu.querySelector('[data-action="rename-cancel"]')?.addEventListener('click', () => {
      menuMode = 'rename';
      renderRenamePanel();
    });
    menu.querySelector('[data-action="rename-everywhere"]')?.addEventListener('click', () => {
      commitRename(pendingRenameName);
    });
  }

  function renderRenamePanel() {
    const currentName = renameTarget?.name || '';
    menu.innerHTML = `
      <div class="ref-manage-panel">
        <div class="ref-manage-header">
          <button type="button" class="ref-manage-back" data-action="manage-back">← Back</button>
          <div class="ref-manage-title">Rename</div>
        </div>
        <label class="ref-inline-add-label">
          Name
          <input type="text" class="ref-rename-input" value="${escapeHtml(pendingRenameName || currentName)}" maxlength="200">
        </label>
        <div class="ref-inline-add-actions">
          <button type="button" class="btn btn-secondary" data-action="rename-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="rename-save">Save</button>
        </div>
      </div>`;

    const renameInput = menu.querySelector('.ref-rename-input');
    renameInput?.focus();
    renameInput?.select();

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      pendingRenameName = '';
      renderMenu();
    });
    menu.querySelector('[data-action="rename-cancel"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      pendingRenameName = '';
      renderMenu();
    });
    menu.querySelector('[data-action="rename-save"]')?.addEventListener('click', () => {
      const nextName = cleanReferenceDisplayName(renameInput?.value);
      if (!nextName) {
        alert('Name is required.');
        return;
      }
      if (normalizeReferenceName(nextName) === normalizeReferenceName(renameTarget?.name)) {
        if (nextName === renameTarget.name) {
          menuMode = 'manage';
          pendingRenameName = '';
          renderMenu();
          return;
        }
      }
      pendingRenameName = nextName;
      menuMode = 'rename-confirm';
      renderRenameConfirmPanel();
    });
  }

  function renderManagePanel() {
    const items = [...(getItems() || [])]
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    const rows = items.length
      ? items.map((item) => `
          <div class="ref-manage-row" data-id="${escapeHtml(item.id)}">
            <div class="ref-manage-row-name">${escapeHtml(item.name)}</div>
            <div class="ref-manage-row-actions">
              <button type="button" class="ref-manage-action" data-action="rename" data-id="${escapeHtml(item.id)}">Rename</button>
              <button type="button" class="ref-manage-action" data-action="remove" data-id="${escapeHtml(item.id)}">Remove from list</button>
            </div>
          </div>`)
        .join('')
      : '<div class="ref-menu-empty">No roster entries to manage.</div>';

    menu.innerHTML = `
      <div class="ref-manage-panel">
        <div class="ref-manage-header">
          <button type="button" class="ref-manage-back" data-action="manage-back">← Back</button>
          <div class="ref-manage-title">${escapeHtml(manageLabel)}</div>
        </div>
        <div class="ref-manage-list">${rows}</div>
      </div>`;

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'search';
      renderMenu(input.value);
    });

    menu.querySelectorAll('[data-action="rename"]').forEach((button) => {
      button.addEventListener('click', () => {
        renameTarget = (getItems() || []).find((entry) => entry.id === button.dataset.id) || null;
        if (!renameTarget) return;
        pendingRenameName = '';
        menuMode = 'rename';
        renderRenamePanel();
      });
    });

    menu.querySelectorAll('[data-action="remove"]').forEach((button) => {
      button.addEventListener('click', () => {
        removeTarget = (getItems() || []).find((entry) => entry.id === button.dataset.id) || null;
        if (!removeTarget) return;
        menuMode = 'remove-confirm';
        renderRemoveConfirmPanel();
      });
    });
  }

  function renderMenu(query = input.value) {
    if (menuMode === 'manage') {
      renderManagePanel();
      return;
    }
    if (menuMode === 'rename') {
      renderRenamePanel();
      return;
    }
    if (menuMode === 'rename-confirm') {
      renderRenameConfirmPanel();
      return;
    }
    if (menuMode === 'remove-confirm') {
      renderRemoveConfirmPanel();
      return;
    }

    const items = filteredItems(query);
    const cleanedQuery = cleanReferenceDisplayName(query);
    const exact = cleanedQuery ? findNamedMatch(getItems(), cleanedQuery) : null;
    const showTypedAdd = canCreate() && cleanedQuery && !exact;
    const selectedId = selected?.id || null;
    const selectedName = selected?.name || orphanValue || '';

    const orphanMarkup = orphanValue && !selected
      ? `<button type="button" class="ref-menu-option is-orphan is-selected" data-action="keep-orphan">
          <span class="ref-menu-option-name">${escapeHtml(orphanValue)}</span>
          <span class="ref-menu-option-meta">Current value</span>
        </button>`
      : '';

    const optionMarkup = items.map((item) => {
      const isSelected = selectedId
        ? item.id === selectedId
        : normalizeReferenceName(item.name) === normalizeReferenceName(selectedName);
      return `
      <button type="button" class="ref-menu-option${isSelected ? ' is-selected' : ''}" role="option" data-id="${escapeHtml(item.id)}" aria-selected="${isSelected ? 'true' : 'false'}">
        <span class="ref-menu-option-name">${escapeHtml(item.name)}</span>
      </button>`;
    }).join('');

    const emptyMarkup = !items.length && !showTypedAdd && !orphanMarkup
      ? '<div class="ref-menu-empty">No matches</div>'
      : '';

    const actions = [];
    if (showTypedAdd) {
      actions.push(`
        <button type="button" class="ref-menu-add" data-action="add-typed">
          ${escapeHtml(addLabel)} “${escapeHtml(cleanedQuery)}”
        </button>`);
    }
    if (canManage()) {
      actions.push(`
        <button type="button" class="ref-menu-manage" data-action="open-manage">
          ${escapeHtml(manageLabel)}
        </button>`);
    }
    const actionsMarkup = actions.length
      ? `<div class="ref-menu-actions">${actions.join('')}</div>`
      : '';

    menu.innerHTML = `${orphanMarkup}${optionMarkup}${emptyMarkup}${actionsMarkup}`;

    menu.querySelectorAll('.ref-menu-option[data-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = (getItems() || []).find((entry) => entry.id === button.dataset.id);
        if (item) setSelection(item);
      });
    });

    menu.querySelector('[data-action="keep-orphan"]')?.addEventListener('click', () => {
      setSelection(null, orphanValue);
    });

    menu.querySelector('[data-action="add-typed"]')?.addEventListener('click', async () => {
      try {
        const created = await onCreate(cleanedQuery);
        setSelection(created);
      } catch (error) {
        console.error(error);
        alert('Failed to add reference entry.');
      }
    });

    menu.querySelector('[data-action="open-manage"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      renderManagePanel();
    });
  }

  function openMenu() {
    closeAllMenus(menu);
    if (menuMode !== 'manage' && menuMode !== 'rename' && menuMode !== 'rename-confirm' && menuMode !== 'remove-confirm') menuMode = 'search';
    renderMenu(input.value);
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (unbindOutside) unbindOutside();
    unbindOutside = bindOutsideClose(root, menu);
  }

  input.addEventListener('focus', () => {
    menuMode = 'search';
    openMenu();
  });
  input.addEventListener('click', () => {
    menuMode = 'search';
    openMenu();
  });
  input.addEventListener('input', () => {
    menuMode = 'search';
    if (selected && input.value !== selected.name) selected = null;
    if (orphanValue && input.value !== orphanValue) orphanValue = '';
    const typed = cleanReferenceDisplayName(input.value);
    const match = typed ? findNamedMatch(getItems(), typed) : null;
    if (match) {
      selected = match;
      orphanValue = '';
    } else {
      selected = null;
      orphanValue = typed;
    }
    syncHidden();
    clearBtn.hidden = !typed;
    openMenu();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      syncInputDisplay();
    }
    if (event.key === 'Enter' && menuMode === 'search') {
      event.preventDefault();
      const first = menu.querySelector('.ref-menu-option[data-id]');
      if (first) first.click();
    }
  });

  clearBtn.addEventListener('click', () => {
    setSelection(null, '');
    input.focus();
    openMenu();
  });

  return {
    reset() {
      setSelection(null, '');
    },
    setFromRaw(raw) {
      const cleaned = cleanReferenceDisplayName(raw);
      if (!cleaned) {
        setSelection(null, '');
        return;
      }
      const match = findNamedMatch(getItems(), cleaned);
      if (match) {
        setSelection(match);
        return;
      }
      setSelection(null, cleaned);
    },
    getValue() {
      syncHidden();
      return hidden.value;
    },
    refresh() {
      if (selected) {
        const latest = (getItems() || []).find((entry) => entry.id === selected.id);
        if (!latest) {
          const preserved = selected.name;
          selected = null;
          orphanValue = preserved;
          syncHidden();
          syncInputDisplay();
        } else {
          selected = latest;
          orphanValue = '';
          syncHidden();
          syncInputDisplay();
        }
      }
      if (!menu.hidden) renderMenu(input.value);
    },
    applyCanonicalRename,
  };
}

function mountPeopleMulti(root, options) {
  const {
    name,
    placeholder,
    getPeople,
    canCreate,
    canManage,
    onCreatePerson,
    onUpdatePerson,
    onRemovePerson,
    serialize,
    parse,
  } = options;

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = name;
  hidden.value = '';

  const chips = document.createElement('div');
  chips.className = 'ref-chips';

  const control = document.createElement('div');
  control.className = 'ref-multi-control';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ref-multi-input';
  input.autocomplete = 'off';
  input.placeholder = placeholder;

  const menu = document.createElement('div');
  menu.className = 'ref-menu ref-multi-menu';
  menu.hidden = true;

  control.append(input);
  root.classList.add('ref-field', 'ref-multi');
  root.replaceChildren(hidden, chips, control, menu);

  let tokens = [];
  let legacyRaw = '';
  let mode = 'empty';
  let unbindOutside = null;
  let menuMode = 'search'; // search | manage | rename | rename-confirm | remove-confirm | add
  let renameTarget = null;
  let pendingRenameName = '';
  let removeTarget = null;
  let skipOpenOnFocus = false;

  function syncHidden() {
    if (mode === 'legacy') {
      hidden.value = legacyRaw;
      return;
    }
    hidden.value = serialize(tokens);
  }

  function tokenKey(token) {
    if (token.id) return `id:${token.id}`;
    return `orphan:${normalizeReferenceName(token.name)}|${String(token.email || '').toLowerCase()}`;
  }

  function closeMenu() {
    menu.hidden = true;
    menuMode = 'search';
    renameTarget = null;
    pendingRenameName = '';
    removeTarget = null;
  }

  function renderChips() {
    chips.replaceChildren();
    if (mode === 'legacy' && legacyRaw) {
      const legacyChip = createChip(legacyRaw, () => {
        mode = 'tokens';
        legacyRaw = '';
        tokens = [];
        renderChips();
        syncHidden();
        input.focus();
        openMenu();
      });
      legacyChip.classList.add('is-legacy');
      chips.appendChild(legacyChip);
      return;
    }

    tokens.forEach((token, index) => {
      const label = serialize === serializePoc && token.email
        ? `${token.name} <${token.email}>`
        : token.name;
      const chip = createChip(label, () => {
        mode = 'tokens';
        legacyRaw = '';
        tokens = tokens.filter((_, i) => i !== index);
        renderChips();
        syncHidden();
      });
      if (token.orphan) chip.classList.add('is-orphan');
      chips.appendChild(chip);
    });
  }

  function selectedKeys() {
    return new Set(tokens.map(tokenKey));
  }

  function addToken(token) {
    mode = 'tokens';
    legacyRaw = '';
    const key = tokenKey(token);
    if (tokens.some((entry) => tokenKey(entry) === key)) return;
    tokens.push(token);
    renderChips();
    syncHidden();
    input.value = '';
    closeMenu();
    skipOpenOnFocus = true;
    input.focus();
  }

  function openPersonAdd(prefillName = '') {
    menuMode = 'add';
    menu.hidden = false;
    menu.innerHTML = `
      <div class="ref-inline-add">
        <label class="ref-inline-add-label">
          Name
          <input type="text" class="ref-person-name" value="${escapeHtml(prefillName)}" maxlength="200">
        </label>
        <div class="ref-inline-add-actions">
          <button type="button" class="btn btn-secondary ref-inline-cancel">Cancel</button>
          <button type="button" class="btn btn-primary ref-inline-save">Save</button>
        </div>
      </div>`;

    const nameInput = menu.querySelector('.ref-person-name');
    nameInput?.focus();
    nameInput?.select();

    menu.querySelector('.ref-inline-cancel')?.addEventListener('click', () => {
      menuMode = 'search';
      renderMenu();
    });

    menu.querySelector('.ref-inline-save')?.addEventListener('click', async () => {
      const personName = cleanReferenceDisplayName(nameInput?.value);
      if (!personName) {
        alert('Name is required.');
        return;
      }
      try {
        const created = await onCreatePerson({ name: personName });
        addToken({
          id: created.id,
          name: created.name,
          email: created.email || null,
          orphan: false,
        });
      } catch (error) {
        console.error(error);
        alert('Failed to add person.');
      }
    });
  }

  function personSecondaryText(person) {
    const parts = [];
    const email = String(person.email || '').trim();
    const phone = String(person.phone || '').trim();
    if (email) parts.push(email);
    if (phone) parts.push(phone);
    return parts.join(' · ');
  }

  function applyCanonicalRename(oldName, updated) {
    if (!updated?.name) return;
    const oldNorm = normalizeReferenceName(oldName || updated.previousName);
    tokens = tokens.map((token) => {
      if (token.id === updated.id || (oldNorm && normalizeReferenceName(token.name) === oldNorm)) {
        return {
          ...token,
          id: updated.id,
          name: updated.name,
          orphan: false,
        };
      }
      return token;
    });
    renderChips();
    syncHidden();
  }

  async function commitRename(nextName) {
    try {
      const previousName = renameTarget.name;
      const updated = await onUpdatePerson(renameTarget.id, { name: nextName });
      applyCanonicalRename(previousName, updated);
      menuMode = 'manage';
      pendingRenameName = '';
      renderManagePanel();
    } catch (error) {
      console.error(error);
      alert(referenceConflictMessage(error, nextName) || 'Failed to rename person.');
    }
  }

  async function commitRemove() {
    const person = removeTarget;
    if (!person) return;
    try {
      menuMode = 'manage';
      await onRemovePerson(person.id);
      // Keep already-selected chips/historical text; only future picks hide this person.
      tokens = tokens.map((token) => {
        if (token.id !== person.id) return token;
        return { ...token, id: null, orphan: true };
      });
      renderChips();
      syncHidden();
      removeTarget = null;
      renderManagePanel();
    } catch (error) {
      console.error(error);
      menuMode = 'remove-confirm';
      alert('Failed to remove person from the list.');
    }
  }

  function renderRemoveConfirmPanel() {
    menu.innerHTML = removeConfirmMarkup(removeTarget?.name || '');

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      removeTarget = null;
      renderManagePanel();
    });
    menu.querySelector('[data-action="remove-cancel"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      removeTarget = null;
      renderManagePanel();
    });
    menu.querySelector('[data-action="remove-confirm"]')?.addEventListener('click', () => {
      commitRemove();
    });
  }

  function renderRenameConfirmPanel() {
    menu.innerHTML = renameConfirmMarkup(renameTarget?.name || '', pendingRenameName);

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'rename';
      renderRenamePanel();
    });
    menu.querySelector('[data-action="rename-cancel"]')?.addEventListener('click', () => {
      menuMode = 'rename';
      renderRenamePanel();
    });
    menu.querySelector('[data-action="rename-everywhere"]')?.addEventListener('click', () => {
      commitRename(pendingRenameName);
    });
  }

  function renderRenamePanel() {
    menu.innerHTML = `
      <div class="ref-manage-panel">
        <div class="ref-manage-header">
          <button type="button" class="ref-manage-back" data-action="manage-back">← Back</button>
          <div class="ref-manage-title">Rename</div>
        </div>
        <label class="ref-inline-add-label">
          Name
          <input type="text" class="ref-rename-input" value="${escapeHtml(pendingRenameName || renameTarget?.name || '')}" maxlength="200">
        </label>
        <div class="ref-inline-add-actions">
          <button type="button" class="btn btn-secondary" data-action="rename-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="rename-save">Save</button>
        </div>
      </div>`;

    const renameInput = menu.querySelector('.ref-rename-input');
    renameInput?.focus();
    renameInput?.select();

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      pendingRenameName = '';
      renderManagePanel();
    });
    menu.querySelector('[data-action="rename-cancel"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      pendingRenameName = '';
      renderManagePanel();
    });
    menu.querySelector('[data-action="rename-save"]')?.addEventListener('click', () => {
      const nextName = cleanReferenceDisplayName(renameInput?.value);
      if (!nextName) {
        alert('Name is required.');
        return;
      }
      if (nextName === renameTarget?.name) {
        menuMode = 'manage';
        pendingRenameName = '';
        renderManagePanel();
        return;
      }
      pendingRenameName = nextName;
      menuMode = 'rename-confirm';
      renderRenameConfirmPanel();
    });
  }

  function renderManagePanel() {
    const people = [...(getPeople() || [])]
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    const rows = people.length
      ? people.map((person) => `
          <div class="ref-manage-row" data-id="${escapeHtml(person.id)}">
            <div class="ref-manage-row-name">${escapeHtml(person.name)}</div>
            <div class="ref-manage-row-actions">
              <button type="button" class="ref-manage-action" data-action="rename" data-id="${escapeHtml(person.id)}">Rename</button>
              <button type="button" class="ref-manage-action" data-action="remove" data-id="${escapeHtml(person.id)}">Remove from list</button>
            </div>
          </div>`)
        .join('')
      : '<div class="ref-menu-empty">No people to manage.</div>';

    menu.innerHTML = `
      <div class="ref-manage-panel">
        <div class="ref-manage-header">
          <button type="button" class="ref-manage-back" data-action="manage-back">← Back</button>
          <div class="ref-manage-title">Manage People</div>
        </div>
        <div class="ref-manage-list">${rows}</div>
      </div>`;

    menu.querySelector('[data-action="manage-back"]')?.addEventListener('click', () => {
      menuMode = 'search';
      renderMenu();
    });

    menu.querySelectorAll('[data-action="rename"]').forEach((button) => {
      button.addEventListener('click', () => {
        renameTarget = (getPeople() || []).find((entry) => entry.id === button.dataset.id) || null;
        if (!renameTarget) return;
        pendingRenameName = '';
        menuMode = 'rename';
        renderRenamePanel();
      });
    });

    menu.querySelectorAll('[data-action="remove"]').forEach((button) => {
      button.addEventListener('click', () => {
        removeTarget = (getPeople() || []).find((entry) => entry.id === button.dataset.id) || null;
        if (!removeTarget) return;
        menuMode = 'remove-confirm';
        renderRemoveConfirmPanel();
      });
    });
  }

  function renderMenu() {
    if (menuMode === 'manage') {
      renderManagePanel();
      return;
    }
    if (menuMode === 'rename') {
      renderRenamePanel();
      return;
    }
    if (menuMode === 'rename-confirm') {
      renderRenameConfirmPanel();
      return;
    }
    if (menuMode === 'remove-confirm') {
      renderRemoveConfirmPanel();
      return;
    }
    if (menuMode === 'add') {
      return;
    }

    if (mode === 'legacy') {
      menu.innerHTML = '<div class="ref-menu-empty">Historical value preserved. Clear the chip to choose people.</div>';
      return;
    }

    const cleanedQuery = cleanReferenceDisplayName(input.value);
    const query = normalizeReferenceName(cleanedQuery);
    const selected = selectedKeys();
    const people = (getPeople() || [])
      .filter((person) => {
        if (selected.has(`id:${person.id}`)) return false;
        if (!query) return true;
        const haystack = `${person.name} ${person.email || ''} ${person.phone || ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 50);

    const exactPerson = cleanedQuery
      ? (getPeople() || []).find((person) => normalizeReferenceName(person.name) === query)
      : null;
    const showTypedAdd = canCreate() && cleanedQuery && !exactPerson;

    const optionsMarkup = people.map((person) => {
      const secondary = personSecondaryText(person);
      return `
      <button type="button" class="ref-menu-option" data-id="${escapeHtml(person.id)}">
        <span class="ref-menu-option-name">${escapeHtml(person.name)}</span>
        ${secondary ? `<span class="ref-menu-option-meta">${escapeHtml(secondary)}</span>` : ''}
      </button>`;
    }).join('');

    const emptyMarkup = !people.length && !showTypedAdd
      ? '<div class="ref-menu-empty">No matching people</div>'
      : '';

    const actions = [];
    if (showTypedAdd) {
      actions.push(`
        <button type="button" class="ref-menu-add" data-action="add-person">
          + Add Person “${escapeHtml(cleanedQuery)}”
        </button>`);
    }
    if (canManage()) {
      actions.push('<button type="button" class="ref-menu-manage" data-action="open-manage">Manage People</button>');
    }
    const actionsMarkup = actions.length
      ? `<div class="ref-menu-actions">${actions.join('')}</div>`
      : '';

    menu.innerHTML = `${optionsMarkup}${emptyMarkup}${actionsMarkup}`;

    menu.querySelectorAll('.ref-menu-option[data-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const person = (getPeople() || []).find((entry) => entry.id === button.dataset.id);
        if (!person) return;
        addToken({
          id: person.id,
          name: person.name,
          email: person.email || null,
          orphan: false,
        });
      });
    });

    menu.querySelector('[data-action="add-person"]')?.addEventListener('click', () => {
      openPersonAdd(cleanedQuery);
    });

    menu.querySelector('[data-action="open-manage"]')?.addEventListener('click', () => {
      menuMode = 'manage';
      renderManagePanel();
    });
  }

  function openMenu() {
    closeAllMenus(menu);
    if (menuMode !== 'manage' && menuMode !== 'rename' && menuMode !== 'rename-confirm' && menuMode !== 'remove-confirm' && menuMode !== 'add') {
      menuMode = 'search';
    }
    renderMenu();
    menu.hidden = false;
    if (unbindOutside) unbindOutside();
    unbindOutside = bindOutsideClose(root, menu);
  }

  input.addEventListener('focus', () => {
    if (skipOpenOnFocus) {
      skipOpenOnFocus = false;
      return;
    }
    menuMode = 'search';
    openMenu();
  });
  input.addEventListener('click', () => {
    skipOpenOnFocus = false;
    menuMode = 'search';
    openMenu();
  });
  input.addEventListener('input', () => {
    skipOpenOnFocus = false;
    menuMode = 'search';
    openMenu();
  });

  return {
    reset() {
      tokens = [];
      legacyRaw = '';
      mode = 'empty';
      input.value = '';
      renderChips();
      syncHidden();
      closeMenu();
    },
    setFromRaw(raw) {
      const cleaned = String(raw ?? '').trim();
      if (!cleaned) {
        this.reset();
        return;
      }
      const parsed = parse(cleaned, getPeople());
      if (parsed.mode === 'legacy') {
        mode = 'legacy';
        legacyRaw = parsed.legacyRaw;
        tokens = [];
      } else {
        mode = 'tokens';
        legacyRaw = '';
        tokens = parsed.tokens;
      }
      input.value = '';
      renderChips();
      syncHidden();
    },
    getValue() {
      syncHidden();
      return hidden.value;
    },
    refresh() {
      // Drop inactive people from selectable tokens only when they were roster-linked;
      // orphan/historical chips remain.
      const people = getPeople() || [];
      const activeIds = new Set(people.map((person) => person.id));
      tokens = tokens.map((token) => {
        if (!token.id) return token;
        const latest = people.find((person) => person.id === token.id);
        if (!latest || !activeIds.has(token.id)) {
          return { ...token, id: null, orphan: true };
        }
        return { ...token, name: latest.name, orphan: false };
      });
      renderChips();
      syncHidden();
      if (!menu.hidden) renderMenu();
    },
    applyCanonicalRename,
  };
}

function mountStaffMulti(root, options) {
  const { name, getTeamMembers } = options;

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = name;
  hidden.value = '';

  const chips = document.createElement('div');
  chips.className = 'ref-chips';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ref-staff-trigger';
  trigger.textContent = 'Select CREDO Staff';

  const menu = document.createElement('div');
  menu.className = 'ref-menu ref-staff-menu';
  menu.hidden = true;

  root.classList.add('ref-field', 'ref-staff');
  root.replaceChildren(hidden, chips, trigger, menu);

  let tokens = [];
  let unbindOutside = null;

  function syncHidden() {
    hidden.value = serializeCredoStaff(tokens);
  }

  function renderChips() {
    chips.replaceChildren();
    tokens.forEach((token, index) => {
      const chip = createChip(token.name, () => {
        tokens = tokens.filter((_, i) => i !== index);
        renderChips();
        syncHidden();
        if (!menu.hidden) renderMenu();
      });
      if (token.orphan) chip.classList.add('is-orphan');
      chips.appendChild(chip);
    });
    trigger.textContent = tokens.length
      ? `${tokens.length} selected`
      : 'Select CREDO Staff';
  }

  function selectedIds() {
    return new Set(tokens.filter((token) => token.id).map((token) => token.id));
  }

  function renderMenu() {
    const members = (getTeamMembers() || [])
      .filter((member) => cleanReferenceDisplayName(member.name))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    const selected = selectedIds();
    const orphanTokens = tokens.filter((token) => token.orphan);

    if (!members.length && !orphanTokens.length) {
      menu.innerHTML = '<div class="ref-menu-empty">No team members available</div>';
      return;
    }

    const memberMarkup = members.map((member) => `
      <label class="ref-check-option">
        <input type="checkbox" data-id="${escapeHtml(member.id)}" ${selected.has(member.id) ? 'checked' : ''}>
        <span>${escapeHtml(member.name)}</span>
      </label>
    `).join('');

    const orphanMarkup = orphanTokens.length
      ? `<div class="ref-menu-empty">Preserved historical names not on the current team list remain as chips above.</div>`
      : '';

    menu.innerHTML = `${memberMarkup}${orphanMarkup}`;

    menu.querySelectorAll('input[type="checkbox"][data-id]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const member = members.find((entry) => entry.id === checkbox.dataset.id);
        if (!member) return;
        if (checkbox.checked) {
          if (!tokens.some((token) => token.id === member.id)) {
            tokens.push({ id: member.id, name: member.name, orphan: false });
          }
        } else {
          tokens = tokens.filter((token) => token.id !== member.id);
        }
        renderChips();
        syncHidden();
      });
    });
  }

  function openMenu() {
    closeAllMenus(menu);
    renderMenu();
    menu.hidden = false;
    if (unbindOutside) unbindOutside();
    unbindOutside = bindOutsideClose(root, menu);
  }

  trigger.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else menu.hidden = true;
  });

  return {
    reset() {
      tokens = [];
      renderChips();
      syncHidden();
      menu.hidden = true;
    },
    setFromRaw(raw) {
      const cleaned = String(raw ?? '').trim();
      if (!cleaned) {
        this.reset();
        return;
      }
      const parsed = parseCredoStaffTokens(cleaned, getTeamMembers());
      tokens = parsed.tokens;
      renderChips();
      syncHidden();
    },
    getValue() {
      syncHidden();
      return hidden.value;
    },
    refresh() {
      renderChips();
      if (!menu.hidden) renderMenu();
    },
  };
}

/**
 * Mount reference selectors into New/Edit Event form shells.
 * Saves continue to use existing text field names via hidden inputs.
 */
export function initEventReferenceFields(form, adapters) {
  const {
    getCommands,
    getLocations,
    getVenues,
    getCaterers,
    getPeople,
    getTeamMembers,
    canCreateReferences,
    createCommand,
    createLocation,
    createVenue,
    createCaterer,
    createPerson,
    updateCommand,
    updateLocation,
    updateVenue,
    updateCaterer,
    updatePerson,
    removeCommand,
    removeLocation,
    removeVenue,
    removeCaterer,
    removePerson,
    onPeopleChanged,
    onNamedListsChanged,
  } = adapters;

  const canManage = () => canCreateReferences();

  const command = mountNamedCombobox(form.querySelector('[data-ref-field="command"]'), {
    name: 'command',
    placeholder: 'Search commands…',
    addLabel: '+ Add Command',
    manageLabel: 'Manage Commands',
    getItems: getCommands,
    canCreate: canCreateReferences,
    canManage,
    onCreate: createCommand,
    onUpdate: async (id, updates) => {
      const updated = await updateCommand(id, updates);
      onNamedListsChanged?.('commands');
      return updated;
    },
    onRemove: async (id) => {
      const removed = await removeCommand(id);
      onNamedListsChanged?.('commands');
      return removed;
    },
  });

  const location = mountNamedCombobox(form.querySelector('[data-ref-field="location"]'), {
    name: 'location',
    placeholder: 'Search locations…',
    addLabel: '+ Add Location',
    manageLabel: 'Manage Locations',
    getItems: getLocations,
    canCreate: canCreateReferences,
    canManage,
    onCreate: createLocation,
    onUpdate: async (id, updates) => {
      const updated = await updateLocation(id, updates);
      onNamedListsChanged?.('locations');
      return updated;
    },
    onRemove: async (id) => {
      const removed = await removeLocation(id);
      onNamedListsChanged?.('locations');
      return removed;
    },
  });

  const venue = mountNamedCombobox(form.querySelector('[data-ref-field="venue"]'), {
    name: 'venue',
    placeholder: 'Search venues…',
    addLabel: '+ Add Venue',
    manageLabel: 'Manage Venues',
    getItems: getVenues,
    canCreate: canCreateReferences,
    canManage,
    onCreate: createVenue,
    onUpdate: async (id, updates) => {
      const updated = await updateVenue(id, updates);
      onNamedListsChanged?.('venues');
      return updated;
    },
    onRemove: async (id) => {
      const removed = await removeVenue(id);
      onNamedListsChanged?.('venues');
      return removed;
    },
  });

  const cateringVendor = mountNamedCombobox(form.querySelector('[data-ref-field="cateringVendor"]'), {
    name: 'cateringVendor',
    placeholder: 'Search caterers…',
    addLabel: '+ Add Caterer',
    manageLabel: 'Manage Caterers',
    getItems: getCaterers,
    canCreate: canCreateReferences,
    canManage,
    onCreate: createCaterer,
    onUpdate: async (id, updates) => {
      const updated = await updateCaterer(id, updates);
      onNamedListsChanged?.('caterers');
      return updated;
    },
    onRemove: async (id) => {
      const removed = await removeCaterer(id);
      onNamedListsChanged?.('caterers');
      return removed;
    },
  });

  const facilitators = mountPeopleMulti(form.querySelector('[data-ref-field="facilitators"]'), {
    name: 'facilitators',
    placeholder: 'Search people…',
    getPeople,
    canCreate: canCreateReferences,
    canManage,
    onCreatePerson: async (person) => {
      const created = await createPerson(person);
      onPeopleChanged?.(created);
      return created;
    },
    onUpdatePerson: async (id, updates) => {
      const previousName = (getPeople() || []).find((entry) => entry.id === id)?.name;
      const updated = await updatePerson(id, updates);
      if (updates?.name) {
        facilitators.applyCanonicalRename(previousName, updated);
        poc.applyCanonicalRename(previousName, updated);
      }
      onPeopleChanged?.(updated);
      return updated;
    },
    onRemovePerson: async (id) => {
      const removed = await removePerson(id);
      onPeopleChanged?.(removed);
      return removed;
    },
    serialize: serializeFacilitators,
    parse: parseFacilitatorTokens,
  });

  const poc = mountPeopleMulti(form.querySelector('[data-ref-field="poc"]'), {
    name: 'poc',
    placeholder: 'Search people…',
    getPeople,
    canCreate: canCreateReferences,
    canManage,
    onCreatePerson: async (person) => {
      const created = await createPerson(person);
      onPeopleChanged?.(created);
      return created;
    },
    onUpdatePerson: async (id, updates) => {
      const previousName = (getPeople() || []).find((entry) => entry.id === id)?.name;
      const updated = await updatePerson(id, updates);
      if (updates?.name) {
        facilitators.applyCanonicalRename(previousName, updated);
        poc.applyCanonicalRename(previousName, updated);
      }
      onPeopleChanged?.(updated);
      return updated;
    },
    onRemovePerson: async (id) => {
      const removed = await removePerson(id);
      onPeopleChanged?.(removed);
      return removed;
    },
    serialize: serializePoc,
    parse: parsePocTokens,
  });

  const credoStaff = mountStaffMulti(form.querySelector('[data-ref-field="credoStaff"]'), {
    name: 'credoStaff',
    getTeamMembers,
  });

  return {
    reset() {
      command.reset();
      location.reset();
      venue.reset();
      cateringVendor.reset();
      facilitators.reset();
      poc.reset();
      credoStaff.reset();
    },
    setFromEvent(event) {
      command.setFromRaw(event?.command);
      location.setFromRaw(event?.location);
      venue.setFromRaw(event?.venue);
      cateringVendor.setFromRaw(event?.cateringVendor);
      facilitators.setFromRaw(event?.facilitators);
      poc.setFromRaw(event?.poc);
      credoStaff.setFromRaw(event?.credoStaff);
    },
    refreshPeople() {
      facilitators.refresh();
      poc.refresh();
    },
    refreshNamed() {
      command.refresh();
      location.refresh();
      venue.refresh();
      cateringVendor.refresh();
    },
    refreshStaff() {
      credoStaff.refresh();
    },
    applyPersonRename(oldName, updated) {
      facilitators.applyCanonicalRename(oldName, updated);
      poc.applyCanonicalRename(oldName, updated);
    },
  };
}
