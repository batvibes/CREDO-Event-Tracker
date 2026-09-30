/**
 * Read-only Facilitator Management personnel model.
 * Ordinary facilitation comes from facilitator_product_experience.
 * T4T facilitation comes from facilitator_t4t_product_experience.
 * The operational catalog is facilitator_products with active === true, ordered by sort_order.
 * A person is included when is_facilitator is true, or when ordinary experience, T4T
 * facilitation evidence, or a qualification row exists on an active product.
 * Inactive product rows stay stored and are omitted here. Stored qualification fields
 * stay manual facts. Standing, T4T completion, and trainer authority are not inferred
 * from either experience aggregate. Overview and Program Capabilities union the two
 * aggregates so a T4T delivery is not dropped from those totals. An Event belongs to
 * only one aggregate, and a person is counted once per product. This module does
 * not write people, qualifications, roles, or Events.
 *
 * Later views can sit beside Personnel: Overview, Program Capabilities, and Development.
 */

import { personnelDisplayName } from './personnel-identity.js';

export const FACILITATOR_EMPTY_PERSONNEL = 'No facilitator personnel found.';
export const FACILITATOR_EMPTY_EXPERIENCE = 'No recorded facilitator experience.';
export const FACILITATOR_EMPTY_T4T_EXPERIENCE = 'No recorded T4T facilitation experience.';
export const FACILITATOR_T4T_EXPERIENCE_HEADING = 'T4T Facilitation Experience';
export const FACILITATOR_EMPTY_QUALIFICATIONS = 'No qualification or training records entered.';
export const FACILITATOR_QUALIFICATIONS_HEADING = 'Qualifications & Training';
export const FACILITATOR_EXPERIENCE_HEADING = 'Recorded Facilitation Experience';
export const FACILITATOR_NO_DATA_GAPS = 'No current data gaps identified.';
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
    fields.push({ label: 'Trainer / T4T Authority', value: 'Yes' });
  }
  if (qualification?.governingSource) {
    fields.push({ label: 'Governing Source', value: qualification.governingSource });
  }
  if (qualification?.notes) fields.push({ label: 'Notes', value: qualification.notes });
  return fields;
}

export function facilitatorQualificationProductChoices(products, qualifications) {
  const taken = new Set((qualifications ?? []).map((row) => row?.productId).filter(Boolean));
  return facilitatorProductFilterOptions(products).filter((product) => !taken.has(product.id));
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
    rankTitle: cleanText(row?.rank_title ?? row?.rankTitle),
    commandOrganization: cleanText(row?.command_organization ?? row?.commandOrganization),
    installation: cleanText(row?.installation),
    active: explicitTrue(row?.active),
    isFacilitator: explicitTrue(row?.is_facilitator ?? row?.isFacilitator),
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

function hasRecordedFacilitatorEvidence(person) {
  return (person?.experience?.length ?? 0) > 0 || (person?.t4tExperience?.length ?? 0) > 0;
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
    });
  }
  return byId;
}

export function summarizeFacilitatorPersonnel(people, experienceRows, qualificationRows, products, t4tRows = []) {
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
    if (person.isFacilitator !== true && experience.length === 0 && t4tExperience.length === 0 && qualificationProducts.length === 0) continue;
    seen.add(person.id);
    const mostRecentOn = experience.reduce((latest, row) => {
      if (!row.mostRecentOn) return latest;
      if (!latest || row.mostRecentOn > latest) return row.mostRecentOn;
      return latest;
    }, null);
    personnel.push({
      id: person.id,
      name: person.name,
      rankTitle: person.rankTitle,
      displayName: personnelDisplayName(person.rankTitle, person.name),
      commandOrganization: person.commandOrganization,
      installation: person.installation,
      active: person.active,
      isFacilitator: person.isFacilitator,
      productCount: experience.length,
      eventsConducted: experience.reduce((sum, row) => sum + row.eventsConducted, 0),
      mostRecentOn,
      experience,
      t4tExperience,
      hasQualificationRecord: qualificationProducts.length > 0,
      qualificationProducts,
    });
  }
  return personnel;
}

export function filterFacilitatorPersonnel(records, filters = {}) {
  const query = normalizeSearch(filters.query);
  const active = filters.active === 'active' || filters.active === 'inactive' ? filters.active : 'all';
  const productId = cleanText(filters.productId);
  return (records ?? []).filter((record) => {
    if (active === 'active' && record.active !== true) return false;
    if (active === 'inactive' && record.active !== false) return false;
    if (productId) {
      const inExperience = record.experience.some((row) => row.productId === productId);
      const inT4t = (record.t4tExperience ?? []).some((row) => row.productId === productId);
      const inQualification = record.qualificationProducts.some((row) => row.productId === productId);
      if (!inExperience && !inT4t && !inQualification) return false;
    }
    if (!query) return true;
    return normalizeSearch(`${record.displayName} ${record.name}`).includes(query);
  });
}

function compareRecent(left, right, direction) {
  const leftDate = left.mostRecentOn || '';
  const rightDate = right.mostRecentOn || '';
  if (!leftDate && !rightDate) return compareText(left.displayName, right.displayName);
  if (!leftDate) return 1;
  if (!rightDate) return -1;
  const compared = direction === 'desc' ? compareText(rightDate, leftDate) : compareText(leftDate, rightDate);
  return compared || compareText(left.displayName, right.displayName);
}

export function sortFacilitatorPersonnel(records, column = 'name', direction = 'asc') {
  const descending = direction === 'desc';
  const sorted = [...(records ?? [])].sort((left, right) => {
    if (column === 'command') {
      return compareText(left.commandOrganization, right.commandOrganization) || compareText(left.displayName, right.displayName);
    }
    if (column === 'installation') {
      return compareText(left.installation, right.installation) || compareText(left.displayName, right.displayName);
    }
    if (column === 'products') {
      return left.productCount - right.productCount || compareText(left.displayName, right.displayName);
    }
    if (column === 'events') {
      return left.eventsConducted - right.eventsConducted || compareText(left.displayName, right.displayName);
    }
    if (column === 'recent') return compareRecent(left, right, descending ? 'desc' : 'asc');
    return compareText(left.displayName, right.displayName) || compareText(left.id, right.id);
  });
  if (descending && column !== 'recent') return sorted.reverse();
  return sorted;
}

export function buildFacilitatorOverview(personnel, products) {
  const catalog = [...productCatalog(products).values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.name, right.name));
  const coverage = catalog.map((product) => {
    const rows = [];
    for (const person of personnel ?? []) {
      const evidence = combinedProductEvidence(person, product.id);
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
