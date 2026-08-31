function toNonNegativeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

export function combineForecastWithScheduledFloor(forecast, scheduled) {
  return Math.max(toNonNegativeNumber(forecast), toNonNegativeNumber(scheduled));
}

export function resolveOutlookBucketValue({ trendOk, historicalForecast, scheduledFloor }) {
  const floor = toNonNegativeNumber(scheduledFloor);
  if (trendOk) return combineForecastWithScheduledFloor(historicalForecast, floor);
  return floor;
}

export function getKnownScheduledParticipantCount(value) {
  if (value == null) return 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.toUpperCase() === 'TBD') return 0;
  }
  const num = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
}

export function getTrendsScheduledFloorForEvents(eventList, metricKey) {
  const eventsForBucket = Array.isArray(eventList) ? eventList : [];
  if (metricKey === 'participantReach') {
    return eventsForBucket.reduce(
      (sum, event) => sum + getKnownScheduledParticipantCount(event?.participants),
      0
    );
  }
  return eventsForBucket.length;
}

function resolveCommandKey(event, getCommandKey) {
  if (typeof getCommandKey === 'function') return getCommandKey(event);
  const command = String(event?.command ?? '').trim();
  if (!command || command.toUpperCase() === 'TBD') return '';
  return command;
}

export function isTrendsScheduledEventEligible(event, {
  todayIso,
  range,
  eventType = '',
  command = '',
  getEventDate,
  getCommandKey,
} = {}) {
  if (typeof getEventDate !== 'function' || !todayIso) return false;
  const isoDate = getEventDate(event);
  if (!isoDate || isoDate <= todayIso) return false;
  if (range?.start && isoDate < range.start) return false;
  if (range?.end && isoDate > range.end) return false;
  if (eventType && event?.eventType !== eventType) return false;
  if (command && resolveCommandKey(event, getCommandKey) !== command) return false;
  return true;
}

export function filterTrendsScheduledEvents(eventList, options = {}) {
  if (!options.range || !Array.isArray(eventList)) return [];
  return eventList.filter((event) => isTrendsScheduledEventEligible(event, options));
}
