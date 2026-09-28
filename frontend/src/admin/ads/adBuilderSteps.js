/** Builder step metadata — labels resolved via i18n in AdBuilderStepNav. */
export const BUILDER_STEP_DEFS = [
  { id: 1, key: "content" },
  { id: 2, key: "design" },
  { id: 3, key: "offer" },
  { id: 4, key: "images" },
  { id: 5, key: "publish" },
  { id: 6, key: "orderStats" },
];

/** @param {(key: string, values?: Record<string, string | number>) => string} t */
export function getBuilderSteps(t) {
  return BUILDER_STEP_DEFS.map((s) => ({
    id: s.id,
    label: t(`ads.builderSteps.${s.key}.label`),
    short: t(`ads.builderSteps.${s.key}.short`),
  }));
}
