-- 048: Merge one command reference into another.
-- SOURCE is the duplicate to retire. TARGET is the command to keep.
-- Reassigns public.events.command by the source command's normalized name,
-- then deletes the source roster row.
-- Does not edit earlier migrations.
-- Does not apply itself; review and run manually.
--
-- Structured command identity:
--   public.commands (id, name, normalized_name, active)
--   public.events.command (text, not a foreign key)
--
-- Intentionally left unchanged:
--   people.command_organization — personnel organization text, not a commands row
--   monthly_reports.command_highlights_notes — narrative report text
--   AAR, cost, curriculum, personnel, and other event columns
--
-- events_updated_at still stamps events.updated_at on any update, the same
-- way a command rename does. This function assigns only events.command.

create or replace function public.merge_command_reference(
  p_source_command_id uuid,
  p_target_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_name text;
  v_source_normalized text;
  v_target_name text;
  v_target_active boolean;
  v_events_moved integer := 0;
begin
  if auth.uid() is null or not public.can_edit_events() then
    raise exception 'not authorized to merge commands'
      using errcode = '42501';
  end if;

  if p_source_command_id is null
     or p_target_command_id is null
     or p_source_command_id = p_target_command_id then
    raise exception 'command merge requires two different commands'
      using errcode = '22023',
            hint = 'COMMAND_MERGE_PAIR';
  end if;

  perform id
  from public.commands
  where id in (p_source_command_id, p_target_command_id)
  order by id
  for update;

  select name, normalized_name
    into v_source_name, v_source_normalized
  from public.commands
  where id = p_source_command_id;

  if v_source_name is null then
    raise exception 'source command was not found'
      using errcode = 'P0002',
            hint = 'COMMAND_MERGE_SOURCE_NOT_FOUND';
  end if;

  select name, active
    into v_target_name, v_target_active
  from public.commands
  where id = p_target_command_id;

  if v_target_name is null then
    raise exception 'target command was not found'
      using errcode = 'P0002',
            hint = 'COMMAND_MERGE_TARGET_NOT_FOUND';
  end if;

  if v_target_active is not true then
    raise exception 'target command is not an active command'
      using errcode = 'P0001',
            hint = 'COMMAND_MERGE_TARGET_INACTIVE';
  end if;

  update public.events
  set command = v_target_name
  where public.normalize_reference_name(command) = v_source_normalized;

  get diagnostics v_events_moved = row_count;

  delete from public.commands
  where id = p_source_command_id;

  return jsonb_build_object(
    'source_id', p_source_command_id,
    'source_name', v_source_name,
    'target_id', p_target_command_id,
    'target_name', v_target_name,
    'events_moved', v_events_moved
  );
end;
$$;

comment on function public.merge_command_reference(uuid, uuid) is
  'Moves events whose command text matches the source command onto the target command name, then deletes the source command. Does not rename a command into an existing name.';

revoke all on function public.merge_command_reference(uuid, uuid) from public;
revoke all on function public.merge_command_reference(uuid, uuid) from anon;

grant execute on function public.merge_command_reference(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
