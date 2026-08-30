/**
 * Controlled OZ05 Staging QA — bid settings + release + minimum_not_met refund loop.
 *
 * Usage:
 *   node scripts/qaOz05StagingBidSettings.js --execute
 *   node scripts/qaOz05StagingBidSettings.js --dry-run
 *
 * Strict: loads .env.staging only; refuses Production; no Bildazo publish; no payments;
 * no migrations; no seed.
 */
"use strict";

/* eslint-disable no-console */

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
  assertDatabaseWritable,
  collectStagingQaWarnings,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");

const QA_TITLE = "OZ05 QA Bid Settings - DO NOT PUBLISH TO BILDAZO";
const QA_DURATION_HOURS = 1; // shortest allowed (1–168)
const QA_REQUIRED_BIDS = 2;

const args = process.argv.slice(2);
const wantExecute = args.includes("--execute");
const wantDryRun = args.includes("--dry-run") || !wantExecute;

if (wantDryRun && !wantExecute) {
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        note: "Pass --execute for real Staging QA.",
        plan: {
          title: QA_TITLE,
          requiredBidCount: QA_REQUIRED_BIDS,
          bidCollectionDurationHours: QA_DURATION_HOURS,
          steps: [
            "preflight staging",
            "create draft with bid settings",
            "release → published + fund deduct + round snapshot",
            "force deadline past → minimum_not_met → refund + draft",
            "repeat close → no double refund",
            "re-release same id → deduct again",
            "cleanup close/cancel",
          ],
        },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();

delete require.cache[require.resolve("../src/config/db")];
const { pool } = require("../src/config/db");

const articles = require("../src/services/marketplaceArticlesService");
const oz03 = require("../src/services/marketplaceArticleUnifiedReleaseService");
const oz05 = require("../src/utils/marketplaceArticleOz05BidSettings");
const articleOps = require("../src/services/freelancerActivationArticleOpsService");
const campaignService = require("../src/services/freelancerActivationCampaignService");
const opportunityBidCollection = require("../src/services/opportunityBidCollectionService");
const { fetchBildazoLeafCategories } = require("../src/services/bildazoCategoriesClient");
const { isBildazoLeafCategoryId } = require("../src/config/bildazoArticlePublish");
const { millisToJodString } = require("../src/utils/marketplaceBidPoolMoney");

function report(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

async function pickBildazoLeaf() {
  try {
    const res = await fetchBildazoLeafCategories();
    const items = Array.isArray(res) ? res : res?.items || [];
    const leaf = items.find((c) => isBildazoLeafCategoryId(c.id));
    if (leaf) {
      return {
        bildazoCategoryId: String(leaf.id),
        bildazoCategoryName: leaf.name || leaf.title || "QA leaf",
        bildazoCategorySlug: leaf.slug || null,
        bildazoCategoryPath: leaf.path || leaf.name || null,
      };
    }
  } catch (err) {
    console.warn("Bildazo categories fetch failed; falling back to DB snapshot.", err?.message || err);
  }
  const { rows } = await pool.query(
    `SELECT bildazo_category_id, bildazo_category_name, bildazo_category_slug, bildazo_category_path
       FROM marketplace_articles
      WHERE bildazo_category_id IS NOT NULL
      ORDER BY id DESC
      LIMIT 1`,
  );
  if (!rows[0]) throw new Error("No Bildazo leaf available on Staging for QA.");
  return {
    bildazoCategoryId: String(rows[0].bildazo_category_id),
    bildazoCategoryName: rows[0].bildazo_category_name || "QA leaf",
    bildazoCategorySlug: rows[0].bildazo_category_slug || null,
    bildazoCategoryPath: rows[0].bildazo_category_path || null,
  };
}

async function countRowsByTitle(title) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM marketplace_articles WHERE title = $1`,
    [title],
  );
  return Number(rows[0]?.c) || 0;
}

async function countActivationInventoryByTitle(title) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM freelancer_activation_article_inventory_items WHERE title = $1`,
      [title],
    );
    return Number(rows[0]?.c) || 0;
  } catch (err) {
    if (err?.code === "42P01") return 0;
    throw err;
  }
}

async function listFundAllocations(articleId) {
  const { rows } = await pool.query(
    `SELECT id, entry_type, amount_jod, reason, metadata, created_at
       FROM freelancer_activation_article_fund_entries
      WHERE entry_type = 'daily_allocation'
        AND (
          metadata->>'marketplaceArticleId' = $1
          OR metadata->>'oz03ArticleId' = $1
        )
      ORDER BY id ASC`,
    [String(articleId)],
  );
  return rows;
}

async function listFundRefunds(articleId) {
  const { rows } = await pool.query(
    `SELECT id, entry_type, amount_jod, reason, metadata, created_at
       FROM freelancer_activation_article_fund_entries
      WHERE entry_type = 'daily_allocation_released'
        AND (
          metadata->>'marketplaceArticleId' = $1
          OR metadata->>'oz03ArticleId' = $1
        )
        AND COALESCE(metadata->>'reason', reason, '') LIKE '%minimum_not_met%'
      ORDER BY id ASC`,
    [String(articleId)],
  );
  return rows;
}

async function loadRoundForArticle(articleId) {
  const { rows } = await pool.query(
    `SELECT a.id AS article_id, a.status, a.required_bid_count, a.application_deadline_at,
            a.current_bid_collection_round_id, a.keywords,
            r.id AS round_id, r.required_bid_count AS round_required,
            r.bid_collection_status, r.bid_collection_deadline_at, r.round_number
       FROM marketplace_articles a
       LEFT JOIN opportunity_bid_collection_rounds r
         ON r.id = a.current_bid_collection_round_id
      WHERE a.id = $1`,
    [articleId],
  );
  return rows[0] || null;
}

async function main() {
  printStagingBanner(target);
  const warnings = collectStagingQaWarnings();
  if (warnings.length) {
    console.log("Warnings:\n" + warnings.map((w) => `  - ${w}`).join("\n"));
  }

  await assertDatabaseWritable();
  const mig = await countPendingMigrations();
  if (mig.pendingCount !== 0) {
    throw new Error(`BLOCKED: pending migrations=${mig.pendingCount}`);
  }

  const { rows: healthPing } = await pool.query("SELECT 1 AS ok");
  if (Number(healthPing[0]?.ok) !== 1) throw new Error("Staging DB health ping failed");

  const campaignId = await campaignService.resolveArticleOperationsCampaignId(null, {
    actorUserId: null,
  });

  const leaf = await pickBildazoLeaf();

  // Cancel leftover published/draft QA rows from prior runs (keep history, free title reuse).
  await pool.query(
    `UPDATE marketplace_articles
        SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
      WHERE title = $1 AND status IN ('draft', 'published', 'closed')`,
    [QA_TITLE],
  );

  const created = await articles.createMarketplaceArticle(
    {
      title: QA_TITLE,
      description:
        "OZ05 Staging QA only. Do NOT publish to Bildazo. Bid settings + minimum_not_met refund loop.",
      targetPlanCode: "STARTER",
      writingMode: "either",
      status: "draft",
      isFakeOrTraining: false,
      requiredBidCount: QA_REQUIRED_BIDS,
      bidCollectionDurationHours: QA_DURATION_HOURS,
      minRequiredBidsAcknowledged: true,
      requireBildazoInventory: true,
      ...leaf,
    },
    { actorUserId: null },
  );

  const articleId = Number(created.id);
  const { rows: draftRows } = await pool.query(
    `SELECT id, status, required_bid_count, required_word_count, required_references_count,
            activation_plan_tier_code, article_level, writing_mode, keywords, article_value_jod,
            publication_status, bildazo_category_id
       FROM marketplace_articles WHERE id = $1`,
    [articleId],
  );
  const draft = draftRows[0];
  const durationStored = oz05.readBidCollectionDurationHours(draft.keywords);
  const activationInvCount = await countActivationInventoryByTitle(QA_TITLE);
  const titleCountAfterCreate = await countRowsByTitle(QA_TITLE);

  const publishedBefore = await articles.listPublishedMarketplaceArticles({ limit: 300 });
  const visibleBefore = (publishedBefore || []).some((a) => Number(a.id) === articleId);

  // Ensure fund
  const articleValueMillis = articleOps.parseMoney(draft.article_value_jod || "1.000", "article value");
  const fundBefore = await articleOps.getArticleFundSummary({ campaignId });
  let balBefore = articleOps.parseMoney(
    String(fundBefore?.currentBalanceJod ?? "0"),
    "fund before",
  );
  // Need enough for two releases (release + re-release).
  const need = articleValueMillis * 2 + 1000;
  if (balBefore < need) {
    await articleOps.addArticleFundDeposit({
      campaignId,
      amountJod: millisToJodString(need - balBefore),
      reason: "oz05_qa_fund_topup",
      actorUserId: null,
    });
  }
  const fundBeforeRelease = await articleOps.getArticleFundSummary({ campaignId });
  const balanceBeforeRelease = String(fundBeforeRelease?.currentBalanceJod ?? "0");

  const release1 = await oz03.releaseMarketplaceDraftArticle(articleId, {
    campaignId,
    requireBildazo: true,
  });

  const afterRelease = await loadRoundForArticle(articleId);
  const titleCountAfterRelease = await countRowsByTitle(QA_TITLE);
  const allocationsAfterRelease = await listFundAllocations(articleId);
  const publishedAfter = await articles.listPublishedMarketplaceArticles({ limit: 300 });
  const visibleAfter = (publishedAfter || []).some((a) => Number(a.id) === articleId);

  const deadlineAt = afterRelease?.bid_collection_deadline_at
    ? new Date(afterRelease.bid_collection_deadline_at)
    : null;
  const publishedAt = release1?.article?.publishedAt
    ? new Date(release1.article.publishedAt)
    : new Date();
  const deadlineDeltaHours =
    deadlineAt && !Number.isNaN(deadlineAt.getTime())
      ? (deadlineAt.getTime() - publishedAt.getTime()) / 3600000
      : null;
  const deadlineMatchesDuration =
    deadlineDeltaHours != null &&
    Math.abs(deadlineDeltaHours - QA_DURATION_HOURS) < 0.15;

  // Force minimum_not_met for this QA article only: backdate round deadline.
  if (!afterRelease?.round_id) {
    throw new Error("No bid collection round after release — cannot run minimum_not_met QA.");
  }
  await pool.query(
    `UPDATE opportunity_bid_collection_rounds
        SET bid_collection_deadline_at = NOW() - INTERVAL '2 minutes',
            updated_at = NOW()
      WHERE id = $1`,
    [afterRelease.round_id],
  );

  const client = await pool.connect();
  let close1;
  try {
    await client.query("BEGIN");
    const { rows: roundRows } = await client.query(
      `SELECT * FROM opportunity_bid_collection_rounds WHERE id = $1 FOR UPDATE`,
      [afterRelease.round_id],
    );
    close1 = await opportunityBidCollection.closeArticleRoundMinimumNotMet(client, roundRows[0], {
      now: new Date(),
    });
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }

  const afterMinNotMet = await loadRoundForArticle(articleId);
  const refundsAfterClose = await listFundRefunds(articleId);
  const publishedAfterClose = await articles.listPublishedMarketplaceArticles({ limit: 300 });
  const visibleAfterClose = (publishedAfterClose || []).some((a) => Number(a.id) === articleId);

  // Repeated close — should not double-refund
  const client2 = await pool.connect();
  let close2;
  try {
    await client2.query("BEGIN");
    const { rows: roundRows2 } = await client2.query(
      `SELECT * FROM opportunity_bid_collection_rounds WHERE id = $1 FOR UPDATE`,
      [afterRelease.round_id],
    );
    close2 = await opportunityBidCollection.closeArticleRoundMinimumNotMet(client2, roundRows2[0], {
      now: new Date(),
    });
    await client2.query("COMMIT");
  } catch (err) {
    try {
      await client2.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    // Expected: round already minimum_not_met → skipped
    close2 = { skipped: true, error: err?.message || String(err) };
  } finally {
    client2.release();
  }
  const refundsAfterRepeat = await listFundRefunds(articleId);

  const fundAfterRefund = await articleOps.getArticleFundSummary({ campaignId });
  const balanceAfterRefund = String(fundAfterRefund?.currentBalanceJod ?? "0");

  // Re-release same article
  const release2 = await oz03.releaseMarketplaceDraftArticle(articleId, {
    campaignId,
    requireBildazo: true,
  });
  const afterRerelease = await loadRoundForArticle(articleId);
  const allocationsAfterRerelease = await listFundAllocations(articleId);
  const titleCountAfterRerelease = await countRowsByTitle(QA_TITLE);
  const publishedAfterRerelease = await articles.listPublishedMarketplaceArticles({ limit: 300 });
  const visibleAfterRerelease = (publishedAfterRerelease || []).some(
    (a) => Number(a.id) === articleId,
  );

  // Cleanup — close QA article (no Bildazo)
  await pool.query(
    `UPDATE marketplace_articles
        SET status = 'closed', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
      WHERE id = $1 AND status = 'published'`,
    [articleId],
  );
  const { rows: finalRows } = await pool.query(
    `SELECT id, status FROM marketplace_articles WHERE id = $1`,
    [articleId],
  );

  const checks = {
    draftCreated:
      draft?.status === "draft" &&
      Number(draft.required_bid_count) === QA_REQUIRED_BIDS &&
      durationStored === QA_DURATION_HOURS,
    noActivationInventory: activationInvCount === 0,
    releaseSameId: afterRelease?.status === "published" && Number(afterRelease.article_id) === articleId,
    noDuplicateRow:
      titleCountAfterCreate <= 1 &&
      titleCountAfterRelease <= 1 &&
      titleCountAfterRerelease <= 1,
    fundDeductedOnceOnFirstRelease: allocationsAfterRelease.length === 1,
    fundMetaHasArticleId: Boolean(
      allocationsAfterRelease[0]?.metadata?.marketplaceArticleId ||
        allocationsAfterRelease[0]?.metadata?.oz03ArticleId,
    ),
    roundRequiredIs2: Number(afterRelease?.round_required) === QA_REQUIRED_BIDS,
    deadlineUsesDuration: Boolean(deadlineMatchesDuration),
    minNotMetToDraft: afterMinNotMet?.status === "draft",
    fundRefundedOnce: refundsAfterClose.length === 1,
    noDoubleRefund: refundsAfterRepeat.length === 1,
    rereleaseSameId: afterRerelease?.status === "published",
    fundDeductedAgain: allocationsAfterRerelease.length === 2,
    visibility: {
      beforeRelease: !visibleBefore,
      afterRelease: visibleAfter,
      afterMinNotMet: !visibleAfterClose,
      afterRerelease: visibleAfterRerelease,
    },
    noBildazoPublish:
      String(draft.publication_status || "not_applicable") !== "published" &&
      !release1?.bildazoPublished &&
      !release2?.bildazoPublished,
  };

  const allPass = Object.entries(checks).every(([k, v]) => {
    if (k === "visibility") {
      return v.beforeRelease && v.afterRelease && v.afterMinNotMet && v.afterRerelease;
    }
    return v === true;
  });

  report({
    status: allPass ? "OZ05_STAGING_QA_PASS" : "OZ05_STAGING_QA_PARTIAL",
    environment: {
      APP_ENV: target.appEnv,
      dbHostMasked: String(target.maskedTarget || "").replace(/^([^.]+)\./, "$1…"),
      pendingMigrations: mig.pendingCount,
      appliedMigrations: mig.appliedCount,
      stagingDbPing: "ok",
      note: "Script used backend/.env.staging only — not Production npm start.",
    },
    qaArticle: {
      id: articleId,
      title: QA_TITLE,
      targetPlan: draft.activation_plan_tier_code || "starter",
      words: draft.required_word_count,
      references: draft.required_references_count,
      requiredBidCount: Number(draft.required_bid_count),
      bidCollectionDurationHours: durationStored,
      finalStatus: finalRows[0]?.status || null,
    },
    release: {
      sameIdDraftToPublished: checks.releaseSameId,
      duplicateRow: !checks.noDuplicateRow,
      oldActivationInventoryUsed: !checks.noActivationInventory,
      fundDeductedOnce: checks.fundDeductedOnceOnFirstRelease,
      fundEntryId: allocationsAfterRelease[0]?.id || null,
      balanceBeforeRelease,
      balanceAfterRefund,
      releaseIdempotentRetryNote: release1?.idempotent || release1?.alreadyPublished || null,
    },
    round: {
      roundId: afterRelease?.round_id || null,
      requiredApplicants: afterRelease?.round_required ?? null,
      requiredIs2: checks.roundRequiredIs2,
      deadlineAt: afterRelease?.bid_collection_deadline_at || null,
      deadlineDeltaHours: deadlineDeltaHours != null ? Number(deadlineDeltaHours.toFixed(3)) : null,
      deadlineUsesSelectedDuration: checks.deadlineUsesDuration,
    },
    minimumNotMet: {
      closeStatus: close1?.status || null,
      articleRecycled: Boolean(close1?.articleRecycled || close1?.oz04?.recycled),
      articleStatusAfter: afterMinNotMet?.status || null,
      returnedToDraft: checks.minNotMetToDraft,
      refundCount: refundsAfterClose.length,
      refundedOnce: checks.fundRefundedOnce,
      refundReason: refundsAfterClose[0]?.metadata?.reason || refundsAfterClose[0]?.reason || null,
      refundMetaArticleId:
        refundsAfterClose[0]?.metadata?.marketplaceArticleId ||
        refundsAfterClose[0]?.metadata?.oz03ArticleId ||
        null,
      repeatClose: {
        skipped: Boolean(close2?.skipped),
        refundCountAfter: refundsAfterRepeat.length,
        noDoubleRefund: checks.noDoubleRefund,
      },
    },
    rerelease: {
      sameIdPublishedAgain: checks.rereleaseSameId,
      fundDeductionCount: allocationsAfterRerelease.length,
      fundDeductedAgainOnce: checks.fundDeductedAgain,
      noDuplicateRow: checks.noDuplicateRow,
      newRoundRequired: afterRerelease?.round_required ?? null,
    },
    visibility: checks.visibility,
    checks,
    warnings,
    cleanup: {
      finalStatus: finalRows[0]?.status || null,
      note: "QA article closed after re-release. No Bildazo publish. No payments.",
    },
  });

  if (!allPass) process.exitCode = 2;
}

main()
  .catch((err) => {
    console.error("OZ05_STAGING_QA_FAILED:", err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
