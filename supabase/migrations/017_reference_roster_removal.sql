-- 017: Physically remove a reference roster row.
-- "Remove from list" deletes only the canonical selectable roster entry.
-- It does NOT modify events, AARs, reports, trends, financials, or any stored text.
--
-- 016 remains the authoritative global rename and is not changed here.
-- Ordinary client DELETE is still blocked by RLS; this narrow RPC is the
-- permission-checked removal path.

create or replace function public.remove_reference_entry(
  p_reference_type text,
  p_reference_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  roster_table text;
  result_id uuid;
  result_name text;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to remove reference entries'
      using errcode = '42501';
  end if;

  kind := lower(btrim(coalesce(p_reference_type, '')));
  if kind not in ('command', 'location', 'venue', 'caterer', 'person') then
    raise exception 'invalid reference type'
      using errcode = '22023',
            hint = 'REFERENCE_TYPE_INVALID';
  end if;

  if p_reference_id is null then
    raise exception 'reference id is required'
      using errcode = '22023',
            hint = 'REFERENCE_ID_REQUIRED';
  end if;

  roster_table := case kind
    when 'command' then 'commands'
    when 'location' then 'locations'
    when 'venue' then 'venues'
    when 'caterer' then 'caterers'
    else 'people'
  end;

  execute format(
    'delete from public.%I where id = $1 returning id, name',
    roster_table
  )
  into result_id, result_name
  using p_reference_id;

  if result_id is null then
    raise exception 'reference entry was not found'
      using errcode = 'P0002',
            hint = 'REFERENCE_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'id', result_id,
    'name', result_name,
    'kind', kind,
    'removed', true
  );
end;
$$;

comment on function public.remove_reference_entry(text, uuid) is
  'Permission-checked deletion of one reference roster row. Does not cascade into events or AARs and does not rewrite stored text.';

revoke all on function public.remove_reference_entry(text, uuid) from public;
revoke all on function public.remove_reference_entry(text, uuid) from anon;

grant execute on function public.remove_reference_entry(text, uuid) to authenticated;

notify pgrst, 'reload schema';
