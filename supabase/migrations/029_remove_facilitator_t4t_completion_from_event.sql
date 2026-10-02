-- 029: Remove one event-sourced T4T attendance row.
-- Deletes only the completion for one person, ordinary product, and source Event.
-- Manual history with a null source event, other events, and other products stay.
-- Does not apply itself; review and run manually.

create or replace function public.remove_facilitator_t4t_completion_from_event(
  p_person_id uuid,
  p_product_id uuid,
  p_source_event_id uuid
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
    raise exception 'not authorized to remove facilitator T4T completions'
      using errcode = '42501';
  end if;

  if p_person_id is null or p_product_id is null or p_source_event_id is null then
    raise exception 'a person, product, and source event are required'
      using errcode = 'P0001',
            hint = 'T4T_COMPLETION_EVENT_REQUIRED';
  end if;

  delete from public.facilitator_t4t_completions completion
  where completion.person_id = p_person_id
    and completion.product_id = p_product_id
    and completion.source_event_id = p_source_event_id
    and completion.source_event_id is not null
  returning completion.id into v_id;

  return v_id;
end;
$$;

comment on function public.remove_facilitator_t4t_completion_from_event(uuid, uuid, uuid) is
  'Deletes the T4T completion sourced from one Event for one person and ordinary product. Does not delete manual history, other events, other products, qualifications, or people.';

revoke all on function public.remove_facilitator_t4t_completion_from_event(uuid, uuid, uuid) from public;
revoke all on function public.remove_facilitator_t4t_completion_from_event(uuid, uuid, uuid) from anon;
grant execute on function public.remove_facilitator_t4t_completion_from_event(uuid, uuid, uuid) to authenticated;
