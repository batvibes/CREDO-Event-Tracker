-- 037: Delete one personnel record after an explicit confirmation.
-- Does not edit migrations 019–036.
-- Does not apply itself; review and run manually.
--
-- There is no general hard-delete function today.
-- archive_directory_person marks one person inactive and removes Manning.
-- reconcile_directory_people deletes only a retired duplicate after moving
-- that person's linked rows onto the survivor.
--
-- Stored person_id dependencies for this one id:
--   public.people_name_aliases            person_id, on delete cascade
--   public.team_members                   person_id, on delete restrict
--   public.facilitator_qualifications     person_id, on delete restrict
--   public.facilitator_t4t_completions    person_id, on delete restrict
--   public.t4t_attendance_created_people  person_id, on delete cascade
-- facilitator_event_tokens, facilitator_product_experience, and
-- facilitator_t4t_product_experience are views. Their person_id is resolved
-- from event text. Event text is left unchanged.

create or replace function public.delete_directory_person(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people%rowtype;
  v_display_name text;
  v_qualification_count integer := 0;
  v_completion_count integer := 0;
  v_manning_count integer := 0;
  v_alias_count integer := 0;
  v_attendance_count integer := 0;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  select *
    into v_person
  from public.people
  where id = p_id
  for update;

  if v_person.id is null then
    raise exception 'personnel record was not found'
      using errcode = 'P0002',
            hint = 'PERSONNEL_NOT_FOUND';
  end if;

  v_display_name := public.personnel_display_name(v_person.rank_title, v_person.name);

  delete from public.facilitator_qualifications
  where person_id = p_id;
  get diagnostics v_qualification_count = row_count;

  delete from public.facilitator_t4t_completions
  where person_id = p_id;
  get diagnostics v_completion_count = row_count;

  delete from public.team_members
  where person_id = p_id;
  get diagnostics v_manning_count = row_count;

  delete from public.people_name_aliases
  where person_id = p_id;
  get diagnostics v_alias_count = row_count;

  delete from public.t4t_attendance_created_people
  where person_id = p_id;
  get diagnostics v_attendance_count = row_count;

  delete from public.people
  where id = p_id;

  return jsonb_build_object(
    'id', v_person.id,
    'name', v_person.name,
    'display_name', v_display_name,
    'qualifications_removed', v_qualification_count,
    't4t_completions_removed', v_completion_count,
    'manning_removed', v_manning_count,
    'aliases_removed', v_alias_count,
    'attendance_created_removed', v_attendance_count
  );
exception
  when foreign_key_violation then
    raise exception 'This person could not be deleted because another record still references them. Nothing was changed.'
      using errcode = 'P0001',
            hint = 'PERSONNEL_DELETE_REFERENCE';
end;
$$;

comment on function public.delete_directory_person(uuid) is
  'Deletes one confirmed personnel record and the qualification, T4T completion, Manning, alias, and attendance-provenance rows for that same id. Does not update event text or any other person.';

revoke all on function public.delete_directory_person(uuid) from public;
revoke all on function public.delete_directory_person(uuid) from anon;
grant execute on function public.delete_directory_person(uuid) to authenticated;

notify pgrst, 'reload schema';
