-- 035: Structured personnel name writes
-- Adds structured-name RPC entry points while preserving the proven personnel
-- save/reconciliation implementations from migration 019.
--
-- Legacy callers remain supported through save_directory_person() and
-- reconcile_directory_people(). Structured callers use the wrappers below.

create or replace function public.save_directory_person_structured(
  p_id uuid,
  p_rank_title text,
  p_first_name text,
  p_last_name text,
  p_name text,
  p_command_organization text,
  p_installation text,
  p_is_credo_staff boolean,
  p_is_facilitator boolean,
  p_is_poc boolean,
  p_staff_billet_or_role text,
  p_staff_prd_eaos text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text := nullif(public.clean_reference_display_name(p_first_name), '');
  v_last_name text := nullif(public.clean_reference_display_name(p_last_name), '');
  v_personal_name text := public.clean_reference_display_name(p_name);
  v_result jsonb;
  v_saved_id uuid;
  v_saved_first_name text;
  v_saved_last_name text;
begin
  if (v_first_name is null) <> (v_last_name is null) then
    raise exception 'First Name and Last Name must both be provided.'
      using errcode = 'P0001',
            hint = 'STRUCTURED_NAME_INCOMPLETE';
  end if;

  if v_first_name is not null then
    v_personal_name := v_first_name || ' ' || v_last_name;
  elsif p_id is null then
    raise exception 'First Name and Last Name are required for a new personnel record.'
      using errcode = 'P0001',
            hint = 'STRUCTURED_NAME_REQUIRED';
  end if;

  v_result := public.save_directory_person(
    p_id,
    p_rank_title,
    v_personal_name,
    p_command_organization,
    p_installation,
    p_is_credo_staff,
    p_is_facilitator,
    p_is_poc,
    p_staff_billet_or_role,
    p_staff_prd_eaos
  );

  v_saved_id := (v_result ->> 'id')::uuid;

  if v_first_name is not null then
    update public.people
    set
      first_name = v_first_name,
      last_name = v_last_name
    where id = v_saved_id;
  end if;

  select first_name, last_name
    into v_saved_first_name, v_saved_last_name
  from public.people
  where id = v_saved_id;

  return v_result || jsonb_build_object(
    'first_name', v_saved_first_name,
    'last_name', v_saved_last_name
  );
end;
$$;

comment on function public.save_directory_person_structured(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean, text, text
) is
  'Structured-name wrapper around save_directory_person(). Existing legacy identity behavior remains intact.';


create or replace function public.reconcile_directory_people_structured(
  p_survivor_id uuid,
  p_retired_id uuid,
  p_rank_title text,
  p_first_name text,
  p_last_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text := nullif(public.clean_reference_display_name(p_first_name), '');
  v_last_name text := nullif(public.clean_reference_display_name(p_last_name), '');
  v_personal_name text;
  v_result jsonb;
begin
  if v_first_name is null or v_last_name is null then
    raise exception 'First Name and Last Name are required.'
      using errcode = 'P0001',
            hint = 'STRUCTURED_NAME_REQUIRED';
  end if;

  v_personal_name := v_first_name || ' ' || v_last_name;

  v_result := public.reconcile_directory_people(
    p_survivor_id,
    p_retired_id,
    p_rank_title,
    v_personal_name
  );

  update public.people
  set
    first_name = v_first_name,
    last_name = v_last_name
  where id = p_survivor_id;

  return v_result || jsonb_build_object(
    'first_name', v_first_name,
    'last_name', v_last_name
  );
end;
$$;

comment on function public.reconcile_directory_people_structured(
  uuid, uuid, text, text, text
) is
  'Structured-name wrapper around reconcile_directory_people(). Historical event text and alias behavior remain unchanged.';

grant execute on function public.save_directory_person_structured(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean, text, text
) to authenticated;

grant execute on function public.reconcile_directory_people_structured(
  uuid, uuid, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
