import { personnelDisplayName } from './personnel-identity.js';

function clean(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function tokens(value) {
  return normalize(value)
    .split(' ')
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean);
}

export function attendanceNameParts(name) {
  const parts = clean(name).split(' ').filter(Boolean);
  return {
    first: parts[0] || '',
    last: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

function editDistance(left, right) {
  const rows = left.length + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row < rows; row += 1) {
    const next = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      next[column] = Math.min(
        next[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    previous = next;
  }
  return previous[right.length];
}

function typoDistance(entered, candidate) {
  if (!entered || !candidate || entered === candidate) return entered && candidate && entered === candidate ? 0 : null;
  const distance = editDistance(entered, candidate);
  const shortest = Math.min(entered.length, candidate.length);
  if (distance === 1 && shortest >= 4) return 1;
  if (distance === 2 && shortest >= 7) return 2;
  return null;
}

function personSuggestion(person) {
  const personalName = clean(person?.name ?? person?.personalName);
  const rankTitle = clean(person?.rank_title ?? person?.rankTitle);
  return {
    personId: person?.id ?? person?.personId ?? null,
    personalName,
    rankTitle,
    commandOrganization: clean(person?.command_organization ?? person?.commandOrganization),
    installation: clean(person?.installation),
    active: person?.active === false ? false : true,
    displayName: personnelDisplayName(rankTitle, personalName) || personalName || 'Person',
    ...attendanceNameParts(personalName),
  };
}

export function suggestAttendancePeople({ firstName, lastName } = {}, people) {
  const enteredFirst = tokens(firstName)[0] || '';
  const enteredLast = tokens(lastName).at(-1) || '';
  if (!enteredFirst || !enteredLast) return { status: 'empty', people: [] };

  const directory = [];
  const seen = new Set();
  for (const person of people || []) {
    const suggestion = personSuggestion(person);
    if (!suggestion.personId || !normalize(suggestion.first) || !normalize(suggestion.last) || seen.has(suggestion.personId)) continue;
    seen.add(suggestion.personId);
    directory.push(suggestion);
  }

  const exact = directory.filter((person) => normalize(person.first) === enteredFirst && normalize(person.last) === enteredLast);
  exact.sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }));
  if (exact.length) return { status: 'exact', people: exact };

  const possible = [];
  for (const person of directory) {
    const firstDistance = typoDistance(enteredFirst, normalize(person.first));
    const lastDistance = typoDistance(enteredLast, normalize(person.last));
    if (firstDistance == null || lastDistance == null) continue;
    const total = firstDistance + lastDistance;
    if (total < 1 || total > 2) continue;
    possible.push({ ...person, distance: total });
  }
  possible.sort((left, right) => left.distance - right.distance
    || left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }));
  if (possible.length) return { status: 'possible', people: possible.slice(0, 3) };
  return { status: 'none', people: [] };
}
