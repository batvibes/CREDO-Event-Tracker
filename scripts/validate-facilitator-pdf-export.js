/**
 * Facilitator Management PDF export wiring.
 * Run: node scripts/validate-facilitator-pdf-export.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFacilitatorPdfFilename,
  sanitizeFacilitatorPdfSlug,
} from '../js/facilitator-report-pdf-export.js';

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
  assert(start !== -1 && end !== -1, `missing slice ${startNeedle}`);
  return start === -1 ? '' : source.slice(start, end === -1 ? source.length : end);
}

const pdf = read('js/facilitator-report-pdf-export.js');
const app = read('js/app.js');
const html = read('index.html');
const capabilities = sliceBetween(app, 'async function exportVisibleCapabilitiesPdf', 'async function exportFacilitatorPopulationPdf');
const population = sliceBetween(app, 'async function exportFacilitatorPopulationPdf', 'async function exportVisibleFacilitatorsPdf');
const filtered = sliceBetween(app, 'async function exportVisibleFacilitatorsPdf', 'async function exportFacilitatorProductPdf');
const product = sliceBetween(app, 'async function exportFacilitatorProductPdf', 'async function exportOpenFacilitatorPdf');
const profile = sliceBetween(app, 'async function exportOpenFacilitatorPdf', 'function setupFacilitatorManagement');
const productReport = sliceBetween(app, 'function currentFacilitatorProductReport', 'async function runFacilitatorPdfExport');

assert(fs.existsSync(path.join(ROOT, 'js/facilitator-report-pdf-export.js')), 'the shared facilitator PDF module exists');
assert(pdf.includes('export async function exportFacilitatorTablePdf'), 'table reports share one exporter');
assert(pdf.includes('export async function exportFacilitatorProfilePdf'), 'profile reports share the exporter');
assert(pdf.includes("import('jspdf')"), 'exports use the project PDF library');
assert(pdf.includes('pdf.addPage()'), 'long reports paginate');
assert(pdf.includes('Page ${pageNumber} of ${totalPages}'), 'page numbers are drawn');
assert(pdf.includes('Generated ${formatGeneratedAt'), 'reports include a generated date');
assert(pdf.includes('drawTableHeader'), 'table headers are drawn again on later pages');
assert(pdf.includes('facilitatorQualificationDisplayFields'), 'profile qualifications use the profile display helper');
assert(pdf.includes('facilitatorT4tCompletionDisplayFields'), 'profile T4T history uses the profile display helper');
assert(pdf.includes('formatRecordedFacilitationDate'), 'profile dates use the existing date formatter');
assert(!pdf.includes('supabase') && !pdf.includes('.from(') && !pdf.includes('js/db.js'), 'the PDF module does not query the database');
assert(!pdf.includes('innerText') && !pdf.includes('innerHTML'), 'the PDF module does not scrape rendered tables');

assert(html.includes('id="facilitator-capabilities-export-btn"'), 'Program Capabilities has an export button');
assert(html.includes('id="facilitator-product-export-btn"'), 'the product modal has an export button');
assert(html.includes('id="facilitator-personnel-export-btn"'), 'the Facilitators toolbar has an export button');
assert(html.includes('id="facilitator-detail-export-btn"'), 'the facilitator profile has an export button');
assert(html.includes('data-facilitator-population-export="credo-used"'), 'CREDO-Used has its own export');
assert(html.includes('data-facilitator-population-export="trained-pool"'), 'the trained pool has its own export');
assert(html.includes('data-facilitator-population-export="all-records"'), 'All Records has its own export');
assert(html.includes('id="facilitator-product-close-btn"') && html.includes('id="facilitator-detail-close-btn"'), 'close buttons remain');

assert(capabilities.includes('visibleFacilitatorCapabilities()'), 'Program Capabilities exports the visible capability rows');
assert(capabilities.includes("title: 'Program Capabilities'"), 'the capability report is titled Program Capabilities');
assert(capabilities.includes('FACILITATOR_CAPABILITY_PDF_COLUMNS'), 'Program Capabilities uses the capability column set');
const capabilityColumns = sliceBetween(app, 'const FACILITATOR_CAPABILITY_PDF_COLUMNS', 'const FACILITATOR_ROSTER_PDF_COLUMNS');
const rosterColumns = sliceBetween(app, 'const FACILITATOR_ROSTER_PDF_COLUMNS', 'const FACILITATOR_PRODUCT_PDF_COLUMNS');
const productColumns = sliceBetween(app, 'const FACILITATOR_PRODUCT_PDF_COLUMNS', 'function facilitatorPresenceLabel');
assert(capabilityColumns.includes("label: 'Product'") && capabilityColumns.includes("label: 'Personnel'") && capabilityColumns.includes("label: 'Recorded Instances'") && capabilityColumns.includes("label: 'Most Recent Facilitation'") && capabilityColumns.includes("label: 'Qualification Records'"), 'capability columns match the requested report');
assert(rosterColumns.includes("label: 'Rank / Title'") && rosterColumns.includes("label: 'Events Conducted'") && rosterColumns.includes("label: 'Most Recent'") && !rosterColumns.includes('Delete'), 'roster exports omit the delete column');
assert(productColumns.includes("label: 'Recorded Experience'") && productColumns.includes("label: 'Qualification Record'") && productColumns.includes("label: 'First Recorded Facilitation'"), 'product exports keep the modal columns');
assert(population.includes('filterFacilitatorPersonnel') && population.includes("query: ''") && population.includes("active: 'all'") && population.includes("productId: ''"), 'population exports use the full population, not the roster filters');
assert(population.includes('definition.defaultSort.column') && population.includes('definition.defaultSort.direction'), 'population exports use that population default sort');
assert(!population.includes('facilitator-search') && !population.includes('facilitator-active-filter') && !population.includes('facilitator-product-filter'), 'population exports do not read the roster filters');
assert(app.includes("closest('[data-facilitator-population-export]')") && app.includes('stopPropagation()'), 'a population export does not select the card');
assert(filtered.includes('visibleFacilitatorPersonnel()'), 'the toolbar export uses the current facilitator table');
assert(filtered.includes('facilitatorFilterState()'), 'the toolbar export states the active filters');
assert(productReport.includes('facilitatorProductPersonnel') && productReport.includes('filterFacilitatorProductPersonnel'), 'the product report uses the modal personnel filters');
assert(product.includes('currentFacilitatorProductReport()'), 'the product export uses that same report');
assert(product.includes("subtitle: 'Facilitator Report'"), 'the product report is a facilitator report');
assert(profile.includes('facilitatorPersonnel.find') && profile.includes('exportFacilitatorProfilePdf'), 'the profile export uses the loaded facilitator record');
assert(profile.includes('t4tExperienceAvailable: facilitatorT4tExperienceAvailable'), 'T4T facilitation follows the loaded availability flag');
assert(!profile.includes('canEditTeam') && !profile.includes('canEditEvents'), 'profile export does not require edit permission');
assert(app.includes("button.textContent = 'Exporting…'"), 'an export button shows that it is working');
assert(app.includes('Failed to export PDF. Please try again.'), 'a failed export reports a concise error');
assert(!capabilities.includes('querySelector') && !filtered.includes('innerText') && !product.includes('innerHTML'), 'exports are not built by scraping table cells');
assert(!fs.existsSync(path.join(ROOT, 'supabase/migrations/046_facilitator_pdf_export.sql')), 'no facilitator PDF migration was added');

assert(sanitizeFacilitatorPdfSlug('CREDO-Used Facilitators') === 'CREDO-Used_Facilitators', 'population filenames keep the hyphen and replace spaces');
assert(buildFacilitatorPdfFilename('Program Capabilities') === 'CREDO_Program_Capabilities.pdf', 'Program Capabilities uses a clean filename');
assert(buildFacilitatorPdfFilename('Marriage Enrichment Retreat Facilitators') === 'CREDO_Marriage_Enrichment_Retreat_Facilitators.pdf', 'product filenames are descriptive');
assert(buildFacilitatorPdfFilename('John Scanlon Facilitator Report') === 'CREDO_John_Scanlon_Facilitator_Report.pdf', 'profile filenames use the personal name');
assert(!buildFacilitatorPdfFilename('A/B: C').includes('/') && !buildFacilitatorPdfFilename('A/B: C').includes(':'), 'filenames drop unsafe characters');

if (errors.length) {
  console.error(`validate-facilitator-pdf-export: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-facilitator-pdf-export: ok');
