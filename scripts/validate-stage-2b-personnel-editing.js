/**
 * Stage 2B personnel editing checks.
 * Run: node scripts/validate-stage-2b-personnel-editing.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  findPersonnelByHistoricalName,
  fullNameIncludesRank,
  personnelDisplayName,
  personnelMatchesHistoricalName,
} from '../js/personnel-identity.js';
import { validatePersonnelEditor } from '../js/team-personnel-editor.js';
import { isCommandHighlightsNotesVisible } from '../js/team-personnel-directory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const next = source.indexOf('\ncreate or replace function ', start + signature.length);
  const end = next < 0 ? source.length : next;
  return source.slice(start, end);
}

const migration = read('supabase/migrations/019_personnel_editing.sql');
const dbSource = read('js/db.js');
const appSource = read('js/app.js');
const editorSource = read('js/team-personnel-editor.js');
const directorySource = read('js/team-personnel-directory.js');
const eventSource = read('js/event-reference-fields.js');
const settingsSource = read('js/settings-reference-lists.js');

assert(migration.includes('create table public.people_name_aliases'), 'aliases extend public.people rather than a second person table');
assert(!/create table public\.(persons|personnel|staff_people)\b/.test(migration), 'no second canonical person table');
assert(migration.includes('references public.people (id)'), 'staff link references public.people');
assert(migration.includes('add constraint team_members_person_id_key unique (person_id)'), 'team_members.person_id is unique');
assert(migration.includes('person.is_credo_staff = true'), 'staff backfill requires the Stage 1A staff flag');
assert(migration.includes('STAFF_LINK_UNRESOLVED'), 'unlinked team members fail the migration');
assert(migration.includes('STAFF_LINK_AMBIGUOUS'), 'ambiguous team members fail the migration');
assert(!/similarity\s*\(|levenshtein|pg_trgm|soundex/i.test(migration), 'migration does not fuzzy-match identities');
assert(!/scanlon|freiberg/i.test(migration), 'migration does not reconcile named people');
assert(!/perform public\.reconcile_directory_people|select public\.reconcile_directory_people/.test(migration), 'reconciliation is not executed by the migration');

const saveFn = extractFunction(migration, 'create or replace function public.save_directory_person(');
const archiveFn = extractFunction(migration, 'create or replace function public.archive_directory_person(');
const reconcileFn = extractFunction(migration, 'create or replace function public.reconcile_directory_people(');
const renameFn = extractFunction(migration, 'create or replace function public.rename_reference_entry(');
const rememberFn = extractFunction(migration, 'create or replace function public.remember_personnel_display_alias(');

function declaredNames(fn) {
  const block = (fn.match(/declare([\s\S]*?)begin/i) || [, ''])[1];
  return [...block.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gim)].map((match) => match[1]);
}

assert(saveFn.includes('is_credo_staff = coalesce(p_is_credo_staff, false)'), 'staff role is saved from its own flag');
assert(saveFn.includes('is_facilitator = coalesce(p_is_facilitator, false)'), 'facilitator role is saved from its own flag');
assert(saveFn.includes('is_poc = coalesce(p_is_poc, false)'), 'POC role is saved from its own flag');
assert(saveFn.includes('insert into public.team_members'), 'adding staff creates the Manning row in the same function');
assert(saveFn.includes('delete from public.team_members'), 'removing staff removes the Manning row in the same function');
assert(!saveFn.includes('status_next_action ='), 'staff saves do not overwrite Manning status');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(saveFn), 'personnel save does not rewrite event text');
assert(!saveFn.includes('rename_reference_entry'), 'personnel save does not call the old rename path');

assert(archiveFn.includes('set active = false'), 'archive marks the person inactive');
assert(archiveFn.includes('delete from public.team_members'), 'archive removes current Manning');
assert(!archiveFn.includes('delete from public.people'), 'archive does not hard-delete the person');

assert(reconcileFn.includes('delete from public.people'), 'reconciliation retires only the duplicate person after consolidation');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(reconcileFn), 'reconciliation does not rewrite event text');
assert(reconcileFn.includes('remember_personnel_display_alias'), 'reconciliation preserves explicit historical names');
assert(reconcileFn.includes('PERSONNEL_CONFLICT'), 'reconciliation stops on conflicting values');

const identityGuard = rememberFn.indexOf('person.id <> p_person_id');
const conflictInsert = rememberFn.indexOf('on conflict (normalized_name) do nothing');
const ownerRecheck = rememberFn.lastIndexOf('is distinct from p_person_id');
assert(rememberFn.includes("That historical name is another person''s current identity."), 'alias helper still rejects another person\'s current identity');
assert(identityGuard > 0 && conflictInsert > identityGuard, 'current-identity safeguard still runs before an alias insert');
assert(ownerRecheck > conflictInsert, 'a unique alias conflict cannot silently keep another person\'s identity');

const peopleDelete = reconcileFn.indexOf('delete from public.people');
const firstRemember = reconcileFn.indexOf('remember_personnel_display_alias');
const manningRelink = reconcileFn.search(/update public\.team_members[\s\S]*?person_id = v_survivor_id/);
const aliasTransfer = reconcileFn.indexOf('set person_id = v_survivor_id');
assert(peopleDelete > 0 && firstRemember > peopleDelete, 'retired person is removed before their current identity is stored as an alias');
assert(manningRelink > 0 && manningRelink < peopleDelete, 'Manning is relinked before the retired person is deleted');
assert(aliasTransfer > 0 && aliasTransfer < peopleDelete, 'retired aliases are transferred before the retired person is deleted');
assert(reconcileFn.includes('v_retired_display'), 'reconciliation keeps the retired display identity');
assert(reconcileFn.includes('v_survivor_display'), 'reconciliation keeps the survivor\'s previous display identity');
assert(
  /delete from public\.people_name_aliases[\s\S]{0,200}person_id in \(v_survivor_id, v_retired_id\)/.test(reconcileFn),
  'alias cleanup is limited to the two reconciled records'
);
assert(!/or normalized_name\s*=/.test(reconcileFn), 'alias cleanup does not delete another person by normalized name');

for (const [label, fn] of [['save_directory_person', saveFn], ['reconcile_directory_people', reconcileFn]]) {
  const bare = declaredNames(fn).filter((name) => !name.startsWith('v_'));
  assert(bare.length === 0, `${label} locals are v_-prefixed (${bare.join(', ') || 'all prefixed'})`);
}
assert(!/rank_title\s*=\s*rank_title\b/.test(`${saveFn}\n${reconcileFn}`), 'rank_title is not assigned from an ambiguous variable');
assert(saveFn.includes('rank_title = v_rank_title'), 'save assigns rank from v_rank_title');
assert(saveFn.includes('name = v_personal_name'), 'save assigns the personal name from v_personal_name');
assert(reconcileFn.includes('rank_title = v_rank_title'), 'reconcile assigns rank from v_rank_title');
assert(reconcileFn.includes('name = v_personal_name'), 'reconcile assigns the personal name from v_personal_name');
assert(reconcileFn.includes('display_order = coalesce(v_display_order, v_manning.display_order)'), 'Manning display order uses prefixed variables');
assert(!/coalesce\(\s*display_order\s*,/.test(reconcileFn), 'Manning display order is not an ambiguous column reference');

const columnLocals = new Set([
  'rank_title', 'name', 'display_order', 'display_name', 'command_organization', 'installation',
  'email', 'phone', 'active', 'normalized_name', 'person_id', 'billet_or_role', 'prd_eaos',
  'status_next_action', 'staff_display_order', 'staff_billet_or_role', 'staff_prd_eaos',
  'staff_status_next_action',
]);
const collidingLocals = [];
for (const block of migration.matchAll(/\bdeclare\b([\s\S]*?)\bbegin\b/gi)) {
  for (const match of block[1].matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gim)) {
    if (columnLocals.has(match[1])) collidingLocals.push(match[1]);
  }
}
assert(collidingLocals.length === 0, `no PL/pgSQL local uses a table column name (${collidingLocals.join(', ') || 'none'})`);

assert(renameFn.includes("hint = 'PERSONNEL_USE_TEAM'"), 'person rename is rejected');
assert(!renameFn.includes('replace_reference_person_list'), 'person rename no longer rewrites facilitator or POC text');
assert(renameFn.includes("kind = 'command'"), 'command rename behavior remains');

assert(/export async function fetchTeamMembers\(\) \{\s*const \{ data, error \} = await supabase\s*\.from\('team_members'\)\s*\.select\('\*'\)\s*\.order\('display_order', \{ ascending: true \}\);/.test(dbSource), 'fetchTeamMembers() is unchanged');
assert(!dbSource.includes("renameReferenceEntry('person'"), 'client personnel rename does not call migration 016');
assert(dbSource.includes("error.code = 'PERSONNEL_USE_TEAM'"), 'client name edits are rejected away from the old rename');
assert(dbSource.includes("rpc('save_directory_person_structured'"), 'Team saves use the structured-name wrapper');
assert(read('supabase/migrations/035_structured_personnel_name_writes.sql').includes('public.save_directory_person('), 'the wrapper still calls the proven personnel save');
assert(dbSource.includes("rpc('archive_directory_person'"), 'archive uses the transactional function');
assert(dbSource.includes("rpc('reconcile_directory_people_structured'"), 'reconciliation uses the structured reconciliation function');
assert(read('supabase/migrations/032_repair_personnel_reconciliation.sql').includes('create or replace function public.reconcile_directory_people('), 'the legacy reconciliation function remains');

const prepareMir = appSource.match(/async function prepareMirReportGenerationInput\(report\) \{[\s\S]*?\n\}/);
assert(prepareMir?.[0].includes('fetchTeamMembers()'), 'MIR generation still reads team members');
assert(!prepareMir?.[0].includes('saveDirectoryPerson'), 'MIR generation does not use personnel editing');
assert(appSource.includes("settingsReferenceCategory !== 'people'"), 'Settings → People is not an editing workflow');
assert(appSource.includes("category === 'people') throw new Error('PERSONNEL_USE_TEAM')"), 'Settings people writes are rejected');
assert(!/Status \/ Next Action/.test(editorSource), 'personnel editor does not render Status / Next Action');
assert(appSource.includes('await saveDirectoryPerson(values)'), 'ordinary Save uses saveDirectoryPerson');
assert(appSource.includes('await reconcileDirectoryPeople(survivorId, retiredId, identity)'), 'Reconcile Records uses reconcileDirectoryPeople');
assert(!editorSource.includes('saveDirectoryPerson'), 'the editor does not save through the reconcile action');
assert(editorSource.includes('Final Identity'), 'reconciliation shows a final identity section');
assert(editorSource.includes('A combined legacy name is not split automatically.'), 'reconciliation does not claim to parse a legacy name');
assert(editorSource.includes("reconcileRank = source.rankTitle || ''"), 'final rank starts from the stored survivor rank');
assert(editorSource.includes('reconciliationStructuredNames(source)'), 'structured survivor names prepopulate reconciliation');
assert(!editorSource.includes('reconcileName = source.name'), 'reconciliation does not copy a legacy combined name into the name fields');
assert(editorSource.includes('Reconcile Records'), 'the reconcile action is labeled Reconcile Records');
assert(editorSource.includes('await onReconcile(survivorId, retiredId, finalIdentity)'), 'reconciliation passes the final rank and name');
assert(editorSource.includes("survivorChoice === 'this' ? person.id : selected.id"), 'the survivor id follows the radio selection');
assert(editorSource.includes("survivorChoice === 'this' ? selected.id : person.id"), 'the retired id follows the radio selection');
assert(editorSource.includes('save.disabled = busy || reconciliationArmed()'), 'ordinary Save is disabled once reconciliation is fully selected');
assert(editorSource.includes('if (reconciliationArmed()) return;'), 'a disabled reconciliation selection cannot submit the ordinary save');
assert(editorSource.includes('Reconcile personnel records?'), 'reconciliation asks for confirmation');
assert(editorSource.includes('The retired identity will be preserved as an alias.'), 'confirmation states that the retired identity is kept as an alias');
assert(editorSource.includes('Historical Event text will not be rewritten.'), 'confirmation states that event text is not rewritten');
assert(!editorSource.includes('reconcileDirectoryPeople('), 'the editor does not invoke reconciliation except through its callback');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(editorSource), 'the editor does not rewrite event text');
assert(!/Status \/ Next Action/.test(directorySource), 'Team directory does not render Status / Next Action');
assert(!/levenshtein|similarity\s*\(|pg_trgm|soundex/i.test(`${editorSource}\n${migration}`), 'no approximate identity matching was added');
assert(!editorSource.includes('duplicate score'), 'no duplicate scoring UI');

assert(eventSource.includes('canManage: () => false'), 'event personnel menus cannot rename or remove people');
assert(!eventSource.includes('updatePerson(id, updates)'), 'event personnel menus do not call updatePerson');
assert(eventSource.includes('findPersonnelByHistoricalName'), 'event text resolves through display identity or an explicit alias');

assert(settingsSource.includes('managed on the Team page'), 'Settings explains that personnel are managed on Team');
assert(isCommandHighlightsNotesVisible('staff') === true, 'Command Highlights remains on CREDO Staff');
assert(isCommandHighlightsNotesVisible('all') === false, 'Command Highlights remains off the other tabs');

assert(personnelDisplayName(null, 'CDR Scanlon') === 'CDR Scanlon', 'legacy rank-in-name still displays once');
assert(personnelDisplayName('CDR', 'John Scanlon') === 'CDR John Scanlon', 'structured rank and name display together');
assert(personnelDisplayName('CDR', 'CDR John Scanlon') === 'CDR John Scanlon', 'legacy rank is not doubled');
assert(personnelDisplayName('LCDR', 'Shane Freiberg') === 'LCDR Shane Freiberg', 'LCDR display identity');
assert(personnelDisplayName('RP1', 'James Brantley') === 'RP1 James Brantley', 'RP1 display identity');
assert(fullNameIncludesRank('CDR', 'CDR John Scanlon'), 'editor blocks storing the rank twice');
assert(!fullNameIncludesRank('CDR', 'John Scanlon'), 'personal name with a separate rank is accepted');
assert(validatePersonnelEditor({ name: '', rankTitle: 'Chaplain', isCredoStaff: false }) === 'First Name or Last Name is required.', 'a new person requires a personal name');
assert(
  validatePersonnelEditor({
    firstName: 'John',
    lastName: 'Scanlon',
    name: 'John Scanlon',
    rankTitle: 'CDR',
    isCredoStaff: true,
    staffBilletOrRole: '',
  }).includes('Billet'),
  'staff billet is required'
);

const legacy = { id: 'short', name: 'CDR Scanlon', rankTitle: null, aliases: [] };
const cleaned = {
  id: 'long',
  name: 'John Scanlon',
  rankTitle: 'CDR',
  aliases: [{ displayName: 'CDR Scanlon' }],
};
assert(personnelMatchesHistoricalName(legacy, 'CDR Scanlon'), 'untouched legacy display still matches');
assert(personnelMatchesHistoricalName(cleaned, 'CDR John Scanlon'), 'current display matches historical text');
assert(personnelMatchesHistoricalName(cleaned, 'CDR Scanlon'), 'explicit alias matches older event text');
assert(findPersonnelByHistoricalName([legacy, cleaned], 'CDR Scanlon').id === 'short', 'exact historical text does not skip a current legacy record');
assert(!personnelMatchesHistoricalName(cleaned, 'Scanlon'), 'partial names are not treated as matches');

const mirDiff = execFileSync('git', ['diff', '--', 'js/monthly-report-pptx-export.js'], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(mirDiff.trim() === '', 'monthly-report-pptx-export.js is unchanged');

if (errors.length) {
  console.error('validate-stage-2b-personnel-editing failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-stage-2b-personnel-editing: ok');
