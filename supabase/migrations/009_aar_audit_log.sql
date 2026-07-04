-- AAR History Log: audit trail for AAR workflow actions

create table public.aar_audit_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  action      text not null,
  details     text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id)
);

create index aar_audit_log_event_id_idx on public.aar_audit_log (event_id);
create index aar_audit_log_created_at_idx on public.aar_audit_log (created_at);

alter table public.aar_audit_log enable row level security;

create policy "aar_audit_log_select_all"
on public.aar_audit_log for select
to authenticated
using (true);

create policy "aar_audit_log_insert_authenticated"
on public.aar_audit_log for insert
to authenticated
with check (true);
