import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { trainingCheckoutStatesFromSnapshot } from "./lib/trainingCheckoutState.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

describe("abandoned checkout recovery — package cards never lock", () => {
  it("open / unverifiable checkouts resume; only provider-confirming attempts show processing", () => {
    assert.deepEqual(trainingCheckoutStatesFromSnapshot(null), {});
    assert.deepEqual(
      trainingCheckoutStatesFromSnapshot({
        checkouts: [
          { packageCode: "basic", state: "open" },
          { packageCode: "pro", state: "unknown" },
          { packageCode: "content_writing_training", state: "processing" },
          { packageCode: "content_writing_training", state: "open" },
        ],
      }),
      { basic: "resume", pro: "resume", content_writing_training: "processing" },
    );
  });

  it("training card: resume is an enabled 'Continue payment' button; the old pending lock is gone", () => {
    const card = read("components/plans/TrainingPlanCard.jsx");
    assert.ok(!card.includes('purchaseState === "pending"'));
    assert.ok(!card.includes('t("plans.training.waiting")'));
    assert.ok(card.includes('purchaseState === "resume"'));
    assert.ok(card.includes('t("plans.training.resumeCta")'));
    assert.ok(card.includes('purchaseState === "processing"'));
    const section = read("components/plans/TrainingPlansSection.jsx");
    assert.ok(section.includes('checkoutStates[code] || "available"'));
    assert.ok(!section.includes("pendingPackageCode"));
  });

  it("AR/EN copy", () => {
    const ar = json("locales/ar/plans.json").training;
    const en = json("locales/en/plans.json").training;
    assert.equal(ar.resumeCta, "متابعة الدفع");
    assert.equal(ar.processing, "جارٍ تأكيد الدفع");
    assert.equal(ar.buyCta, "اشترِ الباقة");
    assert.equal(ar.statusUnavailable, "تعذر التحقق من حالة الدفع حاليًا. حاول مرة أخرى بعد قليل.");
    assert.equal(en.resumeCta, "Continue payment");
    assert.equal(en.processing, "Confirming payment");
    assert.ok(en.statusUnavailable && en.processingNotice && ar.processingNotice);
  });

  it("BFCache restore (browser Back from Stripe) resets busy CTAs and refetches state", () => {
    const restore = read("hooks/usePageRestore.js");
    assert.ok(restore.includes('addEventListener("pageshow"'));
    assert.ok(restore.includes("event.persisted"));
    const training = read("hooks/useTrainingPackageCheckout.js");
    assert.ok(training.includes("usePageRestore("));
    assert.ok(training.includes('setBuyBusyCode("")'));
    assert.ok(training.includes("onVisible: true"));
    const membership = read("hooks/useMarketplaceMembershipCheckout.js");
    assert.ok(membership.includes("usePageRestore("));
    assert.ok(membership.includes("setCheckoutBusyPlanId(null);"));
    assert.ok(membership.includes("setSpecialOfferCheckoutBusy(false);"));
    assert.ok(membership.includes("refreshMembership()"));
    assert.ok(read("hooks/useFreelancerPlansCheckout.js").includes("usePageRestore(() => setCheckoutBusyPlanId(null))"));
    assert.ok(read("pages/Plans.jsx").includes("usePageRestore(() => setSpecialOfferCheckoutBusy(false))"));
  });

  it("success return never marks paid on the client", () => {
    const training = read("hooks/useTrainingPackageCheckout.js");
    assert.ok(!/status:\s*"paid"/.test(training));
    assert.ok(!/setSnapshot\(\{/.test(training));
  });
});
