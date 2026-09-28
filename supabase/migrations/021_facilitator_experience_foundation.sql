-- 021: Facilitator experience foundation (Stage 3B)
-- Read-only evidence from existing Event facilitator text.
-- Does not write public.events, public.people, public.team_members,
-- public.facilitator_qualifications, or public.facilitator_event_type_products.
-- Does not seed Event Type mappings. An Event counts toward a product only
-- when an explicit facilitator_event_type_products row exists.
-- Does not create qualifications, aliases, or people.
-- Does not apply itself; review and run manually.
--
-- Eligibility:
-- public.events has no facilitation-completion, cancellation, or archive state.
-- AAR finalization and the reservation/catering/packout/roster workflow are
-- separate from facilitator experience, so they are not used as filters.
-- Hard-deleted Events are already absent.
-- Historical conducted experience requires an explicit product mapping, one
-- unambiguous facilitator identity, and a recorded start date on or before
-- today. Future, TBD, blank, and invalid dates remain on the token and
-- unresolved views and do not count as conducted.
-- first_recorded_facilitation_on is derived history. It does not replace
-- facilitator_qualifications.first_facilitated_on.

-- =============================================================================
-- Facilitator token split
-- Matches the Event editor: commas separate tokens, commas inside <...> do not.
-- =============================================================================

create or replace function public.split_facilitator_tokens(p_raw text)
returns setof text
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text := coalesce(p_raw, '');
  v_current text := '';
  v_in_angles boolean := false;
  v_index integer := 1;
  v_char text;
  v_part text;
begin
  if btrim(v_text) = '' then
    return;
  end if;

  while v_index <= char_length(v_text) loop
    v_char := substr(v_text, v_index, 1);
    if v_char = '<' then
      v_in_angles := true;
    elsif v_char = '>' then
      v_in_angles := false;
    end if;

    if v_char = ',' and not v_in_angles then
      v_part := public.clean_reference_display_name(v_current);
      if v_part <> '' then
        return next v_part;
      end if;
      v_current := '';
    else
      v_current := v_current || v_char;
    end if;
    v_index := v_index + 1;
  end loop;

  v_part := public.clean_reference_display_name(v_current);
  if v_part <> '' then
    return next v_part;
  end if;
end;
$$;

comment on function public.split_facilitator_tokens(text) is
  'Splits events.facilitators with the same comma rule the Event editor uses.';

-- =============================================================================
-- Recorded facilitation date
-- Uses start_date, and date only when start_date is null or blank.
-- Accepts only an exact YYYY-MM-DD calendar date. TBD yields no date.
-- =============================================================================

create or replace function public.facilitator_event_date(
  p_start_date text,
  p_date text
)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_raw text;
  v_iso text;
  v_parsed date;
begin
  if p_start_date is null or public.clean_reference_display_name(p_start_date) = '' then
    v_raw := public.clean_reference_display_name(p_date);
  else
    v_raw := public.clean_reference_display_name(p_start_date);
  end if;

  if v_raw = '' or v_raw = 'TBD' then
    return null;
  end if;

  v_iso := left(v_raw, 10);
  if v_iso !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;

  begin
    v_parsed := v_iso::date;
  exception
    when others then
      return null;
  end;

  if to_char(v_parsed, 'YYYY-MM-DD') is distinct from v_iso then
    return null;
  end if;

  return v_parsed;
end;
$$;

comment on function public.facilitator_event_date(text, text) is
  'Event start date as a calendar date. TBD and non-ISO text produce null.';

-- =============================================================================
-- Exact identity resolution
-- One person only: current display name, a distinct personal name, or one alias.
-- Zero matches and more than one match both stay unresolved.
-- =============================================================================

create or replace function public.facilitator_token_resolution(p_token text)
returns table (person_id uuid, match_count integer)
language sql
stable
set search_path = public
as $$
  with candidates as (
    select person.id as candidate_id
    from public.people person
    where public.normalize_reference_name(public.personnel_display_name(person.rank_title, person.name))
          = public.normalize_reference_name(p_token)
       or (
         public.normalize_reference_name(person.name)
           is distinct from public.normalize_reference_name(public.personnel_display_name(person.rank_title, person.name))
         and public.normalize_reference_name(person.name) = public.normalize_reference_name(p_token)
       )
    union
    select alias.person_id
    from public.people_name_aliases alias
    where alias.normalized_name = public.normalize_reference_name(p_token)
  )
  select
    case when count(*) = 1 then (array_agg(candidates.candidate_id))[1] else null::uuid end,
    count(*)::integer
  from candidates;
$$;

comment on function public.facilitator_token_resolution(text) is
  'Resolves one facilitator token to a person only when exactly one current display, personal name, or alias matches. Does not use partial or approximate text.';

-- =============================================================================
-- One row per recorded facilitator token
-- product_id is null until an explicit Event Type mapping exists.
-- person_id is null when the token is unmatched or ambiguous.
-- =============================================================================

create view public.facilitator_event_tokens
with (security_invoker = true) as
select
  event.id as event_id,
  event.event_type,
  token.token as facilitator_token,
  public.facilitator_event_date(event.start_date, event.date) as recorded_on,
  resolution.person_id,
  resolution.match_count,
  mapping.product_id
from public.events event
cross join lateral public.split_facilitator_tokens(event.facilitators) as token(token)
cross join lateral public.facilitator_token_resolution(token.token) as resolution
left join public.event_types event_type
  on event_type.name = event.event_type
left join public.facilitator_event_type_products mapping
  on mapping.event_type_id = event_type.id;

comment on view public.facilitator_event_tokens is
  'Recorded facilitator tokens. Product credit exists only through facilitator_event_type_products. Unmatched and ambiguous tokens have a null person_id.';

-- =============================================================================
-- Product experience
-- Derived evidence only. This is not a qualification.
-- =============================================================================

create view public.facilitator_product_experience
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
group by token.person_id, token.product_id;

comment on view public.facilitator_product_experience is
  'Historical conducted facilitation. Requires an explicit product mapping, one unambiguous person, and a recorded date on or before today. Future and undated assignments stay on the token view. Does not create or change qualifications.';

-- =============================================================================
-- Unresolved historical tokens, for human review
-- match_count 0 is unmatched. match_count greater than 1 is ambiguous.
-- =============================================================================

create view public.facilitator_unresolved_history
with (security_invoker = true) as
select
  token.facilitator_token,
  token.match_count,
  count(distinct token.event_id)::integer as event_count,
  min(token.recorded_on) as earliest_recorded_on,
  max(token.recorded_on) as latest_recorded_on
from public.facilitator_event_tokens token
where token.match_count is distinct from 1
group by token.facilitator_token, token.match_count;

comment on view public.facilitator_unresolved_history is
  'Facilitator text that does not resolve to exactly one person. Does not create people or aliases.';

revoke all on function public.split_facilitator_tokens(text) from public, anon;
revoke all on function public.facilitator_event_date(text, text) from public, anon;
revoke all on function public.facilitator_token_resolution(text) from public, anon;
grant execute on function public.split_facilitator_tokens(text) to authenticated;
grant execute on function public.facilitator_event_date(text, text) to authenticated;
grant execute on function public.facilitator_token_resolution(text) to authenticated;

revoke all on table public.facilitator_event_tokens from public, anon, authenticated;
revoke all on table public.facilitator_product_experience from public, anon, authenticated;
revoke all on table public.facilitator_unresolved_history from public, anon, authenticated;
grant select on table public.facilitator_event_tokens to authenticated;
grant select on table public.facilitator_product_experience to authenticated;
grant select on table public.facilitator_unresolved_history to authenticated;

notify pgrst, 'reload schema';
