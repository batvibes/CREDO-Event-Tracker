/**
 * Ordinary safeTALK and ASIST workshop rows for the LivingWorks activity overlay.
 * The filter matches facilitator_product_experience: a resolved person, a resolved
 * ordinary product, and a recorded date on or before today. T4T deliveries stay out.
 * This module does not write qualifications, people, or Events.
 */
import { calendarDate, localCalendarToday } from './t4t-completion-entry.js';

const LIVINGWORKS_WORKSHOP_CODES = new Set(['safetalk', 'asist']);
const DEDICATED_T4T_EVENT_TYPES = new Set(['SafeTalk T4T', 'ASIST T4T']);

function clean(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function ordinaryLivingWorksWorkshops(tokenRows, products, today = localCalendarToday()) {
  const codes = new Map();
  for (const product of products ?? []) {
    const productId = product?.id;
    const code = clean(product?.code);
    if (!productId || !LIVINGWORKS_WORKSHOP_CODES.has(code) || codes.has(productId)) continue;
    codes.set(productId, code);
  }
  const todayIso = calendarDate(today) || localCalendarToday();
  const workshops = [];
  const seen = new Set();
  for (const row of tokenRows ?? []) {
    const personId = row?.person_id ?? row?.personId;
    const productId = row?.product_id ?? row?.productId;
    const productCode = codes.get(productId);
    const eventId = clean(row?.event_id ?? row?.eventId);
    const recordedOn = calendarDate(row?.recorded_on ?? row?.recordedOn);
    const eventType = clean(row?.event_type ?? row?.eventType);
    const t4tDelivery = row?.is_t4t === true || row?.isT4t === true;
    if (!personId || !productCode || !eventId || !recordedOn) continue;
    if (recordedOn > todayIso) continue;
    if (t4tDelivery || DEDICATED_T4T_EVENT_TYPES.has(eventType)) continue;
    const key = `${personId}|${productId}|${eventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    workshops.push({
      eventId,
      personId,
      productId,
      productCode,
      recordedOn,
    });
  }
  return workshops;
}
