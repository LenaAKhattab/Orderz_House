/**
 * Admin Pantry min-required-bids UI copy (source scan).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const page = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "AdminPantryPage.jsx"), "utf8");

describe("AdminPantryPage min required bids copy", () => {
  it("shows pantry warning and acknowledgement checkbox", () => {
    assert.match(page, /العدد الذي تحدده يمثل الحد الأدنى المطلوب لإتمام المناقصة/);
    assert.match(page, /أقر بأن العدد المحدد يمثل الحد الأدنى المطلوب لإتمام مناقصة بيت المونة/);
    assert.match(page, /minRequiredBidsAcknowledged/);
    assert.match(page, /requiredBidCount/);
  });

  it("shows progress and threshold labels via shared formatter", () => {
    assert.match(page, /formatArticleBidCollectionLabel/);
    assert.match(page, /canSelectArticleApplicant/);
  });

  it("shows relist copy only as admin action after minimum_not_met", () => {
    assert.match(page, /إعادة طرح المناقصة/);
    assert.match(page, /سيتم فتح جولة جديدة لطلب بيت المونة بنفس البيانات/);
    assert.match(page, /canRelistBidCollection/);
  });

  it("shows fair ranking section for admin only after threshold copy is present", () => {
    assert.match(page, /ترتيب التوزيع العادل/);
    assert.match(page, /ARTICLE_FAIR_RANKING_PENDING_AR/);
    assert.match(page, /تأكيد الإدارة/);
    assert.match(page, /FairSelectionOverrideDialog/);
    assert.match(page, /overrideReason/);
    assert.match(page, /isRecommendedPantryBid/);
    assert.doesNotMatch(page, /Navigate to="\/dashboard\/freelancer\/orders"/);
  });
});
