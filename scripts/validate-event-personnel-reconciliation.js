/**
 * Event personnel reconciliation and unresolved-token resolution.
 * Run: node scripts/validate-event-personnel-reconciliation.js
 *
 * Does not connect to Supabase and does not apply migrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const reconcileFile = read('supabase/migrations/043_event_personnel_reconciliation.sql');
const resolveFile = read('supabase/migrations/044_resolve_event_personnel.sql');
const staffFile = read('supabase/migrations/042_event_personnel_credo_staff_backfill.sql');
const reconcileStart = reconcileFile.indexOf('create or replace function public.reconcile_directory_people(');
const reconcileEnd = reconcileFile.indexOf('comment on function public.reconcile_directory_people');
const reconcile = reconcileFile.slice(reconcileStart, reconcileEnd);
const moveStart = reconcile.indexOf('delete from public.event_personnel as retired_link');
const move = reconcile.slice(moveStart, reconcile.indexOf('delete from public.people', moveStart));
const deletionStart = reconcileFile.indexOf('create or replace function public.delete_directory_person(');
const deletion = reconcileFile.slice(deletionStart, reconcileFile.indexOf('comment on function public.delete_directory_person'));
const singleStart = resolveFile.indexOf('create or replace function public.resolve_event_personnel(');
const single = resolveFile.slice(singleStart, resolveFile.indexOf('comment on function public.resolve_event_personnel(uuid, uuid)'));
const bulkStart = resolveFile.indexOf('create or replace function public.resolve_event_personnel_source_text(');
const bulk = resolveFile.slice(bulkStart, resolveFile.indexOf('comment on function public.resolve_event_personnel_source_text'));

assert(staffFile.includes("'RPSN Palomino'"), 'Stage 2D records the verified Palomino token');
assert(staffFile.includes('remember_personnel_display_alias'), 'Palomino uses the existing alias helper');
assert(staffFile.indexOf('$palomino$') < staffFile.indexOf('facilitator_token_resolution(planned.match_name)'), 'the alias exists before staff tokens are resolved');
assert(!/update\s+public\.events/i.test(staffFile), 'staff backfill does not rewrite event text');

assert(move.includes('retired_link.person_id = v_retired_id'), 'a retired event link is the row that can be collapsed');
assert(move.includes('survivor_link.person_id = v_survivor_id'), 'the survivor event link is kept');
assert(move.includes('retired_link.event_id = survivor_link.event_id'), 'collapse is limited to the same event');
assert(move.includes('retired_link.role = survivor_link.role'), 'collapse is limited to the same role');
assert(reconcile.includes('set person_id = v_survivor_id'), 'remaining event links move to the survivor');
assert(!/source_text\s*=/.test(move), 'reconciliation does not rewrite event personnel source text');
assert(reconcile.includes('update public.people_name_aliases'), 'aliases still move to the survivor');
assert(reconcile.includes('update public.facilitator_qualifications'), 'qualifications still move to the survivor');
assert(reconcile.includes('update public.facilitator_t4t_completions'), 'T4T history still moves to the survivor');
assert(reconcile.includes('public.team_members'), 'Manning behavior remains in reconciliation');
assert(!/update\s+public\.events/i.test(reconcile), 'reconciliation does not rewrite event text');
assert(reconcile.indexOf('delete from public.event_personnel as retired_link') < reconcile.indexOf('delete from public.people\n  where id = v_retired_id'), 'event links are moved before the retired person is deleted');

assert(deletion.includes('from public.event_personnel'), 'delete checks event personnel links');
assert(deletion.includes("hint = 'PERSONNEL_DELETE_REFERENCE'"), 'a blocked delete keeps the existing error hint');
assert(deletion.includes('This person is still linked to event history and cannot be deleted. Nothing was changed.'), 'a blocked delete explains that event history remains');
assert(deletion.indexOf('from public.event_personnel') < deletion.indexOf('delete from public.facilitator_qualifications'), 'event history blocks deletion before other rows are removed');
assert(!/delete\s+from\s+public\.event_personnel/i.test(deletion), 'deleting a person does not delete event history');

assert(single.includes('public.can_edit_events()'), 'resolving one row requires an event editor');
assert(single.includes('v_row.person_id is not null'), 'an already linked row is rejected');
assert(single.includes('set person_id = p_person_id'), 'resolution sets only the person');
assert(single.includes('EVENT_PERSONNEL_DUPLICATE'), 'a same-event role collision is rejected');
assert(!/insert\s+into\s+public\.people/i.test(single), 'resolution does not create a person');
assert(!/people_name_aliases/i.test(single), 'resolution does not create an alias');
assert(single.includes('v_updated.source_text is distinct from v_row.source_text'), 'source text must stay unchanged');
assert(single.includes('v_updated.role is distinct from v_row.role'), 'role must stay unchanged');
assert(single.includes('v_updated.position is distinct from v_row.position'), 'position must stay unchanged');
assert(single.includes('v_updated.contact_email is distinct from v_row.contact_email'), 'contact email must stay unchanged');

assert(bulk.includes('public.can_edit_events()'), 'bulk resolution requires an event editor');
assert(bulk.includes('link.source_text = v_source_text'), 'bulk resolution matches the exact historical token');
assert(bulk.includes('link.person_id is null'), 'bulk resolution changes unresolved rows');
assert(bulk.includes('set person_id = p_person_id'), 'bulk resolution sets only the person');
assert(bulk.includes('EVENT_PERSONNEL_DUPLICATE'), 'bulk resolution rejects a same-event role collision');
assert(!/insert\s+into\s+public\.people/i.test(bulk), 'bulk resolution does not create a person');
assert(!/people_name_aliases/i.test(bulk), 'bulk resolution does not create an alias');
assert(!/update\s+public\.events/i.test(resolveFile), 'resolution does not rewrite event text');

for (const relativePath of ['js/app.js', 'js/event-reference-fields.js', 'js/facilitator-management.js']) {
  const source = read(relativePath);
  assert(!source.includes('resolve_event_personnel'), `${relativePath} does not call event personnel resolution yet`);
  assert(!source.includes('fetchEventPersonnel'), `${relativePath} does not read event personnel yet`);
}

if (errors.length) {
  console.error(`validate-event-personnel-reconciliation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-event-personnel-reconciliation: ok');
