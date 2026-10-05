export const REGISTRATION_STATUSES = ['Not Started', 'Registration Created', 'Registration Live'];

export const REGISTRATION_STATUS_CLASS = {
  'Not Started': 'not-started',
  'Registration Created': 'in-progress',
  'Registration Live': 'complete',
};

export function normalizeRegistrationStatus(value) {
  return REGISTRATION_STATUSES.includes(value) ? value : 'Not Started';
}

export function cycleRegistrationStatus(current) {
  const index = REGISTRATION_STATUSES.indexOf(current);
  const nextIndex = index === -1 ? 0 : (index + 1) % REGISTRATION_STATUSES.length;
  return REGISTRATION_STATUSES[nextIndex];
}

export function compareRegistrationStatus(aVal, bVal) {
  const leftIndex = REGISTRATION_STATUSES.indexOf(aVal);
  const rightIndex = REGISTRATION_STATUSES.indexOf(bVal);
  if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
  return String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, { sensitivity: 'base' });
}
