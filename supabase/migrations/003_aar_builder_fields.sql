-- 003: AAR Builder editable fields on events
-- Adds AAR-only editable columns only.
-- Does not alter existing columns.

alter table public.events
  add column if not exists aar_cost text,
  add column if not exists aar_attire text,
  add column if not exists aar_travel_time text,
  add column if not exists aar_lessons_learned text;
