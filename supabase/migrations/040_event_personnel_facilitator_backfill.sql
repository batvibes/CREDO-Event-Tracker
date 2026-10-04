-- 040: Backfill facilitator relationships into event_personnel
-- Reads events.facilitators through split_facilitator_tokens and
-- facilitator_token_resolution, the same exact display, personal-name,
-- and alias match already used by facilitator_event_tokens.
-- Stores that token as source_text and its source order as position.
-- Inserts role = facilitator only. contact_email stays null.
-- Does not rewrite events.facilitators, events.poc, or events.credo_staff.
-- Does not create people, delete rows, or replace facilitator experience.
-- Refuses to insert when any facilitator token is unresolved, ambiguous,
-- or repeated for the same canonical person on one event.
-- Does not apply itself; review and run manually.

do $backfill$
declare
  v_unresolved integer;
  v_ambiguous integer;
  v_unlinked integer;
  v_duplicate_people integer;
  v_position_gaps integer;
  v_conflicting integer;
  v_other_roles_before integer;
  v_other_roles_after integer;
  v_token_checksum_before text;
  v_token_checksum_after text;
  v_ordinary_before text;
  v_ordinary_after text;
  v_t4t_before text;
  v_t4t_after text;
  v_token_rows integer;
  v_link_rows integer;
  v_view_rows integer;
  v_missing integer;
  v_extra integer;
  v_duplicate_links integer;
begin
  execute $plan$
    create temporary table stage_2b_facilitator_tokens on commit drop as
    select
      event.id as event_id,
      resolution.person_id,
      token.token as source_text,
      (token.ordinality - 1)::integer as position,
      resolution.match_count
    from public.events event
    cross join lateral public.split_facilitator_tokens(event.facilitators)
      with ordinality as token(token, ordinality)
    cross join lateral public.facilitator_token_resolution(token.token) as resolution
  $plan$;

  select count(*) into v_unresolved
  from stage_2b_facilitator_tokens
  where match_count = 0;

  select count(*) into v_ambiguous
  from stage_2b_facilitator_tokens
  where match_count > 1;

  select count(*) into v_unlinked
  from stage_2b_facilitator_tokens
  where person_id is null or match_count is distinct from 1;

  if v_unresolved > 0 or v_ambiguous > 0 or v_unlinked > 0 then
    raise exception
      'Stage 2B refused to backfill facilitators. Unresolved tokens: %, ambiguous tokens: %, tokens without one canonical person: %.',
      v_unresolved, v_ambiguous, v_unlinked;
  end if;

  select count(*) into v_duplicate_people
  from (
    select event_id, person_id
    from stage_2b_facilitator_tokens
    group by event_id, person_id
    having count(*) > 1
  ) duplicates;

  if v_duplicate_people > 0 then
    raise exception
      'Stage 2B refused to backfill facilitators. % event and person pairs resolve more than once.',
      v_duplicate_people;
  end if;

  select count(*) into v_position_gaps
  from (
    select event_id
    from stage_2b_facilitator_tokens
    group by event_id
    having min(position) <> 0
       or max(position) <> count(*) - 1
       or count(*) <> count(distinct position)
  ) gaps;

  if v_position_gaps > 0 then
    raise exception
      'Stage 2B refused to backfill facilitators. % events do not have contiguous facilitator positions starting at 0.',
      v_position_gaps;
  end if;

  select count(*) into v_conflicting
  from public.event_personnel existing
  where existing.role = 'facilitator'
    and not exists (
      select 1
      from stage_2b_facilitator_tokens planned
      where planned.event_id = existing.event_id
        and planned.position = existing.position
        and planned.person_id = existing.person_id
        and planned.source_text = existing.source_text
        and existing.contact_email is null
    );

  if v_conflicting > 0 then
    raise exception
      'Stage 2B refused to backfill facilitators. % existing facilitator rows do not match the historical tokens.',
      v_conflicting;
  end if;

  select count(*) into v_other_roles_before
  from public.event_personnel
  where role in ('poc', 'credo_staff');

  select md5(coalesce(string_agg(
    event_id::text || '|' || facilitator_token || '|' || coalesce(person_id::text, '') || '|' || match_count::text,
    ',' order by event_id, facilitator_token, person_id, match_count
  ), ''))
  into v_token_checksum_before
  from public.facilitator_event_tokens;

  select md5(coalesce(string_agg(
    person_id::text || '|' || product_id::text || '|' || events_conducted::text
      || '|' || coalesce(first_recorded_facilitation_on::text, '')
      || '|' || coalesce(most_recent_facilitation_on::text, ''),
    ',' order by person_id, product_id
  ), ''))
  into v_ordinary_before
  from public.facilitator_product_experience;

  select md5(coalesce(string_agg(
    person_id::text || '|' || product_id::text || '|' || events_conducted::text
      || '|' || coalesce(first_recorded_facilitation_on::text, '')
      || '|' || coalesce(most_recent_facilitation_on::text, ''),
    ',' order by person_id, product_id
  ), ''))
  into v_t4t_before
  from public.facilitator_t4t_product_experience;

  insert into public.event_personnel (
    event_id,
    person_id,
    role,
    source_text,
    contact_email,
    position
  )
  select
    planned.event_id,
    planned.person_id,
    'facilitator',
    planned.source_text,
    null,
    planned.position
  from stage_2b_facilitator_tokens planned
  where not exists (
    select 1
    from public.event_personnel existing
    where existing.event_id = planned.event_id
      and existing.role = 'facilitator'
      and existing.position = planned.position
  );

  select count(*) into v_token_rows from stage_2b_facilitator_tokens;
  select count(*) into v_link_rows
  from public.event_personnel
  where role = 'facilitator';
  select count(*) into v_view_rows from public.facilitator_event_tokens;

  if v_link_rows <> v_token_rows or v_link_rows <> v_view_rows then
    raise exception
      'Stage 2B facilitator parity failed. event_personnel rows: %, split tokens: %, facilitator_event_tokens rows: %.',
      v_link_rows, v_token_rows, v_view_rows;
  end if;

  select count(*) into v_missing
  from public.facilitator_event_tokens token
  where not exists (
    select 1
    from public.event_personnel link
    where link.event_id = token.event_id
      and link.role = 'facilitator'
      and link.person_id = token.person_id
      and link.source_text = token.facilitator_token
      and link.contact_email is null
  );

  select count(*) into v_extra
  from public.event_personnel link
  where link.role = 'facilitator'
    and not exists (
      select 1
      from public.facilitator_event_tokens token
      where token.event_id = link.event_id
        and token.person_id = link.person_id
        and token.facilitator_token = link.source_text
    );

  if v_missing > 0 or v_extra > 0 then
    raise exception
      'Stage 2B facilitator parity failed. Tokens missing from event_personnel: %, facilitator rows absent from facilitator_event_tokens: %.',
      v_missing, v_extra;
  end if;

  select count(*) into v_duplicate_links
  from (
    select event_id, person_id, role
    from public.event_personnel
    where role = 'facilitator'
      and person_id is not null
    group by event_id, person_id, role
    having count(*) > 1
  ) duplicates;

  if v_duplicate_links > 0 then
    raise exception
      'Stage 2B facilitator parity failed. % duplicate facilitator person links exist.',
      v_duplicate_links;
  end if;

  select count(*) into v_other_roles_after
  from public.event_personnel
  where role in ('poc', 'credo_staff');

  if v_other_roles_after <> v_other_roles_before then
    raise exception
      'Stage 2B changed non-facilitator event personnel rows. Before: %, after: %.',
      v_other_roles_before, v_other_roles_after;
  end if;

  select md5(coalesce(string_agg(
    event_id::text || '|' || facilitator_token || '|' || coalesce(person_id::text, '') || '|' || match_count::text,
    ',' order by event_id, facilitator_token, person_id, match_count
  ), ''))
  into v_token_checksum_after
  from public.facilitator_event_tokens;

  select md5(coalesce(string_agg(
    person_id::text || '|' || product_id::text || '|' || events_conducted::text
      || '|' || coalesce(first_recorded_facilitation_on::text, '')
      || '|' || coalesce(most_recent_facilitation_on::text, ''),
    ',' order by person_id, product_id
  ), ''))
  into v_ordinary_after
  from public.facilitator_product_experience;

  select md5(coalesce(string_agg(
    person_id::text || '|' || product_id::text || '|' || events_conducted::text
      || '|' || coalesce(first_recorded_facilitation_on::text, '')
      || '|' || coalesce(most_recent_facilitation_on::text, ''),
    ',' order by person_id, product_id
  ), ''))
  into v_t4t_after
  from public.facilitator_t4t_product_experience;

  if v_token_checksum_after is distinct from v_token_checksum_before
     or v_ordinary_after is distinct from v_ordinary_before
     or v_t4t_after is distinct from v_t4t_before then
    raise exception
      'Stage 2B changed facilitator token or experience totals.';
  end if;
end
$backfill$;
