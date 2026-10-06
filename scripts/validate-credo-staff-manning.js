/**
 * Existing person can become CREDO Staff with a blank status, and every
 * current Manning row reaches the Monthly Impact Report.
 * Run: node scripts/validate-credo-staff-manning.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  buildMirPresentationZip,
  calculateMirSection2Data,
} from '../js/monthly-report-pptx-export.js';

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

const migration = read('supabase/migrations/046_credo_staff_blank_manning_status.sql');
const historicalSave = read('supabase/migrations/019_personnel_editing.sql');
const saveFn = extractFunction(migration, 'create or replace function public.save_directory_person(');
const reconcileFn = extractFunction(migration, 'create or replace function public.reconcile_directory_people(');
const saveInsert = sliceBetween(saveFn, 'insert into public.team_members (', 'update public.people');
const saveUpdate = sliceBetween(saveFn, 'update public.team_members', 'where id = v_manning_id');
const reconcileInsert = sliceBetween(reconcileFn, 'insert into public.team_members (', 'else');

assert(saveFn.includes('if p_id is null then'), 'an existing person is updated by id');
assert(saveFn.includes('where id = p_id'), 'the save updates the opened personnel record');
assert(saveFn.includes('person.id <> p_id'), 'creating a second person with the same display name is still rejected');
assert(saveFn.includes("hint = 'REFERENCE_NAME_EXISTS'"), 'duplicate person creation still raises REFERENCE_NAME_EXISTS');
assert(saveInsert.includes("coalesce(v_person_row.staff_status_next_action, '')"), 'a new Manning row stores a blank status when none is recorded');
assert(!saveUpdate.includes('status_next_action'), 'an existing Manning row does not overwrite status_next_action');
assert(saveUpdate.includes('billet_or_role = v_billet_name'), 'a staff edit syncs the Manning billet');
assert(saveUpdate.includes('prd_eaos = v_prd_name'), 'a staff edit syncs the Manning PRD / EAOS');
assert(saveFn.includes('delete from public.team_members'), 'removing CREDO Staff removes the Manning row');
assert(saveFn.includes('where person_id = v_person_row.id'), 'the Manning row stays linked to the same person');
assert(!/alter\s+table\s+public\.people[\s\S]*staff_status_next_action\s+set\s+not\s+null/i.test(migration), 'people.staff_status_next_action stays optional');
assert(!/unique\s*\([^)]*billet/i.test(migration), 'migration 046 does not make a billet unique');
assert(!saveFn.includes('Deputy Director'), 'the save does not special-case Deputy Director');

assert(reconcileInsert.includes("coalesce(v_status_name, '')"), 'reconciliation cannot insert a null Manning status');
assert(reconcileFn.includes('delete from public.team_members'), 'reconciliation still removes Manning when the survivor is not current staff');
assert(!migration.includes('create or replace function public.delete_directory_person('), 'migration 046 does not replace person deletion');
assert(historicalSave.includes('v_person_row.staff_status_next_action,'), 'migration 019 remains the historical save');
assert(!historicalSave.includes("coalesce(v_person_row.staff_status_next_action, '')"), 'migration 019 was not rewritten');

const migrationNames = fs.readdirSync(path.join(ROOT, 'supabase/migrations'));
for (const name of migrationNames) {
  const sql = read(`supabase/migrations/${name}`);
  assert(!/unique\s*\([^)]*(staff_billet_or_role|billet_or_role)/i.test(sql), `${name} does not unique a billet`);
}

const editor = read('js/team-personnel-editor.js');
assert(!/Status \/ Next Action/.test(editor), 'Status / Next Action is not a required editor field');
const app = read('js/app.js');
const prepareMir = sliceBetween(app, 'async function prepareMirReportGenerationInput(report)', '\n}');
assert(prepareMir.includes('fetchTeamMembers()'), 'MIR Manning reads team_members');
assert(prepareMir.includes('calculateMirSection2Data(teamMembers, personnelChanges)'), 'MIR receives the synchronized Manning rows and the separate personnel-change payload');
assert(!prepareMir.includes('isCredoStaff'), 'MIR does not keep a second staff list');

const staff = [
  { name: 'LCDR Shane Freyberg', billetOrRole: 'Deputy Director', statusNextAction: '', prdEaos: 'NOV 2026', displayOrder: 1 },
  { name: 'Staff Three', billetOrRole: 'Chaplain', statusNextAction: 'Active', prdEaos: 'JAN 2028', displayOrder: 2 },
  { name: 'Staff Four', billetOrRole: 'Training Officer', statusNextAction: '', prdEaos: 'APR 2029', displayOrder: 3 },
  { name: 'Staff Five', billetOrRole: 'Admin Lead', statusNextAction: 'Active', prdEaos: 'MAR 2028', displayOrder: 4 },
  { name: 'Staff Six', billetOrRole: 'Logistics', statusNextAction: '', prdEaos: 'SEP 2027', displayOrder: 5 },
  { name: 'LCDR Brian Hamer', billetOrRole: 'Deputy Director', statusNextAction: null, prdEaos: 'OCT 2030', displayOrder: 6 },
];
const section2 = calculateMirSection2Data(staff, {
  incoming: [{ name: 'Future Sailor', billetOrPosition: 'Counselor', date: 'JAN 2027' }],
  outgoing: [{ name: 'Departing Sailor', billetOrPosition: 'Admin', date: 'DEC 2026' }],
});
assert(section2.rows.length === 6, 'every current Manning row is kept');
assert(section2.rows[0].name === 'LCDR Shane Freyberg', 'display order is preserved');
assert(section2.rows[5].name === 'LCDR Brian Hamer', 'the sixth current staff member is not dropped');
assert(section2.rows[0].billetOrRole === 'Deputy Director' && section2.rows[5].billetOrRole === 'Deputy Director', 'two current staff members can share Deputy Director');
assert(section2.rows[5].statusNextAction === '', 'a null Manning status reaches the report as blank');
assert(section2.rows[5].prdEaos === 'OCT 2030', 'PRD / EAOS reaches the report');
assert(section2.personnelChanges.incoming.length === 1 && section2.personnelChanges.outgoing.length === 1, 'projected personnel changes stay separate from current Manning');

const fewer = calculateMirSection2Data(staff.slice(0, 3));
assert(fewer.rows.length === 3, 'a roster of five or fewer is not padded');

function shapeBlock(xml, name) {
  const pattern = new RegExp(`<p:sp>(?:(?!</p:sp>).)*?name="${name}"(?:(?!</p:sp>).)*?</p:sp>`, 's');
  return xml.match(pattern)?.[0] ?? '';
}

function shapeText(xml, name) {
  return shapeBlock(xml, name).match(/<a:t>([^<]*)<\/a:t>/)?.[1] ?? '';
}

function shapeBottom(xml, name) {
  const block = shapeBlock(xml, name);
  const off = block.match(/<a:off x="\d+" y="(\d+)"/);
  const ext = block.match(/<a:ext cx="\d+" cy="(\d+)"/);
  if (!off || !ext) return null;
  return Number(off[1]) + Number(ext[1]);
}

const template = fs.readFileSync(path.join(ROOT, 'public/templates/MIR_Master_Template.pptx'));
const section1Data = {
  monthReach: { commandsSupported: 1, beneficiariesServed: 1, workshopsConducted: 1, retreatsConducted: 1 },
  fytdMissionSupport: { marriageEnrichment: 1, personalGrowth: 1, suicidePrevention: 1, retreats: 1, fytdTotal: 1, commands: 1 },
};
const notes = { reachNotes: '', manpowerNotes: '', readinessNotes: '', commandHighlightsNotes: '' };

const fullBytes = await buildMirPresentationZip({
  templateBuffer: template,
  monthName: 'October',
  year: 2026,
  section1Data,
  section2Data: section2,
  notes,
});
const fullZip = await JSZip.loadAsync(fullBytes);
const fullSlide = await fullZip.file('ppt/slides/slide1.xml').async('string');
const fullShapeIds = [...fullSlide.matchAll(/<p:cNvPr id="(\d+)"/g)].map((match) => match[1]);
assert(fullShapeIds.length === new Set(fullShapeIds).size, 'extra Manning shapes use unique ids');
assert(shapeText(fullSlide, 'mir_manpower_row6_name') === 'LCDR Brian Hamer', 'the sixth Manning row is written into the report');
assert(shapeText(fullSlide, 'mir_manpower_row6_title') === 'Deputy Director', 'the sixth Manning billet is written into the report');
assert(shapeText(fullSlide, 'mir_manpower_row6_date') === 'OCT 2030', 'the sixth Manning PRD / EAOS is written into the report');
assert(shapeText(fullSlide, 'mir_manpower_row6_role') === '', 'a blank status stays blank in the report');
assert(shapeText(fullSlide, 'mir_manpower_row1_name') === 'LCDR Shane Freyberg', 'the first Manning row stays in display order');
const row6Bottom = shapeBottom(fullSlide, 'mir_manpower_row6_bg');
assert(row6Bottom !== null && row6Bottom < 4095750, 'extra Manning rows stay above the next report section');
assert(fullSlide.includes('PROJECTED PERSONNEL CHANGES'), 'projected personnel changes remain on the report');
assert(fullSlide.includes('>INCOMING<'), 'incoming personnel changes remain on the report');
assert(fullSlide.includes('>OUTGOING<'), 'outgoing personnel changes remain on the report');
assert(fullSlide.includes('>Future Sailor<'), 'an incoming projection is not replaced by current staff');

const shortBytes = await buildMirPresentationZip({
  templateBuffer: template,
  monthName: 'October',
  year: 2026,
  section1Data,
  section2Data: fewer,
  notes,
});
const shortZip = await JSZip.loadAsync(shortBytes);
const shortSlide = await shortZip.file('ppt/slides/slide1.xml').async('string');
assert(!shortSlide.includes('mir_manpower_row6_name'), 'five or fewer staff keep the existing five-row layout');
assert(shapeBlock(shortSlide, 'mir_manpower_row1_name').includes('y="2273300"'), 'the first five-row name stays at its current position');
assert(shortSlide.includes('>INCOMING<') && shortSlide.includes('>OUTGOING<'), 'the smaller roster still draws projected personnel changes');

if (errors.length) {
  console.error('validate-credo-staff-manning failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-credo-staff-manning: ok');
