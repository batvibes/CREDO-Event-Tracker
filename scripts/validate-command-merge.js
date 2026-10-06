/**
 * Verify the Settings → Commands merge workflow.
 * Run: node scripts/validate-command-merge.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commandMergeTargets,
  countEventsAssignedToCommand,
  normalizeCommandIdentity,
} from '../js/settings-reference-lists.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return '';
  return source.slice(startIndex, endIndex);
}

const migration = read('supabase/migrations/048_merge_command_reference.sql');
const db = read('js/db.js');
const app = read('js/app.js');
const renameMigration = read('supabase/migrations/019_personnel_editing.sql');
const removeMigration = read('supabase/migrations/017_reference_roster_removal.sql');

const mergeFn = sliceBetween(
  migration,
  'create or replace function public.merge_command_reference(',
  'comment on function public.merge_command_reference'
);
const updateSql = sliceBetween(mergeFn, 'update public.events', 'get diagnostics');
const renameFn = sliceBetween(
  renameMigration,
  'create or replace function public.rename_reference_entry(',
  'comment on function public.rename_reference_entry'
);
const removeFn = sliceBetween(
  removeMigration,
  'create or replace function public.remove_reference_entry(',
  'comment on function public.remove_reference_entry'
);
const mergeAdapter = sliceBetween(db, 'function mapMergeCommandError(', 'export async function removeLocation(');
const updateCommand = sliceBetween(db, 'export async function updateCommand(', 'export async function updateLocation(');
const removeCommand = sliceBetween(db, 'export async function removeCommand(', 'function mapMergeCommandError(');
const mergePanel = sliceBetween(app, "if (form.mode === 'merge')", 'function fillSettingsReferenceTableBody');
const rowActions = sliceBetween(app, 'function fillSettingsReferenceTableBody', 'function renderSettingsReferenceListsPanel');
const commandBranch = sliceBetween(rowActions, "if (settingsReferenceCategory === 'commands')", 'const removeBtn');

assert(mergeFn.includes('p_source_command_id uuid') && mergeFn.includes('p_target_command_id uuid'), 'RPC takes source and target command ids');
assert(mergeFn.includes('language plpgsql'), 'merge runs in one plpgsql transaction');
assert(!/commit\b/i.test(mergeFn), 'merge does not commit early');
assert(!/exception\s+when/i.test(mergeFn), 'a failure inside merge rolls the function back');
assert(mergeFn.includes('auth.uid() is null') && mergeFn.includes('public.can_edit_events()'), 'merge requires the same editor permission as reference management');
assert(mergeFn.includes("errcode = '42501'"), 'unauthorized merge uses the existing authorization code');
assert(mergeFn.includes("hint = 'COMMAND_MERGE_PAIR'"), 'null or identical commands are rejected');
assert(mergeFn.includes('p_source_command_id is null') && mergeFn.includes('p_target_command_id is null') && mergeFn.includes('p_source_command_id = p_target_command_id'), 'pair validation covers nulls and the same id');
assert(mergeFn.includes("hint = 'COMMAND_MERGE_SOURCE_NOT_FOUND'"), 'a missing source is rejected');
assert(mergeFn.includes("hint = 'COMMAND_MERGE_TARGET_NOT_FOUND'"), 'a missing target is rejected');
assert(mergeFn.includes("hint = 'COMMAND_MERGE_TARGET_INACTIVE'"), 'an inactive target is rejected');
assert(mergeFn.indexOf("hint = 'COMMAND_MERGE_SOURCE_NOT_FOUND'") < mergeFn.indexOf('update public.events'), 'missing commands are rejected before any event update');
assert(updateSql.includes('set command = v_target_name'), 'event reassignment writes the canonical target name');
assert(updateSql.includes('public.normalize_reference_name(command) = v_source_normalized'), 'event reassignment matches the source command identity exactly');
assert(!/\blike\b|\bposition\s*\(|\breplace\s*\(/i.test(updateSql), 'event reassignment does not use substring replacement');
assert(!/set\s+(?!command\b)[a-z_]+/i.test(updateSql), 'the event update assigns only command');
assert(!/people|monthly_reports|command_highlights|command_organization|aar_/i.test(updateSql), 'narrative and personnel organization fields are not rewritten');
assert(mergeFn.indexOf('update public.events') < mergeFn.indexOf('delete from public.commands'), 'the source command is removed only after events move');
assert(mergeFn.includes('where id = p_source_command_id'), 'only the source command row is deleted');
assert(!mergeFn.includes('delete from public.events'), 'merge does not delete events');
assert(mergeFn.includes("'source_id'") && mergeFn.includes("'source_name'") && mergeFn.includes("'target_id'") && mergeFn.includes("'target_name'") && mergeFn.includes("'events_moved'"), 'the RPC returns source, target, and the moved event count');
assert(migration.includes('grant execute on function public.merge_command_reference(uuid, uuid) to authenticated'), 'authenticated editors can execute the merge');
assert(migration.includes('revoke all on function public.merge_command_reference(uuid, uuid) from public'), 'public merge execution is revoked');
assert(migration.includes('revoke all on function public.merge_command_reference(uuid, uuid) from anon'), 'anonymous merge execution is revoked');

assert(renameFn.includes("hint = 'REFERENCE_NAME_EXISTS'"), 'rename still rejects an existing command name');
assert(renameFn.includes('set command = new_name'), 'rename still updates event command text for a new name');
assert(!renameFn.includes('merge_command_reference'), 'rename does not become a merge');
assert(removeFn.includes('delete from public.%I where id = $1'), 'remove still deletes only the roster row');
assert(!removeFn.includes('update public.events'), 'remove still does not reassign events');

assert(mergeAdapter.includes("rpc('merge_command_reference'"), 'mergeCommand calls the merge RPC');
assert(mergeAdapter.includes('p_source_command_id') && mergeAdapter.includes('p_target_command_id'), 'mergeCommand sends source and target ids');
assert(mergeAdapter.includes('eventsMoved'), 'mergeCommand returns the authoritative moved count');
assert(mergeAdapter.includes('COMMAND_MERGE_PAIR') && mergeAdapter.includes('COMMAND_MERGE_SOURCE_NOT_FOUND') && mergeAdapter.includes('COMMAND_MERGE_TARGET_NOT_FOUND'), 'mergeCommand maps the expected errors');
assert(!updateCommand.includes('mergeCommand') && !updateCommand.includes('merge_command_reference'), 'updateCommand stays a rename');
assert(updateCommand.includes("renameReferenceEntry('command'"), 'a new command name still uses rename');
assert(removeCommand.includes("removeReferenceEntry('command'"), 'remove stays the existing removal path');
assert(!removeCommand.includes('merge_command_reference'), 'remove does not merge');

assert(commandBranch.includes("textContent = 'Merge'"), 'Commands rows offer Merge');
assert(commandBranch.includes("mode: 'merge'"), 'Merge opens the command merge dialog');
const afterCommandMerge = rowActions.slice(rowActions.indexOf("if (settingsReferenceCategory === 'commands')") + commandBranch.length);
assert(commandBranch.length > 0 && !afterCommandMerge.includes("textContent = 'Merge'"), 'Merge is not added for other reference categories');
assert(mergePanel.includes('Merge Command'), 'the dialog title is Merge Command');
assert(mergePanel.includes('Merge: ${form.currentName}'), 'the dialog names the source command');
assert(mergePanel.includes("textContent = 'Into'"), 'the dialog asks which command to keep');
assert(mergePanel.includes('commandMergeTargets'), 'the target list excludes the source command');
assert(mergePanel.includes('This will move all events currently assigned to'), 'the dialog states the reassignment before merge');
assert(mergePanel.includes('from the Commands list.'), 'the dialog states that the source command will be removed');
assert(mergePanel.includes('countEventsAssignedToCommand'), 'the preview count uses loaded events');
assert(mergePanel.includes('events will be reassigned.'), 'the dialog shows how many events will move');
assert(mergePanel.includes("textContent = 'Cancel'") && mergePanel.includes("textContent = 'Merge Commands'"), 'the dialog offers Cancel and Merge Commands');
assert(mergePanel.includes('await mergeCommand(sourceId, targetId)'), 'confirmation calls mergeCommand');
assert(!mergePanel.includes('updateCommand'), 'the merge dialog does not rename');
assert(mergePanel.includes('reloadEventsAfterCanonicalRename'), 'a successful merge refreshes events and reporting views');
assert(mergePanel.includes('was merged into'), 'success reports the source, target, and reassigned count');
assert(app.includes("if (category === 'commands') updated = await updateCommand(id, { name })"), 'rename still saves through updateCommand');

const commands = [
  { id: 'v11', name: 'V11', active: true },
  { id: 'marines-11', name: '1/1 Marines', active: true },
  { id: 'v31', name: 'V31', active: true },
  { id: 'marines-31', name: '3/1 Marines', active: true },
  { id: 'retired', name: 'Old Command', active: false },
];

function eventRow(id, command, extras = {}) {
  return {
    id,
    command,
    date: '2026-04-01',
    event_type: 'Marriage Enrichment Retreat',
    participants: '18',
    facilitators: 'LT Example',
    location: 'Camp Pendleton',
    venue: 'Chapel',
    notes: 'Keep this note',
    ...extras,
  };
}

const events = [
  eventRow('e1', 'V11'),
  eventRow('e2', ' v11 '),
  eventRow('e3', '1/1 Marines', { participants: '40' }),
  eventRow('e4', 'V110'),
  eventRow('e5', 'V31'),
  eventRow('e6', '3/1 Marines'),
  eventRow('e7', 'V31 Detachment'),
];

function applyMerge(commandRows, eventRows, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) {
    const error = new Error('pair');
    error.code = 'COMMAND_MERGE_PAIR';
    throw error;
  }
  const source = commandRows.find((row) => row.id === sourceId);
  const target = commandRows.find((row) => row.id === targetId);
  if (!source) {
    const error = new Error('source');
    error.code = 'COMMAND_MERGE_SOURCE_NOT_FOUND';
    throw error;
  }
  if (!target) {
    const error = new Error('target');
    error.code = 'COMMAND_MERGE_TARGET_NOT_FOUND';
    throw error;
  }
  if (target.active !== true) {
    const error = new Error('inactive');
    error.code = 'COMMAND_MERGE_TARGET_INACTIVE';
    throw error;
  }
  const sourceKey = normalizeCommandIdentity(source.name);
  let eventsMoved = 0;
  const nextEvents = eventRows.map((event) => {
    if (normalizeCommandIdentity(event.command) !== sourceKey) return event;
    eventsMoved += 1;
    return { ...event, command: target.name };
  });
  return {
    sourceId: source.id,
    sourceName: source.name,
    targetId: target.id,
    targetName: target.name,
    eventsMoved,
    commands: commandRows.filter((row) => row.id !== source.id),
    events: nextEvents,
  };
}

const v11Targets = commandMergeTargets(commands, 'v11').map((row) => row.name);
assert(!v11Targets.includes('V11'), 'the target picker excludes the source command');
assert(v11Targets.includes('1/1 Marines') && v11Targets.includes('3/1 Marines'), 'other active commands remain available');
assert(!v11Targets.includes('Old Command'), 'an inactive command is not a merge target');

assert(countEventsAssignedToCommand(events, 'V11') === 2, 'preview counts exact V11 events, including spacing and case');
assert(countEventsAssignedToCommand(events, 'V31') === 1, 'preview does not count a longer command name');
assert(countEventsAssignedToCommand(events, '1/1 Marines') === 1, 'preview counts the surviving command separately');

let pairError = null;
try {
  applyMerge(commands, events, 'v11', 'v11');
} catch (error) {
  pairError = error;
}
assert(pairError?.code === 'COMMAND_MERGE_PAIR', 'source and target must differ');

let missingSource = null;
try {
  applyMerge(commands, events, 'missing', 'marines-11');
} catch (error) {
  missingSource = error;
}
assert(missingSource?.code === 'COMMAND_MERGE_SOURCE_NOT_FOUND', 'a missing source is rejected before changes');

let inactiveTarget = null;
try {
  applyMerge(commands, events, 'v11', 'retired');
} catch (error) {
  inactiveTarget = error;
}
assert(inactiveTarget?.code === 'COMMAND_MERGE_TARGET_INACTIVE', 'an inactive target is rejected');

const mergedV11 = applyMerge(commands, events, 'v11', 'marines-11');
assert(mergedV11.eventsMoved === 2, 'both V11 events move');
assert(mergedV11.events.find((event) => event.id === 'e1').command === '1/1 Marines', 'V11 becomes 1/1 Marines');
assert(mergedV11.events.find((event) => event.id === 'e2').command === '1/1 Marines', 'normalized V11 text becomes the canonical target name');
assert(mergedV11.events.find((event) => event.id === 'e3').command === '1/1 Marines', 'existing 1/1 Marines events stay 1/1 Marines');
assert(mergedV11.events.find((event) => event.id === 'e3').participants === '40', 'an existing target event keeps its other fields');
assert(mergedV11.events.find((event) => event.id === 'e4').command === 'V110', 'a similar command name is not rewritten');
assert(mergedV11.events.find((event) => event.id === 'e5').command === 'V31', 'an unrelated command stays in place');
assert(mergedV11.events.length === events.length, 'merge does not create duplicate events');
assert(new Set(mergedV11.events.map((event) => event.id)).size === events.length, 'event ids stay unique');
assert(mergedV11.events.find((event) => event.id === 'e1').notes === 'Keep this note', 'non-command event fields stay unchanged');
assert(mergedV11.events.find((event) => event.id === 'e1').date === '2026-04-01', 'event dates stay unchanged');
assert(!mergedV11.commands.some((row) => row.name === 'V11'), 'V11 is removed from the command list');
assert(mergedV11.commands.some((row) => row.name === '1/1 Marines'), '1/1 Marines remains');
assert(mergedV11.sourceName === 'V11' && mergedV11.targetName === '1/1 Marines', 'the result names the source and target');

const mergedV31 = applyMerge(mergedV11.commands, mergedV11.events, 'v31', 'marines-31');
assert(mergedV31.eventsMoved === 1, 'the V31 event moves');
assert(mergedV31.events.find((event) => event.id === 'e5').command === '3/1 Marines', 'V31 becomes 3/1 Marines');
assert(mergedV31.events.find((event) => event.id === 'e6').command === '3/1 Marines', 'existing 3/1 Marines events stay 3/1 Marines');
assert(mergedV31.events.find((event) => event.id === 'e7').command === 'V31 Detachment', 'a longer V31 name is not rewritten');
assert(mergedV31.events.find((event) => event.id === 'e1').command === '1/1 Marines', 'the earlier merge remains intact');
assert(!mergedV31.commands.some((row) => row.name === 'V31'), 'V31 is no longer selectable');
assert(mergedV31.events.length === events.length, 'the second merge still does not duplicate events');

if (errors.length) {
  console.error(`validate-command-merge: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-command-merge: ok');
