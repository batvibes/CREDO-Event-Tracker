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
