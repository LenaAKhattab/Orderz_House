import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientOrderMatchesFilter, getClientOrderNextStep } from "./utils/clientOrderNextStep.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

describe("UI/UX Phase 3 — client next step", () => {
  const delivery = { purpose: "delivery" };
  it("flags only orders the client is blocking", () => {
    assert.equal(getClientOrderNextStep({ orderStatus: "pending_payment", projectType: "fixed", requiresPayment: true }).key, "pay");
    assert.equal(getClientOrderNextStep({ orderStatus: "pending_client_review", hasAssignedFreelancer: true }).attention, true);
    assert.equal(getClientOrderNextStep({ orderStatus: "open_for_bids", bidsCount: 2 }).key, "reviewBids");
    assert.equal(getClientOrderNextStep({ orderStatus: "open_for_bids", bidsCount: 0 }).attention, false);
    assert.equal(getClientOrderNextStep({ orderStatus: "in_progress", hasAssignedFreelancer: true }).key, "inProgress");
    assert.equal(
      getClientOrderNextStep({ orderStatus: "in_progress", hasAssignedFreelancer: true, clientRevisionNote: "x", files: [delivery] }).key,
      "revisionSent",
    );
    assert.equal(getClientOrderNextStep({ orderStatus: "completed", hasAssignedFreelancer: true }).key, "completed");
    assert.equal(getClientOrderNextStep({ orderStatus: "cancelled" }).key, "cancelled");
  });

  it("filters partition the list", () => {
    const o = { orderStatus: "pending_client_review", hasAssignedFreelancer: true };
    assert.ok(clientOrderMatchesFilter(o, "attention"));
    assert.ok(clientOrderMatchesFilter(o, "active"));
    assert.ok(!clientOrderMatchesFilter(o, "done"));
    assert.ok(clientOrderMatchesFilter({ orderStatus: "completed" }, "done"));
  });

  it("every next-step and filter key exists in both locales", () => {
    for (const l of ["ar", "en"]) {
      const ca = json(`locales/${l}/clientArea.json`);
      for (const k of ["pay", "payAfterBid", "adminReview", "reviewDelivery", "revisionSent", "inProgress", "reviewBids", "waitingBids", "published", "completed", "cancelled", "archived", "generic"]) {
        assert.ok(ca.orderCard.next[k], `${l} orderCard.next.${k}`);
      }
      for (const k of ["all", "attention", "active", "open", "done"]) {
        assert.ok(ca.myOrders.filters[k] && ca.myOrders.filterEmpty[k], `${l} myOrders.filters.${k}`);
      }
    }
  });
});

describe("UI/UX Phase 3 — client order surfaces", () => {
  it("revision request uses the shared file picker and sends files", () => {
    const m = read("components/orders/ClientRevisionRequestModal.jsx");
    assert.match(m, /<OrderFilesPicker/);
    assert.match(m, /requestClientOrderRevisionRequest\(orderId, noteText, files\)/);
    assert.match(m, /getSafeApiErrorMessage\(err/);
  });

  it("delivery review: no native file input, approve needs confirmation, revision only after a delivery", () => {
    const m = read("components/orders/ClientDeliveryReviewModal.jsx");
    assert.ok(!/type="file"/.test(m), "native file input removed");
    assert.match(m, /<OrderFilesPicker/);
    assert.match(m, /<ConfirmDialog/);
    assert.match(m, /onClick=\{\(\) => setConfirmOpen\(true\)\}/);
    assert.match(m, /order\.orderStatus === "in_progress" && deliveryFiles\.length > 0/);
    assert.match(m, /<FileList/);
    // A resubmission is reviewed on its own files, not mixed with superseded deliveries.
    assert.match(m, /files=\{reviewFiles\}/);
    assert.match(m, /submissions\.find\(\(s\) => s\?\.isCurrent\)/);
  });

  it("order card: review-delivery only when pending review; revision only when a delivery exists", () => {
    const c = read("components/orders/ClientOrderCardCompact.jsx");
    assert.match(c, /const deliveryWaiting = assignedActive && order\?\.orderStatus === "pending_client_review"/);
    assert.match(c, /const canRequestRevision = assignedActive && \(deliveryWaiting \|\| deliveryFilesCount > 0\)/);
    assert.match(c, /aria-expanded=\{expanded\}/);
  });

  it("create-order wizard uses the shared picker; no raw dropzone input", () => {
    const w = read("components/orders/AdminInternalOrderWizard.jsx");
    assert.match(w, /<OrderFilesPicker files=\{files\} onChange=\{setFiles\}/);
    assert.ok(!/className="dropzone"/.test(w));
    assert.match(w, /co-pay-summary/);
  });

  it("submission timeline follows the UI direction and localizes badges", () => {
    const tl = read("components/orders/submission-history/SubmissionHistoryTimeline.jsx");
    assert.ok(!/dir="rtl"/.test(tl), "no hard-coded RTL");
    assert.match(tl, /dir=\{dir\}/);
    for (const l of ["ar", "en"]) {
      const sh = json(`locales/${l}/ordersAdmin.json`).orderDetails.submissionHistory;
      assert.ok(sh.badge.final && sh.status.revision_requested && sh.requestedBy.client);
    }
  });

  it("notification cards show the category once", () => {
    const n = read("pages/dashboard/NotificationsPage.jsx");
    assert.equal((n.match(/\{category\.label\}/g) || []).length, 1);
  });

  it("client UI never surfaces raw axios messages", () => {
    for (const f of [
      "pages/dashboard/ClientDashboardHome.jsx",
      "pages/dashboard/ClientMyOrdersPage.jsx",
      "pages/dashboard/ClientSettingsPage.jsx",
      "pages/dashboard/ClientProfilePage.jsx",
      "components/orders/ClientBiddingOffersModal.jsx",
      "components/orders/ClientDeliveryReviewModal.jsx",
      "components/orders/ClientRevisionRequestModal.jsx",
    ]) {
      assert.ok(!/\|\| e(rr)?\?\.message/.test(read(f)), f);
    }
  });

  it("body direction follows <html dir> (English is LTR; Arabic unchanged)", () => {
    for (const f of ["index.css", "styles/legacy-application.css"]) {
      const css = read(f);
      const body = css.slice(css.search(/(^|\n)\s*body \{/), css.search(/(^|\n)\s*body \{/) + 400);
      assert.ok(!/direction: rtl/.test(body.split("}")[0]), `${f}: body must not hard-code rtl`);
      assert.match(body.split("}")[0], /text-align: start/);
    }
  });

  it("register validation centres the invalid field (header never covers it in LTR)", () => {
    const r = read("pages/Register.jsx");
    assert.match(r, /el\.focus\(\{ preventScroll: true \}\);\s*el\.scrollIntoView\(\{ block: "center" \}\);/);
  });

  it("finance rows become labelled cards on phones (pay-now reachable)", () => {
    const page = read("pages/dashboard/ClientFinancialPage.jsx");
    assert.match(page, /data-label=\{t\(`\$\{c\}\.colPaymentStatus`\)\}/);
    assert.match(read("pages/dashboard/clientFinancial.css"), /td\[data-label\]::before/);
    for (const l of ["ar", "en"]) assert.ok(json(`locales/${l}/finance.json`).client.paymentStatus.pending);
  });

  it("dashboard: create order is the hero primary action; attention uses the shared rule", () => {
    const h = read("pages/dashboard/ClientDashboardHome.jsx");
    assert.match(h, /primaryCta=\{\{\s*to: "\/dashboard\/client\/orders\/create"/);
    assert.match(h, /getClientOrderNextStep\(order\)/);
    assert.match(h, /my-orders\?orderId=/);
  });
});
