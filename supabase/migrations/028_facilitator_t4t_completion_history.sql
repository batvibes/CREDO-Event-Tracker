-- 028: Durable T4T completion history.
-- One row is one completed or renewed Train-the-Trainer course for an
-- ordinary qualification product. This is not facilitation experience.
-- Inserts do not create people or qualifications and do not change
-- standing, trainer authority, expiration, or t4t_completed_on.
-- Does not apply itself; review and run manually.

-- =============================================================================
-- Completion history
-- product_id is the ordinary qualification product: safeTALK, ASIST, or a
-- selected workshop curriculum. safeTALK T4T and ASIST T4T are courses,
-- not completion targets.
-- =============================================================================

create table public.facilitator_t4t_completions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  product_id uuid not null references public.facilitator_products (id) on delete restrict,
  completed_on date not null,
  source_event_id uuid references public.events (id) on delete set null,
  governing_source text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  constraint facilitator_t4t_completions_person_product_date_key
    unique (person_id, product_id, completed_on)
);

comment on table public.facilitator_t4t_completions is
  'Historical T4T completions and renewals. Distinct from facilitator_t4t_product_experience. A row does not change qualification standing or the current T4T date.';

comment on column public.facilitator_t4t_completions.product_id is
  'Ordinary qualification product. safeTALK and ASIST stay on those products. A workshop T4T uses the selected curriculum. safeTALK T4T and ASIST T4T are not completion targets.';

comment on column public.facilitator_t4t_completions.completed_on is
  'Date the person completed this T4T course. A later renewal is another row.';

comment on column public.facilitator_t4t_completions.source_event_id is
  'Event that sourced this completion, when one was recorded. Deleting that Event keeps the completion and clears this reference.';

comment on column public.facilitator_t4t_completions.created_by is
  'Authenticated user who recorded the completion. Required, so this reference does not set the value null when that user is removed.';

create unique index facilitator_t4t_completions_source_event_key
  on public.facilitator_t4t_completions (source_event_id, person_id, product_id)
  where source_event_id is not null;

comment on index public.facilitator_t4t_completions_source_event_key is
  'One completion per person, ordinary product, and source Event. Also supports lookup by source Event.';

-- =============================================================================
-- Read access
-- Authenticated users can select. Inserts go through the RPC below.
-- =============================================================================

alter table public.facilitator_t4t_completions enable row level security;

create policy "facilitator_t4t_completions_select_authenticated"
on public.facilitator_t4t_completions for select
to authenticated
using (true);

revoke all on table public.facilitator_t4t_completions from public, anon, authenticated;
grant select on table public.facilitator_t4t_completions to authenticated;

-- =============================================================================
-- Record one completion
-- Does not read or write facilitator_qualifications or people.active.
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

  if exists (
    select 1
    from public.facilitator_t4t_completions completion
    where completion.person_id = p_person_id
      and completion.product_id = p_product_id
      and completion.completed_on = p_completed_on
  ) then
    raise exception 'a T4T completion is already recorded for that person, product, and date'
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
    raise exception 'a T4T completion is already recorded for that person, product, and date'
      using errcode = 'P0001',
            hint = 'T4T_COMPLETION_DUPLICATE';
end;
$$;

comment on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) is
  'Inserts one T4T completion history row. Does not create a person or qualification and does not change standing or the current T4T date.';

revoke all on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) from public;
revoke all on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) from anon;
grant execute on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) to authenticated;
