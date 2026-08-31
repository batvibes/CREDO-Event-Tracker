const TBD_TOKEN = 'TBD';

export const TRENDS_DRIVER_METRIC_EVENTS = 'completedEvents';
export const TRENDS_DRIVER_METRIC_REACH = 'participantReach';

export function isTrendsDriverCompareMode(mode) {
  return mode === 'previous' || mode === 'last-year';
}

export function getTrendsDriverComparePhrase(mode) {
  return mode === 'last-year' ? 'Last Year' : 'Previous Period';
}

export function countTrendsDriverParticipants(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'string' && value.trim().toUpperCase() === TBD_TOKEN) return 0;
  const num = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

export function normalizeTrendsDriverEventType(event) {
  const raw = String(event?.eventType ?? '').trim();
  if (!raw || raw.toUpperCase() === TBD_TOKEN) {
    return { key: 'Unspecified', label: 'Unspecified' };
  }
  return { key: raw, label: raw };
}

function pluralizeEventType(label, count) {
  const name = String(label || '').trim() || 'Unknown';
  if (Math.abs(count) === 1) return name;
  if (/s$/i.test(name)) return name;
  return `${name}s`;
}

function shortenEventType(label) {
  const parts = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return parts.slice(0, 2).join(' ');
  if (parts.length === 2 && /^(retreat|workshop|training)$/i.test(parts[1])) {
    return parts[0];
  }
  return parts.join(' ') || label;
}

export function groupTrendsEventsByType(events, getParticipantCount = countTrendsDriverParticipants) {
  const map = new Map();
  (Array.isArray(events) ? events : []).forEach((event) => {
    const { key, label } = normalizeTrendsDriverEventType(event);
    const existing = map.get(key) || { key, label, count: 0, reach: 0, events: [] };
    existing.count += 1;
    existing.reach += getParticipantCount(event?.participants);
    existing.events.push(event);
    map.set(key, existing);
  });
  return map;
}

function metricValue(group, metricKey) {
  if (metricKey === TRENDS_DRIVER_METRIC_REACH) return group?.reach || 0;
  return group?.count || 0;
}

export function buildTrendsDriverContributions(
  currentEvents,
  compareEvents,
  metricKey,
  getParticipantCount = countTrendsDriverParticipants
) {
  const currentGroups = groupTrendsEventsByType(currentEvents, getParticipantCount);
  const compareGroups = groupTrendsEventsByType(compareEvents, getParticipantCount);
  const keys = new Set([...currentGroups.keys(), ...compareGroups.keys()]);
  const contributions = [];
  let currentTotal = 0;
  let compareTotal = 0;

  keys.forEach((key) => {
    const current = currentGroups.get(key);
    const compare = compareGroups.get(key);
    const label = current?.label || compare?.label || key;
    const currentValue = metricValue(current, metricKey);
    const compareValue = metricValue(compare, metricKey);
    currentTotal += currentValue;
    compareTotal += compareValue;
    contributions.push({
      key,
      label,
      currentValue,
      compareValue,
      delta: currentValue - compareValue,
    });
  });

  return {
    contributions,
    currentTotal,
    compareTotal,
    totalDelta: currentTotal - compareTotal,
  };
}

export function rankTrendsDriverContributions(contributions) {
  return [...(contributions || [])]
    .filter((entry) => Number(entry?.delta) !== 0)
    .sort((left, right) => {
      const absDelta = Math.abs(right.delta) - Math.abs(left.delta);
      if (absDelta !== 0) return absDelta;
      return String(left.label || '').localeCompare(String(right.label || ''), 'en', { sensitivity: 'base' });
    });
}

export function findTrendsDominantEvent(
  currentEvents,
  compareEvents,
  totalDelta,
  getParticipantCount = countTrendsDriverParticipants
) {
  const absDelta = Math.abs(Number(totalDelta) || 0);
  if (absDelta <= 0) return null;

  const side = Number(totalDelta) >= 0 ? currentEvents : compareEvents;
  let best = null;
  (Array.isArray(side) ? side : []).forEach((event) => {
    const reach = getParticipantCount(event?.participants);
    if (reach < absDelta * 0.5 || reach > absDelta) return;
    if (!best || reach > best.reach) {
      const { label } = normalizeTrendsDriverEventType(event);
      best = {
        label,
        reach,
        date: event?.startDate ?? event?.date ?? '',
        command: event?.command || '',
      };
    }
  });
  return best;
}

function formatSigned(value) {
  const number = Math.round(Number(value) || 0);
  if (number > 0) return `+${number}`;
  return String(number);
}

function buildOneTypeSentence(entry, metricKey, comparePhrase, totalDelta) {
  const absDelta = Math.abs(entry.delta);
  if (metricKey === TRENDS_DRIVER_METRIC_REACH) {
    if (totalDelta > 0) {
      return `${pluralizeEventType(entry.label, absDelta)} accounted for ${formatSigned(entry.delta)} participants.`;
    }
    return `${comparePhrase} reached ${absDelta} more participants through ${pluralizeEventType(entry.label, entry.compareValue)}.`;
  }

  if (totalDelta > 0) {
    return `Current Period had ${absDelta} more ${pluralizeEventType(entry.label, absDelta)}.`;
  }
  return `${comparePhrase} had ${entry.compareValue} ${pluralizeEventType(entry.label, entry.compareValue)} versus ${entry.currentValue} this period.`;
}

function buildTwoTypeClause(entry, metricKey, fromCurrent) {
  const delta = fromCurrent ? entry.delta : -entry.delta;
  const absDelta = Math.abs(delta);
  if (metricKey === TRENDS_DRIVER_METRIC_REACH) {
    const direction = delta > 0 ? 'more' : 'fewer';
    return `${absDelta} ${direction} through ${pluralizeEventType(entry.label, absDelta)}`;
  }
  const direction = delta > 0 ? 'more' : 'fewer';
  return `${absDelta} ${direction} ${pluralizeEventType(entry.label, absDelta)}`;
}

function buildTwoTypeSentence(first, second, metricKey, comparePhrase, totalDelta) {
  const fromCurrent = totalDelta > 0;
  const lead = fromCurrent ? 'Current Period' : comparePhrase;
  const verb = metricKey === TRENDS_DRIVER_METRIC_REACH
    ? (fromCurrent ? 'reached' : 'reached')
    : 'had';
  const firstClause = buildTwoTypeClause(first, metricKey, fromCurrent);
  const secondClause = buildTwoTypeClause(second, metricKey, fromCurrent);
  if (metricKey === TRENDS_DRIVER_METRIC_REACH) {
    return `${lead} ${verb} ${firstClause} and ${secondClause}.`;
  }
  return `${lead} ${verb} ${firstClause} and ${secondClause}.`;
}

function buildSpreadSentence(ranked) {
  const parts = ranked.slice(0, 3).map((entry) => (
    `${shortenEventType(entry.label)} ${formatSigned(entry.delta)}`
  ));
  return `Difference was spread across several programs: ${parts.join(', ')}.`;
}

function containsInventedCause(text) {
  return /caused|demand|leadership|popular|interest|priorit/i.test(text);
}

export function buildTrendsDifferenceExplanation({
  metricKey,
  compareMode,
  currentEvents,
  compareEvents,
  getParticipantCount = countTrendsDriverParticipants,
} = {}) {
  if (!isTrendsDriverCompareMode(compareMode)) return null;
  if (metricKey !== TRENDS_DRIVER_METRIC_EVENTS && metricKey !== TRENDS_DRIVER_METRIC_REACH) {
    return null;
  }

  const built = buildTrendsDriverContributions(
    currentEvents,
    compareEvents,
    metricKey,
    getParticipantCount
  );
  const { totalDelta, currentTotal, compareTotal } = built;
  if (!Number.isFinite(totalDelta) || Math.abs(totalDelta) < 1) return null;

  const ranked = rankTrendsDriverContributions(built.contributions);
  if (!ranked.length) return null;

  const comparePhrase = getTrendsDriverComparePhrase(compareMode);
  const absTotal = Math.abs(totalDelta);
  const sumAbs = ranked.reduce((sum, entry) => sum + Math.abs(entry.delta), 0);
  let sentence = '';

  if (metricKey === TRENDS_DRIVER_METRIC_REACH) {
    const dominantEvent = findTrendsDominantEvent(
      currentEvents,
      compareEvents,
      totalDelta,
      getParticipantCount
    );
    if (dominantEvent) {
      sentence = `One ${dominantEvent.label} accounted for ${Math.round(dominantEvent.reach)} of the ${Math.round(absTotal)} participant difference.`;
    }
  }

  if (!sentence) {
    const top = ranked[0];
    const topShare = sumAbs > 0 ? Math.abs(top.delta) / sumAbs : 0;
    const second = ranked[1];
    const twoShare = second && sumAbs > 0
      ? (Math.abs(top.delta) + Math.abs(second.delta)) / sumAbs
      : 0;

    if (ranked.length === 1 || topShare >= 0.7) {
      sentence = buildOneTypeSentence(top, metricKey, comparePhrase, totalDelta);
    } else if (ranked.length === 2 || (second && twoShare >= 0.75)) {
      sentence = buildTwoTypeSentence(top, second, metricKey, comparePhrase, totalDelta);
    } else {
      sentence = buildSpreadSentence(ranked);
    }
  }

  if (!sentence || containsInventedCause(sentence)) return null;

  return {
    sentence,
    comparePhrase,
    currentTotal,
    compareTotal,
    totalDelta,
    contributions: ranked.slice(0, 3),
  };
}
