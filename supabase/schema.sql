-- CREDO Event Operations Tracker — complete Supabase schema
-- Paste this entire file into the Supabase SQL Editor and run once.

-- =============================================================================
-- ENUM
-- =============================================================================

create type public.user_role as enum ('admin', 'editor', 'viewer');

-- =============================================================================
-- TABLES
-- =============================================================================

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        public.user_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  date          text not null default 'TBD',
  event_type    text not null,
  command       text not null default 'TBD',
  participants  text not null default 'TBD',
  location      text not null default 'TBD',
  reservation   text not null default 'Not Started',
  catering      text not null default 'Not Started',
  packout       text not null default 'Not Started',
  roster        text not null default 'Need Roster',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_by    uuid references auth.users (id)
);

create index events_date_idx on public.events (date);
create index events_event_type_idx on public.events (event_type);
create index events_command_idx on public.events (command);

create table public.event_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.team (
  id               int primary key default 1 check (id = 1),
  director         text not null default '',
  deputy_director  text not null default '',
  gs_position      text not null default '',
  lpo              text not null default '',
  credo_staff      text not null default '',
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- SEED DATA
-- =============================================================================

insert into public.team (id)
values (1)
on conflict (id) do nothing;

insert into public.event_types (name, sort_order)
values
  ('Marriage Enrichment Retreat', 1),
  ('Dinner Date Night', 2),
  ('Marriage Enrichment Workshop', 3),
  ('Family Enrichment Retreat', 4),
  ('Personal Growth Workshop', 5),
  ('Personal Growth Retreat', 6),
  ('ASIST Workshop', 7),
  ('SafeTalk Workshop', 8),
  ('SafeTalk T4T', 9),
  ('ASIST T4T', 10),
  ('Leadership Development', 11)
on conflict (name) do nothing;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

create or replace function public.can_edit_events()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin', 'editor');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer');
  return new;
end;
$$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger team_updated_at
  before update on public.team
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_types enable row level security;
alter table public.team enable row level security;

-- profiles
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "profiles_select_admin"
on public.profiles for select
to authenticated
using (public.is_admin());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- events
create policy "events_select_all"
on public.events for select
to authenticated
using (true);

create policy "events_insert_editors"
on public.events for insert
to authenticated
with check (public.can_edit_events());

create policy "events_update_editors"
on public.events for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

create policy "events_delete_admin"
on public.events for delete
to authenticated
using (public.is_admin());

-- event_types
create policy "event_types_select_all"
on public.event_types for select
to authenticated
using (true);

create policy "event_types_insert_admin"
on public.event_types for insert
to authenticated
with check (public.is_admin());

create policy "event_types_update_admin"
on public.event_types for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "event_types_delete_admin"
on public.event_types for delete
to authenticated
using (public.is_admin());

-- team
create policy "team_select_all"
on public.team for select
to authenticated
using (true);

create policy "team_update_editors"
on public.team for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

-- =============================================================================
-- FIRST ADMIN (run manually after you create your auth account)
-- =============================================================================
-- update public.profiles
-- set role = 'admin'
-- where email = 'your-email@example.com';
