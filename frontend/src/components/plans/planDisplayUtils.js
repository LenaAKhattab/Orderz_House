/** Normalize bullet text so feature vs training duplicates can be detected. */
function normalizePlanBullet(text) {
  return String(text)
    .replace(/^تدريب:\s*/u, "")
    .replace(/^تدريب\s+/u, "")
    .replace(/مجاني(?:ة)?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRedundantPlanBullet(candidate, existingNormalized) {
  const normalized = normalizePlanBullet(candidate);
  if (!normalized) return true;
  return existingNormalized.some((entry) => {
    if (!entry) return false;
    if (normalized === entry) return true;
    return entry.includes(normalized) || normalized.includes(entry);
  });
}

export function planListItems(plan, locale = "ar") {
  if (Array.isArray(plan?.planFeatures) && plan.planFeatures.length > 0) {
    return plan.planFeatures
      .filter((item) => item?.isIncluded !== false)
      .map((item) => {
        if (locale === "en" && item?.featureTextEn) return String(item.featureTextEn);
        return String(item.featureText || item);
      })
      .filter(Boolean)
      .slice(0, 14);
  }
  const features = Array.isArray(plan?.features) ? plan.features.filter(Boolean).map(String) : [];
  const trainingsEn =
    Array.isArray(plan?.trainingsEn) && plan.trainingsEn.length > 0
      ? plan.trainingsEn.filter(Boolean).map(String)
      : [];
  const trainingsAr = Array.isArray(plan?.trainings) ? plan.trainings.filter(Boolean).map(String) : [];
  const trainings =
    locale === "en" && trainingsEn.length > 0 ? trainingsEn : trainingsAr;
  const trainingPrefix = locale === "en" ? "Training: " : "تدريب: ";
  if (features.length > 0 || trainings.length > 0) {
    const items = [];
    const normalized = [];

    for (const feature of features) {
      if (isRedundantPlanBullet(feature, normalized)) continue;
      items.push(feature);
      normalized.push(normalizePlanBullet(feature));
    }

    for (const training of trainings) {
      const labelled = `${trainingPrefix}${training}`;
      if (isRedundantPlanBullet(training, normalized) || isRedundantPlanBullet(labelled, normalized)) {
        continue;
      }
      items.push(labelled);
      normalized.push(normalizePlanBullet(training));
    }

    return items.slice(0, 14);
  }
  const d = Number(plan?.durationDays);
  if (Number.isFinite(d) && d > 0) {
    return [`مدة الاشتراك: ${d} يوم`];
  }
  return [];
}

export function formatOrderValueRange(plan) {
  const minRaw = plan?.minOrderValue ?? plan?.orderValueMinJod;
  const maxRaw = plan?.maxOrderValue ?? plan?.orderValueMaxJod;
  const min = minRaw != null ? Number(minRaw) : null;
  const max = maxRaw != null ? Number(maxRaw) : null;
  if (!Number.isFinite(min) && !Number.isFinite(max)) return null;
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return `قيمة الطلبات: من ${min} إلى ${max} د.أ`;
  }
  if (Number.isFinite(min)) {
    return `قيمة الطلبات: من ${min} د.أ وأكثر`;
  }
  return `قيمة الطلبات: حتى ${max} د.أ`;
}

export function formatInstallmentSummary(plan) {
  const inst = plan?.installmentPlan;
  if (!inst || typeof inst !== "object") return null;
  const parts = [];
  if (inst.upfrontJod != null) parts.push(`${Number(inst.upfrontJod)} د.أ عند الاشتراك`);
  if (inst.monthlyJod != null && inst.months != null) {
    parts.push(`${Number(inst.monthlyJod)} د.أ شهرياً × ${inst.months} شهر`);
  }
  if (parts.length === 0) return inst.notes || null;
  return parts.join(" · ");
}

export function isOfferActive(plan) {
  const label = plan?.offerLabel;
  const labelEn = plan?.offerLabelEn;
  if (!label && !labelEn) return false;
  const exp = plan?.offerExpiresAt;
  if (!exp) return true;
  const t = new Date(exp).getTime();
  if (!Number.isFinite(t)) return true;
  return t >= Date.now();
}
