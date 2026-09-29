-- 023: Facilitator product taxonomy correction (Stage 5A)
-- Marriage Enrichment Workshop and Personal Growth Workshop are Event Types.
-- They are no longer current facilitator products, and a generic workshop Event
-- does not create product experience unless that Event stores one allowed curriculum.
-- Does not guess or backfill historical curricula.
-- Does not merge qualification rows.
-- Does not write people, aliases, team_members, or Event text.
-- Does not apply itself; review and run manually.
--
-- Direct Event Type mappings from migration 022 stay in place for:
-- Marriage Enrichment Retreat, Family Enrichment Retreat, Personal Growth Retreat,
-- ASIST Workshop, ASIST T4T, SafeTalk Workshop, and SafeTalk T4T.
-- facilitator_event_type_products remains that one-to-one direct relationship.
-- Allowed workshop curricula live in a separate table and do not by themselves
-- create facilitator_product_experience.

-- =============================================================================
-- Qualification conflicts
-- A person with records on both predecessors of one canonical product stops
-- the migration. Single-sided records stay on the predecessor product.
-- =============================================================================

do $$
declare
  v_gottman_conflicts text;
  v_strengths_conflicts text;
begin
  select string_agg(conflict.person_id::text, ', ' order by conflict.person_id::text)
  into v_gottman_conflicts
  from (
    select qualification.person_id
    from public.facilitator_qualifications qualification
    join public.facilitator_products product
      on product.id = qualification.product_id
    where product.code in ('gottman_method', 'seven_principles_for_making_marriage_work')
    group by qualification.person_id
    having count(distinct product.code) = 2
  ) conflict;

  if v_gottman_conflicts is not null then
    raise exception
      'Gottman consolidation conflict. These people have qualification records on both predecessor products: %',
      v_gottman_conflicts;
  end if;

  select string_agg(conflict.person_id::text, ', ' order by conflict.person_id::text)
  into v_strengths_conflicts
  from (
    select qualification.person_id
    from public.facilitator_qualifications qualification
    join public.facilitator_products product
      on product.id = qualification.product_id
    where product.code in ('cliftonstrengths', 'strengths_discovery_encounter')
    group by qualification.person_id
    having count(distinct product.code) = 2
  ) conflict;

  if v_strengths_conflicts is not null then
    raise exception
      'CliftonStrengths consolidation conflict. These people have qualification records on both predecessor products: %',
      v_strengths_conflicts;
  end if;
end;
$$;

-- =============================================================================
-- Optional curriculum selected for one Event
-- Null means no specific curriculum has been identified.
-- Existing rows stay null. This statement does not update Event rows.
-- =============================================================================

alter table public.events
  add column curriculum_product_id uuid references public.facilitator_products (id) on delete restrict;

comment on column public.events.curriculum_product_id is
  'Optional curriculum selected for this Event. Null when no specific curriculum has been identified. Not inferred from Event Type, title, facilitators, or notes.';

create index events_curriculum_product_id_idx
  on public.events (curriculum_product_id);

-- =============================================================================
-- Allowed curricula for an Event Type
-- This is not the product credited for an Event. An Event selects at most one.
-- =============================================================================

create table public.facilitator_event_type_allowed_products (
  event_type_id uuid not null references public.event_types (id) on delete restrict,
  product_id uuid not null references public.facilitator_products (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (event_type_id, product_id)
);

comment on table public.facilitator_event_type_allowed_products is
  'Curricula allowed for an Event Type. A row does not credit facilitator product experience. The Event curriculum_product_id, when set, is the selected curriculum.';

alter table public.facilitator_event_type_allowed_products enable row level security;

create policy "facilitator_event_type_allowed_products_select_authenticated"
on public.facilitator_event_type_allowed_products for select
to authenticated
using (true);

create policy "facilitator_event_type_allowed_products_insert_admin"
on public.facilitator_event_type_allowed_products for insert
to authenticated
with check (public.is_admin());

create policy "facilitator_event_type_allowed_products_update_admin"
on public.facilitator_event_type_allowed_products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "facilitator_event_type_allowed_products_delete_admin"
on public.facilitator_event_type_allowed_products for delete
to authenticated
using (public.is_admin());

revoke all on table public.facilitator_event_type_allowed_products from public, anon, authenticated;
grant select, insert, update, delete on table public.facilitator_event_type_allowed_products to authenticated;

-- =============================================================================
-- Reject a selected curriculum that the Event Type does not allow.
-- A null curriculum is valid. An incompatible change is rejected, not cleared.
-- =============================================================================

create or replace function public.enforce_event_curriculum_compatibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_event_type_id uuid;
  v_allowed boolean;
begin
  if new.curriculum_product_id is null then
    return new;
  end if;

  select event_type.id
  into v_event_type_id
  from public.event_types event_type
  where event_type.name = new.event_type;

  if v_event_type_id is null then
    raise exception
      'Event Type "%" has no allowed curriculum catalog.',
      new.event_type;
  end if;

  select exists (
    select 1
    from public.facilitator_event_type_allowed_products allowed
    join public.facilitator_products product
      on product.id = allowed.product_id
    where allowed.event_type_id = v_event_type_id
      and allowed.product_id = new.curriculum_product_id
      and product.active = true
  )
  into v_allowed;

  if not v_allowed then
    raise exception
      'Selected curriculum is not an active allowed curriculum for Event Type "%".',
      new.event_type;
  end if;

  return new;
end;
$$;

comment on function public.enforce_event_curriculum_compatibility() is
  'Allows a null Event curriculum. Rejects a selected product that is not an active allowed curriculum for the Event Type.';

create trigger events_curriculum_compatibility
  before insert or update of event_type, curriculum_product_id
  on public.events
  for each row
  execute function public.enforce_event_curriculum_compatibility();

revoke all on function public.enforce_event_curriculum_compatibility() from public, anon;
grant execute on function public.enforce_event_curriculum_compatibility() to authenticated;

-- =============================================================================
-- Catalog correction
-- Predecessor rows stay in place so existing references remain valid.
-- Their active flag becomes false. Qualification rows are not moved.
-- =============================================================================

insert into public.facilitator_products (code, name, sort_order, rule_family, governing_source, active)
values
  ('gottman_seven_principles', 'Gottman, Seven Principles of Making Marriage Work', 4, null, null, true),
  ('cliftonstrengths_strengths_discovery_encounter', 'CliftonStrengths, Strengths Discovery Encounter', 7, null, null, true);

update public.facilitator_products product
set
  name = catalog.name,
  sort_order = catalog.sort_order,
  active = catalog.active
from (values
  ('marriage_enrichment_retreat', 'Marriage Enrichment Retreat', 1, true),
  ('family_enrichment_retreat', 'Family Enrichment Retreat', 2, true),
  ('personal_growth_retreat', 'Personal Growth Retreat', 3, true),
  ('prep_8_0', 'PREP 8.0', 5, true),
  ('four_lenses', '4 Lenses', 6, true),
  ('navigating_your_next_chapter', 'Navigating Your Next Chapter', 8, true),
  ('safetalk', 'safeTALK', 9, true),
  ('asist', 'ASIST', 10, true),
  ('safetalk_t4t', 'safeTALK T4T', 11, true),
  ('asist_t4t', 'ASIST T4T', 12, true),
  ('marriage_enrichment_workshop', 'Marriage Enrichment Workshop', 101, false),
  ('personal_growth_workshop', 'Personal Growth Workshop', 102, false),
  ('gottman_method', 'Gottman Method', 103, false),
  ('seven_principles_for_making_marriage_work', 'Seven Principles for Making Marriage Work', 104, false),
  ('five_love_languages', 'Five Love Languages', 105, false),
  ('strengths_discovery_encounter', 'Strengths Discovery Encounter', 106, false),
  ('cliftonstrengths', 'CliftonStrengths', 107, false)
) as catalog(code, name, sort_order, active)
where product.code = catalog.code;

do $$
declare
  v_event_type_name text;
  v_product_code text;
  v_event_type_count integer;
  v_product_count integer;
  v_event_type_id uuid;
  v_product_id uuid;
  v_direct_count integer;
begin
  delete from public.facilitator_event_type_products mapping
  using public.event_types event_type
  where mapping.event_type_id = event_type.id
    and event_type.name in ('Marriage Enrichment Workshop', 'Personal Growth Workshop');

  if exists (
    select 1
    from public.facilitator_event_type_products mapping
    join public.event_types event_type
      on event_type.id = mapping.event_type_id
    where event_type.name in ('Marriage Enrichment Workshop', 'Personal Growth Workshop')
  ) then
    raise exception 'Generic workshop Event Types are still mapped as direct facilitator products.';
  end if;

  select count(*)::integer
  into v_direct_count
  from public.facilitator_event_type_products mapping
  join public.event_types event_type
    on event_type.id = mapping.event_type_id
  join public.facilitator_products product
    on product.id = mapping.product_id
  where (event_type.name, product.code) in (
    ('Marriage Enrichment Retreat', 'marriage_enrichment_retreat'),
    ('Family Enrichment Retreat', 'family_enrichment_retreat'),
    ('Personal Growth Retreat', 'personal_growth_retreat'),
    ('ASIST Workshop', 'asist'),
    ('ASIST T4T', 'asist_t4t'),
    ('SafeTalk Workshop', 'safetalk'),
    ('SafeTalk T4T', 'safetalk_t4t')
  );

  if v_direct_count <> 7 then
    raise exception 'Expected the 7 direct Event Type mappings to remain, found %.', v_direct_count;
  end if;

  for v_event_type_name, v_product_code in
    select allowed.event_type_name, allowed.product_code
    from (values
      ('Marriage Enrichment Workshop', 'gottman_seven_principles'),
      ('Marriage Enrichment Workshop', 'prep_8_0'),
      ('Personal Growth Workshop', 'four_lenses'),
      ('Personal Growth Workshop', 'cliftonstrengths_strengths_discovery_encounter'),
      ('Personal Growth Workshop', 'navigating_your_next_chapter')
    ) as allowed(event_type_name, product_code)
  loop
    select count(*)::integer
    into v_event_type_count
    from public.event_types
    where name = v_event_type_name;

    if v_event_type_count <> 1 then
      raise exception
        'Expected exactly one Event Type named "%", found %.',
        v_event_type_name, v_event_type_count;
    end if;

    select event_type.id
    into strict v_event_type_id
    from public.event_types event_type
    where event_type.name = v_event_type_name;

    select count(*)::integer
    into v_product_count
    from public.facilitator_products
    where code = v_product_code
      and active = true;

    if v_product_count <> 1 then
      raise exception
        'Expected exactly one active facilitator product with code "%", found %.',
        v_product_code, v_product_count;
    end if;

    select product.id
    into strict v_product_id
    from public.facilitator_products product
    where product.code = v_product_code
      and product.active = true;

    insert into public.facilitator_event_type_allowed_products (event_type_id, product_id)
    values (v_event_type_id, v_product_id);
  end loop;
end;
$$;

-- =============================================================================
-- Derived experience
-- Direct Event Types still credit their one mapped product.
-- A workshop Event credits only its selected allowed curriculum.
-- A workshop Event with a null curriculum credits nothing.
-- =============================================================================

create or replace view public.facilitator_event_tokens
with (security_invoker = true) as
select
  event.id as event_id,
  event.event_type,
  token.token as facilitator_token,
  public.facilitator_event_date(event.start_date, event.date) as recorded_on,
  resolution.person_id,
  resolution.match_count,
  case
    when event.curriculum_product_id is not null
      and exists (
        select 1
        from public.facilitator_event_type_allowed_products allowed
        where allowed.event_type_id = event_type.id
          and allowed.product_id = event.curriculum_product_id
      )
      then event.curriculum_product_id
    when event.curriculum_product_id is null
      and not exists (
        select 1
        from public.facilitator_event_type_allowed_products allowed
        where allowed.event_type_id = event_type.id
      )
      then mapping.product_id
    else null::uuid
  end as product_id
from public.events event
cross join lateral public.split_facilitator_tokens(event.facilitators) as token(token)
cross join lateral public.facilitator_token_resolution(token.token) as resolution
left join public.event_types event_type
  on event_type.name = event.event_type
left join public.facilitator_event_type_products mapping
  on mapping.event_type_id = event_type.id;

comment on view public.facilitator_event_tokens is
  'Recorded facilitator tokens. Direct Event Types credit their mapped product. Workshop Event Types credit only a selected allowed curriculum. A null curriculum credits no product.';

comment on view public.facilitator_product_experience is
  'Derived conducted facilitation. Workshop Events with no selected curriculum contribute nothing. Direct Event Types still use their explicit mapping. This view is not a stored history and does not change qualifications.';

-- =============================================================================
-- Workshop Events whose curriculum has not been identified
-- This is not facilitator experience and it does not judge qualifications.
-- =============================================================================

create view public.facilitator_unclassified_workshop_history
with (security_invoker = true) as
select
  event.id as event_id,
  event.event_type,
  token.token as facilitator_token,
  resolution.person_id,
  resolution.match_count,
  public.facilitator_event_date(event.start_date, event.date) as recorded_on
from public.events event
cross join lateral public.split_facilitator_tokens(event.facilitators) as token(token)
cross join lateral public.facilitator_token_resolution(token.token) as resolution
where event.event_type in ('Marriage Enrichment Workshop', 'Personal Growth Workshop')
  and event.curriculum_product_id is null;

comment on view public.facilitator_unclassified_workshop_history is
  'Marriage Enrichment Workshop and Personal Growth Workshop Events that have facilitator text and no selected curriculum. This is not product experience and it does not describe qualification.';

revoke all on table public.facilitator_unclassified_workshop_history from public, anon, authenticated;
grant select on table public.facilitator_unclassified_workshop_history to authenticated;

notify pgrst, 'reload schema';
