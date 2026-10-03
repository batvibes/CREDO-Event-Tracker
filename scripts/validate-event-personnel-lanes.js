/**
 * Cross-lane personnel architecture checks.
 * Run: node scripts/validate-event-personnel-lanes.js
 *
 * Reads the current app, directory, and migrations. Does not connect to
 * Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCredoStaffTokens,
  parseFacilitatorTokens,
  parsePocTokens,
  serializeCredoStaff,
  serializeFacilitators,
  serializePoc,
} from '../js/event-reference-fields.js';
import { summarizeFacilitatorPersonnel } from '../js/facilitator-management.js';
import {
  TEAM_DIRECTORY_TABS,
  filterTeamDirectory,
  mapTeamDirectoryPerson,
  teamDirectoryRoleBadges,
} from '../js/team-personnel-directory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start >= 0 && end > start, `missing slice ${startNeedle}`);
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

const app = read('js/app.js');
const db = read('js/db.js');
const fields = read('js/event-reference-fields.js');
const directory = read('js/team-personnel-directory.js');
const facilitator = read('js/facilitator-management.js');
const tokens = read('supabase/migrations/024_event_workshop_t4t.sql');
const experience = read('supabase/migrations/025_facilitator_t4t_product_experience.sql');
const dates = read('supabase/migrations/021_facilitator_experience_foundation.sql');
const reuse = read('supabase/migrations/033_reuse_or_create_event_person.sql');
const reconcile = read('supabase/migrations/032_repair_personnel_reconciliation.sql');
const completion = read('supabase/migrations/028_facilitator_t4t_completion_history.sql');
const qualification = read('supabase/migrations/020_facilitator_qualification_foundation.sql');

const laterMigrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
  .filter((name) => name > '024_event_workshop_t4t.sql' && name.endsWith('.sql'));
assert(
  laterMigrations.every((name) => !read(`supabase/migrations/${name}`).includes('view public.facilitator_event_tokens')),
  'facilitator tokens stay the Migration 024 view',
);
assert(
  laterMigrations.filter((name) => name > '025_facilitator_t4t_product_experience.sql').every((name) => {
    const text = read(`supabase/migrations/${name}`);
    return !text.includes('view public.facilitator_product_experience')
      && !text.includes('view public.facilitator_t4t_product_experience');
  }),
  'ordinary and T4T experience stay the Migration 025 views',
);

const tokenView = sliceBetween(
  tokens,
  'create or replace view public.facilitator_event_tokens',
  'comment on view public.facilitator_event_tokens',
);
const ordinaryView = sliceBetween(
  experience,
  'create or replace view public.facilitator_product_experience',
  'comment on view public.facilitator_product_experience',
);
const t4tView = sliceBetween(
  experience,
  'create or replace view public.facilitator_t4t_product_experience',
  'comment on view public.facilitator_t4t_product_experience',
);
const dateFn = sliceBetween(
  dates,
  'create or replace function public.facilitator_event_date',
  'comment on function public.facilitator_event_date',
);
const resolutionFn = sliceBetween(
  dates,
  'create or replace function public.facilitator_token_resolution',
  'comment on function public.facilitator_token_resolution',
);
const reuseFn = sliceBetween(
  reuse,
  'create or replace function public.reuse_or_create_event_person',
  'comment on function public.reuse_or_create_event_person',
);
const completionFn = sliceBetween(
  completion,
  'create or replace function public.record_facilitator_t4t_completion',
  'comment on function public.record_facilitator_t4t_completion',
);
const qualificationSave = sliceBetween(
  qualification,
  'create or replace function public.save_facilitator_qualification',
  'comment on function public.save_facilitator_qualification',
);

assert(tokenView.includes('public.split_facilitator_tokens(event.facilitators)'), 'facilitator history reads only events.facilitators');
assert(!tokenView.includes('credo_staff') && !tokenView.includes('event.poc'), 'staff and POC text are not facilitator tokens');
assert(tokenView.includes('public.facilitator_token_resolution(token.token)'), 'facilitator identity uses exact resolution');
assert(tokenView.includes('else null::uuid'), 'a workshop without an allowed curriculum credits no product');
assert(ordinaryView.includes('count(distinct token.event_id)'), 'ordinary facilitation counts an event once');
assert(t4tView.includes('count(distinct token.event_id)'), 'T4T facilitation counts an event once');
assert(ordinaryView.includes('min(token.recorded_on) as first_recorded_facilitation_on'), 'first recorded facilitation is the earliest eligible date');
assert(ordinaryView.includes('max(token.recorded_on) as most_recent_facilitation_on'), 'most recent facilitation is the latest eligible date');
assert(ordinaryView.includes('token.recorded_on <= current_date'), 'a facilitator event on today can count');
assert(!ordinaryView.includes('token.recorded_on < current_date'), 'today is not excluded from completed facilitation');
assert(t4tView.includes('token.recorded_on <= current_date'), 'T4T facilitation uses the same date cutoff');
assert(ordinaryView.includes('token.recorded_on is not null'), 'a missing recorded date does not count');
assert(ordinaryView.includes('token.product_id is not null'), 'an unmapped product does not count');
assert(
  ordinaryView.includes("not (\n    token.is_t4t is true\n    or coalesce(token.event_type, '') in ('SafeTalk T4T', 'ASIST T4T')\n  )"),
  'ordinary experience excludes T4T deliveries',
);
assert(
  t4tView.includes("token.is_t4t is true\n    or token.event_type in ('SafeTalk T4T', 'ASIST T4T')"),
  'T4T experience is the complement of ordinary experience',
);
assert(!ordinaryView.includes('facilitator_t4t_completions') && !t4tView.includes('facilitator_t4t_completions'), 'attendance rows are not facilitation events');
assert(dateFn.includes("v_raw = '' or v_raw = 'TBD'") && dateFn.includes('return null'), 'TBD and blank dates produce no facilitation date');
assert(dateFn.includes("v_iso !~ '^\\d{4}-\\d{2}-\\d{2}$'"), 'a non-ISO date produces no facilitation date');
assert(resolutionFn.includes('count(*) = 1') && resolutionFn.includes('else null::uuid'), 'ambiguous facilitator tokens stay unresolved');
assert(!/levenshtein|similarity\s*\(|pg_trgm|soundex/i.test(resolutionFn), 'facilitator resolution is not fuzzy');

const aarBody = sliceBetween(app, 'function populateAarDocument', 'syncAarCurriculumRow(event, root);');
assert(count(aarBody, 'event.facilitators') === 1, 'AAR reads facilitator text once');
assert(count(aarBody, 'event.credoStaff') === 1, 'AAR reads staffing text once');
assert(count(aarBody, 'event.poc') === 1, 'AAR reads POC text once');
assert(aarBody.includes("setAarRmtField('Facilitator(s)', aarPlainField(event.facilitators)"), 'AAR Facilitator(s) comes from events.facilitators');
assert(aarBody.includes("setAarRmtField('Staffing', aarPlainField(event.credoStaff)"), 'AAR Staffing comes from events.credo_staff');
assert(aarBody.includes("setAarRmtField(\n    'Point(s) of Contact',\n    aarPlainField(event.poc)"), 'AAR Point(s) of Contact comes from events.poc');

const eventRow = sliceBetween(db, 'export function eventToRow', 'function eventWriteRow');
assert(eventRow.includes("facilitators: event.facilitators ?? ''"), 'event save writes facilitator text');
assert(eventRow.includes("credo_staff: event.credoStaff ?? ''"), 'event save writes staffing text');
assert(eventRow.includes("poc: event.poc ?? ''"), 'event save writes POC text');
assert(!eventRow.includes('is_facilitator') && !eventRow.includes('is_credo_staff') && !eventRow.includes('is_poc'), 'saving an event does not write personnel role flags');

const formRead = sliceBetween(app, 'function readEventFieldsFromForm', 'function syncEventCurriculumField');
assert(formRead.includes("facilitators: String(data.get('facilitators')"), 'the event form keeps facilitator text on its own field');
assert(formRead.includes("credoStaff: String(data.get('credoStaff')"), 'the event form keeps staffing text on its own field');
assert(formRead.includes("poc: String(data.get('poc')"), 'the event form keeps POC text on its own field');

const personA = {
  id: 'person-a',
  name: 'Person A',
  rankTitle: 'CDR',
  email: 'a@example.test',
  active: true,
  isFacilitator: false,
  isCredoStaff: false,
  isPoc: false,
};
assert(serializeFacilitators([{ name: 'Person A' }]) === 'Person A', 'facilitator text is the selected display name');
assert(serializeCredoStaff([{ name: 'Person A' }]) === 'Person A', 'staff text is its own serialized value');
assert(serializePoc([{ name: 'Person A', email: 'a@example.test' }]) === 'Person A <a@example.test>', 'POC text can carry its own email snapshot');
assert(
  parseFacilitatorTokens('Person A', [personA]).tokens[0].id === 'person-a'
    && parseFacilitatorTokens('Person A', [personA]).tokens[0].orphan === false,
  'a facilitator token reuses the canonical person',
);
assert(!JSON.stringify(parseFacilitatorTokens('Person A', [personA])).includes('isFacilitator":true'), 'selecting a facilitator does not set is_facilitator');

const products = [{ id: 'product-1', code: 'four_lenses', name: '4 Lenses', sort_order: 1, active: true }];
const neutral = { id: 'person-a', name: 'Person A', active: true, is_facilitator: false };
assert(summarizeFacilitatorPersonnel([neutral], [], [], products, [], []).length === 0, 'a person with no facilitator evidence stays out of Facilitator Management');
assert(
  summarizeFacilitatorPersonnel(
    [{ id: 'staff-only', name: 'Staff Only', active: true, is_facilitator: false, is_credo_staff: true, is_poc: true }],
    [],
    [],
    products,
    [],
    [],
  ).length === 0,
  'staff and POC flags alone do not enter Facilitator Management',
);
const facilitated = summarizeFacilitatorPersonnel(
  [neutral],
  [{
    person_id: 'person-a',
    product_id: 'product-1',
    events_conducted: 1,
    first_recorded_facilitation_on: '2026-01-15',
    most_recent_facilitation_on: '2026-01-15',
  }],
  [],
  products,
  [],
  [],
);
assert(facilitated.length === 1 && facilitated[0].isFacilitator === false, 'recorded facilitation includes the person without setting the flag');
assert(facilitated[0].experience.length === 1 && facilitated[0].t4tExperience.length === 0, 'ordinary history stays out of T4T history');
assert(facilitated[0].experience[0].eventsConducted === 1, 'one eligible facilitator event counts once');
assert(
  facilitated[0].experience[0].firstRecordedOn === '2026-01-15'
    && facilitated[0].experience[0].mostRecentOn === '2026-01-15',
  'first and most recent recorded facilitation come from the experience row',
);
const t4tFacilitated = summarizeFacilitatorPersonnel(
  [neutral],
  [],
  [],
  products,
  [{
    person_id: 'person-a',
    product_id: 'product-1',
    events_conducted: 1,
    first_recorded_facilitation_on: '2026-02-01',
    most_recent_facilitation_on: '2026-02-01',
  }],
  [],
);
assert(t4tFacilitated[0].experience.length === 0 && t4tFacilitated[0].t4tExperience.length === 1, 'T4T facilitation stays on its own history');
const attended = summarizeFacilitatorPersonnel(
  [neutral],
  [],
  [],
  products,
  [],
  [{ person_id: 'person-a', product_id: 'product-1', completed_on: '2026-03-01', source_event_id: null }],
);
assert(attended.length === 1 && attended[0].experience.length === 0 && attended[0].t4tExperience.length === 0, 'a T4T completion does not create a facilitation count');

const staffMount = sliceBetween(fields, 'function mountStaffMulti', 'function renderAddOtherPanel');
const otherStaff = sliceBetween(fields, 'function addOtherStaffName', 'function renderAddOtherPanel');
assert(staffMount.includes('getTeamMembers()'), 'the CREDO Staff selector reads current Manning');
assert(otherStaff.includes('id: null') && otherStaff.includes('orphan: true'), 'Add Other Staff stores event-only text');
assert(!otherStaff.includes('createPerson') && !otherStaff.includes('reuse_or_create_event_person'), 'Add Other Staff does not create a person');
const orphanStaff = parseCredoStaffTokens('Visiting Chaplain', [{ id: 'manning-1', name: 'Person A' }], [personA]);
assert(orphanStaff.tokens[0].id === null && orphanStaff.tokens[0].orphan === true, 'a non-Manning staff name stays event text');
const manningStaff = parseCredoStaffTokens('Person A', [{ id: 'manning-1', name: 'Person A' }], [personA]);
assert(manningStaff.tokens[0].id === 'manning-1' && manningStaff.tokens[0].orphan === false, 'a current Manning name stays a staff selection');
assert(db.includes(".from('team_members')"), 'Manning reads stay on team_members');

const pocParsed = parsePocTokens('Person A <a@example.test>', [personA]);
assert(pocParsed.tokens[0].id === 'person-a' && pocParsed.tokens[0].orphan === false, 'POC text reuses the canonical person');
assert(!JSON.stringify(pocParsed).includes('"isPoc":true') && !JSON.stringify(pocParsed).includes('"isFacilitator":true'), 'POC reuse does not set role flags');
assert(fields.includes("name: 'poc'") && fields.includes('getPeople,'), 'the POC selector uses the active people directory');
assert(fields.includes("serialize: serializePoc"), 'POC saves through its own serializer');
assert(!directory.includes('person.isPoc === true'), 'Team Points of Contact does not depend on is_poc');

assert(reuseFn.includes('public.normalize_reference_name(person.name) = v_norm'), 'an exact personal name reuses the person');
assert(reuseFn.includes('public.personnel_display_name(person.rank_title, person.name)'), 'a display name, including a separate rank, reuses the person');
assert(reuseFn.includes('alias.normalized_name = v_norm'), 'an exact alias reuses the person');
assert(reuseFn.includes('cardinality(v_ids) > 1'), 'an ambiguous name stops before a choice or an insert');
assert(reuseFn.includes("hint = 'PERSONNEL_IDENTITY_AMBIGUOUS'"), 'an ambiguous name has its own error');
assert(reuseFn.includes('values (v_name, true, false, false, false)'), 'a new person is active and role-neutral');
assert(!/\bupdate\s+public\.people\b/i.test(reuseFn), 'reuse does not change the existing person');
assert(!/insert\s+into\s+public\.team_members/i.test(reuseFn), 'event person creation does not create Manning');
assert(!/facilitator_qualifications|facilitator_t4t_completions/i.test(reuseFn), 'event person creation does not create qualification or T4T completion');
assert(db.includes("rpc('reuse_or_create_event_person'"), 'Add Person uses the neutral reuse function');
assert(fields.includes('onCreatePerson({ name: personName })'), 'Add Person sends the typed name to that function');
assert(!sliceBetween(fields, "menu.querySelector('.ref-inline-save')", 'function personSecondaryText').includes('findPersonnelByHistoricalName'), 'Add Person does not keep the first browser match');

assert(!reconcile.includes('update public.events'), 'reconciliation does not rewrite event text');
assert(!reconcile.includes('event.facilitators') && !reconcile.includes('events.poc') && !reconcile.includes('events.credo_staff'), 'reconciliation does not assign historical personnel text');
assert(reconcile.includes('update public.facilitator_qualifications'), 'reconciliation keeps facilitator qualifications');
assert(reconcile.includes('update public.facilitator_t4t_completions'), 'reconciliation keeps T4T completions');
assert(reconcile.includes('delete from public.t4t_attendance_created_people'), 'reconciliation removes retired attendance provenance');
assert(!reconcile.includes('insert into public.t4t_attendance_created_people'), 'reconciliation does not mark the survivor as attendance-created');
assert(reconcile.includes('perform public.remember_personnel_display_alias(v_survivor_id, v_retired_display, v_display_name)'), 'the retired display becomes an alias of the survivor');

assert(TEAM_DIRECTORY_TABS.map((tab) => tab.id).join(',') === 'staff,poc', 'Team shows CREDO Staff and Points of Contact');
const activeNeutral = mapTeamDirectoryPerson({ id: 'n', name: 'Neutral Person', active: true });
const activeStaff = mapTeamDirectoryPerson({ id: 's', name: 'Staff Person', active: true, is_credo_staff: true });
const activeFacilitator = mapTeamDirectoryPerson({ id: 'f', name: 'Facilitator Person', active: true, is_facilitator: true });
const inactive = mapTeamDirectoryPerson({ id: 'i', name: 'Inactive Person', active: false, is_poc: true, is_credo_staff: true });
const roster = [activeNeutral, activeStaff, activeFacilitator, inactive];
assert(filterTeamDirectory(roster, 'poc').map((person) => person.id).join(',') === 'f,n,s', 'Points of Contact lists every active person');
assert(!filterTeamDirectory(roster, 'poc').some((person) => person.id === 'i'), 'inactive people stay out of Points of Contact');
assert(filterTeamDirectory(roster, 'staff').map((person) => person.id).join(',') === 's', 'CREDO Staff lists current staff only');
assert(teamDirectoryRoleBadges(activeStaff).map((badge) => badge.label).join(',') === 'Staff', 'staff badges remain informational');
assert(teamDirectoryRoleBadges(activeNeutral).length === 0, 'a person with no explicit role has no badge');
assert(
  summarizeFacilitatorPersonnel(
    [mapTeamDirectoryPerson({ id: 'n', name: 'Neutral Person', active: true, is_facilitator: false })],
    [],
    [{ id: 'q', person_id: 'n', product_id: 'product-1', standing: 'current', trainer_authority: false }],
    products,
    [],
    [],
  ).length === 1,
  'a qualification makes a person facilitator-relevant',
);
assert(facilitator.includes('person.isFacilitator !== true') && facilitator.includes('t4tCompletions.length === 0'), 'Facilitator Management requires facilitator relevance');
assert(!facilitator.includes('events.poc') && !facilitator.includes('events.credo_staff') && !facilitator.includes('credoStaff'), 'Facilitator Management does not read staff or POC event text');

assert(!completionFn.includes('trainer_authority'), 'recording T4T attendance does not set trainer authority');
assert(!completionFn.includes('facilitator_qualifications'), 'recording T4T attendance does not write a qualification');
assert(!completionFn.includes('facilitator_event_tokens'), 'recording T4T attendance does not write facilitation');
assert(qualificationSave.includes('v_trainer_authority boolean := coalesce(p_trainer_authority, false)'), 'trainer authority comes from the explicit qualification argument');
assert(!qualificationSave.includes('events.facilitators'), 'trainer authority is not derived from event text');

if (errors.length) {
  console.error('validate-event-personnel-lanes failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-event-personnel-lanes: ok');
