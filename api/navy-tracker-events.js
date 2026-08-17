import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const EVENT_COLUMNS = [
  'id',
  'date',
  'date_type',
  'start_date',
  'end_date',
  'event_type',
  'command',
  'participants',
  'location',
  'facilitators',
  'credo_staff',
  'time',
  'poc',
  'reservation',
  'venue',
  'catering',
  'catering_vendor',
  'packout',
  'roster',
].join(', ');

function sendJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(extraHeaders)) {
    res.setHeader(name, value);
  }
  res.end(JSON.stringify(body));
}

function readBearerToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization;
  if (typeof header !== 'string') return null;

  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function credentialsMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided.length === 0 || expected.length === 0) return false;

  const providedHash = createHash('sha256').update(provided, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function isTbdDate(value) {
  return value == null || String(value).trim() === '' || String(value).trim() === 'TBD';
}

function scheduledStart(row) {
  const startDate = row?.start_date;
  if (startDate != null && String(startDate).trim() !== '') return startDate;
  return row?.date;
}

function compareEventsBySchedule(a, b) {
  const aDate = scheduledStart(a);
  const bDate = scheduledStart(b);
  const aTbd = isTbdDate(aDate);
  const bTbd = isTbdDate(bDate);
  if (aTbd && !bTbd) return 1;
  if (!aTbd && bTbd) return -1;
  return String(aDate ?? '').localeCompare(String(bDate ?? ''));
}

function mapEvent(row) {
  return {
    id: row.id,
    date: row.date,
    dateType: row.date_type,
    startDate: row.start_date,
    endDate: row.end_date,
    eventType: row.event_type,
    command: row.command,
    participants: row.participants,
    location: row.location,
    facilitators: row.facilitators,
    credoStaff: row.credo_staff,
    time: row.time,
    poc: row.poc,
    reservation: row.reservation,
    venue: row.venue,
    catering: row.catering,
    cateringVendor: row.catering_vendor,
    packout: row.packout,
    roster: row.roster,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const expectedToken = process.env.NAVY_TRACKER_INTEGRATION_TOKEN;

  if (!supabaseUrl || !supabaseSecretKey || !expectedToken) {
    sendJson(res, 500, { error: 'Server configuration error' });
    return;
  }

  const providedToken = readBearerToken(req);
  if (!providedToken || !credentialsMatch(providedToken, expectedToken)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from('navy_tracker_events_readonly')
    .select(EVENT_COLUMNS);

  if (error) {
    sendJson(res, 500, { error: 'Unable to load events' });
    return;
  }

  const events = (data ?? [])
    .slice()
    .sort(compareEventsBySchedule)
    .map(mapEvent);

  sendJson(res, 200, { events });
}
