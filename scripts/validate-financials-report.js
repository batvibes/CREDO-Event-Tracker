/**
 * Verify Financials report payload helpers.
 * Run: node scripts/validate-financials-report.js
 */
import {
  buildFinancialsPdfFilename,
  buildFinancialsReportPayload,
  compareFinancialsRankedTotals,
  formatFinancialsCurrency,
  formatFinancialsShare,
  getFinancialsReportEmptyCopy,
  getFinancialsVendorEmptyCopy,
  serializeFinancialsVendorRows,
} from '../js/financials-pdf-export.js';

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

assertEqual(formatFinancialsShare(50, 200), '25.0%', 'share uses one decimal place');
assertEqual(formatFinancialsShare(0, 0), '0.0%', 'zero total share is 0.0%');
assertEqual(formatFinancialsCurrency(1234.5), '$1,234.50', 'currency matches Financials USD formatting');

assertEqual(
  compareFinancialsRankedTotals({ name: 'B', total: 10 }, { name: 'A', total: 20 }),
  10,
  'ranking prefers larger amount'
);
assert(
  compareFinancialsRankedTotals({ name: 'Alpha Hall', total: 40 }, { name: 'Beta Hall', total: 40 }) < 0,
  'equal amounts sort by name'
);

const mixedVendors = [
  { key: 'beta', name: 'Beta Hall', total: 40, eventCount: 2 },
  { key: 'zero', name: 'Zero Venue', total: 0, eventCount: 1, event: { id: 'should-not-serialize' } },
  { key: 'alpha', name: 'Alpha Hall', total: 40, eventCount: 1 },
  { key: 'unspecified-venue', name: 'Unspecified Venue', total: 12, eventCount: 1, unspecified: true },
];
const ranked = [...mixedVendors].filter((vendor) => vendor.total > 0).sort(compareFinancialsRankedTotals);
assertEqual(ranked[0].name, 'Alpha Hall', 'tie-break keeps Alpha before Beta');
assertEqual(ranked[1].name, 'Beta Hall', 'second tied venue follows name order');
assert(ranked.some((vendor) => vendor.unspecified), 'unspecified vendor bucket is kept when it has spend');
assert(!ranked.some((vendor) => vendor.total === 0), 'zero-cost vendors are excluded before ranking');

const serialized = serializeFinancialsVendorRows(mixedVendors, 92);
assertEqual(serialized.length, 3, 'zero-cost vendor is excluded from serialized rows');
assert(!serialized.some((row) => row.name === 'Zero Venue'), 'zero-cost vendor name is omitted');
assert(serialized.some((row) => row.key === 'unspecified-venue' && row.unspecified), 'unspecified bucket is serialized');
assert(serialized.every((row) => !('event' in row)), 'serialized vendor rows do not keep Event objects');

const categories = [
  { key: 'venue', label: 'Venue', total: 100 },
  { key: 'catering', label: 'Catering', total: 50 },
  { key: 'lodging', label: 'Lodging', total: 25 },
  { key: 'transportation', label: 'Transportation', total: 15 },
  { key: 'materials', label: 'Materials', total: 10 },
  { key: 'other', label: 'Other', total: 0 },
];
const firstPayload = buildFinancialsReportPayload({
  periodLabel: 'Current Fiscal Year',
  dateRangeLabel: 'Oct 1, 2025 – Aug 30, 2026',
  programLabel: 'All Programs',
  matchingFinalizedAars: 8,
  range: { start: '2025-10-01', end: '2026-08-30' },
  summary: {
    totalRecordedEventCost: 200,
    eventsWithRecordedCosts: 5,
    averageRecordedCost: 40,
    largestCategory: { key: 'venue', label: 'Venue', total: 100 },
  },
  categories,
  venues: ranked,
  caterers: [
    { key: 'asist-catering', name: 'Harbor Catering', total: 50, eventCount: 2 },
  ],
  venueTotal: 152,
  catererTotal: 50,
});

assertEqual(firstPayload.periodLabel, 'Current Fiscal Year', 'period label is forwarded');
assertEqual(firstPayload.dateRangeLabel, 'Oct 1, 2025 – Aug 30, 2026', 'date range is forwarded');
assertEqual(firstPayload.programLabel, 'All Programs', 'program label is forwarded');
assertEqual(firstPayload.matchingFinalizedAars, 8, 'matching finalized AAR count is forwarded');
assertEqual(firstPayload.kpis[0].value, '$200.00', 'total spending comes from the existing summary');
assertEqual(firstPayload.kpis[1].value, '5', 'events-with-cost count comes from the existing summary');
assertEqual(firstPayload.kpis[2].value, '$40.00', 'average/event comes from the existing summary');
assertEqual(firstPayload.kpis[3].value, 'Venue', 'largest category comes from the existing summary');
assertEqual(firstPayload.categories.length, 6, 'exactly six cost categories are exported');
assertEqual(firstPayload.categories[5].label, 'Other', 'zero category remains visible');
assertEqual(firstPayload.categories[5].amount, 0, 'zero category keeps a 0 amount');
assertEqual(firstPayload.categories[5].share, '0.0%', 'zero category keeps a 0.0% share');
assertEqual(
  firstPayload.categories.reduce((sum, category) => sum + category.amount, 0),
  200,
  'category amounts sum to total spending'
);
assertEqual(firstPayload.venues.total, 152, 'venue total is forwarded from Financials');
assertEqual(firstPayload.venues.identifiedCount, 2, 'identified venues exclude the unspecified bucket');
assertEqual(firstPayload.venues.rows[0].name, 'Alpha Hall', 'venue ranking is preserved');
assertEqual(firstPayload.caterers.rows[0].name, 'Harbor Catering', 'caterer ranking is preserved');
assertEqual(firstPayload.emptyState, '', 'populated selection has no empty-state sentence');

const secondPayload = buildFinancialsReportPayload({
  periodLabel: 'Custom Date Range',
  dateRangeLabel: 'Jan 1, 2024 – Jan 31, 2024',
  programLabel: 'ASIST Workshop',
  matchingFinalizedAars: 0,
  range: { start: '2024-01-01', end: '2024-01-31' },
  summary: {
    totalRecordedEventCost: 0,
    eventsWithRecordedCosts: 0,
    averageRecordedCost: null,
    largestCategory: null,
  },
  categories: categories.map((category) => ({ ...category, total: 0 })),
  venues: [],
  caterers: [],
  venueTotal: 0,
  catererTotal: 0,
});

assertEqual(secondPayload.periodLabel, 'Custom Date Range', 'click-time payload uses the current period');
assertEqual(secondPayload.programLabel, 'ASIST Workshop', 'click-time payload uses the current program');
assertEqual(secondPayload.dateRangeLabel, 'Jan 1, 2024 – Jan 31, 2024', 'click-time payload uses the current date range');
assert(firstPayload.programLabel !== secondPayload.programLabel, 'payload is not a stale cached report');
assertEqual(secondPayload.kpis[0].value, '$0.00', 'empty result keeps zero spending');
assertEqual(secondPayload.kpis[2].value, '—', 'empty result has no average');
assertEqual(secondPayload.kpis[3].value, '—', 'empty result has no largest category');
assertEqual(secondPayload.emptyState, 'No finalized After Action Reports match the selected period and program.', 'empty AAR copy');
assertEqual(secondPayload.venues.emptyMessage, 'No finalized After Action Reports match the selected period and program.', 'venue empty copy follows no-AAR meaning');

const zeroSpend = buildFinancialsReportPayload({
  periodLabel: 'Current Fiscal Year',
  dateRangeLabel: 'Oct 1, 2025 – Aug 30, 2026',
  programLabel: 'All Programs',
  matchingFinalizedAars: 3,
  range: { start: '2025-10-01', end: '2026-08-30' },
  summary: {
    totalRecordedEventCost: 0,
    eventsWithRecordedCosts: 0,
    averageRecordedCost: null,
    largestCategory: null,
  },
  categories: categories.map((category) => ({ ...category, total: 0 })),
  venues: [{ key: 'zero', name: 'Zero Venue', total: 0, eventCount: 1 }],
  caterers: [],
  venueTotal: 0,
  catererTotal: 0,
});
assertEqual(zeroSpend.emptyState, 'No recorded event costs are available for this reporting selection.', 'zero-spending copy');
assertEqual(zeroSpend.venues.rows.length, 0, 'zero-cost venue is excluded from the report table');
assertEqual(zeroSpend.venues.emptyMessage, 'No recorded venue spending is available for this reporting selection.', 'zero venue copy');
assertEqual(zeroSpend.caterers.emptyMessage, 'No recorded catering spending is available for this reporting selection.', 'zero caterer copy');
assertEqual(zeroSpend.categories.length, 6, 'zero-spending still lists all six categories');

const invalidRange = getFinancialsReportEmptyCopy({
  range: null,
  matchingFinalizedAars: 0,
  eventsWithRecordedCosts: 0,
});
assertEqual(
  invalidRange,
  'Enter a valid custom start and end date to review recorded expenditures.',
  'invalid custom range keeps the Financials meaning'
);
assertEqual(
  getFinancialsVendorEmptyCopy('venues', { range: null, matchingFinalizedAars: 0, rowCount: 0 }),
  'Enter a valid custom start and end date to review recorded expenditures.',
  'invalid custom range does not invent venue data'
);

const filename = buildFinancialsPdfFilename(new Date('2026-08-30T12:00:00'));
assertEqual(filename, 'CREDO_Financials_Report_2026-08-30.pdf', 'filename follows CREDO_Financials_Report_YYYY-MM-DD.pdf');
assert(!/[<>:"/\\|?*]/.test(filename), 'filename has no unsafe characters');

const cloned = JSON.parse(JSON.stringify(firstPayload));
assertEqual(cloned.kpis[0].value, firstPayload.kpis[0].value, 'payload is JSON-serializable');
assert(!JSON.stringify(firstPayload).includes('"startDate"'), 'payload does not embed full Event objects');
assert(firstPayload.venues.rows.every((row) => typeof row.name === 'string' && typeof row.total === 'number'), 'venue rows stay plain');
assert(firstPayload.categories.every((row) => !('resolve' in row) && !('event' in row)), 'category rows stay plain');

if (errors.length) {
  console.error('validate-financials-report failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-financials-report: ok');
