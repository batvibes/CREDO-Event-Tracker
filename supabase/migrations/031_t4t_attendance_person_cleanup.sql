-- 031: People created by T4T attendance entry can be removed with that attendance
-- when nothing else uses them.
-- Does not rewrite migrations 029 or 030.
-- Does not apply itself; review and run manually.

create table public.t4t_attendance_created_people (
  person_id uuid primary key references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.t4t_attendance_created_people is
  'People inserted by Manage T4T Attendance. A row is the only proof that attendance entry created the person. Existing directory people are never added here.';

alter table public.t4t_attendance_created_people enable row level security;

revoke all on table public.t4t_attendance_created_people from public;
revoke all on table public.t4t_attendance_created_people from anon;
revoke all on table public.t4t_attendance_created_people from authenticated;

-- =============================================================================
-- Create one person for T4T attendance and record that provenance
-- Role flags stay false. This does not update an existing person.
-- =============================================================================

create or replace function public.create_t4t_attendance_person(
  p_rank_title text,
  p_name text,
  p_command_organization text,
  p_installation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person jsonb;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  v_person := public.save_directory_person(
    null,
    p_rank_title,
    p_name,
    p_command_organization,
    p_installation,
    false,
    false,
    false,
    null,
    null
  );

  insert into public.t4t_attendance_created_people (person_id, created_by)
  values ((v_person ->> 'id')::uuid, auth.uid());

  return v_person;
end;
$$;

comment on function public.create_t4t_attendance_person(text, text, text, text) is
  'Inserts one directory person for T4T attendance and records that attendance entry created the person. Does not mark the person as staff, facilitator, or a point of contact.';

revoke all on function public.create_t4t_attendance_person(text, text, text, text) from public;
revoke all on function public.create_t4t_attendance_person(text, text, text, text) from anon;
grant execute on function public.create_t4t_attendance_person(text, text, text, text) to authenticated;

-- =============================================================================
-- Remove this event attendance, then delete the person only when attendance
-- entry created them and no other record still uses them.
-- =============================================================================

create or replace function public.remove_facilitator_t4t_attendance(
  p_person_id uuid,
  p_product_id uuid,
  p_source_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion_id uuid;
  v_person_removed boolean := false;
  v_created_here boolean := false;
  v_blocked boolean := false;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to remove facilitator T4T completions'
      using errcode = '42501';
  end if;

  if p_person_id is null or p_product_id is null or p_source_event_id is null then
    raise exception 'a person, product, and source event are required'
      using errcode = 'P0001',
            hint = 'T4T_COMPLETION_EVENT_REQUIRED';
  end if;

  delete from public.facilitator_t4t_completions completion
  where completion.person_id = p_person_id
    and completion.product_id = p_product_id
    and completion.source_event_id = p_source_event_id
    and completion.source_event_id is not null
  returning completion.id into v_completion_id;

  select exists (
    select 1
    from public.t4t_attendance_created_people created
    where created.person_id = p_person_id
  )
  into v_created_here;

  if v_created_here then
    select
      exists (select 1 from public.facilitator_t4t_completions completion where completion.person_id = p_person_id)
      or exists (select 1 from public.facilitator_qualifications qualification where qualification.person_id = p_person_id)
      or exists (select 1 from public.people_name_aliases alias where alias.person_id = p_person_id)
      or exists (select 1 from public.team_members member where member.person_id = p_person_id)
      or exists (select 1 from public.facilitator_event_tokens token where token.person_id = p_person_id)
      or exists (
        select 1
        from public.people person
        where person.id = p_person_id
          and (
            person.is_credo_staff
            or person.is_poc
            or person.is_facilitator
          )
      )
    into v_blocked;

    if not v_blocked then
      begin
        delete from public.people person
        where person.id = p_person_id;
        v_person_removed := found;
      exception
        when foreign_key_violation then
          v_person_removed := false;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'completion_id', v_completion_id,
    'person_removed', v_person_removed
  );
end;
$$;

comment on function public.remove_facilitator_t4t_attendance(uuid, uuid, uuid) is
  'Deletes one event-sourced T4T attendance row. Deletes the person only when T4T attendance entry created that person and no completion, qualification, alias, staff row, facilitator token, role flag, or other foreign key still uses them.';

revoke all on function public.remove_facilitator_t4t_attendance(uuid, uuid, uuid) from public;
revoke all on function public.remove_facilitator_t4t_attendance(uuid, uuid, uuid) from anon;
grant execute on function public.remove_facilitator_t4t_attendance(uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
