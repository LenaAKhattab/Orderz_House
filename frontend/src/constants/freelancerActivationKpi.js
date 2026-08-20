/** Phase A7.2 — Super Admin Activation KPI labels and display helpers (Arabic). */

export const KPI_UNAVAILABLE_AR = "غير متاح حاليًا";
export const KPI_UNAVAILABLE_SHORT_AR = "غير متاح";
export const KPI_SCHEMA_NOT_READY_AR =
  "قاعدة بيانات محرك التفعيل غير جاهزة بعد. طبّق migrations الخاصة بالمحرك في البيئة المناسبة قبل استخدام هذه اللوحة.";
export const KPI_LOAD_ERROR_AR = "تعذر تحميل مؤشرات محرك التفعيل حاليًا.";
export const KPI_NOTES_TITLE_AR = "ملاحظات حول دقة المؤشرات";
export const KPI_NOTES_INTRO_AR =
  "بعض المؤشرات غير متاحة لأن مصدرها غير مربوط بعد بشكل موثوق.";

export const FUNNEL_CARD_LABELS_AR = Object.freeze({
  trialActivatedUsers: "تم تفعيل التجربة",
  firstBidUsers: "أول تقديم",
  firstAssignmentUsers: "أول إسناد",
  firstAcceptedWorkUsers: "أول عمل مقبول",
  firstPublishedWorkUsers: "أول مقال منشور",
  silverCtaShownUsers: "ظهور دعوة Silver",
  silverPaymentStartedUsers: "بدء طلب الترقية",
  silverPaidUsers: "مشترك Silver",
});

export const FUNNEL_TABLE_STEPS_AR = Object.freeze([
  { key: "registeredUsers", label: "التسجيل" },
  { key: "verifiedUsers", label: "التوثيق" },
  { key: "trainingCompletedUsers", label: "إكمال التدريب" },
  { key: "trialActivatedUsers", label: "تفعيل التجربة" },
  { key: "firstBidUsers", label: "أول تقديم" },
  { key: "firstAssignmentUsers", label: "أول إسناد" },
  { key: "firstAcceptedWorkUsers", label: "أول عمل مقبول" },
  { key: "firstPublishedWorkUsers", label: "أول مقال منشور" },
  { key: "silverCtaShownUsers", label: "ظهور دعوة Silver" },
  { key: "silverPaymentStartedUsers", label: "بدء طلب الترقية" },
  { key: "silverPaidUsers", label: "مشترك Silver" },
]);

export const RATE_CARD_LABELS_AR = Object.freeze({
  trialActivatedToPaidRate: "التجربة → Silver",
  firstAcceptedToPaidRate: "أول قبول → Silver",
  firstPublishedToPaidRate: "أول نشر → Silver",
  ctaShownToPaymentStartedRate: "ظهور الدعوة → بدء الطلب",
  paymentStartedToPaidRate: "بدء الطلب → الدفع/التفعيل",
});

export const TIMING_CARD_LABELS_AR = Object.freeze({
  averageTimeToFirstBid: "متوسط الوقت لأول تقديم",
  averageTimeToFirstWin: "متوسط الوقت لأول إسناد",
  averageTimeToFirstAccepted: "متوسط الوقت لأول قبول",
  averageTimeToFirstPublished: "متوسط الوقت لأول نشر",
});

export const QUALITY_CARD_LABELS_AR = Object.freeze({
  acceptedArticleCount: "مقالات مقبولة",
  rejectedArticleCount: "مقالات مرفوضة",
  revisionRequestedCount: "طلبات تعديل",
  publishedArticleCount: "مقالات منشورة",
  articleAcceptanceRate: "نسبة القبول",
  articleRejectionRate: "نسبة الرفض",
  revisionRate: "نسبة طلب التعديل",
});

export const FINANCIAL_CARD_LABELS_AR = Object.freeze({
  campaignBudgetTotalJod: "ميزانية الحملة",
  campaignBudgetReservedJod: "المحجوز",
  campaignBudgetUsedJod: "المستخدم",
  campaignBudgetRemainingJod: "المتبقي",
  pendingFreelancerEarnedJod: "الرصيد المكتسب قيد المعالجة",
  costPerPaidFreelancer: "التكلفة لكل مشترك مدفوع",
  subscriptionRevenueJod: "إيراد الاشتراكات",
  workInventoryReserveAllocatedJod: "احتياطي مخزون العمل (مخصص)",
  workInventoryReserveActiveJod: "احتياطي مخزون العمل (نشط)",
});

export function formatKpiCount(value) {
  if (value == null) return KPI_UNAVAILABLE_AR;
  const n = Number(value);
  if (!Number.isFinite(n)) return KPI_UNAVAILABLE_AR;
  return String(Math.trunc(n));
}

export function formatKpiRate(value, { shortUnavailable = false } = {}) {
  if (value == null) {
    return shortUnavailable ? KPI_UNAVAILABLE_SHORT_AR : KPI_UNAVAILABLE_AR;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return shortUnavailable ? KPI_UNAVAILABLE_SHORT_AR : KPI_UNAVAILABLE_AR;
  }
  return `${(n * 100).toFixed(1)}%`;
}

export function formatKpiDays(value) {
  if (value == null) return KPI_UNAVAILABLE_AR;
  const n = Number(value);
  if (!Number.isFinite(n)) return KPI_UNAVAILABLE_AR;
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} يوم`;
}

export function formatKpiJod(value) {
  if (value == null) return KPI_UNAVAILABLE_AR;
  const raw = String(value).trim();
  if (!raw) return KPI_UNAVAILABLE_AR;
  return `${raw} JOD`;
}

export function reasonForMetric(unavailableMetrics, key) {
  const list = Array.isArray(unavailableMetrics) ? unavailableMetrics : [];
  const hit = list.find((m) => String(m?.key || "") === key);
  return hit?.reason ? String(hit.reason) : null;
}
