-- AAR Finalize Phase 5A: permanent sequence assignment on finalize

alter table public.events
  add column if not exists aar_finalized boolean not null default false,
  add column if not exists aar_finalized_at timestamptz null,
  add column if not exists aar_sequence_number text null;

create unique index if not exists events_aar_sequence_number_unique_idx
  on public.events (aar_sequence_number)
  where aar_sequence_number is not null;
