/**
 * Team Points of Contact PDF export wiring.
 * Run: node scripts/validate-team-poc-pdf-export.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { teamPocPdfFilename, teamPocPdfFullName } from '../js/team-poc-pdf-export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const pdf = read('js/team-poc-pdf-export.js');
const app = read('js/app.js');
const mount = app.slice(app.indexOf('function mountTeamPocExport'), app.indexOf('async function exportTeamPointsOfContactPdf'));
const exporter = app.slice(app.indexOf('async function exportTeamPointsOfContactPdf'), app.indexOf('function syncCommandHighlightsNotesVisibility'));

assert(fs.existsSync(path.join(ROOT, 'js/team-poc-pdf-export.js')), 'the Points of Contact PDF module exists');
assert(app.includes("id = 'team-poc-export-btn'") && app.includes("button.textContent = 'Export PDF'"), 'Points of Contact has an Export PDF button');
assert(app.includes("if (tab === 'poc') mountTeamPocExport(panel)"), 'the export button is added only on the Points of Contact tab');
assert(mount.includes("filterTeamDirectory(teamDirectoryPersonnel, 'poc')"), 'the button uses the Points of Contact directory population');
assert(exporter.includes("filterTeamDirectory(teamDirectoryPersonnel, 'poc')"), 'the export uses the Points of Contact directory population');
assert(exporter.includes('exportTeamPocDirectoryPdf(people)'), 'the export passes that population to the PDF module');
assert(!exporter.includes('innerText') && !exporter.includes('querySelector') && !pdf.includes('innerHTML'), 'the export is not built by scraping the directory');
assert(pdf.includes('exportFacilitatorTablePdf'), 'the directory is one shared table export');
assert(!pdf.includes('exportFacilitatorProfilePdf'), 'the directory does not build a profile per person');
assert(pdf.includes("(people ?? []).map(teamPocPdfRow)"), 'each person becomes one table row');
assert(pdf.includes("orientation: 'landscape'"), 'the directory uses landscape orientation');
for (const label of [
  'Rank / Title',
  'Full Name',
  'Command / Organization',
  'Installation',
  'Active Status',
  'CREDO Staff',
  'Facilitator',
  'Point of Contact',
  'Billet / Role',
  'PRD / EAOS',
]) {
  assert(pdf.includes(`label: '${label}'`), `the directory includes ${label}`);
}
assert(!pdf.includes('person.id') && !pdf.includes('aliases'), 'the directory does not export ids or aliases');
assert(pdf.includes('structuredPersonalName'), 'full names use the structured personal-name helper');
assert(app.includes("button.textContent = 'Exporting…'"), 'the export button shows that it is working');
assert(app.includes('Failed to export PDF. Please try again.'), 'a failed export reports a concise error');
assert(!pdf.includes('supabase') && !pdf.includes('js/db.js'), 'the PDF module does not query the database');
assert(!fs.existsSync(path.join(ROOT, 'supabase/migrations/047_team_poc_pdf_export.sql')), 'no Points of Contact PDF migration was added');

assert(teamPocPdfFullName({ firstName: 'John', lastName: 'Scanlon', name: 'Old Alias' }) === 'John Scanlon', 'a structured name exports as First Last');
assert(teamPocPdfFullName({ firstName: 'James', lastName: null, name: 'James' }) === 'James', 'a first name alone stays that name');
assert(teamPocPdfFullName({ firstName: null, lastName: 'Adams', name: 'Adams' }) === 'Adams', 'a last name alone stays that name');
assert(teamPocPdfFullName({ firstName: null, lastName: null, name: 'Chaplain Alexander' }) === 'Chaplain Alexander', 'a legacy record uses the stored name');
assert(teamPocPdfFilename() === 'CREDO_Points_of_Contact_Directory.pdf', 'the directory uses a clean filename');

if (errors.length) {
  console.error(`validate-team-poc-pdf-export: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-team-poc-pdf-export: ok');
