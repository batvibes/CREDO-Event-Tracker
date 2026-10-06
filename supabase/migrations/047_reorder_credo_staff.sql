-- 047: Persist a manual CREDO Staff order.
-- Adds public.reorder_credo_staff(uuid[]).
-- Writes people.staff_display_order and the linked team_members.display_order.
-- Does not edit earlier migrations.
-- Does not apply itself; review and run manually.

create or replace function public.reorder_credo_staff(
  p_person_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected uuid[];
  v_submitted uuid[];
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to edit personnel'
      using errcode = '42501';
  end if;

  if p_person_ids is null
     or exists (
       select 1
       from unnest(p_person_ids) as submitted(id)
       where submitted.id is null
     ) then
    raise exception 'CREDO Staff order includes someone who is not active CREDO Staff.'
      using errcode = 'P0001',
            hint = 'STAFF_ORDER_NOT_STAFF';
  end if;

  if (
    select count(*)
    from unnest(p_person_ids) as submitted(id)
  ) is distinct from (
    select count(distinct submitted.id)
    from unnest(p_person_ids) as submitted(id)
  ) then
    raise exception 'CREDO Staff order contains a duplicate person.'
      using errcode = 'P0001',
            hint = 'STAFF_ORDER_DUPLICATE';
  end if;

  lock table public.people in share row exclusive mode;
  lock table public.team_members in share row exclusive mode;

  select coalesce(array_agg(person.id order by person.id), array[]::uuid[])
    into v_expected
  from public.people person
  where person.active
    and person.is_credo_staff;

  select coalesce(array_agg(submitted.id order by submitted.id), array[]::uuid[])
    into v_submitted
  from unnest(p_person_ids) as submitted(id);

  if exists (
    select 1
    from unnest(p_person_ids) as submitted(id)
    where not exists (
      select 1
      from public.people person
      where person.id = submitted.id
        and person.active
        and person.is_credo_staff
    )
  ) then
    raise exception 'CREDO Staff order includes someone who is not active CREDO Staff.'
      using errcode = 'P0001',
            hint = 'STAFF_ORDER_NOT_STAFF';
  end if;

  if v_expected is distinct from v_submitted then
    raise exception 'CREDO Staff changed before this order could be saved. Reload and try again.'
      using errcode = 'P0001',
            hint = 'STAFF_ORDER_STALE';
  end if;

  if exists (
    select 1
    from unnest(p_person_ids) as submitted(id)
    where not exists (
      select 1
      from public.team_members manning
      where manning.person_id = submitted.id
    )
  ) then
    raise exception 'CREDO Staff order could not update Manning for every person.'
      using errcode = 'P0001',
            hint = 'STAFF_ORDER_MANNING';
  end if;

  with ordered as (
    select submitted.id, submitted.ordinality::integer as position
    from unnest(p_person_ids) with ordinality as submitted(id, ordinality)
  )
  update public.people as person
  set staff_display_order = ordered.position
  from ordered
  where person.id = ordered.id
    and person.staff_display_order is distinct from ordered.position;

  with ordered as (
    select submitted.id, submitted.ordinality::integer as position
    from unnest(p_person_ids) with ordinality as submitted(id, ordinality)
  )
  update public.team_members as manning
  set
    display_order = ordered.position,
    updated_at = now()
  from ordered
  where manning.person_id = ordered.id
    and manning.display_order is distinct from ordered.position;
end;
$$;

comment on function public.reorder_credo_staff(uuid[]) is
  'Stores the complete active CREDO Staff order on people.staff_display_order and team_members.display_order. Does not change identity, roles, billets, or Manning status.';

revoke all on function public.reorder_credo_staff(uuid[]) from public;
revoke all on function public.reorder_credo_staff(uuid[]) from anon;
grant execute on function public.reorder_credo_staff(uuid[]) to authenticated;

notify pgrst, 'reload schema';
