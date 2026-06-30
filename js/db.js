import { supabase } from './supabase.js';

export function eventFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    eventType: row.event_type,
    command: row.command,
    participants: row.participants,
    location: row.location,
    reservation: row.reservation,
    catering: row.catering,
    packout: row.packout,
    roster: row.roster,
  };
}

export function eventToRow(event) {
  return {
    date: event.date,
    event_type: event.eventType,
    command: event.command,
    participants: String(event.participants),
    location: event.location,
    reservation: event.reservation,
    catering: event.catering,
    packout: event.packout,
    roster: event.roster,
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
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data;
}

export async function insertEventType(name, sortOrder) {
  const { data, error } = await supabase
    .from('event_types')
    .insert({ name, sort_order: sortOrder })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEventType(id, name) {
  const { data, error } = await supabase
    .from('event_types')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEventType(id) {
  const { error } = await supabase.from('event_types').delete().eq('id', id);
  if (error) throw error;
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
