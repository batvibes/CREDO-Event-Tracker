-- Monthly Impact Report drafts

create table public.monthly_reports (
  id                       uuid primary key default gen_random_uuid(),
  report_month             integer not null check (report_month >= 0 and report_month <= 11),
  report_year              integer not null check (report_year >= 2000 and report_year <= 2100),
  reach_notes              text not null default '',
  manpower_notes           text not null default '',
  readiness_notes          text not null default '',
  command_highlights_notes text not null default '',
  status                   text not null default 'draft',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (report_year, report_month)
);

create index monthly_reports_year_month_idx
  on public.monthly_reports (report_year, report_month);

create trigger monthly_reports_updated_at
  before update on public.monthly_reports
  for each row execute function public.set_updated_at();

alter table public.monthly_reports enable row level security;

create policy "monthly_reports_select_all"
on public.monthly_reports for select
to authenticated
using (true);

create policy "monthly_reports_insert_editors"
on public.monthly_reports for insert
to authenticated
with check (public.can_edit_events());

create policy "monthly_reports_update_editors"
on public.monthly_reports for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());
