-- 042: Backfill CREDO Staff relationships into event_personnel
-- Splits events.credo_staff with the Event editor's comma rule.
-- source_text is the trimmed historical token. match_name is cleaned only
-- for the same exact display, personal-name, and alias resolution used
-- elsewhere. A unique person is linked. An unmatched token is stored with
-- person_id null. An ambiguous token stops the migration.
-- Inserts role = credo_staff only. contact_email stays null.
-- Records RPSN Palomino as an alias of the existing Kimberly Palomino person
-- so the exact resolver links those staff tokens. Does not create a person.
-- Does not update events.credo_staff, events.facilitators, or events.poc.
-- Does not apply itself; review and run manually.

create or replace function public.split_credo_staff_tokens(p_raw text)
returns table (
  token_position integer,
  source_text text,
  match_name text
)
language plpgsql
stable
set search_path = public
as $function$
declare
  v_text text := btrim(coalesce(p_raw, ''));
  v_current text := '';
  v_parts text[] := array[]::text[];
  v_in_angles boolean := false;
  v_index integer := 1;
  v_char text;
  v_part text;
  v_position integer := 0;
begin
  if v_text = '' then
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
      v_part := btrim(v_current);
      if v_part <> '' then
        v_parts := array_append(v_parts, v_part);
      end if;
      v_current := '';
    else
      v_current := v_current || v_char;
    end if;
    v_index := v_index + 1;
  end loop;

  v_part := btrim(v_current);
  if v_part <> '' then
    v_parts := array_append(v_parts, v_part);
  end if;

  foreach v_part in array v_parts loop
    token_position := v_position;
    source_text := v_part;
    match_name := public.clean_reference_display_name(v_part);
    return next;
    v_position := v_position + 1;
  end loop;
end;
$function$;

comment on function public.split_credo_staff_tokens(text) is
  'Splits events.credo_staff the way the Event editor does. source_text keeps the trimmed historical token. match_name is the cleaned text used for exact identity resolution.';

revoke all on function public.split_credo_staff_tokens(text) from public, anon;
grant execute on function public.split_credo_staff_tokens(text) to authenticated;

-- Verified identity: RPSN Palomino is the existing RP3 Kimberly Palomino.
-- Lookup is by her canonical name, not by event id.
do $palomino$
declare
  v_person_id uuid;
  v_display text;
  v_count integer;
begin
  select count(*)
    into v_count
  from public.people person
  where public.normalize_reference_name(person.name) = 'kimberly palomino'
    and public.normalize_reference_name(person.last_name) = 'palomino';

  if v_count <> 1 then
    raise exception
      'Stage 2D expected one Kimberly Palomino record and found %.',
      v_count;
  end if;

  select person.id,
         public.personnel_display_name(person.rank_title, person.name)
    into v_person_id, v_display
  from public.people person
  where public.normalize_reference_name(person.name) = 'kimberly palomino'
    and public.normalize_reference_name(person.last_name) = 'palomino';

  perform public.remember_personnel_display_alias(
    v_person_id,
    'RPSN Palomino',
    v_display
  );
end
$palomino$;

do $backfill$
declare
  v_ambiguous integer;
  v_inconsistent integer;
  v_blank_names integer;
  v_resolved integer;
  v_unresolved integer;
  v_duplicate_people integer;
  v_position_gaps integer;
  v_conflicting integer;
  v_unsplit integer;
  v_plan_rows integer;
  v_split_rows integer;
  v_facilitators_before integer;
  v_facilitators_after integer;
  v_poc_before integer;
  v_poc_after integer;
  v_facilitator_rows_before text;
  v_facilitator_rows_after text;
  v_poc_rows_before text;
  v_poc_rows_after text;
  v_staff_text_before text;
  v_staff_text_after text;
  v_token_checksum_before text;
  v_token_checksum_after text;
  v_ordinary_before text;
  v_ordinary_after text;
  v_t4t_before text;
  v_t4t_after text;
  v_link_rows integer;
  v_linked_rows integer;
  v_null_rows integer;
  v_email_rows integer;
  v_missing integer;
  v_extra integer;
  v_duplicate_links integer;
  v_facilitator_missing integer;
  v_facilitator_extra integer;
begin
  execute $plan$
    create temporary table stage_2d_staff_tokens on commit drop as
    select
      event.id as event_id,
      planned.token_position as position,
      planned.source_text,
      planned.match_name,
      resolution.person_id,
      resolution.match_count
    from public.events event
    cross join lateral public.split_credo_staff_tokens(event.credo_staff) as planned
    cross join lateral public.facilitator_token_resolution(planned.match_name) as resolution
  $plan$;

  select count(*) into v_blank_names
  from stage_2d_staff_tokens
  where btrim(coalesce(match_name, '')) = '';

  select count(*) into v_ambiguous
  from stage_2d_staff_tokens
  where match_count > 1;

  select count(*) into v_inconsistent
  from stage_2d_staff_tokens
  where match_count is null
     or match_count < 0
     or (match_count = 1 and person_id is null)
     or (match_count = 0 and person_id is not null);

  if v_blank_names > 0 or v_ambiguous > 0 or v_inconsistent > 0 then
    raise exception
      'Stage 2D refused to backfill CREDO Staff. Blank names: %, ambiguous tokens: %, inconsistent resolutions: %.',
      v_blank_names, v_ambiguous, v_inconsistent;
  end if;

  select count(*) into v_resolved
  from stage_2d_staff_tokens
  where match_count = 1
    and person_id is not null;

  select count(*) into v_unresolved
  from stage_2d_staff_tokens
  where match_count = 0
    and person_id is null;

  select count(*) into v_duplicate_people
  from (
    select event_id, person_id
    from stage_2d_staff_tokens
    where person_id is not null
    group by event_id, person_id
    having count(*) > 1
  ) duplicates;

  if v_duplicate_people > 0 then
    raise exception
      'Stage 2D refused to backfill CREDO Staff. % event and person pairs resolve more than once.',
      v_duplicate_people;
  end if;

  select count(*) into v_position_gaps
  from (
    select event_id
    from stage_2d_staff_tokens
    group by event_id
    having min(position) <> 0
       or max(position) <> count(*) - 1
       or count(*) <> count(distinct position)
  ) gaps;

  if v_position_gaps > 0 then
    raise exception
      'Stage 2D refused to backfill CREDO Staff. % events do not have contiguous staff positions starting at 0.',
      v_position_gaps;
  end if;

  select count(*) into v_unsplit
  from public.events event
  where btrim(coalesce(event.credo_staff, '')) <> ''
    and not exists (
      select 1
      from public.split_credo_staff_tokens(event.credo_staff) as token
    );

  select count(*) into v_plan_rows from stage_2d_staff_tokens;
  select count(*) into v_split_rows
  from public.events event
  cross join lateral public.split_credo_staff_tokens(event.credo_staff) as token;

  if v_unsplit > 0 or v_plan_rows <> v_split_rows or v_resolved + v_unresolved <> v_plan_rows then
    raise exception
      'Stage 2D refused to backfill CREDO Staff. Unsplit fields: %, planned tokens: %, splitter tokens: %, resolved: %, unresolved: %.',
      v_unsplit, v_plan_rows, v_split_rows, v_resolved, v_unresolved;
  end if;

  select count(*) into v_conflicting
  from public.event_personnel existing
  where existing.role = 'credo_staff'
    and not exists (
      select 1
      from stage_2d_staff_tokens planned
      where planned.event_id = existing.event_id
        and planned.position = existing.position
        and existing.person_id is not distinct from planned.person_id
        and planned.source_text = existing.source_text
        and existing.contact_email is null
    );

  if v_conflicting > 0 then
    raise exception
      'Stage 2D refused to backfill CREDO Staff. % existing staff rows do not match the historical tokens.',
      v_conflicting;
  end if;

  select count(*) into v_facilitators_before
  from public.event_personnel
  where role = 'facilitator';

  select count(*) into v_poc_before
  from public.event_personnel
  where role = 'poc';

  if v_facilitators_before <> 352 or v_poc_before <> 295 then
    raise exception
      'Stage 2D expected 352 facilitator rows and 295 POC rows. Found facilitator: %, POC: %.',
      v_facilitators_before, v_poc_before;
  end if;

  select md5(coalesce(string_agg(
    event_id::text || '|' || person_id::text || '|' || source_text || '|' || coalesce(contact_email, '') || '|' || position::text,
    ',' order by event_id, position
  ), ''))
  into v_facilitator_rows_before
  from public.event_personnel
  where role = 'facilitator';

  select md5(coalesce(string_agg(
    event_id::text || '|' || person_id::text || '|' || source_text || '|' || coalesce(contact_email, '') || '|' || position::text,
    ',' order by event_id, position
  ), ''))
  into v_poc_rows_before
  from public.event_personnel
  where role = 'poc';

  select md5(coalesce(string_agg(
    id::text || '|' || coalesce(credo_staff, ''),
    ',' order by id
  ), ''))
  into v_staff_text_before
  from public.events;

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
    'credo_staff',
    planned.source_text,
    null,
    planned.position
  from stage_2d_staff_tokens planned
  where not exists (
    select 1
    from public.event_personnel existing
    where existing.event_id = planned.event_id
      and existing.role = 'credo_staff'
      and existing.position = planned.position
  );

  select count(*) into v_link_rows
  from public.event_personnel
  where role = 'credo_staff';

  select count(*) into v_linked_rows
  from public.event_personnel
  where role = 'credo_staff'
    and person_id is not null;

  select count(*) into v_null_rows
  from public.event_personnel
  where role = 'credo_staff'
    and person_id is null;

  select count(*) into v_email_rows
  from public.event_personnel
  where role = 'credo_staff'
    and contact_email is not null;

  if v_link_rows <> v_plan_rows
     or v_linked_rows <> v_resolved
     or v_null_rows <> v_unresolved
     or v_email_rows <> 0 then
    raise exception
      'Stage 2D staff parity failed. Rows: %, tokens: %, linked: %, resolved: %, unresolved rows: %, unresolved tokens: %, emails: %.',
      v_link_rows, v_plan_rows, v_linked_rows, v_resolved, v_null_rows, v_unresolved, v_email_rows;
  end if;

  select count(*) into v_missing
  from stage_2d_staff_tokens planned
  where not exists (
    select 1
    from public.event_personnel link
    where link.event_id = planned.event_id
      and link.role = 'credo_staff'
      and link.position = planned.position
      and link.person_id is not distinct from planned.person_id
      and link.source_text = planned.source_text
      and link.contact_email is null
  );

  select count(*) into v_extra
  from public.event_personnel link
  where link.role = 'credo_staff'
    and not exists (
      select 1
      from stage_2d_staff_tokens planned
      where planned.event_id = link.event_id
        and planned.position = link.position
        and link.person_id is not distinct from planned.person_id
        and planned.source_text = link.source_text
        and planned.match_count <= 1
    );

  if v_missing > 0 or v_extra > 0 then
    raise exception
      'Stage 2D staff parity failed. Tokens missing from event_personnel: %, staff rows absent from the source tokens: %.',
      v_missing, v_extra;
  end if;

  select count(*) into v_duplicate_links
  from (
    select event_id, person_id, role
    from public.event_personnel
    where role = 'credo_staff'
      and person_id is not null
    group by event_id, person_id, role
    having count(*) > 1
  ) duplicates;

  if v_duplicate_links > 0 then
    raise exception
      'Stage 2D staff parity failed. % duplicate staff person links exist.',
      v_duplicate_links;
  end if;

  select count(*) into v_facilitators_after
  from public.event_personnel
  where role = 'facilitator';

  select count(*) into v_poc_after
  from public.event_personnel
  where role = 'poc';

  select md5(coalesce(string_agg(
    event_id::text || '|' || person_id::text || '|' || source_text || '|' || coalesce(contact_email, '') || '|' || position::text,
    ',' order by event_id, position
  ), ''))
  into v_facilitator_rows_after
  from public.event_personnel
  where role = 'facilitator';

  select md5(coalesce(string_agg(
    event_id::text || '|' || person_id::text || '|' || source_text || '|' || coalesce(contact_email, '') || '|' || position::text,
    ',' order by event_id, position
  ), ''))
  into v_poc_rows_after
  from public.event_personnel
  where role = 'poc';

  select md5(coalesce(string_agg(
    id::text || '|' || coalesce(credo_staff, ''),
    ',' order by id
  ), ''))
  into v_staff_text_after
  from public.events;

  select count(*) into v_facilitator_missing
  from public.facilitator_event_tokens token
  where not exists (
    select 1
    from public.event_personnel link
    where link.role = 'facilitator'
      and link.event_id = token.event_id
      and link.person_id = token.person_id
      and link.source_text = token.facilitator_token
  );

  select count(*) into v_facilitator_extra
  from public.event_personnel link
  where link.role = 'facilitator'
    and not exists (
      select 1
      from public.facilitator_event_tokens token
      where token.event_id = link.event_id
        and token.person_id = link.person_id
        and token.facilitator_token = link.source_text
    );

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

  if v_facilitators_after <> 352
     or v_facilitators_after <> v_facilitators_before
     or v_poc_after <> 295
     or v_poc_after <> v_poc_before
     or v_facilitator_rows_after is distinct from v_facilitator_rows_before
     or v_poc_rows_after is distinct from v_poc_rows_before
     or v_staff_text_after is distinct from v_staff_text_before
     or v_facilitator_missing > 0
     or v_facilitator_extra > 0
     or v_token_checksum_after is distinct from v_token_checksum_before
     or v_ordinary_after is distinct from v_ordinary_before
     or v_t4t_after is distinct from v_t4t_before then
    raise exception
      'Stage 2D changed facilitator rows, POC rows, events.credo_staff, or facilitator experience totals.';
  end if;
end
$backfill$;

-- Review queue for staff tokens that stayed unresolved.
-- Events have event_type and a date. They do not have a separate title.
create view public.event_personnel_unresolved_credo_staff
with (security_invoker = true) as
select
  link.id,
  link.event_id,
  event.event_type,
  case
    when public.clean_reference_display_name(coalesce(event.start_date, '')) <> ''
      then event.start_date
    else event.date
  end as event_date,
  link.source_text,
  link.position
from public.event_personnel link
join public.events event
  on event.id = link.event_id
where link.role = 'credo_staff'
  and link.person_id is null;

comment on view public.event_personnel_unresolved_credo_staff is
  'CREDO Staff event relationships whose historical token did not resolve to one canonical person. source_text is the review text. This view does not create people or aliases.';

revoke all on table public.event_personnel_unresolved_credo_staff from public;
revoke all on table public.event_personnel_unresolved_credo_staff from anon;
revoke all on table public.event_personnel_unresolved_credo_staff from authenticated;
grant select on table public.event_personnel_unresolved_credo_staff to authenticated;

notify pgrst, 'reload schema';
