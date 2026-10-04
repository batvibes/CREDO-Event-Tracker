-- 038: Structured identity for people created by T4T attendance
-- Replaces the combined-name signature from migration 031.
-- A new attendee stores rank_title plus a first name, a last name, or both.
-- people.name is the compatibility name from those personal-name parts.
-- Role flags stay false. Provenance stays in t4t_attendance_created_people.
-- Does not rewrite migrations 031 or 034-036.
-- Does not apply itself; review and run manually.

drop function if exists public.create_t4t_attendance_person(text, text, text, text);

create or replace function public.create_t4t_attendance_person(
  p_rank_title text,
  p_first_name text,
  p_last_name text,
  p_command_organization text,
  p_installation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person jsonb;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  v_person := public.save_directory_person_structured(
    null,
    p_rank_title,
    p_first_name,
    p_last_name,
    null,
    p_command_organization,
    p_installation,
    false,
    false,
    false,
    null,
    null
  );

  insert into public.t4t_attendance_created_people (person_id, created_by)
  values ((v_person ->> 'id')::uuid, auth.uid());

  return v_person;
end;
$$;

comment on function public.create_t4t_attendance_person(text, text, text, text, text) is
  'Inserts one structured directory person for T4T attendance and records that attendance entry created the person. Accepts a first name, a last name, or both. Does not mark the person as staff, facilitator, or a point of contact.';

revoke all on function public.create_t4t_attendance_person(text, text, text, text, text) from public;
revoke all on function public.create_t4t_attendance_person(text, text, text, text, text) from anon;
grant execute on function public.create_t4t_attendance_person(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
