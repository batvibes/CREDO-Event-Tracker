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

function knownRankTokens(people, enteredRank) {
  const ranks = new Set();
  const add = (value) => {
    const parts = clean(value).split(' ').filter(Boolean);
    if (parts.length === 1) ranks.add(normalize(parts[0]));
  };
  add(enteredRank);
  for (const person of people || []) add(person?.rank_title ?? person?.rankTitle);
  return ranks;
}

function personalWords(name, rankTitle, ranks) {
  let words = clean(name).split(' ').filter(Boolean);
  const ownRank = clean(rankTitle).split(' ').filter(Boolean);
  if (ownRank.length && words.length > ownRank.length) {
    const sameRank = ownRank.every((part, index) => normalize(words[index]) === normalize(part));
    if (sameRank) words = words.slice(ownRank.length);
  }
  if (words.length >= 3 && ranks.has(normalize(words[0]))) words = words.slice(1);
  return words;
}

export function attendancePersonalParts(person, people, enteredRank = '') {
  const words = personalWords(
    person?.name ?? person?.personalName,
    person?.rank_title ?? person?.rankTitle,
    knownRankTokens(people, enteredRank),
  );
  return {
    first: words[0] || '',
    last: words.length > 1 ? words[words.length - 1] : '',
  };
}

function variantParts(name, rankTitle, ranks) {
  const words = personalWords(name, rankTitle, ranks);
  return {
    first: normalize(words[0] || ''),
    last: normalize(words.length > 1 ? words[words.length - 1] : ''),
  };
}

function personSuggestion(person, ranks) {
  const personalName = clean(person?.name ?? person?.personalName);
  const rankTitle = clean(person?.rank_title ?? person?.rankTitle);
  const words = personalWords(personalName, rankTitle, ranks);
  return {
    personId: person?.id ?? person?.personId ?? null,
    personalName,
    rankTitle,
    commandOrganization: clean(person?.command_organization ?? person?.commandOrganization),
    installation: clean(person?.installation),
    active: person?.active === false ? false : true,
    displayName: personnelDisplayName(rankTitle, personalName) || personalName || 'Person',
    first: words[0] || '',
    last: words.length > 1 ? words[words.length - 1] : '',
  };
}

function comparisonVariants(person, aliases, ranks) {
  const variants = [];
  const add = (name, rankTitle) => {
    const parts = variantParts(name, rankTitle, ranks);
    if (parts.first && parts.last) variants.push(parts);
  };
  add(person?.name ?? person?.personalName, person?.rank_title ?? person?.rankTitle);
  const personId = person?.id ?? person?.personId;
  for (const alias of aliases || []) {
    if ((alias?.personId ?? alias?.person_id) !== personId) continue;
    add(alias?.displayName ?? alias?.display_name, person?.rank_title ?? person?.rankTitle);
  }
  return variants;
}

function namesMatch(left, right) {
  return Boolean(left) && left === right;
}

export function findAttendancePersonByName({ rankTitle, name } = {}, people, aliases) {
  const enteredName = clean(name);
  const enteredDisplay = normalize(personnelDisplayName(rankTitle, enteredName));
  const enteredPersonal = normalize(enteredName);
  if (!enteredDisplay && !enteredPersonal) return null;
  const aliasIds = new Set();
  for (const alias of aliases || []) {
    const aliasName = normalize(alias?.normalizedName ?? alias?.normalized_name ?? alias?.displayName ?? alias?.display_name);
    const ownerId = alias?.personId ?? alias?.person_id;
    if (ownerId && (namesMatch(aliasName, enteredDisplay) || namesMatch(aliasName, enteredPersonal))) aliasIds.add(ownerId);
  }
  const matches = [];
  const seen = new Set();
  for (const person of people || []) {
    const personId = person?.id ?? person?.personId;
    if (!personId || seen.has(personId)) continue;
    const personName = clean(person?.name ?? person?.personalName);
    const personRank = person?.rank_title ?? person?.rankTitle;
    const personDisplay = normalize(personnelDisplayName(personRank, personName));
    const personPersonal = normalize(personName);
    const matched = namesMatch(personDisplay, enteredDisplay)
      || namesMatch(personPersonal, enteredDisplay)
      || namesMatch(personPersonal, enteredPersonal)
      || namesMatch(personDisplay, enteredPersonal)
      || aliasIds.has(personId);
    if (!matched) continue;
    seen.add(personId);
    matches.push(person);
  }
  return matches.length === 1 ? matches[0] : null;
}

export function suggestAttendancePeople({ firstName, lastName, rankTitle } = {}, people, aliases) {
  const enteredFirst = tokens(firstName)[0] || '';
  const enteredLast = tokens(lastName).at(-1) || '';
  if (!enteredFirst || !enteredLast) return { status: 'empty', people: [] };

  const ranks = knownRankTokens(people, rankTitle);
  const directory = [];
  const seen = new Set();
  for (const person of people || []) {
    const suggestion = personSuggestion(person, ranks);
    const variants = comparisonVariants(person, aliases, ranks);
    if (!suggestion.personId || !variants.length || seen.has(suggestion.personId)) continue;
    seen.add(suggestion.personId);
    directory.push({ ...suggestion, variants });
  }

  const exact = directory.filter((person) => person.variants.some((variant) => variant.first === enteredFirst && variant.last === enteredLast));
  exact.sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }));
  if (exact.length) return { status: 'exact', people: exact };

  const possible = [];
  for (const person of directory) {
    let best = null;
    for (const variant of person.variants) {
      const firstDistance = typoDistance(enteredFirst, variant.first);
      const lastDistance = typoDistance(enteredLast, variant.last);
      if (firstDistance == null || lastDistance == null) continue;
      const total = firstDistance + lastDistance;
      if (total < 1 || total > 2) continue;
      if (best == null || total < best) best = total;
    }
    if (best == null) continue;
    possible.push({ ...person, distance: best });
  }
  possible.sort((left, right) => left.distance - right.distance
    || left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }));
  if (possible.length) return { status: 'possible', people: possible.slice(0, 3) };
  return { status: 'none', people: [] };
}
