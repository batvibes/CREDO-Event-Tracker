-- 041: Backfill point-of-contact relationships into event_personnel
-- Splits events.poc with the Event editor's comma rule: commas inside
-- angle brackets stay inside the token. Each token is trimmed, and its
-- internal text is kept as source_text.
-- A trailing <email> is copied to contact_email. The name beside that
-- wrapper is what exact display, personal-name, and alias resolution sees.
-- Inserts role = poc only. Facilitator and CREDO Staff rows stay as they are.
-- Does not update events.poc, events.facilitators, or events.credo_staff.
-- Does not create people, aliases, or directory email changes.
-- Does not apply itself; review and run manually.

create or replace function public.split_poc_tokens(p_raw text)
returns table (
  token_position integer,
  source_text text,
  contact_email text,
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
  v_match text[];
  v_name text;
  v_email text;
  v_candidate_name text;
  v_candidate_email text;
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
    v_email := null;
    v_name := public.clean_reference_display_name(v_part);
    v_match := regexp_match(v_part, '^(.+?)\s*<([^<>]+)>\s*$');
    if v_match is not null then
      v_candidate_name := public.clean_reference_display_name(v_match[1]);
      v_candidate_email := btrim(v_match[2]);
      if v_candidate_name <> ''
         and v_candidate_email ~ '^[^[:space:]<>,]+@[^[:space:]<>,]+$' then
        v_name := v_candidate_name;
        v_email := v_candidate_email;
      end if;
    end if;

    token_position := v_position;
    source_text := v_part;
    contact_email := v_email;
    match_name := v_name;
    return next;
    v_position := v_position + 1;
  end loop;
end;
$function$;

comment on function public.split_poc_tokens(text) is
  'Splits events.poc the way the Event editor does. source_text is the trimmed historical token. A valid trailing angle-bracket email is returned separately, and match_name is the name used for exact identity resolution.';

revoke all on function public.split_poc_tokens(text) from public, anon;
grant execute on function public.split_poc_tokens(text) to authenticated;

do $backfill$
declare
  v_unresolved integer;
  v_ambiguous integer;
  v_unlinked integer;
  v_blank_names integer;
  v_duplicate_people integer;
  v_position_gaps integer;
  v_conflicting integer;
  v_unsplit integer;
  v_plan_rows integer;
  v_split_rows integer;
  v_email_mismatch integer;
  v_facilitators_before integer;
  v_facilitators_after integer;
  v_staff_before integer;
  v_staff_after integer;
  v_facilitator_rows_before text;
  v_facilitator_rows_after text;
  v_poc_text_before text;
  v_poc_text_after text;
  v_token_checksum_before text;
  v_token_checksum_after text;
  v_ordinary_before text;
  v_ordinary_after text;
  v_t4t_before text;
  v_t4t_after text;
  v_link_rows integer;
  v_missing integer;
  v_extra integer;
  v_duplicate_links integer;
  v_facilitator_missing integer;
  v_facilitator_extra integer;
begin
  execute $plan$
    create temporary table stage_2c_poc_tokens on commit drop as
    select
      event.id as event_id,
      planned.token_position as position,
      planned.source_text,
      planned.contact_email,
      planned.match_name,
      resolution.person_id,
      resolution.match_count
    from public.events event
    cross join lateral public.split_poc_tokens(event.poc) as planned
    cross join lateral public.facilitator_token_resolution(planned.match_name) as resolution
  $plan$;

  select count(*) into v_blank_names
  from stage_2c_poc_tokens
  where btrim(coalesce(match_name, '')) = '';

  select count(*) into v_unresolved
  from stage_2c_poc_tokens
  where match_count = 0;

  select count(*) into v_ambiguous
  from stage_2c_poc_tokens
  where match_count > 1;

  select count(*) into v_unlinked
  from stage_2c_poc_tokens
  where person_id is null or match_count is distinct from 1;

  if v_blank_names > 0 or v_unresolved > 0 or v_ambiguous > 0 or v_unlinked > 0 then
    raise exception
      'Stage 2C refused to backfill points of contact. Blank names: %, unresolved tokens: %, ambiguous tokens: %, tokens without one canonical person: %.',
      v_blank_names, v_unresolved, v_ambiguous, v_unlinked;
  end if;

  select count(*) into v_duplicate_people
  from (
    select event_id, person_id
    from stage_2c_poc_tokens
    group by event_id, person_id
    having count(*) > 1
  ) duplicates;

  if v_duplicate_people > 0 then
    raise exception
      'Stage 2C refused to backfill points of contact. % event and person pairs resolve more than once.',
      v_duplicate_people;
  end if;

  select count(*) into v_position_gaps
  from (
    select event_id
    from stage_2c_poc_tokens
    group by event_id
    having min(position) <> 0
       or max(position) <> count(*) - 1
       or count(*) <> count(distinct position)
  ) gaps;

  if v_position_gaps > 0 then
    raise exception
      'Stage 2C refused to backfill points of contact. % events do not have contiguous POC positions starting at 0.',
      v_position_gaps;
  end if;

  select count(*) into v_unsplit
  from public.events event
  where btrim(coalesce(event.poc, '')) <> ''
    and not exists (
      select 1
      from public.split_poc_tokens(event.poc) as token
    );

  select count(*) into v_plan_rows from stage_2c_poc_tokens;
  select count(*) into v_split_rows
  from public.events event
  cross join lateral public.split_poc_tokens(event.poc) as token;

  if v_unsplit > 0 or v_plan_rows <> v_split_rows then
    raise exception
      'Stage 2C refused to backfill points of contact. Unsplit POC fields: %, planned tokens: %, splitter tokens: %.',
      v_unsplit, v_plan_rows, v_split_rows;
  end if;

  select count(*) into v_email_mismatch
  from stage_2c_poc_tokens planned
  where (
    planned.contact_email is not null
    and strpos(planned.source_text, planned.contact_email) = 0
  ) or (
    planned.contact_email is null
    and planned.source_text ~ '<[^[:space:]<>,]+@[^[:space:]<>,]+>\s*$'
    and btrim(regexp_replace(planned.source_text, '\s*<[^<>]+>\s*$', '')) <> ''
  );

  if v_email_mismatch > 0 then
    raise exception
      'Stage 2C refused to backfill points of contact. % tokens do not keep the trailing email beside the original text.',
      v_email_mismatch;
  end if;

  select count(*) into v_conflicting
  from public.event_personnel existing
  where existing.role = 'poc'
    and not exists (
      select 1
      from stage_2c_poc_tokens planned
      where planned.event_id = existing.event_id
        and planned.position = existing.position
        and planned.person_id = existing.person_id
        and planned.source_text = existing.source_text
        and existing.contact_email is not distinct from planned.contact_email
    );

  if v_conflicting > 0 then
    raise exception
      'Stage 2C refused to backfill points of contact. % existing POC rows do not match the historical tokens.',
      v_conflicting;
  end if;

  select count(*) into v_facilitators_before
  from public.event_personnel
  where role = 'facilitator';

  if v_facilitators_before <> 352 then
    raise exception
      'Stage 2C expected 352 facilitator rows and found %.',
      v_facilitators_before;
  end if;

  select count(*) into v_staff_before
  from public.event_personnel
  where role = 'credo_staff';

  select md5(coalesce(string_agg(
    event_id::text || '|' || person_id::text || '|' || source_text || '|' || coalesce(contact_email, '') || '|' || position::text,
    ',' order by event_id, position
  ), ''))
  into v_facilitator_rows_before
  from public.event_personnel
  where role = 'facilitator';

  select md5(coalesce(string_agg(
    id::text || '|' || coalesce(poc, ''),
    ',' order by id
  ), ''))
  into v_poc_text_before
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
    'poc',
    planned.source_text,
    planned.contact_email,
    planned.position
  from stage_2c_poc_tokens planned
  where not exists (
    select 1
    from public.event_personnel existing
    where existing.event_id = planned.event_id
      and existing.role = 'poc'
      and existing.position = planned.position
  );

  select count(*) into v_link_rows
  from public.event_personnel
  where role = 'poc';

  if v_link_rows <> v_plan_rows then
    raise exception
      'Stage 2C POC parity failed. event_personnel rows: %, source tokens: %.',
      v_link_rows, v_plan_rows;
  end if;

  select count(*) into v_missing
  from stage_2c_poc_tokens planned
  where not exists (
    select 1
    from public.event_personnel link
    where link.event_id = planned.event_id
      and link.role = 'poc'
      and link.position = planned.position
      and link.person_id = planned.person_id
      and link.source_text = planned.source_text
      and link.contact_email is not distinct from planned.contact_email
  );

  select count(*) into v_extra
  from public.event_personnel link
  where link.role = 'poc'
    and not exists (
      select 1
      from stage_2c_poc_tokens planned
      where planned.event_id = link.event_id
        and planned.position = link.position
        and planned.person_id = link.person_id
        and planned.source_text = link.source_text
        and planned.contact_email is not distinct from link.contact_email
    );

  if v_missing > 0 or v_extra > 0 then
    raise exception
      'Stage 2C POC parity failed. Tokens missing from event_personnel: %, POC rows absent from the source tokens: %.',
      v_missing, v_extra;
  end if;

  select count(*) into v_duplicate_links
  from (
    select event_id, person_id, role
    from public.event_personnel
    where role = 'poc'
      and person_id is not null
    group by event_id, person_id, role
    having count(*) > 1
  ) duplicates;

  if v_duplicate_links > 0 then
    raise exception
      'Stage 2C POC parity failed. % duplicate POC person links exist.',
      v_duplicate_links;
  end if;

  select count(*) into v_facilitators_after
  from public.event_personnel
  where role = 'facilitator';

  select count(*) into v_staff_after
  from public.event_personnel
  where role = 'credo_staff';

  select md5(coalesce(string_agg(
    event_id::text || '|' || person_id::text || '|' || source_text || '|' || coalesce(contact_email, '') || '|' || position::text,
    ',' order by event_id, position
  ), ''))
  into v_facilitator_rows_after
  from public.event_personnel
  where role = 'facilitator';

  select md5(coalesce(string_agg(
    id::text || '|' || coalesce(poc, ''),
    ',' order by id
  ), ''))
  into v_poc_text_after
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
     or v_staff_after <> v_staff_before
     or v_facilitator_rows_after is distinct from v_facilitator_rows_before
     or v_poc_text_after is distinct from v_poc_text_before
     or v_facilitator_missing > 0
     or v_facilitator_extra > 0
     or v_token_checksum_after is distinct from v_token_checksum_before
     or v_ordinary_after is distinct from v_ordinary_before
     or v_t4t_after is distinct from v_t4t_before then
    raise exception
      'Stage 2C changed facilitator rows, CREDO Staff rows, events.poc, or facilitator experience totals.';
  end if;
end
$backfill$;

notify pgrst, 'reload schema';
