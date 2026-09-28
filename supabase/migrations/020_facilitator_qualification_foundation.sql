-- 020: Facilitator qualification foundation (Stage 3A)
-- Durable catalog, empty Event Type map, and person-product qualifications.
-- Does not read or write public.events.
-- Does not alter public.team_members or MIR Manning.
-- Does not seed qualification rows or Event Type mappings.
-- Does not infer qualifications, standing, or trainer authority.
-- Does not apply itself; review and run manually.

-- =============================================================================
-- Locked facilitator product catalog
-- Codes are stable identifiers for these 17 products.
-- They are not derived from public.event_types.
-- =============================================================================

create table public.facilitator_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  sort_order integer not null,
  rule_family text,
  governing_source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facilitator_products_rule_family_check
    check (rule_family is null or rule_family in ('safetalk_trainer', 'asist_trainer'))
);

comment on table public.facilitator_products is
  'Locked facilitator product catalog. Separate from public.event_types. Stage 3A does not derive experience from Events.';

comment on column public.facilitator_products.rule_family is
  'Governing rule family. Set only for safeTALK (safetalk_trainer) and ASIST (asist_trainer). T4T products have none.';

comment on column public.facilitator_products.governing_source is
  'Optional default source for a product. Stage 3A leaves it null.';

create trigger facilitator_products_updated_at
  before update on public.facilitator_products
  for each row execute function public.set_updated_at();

insert into public.facilitator_products (code, name, sort_order, rule_family, governing_source)
values
  ('marriage_enrichment_retreat', 'Marriage Enrichment Retreat', 1, null, null),
  ('marriage_enrichment_workshop', 'Marriage Enrichment Workshop', 2, null, null),
  ('family_enrichment_retreat', 'Family Enrichment Retreat', 3, null, null),
  ('personal_growth_retreat', 'Personal Growth Retreat', 4, null, null),
  ('personal_growth_workshop', 'Personal Growth Workshop', 5, null, null),
  ('gottman_method', 'Gottman Method', 6, null, null),
  ('seven_principles_for_making_marriage_work', 'Seven Principles for Making Marriage Work', 7, null, null),
  ('prep_8_0', 'PREP 8.0', 8, null, null),
  ('five_love_languages', 'Five Love Languages', 9, null, null),
  ('four_lenses', 'Four Lenses', 10, null, null),
  ('strengths_discovery_encounter', 'Strengths Discovery Encounter', 11, null, null),
  ('cliftonstrengths', 'CliftonStrengths', 12, null, null),
  ('navigating_your_next_chapter', 'Navigating Your Next Chapter', 13, null, null),
  ('safetalk', 'safeTALK', 14, 'safetalk_trainer', null),
  ('asist', 'ASIST', 15, 'asist_trainer', null),
  ('safetalk_t4t', 'safeTALK T4T', 16, null, null),
  ('asist_t4t', 'ASIST T4T', 17, null, null);

-- =============================================================================
-- Event Type to product map
-- Created empty. Stage 3A does not infer mappings from names.
-- =============================================================================

create table public.facilitator_event_type_products (
  event_type_id uuid primary key references public.event_types (id) on delete restrict,
  product_id uuid not null references public.facilitator_products (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.facilitator_event_type_products is
  'Explicit map from one Event Type to one facilitator product. Empty in Stage 3A.';

create trigger facilitator_event_type_products_updated_at
  before update on public.facilitator_event_type_products
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Person-product qualifications
-- Manual fields only. Experience counts are not stored.
-- =============================================================================

create table public.facilitator_qualifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  product_id uuid not null references public.facilitator_products (id) on delete restrict,
  standing text not null,
  t4t_completed_on date,
  first_facilitated_on date,
  trainer_authority boolean not null default false,
  expiration_on date,
  governing_source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint facilitator_qualifications_person_product_key unique (person_id, product_id),
  constraint facilitator_qualifications_standing_check
    check (standing in ('developing', 'provisional', 'registered', 'inactive'))
);

comment on table public.facilitator_qualifications is
  'One deliberate person-product qualification. Not created from Events or from the Facilitator role.';

comment on column public.facilitator_qualifications.standing is
  'Manual standing: developing, provisional, registered, or inactive. Not promoted from Event counts.';

comment on column public.facilitator_qualifications.trainer_authority is
  'Manual trainer authority. A T4T date does not set this flag.';

comment on column public.facilitator_qualifications.governing_source is
  'Source recorded for this qualification. Stage 3A does not invent one.';

create trigger facilitator_qualifications_updated_at
  before update on public.facilitator_qualifications
  for each row execute function public.set_updated_at();

create index facilitator_qualifications_product_idx
  on public.facilitator_qualifications (product_id);

-- =============================================================================
-- Row Level Security
-- Authenticated users can read. Catalog and map writes are admin-only.
-- Qualification writes go through save_facilitator_qualification.
-- =============================================================================

alter table public.facilitator_products enable row level security;
alter table public.facilitator_event_type_products enable row level security;
alter table public.facilitator_qualifications enable row level security;

create policy "facilitator_products_select_authenticated"
on public.facilitator_products for select
to authenticated
using (true);

create policy "facilitator_products_insert_admin"
on public.facilitator_products for insert
to authenticated
with check (public.is_admin());

create policy "facilitator_products_update_admin"
on public.facilitator_products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "facilitator_products_delete_admin"
on public.facilitator_products for delete
to authenticated
using (public.is_admin());

create policy "facilitator_event_type_products_select_authenticated"
on public.facilitator_event_type_products for select
to authenticated
using (true);

create policy "facilitator_event_type_products_insert_admin"
on public.facilitator_event_type_products for insert
to authenticated
with check (public.is_admin());

create policy "facilitator_event_type_products_update_admin"
on public.facilitator_event_type_products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "facilitator_event_type_products_delete_admin"
on public.facilitator_event_type_products for delete
to authenticated
using (public.is_admin());

create policy "facilitator_qualifications_select_authenticated"
on public.facilitator_qualifications for select
to authenticated
using (true);

revoke all on table public.facilitator_products from public, anon, authenticated;
grant select, insert, update, delete on table public.facilitator_products to authenticated;

revoke all on table public.facilitator_event_type_products from public, anon, authenticated;
grant select, insert, update, delete on table public.facilitator_event_type_products to authenticated;

revoke all on table public.facilitator_qualifications from public, anon, authenticated;
grant select on table public.facilitator_qualifications to authenticated;

-- =============================================================================
-- Qualification write
-- Accepts the caller's manual values. Does not read Events or role flags.
-- Setting standing to inactive keeps the row.
-- =============================================================================

create or replace function public.save_facilitator_qualification(
  p_person_id uuid,
  p_product_id uuid,
  p_standing text,
  p_t4t_completed_on date,
  p_first_facilitated_on date,
  p_trainer_authority boolean,
  p_expiration_on date,
  p_governing_source text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_standing text := lower(btrim(coalesce(p_standing, '')));
  v_trainer_authority boolean := coalesce(p_trainer_authority, false);
  v_governing_source text := nullif(btrim(coalesce(p_governing_source, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_row public.facilitator_qualifications%rowtype;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit facilitator qualifications'
      using errcode = '42501';
  end if;

  if p_person_id is null or not exists (select 1 from public.people where id = p_person_id) then
    raise exception 'personnel record was not found'
      using errcode = 'P0002',
            hint = 'PERSONNEL_NOT_FOUND';
  end if;

  if p_product_id is null or not exists (select 1 from public.facilitator_products where id = p_product_id) then
    raise exception 'facilitator product was not found'
      using errcode = 'P0002',
            hint = 'FACILITATOR_PRODUCT_NOT_FOUND';
  end if;

  if v_standing not in ('developing', 'provisional', 'registered', 'inactive') then
    raise exception 'qualification standing is not recognized'
      using errcode = 'P0001',
            hint = 'QUALIFICATION_STANDING_INVALID';
  end if;

  insert into public.facilitator_qualifications (
    person_id,
    product_id,
    standing,
    t4t_completed_on,
    first_facilitated_on,
    trainer_authority,
    expiration_on,
    governing_source,
    notes,
    updated_by
  )
  values (
    p_person_id,
    p_product_id,
    v_standing,
    p_t4t_completed_on,
    p_first_facilitated_on,
    v_trainer_authority,
    p_expiration_on,
    v_governing_source,
    v_notes,
    auth.uid()
  )
  on conflict (person_id, product_id) do update
  set
    standing = excluded.standing,
    t4t_completed_on = excluded.t4t_completed_on,
    first_facilitated_on = excluded.first_facilitated_on,
    trainer_authority = excluded.trainer_authority,
    expiration_on = excluded.expiration_on,
    governing_source = excluded.governing_source,
    notes = excluded.notes,
    updated_by = excluded.updated_by
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'person_id', v_row.person_id,
    'product_id', v_row.product_id,
    'standing', v_row.standing,
    't4t_completed_on', v_row.t4t_completed_on,
    'first_facilitated_on', v_row.first_facilitated_on,
    'trainer_authority', v_row.trainer_authority,
    'expiration_on', v_row.expiration_on,
    'governing_source', v_row.governing_source,
    'notes', v_row.notes,
    'updated_by', v_row.updated_by
  );
end;
$$;

comment on function public.save_facilitator_qualification(uuid, uuid, text, date, date, boolean, date, text, text) is
  'Creates or updates one person-product qualification from explicit values. Does not read Events or change personnel roles.';

revoke all on function public.save_facilitator_qualification(uuid, uuid, text, date, date, boolean, date, text, text) from public;
revoke all on function public.save_facilitator_qualification(uuid, uuid, text, date, date, boolean, date, text, text) from anon;
grant execute on function public.save_facilitator_qualification(uuid, uuid, text, date, date, boolean, date, text, text) to authenticated;

-- =============================================================================
-- Reconciliation keeps the Stage 2B function body.
-- Non-conflicting qualifications move to the survivor before that person row is deleted.
-- A same-product pair raises PERSONNEL_CONFLICT and rolls the transaction back.
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

  perform 1
  from public.facilitator_qualifications
  where person_id in (v_survivor_id, v_retired_id)
  for update;

  if exists (
    select 1
    from public.facilitator_qualifications retired_qualification
    join public.facilitator_qualifications survivor_qualification
      on survivor_qualification.product_id = retired_qualification.product_id
    where retired_qualification.person_id = v_retired_id
      and survivor_qualification.person_id = v_survivor_id
  ) then
    raise exception 'Conflicting facilitator qualifications must be resolved before reconciliation.'
      using errcode = 'P0001',
            hint = 'PERSONNEL_CONFLICT';
  end if;

  update public.facilitator_qualifications
  set
    person_id = v_survivor_id,
    updated_at = now()
  where person_id = v_retired_id;

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
  'Combines two confirmed personnel records into the chosen survivor, reassigns non-conflicting facilitator qualifications, and does not rewrite event text. Never run automatically.';

revoke all on function public.reconcile_directory_people(uuid, uuid, text, text) from public;
revoke all on function public.reconcile_directory_people(uuid, uuid, text, text) from anon;
grant execute on function public.reconcile_directory_people(uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
