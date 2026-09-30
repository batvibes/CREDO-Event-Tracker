-- 027: Remove one facilitator qualification record.
-- Deletes a single row by its primary key.
-- Does not apply itself; review and run manually.

create or replace function public.delete_facilitator_qualification(
  p_qualification_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit facilitator qualifications'
      using errcode = '42501';
  end if;

  if p_qualification_id is null then
    raise exception 'qualification record was not found'
      using errcode = 'P0002',
            hint = 'QUALIFICATION_NOT_FOUND';
  end if;

  delete from public.facilitator_qualifications
  where id = p_qualification_id
  returning id into v_id;

  if v_id is null then
    raise exception 'qualification record was not found'
      using errcode = 'P0002',
            hint = 'QUALIFICATION_NOT_FOUND';
  end if;

  return v_id;
end;
$$;

comment on function public.delete_facilitator_qualification(uuid) is
  'Deletes one qualification record by its primary key. Does not change personnel, products, events, or facilitation experience.';

revoke all on function public.delete_facilitator_qualification(uuid) from public;
revoke all on function public.delete_facilitator_qualification(uuid) from anon;
grant execute on function public.delete_facilitator_qualification(uuid) to authenticated;
