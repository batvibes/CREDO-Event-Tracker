function cleanPersonnelText(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizePersonnelText(value) {
  return cleanPersonnelText(value).toLowerCase();
}

export function personnelDisplayName(rankTitle, name) {
  const rank = cleanPersonnelText(rankTitle);
  const personal = cleanPersonnelText(name);
  if (!personal) return rank;
  if (!rank) return personal;
  const rankNorm = normalizePersonnelText(rank);
  const nameNorm = normalizePersonnelText(personal);
  if (nameNorm === rankNorm || nameNorm.startsWith(`${rankNorm} `)) return personal;
  return `${rank} ${personal}`;
}

function comparePersonnelText(left, right) {
  return cleanPersonnelText(left).localeCompare(cleanPersonnelText(right), 'en', { sensitivity: 'base' });
}

function structuredSortKey(person) {
  const firstName = cleanPersonnelText(person?.firstName ?? person?.first_name);
  const lastName = cleanPersonnelText(person?.lastName ?? person?.last_name);
  if (lastName) return { kind: 'last', lastName, firstName };
  if (firstName) return { kind: 'first', lastName: '', firstName };
  return null;
}

function structuredSortPrimary(person, displayName) {
  const key = structuredSortKey(person);
  if (!key) return displayName;
  return key.kind === 'last' ? key.lastName : key.firstName;
}

export function comparePersonnelDisplayNames(left, right) {
  const leftDisplay = personnelDisplayName(left?.rankTitle ?? left?.rank_title, left?.name);
  const rightDisplay = personnelDisplayName(right?.rankTitle ?? right?.rank_title, right?.name);
  const byPrimary = comparePersonnelText(
    structuredSortPrimary(left, leftDisplay),
    structuredSortPrimary(right, rightDisplay),
  );
  if (byPrimary !== 0) return byPrimary;

  const leftKey = structuredSortKey(left);
  const rightKey = structuredSortKey(right);
  if (leftKey?.kind === 'last' && rightKey?.kind === 'last') {
    const byFirst = comparePersonnelText(leftKey.firstName, rightKey.firstName);
    if (byFirst !== 0) return byFirst;
  }

  const byDisplay = comparePersonnelText(leftDisplay, rightDisplay);
  if (byDisplay !== 0) return byDisplay;
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''), 'en');
}

export function personnelDisplayParts(rankTitle, name) {
  const rank = cleanPersonnelText(rankTitle);
  const personal = cleanPersonnelText(name);
  const display = personnelDisplayName(rank, personal);
  if (rank && personal && display === `${rank} ${personal}`) {
    return { rank, name: personal };
  }
  return { rank: '', name: display };
}

export function fullNameIncludesRank(rankTitle, name) {
  const rank = cleanPersonnelText(rankTitle);
  const personal = cleanPersonnelText(name);
  if (!rank || !personal) return false;
  const rankNorm = normalizePersonnelText(rank);
  const nameNorm = normalizePersonnelText(personal);
  return nameNorm === rankNorm || nameNorm.startsWith(`${rankNorm} `);
}

export function personnelHistoricalNames(person) {
  const names = [];
  const display = personnelDisplayName(person?.rankTitle ?? person?.rank_title, person?.name);
  const personal = cleanPersonnelText(person?.name);
  if (display) names.push(display);
  if (personal && normalizePersonnelText(personal) !== normalizePersonnelText(display)) names.push(personal);
  for (const alias of person?.aliases || []) {
    const aliasName = cleanPersonnelText(alias?.displayName ?? alias?.display_name);
    if (aliasName) names.push(aliasName);
  }
  return names;
}

export function personnelMatchesHistoricalName(person, historicalName) {
  const needle = normalizePersonnelText(historicalName);
  if (!needle) return false;
  return personnelHistoricalNames(person).some((value) => normalizePersonnelText(value) === needle);
}

export function findPersonnelByHistoricalName(people, historicalName) {
  return (people || []).find((person) => personnelMatchesHistoricalName(person, historicalName)) || null;
}

function aliasDisplayName(alias) {
  return cleanPersonnelText(alias?.displayName ?? alias?.display_name);
}

function nameTokens(value) {
  return normalizePersonnelText(value)
    .split(' ')
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean);
}

function containsNamePhrase(inputTokens, phraseTokens) {
  if (!phraseTokens.length || phraseTokens.length > inputTokens.length) return false;
  for (let start = 0; start <= inputTokens.length - phraseTokens.length; start += 1) {
    const matches = phraseTokens.every((token, offset) => inputTokens[start + offset] === token);
    if (matches) return true;
  }
  return false;
}

function personIdentity(person, aliases) {
  const personalName = cleanPersonnelText(person?.name);
  const displayName = personnelDisplayName(person?.rankTitle ?? person?.rank_title, person?.name);
  const aliasNames = [];
  for (const alias of person?.aliases || []) {
    const name = aliasDisplayName(alias);
    if (name) aliasNames.push(name);
  }
  for (const alias of aliases || []) {
    const aliasPersonId = alias?.personId ?? alias?.person_id;
    if (aliasPersonId !== person?.id) continue;
    const name = aliasDisplayName(alias);
    if (name) aliasNames.push(name);
  }
  return {
    personId: person.id,
    displayName,
    personalName,
    rankTitle: cleanPersonnelText(person?.rankTitle ?? person?.rank_title),
    commandOrganization: cleanPersonnelText(person?.commandOrganization ?? person?.command_organization),
    active: person?.active === false ? false : person?.active === true ? true : null,
    aliasNames,
  };
}

function exactMatchKind(identity, normalizedInput) {
  if (normalizePersonnelText(identity.displayName) === normalizedInput) return 'display';
  if (normalizePersonnelText(identity.personalName) === normalizedInput) return 'personal-name';
  if (identity.aliasNames.some((name) => normalizePersonnelText(name) === normalizedInput)) return 'alias';
  return '';
}

function candidateFrom(identity, match) {
  return {
    personId: identity.personId,
    displayName: identity.displayName,
    personalName: identity.personalName,
    rankTitle: identity.rankTitle,
    commandOrganization: identity.commandOrganization,
    active: identity.active,
    match,
  };
}

function compareCandidates(left, right) {
  return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    || String(left.personId).localeCompare(String(right.personId));
}

export function matchDirectoryPerson(input, people, aliases) {
  const original = input == null ? '' : String(input);
  const normalizedInput = normalizePersonnelText(original);
  const directory = [];
  const seen = new Set();
  for (const person of people || []) {
    if (!person?.id || seen.has(person.id)) continue;
    seen.add(person.id);
    directory.push(personIdentity(person, aliases));
  }

  const result = {
    status: 'new',
    input: original,
    normalizedInput,
    candidates: [],
    selectedPersonId: null,
    canCreateNew: false,
    reason: 'A name is required.',
  };
  if (!normalizedInput) return result;

  const exact = [];
  for (const identity of directory) {
    const kind = exactMatchKind(identity, normalizedInput);
    if (kind) exact.push(candidateFrom(identity, kind));
  }
  exact.sort(compareCandidates);
  if (exact.length === 1) {
    return {
      ...result,
      status: 'exact',
      candidates: exact,
      selectedPersonId: exact[0].personId,
      reason: 'One directory identity matches this name.',
    };
  }
  if (exact.length > 1) {
    return {
      ...result,
      status: 'ambiguous',
      candidates: exact,
      reason: 'More than one person matches this name.',
    };
  }

  const inputTokens = nameTokens(normalizedInput);
  const probable = [];
  for (const identity of directory) {
    const phrase = nameTokens(identity.personalName);
    if (containsNamePhrase(inputTokens, phrase)) {
      probable.push(candidateFrom(identity, 'probable-personal-name'));
    }
  }
  probable.sort(compareCandidates);
  if (probable.length === 1) {
    return {
      ...result,
      status: 'probable',
      candidates: probable,
      reason: 'One person\'s personal name appears in the entered text.',
    };
  }
  if (probable.length > 1) {
    return {
      ...result,
      status: 'ambiguous',
      candidates: probable,
      reason: 'More than one person matches this name.',
    };
  }

  return {
    ...result,
    canCreateNew: true,
    reason: 'No directory identity matches this name.',
  };
}
