/**
 * CREDO Staff drag-and-drop order.
 * Run: node scripts/validate-credo-staff-reordering.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staffOrderAfterDrop, staffOrderAfterMove } from '../js/team-personnel-directory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function extractFunction(sql, signature) {
  const start = sql.indexOf(signature);
  const end = sql.indexOf('$$;', start);
  return start >= 0 && end > start ? sql.slice(start, end) : '';
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

const migration = read('supabase/migrations/047_reorder_credo_staff.sql');
const reorderFn = extractFunction(migration, 'create or replace function public.reorder_credo_staff(');
const saveFn = extractFunction(
  read('supabase/migrations/046_credo_staff_blank_manning_status.sql'),
  'create or replace function public.save_directory_person(',
);
const directory = read('js/team-personnel-directory.js');
const db = read('js/db.js');
const app = read('js/app.js');
const mir = read('js/monthly-report-pptx-export.js');
const staffRenderer = sliceBetween(directory, 'function renderStaffDirectory(', 'export function renderTeamDirectoryView(');
const compactRenderer = sliceBetween(directory, 'function renderCompactDirectory(', 'function staffCellText(');
const sortStaff = sliceBetween(directory, 'function sortStaff(', 'export function staffOrderAfterMove(');
const persist = sliceBetween(app, 'async function persistCredoStaffOrder(', 'function renderTeamDirectoryPanel(');
const staffBranch = sliceBetween(directory, 'const onReorder = options.editable && selectedTab === \'staff\'', 'panel.replaceChildren');

assert(sortStaff.includes('left.staffDisplayOrder') && sortStaff.includes('right.staffDisplayOrder'), 'CREDO Staff sorting still uses staffDisplayOrder');
assert(directory.includes("if (tab === 'staff') return sortStaff(active.filter((person) => person.isCredoStaff === true))"), 'CREDO Staff is still active people with the staff role');
assert(directory.includes("if (tab === 'poc') return sortByDisplayName(active)"), 'Points of Contact remains the broader active directory');
assert(staffBranch.includes('options.onReorder'), 'reordering is offered only on CREDO Staff');
assert(staffRenderer.includes('team-staff-grip'), 'CREDO Staff rows include a drag handle');
assert(staffRenderer.includes('aria-label') && staffRenderer.includes('staffReorderLabel(person)'), 'the drag handle names the person being reordered');
assert(directory.includes("event.key !== 'ArrowUp' && event.key !== 'ArrowDown'"), 'keyboard arrows can move a staff row');
assert(staffRenderer.includes('draggable = true'), 'the handle can be dragged');
assert(directory.includes("event.target.closest?.('.team-staff-grip')"), 'dragging starts from the handle');
assert(!compactRenderer.includes('team-staff-grip'), 'Points of Contact has no drag handle');
assert(!compactRenderer.includes('onReorder'), 'Points of Contact does not receive reorder behavior');

assert(reorderFn.includes('auth.uid() is null or not public.can_edit_events()'), 'reorder requires an authenticated editor');
assert(reorderFn.includes("hint = 'STAFF_ORDER_DUPLICATE'"), 'duplicate staff ids are rejected');
assert(reorderFn.includes("hint = 'STAFF_ORDER_NOT_STAFF'"), 'non-staff and inactive ids are rejected');
assert(reorderFn.includes("hint = 'STAFF_ORDER_STALE'"), 'a partial or stale roster is rejected');
assert(reorderFn.includes('person.active') && reorderFn.includes('person.is_credo_staff'), 'the saved ids are checked against active CREDO Staff');
assert(reorderFn.includes('staff_display_order = ordered.position'), 'people.staff_display_order receives the sequential position');
assert(reorderFn.includes('display_order = ordered.position'), 'team_members.display_order receives the same position');
assert(!reorderFn.includes('delete from public.people'), 'reordering does not delete personnel');
assert(!reorderFn.includes('billet_or_role'), 'reordering does not change billets');
assert(!reorderFn.includes('status_next_action'), 'reordering does not change Manning status');
assert(!reorderFn.includes('is_facilitator'), 'reordering does not change facilitator identity');
assert(!reorderFn.includes('event_personnel'), 'reordering does not change event personnel');
assert(!/unique\s*\([^)]*billet/i.test(migration), 'reordering does not make a billet unique');

assert(db.includes("rpc('reorder_credo_staff'"), 'the client saves order through reorder_credo_staff');
assert(db.includes('p_person_ids: personIds'), 'the client sends the ordered person ids');
assert(persist.includes('await reorderCredoStaff(personIds)'), 'a completed reorder is persisted');
assert(persist.includes('await renderTeam()'), 'the Team directory reloads from the database after a reorder');
assert(persist.includes('if (credoStaffReorderTask) return credoStaffReorderTask'), 'overlapping reorder saves are not sent together');
assert(persist.includes('alert('), 'a failed reorder tells the user');

const unstaff = sliceBetween(saveFn, 'else', 'return jsonb_build_object');
assert(unstaff.includes('delete from public.team_members'), 'removing CREDO Staff still removes the Manning row');
assert(unstaff.includes('where person_id = v_person_row.id'), 'role removal deletes only the linked Manning row');
assert(!saveFn.includes('delete from public.people'), 'unchecking CREDO Staff does not delete the person');
assert(mir.includes('(a.displayOrder ?? 0) - (b.displayOrder ?? 0)'), 'the Monthly Impact Report still sorts Manning by display order');
assert(sliceBetween(app, 'async function prepareMirReportGenerationInput(report)', '\n}').includes('fetchTeamMembers()'), 'the Monthly Impact Report still reads team_members');

const ids = ['scanlon', 'freyberg', 'hamer', 'houck'];
assert(staffOrderAfterMove(ids, 'hamer', 'up').join(',') === 'scanlon,hamer,freyberg,houck', 'move up swaps with the previous staff member');
assert(staffOrderAfterMove(ids, 'scanlon', 'up').join(',') === ids.join(','), 'the first staff member cannot move above the roster');
assert(staffOrderAfterDrop(ids, 'houck', 'freyberg', true).join(',') === 'scanlon,houck,freyberg,hamer', 'dropping before a row inserts at that position');
assert(staffOrderAfterDrop(ids, 'scanlon', 'scanlon', true).join(',') === ids.join(','), 'dropping a row on itself keeps the saved order');

if (errors.length) {
  console.error('validate-credo-staff-reordering failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-credo-staff-reordering: ok');
