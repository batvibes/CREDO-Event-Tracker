/**
 * A canonical person edit refreshes current event personnel labels.
 * Run: node scripts/validate-event-personnel-refresh.js
 *
 * Does not connect to Supabase.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eventPersonnelLabel,
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

const app = read('js/app.js');
const fields = read('js/event-reference-fields.js');
const save = app.slice(app.indexOf('onSave: async (values)'), app.indexOf('onArchive:'));
const reconcileStart = app.indexOf('onReconcile: async (survivorId, retiredId, identity)');
const reconcile = app.slice(reconcileStart, reconcileStart + 400);
const reload = app.slice(
  app.indexOf('async function reloadEventsAfterCanonicalRename'),
  app.indexOf('function applyPermissions'),
);

assert(save.includes('await reloadEventsAfterCanonicalRename()'), 'Team and Facilitator person saves refresh event personnel');
assert(reconcile.includes('await reloadEventsAfterCanonicalRename()'), 'personnel reconciliation refreshes event personnel');
assert(reload.includes('fetchEventPersonnel') || reload.includes('withEventPersonnel'), 'the shared refresh reloads event personnel from the current person record');
assert(reload.includes('refreshOpenAarDocumentIfNeeded()'), 'an open AAR is rebuilt from the refreshed event');
assert(reload.includes('refreshLinkedIdentity'), 'an open event editor refreshes linked chip labels');
assert(!reload.includes('replaceEventPersonnel'), 'a person edit does not rewrite event personnel rows');
assert(!reload.includes('source_text') && !reload.includes('sourceText'), 'a person edit does not rewrite source text');
assert(fields.includes('refreshLinkedIdentity') && fields.includes('applyLiveIdentity'), 'linked chips update from the current personnel identity');
assert(fields.includes('return { ...token, personId, name }') || fields.includes('return { ...token, name }'), 'a chip refresh keeps the person id and replaces only the visible name');

const before = {
  personId: 'person-adams',
  displayName: 'Chaplain Adams',
  canonicalDisplayName: 'Chaplain Adams',
  sourceText: 'Chaplain Adams',
  position: 0,
};
const after = {
  ...before,
  displayName: 'Chaplain A. Adams',
  canonicalDisplayName: 'Chaplain A. Adams',
};
const futureEvent = {
  personnelLoaded: true,
  personnel: { facilitator: [after] },
  facilitators: 'Chaplain Adams',
};
assert(eventPersonnelLabel(after) === 'Chaplain A. Adams', 'a linked future assignment shows the current canonical identity');
assert(visibleEventPersonnel(futureEvent, 'facilitator') === 'Chaplain A. Adams', 'the events table and AAR use that current identity');
assert(before.sourceText === 'Chaplain Adams', 'source text stays at the stored wording');

const renamed = personnelWriteRows({
  facilitator: [{ personId: 'person-adams', name: 'Chaplain A. Adams', sourceText: 'Chaplain Adams' }],
  poc: [],
  credo_staff: [],
});
assert(renamed[0].personId === 'person-adams' && renamed[0].sourceText === 'Chaplain Adams', 'saving the event keeps the same person and source text');

const unresolved = { personId: null, sourceText: 'Chaplain Diggs', displayName: 'Chaplain Diggs', position: 0 };
assert(eventPersonnelLabel(unresolved) === 'Chaplain Diggs', 'an unresolved row still displays source text');

const corrected = {
  personnelLoaded: true,
  personnel: {
    facilitator: [{
      personId: 'person-briggs',
      displayName: 'Chaplain Briggs',
      sourceText: 'Chaplain Diggs',
      position: 0,
    }],
  },
  facilitators: 'Chaplain Diggs',
};
assert(visibleEventPersonnel(corrected, 'facilitator') === 'Chaplain Briggs', 'renaming the same person updates the future event label');

if (errors.length) {
  console.error(`validate-event-personnel-refresh failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('validate-event-personnel-refresh: ok');
