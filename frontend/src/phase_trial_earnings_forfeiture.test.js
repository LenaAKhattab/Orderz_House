import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EARNED_BALANCE_LOCKED_CTA_AR,
  EARNED_BALANCE_LOCKED_HEADLINE_AR,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
  earnedBalanceStatusLabel,
  resolveEarnedBalanceLockCopy,
} from "./constants/freelancerActivationEarnedBalance.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Trial pending earnings lock + forfeiture UI", () => {
  it("earned balance panel shows lock copy, CTA, and forfeited state", () => {
    const panel = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.match(panel, /earned-balance-lock-headline/);
    assert.match(panel, /earned-balance-lock-detail/);
    assert.match(panel, /earned-balance-kyc-block/);
    assert.match(panel, /earned-balance-silver-cta/);
    assert.match(panel, /earned-balance-forfeited/);
    assert.match(panel, /معلّق غير قابل للسحب/);
    assert.match(panel, /EARNED_BALANCE_LOCKED_CTA_AR/);
    assert.match(panel, /data-lock-state/);
    assert.match(panel, /entry\.locked/);
    assert.match(panel, /earnedBalanceStatusLabel/);
    assert.match(panel, /data-entry-status/);
  });

  it("lock copy helpers cover grace and forfeited states", () => {
    assert.equal(EARNED_BALANCE_LOCKED_CTA_AR, "اشترك لتفعيل السحب");
    assert.match(EARNED_BALANCE_LOCKED_HEADLINE_AR, /غير قابلة للسحب/);
    assert.equal(earnedBalanceStatusLabel("pending_locked", { isEn: false }), "معلّق · غير قابل للسحب");
    assert.equal(earnedBalanceStatusLabel("forfeited", { isEn: false }), "مغلق");
    assert.equal(
      earnedBalanceStatusLabel("awaiting_account_approval", { isEn: false }),
      "مُفعّل · بانتظار اعتماد الحساب",
    );

    const grace = resolveEarnedBalanceLockCopy(
      {
        messages: {
          ar: { headline: "متبقي 12 يوم لتفعيل السحب قبل إغلاق الرصيد." },
        },
      },
      { isEn: false },
    );
    assert.match(grace, /متبقي 12 يوم/);

    const closed = resolveEarnedBalanceLockCopy(
      {
        messages: {
          ar: { headline: "انتهت مهلة تفعيل الأرباح." },
        },
      },
      { isEn: false },
    );
    assert.match(closed, /انتهت مهلة/);
  });

  it("terms v2 snapshot includes lock + forfeiture acceptance", () => {
    assert.match(MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR, /غير قابل للسحب/);
    assert.match(MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR, /المهلة/);
    assert.match(MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR, /يُغلق الرصيد المعلّق/);
  });

  it("super admin summary labels forfeited company-retained totals", () => {
    const admin = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(admin, /أرباح معلّقة/);
    assert.match(admin, /فُعّلت بعد الاشتراك/);
    assert.match(admin, /أُغلقت بعد انتهاء المهلة/);
    assert.match(admin, /totalCompanyRetainedJod/);
  });
});
