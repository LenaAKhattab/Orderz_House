/** @param {{ name: string, value: string }[]} items @param {(key: string, values?: Record<string, string | number>) => string} t */
export function mapPaletteOptions(items, t) {
  return items.map((o) => ({
    ...o,
    label: t(`ads.palette.${o.name}`),
  }));
}

/** @param {{ name: string, gradientFrom: string, gradientTo: string }[]} items */
export function mapGradientPresets(items, t) {
  return items.map((o) => ({
    ...o,
    label: t(`ads.gradients.${o.name}`),
  }));
}

/** @param {(key: string, values?: Record<string, string | number>) => string} t */
export function getPreviewFallbacks(t) {
  return {
    companyName: t("ads.preview.fallbacks.companyName"),
    title: t("ads.preview.fallbacks.title"),
    subtitle: t("ads.preview.fallbacks.subtitle"),
    description: t("ads.preview.fallbacks.description"),
    ctaText: t("ads.preview.fallbacks.ctaText"),
    badgeText: t("ads.preview.fallbacks.badgeText"),
    salePercent: "20",
  };
}
