export function formatPriceJod(priceJod) {
  if (priceJod === null || priceJod === undefined) return null;
  const n = Number(priceJod);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "مجانية";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} د.أ`;
}

export function planListItems(plan) {
  const features = Array.isArray(plan?.features) ? plan.features.filter(Boolean).map(String) : [];
  const trainings = Array.isArray(plan?.trainings) ? plan.trainings.filter(Boolean).map(String) : [];
  if (features.length > 0 || trainings.length > 0) {
    const items = [...features];
    if (trainings.length > 0) {
      items.push(...trainings.map((t) => `تدريب: ${t}`));
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
  const min = plan?.orderValueMinJod != null ? Number(plan.orderValueMinJod) : null;
  const max = plan?.orderValueMaxJod != null ? Number(plan.orderValueMaxJod) : null;
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
  if (!label) return false;
  const exp = plan?.offerExpiresAt;
  if (!exp) return true;
  const t = new Date(exp).getTime();
  if (!Number.isFinite(t)) return true;
  return t >= Date.now();
}

export function planPriceHeadline(plan) {
  const total = formatPriceJod(plan?.priceJod);
  const checkout =
    plan?.stripeCheckoutAmountJod != null ? formatPriceJod(plan.stripeCheckoutAmountJod) : null;
  if (checkout && total && checkout !== total) {
    return { main: checkout, sub: `الإجمالي ${total}` };
  }
  return { main: total || "—", sub: null };
}

export function planBadgeLabel(plan, featured) {
  if (featured && plan?.isPopular) return "الأكثر شيوعًا";
  if (featured && plan?.isFeatured) return "باقة مميزة";
  if (featured) return "الأكثر شيوعًا";
  return null;
}
