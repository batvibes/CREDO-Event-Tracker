-- 025: Separate ordinary facilitation from T4T facilitation
-- facilitator_product_experience keeps ordinary, non-T4T deliveries only.
-- facilitator_t4t_product_experience is the read-only aggregate for Events
-- whose facilitator text proves the person facilitated a T4T delivery.
-- Curriculum workshop T4Ts use events.is_t4t and the curriculum product
-- already credited by facilitator_event_tokens.
-- SafeTalk T4T and ASIST T4T are dedicated Event Types. They count here
-- without events.is_t4t, and they stay on their own products.
-- One Event is in only one aggregate. This does not write Events,
-- qualifications, people, or product mappings.
-- Does not apply itself; review and run manually.

-- =============================================================================
-- Ordinary facilitation
-- Same columns and eligibility as Migration 021.
-- Ordinary is the complement of the T4T classification.
-- A null event_type is not a dedicated T4T type and stays ordinary
-- unless is_t4t is true.
-- A workshop with no selected curriculum still has a null product and
-- contributes nothing, whether or not is_t4t is true.
-- =============================================================================

create or replace view public.facilitator_product_experience
with (security_invoker = true) as
select
  token.person_id,
  token.product_id,
  count(distinct token.event_id)::integer as events_conducted,
  min(token.recorded_on) as first_recorded_facilitation_on,
  max(token.recorded_on) as most_recent_facilitation_on
from public.facilitator_event_tokens token
where token.person_id is not null
  and token.product_id is not null
  and token.recorded_on is not null
  and token.recorded_on <= current_date
  and not (
    token.is_t4t is true
    or coalesce(token.event_type, '') in ('SafeTalk T4T', 'ASIST T4T')
  )
group by token.person_id, token.product_id;

comment on view public.facilitator_product_experience is
  'Ordinary conducted facilitation. Excludes curriculum Events with is_t4t true and the dedicated SafeTalk T4T and ASIST T4T Event Types. Requires one unambiguous person, a resolved product, and a recorded date on or before today. Does not create or change qualifications.';

-- =============================================================================
-- T4T facilitation
-- Evidence that a resolved facilitator was listed on a T4T delivery.
-- This is not T4T attendance and it does not write a qualification.
-- Curriculum product identity stays the token product_id, so every allowed
-- workshop curriculum is included without a product list in this view.
-- =============================================================================

create or replace view public.facilitator_t4t_product_experience
with (security_invoker = true) as
select
  token.person_id,
  token.product_id,
  count(distinct token.event_id)::integer as events_conducted,
  min(token.recorded_on) as first_recorded_facilitation_on,
  max(token.recorded_on) as most_recent_facilitation_on
from public.facilitator_event_tokens token
where token.person_id is not null
  and token.product_id is not null
  and token.recorded_on is not null
  and token.recorded_on <= current_date
  and (
    token.is_t4t is true
    or token.event_type in ('SafeTalk T4T', 'ASIST T4T')
  )
group by token.person_id, token.product_id;

comment on view public.facilitator_t4t_product_experience is
  'T4T deliveries facilitated by a resolved person. Curriculum workshops count when is_t4t is true and the selected allowed curriculum is the product. SafeTalk T4T and ASIST T4T count from their Event Type mapping without is_t4t. Does not record attendance, completion, standing, or trainer authority.';

revoke all on table public.facilitator_product_experience from public, anon, authenticated;
revoke all on table public.facilitator_t4t_product_experience from public, anon, authenticated;
grant select on table public.facilitator_product_experience to authenticated;
grant select on table public.facilitator_t4t_product_experience to authenticated;

notify pgrst, 'reload schema';
