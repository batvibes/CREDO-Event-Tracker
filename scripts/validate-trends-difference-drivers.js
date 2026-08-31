/**
 * Verify Trends difference-driver helpers.
 * Run: node scripts/validate-trends-difference-drivers.js
 */
import {
  TRENDS_HISTORICAL_AVERAGE_NOTE,
  TRENDS_HISTORICAL_EQUAL_SENTENCE,
  TRENDS_HISTORICAL_SIMILAR_SENTENCE,
  assembleTrendsHistoricalAnalysisRows,
  buildTrendsDifferenceExplanation,
  buildTrendsDriverContributions,
  collectTrendsDriverEventsForInterval,
  countTrendsDriverParticipants,
  findTrendsDominantEvent,
  formatTrendsContributorSupportLine,
  formatTrendsDominantEventLine,
  getTrendsDriverComparePhrase,
  getTrendsHistoricalAnalysisColumnLabel,
  isTrendsDriverCompareMode,
  pickTrendsHistoricalAnalysisSeries,
  rankTrendsDriverContributions,
  resolveTrendsHistoricalAnalysisMode,
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

assertEqual(resolveTrendsHistoricalAnalysisMode('previous', 'all'), 'drivers', 'previous/all uses driver analysis');
assertEqual(resolveTrendsHistoricalAnalysisMode('last-year', 'single'), 'drivers', 'last-year/single uses driver analysis');
assertEqual(resolveTrendsHistoricalAnalysisMode('none', 'all'), 'omit', 'compare none omits analysis');
assertEqual(resolveTrendsHistoricalAnalysisMode('previous', 'multi'), 'omit', 'multi-program omits analysis');
assertEqual(
  resolveTrendsHistoricalAnalysisMode('previous', 'multi', [
    { kind: 'actual', points: [{ value: 4 }] },
    { kind: 'compare', points: [{ value: 2 }] },
  ]),
  'drivers',
  'a single actual+compare pair is not the multi-program overlay'
);
assertEqual(
  resolveTrendsHistoricalAnalysisMode('previous', 'all', [
    { kind: 'actual', points: [{ value: 4 }] },
    { kind: 'actual', points: [{ value: 3 }] },
  ]),
  'omit',
  'two actual series are the multi-program overlay'
);
assertEqual(resolveTrendsHistoricalAnalysisMode('avg-2', 'all'), 'values-only', 'avg-2 is values-only');
assertEqual(resolveTrendsHistoricalAnalysisMode('avg-3', 'single'), 'values-only', 'avg-3 is values-only');

const allProgramsSeries = [
  {
    kind: 'compare',
    points: [
      { tooltipLabel: 'MAR 2026', value: 92 },
      { tooltipLabel: 'APR 2026', value: 80 },
    ],
  },
  {
    kind: 'actual',
    points: [
      { tooltipLabel: 'APR 2026', value: 184 },
      { tooltipLabel: 'MAY 2026', value: 160 },
    ],
  },
];
const allProgramsAnalysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'previous',
  metricKey: 'participantReach',
  selectionMode: 'all',
  seriesList: allProgramsSeries,
  loadBucketEvents: () => ({
    currentEvents: [mer(74), pgw(17), asist(7)],
    compareEvents: [asist(6)],
  }),
});
assertEqual(allProgramsAnalysis.mode, 'drivers', 'All Programs single-series mode is drivers');
assert(allProgramsAnalysis.rows.length > 0, 'All Programs single-series emits historical rows');
assertEqual(allProgramsAnalysis.rows.length, 2, 'All Programs emits one row per comparable bucket');
assertEqual(allProgramsAnalysis.rows[0].currentValue, 184, 'All Programs current value comes from the actual series');
assertEqual(allProgramsAnalysis.rows[0].comparisonValue, 92, 'All Programs comparison value comes from the compare series');
assertEqual(getTrendsHistoricalAnalysisColumnLabel('previous'), 'Previous Period', 'previous column label');
assertEqual(getTrendsHistoricalAnalysisColumnLabel('last-year'), 'Last Year', 'last-year column label');
assertEqual(getTrendsHistoricalAnalysisColumnLabel('avg-2'), 'Average', 'average column label');

const previousBuckets = {
  current: [
    { tooltipLabel: 'APR 2026', value: 4 },
    { tooltipLabel: 'MAY 2026', value: 3 },
    { tooltipLabel: 'JUN 2026', value: 3 },
  ],
  compare: [
    { tooltipLabel: 'MAR 2026', value: 2 },
    { tooltipLabel: 'APR 2026', value: 3 },
    { tooltipLabel: 'MAY 2026', value: 1 },
  ],
};
const previousEventsByBucket = {
  0: {
    currentEvents: [mer(20), mer(22), asist(10), pgw(8)],
    compareEvents: [asist(10), pgw(8)],
  },
  1: {
    currentEvents: [asist(10), asist(12), pgw(8)],
    compareEvents: [asist(10), asist(12), pgw(8)],
  },
  2: {
    currentEvents: [mer(18), { eventType: 'SafeTalk Workshop', participants: 6 }],
    compareEvents: [pgw(14), { eventType: 'Family Workshop', participants: 9 }],
  },
};
const loadedIndexes = [];
const previousAnalysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'previous',
  metricKey: 'completedEvents',
  selectionMode: 'all',
  actualPoints: previousBuckets.current,
  comparePoints: previousBuckets.compare,
  loadBucketEvents: (index) => {
    loadedIndexes.push(index);
    return previousEventsByBucket[index];
  },
});
assertEqual(previousAnalysis.mode, 'drivers', 'Previous Period analysis mode');
assertEqual(previousAnalysis.rows.length, 3, 'Previous Period emits every comparable bucket');
assertEqual(previousAnalysis.compareColumnLabel, 'Previous Period', 'Previous Period column wording');
assertEqual(previousAnalysis.rows[0].periodLabel, 'APR 2026', 'Previous Period uses current tooltip label');
assertEqual(previousAnalysis.rows[0].comparisonPeriodLabel, 'MAR 2026', 'Previous Period uses shifted comparison tooltip label');
assertEqual(previousAnalysis.rows[0].currentValue, 4, 'Previous Period current total matches series');
assertEqual(previousAnalysis.rows[0].comparisonValue, 2, 'Previous Period comparison total matches series');
assertEqual(previousAnalysis.rows[0].delta, 2, 'Previous Period delta matches series');
assertIncludes(previousAnalysis.rows[0].primarySentence, 'Current Period had 2 more Marriage Enrichment Retreats', 'Completed Events driver sentence');
assertEqual(previousAnalysis.rows[1].delta, 0, 'zero-delta bucket is retained');
assertEqual(previousAnalysis.rows[1].primarySentence, TRENDS_HISTORICAL_EQUAL_SENTENCE, 'zero-delta copy');
assertEqual(previousAnalysis.rows[2].primarySentence, TRENDS_HISTORICAL_SIMILAR_SENTENCE, 'distributed difference fallback copy');
assertEqual(loadedIndexes.join(','), '0,2', 'zero-delta buckets do not need driver event loads after equality check');

const lastYearAnalysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'last-year',
  metricKey: 'completedEvents',
  selectionMode: 'single',
  actualPoints: previousBuckets.current,
  comparePoints: [
    { tooltipLabel: 'APR 2025', value: 2 },
    { tooltipLabel: 'MAY 2025', value: 3 },
    { tooltipLabel: 'JUN 2025', value: 1 },
  ],
  loadBucketEvents: (index) => previousEventsByBucket[index],
});
assertEqual(lastYearAnalysis.mode, 'drivers', 'Last Year analysis mode');
assertEqual(lastYearAnalysis.compareColumnLabel, 'Last Year', 'Last Year column wording');
assertEqual(lastYearAnalysis.rows[0].comparisonPeriodLabel, 'APR 2025', 'Last Year uses comparison tooltip label');
assertIncludes(lastYearAnalysis.rows[0].primarySentence, 'Current Period had 2 more Marriage Enrichment Retreats', 'Last Year reuses the same driver sentence');
assert(!lastYearAnalysis.rows.some((row) => row.primarySentence.includes('Previous Period')), 'Last Year copy does not say Previous Period');

const noneAnalysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'none',
  metricKey: 'completedEvents',
  actualPoints: previousBuckets.current,
  comparePoints: previousBuckets.compare,
  loadBucketEvents: () => {
    throw new Error('compare none should not load events');
  },
});
assertEqual(noneAnalysis.mode, 'omit', 'Compare None omits analysis');
assertEqual(noneAnalysis.rows.length, 0, 'Compare None has no analysis rows');

const multiAnalysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'previous',
  metricKey: 'completedEvents',
  selectionMode: 'multi',
  actualPoints: previousBuckets.current,
  comparePoints: previousBuckets.compare,
  loadBucketEvents: () => {
    throw new Error('multi-program should not load events');
  },
});
assertEqual(multiAnalysis.mode, 'omit', 'multi-program omits analysis');
assertEqual(multiAnalysis.rows.length, 0, 'multi-program has no analysis rows');

const avg2Analysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'avg-2',
  metricKey: 'participantReach',
  actualPoints: [{ tooltipLabel: 'APR 2026', value: 184 }],
  comparePoints: [{ tooltipLabel: '2-Year Average', value: 92 }],
  loadBucketEvents: () => {
    throw new Error('avg-2 should not generate driver sentences');
  },
});
assertEqual(avg2Analysis.mode, 'values-only', 'avg-2 is values-only');
assertEqual(avg2Analysis.rows.length, 1, 'avg-2 still lists historical periods');
assertEqual(avg2Analysis.rows[0].currentValue, 184, 'avg-2 current matches series');
assertEqual(avg2Analysis.rows[0].comparisonValue, 92, 'avg-2 average matches series');
assertEqual(avg2Analysis.rows[0].delta, 92, 'avg-2 delta matches series');
assertEqual(avg2Analysis.rows[0].primarySentence, '', 'avg-2 has no driver sentence');
assertEqual(avg2Analysis.note, TRENDS_HISTORICAL_AVERAGE_NOTE, 'avg-2 shows the averages note');

const avg3Analysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'avg-3',
  metricKey: 'completedEvents',
  actualPoints: [{ tooltipLabel: 'APR 2026', value: 6 }],
  comparePoints: [{ tooltipLabel: '3-Year Average', value: 4 }],
});
assertEqual(avg3Analysis.mode, 'values-only', 'avg-3 is values-only');
assertEqual(avg3Analysis.rows[0].primarySentence, '', 'avg-3 has no driver sentence');
assertEqual(avg3Analysis.note, TRENDS_HISTORICAL_AVERAGE_NOTE, 'avg-3 shows the averages note');

const reachEvents = {
  currentEvents: [mer(74), pgw(17), asist(7)],
  compareEvents: [asist(6)],
};
const reachExplanation = buildTrendsDifferenceExplanation({
  metricKey: 'participantReach',
  compareMode: 'previous',
  currentEvents: reachEvents.currentEvents,
  compareEvents: reachEvents.compareEvents,
});
const reachAnalysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'previous',
  metricKey: 'participantReach',
  actualPoints: [{ tooltipLabel: 'APR 2026', value: 98 }],
  comparePoints: [{ tooltipLabel: 'MAR 2026', value: 6 }],
  loadBucketEvents: () => reachEvents,
});
assertEqual(reachAnalysis.rows[0].currentValue, 98, 'Participant Reach current matches series');
assertEqual(reachAnalysis.rows[0].comparisonValue, 6, 'Participant Reach comparison matches series');
assertEqual(reachAnalysis.rows[0].primarySentence, reachExplanation.sentence, 'PDF sentence matches tooltip helper');
assert(reachAnalysis.rows[0].contributors.length <= 3, 'contributors max 3');
assertEqual(reachAnalysis.rows[0].contributors.length, 3, 'three meaningful Event Types are kept');
assertIncludes(reachAnalysis.rows[0].contributorLine, 'Personal Growth +17', 'supporting contributor line uses remaining types');
assertIncludes(reachAnalysis.rows[0].contributorLine, 'ASIST +1', 'supporting contributor line includes second extra type');
assert(!reachAnalysis.rows[0].contributorLine.includes('Marriage Enrichment Retreats accounted'), 'supporting line does not repeat the primary sentence');
assertIncludes(reachAnalysis.rows[0].dominantEventLine, 'Single-event driver: Marriage Enrichment Retreat — 74 participants.', 'dominant Event line when helper hits');

const noDominantAnalysis = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'previous',
  metricKey: 'participantReach',
  actualPoints: [{ tooltipLabel: 'APR 2026', value: 55 }],
  comparePoints: [{ tooltipLabel: 'MAR 2026', value: 0 }],
  loadBucketEvents: () => ({
    currentEvents: [mer(20), pgw(18), asist(17)],
    compareEvents: [],
  }),
});
assertEqual(findTrendsDominantEvent([mer(20), pgw(18), asist(17)], [], 55), null, 'spread reach has no dominant Event');
assertEqual(noDominantAnalysis.rows[0].dominantEventLine, '', 'dominant Event line stays empty without a helper hit');

const fourTypeSupport = formatTrendsContributorSupportLine([
  { label: 'Marriage Enrichment Retreat', delta: 68 },
  { label: 'Personal Growth Workshop', delta: 17 },
  { label: 'ASIST Workshop', delta: 7 },
  { label: 'SafeTalk Workshop', delta: 4 },
]);
assertIncludes(fourTypeSupport, 'Personal Growth +17', 'support line starts after the primary type');
assertIncludes(fourTypeSupport, 'ASIST +7', 'support line includes the second extra type');
assert(!fourTypeSupport.includes('SafeTalk'), 'support line does not include a 4th Event Type');
assertEqual(
  formatTrendsDominantEventLine(null),
  '',
  'dominant Event formatter stays empty without a hit'
);

const picked = pickTrendsHistoricalAnalysisSeries([
  {
    kind: 'compare',
    points: [{ tooltipLabel: 'MAR 2026', value: 2 }],
  },
  {
    kind: 'actual',
    points: [
      { tooltipLabel: 'APR 2026', value: 4 },
      { tooltipLabel: 'Outlook May', value: 12, index: 6, isAnchor: true },
    ],
  },
  {
    kind: 'projection',
    points: [{ tooltipLabel: 'JUL 2026', value: 9, index: 6 }],
  },
  {
    kind: 'scheduled',
    points: [{ tooltipLabel: 'JUL 2026', value: 5, index: 6 }],
  },
]);
assertEqual(picked.actualPoints[0].value, 4, 'series picker uses the actual series');
assertEqual(picked.comparePoints[0].value, 2, 'series picker uses the compare series');
assertEqual(picked.actualPoints.length, 2, 'series picker does not flatten Outlook/Scheduled into actual');

const outlookExcluded = assembleTrendsHistoricalAnalysisRows({
  compareMode: 'previous',
  metricKey: 'completedEvents',
  actualPoints: [
    { tooltipLabel: 'APR 2026', value: 4 },
    { tooltipLabel: 'Outlook May', value: 12, isAnchor: true },
    { tooltipLabel: 'JUL 2026', value: 9, kind: 'projection' },
  ],
  comparePoints: [
    { tooltipLabel: 'MAR 2026', value: 2 },
    { tooltipLabel: 'APR 2026', value: 3 },
    { tooltipLabel: 'MAY 2026', value: 1 },
  ],
  loadBucketEvents: (index) => previousEventsByBucket[index] || { currentEvents: [], compareEvents: [] },
});
assertEqual(outlookExcluded.rows.length, 1, 'Outlook and Scheduled points are excluded');
assertEqual(outlookExcluded.rows[0].periodLabel, 'APR 2026', 'only historical actual/compare points remain');

const filterRecord = [];
collectTrendsDriverEventsForInterval({ start: '2026-04-01', end: '2026-04-30' }, {
  filters: { command: '1st MARDIV', location: 'Camp Pendleton' },
  programKeys: ['marriage-enrichment'],
  getEventsForRange: (interval, filters) => {
    filterRecord.push({ interval, filters });
    return [mer(20)];
  },
  filterByProgramKeys: (list, keys) => {
    filterRecord.push({ keys, count: list.length });
    return list;
  },
});
assertEqual(filterRecord[0].filters.command, '1st MARDIV', 'same filters are forwarded');
assertEqual(filterRecord[0].filters.location, 'Camp Pendleton', 'location filter is forwarded');
assertEqual(filterRecord[1].keys[0], 'marriage-enrichment', 'same single-program keys are forwarded');

const cloned = JSON.parse(JSON.stringify(reachAnalysis));
assertEqual(cloned.rows[0].primarySentence, reachAnalysis.rows[0].primarySentence, 'analysis snapshot is JSON-serializable');
assert(!('events' in cloned.rows[0]), 'snapshot rows do not store Event objects');
assert(cloned.rows[0].contributors.every((entry) => !('events' in entry)), 'contributors stay plain JSON');

if (errors.length) {
  console.error('validate-trends-difference-drivers failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-trends-difference-drivers: ok');
