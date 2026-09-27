-- 018: Unified personnel directory foundation (Stage 1A)
-- Extends public.people so it can later be the canonical personnel directory.
-- Does not create a second personnel table or a second person identity.
-- Reuses public.people.normalized_name uniqueness (migration 015).
--
-- Does not alter public.team_members, public.events, public.monthly_reports,
-- or public.remove_reference_entry() (migration 017).
-- Does not rewrite people names, email, phone, ids, or active.
-- Does not parse events.facilitators or events.poc.
-- Does not infer CREDO Staff from Facilitator, POC, event participation,
-- or historical activity.
--
-- CREDO Staff is an explicit flag. Initial membership is copied once from
-- public.team_members. This is not a live sync: later Team edits stay on
-- team_members until a later stage. Monthly Impact Report Manning is unchanged
-- and must keep reading public.team_members.
--
-- public.people.active remains the current roster flag. It is the intended
-- future Active/Archived status, but this stage does not change removal.

-- =============================================================================
-- Directory columns
-- Role booleans default false. Existing people stay non-staff, non-facilitator,
-- and non-POC unless the team_members seed below marks CREDO Staff.
-- =============================================================================

alter table public.people
  add column if not exists rank_title text,
  add column if not exists command_organization text,
  add column if not exists installation text,
  add column if not exists is_credo_staff boolean not null default false,
  add column if not exists is_facilitator boolean not null default false,
  add column if not exists is_poc boolean not null default false,
  add column if not exists staff_billet_or_role text,
  add column if not exists staff_status_next_action text,
  add column if not exists staff_prd_eaos text,
  add column if not exists staff_display_order integer;

comment on table public.people is
  'Unified personnel directory foundation. Roles are explicit. CREDO Staff is not inferred from Facilitator, POC, event participation, or historical activity.';

comment on column public.people.rank_title is
  'Optional rank or title. Not used for identity.';

comment on column public.people.command_organization is
  'Optional command or organization. Not used for identity.';

comment on column public.people.installation is
  'Optional installation. Not used for identity.';

comment on column public.people.is_credo_staff is
  'Explicit CREDO Staff role. Not granted by Facilitator, POC, event participation, or historical activity.';

comment on column public.people.is_facilitator is
  'Explicit Facilitator role. Stage 1A leaves this false. It is not parsed from event text.';

comment on column public.people.is_poc is
  'Explicit Point of Contact role. Stage 1A leaves this false. It is not parsed from event text.';

comment on column public.people.staff_billet_or_role is
  'CREDO Staff billet or role, initially copied from team_members.billet_or_role.';

comment on column public.people.staff_status_next_action is
  'CREDO Staff status or next action, initially copied from team_members.status_next_action.';

comment on column public.people.staff_prd_eaos is
  'CREDO Staff PRD or EAOS, initially copied from team_members.prd_eaos.';

comment on column public.people.staff_display_order is
  'CREDO Staff display order, initially copied from team_members.display_order. Null when the person is not staff.';

comment on column public.people.active is
  'Current roster visibility flag and the intended future Active/Archived personnel status. Stage 1A does not change removal.';

-- Near-term staff roster reads filter active CREDO Staff and order by display
-- order. Facilitator and POC flags are not indexed: they are unset in this
-- stage, and this directory is small.
create index if not exists people_active_credo_staff_order_idx
  on public.people (staff_display_order, name)
  where active = true and is_credo_staff = true;

-- =============================================================================
-- Initial CREDO Staff seed from public.team_members only
-- Exact normalized_name match. No fuzzy matching. No event-text parsing.
-- Existing people columns other than the staff fields are left unchanged.
-- A matching inactive person stays inactive.
-- New people are active CREDO Staff with Facilitator and POC left false.
-- Re-running copies staff fields again only when those values differ, and
-- does not clear is_credo_staff on people who are absent from team_members.
-- Ambiguous team_members names abort rather than guessing a billet.
-- =============================================================================

do $seed$
declare
  blank_count integer;
  duplicate_name text;
begin
  select count(*)
    into blank_count
  from public.team_members
  where public.normalize_reference_name(name) = '';

  if blank_count > 0 then
    raise exception
      'Stage 1A CREDO Staff seed aborted: % public.team_members row(s) have a blank name',
      blank_count
      using errcode = 'P0001',
            hint = 'STAFF_SEED_BLANK_NAME';
  end if;

  select normalized_name
    into duplicate_name
  from (
    select public.normalize_reference_name(name) as normalized_name
    from public.team_members
    group by public.normalize_reference_name(name)
    having count(*) > 1
  ) duplicates
  limit 1;

  if duplicate_name is not null then
    raise exception
      'Stage 1A CREDO Staff seed aborted: multiple public.team_members rows share normalized name "%". Exact matching cannot choose one staff record.',
      duplicate_name
      using errcode = 'P0001',
            hint = 'STAFF_SEED_AMBIGUOUS';
  end if;

  insert into public.people as person (
    name,
    normalized_name,
    active,
    is_credo_staff,
    is_facilitator,
    is_poc,
    staff_billet_or_role,
    staff_status_next_action,
    staff_prd_eaos,
    staff_display_order
  )
  select
    public.clean_reference_display_name(tm.name),
    public.normalize_reference_name(tm.name),
    true,
    true,
    false,
    false,
    tm.billet_or_role,
    tm.status_next_action,
    tm.prd_eaos,
    tm.display_order
  from public.team_members tm
  on conflict (normalized_name) do update
  set
    is_credo_staff = true,
    staff_billet_or_role = excluded.staff_billet_or_role,
    staff_status_next_action = excluded.staff_status_next_action,
    staff_prd_eaos = excluded.staff_prd_eaos,
    staff_display_order = excluded.staff_display_order
  where
    person.is_credo_staff is distinct from true
    or person.staff_billet_or_role is distinct from excluded.staff_billet_or_role
    or person.staff_status_next_action is distinct from excluded.staff_status_next_action
    or person.staff_prd_eaos is distinct from excluded.staff_prd_eaos
    or person.staff_display_order is distinct from excluded.staff_display_order;
end
$seed$;

notify pgrst, 'reload schema';
