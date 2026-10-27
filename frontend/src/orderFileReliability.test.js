import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fileTypeLabel,
  isImageOrderFile,
  isPreviewableOrderFile,
  orderFileErrorKey,
} from "./components/orders/order-details/orderFileUi.js";
import {
  ORDER_UPLOAD_ACCEPT,
  ORDER_UPLOAD_ALLOWED_EXTENSIONS,
  orderUploadRejectionReason,
} from "./utils/orderUploadLimits.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

describe("order file rows (FileList)", () => {
  it("preview only for images/PDF; DOCX/XLSX/ZIP are download-only; images are not labelled PDF", () => {
    assert.equal(isPreviewableOrderFile({ mimeType: "image/jpeg" }), true);
    assert.equal(isPreviewableOrderFile({ mimeType: "application/pdf" }), true);
    assert.equal(
      isPreviewableOrderFile({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      false,
    );
    assert.equal(isPreviewableOrderFile({ originalName: "تصميم.PNG" }), true);
    assert.equal(isPreviewableOrderFile({ originalName: "data.xlsx" }), false);
    assert.equal(isImageOrderFile({ mimeType: "image/png" }), true);
    assert.equal(isImageOrderFile({ mimeType: "application/pdf" }), false);
  });

  it("type label comes from a real extension (no bogus labels for extension-less names)", () => {
    assert.equal(fileTypeLabel("Project brief - المتطلبات.final.pdf"), "PDF");
    assert.equal(fileTypeLabel("report"), "");
    assert.equal(fileTypeLabel("final_v2"), "");
    assert.equal(fileTypeLabel("عقد (نهائي).docx"), "DOCX");
  });

  it("error mapping distinguishes session / forbidden / missing / not found / rate limit / storage / network", () => {
    const err = (status, code) => ({ response: status ? { status } : undefined, fileErrorCode: code });
    assert.deepEqual(orderFileErrorKey(err(401)), { key: "session", missing: false, login: true });
    assert.equal(orderFileErrorKey(err(403)).key, "forbidden");
    assert.deepEqual(orderFileErrorKey(err(404, "FILE_NOT_FOUND")), { key: "missing", missing: true, login: false });
    assert.equal(orderFileErrorKey(err(404)).key, "notFound");
    assert.equal(orderFileErrorKey(err(410)).missing, true);
    assert.equal(orderFileErrorKey(err(429)).key, "rateLimited");
    assert.equal(orderFileErrorKey(err(502, "STORAGE_UNAVAILABLE")).key, "storage");
    assert.equal(orderFileErrorKey(err(503)).key, "storage");
    assert.equal(orderFileErrorKey(err(500)).key, "server");
    assert.equal(orderFileErrorKey(err(0)).key, "network");
  });

  it("FileList: missing state without actions, stable test hooks, no raw server text", () => {
    const fl = read("components/orders/order-details/FileList.jsx");
    assert.ok(fl.includes('data-file-state={unavailable ? "unavailable" : "available"}'));
    assert.ok(fl.includes("const unavailable = f.unavailable === true || missingIds.has(String(f.id));"));
    assert.ok(fl.includes('t("ordersAdmin.orderDetails.files.unavailable")'));
    assert.ok(fl.includes("{previewable ? ("));
    assert.ok(!fl.includes("e?.response?.data?.message"));
  });

  it("AR/EN copy for file states and errors", () => {
    for (const l of ["ar", "en"]) {
      const f = json(`locales/${l}/ordersAdmin.json`).orderDetails.files;
      for (const k of ["session", "forbidden", "missing", "notFound", "rateLimited", "storage", "server", "network", "generic"]) {
        assert.ok(f.errors[k], `${l}.${k}`);
      }
      assert.ok(f.unavailable && f.planLockedHint && f.freelancersOnlyHint);
    }
    assert.equal(json("locales/ar/ordersAdmin.json").orderDetails.files.unavailable, "المرفق الأصلي غير متاح");
  });
});

describe("file picker", () => {
  it("accept list matches the backend allowlist; wrong type / empty files are refused, not silently dropped", () => {
    assert.ok(ORDER_UPLOAD_ALLOWED_EXTENSIONS.includes("docx") && ORDER_UPLOAD_ALLOWED_EXTENSIONS.includes("webp"));
    assert.ok(ORDER_UPLOAD_ACCEPT.includes(".pdf") && !ORDER_UPLOAD_ACCEPT.includes(".svg"));
    assert.equal(orderUploadRejectionReason({ name: "logo.svg", size: 10 }), "type");
    assert.equal(orderUploadRejectionReason({ name: "setup.exe", size: 10 }), "type");
    assert.equal(orderUploadRejectionReason({ name: "empty.pdf", size: 0 }), "empty");
    assert.equal(orderUploadRejectionReason({ name: "عقد.DOCX", size: 10 }), null);
    const picker = read("components/orders/OrderFilesPicker.jsx");
    assert.ok(picker.includes("accept={ORDER_UPLOAD_ACCEPT}"));
    assert.ok(picker.includes('refused.push({ name: f.name, reason: "count" });'));
    assert.ok(picker.includes('data-testid="files-picker-rejected"'));
    for (const l of ["ar", "en"]) {
      const fp = json(`locales/${l}/orders.json`).filesPicker;
      assert.ok(fp.types && fp.rejected.type && fp.rejected.empty && fp.rejected.count, l);
    }
  });
});

describe("delivery / revision workflow UI", () => {
  it("freelancer order page polls on a timer keyed by status (no back-to-back request loop)", () => {
    const page = read("pages/dashboard/FreelancerMyOrderDetailsPage.jsx");
    assert.ok(page.includes("}, [busy, id, orderLoaded, pollStatus, navigate]);"));
    assert.ok(!page.includes("}, [busy, id, order, navigate]);"));
  });

  it("freelancer: optional delivery note, resubmission label, latest revision's attachments only", () => {
    const page = read("pages/dashboard/FreelancerMyOrderDetailsPage.jsx");
    assert.ok(page.includes('fd.append("note", deliveryNote.trim());'));
    assert.ok(page.includes('t("freelancerDashboard.myOrders.details.resubmitDelivery")'));
    assert.ok(page.includes("if (latest) return Array.isArray(latest.files) ? latest.files : [];"));
    for (const l of ["ar", "en"]) {
      const d = json(`locales/${l}/freelancerDashboard.json`).myOrders.details;
      assert.ok(d.deliveryNoteLabel && d.resubmitDelivery && d.resubmitHint && d.deliveryErrorMessage, l);
    }
  });

  it("client card never lets a stale detail hide a new delivery; modal waits for the current history", () => {
    const card = read("components/orders/ClientOrderCardCompact.jsx");
    assert.ok(card.includes("const displayOrder = detailMatchesList ? { ...order, ...detailOrder } : order;"));
    assert.ok(card.includes("}, [shouldLoadSubmissionDetail, expanded, order.id, listFreshness]);"));
    assert.ok(card.includes("historyLoading={deliveryModal.open && needsSubmissionDetail && !detailMatchesList}"));
    const modal = read("components/orders/ClientDeliveryReviewModal.jsx");
    assert.ok(modal.includes("const waitingForHistory = historyLoading && !submissions.length;"));
    assert.ok(modal.includes("!waitingForHistory && order.orderStatus === \"pending_client_review\""));
    assert.ok(modal.includes("currentSubmission?.message"));
  });

  it("admin orders: brief attachments dialog (cards + table) and delivery actions in the table view", () => {
    const page = read("pages/dashboard/AdminOrdersPage.jsx");
    assert.ok(page.includes("data-testid={`admin-order-attachments-${o.id}`}"));
    assert.ok(page.includes('fileAccess="admin"'));
    assert.ok(page.includes("{deliveryButtons(o)}"));
    assert.equal(page.split("revisionSentTitle").length - 1, 0, "single success toast (modal owns it)");
    for (const l of ["ar", "en"]) assert.ok(json(`locales/${l}/ordersAdmin.json`).listPage.attachments.button, l);
  });

  it("admin order creation with files uses the upload timeout (not the 10 s default)", () => {
    const api = read("services/api.js");
    const fn = api.slice(api.indexOf("export const adminCreateInternalOrderRequest"), api.indexOf("export const adminSearchFreelancersRequest"));
    assert.ok(fn.includes("timeout: 120000"));
  });

  it("super admin institution delivery: shows the current files, approve only when pending review, note required", () => {
    const page = read("pages/dashboard/SuperAdminInstitutionWorkDetailPage.jsx");
    assert.ok(page.includes("files={currentDeliveryFiles}"));
    assert.ok(page.includes('const canApproveOrderDelivery = orderStatus === "pending_client_review" && currentDeliveryFiles.length > 0;'));
    assert.ok(page.includes("!revisionNote.trim()"));
    assert.ok(!page.includes("revisionNoteOptional"));
    const modal = read("pages/dashboard/institutions/InstitutionCreateWorkModal.jsx");
    assert.ok(modal.includes('fd.set("workType", "order");'));
  });
});
