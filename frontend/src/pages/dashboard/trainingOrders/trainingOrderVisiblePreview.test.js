import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));

describe("training orders visible preview UX", () => {
  it("renders applicants button with count and opens modal component", () => {
    const previewSrc = readFileSync(join(here, "TrainingOrdersVisiblePreview.jsx"), "utf8");
    assert.match(previewSrc, /applicantsButton/);
    assert.match(previewSrc, /openApplicantsModal/);
    assert.match(previewSrc, /TrainingOrderApplicantsModal/);
    assert.match(previewSrc, /adminListTrainingApplicationsByFakeOrderRequest/);
    assert.doesNotMatch(previewSrc, /training-orders\/applications/);
  });

  it("uses aligned visible-until and applicants column classes", () => {
    const previewSrc = readFileSync(join(here, "TrainingOrdersVisiblePreview.jsx"), "utf8");
    const cssSrc = readFileSync(join(here, "trainingOrdersAdmin.css"), "utf8");
    const enLocale = readFileSync(join(here, "../../../locales/en/trainingOrders.json"), "utf8");
    assert.match(previewSrc, /oh-visible-col-visible-until/);
    assert.match(previewSrc, /oh-visible-col-applicants/);
    assert.match(previewSrc, /visiblePreview\.sortHint/);
    assert.doesNotMatch(previewSrc, /\.sort\(/);
    assert.match(enLocale, /"sortHint": "Sorted by applicants count, highest first\."/);
    assert.match(cssSrc, /\.oh-visible-col-visible-until[\s\S]*text-align: center/);
    assert.match(cssSrc, /\.oh-visible-col-applicants[\s\S]*text-align: center/);
  });

  it("hides Applicants tab from main training orders shell", () => {
    const shellSrc = readFileSync(join(here, "TrainingOrdersAdminShell.jsx"), "utf8");
    assert.doesNotMatch(shellSrc, /training-orders\/applications/);
    assert.match(shellSrc, /training-orders\/settings/);
  });

  it("modal uses localized visible preview strings and pagination wiring", () => {
    const modalSrc = readFileSync(join(here, "TrainingOrderApplicantsModal.jsx"), "utf8");
    const previewSrc = readFileSync(join(here, "TrainingOrdersVisiblePreview.jsx"), "utf8");
    const enLocale = readFileSync(join(here, "../../../locales/en/trainingOrders.json"), "utf8");
    assert.match(modalSrc, /trainingOrders\.overview\.visiblePreview\.applicantsModalTitle/);
    assert.match(modalSrc, /trainingOrders\.overview\.visiblePreview\.applicantsEmpty/);
    assert.match(modalSrc, /oh-training-applicants-modal__pagination/);
    assert.match(previewSrc, /APPLICANTS_MODAL_PAGE_SIZE/);
    assert.match(previewSrc, /limit: APPLICANTS_MODAL_PAGE_SIZE/);
    assert.match(enLocale, /"applicantsModalTitle": "Applicants for this order"/);
    assert.match(enLocale, /"applicantsEmpty": "No applicants for this order yet\."/);
  });

  it("round history table uses fixed column alignment classes", () => {
    const roundsSrc = readFileSync(join(here, "TrainingOrderRoundsSection.jsx"), "utf8");
    const cssSrc = readFileSync(join(here, "trainingOrdersAdmin.css"), "utf8");
    assert.match(roundsSrc, /oh-round-history-table/);
    assert.match(roundsSrc, /oh-round-col-period/);
    assert.match(roundsSrc, /oh-period-cell/);
    assert.match(cssSrc, /\.oh-round-history-table[\s\S]*table-layout: fixed/);
    assert.match(cssSrc, /\.oh-round-col-period[\s\S]*width: 13\.75rem/);
  });
});
