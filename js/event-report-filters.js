/**
 * Reporting-only Event Type, curriculum, and T4T filters.
 * These values are never written to an Event, Event Type, or product.
 */
import { aarCurriculumDisplayName } from './aar-curriculum.js';
import { normalizeCurriculumProductId } from './event-curriculum.js';

export const ALL_T4T_EVENTS_REPORT_OPTION = 'all-t4t-events';
export const ALL_T4T_EVENTS_REPORT_LABEL = 'All T4T Events';

const WORKSHOP_EVENT_TYPES = [
  'Marriage Enrichment Workshop',
  'Personal Growth Workshop',
];

export const DEDICATED_T4T_EVENT_TYPES = [
  'SafeTalk T4T',
  'ASIST T4T',
];

export function isWorkshopCurriculumEventType(eventTypeName) {
  return WORKSHOP_EVENT_TYPES.includes(eventTypeName);
}

export function isDedicatedT4tEventType(eventTypeName) {
  return DEDICATED_T4T_EVENT_TYPES.includes(eventTypeName);
}

export function reportWorkshopControlsVisible(reportType, eventTypeName) {
  const visible = reportType === 'event-type' && isWorkshopCurriculumEventType(eventTypeName);
  return { curriculum: visible, t4t: visible };
}

export function nextWorkshopCurriculumFilter(previousEventType, nextEventType, currentCurriculumId) {
  if (previousEventType !== nextEventType) return null;
  return normalizeCurriculumProductId(currentCurriculumId);
}

export function eventMatchesEventTypeReport(event, criteria) {
  const selectedType = criteria?.eventType || '';
  if (!selectedType || !event) return false;

  if (selectedType === ALL_T4T_EVENTS_REPORT_OPTION) {
    if (isDedicatedT4tEventType(event.eventType)) return true;
    return isWorkshopCurriculumEventType(event.eventType) && event.isT4t === true;
  }

  if (event.eventType !== selectedType) return false;
  if (!isWorkshopCurriculumEventType(selectedType)) return true;

  if ((event.isT4t === true) !== (criteria?.t4t === true)) return false;

  const selectedCurriculum = normalizeCurriculumProductId(criteria?.curriculumProductId);
  if (!selectedCurriculum) return true;
  return normalizeCurriculumProductId(event.curriculumProductId) === selectedCurriculum;
}

export function filterEventsForEventTypeReport(events, criteria) {
  return (events || []).filter((event) => eventMatchesEventTypeReport(event, criteria));
}

export function historyCurriculumLabel(event, choices) {
  if (isDedicatedT4tEventType(event?.eventType)) return null;
  return aarCurriculumDisplayName(
    event?.curriculumProductId,
    choices,
    event?.isT4t === true,
  );
}

export function compareHistoryCurriculumLabels(leftLabel, rightLabel) {
  const leftBlank = !leftLabel;
  const rightBlank = !rightLabel;
  if (leftBlank && !rightBlank) return 1;
  if (!leftBlank && rightBlank) return -1;
  return String(leftLabel ?? '').localeCompare(String(rightLabel ?? ''), undefined, { sensitivity: 'base' });
}
