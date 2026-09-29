/**
 * Optional Event curriculum choices.
 * Product identity comes from facilitator_event_type_allowed_products
 * joined to active facilitator_products and event_types. No product UUID is fixed here.
 */

export const EVENT_CURRICULUM_LABEL = 'Curriculum / Product';

export function isMissingEventCurriculumSchemaError(error) {
  const code = String(error?.code || '');
  return code === 'PGRST204'
    || code === 'PGRST205'
    || code === '42P01'
    || code === '42703';
}

export function normalizeCurriculumProductId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function buildEventCurriculumChoices({ allowedRows, products, eventTypes }) {
  const activeProducts = new Map(
    (products || [])
      .filter((product) => product && product.active === true && product.id)
      .map((product) => [product.id, product]),
  );
  const typesById = new Map(
    (eventTypes || [])
      .filter((eventType) => eventType && eventType.id)
      .map((eventType) => [eventType.id, eventType]),
  );

  const choices = [];
  for (const row of allowedRows || []) {
    const product = activeProducts.get(row?.product_id);
    const eventType = typesById.get(row?.event_type_id);
    if (!product || !eventType || !eventType.name) continue;
    choices.push({
      eventTypeId: eventType.id,
      eventTypeName: eventType.name,
      productId: product.id,
      code: product.code,
      name: product.name,
      sortOrder: Number(product.sort_order) || 0,
    });
  }

  choices.sort((left, right) => (
    left.sortOrder - right.sortOrder
    || left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
  ));
  return choices;
}

export function curriculumChoicesForEventType(choices, eventTypeName) {
  return (choices || []).filter((choice) => choice.eventTypeName === eventTypeName);
}

export function reconcileCurriculumProductId(choices, eventTypeName, productId) {
  const normalized = normalizeCurriculumProductId(productId);
  if (!normalized) return null;
  const allowed = curriculumChoicesForEventType(choices, eventTypeName)
    .some((choice) => choice.productId === normalized);
  return allowed ? normalized : null;
}
