/** Marketplace Article admin form helpers — Phase A2. */

export const ARTICLE_LEVELS = [1, 2, 3, 4, 5];
export const ARTICLE_STATUSES = ["draft", "published", "closed", "cancelled"];

/** Backend source of truth; frontend display only. */
export function deriveArticleValueJodFromLevel(level) {
  const n = Number(level);
  if (!ARTICLE_LEVELS.includes(n)) return "";
  return n.toFixed(3);
}

export function getInitialMarketplaceArticleFormState(overrides = {}) {
  return {
    title: "",
    description: "",
    articleLevel: 1,
    requiredWordCount: 500,
    requiredReferencesCount: 0,
    status: "draft",
    categoryId: "",
    subcategoryId: "",
    isFakeOrTraining: false,
    ...overrides,
  };
}

export function articleToMarketplaceFormState(article) {
  if (!article) return getInitialMarketplaceArticleFormState();
  return getInitialMarketplaceArticleFormState({
    title: article.title || "",
    description: article.description || "",
    articleLevel: article.articleLevel ?? 1,
    requiredWordCount: article.requiredWordCount ?? 500,
    requiredReferencesCount: article.requiredReferencesCount ?? 0,
    status: article.status || "draft",
    categoryId: article.categoryId || article.category?.id || "",
    subcategoryId: article.subcategoryId || article.subcategory?.id || "",
    isFakeOrTraining: Boolean(article.isFakeOrTraining),
  });
}

export function validateMarketplaceArticleForm(form) {
  const errors = {};
  const title = String(form.title || "").trim();
  if (!title) errors.title = "العنوان مطلوب.";
  if (title.length > 240) errors.title = "العنوان طويل جداً.";
  const level = Number(form.articleLevel);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    errors.articleLevel = "مستوى المقال يجب أن يكون بين 1 و 5.";
  }
  const words = Number(form.requiredWordCount);
  if (!Number.isInteger(words) || words <= 0) {
    errors.requiredWordCount = "عدد الكلمات يجب أن يكون أكبر من صفر.";
  }
  const refs = Number(form.requiredReferencesCount);
  if (!Number.isInteger(refs) || refs < 0) {
    errors.requiredReferencesCount = "عدد المراجع يجب أن يكون ≥ 0.";
  }
  if (!ARTICLE_STATUSES.includes(String(form.status || ""))) {
    errors.status = "حالة غير صالحة.";
  }
  return errors;
}

export function normalizeMarketplaceArticlePayload(form) {
  const articleLevel = Number(form.articleLevel);
  return {
    title: String(form.title || "").trim(),
    description: String(form.description || "").trim(),
    articleLevel,
    // Value derived on backend; omit client money forge.
    requiredWordCount: Number(form.requiredWordCount),
    requiredReferencesCount: Number(form.requiredReferencesCount) || 0,
    status: String(form.status || "draft"),
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    subcategoryId: form.subcategoryId ? Number(form.subcategoryId) : null,
    isFakeOrTraining: Boolean(form.isFakeOrTraining),
  };
}
