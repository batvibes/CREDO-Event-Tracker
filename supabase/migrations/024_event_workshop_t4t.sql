-- 024: Event-level Training for Trainers flag for workshop curricula (Stage 5E)
-- Marriage Enrichment Workshop and Personal Growth Workshop may be marked
-- as a T4T delivery of their selected curriculum.
-- This does not create Event Types, facilitator products, or AAR series codes.
-- SafeTalk T4T and ASIST T4T remain their own Event Types and do not use this flag.
-- Existing Events stay false. This statement does not mark any Event as T4T.
-- Does not apply itself; review and run manually.

-- =============================================================================
-- Event-level T4T designation
-- False means the Event is not designated as Training for Trainers.
-- True is valid only for the two workshop Event Types.
-- =============================================================================

alter table public.events
  add column is_t4t boolean not null default false;

comment on column public.events.is_t4t is
  'Event-level Training for Trainers designation for Marriage Enrichment Workshop and Personal Growth Workshop. False for every other Event Type, including SafeTalk T4T and ASIST T4T. Does not rename a curriculum, create a product, or record attendance, completion, or qualification.';

-- =============================================================================
-- Reject T4T on an Event Type that is not a curriculum workshop.
-- False is valid everywhere. An invalid true is rejected, not cleared.
-- Renaming Marriage Enrichment Workshop or Personal Growth Workshop fails
-- while any Event of that type still has is_t4t true.
-- =============================================================================

create or replace function public.enforce_event_t4t_applicability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_t4t is not true then
    return new;
  end if;

  if new.event_type in (
    'Marriage Enrichment Workshop',
    'Personal Growth Workshop'
  ) then
    return new;
  end if;

  raise exception
    'Event-level T4T is only valid for Marriage Enrichment Workshop and Personal Growth Workshop.';
end;
$$;

comment on function public.enforce_event_t4t_applicability() is
  'Allows is_t4t false for every Event Type. Allows is_t4t true only for Marriage Enrichment Workshop and Personal Growth Workshop. Rejects every other true value, including SafeTalk T4T and ASIST T4T. Does not clear the flag and does not change curriculum_product_id.';

create trigger events_t4t_applicability
  before insert or update of event_type, is_t4t
  on public.events
  for each row
  execute function public.enforce_event_t4t_applicability();

revoke all on function public.enforce_event_t4t_applicability() from public, anon;
grant execute on function public.enforce_event_t4t_applicability() to authenticated;

-- =============================================================================
-- Derived facilitator tokens
-- Same product credit as Migration 023. is_t4t travels with the Event.
-- A T4T workshop still credits the canonical curriculum, not a new product.
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
  end as product_id,
  event.is_t4t
from public.events event
cross join lateral public.split_facilitator_tokens(event.facilitators) as token(token)
cross join lateral public.facilitator_token_resolution(token.token) as resolution
left join public.event_types event_type
  on event_type.name = event.event_type
left join public.facilitator_event_type_products mapping
  on mapping.event_type_id = event_type.id;

comment on view public.facilitator_event_tokens is
  'Recorded facilitator tokens from events.facilitators. Direct Event Types credit their mapped product. Workshop Event Types credit only a selected allowed curriculum. A null curriculum credits no product. is_t4t is the Event flag and is not a product, attendance record, or qualification.';

notify pgrst, 'reload schema';
