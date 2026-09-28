const DURATION_LABELS = {
  1: "شهر واحد",
  2: "شهران",
  3: "3 أشهر",
  4: "4 أشهر",
  6: "6 أشهر",
  12: "12 شهرًا",
};

export function durationMonthsLabel(months) {
  const n = Number(months);
  if (!Number.isInteger(n) || n < 1) return null;
  if (DURATION_LABELS[n]) return DURATION_LABELS[n];
  if (n >= 3 && n <= 10) return `${n} أشهر`;
  return `${n} شهرًا`;
}

export function membershipScheduleView(subscription, copy = null) {
  if (!subscription) {
    return { awaitingFirstOrder: false, durationLabel: null };
  }
  const approved = String(subscription.activationStatus || "") === "company_approved";
  const notStarted = String(subscription.status || "") === "assigned_not_started";
  const awaitingFirstOrder =
    approved &&
    notStarted &&
    subscription.hasFirstOrder !== true &&
    !subscription.actualStartDate &&
    !subscription.expiryDate;

  const months = subscription.entitlementDurationMonths;
  return {
    awaitingFirstOrder,
    statusLabel: awaitingFirstOrder ? copy?.waiting || "بانتظار أول طلب" : null,
    durationLabel: copy?.duration ? copy.duration(months) : durationMonthsLabel(months),
    startLabel: awaitingFirstOrder ? copy?.starts || "تبدأ عند أول طلب" : null,
    expiryLabel: awaitingFirstOrder ? copy?.expiry || "يُحسب بعد بدء الاشتراك" : null,
  };
}
