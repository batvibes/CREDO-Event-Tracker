-- 015: Event-entry reference lists (foundation)
-- Adds controlled reusable lists for Commands, Locations, Venues, Caterers, and People.
-- Does NOT alter public.events columns, FKs, or historical event text values.
-- Does NOT change reporting/Trends/Financials/AAR/MIR calculation paths.
--
-- Step 2 note: CREDO Staff selector will use existing public.team_members.
-- Do not create a separate CREDO Staff reference table.
--
-- People is the shared roster for Facilitators and POCs.
-- Facilitators/POC free-text fields are intentionally NOT auto-split or backfilled
-- because historical values may contain multiple people/contact details.

-- =============================================================================
-- Normalization helpers
-- =============================================================================
-- Display cleaning: trim + collapse internal whitespace.
-- Normalized compare key: lower(cleaned display name). No fuzzy matching.

create or replace function public.clean_reference_display_name(raw text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'));
$$;

create or replace function public.normalize_reference_name(raw text)
returns text
language sql
immutable
as $$
  select lower(public.clean_reference_display_name(raw));
$$;

create or replace function public.set_reference_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.name := public.clean_reference_display_name(new.name);
  if new.name = '' then
    raise exception 'reference name is required';
  end if;
  new.normalized_name := public.normalize_reference_name(new.name);
  return new;
end;
$$;

-- =============================================================================
-- Tables
-- =============================================================================

create table public.commands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.caterers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create index commands_active_name_idx on public.commands (active, name);
create index locations_active_name_idx on public.locations (active, name);
create index venues_active_name_idx on public.venues (active, name);
create index caterers_active_name_idx on public.caterers (active, name);
create index people_active_name_idx on public.people (active, name);

-- =============================================================================
-- Triggers
-- =============================================================================

create trigger commands_set_normalized_name
  before insert or update of name on public.commands
  for each row execute function public.set_reference_normalized_name();

create trigger locations_set_normalized_name
  before insert or update of name on public.locations
  for each row execute function public.set_reference_normalized_name();

create trigger venues_set_normalized_name
  before insert or update of name on public.venues
  for each row execute function public.set_reference_normalized_name();

create trigger caterers_set_normalized_name
  before insert or update of name on public.caterers
  for each row execute function public.set_reference_normalized_name();

create trigger people_set_normalized_name
  before insert or update of name on public.people
  for each row execute function public.set_reference_normalized_name();

create trigger commands_updated_at
  before update on public.commands
  for each row execute function public.set_updated_at();

create trigger locations_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

create trigger venues_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

create trigger caterers_updated_at
  before update on public.caterers
  for each row execute function public.set_updated_at();

create trigger people_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- Authenticated users can SELECT.
-- Only users who can edit events (admin/editor) can INSERT or UPDATE.
-- =============================================================================

alter table public.commands enable row level security;
alter table public.locations enable row level security;
alter table public.venues enable row level security;
alter table public.caterers enable row level security;
alter table public.people enable row level security;

create policy "commands_select_all"
on public.commands for select
to authenticated
using (true);

create policy "commands_insert_editors"
on public.commands for insert
to authenticated
with check (public.can_edit_events());

create policy "commands_update_editors"
on public.commands for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

create policy "locations_select_all"
on public.locations for select
to authenticated
using (true);

create policy "locations_insert_editors"
on public.locations for insert
to authenticated
with check (public.can_edit_events());

create policy "locations_update_editors"
on public.locations for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

create policy "venues_select_all"
on public.venues for select
to authenticated
using (true);

create policy "venues_insert_editors"
on public.venues for insert
to authenticated
with check (public.can_edit_events());

create policy "venues_update_editors"
on public.venues for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

create policy "caterers_select_all"
on public.caterers for select
to authenticated
using (true);

create policy "caterers_insert_editors"
on public.caterers for insert
to authenticated
with check (public.can_edit_events());

create policy "caterers_update_editors"
on public.caterers for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

create policy "people_select_all"
on public.people for select
to authenticated
using (true);

create policy "people_insert_editors"
on public.people for insert
to authenticated
with check (public.can_edit_events());

create policy "people_update_editors"
on public.people for update
to authenticated
using (public.can_edit_events())
with check (public.can_edit_events());

-- =============================================================================
-- Safe backfill from existing event text fields
-- - Location and Venue remain separate sources
-- - Caterers come from catering_vendor only
-- - Blank / TBD ignored
-- - Case-insensitive exact normalized dedupe only (no fuzzy merge)
-- - Does not rewrite public.events
-- - People intentionally left empty (unsafe to parse free-text facilitators/poc)
-- =============================================================================

insert into public.commands (name, normalized_name)
select cleaned, normalized
from (
  select distinct on (public.normalize_reference_name(command))
    public.clean_reference_display_name(command) as cleaned,
    public.normalize_reference_name(command) as normalized
  from public.events
  where public.clean_reference_display_name(command) <> ''
    and public.normalize_reference_name(command) <> 'tbd'
  order by public.normalize_reference_name(command), public.clean_reference_display_name(command)
) source
on conflict (normalized_name) do nothing;

insert into public.locations (name, normalized_name)
select cleaned, normalized
from (
  select distinct on (public.normalize_reference_name(location))
    public.clean_reference_display_name(location) as cleaned,
    public.normalize_reference_name(location) as normalized
  from public.events
  where public.clean_reference_display_name(location) <> ''
    and public.normalize_reference_name(location) <> 'tbd'
  order by public.normalize_reference_name(location), public.clean_reference_display_name(location)
) source
on conflict (normalized_name) do nothing;

insert into public.venues (name, normalized_name)
select cleaned, normalized
from (
  select distinct on (public.normalize_reference_name(venue))
    public.clean_reference_display_name(venue) as cleaned,
    public.normalize_reference_name(venue) as normalized
  from public.events
  where public.clean_reference_display_name(venue) <> ''
    and public.normalize_reference_name(venue) <> 'tbd'
  order by public.normalize_reference_name(venue), public.clean_reference_display_name(venue)
) source
on conflict (normalized_name) do nothing;

insert into public.caterers (name, normalized_name)
select cleaned, normalized
from (
  select distinct on (public.normalize_reference_name(catering_vendor))
    public.clean_reference_display_name(catering_vendor) as cleaned,
    public.normalize_reference_name(catering_vendor) as normalized
  from public.events
  where public.clean_reference_display_name(catering_vendor) <> ''
    and public.normalize_reference_name(catering_vendor) <> 'tbd'
  order by public.normalize_reference_name(catering_vendor), public.clean_reference_display_name(catering_vendor)
) source
on conflict (normalized_name) do nothing;
