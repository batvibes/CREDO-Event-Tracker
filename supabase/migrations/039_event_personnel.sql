-- 039: Canonical event personnel foundation
-- Adds an empty relationship table and a read view.
-- events.facilitators, events.poc, and events.credo_staff stay authoritative.
-- Does not backfill rows and does not change facilitator experience views.
-- Does not apply itself; review and run manually.

create table public.event_personnel (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid references public.people (id) on delete restrict,
  role text not null,
  source_text text not null,
  contact_email text,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint event_personnel_role_check
    check (role in ('facilitator', 'poc', 'credo_staff')),
  constraint event_personnel_position_check
    check (position >= 0),
  constraint event_personnel_source_text_check
    check (btrim(source_text) <> ''),
  constraint event_personnel_event_role_position_key
    unique (event_id, role, position)
);

comment on table public.event_personnel is
  'Future link from an event to a canonical person and role. Empty in this stage. Event text columns remain the operational display.';

comment on column public.event_personnel.person_id is
  'Canonical person. Null while the historical token is unresolved. Deleting the person is restricted so event history is not dropped silently.';

comment on column public.event_personnel.role is
  'facilitator, poc, or credo_staff. One person may hold more than one role on the same event.';

comment on column public.event_personnel.source_text is
  'Historical token captured when the relationship is created or later backfilled. Not the normal display once person_id is set.';

comment on column public.event_personnel.contact_email is
  'Event-specific contact email, used for a point of contact. Facilitator and staff rows normally leave this null.';

comment on column public.event_personnel.position is
  'Order of this role on the event, starting at 0.';

create unique index event_personnel_linked_person_role_key
  on public.event_personnel (event_id, person_id, role)
  where person_id is not null;

comment on index public.event_personnel_linked_person_role_key is
  'One linked person once per role on an event. Unresolved source-text rows may repeat.';

create index event_personnel_person_idx
  on public.event_personnel (person_id)
  where person_id is not null;

-- =============================================================================
-- Access
-- Authenticated users can read, matching Events.
-- Insert, update, and delete require an event editor or admin.
-- =============================================================================

alter table public.event_personnel enable row level security;

create policy "event_personnel_select_authenticated"
on public.event_personnel for select
to authenticated
using (true);

create policy "event_personnel_insert_editors"
on public.event_personnel for insert
to authenticated
with check (public.can_edit_events());

create policy "event_personnel_update_editors"
on public.event_personnel for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

create policy "event_personnel_delete_editors"
on public.event_personnel for delete
to authenticated
using (public.can_edit_events());

revoke all on table public.event_personnel from public;
revoke all on table public.event_personnel from anon;
revoke all on table public.event_personnel from authenticated;
grant select, insert, update, delete on table public.event_personnel to authenticated;

-- =============================================================================
-- Read model
-- Linked rows expose the current people identity.
-- An unresolved row leaves the person fields null and display_name is source_text.
-- No application screen reads this view yet.
-- =============================================================================

create view public.event_personnel_display
with (security_invoker = true) as
select
  link.id,
  link.event_id,
  link.person_id,
  link.role,
  link.position,
  link.source_text,
  link.contact_email,
  person.rank_title,
  person.first_name,
  person.last_name,
  person.name,
  person.active,
  case
    when person.id is null then null
    else public.personnel_display_name(person.rank_title, person.name)
  end as canonical_display_name,
  case
    when person.id is null then link.source_text
    else public.personnel_display_name(person.rank_title, person.name)
  end as display_name
from public.event_personnel link
left join public.people person
  on person.id = link.person_id;

comment on view public.event_personnel_display is
  'Event personnel with the current canonical display when person_id is set. Unresolved rows display source_text. Event text columns remain authoritative until a later stage.';

revoke all on table public.event_personnel_display from public;
revoke all on table public.event_personnel_display from anon;
revoke all on table public.event_personnel_display from authenticated;
grant select on table public.event_personnel_display to authenticated;

notify pgrst, 'reload schema';
