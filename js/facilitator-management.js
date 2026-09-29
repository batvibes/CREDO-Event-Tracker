/**
 * Read-only Facilitator Management personnel model.
 * Historical experience comes from facilitator_product_experience.
 * The operational catalog is facilitator_products with active === true, ordered by sort_order.
 * A person is included when is_facilitator is true, or when derived experience or a
 * qualification row exists on an active product. Inactive product rows stay stored and
 * are omitted here. This module does not write people, qualifications, roles, or Events.
 *
 * Later views can sit beside Personnel: Overview, Program Capabilities, and Development.
 */

import { personnelDisplayName } from './personnel-identity.js';

export const FACILITATOR_EMPTY_PERSONNEL = 'No facilitator personnel found.';
export const FACILITATOR_EMPTY_EXPERIENCE = 'No recorded facilitator experience.';
export const FACILITATOR_NO_QUALIFICATION_RECORD = 'No qualification record.';
export const FACILITATOR_QUALIFICATION_RECORD = 'Qualification record on file.';
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
export const FACILITATOR_RECENT_LIMIT = 8;

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

export function summarizeFacilitatorPersonnel(people, experienceRows, qualificationRows, products) {
  const catalog = productCatalog(products);
  const experienceByPerson = new Map();
  for (const row of experienceRows ?? []) {
    const personId = row?.person_id ?? row?.personId;
    const productId = row?.product_id ?? row?.productId;
    const product = catalog.get(productId);
    if (!personId || !product) continue;
    if (!experienceByPerson.has(personId)) experienceByPerson.set(personId, new Map());
    const productsForPerson = experienceByPerson.get(personId);
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

  const qualificationsByPerson = new Map();
  for (const row of qualificationRows ?? []) {
    const personId = row?.person_id ?? row?.personId;
    const productId = row?.product_id ?? row?.productId;
    const product = catalog.get(productId);
    if (!personId || !product) continue;
    if (!qualificationsByPerson.has(personId)) qualificationsByPerson.set(personId, new Map());
    const productsForPerson = qualificationsByPerson.get(personId);
    if (productsForPerson.has(productId)) continue;
    productsForPerson.set(productId, {
      productId,
      productName: product.name,
      sortOrder: product.sortOrder,
    });
  }

  const personnel = [];
  const seen = new Set();
  for (const source of people ?? []) {
    const person = mapPerson(source);
    if (!person.id || seen.has(person.id)) continue;
    const experience = [...(experienceByPerson.get(person.id)?.values() ?? [])]
      .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.productName, right.productName));
    const qualificationProducts = [...(qualificationsByPerson.get(person.id)?.values() ?? [])]
      .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.productName, right.productName));
    if (person.isFacilitator !== true && experience.length === 0 && qualificationProducts.length === 0) continue;
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
      const inQualification = record.qualificationProducts.some((row) => row.productId === productId);
      if (!inExperience && !inQualification) return false;
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
      const experience = person.experience?.find((row) => row.productId === product.id);
      if (experience) rows.push(experience);
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
  const recent = [];
  for (const person of personnel ?? []) {
    for (const row of person.experience ?? []) {
      if (!row.mostRecentOn) continue;
      recent.push({
        personId: person.id,
        displayName: person.displayName,
        productId: row.productId,
        productName: row.productName,
        mostRecentOn: row.mostRecentOn,
      });
    }
  }
  recent.sort((left, right) => compareText(right.mostRecentOn, left.mostRecentOn)
    || compareText(left.displayName, right.displayName)
    || compareText(left.productName, right.productName));
  const attention = [];
  for (const person of personnel ?? []) {
    if (person.active !== true) continue;
    if (person.experience.length > 0 && person.hasQualificationRecord !== true) {
      attention.push({
        personId: person.id,
        displayName: person.displayName,
        condition: FACILITATOR_QUALIFICATION_NOT_ENTERED,
      });
    } else if (person.isFacilitator === true && person.experience.length === 0 && person.hasQualificationRecord !== true) {
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
    recent: recent.slice(0, FACILITATOR_RECENT_LIMIT),
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
      const experience = person.experience?.find((row) => row.productId === product.id);
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
    const experience = person.experience?.find((row) => row.productId === productId) || null;
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

export function facilitatorProductFilterOptions(records) {
  const options = new Map();
  for (const record of records ?? []) {
    for (const row of [...record.experience, ...record.qualificationProducts]) {
      if (!row?.productId || options.has(row.productId)) continue;
      options.set(row.productId, {
        id: row.productId,
        name: row.productName,
        sortOrder: row.sortOrder,
      });
    }
  }
  return [...options.values()].sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.name, right.name));
}
