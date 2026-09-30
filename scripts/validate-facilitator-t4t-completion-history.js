/**
 * T4T completion history foundation checks.
 * Run: node scripts/validate-facilitator-t4t-completion-history.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const bodyStart = migration.indexOf('as $$');
const bodyEnd = migration.indexOf('$$;', bodyStart);
const body = migration.slice(bodyStart, bodyEnd);
const frontendPaths = ['js', 'css', 'index.html'];

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

let frontendDiff = '';
try {
  frontendDiff = execFileSync('git', ['diff', '--name-only', '--', ...frontendPaths], { cwd: ROOT, encoding: 'utf8' });
  const untrackedFrontend = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...frontendPaths], { cwd: ROOT, encoding: 'utf8' });
  frontendDiff = `${frontendDiff}${untrackedFrontend}`;
} catch (error) {
  errors.push(`frontend diff failed: ${error.message}`);
}
assert(frontendDiff.trim() === '', 'no frontend files were modified for completion history');

if (errors.length) {
  console.error('validate-facilitator-t4t-completion-history failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-facilitator-t4t-completion-history: ok');
