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
  isBildazoAuthorLinked,
  shouldBlockArticleApply,
  validateBildazoAuthorLinkForm,
} from "./constants/bildazoAuthorTerms.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Bildazo author terms helpers", () => {
  it("new-account submit validates required fields, terms, and passwords", () => {
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أحمد", password: "Writer1x", passwordConfirm: "Writer1x" },
        termsChecked: false,
      }),
      "يجب الموافقة على شروط ربط حساب الكاتب.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أ", password: "Writer1x", passwordConfirm: "Writer1x" },
        termsChecked: true,
      }),
      "الاسم الكامل مطلوب لإنشاء حساب الكاتب.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أحمد علي", password: "short", passwordConfirm: "short" },
        termsChecked: true,
      }),
      "كلمة المرور يجب أن تكون 8 أحرف على الأقل وتتضمن حرفًا ورقمًا.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أحمد علي", password: "Writer1x", passwordConfirm: "Other1x" },
        termsChecked: true,
      }),
      "تأكيد كلمة المرور غير مطابق.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.NEW_ACCOUNT,
        payload: { fullName: "أحمد علي", password: "Writer1x", passwordConfirm: "Writer1x" },
        termsChecked: true,
      }),
      null,
    );
  });

  it("existing-account tab requires email and password", () => {
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT,
        payload: {},
        termsChecked: true,
      }),
      "أدخل بريد حساب Bildazo وكلمة المرور.",
    );
    assert.equal(
      validateBildazoAuthorLinkForm({
        flow: BILDAZO_AUTHOR_LINK_FLOWS.EXISTING_ACCOUNT,
        payload: { existingBildazoEmail: "a@b.com", password: "Writer1x" },
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

  it("new-account tab is a branded compact signup-style form", () => {
    const card = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.match(card, /حساب الكاتب في Bildazo/);
    assert.match(card, /bildazo-logo\.png/);
    assert.match(card, /data-testid="bildazo-logo"/);
    assert.match(card, /البريد الإلكتروني/);
    assert.match(card, /readOnly/);
    assert.match(card, /data-testid="bildazo-orderz-email"/);
    assert.match(card, /BILDAZO_WRITER_ROLE_LABEL_AR/);
    assert.match(card, /data-testid="bildazo-new-password"/);
    assert.match(card, /data-testid="bildazo-new-password-confirm"/);
    assert.match(card, /إنشاء وربط حساب الكاتب/);
    assert.doesNotMatch(card, /BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET/);
  });

  it("existing-account tab uses email and password only", () => {
    const card = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.match(card, /type=["']password["']/);
    assert.match(card, /data-testid="bildazo-existing-password"/);
    assert.match(card, /لدي حساب في Bildazo/);
    assert.match(card, /ربط حساب Bildazo الحالي/);
    assert.doesNotMatch(card, /الرقم العام في Bildazo/);
    assert.doesNotMatch(card, /BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET/);
  });

  it("pending, review, failed, and linked states render", () => {
    const card = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.match(card, /جاري إنشاء حساب الكاتب في Bildazo/);
    assert.match(card, /يحتاج طلب الربط إلى مراجعة من الإدارة/);
    assert.match(card, /تعذر إكمال الربط مع Bildazo/);
    assert.match(card, /تم ربط حساب الكاتب في Bildazo بنجاح/);
    assert.match(card, /متابعة إلى فرص المقالات/);
    assert.match(card, /bildazo-pending-state/);
    assert.match(card, /bildazo-review-state/);
    assert.match(card, /bildazo-failed-state/);
    assert.match(card, /data-testid="bildazo-linked-profile"/);
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
    assert.match(list, /id="article-opportunities"/);
  });

  it("terms version is stored as a constant", () => {
    assert.equal(ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION, "2026-08-18-v1");
  });
});
