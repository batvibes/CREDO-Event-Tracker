/**
 * Personnel reconciliation repair checks.
 * Run: node scripts/validate-personnel-reconciliation.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { personnelDisplayName } from '../js/personnel-identity.js';
import {
  reconciliationPersonalName,
  reconciliationStructuredNames,
  validateReconciliationIdentity,
} from '../js/team-personnel-editor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function norm(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function blank(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function person(id, name, rankTitle = null, extra = {}) {
  return {
    id,
    name,
    rankTitle,
    normalizedName: norm(name),
    commandOrganization: null,
    installation: null,
    email: null,
    phone: null,
    active: true,
    isCredoStaff: false,
    isFacilitator: false,
    isPoc: false,
    ...extra,
  };
}

function legacyRenamesBeforeDelete(survivorName, retiredName, finalName) {
  return norm(finalName) === norm(retiredName) && norm(finalName) !== norm(survivorName);
}

function planReconciliation({
  survivor,
  retired,
  final,
  others = [],
  aliases = [],
  qualifications = [],
  completions = [],
  provenance = [],
  events = [],
}) {
  const display = personnelDisplayName(final.rankTitle, final.name);
  const displayNorm = norm(display);
  const personalNorm = norm(final.name);
  const thirdPartyName = others.some((entry) => (
    norm(personnelDisplayName(entry.rankTitle, entry.name)) === displayNorm
    || entry.normalizedName === personalNorm
  )) || aliases.some((alias) => (
    alias.personId !== survivor.id
    && alias.personId !== retired.id
    && alias.normalizedName === displayNorm
  ));
  if (thirdPartyName) return { ok: false, hint: 'REFERENCE_NAME_EXISTS', events };

  const stolenAlias = aliases.some((alias) => (
    alias.personId === retired.id
    && alias.normalizedName !== displayNorm
    && others.some((entry) => norm(personnelDisplayName(entry.rankTitle, entry.name)) === alias.normalizedName)
  ));
  if (stolenAlias) return { ok: false, hint: 'PERSONNEL_ALIAS_CONFLICT', events };

  const survivorProducts = new Set(
    qualifications.filter((row) => row.personId === survivor.id).map((row) => row.productId),
  );
  const qualificationConflict = qualifications.find((row) => (
    row.personId === retired.id && survivorProducts.has(row.productId)
  ));
  if (qualificationConflict) {
    return { ok: false, hint: 'PERSONNEL_CONFLICT', product: qualificationConflict.productName, events };
  }

  const survivorAliasNorms = new Set(
    aliases.filter((alias) => alias.personId === survivor.id).map((alias) => alias.normalizedName),
  );
  const mergedAliases = aliases.flatMap((alias) => {
    const belongsToPair = alias.personId === survivor.id || alias.personId === retired.id;
    if (belongsToPair && alias.normalizedName === displayNorm) return [];
    if (alias.personId === retired.id && survivorAliasNorms.has(alias.normalizedName)) return [];
    return [{ ...alias, personId: alias.personId === retired.id ? survivor.id : alias.personId }];
  });

  const remembered = [survivor, retired].flatMap((entry) => [
    personnelDisplayName(entry.rankTitle, entry.name),
    entry.name,
  ]);
  for (const label of remembered) {
    const aliasNorm = norm(label);
    if (!aliasNorm || aliasNorm === displayNorm) continue;
    if (mergedAliases.some((alias) => alias.normalizedName === aliasNorm)) continue;
    if (others.some((entry) => norm(personnelDisplayName(entry.rankTitle, entry.name)) === aliasNorm)) {
      return { ok: false, hint: 'PERSONNEL_ALIAS_CONFLICT', events };
    }
    mergedAliases.push({ personId: survivor.id, displayName: label, normalizedName: aliasNorm });
  }

  const keptCompletions = completions
    .filter((row) => row.personId === survivor.id)
    .map((row) => ({ ...row }));
  for (const row of completions.filter((entry) => entry.personId === retired.id)) {
    const match = keptCompletions.find((existing) => {
      if (existing.productId !== row.productId) return false;
      if (row.sourceEventId == null) {
        return existing.sourceEventId == null && existing.completedOn === row.completedOn;
      }
      return existing.sourceEventId === row.sourceEventId;
    });
    if (!match) {
      keptCompletions.push({ ...row, personId: survivor.id });
      continue;
    }
    match.governingSource = blank(match.governingSource) || blank(row.governingSource);
    match.notes = blank(match.notes) || blank(row.notes);
  }

  const keptQualifications = qualifications.map((row) => (
    row.personId === retired.id ? { ...row, personId: survivor.id } : { ...row }
  ));
  const keptProvenance = provenance.filter((personId) => personId !== retired.id);

  return {
    ok: true,
    survivor: {
      ...survivor,
      name: final.name,
      rankTitle: final.rankTitle || null,
      normalizedName: personalNorm,
      display,
    },
    retiredId: retired.id,
    aliases: mergedAliases,
    qualifications: keptQualifications,
    completions: keptCompletions,
    provenance: keptProvenance,
    events,
  };
}

const migration = read('supabase/migrations/032_repair_personnel_reconciliation.sql');
const previous = read('supabase/migrations/020_facilitator_qualification_foundation.sql');
const db = read('js/db.js');
const start = migration.indexOf('create or replace function public.reconcile_directory_people(');
const reconcileFn = migration.slice(start);
const handler = reconcileFn.slice(reconcileFn.indexOf('\nexception\n'));
const peopleDelete = reconcileFn.indexOf('delete from public.people\n  where id = v_retired_id');
const peopleUpdate = reconcileFn.indexOf('update public.people\n  set\n    rank_title = v_rank_title');
const completionLoop = reconcileFn.indexOf('for v_retired_completion in');
const provenanceDelete = reconcileFn.indexOf('delete from public.t4t_attendance_created_people');

assert(start > 0, 'migration 032 replaces reconcile_directory_people');
assert(!/perform public\.reconcile_directory_people|select public\.reconcile_directory_people/.test(migration), 'migration 032 does not execute reconciliation');
assert(peopleDelete > 0 && peopleUpdate > peopleDelete, 'the retired person is deleted before the survivor personal name changes');
assert(completionLoop > 0 && peopleDelete > completionLoop, 'T4T completions move before the retired person is deleted');
assert(provenanceDelete > 0 && peopleDelete > provenanceDelete, 'retired attendance provenance is removed before the person delete');
assert(reconcileFn.includes('facilitator_t4t_completions_manual') === false, 'reconciliation uses the current partial unique rules rather than the dropped date constraint');
assert(reconcileFn.includes('source_event_id is null'), 'manual completions match on a null source event');
assert(reconcileFn.includes('source_event_id = v_retired_completion.source_event_id'), 'event completions match on the source event');
assert(reconcileFn.includes('nullif(btrim(kept.governing_source)'), 'blank governing source can be filled from the retired row');
assert(reconcileFn.includes('nullif(btrim(kept.notes)'), 'blank notes can be filled from the retired row');
assert(!reconcileFn.includes('completed_on = v_retired_completion.completed_on)\n        and source_event_id ='), 'an event match does not also require the same date');
assert(reconcileFn.includes("hint = 'PERSONNEL_ALIAS_CONFLICT'"), 'a third-person alias conflict has its own hint');
assert(reconcileFn.includes('Both records have a qualification for %'), 'a same-product qualification names the product');
assert(reconcileFn.includes("hint = 'STAFF_LINK_CONFLICT'"), 'two Manning rows still stop reconciliation');
assert(!/insert into public\.t4t_attendance_created_people/i.test(reconcileFn), 'retired attendance provenance is not copied onto the survivor');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(reconcileFn), 'reconciliation does not rewrite event text');
assert(migration.includes('facilitator_event_tokens'), 'the view-only event token link is acknowledged');
assert(!handler.includes('REFERENCE_NAME_EXISTS'), 'a unique violation is no longer reported as a roster-name conflict');
assert(handler.includes('PERSONNEL_RECONCILE_DUPLICATE'), 'an unexpected duplicate rolls back with its own hint');
assert(handler.includes('PERSONNEL_RECONCILE_REFERENCE'), 'a remaining foreign key rolls back with its own hint');
assert(previous.includes("hint = 'REFERENCE_NAME_EXISTS'"), 'migration 020 remains the previous function on disk');
assert(!previous.includes('facilitator_t4t_completions'), 'migration 020 was not edited for this repair');

const reconcileStart = db.indexOf('function reconciliationRpcError');
const reconcileCall = db.indexOf('export async function reconcileDirectoryPeople');
const reconcileBody = db.slice(reconcileStart, db.indexOf('export async function fetchCommandHighlightsNotes'));
assert(reconcileStart > 0 && reconcileCall > reconcileStart, 'reconciliation uses its own error mapping');
assert(reconcileBody.includes('PERSONNEL_ALIAS_CONFLICT'), 'alias conflicts keep the database message');
assert(reconcileBody.includes('PERSONNEL_RECONCILE_DUPLICATE'), 'unexpected duplicates keep the database message');
assert(!reconcileBody.includes('referenceNameConflictError'), 'reconciliation does not replace the database message with the form name');
assert(reconcileBody.includes("rpc('reconcile_directory_people_structured'"), 'the client calls reconcile_directory_people_structured');
assert(!reconcileBody.includes("rpc('reconcile_directory_people',"), 'the client does not call the legacy reconciliation RPC directly');
assert(migration.includes('create or replace function public.reconcile_directory_people('), 'the legacy reconciliation function remains');
assert(!/update public\.events|events\.facilitators|events\.poc|events\.credo_staff/.test(read('supabase/migrations/035_structured_personnel_name_writes.sql')), 'the structured wrapper does not rewrite event text');
assert(read('supabase/migrations/035_structured_personnel_name_writes.sql').includes('public.reconcile_directory_people('), 'the structured wrapper still calls the legacy reconciliation function');
assert(!read('supabase/migrations/035_structured_personnel_name_writes.sql').includes('drop function public.reconcile_directory_people'), 'migration 035 does not remove the legacy reconciliation function');

const structuredSurvivor = reconciliationStructuredNames({
  name: 'Ada Civilian',
  rankTitle: 'LCDR',
  firstName: 'Ada',
  lastName: 'Civilian',
});
assert(structuredSurvivor.firstName === 'Ada' && structuredSurvivor.lastName === 'Civilian', 'a structured survivor prepopulates First Name and Last Name');
const legacySurvivor = reconciliationStructuredNames({ name: 'Chaplain Rudd', rankTitle: 'Chaplain' });
assert(legacySurvivor.firstName === '' && legacySurvivor.lastName === '', 'a legacy survivor is not split into First Name and Last Name');
const editor = read('js/team-personnel-editor.js');
assert(editor.includes('is shown for reference. A combined legacy name is not split automatically.'), 'a legacy combined name is reference text, not an editable full name');
assert(!editor.includes("field('Full Name'"), 'reconciliation no longer edits a combined Full Name');
assert(validateReconciliationIdentity({ firstName: '', lastName: 'Rudd', rankTitle: '' }) === 'First Name is required.', 'reconciliation requires First Name');
assert(validateReconciliationIdentity({ firstName: 'John', lastName: '', rankTitle: '' }) === 'Last Name is required.', 'reconciliation requires Last Name');
assert(
  validateReconciliationIdentity({ firstName: 'CDR', lastName: 'Scanlon', rankTitle: 'CDR' })
    === 'Rank / Title should not be entered in First Name or Last Name.',
  'reconciliation rejects a rank copied into the personal name',
);
assert(reconciliationPersonalName(' John ', ' Scanlon ') === 'John Scanlon', 'the compatibility personal name is First Name plus Last Name');
assert(editor.includes('Historical Event text will not be rewritten.'), 'reconciliation still tells the user that event text is preserved');

const maforahSurvivor = person('3cad35a4-1dc9-43cc-9087-2cfa7c70b163', 'LCDR Maforah');
const maforahRetired = person('4b65f1a7-3f5f-412f-b533-41c57905d451', 'Maforah', 'Chaplain');
assert(
  legacyRenamesBeforeDelete(maforahSurvivor.name, maforahRetired.name, 'Maforah'),
  'the current RPC renames LCDR Maforah to Maforah while Chaplain Maforah still owns that personal name',
);
const maforah = planReconciliation({
  survivor: maforahSurvivor,
  retired: maforahRetired,
  final: { rankTitle: 'LCDR', name: 'Maforah' },
  events: [{ facilitators: 'Chaplain Maforah' }],
});
assert(maforah.ok, 'Maforah reconciliation has no third-person conflict');
assert(maforah.survivor.id === maforahSurvivor.id, 'LCDR Maforah survives');
assert(maforah.survivor.name === 'Maforah' && maforah.survivor.rankTitle === 'LCDR', 'the surviving identity is LCDR Maforah');
assert(maforah.survivor.display === 'LCDR Maforah', 'the surviving display name is LCDR Maforah');
assert(maforah.retiredId === maforahRetired.id, 'Chaplain Maforah is the retired record');
assert(
  maforah.aliases.some((alias) => alias.personId === maforahSurvivor.id && alias.normalizedName === 'chaplain maforah'),
  'Chaplain Maforah is kept as an alias',
);
assert(maforah.events[0].facilitators === 'Chaplain Maforah', 'Maforah event text stays unchanged');

const plain = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: 'LCDR', name: 'Ada' },
});
assert(plain.ok && plain.survivor.id === 's' && plain.aliases.some((alias) => alias.normalizedName === 'adaline'), 'A: two people with no linked history keep the survivor and the retired name');

const overlap = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  aliases: [
    { personId: 's', displayName: 'Ada prior', normalizedName: 'ada prior' },
    { personId: 'r', displayName: 'Ada prior', normalizedName: 'ada prior' },
    { personId: 'r', displayName: 'Adaline prior', normalizedName: 'adaline prior' },
  ],
});
assert(overlap.ok, 'B: overlapping aliases still reconcile');
assert(overlap.aliases.filter((alias) => alias.normalizedName === 'ada prior').length === 1, 'B: the shared alias is kept once');
assert(overlap.aliases.some((alias) => alias.personId === 's' && alias.normalizedName === 'adaline prior'), 'B: the unique retired alias moves');

const retiredQualification = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  qualifications: [{ id: 'q1', personId: 'r', productId: 'safetalk', productName: 'safeTALK' }],
});
assert(
  retiredQualification.ok && retiredQualification.qualifications[0].personId === 's',
  'C: a qualification that only the retired person has moves to the survivor',
);

const differentProducts = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  qualifications: [
    { id: 'q1', personId: 's', productId: 'safetalk', productName: 'safeTALK' },
    { id: 'q2', personId: 'r', productId: 'asist', productName: 'ASIST' },
  ],
});
assert(
  differentProducts.ok
    && differentProducts.qualifications.map((row) => row.productId).sort().join(',') === 'asist,safetalk'
    && differentProducts.qualifications.every((row) => row.personId === 's'),
  'D: qualifications for different products both belong to the survivor',
);

const sameProduct = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  qualifications: [
    { id: 'q1', personId: 's', productId: 'safetalk', productName: 'safeTALK' },
    { id: 'q2', personId: 'r', productId: 'safetalk', productName: 'safeTALK' },
  ],
});
assert(sameProduct.ok === false && sameProduct.hint === 'PERSONNEL_CONFLICT' && sameProduct.product === 'safeTALK', 'E: the same product stops reconciliation and names the product');

const manualOnly = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  completions: [{ id: 'c1', personId: 'r', productId: 'safetalk', completedOn: '2026-01-02', sourceEventId: null, notes: 'manual' }],
});
assert(manualOnly.ok && manualOnly.completions[0].personId === 's' && manualOnly.completions[0].notes === 'manual', 'F: a manual completion moves to the survivor');

const eventOnly = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  completions: [{ id: 'c1', personId: 'r', productId: 'safetalk', completedOn: '2026-01-02', sourceEventId: 'event-1', notes: 'event' }],
});
assert(eventOnly.ok && eventOnly.completions[0].personId === 's' && eventOnly.completions[0].sourceEventId === 'event-1', 'G: an event completion moves with its source event');

const manualDedupe = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  completions: [
    { id: 'c1', personId: 's', productId: 'safetalk', completedOn: '2026-01-02', sourceEventId: null, governingSource: '', notes: '' },
    { id: 'c2', personId: 'r', productId: 'safetalk', completedOn: '2026-01-02', sourceEventId: null, governingSource: 'roster', notes: 'kept note' },
  ],
});
assert(
  manualDedupe.ok && manualDedupe.completions.length === 1 && manualDedupe.completions[0].notes === 'kept note' && manualDedupe.completions[0].governingSource === 'roster',
  'H: equivalent manual completions collapse and keep nonblank metadata',
);

const eventDedupe = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  completions: [
    { id: 'c1', personId: 's', productId: 'safetalk', completedOn: '2026-01-02', sourceEventId: 'event-1', notes: 'survivor note' },
    { id: 'c2', personId: 'r', productId: 'safetalk', completedOn: '2026-01-03', sourceEventId: 'event-1', notes: 'retired note' },
  ],
});
assert(
  eventDedupe.ok && eventDedupe.completions.length === 1 && eventDedupe.completions[0].notes === 'survivor note' && eventDedupe.completions[0].completedOn === '2026-01-02',
  'I: the same source event keeps one completion and does not invent a date',
);

const twoEvents = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  completions: [
    { id: 'c1', personId: 's', productId: 'safetalk', completedOn: '2026-01-02', sourceEventId: 'event-1' },
    { id: 'c2', personId: 'r', productId: 'safetalk', completedOn: '2026-01-02', sourceEventId: 'event-2' },
  ],
});
assert(
  twoEvents.ok && twoEvents.completions.map((row) => row.sourceEventId).sort().join(',') === 'event-1,event-2',
  'J: two events on the same date both survive',
);

const provenance = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  provenance: ['r'],
});
assert(provenance.ok && provenance.provenance.length === 0, 'K: retired attendance provenance is consumed and the survivor stays established');

const survivorProvenance = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  provenance: ['s', 'r'],
});
assert(
  survivorProvenance.ok && survivorProvenance.provenance.join(',') === 's',
  'K: provenance already on the survivor stays, and the retired copy is removed',
);

const thirdAlias = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline'),
  final: { rankTitle: null, name: 'Ada' },
  others: [person('t', 'Pat Prior')],
  aliases: [{ personId: 'r', displayName: 'Pat Prior', normalizedName: 'pat prior' }],
});
assert(thirdAlias.ok === false && thirdAlias.hint === 'PERSONNEL_ALIAS_CONFLICT', 'L: an alias that is another living identity stops reconciliation');

const eventLink = planReconciliation({
  survivor: person('s', 'Ada'),
  retired: person('r', 'Adaline', 'Chaplain'),
  final: { rankTitle: 'LCDR', name: 'Ada' },
  events: [{ facilitators: 'Chaplain Adaline' }],
});
assert(
  eventLink.ok
    && eventLink.events[0].facilitators === 'Chaplain Adaline'
    && eventLink.aliases.some((alias) => alias.personId === 's' && alias.normalizedName === 'chaplain adaline'),
  'M: event text stays put and the retired display remains an alias of the survivor',
);

if (errors.length) {
  console.error('validate-personnel-reconciliation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('validate-personnel-reconciliation: ok');
