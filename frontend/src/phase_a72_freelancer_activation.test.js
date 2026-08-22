import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KPI_SCHEMA_NOT_READY_AR,
  KPI_LOAD_ERROR_AR,
  KPI_UNAVAILABLE_AR,
  KPI_UNAVAILABLE_SHORT_AR,
  formatKpiCount,
  formatKpiRate,
  formatKpiDays,
  formatKpiJod,
  FUNNEL_CARD_LABELS_AR,
} from "./constants/freelancerActivationKpi.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A7.2 Super Admin KPI dashboard UI", () => {
  it("KPI dashboard renders filters, funnel, rates, timing, quality, financial, notes", () => {
    const dash = read("components/admin/FreelancerActivationKpiDashboard.jsx");
    assert.match(dash, /activation-kpi-dashboard/);
    assert.match(dash, /activation-kpi-filters/);
    assert.match(dash, /kpi-filter-campaign/);
    assert.match(dash, /kpi-filter-wave/);
    assert.match(dash, /kpi-filter-date-from/);
    assert.match(dash, /kpi-filter-date-to/);
    assert.match(dash, /kpi-refresh-button/);
    assert.match(dash, /activation-kpi-funnel-cards/);
    assert.match(dash, /activation-kpi-funnel-table/);
    assert.match(dash, /activation-kpi-rate-cards/);
    assert.match(dash, /activation-kpi-timing-cards/);
    assert.match(dash, /activation-kpi-quality-cards/);
    assert.match(dash, /activation-kpi-financial-cards/);
    assert.match(dash, /activation-kpi-notes/);
    assert.match(dash, /FUNNEL_CARD_LABELS_AR/);
    assert.equal(FUNNEL_CARD_LABELS_AR.trialActivatedUsers, "تم تفعيل التجربة");
    assert.equal(FUNNEL_CARD_LABELS_AR.silverPaidUsers, "مشترك Silver");

    const page = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(page, /FreelancerActivationKpiDashboard/);
    assert.match(page, /مؤشرات التفعيل/);
  });

  it("loading, error, and schemaReady false states render safe Arabic copy", () => {
    const dash = read("components/admin/FreelancerActivationKpiDashboard.jsx");
    assert.match(dash, /activation-kpi-loading/);
    assert.match(dash, /activation-kpi-error/);
    assert.match(dash, /activation-kpi-schema-not-ready/);
    assert.match(dash, /KPI_LOAD_ERROR_AR/);
    assert.match(dash, /KPI_SCHEMA_NOT_READY_AR/);
    assert.equal(KPI_LOAD_ERROR_AR, "تعذر تحميل مؤشرات محرك التفعيل حاليًا.");
    assert.match(KPI_SCHEMA_NOT_READY_AR, /قاعدة بيانات محرك التفعيل غير جاهزة بعد/);
  });

  it("unavailable metrics render غير متاح حاليًا and rates use غير متاح when null", () => {
    assert.equal(formatKpiCount(null), KPI_UNAVAILABLE_AR);
    assert.equal(formatKpiRate(null), KPI_UNAVAILABLE_AR);
    assert.equal(formatKpiRate(null, { shortUnavailable: true }), KPI_UNAVAILABLE_SHORT_AR);
    assert.equal(formatKpiRate(0), "0.0%");
    assert.equal(formatKpiRate(0.5), "50.0%");
    assert.equal(formatKpiDays(null), KPI_UNAVAILABLE_AR);
    assert.equal(formatKpiDays(2.4), "2.4 يوم");
    const dash = read("components/admin/FreelancerActivationKpiDashboard.jsx");
    assert.match(dash, /KPI_UNAVAILABLE_AR/);
    assert.match(dash, /formatKpiRate\(value, \{ shortUnavailable: true \}\)/);
  });

  it("campaign, wave, and date filters call KPI API with params", () => {
    const dash = read("components/admin/FreelancerActivationKpiDashboard.jsx");
    assert.match(dash, /getSuperAdminFreelancerActivationKpisRequest/);
    assert.match(dash, /params\.campaignId = campaignId/);
    assert.match(dash, /params\.waveId = waveId/);
    assert.match(dash, /params\.dateFrom = dateFrom/);
    assert.match(dash, /params\.dateTo = dateTo/);
    const api = read("services/api.js");
    assert.match(api, /\/super-admin\/freelancer-activation\/kpis/);
    assert.match(api, /getSuperAdminFreelancerActivationKpisRequest/);
  });

  it("financial cards render JOD and dashboard exposes no PII", () => {
    assert.equal(formatKpiJod("19.000"), "19.000 JOD");
    assert.equal(formatKpiJod(null), KPI_UNAVAILABLE_AR);
    const dash = read("components/admin/FreelancerActivationKpiDashboard.jsx");
    assert.match(dash, /formatKpiJod/);
    assert.match(dash, /kpi-financial-card-\$\{key\}/);
    assert.match(dash, /FINANCIAL_CARD_LABELS_AR/);
    assert.doesNotMatch(dash, /\bemail\b|\bphone\b|\bpassword\b|ledger.?row|raw.?ledger/i);
    assert.doesNotMatch(dash, /freelancer_user_id|beneficiary_user_id/);
    const labels = read("constants/freelancerActivationKpi.js");
    assert.match(labels, /campaignBudgetTotalJod/);
    assert.match(labels, /pendingFreelancerEarnedJod/);
    assert.match(labels, /subscriptionRevenueJod/);
  });
});
