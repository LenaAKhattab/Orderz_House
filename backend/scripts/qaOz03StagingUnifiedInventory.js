/**
 * Controlled OZ03 Staging QA — one dummy marketplace_articles draft + release.
 * Usage: node scripts/qaOz03StagingUnifiedInventory.js
 *
 * Strict: loads .env.staging only; refuses Production; no Bildazo publish; no payments.
 */
"use strict";

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
  assertDatabaseWritable,
  collectStagingQaWarnings,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();

// Force pool to staging URL after env load (db.js may have cached nothing yet if required after).
delete require.cache[require.resolve("../src/config/db")];
const { pool } = require("../src/config/db");

const articles = require("../src/services/marketplaceArticlesService");
const oz03 = require("../src/services/marketplaceArticleUnifiedReleaseService");
const articleOps = require("../src/services/freelancerActivationArticleOpsService");
const campaignService = require("../src/services/freelancerActivationCampaignService");
const { fetchBildazoLeafCategories } = require("../src/services/bildazoCategoriesClient");
const { isBildazoLeafCategoryId } = require("../src/config/bildazoArticlePublish");
const { millisToJodString } = require("../src/utils/marketplaceBidPoolMoney");

const QA_TITLE = "OZ03 QA Unified Inventory - DO NOT PUBLISH TO BILDAZO";

function report(obj) {
  // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.warn("Bildazo categories fetch failed; falling back to DB snapshot.", err?.message || err);
  }
  const { rows } = await pool.query(
    `SELECT bildazo_category_id, bildazo_category_name, bildazo_category_slug, bildazo_category_path
       FROM marketplace_articles
      WHERE bildazo_category_id IS NOT NULL
      ORDER BY id DESC
      LIMIT 1`,
  );
  if (!rows[0]) {
    throw new Error("No Bildazo leaf available on Staging for QA.");
  }
  return {
    bildazoCategoryId: String(rows[0].bildazo_category_id),
    bildazoCategoryName: rows[0].bildazo_category_name || "QA leaf",
    bildazoCategorySlug: rows[0].bildazo_category_slug || null,
    bildazoCategoryPath: rows[0].bildazo_category_path || null,
  };
}

async function main() {
  printStagingBanner(target);
  const warnings = collectStagingQaWarnings();
  if (warnings.length) {
    // eslint-disable-next-line no-console
    console.log("Warnings:\n" + warnings.map((w) => `  - ${w}`).join("\n"));
  }

  await assertDatabaseWritable();
  const mig = await countPendingMigrations();
  if (mig.pendingCount !== 0) {
    throw new Error(`BLOCKED: pending migrations=${mig.pendingCount}`);
  }

  // Health check against Staging DB connectivity (not Production npm start).
  const { rows: healthPing } = await pool.query("SELECT 1 AS ok");
  if (Number(healthPing[0]?.ok) !== 1) throw new Error("Staging DB health ping failed");

  const campaignId = await campaignService.resolveArticleOperationsCampaignId(null, {
    actorUserId: null,
  });

  const fundBefore = await articleOps.getArticleFundSummary({ campaignId });
  const balanceBefore = String(fundBefore?.currentBalanceJod ?? fundBefore?.balanceJod ?? "0");
  const balanceBeforeMillis = articleOps.parseMoney(balanceBefore, "fund before");

  const leaf = await pickBildazoLeaf();
  const draftCountBefore = await oz03.countDraftInventoryArticles();

  // Ensure enough fund for one STARTER article release (controlled QA top-up only).
  const createdProbeValue = "1.000";
  const needMillis = articleOps.parseMoney(createdProbeValue, "qa article value");
  let topUpJod = null;
  if (balanceBeforeMillis < needMillis) {
    topUpJod = millisToJodString(needMillis - balanceBeforeMillis + 1000); // +1.000 buffer
    await articleOps.addArticleFundDeposit({
      campaignId,
      amountJod: topUpJod,
      reason: "oz03_qa_fund_topup",
      actorUserId: null,
    });
  }

  // Reuse existing draft from prior failed run if present; else create.
  let created;
  const { rows: existingQa } = await pool.query(
    `SELECT id FROM marketplace_articles
      WHERE title = $1 AND status = 'draft'
      ORDER BY id DESC LIMIT 1`,
    [QA_TITLE],
  );
  if (existingQa[0]) {
    created = await articles.getMarketplaceArticleById(existingQa[0].id, { forAdmin: true });
  } else {
    created = await articles.createMarketplaceArticle(
      {
        title: QA_TITLE,
        description:
          "OZ03 Staging QA only. Do NOT publish to Bildazo. Safe dummy inventory article for unified release engine.",
        targetPlanCode: "STARTER",
        writingMode: "either",
        status: "draft",
        isFakeOrTraining: false,
        requiredBidCount: 10,
        minRequiredBidsAcknowledged: true,
        requireBildazoInventory: true,
        ...leaf,
      },
      { actorUserId: null },
    );
  }

  const articleId = Number(created.id);
  const { rows: rowAfterCreate } = await pool.query(
    `SELECT id, status, title, description, writing_mode, activation_plan_tier_code,
            article_level, required_word_count, required_references_count,
            bildazo_category_id, bildazo_category_name, article_value_jod
       FROM marketplace_articles WHERE id = $1`,
    [articleId],
  );
  const row = rowAfterCreate[0];

  const { rows: invHits } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM freelancer_activation_article_inventory_items
      WHERE title = $1`,
    [QA_TITLE],
  );

  const publishedBefore = await articles.listPublishedMarketplaceArticles({ limit: 200 });
  const visibleBefore = (publishedBefore || []).some((a) => Number(a.id) === articleId);

  const draftCountAfterCreate = await oz03.countDraftInventoryArticles();

  // Ensure fund covers this article's actual value (campaign-scoped).
  const articleValueMillis = articleOps.parseMoney(row.article_value_jod, "article value");
  const fundMid = await articleOps.getArticleFundSummary({ campaignId });
  const midBal = articleOps.parseMoney(
    String(fundMid?.currentBalanceJod ?? fundMid?.balanceJod ?? "0"),
    "fund mid",
  );
  if (midBal < articleValueMillis) {
    topUpJod = millisToJodString(articleValueMillis - midBal + 1000);
    await articleOps.addArticleFundDeposit({
      campaignId,
      amountJod: topUpJod,
      reason: "oz03_qa_fund_topup",
      actorUserId: null,
    });
  }

  const fundBeforeRelease = await articleOps.getArticleFundSummary({ campaignId });
  const balanceBeforeRelease = String(
    fundBeforeRelease?.currentBalanceJod ?? fundBeforeRelease?.balanceJod ?? "0",
  );

  // 3) Manual release
  const release1 = await oz03.releaseMarketplaceDraftArticle(articleId, {
    campaignId,
    requireBildazo: true,
  });

  const { rows: rowAfterRelease } = await pool.query(
    `SELECT id, status, published_at FROM marketplace_articles WHERE id = $1`,
    [articleId],
  );
  const { rows: dupCheck } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM marketplace_articles WHERE title = $1`,
    [QA_TITLE],
  );

  const { rows: fundEntries } = await pool.query(
    `SELECT id, entry_type, amount_jod, reason, metadata
       FROM freelancer_activation_article_fund_entries
      WHERE entry_type = 'daily_allocation'
        AND (
          metadata->>'marketplaceArticleId' = $1
          OR metadata->>'oz03ArticleId' = $1
        )
      ORDER BY id ASC`,
    [String(articleId)],
  );

  const fundAfter = await articleOps.getArticleFundSummary({ campaignId });
  const balanceAfter = String(fundAfter?.currentBalanceJod ?? fundAfter?.balanceJod ?? "0");

  // Duplicate release
  const release2 = await oz03.releaseMarketplaceDraftArticle(articleId, {
    campaignId,
    requireBildazo: true,
  });

  const { rows: fundEntriesAfterRetry } = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM freelancer_activation_article_fund_entries
      WHERE entry_type = 'daily_allocation'
        AND (
          metadata->>'marketplaceArticleId' = $1
          OR metadata->>'oz03ArticleId' = $1
        )`,
    [String(articleId)],
  );

  const publishedAfter = await articles.listPublishedMarketplaceArticles({ limit: 200 });
  const visibleAfter = (publishedAfter || []).some((a) => Number(a.id) === articleId);

  // 5) Insufficient funding — create probe draft, then attempt release with skipFundCheck=false
  // after temporary campaign-scoped drain via withdraw in a nested TX that we roll back.
  // Safer than huge ledger inserts: withdraw available balance in TX, attempt release, ROLLBACK.
  let insufficient = { ok: false };
  {
    const probe = await articles.createMarketplaceArticle(
      {
        title: `${QA_TITLE} (insufficient-fund probe)`,
        description: "OZ03 Staging QA insufficient-fund probe.",
        targetPlanCode: "STARTER",
        writingMode: "either",
        status: "draft",
        requiredBidCount: 10,
        minRequiredBidsAcknowledged: true,
        requireBildazoInventory: true,
        ...leaf,
      },
      { actorUserId: null },
    );
    const probeId = Number(probe.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bal = await articleOps.computeFundBalanceMillis(client, { campaignId });
      if (bal > 0) {
        await client.query(
          `INSERT INTO freelancer_activation_article_fund_entries
             (campaign_id, entry_type, amount_jod, reason, metadata)
           VALUES ($1, 'fund_withdrawal', $2::numeric, 'oz03_qa_temp_withdraw', $3::jsonb)`,
          [
            campaignId,
            millisToJodString(bal),
            JSON.stringify({ oz03QaTemp: true }),
          ],
        );
      }
      let failed = false;
      let errCode = null;
      try {
        await oz03.releaseMarketplaceDraftArticle(probeId, {
          campaignId,
          client,
          requireBildazo: true,
        });
      } catch (err) {
        failed = true;
        errCode = err?.publicCode || err?.code || null;
      }
      const { rows: probeStatus } = await client.query(
        `SELECT status FROM marketplace_articles WHERE id = $1`,
        [probeId],
      );
      const { rows: probeFund } = await client.query(
        `SELECT COUNT(*)::int AS c FROM freelancer_activation_article_fund_entries
          WHERE metadata->>'marketplaceArticleId' = $1`,
        [String(probeId)],
      );
      await client.query("ROLLBACK");
      await pool.query(
        `UPDATE marketplace_articles SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'draft'`,
        [probeId],
      );
      insufficient = {
        ok: failed && errCode === "ACTIVATION_ARTICLE_FUND_INSUFFICIENT",
        failed,
        errCode,
        probeId,
        statusAfterAttempt: probeStatus[0]?.status || null,
        fundDeductForProbe: Number(probeFund[0]?.c) || 0,
        note: "Withdrew full campaign balance inside TX then ROLLBACK; probe cancelled.",
      };
    } finally {
      client.release();
    }
  }

  // 6) Empty inventory for ELITE (no drafts expected for that tier from this QA)
  const emptyPreview = await oz03.previewMarketplaceInventoryRelease({
    campaignId,
    planTierCode: "elite",
    includeManualMode: true,
  });
  const elitePlan = (emptyPreview.plans || []).find(
    (p) => String(p.planTierCode).toLowerCase() === "elite",
  );

  // Soft archive main QA article (keep id for report) — use cancelled if no archive status
  await pool.query(
    `UPDATE marketplace_articles
        SET status = 'closed', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
      WHERE id = $1 AND status = 'published'`,
    [articleId],
  );
  const { rows: finalRow } = await pool.query(
    `SELECT id, status FROM marketplace_articles WHERE id = $1`,
    [articleId],
  );

  report({
    status: "OZ03_STAGING_QA_RESULT",
    environment: {
      APP_ENV: target.appEnv,
      dbHostMasked: target.maskedTarget,
      pendingMigrations: mig.pendingCount,
      appliedMigrations: mig.appliedCount,
      stagingDbPing: "ok",
      note: "Local npm start on :5000 may still point at Production — this script used .env.staging only.",
    },
    qaArticle: {
      id: articleId,
      initialStatus: row.status,
      finalStatus: finalRow[0]?.status,
      targetPlan: row.activation_plan_tier_code,
      articleLevel: row.article_level,
      writingMode: row.writing_mode,
      categoryId: row.bildazo_category_id ? "(present)" : null,
      categoryName: row.bildazo_category_name || null,
      words: row.required_word_count,
      references: row.required_references_count,
      valueJod: row.article_value_jod,
    },
    sourceOfTruth: {
      marketplaceArticlesUsed: true,
      activationInventoryRowsForTitle: Number(invHits[0]?.c) || 0,
      duplicateTitleRows: Number(dupCheck[0]?.c) || 0,
      sameIdPublished: Number(rowAfterRelease[0]?.id) === articleId && rowAfterRelease[0]?.status === "published",
    },
    beforeRelease: {
      visibleToFreelancers: visibleBefore,
      draftCountBefore,
      draftCountAfterCreate,
      kpiIncreased: draftCountAfterCreate === draftCountBefore + 1,
    },
    funding: {
      before: balanceBefore,
      beforeRelease: balanceBeforeRelease,
      topUpJod: topUpJod,
      afterRelease: balanceAfter,
      deductionEntries: fundEntries.map((e) => ({
        id: Number(e.id),
        amountJod: String(e.amount_jod),
        reason: e.reason,
        hasMarketplaceArticleId: Boolean(e.metadata?.marketplaceArticleId || e.metadata?.oz03ArticleId),
      })),
      retryIdempotent: Boolean(release2.idempotent || release2.alreadyPublished),
      fundEntryCountAfterRetry: Number(fundEntriesAfterRetry[0]?.c) || 0,
      doubleDeducted: Number(fundEntriesAfterRetry[0]?.c) > 1,
      release1FundDeducted: Boolean(release1.fundDeducted),
    },
    visibility: {
      hiddenBeforeRelease: !visibleBefore,
      visibleAfterRelease: visibleAfter,
    },
    emptyInventory: {
      eliteSkipReason: elitePlan?.skipReason || null,
      messageAr: elitePlan?.messageAr || emptyPreview.messageAr || null,
      plannedTotal: emptyPreview.plannedTotal,
    },
    insufficientFunding: insufficient,
    bildazoSafety: {
      publishEndpointCalled: false,
      note: "Release path does not call Bildazo publish; approve/finalize was not invoked.",
    },
    cleanup: {
      action: "closed published QA article; cancelled insufficient-fund probe if draft",
      mainArticleId: articleId,
      mainFinalStatus: finalRow[0]?.status,
    },
  });
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("OZ03_STAGING_QA_FAILED", err?.publicCode || err?.code || "", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
