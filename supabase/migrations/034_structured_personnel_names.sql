-- 034: Structured personnel names compatibility foundation
-- Adds first/last name storage without changing existing personnel identity behavior.
-- Existing public.people.name and normalized_name remain authoritative compatibility
-- fields for current directory matching, aliases, event history, and RPC consumers.
--
-- This migration intentionally does not parse or rewrite existing names.

alter table public.people
  add column if not exists first_name text,
  add column if not exists last_name text;

comment on column public.people.first_name is
  'Structured personal first name. Nullable during compatibility migration; does not replace people.name yet.';

comment on column public.people.last_name is
  'Structured personal last name. Nullable during compatibility migration; does not replace people.name yet.';

notify pgrst, 'reload schema';
