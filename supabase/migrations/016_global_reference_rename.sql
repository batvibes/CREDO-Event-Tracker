-- 016: Atomic global canonical rename for event reference lists.
-- Renaming a roster entry updates that exact canonical value everywhere it is
-- stored on public.events (including AAR-copied venue/caterer fields).
-- Remove-from-list behavior is unchanged (active = false only).
--
-- Persisted columns that receive the rename (discovered from schema + db.js):
--   commands  -> events.command
--   locations -> events.location
--   venues    -> events.venue, events.aar_venue
--   caterers  -> events.catering_vendor, events.aar_catering_vendor
--   people    -> events.facilitators, events.poc
-- AAR Command/Location/Facilitator(s)/POC display from the event columns above.
-- navy_tracker_events_readonly is a view over events and updates automatically.
-- Reports/Trends/Financials derive from events and are not updated separately.
--
-- Not updated: credo_staff, catering (workflow status), costs, AAR narrative
-- fields, aar_audit_log, monthly_reports notes, templates, team_members.

create or replace function public.replace_reference_person_token(
  token text,
  old_normalized text,
  new_name text
)
returns text
language plpgsql
immutable
as $$
declare
  part text;
  matched text[];
  token_name text;
  token_email text;
begin
  part := public.clean_reference_display_name(token);
  if part = '' then
    return null;
  end if;

  matched := regexp_match(part, '^(.+?)\s*<([^<>]+)>\s*$');
  if matched is not null then
    token_name := public.clean_reference_display_name(matched[1]);
    token_email := btrim(matched[2]);
    if token_name = '' then
      return part;
    end if;
    if public.normalize_reference_name(token_name) = old_normalized then
      if token_email <> '' then
        return new_name || ' <' || token_email || '>';
      end if;
      return new_name;
    end if;
    return part;
  end if;

  if public.normalize_reference_name(part) = old_normalized then
    return new_name;
  end if;

  return part;
end;
$$;

create or replace function public.replace_reference_person_list(
  stored text,
  old_normalized text,
  new_name text
)
returns text
language plpgsql
immutable
as $$
declare
  raw text := coalesce(stored, '');
  current_token text := '';
  in_angles boolean := false;
  i int;
  ch text;
  replaced text;
  tokens text[] := '{}';
begin
  if raw = '' or old_normalized is null or old_normalized = '' then
    return stored;
  end if;

  for i in 1..char_length(raw) loop
    ch := substr(raw, i, 1);
    if ch = '<' then
      in_angles := true;
    elsif ch = '>' then
      in_angles := false;
    end if;

    if ch = ',' and not in_angles then
      replaced := public.replace_reference_person_token(current_token, old_normalized, new_name);
      if replaced is not null then
        tokens := array_append(tokens, replaced);
      end if;
      current_token := '';
    else
      current_token := current_token || ch;
    end if;
  end loop;

  replaced := public.replace_reference_person_token(current_token, old_normalized, new_name);
  if replaced is not null then
    tokens := array_append(tokens, replaced);
  end if;

  if coalesce(array_length(tokens, 1), 0) = 0 then
    return stored;
  end if;

  return array_to_string(tokens, ', ');
end;
$$;

create or replace function public.rename_reference_entry(
  p_kind text,
  p_id uuid,
  p_new_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  roster_table text;
  new_name text;
  new_normalized text;
  old_name text;
  old_normalized text;
  conflict_name text;
  result_id uuid;
  result_name text;
  result_normalized text;
  result_active boolean;
  result_email text;
  result_phone text;
  result_created_at timestamptz;
  result_updated_at timestamptz;
  has_aar_venue boolean;
  has_aar_catering_vendor boolean;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to rename reference entries'
      using errcode = '42501';
  end if;

  kind := lower(btrim(coalesce(p_kind, '')));
  if kind not in ('command', 'location', 'venue', 'caterer', 'person') then
    raise exception 'invalid reference kind'
      using errcode = '22023',
            hint = 'REFERENCE_KIND_INVALID';
  end if;

  if p_id is null then
    raise exception 'reference id is required'
      using errcode = '22023',
            hint = 'REFERENCE_ID_REQUIRED';
  end if;

  new_name := public.clean_reference_display_name(p_new_name);
  if new_name = '' then
    raise exception 'reference name is required'
      using errcode = '22023',
            hint = 'REFERENCE_NAME_REQUIRED';
  end if;
  new_normalized := public.normalize_reference_name(new_name);

  roster_table := case kind
    when 'command' then 'commands'
    when 'location' then 'locations'
    when 'venue' then 'venues'
    when 'caterer' then 'caterers'
    else 'people'
  end;

  execute format(
    'select name, normalized_name from public.%I where id = $1 for update',
    roster_table
  )
  into old_name, old_normalized
  using p_id;

  if old_name is null then
    raise exception 'reference entry was not found'
      using errcode = 'P0002',
            hint = 'REFERENCE_NOT_FOUND';
  end if;

  execute format(
    'select name from public.%I where normalized_name = $1 and id <> $2',
    roster_table
  )
  into conflict_name
  using new_normalized, p_id;

  if conflict_name is not null then
    raise exception 'A roster entry named “%” already exists.', conflict_name
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'aar_venue'
  ) into has_aar_venue;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'aar_catering_vendor'
  ) into has_aar_catering_vendor;

  if kind = 'command' then
    update public.events
    set command = new_name
    where public.normalize_reference_name(command) = old_normalized;

  elsif kind = 'location' then
    update public.events
    set location = new_name
    where public.normalize_reference_name(location) = old_normalized;

  elsif kind = 'venue' then
    update public.events
    set venue = new_name
    where public.normalize_reference_name(venue) = old_normalized;

    if has_aar_venue then
      update public.events
      set aar_venue = new_name
      where public.normalize_reference_name(aar_venue) = old_normalized;
    end if;

  elsif kind = 'caterer' then
    update public.events
    set catering_vendor = new_name
    where public.normalize_reference_name(catering_vendor) = old_normalized;

    if has_aar_catering_vendor then
      update public.events
      set aar_catering_vendor = new_name
      where public.normalize_reference_name(aar_catering_vendor) = old_normalized;
    end if;

  elsif kind = 'person' then
    update public.events e
    set facilitators = n.facilitators
    from (
      select
        id,
        public.replace_reference_person_list(facilitators, old_normalized, new_name) as facilitators
      from public.events
    ) n
    where e.id = n.id
      and e.facilitators is distinct from n.facilitators;

    update public.events e
    set poc = n.poc
    from (
      select
        id,
        public.replace_reference_person_list(poc, old_normalized, new_name) as poc
      from public.events
    ) n
    where e.id = n.id
      and e.poc is distinct from n.poc;
  end if;

  if kind = 'person' then
    update public.people
    set name = new_name
    where id = p_id
    returning id, name, normalized_name, active, email, phone, created_at, updated_at
    into result_id, result_name, result_normalized, result_active, result_email, result_phone, result_created_at, result_updated_at;
  else
    execute format(
      'update public.%I
       set name = $1
       where id = $2
       returning id, name, normalized_name, active, created_at, updated_at',
      roster_table
    )
    into result_id, result_name, result_normalized, result_active, result_created_at, result_updated_at
    using new_name, p_id;
  end if;

  return jsonb_build_object(
    'id', result_id,
    'name', result_name,
    'normalized_name', result_normalized,
    'active', result_active,
    'email', result_email,
    'phone', result_phone,
    'created_at', result_created_at,
    'updated_at', result_updated_at,
    'previous_name', old_name,
    'kind', kind
  );
end;
$$;

comment on function public.rename_reference_entry(text, uuid, text) is
  'Atomically rename a reference roster entry and propagate the canonical value to matching event/AAR text fields.';

revoke all on function public.replace_reference_person_token(text, text, text) from public;
revoke all on function public.replace_reference_person_token(text, text, text) from anon;
revoke all on function public.replace_reference_person_token(text, text, text) from authenticated;
revoke all on function public.replace_reference_person_list(text, text, text) from public;
revoke all on function public.replace_reference_person_list(text, text, text) from anon;
revoke all on function public.replace_reference_person_list(text, text, text) from authenticated;
revoke all on function public.rename_reference_entry(text, uuid, text) from public;
revoke all on function public.rename_reference_entry(text, uuid, text) from anon;

grant execute on function public.rename_reference_entry(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
