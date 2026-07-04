-- 002: Team manpower and command highlights notes
-- Creates team_members and command_highlights_notes only.
-- Does not alter existing tables.

create table public.team_members (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  billet_or_role    text not null,
  status_next_action text,
  prd_eaos          text,
  display_order     integer not null default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table public.command_highlights_notes (
  id          integer primary key,
  notes       text,
  updated_at  timestamptz default now()
);

insert into public.command_highlights_notes (id)
values (1)
on conflict (id) do nothing;
