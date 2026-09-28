-- 019: Unified personnel editing (Stage 2B)
-- Structural only. Does not reconcile duplicate people and does not rewrite
-- events.facilitators, events.poc, or events.credo_staff.
-- MIR Manning continues to read public.team_members.

-- =============================================================================
-- Display identity
-- rank_title is the rank or title only.
-- people.name is the personal name.
-- Historical event text is compared to this display string by exact normalized text.
-- =============================================================================

create or replace function public.personnel_display_name(
  p_rank_title text,
  p_name text
)
returns text
language sql
immutable
as $$
  select case
    when public.clean_reference_display_name(p_name) = '' then public.clean_reference_display_name(p_rank_title)
    when public.clean_reference_display_name(p_rank_title) = '' then public.clean_reference_display_name(p_name)
    when public.normalize_reference_name(p_name) = public.normalize_reference_name(p_rank_title)
      or left(
        public.normalize_reference_name(p_name),
        char_length(public.normalize_reference_name(p_rank_title)) + 1
      ) = public.normalize_reference_name(p_rank_title) || ' '
      then public.clean_reference_display_name(p_name)
    else public.clean_reference_display_name(p_rank_title) || ' ' || public.clean_reference_display_name(p_name)
  end;
$$;

comment on function public.personnel_display_name(text, text) is
  'Canonical personnel display identity. Does not double a rank already present in a legacy name.';

-- =============================================================================
-- Explicit historical names
-- =============================================================================

create table public.people_name_aliases (
  person_id uuid not null references public.people (id) on delete cascade,
  display_name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  primary key (normalized_name)
);

comment on table public.people_name_aliases is
  'Explicit previous display identities for one person. Not inferred and not an approximate match.';

create index people_name_aliases_person_idx
  on public.people_name_aliases (person_id);

alter table public.people_name_aliases enable row level security;

create policy "people_name_aliases_select_authenticated"
on public.people_name_aliases for select
to authenticated
using (true);

-- =============================================================================
-- Link current Manning rows to the Stage 1A staff person
-- Exact normalized name only. Fail closed. Do not guess.
-- =============================================================================

alter table public.team_members
  add column if not exists person_id uuid;

do $link$
declare
  duplicate_name text;
  unresolved_name text;
  ambiguous_name text;
begin
  select public.normalize_reference_name(name)
    into duplicate_name
  from public.team_members
  group by public.normalize_reference_name(name)
  having count(*) > 1
  limit 1;

  if duplicate_name is not null then
    raise exception
      'Stage 2B staff link aborted: multiple team_members rows share normalized name "%"',
      duplicate_name
      using errcode = 'P0001',
            hint = 'STAFF_LINK_AMBIGUOUS';
  end if;

  select tm.name
    into unresolved_name
  from public.team_members tm
  where (
    select count(*)
    from public.people person
    where person.normalized_name = public.normalize_reference_name(tm.name)
      and person.is_credo_staff = true
  ) = 0
  limit 1;

  if unresolved_name is not null then
    raise exception
      'Stage 2B staff link aborted: team member "%" has no exact CREDO Staff person',
      unresolved_name
      using errcode = 'P0001',
            hint = 'STAFF_LINK_UNRESOLVED';
  end if;

  select tm.name
    into ambiguous_name
  from public.team_members tm
  where (
    select count(*)
    from public.people person
    where person.normalized_name = public.normalize_reference_name(tm.name)
      and person.is_credo_staff = true
  ) > 1
  limit 1;

  if ambiguous_name is not null then
    raise exception
      'Stage 2B staff link aborted: team member "%" matches more than one CREDO Staff person',
      ambiguous_name
      using errcode = 'P0001',
            hint = 'STAFF_LINK_AMBIGUOUS';
  end if;

  update public.team_members tm
  set person_id = person.id
  from public.people person
  where person.normalized_name = public.normalize_reference_name(tm.name)
    and person.is_credo_staff = true
    and tm.person_id is null;

  if exists (select 1 from public.team_members where person_id is null) then
    raise exception 'Stage 2B staff link aborted: a team member remained unlinked'
      using errcode = 'P0001',
            hint = 'STAFF_LINK_INCOMPLETE';
  end if;

  if exists (
    select person_id
    from public.team_members
    group by person_id
    having count(*) > 1
  ) then
    raise exception 'Stage 2B staff link aborted: more than one team member linked to the same person'
      using errcode = 'P0001',
            hint = 'STAFF_LINK_DUPLICATE_PERSON';
  end if;
end
$link$;

alter table public.team_members
  alter column person_id set not null;

alter table public.team_members
  add constraint team_members_person_id_key unique (person_id);

alter table public.team_members
  add constraint team_members_person_id_fkey
  foreign key (person_id) references public.people (id) on delete restrict;

comment on column public.team_members.person_id is
  'The public.people row represented by this current Manning record. MIR still reads team_members.';

-- =============================================================================
-- Alias helper
-- =============================================================================

create or replace function public.remember_personnel_display_alias(
  p_person_id uuid,
  p_display_name text,
  p_current_display text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alias_name text := public.clean_reference_display_name(p_display_name);
  v_alias_norm text := public.normalize_reference_name(p_display_name);
  v_current_norm text := public.normalize_reference_name(p_current_display);
  v_owner_id uuid;
begin
  if p_person_id is null or v_alias_name = '' or v_alias_norm = v_current_norm then
    return;
  end if;

  select person_id
    into v_owner_id
  from public.people_name_aliases
  where normalized_name = v_alias_norm
  for update;

  if v_owner_id is not null and v_owner_id <> p_person_id then
    raise exception 'That historical name already belongs to another person.'
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
  end if;

  if exists (
    select 1
    from public.people person
    where person.id <> p_person_id
      and public.normalize_reference_name(public.personnel_display_name(person.rank_title, person.name)) = v_alias_norm
  ) then
    raise exception 'That historical name is another person''s current identity.'
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
  end if;

  insert into public.people_name_aliases (person_id, display_name, normalized_name)
  values (p_person_id, v_alias_name, v_alias_norm)
  on conflict (normalized_name) do nothing;

  select person_id
    into v_owner_id
  from public.people_name_aliases
  where normalized_name = v_alias_norm;

  if v_owner_id is distinct from p_person_id then
    raise exception 'That historical name already belongs to another person.'
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
  end if;
end;
$$;

revoke all on function public.remember_personnel_display_alias(uuid, text, text) from public;
revoke all on function public.remember_personnel_display_alias(uuid, text, text) from anon;
revoke all on function public.remember_personnel_display_alias(uuid, text, text) from authenticated;

-- =============================================================================
-- Save one personnel record and its current Manning row
-- =============================================================================

create or replace function public.save_directory_person(
  p_id uuid,
  p_rank_title text,
  p_name text,
  p_command_organization text,
  p_installation text,
  p_is_credo_staff boolean,
  p_is_facilitator boolean,
  p_is_poc boolean,
  p_staff_billet_or_role text,
  p_staff_prd_eaos text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_title text := nullif(public.clean_reference_display_name(p_rank_title), '');
  v_personal_name text := public.clean_reference_display_name(p_name);
  v_command_name text := nullif(public.clean_reference_display_name(p_command_organization), '');
  v_installation_name text := nullif(public.clean_reference_display_name(p_installation), '');
  v_billet_name text := nullif(public.clean_reference_display_name(p_staff_billet_or_role), '');
  v_prd_name text := nullif(public.clean_reference_display_name(p_staff_prd_eaos), '');
  v_display_name text;
  v_display_norm text;
  v_person_row public.people%rowtype;
  v_previous_display text;
  v_next_order integer;
  v_manning_id uuid;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  if v_personal_name = '' then
    raise exception 'Full name is required.'
      using errcode = 'P0001',
            hint = 'NAME_REQUIRED';
  end if;

  if coalesce(p_is_credo_staff, false) and v_billet_name is null then
    raise exception 'Billet / Role is required for CREDO Staff.'
      using errcode = 'P0001',
            hint = 'BILLET_REQUIRED';
  end if;

  v_display_name := public.personnel_display_name(v_rank_title, v_personal_name);
  v_display_norm := public.normalize_reference_name(v_display_name);

  if exists (
    select 1
    from public.people person
    where (p_id is null or person.id <> p_id)
      and public.normalize_reference_name(public.personnel_display_name(person.rank_title, person.name)) = v_display_norm
  ) or exists (
    select 1
    from public.people_name_aliases alias
    where alias.normalized_name = v_display_norm
      and (p_id is null or alias.person_id <> p_id)
  ) then
    raise exception 'A personnel record named “%” already exists.', v_display_name
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
  end if;

  if p_id is null then
    insert into public.people (
      name,
      rank_title,
      command_organization,
      installation,
      active,
      is_credo_staff,
      is_facilitator,
      is_poc,
      staff_billet_or_role,
      staff_prd_eaos
    )
    values (
      v_personal_name,
      v_rank_title,
      v_command_name,
      v_installation_name,
      true,
      coalesce(p_is_credo_staff, false),
      coalesce(p_is_facilitator, false),
      coalesce(p_is_poc, false),
      v_billet_name,
      v_prd_name
    )
    returning * into v_person_row;
  else
    select *
      into v_person_row
    from public.people
    where id = p_id
    for update;

    if v_person_row.id is null then
      raise exception 'personnel record was not found'
        using errcode = 'P0002',
              hint = 'PERSONNEL_NOT_FOUND';
    end if;

    v_previous_display := public.personnel_display_name(v_person_row.rank_title, v_person_row.name);

    update public.people
    set
      rank_title = v_rank_title,
      name = v_personal_name,
      command_organization = v_command_name,
      installation = v_installation_name,
      is_credo_staff = coalesce(p_is_credo_staff, false),
      is_facilitator = coalesce(p_is_facilitator, false),
      is_poc = coalesce(p_is_poc, false),
      staff_billet_or_role = v_billet_name,
      staff_prd_eaos = v_prd_name
    where id = p_id
    returning * into v_person_row;

    perform public.remember_personnel_display_alias(v_person_row.id, v_previous_display, v_display_name);
  end if;

  if v_person_row.is_credo_staff and v_person_row.active then
    select id
      into v_manning_id
    from public.team_members
    where person_id = v_person_row.id
    for update;

    if v_manning_id is null then
      v_next_order := coalesce(
        v_person_row.staff_display_order,
        (select coalesce(max(tm.display_order), 0) + 1 from public.team_members tm)
      );
      insert into public.team_members (
        name,
        billet_or_role,
        status_next_action,
        prd_eaos,
        display_order,
        person_id
      )
      values (
        v_display_name,
        v_billet_name,
        v_person_row.staff_status_next_action,
        v_prd_name,
        v_next_order,
        v_person_row.id
      );
      update public.people
      set staff_display_order = v_next_order
      where id = v_person_row.id
        and staff_display_order is distinct from v_next_order
      returning * into v_person_row;
    else
      update public.team_members
      set
        name = v_display_name,
        billet_or_role = v_billet_name,
        prd_eaos = v_prd_name,
        updated_at = now()
      where id = v_manning_id;
    end if;
  else
    delete from public.team_members
    where person_id = v_person_row.id;
  end if;

  return jsonb_build_object(
    'id', v_person_row.id,
    'name', v_person_row.name,
    'rank_title', v_person_row.rank_title,
    'command_organization', v_person_row.command_organization,
    'installation', v_person_row.installation,
    'active', v_person_row.active,
    'is_credo_staff', v_person_row.is_credo_staff,
    'is_facilitator', v_person_row.is_facilitator,
    'is_poc', v_person_row.is_poc,
    'staff_billet_or_role', v_person_row.staff_billet_or_role,
    'staff_status_next_action', v_person_row.staff_status_next_action,
    'staff_prd_eaos', v_person_row.staff_prd_eaos,
    'staff_display_order', v_person_row.staff_display_order,
    'display_name', v_display_name
  );
exception
  when unique_violation then
    raise exception 'A personnel record named “%” already exists.', v_personal_name
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
end;
$$;

comment on function public.save_directory_person(uuid, text, text, text, text, boolean, boolean, boolean, text, text) is
  'Creates or updates one person and the linked Manning row. Does not rewrite event text or status_next_action.';

-- =============================================================================
-- Archive
-- =============================================================================

create or replace function public.archive_directory_person(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  person_row public.people%rowtype;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  select *
    into person_row
  from public.people
  where id = p_id
  for update;

  if person_row.id is null then
    raise exception 'personnel record was not found'
      using errcode = 'P0002',
            hint = 'PERSONNEL_NOT_FOUND';
  end if;

  update public.people
  set active = false
  where id = p_id
  returning * into person_row;

  delete from public.team_members
  where person_id = p_id;

  return jsonb_build_object(
    'id', person_row.id,
    'name', person_row.name,
    'active', person_row.active,
    'is_credo_staff', person_row.is_credo_staff
  );
end;
$$;

comment on function public.archive_directory_person(uuid) is
  'Marks one person inactive and removes current Manning. Does not delete the person.';

-- =============================================================================
-- Explicit reconciliation of two records the user has already confirmed
-- =============================================================================

create or replace function public.reconcile_directory_people(
  p_survivor_id uuid,
  p_retired_id uuid,
  p_rank_title text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survivor public.people%rowtype;
  v_retired public.people%rowtype;
  v_first_id uuid;
  v_second_id uuid;
  v_locked_first public.people%rowtype;
  v_locked_second public.people%rowtype;
  v_survivor_id uuid;
  v_retired_id uuid;
  v_survivor_name text;
  v_retired_name text;
  v_survivor_display text;
  v_retired_display text;
  v_rank_title text := nullif(public.clean_reference_display_name(p_rank_title), '');
  v_personal_name text := public.clean_reference_display_name(p_name);
  v_display_name text;
  v_display_norm text;
  v_command_name text;
  v_installation_name text;
  v_email_name text;
  v_phone_name text;
  v_billet_name text;
  v_prd_name text;
  v_status_name text;
  v_display_order integer;
  v_staff_flag boolean;
  v_facilitator_flag boolean;
  v_poc_flag boolean;
  v_active_flag boolean;
  v_manning_count integer;
  v_manning public.team_members%rowtype;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  if p_survivor_id is null or p_retired_id is null or p_survivor_id = p_retired_id then
    raise exception 'Choose two different personnel records.'
      using errcode = '22023',
            hint = 'PERSONNEL_RECONCILE_PAIR';
  end if;

  if v_personal_name = '' then
    raise exception 'Full name is required.'
      using errcode = 'P0001',
            hint = 'NAME_REQUIRED';
  end if;

  if p_survivor_id < p_retired_id then
    v_first_id := p_survivor_id;
    v_second_id := p_retired_id;
  else
    v_first_id := p_retired_id;
    v_second_id := p_survivor_id;
  end if;

  select * into v_locked_first from public.people where id = v_first_id for update;
  select * into v_locked_second from public.people where id = v_second_id for update;

  if v_locked_first.id = p_survivor_id then
    v_survivor := v_locked_first;
    v_retired := v_locked_second;
  else
    v_survivor := v_locked_second;
    v_retired := v_locked_first;
  end if;

  if v_survivor.id is null or v_retired.id is null then
    raise exception 'personnel record was not found'
      using errcode = 'P0002',
            hint = 'PERSONNEL_NOT_FOUND';
  end if;

  v_survivor_id := v_survivor.id;
  v_retired_id := v_retired.id;
  v_survivor_name := v_survivor.name;
  v_retired_name := v_retired.name;
  v_survivor_display := public.personnel_display_name(v_survivor.rank_title, v_survivor.name);
  v_retired_display := public.personnel_display_name(v_retired.rank_title, v_retired.name);

  if nullif(public.clean_reference_display_name(v_survivor.email), '') is not null
     and nullif(public.clean_reference_display_name(v_retired.email), '') is not null
     and public.normalize_reference_name(v_survivor.email) is distinct from public.normalize_reference_name(v_retired.email) then
    raise exception 'Conflicting email values must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;
  if nullif(public.clean_reference_display_name(v_survivor.phone), '') is not null
     and nullif(public.clean_reference_display_name(v_retired.phone), '') is not null
     and public.normalize_reference_name(v_survivor.phone) is distinct from public.normalize_reference_name(v_retired.phone) then
    raise exception 'Conflicting phone values must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;
  if nullif(public.clean_reference_display_name(v_survivor.command_organization), '') is not null
     and nullif(public.clean_reference_display_name(v_retired.command_organization), '') is not null
     and public.normalize_reference_name(v_survivor.command_organization) is distinct from public.normalize_reference_name(v_retired.command_organization) then
    raise exception 'Conflicting command values must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;
  if nullif(public.clean_reference_display_name(v_survivor.installation), '') is not null
     and nullif(public.clean_reference_display_name(v_retired.installation), '') is not null
     and public.normalize_reference_name(v_survivor.installation) is distinct from public.normalize_reference_name(v_retired.installation) then
    raise exception 'Conflicting installation values must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;
  if nullif(public.clean_reference_display_name(v_survivor.staff_billet_or_role), '') is not null
     and nullif(public.clean_reference_display_name(v_retired.staff_billet_or_role), '') is not null
     and public.normalize_reference_name(v_survivor.staff_billet_or_role) is distinct from public.normalize_reference_name(v_retired.staff_billet_or_role) then
    raise exception 'Conflicting billet values must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;
  if nullif(public.clean_reference_display_name(v_survivor.staff_prd_eaos), '') is not null
     and nullif(public.clean_reference_display_name(v_retired.staff_prd_eaos), '') is not null
     and public.normalize_reference_name(v_survivor.staff_prd_eaos) is distinct from public.normalize_reference_name(v_retired.staff_prd_eaos) then
    raise exception 'Conflicting PRD / EAOS values must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;
  if nullif(public.clean_reference_display_name(v_survivor.staff_status_next_action), '') is not null
     and nullif(public.clean_reference_display_name(v_retired.staff_status_next_action), '') is not null
     and public.normalize_reference_name(v_survivor.staff_status_next_action) is distinct from public.normalize_reference_name(v_retired.staff_status_next_action) then
    raise exception 'Conflicting staff status values must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;
  if v_survivor.staff_display_order is not null
     and v_retired.staff_display_order is not null
     and v_survivor.staff_display_order is distinct from v_retired.staff_display_order then
    raise exception 'Conflicting staff display order must be resolved before reconciliation.'
      using errcode = 'P0001', hint = 'PERSONNEL_CONFLICT';
  end if;

  select count(*)
    into v_manning_count
  from public.team_members
  where person_id in (v_survivor_id, v_retired_id);

  if v_manning_count > 1 then
    raise exception 'Both records have current Manning rows. Reconciliation will not guess which one to keep.'
      using errcode = 'P0001',
            hint = 'STAFF_LINK_CONFLICT';
  end if;

  v_email_name := coalesce(
    nullif(public.clean_reference_display_name(v_survivor.email), ''),
    nullif(public.clean_reference_display_name(v_retired.email), '')
  );
  v_phone_name := coalesce(
    nullif(public.clean_reference_display_name(v_survivor.phone), ''),
    nullif(public.clean_reference_display_name(v_retired.phone), '')
  );
  v_command_name := coalesce(
    nullif(public.clean_reference_display_name(v_survivor.command_organization), ''),
    nullif(public.clean_reference_display_name(v_retired.command_organization), '')
  );
  v_installation_name := coalesce(
    nullif(public.clean_reference_display_name(v_survivor.installation), ''),
    nullif(public.clean_reference_display_name(v_retired.installation), '')
  );
  v_billet_name := coalesce(
    nullif(public.clean_reference_display_name(v_survivor.staff_billet_or_role), ''),
    nullif(public.clean_reference_display_name(v_retired.staff_billet_or_role), '')
  );
  v_prd_name := coalesce(
    nullif(public.clean_reference_display_name(v_survivor.staff_prd_eaos), ''),
    nullif(public.clean_reference_display_name(v_retired.staff_prd_eaos), '')
  );
  v_status_name := coalesce(
    nullif(public.clean_reference_display_name(v_survivor.staff_status_next_action), ''),
    nullif(public.clean_reference_display_name(v_retired.staff_status_next_action), '')
  );
  v_display_order := coalesce(v_survivor.staff_display_order, v_retired.staff_display_order);
  v_staff_flag := v_survivor.is_credo_staff or v_retired.is_credo_staff;
  v_facilitator_flag := v_survivor.is_facilitator or v_retired.is_facilitator;
  v_poc_flag := v_survivor.is_poc or v_retired.is_poc;
  v_active_flag := v_survivor.active or v_retired.active;
  v_display_name := public.personnel_display_name(v_rank_title, v_personal_name);
  v_display_norm := public.normalize_reference_name(v_display_name);

  if v_staff_flag and v_active_flag and v_billet_name is null then
    raise exception 'Billet / Role is required for CREDO Staff.'
      using errcode = 'P0001',
            hint = 'BILLET_REQUIRED';
  end if;

  if exists (
    select 1
    from public.people person
    where person.id not in (v_survivor_id, v_retired_id)
      and public.normalize_reference_name(public.personnel_display_name(person.rank_title, person.name)) = v_display_norm
  ) or exists (
    select 1
    from public.people_name_aliases alias
    where alias.person_id not in (v_survivor_id, v_retired_id)
      and alias.normalized_name = v_display_norm
  ) then
    raise exception 'A personnel record named “%” already exists.', v_display_name
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
  end if;

  perform 1
  from public.people_name_aliases
  where person_id in (v_survivor_id, v_retired_id)
  for update;

  if exists (
    select 1
    from public.people_name_aliases alias
    where alias.person_id = v_retired_id
      and alias.normalized_name is distinct from v_display_norm
      and exists (
        select 1
        from public.people person
        where person.id not in (v_survivor_id, v_retired_id)
          and public.normalize_reference_name(public.personnel_display_name(person.rank_title, person.name)) = alias.normalized_name
      )
  ) then
    raise exception 'That historical name is another person''s current identity.'
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
  end if;

  select *
    into v_manning
  from public.team_members
  where person_id in (v_survivor_id, v_retired_id)
  for update;

  if v_staff_flag and v_active_flag then
    if v_manning.id is null then
      v_display_order := coalesce(
        v_display_order,
        (select coalesce(max(tm.display_order), 0) + 1 from public.team_members tm)
      );
      insert into public.team_members (
        name,
        billet_or_role,
        status_next_action,
        prd_eaos,
        display_order,
        person_id
      )
      values (
        v_display_name,
        v_billet_name,
        v_status_name,
        v_prd_name,
        v_display_order,
        v_survivor_id
      );
    else
      update public.team_members
      set
        person_id = v_survivor_id,
        name = v_display_name,
        billet_or_role = v_billet_name,
        prd_eaos = v_prd_name,
        display_order = coalesce(v_display_order, v_manning.display_order),
        updated_at = now()
      where id = v_manning.id;
      v_display_order := coalesce(v_display_order, v_manning.display_order);
    end if;
  else
    delete from public.team_members
    where person_id in (v_survivor_id, v_retired_id);
  end if;

  update public.people_name_aliases
  set person_id = v_survivor_id
  where person_id = v_retired_id
    and normalized_name is distinct from v_display_norm;

  delete from public.people_name_aliases
  where person_id in (v_survivor_id, v_retired_id)
    and normalized_name = v_display_norm;

  update public.people
  set
    rank_title = v_rank_title,
    name = v_personal_name,
    command_organization = v_command_name,
    installation = v_installation_name,
    email = v_email_name,
    phone = v_phone_name,
    active = v_active_flag,
    is_credo_staff = v_staff_flag,
    is_facilitator = v_facilitator_flag,
    is_poc = v_poc_flag,
    staff_billet_or_role = v_billet_name,
    staff_prd_eaos = v_prd_name,
    staff_status_next_action = v_status_name,
    staff_display_order = v_display_order
  where id = v_survivor_id;

  delete from public.people
  where id = v_retired_id;

  -- The retired row is gone, so its display is no longer a current identity.
  -- remember_personnel_display_alias still rejects any other living identity.
  perform public.remember_personnel_display_alias(v_survivor_id, v_survivor_display, v_display_name);
  perform public.remember_personnel_display_alias(v_survivor_id, v_retired_display, v_display_name);
  perform public.remember_personnel_display_alias(v_survivor_id, v_survivor_name, v_display_name);
  perform public.remember_personnel_display_alias(v_survivor_id, v_retired_name, v_display_name);

  return jsonb_build_object(
    'id', v_survivor_id,
    'retired_id', v_retired_id,
    'name', v_personal_name,
    'rank_title', v_rank_title,
    'display_name', v_display_name,
    'is_credo_staff', v_staff_flag,
    'is_facilitator', v_facilitator_flag,
    'is_poc', v_poc_flag,
    'active', v_active_flag
  );
exception
  when unique_violation then
    raise exception 'A personnel record named “%” already exists.', v_personal_name
      using errcode = 'P0001',
            hint = 'REFERENCE_NAME_EXISTS';
end;
$$;

comment on function public.reconcile_directory_people(uuid, uuid, text, text) is
  'Combines two confirmed personnel records into the chosen survivor. Does not rewrite event text and is never run automatically.';

-- =============================================================================
-- Personnel renames no longer rewrite event text
-- Command, location, venue, and caterer renames are unchanged.
-- =============================================================================

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

  if kind = 'person' then
    raise exception 'Personnel identity is edited from the Team directory.'
      using errcode = 'P0001',
            hint = 'PERSONNEL_USE_TEAM';
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
  end if;

  execute format(
    'update public.%I
     set name = $1
     where id = $2
     returning id, name, normalized_name, active, created_at, updated_at',
    roster_table
  )
  into result_id, result_name, result_normalized, result_active, result_created_at, result_updated_at
  using new_name, p_id;

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
  'Renames a command, location, venue, or caterer and updates matching event text. Person renames are rejected.';

revoke all on function public.save_directory_person(uuid, text, text, text, text, boolean, boolean, boolean, text, text) from public;
revoke all on function public.save_directory_person(uuid, text, text, text, text, boolean, boolean, boolean, text, text) from anon;
revoke all on function public.archive_directory_person(uuid) from public;
revoke all on function public.archive_directory_person(uuid) from anon;
revoke all on function public.reconcile_directory_people(uuid, uuid, text, text) from public;
revoke all on function public.reconcile_directory_people(uuid, uuid, text, text) from anon;

grant execute on function public.save_directory_person(uuid, text, text, text, text, boolean, boolean, boolean, text, text) to authenticated;
grant execute on function public.archive_directory_person(uuid) to authenticated;
grant execute on function public.reconcile_directory_people(uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
