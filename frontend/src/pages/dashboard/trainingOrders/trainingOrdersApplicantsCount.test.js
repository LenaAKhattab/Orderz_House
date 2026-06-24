import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveApplicantsTotal, resolveRowApplicantsCount } from "./trainingOrdersApplicantsCountUtils.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("resolveRowApplicantsCount", () => {
  it("returns applicantsCount when set", () => {
    assert.equal(resolveRowApplicantsCount({ id: "1851", applicantsCount: 3 }), 3);
  });

  it("returns 0 when applicantsCount is missing", () => {
    assert.equal(resolveRowApplicantsCount({ id: "1851" }), 0);
  });

  it("does not fall back to order id", () => {
    assert.equal(resolveRowApplicantsCount({ id: "1851", applicantsCount: undefined }), 0);
    assert.equal(resolveRowApplicantsCount({ id: "1851", applicantsCount: null }), 0);
  });

  it("returns 0 for zero applicants", () => {
    assert.equal(resolveRowApplicantsCount({ id: "1851", applicantsCount: 0 }), 0);
  });
});

describe("resolveApplicantsTotal", () => {
  it("uses applicantsTotal when provided, including zero", () => {
    assert.equal(resolveApplicantsTotal({ applicantsTotal: 0, fakeOrderId: "1851" }), 0);
    assert.equal(resolveApplicantsTotal({ applicantsTotal: 2, fakeOrderId: "1851" }), 2);
  });

  it("falls back to applicants array length with nullish coalescing", () => {
    assert.equal(resolveApplicantsTotal({ applicants: [], fakeOrderId: "1851" }), 0);
    assert.equal(resolveApplicantsTotal({ applications: [{ id: "1" }], fakeOrderId: "1851" }), 1);
  });

  it("does not use fakeOrderId as count", () => {
    assert.equal(resolveApplicantsTotal({ fakeOrderId: "1851" }), 0);
  });
});

describe("applicants modal display wiring", () => {
  it("does not render fake order id and uses applicantsTotal safely", () => {
    const modalSrc = readFileSync(join(here, "TrainingOrderApplicantsModal.jsx"), "utf8");
    const enLocale = readFileSync(join(here, "../../../locales/en/trainingOrders.json"), "utf8");
    const arLocale = readFileSync(join(here, "../../../locales/ar/trainingOrders.json"), "utf8");

    assert.doesNotMatch(modalSrc, /oh-training-applicants-modal__order-id/);
    assert.doesNotMatch(modalSrc, /fakeOrderId/);
    assert.doesNotMatch(modalSrc, /modalColMessage/);
    assert.doesNotMatch(modalSrc, /proposalMessage/);
    assert.match(modalSrc, /applicantsTotal \?\? applicants\?\.length \?\? 0/);
    assert.match(modalSrc, /oh-app-modal-col-index/);
    assert.match(modalSrc, /onPageChange/);
    assert.match(modalSrc, /visiblePreview\.modalColSubmittedAt/);
    assert.match(enLocale, /"modalColSubmittedAt": "Submission date & time"/);
    assert.match(arLocale, /"modalColSubmittedAt": "تاريخ ووقت التقديم"/);
  });
});
