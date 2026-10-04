/**
 * Stage 2A event personnel foundation.
 * Run: node scripts/validate-event-personnel-foundation.js
 *
 * Does not connect to Supabase and does not insert event personnel rows.
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

const migration = read('supabase/migrations/039_event_personnel.sql');
const table = migration.slice(
  migration.indexOf('create table public.event_personnel'),
  migration.indexOf('comment on table public.event_personnel'),
);
const view = migration.slice(
  migration.indexOf('create view public.event_personnel_display'),
  migration.indexOf('comment on view public.event_personnel_display'),
);
const db = read('js/db.js');
const wrapper = db.slice(db.indexOf('export function eventPersonnelFromRow'), db.indexOf('export async function fetchEvents'));

assert(migration.includes('create table public.event_personnel ('), 'event_personnel exists');
assert(table.includes('id uuid primary key default gen_random_uuid()'), 'ids use the existing uuid default');
assert(table.includes('event_id uuid not null references public.events (id) on delete cascade'), 'deleting an event removes its personnel links');
assert(table.includes('person_id uuid references public.people (id) on delete restrict'), 'deleting a person is restricted');
assert(!table.includes('person_id uuid references public.people (id) on delete cascade'), 'people deletion does not cascade into event personnel');
assert(table.includes("check (role in ('facilitator', 'poc', 'credo_staff'))"), 'roles are facilitator, poc, and credo_staff');
assert(table.includes('check (position >= 0)'), 'position starts at zero');
assert(table.includes('unique (event_id, role, position)'), 'event, role, and position stay unique');
assert(table.includes('source_text text not null'), 'source text is required');
assert(table.includes("check (btrim(source_text) <> '')"), 'blank source text is rejected');
assert(table.includes('contact_email text,'), 'contact email is nullable');
assert(!table.includes('contact_email text not null'), 'contact email is not required');
assert(
  migration.includes('create unique index event_personnel_linked_person_role_key')
    && migration.includes('on public.event_personnel (event_id, person_id, role)')
    && migration.includes('where person_id is not null'),
  'a linked person appears once per role on an event',
);
assert(!/insert\s+into\s+public\.event_personnel/i.test(migration), 'this stage does not backfill event personnel');
assert(!/alter\s+table\s+public\.events/i.test(migration), 'event text columns are unchanged');
assert(!migration.includes('split_facilitator_tokens') && !migration.includes('facilitator_token_resolution'), 'facilitator resolution is unchanged');
assert(!migration.includes('create or replace view public.facilitator_'), 'facilitator experience views are unchanged');
assert(!/delete_directory_person|reconcile_directory_people/.test(migration), 'delete and reconciliation are unchanged');

assert(migration.includes('alter table public.event_personnel enable row level security'), 'event personnel uses row level security');
assert(migration.includes('event_personnel_select_authenticated') && migration.includes('using (true)'), 'authenticated users can read event personnel');
assert(migration.includes('event_personnel_insert_editors') && migration.includes('with check (public.can_edit_events())'), 'inserts require an event editor');
assert(migration.includes('event_personnel_update_editors') && migration.includes('using (public.can_edit_events())'), 'updates require an event editor');
assert(migration.includes('event_personnel_delete_editors') && migration.includes('using (public.can_edit_events())'), 'deletes require an event editor');
assert(migration.includes('grant select, insert, update, delete on table public.event_personnel to authenticated'), 'authenticated grants stay behind the editor policies');

assert(migration.includes('create view public.event_personnel_display'), 'the read view exists');
assert(view.includes('with (security_invoker = true)'), 'the view uses the caller\'s permissions');
assert(view.includes('public.personnel_display_name(person.rank_title, person.name)'), 'a linked row uses the canonical display name');
assert(view.includes('when person.id is null then link.source_text'), 'an unresolved row falls back to source text');
assert(view.includes('person.rank_title') && view.includes('person.first_name') && view.includes('person.last_name') && view.includes('person.name') && view.includes('person.active'), 'a linked row exposes the canonical person fields');
assert(view.includes('left join public.people person'), 'an unresolved row remains in the view');

assert(wrapper.includes("from('event_personnel_display')"), 'the read wrapper uses the display view');
assert(wrapper.includes('.in(\'event_id\', ids)'), 'the wrapper accepts one event or several');
assert(wrapper.includes('eventPersonnelFromRow'), 'the wrapper returns an explicit row shape');
assert(wrapper.includes('sourceText:') && wrapper.includes('contactEmail:') && wrapper.includes('canonicalDisplayName:') && wrapper.includes('displayName:'), 'the wrapper keeps provenance and canonical display separate');
assert(!read('js/app.js').includes('fetchEventPersonnel'), 'Event Details and AARs do not read event personnel yet');
assert(!read('js/event-reference-fields.js').includes('fetchEventPersonnel'), 'the event editor does not write event personnel yet');
assert(!read('js/facilitator-management.js').includes('fetchEventPersonnel'), 'Facilitator Management does not read event personnel yet');

if (errors.length) {
  console.error(`validate-event-personnel-foundation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-event-personnel-foundation: ok');
