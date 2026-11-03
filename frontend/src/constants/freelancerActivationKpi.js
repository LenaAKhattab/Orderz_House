/**
 * Phase A7.2 — Super Admin Activation KPI labels and display helpers.
 * `*_AR` exports are the Arabic catalog copy (platformConstants.freelancerActivationKpi); the formatters take an
 * optional `locale` (default: Arabic, or the active de / nl / ro UI locale — unchanged for Arabic / English).
 */
import { ct, ctAr } from "./constantsI18n.js";

const KPI = "freelancerActivationKpi";

export const KPI_UNAVAILABLE_AR = ctAr(`${KPI}.unavailable`);
export const KPI_UNAVAILABLE_SHORT_AR = ctAr(`${KPI}.unavailableShort`);
export const KPI_SCHEMA_NOT_READY_AR = ctAr(`${KPI}.schemaNotReady`);
export const KPI_LOAD_ERROR_AR = ctAr(`${KPI}.loadError`);
export const KPI_NOTES_TITLE_AR = ctAr(`${KPI}.notesTitle`);
export const KPI_NOTES_INTRO_AR = ctAr(`${KPI}.notesIntro`);

function arabicLabels(group, keys) {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, ctAr(`${KPI}.${group}.${key}`)])));
}

export const FUNNEL_CARD_LABELS_AR = arabicLabels("funnel", [
  "trialActivatedUsers",
  "firstBidUsers",
  "firstAssignmentUsers",
  "firstAcceptedWorkUsers",
  "firstPublishedWorkUsers",
  "silverCtaShownUsers",
  "silverPaymentStartedUsers",
  "silverPaidUsers",
]);

export const FUNNEL_TABLE_STEPS_AR = Object.freeze(
  [
    "registeredUsers",
    "verifiedUsers",
    "trainingCompletedUsers",
    "trialActivatedUsers",
    "firstBidUsers",
    "firstAssignmentUsers",
    "firstAcceptedWorkUsers",
    "firstPublishedWorkUsers",
    "silverCtaShownUsers",
    "silverPaymentStartedUsers",
    "silverPaidUsers",
  ].map((key) => ({ key, label: ctAr(`${KPI}.funnelSteps.${key}`) })),
);

export const RATE_CARD_LABELS_AR = arabicLabels("rates", [
  "trialActivatedToPaidRate",
  "firstAcceptedToPaidRate",
  "firstPublishedToPaidRate",
  "ctaShownToPaymentStartedRate",
  "paymentStartedToPaidRate",
]);

export const TIMING_CARD_LABELS_AR = arabicLabels("timing", [
  "averageTimeToFirstBid",
  "averageTimeToFirstWin",
  "averageTimeToFirstAccepted",
  "averageTimeToFirstPublished",
]);

export const QUALITY_CARD_LABELS_AR = arabicLabels("quality", [
  "acceptedArticleCount",
  "rejectedArticleCount",
  "revisionRequestedCount",
  "publishedArticleCount",
  "articleAcceptanceRate",
  "articleRejectionRate",
  "revisionRate",
]);

export const FINANCIAL_CARD_LABELS_AR = arabicLabels("financial", [
  "campaignBudgetTotalJod",
  "campaignBudgetReservedJod",
  "campaignBudgetUsedJod",
  "campaignBudgetRemainingJod",
  "pendingFreelancerEarnedJod",
  "costPerPaidFreelancer",
  "subscriptionRevenueJod",
  "workInventoryReserveAllocatedJod",
  "workInventoryReserveActiveJod",
]);

/** KPI label for a UI locale: group = funnel | funnelSteps | rates | timing | quality | financial. */
export function kpiLabel(group, key, locale) {
  return ct(`${KPI}.${group}.${key}`, undefined, locale);
}

function unavailable(locale, short = false) {
  return ct(`${KPI}.${short ? "unavailableShort" : "unavailable"}`, undefined, locale);
}

export function formatKpiCount(value, locale) {
  if (value == null) return unavailable(locale);
  const n = Number(value);
  if (!Number.isFinite(n)) return unavailable(locale);
  return String(Math.trunc(n));
}

export function formatKpiRate(value, { shortUnavailable = false, locale } = {}) {
  if (value == null) {
    return unavailable(locale, shortUnavailable);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return unavailable(locale, shortUnavailable);
  }
  return `${(n * 100).toFixed(1)}%`;
}

export function formatKpiDays(value, locale) {
  if (value == null) return unavailable(locale);
  const n = Number(value);
  if (!Number.isFinite(n)) return unavailable(locale);
  const rounded = Math.round(n * 10) / 10;
  return ct(`${KPI}.daysUnit`, { value: rounded }, locale);
}

export function formatKpiJod(value, locale) {
  if (value == null) return unavailable(locale);
  const raw = String(value).trim();
  if (!raw) return unavailable(locale);
  return `${raw} JOD`;
}

export function reasonForMetric(unavailableMetrics, key) {
  const list = Array.isArray(unavailableMetrics) ? unavailableMetrics : [];
  const hit = list.find((m) => String(m?.key || "") === key);
  return hit?.reason ? String(hit.reason) : null;
}
