import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FINANCIAL_CARD_LABELS_AR,
} from "./constants/freelancerActivationKpi.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A8 Work Inventory Reserve admin UI", () => {
  it("admin page renders Work Inventory Reserve section with totals and internal note", () => {
    const page = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(page, /admin-work-inventory-reserve/);
    assert.match(page, /admin-wir-status/);
    assert.match(page, /admin-wir-totals/);
    assert.match(page, /admin-wir-internal-note/);
    assert.match(page, /admin-wir-settings-form/);
    assert.match(page, /getSuperAdminWorkInventoryReserveRequest/);
    assert.match(page, /updateSuperAdminFreelancerActivationSettingsRequest/);
    assert.match(
      page,
      /هذا سجل داخلي لتخصيص جزء من الاشتراكات لتمويل فرص العمل المستقبلية، ولا يمثل رصيدًا قابلًا/,
    );
    assert.match(page, /Total allocated/);
    assert.match(page, /Reserve\{/);
    assert.match(page, /"enabled"/);
    assert.match(page, /"disabled"/);
  });

  it("API helper exposes work-inventory-reserve GET and settings PATCH", () => {
    const api = read("services/api.js");
    assert.match(api, /getSuperAdminWorkInventoryReserveRequest/);
    assert.match(api, /work-inventory-reserve/);
    assert.match(api, /updateSuperAdminFreelancerActivationSettingsRequest/);
    assert.match(api, /patch\("\/super-admin\/freelancer-activation\/settings"/);
  });

  it("KPI financial labels include Work Inventory Reserve fields; A7.2 dashboard still present", () => {
    assert.equal(
      FINANCIAL_CARD_LABELS_AR.workInventoryReserveAllocatedJod,
      "احتياطي مخزون العمل (مخصص)",
    );
    assert.equal(
      FINANCIAL_CARD_LABELS_AR.workInventoryReserveActiveJod,
      "احتياطي مخزون العمل (نشط)",
    );
    const dash = read("components/admin/FreelancerActivationKpiDashboard.jsx");
    assert.match(dash, /activation-kpi-dashboard/);
    assert.match(dash, /activation-kpi-financial-cards/);
    assert.match(dash, /FINANCIAL_CARD_LABELS_AR/);
    const page = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(page, /FreelancerActivationKpiDashboard/);
  });

  it("does not expose Work Inventory Reserve on freelancer surfaces", () => {
    const articles = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.doesNotMatch(articles, /work-inventory-reserve|Work Inventory Reserve|admin-wir/);
    const card = read("components/freelancer/FreelancerSilverConversionCard.jsx");
    assert.doesNotMatch(card, /workInventoryReserve|Work Inventory Reserve|admin-wir/);
    const conversion = read("constants/freelancerActivationConversion.js");
    assert.doesNotMatch(conversion, /workInventoryReserve|work_inventory_reserve/);
    const trialBlock = read("components/freelancer/FreelancerActivationTrialStatusBlock.jsx");
    assert.doesNotMatch(trialBlock, /workInventoryReserve|Work Inventory Reserve/);
  });
});
