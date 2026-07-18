/**
 * Institutional storage UI wiring tests (Node test runner conventions).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// institutionalStorage → dashboard → pages → src → frontend root
const root = path.join(__dirname, "../../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("institutional storage frontend wiring", () => {
  it("institution detail supports search/add/remove with confirm dialog", () => {
    const src = read("src/pages/dashboard/SuperAdminInstitutionDetailPage.jsx");
    assert.match(src, /adminSearchUsersForInstitutionRequest/);
    assert.match(src, /adminAddInstitutionMemberRequest/);
    assert.match(src, /adminRemoveInstitutionMemberRequest/);
    assert.match(src, /ConfirmDialog/);
    assert.match(src, /confirmRemoveTitle/);
    assert.match(src, /DUPLICATE_MEMBERSHIP|memberAdded|getSafeApiErrorMessage/);
  });

  it("storage list uses DashboardTable, filters, summary, and AbortController", () => {
    const src = read("src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageListPage.jsx");
    assert.match(src, /DashboardTable/);
    assert.match(src, /dash-ui-table|DashboardTable/);
    assert.doesNotMatch(src, /className="table-wrap"/);
    assert.doesNotMatch(src, /className="table"/);
    assert.match(src, /AbortController/);
    assert.match(src, /debouncedQ/);
    assert.match(src, /summaryTitle|metricTotal/);
    assert.match(src, /oh-ios-mobile-cards/);
    assert.match(src, /Pagination/);
    assert.match(src, /creationSummary/);
    assert.match(src, /NO_INSTITUTIONS_SELECTED|errorNoInstitutions/);
    assert.match(src, /timeoutError|isAxiosTimeoutError/);
    assert.doesNotMatch(src, /approvedAllocatedJod|metricTotalAllocated|\.allocated/);
  });

  it("storage detail has lifecycle, unscheduled, schedule edit, scheduler warnings", () => {
    const src = read("src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageDetailPage.jsx");
    assert.match(src, /adminTransitionInstitutionalStorageStatusRequest/);
    assert.match(src, /confirmActivateTitle|confirmPauseTitle/);
    assert.match(src, /unscheduledSection/);
    assert.match(src, /adminMoveInstitutionalOrderToBatchRequest/);
    assert.match(src, /RELEASED|PROCESSING|immutable/);
    assert.match(src, /schedulerHealth\.warnings/);
    assert.match(src, /overdueBatchCount/);
    assert.match(src, /dash-ui-table/);
    assert.match(src, /oh-ios-detail/);
    assert.match(src, /role="tablist"/);
    assert.match(src, /institutionalOrderStorage\.tab_\$\{key\}|tab_\$\{key\}/);
    assert.doesNotMatch(src, /confirmComplete|action_completed/);
  });

  it("storage detail CSS separates tabs and KPI cards", () => {
    const css = read("src/pages/dashboard/institutionalStorage/institutionalStorageDetail.css");
    assert.match(css, /\.oh-ios-detail__tabs/);
    assert.match(css, /\.oh-ios-detail__tab--active/);
    assert.match(css, /\.oh-ios-detail__kpi-grid/);
    assert.match(css, /flex-wrap/);
  });

  it("storage detail opens institutional create order in a modal overlay", () => {
    const page = read("src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageDetailPage.jsx");
    const modal = read("src/pages/dashboard/institutionalStorage/InstitutionalCreateOrderModal.jsx");
    assert.match(page, /InstitutionalCreateOrderModal/);
    assert.doesNotMatch(page, /AdminInternalOrderWizard/);
    assert.match(modal, /client-order-modal-overlay/);
    assert.match(modal, /mode=\"institutional\"/);
    assert.match(modal, /discardCreateTitle|ConfirmDialog/);
    assert.match(modal, /createPortal/);
    assert.match(modal, /document\.body\.style\.overflow/);
  });

  it("storage detail hides technical identifiers from visible UI", () => {
    const src = read("src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageDetailPage.jsx");
    assert.match(src, /storageDisplayName|looksTechnicalLabel/);
    assert.match(src, /liveOrderStatusLabel|releaseStatusLabel/);
    assert.doesNotMatch(src, /storageIdLabel\}:\s*\{storage\.id\}/);
    assert.doesNotMatch(src, /InfoRow label=\{t\("dashboard\.institutionalOrderStorage\.storageIdLabel"\)\}/);
    assert.doesNotMatch(src, /\{o\.releasedOrderId/);
    assert.doesNotMatch(src, /#\{bo\.storedOrderId\}/);
  });

  it("pending approvals page lists orders with correct empty text and back label", () => {
    const pending = read("src/pages/dashboard/institutionalStorage/InstitutionalPendingApprovalsPage.jsx");
    assert.match(pending, /adminApproveInstitutionalOrderRequest/);
    assert.match(pending, /pendingEmpty/);
    assert.doesNotMatch(pending, /institutionalOrderStorage\.empty["']/);
    assert.doesNotMatch(pending, /t\("dashboard\.institutionalOrderStorage\.empty"\)/);
    assert.match(pending, /backToStorageList/);
    assert.match(pending, /DashboardTable/);
    assert.match(pending, /ConfirmDialog/);
    assert.match(pending, /approveBudgetPreview|remainingAfterApproval/);
    assert.match(pending, /FINANCIAL_LIMIT_EXCEEDED|financialLimitExceeded/);
    const detail = read("src/pages/dashboard/institutionalStorage/InstitutionalOrderStorageDetailPage.jsx");
    assert.match(detail, /confirmArchiveAfterRelease|confirmArchiveBeforeRelease/);
  });

  it("institution pool page handles unauthorized, loading, empty, error", () => {
    const src = read("src/pages/dashboard/InstitutionOrdersPoolPage.jsx");
    assert.match(src, /getInstitutionMembershipRequest/);
    assert.match(src, /getInstitutionPoolOrdersRequest/);
    assert.match(src, /forbidden/);
    assert.match(src, /DashboardEmptyState/);
    assert.match(src, /DashboardLoadingState/);
    assert.match(src, /retry/);
  });

  it("admin internal orders show institutional badge", () => {
    const src = read("src/pages/dashboard/AdminOrdersPage.jsx");
    assert.match(src, /طلب مؤسسي/);
    assert.match(src, /isInstitutionalOrder|visibilityScope === "institution"/);
  });

  it("institutional wizard assignment is informational only", () => {
    const src = read("src/components/orders/AdminInternalOrderWizard.jsx");
    assert.match(src, /isInstitutionalMode/);
    assert.match(src, /بعد موافقة المدير الأعلى وإطلاق الطلب/);
    assert.match(src, /!isClientAudience && !isFakePoolMode && !isInstitutionalMode/);
  });

  it("freelancer nav gates institution pool behind membership", () => {
    const nav = read("src/constants/freelancerNav.js");
    const layout = read("src/layouts/FreelancerDashboardLayout.jsx");
    assert.match(nav, /requiresInstitutionMembership/);
    assert.match(layout, /getInstitutionMembershipRequest/);
    assert.match(layout, /requiresInstitutionMembership/);
  });

  it("locales include pending empty and summary metric keys", () => {
    const ar = read("src/locales/ar/dashboard.json");
    const en = read("src/locales/en/dashboard.json");
    assert.match(ar, /"pendingEmpty"/);
    assert.match(ar, /"backToStorageList"/);
    assert.match(ar, /"metricOverdueBatches"/);
    assert.match(en, /"pendingEmpty"/);
    assert.match(en, /"backToStorageList"/);
  });
});
