-- 012: Split AAR cost into venue and catering fields.
-- Preserves existing aar_cost column and data for backward compatibility.

alter table public.events
  add column if not exists aar_venue_cost text,
  add column if not exists aar_catering_cost text;
