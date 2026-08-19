/**
 * Phase 0B — Freelancer Articles Bildazo author gate UI contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BILDAZO_AUTHOR_LINK_FLOWS,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  hasExistingAccountIdentifier,
  isBildazoAuthorLinked,
  shouldBlockArticleApply,
  validateBildazoAuthorLinkForm,
} from "./constants/bildazoAuthorTerms.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Bildazo author terms helpers", () => {
  it("new-account submit validates required fields and terms", () => {
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أحمد" },
        termsChecked: false,
      }),
      "يجب الموافقة على شروط ربط حساب الكاتب.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أ" },
        termsChecked: true,
      }),
      "الاسم الكامل مطلوب لإنشاء حساب الكاتب.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أحمد علي" },
        termsChecked: true,
      }),
      null,
    );
  });

  it("existing-account tab requires one identifier", () => {
    assert.equal(hasExistingAccountIdentifier({}), false);
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT,
        payload: {},
        termsChecked: true,
      }),
      "أدخل بريد حساب Bildazo أو الرقم العام أو رابط الملف الشخصي.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT,
        payload: { existingBildazoPublicId: "w-1" },
        termsChecked: true,
      }),
      null,
    );
  });

  it("blocks apply only when gate enabled and unlinked", () => {
    assert.equal(shouldBlockArticleApply({ gateEnabled: false, status: "not_started" }), false);
    assert.equal(shouldBlockArticleApply({ gateEnabled: true, status: "pending_new_account" }), true);
    assert.equal(isBildazoAuthorLinked({ status: "linked" }), true);
    assert.equal(shouldBlockArticleApply({ gateEnabled: true, status: "linked" }), false);
  });
});

describe("Freelancer Articles Bildazo gate UI", () => {
  it("sidebar contains separate المقالات entry", () => {
    const nav = read("constants/freelancerNav.js");
    assert.match(nav, /\/dashboard\/freelancer\/articles/);
    assert.match(nav, /dashboard\.nav\.freelancer\.articles/);
  });

  it("does not reintroduce a dedicated Freelancer Pantry page", () => {
    const pantry = read("pages/dashboard/FreelancerPantryPage.jsx");
    assert.match(pantry, /Navigate to="\/dashboard\/freelancer\/orders"/);
  });

  it("Articles page shows Bildazo gate for unlinked freelancer", () => {
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(list, /FreelancerBildazoAuthorGateCard/);
    assert.match(list, /getFreelancerBildazoAuthorLinkRequest/);
  });

  it("new-account tab shows verified OrderzHouse email as read-only", () => {
    const card = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.match(card, /البريد الموثق في OrderzHouse/);
    assert.match(card, /readOnly/);
    assert.match(card, /data-testid="bildazo-orderz-email"/);
    assert.match(card, /لن تحتاج/);
    assert.match(card, /إرسال طلب إنشاء حساب Bildazo/);
  });

  it("existing-account tab does not ask for password", () => {
    const card = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.doesNotMatch(card, /type=["']password["']/);
    assert.doesNotMatch(card, /passwordHash/);
    assert.doesNotMatch(card, /BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET/);
    assert.match(card, /لدي حساب في Bildazo/);
    assert.match(card, /إرسال طلب ربط حساب Bildazo/);
  });

  it("pending, review, failed, and linked states render", () => {
    const card = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.match(card, /تم حفظ طلب إنشاء حساب الكاتب في Bildazo/);
    assert.match(card, /تم حفظ طلب ربط حساب Bildazo/);
    assert.match(card, /يحتاج طلب الربط إلى مراجعة من الإدارة/);
    assert.match(card, /تعذر إكمال الربط مع Bildazo\. يمكنك إعادة إرسال الطلب لاحقًا/);
    assert.match(card, /حساب الكاتب مرتبط/);
    assert.match(card, /bildazo-pending-state/);
    assert.match(card, /bildazo-review-state/);
    assert.match(card, /bildazo-failed-state/);
    assert.match(card, /data-testid="bildazo-linked-profile"/);
    assert.doesNotMatch(card, /تم إنشاء الحساب/);
    assert.doesNotMatch(card, /تم الربط\./);
  });

  it("null profileUrl does not render a broken anchor; publicId is shown when linked", () => {
    const card = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.match(card, /link\?\.linked\?\.bildazoPublicId \?/);
    assert.match(card, /link\?\.linked\?\.bildazoProfileUrl \?/);
    assert.match(card, /data-testid="bildazo-public-id"/);
    assert.match(card, /data-testid="bildazo-profile-url"/);
    assert.doesNotMatch(card, /href=\{link\?\.linked\?\.bildazoProfileUrl\}/);
  });

  it("application CTA hidden when gate enabled and unlinked", () => {
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /shouldBlockArticleApply/);
    assert.match(detail, /BILDAZO_AUTHOR_LINK_REQUIRED/);
    assert.match(detail, /إكمال طلب ربط حساب الكاتب في Bildazo/);
  });

  it("existing article list still renders beside the gate", () => {
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(list, /listPublishedMarketplaceArticlesRequest/);
    assert.match(list, /articles\.map/);
  });

  it("terms version is stored as a constant", () => {
    assert.equal(ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION, "2026-08-18-v1");
  });
});
