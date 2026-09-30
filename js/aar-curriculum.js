import { normalizeCurriculumProductId } from './event-curriculum.js';

export function aarCurriculumDisplayName(curriculumProductId, choices, isT4t = false) {
  const productId = normalizeCurriculumProductId(curriculumProductId);
  if (!productId) return null;

  const match = (choices || []).find((choice) => choice?.productId === productId);
  const name = String(match?.name ?? '').trim();
  if (!name) return null;
  return isT4t === true ? `${name} T4T` : name;
}
