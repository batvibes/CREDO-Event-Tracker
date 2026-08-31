/**
 * Verify scheduled-event floor helpers for Trend & Outlook.
 * Run: node scripts/validate-trends-outlook-scheduled.js
 */
import {
  combineForecastWithScheduledFloor,
  filterTrendsScheduledEvents,
  getKnownScheduledParticipantCount,
  getTrendsScheduledFloorForEvents,
  isTrendsScheduledEventEligible,
  resolveOutlookBucketValue,
} from '../js/trends-outlook-scheduled.js';

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    errors.push(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function getEventDate(event) {
  const raw = event?.startDate ?? event?.date;
  if (raw == null || raw === '' || raw === 'TBD') return null;
  const isoDate = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  if (`${year}-${month}-${day}` !== isoDate) return null;
  return isoDate;
}

function getCommandKey(event) {
  const command = String(event?.command ?? '').trim();
  if (!command || command === 'TBD') return '';
  return command;
}

function isHistoricalCandidate(event, todayIso) {
  if (event?.aarFinalized !== true) return false;
  const isoDate = getEventDate(event);
  return Boolean(isoDate && isoDate <= todayIso);
}

const todayIso = '2026-08-30';
const projectionRange = { start: '2026-08-31', end: '2026-11-30' };
const filterOptions = {
  todayIso,
  range: projectionRange,
  getEventDate,
  getCommandKey,
};

function scheduled(event, extra = {}) {
  return isTrendsScheduledEventEligible(event, { ...filterOptions, ...extra });
}

// Completed Events combine rule
assertEqual(combineForecastWithScheduledFloor(5, 3), 5, 'forecast 5 / scheduled 3 → 5');
assertEqual(combineForecastWithScheduledFloor(5, 7), 7, 'forecast 5 / scheduled 7 → 7');
assertEqual(combineForecastWithScheduledFloor(5, 0), 5, 'forecast 5 / scheduled 0 → 5');
assertEqual(combineForecastWithScheduledFloor(0, 4), 4, 'forecast 0 / scheduled 4 → 4');

// Eligibility
assertEqual(scheduled({ startDate: 'TBD', eventType: 'Retreat' }), false, 'TBD future date excluded');
assertEqual(scheduled({ startDate: '', eventType: 'Retreat' }), false, 'blank date excluded');
assertEqual(scheduled({ startDate: '2026-08-30', eventType: 'Retreat' }), false, 'start date = today excluded from scheduled');
assertEqual(scheduled({ startDate: '2026-08-15', eventType: 'Retreat' }), false, 'start date < today excluded from scheduled');
assertEqual(scheduled({ startDate: '2026-10-12', eventType: 'Retreat' }), true, 'future valid date included');
assertEqual(
  scheduled({ startDate: '2026-10-12', eventType: 'Retreat' }, { eventType: 'Workshop' }),
  false,
  'program filter excludes other event types'
);
assertEqual(
  scheduled({ startDate: '2026-10-12', eventType: 'Workshop' }, { eventType: 'Workshop' }),
  true,
  'program filter includes matching event type'
);
assertEqual(
  scheduled({ startDate: '2026-10-12', eventType: 'Retreat', command: 'NMCB-4' }, { command: '1st MARDIV' }),
  false,
  'command filter excludes other commands'
);
assertEqual(
  scheduled({ startDate: '2026-10-12', eventType: 'Retreat', command: 'NMCB-4' }, { command: 'NMCB-4' }),
  true,
  'command filter includes matching command'
);
assertEqual(
  scheduled({
    startDate: '2026-10-05',
    endDate: '2026-10-20',
    dateType: 'range',
    eventType: 'Retreat',
  }),
  true,
  'date-range event is eligible on start date'
);

const rangeEvent = {
  id: 'range-1',
  startDate: '2026-10-05',
  endDate: '2026-11-20',
  dateType: 'range',
  eventType: 'Retreat',
};
const octoberEvents = filterTrendsScheduledEvents([rangeEvent], {
  ...filterOptions,
  range: { start: '2026-10-01', end: '2026-10-31' },
});
const novemberEvents = filterTrendsScheduledEvents([rangeEvent], {
  ...filterOptions,
  range: { start: '2026-11-01', end: '2026-11-30' },
});
assertEqual(octoberEvents.length, 1, 'date-range event counted once on start date (October)');
assertEqual(novemberEvents.length, 0, 'date-range event not counted again on end date (November)');
assertEqual(
  getTrendsScheduledFloorForEvents(octoberEvents, 'completedEvents'),
  1,
  'completed-events floor counts a date-range event once'
);

assert(
  scheduled({ startDate: '2026-10-12', eventType: 'Retreat', aarFinalized: false }),
  'future event without finalized AAR still qualifies'
);
assert(
  scheduled({ startDate: '2026-10-12', eventType: 'Retreat', reservation: 'Not Started', catering: 'Not Started' }),
  'logistics status is not required'
);

// Participant handling
assertEqual(getKnownScheduledParticipantCount(25), 25, 'known positive participants raise floor');
assertEqual(getKnownScheduledParticipantCount('40'), 40, 'numeric string participants raise floor');
assertEqual(getKnownScheduledParticipantCount('TBD'), 0, 'TBD does not raise floor');
assertEqual(getKnownScheduledParticipantCount(''), 0, 'blank does not raise floor');
assertEqual(getKnownScheduledParticipantCount(null), 0, 'null does not raise floor');
assertEqual(getKnownScheduledParticipantCount(0), 0, 'zero does not raise floor');
assertEqual(getKnownScheduledParticipantCount('0'), 0, 'string zero does not raise floor');
assertEqual(getKnownScheduledParticipantCount('abc'), 0, 'invalid does not raise floor');
assertEqual(getKnownScheduledParticipantCount(-8), 0, 'negative does not raise floor');

assertEqual(
  getTrendsScheduledFloorForEvents(
    [
      { participants: 20 },
      { participants: 'TBD' },
      { participants: '' },
      { participants: 0 },
      { participants: 'bad' },
    ],
    'participantReach'
  ),
  20,
  'participant floor sums only entered positive counts'
);
assertEqual(
  resolveOutlookBucketValue({ trendOk: true, historicalForecast: 50, scheduledFloor: 20 }),
  50,
  'participant forecast above known scheduled stay at forecast'
);
assertEqual(
  resolveOutlookBucketValue({ trendOk: true, historicalForecast: 50, scheduledFloor: 80 }),
  80,
  'known scheduled participants raise the floor'
);

// Mutual exclusion
const todayFinalized = { id: 'same-day', startDate: todayIso, aarFinalized: true, eventType: 'Retreat' };
const tomorrowOpen = { id: 'future', startDate: '2026-08-31', aarFinalized: false, eventType: 'Retreat' };
const yesterdayOpen = { id: 'past-open', startDate: '2026-08-29', aarFinalized: false, eventType: 'Retreat' };
assert(isHistoricalCandidate(todayFinalized, todayIso), 'today finalized event is a historical candidate');
assertEqual(scheduled(todayFinalized), false, 'today finalized event is not scheduled');
assertEqual(isHistoricalCandidate(tomorrowOpen, todayIso), false, 'future event is not historical');
assert(scheduled(tomorrowOpen), 'future event is scheduled');
assertEqual(isHistoricalCandidate(yesterdayOpen, todayIso), false, 'past non-finalized event is not historical');
assertEqual(scheduled(yesterdayOpen), false, 'past non-finalized event is not scheduled');

const mixed = [todayFinalized, tomorrowOpen, yesterdayOpen];
const historicalIds = new Set(mixed.filter((event) => isHistoricalCandidate(event, todayIso)).map((event) => event.id));
const scheduledIds = new Set(filterTrendsScheduledEvents(mixed, filterOptions).map((event) => event.id));
for (const id of historicalIds) {
  assert(!scheduledIds.has(id), `event ${id} cannot appear in both historical and scheduled sets`);
}

// Insufficient history
assertEqual(
  resolveOutlookBucketValue({ trendOk: false, historicalForecast: 5, scheduledFloor: 7 }),
  7,
  'insufficient history + scheduled activity → scheduled-only outlook'
);
assertEqual(
  resolveOutlookBucketValue({ trendOk: false, historicalForecast: 5, scheduledFloor: 0 }),
  0,
  'insufficient history + no scheduled activity → no outlook values'
);

const futureBuckets = [
  { key: '2026-09', events: [{ participants: 12 }, { participants: 'TBD' }] },
  { key: '2026-10', events: [] },
  { key: '2026-11', events: [{ participants: 8 }] },
];
const scheduledSeries = futureBuckets
  .map((bucket, index) => ({
    index,
    value: getTrendsScheduledFloorForEvents(bucket.events, 'completedEvents'),
  }))
  .filter((point) => point.value > 0);
assertEqual(scheduledSeries.length, 2, 'scheduled series omits zero buckets');
assert(
  futureBuckets.every((bucket) => getTrendsScheduledFloorForEvents(bucket.events, 'completedEvents') >= 0),
  'scheduled series exists only on future buckets'
);

const allZeroScheduled = [
  { events: [] },
  { events: [{ participants: 'TBD' }] },
].every((bucket) => getTrendsScheduledFloorForEvents(bucket.events, 'participantReach') === 0);
assert(allZeroScheduled, 'scheduled series hidden when all scheduled future values are 0');

const legendHintWithScheduled = 'Solid = Actual · Dotted = Scheduled · Dashed = Outlook';
assert(
  legendHintWithScheduled.includes('Dotted = Scheduled') && legendHintWithScheduled.includes('Dashed = Outlook'),
  'legend distinguishes scheduled from outlook'
);

if (errors.length) {
  console.error('validate-trends-outlook-scheduled failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('validate-trends-outlook-scheduled: ok');
