/**
 * Verify Trends difference-driver helpers.
 * Run: node scripts/validate-trends-difference-drivers.js
 */
import {
  buildTrendsDifferenceExplanation,
  buildTrendsDriverContributions,
  countTrendsDriverParticipants,
  findTrendsDominantEvent,
  getTrendsDriverComparePhrase,
  isTrendsDriverCompareMode,
  rankTrendsDriverContributions,
} from '../js/trends-difference-drivers.js';

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    errors.push(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function assertIncludes(text, snippet, message) {
  if (!String(text || '').includes(snippet)) {
    errors.push(`${message} (missing ${JSON.stringify(snippet)} in ${JSON.stringify(text)})`);
  }
}

function assertNotMatch(text, pattern, message) {
  if (pattern.test(String(text || ''))) {
    errors.push(`${message} (matched ${pattern} in ${JSON.stringify(text)})`);
  }
}

const mer = (participants, extras = {}) => ({
  eventType: 'Marriage Enrichment Retreat',
  participants,
  startDate: extras.startDate || '2026-04-12',
  command: extras.command || '1st MARDIV',
});
const asist = (participants) => ({
  eventType: 'ASIST Workshop',
  participants,
  startDate: '2026-04-18',
  command: 'NMCB-4',
});
const pgw = (participants) => ({
  eventType: 'Personal Growth Workshop',
  participants,
  startDate: '2026-04-20',
  command: '1st MARDIV',
});

assert(isTrendsDriverCompareMode('previous'), 'previous is a supported driver compare mode');
assert(isTrendsDriverCompareMode('last-year'), 'last-year is a supported driver compare mode');
assert(!isTrendsDriverCompareMode('avg-2'), '2-year average is excluded');
assert(!isTrendsDriverCompareMode('avg-3'), '3-year average is excluded');
assert(!isTrendsDriverCompareMode('none'), 'none is excluded');
assertEqual(getTrendsDriverComparePhrase('previous'), 'Previous Period', 'Previous Period wording');
assertEqual(getTrendsDriverComparePhrase('last-year'), 'Last Year', 'Last Year wording');

assertEqual(countTrendsDriverParticipants('TBD'), 0, 'TBD participants count as 0');
assertEqual(countTrendsDriverParticipants(''), 0, 'blank participants count as 0');
assertEqual(countTrendsDriverParticipants(null), 0, 'null participants count as 0');
assertEqual(countTrendsDriverParticipants(-4), 0, 'negative participants count as 0');
assertEqual(countTrendsDriverParticipants('68'), 68, 'numeric string participants are counted');
assertEqual(countTrendsDriverParticipants(74), 74, 'numeric participants are counted');

const currentEvents = [mer(40), mer(28), asist(12)];
const compareEvents = [asist(12), pgw(21)];
const eventGroups = buildTrendsDriverContributions(
  currentEvents,
  compareEvents,
  'completedEvents'
);
assertEqual(eventGroups.currentTotal, 3, 'Completed Events current total is event count');
assertEqual(eventGroups.compareTotal, 2, 'Completed Events compare total is event count');
assertEqual(eventGroups.totalDelta, 1, 'Completed Events total delta');
const merCount = eventGroups.contributions.find((entry) => entry.key === 'Marriage Enrichment Retreat');
assertEqual(merCount?.currentValue, 2, 'Completed Events groups by Event Type');
assertEqual(merCount?.compareValue, 0, 'Missing Event Type on compare side is 0');
assertEqual(merCount?.delta, 2, 'Completed Events type delta');

const reachGroups = buildTrendsDriverContributions(
  currentEvents,
  compareEvents,
  'participantReach'
);
assertEqual(reachGroups.currentTotal, 80, 'Participant Reach sums current participants');
assertEqual(reachGroups.compareTotal, 33, 'Participant Reach sums compare participants');
const merReach = reachGroups.contributions.find((entry) => entry.key === 'Marriage Enrichment Retreat');
assertEqual(merReach?.delta, 68, 'Participant Reach type delta');

const ranked = rankTrendsDriverContributions(reachGroups.contributions);
assertEqual(ranked[0].key, 'Marriage Enrichment Retreat', 'ranking prefers largest absolute delta');
assert(ranked.every((entry) => entry.delta !== 0), 'zero-delta contributors are ignored');
assertEqual(
  rankTrendsDriverContributions([{ label: 'A', delta: 0 }, { label: 'B', delta: 0 }]).length,
  0,
  'all-zero contributions rank to empty'
);

assertEqual(
  buildTrendsDifferenceExplanation({
    metricKey: 'completedEvents',
    compareMode: 'previous',
    currentEvents: [mer(20), asist(10)],
    compareEvents: [mer(20), asist(10)],
  }),
  null,
  'total zero delta produces no explanation'
);

const currentGreaterEvents = buildTrendsDifferenceExplanation({
  metricKey: 'completedEvents',
  compareMode: 'previous',
  currentEvents: [mer(20), mer(22)],
  compareEvents: [],
});
assertIncludes(currentGreaterEvents.sentence, 'Current Period had 2 more Marriage Enrichment Retreats', 'current > comparison wording');

const compareGreaterEvents = buildTrendsDifferenceExplanation({
  metricKey: 'completedEvents',
  compareMode: 'previous',
  currentEvents: [asist(10)],
  compareEvents: [asist(10), asist(12), asist(8)],
});
assertIncludes(compareGreaterEvents.sentence, 'Previous Period had 3 ASIST Workshops versus 1 this period', 'comparison > current wording');

const lastYearEvents = buildTrendsDifferenceExplanation({
  metricKey: 'completedEvents',
  compareMode: 'last-year',
  currentEvents: [asist(10)],
  compareEvents: [asist(10), asist(12), asist(8)],
});
assertIncludes(lastYearEvents.sentence, 'Last Year had', 'Last Year wording');
assert(!lastYearEvents.sentence.includes('Previous Period'), 'Last Year does not say Previous Period');

const dominantType = buildTrendsDifferenceExplanation({
  metricKey: 'participantReach',
  compareMode: 'previous',
  currentEvents: [mer(20), mer(20), mer(28), asist(5)],
  compareEvents: [asist(5)],
});
assertIncludes(dominantType.sentence, 'Marriage Enrichment Retreats accounted for +68 participants', 'dominant Event Type rule');

const spread = buildTrendsDifferenceExplanation({
  metricKey: 'participantReach',
  compareMode: 'previous',
  currentEvents: [mer(34), pgw(21), asist(17), { eventType: 'SafeTalk Workshop', participants: 4 }],
  compareEvents: [],
});
assertIncludes(spread.sentence, 'Difference was spread across several programs:', 'spread-across rule');
assertIncludes(spread.sentence, 'Marriage Enrichment +34', 'spread includes top contributor');
assertEqual(spread.contributions.length, 3, 'spread reports at most 3 contributors');
assert(!spread.sentence.includes('SafeTalk'), 'spread does not include a 4th Event Type');

const twoTypes = buildTrendsDifferenceExplanation({
  metricKey: 'completedEvents',
  compareMode: 'previous',
  currentEvents: [mer(10), mer(12)],
  compareEvents: [asist(10)],
});
assertIncludes(twoTypes.sentence, 'Current Period had 2 more Marriage Enrichment Retreats', 'two-type current wording');
assertIncludes(twoTypes.sentence, '1 fewer ASIST Workshop', 'two-type mentions second contributor');

const dominantEvent = findTrendsDominantEvent(
  [mer(74), asist(17)],
  [asist(17)],
  74
);
assertEqual(dominantEvent?.label, 'Marriage Enrichment Retreat', 'dominant individual Event identified');
assertEqual(dominantEvent?.reach, 74, 'dominant individual Event uses participant count');

const explanationWithEvent = buildTrendsDifferenceExplanation({
  metricKey: 'participantReach',
  compareMode: 'previous',
  currentEvents: [mer(74), asist(17)],
  compareEvents: [asist(17)],
});
assertIncludes(
  explanationWithEvent.sentence,
  'One Marriage Enrichment Retreat accounted for 74 of the 74 participant difference',
  'dominant individual Event >= 50%'
);

const nonDominantEvent = findTrendsDominantEvent(
  [mer(20), pgw(18), asist(17)],
  [],
  55
);
assertEqual(nonDominantEvent, null, 'non-dominant individual Event is ignored');

const largeEventSmallGap = findTrendsDominantEvent(
  [mer(100)],
  [mer(90)],
  10
);
assertEqual(largeEventSmallGap, null, 'event larger than the gap is not treated as the difference');

const filteredType = buildTrendsDifferenceExplanation({
  metricKey: 'completedEvents',
  compareMode: 'previous',
  currentEvents: [mer(20)],
  compareEvents: [mer(20), mer(22), mer(18)],
});
assertIncludes(filteredType.sentence, 'Marriage Enrichment Retreat', 'single Event Type filter remains compatible');

assertEqual(
  buildTrendsDifferenceExplanation({
    metricKey: 'completedEvents',
    compareMode: 'avg-2',
    currentEvents: [mer(20)],
    compareEvents: [],
  }),
  null,
  'average comparison produces no explanation'
);

assertEqual(
  countTrendsDriverParticipants('TBD') + countTrendsDriverParticipants(''),
  0,
  'TBD/invalid participant handling matches Trends metric zeroing'
);

[
  currentGreaterEvents,
  compareGreaterEvents,
  lastYearEvents,
  dominantType,
  spread,
  twoTypes,
  explanationWithEvent,
  filteredType,
].forEach((result, index) => {
  assert(result?.sentence, `explanation ${index} produced a sentence`);
  assertNotMatch(
    result?.sentence,
    /caused|demand|leadership|popular|interest|priorit/i,
    `explanation ${index} has no invented causal language`
  );
});

if (errors.length) {
  console.error('validate-trends-difference-drivers failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-trends-difference-drivers: ok');
