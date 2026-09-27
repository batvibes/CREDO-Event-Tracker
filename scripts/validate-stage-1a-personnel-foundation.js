/**
 * Structural checks for Stage 1A unified personnel foundation.
 * Run: node scripts/validate-stage-1a-personnel-foundation.js
 *
 * Does not connect to Supabase and does not apply the migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/018_unified_personnel_foundation.sql');

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'") {
      out += ch;
      i += 1;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function stripSqlStrings(sql) {
  return sql.replace(/'(?:''|[^'])*'/g, "''");
}

function splitTopLevelCommas(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unquoteGitPath(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

assert(fs.existsSync(MIGRATION), 'migration 018 exists');

const raw = fs.existsSync(MIGRATION) ? fs.readFileSync(MIGRATION, 'utf8') : '';
const withoutComments = stripSqlComments(raw).toLowerCase();
const executable = stripSqlStrings(withoutComments);

const requiredColumns = [
  ['rank_title', /add column if not exists rank_title text\b/],
  ['command_organization', /add column if not exists command_organization text\b/],
  ['installation', /add column if not exists installation text\b/],
  ['is_credo_staff', /add column if not exists is_credo_staff boolean not null default false\b/],
  ['is_facilitator', /add column if not exists is_facilitator boolean not null default false\b/],
  ['is_poc', /add column if not exists is_poc boolean not null default false\b/],
  ['staff_billet_or_role', /add column if not exists staff_billet_or_role text\b/],
  ['staff_status_next_action', /add column if not exists staff_status_next_action text\b/],
  ['staff_prd_eaos', /add column if not exists staff_prd_eaos text\b/],
  ['staff_display_order', /add column if not exists staff_display_order integer\b/],
];

for (const [name, pattern] of requiredColumns) {
  assert(pattern.test(executable), `required personnel column ${name} is defined`);
}

assert(!/create table\b/.test(executable), 'migration does not create a table');
assert(!/drop table\b/.test(executable), 'migration does not drop a table');
assert(!/drop column\b/.test(executable), 'migration does not drop a column');
assert(!/truncate\b/.test(executable), 'migration does not truncate');
assert(!/\bdelete from\b/.test(executable), 'migration does not delete rows');
assert(!/create policy\b/.test(executable), 'migration does not add policies');
assert(!/disable row level security/.test(executable), 'migration does not disable RLS');
assert(!/\bto anon\b/.test(executable), 'migration does not grant anonymous access');
assert(!/\bgrant\b/.test(executable), 'migration does not add grants');
assert(!/create (or replace )?function\b/.test(executable), 'migration does not add functions');
assert(!/create trigger\b/.test(executable), 'migration does not add triggers');
assert(!/remove_reference_entry/.test(executable), 'migration does not modify remove_reference_entry');

const alterTables = [...executable.matchAll(/alter table\s+([a-z0-9_.]+)/g)].map((match) => match[1]);
assert(alterTables.length > 0, 'migration alters public.people');
assert(
  alterTables.every((table) => table === 'public.people'),
  `only public.people is altered (found ${alterTables.join(', ') || 'none'})`
);

for (const forbidden of ['public.team_members', 'public.events', 'public.monthly_reports']) {
  assert(!new RegExp(`alter table\\s+${forbidden}\\b`).test(executable), `${forbidden} is not altered`);
  assert(!new RegExp(`update\\s+${forbidden}\\b`).test(executable), `${forbidden} is not updated`);
  assert(!new RegExp(`insert into\\s+${forbidden}\\b`).test(executable), `${forbidden} is not inserted`);
  assert(!new RegExp(`drop table\\s+(if exists\\s+)?${forbidden}\\b`).test(executable), `${forbidden} is not dropped`);
}

assert(!/\bpublic\.events\b/.test(executable), 'executable SQL does not reference public.events');
assert(!/\bpublic\.monthly_reports\b/.test(executable), 'executable SQL does not reference public.monthly_reports');
assert(!/events\.facilitators/.test(executable), 'migration does not parse events.facilitators');
assert(!/events\.poc\b/.test(executable), 'migration does not parse events.poc');
assert(!/\bfacilitators\b/.test(executable), 'migration does not read facilitators text');
assert(!/similarity|levenshtein|pg_trgm|soundex|fuzzy/.test(executable), 'migration does not fuzzy-match names');

const withoutRoleFlags = executable
  .replace(/\bis_poc\b/g, '')
  .replace(/\bis_facilitator\b/g, '')
  .replace(/\bis_credo_staff\b/g, '');
assert(!/\bpoc\b/.test(withoutRoleFlags), 'migration does not reference POC text');
assert(!/\bfacilitator\b/.test(withoutRoleFlags), 'migration does not reference facilitator text outside the role flag');
assert(!/\bfrom\s+public\.events\b/.test(executable), 'personnel seed does not read events');

assert(/\bfrom\s+public\.team_members\b/.test(executable), 'staff seeding reads public.team_members');
assert(/\binsert into\s+public\.people\b/.test(executable), 'staff seeding writes public.people');
assert(/on conflict\s*\(\s*normalized_name\s*\)/.test(executable), 'seed reuses normalized_name uniqueness');

const leaked = executable.match(
  /\b(qualification|certification|t4t|expiration|availability|facilitator_history|development)\b/
);
assert(!leaked, `no qualification or development schema leaked${leaked ? `: ${leaked[1]}` : ''}`);

const insertMatch = executable.match(
  /insert into public\.people(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\(([\s\S]*?)\)\s*select\s*([\s\S]*?)\s*from public\.team_members\b/
);
assert(insertMatch, 'people insert selects from team_members');

if (insertMatch) {
  const columns = splitTopLevelCommas(insertMatch[1]);
  const values = splitTopLevelCommas(insertMatch[2]);
  assert(columns.length === values.length, 'people insert columns and values align');

  const paired = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  assert(paired.active === 'true', 'new team-created personnel are active');
  assert(paired.is_credo_staff === 'true', 'new team-created personnel are CREDO Staff');
  assert(paired.is_facilitator === 'false', 'new team-created personnel default Facilitator false');
  assert(paired.is_poc === 'false', 'new team-created personnel default POC false');
  assert(paired.staff_billet_or_role === 'tm.billet_or_role', 'staff billet comes from team_members');
  assert(paired.staff_status_next_action === 'tm.status_next_action', 'staff status comes from team_members');
  assert(paired.staff_prd_eaos === 'tm.prd_eaos', 'staff PRD/EAOS comes from team_members');
  assert(paired.staff_display_order === 'tm.display_order', 'staff display order comes from team_members');
  assert(!('email' in paired), 'seed insert does not write email');
  assert(!('phone' in paired), 'seed insert does not write phone');
}

const conflictMatch = executable.match(/on conflict\s*\(\s*normalized_name\s*\)\s*do update\s*set\s*([\s\S]*?)\s*where\b/);
assert(conflictMatch, 'existing people are updated only on normalized_name conflict');

if (conflictMatch) {
  const assignments = splitTopLevelCommas(conflictMatch[1]).map((assignment) => assignment.replace(/\s+/g, ' '));
  const assignedColumns = assignments.map((assignment) => assignment.split('=')[0].trim());
  assert(
    assignedColumns.join(',') ===
      'is_credo_staff,staff_billet_or_role,staff_status_next_action,staff_prd_eaos,staff_display_order',
    'conflict update writes only CREDO Staff fields'
  );
  assert(
    !/is_facilitator|is_poc|active|email|phone|\bname\b|normalized_name/.test(assignedColumns.join(',')),
    'conflict update does not rewrite identity, active, Facilitator, or POC'
  );
}

assert(/hint\s*=\s*'staff_seed_blank_name'/.test(withoutComments), 'blank team member names abort the seed');
assert(/having count\(\*\) > 1/.test(executable), 'duplicate normalized team member names abort the seed');
assert(/hint\s*=\s*'staff_seed_ambiguous'/.test(withoutComments), 'ambiguous staff names are rejected');
assert(!/is_facilitator\s*=\s*true/.test(executable), 'migration never sets Facilitator true');
assert(!/is_poc\s*=\s*true/.test(executable), 'migration never sets POC true');
assert(!/is_credo_staff\s*=\s*false/.test(executable), 'seed does not clear CREDO Staff');

const indexes = [...executable.matchAll(/create index if not exists\s+([a-z0-9_]+)/g)].map((match) => match[1]);
assert(
  indexes.length === 1 && indexes[0] === 'people_active_credo_staff_order_idx',
  'only the active CREDO Staff display-order index is added'
);
assert(
  /where active = true and is_credo_staff = true/.test(executable),
  'staff index is limited to active CREDO Staff'
);

const removalPath = path.join(ROOT, 'supabase/migrations/017_reference_roster_removal.sql');
const removalSql = fs.readFileSync(removalPath, 'utf8');
assert(/function public\.remove_reference_entry/.test(removalSql), 'migration 017 still defines remove_reference_entry');

const protectedPaths = [
  'js/app.js',
  'js/db.js',
  'js/monthly-report-pptx-export.js',
  'supabase/migrations/002_team_manpower.sql',
  'supabase/migrations/010_monthly_reports.sql',
  'supabase/migrations/011_monthly_reports_delete_policy.sql',
  'supabase/migrations/015_event_reference_lists.sql',
  'supabase/migrations/016_global_reference_rename.sql',
  'supabase/migrations/017_reference_roster_removal.sql',
];

let status = '';
try {
  status = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' });
} catch (error) {
  errors.push(`git status failed: ${error.message}`);
}

const untracked = [];
for (const line of status.split('\n')) {
  if (!line.trim()) continue;
  const code = line.slice(0, 2);
  const filePath = unquoteGitPath(line.slice(3));
  if (protectedPaths.includes(filePath)) {
    errors.push(`protected file changed: ${filePath}`);
  }
  if (code !== '??') {
    errors.push(`tracked file changed: ${line}`);
    continue;
  }
  untracked.push(filePath);
}

const allowedUntracked = new Set([
  'supabase/migrations/018_unified_personnel_foundation.sql',
  'scripts/validate-stage-1a-personnel-foundation.js',
  'scripts/spike-output/section_iii_sorm_command_function_navy_governance_training  -  Repaired.pptx',
  'scripts/spike-output/section_iv_navstds_occstds_navy_governance_training  -  Repaired.pptx',
]);

for (const filePath of untracked) {
  if (!allowedUntracked.has(filePath)) {
    errors.push(`unexpected untracked file: ${filePath}`);
  }
  if (filePath.startsWith('js/')) {
    errors.push(`untracked JS file is outside Stage 1A: ${filePath}`);
  }
}

assert(
  untracked.includes('supabase/migrations/018_unified_personnel_foundation.sql'),
  'migration 018 is present as an unapplied untracked file'
);

if (errors.length) {
  console.error('validate-stage-1a-personnel-foundation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-1a-personnel-foundation: ok');
