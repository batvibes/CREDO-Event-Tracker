/**
 * T4T completion history foundation checks.
 * Run: node scripts/validate-facilitator-t4t-completion-history.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  facilitatorT4tCompletionDisplayFields,
  facilitatorT4tCompletionHistory,
  summarizeFacilitatorPersonnel,
} from '../js/facilitator-management.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const migration = read('supabase/migrations/028_facilitator_t4t_completion_history.sql');
const app = read('js/app.js');
const db = read('js/db.js');
const model = read('js/facilitator-management.js');
const bodyStart = migration.indexOf('as $$');
const bodyEnd = migration.indexOf('$$;', bodyStart);
const body = migration.slice(bodyStart, bodyEnd);
const fetchSources = db.slice(db.indexOf('export async function fetchFacilitatorManagementSources'), db.indexOf('export async function fetchTeamDirectoryPersonnel'));
const detail = app.slice(app.indexOf('function openFacilitatorDetail'), app.indexOf('function closeFacilitatorDetail'));
const completionProfile = detail.slice(detail.indexOf('person.t4tCompletions'), detail.indexOf('FACILITATOR_EXPERIENCE_HEADING'));
const qualificationRead = fetchSources.slice(fetchSources.indexOf(".from('facilitator_qualifications')"), fetchSources.indexOf(".from('facilitator_products')"));

assert(migration.includes('create table public.facilitator_t4t_completions'), 'the completion history table is created');
for (const column of [
  'id uuid primary key',
  'person_id uuid not null',
  'product_id uuid not null',
  'completed_on date not null',
  'source_event_id uuid',
  'governing_source text',
  'notes text',
  'created_at timestamptz not null default now()',
  'created_by uuid not null',
]) {
  assert(migration.includes(column), `completion history includes ${column}`);
}
assert(migration.includes('references public.people (id) on delete restrict'), 'person history stays when a person row cannot be removed');
assert(migration.includes('references public.facilitator_products (id) on delete restrict'), 'product history stays when a product row cannot be removed');
assert(migration.includes('source_event_id uuid references public.events (id) on delete set null'), 'deleting a source Event keeps the completion');
assert(migration.includes('created_by uuid not null references auth.users (id)'), 'created_by records the authenticated user');
assert(migration.includes('unique (person_id, product_id, completed_on)'), 'one person cannot record the same product completion twice on one date');
assert(
  /create unique index facilitator_t4t_completions_source_event_key[\s\S]*where source_event_id is not null;/.test(migration),
  'one person cannot record the same product completion twice for one source Event',
);
assert(migration.includes('Historical T4T completions and renewals'), 'the table comment identifies completion history');
assert(migration.includes('Distinct from facilitator_t4t_product_experience'), 'completion history stays distinct from T4T facilitation');
assert(migration.includes('does not change qualification standing or the current T4T date'), 'history comments keep qualification facts unchanged');
assert(migration.includes("'safetalk_t4t', 'asist_t4t'"), 'safeTALK T4T and ASIST T4T are rejected as completion targets');

assert(migration.includes('create or replace function public.record_facilitator_t4t_completion('), 'the record function exists');
assert(migration.includes('p_completed_on date'), 'the record function takes a completion date');
assert(migration.includes('p_source_event_id uuid default null'), 'a source Event is optional');
assert(migration.includes('returns uuid'), 'the record function returns the inserted id');
assert(migration.includes('security definer') && migration.includes('set search_path = public'), 'the record function is security definer with a fixed search path');
assert(body.includes('auth.uid() is null') && body.includes('public.can_edit_events()') && body.includes("errcode = '42501'"), 'recording requires an authenticated editor or admin');
assert(body.includes('insert into public.facilitator_t4t_completions'), 'the function inserts one completion history row');
assert(body.includes('returning id into v_id') && body.includes('return v_id'), 'the function returns the inserted history id');
assert(body.includes('auth.uid()'), 'created_by is the authenticated user');
assert(!body.includes('save_facilitator_qualification'), 'the function does not save a qualification');
assert(!/update\s+public\.facilitator_qualifications/i.test(body), 'the function does not update qualifications');
assert(!/insert\s+into\s+public\.facilitator_qualifications/i.test(body), 'the function does not create qualifications');
assert(!/update\s+public\.people/i.test(body) && !/insert\s+into\s+public\.people/i.test(body), 'the function does not create or reactivate people');
assert(!/insert\s+into\s+public\.(?!facilitator_t4t_completions\b)/i.test(body), 'the function inserts only completion history');
assert(body.includes("hint = 'T4T_COMPLETION_DUPLICATE'") && body.includes("hint = 'T4T_COMPLETION_EVENT_DUPLICATE'"), 'duplicate completions raise a clear error');

assert(migration.includes('enable row level security'), 'completion history uses row level security');
assert(migration.includes('facilitator_t4t_completions_select_authenticated'), 'authenticated users can read completion history');
assert(migration.includes('grant select on table public.facilitator_t4t_completions to authenticated'), 'authenticated users receive select');
assert(!/grant\s+(insert|update|delete|all)/i.test(migration), 'direct table writes are not granted');
assert(migration.includes('revoke all on table public.facilitator_t4t_completions from public, anon, authenticated'), 'table privileges are reset before the select grant');
assert(migration.includes('revoke all on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) from public'), 'public cannot execute the record function');
assert(migration.includes('revoke all on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) from anon'), 'anonymous users cannot execute the record function');
assert(migration.includes('grant execute on function public.record_facilitator_t4t_completion(uuid, uuid, date, uuid, text, text) to authenticated'), 'authenticated users can execute the record function');

assert(fetchSources.includes(".from('facilitator_t4t_completions')"), 'completion history loads from facilitator_t4t_completions');
assert(fetchSources.includes('id, person_id, product_id, completed_on, source_event_id, governing_source, notes, created_at'), 'the profile read loads the completion display fields');
assert(!fetchSources.includes(".from('events')") && !model.includes(".from('events')") && !detail.includes(".from('events')"), 'completion history does not read Events from the browser');
assert(!/\.(insert|update|delete|upsert)\(/.test(fetchSources), 'the facilitator read does not write completion history');
assert(!qualificationRead.includes('created_at') && qualificationRead.includes('t4t_completed_on'), 'the qualification read stays separate from completion history');
assert(completionProfile.includes('FACILITATOR_T4T_COMPLETION_HEADING'), 'completion history is placed before recorded facilitation experience');
assert(completionProfile.includes('completions.length'), 'a person with no completion history does not render the section');
assert(completionProfile.includes('facilitatorT4tCompletionDisplayFields'), 'history rows use the completion display fields');
assert(!completionProfile.includes("createElement('button')"), 'completion history has no write or delete control');
assert(!completionProfile.includes('record_facilitator_t4t_completion') && !completionProfile.includes('saveFacilitatorQualification'), 'the profile does not record or save from completion history');
assert(!detail.includes('sourceEventId'), 'an unresolved source Event id is not shown');

const products = [
  { id: 'asist', name: 'ASIST', code: 'asist', sort_order: 10, active: true },
  { id: 'lenses', name: '4 Lenses', code: 'four_lenses', sort_order: 6, active: true },
  { id: 'retired', name: 'Marriage Enrichment Workshop', code: 'marriage_enrichment_workshop', sort_order: 101, active: false },
];
const history = facilitatorT4tCompletionHistory([
  { id: 'older', person_id: 'ada', product_id: 'asist', completed_on: '2024-10-18', governing_source: 'LivingWorks', notes: 'First course.' },
  { id: 'renewal', person_id: 'ada', product_id: 'asist', completed_on: '2026-01-22', governing_source: 'LivingWorks' },
  { id: 'lenses', person_id: 'ada', product_id: 'lenses', completed_on: '2024-10-18', governing_source: 'Four Lenses / Shipley Communication', created_at: '2024-10-19T00:00:00Z' },
  { id: 'same-day-later', person_id: 'ada', product_id: 'lenses', completed_on: '2024-10-18', created_at: '2024-10-20T00:00:00Z' },
  { id: 'retired', person_id: 'ada', product_id: 'retired', completed_on: '2020-01-01' },
], products);
assert(history.map((row) => row.id).join('|') === 'renewal|same-day-later|lenses|older|retired', 'newest completion dates stay first and same-day rows are preserved');
assert(history.filter((row) => row.productId === 'asist').map((row) => row.completedOn).join('|') === '2026-01-22|2024-10-18', 'two completions for one product both remain');
assert(history.find((row) => row.id === 'lenses').productName === '4 Lenses', 'product names resolve from facilitator products');
assert(history.find((row) => row.id === 'retired').productName === 'Marriage Enrichment Workshop', 'a stored inactive product name still resolves');
const renewalFields = facilitatorT4tCompletionDisplayFields(history.find((row) => row.id === 'renewal'));
assert(renewalFields.map((field) => `${field.label}:${field.value}`).join('|') === 'Completed:01/22/26|Qualification Authority / Source:LivingWorks', 'a source is shown and blank notes are omitted');
const notedFields = facilitatorT4tCompletionDisplayFields(history.find((row) => row.id === 'older'));
assert(notedFields.some((field) => field.label === 'Notes' && field.value === 'First course.'), 'notes are shown when present');
assert(!renewalFields.some((field) => field.label === 'Notes'), 'blank notes stay omitted');

const people = [
  { id: 'ada', name: 'Ada', active: true, is_facilitator: true },
  { id: 'history-only', name: 'Pat', active: true, is_facilitator: false },
];
const personnel = summarizeFacilitatorPersonnel(
  people,
  [],
  [{
    id: 'qual-1',
    person_id: 'ada',
    product_id: 'asist',
    standing: 'provisional',
    t4t_completed_on: '2026-05-18',
    trainer_authority: false,
  }],
  products,
  [],
  [
    { id: 'renewal', person_id: 'ada', product_id: 'asist', completed_on: '2026-01-22' },
    { id: 'older', person_id: 'ada', product_id: 'asist', completed_on: '2024-10-18' },
    { id: 'hidden', person_id: 'history-only', product_id: 'lenses', completed_on: '2025-02-01' },
  ],
);
assert(personnel.map((person) => person.id).join(',') === 'ada', 'completion history alone does not add a person to Facilitator Management');
assert(personnel[0].t4tCompletions.map((row) => row.id).join('|') === 'renewal|older', 'an included person keeps every completion, newest first');
assert(personnel[0].qualificationProducts[0].t4tCompletedOn === '2026-05-18', 'completion history does not replace the qualification T4T date');
assert(personnel[0].qualificationProducts[0].standing === 'provisional', 'completion history does not change standing');
assert(personnel[0].qualificationProducts[0].trainerAuthority === false, 'completion history does not change trainer authority');

if (errors.length) {
  console.error('validate-facilitator-t4t-completion-history failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-t4t-completion-history: ok');
