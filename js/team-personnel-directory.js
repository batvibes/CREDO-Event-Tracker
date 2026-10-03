/**
 * Team directory rules for the Unified Personnel view.
 * CREDO Staff is the active people assigned to CREDO.
 * Points of Contact is every active canonical person.
 * Role badges still come only from explicit public.people flags.
 * This module does not read events or team_members.
 */

import { comparePersonnelDisplayNames, personnelDisplayName } from './personnel-identity.js';

export const TEAM_DIRECTORY_TABS = [
  { id: 'staff', label: 'CREDO Staff' },
  { id: 'poc', label: 'Points of Contact' },
];

export function isCommandHighlightsNotesVisible(tab) {
  return tab === 'staff';
}

export const TEAM_STAFF_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'billet', label: 'Billet / Role' },
  { id: 'prd', label: 'PRD / EAOS' },
];

export const TEAM_DIRECTORY_EMPTY_MESSAGES = {
  staff: 'No active CREDO Staff have been designated yet.',
  poc: 'No active people are in the directory.',
};

const ROLE_BADGES = [
  { flag: 'isCredoStaff', id: 'staff', label: 'Staff' },
  { flag: 'isFacilitator', id: 'facilitator', label: 'Facilitator' },
];

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function explicitTrue(value) {
  return value === true;
}

function staffDisplayOrder(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
  return null;
}

export function isTeamDirectoryTab(tab) {
  return TEAM_DIRECTORY_TABS.some((entry) => entry.id === tab);
}

export function mapTeamDirectoryPerson(row) {
  return {
    id: row?.id ?? null,
    name: cleanText(row?.name) ?? '',
    firstName: cleanText(row?.first_name),
    lastName: cleanText(row?.last_name),
    rankTitle: cleanText(row?.rank_title),
    commandOrganization: cleanText(row?.command_organization),
    installation: cleanText(row?.installation),
    active: explicitTrue(row?.active),
    isCredoStaff: explicitTrue(row?.is_credo_staff),
    isFacilitator: explicitTrue(row?.is_facilitator),
    isPoc: explicitTrue(row?.is_poc),
    staffBilletOrRole: cleanText(row?.staff_billet_or_role),
    staffStatusNextAction: cleanText(row?.staff_status_next_action),
    staffPrdEaos: cleanText(row?.staff_prd_eaos),
    staffDisplayOrder: staffDisplayOrder(row?.staff_display_order),
  };
}

export function teamDirectoryRoleBadges(person) {
  return ROLE_BADGES.filter((badge) => person?.[badge.flag] === true).map((badge) => ({
    id: badge.id,
    label: badge.label,
  }));
}

function compareNames(left, right) {
  return String(left?.name ?? '').localeCompare(String(right?.name ?? ''), undefined, { sensitivity: 'base' });
}

function uniquePeople(personnel) {
  const seen = new Set();
  const people = [];
  for (const person of personnel ?? []) {
    if (!person || person.id == null || seen.has(person.id)) continue;
    seen.add(person.id);
    people.push(person);
  }
  return people;
}

function sortByName(personnel) {
  return [...personnel].sort(compareNames);
}

function sortByDisplayName(personnel) {
  return [...personnel].sort(comparePersonnelDisplayNames);
}

function sortStaff(personnel) {
  return [...personnel].sort((left, right) => {
    const leftOrder = Number.isInteger(left.staffDisplayOrder) ? left.staffDisplayOrder : Number.POSITIVE_INFINITY;
    const rightOrder = Number.isInteger(right.staffDisplayOrder) ? right.staffDisplayOrder : Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return compareNames(left, right);
  });
}

export function filterTeamDirectory(personnel, tab) {
  const active = uniquePeople(personnel).filter((person) => person.active === true);
  if (tab === 'staff') return sortStaff(active.filter((person) => person.isCredoStaff === true));
  if (tab === 'facilitators') return sortByName(active.filter((person) => person.isFacilitator === true));
  if (tab === 'poc') return sortByDisplayName(active);
  if (tab === 'all') return sortByName(active);
  return sortStaff(active.filter((person) => person.isCredoStaff === true));
}

function appendRoleBadges(parent, person) {
  const badges = teamDirectoryRoleBadges(person);
  if (!badges.length) return;
  const doc = parent.ownerDocument;
  const list = doc.createElement('div');
  list.className = 'team-role-badges';
  badges.forEach((badge) => {
    const chip = doc.createElement('span');
    chip.className = `team-role-badge team-role-badge-${badge.id}`;
    chip.textContent = badge.label;
    list.appendChild(chip);
  });
  parent.appendChild(list);
}

export function directoryPersonnelName(person) {
  const firstName = cleanText(person?.firstName);
  const lastName = cleanText(person?.lastName);
  if (lastName && firstName) return `${lastName}, ${firstName}`;
  if (lastName) return lastName;
  if (firstName) return firstName;
  return cleanText(person?.name) ?? '';
}

export function directoryPersonnelNeedsReview(person) {
  return !cleanText(person?.firstName) && !cleanText(person?.lastName);
}

function appendPersonName(parent, person) {
  const doc = parent.ownerDocument;
  const name = doc.createElement('div');
  name.className = 'team-directory-name';
  name.textContent = personnelDisplayName(person.rankTitle, person.name) || '—';
  parent.appendChild(name);
}

function appendDirectoryName(parent, person) {
  const doc = parent.ownerDocument;
  const line = doc.createElement('div');
  line.className = 'team-directory-name-line';
  const name = doc.createElement('div');
  name.className = 'team-directory-name';
  name.textContent = directoryPersonnelName(person) || '—';
  line.appendChild(name);
  if (directoryPersonnelNeedsReview(person)) {
    const review = doc.createElement('span');
    review.className = 'team-directory-review';
    review.textContent = 'Needs Review';
    line.appendChild(review);
  }
  parent.appendChild(line);
}

function appendEditButton(parent, person, onEdit) {
  if (!onEdit) return;
  const doc = parent.ownerDocument;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'team-directory-edit';
  button.textContent = 'Edit';
  button.addEventListener('click', () => onEdit(person));
  parent.appendChild(button);
}

function appendDirectoryIdentity(parent, person) {
  const doc = parent.ownerDocument;
  const identity = doc.createElement('div');
  identity.className = 'team-directory-identity';
  appendPersonName(identity, person);
  appendRoleBadges(identity, person);
  parent.appendChild(identity);
}

function appendActionCell(parent, person, onEdit, tagName) {
  if (!onEdit) return;
  const doc = parent.ownerDocument;
  const cell = doc.createElement(tagName);
  cell.className = 'team-directory-action';
  appendEditButton(cell, person, onEdit);
  parent.appendChild(cell);
}

function renderCompactDirectory(doc, people, tab, onEdit) {
  const list = doc.createElement('div');
  list.className = onEdit ? 'team-directory-list team-directory-list-editable' : 'team-directory-list';
  if (!people.length) {
    const empty = doc.createElement('p');
    empty.className = 'team-directory-empty';
    empty.textContent = TEAM_DIRECTORY_EMPTY_MESSAGES[tab];
    list.appendChild(empty);
    return list;
  }

  const head = doc.createElement('div');
  head.className = 'team-directory-head';
  ['Rank / Title', 'Name', 'Command / Organization', 'Roles'].forEach((label) => {
    const cell = doc.createElement('span');
    cell.textContent = label;
    head.appendChild(cell);
  });
  if (onEdit) {
    const actionHead = doc.createElement('span');
    actionHead.className = 'team-directory-action';
    actionHead.textContent = 'Action';
    head.appendChild(actionHead);
  }
  list.appendChild(head);

  people.forEach((person) => {
    const row = doc.createElement('div');
    row.className = 'team-directory-row';
    row.dataset.personId = person.id;

    const personCell = doc.createElement('div');
    personCell.className = 'team-directory-person';
    appendDirectoryName(personCell, person);

    const rankCell = doc.createElement('div');
    rankCell.className = 'team-directory-rank';
    if (person.rankTitle) rankCell.textContent = person.rankTitle;

    const commandCell = doc.createElement('div');
    commandCell.className = 'team-directory-command';
    if (person.commandOrganization) commandCell.textContent = person.commandOrganization;

    const roleCell = doc.createElement('div');
    roleCell.className = 'team-directory-roles';
    appendRoleBadges(roleCell, person);

    row.append(rankCell, personCell, commandCell, roleCell);
    appendActionCell(row, person, onEdit, 'div');
    list.appendChild(row);
  });
  return list;
}

function staffCellText(person, columnId) {
  if (columnId === 'billet') return person.staffBilletOrRole || '—';
  if (columnId === 'prd') return person.staffPrdEaos || '—';
  return person.name || '—';
}

function renderStaffDirectory(doc, people, onEdit) {
  const wrap = doc.createElement('div');
  wrap.className = 'team-report-table-wrap';
  const table = doc.createElement('table');
  table.className = 'team-manpower-table team-staff-table';
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  TEAM_STAFF_COLUMNS.forEach((column) => {
    const th = doc.createElement('th');
    th.textContent = column.label;
    th.scope = 'col';
    headRow.appendChild(th);
  });
  if (onEdit) {
    const actionHead = doc.createElement('th');
    actionHead.className = 'team-directory-action';
    actionHead.scope = 'col';
    headRow.appendChild(actionHead);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = doc.createElement('tbody');
  if (!people.length) {
    const row = doc.createElement('tr');
    row.className = 'team-empty-row';
    const cell = doc.createElement('td');
    cell.colSpan = TEAM_STAFF_COLUMNS.length + (onEdit ? 1 : 0);
    cell.textContent = TEAM_DIRECTORY_EMPTY_MESSAGES.staff;
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    people.forEach((person) => {
      const row = doc.createElement('tr');
      row.dataset.personId = person.id;
      TEAM_STAFF_COLUMNS.forEach((column) => {
        const cell = doc.createElement('td');
        if (column.id === 'name') {
          appendDirectoryIdentity(cell, person);
        } else {
          const value = staffCellText(person, column.id);
          cell.textContent = value;
          if (value === '—') cell.classList.add('team-staff-empty');
        }
        row.appendChild(cell);
      });
      appendActionCell(row, person, onEdit, 'td');
      tbody.appendChild(row);
    });
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function renderTeamDirectoryView(panel, personnel, tab, headingLabel, options = {}) {
  const selectedTab = isTeamDirectoryTab(tab) ? tab : 'staff';
  const people = filterTeamDirectory(personnel, selectedTab);
  const doc = panel.ownerDocument;
  const onEdit = options.editable ? options.onEdit : null;
  panel.replaceChildren();

  const heading = doc.createElement('h2');
  heading.className = 'visually-hidden';
  heading.id = 'team-directory-heading';
  heading.textContent = headingLabel || TEAM_DIRECTORY_TABS.find((entry) => entry.id === selectedTab)?.label || 'CREDO Staff';
  panel.appendChild(heading);
  panel.appendChild(
    selectedTab === 'staff'
      ? renderStaffDirectory(doc, people, onEdit)
      : renderCompactDirectory(doc, people, selectedTab, onEdit)
  );
}
