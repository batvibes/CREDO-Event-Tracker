-- Event Operations Tracker: Trumba / Registration status.
-- Existing rows receive the column default. No other event data is rewritten.

alter table public.events
  add column if not exists registration text not null default 'Not Started';
