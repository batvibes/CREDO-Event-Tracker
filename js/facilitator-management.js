/**
 * Read-only Facilitator Management personnel model.
 * Ordinary facilitation comes from facilitator_product_experience.
 * T4T facilitation comes from facilitator_t4t_product_experience.
 * The operational catalog is facilitator_products with active === true, ordered by sort_order.
 * A person is included when is_facilitator is true, or when ordinary experience, T4T
 * facilitation evidence, a qualification row, or T4T completion history exists.
 * Inactive product rows stay stored and are omitted from the operational catalog.
 * T4T completion history makes the person visible. It does not change a qualification
 * date or standing, and it is not counted as ordinary facilitation.
 * Stored qualification fields stay manual facts. Standing, T4T completion, and
 * trainer authority are not inferred from either experience aggregate. The
 * Facilitators roster summary counts unique products, distinct events, and the
 * latest date across both aggregates. Dedicated SafeTalk T4T and ASIST T4T
 * deliveries count as ordinary safeTALK and ASIST in that summary. Profile lists
 * stay separate. Overview and Program Capabilities keep each aggregate's own
 * product. An Event belongs to only one aggregate. Facilitator populations are
 * derived from that evidence and are not stored. CREDO-Used is ordinary or T4T
 * facilitation. The trained pool is a T4T completion or qualification with no
 * CREDO facilitation. All Records is the existing roster. This module does not
 * write people, qualifications, roles, or Events.
 *
 * Later views can sit beside Personnel: Overview, Program Capabilities, and Development.
 */

import { comparePersonnelDisplayNames, personnelDisplayName } from './personnel-identity.js';
import { calendarDate, localCalendarToday } from './t4t-completion-entry.js';

export const FACILITATOR_EMPTY_PERSONNEL = 'No facilitators found.';
export const FACILITATOR_EMPTY_EXPERIENCE = 'No CREDO-recorded facilitation.';
export const FACILITATOR_EMPTY_T4T_EXPERIENCE = 'No CREDO-recorded T4T facilitation.';
export const FACILITATOR_POPULATION_CREDO_USED = 'credo-used';
export const FACILITATOR_POPULATION_TRAINED_POOL = 'trained-pool';
export const FACILITATOR_POPULATION_ALL_RECORDS = 'all-records';
export const FACILITATOR_POPULATIONS = Object.freeze([
  Object.freeze({
    id: FACILITATOR_POPULATION_CREDO_USED,
    label: 'CREDO-Used',
    description: 'People with recorded facilitation on CREDO-tracked events.',
    defaultSort: Object.freeze({ column: 'recent', direction: 'desc' }),
  }),
  Object.freeze({
    id: FACILITATOR_POPULATION_TRAINED_POOL,
    label: 'Trained / Qualification Pool',
    description: 'People with T4T completion or qualification records, but no CREDO-recorded facilitation.',
    defaultSort: Object.freeze({ column: 'name', direction: 'asc' }),
  }),
  Object.freeze({
    id: FACILITATOR_POPULATION_ALL_RECORDS,
    label: 'All Records',
    description: 'All facilitator-relevant personnel records.',
    defaultSort: Object.freeze({ column: 'name', direction: 'asc' }),
  }),
]);
export const FACILITATOR_T4T_EXPERIENCE_HEADING = 'T4T Facilitation Experience';
export const FACILITATOR_T4T_COMPLETION_HEADING = 'T4T Completion History';
export const FACILITATOR_EMPTY_QUALIFICATIONS = 'No qualification or training records entered.';
export const FACILITATOR_QUALIFICATIONS_HEADING = 'Qualifications & Training';
export const FACILITATOR_EXPERIENCE_HEADING = 'Recorded Facilitation Experience';
export const FACILITATOR_NO_DATA_GAPS = 'No current data gaps identified.';
export const FACILITATOR_NO_T4T_ANNIVERSARY_ALERTS = 'No current T4T anniversary alerts.';
export const FACILITATOR_QUALIFICATION_NOT_ENTERED = 'Qualification record not yet entered';
export const FACILITATOR_NO_EXPERIENCE_OR_RECORD = 'No recorded experience or qualification record';
export const FACILITATOR_NO_PRODUCT_EXPERIENCE = 'No recorded experience';
export const FACILITATOR_NO_FACILITATOR_RECORDS = 'No facilitator records';
export const FACILITATOR_EMPTY_PRODUCTS = 'No facilitator products found.';
export const FACILITATOR_PRODUCT_EXPERIENCE_YES = 'Yes';
export const FACILITATOR_PRODUCT_EXPERIENCE_NO = 'No';
export const FACILITATOR_QUALIFICATION_ON_FILE = 'On file';
export const FACILITATOR_QUALIFICATION_NONE = 'None';

export const FACILITATOR_STANDING_OPTIONS = Object.freeze([
  ['developing', 'Developing'],
  ['provisional', 'Provisional'],
  ['registered', 'Registered'],
  ['inactive', 'Inactive'],
]);
export const FACILITATOR_QUALIFICATION_PRODUCT_REQUIRED = 'Select a product.';
export const FACILITATOR_QUALIFICATION_STANDING_REQUIRED = 'Select a standing.';

const FACILITATOR_STANDING_LABELS = Object.fromEntries(FACILITATOR_STANDING_OPTIONS);

export function formatQualificationStanding(value) {
  const key = cleanText(value).toLowerCase();
  return FACILITATOR_STANDING_LABELS[key] ?? null;
}

export function facilitatorT4tCompletionHistory(rows, products) {
  const names = new Map();
  for (const product of products ?? []) {
    if (!product?.id || names.has(product.id)) continue;
    const name = cleanText(product.name);
    if (name) names.set(product.id, name);
  }
  const history = [];
  for (const row of rows ?? []) {
    const productId = row?.product_id ?? row?.productId;
    const productName = names.get(productId);
    const completedOn = asDate(row?.completed_on ?? row?.completedOn);
    if (!productId || !productName || !completedOn) continue;
    history.push({
      id: row?.id ?? null,
      personId: row?.person_id ?? row?.personId ?? null,
      productId,
      productName,
      completedOn,
      sourceEventId: row?.source_event_id ?? row?.sourceEventId ?? null,
      governingSource: cleanText(row?.governing_source ?? row?.governingSource),
      notes: cleanText(row?.notes),
      createdAt: cleanText(row?.created_at ?? row?.createdAt),
    });
  }
  history.sort((left, right) => (
    compareText(right.completedOn, left.completedOn)
    || compareText(right.createdAt, left.createdAt)
    || compareText(String(left.id ?? ''), String(right.id ?? ''))
  ));
  return history;
}

export function facilitatorT4tCompletionDisplayFields(completion) {
  const fields = [];
  if (completion?.completedOn) {
    fields.push({ label: 'Completed', value: formatRecordedFacilitationDate(completion.completedOn) });
  }
  if (completion?.governingSource) {
    fields.push({ label: 'Qualification Authority / Source', value: completion.governingSource });
  }
  if (completion?.notes) fields.push({ label: 'Notes', value: completion.notes });
  return fields;
}

export function facilitatorQualificationDisplayFields(qualification) {
  const fields = [];
  if (qualification?.t4tCompletedOn) {
    fields.push({ label: 'T4T Completed', value: formatRecordedFacilitationDate(qualification.t4tCompletedOn) });
  }
  const standing = formatQualificationStanding(qualification?.standing);
  if (standing) fields.push({ label: 'Standing', value: standing });
  if (qualification?.firstFacilitatedOn) {
    fields.push({ label: 'First Facilitated', value: formatRecordedFacilitationDate(qualification.firstFacilitatedOn) });
  }
  if (qualification?.expirationOn) {
    fields.push({ label: 'Expiration', value: formatRecordedFacilitationDate(qualification.expirationOn) });
  }
  if (qualification?.trainerAuthority === true) {
    fields.push({ label: 'Train-the-Trainer Instructor', value: 'Yes' });
  }
  if (qualification?.governingSource) {
    fields.push({ label: 'Qualification Authority / Source', value: qualification.governingSource });
  }
  if (qualification?.notes) fields.push({ label: 'Notes', value: qualification.notes });
  return fields;
}

export function facilitatorQualificationProductChoices(products, qualifications) {
  const taken = new Set((qualifications ?? []).map((row) => row?.productId).filter(Boolean));
  return facilitatorProductFilterOptions(products).filter((product) => !taken.has(product.id));
}

export function facilitatorProductAuthorityDefault(product) {
  return cleanText(product?.governing_source ?? product?.governingSource);
}

export function nextQualificationSourceSuggestion({ origin, currentValue, productDefault }) {
  if (origin === 'manual' || origin === 'stored') {
    return { value: currentValue ?? '', origin };
  }
  const suggestion = cleanText(productDefault);
  if (!suggestion) return { value: '', origin: 'empty' };
  return { value: suggestion, origin: 'suggested' };
}

function cleanQualificationNote(value) {
  if (value == null) return '';
  return String(value).replace(/\r\n/g, '\n').trim();
}

export function facilitatorQualificationSaveInput(input) {
  const productId = cleanText(input?.productId);
  if (!productId) return { ok: false, message: FACILITATOR_QUALIFICATION_PRODUCT_REQUIRED };
  const standing = cleanText(input?.standing).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(FACILITATOR_STANDING_LABELS, standing)) {
    return { ok: false, message: FACILITATOR_QUALIFICATION_STANDING_REQUIRED };
  }
  return {
    ok: true,
    value: {
      personId: input?.personId ?? null,
      productId,
      standing,
      t4tCompletedOn: asDate(input?.t4tCompletedOn),
      firstFacilitatedOn: asDate(input?.firstFacilitatedOn),
      trainerAuthority: input?.trainerAuthority === true,
      expirationOn: asDate(input?.expirationOn),
      governingSource: cleanText(input?.governingSource),
      notes: cleanQualificationNote(input?.notes),
    },
  };
}

const T4T_COMPLETION_HISTORY_PRODUCT_CODES = new Set([
  'gottman_seven_principles',
  'prep_8_0',
  'four_lenses',
  'cliftonstrengths_strengths_discovery_encounter',
  'navigating_your_next_chapter',
  'safetalk',
  'asist',
]);

export function qualificationT4tHistoryRecord(qualification, completions) {
  const productCode = cleanText(qualification?.productCode);
  if (!T4T_COMPLETION_HISTORY_PRODUCT_CODES.has(productCode)) return null;
  const completedOn = asDate(qualification?.t4tCompletedOn);
  const personId = qualification?.personId ?? null;
  const productId = qualification?.productId ?? null;
  if (!completedOn || !personId || !productId) return null;
  const alreadyRecorded = (completions ?? []).some((row) => {
    const rowPerson = row?.person_id ?? row?.personId ?? null;
    const rowProduct = row?.product_id ?? row?.productId ?? null;
    const rowDate = asDate(row?.completed_on ?? row?.completedOn);
    return rowPerson === personId && rowProduct === productId && rowDate === completedOn;
  });
  if (alreadyRecorded) return null;
  const governingSource = cleanText(qualification?.governingSource);
  return {
    personId,
    productId,
    completedOn,
    sourceEventId: null,
    governingSource: governingSource || null,
    notes: null,
  };
}

function cleanText(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function explicitTrue(value) {
  return value === true;
}

function normalizeSearch(value) {
  return cleanText(value).toLowerCase();
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, { sensitivity: 'base' });
}

function asCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function asDate(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

export function formatRecordedFacilitationDate(isoDate) {
  const iso = asDate(isoDate);
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  if (date.getFullYear() !== Number(iso.slice(0, 4))) return '—';
  return `${month}/${day}/${year}`;
}

function mapPerson(row) {
  return {
    id: row?.id ?? null,
    name: cleanText(row?.name),
    firstName: cleanText(row?.first_name ?? row?.firstName),
    lastName: cleanText(row?.last_name ?? row?.lastName),
    rankTitle: cleanText(row?.rank_title ?? row?.rankTitle),
    commandOrganization: cleanText(row?.command_organization ?? row?.commandOrganization),
    installation: cleanText(row?.installation),
    active: explicitTrue(row?.active),
    isFacilitator: explicitTrue(row?.is_facilitator ?? row?.isFacilitator),
    isCredoStaff: explicitTrue(row?.is_credo_staff ?? row?.isCredoStaff),
    isPoc: explicitTrue(row?.is_poc ?? row?.isPoc),
    staffBilletOrRole: cleanText(row?.staff_billet_or_role ?? row?.staffBilletOrRole),
    staffPrdEaos: cleanText(row?.staff_prd_eaos ?? row?.staffPrdEaos),
  };
}

function earlierDate(current, next) {
  if (!next) return current ?? null;
  if (!current || next < current) return next;
  return current;
}

function laterDate(current, next) {
  if (!next) return current ?? null;
  if (!current || next > current) return next;
  return current;
}

function collectExperience(rows, catalog) {
  const byPerson = new Map();
  for (const row of rows ?? []) {
    const personId = row?.person_id ?? row?.personId;
    const productId = row?.product_id ?? row?.productId;
    const product = catalog.get(productId);
    if (!personId || !product) continue;
    if (!byPerson.has(personId)) byPerson.set(personId, new Map());
    const productsForPerson = byPerson.get(personId);
    if (productsForPerson.has(productId)) continue;
    productsForPerson.set(productId, {
      productId,
      productName: product.name,
      sortOrder: product.sortOrder,
      eventsConducted: asCount(row.events_conducted ?? row.eventsConducted),
      firstRecordedOn: asDate(row.first_recorded_facilitation_on ?? row.firstRecordedOn),
      mostRecentOn: asDate(row.most_recent_facilitation_on ?? row.mostRecentOn),
    });
  }
  return byPerson;
}

function experienceList(byPerson, personId) {
  return [...(byPerson.get(personId)?.values() ?? [])]
    .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.productName, right.productName));
}

const ROSTER_DEDICATED_T4T_CODES = {
  safetalk_t4t: 'safetalk',
  asist_t4t: 'asist',
};

function rosterFacilitationSummary(experience, t4tExperience, catalog) {
  const productIdByCode = new Map();
  for (const product of catalog.values()) {
    if (product.code) productIdByCode.set(product.code, product.id);
  }
  const productIds = new Set();
  let eventsConducted = 0;
  let mostRecentOn = null;
  for (const row of [...(experience ?? []), ...(t4tExperience ?? [])]) {
    const source = catalog.get(row.productId);
    const ordinaryCode = source ? ROSTER_DEDICATED_T4T_CODES[source.code] : null;
    const ordinaryProductId = ordinaryCode ? productIdByCode.get(ordinaryCode) : null;
    productIds.add(ordinaryProductId || row.productId);
    eventsConducted += row.eventsConducted;
    mostRecentOn = laterDate(mostRecentOn, row.mostRecentOn);
  }
  return {
    productCount: productIds.size,
    eventsConducted,
    mostRecentOn,
  };
}

function hasRecordedFacilitatorEvidence(person) {
  return (person?.experience?.length ?? 0) > 0 || (person?.t4tExperience?.length ?? 0) > 0;
}

function hasTrainingOrQualificationRecord(person) {
  return (person?.qualificationProducts?.length ?? 0) > 0 || (person?.t4tCompletions?.length ?? 0) > 0;
}

export function facilitatorPopulationDefaultSort(population) {
  const match = FACILITATOR_POPULATIONS.find((entry) => entry.id === population);
  return match?.defaultSort ?? FACILITATOR_POPULATIONS[0].defaultSort;
}

export function facilitatorInPopulation(person, population = FACILITATOR_POPULATION_ALL_RECORDS) {
  if (population === FACILITATOR_POPULATION_CREDO_USED) return hasRecordedFacilitatorEvidence(person);
  if (population === FACILITATOR_POPULATION_TRAINED_POOL) {
    return !hasRecordedFacilitatorEvidence(person) && hasTrainingOrQualificationRecord(person);
  }
  return population === FACILITATOR_POPULATION_ALL_RECORDS;
}

export function countFacilitatorPopulations(records) {
  const counts = {
    [FACILITATOR_POPULATION_CREDO_USED]: 0,
    [FACILITATOR_POPULATION_TRAINED_POOL]: 0,
    [FACILITATOR_POPULATION_ALL_RECORDS]: (records ?? []).length,
  };
  for (const person of records ?? []) {
    if (hasRecordedFacilitatorEvidence(person)) counts[FACILITATOR_POPULATION_CREDO_USED] += 1;
    else if (hasTrainingOrQualificationRecord(person)) counts[FACILITATOR_POPULATION_TRAINED_POOL] += 1;
  }
  return counts;
}

function combinedProductEvidence(person, productId) {
  const rows = [];
  for (const list of [person?.experience, person?.t4tExperience]) {
    const match = (list ?? []).find((row) => row?.productId === productId);
    if (match) rows.push(match);
  }
  if (!rows.length) return null;
  return {
    eventsConducted: rows.reduce((sum, row) => sum + row.eventsConducted, 0),
    firstRecordedOn: rows.reduce((earliest, row) => earlierDate(earliest, row.firstRecordedOn), null),
    mostRecentOn: rows.reduce((latest, row) => laterDate(latest, row.mostRecentOn), null),
  };
}

function productCatalog(products) {
  const byId = new Map();
  for (const product of products ?? []) {
    if (!product?.id || product.active !== true || byId.has(product.id)) continue;
    byId.set(product.id, {
      id: product.id,
      name: cleanText(product.name) || 'Unnamed product',
      code: cleanText(product.code),
      sortOrder: Number.isFinite(Number(product.sort_order ?? product.sortOrder))
        ? Number(product.sort_order ?? product.sortOrder)
        : Number.MAX_SAFE_INTEGER,
      governingSource: cleanText(product.governing_source ?? product.governingSource),
    });
  }
  return byId;
}

export function summarizeFacilitatorPersonnel(people, experienceRows, qualificationRows, products, t4tRows = [], completionRows = []) {
  const catalog = productCatalog(products);
  const experienceByPerson = collectExperience(experienceRows, catalog);
  const t4tByPerson = collectExperience(t4tRows, catalog);

  const qualificationsByPerson = new Map();
  for (const row of qualificationRows ?? []) {
    const personId = row?.person_id ?? row?.personId;
    const productId = row?.product_id ?? row?.productId;
    const product = catalog.get(productId);
    if (!personId || !product) continue;
    if (!qualificationsByPerson.has(personId)) qualificationsByPerson.set(personId, new Map());
    const productsForPerson = qualificationsByPerson.get(personId);
    if (productsForPerson.has(productId)) continue;
    const standing = cleanText(row.standing).toLowerCase();
    productsForPerson.set(productId, {
      id: row.id ?? null,
      productId,
      productCode: product.code,
      productName: product.name,
      sortOrder: product.sortOrder,
      standing: Object.prototype.hasOwnProperty.call(FACILITATOR_STANDING_LABELS, standing) ? standing : null,
      t4tCompletedOn: asDate(row.t4t_completed_on ?? row.t4tCompletedOn),
      firstFacilitatedOn: asDate(row.first_facilitated_on ?? row.firstFacilitatedOn),
      trainerAuthority: explicitTrue(row.trainer_authority ?? row.trainerAuthority),
      expirationOn: asDate(row.expiration_on ?? row.expirationOn),
      governingSource: cleanText(row.governing_source ?? row.governingSource),
      notes: cleanText(row.notes),
    });
  }

  const personnel = [];
  const seen = new Set();
  for (const source of people ?? []) {
    const person = mapPerson(source);
    if (!person.id || seen.has(person.id)) continue;
    const experience = experienceList(experienceByPerson, person.id);
    const t4tExperience = experienceList(t4tByPerson, person.id);
    const qualificationProducts = [...(qualificationsByPerson.get(person.id)?.values() ?? [])]
      .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.productName, right.productName));
    const t4tCompletions = facilitatorT4tCompletionHistory(
      (completionRows ?? []).filter((row) => (row?.person_id ?? row?.personId) === person.id),
      products,
    );
    if (
      person.isFacilitator !== true
      && experience.length === 0
      && t4tExperience.length === 0
      && qualificationProducts.length === 0
      && t4tCompletions.length === 0
    ) continue;
    seen.add(person.id);
    const roster = rosterFacilitationSummary(experience, t4tExperience, catalog);
    personnel.push({
      id: person.id,
      name: person.name,
      firstName: person.firstName,
      lastName: person.lastName,
      rankTitle: person.rankTitle,
      displayName: personnelDisplayName(person.rankTitle, person.name),
      commandOrganization: person.commandOrganization,
      installation: person.installation,
      active: person.active,
      isFacilitator: person.isFacilitator,
      isCredoStaff: person.isCredoStaff,
      isPoc: person.isPoc,
      staffBilletOrRole: person.staffBilletOrRole,
      staffPrdEaos: person.staffPrdEaos,
      productCount: roster.productCount,
      eventsConducted: roster.eventsConducted,
      mostRecentOn: roster.mostRecentOn,
      experience,
      t4tExperience,
      hasQualificationRecord: qualificationProducts.length > 0,
      qualificationProducts,
      t4tCompletions,
    });
  }
  return personnel;
}

function matchesProductEvidence(rows, productId) {
  return (rows ?? []).some((row) => row?.productId === productId);
}

export function filterFacilitatorPersonnel(records, filters = {}) {
  const query = normalizeSearch(filters.query);
  const active = filters.active === 'active' || filters.active === 'inactive' ? filters.active : 'all';
  const productId = cleanText(filters.productId);
  const population = filters.population || FACILITATOR_POPULATION_ALL_RECORDS;
  return (records ?? []).filter((record) => {
    if (!facilitatorInPopulation(record, population)) return false;
    if (active === 'active' && record.active !== true) return false;
    if (active === 'inactive' && record.active !== false) return false;
    if (productId) {
      const inExperience = matchesProductEvidence(record.experience, productId);
      const inT4t = matchesProductEvidence(record.t4tExperience, productId);
      const inQualification = matchesProductEvidence(record.qualificationProducts, productId);
      const inCompletion = matchesProductEvidence(record.t4tCompletions, productId);
      const matches = population === FACILITATOR_POPULATION_CREDO_USED
        ? (inExperience || inT4t)
        : population === FACILITATOR_POPULATION_TRAINED_POOL
          ? (inQualification || inCompletion)
          : (inExperience || inT4t || inQualification || inCompletion);
      if (!matches) return false;
    }
    if (!query) return true;
    return normalizeSearch(`${record.displayName} ${record.name}`).includes(query);
  });
}

function compareRecent(left, right, direction) {
  const leftDate = left.mostRecentOn || '';
  const rightDate = right.mostRecentOn || '';
  if (!leftDate && !rightDate) return comparePersonnelDisplayNames(left, right);
  if (!leftDate) return 1;
  if (!rightDate) return -1;
  const compared = direction === 'desc' ? compareText(rightDate, leftDate) : compareText(leftDate, rightDate);
  return compared || comparePersonnelDisplayNames(left, right);
}

export function sortFacilitatorPersonnel(records, column = 'name', direction = 'asc') {
  const descending = direction === 'desc';
  const sorted = [...(records ?? [])].sort((left, right) => {
    if (column === 'command') {
      return compareText(left.commandOrganization, right.commandOrganization) || comparePersonnelDisplayNames(left, right);
    }
    if (column === 'installation') {
      return compareText(left.installation, right.installation) || comparePersonnelDisplayNames(left, right);
    }
    if (column === 'products') {
      return left.productCount - right.productCount || comparePersonnelDisplayNames(left, right);
    }
    if (column === 'events') {
      return left.eventsConducted - right.eventsConducted || comparePersonnelDisplayNames(left, right);
    }
    if (column === 'recent') return compareRecent(left, right, descending ? 'desc' : 'asc');
    return comparePersonnelDisplayNames(left, right);
  });
  if (descending && column !== 'recent') return sorted.reverse();
  return sorted;
}

export function buildFacilitatorOverview(personnel, products) {
  const catalog = [...productCatalog(products).values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.name, right.name));
  const coverage = catalog.map((product) => {
    const rows = [];
    const instructorIds = new Set();
    for (const person of personnel ?? []) {
      const evidence = combinedProductEvidence(person, product.id);
      const hasQualification = person.qualificationProducts?.some((row) => row.productId === product.id) === true;
      if (evidence || hasQualification) instructorIds.add(person.id);
      if (evidence) rows.push(evidence);
    }
    const mostRecentOn = rows.reduce((latest, row) => {
      if (!row.mostRecentOn) return latest;
      if (!latest || row.mostRecentOn > latest) return row.mostRecentOn;
      return latest;
    }, null);
    return {
      productId: product.id,
      productName: product.name,
      sortOrder: product.sortOrder,
      peopleWithExperience: rows.length,
      instructors: instructorIds.size,
      recordedInstances: rows.reduce((sum, row) => sum + row.eventsConducted, 0),
      mostRecentOn,
    };
  });
  const productsWithRecordedExperience = coverage.filter((row) => row.peopleWithExperience > 0).length;
  const attention = [];
  for (const person of personnel ?? []) {
    if (person.active !== true) continue;
    const hasRecordedEvidence = hasRecordedFacilitatorEvidence(person);
    if (hasRecordedEvidence && person.hasQualificationRecord !== true) {
      attention.push({
        personId: person.id,
        displayName: person.displayName,
        condition: FACILITATOR_QUALIFICATION_NOT_ENTERED,
      });
    } else if (person.isFacilitator === true && !hasRecordedEvidence && person.hasQualificationRecord !== true) {
      attention.push({
        personId: person.id,
        displayName: person.displayName,
        condition: FACILITATOR_NO_EXPERIENCE_OR_RECORD,
      });
    }
  }
  attention.sort((left, right) => compareText(left.displayName, right.displayName) || compareText(left.personId, right.personId));
  return {
    activeFacilitatorPersonnel: (personnel ?? []).filter((person) => person.active === true).length,
    productsWithRecordedExperience,
    productsWithoutRecordedExperience: coverage.length - productsWithRecordedExperience,
    recordedFacilitationInstances: coverage.reduce((sum, row) => sum + row.recordedInstances, 0),
    coverage,
    attention,
  };
}

export function buildFacilitatorProgramCapabilities(personnel, products) {
  const catalog = [...productCatalog(products).values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.name, right.name));
  return catalog.map((product) => {
    const people = new Set();
    const experienced = [];
    const qualificationPeople = new Set();
    for (const person of personnel ?? []) {
      const experience = combinedProductEvidence(person, product.id);
      const hasQualification = person.qualificationProducts?.some((row) => row.productId === product.id) === true;
      if (!experience && !hasQualification) continue;
      people.add(person.id);
      if (experience) experienced.push(experience);
      if (hasQualification) qualificationPeople.add(person.id);
    }
    const mostRecentOn = experienced.reduce((latest, row) => {
      if (!row.mostRecentOn) return latest;
      if (!latest || row.mostRecentOn > latest) return row.mostRecentOn;
      return latest;
    }, null);
    return {
      productId: product.id,
      productName: product.name,
      sortOrder: product.sortOrder,
      personnelCount: people.size,
      recordedExperienceCount: experienced.length,
      recordedInstances: experienced.reduce((sum, row) => sum + row.eventsConducted, 0),
      mostRecentOn,
      qualificationRecordCount: qualificationPeople.size,
    };
  });
}

export function filterFacilitatorProgramCapabilities(records, filters = {}) {
  const query = normalizeSearch(filters.query);
  const presence = filters.presence === 'with' || filters.presence === 'without' ? filters.presence : 'all';
  return (records ?? []).filter((record) => {
    if (presence === 'with' && record.personnelCount === 0) return false;
    if (presence === 'without' && record.personnelCount > 0) return false;
    if (!query) return true;
    return normalizeSearch(record.productName).includes(query);
  });
}

function compareProductRecent(left, right, direction) {
  const leftDate = left.mostRecentOn || '';
  const rightDate = right.mostRecentOn || '';
  if (!leftDate && !rightDate) return left.sortOrder - right.sortOrder;
  if (!leftDate) return 1;
  if (!rightDate) return -1;
  const compared = direction === 'desc' ? compareText(rightDate, leftDate) : compareText(leftDate, rightDate);
  return compared || left.sortOrder - right.sortOrder;
}

export function sortFacilitatorProgramCapabilities(records, column = 'catalog', direction = 'asc') {
  const descending = direction === 'desc';
  const sorted = [...(records ?? [])].sort((left, right) => {
    if (column === 'personnel') return left.personnelCount - right.personnelCount || left.sortOrder - right.sortOrder;
    if (column === 'experience') return left.recordedExperienceCount - right.recordedExperienceCount || left.sortOrder - right.sortOrder;
    if (column === 'instances') return left.recordedInstances - right.recordedInstances || left.sortOrder - right.sortOrder;
    if (column === 'qualifications') return left.qualificationRecordCount - right.qualificationRecordCount || left.sortOrder - right.sortOrder;
    if (column === 'recent') return compareProductRecent(left, right, descending ? 'desc' : 'asc');
    return left.sortOrder - right.sortOrder || compareText(left.productName, right.productName);
  });
  if (descending && column !== 'recent') return sorted.reverse();
  return sorted;
}

export function facilitatorProductPersonnel(personnel, productId) {
  const people = [];
  for (const person of personnel ?? []) {
    const experience = combinedProductEvidence(person, productId);
    const hasQualificationRecord = person.qualificationProducts?.some((row) => row.productId === productId) === true;
    if (!experience && !hasQualificationRecord) continue;
    people.push({
      personId: person.id,
      displayName: person.displayName,
      commandOrganization: person.commandOrganization,
      installation: person.installation,
      active: person.active === true,
      hasRecordedExperience: Boolean(experience),
      recordedInstances: experience ? experience.eventsConducted : 0,
      firstRecordedOn: experience?.firstRecordedOn ?? null,
      mostRecentOn: experience?.mostRecentOn ?? null,
      hasQualificationRecord,
    });
  }
  return people.sort((left, right) => compareText(left.displayName, right.displayName) || compareText(left.personId, right.personId));
}

export function filterFacilitatorProductPersonnel(records, filters = {}) {
  const query = normalizeSearch(filters.query);
  const active = filters.active === 'active' || filters.active === 'inactive' ? filters.active : 'all';
  return (records ?? []).filter((record) => {
    if (active === 'active' && record.active !== true) return false;
    if (active === 'inactive' && record.active !== false) return false;
    if (!query) return true;
    return normalizeSearch(record.displayName).includes(query);
  });
}

export function facilitatorProductFilterOptions(products) {
  return [...productCatalog(products).values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.name, right.name))
    .map((product) => ({
      id: product.id,
      name: product.name,
      sortOrder: product.sortOrder,
    }));
}

const T4T_ANNIVERSARY_PRODUCT_CODES = new Set([
  'gottman_seven_principles',
  'prep_8_0',
  'four_lenses',
  'cliftonstrengths_strengths_discovery_encounter',
  'navigating_your_next_chapter',
  'safetalk',
  'asist',
]);

const T4T_ANNIVERSARY_CURRENT_STANDINGS = new Set(['developing', 'provisional', 'registered']);

const T4T_ANNIVERSARY_STATUS_ORDER = Object.freeze({
  overdue: 0,
  urgent: 1,
  needs_attention: 2,
  upcoming: 3,
  needs_verification: 4,
});

export function t4tAnniversaryProductApplicable(productCode) {
  return T4T_ANNIVERSARY_PRODUCT_CODES.has(cleanText(productCode));
}

function t4tAnniversaryResult(status, label, reason, deadline = null, daysRemaining = null) {
  return { status, deadline, daysRemaining, label, reason };
}

function anniversaryDeadline(completedOn) {
  const [year, month, day] = completedOn.split('-').map(Number);
  const targetYear = year + 1;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return calendarDate(
    `${targetYear}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`,
  );
}

function calendarDayNumber(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function daysUntil(today, deadline) {
  return Math.round(calendarDayNumber(deadline) - calendarDayNumber(today));
}

export function evaluateT4tAnniversaryAlert({
  productCode,
  t4tCompletedOn,
  qualificationStanding,
  personActive,
  today,
} = {}) {
  if (!t4tAnniversaryProductApplicable(productCode)) {
    return t4tAnniversaryResult('none', '', 'This product is outside the T4T anniversary set.');
  }
  if (personActive !== true) {
    return t4tAnniversaryResult('none', '', 'The person is inactive.');
  }
  const standing = cleanText(qualificationStanding).toLowerCase();
  if (!T4T_ANNIVERSARY_CURRENT_STANDINGS.has(standing)) {
    return t4tAnniversaryResult('none', '', 'The qualification record is not current.');
  }
  const todayIso = calendarDate(today) || localCalendarToday();
  const completedOn = calendarDate(t4tCompletedOn);
  if (!completedOn) {
    return t4tAnniversaryResult(
      'needs_verification',
      'Needs Verification',
      'No T4T completion date is recorded.',
    );
  }
  if (completedOn > todayIso) {
    return t4tAnniversaryResult(
      'needs_verification',
      'Needs Verification',
      'T4T completion date is in the future.',
    );
  }
  const deadline = anniversaryDeadline(completedOn);
  const daysRemaining = daysUntil(todayIso, deadline);
  return anniversaryStatusForRemainingDays(daysRemaining, deadline);
}

function anniversaryStatusForRemainingDays(daysRemaining, deadline) {
  if (daysRemaining > 90) {
    return t4tAnniversaryResult(
      'none',
      '',
      'More than 90 days remain before the T4T anniversary.',
      deadline,
      daysRemaining,
    );
  }
  if (daysRemaining >= 31) {
    return t4tAnniversaryResult(
      'upcoming',
      'Upcoming',
      'The T4T anniversary is 90 to 31 days away.',
      deadline,
      daysRemaining,
    );
  }
  if (daysRemaining >= 8) {
    return t4tAnniversaryResult(
      'needs_attention',
      'Needs Attention',
      'The T4T anniversary is 30 to 8 days away.',
      deadline,
      daysRemaining,
    );
  }
  if (daysRemaining >= 0) {
    return t4tAnniversaryResult(
      'urgent',
      'Urgent',
      'The T4T anniversary is 7 to 0 days away.',
      deadline,
      daysRemaining,
    );
  }
  return t4tAnniversaryResult(
    'overdue',
    'Overdue',
    'The T4T anniversary date has passed.',
    deadline,
    daysRemaining,
  );
}

export function formatT4tAnniversaryProfileLine(alert) {
  if (!alert || alert.status === 'none') return '';
  if (alert.status === 'needs_verification') {
    if (alert.reason === 'T4T completion date is in the future.') {
      return 'Needs Verification — T4T completion date is in the future.';
    }
    return 'Needs Verification — no T4T completion date recorded';
  }
  const date = formatRecordedFacilitationDate(alert.deadline);
  if (alert.status === 'overdue') return `${alert.label} — anniversary was due ${date}`;
  return `${alert.label} — anniversary due ${date}`;
}

export function buildT4tAnniversaryAlerts(personnel, today = localCalendarToday()) {
  const alerts = [];
  for (const person of personnel ?? []) {
    for (const qualification of person?.qualificationProducts ?? []) {
      const alert = evaluateT4tAnniversaryAlert({
        productCode: qualification?.productCode,
        t4tCompletedOn: qualification?.t4tCompletedOn,
        qualificationStanding: qualification?.standing,
        personActive: person?.active,
        today,
      });
      if (alert.status === 'none') continue;
      alerts.push({
        personId: person.id,
        displayName: person.displayName,
        productId: qualification.productId,
        productCode: qualification.productCode,
        productName: qualification.productName,
        status: alert.status,
        deadline: alert.deadline,
        daysRemaining: alert.daysRemaining,
        label: alert.label,
        reason: alert.reason,
      });
    }
  }
  alerts.sort((left, right) => {
    const rank = T4T_ANNIVERSARY_STATUS_ORDER[left.status] - T4T_ANNIVERSARY_STATUS_ORDER[right.status];
    if (rank) return rank;
    if (left.status === 'needs_verification') {
      return compareText(left.displayName, right.displayName)
        || compareText(left.productName, right.productName)
        || compareText(String(left.personId ?? ''), String(right.personId ?? ''));
    }
    return (left.daysRemaining ?? 0) - (right.daysRemaining ?? 0)
      || compareText(left.displayName, right.displayName)
      || compareText(left.productName, right.productName)
      || compareText(String(left.personId ?? ''), String(right.personId ?? ''));
  });
  return alerts;
}

const LIVINGWORKS_ACTIVITY_RULES = Object.freeze({
  safetalk: Object.freeze({ provisional: 3, registered: 2 }),
  asist: Object.freeze({ provisional: 3, registered: 1 }),
});

function unavailableLivingWorksActivity(reason = '') {
  return {
    applicable: false,
    phase: 'none',
    requiredCount: null,
    completedCount: null,
    windowStart: null,
    windowEnd: null,
    remainingCount: null,
    activityStatus: 'none',
    reason,
    ...emptyPreviousRegisteredCycle(),
  };
}

function emptyPreviousRegisteredCycle() {
  return {
    previousCycleMissed: false,
    previousWindowStart: null,
    previousWindowEnd: null,
    previousCompletedCount: null,
    previousRequiredCount: null,
  };
}

function addCalendarYears(isoDate, years) {
  let cursor = isoDate;
  for (let index = 0; index < years; index += 1) {
    cursor = anniversaryDeadline(cursor);
    if (!cursor) return '';
  }
  return cursor;
}

function nextCalendarDay(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return calendarDate(
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
  );
}

function anniversaryCycle(anchor, cycleIndex) {
  const windowEnd = addCalendarYears(anchor, cycleIndex + 1);
  if (!windowEnd) return null;
  if (cycleIndex === 0) return { windowStart: anchor, windowEnd };
  const previousEnd = addCalendarYears(anchor, cycleIndex);
  const windowStart = previousEnd ? nextCalendarDay(previousEnd) : '';
  if (!windowStart) return null;
  return { windowStart, windowEnd };
}

function currentAnniversaryCycleIndex(anchor, todayIso, phase) {
  const first = anniversaryCycle(anchor, 0);
  if (!first) return null;
  if (phase === 'provisional' || todayIso <= first.windowEnd) return 0;
  let cycle = 1;
  while (cycle < 200) {
    const window = anniversaryCycle(anchor, cycle);
    if (!window) return null;
    if (todayIso <= window.windowEnd) return cycle;
    cycle += 1;
  }
  return null;
}

function previousRegisteredCycle(anchor, cycleIndex, workshops, todayIso, requiredCount) {
  if (cycleIndex < 1) return emptyPreviousRegisteredCycle();
  const previousWindow = anniversaryCycle(anchor, cycleIndex - 1);
  if (!previousWindow) return emptyPreviousRegisteredCycle();
  const previousCompletedCount = workshopsInWindow(
    workshops,
    previousWindow.windowStart,
    previousWindow.windowEnd,
    todayIso,
  );
  return {
    previousCycleMissed: previousCompletedCount < requiredCount,
    previousWindowStart: previousWindow.windowStart,
    previousWindowEnd: previousWindow.windowEnd,
    previousCompletedCount,
    previousRequiredCount: requiredCount,
  };
}

function workshopsInWindow(workshops, windowStart, windowEnd, todayIso) {
  const eventIds = new Set();
  for (const workshop of workshops ?? []) {
    const recordedOn = calendarDate(workshop?.recordedOn);
    const eventId = cleanText(workshop?.eventId);
    if (!recordedOn || !eventId || recordedOn > todayIso) continue;
    if (recordedOn < windowStart || recordedOn > windowEnd) continue;
    eventIds.add(eventId);
  }
  return eventIds.size;
}

export function evaluateLivingWorksActivity({
  productCode,
  qualificationStanding,
  t4tCompletedOn,
  personActive,
  workshops,
  today,
} = {}) {
  const code = cleanText(productCode);
  const rules = LIVINGWORKS_ACTIVITY_RULES[code];
  if (!rules) {
    return unavailableLivingWorksActivity('This product has no LivingWorks workshop requirement.');
  }
  if (personActive !== true) {
    return unavailableLivingWorksActivity('The person is inactive.');
  }
  const standing = cleanText(qualificationStanding).toLowerCase();
  const requiredCount = rules[standing];
  if (requiredCount == null) {
    return unavailableLivingWorksActivity('This standing has no LivingWorks workshop requirement.');
  }
  const todayIso = calendarDate(today) || localCalendarToday();
  const completedOn = calendarDate(t4tCompletedOn);
  if (!completedOn) {
    return unavailableLivingWorksActivity('No T4T completion date is recorded.');
  }
  if (completedOn > todayIso) {
    return unavailableLivingWorksActivity('T4T completion date is in the future.');
  }
  const cycleIndex = currentAnniversaryCycleIndex(completedOn, todayIso, standing);
  const window = cycleIndex == null ? null : anniversaryCycle(completedOn, cycleIndex);
  if (!window?.windowStart || !window?.windowEnd) {
    return unavailableLivingWorksActivity('The anniversary window could not be calculated.');
  }
  const completedCount = workshopsInWindow(workshops, window.windowStart, window.windowEnd, todayIso);
  const remainingCount = Math.max(0, requiredCount - completedCount);
  const previousCycle = standing === 'registered'
    ? previousRegisteredCycle(completedOn, cycleIndex, workshops, todayIso, requiredCount)
    : emptyPreviousRegisteredCycle();
  if (completedCount >= requiredCount) {
    return {
      applicable: true,
      phase: standing,
      requiredCount,
      completedCount,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      remainingCount,
      activityStatus: 'met',
      reason: 'The workshop requirement for this anniversary window is met.',
      ...previousCycle,
    };
  }
  const windowClosed = todayIso > window.windowEnd;
  return {
    applicable: true,
    phase: standing,
    requiredCount,
    completedCount,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    remainingCount,
    activityStatus: windowClosed ? 'window_closed' : 'not_yet_met',
    reason: windowClosed
      ? 'The anniversary window ended before the workshop requirement was met.'
      : 'The workshop requirement for this anniversary window is not yet met.',
    ...previousCycle,
  };
}

function livingWorksNoun(requiredCount) {
  return requiredCount === 1 ? 'workshop' : 'workshops';
}

function formatCountProgress(completedCount, requiredCount) {
  if (requiredCount == null || completedCount == null) return '';
  return `${completedCount} of ${requiredCount} ${livingWorksNoun(requiredCount)}`;
}

export function formatLivingWorksProgress(activity) {
  if (!activity?.applicable) return '';
  return formatCountProgress(activity.completedCount, activity.requiredCount);
}

export function formatLivingWorksPreviousCycleLine(activity) {
  if (!activity?.previousCycleMissed) return '';
  const progress = formatCountProgress(activity.previousCompletedCount, activity.previousRequiredCount);
  const date = formatRecordedFacilitationDate(activity.previousWindowEnd);
  if (!progress || !date) return '';
  return `Previous cycle: ${progress} through ${date} — Requirement Not Met`;
}

export function formatLivingWorksActivityLine(activity) {
  const progress = formatLivingWorksProgress(activity);
  if (!progress) return '';
  const date = formatRecordedFacilitationDate(activity.windowEnd);
  const label = activity.activityStatus === 'met'
    ? 'Met'
    : activity.activityStatus === 'window_closed'
      ? 'Window Closed'
      : 'Not Yet Met';
  const line = `${progress} through ${date} — ${label}`;
  return activity.previousCycleMissed ? `Current cycle: ${line}` : line;
}

function workshopsForQualification(workshops, personId, productId) {
  if (!Array.isArray(workshops)) return [];
  return workshops.filter((row) => row?.personId === personId && row?.productId === productId);
}

function qualificationFollowUp({
  productCode,
  qualificationStanding,
  t4tCompletedOn,
  personActive,
  workshops,
  today,
  activityEnabled,
}) {
  const warning = evaluateT4tAnniversaryAlert({
    productCode,
    t4tCompletedOn,
    qualificationStanding,
    personActive,
    today,
  });
  if (activityEnabled !== true) {
    return { warning, activity: unavailableLivingWorksActivity() };
  }
  const activity = evaluateLivingWorksActivity({
    productCode,
    qualificationStanding,
    t4tCompletedOn,
    personActive,
    workshops,
    today,
  });
  if (activity.previousCycleMissed) {
    const todayIso = calendarDate(today) || localCalendarToday();
    return {
      warning: anniversaryStatusForRemainingDays(daysUntil(todayIso, activity.previousWindowEnd), activity.previousWindowEnd),
      activity,
    };
  }
  if (!activity.applicable || activity.activityStatus !== 'met') {
    if (!activity.applicable) return { warning, activity };
    const todayIso = calendarDate(today) || localCalendarToday();
    const daysRemaining = daysUntil(todayIso, activity.windowEnd);
    return {
      warning: anniversaryStatusForRemainingDays(daysRemaining, activity.windowEnd),
      activity,
    };
  }
  const todayIso = calendarDate(today) || localCalendarToday();
  return {
    warning: t4tAnniversaryResult(
      'none',
      '',
      'The workshop requirement for this anniversary window is met.',
      activity.windowEnd,
      daysUntil(todayIso, activity.windowEnd),
    ),
    activity,
  };
}

export function presentQualificationFollowUp({
  productCode,
  qualificationStanding,
  t4tCompletedOn,
  personActive,
  workshops,
  today,
  activityEnabled = Array.isArray(workshops),
} = {}) {
  const followUp = qualificationFollowUp({
    productCode,
    qualificationStanding,
    t4tCompletedOn,
    personActive,
    workshops,
    today,
    activityEnabled,
  });
  return {
    warning: followUp.warning,
    activity: followUp.activity,
    warningLine: followUp.activity?.previousCycleMissed
      ? ''
      : formatT4tAnniversaryProfileLine(followUp.warning),
    previousCycleLine: formatLivingWorksPreviousCycleLine(followUp.activity),
    activityLine: formatLivingWorksActivityLine(followUp.activity),
    progress: formatLivingWorksProgress(followUp.activity),
  };
}

function sortAnniversaryAlerts(alerts) {
  alerts.sort((left, right) => {
    const rank = T4T_ANNIVERSARY_STATUS_ORDER[left.status] - T4T_ANNIVERSARY_STATUS_ORDER[right.status];
    if (rank) return rank;
    if (left.status === 'needs_verification') {
      return compareText(left.displayName, right.displayName)
        || compareText(left.productName, right.productName)
        || compareText(String(left.personId ?? ''), String(right.personId ?? ''));
    }
    return (left.daysRemaining ?? 0) - (right.daysRemaining ?? 0)
      || compareText(left.displayName, right.displayName)
      || compareText(left.productName, right.productName)
      || compareText(String(left.personId ?? ''), String(right.personId ?? ''));
  });
  return alerts;
}

export function buildQualificationAnniversaryWarnings(personnel, workshops, today = localCalendarToday()) {
  const activityEnabled = Array.isArray(workshops);
  const alerts = [];
  for (const person of personnel ?? []) {
    for (const qualification of person?.qualificationProducts ?? []) {
      const followUp = qualificationFollowUp({
        productCode: qualification?.productCode,
        qualificationStanding: qualification?.standing,
        t4tCompletedOn: qualification?.t4tCompletedOn,
        personActive: person?.active,
        workshops: workshopsForQualification(workshops, person?.id, qualification?.productId),
        today,
        activityEnabled,
      });
      if (followUp.warning.status === 'none') continue;
      alerts.push({
        personId: person.id,
        displayName: person.displayName,
        productId: qualification.productId,
        productCode: qualification.productCode,
        productName: qualification.productName,
        status: followUp.warning.status,
        deadline: followUp.warning.deadline,
        daysRemaining: followUp.warning.daysRemaining,
        label: followUp.warning.label,
        reason: followUp.warning.reason,
        progress: followUp.activity.previousCycleMissed
          ? formatCountProgress(followUp.activity.previousCompletedCount, followUp.activity.previousRequiredCount)
          : (followUp.activity.applicable ? formatLivingWorksProgress(followUp.activity) : ''),
      });
    }
  }
  return sortAnniversaryAlerts(alerts);
}
