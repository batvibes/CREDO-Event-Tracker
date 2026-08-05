import { supabase } from './supabase.js';

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

export function eventFromRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('INVALID_EVENT_ROW');
  }

  return {
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
    updatedAt: row.updated_at ?? null,
  };
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

export function eventToRow(event) {
  const dates = resolveEventDates(event);

  return {
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
    reservation: event.reservation,
    catering: event.catering,
    packout: event.packout,
    roster: event.roster,
    facilitators: event.facilitators ?? '',
    credo_staff: event.credoStaff ?? '',
    time: event.time ?? '',
    poc: event.poc ?? '',
  };
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
      ...eventToRow(event),
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
  const { data, error } = await supabase
    .from('events')
    .update({
      ...eventToRow(event),
      updated_by: userId,
    })
    .eq('id', event.id)
    .select()
    .single();

  if (error) throw error;
  return eventFromRow(data);
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
  return eventFromRow(data);
}

function formatAarSequenceNumber(seriesCode, sequenceIndex, calendarYear) {
  const tt = seriesCode.padStart(2, '0').slice(-2);
  const ss = String(sequenceIndex).padStart(2, '0');
  const yy = String(calendarYear).slice(-2);
  return `${tt}${ss}${yy}`;
}

async function countFinalizedAarsForSeriesYear(seriesCode, calendarYear) {
  const { data: types, error: typesError } = await supabase
    .from('event_types')
    .select('name, series_code');

  if (typesError) throw typesError;

  const typeNames = (types ?? [])
    .filter((entry) => (entry.series_code ?? '').trim() === seriesCode)
    .map((entry) => entry.name);

  if (typeNames.length === 0) return 0;

  const { data: finalized, error } = await supabase
    .from('events')
    .select('start_date, date')
    .eq('aar_finalized', true)
    .in('event_type', typeNames);

  if (error) throw error;

  return (finalized ?? []).filter((row) => {
    const startDate = row.start_date || row.date;
    if (!startDate || startDate === 'TBD') return false;
    const year = parseInt(String(startDate).slice(0, 4), 10);
    return Number.isFinite(year) && year === calendarYear;
  }).length;
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

  if (fetchError) throw fetchError;
  if (booleanFromDb(eventRow.aar_finalized) || eventRow.aar_sequence_number) {
    throw new Error('ALREADY_FINALIZED');
  }

  const { data: typeRow, error: typeError } = await supabase
    .from('event_types')
    .select('series_code')
    .eq('name', eventRow.event_type)
    .maybeSingle();

  if (typeError) throw typeError;

  const seriesCode = (typeRow?.series_code ?? '').trim();
  if (!seriesCode) {
    throw new Error('NO_SERIES_CODE');
  }

  const startDate = eventRow.start_date || eventRow.date;
  if (!startDate || startDate === 'TBD') {
    throw new Error('NO_VALID_START_DATE');
  }

  const calendarYear = parseInt(String(startDate).slice(0, 4), 10);
  if (!Number.isFinite(calendarYear)) {
    throw new Error('NO_VALID_START_DATE');
  }

  const finalizedCount = await countFinalizedAarsForSeriesYear(seriesCode, calendarYear);
  const sequenceNumber = formatAarSequenceNumber(seriesCode, finalizedCount + 1, calendarYear);

  const { data: updated, error: updateError } = await supabase
    .from('events')
    .update({
      aar_finalized: true,
      aar_finalized_at: new Date().toISOString(),
      aar_sequence_number: sequenceNumber,
      updated_by: userId,
    })
    .eq('id', eventId)
    .eq('aar_finalized', false)
    .select()
    .single();

  if (updateError) throw updateError;
  if (!updated || updated.id !== eventId) {
    throw new Error('ALREADY_FINALIZED');
  }
  if (!updated.aar_sequence_number) {
    throw new Error('MISSING_SEQUENCE_NUMBER');
  }

  return eventFromRow(updated);
}

export async function deleteEventById(id) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function renameEventTypeInEvents(previousName, newName) {
  const { error } = await supabase
    .from('events')
    .update({ event_type: newName })
    .eq('event_type', previousName);

  if (error) throw error;
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
