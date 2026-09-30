import { supabase } from './supabase.js';
import { mapTeamDirectoryPerson } from './team-personnel-directory.js';
import {
  buildEventCurriculumChoices,
  isMissingEventCurriculumSchemaError,
  normalizeCurriculumProductId,
  reconcileCurriculumProductId,
} from './event-curriculum.js';

function booleanFromDb(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 't' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'f' || normalized === '0' || normalized === '') {
      return false;
    }
  }
  return Boolean(value);
}

export function readEventCurriculumColumn(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { present: false, curriculumProductId: null };
  }
  if (!Object.prototype.hasOwnProperty.call(row, 'curriculum_product_id')) {
    return { present: false, curriculumProductId: null };
  }
  return {
    present: true,
    curriculumProductId: normalizeCurriculumProductId(row.curriculum_product_id),
  };
}

export function assignEventCurriculumProductId(event, row) {
  const curriculum = readEventCurriculumColumn(row);
  if (curriculum.present) {
    event.curriculumProductId = curriculum.curriculumProductId;
  }
  return event;
}

export function normalizeLoadedEventCurriculum(event) {
  if (!event || !Object.prototype.hasOwnProperty.call(event, 'curriculumProductId')) return null;
  return normalizeCurriculumProductId(event.curriculumProductId);
}

export function mergeEventCurriculumProductId(existingId, savedEvent) {
  if (savedEvent && Object.prototype.hasOwnProperty.call(savedEvent, 'curriculumProductId')) {
    return normalizeCurriculumProductId(savedEvent.curriculumProductId);
  }
  return normalizeCurriculumProductId(existingId);
}

export function eventCurriculumControlValue(available, choices, eventTypeName, productId) {
  if (!available) return '';
  return reconcileCurriculumProductId(choices, eventTypeName, productId) || '';
}

export function eventTypeAllowsWorkshopT4t(eventTypeName) {
  return eventTypeName === 'Marriage Enrichment Workshop'
    || eventTypeName === 'Personal Growth Workshop';
}

export function eventT4tValueForSave(eventTypeName, checked) {
  if (!eventTypeAllowsWorkshopT4t(eventTypeName)) return false;
  return checked === true;
}

export function readEventT4tColumn(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { present: false, isT4t: false };
  }
  if (!Object.prototype.hasOwnProperty.call(row, 'is_t4t')) {
    return { present: false, isT4t: false };
  }
  return { present: true, isT4t: booleanFromDb(row.is_t4t) };
}

export function assignEventT4t(event, row) {
  const t4t = readEventT4tColumn(row);
  if (t4t.present) {
    event.isT4t = t4t.isT4t;
  }
  return event;
}

export function normalizeLoadedEventT4t(event) {
  if (!event || !Object.prototype.hasOwnProperty.call(event, 'isT4t')) return false;
  return event.isT4t === true;
}

export function mergeEventT4t(existingIsT4t, savedEvent) {
  if (savedEvent && Object.prototype.hasOwnProperty.call(savedEvent, 'isT4t')) {
    return savedEvent.isT4t === true;
  }
  return existingIsT4t === true;
}

export function eventFromRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('INVALID_EVENT_ROW');
  }

  const event = {
    id: row.id,
    date: row.date,
    dateType: row.date_type === 'range' ? 'range' : 'single',
    startDate: row.start_date || row.date || '',
    endDate: row.end_date || row.start_date || row.date || '',
    eventType: row.event_type,
    command: row.command,
    participants: row.participants,
    location: row.location,
    venue: row.venue || '',
    venueCost: row.venue_cost || '',
    cateringVendor: row.catering_vendor || '',
    cateringCost: row.catering_cost || '',
    lodgingCost: row.lodging_cost || '',
    transportationCost: row.transportation_cost || '',
    materialsCost: row.materials_cost || '',
    otherCost: row.other_cost || '',
    otherCostDescription: row.other_cost_description || '',
    reservation: row.reservation,
    catering: row.catering,
    packout: row.packout,
    roster: row.roster,
    facilitators: row.facilitators || '',
    credoStaff: row.credo_staff || '',
    time: row.time || '',
    poc: row.poc || '',
    aarCost: row.aar_cost || '',
    aarVenue: row.aar_venue || '',
    aarVenueCost: row.aar_venue_cost || '',
    aarCateringVendor: row.aar_catering_vendor || '',
    aarCateringCost: row.aar_catering_cost || '',
    aarAttire: row.aar_attire || '',
    aarTravelTime: row.aar_travel_time || '',
    aarWaitlist: row.aar_waitlist || '',
    aarLessonsLearned: row.aar_lessons_learned || '',
    aarFinalized: booleanFromDb(row.aar_finalized),
    aarFinalizedAt: row.aar_finalized_at ?? null,
    aarSequenceNumber: row.aar_sequence_number == null ? '' : String(row.aar_sequence_number),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
  assignEventCurriculumProductId(event, row);
  return assignEventT4t(event, row);
}

function aarAuditEntryFromRow(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    action: row.action,
    details: row.details ?? '',
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  };
}

export async function insertAarAuditEntry(eventId, action, details = null) {
  if (!eventId || !action) {
    throw new Error('INVALID_AAR_AUDIT_ENTRY');
  }

  const userId = await getUserId();
  const payload = {
    event_id: eventId,
    action,
    created_by: userId,
  };

  if (details != null && String(details).trim() !== '') {
    payload.details = String(details).trim();
  }

  const { data, error } = await supabase
    .from('aar_audit_log')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return aarAuditEntryFromRow(data);
}

export async function fetchAarAuditLog(eventId) {
  if (!eventId) {
    throw new Error('INVALID_EVENT_ID');
  }

  const { data, error } = await supabase
    .from('aar_audit_log')
    .select('id, event_id, action, details, created_at, created_by')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(aarAuditEntryFromRow);
}

function resolveEventDates(event) {
  const dateType = event.dateType === 'range' ? 'range' : 'single';
  const startDate = event.startDate ?? event.date ?? 'TBD';
  const endDate = dateType === 'range'
    ? (event.endDate ?? startDate)
    : startDate;

  return {
    dateType,
    startDate,
    endDate,
    date: startDate,
  };
}

let eventCurriculumSchemaAvailable = false;
let eventT4tSchemaAvailable = false;

export function eventToRow(event, options = {}) {
  const dates = resolveEventDates(event);

  const row = {
    date: dates.date,
    date_type: dates.dateType,
    start_date: dates.startDate,
    end_date: dates.endDate,
    event_type: event.eventType,
    command: event.command,
    participants: String(event.participants),
    location: event.location,
    venue: event.venue ?? '',
    venue_cost: event.venueCost ?? '',
    catering_vendor: event.cateringVendor ?? '',
    catering_cost: event.cateringCost ?? '',
    lodging_cost: event.lodgingCost ?? '',
    transportation_cost: event.transportationCost ?? '',
    materials_cost: event.materialsCost ?? '',
    other_cost: event.otherCost ?? '',
    other_cost_description: event.otherCostDescription ?? '',
    reservation: event.reservation,
    catering: event.catering,
    packout: event.packout,
    roster: event.roster,
    facilitators: event.facilitators ?? '',
    credo_staff: event.credoStaff ?? '',
    time: event.time ?? '',
    poc: event.poc ?? '',
  };

  if (options.includeCurriculum) {
    row.curriculum_product_id = normalizeCurriculumProductId(event.curriculumProductId);
  }

  if (options.includeT4t) {
    row.is_t4t = event.isT4t === true;
  }

  return row;
}

function eventWriteRow(event) {
  return eventToRow(event, {
    includeCurriculum: eventCurriculumSchemaAvailable,
    includeT4t: eventT4tSchemaAvailable,
  });
}

export function teamFromRow(row) {
  return {
    director: row.director || '',
    deputyDirector: row.deputy_director || '',
    gsPosition: row.gs_position || '',
    lpo: row.lpo || '',
    credoStaff: row.credo_staff || '',
  };
}

export function teamToRow(team) {
  return {
    director: team.director,
    deputy_director: team.deputyDirector,
    gs_position: team.gsPosition,
    lpo: team.lpo,
    credo_staff: team.credoStaff,
  };
}

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function fetchProfile() {
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(eventFromRow);
}

export async function insertEvent(event) {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('events')
    .insert({
      ...eventWriteRow(event),
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return eventFromRow(data);
}

export async function updateEvent(event) {
  const userId = await getUserId();
  let previous = null;
  if (event.aarFinalized === true) {
    const { data: previousRow, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .eq('id', event.id)
      .single();
    if (fetchError) throw fetchError;
    previous = previousRow;
  }

  const { data, error } = await supabase
    .from('events')
    .update({
      ...eventWriteRow(event),
      updated_by: userId,
    })
    .eq('id', event.id)
    .select()
    .single();

  if (error) throw error;

  if (!previous || !booleanFromDb(data.aar_finalized)) {
    return { event: eventFromRow(data), resequenced: [] };
  }

  const resequenced = await resequenceAffectedAarGroups(previous, data, userId);
  const savedRow = resequenced.find((entry) => entry.id === event.id) || eventFromRow(data);
  return { event: savedRow, resequenced };
}

export async function updateEventAarFields(id, fields) {
  const userId = await getUserId();

  const row = {};
  if (fields.aarCost !== undefined) row.aar_cost = fields.aarCost;
  if (fields.aarVenue !== undefined) row.aar_venue = fields.aarVenue;
  if (fields.aarVenueCost !== undefined) row.aar_venue_cost = fields.aarVenueCost;
  if (fields.aarCateringVendor !== undefined) row.aar_catering_vendor = fields.aarCateringVendor;
  if (fields.aarCateringCost !== undefined) row.aar_catering_cost = fields.aarCateringCost;
  if (fields.aarAttire !== undefined) row.aar_attire = fields.aarAttire;
  if (fields.aarTravelTime !== undefined) row.aar_travel_time = fields.aarTravelTime;
  if (fields.aarWaitlist !== undefined) row.aar_waitlist = fields.aarWaitlist;
  if (fields.aarLessonsLearned !== undefined) row.aar_lessons_learned = fields.aarLessonsLearned;

  const { data, error } = await supabase
    .from('events')
    .update({
      ...row,
      updated_by: userId,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return eventFromRow(data);
}

export async function clearEventAar(id) {
  if (!id) {
    throw new Error('INVALID_EVENT_ID');
  }

  const userId = await getUserId();
  const { data: previous, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from('events')
    .update({
      aar_cost: '',
      aar_venue: '',
      aar_venue_cost: '',
      aar_catering_vendor: '',
      aar_catering_cost: '',
      aar_attire: '',
      aar_travel_time: '',
      aar_waitlist: '',
      aar_lessons_learned: '',
      aar_finalized: false,
      aar_finalized_at: null,
      aar_sequence_number: null,
      updated_by: userId,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  const saved = eventFromRow(data);
  const resequenced = await resequenceAffectedAarGroups(previous, data, userId);
  return { event: saved, resequenced };
}

function formatAarSequenceNumber(seriesCode, sequenceIndex, calendarYear) {
  const tt = seriesCode.padStart(2, '0').slice(-2);
  const ss = String(sequenceIndex).padStart(2, '0');
  const yy = String(calendarYear).slice(-2);
  return `${tt}${ss}${yy}`;
}

function getAarSequenceNamespace(seriesCode, calendarYear) {
  return {
    tt: seriesCode.padStart(2, '0').slice(-2),
    yy: String(calendarYear).slice(-2),
  };
}

function isAarSequenceInNamespace(sequenceNumber, seriesCode, calendarYear) {
  if (!sequenceNumber) return false;
  const { tt, yy } = getAarSequenceNamespace(seriesCode, calendarYear);
  return new RegExp(`^${tt}\\d+${yy}$`).test(String(sequenceNumber));
}

function summarizeAarSequenceRow(row) {
  return {
    id: row?.id ?? null,
    eventType: row?.event_type ?? null,
    startDate: row?.start_date ?? null,
    date: row?.date ?? null,
    effectiveDate: row?.effectiveDate ?? getAarEffectiveDateFromRow(row),
    finalized: booleanFromDb(row?.aar_finalized),
    sequenceNumber: row?.aar_sequence_number ?? null,
    createdAt: row?.created_at ?? null,
  };
}

function getAarEffectiveDateFromRow(row) {
  const startDate = row?.start_date || row?.date;
  if (!startDate || startDate === 'TBD') return null;
  return String(startDate);
}

function getAarCalendarYearFromEffectiveDate(effectiveDate) {
  if (!effectiveDate) return null;
  const year = parseInt(String(effectiveDate).slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1000) return null;
  return year;
}

function compareFinalizedAarSequenceRows(a, b) {
  if (a.effectiveDate !== b.effectiveDate) {
    return a.effectiveDate < b.effectiveDate ? -1 : 1;
  }
  const createdA = a.created_at || '';
  const createdB = b.created_at || '';
  if (createdA !== createdB) {
    return createdA < createdB ? -1 : 1;
  }
  return String(a.id).localeCompare(String(b.id));
}

async function fetchEventTypeSeriesMap() {
  const { data, error } = await supabase
    .from('event_types')
    .select('name, series_code');

  if (error) throw error;

  const map = new Map();
  (data ?? []).forEach((entry) => {
    if (!entry?.name) return;
    map.set(entry.name, (entry.series_code ?? '').trim());
  });
  return map;
}

function resolveAarSequenceGroup(row, seriesMap) {
  if (!row || !booleanFromDb(row.aar_finalized)) return null;
  const seriesCode = (seriesMap.get(row.event_type) || '').trim();
  const effectiveDate = getAarEffectiveDateFromRow(row);
  const calendarYear = getAarCalendarYearFromEffectiveDate(effectiveDate);
  if (!seriesCode || !calendarYear) return null;
  return { seriesCode, calendarYear };
}

function sameAarSequenceGroup(a, b) {
  return Boolean(
    a
    && b
    && a.seriesCode === b.seriesCode
    && a.calendarYear === b.calendarYear
  );
}

async function fetchFinalizedAarsForSeriesYear(seriesCode, calendarYear, seriesMap) {
  const typeNames = [...seriesMap.entries()]
    .filter(([, code]) => code === seriesCode)
    .map(([name]) => name);

  if (!typeNames.length) return [];

  const { data, error } = await supabase
    .from('events')
    .select('id, start_date, date, event_type, aar_finalized, aar_sequence_number, created_at')
    .eq('aar_finalized', true)
    .in('event_type', typeNames);

  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      ...row,
      effectiveDate: getAarEffectiveDateFromRow(row),
    }))
    .filter((row) => getAarCalendarYearFromEffectiveDate(row.effectiveDate) === calendarYear);
}

async function fetchRowsHoldingSeriesYearSequences(seriesCode, calendarYear) {
  const { tt, yy } = getAarSequenceNamespace(seriesCode, calendarYear);
  const { data, error } = await supabase
    .from('events')
    .select('id, event_type, start_date, date, aar_finalized, aar_sequence_number, created_at')
    .like('aar_sequence_number', `${tt}%${yy}`);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => isAarSequenceInNamespace(row.aar_sequence_number, seriesCode, calendarYear))
    .map((row) => ({
      ...row,
      effectiveDate: getAarEffectiveDateFromRow(row),
    }));
}

async function lookupAarSequenceOwner(sequenceNumber) {
  if (!sequenceNumber) return null;
  const { data, error } = await supabase
    .from('events')
    .select('id, event_type, start_date, date, aar_finalized, aar_sequence_number, created_at')
    .eq('aar_sequence_number', sequenceNumber)
    .maybeSingle();

  if (error) {
    console.error('[resequence] failed to look up sequence owner', {
      sequenceNumber,
      message: error.message,
      code: error.code,
    });
    return null;
  }
  return data ? summarizeAarSequenceRow(data) : null;
}

async function nullAarSequenceNumbers(ids, userId) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const { error } = await supabase
    .from('events')
    .update({
      aar_sequence_number: null,
      updated_by: userId,
    })
    .in('id', uniqueIds);

  if (error) throw error;
  return uniqueIds;
}

async function resequenceFinalizedAarsForSeriesYear(seriesCode, calendarYear, options = {}) {
  if (!seriesCode || !Number.isFinite(calendarYear)) return [];

  const visited = options.visited || new Set();
  const visitKey = `${seriesCode}:${calendarYear}`;
  if (visited.has(visitKey)) return [];
  visited.add(visitKey);

  const userId = options.userId ?? await getUserId();
  const seriesMap = options.seriesMap ?? await fetchEventTypeSeriesMap();
  const rows = await fetchFinalizedAarsForSeriesYear(seriesCode, calendarYear, seriesMap);
  const sorted = [...rows].sort(compareFinalizedAarSequenceRows);
  const occupants = await fetchRowsHoldingSeriesYearSequences(seriesCode, calendarYear);
  const groupIds = sorted.map((row) => row.id);
  const occupantIds = occupants.map((row) => row.id);
  const idsToNull = [...new Set([...groupIds, ...occupantIds])];

  console.info('[resequence] series/year group', {
    seriesCode,
    calendarYear,
    typeNames: [...seriesMap.entries()].filter(([, code]) => code === seriesCode).map(([name]) => name),
    group: sorted.map((row, index) => ({
      ...summarizeAarSequenceRow(row),
      intendedSequence: formatAarSequenceNumber(seriesCode, index + 1, calendarYear),
    })),
    namespaceOccupants: occupants.map(summarizeAarSequenceRow),
    idsToNull,
  });

  if (!idsToNull.length) return [];

  await nullAarSequenceNumbers(idsToNull, userId);

  const remainingOccupants = await fetchRowsHoldingSeriesYearSequences(seriesCode, calendarYear);
  if (remainingOccupants.length) {
    console.error('[resequence] namespace still occupied after null pass', {
      seriesCode,
      calendarYear,
      remainingOccupants: remainingOccupants.map(summarizeAarSequenceRow),
    });
    await nullAarSequenceNumbers(remainingOccupants.map((row) => row.id), userId);
    const stillOccupied = await fetchRowsHoldingSeriesYearSequences(seriesCode, calendarYear);
    if (stillOccupied.length) {
      const error = new Error('AAR_SEQUENCE_NAMESPACE_STILL_OCCUPIED');
      error.details = stillOccupied.map(summarizeAarSequenceRow);
      throw error;
    }
  }

  const resequenced = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const sequenceNumber = formatAarSequenceNumber(seriesCode, index + 1, calendarYear);
    const { data, error } = await supabase
      .from('events')
      .update({
        aar_sequence_number: sequenceNumber,
        updated_by: userId,
      })
      .eq('id', sorted[index].id)
      .select()
      .single();

    if (error) {
      const owner = await lookupAarSequenceOwner(sequenceNumber);
      console.error('[resequence] assignment collision', {
        seriesCode,
        calendarYear,
        sequenceNumber,
        target: summarizeAarSequenceRow(sorted[index]),
        owner,
        message: error.message,
        code: error.code,
        details: error.details,
      });
      throw error;
    }
    resequenced.push(eventFromRow(data));
  }

  const groupIdSet = new Set(groupIds);
  const displacedGroups = [];
  occupants.forEach((row) => {
    if (groupIdSet.has(row.id) || !booleanFromDb(row.aar_finalized)) return;
    const group = resolveAarSequenceGroup(row, seriesMap);
    if (!group || (group.seriesCode === seriesCode && group.calendarYear === calendarYear)) return;
    if (displacedGroups.some((entry) => sameAarSequenceGroup(entry, group))) return;
    displacedGroups.push(group);
  });

  for (const group of displacedGroups) {
    const extra = await resequenceFinalizedAarsForSeriesYear(group.seriesCode, group.calendarYear, {
      userId,
      seriesMap,
      visited,
    });
    resequenced.push(...extra);
  }

  return resequenced;
}

async function resequenceAffectedAarGroups(previousRow, currentRow, userId) {
  const seriesMap = await fetchEventTypeSeriesMap();
  const previousGroup = resolveAarSequenceGroup(previousRow, seriesMap);
  const currentGroup = resolveAarSequenceGroup(currentRow, seriesMap);
  const previousDate = getAarEffectiveDateFromRow(previousRow);
  const currentDate = getAarEffectiveDateFromRow(currentRow);
  const previousType = previousRow?.event_type;
  const currentType = currentRow?.event_type;

  if (
    sameAarSequenceGroup(previousGroup, currentGroup)
    && previousDate === currentDate
    && previousType === currentType
  ) {
    return [];
  }

  const groups = [];
  const addGroup = (group) => {
    if (!group) return;
    if (groups.some((entry) => sameAarSequenceGroup(entry, group))) return;
    groups.push(group);
  };

  if (sameAarSequenceGroup(previousGroup, currentGroup)) {
    addGroup(currentGroup);
  } else {
    if (currentRow?.id && previousGroup && !sameAarSequenceGroup(previousGroup, currentGroup)) {
      const { error: clearError } = await supabase
        .from('events')
        .update({
          aar_sequence_number: null,
          updated_by: userId,
        })
        .eq('id', currentRow.id);
      if (clearError) throw clearError;
    }
    addGroup(previousGroup);
    addGroup(currentGroup);
  }

  const resequenced = [];
  for (const group of groups) {
    const rows = await resequenceFinalizedAarsForSeriesYear(
      group.seriesCode,
      group.calendarYear,
      { userId, seriesMap }
    );
    resequenced.push(...rows);
  }
  return resequenced;
}

function logFinalizeEventAarFailure(step, eventId, error, extra = {}) {
  console.error('[finalizeEventAar] failed', {
    step,
    eventId,
    message: error?.message ?? String(error),
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    ...extra,
  });
}

export async function finalizeEventAar(eventId) {
  if (!eventId) {
    throw new Error('INVALID_EVENT_ID');
  }

  const userId = await getUserId();

  const { data: eventRow, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (fetchError) {
    logFinalizeEventAarFailure('fetch-event', eventId, fetchError);
    throw fetchError;
  }
  if (booleanFromDb(eventRow.aar_finalized) || eventRow.aar_sequence_number) {
    throw new Error('ALREADY_FINALIZED');
  }

  const seriesMap = await fetchEventTypeSeriesMap();
  const seriesCode = (seriesMap.get(eventRow.event_type) || '').trim();
  if (!seriesCode) {
    throw new Error('NO_SERIES_CODE');
  }

  const effectiveDate = getAarEffectiveDateFromRow(eventRow);
  const calendarYear = getAarCalendarYearFromEffectiveDate(effectiveDate);
  if (!calendarYear) {
    throw new Error('NO_VALID_START_DATE');
  }

  const { data: updated, error: updateError } = await supabase
    .from('events')
    .update({
      aar_finalized: true,
      aar_finalized_at: new Date().toISOString(),
      aar_sequence_number: null,
      updated_by: userId,
    })
    .eq('id', eventId)
    .eq('aar_finalized', false)
    .select()
    .single();

  if (updateError) {
    logFinalizeEventAarFailure('update-finalize', eventId, updateError, {
      eventType: eventRow.event_type,
      seriesCode,
      calendarYear,
      startDate: effectiveDate,
      userId,
    });
    throw updateError;
  }
  if (!updated || updated.id !== eventId) {
    throw new Error('ALREADY_FINALIZED');
  }

  let resequenced;
  try {
    resequenced = await resequenceFinalizedAarsForSeriesYear(seriesCode, calendarYear, {
      userId,
      seriesMap,
    });
  } catch (resequenceError) {
    logFinalizeEventAarFailure('resequence', eventId, resequenceError, {
      eventType: eventRow.event_type,
      seriesCode,
      calendarYear,
      startDate: effectiveDate,
    });
    const { error: rollbackError } = await supabase
      .from('events')
      .update({
        aar_finalized: false,
        aar_finalized_at: null,
        aar_sequence_number: null,
        updated_by: userId,
      })
      .eq('id', eventId);
    if (rollbackError) {
      logFinalizeEventAarFailure('resequence-rollback', eventId, rollbackError);
    }
    throw resequenceError;
  }

  const saved = resequenced.find((entry) => entry.id === eventId);
  if (!saved?.aarSequenceNumber) {
    throw new Error('MISSING_SEQUENCE_NUMBER');
  }

  return { event: saved, resequenced };
}

export async function deleteEventById(id) {
  const { data: previous, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;

  const userId = await getUserId();
  const resequenced = await resequenceAffectedAarGroups(
    previous,
    {
      ...previous,
      aar_finalized: false,
      aar_sequence_number: null,
    },
    userId
  );
  return { resequenced };
}

export async function renameEventTypeInEvents(previousName, newName) {
  const { error } = await supabase
    .from('events')
    .update({ event_type: newName })
    .eq('event_type', previousName);

  if (error) throw error;
}

export async function loadEventCurriculumSupport() {
  const columnProbe = await supabase
    .from('events')
    .select('curriculum_product_id')
    .limit(1);

  if (columnProbe.error) {
    if (isMissingEventCurriculumSchemaError(columnProbe.error)) {
      eventCurriculumSchemaAvailable = false;
      eventT4tSchemaAvailable = false;
      return { available: false, t4tAvailable: false, choices: [] };
    }
    throw columnProbe.error;
  }

  const allowedProbe = await supabase
    .from('facilitator_event_type_allowed_products')
    .select('event_type_id, product_id');

  if (allowedProbe.error) {
    if (isMissingEventCurriculumSchemaError(allowedProbe.error)) {
      eventCurriculumSchemaAvailable = false;
      eventT4tSchemaAvailable = false;
      return { available: false, t4tAvailable: false, choices: [] };
    }
    throw allowedProbe.error;
  }

  const [productsResult, eventTypesResult] = await Promise.all([
    supabase
      .from('facilitator_products')
      .select('id, name, code, active, sort_order'),
    supabase
      .from('event_types')
      .select('id, name'),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (eventTypesResult.error) throw eventTypesResult.error;

  eventCurriculumSchemaAvailable = true;
  const choices = buildEventCurriculumChoices({
    allowedRows: allowedProbe.data,
    products: productsResult.data,
    eventTypes: eventTypesResult.data,
  });

  const t4tProbe = await supabase
    .from('events')
    .select('is_t4t')
    .limit(1);

  if (t4tProbe.error) {
    if (isMissingEventCurriculumSchemaError(t4tProbe.error)) {
      eventT4tSchemaAvailable = false;
      return { available: true, t4tAvailable: false, choices };
    }
    throw t4tProbe.error;
  }

  eventT4tSchemaAvailable = true;
  return { available: true, t4tAvailable: true, choices };
}

export async function fetchEventTypes() {
  const { data, error } = await supabase
    .from('event_types')
    .select('id, name, sort_order, objectives, description, series_code')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    objectives: row.objectives ?? '',
    description: row.description ?? '',
    seriesCode: row.series_code ?? '',
  }));
}

export async function insertEventType(name, sortOrder) {
  const { data, error } = await supabase
    .from('event_types')
    .insert({
      name,
      sort_order: sortOrder,
      objectives: '',
      description: '',
      series_code: '',
    })
    .select('id, name, sort_order, objectives, description, series_code')
    .single();

  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    sortOrder: data.sort_order,
    objectives: data.objectives ?? '',
    description: data.description ?? '',
    seriesCode: data.series_code ?? '',
  };
}

export async function updateEventType(id, updates) {
  const row = typeof updates === 'string' ? { name: updates } : updates;
  const payload = {};
  if (row.name !== undefined) payload.name = row.name;
  if (row.objectives !== undefined) payload.objectives = row.objectives;
  if (row.description !== undefined) payload.description = row.description;
  if (row.seriesCode !== undefined) payload.series_code = row.seriesCode;

  const { data, error } = await supabase
    .from('event_types')
    .update(payload)
    .eq('id', id)
    .select('id, name, sort_order, objectives, description, series_code')
    .single();

  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    sortOrder: data.sort_order,
    objectives: data.objectives ?? '',
    description: data.description ?? '',
    seriesCode: data.series_code ?? '',
  };
}

export async function deleteEventType(id) {
  const { error } = await supabase.from('event_types').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAarGlobalTemplates() {
  const { data, error } = await supabase
    .from('aar_global_templates')
    .select('id, credo_requirements, command_requirements')
    .eq('id', 1)
    .single();

  if (error) throw error;
  return {
    id: data.id,
    credoRequirements: data.credo_requirements ?? '',
    commandRequirements: data.command_requirements ?? '',
  };
}

export async function updateAarGlobalTemplates(updates) {
  const payload = {};
  if (updates.credoRequirements !== undefined) {
    payload.credo_requirements = updates.credoRequirements;
  }
  if (updates.commandRequirements !== undefined) {
    payload.command_requirements = updates.commandRequirements;
  }

  const { data, error } = await supabase
    .from('aar_global_templates')
    .update(payload)
    .eq('id', 1)
    .select('id, credo_requirements, command_requirements')
    .single();

  if (error) throw error;
  return {
    id: data.id,
    credoRequirements: data.credo_requirements ?? '',
    commandRequirements: data.command_requirements ?? '',
  };
}

export async function fetchTeam() {
  const { data, error } = await supabase.from('team').select('*').eq('id', 1).single();
  if (error) throw error;
  return teamFromRow(data);
}

export async function updateTeam(team) {
  const { data, error } = await supabase
    .from('team')
    .update(teamToRow(team))
    .eq('id', 1)
    .select()
    .single();

  if (error) throw error;
  return teamFromRow(data);
}

function teamMemberFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    billetOrRole: row.billet_or_role,
    statusNextAction: row.status_next_action || '',
    prdEaos: row.prd_eaos || '',
    displayOrder: row.display_order,
  };
}

function teamMemberToRow(member) {
  return {
    name: member.name,
    billet_or_role: member.billetOrRole,
    status_next_action: member.statusNextAction,
    prd_eaos: member.prdEaos,
    display_order: member.displayOrder,
  };
}

function teamMemberUpdatesToRow(updates) {
  const row = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.billetOrRole !== undefined) row.billet_or_role = updates.billetOrRole;
  if (updates.statusNextAction !== undefined) row.status_next_action = updates.statusNextAction;
  if (updates.prdEaos !== undefined) row.prd_eaos = updates.prdEaos;
  if (updates.displayOrder !== undefined) row.display_order = updates.displayOrder;
  return row;
}

export async function fetchTeamMembers() {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(teamMemberFromRow);
}

export async function createTeamMember(member) {
  const { data, error } = await supabase
    .from('team_members')
    .insert(teamMemberToRow(member))
    .select()
    .single();

  if (error) throw error;
  return teamMemberFromRow(data);
}

export async function updateTeamMember(id, updates) {
  const { data, error } = await supabase
    .from('team_members')
    .update(teamMemberUpdatesToRow(updates))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return teamMemberFromRow(data);
}

export async function deleteTeamMember(id) {
  const { error } = await supabase.from('team_members').delete().eq('id', id);
  if (error) throw error;
}

const TEAM_DIRECTORY_PERSON_COLUMNS = [
  'id',
  'name',
  'rank_title',
  'command_organization',
  'installation',
  'active',
  'is_credo_staff',
  'is_facilitator',
  'is_poc',
  'staff_billet_or_role',
  'staff_status_next_action',
  'staff_prd_eaos',
  'staff_display_order',
].join(', ');

// Read-only Facilitator Management sources. Does not write people, qualifications, or Events.
const FACILITATOR_MANAGEMENT_PERSON_COLUMNS = [
  'id',
  'name',
  'rank_title',
  'command_organization',
  'installation',
  'active',
  'is_facilitator',
].join(', ');

export async function fetchFacilitatorManagementSources() {
  const [people, experience, qualifications, products] = await Promise.all([
    supabase
      .from('people')
      .select(FACILITATOR_MANAGEMENT_PERSON_COLUMNS)
      .order('name', { ascending: true }),
    supabase
      .from('facilitator_product_experience')
      .select('person_id, product_id, events_conducted, first_recorded_facilitation_on, most_recent_facilitation_on'),
    supabase
      .from('facilitator_qualifications')
      .select('id, person_id, product_id, standing, t4t_completed_on, first_facilitated_on, trainer_authority, expiration_on, governing_source, notes'),
    supabase
      .from('facilitator_products')
      .select('id, name, code, active, sort_order')
      .order('sort_order', { ascending: true }),
  ]);

  const failure = [people, experience, qualifications, products].find((result) => result.error);
  if (failure) throw failure.error;
  return {
    people: people.data ?? [],
    experience: experience.data ?? [],
    qualifications: qualifications.data ?? [],
    products: products.data ?? [],
  };
}

// Read-only Team directory. Does not replace fetchTeamMembers() or fetchPeople().
export async function fetchTeamDirectoryPersonnel() {
  const { data, error } = await supabase
    .from('people')
    .select(TEAM_DIRECTORY_PERSON_COLUMNS)
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapTeamDirectoryPerson);
}

// Event-entry reference lists (foundation).
// CREDO Staff will later use existing team_members — no separate staff table here.

function cleanReferenceDisplayName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeReferenceName(value) {
  return cleanReferenceDisplayName(value).toLowerCase();
}

function isReferenceUniqueViolation(error) {
  return error?.code === '23505';
}

function namedReferenceFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    active: booleanFromDb(row.active),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function personFromRow(row) {
  return {
    ...namedReferenceFromRow(row),
    rankTitle: row.rank_title ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
  };
}

async function fetchActiveNamedReferences(table) {
  const { data, error } = await supabase
    .from(table)
    .select('id, name, normalized_name, active, created_at, updated_at')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(namedReferenceFromRow);
}

async function findNamedReferenceByNormalizedName(table, normalizedName, mapRow = namedReferenceFromRow) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('normalized_name', normalizedName)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

async function createNamedReference(table, name) {
  const cleaned = cleanReferenceDisplayName(name);
  if (!cleaned) {
    throw new Error('REFERENCE_NAME_REQUIRED');
  }

  const normalizedName = normalizeReferenceName(cleaned);
  const existing = await findNamedReferenceByNormalizedName(table, normalizedName);
  if (existing) return existing;

  const { data, error } = await supabase
    .from(table)
    .insert({
      name: cleaned,
      normalized_name: normalizedName,
    })
    .select('id, name, normalized_name, active, created_at, updated_at')
    .single();

  if (error) {
    if (isReferenceUniqueViolation(error)) {
      const raced = await findNamedReferenceByNormalizedName(table, normalizedName);
      if (raced) return raced;
    }
    throw error;
  }

  return namedReferenceFromRow(data);
}

export async function fetchCommands() {
  return fetchActiveNamedReferences('commands');
}

export async function createCommand(name) {
  return createNamedReference('commands', name);
}

export async function fetchLocations() {
  return fetchActiveNamedReferences('locations');
}

export async function createLocation(name) {
  return createNamedReference('locations', name);
}

export async function fetchVenues() {
  return fetchActiveNamedReferences('venues');
}

export async function createVenue(name) {
  return createNamedReference('venues', name);
}

export async function fetchCaterers() {
  return fetchActiveNamedReferences('caterers');
}

export async function createCaterer(name) {
  return createNamedReference('caterers', name);
}

export async function fetchPeople() {
  const { data, error } = await supabase
    .from('people')
    .select('id, name, normalized_name, rank_title, email, phone, active, created_at, updated_at')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(personFromRow);
}

export async function createPerson(person) {
  const cleaned = cleanReferenceDisplayName(person?.name ?? person);
  if (!cleaned) {
    throw new Error('REFERENCE_NAME_REQUIRED');
  }

  const normalizedName = normalizeReferenceName(cleaned);
  const existing = await findNamedReferenceByNormalizedName('people', normalizedName, personFromRow);
  if (existing) return existing;

  const payload = {
    name: cleaned,
    normalized_name: normalizedName,
  };

  if (person && typeof person === 'object' && !Array.isArray(person)) {
    if (person.email !== undefined) {
      const email = String(person.email ?? '').trim();
      payload.email = email || null;
    }
    if (person.phone !== undefined) {
      const phone = String(person.phone ?? '').trim();
      payload.phone = phone || null;
    }
  }

  const { data, error } = await supabase
    .from('people')
    .insert(payload)
    .select('id, name, normalized_name, email, phone, active, created_at, updated_at')
    .single();

  if (error) {
    if (isReferenceUniqueViolation(error)) {
      const raced = await findNamedReferenceByNormalizedName('people', normalizedName, personFromRow);
      if (raced) return raced;
    }
    throw error;
  }

  return personFromRow(data);
}

function referenceNameConflictError(name) {
  const error = new Error(`A roster entry named “${name}” already exists.`);
  error.code = 'REFERENCE_NAME_EXISTS';
  return error;
}

function mapRenameReferenceError(error, fallbackName = 'that name') {
  const hint = error?.hint || '';
  const message = String(error?.message || '');
  const quoted = message.match(/named\s+[“"]([^”"]+)[”"]/i);
  const conflictName = quoted?.[1] || fallbackName;

  if (
    error?.code === 'P0001'
    || hint === 'REFERENCE_NAME_EXISTS'
    || /already exists/i.test(message)
  ) {
    return referenceNameConflictError(conflictName);
  }

  return error;
}

function mapRemoveReferenceError(error) {
  const hint = error?.hint || '';
  const message = String(error?.message || '');

  if (error?.code === 'P0002' || hint === 'REFERENCE_NOT_FOUND' || /was not found/i.test(message)) {
    const notFound = new Error('That roster entry was not found.');
    notFound.code = 'REFERENCE_NOT_FOUND';
    return notFound;
  }

  if (error?.code === '22023' || hint === 'REFERENCE_TYPE_INVALID' || /invalid reference type/i.test(message)) {
    const invalid = new Error('Invalid roster type.');
    invalid.code = 'REFERENCE_TYPE_INVALID';
    return invalid;
  }

  return error;
}

function namedReferenceFromRenameResult(data, mapRow = namedReferenceFromRow) {
  const row = {
    id: data.id,
    name: data.name,
    normalized_name: data.normalized_name,
    active: data.active,
    email: data.email ?? null,
    phone: data.phone ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  };
  const mapped = mapRow(row);
  mapped.previousName = data.previous_name ?? null;
  mapped.kind = data.kind ?? null;
  return mapped;
}

async function renameReferenceEntry(kind, id, newName, mapRow = namedReferenceFromRow) {
  if (!id) throw new Error('REFERENCE_ID_REQUIRED');

  const { data, error } = await supabase.rpc('rename_reference_entry', {
    p_kind: kind,
    p_id: id,
    p_new_name: newName,
  });

  if (error) throw mapRenameReferenceError(error, newName);
  if (!data) throw new Error('REFERENCE_RENAME_EMPTY');
  return namedReferenceFromRenameResult(data, mapRow);
}

async function removeReferenceEntry(kind, id) {
  if (!id) throw new Error('REFERENCE_ID_REQUIRED');

  const { data, error } = await supabase.rpc('remove_reference_entry', {
    p_reference_type: kind,
    p_reference_id: id,
  });

  if (error) throw mapRemoveReferenceError(error);
  if (!data?.removed) throw new Error('REFERENCE_REMOVE_EMPTY');
  return data;
}

async function updateNamedReference(table, id, updates, mapRow = namedReferenceFromRow) {
  if (!id) throw new Error('REFERENCE_ID_REQUIRED');

  const payload = {};

  if (updates.name !== undefined) {
    const cleaned = cleanReferenceDisplayName(updates.name);
    if (!cleaned) throw new Error('REFERENCE_NAME_REQUIRED');
    const normalizedName = normalizeReferenceName(cleaned);
    const existing = await findNamedReferenceByNormalizedName(table, normalizedName, mapRow);
    if (existing && existing.id !== id) {
      throw referenceNameConflictError(existing.name);
    }
    payload.name = cleaned;
    payload.normalized_name = normalizedName;
  }

  if (updates.active !== undefined) {
    payload.active = Boolean(updates.active);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('REFERENCE_UPDATE_EMPTY');
  }

  const { data, error } = await supabase
    .from(table)
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (isReferenceUniqueViolation(error)) {
      throw referenceNameConflictError(payload.name || 'that name');
    }
    throw error;
  }

  return mapRow(data);
}

export async function updateCommand(id, updates) {
  if (updates?.name !== undefined) {
    return renameReferenceEntry('command', id, updates.name);
  }
  return updateNamedReference('commands', id, updates);
}

export async function updateLocation(id, updates) {
  if (updates?.name !== undefined) {
    return renameReferenceEntry('location', id, updates.name);
  }
  return updateNamedReference('locations', id, updates);
}

export async function updateVenue(id, updates) {
  if (updates?.name !== undefined) {
    return renameReferenceEntry('venue', id, updates.name);
  }
  return updateNamedReference('venues', id, updates);
}

export async function updateCaterer(id, updates) {
  if (updates?.name !== undefined) {
    return renameReferenceEntry('caterer', id, updates.name);
  }
  return updateNamedReference('caterers', id, updates);
}

export async function removeCommand(id) {
  return removeReferenceEntry('command', id);
}

export async function removeLocation(id) {
  return removeReferenceEntry('location', id);
}

export async function removeVenue(id) {
  return removeReferenceEntry('venue', id);
}

export async function removeCaterer(id) {
  return removeReferenceEntry('caterer', id);
}

export async function removePerson(id) {
  return removeReferenceEntry('person', id);
}

export async function updatePerson(id, updates = {}) {
  if (updates.name !== undefined) {
    const error = new Error('Personnel identity is edited from the Team directory.');
    error.code = 'PERSONNEL_USE_TEAM';
    throw error;
  }

  if (!id) throw new Error('REFERENCE_ID_REQUIRED');

  const payload = {};

  if (updates.active !== undefined) {
    payload.active = Boolean(updates.active);
  }

  if (updates.email !== undefined) {
    const email = String(updates.email ?? '').trim();
    payload.email = email || null;
  }

  if (updates.phone !== undefined) {
    const phone = String(updates.phone ?? '').trim();
    payload.phone = phone || null;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('REFERENCE_UPDATE_EMPTY');
  }

  const { data, error } = await supabase
    .from('people')
    .update(payload)
    .eq('id', id)
    .select('id, name, normalized_name, email, phone, active, created_at, updated_at')
    .single();

  if (error) {
    if (isReferenceUniqueViolation(error)) {
      throw referenceNameConflictError(payload.name || 'that name');
    }
    throw error;
  }

  return personFromRow(data);
}

export async function fetchPersonnelAliases() {
  const { data, error } = await supabase
    .from('people_name_aliases')
    .select('person_id, display_name, normalized_name');

  if (error) throw error;
  return (data ?? []).map((row) => ({
    personId: row.person_id,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
  }));
}

function qualificationRpcError(error) {
  const hint = error?.hint || '';
  if (hint === 'PERSONNEL_NOT_FOUND') return new Error('That personnel record was not found.');
  if (hint === 'FACILITATOR_PRODUCT_NOT_FOUND') return new Error('That facilitator product was not found.');
  if (hint === 'QUALIFICATION_STANDING_INVALID') {
    return new Error('Select a standing of Developing, Provisional, Registered, or Inactive.');
  }
  if (error?.code === '42501' || /not authorized/i.test(error?.message || '')) {
    return new Error('You are not authorized to edit facilitator qualifications.');
  }
  return new Error(error?.message || 'The qualification could not be saved.');
}

export async function saveFacilitatorQualification(qualification) {
  const { data, error } = await supabase.rpc('save_facilitator_qualification', {
    p_person_id: qualification?.personId ?? null,
    p_product_id: qualification?.productId ?? null,
    p_standing: qualification?.standing ?? null,
    p_t4t_completed_on: qualification?.t4tCompletedOn ?? null,
    p_first_facilitated_on: qualification?.firstFacilitatedOn ?? null,
    p_trainer_authority: qualification?.trainerAuthority === true,
    p_expiration_on: qualification?.expirationOn ?? null,
    p_governing_source: qualification?.governingSource || null,
    p_notes: qualification?.notes || null,
  });

  if (error) throw qualificationRpcError(error);
  return data;
}

function personnelRpcError(error, fallbackName = 'that name') {
  const hint = error?.hint || '';
  const message = String(error?.message || '');
  if (hint === 'NAME_REQUIRED' || /full name is required/i.test(message)) {
    const nameError = new Error('Full name is required.');
    nameError.code = 'NAME_REQUIRED';
    return nameError;
  }
  if (hint === 'BILLET_REQUIRED' || /billet \/ role is required/i.test(message)) {
    const billetError = new Error('Billet / Role is required for CREDO Staff.');
    billetError.code = 'BILLET_REQUIRED';
    return billetError;
  }
  if (hint === 'PERSONNEL_CONFLICT' || hint === 'STAFF_LINK_CONFLICT') {
    const conflict = new Error(message || 'Those personnel records conflict.');
    conflict.code = hint;
    return conflict;
  }
  if (
    hint === 'REFERENCE_NAME_EXISTS'
    || error?.code === 'P0001' && /already exists/i.test(message)
  ) {
    return referenceNameConflictError(fallbackName);
  }
  if (hint === 'PERSONNEL_NOT_FOUND') {
    const missing = new Error('That personnel record was not found.');
    missing.code = 'PERSONNEL_NOT_FOUND';
    return missing;
  }
  if (hint === 'PERSONNEL_USE_TEAM') {
    const blocked = new Error('Personnel identity is edited from the Team directory.');
    blocked.code = 'PERSONNEL_USE_TEAM';
    return blocked;
  }
  return error;
}

export async function saveDirectoryPerson(person) {
  const { data, error } = await supabase.rpc('save_directory_person', {
    p_id: person?.id ?? null,
    p_rank_title: person?.rankTitle ?? null,
    p_name: person?.name ?? '',
    p_command_organization: person?.commandOrganization ?? null,
    p_installation: person?.installation ?? null,
    p_is_credo_staff: person?.isCredoStaff === true,
    p_is_facilitator: person?.isFacilitator === true,
    p_is_poc: person?.isPoc === true,
    p_staff_billet_or_role: person?.staffBilletOrRole ?? null,
    p_staff_prd_eaos: person?.staffPrdEaos ?? null,
  });

  if (error) throw personnelRpcError(error, person?.name);
  return data;
}

export async function archiveDirectoryPerson(id) {
  const { data, error } = await supabase.rpc('archive_directory_person', {
    p_id: id,
  });

  if (error) throw personnelRpcError(error);
  return data;
}

export async function reconcileDirectoryPeople(survivorId, retiredId, identity) {
  const { data, error } = await supabase.rpc('reconcile_directory_people', {
    p_survivor_id: survivorId,
    p_retired_id: retiredId,
    p_rank_title: identity?.rankTitle ?? null,
    p_name: identity?.name ?? '',
  });

  if (error) throw personnelRpcError(error, identity?.name);
  return data;
}

export async function fetchCommandHighlightsNotes() {
  const { data, error } = await supabase
    .from('command_highlights_notes')
    .select('notes')
    .eq('id', 1)
    .single();

  if (error) throw error;
  return data.notes ?? '';
}

export async function updateCommandHighlightsNotes(notes) {
  const { data, error } = await supabase
    .from('command_highlights_notes')
    .update({ notes })
    .eq('id', 1)
    .select('notes')
    .single();

  if (error) throw error;
  return data.notes ?? '';
}

function monthlyReportFromRow(row) {
  return {
    id: row.id,
    reportMonth: fromDbReportMonth(row.report_month),
    reportYear: row.report_year,
    reachNotes: row.reach_notes ?? '',
    manpowerNotes: row.manpower_notes ?? '',
    readinessNotes: row.readiness_notes ?? '',
    commandHighlightsNotes: row.command_highlights_notes ?? '',
    photos: row.photos && typeof row.photos === 'object' && !Array.isArray(row.photos)
      ? row.photos
      : {},
    status: row.status ?? 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchMonthlyReport(month, year) {
  const reportMonth = toDbReportMonth(month);
  const reportYear = Number(year);

  if (!Number.isFinite(reportMonth) || !Number.isFinite(reportYear)) {
    throw new Error('INVALID_MONTHLY_REPORT_QUERY');
  }

  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('report_month', reportMonth)
    .eq('report_year', reportYear)
    .maybeSingle();

  if (error) throw error;
  return data ? monthlyReportFromRow(data) : null;
}

export async function fetchMonthlyReports() {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*');

  if (error) throw error;
  return (data ?? []).map(monthlyReportFromRow);
}

const MONTHLY_REPORT_SAVE_SELECT = [
  'id',
  'report_month',
  'report_year',
  'reach_notes',
  'manpower_notes',
  'readiness_notes',
  'command_highlights_notes',
  'status',
  'created_at',
  'updated_at',
].join(', ');

// Live Supabase monthly_reports.report_month uses calendar months 1–12.
const DB_REPORT_MONTH_MIN = 1;
const DB_REPORT_MONTH_MAX = 12;
const APP_REPORT_MONTH_MIN = 0;
const APP_REPORT_MONTH_MAX = 11;

function toDbReportMonth(appReportMonth) {
  const month = Number(appReportMonth);
  if (!Number.isFinite(month) || !Number.isInteger(month)) {
    return NaN;
  }

  // MIR UI month select uses 0-based indices (0=Jan..11=Dec).
  if (month >= APP_REPORT_MONTH_MIN && month <= APP_REPORT_MONTH_MAX) {
    return month + 1;
  }

  return NaN;
}

function fromDbReportMonth(dbReportMonth) {
  const month = Number(dbReportMonth);
  if (!Number.isFinite(month) || !Number.isInteger(month)) {
    return NaN;
  }

  if (month >= DB_REPORT_MONTH_MIN && month <= DB_REPORT_MONTH_MAX) {
    return month - 1;
  }

  return NaN;
}

function monthlyReportFromSaveRow(row, photos) {
  return monthlyReportFromRow({
    ...row,
    photos: photos ?? {},
  });
}

export async function saveMonthlyReport(data) {
  const appReportMonth = Number(data.reportMonth);
  const reportMonth = toDbReportMonth(data.reportMonth);
  const reportYear = Number(data.reportYear);

  if (!Number.isFinite(reportMonth) || !Number.isFinite(reportYear)) {
    throw new Error('INVALID_MONTHLY_REPORT');
  }

  const photos = data.photos ?? {};
  const payload = {
    report_month: reportMonth,
    report_year: reportYear,
    reach_notes: data.reachNotes ?? '',
    manpower_notes: data.manpowerNotes ?? '',
    readiness_notes: data.readinessNotes ?? '',
    command_highlights_notes: data.commandHighlightsNotes ?? '',
    photos,
  };

  const photosJsonChars = JSON.stringify(photos).length;
  console.log('[saveMonthlyReport] report_month mapping', {
    appReportMonth,
    dbReportMonth: reportMonth,
    reportYear,
    constraintAllows: `${DB_REPORT_MONTH_MIN}-${DB_REPORT_MONTH_MAX}`,
    withinConstraint:
      reportMonth >= DB_REPORT_MONTH_MIN && reportMonth <= DB_REPORT_MONTH_MAX,
    photosJsonChars,
    photosJsonMb: Number((photosJsonChars / (1024 * 1024)).toFixed(2)),
  });

  const { data: existingRow, error: existingError } = await supabase
    .from('monthly_reports')
    .select('id')
    .eq('report_month', reportMonth)
    .eq('report_year', reportYear)
    .maybeSingle();

  if (existingError) {
    console.error('[saveMonthlyReport] existing lookup failed', {
      message: existingError.message,
      code: existingError.code,
      details: existingError.details,
      hint: existingError.hint,
    });
    throw existingError;
  }

  if (existingRow) {
    const { data: updated, error } = await supabase
      .from('monthly_reports')
      .update(payload)
      .eq('id', existingRow.id)
      .select(MONTHLY_REPORT_SAVE_SELECT)
      .single();

    if (error) {
      console.error('[saveMonthlyReport] update failed', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }

    return monthlyReportFromSaveRow(updated, photos);
  }

  const { data: inserted, error } = await supabase
    .from('monthly_reports')
    .insert(payload)
    .select(MONTHLY_REPORT_SAVE_SELECT)
    .single();

  if (error) {
    console.error('[saveMonthlyReport] insert failed', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return monthlyReportFromSaveRow(inserted, photos);
}

export async function deleteMonthlyReport(month, year) {
  const reportMonth = toDbReportMonth(month);
  const reportYear = Number(year);

  if (!Number.isFinite(reportMonth) || !Number.isFinite(reportYear)) {
    throw new Error('INVALID_MONTHLY_REPORT_QUERY');
  }

  const { error } = await supabase
    .from('monthly_reports')
    .delete()
    .eq('report_month', reportMonth)
    .eq('report_year', reportYear);

  if (error) throw error;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
