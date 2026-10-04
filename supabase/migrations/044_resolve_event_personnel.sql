-- 044: Resolve an unresolved event personnel row to an existing person.
-- Does not create people or aliases.
-- Does not rewrite source_text, role, position, contact_email, or event text.
-- Does not apply itself; review and run manually.

create or replace function public.resolve_event_personnel(
  p_event_personnel_id uuid,
  p_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.event_personnel%rowtype;
  v_updated public.event_personnel%rowtype;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit events'
      using errcode = '42501';
  end if;

  if p_event_personnel_id is null or p_person_id is null then
    raise exception 'Choose an unresolved event assignment and an existing person.'
      using errcode = '22023',
            hint = 'EVENT_PERSONNEL_REQUIRED';
  end if;

  select *
    into v_row
  from public.event_personnel
  where id = p_event_personnel_id
  for update;

  if not found then
    raise exception 'event assignment was not found'
      using errcode = 'P0002',
            hint = 'EVENT_PERSONNEL_NOT_FOUND';
  end if;

  if v_row.person_id is not null then
    raise exception 'This event assignment is already linked to a person.'
      using errcode = 'P0001',
            hint = 'EVENT_PERSONNEL_ALREADY_LINKED';
  end if;

  if not exists (select 1 from public.people person where person.id = p_person_id) then
    raise exception 'personnel record was not found'
      using errcode = 'P0002',
            hint = 'PERSONNEL_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.event_personnel existing
    where existing.event_id = v_row.event_id
      and existing.role = v_row.role
      and existing.person_id = p_person_id
      and existing.id <> v_row.id
  ) then
    raise exception 'That person is already assigned to this event in the same role.'
      using errcode = 'P0001',
            hint = 'EVENT_PERSONNEL_DUPLICATE';
  end if;

  update public.event_personnel
  set person_id = p_person_id
  where id = v_row.id
    and person_id is null
  returning * into v_updated;

  if v_updated.id is null
     or v_updated.source_text is distinct from v_row.source_text
     or v_updated.role is distinct from v_row.role
     or v_updated.position is distinct from v_row.position
     or v_updated.contact_email is distinct from v_row.contact_email
     or v_updated.event_id is distinct from v_row.event_id then
    raise exception 'The event assignment could not be linked without changing its history.'
      using errcode = 'P0001',
            hint = 'EVENT_PERSONNEL_UNCHANGED_HISTORY';
  end if;

  return jsonb_build_object(
    'id', v_updated.id,
    'event_id', v_updated.event_id,
    'person_id', v_updated.person_id,
    'role', v_updated.role,
    'source_text', v_updated.source_text,
    'contact_email', v_updated.contact_email,
    'position', v_updated.position
  );
exception
  when unique_violation then
    raise exception 'That person is already assigned to this event in the same role.'
      using errcode = 'P0001',
            hint = 'EVENT_PERSONNEL_DUPLICATE';
end;
$$;

comment on function public.resolve_event_personnel(uuid, uuid) is
  'Links one unresolved event personnel row to an existing person. Preserves the historical token, role, position, and contact email. Does not create a person or an alias.';

create or replace function public.resolve_event_personnel_source_text(
  p_source_text text,
  p_person_id uuid,
  p_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_text text := btrim(coalesce(p_source_text, ''));
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
  v_updated integer := 0;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit events'
      using errcode = '42501';
  end if;

  if v_source_text = '' or p_person_id is null then
    raise exception 'Choose the historical text and an existing person.'
      using errcode = '22023',
            hint = 'EVENT_PERSONNEL_REQUIRED';
  end if;

  if v_role is not null and v_role not in ('facilitator', 'poc', 'credo_staff') then
    raise exception 'Choose a facilitator, point of contact, or CREDO Staff role.'
      using errcode = '22023',
            hint = 'EVENT_PERSONNEL_ROLE';
  end if;

  if not exists (select 1 from public.people person where person.id = p_person_id) then
    raise exception 'personnel record was not found'
      using errcode = 'P0002',
            hint = 'PERSONNEL_NOT_FOUND';
  end if;

  perform 1
  from public.event_personnel link
  where link.person_id is null
    and link.source_text = v_source_text
    and (v_role is null or link.role = v_role)
  for update;

  if exists (
    select 1
    from public.event_personnel unresolved
    join public.event_personnel existing
      on existing.event_id = unresolved.event_id
     and existing.role = unresolved.role
     and existing.person_id = p_person_id
    where unresolved.person_id is null
      and unresolved.source_text = v_source_text
      and (v_role is null or unresolved.role = v_role)
  ) then
    raise exception 'That person is already assigned to one of these events in the same role.'
      using errcode = 'P0001',
            hint = 'EVENT_PERSONNEL_DUPLICATE';
  end if;

  update public.event_personnel
  set person_id = p_person_id
  where person_id is null
    and source_text = v_source_text
    and (v_role is null or role = v_role);
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'No unresolved event assignment uses that exact text.'
      using errcode = 'P0002',
            hint = 'EVENT_PERSONNEL_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'source_text', v_source_text,
    'person_id', p_person_id,
    'role', v_role,
    'updated_count', v_updated
  );
exception
  when unique_violation then
    raise exception 'That person is already assigned to one of these events in the same role.'
      using errcode = 'P0001',
            hint = 'EVENT_PERSONNEL_DUPLICATE';
end;
$$;

comment on function public.resolve_event_personnel_source_text(text, uuid, text) is
  'Links every unresolved event personnel row with one exact historical token to an existing person. Preserves each row''s token, role, position, and contact email. Does not create a person or an alias.';

revoke all on function public.resolve_event_personnel(uuid, uuid) from public, anon;
revoke all on function public.resolve_event_personnel_source_text(text, uuid, text) from public, anon;
grant execute on function public.resolve_event_personnel(uuid, uuid) to authenticated;
grant execute on function public.resolve_event_personnel_source_text(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
