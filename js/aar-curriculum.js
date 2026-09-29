import { normalizeCurriculumProductId } from './event-curriculum.js';

export function aarCurriculumDisplayName(curriculumProductId, choices) {
  const productId = normalizeCurriculumProductId(curriculumProductId);
  if (!productId) return null;

  const match = (choices || []).find((choice) => choice?.productId === productId);
  const name = String(match?.name ?? '').trim();
  return name || null;
}
