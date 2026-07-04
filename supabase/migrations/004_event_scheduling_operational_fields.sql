-- Event Enhancement Phase 1: scheduling and operational planning fields

alter table public.events
  add column if not exists date_type text not null default 'single',
  add column if not exists start_date text not null default 'TBD',
  add column if not exists end_date text not null default 'TBD',
  add column if not exists facilitators text not null default '',
  add column if not exists credo_staff text not null default '',
  add column if not exists time text not null default '',
  add column if not exists poc text not null default '';

update public.events
set
  start_date = date,
  end_date = date,
  date_type = 'single'
where date is not null
  and date not in ('', 'TBD');
