-- 033: Neutral create-or-reuse for Event Add Person.
-- Exact display name, personal name, or alias reuses the existing person.
-- A composed rank plus personal name matches personnel_display_name.
-- More than one match stops without choosing and without inserting.
-- A new row stays active and is not staff, facilitator, or a point of contact.
-- Does not update an existing person, Manning, qualifications, T4T rows, or event text.
-- Does not apply itself; review and run manually.

create or replace function public.reuse_or_create_event_person(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := public.clean_reference_display_name(p_name);
  v_norm text := public.normalize_reference_name(p_name);
  v_ids uuid[];
  v_person public.people%rowtype;
  v_existing_id uuid;
  v_created boolean := false;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'Name is required.'
      using errcode = 'P0001',
            hint = 'NAME_REQUIRED';
  end if;

  select coalesce(array_agg(distinct candidate.candidate_id), array[]::uuid[])
    into v_ids
  from (
    select person.id as candidate_id
    from public.people person
    where public.normalize_reference_name(person.name) = v_norm
       or public.normalize_reference_name(public.personnel_display_name(person.rank_title, person.name)) = v_norm
    union
    select alias.person_id
    from public.people_name_aliases alias
    where alias.normalized_name = v_norm
  ) candidate;

  if cardinality(v_ids) > 1 then
    raise exception 'More than one person matches “%”. Choose the existing person instead of adding a new one.', v_name
      using errcode = 'P0001',
            hint = 'PERSONNEL_IDENTITY_AMBIGUOUS';
  end if;

  if cardinality(v_ids) = 1 then
    select *
      into v_person
    from public.people
    where id = v_ids[1];
  else
    insert into public.people (
      name,
      active,
      is_credo_staff,
      is_facilitator,
      is_poc
    )
    values (v_name, true, false, false, false)
    returning * into v_person;
    v_created := true;
  end if;

  return jsonb_build_object(
    'id', v_person.id,
    'name', v_person.name,
    'rank_title', v_person.rank_title,
    'email', v_person.email,
    'phone', v_person.phone,
    'active', v_person.active,
    'is_credo_staff', v_person.is_credo_staff,
    'is_facilitator', v_person.is_facilitator,
    'is_poc', v_person.is_poc,
    'created', v_created
  );
exception
  when unique_violation then
    select person.id
      into v_existing_id
    from public.people person
    where person.normalized_name = v_norm;

    if v_existing_id is not null then
      select *
        into v_person
      from public.people
      where id = v_existing_id;
      return jsonb_build_object(
        'id', v_person.id,
        'name', v_person.name,
        'rank_title', v_person.rank_title,
        'email', v_person.email,
        'phone', v_person.phone,
        'active', v_person.active,
        'is_credo_staff', v_person.is_credo_staff,
        'is_facilitator', v_person.is_facilitator,
        'is_poc', v_person.is_poc,
        'created', false
      );
    end if;

    raise exception 'That name conflicts with an existing person. Choose them from the list instead of adding a new one.'
      using errcode = 'P0001',
            hint = 'PERSONNEL_IDENTITY_CONFLICT';
end;
$$;

comment on function public.reuse_or_create_event_person(text) is
  'Reuses one exact canonical person for Event Add Person, or inserts one neutral person. Does not change an existing person or event text.';

revoke all on function public.reuse_or_create_event_person(text) from public;
revoke all on function public.reuse_or_create_event_person(text) from anon;
grant execute on function public.reuse_or_create_event_person(text) to authenticated;

notify pgrst, 'reload schema';
