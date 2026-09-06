/**
 * User feedback form: show optional topic select only when active topics exist.
 * Zero topics / loading / missing category → hide control (manual fields still work).
 * @param {{ categoryId?: string|number|null, type?: string|null, topicsLoading?: boolean, topics?: unknown[] }} p
 */
export function shouldShowFeedbackTopicDropdown({ categoryId, type, topicsLoading, topics }) {
  const hasCategory = categoryId != null && categoryId !== "";
  const hasType = Boolean(type);
  return Boolean(hasCategory || hasType) && !topicsLoading && Array.isArray(topics) && topics.length > 0;
}

/**
 * Changing category/type must clear any previously selected topic id.
 * @param {string|number} nextCategoryOrType
 */
export function nextTopicIdOnFeedbackTypeChange(nextCategoryOrType) {
  void nextCategoryOrType;
  return "";
}

/** Alias for category-first UI. */
export const nextTopicIdOnCategoryChange = nextTopicIdOnFeedbackTypeChange;
