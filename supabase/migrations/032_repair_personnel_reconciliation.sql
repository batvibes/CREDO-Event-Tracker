-- 032: Repair personnel reconciliation for the current person graph.
-- Replaces public.reconcile_directory_people. Does not edit migrations 019–031.
-- Does not apply itself; review and run manually.
--
-- Stored person_id dependencies this function must finish before delete:
--   public.people                         the two canonical rows
--   public.people_name_aliases            person_id, on delete cascade, unique normalized_name
--   public.team_members                   person_id, on delete restrict, unique person_id
--   public.facilitator_qualifications     person_id, on delete restrict, unique (person_id, product_id)
--   public.facilitator_t4t_completions    person_id, on delete restrict
--   public.t4t_attendance_created_people  person_id, on delete cascade
-- facilitator_event_tokens, facilitator_product_experience, and
-- facilitator_t4t_product_experience are views. Their person_id is resolved
-- from event text plus current names and aliases. This function does not
-- rewrite event text.

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
  v_personal_norm text;
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
  v_conflict_product text;
  v_retired_completion public.facilitator_t4t_completions%rowtype;
  v_kept_id uuid;
  v_constraint_name text;
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
  v_personal_norm := public.normalize_reference_name(v_personal_name);

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
  ) or exists (
    select 1
    from public.people person
    where person.id not in (v_survivor_id, v_retired_id)
      and person.normalized_name = v_personal_norm
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
            hint = 'PERSONNEL_ALIAS_CONFLICT';
  end if;

  select product.name
    into v_conflict_product
  from public.facilitator_qualifications retired_qualification
  join public.facilitator_qualifications survivor_qualification
    on survivor_qualification.product_id = retired_qualification.product_id
   and survivor_qualification.person_id = v_survivor_id
  join public.facilitator_products product
    on product.id = retired_qualification.product_id
  where retired_qualification.person_id = v_retired_id
  limit 1;

  if v_conflict_product is not null then
    raise exception 'Both records have a qualification for %. Resolve that qualification before reconciliation.', v_conflict_product
      using errcode = 'P0001',
            hint = 'PERSONNEL_CONFLICT';
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

  -- Collapse a normalized alias the survivor already owns, then move the rest.
  -- The alias primary key is normalized_name, so two living people cannot both
  -- hold the same alias today. The delete still makes a repeated merge safe.
  delete from public.people_name_aliases as retired_alias
  where retired_alias.person_id = v_retired_id
    and (
      retired_alias.normalized_name = v_display_norm
      or exists (
        select 1
        from public.people_name_aliases as survivor_alias
        where survivor_alias.person_id = v_survivor_id
          and survivor_alias.normalized_name = retired_alias.normalized_name
      )
    );

  update public.people_name_aliases
  set person_id = v_survivor_id
  where person_id = v_retired_id
    and normalized_name is distinct from v_display_norm;

  delete from public.people_name_aliases
  where person_id in (v_survivor_id, v_retired_id)
    and normalized_name = v_display_norm;

  perform 1
  from public.facilitator_qualifications
  where person_id in (v_survivor_id, v_retired_id)
  for update;

  update public.facilitator_qualifications
  set
    person_id = v_survivor_id,
    updated_at = now()
  where person_id = v_retired_id;

  -- Manual rows match on person, product, and date.
  -- Event rows match on source event, person, and product.
  -- A matching pair keeps one row and fills only blank metadata.
  -- A different event on the same date stays as its own row.
  perform 1
  from public.facilitator_t4t_completions
  where person_id in (v_survivor_id, v_retired_id)
  for update;

  for v_retired_completion in
    select *
    from public.facilitator_t4t_completions
    where person_id = v_retired_id
    order by created_at, id
  loop
    v_kept_id := null;
    if v_retired_completion.source_event_id is null then
      select completion.id
        into v_kept_id
      from public.facilitator_t4t_completions completion
      where completion.person_id = v_survivor_id
        and completion.product_id = v_retired_completion.product_id
        and completion.completed_on = v_retired_completion.completed_on
        and completion.source_event_id is null;
    else
      select completion.id
        into v_kept_id
      from public.facilitator_t4t_completions completion
      where completion.person_id = v_survivor_id
        and completion.product_id = v_retired_completion.product_id
        and completion.source_event_id = v_retired_completion.source_event_id;
    end if;

    if v_kept_id is not null then
      update public.facilitator_t4t_completions kept
      set
        governing_source = coalesce(
          nullif(btrim(kept.governing_source), ''),
          nullif(btrim(v_retired_completion.governing_source), '')
        ),
        notes = coalesce(
          nullif(btrim(kept.notes), ''),
          nullif(btrim(v_retired_completion.notes), '')
        )
      where kept.id = v_kept_id;

      delete from public.facilitator_t4t_completions
      where id = v_retired_completion.id;
    else
      update public.facilitator_t4t_completions
      set person_id = v_survivor_id
      where id = v_retired_completion.id;
    end if;
  end loop;

  -- Attendance provenance says the person was created by Manage T4T Attendance.
  -- Copying the retired row onto an established survivor would make that
  -- survivor eligible for automatic deletion. Consume the retired proof instead.
  delete from public.t4t_attendance_created_people
  where person_id = v_retired_id;

  delete from public.people
  where id = v_retired_id;

  -- The retired personal name is gone, so the survivor can take it.
  -- Doing this earlier collides with people.normalized_name on the retired row.
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
    get stacked diagnostics v_constraint_name = constraint_name;
    raise exception 'Reconciliation hit an unexpected duplicate (%) and was rolled back.', coalesce(v_constraint_name, 'unique')
      using errcode = 'P0001',
            hint = 'PERSONNEL_RECONCILE_DUPLICATE';
  when foreign_key_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    raise exception 'Reconciliation could not retire that record because % still references it. Nothing was changed.', coalesce(v_constraint_name, 'another record')
      using errcode = 'P0001',
            hint = 'PERSONNEL_RECONCILE_REFERENCE';
end;
$$;

comment on function public.reconcile_directory_people(uuid, uuid, text, text) is
  'Combines two confirmed personnel records into the chosen survivor. Moves aliases, Manning, qualifications, and T4T completion history. Drops attendance-created provenance on the retired person. Does not rewrite event text. Never run automatically.';

revoke all on function public.reconcile_directory_people(uuid, uuid, text, text) from public;
revoke all on function public.reconcile_directory_people(uuid, uuid, text, text) from anon;
grant execute on function public.reconcile_directory_people(uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
