-- 030: Completion uniqueness follows provenance.
-- Manual rows are unique by person, product, and date.
-- Event rows are unique by person, product, and source Event.
-- The same person, product, and date may exist once as manual history
-- and again for each distinct source Event.
-- Does not rewrite migration 028 or 029.
-- Does not apply itself; review and run manually.

alter table public.facilitator_t4t_completions
  drop constraint if exists facilitator_t4t_completions_person_product_date_key;

create unique index if not exists facilitator_t4t_completions_manual_date_key
  on public.facilitator_t4t_completions (person_id, product_id, completed_on)
  where source_event_id is null;

comment on index public.facilitator_t4t_completions_manual_date_key is
  'One manual T4T completion per person, ordinary product, and date. Event-sourced rows are not part of this rule.';

comment on index public.facilitator_t4t_completions_source_event_key is
  'One event-sourced completion per person, ordinary product, and source Event. A manual row or a different Event may use the same completion date.';

-- =============================================================================
-- Record one completion
-- Same signature and permissions as migration 028.
-- A matching date on a manual row, or on a different Event, does not block
-- a new event-sourced row. An existing row is not updated or relabeled.
-- =============================================================================

create or replace function public.record_facilitator_t4t_completion(
  p_person_id uuid,
  p_product_id uuid,
  p_completed_on date,
  p_source_event_id uuid default null,
  p_governing_source text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_code text;
  v_governing_source text := nullif(btrim(coalesce(p_governing_source, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_id uuid;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to record facilitator T4T completions'
      using errcode = '42501';
  end if;

  if p_person_id is null or not exists (select 1 from public.people where id = p_person_id) then
    raise exception 'personnel record was not found'
      using errcode = 'P0002',
            hint = 'PERSONNEL_NOT_FOUND';
  end if;

  if p_product_id is null then
    raise exception 'facilitator product was not found'
      using errcode = 'P0002',
            hint = 'FACILITATOR_PRODUCT_NOT_FOUND';
  end if;

  select product.code
    into v_product_code
  from public.facilitator_products product
  where product.id = p_product_id;

  if v_product_code is null then
    raise exception 'facilitator product was not found'
      using errcode = 'P0002',
            hint = 'FACILITATOR_PRODUCT_NOT_FOUND';
  end if;

  if v_product_code in ('safetalk_t4t', 'asist_t4t') then
    raise exception 'T4T completion records use the ordinary qualification product'
      using errcode = 'P0001',
            hint = 'T4T_COMPLETION_PRODUCT_INVALID';
  end if;

  if p_completed_on is null then
    raise exception 'T4T completion date is required'
      using errcode = 'P0001',
            hint = 'T4T_COMPLETION_DATE_REQUIRED';
  end if;

  if p_source_event_id is not null and not exists (
    select 1 from public.events where id = p_source_event_id
  ) then
    raise exception 'event record was not found'
      using errcode = 'P0002',
            hint = 'EVENT_NOT_FOUND';
  end if;

  if p_source_event_id is null and exists (
    select 1
    from public.facilitator_t4t_completions completion
    where completion.person_id = p_person_id
      and completion.product_id = p_product_id
      and completion.completed_on = p_completed_on
      and completion.source_event_id is null
  ) then
    raise exception 'a manual T4T completion is already recorded for that person, product, and date'
      using errcode = 'P0001',
            hint = 'T4T_COMPLETION_DUPLICATE';
  end if;

  if p_source_event_id is not null and exists (
    select 1
    from public.facilitator_t4t_completions completion
    where completion.person_id = p_person_id
      and completion.product_id = p_product_id
      and completion.source_event_id = p_source_event_id
  ) then
    raise exception 'a T4T completion for that event is already recorded for that person and product'
      using errcode = 'P0001',
            hint = 'T4T_COMPLETION_EVENT_DUPLICATE';
  end if;

  insert into public.facilitator_t4t_completions (
    person_id,
    product_id,
    completed_on,
    source_event_id,
    governing_source,
    notes,
    created_by
  )
  values (
    p_person_id,
    p_product_id,
    p_completed_on,
    p_source_event_id,
    v_governing_source,
    v_notes,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    if sqlerrm ilike '%facilitator_t4t_completions_source_event_key%' then
      raise exception 'a T4T completion for that event is already recorded for that person and product'
        using errcode = 'P0001',
              hint = 'T4T_COMPLETION_EVENT_DUPLICATE';
    end if;
    if sqlerrm ilike '%facilitator_t4t_completions_manual_date_key%' then
      raise exception 'a manual T4T completion is already recorded for that person, product, and date'
        using errcode = 'P0001',
              hint = 'T4T_COMPLETION_DUPLICATE';
    end if;
    raise;
end;
$$;

comment on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) is
  'Inserts one T4T completion history row. Does not update an existing row, convert a manual row into an event row, create a person or qualification, or change standing or the current T4T date.';
