-- MIR command highlight photos (Draft Report upload slots 1-3)

alter table public.monthly_reports
  add column if not exists photos jsonb not null default '{}'::jsonb;
