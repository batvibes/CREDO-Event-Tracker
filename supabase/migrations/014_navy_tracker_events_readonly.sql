-- Read-only CREDO event export for Navy Tracker server-to-server integration.
-- Does not change public.events RLS or write policies.

create view public.navy_tracker_events_readonly
with (security_invoker = true)
as
select
  id,
  date,
  date_type,
  start_date,
  end_date,
  event_type,
  command,
  participants,
  location,
  facilitators,
  credo_staff,
  time,
  poc,
  reservation,
  venue,
  catering,
  catering_vendor,
  packout,
  roster
from public.events;

comment on view public.navy_tracker_events_readonly is
  'Read-only CREDO event export for Navy Tracker. Excludes AAR, audit, and identity fields.';

revoke all on public.navy_tracker_events_readonly from public;
revoke all on public.navy_tracker_events_readonly from anon;
revoke all on public.navy_tracker_events_readonly from authenticated;
revoke all on public.navy_tracker_events_readonly from service_role;
grant select on public.navy_tracker_events_readonly to service_role;
