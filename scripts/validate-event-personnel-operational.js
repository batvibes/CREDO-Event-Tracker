/**
 * Canonical event personnel is the operational display and editor relationship.
 * Run: node scripts/validate-event-personnel-operational.js
 *
 * Does not connect to Supabase.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eventPersonnelLabel,
  formatEventPersonnel,
  personnelWriteRows,
  visibleEventPersonnel,
} from '../js/event-personnel-view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const view = read('js/event-personnel-view.js');
const db = read('js/db.js');
const app = read('js/app.js');
const fields = read('js/event-reference-fields.js');
const reportPdf = read('js/event-report-pdf-export.js');
const aarPdf = read('js/aar-pdf-export.js');
const facilitatorManagement = read('js/facilitator-management.js');

const loader = db.slice(db.indexOf('export async function fetchEventPersonnel'), db.indexOf('export async function fetchEvents'));
const replace = db.slice(db.indexOf('export async function replaceEventPersonnel'), db.indexOf('export async function fetchEvents'));
const eventWrite = db.slice(db.indexOf('export function eventToRow'), db.indexOf('function eventWriteRow'));
const aar = app.slice(app.indexOf('function populateAarDocument'), app.indexOf('syncAarCurriculumRow(event, root);'));
const reportExport = app.slice(app.indexOf('async function exportReportPdf'), app.indexOf('function renderReportsSearchResults'));
const formLoad = fields.slice(fields.indexOf('setFromEvent(event)'), fields.indexOf('refreshPeople()'));
const formSave = app.slice(app.indexOf('form.addEventListener(\'submit\''), app.indexOf('async function loadReferenceLists'));

assert(view.includes('export function eventPersonnelLabel') && view.includes('export function visibleEventPersonnel'), 'shared canonical event personnel helper exists');
assert(loader.includes("from('event_personnel_display')") && loader.includes(".in('event_id', ids)"), 'event personnel loads for a collection of event ids');
assert(app.includes('fetchEventPersonnel') && app.includes('attachEventPersonnel'), 'event screens attach one personnel load');
assert(aar.includes("visibleEventPersonnel(event, 'facilitator')") && aar.includes("visibleEventPersonnel(event, 'credo_staff')") && aar.includes("visibleEventPersonnel(event, 'poc')"), 'AAR uses canonical personnel');
assert(!aar.includes('event.facilitators') && !aar.includes('event.poc') && !aar.includes('event.credoStaff'), 'AAR does not display legacy personnel text');
assert(reportExport.includes("visibleEventPersonnel(event, 'facilitator')") && reportExport.includes("visibleEventPersonnel(event, 'credo_staff')"), 'event-report PDF uses canonical personnel');
assert(app.includes('buildAarExportReportElement') && app.includes('populateAarDocument(event, { root: article, editable: false })'), 'AAR PDF prints the canonical AAR document');
assert(!aarPdf.includes('fetchEventPersonnel') && !reportPdf.includes('fetchEventPersonnel'), 'PDF modules do not invent a second personnel resolver');
assert(app.includes("field === 'facilitators'") && app.includes("visibleEventPersonnel(event, 'facilitator')"), 'the events table displays canonical facilitators');
assert(formLoad.includes('facilitators.setFromPersonnel(event.personnel.facilitator)') && formLoad.includes('poc.setFromPersonnel(event.personnel.poc)') && formLoad.includes('credoStaff.setFromPersonnel(event.personnel.credo_staff)'), 'Event Details loads canonical personnel');
assert(fields.includes('personId: row.personId || null') || fields.includes('editorTokenFromPersonnel'), 'event editor chips carry person ids');
assert(formSave.includes('syncSavedEventPersonnel(event)'), 'event save synchronizes event personnel');
assert(replace.includes(".from('event_personnel')") && replace.includes('source_text: String(row.sourceText).trim()') && replace.includes('person_id: row.personId || null'), 'personnel save writes the person id and historical source text');
assert(!replace.includes("from('people')") && !/insert\s+into\s+public\.people/i.test(replace), 'personnel save does not create people');
assert(eventWrite.includes("facilitators: event.facilitators ?? ''") && eventWrite.includes("credo_staff: event.credoStaff ?? ''") && eventWrite.includes("poc: event.poc ?? ''"), 'legacy event text remains maintained');
assert(fields.includes('token.sourceText') && fields.includes('function tokenLegacyText'), 'legacy serialization prefers stored source text');
assert(!/levenshtein|similarity\s*\(|pg_trgm|soundex/i.test(view + replace), 'operational personnel resolution is not fuzzy');
assert(!facilitatorManagement.includes('fetchEventPersonnel'), 'Facilitator Management experience calculations stay on their current views');
assert(!app.includes('resolve_event_personnel') && !fields.includes('resolve_event_personnel'), 'ordinary event screens do not resolve unresolved people');

const linked = {
  personId: 'person-kimberly',
  displayName: 'RP3 Kimberly Palomino',
  canonicalDisplayName: 'RP3 Kimberly Palomino',
  sourceText: 'RPSN Palomino',
  contactEmail: null,
  position: 0,
};
const unresolved = {
  personId: null,
  displayName: 'RP2 Diggs',
  sourceText: 'RP2 Diggs',
  position: 1,
};
assert(eventPersonnelLabel(linked) === 'RP3 Kimberly Palomino', 'a linked row displays the current canonical identity');
assert(eventPersonnelLabel(unresolved) === 'RP2 Diggs', 'an unresolved row displays source text');
assert(
  formatEventPersonnel([unresolved, linked], 'credo_staff') === 'RP3 Kimberly Palomino, RP2 Diggs',
  'personnel display preserves position order',
);
assert(
  visibleEventPersonnel({
    personnelLoaded: true,
    personnel: { credo_staff: [linked, unresolved] },
    credoStaff: 'RPSN Palomino, RP2 Diggs',
  }, 'credo_staff') === 'RP3 Kimberly Palomino, RP2 Diggs',
  'canonical display replaces legacy text when the person is linked',
);

const written = personnelWriteRows({
  facilitator: [],
  poc: [],
  credo_staff: [
    { personId: 'person-kimberly', name: 'RP2 Kimberly Palomino', sourceText: 'RPSN Palomino' },
    { personId: null, name: 'RP2 Diggs', sourceText: 'RP2 Diggs' },
  ],
});
assert(written[0].sourceText === 'RPSN Palomino' && written[0].personId === 'person-kimberly', 'a canonical rename does not rewrite historical source text');
assert(written[1].personId === null && written[1].sourceText === 'RP2 Diggs', 'an unresolved row stays unresolved');
assert(
  visibleEventPersonnel({
    personnelLoaded: true,
    personnel: {
      credo_staff: [{
        personId: 'person-kimberly',
        displayName: 'RP2 Kimberly Palomino',
        sourceText: 'RPSN Palomino',
        position: 0,
      }],
    },
    credoStaff: 'RPSN Palomino',
  }, 'credo_staff') === 'RP2 Kimberly Palomino',
  'a rank change shows on the event without rewriting the event',
);

if (errors.length) {
  console.error(`validate-event-personnel-operational failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-event-personnel-operational: ok');
