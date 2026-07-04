-- Global AAR Requirements templates (singleton)

create table public.aar_global_templates (
  id                   integer primary key,
  credo_requirements   text not null default '',
  command_requirements text not null default '',
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

insert into public.aar_global_templates (
  id,
  credo_requirements,
  command_requirements
)
values (
  1,
  'Course materials, hospitality gear (as requested or required), Facilitator sponsorship',
  'Roster'
)
on conflict (id) do nothing;

create trigger aar_global_templates_updated_at
  before update on public.aar_global_templates
  for each row execute function public.set_updated_at();

alter table public.aar_global_templates enable row level security;

create policy "aar_global_templates_select_all"
on public.aar_global_templates for select
to authenticated
using (true);

create policy "aar_global_templates_update_admin"
on public.aar_global_templates for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
